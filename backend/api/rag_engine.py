import os
import re
from .models import KnowledgeBase, CoffeeItem

class CoffeeSommelierRAG:
    """
    RAG Engine for Artisanal Coffee Sommelier:
    1. Retrieves relevant knowledge snippets & coffee items.
    2. Constructs augmented prompt context.
    3. Generates expert tasting, pairing, and recommendation response.
    """

    def retrieve_context(self, user_query):
        query_words = set(re.findall(r'\w+', user_query.lower()))
        
        # 1. Search Knowledge Base
        knowledge_entries = KnowledgeBase.objects.all()
        scored_kb = []
        for kb in knowledge_entries:
            text = f"{kb.title} {kb.category} {kb.content} {kb.tags}".lower()
            score = sum(1 for w in query_words if w in text and len(w) > 2)
            if score > 0:
                scored_kb.append((score, kb))
        
        scored_kb.sort(key=lambda x: x[0], reverse=True)
        top_kb = [item[1] for item in scored_kb[:3]]

        # 2. Search Coffee Menu Items
        coffee_items = CoffeeItem.objects.all()
        scored_coffees = []
        for coffee in coffee_items:
            text = f"{coffee.name} {coffee.category.name} {coffee.origin} {coffee.tasting_notes} {coffee.description}".lower()
            score = sum(1 for w in query_words if w in text and len(w) > 2)
            if score > 0:
                scored_coffees.append((score, coffee))
        
        scored_coffees.sort(key=lambda x: x[0], reverse=True)
        top_coffees = [item[1] for item in scored_coffees[:3]]

        # Fallback if query didn't match specific terms
        if not top_coffees:
            top_coffees = list(CoffeeItem.objects.filter(is_signature=True)[:2])

        return top_kb, top_coffees

    def generate_response(self, user_query):
        top_kb, recommended_coffees = self.retrieve_context(user_query)

        # Context Snippets
        kb_text = "\n".join([f"- [{kb.title}]: {kb.content}" for kb in top_kb])
        coffee_text = "\n".join([f"- {c.name} (${c.price}): {c.description} (Notes: {c.tasting_notes})" for c in recommended_coffees])

        # Try Gemini API if key is set
        api_key = os.environ.get("GEMINI_API_KEY", "")
        if api_key:
            try:
                from google import genai
                client = genai.Client(api_key=api_key)
                system_prompt = (
                    "You are Master Sommelier Clara Vance at Artisanal Reserve Coffee. "
                    "Use the provided coffee knowledge base and menu items to answer the guest's query warmly, "
                    "offering expert tasting advice, brewing parameters, and pairings."
                )
                prompt = f"{system_prompt}\n\nContext:\n{kb_text}\n\nFeatured Coffees:\n{coffee_text}\n\nGuest Query: {user_query}"
                response = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=prompt
                )
                return {
                    'answer': response.text,
                    'recommendations': [{'id': c.id, 'name': c.name, 'price': float(c.price), 'image_url': c.image_url} for c in recommended_coffees],
                    'sources': [kb.title for kb in top_kb]
                }
            except Exception as e:
                pass

        # Intelligent Fallback Sommelier Response Engine
        query_lower = user_query.lower()
        if 'light' in query_lower or 'pour' in query_lower or 'fruit' in query_lower or 'geisha' in query_lower:
            answer = (
                "For a vibrant, delicate cup, I recommend our **Panama Boquete Geisha Pour-Over** or **Ethiopian Geisha Honey Wash**. "
                "Both feature soaring florals of jasmine tea, wild peach, and Meyer lemon zest. "
                "Brewed with a ceramic V60 at 93°C (1:16 ratio), they showcase pristine altitude acidity and a clean, tea-like finish."
            )
        elif 'cold' in query_lower or 'ice' in query_lower or 'drip' in query_lower:
            answer = (
                "If you crave a refreshing, complex cold extraction, our **Kyoto 16-Hour Cold Drip** is unmatched. "
                "Slowly extracted drop-by-drop over 16 hours, it delivers rich whiskey barrel notes, dark cocoa, and zero bitterness. "
                "Best enjoyed over a single hand-carved ice sphere."
            )
        elif 'dark' in query_lower or 'bold' in query_lower or 'chocolate' in query_lower or 'strong' in query_lower:
            answer = (
                "For lovers of deep, opulent cocoa notes, I suggest our **Sumatra Blue Batak Dark Roast** or **Roasted Hazelnut Truffle Mocha**. "
                "They offer velvet body, 72% Ecuadorian dark chocolate, toasted hazelnut, and cedarwood spices that linger beautifully on the palate."
            )
        else:
            first_coffee = recommended_coffees[0] if recommended_coffees else None
            coffee_name = first_coffee.name if first_coffee else "Smoked Vanilla Bourbon Latte"
            answer = (
                f"Welcome to Artisanal Reserve! Based on your preference, I highly recommend experiencing our **{coffee_name}**. "
                f"Hand-roasted in small 5kg micro-batches, it delivers an exquisite harmony of aroma, velvet crema, and single-origin character. "
                f"Pairs wonderfully with fresh croissants or tiramisu."
            )

        return {
            'answer': answer,
            'recommendations': [{'id': c.id, 'name': c.name, 'price': float(c.price), 'image_url': c.image_url} for c in recommended_coffees],
            'sources': [kb.title for kb in top_kb] if top_kb else ["Artisanal Reserve Roast Guide"]
        }
