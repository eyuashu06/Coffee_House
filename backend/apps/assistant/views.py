"""
Public API for the Coffee House assistant.

Never returns stack traces, provider errors or admin data to the customer -
technical problems are logged server-side and answered with a friendly bilingual
message.
"""

import logging

from django.db import DatabaseError
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .engine import QUICK_ACTIONS, answer_query

logger = logging.getLogger(__name__)

GENERIC_ERROR_EN = ("Sorry, I'm having trouble retrieving that information right now. "
                    "Please try again shortly.")
GENERIC_ERROR_AM = ("ይቅርታ፣ ያንን መረጃ አሁን ማግኘት አልቻልኩም። "
                    "እባክዎ እንደገና በትንሹ ቆይተው ይሞክሩ።")


def _bilingual_error():
    return {
        'answer': f"**English 🇬🇧**\n\n{GENERIC_ERROR_EN}\n\n**አማርኛ 🇪🇹**\n\n{GENERIC_ERROR_AM}",
        'answer_en': GENERIC_ERROR_EN,
        'answer_am': GENERIC_ERROR_AM,
        'intent': 'error',
        'language': 'en',
        'items': [],
        'reservations': [],
        'orders': [],
        'action': {'action': 'none'},
        'sources': [],
        'engine': 'deterministic',
    }


class AssistantMessageView(APIView):
    """
    POST /api/v1/assistant/message/ -> bilingual grounded answer.

    Open to everyone: browsing the menu never needs an account. Whether the
    customer is signed in decides what the assistant may do on their behalf,
    and it is read from the request here, not from anything the client sends.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        query = request.data.get('query') or request.data.get('message') or ''
        session_id = request.data.get('session_id') or request.headers.get('X-Assistant-Session')

        if not str(query).strip():
            return Response({
                'answer': "**English 🇬🇧**\n\nPlease type a question first.\n\n**አማርኛ 🇪🇹**\n\nእባክዎ መጀመሪያ ጥያቄ ያጻፉ።",
                'answer_en': 'Please type a question first.',
                'answer_am': 'እባክዎ መጀመሪያ ጥያቄ ያጻፉ።',
                'intent': 'empty', 'language': 'en', 'items': [], 'reservations': [],
                'orders': [], 'action': {'action': 'none'}, 'sources': [],
                'engine': 'deterministic',
            }, status=status.HTTP_200_OK)

        try:
            user = request.user if request.user and request.user.is_authenticated else None
            result = answer_query(str(query), session_id=session_id, user=user)
            return Response(result, status=status.HTTP_200_OK)
        except DatabaseError:
            logger.exception('Assistant database error')
            return Response(_bilingual_error(), status=status.HTTP_200_OK)
        except Exception:
            logger.exception('Assistant failure')
            return Response(_bilingual_error(), status=status.HTTP_200_OK)
        except Exception:
            logger.exception('Assistant failure')
            return Response(_bilingual_error(), status=status.HTTP_200_OK)


class AssistantQuickActionsView(APIView):
    """GET /api/v1/assistant/quick-actions/ -> starter prompts in both languages."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'quick_actions': QUICK_ACTIONS}, status=status.HTTP_200_OK)


class AssistantResetView(APIView):
    """POST /api/v1/assistant/reset/ -> clears short-term conversation memory."""

    permission_classes = [AllowAny]

    def post(self, request):
        from .engine import _SESSIONS

        session_id = request.data.get('session_id') or request.headers.get('X-Assistant-Session')
        if session_id:
            _SESSIONS.pop(session_id, None)
        return Response({'status': 'ok', 'session_id': session_id}, status=status.HTTP_200_OK)