"""
Manager reporting endpoints (SRS FR-D9).

    GET reports/            sales, best sellers, peak hours, order-type split
    GET reports/export.csv  the same range of orders, as a file
    GET reports/lost        cancelled / rejected / expired orders in the range

The SRS lists these as separate sales / top-items / peak-hours endpoints; they are one
request instead because the dashboard needs all three at once and three round trips to
the same table is three chances to be halfway loaded. The payload keeps each block
separate, so anything wanting only peak hours can read `peak_hours` and ignore the
rest.

All three are manager-only and all three are built from the same helpers in
reporting.py, so the screen, the export and the loss figures can never disagree.
"""

import csv

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsManager

from .reporting import (
    CSV_COLUMNS,
    DEFAULT_RANGE,
    closed_order_total,
    csv_rows,
    resolve_range,
    revenue_report,
)
from .serializers import (
    OrdersCsvExportSerializer,
    ReportQuerySerializer,
    RevenueReportSerializer,
)


class ReportQueryMixin:
    """Shared parsing of ?range= and ?order_type=."""

    def report_params(self, request):
        """Validate the query string, answering 400 rather than guessing."""
        serializer = ReportQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        return {
            'days': resolve_range(data.get('range') or DEFAULT_RANGE),
            'order_type': data.get('order_type') or None,
        }

    def manager_only(self):
        """
        Distinguish "we don't know who you are" from "we know, and you may not see".

        Conflating them made an expired access cookie look like a permissions bug and
        stopped the frontend from attempting a token refresh: 401 is what the client
        retries on, 403 is terminal.
        """
        user = self.request.user
        if not user or not user.is_authenticated:
            return Response(
                {'detail': 'Authentication credentials were not provided.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not user.is_manager_or_admin():
            return Response(
                {'error': 'Manager permission required.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return None


class RevenueReportView(ReportQueryMixin, APIView):
    """Sales figures, best sellers, peak hours and the order-type split."""

    permission_classes = [IsManager]
    serializer_class = RevenueReportSerializer

    def get(self, request):
        denied = self.manager_only()
        if denied:
            return denied

        params = self.report_params(request)
        return Response(revenue_report(**params))


class LostOrdersView(ReportQueryMixin, APIView):
    """Orders that closed without being served: cancelled, rejected or expired."""

    permission_classes = [IsManager]
    serializer_class = RevenueReportSerializer

    def get(self, request):
        denied = self.manager_only()
        if denied:
            return denied

        params = self.report_params(request)
        return Response({
            'range_days': params['days'],
            'lost': closed_order_total(params['days']),
        })


class OrdersCsvExportView(ReportQueryMixin, APIView):
    """
    Download the orders in a range as CSV.

    Built from the same queryset as the report, so an exported total always equals
    the total on screen. Money is written as a plain decimal string, never as a
    float, so a spreadsheet cannot inherit a rounding error from Python.
    """

    permission_classes = [IsManager]
    serializer_class = OrdersCsvExportSerializer

    def get(self, request):
        denied = self.manager_only()
        if denied:
            return denied

        params = self.report_params(request)
        rows = csv_rows(**params)

        response = HttpResponse(content_type='text/csv')
        stamp = timezone.localtime().strftime('%Y%m%d-%H%M')
        response['Content-Disposition'] = (
            f'attachment; filename="buna-hub-orders-{params["days"]}d-{stamp}.csv"'
        )

        writer = csv.DictWriter(response, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
        return response