import json
import time
import requests
from decimal import Decimal
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
        if clean_phone == '251900000000':
            payment.mark_as_success(chapa_ref='CHAPA_MOCK_SUCCESS', raw_data='Mock test success')
            return Response({
                'message': 'Mock payment success',
                'payment': PaymentSerializer(payment).data,
                'checkout_url': '',
                'test_mode': True,
            }, status=status.HTTP_200_OK)
        elif clean_phone == '251911111111':
            payment.mark_as_failed(reason='INSUFFICIENT_FUNDS: Account balance insufficient', raw_data='Mock test insufficient funds')
            return Response({
                'message': 'Mock payment failure',
                'payment': PaymentSerializer(payment).data,
                'checkout_url': '',
                'test_mode': True,
            }, status=status.HTTP_200_OK)
        elif clean_phone == '251922222222':
            payment.mark_as_cancelled(reason='USER_CANCELLED: Payment cancelled by user', raw_data='Mock test user cancelled')
            return Response({
                'message': 'Mock payment cancelled',
                'payment': PaymentSerializer(payment).data,
                'checkout_url': '',
                'test_mode': True,
            }, status=status.HTTP_200_OK)
        elif clean_phone == '251933333333':
            payment.status = 'PENDING'
            payment.save()
            return Response({
                'message': 'Mock payment timeout pending',
                'payment': PaymentSerializer(payment).data,
                'checkout_url': '',
                'test_mode': True,
            }, status=status.HTTP_200_OK)

        # ── Chapa API call ───────────────────────────────────────────────────
        chapa_secret_key = getattr(settings, 'CHAPA_SECRET_KEY', 'CHASECK_TEST-UMHsYkPPXIFHkoPbm38QkV9OpBh0y4vD')
        chapa_api_url = getattr(settings, 'CHAPA_API_URL', 'https://api.chapa.co/v1')
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')

        return_url = f"{frontend_url}/account?order={order.order_number}&tx_ref={tx_ref}&payment_status=pending"

        payload = {
            'amount': str(amount_etb),
            'currency': 'ETB',
            'email': order.customer.email if (order.customer and order.customer.email) else 'customer@artisanalreserve.com',
            'first_name': order.customer.first_name if (order.customer and order.customer.first_name) else order.contact_name,
            'last_name': order.customer.last_name if (order.customer and order.customer.last_name) else 'Customer',
            'tx_ref': tx_ref,
            'callback_url': f"{frontend_url}/api/v1/payments/webhook/",
            'return_url': return_url,
            'customization': {
                'title': 'Artisanal Reserve Coffee & Food',
                'description': f'Payment for Order #{order.order_number}',
            }
        }
        
        if clean_phone:
            payload['phone_number'] = clean_phone

        headers = {
            'Authorization': f"Bearer {chapa_secret_key}",
            'Content-Type': 'application/json',
        }

        checkout_url = ''
        chapa_response_data = {}

        try:
            chapa_res = requests.post(
                f"{chapa_api_url}/transaction/initialize",
                json=payload,
                headers=headers,
                timeout=10
            )
            if chapa_res.ok:
                chapa_response_data = chapa_res.json()
                checkout_url = chapa_response_data.get('data', {}).get('checkout_url', '')
                payment.checkout_url = checkout_url
                payment.raw_response = json.dumps(chapa_response_data)
                payment.save()
            else:
                payment.raw_response = f"Chapa API Error {chapa_res.status_code}: {chapa_res.text}"
                payment.save()
                return Response({'error': f"Payment Gateway Error: {chapa_res.json().get('message', chapa_res.text)}"}, status=status.HTTP_400_BAD_REQUEST)
        except requests.exceptions.Timeout:
            payment.raw_response = "Chapa API timeout – network unreachable"
            payment.save()
            return Response({
                'message': 'Payment gateway is temporarily unreachable. Your order is saved – retry payment from My Orders.',
                'payment': PaymentSerializer(payment).data,
                'checkout_url': return_url,
                'mode': 'fallback',
            }, status=status.HTTP_200_OK)
        except Exception as e:
            payment.raw_response = f"API Call Exception: {str(e)}"
            payment.save()
            return Response({
                'message': 'Payment gateway is temporarily unreachable. Your order is saved – retry payment from My Orders.',
                'payment': PaymentSerializer(payment).data,
                'checkout_url': return_url,
                'mode': 'fallback',
            }, status=status.HTTP_200_OK)

        # Standard Chapa Hosted Checkout: keep PENDING and redirect
        payment.status = 'PENDING'
        payment.save()

        # If Chapa didn't return a checkout_url, use fallback return URL
        final_checkout_url = checkout_url if checkout_url.startswith('http') else return_url

        return Response({
            'message': 'Payment initialized successfully.',
            'payment': PaymentSerializer(payment).data,
            'checkout_url': final_checkout_url,
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

        # Attempt Chapa API verification
        chapa_secret_key = getattr(settings, 'CHAPA_SECRET_KEY', 'CHASECK_TEST-UMHsYkPPXIFHkoPbm38QkV9OpBh0y4vD')
        chapa_api_url = getattr(settings, 'CHAPA_API_URL', 'https://api.chapa.co/v1')

        headers = {'Authorization': f"Bearer {chapa_secret_key}"}
        verified = False

        try:
            verify_res = requests.get(
                f"{chapa_api_url}/transaction/verify/{tx_ref}",
                headers=headers,
                timeout=10
            )
            if verify_res.ok:
                verify_data = verify_res.json()
                chapa_status = verify_data.get('data', {}).get('status', '').lower()
                chapa_ref = verify_data.get('data', {}).get('reference', '')

                if chapa_status == 'success':
                    payment.mark_as_success(chapa_ref=chapa_ref, raw_data=verify_data)
                    verified = True
                elif chapa_status in ['failed', 'rejected']:
                    payment.mark_as_failed(reason='Verification returned failed', raw_data=verify_data)
                    verified = True
                elif chapa_status in ['cancelled', 'abandoned']:
                    payment.mark_as_cancelled(reason='Verification returned cancelled', raw_data=verify_data)
                    verified = True
            else:
                payment.raw_response = f"Verification API error {verify_res.status_code}: {verify_res.text[:200]}"
                payment.save()
        except requests.exceptions.Timeout:
            payment.raw_response = "Verification timeout"
            payment.save()
        except Exception as e:
            payment.raw_response = f"Verification exception: {str(e)}"
            payment.save()

        return Response({
            'payment': PaymentSerializer(payment).data,
            'order_status': payment.order.status,
            'verified': verified,
        }, status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name='dispatch')
class ChapaWebhookView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        import hmac
        import hashlib

        # Optional signature verification if x-chapa-signature is sent
        chapa_sig = request.headers.get('x-chapa-signature') or request.headers.get('Chapa-Signature')
        if chapa_sig:
            secret = getattr(settings, 'CHAPA_SECRET_KEY', '')
            raw_body = request.body if hasattr(request, 'body') else b''
            expected_sig = hmac.new(secret.encode('utf-8'), raw_body, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(chapa_sig, expected_sig):
                return Response({'error': 'Invalid webhook signature signature.'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            data = request.data if isinstance(request.data, dict) else json.loads(request.body)
        except Exception:
            data = {}

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
