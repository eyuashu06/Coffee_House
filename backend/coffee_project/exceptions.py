import math
from rest_framework.views import exception_handler
from rest_framework.exceptions import Throttled
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    """
    Standardizes error responses across API endpoints.
    Enriches rate-limited (HTTP 429) responses with explicit RFC 6585
    'Retry-After' header and JSON 'retry_after_seconds' payload.
    """
    response = exception_handler(exc, context)

    if isinstance(exc, Throttled):
        wait = math.ceil(exc.wait) if exc.wait is not None else 60
        if response is not None:
            response.headers['Retry-After'] = str(wait)
            response.data = {
                'error': 'Too Many Requests',
                'detail': f'Request rate limit exceeded. Please retry in {wait} second{"s" if wait != 1 else ""}.',
                'retry_after_seconds': wait,
            }

    return response
