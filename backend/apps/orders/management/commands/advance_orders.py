"""Advance eligible orders through their lifecycle on a timer.

Run this every minute from cron / systemd / render cron:

    * * * * * cd /path/to/backend && ./venv/bin/python manage.py advance_orders

It is intentionally a normal management command, not Celery: the stack here has no
Redis, and the dashboard polls every few seconds, so a once-a-minute tick is plenty.
A manager can still override anything at any time through the existing transition API.

Only moves orders that are already paid (money in) and still open.  It never touches
PENDING_PAYMENT (that is the payment gateway's / expiry job's job) and it never
re-opens a closed order.
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.orders.models import Order
from apps.reports.reporting import ORDER_STEP_DURATIONS, advance_order


class Command(BaseCommand):
    help = 'Advance paid orders to the next lifecycle step when enough time has passed.'

    def handle(self, *args, **options):
        now = timezone.localtime()
        moved = 0
        for order in Order.objects.exclude(status__in=['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED']):
            changed, new_status = advance_order(order, now=now, durations=ORDER_STEP_DURATIONS)
            if not changed:
                continue
            from apps.orders.workflow import assert_transition
            assert_transition(order.status, new_status)
            order.status = new_status
            order.step_started_at = now
            order.save(update_fields=['status', 'step_started_at'])
            moved += 1
        self.stdout.write(self.style.SUCCESS(f'Advanced {moved} order(s).'))
