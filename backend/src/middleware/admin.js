// backend/src/middleware/admin.js
// Admin authorization middleware

import { query } from '../config/db.js';

export async function requireAdmin(req, res, next) {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Dev-mode bypass: mock tokens are treated as admin
    if (process.env.NODE_ENV !== 'production' && userId === '00000000-0000-0000-0000-000000000000') {
      return next();
    }
    
    const result = await query(
      'SELECT is_admin FROM users WHERE id = ? AND deleted_at IS NULL',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Admin access required - User not found' });
    }
    
    if (!result.rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access required - Not admin' });
    }
    
    next();
  } catch (error) {
    console.error('[Admin Middleware] Error:', error.message);
    res.status(500).json({ error: 'Authorization failed' });
  }
}

// Bypass rate limiting for admins
export function adminBypassRateLimit(req, res, next) {
  if (req.user?.isAdmin) {
    req.skipRateLimit = true;
  }
  next();
}