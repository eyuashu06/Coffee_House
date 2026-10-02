from rest_framework import serializers
from .models import Payment
from apps.orders.models import Order

class PaymentSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source='order.order_number', read_only=True)

    class Meta:
        model = Payment
        fields = (
            'id',
            'order',
            'order_number',
            'tx_ref',
            'chapa_reference',
            'payment_method',
            'phone_number',
            'amount_etb',
            'currency',
            'status',
            'checkout_url',
            'failure_reason',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('id', 'tx_ref', 'chapa_reference', 'status', 'checkout_url', 'created_at', 'updated_at')

class InitializePaymentSerializer(serializers.Serializer):
    order_id = serializers.IntegerField()
    payment_method = serializers.ChoiceField(choices=Payment.METHOD_CHOICES, default='telebirr')
    phone_number = serializers.CharField(required=False, allow_blank=True)

    def validate_order_id(self, value):
        try:
            order = Order.objects.get(pk=value)
        except Order.DoesNotExist:
            raise serializers.ValidationError('Order not found.')
        return value
