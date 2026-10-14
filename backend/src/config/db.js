// backend/src/config/db.js
import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';

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

export async function query(sql, params = []) {
  try {
    const convertedSql = convertPlaceholders(sql);
    const result = await pool.query(convertedSql, params);
    return { rows: result.rows };
  } catch (error) {
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
