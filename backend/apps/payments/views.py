import json
import re
import time
from decimal import Decimal

import httpx
from chapa import Chapa, verify_webhook
from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status, viewsets, permissions
from rest_framework.views import APIView
from rest_framework.response import Response

from .models import Payment
from .serializers import PaymentSerializer, InitializePaymentSerializer
from apps.orders.models import Order
from apps.accounts.models import normalize_ethiopian_phone
from apps.accounts.validators import is_deliverable_email

#: Local/mock phone numbers that simulate gateway outcomes in test mode
MOCK_TEST_PHONES = {
    '251900000000': 'success',
    '251911111111': 'insufficient_funds',
    '251922222222': 'cancelled',
    '251933333333': 'pending',
}

#: Payment methods that settle instantly against a local mobile-money simulator.
#: 'card' is always routed to the real Chapa hosted checkout so the customer
#: actually gets redirected to the payment page.
MOCK_METHODS = {'telebirr', 'cbebirr', 'mpesa', 'awashbirr', 'ebirr'}

#: Chapa only allows letters, numbers, hyphens, underscores, spaces and dots in
#: customization title/description (an order number like "ORD-2026#1234" breaks it).
CHAPA_TEXT_ALLOWED = re.compile(r'[^A-Za-z0-9\-_. ]+')

_chapa_client = None


def get_chapa_client():
    """Return a shared Chapa SDK client built from Django settings."""
    global _chapa_client
    if _chapa_client is None:
        secret = getattr(settings, 'CHAPA_SECRET_KEY', '') or 'CHASECK_TEST-UMHsYkPPXIFHkoPbm38QkV9OpBh0y4vD'
        api_url = (getattr(settings, 'CHAPA_API_URL', 'https://api.chapa.co/v1') or '').rstrip('/')
        base_url, _, version = api_url.rpartition('/v1')
        _chapa_client = Chapa(
            secret,
            base_ur=base_url or 'https://api.chapa.co',
            api_version=f"v1{version}" if base_url else 'v1',
        )
    return _chapa_client


def chapa_safe_text(value, max_length=120):
    """Strip characters Chapa rejects in customization fields."""
    cleaned = CHAPA_TEXT_ALLOWED.sub(' ', str(value or '')).strip()
    cleaned = re.sub(r'\s+', ' ', cleaned)
    return cleaned[:max_length]


def _chapa_error_message(response):
    """Flatten Chapa's error payload into a single readable sentence."""
    message = (response or {}).get('message')
    if isinstance(message, dict):
        parts = []
        for field, errors in message.items():
            if isinstance(errors, (list, tuple)):
                parts.append(f"{field}: {', '.join(str(e) for e in errors)}")
            else:
                parts.append(f"{field}: {errors}")
        return '; '.join(parts) or 'Payment gateway rejected the request.'
    return str(message) if message else 'Payment gateway rejected the request.'


def _chapa_email_rejected(response):
    """True when Chapa refused the customer email (invalid / non-deliverable domain)."""
    message = (response or {}).get('message')
    if isinstance(message, dict) and 'email' in message:
        return True
    return 'validation.email' in str(message or '').lower()


def _initialize_chapa_transaction(*, email, amount, first_name, last_name, tx_ref,
                                 callback_url, return_url, customization, phone_number=None):
    """Initialize a hosted-checkout transaction through the official Chapa SDK."""
    return get_chapa_client().initialize(
        email=email,
        amount=amount,
        first_name=first_name,
        last_name=last_name,
        tx_ref=tx_ref,
        currency='ETB',
        phone_number=phone_number or None,
        callback_url=callback_url,
        return_url=return_url,
        customization=customization,
    )


class InitializePaymentView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = InitializePaymentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        order_id = serializer.validated_data['order_id']
        payment_method = serializer.validated_data['payment_method']
        raw_phone = serializer.validated_data.get('phone_number', '')

        try:
            order = Order.objects.get(pk=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Normalize phone into 251XXXXXXXXX format for Chapa API
        norm_phone = normalize_ethiopian_phone(raw_phone or order.contact_phone)
        clean_phone = norm_phone.replace('+', '') if norm_phone else ''

        tx_ref = f"TX-ORD-{order.id}-{int(time.time())}"
        amount_etb = order.total_amount_etb

        # Create Payment object
        payment = Payment.objects.create(
            order=order,
            tx_ref=tx_ref,
            payment_method=payment_method,
            phone_number=clean_phone,
            amount_etb=amount_etb,
            currency='ETB',
            status='PENDING'
        )

        # ── Cash on Delivery ────────────────────────────────────────────────
        if payment_method == 'cash':
            payment.mark_as_success(chapa_ref='CASH_ON_DELIVERY', raw_data='Cash on delivery order')
            return Response({
                'message': 'Cash on delivery order placed successfully.',
                'payment': PaymentSerializer(payment).data,
                'checkout_url': '',
                'test_mode': True,
            }, status=status.HTTP_200_OK)

        # ── Automated Test / Mock Phone Scenarios ────────────────────────────
        # Only simulated for mobile-money methods; card always goes to real Chapa.
        mock_outcome = MOCK_TEST_PHONES.get(clean_phone) if payment_method in MOCK_METHODS else None

        if mock_outcome == 'success':
            payment.mark_as_success(chapa_ref='CHAPA_MOCK_SUCCESS', raw_data='Mock test success')
            return Response({
                'message': 'Mock payment success',
                'payment': PaymentSerializer(payment).data,
                'checkout_url': '',
                'test_mode': True,
            }, status=status.HTTP_200_OK)
        elif mock_outcome == 'insufficient_funds':
            payment.mark_as_failed(reason='INSUFFICIENT_FUNDS: Account balance insufficient', raw_data='Mock test insufficient funds')
            return Response({
                'message': 'Mock payment failure',
                'payment': PaymentSerializer(payment).data,
                'checkout_url': '',
                'test_mode': True,
            }, status=status.HTTP_200_OK)
        elif mock_outcome == 'cancelled':
            payment.mark_as_cancelled(reason='USER_CANCELLED: Payment cancelled by user', raw_data='Mock test user cancelled')
            return Response({
                'message': 'Mock payment cancelled',
                'payment': PaymentSerializer(payment).data,
                'checkout_url': '',
                'test_mode': True,
            }, status=status.HTTP_200_OK)
        elif mock_outcome == 'pending':
            payment.status = 'PENDING'
            payment.save()
            return Response({
                'message': 'Mock payment timeout pending',
                'payment': PaymentSerializer(payment).data,
                'checkout_url': '',
                'test_mode': True,
            }, status=status.HTTP_200_OK)

        # ── Chapa SDK call (official hosted checkout) ─────────────────────────
        chapa_secret_key = getattr(settings, 'CHAPA_SECRET_KEY', 'CHASECK_TEST-UMHsYkPPXIFHkoPbm38QkV9OpBh0y4vD')
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')

        return_url = f"{frontend_url}/account?order={order.order_number}&tx_ref={tx_ref}&payment_status=pending"

        # Chapa only accepts addresses on domains that can really receive mail. The customer
        # signs up with a verified address, but fall back to a deliverable one if their
        # domain has no mail infrastructure.
        fallback_email = getattr(settings, 'CHAPA_FALLBACK_EMAIL', 'customer@gmail.com')
        raw_email = (order.customer.email if order.customer else '') or ''
        if not is_deliverable_email(raw_email):
            raw_email = fallback_email

        first_name = (order.customer.first_name if (order.customer and order.customer.first_name) else order.contact_name) or 'Customer'
        last_name = (order.customer.last_name if (order.customer and order.customer.last_name) else 'Customer') or 'Customer'

        # Chapa allows only letters/numbers/-/_/space/dot and caps the title at 16 chars
        customization = {
            'title': chapa_safe_text('Buna Hub', 16),
            'description': chapa_safe_text(f'Order {order.order_number}', 80),
        }

        checkout_url = ''
        chapa_response = {}

        try:
            init_kwargs = dict(
                amount=str(amount_etb),
                first_name=chapa_safe_text(first_name, 40),
                last_name=chapa_safe_text(last_name, 40),
                tx_ref=tx_ref,
                callback_url=f"{frontend_url}/api/v1/payments/webhook/",
                return_url=return_url,
                customization=customization,
                phone_number=clean_phone or None,
            )
            chapa_response = _initialize_chapa_transaction(email=raw_email, **init_kwargs)

            # The address can still be refused by the gateway (e.g. domain without mail
            # infrastructure) - retry once with the configured deliverable fallback.
            if _chapa_email_rejected(chapa_response) and raw_email != fallback_email:
                payment.raw_response = 'Retrying Chapa with fallback receipt address'
                payment.save()
                raw_email = fallback_email
                chapa_response = _initialize_chapa_transaction(email=raw_email, **init_kwargs)

            if isinstance(chapa_response, dict) and chapa_response.get('status') == 'success':
                checkout_url = (chapa_response.get('data') or {}).get('checkout_url', '') or ''
                payment.checkout_url = checkout_url
                payment.raw_response = json.dumps(chapa_response, default=str)
                payment.save()
            else:
                gateway_message = _chapa_error_message(chapa_response)
                payment.raw_response = json.dumps(chapa_response, default=str)
                payment.failure_reason = gateway_message[:255]
                payment.status = 'FAILED'
                payment.save()
                return Response(
                    {'error': f'Payment Gateway Error: {gateway_message}', 'detail': payment.failure_reason},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except (httpx.HTTPError, ValueError) as exc:
            payment.raw_response = f"Chapa SDK error: {exc}"
            payment.save()
            return Response({
                'message': 'Payment gateway is temporarily unreachable. Your order is saved — retry payment from My Orders.',
                'payment': PaymentSerializer(payment).data,
                'checkout_url': return_url,
                'mode': 'fallback',
            }, status=status.HTTP_200_OK)
        except Exception as exc:
            payment.raw_response = f"Chapa SDK exception: {exc}"
            payment.save()
            return Response({
                'message': 'Payment gateway is temporarily unreachable. Your order is saved — retry payment from My Orders.',
                'payment': PaymentSerializer(payment).data,
                'checkout_url': return_url,
                'mode': 'fallback',
            }, status=status.HTTP_200_OK)

        # Standard Chapa Hosted Checkout: keep PENDING and redirect
        payment.status = 'PENDING'
        payment.save()

        # Only redirect the customer to an actual hosted checkout page.
        if not checkout_url.startswith('http'):
            payment.failure_reason = 'Chapa did not return a hosted checkout URL'
            payment.raw_response = json.dumps(chapa_response, default=str) if chapa_response else 'No checkout_url in Chapa response'
            payment.save()
            return Response({
                'error': 'Payment gateway did not return a checkout page. Your order is saved — try again or choose Cash on Delivery.',
                'payment': PaymentSerializer(payment).data,
            }, status=status.HTTP_502_BAD_GATEWAY)

        return Response({
            'message': 'Payment initialized successfully.',
            'payment': PaymentSerializer(payment).data,
            'checkout_url': checkout_url,
            'mode': 'test' if chapa_secret_key.startswith('CHASECK_TEST') else 'live',
        }, status=status.HTTP_200_OK)


class VerifyPaymentView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, tx_ref):
        try:
            payment = Payment.objects.select_related('order').get(tx_ref=tx_ref)
        except Payment.DoesNotExist:
            return Response({'error': 'Payment transaction reference not found.'}, status=status.HTTP_404_NOT_FOUND)

        # If already resolved (success/failed/abandoned), return immediately
        if payment.status in ['SUCCESS', 'FAILED', 'ABANDONED']:
            return Response({
                'payment': PaymentSerializer(payment).data,
                'order_status': payment.order.status,
                'verified': True,
            }, status=status.HTTP_200_OK)

        # Confirm the transaction with the gateway via the official SDK
        verified = False

        try:
            verify_data = get_chapa_client().verify(tx_ref)
            if isinstance(verify_data, dict):
                data = verify_data.get('data') or {}
                chapa_status = str(data.get('status', '')).lower()
                chapa_ref = data.get('reference', '')

                if chapa_status == 'success':
                    payment.mark_as_success(chapa_ref=chapa_ref, raw_data=verify_data)
                    verified = True
                elif chapa_status in ['failed', 'rejected']:
                    payment.mark_as_failed(reason=_chapa_error_message(verify_data), raw_data=verify_data)
                    verified = True
                elif chapa_status in ['cancelled', 'abandoned']:
                    payment.mark_as_cancelled(reason='Payment cancelled at checkout', raw_data=verify_data)
                    verified = True
                elif chapa_status:
                    payment.raw_response = json.dumps(verify_data, default=str)
                    payment.save()
            else:
                payment.raw_response = "Unexpected verification response from Chapa"
                payment.save()
        except Exception as exc:
            payment.raw_response = f"Verification exception: {exc}"
            payment.save()

        return Response({
            'payment': PaymentSerializer(payment).data,
            'order_status': payment.order.status,
            'verified': verified,
        }, status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name='dispatch')
class ChapaWebhookView(APIView):
    """Server-to-server callback from Chapa confirming the payment outcome."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        try:
            data = request.data if isinstance(request.data, dict) else json.loads(request.body)
        except Exception:
            data = {}

        # Chapa signs webhooks with the secret key — verify with the SDK helper
        secret = getattr(settings, 'CHAPA_SECRET_KEY', '')
        signature = request.headers.get('x-chapa-signature') or request.headers.get('Chapa-Signature')
        if signature:
            if not secret or not verify_webhook(secret, data, signature):
                return Response({'error': 'Invalid webhook signature.'}, status=status.HTTP_401_UNAUTHORIZED)

        event = data.get('event') or data.get('status')
        tx_ref = data.get('tx_ref') or data.get('reference')

        if not tx_ref:
            return Response({'status': 'ignored', 'reason': 'Missing tx_ref'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payment = Payment.objects.get(tx_ref=tx_ref)
        except Payment.DoesNotExist:
            return Response({'status': 'ignored', 'reason': 'Transaction reference not found'}, status=status.HTTP_404_NOT_FOUND)

        # Idempotency check: if payment already completed, return 200 without duplicate action
        if payment.status in ['SUCCESS', 'FAILED', 'ABANDONED'] and event in ['payment.success', 'success', 'SUCCESS']:
            return Response({'status': 'already_processed', 'payment_status': payment.status}, status=status.HTTP_200_OK)

        if event in ['payment.success', 'success', 'SUCCESS']:
            payment.mark_as_success(chapa_ref=data.get('chapa_reference', ''), raw_data=data)
        elif event in ['payment.failed', 'failed', 'INSUFFICIENT_FUNDS']:
            payment.mark_as_failed(reason=data.get('message', 'Payment failed'), raw_data=data)
        elif event in ['payment.cancelled', 'cancelled', 'USER_CANCELLED']:
            payment.mark_as_cancelled(reason=data.get('message', 'User cancelled'), raw_data=data)
        elif event in ['payment.incomplete', 'incomplete']:
            payment.status = 'PENDING'
            payment.failure_reason = 'Payment incomplete'
            payment.save()

        return Response({'status': 'processed', 'payment_status': payment.status}, status=status.HTTP_200_OK)


class PaymentHistoryView(viewsets.ReadOnlyModelViewSet):
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_manager_or_admin():
            return Payment.objects.all()
        return Payment.objects.filter(order__customer=self.request.user)
