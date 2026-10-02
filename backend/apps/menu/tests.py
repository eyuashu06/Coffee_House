from decimal import Decimal
from django.test import TestCase
from apps.menu.models import Category, MenuItem, ItemVariant, AddOn

class MenuModelTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name='Coffee', slug='coffee')
        self.menu_item = MenuItem.objects.create(
            name='Ethiopian Geisha Pour-Over',
            slug='ethiopian-geisha-pour-over',
            description='Single-origin micro-lot from Bench Maji.',
            category=self.category,
            base_price_etb=Decimal('250.00'),
            is_available=True
        )

    def test_menu_item_decimal_precision(self):
        self.assertEqual(self.menu_item.base_price_etb, Decimal('250.00'))
        self.assertIsInstance(self.menu_item.base_price_etb, Decimal)

    def test_variants_and_addons(self):
        variant = ItemVariant.objects.create(
            menu_item=self.menu_item,
            name='Large',
            price_modifier_etb=Decimal('50.00')
        )
        addon = AddOn.objects.create(
            menu_item=self.menu_item,
            name='Extra Shot',
            price_etb=Decimal('35.00')
        )

        self.assertEqual(variant.price_modifier_etb, Decimal('50.00'))
        self.assertEqual(addon.price_etb, Decimal('35.00'))
