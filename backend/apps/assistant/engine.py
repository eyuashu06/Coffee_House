"""
Coffee House RAG assistant engine.

Flow: question -> language/intent detection -> database retrieval ->
grounded bilingual answer. The optional LLM step only rewrites wording; every
fact in the reply comes from the database.
"""

import logging

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
#: Longer transcript kept for the language model so it can hold a conversation
#: rather than answer each message in isolation.
MAX_HISTORY = 20


class Session:
    def __init__(self, session_id=None):
        from .ordering import StagedOrder

        self.session_id = session_id
        self.turns = []
        self.reservation_state = {}
        self.in_reservation_flow = False
        self.last_items = []
        self.last_intent = None
        #: Role-tagged transcript for the language model agent.
        self.history = []
        #: The customer's in-progress order. Created eagerly so every caller,
        #: including the agent, can rely on it existing.
        self.staged_order = StagedOrder()
        #: The last thing they asked for that needed an account, so the flow can
        #: resume once they sign in instead of starting over.
        self.pending_auth_intent = None

    def remember(self, query, intent, items=None):
        self.turns.append({'q': query, 'intent': intent})
        self.turns = self.turns[-MAX_TURNS:]
        if items:
            self.last_items = [i.id for i in items]

    def remember_exchange(self, query, answer_en=None, answer_am=None):
        """Append one customer/assistant pair to the model transcript."""
        self.history.append({'role': 'user', 'text': query})
        if answer_en:
            self.history.append({'role': 'assistant', 'text': answer_en})
        if answer_am:
            self.history.append({'role': 'assistant', 'text': answer_am})
        self.history = self.history[-MAX_HISTORY:]

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


# ── Sign-in gate helpers ────────────────────────────────────────────

def _resume_hint(intent, query, session):
    """
    Describe what the customer was already in the middle of, so the sign-in
    message can say "I still have your table for 4 tomorrow at 7" instead of
    making them repeat themselves.

    Returns an (english, amharic) pair, or None when there is nothing to carry
    over.
    """
    from .retriever import extract_reservation_fields

    if intent == 'order_create' and getattr(session, 'staged_order', None):
        summary = session.staged_order.summary()
        if summary['item_count']:
            names = ', '.join(f"{line['quantity']}x {line['name']}"
                               for line in summary['lines'][:3])
            if len(summary['lines']) <= 3:
                return f'your order ({names})', f'ትዕዛዝዎን ({names})'
            return f'your order ({names} and more)', f'ትዕዛዝዎን ({names} እና ተጨማሪ)'

    state = dict(session.reservation_state or {})
    try:
        state = extract_reservation_fields(query, state)
    except Exception:
        state = dict(session.reservation_state or {})

    if not state:
        return None

    en_bits, am_bits = [], []
    # The name leads: it is the one detail that cannot be read back out of the
    # calendar, so it is the most reassuring thing to confirm we kept it.
    if state.get('name'):
        en_bits.append(f"the name {state['name']}")
        am_bits.append(f"ስምዎ {state['name']}")
    if state.get('date'):
        en_bits.append(state['date'])
        am_bits.append(state['date'])
    if state.get('time'):
        en_bits.append(state['time'])
        am_bits.append(state['time'])
    if state.get('guests'):
        en_bits.append(f"{state['guests']} guests")
        am_bits.append(f"{state['guests']} ሰዎች")

    if not en_bits:
        return None
    return (' and '.join(en_bits), ' '.join(am_bits))


def _auth_required_reply(intent, query, session):
    """
    Build the sign-in answer and the matching UI action.

    The details the customer already gave are captured into the session state, so
    resuming after sign-in continues the booking instead of restarting it.
    """
    from .auth_gate import sign_in_action, sign_in_answer

    if intent.startswith('reservation'):
        # Keep what they have already said; the flow picks up from here later.
        from .retriever import extract_reservation_fields

        try:
            session.reservation_state = extract_reservation_fields(
                query, session.reservation_state)
        except Exception:
            logger.exception('Failed to preserve reservation state across the gate')

    hint = _resume_hint(intent, query, session)
    answer = sign_in_answer(intent, resume_hint=hint)

    missing = []
    if intent.startswith('reservation'):
        state = session.reservation_state or {}
        missing = [field for field in ('date', 'time', 'guests', 'name') if not state.get(field)]
    return answer, sign_in_action(intent, pending_intent=intent, missing_fields=missing)


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


# ── Public API ───────────────────────────────────────────────────────

QUICK_ACTIONS = [
    {'id': 'menu', 'label_en': 'View Menu', 'label_am': 'ሜኑ ይመልከቱ', 'icon': '☕', 'query_en': 'Show me the menu', 'query_am': 'ሜኑውን አሳይኝ'},
    {'id': 'food', 'label_en': 'Food', 'label_am': 'ምግብ', 'icon': '🍰', 'query_en': 'What food do you have?', 'query_am': 'ምን አይነት ምግብ አላችሁ?'},
    {'id': 'drinks', 'label_en': 'Drinks', 'label_am': 'መጠጦች', 'icon': '🥤', 'query_en': 'What drinks are available?', 'query_am': 'ምን አይነት መጠጥ አላችሁ?'},
    {'id': 'reservation', 'label_en': 'Make Reservation', 'label_am': 'ቦታ ማስያዝ', 'icon': '📅', 'query_en': 'I want to reserve a table', 'query_am': 'ቦታ ማስያዝ እፈልጋለሁ'},
    {'id': 'order', 'label_en': 'Start an Order', 'label_am': 'ትዕዛዝ ጀምር', 'icon': '🧾', 'query_en': 'I would like to place an order', 'query_am': 'ትዕዛዝ ለመስጠት እፈልጋለሁ'},
    {'id': 'prices', 'label_en': 'Check Prices', 'label_am': 'ዋጋ ይመልከቱ', 'icon': '💰', 'query_en': 'How much is Masala Chai Latte?', 'query_am': 'Masala Chai Latte ዋጋው ስንት ነው?'},
    {'id': 'about', 'label_en': 'About Coffee House', 'label_am': 'ስለ Coffee House', 'icon': 'ℹ️', 'query_en': 'What is this system?', 'query_am': 'ይህ ስርዓት ምንነው?'},
]


def answer_query(query, session_id=None, user=None, use_agent=None):
    """
    Main entry point. Returns a dict with the bilingual answer, the items that
    were retrieved, the detected intent and the next action for the UI.

    `user` decides what the customer may do: menu questions are public, anything
    touching an account (reservations, orders, "my ..." lookups) requires a
    signed-in customer and a guest is asked to sign in or sign up first.

    The language model handles the conversation when one is configured. If it is
    unavailable or its answer fails verification, the deterministic engine
    answers instead, so the assistant never depends on a network call.
    """
    query = (query or '').strip()
    if not query:
        return {
            'answer': responder.bilingual(
                'Ask me about our menu, prices, what is available today, or opening hours.',
                'ስለ ሜኑ፣ ዋጋ፣ ዛሬ የሚገኙት ምርቶች ወይም የመክፈቻ ሰዓት ይጠይቁኝ።'),
            'answer_en': 'Ask me about our menu, prices, what is available today, or opening hours.',
            'answer_am': 'ስለ ሜኑ፣ ዋጋ፣ ዛሬ የሚገኙት ምርቶች ወይም የመክፈቻ ሰዓት ይጠይቁኝ።',
            'intent': 'empty', 'items': [], 'reservations': [], 'orders': [],
            'action': {'action': 'none'}, 'engine': 'deterministic',
            'language': 'en', 'sources': [],
        }

    session = get_session(session_id)
    language = detect_language(query)

    from . import ordering as ordering_service
    from .auth_gate import is_authenticated, requires_auth

    if isinstance(session.staged_order, dict):
        # Sessions live in memory, but a serialized form should still reload.
        session.staged_order = ordering_service.StagedOrder(session.staged_order)

    # The model drives the conversation when it is configured. `use_agent=False`
    # forces the deterministic path, which is what the tests and any pinned
    # deployment rely on.
    if use_agent is None:
        from django.conf import settings
        use_agent = getattr(settings, 'ASSISTANT_USE_LLM', False)
    if use_agent:
        from .agent import run_agent

        agent_result = run_agent(query, user=user, session=session,
                                 staged=session.staged_order, language=language)
        if agent_result:
            session.remember_exchange(query, agent_result['answer_en'], agent_result['answer_am'])
            session.remember(query, agent_result['intent'])
            if agent_result.get('_placed_order'):
                session.staged_order.clear()
                session.pending_auth_intent = None
            elif agent_result.get('_auth_required'):
                session.pending_auth_intent = (agent_result['action'] or {}).get('resume_intent')
            else:
                session.pending_auth_intent = None
            return agent_result

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

    # ── Sign-in gate ──────────────────────────────────────────────────
    # Checked here, once the intent is final, because intent detection is what
    # tells a booking apart from a question about a product that happens to be
    # called "Reserve Wagyu Smash Burger".
    #
    # Anything that reads or writes a customer's account runs only for a
    # signed-in customer. Everything else - the whole menu, prices, opening
    # hours - stays open, because that is how a guest decides to sign up.
    if requires_auth(intent) and not is_authenticated(user):
        answer, action = _auth_required_reply(intent, query, session)
        session.remember(query, intent)
        return _finalize(query, answer, intent, [], [], action, language, session)

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

    if intent in ('order_create', 'order_status', 'order_cancel'):
        answer, orders, meta = responder.handle_order_intent(
            intent, query, session.staged_order, user=user)
        if meta.get('action') == 'auth_required':
            session.pending_auth_intent = intent
        if meta.get('action') == 'order_placed':
            session.staged_order.clear()
            session.pending_auth_intent = None
        session.remember(query, intent)
        result = _finalize(query, answer, intent, [], [], meta, language, session)
        result['orders'] = orders
        return result

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
    # The deterministic answer is sent exactly as built. There used to be an
    # optional "polish" step here that asked a model to reword it; that is now the
    # agent's job, and running a second unverified rewrite on an already-grounded
    # answer would undo the guarantee that every fact here came from the database.
    en, am = _strip_markup(answer)

    session.remember_exchange(query, en, am)

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
        'orders': [],
        'action': meta or {'action': 'none'},
        'sources': sources,
        'session_id': session.session_id,
        'engine': 'deterministic',
    }