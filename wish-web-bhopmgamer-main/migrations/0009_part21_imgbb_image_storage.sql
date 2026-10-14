-- ============================================================================
-- MIGRATION: 0009_part21_imgbb_image_storage.sql
-- WishMagic Part 21 — Real ImgBB Image Storage + Template & User Media Management
--
-- Target Database: c08b683b-eb07-4639-ab33-fb1139bfb295
--
-- STRICT PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. ADDITIVE MIGRATION ONLY
--   3. Preserves all existing tables, records, and relationships from Parts 1–20
-- ============================================================================

-- 1. Additive columns for template_images (ImgBB Template Assets)
ALTER TABLE template_images ADD COLUMN template_id TEXT;
ALTER TABLE template_images ADD COLUMN delete_url TEXT;

CREATE INDEX IF NOT EXISTS idx_template_images_template_id ON template_images(template_id);
CREATE INDEX IF NOT EXISTS idx_template_images_provider_asset ON template_images(provider_asset_id);

-- 2. Additive columns for wish_media (Customer Wish Media backed by ImgBB)
ALTER TABLE wish_media ADD COLUMN storage_provider TEXT DEFAULT 'imgbb';
ALTER TABLE wish_media ADD COLUMN provider_asset_id TEXT;
ALTER TABLE wish_media ADD COLUMN display_url TEXT;
ALTER TABLE wish_media ADD COLUMN thumbnail_url TEXT;
ALTER TABLE wish_media ADD COLUMN delete_url TEXT;
ALTER TABLE wish_media ADD COLUMN sha256 TEXT;
ALTER TABLE wish_media ADD COLUMN width INTEGER;
ALTER TABLE wish_media ADD COLUMN height INTEGER;
ALTER TABLE wish_media ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE wish_media ADD COLUMN updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_wish_media_provider_asset ON wish_media(provider_asset_id);
CREATE INDEX IF NOT EXISTS idx_wish_media_status ON wish_media(status);
CREATE INDEX IF NOT EXISTS idx_wish_media_provider ON wish_media(storage_provider);

-- 3. Record migration in _migrations registry
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0009', '0009_part21_imgbb_image_storage.sql', '2026-10-08T06:00:00.000Z');
