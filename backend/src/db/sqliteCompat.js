// Translates PostgreSQL-style SQL to SQLite for local development only.
export function adaptSqlForSqlite(sql) {
  let adapted = sql;

  adapted = adapted.replace(/\$(\d+)/g, '?');

  // INTERVAL must be handled BEFORE the bare NOW() rule below.
  //
  // `NOW() - INTERVAL '30 days'` and `CURRENT_TIMESTAMP - INTERVAL '30 days'` both
  // contain NOW(), so converting NOW() first leaves `CURRENT_TIMESTAMP - INTERVAL`,
  // which these two patterns can no longer match. SQLite has no INTERVAL keyword
  // at all, so the surviving text is a parse error — the whole query dies in dev,
  // including any row/limit clause riding along with it.
  //
  // Order is load-bearing: do not "tidy" the bare NOW() rule above these.
  //
  // The comparison operator is matched rather than hardcoded to `>`: `WHERE
  // created_at < NOW() - INTERVAL '30 days'` is an equally normal way to write
  // this, and a `>`-only pattern silently leaves it broken.
  //
  // The unit is matched with an optional plural because both spellings occur in
  // this codebase — admin.js writes `INTERVAL '1 day'` and `INTERVAL '7 days'` in
  // adjacent queries. A `days`-only pattern leaves the singular form as a SQLite
  // parse error. SQLite's modifier takes either form, so the plural is normalised
  // rather than echoed.
  const unit = String.raw`(minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)`;

  adapted = adapted.replace(
    new RegExp(String.raw`([<>]=?)\s*NOW\s*\(\s*\)\s*-\s*INTERVAL\s+'(\d+)\s+${unit}'`, 'gi'),
    (_m, op, n, u) => `${op} datetime('now', '-${n} ${u.toLowerCase()}')`
  );
  adapted = adapted.replace(
    new RegExp(String.raw`([<>]=?)\s*NOW\s*\(\s*\)\s*\+\s*INTERVAL\s+'(\d+)\s+${unit}'`, 'gi'),
    (_m, op, n, u) => `${op} datetime('now', '+${n} ${u.toLowerCase()}')`
  );
  // Assignment form: `SET expires_at = NOW() + INTERVAL '1 hour'`.
  adapted = adapted.replace(
    new RegExp(String.raw`=\s*NOW\s*\(\s*\)\s*\+\s*INTERVAL\s+'(\d+)\s+${unit}'`, 'gi'),
    (_m, n, u) => `= datetime('now', '+${n} ${u.toLowerCase()}')`
  );

  adapted = adapted.replace(/\bNOW\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP');
  adapted = adapted.replace(/::numeric/gi, '');

  // ── PostGIS neutralisation ────────────────────────────────────────────────
  //
  // SQLite has no spatial extension, and an unknown function is a *parse* error
  // rather than a runtime one — so leaving any ST_* call in place fails the whole
  // statement, not just its spatial part.
  //
  // ST_SetSRID(ST_MakePoint(?, ?), 4326) is replaced with a single-value expression
  // that still CONSUMES both placeholders:
  //
  //   COALESCE(NULL, ?, ?) is wrong — it would leak the coordinates into a text
  //   column. `(?, ?)` is a row value, not a scalar. Three bare NULLs emit three
  //   values into a one-column slot.
  //
  //   (SELECT NULL WHERE ? IS NOT NULL AND ? IS NOT NULL) is one scalar value and
  //   takes exactly the two placeholders, so the parameter count matches the
  //   PostgreSQL original and binding never shifts. Its value is always NULL —
  //   the WHERE is intentionally unsatisfiable in intent, and the parameters are
  //   present only to hold the binding positions.
  //
  // This matters because a mismatch here is silent rather than loud: `location_name`
  // would receive the longitude, `issue_type` the latitude, and the report would
  // commit successfully with scrambled data.
  adapted = adapted.replace(
    /ST_SetSRID\s*\(\s*ST_MakePoint\s*\(\s*\?\s*,\s*\?\s*\)\s*,\s*4326\s*\)/gi,
    '(SELECT NULL WHERE ? IS NOT NULL AND ? IS NOT NULL)'
  );

  // Any other ST_* call the schema might grow later. Neutralise the function name
  // but keep the arguments (and therefore the placeholder count) intact, so
  // binding never drifts. Dev-only safety net, and it warns rather than silently
  // discarding a value something may come to depend on.
  adapted = adapted.replace(/\bST_[A-Za-z0-9_]+\s*\(/g, (match) => {
    console.warn(
      '[sqliteCompat] Neutralised unmapped PostGIS call', match.trim(),
      '- SQLite cannot evaluate it. Add an explicit rule here if this query needs the value locally.'
    );
    return '(';
  });

  return adapted;
}
