// frontend/src/services/graphSliceService.js
//
// Client for GET /api/routing/graph-slice.
//
// The backend decides which graph to send (whole campus vs a 2km box) via the
// geofence RPC. This module fetches it and, critically, reports honestly when
// there is nothing to use, so the caller can fall back to Overpass rather than
// routing over an empty graph.

import { API_URL } from '../config';

// Local SQLite dev, or edge tables not loaded yet. Both mean "no server graph" —
// the graph must be built from Overpass instead.
export const EMPTY_GRAPH_SOURCES = [
  'sqlite-development-empty',
  'campus-graph-unavailable',
  'external-graph-unavailable',
  'error-default',
];

/**
 * Fetch the adaptive graph slice for a coordinate.
 *
 * Never throws. Every failure mode resolves to a null graph with a `source`, so
 * a network error during development cannot take the map down — it just means
 * the caller builds the graph itself, which is exactly what it did before this
 * endpoint existed.
 *
 * @returns {Promise<{graph: {nodes: object, edges: array} | null,
 *                    sandboxContext: string, enforceGpsTracking: boolean,
 *                    source: string, stats?: object}>}
 */
export async function fetchGraphSlice(lat, lng, { signal } = {}) {
  const fallback = {
    // null, not an empty object: "no graph" and "an empty graph" are different
    // answers and the caller must be able to tell them apart.
    graph: null,
    sandboxContext: 'EXTERNAL_TESTING',
    enforceGpsTracking: false,
    source: 'fetch-failed',
  };

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fallback;

  const url = `${API_URL}/api/routing/graph-slice?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      // A stale slice is worse than a slow one: the user has moved.
      signal: signal ?? AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`[GraphSlice] HTTP ${res.status} — falling back to Overpass`);
      return { ...fallback, source: `http-${res.status}` };
    }

    const payload = await res.json();
    const graph = payload?.graph;
    const edgeCount = graph?.edges?.length ?? 0;
    const nodeCount = graph?.nodes ? Object.keys(graph.nodes).length : 0;

    // An empty graph is a valid response meaning "build it yourself". Returning
    // null here — rather than the empty object — is what lets the caller fall
    // back without having to re-derive why it was empty.
    return {
      graph: edgeCount > 0 && nodeCount > 0 ? graph : null,
      sandboxContext: payload?.sandboxContext ?? 'EXTERNAL_TESTING',
      enforceGpsTracking: payload?.enforceGpsTracking === true,
      source: payload?.source ?? 'unknown',
      truncated: payload?.truncated === true,
      stats: payload?.stats ?? { edgeCount, nodeCount },
    };
  } catch (err) {
    // AbortError means the user moved on. Not worth a warning.
    if (err?.name !== 'AbortError') {
      console.warn('[GraphSlice] Request failed, falling back to Overpass:', err?.message);
    }
    return fallback;
  }
}

/**
 * The `sandboxContext` value the cost function cares about.
 *
 * Kept here so the string literals exist once. `CAMPUS_SANDBOX` enables the
 * pedestrian crowd benefits; `EXTERNAL_TESTING` falls back to plain urban
 * distance weighting.
 */
export const SANDBOX_CONTEXT = {
  CAMPUS: 'CAMPUS_SANDBOX',
  EXTERNAL: 'EXTERNAL_TESTING',
};
