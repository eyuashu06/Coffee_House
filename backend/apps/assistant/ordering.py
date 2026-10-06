"""
Ordering capabilities for the Coffee House assistant.

The assistant can add items to a staged cart, show the running total, and place
a real order through the same server-side pricing path the REST API uses
(`apps.orders.serializers.OrderSerializer`), so a browser can never influence a
price. Placing an order requires an authenticated customer; browsing and pricing
never does.

This is the "tool" layer. The functions here are deliberately dumb - they take
explicit arguments and return plain data - so both the deterministic engine and
the language-model agent can call them without either one bypassing the pricing
rules.
"""

import logging
from decimal import Decimal

from django.db.models import Q

from apps.menu.models import MenuItem
from apps.orders.models import DeliveryZone, Order, RestaurantSettings

logger = logging.getLogger(__name__)

MAX_LINES_PER_ORDER = 20
MAX_QUANTITY_PER_LINE = 20

ORDER_TYPES = {
    'DELIVERY': 'Delivery',
    'PICKUP': 'Store Pickup',
    'DINE_IN': 'Dine-In (Table Service)',
}


# ── Reading the menu ──────────────────────────────────────────────────

def search_menu(query, limit=6, category_slug=None, available_only=True):
    """
    Return menu items matching `query`. This is the agent's only source of truth
    for what exists and what it costs.
    """
    from .retriever import find_menu_items

    items = find_menu_items(query or '', limit=limit, category_slug=category_slug,
                            available_only=available_only)
    if items:
        return items

    # A broad "what do you have?" style query has no product words, so fall back
    # to the category listing rather than returning nothing.
    qs = MenuItem.objects.select_related('category').prefetch_related('variants', 'add_ons')
    if category_slug:
        qs = qs.filter(category__slug=category_slug)
    if available_only:
        qs = qs.filter(is_available=True)
    if query:
        qs = qs.filter(Q(name__icontains=query) | Q(description__icontains=query))
    return list(qs[:limit])


def item_detail(item):
    """Everything the agent may say about one item, as a flat dict."""
    return {
        'id': item.id,
        'name': item.name,
        'category': item.category.name,
        'category_slug': item.category.slug,
        'description': item.description,
        'price_etb': float(item.base_price_etb),
        'available': item.is_available,
        'signature': item.is_signature,
        'image_url': item.get_image_display() or '',
        'variants': [
            {'name': v.name, 'extra_etb': float(v.price_modifier_etb)}
            for v in item.variants.all()
        ],
        'add_ons': [
            {'name': a.name, 'price_etb': float(a.price_etb)}
            for a in item.add_ons.all()
        ],
    }


def resolve_order_item(name, variant_name=None, add_on_names=None):
    """
    Turn a customer-supplied product name into a real MenuItem plus the variant
    and add-ons that exist on it.

    Returns (menu_item, resolved_variant_name, resolved_add_ons, problem). The
    caller must never invent a product: if `name` matches nothing, `menu_item`
    is None and `problem` explains why.
    """
    from .retriever import get_item_by_name

    if not name:
        return None, '', [], 'missing_item_name'

    item = get_item_by_name(name)
    if item is None:
        matches = search_menu(name, limit=1, available_only=False)
        item = matches[0] if matches else None
    if item is None:
        return None, '', [], 'not_on_menu'
    if not item.is_available:
        return None, '', [], 'unavailable'

    variant = ''
    wanted = (variant_name or '').strip()
    if wanted:
        match = next((v for v in item.variants.all() if v.name.lower() == wanted.lower()), None)
        if match:
            variant = match.name
        # An unknown variant is dropped rather than guessed at, so the quoted
        # total always matches what the kitchen is actually asked to make.

    add_ons = []
    for add_on_name in (add_on_names or []):
        wanted_add_on = (add_on_name or '').strip()
        if not wanted_add_on:
            continue
        match = next((a for a in item.add_ons.all() if a.name.lower() == wanted_add_on.lower()), None)
        if match:
            add_ons.append(match.name)

    return item, variant, add_ons, None


def unit_price_for(item, variant_name, add_on_names):
    """Authoritative unit price for one line. Mirrors the order serializer."""
    price = Decimal(str(item.base_price_etb))
    if variant_name:
        variant = next((v for v in item.variants.all() if v.name.lower() == variant_name.lower()), None)
        if variant:
            price += Decimal(str(variant.price_modifier_etb))
    for add_on_name in (add_on_names or []):
        add_on = next((a for a in item.add_ons.all() if a.name.lower() == add_on_name.lower()), None)
        if add_on:
            price += Decimal(str(add_on.price_etb))
    return price


# ── Staged cart ───────────────────────────────────────────────────────

class StagedOrder:
    """
    The customer's in-progress order, kept in the assistant session.

    Prices are recomputed from the database on every read, so a stale or
    tampered line can never survive into the final total.
    """

    def __init__(self, raw=None):
        raw = raw or {}
        self.lines = [dict(line) for line in raw.get('lines', [])]
        self.order_type = raw.get('order_type') or ''
        self.address = raw.get('address') or ''
        self.notes = raw.get('notes') or ''

    def to_dict(self):
        return {'lines': self.lines, 'order_type': self.order_type,
                'address': self.address, 'notes': self.notes}

    # -- line management -------------------------------------------------

    def add_item(self, item, quantity=1, variant_name='', add_on_names=None):
        add_on_names = list(add_on_names or [])
        variant_name = variant_name or ''
        quantity = max(1, min(int(quantity or 1), MAX_QUANTITY_PER_LINE))

        # The same item with the same options is one line with a bigger number,
        # not two lines. "a latte" twice means 2 lattes, which is what a customer
        # repeating themselves means.
        for line in self.lines:
            same_options = (line.get('variant', '') == variant_name
                            and sorted(line.get('add_ons', [])) == sorted(add_on_names))
            if line['item_id'] == item.id and same_options:
                line['quantity'] = min(line['quantity'] + quantity, MAX_QUANTITY_PER_LINE)
                return self.summary(), 'merged'

        if len(self.lines) >= MAX_LINES_PER_ORDER:
            return self.summary(), 'too_many_lines'
        self.lines.append({
            'item_id': item.id,
            'name': item.name,
            'quantity': quantity,
            'variant': variant_name or '',
            'add_ons': add_on_names,
        })
        return self.summary(), 'added'

    def remove_item(self, name, quantity=None):
        """Remove a line, or reduce its quantity. Returns (summary, status)."""
        target = (name or '').strip().lower()
        matches = [line for line in self.lines if target in line['name'].lower()]
        if not matches:
            return self.summary(), 'not_in_order'

        if quantity is None:
            self.lines = [line for line in self.lines if line is not matches[0]]
            return self.summary(), 'removed'

        matches[0]['quantity'] -= int(quantity)
        if matches[0]['quantity'] <= 0:
            self.lines = [line for line in self.lines if line is not matches[0]]
            return self.summary(), 'removed'
        return self.summary(), 'updated'

    def clear(self):
        self.lines = []
        self.order_type = ''
        self.address = ''
        self.notes = ''

    # -- pricing ---------------------------------------------------------

    def priced_lines(self):
        """Every line re-priced from the menu, dropping anything no longer sold."""
        priced = []
        for line in self.lines:
            item = MenuItem.objects.filter(pk=line.get('item_id')).select_related('category').first()
            if item is None or not item.is_available:
                continue
            variant = line.get('variant', '')
            add_ons = line.get('add_ons', [])
            quantity = max(1, int(line.get('quantity', 1)))
            unit = unit_price_for(item, variant, add_ons)
            priced.append({
                'menu_item': item,
                'name': item.name,
                'variant_name': variant,
                'add_on_names': add_ons,
                'quantity': quantity,
                'unit_price_etb': unit,
                'subtotal_etb': unit * quantity,
            })
        return priced

    def summary(self):
        """Totals plus any lines that had to be dropped."""
        priced = self.priced_lines()
        valid_ids = {line['menu_item'].id for line in priced}
        dropped = [line for line in self.lines if line.get('item_id') not in valid_ids]
        if dropped:
            self.lines = [line for line in self.lines if line.get('item_id') in valid_ids]

        subtotal = sum((line['subtotal_etb'] for line in priced), Decimal('0'))
        fee = Decimal('0')
        zone = None
        if self.order_type == 'DELIVERY':
            zone, fee = _delivery_zone_for(self.address)

        return {
            'lines': [
                {
                    'name': line['name'],
                    'quantity': line['quantity'],
                    'variant': line['variant_name'],
                    'add_ons': line['add_on_names'],
                    'unit_price_etb': line['unit_price_etb'],
                    'subtotal_etb': line['subtotal_etb'],
                }
                for line in priced
            ],
            'item_count': sum(line['quantity'] for line in priced),
            'subtotal_etb': subtotal,
            'delivery_fee_etb': fee,
            'total_etb': subtotal + fee,
            'delivery_zone': zone.name if zone else '',
            'order_type': self.order_type,
            'address': self.address,
            'notes': self.notes,
            'ready': bool(priced),
        }

    def is_empty(self):
        return not self.lines


def _delivery_zone_for(address):
    """Match the address to a delivery zone; unmatched addresses carry no fee."""
    zones = list(DeliveryZone.objects.filter(is_active=True))
    if not zones:
        return None, Decimal('0')
    address = (address or '').strip().lower()
    if not address:
        return None, Decimal('0')
    for zone in zones:
        if zone.name.strip().lower() in address:
            return zone, Decimal(str(zone.delivery_fee_etb))
    return None, Decimal('0')


def detect_order_type(text):
    """Read delivery / pickup / dine-in out of free text. Defaults to ''."""
    from .retriever import normalize_amharic_digits, tokenize

    tokens = set(tokenize(normalize_amharic_digits((text or '').lower())))
    text_low = (text or '').lower()

    delivery_words = {'delivery', 'deliver', 'delivered', 'home', 'ማድረስ', 'ቤት', 'አድራሻ'}
    pickup_words = {'pickup', 'takeaway', 'take', 'collection', 'collect', 'መደብር',
                    'መረጃት', 'እንወስድ'}
    dine_in_words = {'dine', 'dinein', 'sit', 'table', 'restaurant', 'በዛሪክ', 'መቀመጥ'}

    for group, order_type in ((delivery_words, 'DELIVERY'), (pickup_words, 'PICKUP'),
                              (dine_in_words, 'DINE_IN')):
        if tokens & group:
            return order_type
    if 'delivery' in text_low or 'ማድረስ' in text_low:
        return 'DELIVERY'
    if 'pickup' in text_low or 'takeaway' in text_low:
        return 'PICKUP'
    return ''


#: Words that introduce a delivery address. "to" and "at" are deliberately not
#: here: in "I want to order a croissant" they are part of the order phrase, and
#: treating them as an address marker swallowed the item name as the address.
_ADDRESS_MARKERS = (
    r'address|my address is|send it to|deliver (?:it |the order )?to|'
    r'አድራሻ|ወደ\s*\S+\s*አድራሻ'
)


def extract_address(text):
    """
    Pull a delivery address out of a sentence, if one was given.

    Only an explicit marker introduces an address. Anything looser reads the
    customer's own words as an address, which then gets attached to their order.
    """
    import re

    text = (text or '').strip()
    if not text:
        return ''

    for pattern, terminator in (
        (rf'(?:{_ADDRESS_MARKERS})\s*[:\-]?\s*([^,.;\n]{{6,120}})', r'[,.;\n]'),
        (r'አድራሻ\s*[:\-]?\s*([^።፣\n]{5,120})', r'[።፣\n]'),
    ):
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            address = match.group(1).strip(' .,-')
            # An address has a number or a place word in it, not just any words.
            if len(address) >= 5 and (re.search(r'\d', address)
                                      or any(word in address.lower() for word in
                                             ('street', 'road', 'st.', 'ave', 'avenue', 'bldg',
                                              'building', 'floor', 'ቤት', 'በርገር', 'አድራሻ'))):
                return address
    return ''


# ── Placing the order ─────────────────────────────────────────────────

def place_order(user, staged, order_type=None, address=None):
    """
    Create the order through the normal serializer, so prices, the order number
    and the status history are produced by exactly the same code the REST API
    uses.

    Returns (order, error_code).
    """
    if not is_authenticated_user(user):
        return None, 'auth_required'

    order_type = (order_type or staged.order_type or '').upper()
    address = address if address is not None else staged.address

    if order_type not in ORDER_TYPES:
        return None, 'missing_order_type'

    priced = staged.priced_lines()
    if not priced:
        return None, 'empty_order'

    venue = RestaurantSettings.get_settings()
    if not venue.is_open:
        return None, 'restaurant_closed'

    fee = Decimal('0')
    zone = None
    if order_type == 'DELIVERY':
        if not (address or '').strip():
            return None, 'missing_address'
        zone, fee = _delivery_zone_for(address)

    from apps.orders.serializers import OrderSerializer

    payload = {
        'order_type': order_type,
        'delivery_address': address or '',
        'delivery_zone': zone.id if zone else None,
        'contact_name': f"{user.first_name} {user.last_name}".strip() or user.username,
        'contact_phone': user.phone or '+251911000000',
        'estimated_prep_minutes': venue.default_prep_minutes,
        'notes': staged.notes or '',
        'delivery_fee_etb': fee,
        'items': [
            {
                'menu_item': line['menu_item'].id,
                'quantity': line['quantity'],
                'variant_name': line['variant_name'],
                'add_ons': [{'add_on_name': n} for n in line['add_on_names']],
            }
            for line in priced
        ],
    }

    serializer = OrderSerializer(data=payload, context={'request': _UserRequest(user)})
    if not serializer.is_valid():
        logger.warning('Assistant order rejected by serializer: %s', serializer.errors)
        return None, 'invalid_order'
    order = serializer.save()

    from apps.orders.models import OrderStatusHistory
    OrderStatusHistory.objects.create(
        order=order, status=order.status, changed_by=user, notes='Order created from the assistant')

    return order, None


class _UserRequest:
    """Minimal stand-in so the serializer can link the order to its customer."""

    def __init__(self, user):
        self.user = user


def is_authenticated_user(user):
    return bool(user and getattr(user, 'is_authenticated', False))


def serialize_order(order):
    return {
        'id': order.id,
        'order_number': order.order_number,
        'order_type': order.order_type,
        'order_type_label': order.get_order_type_display(),
        'status': order.status,
        'status_label': order.get_status_display(),
        'total_etb': float(order.total_amount_etb),
        'subtotal_etb': float(order.subtotal_etb),
        'delivery_fee_etb': float(order.delivery_fee_etb),
        'item_count': sum(item.quantity for item in order.items.all()),
        'items': [
            {'name': item.item_name, 'quantity': item.quantity,
             'subtotal_etb': float(item.subtotal_etb)}
            for item in order.items.all()
        ],
        'created_at': order.created_at.isoformat(),
    }


def my_orders(user, limit=5):
    """The signed-in customer's own orders, newest first."""
    if not is_authenticated_user(user):
        return []
    qs = Order.objects.filter(customer=user).prefetch_related('items')
    return [serialize_order(order) for order in qs[:limit]]