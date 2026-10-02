from django.contrib import admin
from .models import Category, CoffeeItem, Order, OrderItem, KnowledgeBase

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'icon')
    prepopulated_fields = {'slug': ('name',)}

@admin.register(CoffeeItem)
class CoffeeItemAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'price', 'rating', 'is_signature')
    list_filter = ('category', 'is_signature', 'roast_level')
    search_fields = ('name', 'description', 'tasting_notes')

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'customer_name', 'total_amount', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    inlines = [OrderItemInline]

@admin.register(KnowledgeBase)
class KnowledgeBaseAdmin(admin.ModelAdmin):
    list_display = ('title', 'category', 'created_at')
    search_fields = ('title', 'content', 'tags')
