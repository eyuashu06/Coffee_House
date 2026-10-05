import sqlite3

images = {
    # Coffee and Tea
    6: "https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&w=640&q=80", # Abol - coffee
    7: "https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=640&q=80", # Tona - coffee
    8: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=640&q=80", # Baraka - coffee
    9: "https://images.unsplash.com/photo-1576092762791-dd9e2220abd4?auto=format&fit=crop&w=640&q=80", # Spiced Black Tea
    10: "https://images.unsplash.com/photo-1596803244618-8dbee441d70b?auto=format&fit=crop&w=640&q=80", # Hibiscus Tea
    
    # Food
    1: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=640&q=80", # Classic Beef Burger
    13: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=640&q=80", # House Burger
    2: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=640&q=80", # Margherita Pizza
    3: "https://images.unsplash.com/photo-1619881589316-56c7f9e6b587?auto=format&fit=crop&w=640&q=80", # Chicken Shawarma
    12: "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=640&q=80", # Spicy Shawarma
    
    # Pastries & Cakes
    5: "https://images.unsplash.com/photo-1555507036-ab1e4006aaeb?auto=format&fit=crop&w=640&q=80", # Fresh Croissant
    11: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=640&q=80", # Buna Dabo
    4: "https://images.unsplash.com/photo-1579306194872-64d3b7bac4c2?auto=format&fit=crop&w=640&q=80", # Chocolate Lava Cake
    14: "https://images.unsplash.com/photo-1588195538326-c5b1e9f80a1b?auto=format&fit=crop&w=640&q=80", # Honey Cake
    15: "https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?auto=format&fit=crop&w=640&q=80", # Chocolate Brownie
}

conn = sqlite3.connect('db.sqlite3')
c = conn.cursor()

for item_id, url in images.items():
    c.execute("UPDATE api_coffeeitem SET image_url = ? WHERE id = ?", (url, item_id))

conn.commit()
conn.close()
print("Images updated successfully.")
