"""
Reservation handling for the assistant.

Availability is always decided by the database - the assistant never assumes a
table is free, and never confirms a booking that was not actually created.
"""

import logging
from datetime import datetime, timedelta

from django.conf import settings
from django.utils import timezone

from api.models import TableReservation

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = ['PENDING', 'CONFIRMED']

MAX_GUESTS = getattr(settings, 'ASSISTANT_RESERVATION_MAX_GUESTS', 10)
TOTAL_TABLES = getattr(settings, 'ASSISTANT_RESERVATION_TABLES', 4)
SLOT_MINUTES = getattr(settings, 'ASSISTANT_RESERVATION_SLOT_MINUTES', 90)


def parse_date_time(date_str, time_str):
    """Combine the collected date/time into a timezone-aware datetime, or None."""
    if not date_str or not time_str:
        return None
    try:
        naive = datetime.fromisoformat(f"{date_str}T{time_str}:00")
    except ValueError:
        return None
    try:
        return timezone.make_aware(naive)
    except Exception:
        return naive


def check_availability(date_str, time_str, guests):
    """
    Returns (is_available, detail).

    A slot is available when, for the requested party size, fewer than
    TOTAL_TABLES bookings overlap the requested window and the party fits
    within MAX_GUESTS.
    """
    when = parse_date_time(date_str, time_str)
    if when is None:
        return False, 'invalid_datetime'
    if guests and guests > MAX_GUESTS:
        return False, 'too_large'

    window_start = when - timedelta(minutes=SLOT_MINUTES)
    window_end = when + timedelta(minutes=SLOT_MINUTES)

    overlapping = TableReservation.objects.filter(
        status__in=ACTIVE_STATUSES,
        date_time__range=(window_start, window_end),
    ).count()

    if overlapping >= TOTAL_TABLES:
        return False, 'fully_booked'
    return True, 'available'


def suggest_alternative_times(date_str, time_str, guests, count=3):
    """Suggest nearby times that the database says are actually free."""
    when = parse_date_time(date_str, time_str)
    if when is None:
        return []
    suggestions = []
    for offset_minutes in (60, 120, 180, -60, -120):
        candidate = when + timedelta(minutes=offset_minutes)
        ok, _ = check_availability(candidate.date().isoformat(), candidate.strftime('%H:%M'), guests)
        if ok:
            suggestions.append(candidate.strftime('%H:%M'))
        if len(suggestions) >= count:
            break
    return suggestions


def create_reservation(name, phone, date_str, time_str, guests, user=None):
    """
    Create the reservation. Returns (reservation, None) on success or
    (None, error_code) - the caller must only confirm when a reservation exists.
    """
    if not all([name, date_str, time_str, guests]):
        return None, 'missing_fields'

    when = parse_date_time(date_str, time_str)
    if when is None:
        return None, 'invalid_datetime'
    if when < timezone.now():
        return None, 'past_date'
    if guests > MAX_GUESTS:
        return None, 'too_large'

    try:
        reservation = TableReservation.objects.create(
            user=user if (user and user.is_authenticated) else None,
            name=name,
            date_time=when,
            party_size=guests,
            contact_phone=phone or '',
            status='PENDING',
        )
        return reservation, None
    except Exception:
        logger.exception('Failed to create reservation')
        return None, 'create_failed'


def find_reservations(name=None, phone=None, user=None):
    qs = TableReservation.objects.all()
    if user is not None and getattr(user, 'is_authenticated', False):
        qs = qs.filter(user=user)
    if name:
        qs = qs.filter(name__icontains=name.strip())
    if phone:
        qs = qs.filter(contact_phone__icontains=phone.replace(' ', '')[-9:])
    return list(qs.order_by('-date_time')[:5])


def cancel_reservation(reservation):
    if reservation.status in ('CANCELLED', 'COMPLETED'):
        return False, 'not_cancellable'
    reservation.status = 'CANCELLED'
    reservation.save(update_fields=['status'])
    return True, None


def serialize(reservation):
    return {
        'id': reservation.id,
        'name': reservation.name,
        'date_time': reservation.date_time.isoformat(),
        # Split date/time as well: the UI confirms a booking in two fields and
        # callers should not have to re-parse the combined ISO string.
        'date': reservation.date_time.date().isoformat(),
        'time': reservation.date_time.strftime('%H:%M'),
        'party_size': reservation.party_size,
        'contact_phone': reservation.contact_phone,
        'status': reservation.status,
    }