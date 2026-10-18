-- ============================================================================
-- WishMagic Cloudflare D1 Final Architecture Migration (Part 28)
-- Migration: 0013_part28_template_version_management.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description:
--   Template Version Control + Release Pipeline + Safe Publish + Rollback:
--   1. Additive columns for template_versions: release_notes, manifest_json,
--      file_count, total_size_bytes, entry_point, integrity_status,
--      integrity_checked_at, validation_report_json, lock_version, is_current
--   2. Additive columns for template_families: current_version_id, rollback_version_id
--   3. Additive columns for templates: current_version_id
--   4. Fast composite indexes for version lookup, rollback targeting, and status filtering
--   5. Backfills is_current and current_version_id for existing active templates
--
-- STRICT PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. ADDITIVE MIGRATION ONLY
--   3. Preserves all existing tables, records, and relationships from Parts 1–27
-- ============================================================================

-- 1. ADDITIVE COLUMNS FOR TEMPLATE_VERSIONS (Part 28)
ALTER TABLE template_versions ADD COLUMN release_notes TEXT DEFAULT '';
ALTER TABLE template_versions ADD COLUMN published_by TEXT;
ALTER TABLE template_versions ADD COLUMN manifest_json TEXT DEFAULT '{}';
ALTER TABLE template_versions ADD COLUMN file_count INTEGER DEFAULT 0;
ALTER TABLE template_versions ADD COLUMN total_size_bytes INTEGER DEFAULT 0;
ALTER TABLE template_versions ADD COLUMN entry_point TEXT DEFAULT 'index.html';
ALTER TABLE template_versions ADD COLUMN integrity_status TEXT DEFAULT 'unverified';
ALTER TABLE template_versions ADD COLUMN integrity_checked_at TEXT;
ALTER TABLE template_versions ADD COLUMN validation_report_json TEXT DEFAULT '{}';
ALTER TABLE template_versions ADD COLUMN lock_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE template_versions ADD COLUMN is_current INTEGER NOT NULL DEFAULT 0;

-- 2. ADDITIVE COLUMNS FOR TEMPLATE_FAMILIES (Part 28)
ALTER TABLE template_families ADD COLUMN current_version_id TEXT;
ALTER TABLE template_families ADD COLUMN rollback_version_id TEXT;

-- 3. ADDITIVE COLUMNS FOR TEMPLATES (Part 28)
ALTER TABLE templates ADD COLUMN current_version_id TEXT;

-- 4. PERFORMANCE & CONCURRENCY INDEXES
CREATE INDEX IF NOT EXISTS idx_tv_is_current ON template_versions(template_id, is_current);
CREATE INDEX IF NOT EXISTS idx_tv_template_status ON template_versions(template_id, status);
CREATE INDEX IF NOT EXISTS idx_template_families_current_ver ON template_families(current_version_id);

-- 5. BACKFILL CURRENT VERSIONS FOR INITIAL DATA
UPDATE template_versions
SET is_current = 1
WHERE status = 'published' AND id IN (
  SELECT id FROM template_versions tv2
  WHERE tv2.template_id = template_versions.template_id
  ORDER BY version_number DESC
  LIMIT 1
);

UPDATE template_families
SET current_version_id = (
  SELECT tv.id 
  FROM template_versions tv 
  WHERE tv.template_id = SUBSTR(template_families.id, 5) AND tv.is_current = 1
  LIMIT 1
)
WHERE current_version_id IS NULL;

-- 6. RECORD MIGRATION IN _MIGRATIONS REGISTRY
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0013', '0013_part28_template_version_management.sql', '2026-10-08T10:00:00.000Z');
