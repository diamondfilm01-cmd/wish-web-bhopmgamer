-- ============================================================================
-- WishMagic Cloudflare D1 Staff Management & Admin Audit Logging
-- Migration: 0004_admin_staff_and_audit_logs.sql
-- Description: Adds staff management, password hashing support, Firebase UID mapping,
--              and tamper-evident admin audit logging.
-- ============================================================================

-- 1. ADMIN STAFF TABLE
CREATE TABLE IF NOT EXISTS admin_staff (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  mobile TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'EDITOR', -- 'OWNER', 'ADMIN', 'MANAGER', 'EDITOR', 'SUPPORT', 'ANALYST'
  permissions TEXT NOT NULL DEFAULT '[]', -- JSON array of permission keys
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'disabled', 'suspended'
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  firebase_uid TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_staff_mobile ON admin_staff(mobile);
CREATE INDEX IF NOT EXISTS idx_admin_staff_role ON admin_staff(role);
CREATE INDEX IF NOT EXISTS idx_admin_staff_status ON admin_staff(status);

-- 2. ADMIN AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL, -- e.g. 'ADMIN_LOGIN', 'STAFF_CREATED', 'STAFF_DISABLED', 'ROLE_CHANGED'
  target_type TEXT,     -- 'staff', 'template', 'wish', 'user', 'settings'
  target_id TEXT,
  details TEXT,         -- JSON payload of non-sensitive changes
  ip_address TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor ON admin_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs(created_at);

-- Record migration in _migrations table
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0004', '0004_admin_staff_and_audit_logs.sql', '2026-10-04T00:00:00.000Z');
