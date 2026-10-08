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

#: Read through functions rather than module constants: binding them at import time
#: froze the values, so a settings override (tests, per-venue config) was ignored.
DEFAULT_MAX_GUESTS = 10
DEFAULT_TOTAL_TABLES = 4
DEFAULT_SLOT_MINUTES = 90


def max_guests():
    return int(getattr(settings, 'ASSISTANT_RESERVATION_MAX_GUESTS', DEFAULT_MAX_GUESTS))


def total_tables():
    return int(getattr(settings, 'ASSISTANT_RESERVATION_TABLES', DEFAULT_TOTAL_TABLES))


def slot_minutes():
    return int(getattr(settings, 'ASSISTANT_RESERVATION_SLOT_MINUTES', DEFAULT_SLOT_MINUTES))


def parse_date_time(date_str, time_str):
    """Combine the collected date/time into a timezone-aware datetime, or None."""
    if not date_str or not time_str:
        return None
    return parse_iso_datetime(f"{date_str}T{time_str}:00")


def parse_iso_datetime(value):
    """
    Read an ISO-8601 datetime string into an aware datetime, or None.

    Handles what browsers and `datetime-local` inputs actually send: a bare
    `2026-10-11T18:30`, a `Z`/offset suffix, and fractional seconds. Values that
    already carry an offset are converted rather than re-labelled - calling
    make_aware() on an aware datetime raised and the booking was rejected as malformed.
    """
    if not value:
        return None
    if isinstance(value, datetime):
        return value if timezone.is_aware(value) else timezone.make_aware(value)

    raw = str(value).strip()
    if raw.endswith(('Z', 'z')):
        raw = raw[:-1] + '+00:00'
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        # `datetime-local` submits "YYYY-MM-DDTHH:MM", which fromisoformat accepts;
        # anything else (free text like "next tuesday") is genuinely unreadable.
        return None

    if timezone.is_aware(parsed):
        return parsed
    try:
        return timezone.make_aware(parsed)
    except Exception:
        return parsed


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
    if guests and guests > max_guests():
        return False, 'too_large'

    window_start = when - timedelta(minutes=slot_minutes())
    window_end = when + timedelta(minutes=slot_minutes())

    overlapping = TableReservation.objects.filter(
        status__in=ACTIVE_STATUSES,
        date_time__range=(window_start, window_end),
    ).count()

    if overlapping >= total_tables():
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
    if guests > max_guests():
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