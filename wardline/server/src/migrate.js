// migrate.js
// ---------------------------------------------------------------------------
// Creates every table AcceX needs, if it doesn't already exist.
// Safe to run repeatedly — "IF NOT EXISTS" means running it twice does
// nothing the second time.
//
// Run with: npm run migrate
// ---------------------------------------------------------------------------
require("dotenv").config();
const { pool } = require("./pool");

const SQL = `
CREATE TABLE IF NOT EXISTS access_points (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  department    TEXT NOT NULL,
  entry_rules   TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS departments (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL UNIQUE,
  active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,
  full_name             TEXT NOT NULL, -- kept in sync automatically (first_name + " " + last_name) so every existing read of full_name keeps working unchanged
  first_name            TEXT NOT NULL DEFAULT '',
  last_name             TEXT NOT NULL DEFAULT '',
  staff_number          TEXT NOT NULL UNIQUE,
  username              TEXT NOT NULL UNIQUE,
  password_hash         TEXT NOT NULL,
  role                  TEXT NOT NULL,
  access_point_id       TEXT REFERENCES access_points(id) ON DELETE SET NULL,
  permission_groups     JSONB NOT NULL DEFAULT '[]'::jsonb, -- no longer read or written by the app; permission groups were removed in favor of fixed, role-based capabilities. Left in place rather than dropped, since removing a column is a destructive change on a database that may already have real data.
  status                TEXT NOT NULL DEFAULT 'Active',
  session_timer_visible BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts       INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  last_login_at         TIMESTAMPTZ,
  must_change_password  BOOLEAN NOT NULL DEFAULT FALSE,
  previous_password_hash TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CREATE TABLE IF NOT EXISTS is a no-op on a database that already has
-- this table from an earlier migration run — it won't add new columns to
-- an existing table. These two statements cover that case explicitly, so
-- this migration stays safe to re-run regardless of whether the table is
-- brand new or already existed before this feature was added.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS previous_password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '';

-- One-time backfill: any row that already existed before first/last name
-- were introduced has first_name/last_name still blank (the DEFAULT '' above).
-- Split full_name on the first space so those older records get sensible
-- values instead of staying empty. Safe to re-run — it only ever touches
-- rows where first_name is still blank.
UPDATE users SET
  first_name = COALESCE(NULLIF(split_part(full_name, ' ', 1), ''), full_name),
  last_name  = COALESCE(NULLIF(trim(substring(full_name FROM position(' ' IN full_name) + 1)), ''), '')
WHERE first_name = '' AND full_name IS NOT NULL AND full_name <> '';

-- The devices table (and its device-claiming ceremony) has been removed
-- by design: Access Point context now comes purely from which account is
-- logged in, not which physical device is being used. If you're running
-- this migration against a database that still has an old devices table
-- from before this change, it's safe to drop manually:
--   DROP TABLE IF EXISTS devices;

CREATE TABLE IF NOT EXISTS duration_categories (
  id       TEXT PRIMARY KEY,
  label    TEXT NOT NULL,
  minutes  INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS visitors (
  id                       TEXT PRIMARY KEY,
  access_point_id          TEXT NOT NULL REFERENCES access_points(id) ON DELETE CASCADE,
  visitor_type             TEXT NOT NULL,
  full_name                TEXT NOT NULL, -- kept in sync automatically (first_name + " " + last_name)
  first_name               TEXT NOT NULL DEFAULT '',
  last_name                TEXT NOT NULL DEFAULT '',
  company                  TEXT,
  phone                    TEXT,
  staff_number             TEXT,
  department               TEXT,
  purpose                  TEXT NOT NULL,
  time_in                  TIMESTAMPTZ NOT NULL,
  expected_duration_label  TEXT NOT NULL,
  expected_duration_minutes INTEGER NOT NULL,
  expected_departure       TIMESTAMPTZ NOT NULL,
  sign_in_signature        TEXT,
  sign_in_signature_at     TIMESTAMPTZ,
  agreed_to_terms          BOOLEAN NOT NULL DEFAULT FALSE,
  agreed_to_terms_at       TIMESTAMPTZ,
  status                   TEXT NOT NULL DEFAULT 'Active',
  supervising_officer      TEXT NOT NULL,
  supervising_staff_number TEXT NOT NULL,
  extensions               JSONB NOT NULL DEFAULT '[]'::jsonb,
  time_out                 TIMESTAMPTZ,
  duration_minutes         INTEGER,
  sign_out_signature       TEXT,
  sign_out_method          TEXT,
  sign_out_officer         TEXT,
  sign_out_staff_number    TEXT,
  sign_out_notes           TEXT
);

-- Same first/last name split and backfill as users, above — done here,
-- after the visitors table exists, rather than earlier alongside the
-- users one, since running it any sooner would fail on a brand-new
-- database that doesn't have a visitors table yet.
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '';

UPDATE visitors SET
  first_name = COALESCE(NULLIF(split_part(full_name, ' ', 1), ''), full_name),
  last_name  = COALESCE(NULLIF(trim(substring(full_name FROM position(' ' IN full_name) + 1)), ''), '')
WHERE first_name = '' AND full_name IS NOT NULL AND full_name <> '';

CREATE TABLE IF NOT EXISTS audit_log (
  id                TEXT PRIMARY KEY,
  timestamp         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_name         TEXT,
  staff_number      TEXT,
  role              TEXT,
  access_point_id   TEXT,
  action            TEXT NOT NULL,
  related_record_id TEXT,
  details           TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- Indexes: these are what keep queries fast as the tables grow. Without
-- them, PostgreSQL would scan every row to answer questions like "who is
-- currently active at this Access Point" — fine at 100 rows, slow at
-- 500,000. This is precisely the scaling problem the JSON file had.
CREATE INDEX IF NOT EXISTS idx_visitors_ap_status ON visitors(access_point_id, status);
CREATE INDEX IF NOT EXISTS idx_visitors_time_in   ON visitors(time_in DESC);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp    ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_ap           ON audit_log(access_point_id);
CREATE INDEX IF NOT EXISTS idx_users_username     ON users(LOWER(username));
`;

(async () => {
  try {
    await pool.query(SQL);
    console.log("Migration complete — all tables and indexes are in place.");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
