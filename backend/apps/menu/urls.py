from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, MenuItemViewSet

class OptionalSlashRouter(DefaultRouter):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trailing_slash = '/?'

router = OptionalSlashRouter()
router.register(r'menu/categories', CategoryViewSet, basename='menu-categories')
router.register(r'menu/items', MenuItemViewSet, basename='menu-items')

urlpatterns = [
    path('', include(router.urls)),
]
