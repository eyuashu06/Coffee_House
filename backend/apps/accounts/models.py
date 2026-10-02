import re
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError

def normalize_ethiopian_phone(value):
    """Normalizes any Ethiopian phone number string into standard format (+251XXXXXXXXX)."""
    if not value:
        return ''
    cleaned = re.sub(r'[\s\-\(\)]', '', str(value))
    if re.match(r'^[79]\d{8}$', cleaned):
        return f'+251{cleaned}'
    if re.match(r'^0[79]\d{8}$', cleaned):
        return f'+251{cleaned[1:]}'
    if re.match(r'^251[79]\d{8}$', cleaned):
        return f'+{cleaned}'
    if re.match(r'^\+251[79]\d{8}$', cleaned):
        return cleaned
    return cleaned

def validate_ethiopian_phone(value):
    """Validates Ethiopian phone formats: +2519..., +2517..., 09..., 07..., 9..., 7..."""
    if not value:
        return
    norm = normalize_ethiopian_phone(value)
    pattern = r'^\+251[79]\d{8}$'
    if not re.match(pattern, norm):
        raise ValidationError(
            'Invalid Ethiopian phone number. Must be a valid mobile number starting with 9 or 7 (e.g., 911223344, 0911223344, or +251911223344).'
        )

class User(AbstractUser):
    ROLE_CHOICES = (
        ('CUSTOMER', 'Customer'),
        ('MANAGER', 'Manager / Hotel Staff'),
        ('ADMIN', 'System Administrator'),
    )

    phone = models.CharField(
        max_length=20,
        blank=True,
        validators=[validate_ethiopian_phone],
        help_text='Format: +2519XXXXXXXX, 09XXXXXXXX, or 9XXXXXXXX'
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='CUSTOMER')

    def save(self, *args, **kwargs):
        if self.phone:
            self.phone = normalize_ethiopian_phone(self.phone)
        super().save(*args, **kwargs)

    def is_manager_or_admin(self):
        return self.role in ['MANAGER', 'ADMIN'] or self.is_superuser

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"

class Address(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='addresses')
    street_address = models.CharField(max_length=255)
    city = models.CharField(max_length=100, default='Addis Ababa', blank=True)
    subcity_or_zone = models.CharField(max_length=100, help_text='e.g., Bole, Kirkos, Kazanchis', blank=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.street_address}, {self.subcity_or_zone}, {self.city}"

class Notification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications', null=True, blank=True)
    title = models.CharField(max_length=200)
    message = models.TextField()
    link = models.CharField(max_length=500, blank=True, help_text='Frontend URL to navigate to when the notification is clicked')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"To {self.user}: {self.title}"
