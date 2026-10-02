from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.orders.models import RestaurantSettings, DeliveryZone
from apps.menu.models import Category, MenuItem, ItemVariant, AddOn
from decimal import Decimal

User = get_user_model()

class Command(BaseCommand):
    help = 'Seeds initial admin, manager, customer accounts, delivery zones, settings, and full food/drink menu.'

    def handle(self, *args, **options):
        self.stdout.write('Seeding initial data...')

        # ─────────────────────────────────────────────
        # 1. User Accounts
        # ─────────────────────────────────────────────
        admin, _ = User.objects.get_or_create(username='admin', defaults={
            'email': 'admin@artisanalreserve.com', 'role': 'ADMIN',
            'is_staff': True, 'is_superuser': True,
            'phone': '+251911000001', 'first_name': 'System', 'last_name': 'Admin'
        })
        admin.set_password('AdminPassword123!')
        admin.role = 'ADMIN'; admin.is_staff = True; admin.is_superuser = True
        admin.save()
        self.stdout.write(self.style.SUCCESS('✔ Admin: admin@artisanalreserve.com / AdminPassword123!'))

        manager, _ = User.objects.get_or_create(username='manager', defaults={
            'email': 'manager@artisanalreserve.com', 'role': 'MANAGER',
            'is_staff': True, 'phone': '+251911000002',
            'first_name': 'Hotel', 'last_name': 'Manager'
        })
        manager.set_password('ManagerPassword123!')
        manager.role = 'MANAGER'; manager.is_staff = True
        manager.save()
        self.stdout.write(self.style.SUCCESS('✔ Manager: manager@artisanalreserve.com / ManagerPassword123!'))

        customer, _ = User.objects.get_or_create(username='customer', defaults={
            'email': 'customer@artisanalreserve.com', 'role': 'CUSTOMER',
            'phone': '+251911000003', 'first_name': 'Abebe', 'last_name': 'Bikila'
        })
        customer.set_password('CustomerPassword123!')
        customer.save()
        self.stdout.write(self.style.SUCCESS('✔ Customer: customer@artisanalreserve.com / CustomerPassword123!'))

        # ─────────────────────────────────────────────
        # 2. Restaurant Settings
        # ─────────────────────────────────────────────
        settings, _ = RestaurantSettings.objects.get_or_create(id=1)
        settings.is_open = True
        settings.opening_hours = '7:00 AM – 11:00 PM'
        settings.default_prep_minutes = 20
        settings.contact_phone = '+251911223344'
        settings.contact_email = 'support@artisanalreserve.com'
        settings.address = 'Bole Road, opposite Friendship City Center, Addis Ababa'
        settings.save()

        # ─────────────────────────────────────────────
        # 3. Delivery Zones
        # ─────────────────────────────────────────────
        for name, fee in [
            ('Bole & Atlas', Decimal('100.00')),
            ('Kazanchis & Kirkos', Decimal('120.00')),
            ('Piazza & Arat Kilo', Decimal('150.00')),
            ('Old Airport & Bisrate Gabriel', Decimal('130.00')),
            ('CMC & Gerji', Decimal('180.00')),
        ]:
            DeliveryZone.objects.get_or_create(name=name, defaults={'delivery_fee_etb': fee, 'is_active': True})

        # ─────────────────────────────────────────────
        # 4. Categories
        # ─────────────────────────────────────────────
        cat_coffee, _   = Category.objects.get_or_create(name='Micro-Lot Coffee',     defaults={'slug': 'micro-lot-coffee',   'icon': 'local_cafe',     'display_order': 1})
        cat_espresso, _ = Category.objects.get_or_create(name='Espresso & Infusions', defaults={'slug': 'espresso-infusions', 'icon': 'coffee',         'display_order': 2})
        cat_tea, _      = Category.objects.get_or_create(name='Premium Tea',          defaults={'slug': 'premium-tea',        'icon': 'emoji_food_beverage', 'display_order': 3})
        cat_burger, _   = Category.objects.get_or_create(name='Artisanal Burgers',    defaults={'slug': 'artisanal-burgers',  'icon': 'lunch_dining',   'display_order': 4})
        cat_pizza, _    = Category.objects.get_or_create(name='Wood-Fired Pizza',     defaults={'slug': 'wood-fired-pizza',   'icon': 'local_pizza',    'display_order': 5})
        cat_shawarma, _ = Category.objects.get_or_create(name='Shawarma & Wraps',     defaults={'slug': 'shawarma-wraps',     'icon': 'kebab_dining',   'display_order': 6})
        cat_fastfood, _ = Category.objects.get_or_create(name='Fast Food Favourites', defaults={'slug': 'fast-food',          'icon': 'fastfood',       'display_order': 7})
        cat_pastry, _   = Category.objects.get_or_create(name='Bakery & Pastry',      defaults={'slug': 'bakery-pastry',      'icon': 'bakery_dining',  'display_order': 8})

        # ─────────────────────────────────────────────
        # 5. Menu Items
        # ─────────────────────────────────────────────
        items = [
            # ── MICRO-LOT COFFEE ──────────────────────
            {
                'category': cat_coffee, 'name': 'Yirgacheffe Grade 1 Anaerobic',
                'slug': 'yirgacheffe-grade-1-anaerobic',
                'description': 'Complex jasmine aromas, vibrant bergamot acidity, and a silky honeycomb body from Gedeo region.',
                'base_price_etb': Decimal('350.00'), 'is_signature': True,
                'image_url': 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800',
                'tasting_notes': 'Jasmine, Bergamot, Honeycomb',
                'variants': [('250ml', 0), ('400ml Large', 80)],
                'addons': [('Extra Espresso Shot', 70), ('Oat Milk Upgrade', 60)],
            },
            {
                'category': cat_coffee, 'name': 'Guji Hambela Natural Process',
                'slug': 'guji-hambela-natural-process',
                'description': 'Wild blueberry sweetness, dark chocolate undertones, and a velvet mouthfeel from Guji highlands.',
                'base_price_etb': Decimal('320.00'), 'is_signature': True,
                'image_url': 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800',
                'tasting_notes': 'Wild Blueberry, Dark Chocolate, Velvet',
                'variants': [('250ml', 0), ('400ml Large', 80)],
                'addons': [('Extra Espresso Shot', 70), ('Almond Milk Upgrade', 60)],
            },
            {
                'category': cat_coffee, 'name': 'Sidama Bombe Washed',
                'slug': 'sidama-bombe-washed',
                'description': 'Crisp peach and lemon acidity with a clean, tea-like finish. Sourced from high-altitude Bombe kebele.',
                'base_price_etb': Decimal('300.00'), 'is_signature': False,
                'image_url': 'https://images.unsplash.com/photo-1572286258217-215cf8e2e4fb?w=800',
                'tasting_notes': 'Peach, Lemon Zest, Tea-Like',
                'variants': [('250ml', 0), ('400ml Large', 80)],
                'addons': [('Extra Shot', 70)],
            },
            # ── ESPRESSO & INFUSIONS ──────────────────
            {
                'category': cat_espresso, 'name': 'Smoked Cardamom Cappuccino',
                'slug': 'smoked-cardamom-cappuccino',
                'description': 'Double shot Geisha espresso infused with artisanal Ethiopian green cardamom and velvety steamed milk.',
                'base_price_etb': Decimal('280.00'), 'is_signature': True,
                'image_url': 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=800',
                'tasting_notes': 'Green Cardamom, Velvety Milk, Caramel',
                'variants': [('Single Shot', 0), ('Double Shot', 50)],
                'addons': [('Extra Cardamom', 30), ('Oat Milk', 60)],
            },
            {
                'category': cat_espresso, 'name': 'Hazelnut Truffle Mocha',
                'slug': 'hazelnut-truffle-mocha',
                'description': 'Rich espresso, house-made hazelnut truffle syrup, steamed oat milk, dark chocolate shavings on top.',
                'base_price_etb': Decimal('310.00'), 'is_signature': True,
                'image_url': 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=800',
                'tasting_notes': 'Hazelnut, Dark Chocolate, Caramel',
                'variants': [('Regular', 0), ('Large', 70)],
                'addons': [('Extra Chocolate Shavings', 40), ('Whipped Cream', 50)],
            },
            {
                'category': cat_espresso, 'name': 'Cold Brew Reserve',
                'slug': 'cold-brew-reserve',
                'description': '18-hour slow cold-steep using Guji Natural. Whiskey-like oak notes, incredibly smooth and low acid.',
                'base_price_etb': Decimal('340.00'), 'is_signature': False,
                'image_url': 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=800',
                'tasting_notes': 'Whiskey Oak, Dark Cacao, Black Cherry',
                'variants': [('300ml', 0), ('500ml', 90)],
                'addons': [('Simple Syrup', 30), ('Cream Float', 50)],
            },
            # ── PREMIUM TEA ───────────────────────────
            {
                'category': cat_tea, 'name': 'Ethiopian Ginger & Lemon Spice Tea',
                'slug': 'ethiopian-ginger-lemon-spice-tea',
                'description': 'Fresh ginger root, lemon zest, and wild Ethiopian honey steeped in boiling spring water. Warming and vibrant.',
                'base_price_etb': Decimal('180.00'), 'is_signature': True,
                'image_url': 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800',
                'tasting_notes': 'Ginger, Lemon, Wild Honey',
                'variants': [('300ml', 0), ('600ml Pot', 120)],
                'addons': [('Extra Honey', 30), ('Cinnamon Stick', 20)],
            },
            {
                'category': cat_tea, 'name': 'Moroccan Mint Green Tea',
                'slug': 'moroccan-mint-green-tea',
                'description': 'Gunpowder green tea leaves brewed with fresh spearmint. Traditionally sweetened with rock sugar.',
                'base_price_etb': Decimal('160.00'), 'is_signature': False,
                'image_url': 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=800',
                'tasting_notes': 'Spearmint, Gunpowder Green, Rock Sugar',
                'variants': [('300ml', 0), ('600ml Pot', 100)],
                'addons': [('Extra Sugar', 20), ('Fresh Mint Leaves', 30)],
            },
            {
                'category': cat_tea, 'name': 'Masala Chai Latte',
                'slug': 'masala-chai-latte',
                'description': 'Assam CTC black tea simmered with whole spices — cardamom, cloves, ginger, black pepper — steamed with whole milk.',
                'base_price_etb': Decimal('200.00'), 'is_signature': True,
                'image_url': 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=800',
                'tasting_notes': 'Cardamom, Clove, Black Pepper, Ginger',
                'variants': [('Regular', 0), ('Large', 60)],
                'addons': [('Oat Milk', 50), ('Extra Spice', 30)],
            },
            {
                'category': cat_tea, 'name': 'Hibiscus & Rosehip Iced Tea',
                'slug': 'hibiscus-rosehip-iced-tea',
                'description': 'Vibrant crimson blend of dried hibiscus flowers and rosehip, served chilled with honey and citrus.',
                'base_price_etb': Decimal('170.00'), 'is_signature': False,
                'image_url': 'https://images.unsplash.com/photo-1499638673689-79a0b5115d87?w=800',
                'tasting_notes': 'Hibiscus, Rosehip, Citrus, Honey',
                'variants': [('400ml', 0), ('600ml', 70)],
                'addons': [('Extra Honey', 30), ('Mint Garnish', 20)],
            },
            # ── ARTISANAL BURGERS ─────────────────────
            {
                'category': cat_burger, 'name': 'Reserve Wagyu Smash Burger',
                'slug': 'reserve-wagyu-smash-burger',
                'description': 'Double smash patty of premium wagyu beef, American cheese, caramelized onions, house pickles & secret sauce on a toasted brioche.',
                'base_price_etb': Decimal('650.00'), 'is_signature': True,
                'image_url': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800',
                'tasting_notes': 'Wagyu, Caramelized Onion, Secret Sauce',
                'variants': [('Single Patty', 0), ('Double Patty', 150)],
                'addons': [('Extra Cheese', 60), ('Bacon Strips', 100), ('Avocado', 80)],
            },
            {
                'category': cat_burger, 'name': 'Crispy Chicken Signature Burger',
                'slug': 'crispy-chicken-signature-burger',
                'description': 'Buttermilk-marinated fried chicken thigh, coleslaw, jalapeños, honey mustard, pickled cucumber on brioche bun.',
                'base_price_etb': Decimal('520.00'), 'is_signature': True,
                'image_url': 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=800',
                'tasting_notes': 'Buttermilk Crisp, Jalapeño Heat, Honey Mustard',
                'variants': [('Regular', 0), ('With Fries', 120)],
                'addons': [('Extra Jalapeños', 40), ('Extra Sauce', 30)],
            },
            {
                'category': cat_burger, 'name': 'Plant-Based Beyond Burger',
                'slug': 'plant-based-beyond-burger',
                'description': 'Beyond Meat patty, vegan cheese, roasted tomato, rocket lettuce, chipotle mayo, on a seeded whole-wheat bun.',
                'base_price_etb': Decimal('560.00'), 'is_signature': False,
                'image_url': 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=800',
                'tasting_notes': 'Plant-Based, Chipotle, Rocket',
                'variants': [('Regular', 0), ('With Sweet Potato Fries', 130)],
                'addons': [('Extra Chipotle Mayo', 40), ('Pickled Red Onion', 35)],
            },
            {
                'category': cat_burger, 'name': 'BBQ Bacon Cheeseburger',
                'slug': 'bbq-bacon-cheeseburger',
                'description': 'Angus beef patty glazed with house BBQ sauce, cheddar, crispy bacon, fried egg, tomato, and lettuce.',
                'base_price_etb': Decimal('590.00'), 'is_signature': False,
                'image_url': 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=800',
                'tasting_notes': 'Smoky BBQ, Cheddar, Crispy Bacon',
                'variants': [('Regular', 0), ('With Onion Rings', 110)],
                'addons': [('Fried Egg', 60), ('Extra Bacon', 90)],
            },
            # ── WOOD-FIRED PIZZA ──────────────────────
            {
                'category': cat_pizza, 'name': 'Truffle & Wild Mushroom Pizza',
                'slug': 'truffle-wild-mushroom-pizza',
                'description': 'Wood-fired sourdough crust, fior di latte mozzarella, roasted forest mushrooms, truffle oil emulsion, fresh thyme.',
                'base_price_etb': Decimal('780.00'), 'is_signature': True,
                'image_url': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800',
                'tasting_notes': 'Truffle, Wild Mushroom, Fior di Latte',
                'variants': [('25cm', 0), ('32cm', 180)],
                'addons': [('Extra Truffle Oil', 80), ('Parmesan Shavings', 60)],
            },
            {
                'category': cat_pizza, 'name': 'Margherita Classica',
                'slug': 'margherita-classica',
                'description': 'San Marzano tomato, hand-pulled fior di latte, fresh basil, extra virgin olive oil on wood-fired Neapolitan crust.',
                'base_price_etb': Decimal('580.00'), 'is_signature': False,
                'image_url': 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800',
                'tasting_notes': 'San Marzano, Fresh Basil, Olive Oil',
                'variants': [('25cm', 0), ('32cm', 160)],
                'addons': [('Buffalo Mozzarella', 100), ('Cherry Tomatoes', 50)],
            },
            {
                'category': cat_pizza, 'name': 'Spicy Pepperoni & Nduja',
                'slug': 'spicy-pepperoni-nduja',
                'description': 'Double pepperoni, fiery Calabrian nduja, honey chilli drizzle, smoked mozzarella, and fresh chilli rings.',
                'base_price_etb': Decimal('720.00'), 'is_signature': True,
                'image_url': 'https://images.unsplash.com/photo-1595854341625-f33ee10dbf9f?w=800',
                'tasting_notes': 'Pepperoni, Nduja, Chilli Honey',
                'variants': [('25cm', 0), ('32cm', 170)],
                'addons': [('Extra Pepperoni', 90), ('Chilli Oil', 40)],
            },
            {
                'category': cat_pizza, 'name': 'BBQ Chicken & Caramelized Onion',
                'slug': 'bbq-chicken-caramelized-onion',
                'description': 'Pulled chicken in smoky BBQ sauce, caramelized onions, red peppers, smoked cheddar, coriander leaves.',
                'base_price_etb': Decimal('680.00'), 'is_signature': False,
                'image_url': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800',
                'tasting_notes': 'Smoky BBQ, Caramelized Onion, Cheddar',
                'variants': [('25cm', 0), ('32cm', 160)],
                'addons': [('Extra Chicken', 110), ('Jalapeños', 40)],
            },
            # ── SHAWARMA & WRAPS ──────────────────────
            {
                'category': cat_shawarma, 'name': 'Classic Chicken Shawarma',
                'slug': 'classic-chicken-shawarma',
                'description': 'Marinated rotisserie chicken, garlic toum, pickled turnip, fresh tomato, parsley in warm flatbread.',
                'base_price_etb': Decimal('320.00'), 'is_signature': True,
                'image_url': 'https://images.unsplash.com/photo-1561651823-34feb02250e4?w=800',
                'tasting_notes': 'Rotisserie Chicken, Garlic Toum, Pickled Turnip',
                'variants': [('Regular Wrap', 0), ('Large Plate with Rice', 150)],
                'addons': [('Extra Toum', 40), ('Hot Sauce', 30), ('Extra Chicken', 100)],
            },
            {
                'category': cat_shawarma, 'name': 'Beef & Lamb Shawarma',
                'slug': 'beef-lamb-shawarma',
                'description': 'Slow-roasted spiced beef and lamb shoulder strips, tahini, pickles, tomato, onion in pillowy Arabic bread.',
                'base_price_etb': Decimal('380.00'), 'is_signature': True,
                'image_url': 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=800',
                'tasting_notes': 'Spiced Lamb, Tahini, Arabic Bread',
                'variants': [('Regular Wrap', 0), ('Large Plate with Fries', 150)],
                'addons': [('Extra Tahini', 40), ('Fried Egg', 70), ('Hot Sauce', 30)],
            },
            {
                'category': cat_shawarma, 'name': 'Falafel & Hummus Wrap',
                'slug': 'falafel-hummus-wrap',
                'description': 'Crispy herb falafel, creamy hummus, roasted red pepper, cucumber, rocket, and lemon tahini dressing.',
                'base_price_etb': Decimal('280.00'), 'is_signature': False,
                'image_url': 'https://images.unsplash.com/photo-1592415486689-125cbbfcbee2?w=800',
                'tasting_notes': 'Herb Falafel, Hummus, Lemon Tahini',
                'variants': [('Regular Wrap', 0), ('Large Plate', 120)],
                'addons': [('Extra Hummus', 50), ('Chilli Sauce', 30)],
            },
            {
                'category': cat_shawarma, 'name': 'Grilled Veggie Shawarma',
                'slug': 'grilled-veggie-shawarma',
                'description': 'Charred aubergine, zucchini, bell peppers, halloumi, pomegranate molasses glaze in a herb flatbread.',
                'base_price_etb': Decimal('260.00'), 'is_signature': False,
                'image_url': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800',
                'tasting_notes': 'Charred Aubergine, Halloumi, Pomegranate',
                'variants': [('Regular', 0)],
                'addons': [('Extra Halloumi', 80), ('Tahini', 40)],
            },
            # ── FAST FOOD FAVOURITES ──────────────────
            {
                'category': cat_fastfood, 'name': 'Loaded Cheese Fries',
                'slug': 'loaded-cheese-fries',
                'description': 'Crispy golden fries topped with nacho cheese sauce, jalapeños, sour cream, spring onion, and smoked paprika.',
                'base_price_etb': Decimal('220.00'), 'is_signature': True,
                'image_url': 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800',
                'tasting_notes': 'Nacho Cheese, Jalapeño, Paprika',
                'variants': [('Regular', 0), ('Large', 70)],
                'addons': [('Bacon Bits', 80), ('Extra Jalapeños', 40), ('Extra Cheese Sauce', 50)],
            },
            {
                'category': cat_fastfood, 'name': 'Crispy Fried Chicken Wings',
                'slug': 'crispy-fried-chicken-wings',
                'description': 'Double-battered chicken wings, your choice of Buffalo, Honey Garlic, or BBQ sauce. Served with blue cheese dip.',
                'base_price_etb': Decimal('380.00'), 'is_signature': True,
                'image_url': 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=800',
                'tasting_notes': 'Double-Battered, Buffalo or Honey Garlic',
                'variants': [('6 Wings', 0), ('12 Wings', 280)],
                'addons': [('Buffalo Sauce', 50), ('Honey Garlic Sauce', 50), ('Extra Blue Cheese Dip', 60)],
            },
            {
                'category': cat_fastfood, 'name': 'Club Sandwich',
                'slug': 'club-sandwich',
                'description': 'Triple-decker with grilled chicken, turkey ham, crispy bacon, egg, cheddar, lettuce, tomato and mayo.',
                'base_price_etb': Decimal('390.00'), 'is_signature': False,
                'image_url': 'https://images.unsplash.com/photo-1619096252214-ef06c45683e3?w=800',
                'tasting_notes': 'Grilled Chicken, Bacon, Cheddar, Mayo',
                'variants': [('With Fries', 0), ('With Salad', 0)],
                'addons': [('Extra Bacon', 90), ('Avocado', 80)],
            },
            {
                'category': cat_fastfood, 'name': 'Spicy Beef Hot Dog',
                'slug': 'spicy-beef-hot-dog',
                'description': 'Jumbo all-beef frankfurter in a toasted brioche roll, chilli con carne, sriracha mayo, crispy onions.',
                'base_price_etb': Decimal('280.00'), 'is_signature': False,
                'image_url': 'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=800',
                'tasting_notes': 'Beef Frank, Chilli, Sriracha, Crispy Onion',
                'variants': [('Regular', 0), ('With Fries', 100)],
                'addons': [('Extra Chilli', 50), ('Extra Sriracha', 30)],
            },
            {
                'category': cat_fastfood, 'name': 'Loaded Nachos',
                'slug': 'loaded-nachos',
                'description': 'Tortilla chips piled with beef chilli, melted cheese, guacamole, jalapeños, pico de gallo, and sour cream.',
                'base_price_etb': Decimal('350.00'), 'is_signature': False,
                'image_url': 'https://images.unsplash.com/photo-1573225342350-16731dd9bf3d?w=800',
                'tasting_notes': 'Beef Chilli, Guacamole, Pico de Gallo',
                'variants': [('Regular', 0), ('Large Sharing', 180)],
                'addons': [('Extra Guacamole', 80), ('Extra Jalapeños', 40)],
            },
            # ── BAKERY & PASTRY ───────────────────────
            {
                'category': cat_pastry, 'name': 'Croissant au Beurre',
                'slug': 'croissant-au-beurre',
                'description': 'Authentic French laminated dough with 27 layers of Normandy butter. Baked fresh each morning.',
                'base_price_etb': Decimal('120.00'), 'is_signature': False,
                'image_url': 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800',
                'tasting_notes': 'Butter, Flaky Layers, Golden Crust',
                'variants': [('Plain', 0), ('Almond Filled', 40), ('Chocolate Filled', 50)],
                'addons': [('House Jam', 30), ('Honey Butter', 30)],
            },
            {
                'category': cat_pastry, 'name': 'Tiramisu Slice',
                'slug': 'tiramisu-slice',
                'description': 'Savoiardi soaked in Yirgacheffe espresso, layered with mascarpone cream, dusted with Valrhona cocoa.',
                'base_price_etb': Decimal('180.00'), 'is_signature': True,
                'image_url': 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=800',
                'tasting_notes': 'Espresso, Mascarpone, Valrhona Cocoa',
                'variants': [('Single Slice', 0)],
                'addons': [('Extra Cocoa Dusting', 20), ('Espresso Shot on Side', 70)],
            },
        ]

        # ─────────────────────────────────────────────
        # 6. Create Menu Items + Variants + AddOns
        # ─────────────────────────────────────────────
        food_categories = {cat_burger, cat_pizza, cat_shawarma, cat_fastfood, cat_pastry}
        created_count = 0

        for item_info in items:
            category  = item_info.pop('category')
            variants  = item_info.pop('variants', [])
            addons    = item_info.pop('addons', [])
            is_food   = category in food_categories

            # We pop tasting_notes since the backend model doesn't currently support it
            if 'tasting_notes' in item_info:
                item_info.pop('tasting_notes')

            item, created = MenuItem.objects.get_or_create(
                slug=item_info['slug'],
                defaults={**item_info, 'category': category, 'is_available': True}
            )
            if not created:
                # Update existing item's category in case it changed
                item.category = category
                item.save()

            if created:
                created_count += 1

            for v_name, v_mod in variants:
                ItemVariant.objects.get_or_create(
                    menu_item=item, name=v_name,
                    defaults={'price_modifier_etb': Decimal(str(v_mod))}
                )

            for a_name, a_price in addons:
                AddOn.objects.get_or_create(
                    menu_item=item, name=a_name,
                    defaults={'price_etb': Decimal(str(a_price))}
                )

        self.stdout.write(self.style.SUCCESS(
            f'✔ Seeded {created_count} new menu items across 8 categories '
            f'(Coffee, Espresso, Tea, Burgers, Pizza, Shawarma, Fast Food, Pastry)'
        ))
        self.stdout.write(self.style.SUCCESS('✅ Database seeding completed successfully!'))
