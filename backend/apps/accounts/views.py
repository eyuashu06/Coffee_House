from rest_framework import status, viewsets, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.core.mail import send_mail
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

from .models import Address
from .serializers import (
    UserSerializer,
    RegisterSerializer,
    LoginSerializer,
    AddressSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
)
from .permissions import IsCustomer, IsOwnerOrManager
from apps.core.throttling import ScopedThrottle

User = get_user_model()

def issue_tokens_for_user(user):
    """Build access/refresh tokens that carry the role, so the frontend can route
    staff to the dashboard and customers to their account."""
    refresh = RefreshToken.for_user(user)
    refresh['role'] = user.role
    refresh['username'] = user.username
    access = refresh.access_token
    access['role'] = user.role
    access['username'] = user.username
    return refresh, access


def auth_cookie_kwargs():
    """Flags shared by every cookie this module sets."""
    is_secure = bool(getattr(settings, 'SECURE_SSL', False) or getattr(settings, 'COOKIE_SECURE', False))
    samesite = 'None' if is_secure else 'Lax'
    return {
        'httponly': True,
        'samesite': samesite,
        'secure': is_secure,
    }


def set_auth_cookies(response, refresh_token, access_token):
    """Utility to attach httpOnly JWT cookies to response."""
    cookie_kwargs = auth_cookie_kwargs()
    # Set access token cookie (1 hour)
    response.set_cookie(
        'access_token',
        str(access_token),
        max_age=3600,
        **cookie_kwargs
    )
    # Set refresh token cookie (7 days)
    response.set_cookie(
        'refresh_token',
        str(refresh_token),
        max_age=7 * 86400,
        **cookie_kwargs
    )
    return response

def clear_auth_cookies(response):
    """Utility to delete httpOnly JWT cookies."""
    response.delete_cookie('access_token', path='/')
    response.delete_cookie('refresh_token', path='/')
    return response

@method_decorator(csrf_exempt, name='dispatch')
class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedThrottle]
    throttle_scope = 'auth_register'

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh, access = issue_tokens_for_user(user)

            res = Response({
                'user': UserSerializer(user).data,
                'message': 'Account created successfully.'
            }, status=status.HTTP_201_CREATED)
            return set_auth_cookies(res, refresh, access)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@method_decorator(csrf_exempt, name='dispatch')
class LoginView(APIView):
    """
    Sign-in, rate limited per address.

    The view answers differently for an unknown address and a wrong password, so it
    doubles as an account-existence oracle - which is precisely what an unlimited
    endpoint should not be. DRF answers 429 once the limit is hit.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedThrottle]
    throttle_scope = 'auth_login'

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']
            refresh, access = issue_tokens_for_user(user)

            res = Response({
                'user': UserSerializer(user).data,
                'message': 'Login successful.'
            }, status=status.HTTP_200_OK)
            return set_auth_cookies(res, refresh, access)

        # Wrong identifier/password is an authentication failure (401), not a
        # malformed request (400). Missing/blank fields stay 400.
        if set(serializer.errors.keys()) <= {'non_field_errors'}:
            return Response(serializer.errors, status=status.HTTP_401_UNAUTHORIZED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@method_decorator(csrf_exempt, name='dispatch')
class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        # Blacklist refresh token if present
        refresh_token = request.COOKIES.get('refresh_token') or request.data.get('refresh_token')
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except Exception:
                pass # Ignore expired or invalid tokens on logout

        res = Response({'message': 'Logged out successfully.'}, status=status.HTTP_200_OK)
        return clear_auth_cookies(res)

@method_decorator(csrf_exempt, name='dispatch')
class CookieTokenRefreshView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        refresh_token = request.COOKIES.get('refresh_token') or request.data.get('refresh_token')
        if not refresh_token:
            return Response({'error': 'Refresh token missing.'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            refresh = RefreshToken(refresh_token)
            access = refresh.access_token

            # Carry the role forward so page routing keeps working after a refresh
            role = refresh.get('role')
            username = refresh.get('username')
            if role:
                access['role'] = role
            if username:
                access['username'] = username

            res = Response({'message': 'Token refreshed successfully.'}, status=status.HTTP_200_OK)
            # Same flags as sign-in: one helper, so the refreshed access cookie
            # cannot end up with different transport rules than the original.
            res.set_cookie('access_token', str(access), max_age=3600,
                           **auth_cookie_kwargs())
            return res
        except (TokenError, InvalidToken) as e:
            res = Response({'error': 'Invalid or expired refresh token.'}, status=status.HTTP_401_UNAUTHORIZED)
            return clear_auth_cookies(res)

@method_decorator(csrf_exempt, name='dispatch')
class UserProfileView(APIView):
    permission_classes = [permissions.AllowAny]

    def _unauthenticated(self, request):
        """
        The answer for a caller we could not identify.

        "Nobody is signed in" and "your access cookie has expired" are different
        situations and they need different answers, because the client only knows to
        try /auth/refresh/ when it gets a 401.

        JWTCookieAuthentication deliberately degrades an expired token to anonymous
        rather than raising, so that public endpoints stay reachable (see its
        comment). The consequence is that this view cannot tell the two apart from
        `request.user` alone - it has to look at the cookie.

        Answering 200 {'authenticated': false} to *both* meant the session bootstrap
        never triggered a refresh, so every customer was silently signed out once
        their hour-long access token ran out even though their 7-day refresh cookie
        was still valid. A stale access cookie therefore gets 401: the frontend
        refreshes, replays, and lands on the real profile.
        """
        if request.COOKIES.get('access_token'):
            return Response(
                {'detail': 'Authentication credentials were not provided.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        # Genuinely no session: a first-time visitor. 200, not 401, or the client
        # would try to refresh a refresh token it never had.
        return Response({'authenticated': False}, status=status.HTTP_200_OK)

    def get(self, request):
        if not request.user.is_authenticated:
            return self._unauthenticated(request)
        serializer = UserSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        if not request.user.is_authenticated:
            return self._unauthenticated(request)
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class AddressViewSet(viewsets.ModelViewSet):
    serializer_class = AddressSerializer
    permission_classes = [IsOwnerOrManager]

    def get_queryset(self):
        if self.request.user.is_anonymous:
            return Address.objects.none()
        if self.request.user.is_manager_or_admin():
            return Address.objects.all()
        return Address.objects.filter(user=self.request.user)

@method_decorator(csrf_exempt, name='dispatch')
class PasswordResetRequestView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedThrottle]
    throttle_scope = 'auth_password_reset'

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']
            user = User.objects.get(email__iexact=email)

            import secrets
            from datetime import timedelta
            from django.utils import timezone
            from django.core.mail import EmailMultiAlternatives
            from .models import PasswordResetOTP

            otp_code = f"{secrets.randbelow(900000) + 100000}"
            # Invalidate any older unused OTPs for this user
            PasswordResetOTP.objects.filter(user=user, is_used=False).update(is_used=True)
            expires_at = timezone.now() + timedelta(minutes=15)
            PasswordResetOTP.objects.create(
                user=user,
                otp_code=otp_code,
                expires_at=expires_at
            )

            token_generator = PasswordResetTokenGenerator()
            token = token_generator.make_token(user)
            uidb64 = urlsafe_base64_encode(force_bytes(user.pk))

            frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
            reset_url = f"{frontend_url}/reset-password?uid={uidb64}&token={token}"

            subject = "Your Artisanal Coffee Password Reset OTP Code"
            plain_message = (
                f"Hello {user.get_short_name() or user.username},\n\n"
                f"Your password recovery verification code is:\n\n"
                f"    {otp_code}\n\n"
                f"This code will expire in 15 minutes. Enter this code on the reset page to set a new password.\n\n"
                f"Alternatively, you may reset your password using this link:\n{reset_url}\n\n"
                f"If you did not request this code, you can safely ignore this email.\n\n"
                f"Artisanal Coffee Reserve Team"
            )
            html_message = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0c0a09; color: #f5f5f4; margin: 0; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto; background: #1c1917; border: 1px solid #292524; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
    <h2 style="color: #f7b5be; margin-top: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Artisanal Coffee Reserve</h2>
    <p style="font-size: 15px; line-height: 1.5; color: #d6d3d1;">Hello {user.get_short_name() or user.username},</p>
    <p style="font-size: 15px; line-height: 1.5; color: #d6d3d1;">We received a request to recover your password. Use the 6-digit verification code below:</p>
    <div style="margin: 28px 0; text-align: center;">
      <div style="display: inline-block; background: #292524; border: 2px dashed #f7b5be; border-radius: 12px; padding: 14px 28px; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #f7b5be; font-family: monospace;">
        {otp_code}
      </div>
      <p style="font-size: 12px; color: #a8a29e; margin-top: 10px;">Valid for 15 minutes</p>
    </div>
    <p style="font-size: 13px; color: #a8a29e; line-height: 1.5;">If you prefer using a direct link, you can also <a href="{reset_url}" style="color: #f7b5be; text-decoration: underline;">click here to reset your password</a>.</p>
    <hr style="border: none; border-top: 1px solid #292524; margin: 24px 0;">
    <p style="font-size: 11px; color: #78716c; margin-bottom: 0;">If you did not request this recovery code, please ignore this email.</p>
  </div>
</body>
</html>"""

            from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@artisanalreserve.com')
            email_msg = EmailMultiAlternatives(subject, plain_message, from_email, [user.email])
            email_msg.attach_alternative(html_message, "text/html")
            email_msg.send(fail_silently=False)

            payload = {
                'message': 'A 6-digit verification code has been sent to your email address.',
            }
            if getattr(settings, 'EXPOSE_PASSWORD_RESET_TOKEN', False):
                payload['otp_code'] = otp_code
                payload['uidb64'] = uidb64
                payload['token'] = token
            return Response(payload, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@method_decorator(csrf_exempt, name='dispatch')
class PasswordResetConfirmView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedThrottle]
    throttle_scope = 'auth_password_reset'

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']
            new_password = serializer.validated_data['new_password']
            user.set_password(new_password)
            user.save()

            otp_obj = serializer.validated_data.get('otp_obj')
            if otp_obj:
                otp_obj.is_used = True
                otp_obj.save()

            return Response({'message': 'Password has been reset successfully. Please log in.'}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

from .models import Notification
from .serializers import NotificationSerializer
from rest_framework import viewsets
from rest_framework.decorators import action

class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        self.get_queryset().update(is_read=True)
        return Response({'status': 'ok'})

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=['is_read'])
        return Response({'status': 'ok'})


@method_decorator(csrf_exempt, name='dispatch')
class PhoneLoginView(APIView):
    """
    Seamless phone login for customers.
    Accepts phone number (and optional name). Creates or retrieves the customer
    and logs them in with JWT cookies immediately. No email or password needed.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedThrottle]
    throttle_scope = 'auth_login'

    def post(self, request):
        phone = (request.data.get('phone') or request.data.get('phone_number') or '').strip()
        name = (request.data.get('name') or request.data.get('contact_name') or '').strip()
        if not phone:
            return Response({'error': 'Phone number is required.'}, status=status.HTTP_400_BAD_REQUEST)

        from .services import get_or_create_customer_by_phone
        user, created = get_or_create_customer_by_phone(phone, name=name)
        if not user:
            return Response({'error': 'Invalid phone number format.'}, status=status.HTTP_400_BAD_REQUEST)

        refresh, access = issue_tokens_for_user(user)
        res = Response({
            'user': UserSerializer(user).data,
            'tokens': {
                'access': str(access),
                'refresh': str(refresh),
            },
            'message': 'Signed in successfully.',
            'is_new_user': created,
        }, status=status.HTTP_200_OK)
        return set_auth_cookies(res, refresh, access)

