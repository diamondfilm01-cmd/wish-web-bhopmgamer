-- ============================================================================
-- WishMagic Cloudflare D1 Architecture Migration (Part 50)
-- Migration: 0038_part50_smart_template_recognition_and_update_studio.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description:
--   Smart Template Recognition, Side-by-Side Preview & Safe Update Studio:
--   1. Creates template_import_sessions table to stage uploaded ZIP packages,
--      persist automatic template recognition outcomes & candidate evidence,
--      store isolated preview bundles, file & manifest comparison reports,
--      and track explicit admin decisions (update_existing, create_new, cancel)
--      without mutating live published templates during inspection/preview.
--   2. Adds additive lineage and change-summary columns to template_versions
--      and templates (base_version_id, change_summary_json, import_session_id,
--      rollback_from_version_id, rollback_version_id).
-- ============================================================================

-- 1. CREATE TEMPLATE_IMPORT_SESSIONS TABLE
CREATE TABLE IF NOT EXISTS template_import_sessions (
  id TEXT PRIMARY KEY,
  operation_id TEXT,
  idempotency_key TEXT,
  admin_id TEXT NOT NULL DEFAULT 'admin',
  admin_email TEXT DEFAULT '',
  state TEXT NOT NULL DEFAULT 'UPLOADED',
  intended_target_template_id TEXT,
  selected_target_template_id TEXT,
  decision_mode TEXT NOT NULL DEFAULT 'undecided',
  recognition_outcome TEXT NOT NULL DEFAULT 'NO_EXISTING_MATCH',
  recognition_summary TEXT DEFAULT '',
  recognition_report_json TEXT DEFAULT '{}',
  package_metadata_json TEXT DEFAULT '{}',
  package_fingerprint TEXT,
  source_zip_sha256 TEXT,
  runtime_hash TEXT,
  schema_hash TEXT,
  manifest_json TEXT DEFAULT '{}',
  files_inventory_json TEXT DEFAULT '[]',
  staged_files_bundle_json TEXT DEFAULT '{}',
  validation_report_json TEXT DEFAULT '{}',
  comparison_report_json TEXT DEFAULT '{}',
  admin_config_overrides_json TEXT DEFAULT '{}',
  base_template_lock_version INTEGER DEFAULT 1,
  base_published_version_id TEXT,
  published_template_id TEXT,
  published_version_id TEXT,
  published_version_label TEXT,
  preview_token TEXT,
  warnings_acknowledged INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  cancelled_at TEXT
);

-- 2. ADDITIVE COLUMNS ON TEMPLATES & TEMPLATE_VERSIONS FOR LINEAGE, DIFF SUMMARY & ROLLBACK
ALTER TABLE templates ADD COLUMN rollback_version_id TEXT DEFAULT NULL;
ALTER TABLE template_versions ADD COLUMN base_version_id TEXT DEFAULT NULL;
ALTER TABLE template_versions ADD COLUMN change_summary_json TEXT DEFAULT '{}';
ALTER TABLE template_versions ADD COLUMN import_session_id TEXT DEFAULT NULL;
ALTER TABLE template_versions ADD COLUMN rollback_from_version_id TEXT DEFAULT NULL;
ALTER TABLE template_versions ADD COLUMN updated_at TEXT DEFAULT NULL;

-- 3. INDEXES FOR FAST RECOGNITION, SESSION LOOKUP & CONCURRENCY CHECKS
CREATE INDEX IF NOT EXISTS idx_tis_state ON template_import_sessions(state, updated_at);
CREATE INDEX IF NOT EXISTS idx_tis_target_tpl ON template_import_sessions(selected_target_template_id, state);
CREATE INDEX IF NOT EXISTS idx_tis_fingerprint ON template_import_sessions(package_fingerprint);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tis_idempotency ON template_import_sessions(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tv_base_version ON template_versions(template_id, base_version_id);
