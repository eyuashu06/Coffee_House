from rest_framework import permissions, status, viewsets
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db import models
from django.core.cache import cache
from .models import Category, MenuItem, CafeSettings, CafeLocation
from .serializers import (
    CategorySerializer,
    MenuItemSerializer,
    CafeSettingsSerializer,
    CafeLocationSerializer,
)
from apps.accounts.permissions import IsManager


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.filter(is_active=True).order_by('display_order', 'name')
    serializer_class = CategorySerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsManager()]
        return [permissions.AllowAny()]

    def list(self, request, *args, **kwargs):
        cache_key = "categories_list"
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            resp = Response(cached_data)
            resp['Cache-Control'] = 'public, max-age=120'
            return resp
        response = super().list(request, *args, **kwargs)
        if response.status_code == 200:
            cache.set(cache_key, response.data, timeout=120)
            response['Cache-Control'] = 'public, max-age=120'
        return response

    def perform_create(self, serializer):
        super().perform_create(serializer)
        cache.clear()

    def perform_update(self, serializer):
        super().perform_update(serializer)
        cache.clear()

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        cache.clear()


class MenuItemViewSet(viewsets.ModelViewSet):
    """
    Read access for everyone (customer menu + manager menu tab).
    Writes (create, update, delete, availability toggles) restricted to managers/admins.
    Supports both JSON payloads and multipart/form-data for image file uploads.
    """
    serializer_class = MenuItemSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    queryset = (
        MenuItem.objects.select_related('category')
        .prefetch_related('variants', 'add_ons')
        .order_by('category__display_order', 'name')
    )

    def get_queryset(self):
        qs = (
            MenuItem.objects.select_related('category')
            .prefetch_related('variants', 'add_ons')
        )
        category = self.request.query_params.get('category')
        search = (self.request.query_params.get('search') or '').strip()[:100]
        available = self.request.query_params.get('available')
        if category and category != 'all':
            qs = qs.filter(category__slug=category)
        if search:
            qs = qs.filter(models.Q(name__icontains=search) | models.Q(description__icontains=search))
        if available == 'true':
            qs = qs.filter(is_available=True)
        return qs.order_by('category__display_order', 'name')

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsManager()]
        return [permissions.AllowAny()]

    def list(self, request, *args, **kwargs):
        query_string = request.META.get('QUERY_STRING', '')
        cache_key = f"menu_items_list_{query_string}"
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            resp = Response(cached_data)
            resp['Cache-Control'] = 'public, max-age=60'
            resp['X-Cache'] = 'HIT'
            return resp

        response = super().list(request, *args, **kwargs)
        if response.status_code == 200:
            cache.set(cache_key, response.data, timeout=60)
            response['Cache-Control'] = 'public, max-age=60'
            response['X-Cache'] = 'MISS'
        return response

    def perform_create(self, serializer):
        super().perform_create(serializer)
        cache.clear()

    def perform_update(self, serializer):
        super().perform_update(serializer)
        cache.clear()

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        cache.clear()


class CafeSettingsView(APIView):
    """
    Retrieve and update Cafe brand identity (name, tagline, phone, hours, etc.).
    """
    def get_permissions(self):
        if self.request.method in ['PUT', 'PATCH', 'POST']:
            return [IsManager()]
        return [permissions.AllowAny()]

    def get(self, request):
        settings_obj, _ = CafeSettings.objects.get_or_create(id=1)
        serializer = CafeSettingsSerializer(settings_obj)
        return Response(serializer.data)

    def patch(self, request):
        settings_obj, _ = CafeSettings.objects.get_or_create(id=1)
        serializer = CafeSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        try:
            from apps.orders.models import RestaurantSettings
            rs = RestaurantSettings.get_settings()
            if 'opening_hours' in request.data:
                rs.opening_hours = request.data['opening_hours']
            if 'primary_phone' in request.data:
                rs.contact_phone = request.data['primary_phone']
            if 'contact_email' in request.data:
                rs.contact_email = request.data['contact_email']
            rs.save()
        except Exception:
            pass
        return Response(serializer.data)

    def put(self, request):
        return self.patch(request)


class CafeLocationViewSet(viewsets.ModelViewSet):
    """
    Manage Cafe branch locations (Piassa flagship, Bole branch, etc.).
    """
    serializer_class = CafeLocationSerializer
    queryset = CafeLocation.objects.all().order_by('display_order', '-is_primary', 'id')

    def get_queryset(self):
        qs = CafeLocation.objects.all()
        # Public visitors only see active locations; managers see all
        user = self.request.user
        if not (user and user.is_authenticated and getattr(user, 'role', '') in ['MANAGER', 'ADMIN']):
            qs = qs.filter(is_active=True)
        return qs.order_by('display_order', '-is_primary', 'id')

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsManager()]
        return [permissions.AllowAny()]

    def perform_create(self, serializer):
        is_primary = serializer.validated_data.get('is_primary', False)
        if is_primary:
            CafeLocation.objects.filter(is_primary=True).update(is_primary=False)
            try:
                from apps.orders.models import RestaurantSettings
                rs = RestaurantSettings.get_settings()
                rs.address = f"{serializer.validated_data.get('address', '')}, {serializer.validated_data.get('city', 'Addis Ababa')}"
                rs.save()
            except Exception:
                pass
        serializer.save()

    def perform_update(self, serializer):
        is_primary = serializer.validated_data.get('is_primary', False)
        if is_primary:
            CafeLocation.objects.filter(is_primary=True).exclude(pk=serializer.instance.pk).update(is_primary=False)
            try:
                from apps.orders.models import RestaurantSettings
                rs = RestaurantSettings.get_settings()
                addr = serializer.validated_data.get('address') or serializer.instance.address
                city = serializer.validated_data.get('city') or serializer.instance.city
                rs.address = f"{addr}, {city}"
                rs.save()
            except Exception:
                pass
        serializer.save()