from rest_framework import serializers
from .models import Payment, PaymentAccount
from apps.orders.models import Order


class PaymentAccountSerializer(serializers.ModelSerializer):
    method_display = serializers.CharField(source='get_method_display', read_only=True)

    class Meta:
        model = PaymentAccount
        fields = (
            'id',
            'method',
            'method_display',
            'account_name',
            'account_number',
            'bank_name',
            'instructions',
            'is_active',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')


class PaymentSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source='order.order_number', read_only=True)
    approved_by_username = serializers.CharField(source='approved_by.username', read_only=True)

    receipt_url = serializers.CharField(read_only=True)

    class Meta:
        model = Payment
        fields = (
            'id',
            'order',
            'order_number',
            'tx_ref',
            'chapa_reference',
            'transaction_reference',
            'receipt_file',
            'receipt_url',
            'receipt_data',
            'receipt_type',
            'payment_method',
            'phone_number',
            'amount_etb',
            'currency',
            'status',
            'checkout_url',
            'failure_reason',
            'approved_by',
            'approved_by_username',
            'approved_at',
            'approval_notes',
            'verified_at',
            'gateway_status',
            'created_at',
            'updated_at',
        )
        read_only_fields = (
            'id',
            'tx_ref',
            'chapa_reference',
            'status',
            'checkout_url',
            'approved_by',
            'approved_at',
            'verified_at',
            'gateway_status',
            'created_at',
            'updated_at',
        )


class InitializePaymentSerializer(serializers.Serializer):
    order_id = serializers.IntegerField()
    payment_method = serializers.ChoiceField(choices=Payment.METHOD_CHOICES, default='telebirr')
    phone_number = serializers.CharField(required=False, allow_blank=True)
    transaction_reference = serializers.CharField(required=False, allow_blank=True)
    frontend_url = serializers.CharField(required=False, allow_blank=True)
    return_url = serializers.CharField(required=False, allow_blank=True)

    def validate_order_id(self, value):
        try:
            order = Order.objects.get(pk=value)
        except Order.DoesNotExist:
            raise serializers.ValidationError('Order not found.')
        return value

