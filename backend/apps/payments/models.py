from django.db import models
from django.utils import timezone
from apps.orders.models import Order, OrderStatusHistory

class Payment(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending Payment'),
        ('SUCCESS', 'Payment Successful'),
        ('FAILED', 'Payment Failed'),
        ('ABANDONED', 'Payment Abandoned / Cancelled'),
    )

    METHOD_CHOICES = (
        ('telebirr', 'Telebirr'),
        ('cbebirr', 'CBE Birr'),
        ('mpesa', 'M-Pesa'),
        ('awashbirr', 'Awash Birr'),
        ('ebirr', 'E-Birr'),
        ('card', 'Credit / Debit Card'),
        ('cash', 'Cash on Delivery'),
    )

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='payments')
    tx_ref = models.CharField(max_length=100, unique=True, db_index=True)
    chapa_reference = models.CharField(max_length=100, blank=True)
    payment_method = models.CharField(max_length=30, choices=METHOD_CHOICES, default='telebirr')
    phone_number = models.CharField(max_length=25, blank=True, help_text='Phone number used for mobile payment')
    amount_etb = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=10, default='ETB')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    checkout_url = models.URLField(max_length=500, blank=True)
    raw_response = models.TextField(blank=True, help_text='JSON response dump from Chapa API')
    failure_reason = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def mark_as_success(self, chapa_ref='', raw_data=''):
        self.status = 'SUCCESS'
        if chapa_ref:
            self.chapa_reference = chapa_ref
        if raw_data:
            self.raw_response = str(raw_data)
        self.failure_reason = ''
        self.save()

        # Update order status to PLACED and record it so the customer AND the
        # manager get notified that a paid order just landed.
        order = self.order
        if order.status == 'PENDING_PAYMENT':
            order.status = 'PLACED'
            if not order.placed_at:
                order.placed_at = timezone.now()
            order.save()
            OrderStatusHistory.objects.create(
                order=order,
                status='PLACED',
                notes=f'Payment confirmed ({self.payment_method})',
            )

    def mark_as_failed(self, reason='Payment Failed', raw_data=''):
        self.status = 'FAILED'
        self.failure_reason = reason
        if raw_data:
            self.raw_response = str(raw_data)
        self.save()

    def mark_as_cancelled(self, reason='User Cancelled', raw_data=''):
        self.status = 'ABANDONED'
        self.failure_reason = reason
        if raw_data:
            self.raw_response = str(raw_data)
        self.save()

        # Update order status to CANCELLED
        order = self.order
        if order.status == 'PENDING_PAYMENT':
            order.status = 'CANCELLED'
            order.rejection_reason = reason
            order.save()
            OrderStatusHistory.objects.create(
                order=order,
                status='CANCELLED',
                notes=reason,
            )

    def __str__(self):
        return f"Payment {self.tx_ref} - {self.get_status_display()} ({self.amount_etb} ETB)"
