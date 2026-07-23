// backend/src/db/migrate-pg.js
// PostgreSQL migration script for Supabase (production only).
// Requires DATABASE_URL. Do NOT use for local SQLite — use migrate.js instead.

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
  
  try {
    // Read schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Split into individual statements
    const statements = schema
      .split(';')
      .filter(stmt => stmt.trim().length > 0)
      .filter(stmt => !stmt.trim().startsWith('--'));
    
    console.log(`[Migration] Found ${statements.length} statements to execute`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        await pool.query(statement);
        console.log(`[Migration] ✓ Statement ${i + 1} executed`);
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`[Migration] ℹ Table already exists, skipping`);
        } else {
          throw err;
        }
      }
    }
    
    console.log('[Migration] ✅ Database schema created successfully');
    
    // Add is_admin column if missing
    await pool.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'users' AND column_name = 'is_admin') THEN
          ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0;
        END IF;
      END $$;
    `);
    
    console.log('[Migration] ✓ Ensured is_admin column exists');

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
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_report_confirmations_report_id ON report_confirmations(report_id)`);
    console.log('[Migration] ✓ report_confirmations table ready');

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
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_report_messages_report_id ON report_messages(report_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_report_messages_sender_id ON report_messages(sender_id)`);
    console.log('[Migration] ✓ report_messages table ready');
    
  } catch (error) {
    console.error('[Migration] ❌ Failed:', error.message);
  } finally {
    await pool.end();
  }
}

runMigration();