from django.db import models
from django.conf import settings
from apps.accounts.models import validate_ethiopian_phone
from apps.menu.models import MenuItem

class RestaurantSettings(models.Model):
    is_open = models.BooleanField(default=True, help_text='Master toggle to accept new orders')
    opening_hours = models.CharField(max_length=200, default='Mon - Sun: 7:00 AM - 10:00 PM')
    default_prep_minutes = models.PositiveIntegerField(default=20)
    contact_phone = models.CharField(max_length=20, default='+251911234567', validators=[validate_ethiopian_phone])
    contact_email = models.EmailField(default='hello@artisanalcoffee.com')
    address = models.CharField(max_length=255, default='Bole Medhanialem, Addis Ababa, Ethiopia')

    class Meta:
        verbose_name_plural = 'Restaurant Settings'

    def save(self, *args, **kwargs):
        self.pk = 1  # Ensures single instance
        super().save(*args, **kwargs)

    @classmethod
    def get_settings(cls):
        settings_obj, _ = cls.objects.get_or_create(pk=1)
        return settings_obj

    def __str__(self):
        return f"Restaurant Settings ({'Open' if self.is_open else 'Closed'})"

class DeliveryZone(models.Model):
    name = models.CharField(max_length=100, help_text='e.g., Bole, Kazanchis, Kirkos, Old Airport')
    delivery_fee_etb = models.DecimalField(max_digits=10, decimal_places=2, help_text='Delivery fee in ETB')
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} ({self.delivery_fee_etb} ETB)"

class Order(models.Model):
    ORDER_TYPES = (
        ('DELIVERY', 'Delivery'),
        ('PICKUP', 'Store Pickup'),
        ('DINE_IN', 'Dine-In (Table Service)'),
    )

    STATUS_CHOICES = (
        ('PENDING_PAYMENT', 'Pending Payment'),
        ('PLACED', 'Placed (Paid)'),
        ('ACCEPTED', 'Accepted by Kitchen'),
        ('PREPARING', 'Preparing'),
        ('READY', 'Ready for Pickup / Delivery'),
        ('OUT_FOR_DELIVERY', 'Out for Delivery'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled by Customer'),
        ('REJECTED', 'Rejected by Manager'),
    )

    order_number = models.CharField(max_length=50, unique=True, db_index=True)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='orders'
    )
    order_type = models.CharField(max_length=20, choices=ORDER_TYPES, default='DELIVERY')
    table_number = models.CharField(max_length=20, blank=True, help_text='For Dine-In orders')
    delivery_zone = models.ForeignKey(DeliveryZone, on_delete=models.SET_NULL, null=True, blank=True)

    # Historical Contact & Address Snapshots
    contact_name = models.CharField(max_length=150)
    contact_phone = models.CharField(max_length=20, validators=[validate_ethiopian_phone])
    delivery_address = models.TextField(blank=True, help_text='Snapshot of full address at time of order')

    # Financial Precision Fields (DecimalField in ETB)
    subtotal_etb = models.DecimalField(max_digits=10, decimal_places=2)
    delivery_fee_etb = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    total_amount_etb = models.DecimalField(max_digits=10, decimal_places=2)

    # Lifecycle & Progress
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='PENDING_PAYMENT', db_index=True)
    notes = models.TextField(blank=True)
    estimated_prep_minutes = models.PositiveIntegerField(
        default=20,
        help_text='Filled from RestaurantSettings.default_prep_minutes when the order is placed',
    )
    rejection_reason = models.TextField(blank=True)
    placed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
        ]

    def __str__(self):
        return f"{self.order_number} - {self.get_status_display()} ({self.total_amount_etb} ETB)"

class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    menu_item = models.ForeignKey(MenuItem, on_delete=models.SET_NULL, null=True, blank=True)

    # Historical Item Snapshots
    item_name = models.CharField(max_length=150)
    variant_name = models.CharField(max_length=100, blank=True)
    unit_price_etb = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField(default=1)
    subtotal_etb = models.DecimalField(max_digits=10, decimal_places=2)
    temperature = models.CharField(max_length=20, default='Hot', blank=True)
    milk_choice = models.CharField(max_length=50, default='Oat Silk (Barista)', blank=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.quantity}x {self.item_name} ({self.subtotal_etb} ETB)"

class OrderItemAddOn(models.Model):
    order_item = models.ForeignKey(OrderItem, on_delete=models.CASCADE, related_name='add_ons')
    add_on_name = models.CharField(max_length=100)
    price_etb = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.add_on_name} (+{self.price_etb} ETB)"

class OrderStatusHistory(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='status_history')
    status = models.CharField(max_length=30, choices=Order.STATUS_CHOICES)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return f"{self.order.order_number} -> {self.status} at {self.timestamp}"

from django.db.models.signals import post_save
from django.dispatch import receiver
from apps.accounts.models import Notification, User

@receiver(post_save, sender=OrderStatusHistory)
def create_order_status_notification(sender, instance, created, **kwargs):
    if not created:
        return

    # Notify the customer of every status change (with link to their orders)
    if instance.order.customer:
        Notification.objects.create(
            user=instance.order.customer,
            title=f"Order {instance.order.order_number} Updated",
            message=f"Your order is now: {instance.get_status_display()}.",
            link='/account?tab=orders'
        )

    # Notify managers/admins immediately when any new order enters the system
    # (PENDING_PAYMENT = just created, PLACED = payment confirmed)
    if instance.status in ['PENDING_PAYMENT', 'PLACED']:
        managers = User.objects.filter(role__in=['ADMIN', 'MANAGER'])
        if instance.status == 'PLACED':
            notif_title = "New Order Received"
            notif_message = f"Customer placed order #{instance.order.order_number} (ETB {instance.order.total_amount_etb})."
        else:
            notif_title = "New Order — Awaiting Payment"
            notif_message = f"Order #{instance.order.order_number} by {instance.order.contact_name} awaiting payment (ETB {instance.order.total_amount_etb})."

        Notification.objects.bulk_create([
            Notification(
                user=manager,
                title=notif_title,
                message=notif_message,
                link=f'/manager?order={instance.order.order_number}'
            )
            for manager in managers
        ])
