"""
Settle payments that were left pending by a gateway or code failure.

Real card payments used to get stuck: the Chapa SDK's verify path raised a
TypeError that a broad `except` swallowed, so an order stayed PENDING_PAYMENT
while the customer had already paid. This asks the gateway directly for every
unsettled payment and applies the answer, so nobody is told to pay twice.

Safe to run repeatedly, and on a schedule:

    python manage.py reconcile_payments
    python manage.py reconcile_payments --order ORD-20261006-7031
    python manage.py reconcile_payments --older-than-minutes 1
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.payments.models import Payment
from apps.payments.views import reconcile_payment


class Command(BaseCommand):
    help = 'Re-check unsettled payments against the gateway and apply the result.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--older-than-minutes', type=int, default=2,
            help='Only reconcile payments created at least this many minutes ago. '
                 'The default leaves a payment in flight alone.')
        parser.add_argument('--order', help='Limit to a single order number.')
        parser.add_argument(
            '--all', action='store_true',
            help='Ignore the age cutoff and check every pending payment.')

    def handle(self, *args, **options):
        queryset = Payment.objects.select_related('order').filter(status='PENDING')
        if options['order']:
            queryset = queryset.filter(order__order_number=options['order'])
        if not options['all']:
            cutoff = timezone.now() - timedelta(minutes=options['older_than_minutes'])
            queryset = queryset.filter(created_at__lte=cutoff)

        if not queryset.exists():
            self.stdout.write('No unsettled payments to check.')
            return

        counts = {}
        for payment in queryset:
            outcome = reconcile_payment(payment)
            counts[outcome] = counts.get(outcome, 0) + 1
            label = {'unknown': 'gateway unreachable - still pending'}.get(outcome, outcome)
            self.stdout.write(f'{payment.tx_ref} ({payment.amount_etb} ETB) -> {label}')

        summary = ', '.join(f'{name}={count}' for name, count in sorted(counts.items()))
        self.stdout.write(self.style.SUCCESS(summary))