from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db import models
from django.db.models import Sum
from datetime import date
from .models import Category, CoffeeItem, Order, KnowledgeBase
from .serializers import CategorySerializer, CoffeeItemSerializer, OrderSerializer, KnowledgeBaseSerializer
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
    def get(self, request):
        if not request.user.is_authenticated or request.user.role not in ['MANAGER', 'ADMIN']:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
        
        today = date.today()
        month_start = today.replace(day=1)
        
        daily_orders = Order.objects.filter(status='COMPLETED', created_at__date=today)
        monthly_orders = Order.objects.filter(status='COMPLETED', created_at__date__gte=month_start)
        
        daily_revenue = daily_orders.aggregate(total=Sum('total_amount'))['total'] or 0
        monthly_revenue = monthly_orders.aggregate(total=Sum('total_amount'))['total'] or 0
        
        return Response({
            'daily_revenue': float(daily_revenue),
            'monthly_revenue': float(monthly_revenue),
            'daily_orders_count': daily_orders.count(),
            'monthly_orders_count': monthly_orders.count()
        })
