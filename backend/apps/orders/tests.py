from decimal import Decimal
from django.test import TestCase
from apps.orders.models import DeliveryZone, Order, OrderItem, RestaurantSettings

class OrdersModelTests(TestCase):
    def setUp(self):
        self.zone = DeliveryZone.objects.create(
            name='Bole',
            delivery_fee_etb=Decimal('100.00'),
            is_active=True
        )
        self.order = Order.objects.create(
            order_number='ORD-20260930-001',
            order_type='DELIVERY',
            delivery_zone=self.zone,
            contact_name='Abebe Bikila',
            contact_phone='+251911112233',
            delivery_address='Bole Medhanialem, House #123',
            subtotal_etb=Decimal('500.00'),
            delivery_fee_etb=Decimal('100.00'),
            total_amount_etb=Decimal('600.00'),
            status='PENDING_PAYMENT'
        )

    def test_order_snapshot_integrity(self):
        item = OrderItem.objects.create(
            order=self.order,
            item_name='Smoked Vanilla Bourbon Latte',
            variant_name='Large',
            unit_price_etb=Decimal('250.00'),
            quantity=2,
            subtotal_etb=Decimal('500.00'),
            temperature='Hot',
            milk_choice='Oat Silk (Barista)'
        )

        self.assertEqual(self.order.total_amount_etb, Decimal('600.00'))
        self.assertEqual(item.subtotal_etb, Decimal('500.00'))
        self.assertEqual(self.order.contact_phone, '+251911112233')

    def test_restaurant_settings_singleton(self):
        s1 = RestaurantSettings.get_settings()
        s2 = RestaurantSettings.get_settings()
        self.assertEqual(s1.pk, s2.pk)
