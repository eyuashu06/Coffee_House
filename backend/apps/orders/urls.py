from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    OrderViewSet,
    DeliveryZoneViewSet,
    RestaurantSettingsView,
)

class OptionalSlashRouter(DefaultRouter):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trailing_slash = '/?'

router = OptionalSlashRouter()
router.register(r'orders', OrderViewSet, basename='order')
router.register(r'delivery-zones', DeliveryZoneViewSet, basename='delivery-zone')

urlpatterns = [
    path('restaurant-settings/', RestaurantSettingsView.as_view(), name='restaurant-settings'),
    path('restaurant-settings', RestaurantSettingsView.as_view(), name='restaurant-settings-noslash'),
    path('', include(router.urls)),
]
