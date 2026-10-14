// frontend/src/services/serverRoutingService.js
//
// Client for POST /api/routing/route.
//
// Off-campus trips are computed on the backend: the 2km client slice was too
// small for anything longer than a local walk, and the full regional graph is
// far too big to ship to a browser. This posts the two coordinates and receives
// the four route profiles in the same shape getAllRoutes() produces locally, so
// every downstream consumer (progress, voice, profile switcher) is unaware of
// where the route was computed.

import { API_URL } from '../config';

// Failures worth re-asking for: a Render instance that is cold/waking answers
// with a proxy-level 502 (which carries no CORS header, so the browser surfaces
// it as a CORS error) or refuses the connection outright ("Failed to fetch")
// while it boots. A genuine no-route / 400 is deterministic and would just fail
// again, so those are not retried.
const RETRYABLE_REASONS = new Set(['network-error', 'http-502', 'http-503', 'http-504']);

// Up to two extra attempts. Started short so a transient blip recovers quickly,
// then wide enough to ride out a cold start without the user waiting noticeably;
// the caller's local fallback still runs the moment we give up.
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1500, 3500];

/**
 * Sleep, but wake early (and resolve) if the request is aborted, so a retry
 * backoff never outlives the caller's signal.
 */
function delay(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(id); resolve(); }, { once: true });
  });
}

/** A single request attempt. Never throws; failures come back as { ok:false, reason }. */
async function attemptServerRoutes({ from, to, vehicleMode, decisions, weatherMultipliers, signal }) {
  try {
    const res = await fetch(`${API_URL}/api/routing/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, vehicleMode, decisions, weatherMultipliers }),
      // A long inter-city route loads a large corridor graph and then runs four
      // A* passes, so this budget is deliberately larger than the slice's 15s.
      // Raised from 30s after a Legon->Tema route was measured at ~30s server-side
      // (the geom payload has since been dropped, so this is headroom, not a target).
      signal: signal ?? AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      // Reason is carried as `http-<status>`; 5xx here is what the retry loop keys on.
      return { ok: false, reason: `http-${res.status}` };
    }

    const payload = await res.json();
    if (!payload?.ok) {
      return { ok: false, reason: payload?.reason ?? 'no-route', snap: payload?.snap };
    }

    const routes = payload.routes;
    const anyRoute = routes && (routes.standard || routes.fastest || routes.accessible || routes.night);
    if (!anyRoute) return { ok: false, reason: 'empty-routes', snap: payload.snap };

    return {
      ok: true,
      routes,
      snap: payload.snap,
      source: payload.source,
      stats: payload.stats,
    };
  } catch (err) {
    // AbortError is either the caller cancelling or our own 60s timeout. Neither
    // is retryable: re-asking after a timeout would just spend another 60s.
    return { ok: false, reason: err?.name === 'AbortError' ? 'aborted' : 'network-error' };
  }
}

/**
 * Fetch a set of routes from the backend.
 *
 * Never throws. Returns { ok: false, reason } on any failure so the caller can
 * decide whether to fall back to local routing rather than crashing the map.
 * Transient infrastructure failures (a cold proxy 502, a refused connection) are
 * retried a couple of times before that fallback runs.
 *
 * @param {object} opts
 * @param {{lat: number, lng: number}} opts.from
 * @param {{lat: number, lng: number}} opts.to
 * @param {string} [opts.vehicleMode]
 * @param {Array}  [opts.decisions]
 * @param {object} [opts.weatherMultipliers]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ok: boolean, routes?: object, reason?: string,
 *                    snap?: object, source?: string, stats?: object}>}
 */
export async function fetchServerRoutes({
  from,
  to,
  vehicleMode = 'walk',
  decisions = [],
  weatherMultipliers = undefined,
  signal,
}) {
  if (!from || !to) return { ok: false, reason: 'missing-endpoints' };
  if (!Number.isFinite(from.lat) || !Number.isFinite(from.lng)) {
    return { ok: false, reason: 'invalid-from' };
  }
  if (!Number.isFinite(to.lat) || !Number.isFinite(to.lng)) {
    return { ok: false, reason: 'invalid-to' };
  }

  let result;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) return { ok: false, reason: 'aborted' };

    result = await attemptServerRoutes({ from, to, vehicleMode, decisions, weatherMultipliers, signal });
    if (result.ok) return result;

    const retryable = RETRYABLE_REASONS.has(result.reason) && attempt < MAX_ATTEMPTS;
    if (!retryable) break;

    console.warn(`[ServerRoute] ${result.reason} (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying`);
    await delay(RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1], signal);
  }

  if (result.reason !== 'aborted') {
    console.warn('[ServerRoute] Request failed, falling back to local routing:', result.reason);
  }
  return result;
}
