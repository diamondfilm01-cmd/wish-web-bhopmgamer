-- ============================================================================
-- MIGRATION: 0008_part20_b2_template_storage.sql
-- WishMagic Part 20 — B2 Template Storage & Real Template Ingestion Pipeline
--
-- Target Database: c08b683b-eb07-4639-ab33-fb1139bfb295
--
-- STRICT PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. ADDITIVE MIGRATION ONLY
--   3. Preserves all existing tables and relationships from Parts 1–19
-- ============================================================================

-- Additive columns to template_versions for B2 immutable namespaces and hashes
ALTER TABLE template_versions ADD COLUMN template_family_id TEXT;
ALTER TABLE template_versions ADD COLUMN version_label TEXT DEFAULT 'v1.0.0';
ALTER TABLE template_versions ADD COLUMN source_zip_storage_key TEXT;
ALTER TABLE template_versions ADD COLUMN runtime_root_storage_key TEXT;
ALTER TABLE template_versions ADD COLUMN manifest_storage_key TEXT;
ALTER TABLE template_versions ADD COLUMN schema_hash TEXT;
ALTER TABLE template_versions ADD COLUMN runtime_hash TEXT;
ALTER TABLE template_versions ADD COLUMN source_zip_hash TEXT;
ALTER TABLE template_versions ADD COLUMN storage_provider TEXT DEFAULT 'b2';
ALTER TABLE template_versions ADD COLUMN storage_bucket TEXT;
ALTER TABLE template_versions ADD COLUMN storage_metadata_json TEXT DEFAULT '{}';
ALTER TABLE template_versions ADD COLUMN error_message TEXT;
ALTER TABLE template_versions ADD COLUMN published_at TEXT;
ALTER TABLE template_versions ADD COLUMN archived_at TEXT;

-- Safe indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_template_versions_family ON template_versions(template_family_id);
CREATE INDEX IF NOT EXISTS idx_template_versions_runtime_hash ON template_versions(runtime_hash);
CREATE INDEX IF NOT EXISTS idx_template_versions_provider ON template_versions(storage_provider);

-- Record migration in _migrations log
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0008', '0008_part20_b2_template_storage.sql', '2026-10-08T05:00:00.000Z');
