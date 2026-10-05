/**
 * Single entry point for talking to the Django API.
 *
 * Auth rides entirely on httpOnly cookies -- the backend never returns a token in
 * the response body -- so the only thing this helper has to do is keep the
 * `access_token` cookie alive. Access tokens are short-lived (60 min by default);
 * without an automatic refresh every protected endpoint starts answering 401 the
 * moment the cookie expires, even though the longer-lived `refresh_token` cookie
 * is still perfectly valid.
 *
 * On a 401 we therefore try POST /api/v1/auth/refresh/ exactly once, and replay
 * the original request if it succeeds. Concurrent callers share a single in-flight
 * refresh so a dashboard that fires four requests at once does not stampede it.
 */

type ApiFetchInit = RequestInit & {
  /** Skip the refresh-and-retry attempt (used by the refresh call itself). */
  skipRefresh?: boolean;
};

/** Fired when a refresh failed, i.e. the session is genuinely gone. */
const SESSION_GONE_EVENT = 'auth:session-gone';

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  // Collapse parallel refreshes into one network call; every awaiting caller
  // then shares the result and can replay its own request.
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch('/api/v1/auth/refresh/', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        return res.ok;
      } catch {
        return false;
      } finally {
        // Cleared on the next tick so callers awaiting this promise still see it.
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      }
    })();
  }
  return refreshInFlight;
}

export function onSessionGone(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(SESSION_GONE_EVENT, handler);
  return () => window.removeEventListener(SESSION_GONE_EVENT, handler);
}

export async function apiFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const { skipRefresh, ...rest } = init;

  const res = await fetch(path, { credentials: 'include', ...rest });

  if (res.status !== 401 || skipRefresh) return res;

  const refreshed = await refreshAccessToken();
  if (!refreshed) {
    // The refresh token is gone or expired too -- nothing left to recover.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SESSION_GONE_EVENT));
    }
    return res;
  }

  // Replay once. The refreshed access cookie is already in the jar, so this is
  // a plain retry with no header plumbing.
  return fetch(path, { credentials: 'include', ...rest });
}

/** Convenience wrapper for JSON GETs that returns null instead of throwing. */
export async function apiGetJson<T>(path: string): Promise<T | null> {
  const res = await apiFetch(path);
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}