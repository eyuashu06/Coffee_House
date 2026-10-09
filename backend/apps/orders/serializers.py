import time
from rest_framework import serializers
from decimal import Decimal
from django.utils import timezone
from .models import Order, OrderItem, OrderItemAddOn, DeliveryZone, RestaurantSettings
from apps.menu.models import MenuItem
from apps.accounts.models import normalize_ethiopian_phone


class DeliveryZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryZone
        fields = '__all__'


class RestaurantSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = RestaurantSettings
        fields = '__all__'


class OrderItemAddOnSerializer(serializers.ModelSerializer):
    # Price is resolved from the menu server-side; the client never supplies it.
    price_etb = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)

    class Meta:
        model = OrderItemAddOn
        fields = ('id', 'add_on_name', 'price_etb')


class OrderItemSerializer(serializers.ModelSerializer):
    add_ons = OrderItemAddOnSerializer(many=True, required=False)
    item_name = serializers.CharField(required=False, allow_blank=True)
    unit_price_etb = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    # Backend always computes this — never required from frontend
    subtotal_etb = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    temperature = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    milk_choice = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = OrderItem
        fields = (
            'id',
            'menu_item',
            'item_name',
            'variant_name',
            'unit_price_etb',
            'quantity',
            'subtotal_etb',
            'temperature',
            'milk_choice',
            'notes',
            'add_ons',
        )


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True)
    customer_username = serializers.CharField(source='customer.username', read_only=True)
    order_number = serializers.CharField(read_only=True)
    placed_at = serializers.DateTimeField(read_only=True)
    latest_payment = serializers.SerializerMethodField()
    payment_state = serializers.SerializerMethodField()
    # Backend always computes these — not required from frontend
    subtotal_etb = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    total_amount_etb = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    delivery_fee_etb = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    # Contact fields are optional — backend fills them from the authenticated user / defaults
    contact_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    contact_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    class Meta:
        model = Order
        fields = (
            'id',
            'order_number',
            'customer',
            'customer_username',
            'order_type',
            'table_number',
            'delivery_zone',
            'contact_name',
            'contact_phone',
            'delivery_address',
            'subtotal_etb',
            'delivery_fee_etb',
            'total_amount_etb',
            'status',
            'notes',
            'estimated_prep_minutes',
            'rejection_reason',
            'placed_at',
            'created_at',
            'items',
            'latest_payment',
            'payment_state',
        )
        read_only_fields = ('id', 'order_number', 'customer', 'created_at', 'placed_at')

    def get_latest_payment(self, order):
        """Latest payment attempt, so the customer can see/finish an unfinished payment."""
        payment = order.payments.order_by('-created_at').first()
        if not payment:
            return None
        return {
            'id': payment.id,
            'tx_ref': payment.tx_ref,
            'status': payment.status,
            'payment_method': payment.payment_method,
            'failure_reason': payment.failure_reason,
            'checkout_url': payment.checkout_url,
            'created_at': payment.created_at,
            'verified_at': payment.verified_at,
            'gateway_status': payment.gateway_status,
        }

    def get_payment_state(self, order):
        """
        Whether the money is actually in, in one word.

        The UI used to decide "paid" from `latest_payment.status`, which is wrong
        in both directions: a customer who paid on a first attempt and then made
        a second, abandoned one would see an unpaid order, and a paid order whose
        newest attempt is still pending looked unpaid too. This derives the answer
        from whether *any* payment for the order succeeded, so the customer, the
        kitchen and the receipt can never disagree.

        Values: `paid`, `settling` (attempt in flight), `failed`, `unpaid`.
        """
        payments = list(order.payments.all())
        if any(payment.status == 'SUCCESS' for payment in payments):
            return 'paid'

        statuses = {payment.status for payment in payments}
        if 'PENDING' in statuses:
            return 'settling'
        if statuses & {'FAILED', 'ABANDONED'}:
            return 'failed'
        return 'unpaid'

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        request = self.context.get('request')

        # Auto assign customer if authenticated via cookie or header JWT
        if request and request.user and request.user.is_authenticated:
            validated_data['customer'] = request.user
            if not validated_data.get('contact_name'):
                validated_data['contact_name'] = (
                    f"{request.user.first_name} {request.user.last_name}".strip()
                    or request.user.username
                )
            if not validated_data.get('contact_phone'):
                validated_data['contact_phone'] = request.user.phone or '+251911000000'

        # Fallback defaults
        if not validated_data.get('contact_name'):
            validated_data['contact_name'] = 'Valued Customer'
        if not validated_data.get('contact_phone'):
            validated_data['contact_phone'] = '+251911000000'

        # Generate unique order number
        timestamp_part = time.strftime('%Y%m%d')
        random_suffix = str(int(time.time() * 1000))[-4:]
        validated_data['order_number'] = f"ORD-{timestamp_part}-{random_suffix}"

        # Promise a prep time from the venue's own setting, so every new order carries
        # one the customer can be shown instead of a model default nobody ever set.
        if not validated_data.get('estimated_prep_minutes'):
            validated_data['estimated_prep_minutes'] = (
                RestaurantSettings.get_settings().default_prep_minutes
            )

        # Ensure delivery fee exists
        if 'delivery_fee_etb' not in validated_data or validated_data['delivery_fee_etb'] is None:
            validated_data['delivery_fee_etb'] = Decimal('0.00')

        delivery_fee = Decimal(str(validated_data['delivery_fee_etb']))

        # Resolve every line server-side so prices can never be tampered with.
        prepared_lines = [self._prepare_line(item) for item in items_data]

        # Item subtotals decide the order total (the frontend value is ignored)
        item_subtotals = [line['fields']['subtotal_etb'] for line in prepared_lines]
        computed_total = sum(item_subtotals, Decimal('0')) + delivery_fee

        total_amount = validated_data.get('total_amount_etb')
        if not total_amount or Decimal(str(total_amount)) == Decimal('0'):
            total_amount = computed_total
        else:
            # Trust the database over the browser.
            total_amount = computed_total

        validated_data['total_amount_etb'] = total_amount
        validated_data['subtotal_etb'] = total_amount - delivery_fee

        order = Order.objects.create(**validated_data)

        for line in prepared_lines:
            fields = line['fields']
            order_item = OrderItem.objects.create(order=order, **fields)
            for add_on in line['add_ons']:
                OrderItemAddOn.objects.create(order_item=order_item, **add_on)

        return order

    def _prepare_line(self, item_info):
        """
        Build one order line, resolving the menu price, the chosen variant and any
        add-ons from the database. Nothing about pricing is trusted from the client.
        """
        item_info = dict(item_info)
        add_ons_data = list(item_info.pop('add_ons', []) or [])
        menu_item = item_info.get('menu_item')

        base_price = Decimal('0')
        if menu_item:
            base_price = Decimal(str(menu_item.base_price_etb))
            if not item_info.get('item_name'):
                item_info['item_name'] = menu_item.name

        # Client-supplied unit price is only a fallback when we have no menu item
        unit_price = base_price or Decimal(str(item_info.get('unit_price_etb') or '0'))

        # Chosen variant (e.g. "400ml Large" +80 ETB) - priced from the menu
        variant_name = (item_info.get('variant_name') or '').strip()
        if menu_item and variant_name:
            variant = next(
                (v for v in menu_item.variants.all() if v.name.lower() == variant_name.lower()),
                None,
            )
            if variant:
                unit_price += Decimal(str(variant.price_modifier_etb))
            else:
                variant_name = ''
        item_info['variant_name'] = variant_name

        # Add-ons - priced from the menu; anything not on the item's add-on list is
        # dropped so a client cannot invent products or free extras.
        resolved_add_ons = []
        for add_on in add_ons_data:
            name = (add_on.get('add_on_name') or '').strip()
            if not name:
                continue
            price = None
            if menu_item:
                match = next(
                    (a for a in menu_item.add_ons.all() if a.name.lower() == name.lower()),
                    None,
                )
                if match:
                    name, price = match.name, Decimal(str(match.price_etb))
                else:
                    continue  # not offered for this item
            if price is None:
                price = Decimal(str(add_on.get('price_etb') or '0'))
            unit_price += price
            resolved_add_ons.append({'add_on_name': name, 'price_etb': price})

        if not unit_price:
            unit_price = Decimal('100.00')
        if not item_info.get('item_name'):
            item_info['item_name'] = 'Artisanal Selection'

        item_info['unit_price_etb'] = unit_price
        qty = item_info.get('quantity') or 1
        item_info['subtotal_etb'] = unit_price * qty

        return {'fields': item_info, 'add_ons': resolved_add_ons}
