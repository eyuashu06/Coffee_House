import re
import json
import logging
import urllib.request
import urllib.error
from django.db import models
from django.conf import settings
from django.contrib.auth import get_user_model
from .models import normalize_ethiopian_phone

logger = logging.getLogger(__name__)

User = get_user_model()


def send_otp_sms(phone, otp_code, sender_id=None):
    """
    Dispatches a 6-digit OTP verification SMS via a cascading multi-gateway engine:
    1. TextBee (https://textbee.dev) - Sends via linked Android phone/SIM card.
    2. SMSEthiopia (https://smsethiopia.com) - Direct Ethiopian telecom gateway.
    3. eSMS Africa (https://sms.esmsafrica.io) - Secondary fallback aggregator.
    """
    norm_phone = normalize_ethiopian_phone(phone)
    if not norm_phone:
        return False, {'error': 'Invalid phone number format.'}

    # Format numbers for providers:
    # msisdn without '+' for SMSEthiopia (e.g. 251911234567)
    msisdn = re.sub(r'[^0-9]', '', norm_phone)
    if msisdn.startswith('0'):
        msisdn = '251' + msisdn[1:]
    elif not msisdn.startswith('251'):
        msisdn = '251' + msisdn

    # E.164 with '+' for TextBee / eSMS Africa (e.g. +251911234567)
    plus_phone = f"+{msisdn}"

    message_text = f"Your Buna Hub verification code is: {otp_code}. Valid for 5 minutes."

    # 1. Primary: TextBee (https://textbee.dev) Android SIM Gateway
    textbee_key = getattr(settings, 'TEXTBEE_API_KEY', '').strip()
    textbee_url = getattr(settings, 'TEXTBEE_API_URL', 'https://api.textbee.dev/api/v1/gateway/send-sms').strip()

    if textbee_key:
        tb_payload = {
            'recipients': [plus_phone],
            'message': message_text,
        }
        req = urllib.request.Request(
            textbee_url,
            data=json.dumps(tb_payload).encode('utf-8'),
            headers={
                'x-api-key': textbee_key,
                'Content-Type': 'application/json',
                'User-Agent': 'BunaHub-OTP/1.0',
            },
            method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                resp_bytes = response.read()
                resp_data = json.loads(resp_bytes.decode('utf-8', errors='ignore'))
                logger.info("TextBee OTP dispatched to %s: %s", plus_phone, resp_data)
                if resp_data.get('success', False) or response.status == 200:
                    return True, resp_data
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8', errors='ignore')
            try:
                err_data = json.loads(err_body)
            except Exception:
                err_data = {'raw_error': err_body, 'code': e.code}
            logger.warning("TextBee HTTP %s for %s: %s", e.code, plus_phone, err_data)
        except Exception as exc:
            logger.error("TextBee network exception for %s: %s", plus_phone, exc)

    # 2. Secondary: SMSEthiopia (https://smsethiopia.com/api/sms/send)
    smsethiopia_key = getattr(settings, 'SMSETHIOPIA_API_KEY', '').strip()
    smsethiopia_url = getattr(settings, 'SMSETHIOPIA_API_URL', 'https://smsethiopia.com/api/sms/send').strip()

    if smsethiopia_key:
        payload = {
            'msisdn': msisdn,
            'text': message_text,
        }
        req = urllib.request.Request(
            smsethiopia_url,
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'KEY': smsethiopia_key,
                'Content-Type': 'application/json',
                'User-Agent': 'BunaHub-OTP/1.0',
            },
            method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                resp_bytes = response.read()
                resp_data = json.loads(resp_bytes.decode('utf-8', errors='ignore'))
                logger.info("SMSEthiopia OTP dispatched to %s: %s", msisdn, resp_data)
                is_sent = bool(resp_data.get('sent', False)) or resp_data.get('status') in ('success', 'sent', 200, True)
                if is_sent:
                    return True, resp_data
                logger.warning("SMSEthiopia reported unsent for %s: %s", msisdn, resp_data)
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8', errors='ignore')
            try:
                err_data = json.loads(err_body)
            except Exception:
                err_data = {'raw_error': err_body, 'code': e.code}
            logger.warning("SMSEthiopia HTTP %s for %s: %s", e.code, msisdn, err_data)
        except Exception as exc:
            logger.error("SMSEthiopia network exception for %s: %s", msisdn, exc)

    # 2. Secondary / Fallback: eSMS Africa (https://sms.esmsafrica.io/api/messages/send)
    if not sender_id:
        try:
            from apps.menu.models import CafeSettings
            cafe_settings = CafeSettings.objects.first()
            if cafe_settings and cafe_settings.primary_phone:
                sender_id = cafe_settings.primary_phone.strip()
        except Exception:
            pass

    if not sender_id:
        sender_id = getattr(settings, 'ESMS_SENDER_ID', 'BunaHub')

    api_key = getattr(settings, 'ESMS_API_KEY', 'esms_live_1634eb3a37c43f6d08531e703f0a55aa')
    api_url = getattr(settings, 'ESMS_API_URL', 'https://sms.esmsafrica.io/api/messages/send')

    payload = {
        'to': plus_phone,
        'text': message_text,
        'sender_id': sender_id,
    }

    req = urllib.request.Request(
        api_url,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f"Bearer {api_key}",
            'Content-Type': 'application/json',
            'User-Agent': 'BunaHub-OTP/1.0',
        },
        method='POST',
    )

    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            resp_bytes = response.read()
            resp_data = json.loads(resp_bytes.decode('utf-8', errors='ignore'))
            logger.info("eSMS Africa OTP dispatched to %s: %s", plus_phone, resp_data)
            return True, resp_data
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='ignore')
        try:
            err_data = json.loads(err_body)
        except Exception:
            err_data = {'raw_error': err_body, 'code': e.code}

        logger.warning(
            "eSMS Africa HTTP %s for %s: %s",
            e.code,
            plus_phone,
            err_data,
        )
        return False, err_data
    except Exception as exc:
        logger.error("eSMS Africa network exception for %s: %s", plus_phone, exc)
        return False, {'error': str(exc)}



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
            email_to_use = f"{clean_digits}@bunahub.com"

        user = User(
            username=clean_digits,
            phone=norm_phone,
            first_name=first_name,
            last_name=last_name,
            email=email_to_use,
            role='CUSTOMER'
        )
        user.set_unusable_password()
        try:
            user.save()
            created = True
        except Exception as e:
            # Concurrency race condition: parallel thread inserted user with same username/phone
            user = User.objects.filter(
                models.Q(phone=norm_phone) |
                models.Q(username=norm_phone) |
                models.Q(username=clean_digits)
            ).first()
            created = False
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
        if user.email and user.email.endswith('@customer.artisanalreserve.com'):
            user.email = f"{clean_digits}@bunahub.com"
            fields_to_update.append('email')
        if fields_to_update:
            user.save(update_fields=list(set(fields_to_update)))

    return user, created
