-- Migration 0031: Part 9 Centralized Admin Control Center Tables
-- Adds error logs, ingestion job tracking, and monitoring schema for D1

CREATE TABLE IF NOT EXISTS admin_error_logs (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL, -- 'ingestion', 'validation', 'compatibility', 'runtime', 'b2_storage', 'imgbb', 'database', 'auth', 'general'
  severity TEXT DEFAULT 'error', -- 'warning', 'error', 'critical'
  component TEXT NOT NULL,
  error_code TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT DEFAULT '{}', -- JSON string with safe diagnostic details
  target_type TEXT, -- 'template_family', 'template_version', 'wish', 'song', 'media', 'user'
  target_id TEXT,
  correlation_id TEXT,
  resolved INTEGER DEFAULT 0,
  resolution_notes TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_error_category ON admin_error_logs(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_error_code ON admin_error_logs(error_code);
CREATE INDEX IF NOT EXISTS idx_admin_error_resolved ON admin_error_logs(resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_error_target ON admin_error_logs(target_type, target_id);

CREATE TABLE IF NOT EXISTS admin_ingestion_jobs (
  id TEXT PRIMARY KEY,
  package_filename TEXT NOT NULL,
  family_id TEXT,
  template_version TEXT,
  status TEXT NOT NULL, -- 'received', 'extracting', 'validating', 'storing', 'completed', 'failed'
  error_code TEXT,
  error_message TEXT,
  validation_issues TEXT DEFAULT '[]', -- JSON array of UTP validation issues
  retry_count INTEGER DEFAULT 0,
  retry_eligible INTEGER DEFAULT 1,
  correlation_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_ingestion_status ON admin_ingestion_jobs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_ingestion_family ON admin_ingestion_jobs(family_id);

INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0031', '0031_part9_admin_control_center.sql', CURRENT_TIMESTAMP);
