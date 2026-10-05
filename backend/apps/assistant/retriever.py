"""
Retrieval layer for the Coffee House assistant.

Everything returned here comes from the application database. The generator never
sees admin data, other customers' orders, payments or credentials.
"""

import re
from difflib import SequenceMatcher

from django.db.models import Q

from apps.menu.models import MenuItem
from apps.orders.models import RestaurantSettings
from api.models import KnowledgeBase

from .lexicon import (
    AMHARIC_DIGITS,
    CATEGORY_KEYWORD_WORDS,
    AMHARIC_NUMBER_WORDS,
    CATEGORY_KEYWORDS,
    DAYS_OF_WEEK,
    INTENT_KEYWORDS,
    OUT_OF_SCOPE,
    QUESTION_WORDS,
    TOMORROW_WORDS,
)

_WORD_RE = re.compile(r'[\wሀ-፿]+', re.UNICODE)

#: Question filler words that must never match a menu item ("is" is inside "croissant").
STOPWORDS = {
    'is', 'are', 'am', 'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'at', 'and', 'or',
    'do', 'does', 'did', 'you', 'i', 'we', 'my', 'me', 'it', 'this', 'that', 'there',
    'how', 'much', 'many', 'what', 'which', 'who', 'can', 'could', 'would', 'please',
    'have', 'has', 'had', 'with', 'about', 'any', 'some', 'get', 'give', 'tell', 'know',
    'available', 'price', 'want', 'need', 'like', 'best', 'good', 'day', 'today', 'now',
}


def _contains_word(haystack, needle):
    """Word-boundary containment so 'is' does not match 'croissant'."""
    if not needle:
        return False
    try:
        return re.search(rf'(?<!\w){re.escape(needle)}(?!\w)', haystack) is not None
    except re.error:
        return needle in haystack


# ── Text utilities ────────────────────────────────────────────────────

def normalize_amharic_digits(text):
    """
    Convert standalone Amharic numerals to digits.

    Ethiopic digits share codepoints with Ethiopic letters (e.g. 'አ' is both zero
    and the first letter of 'አላችሁ'), so a blanket replace corrupts words. Only runs
    that are entirely numeric characters are converted.
    """
    text = (text or '')
    if not any(ch in text for ch in '፩፪፫፬፭፮፯፰፱፲፳፴፵፶፷፸፹፺፻፼፽፾፿'):
        return text
    out = []
    for word in re.split(r'(\s+)', text):
        if word and not word.isspace() and all(ch in AMHARIC_DIGITS for ch in word):
            out.append(''.join(AMHARIC_DIGITS[ch] for ch in word))
        else:
            out.append(word)
    return ''.join(out)


def tokenize(text):
    """Lowercase word tokens (Amharic is preserved as written)."""
    return _WORD_RE.findall((text or '').lower())


def _amharic_prefix_match(token, keyword):
    """Amharic verbs inflect (አላችሁ / አላችሁን / አለህ) - match on a shared prefix."""
    if token == keyword:
        return True
    shorter, longer = sorted([token, keyword], key=len)
    if len(shorter) >= 3 and longer.startswith(shorter):
        return True
    return False


def _hits(token, keywords):
    return any(_amharic_prefix_match(token, kw) for kw in keywords)


# ── Intent detection ──────────────────────────────────────────────────

def detect_language(text):
    amharic = len([c for c in (text or '') if 'ሀ' <= c <= '፿'])
    latin = len([c for c in (text or '') if c.isascii() and c.isalpha()])
    if amharic > latin and amharic >= 2:
        return 'am'
    if amharic and not latin:
        return 'am'
    return 'en'


def is_out_of_scope(text):
    low = (text or '').lower()
    for kw in OUT_OF_SCOPE['en'] + OUT_OF_SCOPE['am']:
        if kw in low:
            return True
    return False


def detect_intent(text):
    """
    Return (intent, matched_tokens, detected_category_slug).

    Longer keywords win, so "how much is cappuccino" resolves to `price` while
    "recommend a coffee" resolves to `recommend`.
    """
    tokens = tokenize(text)
    token_set = set(tokens)
    low = (text or '').lower()

    scores = {}
    for intent, groups in INTENT_KEYWORDS.items():
        score = 0
        for lang in ('en', 'am'):
            for kw in groups.get(lang, []):
                if ' ' in kw:
                    if kw in low:
                        score += 3
                else:
                    if _hits(kw, token_set):
                        score += 2
        if score:
            scores[intent] = score

    # Category detection (independent of intent)
    category = None
    best = 0
    for slug, groups in CATEGORY_KEYWORDS.items():
        cat_score = 0
        for lang in ('en', 'am'):
            for kw in groups.get(lang, []):
                if ' ' in kw:
                    if kw in low:
                        cat_score += 2
                elif _hits(kw, token_set):
                    cat_score += 2
        if cat_score > best:
            best, category = cat_score, slug

    if not scores:
        # No intent keyword: a bare item name means a price/detail lookup.
        if category or find_menu_items(text, limit=1):
            return 'price', tokens, category
        return 'unknown', tokens, category

    priority = {
        'reservation_cancel': 3, 'reservation_create': 2, 'reservation_status': 2,
        'cheapest': 2, 'recommend': 1, 'diet': 6, 'location': 0, 'hours': 0, 'about': 0,
        'greeting': 0, 'thanks': 0, 'order_help': 0, 'menu_list': 1,
    }
    intent = max(scores.items(), key=lambda kv: (kv[1] + priority.get(kv[0], 0), kv[1]))[0]

    # "cheapest latte" -> cheapest wins over price
    if intent == 'price' and scores.get('cheapest', 0) >= scores.get('price', 0):
        intent = 'cheapest'
    return intent, tokens, category


# ── Menu retrieval ───────────────────────────────────────────────────

def _item_document(item):
    parts = [item.name, item.category.name, item.category.slug.replace('-', ' '), item.description]
    parts += [v.name for v in item.variants.all()]
    parts += [a.name for a in item.add_ons.all()]
    return ' '.join(p for p in parts if p).lower()


def find_menu_items(text, limit=5, category_slug=None, available_only=False, min_score=4):
    """
    Score menu items against the query using word-boundary token overlap plus fuzzy
    name matching. Only returns items that genuinely exist in the database.
    """
    tokens = [t for t in tokenize(text) if len(t) > 1]
    qs = MenuItem.objects.select_related('category').prefetch_related('variants', 'add_ons')
    if category_slug:
        qs = qs.filter(category__slug=category_slug)
    if available_only:
        qs = qs.filter(is_available=True)

    # Match simple plurals too ("coffees" -> "coffee", "teas" -> "tea")
    def _variants(token):
        out = {token}
        if len(token) > 3 and token.endswith('s'):
            out.add(token[:-1])
        if len(token) > 3 and token.endswith('es'):
            out.add(token[:-2])
        return out

    query_tokens = []
    for token in tokens:
        if token.isascii() and token in STOPWORDS:
            continue
        query_tokens.append(token)

    # Content words carry the customer's actual subject ("Unicorn", "Discount").
    # Question vocabulary ("ዋጋው", "cappuccino" is kept) is excluded so mixed-language
    # questions still resolve to the right product.
    content_tokens = [t for t in query_tokens if len(t) >= 3 and t not in QUESTION_WORDS]

    text_low = (text or '').lower()
    scored = []
    for item in qs:
        doc = _item_document(item)
        name_low = item.name.lower()
        score = 0

        for token in query_tokens:
            forms = _variants(token)
            if any(_contains_word(doc, form) for form in forms):
                score += 2
            if any(_contains_word(name_low, form) for form in forms):
                score += 3
            # Amharic / typo tolerance on the item name
            if len(token) >= 4:
                best = SequenceMatcher(None, token, name_low).ratio()
                if best > 0.8:
                    score += 4
                elif best > 0.6:
                    score += 1

        # Whole-name phrase match is decisive
        if name_low and name_low in text_low:
            score += 10

        # Never substitute a different product: if the customer named something we
        # do not have ("Unicorn Latte", "25% discount"), do not answer with a
        # near-miss item. Every content word must be accounted for.
        unmatched = False
        for token in content_tokens:
            forms = _variants(token)
            hit = any(_contains_word(doc, f) or _contains_word(name_low, f) for f in forms)
            if not hit and len(token) >= 4:
                # A typo of this item's name is a plausible match, a different
                # product name is not.
                if SequenceMatcher(None, token, name_low).ratio() >= 0.6:
                    hit = True
            if not hit:
                unmatched = True
                break
        if unmatched and content_tokens:
            continue

        if score >= min_score:
            scored.append((score, item))

    scored.sort(key=lambda kv: (-kv[0], kv[1].name))
    return [item for _, item in scored[:limit]]


def list_menu(category_slug=None, available_only=True, limit=40):
    qs = MenuItem.objects.select_related('category')
    if category_slug:
        qs = qs.filter(category__slug=category_slug)
    if available_only:
        qs = qs.filter(is_available=True)
    return list(qs[:limit])


def get_item_by_name(name):
    qs = MenuItem.objects.select_related('category').prefetch_related('variants', 'add_ons')
    for item in qs:
        if item.name.lower() == (name or '').strip().lower():
            return item
    return None


# ── Knowledge base retrieval ─────────────────────────────────────────

def search_knowledge_base(text, limit=3):
    tokens = set(tokenize(text))
    if not tokens:
        return []
    scored = []
    for doc in KnowledgeBase.objects.all():
        doc_tokens = set(tokenize(f"{doc.title} {doc.category} {doc.content} {doc.tags}"))
        overlap = len(tokens & doc_tokens)
        title_hit = 2 if ' '.join(sorted(tokens)) in doc.title.lower() else 0
        score = overlap + title_hit
        if score:
            scored.append((score, doc))
    scored.sort(key=lambda kv: -kv[0])
    return [doc for _, doc in scored[:limit]]


# ── Venue information ────────────────────────────────────────────────

def get_venue_info():
    """Opening hours, address, contact - straight from RestaurantSettings."""
    return RestaurantSettings.get_settings()


# ── Reservation field extraction ─────────────────────────────────────

#: Day-part words people use instead of am/pm ("9 morning", "7 evening").
#: Without these "at 9 morning" parsed as no time at all, so the assistant kept
#: re-asking for a time the customer had already given.
DAY_PART_WORDS = {
    'morning': 0, 'morning ': 0, 'ጠዋት': 0,
    'afternoon': 12, 'noon': 12, 'midday': 12, 'ከሰዓት': 12, 'ቀን ማታ': 12,
    'evening': 12, 'night': 12, 'ማታ': 12, 'ከሰዓት በኋላ': 12,
}


def _normalize_tomorrow_spelling(lowered):
    """
    Collapse the common misspellings of "tomorrow" onto the canonical word.

    People type "tommorow" / "tomorow" / "tmrw" constantly, and each variant used
    to fall through as if no date had been given at all - which is what made the
    assistant look like it was ignoring the customer and asking again.
    """
    squashed = re.sub(r'[^a-z]', '', lowered)
    # Only rewrite when the misspelling stands alone as its own word, so a real
    # word that merely contains those letters is never mangled.
    for typo in ('tommorow', 'tomorow', 'tommorrow', 'tmrw', 'tomarrow'):
        if typo in squashed:
            return re.sub(r'\b' + typo + r'\b', 'tomorrow', lowered)
    return lowered


def _extract_date_and_time(text):
    """
    Extract a (date, time) pair from free text. Returns ISO date string and
    'HH:MM' string, or None. Handles 'tomorrow' (and its misspellings), weekdays,
    '6pm', '18:30', '9 morning', Amharic 'ነገ'/'ዛሬ' and Amharic numerals.
    """
    from datetime import date, timedelta

    lowered = normalize_amharic_digits((text or '').lower())
    lowered = _normalize_tomorrow_spelling(lowered)
    today = date.today()
    target_date = None

    # "today"/"ዛሬ" means today; "tomorrow"/"ነገ" means the next day. Checked
    # explicitly instead of the old nested-conditional chain, which double-counted
    # 'today' as a tomorrow word and then overrode it anyway.
    if 'tomorrow' in lowered or 'ነገ' in lowered:
        target_date = today + timedelta(days=1)
    elif 'today' in lowered or 'tonight' in lowered or 'ዛሬ' in lowered:
        target_date = today

    if target_date is None:
        for name, offset in DAYS_OF_WEEK.items():
            if name in lowered:
                days_ahead = (int(offset) - today.weekday()) % 7
                target_date = today + timedelta(days=days_ahead or 7)
                break

    # explicit ISO date 2026-10-10
    iso = re.search(r'\b(20\d{2})-(\d{1,2})-(\d{1,2})\b', lowered)
    if iso:
        try:
            target_date = date(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)))
        except ValueError:
            pass

    # time: 6pm / 18:30 / 9 morning / ከ18:00 / 6 ሰዓት
    target_time = None
    # Lookarounds rather than \b: in "ከ18:00" the Ethiopic letter and the digit are
    # both word characters, so \b never matches and the time was silently lost.
    time_match = re.search(r'(?<!\d)(\d{1,2})[:.](\d{2})(?!\d)', lowered)
    if time_match:
        target_time = f"{int(time_match.group(1)):02d}:{time_match.group(2)}"
    else:
        # Several word orders have to be recognised, because Amharic does not
        # put the unit where English does:
        #   "6pm"              digit then marker
        #   "9 morning"        digit then day-part
        #   "ከ6 ሰዓት"          ከ (preposition) + digit + ሰዓት
        #   "ከ6 ማታ"          ከ + digit + ማታ
        #   "ከሰዓት 6"          ሰዓት then digit
        marker = re.search(
            r'(?<!\d)(\d{1,2})\s*(am|pm|morning|afternoon|evening|night|noon|midday'
            r'|ጠዋት|ከሰዓት|ማታ)(?![a-z])', lowered)
        preposition = re.search(
            r'ከ\s*(?<!\d)(\d{1,2})\s*(ሰዓት|ማታ|ጠዋት)(?![a-z])', lowered)
        unit_first = re.search(
            r'(?<!\d)(ከሰዓት|ሰዓት|ማታ|ጠዋት)\s*(\d{1,2})(?!\d)', lowered)

        if marker:
            hour = int(marker.group(1))
            word = marker.group(2).strip()
            if word in DAY_PART_WORDS and word not in ('am', 'pm', 'ጠዋት', 'ማታ'):
                hour += DAY_PART_WORDS[word]
                hour = min(hour, 23)
            elif word in ('pm', 'ማታ') and hour < 12:
                hour += 12
            elif word in ('am', 'ጠዋት') and hour == 12:
                hour = 0
            target_time = f"{hour:02d}:00"
        elif preposition:
            hour = int(preposition.group(1))
            word = preposition.group(2)
            if word in ('ማታ',) and hour < 12:
                hour += 12
            elif word == 'ጠዋት' and hour == 12:
                hour = 0
            target_time = f"{hour:02d}:00"
        elif unit_first:
            hour = int(unit_first.group(2))
            word = unit_first.group(1)
            if word == 'ማታ' and hour < 12:
                hour += 12
            elif word == 'ጠዋት' and hour == 12:
                hour = 0
            target_time = f"{hour:02d}:00"
        elif 'noon' in lowered or 'midday' in lowered or 'ቀን ማታ' in lowered:
            target_time = '12:00'

    return target_date, target_time


def _extract_guests(text):
    """
    Extract the party size. Must not mistake the hour in "6 PM" for a guest count,
    so an explicit "4 people" / "ለ4 ሰው" pattern is required before any bare digit.
    """
    low = normalize_amharic_digits((text or '').lower())

    # 1) explicit "<n> people / ሰዎች / ሰው"
    match = re.search(r'(\d+)\s*(?:people|persons?|guests?|pax|ሰዎች|ሰዎቻች|ሰው)', low)
    if match:
        return int(match.group(1))

    # 2) "table for 4" / "party of 4" / "for 4 people"
    match = re.search(r'(?:table\s+for|for|party\s+of|ለ)\s*(\d+)\s*(?:people|persons?|guests?|ሰዎች|ሰው)?', low)
    if match:
        return int(match.group(1))

    # 3) Amharic number words ("ለአራት ሰው")
    for word, value in AMHARIC_NUMBER_WORDS.items():
        if word in low:
            return value

    # 4) a lone digit is only a party size when the message carries no time
    _, extracted_time = _extract_date_and_time(text)
    if not extracted_time:
        digits = re.findall(r'\b(\d{1,2})\b', low)
        for value in digits:
            if 1 <= int(value) <= 50:
                return int(value)
    return None


def _extract_name(text):
    """A reservation name is usually the short phrase after 'name is' / 'ስም'."""
    patterns = [
        r'(?:name is|my name is|for|name[:\s]+)\s*([A-Za-z][A-Za-z\s\-\.]{1,30})',
        r'ስም\s*([^\s,.]{2,30})',
    ]
    for pattern in patterns:
        match = re.search(pattern, (text or ''), re.IGNORECASE)
        if match:
            candidate = match.group(1).strip().split()
            # drop trailing filler words
            for stop in ('at', 'for', 'tomorrow', 'today', 'tonight', 'please', 'በ', 'ነገ'):
                if candidate and candidate[-1].lower() == stop:
                    candidate.pop()
            if candidate:
                return ' '.join(candidate).strip(' ,.')
    return None


def _extract_phone(text):
    match = re.search(r'(\+?251[\s\-]?[79]\d{8}|0[79]\d{8}|9\d{8}|7\d{8})', (text or '').replace(' ', ''))
    return match.group(1) if match else None


def extract_reservation_fields(text, session_state=None):
    """
    Pull whatever reservation details are present in the message, merging with
    anything already collected in the conversation (short-term memory).
    """
    state = dict(session_state or {})
    target_date, target_time = _extract_date_and_time(text)
    if target_date:
        state['date'] = target_date.isoformat()
    if target_time:
        state['time'] = target_time
    guests = _extract_guests(text)
    if guests:
        state['guests'] = guests
    name = _extract_name(text)
    if name:
        state['name'] = name
    phone = _extract_phone(text)
    if phone:
        state['phone'] = phone
    return state

#: Wording used in menu names/descriptions for meat-free dishes.
VEGETARIAN_HINTS = [
    'vegetarian', 'vegan', 'plant-based', 'plant based', 'veggie', 'vegetable',
    'falafel', 'hummus', 'mushroom', 'margherita', 'garden', 'veggie shawarma',
]


def find_vegetarian_items(limit=8):
    """
    Return menu items whose own name/description indicates a meat-free dish.
    Grounded in the database text - the answer states that it is based on the
    menu descriptions rather than claiming a formal dietary guarantee.
    """
    matches = []
    for item in list_menu(available_only=False):
        text = f"{item.name} {item.description}".lower()
        if any(hint in text for hint in VEGETARIAN_HINTS):
            matches.append(item)
        if len(matches) >= limit:
            break
    return matches


def _plural_forms(word):
    forms = {word}
    if len(word) > 3 and word.endswith('s'):
        forms.add(word[:-1])
    if len(word) > 3 and word.endswith('es'):
        forms.add(word[:-2])
    return forms


def product_reference_tokens(text, item_names=None):
    """
    Words in the question that name a specific product (as opposed to question
    words or category words).

    "What coffees do you have?"       -> []              (browse the coffee menu)
    "How much is the Unicorn Latte?"  -> ['unicorn']     (a product we may not stock)
    "Is Reserve Wagyu Smash Burger available?" -> ['wagyu', 'smash']
    "Cappuccino ዋጋው ስንት ነው?"          -> ['cappuccino'] (an item that also names a
                                                            category -> still a product)
    """
    names = [n.lower() for n in (item_names or [])]
    result = []
    for token in tokenize(text):
        if len(token) < 3:
            continue
        if token.isascii() and token in STOPWORDS:
            continue
        if token in QUESTION_WORDS:
            continue

        is_category_word = any(form in CATEGORY_KEYWORD_WORDS for form in _plural_forms(token))
        if is_category_word:
            # "cappuccino" is both a category and one of our items. Singular wording
            # for something we actually sell is a product question; the plural form
            # ("what burgers do you have?") is a group question.
            is_plural = len(token) > 3 and token.endswith('s')
            names_item = any(_contains_word(name, token) for name in names)
            if not (names_item and not is_plural):
                continue
        result.append(token)
    return result
