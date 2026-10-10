-- ============================================================================
-- MIGRATION: 0028_part3_template_ingestion_operations.sql
-- WishMagic Part 3 — Automatic Template ZIP Ingestion Engine, Operation State Machine & Idempotency
-- Target Database: c08b683b-eb07-4639-ab33-fb1139bfb295
--
-- STRICT PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. ADDITIVE MIGRATION ONLY
--   3. Preserves all existing tables and records from Parts 1–27
-- ============================================================================

-- Table to track asynchronous and staged template upload operations
CREATE TABLE IF NOT EXISTS template_upload_operations (
  id TEXT PRIMARY KEY,                       -- e.g. 'top_...' or UUID
  idempotency_key TEXT,                     -- Unique client idempotency key or content hash
  author_id TEXT NOT NULL,                  -- Administrator who uploaded
  template_family_id TEXT,                  -- Resolved family ID
  template_id TEXT,                         -- Resolved template ID
  version_id TEXT,                          -- Resolved immutable version ID
  version_number INTEGER,                   -- Assigned version number
  version_label TEXT,                       -- Assigned version label (e.g. 'v1.0.0')
  package_fingerprint TEXT,                 -- Deterministic SHA-256 fingerprint of package files
  state TEXT NOT NULL DEFAULT 'received',   -- 'received', 'validating', 'validation_failed', 'staging', 'staged', 'registering', 'preview_ready', 'failed', 'cleanup_pending'
  progress_stage TEXT DEFAULT 'received',
  progress_percent INTEGER DEFAULT 0,
  is_retryable INTEGER DEFAULT 1,
  error_code TEXT,
  error_message TEXT,
  validation_report_json TEXT DEFAULT '{}',
  inventory_json TEXT DEFAULT '[]',
  b2_objects_json TEXT DEFAULT '[]',        -- List of B2 objects written by this operation for targeted cleanup
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Unique index to prevent duplicate concurrent operations on same idempotency key
CREATE UNIQUE INDEX IF NOT EXISTS idx_template_upload_idempotency ON template_upload_operations(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_template_upload_state ON template_upload_operations(state);
CREATE INDEX IF NOT EXISTS idx_template_upload_family ON template_upload_operations(template_family_id);
CREATE INDEX IF NOT EXISTS idx_template_upload_fingerprint ON template_upload_operations(package_fingerprint);
CREATE INDEX IF NOT EXISTS idx_template_upload_author ON template_upload_operations(author_id);

-- Add package_fingerprint column to template_versions if not exists for fast duplicate detection
ALTER TABLE template_versions ADD COLUMN package_fingerprint TEXT;
CREATE INDEX IF NOT EXISTS idx_tv_package_fingerprint ON template_versions(package_fingerprint);

-- Record migration in _migrations registry
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0028', '0028_part3_template_ingestion_operations.sql', '2026-10-10T06:30:00.000Z');
