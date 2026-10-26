from django.contrib import admin
from .models import KnowledgeBase

# Note: Active menu categories and items are registered in apps/menu/admin.py.
# The legacy prototype models (api.Category, api.CoffeeItem, api.Order) are omitted
# from the admin panel to prevent confusing duplicate empty sections.

@admin.register(KnowledgeBase)
class KnowledgeBaseAdmin(admin.ModelAdmin):
    list_display = ('title', 'category', 'created_at')
    search_fields = ('title', 'content', 'tags')
