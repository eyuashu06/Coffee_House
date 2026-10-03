import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'coffee_project.settings')
django.setup()

from api.models import Category, CoffeeItem

def populate():
    # 1. Ensure categories exist
    cat_coffee, _ = Category.objects.get_or_create(slug='coffee', defaults={'name': 'Coffee'})
    cat_tea, _ = Category.objects.get_or_create(slug='tea', defaults={'name': 'Tea'})
    cat_food, _ = Category.objects.get_or_create(slug='food', defaults={'name': 'Food'})
    cat_sweets, _ = Category.objects.get_or_create(slug='sweets', defaults={'name': 'Sweets'})

    items_to_create = [
        # Coffees
        {
            'name': 'Abol (First Pour)',
            'category': cat_coffee,
            'description': 'The strongest, richest first cup of the ceremony. Bold and unapologetic.',
            'base_price_etb': '80.00',
            'is_signature': True,
        },
        {
            'name': 'Tona (Second Pour)',
            'category': cat_coffee,
            'description': 'The balanced second cup. Smooth and flavorful.',
            'base_price_etb': '60.00',
            'is_signature': False,
        },
        {
            'name': 'Baraka (Third Pour)',
            'category': cat_coffee,
            'description': 'The blessing. A light, delicate finish to the ceremony.',
            'base_price_etb': '40.00',
            'is_signature': False,
        },
        # Teas
        {
            'name': 'Spiced Black Tea (Shai)',
            'category': cat_tea,
            'description': 'Brewed with cardamom, cinnamon, and cloves.',
            'base_price_etb': '50.00',
            'is_signature': False,
        },
        {
            'name': 'Hibiscus Tea',
            'category': cat_tea,
            'description': 'Tart and refreshing, served hot or iced.',
            'base_price_etb': '65.00',
            'is_signature': False,
        },
        # Food
        {
            'name': 'Buna Dabo',
            'category': cat_food,
            'description': 'Traditional bread served during the coffee ceremony.',
            'base_price_etb': '40.00',
            'is_signature': True,
        },
        {
            'name': 'Spicy Shawarma',
            'category': cat_food,
            'description': 'Wrapped with fresh veggies and our signature sauce.',
            'base_price_etb': '250.00',
            'is_signature': False,
        },
        {
            'name': 'House Burger',
            'category': cat_food,
            'description': 'Juicy beef patty with caramelized onions and cheese.',
            'base_price_etb': '300.00',
            'is_signature': False,
        },
        {
            'name': 'Margherita Pizza',
            'category': cat_food,
            'description': 'Classic pizza with fresh tomatoes, mozzarella, and basil.',
            'base_price_etb': '400.00',
            'is_signature': False,
        },
        # Sweets
        {
            'name': 'Honey Cake',
            'category': cat_sweets,
            'description': 'Layered honey cake, soft and melting.',
            'base_price_etb': '120.00',
            'is_signature': True,
        },
        {
            'name': 'Chocolate Brownie',
            'category': cat_sweets,
            'description': 'Fudgy and rich, perfect alongside an Abol.',
            'base_price_etb': '100.00',
            'is_signature': False,
        },
    ]

    for item_data in items_to_create:
        obj, created = CoffeeItem.objects.get_or_create(
            name=item_data['name'],
            defaults={
                'category': item_data['category'],
                'description': item_data['description'],
                'price': item_data['base_price_etb'],
                'is_signature': item_data['is_signature'],
                'origin': 'Ethiopia',
                'roast_level': 'MEDIUM',
                'tasting_notes': 'Delicious',
                'image_url': 'https://images.pexels.com/photos/37756986/pexels-photo-37756986.jpeg?auto=compress&cs=tinysrgb&w=640&q=80',
            }
        )
        if created:
            print(f"Created {obj.name}")
        else:
            print(f"Skipped {obj.name} (already exists)")

if __name__ == '__main__':
    populate()
    print("Database populated successfully!")
