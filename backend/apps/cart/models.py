from django.db import models
from django.conf import settings
from apps.menu.models import MenuItem, ItemVariant, AddOn

class Cart(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='cart'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def get_total_etb(self):
        return sum(item.get_subtotal_etb() for item in self.items.all())

    def __str__(self):
        return f"Cart for {self.user.username}"

class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    menu_item = models.ForeignKey(MenuItem, on_delete=models.CASCADE)
    variant = models.ForeignKey(ItemVariant, on_delete=models.SET_NULL, null=True, blank=True)
    add_ons = models.ManyToManyField(AddOn, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    temperature = models.CharField(max_length=20, default='Hot')
    milk_choice = models.CharField(max_length=50, default='Oat Silk (Barista)')
    notes = models.TextField(blank=True)

    def get_unit_price_etb(self):
        base = self.menu_item.base_price_etb
        if self.variant:
            base += self.variant.price_modifier_etb
        add_on_total = sum(addon.price_etb for addon in self.add_ons.all())
        return base + add_on_total

    def get_subtotal_etb(self):
        return self.get_unit_price_etb() * self.quantity

    def __str__(self):
        return f"{self.quantity}x {self.menu_item.name} in Cart #{self.cart.id}"
