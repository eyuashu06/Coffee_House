import json
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.orders.models import Order, OrderStatusHistory
from apps.payments import gateway
from apps.payments.models import Payment

User = get_user_model()

class ChapaMobilePaymentAPITests(TestCase):
    def setUp(self):
        from django.test import override_settings

        self.override = override_settings(CHAPA_WEBHOOK_SECRET='webhook-secret-value')
        self.override.enable()
        self.addCleanup(self.override.disable)

        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testpayer',
            email='payer@example.com',
            password='Password123!',
            phone='+251911223344'
        )
        # Paying for an order now requires being signed in: the endpoint used to
        # accept any order id from an anonymous caller.
        self.client.force_authenticate(self.user)
        self.order = Order.objects.create(
            customer=self.user,
            order_number='ORD-TEST-001',
            order_type='DELIVERY',
            contact_name='Test Payer',
            contact_phone='+251911223344',
            delivery_address='Bole Atlas, Addis Ababa',
            subtotal_etb=Decimal('500.00'),
            delivery_fee_etb=Decimal('100.00'),
            total_amount_etb=Decimal('600.00'),
            status='PENDING_PAYMENT'
        )

    def test_mobile_payment_success_scenario(self):
        """Test phone 251900000000 expects successful mobile payment."""
        res = self.client.post('/api/v1/payments/initialize/', {
            'order_id': self.order.id,
            'payment_method': 'telebirr',
            'phone_number': '251900000000'
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('payment', res.data)
        payment_data = res.data['payment']
        self.assertEqual(payment_data['status'], 'SUCCESS')

        # Verify associated order was marked PLACED
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'PLACED')

    def test_mobile_payment_insufficient_funds_scenario(self):
        """Test phone 251911111111 expects INSUFFICIENT_FUNDS failure."""
        res = self.client.post('/api/v1/payments/initialize/', {
            'order_id': self.order.id,
            'payment_method': 'cbebirr',
            'phone_number': '251911111111'
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        payment_data = res.data['payment']
        self.assertEqual(payment_data['status'], 'FAILED')
        self.assertIn('INSUFFICIENT_FUNDS', payment_data['failure_reason'])

    def test_mobile_payment_user_cancellation_scenario(self):
        """Test phone 251922222222 expects USER_CANCELLED status."""
        res = self.client.post('/api/v1/payments/initialize/', {
            'order_id': self.order.id,
            'payment_method': 'mpesa',
            'phone_number': '251922222222'
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        payment_data = res.data['payment']
        self.assertEqual(payment_data['status'], 'ABANDONED')
        self.assertIn('USER_CANCELLED', payment_data['failure_reason'])

        # Verify associated order was marked CANCELLED
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'CANCELLED')

    def test_mobile_payment_timeout_scenario(self):
        """Test phone 251933333333 expects PENDING timeout status."""
        res = self.client.post('/api/v1/payments/initialize/', {
            'order_id': self.order.id,
            'payment_method': 'telebirr',
            'phone_number': '251933333333'
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        payment_data = res.data['payment']
        self.assertEqual(payment_data['status'], 'PENDING')

    def test_chapa_webhook_success_event(self):
        """A properly signed webhook settles the payment."""
        payment = Payment.objects.create(
            order=self.order,
            tx_ref='TX-TEST-WEBHOOK-001',
            amount_etb=Decimal('600.00'),
            status='PENDING'
        )

        body = {
            'event': 'payment.success',
            'tx_ref': 'TX-TEST-WEBHOOK-001',
            'chapa_reference': 'CHAPA-REF-123456'
        }
        res = post_signed_webhook(self.client, body)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'SUCCESS')
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'PLACED')

    def test_payment_verify_endpoint(self):
        payment = Payment.objects.create(
            order=self.order,
            tx_ref='TX-TEST-VERIFY-001',
            amount_etb=Decimal('600.00'),
            status='SUCCESS'
        )

        verify_res = self.client.get('/api/v1/payments/verify/TX-TEST-VERIFY-001/')
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)
        self.assertEqual(verify_res.data['payment']['status'], 'SUCCESS')


def post_signed_webhook(client, body, secret='webhook-secret-value'):
    """
    POST a webhook signed exactly as Chapa would sign it.

    The signature covers the raw request bytes, and the test client sends compact
    JSON, so the signature has to be computed over those same bytes - signing
    `json.dumps(body)` produces spaces after the separators and never matches.
    """
    import hashlib
    import hmac

    from django.core.serializers.json import DjangoJSONEncoder

    raw = json.dumps(body, separators=(',', ':'), cls=DjangoJSONEncoder).encode()
    signature = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return client.post(
        '/api/v1/payments/webhook/', raw, content_type='application/json',
        HTTP_CHAPA_SIGNATURE=signature)


class VerifyPaymentReconciliationTests(TestCase):
    """
    The path that actually settles a real card payment.

    The Chapa SDK's own `verify()` raised TypeError against the installed httpx
    (`Client.get() got an unexpected keyword argument 'data'`) and the exception
    was swallowed, so real payments stayed PENDING forever and customers who had
    paid were told they had not. Every one of these tests drives the replacement
    with a mocked HTTP response, which is what the old suite never did.
    """

    def setUp(self):
        from django.test import override_settings

        self.override = override_settings(
            CHAPA_SECRET_KEY='CHASECK_TEST-secret',
            CHAPA_WEBHOOK_SECRET='hook-secret',
            CHAPA_VERIFY_TIMEOUT=5,
        )
        self.override.enable()
        self.addCleanup(self.override.disable)

        self.client = APIClient()
        self.user = User.objects.create_user(
            username='recon', email='recon@example.org', password='Password123!')
        self.order = Order.objects.create(
            customer=self.user, order_number='ORD-RECON-1', order_type='PICKUP',
            contact_name='Recon User', contact_phone='+251911000000',
            subtotal_etb=Decimal('420.00'), delivery_fee_etb=Decimal('0.00'),
            total_amount_etb=Decimal('420.00'), status='PENDING_PAYMENT')
        self.payment = Payment.objects.create(
            order=self.order, tx_ref='TX-RECON-1', amount_etb=Decimal('420.00'),
            status='PENDING', checkout_url='https://checkout.chapa.co/x')

    def gateway_says(self, data, http_status=200):
        """Mock the gateway's verification answer."""
        response = mock.Mock()
        response.status_code = http_status
        response.json.return_value = {'status': 'success', 'data': data}
        response.text = json.dumps({'status': 'success', 'data': data})
        return mock.patch.object(gateway.httpx, 'get', return_value=response)

    def verify(self):
        self.client.force_authenticate(self.user)
        return self.client.get('/api/v1/payments/verify/TX-RECON-1/')

    def test_a_real_payment_is_confirmed_and_the_kitchen_is_notified(self):
        """The reported bug: paid, but the customer was told NOT PAID YET."""
        with self.gateway_says({
            'reference': 'APFfKlGX7Ch5X',
            'tx_ref': 'TX-RECON-1',
            'status': 'success',
            'currency': 'ETB',
            'amount': '420.00',
        }):
            res = self.verify()

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['payment']['status'], 'SUCCESS')
        self.assertEqual(res.data['outcome'], 'success')
        self.payment.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(self.payment.status, 'SUCCESS')
        self.assertEqual(self.payment.chapa_reference, 'APFfKlGX7Ch5X')
        self.assertIsNotNone(self.payment.verified_at)
        self.assertEqual(self.order.status, 'PLACED')
        self.assertIsNotNone(self.order.placed_at)
        self.assertTrue(OrderStatusHistory.objects.filter(
            order=self.order, status='PLACED').exists())

    def test_chapa_reference_is_not_compared_to_tx_ref(self):
        """
        Chapa's `reference` is its own short id and never equals our tx_ref.

        Comparing them rejected every genuine payment. Guarded here so the mistake
        cannot come back.
        """
        with self.gateway_says({
            'reference': 'APFfKlGX7Ch5X',
            'tx_ref': 'TX-RECON-1',
            'status': 'success', 'currency': 'ETB', 'amount': 420,
            'charge': 10.5,
        }):
            res = self.verify()
        self.assertEqual(res.data['payment']['status'], 'SUCCESS')

    def test_a_still_pending_transaction_stays_pending(self):
        """Not an answer yet: the order must not be called unpaid or paid."""
        with self.gateway_says({
            'reference': 'abc', 'tx_ref': 'TX-RECON-1', 'status': 'pending',
            'currency': 'ETB', 'amount': '420.00',
        }):
            res = self.verify()

        self.assertEqual(res.data['outcome'], 'pending')
        self.assertEqual(res.data['payment']['status'], 'PENDING')
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'PENDING_PAYMENT')
        self.payment.refresh_from_db()
        self.assertIsNotNone(self.payment.verified_at)

    def test_a_declined_payment_fails_and_says_why(self):
        with self.gateway_says({
            'reference': 'abc', 'tx_ref': 'TX-RECON-1', 'status': 'failed',
            'currency': 'ETB', 'amount': '420.00',
            'message': 'Insufficient balance',
        }):
            res = self.verify()

        self.assertEqual(res.data['outcome'], 'failed')
        self.assertEqual(res.data['payment']['status'], 'FAILED')
        self.assertIn('Insufficient', res.data['payment']['failure_reason'])

    def test_a_different_amount_is_not_treated_as_paid(self):
        """
        Someone paid 1 birr against a 420 birr order. Marking this paid would send
        a real order to the kitchen for free.
        """
        with self.gateway_says({
            'reference': 'abc', 'tx_ref': 'TX-RECON-1', 'status': 'success',
            'currency': 'ETB', 'amount': '1.00',
        }):
            res = self.verify()

        self.assertEqual(res.data['outcome'], 'mismatch')
        self.assertEqual(res.data['payment']['status'], 'FAILED')
        self.order.refresh_from_db()
        self.assertNotEqual(self.order.status, 'PLACED')

    def test_a_foreign_transaction_is_not_treated_as_paid(self):
        with self.gateway_says({
            'reference': 'abc', 'tx_ref': 'SOMEONE-ELSES-TX', 'status': 'success',
            'currency': 'ETB', 'amount': '420.00',
        }):
            res = self.verify()

        self.assertEqual(res.data['outcome'], 'mismatch')
        self.order.refresh_from_db()
        self.assertNotEqual(self.order.status, 'PLACED')

    def test_another_currency_is_not_treated_as_paid(self):
        with self.gateway_says({
            'reference': 'abc', 'tx_ref': 'TX-RECON-1', 'status': 'success',
            'currency': 'USD', 'amount': '420.00',
        }):
            res = self.verify()
        self.assertEqual(res.data['outcome'], 'mismatch')

    def test_an_unreachable_gateway_does_not_destroy_a_paid_payment(self):
        """
        A network blip is not evidence that the customer did not pay. The payment
        must stay PENDING so it is asked about again.
        """
        with mock.patch.object(gateway.httpx, 'get',
                               side_effect=gateway.httpx.ConnectError('no route')):
            res = self.verify()

        self.assertEqual(res.data['outcome'], 'unknown')
        self.assertEqual(res.data['payment']['status'], 'PENDING')
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'PENDING_PAYMENT')

    def test_a_payment_the_gateway_never_saw_is_closed_as_failed(self):
        """Otherwise it polls forever, and the customer never learns to retry."""
        self.payment.checkout_url = ''
        self.payment.chapa_reference = ''
        self.payment.save()
        with self.gateway_says({}, http_status=404):
            res = self.verify()

        self.assertEqual(res.data['outcome'], 'failed')
        self.assertEqual(res.data['payment']['status'], 'FAILED')

    def test_a_second_verify_of_a_settled_payment_is_idempotent(self):
        with self.gateway_says({
            'reference': 'r1', 'tx_ref': 'TX-RECON-1', 'status': 'success',
            'currency': 'ETB', 'amount': '420.00',
        }):
            self.verify()
            res = self.verify()

        self.assertEqual(res.data['payment']['status'], 'SUCCESS')
        self.assertEqual(OrderStatusHistory.objects.filter(
            order=self.order, status='PLACED').count(), 1)


class PaymentEndpointOwnershipTests(TestCase):
    """Initialize and verify must only work for the order's own customer."""

    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username='owner', email='owner@example.org', password='Password123!')
        self.stranger = User.objects.create_user(
            username='stranger', email='stranger@example.org', password='Password123!')
        self.order = Order.objects.create(
            customer=self.owner, order_number='ORD-OWN-1', order_type='PICKUP',
            contact_name='Owner', contact_phone='+251911000000',
            subtotal_etb=Decimal('200.00'), delivery_fee_etb=Decimal('0.00'),
            total_amount_etb=Decimal('200.00'), status='PENDING_PAYMENT')
        self.payment = Payment.objects.create(
            order=self.order, tx_ref='TX-OWN-1', amount_etb=Decimal('200.00'),
            status='PENDING', checkout_url='https://checkout.chapa.co/x')

    def test_a_stranger_cannot_start_a_payment_on_someone_elses_order(self):
        self.client.force_authenticate(self.stranger)
        res = self.client.post('/api/v1/payments/initialize/', {
            'order_id': self.order.id, 'payment_method': 'telebirr',
            'phone_number': '251900000000',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(Payment.objects.filter(order=self.order).count(), 1)

    def test_a_signed_out_visitor_cannot_start_a_payment(self):
        res = self.client.post('/api/v1/payments/initialize/', {
            'order_id': self.order.id, 'payment_method': 'telebirr',
            'phone_number': '251900000000',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_a_stranger_cannot_check_someone_elses_payment(self):
        self.client.force_authenticate(self.stranger)
        res = self.client.get('/api/v1/payments/verify/TX-OWN-1/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_the_owner_can_check_their_own_payment(self):
        self.client.force_authenticate(self.owner)
        with mock.patch.object(gateway, 'verify_transaction',
                               side_effect=gateway.GatewayError('offline')):
            res = self.client.get('/api/v1/payments/verify/TX-OWN-1/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_an_already_paid_order_cannot_be_paid_again(self):
        self.order.status = 'PLACED'
        self.order.save()
        Payment.objects.filter(order=self.order).update(status='SUCCESS')
        self.client.force_authenticate(self.owner)
        res = self.client.post('/api/v1/payments/initialize/', {
            'order_id': self.order.id, 'payment_method': 'telebirr',
            'phone_number': '251900000000',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class PaymentStateDerivationTests(TestCase):
    """
    `payment_state` is what the UI asks instead of guessing from one attempt.

    It has to be right when a customer pays, retries, and abandons, otherwise the
    receipt is withheld from someone who paid.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username='stater', email='stater@example.org', password='Password123!')
        self.order = Order.objects.create(
            customer=self.user, order_number='ORD-STATE-1', order_type='PICKUP',
            contact_name='Stater', contact_phone='+251911000000',
            subtotal_etb=Decimal('100.00'), delivery_fee_etb=Decimal('0.00'),
            total_amount_etb=Decimal('100.00'), status='PENDING_PAYMENT')

    def state(self):
        from apps.orders.serializers import OrderSerializer

        return OrderSerializer(self.order).data['payment_state']

    def test_no_payment_at_all(self):
        self.assertEqual(self.state(), 'unpaid')

    def test_one_attempt_in_flight(self):
        Payment.objects.create(order=self.order, tx_ref='TX-S1',
                               amount_etb=Decimal('100.00'), status='PENDING')
        self.assertEqual(self.state(), 'settling')

    def test_a_successful_payment(self):
        Payment.objects.create(order=self.order, tx_ref='TX-S1',
                               amount_etb=Decimal('100.00'), status='SUCCESS')
        self.assertEqual(self.state(), 'paid')

    def test_a_failed_attempt(self):
        Payment.objects.create(order=self.order, tx_ref='TX-S1',
                               amount_etb=Decimal('100.00'), status='FAILED')
        self.assertEqual(self.state(), 'failed')

    def test_paid_then_a_later_abandoned_attempt_is_still_paid(self):
        """The case that withheld a receipt from a customer who had paid."""
        Payment.objects.create(order=self.order, tx_ref='TX-S1',
                               amount_etb=Decimal('100.00'), status='SUCCESS')
        Payment.objects.create(order=self.order, tx_ref='TX-S2',
                               amount_etb=Decimal('100.00'), status='ABANDONED')
        self.assertEqual(self.state(), 'paid')

    def test_an_older_success_survives_a_newer_pending_attempt(self):
        Payment.objects.create(order=self.order, tx_ref='TX-S1',
                               amount_etb=Decimal('100.00'), status='SUCCESS')
        Payment.objects.create(order=self.order, tx_ref='TX-S2',
                               amount_etb=Decimal('100.00'), status='PENDING')
        self.assertEqual(self.state(), 'paid')


class ReconcileCommandTests(TestCase):
    """The recovery path for payments a bug left behind."""

    def setUp(self):
        from django.core.management import call_command

        self.call_command = call_command
        self.user = User.objects.create_user(
            username='rec', email='rec@example.org', password='Password123!')
        self.order = Order.objects.create(
            customer=self.user, order_number='ORD-REC-CMD', order_type='PICKUP',
            contact_name='Rec', contact_phone='+251911000000',
            subtotal_etb=Decimal('75.00'), delivery_fee_etb=Decimal('0.00'),
            total_amount_etb=Decimal('75.00'), status='PENDING_PAYMENT')
        self.payment = Payment.objects.create(
            order=self.order, tx_ref='TX-REC-CMD', amount_etb=Decimal('75.00'),
            status='PENDING', checkout_url='https://checkout.chapa.co/x')
        # Old enough to be picked up by the default age cutoff.
        Payment.objects.filter(pk=self.payment.pk).update(
            created_at=timezone.now() - timezone.timedelta(hours=1))

    def test_a_stuck_payment_is_settled_by_the_command(self):
        with mock.patch.object(gateway, 'verify_transaction', return_value={
            'reference': 'r1', 'tx_ref': 'TX-REC-CMD', 'status': 'success',
            'currency': 'ETB', 'amount': '75.00',
        }):
            self.call_command('reconcile_payments', stdout=mock.Mock(), stderr=mock.Mock())

        self.payment.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(self.payment.status, 'SUCCESS')
        self.assertEqual(self.order.status, 'PLACED')

    def test_a_fresh_payment_is_left_alone(self):
        """Reconciling a payment mid-flight could race the real settlement."""
        Payment.objects.filter(pk=self.payment.pk).update(created_at=timezone.now())
        with mock.patch.object(gateway, 'verify_transaction') as verify:
            self.call_command('reconcile_payments', stdout=mock.Mock(), stderr=mock.Mock())
        verify.assert_not_called()


class WebhookSignatureTests(TestCase):
    """
    The webhook is public and unauthenticated, so an unsigned POST must not be
    able to mark a payment paid. It used to be accepted: the signature was only
    checked when the header happened to be present.
    """

    def setUp(self):
        from django.test import override_settings

        self.override = override_settings(
            CHAPA_SECRET_KEY='CHASECK_TEST-secret',
            CHAPA_WEBHOOK_SECRET='webhook-secret-value')
        self.override.enable()
        self.addCleanup(self.override.disable)

        self.client = APIClient()
        self.user = User.objects.create_user(
            username='hookpayer', email='hook@example.org', password='Password123!')
        self.order = Order.objects.create(
            customer=self.user, order_number='ORD-HOOK-001', order_type='PICKUP',
            contact_name='Hook Payer', contact_phone='+251911000000',
            subtotal_etb=Decimal('300.00'), delivery_fee_etb=Decimal('0.00'),
            total_amount_etb=Decimal('300.00'), status='PENDING_PAYMENT')
        self.payment = Payment.objects.create(
            order=self.order, tx_ref='TX-HOOK-1', amount_etb=Decimal('300.00'),
            status='PENDING')

    def test_unsigned_webhook_is_rejected(self):
        res = self.client.post('/api/v1/payments/webhook/', {
            'event': 'payment.success', 'tx_ref': 'TX-HOOK-1',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'PENDING')
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'PENDING_PAYMENT')

    def test_wrong_signature_is_rejected(self):
        res = self.client.post(
            '/api/v1/payments/webhook/',
            {'event': 'payment.success', 'tx_ref': 'TX-HOOK-1'},
            format='json',
            HTTP_CHAPA_SIGNATURE='deadbeef' * 8)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'PENDING')

    def test_valid_signature_is_accepted(self):
        res = post_signed_webhook(
            self.client, {'event': 'payment.success', 'tx_ref': 'TX-HOOK-1'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'SUCCESS')

    def test_duplicate_webhook_does_not_duplicate_history(self):
        """Chapa retries webhooks. The second one must be a no-op."""
        body = {'event': 'payment.success', 'tx_ref': 'TX-HOOK-1'}
        for _ in range(3):
            post_signed_webhook(self.client, body)

        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'SUCCESS')
        self.assertEqual(
            OrderStatusHistory.objects.filter(order=self.order, status='PLACED').count(), 1)
        # One notification, not one per webhook.
        from apps.accounts.models import Notification
        customer_notifications = Notification.objects.filter(
            user=self.user, title__contains='ORD-HOOK-001')
        self.assertLessEqual(customer_notifications.count(), 1)
