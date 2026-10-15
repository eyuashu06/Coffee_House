from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from api.models import (
    Category as LegacyCategory,
    CoffeeItem as LegacyCoffeeItem,
    Order as LegacyOrder,
    TableReservation,
)
from apps.assistant import reservations as reservation_rules

User = get_user_model()


@override_settings(
    ASSISTANT_RESERVATION_TABLES=2,
    ASSISTANT_RESERVATION_MAX_GUESTS=6,
    ASSISTANT_RESERVATION_SLOT_MINUTES=90,
)
class ReservationAvailabilityTests(TestCase):
    """
    The assistant always checked availability before booking. The web form did not,
    so anyone could double-book a slot the assistant had protected.
    """

    def setUp(self):
        self.client = APIClient()
        self.customer = User.objects.create_user(
            username='reservationcustomer', email='resv@coffeereceipts.com',
            phone='+251911000777', password='Password123!', role='CUSTOMER',
        )
        self.client.force_authenticate(self.customer)
        # Venue-local wall clock: bookings are stored and compared in cafe time
        # (Africa/Addis_Ababa), so fixtures must be local too.
        self.when = timezone.localtime(timezone.now() + timedelta(days=3)).replace(microsecond=0)

    def _payload(self, **overrides):
        payload = {
            'name': 'Liya Bekele',
            'date_time': self.when.isoformat(),
            'party_size': 2,
            'contact_phone': '+251911000888',
        }
        payload.update(overrides)
        return payload

    def test_booking_a_free_slot_succeeds(self):
        res = self.client.post('/api/v1/reservations/', self._payload(), format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TableReservation.objects.count(), 1)
        self.assertEqual(TableReservation.objects.get().user, self.customer)

    def test_booking_a_full_slot_is_rejected_with_alternatives(self):
        # Fill the two available tables for this slot.
        for index in range(2):
            TableReservation.objects.create(
                user=self.customer, name=f'Party {index}',
                date_time=self.when, party_size=2, contact_phone='+251911000999',
                status='CONFIRMED',
            )
        res = self.client.post('/api/v1/reservations/', self._payload(), format='json')
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('alternatives', res.data)
        self.assertEqual(TableReservation.objects.count(), 2)

    def test_party_larger_than_a_table_seats_is_rejected(self):
        res = self.client.post('/api/v1/reservations/', self._payload(party_size=9), format='json')
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('6 guests', ' '.join(res.data['date_time']))

    def test_cancelled_reservations_do_not_block_a_slot(self):
        TableReservation.objects.create(
            user=self.customer, name='Cancelled party', date_time=self.when,
            party_size=2, contact_phone='+251911000999', status='CANCELLED',
        )
        res = self.client.post('/api/v1/reservations/', self._payload(), format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_past_datetime_is_rejected(self):
        past = timezone.now() - timedelta(days=1)
        res = self.client.post('/api/v1/reservations/', self._payload(date_time=past.isoformat()), format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_malformed_datetime_is_rejected(self):
        res = self.client.post('/api/v1/reservations/', self._payload(date_time='next tuesday'), format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_datetime_is_rejected(self):
        res = self.client.post('/api/v1/reservations/', self._payload(date_time=''), format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_availability_endpoint_reports_free_slot(self):
        res = self.client.get(
            '/api/v1/reservations/availability/',
            {'date': self.when.date().isoformat(), 'time': self.when.strftime('%H:%M'), 'guests': 2},
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['available'])

    def test_availability_endpoint_reports_full_slot_with_alternatives(self):
        for index in range(2):
            TableReservation.objects.create(
                user=self.customer, name=f'Party {index}', date_time=self.when,
                party_size=2, contact_phone='+251911000999', status='CONFIRMED',
            )
        res = self.client.get(
            '/api/v1/reservations/availability/',
            {'date': self.when.date().isoformat(), 'time': self.when.strftime('%H:%M'), 'guests': 2},
        )
        self.assertFalse(res.data['available'])
        self.assertEqual(res.data['reason'], 'fully_booked')
        self.assertIn('alternatives', res.data)

    def test_availability_endpoint_rejects_bad_guest_count(self):
        res = self.client.get(
            '/api/v1/reservations/availability/',
            {'date': self.when.date().isoformat(), 'time': self.when.strftime('%H:%M'), 'guests': 'lots'},
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_alternative_suggestions_are_actually_free(self):
        for index in range(2):
            TableReservation.objects.create(
                user=self.customer, name=f'Party {index}', date_time=self.when,
                party_size=2, contact_phone='+251911000999', status='CONFIRMED',
            )
        suggestions = reservation_rules.suggest_alternative_times(
            self.when.date().isoformat(), self.when.strftime('%H:%M'), 2,
        )
        self.assertTrue(suggestions)
        for suggestion in suggestions:
            ok, _reason = reservation_rules.check_availability(
                self.when.date().isoformat(), suggestion, 2,
            )
            self.assertTrue(ok, f'{suggestion} was suggested but is not free')

    def test_anonymous_caller_cannot_book(self):
        self.client.force_authenticate(user=None)
        res = self.client.post('/api/v1/reservations/', self._payload(), format='json')
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.assertFalse(TableReservation.objects.exists())


class LegacyOrderLeakTests(TestCase):
    """The legacy /orders/ endpoint used to hand every order to anonymous callers."""

    def setUp(self):
        self.client = APIClient()
        self.customer = User.objects.create_user(
            username='legacycustomer', email='legacy@coffeereceipts.com',
            phone='+251911000123', password='Password123!', role='CUSTOMER',
        )
        LegacyOrder.objects.create(
            user=self.customer,
            customer_name='Selam Bekele',
            customer_email='legacy@coffeereceipts.com',
            total_amount=Decimal('200.00'),
            status='PENDING',
        )

    def test_anonymous_caller_sees_no_orders(self):
        # Reads are open to anonymous callers (global IsAuthenticatedOrReadOnly), so the
        # protection is the queryset: it used to fall back to Order.objects.all().
        res = self.client.get('/api/v1/legacy-orders/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['results'], [])
        self.assertEqual(LegacyOrder.objects.count(), 1)

    def test_customer_sees_only_their_own_orders(self):
        other = User.objects.create_user(
            username='othercustomer', email='other@coffeereceipts.com',
            phone='+251911000456', password='Password123!', role='CUSTOMER',
        )
        LegacyOrder.objects.create(
            user=other,
            customer_name='Marta Tesfaye',
            customer_email='other@coffeereceipts.com',
            total_amount=Decimal('300.00'),
            status='PENDING',
        )
        self.client.force_authenticate(self.customer)
        res = self.client.get('/api/v1/legacy-orders/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        names = [row['customer_name'] for row in res.data['results']]
        self.assertEqual(names, ['Selam Bekele'])

    def test_manager_sees_every_legacy_order(self):
        manager = User.objects.create_user(
            username='legacymanager', email='legacymanager@coffeereceipts.com',
            phone='+251911000999', password='Password123!', role='MANAGER',
        )
        self.client.force_authenticate(manager)
        res = self.client.get('/api/v1/legacy-orders/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['results']), 1)

class LegacyEndpointWritePermissionsTests(TestCase):
    """
    The legacy tables are seeded, not edited by customers.

    `CoffeeItemViewSet` and `OrderViewSet` are bare `ModelViewSet`s with no
    `permission_classes`, so they fell through to the project default
    `IsAuthenticatedOrReadOnly` - a rule written for the live endpoints, where every
    view overrides it per action. Anything signed in could therefore create rows in
    `api.CoffeeItem` and `api.Order`, and this app resolves no prices server-side, so
    the amount was whatever the browser sent. `apps.orders` recomputes every price;
    `apps.menu` already scopes its writes to managers. The legacy surface did not,
    and nothing needs it to.
    """

    def setUp(self):
        self.client = APIClient()
        self.customer = User.objects.create_user(
            username='legacycustomer', email='legacycustomer@coffeereceipts.com',
            phone='+251911000060', password='Password123!', role='CUSTOMER')
        self.manager = User.objects.create_user(
            username='legacymanager', email='legacymanager@coffeereceipts.com',
            phone='+251911000061', password='Password123!', role='MANAGER')

    def test_a_customer_cannot_create_a_legacy_coffee(self):
        category = LegacyCategory.objects.create(name='Free', slug='free')
        self.client.force_authenticate(self.customer)
        res = self.client.post('/api/v1/coffees/', {
            'name': 'Injected', 'category': category.id, 'price': '1.00',
            'description': 'x', 'image_url': 'https://example.org/x.png',
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(LegacyCoffeeItem.objects.filter(name='Injected').exists())

    def test_a_customer_cannot_create_a_legacy_order(self):
        self.client.force_authenticate(self.customer)
        res = self.client.post('/api/v1/legacy-orders/', {
            'customer_name': 'Someone Else', 'customer_email': 'victim@example.org',
            'total_amount': '9999.00',
            'items': [{'quantity': 1, 'unit_price': '9999.00'}],
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(LegacyOrder.objects.filter(customer_name='Someone Else').exists())

    def test_a_customer_cannot_delete_a_legacy_coffee(self):
        coffee = LegacyCoffeeItem.objects.create(
            name='Protected', category=LegacyCategory.objects.create(
                name='Beans', slug='beans'),
            price='10.00', description='x', image_url='https://example.org/x.png')

        self.client.force_authenticate(self.customer)
        res = self.client.delete(f'/api/v1/coffees/{coffee.id}/')

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(LegacyCoffeeItem.objects.filter(pk=coffee.pk).exists())

    def test_a_manager_can_still_write(self):
        category = LegacyCategory.objects.create(name='Beans', slug='beans')
        self.client.force_authenticate(self.manager)
        res = self.client.post('/api/v1/coffees/', {
            'name': 'Staff Blend', 'category': category.id, 'price': '85.00',
            'description': 'Added by staff', 'image_url': 'https://example.org/x.png',
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(LegacyCoffeeItem.objects.filter(name='Staff Blend').exists())

    def test_reading_the_legacy_menu_is_still_public(self):
        LegacyCoffeeItem.objects.create(
            name='Public', category=LegacyCategory.objects.create(
                name='Beans', slug='beans2'),
            price='10.00', description='x', image_url='https://example.org/x.png')

        res = self.client.get('/api/v1/coffees/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['results'])

    def test_reading_someone_elses_legacy_orders_is_still_refused(self):
        other = User.objects.create_user(
            username='legacyother', email='legacyother@coffeereceipts.com',
            password='Password123!')
        LegacyOrder.objects.create(user=other, customer_name='Other', total_amount=50)

        self.client.force_authenticate(self.customer)
        res = self.client.get('/api/v1/legacy-orders/')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 0)
