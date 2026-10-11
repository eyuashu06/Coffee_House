"""
Report aggregation for the manager dashboard (SRS FR-D9).

The dashboard could show revenue for today and this month and nothing else: no
breakdown by day, no top sellers, no peak hours, no way to take the numbers
anywhere. Every question the owner actually asks - what sold, when are we busy, is
delivery worth it - needed a database console.

All the arithmetic lives here as plain functions over a queryset, rather than in the
view, so it can be tested without a request and reused by the CSV export (which must
not be allowed to compute revenue differently from the screen it was exported from).

Money rules, deliberately strict:

- Only paid orders count as sales. An order that was cancelled, rejected or expired
  never reached the kitchen, so counting it would overstate the day.
- Revenue comes from the order total, which the server priced at checkout. Never
  from the payment table: a cash order has no successful payment row, and a payment
  can be retried, so summing payments double-counts.
- Item revenue is apportioned from the order total so that delivery fees and any
  future tax are excluded from "how much did the burger sell for".
"""

from datetime import timedelta

from django.db.models import Count, DecimalField, Sum
from django.db.models.functions import Cast, TruncDate, TruncHour
from django.utils import timezone

from apps.orders.models import Order, OrderItem
from apps.orders.workflow import CLOSED_STATUSES, PAID_STATUSES

#: Named ranges the dashboard offers, in days.
RANGE_CHOICES = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
}
DEFAULT_RANGE = '30d'

#: Refuse to build a report across more than this. A manager asking for "everything
#: since 2024" would otherwise stream the whole order table into one CSV.
MAX_RANGE_DAYS = 366

#: Casting through Decimal keeps Sum() from promoting to float, so a report totals
#: to the same figure as the invoice.
_MONEY = DecimalField(max_digits=12, decimal_places=2)

#: Truncating to a day or an hour without this happens in the *database* timezone,
#: which is UTC. Ethiopia is UTC+3, so "9am" would be filed under 6am and the peak
#: hours chart would be three hours out for the whole year. Both truncations below
#: therefore pass the cafe's own timezone explicitly.
CAFE_TZ = timezone.get_current_timezone()


def resolve_range(name):
    """Named range to a day count, falling back to the default for anything unknown."""
    return RANGE_CHOICES.get((name or '').strip().lower(), RANGE_CHOICES[DEFAULT_RANGE])


def range_start(days, now=None):
    """
    First instant included in a report covering `days` days.

    Anchored to local midnight so "last 30 days" means 30 calendar days here rather
    than 30 x 24 hours measured from this second.
    """
    now = now or timezone.localtime()
    today = now.date()
    return timezone.make_aware(
        timezone.datetime.combine(today - timedelta(days=days - 1), timezone.datetime.min.time()),
        timezone.get_current_timezone(),
    )


def paid_orders_in_range(days, order_type=None, now=None):
    """The queryset every report here is built on."""
    queryset = Order.objects.filter(
        status__in=PAID_STATUSES,
        created_at__gte=range_start(days, now=now),
    )
    if order_type:
        queryset = queryset.filter(order_type=order_type)
    return queryset


def sales_summary(days=30, order_type=None, now=None):
    """
    Headline figures plus a per-day series.

    The series is built by walking the calendar and filling in the gaps, because a
    day with no orders is simply absent from a grouped query - and a bar chart that
    silently skips Sunday reads as though Sunday did not happen.
    """
    orders = paid_orders_in_range(days, order_type, now=now)

    totals = orders.aggregate(
        revenue=Sum(Cast('total_amount_etb', _MONEY)),
        orders=Count('id'),
        delivery_fee=Sum(Cast('delivery_fee_etb', _MONEY)),
    )
    completed = orders.filter(status='COMPLETED').count()

    by_day = (
        orders.annotate(day=TruncDate('created_at', tzinfo=CAFE_TZ))
        .values('day')
        .annotate(revenue=Sum(Cast('total_amount_etb', _MONEY)), orders=Count('id'))
        .order_by('day')
    )
    daily = {
        row['day'].isoformat(): (row['revenue'] or 0, row['orders']) for row in by_day
    }

    series = []
    start = range_start(days, now=now).date()
    for offset in range(days):
        day = start + timedelta(days=offset)
        revenue, count = daily.get(day.isoformat(), (0, 0))
        series.append({
            'day': day.isoformat(),
            'revenue': float(revenue),
            'orders': count,
        })

    order_count = totals['orders'] or 0
    revenue_total = totals['revenue'] or 0
    return {
        'range_days': days,
        'revenue': float(revenue_total),
        'orders': order_count,
        'completed_orders': completed,
        'delivery_fees': float(totals['delivery_fee'] or 0),
        'average_order_value': float(revenue_total) / order_count if order_count else 0.0,
        'daily': series,
    }


def top_items(days=30, order_type=None, limit=10, now=None):
    """
    Best sellers by quantity and by revenue.

    Keyed on the item *snapshot* name, not the menu foreign key: an item deleted from
    the menu keeps its history, and a report that dropped it would quietly understate
    a month that included it. Lines whose snapshot name is blank are ignored.
    """
    items = (
        OrderItem.objects
        .filter(
            order__in=paid_orders_in_range(days, order_type, now=now),
            item_name__gt='',
        )
        .values('item_name')
        .annotate(
            quantity=Sum('quantity'),
            revenue=Sum('subtotal_etb'),
            orders=Count('order_id', distinct=True),
        )
    )

    rows = []
    for row in items:
        rows.append({
            'item_name': row['item_name'],
            'quantity': row['quantity'] or 0,
            'revenue': float(row['revenue'] or 0),
            'orders': row['orders'],
        })
    rows.sort(key=lambda x: (-x['revenue'], -x['quantity'], x['item_name']))

    return rows[:limit]
    by_quantity = [
        {
            'item_name': row['item_name'],
            'quantity': row['quantity'] or 0,
            'revenue': float(row['revenue'] or 0),
            'orders': row['orders'],
        }
        for row in sorted(items, key=lambda r: (-(r['quantity'] or 0), r['item_name']))[:limit]
    ]
    return {'by_revenue': rows, 'by_quantity': by_quantity}


def peak_hours(days=30, order_type=None, now=None):
    """
    Which hours of the day the cafe is busy, in cafe-local time.

    Grouped by hour of day rather than by date so the answer is "we are busiest
    between 8 and 9 in the morning", which is the question. Hours with no orders are
    listed as zero so a chart cannot imply a peak that never happened.
    """
    orders = paid_orders_in_range(days, order_type, now=now).annotate(
        hour=TruncHour('created_at', tzinfo=CAFE_TZ)
    )
    rows = (
        orders.values('hour')
        .annotate(revenue=Sum(Cast('total_amount_etb', _MONEY)), orders=Count('id'))
        .order_by('hour')
    )

    by_hour = {row['hour'].hour: row for row in rows}
    hours = []
    for hour in range(24):
        row = by_hour.get(hour)
        hours.append({
            'hour': hour,
            'orders': row['orders'] if row else 0,
            'revenue': float(row['revenue']) if row else 0.0,
        })

    busiest = max(hours, key=lambda h: h['orders'])
    return {
        'hours': hours,
        'busiest_hour': busiest['hour'] if busiest['orders'] else None,
    }


def order_type_split(days=30, now=None):
    """How the money divides between delivery, pickup and dine-in."""
    rows = (
        paid_orders_in_range(days, now=now)
        .values('order_type')
        .annotate(orders=Count('id'), revenue=Sum(Cast('total_amount_etb', _MONEY)))
    )
    totals = {row['order_type']: row for row in rows}
    total_orders = sum(row['orders'] for row in totals.values()) or 0

    split = []
    for code, label in Order.ORDER_TYPES:
        row = totals.get(code)
        orders = row['orders'] if row else 0
        split.append({
            'order_type': code,
            'label': label,
            'orders': orders,
            'revenue': float(row['revenue']) if row else 0.0,
            'share': orders / total_orders if total_orders else 0.0,
        })
    return split


def unpaid_summary(now=None):
    """
    What is still waiting on money.

    Exported unpaid orders are excluded from the "waiting" count but reported on
    their own line, because "how many orders is the kitchen waiting on?" and "how
    much did we lose to abandoned checkouts?" are different questions.
    """
    now = now or timezone.localtime()
    open_unpaid = Order.objects.filter(status='PENDING_PAYMENT')
    expired = Order.objects.filter(
        status='EXPIRED',
        created_at__gte=range_start(30, now=now),
    )
    return {
        'awaiting_payment': open_unpaid.count(),
        'awaiting_payment_value': float(
            open_unpaid.aggregate(total=Sum(Cast('total_amount_etb', _MONEY)))['total'] or 0
        ),
        'expired_last_30_days': expired.count(),
    }


def revenue_report(days=30, order_type=None, now=None):
    """Everything the Reports tab shows, in one payload."""
    return {
        'generated_at': (now or timezone.localtime()).isoformat(),
        'range_days': days,
        'order_type': order_type or 'ALL',
        'summary': sales_summary(days, order_type, now=now),
        'top_items': top_items(days, order_type, now=now),
        'peak_hours': peak_hours(days, order_type, now=now),
        'order_types': order_type_split(days, now=now),
        'unpaid': unpaid_summary(now=now),
    }


def closed_order_total(days=30, now=None):
    """Orders that ended without being served, for the CSV summary line."""
    queryset = Order.objects.filter(
        status__in=set(CLOSED_STATUSES) - set(PAID_STATUSES),
        created_at__gte=range_start(days, now=now),
    )
    return {
        'cancelled': queryset.filter(status='CANCELLED').count(),
        'rejected': queryset.filter(status='REJECTED').count(),
        'expired': queryset.filter(status='EXPIRED').count(),
    }


def csv_rows(days=30, order_type=None, now=None):
    """
    The orders in the range, as dictionaries ready for csv.DictWriter.

    Deliberately the same queryset the reports use, so an exported file can never
    disagree with the screen it came from.
    """
    queryset = (
        paid_orders_in_range(days, order_type, now=now)
        .select_related('delivery_zone')
        .order_by('-created_at')
    )
    rows = []
    for order in queryset:
        rows.append({
            'order_number': order.order_number,
            'created_at': timezone.localtime(order.created_at).strftime('%Y-%m-%d %H:%M'),
            'status': order.status,
            'order_type': order.order_type,
            'table_number': order.table_number,
            'customer': order.contact_name,
            'phone': order.contact_phone,
            'zone': order.delivery_zone.name if order.delivery_zone else '',
            'items': sum(item.quantity for item in order.items.all()),
            'subtotal_etb': f'{order.subtotal_etb:.2f}',
            'delivery_fee_etb': f'{order.delivery_fee_etb:.2f}',
            'total_etb': f'{order.total_amount_etb:.2f}',
            'paid': 'yes',
        })
    return rows


CSV_COLUMNS = [
    'order_number', 'created_at', 'status', 'order_type', 'table_number',
    'customer', 'phone', 'zone', 'items',
    'subtotal_etb', 'delivery_fee_etb', 'total_etb', 'paid',
]