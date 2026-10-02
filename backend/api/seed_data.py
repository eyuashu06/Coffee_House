import os
import sys

# Ensure project root is on PYTHONPATH
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'coffee_project.settings')

import django
django.setup()

from api.models import Category, CoffeeItem, KnowledgeBase

def run_seed():
    print("Seeding Artisanal Reserve database...")

    # Categories
    cat_signature, _ = Category.objects.get_or_create(name='Signature Drinks', slug='signature', icon='local_cafe')
    cat_pourover, _ = Category.objects.get_or_create(name='Pour Over', slug='pour-over', icon='science')
    cat_colddrip, _ = Category.objects.get_or_create(name='Cold Drip Reserve', slug='cold-drip', icon='ac_unit')
    cat_beans, _ = Category.objects.get_or_create(name='Beans & Tins', slug='beans', icon='inventory_2')
    cat_pastry, _ = Category.objects.get_or_create(name='Bakery & Pastry', slug='pastry', icon='bakery_dining')

    # Coffee Items
    CoffeeItem.objects.get_or_create(
        name='Smoked Vanilla Bourbon Latte',
        category=cat_signature,
        price=6.80,
        description='Double shot espresso, Madagascar bourbon vanilla, steamed oat silk, charred cinnamon bark.',
        origin='Highland Bourbon Valley',
        altitude='1,850 MASL',
        process_method='Double Honey Processed',
        roast_level='Medium Roast',
        tasting_notes='Bourbon Vanilla, Charred Cinnamon, Caramelized Oak',
        rating=4.90,
        review_count=340,
        image_url='https://lh3.googleusercontent.com/aida-public/AB6AXuAOsK0B2OaF9I1OZxSUmDnm8qVaqONlJQwneI__5Y98mYedTSqhLCwKMbh_yYMUoX_eUKtCG4XOoN1iYhwTTAAQailct0cSDGiYxMLx223qoiQk2a3Shhfczo_yE0YXfox9nvtslrAiHqEEgJfcTNqy1rmruhPHXMUT3l55C4mM_DkwUcxDRgkoCBYTI2AJX8thxOlM---aZURc-Fb_EK5jAMliLo_2VqlMtSbXj6ZEr9Qg2JNONSsa',
        is_signature=True
    )

    CoffeeItem.objects.get_or_create(
        name='Spanish Saffron Flat White',
        category=cat_signature,
        price=7.10,
        description='Micro-foamed whole milk, infused saffron thread extraction, single estate Colombian roast.',
        origin='Huila, Colombia',
        altitude='1,900 MASL',
        process_method='Washed Aerobic',
        roast_level='Light Roast',
        tasting_notes='Saffron Crema, Floral Honey, Golden Apricot',
        rating=5.00,
        review_count=215,
        image_url='https://lh3.googleusercontent.com/aida-public/AB6AXuCpHZ8vSVDO1Vu3HwH7vxd0OE8IempIuTx14iLJMSoVByavHRxFdKaofA28FlVi5ecCpEECgu3q-9zgdWp80LOL-yg7cdsn4ZVE3F950AXCgB80HN6PQZCgmpphbU2cWVlJy4HWb1pd_A8LVeM-TFjzewhyDqXrTXBvVOaZ7U05aCYK0xlHWj8N5eNH6SggIcpEMwVw2gYCOsAt0ILrtVjejzlErimnE2dzYCtVx4tyNc52HdMIO_ay',
        is_signature=True
    )

    CoffeeItem.objects.get_or_create(
        name='Kyoto 16-Hour Cold Drip',
        category=cat_colddrip,
        price=8.00,
        description='Cold water extraction drop-by-drop over Dutch glass towers. Whiskey barrel aged hints with silky finish.',
        origin='Antioquia, Colombia',
        altitude='2,000 MASL',
        process_method='Dutch Cold Water Extraction',
        roast_level='Dark Barrel',
        tasting_notes='Whiskey Oak, Dark Cacao, Black Cherry',
        rating=4.95,
        review_count=180,
        image_url='https://lh3.googleusercontent.com/aida-public/AB6AXuALioPFauhCbqw0rs4z3AreRdOt8RlK_1_Eq9Ye4gVwMrfw1aJL4uNl4MLfVvfXT7-Nu4wIIjx979DeoOZ3u1abUp_0ihmOZkji1UxHzebDQ5wXBwgiKAa9f-QVUYWvpBLafdOmP52X-U4wy5GpxP5Ntv7KkYryUKLFqexCnpFTgcIlDTCi4kF9qm4nfT8mEPrsoCPaacWJWdT3Lpxm_Eyd4i0sOBiQ96rmSxhWTVVougxtU9LE9uNg',
        is_signature=True
    )

    CoffeeItem.objects.get_or_create(
        name='Panama Boquete Geisha Pour-Over',
        category=cat_pourover,
        price=9.50,
        description='Hand-poured V60 with delicate notes of wild guava, jasmine tea, and vibrant Meyer lemon zest.',
        origin='Boquete, Panama',
        altitude='2,150 MASL',
        process_method='Natural Anaerobic Fermentation',
        roast_level='Ultra Light Roast',
        tasting_notes='Jasmine Tea, Meyer Lemon Zest, Bergamot, Guava',
        rating=4.95,
        review_count=290,
        image_url='https://lh3.googleusercontent.com/aida-public/AB6AXuDWZcMNjiW8Tw3nw5GCvRtaI0nwk7JFs6cCwxVZhTVFoVKn845tJj21jG_sGbJEPSHeK3TLuJWrXGd0WY9q0Z63P9atQiZyRK6Z5HboVHRrBx7ZuePEhfgC_PwZn_fJiuleiGHt7xZuXr9YJxAIoQBgAJH7Aw7n75H_R6izN9LfaImd21FbeJOj5Es7qib9SCNCMlmDWu-JDtqATWq4r1-mdjrmrmYkRSL7TGRBI3fOqpioWfakvVRs',
        is_signature=True
    )

    CoffeeItem.objects.get_or_create(
        name='Ethiopian Geisha Honey Wash',
        category=cat_pourover,
        price=7.25,
        description='Single-origin micro-lot from Bench Maji. Soaring florals, peach blossom, and sparkling bergamot.',
        origin='Bench Maji, Ethiopia',
        altitude='2,100 MASL',
        process_method='Honey Processed',
        roast_level='Light Roast',
        tasting_notes='Jasmine, Peach Blossom, Bergamot',
        rating=4.95,
        review_count=145,
        image_url='https://lh3.googleusercontent.com/aida-public/AB6AXuCBeQuQkvjJch3k03gIZ1HXmn5HoBPeJqL3EQzpxczX_Jvl7WdQ6BVxTU6nDe8q26SyVyRjTdbddPt01l4s18LLBbxlbzmnPN4O7hyaOft5wYn1SkqQcPjLsSxw7QArl-OFK3hpMQW04JL5ch8DpY6T5FGtJ9-f9HHF7r_MSY1uyu0x7FG04T8UTVvlhwhScHysvhNyGTMN5pVKl0-defg3r0D13EXPvldYY9-8bktXFoHcdUPgNnDF',
        is_signature=False
    )

    CoffeeItem.objects.get_or_create(
        name='Sumatra Blue Batak Dark Roast',
        category=cat_beans,
        price=6.00,
        description='Volcanic terroir single-origin from Lake Toba. Full body, wet hulled with dark chocolate and cedar.',
        origin='Lake Toba, Sumatra',
        altitude='1,600 MASL',
        process_method='Wet Hulled Giling Basah',
        roast_level='Full Dark Roast',
        tasting_notes='Dark Chocolate, Cedarwood, Clove',
        rating=4.88,
        review_count=110,
        image_url='https://lh3.googleusercontent.com/aida-public/AB6AXuBrfhhUrffca4cUdOdFoEkgTf5qoUpYLRJmFy1KAsvpUo8Lch79bpB1i69jgQt0t3T4O6yp4d7-RZtYpVtk4WgQYVzRvSrGpcjs4KJRnDMg8t93N8kGoUpYc3xY4L4RdKBOW_r-C9zJVCwxZyYJ_NuS0JA2DazN8aRdgsZcI1JQoT-0anEEvyVRtBZlwtFmJHYKhuflrzEmVGcH_sgj2XeBVb__VeGD4RX1xKV9VUBGSUgdKpjB4Uym',
        is_signature=False
    )

    # RAG Knowledge Base Seed
    KnowledgeBase.objects.get_or_create(
        title='Geisha & Floral Micro-Lots Guide',
        category='Origin & Science',
        content='Panama Geisha and Ethiopian Geisha varieties cultivated above 1,900 MASL produce intoxicating floral aromatics of jasmine, bergamot, peach, and guava. Best brewed using pour-over V60 or Chemex at 92-94°C with soft water (50-70 ppm) to accentuate volatile floral oils.',
        tags='geisha, ethiopia, panama, jasmine, pour over, v60, light roast'
    )

    KnowledgeBase.objects.get_or_create(
        title='Cold Extraction & Dutch Tower Method',
        category='Brew Science',
        content='Kyoto Dutch cold drip extraction uses ice-cold water dripping drop-by-drop over 12-18 hours. This slow oxidation prevents tannin bitterness while concentrating heavy cocoa esters, whiskey oak notes, and a velvety syrupy mouthfeel.',
        tags='cold drip, kyoto, cold brew, dutch drip, dark roast, ice'
    )

    KnowledgeBase.objects.get_or_create(
        title='Artisanal Pastry Pairing Science',
        category='Pairing',
        content='Butter croissants pair impeccably with high-acidity washed Geishas. Rich chocolate pastries like tiramisu and cocoa truffles balance deep volcanic dark roasts like Sumatra Blue Batak and Roasted Hazelnut Truffle Mocha.',
        tags='pairing, bakery, croissant, tiramisu, chocolate, breakfast'
    )

    print("Database seeding completed successfully!")

if __name__ == '__main__':
    import django
    django.setup()
    run_seed()
