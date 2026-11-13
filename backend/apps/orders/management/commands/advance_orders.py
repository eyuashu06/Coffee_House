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
from apps.orders.lifecycle import advance_active_orders


class Command(BaseCommand):
    help = 'Advance paid orders to the next lifecycle step when enough time has passed.'

    def handle(self, *args, **options):
        now = timezone.now()
        moved = advance_active_orders(now=now)
        self.stdout.write(self.style.SUCCESS(f'Advanced {moved} order(s).'))
