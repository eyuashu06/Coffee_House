from django.urls import path

from .views import (
    CartView,
    CartItemView,
    CartItemDetailView,
    CartMergeView,
)

urlpatterns = [
    path('cart/', CartView.as_view(), name='cart'),
    path('cart', CartView.as_view(), name='cart-noslash'),
    path('cart/items/', CartItemView.as_view(), name='cart-items'),
    path('cart/items', CartItemView.as_view(), name='cart-items-noslash'),
    path('cart/items/<int:pk>/', CartItemDetailView.as_view(), name='cart-item-detail'),
    path('cart/items/<int:pk>', CartItemDetailView.as_view(), name='cart-item-detail-noslash'),
    path('cart/merge/', CartMergeView.as_view(), name='cart-merge'),
    path('cart/merge', CartMergeView.as_view(), name='cart-merge-noslash'),
]