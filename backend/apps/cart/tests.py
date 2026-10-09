from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.cart.models import Cart, CartItem
from apps.cart.serializers import merge_items_into
from apps.menu.models import AddOn, Category, ItemVariant, MenuItem

User = get_user_model()


class CartTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = User.objects.create_user(
            username='cartcustomer', email='cart@coffeereceipts.com',
            phone='+251911555000', password='Password123!', role='CUSTOMER',
        )
        self.other = User.objects.create_user(
            username='othercustomer', email='other2@coffeereceipts.com',
            phone='+251911555111', password='Password123!', role='CUSTOMER',
        )
        self.client.force_authenticate(self.customer)

        category = Category.objects.create(name='Coffee', slug='coffee')
        self.latte = MenuItem.objects.create(
            name='Signature Latte', slug='signature-latte', description='Creamy',
            category=category, base_price_etb=Decimal('120.00'),
        )
        self.pour_over = MenuItem.objects.create(
            name='Pour Over', slug='pour-over', description='Clean cup',
            category=category, base_price_etb=Decimal('90.00'),
        )
        self.large = ItemVariant.objects.create(
            menu_item=self.latte, name='Large', price_modifier_etb=Decimal('30.00'),
        )
        self.oat = AddOn.objects.create(
            menu_item=self.latte, name='Oat Milk', price_etb=Decimal('25.00'),
        )
        # Same price, different drink: an add-on is only valid for the item it belongs to.
        self.unrelated_addon = AddOn.objects.create(
            menu_item=self.pour_over, name='Almond Milk', price_etb=Decimal('25.00'),
        )


class CartApiTests(CartTestBase):
    def test_cart_starts_empty_and_is_created_once(self):
        res = self.client.get('/api/v1/cart/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['items'], [])
        self.assertEqual(res.data['total_etb'], '0')
        first_id = res.data['id']

        second = self.client.get('/api/v1/cart/')
        self.assertEqual(second.data['id'], first_id)
        self.assertEqual(Cart.objects.filter(user=self.customer).count(), 1)

    def test_adding_a_line_prices_it_from_the_menu(self):
        res = self.client.post('/api/v1/cart/items/', {
            'menu_item_id': self.latte.id, 'quantity': 2,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(res.data['items']), 1)
        # 120 base x2 = 240. The client never sent a price.
        self.assertEqual(res.data['total_etb'], '240.00')
        self.assertEqual(res.data['item_count'], 2)

    def test_variant_and_add_on_are_priced_server_side(self):
        res = self.client.post('/api/v1/cart/items/', {
            'menu_item_id': self.latte.id,
            'variant_name': 'Large',
            'add_on_names': ['Oat Milk'],
            'quantity': 1,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        # 120 base + 30 large + 25 oat = 175
        self.assertEqual(res.data['total_etb'], '175.00')

    def test_client_supplied_price_is_ignored(self):
        res = self.client.post('/api/v1/cart/items/', {
            'menu_item_id': self.latte.id,
            'quantity': 1,
            'unit_price_etb': '1.00',
            'subtotal_etb': '1.00',
            'total_etb': '1.00',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['total_etb'], '120.00')

    def test_add_another_drink_adds_a_second_line(self):
        self.client.post('/api/v1/cart/items/', {'menu_item_id': self.latte.id, 'quantity': 1}, format='json')
        res = self.client.post('/api/v1/cart/items/', {'menu_item_id': self.pour_over.id, 'quantity': 1}, format='json')
        self.assertEqual(len(res.data['items']), 2)
        self.assertEqual(res.data['total_etb'], '210.00')

    def test_adding_an_identical_drink_increases_quantity(self):
        self.client.post('/api/v1/cart/items/', {
            'menu_item_id': self.latte.id, 'quantity': 1, 'variant_name': 'Large',
        }, format='json')
        res = self.client.post('/api/v1/cart/items/', {
            'menu_item_id': self.latte.id, 'quantity': 2, 'variant_name': 'Large',
        }, format='json')
        self.assertEqual(len(res.data['items']), 1)
        self.assertEqual(res.data['items'][0]['quantity'], 3)
        # 3 x (120 base + 30 large) = 450
        self.assertEqual(res.data['total_etb'], '450.00')

    def test_different_variant_is_a_separate_line(self):
        self.client.post('/api/v1/cart/items/', {
            'menu_item_id': self.latte.id, 'quantity': 1, 'variant_name': 'Large',
        }, format='json')
        res = self.client.post('/api/v1/cart/items/', {
            'menu_item_id': self.latte.id, 'quantity': 1,
        }, format='json')
        self.assertEqual(len(res.data['items']), 2)

    def test_add_on_not_offered_for_this_drink_is_dropped(self):
        res = self.client.post('/api/v1/cart/items/', {
            'menu_item_id': self.pour_over.id,
            'add_on_names': ['Oat Milk'],  # offered for the latte, not the pour over
            'quantity': 1,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['items'][0]['add_on_labels'], [])
        self.assertEqual(res.data['total_etb'], '90.00')

    def test_sold_out_drink_is_rejected(self):
        self.latte.is_available = False
        self.latte.save()
        res = self.client.post('/api/v1/cart/items/', {'menu_item_id': self.latte.id, 'quantity': 1}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CartItem.objects.exists())

    def test_unknown_drink_is_rejected(self):
        res = self.client.post('/api/v1/cart/items/', {'menu_item_id': 99999, 'quantity': 1}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_zero_quantity_line_is_rejected(self):
        res = self.client.post('/api/v1/cart/items/', {'menu_item_id': self.latte.id, 'quantity': 0}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_huge_quantity_is_rejected(self):
        res = self.client.post('/api/v1/cart/items/', {'menu_item_id': self.latte.id, 'quantity': 500}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_changing_quantity_via_patch(self):
        self.client.post('/api/v1/cart/items/', {'menu_item_id': self.latte.id, 'quantity': 1}, format='json')
        line_id = CartItem.objects.get().id
        res = self.client.patch(f'/api/v1/cart/items/{line_id}/', {'quantity': 4}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['total_etb'], '480.00')

    def test_setting_quantity_to_zero_removes_the_line(self):
        self.client.post('/api/v1/cart/items/', {'menu_item_id': self.latte.id, 'quantity': 2}, format='json')
        line_id = CartItem.objects.get().id
        res = self.client.patch(f'/api/v1/cart/items/{line_id}/', {'quantity': 0}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['items'], [])
        self.assertFalse(CartItem.objects.exists())

    def test_deleting_a_line(self):
        self.client.post('/api/v1/cart/items/', {'menu_item_id': self.latte.id, 'quantity': 1}, format='json')
        line_id = CartItem.objects.get().id
        res = self.client.delete(f'/api/v1/cart/items/{line_id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['items'], [])

    def test_cannot_touch_another_customers_cart_item(self):
        self.client.post('/api/v1/cart/items/', {'menu_item_id': self.latte.id, 'quantity': 1}, format='json')
        line_id = CartItem.objects.get().id

        self.client.force_authenticate(self.other)
        res = self.client.delete(f'/api/v1/cart/items/{line_id}/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(CartItem.objects.filter(pk=line_id).exists())

    def test_carts_are_per_user(self):
        self.client.post('/api/v1/cart/items/', {'menu_item_id': self.latte.id, 'quantity': 1}, format='json')
        self.client.force_authenticate(self.other)
        res = self.client.get('/api/v1/cart/')
        self.assertEqual(res.data['items'], [])

    def test_anonymous_caller_cannot_touch_a_cart(self):
        self.client.force_authenticate(user=None)
        for method, url in (
            ('get', '/api/v1/cart/'),
            ('post', '/api/v1/cart/items/'),
            ('post', '/api/v1/cart/merge/'),
        ):
            res = getattr(self.client, method)(url, {}, format='json')
            self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_emptying_the_cart(self):
        self.client.post('/api/v1/cart/items/', {'menu_item_id': self.latte.id, 'quantity': 1}, format='json')
        res = self.client.delete('/api/v1/cart/merge/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['items'], [])

    def test_put_replaces_the_whole_cart(self):
        self.client.post('/api/v1/cart/items/', {'menu_item_id': self.latte.id, 'quantity': 5}, format='json')
        res = self.client.put('/api/v1/cart/', {
            'items': [{'menu_item_id': self.pour_over.id, 'quantity': 1}],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['items']), 1)
        self.assertEqual(res.data['total_etb'], '90.00')


class CartMergeTests(CartTestBase):
    """Signing in must not throw the guest's browser cart away (FR-A4)."""

    def test_guest_lines_are_folded_into_the_saved_cart(self):
        cart = Cart.objects.create(user=self.customer)
        existing = CartItem.objects.create(cart=cart, menu_item=self.pour_over, quantity=1)

        res = self.client.post('/api/v1/cart/merge/', {
            'items': [{'menu_item_id': self.latte.id, 'quantity': 2}],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['items']), 2)
        self.assertEqual(res.data['total_etb'], '330.00')
        existing.refresh_from_db()
        self.assertEqual(existing.quantity, 1)

    def test_merge_combines_identical_lines(self):
        cart = Cart.objects.create(user=self.customer)
        CartItem.objects.create(cart=cart, menu_item=self.latte, variant=self.large, quantity=1)

        res = self.client.post('/api/v1/cart/merge/', {
            'items': [{
                'menu_item_id': self.latte.id, 'variant_name': 'Large', 'quantity': 2,
            }],
        }, format='json')
        self.assertEqual(len(res.data['items']), 1)
        self.assertEqual(res.data['items'][0]['quantity'], 3)

    def test_merge_keeps_temperature_and_milk_apart(self):
        res = self.client.post('/api/v1/cart/merge/', {
            'items': [
                {'menu_item_id': self.latte.id, 'quantity': 1, 'temperature': 'Hot', 'milk_choice': 'Oat Silk (Barista)'},
                {'menu_item_id': self.latte.id, 'quantity': 1, 'temperature': 'Iced', 'milk_choice': 'Oat Silk (Barista)'},
            ],
        }, format='json')
        self.assertEqual(len(res.data['items']), 2)

    def test_merge_with_replace_true_overwrites(self):
        cart = Cart.objects.create(user=self.customer)
        CartItem.objects.create(cart=cart, menu_item=self.pour_over, quantity=3)

        res = self.client.post('/api/v1/cart/merge/', {
            'replace': True,
            'items': [{'menu_item_id': self.latte.id, 'quantity': 1}],
        }, format='json')
        self.assertEqual(len(res.data['items']), 1)
        self.assertEqual(res.data['total_etb'], '120.00')

    def test_merge_rejects_sold_out_guest_lines(self):
        self.latte.is_available = False
        self.latte.save()
        res = self.client.post('/api/v1/cart/merge/', {
            'items': [{'menu_item_id': self.latte.id, 'quantity': 1}],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_merge_into_a_customer_without_a_cart_creates_one(self):
        self.assertFalse(Cart.objects.filter(user=self.other).exists())
        self.client.force_authenticate(self.other)
        res = self.client.post('/api/v1/cart/merge/', {
            'items': [{'menu_item_id': self.latte.id, 'quantity': 1}],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(Cart.objects.filter(user=self.other).count(), 1)


class CartPricingTests(CartTestBase):
    def test_pricing_helpers_match_the_serializer(self):
        cart = Cart.objects.create(user=self.customer)
        line = CartItem.objects.create(cart=cart, menu_item=self.latte, variant=self.large, quantity=2)
        line.add_ons.add(self.oat)
        self.assertEqual(line.get_unit_price_etb(), Decimal('175.00'))
        self.assertEqual(line.get_subtotal_etb(), Decimal('350.00'))
        self.assertEqual(cart.get_total_etb(), Decimal('350.00'))

    def test_merge_resolves_variant_by_name(self):
        cart = Cart.objects.create(user=self.customer)
        merge_items_into(cart, [{
            'menu_item': self.latte,
            'variant_name': 'Large',
            'quantity': 1,
            'temperature': 'Hot',
            'milk_choice': 'Oat Silk (Barista)',
            'notes': '',
        }])
        line = cart.items.get()
        self.assertEqual(line.variant, self.large)
        self.assertEqual(cart.get_total_etb(), Decimal('150.00'))

    def test_merge_ignores_a_variant_this_drink_does_not_have(self):
        cart = Cart.objects.create(user=self.customer)
        merge_items_into(cart, [{
            'menu_item': self.pour_over,
            'variant_name': 'Large',  # belongs to the latte
            'quantity': 1,
            'temperature': 'Hot',
            'milk_choice': 'Oat Silk (Barista)',
            'notes': '',
        }])
        line = cart.items.get()
        self.assertIsNone(line.variant)
        self.assertEqual(cart.get_total_etb(), Decimal('90.00'))