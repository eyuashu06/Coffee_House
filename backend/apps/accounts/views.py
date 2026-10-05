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


def set_auth_cookies(response, refresh_token, access_token):
    """Utility to attach httpOnly JWT cookies to response."""
    cookie_kwargs = {
        'httponly': True,
        'samesite': 'Lax',
        'secure': not settings.DEBUG,
    }
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

class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

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

class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

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

class CookieTokenRefreshView(APIView):
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
            cookie_kwargs = {
                'httponly': True,
                'samesite': 'Lax',
                'secure': not settings.DEBUG,
            }
            res.set_cookie('access_token', str(access), max_age=3600, **cookie_kwargs)
            return res
        except (TokenError, InvalidToken) as e:
            res = Response({'error': 'Invalid or expired refresh token.'}, status=status.HTTP_401_UNAUTHORIZED)
            return clear_auth_cookies(res)

class UserProfileView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'authenticated': False}, status=status.HTTP_200_OK)
        serializer = UserSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        if not request.user.is_authenticated:
            return Response({'detail': 'Authentication credentials were not provided.'}, status=status.HTTP_401_UNAUTHORIZED)
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

class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']
            user = User.objects.get(email__iexact=email)
            token_generator = PasswordResetTokenGenerator()
            token = token_generator.make_token(user)
            uidb64 = urlsafe_base64_encode(force_bytes(user.pk))

            reset_url = f"{settings.FRONTEND_URL if hasattr(settings, 'FRONTEND_URL') else 'http://localhost:3000'}/reset-password?uid={uidb64}&token={token}"
            
            send_mail(
                subject='Artisanal Reserve Password Reset Request',
                message=f'Hello {user.username},\n\nPlease click the link below to reset your password:\n{reset_url}\n\nIf you did not request this, please ignore this email.',
                from_email='noreply@artisanalreserve.com',
                recipient_list=[user.email],
                fail_silently=True,
            )

            return Response({
                'message': 'Password reset instructions have been sent to your email address.',
                'uidb64': uidb64,  # Provided for testing/dev environments
                'token': token
            }, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']
            new_password = serializer.validated_data['new_password']
            user.set_password(new_password)
            user.save()
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
