/**
 * Amharic translations.
 *
 * Two rules govern this file:
 *
 * 1. These are written the way an Ethiopian would actually say them, not
 *    transliterated English and not Google Translate. Coffee is "ቡና", an order
 *    is "ትዕዛዝ", the basket is "ሳጥን". Transliterating ("kebish", "ayin") would be
 *    unreadable to the very people the Amharic mode exists for.
 *
 * 2. Keep the English key byte-identical to the string in the component. The
 *    lookup is exact, so a smart quote or an extra space silently falls back to
 *    English and nobody notices until a customer complains.
 *
 * Menu items and categories come from the database in English. Those are
 * translated at the bottom, keyed by slug, because their English text is data
 * rather than code.
 */

export const translations: Record<string, string> = {
  // ── Navigation ───────────────────────────────────────────────────────
  'Menu': 'ሜኑ',
  'Story': 'ታሪክ',
  'Gallery': 'ፎቶዎች',
  'Visit us': 'ይገኙን',
  'Account': 'መለያ',
  'Sign In': 'ግቡ',
  'Sign Up': 'ተዝጥር',
  'Sign Out': 'ውጡ',
  'Cart': 'ሳጥን',
  'Artisanal Reserve': 'አርቲሳናል ሪዘርቭ',
  'Track': 'አንበት',
  'kitchen till 22:00': 'ኩሽና እስከ 22:00',
  'Gulele Road 14, Piassa': 'ጉሌሌ መንገድ 14፣ ፒያሳ',
  'Fri': 'ዓርብ',
  'Sat': 'ቅዳሜ',
  'Sun': 'እሁድ',
  'Coffee began here — not in a roastery with a logo, but in the highlands of Kaffa, where a goat herder named Kaldi noticed his flock dancing. Centuries later, the drink is still made the unhurried way across Ethiopia: green beans washed by hand, roasted over charcoal in a flat pan, ground with a mortar, and brewed in a black clay jebena.':
    'ቡና እዚህ የተጀመረ ነው — በሎጎ ያለው የማፍላት ቤት ሳይሆን፣ በካፋ ከተማሪው ውስጥ፣ በፍየል አምላኩን የሚጠብቅ ባለቤተሰብ ካልዲ ሳይሆን የምናውን መንጋጣ ሲዩ። ምሽራን በኋላም መጠጥ በኢትዮጵያ ማህበል አሁንም በዘገት ነው፦ በእጅ የተጠበሱ አድራሽ ቡና ፍረስ፣ በቃርባን ላይ በግራጫ ሳንጠበስ፣ በዕጣ የተራራ በጥጕና በአራጭ ምርጥ ጫና የተጨመረ ጥበቃ።',
  'At Buna Hub we kept the whole ceremony indoors. Every afternoon the pan comes out, the room fills with smoke and frankincense, and whoever is seated nearby gets the first cup.':
    'በቡና ሁብ ሙሉ ክፍለ ጊዜውን በውስጥ አስቀምጠን። በየከሰዓቱ ሳንጠበስ አዳራሹ በትንበት ጥበብና በዕጣ መሽተት ይሞላል፤ እንደሚቀም ያለው ግን አንድ የመጀመሪያውን ኳስ ያገኛል።',
  'The pour matters as much as the roast. The jebena is lifted high so the stream falls thin and steady into small handleless cups — sini — and the coffee arrives in three rounds, each weaker and sweeter than the last: abol, tona, and baraka, the blessing. Leaving before the third is bad manners; staying for it is how strangers become regulars.':
    'ውረገት በማፍላት ተወጣ አይልም። ጀበናው ከፍ ተጠብሮ የቡናው ፍረስ በጥቁር ሳኒ ከረጋች ያለባት ትንንሽ ኩብያዎች ወደ ላይ በቀጣታ ይወርዳል። ቡናውም በሦስት ዙሮች ይሰጣል፤ የመጨማሪው ደካማና መጣጣኛ ሲሆን ያለው የያለ። አቦል፣ ቶና፣ እና ባራካ — መብረጣው። ከሦስተኛው በፊት መሄድ አስለቅ ነው፤ ማሆን ግን የማይታወቁ እንግዳዎች ወደ ቋላጭ ሰዎች የሚሆኑበት መንገድ ነው።',
  '— “Coffee is our bread.” The first thing a guest is offered, the last thing they are rushed through.':
    '— «ቡና ዳቦ ነው»። እንግዳው የሚቀርቡት የመጀመሪያው ነገር፣ ግን ከያለፉ በፍጥነት የሚያስቀርበት የመጨረሻው ነገር።',
  'Confirming your payment with the gateway…': 'ክፍያዎን በመንገዱ ማረጋገጥ ላይ…',
  'Payment is taking longer than usual. It will update here automatically — or refresh the page in a moment.':
    'ክፍያው ከሚጠበቀው በመጠን ረዥቷ ስቷል። በራሱ እንደሚያሻሽል ይሆናል — ወይም አንድ ጊዜ ገጹን ያድርጉ።',
  'You were signed out, so live orders and revenue have stopped updating. Please sign in again.':
    'ከመለያዎ ወጥተዋል፣ ስለዚህ ቀጥታ ትዕዛዞችና ገቢው መረጃ አላዘም በመባተን ላይ ናቸው። እባክዎ እንደገና ይግቡ።',
  'Rejected by manager.': 'በአስተዳዳሪው ተከልክሏል።',
  'Reservation status updated to:': 'የማስያዣ ሁኔታ ተሻሽሏል፦',
  'Enter your account email': 'የመለያዎን ኢሜይል ያስገቡ',
  'Already have an account? Sign In': 'መለያ አለዎት? ግቡ',
  'You were signed out, so your orders have stopped updating. Please sign in again.':
    'ከመለያዎ ወጥተዋል፣ ስለዚህ ትዕዛዞችዎ አላዘም በመባተን ላይ ናቸው። እባክዎ እንደገና ይግቡ።',
  'Craft Micro-Lot Roasters': 'የቆሎ ቡና የእጅ ብርጃዎች',
  'My Orders & Profile': 'ትዕዛዞቼና መገለጫዬ',
  'Manager Dashboard': 'የአስተዳዳሪ ዳሽቦርድ',
  'Shopping Cart': 'የግዢ ሳጥን',
  'Notifications': 'ማሳወቂያዎች',
  'Mark all read': 'ሁሉንም ተነቧል በል',
  'No notifications yet': 'እስካሁን ምንም ማሳወቂያ የለም',

  // ── Hero ──────────────────────────────────────────────────────────────
  'Open today': 'ዛሬ ክፍት',
  'View the Menu': 'ሜኑውን ይመልከቱ',
  'Order Buna': 'ቡና ይቅዙ',
  'Track your order': 'ትዕዛዝዎን ይከታተሉ',
  'Three rounds from one jebena — coffee poured the slow way, in the city that invented it.':
    'ከአንድ ጀበና በሦስት ዙር — ቡናው በዘገት የሚፈለገው ጥሩ ከተወጠዘበት ከተነሳው ከተማሪው አገሪት።',
  'pickup & delivery': 'በእጅ መውሰድና ማድረሻ',
  'save a stool': 'ወከተኛ ጠረጴዛ ይያዙ',
  'buna, teas & bites': 'ቡና፣ ሻይና ምግብ',
  'from Kaldi\'s hills': 'ከቃልዲው ከተማሪው',
  'order status': 'የትዕዛዝ ሁኔታ',

  // ── Menu section ──────────────────────────────────────────────────────
  'Our Curated Menu': 'የተዘጋጁ መምጣቶቻችን',
  'Laid out like dishes on the table': 'እንጋግ ላይ የተቀረጡ ምግቦች ሳሉ ተቀምጠው',
  'Everything is roasted, brewed or baked in-house. Prices in birr, taxes included — the ceremony is always on the house when you stay for all three rounds.':
    'ሁሉም በውስጃችን ይቆላል፣ ይፈላል ወይም ይጠበሳል። ዋጋዎቹ በብር ሲሆን ግብር ተካትቷል — ሦስት ዙሮችንም ካለፉ ክፍልጋው ስጋ በነፃ ነው።',
  'All': 'ሁሉም',
  'No menu items found.': 'ምንም የሜኑ ንብሥ አልተገኘም።',
  'Please ensure your Django backend is running on port 8000 so the menu can be loaded!':
    'ሜኑው እንዲጫን የኋላው አገልግሎት በ8000 በርብር እየሄደ መሆኑን እረጋግጡ!',
  'Add to Cart': 'ወደ ሳጥን ጨምር',

  // ── Story ─────────────────────────────────────────────────────────────
  'Roasted in the room,': 'በአዳራሹ ውስጥ የተቆላ',
  'poured three times.': 'ሦስት ጊዜ የተፈረመ።',
  'The morning roast, done where everyone can smell it.':
    'የጠዋቱ የቡና ማፍላት፣ ሁሉም ማሽተት የሚችሉበት በዚያ ቦታ።',
  'Buna dabo naw': 'ቡና ዳቦ ነው',
  'Our own roastery sits behind the counter — a small drum that turns out eight kilos at a time, mostly Yirgacheffe and Guji lots we buy through two family exporters. The burger grill and the pizza oven came later, because a ceremony that lasts three hours makes people hungry.':
    'የራስን የቡና ማዘጋጃ በቆጠራው አገሪት ውስጥ ነው — በአንድ ጊዜ ስምንት ኪሎ የሚጠበስ ትንንሽ አውራጭ። በብዙውን የሚያሉት የይርጋች እና የጉጂ ቦሎች ከሁለት የቤተሰብ ላኪዎች ነው። የበርገር ግሪልና የፒዛ እጋፋ በኋላ ተጨምሮ ናቸው፣ ሦስት ሰዓት የሚቀጥል ክፍለ ጊዜ ሰዎችን ለምግብ ያጠልቃል።',

  // ── Gallery ───────────────────────────────────────────────────────────
  'The room, the smoke, the regulars': 'አዳራሹ፣ የትንበት ጥበብ፣ ቋላጭ ደንበኞቹ',
  'Shot over one slow week — mornings at the roast pan, evenings under the lamps.':
    'በአንድ ስልት ደንብኝ ሳምንት — በጠዋቱ በየማፍላዩ፣ በማታውም በታሪቦች ስር.።',
  'The high pour, Friday ceremony': 'የፍጥር ውረጨት፣ የዓርብ ክፍለ ጊዜ ዘይቤት',
  'Third-round laughter': 'የሦስተኛ ዙር ሰብስብ',
  'Slow Tuesday at the window': 'በስክሪኑ ላይ የማርስከረስ ዘገት',
  'Jebena resting on the coals': 'ጀበናው በክሳሎ ላይ የተከረሰ',
  'The machine, for the impatient': 'ማሽኑ፣ ለቅልጥፊዎች',
  'Lamps on, rain outside': 'ታሪቦች በርበት፣ ውስጭ ዝናብ',
  'Tuesday\'s Guji lot, cooling': 'የማክሰኞት የጉጂ ቦል፣ እየቀዘቀየ',
  'Aster at the mesob': 'አስተር በመሶብ ላይ',

  // ── Visit & booking ───────────────────────────────────────────────────
  'Hours': 'የአገልግሎት ሰዓት',
  'Open now': 'አሁን ክፍት',
  'Mon – Thu': 'ሰኞ – ሐሙስ',
  'Friday': 'ዓርብ',
  'Saturday': 'ቅዳሜ',
  'Sunday': 'እሁድ',
  'Full ceremony every afternoon from 15:00 — no booking needed, just be near the roast pan.':
    'ከከሰዓት 3:00 በኋላ የሙሉ ክፍለ ጊዜ ዘይቤት ይካሄዳል — ቦታ ማስያዝ አያስፈልግም፣ በየማፍላዩ አቅርበው ያስቀሙ።',
  'Book a table': 'ቦታ ይያዙ',
  'Sign in to book': 'ለማስያዝ ይግቡ',
  'Name': 'ስም',
  'Phone': 'ስልክ',
  'Party size': 'የእንግዳ ብዛት',
  'Date & time': 'ቀንና ሰዓት',
  'Three fields and you\'re in. We confirm every request by phone within the hour — for parties over eight, call us instead.':
    'ሦስት መስክዎች ብቻ አስፈልጋችዎታለሁ። ማንኛውንም ጥያቄ በሰዓት ውስጥ በስልክ እናረጋግጣለን — ከስምንት በላይ የሚሆኑ ጉድሮች ከዚያ በስልክ ይደውሉን።',
  'No deposit — we hold your table for 20 minutes.':
    'ተቀማጭ አያስፈልግም — ጠረጴዛዎን ለ20 ደቂቃ እንይዛመን።',
  'Your table is booked! We\'ll call you shortly to confirm.':
    'ጠረጴዛዎ ተያዟል! ለማረጋገጥ በቅርብ ጊዜ እንደውልዎታለን።',
  'There was an error booking your table. Please try again.':
    'ጠረጴዛዎን ለማስያዝ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።',
  'Book': 'ይያዙ',
  // "Order" as a noun (ትዕዛዝ) vs. as a verb (ይቅዙ) - the home page uses it both
  // ways, so the noun form is kept here and the verb reads naturally either way.
  'Order': 'ትዕዛዝ',

  // ── Footer ────────────────────────────────────────────────────────────
  'An Ethiopian coffee house in Piassa — ceremony buna, slow teas, and a kitchen that stays open late.':
    'በፒያሳ የኢትዮጵያ ቡና ቤት — የክፍለ ጊዜ ቡና፣ ዘገት ያለው ሻይ፣ እስከ ሌሊት የሚያልፍ የኩሽና።',
  'Find us': 'እኛን ያግኙን',
  'Addis Ababa': 'አዲስ አበባ',
  'Order pickup by phone — +251 11 555 0148. Already ordered? The code on your receipt starts with BH.':
    'በስልክ ትዕዛዝ ለመውሰድ — +251 11 555 0148። አስቀድሞ አዝዙ? በደረሰኝዎ ላይ ያለው ኮድ BH ይጀምራል።',
  'Check': 'አረጋግጥ',
  'Ready for pickup — ask at the counter': 'ለመውሰድ ተጠናቋል — በቆጠራው ይጠይቁ',
  '© 2026 Buna Hub · Buna tetu — come, drink coffee':
    '© 2026 ቡና ሁብ · ቡና ቴቱ — ይግቡ፣ ቡና ይጠጡ',
  'Photography: Pexels & Unsplash contributors':
    'ፎቶግራፍ፦ ከፔክስልና ከአንስላንሽ ገንባኞች',

  // ── Auth ──────────────────────────────────────────────────────────────
  'Welcome Back': 'እንኳን በደህና መጡ',
  'Join Artisanal Reserve': 'አርቲሳናል ሪዘርቭ ይግቡ',
  'Reset Password': 'የይለፍ ቃል ዳግም አስጀምር',
  'Username or Email': 'የተጠቃሚ ስም ወይም ኢሜይል',
  'Password': 'የይለፍ ቃል',
  'Enter your password': 'የይለፍ ቃልዎን ያስገቡ',
  'Forgot password?': 'የይለፍ ቃል ረስተዋል?',
  'Create Account': 'መለያ ፍጠር',
  'First Name': 'ስም',
  'Last Name': 'የአትንትክ',
  'Username': 'የተጠቃሚ ስም',
  'Email Address': 'የኢሜይል አድራሻ',
  'Registered Email Address': 'የተመዘገበ የኢሜይል አድራሻ',
  'Phone Number': 'የስልክ ቁጥር',
  'Email address is required.': 'የኢሜይል አድራሻ ያስፈልጋል።',
  'Enter a valid email address, e.g. name@gmail.com.': 'ትክክለኛ የኢሜይል አድራሻ ያስገቡ፣ ለምሳሌ name@gmail.com።',
  'Username must be at least 3 characters long.': 'የተጠቃሚ ስም ቢያንስ 3 ፊደል ሊሆን ይገባል።',
  'Password must be at least 6 characters long.': 'የይለፍ ቃል ቢያንስ 6 ፊደል ሊሆን ይገባል።',
  'Logged in successfully!': 'በተሳክነት ገባችዎታለሁ!',
  'Account created successfully!': 'መለያዎ በተሳክነት ተፈጥሯል!',
  'Send Reset Link': 'የዳግም አገልግሎት አድራሻ ላክ',
  'Demo accounts — tap to fill': 'የሙከራ መለያዎች — ለማስገባት ይጫኑ',
  'Administrator': 'አስተዳዳሪ',
  'Manager': 'አስተዳዳሪ',
  'Customer': 'ደንበኛ',
  'Admin': 'አስተዳዳሪ',

  // ── Item options ──────────────────────────────────────────────────────
  'Signature': 'ፊየችራ',
  'Hot': 'ሞት',
  'Iced': 'ቀዝቃዛ',
  'Cold': 'ቀዝቃዛ',
  'Temperature': 'የሙቀት ደረጃ',
  'Milk': 'የወተት',
  'None': 'የለም',
  'Whole': 'ሙሉ',
  'Oat': 'ኦት',
  'Soy': 'ሶያ',
  'Almond': 'ባንድ',
  'Step 1 · Choose your options': 'ደረጃ 1 · ዝርዝርዎን ይምረጡ',
  'Step 2 · How many?': 'ደረጃ 2 · ስንት?',
  'Step 3 · Review & add': 'ደረጃ 3 · አረጋግጥና ጨምር',
  'Size / Option': 'መጠን / ዝርዝር',
  'Add-ons': 'ተጨማሪ ምርሮች',
  'Required': 'ያስፈልጋል',
  'Included': 'ተካቷል',
  'Decrease quantity': 'ብዛት ቀንስ',
  'Quantity': 'ብዛት',
  'Increase quantity': 'ብዛት ጨምር',
  'each': 'በእርሱ',
  'Payment comes after this · you will choose Chapa or Cash on Delivery next':
    'ክፍያ ከዚያ በኋላ ነው · ቀጣይ ቻፓ ወይም በጥበቃ ላይ የሚከፈል ክፍያ ይምረጣሉ',

  // ── Cart & checkout ───────────────────────────────────────────────────
  'Your Cart': 'የእርስዎ ሳጥን',
  'Cart is Empty': 'ሳጥኑ ባዶ ነው',
  'Browse Menu': 'ሜኑን ይመልከቱ',
  'Back to Menu': 'ወደ ሜኑ ተመለሱ',
  'Order Placed!': 'ትዕዛዝዎ ተቀርቷል!',
  'View My Orders': 'ትዕዛዞቼን ይመልከቱ',
  'View My Account & Retry Payment': 'ወደ መለያዬ ይሂዱና ክፍያውን እንደገና ይክፈሉ',
  'Try Again': 'እንደገና ይሞክሩ',
  'Subtotal': 'ድምር',
  'Pay with Chapa': 'በቻፓ ይክፈሉ',
  'Processing Order...': 'ትዕዛዝ በመካከል ነው...',
  'Failed to place order.': 'ትዕዛዝውን ማስገባት አልተቻለም።',
  'Network error. Please check your connection and try again.':
    'የመረጃ አስተላላፊ ስህተት። ግንኙነትዎን ያረጋግጡና እንደገና ይሞክሩ።',
  'Please sign in or create an account to complete your order.':
    'ትዕዛዝዎን ለማጠናቀቅ ይግቡ ወይም መለያ ይፍጠሩ።',
  'Order failed:': 'ትዕዛዝው አልተሳካም፦',
  'Your order is saved — open My Orders in your account to complete payment.':
    'ትዕዛዝዎ ተቀምጧል — ክፍያውን ለማጠናቀቅ ወደመለያዎ ውስጥ ከ"ትዕዛዞቼ" ይክፈቱ።',
  'Finish paying from My Orders in your account.':
    'ከመለያዎ ውስጥ ከ"ትዕዛዞቼ" በመሂድ ክፍያውን ያጠናቅቁ።',
  'Payment is pending for Order #': 'ክፍያው በትዕዛዝ ላይ በመጠባበቅ ላይ ነው፦ #',

  // ── Payment ───────────────────────────────────────────────────────────
  'Chapa Payment Gateway': 'የቻፓ ክፍያ መንገድ',
  'Select Payment Method': 'የክፍያ ዘዴ ይምረጡ',
  'Official': 'ኦፊሴል',
  'Card / Bank': 'ካርድ / ባንክ',
  'Cash on Delivery': 'በማድረሻ ጊዜ ጥበቃ',
  'Chapa Hosted Redirect': 'ወደ ቻፓ የተማሪ ገጽ',
  'Redirect to Chapa Hosted Checkout': 'ወደ ቻፓ የክፍያ ገጽ ይሂዱ',
  'Chapa Mobile Test Phone Scenarios': 'የቻፓ ሞባይል የሙከራ ስልክ አገልግሎቶች',
  'Success Scenario': 'የሚሻል አገልግሎት',
  'Insufficient Funds': 'ያልተበቃ ትክክለኛ ገንዘብ',
  'User Cancellation': 'የተጠቃሚ ሰርዝ',
  'Timeout / Pending': 'ጊዜው አልፏል / በመጠባበቅ ላይ',
  'Payment initialization failed.': 'የክፍያ መጀመሪያ አልተሳካም።',
  'Payment gateway is temporarily unavailable. Redirecting to your orders...':
    'የክፍያ መንገዱ ጊዜዊነት የለም። ወደ ትዕዛዞችዎ በመመለስ ላይ...',
  'Payment processing error.': 'በክፍያ ሂደት ላይ ስህተት ተከስቷል።',
  'unknown reason': 'የማይታወቅ ምክንያት',
  'INSUFFICIENT_FUNDS or processing error.': 'በቂ ስቕዓት የለም ወይም የሂደት ስህተት።',
  'USER_CANCELLED.': 'በተጠቃሚ ተሰርዟል።',
  'Proceed to Chapa Payment': 'ወደ ቻፓ ክፍያ ይቀጥሉ',
  'Pay': 'ይክፈሉ',
  'via': 'በ',
  'Payment of': 'የ',
  'successful!': 'ተሳክቷል!',
  'Payment Failed:': 'ክፍያው አልተሳካም፦',
  'Payment Cancelled:': 'ክፍያው ተሰርዟል፦',
  'Payment initialized. Please complete payment via Chapa gateway.':
    'የክፍያ መጀመሪያ ተሳክቷል። እባክዎ በቻፓ መንገድ ክፍያውን ያጠናቅቁ።',
  "Clicking the button below will open Chapa's official hosted checkout page where you can pay using Telebirr, CBE Birr, Debit/Credit Card, or Bank Transfer.":
    'ከዚህ በታች ያለውን አዝናር ከመጫኑ የቻፓ ኦፊሴል የክፍያ ገጽ ይከፍታል፤ በቴሌብር፣ በCBE ብር፣ በዴቢት/ክሬዲት ካርድ ወይም በባንክ ገንዘብ ማስተላለፍ ይችላሉ።',
  'Chapa ETB Payment Active': 'የቻፓ ክፍያ እየተገለገለ ነው',

  // ── Orders & tracking ─────────────────────────────────────────────────
  'Order Status Timeline': 'የትዕዛዝ ሁኔታ መስመር',
  'Order was': 'ትዕዛዙ',
  'cancelled': 'ተሰርዟል',
  'rejected': 'ተከልክሏል',
  'failed': 'አልተሳካም',
  'Order History': 'የትዕዛዝ ታሪክ',
  'Active Orders': 'ንቁ ትዕዛዞች',
  'My Orders': 'ትዕዛዞቼ',
  'No orders yet': 'እስካሁን ትዕዛዝ የለም',
  'Looks like you haven\'t tasted our buna yet.': 'ገና ቡናታችን አላጠኙም ይመስላል።',
  'Loading orders...': 'ትዕዛዞች በመጫን ላይ...',
  'View Receipt': 'ደረሰኝ ይመልከቱ',
  'Receipt after payment': 'ክፍያ በኋላ ደረሰኝ',
  'Receipts are issued after payment': 'ደረሰኞች ከክፍያ በኋላ ይሰጣሉ',
  'Receipts are issued only after payment': 'ደረሰኞች ብቻ ከክፍያ በኋላ ይሰጣሉ',
  'Amount due:': 'የሚከፈል መጠን፦',
  'NOT PAID YET — you have not paid for this order, so the kitchen has not received it and no receipt can be issued.':
    'እስካሁን ክፍያ አልተከፈለም — ስለዚህ ትዕዛዝው ወደ ኩሽናው አልደረሰም፣ ደረሰኝም አይሰጥም።',
  'Last attempt failed': 'የመጨረሻ ሙከራ አልተሳካም',
  'payment declined': 'ክፍያው ውድቅቷል',
  'Waiting for Chapa to confirm the payment you just started…':
    'አሁን የጀመሩትን ክፍያ ቻፓ እንዲያረጋግጥ ይጠብቃለን…',
  'Payment not completed': 'ክፍያው አልተጠናቀቀም',
  'Order has not been paid for yet, so a receipt cannot be issued. The receipt becomes available as soon as the payment is confirmed.':
    'ትዕዛዝው እስካሁን አልተከፈለም፣ ስለዚህ ደረሰኝ መስጠት አይቻልም። ክፍያው ከተረጋገጠ በኋላ ደረሰኙ ይገኛል።',
  'Download': 'አውርድ',
  'Ref:': 'ቁጥር፦',
  'Paid': 'ተከፍሏል',
  'has not been paid for yet, so a receipt cannot be issued. The receipt becomes available as soon as the payment is confirmed.':
    'እስካሁን አልተከፈለም፣ ስለዚህ ደረሰኝ መስጠት አይቻልም። ክፍያው ከተረጋገጠ በኋላ ደረሰኙ ይገኛል።',
  'Order not paid for yet': 'ትዕዛዝው እስካሁን አልተከፈለም',
  'Close': 'ዝጋ',
  'Receipt Ref:': 'የደረሰኝ ቁጥር፦',
  'Date:': 'ቀን፦',
  'Type:': 'አይነት፦',
  'Customer:': 'ደንበኛ፦',
  'Phone:': 'ስልክ፦',
  'Items:': 'ንብሦች፦',
  'ITEMS:': 'ንብሦች፦',
  'TOTAL AMOUNT:': 'ጠቅላላ መጠን፦',
  'Status:': 'ሁኔታ፦',
  'Order Type:': 'የትዕዛዝ አይነት፦',
  'Total:': 'ጠቅላላ፦',
  'confirmed': 'ተረጋግጧል',
  'Download receipt': 'ደረሰኝ አውርድ',
  'Thank you for visiting Artisanal Cafe!': 'አርቲሳናል ካፌዎን ለጎብኝት እናመሰግናለን!',
  'Artisanal Reserve Cafe': 'አርቲሳናል ሪዘርቭ ካፌ',
  'Bole Medhanialem, Addis Ababa': 'ቦሌ መድሃናዌለም፣ አዲስ አበባ',
  'RECEIPT CARD': 'የደረሰኝ ካርድ',

  // ── Order status labels ───────────────────────────────────────────────
  'Awaiting Payment': 'ክፍያ በመጠባበቅ ላይ',
  'Placed (Paid)': 'ተዝዟል (ተከፍሏል)',
  'New (Paid)': 'አዲስ (ተከፍሏል)',
  'Accepted': 'ተቀብለናል',
  'Preparing': 'በመዘጋጀት ላይ',
  'Ready': 'ተጠናቋል',
  'Out for Delivery': 'ለማድረሻ ወጥቷል',
  'Completed': 'ተጠናቋል',
  'Cancelled': 'ተሰርዟል',
  'Rejected': 'ውድቅቷል',
  'Payment': 'ክፍያ',
  'Placed': 'ተዝዟል',
  'Delivery': 'ማድረሻ',

  // ── Account ───────────────────────────────────────────────────────────
  'Your Account': 'መለያዎ',
  'Hello': 'ሰላም',
  'Session expired': 'የክፍለ ጊዜው አልፏል',
  'Sign in again': 'እንደገና ይግቡ',
  'Sign In Required': 'መግባት ያስፈልጋል',
  'Please sign in to view your orders and manage your profile.':
    'ትዕዛዞችዎን ለማየትና መገለጫዎን ለማስተካከል ይግቡ።',
  'Return to Home': 'ወደ መነሻ ተመለሱ',
  'Table Reservations': 'የጠረጴዛ ማስያዣዎች',
  'Delivery Addresses': 'የማድረሻ አድራሻዎች',
  'Profile Settings': 'የመገለጫ ቅንብሮች',
  'Loading reservations...': 'ማስያዣዎች በመጫን ላይ...',
  'No reservations yet': 'እስካሁን ማስያዝ የለም',
  'You haven\'t booked any tables with us.': 'ከእኛ ጋር ጠረጴዛ አላስያዙም።',
  'Booked on': 'ተያዝቷል',
  'Confirm': 'አረጋግጥ',
  'Mark Completed': 'ተጠናቋል በል',
  'Add New Address': 'አድራሻ ጨምር',
  'Street Address': 'የጎዳና አድራሻ',
  'City': 'ከተማ',
  'Subcity / Zone': 'ክፍለ ከተማ',
  'Set as default delivery address': 'እንደሚያገኝው የማድረሻ አድራሻ አድርግ',
  'Save Address': 'አድራሻ አስቀምጥ',
  'Saved Addresses': 'የተቀሙ አድራሻዎች',
  'No saved addresses yet.': 'እስካሁን የተቀመጠ አድራሻ የለም።',
  'Default': 'ሚያገኝ',
  'Reservation for': 'የማስያዣ ለ',
  'Book a Table': 'ቦታ ይያዙ',
  'CONFIRMED': 'ተረጋግጧል',
  'PENDING': 'በመጠባበቅ ላይ',
  'item': 'ንብሥ',
  'items': 'ንብሦች',
  'Date & Time:': 'ቀንና ሰዓት፦',
  'from': 'ከ',
  'today': 'ዛሬ',
  'this month': 'ወህ ወር',
  'paid orders': 'የተከፈሉ ትዕዛዞች',
  'orders': 'ትዕዛዞች',
  'payments': 'ክፍያዎች',
  'Not paid yet': 'እስካሁን አልተከፈለም',
  'Payment status unknown': 'የክፍያ ሁኔታ የማወቅ አልተቻለም',
  'OPEN': 'ክፍት',
  'CLOSED': 'ዝግ',
  'Cafe is now': 'ካፌው አሁን',
  'Last attempt failed:': 'የመጨረሻ ሙከራ አልተሳካም፦',
  'Hello,': 'ሰላም፣',
  'Hi,': 'ሰላም፣',
  'Personal Details': 'የግል መረጃ',
  'Username / Email': 'የተጠቃሚ ስም / ኢሜይል',
  'Username/email cannot be changed here.': 'የተጠቃሚ ስም/ኢሜይል እዚህ መቀየር አይችልም።',
  'Update Profile': 'መገለጫውን አሻሽል',
  'Profile updated successfully!': 'መገለጫው በተሳክነት ተሻሽሏል!',
  'Failed to update profile.': 'መገለጫውን ማሻስት አልተቻለም።',
  'Address added successfully!': 'አድራሻው በተሳክነት ተጨምሯል!',
  'Failed to add address due to a network error.':
    'በመረጃ አስተላላፊ ስህተት አድራሻውን መጨመር አልተቻለም።',
  'Use an email you can open — your receipt and payment confirmation are sent there.':
    'የሚከፈቱ ኢሜይል ይጠቀሙ — ደረሰኝዎና የክፍያ ማረጋገጫዎ ወደዚያ ይላካሉ።',

  // ── Payment result banners ────────────────────────────────────────────
  'Payment confirmed!': 'ክፍያው ተረጋግጧል!',
  'Payment failed': 'ክፍያው አልተሳካም',
  'Payment was cancelled': 'ክፍያው ተሰርዟል',
  'Payment is pending': 'ክፍያው በመጠባበቅ ላይ ነው',
  'Confirming payment…': 'ክፍያውን በማረጋገጥ ላይ...',
  'is paid and our kitchen has been notified.': 'ተከፍሏል፣ ኩሽናችንም ተነገርቷል።',
  'Your order is saved — tap "Pay Now" to try again.':
    'ትዕዛዝዎ ተቀምጧል — እንደገና ለማሞክር "አሁን ክፈል" የሚል ንክክሩን ይጫኑ።',
  'placed!': 'ተዝዟል!',
  'Payment is pending. It will confirm here automatically once processed.':
    'ክፍያው በመጠባበቅ ላይ ነው። ከተካሂደ በኋላ እራሱን በራሱ ያረጋግጣል።',
  'Payment did not go through. Your order is saved — tap "Pay Now" to retry.':
    'ክፍያው አልተሳካም። ትዕዛዝዎ ተቀምጧል — እንደገና ለማሞክር "አሁን ክፍል" የሚል ንክክሩን ይጫኑ።',
  'placed and paid!': 'ተዝዟልና ተከፍሏል!',

  // ── Manager dashboard ─────────────────────────────────────────────────
  'Dashboard': 'ዳሽቦርድ',
  'Live Orders': 'ቀጥታ ትዕዛዞች',
  'Menu Management': 'የሜኑ አያያዝ',
  'View Customer Site': 'የደንበኛ ገጹን ይመልከቱ',
  'Store Overview': 'የትዕዛዝ ማጠቃለያ',
  'Manage incoming orders and store status.':
    'የሚገቡ ትዕዛዞችንና የትዕዛዝ ሁኔታን ያስተዳድሩ።',
  'STORE OPEN': 'ትዕዛዙ ክፍት ነው',
  'STORE CLOSED': 'ትዕዛዙ ዝግ ነው',
  'Close Store': 'ትዕዛዝውን ዝጋ',
  'Open Store': 'ትዕዛዝውን ክፍት አድርግ',
  'Analytics Overview': 'የትንታኔ ማጠቃለያ',
  'Live': 'ቀጥታ',
  "Today's Revenue": 'የዛሬ ገቢ',
  'Monthly Revenue': 'የወር ገቢ',
  'In Kitchen': 'በኩሽና ውስጥ',
  'Avg. Order Value': 'አማካኝ የትዕዛዝ ደምስስ',
  'Last 7 Days Revenue': 'የመጨረሻው 7 ቀኑ ገቢ',
  'Collected by Method': 'በዘዴ የተሰበሰበ',
  'No revenue recorded yet.': 'እስካሁን የተመዘገበ ገቢ የለም።',
  'No settled payments yet.': 'እስካሁን የተጠናቀቀ ክፍያ የለም።',
  'No orders found for this status.': 'በዚህ ሁኔታ የሚል ትዕዛዝ አልተገኘም።',
  'No table reservations found.': 'የጠረጴዛ ማስያዝ አልተገኘም።',
  'Available': 'ይገኛል',
  'Sold Out': 'ተሽጥሯል',
  'Available (Click to Disable)': 'ይገኛል (ለማስመሰድ ይጫኑ)',
  'Sold Out (Click to Enable)': 'ተሽጥሯል (ለማስነቃቅ ይጫኑ)',
  'Cancel': 'ሰርዝ',
  'Accept Order': 'ትዕዛዝውን ተቀበል',
  'Reject': 'ውድቅቅ',
  'Start Preparing': 'መዘጋጀት ጀምር',
  'Mark Ready': 'ተጠናቋል በል',
  'Send for Delivery': 'ለማድረሻ ላክ',
  'Complete Order': 'ትዕዛዝውን አጠናቅቅ',
  'Mark Delivered': 'ደርሷል በል',
  'Unpaid — waiting on the customer': 'ክፍያ አልተከፈለም — በደንበኛው ላይ እየጠበቀን ነው',
  'Cancelled by manager.': 'በአስተዳዳሪው ተሰርዟል።',
  'Access Denied': 'መግባት ተከልክሏል',
  'You do not have permission to view this page.':
    'ይህን ገጽ ለማየት ፈቃድዎ የለዎትም።',
  'Failed to update store status.': 'የትዕዛዝ ሁኔታን ማሻስት አልተቻለም።',
  'Failed to update menu item status.': 'የሜኑ ንብሥ ሁኔታን ማሻስት አልተቻለም።',
  'Failed to update order status.': 'የትዕዛዝ ሁኔታን ማሻስት አልተቻለም።',
  'Error updating status.': 'ሁኔታውን ለመሻስት ስህተት ተከስቷል።',
  'Failed to update reservation status.': 'የማስያዣ ሁኔታን ማሻስት አልተቻለም።',
  'Error updating reservation status.': 'የማስያዣ ሁኔታን ለመሻስት ስህተት ተከስቷል።',
  'Items': 'ንብሦች',
  'Dine In': 'በቦታ ላይ',
  'Pickup': 'ማውሰድ',
  'Table': 'ጠረጴዛ',
  'Party Size:': 'የእንግዳ ብዛት፦',
  'People': 'ሰዎች',
  'people': 'ሰዎች',
  'N/A': 'የለም',
  'ALL': 'ሁሉም',

  // ── Notifications ─────────────────────────────────────────────────────
  'View in Dashboard': 'በዳሽቦርድ ይመልከቱ',

  // ── Assistant ─────────────────────────────────────────────────────────
  'Ask Buna': 'ቡናን ጠይቅ',
  'Buna Hub Assistant': 'የቡና ሁብ አገልግሎት',
  'Menu & reservations help': 'በሜኑና በቦታ ማስያዣ ላይ እርዳታ',
  'Start a new conversation': 'አዲስ ውይይት ጀምር',
  'Checking the menu…': 'መረጃ በመፈለግ ላይ…',
  'Ask about the menu…': 'ስለ ሜኑ ይጠይቁ…',
  'Retry': 'እንደገና ሞክር',
  'Send': 'ላክ',
  'reservation records saved': 'የማስያዣ መዝገቦች ተቀምጠዋል',
  'Unavailable': 'አይገኝም',
};

/**
 * Categories come from the database keyed by slug, so the English name cannot be
 * used as a lookup key. These are the display names only; the slug still drives
 * filtering, which is why translating names here is safe.
 */
export const categoryTranslations: Record<string, string> = {
  'Micro-Lot Coffee': 'የቆሎ ቡና',
  'Espresso & Infusions': 'ኤስፕሪሶና ማፍላቶች',
  'Premium Tea': 'ልዩ ሻይ',
  'Artisanal Burgers': 'በርገሮች',
  'Wood-Fired Pizza': 'በእሳት የተጠበሰ ፒዛ',
  'Shawarma & Wraps': 'ሸዋርማና ራፕስ',
  'Fast Food Favourites': 'ፈጣን ምግብዎች',
  'Bakery & Pastry': 'ቢካሪና ፓስትሪ',
};

/**
 * Menu items, variants and add-ons, keyed by slug / exact English name.
 *
 * Product names keep their origin (Guji, Yirgacheffe, Masala Chai) because that
 * is how an Ethiopian coffee shop actually names a drink -- translating them
 * would hide the provenance the whole brand is built on. The descriptive words
 * around them are translated.
 */
export const itemTranslations: Record<string, string> = {
  // Coffee
  'Guji Hambela Natural Process': 'ጉጂ ሃምበላ የተለመደ አደር',
  'Sidama Bombe Washed': 'ሲዳማ ቦምቤ የተጠበሰ',
  'Yirgacheffe Grade 1 Anaerobic': 'ይርጋቸፌ ክርድ 1 አናየሮቢክ',
  'Cold Brew Reserve': 'ዝግባሌ የተጠበሰ ቀዝቃዛ ቡና',
  'Smoked Cardamom Cappuccino': 'የተጨበሰ ካርዲሞም ካፑቲኖ',
  'Hazelnut Truffle Mocha': 'የሃዝልነት ትራፌል ሞካ',
  'Espresso': 'ኤስፕሪሶ',
  // Tea
  'Ethiopian Ginger & Lemon Spice Tea': 'የኢትዮጵያ ድምህና ወዴ ያለ የቅመም ሻይ',
  'Hibiscus & Rosehip Iced Tea': 'የቅመም ወዴ ያለ የሳርቅ ቅጣን ሻይ',
  'Masala Chai Latte': 'ማሳላ ቻይ ላቴ',
  'Moroccan Mint Green Tea': 'የሞሮክኖ ንጉሥት ጥሩ ሻይ',
  // Burgers
  'Reserve Wagyu Smash Burger': 'የዋግዩ ጽምጽም በርገር',
  'Crispy Chicken Signature Burger': 'የክሪስፒ ዶሮ ፊየችራ በርገር',
  'Plant-Based Beyond Burger': 'የአካላ ውጥ ኢንግላዊ በርገር',
  'BBQ Bacon Cheeseburger': 'ቢቢኩ ቤከን ቺዝበርገር',
  // Pizza
  'BBQ Chicken & Caramelized Onion': 'ቢቢኩ ዶሮና የካራሜላየድ ሽንኩርት',
  'Margherita Classica': 'ማርጌሪታ ክላሲካ',
  'Spicy Pepperoni & Nduja': 'ቅመም ያለ ፔፕሮኖና ንዱጃ',
  'Truffle & Wild Mushroom Pizza': 'ትራፌልና የጫች ማሸንፒዮን ፒዛ',
  // Shawarma
  'Beef & Lamb Shawarma': 'የስጋና የበግር ሸዋርማ',
  'Classic Chicken Shawarma': 'ክላሲክ ዶሮ ሸዋርማ',
  'Falafel & Hummus Wrap': 'ፋላፌልና ሁሙስ ራፕ',
  'Grilled Veggie Shawarma': 'የተጠበሰ የአካላ ሸዋርማ',
  // Fast food
  'Club Sandwich': 'ክላብ ሳንድውች',
  'Crispy Fried Chicken Wings': 'የክሪስፒ የተጠበሰ የዶሮ ክንጭ',
  'Loaded Cheese Fries': 'የተጫኑ ችስናዊ ፍሪ',
  'Loaded Nachos': 'የተጫኑ ናቾስ',
  'Spicy Beef Hot Dog': 'ቅመም ያለ የስጋ ሆት ዶግ',
  // Bakery
  'Croissant au Beurre': 'ክሩዋሳን',
  'Tiramisu Slice': 'ትራሚሱ',
};

/** Variant ("size") names, keyed by their exact English text. */
export const variantTranslations: Record<string, string> = {
  '250ml': '250 ሚል',
  '300ml': '300 ሚል',
  '400ml Large': '400 ሚል ትልቅ',
  '500ml': '500 ሚል',
  '600ml Pot': '600 ሚል ጠብታ',
  '600ml': '600 ሚል',
  'Regular': 'መደበኛ',
  'Large': 'ትልቅ',
  'Single Shot': 'አንድ ሺት',
  'Double Shot': 'ሁለት ሺት',
  'Single Patty': 'አንድ ፓቲ',
  'Double Patty': 'ሁለት ፓቲ',
  'With Fries': 'ከፍሪዮች ጋር',
  'With Salad': 'ከሳላድ ጋር',
  'With Onion Rings': 'ከኦኒዥን ምዕራፎች ጋር',
  'With Sweet Potato Fries': 'ከስዕን ዲሞት ፍሪዮች ጋር',
  'With Rice': 'ከርብብ ጋር',
  'Regular Wrap': 'መደበኛ ራፕ',
  'Large Plate': 'ትልቅ ጳት',
  'Large Plate with Rice': 'ከርብብ ጋር ትልቅ ጳት',
  'Large Sharing': 'ትልቅ የጋራ ጳት',
  '25cm': '25 ሴንቲ',
  '32cm': '32 ሴንቲ',
  '6 Wings': '6 የክንጭ',
  '12 Wings': '12 የክንጭ',
  'Single Slice': 'አንድ ወርጥ',
  'Plain': 'ቀላል',
  'Almond Filled': 'የባንድ የተሞላ',
  'Chocolate Filled': 'የቻክሌት የተሞላ',
};

/** Add-on names, keyed by their exact English text. */
export const addonTranslations: Record<string, string> = {
  'Extra Espresso Shot': 'ተጨማሪ ኤስፕሪሶ ሺት',
  'Extra Shot': 'ተጨማሪ ሺት',
  'Almond Milk Upgrade': 'የባንድ ወተት ማሻሻያ',
  'Oat Milk': 'የኦት ወተት',
  'Oat Milk Upgrade': 'የኦት ወተት ማሻሻያ',
  'Simple Syrup': 'ሳምፕል ማርበስ',
  'Cream Float': 'የክሪም ጨርቅ',
  'Extra Chocolate Shavings': 'ተጨማሪ የቻክሌት ቁልፍ',
  'Whipped Cream': 'የዊፕድ ክሪም',
  'Extra Cardamom': 'ተጨማሪ ካርዲሞም',
  'Extra Honey': 'ተጨማሪ ማምሃት',
  'Cinnamon Stick': 'የደረስምን ትኩርክ',
  'Mint Garnish': 'የንጉሥት ጥርት',
  'Extra Spice': 'ተጨማሪ ቅመም',
  'Extra Sugar': 'ተጨማሪ ስኳር',
  'Fresh Mint Leaves': 'አዲስ የንጉሥት ቅጠሎች',
  'Fried Egg': 'የተጠበሰ እንቁላል',
  'Extra Bacon': 'ተጨማሪ ቤከን',
  'Extra Jalapeños': 'ተጨማሪ ጃላፔኖ',
  'Extra Sauce': 'ተጨማሪ ሶስ',
  'Extra Chipotle Mayo': 'ተጨማሪ ቺፖቴ ማዮ',
  'Pickled Red Onion': 'የቀይ ሽንኩርት በአማይና የተጠበሰ',
  'Extra Cheese': 'ተጨማሪ ችስና',
  'Bacon Strips': 'የቤከን ሰርዶች',
  'Avocado': 'አቮካዶ',
  'Extra Chicken': 'ተጨማሪ ዶሮ',
  'Jalapeños': 'ጃላፔኖ',
  'Buffalo Mozzarella': 'ቡፋሎ ሞዣዜራ',
  'Cherry Tomatoes': 'ችርቸር ቲማቲ',
  'Extra Pepperoni': 'ተጨማሪ ፔፕሮኖ',
  'Chilli Oil': 'የቀይ በርበት ወዴ',
  'Extra Truffle Oil': 'ተጨማሪ የትራፌል ወዴ',
  'Parmesan Shavings': 'የፓርሜሳን ቁልፍ',
  'Extra Tahini': 'ተጨማሪ ታሂኒ',
  'Hot Sauce': 'ቅመም ያለ ሶስ',
  'Extra Toum': 'ተጨማሪ ጥም',
  'Extra Hummus': 'ተጨማሪ ሁሙስ',
  'Chilli Sauce': 'የቀይ በርበት ሶስ',
  'Extra Halloumi': 'ተጨማሪ ሃሉሚ',
  'Tahini': 'ታሂኒ',
  'Extra Chilli': 'ተጨማሪ ቀይ በርበት',
  'Extra Sriracha': 'ተጨማሪ ስሪራቻ',
  'House Jam': 'የቤት ጅም',
  'Honey Butter': 'የማምሃት ቅብ',
  'Extra Cocoa Dusting': 'ተጨማሪ የካካኦ ቁርጥራ',
  'Espresso Shot on Side': 'ጎን ኤስፕሪሶ ሺት',
  'Buffalo Sauce': 'ቡፋሎ ሶስ',
  'Honey Garlic Sauce': 'የማምሃት ድንች ሶስ',
  'Extra Blue Cheese Dip': 'ተጨማሪ የሰማያዊ ችስና ዲፕ',
  'Bacon Bits': 'የቤከን ቁልፎች',
  'Extra Cheese Sauce': 'ተጨማሪ የችስና ሶስ',
  'Extra Guacamole': 'ተጨማሪ ጉአሚል',
};