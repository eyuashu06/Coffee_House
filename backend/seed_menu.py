import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'coffee_project.settings')
django.setup()

from api.models import Category, CoffeeItem

categories = [
    ("Coffees", "coffees", "coffee"),
    ("Teas", "teas", "emoji-food-beverage"),
    ("Foods (Burgers, Pizzas, Fast Foods)", "foods", "fastfood"),
    ("Sweet Breads & Cakes", "sweets", "cake"),
]

for name, slug, icon in categories:
    Category.objects.get_or_create(slug=slug, defaults={"name": name, "icon": icon})

foods = Category.objects.get(slug="foods")
sweets = Category.objects.get(slug="sweets")

CoffeeItem.objects.get_or_create(
    name="Classic Beef Burger",
    defaults={
        "category": foods,
        "price": 350.00,
        "description": "Juicy beef patty with fresh lettuce, tomatoes, and house sauce.",
        "image_url": "https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?auto=compress&cs=tinysrgb&w=640&q=80",
        "is_signature": False
    }
)

CoffeeItem.objects.get_or_create(
    name="Margherita Pizza",
    defaults={
        "category": foods,
        "price": 450.00,
        "description": "Classic pizza with fresh mozzarella, tomatoes, and basil.",
        "image_url": "https://images.pexels.com/photos/1146760/pexels-photo-1146760.jpeg?auto=compress&cs=tinysrgb&w=640&q=80",
        "is_signature": False
    }
)

CoffeeItem.objects.get_or_create(
    name="Chicken Shawarma",
    defaults={
        "category": foods,
        "price": 300.00,
        "description": "Spiced chicken wrapped in flatbread with garlic sauce and pickles.",
        "image_url": "https://images.pexels.com/photos/461198/pexels-photo-461198.jpeg?auto=compress&cs=tinysrgb&w=640&q=80",
        "is_signature": False
    }
)

CoffeeItem.objects.get_or_create(
    name="Chocolate Lava Cake",
    defaults={
        "category": sweets,
        "price": 250.00,
        "description": "Decadent chocolate cake with a molten center.",
        "image_url": "https://images.pexels.com/photos/2067396/pexels-photo-2067396.jpeg?auto=compress&cs=tinysrgb&w=640&q=80",
        "is_signature": True
    }
)

CoffeeItem.objects.get_or_create(
    name="Fresh Croissant",
    defaults={
        "category": sweets,
        "price": 150.00,
        "description": "Buttery, flaky, and freshly baked every morning.",
        "image_url": "https://images.pexels.com/photos/2087287/pexels-photo-2087287.jpeg?auto=compress&cs=tinysrgb&w=640&q=80",
        "is_signature": False
    }
)

print("Menu seeding complete.")
