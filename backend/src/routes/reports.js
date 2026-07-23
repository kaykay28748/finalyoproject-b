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

    res.json({ success: true, report: result.rows[0] });

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

    // Fetch report
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

    // EMAIL DISABLED - Render free tier blocks SMTP
    // User notification would happen here, but skipped for now
    if (oldStatus !== status && (status === 'approved' || status === 'rejected')) {
      console.log(`[Reports] Report #${reportId} ${status} - Email notification skipped (SMTP blocked)`);
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