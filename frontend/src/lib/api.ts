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
  /** Override the default request timeout, in milliseconds. */
  timeoutMs?: number;
};

/**
 * A request that never answers holds a dashboard spinner hostage forever, and on
 * a sleeping host that is the normal case rather than a failure. Abort instead so
 * the caller can show "try again" and polling can back off.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/** GETs already in flight, so overlapping polls share one request. */
const inFlightGets = new Map<string, Promise<Response>>();

function requestKey(path: string, init: RequestInit): string | null {
  const method = (init.method || 'GET').toUpperCase();
  if (method !== 'GET' || init.body) return null;
  return `${method} ${path}`;
}

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

async function sendWithTimeout(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  // Respect a caller-supplied signal (e.g. the assistant's own short timeout).
  if (init.signal) return fetch(path, { credentials: 'include', ...init });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(path, { credentials: 'include', ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const { skipRefresh, timeoutMs, ...rest } = init;

  const key = requestKey(path, rest);
  if (key) {
    const pending = inFlightGets.get(key);
    if (pending) return (await pending).clone();
    const promise = sendWithTimeout(path, rest, timeoutMs ?? DEFAULT_TIMEOUT_MS);
    inFlightGets.set(key, promise);
    try {
      return (await promise).clone();
    } finally {
      inFlightGets.delete(key);
    }
  }

  const res = await sendWithTimeout(path, rest, timeoutMs ?? DEFAULT_TIMEOUT_MS);

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
  return sendWithTimeout(path, rest, timeoutMs ?? DEFAULT_TIMEOUT_MS);
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