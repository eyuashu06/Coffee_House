"""
Order lifecycle rules (SRS 5.2).

The status list alone does not say which move is legal. Without that, a staff typo can
push a completed order back to "Preparing" and the kitchen starts cooking work nobody is
going to collect. The transition table below is the single place that answers it, so the
API, the assistant and the manager panel cannot disagree.
"""

#: Statuses that close an order. Once closed nothing reopens it.
CLOSED_STATUSES = frozenset({'COMPLETED', 'CANCELLED', 'REJECTED'})

#: Statuses that mean the money is already in and the kitchen can start.
PAID_STATUSES = frozenset({
    'PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED',
})

#: The only moves the API accepts, keyed by the current status.
ALLOWED_TRANSITIONS = {
    'PENDING_PAYMENT': {'PLACED', 'CANCELLED', 'REJECTED'},
    'PLACED': {'ACCEPTED', 'CANCELLED', 'REJECTED'},
    'ACCEPTED': {'PREPARING', 'CANCELLED', 'REJECTED'},
    'PREPARING': {'READY', 'CANCELLED', 'REJECTED'},
    'READY': {'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'},
    'OUT_FOR_DELIVERY': {'COMPLETED', 'CANCELLED'},
    'COMPLETED': set(),
    'CANCELLED': set(),
    'REJECTED': set(),
}

#: Which statuses still count as "work in progress" for the manager dashboard.
ACTIVE_STATUSES = frozenset({
    'PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY',
})


class InvalidTransition(Exception):
    """Raised when a requested status change is not a legal move."""

    def __init__(self, current, target):
        self.current = current
        self.target = target
        super().__init__(str(self))

    def __str__(self):
        if self.current in CLOSED_STATUSES:
            return (
                f'Order is already closed ({self.current}). '
                'A finished order cannot change status.'
            )
        allowed = ', '.join(sorted(ALLOWED_TRANSITIONS.get(self.current, set()))) or 'nothing'
        return f'Cannot move an order from {self.current} to {self.target}. Allowed: {allowed}.'


def can_transition(current, target):
    """True when `current` → `target` is a legal move."""
    return target in ALLOWED_TRANSITIONS.get(current, set())


def assert_transition(current, target):
    """Raise `InvalidTransition` unless `current` → `target` is legal."""
    if not can_transition(current, target):
        raise InvalidTransition(current, target)