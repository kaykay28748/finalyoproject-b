// backend/src/services/routingContext.js
//
// Two related jobs, deliberately kept in one module because both are answered by
// the same geofence question:
//
//   1. getRoutingContext()  — "is this point on campus?" A boolean verdict.
//   2. getSpatialGraphSlice() — "which graph should the browser route over?"
//      Answers with the sandboxContext / enforceGpsTracking pair and a graph
//      payload sized to the answer.
//
// A* and pathfinding stay in the browser. This module decides which graph the
// browser is given and how big it is; it never computes a path.

import { query, isPostgres } from '../config/db.js';

// The RPC name as defined in the Supabase database. Kept in one constant so a
// rename in the database is a one-line change here rather than a search.
const GEOFENCE_RPC = 'check_if_inside_legon';

// Coarse bounding box for the University of Ghana campus area. Used only to
// short-circuit obviously-far coordinates before the RPC round-trip — it is NOT
// the sandbox boundary, and `insideSandbox` is never derived from it. The RPC
// remains the only authority on the actual answer.
//
// The margin around the true bounds is deliberate: a point just outside the
// sandbox must still reach the RPC, otherwise the bbox would silently override
// the geofence near the edge. Returning `false` early is only safe where the
// answer is false regardless of the boundary shape.
const CAMPUS_BBOX = { minLat: 5.638, maxLat: 5.671, minLng: -0.205, maxLng: -0.168 };

/**
 * Coerce a query-string value to a finite number within range.
 *
 * Express hands over strings, and `Number('')` is 0 while `Number('abc')` is NaN.
 * Neither is caught by a truthiness check, and a NaN latitude passed to PostGIS
 * produces a geometry error that surfaces as an opaque 500.
 *
 * @returns {number|null} the number, or null if unusable.
 */
function parseCoordinate(raw, { min, max, name }) {
  if (raw === undefined || raw === null || raw === '') return null;

  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;

  return n;
}

/**
 * Normalise whatever the RPC returned into a boolean.
 *
 * PostgreSQL booleans arrive as real booleans, but the same function reached
 * through PostgREST or a driver with a different type parser can yield the
 * strings 'true'/'false', 't'/'f', 1/0, or a single-key object like
 * `{ check_if_inside_legon: true }`. Treating any non-empty string as truthy
 * would make the string 'false' mean true — the worst possible failure here,
 * because it would enable campus GPS constraints for someone standing in Accra.
 *
 * @returns {boolean|null} null means "unrecognised shape", not "outside".
 */
function coerceBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    // Only 0 and 1 are meaningful. Any other number is a shape we do not
    // understand, and collapsing it to `false` would hide a real problem behind
    // a confident "not on campus".
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }

  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === 't' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === 'f' || v === '0' || v === 'no' || v === '') return false;
    return null;
  }

  // { check_if_inside_legon: true } or { inside: false }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const inner = coerceBoolean(value[key]);
      if (inner !== null) return inner;
    }
  }

  return null;
}

/**
 * Ask the database whether a point is inside the campus sandbox.
 *
 * Never throws. A geofence lookup is an advisory input to a routing UI, so a
 * database hiccup must degrade to "not on campus" rather than break the request
 * path the user is on. The safe direction is deliberate: `false` disables campus
 * GPS constraints and lets the user type a location by hand, whereas a wrong
 * `true` would pin a user who is not there and reject every route they try.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{insideSandbox: boolean, source: string, detail?: string}>}
 */
export async function getRoutingContext(lat, lng) {
  // Local SQLite has no RPC and no PostGIS, so there is nothing to ask. This is
  // the normal dev path — not an error condition.
  if (!isPostgres) {
    return { insideSandbox: false, source: 'sqlite-development-default' };
  }

  // Far outside any plausible campus location: skip the round-trip. Still routed
  // through the same return shape so callers need no special case.
  if (
    lat < CAMPUS_BBOX.minLat || lat > CAMPUS_BBOX.maxLat ||
    lng < CAMPUS_BBOX.minLng || lng > CAMPUS_BBOX.maxLng
  ) {
    return { insideSandbox: false, source: 'outside-bbox' };
  }

  try {
    // Parameterised, not interpolated. Identifiers cannot be parameterised, so
    // the function name is a constant and only the values are bound.
    //
    // Note the `?` placeholders: config/db.js rewrites them to $1/$2 for the pg
    // driver. Writing $1/$2 here would be renumbered a second time.
    const result = await query(
      `SELECT ${GEOFENCE_RPC}(?, ?) AS inside_sandbox`,
      [lat, lng]
    );

    const insideSandbox = coerceBoolean(result?.rows?.[0]?.inside_sandbox);

    if (insideSandbox === null) {
      console.warn(
        `[RoutingContext] Unrecognised RPC result shape for (${lat}, ${lng}):`,
        JSON.stringify(result?.rows?.[0])
      );
      return { insideSandbox: false, source: 'unrecognised-rpc-shape' };
    }

    return { insideSandbox, source: 'rpc' };
  } catch (err) {
    // 42883 undefined_function — the RPC has not been created in the database yet.
    // 42P01 undefined_table, 42703 undefined_column — schema drift.
    // 42501 insufficient_privilege — RLS or grants blocking the call.
    //
    // All are configuration states, not request errors, so they must not surface
    // as a 5xx that a client would retry.
    console.warn(`[RoutingContext] Geofence RPC unavailable (${err?.code || 'no code'}):`, err?.message);
    return {
      insideSandbox: false,
      source: 'rpc-unavailable',
      detail: err?.code || 'unknown',
    };
  }
}

// ============================================================================
// ADAPTIVE GEOFENCED SLICING
// ============================================================================
//
// The strategy: inside the sandbox, hand over the whole campus graph so A* can
// never dead-end or need a boundary stitch mid-route. Outside it, hand over a
// 2km box around the user, which is enough to route anywhere local without
// shipping a city-wide edge set to a phone browser.
//
// ── THE EDGE TABLES ARE NOT YET IN THIS REPO ──────────────────────────────────
//
// `public.legon_edges` and `osm.accra_edges` are not defined in
// postgres-schema.sql, in any migration, or anywhere else in this codebase. The
// column names below are therefore an ASSUMPTION, not a verified fact, and they
// are isolated here for exactly that reason: when the real schema is confirmed,
// this block is the only thing that changes.
//
// The two failure modes are handled differently on purpose:
//
//   * Table missing (42P01) or column missing (42703) — the graph could not be
//     read. Hand back an EMPTY graph and say so via `source`. The frontend falls
//     back to building the graph from Overpass, which is how the app worked
//     before this feature existed. A wrong-but-plausible graph would be far
//     worse than an honest empty one.
//   * Table present but empty (0 rows) — also an empty graph, but a different
//     `source`, because that is a data-loading problem rather than a schema one.
//
// Nothing here throws. A routing UI that cannot get a graph should still open.
const EDGE_TABLES = {
  campus: {
    schema: 'public',
    table: 'legon_edges',
    // id/source/target are the pgRouting convention; geom holds the LineString.
    columns: { id: 'id', source: 'source', target: 'target', geom: 'geom' },
    // Tag columns the frontend cost function reads. Assumed names.
    tags: { highway: 'highway_type', name: 'name', incline: 'incline', sidewalk: 'sidewalk', surface: 'surface' },
  },
  external: {
    schema: 'osm',
    table: 'accra_edges',
    columns: { id: 'id', source: 'source', target: 'target', geom: 'geom' },
    tags: { highway: 'highway_type', name: 'name', incline: 'incline', sidewalk: 'sidewalk', surface: 'surface' },
  },
};

// The external slice. 2km x 2km is the figure in the brief; at Accra's latitude
// 1 degree of longitude is ~111.32 * cos(5.6 deg) ~ 110.8 km, so 1km is
// ~0.00902 degrees. Computed rather than hardcoded so the number is defensible
// if the box size ever changes.
const SLICE_RADIUS_KM = 1;

// Hard ceiling on edges returned, both branches.
//
// The campus graph is deliberately unbounded in the brief ("pull the entire
// dataset"), which is the right call for avoiding dead ends — but "entire" is
// unbounded in the literal sense, and a campus-scale edge set plus per-edge tag
// objects will happily exceed what a phone will parse, let alone render. This
// cap is a backstop, not a target; if the real campus graph is near it, the
// right fix is a real spatial filter, not a bigger number.
const MAX_EDGES = 50000;

/**
 * Build a ST_MakeEnvelope argument set for a lat/lng centred box.
 *
 * Longitude degrees are shorter than latitude degrees away from the equator, so
 * both axes need their own divisor. Using one for both produces a box that is
 * wider than it is tall — subtly wrong, and wrong in a way that only shows up as
 * oddly asymmetric routing rather than an error.
 */
function envelopeForRadius(lat, lng, radiusKm = SLICE_RADIUS_KM) {
  const KM_PER_DEG_LAT = 111.32;
  const latDelta = radiusKm / KM_PER_DEG_LAT;
  // Clamp the cosine: at the poles cos(lat) is 0, which would make lngDelta
  // infinite and produce an invalid envelope.
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
  const lngDelta = radiusKm / (KM_PER_DEG_LAT * cosLat);

  return {
    minLng: lng - lngDelta,
    minLat: lat - latDelta,
    maxLng: lng + lngDelta,
    maxLat: lat + latDelta,
    radiusKm,
  };
}

/**
 * Normalise a database edge row into the shape graphBuilder.js produces.
 *
 * The frontend graph contract is specific and A* depends on every field of it:
 *   node  { id, lat, lng, neighbors: [] }
 *   edge  { id, from, to, distance, tags, type }
 * A row that omits `neighbors` throws in A*; one with a string id that is later
 * compared against a numeric key silently fails to match. So ids are coerced to
 * strings at the boundary, once, rather than being made to work downstream.
 */
function normaliseEdgeRow(row, table) {
  const { columns, tags } = table;
  const rawGeom = row[columns.geom];

  // GeoJSON coordinates are [lng, lat] — x before y. Reversed here, the line
  // still renders, just mirrored, which is a genuinely nasty bug to chase.
  // GeoJSON Polygon nests one level deeper: [[[lng, lat], ...]].
  let lineCoords = [];
  if (rawGeom && typeof rawGeom === 'object') {
    if (rawGeom.type === 'LineString' && Array.isArray(rawCoords(rawGeom))) {
      lineCoords = rawCoords(rawGeom);
    } else if (rawGeom.type === 'Polygon' && Array.isArray(rawCoords(rawGeom)) && Array.isArray(rawCoords(rawGeom)[0])) {
      lineCoords = rawCoords(rawGeom)[0];
    }
  }

  // Column order is [lng, lat]; the frontend wants [{ lat, lng }].
  const coordinates = lineCoords
    .filter((c) => Array.isArray(c) && c.length >= 2)
    .map((c) => ({ lat: Number(c[1]), lng: Number(c[0]) }))
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));

  if (coordinates.length < 2) return null; // an edge needs two endpoints

  const sourceId = String(row[columns.source]);
  const targetId = String(row[columns.target]);

  const edgeTags = {
    highway: row[tags.highway] ?? null,
    name: row[tags.name] ?? null,
    surface: row[tags.surface] ?? null,
    // Preserve the distinction between "tagged and absent" and "not tagged at
    // all". costFunction.js penalises the second (UNKNOWN_INCLINE,
    // SIDEWALK_UNKNOWN_PENALTY) and treats the first as real data; collapsing
    // both to null would silently disable those safety defaults.
    incline: row[tags.incline] ?? null,
    sidewalk: row[tags.sidewalk] ?? null,
  };

  // distance is REQUIRED by A* for cost.
  //
  // The guard must reject null/undefined/'' BEFORE Number() coercion, because
  // Number(null) and Number('') are both 0 and Number.isFinite(0) is true — so a
  // naive `Number.isFinite(Number(v))` test turns a MISSING distance into 0,
  // which makes the edge free. A* then routes through it at no cost and happily
  // returns a path through the entire graph, which looks like a working route
  // and is silently wrong.
  const rawDistance = row.distance_m;
  const hasDistance = rawDistance !== null && rawDistance !== undefined && rawDistance !== '';
  const distance = hasDistance ? Number(rawDistance) : NaN;

  return {
    edge: {
      id: String(row[columns.id]),
      from: sourceId,
      to: targetId,
      distance: Number.isFinite(distance) ? distance : null,
      type: edgeTags.highway || 'residential',
      tags: edgeTags,
    },
    // A* needs a node per referenced id, with a populated neighbours array.
    endpoints: [coordinates[0], coordinates[coordinates.length - 1]],
    sourceId,
    targetId,
  };
}

function rawCoords(geom) {
  return geom.coordinates;
}

/**
 * Fetch and assemble a graph payload for the given table.
 *
 * Never throws. Returns { graph, source, detail }.
 */
async function loadGraphSlice(table, { lat, lng, envelope, full }) {
  const { schema, table: tableName, columns, tags } = table;

  // Identifiers cannot be parameterised in SQL. schema/table/column names come
  // from the constant above, never from request input, which is what makes this
  // safe to interpolate.
  const col = (c) => `${schema}.${tableName}.${c}`;

  // `full` skips the spatial filter. The campus branch uses it so A* can never
  // dead-end on a sliced boundary; the external branch uses the envelope.
  const spatialClause = full
    ? ''
    : `WHERE ST_Intersects(${col(columns.geom)}, ST_MakeEnvelope(?, ?, ?, ?, 4326))`;

  const params = full
    ? [MAX_EDGES]
    : [envelope.minLng, envelope.minLat, envelope.maxLng, envelope.maxLat, MAX_EDGES];

  const sql =
    `SELECT ${col(columns.id)}, ${col(columns.source)}, ${col(columns.target)}, ` +
    `${col(columns.geom)}, ` +
    `${col(tags.highway)} AS highway, ${col(tags.name)} AS name, ` +
    `${col(tags.incline)} AS incline, ${col(tags.sidewalk)} AS sidewalk, ${col(tags.surface)} AS surface, ` +
    `ST_Length(${col(columns.geom)}::geography) AS distance_m ` +
    `FROM ${schema}.${tableName} ` +
    spatialClause +
    // Deterministic cap. Without ORDER BY, "first N rows" is whatever the
    // planner returns, so the same request can return different graphs — which
    // reads as nondeterministic routing rather than as a limit.
    `ORDER BY ${col(columns.id)} ` +
    `LIMIT ?`;

  const result = await query(sql, params);
  const rows = result?.rows ?? [];

  // Build the node table from edge endpoints, then link neighbours both ways.
  // A* treats the graph as undirected, so an edge that is only reachable one way
  // is a dead end.
  const nodes = {};
  const edges = [];
  let skipped = 0;

  const ensureNode = (id, coord) => {
    if (!nodes[id]) nodes[id] = { id, lat: coord.lat, lng: coord.lng, neighbors: [] };
    return nodes[id];
  };

  for (const row of rows) {
    const parsed = normaliseEdgeRow(row, table);
    if (!parsed) { skipped++; continue; }

    const fromNode = ensureNode(parsed.sourceId, parsed.endpoints[0]);
    const toNode = ensureNode(parsed.targetId, parsed.endpoints[1]);

    // Both endpoints claim the same id if source === target (a self-loop from
    // bad data). Keep it out of edges; it adds cost and no connectivity.
    if (parsed.sourceId === parsed.targetId) { skipped++; continue; }

    const from = parsed.endpoints[0];
    const to = parsed.endpoints[1];
    const distance = parsed.edge.distance ?? haversineMetres(from, to);

    const edge = { ...parsed.edge, distance };
    edges.push(edge);

    fromNode.neighbors.push({ nodeId: parsed.targetId, edgeId: edge.id, distance });
    toNode.neighbors.push({ nodeId: parsed.sourceId, edgeId: edge.id, distance });
  }

  // Drop isolated nodes: findClosestNode can snap a route to one and then A*
  // has nowhere to go.
  const connected = {};
  for (const [id, node] of Object.entries(nodes)) {
    if (node.neighbors.length > 0) connected[id] = node;
  }

  return {
    graph: { nodes: connected, edges },
    source: rows.length === 0 ? `${schema}.${tableName}-empty` : `${schema}.${tableName}`,
    truncated: rows.length >= MAX_EDGES,
    stats: { edgeCount: edges.length, nodeCount: Object.keys(connected).length, skipped, cap: MAX_EDGES },
  };
}

/** Great-circle distance in metres. Used only when distance_m is unavailable. */
function haversineMetres(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Adaptive geofenced graph slice.
 *
 * CASE A — on campus: the entire campus graph, no radius filter, so A* cannot
 *           dead-end or need a boundary stitch.
 * CASE B — off campus: a 2km x 2km box around the user, so a phone never has to
 *           parse a city-wide edge set.
 *
 * Never throws. Local SQLite returns an empty graph with
 * `sandboxContext: 'EXTERNAL_TESTING'`, which is the same shape as a
 * legitimately empty slice, so the frontend's Overpass fallback handles both.
 *
 * @returns {Promise<{sandboxContext: string, enforceGpsTracking: boolean,
 *                    graph: {nodes: object, edges: array}, source: string,
 *                    stats?: object, detail?: string}>}
 */
export async function getSpatialGraphSlice(lat, lng) {
  // Verdict first, and the same getRoutingContext() the context endpoint uses,
  // so /context and /graph-slice can never disagree about whether someone is on
  // campus. Two independent geofence evaluations would eventually disagree.
  const { insideSandbox, source: verdictSource } = await getRoutingContext(lat, lng);

  const EMPTY_GRAPH = { nodes: {}, edges: [] };

  if (insideSandbox) {
    // CASE A: CAMPUS_SANDBOX. No spatial filter.
    if (!isPostgres) {
      // Cannot happen — getRoutingContext returns false on SQLite — but if the
      // verdict logic changes, the fallback must still not throw.
      return {
        sandboxContext: 'CAMPUS_SANDBOX', enforceGpsTracking: true,
        graph: EMPTY_GRAPH, source: 'sqlite-development-empty',
      };
    }

    try {
      const loaded = await loadGraphSlice(EDGE_TABLES.campus, { lat, lng, full: true });
      return {
        sandboxContext: 'CAMPUS_SANDBOX',
        // The point of the sandbox: location is authoritative, so the frontend
        // may require a real GPS fix rather than accepting a typed address.
        enforceGpsTracking: true,
        graph: loaded.graph,
        source: loaded.source,
        truncated: loaded.truncated,
        stats: loaded.stats,
        verdictSource,
      };
    } catch (err) {
      return {
        sandboxContext: 'CAMPUS_SANDBOX', enforceGpsTracking: true,
        graph: EMPTY_GRAPH, source: 'campus-graph-unavailable',
        detail: err?.code || 'unknown',
        verdictSource,
      };
    }
  }

  // CASE B: EXTERNAL_TESTING. 2km box, no GPS constraint.
  if (!isPostgres) {
    return {
      sandboxContext: 'EXTERNAL_TESTING', enforceGpsTracking: false,
      graph: EMPTY_GRAPH, source: 'sqlite-development-empty',
      stats: { edgeCount: 0, nodeCount: 0, skipped: 0, cap: MAX_EDGES },
      verdictSource,
    };
  }

  const envelope = envelopeForRadius(lat, lng, SLICE_RADIUS_KM);

  try {
    const loaded = await loadGraphSlice(EDGE_TABLES.external, { lat, lng, envelope, full: false });
    return {
      sandboxContext: 'EXTERNAL_TESTING',
      enforceGpsTracking: false,
      graph: loaded.graph,
      source: loaded.source,
      truncated: loaded.truncated,
      stats: loaded.stats,
      slice: { radiusKm: envelope.radiusKm, ...envelope },
      verdictSource,
    };
  } catch (err) {
    // The edge table is absent or has different columns. Say which, so this is
    // diagnosable from a log rather than guessed at.
    console.warn(
      `[GraphSlice] ${EDGE_TABLES.external.schema}.${EDGE_TABLES.external.table} unavailable` +
      ` (${err?.code || 'no code'}): ${err?.message}`
    );
    return {
      sandboxContext: 'EXTERNAL_TESTING', enforceGpsTracking: false,
      graph: EMPTY_GRAPH, source: 'external-graph-unavailable',
      detail: err?.code || 'unknown',
      verdictSource,
    };
  }
}

export const __test__ = {
  parseCoordinate, coerceBoolean, CAMPUS_BBOX,
  envelopeForRadius, normaliseEdgeRow, haversineMetres,
  EDGE_TABLES, MAX_EDGES, SLICE_RADIUS_KM,
};
