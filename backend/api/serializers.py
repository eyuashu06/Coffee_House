from rest_framework import serializers
from .models import Category, CoffeeItem, Order, OrderItem, KnowledgeBase, TableReservation

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'

class CoffeeItemSerializer(serializers.ModelSerializer):
    category_name = serializers.ReadOnlyField(source='category.name')
    category_slug = serializers.ReadOnlyField(source='category.slug')

    class Meta:
        model = CoffeeItem
        fields = '__all__'

class OrderItemSerializer(serializers.ModelSerializer):
    coffee_name = serializers.ReadOnlyField(source='coffee_item.name')

    class Meta:
        model = OrderItem
        fields = ['id', 'coffee_item', 'coffee_name', 'quantity', 'unit_price', 'temperature', 'milk_choice']

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True)

    class Meta:
        model = Order
        fields = ['id', 'user', 'customer_name', 'customer_email', 'total_amount', 'status', 'created_at', 'items']
        read_only_fields = ['user', 'created_at']

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        order = Order.objects.create(**validated_data)
        for item_data in items_data:
            OrderItem.objects.create(order=order, **item_data)
        return order

class KnowledgeBaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = KnowledgeBase
        fields = '__all__'

class TableReservationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TableReservation
        fields = '__all__'
        read_only_fields = ['user', 'created_at']

