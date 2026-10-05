"""
Bilingual answer generation.

Every customer-facing reply is produced in English and Amharic and is built
exclusively from retrieved database facts. When a fact is missing, the assistant
says so instead of guessing.
"""

from django.utils import timezone

from . import reservations as reservation_service
from .retriever import (
    find_menu_items,
    find_vegetarian_items,
    get_item_by_name,
    get_venue_info,
    list_menu,
    search_knowledge_base,
)

EN_HEADER = '**English 🇬🇧**'
AM_HEADER = '**አማርኛ 🇪🇹**'

NOT_FOUND_EN = (
    "I don't have that information in the Coffee House system. "
    "Please ask our staff for confirmation."
)
NOT_FOUND_AM = (
    "ይህ መረጃ በCoffee House ስርዓት ውስጥ የለኝም። "
    "እባክዎን ከሰራተኞቻችን ያረጋግጡ።"
)


def format_price(amount):
    return f"{float(amount):,.2f} ETB".replace('.00', '')


def bilingual(en, am):
    return f"{EN_HEADER}\n\n{en}\n\n{AM_HEADER}\n\n{am}"


# ── Item formatting ──────────────────────────────────────────────────

def _item_en(item, include_price=True, include_desc=True):
    bits = [item.name]
    if include_price:
        bits.append(f"{format_price(item.base_price_etb)}")
    if not item.is_available:
        bits.append("(currently unavailable)")
    line = ' - '.join(bits)
    if include_desc and item.description:
        line += f"\n{item.description}"
    if item.variants.exists():
        variants = ', '.join(
            f"{v.name} (+{format_price(v.price_modifier_etb)})" if v.price_modifier_etb else v.name
            for v in item.variants.all()
        )
        line += f"\nSizes: {variants}"
    return line


def _item_am(item, include_price=True, include_desc=True):
    bits = [item.name]
    if include_price:
        bits.append(f"{format_price(item.base_price_etb)}")
    if not item.is_available:
        bits.append("(በጊዜው አይገኝም)")
    line = ' - '.join(bits)
    if include_desc and item.description:
        line += f"\n{item.description}"
    if item.variants.exists():
        variants = ', '.join(v.name for v in item.variants.all())
        line += f"\nየመጠን አማራጮች፦ {variants}"
    return line


def _catalog(cards, limit=12):
    en = '\n'.join(f"• {_item_en(i, include_desc=False)}" for i in cards[:limit])
    am = '\n'.join(f"• {_item_am(i, include_desc=False)}" for i in cards[:limit])
    return en, am


def _item_payload(item):
    return {
        'id': item.id,
        'name': item.name,
        'category': item.category.name,
        'category_slug': item.category.slug,
        'price': f"{float(item.base_price_etb):.2f}",
        'currency': 'ETB',
        'description': item.description,
        'available': item.is_available,
        'image_url': item.get_image_display(),
    }


# ── Intent handlers ──────────────────────────────────────────────────

def _greeting():
    en = ("Hello! I am the Coffee House assistant. I can help you with our menu, "
          "prices, availability, opening hours and table reservations. "
          "You can ask me in English or Amharic.")
    am = ("ሰላም! እኔ የCoffee House ረዳት ነኝ። በሜኑ፣ በዋጋ፣ በምርቶች መገኘት፣ በመክፈቻ ሰዓት እና በቦታ ማስያዝ ልረዳዎ እችላለሁ። "
          "በእንግሊዝኛ ወይም በአማርኛ መጠየቅ ይችላሉ።")
    return bilingual(en, am), []


def _thanks():
    en = "You're welcome! Ask me anything about our menu, prices or reservations."
    am = "ምንም አይደል! ስለ ሜኑአችን፣ ዋጋ ወይም ቦታ ማስያዝ ማንኛውንም ጥያቄ መጠየቅ ይችላሉ።"
    return bilingual(en, am), []


def _about():
    en = ("This is the Coffee House assistant. It helps you explore our menu, look up food and "
          "drink details, check prices and availability, and make or manage table reservations. "
          "You can ask questions in English or Amharic.")
    am = ("ይህ የCoffee House ረዳት ነው። ሜኑአችንን ለማየት፣ ስለ ምግብና መጠጦች መረጃ ለማግኘት፣ ዋጋና መገኘትን ለማረጋገጥ፣ "
          "እንዲሁም ቦታ ለማስያዝና ለማስተዳደር ይረዳዎታል። በእንግሊዝኛ ወይም በአማርኛ መጠየቅ ይችላሉ።")
    return bilingual(en, am), []


def _hours(venue):
    en = (f"Our opening hours are {venue.opening_hours}. "
          f"{'We are open right now.' if venue.is_open else 'We are currently closed.'} "
          "Orders are accepted while the store is open.")
    am = (f"የመክፈቻ ሰዓታችን {venue.opening_hours} ነው። "
          f"{'አሁን ክፍት ነን።' if venue.is_open else 'አሁን ዝግ ነን።'} "
          "በመክፈቻ ሰዓታት ውስጥ ትዕዛዝ እንቀበላለን።")
    return bilingual(en, am), []


def _location(venue):
    en = (f"We are at {venue.address}. Phone: {venue.contact_phone}. Email: {venue.contact_email}.")
    am = (f"አድራሻችን {venue.address} ነው። ስልክ፦ {venue.contact_phone}:: ኢሜይል፦ {venue.contact_email}።")
    return bilingual(en, am), []


def _price_or_item(text, category_slug, items):
    """Answer a price/ingredient/detail question about a specific item."""
    if not items:
        return None, None, []

    item = items[0]
    en = f"{item.name} costs {format_price(item.base_price_etb)}.\n{item.description}"
    am = f"{item.name} ዋጋው {format_price(item.base_price_etb)} ብር ነው።\n{item.description}"

    if 'ingredient' in text.lower() or 'ይዘት' in text or 'መሣሪያ' in text or 'ምግብ' in text:
        en += ("\nIngredients are listed in the description above. If you need a full ingredient "
               "list, please ask our staff.")
        am += ("\nየሚያካተታቸው ይዘቶች በላይ ባለው መግለጫ ውስጥ ተዘርዝረዋል። "
               "ሙሉ የይዘት ዝርዝር ከፈለጉ እባክዎን ሰራተኞቻችንን ይጠይቁ።")

    if not item.is_available:
        en += "\nThis item is currently unavailable. Our staff can tell you when it returns."
        am += "\nይህ ምርት በጊዜው አይገኝም። መቼ እንደሚመለስ ለማወቅ እባክዎን ሰራተኞቻችንን ይጠይቁ።"

    return bilingual(en, am), None, [_item_payload(item)]


def _menu_list(category_slug, items):
    cards = list_menu(category_slug=category_slug)
    if not cards:
        return None, None, []
    if category_slug:
        category_name = cards[0].category.name
        en = f"Here is our {category_name} menu ({len(cards)} items):"
        am = f"የ{category_name} ሜኑአችን ({len(cards)} ምርቶች)፦"
    else:
        en = f"Here is our full menu ({len(cards)} items, grouped by category):"
        am = f"ሙሉ ሜኑአችን ({len(cards)} ምርቶች፣ በምድብ የተከፋፈሉ)፦"

    cat_en, cat_am = _catalog(cards)
    en += f"\n{cat_en}\n\nWould you like prices or details for a specific item?"
    am += f"\n{cat_am}\n\nለተወሰነ ምርት ዋጋ ወይም ዝርዝር መረጃ ይፈልጋሉ?"
    return bilingual(en, am), None, [_item_payload(i) for i in cards[:12]]


def _cheapest(category_slug):
    cards = list_menu(category_slug=category_slug)
    if not cards:
        return None, None, []
    cheapest = min(cards, key=lambda i: i.base_price_etb)
    en = (f"Our lowest priced item is {cheapest.name} at {format_price(cheapest.base_price_etb)}.\n"
          f"{cheapest.description}")
    am = (f"አነስተኛ ዋጋ ያለው ምርታችን {cheapest.name} ሲሆን ዋጋው "
          f"{format_price(cheapest.base_price_etb)} ብር ነው።\n{cheapest.description}")
    return bilingual(en, am), None, [_item_payload(cheapest)]


def _recommend(category_slug):
    cards = list_menu(category_slug=category_slug)
    if not cards:
        return None, None, []
    picks = [i for i in cards if i.is_signature][:2] or cards[:2]
    picks = picks[:3]
    en = "Here is what I would suggest from our current menu:"
    am = "ከአሁኑ ሜኑአችን የምንመክራቸው፦"
    cat_en, cat_am = _catalog(picks)
    en += f"\n{cat_en}"
    am += f"\n{cat_am}"
    en += "\nWould you like more details on any of these?"
    am += "\nከእነዚህ ውስጥ ስለ አንዱ ተጨማሪ ዝርዝር መረጃ ይፈልጋሉ?"
    return bilingual(en, am), None, [_item_payload(i) for i in picks]


def _vegetarian():
    cards = find_vegetarian_items()
    if not cards:
        en = ("I could not find any item marked as meat-free in our menu database. "
              "Please ask our staff about ingredients.")
        am = ("በሜኑአችን ውስጥ የቬጀቴሪያን (ስጋ የሌለው) ምርት አልተገኘም። "
              "እባክዎን ስለ ይዘቱ ሰራተኞቻችንን ይጠይቁ።")
        return bilingual(en, am), None, []

    cat_en, cat_am = _catalog(cards)
    en = ("Based on our menu descriptions, these are our meat-free options:\n"
          f"{cat_en}\n\nPlease confirm ingredients with our staff if you have a strict allergy.")
    am = ("በሜኑአችን መግለጫ መሠረት፣ ያለ ስጋ የሚዘጋጁ አማራጮች፦\n"
          f"{cat_am}\n\nየአለርጂ ችግር ካለብዎት እባክዎን ይዘቱን ከሰራተኞቻችን ጋር ያረጋግጡ።")
    return bilingual(en, am), None, [_item_payload(i) for i in cards]


def _availability(category_slug, items):
    if items:
        lines_en, lines_am, payload = [], [], []
        for item in items[:6]:
            state_en = 'Available now' if item.is_available else 'Currently unavailable'
            state_am = 'አሁን ይገኛል' if item.is_available else 'በጊዜው አይገኝም'
            lines_en.append(f"• {item.name} ({format_price(item.base_price_etb)}) - {state_en}")
            lines_am.append(f"• {item.name} ({format_price(item.base_price_etb)}) - {state_am}")
            payload.append(_item_payload(item))
        en = "Menu availability:\n" + '\n'.join(lines_en)
        am = "የምርቶች መገኘት፦\n" + '\n'.join(lines_am)
        return bilingual(en, am), None, payload

    cards = list_menu(category_slug=category_slug, available_only=True)
    if not cards:
        return None, None, []
    cat_en, cat_am = _catalog(cards)
    en = f"Currently available ({len(cards)} items):\n{cat_en}"
    am = f"አሁን የሚገኙ ({len(cards)} ምርቶች)፦\n{cat_am}"
    return bilingual(en, am), None, [_item_payload(i) for i in cards[:12]]


def _order_help(venue):
    en = (f"How to order:\n"
          f"1. Sign in to your account.\n"
          f"2. Choose items from the menu and add them to your cart.\n"
          f"3. Press 'Pay with Chapa' and complete payment, or choose Cash on Delivery.\n"
          f"4. Track your order status from 'My Orders' in your account.\n"
          f"Delivery and pickup are both available while we are open "
          f"({venue.opening_hours}).")
    am = (f"እንዴት ማዘዝ እንደሚቻል፦\n"
          f"1. በመለያዎ ይግቡ።\n"
          f"2. ከሜኑአችን የሚፈልጉትን መርጠው ወደ ግዢ ቅርጫት ያስገቡ።\n"
          f"3. 'በ Chapa ክፈል' የሚለውን በመጫን ክፍያ ይፈጽሙ ወይም ሲረከቡ መክፈልን ይምረጡ።\n"
          f"4. የትዕዛዝዎን ሁኔታ በመለያዎ ውስጥ 'የእኔ ትዕዛዞች' በሚለው ገጽ ይከታተሉ።\n"
          f"ማድረስ እና በመደብር መረከብ በመክፈቻ ሰዓታት ({venue.opening_hours}) ይገኛሉ።")
    return bilingual(en, am), []


def _from_knowledge_base(text):
    docs = search_knowledge_base(text)
    if not docs:
        return None, None, []
    en_parts, am_parts = [], []
    for doc in docs:
        en_parts.append(f"• {doc.title}: {doc.content}")
        am_parts.append(f"• {doc.title}: {doc.content_am}" if hasattr(doc, 'content_am') and doc.content_am else f"• {doc.title}: {doc.content}")
    if not any(am_parts):
        en = '\n'.join(en_parts)
        am = ("ይህ መረጃ በCoffee House ስርዓት ውስጥ አልተገኘም። "
              "እባክዎን ከሰራተኞቻችን ያረጋግጡ።")
        return bilingual(en, am), None, []
    en = '\n'.join(p for p in en_parts if p)
    am = '\n'.join(p for p in am_parts if p)
    return bilingual(en, am), None, []


def _out_of_scope():
    en = ("I'm here to help with the Coffee House menu, food and drinks, prices, "
          "opening hours and table reservations.")
    am = ("እኔ ስለ Coffee House ሜኑ፣ ምግብና መጠጦች፣ ዋጋዎች፣ የመክፈቻ ሰዓት እና የቦታ ማስያዝ "
          "መረጃ ለመስጠት እዚህ ነኝ።")
    return bilingual(en, am), []


def _not_found():
    return bilingual(NOT_FOUND_EN, NOT_FOUND_AM), None, []


# ── Reservation conversation ─────────────────────────────────────────

def _local_stamp(dt):
    """Show reservation times in the venue's local timezone, not UTC."""
    try:
        return timezone.localtime(dt).strftime('%Y-%m-%d %H:%M')
    except Exception:
        return dt.strftime('%Y-%m-%d %H:%M')


def _reservation_prompt(missing, state):
    en_missing, am_missing = [], []
    labels = {
        'name': ('your name', 'ስምዎ'),
        'phone': ('your phone number', 'የስልክ ቁጥርዎ'),
        'date': ('the date', 'ቀን'),
        'time': ('the time', 'ሰዓት'),
        'guests': ('how many guests', 'የሰዎች ብዛት'),
    }
    for field in missing:
        en_missing.append(f"{labels[field][0]}")
        am_missing.append(f"{labels[field][1]}")

    en = ("Sure, I can help you with that. Please provide: " + ', '.join(en_missing) + ".")
    am = ("እሺ! ልረዳዎ እችላለሁ። እባክዎን የሚከተሉትን ያቅርቡ፦ " + '፣ '.join(am_missing) + "።")
    return bilingual(en, am), None, []


def handle_reservation_create(text, state, user=None):
    from .retriever import extract_reservation_fields

    state = extract_reservation_fields(text, state)

    missing = [f for f in ('name', 'date', 'time', 'guests') if not state.get(f)]
    if missing:
        answer, _, _ = _reservation_prompt(missing, state)
        return answer, [], state, {'action': 'collect_reservation_details', 'missing': missing}

    available, detail = reservation_service.check_availability(
        state['date'], state['time'], state['guests'])

    if not available:
        if detail == 'too_large':
            en = (f"For parties larger than {reservation_service.MAX_GUESTS} guests we cannot take an "
                  "online reservation. Please call the Coffee House and we will arrange it for you.")
            am = (f"ከ {reservation_service.MAX_GUESTS} በላይ ለሆኑ ሰዎች በኦንላይን ቦታ ማስያዝ አይቻልም። "
                  "እባክዎን በቀጥታ ወደ Coffee House ይደውሉ፤ እናስተናግዶታለን።")
            return bilingual(en, am), [], state, {'action': 'none'}

        suggestions = reservation_service.suggest_alternative_times(
            state['date'], state['time'], state['guests'])
        if suggestions:
            en = ("Sorry, that time is not available. I can help you find another available time. "
                  "Available options are " + ', '.join(suggestions) + ".")
            am = ("ይቅርታ፣ ያ ሰዓት ክፍት አይደለም። ሌላ የሚገኝ ሰዓት እንዲያገኙ ልረዳዎ እችላለሁ። "
                  "የሚገኙ አማራጮች፦ " + '፣ '.join(suggestions) + " ናቸው።")
        else:
            en = "Sorry, that time is not available. Please choose another time or call the Coffee House."
            am = "ይቅርታ፣ ያ ሰዓት ክፍት አይደለም። እባክዎን ሌላ ሰዓት ይምረጡ ወይም ወደ Coffee House ይደውሉ።"
        return bilingual(en, am), [], state, {'action': 'suggest_alternative_time'}

    reservation, error = reservation_service.create_reservation(
        name=state['name'], phone=state.get('phone', ''), date_str=state['date'],
        time_str=state['time'], guests=state['guests'], user=user)

    if reservation is None:
        en = "Sorry, I could not complete the reservation just now. Please try again, or call the Coffee House."
        am = "ይቅርታ፣ የቦታ ማስያዣውን አሁን ማጠናቀቅ አልተቻለም። እባክዎን እንደገና ይሞክሩ ወይም ወደ Coffee House ይደውሉ።"
        return bilingual(en, am), [], {}, {'action': 'none'}

    pretty_date = state['date']
    en = ("Your reservation has been confirmed.\n\n"
          f"Name: {reservation.name}\nDate: {pretty_date}\n"
          f"Time: {state['time']}\nGuests: {reservation.party_size}\n\n"
          "Our staff will confirm the table by phone. Thank you!")
    am = ("የቦታ ማስያዣዎ ተረጋግጧል!\n\n"
          f"ስም፦ {reservation.name}\nቀን፦ {pretty_date}\n"
          f"ሰዓት፦ {state['time']}\nየሰዎች ብዛት፦ {reservation.party_size}\n\n"
          "ሰራተኞቻችን በስልክ ያረጋግጣሉ። እናመሰግናለሁ!")
    return bilingual(en, am), [reservation_service.serialize(reservation)], state, {'action': 'reservation_created'}


def handle_reservation_status(text, state, user=None):
    from .retriever import extract_reservation_fields

    state = extract_reservation_fields(text, state)
    name = state.get('name')
    phone = state.get('phone')
    if not name and not phone and not (user and user.is_authenticated):
        en = ("Please tell me the name on the reservation, or the phone number you used, "
              "so I can look it up.")
        am = "እባክዎን ለማስያዣው የተጠቀሙበትን ስም ወይም የስልክ ቁጥር ይንገሩኝ።"
        return bilingual(en, am), [], state, {'action': 'collect_reservation_lookup'}

    found = reservation_service.find_reservations(name=name, phone=phone, user=user)
    if not found:
        en = ("I could not find a matching reservation. Please check the details, "
              "or call the Coffee House and we will help.")
        am = ("የሚዛመድ ቦታ ማስያዝ አልተገኘም። እባክዎን መረጃውን ያረጋግጡ ወይም ወደ Coffee House ይደውሉ።")
        return bilingual(en, am), [], state, {'action': 'none'}

    lines_en, lines_am, payload = [], [], []
    for r in found:
        stamp = _local_stamp(r.date_time)
        lines_en.append(f"• {r.name} - {stamp} - {r.party_size} guests - {r.status}")
        lines_am.append(f"• {r.name} - {stamp} - {r.party_size} ሰዎች - {r.status}")
        payload.append(reservation_service.serialize(r))
    en = "Here are your reservation(s):\n" + '\n'.join(lines_en)
    am = "የእኔ ማስያዣዎች፦\n" + '\n'.join(lines_am)
    return bilingual(en, am), payload, state, {'action': 'none'}


def handle_reservation_cancel(text, state, user=None):
    from .retriever import extract_reservation_fields

    state = extract_reservation_fields(text, state)
    name = state.get('name')
    phone = state.get('phone')

    if not name and not phone and not (user and user.is_authenticated):
        en = "Please give me the name or phone number on the reservation you want to cancel."
        am = "እባክዎን መሰረዝ የሚፈልጉትን የቦታ ማስያዝ ስም ወይም የስልክ ቁጥር ይስጡኝ።"
        return bilingual(en, am), [], state, {'action': 'collect_reservation_lookup'}

    candidates = reservation_service.find_reservations(name=name, phone=phone, user=user)
    active = [r for r in candidates if r.status in reservation_service.ACTIVE_STATUSES][:1]
    if not active:
        en = "I could not find an active reservation to cancel. Please check the details, or call the Coffee House."
        am = ("የሚሰረዝ ንቁ የቦታ ማስያዝ አልተገኘም። እባክዎን መረጃውን ያረጋግጡ ወይም ወደ Coffee House ይደውሉ።")
        return bilingual(en, am), [], state, {'action': 'none'}

    cancelled = []
    for reservation in active:
        ok, _ = reservation_service.cancel_reservation(reservation)
        if ok:
            cancelled.append(reservation)

    if not cancelled:
        en = "I could not cancel that reservation just now. Please call the Coffee House for help."
        am = "ቦታ ማስያዙን አሁን መሰረዝ አልተቻለም። እባክዎን ለእርዳታ ወደ Coffee House ይደውሉ።"
        return bilingual(en, am), [], state, {'action': 'none'}

    en = ("Your reservation has been cancelled:\n"
          + '\n'.join(f"• {r.name} - {_local_stamp(r.date_time)}" for r in cancelled))
    am = ("የቦታ ማስያዣዎ ተሰርዟል፦\n"
          + '\n'.join(f"• {r.name} - {_local_stamp(r.date_time)}" for r in cancelled))
    return bilingual(en, am), [reservation_service.serialize(r) for r in cancelled], {}, {'action': 'reservation_cancelled'}


def build_venue_answer(intent, text, category_slug, items):
    """Menu/venue answers that don't need the reservation flow."""
    venue = get_venue_info()

    if intent == 'price':
        answer, _, payload = _price_or_item(text, category_slug, items)
        if answer:
            return answer, payload, {'action': 'none'}

    if intent == 'ingredients':
        answer, _, payload = _price_or_item(text, category_slug, items)
        if answer:
            return answer, payload, {'action': 'none'}

    if intent == 'menu_list':
        answer, _, payload = _menu_list(category_slug, items)
        if answer:
            return answer, payload, {'action': 'none'}

    if intent == 'cheapest':
        answer, _, payload = _cheapest(category_slug)
        if answer:
            return answer, payload, {'action': 'none'}

    if intent == 'recommend':
        answer, _, payload = _recommend(category_slug)
        if answer:
            return answer, payload, {'action': 'none'}

    if intent == 'availability':
        answer, _, payload = _availability(category_slug, items)
        if answer:
            return answer, payload, {'action': 'none'}

    if intent == 'diet':
        answer, _, payload = _vegetarian()
        if answer:
            return answer, payload, {'action': 'none'}

    if intent == 'hours':
        return _hours(venue)[0], [], {'action': 'none'}
    if intent == 'location':
        return _location(venue)[0], [], {'action': 'none'}
    if intent == 'order_help':
        return _order_help(venue)[0], [], {'action': 'none'}
    if intent == 'about':
        return _about()[0], [], {'action': 'none'}
    if intent == 'greeting':
        return _greeting()[0], [], {'action': 'none'}
    if intent == 'thanks':
        return _thanks()[0], [], {'action': 'none'}

    return None, None, None