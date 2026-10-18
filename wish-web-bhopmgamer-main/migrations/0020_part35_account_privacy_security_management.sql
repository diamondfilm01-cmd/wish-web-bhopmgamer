-- ============================================================================
-- WishMagic Cloudflare D1 Enterprise Architecture Migration (Part 35)
-- Migration: 0020_part35_account_privacy_security_management.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
--
-- TARGET: User Account Center, Privacy Controls, Session Security,
--         Personal Data Export (GDPR/DPDP Portability), & Account Deletion Safeguards
-- PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. STRICT ADDITIVE SCHEMA ONLY
--   3. PRESERVE ALL FINANCIAL ORDERS, TOKENS, AND TEMPLATE ASSETS
-- ============================================================================

-- 1. USER PRIVACY SETTINGS TABLE
CREATE TABLE IF NOT EXISTS user_privacy_settings (
  user_id TEXT PRIMARY KEY,
  profile_visibility TEXT NOT NULL DEFAULT 'public', -- 'public', 'unlisted', 'private'
  search_engine_indexing INTEGER NOT NULL DEFAULT 1, -- 1 = allow indexing, 0 = noindex
  analytics_tracking INTEGER NOT NULL DEFAULT 1,    -- 1 = allow analytics telemetry, 0 = opt-out
  marketing_emails INTEGER NOT NULL DEFAULT 0,      -- 1 = consent, 0 = no marketing
  activity_telemetry INTEGER NOT NULL DEFAULT 1,    -- 1 = allow performance logs, 0 = minimal
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_privacy_user_id ON user_privacy_settings(user_id);

-- 2. USER SECURITY AUDIT EVENTS TABLE (Device & Auth Telemetry)
CREATE TABLE IF NOT EXISTS user_security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'LOGIN', 'LOGOUT', 'SESSION_REVOKED', 'ALL_SESSIONS_REVOKED', 'PROFILE_UPDATED', 'PRIVACY_UPDATED', 'DATA_EXPORT_REQUESTED', 'DATA_EXPORT_DOWNLOADED', 'ACCOUNT_DELETION_REQUESTED', 'ACCOUNT_DELETION_CANCELLED', 'ACCOUNT_DEACTIVATED'
  ip_address TEXT,
  user_agent TEXT,
  device_info TEXT, -- Parsed device/browser summary e.g. "Chrome on Windows"
  details_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_security_events_user ON user_security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON user_security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON user_security_events(created_at);

-- 3. USER DATA EXPORTS TABLE (GDPR / DPDP Article 20 Portability)
CREATE TABLE IF NOT EXISTS user_data_exports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY', -- 'PENDING', 'READY', 'DOWNLOADED', 'EXPIRED'
  format TEXT NOT NULL DEFAULT 'json',
  summary_json TEXT DEFAULT '{}',
  payload_json TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  requested_at TEXT NOT NULL,
  completed_at TEXT,
  downloaded_at TEXT,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_data_exports_user ON user_data_exports(user_id);
CREATE INDEX IF NOT EXISTS idx_data_exports_status ON user_data_exports(status);
CREATE INDEX IF NOT EXISTS idx_data_exports_expires ON user_data_exports(expires_at);

-- 4. ACCOUNT DELETION & DEACTIVATION REQUESTS TABLE
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'CANCELLED', 'COMPLETED', 'DEACTIVATED'
  reason TEXT,
  feedback TEXT,
  wishes_handling TEXT NOT NULL DEFAULT 'retain_grace', -- 'retain_grace', 'unpublish_immediately'
  financial_records_retained INTEGER NOT NULL DEFAULT 1,
  requested_at TEXT NOT NULL,
  grace_period_ends_at TEXT NOT NULL,
  cancelled_at TEXT,
  completed_at TEXT,
  admin_notes TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON account_deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON account_deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_grace ON account_deletion_requests(grace_period_ends_at);

-- 5. RECORD MIGRATION IN DATABASE LEDGER
INSERT OR IGNORE INTO _migrations (id, name, applied_at)
VALUES ('mig_0020', '0020_part35_account_privacy_security_management.sql', CURRENT_TIMESTAMP);
