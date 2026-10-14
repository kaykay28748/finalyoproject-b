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

import { loadTripGraph } from './routingContext.js';
import { getAllRoutes, findNearestNodeWithSnap } from '../../../shared/routing/routing.js';

// Snap tolerance in degrees (~2.2km at this latitude), wider than the engine's
// 1.1km default. The regional graph is sparser than the campus graph, so a
// realistic origin can legitimately be further from the nearest node than it
// would be on campus; snapping too tightly would reject routes that are fine.
const SNAP_MAX_DEGREES = 0.02;

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
  const { graph, source, truncated, stats, envelope } = await loadTripGraph({ from, to });

  if (!graph || stats.edgeCount === 0) {
    return { ok: false, reason: 'no-graph', source, stats, envelope, routes: null };
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

  return {
    ok: true,
    source,
    truncated,
    stats,
    envelope,
    snap: { start: startSnap, end: endSnap },
    routes,
  };
}
