"""
Sign-in gate for account-bound actions.

The assistant is a public surface: anyone can open the chat and ask about the
menu. Anything that touches an account - booking a table, placing an order,
looking up "my" reservations or orders, or cancelling something - must be
performed by a signed-in customer, and the guest must be told to sign in or sign
up first.

Two rules keep this honest:

1. The gate is enforced in code, not in the prompt. The language model is told
   about the rule, but it is never trusted to apply it.
2. The conversation state is preserved across the sign-in. A guest who said
   "table for 4 tomorrow at 7 PM, name is Hana" and then signs in should have
   that booking completed, not asked to start over.
"""

from .responder import bilingual

#: Intents that may only run for an authenticated customer.
#:
#: `order_create` is deliberately not here. Adding items to an order touches
#: nothing: no payment, no order record, no personal data, and nothing leaves the
#: customer's browser until they confirm. Letting a guest build the order and
#: asking for sign-in at the moment of checkout is both safer and far less
#: annoying than making them sign in before they know what they want.
AUTH_REQUIRED_INTENTS = {
    'reservation_create',
    'reservation_cancel',
    'reservation_status',
    'order_status',
    'order_cancel',
}

#: Intents that stay public. Menu browsing, prices, hours and general help are
#: how a guest decides whether they want to sign up at all.
PUBLIC_INTENTS = {
    'greeting', 'thanks', 'about', 'hours', 'location', 'price', 'ingredients',
    'availability', 'menu_list', 'recommend', 'cheapest', 'diet', 'order_help',
    'knowledge_base', 'unknown', 'unknown_item', 'out_of_scope', 'empty',
}

#: What the guest was trying to do, phrased to slot into the sentence
#: "I can ... as soon as you are signed in". Kept as a phrase rather than a full
#: sentence so both languages read naturally.
SIGNOUT_TITLE = {
    'reservation_create': ('book you a table', 'ቦታ ለመያየት'),
    'reservation_cancel': ('cancel that reservation', 'ያ ማስያዣ ለመሰረዝ'),
    'reservation_status': ('show your reservations', 'የቦታ ማስያዣዎችዎን ለማሳየት'),
    'order_create': ('place that order', 'ያንን ትዕዛዝ ለመስጠት'),
    'order_cancel': ('cancel that order', 'ያንን ትዕዛዝ ለመሰረዝ'),
    'order_status': ('show your orders', 'ትዕዛዞችዎን ለማሳየት'),
}

#: Same, for the short reason shown on the sign-in button. This one is a noun
#: phrase: "Sign in to continue with ...".
SIGNOUT_REASON = {
    'reservation_create': ('a table reservation', 'የቦታ ማስያዝ'),
    'reservation_cancel': ('cancelling a reservation', 'የማስያዣ ማሰረዝ'),
    'reservation_status': ('your reservation details', 'የቦታ ማስያዣ መረጃዎ'),
    'order_create': ('placing an order', 'ትዕዛዝ ማስያዝ'),
    'order_cancel': ('cancelling an order', 'የትዕዛዝ ማሰረዝ'),
    'order_status': ('your order details', 'የትዕዛዝ መረጃዎ'),
}


def is_authenticated(user):
    return bool(user and getattr(user, 'is_authenticated', False))


def requires_auth(intent):
    return intent in AUTH_REQUIRED_INTENTS


def sign_in_answer(intent, user=None, resume_hint=None):
    """
    Bilingual reply asking a guest to sign in or sign up before continuing.

    `resume_hint` is an (english, amharic) pair describing what they were already
    in the middle of, so the message reads like a continuation instead of a wall
    and does not make them repeat themselves.
    """
    what_en, what_am = SIGNOUT_TITLE.get(intent, ('help you further', 'ተጨማሪ ለመርዳት'))

    if resume_hint:
        hint_en, hint_am = resume_hint
        en = (f"I can {what_en} as soon as you are signed in.\n\n"
              f"Sign in below, or sign up if you do not have an account yet - it takes about a "
              f"minute. I already have {hint_en}, so we carry on from there.")
        am = (f"እንደተግባሩ ሲከለሉ {what_am} እችላለሁ።\n\n"
              f"ከዚህ በታች ይግቡ፣ መለያ ከሌለዎትም ተመዝገቡ - ከአንድ ደቂቃ በላይ አይፈልግም። "
              f"{hint_am} አስቀድሞ አለኝ፣ በዚያ ከዚያም ይቀጥላለን።")
    else:
        en = (f"I can {what_en} once you are signed in.\n\n"
              "Sign in below, or sign up if you do not have an account yet - it takes about a "
              "minute.")
        am = (f"እንደተግባሩ ሲከለሉ {what_am} እችላለሁ።\n\n"
              "ከዚህ በታች ይግቡ፣ መለያ ከሌለዎትም ተመዝገቡ - ከአንድ ደቂቃ በላይ አይፈልግም።")

    en += ("\n\nIn the meantime I can still help with the menu, prices, what is available today, "
           "and our opening hours.")
    am += ("\n\nበዚህ ሰዓት በሜኑ፣ በዋጋ፣ በዛሬ የሚገኙት ምርቶችና በመክፈቻ ሰዓታት እንዲሁም "
           "ልረዳዎን ማድረስ እችላለሁ።")

    return bilingual(en, am)


def sign_in_action(intent, pending_intent=None, missing_fields=None):
    """
    Payload the UI uses to render sign-in / sign-up buttons.

    `pending_intent` tells the chat widget which conversation to resume once the
    customer has signed in.
    """
    what_en, what_am = SIGNOUT_REASON.get(intent, ('using your account', 'መለያዎን ለመጠቀም'))
    return {
        'action': 'auth_required',
        'auth_reason': intent,
        'reason_en': f'Sign in to continue with {what_en}.',
        'reason_am': f'{what_am} ለመቀጠል ይግቡ።',
        'resume_intent': pending_intent or intent,
        # What the customer already told us, so the flow can resume without
        # asking again.
        'preserve_state': True,
        'missing_fields': missing_fields or [],
    }