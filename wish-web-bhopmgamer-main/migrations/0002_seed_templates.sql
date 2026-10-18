-- ============================================================================
-- WishMagic Cloudflare D1 Production Taxonomy Seed Data
-- Migration: 0002_seed_templates.sql
-- Note: Contains only pure production taxonomy definitions.
--       Zero hardcoded user accounts, demo passwords, or sample wishes.
-- ============================================================================

-- Seed Categories
INSERT OR IGNORE INTO categories (id, name, slug, description, icon, sort_order, is_active, created_at, updated_at) VALUES
('cat_birthday', 'Birthday', 'birthday', 'Celebrate birthdays with 3D interactive cakes, candles, and music', '🎂', 1, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('cat_anniversary', 'Anniversary', 'anniversary', 'Golden moments and romantic keepsakes for couples', '💍', 2, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('cat_romantic', 'Romantic', 'romantic', 'Wax-sealed love letters, starlit night skies, and sweet memories', '💌', 3, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('cat_friendship', 'Friendship', 'friendship', 'Polaroid stacks and playful confetti for your best companions', '🎈', 4, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('cat_parents', 'Parents Tribute', 'parents-tribute', 'Heartfelt gratitude and everlasting warmth for Mom & Dad', '🌸', 5, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('cat_new_year', 'New Year & Midnight', 'new-year-midnight', 'Midnight countdown clocks and fireworks celebrations', '🎆', 6, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
