"""
Reporting (SRS FR-D9).

The rule every one of these protects is the same one: money counts only when the
customer actually paid and the kitchen actually got the order. Everything else - the
gap-filling, the timezone, the snapshot names, the CSV agreeing with the screen -
exists because a report that quietly includes the wrong orders is worse than no
report at all.
"""

import csv
import io
from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.menu.models import Category, MenuItem
from apps.orders.models import DeliveryZone, Order, OrderItem
from apps.reports.reporting import (
    RANGE_CHOICES,
    csv_rows,
    order_type_split,
    peak_hours,
    range_start,
    resolve_range,
    revenue_report,
    sales_summary,
    top_items,
)

User = get_user_model()


def make_item(name, price='100.00'):
    category, _ = Category.objects.get_or_create(name='Coffee', slug='coffee')
    return MenuItem.objects.create(
        name=name, slug=name.lower().replace(' ', '-'),
        description='Report fixture', category=category, base_price_etb=Decimal(price),
    )


class ReportFixture(TestCase):
    """Shared builders: an order, and one dated a given number of days ago."""

    def setUp(self):
        self.manager = User.objects.create_user(
            username='reporter', email='reporter@coffeereceipts.com',
            password='Password123!', role='MANAGER',
        )
        self.customer = User.objects.create_user(
            username='reportbuyer', email='buyer@coffeereceipts.com',
            password='Password123!', role='CUSTOMER',
        )
        self.zone = DeliveryZone.objects.create(name='Bole', delivery_fee_etb=Decimal('50.00'))
        self.item = make_item('Test Pour Over')

    @staticmethod
    def _cafe_local(days_ago, hour):
        """
        A cafe-local moment `days_ago` days back, at `hour` o'clock.

        Written in local time deliberately: truncating a UTC instant would put every
        fixture three hours off, which is exactly the mistake the reporting code is
        guarded against and the tests must not reproduce.
        """
        day = timezone.localtime().date() - timedelta(days=days_ago)
        return timezone.make_aware(
            datetime.combine(day, datetime.min.time()).replace(hour=hour),
            timezone.get_current_timezone(),
        )

    def _order(self, number, total, status='COMPLETED', days_ago=0, hour=9,
               order_type='DELIVERY'):
        placed = self._cafe_local(days_ago, hour)
        order = Order.objects.create(
            order_number=number, customer=self.customer, order_type=order_type,
            delivery_zone=self.zone if order_type == 'DELIVERY' else None,
            contact_name='Selam Bekele', contact_phone='+251911555000',
            subtotal_etb=Decimal(total) - (Decimal('50.00') if order_type == 'DELIVERY' else Decimal('0.00')),
            delivery_fee_etb=Decimal('50.00') if order_type == 'DELIVERY' else Decimal('0.00'),
            total_amount_etb=Decimal(total), status=status,
        )
        OrderItem.objects.create(
            order=order, item_name='Test Pour Over', unit_price_etb=Decimal('100.00'),
            quantity=1, subtotal_etb=order.subtotal_etb,
        )
        Order.objects.filter(pk=order.pk).update(created_at=placed)
        order.refresh_from_db()
        return order


class SalesSummaryTests(ReportFixture):
    def test_revenue_counts_paid_orders_only(self):
        self._order('ORD-R-1', '300.00', status='COMPLETED')
        self._order('ORD-R-2', '250.00', status='PREPARING')
        self._order('ORD-R-3', '900.00', status='CANCELLED')
        self._order('ORD-R-4', '800.00', status='REJECTED')
        self._order('ORD-R-5', '700.00', status='EXPIRED')
        self._order('ORD-R-6', '600.00', status='PENDING_PAYMENT')

        summary = sales_summary(30)

        self.assertEqual(summary['revenue'], 550.0)
        self.assertEqual(summary['orders'], 2)

    def test_orders_outside_the_range_are_not_counted(self):
        self._order('ORD-R-NEW', '300.00', days_ago=1)
        self._order('ORD-R-OLD', '999.00', days_ago=45)

        self.assertEqual(sales_summary(30)['revenue'], 300.0)
        self.assertEqual(sales_summary(90)['revenue'], 1299.0)

    def test_average_order_value(self):
        self._order('ORD-R-A', '300.00')
        self._order('ORD-R-B', '500.00')

        self.assertEqual(sales_summary(30)['average_order_value'], 400.0)

    def test_average_is_zero_rather_than_a_division_error(self):
        """An empty month is a real answer, not a crash on the dashboard."""
        summary = sales_summary(30)
        self.assertEqual(summary['revenue'], 0)
        self.assertEqual(summary['average_order_value'], 0.0)

    def test_the_daily_series_has_one_entry_per_day_with_gaps_filled(self):
        """A day with no orders is absent from a grouped query, and must still appear."""
        self._order('ORD-R-TODAY', '300.00', days_ago=0)
        self._order('ORD-R-YESTERDAY', '200.00', days_ago=1)

        series = sales_summary(7)['daily']

        self.assertEqual(len(series), 7)
        self.assertEqual([day['day'] for day in series][-1],
                         timezone.localtime().date().isoformat())
        zeros = [day for day in series if day['orders'] == 0]
        self.assertEqual(len(zeros), 5)

    def test_the_range_starts_at_midnight_not_24_hours_ago(self):
        """'Last 7 days' has to mean seven calendar days, not 168 hours from now."""
        start = range_start(7)
        self.assertEqual(start.hour, 0)
        self.assertEqual(start.minute, 0)
        self.assertEqual(start.date(), timezone.localtime().date() - timedelta(days=6))

    def test_an_unknown_range_falls_back_instead_of_erroring(self):
        self.assertEqual(resolve_range('nonsense'), RANGE_CHOICES['30d'])
        self.assertEqual(resolve_range(None), RANGE_CHOICES['30d'])
        self.assertEqual(resolve_range('7D'), RANGE_CHOICES['7d'])

    def test_order_type_filter_narrows_the_total(self):
        self._order('ORD-R-DEL', '300.00', order_type='DELIVERY')
        self._order('ORD-R-PICK', '200.00', order_type='PICKUP')

        self.assertEqual(sales_summary(30, order_type='PICKUP')['revenue'], 200.0)


class TopItemsTests(ReportFixture):
    def test_items_are_ranked_by_revenue(self):
        cheap = make_item('Cheap Toast', '10.00')
        self._order('ORD-R-T1', '100.00')
        order = self._order('ORD-R-T2', '100.00')
        OrderItem.objects.filter(order=order).delete()
        for _ in range(3):
            OrderItem.objects.create(
                order=order, item_name=cheap.name, unit_price_etb=Decimal('10.00'),
                quantity=1, subtotal_etb=Decimal('10.00'),
            )

        rows = top_items(30)

        self.assertEqual([row['item_name'] for row in rows],
                         ['Test Pour Over', 'Cheap Toast'])
        self.assertEqual(rows[1]['quantity'], 3)

    def test_a_deleted_menu_item_keeps_its_sales_history(self):
        """
        The report keys on the snapshot name, not the menu row.

        An item deleted from the menu keeps `menu_item=NULL` on its order lines. A
        report joined through the menu row would silently understate any month that
        included it.
        """
        order = self._order('ORD-R-T3', '100.00')
        OrderItem.objects.filter(order=order).update(menu_item=None)

        rows = top_items(30)
        self.assertEqual([row['item_name'] for row in rows], ['Test Pour Over'])

    def test_cancelled_orders_are_not_best_sellers(self):
        self._order('ORD-R-T4', '100.00', status='COMPLETED')
        self._order('ORD-R-T5', '100.00', status='CANCELLED')

        rows = top_items(30)
        self.assertEqual([row['item_name'] for row in rows], ['Test Pour Over'])


class PeakHoursTests(ReportFixture):
    def test_every_hour_of_the_day_is_reported(self):
        self._order('ORD-R-H1', '100.00', hour=8)
        self._order('ORD-R-H2', '100.00', hour=8)
        self._order('ORD-R-H3', '100.00', hour=17)

        hours = peak_hours(30)

        self.assertEqual(len(hours['hours']), 24)
        self.assertEqual(hours['hours'][8]['orders'], 2)
        self.assertEqual(hours['hours'][17]['orders'], 1)
        self.assertEqual(hours['hours'][3]['orders'], 0)

    def test_the_busiest_hour_is_reported(self):
        for index, hour in enumerate([9, 9, 9, 14]):
            self._order(f'ORD-R-P{index}', '100.00', hour=hour)

        self.assertEqual(peak_hours(30)['busiest_hour'], 9)

    def test_no_orders_means_no_busiest_hour(self):
        """'Peak 00:00' would be a confident lie on an empty cafe."""
        self.assertIsNone(peak_hours(30)['busiest_hour'])


class OrderTypeSplitTests(ReportFixture):
    def test_every_order_type_is_listed_even_at_zero(self):
        self._order('ORD-R-S1', '300.00', order_type='DELIVERY')
        self._order('ORD-R-S2', '200.00', order_type='PICKUP')

        split = order_type_split(30)

        self.assertEqual([row['order_type'] for row in split],
                         ['DELIVERY', 'PICKUP', 'DINE_IN'])
        self.assertEqual(split[0]['orders'], 1)
        self.assertEqual(split[2]['orders'], 0)
        self.assertAlmostEqual(split[0]['share'], 0.5)
        self.assertEqual(split[2]['share'], 0.0)


class CsvExportTests(ReportFixture):
    def test_the_export_matches_the_report_total(self):
        """An exported file that disagrees with the screen is worse than none."""
        self._order('ORD-R-C1', '300.00')
        self._order('ORD-R-C2', '250.00')
        self._order('ORD-R-C3', '900.00', status='CANCELLED')

        summary = sales_summary(30)
        rows = csv_rows(30)

        self.assertEqual(len(rows), 2)
        self.assertEqual(sum(Decimal(row['total_etb']) for row in rows),
                         Decimal(str(summary['revenue'])))

    def test_money_is_written_as_a_decimal_string(self):
        """A float here would hand a spreadsheet a rounding error."""
        self._order('ORD-R-C4', '300.00')
        row = csv_rows(30)[0]
        self.assertEqual(row['total_etb'], '300.00')
        self.assertEqual(row['delivery_fee_etb'], '50.00')

    def test_each_order_appears_once_however_many_times_it_was_paid(self):
        order = self._order('ORD-R-C5', '300.00')
        from apps.payments.models import Payment

        for index in range(3):
            Payment.objects.create(order=order, tx_ref=f'TX-C{index}',
                                   amount_etb=Decimal('300.00'), status='SUCCESS')
        self.assertEqual(len(csv_rows(30)), 1)


class ReportsApiTests(ReportFixture):
    def setUp(self):
        super().setUp()
        self.client = APIClient()

    def test_a_manager_gets_the_report(self):
        self.client.force_authenticate(self.manager)
        self._order('ORD-R-API', '300.00')

        res = self.client.get('/api/v1/reports/')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['summary']['revenue'], 300.0)
        self.assertIn('daily', res.data['summary'])
        self.assertIn('top_items', res.data)
        self.assertIn('peak_hours', res.data)
        self.assertIn('order_types', res.data)
        self.assertIn('unpaid', res.data)

    def test_a_customer_cannot_read_the_cakes(self):
        self.client.force_authenticate(self.customer)
        res = self.client.get('/api/v1/reports/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_is_401_not_403(self):
        """The frontend retries a token refresh on 401 and gives up on 403."""
        self.client.force_authenticate(user=None)
        res = self.client.get('/api/v1/reports/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_an_unknown_range_is_rejected_rather_than_guessed(self):
        self.client.force_authenticate(self.manager)
        res = self.client.get('/api/v1/reports/?range=last-forever')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_valid_range_is_honoured(self):
        self.client.force_authenticate(self.manager)
        self._order('ORD-R-API-OLD', '999.00', days_ago=40)

        res = self.client.get('/api/v1/reports/?range=7d')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['range_days'], 7)
        self.assertEqual(res.data['summary']['revenue'], 0.0)

    def test_the_export_is_a_csv_attachment(self):
        self.client.force_authenticate(self.manager)
        self._order('ORD-R-API2', '300.00')

        res = self.client.get('/api/v1/reports/export.csv')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'text/csv')
        self.assertIn('attachment;', res['Content-Disposition'])
        self.assertIn('buna-hub-orders', res['Content-Disposition'])

        table = list(csv.DictReader(io.StringIO(res.content.decode())))
        self.assertEqual(table[0]['order_number'], 'ORD-R-API2')
        self.assertEqual(table[0]['zone'], 'Bole')
        self.assertEqual(table[0]['paid'], 'yes')

    def test_a_customer_cannot_export_everyones_orders(self):
        self.client.force_authenticate(self.customer)
        self.assertEqual(
            self.client.get('/api/v1/reports/export.csv').status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_the_export_cannot_be_hijacked_by_an_order_type(self):
        self.client.force_authenticate(self.manager)
        res = self.client.get('/api/v1/reports/export.csv?order_type=DELIVERYSIDEWAYS')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_lost_orders_are_reported_separately(self):
        self.client.force_authenticate(self.manager)
        self._order('ORD-R-L1', '100.00', status='CANCELLED')
        self._order('ORD-R-L2', '100.00', status='REJECTED')
        self._order('ORD-R-L3', '100.00', status='EXPIRED')
        self._order('ORD-R-L4', '100.00', status='COMPLETED')

        res = self.client.get('/api/v1/reports/lost/')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['lost'], {'cancelled': 1, 'rejected': 1, 'expired': 1})


class RevenueReportShapeTests(ReportFixture):
    def test_unpaid_orders_are_reported_as_still_waiting(self):
        self._order('ORD-R-U1', '300.00', status='PENDING_PAYMENT')

        report = revenue_report(30)

        self.assertEqual(report['unpaid']['awaiting_payment'], 1)
        self.assertEqual(report['unpaid']['awaiting_payment_value'], 300.0)

    def test_expired_orders_are_not_counted_as_still_waiting(self):
        """
        They have already been given up on, and leaving them in the waiting count
        would tell the manager work is pending that nothing will ever clear.
        """
        self._order('ORD-R-U2', '300.00', status='EXPIRED', days_ago=2)

        report = revenue_report(30)

        self.assertEqual(report['unpaid']['awaiting_payment'], 0)
        self.assertEqual(report['unpaid']['expired_last_30_days'], 1)

    def test_the_payload_states_the_range_it_covered(self):
        report = revenue_report(90)
        self.assertEqual(report['range_days'], 90)
        self.assertEqual(report['order_type'], 'ALL')
        self.assertTrue(report['generated_at'])

    def test_range_override_works(self):
        report = revenue_report(7, now=self._cafe_local(0, 15))
        self.assertEqual(report['range_days'], 7)
        self.assertEqual(report['order_type'], 'ALL')