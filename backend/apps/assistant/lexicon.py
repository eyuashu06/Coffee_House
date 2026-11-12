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
        'am': ['ሰላም', 'ሰላምህ', 'ጤና ይስጥልኝ', 'እንደምን አደሩ', 'እንደምን አመሹ', 'እንደምን ዋሉ', 'ሰላም ደህና መጡ',
               'selam', 'selamta', 'selamno', 'selamnesh', 'selamneh', 'selamnachu', 'selamnachehu',
               'tadiya', 'tadiyas', 'kemey', 'endet neh', 'endet nesh', 'endet nachu', 'endemin',
               'endemin aderachu', 'endemin walachu', 'dehna neh', 'dehna nesh', 'dehna nachu',
               'tena yistilign', 'tenayistilign'],
    },
    'thanks': {
        'en': ['thank', 'thanks', 'thx'],
        'am': ['አመሰግናለሁ', 'እናመሰግናለሁ', 'በጣም', 'እሺ',
               'ameseginalew', 'ameseginalehu', 'ameseginalehugn', 'amesegnalew', 'amesegnalehu',
               'eshi', 'ishi', 'betam ameseginalew'],
    },
    'about': {
        'en': ['about', 'what is this', 'what is this system', 'who are you', 'your name', 'help',
               'what can you do', 'how does this work', 'about the system',
               'what is buna hub', 'what is buna', 'about buna hub', 'about buna',
               'tell me about buna hub', 'tell me about buna', 'buna hub',
               'about coffee house', 'what is coffee house', 'tell me about coffee house',
               'story', 'our story', 'history', 'heritage', 'tell me your story'],
        'am': [
            'ቡና ሁብ ምንድነው', 'ቡና ሁብ ምንነው', 'ቡና ሁብ ምን ነው', 'ቡና ሁብ ምንድን ነው',
            'ስለ ቡና ሁብ', 'ስለ ቡና ሁብ ንገረኝ', 'ቡና ሁብ',
            'ታሪክ', 'ታሪካችሁ', 'ታሪካችሁ ምንድነው', 'ታሪካችሁ ምን ነው', 'ታሪካችሁን ንገረኝ', 'ስለ ታሪካችሁ',
            'ኮፊ ሃውስ ምንድነው', 'ኮፊ ሃውስ ምንነው', 'ኮፊ ሃውስ ምን ነው',
            'ይህ ስርዓት ምንነው', 'ይህ ስርዓት ምን ነው', 'ይህ ስርዓት ምንድነው', 'ይህ ስርዓት ምንድን ነው',
            'ስርዓቱ ምንድነው', 'ስርዓቱ ምን ነው', 'ስርዓቱ ምንነው',
            'ይህ ሲስተም ምን ነው', 'ይህ ሲስተም ምንነው', 'ይህ ሲስተም ምንድነው', 'ይህ ሲስተም ምንድን ነው',
            'ሲስተሙ ምንድነው', 'ሲስተሙ ምን ነው', 'ሲስተሙ ምንነው',
            'ስለ ስርዓቱ', 'ስለ ሲስተሙ', 'ስለዚህ ስርዓት', 'ስለዚህ ሲስተም',
            'ስለ ኮፊ ሃውስ', 'ስለ coffee house', 'coffee house', 'ስለ ቡና ቤቱ', 'ስለዚህ ቡና ቤት',
            'ምን ትሰራለህ', 'ምን ትሰሪያለሽ', 'ምን ትሰራላችሁ',
            'ምን ታደርጋለህ', 'ምን ታደርጊያለሽ', 'ምን ታደርጋላችሁ',
            'ምን ታግዛለህ', 'ምን ታግዣለሽ', 'ምን ታግዛላችሁ',
            'ምን ልትረዳኝ ትችላለህ', 'ምን ልትረዱኝ ትችላላችሁ',
            'ረዳቱ ምንድነው', 'ስለ ረዳቱ', 'ይህ ረዳት ምንድነው', 'ይህ ረዳት ምንነው', 'ይህ ረዳት ምን ነው',
            'ይህ ምን ነው', 'ይህ ምንነው', 'ይህ ምንድነው', 'ይህ ምንድን ነው', 'ይህ ምን እንደሆነ',
            'ስለእርስዎ', 'ስለ አንተ', 'ስለ አንቺ', 'ስለ እናንተ',
            'ማን ነህ', 'ማን ነሽ', 'ማን ነዎት', 'ማን ናችሁ',
            'ስምህ', 'ስምሽ', 'ስምዎ', 'ስምችሁ',
            'buna hub mindenew', 'buna hub min naw', 'buna hub mindinew', 'sle buna hub',
            'tarik', 'tarikachehu', 'tarikachu', 'tarikachehu minden new', 'tarikachehu minedin new',
            'tarikachehu min naw', 'sle tarikachehu', 'tarikun negeregn', 'man nachu', 'man neh',
            'man nesh', 'min tiseralachu', 'min litredugn tichilalachu',
        ],
    },
    'hours': {
        'en': ['open', 'opening', 'close', 'closing', 'hours', 'time are you open', 'still open'],
        'am': ['ክፍት', 'ዝግ', 'ሰዓት', 'መክፈቻ ሰዓት', 'የሚከፈተው', 'ስንት ሰዓት',
               'kift', 'zig', 'seat', 'sehat', 'se\'at', 'mekfecha', 'kift nachu', 'sint seat'],
    },
    'location': {
        'en': ['where', 'location', 'address', 'find you', 'directions', 'where are you', 'phone number', 'contact'],
        'am': ['ቦታ', 'አድራሻ', 'አድራሻዎ', 'ስልክ', 'የት ነው', 'የት ናችሁ', 'ተጫያቢ',
               'yet new', 'yet naw', 'yet nachu', 'adrasha', 'adrashachu', 'bota', 'yet new yemitgegnut'],
    },
    'price': {
        'en': ['price', 'prices', 'cost', 'how much', 'how many birr', 'etb', 'birr'],
        'am': ['ዋጋ', 'ዋጋው', 'ብር', 'ስንት ነው', 'ስንት',
               'waga', 'wagaw', 'sint new', 'sint naw', 'sint', 'birr', 'sint birr', 'waga sint new'],
    },
    'ingredients': {
        'en': ['ingredient', 'ingredients', 'made of', 'made from', 'contains', 'what is in', 'flavor', 'flavour'],
        'am': ['ይዘት', 'ምን ይዟል', 'የተዘጋጀው', 'ጣዕም', 'የሚሰራው',
               'min yizwal', 'yetezegajew', 'yemiserawe'],
    },
    'availability': {
        'en': ['available', 'availability', 'in stock', 'sold out', 'today menu', "today's menu", 'open now', 'still have'],
        'am': ['ይገኛል', 'አለ', 'አይገኝም', 'አላችሁ', 'አላችሁን', 'አለህ', 'ያለ', 'የዛሬ ሜኑ',
               'ale', 'alle', 'alew', 'alachu', 'alachehu', 'alachun', 'yigegnal', 'ygezal'],
    },
    'reservation_create': {
        'en': ['reserve', 'reservation', 'book', 'booking', 'table for', 'reserve a table',
               'i need a table', 'reserve', 'booking a table', 'book a table', 'reservation for',
               'make a reservation', 'reserve for', 'book for', 'booking for', 'reserve table',
               'i want to book', 'i want to reserve', 'want a table', 'need a table',
               'reserve it', 'book it', 'party of', 'table booking'],
        'am': ['ማስያዝ', 'ቦታ ማስያዝ', 'ቦታ አስያዝ', 'ቦታ እፈልጋለሁ', 'ቦታ ለማስያዝ', 'ቦታ ማስያዝ እፈልጋለሁ', 'ትራፔዛ',
               'bota masyaz', 'bota asyaz', 'bota efelegalehu', 'bota ifelegalehu', 'bota lemasyaz', 'trapeza'],
    },
    'reservation_cancel': {
        'en': ['cancel', 'cancellation', 'call off', 'cancel reservation', 'cancel my reservation',
               'cancel booking', 'cancel my booking'],
        'am': ['መሰረዝ', 'ማሰረዝ', 'ተሰርዟል', 'ማስያዣውን መሰረዝ', 'ቦታ ማስያዣ መሰረዝ', 'ሰርዝ',
               'maserez', 'meserez', 'bota masyazha serez', 'serez'],
    },
    'reservation_status': {
        'en': ['my reservation', 'reservation status', 'check my booking', 'did my reservation',
               'did i book', 'is my booking'],
        'am': ['የእኔ ማስያዣ', 'የማስያዣ ሁኔታ', 'ማስያዣዬ ተረጋግጧል', 'ያዘዝኩት',
               'yene masyazha', 'masyazhaye'],
    },
    'recommend': {
        'en': ['recommend', 'recommendation', 'suggest', 'suggestion', 'what should i', 'best', 'favorite', 'favourite'],
        'am': ['እመክር', 'ምክር', 'ምርጥ', 'የሚመከር', 'ምን ይሻላል',
               'emikir', 'mikir', 'mirt', 'yemimeker', 'min yishalal', 'min timekregnalesh'],
    },
    'cheapest': {
        'en': ['cheapest', 'least expensive', 'lowest price', 'budget', 'affordable'],
        'am': ['አነስተኛ', 'ርካሽ', 'ቀሊል', 'ዝቅተኛ ዋጋ',
               'anestegna', 'rikash', 'kelil', 'zikitigna waga'],
    },
    'menu_list': {
        'en': ['menu', 'what do you have', 'what do you serve', 'what food', 'what drinks',
               'drink menu', 'drinks menu', 'food menu', 'do you have drinks', 'do you have food',
               'options', 'list', 'show me', 'what is available'],
        'am': ['ሜኑ', 'ምን አላችሁ', 'ምግብ', 'ምግቦች', 'ምን አይነት ምግብ', 'የምግብ ሜኑ', 'ምግብ ሜኑ',
               'መጠጥ', 'መጠጦች', 'ምን አይነት መጠጥ', 'ምን አይነት መጠጦች', 'የመጠጥ ሜኑ', 'መጠጥ ሜኑ',
               'አማራጮች', 'ዝርዝር', 'አሳይኝ', 'ቡናዎች', 'ሻይዎች', 'ፒዛዎች', 'በርገሮች',
               'አይነት', 'አለህ', 'አላቸውም', 'አላችሁን',
               'menu', 'min alachu', 'min aleh', 'min alesh', 'megeb', 'migib', 'megeboch', 'migiboch',
               'metet', 'metetoch', 'asayegn', 'asayugn', 'asayun', 'menu asayegn', 'menu asayugn',
               'min megeb alachu', 'min metet alachu', 'buna alachu', 'pizza alachu', 'burger alachu'],
    },
    'diet': {
        'en': ['vegetarian', 'vegan', 'meat-free', 'no meat', 'veggie', 'vegetable'],
        'am': ['የአትክልት', 'የአጥር', 'ቬጀቴሪያን', 'ቬጌን', 'ያለ ስጋ', 'ያለ ስጠር', 'አትክልት',
               'yeatikilt', 'yale sega', 'vegetarian'],
    },
    'order_help': {
        'en': ['how do i order', 'how can i order', 'order process', 'payment', 'pay', 'chapa',
               'payment method', 'how does ordering work'],
        'am': ['እንዴት ማዘዝ እንደምችላለሁ', 'የመክፈያ ዘዴ', 'ክፍያ', 'ቻፓ', 'እንዴት እንዛዛለን',
               'endet mazez', 'kifia', 'chapa'],
    },
    'order_create': {
        'en': ['i want to order', 'i would like to order', 'can i order', 'place an order',
               'order for me', 'i\'d like', 'i will have', 'give me a', 'order me', 'order two',
               'order 2', 'add to my order', 'add to cart', 'i\'ll take', "i'll take"],
        'am': ['ትዕዛዝ ለመስጠት', 'ትዕዛዝ ላስጠቅም', 'እንዴት ብቻለሁ', 'ለእኔ አስያዝ',
               'ወደ ግዢ ቅርጫት አስገባ', 'በግዢ ቅርጫት አስገባ', 'አንድ አመጣልኝ',
               'tizaz', 'mazaz', 'mazaz efelegalehu', 'ametalign', 'asgebalign', 'wede kurchat'],
    },
    'order_status': {
        'en': ['my order', 'my orders', 'order status', 'where is my order', 'track my order',
               'order history', 'did my order', 'has my order'],
        'am': ['የእኔ ትዕዛዝ', 'የእኔ ትዕዛዞች', 'የትዕዛዝ ሁኔታ', 'ትዕዛዤን አለበለግ',
               'የትዕዛዝ ታሪክ'],
    },
    'order_cancel': {
        'en': ['cancel my order', 'cancel order', 'cancel the order'],
        'am': ['ትዕዛዤን መሰረዝ', 'ትዕዛዝ መሰረዝ'],
    },
}

# ── Category detection ────────────────────────────────────────────────
# Canonical keys must match apps.menu.Category slugs.

CATEGORY_KEYWORDS = {
    'micro-lot-coffee': {
        'en': ['coffee', 'espresso', 'single origin', 'micro lot', 'micro-lot', 'brew', 'pour over', 'filter'],
        'am': ['ቡና', 'ቡናዎች', 'ኢስፕሬሶ', 'ምንጭ ቡና', 'buna', 'bunaw', 'yebuna', 'jebena'],
    },
    'espresso-infusions': {
        'en': ['espresso', 'cappuccino', 'latte', 'mocha', 'macchiato', 'americano', 'cold brew'],
        'am': ['ኢስፕሬሶ', 'ካፑቺኖ', 'ላቴ', 'ሞካ', 'ማኪያቶ', 'makiato', 'macchiato'],
    },
    'premium-tea': {
        'en': ['tea', 'chai', 'matcha', 'mint', 'herbal', 'infusion', 'spice tea', 'green tea', 'black tea'],
        'am': ['ሻይ', 'ሻይዎች', 'ጫይ', 'ቻይ', 'ማንት', 'ቅመም', 'ሻይ ቅመም', 'shai', 'shay', 'chay'],
    },
    'artisanal-burgers': {
        'en': ['burger', 'burgers', 'beef', 'cheeseburger', 'beyond', 'smash'],
        'am': ['በርገር', 'በርገሮች', 'ስጋ', 'በርጋር', 'በርጋሮች', 'burger', 'berger', 'bergar'],
    },
    'wood-fired-pizza': {
        'en': ['pizza', 'pizzas', 'margherita', 'pepperoni', 'nduja'],
        'am': ['ፒዛ', 'ፒዛዎች', 'pizza', 'pizaw', 'piza'],
    },
    'shawarma-wraps': {
        'en': ['shawarma', 'wrap', 'wraps', 'falafel', 'kebab'],
        'am': ['ሻዋርማ', 'ሻዋርማዎች', 'ወራፕ', 'ፋላፌል', 'shawarma'],
    },
    'fast-food': {
        'en': ['fries', 'wings', 'sandwich', 'hot dog', 'nachos', 'snack', 'fast food'],
        'am': ['ፍራይስ', 'ቺፕስ', 'ሳንድቪች', 'ፈጣን ምግብ', 'chips', 'fries'],
    },
    'bakery-pastry': {
        'en': ['bakery', 'pastry', 'croissant', 'tiramisu', 'cake', 'dessert', 'sweet', 'bread'],
        'am': ['ኬክ', 'ክሮዋሰንት', 'ቲራሚሱ', 'ዳቦ', 'ጣፋጭ', 'dabo', 'dabow', 'kik', 'kek', 'pastry'],
    },
}

# ── Out-of-scope guard ────────────────────────────────────────────────

OUT_OF_SCOPE = {
    'en': ['python', 'javascript', 'code', 'program', 'programming', 'function', 'algorithm', 'sql', 'html',
           'css', 'java', 'c++', 'rust', 'golang', 'debug', 'compile', 'api key', 'regex',
           'president', 'prime minister', 'election', 'war', 'football', 'who won', 'score',
           'joke', 'funny', 'laugh', 'tell me a fairy tale', 'poem', 'song', 'movie', 'weather',
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
    'order_create': 'order_create',
    'order_status': 'order_status',
    'order_cancel': 'order_cancel',
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
