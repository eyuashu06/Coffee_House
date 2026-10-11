"""
The rate limits themselves (SRS §12).

Every other suite runs with throttling stood down, because DRF keeps its counters in
the cache for the life of the process and the whole suite shares one address. These
tests turn it back on so the limits are actually proven, rather than merely declared
in settings.
"""

from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.core import throttling
from apps.core.throttling import ScopedThrottle, running_tests, throttling_active
from apps.orders.models import Order

User = get_user_model()


class ThrottleTestCase(TestCase):
    """Base class: throttling on, cache clean, rates restored afterwards."""

    throttle_rates: dict = {}

    def setUp(self):
        super().setUp()
        self.rates = dict(self.throttle_rates)
        activate = mock.patch.object(throttling, 'throttling_active', return_value=True)
        # The rates are patched onto the class rather than through override_settings
        # because DRF reads THROTTLE_RATES into a class attribute at import time, so
        # a settings override made later never reaches the throttle.
        apply_rates = mock.patch.object(ScopedThrottle, 'THROTTLE_RATES', self.rates)
        activate.start()
        apply_rates.start()
        self.addCleanup(activate.stop)
        self.addCleanup(apply_rates.stop)
        # Counts live in the cache for the life of the process, so a test that did not
        # start clean would pass or fail depending on what ran before it.
        cache.clear()
        self.addCleanup(cache.clear)


class LoginThrottleTests(ThrottleTestCase):
    """
    Unlimited sign-in is a password-guessing oracle.

    20/minute in settings is far above a human typing and far below a script; the
    test uses a tiny rate so it can actually reach the wall.
    """

    throttle_rates = {'auth_login': '3/min'}

    def setUp(self):
        super().setUp()
        User.objects.create_user(
            username='guessme', email='guessme@example.org',
            password='Password123!', phone='+251911000000',
        )
        self.client = APIClient()

    def _attempt(self):
        return self.client.post('/api/v1/auth/login/', {
            'username_or_email': 'guessme', 'password': 'not-the-password',
        }, format='json')

    def test_repeated_failures_are_eventually_refused(self):
        statuses = [self._attempt().status_code for _ in range(5)]
        self.assertIn(status.HTTP_429_TOO_MANY_REQUESTS, statuses)

    def test_the_limit_is_per_address_not_global(self):
        for _ in range(5):
            self._attempt()

        # Every test client request comes from 127.0.0.1, so a genuinely different
        # caller has to say so. This is the whole point of scoping the limit to the
        # address: one attacker must not lock out everyone behind the same NAT.
        other = APIClient()
        res = other.post('/api/v1/auth/login/', {
            'username_or_email': 'guessme', 'password': 'not-the-password',
        }, format='json', REMOTE_ADDR='203.0.113.7')
        self.assertNotEqual(res.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_reading_the_profile_is_not_throttled_by_signin_attempts(self):
        """Flooding sign-in must not lock the same address out of everything."""
        for _ in range(5):
            self._attempt()
        res = self.client.get('/api/v1/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)


class PasswordResetThrottleTests(ThrottleTestCase):
    """Each reset attempt mails somebody, so the limit is tight by design."""

    throttle_rates = {'auth_password_reset': '2/hour'}

    def setUp(self):
        super().setUp()
        User.objects.create_user(
            username='resettarget', email='reset@example.org',
            password='Password123!', phone='+251911000000',
        )
        self.client = APIClient()

    def _request(self):
        return self.client.post(
            '/api/v1/auth/password-reset/', {'email': 'reset@example.org'}, format='json')

    def test_reset_requests_are_limited(self):
        codes = [self._request().status_code for _ in range(5)]
        self.assertIn(status.HTTP_429_TOO_MANY_REQUESTS, codes)


class OrderCreationThrottleTests(ThrottleTestCase):
    """Order creation is the expensive write; reads must stay unlimited."""

    throttle_rates = {'order_create': '2/min'}

    def setUp(self):
        super().setUp()
        self.client = APIClient()

    def _create(self):
        return self.client.post('/api/v1/orders/', {
            'order_type': 'PICKUP', 'contact_name': 'Flooder',
            'contact_phone': '+251911111111', 'items': [],
        }, format='json')

    def test_creating_orders_in_a_loop_is_refused(self):
        codes = [self._create().status_code for _ in range(5)]
        self.assertIn(status.HTTP_429_TOO_MANY_REQUESTS, codes)

    def test_the_kitchen_can_still_poll_the_order_list(self):
        """The dashboard polls every five seconds; it must never hit this limit."""
        for _ in range(5):
            self._create()
        manager = User.objects.create_user(
            username='poller', email='poller@example.org',
            password='Password123!', role='MANAGER',
        )
        self.client.force_authenticate(manager)
        for _ in range(10):
            res = self.client.get('/api/v1/orders/?page_size=200')
            self.assertEqual(res.status_code, status.HTTP_200_OK)


class PaymentThrottleTests(ThrottleTestCase):
    throttle_rates = {'payment_init': '2/min', 'payment_verify': '2/min'}

    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(
            username='floodpayer', email='floodpayer@example.org', password='Password123!')
        self.order = Order.objects.create(
            customer=self.user, order_number='ORD-THROTTLE-1', order_type='PICKUP',
            contact_name='Flood', contact_phone='+251911000000',
            subtotal_etb=100, total_amount_etb=100, status='PENDING_PAYMENT',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _initialize(self):
        return self.client.post('/api/v1/payments/initialize/', {
            'order_id': self.order.id, 'payment_method': 'telebirr',
            'phone_number': '251900000000',
        }, format='json')

    def test_payment_initialisation_is_limited(self):
        codes = [self._initialize().status_code for _ in range(4)]
        self.assertIn(status.HTTP_429_TOO_MANY_REQUESTS, codes)

    def test_the_verify_endpoint_has_its_own_budget(self):
        """Polling for a settling payment must not exhaust the payment-init limit."""
        for _ in range(4):
            self._initialize()
        # Every attempt above was refused, so there is no transaction to verify; the
        # point is that the endpoint answers rather than throttling.
        res = self.client.get('/api/v1/payments/verify/TX-DOES-NOT-EXIST/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class ThrottleStandDownTests(TestCase):
    """The stand-down is deliberate, bounded, and provable."""

    def test_it_recognises_the_test_runner_and_nothing_else(self):
        self.assertTrue(running_tests(['manage.py', 'test', 'apps']))
        self.assertFalse(running_tests(['manage.py', 'runserver', '0.0.0.0:8000']))
        self.assertFalse(running_tests(['manage.py', 'migrate']))

    def test_throttling_is_off_while_the_suite_runs(self):
        self.assertFalse(throttling_active())

    def test_the_throttle_is_the_stock_drf_one_when_active(self):
        """Only the stand-down is ours; the limiting behaviour is DRF's."""
        import rest_framework.throttling as drf_throttling

        self.assertTrue(issubclass(ScopedThrottle, drf_throttling.ScopedRateThrottle))
        self.assertEqual(ScopedThrottle.scope_attr, 'throttle_scope')
