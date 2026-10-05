from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db import models
from django.db.models import Sum
from datetime import date, timedelta
from .models import Category, CoffeeItem, Order, KnowledgeBase, TableReservation
from .serializers import CategorySerializer, CoffeeItemSerializer, OrderSerializer, KnowledgeBaseSerializer, TableReservationSerializer
from .rag_engine import CoffeeSommelierRAG

class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

class CoffeeItemViewSet(viewsets.ModelViewSet):
    queryset = CoffeeItem.objects.all()
    serializer_class = CoffeeItemSerializer

    def get_queryset(self):
        queryset = CoffeeItem.objects.all()
        category = self.request.query_params.get('category', None)
        search = self.request.query_params.get('search', None)

        if category and category != 'all':
            queryset = queryset.filter(category__slug=category)
        if search:
            queryset = queryset.filter(
                models.Q(name__icontains=search) |
                models.Q(description__icontains=search) |
                models.Q(tasting_notes__icontains=search) |
                models.Q(origin__icontains=search) |
                models.Q(category__name__icontains=search) |
                models.Q(category__slug__icontains=search)
            )
        return queryset

class OrderViewSet(viewsets.ModelViewSet):
    serializer_class = OrderSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated:
            if user.role in ['MANAGER', 'ADMIN'] or user.is_superuser:
                return Order.objects.all().order_by('-created_at')
            return Order.objects.filter(user=user).order_by('-created_at')
        return Order.objects.all().order_by('-created_at') # Fallback to all if not auth, since guest might have orders in session, though frontend blocks it.

    def perform_create(self, serializer):
        if self.request.user.is_authenticated:
            serializer.save(user=self.request.user)
        else:
            serializer.save()

class SommelierRAGView(APIView):
    """
    AI RAG Coffee Sommelier Endpoint:
    Receives JSON: { "query": "user question" }
    Returns JSON: { "answer": "...", "recommendations": [...], "sources": [...] }
    """
    def post(self, request):
        query = request.data.get('query', '').strip()
        if not query:
            return Response({'error': 'Query string is required.'}, status=status.HTTP_400_BAD_REQUEST)

        rag = CoffeeSommelierRAG()
        result = rag.generate_response(query)
        return Response(result, status=status.HTTP_200_OK)

class AnalyticsAPIView(APIView):
    """Live revenue/throughput figures for the manager dashboard."""

    # Money counts only for orders that were actually paid for.
    PAID_STATUSES = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']
    CLOSED_STATUSES = ['COMPLETED', 'CANCELLED', 'REJECTED']

    def get(self, request):
        # Distinguish "we don't know who you are" from "we know, and you may not
        # see this". Conflating them made an expired access cookie look like a
        # permissions bug and stopped the frontend from ever attempting a token
        # refresh -- 401 is the signal the client retries on, 403 is terminal.
        if not request.user.is_authenticated:
            return Response(
                {'detail': 'Authentication credentials were not provided.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not request.user.is_manager_or_admin():
            return Response({'error': 'Manager permission required.'}, status=status.HTTP_403_FORBIDDEN)

        from django.db.models import Avg, Count
        from django.db.models.functions import TruncDate
        from django.utils import timezone as dj_timezone
        from apps.orders.models import Order as AppOrder

        now = dj_timezone.localtime()
        today = now.date()
        month_start = today.replace(day=1)

        paid_qs = AppOrder.objects.filter(status__in=self.PAID_STATUSES)

        daily_orders = paid_qs.filter(created_at__date=today)
        monthly_orders = paid_qs.filter(created_at__date__gte=month_start)

        daily_revenue = daily_orders.aggregate(total=Sum('total_amount_etb'))['total'] or 0
        monthly_revenue = monthly_orders.aggregate(total=Sum('total_amount_etb'))['total'] or 0

        avg_ticket = monthly_orders.aggregate(avg=Avg('total_amount_etb'))['avg'] or 0

        # Orders currently being worked on (not finished, not cancelled)
        live_orders = AppOrder.objects.exclude(status__in=self.CLOSED_STATUSES)
        in_kitchen = AppOrder.objects.filter(status__in=['ACCEPTED', 'PREPARING'])
        awaiting_payment = AppOrder.objects.filter(status='PENDING_PAYMENT').count()

        # Revenue for the last 7 days (oldest first) for the dashboard sparkline
        week_start = today - timedelta(days=6)
        weekly_rows = (
            paid_qs.filter(created_at__date__gte=week_start)
            .annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(revenue=Sum('total_amount_etb'), orders=Count('id'))
            .order_by('day')
        )
        weekly_map = {row['day']: row for row in weekly_rows}
        weekly = []
        for offset in range(7):
            day = week_start + timedelta(days=offset)
            row = weekly_map.get(day)
            weekly.append({
                'day': day.isoformat(),
                'revenue': float(row['revenue']) if row else 0.0,
                'orders': row['orders'] if row else 0,
            })

        # Revenue by payment method actually collected (settled payments only)
        from django.db.models import F
        from apps.payments.models import Payment
        method_rows = (
            Payment.objects.filter(status='SUCCESS')
            .values('payment_method')
            .annotate(revenue=Sum('amount_etb'), payments=Count('id'))
            .order_by('-revenue')
        )

        return Response({
            'generated_at': now.isoformat(),
            'daily_revenue': float(daily_revenue),
            'monthly_revenue': float(monthly_revenue),
            'daily_orders_count': daily_orders.count(),
            'monthly_orders_count': monthly_orders.count(),
            'average_order_value': float(avg_ticket),
            'live_orders_count': live_orders.count(),
            'in_kitchen_count': in_kitchen.count(),
            'awaiting_payment_count': awaiting_payment,
            'weekly': weekly,
            'by_payment_method': [
                {
                    'method': row['payment_method'],
                    'revenue': float(row['revenue']),
                    'payments': row['payments'],
                }
                for row in method_rows
            ],
        })

class TableReservationViewSet(viewsets.ModelViewSet):
    serializer_class = TableReservationSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated:
            if user.role in ['MANAGER', 'ADMIN'] or user.is_superuser:
                return TableReservation.objects.all().order_by('-created_at')
            return TableReservation.objects.filter(user=user).order_by('-created_at')
        return TableReservation.objects.none()

    def get_permissions(self):
        from rest_framework import permissions
        if self.action == 'create':
            return [permissions.IsAuthenticated()] # Only auth users can book now as requested
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        if self.request.user.is_authenticated:
            serializer.save(user=self.request.user)
        else:
            serializer.save()
