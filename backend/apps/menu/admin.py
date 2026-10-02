from django.contrib import admin
from .models import Category, MenuItem, ItemVariant, AddOn

class ItemVariantInline(admin.TabularInline):
    model = ItemVariant
    extra = 1

class AddOnInline(admin.TabularInline):
    model = AddOn
    extra = 1

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'icon', 'display_order', 'is_active')
    list_editable = ('display_order', 'is_active')
    prepopulated_fields = {'slug': ('name',)}

@admin.register(MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'base_price_etb', 'is_available', 'is_signature', 'created_at')
    list_filter = ('category', 'is_available', 'is_signature')
    list_editable = ('base_price_etb', 'is_available', 'is_signature')
    search_fields = ('name', 'description')
    prepopulated_fields = {'slug': ('name',)}
    inlines = [ItemVariantInline, AddOnInline]
