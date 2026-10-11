"""
Rate limiting for the endpoints worth limiting (SRS §12).

Nothing in REST_FRAMEWORK had a throttle configured, so login, registration,
password reset, order creation and payment initialisation were all unlimited. The
account endpoints in particular are a password-guessing oracle: the login view
answers identically whether the address is unknown or the password is wrong, which is
exactly what you want to be able to rate limit.

Deliberately *scoped* rather than global. A blanket per-IP limit looks tidy until it
is applied to a tablet in the kitchen, where the dashboard polls orders, analytics and
reservations every five seconds from one address all day - that client would be
throttled off the live board. So each view opts in with `throttle_scope`, and only
the endpoints that are worth attacking carry one.

Rates live in settings.DEFAULT_THROTTLE_RATES so they can be tuned per deployment.
"""

import sys

from rest_framework.throttling import ScopedRateThrottle


def running_tests(argv=None):
    """
    True when this process is Django's test runner.

    Read as a function of the argument list rather than frozen into a constant at
    import time, so it can be exercised without starting a real test run.
    """
    return 'test' in (sys.argv if argv is None else argv)


def throttling_active():
    return not running_tests()


class ScopedThrottle(ScopedRateThrottle):
    """
    ScopedRateThrottle that stands down under the test runner.

    DRF throttles keep their counters in the cache for the life of the process, and
    the whole suite shares one address (127.0.0.1): a real per-IP limit would be
    tripped by the tests themselves, intermittently, which is worse than no limit
    because it looks like a genuine failure. The throttle tests turn it back on, so
    the behaviour is still covered - it just does not fight the rest of the suite for
    the same cache keys.
    """

    def allow_request(self, request, view):
        if not throttling_active():
            return True
        return super().allow_request(request, view)