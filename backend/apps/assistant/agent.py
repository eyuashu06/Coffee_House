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

DEFAULT_MODEL = 'gemini-2.5-flash'
MAX_TOOL_ROUNDS = 6
MAX_HISTORY_TURNS = 10

#: Phrases that claim something was done. Only allowed when a tool actually did it.
COMMIT_PHRASES = [
    'has been confirmed', 'is confirmed', 'your reservation has been', "i've reserved",
    "i have reserved", 'reservation created', 'has been placed', 'order placed',
    'your order is placed', 'order created', 'i have added', "i've added", 'added to your',
    'successfully', 'has been cancelled', 'has been canceled',
]


SYSTEM_PROMPT = """You are the assistant for Buna Hub, a specialty coffee house in Addis Ababa.

You are talking with a customer in a chat panel. Be warm, direct and natural, the way a good barista \
would be: two or three sentences for a simple question, no ceremony, no bullet lists of everything \
you know. Never open with "Great question". Never repeat yourself.

FACTS
Everything you say about the cafe must come from a tool result in this conversation. You do not \
know the menu, prices, opening hours or table availability from memory. If a tool did not tell you \
something, you do not say it. Never guess a price, never invent a product, never estimate a \
wait time.

LANGUAGE
Always answer in BOTH English and Amharic. Speak the Amharic the way a customer in Addis Ababa \
actually speaks it - natural and warm, not translated word-for-word. Match the language the customer \
wrote in: if they wrote Amharic, lead with Amharic tone and phrasing in the Amharic half.

ACCOUNTS
Reserving a table, placing an order, and looking up or cancelling the customer's own reservations \
or orders require an account. A tool will refuse with auth_required if they are not signed in. When \
that happens, tell them plainly that they need to sign in or create an account first, say what you \
were about to do for them, and reassure them you will continue afterwards. Do not ask them to \
repe information they already gave you. Browsing the menu, prices, availability and opening hours \
never requires an account - offer those freely.

ORDERING
Add items one at a time with the matching tool. Confirm the order type and the delivery address \
before placing it, then place it and read back the order number, the total and what is in it. Tell \
them payment happens on the next step.

RESERVATIONS
Collect the date, time, party size and name. Check availability before you promise anything, and \
only say a reservation is confirmed when the tool tells you it was created. If a slot is full, offer \
the alternatives the tool gave you.

STYLE
Short paragraphs. Use a plain line per item only when listing several. Prices in ETB. No emoji. \
No markdown headings, no bold. If you truly do not have the information, say so in one sentence and \
point them to the team.

Return your reply as JSON: {"en": "...", "am": "..."} and nothing else."""


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
              {'query': {'type': 'string', 'description': 'What the customer is asking about'},
               'category': {'type': 'string', 'description': 'Optional category slug filter'},
               'available_only': {'type': 'boolean',
                                  'description': 'Only currently available items. Default true.'}}),
        _tool('get_item_detail',
              'Full detail for one menu item: description, price, variants and add-ons with their '
              'prices, and availability.',
              {'name': {'type': 'string', 'description': 'Exact item name from the menu'}},
              ['name']),
        _tool('get_venue_info',
              'Opening hours, whether the cafe is open right now, address, phone, email and the '
              'average preparation time.'),
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

    if include_private:
        tools.append(_tool('place_order',
                           'Place the order. Requires an account. Confirm the order type and '
                           'delivery address with the customer first.',
                           {'order_type': {'type': 'string', 'enum': ['DELIVERY', 'PICKUP', 'DINE_IN']},
                            'address': {'type': 'string',
                                        'description': 'Delivery address. Required for DELIVERY.'}}))
        tools += [
            _tool('create_reservation',
                  'Book a table. Requires an account. Only call this after check_table_availability '
                  'says the slot is free. The result is the only thing that makes a booking real.',
                  {'date': {'type': 'string', 'description': 'YYYY-MM-DD'},
                   'time': {'type': 'string', 'description': 'HH:MM 24-hour'},
                   'guests': {'type': 'integer'},
                   'name': {'type': 'string', 'description': 'Name for the booking'}},
                  ['date', 'time', 'guests', 'name']),
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
        self.allowed_numbers = set()
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
        return {
            'open_now': venue.is_open,
            'opening_hours': venue.opening_hours,
            'address': venue.address,
            'phone': venue.contact_phone,
            'email': venue.contact_email,
            'average_prep_minutes': venue.default_prep_minutes,
            'max_reservation_guests': reservation_service.MAX_GUESTS,
        }

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
            ctx.remember_number(reservation_service.MAX_GUESTS)
            return {'available': False, 'detail': 'too_large',
                    'max_guests': reservation_service.MAX_GUESTS,
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
                    'note': {'not_on_menu': 'That product is not on our menu. Say so.',
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
        if ctx.user is None:
            ctx.auth_required = True
            return {'error': 'auth_required',
                    'note': 'Ask them to sign in or sign up. Do not pretend the order was placed.'}
        staged = ctx.staged
        order_type = (args.get('order_type') or staged.order_type or '').upper()
        if order_type:
            staged.order_type = order_type
        if args.get('address'):
            staged.address = args['address']
        order, error = ordering_service.place_order(
            ctx.user, staged, order_type=order_type, address=args.get('address'))
        if order is None:
            messages = {
                'missing_order_type': 'Ask whether they want delivery, pickup or to dine in.',
                'missing_address': 'Ask for a delivery address.',
                'empty_order': 'There is nothing in the order yet.',
                'restaurant_closed': 'The cafe is closed right now, so orders cannot be taken. Say so.',
                'invalid_order': 'The order could not be created. Apologise and suggest calling.',
            }
            return {'placed': False, 'error': error, 'note': messages.get(error, '')}
        ctx.placed_order = order
        ctx.placed_order_obj = ordering_service.serialize_order(order)
        ctx.remember_number(order.total_amount_etb)
        ctx.remember_number(order.subtotal_etb)
        return {'placed': True, 'order': ordering_service.serialize_order(order),
                'note': 'This order exists. Mention the order number and the total.'}

    if name == 'create_reservation':
        if ctx.user is None:
            ctx.auth_required = True
            return {'created': False, 'error': 'auth_required',
                    'note': 'Ask them to sign in or sign up first. Do not confirm a booking.'}
        guests = args.get('guests')
        reservation, error = reservation_service.create_reservation(
            name=args.get('name'), phone=getattr(ctx.user, 'phone', ''),
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
    from google import genai

    api_key = getattr(settings, 'GEMINI_API_KEY', '')
    if not api_key:
        return None
    return genai.Client(api_key=api_key)


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


def run_agent(query, user=None, session=None, staged=None, language='en'):
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
    timeout_ms = getattr(settings, 'ASSISTANT_LLM_TIMEOUT', 20) * 1000
    http_options = {'timeout': timeout_ms}
    history = list(getattr(session, 'history', []) or [])
    ctx = ToolContext(user=user, staged=staged, session=session)
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
            "\n\nThis customer is NOT signed in, and the tools that book a table or read someone's "
            "orders are not available to you. The tools you do have will refuse with "
            "auth_required if you try. If they ask to reserve a table, place an order, or see their "
            "own reservations or orders, tell them plainly that they need to sign in or create an "
            "account first, say what you were about to do for them, and promise to continue "
            "straight afterwards. Do not ask them to repeat details they already gave you. "
            "Building an order with add_to_order works without an account, so you can take their "
            "choices now and only need sign-in to place it.")

    config = {
        'system_instruction': system,
        'tools': [{'function_declarations': tool_declarations(include_private)}],
        'temperature': 0.4,
        'http_options': http_options,
    }

    try:
        response = client.models.generate_content(
            model=model, contents=contents, config=config)
    except Exception:
        logger.exception('Assistant agent request failed; falling back')
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
                model=model, contents=contents, config=config)
        except Exception:
            logger.exception('Assistant agent tool round failed; falling back')
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