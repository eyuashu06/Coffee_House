from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db import models
from .models import Category, CoffeeItem, Order, KnowledgeBase
from .serializers import CategorySerializer, CoffeeItemSerializer, OrderSerializer, KnowledgeBaseSerializer
from .rag_engine import CoffeeSommelierRAG

class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

class CoffeeItemViewSet(viewsets.ReadOnlyModelViewSet):
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
    queryset = Order.objects.all().order_by('-created_at')
    serializer_class = OrderSerializer

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
