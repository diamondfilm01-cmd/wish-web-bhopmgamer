-- ============================================================================
-- MIGRATION: 0030_part5_universal_runtime_publishing_immutability.sql
-- WishMagic Part 5 — Universal Template Runtime, Preview, Publishing & Public Wish Website Engine
-- Target Database: c08b683b-eb07-4639-ab33-fb1139bfb295
--
-- STRICT PRESERVATION RULES:
--   1. Zero drops, no table removals, zero truncations
--   2. ADDITIVE MIGRATION ONLY
--   3. Preserves all existing tables and records from Parts 1–29
-- ============================================================================

-- Add immutable runtime fields and publication tracking
ALTER TABLE wishes ADD COLUMN published_at TEXT;
ALTER TABLE wishes ADD COLUMN pinned_version_hash TEXT;

-- Index for fast public wish lookups by slug, status and lifecycle
CREATE INDEX IF NOT EXISTS idx_wishes_slug_status ON wishes(slug, status);
CREATE INDEX IF NOT EXISTS idx_wishes_active_snapshot ON wishes(active_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_wishes_pinned_version ON wishes(template_version_id, status);

-- Record migration in _migrations registry
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0030', '0030_part5_universal_runtime_publishing_immutability.sql', '2026-10-10T08:25:00.000Z');
