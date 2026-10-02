from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    InitializePaymentView,
    VerifyPaymentView,
    ChapaWebhookView,
    PaymentHistoryView,
)

class OptionalSlashRouter(DefaultRouter):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trailing_slash = '/?'

router = OptionalSlashRouter()
router.register(r'payments/history', PaymentHistoryView, basename='payment-history')

urlpatterns = [
    path('payments/initialize/', InitializePaymentView.as_view(), name='payment-initialize'),
    path('payments/initialize', InitializePaymentView.as_view(), name='payment-initialize-noslash'),
    path('payments/verify/<str:tx_ref>/', VerifyPaymentView.as_view(), name='payment-verify'),
    path('payments/verify/<str:tx_ref>', VerifyPaymentView.as_view(), name='payment-verify-noslash'),
    path('payments/webhook/', ChapaWebhookView.as_view(), name='payment-webhook'),
    path('payments/webhook', ChapaWebhookView.as_view(), name='payment-webhook-noslash'),
    path('', include(router.urls)),
]
