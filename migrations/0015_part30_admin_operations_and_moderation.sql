-- ============================================================================
-- WishMagic Cloudflare D1 Final Architecture Migration (Part 30)
-- Migration: 0015_part30_admin_operations_and_moderation.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description:
--   Part 30: Production Admin Operations System
--   1. Additive columns for users: suspension_reason, admin_notes, last_login_at, failed_login_attempts, email_verified
--   2. Additive columns for wishes: moderation_status, moderation_reason, moderated_by, moderated_at, is_flagged, admin_notes, extended_expiry_at, original_creator_id
--   3. moderation_reports: Tracks user/system content reports, flags, and resolution actions
--   4. support_tickets: Tracks customer issues, celebration link diagnostics, and admin resolutions
--   5. user_activity_logs: Tracks authentication, wish publishing, role/status changes, and session events
--   6. Performance & audit query indexes
--
-- STRICT PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. ADDITIVE MIGRATION ONLY
--   3. Preserves all existing tables, records, and relationships from Parts 1–29
-- ============================================================================

-- 1. ADDITIVE COLUMNS FOR USERS (Part 30)
ALTER TABLE users ADD COLUMN suspension_reason TEXT;
ALTER TABLE users ADD COLUMN admin_notes TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 1;

-- 2. ADDITIVE COLUMNS FOR WISHES (Part 30)
ALTER TABLE wishes ADD COLUMN moderation_status TEXT DEFAULT 'approved';
ALTER TABLE wishes ADD COLUMN moderation_reason TEXT;
ALTER TABLE wishes ADD COLUMN moderated_by TEXT;
ALTER TABLE wishes ADD COLUMN moderated_at TEXT;
ALTER TABLE wishes ADD COLUMN is_flagged INTEGER DEFAULT 0;
ALTER TABLE wishes ADD COLUMN admin_notes TEXT;
ALTER TABLE wishes ADD COLUMN extended_expiry_at TEXT;
ALTER TABLE wishes ADD COLUMN original_creator_id TEXT;

-- 3. CONTENT MODERATION REPORTS TABLE
CREATE TABLE IF NOT EXISTS moderation_reports (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL DEFAULT 'wish', -- 'wish', 'user', 'media', 'template'
  target_id TEXT NOT NULL,
  reporter_id TEXT,
  reporter_email TEXT,
  report_reason TEXT NOT NULL,              -- 'inappropriate_content', 'copyright', 'harassment', 'spam', 'other'
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending', 'resolved', 'dismissed', 'escalated'
  resolution_action TEXT,                   -- 'approved', 'suspended', 'content_removed', 'dismissed'
  resolution_notes TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

-- 4. SUPPORT TICKETS TABLE
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  ticket_number TEXT UNIQUE NOT NULL,
  user_id TEXT,
  user_email TEXT,
  wish_id TEXT,
  order_id TEXT,
  category TEXT NOT NULL DEFAULT 'general', -- 'link_issue', 'billing', 'media_error', 'customization', 'general'
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',      -- 'open', 'in_progress', 'resolved', 'closed'
  priority TEXT NOT NULL DEFAULT 'medium',  -- 'low', 'medium', 'high', 'urgent'
  admin_notes TEXT,
  assigned_to TEXT,
  diagnostic_data TEXT DEFAULT '{}',
  resolution_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 5. USER ACTIVITY LOGS TABLE
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,              -- 'LOGIN', 'LOGOUT', 'WISH_CREATED', 'STATUS_CHANGED', 'ROLE_CHANGED', 'SESSIONS_REVOKED'
  description TEXT NOT NULL,
  metadata_json TEXT DEFAULT '{}',
  actor_id TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL
);

-- 6. PERFORMANCE & OPERATIONAL INDEXES
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at);
CREATE INDEX IF NOT EXISTS idx_wishes_moderation ON wishes(moderation_status, is_flagged);
CREATE INDEX IF NOT EXISTS idx_moderation_reports_target ON moderation_reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_moderation_reports_status ON moderation_reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_wish ON support_tickets(wish_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, priority);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user ON user_activity_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_type ON user_activity_logs(activity_type);

-- 7. RECORD MIGRATION IN _migrations REGISTRY
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0015', '0015_part30_admin_operations_and_moderation.sql', '2026-10-09T00:00:00.000Z');
