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
    name = models.CharField(max_length=150)
    slug = models.SlugField(unique=True)
    description = models.TextField()
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='items')
    base_price_etb = models.DecimalField(max_digits=10, decimal_places=2, help_text='Price in ETB')
    image = models.ImageField(upload_to='menu_items/', blank=True, null=True)
    image_url = models.URLField(max_length=500, blank=True, help_text='External image link fallback')
    is_available = models.BooleanField(default=True)
    is_signature = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['category', 'name']

    def get_image_display(self):
        if self.image:
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
