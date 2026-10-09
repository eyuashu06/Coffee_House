from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.menu.models import Category, MenuItem
from apps.orders.models import DeliveryZone, Order, OrderItem, RestaurantSettings
from apps.orders.workflow import ALLOWED_TRANSITIONS, InvalidTransition, can_transition

User = get_user_model()


def make_menu_item(name, price):
    category, _ = Category.objects.get_or_create(name='Coffee', slug='coffee')
    return MenuItem.objects.create(
        name=name,
        slug=name.lower().replace(' ', '-'),
        description='Test fixture item',
        category=category,
        base_price_etb=price,
    )

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


class OrderTransitionTableTests(TestCase):
    """Every status must appear in the table, and closed orders must be dead ends."""

    def test_every_status_is_reachable_and_has_a_row(self):
        for code, _label in Order.STATUS_CHOICES:
            self.assertIn(code, ALLOWED_TRANSITIONS, f'{code} missing from the transition table')

    def test_closed_orders_cannot_transition(self):
        for code in ('COMPLETED', 'CANCELLED', 'REJECTED'):
            self.assertEqual(ALLOWED_TRANSITIONS[code], set())
            for target, _ in Order.STATUS_CHOICES:
                self.assertFalse(can_transition(code, target))

    def test_kitchen_cannot_be_skipped(self):
        self.assertFalse(can_transition('PLACED', 'COMPLETED'))
        self.assertFalse(can_transition('PREPARING', 'OUT_FOR_DELIVERY'))
        self.assertTrue(can_transition('PREPARING', 'READY'))

    def test_pickup_goes_ready_then_completed(self):
        self.assertTrue(can_transition('READY', 'COMPLETED'))

    def test_delivery_needs_out_for_delivery(self):
        self.assertTrue(can_transition('READY', 'OUT_FOR_DELIVERY'))
        self.assertTrue(can_transition('OUT_FOR_DELIVERY', 'COMPLETED'))


class OrderStatusApiTests(TestCase):
    """The manager endpoint must only accept legal moves, and never reopen a closed order."""

    def setUp(self):
        self.client = APIClient()
        self.manager = User.objects.create_user(
            username='kitchenmanager', email='manager@coffeereceipts.com',
            phone='+251911000111', password='Password123!', role='MANAGER',
        )
        self.customer = User.objects.create_user(
            username='ordercustomer', email='customer@coffeereceipts.com',
            phone='+251911000222', password='Password123!', role='CUSTOMER',
        )
        self.zone = DeliveryZone.objects.create(name='Bole', delivery_fee_etb=Decimal('100.00'))
        self.item = make_menu_item('Test Pour Over', Decimal('120.00'))

    def _order(self, status):
        return Order.objects.create(
            order_number=f'ORD-TEST-{status}',
            customer=self.customer,
            contact_name='Selam Bekele',
            contact_phone='+251911000333',
            subtotal_etb=Decimal('120.00'),
            delivery_fee_etb=Decimal('0.00'),
            total_amount_etb=Decimal('120.00'),
            status=status,
        )

    def _login(self, user):
        self.client.force_authenticate(user=user)

    def _move(self, order, target):
        return self.client.post(
            f'/api/v1/orders/{order.id}/update_status/',
            {'status': target},
            format='json',
        )

    def test_legal_transition_is_accepted(self):
        self._login(self.manager)
        order = self._order('ACCEPTED')
        res = self._move(order, 'PREPARING')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status, 'PREPARING')

    def test_skipping_the_kitchen_is_rejected(self):
        self._login(self.manager)
        order = self._order('PLACED')
        res = self._move(order, 'COMPLETED')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        order.refresh_from_db()
        self.assertEqual(order.status, 'PLACED')

    def test_completed_order_cannot_be_reopened(self):
        self._login(self.manager)
        order = self._order('COMPLETED')
        res = self._move(order, 'PREPARING')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        order.refresh_from_db()
        self.assertEqual(order.status, 'COMPLETED')

    def test_unknown_status_is_rejected(self):
        self._login(self.manager)
        order = self._order('PLACED')
        res = self._move(order, 'TELEPORTED')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customer_cannot_change_status(self):
        self._login(self.customer)
        order = self._order('PLACED')
        res = self._move(order, 'ACCEPTED')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_can_commit_to_a_prep_time(self):
        self._login(self.manager)
        order = self._order('PLACED')
        res = self.client.post(
            f'/api/v1/orders/{order.id}/update_status/',
            {'status': 'ACCEPTED', 'estimated_prep_minutes': 35},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.estimated_prep_minutes, 35)

    def test_absurd_prep_time_is_rejected(self):
        self._login(self.manager)
        order = self._order('PLACED')
        res = self.client.post(
            f'/api/v1/orders/{order.id}/update_status/',
            {'status': 'ACCEPTED', 'estimated_prep_minutes': 0},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        order.refresh_from_db()
        self.assertEqual(order.status, 'PLACED')

    def test_prep_time_without_a_status_change_is_still_validated(self):
        self._login(self.manager)
        order = self._order('PLACED')
        res = self.client.post(
            f'/api/v1/orders/{order.id}/update_status/',
            {'status': 'ACCEPTED', 'estimated_prep_minutes': 'soon'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_prep_time_can_be_corrected_without_changing_status(self):
        self._login(self.manager)
        order = self._order('ACCEPTED')
        res = self.client.post(
            f'/api/v1/orders/{order.id}/update_status/',
            {'status': 'ACCEPTED', 'estimated_prep_minutes': 45},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.estimated_prep_minutes, 45)
        self.assertEqual(order.status, 'ACCEPTED')

    def test_repeating_the_current_status_is_a_noop(self):
        self._login(self.manager)
        order = self._order('PREPARING')
        before = order.status_history.count()
        res = self._move(order, 'PREPARING')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status, 'PREPARING')
        self.assertEqual(order.status_history.count(), before)


class OrderCreationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.item = make_menu_item('Test Macchiato', Decimal('90.00'))
        self.zone = DeliveryZone.objects.create(
            name='Bole', delivery_fee_etb=Decimal('100.00'), is_active=True,
        )
        self.payload = {
            'order_type': 'DELIVERY',
            'contact_name': 'Marta Tesfaye',
            'contact_phone': '+251911444555',
            'delivery_address': 'Kazanchis, House 7',
            'items': [{'menu_item': self.item.id, 'quantity': 2}],
        }

    def test_closed_store_refuses_new_orders(self):
        venue = RestaurantSettings.get_settings()
        venue.is_open = False
        venue.save()
        res = self.client.post('/api/v1/orders/', self.payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertFalse(Order.objects.exists())

    def test_open_store_accepts_order_and_prices_it_server_side(self):
        res = self.client.post('/api/v1/orders/', self.payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(order_number=res.data['order_number'])
        # 90 ETB x 2 from the menu, not whatever the client claimed.
        self.assertEqual(order.total_amount_etb, Decimal('180.00'))
        self.assertEqual(order.items.count(), 1)

    def test_client_cannot_invent_a_price(self):
        tampered = dict(self.payload)
        tampered['total_amount_etb'] = '1.00'
        tampered['items'] = [{'menu_item': self.item.id, 'quantity': 2, 'unit_price_etb': '0.01'}]
        res = self.client.post('/api/v1/orders/', tampered, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['total_amount_etb'], '180.00')

    def test_delivery_fee_comes_from_the_zone_not_the_client(self):
        payload = dict(self.payload)
        payload['delivery_zone'] = self.zone.id
        payload['delivery_fee_etb'] = '1.00'  # the browser would like a 1 birr delivery
        res = self.client.post('/api/v1/orders/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        # 2 x 90 + the zone's 100 fee
        self.assertEqual(res.data['delivery_fee_etb'], '100.00')
        self.assertEqual(res.data['total_amount_etb'], '280.00')

    def test_inactive_zone_is_rejected(self):
        self.zone.is_active = False
        self.zone.save()
        payload = dict(self.payload)
        payload['delivery_zone'] = self.zone.id
        res = self.client.post('/api/v1/orders/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delivery_without_zone_or_address_is_rejected(self):
        payload = dict(self.payload)
        payload['delivery_address'] = ''
        res = self.client.post('/api/v1/orders/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('delivery_address', res.data)

    def test_pickup_needs_no_address(self):
        payload = dict(self.payload)
        payload['order_type'] = 'PICKUP'
        payload['delivery_address'] = ''
        res = self.client.post('/api/v1/orders/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(order_number=res.data['order_number'])
        self.assertEqual(order.order_type, 'PICKUP')
        self.assertEqual(order.delivery_fee_etb, Decimal('0.00'))

    def test_dine_in_needs_a_table_number(self):
        payload = dict(self.payload)
        payload['order_type'] = 'DINE_IN'
        res = self.client.post('/api/v1/orders/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('table_number', res.data)

    def test_dine_in_with_table_number_is_accepted(self):
        payload = dict(self.payload)
        payload['order_type'] = 'DINE_IN'
        payload['table_number'] = '7'
        res = self.client.post('/api/v1/orders/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(order_number=res.data['order_number'])
        self.assertEqual(order.order_type, 'DINE_IN')
        self.assertEqual(order.table_number, '7')

    def test_unknown_order_type_is_rejected(self):
        payload = dict(self.payload)
        payload['order_type'] = 'TELEPORT'
        res = self.client.post('/api/v1/orders/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_empty_cart_is_rejected(self):
        payload = dict(self.payload)
        payload['items'] = []
        res = self.client.post('/api/v1/orders/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_prep_time_defaults_to_the_venue_setting(self):
        venue = RestaurantSettings.get_settings()
        venue.default_prep_minutes = 35
        venue.save()
        res = self.client.post('/api/v1/orders/', self.payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(order_number=res.data['order_number'])
        self.assertEqual(order.estimated_prep_minutes, 35)


