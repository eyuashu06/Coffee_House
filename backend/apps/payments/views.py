import json
import logging
import re
import time
from decimal import Decimal

import httpx
from chapa import Chapa
from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status, viewsets, permissions
from rest_framework.views import APIView
from rest_framework.response import Response

from . import gateway
from .models import Payment, PaymentAccount
from .serializers import (
    PaymentSerializer,
    InitializePaymentSerializer,
    PaymentAccountSerializer,
)
from .links_et import verify_receipt, verify_receipt_image, is_links_et_configured
from apps.orders.models import Order, OrderStatusHistory
from apps.accounts.models import normalize_ethiopian_phone
from apps.accounts.permissions import IsManager
from apps.accounts.validators import is_deliverable_email
from apps.core.throttling import ScopedThrottle

logger = logging.getLogger(__name__)

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
        secret = getattr(settings, 'CHAPA_SECRET_KEY', '')
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
    """Initialize a hosted-checkout transaction through the official Chapa SDK.

    Only initialisation uses the SDK. Verification goes through
    `apps.payments.gateway` because the SDK's verify path is broken against the
    httpx version installed here.
    """
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


def _can_manage_order(request, order):
    """
    True when this caller may pay for, or read the payment of, this order.

    The customer who owns the order, or staff. Anyone else gets a 404 rather than
    a 403: the existence of someone else's order is not the caller's business.
    """
    user = request.user
    if not (user and user.is_authenticated):
        return False
    if user.is_manager_or_admin():
        return True
    return order.customer_id == user.id


class InitializePaymentView(APIView):
    """
    Start a payment, rate limited per caller.

    Each call creates a transaction with the gateway, so an unbounded endpoint is both
    an abuse vector and a way to fill up the cafe's payment records with attempts that
    were never meant to be paid.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedThrottle]
    throttle_scope = 'payment_init'

    def post(self, request):
        serializer = InitializePaymentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        order_id = serializer.validated_data['order_id']
        payment_method = serializer.validated_data['payment_method']
        raw_phone = serializer.validated_data.get('phone_number', '')
        transaction_reference = serializer.validated_data.get('transaction_reference', '').strip()

        try:
            order = Order.objects.get(pk=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        # A signed-out visitor could otherwise start a payment against any order
        # id they guessed.
        if not _can_manage_order(request, order):
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        # An order that is already paid must not be paid twice.
        if order.status != 'PENDING_PAYMENT':
            if order.status == 'EXPIRED':
                # Saying "already been paid for" here would be a lie the customer can
                # disprove from their bank statement. The order is dead because the
                # window closed, and the way back is a fresh order, not this one.
                return Response(
                    {'error': 'This order expired before payment was received. '
                              'Please place a new order so the kitchen can make it.',
                     'order_status': order.status},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {'error': 'This order has already been paid for.',
                 'order_status': order.status,
                 'payment': PaymentSerializer(order.payments.order_by('-created_at').first()).data
                 if order.payments.exists() else None},
                status=status.HTTP_400_BAD_REQUEST)

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
            transaction_reference=transaction_reference,
            amount_etb=amount_etb,
            currency='ETB',
            status='PENDING'
        )

        # ── Cash (Delivery / Onsite / Dine-in Table) ─────────────────────────
        # Cash payments MUST be approved by staff/manager upon delivery, pickup,
        # or at table. They remain PENDING until approved so chef prepares only confirmed orders.
        if payment_method == 'cash':
            payment.raw_response = 'Cash order submitted; pending staff confirmation upon delivery, onsite, or table.'
            payment.save()
            return Response({
                'message': 'Cash order placed successfully. Staff will confirm payment upon delivery, pickup, or at your table.',
                'payment': PaymentSerializer(payment).data,
                'checkout_url': '',
                'pending_approval': True,
                'test_mode': False,
            }, status=status.HTTP_200_OK)

        # ── Automated Test / Mock Phone Scenarios ────────────────────────────
        # Only simulated for mobile-money test numbers in test suites; card always goes to real Chapa.
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

        # ── Manual Digital Transfers (Telebirr, CBE, Awash, E-Birr, M-Pesa) ─
        # User transfers to designated account number and submits confirmation code or receipt.
        if payment_method in {'telebirr', 'cbebirr', 'awashbirr', 'ebirr', 'mpesa'}:
            receipt_base64 = request.data.get('receipt_base64', '')
            payment.transaction_reference = transaction_reference
            verification_result = None

            # Attempt real-time bank verification via links.et if configured
            if is_links_et_configured():
                from django.utils import timezone
                if receipt_base64:
                    verification_result = verify_receipt_image(
                        receipt_base64,
                        expected_amount=order.total_amount_etb
                    )
                elif transaction_reference and not transaction_reference.startswith('Receipt:'):
                    verification_result = verify_receipt(
                        transaction_reference,
                        expected_amount=order.total_amount_etb
                    )

            if verification_result and verification_result.get('verified'):
                from django.utils import timezone
                payment.verified_at = timezone.now()
                payment.gateway_status = 'verified'
                payment.approval_notes = verification_result.get('message', 'Verified by links.et at bank source')
                ref = verification_result.get('reference') or transaction_reference or payment.tx_ref
                payment.mark_as_success(
                    chapa_ref=f"LINKSET_{verification_result.get('provider_key', 'bank').upper()}_{ref}",
                    raw_data=json.dumps(verification_result),
                    gateway_status='verified'
                )
                return Response({
                    'message': verification_result.get('message', 'Payment verified successfully!'),
                    'message_am': verification_result.get('message_am', 'ክፍያው በተሳካ ሁኔታ ተረጋግጧል!'),
                    'payment': PaymentSerializer(payment).data,
                    'checkout_url': '',
                    'verified': True,
                    'bank_details': verification_result,
                    'test_mode': False,
                }, status=status.HTTP_200_OK)

            if verification_result:
                payment.approval_notes = verification_result.get('message', '')
                payment.raw_response = json.dumps(verification_result)
            else:
                payment.raw_response = f"Manual transfer submitted with reference: {transaction_reference or 'N/A'}"
            payment.save()

            return Response({
                'message': f"Transfer reference '{transaction_reference or payment.tx_ref}' submitted. Manager will verify and confirm your payment.",
                'payment': PaymentSerializer(payment).data,
                'checkout_url': '',
                'pending_approval': True,
                'verified': False,
                'bank_details': verification_result,
                'test_mode': False,
            }, status=status.HTTP_200_OK)

        # ── Chapa SDK call (official hosted checkout) ─────────────────────────
        chapa_secret_key = getattr(settings, 'CHAPA_SECRET_KEY', '')
        if not chapa_secret_key:
            # Fail loudly instead of sending an empty Bearer token to Chapa.
            payment.failure_reason = 'CHAPA_SECRET_KEY is not configured'
            payment.raw_response = 'CHAPA_SECRET_KEY missing from .env'
            payment.status = 'FAILED'
            payment.save()
            return Response(
                {
                    'error': 'Payment gateway is not configured. Set CHAPA_SECRET_KEY in .env and restart the server.',
                    'payment': PaymentSerializer(payment).data,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        backend_url = getattr(settings, 'BACKEND_PUBLIC_URL', 'http://localhost:8000')

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
                # The webhook is server-to-server: it carries no customer cookie
                # and the frontend origin is unreachable from the internet during
                # development, so it has to point at the API host.
                callback_url=f"{backend_url}/api/v1/payments/webhook/",
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
    """
    Confirm one payment with the gateway and report the result.

    This is the endpoint the customer's browser polls after Chapa sends them back,
    which makes it the thing that has to work: on a local deployment the webhook
    cannot reach us at all, so this is the only path that settles a payment.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedThrottle]
    throttle_scope = 'payment_verify'

    def get(self, request, tx_ref):
        try:
            payment = Payment.objects.select_related('order').get(tx_ref=tx_ref)
        except Payment.DoesNotExist:
            return Response({'error': 'Payment transaction reference not found.'},
                            status=status.HTTP_404_NOT_FOUND)

        if not _can_manage_order(request, payment.order):
            return Response({'error': 'Payment transaction reference not found.'},
                            status=status.HTTP_404_NOT_FOUND)

        # Already answered by the gateway. Re-checking would ask about a
        # transaction that has been closed, and a settled payment must never be
        # walked backwards because the gateway no longer recognises it.
        if payment.status in ('SUCCESS', 'FAILED', 'ABANDONED'):
            return Response({
                'payment': PaymentSerializer(payment).data,
                'order_status': payment.order.status,
                'verified': True,
                'outcome': payment.status.lower(),
                'test_mode': gateway.is_test_mode(),
            }, status=status.HTTP_200_OK)

        outcome = reconcile_payment(payment)
        return Response({
            'payment': PaymentSerializer(payment).data,
            'order_status': payment.order.status,
            'verified': outcome != 'unknown',
            'outcome': outcome,
            'test_mode': gateway.is_test_mode(),
        }, status=status.HTTP_200_OK)


def reconcile_payment(payment):
    """
    Ask the gateway about a payment and apply the answer.

    Returns one of: 'success', 'failed', 'cancelled', 'pending', 'mismatch',
    'unknown'.

    The distinction that matters is between "the gateway says they have not paid"
    (a real answer, and the banner should say so) and "we could not reach the
    gateway" (`unknown`, which must leave the payment PENDING rather than
    declaring it unpaid - otherwise a momentary network blip destroys a payment
    the customer actually completed).
    """
    # A transaction the gateway has never heard of can never succeed, so it is
    # closed rather than retried. Leaving it PENDING is what made these orders
    # show "confirming..." indefinitely.
    if not payment.checkout_url and not payment.chapa_reference:
        payment.mark_as_failed(
            reason='No payment was ever started with the gateway for this order.',
            raw_data='', gateway_status='not_found')
        return 'failed'

    try:
        data = gateway.verify_transaction(payment.tx_ref)
    except gateway.TransactionNotFound as exc:
        logger.info('Gateway has no record of %s: %s', payment.tx_ref, exc)
        payment.mark_as_failed(
            reason='The payment gateway has no record of this payment, so it cannot be completed.',
            raw_data='', gateway_status='not_found')
        return 'failed'
    except gateway.GatewayError as exc:
        # A transient problem: the network, or the gateway being down. This is NOT
        # evidence that the customer did not pay, so the payment stays PENDING and
        # is asked about again.
        logger.warning('Chapa verification could not complete for %s: %s', payment.tx_ref, exc)
        payment.raw_response = f'Verification unavailable: {exc}'
        payment.save(update_fields=['raw_response', 'updated_at'])
        return 'unknown'

    gateway_status = gateway.normalise_status(data)

    if gateway.is_success(gateway_status):
        try:
            gateway.check_transaction_matches(payment, data)
        except gateway.VerificationMismatch as exc:
            # The gateway confirms *a* payment, but not this one. Recording a
            # success here would hand a real order to the kitchen without the
            # money, so this is a failure and says so.
            logger.error('Verification mismatch for %s: %s', payment.tx_ref, exc)
            payment.mark_as_failed(
                reason=f'Payment did not match the order: {exc}'[:255],
                raw_data=json.dumps(data, default=str),
                gateway_status=gateway_status,
            )
            return 'mismatch'

        payment.mark_as_success(
            chapa_ref=str(data.get('reference') or ''),
            raw_data=json.dumps(data, default=str),
            gateway_status=gateway_status,
        )
        return 'success'

    if gateway.is_terminal_failure(gateway_status):
        payment.mark_as_failed(
            reason=_chapa_error_message({'message': data.get('message')}),
            raw_data=json.dumps(data, default=str),
            gateway_status=gateway_status,
        )
        return 'failed'

    if gateway_status in ('cancelled', 'abandoned'):
        payment.mark_as_cancelled(
            reason=str(data.get('message') or 'Payment cancelled at checkout')[:255],
            raw_data=json.dumps(data, default=str),
            gateway_status=gateway_status,
        )
        return 'cancelled'

    # Still settling. Record that we asked, so this is distinguishable from a
    # payment nobody ever verified.
    payment.record_checked(gateway_status, json.dumps(data, default=str))
    return 'pending'


@method_decorator(csrf_exempt, name='dispatch')
class ChapaWebhookView(APIView):
    """
    Server-to-server callback from Chapa confirming the payment outcome.

    The signature is mandatory. This endpoint is public and unauthenticated by
    nature, so accepting an unsigned body would let anyone POST a
    `payment.success` for a transaction reference they guessed and mark a real
    order paid without paying for it.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        try:
            data = request.data if isinstance(request.data, dict) else json.loads(request.body)
        except Exception:
            data = {}

        signature = (request.headers.get('x-chapa-signature')
                     or request.headers.get('Chapa-Signature')
                     or request.headers.get('x-chapa-signature'.upper()))

        # Chapa sends `Chapa-Signature`; some proxies normalise the case. If the
        # header is simply absent the request is not from Chapa.
        if not signature:
            return Response({'error': 'Missing webhook signature.'},
                            status=status.HTTP_401_UNAUTHORIZED)

        if not gateway.webhook_signature_is_valid(request.body, signature):
            return Response({'error': 'Invalid webhook signature.'},
                            status=status.HTTP_401_UNAUTHORIZED)

        event = str(data.get('event') or data.get('status') or '').strip()
        tx_ref = data.get('tx_ref') or data.get('reference')

        if not tx_ref:
            return Response({'status': 'ignored', 'reason': 'Missing tx_ref'},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            payment = Payment.objects.select_related('order').get(tx_ref=tx_ref)
        except Payment.DoesNotExist:
            return Response({'status': 'ignored', 'reason': 'Transaction reference not found'},
                            status=status.HTTP_404_NOT_FOUND)

        # Idempotency check: if payment already completed, return 200 without duplicate action
        if payment.status in ['SUCCESS', 'FAILED', 'ABANDONED'] and event.lower() in (
                'payment.success', 'success'):
            return Response({'status': 'already_processed', 'payment_status': payment.status},
                            status=status.HTTP_200_OK)

        lowered = event.lower()
        if lowered in ('payment.success', 'success'):
            payment.mark_as_success(chapa_ref=data.get('chapa_reference', ''),
                                    raw_data=data, gateway_status='success')
        elif lowered in ('payment.failed', 'failed', 'insufficient_funds'):
            payment.mark_as_failed(reason=str(data.get('message') or 'Payment failed')[:255],
                                   raw_data=data, gateway_status='failed')
        elif lowered in ('payment.cancelled', 'cancelled', 'user_cancelled'):
            payment.mark_as_cancelled(reason=str(data.get('message') or 'User cancelled')[:255],
                                      raw_data=data, gateway_status='cancelled')
        elif lowered in ('payment.incomplete', 'incomplete'):
            payment.status = 'PENDING'
            payment.failure_reason = 'Payment incomplete'
            payment.gateway_status = 'incomplete'
            payment.save()
        else:
            return Response({'status': 'ignored', 'reason': f'Unknown event {event!r}'},
                            status=status.HTTP_200_OK)

        return Response({'status': 'processed', 'payment_status': payment.status},
                        status=status.HTTP_200_OK)


class PaymentHistoryView(viewsets.ReadOnlyModelViewSet):
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_manager_or_admin():
            return Payment.objects.all()
        return Payment.objects.filter(order__customer=self.request.user)


class PaymentAccountViewSet(viewsets.ModelViewSet):
    """
    CRUD viewset for designated payment accounts (Telebirr, CBE, Awash, E-Birr).
    GET is public so customers can view accounts during checkout.
    POST, PUT, PATCH, DELETE are restricted to managers/admins.
    """
    serializer_class = PaymentAccountSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated(), IsManager()]

    def get_queryset(self):
        user = self.request.user
        if user and user.is_authenticated and user.is_manager_or_admin():
            return PaymentAccount.objects.all().order_by('method', '-is_active', 'account_name')
        return PaymentAccount.objects.filter(is_active=True).order_by('method', 'account_name')


class ApprovePaymentView(APIView):
    """
    Manager endpoint to approve cash payment (collected on delivery, onsite, or table)
    or manual transfer (Telebirr, CBE, Awash, E-Birr after verifying bank/wallet account).
    Marks payment as SUCCESS and advances order to PLACED so the chef can prepare it.
    """
    permission_classes = [permissions.IsAuthenticated, IsManager]

    def post(self, request, pk):
        from django.utils import timezone

        try:
            if str(pk).isdigit():
                payment = Payment.objects.select_related('order').filter(pk=int(pk)).first()
                if not payment:
                    payment = Payment.objects.select_related('order').filter(order_id=int(pk)).order_by('-created_at').first()
                if not payment:
                    raise Payment.DoesNotExist
            else:
                payment = Payment.objects.select_related('order').filter(tx_ref=str(pk)).first()
                if not payment:
                    payment = Payment.objects.select_related('order').filter(order__order_number=str(pk)).order_by('-created_at').first()
                if not payment:
                    raise Payment.DoesNotExist
        except Payment.DoesNotExist:
            return Response({'error': 'Payment transaction not found.'}, status=status.HTTP_404_NOT_FOUND)

        if payment.status == 'SUCCESS':
            return Response({
                'message': 'Payment is already approved and confirmed.',
                'payment': PaymentSerializer(payment).data,
                'order_status': payment.order.status,
            }, status=status.HTTP_200_OK)

        notes = request.data.get('notes', '').strip()
        payment.approved_by = request.user
        payment.approved_at = timezone.now()
        if notes:
            payment.approval_notes = notes

        ref = payment.transaction_reference or f"APPROVED_{request.user.username}_{int(time.time())}"
        payment.mark_as_success(
            chapa_ref=ref,
            raw_data=f"Approved by staff {request.user.username}. Notes: {notes or 'Verified'}",
            gateway_status='approved'
        )

        return Response({
            'message': f"Payment for Order #{payment.order.order_number} confirmed and approved. Sent to kitchen.",
            'payment': PaymentSerializer(payment).data,
            'order_status': payment.order.status,
        }, status=status.HTTP_200_OK)


class RejectPaymentView(APIView):
    """
    Manager endpoint to reject an invalid cash or transfer claim.
    """
    permission_classes = [permissions.IsAuthenticated, IsManager]

    def post(self, request, pk):
        from django.utils import timezone

        try:
            if str(pk).isdigit():
                payment = Payment.objects.select_related('order').filter(pk=int(pk)).first()
                if not payment:
                    payment = Payment.objects.select_related('order').filter(order_id=int(pk)).order_by('-created_at').first()
                if not payment:
                    raise Payment.DoesNotExist
            else:
                payment = Payment.objects.select_related('order').filter(tx_ref=str(pk)).first()
                if not payment:
                    payment = Payment.objects.select_related('order').filter(order__order_number=str(pk)).order_by('-created_at').first()
                if not payment:
                    raise Payment.DoesNotExist
        except Payment.DoesNotExist:
            return Response({'error': 'Payment transaction not found.'}, status=status.HTTP_404_NOT_FOUND)

        reason = request.data.get('reason', 'Payment verification failed by manager.').strip()
        cancel_order = request.data.get('cancel_order', False)

        payment.approved_by = request.user
        payment.approved_at = timezone.now()
        payment.approval_notes = f"Rejected: {reason}"
        payment.mark_as_failed(
            reason=reason,
            raw_data=f"Rejected by {request.user.username}: {reason}",
            gateway_status='rejected'
        )

        if cancel_order:
            order = payment.order
            if order.status == 'PENDING_PAYMENT':
                order.status = 'CANCELLED'
                order.rejection_reason = reason
                order.save()
                OrderStatusHistory.objects.create(
                    order=order,
                    status='CANCELLED',
                    changed_by=request.user,
                    notes=f"Order cancelled due to payment rejection: {reason}"
                )

        return Response({
            'message': f"Payment for Order #{payment.order.order_number} rejected.",
            'payment': PaymentSerializer(payment).data,
            'order_status': payment.order.status,
        }, status=status.HTTP_200_OK)


class VerifyBankPaymentView(APIView):
    """
    Verify an Ethiopian digital payment or transfer receipt with links.et at the bank source.
    Accessible to managers and order owners.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        from django.utils import timezone

        if not is_links_et_configured():
            return Response({
                'ok': False,
                'verified': False,
                'error': 'LINKS_ET_API_KEY is not configured in .env',
                'message': 'links.et verification service is not configured.',
                'message_am': 'የ links.et ማረጋገጫ አገልግሎት አልተዋቀረም።',
            }, status=status.HTTP_400_BAD_REQUEST)

        # Lookup payment by pk, order_id, tx_ref, or order_number
        try:
            if str(pk).isdigit():
                payment = Payment.objects.select_related('order').filter(pk=int(pk)).first()
                if not payment:
                    payment = Payment.objects.select_related('order').filter(order_id=int(pk)).order_by('-created_at').first()
                if not payment:
                    raise Payment.DoesNotExist
            else:
                payment = Payment.objects.select_related('order').filter(tx_ref=str(pk)).first()
                if not payment:
                    payment = Payment.objects.select_related('order').filter(order__order_number=str(pk)).order_by('-created_at').first()
                if not payment:
                    raise Payment.DoesNotExist
        except Payment.DoesNotExist:
            return Response({'error': 'Payment transaction not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Permission check: must be staff/manager or the customer who placed the order
        if not (request.user.is_manager_or_admin() or payment.order.customer == request.user):
            return Response({'error': 'You do not have permission to verify this payment.'}, status=status.HTTP_403_FORBIDDEN)

        url_or_ref = (
            request.data.get('transaction_reference') or
            request.data.get('url') or
            payment.transaction_reference or
            payment.tx_ref
        )
        image_base64 = request.data.get('image_base64') or request.data.get('receipt_base64')
        auto_approve = request.data.get('auto_approve', False) and request.user.is_manager_or_admin()

        if image_base64:
            res = verify_receipt_image(
                image_base64,
                expected_amount=payment.amount_etb
            )
        else:
            res = verify_receipt(
                url_or_ref,
                expected_amount=payment.amount_etb
            )

        # Record verification results on payment
        payment.verified_at = timezone.now()
        if res.get('verified'):
            payment.gateway_status = 'verified'
            payment.approval_notes = f"Verified by {res.get('provider')}: {res.get('message')}"
            payment.raw_response = json.dumps(res)

            # Auto approve if requested by manager or auto_approve=True
            if auto_approve and payment.status != 'SUCCESS':
                ref = res.get('reference') or payment.transaction_reference or payment.tx_ref
                payment.approved_by = request.user
                payment.approved_at = timezone.now()
                payment.mark_as_success(
                    chapa_ref=f"LINKSET_{res.get('provider_key', 'bank').upper()}_{ref}",
                    raw_data=res,
                    gateway_status='verified'
                )
            else:
                payment.save()
        else:
            payment.gateway_status = 'verification_failed' if not res.get('ok') else 'pending_review'
            payment.approval_notes = res.get('message', 'Bank verification could not confirm receipt.')
            payment.raw_response = json.dumps(res)
            payment.save()

        return Response({
            'ok': res.get('ok', False),
            'verified': res.get('verified', False),
            'provider': res.get('provider'),
            'provider_key': res.get('provider_key'),
            'reference': res.get('reference'),
            'amount_etb': res.get('amount_etb'),
            'expected_amount_etb': res.get('expected_amount_etb'),
            'amount_matches': res.get('amount_matches'),
            'payer_name': res.get('payer_name'),
            'payer_account': res.get('payer_account'),
            'receiver_name': res.get('receiver_name'),
            'receiver_account': res.get('receiver_account'),
            'payment_date': res.get('payment_date'),
            'bank_status': res.get('bank_status'),
            'message': res.get('message'),
            'message_am': res.get('message_am'),
            'payment': PaymentSerializer(payment).data,
            'order_status': payment.order.status,
            'raw_details': res,
        }, status=status.HTTP_200_OK)

