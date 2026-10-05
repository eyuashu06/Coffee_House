"""
Backend tests for the Coffee House RAG assistant.

Covers the acceptance scenarios: menu, prices, availability, Amharic, mixed
language, reservations (including availability + confirmation rules),
hallucination attempts, out-of-scope questions and error safety.
"""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from django.utils.text import slugify

from api.models import TableReservation
from apps.assistant.engine import answer_query
from apps.assistant.views import AssistantMessageView, AssistantQuickActionsView
from apps.menu.models import AddOn, Category, ItemVariant, MenuItem
from apps.orders.models import RestaurantSettings
from django.test import RequestFactory
from rest_framework.test import force_authenticate


class AssistantTestBase(TestCase):
    """Self-contained fixtures so the suite does not depend on dev seed data."""

    # (item name, category slug, category name, price, description)
    FIXTURES = [
        ('Yirgacheffe Grade 1', 'micro-lot-coffee', 'Micro-Lot Coffee', 350,
         'Jasmine, peach and black tea notes.'),
        ('Smoked Cardamom Cappuccino', 'espresso-infusions', 'Espresso & Infusions', 280,
         'Espresso with steamed milk and cardamom.'),
        ('Masala Chai Latte', 'premium-tea', 'Premium Tea', 200,
         'Assam black tea simmered with whole spices and steamed milk.'),
        ('Moroccan Mint Green Tea', 'premium-tea', 'Premium Tea', 160,
         'Fresh mint leaves steeped in green tea.'),
        ('Margherita Classica', 'wood-fired-pizza', 'Wood-Fired Pizza', 580,
         'Tomato, mozzarella and basil.'),
        ('Reserve Wagyu Smash Burger', 'artisanal-burgers', 'Artisanal Burgers', 650,
         'Wagyu beef, aged cheese and house sauce.'),
        ('Croissant au Beurre', 'bakery-pastry', 'Bakery & Pastry', 120,
         'Buttery French pastry.'),
    ]

    def setUp(self):
        RestaurantSettings.get_settings()
        for name, slug, category_name, price, description in self.FIXTURES:
            category, _ = Category.objects.get_or_create(
                slug=slug, defaults={'name': category_name, 'icon': 'local_cafe'})
            MenuItem.objects.get_or_create(
                slug=slugify(name),
                defaults={'name': name, 'category': category, 'base_price_etb': price,
                          'description': description, 'is_available': True},
            )
        self.assertTrue(MenuItem.objects.exists())

    def ask(self, query, session_id=None, user=None):
        return answer_query(query, session_id=session_id, user=user)

    def en(self, result):
        return result['answer_en']

    def am(self, result):
        return result['answer_am']


class MenuRetrievalTests(AssistantTestBase):
    def test_asks_what_coffees_exist(self):
        r = self.ask('What coffees do you have?')
        self.assertTrue(r['items'], 'expected menu items')
        self.assertIn('Micro-Lot', r['answer_en'] + ' '.join(i['name'] for i in r['items']))
        self.assertTrue(r['answer_am'])

    def test_lists_food(self):
        r = self.ask('Show me food')
        self.assertTrue(r['items'])

    def test_lists_drinks(self):
        r = self.ask('What drinks are available?')
        self.assertTrue(r['items'])

    def test_price_is_from_database(self):
        item = MenuItem.objects.filter(name__icontains='Chai').first()
        r = self.ask(f'How much is {item.name}?')
        self.assertIn('200', r['answer_en'].replace('.00', ''))
        self.assertEqual(r['intent'], 'price')

    def test_ingredients_answer(self):
        item = MenuItem.objects.filter(name__icontains='Chai').first()
        r = self.ask(f'What ingredients are in {item.name}?')
        self.assertTrue(r['answer_en'])
        self.assertTrue(r['answer_am'])

    def test_tea_category_amharic(self):
        r = self.ask('ምን አይነት ሻይ አላችሁ?')
        self.assertTrue(r['items'])
        names = ' '.join(i['name'] for i in r['items'])
        self.assertTrue(any(k in names for k in ('Tea', 'Chai', 'Mint', 'Hibiscus')))

    def test_do_you_have_tea(self):
        r = self.ask('Do you have tea?')
        self.assertTrue(r['answer_en'])
        self.assertNotIn("don't have that information", r['answer_en'].lower())


class AmharicAndMixedTests(AssistantTestBase):
    def test_amharic_price_question(self):
        r = self.ask('ምን አይነት ቡና አላችሁ?')
        self.assertEqual(r['language'], 'am')
        self.assertTrue(r['answer_en'])
        self.assertTrue(r['answer_am'])

    def test_amharic_cappuccino_price(self):
        r = self.ask('Cappuccino ዋጋው ስንት ነው?')
        self.assertTrue(r['answer_en'])
        self.assertTrue(r['answer_am'])
        self.assertIn('280', r['answer_en'])

    def test_mixed_language_reservation(self):
        r = self.ask('Tomorrow ለ4 ሰው reservation እፈልጋለሁ')
        self.assertEqual(r['intent'], 'reservation_create')

    def test_every_answer_has_both_languages(self):
        for q in ['What coffee do you have?', 'ምን አይነት ቡና አላችሁ?', 'What are your opening hours?',
                  'Where are you located?', 'Hello']:
            r = self.ask(q)
            self.assertTrue(r['answer_en'], q)
            self.assertTrue(r['answer_am'], q)


class HallucinationTests(AssistantTestBase):
    def test_unknown_item_is_not_invented(self):
        r = self.ask('How much is the Unicorn Latte?')
        self.assertIn("don't have that information", r['answer_en'].lower())
        self.assertIn('የለኝም', r['answer_am'])
        self.assertEqual(r['items'], [])

    def test_no_fake_signature_items(self):
        """The old engine invented these; they must never reappear."""
        r = self.ask('recommend a coffee for me')
        text = r['answer_en'].lower()
        for ghost in ['geisha', 'panama boquete', 'sumatra', 'blue batak', 'kyoto', 'cold drip']:
            self.assertNotIn(ghost, text)

    def test_fictional_specifics_are_refused(self):
        r = self.ask('Does Buna Hub sell Truffle Wagyu Pizza with 25% student discount?')
        self.assertNotIn('discount', r['answer_en'].lower())

    def test_price_never_invented_for_unknown(self):
        r = self.ask('price of chocolate lava supernova')
        self.assertNotIn('Br', r['answer_en'])
        self.assertEqual(r['items'], [])


class OutOfScopeTests(AssistantTestBase):
    def test_coding_question_redirected(self):
        r = self.ask('Write me Python code to sort a list')
        self.assertIn("Coffee House", r['answer_en'])
        self.assertTrue(r['answer_am'])

    def test_politics_redirected(self):
        r = self.ask('Who is the president?')
        self.assertIn("Coffee House", r['answer_en'])

    def test_joke_request_redirected(self):
        r = self.ask('Tell me a joke')
        self.assertIn("Coffee House", r['answer_en'])

    def test_amharic_out_of_scope(self):
        r = self.ask('ፕሮግራም ኮድ ስጻፍኝ')
        self.assertIn("Coffee House", r['answer_en'])


class ReservationTests(AssistantTestBase):
    def test_collects_missing_details(self):
        r = self.ask('I want to reserve a table', session_id='s1')
        self.assertEqual(r['action']['action'], 'collect_reservation_details')
        self.assertIn('name', r['action']['missing'])

    def test_full_reservation_is_created_and_confirmed(self):
        tomorrow = (timezone.localtime() + timedelta(days=1)).strftime('%Y-%m-%d')
        r = self.ask(
            f'Reserve a table for 4 people tomorrow at 6 PM, my name is Eyuel',
            session_id='s2')
        self.assertEqual(r['action']['action'], 'reservation_created')
        self.assertTrue(r['reservations'])
        self.assertIn('confirmed', r['answer_en'].lower() + r['answer_am'])
        self.assertEqual(TableReservation.objects.filter(name='Eyuel', party_size=4).count(), 1)

    def test_confirmation_requires_backend_success(self):
        tomorrow = (timezone.localtime() + timedelta(days=1)).strftime('%Y-%m-%d')
        r = self.ask(f'book for 2 people on {tomorrow} at 7 PM name is Selam', session_id='s3')
        # Either created (with a reservation object) or refused - never "confirmed" without one.
        if r['action']['action'] == 'reservation_created':
            self.assertTrue(r['reservations'])
        else:
            self.assertNotIn('has been confirmed', r['answer_en'].lower())

    def test_unavailable_time_suggests_alternatives(self):
        tomorrow = (timezone.localtime() + timedelta(days=1)).strftime('%Y-%m-%d')
        # Fill every table at 18:00
        slot = timezone.make_aware(
            timezone.datetime.strptime(f'{tomorrow}T18:00:00', '%Y-%m-%dT%H:%M:%S'))
        for i in range(4):
            TableReservation.objects.create(
                name=f'Party {i}', party_size=2, date_time=slot, status='CONFIRMED')

        r = self.ask(f'I need a table for 2 tomorrow at 6 PM, name is Hana', session_id='s4')
        self.assertEqual(r['action']['action'], 'suggest_alternative_time')
        self.assertIn('not available', r['answer_en'].lower())
        self.assertFalse(TableReservation.objects.filter(name='Hana').exists())

    def test_large_party_is_refused(self):
        tomorrow = (timezone.localtime() + timedelta(days=1)).strftime('%Y-%m-%d')
        r = self.ask(f'table for 30 people tomorrow at 5 PM name is Big', session_id='s5')
        self.assertNotEqual(r['action']['action'], 'reservation_created')
        self.assertFalse(TableReservation.objects.filter(name='Big').exists())

    def test_past_date_is_refused(self):
        yesterday = (timezone.localtime() - timedelta(days=1)).strftime('%Y-%m-%d')
        r = self.ask(f'table for 2 yesterday at 5 PM name is Past', session_id='s6')
        self.assertFalse(TableReservation.objects.filter(name='Past').exists())

    def test_cancel_requires_lookup(self):
        r = self.ask('Cancel my reservation', session_id='s7')
        self.assertEqual(r['action']['action'], 'collect_reservation_lookup')

    def test_cancel_removes_active_reservation(self):
        res = TableReservation.objects.create(
            name='Mika', party_size=2,
            date_time=timezone.localtime() + timedelta(days=2), status='CONFIRMED')
        r = self.ask('cancel my reservation, name is Mika', session_id='s8')
        res.refresh_from_db()
        self.assertEqual(res.status, 'CANCELLED')
        self.assertEqual(r['action']['action'], 'reservation_cancelled')

    def test_reservation_status_lookup(self):
        TableReservation.objects.create(
            name='Tola', party_size=3,
            date_time=timezone.localtime() + timedelta(days=3), status='CONFIRMED')
        r = self.ask('my reservation status, name is Tola', session_id='s9')
        self.assertTrue(r['reservations'])


class AvailabilityTests(AssistantTestBase):
    def test_unavailable_item_is_marked(self):
        item = MenuItem.objects.first()
        item.is_available = False
        item.save(update_fields=['is_available'])
        try:
            r = self.ask(f'Is {item.name} available?')
            self.assertIn('unavailable', r['answer_en'].lower())
        finally:
            item.is_available = True
            item.save(update_fields=['is_available'])

    def test_todays_menu_reflects_database(self):
        r = self.ask("what's available today?")
        available = MenuItem.objects.filter(is_available=True).count()
        self.assertTrue(r['items'])
        self.assertLessEqual(len(r['items']), available)


class VenueInfoTests(AssistantTestBase):
    def test_hours_come_from_settings(self):
        venue = RestaurantSettings.get_settings()
        r = self.ask('What are your opening hours?')
        self.assertIn(venue.opening_hours.split(':')[0], r['answer_en'])

    def test_location_comes_from_settings(self):
        venue = RestaurantSettings.get_settings()
        r = self.ask('Where are you located?')
        self.assertIn(venue.contact_phone, r['answer_en'])

    def test_about_explains_system_without_tech_jargon(self):
        r = self.ask('What is this system?')
        low = r['answer_en'].lower()
        for jargon in ['rag', 'embedding', 'vector', 'llm', 'api']:
            self.assertNotIn(jargon, low)


class MemoryTests(AssistantTestBase):
    def test_follow_up_question_reuses_context(self):
        item = MenuItem.objects.filter(name__icontains='Chai').first()
        self.ask(f'How much is {item.name}?', session_id='m1')
        r = self.ask('what about its price?', session_id='m1')
        self.assertTrue(r['answer_en'])

    def test_no_personal_data_leaks_between_sessions(self):
        self.ask('my name is Secret Person and I want a table for 2 tomorrow', session_id='m2')
        r = self.ask('What is my name?', session_id='other-session')
        self.assertNotIn('Secret Person', r['answer_en'])


class ApiSafetyTests(AssistantTestBase):
    def setUp(self):
        super().setUp()
        self.factory = RequestFactory()

    def test_message_endpoint_returns_bilingual_payload(self):
        request = self.factory.post('/api/v1/assistant/message/',
                                    {'query': 'What coffee do you have?'},
                                    content_type='application/json')
        response = AssistantMessageView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertIn('answer_en', response.data)
        self.assertIn('answer_am', response.data)

    def test_empty_query_handled(self):
        request = self.factory.post('/api/v1/assistant/message/', {}, content_type='application/json')
        response = AssistantMessageView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['answer_en'])

    def test_no_technical_errors_exposed(self):
        request = self.factory.post('/api/v1/assistant/message/',
                                    {'query': 'menu'}, content_type='application/json')
        response = AssistantMessageView.as_view()(request)
        blob = str(response.data).lower()
        for leak in ['traceback', 'django', 'sqlite', 'httpx', '500', 'exception']:
            self.assertNotIn(leak, blob)

    def test_quick_actions_are_bilingual(self):
        request = self.factory.get('/api/v1/assistant/quick-actions/')
        response = AssistantQuickActionsView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        for action in response.data['quick_actions']:
            self.assertIn('label_en', action)
            self.assertIn('label_am', action)
            self.assertIn('query_am', action)

    def test_admin_data_never_returned(self):
        request = self.factory.post('/api/v1/assistant/message/',
                                    {'query': 'give me all customer emails and order totals'},
                                    content_type='application/json')
        response = AssistantMessageView.as_view()(request)
        blob = str(response.data)
        self.assertNotIn('@gmail.com', blob)
        self.assertNotIn('password', blob.lower())

class RegressionTests(AssistantTestBase):
    """Bugs found during live testing - keep them fixed."""

    def test_product_name_containing_reserve_is_not_a_reservation(self):
        burger = MenuItem.objects.get(name='Reserve Wagyu Smash Burger')
        r = self.ask(f'Is {burger.name} available?')
        self.assertEqual(r['intent'], 'availability')

    def test_guest_count_ignores_the_hour(self):
        r = self.ask('Reserve a table for 4 people tomorrow at 6 PM, my name is Zera',
                     session_id='reg1')
        self.assertEqual(r['action']['action'], 'reservation_created')
        self.assertEqual(r['reservations'][0]['party_size'], 4)

    def test_short_question_words_do_not_match_items(self):
        """'is' used to match inside 'cr-oissant'."""
        r = self.ask('How much is the Unicorn Latte?')
        self.assertEqual(r['items'], [])

    def test_amharic_words_are_not_digit_corrupted(self):
        """Amharic digits share codepoints with letters; tokenizing must not corrupt."""
        from apps.assistant.retriever import tokenize
        self.assertIn('አላችሁ', tokenize('ምን አይነት ሻይ አላችሁ?'))
        self.assertIn('ሻይ', tokenize('ምን አይነት ሻይ አላችሁ?'))

    def test_reservation_continuity_without_keyword(self):
        self.ask('I want to reserve a table', session_id='reg2')
        r = self.ask('tomorrow at 7 PM for 2 people, name is Hana', session_id='reg2')
        self.assertEqual(r['action']['action'], 'reservation_created')

    def test_amharic_cancel_is_detected(self):
        TableReservation.objects.create(
            name='Mika', party_size=2,
            date_time=timezone.localtime() + timedelta(days=2), status='CONFIRMED')
        r = self.ask('ቦታ ማስያዣዬን መሰረዝ', session_id='reg3')
        self.assertEqual(r['intent'], 'reservation_cancel')

    def test_category_browse_for_amharic_question(self):
        r = self.ask('ምን አይነት ሻይ አላችሁ?')
        self.assertTrue(r['items'])

    def test_all_in_one_message_without_reserve_keyword(self):
        """A full booking in one sentence never says 'reserve' - it still books."""
        r = self.ask('name abebe, date tommorow at 9 morning, with 10 guests',
                     session_id='reg4')
        self.assertEqual(r['action']['action'], 'reservation_created')
        self.assertEqual(r['reservations'][0]['party_size'], 10)
        self.assertEqual(r['reservations'][0]['time'], '09:00')

    def test_misspelled_tomorrow_is_understood(self):
        r = self.ask('book a table for Hana tommorrow at 7 evening for 2 people',
                     session_id='reg5')
        self.assertEqual(r['action']['action'], 'reservation_created')
        self.assertEqual(r['reservations'][0]['time'], '19:00')

    def test_day_part_times_are_parsed(self):
        for phrase, expected in (('9 morning', '09:00'), ('3 afternoon', '15:00'),
                                 ('7 evening', '19:00'), ('noon', '12:00')):
            with self.subTest(phrase=phrase):
                from apps.assistant.retriever import _extract_date_and_time
                _, time_str = _extract_date_and_time(f'tomorrow at {phrase}')
                self.assertEqual(time_str, expected)

    def test_amharic_time_after_the_hour(self):
        """'ከ6 ሰዓት' is 6 o'clock - the hour used to be read as a party size."""
        from apps.assistant.retriever import _extract_date_and_time, _extract_guests
        r = self.ask('ለካቲ ቦታ እፈልጋለሁ ነገ ከ6 ሰዓት', session_id='reg6')
        self.assertEqual(r['action']['action'], 'collect_reservation_details')
        _, time_str = _extract_date_and_time('ነገ ከ6 ሰዓት')
        self.assertEqual(time_str, '06:00')
        self.assertIsNone(_extract_guests('ነገ ከ6 ሰዓት'))

    def test_ethiopic_prefixed_colon_time(self):
        """'ከ18:00' - \\b cannot match between an Ethiopic letter and a digit."""
        from apps.assistant.retriever import _extract_date_and_time
        _, time_str = _extract_date_and_time('ነገ ከ18:00')
        self.assertEqual(time_str, '18:00')

    def test_bare_followups_do_not_break_the_booking_flow(self):
        """Each answer must be one field, not a restart of the whole form."""
        self.ask('I want to reserve a table', session_id='reg7')
        self.ask('name is Hana', session_id='reg7')
        r = self.ask('tomorrow', session_id='reg7')
        self.assertEqual(r['action']['action'], 'collect_reservation_details')
        r = self.ask('9am', session_id='reg7')
        self.assertEqual(r['action']['action'], 'collect_reservation_details')
        r = self.ask('for 3 people', session_id='reg7')
        self.assertEqual(r['action']['action'], 'reservation_created')

    def test_open_booking_keeps_collecting_until_complete(self):
        """A partial follow-up must never answer 'no such information'."""
        self.ask('reserve a table for abebe tomorrow', session_id='reg8')
        for follow in ('tomorrow', '9am'):
            r = self.ask(follow, session_id='reg8')
            self.assertEqual(r['action']['action'], 'collect_reservation_details')
            self.assertNotIn('don\'t have', r['answer_en'].lower())

    def test_bare_number_is_not_treated_as_a_booking(self):
        """A lone digit or a bare 'today' must not trigger the booking shortcut."""
        self.assertEqual(self.ask('9', session_id='reg9')['intent'], 'unknown_item')
        self.assertEqual(self.ask('today', session_id='reg10')['intent'], 'unknown_item')
        # A real menu question must still be answered as a menu question.
        r = self.ask('what teas do you have?', session_id='reg11')
        self.assertTrue(r['items'])


class BrowseVersusProductTests(AssistantTestBase):
    """A category word that is also an item name must resolve by wording."""

    def test_plural_category_word_lists_the_category(self):
        r = self.ask('what burgers do you have?')
        self.assertEqual(r['intent'], 'menu_list')
        # every returned item must belong to the burgers category
        self.assertTrue(r['items'])
        self.assertTrue(all(i['category_slug'] == 'artisanal-burgers' for i in r['items']))

    def test_singular_item_name_gives_the_price(self):
        r = self.ask('Cappuccino ዋጋው ስንት ነው?')
        self.assertEqual(r['intent'], 'price')
        self.assertEqual(r['items'][0]['name'], 'Smoked Cardamom Cappuccino')

    def test_amharic_diet_question(self):
        r = self.ask('የአጥር ምግብ አላችሁ?')
        self.assertEqual(r['intent'], 'diet')
        self.assertTrue(r['items'])

    def test_english_diet_question(self):
        r = self.ask('Do you have vegetarian food?')
        self.assertEqual(r['intent'], 'diet')

    def test_availability_of_unknown_product_is_not_answered_with_the_menu(self):
        r = self.ask('Is the Sunday Machine available?')
        self.assertEqual(r['intent'], 'unknown_item')
        self.assertEqual(r['items'], [])
        self.assertIn("don't have that information", r['answer_en'])


class OrderPricingTests(TestCase):
    """Option pricing must be resolved server-side, never trusted from the client."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIRequestFactory
        from apps.orders.views import OrderViewSet
        from apps.menu.models import AddOn, Category, ItemVariant, MenuItem
        from django.utils.text import slugify

        self.factory = APIRequestFactory()
        self.view = OrderViewSet.as_view({'post': 'create'})
        self.user = get_user_model().objects.create_user(
            username='payer', email='payer@gmail.com', password='x')

        category, _ = Category.objects.get_or_create(
            slug='micro-lot-coffee', defaults={'name': 'Micro-Lot Coffee'})
        self.item = MenuItem.objects.create(
            name='Test Coffee', slug=slugify('Test Coffee'), category=category,
            base_price_etb=Decimal('300.00'), description='test', is_available=True)
        ItemVariant.objects.create(menu_item=self.item, name='250ml', price_modifier_etb=Decimal('0.00'))
        ItemVariant.objects.create(menu_item=self.item, name='400ml Large', price_modifier_etb=Decimal('80.00'))
        AddOn.objects.create(menu_item=self.item, name='Extra Espresso Shot', price_etb=Decimal('70.00'))

    def order(self, item_payload):
        request = self.factory.post('/api/v1/orders/', item_payload, format='json')
        force_authenticate(request, user=self.user)
        return self.view(request)

    def test_variant_and_addons_are_priced_from_the_menu(self):
        res = self.order({'order_type': 'PICKUP', 'items': [{
            'menu_item': self.item.id, 'quantity': 2, 'variant_name': '400ml Large',
            'add_ons': [{'add_on_name': 'Extra Espresso Shot'}]}]})
        self.assertEqual(res.status_code, 201, res.data)
        # 300 base + 80 variant + 70 add-on = 450 per unit, x2 = 900
        self.assertEqual(Decimal(res.data['total_amount_etb']), Decimal('900.00'))
        self.assertEqual(Decimal(res.data['items'][0]['unit_price_etb']), Decimal('450.00'))

    def test_client_cannot_inflate_prices(self):
        res = self.order({'order_type': 'PICKUP', 'items': [{
            'menu_item': self.item.id, 'quantity': 1, 'unit_price_etb': '1.00'}]})
        self.assertEqual(Decimal(res.data['total_amount_etb']), Decimal('300.00'))

    def test_unknown_variant_and_addon_are_ignored(self):
        res = self.order({'order_type': 'PICKUP', 'items': [{
            'menu_item': self.item.id, 'quantity': 1,
            'variant_name': 'Free Infinite Size', 'add_ons': [{'add_on_name': 'Free Steak'}]}]})
        self.assertEqual(Decimal(res.data['total_amount_etb']), Decimal('300.00'))
        self.assertEqual(res.data['items'][0]['variant_name'], '')
        self.assertEqual(res.data['items'][0]['add_ons'], [])

    def test_plain_line_price(self):
        res = self.order({'order_type': 'PICKUP', 'items': [
            {'menu_item': self.item.id, 'quantity': 1}]})
        self.assertEqual(Decimal(res.data['total_amount_etb']), Decimal('300.00'))
