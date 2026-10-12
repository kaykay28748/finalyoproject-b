// backend/src/routes/routing.js
//
// Routing context endpoint. Public and unauthenticated by design: the frontend
// calls it on startup, before a session exists, to decide whether to enforce
// on-campus GPS constraints.

import express from 'express';
import { randomUUID } from 'node:crypto';
import { getRoutingContext, getSpatialGraphSlice } from '../services/routingContext.js';
import { syncSpatialGraphRegion, validateBbox } from '../services/graphSynchronizer.js';

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

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: regional graph compilation
// ─────────────────────────────────────────────────────────────────────────────
//
// Split out from the public router so the admin guards are applied to THIS path
// only. `router.use(requireAdmin)` on the public router would lock out
// /context and /graph-slice, which the frontend calls before a session exists.
//
// The handlers are mounted on their own sub-router in server.js at
// /api/admin/sync-region, so the two files stay separate but the URL is as
// specified.
export const graphSyncRouter = express.Router();
const syncJobs = new Map();
const SYNC_JOB_RETENTION_MS = 60 * 60 * 1000;
const MAX_SYNC_JOBS = 100;
let activeSyncJobId = null;

function cleanSyncJobs() {
  const expiredBefore = Date.now() - SYNC_JOB_RETENTION_MS;
  for (const [jobId, job] of syncJobs) {
    if (job.completedAt && Date.parse(job.completedAt) < expiredBefore) {
      syncJobs.delete(jobId);
    }
  }

  while (syncJobs.size >= MAX_SYNC_JOBS) {
    const completedJobId = [...syncJobs].find(([, job]) => job.completedAt)?.[0];
    if (!completedJobId) return;
    syncJobs.delete(completedJobId);
  }
}

function publicSyncJob(job) {
  return {
    jobId: job.jobId,
    status: job.status,
    region: job.region,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    result: job.result,
    error: job.error,
  };
}

function startSyncJob(job) {
  setImmediate(async () => {
    job.status = 'running';
    job.startedAt = new Date().toISOString();

    try {
      job.result = await syncSpatialGraphRegion(
        job.bbox.minLat,
        job.bbox.minLng,
        job.bbox.maxLat,
        job.bbox.maxLng
      );
      job.status = job.result.ok ? 'succeeded' : 'failed';
      if (!job.result.ok) job.error = job.result.error || 'Regional sync failed';
    } catch (err) {
      job.status = 'failed';
      job.error = err?.message || 'Regional sync failed';
      console.error(`[SyncRegion] Job ${job.jobId} failed:`, err);
    } finally {
      job.completedAt = new Date().toISOString();
      if (activeSyncJobId === job.jobId) activeSyncJobId = null;
    }
  });
}

/**
 * Reject anything that is not a plausible bbox before it reaches the service.
 *
 * Shares validateLatLng's coercion discipline (Number() first, then range) but
 * is a separate function because a bbox has four numbers and two ordering
 * constraints, which a lat/lng pair does not have.
 */
function validateBboxParams(body) {
  const { minLat, minLng, maxLat, maxLng } = body || {};
  const required = { minLat, minLng, maxLat, maxLng };

  for (const [name, value] of Object.entries(required)) {
    if (value === undefined || value === null || value === '') {
      return `Missing required field: ${name}`;
    }
    // Number() rather than a truthiness check: Number('') is 0, which passes a
    // truthiness test and would silently compile a box at the equator.
    if (!Number.isFinite(Number(value))) {
      return `${name} must be a number, got ${JSON.stringify(value)}`;
    }
  }

  const bbox = {
    minLat: Number(minLat), minLng: Number(minLng),
    maxLat: Number(maxLat), maxLng: Number(maxLng),
  };

  if (bbox.minLat < -90 || bbox.maxLat > 90) return 'minLat/maxLat must be within -90..90';
  if (bbox.minLng < -180 || bbox.maxLng > 180) return 'minLng/maxLng must be within -180..180';
  if (bbox.minLat >= bbox.maxLat) return 'minLat must be less than maxLat';
  if (bbox.minLng >= bbox.maxLng) return 'minLng must be less than maxLng';

  return null;
}

// POST /api/admin/sync-region
//
// Starts a background regional import and returns immediately, so slow Overpass
// responses do not exceed client or proxy request timeouts. Poll the returned
// statusUrl to retrieve progress and the final import result.
//
// Deliberately not mounted on the public router and deliberately not
// authenticated here: server.js wraps this sub-router in verifyToken +
// requireAdmin. An unauthenticated write to a shared Overpass instance is an
// abuse vector, and this endpoint costs a third party real capacity.
graphSyncRouter.post('/sync-region', async (req, res) => {
  const invalid = validateBboxParams(req.body);
  if (invalid) {
    return res.status(400).json({ error: invalid });
  }

  const validation = validateBbox(
    req.body.minLat, req.body.minLng, req.body.maxLat, req.body.maxLng
  );
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error });
  }

  cleanSyncJobs();
  if (activeSyncJobId) {
    return res.status(409).json({
      error: 'A regional sync is already running',
      jobId: activeSyncJobId,
      statusUrl: `/api/admin/sync-region/${activeSyncJobId}`,
    });
  }

  const bbox = validation.bbox;
  const jobId = randomUUID();
  const job = {
    jobId,
    status: 'queued',
    bbox,
    region: `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    result: null,
    error: null,
  };

  syncJobs.set(jobId, job);
  activeSyncJobId = jobId;
  startSyncJob(job);

  return res.status(202).json({
    ok: true,
    ...publicSyncJob(job),
    statusUrl: `/api/admin/sync-region/${jobId}`,
    pollAfterMs: 2000,
  });
});

graphSyncRouter.get('/sync-region/:jobId', (req, res) => {
  cleanSyncJobs();
  const job = syncJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Sync job not found or expired' });
  }

  return res.status(200).json({
    ok: job.status === 'succeeded',
    ...publicSyncJob(job),
  });
});

export default router;
