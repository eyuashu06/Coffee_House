from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db import models
from django.utils import timezone

from .models import Order, DeliveryZone, RestaurantSettings, OrderStatusHistory
from .serializers import (
    OrderSerializer,
    DeliveryZoneSerializer,
    RestaurantSettingsSerializer,
)
from .workflow import assert_transition, InvalidTransition
from apps.accounts.permissions import IsManager, IsOwnerOrManager
from apps.core.throttling import ScopedThrottle


class OrderViewSet(viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    #: Listing the kitchen's order queue is the app's core poll and must never be
    #: throttled, so only `create` opts in below.
    throttle_classes = []

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

    def get_throttles(self):
        """Order creation only. Every read and staff action is left unlimited."""
        if self.action != 'create':
            return super().get_throttles()
        self.throttle_scope = 'order_create'
        return [ScopedThrottle()]

    def create(self, request, *args, **kwargs):
        # A closed cafe must not accept web orders (FR-C5). The assistant already
        # refuses; without this the checkout button still created them.
        venue = RestaurantSettings.get_settings()
        if not venue.is_open:
            return Response(
                {'error': 'We are closed right now and are not accepting orders. '
                          'Our opening hours are ' + venue.opening_hours},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        return super().create(request, *args, **kwargs)

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Order.objects.none()

        queryset = (
            Order.objects.all()
            if user.is_manager_or_admin()
            else Order.objects.filter(customer=user)
        )
        queryset = queryset.prefetch_related('items__add_ons', 'payments').order_by('-created_at')

        # The footer's order tracker looks an order up by its code, and the manager
        # panel will want the same. Scoped to whatever get_queryset() already allows,
        # so a customer can never search their way into someone else's order.
        search = self.request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                models.Q(order_number__icontains=search)
                | models.Q(contact_name__icontains=search)
                | models.Q(contact_phone__icontains=search)
            )

        status_filter = self.request.query_params.get('status', '').strip()
        if status_filter and status_filter in {choice[0] for choice in Order.STATUS_CHOICES}:
            queryset = queryset.filter(status=status_filter)

        return queryset

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
        # Prep time can be corrected without moving the order along, so a same-status
        # request is a legitimate no-op rather than an illegal transition.

        valid_statuses = [choice[0] for choice in Order.STATUS_CHOICES]
        if new_status not in valid_statuses:
            return Response(
                {'error': f'Invalid status. Must be one of {valid_statuses}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Only legal moves are accepted (SRS 5.2). A closed order never reopens, and
        # an order cannot jump from PLACED straight to COMPLETED skipping the kitchen.
        is_noop = new_status == order.status
        if not is_noop:
            try:
                assert_transition(order.status, new_status)
            except InvalidTransition as exc:
                return Response(
                    {'error': str(exc)},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Accepting an order commits to a prep time, so the customer can be told when
        # it will be ready. Only staff-supplied values are honoured, and only upward.
        prep_minutes = request.data.get('estimated_prep_minutes')
        if prep_minutes is not None:
            try:
                prep_minutes = int(prep_minutes)
            except (TypeError, ValueError):
                return Response(
                    {'estimated_prep_minutes': ['Enter the prep time in whole minutes.']},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if prep_minutes < 1 or prep_minutes > 240:
                return Response(
                    {'estimated_prep_minutes': ['Prep time must be between 1 and 240 minutes.']},
                    status=status.HTTP_400_BAD_REQUEST
                )

        if is_noop and prep_minutes is None:
            return Response(
                OrderSerializer(order, context={'request': request}).data,
                status=status.HTTP_200_OK
            )

        if not is_noop:
            order.status = new_status
        if new_status == 'PLACED' and not order.placed_at:
            order.placed_at = timezone.now()
        if new_status in ['REJECTED', 'CANCELLED']:
            reason = request.data.get('rejection_reason') or request.data.get('notes')
            if reason:
                order.rejection_reason = reason
        if prep_minutes is not None:
            order.estimated_prep_minutes = prep_minutes

        order.save()

        # A no-op status change is still logged, because the prep time moved and the
        # customer is about to be told a different ready time.
        OrderStatusHistory.objects.create(
            order=order,
            status=new_status,
            changed_by=request.user,
            notes=request.data.get(
                'notes',
                'Prep time updated' if is_noop else f'Status changed to {new_status}',
            )
        )

        return Response(
            OrderSerializer(order, context={'request': request}).data,
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def reorder(self, request, pk=None):
        """
        One-tap reorder (SRS FR-O8).

        Duplicates an existing order's items and configuration into a new PENDING_PAYMENT order.
        """
        venue = RestaurantSettings.get_settings()
        if not venue.is_open:
            return Response(
                {'error': 'We are closed right now and are not accepting orders. '
                          'Our opening hours are ' + venue.opening_hours},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        original_order = self.get_object()

        if not request.user.is_manager_or_admin() and original_order.customer != request.user:
            return Response(
                {'error': 'You do not have permission to reorder this order.'},
                status=status.HTTP_403_FORBIDDEN
            )

        import uuid
        from django.db import transaction
        from apps.orders.models import OrderItem, OrderItemAddOn

        today_str = timezone.now().strftime('%Y%m%d')
        unique_suffix = uuid.uuid4().hex[:4].upper()
        order_number = f"ORD-{today_str}-{unique_suffix}"

        with transaction.atomic():
            new_order = Order.objects.create(
                order_number=order_number,
                customer=request.user,
                order_type=original_order.order_type,
                table_number=original_order.table_number,
                delivery_zone=original_order.delivery_zone,
                delivery_address=original_order.delivery_address,
                contact_name=original_order.contact_name or (request.user.get_full_name() if hasattr(request.user, 'get_full_name') else '') or request.user.username,
                contact_phone=original_order.contact_phone or getattr(request.user, 'phone', ''),
                notes=original_order.notes,
                status='PENDING_PAYMENT',
                subtotal_etb=original_order.subtotal_etb,
                delivery_fee_etb=original_order.delivery_fee_etb,
                total_amount_etb=original_order.total_amount_etb,
            )

            for item in original_order.items.all():
                new_item = OrderItem.objects.create(
                    order=new_order,
                    menu_item=item.menu_item,
                    item_name=item.item_name,
                    variant_name=item.variant_name,
                    unit_price_etb=item.unit_price_etb,
                    quantity=item.quantity,
                    subtotal_etb=item.subtotal_etb,
                    temperature=item.temperature,
                    milk_choice=item.milk_choice,
                    notes=item.notes,
                )
                for add_on in item.add_ons.all():
                    OrderItemAddOn.objects.create(
                        order_item=new_item,
                        add_on_name=add_on.add_on_name,
                        price_etb=add_on.price_etb,
                    )

            OrderStatusHistory.objects.create(
                order=new_order,
                status='PENDING_PAYMENT',
                changed_by=request.user,
                notes=f'Reordered from {original_order.order_number}'
            )

        return Response(
            OrderSerializer(new_order, context={'request': request}).data,
            status=status.HTTP_201_CREATED
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
