-- ============================================================================
-- WishMagic Cloudflare D1 Site Configuration
-- Migration: 0005_site_settings.sql
-- Description: Centralized server-side site settings storage for storefront,
--              hero CMS, brand parameters, maintenance mode, and FX.
-- ============================================================================

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'string', -- 'string', 'number', 'boolean', 'json'
  description TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_site_settings_key ON site_settings(key);

-- Seed default global site configuration
INSERT OR IGNORE INTO site_settings (key, value, type, description, updated_at, updated_by) VALUES
('hero_badge', 'Make Every Moment Magical ✨', 'string', 'Hero floating pill badge text', '2026-10-05T00:00:00.000Z', 'system'),
('hero_headline', 'Gift a <span class="bg-gradient-to-r from-[#F472B6] via-[#EC4899] to-[#F4C542] bg-clip-text text-transparent">Magical</span> Web-Experience!', 'string', 'Hero main headline (HTML allowed)', '2026-10-05T00:00:00.000Z', 'system'),
('hero_subheadline', 'Create beautiful personalized digital wishes that feel like a real experience — interactive 3D unboxing, customized music & unforgettable celebration magic.', 'string', 'Hero subheadline description', '2026-10-05T00:00:00.000Z', 'system'),
('hero_gift_icon', '🎁', 'string', 'Hero centerpiece visual element', '2026-10-05T00:00:00.000Z', 'system'),
('hero_style', 'cosmic-purple', 'string', 'Hero canvas background gradient style', '2026-10-05T00:00:00.000Z', 'system'),
('hero_cta1', 'Explore Magic', 'string', 'Primary CTA button text', '2026-10-05T00:00:00.000Z', 'system'),
('hero_cta2', 'Create Your Wish', 'string', 'Secondary CTA button text', '2026-10-05T00:00:00.000Z', 'system'),
('brand_name', 'WishMagic', 'string', 'Platform brand name', '2026-10-05T00:00:00.000Z', 'system'),
('support_wa', '+91 98765 43210', 'string', 'Support WhatsApp phone number', '2026-10-05T00:00:00.000Z', 'system'),
('currency', 'INR', 'string', 'Storefront default currency', '2026-10-05T00:00:00.000Z', 'system'),
('particle_fx', 'true', 'boolean', 'Ambient cosmic particle FX enabled', '2026-10-05T00:00:00.000Z', 'system'),
('maintenance_mode', 'false', 'boolean', 'Storefront maintenance mode active', '2026-10-05T00:00:00.000Z', 'system');

-- Record migration in _migrations table
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0005', '0005_site_settings.sql', '2026-10-05T00:00:00.000Z');
