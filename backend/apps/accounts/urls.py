from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RegisterView,
    LoginView,
    LogoutView,
    CookieTokenRefreshView,
    UserProfileView,
    AddressViewSet,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    NotificationViewSet,
)

class OptionalSlashRouter(DefaultRouter):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trailing_slash = '/?'

router = OptionalSlashRouter()
router.register(r'addresses', AddressViewSet, basename='address')
router.register(r'auth/notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    path('auth/register/', RegisterView.as_view(), name='auth-register'),
    path('auth/register', RegisterView.as_view(), name='auth-register-noslash'),
    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('auth/login', LoginView.as_view(), name='auth-login-noslash'),
    path('auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('auth/logout', LogoutView.as_view(), name='auth-logout-noslash'),
    path('auth/refresh/', CookieTokenRefreshView.as_view(), name='auth-refresh'),
    path('auth/refresh', CookieTokenRefreshView.as_view(), name='auth-refresh-noslash'),
    path('auth/me/', UserProfileView.as_view(), name='auth-me'),
    path('auth/me', UserProfileView.as_view(), name='auth-me-noslash'),
    path('auth/password-reset/', PasswordResetRequestView.as_view(), name='auth-password-reset'),
    path('auth/password-reset', PasswordResetRequestView.as_view(), name='auth-password-reset-noslash'),
    path('auth/password-reset/confirm/', PasswordResetConfirmView.as_view(), name='auth-password-reset-confirm'),
    path('auth/password-reset/confirm', PasswordResetConfirmView.as_view(), name='auth-password-reset-confirm-noslash'),
    path('', include(router.urls)),
]
