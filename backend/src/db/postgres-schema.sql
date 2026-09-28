-- ============================================
-- UG CAMPUS NAVIGATOR DATABASE SCHEMA
-- Supabase / PostgreSQL version (production)
-- Run this in the Supabase SQL Editor or via npm run migrate:pg
--
-- Notes:
--  * user FK columns reference auth.users(id) (Supabase Auth)
--  * RLS is enabled on every table. The backend connects with the
--    service_role key (bypasses RLS). The frontend only reads the
--    `users` table directly (duplicate-email precheck) → anon SELECT
--    policy is granted there and nowhere else.
--  * Safe to run multiple times (IF NOT EXISTS everywhere).
-- ============================================

-- ============================================
-- USERS (id = Supabase Auth UUID)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT UNIQUE NOT NULL,
  username    TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  is_admin    INTEGER DEFAULT 0,
  reputation  DOUBLE PRECISION DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ============================================
-- USER PREFERENCES
-- ============================================
CREATE TABLE IF NOT EXISTS user_preferences (
  id                   BIGSERIAL PRIMARY KEY,
  user_id              UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  active_profile       TEXT DEFAULT 'standard',
  dark_mode            INTEGER DEFAULT 0,
  notifications_enabled INTEGER DEFAULT 1,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- REFRESH TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash  TEXT UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

-- ============================================
-- AUDIT LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  ip_address    TEXT,
  user_agent    TEXT,
  success       INTEGER DEFAULT 1,
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PASSWORD RESETS (email-based, used with Supabase Auth)
-- ============================================
CREATE TABLE IF NOT EXISTS password_resets (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROUTE LOGS (analytics)
-- ============================================
CREATE TABLE IF NOT EXISTS route_logs (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  start_location TEXT,
  end_location   TEXT,
  profile_used   TEXT,
  route_distance DOUBLE PRECISION,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USER ACTIVITY (real-time tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS user_activity (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type TEXT,
  metadata      TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROUTE SEGMENTS (heatmap)
-- ============================================
CREATE TABLE IF NOT EXISTS route_segments (
  id          BIGSERIAL PRIMARY KEY,
  lat_bucket  DOUBLE PRECISION NOT NULL,
  lng_bucket  DOUBLE PRECISION NOT NULL,
  hour_of_day INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  count       INTEGER NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- ACCESSIBILITY REPORTS
-- ============================================
CREATE TABLE IF NOT EXISTS accessibility_reports (
  id                 BIGSERIAL PRIMARY KEY,
  submitted_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitter_email    TEXT,
  lat                DOUBLE PRECISION NOT NULL,
  lng                DOUBLE PRECISION NOT NULL,
  location_name      TEXT,
  issue_type         TEXT NOT NULL,
  custom_description TEXT,
  severity           INTEGER NOT NULL DEFAULT 1,
  status             TEXT NOT NULL DEFAULT 'pending',
  admin_notes        TEXT,
  reviewed_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ
);

-- ============================================
-- REPORT CONFIRMATIONS (community consensus)
-- ============================================
CREATE TABLE IF NOT EXISTS report_confirmations (
  id         BIGSERIAL PRIMARY KEY,
  report_id  INTEGER NOT NULL REFERENCES accessibility_reports(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  accuracy   DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_id, user_id)
);

-- ============================================
-- ROUTE FEEDBACK (user ratings)
-- ============================================
CREATE TABLE IF NOT EXISTS route_feedback (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  profile_key TEXT NOT NULL DEFAULT 'standard',
  rating      INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- REPORT MESSAGES (admin-reporter communication)
-- ============================================
CREATE TABLE IF NOT EXISTS report_messages (
  id        BIGSERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES accessibility_reports(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message   TEXT NOT NULL,
  read_at   TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash ON password_resets(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email);
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity(created_at);
CREATE INDEX IF NOT EXISTS idx_route_segments_cell ON route_segments (lat_bucket, lng_bucket, hour_of_day, day_of_week);
CREATE INDEX IF NOT EXISTS idx_route_segments_lat ON route_segments (lat_bucket);
CREATE INDEX IF NOT EXISTS idx_route_segments_lng ON route_segments (lng_bucket);
CREATE UNIQUE INDEX IF NOT EXISTS idx_route_segments_unique ON route_segments (lat_bucket, lng_bucket, hour_of_day, day_of_week);
CREATE INDEX IF NOT EXISTS idx_accessibility_reports_status ON accessibility_reports(status);
CREATE INDEX IF NOT EXISTS idx_accessibility_reports_submitted_by ON accessibility_reports(submitted_by);

-- ============================================
-- POSTGIS GEOMETRY (accessibility_reports)
-- ============================================
-- A derived column mirroring (lat, lng) as geometry(Point, 4326), so hazards are
-- spatially queryable — radius search, "reports near this route", and the campus
-- geofence. lat/lng stay as the source of truth: every existing read path uses
-- them, and SQLite has no spatial type, so the column is PostgreSQL-only.
--
-- Wrapped in a DO block because the extension may not be installed on every
-- database (self-hosted, or a project where PostGIS was never enabled). The
-- whole block is skipped in that case rather than aborting the migration —
-- losing report submission to a missing optional column would be a far worse
-- outcome than not having the derived geometry. reports.js catches the same
-- 42883/42703 and saves without geom, so both layers degrade independently.
--
-- ST_SetSRID(..., 4326) is explicit rather than relying on the default: SRID 0
-- is what you get from ST_MakePoint alone, and a 4326 column silently accepting a
-- 0-SRID value produces coordinates that are numerically fine and spatially wrong.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    EXECUTE 'ALTER TABLE accessibility_reports
             ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326)';

    -- GIST is what makes ST_DWithin / ST_Contains index-assisted instead of a
    -- sequential scan. Without it this column is write-only cost, no read benefit.
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_accessibility_reports_geom
             ON accessibility_reports USING GIST (geom)';
  ELSE
    RAISE NOTICE 'postgis not installed — skipping accessibility_reports.geom (reports.js falls back to lat/lng)';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_report_confirmations_report_id ON report_confirmations(report_id);
CREATE INDEX IF NOT EXISTS idx_report_messages_report_id ON report_messages(report_id);
CREATE INDEX IF NOT EXISTS idx_report_messages_sender_id ON report_messages(sender_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
-- `users`: anon SELECT is required by the frontend duplicate-email
-- precheck (supabase.from('users').select('email')). Authenticated users
-- can only manage their own row.
-- NOTE: policies are preceded by DROP POLICY IF EXISTS so the whole file
-- can be re-run safely (CREATE POLICY has no IF NOT EXISTS).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_select_anon ON users;
CREATE POLICY users_select_anon ON users FOR SELECT USING (true);
DROP POLICY IF EXISTS users_insert_own ON users;
CREATE POLICY users_insert_own ON users FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS users_update_own ON users;
CREATE POLICY users_update_own ON users FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS users_delete_own ON users;
CREATE POLICY users_delete_own ON users FOR DELETE USING (auth.uid() = id);

-- `user_preferences`: owner-only
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_preferences_select ON user_preferences;
CREATE POLICY user_preferences_select ON user_preferences FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS user_preferences_insert ON user_preferences;
CREATE POLICY user_preferences_insert ON user_preferences FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS user_preferences_update ON user_preferences;
CREATE POLICY user_preferences_update ON user_preferences FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS user_preferences_delete ON user_preferences;
CREATE POLICY user_preferences_delete ON user_preferences FOR DELETE USING (user_id = auth.uid());

-- `refresh_tokens`: owner-only
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refresh_tokens_select ON refresh_tokens;
CREATE POLICY refresh_tokens_select ON refresh_tokens FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS refresh_tokens_insert ON refresh_tokens;
CREATE POLICY refresh_tokens_insert ON refresh_tokens FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS refresh_tokens_update ON refresh_tokens;
CREATE POLICY refresh_tokens_update ON refresh_tokens FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS refresh_tokens_delete ON refresh_tokens;
CREATE POLICY refresh_tokens_delete ON refresh_tokens FOR DELETE USING (user_id = auth.uid());

-- `audit_logs`: no direct client access (backend service-role only)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- `password_resets`: no direct client access (backend service-role only)
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;

-- `route_logs`: owner-only
ALTER TABLE route_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS route_logs_select ON route_logs;
CREATE POLICY route_logs_select ON route_logs FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS route_logs_insert ON route_logs;
CREATE POLICY route_logs_insert ON route_logs FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS route_logs_update ON route_logs;
CREATE POLICY route_logs_update ON route_logs FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS route_logs_delete ON route_logs;
CREATE POLICY route_logs_delete ON route_logs FOR DELETE USING (user_id = auth.uid());

-- `user_activity`: owner-only
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_activity_select ON user_activity;
CREATE POLICY user_activity_select ON user_activity FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS user_activity_insert ON user_activity;
CREATE POLICY user_activity_insert ON user_activity FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS user_activity_update ON user_activity;
CREATE POLICY user_activity_update ON user_activity FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS user_activity_delete ON user_activity;
CREATE POLICY user_activity_delete ON user_activity FOR DELETE USING (user_id = auth.uid());

-- `route_segments`: heatmap served by backend API; no direct client access
ALTER TABLE route_segments ENABLE ROW LEVEL SECURITY;

-- `accessibility_reports`: readable by everyone (community data),
-- but only the authenticated submitter can insert/update their own.
ALTER TABLE accessibility_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accessibility_reports_select ON accessibility_reports;
CREATE POLICY accessibility_reports_select ON accessibility_reports FOR SELECT USING (deleted_at IS NULL OR (submitted_by = auth.uid()));
DROP POLICY IF EXISTS accessibility_reports_insert ON accessibility_reports;
CREATE POLICY accessibility_reports_insert ON accessibility_reports FOR INSERT WITH CHECK (submitted_by = auth.uid());
DROP POLICY IF EXISTS accessibility_reports_update ON accessibility_reports;
CREATE POLICY accessibility_reports_update ON accessibility_reports FOR UPDATE USING (submitted_by = auth.uid());

-- `report_confirmations`: owner-only
ALTER TABLE report_confirmations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_confirmations_select ON report_confirmations;
CREATE POLICY report_confirmations_select ON report_confirmations FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS report_confirmations_insert ON report_confirmations;
CREATE POLICY report_confirmations_insert ON report_confirmations FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS report_confirmations_delete ON report_confirmations;
CREATE POLICY report_confirmations_delete ON report_confirmations FOR DELETE USING (user_id = auth.uid());

-- `route_feedback`: owner-only
ALTER TABLE route_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS route_feedback_select ON route_feedback;
CREATE POLICY route_feedback_select ON route_feedback FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS route_feedback_insert ON route_feedback;
CREATE POLICY route_feedback_insert ON route_feedback FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS route_feedback_update ON route_feedback;
CREATE POLICY route_feedback_update ON route_feedback FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS route_feedback_delete ON route_feedback;
CREATE POLICY route_feedback_delete ON route_feedback FOR DELETE USING (user_id = auth.uid());

-- `report_messages`: finder can see messages for reports they own;
-- senders see messages they sent. Admins access through the backend.
ALTER TABLE report_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_messages_select ON report_messages;
CREATE POLICY report_messages_select ON report_messages FOR SELECT
  USING (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM accessibility_reports ar
      WHERE ar.id = report_messages.report_id AND ar.submitted_by = auth.uid()
    )
  );
DROP POLICY IF EXISTS report_messages_insert ON report_messages;
CREATE POLICY report_messages_insert ON report_messages FOR INSERT WITH CHECK (sender_id = auth.uid());
-- ============================================
-- PEDESTRIAN EDGE GRAPH (spatial graph compiler)
-- ============================================
-- Written by backend/src/services/graphSynchronizer.js via
-- POST /api/admin/sync-region, and read by getSpatialGraphSlice() in
-- backend/src/services/routingContext.js. One table serves both graph slices:
-- the campus slice is `WHERE is_on_campus = TRUE`, the external slice is
-- `WHERE is_on_campus = FALSE AND ST_Intersects(geom, ST_MakeEnvelope(...))`.
--
-- The table is declared here as well as created at runtime. The runtime
-- CREATE TABLE IF NOT EXISTS is what makes the endpoint work on a database
-- that was provisioned without this file; it is not a substitute for it,
-- because a table created in code is invisible to anyone reading the schema.
--
-- Notes on the columns that are not obvious:
--
--  * osm_id is SEGMENT-scoped (`<wayId>:<segmentIndex>`), not a way id. One
--    OSM way becomes one row per consecutive node pair, so a way id alone
--    cannot be unique. It is nevertheless the conflict key, so a re-sync
--    updates rows in place instead of duplicating them.
--
--  * from_lat/from_lng/to_lat/to_lng duplicate the information in geom on
--    purpose. They are what makes a spatial slice possible without PostGIS:
--    on SQLite (no geometry type) and on a PostgreSQL database where the
--    extension is not installed, they are the only filter available. Writing
--    them on every row also means the two paths cannot disagree about where
--    an edge is.
--
--  * is_on_campus is derived from CAMPUS_BOUNDS in graphSynchronizer.js, which
--    mirrors UG_BOUNDS in frontend/src/function/utils/bounds.js. It buckets an
--    edge at ingest so the campus slice is a plain equality scan. It is NOT
--    the authority on whether a *user* is on campus — that stays with the
--    check_if_inside_legon RPC, so there is one geofence, not two that can
--    drift. Correcting CAMPUS_BOUNDS and re-syncing reclassifies rows.
--
--  * No `name` column. OSM way names are not ingested, so routingContext.js
--    selects NULL AS name rather than depending on a column no writer fills.
--    costFunction.js already falls back to the highway type when name is null.
--
-- No RLS is enabled here. The table is read by the backend only, which
-- connects with the service_role key; a policy would add no protection and a
-- restrictive one would break the graph slice.
CREATE TABLE IF NOT EXISTS public.pedestrian_edges (
  id            BIGSERIAL PRIMARY KEY,
  osm_id        TEXT NOT NULL UNIQUE,
  from_node_id  TEXT NOT NULL,
  to_node_id    TEXT NOT NULL,
  distance_m    DOUBLE PRECISION NOT NULL,
  highway_type  TEXT,
  surface       TEXT,
  lit           BOOLEAN DEFAULT FALSE,
  sidewalk      TEXT,
  incline       TEXT,
  from_lat      DOUBLE PRECISION NOT NULL,
  from_lng      DOUBLE PRECISION NOT NULL,
  to_lat        DOUBLE PRECISION NOT NULL,
  to_lng        DOUBLE PRECISION NOT NULL,
  is_on_campus  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- The campus slice is `is_on_campus = TRUE` across the whole campus, so a
-- partial index on just those rows keeps it off the full table.
CREATE INDEX IF NOT EXISTS idx_pedestrian_edges_campus
  ON public.pedestrian_edges (is_on_campus) WHERE is_on_campus;
CREATE INDEX IF NOT EXISTS idx_pedestrian_edges_from
  ON public.pedestrian_edges (from_node_id);
CREATE INDEX IF NOT EXISTS idx_pedestrian_edges_to
  ON public.pedestrian_edges (to_node_id);
CREATE INDEX IF NOT EXISTS idx_pedestrian_edges_type
  ON public.pedestrian_edges (highway_type);

-- `name` is selected as NULL by the reader and is therefore not a column here.

-- geom is created only when the PostGIS extension is present, and the extension
-- itself is not created here: CREATE EXTENSION requires privileges the backend's
-- connection does not have on most managed Postgres, and a schema file that
-- fails halfway leaves a confusing partial state. Enable PostGIS in the Supabase
-- dashboard, then run the sync once — graphSynchronizer.js adds the column, this
-- GIST index, and backfills it from the coordinate columns.
