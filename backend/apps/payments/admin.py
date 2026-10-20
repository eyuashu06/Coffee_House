from django.contrib import admin
from .models import Payment, PaymentAccount

@admin.register(PaymentAccount)
class PaymentAccountAdmin(admin.ModelAdmin):
    list_display = ('method', 'account_name', 'account_number', 'is_active', 'updated_at')
    list_filter = ('method', 'is_active')
    search_fields = ('account_name', 'account_number', 'bank_name')

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('tx_ref', 'order', 'payment_method', 'amount_etb', 'status', 'transaction_reference', 'approved_by', 'created_at')
    list_filter = ('status', 'payment_method', 'created_at')
    search_fields = ('tx_ref', 'chapa_reference', 'transaction_reference', 'order__order_number', 'phone_number')
    readonly_fields = ('tx_ref', 'created_at', 'updated_at', 'approved_at')

