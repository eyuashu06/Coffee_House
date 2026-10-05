from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Default pagination that lets clients ask for a bigger page via ?page_size=."""

    page_size = 12
    page_size_query_param = 'page_size'
    max_page_size = 500