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

/**
 * Fetch a set of routes from the backend.
 *
 * Never throws. Returns { ok: false, reason } on any failure so the caller can
 * decide whether to fall back to local routing rather than crashing the map.
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
      console.warn(`[ServerRoute] HTTP ${res.status} — will fall back to local routing`);
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
    if (err?.name !== 'AbortError') {
      console.warn('[ServerRoute] Request failed, falling back to local routing:', err?.message);
    }
    return { ok: false, reason: err?.name === 'AbortError' ? 'aborted' : 'network-error' };
  }
}
