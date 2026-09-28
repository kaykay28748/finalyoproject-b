// backend/src/routes/routing.js
//
// Routing context endpoint. Public and unauthenticated by design: the frontend
// calls it on startup, before a session exists, to decide whether to enforce
// on-campus GPS constraints.

import express from 'express';
import { getRoutingContext } from '../services/routingContext.js';

const router = express.Router();

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
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);

  const latValid = lat !== undefined && lat !== '' && Number.isFinite(parsedLat) && parsedLat >= -90 && parsedLat <= 90;
  const lngValid = lng !== undefined && lng !== '' && Number.isFinite(parsedLng) && parsedLng >= -180 && parsedLng <= 180;

  if (!latValid || !lngValid) {
    return res.status(400).json({
      error: 'Valid lat and lng query parameters are required',
      detail: 'lat must be -90..90 and lng must be -180..180',
    });
  }

  try {
    const context = await getRoutingContext(parsedLat, parsedLng);
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

export default router;
