"""
Close out orders nobody paid for.

Run it on a schedule (every five minutes is plenty) alongside reconcile_payments:

    python manage.py expire_unpaid_orders
    python manage.py expire_unpaid_orders --older-than-minutes 5   # tighter window
    python manage.py expire_unpaid_orders --dry-run                # report only

Orders whose payment is still in flight are checked with the gateway first, so a
customer who pays at the last moment is never closed out on top of their money.
"""

from django.core.management.base import BaseCommand

from apps.orders.expiry import expire_unpaid_orders, payment_window


class Command(BaseCommand):
    help = 'Mark overdue unpaid orders as EXPIRED so they stop cluttering the queue.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--older-than-minutes', type=int, default=None,
            help='Override the configured payment window for this run.',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Count what would expire without changing anything.',
        )

    def handle(self, *args, **options):
        window = options['older_than_minutes']
        if window is None:
            window = payment_window()
            self.stdout.write(f'Expiring unpaid orders older than {window} minutes.')

        if options['dry_run']:
            from django.utils import timezone
            from datetime import timedelta

            from apps.orders.models import Order

            cutoff = timezone.now() - timedelta(minutes=window)
            due = Order.objects.filter(status='PENDING_PAYMENT', created_at__lte=cutoff).count()
            self.stdout.write(f'{due} order(s) are past the window. Nothing was changed (--dry-run).')
            return

        count = expire_unpaid_orders(older_than_minutes=options['older_than_minutes'])
        if count:
            self.stdout.write(self.style.WARNING(f'Expired {count} unpaid order(s).'))
        else:
            self.stdout.write(self.style.SUCCESS('No unpaid orders to expire.'))