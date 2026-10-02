import os
import django
import sys

# Set up Django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'coffee_project.settings')
django.setup()

from api.models import Category, CoffeeItem

def seed_food_items():
    # 1. Ensure categories exist
    categories_data = [
        {'name': 'Signature Coffees', 'slug': 'signature', 'icon': 'star'},
        {'name': 'Cold Drip', 'slug': 'cold-drip', 'icon': 'water_drop'},
        {'name': 'Pour Over', 'slug': 'pour-over', 'icon': 'coffee_maker'},
        {'name': 'Coffee Beans', 'slug': 'beans', 'icon': 'eco'},
        {'name': 'Artisanal Burgers', 'slug': 'artisanal-burgers', 'icon': 'lunch_dining'},
        {'name': 'Wood-Fired Pizza', 'slug': 'wood-fired-pizza', 'icon': 'local_pizza'},
        {'name': 'Shawarma & Wraps', 'slug': 'shawarma-wraps', 'icon': 'kebab_dining'},
        {'name': 'Premium Tea', 'slug': 'premium-tea', 'icon': 'emoji_food_beverage'},
    ]

    for cat_data in categories_data:
        Category.objects.get_or_create(
            slug=cat_data['slug'],
            defaults={'name': cat_data['name'], 'icon': cat_data['icon']}
        )
    
    print("Categories ensured.")

    # 2. Add sample items
    items_data = [
        {
            'name': 'Smoked Vanilla Bourbon Latte',
            'category_slug': 'signature',
            'price': '6.80',
            'description': 'Double shot espresso, Madagascar bourbon vanilla, steamed oat silk, charred cinnamon bark.',
            'origin': 'Highland Bourbon Valley',
            'roast_level': 'Medium Roast',
            'rating': '4.90',
            'image_url': 'https://lh3.googleusercontent.com/aida-public/AB6AXuAOsK0B2OaF9I1OZxSUmDnm8qVaqONlJQwneI__5Y98mYedTSqhLCwKMbh_yYMUoX_eUKtCG4XOoN1iYhwTTAAQailct0cSDGiYxMLx223qoiQk2a3Shhfczo_yE0YXfox9nvtslrAiHqEEgJfcTNqy1rmruhPHXMUT3l55C4mM_DkwUcxDRgkoCBYTI2AJX8thxOlM---aZURc-Fb_EK5jAMliLo_2VqlMtSbXj6ZEr9Qg2JNONSsa',
            'is_signature': True,
        },
        {
            'name': 'Spanish Saffron Flat White',
            'category_slug': 'signature',
            'price': '7.10',
            'description': 'Micro-foamed whole milk, infused saffron thread extraction, single estate Colombian roast.',
            'origin': 'Huila, Colombia',
            'roast_level': 'Light Roast',
            'rating': '5.00',
            'image_url': 'https://lh3.googleusercontent.com/aida-public/AB6AXuCpHZ8vSVDO1Vu3HwH7vxd0OE8IempIuTx14iLJMSoVByavHRxFdKaofA28FlVi5ecCpEECgu3q-9zgdWp80LOL-yg7cdsn4ZVE3F950AXCgB80HN6PQZCgmpphbU2cWVlJy4HWb1pd_A8LVeM-TFjzewhyDqXrTXBvVOaZ7U05aCYK0xlHWj8N5eNH6SggIcpEMwVw2gYCOsAt0ILrtVjejzlErimnE2dzYCtVx4tyNc52HdMIO_ay',
            'is_signature': True,
        },
        {
            'name': 'Kyoto 16-Hour Cold Drip',
            'category_slug': 'cold-drip',
            'price': '8.00',
            'description': 'Cold water extraction drop-by-drop over Dutch glass towers. Whiskey barrel aged hints with silky finish.',
            'origin': 'Antioquia, Colombia',
            'roast_level': 'Dark Barrel',
            'rating': '4.95',
            'image_url': 'https://lh3.googleusercontent.com/aida-public/AB6AXuALioPFauhCbqw0rs4z3AreRdOt8RlK_1_Eq9Ye4gVwMrfw1aJL4uNl4MLfVvfXT7-Nu4wIIjx979DeoOZ3u1abUp_0ihmOZkji1UxHzebDQ5wXBwgiKAa9f-QVUYWvpBLafdOmP52X-U4wy5GpxP5Ntv7KkYryUKLFqexCnpFTgcIlDTCi4kF9qm4nfT8mEPrsoCPaacWJWdT3Lpxm_Eyd4i0sOBiQ96rmSxhWTVVougxtU9LE9uNg',
            'is_signature': True,
        },
        {
            'name': 'Panama Boquete Geisha Pour-Over',
            'category_slug': 'pour-over',
            'price': '9.50',
            'description': 'Hand-poured V60 with delicate notes of wild guava, jasmine tea, and vibrant Meyer lemon zest.',
            'origin': 'Boquete, Panama',
            'roast_level': 'Ultra Light Roast',
            'rating': '4.95',
            'image_url': 'https://lh3.googleusercontent.com/aida-public/AB6AXuDWZcMNjiW8Tw3nw5GCvRtaI0nwk7JFs6cCwxVZhTVFoVKn845tJj21jG_sGbJEPSHeK3TLuJWrXGd0WY9q0Z63P9atQiZyRK6Z5HboVHRrBx7ZuePEhfgC_PwZn_fJiuleiGHt7xZuXr9YJxAIoQBgAJH7Aw7n75H_R6izN9LfaImd21FbeJOj5Es7qib9SCNCMlmDWu-JDtqATWq4r1-mdjrmrmYkRSL7TGRBI3fOqpioWfakvVRs',
            'is_signature': True,
        },
        {
            'name': 'Ethiopian Geisha Honey Wash',
            'category_slug': 'pour-over',
            'price': '7.25',
            'description': 'Single-origin micro-lot from Bench Maji. Soaring florals, peach blossom, and sparkling bergamot.',
            'origin': 'Bench Maji, Ethiopia',
            'roast_level': 'Light Roast',
            'rating': '4.95',
            'image_url': 'https://lh3.googleusercontent.com/aida-public/AB6AXuCBeQuQkvjJch3k03gIZ1HXmn5HoBPeJqL3EQzpxczX_Jvl7WdQ6BVxTU6nDe8q26SyVyRjTdbddPt01l4s18LLBbxlbzmnPN4O7hyaOft5wYn1SkqQcPjLsSxw7QArl-OFK3hpMQW04JL5ch8DpY6T5FGtJ9-f9HHF7r_MSY1uyu0x7FG04T8UTVvlhwhScHysvhNyGTMN5pVKl0-defg3r0D13EXPvldYY9-8bktXFoHcdUPgNnDF',
            'is_signature': False,
        },
        {
            'name': 'Sumatra Blue Batak Dark Roast',
            'category_slug': 'beans',
            'price': '6.00',
            'description': 'Volcanic terroir single-origin from Lake Toba. Full body, wet hulled with dark chocolate and cedar.',
            'origin': 'Lake Toba, Sumatra',
            'roast_level': 'Full Dark Roast',
            'rating': '4.88',
            'image_url': 'https://lh3.googleusercontent.com/aida-public/AB6AXuBrfhhUrffca4cUdOdFoEkgTf5qoUpYLRJmFy1KAsvpUo8Lch79bpB1i69jgQt0t3T4O6yp4d7-RZtYpVtk4WgQYVzRvSrGpcjs4KJRnDMg8t93N8kGoUpYc3xY4L4RdKBOW_r-C9zJVCwxZyYJ_NuS0JA2DazN8aRdgsZcI1JQoT-0anEEvyVRtBZlwtFmJHYKhuflrzEmVGcH_sgj2XeBVb__VeGD4RX1xKV9VUBGSUgdKpjB4Uym',
            'is_signature': False,
        },
        {
            'name': 'Classic Wagyu Burger',
            'category_slug': 'artisanal-burgers',
            'price': '12.50',
            'description': 'Juicy wagyu beef patty with caramelized onions, sharp cheddar, and house sauce.',
            'origin': 'Local Farms',
            'roast_level': 'Medium Well',
            'rating': '4.80',
            'image_url': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=600&auto=format&fit=crop',
            'is_signature': True,
        },
        {
            'name': 'Double Truffle Burger',
            'category_slug': 'artisanal-burgers',
            'price': '15.00',
            'description': 'Double wagyu patty with truffle mayo, mushrooms, and aged gruyere cheese.',
            'origin': 'Local Farms',
            'roast_level': 'Medium',
            'rating': '4.95',
            'image_url': 'https://images.unsplash.com/photo-1594212202875-8622c81373d5?q=80&w=600&auto=format&fit=crop',
            'is_signature': True,
        },
        {
            'name': 'Spicy Chicken Burger',
            'category_slug': 'artisanal-burgers',
            'price': '10.50',
            'description': 'Crispy fried chicken breast, spicy slaw, jalapeños, and brioche bun.',
            'origin': 'Local',
            'roast_level': 'Crispy',
            'rating': '4.60',
            'image_url': 'https://images.unsplash.com/photo-1615719413546-198b25453f85?q=80&w=600&auto=format&fit=crop',
            'is_signature': False,
        },
        {
            'name': 'Margherita Wood-Fired Pizza',
            'category_slug': 'wood-fired-pizza',
            'price': '14.00',
            'description': 'Authentic Neapolitan pizza with San Marzano tomato sauce, fresh mozzarella, and basil.',
            'origin': 'Naples Style',
            'roast_level': 'Wood Fired',
            'rating': '4.90',
            'image_url': 'https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?q=80&w=600&auto=format&fit=crop',
            'is_signature': False,
        },
        {
            'name': 'Pepperoni Feast Pizza',
            'category_slug': 'wood-fired-pizza',
            'price': '16.50',
            'description': 'Double pepperoni, hot honey drizzle, and fresh mozzarella on a charred crust.',
            'origin': 'New York Style',
            'roast_level': 'Wood Fired',
            'rating': '4.85',
            'image_url': 'https://images.unsplash.com/photo-1628840042765-356cda07504e?q=80&w=600&auto=format&fit=crop',
            'is_signature': True,
        },
        {
            'name': 'Truffle Mushroom Pizza',
            'category_slug': 'wood-fired-pizza',
            'price': '17.00',
            'description': 'White base pizza with wild mushrooms, truffle oil, and ricotta cheese.',
            'origin': 'Italian Style',
            'roast_level': 'Wood Fired',
            'rating': '4.95',
            'image_url': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=600&auto=format&fit=crop',
            'is_signature': True,
        },
        {
            'name': 'BBQ Chicken Pizza',
            'category_slug': 'wood-fired-pizza',
            'price': '15.50',
            'description': 'Smoky BBQ sauce, grilled chicken, red onions, and cilantro.',
            'origin': 'California Style',
            'roast_level': 'Wood Fired',
            'rating': '4.75',
            'image_url': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=600&auto=format&fit=crop',
            'is_signature': False,
        },
        {
            'name': 'Authentic Chicken Shawarma Wrap',
            'category_slug': 'shawarma-wraps',
            'price': '8.50',
            'description': 'Marinated chicken spit-roasted to perfection, wrapped with garlic sauce and pickles.',
            'origin': 'Levant',
            'roast_level': 'Spit Roasted',
            'rating': '4.70',
            'image_url': 'https://images.unsplash.com/photo-1655195672076-13d6a4db4c13?q=80&w=600&auto=format&fit=crop',
            'is_signature': True,
        },
        {
            'name': 'Beef Shawarma Wrap',
            'category_slug': 'shawarma-wraps',
            'price': '9.50',
            'description': 'Thinly sliced seasoned beef, tahini sauce, parsley, and sumac onions.',
            'origin': 'Levant',
            'roast_level': 'Spit Roasted',
            'rating': '4.80',
            'image_url': 'https://images.unsplash.com/photo-1529144415895-6aaf8be872fb?q=80&w=600&auto=format&fit=crop',
            'is_signature': True,
        },
        {
            'name': 'Falafel & Hummus Wrap',
            'category_slug': 'shawarma-wraps',
            'price': '7.50',
            'description': 'Crispy falafel, creamy hummus, fresh tomatoes, and cucumber wrap.',
            'origin': 'Middle East',
            'roast_level': 'Deep Fried',
            'rating': '4.60',
            'image_url': 'https://images.unsplash.com/photo-1628840042765-356cda07504e?q=80&w=600&auto=format&fit=crop',
            'is_signature': False,
        },
        {
            'name': 'Matcha Green Tea Latte',
            'category_slug': 'premium-tea',
            'price': '5.50',
            'description': 'Ceremonial grade matcha blended with silky oat milk and a touch of honey.',
            'origin': 'Kyoto, Japan',
            'roast_level': 'Unroasted',
            'rating': '4.95',
            'image_url': 'https://images.unsplash.com/photo-1515823662972-da6a2e4d3002?q=80&w=600&auto=format&fit=crop',
            'is_signature': False,
        },
        {
            'name': 'Earl Grey Classic',
            'category_slug': 'premium-tea',
            'price': '4.00',
            'description': 'Bold black tea infused with bergamot oil, perfect for afternoon tea.',
            'origin': 'England',
            'roast_level': 'Oxidized',
            'rating': '4.70',
            'image_url': 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?q=80&w=600&auto=format&fit=crop',
            'is_signature': False,
        },
        {
            'name': 'Jasmine Dragon Pearl',
            'category_slug': 'premium-tea',
            'price': '6.00',
            'description': 'Hand-rolled green tea pearls scented with fresh jasmine flowers.',
            'origin': 'Fujian, China',
            'roast_level': 'Light',
            'rating': '4.90',
            'image_url': 'https://images.unsplash.com/photo-1563822249548-9a72b6353cd1?q=80&w=600&auto=format&fit=crop',
            'is_signature': True,
        },
        {
            'name': 'Chamomile Blossom',
            'category_slug': 'premium-tea',
            'price': '4.50',
            'description': 'Caffeine-free herbal tea with sweet floral notes of whole chamomile.',
            'origin': 'Egypt',
            'roast_level': 'Dried',
            'rating': '4.65',
            'image_url': 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?q=80&w=600&auto=format&fit=crop',
            'is_signature': False,
        },
        {
            'name': 'Iced Peach Black Tea',
            'category_slug': 'premium-tea',
            'price': '5.00',
            'description': 'Refreshing iced black tea infused with natural peach syrup and mint.',
            'origin': 'Global Blend',
            'roast_level': 'Oxidized',
            'rating': '4.85',
            'image_url': 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?q=80&w=600&auto=format&fit=crop',
            'is_signature': False,
        }
    ]

    for item_data in items_data:
        category = Category.objects.get(slug=item_data.pop('category_slug'))
        name = item_data['name']
        
        obj, created = CoffeeItem.objects.get_or_create(
            name=name,
            defaults={**item_data, 'category': category}
        )
        if created:
            print(f"Created: {name}")
        else:
            print(f"Already exists: {name}")

    print("Sample items seeded successfully!")

if __name__ == '__main__':
    seed_food_items()
