// backend/src/config/db.js
import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import { recordDbQuery } from '../utils/metrics.js';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for the PostgreSQL-only backend configuration.');
}

// SSL defaults to on (production Supabase requires it). The local Supabase
// Postgres container does not speak SSL, so set DB_SSL=false for local dev.
export const useSsl = process.env.DB_SSL !== 'false';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
});

export const isPostgres = true;
export const isProduction = isPostgres;

function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

// Leading keyword of a statement, used only to bucket DB metrics by verb. Reads
// through leading comments/whitespace poorly on purpose — an unrecognised verb
// is reported as OTHER rather than mis-attributed.
function sqlVerb(sql) {
  const match = /^\s*(\w+)/.exec(sql);
  return match ? match[1].toUpperCase() : 'OTHER';
}

export async function query(sql, params = []) {
  const startedAt = performance.now();
  try {
    const convertedSql = convertPlaceholders(sql);
    const result = await pool.query(convertedSql, params);
    recordDbQuery({ ms: performance.now() - startedAt, ok: true, verb: sqlVerb(sql) });
    return { rows: result.rows };
  } catch (error) {
    // Record the failed query too: a slow timeout and a fast syntax error are
    // different signals, and both belong in the latency picture.
    recordDbQuery({ ms: performance.now() - startedAt, ok: false, verb: sqlVerb(sql) });
    console.error('[DB] Query error:', error.message);
    console.error('[DB] SQL:', sql);
    console.error('[DB] Converted SQL:', convertPlaceholders(sql));
    console.error('[DB] Params:', params);
    throw error;
  }
}

export async function closePool() {
  await pool.end();
}

export async function runDevMigrations() {
  return null;
}
