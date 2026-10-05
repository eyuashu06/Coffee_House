from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone

from .models import Order, DeliveryZone, RestaurantSettings, OrderStatusHistory
from .serializers import (
    OrderSerializer,
    DeliveryZoneSerializer,
    RestaurantSettingsSerializer,
)
from apps.accounts.permissions import IsManager, IsOwnerOrManager


class OrderViewSet(viewsets.ModelViewSet):
    serializer_class = OrderSerializer

    #: Actions that only managers/admins may perform
    MANAGER_ACTIONS = {'update_status', 'update', 'partial_update', 'destroy'}

    def get_permissions(self):
        """
        POST  (create order)        → AllowAny  (guests can place; customer auto-linked if logged in)
        POST  (update_status)       → IsManager (staff-only order processing)
        PUT/PATCH/DELETE            → IsManager (prices/status/line items are staff-controlled)
        GET   (list/retrieve)       → IsAuthenticated  (must be logged in to see orders)
        """
        if self.action == 'create':
            return [permissions.AllowAny()]
        if self.action in self.MANAGER_ACTIONS:
            return [IsManager()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Order.objects.none()
        if user.is_manager_or_admin():
            return Order.objects.all().prefetch_related('items__add_ons', 'payments')
        # Return only this customer's orders, newest first
        return Order.objects.filter(customer=user).prefetch_related('items__add_ons', 'payments').order_by('-created_at')

    def perform_create(self, serializer):
        order = serializer.save()
        # Audit status history
        OrderStatusHistory.objects.create(
            order=order,
            status=order.status,
            changed_by=self.request.user if self.request.user.is_authenticated else None,
            notes='Order created'
        )

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        # Defense in depth: get_permissions() also enforces this
        if not request.user.is_authenticated or not request.user.is_manager_or_admin():
            return Response(
                {'error': 'Manager permission required to update order status.'},
                status=status.HTTP_403_FORBIDDEN
            )

        order = self.get_object()
        new_status = request.data.get('status')

        valid_statuses = [choice[0] for choice in Order.STATUS_CHOICES]
        if new_status not in valid_statuses:
            return Response(
                {'error': f'Invalid status. Must be one of {valid_statuses}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Never let staff "re-open" a finished order
        if order.status in ['COMPLETED', 'CANCELLED', 'REJECTED'] and new_status not in ['COMPLETED', 'CANCELLED', 'REJECTED']:
            return Response(
                {'error': f'Order #{order.order_number} is already closed ({order.get_status_display()}).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if new_status == order.status:
            return Response(
                OrderSerializer(order, context={'request': request}).data,
                status=status.HTTP_200_OK
            )

        order.status = new_status
        if new_status == 'PLACED' and not order.placed_at:
            order.placed_at = timezone.now()
        if new_status in ['REJECTED', 'CANCELLED']:
            reason = request.data.get('rejection_reason') or request.data.get('notes')
            if reason:
                order.rejection_reason = reason

        order.save()

        OrderStatusHistory.objects.create(
            order=order,
            status=new_status,
            changed_by=request.user,
            notes=request.data.get('notes', f'Status changed to {new_status}')
        )

        return Response(
            OrderSerializer(order, context={'request': request}).data,
            status=status.HTTP_200_OK
        )


class DeliveryZoneViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DeliveryZone.objects.filter(is_active=True)
    serializer_class = DeliveryZoneSerializer
    permission_classes = [permissions.AllowAny]


class RestaurantSettingsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        settings_obj = RestaurantSettings.get_settings()
        return Response(RestaurantSettingsSerializer(settings_obj).data, status=status.HTTP_200_OK)

    def patch(self, request):
        if not request.user or not request.user.is_manager_or_admin():
            return Response(
                {'error': 'Manager permission required.'},
                status=status.HTTP_403_FORBIDDEN
            )

        settings_obj = RestaurantSettings.get_settings()
        serializer = RestaurantSettingsSerializer(settings_obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
