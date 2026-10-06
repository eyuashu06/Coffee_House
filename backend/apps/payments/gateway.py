"""
Direct Chapa API access.

The `chapa` PyPI package (0.1.2) cannot verify transactions against the httpx
version this project runs. Its `Chapa.verify()` funnels through
`send_request(method="get")`, which calls `httpx.Client.get(url, data=data,
headers=headers)`. httpx removed the `data` kwarg from `.get()` in 0.28, so every
verify raises:

    TypeError: Client.get() got an unexpected keyword argument 'data'

That exception was swallowed by a broad `except`, leaving every real card payment
stuck at PENDING while the customer had already paid. It is invisible unless you
go looking in `raw_response`.

So verification is done here with plain httpx against the documented endpoint,
and the SDK is no longer used for it. Initialisation still goes through the SDK
because POST accepts `data` and that path works.

Everything the gateway tells us is treated as a claim to be checked, not as
truth. A payment is only marked successful when the transaction reference,
currency and amount all match what we recorded when the order was created.
"""

import json
import logging
from decimal import Decimal, InvalidOperation

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)

#: Chapa asks clients not to retry verification too aggressively.
DEFAULT_TIMEOUT = 15.0

#: Gateway statuses that mean the customer has walked away from checkout.
TERMINAL_FAILURE_STATUSES = {'failed', 'rejected'}

#: Gateway statuses that mean the payment is still moving.
PENDING_STATUSES = {'pending', 'processing', 'initialized'}


class GatewayError(Exception):
    """The gateway could not be reached, or answered with something unusable."""


class TransactionNotFound(GatewayError):
    """
    The gateway has no record of this transaction.

    A final answer, not a temporary one. Chapa either never received the
    initialise call (the two dev rows with an empty checkout_url) or has since
    dropped it. Either way no money is coming, so the payment must be closed as
    failed instead of being re-checked forever.
    """


class VerificationMismatch(Exception):
    """
    The gateway says the transaction succeeded, but not for the payment we
    recorded - a different amount, currency or reference.

    This is treated as a failure, never as a success. Marking the wrong
    transaction as paid would send a real order to the kitchen for free.
    """


def _api_base():
    url = (getattr(settings, 'CHAPA_API_URL', 'https://api.chapa.co/v1') or '').rstrip('/')
    if not url:
        return 'https://api.chapa.co/v1'
    return url


def _secret():
    return getattr(settings, 'CHAPA_SECRET_KEY', '') or ''


def _timeout():
    return float(getattr(settings, 'CHAPA_VERIFY_TIMEOUT', DEFAULT_TIMEOUT))


def is_test_mode():
    """True when the configured secret is a Chapa test key."""
    return _secret().startswith('CHASECK_TEST')


def verify_transaction(tx_ref):
    """
    Ask Chapa about one transaction.

    Returns the decoded `data` object. Raises GatewayError when the gateway is
    unreachable or its answer cannot be parsed - the caller keeps the payment
    PENDING and tries again, because "we could not ask" is not "they did not pay".
    """
    if not tx_ref:
        raise GatewayError('Missing transaction reference.')

    secret = _secret()
    if not secret:
        raise GatewayError('CHAPA_SECRET_KEY is not configured.')

    url = f"{_api_base()}/transaction/verify/{tx_ref}"
    try:
        response = httpx.get(
            url,
            headers={'Authorization': f'Bearer {secret}'},
            timeout=_timeout(),
        )
    except httpx.HTTPError as exc:
        raise GatewayError(f'Could not reach the payment gateway: {exc}') from exc

    # Chapa answers an unknown reference with 404, or 400 carrying
    # "Invalid transaction reference" depending on the account.
    if response.status_code == 404 or 'invalid transaction reference' in response.text.lower():
        raise TransactionNotFound('The gateway has no record of this transaction.')

    if response.status_code >= 500:
        raise GatewayError(f'Payment gateway is unavailable ({response.status_code}).')

    try:
        payload = response.json()
    except (ValueError, json.JSONDecodeError) as exc:
        raise GatewayError('Payment gateway returned an unreadable response.') from exc

    if not isinstance(payload, dict):
        raise GatewayError('Payment gateway returned an unexpected response.')

    if response.status_code >= 400:
        message = payload.get('message') or f'HTTP {response.status_code}'
        raise GatewayError(str(message)[:255])

    data = payload.get('data') or {}
    if not isinstance(data, dict):
        raise GatewayError('Payment gateway response contained no transaction data.')
    return data


def _to_decimal(value):
    if value in (None, ''):
        return None
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        return None


def check_transaction_matches(payment, data):
    """
    Confirm the verified transaction really is the payment we recorded.

    Raises VerificationMismatch on any disagreement.

    Two naming traps, both of which cost real money if missed:

    - `reference` is Chapa's *own* short id for the transaction. `tx_ref` is the
      id we supplied. They are never equal, so comparing them marks every genuine
      payment as a mismatch.
    - `amount` is what was charged, before Chapa's service fee. It must match the
      order total, not the total plus the fee.

    A payment with no `tx_ref` back from the gateway is only accepted when the
    reference matches one we issued ourselves (the mock and cash paths, where
    Chapa is not involved at all).
    """
    gateway_tx_ref = str(data.get('tx_ref') or '').strip()
    gateway_reference = str(data.get('reference') or '').strip()

    if gateway_tx_ref:
        if gateway_tx_ref != payment.tx_ref:
            raise VerificationMismatch(
                f'Gateway transaction {gateway_tx_ref} does not match {payment.tx_ref}.')
    elif gateway_reference:
        # Only acceptable for the local mock / cash flows, which stamp our own
        # reference as the Chapa reference.
        local_references = {'CHAPA_MOCK_SUCCESS', 'CASH_ON_DELIVERY'}
        if gateway_reference not in local_references and gateway_reference != payment.chapa_reference:
            raise VerificationMismatch(
                f'Gateway returned reference {gateway_reference} for an unrecognised transaction.')

    currency = str(data.get('currency') or '').strip().upper()
    if currency and currency != (payment.currency or 'ETB').upper():
        raise VerificationMismatch(
            f'Gateway currency {currency} does not match {payment.currency}.')

    gateway_amount = _to_decimal(data.get('amount'))
    if gateway_amount is None:
        raise VerificationMismatch('Gateway did not report an amount for this transaction.')

    expected = Decimal(str(payment.amount_etb))
    if gateway_amount.quantize(Decimal('0.01')) != expected.quantize(Decimal('0.01')):
        raise VerificationMismatch(
            f'Gateway amount {gateway_amount} does not match the order total {expected}.')

    return True


def normalise_status(data):
    """The gateway's transaction status, lowercased ('' when absent)."""
    return str(data.get('status') or '').strip().lower()


def is_success(status):
    return status == 'success'


def is_terminal_failure(status):
    return status in TERMINAL_FAILURE_STATUSES


def is_pending(status):
    return status in PENDING_STATUSES


def webhook_signature_is_valid(body_bytes, signature, secret=None):
    """
    Check a Chapa webhook signature.

    Chapa signs the *raw* request body. The SDK helper re-serialises the parsed
    dict with `json.dumps`, which reorders keys differently from the body Chapa
    signed, so it rejects genuine webhooks. Signing the raw bytes is what the
    gateway actually did.

    Both hex and base64 signatures are accepted, and both the secret key and the
    dedicated webhook secret are tried, because Chapa has used each of them.
    """
    if not signature or not body_bytes:
        return False

    import base64
    import hashlib
    import hmac

    candidates = [
        secret or getattr(settings, 'CHAPA_WEBHOOK_SECRET', ''),
        getattr(settings, 'CHAPA_WEBHOOK_SECRET', ''),
        _secret(),
    ]

    for key in (c for c in candidates if c):
        hex_signature = hmac.new(key.encode(), body_bytes, hashlib.sha256).hexdigest()
        if hmac.compare_digest(hex_signature, signature or ''):
            return True
        b64_signature = base64.b64encode(
            hmac.new(key.encode(), body_bytes, hashlib.sha256).digest()).decode()
        if hmac.compare_digest(b64_signature, signature or ''):
            return True
    return False