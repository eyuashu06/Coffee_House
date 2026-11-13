"""
The language-model agent.

This is the conversational layer that makes the assistant answer like ChatGPT or
Gemini: the model reads the conversation, decides which tools to call, reads
their results, and writes the reply. It never states a fact that did not come
out of a tool.

Three properties are enforced here rather than requested in the prompt, because
a prompt is a request and these are guarantees:

1. **The tools are the only source of facts.** Prices, availability, opening
   hours and reservation state all come from the database through the functions
   in `retriever`, `reservations` and `ordering`. The model has no memory of
   them and is given nothing else.

2. **Account-bound tools refuse to run for a guest.** `create_reservation`,
   `place_order`, `find_reservations`, `cancel_reservation` and `my_orders` check
   the caller and return `auth_required` instead of acting. The model can be
   asked nicely to book a table for someone who has not signed in; it still
   cannot do it.

3. **The reply is verified before it is sent.** Every price-like number and every
   confirmation claim in the model's answer must be traceable to a tool result.
   Anything else is discarded and the deterministic engine answers instead, which
   means a wrong answer costs a customer their time rather than their money.
"""

import json
import logging
import re

logger = logging.getLogger(__name__)

DEFAULT_MODEL = 'gemini-2.0-flash'
MAX_TOOL_ROUNDS = 6
MAX_HISTORY_TURNS = 10

#: Phrases that claim something was done. Only allowed when a tool actually did it.
COMMIT_PHRASES = [
    'has been confirmed', 'is confirmed', 'your reservation has been', "i've reserved",
    "i have reserved", 'reservation created', 'has been placed', 'order placed',
    'your order is placed', 'order created', 'i have added', "i've added", 'added to your',
    'successfully', 'has been cancelled', 'has been canceled',
]


SYSTEM_PROMPT = """# Coffee House AI Customer Assistant

## Role
You are an intelligent, friendly, bilingual customer-service assistant for Coffee House (Buna Hub) in Addis Ababa, Ethiopia.

Your primary responsibilities are:
1. Answer customer questions.
2. Recommend menu items.
3. Help customers place orders.
4. Help customers reserve tables.
5. Provide accurate business information.
6. Understand English, Amharic, and Amharic written using Latin characters (transliteration).

## Language Understanding
Understand common Amharic transliterations (Amglish / Latin Fidel), including:
- Selam = Hello
- Bota meyaz felge neber = I wanted to reserve a table.
- Le 4 sewoch = For four people.
- Nege = Tomorrow.
- Zare = Today.
- Seat = S'at / time, depending on context (e.g. seat 2 = 2 o'clock Ethiopian time).
- Botawn yazklign = Give me the location.
- Ezaw enazalen = We are coming / We are on our way.

Do not require customers to write grammatically correct Amharic.
Respond in the language the customer uses. If they use Amharic transliteration, respond in natural Amharic script (Ge'ez) in the "am" field, and provide the corresponding English translation in the "en" field.

## Intent Recognition
Classify each customer message into one of these intents:
- GREETING
- MENU_INQUIRY
- PRODUCT_RECOMMENDATION
- PRODUCT_AVAILABILITY
- ORDER_CREATE
- ORDER_UPDATE
- ORDER_STATUS
- TABLE_RESERVATION
- RESERVATION_UPDATE
- RESERVATION_CANCEL
- BUSINESS_HOURS
- BUSINESS_LOCATION
- CONTACT_INFORMATION
- GENERAL_QUESTION
- UNKNOWN

A customer can have multiple intents in one message.

## Conversation Memory
Maintain conversation context throughout the conversation.
For reservations, remember:
- Customer name
- Customer phone number
- Number of guests (e.g. "me and my friend" = 2 guests)
- Reservation date
- Reservation time
- Table size or seating preference
- Special requests
- Reservation status

For orders, remember:
- Selected products
- Quantities
- Sizes
- Customizations
- Total price
- Order status

Never discard previously provided information unless the customer changes it.
Ask only for missing information instead of repeating questions.

## Time & Operating Hours Understanding
Understand both Ethiopian Local Time (LT / የኢትዮጵያ ሰዓት) and Standard (US/24-hour) time:
- Cafe operating hours: Mon-Thu 7:00 AM – 9:00 PM (1:00 ጧት – 3:00 ማታ LT), Fri-Sat 7:00 AM – 10:00 PM (1:00 ጧት – 4:00 ማታ LT), Sun 8:00 AM – 9:00 PM (2:00 ጧት – 3:00 ማታ LT).
- Ethiopian Time conversion during cafe hours:
  • 6:00 LT (6 ሰዓት) = 12:00 PM (midday / lunch)
  • 12:00 LT (12 ሰዓት) = 6:00 PM (18:00 dinner)
  • 1:00 LT (1 ሰዓት) night = 7:00 PM (19:00 dinner)
  • 2:00 LT (2 ሰዓት) night = 8:00 PM (20:00 dinner)
  • 3:00 LT (3 ሰዓት) night = 9:00 PM (21:00 night)
  • 7:00 LT (7 ሰዓት) = 1:00 PM (13:00 lunch/afternoon)
- When a customer specifies a time outside operating hours, explain our operating interval in both Ethiopian and US formats, and offer available alternative slots.

## Reservation Workflow
When a customer requests a reservation:
1. Recognize the reservation intent.
2. Ask for the number of guests if missing ("me and my friend" = 2 people).
3. Ask for the reservation date if missing. Interpret relative dates using the current date and Ethiopia timezone (Africa/Addis_Ababa).
4. Ask for the reservation time if missing. Understand Ethiopian time (e.g. 6 LT = 12:00 PM lunch).
5. Ask for customer name and phone number (Ethiopian format e.g. 0911223344) to confirm and verify the guest.
6. Check real availability using `check_table_availability`.
7. If available and all details collected, create the reservation using `create_reservation`.
8. Confirm only after successful database creation.
If a requested time is unavailable, suggest actual available alternatives returned by the system in both formats.
Never invent available tables or confirm an uncreated reservation.

## Order Workflow
When a customer wants to order:
1. Identify the requested product.
2. Check that the product exists in the menu (`search_menu`, `get_item_detail`).
3. Check availability.
4. Ask for quantity and size if necessary.
5. Add the selected item to the cart using `add_to_order`.
6. Show the order summary and total using `view_order`.
7. Ask the customer to confirm.
8. Submit the order using `place_order` (collect customer name and phone).
9. Return the actual order number, status, and estimated preparation time (e.g. 20 min). Guide the customer to proceed to payment to finalize the order.
Never tell a customer an order was placed before the database confirms success.

## Business Information
Use the database or business-information tools (`get_venue_info`, `search_knowledge_base`, `search_menu`) for:
- Menu and prices
- Product availability
- Opening hours
- Location
- Contact information
- Table availability
Do not invent prices, products, opening hours, or business policies.

## General Conversation Rules
- Be friendly, natural, and professional.
- Keep responses concise (2-3 sentences for simple questions).
- Understand follow-up messages.
- Do not repeat the welcome message unnecessarily.
- Do not recommend products when the customer is asking to reserve a table.
- Do not answer that information is unavailable before checking the relevant tool.
- When customers say they are coming ("ezaw enazalen"), acknowledge them naturally and warmly.
- If the message is unclear, ask one short clarification question.
- Your goal is not just to answer questions. Your goal is to help customers successfully complete their orders and reservations.

STYLE
Return your reply strictly as JSON: {"en": "...", "am": "..."} and nothing else. Prices in ETB. No markdown headers or emojis inside JSON string fields."""


# ── Tool declarations ─────────────────────────────────────────────────

def _tool(name, description, properties=None, required=None):
    return {
        'name': name,
        'description': description,
        'parameters': {
            'type': 'object',
            'properties': properties or {},
            'required': required or [],
        },
    }


def tool_declarations(include_private):
    """
    The tool list. Private tools are hidden entirely from guests rather than
    exposed and refused, so the model is never tempted to call one.
    """
    tools = [
        _tool('search_menu',
              'Search the live menu. Use for anything about what is sold, what exists, or browsing a '
              'category. Returns items with their real prices and whether they are available.',
              {'query': {'type': 'string', 'description': 'What the customer is asking about (e.g. coffee, burger, latte)'},
               'category': {'type': 'string', 'description': 'Optional category slug (e.g. micro-lot-coffee, espresso-infusions, premium-tea, artisanal-burgers, wood-fired-pizza, shawarma-wraps, fast-food, bakery-pastry)'},
               'available_only': {'type': 'boolean',
                                  'description': 'Only currently available items. Default true.'}}),
        _tool('get_item_detail',
              'Full detail for one menu item: description, price, variants and add-ons with their '
              'prices, and availability.',
              {'name': {'type': 'string', 'description': 'Exact item name from the menu'}},
              ['name']),
        _tool('get_venue_info',
              'Opening hours, whether the cafe is open right now, address, phone, email, cafe background '
              'and the average preparation time.'),
        _tool('search_knowledge_base',
              'Search the cafe knowledge base: brewing science (pour over, V60, Dutch cold drip, Jebena), coffee bean origins, and pastry pairings.',
              {'query': {'type': 'string', 'description': 'Topic or keywords to search'}},
              ['query']),
        _tool('list_categories',
              'Every menu category with its item count.'),
        _tool('check_table_availability',
              'Check whether a table is free for a date, time and party size. Returns the answer '
              'and, when full, alternative times that are free.',
              {'date': {'type': 'string', 'description': 'YYYY-MM-DD'},
               'time': {'type': 'string', 'description': 'HH:MM 24-hour'},
               'guests': {'type': 'integer', 'description': 'Number of people'}},
              ['date', 'time', 'guests']),
        _tool('add_to_order',
              'Add an item to the customer\'s order. Use for "I want a latte", "two cappuccinos", '
              '"add an extra shot". Re-adding the same item with the same options increases the '
              'quantity. Returns the running order and total.',
              {'name': {'type': 'string', 'description': 'Exact item name from the menu'},
               'quantity': {'type': 'integer', 'description': 'How many. Default 1.'},
               'variant': {'type': 'string', 'description': 'Size or variant name, if the item has any'},
               'add_ons': {'type': 'array', 'items': {'type': 'string'},
                           'description': 'Add-on names for this item'}},
              ['name']),
        _tool('remove_from_order',
              'Remove an item from the order, or reduce its quantity.',
              {'name': {'type': 'string'},
               'quantity': {'type': 'integer', 'description': 'How many to remove. Omit to remove the line.'}},
              ['name']),
        _tool('view_order',
              'The current order with real prices, plus the running total and delivery fee.'),
        ]

    # Ordering and booking are open to guests, so these two tools are always
    # available. The name and phone number are required for a guest and ignored
    # for a signed-in customer.
    tools.append(_tool('place_order',
                       'Place the order. Works for guests too: for a guest, pass the '
                       'contact_name and contact_phone they gave you. Confirm the order type and '
                       'delivery address with the customer first.',
                       {'order_type': {'type': 'string', 'enum': ['DELIVERY', 'PICKUP', 'DINE_IN']},
                        'address': {'type': 'string',
                                    'description': 'Delivery address. Required for DELIVERY.'},
                        'contact_name': {'type': 'string',
                                         'description': 'Name on the order (guest orders)'},
                        'contact_phone': {'type': 'string',
                                          'description': 'Phone number for the order (guest orders)'}}))
    tools.append(_tool('create_reservation',
                       'Book a table. Works for guests too: pass the name and phone number they '
                       'gave you. Only call this after check_table_availability says the slot is '
                       'free. The result is the only thing that makes a booking real.',
                       {'date': {'type': 'string', 'description': 'YYYY-MM-DD'},
                        'time': {'type': 'string', 'description': 'HH:MM 24-hour'},
                        'guests': {'type': 'integer'},
                        'name': {'type': 'string', 'description': 'Name for the booking'},
                        'phone': {'type': 'string',
                                  'description': 'Phone number for the booking (guest bookings)'}},
                       ['date', 'time', 'guests', 'name']))

    if include_private:
        tools += [
            _tool('find_reservations',
                  "The signed-in customer's reservations, so they can check or cancel one.",
                  {}),
            _tool('cancel_reservation',
                  'Cancel one of the signed-in customer\'s reservations. Requires an account.',
                  {'reservation_id': {'type': 'integer'}},
                  ['reservation_id']),
            _tool('my_orders',
                  "The signed-in customer's own orders with their status and totals.",
                  {'limit': {'type': 'integer', 'description': 'How many. Default 5.'}}),
        ]
    return tools


# ── Tool implementations ─────────────────────────────────────────────

class ToolContext:
    """Everything a tool call needs, plus the facts the answer must stick to."""

    def __init__(self, user=None, staged=None, session=None):
        self.user = user if (user and getattr(user, 'is_authenticated', False)) else None
        self.staged = staged
        self.session = session
        # Clock hours pass as prose ("at 19:00"), so they start out allowed.
        # Kept separately from the numbers a tool actually returned, because a
        # wait time like "20 minutes" must not inherit that allowance.
        self.allowed_numbers = {10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 30, 45, 60}
        self.tool_numbers = set()
        self.created_reservation = False
        self.placed_order = None
        self.auth_required = False
        self.mentions = []
        self.seen_tools = set()
        self.created_reservation_obj = None
        self.placed_order_obj = None

    def remember_number(self, value):
        try:
            number = float(value)
        except (TypeError, ValueError):
            return
        self.allowed_numbers.add(round(number, 2))
        self.allowed_numbers.add(round(number))
        self.tool_numbers.add(round(number, 2))
        self.tool_numbers.add(round(number))


def _clean(text, limit=1200):
    text = re.sub(r'\s+', ' ', (text or '').strip())
    return text[:limit]


def _menu_payload(items, ctx):
    payload = []
    for item in items:
        data = {
            'name': item.name,
            'category': item.category.name,
            'price_etb': float(item.base_price_etb),
            'available': item.is_available,
        }
        description = _clean(item.description, 220)
        if description:
            data['description'] = description
        if list(item.variants.all()):
            data['variants'] = [
                {'name': v.name, 'extra_etb': float(v.price_modifier_etb)}
                for v in item.variants.all()]
        if list(item.add_ons.all()):
            data['add_ons'] = [
                {'name': a.name, 'price_etb': float(a.price_etb)}
                for a in item.add_ons.all()]
        ctx.remember_number(item.base_price_etb)
        for variant in item.variants.all():
            ctx.remember_number(variant.price_modifier_etb)
        for add_on in item.add_ons.all():
            ctx.remember_number(add_on.price_etb)
        payload.append(data)
    ctx.mentions.extend(item.name for item in items)
    return payload


def _order_payload(summary, ctx):
    ctx.remember_number(summary['subtotal_etb'])
    ctx.remember_number(summary['delivery_fee_etb'])
    ctx.remember_number(summary['total_etb'])
    lines = []
    for line in summary['lines']:
        ctx.remember_number(line['unit_price_etb'])
        ctx.remember_number(line['subtotal_etb'])
        lines.append({
            'name': line['name'],
            'quantity': line['quantity'],
            'variant': line['variant'],
            'add_ons': line['add_ons'],
            'unit_price_etb': float(line['unit_price_etb']),
            'line_total_etb': float(line['subtotal_etb']),
        })
    return {
        'items': lines,
        'item_count': summary['item_count'],
        'subtotal_etb': float(summary['subtotal_etb']),
        'delivery_fee_etb': float(summary['delivery_fee_etb']),
        'total_etb': float(summary['total_etb']),
        'delivery_zone': summary['delivery_zone'],
        'order_type': summary['order_type'],
        'delivery_address': summary['address'],
        'ready_to_place': summary['ready'],
    }


def execute_tool(name, args, ctx):
    """
    Run one tool call. Always returns a dict; never raises into the model loop.

    Refusals are returned as normal tool results (e.g. `{'error': 'auth_required'}`)
    because a refusal the model can read and explain is far better than an error
    it has to guess at.
    """
    from . import ordering as ordering_service
    from . import reservations as reservation_service
    from .retriever import get_item_by_name, get_venue_info, list_menu

    args = args or {}

    if name == 'search_menu':
        items = ordering_service.search_menu(
            args.get('query', ''), limit=6, category_slug=args.get('category') or None,
            available_only=args.get('available_only', True))
        if not items:
            return {'found': False,
                    'note': 'No menu item matched. Do not describe an item you did not get back.'}
        return {'found': True, 'items': _menu_payload(items, ctx)}

    if name == 'get_item_detail':
        item = get_item_by_name(args.get('name', ''))
        if item is None:
            matches = ordering_service.search_menu(args.get('name', ''), limit=1, available_only=False)
            item = matches[0] if matches else None
        if item is None:
            return {'found': False, 'note': 'That item is not on our menu. Do not invent one.'}
        data = ordering_service.item_detail(item)
        ctx.remember_number(data['price_etb'])
        for variant in data['variants']:
            ctx.remember_number(variant['extra_etb'])
        for add_on in data['add_ons']:
            ctx.remember_number(add_on['price_etb'])
        ctx.mentions.append(data['name'])
        return {'found': True, 'item': data}

    if name == 'get_venue_info':
        venue = get_venue_info()
        ctx.remember_number(venue.default_prep_minutes)
        for token in _NUMBER_RE.findall(f"{venue.opening_hours} {venue.contact_phone} {venue.address}"):
            ctx.remember_number(token)
        return {
            'name': 'Buna Hub (Coffee House)',
            'open_now': venue.is_open,
            'opening_hours': venue.opening_hours,
            'address': venue.address,
            'phone': venue.contact_phone,
            'email': venue.contact_email,
            'average_prep_minutes': venue.default_prep_minutes,
            'max_reservation_guests': reservation_service.max_guests(),
            'description': 'Buna Hub is a premier specialty coffee house and restaurant in Addis Ababa, celebrating authentic Ethiopian coffee heritage alongside wood-fired pizza, smash burgers, wraps, and fresh pastries.',
        }

    if name == 'search_knowledge_base':
        from .retriever import search_knowledge_base
        results = search_knowledge_base(args.get('query', ''))
        if not results:
            return {'found': False, 'note': 'No matching knowledge base article found.'}
        for r in results:
            for token in _NUMBER_RE.findall(f"{r.title} {r.content}"):
                ctx.remember_number(token)
        return {'found': True, 'articles': [
            {'title': r.title, 'category': r.category, 'content': r.content}
            for r in results
        ]}

    if name == 'list_categories':
        from apps.menu.models import Category
        return {'categories': [
            {'name': category.name, 'slug': category.slug,
             'items_available': category.items.filter(is_available=True).count()}
            for category in Category.objects.all()
        ]}

    if name == 'check_table_availability':
        available, detail = reservation_service.check_availability(
            args.get('date'), args.get('time'), args.get('guests'))
        if available:
            ctx.mentions.append('availability')
            return {'available': True, 'detail': detail}

        if detail == 'too_large':
            ctx.remember_number(reservation_service.max_guests())
            return {'available': False, 'detail': 'too_large',
                    'max_guests': reservation_service.max_guests(),
                    'note': 'Tell them the limit and suggest calling the cafe.'}
        if detail == 'invalid_datetime':
            return {'available': False, 'detail': 'invalid_datetime',
                    'note': 'The date or time was not understood. Ask again more simply.'}

        suggestions = reservation_service.suggest_alternative_times(
            args.get('date'), args.get('time'), args.get('guests'))
        return {'available': False, 'detail': 'fully_booked', 'alternative_times': suggestions}

    if name == 'add_to_order':
        item, variant, add_ons, problem = ordering_service.resolve_order_item(
            args.get('name'), args.get('variant'), args.get('add_ons'))
        if item is None:
            return {'added': False, 'error': problem,
                    'note': {'not_on_menu': 'That product is not on our menu. Say so, then '
                                            'search_menu for the closest real items and offer '
                                            'them together with the fulfilment choices: '
                                            'delivery, store pickup, dine-in, or a table '
                                            'reservation.',
                             'unavailable': 'That item is sold out right now. Say so.',
                             'missing_item_name': 'No item name was given.'}.get(problem, '')}
        summary, status = ctx.staged.add_item(
            item, quantity=args.get('quantity', 1), variant_name=variant, add_on_names=add_ons)
        if status == 'too_many_lines':
            return {'added': False, 'error': status,
                    'note': 'The order has too many separate lines. Ask them to finalise or trim it.'}
        ctx.mentions.append(item.name)
        return {'added': True, 'status': status, 'order': _order_payload(summary, ctx)}

    if name == 'remove_from_order':
        summary, status = ctx.staged.remove_item(args.get('name'), args.get('quantity'))
        if status == 'not_in_order':
            return {'removed': False, 'error': status, 'order': _order_payload(summary, ctx)}
        return {'removed': True, 'status': status, 'order': _order_payload(summary, ctx)}

    if name == 'view_order':
        return {'order': _order_payload(ctx.staged.summary(), ctx)}

    if name == 'place_order':
        staged = ctx.staged
        order_type = (args.get('order_type') or staged.order_type or '').upper()
        if order_type:
            staged.order_type = order_type
        if args.get('address'):
            staged.address = args['address']
        if args.get('contact_name'):
            staged.contact_name = args['contact_name']
        if args.get('contact_phone'):
            staged.contact_phone = args['contact_phone']
        order, error = ordering_service.place_order(
            ctx.user, staged, order_type=order_type, address=args.get('address'))
        if order is None:
            messages = {
                'missing_order_type': 'Ask whether they want delivery, pickup or to dine in.',
                'missing_address': 'Ask for a delivery address.',
                'missing_contact_name': 'Ask for the name to put on the order.',
                'missing_contact_phone': 'Ask for a phone number for the order.',
                'empty_order': 'There is nothing in the order yet.',
                'restaurant_closed': 'The cafe is closed right now, so orders cannot be taken. Say so.',
                'invalid_order': 'The order could not be created. Apologise and suggest calling.',
            }
            if error in ('missing_contact_name', 'missing_contact_phone'):
                return {'placed': False, 'error': error,
                        'note': messages[error] + ' Do not claim the order was placed.'}
            return {'placed': False, 'error': error, 'note': messages.get(error, '')}
        ctx.placed_order = order
        ctx.placed_order_obj = ordering_service.serialize_order(order)
        ctx.remember_number(order.total_amount_etb)
        ctx.remember_number(order.subtotal_etb)
        return {'placed': True, 'order': ordering_service.serialize_order(order),
                'estimated_prep_minutes': order.estimated_prep_minutes,
                'note': f'This order exists. Mention the order number, the total, and clearly state that it will be ready in approximately {order.estimated_prep_minutes} minutes.'}

    if name == 'create_reservation':
        guests = args.get('guests')
        phone = getattr(ctx.user, 'phone', '') if ctx.user else (args.get('phone') or '')
        reservation, error = reservation_service.create_reservation(
            name=args.get('name'), phone=phone,
            date_str=args.get('date'), time_str=args.get('time'), guests=guests, user=ctx.user)
        if reservation is None:
            messages = {
                'past_date': 'That date has already passed. Ask for a future date.',
                'invalid_datetime': 'The date or time was not understood. Ask again more simply.',
                'too_large': 'The party is larger than we can take online. Suggest calling the cafe.',
                'missing_fields': 'Something required is still missing. Ask for it.',
                'create_failed': 'The booking could not be saved. Apologise and suggest calling.',
            }
            return {'created': False, 'error': error, 'note': messages.get(error, '')}
        ctx.created_reservation = True
        ctx.created_reservation_obj = reservation
        ctx.remember_number(reservation.party_size)
        return {'created': True, 'reservation': reservation_service.serialize(reservation),
                'note': 'This booking is real. Confirm it and read back the details.'}

    if name == 'find_reservations':
        if ctx.user is None:
            ctx.auth_required = True
            return {'error': 'auth_required', 'note': 'Ask them to sign in first.'}
        found = reservation_service.find_reservations(user=ctx.user)
        return {'reservations': [reservation_service.serialize(r) for r in found]}

    if name == 'cancel_reservation':
        if ctx.user is None:
            ctx.auth_required = True
            return {'error': 'auth_required', 'note': 'Ask them to sign in first.'}
        from api.models import TableReservation
        reservation = TableReservation.objects.filter(
            pk=args.get('reservation_id'), user=ctx.user).first()
        if reservation is None:
            return {'cancelled': False, 'error': 'not_found',
                    'note': 'That reservation is not on their account. Do not cancel it.'}
        ok, error = reservation_service.cancel_reservation(reservation)
        if not ok:
            return {'cancelled': False, 'error': error,
                    'note': 'That reservation can no longer be cancelled. Suggest calling.'}
        return {'cancelled': True, 'reservation': reservation_service.serialize(reservation)}

    if name == 'my_orders':
        if ctx.user is None:
            ctx.auth_required = True
            return {'error': 'auth_required', 'note': 'Ask them to sign in first.'}
        orders = ordering_service.my_orders(ctx.user, limit=args.get('limit', 5))
        for order in orders:
            ctx.remember_number(order['total_etb'])
        return {'orders': orders}

    return {'error': 'unknown_tool', 'note': f'Tool {name} is not available.'}


# ── Answer verification ───────────────────────────────────────────────

#: Numbers that are part of ordinary language, not a quoted price or quantity.
_NUMBER_RE = re.compile(r'(?<![\w.])(\d[\d,]*(?:\.\d+)?)(?![\w])')

#: "20 minutes", "ከ20 ደቂቃ" - a duration is a claim about the venue, not prose.
_DURATION_RE = re.compile(
    r'(?<![\w.])(\d[\d,]*(?:\.\d+)?)\s*(?:-\s*)?(?:minutes?|mins?|hours?|hrs?|ደቂቃ|ሰዓት)',
    re.IGNORECASE)


def _normalise_number(token):
    try:
        return round(float(token.replace(',', '')), 2)
    except ValueError:
        return None


def verify_answer(en, am, ctx):
    """
    Check the model's reply against what the tools actually returned.

    Returns a list of problems. An empty list means the answer is safe to send.
    """
    problems = []
    text = f"{en}\n{am}".lower()

    # 1) Every price, total, count or quantity must trace back to a tool result.
    #    Small whole numbers are left alone: "a table for 4" and "two minutes" are
    #    ordinary prose, and checking them would reject almost every good reply.
    for token in _NUMBER_RE.findall(f"{en}\n{am}"):
        number = _normalise_number(token)
        if number is None or number < 10:
            continue
        if number in ctx.allowed_numbers or round(number, 2) in ctx.allowed_numbers:
            continue
        problems.append(f'unverified number: {token}')

    # 1b) A wait time is a fact from the venue tool, even when the same digits
    #     would be a perfectly ordinary clock hour.
    for match in _DURATION_RE.finditer(text):
        number = _normalise_number(match.group(1))
        if number is None:
            continue
        if number in ctx.tool_numbers or round(number, 2) in ctx.tool_numbers:
            continue
        problems.append(f'unverified duration: {match.group(0)}')

    # 2) A booking or an order may only be reported as done if a tool did it.
    for phrase in COMMIT_PHRASES:
        if phrase in text and not (ctx.created_reservation or ctx.placed_order is not None):
            problems.append(f'claim without a committed action: {phrase}')
            break

    # 3) A guest cannot hold a reservation or order.
    if ctx.auth_required and re.search(r"\b(confirmed|placed|cancelled)\b", text) \
            and not (ctx.created_reservation or ctx.placed_order is not None):
        problems.append('guest was told an action completed')

    return problems


# ── The agent loop ────────────────────────────────────────────────────

def _client():
    from django.conf import settings
    try:
        from google import genai
    except ImportError:
        logger.warning('google-genai package not found; assistant will use deterministic engine')
        return None

    api_key = getattr(settings, 'GEMINI_API_KEY', '')
    if not api_key:
        return None
    try:
        return genai.Client(api_key=api_key)
    except Exception as e:
        logger.warning('Failed to initialize Gemini Client: %s', e)
        return None


def _to_gemini_contents(history):
    """Convert stored turns into Gemini's content format."""
    contents = []
    for turn in history:
        role = 'model' if turn.get('role') == 'assistant' else 'user'
        text = (turn.get('text') or '').strip()
        if not text:
            continue
        contents.append({'role': role, 'parts': [{'text': text}]})
    return contents


def _extract_json(text):
    if not text:
        return None
    match = re.search(r'\{.*\}', text, re.S)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    return data


def run_agent(query, user=None, session=None, staged=None, language='en', request_timeout=None):
    """
    Run one conversational turn with the language model.

    Returns a dict shaped like the deterministic engine's result, or None when
    the agent is unavailable or its answer failed verification - the caller then
    falls back to the deterministic path.
    """
    from django.conf import settings

    if not getattr(settings, 'ASSISTANT_USE_LLM', False):
        return None
    if not getattr(settings, 'GEMINI_API_KEY', ''):
        return None

    client = _client()
    if client is None:
        return None

    model = getattr(settings, 'ASSISTANT_MODEL', DEFAULT_MODEL)
    if request_timeout is None:
        request_timeout = getattr(settings, 'ASSISTANT_REQUEST_TIMEOUT_S', 30)
    try:
        request_timeout = min(int(request_timeout), 30)
        if request_timeout < 1:
            request_timeout = 1
    except (TypeError, ValueError):
        request_timeout = 30

    timeout_ms = int(getattr(settings, 'ASSISTANT_LLM_TIMEOUT', request_timeout)) * 1000
    http_options = {'timeout': timeout_ms}
    history = list(getattr(session, 'history', []) or [])
    ctx = ToolContext(user=user, staged=staged, session=session)
    for token in _NUMBER_RE.findall(query):
        ctx.remember_number(token)
    include_private = ctx.user is not None

    contents = _to_gemini_contents(history[-MAX_HISTORY_TURNS:])
    contents.append({'role': 'user', 'parts': [{'text': query}]})

    system = SYSTEM_PROMPT
    if include_private:
        system += (
            "\n\nThis customer is signed in. The booking and order tools are available: use them to "
            "finish what they asked for. Keep going after a successful call and read the result back "
            "to them.")
    else:
        system += (
            "\n\nThis customer is NOT signed in. That is fine: book the table and place the order "
            "for them anyway. Ask for their name and a phone number first, then pass them to "
            "create_reservation (phone) or place_order (contact_name, contact_phone). Never ask "
            "them to create an account before you can help. The tools for listing someone's past "
            "reservations or orders are not available to guests; a guest can track a single "
            "booking or order with the exact code you gave them.")

    if language == 'am':
        system += (
            "\n\nThe customer is conversing in Amharic (either in Ge'ez script or transliterated using English alphabet). "
            "Ensure the 'am' field contains a culturally warm, comprehensive, and helpful answer in Ge'ez script, and provide "
            "the corresponding English translation in the 'en' field."
        )

    config = {
        'system_instruction': system,
        'tools': [{'function_declarations': tool_declarations(include_private)}],
        'temperature': 0.4,
        'http_options': http_options,
    }

    models_to_try = [model]
    for fallback in ('gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-1.5-flash-8b'):
        if fallback not in models_to_try:
            models_to_try.append(fallback)

    response = None
    active_model = model
    for candidate_model in models_to_try:
        try:
            response = client.models.generate_content(
                model=candidate_model, contents=contents, config=config)
            active_model = candidate_model
            break
        except Exception as e:
            logger.warning('Assistant model %s failed: %s; trying retry or fallback', candidate_model, e)
            try:
                response = client.models.generate_content(
                    model=candidate_model, contents=contents, config=config)
                active_model = candidate_model
                break
            except Exception as retry_err:
                logger.warning('Assistant model %s retry also failed: %s', candidate_model, retry_err)

    if response is None:
        logger.warning('All assistant models failed; falling back to deterministic engine')
        return None
    for _ in range(MAX_TOOL_ROUNDS):
        function_calls = list(getattr(response, 'function_calls', None) or [])
        if not function_calls:
            break

        contents.append({'role': 'model', 'parts': [
            {'function_call': {'name': call.name, 'args': dict(call.args or {})}}
            for call in function_calls
        ]})

        results = []
        for call in function_calls:
            args = dict(call.args or {})
            ctx.seen_tools.add(call.name)
            try:
                result = execute_tool(call.name, args, ctx)
            except Exception:
                logger.exception('Assistant tool %s failed', call.name)
                result = {'error': 'tool_failed',
                          'note': 'That did not work. Apologise briefly and offer an alternative.'}
            if isinstance(result, dict):
                results.append({'function_response': {'name': call.name, 'response': result}})
        contents.append({'role': 'user', 'parts': results})

        try:
            response = client.models.generate_content(
                model=active_model, contents=contents, config=config)
        except Exception as e:
            logger.exception('Assistant agent tool round failed with %s: %s; falling back', active_model, e)
            return None

    text = getattr(response, 'text', '') or ''
    data = _extract_json(text)
    if not data:
        logger.warning('Assistant agent returned no usable JSON; falling back')
        return None

    en = _clean(data.get('en', ''), 2000)
    am = _clean(data.get('am', ''), 2000)
    if not en or not am:
        logger.warning('Assistant agent reply missing a language; falling back')
        return None

    problems = verify_answer(en, am, ctx)
    if problems:
        logger.warning('Assistant agent answer rejected: %s', problems)
        return None

    from .responder import bilingual, _item_payload

    action, intent = _action_from_context(ctx)
    return {
        'answer': bilingual(en, am),
        'answer_en': en,
        'answer_am': am,
        'intent': intent,
        'language': language,
        'items': _items_from_mentions(ctx),
        'reservations': _reservations_from_tools(ctx),
        'orders': [ctx.placed_order_obj] if ctx.placed_order_obj else [],
        'action': action,
        'sources': ['Coffee House menu database', 'Restaurant settings'],
        'session_id': getattr(session, 'session_id', None),
        'engine': 'agent',
        # Carried back so the caller can update session state.
        '_created_reservation': ctx.created_reservation,
        '_placed_order': ctx.placed_order is not None,
        '_auth_required': ctx.auth_required,
    }


def _reservations_from_tools(ctx):
    """The booking the tools actually made, if any."""
    if not (ctx.created_reservation and ctx.created_reservation_obj):
        return []
    from .reservations import serialize
    return [serialize(ctx.created_reservation_obj)]


def _items_from_mentions(ctx):
    """
    Menu cards for the names the model actually discussed.

    Looked up by exact name rather than by whatever the model wrote, so a card can
    only ever describe a real item.
    """
    from apps.menu.models import MenuItem

    from .responder import _item_payload

    names = list(dict.fromkeys(
        name for name in ctx.mentions if name and name != 'availability'))[:12]
    if not names:
        return []

    found = {}
    for name in names:
        item = MenuItem.objects.select_related('category').filter(name__iexact=name).first()
        if item is not None:
            found[item.id] = item
    return [_item_payload(item) for item in list(found.values())[:6]]


def _action_from_context(ctx):
    """
    Decide the UI action from what the tools did, never from what the model said.
    """
    from .auth_gate import sign_in_action

    if ctx.auth_required:
        intent = 'order_create' if _touched_ordering(ctx) else 'reservation_create'
        return sign_in_action(intent), intent
    if ctx.placed_order is not None:
        return {'action': 'order_placed',
                'order': ctx.placed_order_obj or {},
                'order_number': ctx.placed_order.order_number}, 'order_create'
    if ctx.created_reservation:
        from .reservations import serialize
        return {'action': 'reservation_created',
                'reservations': [serialize(ctx.created_reservation_obj)]}, 'reservation_create'
    return {'action': 'none'}, 'agent'


ORDERING_TOOLS = {'add_to_order', 'remove_from_order', 'view_order', 'place_order', 'my_orders'}


def _touched_ordering(ctx):
    return bool(ctx.seen_tools & ORDERING_TOOLS)