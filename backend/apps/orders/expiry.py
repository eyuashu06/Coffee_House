"""
Close out orders nobody ever paid for (SRS FR-P7).

An order sat in PENDING_PAYMENT forever. A customer who abandoned the Chapa tab was
never told, the manager's "awaiting payment" tile grew without bound, and the order
list mixed unpaid baskets in with real work. Nothing ever expired them: the status
list had no terminal unpaid state, so there was nowhere for such an order to go.

This module owns that decision in one place, so the scheduled command and any
caller that needs the same answer cannot disagree about when an order is dead.

The window (settings.ORDER_PAYMENT_WINDOW_MINUTES, 30 by default) is measured from
when the order was created, not from the last payment attempt, because the order -
not the attempt - is what the kitchen needs to start on.
"""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import Order, OrderStatusHistory

#: Set on the order so a customer reading it later knows why it closed.
EXPIRY_REASON = 'Payment was not received before the order expired.'


def payment_window():
    """How long an unpaid order is honoured, in minutes."""
    return int(getattr(settings, 'ORDER_PAYMENT_WINDOW_MINUTES', 30))


def _unsettled_payments():
    """
    Import the payment reconciler lazily.

    apps.payments imports apps.orders at module level, so a top-level import here
    would be circular. The command that drives this always has the payments app
    loaded, so the failure mode to avoid is the *web* process importing it early -
    hence the deferral.
    """
    from apps.payments.views import reconcile_payment
    return reconcile_payment


def _settle_if_the_gateway_knows(order):
    """
    Ask the gateway about any payment still in flight for this order.

    Expiring an order on top of a payment that is about to succeed is the one way
    this could cost the cafe money: the customer pays, the webhook is late, and the
    order is already closed. So every order that still has an unsettled payment is
    reconciled first, and only orders that are genuinely still unpaid are expired.

    Returns True when the order no longer needs expiring (it was paid, or the
    gateway could not be reached and we leave it alone rather than guess).
    """
    pending = [payment for payment in order.payments.all() if payment.status == 'PENDING']
    if not pending:
        return order.status != 'PENDING_PAYMENT'

    reconcile_payment = _unsettled_payments()
    for payment in pending:
        # `unknown` means the gateway could not be reached. That is not evidence
        # that the customer did not pay, so the order stays open for the next run.
        if reconcile_payment(payment) == 'unknown':
            return True

    order.refresh_from_db()
    return order.status != 'PENDING_PAYMENT'


@transaction.atomic
def expire_unpaid_orders(older_than_minutes=None, now=None):
    """
    Move every overdue PENDING_PAYMENT order to EXPIRED.

    Safe to run repeatedly and on a schedule: an order that is already expired, paid
    or closed is left exactly as it is.

    Returns the number of orders expired.
    """
    now = now or timezone.now()
    window = payment_window() if older_than_minutes is None else int(older_than_minutes)
    cutoff = now - timedelta(minutes=window)

    candidates = (
        Order.objects.filter(status='PENDING_PAYMENT', created_at__lte=cutoff)
        .prefetch_related('payments')
        .order_by('created_at')
    )

    expired = 0
    for order in candidates:
        if _settle_if_the_gateway_knows(order):
            continue

        order.status = 'EXPIRED'
        order.rejection_reason = EXPIRY_REASON
        order.save(update_fields=['status', 'rejection_reason'])

        # The history entry is what tells the customer their order closed, and what
        # tells the manager this was not something the staff cancelled.
        OrderStatusHistory.objects.create(
            order=order,
            status='EXPIRED',
            changed_by=None,
            notes=EXPIRY_REASON,
        )
        expired += 1

    return expired