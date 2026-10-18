-- ============================================================================
-- WishMagic Cloudflare D1 Architecture Migration (Part 47)
-- Migration: 0035_part47_content_moderation_system.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description:
--   Complete Production Content Moderation, Media Quarantine, Multi-Provider
--   Scan Ledger, Repeat-Offender Strike & Restriction Tracking, Appeal
--   Workflow, and Sealed CSAM Legal Compliance Incident Tables.
-- ============================================================================

-- 1. ADDITIVE MODERATION & QUARANTINE COLUMNS ON EXISTING TABLES
ALTER TABLE wish_media ADD COLUMN moderation_status TEXT DEFAULT 'APPROVED';
ALTER TABLE wish_media ADD COLUMN moderation_reason TEXT;
ALTER TABLE wish_media ADD COLUMN moderation_item_id TEXT;
ALTER TABLE wish_media ADD COLUMN is_quarantined INTEGER DEFAULT 0;

ALTER TABLE music_library ADD COLUMN moderation_status TEXT DEFAULT 'APPROVED';
ALTER TABLE music_library ADD COLUMN moderation_reason TEXT;
ALTER TABLE music_library ADD COLUMN moderation_item_id TEXT;

ALTER TABLE users ADD COLUMN moderation_strikes INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN moderation_restricted INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN moderation_restriction_reason TEXT;
ALTER TABLE users ADD COLUMN moderation_restricted_until TEXT;
ALTER TABLE template_versions ADD COLUMN category TEXT;
ALTER TABLE template_versions ADD COLUMN tier TEXT DEFAULT 'free';
ALTER TABLE template_versions ADD COLUMN price INTEGER DEFAULT 0;
ALTER TABLE template_versions ADD COLUMN thumbnail TEXT;
ALTER TABLE template_versions ADD COLUMN theme TEXT;
ALTER TABLE template_versions ADD COLUMN layout TEXT;
ALTER TABLE template_versions ADD COLUMN animations TEXT;
ALTER TABLE template_versions ADD COLUMN default_config TEXT;
ALTER TABLE template_versions ADD COLUMN snapshot_data TEXT;
ALTER TABLE template_versions ADD COLUMN created_by TEXT DEFAULT 'system';
ALTER TABLE template_families ADD COLUMN published_version_id TEXT;
ALTER TABLE template_families ADD COLUMN latest_version_id TEXT;

-- 2. MODERATION ITEMS & QUARANTINE VAULT TABLE
CREATE TABLE IF NOT EXISTS moderation_items (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  owner_user_id TEXT,
  owner_email TEXT,
  media_kind TEXT DEFAULT 'text',
  filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER DEFAULT 0,
  sha256 TEXT,
  storage_provider TEXT,
  private_storage_key TEXT,
  approved_public_url TEXT,
  thumbnail_url TEXT,
  content_excerpt TEXT,
  extracted_ocr_text TEXT,
  transcript_text TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  is_quarantined INTEGER NOT NULL DEFAULT 1,
  is_csam_locked INTEGER NOT NULL DEFAULT 0,
  categories_json TEXT DEFAULT '[]',
  confidence_score INTEGER DEFAULT 0,
  provider_name TEXT DEFAULT 'local_hybrid',
  rejection_reason TEXT,
  scan_report_json TEXT DEFAULT '{}',
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_notes TEXT,
  appeal_status TEXT DEFAULT 'NONE',
  retention_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 3. MODERATION SCAN ATTEMPTS & PROVIDER TELEMETRY TABLE
CREATE TABLE IF NOT EXISTS moderation_scans (
  id TEXT PRIMARY KEY,
  moderation_item_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  media_kind TEXT NOT NULL,
  scan_status TEXT NOT NULL,
  verdict TEXT NOT NULL,
  confidence_score INTEGER DEFAULT 0,
  categories_json TEXT DEFAULT '[]',
  error_code TEXT,
  error_message TEXT,
  latency_ms INTEGER DEFAULT 0,
  raw_summary_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (moderation_item_id) REFERENCES moderation_items(id) ON DELETE CASCADE
);

-- 4. USER MODERATION VIOLATIONS & STRIKE LEDGER TABLE
CREATE TABLE IF NOT EXISTS moderation_violations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  moderation_item_id TEXT,
  target_type TEXT NOT NULL,
  target_id TEXT,
  violation_category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'HIGH',
  reason TEXT NOT NULL,
  strike_weight INTEGER NOT NULL DEFAULT 1,
  action_taken TEXT NOT NULL DEFAULT 'CONTENT_BLOCKED',
  created_at TEXT NOT NULL
);

-- 5. MODERATION APPEALS & RECHECK REQUESTS TABLE
CREATE TABLE IF NOT EXISTS moderation_appeals (
  id TEXT PRIMARY KEY,
  moderation_item_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_email TEXT,
  appeal_reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  resolution_notes TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (moderation_item_id) REFERENCES moderation_items(id) ON DELETE CASCADE
);

-- 6. SEALED CSAM LEGAL COMPLIANCE INCIDENTS TABLE (ZERO-EXPOSURE)
CREATE TABLE IF NOT EXISTS csam_compliance_incidents (
  id TEXT PRIMARY KEY,
  moderation_item_id TEXT NOT NULL,
  offender_user_id TEXT,
  offender_ip_hash TEXT,
  sha256_evidence TEXT,
  detection_source TEXT NOT NULL,
  legal_report_status TEXT NOT NULL DEFAULT 'PENDING_MANDATORY_REPORT',
  sealed_metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

-- 7. PERFORMANCE & LOOKUP INDEXES
CREATE INDEX IF NOT EXISTS idx_mod_items_status ON moderation_items(status, created_at);
CREATE INDEX IF NOT EXISTS idx_mod_items_target ON moderation_items(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_mod_items_owner ON moderation_items(owner_user_id, status);
CREATE INDEX IF NOT EXISTS idx_mod_items_sha256 ON moderation_items(sha256);
CREATE INDEX IF NOT EXISTS idx_mod_scans_item ON moderation_scans(moderation_item_id);
CREATE INDEX IF NOT EXISTS idx_mod_violations_user ON moderation_violations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mod_appeals_status ON moderation_appeals(status, created_at);
CREATE INDEX IF NOT EXISTS idx_wish_media_mod_status ON wish_media(moderation_status, is_quarantined);

-- 8. RECORD MIGRATION IN _MIGRATIONS REGISTRY
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0035', '0035_part47_content_moderation_system.sql', '2026-10-15T16:50:00.000Z');
