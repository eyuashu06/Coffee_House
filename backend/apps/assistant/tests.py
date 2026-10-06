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
from api.views import SommelierRAGView
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
        # use_agent=False: these tests describe the deterministic engine's
        # behaviour, which is also the fallback when no model is configured.
        return answer_query(query, session_id=session_id, user=user, use_agent=False)

    def customer(self, username='cust', **kwargs):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.create_user(
            username=username, email=f'{username}@gmail.com', password='x', **kwargs)

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


class SignInGateTests(AssistantTestBase):
    """
    Reserving a table and ordering must happen for a signed-in customer. These
    tests pin the boundary: nothing is written for a guest, and the customer is
    told what to do about it.
    """

    RESERVATION_REQUESTS = [
        'I want to reserve a table',
        'Reserve a table for 4 people tomorrow at 6 PM, my name is Eyuel',
        'Cancel my reservation',
        'my reservation status, name is Tola',
    ]
    ORDER_REQUESTS = [
        'I want to order a cappuccino',
        'add a croissant to my order',
    ]

    def test_guest_cannot_create_a_reservation(self):
        before = TableReservation.objects.count()
        r = self.ask('Reserve a table for 4 people tomorrow at 6 PM, my name is Eyuel',
                     session_id='g1')
        self.assertEqual(r['action']['action'], 'auth_required')
        self.assertEqual(TableReservation.objects.count(), before)
        self.assertFalse(TableReservation.objects.filter(name='Eyuel').exists())

    def test_guest_is_asked_to_sign_in_or_sign_up(self):
        r = self.ask('I want to reserve a table', session_id='g2')
        en = r['answer_en'].lower()
        self.assertIn('sign in', en)
        self.assertIn('sign up', en)
        self.assertTrue(r['answer_am'])

    def test_the_gate_message_reads_naturally(self):
        """Wording that broke the sentence was the first version of this."""
        r = self.ask('I want to reserve a table', session_id='g2b')
        en = r['answer_en']
        self.assertIn('I can book you a table once you are signed in.', en)
        # No stranded preposition or duplicated article from template assembly.
        for broken in ('I can a table', 'I can your ', 'I can to '):
            self.assertNotIn(broken, en)
        self.assertIn('ቦታ ለመያየት', r['answer_am'])

    def test_the_button_reason_is_a_phrase_not_a_sentence(self):
        r = self.ask('cancel my order', session_id='g2c')
        action = r['action']
        self.assertEqual(action['action'], 'auth_required')
        self.assertEqual(action['reason_en'], 'Sign in to continue with cancelling an order.')
        self.assertTrue(action['reason_am'])

    def test_the_guest_is_told_what_is_still_held_for_them(self):
        """Both halves of the message are in the customer's own language."""
        self.ask('I want to reserve a table', session_id='g2d')
        r = self.ask('tomorrow at 7 PM for 4 people, name is Hana', session_id='g2d')
        for text in (r['answer_en'], r['answer_am']):
            self.assertIn('19:00', text)
            self.assertIn('4', text)
            self.assertIn('Hana', text)

    def test_guest_cannot_cancel_someone_elses_reservation(self):
        """Name + phone was enough to cancel a booking before the gate existed."""
        victim = TableReservation.objects.create(
            name='Mika', party_size=2,
            date_time=timezone.localtime() + timedelta(days=2), status='CONFIRMED')
        r = self.ask('cancel my reservation, name is Mika', session_id='g3')
        victim.refresh_from_db()
        self.assertEqual(victim.status, 'CONFIRMED')
        self.assertEqual(r['action']['action'], 'auth_required')

    def test_guest_cannot_look_up_reservations_by_name(self):
        TableReservation.objects.create(
            name='Tola', party_size=3,
            date_time=timezone.localtime() + timedelta(days=3), status='CONFIRMED')
        r = self.ask('my reservation status, name is Tola', session_id='g4')
        self.assertEqual(r['reservations'], [])
        self.assertEqual(r['action']['action'], 'auth_required')

    def test_guest_cannot_place_an_order(self):
        """
        A guest may build an order - it costs them nothing and touches no account
        - but confirming it requires sign-in, and nothing is written either way.
        """
        from apps.orders.models import Order

        before = Order.objects.count()
        r = self.ask('I want to order a cappuccino', session_id='g5')
        self.assertNotEqual(r['action']['action'], 'order_placed')

        r = self.ask('yes, place it for pickup', session_id='g5')
        self.assertEqual(r['action']['action'], 'auth_required')
        self.assertEqual(Order.objects.count(), before)

    def test_signed_in_customer_can_place_their_order(self):
        from apps.orders.models import Order

        user = self.customer('gate-orders')
        self.ask('I want to order a cappuccino', session_id='g5b', user=user)
        r = self.ask('yes, place it for pickup', session_id='g5b', user=user)
        self.assertEqual(r['action']['action'], 'order_placed')
        self.assertEqual(Order.objects.filter(customer=user).count(), 1)

    def test_guest_cannot_read_their_orders(self):
        r = self.ask('what is my order status?', session_id='g6')
        self.assertEqual(r['action']['action'], 'auth_required')
        self.assertEqual(r.get('orders'), [])

    def test_signed_in_customer_can_reserve(self):
        user = self.customer('gate-booker')
        r = self.ask('Reserve a table for 3 people tomorrow at 7 PM, name is Selam',
                     session_id='g7', user=user)
        self.assertEqual(r['action']['action'], 'reservation_created')
        self.assertEqual(TableReservation.objects.filter(user=user).count(), 1)

    def test_signed_in_customer_can_read_their_own_orders(self):
        user = self.customer('gate-orderer')
        r = self.ask('what is my order status?', session_id='g8', user=user)
        # No orders yet, but the question was answered rather than refused.
        self.assertNotEqual(r['action']['action'], 'auth_required')

    def test_menu_questions_stay_public(self):
        for query in ['What coffees do you have?', 'How much is Masala Chai Latte?',
                      'What are your opening hours?', 'Do you have vegetarian food?']:
            with self.subTest(query=query):
                r = self.ask(query, session_id='g9')
                self.assertNotEqual(r['action']['action'], 'auth_required', query)

    def test_guest_state_is_preserved_for_after_sign_in(self):
        """The booking details a guest already gave must not be thrown away."""
        self.ask('I want to reserve a table', session_id='g10')
        r = self.ask('tomorrow at 7 PM for 4 people, name is Hana', session_id='g10')
        self.assertEqual(r['action']['action'], 'auth_required')
        self.assertTrue(r['action']['preserve_state'])
        self.assertEqual(r['action']['resume_intent'], 'reservation_create')
        # The message acknowledges what they already gave us instead of
        # restarting the form.
        self.assertIn('4', r['answer_en'])
        self.assertNotIn("don't have that information", r['answer_en'].lower())

    def test_order_staged_before_sign_in_survives(self):
        """What they chose is kept, so signing in does not lose the order."""
        from apps.assistant.engine import get_session

        self.ask('I want to order a croissant', session_id='g11')
        r = self.ask('yes, place it for pickup', session_id='g11')
        self.assertEqual(r['action']['action'], 'auth_required')

        staged = get_session('g11').staged_order
        self.assertFalse(staged.is_empty())
        self.assertEqual(staged.summary()['lines'][0]['name'], 'Croissant au Beurre')

        # And the order still places once they have an account.
        user = self.customer('gate-resume')
        r = self.ask('yes, place it for pickup', session_id='g11', user=user)
        self.assertEqual(r['action']['action'], 'order_placed')

    def test_private_tools_are_hidden_from_guests(self):
        from apps.assistant.agent import tool_declarations

        guest = {t['name'] for t in tool_declarations(include_private=False)}
        member = {t['name'] for t in tool_declarations(include_private=True)}
        self.assertIn('create_reservation', member)
        self.assertIn('place_order', member)
        for name in ('create_reservation', 'find_reservations', 'cancel_reservation', 'my_orders'):
            self.assertNotIn(name, guest)
        # Ordering itself stays available so a guest can build an order first.
        self.assertIn('add_to_order', guest)


class AgentToolSafetyTests(AssistantTestBase):
    """
    The model cannot talk its way past a gate. These call the tools the way the
    agent does, with a guest attached.
    """

    def setUp(self):
        super().setUp()
        from apps.assistant.agent import ToolContext
        from apps.assistant.ordering import StagedOrder

        self.ctx = ToolContext(user=None, staged=StagedOrder())

    def test_guest_tools_refuse_account_actions(self):
        from apps.assistant.agent import execute_tool

        result = execute_tool('create_reservation', {
            'date': '2030-01-01', 'time': '18:00', 'guests': 2, 'name': 'Ghost'}, self.ctx)
        self.assertFalse(result.get('created'))
        self.assertEqual(result['error'], 'auth_required')
        self.assertFalse(TableReservation.objects.filter(name='Ghost').exists())

        result = execute_tool('place_order', {'order_type': 'PICKUP'}, self.ctx)
        self.assertFalse(result.get('placed'))
        self.assertEqual(result['error'], 'auth_required')

    def test_guest_my_orders_refuses(self):
        from apps.assistant.agent import execute_tool

        self.assertEqual(execute_tool('my_orders', {}, self.ctx)['error'], 'auth_required')
        self.assertEqual(execute_tool('find_reservations', {}, self.ctx)['error'], 'auth_required')

    def test_guest_can_still_browse_and_price(self):
        from apps.assistant.agent import execute_tool

        result = execute_tool('search_menu', {'query': 'cappuccino'}, self.ctx)
        self.assertTrue(result['found'])
        self.assertTrue(result['items'][0]['price_etb'] > 0)

    def test_order_item_must_exist_on_the_menu(self):
        from apps.assistant.agent import execute_tool

        result = execute_tool('add_to_order', {'name': 'Unicorn Latte'}, self.ctx)
        self.assertFalse(result['added'])
        self.assertEqual(result['error'], 'not_on_menu')

    def test_unknown_tool_is_reported_not_crashed(self):
        from apps.assistant.agent import execute_tool

        self.assertEqual(execute_tool('drop_database', {}, self.ctx)['error'], 'unknown_tool')


class _FakeFunctionCall:
    def __init__(self, name, args):
        self.name = name
        self.args = args


class _FakeResponse:
    def __init__(self, text=None, function_calls=None):
        self.text = text
        self.function_calls = function_calls or []


class _FakeCall:
    """One recorded call to the model, kept attribute-accessible for assertions."""

    def __init__(self, model, contents, config):
        self.model = model
        self.contents = contents
        self.config = config


class _FakeModels:
    """Minimal stand-in for the Gemini models client, scripted turn by turn."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def generate_content(self, model, contents, config):
        self.calls.append(_FakeCall(model=model, contents=contents, config=config))
        if not self.script:
            raise AssertionError('the agent asked the model for more turns than the test scripted')
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        return step


class _FakeClient:
    def __init__(self, script):
        self.models = _FakeModels(script)


class AgentLoopTests(AssistantTestBase):
    """
    The agent loop itself: it calls tools, reads the results, and refuses to send
    an answer that the tools do not support. The model is scripted, so these tests
    are deterministic and need no API key.
    """

    def run_with_script(self, script, query, user=None, session_id=None, use_agent=True):
        from unittest import mock

        from apps.assistant.agent import run_agent
        from apps.assistant.engine import get_session

        client = _FakeClient(script)
        session = get_session(session_id or 'agent-test')
        with mock.patch('apps.assistant.agent._client', return_value=client), \
                self.settings(ASSISTANT_USE_LLM=True, GEMINI_API_KEY='test-key'):
            result = run_agent(query, user=user, session=session,
                               staged=session.staged_order, language='en')
        return result, client

    def test_guest_menu_question_is_answered_from_the_tools(self):
        """The reply is only sent because the price came out of search_menu."""
        result, client = self.run_with_script([
            _FakeResponse(function_calls=[
                _FakeFunctionCall('search_menu', {'query': 'masala chai latte'})]),
            _FakeResponse(text='{"en": "The Masala Chai Latte is 200 ETB.", '
                               '"am": "የMasala Chai Latte ዋጋው 200 ብር ነው።"}'),
        ], 'How much is the Masala Chai Latte?')

        self.assertIsNotNone(result)
        self.assertIn('200', result['answer_en'])
        # The menu really was queried, and the private tools were not on the table.
        self.assertEqual(len(client.models.calls), 2)
        declarations = client.models.calls[0].config['tools'][0]['function_declarations']
        names = [d['name'] for d in declarations]
        self.assertIn('search_menu', names)
        self.assertNotIn('create_reservation', names)
        # Guests keep the tools that let them build an order; only placing it and
        # anything account-bound is withheld.
        self.assertIn('add_to_order', names)
        self.assertNotIn('place_order', names)
        self.assertNotIn('my_orders', names)

    def test_guest_never_gets_the_private_tools(self):
        _, client = self.run_with_script([
            _FakeResponse(text='{"en": "Hello.", "am": "ሰላም።"}'),
        ], 'hello')
        config = client.models.calls[0].config
        declarations = config['tools'][0]['function_declarations']
        self.assertNotIn('place_order', [d['name'] for d in declarations])
        self.assertIn('add_to_order', [d['name'] for d in declarations])
        self.assertIn('is NOT signed in', config['system_instruction'])

    def test_member_does_get_the_private_tools(self):
        user = self.customer('agent-member')
        _, client = self.run_with_script([
            _FakeResponse(text='{"en": "Hello.", "am": "ሰላም።"}'),
        ], 'hello', user=user)
        declarations = client.models.calls[0].config['tools'][0]['function_declarations']
        self.assertIn('create_reservation', [d['name'] for d in declarations])
        self.assertIn('is signed in', client.models.calls[0].config['system_instruction'])
        self.assertNotIn('is NOT signed in', client.models.calls[0].config['system_instruction'])

    def test_invented_price_falls_back_to_the_deterministic_engine(self):
        """200 came from the tool; 450 did not, so the answer is discarded."""
        result, _ = self.run_with_script([
            _FakeResponse(function_calls=[
                _FakeFunctionCall('search_menu', {'query': 'masala chai latte'})]),
            _FakeResponse(text='{"en": "That is on offer for 450 ETB.", '
                               '"am": "በ450 ብር ተሸጥቷል።"}'),
        ], 'How much is the Masala Chai Latte?')

        # run_agent returned None, so the caller falls back.
        self.assertIsNone(result)

    def test_claim_of_a_booking_without_a_booking_is_rejected(self):
        result, _ = self.run_with_script([
            _FakeResponse(text='{"en": "Your reservation has been confirmed for 4 people.", '
                               '"am": "ቦታ ማስያዣዎ ተረጋግጧል።"}'),
        ], 'book me a table')
        self.assertIsNone(result)

    def test_api_failure_falls_back(self):
        result, _ = self.run_with_script([RuntimeError('provider down')], 'hello')
        self.assertIsNone(result)

    def test_malformed_model_output_falls_back(self):
        for text in ('no json here', '{"en": "only english"}', '{"am": "ብቻ አማርኛ"}'):
            with self.subTest(text=text):
                result, _ = self.run_with_script([_FakeResponse(text=text)], 'hello')
                self.assertIsNone(result)

    def test_tool_error_does_not_break_the_turn(self):
        """A tool that raises becomes a readable refusal, not a 500."""
        result, client = self.run_with_script([
            _FakeResponse(function_calls=[_FakeFunctionCall('get_venue_info', {})]),
            _FakeResponse(function_calls=[_FakeFunctionCall('drop_database', {})]),
            _FakeResponse(function_calls=[_FakeFunctionCall('place_order', {'order_type': 'PICKUP'})]),
            _FakeResponse(text='{"en": "I could not place that just now, please try again.", '
                               '"am": "አሁን መስጠት አልተቻለም፣ እንደገና ይሞክሩ።"}'),
        ], 'place my order')
        self.assertIsNotNone(result)
        # The refusal was passed back to the model as a tool result, so it could
        # explain rather than guess.
        contents = client.models.calls[-1].contents
        responses = [part['function_response']['response']
                     for turn in contents if isinstance(turn, dict)
                     for part in turn.get('parts', [])
                     if isinstance(part, dict) and 'function_response' in part]
        self.assertTrue(any(r.get('error') == 'unknown_tool' for r in responses))
        self.assertTrue(any(r.get('error') == 'auth_required' for r in responses))

    def test_signed_in_guest_tools_can_place_a_real_order(self):
        from apps.orders.models import Order

        user = self.customer('agent-orderer')
        item = MenuItem.objects.get(name='Croissant au Beurre')
        result, _ = self.run_with_script([
            _FakeResponse(function_calls=[
                _FakeFunctionCall('add_to_order', {'name': item.name, 'quantity': 2})]),
            _FakeResponse(function_calls=[
                _FakeFunctionCall('place_order', {'order_type': 'PICKUP'})]),
            _FakeResponse(text='{"en": "Your order is placed.", "am": "ትዕዛዝዎ ተልኳል።"}'),
        ], 'I want two croissants, place it for pickup', user=user, session_id='agent-order')

        self.assertIsNotNone(result)
        self.assertEqual(result['action']['action'], 'order_placed')
        self.assertEqual(Order.objects.filter(customer=user).count(), 1)
        self.assertEqual(Order.objects.get(customer=user).items.count(), 1)
        # 2 x 120, priced by the server from the menu.
        self.assertEqual(float(Order.objects.get(customer=user).total_amount_etb), 240.0)

    def test_tool_rounds_are_capped(self):
        """A model that keeps calling tools cannot loop forever."""
        from unittest import mock

        from apps.assistant.agent import MAX_TOOL_ROUNDS, run_agent
        from apps.assistant.engine import get_session

        endless = [_FakeResponse(function_calls=[
            _FakeFunctionCall('view_order', {})]) for _ in range(MAX_TOOL_ROUNDS + 5)]
        client = _FakeClient(endless)
        session = get_session('agent-loop')
        with mock.patch('apps.assistant.agent._client', return_value=client), \
                self.settings(ASSISTANT_USE_LLM=True, GEMINI_API_KEY='test-key'):
            result = run_agent('what is in my order?', session=session,
                               staged=session.staged_order, language='en')
        # The initial request plus one per tool round, and then it gave up rather
        # than asking again - the fallback answers instead.
        self.assertEqual(len(client.models.calls), MAX_TOOL_ROUNDS + 1)
        self.assertIsNone(result)


class AnswerVerificationTests(AssistantTestBase):
    """A model reply that states an unsourced fact is thrown away, not sent."""

    def ctx_with(self, numbers):
        from apps.assistant.agent import ToolContext

        ctx = ToolContext(user=None)
        for number in numbers:
            ctx.remember_number(number)
        return ctx

    def test_unsourced_price_is_rejected(self):
        from apps.assistant.agent import verify_answer

        ctx = self.ctx_with([200])
        problems = verify_answer('The Chai Latte costs 350 ETB.', 'ዋጋው 350 ብር ነው።', ctx)
        self.assertTrue(any('unverified number' in p for p in problems))

    def test_sourced_price_passes(self):
        from apps.assistant.agent import verify_answer

        ctx = self.ctx_with([200])
        self.assertEqual(verify_answer('The Chai Latte is 200 ETB.', 'ዋጋው 200 ብር ነው።', ctx), [])

    def test_confirmation_without_a_booking_is_rejected(self):
        from apps.assistant.agent import verify_answer

        ctx = self.ctx_with([])
        problems = verify_answer(
            'Your reservation has been confirmed for 4 people.',
            'የቦታ ማስያዣዎ ተረጋግጧል።', ctx)
        self.assertTrue(problems)

    def test_ordinary_small_numbers_are_allowed(self):
        """Party sizes and item counts are prose, not quoted facts."""
        from apps.assistant.agent import verify_answer

        ctx = self.ctx_with([])
        self.assertEqual(
            verify_answer('I can seat 4 of you at 7 and add 2 more items.',
                          'አራት ሰዎችን በ7 ሰዓት ማስቀመጥ እችላለሁ።', ctx),
            [])

    def test_prep_time_needs_the_venue_tool(self):
        """
        '20 minutes' is a number like any other. It is only allowed once the
        venue tool has supplied it, so the model cannot invent a wait time.
        """
        from apps.assistant.agent import verify_answer

        without = self.ctx_with([])
        self.assertTrue(verify_answer('It takes 20 minutes.',
                                      'ከ20 ደቂቃ በላይ ይወስዳል።', without))

        with_venue = self.ctx_with([20])
        self.assertEqual(verify_answer('It takes 20 minutes.',
                                       'ከ20 ደቂቃ በላይ ይወስዳል።', with_venue), [])


class OrderingTests(AssistantTestBase):
    """The deterministic ordering path, used when no model is configured."""

    def order_user(self):
        return self.customer('orderer')

    def test_named_item_is_added_with_server_price(self):
        from apps.orders.models import Order

        user = self.order_user()
        r = self.ask('I want to order Masala Chai Latte', session_id='o1', user=user)
        self.assertIn('200', r['answer_en'].replace('.00', ''))
        self.assertEqual(Order.objects.count(), 0)

    def test_quantity_is_read(self):
        r = self.ask('I want 2 Moroccen Mint Green Tea'.replace('Moroccen', 'Moroccan'),
                     session_id='o2', user=self.order_user())
        self.assertIn('2x', r['answer_en'])

    def test_total_is_shown(self):
        r = self.ask('I want to order a Margherita Classica', session_id='o3',
                     user=self.order_user())
        self.assertIn('580', r['answer_en'].replace('.00', ''))

    def test_order_can_be_placed_after_confirmation(self):
        from apps.orders.models import Order

        user = self.order_user()
        self.ask('I want to order Masala Chai Latte', session_id='o4', user=user)
        r = self.ask('yes, place it for pickup', session_id='o4', user=user)
        self.assertEqual(r['action']['action'], 'order_placed')
        self.assertEqual(Order.objects.filter(customer=user).count(), 1)
        self.assertTrue(r['answer_en'].strip())

    def test_delivery_asks_for_an_address(self):
        r = self.ask('I want to order a croissant, delivery', session_id='o5',
                     user=self.order_user())
        self.assertEqual(r['action']['action'], 'collect_order_details')
        self.assertIn('address', r['answer_en'].lower())

    def test_prices_are_not_trusted_from_the_customer(self):
        """A customer cannot dictate a price by naming one."""
        from apps.assistant.ordering import StagedOrder, resolve_order_item

        item, variant, add_ons, problem = resolve_order_item('Masala Chai Latte')
        self.assertIsNone(problem)
        staged = StagedOrder()
        summary, status = staged.add_item(item, quantity=1)
        self.assertEqual(float(summary['lines'][0]['unit_price_etb']), 200.0)
        self.assertEqual(float(summary['total_etb']), 200.0)

    def test_sold_out_item_cannot_be_added(self):
        item = MenuItem.objects.get(name='Croissant au Beurre')
        item.is_available = False
        item.save(update_fields=['is_available'])
        try:
            from apps.assistant.ordering import resolve_order_item

            resolved, _, _, problem = resolve_order_item('Croissant au Beurre')
            self.assertIsNone(resolved)
            self.assertEqual(problem, 'unavailable')
        finally:
            item.is_available = True
            item.save(update_fields=['is_available'])

    def test_order_summary_is_bilingual(self):
        r = self.ask('I want to order a Margherita Classica', session_id='o6',
                     user=self.order_user())
        self.assertTrue(r['answer_en'])
        self.assertTrue(r['answer_am'])


class ReservationTests(AssistantTestBase):
    """
    The reservation flow, run as a signed-in customer - a guest is turned away by
    SignInGateTests before any of this runs.
    """

    def setUp(self):
        super().setUp()
        self.user = self.customer('reserver')

    def book(self, query, session_id):
        return self.ask(query, session_id=session_id, user=self.user)

    def test_collects_missing_details(self):
        r = self.book('I want to reserve a table', session_id='s1')
        self.assertEqual(r['action']['action'], 'collect_reservation_details')
        self.assertIn('name', r['action']['missing'])

    def test_full_reservation_is_created_and_confirmed(self):
        r = self.book(
            'Reserve a table for 4 people tomorrow at 6 PM, my name is Eyuel',
            session_id='s2')
        self.assertEqual(r['action']['action'], 'reservation_created')
        self.assertTrue(r['reservations'])
        self.assertIn('confirmed', r['answer_en'].lower() + r['answer_am'])
        self.assertEqual(TableReservation.objects.filter(
            name='Eyuel', party_size=4, user=self.user).count(), 1)

    def test_confirmation_requires_backend_success(self):
        tomorrow = (timezone.localtime() + timedelta(days=1)).strftime('%Y-%m-%d')
        r = self.book(f'book for 2 people on {tomorrow} at 7 PM name is Selam', session_id='s3')
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

        r = self.book('I need a table for 2 tomorrow at 6 PM, name is Hana', session_id='s4')
        self.assertEqual(r['action']['action'], 'suggest_alternative_time')
        self.assertIn('not available', r['answer_en'].lower())
        self.assertFalse(TableReservation.objects.filter(name='Hana').exists())

    def test_large_party_is_refused(self):
        r = self.book('table for 30 people tomorrow at 5 PM name is Big', session_id='s5')
        self.assertNotEqual(r['action']['action'], 'reservation_created')
        self.assertFalse(TableReservation.objects.filter(name='Big').exists())

    def test_past_date_is_refused(self):
        yesterday = (timezone.localtime() - timedelta(days=1)).strftime('%Y-%m-%d')
        r = self.book(f'table for 2 yesterday at 5 PM name is Past', session_id='s6')
        self.assertFalse(TableReservation.objects.filter(name='Past').exists())

    def test_cancel_without_details_uses_their_own_account(self):
        """Signed in, the customer does not have to name themselves."""
        TableReservation.objects.create(
            name='Mika', party_size=2, user=self.user,
            date_time=timezone.localtime() + timedelta(days=2), status='CONFIRMED')
        r = self.book('Cancel my reservation', session_id='s7')
        self.assertEqual(r['action']['action'], 'reservation_cancelled')
        self.assertEqual(TableReservation.objects.filter(name='Mika', status='CANCELLED').count(), 1)

    def test_cancel_removes_active_reservation(self):
        res = TableReservation.objects.create(
            name='Mika', party_size=2, user=self.user,
            date_time=timezone.localtime() + timedelta(days=2), status='CONFIRMED')
        r = self.book('cancel my reservation', session_id='s8')
        res.refresh_from_db()
        self.assertEqual(res.status, 'CANCELLED')
        self.assertEqual(r['action']['action'], 'reservation_cancelled')

    def test_reservation_status_lookup(self):
        TableReservation.objects.create(
            name='Tola', party_size=3, user=self.user,
            date_time=timezone.localtime() + timedelta(days=3), status='CONFIRMED')
        r = self.book('what is my reservation status?', session_id='s9')
        self.assertTrue(r['reservations'])

    def test_someone_elses_reservation_is_not_visible(self):
        """Ownership is now the account, so a name alone reveals nothing."""
        TableReservation.objects.create(
            name='Not Mine', party_size=2,
            date_time=timezone.localtime() + timedelta(days=3), status='CONFIRMED')
        r = self.book('my reservation status, name is Not Mine', session_id='s10')
        self.assertEqual(r['reservations'], [])


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


class LegacyEndpointTests(AssistantTestBase):
    """The deprecated /api/v1/sommelier/ path must obey the same sign-in gate."""

    def setUp(self):
        super().setUp()
        self.factory = RequestFactory()

    def ask(self, query, user=None):
        request = self.factory.post('/api/v1/sommelier/', {'query': query},
                                    content_type='application/json')
        if user is not None:
            force_authenticate(request, user=user)
        return SommelierRAGView.as_view()(request)

    def test_menu_question_still_works(self):
        response = self.ask('What coffee do you have?')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['answer_en'])

    def test_it_cannot_be_used_to_bypass_the_gate(self):
        from api.models import TableReservation

        response = self.ask('Reserve a table for 4 people tomorrow at 6 PM, my name is Sneaky')
        self.assertEqual(response.data['action']['action'], 'auth_required')
        self.assertFalse(TableReservation.objects.filter(name='Sneaky').exists())

    def test_signed_in_customer_is_forwarded(self):
        user = self.customer('legacy-booker')
        response = self.ask(
            'Reserve a table for 2 people tomorrow at 7 PM, name is Legacy', user=user)
        self.assertEqual(response.data['action']['action'], 'reservation_created')
        self.assertEqual(TableReservation.objects.filter(user=user).count(), 1)


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
    """
    Bugs found during live testing - keep them fixed.

    The booking cases run as a signed-in customer, since a guest never reaches
    the reservation flow at all.
    """

    def setUp(self):
        super().setUp()
        self.user = self.customer('regression-user')

    def test_product_name_containing_reserve_is_not_a_reservation(self):
        burger = MenuItem.objects.get(name='Reserve Wagyu Smash Burger')
        r = self.ask(f'Is {burger.name} available?', user=self.user)
        self.assertEqual(r['intent'], 'availability')

    def test_english_keywords_match_plurals_but_not_arbitrary_prefixes(self):
        """
        'cancellation' used to match the token 'cancel' by prefix, which made
        "cancel my order" read as a reservation. Plurals must still work.
        """
        from apps.assistant.retriever import _hits, tokenize

        tokens = set(tokenize('What coffees do you have?'))
        self.assertTrue(_hits('coffee', tokens))

        cancel_tokens = set(tokenize('cancel my order'))
        self.assertFalse(_hits('cancellation', cancel_tokens))
        self.assertTrue(_hits('cancel', cancel_tokens))

    def test_amharic_keywords_still_match_by_prefix(self):
        """Amharic inflects, so prefix matching is what makes it work at all."""
        from apps.assistant.retriever import _hits, tokenize

        # አላችሁ (you have) inflected to አላችሁን
        self.assertTrue(_hits('አላችሁ', set(tokenize('ምን አይነት ቡና አላችሁን?'))))
        # ማስያዝ (to reserve) shares its stem with ማስያዣ (the reservation)
        self.assertTrue(_hits('ቦታ', set(tokenize('ቦታ ማስያዣ እፈልጋለሁ'))))

    def test_guest_count_ignores_the_hour(self):
        r = self.ask('Reserve a table for 4 people tomorrow at 6 PM, my name is Zera',
                     session_id='reg1', user=self.user)
        self.assertEqual(r['action']['action'], 'reservation_created')
        self.assertEqual(r['reservations'][0]['party_size'], 4)

    def test_short_question_words_do_not_match_items(self):
        """'is' used to match inside 'cr-oissant'."""
        r = self.ask('How much is the Unicorn Latte?', user=self.user)
        self.assertEqual(r['items'], [])

    def test_amharic_words_are_not_digit_corrupted(self):
        """Amharic digits share codepoints with letters; tokenizing must not corrupt."""
        from apps.assistant.retriever import tokenize
        self.assertIn('አላችሁ', tokenize('ምን አይነት ሻይ አላችሁ?'))
        self.assertIn('ሻይ', tokenize('ምን አይነት ሻይ አላችሁ?'))

    def test_reservation_continuity_without_keyword(self):
        self.ask('I want to reserve a table', session_id='reg2', user=self.user)
        r = self.ask('tomorrow at 7 PM for 2 people, name is Hana', session_id='reg2', user=self.user)
        self.assertEqual(r['action']['action'], 'reservation_created')

    def test_amharic_cancel_is_detected(self):
        TableReservation.objects.create(
            name='Mika', party_size=2,
            date_time=timezone.localtime() + timedelta(days=2), status='CONFIRMED')
        r = self.ask('ቦታ ማስያዣዬን መሰረዝ', session_id='reg3', user=self.user)
        self.assertEqual(r['intent'], 'reservation_cancel')

    def test_category_browse_for_amharic_question(self):
        r = self.ask('ምን አይነት ሻይ አላችሁ?', user=self.user)
        self.assertTrue(r['items'])

    def test_all_in_one_message_without_reserve_keyword(self):
        """A full booking in one sentence never says 'reserve' - it still books."""
        r = self.ask('name abebe, date tommorow at 9 morning, with 10 guests',
                     session_id='reg4', user=self.user)
        self.assertEqual(r['action']['action'], 'reservation_created')
        self.assertEqual(r['reservations'][0]['party_size'], 10)
        self.assertEqual(r['reservations'][0]['time'], '09:00')

    def test_misspelled_tomorrow_is_understood(self):
        r = self.ask('book a table for Hana tommorrow at 7 evening for 2 people',
                     session_id='reg5', user=self.user)
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
        r = self.ask('ለካቲ ቦታ እፈልጋለሁ ነገ ከ6 ሰዓት', session_id='reg6', user=self.user)
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
        self.ask('I want to reserve a table', session_id='reg7', user=self.user)
        self.ask('name is Hana', session_id='reg7', user=self.user)
        r = self.ask('tomorrow', session_id='reg7', user=self.user)
        self.assertEqual(r['action']['action'], 'collect_reservation_details')
        r = self.ask('9am', session_id='reg7', user=self.user)
        self.assertEqual(r['action']['action'], 'collect_reservation_details')
        r = self.ask('for 3 people', session_id='reg7', user=self.user)
        self.assertEqual(r['action']['action'], 'reservation_created')

    def test_open_booking_keeps_collecting_until_complete(self):
        """A partial follow-up must never answer 'no such information'."""
        self.ask('reserve a table for abebe tomorrow', session_id='reg8', user=self.user)
        for follow in ('tomorrow', '9am'):
            r = self.ask(follow, session_id='reg8', user=self.user)
            self.assertEqual(r['action']['action'], 'collect_reservation_details')
            self.assertNotIn('don\'t have', r['answer_en'].lower())

    def test_bare_number_is_not_treated_as_a_booking(self):
        """A lone digit or a bare 'today' must not trigger the booking shortcut."""
        self.assertEqual(self.ask('9', session_id='reg9', user=self.user)['intent'], 'unknown_item')
        self.assertEqual(self.ask('today', session_id='reg10', user=self.user)['intent'], 'unknown_item')
        # A real menu question must still be answered as a menu question.
        r = self.ask('what teas do you have?', session_id='reg11', user=self.user)
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
