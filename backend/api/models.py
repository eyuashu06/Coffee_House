from django.db import models
from django.conf import settings

class Category(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)
    icon = models.CharField(max_length=50, default='coffee')

    def __str__(self):
        return self.name

    class Meta:
        verbose_name_plural = 'Categories'

class CoffeeItem(models.Model):
    name = models.CharField(max_length=150)
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='coffees')
    price = models.DecimalField(max_digits=6, decimal_places=2)
    description = models.TextField()
    origin = models.CharField(max_length=150, blank=True, default='Single Estate')
    altitude = models.CharField(max_length=50, blank=True, default='1,800 MASL')
    process_method = models.CharField(max_length=100, blank=True, default='Washed')
    roast_level = models.CharField(max_length=50, default='Medium Roast')
    tasting_notes = models.CharField(max_length=255, help_text='Comma separated, e.g. Jasmine, Peach, Citrus', blank=True)
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=4.90)
    review_count = models.IntegerField(default=120)
    image_url = models.URLField(max_length=500)
    is_signature = models.BooleanField(default=False)
    is_available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} (${self.price})"

    class Meta:
        ordering = ['id']

class Order(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('PREPARING', 'Preparing'),
        ('READY', 'Ready'),
        ('OUT_FOR_DELIVERY', 'Out for Delivery'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='api_orders')
    customer_name = models.CharField(max_length=100, default='Guest Coffee Enthusiast')
    customer_email = models.EmailField(blank=True, default='guest@artisanalcoffee.com')
    total_amount = models.DecimalField(max_digits=8, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Order #{self.id} - ${self.total_amount} ({self.status})"

class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    coffee_item = models.ForeignKey(CoffeeItem, on_delete=models.SET_NULL, null=True)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=6, decimal_places=2)
    temperature = models.CharField(max_length=20, default='Hot')
    milk_choice = models.CharField(max_length=50, default='Oat Silk (Barista)')

    def __str__(self):
        return f"{self.quantity}x {self.coffee_item.name if self.coffee_item else 'Coffee'} ({self.temperature})"

class TableReservation(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('CONFIRMED', 'Confirmed'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reservations')
    name = models.CharField(max_length=150)
    date_time = models.DateTimeField()
    party_size = models.PositiveIntegerField()
    contact_phone = models.CharField(max_length=50, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} - {self.date_time.strftime('%Y-%m-%d %H:%M')} (Party of {self.party_size})"

    class Meta:
        ordering = ['-date_time']

class KnowledgeBase(models.Model):
    title = models.CharField(max_length=200)
    category = models.CharField(max_length=100, default='Tasting Notes')
    content = models.TextField()
    tags = models.CharField(max_length=255, help_text='Comma-separated keywords', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model

@receiver(post_save, sender=CoffeeItem)
def create_new_menu_item_notification(sender, instance, created, **kwargs):
    if created:
        User = get_user_model()
        from apps.accounts.models import Notification
        
        users = User.objects.filter(role='CUSTOMER')
        notifications = [
            Notification(
                user=user,
                title="New Menu Item!",
                message=f"{instance.name} is now available on our menu. Try it out!"
            ) for user in users
        ]
        if notifications:
            Notification.objects.bulk_create(notifications)

@receiver(post_save, sender=TableReservation)
def create_table_reservation_notification(sender, instance, created, **kwargs):
    if created:
        User = get_user_model()
        from apps.accounts.models import Notification
        
        managers_and_admins = User.objects.filter(role__in=['MANAGER', 'ADMIN'])
        notifications = [
            Notification(
                user=user,
                title="New Table Reservation",
                message=f"{instance.name} has reserved a table for {instance.party_size} on {instance.date_time.strftime('%Y-%m-%d %H:%M')}.",
                link="/manager"
            ) for user in managers_and_admins
        ]
        if notifications:
            Notification.objects.bulk_create(notifications)
