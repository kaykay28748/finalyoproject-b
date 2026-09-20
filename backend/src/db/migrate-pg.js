// backend/src/db/migrate-pg.js
// PostgreSQL migration script for Supabase (production only).
// Requires DATABASE_URL. Do NOT use for local SQLite — use migrate.js instead.
//
// The schema lives in postgres-schema.sql (full DDL + indexes + RLS policies).
// It is safe to run multiple times (IF NOT EXISTS everywhere).
// The backend connects with the service_role key, which bypasses RLS.

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL is not defined');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  console.log('[Migration] Starting PostgreSQL migration...');

  const schemaPath = path.join(__dirname, 'postgres-schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error('❌ postgres-schema.sql not found:', schemaPath);
    process.exit(1);
  }

  const schema = fs.readFileSync(schemaPath, 'utf8');

  try {
    await pool.query(schema);
    console.log('[Migration] ✅ Database schema created successfully (tables, indexes, RLS policies)');
  } catch (error) {
    console.error('[Migration] ❌ Failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runMigration();