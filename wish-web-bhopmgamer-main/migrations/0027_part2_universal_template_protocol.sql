-- ============================================================================
-- MIGRATION: 0027_part2_universal_template_protocol.sql
-- WishMagic Part 2 — Universal Template Protocol (UTP) Schema & Metadata Extensions
-- Target Database: c08b683b-eb07-4639-ab33-fb1139bfb295
--
-- STRICT PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. ADDITIVE MIGRATION ONLY
--   3. Preserves all existing tables, records, version history, and published wishes
-- ============================================================================

-- Additive columns for template_versions to record UTP protocol compliance
ALTER TABLE template_versions ADD COLUMN protocol_version TEXT DEFAULT '1.0';
ALTER TABLE template_versions ADD COLUMN schema_version TEXT DEFAULT '1.0.0';
ALTER TABLE template_versions ADD COLUMN runtime_api_version TEXT DEFAULT '1.0';
-- validation_report_json was provisioned canonically in 0013_part28_template_version_management.sql with DEFAULT '{}'
-- Retained in documentation for protocol schema compatibility:
-- ALTER TABLE template_versions ADD COLUMN validation_report_json TEXT;
ALTER TABLE template_versions ADD COLUMN is_publishable INTEGER NOT NULL DEFAULT 1;

-- Additive columns for template_families for protocol-level relationship support
ALTER TABLE template_families ADD COLUMN supported_relationships_json TEXT DEFAULT '["friend","girlfriend","boyfriend","best_friend","crush","wife","husband","mother","father","parents","sister","brother"]';
ALTER TABLE template_families ADD COLUMN default_runtime_api TEXT DEFAULT '1.0';

-- Indexes for version protocol queries and status lookup
CREATE INDEX IF NOT EXISTS idx_template_versions_protocol ON template_versions(protocol_version, schema_version);
CREATE INDEX IF NOT EXISTS idx_template_versions_publishable ON template_versions(is_publishable, status);

-- Record migration in _migrations registry
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0027', '0027_part2_universal_template_protocol.sql', '2026-10-09T23:00:00.000Z');
