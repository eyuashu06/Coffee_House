from rest_framework import permissions, viewsets
from .models import Category, MenuItem
from .serializers import CategorySerializer, MenuItemSerializer
from apps.accounts.permissions import IsManager


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.filter(is_active=True)
    serializer_class = CategorySerializer


class MenuItemViewSet(viewsets.ModelViewSet):
    """
    Read access for everyone (customer menu + manager menu tab).
    Writes (availability toggles, edits) restricted to managers/admins.
    """
    serializer_class = MenuItemSerializer
    queryset = MenuItem.objects.select_related('category')

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsManager()]
        return [permissions.AllowAny()]