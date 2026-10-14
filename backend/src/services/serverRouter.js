// backend/src/services/serverRouter.js
//
// Server-side routing for off-campus trips.
//
// WHY THIS EXISTS
// ---------------
// The client used to route everything itself against a 2km graph slice handed
// down by /api/routing/graph-slice. That cap made any trip longer than the box
// fail with "no route", even though the database holds the whole metro edge set
// (400k+ regional edges, campus edges included). Raising the box is not an
// option: the measured Legon->Accra corridor is already ~61k edges, far past
// what a phone should parse, and the full region is ~400k.
//
// So off-campus trips are computed here instead. The server loads the corridor
// between the two endpoints, runs the SAME A* engine the browser uses (shared/
// routing/, imported directly — one implementation, no drift), and returns just
// the resulting routes. The browser keeps its own A* for the campus sandbox,
// where the graph is small and already present.
//
// This module is deliberately thin: it owns graph loading, endpoint snapping and
// shaping the result. All pathfinding lives in the shared engine.

import { loadTripGraph, TRIP_CORRIDOR_KM } from './routingContext.js';
import { getAllRoutes, findNearestNodeWithSnap } from '../../../shared/routing/routing.js';
import { LruTtlCache } from '../utils/lruCache.js';

// Snap tolerance in degrees (~2.2km at this latitude), wider than the engine's
// 1.1km default. The regional graph is sparser than the campus graph, so a
// realistic origin can legitimately be further from the nearest node than it
// would be on campus; snapping too tightly would reject routes that are fine.
const SNAP_MAX_DEGREES = 0.02;

// Recently computed routes, keyed by the exact request shape. A reroute (the
// client re-asking after a GPS deviation, or a second user heading the same way)
// returns in microseconds instead of re-running four A* passes. TTL is short
// because hazard verdicts and weather rescore the graph continuously.
const routeCache = new LruTtlCache({ max: 200, ttlMs: 60_000 });

// Rounding for the cache key. 5 decimal places is ~1.1m — fine enough that two
// requests only share an entry when they are genuinely the same trip.
function coordKey(p) {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

// A stable fingerprint of the inputs that change the path. Only `id` and
// `verdict` of each decision matter to the cost function; sorting makes the key
// order-independent. Weather is a small numeric object, so JSON is fine.
function cacheKeyFor({ from, to, vehicleMode, decisions, weatherMultipliers }) {
  const decisionKey = (decisions ?? [])
    .map((d) => `${d?.id}:${d?.verdict}`)
    .sort()
    .join('|');
  return [
    coordKey(from),
    coordKey(to),
    vehicleMode,
    decisionKey,
    weatherMultipliers ? JSON.stringify(weatherMultipliers) : '',
  ].join('~');
}

// Run the shared engine against an already-loaded graph. Returns the same shape
// routeOffCampus does, with ok:false (and a reason) for the recoverable misses
// that a second load with a wider filter could fix.
async function routeOverLoadedGraph(loaded, { from, to, vehicleMode, decisions, weatherMultipliers }) {
  const { graph, source, truncated, stats, envelope, corridor } = loaded;

  if (!graph || stats.edgeCount === 0) {
    return { ok: false, reason: 'no-graph', source, stats, envelope, corridor, routes: null };
  }

  const startSnap = findNearestNodeWithSnap(graph, from.lat, from.lng, SNAP_MAX_DEGREES);
  const endSnap = findNearestNodeWithSnap(graph, to.lat, to.lng, SNAP_MAX_DEGREES);

  if (!startSnap.nodeId || !endSnap.nodeId) {
    return {
      ok: false,
      reason: 'snap-failed',
      source,
      stats,
      envelope,
      corridor,
      snap: { start: startSnap, end: endSnap },
      routes: null,
    };
  }

  // EXTERNAL_TESTING is the same context the cost function already uses for
  // off-campus slices, so server-side costs match what the client would compute
  // for the same edges. Passing anything else would silently change penalties.
  const routes = await getAllRoutes(
    graph,
    startSnap.nodeId,
    endSnap.nodeId,
    vehicleMode,
    decisions,
    weatherMultipliers,
    'EXTERNAL_TESTING'
  );

  const routed = routes && (routes.standard || routes.fastest || routes.accessible || routes.night);
  if (!routed) {
    return {
      ok: false,
      reason: 'no-route',
      source,
      stats,
      envelope,
      corridor,
      snap: { start: startSnap, end: endSnap },
      routes: null,
    };
  }

  return {
    ok: true,
    source,
    truncated,
    stats,
    envelope,
    corridor,
    snap: { start: startSnap, end: endSnap },
    routes,
  };
}

/**
 * Route between two coordinates over the regional (off-campus) graph.
 *
 * Never throws for expected conditions — a missing graph or an unsnappable
 * endpoint is reported through the returned `ok`/`reason` pair so the route
 * handler can answer with a structured 200 rather than an opaque 5xx. Genuine
 * unexpected errors (a SQL fault) are left to propagate.
 *
 * @param {object} opts
 * @param {{lat: number, lng: number}} opts.from
 * @param {{lat: number, lng: number}} opts.to
 * @param {string} [opts.vehicleMode]
 * @param {Array}  [opts.decisions]  live routing verdicts (block/avoid/ignore)
 * @param {object} [opts.weatherMultipliers]
 * @returns {Promise<{ok: boolean, reason?: string, source?: string,
 *                    truncated?: boolean, stats?: object, envelope?: object,
 *                    snap?: object, routes?: object}>}
 */
export async function routeOffCampus({
  from,
  to,
  vehicleMode = 'walk',
  decisions = [],
  weatherMultipliers = undefined,
}) {
  const cacheKey = cacheKeyFor({ from, to, vehicleMode, decisions, weatherMultipliers });
  const cached = routeCache.get(cacheKey);
  if (cached) return cached;

  // First attempt: the thin corridor around the straight from->to line. This is
  // the common case and the reason server routes are fast — for Legon->Tema it
  // loads a small fraction of the ~35k edges the bbox would.
  const args = { from, to, vehicleMode, decisions, weatherMultipliers };
  let result = await routeOverLoadedGraph(
    await loadTripGraph({ from, to, mode: 'corridor', corridorKm: TRIP_CORRIDOR_KM }),
    args
  );

  // The corridor only fails when it is genuinely too narrow — a route that
  // detours beyond the half-width, or an endpoint whose nearest node sits just
  // outside it. That is rare, so pay for the full padded bbox only here. A
  // 'no-route' on the bbox is the real answer and is surfaced as-is.
  if (!result.ok) {
    result = await routeOverLoadedGraph(await loadTripGraph({ from, to, mode: 'bbox' }), args);
  }

  // Cache successes only: a transient miss (graph not yet synced, a cold DB)
  // should not be remembered for the TTL.
  if (result.ok) routeCache.set(cacheKey, result);
  return result;
}

/** Test seam: drop cached routes (also exposed for a future admin flush). */
export function __clearRouteCache() {
  routeCache.clear();
}

export const __test__ = { cacheKeyFor, routeCache };

