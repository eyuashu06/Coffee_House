"""
Automated order lifecycle progression.

Advances paid active orders through their steps based on elapsed time
and kitchen prep time (estimated_prep_minutes set by admin or venue default).

Lifecycle flow:
- PLACED -> ACCEPTED (after ~2 min acknowledging order)
- ACCEPTED -> PREPARING (after ~2 min moving to kitchen)
- PREPARING -> READY (after `order.estimated_prep_minutes` e.g. 20 min)
- READY -> OUT_FOR_DELIVERY (for delivery orders, after ~2 min courier dispatch)
- READY -> COMPLETED (for pickup/dine-in orders, after ~5 min served)
- OUT_FOR_DELIVERY -> COMPLETED (for delivery orders, after ~15 min transit)
"""

from django.utils import timezone
from apps.orders.models import Order, OrderStatusHistory
from apps.orders.workflow import assert_transition, can_transition


def get_next_step_and_duration(order):
    """
    Determine the next status and required duration (in whole minutes) for the order.
    Returns (next_status, required_minutes) or (None, None).
    """
    status = order.status
    prep_time = int(getattr(order, 'estimated_prep_minutes', 0) or 20)

    if status == 'PLACED':
        return 'ACCEPTED', 2
    elif status == 'ACCEPTED':
        return 'PREPARING', 2
    elif status == 'PREPARING':
        return 'READY', prep_time
    elif status == 'READY':
        if order.order_type == 'DELIVERY':
            return 'OUT_FOR_DELIVERY', 2
        else:
            return 'COMPLETED', 5
    elif status == 'OUT_FOR_DELIVERY':
        return 'COMPLETED', 15
    return None, None


def advance_order_if_due(order, now=None):
    """
    Advances an individual order to its next status if enough time has passed.
    Can advance through multiple steps if a larger amount of time has elapsed.
    Records OrderStatusHistory, which fires customer notifications automatically.
    Returns True if the order was advanced, False otherwise.
    """
    if order.status in ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'PENDING_PAYMENT']:
        return False

    if now is None:
        now = timezone.now()

    has_changed = False

    while True:
        next_status, required_minutes = get_next_step_and_duration(order)
        if not next_status or not can_transition(order.status, next_status):
            break

        started = order.step_started_at or order.placed_at or order.created_at
        if started is None:
            order.step_started_at = now
            order.save(update_fields=['step_started_at'])
            break

        if timezone.is_naive(started):
            started = timezone.make_aware(started, timezone.get_current_timezone())
        if timezone.is_naive(now):
            now = timezone.make_aware(now, timezone.get_current_timezone())

        elapsed = now - started
        if elapsed < timezone.timedelta(minutes=required_minutes):
            break

        # Move to next status
        prev_status = order.status
        order.status = next_status
        # The next step starts when the previous step elapsed
        started = started + timezone.timedelta(minutes=required_minutes)
        order.step_started_at = started
        order.save(update_fields=['status', 'step_started_at'])

        # Record history (this triggers post_save notification for the customer)
        OrderStatusHistory.objects.create(
            order=order,
            status=next_status,
            notes=f'Auto-advanced from {prev_status} to {next_status} (elapsed time reached)'
        )
        has_changed = True

    return has_changed


def advance_active_orders(queryset=None, now=None):
    """
    Advances all active orders in the database or queryset whose time has elapsed.
    """
    if queryset is None:
        queryset = Order.objects.filter(
            status__in=['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY']
        )
    else:
        queryset = queryset.filter(
            status__in=['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY']
        )

    advanced_count = 0
    for order in list(queryset):
        if advance_order_if_due(order, now=now):
            advanced_count += 1
    return advanced_count
