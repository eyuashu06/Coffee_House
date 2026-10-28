import re
from django.db import models
from django.contrib.auth import get_user_model
from .models import normalize_ethiopian_phone

User = get_user_model()


def get_or_create_customer_by_phone(phone, name='', email=''):
    """
    Finds or creates a customer User seamlessly from a phone number and name.
    Ensures frictionless customer checkout and authentication without requiring
    email and password accounts, while keeping username/password auth for staff.
    """
    norm_phone = normalize_ethiopian_phone(phone)
    if not norm_phone:
        return None, False

    clean_digits = re.sub(r'[^0-9]', '', norm_phone)
    if len(clean_digits) < 9:
        return None, False

    # Check by normalized phone or username matching the digits
    user = User.objects.filter(
        models.Q(phone=norm_phone) |
        models.Q(username=norm_phone) |
        models.Q(username=clean_digits)
    ).first()

    created = False
    if not user:
        name_clean = (name or '').strip()
        parts = name_clean.split(maxsplit=1) if name_clean else []
        first_name = parts[0] if len(parts) > 0 else 'Customer'
        last_name = parts[1] if len(parts) > 1 else ''

        email_to_use = (email or '').strip()
        if not email_to_use:
            email_to_use = f"{clean_digits}@customer.artisanalreserve.com"

        user = User(
            username=clean_digits,
            phone=norm_phone,
            first_name=first_name,
            last_name=last_name,
            email=email_to_use,
            role='CUSTOMER'
        )
        user.set_unusable_password()
        user.save()
        created = True
    else:
        fields_to_update = []
        name_clean = (name or '').strip()
        if name_clean and (not user.first_name or user.first_name == 'Customer'):
            parts = name_clean.split(maxsplit=1)
            user.first_name = parts[0]
            if len(parts) > 1:
                user.last_name = parts[1]
            fields_to_update.extend(['first_name', 'last_name'])
        if not user.phone:
            user.phone = norm_phone
            fields_to_update.append('phone')
        if fields_to_update:
            user.save(update_fields=list(set(fields_to_update)))

    return user, created
