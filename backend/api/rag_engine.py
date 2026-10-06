"""
Backwards-compatible shim.

The original sommelier engine answered from hardcoded copy and referenced menu
items that do not exist in this database. It now delegates to the grounded
assistant so the legacy `/api/v1/sommelier/` endpoint cannot hallucinate either.
"""

import logging

logger = logging.getLogger(__name__)


class CoffeeSommelierRAG:
    """Deprecated: use apps.assistant.engine.answer_query()."""

    def __init__(self, *args, **kwargs):
        self.engine = None

    def retrieve_context(self, user_query):
        """Kept for callers that only wanted retrieval."""
        from apps.assistant.retriever import find_menu_items, search_knowledge_base

        items = find_menu_items(user_query, limit=3)
        docs = search_knowledge_base(user_query, limit=3)
        return docs, items

    def generate_response(self, user_query, session_id=None, user=None):
        from apps.assistant.engine import answer_query

        try:
            result = answer_query(user_query, session_id=session_id, user=user)
        except Exception:
            logger.exception('Assistant failure via legacy endpoint')
            return {
                'answer': "**English 🇬🇧**\n\nSorry, I'm having trouble retrieving that information "
                          "right now. Please try again shortly.\n\n**አማርኛ 🇪ት**\n\n"
                          "ይቅርታ፣ ያንን መረጃ አሁን ማግኘት አልቻልኩም። "
                          "እባክዎ እንደገና በትንሹ ቆይተው ይሞክሩ።",
                'recommendations': [],
                'sources': [],
            }

        return {
            'answer': result['answer'],
            'answer_en': result['answer_en'],
            'answer_am': result['answer_am'],
            'intent': result['intent'],
            'recommendations': result['items'],
            'reservations': result['reservations'],
            'orders': result.get('orders', []),
            'action': result['action'],
            'sources': result['sources'],
        }