from rest_framework import status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.orders.serializers import DeliveryZoneSerializer
from .models import Cart
from .serializers import CartSerializer, CartItemSerializer, MergeSerializer, merge_items_into


def get_or_create_cart(user):
    """One cart per customer, created on first use."""
    cart, _ = Cart.objects.get_or_create(user=user)
    return cart


class CartView(APIView):
    """
    The customer's saved cart.

    The web app used to keep the cart in React state only: a refresh, a crashed tab or a
    different device threw the order away, and signing in did nothing to it. Everything
    here is per-user, so one customer's cart is never visible to another.
    """
    permission_classes = [permissions.IsAuthenticated]
    #: Named so the OpenAPI schema describes the response instead of skipping the view.
    serializer_class = CartSerializer

    def get(self, request):
        return Response(CartSerializer(get_or_create_cart(request.user)).data)

    def put(self, request):
        """Replace the whole cart with what the browser currently holds."""
        cart = get_or_create_cart(request.user)
        serializer = CartSerializer(cart, data=request.data, partial=False)
        serializer.is_valid(raise_exception=True)
        cart.items.all().delete()
        merge_items_into(cart, serializer.validated_data.get('items', []))
        return Response(CartSerializer(cart).data, status=status.HTTP_200_OK)


class CartItemView(APIView):
    """Add / change / remove a single line without resending the whole cart."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CartSerializer

    def post(self, request):
        """Add a line, or increase the quantity of an identical one already there."""
        cart = get_or_create_cart(request.user)
        serializer = CartItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        merge_items_into(cart, [serializer.validated_data])
        return Response(CartSerializer(cart).data, status=status.HTTP_201_CREATED)


class CartItemDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CartSerializer

    def patch(self, request, pk):
        cart = get_or_create_cart(request.user)
        line = cart.items.filter(pk=pk).first()
        if line is None:
            return Response(
                {'error': 'That item is not in your cart.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Quantity 0 means "remove this", so it is handled before validation (which
        # rightly rejects a quantity below 1 on create).
        if str(request.data.get('quantity')) in ('0', '-1'):
            line.delete()
            return Response(CartSerializer(cart).data, status=status.HTTP_200_OK)

        serializer = CartItemSerializer(line, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated = dict(serializer.validated_data)
        # add_ons and variant are replaced wholesale when supplied, not merged.
        if 'add_ons' in validated:
            line.add_ons.set(validated.pop('add_ons'))
        validated.pop('menu_item', None)
        for field, value in validated.items():
            setattr(line, field, value)
        line.save()
        return Response(CartSerializer(cart).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        cart = get_or_create_cart(request.user)
        line = cart.items.filter(pk=pk).first()
        if line is None:
            return Response(
                {'error': 'That item is not in your cart.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        line.delete()
        return Response(CartSerializer(cart).data, status=status.HTTP_200_OK)


class CartMergeView(APIView):
    """
    Sign-in hand-off: the guest's browser cart is folded into the account cart.

    Called right after login/register. Folding (not replacing) means a customer who
    already had a saved cart keeps it, and the guest lines are added on top.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CartSerializer

    def post(self, request):
        cart = get_or_create_cart(request.user)
        serializer = MergeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        merge_items_into(
            cart,
            serializer.validated_data.get('items', []),
            replace=serializer.validated_data.get('replace', False),
        )
        return Response(CartSerializer(cart).data, status=status.HTTP_200_OK)

    def delete(self, request):
        """Empty the cart (used after an order is placed)."""
        cart = get_or_create_cart(request.user)
        cart.items.all().delete()
        return Response(CartSerializer(cart).data, status=status.HTTP_200_OK)


class DeliveryZonesView(APIView):
    """
    Active delivery zones with their fees.

    The checkout form hardcoded a flat delivery order instead of asking which zone the
    customer is in, so the fee it charged was usually wrong.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        zones = DeliveryZoneSerializer(
            self._active_zones(), many=True, context={'request': request}
        )
        return Response(zones.data, status=status.HTTP_200_OK)

    @staticmethod
    def _active_zones():
        from apps.orders.models import DeliveryZone
        return DeliveryZone.objects.filter(is_active=True)