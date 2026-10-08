from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, CoffeeItemViewSet, OrderViewSet, SommelierRAGView, AnalyticsAPIView, TableReservationViewSet

class OptionalSlashRouter(DefaultRouter):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trailing_slash = '/?'

router = OptionalSlashRouter()
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'coffees', CoffeeItemViewSet, basename='coffee')
# The live order API is apps.orders, registered at /api/v1/orders/. This legacy viewset
# used to claim the same prefix, which meant it was unreachable and reverse('order-list')
# silently pointed at the wrong model. It stays reachable, under its own name.
router.register(r'legacy-orders', OrderViewSet, basename='legacy-order')
router.register(r'reservations', TableReservationViewSet, basename='reservation')

urlpatterns = [
    path('', include(router.urls)),
    path('sommelier/', SommelierRAGView.as_view(), name='sommelier-rag'),
    path('sommelier', SommelierRAGView.as_view(), name='sommelier-rag-noslash'),
    path('analytics/', AnalyticsAPIView.as_view(), name='analytics'),
    path('analytics', AnalyticsAPIView.as_view(), name='analytics-noslash'),
]
