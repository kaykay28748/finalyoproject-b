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
import { recordServerRoute } from '../utils/metrics.js';

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

// Every field of a decision that actually changes the computed path. It is NOT
// just id+verdict: getDecisionPenalty (costFunction.js) scores from lat/lng and
// penalty and decays by decided_at/expires_at, while assessRouteDecisions
// (routing.js) blocks on verdict. Decisions arrive from the client, so two
// requests can legitimately carry the same id and verdict but a different hazard
// position or penalty — keying on id+verdict alone would let them share an entry
// and receive each other's route.
function decisionFingerprint(decision) {
  return [
    decision?.id ?? null,
    decision?.verdict ?? null,
    decision?.lat ?? null,
    decision?.lng ?? null,
    decision?.penalty ?? null,
    decision?.decided_at ?? null,
    decision?.expires_at ?? null,
  ];
}

function compareFingerprints(a, b) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

// A stable fingerprint of the inputs that change the path. The whole tuple is
// JSON-encoded rather than delimiter-joined so a crafted id containing a
// separator cannot forge a collision between two different requests. Sorting the
// decision fingerprints keeps the key independent of array order; weather is a
// small numeric object, so plain JSON is fine (a different key order is a cache
// miss, never a wrong hit).
function cacheKeyFor({ from, to, vehicleMode, decisions, weatherMultipliers }) {
  const decisionKey = (decisions ?? [])
    .map(decisionFingerprint)
    .sort(compareFingerprints);
  return JSON.stringify([
    coordKey(from),
    coordKey(to),
    vehicleMode,
    decisionKey,
    weatherMultipliers ?? null,
  ]);
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
  const startedAt = performance.now();
  const cacheKey = cacheKeyFor({ from, to, vehicleMode, decisions, weatherMultipliers });
  const cached = routeCache.get(cacheKey);
  if (cached) {
    // A cache hit is the fast path and should show as such in the metrics: it
    // has no A* or graph-load cost, so recording a near-zero total here keeps
    // the averages honest instead of folding hits into search timings.
    recordServerRoute({ ok: true, cacheHit: true, totalMs: performance.now() - startedAt });
    return cached;
  }

  const args = { from, to, vehicleMode, decisions, weatherMultipliers };

  // First attempt: the thin corridor around the straight from->to line. This is
  // the common case and the reason server routes are fast — for Legon->Tema it
  // loads a small fraction of the ~35k edges the bbox would.
  let mode = 'corridor';
  let loaded = await loadTripGraph({ from, to, mode: 'corridor', corridorKm: TRIP_CORRIDOR_KM });
  let graphLoadMs = loaded.loadMs ?? 0;
  let result = await routeOverLoadedGraph(loaded, args);

  // The corridor only fails when it is genuinely too narrow — a route that
  // detours beyond the half-width, or an endpoint whose nearest node sits just
  // outside it. That is rare, so pay for the full padded bbox only here. A
  // 'no-route' on the bbox is the real answer and is surfaced as-is.
  if (!result.ok) {
    mode = 'bbox';
    loaded = await loadTripGraph({ from, to, mode: 'bbox' });
    graphLoadMs += loaded.loadMs ?? 0;
    result = await routeOverLoadedGraph(loaded, args);
  }

  // Cache successes only: a transient miss (graph not yet synced, a cold DB)
  // should not be remembered for the TTL.
  if (result.ok) routeCache.set(cacheKey, result);

  recordServerRoute({
    ok: result.ok,
    reason: result.reason,
    cacheHit: false,
    mode,
    totalMs: performance.now() - startedAt,
    graphLoadMs,
    // Populated by the shared engine (shared/routing/routing.js). Absent on a
    // miss, where there is no A* run to attribute time to.
    astarMs: result.routes?.metrics?.elapsedMs,
    edgeCount: result.stats?.edgeCount,
    nodeCount: result.stats?.nodeCount,
  });

  return result;
}

/** Test seam: drop cached routes (also exposed for a future admin flush). */
export function __clearRouteCache() {
  routeCache.clear();
}

export const __test__ = { cacheKeyFor, routeCache };

