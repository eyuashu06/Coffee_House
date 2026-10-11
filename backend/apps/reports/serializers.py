"""
Response shapes for the report endpoints.

DRF-spectacular cannot infer anything from the plain dicts these views return, so
without these the whole reports section would be missing from the published OpenAPI
schema - the one place a new integrator looks to find out what exists.
"""

from rest_framework import serializers


class RevenueReportSerializer(serializers.Serializer):
    """Everything the Reports tab renders."""

    generated_at = serializers.CharField()
    range_days = serializers.IntegerField()
    order_type = serializers.CharField()

    summary = serializers.DictField()
    top_items = serializers.DictField()
    peak_hours = serializers.DictField()
    order_types = serializers.ListField(child=serializers.DictField())
    unpaid = serializers.DictField()


class OrdersCsvExportSerializer(serializers.Serializer):
    """A CSV attachment. Documented so the endpoint appears in the schema."""

    content_type = serializers.CharField(default='text/csv')


class ReportQuerySerializer(serializers.Serializer):
    """The two query parameters every report accepts."""

    range = serializers.ChoiceField(choices=['7d', '30d', '90d'], default='30d', required=False)
    order_type = serializers.ChoiceField(
        choices=['DELIVERY', 'PICKUP', 'DINE_IN'], required=False, allow_blank=True,
    )