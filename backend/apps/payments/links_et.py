"""
links.et Ethiopian Bank & Mobile Money Verification Client.

Integrates with links.et to verify digital transaction receipts at source
over Ethiopia-egress route across 17+ banks and mobile wallets:
- Telebirr (Ethio Telecom)
- Commercial Bank of Ethiopia (CBE / CBE Birr)
- Bank of Abyssinia (BoA)
- Awash Bank (Awash Birr)
- Safaricom M-Pesa
- COOPay E-Birr / Kaafi E-Birr
- Dashen Bank / Dashen Super App
- Zemen, Amhara, Abay, Berhan, Oromia, Ahadu, Siinqee, ZamZam banks
"""

import re
import json
import base64
import logging
from decimal import Decimal, InvalidOperation
from typing import Optional, Dict, Any, Union

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)

PROVIDER_DISPLAY_NAMES = {
    'telebirr': 'Telebirr (Ethio Telecom)',
    'cbe': 'Commercial Bank of Ethiopia (CBE)',
    'cbebirr': 'CBE Birr',
    'boa': 'Bank of Abyssinia (BoA)',
    'awash': 'Awash Bank / Awash Birr',
    'awashbank': 'Awash Bank',
    'mpesa': 'Safaricom M-Pesa',
    'ebirr': 'E-Birr (COOPay / Kaafi)',
    'dashen': 'Dashen Bank (Amole / Super App)',
    'zemen': 'Zemen Bank',
    'amhara': 'Amhara Bank',
    'abay': 'Abay Bank',
    'berhan': 'Berhan Bank',
    'oromia': 'Oromia Bank',
    'ahadu': 'Ahadu Bank',
    'siinqee': 'Siinqee Bank',
    'zamzam': 'ZamZam Bank',
    'hulubeje': 'HuluBeje POS',
}


def _get_api_key() -> str:
    return getattr(settings, 'LINKS_ET_API_KEY', '').strip()


def _get_api_base() -> str:
    url = getattr(settings, 'LINKS_ET_API_URL', 'https://links.et') or 'https://links.et'
    return url.rstrip('/')


def _get_timeout() -> float:
    return float(getattr(settings, 'LINKS_ET_TIMEOUT', 25.0))


def is_links_et_configured() -> bool:
    """True if links.et API key is present."""
    return bool(_get_api_key())


def _parse_amount(raw_val: Any) -> Optional[Decimal]:
    """Parse various amount formats (100, 100.50, '100 Birr', '100 ETB', '100.00 ETB')."""
    if raw_val is None:
        return None
    if isinstance(raw_val, (int, float, Decimal)):
        try:
            return Decimal(str(raw_val)).quantize(Decimal('0.01'))
        except (InvalidOperation, TypeError):
            return None

    text = str(raw_val).strip()
    # Match number with optional decimals: e.g. 1,234.50 or 100.00
    cleaned = re.sub(r'[^\d.]', '', text)
    try:
        return Decimal(cleaned).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        return None


def _normalize_receipt_data(
    resp_data: Dict[str, Any],
    expected_amount: Optional[Union[Decimal, float, str]] = None,
    expected_receiver: Optional[str] = None
) -> Dict[str, Any]:
    """
    Standardize provider-specific receipt structures into a uniform verification outcome.
    """
    provider_key = resp_data.get('providerKey') or 'unknown'
    receipt = resp_data.get('receipt') or {}
    source = receipt.get('source', '')

    payer_name = ''
    payer_account = ''
    receiver_name = ''
    receiver_account = ''
    reference = ''
    payment_date = ''
    raw_amount = None
    bank_status = 'COMPLETED'

    if source == 'telebirr-html':
        payer_name = receipt.get('payerName', '')
        payer_account = receipt.get('payerTelebirrNo', '')
        receiver_name = receipt.get('creditedPartyName', '')
        receiver_account = receipt.get('creditedPartyAccountNo', '')
        reference = receipt.get('receiptNo', '')
        payment_date = receipt.get('paymentDate', '')
        raw_amount = receipt.get('settledAmount') or receipt.get('totalPaidAmount')
        bank_status = receipt.get('transactionStatus', 'Completed')

    elif source in ('cbe-pdf', 'mb-json', 'cbebirr-pdf'):
        payer_name = receipt.get('payerName', '')
        payer_account = receipt.get('payerAccount', '')
        receiver_name = receipt.get('receiverName', '')
        receiver_account = receipt.get('receiverAccount', '')
        reference = receipt.get('reference', '')
        payment_date = receipt.get('paymentDate', '')
        raw_amount = receipt.get('transferredAmount') or receipt.get('totalAmount') or receipt.get('creditAmount')
        bank_status = 'Completed'

    elif source == 'boa-json':
        payer_name = receipt.get('payerName', '')
        receiver_name = receipt.get('receiverName', '')
        receiver_account = receipt.get('receiverAccount', '')
        reference = receipt.get('transactionReference', '')
        payment_date = receipt.get('transactionDate', '')
        raw_amount = receipt.get('transferredAmount') or receipt.get('totalAmount')
        bank_status = receipt.get('upstreamStatus', 'Success')

    elif source == 'awash-html':
        cust = receipt.get('customer') or {}
        trx = receipt.get('transaction') or {}
        payer_name = trx.get('senderName') or cust.get('customerName', '')
        payer_account = trx.get('senderAccount') or cust.get('accountNo', '')
        receiver_name = trx.get('beneficiaryName', '')
        receiver_account = trx.get('beneficiaryAccount', '')
        reference = trx.get('transactionId', '')
        payment_date = trx.get('transactionTime', '')
        raw_amount = trx.get('amount')
        bank_status = 'Completed'

    elif source == 'zemen-pdf':
        payer_name = receipt.get('payerName', '')
        payer_account = receipt.get('payerAccount', '')
        receiver_name = receipt.get('recipientName', '')
        receiver_account = receipt.get('recipientAccount', '')
        reference = receipt.get('reference', '')
        payment_date = receipt.get('date', '')
        raw_amount = receipt.get('settledAmount') or receipt.get('totalAmountPaid')
        bank_status = receipt.get('transactionStatus', 'COMPLETED')

    else:
        # Fallback inspection across common keys
        payer_name = receipt.get('payerName') or receipt.get('senderName') or ''
        payer_account = receipt.get('payerAccount') or receipt.get('payerPhone') or ''
        receiver_name = receipt.get('receiverName') or receipt.get('beneficiaryName') or ''
        receiver_account = receipt.get('receiverAccount') or receipt.get('beneficiaryAccount') or ''
        reference = receipt.get('reference') or receipt.get('receiptNo') or receipt.get('transactionId') or ''
        payment_date = receipt.get('paymentDate') or receipt.get('transactionTime') or ''
        raw_amount = receipt.get('amount') or receipt.get('transferredAmount') or receipt.get('settledAmount')

    parsed_amount = _parse_amount(raw_amount)

    # Determine amount match
    amount_matches = None
    expected_dec = None
    if expected_amount is not None:
        try:
            expected_dec = Decimal(str(expected_amount)).quantize(Decimal('0.01'))
            if parsed_amount is not None:
                amount_matches = (parsed_amount == expected_dec)
        except (InvalidOperation, TypeError):
            pass

    is_completed = str(bank_status).strip().lower() in ('completed', 'success', 'paid', 'approved')
    verified = resp_data.get('ok', False) and is_completed and (amount_matches is not False)

    provider_name = PROVIDER_DISPLAY_NAMES.get(provider_key, provider_key.title())

    # Formulate human messages in English and Amharic
    if verified:
        msg_en = f"Verified at {provider_name}: {parsed_amount or ''} ETB successfully paid by {payer_name or 'Customer'}."
        msg_am = f"በ{provider_name} ተረጋግጧል፦ {parsed_amount or ''} ብር በ{payer_name or 'ደንበኛ'} በትክክል ተከፍሏል።"
    elif amount_matches is False:
        msg_en = f"Amount mismatch: Bank receipt shows {parsed_amount} ETB, but order total is {expected_dec} ETB."
        msg_am = f"የገንዘብ መጠን ልዩነት፦ የባንክ ደረሰኙ {parsed_amount} ብር ያሳያል፣ ነገር ግን የትዕዛዙ ጠቅላላ ዋጋ {expected_dec} ብር ነው።"
    elif not resp_data.get('ok'):
        err = resp_data.get('error') or 'Verification failed at bank'
        msg_en = f"Bank verification failed: {err}"
        msg_am = f"የባንክ ማረጋገጫ አልተሳካም፦ {err}"
    else:
        msg_en = f"Transaction retrieved from {provider_name} (Status: {bank_status})."
        msg_am = f"ግብይቱ ከ{provider_name} ተገኝቷል (ሁኔታ፦ {bank_status})።"

    return {
        'ok': bool(resp_data.get('ok')),
        'verified': bool(verified),
        'provider': provider_name,
        'provider_key': provider_key,
        'source': source,
        'reference': reference or resp_data.get('resolvedUrl', ''),
        'amount_etb': str(parsed_amount) if parsed_amount is not None else None,
        'expected_amount_etb': str(expected_dec) if expected_dec is not None else None,
        'amount_matches': amount_matches,
        'payer_name': payer_name,
        'payer_account': payer_account,
        'receiver_name': receiver_name,
        'receiver_account': receiver_account,
        'payment_date': payment_date,
        'bank_status': bank_status,
        'fetched_at': resp_data.get('fetchedAt'),
        'resolved_url': resp_data.get('resolvedUrl'),
        'message': msg_en,
        'message_am': msg_am,
        'raw_receipt': receipt,
        'request_id': resp_data.get('requestId'),
    }


def verify_receipt(
    url_or_ref: str,
    expected_amount: Optional[Union[Decimal, float, str]] = None,
    expected_receiver: Optional[str] = None
) -> Dict[str, Any]:
    """
    Verify a receipt URL or Telebirr reference code with links.et.

    Args:
        url_or_ref: Full receipt URL (Telebirr, CBE, Awash, etc.) or Telebirr reference string.
        expected_amount: Order amount in ETB to validate against bank settled amount.
        expected_receiver: Account number or merchant name to match.

    Returns:
        Structured dict with verification status, parsed bank fields, and messages.
    """
    api_key = _get_api_key()
    if not api_key:
        return {
            'ok': False,
            'verified': False,
            'error': 'LINKS_ET_API_KEY is not configured in .env',
            'message': 'links.et verification service is not configured.',
            'message_am': 'የ links.et ማረጋገጫ አገልግሎት አልተዋቀረም።',
        }

    raw = str(url_or_ref or '').strip()
    if not raw:
        return {
            'ok': False,
            'verified': False,
            'error': 'Missing receipt URL or reference code',
            'message': 'No transaction URL or reference provided for verification.',
            'message_am': 'ምንም የደረሰኝ ሊንክ ወይም የማረጋገጫ ኮድ አልቀረበም።',
        }

    # Clean stripped receipt tags, e.g. "Receipt: filename.jpg (120KB)"
    if raw.startswith('Receipt:'):
        # Look for URL or reference within it if pasted
        match = re.search(r'https?://\S+', raw)
        if match:
            raw = match.group(0)
        else:
            return {
                'ok': False,
                'verified': False,
                'error': 'Document requires image verification or manual reference',
                'message': 'Uploaded file slip requires image verification or manager inspection.',
                'message_am': 'የተጫነው ሰነድ ምስል ማረጋገጫ ወይም የአስተዳዳሪ ፍተሻ ያስፈልገዋል።',
            }

    payload: Dict[str, Any] = {'waitMs': 10000}
    if raw.startswith(('http://', 'https://')):
        payload['url'] = raw
    else:
        # If it looks like a Telebirr or general reference (alphanumeric 6-30 chars)
        cleaned_ref = re.sub(r'[^A-Za-z0-9]', '', raw)
        if cleaned_ref:
            payload['reference'] = cleaned_ref
        else:
            payload['url'] = raw

    headers = {
        'x-api-key': api_key,
        'content-type': 'application/json',
        'User-Agent': 'CoffeeHouse-Verification/1.0',
    }

    url = f"{_get_api_base()}/api/verify"
    try:
        with httpx.Client(timeout=_get_timeout()) as client:
            resp = client.post(url, json=payload, headers=headers)
            data = resp.json()
    except httpx.TimeoutException:
        logger.warning(f"links.et timeout for {url_or_ref}")
        return {
            'ok': False,
            'verified': False,
            'error': 'Bank verification request timed out. Bank upstream may be busy.',
            'message': 'Verification timed out. Manager will verify your payment manually.',
            'message_am': 'የባንክ ማረጋገጫው ጊዜ አልቋል። አስተዳዳሪው ክፍያዎን በእጅ ያረጋግጣል።',
        }
    except Exception as e:
        logger.exception("links.et request failed")
        return {
            'ok': False,
            'verified': False,
            'error': str(e),
            'message': 'Error communicating with links.et verification service.',
            'message_am': 'ከ links.et አገልግሎት ጋር መገናኘት አልተቻለም።',
        }

    return _normalize_receipt_data(data, expected_amount=expected_amount, expected_receiver=expected_receiver)


def verify_receipt_image(
    image_base64: str,
    expected_amount: Optional[Union[Decimal, float, str]] = None,
    expected_receiver: Optional[str] = None
) -> Dict[str, Any]:
    """
    Verify a receipt screenshot with links.et AI OCR detector and bank cross-check.

    Args:
        image_base64: Raw base64 string or data:image/... base64 URI.
        expected_amount: Expected order amount in ETB.
        expected_receiver: Expected cafe receiver account.

    Returns:
        Structured dict with detected provider, reference, and bank verification.
    """
    api_key = _get_api_key()
    if not api_key:
        return {
            'ok': False,
            'verified': False,
            'error': 'LINKS_ET_API_KEY is not configured in .env',
            'message': 'links.et verification service is not configured.',
            'message_am': 'የ links.et ማረጋገጫ አገልግሎት አልተዋቀረም።',
        }

    # Strip data:image/...;base64, prefix if present
    clean_b64 = image_base64
    if ',' in clean_b64:
        clean_b64 = clean_b64.split(',', 1)[1]

    clean_b64 = clean_b64.strip()
    if not clean_b64:
        return {
            'ok': False,
            'verified': False,
            'error': 'Empty image data provided',
            'message': 'No receipt image provided.',
            'message_am': 'ምንም የደረሰኝ ምስል አልቀረበም።',
        }

    payload = {
        'images': [{'imageBase64': clean_b64}],
    }

    headers = {
        'x-api-key': api_key,
        'content-type': 'application/json',
        'User-Agent': 'CoffeeHouse-Verification/1.0',
    }

    url = f"{_get_api_base()}/api/verify-image"
    try:
        with httpx.Client(timeout=35.0) as client:
            resp = client.post(url, json=payload, headers=headers)
            data = resp.json()
    except httpx.TimeoutException:
        logger.warning("links.et verify-image timeout")
        return {
            'ok': False,
            'verified': False,
            'error': 'Screenshot verification timed out.',
            'message': 'Receipt image verification timed out. Manager will review your receipt slip.',
            'message_am': 'የደረሰኝ ምስል ማረጋገጫው ጊዜ አልቋል። አስተዳዳሪው ደረሰኝዎን ይመረምራል።',
        }
    except Exception as e:
        logger.exception("links.et verify-image request failed")
        return {
            'ok': False,
            'verified': False,
            'error': str(e),
            'message': 'Error processing receipt screenshot with links.et.',
            'message_am': 'የደረሰኝ ምስሉን በ links.et ማረጋገጥ አልተቻለም።',
        }

    # Inspect detected OCR info and upstream bank cross-check
    detected = data.get('detected') or {}
    upstream = data.get('upstream') or {}
    upstream_result = upstream.get('result') or {}

    if upstream.get('attempted') and upstream_result:
        normalized = _normalize_receipt_data(upstream_result, expected_amount=expected_amount, expected_receiver=expected_receiver)
        normalized['ocr_detected'] = detected
        return normalized

    # Upstream was not attempted or provider needs full URL
    provider = detected.get('provider', 'none')
    ref = detected.get('reference')
    reason = upstream.get('reason') or data.get('error', {}).get('message') or 'Could not auto-verify upstream'

    provider_name = PROVIDER_DISPLAY_NAMES.get(provider, provider.title())
    msg_en = f"Detected {provider_name} receipt ({ref or 'Reference unreadable'}). Manager will review."
    msg_am = f"የ{provider_name} ደረሰኝ ተገኝቷል ({ref or 'ማረጋገጫው አልተነበበም'})። አስተዳዳሪው ይመረምረዋል።"

    return {
        'ok': bool(data.get('ok')),
        'verified': False,
        'provider': provider_name,
        'provider_key': provider,
        'reference': ref,
        'ocr_detected': detected,
        'upstream_reason': reason,
        'message': msg_en,
        'message_am': msg_am,
        'raw_response': data,
    }
