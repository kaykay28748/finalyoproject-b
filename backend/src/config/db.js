// backend/src/config/db.js
import dotenv from 'dotenv';
dotenv.config();

import { adaptSqlForSqlite } from '../db/sqliteCompat.js';

const isProduction = process.env.NODE_ENV === 'production';
let query, closePool, runDevMigrations;

if (isProduction) {
  // ── PostgreSQL (Supabase on Render) ────────────────────────────────────────
  const { default: pkg } = await import('pg');
  const { Pool } = pkg;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL is not defined in production');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    family: 4, // force IPv4 — Render free tier blocks IPv6
  });

  console.log('✅ Connected to Supabase PostgreSQL (Production)');

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
      // Ensure search_destinations table exists (added after initial deployment)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS search_destinations (
          id               SERIAL PRIMARY KEY,
          destination_name TEXT,
          lat_bucket       DOUBLE PRECISION NOT NULL,
          lng_bucket       DOUBLE PRECISION NOT NULL,
          hour_of_day      INTEGER NOT NULL,
          day_of_week      INTEGER NOT NULL,
          count            INTEGER NOT NULL DEFAULT 1,
          updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_search_destinations_cell
        ON search_destinations (lat_bucket, lng_bucket, hour_of_day, day_of_week)
      `);

      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_search_destinations_unique
        ON search_destinations (lat_bucket, lng_bucket, hour_of_day, day_of_week)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_search_destinations_lat
        ON search_destinations (lat_bucket)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_search_destinations_lng
        ON search_destinations (lng_bucket)
      `);

      console.log('[Migration] ✅ search_destinations table ready');

      // Ensure report_confirmations table exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS report_confirmations (
          id           SERIAL PRIMARY KEY,
          report_id    INTEGER NOT NULL,
          user_id      UUID NOT NULL,
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

export { query, closePool, runDevMigrations, isProduction };
