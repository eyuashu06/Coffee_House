from django.contrib import admin
from .models import Cart, CartItem

class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0

@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ('user', 'get_total_items', 'get_total_etb_display', 'updated_at')
    inlines = [CartItemInline]

    def get_total_items(self, obj):
        return obj.items.count()
    get_total_items.short_description = 'Items Count'

    def get_total_etb_display(self, obj):
        return f"{obj.get_total_etb()} ETB"
    get_total_etb_display.short_description = 'Total (ETB)'
