-- ============================================
-- UG CAMPUS NAVIGATOR DATABASE SCHEMA
-- SQLite version (local development only)
-- Production uses Supabase PostgreSQL — do not run this file against prod.
-- ============================================

-- Users table (id = Supabase Auth UUID)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  is_admin INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL
);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  active_profile TEXT DEFAULT 'standard',
  dark_mode INTEGER DEFAULT 0,
  notifications_enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  success INTEGER DEFAULT 1,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Password resets (email-based, used with Supabase Auth)
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Route logs (analytics)
CREATE TABLE IF NOT EXISTS route_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  start_location TEXT,
  end_location TEXT,
  profile_used TEXT,
  route_distance REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_route_logs_user_id ON route_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_route_logs_created_at ON route_logs(created_at);

-- User activity (real-time tracking)
CREATE TABLE IF NOT EXISTS user_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  activity_type TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Route segments (heatmap)
CREATE TABLE IF NOT EXISTS route_segments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  lat_bucket    REAL NOT NULL,
  lng_bucket    REAL NOT NULL,
  hour_of_day   INTEGER NOT NULL,
  day_of_week   INTEGER NOT NULL,
  count         INTEGER NOT NULL DEFAULT 1,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Search destinations (heatmap)
CREATE TABLE IF NOT EXISTS search_destinations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  destination_name TEXT,
  lat_bucket       REAL NOT NULL,
  lng_bucket       REAL NOT NULL,
  hour_of_day      INTEGER NOT NULL,
  day_of_week      INTEGER NOT NULL,
  count            INTEGER NOT NULL DEFAULT 1,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Accessibility reports
CREATE TABLE IF NOT EXISTS accessibility_reports (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  submitted_by       TEXT,
  submitter_email    TEXT,
  lat                REAL NOT NULL,
  lng                REAL NOT NULL,
  location_name      TEXT,
  issue_type         TEXT NOT NULL,
  custom_description TEXT,
  severity           INTEGER NOT NULL DEFAULT 1,
  status             TEXT NOT NULL DEFAULT 'pending',
  admin_notes        TEXT,
  reviewed_by        TEXT,
  reviewed_at        DATETIME,
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at         DATETIME,
  FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Report confirmations (community consensus for "already resolved")
CREATE TABLE IF NOT EXISTS report_confirmations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id    INTEGER NOT NULL,
  user_id      TEXT NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(report_id, user_id),
  FOREIGN KEY (report_id) REFERENCES accessibility_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Report messages (admin-reporter communication)
CREATE TABLE IF NOT EXISTS report_messages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id      INTEGER NOT NULL,
  sender_id      TEXT NOT NULL,
  message        TEXT NOT NULL,
  read_at        DATETIME,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES accessibility_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
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
CREATE INDEX IF NOT EXISTS idx_search_destinations_cell ON search_destinations (lat_bucket, lng_bucket, hour_of_day, day_of_week);
CREATE INDEX IF NOT EXISTS idx_search_destinations_lat ON search_destinations (lat_bucket);
CREATE INDEX IF NOT EXISTS idx_search_destinations_lng ON search_destinations (lng_bucket);
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_destinations_unique ON search_destinations (lat_bucket, lng_bucket, hour_of_day, day_of_week);
CREATE INDEX IF NOT EXISTS idx_accessibility_reports_status ON accessibility_reports(status);
CREATE INDEX IF NOT EXISTS idx_accessibility_reports_submitted_by ON accessibility_reports(submitted_by);
CREATE INDEX IF NOT EXISTS idx_report_confirmations_report_id ON report_confirmations(report_id);
CREATE INDEX IF NOT EXISTS idx_report_messages_report_id ON report_messages(report_id);
CREATE INDEX IF NOT EXISTS idx_report_messages_sender_id ON report_messages(sender_id);
