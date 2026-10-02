from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal
from apps.orders.models import Order
from apps.payments.models import Payment

User = get_user_model()

class ChapaMobilePaymentAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testpayer',
            email='payer@example.com',
            password='Password123!',
            phone='+251911223344'
        )
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
        payment = Payment.objects.create(
            order=self.order,
            tx_ref='TX-TEST-WEBHOOK-001',
            amount_etb=Decimal('600.00'),
            status='PENDING'
        )

        webhook_res = self.client.post('/api/v1/payments/webhook/', {
            'event': 'payment.success',
            'tx_ref': 'TX-TEST-WEBHOOK-001',
            'chapa_reference': 'CHAPA-REF-123456'
        }, format='json')

        self.assertEqual(webhook_res.status_code, status.HTTP_200_OK)
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'SUCCESS')

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
