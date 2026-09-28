// backend/src/services/graphSynchronizer.js
//
// Server-side spatial graph compiler.
//
// Replaces the browser's static Overpass fetch with a persistent, queryable
// edge table. The browser used to ask Overpass for one hardcoded Legon bounding
// box on every cold start; this service lets a region be compiled into
// `public.pedestrian_edges` once, so every later read is a database query.
//
// The pipeline is:
//
//   bbox -> Overpass QL -> parse ways/nodes -> per-segment haversine metres
//        -> bulk UPSERT (PostGIS LineString on PostgreSQL, plain columns on SQLite)
//
// Three deliberate design decisions:
//
//   1. The bbox is validated AND bounded. This is an unauthenticated-reachable
//      path in the sense that the route is admin-gated but the service is not,
//      so `syncSpatialGraphRegion` itself refuses absurd boxes. An unbounded
//      `[out:json]` query over a large area will time out Overpass and burn the
//      shared 24h proxy cache with a payload nobody can use.
//
//   2. `osm_id` is a TEXT column and the conflict key, not a way id. A way
//      becomes MANY rows here (one per consecutive node pair), so the way id is
//      not unique on its own. The key is `${wayId}:${segmentIndex}`, which is
//      stable across re-syncs as long as OSM does not renumber or reorder nodes
//      within the way. Reordering does happen in real OSM edits; that shifts
//      segment keys and orphans the old rows, which is why `pruneRegion` exists.
//
//   3. Distance is computed in JS, not with ST_Length. ST_Length on a 4326
//      LineString returns DEGREES, and the degrees-to-metres conversion people
//      paste in is only correct near the equator. Haversine in JS is correct
//      everywhere and needs no PostGIS on the write path.

import { query, isPostgres } from '../config/db.js';

// Mirrors the upstream /api/overpass proxy's endpoint list and 429 backoff so a
// sync does not diverge from what the app already trusts. The browser proxy in
// server.js cannot be imported: it is a closure over `app`, not an export.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Overpass `timeout:30` is the server-side budget. The HTTP timeout must exceed
// it or we abort a query that was about to succeed, which then caches nothing
// and leaves the caller with a false "region is empty".
const OVERPASS_HTTP_TIMEOUT_MS = 45000;

// Rows per INSERT. A single multi-row INSERT with this many value groups stays
// under the 65535 bind-parameter ceiling in PostgreSQL (10 columns x 500), while
// keeping the number of round trips low enough that a full-city sync is seconds
// rather than minutes.
const UPSERT_BATCH_SIZE = 500;

// Refuse boxes larger than this. Roughly a 20km x 20km box at the equator. A
// whole-country sync through a shared public Overpass instance is antisocial and
// will simply time out.
const MAX_BBOX_SPAN_DEG = 0.25;

// Hard ceiling on edges accepted from one response, so a malformed or
// unexpectedly dense region cannot turn into a multi-gigabyte write.
const MAX_EDGES_PER_SYNC = 200000;

// The canonical definition of "campus", used to classify each synced segment into
// is_on_campus. It must agree with UG_BOUNDS in frontend/src/function/utils/bounds.js
// — that is the same box the map draws as the campus.
//
// This is NOT the authority on whether a *user* is on campus. That stays with the
// check_if_inside_legon RPC in routingContext.js, because a point's membership
// should be decided by one geofence, not by two boxes that can drift. This box
// only decides which bucket an already-ingested edge is stored in, so the campus
// graph slice can be served without re-running a polygon test on read.
export const CAMPUS_BOUNDS = {
  minLat: 5.6200, minLng: -0.2100, // south-west
  maxLat: 5.6720, maxLng: -0.1750, // north-east
};

/** Is this point inside CAMPUS_BOUNDS? */
export function isOnCampus(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= CAMPUS_BOUNDS.minLat && lat <= CAMPUS_BOUNDS.maxLat &&
    lng >= CAMPUS_BOUNDS.minLng && lng <= CAMPUS_BOUNDS.maxLng
  );
}

// Columns, in the exact order the parameter groups below are built in. Kept as a
// single source of truth so the INSERT column list and the params array cannot
// drift apart — which is the classic way this kind of bulk write silently
// scrambles data.
//
// The four coordinate columns exist so a spatial slice is possible WITHOUT PostGIS.
// They are populated from the same values that build `geom`, so the geometry path
// and the plain-column path can never disagree about where an edge is.
const UPSERT_COLUMNS = [
  'osm_id',
  'from_node_id',
  'to_node_id',
  'distance_m',
  'highway_type',
  'surface',
  'lit',
  'sidewalk',
  'incline',
  'from_lat',
  'from_lng',
  'to_lat',
  'to_lng',
  'is_on_campus',
];

// The table name is chosen by DIALECT, never by whether `geom` is available.
//
// These are two independent facts and conflating them is fatal on a PostgreSQL
// database without the PostGIS extension: such a database has no `geom` column
// (so `withGeometry` is false) but it still has — and must be written to —
// `public.pedestrian_edges`. Keying the table off `withGeometry` sent those syncs
// to `public_pedestrian_edges`, which does not exist in PostgreSQL at all, and
// every write failed with 42P01 undefined_table. The geometry path degrades the
// way it is designed to; it must never redirect the write to another database.
const EDGE_TABLE_POSTGRES = 'public.pedestrian_edges';
const EDGE_TABLE_SQLITE = 'public_pedestrian_edges';

/** The edge table for the current dialect. */
export function edgeTableName() {
  return isPostgres ? EDGE_TABLE_POSTGRES : EDGE_TABLE_SQLITE;
}

// `geom` is deliberately absent: on PostgreSQL it is appended with a PostGIS
// expression, and on SQLite the column does not exist. Building the column list
// per-dialect here keeps both paths honest.
//
// The geometry expression is ST_MakeLine over two explicit ST_MakePoint calls, not
// over a parsed text array. The array version reads more compactly but does not
// work: string_to_array() returns text[], and PostGIS has no ST_MakeLine(text[])
// overload, so it fails with 42883 undefined_function. The four coordinate
// placeholders must therefore be four separate binds, and the parameter order
// has to match them exactly.
// Exported for tests. The SQL/parameter-count contract is the single most
// fragile part of this file: a mismatch between the number of `?` in the
// statement and the number of entries in the params array is a runtime error on
// PostgreSQL and a silent column shift on SQLite, and nothing else in the
// codebase would catch it.
export function buildInsertSql({ withGeometry, rowCount, table = edgeTableName() }) {

  // updated_at is deliberately NOT in the column list.
  //
  // Listing a column and omitting its value is an error, not a way to accept the
  // default — so naming updated_at here while binding no value for it fails with
  // "9 values for 10 columns" on SQLite and "INSERT has more target columns than
  // expressions" on PostgreSQL. Leaving the column out entirely is what lets
  // `DEFAULT CURRENT_TIMESTAMP` apply, and the ON CONFLICT branch below still
  // refreshes it explicitly on every re-sync.
  const columns = withGeometry ? [...UPSERT_COLUMNS, 'geom'] : [...UPSERT_COLUMNS];

  // Placeholders are written as `?` because config/db.js rewrites them to $n for
  // the pg driver. Writing $1 here would be renumbered a second time.
  //
  // ST_SetSRID is explicit rather than relying on the column typmod.
  // `geom geometry(LineString, 4326)` will coerce an SRID-0 geometry on insert,
  // so the unwrapped form did work — but it depended on PostGIS applying the
  // typmod at assignment time. Stating the SRID here makes the ingested data
  // self-describing, so a row inserted into any other column, or read back by a
  // client that does not consult the typmod, is still correct.
  //
  // ST_MakePoint takes (x, y) and x is longitude — the reverse of a lat/lng pair.
  // Getting this backwards still produces a renderable line, mirrored about the
  // meridian and about 0.19 degrees off in Accra, so it fails silently.
  const rowGroup = `(${Array(UPSERT_COLUMNS.length).fill('?').join(', ')}, ` +
    `ST_SetSRID(ST_MakeLine(ST_MakePoint(?, ?), ST_MakePoint(?, ?)), 4326))`;

  // `rowCount` is passed in rather than hardcoded to UPSERT_BATCH_SIZE because
  // the final batch is usually smaller. Emitting a fixed number of row groups
  // would leave trailing placeholders with no matching parameter — which, on
  // PostgreSQL, is a hard error, and on SQLite a silent shift into the wrong
  // columns.
  return (
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES ` +
    Array.from({ length: rowCount }, () => rowGroup).join(', ') +
    // geom is deliberately NOT updated. If OSM redraws a way the segment keys
    // shift, producing NEW rows, so refreshing geom on a conflict would overwrite
    // current geometry with the old one. Tags are refreshed because they change
    // in place far more often than the shape does.
    //
    // is_on_campus IS refreshed: it is a property of CAMPUS_BOUNDS, not of the
    // segment, so correcting the bounds must reclassify existing rows on re-sync
    // without requiring a manual backfill.
    ` ON CONFLICT (osm_id) DO UPDATE SET ` +
    `surface = EXCLUDED.surface, lit = EXCLUDED.lit, sidewalk = EXCLUDED.sidewalk, ` +
    `incline = EXCLUDED.incline, is_on_campus = EXCLUDED.is_on_campus, ` +
    `updated_at = CURRENT_TIMESTAMP`
  );
}

/**
 * Validate and normalise a bounding box.
 *
 * Order matters: numeric coercion before range checks, or the string "abc"
 * passes a truthiness test and produces `NaN` inside the Overpass query, where
 * it becomes a silent syntax error rather than a clean rejection.
 *
 * @returns {{ok: true, bbox: {minLat,minLng,maxLat,maxLng}} | {ok: false, error: string}}
 */
export function validateBbox(minLat, minLng, maxLat, maxLng) {
  const raw = { minLat, minLng, maxLat, maxLng };

  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined || value === null || value === '') {
      return { ok: false, error: `${name} is required` };
    }
    if (!Number.isFinite(Number(value))) {
      return { ok: false, error: `${name} must be a number, got ${JSON.stringify(value)}` };
    }
  }

  const bbox = {
    minLat: Number(minLat),
    minLng: Number(minLng),
    maxLat: Number(maxLat),
    maxLng: Number(maxLng),
  };

  if (bbox.minLat < -90 || bbox.maxLat > 90) return { ok: false, error: 'lat must be within -90..90' };
  if (bbox.minLng < -180 || bbox.maxLng > 180) return { ok: false, error: 'lng must be within -180..180' };

  // Swapped corners are the single most common caller mistake, and they produce
  // a query that returns zero ways rather than an error — so they are rejected
  // explicitly instead.
  if (bbox.minLat >= bbox.maxLat) return { ok: false, error: 'minLat must be less than maxLat' };
  if (bbox.minLng >= bbox.maxLng) return { ok: false, error: 'minLng must be less than maxLng' };

  const latSpan = bbox.maxLat - bbox.minLat;
  const lngSpan = bbox.maxLng - bbox.minLng;
  if (latSpan > MAX_BBOX_SPAN_DEG || lngSpan > MAX_BBOX_SPAN_DEG) {
    return {
      ok: false,
      error: `bbox too large: span ${latSpan.toFixed(4)}x${lngSpan.toFixed(4)} deg exceeds max ${MAX_BBOX_SPAN_DEG} deg`,
    };
  }

  return { ok: true, bbox };
}

/**
 * Build the Overpass QL for a bbox.
 *
 * The highway filter is the pedestrian-relevant subset. `unclassified` is
 * included because a lot of Ghanaian campus-adjacent streets are mapped that
 * way, and excluding it produces graphs with visible holes in them.
 */
export function buildOverpassQuery({ minLat, minLng, maxLat, maxLng }) {
  return (
    `[out:json][timeout:30];` +
    `way["highway"~"footway|pedestrian|path|steps|residential|service"](${minLat},${minLng},${maxLat},${maxLng});` +
    `node(w);` +
    `out body;` +
    `>;` +
    `out skel qt;`
  );
}

/** Great-circle distance in metres. Correct at any latitude, unlike ST_Length on 4326. */
function haversineMetres(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function fetchOverpass(queryBody, { retries = 3 } = {}) {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          body: queryBody,
          headers: {
            'Content-Type': 'text/plain',
            // Overpass asks for a contact; the app's existing proxy already sends
            // one, and reusing it keeps us inside the shared-instance etiquette.
            'User-Agent': 'TransitGuide/1.0 (https://ugnavigator.onrender.com)',
          },
          signal: AbortSignal.timeout(OVERPASS_HTTP_TIMEOUT_MS),
        });

        if (response.ok) return await response.json();

        if (response.status === 429) {
          // Exponential backoff, same shape as the browser proxy.
          const wait = Math.min(2000 * Math.pow(2, attempt), 16000);
          console.warn(`[GraphSync] Rate limited (429) on ${new URL(endpoint).host}, waiting ${wait}ms`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }

        const text = await response.text().catch(() => '');
        console.warn(`[GraphSync] ${new URL(endpoint).host} HTTP ${response.status}: ${text.slice(0, 200)}`);
        break; // non-retryable for this endpoint; try the next one
      } catch (err) {
        console.warn(`[GraphSync] ${new URL(endpoint).host} attempt ${attempt + 1}: ${err.name}: ${err.message}`);
      }
    }
  }
  return null;
}

/**
 * Turn an Overpass element list into edge rows.
 *
 * Exported for tests: the geometry/segment logic is the part most likely to be
 * subtly wrong (mirrored coordinates, off-by-one on the last node) and is worth
 * asserting directly rather than only through a live HTTP round trip.
 */
export function parseOverpassElements(elements) {
  // `elements` is third-party data. A null or non-object entry is skipped rather
  // than dereferenced: Overpass can emit a partially-formed element alongside a
  // remark on a timed-out or rate-limited response, and a single `el.type` on
  // null would throw out of the whole sync, turning a partially-good response
  // into a 500 with nothing written.
  const list = Array.isArray(elements) ? elements.filter((el) => el && typeof el === 'object') : [];

  // Index every node first. `out skel qt` returns nodes with lat/lon, and ways
  // reference them only by id, so a node present in a way but absent from the
  // response is a way we cannot geometrically place.
  //
  // lat/lon are checked with isFinite rather than truthiness so that a node at
  // 0,0 is kept (it is a legitimate coordinate) but a node with null, undefined
  // or a string coordinate is dropped instead of poisoning the geometry.
  const nodesById = new Map();
  for (const el of list) {
    if (el.type !== 'node') continue;
    if (el.id === undefined || el.id === null) continue;
    if (Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
      nodesById.set(String(el.id), { lat: el.lat, lng: el.lon });
    }
  }

  const edges = [];
  let waysSeen = 0;
  let waysSkippedNoGeometry = 0;
  let segmentsSkippedNoNode = 0;
  let segmentsSkippedTooShort = 0;
  let truncated = false;

  for (const el of list) {
    if (el.type !== 'way') continue;
    if (!el.tags?.highway) continue;
    if (!Array.isArray(el.nodes) || el.nodes.length < 2) continue;

    waysSeen++;
    const tags = el.tags;

    for (let i = 0; i < el.nodes.length - 1; i++) {
      if (edges.length >= MAX_EDGES_PER_SYNC) { truncated = true; break; }

      const fromId = String(el.nodes[i]);
      const toId = String(el.nodes[i + 1]);
      const from = nodesById.get(fromId);
      const to = nodesById.get(toId);

      if (!from || !to) { segmentsSkippedNoNode++; continue; }

      const distance = haversineMetres(from.lat, from.lng, to.lat, to.lng);

      // Sub-0.5m segments are almost always a duplicated or co-located node pair
      // from OSM. They are kept out of the table because a near-zero-cost edge
      // lets A* take a meaningless shortcut through a junction, and because
      // they are a large share of the row count in dense areas.
      if (distance < 0.5) { segmentsSkippedTooShort++; continue; }

      edges.push({
        // Segment-scoped key: one way produces many rows, so the way id alone
        // cannot be the conflict target.
        osm_id: `${el.id}:${i}`,
        from_node_id: fromId,
        to_node_id: toId,
        distance_m: distance,
        highway_type: tags.highway,
        surface: tags.surface ?? null,
        // `lit` is a bare tag in OSM with no meaningful value — the presence of
        // the key is the whole signal. Coerced to a boolean so the column is
        // actually usable in a query rather than a pile of empty strings.
        lit: 'lit' in tags ? true : false,
        sidewalk: tags.sidewalk ?? null,
        // incline comes through as text ("5", "5%", "-3.1"); keep the raw text
        // and let the cost function parse. Parsing here would silently drop
        // values it did not recognise, which is how a real incline becomes a
        // null and then an UNKNOWN_INCLINE penalty.
        incline: tags.incline ?? null,
        fromLat: from.lat,
        fromLng: from.lng,
        toLat: to.lat,
        toLng: to.lng,
        isOnCampus: isOnCampus(from.lat, from.lng),
      });
    }

    if (truncated) break;
  }

  return {
    edges,
    stats: {
      waysSeen,
      waysSkippedNoGeometry,
      segmentsSkippedNoNode,
      segmentsSkippedTooShort,
      nodeCount: nodesById.size,
      truncated,
    },
  };
}

/**
 * Ensure the target table exists.
 *
 * Called on every sync. It is cheap (IF NOT EXISTS), and it removes the
 * requirement that someone remembers to run a migration before the endpoint
 * works — which is the usual reason an ingestion endpoint 500s on first call.
 *
 * @returns {Promise<{withGeometry: boolean}>} whether the `geom` column is
 * present and writable. This is returned rather than inferred from `isPostgres`
 * because the geom column is conditional on the PostGIS extension actually being
 * installed: on a PostgreSQL database without PostGIS the table is created and
 * populated perfectly well, just without a geometry column. Assuming
 * `isPostgres => has geometry` makes every sync fail with 42703 undefined_column
 * on exactly the database that most needs a fallback.
 */
async function ensureTable() {
  if (isPostgres) {
    // geom only exists when PostGIS does, and the whole block is skipped
    // otherwise rather than aborting — same guard as accessibility_reports.
    //
    // The coordinate columns and is_on_campus are in the CREATE TABLE (not added
    // by ALTER) because the reader in routingContext.js filters on all three on
    // every request. A reader that has to cope with the column being missing is a
    // reader that can return an empty graph for a reason unrelated to the data.
    await query(`
      CREATE TABLE IF NOT EXISTS public.pedestrian_edges (
        id            BIGSERIAL PRIMARY KEY,
        osm_id        TEXT NOT NULL UNIQUE,
        from_node_id  TEXT NOT NULL,
        to_node_id    TEXT NOT NULL,
        distance_m    DOUBLE PRECISION NOT NULL,
        highway_type  TEXT,
        surface       TEXT,
        lit           BOOLEAN DEFAULT FALSE,
        sidewalk      TEXT,
        incline       TEXT,
        from_lat      DOUBLE PRECISION NOT NULL,
        from_lng      DOUBLE PRECISION NOT NULL,
        to_lat        DOUBLE PRECISION NOT NULL,
        to_lng        DOUBLE PRECISION NOT NULL,
        is_on_campus  BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Backfill BEFORE the indexes. The campus index in particular is built on
    // is_on_campus and the coordinate columns; on a legacy table those do not
    // exist yet, and CREATE INDEX would fail before backfillDerivedColumns ever
    // got to add them — leaving the table unindexed and the migration half-done
    // with the same 42703/`no such column` error every sync after that. The
    // backfill makes the column set match the CREATE TABLE shape first, then the
    // indexes are safe to build.
    await backfillDerivedColumns('public.pedestrian_edges');

    await query(`CREATE INDEX IF NOT EXISTS idx_pedestrian_edges_from ON public.pedestrian_edges (from_node_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pedestrian_edges_to   ON public.pedestrian_edges (to_node_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pedestrian_edges_type ON public.pedestrian_edges (highway_type)`);
    // The campus branch is `WHERE is_on_campus = TRUE` over the whole campus, so
    // it is a pure equality scan — a partial index on the campus rows keeps it
    // off the full table.
    await query(`CREATE INDEX IF NOT EXISTS idx_pedestrian_edges_campus
                   ON public.pedestrian_edges (is_on_campus) WHERE is_on_campus`);

    return { withGeometry: await ensurePostgisGeometry() };
  }

  // SQLite: no geometry type, no ON CONFLICT DO UPDATE with an EXCLUDED-list
  // difference (SQLite does support it, but BOOLEAN/TIMESTAMPTZ types do not
  // exist). text/real/integer are the portable types.
  await query(`
    CREATE TABLE IF NOT EXISTS public_pedestrian_edges (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      osm_id        TEXT NOT NULL UNIQUE,
      from_node_id  TEXT NOT NULL,
      to_node_id    TEXT NOT NULL,
      distance_m    REAL NOT NULL,
      highway_type  TEXT,
      surface       TEXT,
      lit           INTEGER DEFAULT 0,
      sidewalk      TEXT,
      incline       TEXT,
      from_lat      REAL NOT NULL,
      from_lng      REAL NOT NULL,
      to_lat        REAL NOT NULL,
      to_lng        REAL NOT NULL,
      is_on_campus  INTEGER NOT NULL DEFAULT 0,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_pedestrian_edges_from ON public_pedestrian_edges (from_node_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pedestrian_edges_to   ON public_pedestrian_edges (to_node_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pedestrian_edges_campus
                 ON public_pedestrian_edges (is_on_campus) WHERE is_on_campus = 1`);

  await backfillDerivedColumns('public_pedestrian_edges');
  return { withGeometry: false };
}

/**
 * Add the derived columns to a table created before they existed, and classify
 * any rows already in it.
 *
 * CREATE TABLE IF NOT EXISTS is a no-op on an existing table, so a database that
 * was synced with the earlier column set keeps the old shape forever and every
 * read that touches from_lat/is_on_campus fails with 42703. The ADD COLUMN calls
 * are therefore necessary, not defensive.
 *
 * Rows written before is_on_campus existed default to FALSE, which would file the
 * entire campus graph under the external bucket and leave the campus branch
 * empty. The backfill reclassifies them from the coordinates that were always
 * stored in geom — or, with no geometry, from the row's own endpoints.
 */
/**
 * List the columns a table already has.
 *
 * Needed because `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is PostgreSQL-only
 * syntax (9.6+). SQLite has no such clause and rejects the statement outright
 * with `near "EXISTS": syntax error` — so a shared code path that issues it
 * fails on every dialect except the one it was written for.
 *
 * SQLite has no information_schema either, so the probe is a table-valued
 * pragma function: `pragma_table_info('t')` returns one row per column with the
 * name in `name`. It is selected via a SELECT rather than a bare PRAGMA because
 * config/db.js decides between rows and changes by looking at whether the
 * statement starts with SELECT/WITH — a bare `PRAGMA` would be sent down the
 * non-row path and silently return no rows at all.
 *
 * @returns {Promise<Set<string>>} column names; empty if the table cannot be read.
 */
async function existingColumnNames(table) {
  try {
    if (isPostgres) {
      // `table` arrives schema-qualified ('public.pedestrian_edges'), but
      // information_schema.columns stores the BARE table name. Passing the
      // qualified string as the `table_name` value matches nothing — the probe
      // always returned an empty set — so backfillDerivedColumns re-ALTERed the
      // four coordinate columns that CREATE TABLE had just made, and every sync
      // failed on the first one with 42701 duplicate_column.
      const bare = table.slice(table.lastIndexOf('.') + 1);
      const r = await query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ?`,
        [bare]
      );
      return new Set((r?.rows ?? []).map((x) => x.column_name));
    }
    // `table` is one of two string constants chosen by isPostgres, never request
    // input, so interpolating it into the pragma call is safe.
    const r = await query(`SELECT name FROM pragma_table_info('${table}')`);
    return new Set((r?.rows ?? []).map((x) => x.name));
  } catch {
    // Unreadable table. Returning an empty set lets the ALTERs below run and fail
    // with the real error rather than having the probe's error mask it.
    return new Set();
  }
}

/**
 * The campus reclassification UPDATE, as a testable string builder.
 *
 * Exported for the same reason buildInsertSql is: this statement is the single
 * most dialect-fragile piece of the migration, it can only be executed for real
 * against a live PostgreSQL, and it is impossible to assert anything about an
 * inline template literal. Splitting it out lets the test suite verify the CASE
 * typing rules that broke production.
 *
 * @returns {{sql: string, params: number[]}}
 */
export function buildCampusReclassificationSql(table) {
  // ── Dialect-correct CASE typing ─────────────────────────────────────────────
  // This statement has two layers with two DIFFERENT result types, and getting
  // either wrong fails the whole statement:
  //
  //   outer  CASE  -> a flag stored in is_on_campus. Boolean on PostgreSQL,
  //                  integer on SQLite.
  //   inner  CASEs -> each yields a 0/1 COUNT, and those four are summed.
  //
  // The original form was `THEN 0 ELSE (sum) >= 4 END`, which fails at PLAN time
  // on PostgreSQL with 42804 "CASE types integer and boolean cannot be matched" —
  // even against an empty table, and even though SQLite accepts it happily. That
  // asymmetry is why it passed the local suite and would have failed every single
  // production sync.
  //
  // Swapping the literals to TRUE/FALSE fixes that outer mismatch but breaks the
  // inner sum instead: PostgreSQL has no `boolean + boolean` operator, so
  // `TRUE + TRUE` fails with 42883 undefined_function. The two layers cannot share
  // a literal set, which is exactly why one literal set was not enough.
  //
  // So: inner branches are integer literals on BOTH dialects (`1`/`0` are the same
  // tokens in both), and only the single outer branch carries the dialect-specific
  // flag literal. The outer CASE is therefore boolean throughout on PostgreSQL,
  // and the inner sum is integer throughout on both.
  //
  // The NULL guard also prevents `NULL >= 4` from propagating: on a legacy row
  // with NULL to_lat, the sum is NULL, `NULL >= 4` is NULL, and the column would
  // be set to NULL — invisible in a read that filters `is_on_campus = TRUE`, and
  // it drops the edge from the campus graph for no explainable reason.
  const FLAG_FALSE = 'FALSE';
  const bounds = [
    CAMPUS_BOUNDS.minLat, CAMPUS_BOUNDS.maxLat, CAMPUS_BOUNDS.minLng, CAMPUS_BOUNDS.maxLng,
  ];

  return {
    sql: `
    UPDATE ${table}
       SET is_on_campus = (
         CASE
           WHEN from_lat IS NULL OR from_lng IS NULL
             OR to_lat IS NULL OR to_lng IS NULL THEN ${FLAG_FALSE}
           ELSE (
             (CASE WHEN from_lat BETWEEN ? AND ? THEN 1 ELSE 0 END) +
             (CASE WHEN from_lng BETWEEN ? AND ? THEN 1 ELSE 0 END) +
             (CASE WHEN to_lat   BETWEEN ? AND ? THEN 1 ELSE 0 END) +
             (CASE WHEN to_lng   BETWEEN ? AND ? THEN 1 ELSE 0 END)
           ) >= 4
         END
       )
     WHERE is_on_campus IS NULL
        OR (is_on_campus = ${FLAG_FALSE} AND from_lat IS NOT NULL
            AND from_lat BETWEEN ? AND ? AND from_lng BETWEEN ? AND ?)
  `,
    // Three identical groups, in statement order: the four inner endpoint tests
    // (from_lat, from_lng, to_lat, to_lng), then the two FROM-endpoint tests in
    // the WHERE clause. 8 + 4 = 12 binds. The inner CASE is written first in the
    // statement, so its binds come first; a group count that does not match the
    // placeholder count is a hard error on PostgreSQL.
    params: [...bounds, ...bounds, ...bounds],
  };
}

/**
 * The SQL type for each endpoint coordinate column, per dialect.
 *
 * Exported for tests: the `REAL` on the PostgreSQL side of this map is the exact
 * bug that shipped once already, and a regression there is invisible until a
 * route looks wrong on the live map.
 */
export function coordinateColumnTypes() {
  return {
    from_lat: 'DOUBLE PRECISION',
    from_lng: 'DOUBLE PRECISION',
    to_lat: 'DOUBLE PRECISION',
    to_lng: 'DOUBLE PRECISION',
  };
}

async function backfillDerivedColumns(table) {
  const types = coordinateColumnTypes();
  const existing = await existingColumnNames(table);

  if (!existing.has('osm_id')) {
    await query(`ALTER TABLE ${table} ADD COLUMN osm_id TEXT`);
    await query(`UPDATE ${table} SET osm_id = CAST(id AS TEXT) WHERE osm_id IS NULL`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pedestrian_edges_osm_id ON ${table} (osm_id)`);
  }

  for (const col of Object.keys(types)) {
    if (existing.has(col)) continue;
    // Added nullable, without NOT NULL: a NOT NULL column cannot be added to a
    // table that already holds rows and has no default. The backfill below fills
    // them, and every read is written to tolerate NULL on a legacy row.
    await query(`ALTER TABLE ${table} ADD COLUMN ${col} ${types[col]}`);
  }

  if (!existing.has('is_on_campus')) {
    // DEFAULT only, no NOT NULL: a NOT NULL column cannot be added to a table that
    // already holds rows, and the backfill below is what fills the legacy ones.
    await query(`ALTER TABLE ${table} ADD COLUMN is_on_campus ${isPostgres ? 'BOOLEAN' : 'INTEGER'} DEFAULT ${isPostgres ? 'FALSE' : '0'}`);
  }

  // Recover endpoints from geom where available. ST_X/ST_Y on a LineString
  // return the coordinates of its first point, and the last point needs
  // ST_GeometryN(geom, 2) for a two-point segment.
  if (isPostgres) {
    try {
      await query(`
        UPDATE public.pedestrian_edges
           SET from_lng = COALESCE(from_lng, ST_X(geom)),
               from_lat = COALESCE(from_lat, ST_Y(geom)),
               to_lng   = COALESCE(to_lng,   ST_X(ST_GeometryN(geom, 2))),
               to_lat   = COALESCE(to_lat,   ST_Y(ST_GeometryN(geom, 2)))
         WHERE geom IS NOT NULL
           AND (from_lat IS NULL OR to_lat IS NULL)
      `);
    } catch (err) {
      // No PostGIS: the coordinates cannot be recovered from a non-existent
      // column, so legacy rows simply keep NULL and are excluded by the
      // NULL-safe filters. Not fatal, but worth saying out loud.
      console.warn(`[GraphSync] Could not backfill coordinates from geom (${err?.code}); legacy rows keep NULL`);
    }
  }

  const { sql, params } = buildCampusReclassificationSql(table);
  await query(sql, params);
}

/** Add the PostGIS geometry column and its GIST index, if PostGIS is present. */
async function ensurePostgisGeometry() {
  try {
    // NOT a DO/RAISE NOTICE block: the extension check has to happen in
    // JavaScript to decide whether the INSERT can reference geom at all, and
    // a DO block that silently skips the ALTER leaves no signal on this side.
    const ext = await query(
      `SELECT 1 FROM pg_extension WHERE extname = 'postgis' LIMIT 1`
    );
    const hasPostgis = ext?.rows?.length > 0;

    if (!hasPostgis) {
      console.warn('[GraphSync] PostGIS not installed: syncing without geom (bbox pruning unavailable)');
      return false;
    }

    await query(`
      ALTER TABLE public.pedestrian_edges
        ADD COLUMN IF NOT EXISTS geom geometry(LineString, 4326)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_pedestrian_edges_geom
        ON public.pedestrian_edges USING GIST (geom)
    `);
    return true;
  } catch (err) {
    // 42883 undefined_function, or 42703 if the column exists but PostGIS is
    // absent. The table and its data are still good; only the geometry column
    // is missing, so this must not abort the sync.
    console.warn(`[GraphSync] PostGIS geometry column unavailable (${err?.code}): continuing without geom`);
    return false;
  }
}

/**
 * Compile a region into the edge table.
 *
 * @param {number} minLat
 * @param {number} minLng
 * @param {number} maxLat
 * @param {number} maxLng
 * @returns {Promise<{ok: boolean, error?: string, source?: string,
 *                    waysFetched?: number, edgesParsed?: number,
 *                    edgesInserted?: number, batches?: number, stats?: object}>}
 */
export async function syncSpatialGraphRegion(minLat, minLng, maxLat, maxLng) {
  const validated = validateBbox(minLat, minLng, maxLat, maxLng);
  if (!validated.ok) {
    // Returned rather than thrown: this is a caller-input problem, and the route
    // turns it into a 400. Throwing here would surface as a 500 and imply the
    // ingestion pipeline is broken when it is behaving correctly.
    return { ok: false, error: validated.error };
  }

  const { bbox } = validated;
  const started = Date.now();
  const region = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`;
  console.log(`[GraphSync] Compiling region ${region}`);

  let payload;
  try {
    payload = await fetchOverpass(buildOverpassQuery(bbox));
  } catch (err) {
    return { ok: false, error: `Overpass request failed: ${err?.message || 'unknown'}` };
  }

  if (!payload) {
    // Every endpoint and retry was exhausted. Not the same as "empty region" —
    // an empty region is a successful fetch with zero ways, and collapsing the
    // two would make an outage look like a successfully synced blank area.
    return { ok: false, error: 'Overpass API unavailable - all endpoints exhausted' };
  }

  const elements = Array.isArray(payload.elements) ? payload.elements : [];
  const { edges, stats } = parseOverpassElements(elements);

  console.log(
    `[GraphSync] Region ${region}: ${stats.waysSeen} ways -> ${edges.length} edges ` +
    `(${stats.segmentsSkippedTooShort} sub-0.5m skipped, ${stats.segmentsSkippedNoNode} missing-node skipped)`
  );

  // Zero edges is a legitimate answer for a region with no pedestrian ways, and
  // the table is already correct for it. Returning ok:true with 0 is what lets a
  // caller distinguish "nothing to add" from "the fetch failed".
  if (edges.length === 0) {
    return {
      ok: true,
      source: 'overpass',
      region,
      waysFetched: stats.waysSeen,
      edgesParsed: 0,
      edgesInserted: 0,
      batches: 0,
      stats,
      elapsedMs: Date.now() - started,
    };
  }

  let withGeometry = false;
  try {
    ({ withGeometry } = await ensureTable());
  } catch (err) {
    return { ok: false, error: `Could not prepare edge table: ${err?.message || 'unknown'}` };
  }

  // Dialect, not geometry availability — see edgeTableName(). A PostgreSQL
  // database without PostGIS has no geom column but still writes here.
  const table = edgeTableName();
  let edgesInserted = 0;
  let batches = 0;

  for (let offset = 0; offset < edges.length; offset += UPSERT_BATCH_SIZE) {
    const batch = edges.slice(offset, offset + UPSERT_BATCH_SIZE);
    const params = [];

    for (const e of batch) {
      params.push(
        e.osm_id,
        e.from_node_id,
        e.to_node_id,
        e.distance_m,
        e.highway_type,
        e.surface,
        e.lit,
        e.sidewalk,
        e.incline,
        // Coordinates are written on every dialect, not only where geom exists.
        // They are what makes a spatial slice possible on SQLite and on
        // PostgreSQL-without-PostGIS, and writing them only under `withGeometry`
        // would leave those readers with nothing to filter on.
        e.fromLat,
        e.fromLng,
        e.toLat,
        e.toLng,
        // Classified from the segment's own endpoints, not the bbox being synced:
        // an edge that merely crosses into the campus box is not campus network.
        // A segment whose endpoints agree is unambiguous; one that straddles the
        // boundary is classified on its FROM endpoint so the answer is stable
        // across re-syncs rather than flipping with a node reordering.
        e.isOnCampus,
      );

      if (withGeometry) {
        // Four binds, one per ST_MakePoint(x, y) placeholder, in the order the
        // SQL reads them: fromLng, fromLat, toLng, toLat. Longitude first —
        // PostGIS x is longitude, and a swap renders a plausible but mirrored
        // line rather than erroring.
        params.push(e.fromLng, e.fromLat, e.toLng, e.toLat);
      }
    }

    try {
      // Rebuilt per batch so the placeholder count matches `batch.length` exactly.
      await query(buildInsertSql({ withGeometry, rowCount: batch.length, table }), params);
      edgesInserted += batch.length;
      batches++;
    } catch (err) {
      // Postgres aborts the whole transaction on a bad row, so a single
      // malformed batch loses all of it. Reporting which batch failed, and how
      // many already committed, is what makes this recoverable rather than a
      // black box.
      console.error(`[GraphSync] Batch ${batches + 1} failed after ${edgesInserted} edges:`, err?.message);
      return {
        ok: false,
        error: `Upsert failed on batch ${batches + 1}: ${err?.message || 'unknown'}`,
        source: 'overpass',
        region,
        waysFetched: stats.waysSeen,
        edgesParsed: edges.length,
        edgesInserted,
        batches,
        stats,
        elapsedMs: Date.now() - started,
      };
    }
  }

  console.log(
    `[GraphSync] Region ${region}: ${edgesInserted} edges in ${batches} batch(es) ` +
    `in ${Date.now() - started}ms (dialect: ${isPostgres ? 'postgresql' : 'sqlite'}, geom: ${withGeometry})`
  );

  return {
    ok: true,
    source: 'overpass',
    region,
    table,
    waysFetched: stats.waysSeen,
    edgesParsed: edges.length,
    edgesInserted,
    batches,
    withGeometry,
    truncated: stats.truncated,
    stats,
    elapsedMs: Date.now() - started,
  };
}

/**
 * Remove rows whose geometry falls outside a synced region.
 *
 * Not called by syncSpatialGraphRegion on purpose. A sync that deletes as it
 * writes will, if the Overpass fetch is partial (timeout mid-response, an
 * endpoint returning a truncated set), erase good data for the parts of the
 * region that happened to come back fine. Pruning has to be a separate,
 * explicit, admin-initiated action that runs only after a complete sync.
 */
export async function pruneRegion(minLat, minLng, maxLat, maxLng) {
  const validated = validateBbox(minLat, minLng, maxLat, maxLng);
  if (!validated.ok) return { ok: false, error: validated.error };

  const { bbox } = validated;

  if (!isPostgres) {
    // SQLite has no geometry, so a bbox delete has to fall back to a
    // coordinate test. The endpoints are not stored as columns, so this can only
    // be a conservative no-op rather than a wrong delete.
    console.warn('[GraphSync] pruneRegion on SQLite is a no-op (no geometry column stored)');
    return { ok: true, deleted: 0, note: 'no-op on SQLite' };
  }

  try {
    await query(
      `DELETE FROM public.pedestrian_edges
        WHERE geom IS NOT NULL
          AND NOT ST_Intersects(geom, ST_MakeEnvelope(?, ?, ?, ?, 4326))`,
      [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat]
    );
    return { ok: true, deleted: true };
  } catch (err) {
    return { ok: false, error: `Prune failed: ${err?.message || 'unknown'}` };
  }
}
