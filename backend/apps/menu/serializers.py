from rest_framework import serializers
from .models import Category, MenuItem, ItemVariant, AddOn

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'icon', 'display_order', 'is_active']

class ItemVariantSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemVariant
        fields = ['id', 'name', 'price_modifier_etb']

class AddOnSerializer(serializers.ModelSerializer):
    class Meta:
        model = AddOn
        fields = ['id', 'name', 'price_etb']

class MenuItemSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    variants = ItemVariantSerializer(many=True, read_only=True)
    add_ons = AddOnSerializer(many=True, read_only=True)
    image_display = serializers.CharField(source='get_image_display', read_only=True)
    # Frontend compatibility aliases
    image_url = serializers.CharField(source='get_image_display', read_only=True)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, source='base_price_etb', read_only=True)
    category_slug = serializers.CharField(source='category.slug', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = MenuItem
        fields = [
            'id', 'name', 'slug', 'description', 'category',
            'base_price_etb', 'price', 'image_display', 'image_url',
            'category_slug', 'category_name',
            'is_available',
            'is_signature', 'variants', 'add_ons'
        ]
