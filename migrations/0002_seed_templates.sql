-- ============================================================================
-- WishMagic Cloudflare D1 Template & Category Seed Data
-- Migration: 0002_seed_templates.sql
-- ============================================================================

-- Seed Categories
INSERT OR IGNORE INTO categories (id, name, slug, description, icon, sort_order, is_active, created_at, updated_at) VALUES
('cat_birthday', 'Birthday', 'birthday', 'Celebrate birthdays with 3D interactive cakes, candles, and music', '🎂', 1, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('cat_anniversary', 'Anniversary', 'anniversary', 'Golden moments and romantic keepsakes for couples', '💍', 2, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('cat_romantic', 'Romantic', 'romantic', 'Wax-sealed love letters, starlit night skies, and sweet memories', '💌', 3, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('cat_friendship', 'Friendship', 'friendship', 'Polaroid stacks and playful confetti for your best companions', '🎈', 4, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('cat_parents', 'Parents Tribute', 'parents-tribute', 'Heartfelt gratitude and everlasting warmth for Mom & Dad', '🌸', 5, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('cat_new_year', 'New Year & Midnight', 'new-year-midnight', 'Midnight countdown clocks and fireworks celebrations', '🎆', 6, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

-- Seed Default Admin User
INSERT OR IGNORE INTO users (id, email, display_name, avatar_url, role, plan, is_premium, provider, status, created_at, updated_at) VALUES
('usr_admin_999', 'admin@wishmagic.internal', 'Platform Admin', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80', 'admin', 'VIP', 1, 'system', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

-- Seed Admin Role Entry
INSERT OR IGNORE INTO admin_roles (id, user_id, role, permissions, granted_by, created_at) VALUES
('adm_role_super', 'usr_admin_999', 'SUPER_ADMIN', '["MANAGE_TEMPLATES","MANAGE_CATEGORIES","MANAGE_USERS","MANAGE_WISHES","VIEW_ANALYTICS","MANAGE_SETTINGS"]', 'system', '2026-01-01T00:00:00.000Z');
