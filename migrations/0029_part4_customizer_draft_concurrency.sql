-- ============================================================================
-- MIGRATION: 0029_part4_customizer_draft_concurrency.sql
-- WishMagic Part 4 — Universal Customizer Engine, Draft Optimistic Concurrency & Variant Indexing
-- Target Database: c08b683b-eb07-4639-ab33-fb1139bfb295
--
-- STRICT PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. ADDITIVE MIGRATION ONLY
--   3. Preserves all existing tables and records from Parts 1–28
-- ============================================================================

-- Add optimistic concurrency lock_version column to wishes for safe draft autosaving
ALTER TABLE wishes ADD COLUMN lock_version INTEGER DEFAULT 1;

-- Optimized indexes for draft filtering and creator queries
CREATE INDEX IF NOT EXISTS idx_wishes_user_status ON wishes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_wishes_template_version ON wishes(template_version_id);

-- Record migration in _migrations registry
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0029', '0029_part4_customizer_draft_concurrency.sql', '2026-10-10T07:20:00.000Z');
