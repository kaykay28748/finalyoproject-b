// frontend/src/services/perfService.js
//
// Reports client-side routing performance to the backend so the admin System
// tab can show campus routing cost. Campus trips are computed in the browser
// (see useRealtimeRoutes), so the server has no visibility into them otherwise.
//
// Best-effort and fire-and-forget: a metrics request must never slow a route
// down or surface an error. Samples are buffered and flushed in small batches,
// mirroring gpsPings.js, so a burst of reroutes becomes one request rather than
// one per calculation.

import { API_URL } from '../config';

const FLUSH_INTERVAL_MS = 15000;
const MAX_BUFFER = 40;
const MAX_SAMPLES_PER_REQUEST = 40;

let buffer = [];
let intervalId = null;

// Clamp to a sane range so a bad clock reading (a negative or absurd duration)
// cannot poison the backend's averages. Values outside the range are dropped.
function sane(value, max) {
  return Number.isFinite(value) && value >= 0 && value <= max ? value : undefined;
}

async function flush() {
  if (buffer.length === 0) return;

  const token = sessionStorage.getItem('accessToken');
  if (!token) {
    // Not signed in: nothing to attribute and the endpoint requires a token.
    // Drop rather than accumulate forever.
    buffer = [];
    return;
  }

  const batch = buffer.splice(0, MAX_SAMPLES_PER_REQUEST);

  try {
    await fetch(`${API_URL}/analytics/perf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ samples: batch }),
    });
  } catch {
    // Silently fail — metrics are not worth retrying or alarming the user over.
  }
}

/**
 * Queue a routing performance sample. Fields are the raw client observations;
 * the backend decides how to aggregate them.
 *
 * @param {object} sample
 * @param {'campus'|'offcampus'} sample.kind
 * @param {string} [sample.vehicleMode]
 * @param {number} [sample.astarMs]        campus: local getAllRoutes duration
 * @param {number} [sample.nodesExplored]  campus: nodes popped by A*
 * @param {number} [sample.edgeCount]      graph size the route ran over
 * @param {number} [sample.roundTripMs]    off-campus: HTTP round trip to server
 * @param {boolean} [sample.ok]
 */
export function recordRouteMetric(sample) {
  if (!sample || typeof sample !== 'object') return;

  const entry = {
    kind: sample.kind === 'offcampus' ? 'offcampus' : 'campus',
    vehicleMode: typeof sample.vehicleMode === 'string' ? sample.vehicleMode : undefined,
    // A single campus route cannot plausibly take a minute or explore more than
    // a few hundred thousand nodes; anything beyond that is a measurement fault.
    astarMs: sane(sample.astarMs, 60000),
    nodesExplored: sane(sample.nodesExplored, 500000),
    edgeCount: sane(sample.edgeCount, 1000000),
    roundTripMs: sane(sample.roundTripMs, 120000),
    ok: sample.ok !== false,
  };

  buffer.push(entry);

  if (!intervalId) {
    intervalId = setInterval(flush, FLUSH_INTERVAL_MS);
  }

  if (buffer.length >= MAX_BUFFER) flush();
}

/** Force any buffered samples out (e.g. when the tab is hidden). */
export function flushRouteMetrics() {
  return flush();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
