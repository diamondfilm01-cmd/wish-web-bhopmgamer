-- ============================================================================
-- WishMagic Cloudflare D1 Enterprise Architecture Migration (Part 37)
-- Migration: 0022_part37_account_lifecycle_and_retention.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
--
-- TARGET: Production Account Settings, Privacy Controls, Data Export,
--         Secure Account Deletion, Storage Cleanup & Data Retention Engine
-- PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. STRICT ADDITIVE SCHEMA ONLY
--   3. PRESERVE ALL FINANCIAL ORDERS, TOKENS, REFERRAL REWARDS & TEMPLATE ASSETS
-- ============================================================================

-- 1. ACCOUNT LIFECYCLE BACKGROUND JOBS (Asynchronous Purge & Retention Worker)
CREATE TABLE IF NOT EXISTS account_lifecycle_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_type TEXT NOT NULL, -- 'ACCOUNT_DELETION_PURGE', 'DATA_EXPORT_GENERATION', 'STORAGE_MEDIA_CLEANUP', 'GRACE_PERIOD_EXPIRATION'
  status TEXT NOT NULL DEFAULT 'QUEUED', -- 'QUEUED', 'PROCESSING', 'READY', 'COMPLETED', 'FAILED', 'FAILED_RETRYABLE', 'CANCELLED'
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_eligible_retry_at TEXT,
  claimed_by TEXT,
  claim_expires_at TEXT,
  progress_step TEXT, -- 'INSPECT_DEPENDENCIES', 'ARCHIVE_WISHES', 'ANONYMIZE_PROFILE', 'CLEANUP_ORPHAN_MEDIA', 'REVOKE_SESSIONS', 'FINALIZED'
  details_json TEXT DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_jobs_user ON account_lifecycle_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_jobs_status ON account_lifecycle_jobs(status);
CREATE INDEX IF NOT EXISTS idx_lifecycle_jobs_retry ON account_lifecycle_jobs(next_eligible_retry_at);

-- 2. ACCOUNT CLEANUP ITEMS (Granular Media & Storage Dependency Cleanup Tracking)
CREATE TABLE IF NOT EXISTS account_cleanup_items (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  user_id TEXT NOT NULL,
  resource_type TEXT NOT NULL, -- 'imgbb_image', 'b2_asset', 'wish_draft', 'session', 'notification_job', 'export_artifact'
  resource_id TEXT NOT NULL,
  storage_key TEXT,
  provider TEXT NOT NULL, -- 'imgbb', 'backblaze_b2', 'd1_database'
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'DEPENDENCY_BLOCKED', 'DELETED', 'RETAINED_STATUTORY', 'FAILED'
  is_shared_template_asset INTEGER NOT NULL DEFAULT 0, -- 1 = NEVER DELETE (Safety Invariant)
  retained_reason TEXT, -- e.g. 'Statutory financial accounting compliance', 'Shared template catalog dependency'
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cleanup_items_user ON account_cleanup_items(user_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_items_job ON account_cleanup_items(job_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_items_status ON account_cleanup_items(status);

-- 3. ENHANCE USER PRIVACY SETTINGS WITH PREFERRED TIMEZONE & LANGUAGE
-- Add preferred language and timezone preferences if not already present
-- (SQLite / D1 additive ALTER TABLE support)
ALTER TABLE user_privacy_settings ADD COLUMN preferred_language TEXT DEFAULT 'en';
ALTER TABLE user_privacy_settings ADD COLUMN timezone TEXT DEFAULT 'Asia/Kolkata';

-- 4. ACCOUNT RETENTION AUDIT LOG (Immutable Compliance Trail)
CREATE TABLE IF NOT EXISTS account_retention_audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  details_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_retention_audit_user ON account_retention_audit_log(user_id);

-- 5. RECORD MIGRATION IN DATABASE LEDGER
INSERT OR IGNORE INTO _migrations (id, name, applied_at)
VALUES ('mig_0022', '0022_part37_account_lifecycle_and_retention.sql', CURRENT_TIMESTAMP);
