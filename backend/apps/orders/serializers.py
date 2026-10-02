import time
from rest_framework import serializers
from decimal import Decimal
from .models import Order, OrderItem, OrderItemAddOn, DeliveryZone, RestaurantSettings
from apps.menu.models import MenuItem


class DeliveryZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryZone
        fields = '__all__'


class RestaurantSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = RestaurantSettings
        fields = '__all__'


class OrderItemAddOnSerializer(serializers.ModelSerializer):
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
    # Backend always computes these — not required from frontend
    subtotal_etb = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    delivery_fee_etb = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)

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
        )
        read_only_fields = ('id', 'order_number', 'customer', 'created_at', 'placed_at')

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

        # Ensure delivery fee exists
        if 'delivery_fee_etb' not in validated_data or validated_data['delivery_fee_etb'] is None:
            validated_data['delivery_fee_etb'] = Decimal('0.00')

        delivery_fee = Decimal(str(validated_data['delivery_fee_etb']))

        # Compute item subtotals first so we can derive order total if missing
        item_subtotals = []
        for item_info in items_data:
            qty = item_info.get('quantity', 1)
            unit_price = Decimal(str(item_info.get('unit_price_etb', '0'))) if item_info.get('unit_price_etb') else Decimal('0')
            item_subtotals.append(unit_price * qty)

        # If frontend didn't send total_amount_etb (or sent 0), compute from items
        total_amount = validated_data.get('total_amount_etb')
        if not total_amount or Decimal(str(total_amount)) == Decimal('0'):
            total_amount = sum(item_subtotals) + delivery_fee
            validated_data['total_amount_etb'] = total_amount
        else:
            total_amount = Decimal(str(total_amount))

        # Always set subtotal = total - delivery_fee
        validated_data['subtotal_etb'] = total_amount - delivery_fee

        order = Order.objects.create(**validated_data)

        # Create items & snapshots
        for idx, item_info in enumerate(items_data):
            add_ons_data = item_info.pop('add_ons', [])
            menu_item = item_info.get('menu_item')

            # Populate snapshot name & price from MenuItem if missing
            if menu_item and not item_info.get('item_name'):
                item_info['item_name'] = menu_item.name
            if menu_item and not item_info.get('unit_price_etb'):
                item_info['unit_price_etb'] = menu_item.base_price_etb

            if not item_info.get('item_name'):
                item_info['item_name'] = 'Artisanal Selection'
            if not item_info.get('unit_price_etb'):
                item_info['unit_price_etb'] = Decimal('100.00')

            qty = item_info.get('quantity', 1)
            unit_price = Decimal(str(item_info['unit_price_etb']))
            # Always recompute subtotal — never trust frontend value
            item_info['subtotal_etb'] = unit_price * qty

            order_item = OrderItem.objects.create(order=order, **item_info)

            for add_on_data in add_ons_data:
                OrderItemAddOn.objects.create(order_item=order_item, **add_on_data)

        return order
