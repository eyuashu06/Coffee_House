import re
import socket

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email as django_validate_email

#: Domains that can never receive mail: reserved examples, throwaway providers and
#: the placeholder domains used by the demo seed data. Signing up with one of these
#: produces an address that cannot receive order receipts or payment emails.
NON_DELIVERABLE_EMAIL_DOMAINS = {
    'example.com',
    'example.net',
    'example.org',
    'example.edu',
    'test.com',
    'localhost',
    'local',
    'invalid',
    'domain.com',
    'email.com',
    'artisanalreserve.com',
    'artisanalcoffee.com',
    'bunahub.et',
    'company.com',
    'mailinator.com',
    '10minutemail.com',
    'tempmail.com',
    'trashmail.com',
    'yopmail.com',
    'guerrillamail.com',
    'fakeinbox.com',
}

#: TLDs Chapa/banks treat as deliverable mailbox providers.
_NON_MAIL_TLDS = {'local', 'localhost', 'internal', 'intranet', 'lan', 'test', 'invalid', 'example'}


def email_domain(email):
    """Return the lowercase domain part of an email address (or '' when malformed)."""
    email = (email or '').strip().lower()
    if email.count('@') != 1:
        return ''
    domain = email.rsplit('@', 1)[1]
    return domain


def is_deliverable_email(email, check_mx=None):
    """
    Return True when the address is syntactically valid AND hosted on a domain that
    can actually receive mail (this is what the Chapa gateway requires).

    `check_mx` defaults to settings.REQUIRE_EMAIL_MX. DNS failures never block signup
    (they mean "no network", not "invalid address") - only an explicit NXDOMAIN does.
    """
    email = (email or '').strip()
    if not email:
        return False

    try:
        django_validate_email(email)
    except ValidationError:
        return False

    domain = email_domain(email)
    if not domain or '.' not in domain:
        return False

    tld = domain.rsplit('.', 1)[1]
    if len(tld) < 2 or tld in _NON_MAIL_TLDS:
        return False

    if domain in NON_DELIVERABLE_EMAIL_DOMAINS:
        return False

    if check_mx is None:
        check_mx = getattr(settings, 'REQUIRE_EMAIL_MX', True)

    if check_mx:
        try:
            previous_timeout = socket.getdefaulttimeout()
            socket.setdefaulttimeout(3)
            try:
                socket.getaddrinfo(domain, None)
            except socket.gaierror:
                return False
            finally:
                socket.setdefaulttimeout(previous_timeout)
        except Exception:
            # DNS unavailable (offline container) - don't block the signup
            return True

    return True


def validate_deliverable_email(value):
    """Django validator raising a helpful error for unusable email addresses."""
    if value in (None, ''):
        return
    try:
        django_validate_email(value)
    except ValidationError:
        raise ValidationError('Enter a valid email address, e.g. name@gmail.com.')

    domain = email_domain(value)
    if domain in NON_DELIVERABLE_EMAIL_DOMAINS:
        raise ValidationError(
            f"'{domain}' cannot receive email. Please use an address you actually control, "
            'e.g. yourname@gmail.com — it is needed for your order receipt.'
        )

    if not is_deliverable_email(value):
        raise ValidationError(
            f"'{domain}' does not exist, so we cannot send your receipt there. "
            'Please use a real email address, e.g. yourname@gmail.com.'
        )