-- ============================================================================
-- MIGRATION: 0026_part42_media_storage_inventory_reconciliation.sql
-- WishMagic Part 42 — Media Storage Inventory, Metadata & Audio Playback Repair
-- Target Database: c08b683b-eb07-4639-ab33-fb1139bfb295
--
-- STRICT PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. ADDITIVE MIGRATION ONLY
--   3. Preserves all existing tables, records, and relationships
-- ============================================================================

-- Additive columns for music_library
ALTER TABLE music_library ADD COLUMN original_filename TEXT;
ALTER TABLE music_library ADD COLUMN metadata_status TEXT DEFAULT 'verified';

-- Additive columns for wish_media
ALTER TABLE wish_media ADD COLUMN original_filename TEXT;
ALTER TABLE wish_media ADD COLUMN metadata_status TEXT DEFAULT 'verified';

-- Record migration in _migrations registry
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0026', '0026_part42_media_storage_inventory_reconciliation.sql', '2026-10-09T12:00:00.000Z');
