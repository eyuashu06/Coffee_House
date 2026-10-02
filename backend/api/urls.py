from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, CoffeeItemViewSet, OrderViewSet, SommelierRAGView

class OptionalSlashRouter(DefaultRouter):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trailing_slash = '/?'

router = OptionalSlashRouter()
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'coffees', CoffeeItemViewSet, basename='coffee')
router.register(r'orders', OrderViewSet, basename='order')

urlpatterns = [
    path('', include(router.urls)),
    path('sommelier/', SommelierRAGView.as_view(), name='sommelier-rag'),
    path('sommelier', SommelierRAGView.as_view(), name='sommelier-rag-noslash'),
]
