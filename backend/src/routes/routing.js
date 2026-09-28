// backend/src/routes/routing.js
//
// Routing context endpoint. Public and unauthenticated by design: the frontend
// calls it on startup, before a session exists, to decide whether to enforce
// on-campus GPS constraints.

import express from 'express';
import { getRoutingContext, getSpatialGraphSlice } from '../services/routingContext.js';

const router = express.Router();

/**
 * Validate a lat/lng pair from either req.query or req.body.
 *
 * Shared by both endpoints so they cannot drift on what counts as a valid
 * coordinate. Returns null when valid, or a reason string when not.
 */
function validateLatLng(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);

  const latMissing = lat === undefined || lat === null || lat === '';
  const lngMissing = lng === undefined || lng === null || lng === '';

  if (latMissing || lngMissing) return 'lat and lng are required';
  if (!Number.isFinite(parsedLat) || parsedLat < -90 || parsedLat > 90) return 'lat must be -90..90';
  if (!Number.isFinite(parsedLng) || parsedLng < -180 || parsedLng > 180) return 'lng must be -180..180';

  return null;
}

// ============================================
// GET /api/routing/context?lat=...&lng=...
// ============================================
//
// Returns { insideSandbox, source }.
//
// `source` is diagnostic, not a hint: 'rpc' is a real answer, while
// 'sqlite-development-default', 'outside-bbox', 'rpc-unavailable' and
// 'unrecognised-rpc-shape' all mean "no, we could not confirm you are on
// campus". The frontend should branch on `insideSandbox` alone; surfacing the
// reason is for debugging a misbehaving geofence, not for changing behaviour.
router.get('/context', async (req, res) => {
  const { lat, lng } = req.query;

  // Reject out-of-range and unparseable coordinates as a client error. Silently
  // coercing these to `false` would be worse than a 400 here: the user is
  // standing somewhere the app cannot locate, and a 400 is honest about that,
  // whereas `insideSandbox: false` reads as a confident "you are not on campus".
  const invalid = validateLatLng(lat, lng);
  if (invalid) {
    return res.status(400).json({ error: 'Valid lat and lng query parameters are required', detail: invalid });
  }

  try {
    const context = await getRoutingContext(Number(lat), Number(lng));
    return res.status(200).json(context);
  } catch (err) {
    // getRoutingContext is written not to throw. This is a genuine unexpected
    // failure, so log it loudly — but still answer with the safe default rather
    // than a 5xx, because the frontend treats a failed context check as "not on
    // campus" and stays usable either way.
    console.error('[RoutingContext] Unexpected error:', err);
    return res.status(200).json({ insideSandbox: false, source: 'error-default' });
  }
});

// ============================================
// GET /api/routing/graph-slice?lat=...&lng=...
// ============================================
//
// Adaptive geofenced slicing. Returns the graph the browser should route over,
// plus the context flags that decide how it is costed:
//
//   CAMPUS_SANDBOX     enforceGpsTracking: true   — whole campus graph
//   EXTERNAL_TESTING   enforceGpsTracking: false  — 2km box around the user
//
// A successful response with an EMPTY graph is a normal outcome, not an error:
// it means either local SQLite dev, or the edge tables are not loaded yet. The
// frontend treats it as "build from Overpass instead", which is the behaviour
// that existed before this endpoint. So this always answers 200 and puts the
// reason in `source` — a 5xx here would make the client discard a perfectly
// usable fallback signal.
router.get('/graph-slice', async (req, res) => {
  const { lat, lng } = req.query;

  const invalid = validateLatLng(lat, lng);
  if (invalid) {
    return res.status(400).json({ error: 'Valid lat and lng query parameters are required', detail: invalid });
  }

  try {
    const slice = await getSpatialGraphSlice(Number(lat), Number(lng));
    return res.status(200).json(slice);
  } catch (err) {
    console.error('[GraphSlice] Unexpected error:', err);
    return res.status(200).json({
      sandboxContext: 'EXTERNAL_TESTING',
      enforceGpsTracking: false,
      graph: { nodes: {}, edges: [] },
      source: 'error-default',
    });
  }
});

export default router;
