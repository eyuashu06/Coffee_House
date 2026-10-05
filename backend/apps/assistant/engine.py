"""
Coffee House RAG assistant engine.

Flow: question -> language/intent detection -> database retrieval ->
grounded bilingual answer. The optional LLM step only rewrites wording; every
fact in the reply comes from the database.
"""

import logging
import re

from . import responder
from .retriever import (
    detect_intent,
    detect_language,
    find_menu_items,
    is_out_of_scope,
    product_reference_tokens,
)

logger = logging.getLogger(__name__)

# Short-term conversation memory: last resolved topic + collected reservation data.
MAX_TURNS = 6


class Session:
    def __init__(self, session_id=None):
        self.session_id = session_id
        self.turns = []
        self.reservation_state = {}
        self.in_reservation_flow = False
        self.last_items = []
        self.last_intent = None

    def remember(self, query, intent, items=None):
        self.turns.append({'q': query, 'intent': intent})
        self.turns = self.turns[-MAX_TURNS:]
        if items:
            self.last_items = [i.id for i in items]

    def recent_queries(self, exclude_current=True):
        return [t['q'] for t in self.turns[:-1]] if exclude_current else [t['q'] for t in self.turns]


_SESSIONS = {}


def get_session(session_id=None):
    if not session_id:
        return Session()
    if session_id not in _SESSIONS:
        _SESSIONS[session_id] = Session(session_id)
    session = _SESSIONS[session_id]
    # keep memory bounded
    if len(_SESSIONS) > 500:
        for key in list(_SESSIONS)[:100]:
            _SESSIONS.pop(key, None)
    return session


def _strip_markup(text):
    """Split the combined bilingual answer into its two halves."""
    if not text:
        return '', ''
    en, _, am = text.partition(responder.AM_HEADER)
    en = en.replace(responder.EN_HEADER, '').strip()
    am = am.strip()
    return en, am


def _format_price(amount):
    return f"{float(amount):,.2f} ETB".replace('.00', '')


def _looks_like_booking(fields):
    """
    Decide whether extracted fields are unmistakably a table booking.

    Requires a date or time plus a party size or a name: two independent signals
    together. Any single one on its own is far too weak - "9" alone is a guest
    count in one sentence and an hour in the next, and "today" alone is just
    someone asking about opening hours.
    """
    has_when = bool(fields.get('date') or fields.get('time'))
    has_who = bool(fields.get('guests') or fields.get('name'))
    return has_when and has_who


# ── Optional LLM polish (never adds facts) ───────────────────────────

def _llm_polish(question, en_answer, am_answer):
    """
    Only rewrites an already-grounded answer for readability. Returns
    (en, am) unchanged if no key is configured or the call fails.
    """
    from django.conf import settings

    if not getattr(settings, 'ASSISTANT_USE_LLM', False):
        return en_answer, am_answer
    api_key = getattr(settings, 'GEMINI_API_KEY', '')
    if not api_key:
        return en_answer, am_answer

    try:
        from google import genai

        client = genai.Client(api_key=api_key)
        prompt = (
            "Rewrite the two answers below so they sound friendly and natural. "
            "Do NOT add, remove or change any fact, price, name or number. "
            "Keep English and Amharic equivalent. "
            "Return JSON with keys 'en' and 'am'.\n\n"
            f"Customer question: {question}\n\nEnglish answer:\n{en_answer}\n\nAmharic answer:\n{am_answer}"
        )
        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        text = getattr(response, 'text', '') or ''
        match = re.search(r'\{.*\}', text, re.S)
        if not match:
            return en_answer, am_answer
        import json
        data = json.loads(match.group(0))
        return data.get('en') or en_answer, data.get('am') or am_answer
    except Exception:
        logger.exception('LLM polish failed; using deterministic answer')
        return en_answer, am_answer


# ── Public API ───────────────────────────────────────────────────────

QUICK_ACTIONS = [
    {'id': 'menu', 'label_en': 'View Menu', 'label_am': 'ሜኑ ይመልከቱ', 'icon': '☕', 'query_en': 'Show me the menu', 'query_am': 'ሜኑውን አሳይኝ'},
    {'id': 'food', 'label_en': 'Food', 'label_am': 'ምግብ', 'icon': '🍰', 'query_en': 'What food do you have?', 'query_am': 'ምን አይነት ምግብ አላችሁ?'},
    {'id': 'drinks', 'label_en': 'Drinks', 'label_am': 'መጠጦች', 'icon': '🥤', 'query_en': 'What drinks are available?', 'query_am': 'ምን አይነት መጠጥ አላችሁ?'},
    {'id': 'reservation', 'label_en': 'Make Reservation', 'label_am': 'ቦታ ማስያዝ', 'icon': '📅', 'query_en': 'I want to reserve a table', 'query_am': 'ቦታ ማስያዝ እፈልጋለሁ'},
    {'id': 'prices', 'label_en': 'Check Prices', 'label_am': 'ዋጋ ይመልከቱ', 'icon': '💰', 'query_en': 'How much is Masala Chai Latte?', 'query_am': 'Masala Chai Latte ዋጋው ስንት ነው?'},
    {'id': 'about', 'label_en': 'About Coffee House', 'label_am': 'ስለ Coffee House', 'icon': 'ℹ️', 'query_en': 'What is this system?', 'query_am': 'ይህ ስርዓት ምንነው?'},
]


def answer_query(query, session_id=None, user=None):
    """
    Main entry point. Returns a dict with the bilingual answer, the items that
    were retrieved, the detected intent and the next action for the UI.
    """
    query = (query or '').strip()
    if not query:
        return {
            'answer': responder.bilingual(
                'Please type your question about our menu, prices or reservations.',
                'እባክዎ ስለ ሜኑ፣ ዋጋ ወይም ቦታ ማስያዣ ጥያቄዎን ይጻፉ።'),
            'answer_en': 'Please type your question about our menu, prices or reservations.',
            'answer_am': 'እባክዎ ስለ ሜኑ፣ ዋጋ ወይም ቦታ ማስያዣ ጥያቄዎን ይጻፉ።',
            'intent': 'empty', 'items': [], 'reservations': [], 'action': {'action': 'none'},
            'language': 'en', 'sources': [],
        }

    session = get_session(session_id)
    language = detect_language(query)

    if is_out_of_scope(query):
        answer, payload, meta = responder._out_of_scope()[0], [], {'action': 'none'}
        session.remember(query, 'out_of_scope')
        return _finalize(query, answer, 'out_of_scope', payload, [], meta, language, session)

    intent, tokens, category = detect_intent(query)

    # A message that already carries booking details is a booking, even when it
    # never says "reserve": "name abebe, date tomorrow at 9 morning, with 10
    # guests". Previously this scored zero reservation keywords, fell through to
    # 'unknown_item', and the customer was told we had no such information.
    if intent in ('unknown', 'unknown_item', 'menu_list'):
        from .retriever import extract_reservation_fields

        fields = extract_reservation_fields(query, {})
        if _looks_like_booking(fields):
            intent = 'reservation_create'

    # An unfinished reservation conversation stays a reservation conversation:
    # "tomorrow at 6 PM for 4 people" must not be treated as a menu question.
    if session.in_reservation_flow and intent in ('unknown', 'price', 'menu_list'):
        # Follow-up inside a reservation conversation: "cancel it", "make it 5 PM"
        low = query.lower()
        if any(w in low for w in ('cancel', 'መሰረዝ', 'ተሰርዝ')):
            intent = 'reservation_cancel'

    if (session.in_reservation_flow or session.reservation_state) and intent not in ('reservation_cancel', 'reservation_status'):
        from .retriever import extract_reservation_fields

        merged = extract_reservation_fields(query, session.reservation_state)
        complete = all(merged.get(f) for f in ('name', 'date', 'time', 'guests'))
        confirmed = any(word in query.lower() for word in
                        ('yes', 'confirm', 'ok', 'okay', 'አዎ', 'እሺ', 'ተረጋግጧል', 'አረጋግጥ'))
        # Stay in the booking flow while anything is still outstanding, even if
        # this particular message added no new fields. A bare "tomorrow" or "9am"
        # adds nothing to the merged state, so requiring `merged != state` dropped
        # the conversation out of the flow and answered "I have no such
        # information" to a customer who was simply being asked one field at a
        # time. Restarting the flow is what produced the endless loop of prompts.
        still_collecting = not complete and bool(merged)
        if merged != session.reservation_state or (complete and confirmed) or still_collecting:
            intent = 'reservation_create'

    # 1) Look for a specific menu item across the WHOLE menu first. A category guess
    #    must never discard an item the customer named explicitly ("Masala Chai Latte").
    items = find_menu_items(query, limit=3)

    # A product name can contain a trigger word ("Reserve Wagyu Smash Burger"), so an
    # explicitly named item always wins over the reservation intents.
    if items and intent in ('reservation_create', 'reservation_cancel', 'reservation_status'):
        named = items[0].name.lower() in query.lower()
        if named:
            low = query.lower()
            if 'available' in low or 'ይገኛል' in low or 'አለ' in low:
                intent = 'availability'
            elif 'ingredient' in low or 'ይዘት' in low:
                intent = 'ingredients'
            else:
                intent = 'price'

    # 2) A browse question ("what burgers do you have?", "ምን አይነት ሻይ አላችሁ?") names a
    # category and no specific product, so the category listing wins even if a generic
    # word happened to match one item. A question about a product we do not stock stays
    # unresolved so the customer is told it isn't available.
    product_refs = product_reference_tokens(query, [i.name for i in items])
    if category and not product_refs and intent in ('unknown', 'price', 'menu_list'):
        intent = 'menu_list'
        items = []
    elif not items and product_refs and intent in ('availability', 'price', 'ingredients', 'menu_list'):
        # The customer named a product ("Is the Sunday Machine available?") and we do
        # not stock it. Never answer with the whole menu or a guess - say we don't have it.
        intent = 'unknown_item'
    elif not items and intent in ('price', 'ingredients', 'availability'):
        # Conversation memory: a short follow-up ("what about its price?") reuses context
        if session.last_items:
            from apps.menu.models import MenuItem
            items = list(MenuItem.objects.filter(id__in=session.last_items[:3]))
        if not items and session.recent_queries():
            previous = ' '.join(session.recent_queries()[-2:])
            items = find_menu_items(f"{previous} {query}", limit=3)
            if items:
                intent = 'price'
    elif items and intent == 'unknown':
        intent = 'price'

    # Reservation intents own the conversation
    if intent == 'reservation_create':
        session.in_reservation_flow = True
        answer, reservations, state, meta = responder.handle_reservation_create(
            query, session.reservation_state, user=user)
        session.reservation_state = state
        if meta.get('action') in ('reservation_created',):
            session.in_reservation_flow = False
        session.remember(query, intent, items)
        return _finalize(query, answer, intent, [], reservations, meta, language, session)

    if intent == 'reservation_cancel':
        answer, reservations, state, meta = responder.handle_reservation_cancel(
            query, session.reservation_state, user=user)
        session.in_reservation_flow = False
        session.reservation_state = {}
        session.remember(query, intent)
        return _finalize(query, answer, intent, [], reservations, meta, language, session)

    if intent == 'reservation_status':
        answer, reservations, state, meta = responder.handle_reservation_status(
            query, session.reservation_state, user=user)
        session.remember(query, intent)
        return _finalize(query, answer, intent, [], reservations, meta, language, session)

    # Menu / venue answers
    answer, payload, meta = responder.build_venue_answer(intent, query, category, items)

    if answer is None:
        kb_answer, _, _ = responder._from_knowledge_base(query)
        if kb_answer:
            answer, payload, meta = kb_answer, [], {'action': 'none'}
            intent = 'knowledge_base'

    if answer is None:
        if intent == 'unknown':
            answer, payload, meta = responder._not_found()[0], [], {'action': 'none'}
            intent = 'unknown_item'
        else:
            # intent said price/availability but nothing matched in the DB
            answer, payload, meta = responder._not_found()[0], [], {'action': 'none'}
            intent = 'unknown_item'

    if items:
        session.last_items = [i.id for i in items]
    session.remember(query, intent, items)

    return _finalize(query, answer, intent, payload, [], meta, language, session)


def _finalize(query, answer, intent, items, reservations, meta, language, session):
    en, am = _strip_markup(answer)
    en, am = _llm_polish(query, en, am)

    combined = responder.bilingual(en, am)
    sources = ['Coffee House menu database', 'Restaurant settings']
    if reservations:
        sources.append('Reservation system')

    return {
        'answer': combined,
        'answer_en': en,
        'answer_am': am,
        'intent': intent,
        'language': language,
        'items': items,
        'reservations': reservations,
        'action': meta or {'action': 'none'},
        'sources': sources,
        'session_id': session.session_id,
    }