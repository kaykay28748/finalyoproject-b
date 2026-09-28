// src/middleware/auth.js
// JWT verification middleware - supports both Supabase Auth and custom JWT tokens

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { isPostgres } from '../config/db.js';

dotenv.config();

/**
 * Internal helper to check for malformed tokens
 */
const isTokenMalformed = (token) => {
  return !token || 
         ['undefined', 'null', '[object Object]'].includes(token) || 
         token.split('.').length !== 3;
};

/**
 * The local development credential.
 *
 * A fixed string, and only ever honoured outside production. It is checked by
 * exact equality, so a missing or empty Authorization header can never satisfy
 * it — `!token` is deliberately NOT part of this condition.
 */
const DEV_BYPASS_TOKEN = 'mock-token';

/**
 * Is the local dev bypass available for this request?
 *
 * Opt-in and AND-ed, not a disjunction. The previous form was
 *
 *     !isPostgres || process.env.NODE_ENV === 'development'
 *
 * which fails open in a way that matters: a Render service misconfigured with
 * NODE_ENV=development — one copied line from an .env example, and a common
 * mistake — satisfied the second operand and granted the bypass while `isPostgres`
 * was true, i.e. mock-token became a full admin credential against production
 * Supabase. Because || short-circuits, the !isPostgres guard could not save it.
 *
 * Now both conditions are required, and the env var defaults to off:
 *
 *   * ALLOW_DEV_AUTH_BYPASS === 'true' — explicit, opt-in, off unless set.
 *   * !isPostgres — the process is not pointed at a shared or production
 *     database. config/db.js derives isPostgres from NODE_ENV === 'production'
 *     OR a Supabase DATABASE_URL, so a production-shaped process is excluded
 *     regardless of how the other variables are set.
 *
 * A misconfigured production deploy now fails CLOSED and returns 401, which is
 * the safe direction: an admin endpoint that rejects its caller is an
 * inconvenience, whereas one that accepts a public credential is a breach.
 */
function devBypassAvailable() {
  return process.env.ALLOW_DEV_AUTH_BYPASS === 'true' && !isPostgres;
}

// Exported so requireAdmin can apply the identical rule. Two separate copies of
// "is this a dev process" would drift, and the weaker one would end up being the
// one guarding admin access.
export { devBypassAvailable };

/**
 * Verify JWT access token - Supports Supabase tokens and custom JWT
 * Attached to protected routes
 */
export function verifyToken(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    // Dev Mode Bypass: Support local testing with mock tokens.
    //
    // This check MUST come before isTokenMalformed. `mock-token` has no dots, so
    // the JWT shape check rejects it as malformed first and the bypass below it
    // is unreachable — which is why admin endpoints guarded by verifyToken +
    // requireAdmin could not be exercised locally at all, returning a 401 that
    // looked like bad credentials rather than an unreachable code path.
    if (devBypassAvailable() && token === DEV_BYPASS_TOKEN) {
      req.user = { userId: '00000000-0000-0000-0000-000000000000', email: 'dev@example.com' };
      return next();
    }

    if (isTokenMalformed(token)) {
      return res.status(401).json({ 
        error: 'No authorization token provided' 
      });
    }

    // First, try to decode as Supabase token (without verification)
    try {
      const decoded = jwt.decode(token);
      
      if (decoded && decoded.sub) {
        // This is a Supabase token - trust it since Supabase already verified it
        req.user = { 
          userId: decoded.sub,  // UUID from Supabase
          email: decoded.email 
        };
        console.log('[Auth] Supabase token accepted for user:', decoded.email);
        return next();
      }
    } catch (decodeErr) {
      // Not a Supabase token, continue to custom verification
    }
    
    // Fallback: Verify with your custom JWT secret (for existing tokens)
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = decoded;
    next();
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired, please refresh' 
      });
    }
    
    console.error('[Auth] Token verification failed:', error.message);
    return res.status(403).json({ 
      error: 'Invalid token' 
    });
  }
}

/**
 * Verify refresh token and issue new access token
 */
export function verifyRefreshToken(req, res, next) {
  try {
    const token = req.body.refreshToken;
    
    if (!token) {
      return res.status(401).json({ 
        error: 'No refresh token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ 
      error: 'Invalid refresh token' 
    });
  }
}

/**
 * Create JWT access token (for custom auth - kept for compatibility)
 */
export function createAccessToken(userId, email) {
  return jwt.sign(
    { userId, email },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
  );
}

/**
 * Create JWT refresh token (for custom auth - kept for compatibility)
 */
export function createRefreshToken(userId, email) {
  return jwt.sign(
    { userId, email },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
  );
}