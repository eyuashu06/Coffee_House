from django.db import models

class Category(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)
    icon = models.CharField(max_length=50, default='local_cafe')
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = 'Categories'
        ordering = ['display_order', 'name']

    def __str__(self):
        return self.name

class MenuItem(models.Model):
    #: Read in _prepare_line and _order_prep_minutes_from_lines via instance
    #: attributes, not a serializer PK field.

    name = models.CharField(max_length=150)
    slug = models.SlugField(unique=True)
    description = models.TextField()
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='items')
    base_price_etb = models.DecimalField(max_digits=10, decimal_places=2, help_text='Price in ETB')
    image = models.ImageField(upload_to='menu_items/', blank=True, null=True)
    image_url = models.URLField(max_length=500, blank=True, help_text='External image link fallback')
    is_available = models.BooleanField(default=True)
    is_signature = models.BooleanField(default=False)
    prep_minutes = models.PositiveIntegerField(
        default=20,
        help_text='Estimated kitchen prep time in minutes for this item. Drinks and food can have different values; the order prep time is the slowest item in the order.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['category', 'name']

    def get_image_display(self):
        if self.image:
            try:
                if self.image.storage.exists(self.image.name):
                    return self.image.url
            except Exception:
                pass
            if self.image_url:
                return self.image_url
            return self.image.url
        return self.image_url

    def __str__(self):
        return f"{self.name} ({self.base_price_etb} ETB)"

class ItemVariant(models.Model):
    menu_item = models.ForeignKey(MenuItem, on_delete=models.CASCADE, related_name='variants')
    name = models.CharField(max_length=50, help_text='e.g., Small, Medium, Large, Double Shot')
    price_modifier_etb = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    def __str__(self):
        return f"{self.menu_item.name} - {self.name} (+{self.price_modifier_etb} ETB)"

class AddOn(models.Model):
    menu_item = models.ForeignKey(MenuItem, on_delete=models.CASCADE, related_name='add_ons')
    name = models.CharField(max_length=100, help_text='e.g., Extra Cheese, Caramel Syrup')
    price_etb = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.name} (+{self.price_etb} ETB)"


class CafeSettings(models.Model):
    cafe_name = models.CharField(max_length=120, default='Buna Hub')
    tagline = models.CharField(max_length=200, default='Artisanal Reserve')
    description = models.TextField(
        default='An Ethiopian coffee house in Piassa — ceremony buna, slow teas, and a kitchen that stays open late.'
    )
    primary_phone = models.CharField(max_length=50, default='+251 11 555 0148')
    contact_email = models.EmailField(default='selam@bunahub.et')
    opening_hours = models.CharField(max_length=100, default='1:00 – 3:00')
    ceremony_time = models.CharField(max_length=100, default='9:00 (ከቀኑ 9:00)')
    hero_slides = models.JSONField(default=list, blank=True)
    dining_slides = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Cafe Settings'
        verbose_name_plural = 'Cafe Settings'

    def __str__(self):
        return self.cafe_name


class CafeLocation(models.Model):
    name = models.CharField(max_length=150, help_text="e.g. Piassa Flagship, Bole Medhanialem Branch")
    address = models.CharField(max_length=255, help_text="e.g. Gulele Road 14, Piassa")
    city = models.CharField(max_length=100, default='Addis Ababa')
    phone = models.CharField(max_length=50, blank=True, default='+251 11 555 0148')
    email = models.EmailField(blank=True, default='selam@bunahub.et')
    opening_hours = models.CharField(max_length=100, default='1:00 – 3:00')
    is_primary = models.BooleanField(default=False, help_text="Primary / Main Branch")
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', '-is_primary', 'id']

    def __str__(self):
        return f"{self.name} ({self.address}, {self.city})"


class PromotionalEvent(models.Model):
    KIND_CHOICES = (
        ('EVENT', 'Event'),
        ('DISCOUNT', 'Discount Offer'),
        ('AD', 'Announcement / Ad'),
    )

    title = models.CharField(max_length=150)
    subtitle = models.TextField(blank=True)
    badge_text = models.CharField(max_length=40, blank=True, help_text='e.g. 20% OFF, LIVE EVENT, WEEKEND SPECIAL')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default='EVENT')
    discount_percent = models.PositiveIntegerField(
        default=0,
        help_text='0 for announcement/event only, or 1–90 for a percentage order discount.',
    )
    promo_code = models.CharField(
        max_length=40,
        blank=True,
        help_text='Optional code (e.g. BUNA15). Leave blank to auto-apply when active.',
    )
    min_order_etb = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    cta_label = models.CharField(max_length=60, blank=True, default='Order Now')
    cta_href = models.CharField(max_length=200, blank=True, default='#menu')
    image_url = models.TextField(blank=True, help_text='Optional banner image URL or compressed image data URI')
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_active', '-created_at']

    def is_live_now(self, now=None):
        from django.utils import timezone
        if not self.is_active:
            return False
        now = now or timezone.now()
        if self.starts_at and self.starts_at > now:
            return False
        if self.ends_at and self.ends_at < now:
            return False
        return True

    def __str__(self):
        return f"{self.title} ({self.kind})"
