-- ============================================================================
-- MIGRATION: 0011_part26_wish_lifecycle_and_favorites.sql
-- WishMagic Part 26 — My Wishes + Wish Lifecycle Management + Favorites Integration
--
-- Target Database: Cloudflare D1
-- STRICT PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. ADDITIVE MIGRATION ONLY
--   3. Preserves all existing tables, records, and relationships from Parts 1–25
-- ============================================================================

-- 1. Performance Indexes for User Wishes, Lifecycle State & Draft Management
CREATE INDEX IF NOT EXISTS idx_wishes_user_status ON wishes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_wishes_user_created ON wishes(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wishes_user_event_date ON wishes(user_id, event_date);

-- 2. Performance Indexes for User Favorites by Type
CREATE INDEX IF NOT EXISTS idx_favorites_user_type ON favorites(user_id, item_type);

-- 3. Record migration in _migrations registry
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0011', '0011_part26_wish_lifecycle_and_favorites.sql', '2026-10-08T08:00:00.000Z');
