// SQLite database migration — local development only.
// Production uses migrate-pg.js against Supabase (DATABASE_URL required).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseSchemaStatements(schema) {
  return schema
    .split(';')
    .map((stmt) => {
      const lines = stmt.split('\n');
      return lines
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
    })
    .filter((stmt) => stmt.length > 0);
}

export async function runMigrations({ query, closePool, exitOnComplete = false } = {}) {
  let ownsConnection = false;

  try {
    if (!query) {
      ownsConnection = true;
      const dbModule = await import('../config/db.js');
      query = dbModule.query;
      closePool = dbModule.closePool;
    }

    console.log('[Migration] Starting SQLite migrations...');
    await new Promise((resolve) => setTimeout(resolve, 200));

    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    const statements = parseSchemaStatements(schema);

    console.log(`[Migration] Found ${statements.length} statements to execute`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      if (statement.toUpperCase().startsWith('PRAGMA')) {
        continue;
      }

      try {
        await query(statement);
        console.log(`[Migration] ✓ Statement ${i + 1}/${statements.length}`);
      } catch (err) {
        if (err.message?.includes('already exists')) {
          console.log(`[Migration] ℹ Already exists, skipping statement ${i + 1}`);
        } else {
          throw err;
        }
      }
    }

    console.log('[Migration] ✓ SQLite schema ready');
    await ensureColumns(query);
    return true;
  } catch (error) {
    console.error('[Migration] ✗ Migration failed:', error.message);
    throw error;
  } finally {
    if (exitOnComplete && ownsConnection && closePool) {
      await closePool();
      process.exit(0);
    }
  }
}

// Adds columns introduced after a table first shipped — CREATE TABLE IF NOT EXISTS
// won't alter an existing table, so ALTER is guarded by a PRAGMA table_info check.
async function ensureColumns(query) {
  const additions = [
    { table: 'users',                column: 'reputation', ddl: 'ALTER TABLE users ADD COLUMN reputation REAL NOT NULL DEFAULT 0' },
    { table: 'report_confirmations', column: 'lat',        ddl: 'ALTER TABLE report_confirmations ADD COLUMN lat REAL' },
    { table: 'report_confirmations', column: 'lng',        ddl: 'ALTER TABLE report_confirmations ADD COLUMN lng REAL' },
    { table: 'report_confirmations', column: 'accuracy',   ddl: 'ALTER TABLE report_confirmations ADD COLUMN accuracy REAL' },
  ];

  for (const { table, column, ddl } of additions) {
    try {
      const info = await query(`SELECT name FROM pragma_table_info('${table}')`);
      if (info.rows.some((r) => r.name === column)) continue;
      await query(ddl);
      console.log(`[Migration] ✓ Added column ${table}.${column}`);
    } catch (err) {
      console.error(`[Migration] ✗ Could not ensure ${table}.${column}:`, err.message);
    }
  }
}

const isDirectRun = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  runMigrations({ exitOnComplete: true }).catch(async (error) => {
    console.error('[Migration] Error details:', error);
    process.exit(1);
  });
}
