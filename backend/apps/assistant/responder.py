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
    en = ("Buna Hub (Coffee House) is a specialty coffee house in Addis Ababa dedicated to "
          "authentic Ethiopian coffee tradition and artisanal dining. We serve 100% single-origin "
          "micro-lot coffees, traditional clay jebena brews, wood-fired pizzas, gourmet burgers, "
          "fresh pastries, and premium teas. As your assistant, I can help you explore our menu, "
          "check prices and availability, place orders, and make or manage table reservations. "
          "You can ask me anytime in English or Amharic!")
    am = ("ቡና ሁብ (Coffee House) በኢትዮጵያ ጥንታዊ የቡና ባህል እና በዘመናዊ የምግብና መጠጥ ጥበብ የተዋቀረ "
          "በአዲስ አበባ የሚገኝ ልዩ የቡና መዳረሻ ነው። 100% የተመረጡ የሀገር ውስጥ የቆሎ ቡናዎችን፣ "
          "የባህል ጀበና ቡናን፣ በከሰል ምጣድ የሚጋገሩ ፒዛዎችን፣ ልዩ በርገሮችን፣ ኬኮችን እና ፕሪሚየም ሻይዎችን እናቀርባለን። "
          "እኔ ደግሞ ሜኑአችንን ለማሰስ፣ ዋጋዎችንና መገኘታቸውን ለማረጋገጥ፣ ለማዘዝ እንዲሁም የጠረጴዛ ቦታዎችን "
          "ለማስያዝና ለማስተዳደር የምረዳዎት ረዳት ነኝ። በእንግሊዝኛ ወይም በአማርኛ በማንኛውም ሰዓት ሊጠይቁኝ ይችላሉ!")
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
            en = (f"For parties larger than {reservation_service.max_guests()} guests we cannot take an "
                  "online reservation. Please call the Coffee House and we will arrange it for you.")
            am = (f"ከ {reservation_service.max_guests()} በላይ ለሆኑ ሰዎች በኦንላይን ቦታ ማስያዝ አይቻልም። "
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
    code = state.get('code')
    if not name and not phone and not code and not (user and user.is_authenticated):
        en = ("Please tell me the reservation code (e.g. RES-...), name on the reservation, or phone number you used, "
              "so I can look it up.")
        am = "እባክዎን ለማስያዣው የተጠቀሙበትን ኮድ (ለምሳሌ RES-...)፣ ስም ወይም የስልክ ቁጥር ይንገሩኝ።"
        return bilingual(en, am), [], state, {'action': 'collect_reservation_lookup'}

    found = reservation_service.find_reservations(name=name, phone=phone, user=user, code=code)
    if not found:
        en = ("I could not find a matching reservation. Please check the details, "
              "or call the Coffee House and we will help.")
        am = ("የሚዛመድ ቦታ ማስያዝ አልተገኘም። እባክዎን መረጃውን ያረጋግጡ ወይም ወደ Coffee House ይደውሉ።")
        return bilingual(en, am), [], state, {'action': 'none'}

    lines_en, lines_am, payload = [], [], []
    for r in found:
        stamp = _local_stamp(r.date_time)
        code_str = f"[{r.order_code}] " if r.order_code else ""
        lines_en.append(f"• {code_str}{r.name} - {stamp} - {r.party_size} guests - {r.status}")
        lines_am.append(f"• {code_str}{r.name} - {stamp} - {r.party_size} ሰዎች - {r.status}")
        payload.append(reservation_service.serialize(r))
    en = "Here are your reservation(s):\n" + '\n'.join(lines_en)
    am = "የቦታ ማስያዣ(ዎች) መረጃ፦\n" + '\n'.join(lines_am)
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


# ── Ordering ────────────────────────────────────────────────────────

#: How the staged order reads in a reply, both languages.
_ORDER_TYPE_EN = {'DELIVERY': 'delivery', 'PICKUP': 'store pickup', 'DINE_IN': 'dine-in'}
_ORDER_TYPE_AM = {'DELIVERY': 'ማድረስ', 'PICKUP': 'በመደብር መረከብ', 'DINE_IN': 'እዛው መመገብ'}


def _order_lines_en(summary):
    return '\n'.join(
        f"• {line['quantity']}x {line['name']}"
        + (f" ({line['variant']})" if line['variant'] else '')
        + (f" + {', '.join(line['add_ons'])}" if line['add_ons'] else '')
        + f" - {format_price(line['subtotal_etb'])}"
        for line in summary['lines']
    )


def _order_lines_am(summary):
    return '\n'.join(
        f"• {line['quantity']}x {line['name']}"
        + (f" ({line['variant']})" if line['variant'] else '')
        + (f" + {', '.join(line['add_ons'])}" if line['add_ons'] else '')
        + f" - {format_price(line['subtotal_etb'])}"
        for line in summary['lines']
    )


def _order_summary_reply(summary, lead_en, lead_am, tail_en='', tail_am=''):
    en = [lead_en, _order_lines_en(summary),
          f"Subtotal: {format_price(summary['subtotal_etb'])}"]
    am = [lead_am, _order_lines_am(summary),
          f"ንጥረ ድምር፦ {format_price(summary['subtotal_etb'])}"]
    if summary['order_type'] == 'DELIVERY':
        fee = format_price(summary['delivery_fee_etb'])
        fee_line_en = f"Delivery fee: {fee}"
        fee_line_am = f"የማድረስ ክፍያ፦ {fee}"
        if summary['delivery_zone']:
            fee_line_en += f" ({summary['delivery_zone']})"
            fee_line_am += f" ({summary['delivery_zone']})"
        en.append(fee_line_en)
        am.append(fee_line_am)
    en.append(f"Total: {format_price(summary['total_etb'])}")
    am.append(f"ጠቅላላ፦ {format_price(summary['total_etb'])}")
    if tail_en:
        en.append(tail_en)
        am.append(tail_am)
    return bilingual('\n'.join(en), '\n'.join(am))


def _detect_order_type_and_address(text):
    from .ordering import detect_order_type, extract_address

    return detect_order_type(text), extract_address(text)


#: Words that talk about ordering rather than name a product. Quoted back in the
#: reply, "i wanna cheese burger for me and my friend" must read "cheese burger",
#: not the whole sentence.
_ORDER_PHRASE_NOISE = {
    'deliver', 'delivery', 'deliveries', 'pickup', 'takeaway', 'collect', 'collection',
    'dine', 'dinein', 'table', 'restaurant', 'reservation', 'reserve', 'book', 'booking',
    'one', 'two', 'three', 'some', 'extra', 'also', 'tonight', 'today', 'soon',
    'እባክዎ', 'እባክልኝ', 'ለእኔ', 'አንድ', 'ሁለት', 'ሦስት',
    'ማድረስ', 'መደብር', 'መረከብ', 'እዛው', 'መመገብ', 'ቦታ', 'ትዕዛዝ',
}


def _requested_product_phrase(text):
    """The product words the customer used, for quoting back in the reply."""
    from .retriever import STOPWORDS, tokenize

    words = []
    for token in tokenize(text):
        if token in STOPWORDS or token in _ORDER_PHRASE_NOISE:
            continue
        if not token.isalpha():
            continue
        # English filler is short and already filtered above; Amharic product
        # words can be two characters ("ቡና"), so only English gets a length floor.
        if token.isascii() and len(token) < 3:
            continue
        words.append(token)
    return ' '.join(words[:4])


def _pick_named_items(text, items):
    """
    Narrow several matching menu items down to the ones the customer named.

    "i wanna cheese burger" must add the cheeseburger, not every burger whose
    description happens to mention cheese. A bare "a burger" names no product
    beyond the category, so nothing is added and the customer chooses instead.

    Returns (chosen, contested): `chosen` is the unique best match, `contested`
    the equally good options to offer back.
    """
    from .retriever import CATEGORY_KEYWORD_WORDS, STOPWORDS, _plural_forms, tokenize

    words = [t for t in tokenize(text)
             if t.isalpha() and t not in STOPWORDS
             and (not t.isascii() or len(t) >= 3)]
    # A word that only names a category ("burger", "coffee") does not single an
    # item out; anything else ("cheese", "masala") does.
    meaningful = [w for w in words
                  if not any(form in CATEGORY_KEYWORD_WORDS for form in _plural_forms(w))]

    def hits(item):
        name = item.name.lower()
        return sum(1 for w in words if w in name)

    if len(items) == 1 or not meaningful:
        # One match is already the answer; only a category word was given, so
        # every match is as good as the next and the customer picks.
        return ([items[0]] if len(items) == 1 else []), ([] if len(items) == 1 else items[:4])

    ranked = sorted(items, key=lambda i: (-hits(i), i.name))
    best = hits(ranked[0])
    if best <= 0:
        return [], items[:4]
    top = [i for i in ranked if hits(i) == best]
    if len(top) == 1:
        return top, []
    return [], top


def _order_opening_reply(text, contested=None):
    """
    The customer started an order; turn whatever they said into the next step.

    An indirect request ("i wanna cheese burger for me and my friend") is read
    as an order: say plainly when the product is not on the menu, show the
    closest things we do sell, and give every way an order can be fulfilled -
    or offer to book a table instead. The customer can then simply choose.
    """
    from .retriever import detect_intent, list_menu

    phrase = _requested_product_phrase(text)
    _, _, category = detect_intent(text)
    suggestions = list_menu(category_slug=category, limit=4) if category else []

    if contested:
        quoted = f' "{phrase}"' if phrase else ''
        en = [f"We have a few that match{quoted}. Which one would you like?"]
        am = [f"በጥቂት ተመሳሳዮች አልቋል{quoted}. የትኛውን ይፈልጋሉ?"]
        suggestions = contested
    elif phrase and not category:
        en = [f"I understand you would like to order {phrase}, but we do not have "
              f"{phrase} on our menu."]
        am = [f"{phrase} ለማዘዝ እንደሚፈልጉ ተረድቻለሁ፤ ግን {phrase} በሜኑአችን ውስጥ የለም።"]
        if not suggestions:
            suggestions = list_menu(limit=4)
        if suggestions:
            en.append("Here is what we do have that is closest:")
            am.append("በጣም ተመሳሳይ የምንቀርባቸው፦")
    elif category and suggestions:
        category_name = suggestions[0].category.name
        en = [f"Happy to take your order. These are our {category_name} items:"]
        am = [f"ትዕዛዝዎን በደስታ እንቀበላለን። የ{category_name} ምርቶችአችን፦"]
    else:
        en = ["Happy to take your order. Which items from the menu would you like?"]
        am = ["ትዕዛዝዎን በደስታ እንቀበላለን። ከሜኑ ምን አይነት ምርት ይፈልጋሉ?"]

    payload = []
    if suggestions:
        cat_en, cat_am = _catalog(suggestions, limit=4)
        en.append(cat_en)
        am.append(cat_am)
        payload = [_item_payload(i) for i in suggestions[:4]]
        en.append("Would you like one of these? You can order for delivery, collect from "
                  "the shop, or dine in - or if you would rather book a table, I can help "
                  "with a reservation.")
        am.append("አንዱን ይፈልጋሉ? ለማድረስ፣ ከመደብር መረከብ ወይም እዛው መመገብ በማዘዝ ይችላሉ - "
                  "ወይም ጠረጴዛ ማስያዝ ከፈለጉ ልረዳዎት እችላለሁ።")
    else:
        en.append("Would that be delivery, store pickup, or dining in - or would you rather "
                  "book a table?")
        am.append("እንዲደርስዎ፣ ከመደብር መረከብ ወይስ እዛው መመገብ ይፈልጋሉ - ወይም ጠረጴዛ ማስያዝ ይፈልጋሉ?")

    return bilingual('\n'.join(en), '\n'.join(am)), payload, {'action': 'collect_order_details'}


def handle_order_intent(intent, text, staged, user=None):
    """
    Deterministic ordering: add items, read back the order, place it, or list
    the customer's own orders.

    Reached when the language model is switched off or its answer could not be
    verified, so the assistant can still take a real order without a model.
    """
    from . import ordering as ordering_service
    from .retriever import find_menu_items, normalize_amharic_digits
    from .ordering import detect_order_type, extract_address

    if intent == 'order_status':
        if 'RES-' in text.upper():
            return handle_reservation_status(text, {}, user=user)

        import re
        from apps.orders.models import Order
        ord_match = re.search(r'(ORD-\d{8}-[A-Za-z0-9]{4}|BH-\d+)', text, re.I)
        if ord_match:
            code = ord_match.group(1).upper()
            found_order = Order.objects.filter(order_number__iexact=code).prefetch_related('items').first()
            if found_order and (not user or not user.is_authenticated or (hasattr(user, 'is_manager_or_admin') and user.is_manager_or_admin()) or found_order.customer == user):
                data = ordering_service.serialize_order(found_order)
                en = f"Here is the status for order {data['order_number']}:\n• Status: {data['status_label']}\n• Total: {format_price(data['total_etb'])}"
                am = f"የትዕዛዝ #{data['order_number']} ሁኔታ፦\n• ሁኔታ፦ {data['status_label']}\n• ጠቅላላ፦ {format_price(data['total_etb'])}"
                return bilingual(en, am), [data], {'action': 'none'}

        orders = ordering_service.my_orders(user)
        if not orders:
            en = ("I could not find any orders on your account. "
                  "Once you order, it will show here with its status.")
            am = ("በመለያዎ ውስጥ የተገኘ ምንም ትዕዛዝ የለም። "
                  "ትዕዛዝ ሲሰጡ የትዕዛዙ ሁኔታ እዚህ ጋር ይታያል።")
            return bilingual(en, am), [], {'action': 'none'}

        lines_en, lines_am = [], []
        for order in orders:
            lines_en.append(f"• {order['order_number']} - {order['status_label']} - "
                            f"{format_price(order['total_etb'])}")
            lines_am.append(f"• {order['order_number']} - {order['status_label']} - "
                            f"{format_price(order['total_etb'])}")
        en = "Here are your orders:\n" + '\n'.join(lines_en)
        am = "የእኔ ትዕዛዞች፦\n" + '\n'.join(lines_am)
        return bilingual(en, am), orders, {'action': 'none'}

    if intent == 'order_cancel':
        en = ("I cannot cancel an order from here, and I would not want to guess. "
              "Please open My Orders in your account and cancel it there, or call the Coffee House "
              "and the team will do it for you.")
        am = ("ከዚህ ሆኜ ትዕዛዝ መሰረዝ አልችልም። "
              "እባክዎን በመለያዎ ውስጥ 'የእኔ ትዕዛዞች' የሚለውን ገጽ ከፍተው ይሰርዙ፣ "
              "ወይም ወደ Coffee House ደውለው ሰራተኞቻችን እንዲሰርዙልዎ ያድርጉ።")
        return bilingual(en, am), [], {'action': 'none'}

    # ── order_create ──────────────────────────────────────────────
    order_type = detect_order_type(text)
    address = extract_address(text)

    # Which items does this message name? A delivery or pickup mention can stop the
    # product words from matching ("a croissant, delivery"), so the search is
    # retried once without the fulfilment words.
    named = find_menu_items(text, limit=4)
    if not named:
        named = find_menu_items(_strip_fulfilment_words(text), limit=4)

    # Several items can match one message ("a burger" matches every burger). Only
    # add them all when the customer clearly named more than one; otherwise keep
    # the single item their own words pick out, or ask them to choose.
    contested = []
    if len(named) > 1:
        named, contested = _pick_named_items(text, named)

    if contested:
        answer, payload, meta = _order_opening_reply(text, contested=contested)
        return answer, [], {**meta, 'items': payload}

    # A bare "I want to order", a product we do not stock, or a category too
    # broad to pick from ("i want coffee"): move the order forward with the real
    # options instead of dead-ending.
    if not named:
        if staged.is_empty():
            answer, payload, meta = _order_opening_reply(text)
            return answer, [], {**meta, 'items': payload}

        summary = staged.summary()
        if order_type:
            staged.order_type = order_type
        if address:
            staged.address = address
        summary = staged.summary()

        if not staged.order_type:
            en = ("Good. Would you like that delivered, collected from the shop, or served at a "
                  "table?")
            am = ("ጥሩ። እንዲደርስዎ፣ ከመደብር መረከብ ወይስ እዛው በጠረጴዛ ላይ መመገብ ይፈልጋሉ?")
            return bilingual(en, am), [], {'action': 'collect_order_details'}

        if staged.order_type == 'DELIVERY' and not staged.address:
            en = "Where should we deliver it? Please give me the address."
            am = "የት እንዲደርስዎ ይፈልጋሉ? እባክዎን አድራሻውን ይስጡኝ።"
            return bilingual(en, am), [], {'action': 'collect_order_details'}

        if not staged.is_empty() and _customer_confirmed(text):
            if not ordering_service.is_authenticated_user(user):
                # The customer built the order and is happy with it; only the
                # account is missing. Everything they chose is kept.
                from .auth_gate import sign_in_action, sign_in_answer

                return (sign_in_answer('order_create',
                                       resume_hint=_order_resume_hint(summary)),
                        [],
                        sign_in_action('order_create', pending_intent='order_create'))

            order, error = ordering_service.place_order(
                user, staged, order_type=staged.order_type, address=staged.address)
            if order is None:
                en, am = {
                    'missing_order_type': ("Which delivery option would you like?",
                                           "የትኛውን የመረከቢያ ዘዴ ይመርጣሉ?"),
                    'missing_address': ("Where should we deliver it?",
                                        "የት እንዲደርስዎ ይፈልጋሉ?"),
                    'restaurant_closed': ("We are closed right now, so I cannot take the order yet. "
                                          "Our opening hours are listed whenever you need them.",
                                          "አሁን ዝግ ስለሆንን ትዕዛዝ መቀበል አንችልም። "
                                          "የመክፈቻ ሰዓታችን ሲደርስ በደስታ እናስተናግዳለን።"),
                    'empty_order': ("There is nothing in the order yet.",
                                    "በትዕዛዙ ውስጥ ምንም ነገር የለም።"),
                }.get(error, ("I could not place that order just now. Please try again, or call the "
                              "Coffee House.",
                              "ይህን ትዕዛዝ አሁን መስጠት አልተቻለም። "
                              "እንደገና ይሞክሩ ወይም ለCoffee House ይደውሉ።"))
                return bilingual(en, am), [], {'action': 'none'}

            data = ordering_service.serialize_order(order)
            en = ("Your order is placed.\n\n"
                  f"Order number: {data['order_number']}\n"
                  f"Type: {data['order_type_label']}\n"
                  f"Items: {data['item_count']}\n"
                  f"Total: {format_price(data['total_etb'])}\n\n"
                  "Complete payment on the next step and we will start preparing it.")
            am = ("ትዕዛዝዎ ተጠናቋል!\n\n"
                  f"የትዕዛዝ ቁጥር፦ {data['order_number']}\n"
                  f"ዓይነት፦ {data['order_type_label']}\n"
                  f"ምርቶች፦ {data['item_count']}\n"
                  f"ጠቅላላ፦ {format_price(data['total_etb'])}\n\n"
                  "በቀጣዩ ደረጃ ክፍያውን ያጠናቅቁ፤ ወዲያውኑ ማዘጋጀት እንጀምራለን።")
            return bilingual(en, am), [data], {'action': 'order_placed', 'order': data,
                                               'order_number': data['order_number']}

        tail_en = ("Anything else you would like to add?"
                   if len(summary['lines']) > 1 else "Would you like anything else?")
        tail_am = "ሌላ የሚጨምር ነገር አለ?"
        return _order_summary_reply(
            summary,
            "Here is your order so far:",
            "እስካሁን ያለው ትዕዛዝዎ፦",
            tail_en, tail_am), [], {'action': 'collect_order_details'}

    # Items were named: add each of them.
    added, problems = [], []
    for item in named:
        quantity = _quantity_for(text, item, ordering_service)
        variant, add_ons = _options_for(text, item)
        item_obj, resolved_variant, resolved_add_ons, problem = ordering_service.resolve_order_item(
            item.name, variant, add_ons)
        if item_obj is None:
            problems.append((item.name, problem))
            continue
        staged.add_item(item_obj, quantity=quantity, variant_name=resolved_variant,
                        add_on_names=resolved_add_ons)
        added.append(item_obj)

    if not added:
        if problems:
            names = ', '.join(name for name, _ in problems)
            en = (f"I could not match {names} to anything on our menu right now. "
                  "Could you tell me the item name as it is written on the menu?")
            am = (f"{names} በአሁኑ ሜኑአችን ውስጥ አልተገኘም። "
                  "እባክዎን የምርቱን ስም በሜኑው ላይ እንደተጻፈው ይንገሩን።")
            return bilingual(en, am), [], {'action': 'collect_order_details'}
        en = "I could not match that to anything on our menu. Could you tell me the item name?"
        am = "ይህን በሜኑአችን ላይ ማዛመድ አልቻልኩም። እባክዎን የምርቱን ስም ይንገሩን።"
        return bilingual(en, am), [], {'action': 'collect_order_details'}

    if order_type:
        staged.order_type = order_type
    if address:
        staged.address = address

    summary = staged.summary()

    # A delivery was named in the same breath as the items, so the address is the
    # only thing missing.
    if staged.order_type == 'DELIVERY' and not staged.address:
        answer = _order_summary_reply(
            summary,
            "Added to your order:",
            "ወደ ትዕዛዝዎ ተጨምሯል፦",
            "Where should we deliver it? Please give me the address.",
            "የት እንዲደርስዎ ይፈልጋሉ? እባክዎን አድራሻውን ይስጡኝ።")
        return answer, [], {'action': 'collect_order_details'}

    return _order_summary_reply(
        summary,
        "Added to your order:",
        "ወደ ትዕዛዝዎ ተጨምሯል፦",
        "Anything else, and delivery, pickup or dining in?",
        "ሌላ የሚጨምሩት ነገር አለ? እንዲሁም እንዲደርስዎ፣ መረከብ ወይስ እዛው መመገብ ይፈልጋሉ?"), [], {'action': 'collect_order_details'}


#: How-the-order words that are not product words. Leaving them in makes every
#: content word fail to match an item, so "a croissant, delivery" finds nothing.
_FULFILMENT_NOISE = {
    'delivery', 'deliver', 'delivered', 'home', 'pickup', 'takeaway', 'take',
    'collection', 'collect', 'dine', 'dinein', 'sit', 'table', 'restaurant',
    'order', 'orders', 'please', 'want', 'like', 'and', 'for', 'me', 'my', 'to',
    'ማድረስ', 'መደብር', 'መረከብ', 'እዛው', 'መመገብ', 'ቦታ', 'ትዕዛዝ', 'እባክዎ',
}


def _strip_fulfilment_words(text):
    from .retriever import tokenize

    kept = [token for token in tokenize(text) if token not in _FULFILMENT_NOISE]
    return ' '.join(kept)


_CONFIRM_WORDS = ('yes', 'confirm', 'place it', 'place order', 'that\'s all', "that's all",
                  'go ahead', 'done', 'አዎ', 'እሺ', 'ተረጋግጧል', 'አረጋግጥ')


def _order_resume_hint(summary):
    """Describe the staged order so the sign-in message can refer to it."""
    if not summary or not summary['item_count']:
        return None
    names = ', '.join(f"{line['quantity']}x {line['name']}" for line in summary['lines'][:3])
    if len(summary['lines']) <= 3:
        return f'your order ({names})', f'ትዕዛዝዎን ({names})'
    return f'your order ({names} and more)', f'ትዕዛዝዎን ({names} እና ተጨማሪ)'


def _customer_confirmed(text):
    low = (text or '').lower()
    return any(word in low for word in _CONFIRM_WORDS)


def _quantity_for(text, item, ordering_service):
    """Read a quantity that belongs to this specific item."""
    import re

    from .retriever import normalize_amharic_digits

    low = normalize_amharic_digits((text or '').lower())
    escaped = re.escape(item.name.lower())
    # "2 cappuccinos" and "cappuccino x2" both mean the same thing.
    after = re.search(rf'{escaped}[^,.]{{0,20}}?\b(\d{{1,2}})\b', low)
    before = re.search(rf'\b(\d{{1,2}})\b[^,]{{0,20}}?{escaped}', low)
    match = after or before
    if not match:
        return 1
    try:
        return max(1, min(int(match.group(1)), 20))
    except (TypeError, ValueError):
        return 1


def _options_for(text, item):
    """Pick a variant or add-on out of free text, if the customer mentioned one."""
    import re

    low = (text or '').lower()
    variant = ''
    for candidate in item.variants.all():
        if re.search(rf'(?<!\w){re.escape(candidate.name.lower())}(?!\w)', low):
            variant = candidate.name
            break
    add_ons = [a.name for a in item.add_ons.all()
               if re.search(rf'(?<!\w){re.escape(a.name.lower())}(?!\w)', low)]
    return variant, add_ons


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


# ── Food / drink sub-menu helpers ────────────────────────────────────

FOOD_ONLY_SLUGS = [
    'artisanal-burgers', 'wood-fired-pizza', 'shawarma-wraps', 'fast-food', 'bakery-pastry',
]
DRINK_ONLY_SLUGS = [
    'micro-lot-coffee', 'espresso-infusions', 'premium-tea',
]


def _build_categorized_listing(items, header_en, header_am):
    """Group items by category and return a formatted bilingual answer + payload."""
    from collections import defaultdict
    by_cat = defaultdict(list)
    for item in items:
        by_cat[item.category.name].append(item)

    en_parts = [header_en]
    am_parts = [header_am]
    payload = []

    CATEGORY_AM_NAMES = {
        'Micro-Lot Coffee': 'ልዩ ቡና (Micro-Lot Coffee)',
        'Espresso & Infusions': 'ኢስፕሬሶ እና ቅመሞች (Espresso & Infusions)',
        'Premium Tea': 'ፕሪሚየም ሻይ (Premium Tea)',
        'Artisanal Burgers': 'አርቲሳናል በርገር (Artisanal Burgers)',
        'Wood-Fired Pizza': 'ፒዛ (Wood-Fired Pizza)',
        'Shawarma & Wraps': 'ሻዋርማ እና ወራፕ (Shawarma & Wraps)',
        'Fast Food Favourites': 'ፈጣን ምግብ (Fast Food)',
        'Bakery & Pastry': 'መጋገሪያ እና ኬክ (Bakery & Pastry)',
    }

    for cat_name, cat_items in by_cat.items():
        am_cat_name = CATEGORY_AM_NAMES.get(cat_name, cat_name)
        en_parts.append(f"\n**{cat_name}**")
        am_parts.append(f"\n**{am_cat_name}**")
        for item in cat_items:
            en_parts.append(f"  • {_item_en(item, include_desc=False)}")
            am_parts.append(f"  • {_item_am(item, include_desc=False)}")
            payload.append(_item_payload(item))

    en_parts.append("\nWould you like more details or prices on any specific item?")
    am_parts.append("\nስለ ተወሰነ ምርት ተጨማሪ ዝርዝር ወይም ዋጋ ይፈልጋሉ?")

    return bilingual('\n'.join(en_parts), '\n'.join(am_parts)), payload, {'action': 'none'}


def build_food_only_answer(query):
    """
    Return a menu listing for food categories only (no coffee/drinks).
    Called when the customer asks "What food do you have?" or similar.
    """
    all_food = []
    for slug in FOOD_ONLY_SLUGS:
        all_food.extend(list_menu(category_slug=slug))

    if not all_food:
        en = ("I'm sorry, I couldn't find any food items available at the moment. "
              "Please ask our staff or check the full menu.")
        am = ("ይቅርታ፣ አሁን ምግብ ምርቶች አልተገኙም። "
              "እባክዎ ሰራተኞቻችንን ይጠይቁ ወይም ሙሉ ሜኑ ይመልከቱ።")
        return bilingual(en, am), [], {'action': 'none'}

    header_en = f"Here is our food menu ({len(all_food)} items, by category):"
    header_am = f"የምግብ ሜኑአችን ({len(all_food)} ምርቶች፣ በምድብ)፦"
    return _build_categorized_listing(all_food, header_en, header_am)


def build_drink_only_answer(query):
    """
    Return a menu listing for drink categories only (coffee, teas, infusions).
    Called when the customer asks "What drinks are available?" or similar.
    """
    all_drinks = []
    for slug in DRINK_ONLY_SLUGS:
        all_drinks.extend(list_menu(category_slug=slug))

    if not all_drinks:
        en = ("I'm sorry, I couldn't find any drinks available at the moment. "
              "Please ask our staff or check the full menu.")
        am = ("ይቅርታ፣ አሁን መጠጥ ምርቶች አልተገኙም። "
              "እባክዎ ሰራተኞቻችንን ይጠይቁ ወይም ሙሉ ሜኑ ይመልከቱ።")
        return bilingual(en, am), [], {'action': 'none'}

    header_en = f"Here are our drinks ({len(all_drinks)} items, by category):"
    header_am = f"መጠጦቻችን ({len(all_drinks)} ምርቶች፣ በምድብ)፦"
    return _build_categorized_listing(all_drinks, header_en, header_am)