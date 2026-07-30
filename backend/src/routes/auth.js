// backend/src/routes/auth.js
import express from 'express';
import { query } from '../config/db.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * Validates if a token exists and is structurally a valid JWT.
 * Prevents common "junk" strings from being sent to the backend.
 * 
 * @param {string|null} token 
 * @returns {boolean}
 */
export const isTokenValid = (token) => {
  if (!token || typeof token !== 'string') return false;
  const junkValues = ['undefined', 'null', '[object Object]'];
  if (junkValues.includes(token)) return false;
  // Support development mock tokens or standard 3-part JWTs
  return token === 'mock-token' || token.split('.').length === 3;
};

// POST /auth/sync - Syncs Supabase Auth user with local database
router.post('/sync', async (req, res) => {
  try {
    const { user: supabaseUser } = req.body;
    
    if (!supabaseUser || !supabaseUser.id) {
      return res.status(400).json({ error: 'Invalid user data provided for sync' });
    }

    const username = supabaseUser.user_metadata?.username || supabaseUser.email.split('@')[0];

    // Perform an UPSERT to ensure the user exists in our local metadata table.
    // Conflict on email (natural key) — keeps the existing id stable since
    // updating it can violate the UNIQUE constraint on users.id when another
    // row already holds that id value.
    const result = await query(
      `INSERT INTO users (id, email, username, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(email) DO UPDATE SET
         username = excluded.username,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id, email, username, is_admin, created_at`,
      [supabaseUser.id, supabaseUser.email, username]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[Auth Sync] Critical error:', error);
    res.status(500).json({ error: 'Failed to synchronize user session' });
  }
});

// GET /auth/me - Fetches the current authenticated user's profile
router.get('/me', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await query(
      'SELECT id, email, username, is_admin, created_at FROM users WHERE id = ? AND deleted_at IS NULL',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[Auth Me] Fetch error:', error);
    res.status(500).json({ error: 'Internal server error fetching profile' });
  }
});

// PATCH /auth/me - Update user profile (username)
router.patch('/me', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { username } = req.body;

    if (!username || typeof username !== 'string' || username.trim().length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters' });
    }

    const sanitized = username.trim();

    // Check username uniqueness (exclude current user)
    const existing = await query(
      'SELECT id FROM users WHERE username = ? AND id != ? AND deleted_at IS NULL',
      [sanitized, userId]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const result = await query(
      `UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND deleted_at IS NULL
       RETURNING id, email, username, is_admin, created_at`,
      [sanitized, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[Auth Me] Update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// DELETE /auth/me - Soft delete account
router.delete('/me', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Check user exists
    const userCheck = await query(
      'SELECT id FROM users WHERE id = ? AND deleted_at IS NULL',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found or already deleted' });
    }

    await query(
      `UPDATE users SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND deleted_at IS NULL`,
      [userId]
    );

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('[Auth Me] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// POST /auth/change-password - Verify current password and update via Supabase
router.post('/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const email = req.user.email;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const strength = (
      (/[a-z]/.test(newPassword) ? 1 : 0) +
      (/[A-Z]/.test(newPassword) ? 1 : 0) +
      (/\d/.test(newPassword) ? 1 : 0)
    );

    if (strength < 3) {
      return res.status(400).json({ error: 'Password must include uppercase, lowercase, and numbers' });
    }

    // Re-authenticate with Supabase to verify current password
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey
        },
        body: JSON.stringify({ email, password: currentPassword })
      });

      if (!authResponse.ok) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    } else {
      console.warn('[Change Password] No Supabase credentials configured, skipping password verification');
    }

    res.json({ success: true, message: 'Password verified' });
  } catch (error) {
    console.error('[Auth] Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://ugnavigator.onrender.com';

async function sendPasswordRecovery(email) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase not configured');
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/recover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey
    },
    body: JSON.stringify({
      email,
      redirect_to: `${FRONTEND_URL}/reset-password`
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.msg || `Supabase returned ${response.status}`);
  }
}

// POST /auth/forgot-password - Send password reset email via Supabase
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    await sendPasswordRecovery(email);
    res.json({ success: true, message: 'Password reset email sent' });
  } catch (error) {
    console.error('[Auth] Forgot password error:', error.message);
    if (error.message === 'Supabase not configured') {
      return res.status(503).json({ error: 'Password reset is temporarily unavailable. Please try again later.' });
    }
    res.status(400).json({ error: error.message || 'Failed to send reset email. Please try again.' });
  }
});

// POST /auth/resend - Resend password reset email
router.post('/resend', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    await sendPasswordRecovery(email);
    res.json({ success: true, message: 'Reset email resent' });
  } catch (error) {
    console.error('[Auth] Resend error:', error.message);
    if (error.message === 'Supabase not configured') {
      return res.status(503).json({ error: 'Password reset is temporarily unavailable. Please try again later.' });
    }
    res.status(400).json({ error: error.message || 'Failed to resend email. Please try again.' });
  }
});

export default router;