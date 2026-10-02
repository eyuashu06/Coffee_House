from django.contrib import admin
from .models import (
    RestaurantSettings,
    DeliveryZone,
    Order,
    OrderItem,
    OrderItemAddOn,
    OrderStatusHistory
)

class OrderItemAddOnInline(admin.TabularInline):
    model = OrderItemAddOn
    extra = 0

class OrderItemInline(admin.StackedInline):
    model = OrderItem
    extra = 0

class OrderStatusHistoryInline(admin.TabularInline):
    model = OrderStatusHistory
    extra = 0
    readonly_fields = ('timestamp',)

@admin.register(RestaurantSettings)
class RestaurantSettingsAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'is_open', 'default_prep_minutes', 'contact_phone', 'contact_email')

@admin.register(DeliveryZone)
class DeliveryZoneAdmin(admin.ModelAdmin):
    list_display = ('name', 'delivery_fee_etb', 'is_active')
    list_editable = ('delivery_fee_etb', 'is_active')

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        'order_number',
        'contact_name',
        'contact_phone',
        'order_type',
        'status',
        'total_amount_etb',
        'created_at'
    )
    list_filter = ('status', 'order_type', 'created_at', 'delivery_zone')
    search_fields = ('order_number', 'contact_name', 'contact_phone')
    readonly_fields = ('order_number', 'placed_at', 'created_at')
    inlines = [OrderItemInline, OrderStatusHistoryInline]
