// backend/src/config/db.js
import dotenv from 'dotenv';
dotenv.config();

import { adaptSqlForSqlite } from '../db/sqliteCompat.js';

// ── Backend capability: PostgreSQL/PostGIS vs local SQLite ─────────────────────
//
// Single source of truth for "are we on PostgreSQL?". It drives the driver
// selection below AND is exported for callers that need to vary their SQL
// (e.g. the PostGIS geometry column in routes/reports.js).
//
// The two signals are both required, and the reasoning matters:
//
//   * NODE_ENV === 'production' — the only signal guaranteed to be set correctly
//     on Render, where the deploy sets it explicitly.
//   * DATABASE_URL containing 'supabase' — catches the real failure mode of a
//     production build started without NODE_ENV set (a forgotten flag, a local
//     `npm start` against the hosted DB). Without this, that combination loads
//     the SQLite driver AND produces SQLite SQL, which fails as a confusing
//     "no such table" rather than "you are pointed at the wrong database".
//
// Deriving the driver from the same expression is what keeps the two in step.
// Checking NODE_ENV in one file and DATABASE_URL in another is how you get a
// PostGIS query executed against SQLite.
//
// Note the asymmetry this creates, which is intentional: a PostgreSQL URL that
// is NOT Supabase (self-hosted, or a local Postgres for testing) is treated as
// dev and gets SQLite SQL. That is wrong for such a setup, but it is the safe
// direction to fail — SQLite-shaped SQL is at least portable, whereas PostGIS
// SQL against SQLite is a hard parse error. Set NODE_ENV=production to opt in.
const isPostgres =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.DATABASE_URL?.includes('supabase'));

// Retained under its original name; existing imports and call sites are unchanged.
const isProduction = isPostgres;
let query, closePool, runDevMigrations;

if (isPostgres) {
  // ── PostgreSQL (Supabase on Render) ────────────────────────────────────────
  const { default: pkg } = await import('pg');
  const { Pool } = pkg;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL is not defined but a PostgreSQL connection was required');
    console.error('   (NODE_ENV=production, or DATABASE_URL points at Supabase)');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    family: 4, // force IPv4 — Render free tier blocks IPv6
  });

  // The host is read from the URL rather than assumed, because isPostgres can now
  // be true for any PostgreSQL target, not only Supabase.
  let pgHost = 'unknown';
  try {
    pgHost = new URL(connectionString).hostname;
  } catch {
    // Non-URL connection strings (e.g. key=value DSNs) are legal for pg; the
    // hostname is only used for this log line, so a parse failure is not fatal.
  }
  console.log(`✅ Connected to PostgreSQL (${pgHost})`);

  function convertPlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  query = async (sql, params = []) => {
    try {
      const convertedSql = convertPlaceholders(sql);
      const result = await pool.query(convertedSql, params);
      return { rows: result.rows };
    } catch (error) {
      console.error('[DB] Query error:', error.message);
      console.error('[DB] Original SQL:', sql);
      console.error('[DB] Converted SQL:', convertPlaceholders(sql));
      console.error('[DB] Params:', params);
      throw error;
    }
  };

  closePool = async () => {
    await pool.end();
  };

  runDevMigrations = async () => {
    try {
      // Ensure report_confirmations table exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS report_confirmations (
          id           SERIAL PRIMARY KEY,
          report_id    INTEGER NOT NULL,
          user_id      UUID NOT NULL,
          lat          DOUBLE PRECISION,
          lng          DOUBLE PRECISION,
          accuracy     DOUBLE PRECISION,
          created_at   TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(report_id, user_id),
          FOREIGN KEY (report_id) REFERENCES accessibility_reports(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_report_confirmations_report_id
        ON report_confirmations(report_id)
      `);

      await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation DOUBLE PRECISION DEFAULT 0
      `);

      console.log('[Migration] ✅ report_confirmations table ready');

      // Ensure report_messages table exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS report_messages (
          id             SERIAL PRIMARY KEY,
          report_id      INTEGER NOT NULL,
          sender_id      UUID NOT NULL,
          message        TEXT NOT NULL,
          read_at        TIMESTAMPTZ,
          created_at     TIMESTAMPTZ DEFAULT NOW(),
          FOREIGN KEY (report_id) REFERENCES accessibility_reports(id) ON DELETE CASCADE,
          FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_report_messages_report_id
        ON report_messages(report_id)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_report_messages_sender_id
        ON report_messages(sender_id)
      `);

      console.log('[Migration] ✅ report_messages table ready');

      // Ensure audit_logs table exists (used by security stats in admin dashboard)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id           SERIAL PRIMARY KEY,
          user_id      UUID,
          action       TEXT NOT NULL,
          ip_address   TEXT,
          user_agent   TEXT,
          success      INTEGER DEFAULT 1,
          error_message TEXT,
          created_at   TIMESTAMPTZ DEFAULT NOW(),
          FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
        ON audit_logs(user_id)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
        ON audit_logs(created_at)
      `);

      console.log('[Migration] ✅ audit_logs table ready');

    } catch (error) {
      console.error('[Migration] Could not ensure tables:', error.message);
    }
  };

} else {
  // ── SQLite (Development) ───────────────────────────────────────────────────
  const sqlite3 = await import('sqlite3');
  const { open } = await import('sqlite');
  const { default: path } = await import('path');
  const { fileURLToPath } = await import('url');
  const { default: fs } = await import('fs');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname  = path.dirname(__filename);
  const dbPath     = path.join(__dirname, '../../ug_campus_nav.db');

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  console.log(`[DB] Using SQLite at: ${dbPath}`);

  const db = await open({
    filename: dbPath,
    driver:   sqlite3.default.Database,
  });

  // Warn when the environment looks production-shaped but resolved to SQLite.
  // The usual cause is a deploy that forgot NODE_ENV; report writes would go to a
  // local file and appear to succeed, which is far harder to notice than a crash.
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL?.includes('supabase')) {
    console.warn(
      '[DB] ⚠️  NODE_ENV=production but DATABASE_URL does not look like Supabase — ' +
      'falling back to SQLite. Reports will be written to a local file, not the hosted database. ' +
      'Set DATABASE_URL to your Supabase connection string.'
    );
  }

  console.log('✅ Connected to SQLite (Development)');

  query = async (sql, params = []) => {
    const adaptedSql = adaptSqlForSqlite(sql);

    try {
      const trimmed = adaptedSql.trim().toUpperCase();
      const returnsRows =
        trimmed.startsWith('SELECT') ||
        trimmed.startsWith('WITH') ||
        /\bRETURNING\b/i.test(adaptedSql);

      if (returnsRows) {
        return { rows: await db.all(adaptedSql, params) };
      }

      const result = await db.run(adaptedSql, params);
      return { rows: [], lastID: result.lastID, changes: result.changes };
    } catch (error) {
      console.error('[DB] Query error:', error.message);
      console.error('[DB] SQL:', adaptedSql);
      throw error;
    }
  };

  closePool = async () => {
    if (db) await db.close();
  };

  runDevMigrations = async () => {
    const { runMigrations } = await import('../db/migrate.js');
    await runMigrations({ query, closePool });
  };
}

// isProduction is an alias of isPostgres, kept so existing call sites keep working.
// New code that cares about SQL dialect should use isPostgres — it names what is
// actually being decided, and avoids implying "production" is a reliable signal on
// its own (see the derivation above).
export { query, closePool, runDevMigrations, isProduction, isPostgres };
