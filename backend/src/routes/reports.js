// backend/src/routes/reports.js
import express from 'express';
import { query } from '../config/db.js';
import { verifyToken } from '../middleware/auth.js';
// import { sendReportNotification, sendReportResolutionEmail } from '../services/emailService.js';

const router = express.Router();

// =============================================
// POST /api/reports - Submit a new report
// =============================================
router.post('/', verifyToken, async (req, res) => {
  try {
    const { lat, lng, location_name, issue_type, custom_description, severity } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }
    if (!issue_type) {
      return res.status(400).json({ error: 'Issue type is required' });
    }
    if (severity < 1 || severity > 3) {
      return res.status(400).json({ error: 'Severity must be between 1 and 3' });
    }

    const userId = req.user.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Valid user ID not found in token' });
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const parsedSeverity = parseInt(severity, 10);

    const result = await query(
      `INSERT INTO accessibility_reports
         (submitted_by, lat, lng, location_name, issue_type, custom_description, severity, status, created_at)
       VALUES
         (?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
       RETURNING id, submitted_by, lat, lng, location_name, issue_type,
                 custom_description, severity, status, created_at`,
      [userId, parsedLat, parsedLng, location_name || null, issue_type, custom_description || null, parsedSeverity]
    );

    const newReport = result.rows[0];

    // EMAIL DISABLED - Render free tier blocks SMTP
    // Notify admin would happen here, but skipped for now
    console.log('[Reports] Report #', newReport.id, 'submitted by user:', userId);
    console.log('[Reports] Email notification skipped (SMTP blocked on Render free tier)');

    res.status(201).json({
      success: true,
      message: 'Report submitted successfully. Admin will review it shortly.',
      report: newReport,
    });

  } catch (error) {
    console.error('[Reports] Submit error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit report' });
  }
});

// =============================================
// GET /api/reports/mine - Get current user's reports
// =============================================
router.get('/mine', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Valid user ID not found' });
    }

    const { limit = 50, offset = 0 } = req.query;

    const result = await query(
      `SELECT id, submitted_by, lat, lng, location_name, issue_type,
              custom_description, severity, status, admin_notes,
              reviewed_by, reviewed_at, created_at, updated_at
       FROM accessibility_reports
       WHERE submitted_by = ? AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, parseInt(limit, 10), parseInt(offset, 10)]
    );

    res.json({ success: true, reports: result.rows });

  } catch (error) {
    console.error('[Reports] Fetch mine error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// GET /api/reports/approved - Public: active reports for routing/map
// =============================================
router.get('/approved', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, lat, lng, location_name, issue_type,
              custom_description, severity, status, created_at
       FROM accessibility_reports
       WHERE status = 'approved' AND deleted_at IS NULL
       ORDER BY created_at DESC`
    );

    res.json({ success: true, reports: result.rows });

  } catch (error) {
    console.error('[Reports] Fetch approved error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// GET /api/reports/decision-feed - Public: verdicts consumed by routing.
// Part B (REPORT_LIFECYCLE.md): the client consumes verdicts, never raw reports.
// =============================================
const VERDICT_SIGNALS = {
  // Confidence per corroborating confirmation (cap prevents confirmation-sybil).
  CONFIRMATION_CONFIDENCE: 0.15,
  CONFIRMATION_CONFIDENCE_CAP: 0.75,
  // Credit for a reporter's outcome history (B.6.7): reputation ∈ 0..1.
  REPUTATION_CONFIDENCE: 0.2,
  DECAY_WINDOW_DAYS: 30,
};

function computeReportVerdict(report, confirmers, reporterReputation = 1) {
  const now = Date.now();
  const created = new Date(report.created_at).getTime();
  const expiresAt = new Date(created + VERDICT_SIGNALS.DECAY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Admin approval short-circuits confidence to 1.0; corroborations + reputation
  // add up to 0.95 without a human review (B.2 reference table).
  const corroborationConfidence =
    Math.min(confirmers * VERDICT_SIGNALS.CONFIRMATION_CONFIDENCE, VERDICT_SIGNALS.CONFIRMATION_CONFIDENCE_CAP);
  const confidence = report.status === 'approved'
    ? 1.0
    : Math.min(1, corroborationConfidence + VERDICT_SIGNALS.REPUTATION_CONFIDENCE * (reporterReputation ?? 1));

  const isConstructionBlock = report.issue_type === 'construction' && report.severity === 3;

  let verdict = 'ignore';
  let penalty = 1.0;
  if (isConstructionBlock && confidence >= 0.7) {
    verdict = 'block';
    penalty = 9999;
  } else if (report.severity >= 2 && confidence >= 0.4) {
    verdict = 'avoid';
    const maxMultiplier = report.severity === 3 ? 3.0 : 2.0;
    penalty = 1 + (maxMultiplier - 1) * confidence;
  }

  return {
    id: report.id,
    issue_type: report.issue_type,
    severity: report.severity,
    lat: report.lat,
    lng: report.lng,
    location_name: report.location_name,
    verdict,
    confidence: Math.round(confidence * 100) / 100,
    confirmers,
    penalty: Math.round(penalty * 100) / 100,
    reputation: reporterReputation ?? 1,
    decided_at: report.reviewed_at || report.updated_at || report.created_at,
    expires_at: expiresAt.toISOString(),
  };
}

router.get('/decision-feed', async (req, res) => {
  try {
    const result = await query(
      `SELECT ar.id, ar.issue_type, ar.severity, ar.status, ar.lat, ar.lng, ar.location_name,
              ar.reviewed_at, ar.updated_at, ar.created_at,
              u.reputation AS reporter_reputation,
              COUNT(DISTINCT rc.user_id) AS confirmers
       FROM accessibility_reports ar
       LEFT JOIN report_confirmations rc ON rc.report_id = ar.id
       LEFT JOIN users u ON u.id = ar.submitted_by AND u.deleted_at IS NULL
       WHERE ar.status = 'approved' AND ar.deleted_at IS NULL
       GROUP BY ar.id, u.reputation
       ORDER BY ar.created_at DESC`
    );

    // Only verdicts that can change a route leave this feed ("ignore" is dropped).
    const reports = result.rows
      .map((r) => computeReportVerdict(r, r.confirmers, r.reporter_reputation))
      .filter((r) => r.verdict !== 'ignore');

    res.set('Cache-Control', 'public, max-age=30');
    res.json({ success: true, reports, generated_at: new Date().toISOString() });

  } catch (error) {
    console.error('[Reports] Decision feed error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// POST /api/reports/:id/confirm - User: GPS-stamped community confirmation.
// Part B (B.6.7): corroborating confirmations feed the confidence formula.
// =============================================
const CONFIRM_PROXIMITY_METERS = 80;

router.post('/:id/confirm', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = parseInt(req.params.id, 10);

    if (!userId || isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    const { lat, lng, accuracy } = req.body ?? {};
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'GPS coordinates required to confirm' });
    }

    const reportResult = await query(
      `SELECT id, lat, lng, status FROM accessibility_reports
       WHERE id = ? AND deleted_at IS NULL`,
      [reportId]
    );
    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = reportResult.rows[0];

    // Physical-presence proof: a confirmation must come from near the report.
    const R = 6371000;
    const dLat = (report.lat - lat) * Math.PI / 180;
    const dLng = (report.lng - lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat * Math.PI / 180) * Math.cos(report.lat * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    const distMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (distMeters > CONFIRM_PROXIMITY_METERS) {
      return res.status(400).json({
        error: `Confirmation must be within ${CONFIRM_PROXIMITY_METERS}m of the report`,
      });
    }

    const existing = await query(
      'SELECT id FROM report_confirmations WHERE report_id = ? AND user_id = ?',
      [reportId, userId]
    );
    const alreadyConfirmed = existing.rows.length > 0;

    if (!alreadyConfirmed) {
      await query(
        `INSERT INTO report_confirmations (report_id, user_id, lat, lng, accuracy)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(report_id, user_id) DO NOTHING`,
        [reportId, userId, lat, lng, typeof accuracy === 'number' ? accuracy : null]
      );
    }

    const count = await query(
      'SELECT COUNT(*) AS confirmers FROM report_confirmations WHERE report_id = ?',
      [reportId]
    );

    res.json({
      success: true,
      id: reportId,
      alreadyConfirmed,
      confirmers: count.rows[0]?.confirmers ?? 1,
    });

  } catch (error) {
    console.error('[Reports] Confirm error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// GET /api/reports/clusters - Admin: grouped reports by proximity + issue type
// =============================================
router.get('/clusters', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Valid user ID not found' });
    }

    // Dev-mode bypass: mock tokens are treated as admin
    if (process.env.NODE_ENV !== 'production' && userId === '00000000-0000-0000-0000-000000000000') {
      // skip DB check
    } else {
      const userCheck = await query(
        'SELECT is_admin FROM users WHERE id = ? AND deleted_at IS NULL',
        [userId]
      );
      if (!userCheck.rows[0]?.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }

    // Fetch all non-deleted reports
    const result = await query(
      `SELECT id, submitted_by, lat, lng, location_name, issue_type,
              custom_description, severity, status, admin_notes,
              reviewed_by, reviewed_at, created_at, updated_at
       FROM accessibility_reports
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`
    );

    const reports = result.rows;

    // Cluster by proximity (~30m) + same issue_type
    const CLUSTER_RADIUS_M = 30;
    const R = 6371000;
    const clusters = [];
    const assigned = new Set();

    for (let i = 0; i < reports.length; i++) {
      if (assigned.has(reports[i].id)) continue;

      const cluster = {
        reports: [reports[i]],
        issue_type: reports[i].issue_type,
        lat: reports[i].lat,
        lng: reports[i].lng,
        location_name: reports[i].location_name,
      };
      assigned.add(reports[i].id);

      for (let j = i + 1; j < reports.length; j++) {
        if (assigned.has(reports[j].id)) continue;
        if (reports[j].issue_type !== reports[i].issue_type) continue;

        const dLat = (reports[j].lat - reports[i].lat) * Math.PI / 180;
        const dLng = (reports[j].lng - reports[i].lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(reports[i].lat * Math.PI / 180) * Math.cos(reports[j].lat * Math.PI / 180) *
          Math.sin(dLng / 2) ** 2;
        const distMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        if (distMeters <= CLUSTER_RADIUS_M) {
          cluster.reports.push(reports[j]);
          assigned.add(reports[j].id);
        }
      }

      // Compute cluster metadata
      const severities = cluster.reports.map(r => r.severity);
      const statuses = cluster.reports.map(r => r.status);
      const dateCreated = cluster.reports.map(r => new Date(r.created_at).getTime());

      cluster.id = `cluster-${cluster.reports[0].id}`;
      cluster.report_count = cluster.reports.length;
      cluster.avg_severity = parseFloat((severities.reduce((a, b) => a + b, 0) / severities.length).toFixed(1));
      cluster.max_severity = Math.max(...severities);
      cluster.first_reported = new Date(Math.min(...dateCreated)).toISOString();
      cluster.latest_reported = new Date(Math.max(...dateCreated)).toISOString();
      cluster.open_count = statuses.filter(s => s === 'pending').length;
      cluster.approved_count = statuses.filter(s => s === 'approved').length;
      cluster.resolved_count = statuses.filter(s => s === 'resolved').length;
      cluster.rejected_count = statuses.filter(s => s === 'rejected').length;
      cluster.all_resolved = statuses.every(s => s === 'resolved' || s === 'rejected');
      cluster.all_approved = statuses.every(s => s === 'approved');

      // Weighted lat/lng (average of all reports)
      cluster.lat = cluster.reports.reduce((sum, r) => sum + parseFloat(r.lat), 0) / cluster.reports.length;
      cluster.lng = cluster.reports.reduce((sum, r) => sum + parseFloat(r.lng), 0) / cluster.reports.length;

      clusters.push(cluster);
    }

    // Sort clusters: most reports first, then by latest report date
    clusters.sort((a, b) => b.report_count - a.report_count || new Date(b.latest_reported) - new Date(a.latest_reported));

    res.json({ success: true, clusters });

  } catch (error) {
    console.error('[Reports] Clusters error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// PATCH /api/reports/cluster/resolve - Admin: bulk resolve a cluster
// =============================================
router.post('/cluster/resolve', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { report_ids, status, admin_notes } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Valid user ID not found' });
    }
    if (!Array.isArray(report_ids) || report_ids.length === 0) {
      return res.status(400).json({ error: 'report_ids array is required' });
    }
    if (!['approved', 'rejected', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Dev-mode bypass
    if (process.env.NODE_ENV !== 'production' && userId === '00000000-0000-0000-0000-000000000000') {
      // skip DB check
    } else {
      const userCheck = await query(
        'SELECT is_admin FROM users WHERE id = ? AND deleted_at IS NULL',
        [userId]
      );
      if (!userCheck.rows[0]?.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }

    const placeholders = report_ids.map(() => '?').join(',');
    const result = await query(
      `UPDATE accessibility_reports
       SET status      = ?,
           admin_notes = COALESCE(?, admin_notes),
           reviewed_by = ?,
           reviewed_at = CURRENT_TIMESTAMP,
           updated_at  = CURRENT_TIMESTAMP
       WHERE id IN (${placeholders}) AND deleted_at IS NULL
       RETURNING id, status`,
      [status, admin_notes || null, userId, ...report_ids]
    );

    console.log(`[Reports] Cluster resolve: ${result.rows.length} reports → ${status} by ${userId}`);

    res.json({
      success: true,
      message: `${result.rows.length} report(s) ${status}`,
      updated: result.rows,
    });

  } catch (error) {
    console.error('[Reports] Cluster resolve error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// POST /api/reports/:id/messages - Send a message on a report (admin only)
// =============================================
router.post('/:id/messages', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = parseInt(req.params.id, 10);
    const { message } = req.body;

    if (!userId || isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Check report exists
    const reportResult = await query(
      `SELECT id FROM accessibility_reports WHERE id = ? AND deleted_at IS NULL`,
      [reportId]
    );
    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Admin-only
    let isAdmin = false;
    if (process.env.NODE_ENV !== 'production' && userId === '00000000-0000-0000-0000-000000000000') {
      isAdmin = true;
    } else {
      const userCheck = await query(
        'SELECT is_admin FROM users WHERE id = ? AND deleted_at IS NULL',
        [userId]
      );
      isAdmin = !!userCheck.rows[0]?.is_admin;
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await query(
      `INSERT INTO report_messages (report_id, sender_id, message)
       VALUES (?, ?, ?)
       RETURNING id, report_id, sender_id, message, created_at`,
      [reportId, userId, message.trim()]
    );

    res.status(201).json({
      success: true,
      message: result.rows[0],
    });

  } catch (error) {
    console.error('[Reports] Message send error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// GET /api/reports/:id/messages - Get messages for a report
// =============================================
router.get('/:id/messages', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = parseInt(req.params.id, 10);

    if (!userId || isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    // Check access
    const reportResult = await query(
      `SELECT id, submitted_by FROM accessibility_reports WHERE id = ? AND deleted_at IS NULL`,
      [reportId]
    );
    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = reportResult.rows[0];
    let isAllowed = false;

    // Dev-mode bypass
    if (process.env.NODE_ENV !== 'production' && userId === '00000000-0000-0000-0000-000000000000') {
      isAllowed = true;
    } else {
      const userCheck = await query(
        'SELECT is_admin FROM users WHERE id = ? AND deleted_at IS NULL',
        [userId]
      );
      if (userCheck.rows[0]?.is_admin) {
        isAllowed = true;
      }
    }

    if (!isAllowed && report.submitted_by !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await query(
      `SELECT rm.id, rm.report_id, rm.sender_id, rm.message, rm.read_at, rm.created_at,
              u.username AS sender_name,
              u.is_admin AS sender_is_admin
       FROM report_messages rm
       LEFT JOIN users u ON rm.sender_id = u.id
       WHERE rm.report_id = ?
       ORDER BY rm.created_at ASC`,
      [reportId]
    );

    // Mark unread messages as read
    await query(
      `UPDATE report_messages SET read_at = CURRENT_TIMESTAMP
       WHERE report_id = ? AND sender_id != ? AND read_at IS NULL`,
      [reportId, userId]
    );

    res.json({ success: true, messages: result.rows });

  } catch (error) {
    console.error('[Reports] Messages fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// GET /api/reports/inbox - Get reports with unread messages for a user
// =============================================
router.get('/inbox', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Valid user ID not found' });
    }

    // Reports where this user has unread messages from others
    const result = await query(
      `SELECT ar.id, ar.location_name, ar.issue_type, ar.status,
              sub.unread_count,
              sub.latest_message_at
       FROM accessibility_reports ar
       JOIN (
         SELECT rm.report_id,
                COUNT(*) AS unread_count,
                MAX(rm.created_at) AS latest_message_at
         FROM report_messages rm
         WHERE rm.sender_id != $1 AND rm.read_at IS NULL
         GROUP BY rm.report_id
       ) sub ON ar.id = sub.report_id
       WHERE sub.unread_count > 0
         AND (ar.submitted_by = $1 OR EXISTS (
           SELECT 1 FROM report_messages rm3
           WHERE rm3.report_id = ar.id AND rm3.sender_id = $1
         ))
       ORDER BY sub.latest_message_at DESC`,
      [userId]
    );

    res.json({ success: true, inbox: result.rows });

  } catch (error) {
    console.error('[Reports] Inbox error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// GET /api/reports/inbox/admin - Admin inbox: reports with unread messages from users
// =============================================
router.get('/inbox/admin', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Valid user ID not found' });
    }

    // Verify caller is admin
    if (process.env.NODE_ENV !== 'production' && userId === '00000000-0000-0000-0000-000000000000') {
      // dev-mode bypass
    } else {
      const userCheck = await query(
        'SELECT is_admin FROM users WHERE id = ? AND deleted_at IS NULL',
        [userId]
      );
      if (!userCheck.rows[0]?.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }

    // Reports where a non-admin user sent an unread message
    const result = await query(
      `SELECT ar.id, ar.location_name, ar.issue_type, ar.severity, ar.status, ar.submitted_by,
              sub.unread_count,
              sub.latest_message_at,
              sub.latest_message_preview
       FROM accessibility_reports ar
       JOIN (
         SELECT rm.report_id,
                COUNT(*) AS unread_count,
                MAX(rm.created_at) AS latest_message_at,
                (ARRAY_AGG(rm.message ORDER BY rm.created_at DESC))[1] AS latest_message_preview
         FROM report_messages rm
         JOIN users u ON rm.sender_id = u.id
         WHERE (u.is_admin IS NULL OR u.is_admin = 0 OR u.is_admin = false)
           AND rm.read_at IS NULL
         GROUP BY rm.report_id
       ) sub ON ar.id = sub.report_id
       WHERE sub.unread_count > 0
       ORDER BY sub.latest_message_at DESC`,
      []
    );

    res.json({ success: true, inbox: result.rows });

  } catch (error) {
    console.error('[Reports] Admin inbox error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// GET /api/reports - Get reports (admin only)
// =============================================
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status = 'pending', limit = 50, offset = 0 } = req.query;

    const userId = req.user.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Valid user ID not found' });
    }

    // Dev-mode bypass: mock tokens are treated as admin
    if (process.env.NODE_ENV !== 'production' && userId === '00000000-0000-0000-0000-000000000000') {
      // skip DB check
    } else {
      const userCheck = await query(
        'SELECT is_admin FROM users WHERE id = ? AND deleted_at IS NULL',
        [userId]
      );
      if (!userCheck.rows[0]?.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }

    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    let sql = `SELECT id, submitted_by, lat, lng, location_name, issue_type,
                     custom_description, severity, status, admin_notes,
                     reviewed_by, reviewed_at, created_at, updated_at
              FROM accessibility_reports
              WHERE deleted_at IS NULL`;
    const params = [];

    if (status !== 'all') {
      params.push(status);
      sql += ` AND status = ?`;
    }

    params.push(parsedLimit, parsedOffset);
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;

    const result = await query(sql, params);

    res.json({
      success: true,
      reports: result.rows,
      pagination: { limit: parsedLimit, offset: parsedOffset },
    });

  } catch (error) {
    console.error('[Reports] Fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// GET /api/reports/stats/summary - Admin stats
// =============================================
router.get('/stats/summary', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Valid user ID not found' });
    }

    // Dev-mode bypass: mock tokens are treated as admin
    if (process.env.NODE_ENV !== 'production' && userId === '00000000-0000-0000-0000-000000000000') {
      // skip DB check
    } else {
      const userCheck = await query(
        'SELECT is_admin FROM users WHERE id = ? AND deleted_at IS NULL',
        [userId]
      );
      if (!userCheck.rows[0]?.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }

    const result = await query(
      `SELECT
         COUNT(*)                                          AS total,
         COUNT(CASE WHEN status = 'pending'  THEN 1 END)  AS pending,
         COUNT(CASE WHEN status = 'approved' THEN 1 END)  AS approved,
         COUNT(CASE WHEN status = 'rejected' THEN 1 END)  AS rejected,
         COUNT(CASE WHEN status = 'resolved' THEN 1 END)  AS resolved,
         COALESCE(ROUND(AVG(severity)::numeric, 2), 0)    AS avg_severity
       FROM accessibility_reports
       WHERE deleted_at IS NULL`
    );

    res.json({ success: true, stats: result.rows[0] });

  } catch (error) {
    console.error('[Reports] Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// GET /api/reports/feedback - Get path ratings (admin only)
// =============================================
router.get('/feedback', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Dev-mode bypass: mock tokens are treated as admin
    if (process.env.NODE_ENV !== 'production' && userId === '00000000-0000-0000-0000-000000000000') {
      // skip DB check
    } else {
      const userCheck = await query(
        'SELECT is_admin FROM users WHERE id = ? AND deleted_at IS NULL',
        [userId]
      );
      if (!userCheck.rows[0]?.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }

    const result = await query(
      `SELECT id, user_id, profile_key, rating, comment, created_at 
       FROM route_feedback 
       ORDER BY created_at DESC 
       LIMIT 100`
    );

    res.json({ success: true, feedback: result.rows });
  } catch (error) {
    console.error('[Reports Feedback] Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// =============================================
// GET /api/reports/:id - Get single report
// =============================================
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = parseInt(req.params.id, 10);

    if (!userId || isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    const result = await query(
      `SELECT id, submitted_by, lat, lng, location_name, issue_type,
              custom_description, severity, status, admin_notes,
              reviewed_by, reviewed_at, created_at, updated_at
       FROM accessibility_reports
       WHERE id = ? AND deleted_at IS NULL`,
      [reportId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const isAdminCheck = await query(
      'SELECT is_admin FROM users WHERE id = ?',
      [userId]
    );

    if (!isAdminCheck.rows[0]?.is_admin && result.rows[0].submitted_by !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const report = result.rows[0];

    // Part B: attach the current verdict + corroboration count so the reporter
    // and admins see exactly how this report influences routing.
    const extras = await query(
      `SELECT
         (SELECT COUNT(*) FROM report_confirmations WHERE report_id = ?) AS confirmers,
         (SELECT reputation FROM users WHERE id = ? AND deleted_at IS NULL) AS reporter_reputation`,
      [reportId, report.submitted_by]
    );

    const { confirmers, reporter_reputation } = extras.rows[0] ?? {};
    const verdict = computeReportVerdict(report, confirmers ?? 0, reporter_reputation ?? 1);

    res.json({ success: true, report: { ...report, verdict } });

  } catch (error) {
    console.error('[Reports] Fetch one error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// PATCH /api/reports/:id - Approve / reject (admin only)
// =============================================
router.patch('/:id', verifyToken, async (req, res) => {
  try {
    const { status, admin_notes } = req.body;
    const userId = req.user.userId;
    const reportId = parseInt(req.params.id, 10);

    if (!userId || isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    if (!['approved', 'rejected', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be approved, rejected, or resolved' });
    }

    // Fetch report first — needed for both admin and reporter checks
    const reportResult = await query(
      `SELECT id, submitted_by, status, location_name, issue_type, custom_description, severity
       FROM accessibility_reports
       WHERE id = ? AND deleted_at IS NULL`,
      [reportId]
    );

    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const originalReport = reportResult.rows[0];
    const oldStatus = originalReport.status;

    // Determine permission: admin can do anything. The original reporter has
    // NO self-serve status rights — resolution requires admin or (later)
    // community consensus confirmations.
    let isAllowed = false;

    // Dev-mode bypass: mock tokens are treated as admin
    if (process.env.NODE_ENV !== 'production' && userId === '00000000-0000-0000-0000-000000000000') {
      isAllowed = true;
    } else {
      const userCheck = await query(
        'SELECT is_admin FROM users WHERE id = ? AND deleted_at IS NULL',
        [userId]
      );
      if (userCheck.rows[0]?.is_admin) {
        isAllowed = true;
      }
    }

    if (!isAllowed) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Update the report
    const updateResult = await query(
      `UPDATE accessibility_reports
       SET status      = ?,
           admin_notes = COALESCE(?, admin_notes),
           reviewed_by = ?,
           reviewed_at = CURRENT_TIMESTAMP,
           updated_at  = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL
       RETURNING id, status, admin_notes, reviewed_at`,
      [status, admin_notes || null, userId, reportId]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found or already deleted' });
    }

    // If admin provided notes, also save as a message so the user sees it
    if (admin_notes && admin_notes.trim()) {
      await query(
        `INSERT INTO report_messages (report_id, sender_id, message)
         VALUES (?, ?, ?)`,
        [reportId, userId, admin_notes.trim()]
      );
    }

    // Part B (B.6.7): reward sound reports, penalise adjudicated-false ones.
    // Outcome history becomes the reporter's reputation → decision confidence.
    if (oldStatus !== status && originalReport.submitted_by) {
      const REPUTATION_DELTAS = { approved: 0.15, rejected: -0.25, resolved: 0.1 };
      const delta = REPUTATION_DELTAS[status];
      if (delta) {
        const rep = await query(
          'SELECT reputation FROM users WHERE id = ? AND deleted_at IS NULL',
          [originalReport.submitted_by]
        );
        const current = rep.rows[0]?.reputation ?? 0;
        const next = Math.min(1, Math.max(0, current + delta));
        await query(
          'UPDATE users SET reputation = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL',
          [next, originalReport.submitted_by]
        );
      }
    }

    // EMAIL DISABLED - Render free tier blocks SMTP
    if (oldStatus !== status) {
      console.log(`[Reports] Report #${reportId}: ${oldStatus} → ${status} by ${userId}`);
    }

    res.json({
      success: true,
      message: `Report ${status}`,
      report: updateResult.rows[0],
    });

  } catch (error) {
    console.error('[Reports] Update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// DELETE /api/reports/:id - Soft delete (admin only)
// =============================================
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = parseInt(req.params.id, 10);

    if (!userId || isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    // Dev-mode bypass: mock tokens are treated as admin
    if (process.env.NODE_ENV !== 'production' && userId === '00000000-0000-0000-0000-000000000000') {
      // skip DB check
    } else {
      const userCheck = await query(
        'SELECT is_admin FROM users WHERE id = ? AND deleted_at IS NULL',
        [userId]
      );
      if (!userCheck.rows[0]?.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }

    const result = await query(
      `UPDATE accessibility_reports
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL
       RETURNING id`,
      [reportId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ success: true, message: 'Report deleted successfully' });

  } catch (error) {
    console.error('[Reports] Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;