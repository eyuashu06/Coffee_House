"""
Bilingual (English / Amharic) keyword lexicon and intent detection for the
Coffee House assistant.

No translation service is required: Amharic keywords are mapped directly to
intents and to canonical menu categories so questions like
"ምን አይነት ቡና አላችሁ?" ("what coffee do you have?") resolve correctly.
"""

# ── Intent keywords ───────────────────────────────────────────────────
# Amharic plurals ("ቡናችሁ", "ቡናዎች") are handled by prefix matching in tokenize().

INTENT_KEYWORDS = {
    'greeting': {
        'en': ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'greetings'],
        'am': ['ሰላም', 'ሰላምህ', 'ጤና ይስጥልኝ', 'እንደምን አደሩ', 'እንደምን አመሹ', 'እንደምን ዋሉ', 'ሰላም ደህና መጡ'],
    },
    'thanks': {
        'en': ['thank', 'thanks', 'thx'],
        'am': ['አመሰግናለሁ', 'እናመሰግናለሁ', 'በጣም', 'እሺ'],
    },
    'about': {
        'en': ['about', 'what is this', 'what is this system', 'who are you', 'your name', 'help'],
        'am': ['ስለእርስዎ', 'ማን ነህ', 'ማን ነዎት', 'ስምህ', 'ስምዎ', 'ስለ ኮፊ ሃውስ', 'ይህ ምን ነው'],
    },
    'hours': {
        'en': ['open', 'opening', 'close', 'closing', 'hours', 'time are you open', 'still open'],
        'am': ['ክፍት', 'ዝግ', 'ሰዓት', 'መክፈቻ ሰዓት', 'የሚከፈተው', 'ስንት ሰዓት'],
    },
    'location': {
        'en': ['where', 'location', 'address', 'find you', 'directions', 'where are you', 'phone number', 'contact'],
        'am': ['ቦታ', 'አድራሻ', 'አድራሻዎ', 'ስልክ', 'የት ነው', 'የት ናችሁ', 'ተጫያቢ'],
    },
    'price': {
        'en': ['price', 'prices', 'cost', 'how much', 'how many birr', 'etb', 'birr'],
        'am': ['ዋጋ', 'ዋጋው', 'ብር', 'ስንት ነው', 'ስንት'],
    },
    'ingredients': {
        'en': ['ingredient', 'ingredients', 'made of', 'made from', 'contains', 'what is in', 'flavor', 'flavour'],
        'am': ['ይዘት', 'ምን ይዟል', 'የተዘጋጀው', 'ጣዕም', 'የሚሰራው'],
    },
    'availability': {
        'en': ['available', 'availability', 'in stock', 'sold out', 'today menu', "today's menu", 'open now', 'still have'],
        'am': ['ይገኛል', 'አለ', 'አይገኝም', 'አላችሁ', 'አላችሁን', 'አለህ', 'ያለ', 'የዛሬ ሜኑ'],
    },
    'reservation_create': {
        'en': ['reserve', 'reservation', 'book', 'booking', 'table for', 'reserve a table',
               'i need a table', 'reserve', 'booking a table', 'book a table', 'reservation for',
               'make a reservation', 'reserve for', 'book for', 'booking for', 'reserve table',
               'i want to book', 'i want to reserve', 'want a table', 'need a table',
               'reserve it', 'book it', 'party of', 'table booking'],
        'am': ['ማስያዝ', 'ቦታ ማስያዝ', 'ቦታ አስያዝ', 'ቦታ እፈልጋለሁ', 'ቦታ ለማስያዝ', 'ቦታ ማስያዝ እፈልጋለሁ', 'ትራፔዛ'],
    },
    'reservation_cancel': {
        'en': ['cancel', 'cancellation', 'call off', 'cancel reservation', 'cancel my reservation',
               'cancel booking', 'cancel my booking'],
        'am': ['መሰረዝ', 'ማሰረዝ', 'ተሰርዟል', 'ማስያዣውን መሰረዝ', 'ቦታ ማስያዣ መሰረዝ', 'ሰርዝ'],
    },
    'reservation_status': {
        'en': ['my reservation', 'reservation status', 'check my booking', 'did my reservation',
               'did i book', 'is my booking'],
        'am': ['የእኔ ማስያዣ', 'የማስያዣ ሁኔታ', 'ማስያዣዬ ተረጋግጧል', 'ያዘዝኩት'],
    },
    'recommend': {
        'en': ['recommend', 'recommendation', 'suggest', 'suggestion', 'what should i', 'best', 'favorite', 'favourite'],
        'am': ['እመክር', 'ምክር', 'ምርጥ', 'የሚመከር', 'ምን ይሻላል'],
    },
    'cheapest': {
        'en': ['cheapest', 'least expensive', 'lowest price', 'budget', 'affordable'],
        'am': ['አነስተኛ', 'ርካሽ', 'ቀሊል', 'ዝቅተኛ ዋጋ'],
    },
    'menu_list': {
        'en': ['menu', 'what do you have', 'what do you serve', 'what food', 'what drinks',
               'options', 'list', 'show me', 'what is available'],
        'am': ['ሜኑ', 'ምን አላችሁ', 'ምግብ', 'መጠጦች', 'አማራጮች', 'ዝርዝር', 'አሳይኝ', 'ቡናዎች', 'ሻይዎች', 'ፒዛዎች', 'በርገሮች', 'አይነት', 'አለህ', 'አላቸውም', 'አላችሁን'],
    },
    'diet': {
        'en': ['vegetarian', 'vegan', 'meat-free', 'no meat', 'veggie', 'vegetable'],
        'am': ['የአትክልት', 'የአጥር', 'ቬጀቴሪያን', 'ቬጌን', 'ያለ ስጋ', 'ያለ ስጠር', 'አትክልት'],
    },
    'order_help': {
        'en': ['order', 'how do i order', 'delivery', 'takeaway', 'pickup', 'payment', 'pay', 'chapa'],
        'am': ['ትዕዛዝ', 'እንዴት ማዘዝ', 'ማድረስ', 'ክፍያ', 'ቻፓ', 'እንዴት እንዛዛለን'],
    },
}

# ── Category detection ────────────────────────────────────────────────
# Canonical keys must match apps.menu.Category slugs.

CATEGORY_KEYWORDS = {
    'micro-lot-coffee': {
        'en': ['coffee', 'espresso', 'single origin', 'micro lot', 'micro-lot', 'brew', 'pour over', 'filter'],
        'am': ['ቡና', 'ቡናዎች', 'ኢስፕሬሶ', 'ምንጭ ቡና'],
    },
    'espresso-infusions': {
        'en': ['espresso', 'cappuccino', 'latte', 'mocha', 'macchiato', 'americano', 'cold brew'],
        'am': ['ኢስፕሬሶ', 'ካፑቺኖ', 'ላቴ', 'ሞካ', 'ማኪያቶ'],
    },
    'premium-tea': {
        'en': ['tea', 'chai', 'matcha', 'mint', 'herbal', 'infusion', 'spice tea', 'green tea', 'black tea'],
        'am': ['ሻይ', 'ሻይዎች', 'ጫይ', 'ቻይ', 'ማንት', 'ቅመም', 'ሻይ ቅመም'],
    },
    'artisanal-burgers': {
        'en': ['burger', 'burgers', 'beef', 'cheeseburger', 'beyond', 'smash'],
        'am': ['በርገር', 'በርገሮች', 'ስጋ', 'በርጋር', 'በርጋሮች'],
    },
    'wood-fired-pizza': {
        'en': ['pizza', 'pizzas', 'margherita', 'pepperoni', 'nduja'],
        'am': ['ፒዛ', 'ፒዛዎች'],
    },
    'shawarma-wraps': {
        'en': ['shawarma', 'wrap', 'wraps', 'falafel', 'kebab'],
        'am': ['ሻዋርማ', 'ሻዋርማዎች', 'ወራፕ', 'ፋላፌል'],
    },
    'fast-food': {
        'en': ['fries', 'wings', 'sandwich', 'hot dog', 'nachos', 'snack', 'fast food'],
        'am': ['ፍራይስ', 'ቺፕስ', 'ሳንድቪች', 'ፈጣን ምግብ'],
    },
    'bakery-pastry': {
        'en': ['bakery', 'pastry', 'croissant', 'tiramisu', 'cake', 'dessert', 'sweet', 'bread'],
        'am': ['ኬክ', 'ክሮዋሰንት', 'ቲራሚሱ', 'ዳቦ', 'ጣፋጭ'],
    },
}

# ── Out-of-scope guard ────────────────────────────────────────────────

OUT_OF_SCOPE = {
    'en': ['python', 'javascript', 'code', 'program', 'programming', 'function', 'algorithm', 'sql', 'html',
           'css', 'java', 'c++', 'rust', 'golang', 'debug', 'compile', 'api key', 'regex',
           'president', 'prime minister', 'election', 'war', 'football', 'who won', 'score',
           'joke', 'funny', 'laugh', 'tell me a story', 'poem', 'song', 'movie', 'weather',
           'stock', 'crypto', 'bitcoin', 'politics', 'religion'],
    'am': ['ኮድ', 'ፕሮግራም', 'ዜና', 'ፖለቲካ', 'ጨዋታ', 'አየር ሁኔታ', 'ክሪፕቶ', 'ቢትኮይን'],
}

# ── Reservation slot words ────────────────────────────────────────────

TOMORROW_WORDS = {'en': ['today', 'tomorrow', 'tonight', 'tomorrow morning', 'tomorrow evening'],
                  'am': ['ዛሬ', 'ነገ', 'ዛሬ ከሰዓት', 'ነገ ከሰዓት', 'ዛሬ ማታ']}

DAYS_OF_WEEK = {
    'monday': '0', 'tuesday': '1', 'wednesday': '2', 'thursday': '3',
    'friday': '4', 'saturday': '5', 'sunday': '6',
}

# Amharic numerals -> digits (used for guest counts and times)
AMHARIC_DIGITS = {
    '፩': '1', 'ሁ': '1', 'ሂ': '2', 'ሃ': '3', 'ሄ': '4', 'ህ': '5', 'ሆ': '6', 'ሇ': '7',
    'ለ': '8', 'ሉ': '9', 'አ': '0', 'አሐ': '10',
}

AMHARIC_NUMBER_WORDS = {
    'አንድ': 1, 'ሁለት': 2, 'ሦስት': 3, 'አራት': 4, 'አምስት': 5, 'ስድስት': 6, 'ሰባት': 7,
    'ስምንት': 8, 'ዘጠኝ': 9, 'አስር': 10,
}

INTENT_LABEL_EN = {
    'greeting': 'greeting',
    'thanks': 'thanks',
    'about': 'about',
    'hours': 'hours',
    'location': 'location',
    'price': 'price',
    'ingredients': 'ingredients',
    'availability': 'availability',
    'reservation_create': 'reservation_create',
    'reservation_cancel': 'reservation_cancel',
    'reservation_status': 'reservation_status',
    'recommend': 'recommend',
    'cheapest': 'cheapest',
    'menu_list': 'menu_list',
    'order_help': 'order_help',
    'unknown_item': 'unknown_item',
    'out_of_scope': 'out_of_scope',
    'unknown': 'unknown',
}

def _build_question_words():
    words = set()
    for groups in INTENT_KEYWORDS.values():
        for lang in ('en', 'am'):
            for phrase in groups.get(lang, []):
                for word in phrase.split():
                    if word:
                        words.add(word.lower())
    return words


QUESTION_WORDS = _build_question_words()


def _build_category_words():
    words = set()
    for groups in CATEGORY_KEYWORDS.values():
        for lang in ('en', 'am'):
            for phrase in groups.get(lang, []):
                for word in phrase.split():
                    if word:
                        words.add(word.lower())
    return words


CATEGORY_KEYWORD_WORDS = _build_category_words()
