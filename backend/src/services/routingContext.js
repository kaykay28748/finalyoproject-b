// backend/src/services/routingContext.js
//
// Resolves which routing context a coordinate falls into: the Legon campus
// sandbox, or external testing. A* and Overpass graph building stay in the
// browser — this service only answers the geofence question so the frontend can
// decide whether to enforce on-campus GPS constraints and campus profile
// definitions, or fall back to manual location entry.
//
// This is deliberately NOT a routing engine. It computes no path, reads no edge
// tables, and holds no state. If you are ever tempted to add route logic here,
// it belongs in the frontend graph layer.

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

export const __test__ = { parseCoordinate, coerceBoolean, CAMPUS_BBOX };
