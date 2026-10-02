from django.contrib import admin
from .models import Payment

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('tx_ref', 'order', 'amount_etb', 'currency', 'status', 'created_at')
    list_filter = ('status', 'currency', 'created_at')
    search_fields = ('tx_ref', 'chapa_reference', 'order__order_number')
    readonly_fields = ('tx_ref', 'created_at', 'updated_at')
