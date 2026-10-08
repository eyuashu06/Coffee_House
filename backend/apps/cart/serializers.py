from typing import List

from rest_framework import serializers

from apps.menu.models import MenuItem
from .models import Cart, CartItem

#: A cart line is only combinable with another when every part of the drink matches.
MAX_QUANTITY_PER_LINE = 50


class CartItemSerializer(serializers.ModelSerializer):
    """One line in a saved cart. Prices are always resolved from the menu."""

    menu_item_name = serializers.CharField(source='menu_item.name', read_only=True)
    menu_item_available = serializers.BooleanField(source='menu_item.is_available', read_only=True)
    variant_label = serializers.CharField(source='variant.name', read_only=True, allow_null=True)
    add_on_labels = serializers.SerializerMethodField()
    unit_price_etb = serializers.SerializerMethodField()
    subtotal_etb = serializers.SerializerMethodField()

    # The browser only knows the drink by id and the names it was shown, so that is what
    # it sends. Matching those names against the menu - and pricing from the menu - is ours.
    menu_item = serializers.PrimaryKeyRelatedField(queryset=MenuItem.objects.all(), required=False)
    menu_item_id = serializers.IntegerField(write_only=True, required=False)
    variant_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    add_on_names = serializers.ListField(
        child=serializers.CharField(), write_only=True, required=False, default=list,
    )

    class Meta:
        model = CartItem
        fields = (
            'id',
            'menu_item',
            'menu_item_id',
            'menu_item_name',
            'menu_item_available',
            'variant',
            'variant_name',
            'variant_label',
            'add_ons',
            'add_on_names',
            'add_on_labels',
            'quantity',
            'temperature',
            'milk_choice',
            'notes',
            'unit_price_etb',
            'subtotal_etb',
        )
        read_only_fields = ('id', 'menu_item', 'add_ons')

    def get_add_on_labels(self, obj) -> List[str]:
        return [addon.name for addon in obj.add_ons.all()]

    def get_unit_price_etb(self, obj) -> str:
        return str(obj.get_unit_price_etb())

    def get_subtotal_etb(self, obj) -> str:
        return str(obj.get_subtotal_etb())

    def validate(self, attrs):
        """
        Resolve menu item, variant and add-ons against the database.

        On a PATCH the drink is already known from the existing line, so only what the
        client actually sent is re-resolved.
        """
        current = self.instance
        menu_item = (
            attrs.get('menu_item')
            or self._menu_item_from_id(attrs.get('menu_item_id'))
            or (current.menu_item if current else None)
        )
        if not menu_item:
            raise serializers.ValidationError({'menu_item': ['Choose a drink from the menu.']})
        if not menu_item.is_available:
            raise serializers.ValidationError(
                {'menu_item': [f'{menu_item.name} just sold out. Please choose something else.']}
            )
        attrs['menu_item'] = menu_item

        if 'variant_name' in attrs or current is None:
            attrs['variant'] = self._resolve_variant(menu_item, attrs.get('variant_name'))
        if 'add_on_names' in attrs or current is None:
            attrs['add_ons'] = self._resolve_add_ons(menu_item, attrs.get('add_on_names'))

        quantity = attrs.get('quantity', 1)
        if quantity is None:
            quantity = 1
        if quantity < 1:
            raise serializers.ValidationError({'quantity': ['Order at least one.']})
        if quantity > MAX_QUANTITY_PER_LINE:
            raise serializers.ValidationError(
                {'quantity': ['That is more than 50 - contact us for a big order.']}
            )
        attrs['quantity'] = quantity
        return attrs

    @staticmethod
    def _menu_item_from_id(menu_item_id):
        if not menu_item_id:
            return None
        try:
            return MenuItem.objects.get(pk=menu_item_id)
        except MenuItem.DoesNotExist:
            raise serializers.ValidationError({'menu_item': ['That drink is no longer on the menu.']})

    @staticmethod
    def _resolve_variant(menu_item, variant_name):
        """Match the chosen variant by name, the same way orders price them."""
        clean = (variant_name or '').strip()
        if not clean:
            return None
        return next(
            (v for v in menu_item.variants.all() if v.name.lower() == clean.lower()), None,
        )

    @staticmethod
    def _resolve_add_ons(menu_item, names):
        """Drop add-ons this drink does not offer, so the client cannot invent extras."""
        resolved = []
        for name in names or []:
            clean = (name or '').strip()
            if not clean:
                continue
            match = next((a for a in menu_item.add_ons.all() if a.name.lower() == clean.lower()), None)
            if match and match not in resolved:
                resolved.append(match)
        return resolved


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True)
    total_etb = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ('id', 'items', 'total_etb', 'item_count', 'updated_at')
        read_only_fields = ('id', 'updated_at')

    def get_total_etb(self, cart) -> str:
        return str(cart.get_total_etb())

    def get_item_count(self, cart) -> int:
        return sum(item.quantity for item in cart.items.all())

    def create(self, validated_data):
        raise NotImplementedError('Carts are owned by their user; use the cart endpoints.')


class MergeSerializer(serializers.Serializer):
    """
    The lines a guest had in the browser before signing in.

    They are folded into the saved cart rather than replacing it, so signing in on a
    shared device cannot silently discard what was already there.
    """
    items = CartItemSerializer(many=True, required=False, default=list)
    replace = serializers.BooleanField(required=False, default=False)


def _line_key(menu_item, variant, add_ons, temperature, milk_choice, notes):
    """Identity of a drink, used to combine two lines that are really the same drink."""
    return (
        menu_item.pk if menu_item else None,
        getattr(variant, 'pk', None),
        tuple(sorted(addon.pk for addon in add_ons)),
        (temperature or '').strip().lower(),
        (milk_choice or '').strip().lower(),
        (notes or '').strip().lower(),
    )


def _resolve_names(data):
    """
    Turn a name-keyed line into model fields.

    Validated serializer data already carries resolved `variant`/`add_ons`, but this
    function is also called with raw lines (guest carts, direct merges), where only the
    names the browser saw are known.
    """
    menu_item = data.get('menu_item')
    if menu_item is None:
        menu_item_id = data.get('menu_item_id')
        if menu_item_id:
            menu_item = MenuItem.objects.filter(pk=menu_item_id).first()

    variant = data.get('variant')
    if variant is None:
        variant_name = (data.get('variant_name') or '').strip()
        if menu_item and variant_name:
            variant = next(
                (v for v in menu_item.variants.all() if v.name.lower() == variant_name.lower()),
                None,
            )

    add_ons = data.get('add_ons')
    if not add_ons:
        add_ons = []
        for name in data.get('add_on_names') or []:
            clean = (name or '').strip()
            if not clean or not menu_item:
                continue
            match = next(
                (a for a in menu_item.add_ons.all() if a.name.lower() == clean.lower()), None,
            )
            if match and match not in add_ons:
                add_ons.append(match)

    return {
        'menu_item': menu_item,
        'variant': variant,
        'add_ons': add_ons,
        'temperature': data.get('temperature') or 'Hot',
        'milk_choice': data.get('milk_choice') or 'Oat Silk (Barista)',
        'notes': data.get('notes') or '',
        'quantity': int(data.get('quantity') or 1),
    }


def merge_items_into(cart, items_data, replace=False):
    """
    Fold incoming lines into a cart, combining quantities of identical drinks.

    Two "large oat lattes" become one line of quantity 2 rather than two identical lines.
    Returns the cart.
    """
    if replace:
        cart.items.all().delete()

    existing = {}
    for line in cart.items.all():
        key = _line_key(
            line.menu_item, line.variant, list(line.add_ons.all()),
            line.temperature, line.milk_choice, line.notes,
        )
        existing[key] = line

    for data in items_data:
        resolved = _resolve_names(data)
        menu_item = resolved['menu_item']
        if menu_item is None or not menu_item.is_available:
            # A drink that left the menu or sold out is dropped, not saved broken.
            continue

        key = _line_key(
            menu_item, resolved['variant'], resolved['add_ons'],
            resolved['temperature'], resolved['milk_choice'], resolved['notes'],
        )
        if key in existing:
            line = existing[key]
            line.quantity = min(line.quantity + resolved['quantity'], MAX_QUANTITY_PER_LINE)
            line.save(update_fields=['quantity'])
            existing[key] = line
            continue

        line = CartItem.objects.create(cart=cart, **{
            field: resolved[field] for field in ('menu_item', 'variant', 'temperature', 'milk_choice', 'notes', 'quantity')
        })
        if resolved['add_ons']:
            line.add_ons.set(resolved['add_ons'])
        existing[key] = line

    return cart