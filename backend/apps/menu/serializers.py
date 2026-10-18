from rest_framework import serializers
from .models import Category, MenuItem, ItemVariant, AddOn, CafeSettings, CafeLocation

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
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), source='category', write_only=True, required=False
    )
    variants = ItemVariantSerializer(many=True, read_only=True)
    add_ons = AddOnSerializer(many=True, read_only=True)
    image_display = serializers.CharField(source='get_image_display', read_only=True)
    image = serializers.ImageField(required=False, allow_null=True)
    clear_image = serializers.BooleanField(write_only=True, required=False, default=False)
    image_url = serializers.CharField(required=False, allow_blank=True, default='')
    base_price_etb = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, write_only=True)
    description = serializers.CharField(required=False, allow_blank=True, default='')
    category_slug = serializers.CharField(source='category.slug', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    slug = serializers.SlugField(required=False, allow_blank=True)

    class Meta:
        model = MenuItem
        fields = [
            'id', 'name', 'slug', 'description', 'category', 'category_id',
            'base_price_etb', 'price', 'image', 'clear_image', 'image_display', 'image_url',
            'category_slug', 'category_name',
            'is_available',
            'is_signature', 'variants', 'add_ons'
        ]

    def to_internal_value(self, data):
        mutable_data = data.copy() if hasattr(data, 'copy') else dict(data)
        # Handle price / base_price_etb interchangeability
        if 'price' in mutable_data and ('base_price_etb' not in mutable_data or not mutable_data['base_price_etb']):
            mutable_data['base_price_etb'] = mutable_data['price']
        elif 'base_price_etb' in mutable_data and ('price' not in mutable_data or not mutable_data['price']):
            mutable_data['price'] = mutable_data['base_price_etb']

        # Handle empty string category_id from multipart forms
        if 'category_id' in mutable_data and (mutable_data['category_id'] == '' or mutable_data['category_id'] is None or mutable_data['category_id'] == 'null'):
            first_cat = Category.objects.filter(is_active=True).first() or Category.objects.first()
            if first_cat:
                mutable_data['category_id'] = first_cat.id
            else:
                mutable_data.pop('category_id', None)

        return super().to_internal_value(mutable_data)

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['price'] = str(instance.base_price_etb) if instance.base_price_etb is not None else '0.00'
        return ret

    def create(self, validated_data):
        from django.utils.text import slugify
        # Remove write_only helper fields before creating model instance
        validated_data.pop('clear_image', None)
        validated_data.pop('price', None)
        if not validated_data.get('slug'):
            base_slug = slugify(validated_data.get('name', 'menu-item')) or 'item'
            slug = base_slug
            idx = 1
            while MenuItem.objects.filter(slug=slug).exists():
                slug = f"{base_slug}-{idx}"
                idx += 1
            validated_data['slug'] = slug
        if 'category' not in validated_data:
            first_cat = Category.objects.filter(is_active=True).first() or Category.objects.first()
            if first_cat:
                validated_data['category'] = first_cat
        return super().create(validated_data)

    def update(self, instance, validated_data):
        from django.utils.text import slugify
        clear_img = validated_data.pop('clear_image', False)
        validated_data.pop('price', None)
        if clear_img and instance.image:
            instance.image.delete(save=False)
            instance.image = None
        if 'name' in validated_data and not validated_data.get('slug'):
            base_slug = slugify(validated_data['name'])
            if base_slug and base_slug != instance.slug:
                slug = base_slug
                idx = 1
                while MenuItem.objects.filter(slug=slug).exclude(id=instance.id).exists():
                    slug = f"{base_slug}-{idx}"
                    idx += 1
                validated_data['slug'] = slug
        return super().update(instance, validated_data)


class CafeSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CafeSettings
        fields = [
            'id', 'cafe_name', 'tagline', 'description',
            'primary_phone', 'contact_email', 'opening_hours',
            'ceremony_time', 'updated_at'
        ]


class CafeLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CafeLocation
        fields = [
            'id', 'name', 'address', 'city', 'phone', 'email',
            'opening_hours', 'is_primary', 'is_active', 'display_order',
            'created_at', 'updated_at'
        ]
