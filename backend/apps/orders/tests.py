from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.menu.models import Category, MenuItem
from apps.orders.expiry import EXPIRY_REASON, expire_unpaid_orders
from apps.orders.models import DeliveryZone, Order, OrderItem, OrderStatusHistory, RestaurantSettings
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


class OrderSearchTests(TestCase):
    """The footer's tracker looks an order up by its code; it must be scoped per user."""

    def setUp(self):
        self.client = APIClient()
        self.customer = User.objects.create_user(
            username='searchcustomer', email='search@coffeereceipts.com',
            phone='+251911666000', password='Password123!', role='CUSTOMER',
        )
        self.other = User.objects.create_user(
            username='othersearcher', email='othersearch@coffeereceipts.com',
            phone='+251911666111', password='Password123!', role='CUSTOMER',
        )
        self.manager = User.objects.create_user(
            username='searchmanager', email='searchmgr@coffeereceipts.com',
            phone='+251911666222', password='Password123!', role='MANAGER',
        )
        self.mine = Order.objects.create(
            order_number='ORD-SEARCH-AAA', customer=self.customer,
            contact_name='Selam Bekele', contact_phone='+251911666333',
            subtotal_etb=Decimal('100.00'), total_amount_etb=Decimal('100.00'),
            status='PLACED',
        )
        self.theirs = Order.objects.create(
            order_number='ORD-SEARCH-BBB', customer=self.other,
            contact_name='Marta Tesfaye', contact_phone='+251911666444',
            subtotal_etb=Decimal('200.00'), total_amount_etb=Decimal('200.00'),
            status='PLACED',
        )

    def _numbers(self, res):
        return [row['order_number'] for row in res.data['results']]

    def test_customer_finds_their_own_order_by_code(self):
        self.client.force_authenticate(self.customer)
        res = self.client.get('/api/v1/orders/?search=ORD-SEARCH')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(self._numbers(res), ['ORD-SEARCH-AAA'])

    def test_customer_cannot_search_into_someone_elses_order(self):
        self.client.force_authenticate(self.customer)
        res = self.client.get('/api/v1/orders/?search=ORD-SEARCH-BBB')
        self.assertEqual(res.data['results'], [])

    def test_manager_can_search_every_order(self):
        self.client.force_authenticate(self.manager)
        res = self.client.get('/api/v1/orders/?search=ORD-SEARCH')
        self.assertEqual(len(res.data['results']), 2)

    def test_status_filter_applies(self):
        self.client.force_authenticate(self.manager)
        res = self.client.get('/api/v1/orders/?status=PLACED')
        self.assertEqual(len(res.data['results']), 2)
        res = self.client.get('/api/v1/orders/?status=COMPLETED')
        self.assertEqual(res.data['results'], [])

    def test_bogus_status_filter_is_ignored_not_an_error(self):
        self.client.force_authenticate(self.manager)
        res = self.client.get('/api/v1/orders/?status=NOT_A_STATUS')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['results']), 2)

    def test_anonymous_caller_sees_nothing(self):
        self.client.force_authenticate(user=None)
        res = self.client.get('/api/v1/orders/?search=ORD-SEARCH')
        self.assertNotEqual(res.status_code, status.HTTP_200_OK)


class ExpireUnpaidOrderTests(TestCase):
    """
    FR-P7: an order nobody pays for has to close on its own.

    Before this there was no terminal unpaid state at all, so a customer who closed
    the payment tab left the order sitting in PENDING_PAYMENT for good - invisible to
    nobody, counted against the manager's live queue, and payable again forever.
    """

    def setUp(self):
        self.customer = User.objects.create_user(
            username='expirycustomer', email='expiry@coffeereceipts.com',
            phone='+251911777000', password='Password123!', role='CUSTOMER',
        )

    def _order(self, number, *, age_minutes=45, status='PENDING_PAYMENT'):
        order = Order.objects.create(
            order_number=number, customer=self.customer,
            contact_name='Selam Bekele', contact_phone='+251911777111',
            subtotal_etb=Decimal('120.00'), total_amount_etb=Decimal('120.00'),
            status=status,
        )
        # created_at is auto_now_add, so it is written directly to age the fixture.
        Order.objects.filter(pk=order.pk).update(
            created_at=timezone.now() - timedelta(minutes=age_minutes)
        )
        order.refresh_from_db()
        return order

    def _payment(self, order, status='PENDING'):
        from apps.payments.models import Payment

        return Payment.objects.create(
            order=order, tx_ref=f'TX-{order.order_number}', status=status,
            amount_etb=order.total_amount_etb,
            checkout_url='https://checkout.chapa.co/x',
        )

    def test_overdue_unpaid_order_expires(self):
        order = self._order('ORD-EXPIRE-1')

        self.assertEqual(expire_unpaid_orders(), 1)

        order.refresh_from_db()
        self.assertEqual(order.status, 'EXPIRED')
        self.assertEqual(order.rejection_reason, EXPIRY_REASON)
        self.assertTrue(OrderStatusHistory.objects.filter(
            order=order, status='EXPIRED').exists())

    def test_a_fresh_order_is_left_alone(self):
        """Thirty minutes is a promise; expiring at twenty would break it."""
        order = self._order('ORD-EXPIRE-FRESH', age_minutes=5)

        self.assertEqual(expire_unpaid_orders(), 0)
        order.refresh_from_db()
        self.assertEqual(order.status, 'PENDING_PAYMENT')

    def test_an_order_that_was_paid_is_never_expired(self):
        order = self._order('ORD-EXPIRE-PAID', status='PLACED')
        self._payment(order, status='SUCCESS')

        self.assertEqual(expire_unpaid_orders(), 0)
        order.refresh_from_db()
        self.assertEqual(order.status, 'PLACED')

    def test_running_twice_expires_nothing_the_second_time(self):
        """The job runs on a timer, so it has to be safe to repeat."""
        self._order('ORD-EXPIRE-IDEMPOTENT')

        self.assertEqual(expire_unpaid_orders(), 1)
        self.assertEqual(expire_unpaid_orders(), 0)
        self.assertEqual(
            OrderStatusHistory.objects.filter(status='EXPIRED').count(), 1)

    def test_a_payment_the_gateway_has_not_answered_is_not_a_failure_to_pay(self):
        """
        The window closed while a payment was still in flight.

        Expiring here would close an order the customer is about to be charged for,
        so the job asks the gateway first. An unreachable gateway is not an answer,
        and the order stays open for the next run.
        """
        order = self._order('ORD-EXPIRE-INFLIGHT')
        self._payment(order)

        with mock.patch('apps.payments.views.reconcile_payment', return_value='unknown'):
            self.assertEqual(expire_unpaid_orders(), 0)

        order.refresh_from_db()
        self.assertEqual(order.status, 'PENDING_PAYMENT')

    def test_a_late_confirmed_payment_saves_the_order(self):
        """The answer arrives inside the run: the order must survive it."""
        order = self._order('ORD-EXPIRE-LATEPAID')
        self._payment(order)

        def gateway_confirms(payment):
            payment.mark_as_success(chapa_ref='chapa-ref-1')
            return 'success'

        with mock.patch('apps.payments.views.reconcile_payment', side_effect=gateway_confirms):
            self.assertEqual(expire_unpaid_orders(), 0)

        order.refresh_from_db()
        self.assertEqual(order.status, 'PLACED')

    def test_a_declined_payment_does_expire_the_order(self):
        order = self._order('ORD-EXPIRE-DECLINED')
        self._payment(order)

        def gateway_declines(payment):
            payment.mark_as_failed(reason='Insufficient balance')
            return 'failed'

        with mock.patch('apps.payments.views.reconcile_payment', side_effect=gateway_declines):
            self.assertEqual(expire_unpaid_orders(), 1)

        order.refresh_from_db()
        self.assertEqual(order.status, 'EXPIRED')

    def test_the_window_comes_from_settings_and_can_be_overridden(self):
        order = self._order('ORD-EXPIRE-WINDOW', age_minutes=45)

        self.assertEqual(expire_unpaid_orders(older_than_minutes=90), 0)
        order.refresh_from_db()
        self.assertEqual(order.status, 'PENDING_PAYMENT')

        self.assertEqual(expire_unpaid_orders(older_than_minutes=30), 1)

    def test_the_management_command_reports_what_it_did(self):
        from io import StringIO

        from django.core.management import call_command

        self._order('ORD-EXPIRE-CMD')
        out = StringIO()
        call_command('expire_unpaid_orders', stdout=out)

        self.assertIn('Expired 1', out.getvalue())
        self.assertEqual(
            Order.objects.get(order_number='ORD-EXPIRE-CMD').status, 'EXPIRED')

    def test_dry_run_changes_nothing(self):
        from io import StringIO

        from django.core.management import call_command

        self._order('ORD-EXPIRE-DRY')
        out = StringIO()
        call_command('expire_unpaid_orders', '--dry-run', stdout=out)

        self.assertIn('1 order(s) are past the window', out.getvalue())
        self.assertEqual(
            Order.objects.get(order_number='ORD-EXPIRE-DRY').status, 'PENDING_PAYMENT')


class ExpiredOrderApiTests(TestCase):
    """An expired order must be read-only: no payment, no reopening."""

    def setUp(self):
        self.client = APIClient()
        self.customer = User.objects.create_user(
            username='expiredowner', email='expired@coffeereceipts.com',
            phone='+251911888000', password='Password123!', role='CUSTOMER',
        )
        self.manager = User.objects.create_user(
            username='expiredmgr', email='expiredmgr@coffeereceipts.com',
            phone='+251911888111', password='Password123!', role='MANAGER',
        )
        self.order = Order.objects.create(
            order_number='ORD-EXPIRED-API', customer=self.customer,
            contact_name='Selam Bekele', contact_phone='+251911888222',
            subtotal_etb=Decimal('120.00'), total_amount_etb=Decimal('120.00'),
            status='EXPIRED', rejection_reason=EXPIRY_REASON,
        )
        self.client.force_authenticate(self.customer)

    def test_payment_cannot_be_started_on_an_expired_order(self):
        res = self.client.post('/api/v1/payments/initialize/', {
            'order_id': self.order.id, 'payment_method': 'telebirr',
            'phone_number': '251900000000',
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('expired', res.data['error'].lower())
        # "Already been paid for" would be a lie the customer can disprove.
        self.assertNotIn('already been paid', res.data['error'])

    def test_the_manager_cannot_reopen_it(self):
        self.client.force_authenticate(self.manager)
        res = self.client.post(
            f'/api/v1/orders/{self.order.id}/update_status/',
            {'status': 'PENDING_PAYMENT'}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'EXPIRED')


class ReorderApiTests(TestCase):
    """One-tap reorder (SRS FR-O8)."""

    def setUp(self):
        self.client = APIClient()
        self.customer = User.objects.create_user(
            username='reordercust', email='reorder@coffeereceipts.com',
            phone='+251911777000', password='Password123!', role='CUSTOMER',
        )
        self.other_customer = User.objects.create_user(
            username='othercust', email='other@coffeereceipts.com',
            phone='+251911777111', password='Password123!', role='CUSTOMER',
        )
        self.item = make_menu_item('Espresso Roast', Decimal('150.00'))
        self.order = Order.objects.create(
            order_number='ORD-REORDER-1', customer=self.customer,
            order_type='PICKUP', contact_name='Reorder Test',
            contact_phone='+251911777000', subtotal_etb=Decimal('300.00'),
            total_amount_etb=Decimal('300.00'), status='COMPLETED',
        )
        OrderItem.objects.create(
            order=self.order, menu_item=self.item, item_name='Espresso Roast',
            unit_price_etb=Decimal('150.00'), quantity=2, subtotal_etb=Decimal('300.00'),
        )

    def test_customer_can_reorder_own_order(self):
        self.client.force_authenticate(self.customer)
        res = self.client.post(f'/api/v1/orders/{self.order.id}/reorder/')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('order_number', res.data)
        self.assertNotEqual(res.data['order_number'], self.order.order_number)
        self.assertEqual(res.data['status'], 'PENDING_PAYMENT')
        self.assertEqual(len(res.data['items']), 1)
        self.assertEqual(res.data['items'][0]['item_name'], 'Espresso Roast')

    def test_customer_cannot_reorder_someone_elses_order(self):
        self.client.force_authenticate(self.other_customer)
        res = self.client.post(f'/api/v1/orders/{self.order.id}/reorder/')

        self.assertIn(res.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_reorder_blocked_when_cafe_closed(self):
        venue = RestaurantSettings.get_settings()
        venue.is_open = False
        venue.save()

        self.client.force_authenticate(self.customer)
        res = self.client.post(f'/api/v1/orders/{self.order.id}/reorder/')

        self.assertEqual(res.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        venue.is_open = True
        venue.save()

