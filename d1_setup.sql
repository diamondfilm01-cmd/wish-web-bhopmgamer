-- ============================================================================
-- WishMagic Cloudflare D1 Relational Database Schema
-- Migration: 0001_initial_schema.sql
-- Description: Core tables, indexes, and initial constraints for WishMagic
-- ============================================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'creator', -- 'creator', 'admin', 'editor'
  plan TEXT NOT NULL DEFAULT 'Free',    -- 'Free', 'VIP'
  is_premium INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'deactivated'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. SESSIONS TABLE (Server-side Session Storage)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- 3. ADMIN ROLES TABLE (RBAC)
CREATE TABLE IF NOT EXISTS admin_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'SUPER_ADMIN', 'ADMIN', 'EDITOR', 'ANALYST'
  permissions TEXT NOT NULL, -- JSON array of granted permission strings
  granted_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_roles_user ON admin_roles(user_id);

-- 4. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '✨',
  sort_order INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);

-- 5. TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  relationships TEXT,       -- JSON array
  tags TEXT,                -- JSON array
  type TEXT DEFAULT '3D Interactive',
  tier TEXT NOT NULL DEFAULT 'free', -- 'free', 'vip'
  price INTEGER NOT NULL DEFAULT 0,
  is_premium INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'published', -- 'published', 'draft', 'archived'
  featured INTEGER NOT NULL DEFAULT 0,
  placement INTEGER NOT NULL DEFAULT 99,
  thumbnail TEXT NOT NULL,
  preview_images TEXT,      -- JSON array
  capabilities TEXT,        -- JSON object
  detected_fields TEXT,     -- JSON array
  sections TEXT,            -- JSON array
  features TEXT,            -- JSON array
  theme TEXT,               -- JSON object
  folder TEXT NOT NULL,
  entry_file TEXT NOT NULL DEFAULT 'index.html',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_slug ON templates(slug);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status);
CREATE INDEX IF NOT EXISTS idx_templates_tier ON templates(tier);

-- 6. WISHES TABLE
CREATE TABLE IF NOT EXISTS wishes (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  order_id TEXT,
  template_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free', -- 'free', 'vip'
  price INTEGER NOT NULL DEFAULT 0,
  is_private INTEGER NOT NULL DEFAULT 0,
  buyer_name TEXT NOT NULL,
  buyer_contact TEXT,
  recipient_name TEXT NOT NULL,
  event_date TEXT NOT NULL,          -- YYYY-MM-DD
  expiry_date TEXT NOT NULL,         -- YYYY-MM-DD (End of grace window)
  lifecycle_status TEXT DEFAULT 'active',
  views INTEGER NOT NULL DEFAULT 0,
  custom_data TEXT NOT NULL,         -- Full custom data JSON
  payment TEXT,                      -- JSON object or NULL
  status TEXT NOT NULL DEFAULT 'published', -- 'published', 'draft', 'archived'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wishes_user_id ON wishes(user_id);
CREATE INDEX IF NOT EXISTS idx_wishes_slug ON wishes(slug);
CREATE INDEX IF NOT EXISTS idx_wishes_event_date ON wishes(event_date);
CREATE INDEX IF NOT EXISTS idx_wishes_created_at ON wishes(created_at);
CREATE INDEX IF NOT EXISTS idx_wishes_template_id ON wishes(template_id);

-- 7. WISH MEDIA TABLE (Cloudflare R2 Object References)
CREATE TABLE IF NOT EXISTS wish_media (
  id TEXT PRIMARY KEY,
  wish_id TEXT,
  user_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL, -- 'image', 'audio', 'voice_note'
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  url TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wish_media_wish_id ON wish_media(wish_id);
CREATE INDEX IF NOT EXISTS idx_wish_media_user_id ON wish_media(user_id);
CREATE INDEX IF NOT EXISTS idx_wish_media_key ON wish_media(object_key);

-- 8. FAVORITES TABLE (User <-> Template / Wish)
CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'template', -- 'template', 'wish'
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_user_item ON favorites(user_id, item_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

-- 9. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TEXT,
  related_type TEXT,
  related_id TEXT,
  action_url TEXT,
  icon TEXT DEFAULT 'notifications',
  severity TEXT DEFAULT 'info',
  metadata TEXT, -- JSON
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- 10. NOTIFICATION PREFERENCES TABLE
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  in_app INTEGER NOT NULL DEFAULT 1,
  email INTEGER NOT NULL DEFAULT 1,
  whatsapp INTEGER NOT NULL DEFAULT 0,
  marketing INTEGER NOT NULL DEFAULT 0,
  wish_reminders INTEGER NOT NULL DEFAULT 1,
  draft_reminders INTEGER NOT NULL DEFAULT 1,
  expiry_reminders INTEGER NOT NULL DEFAULT 1,
  product_updates INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 11. ORDERS & ENTITLEMENTS TABLE
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  provider TEXT NOT NULL DEFAULT 'manual', -- 'stripe', 'razorpay', 'upi', 'sandbox'
  provider_order_id TEXT,
  transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',  -- 'PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  verified_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- 12. ANALYTICS EVENTS TABLE
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  user_id TEXT DEFAULT 'guest',
  wish_id TEXT,
  slug TEXT,
  template_id TEXT,
  template_name TEXT,
  category TEXT,
  recipient_name TEXT,
  metadata TEXT, -- JSON
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics_events(user_id);

-- 13. SYSTEM ANNOUNCEMENTS TABLE
CREATE TABLE IF NOT EXISTS system_announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT DEFAULT 'info',
  is_active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  created_at TEXT NOT NULL
);
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
-- ============================================================================
-- WishMagic Cloudflare D1 Production Schema Finalization
-- Migration: 0003_complete_production_schema.sql
-- Description: Adds wish_sections, template_versions, entitlements,
--              migration tracking, foreign key cascades, and query indexes.
-- ============================================================================

-- 1. MIGRATION TRACKING TABLE
CREATE TABLE IF NOT EXISTS _migrations (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  applied_at TEXT NOT NULL
);

-- Record prior migrations if table is newly created
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0001', '0001_initial_schema.sql', '2026-01-01T00:00:00.000Z'),
('mig_0002', '0002_seed_templates.sql', '2026-01-01T00:00:00.000Z'),
('mig_0003', '0003_complete_production_schema.sql', '2026-10-04T00:00:00.000Z');

-- 2. WISH SECTIONS TABLE (Normalized Section Ordering & Configuration)
CREATE TABLE IF NOT EXISTS wish_sections (
  id TEXT PRIMARY KEY,
  wish_id TEXT NOT NULL,
  section_type TEXT NOT NULL, -- 'hero', 'letter', 'photos', 'timeline', 'audio', 'voice', 'envelope', 'memories', 'vault'
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  section_data TEXT NOT NULL DEFAULT '{}', -- JSON configuration payload
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (wish_id) REFERENCES wishes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wish_sections_wish_id ON wish_sections(wish_id);
CREATE INDEX IF NOT EXISTS idx_wish_sections_order ON wish_sections(wish_id, sort_order);

-- 3. TEMPLATE VERSIONS TABLE (Immutable Snapshot Protection for Published Wishes)
CREATE TABLE IF NOT EXISTS template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  sections TEXT,      -- JSON array of section definitions
  capabilities TEXT,  -- JSON object of supported template capabilities
  created_at TEXT NOT NULL,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_versions_unique ON template_versions(template_id, version_number);
CREATE INDEX IF NOT EXISTS idx_template_versions_template ON template_versions(template_id);

-- 4. ENTITLEMENTS TABLE (Server-Authoritative User Feature Access)
CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free', -- 'free', 'vip'
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'expired', 'revoked'
  source TEXT NOT NULL DEFAULT 'purchase', -- 'purchase', 'admin_grant', 'promo', 'sandbox'
  starts_at TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entitlements_user_id ON entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_status ON entitlements(status);

-- 5. COMPOSITE QUERY OPTIMIZATION INDEXES
CREATE INDEX IF NOT EXISTS idx_wishes_user_status ON wishes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_analytics_event_time ON analytics_events(event_name, timestamp);
-- ============================================================================
-- WishMagic Cloudflare D1 Staff Management & Admin Audit Logging
-- Migration: 0004_admin_staff_and_audit_logs.sql
-- Description: Adds staff management, password hashing support, Firebase UID mapping,
--              and tamper-evident admin audit logging.
-- ============================================================================

-- 1. ADMIN STAFF TABLE
CREATE TABLE IF NOT EXISTS admin_staff (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  mobile TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'EDITOR', -- 'OWNER', 'ADMIN', 'MANAGER', 'EDITOR', 'SUPPORT', 'ANALYST'
  permissions TEXT NOT NULL DEFAULT '[]', -- JSON array of permission keys
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'disabled', 'suspended'
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  firebase_uid TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_staff_mobile ON admin_staff(mobile);
CREATE INDEX IF NOT EXISTS idx_admin_staff_role ON admin_staff(role);
CREATE INDEX IF NOT EXISTS idx_admin_staff_status ON admin_staff(status);

-- 2. ADMIN AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL, -- e.g. 'ADMIN_LOGIN', 'STAFF_CREATED', 'STAFF_DISABLED', 'ROLE_CHANGED'
  target_type TEXT,     -- 'staff', 'template', 'wish', 'user', 'settings'
  target_id TEXT,
  details TEXT,         -- JSON payload of non-sensitive changes
  ip_address TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor ON admin_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs(created_at);

-- Record migration in _migrations table
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0004', '0004_admin_staff_and_audit_logs.sql', '2026-10-04T00:00:00.000Z');
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
-- ============================================================================
-- WishMagic Cloudflare D1 Template Version Snapshot System
-- Migration: 0006_template_version_snapshots.sql
-- Description: Adds template_version_id to wishes table, establishes
--              immutable snapshot schema for template_versions, and ensures
--              proper composite indexes for high-speed version resolution.
-- ============================================================================

-- 1. Ensure template_versions table with complete snapshot columns
CREATE TABLE IF NOT EXISTS template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  tier TEXT DEFAULT 'free',
  price INTEGER DEFAULT 0,
  thumbnail TEXT,
  theme TEXT,          -- JSON object
  sections TEXT,       -- JSON array of section definitions
  capabilities TEXT,   -- JSON object of supported template capabilities
  layout TEXT,         -- Layout style / preset
  animations TEXT,     -- JSON object
  default_config TEXT, -- JSON object of default customization options
  snapshot_data TEXT,  -- Full immutable JSON snapshot of all render-critical template data
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'archived'
  created_at TEXT NOT NULL,
  created_by TEXT DEFAULT 'system',
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_versions_unique ON template_versions(template_id, version_number);
CREATE INDEX IF NOT EXISTS idx_template_versions_template ON template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_template_versions_status ON template_versions(status);

-- 2. Add template_version_id to wishes table
ALTER TABLE wishes ADD COLUMN template_version_id TEXT;
CREATE INDEX IF NOT EXISTS idx_wishes_template_version_id ON wishes(template_version_id);


-- ============================================================================
-- WishMagic Cloudflare D1 Final Architecture Migration (Part 19)
-- Migration: 0007_part19_final_d1_schema_and_mappings.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description:
--   Central source-of-truth normalization for:
--   1. template_families
--   2. relationships (normalized registry: girlfriend, boyfriend, crush, friend, parents, etc.)
--   3. template_relationships (many-to-many mapping: templates/families <-> relationships)
--   4. template_relationship_variants (version-aware config: atmosphere, colors, text, defaults)
--   5. template_fields (normalized slots/fields registry with validation & capabilities)
--   6. template_files (B2 template code file references: relative_path, sha256, storage_key)
--   7. template_images (ImgBB image asset references with relationship tags & dimensions)
--   8. music_library (Centralized audio library with B2 storage keys & relationship suitability)
--   9. template_music (Template version & variant <-> music library mappings)
--   10. wish_media_mappings (Critical Wish slot resolver: Wish -> field_key -> wish_media -> URL)
--   11. storage_providers (Provider abstraction: imgbb, b2, r2, future)
--   12. Additive columns for existing template_versions, templates, wishes, wish_media
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. STORAGE PROVIDERS REGISTRY (Abstraction Layer)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS storage_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL, -- 'images', 'files', 'audio', 'hybrid'
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'read_only', 'archived'
  config_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO storage_providers (id, name, provider_type, status, config_json, created_at, updated_at) VALUES
('imgbb', 'ImgBB Image Hosting', 'images', 'active', '{"max_mb":32,"allowed_mime":["image/jpeg","image/png","image/webp","image/gif"]}', '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
('b2', 'Backblaze B2 Cloud Storage', 'files', 'active', '{"bucket":"wishmagic-prod","allowed_mime":["text/html","text/css","application/javascript","audio/mpeg","audio/wav","audio/ogg"]}', '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
('r2', 'Cloudflare R2 Object Storage', 'hybrid', 'active', '{"bucket":"wishmagic-media"}', '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z');

-- ----------------------------------------------------------------------------
-- 2. TEMPLATE FAMILIES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS template_families (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  thumbnail TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'celebration',
  tier TEXT NOT NULL DEFAULT 'free', -- 'free', 'vip'
  price INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_premium INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published', -- 'published', 'draft', 'archived'
  visibility TEXT NOT NULL DEFAULT 'public', -- 'public', 'unlisted', 'private'
  created_by TEXT DEFAULT 'system',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_template_families_slug ON template_families(slug);
CREATE INDEX IF NOT EXISTS idx_template_families_status ON template_families(status);
CREATE INDEX IF NOT EXISTS idx_template_families_category ON template_families(category);
CREATE INDEX IF NOT EXISTS idx_template_families_tier ON template_families(tier);

-- ----------------------------------------------------------------------------
-- 3. RELATIONSHIPS TABLE (Normalized Central Registry)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  icon TEXT DEFAULT '❤️',
  category TEXT DEFAULT 'general', -- 'romantic', 'family', 'friends', 'celebration'
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'disabled'
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_relationships_slug ON relationships(slug);
CREATE INDEX IF NOT EXISTS idx_relationships_status ON relationships(status);
CREATE INDEX IF NOT EXISTS idx_relationships_sort_order ON relationships(sort_order);

-- Seed Standard Normalized Relationships
INSERT OR IGNORE INTO relationships (id, slug, name, display_name, icon, category, status, sort_order, created_at, updated_at) VALUES
('rel_girlfriend', 'girlfriend', 'Girlfriend', 'Dearest Girlfriend', '💖', 'romantic', 'active', 1, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
('rel_boyfriend', 'boyfriend', 'Boyfriend', 'Handsome Boyfriend', '💙', 'romantic', 'active', 2, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
('rel_crush', 'crush', 'Crush', 'Secret Crush', '✨', 'romantic', 'active', 3, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
('rel_wife', 'wife', 'Wife', 'Beloved Wife', '💍', 'romantic', 'active', 4, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
('rel_husband', 'husband', 'Husband', 'Loving Husband', '👑', 'romantic', 'active', 5, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
('rel_friend', 'friend', 'Friend', 'Best Friend Forever', '🎈', 'friends', 'active', 6, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
('rel_mother', 'mother', 'Mother', 'Dearest Mummy / Mother', '🌸', 'family', 'active', 7, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
('rel_father', 'father', 'Father', 'Respected Papa / Father', '🌟', 'family', 'active', 8, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
('rel_brother', 'brother', 'Brother', 'Cherished Brother', '🚀', 'family', 'active', 9, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
('rel_sister', 'sister', 'Sister', 'Sweet Sister', '🎀', 'family', 'active', 10, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
('rel_parents', 'parents', 'Parents Tribute', 'Mom & Dad Together', '🌺', 'family', 'active', 11, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z');

-- ----------------------------------------------------------------------------
-- 4. TEMPLATE <-> RELATIONSHIP MAPPING TABLE (Many-to-Many Filter Support)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS template_relationships (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  template_family_id TEXT,
  template_version_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
  FOREIGN KEY (relationship_id) REFERENCES relationships(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_relationships_unique ON template_relationships(template_id, relationship_id);
CREATE INDEX IF NOT EXISTS idx_template_relationships_template ON template_relationships(template_id);
CREATE INDEX IF NOT EXISTS idx_template_relationships_relationship ON template_relationships(relationship_id);
CREATE INDEX IF NOT EXISTS idx_template_relationships_family ON template_relationships(template_family_id);
CREATE INDEX IF NOT EXISTS idx_template_relationships_version ON template_relationships(template_version_id);

-- ----------------------------------------------------------------------------
-- 5. TEMPLATE RELATIONSHIP VARIANTS TABLE (Atmosphere & Configuration Overrides)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS template_relationship_variants (
  id TEXT PRIMARY KEY,
  template_version_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  name TEXT NOT NULL,
  configuration_json TEXT NOT NULL DEFAULT '{}', -- Safe JSON: theme, palette, texts, animations, defaults
  schema_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'archived'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (template_version_id) REFERENCES template_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (relationship_id) REFERENCES relationships(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_rel_variants_unique ON template_relationship_variants(template_version_id, relationship_id);
CREATE INDEX IF NOT EXISTS idx_template_rel_variants_version ON template_relationship_variants(template_version_id);
CREATE INDEX IF NOT EXISTS idx_template_rel_variants_relationship ON template_relationship_variants(relationship_id);
CREATE INDEX IF NOT EXISTS idx_template_rel_variants_status ON template_relationship_variants(status);

-- ----------------------------------------------------------------------------
-- 6. TEMPLATE FIELDS / SLOTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS template_fields (
  id TEXT PRIMARY KEY,
  template_version_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_type TEXT NOT NULL, -- 'text', 'textarea', 'date', 'image', 'audio', 'voice', 'color', 'toggle', 'range', 'select'
  label TEXT NOT NULL,
  placeholder TEXT,
  help_text TEXT,
  is_required INTEGER NOT NULL DEFAULT 0,
  default_value TEXT,
  validation_json TEXT DEFAULT '{}',
  capabilities_json TEXT DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  group_name TEXT DEFAULT 'personal',
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'hidden', 'retired'
  created_at TEXT NOT NULL,
  FOREIGN KEY (template_version_id) REFERENCES template_versions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_fields_unique ON template_fields(template_version_id, field_key);
CREATE INDEX IF NOT EXISTS idx_template_fields_version ON template_fields(template_version_id);
CREATE INDEX IF NOT EXISTS idx_template_fields_key ON template_fields(field_key);

-- ----------------------------------------------------------------------------
-- 7. TEMPLATE FILES TABLE (B2 Code Storage Index)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS template_files (
  id TEXT PRIMARY KEY,
  template_version_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'b2',
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  file_role TEXT DEFAULT 'asset', -- 'entry_html', 'stylesheet', 'script', 'asset', 'font', 'manifest'
  is_entry_file INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'archived'
  created_at TEXT NOT NULL,
  FOREIGN KEY (template_version_id) REFERENCES template_versions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_files_unique ON template_files(template_version_id, relative_path);
CREATE INDEX IF NOT EXISTS idx_template_files_version ON template_files(template_version_id);
CREATE INDEX IF NOT EXISTS idx_template_files_key ON template_files(storage_key);

-- ----------------------------------------------------------------------------
-- 8. TEMPLATE IMAGE ASSETS TABLE (ImgBB Image References)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS template_images (
  id TEXT PRIMARY KEY,
  template_version_id TEXT NOT NULL,
  asset_key TEXT NOT NULL, -- e.g. 'hero_photo', 'cover_photo', 'bg_photo', 'preview_1'
  original_filename TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'imgbb',
  provider_asset_id TEXT,
  original_url TEXT NOT NULL,
  display_url TEXT NOT NULL,
  thumbnail_url TEXT,
  relationship_id TEXT, -- Optional: variant-specific image tag
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'archived', 'retired'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (template_version_id) REFERENCES template_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (relationship_id) REFERENCES relationships(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_template_images_version ON template_images(template_version_id);
CREATE INDEX IF NOT EXISTS idx_template_images_asset_key ON template_images(asset_key);
CREATE INDEX IF NOT EXISTS idx_template_images_rel ON template_images(relationship_id);
CREATE INDEX IF NOT EXISTS idx_template_images_status ON template_images(status);

-- ----------------------------------------------------------------------------
-- 9. MUSIC LIBRARY TABLE (B2 Audio Storage Index)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS music_library (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT DEFAULT 'WishMagic Studio',
  description TEXT,
  category TEXT NOT NULL DEFAULT 'celebration', -- 'romantic', 'celebration', 'acoustic', 'party', 'peaceful'
  relationship_suitability TEXT DEFAULT '[]', -- JSON array of relationship slugs
  storage_provider TEXT NOT NULL DEFAULT 'b2',
  storage_key TEXT NOT NULL,
  playback_url TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'audio/mpeg',
  duration_seconds INTEGER DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'archived', 'retired'
  is_featured INTEGER NOT NULL DEFAULT 0,
  created_by TEXT DEFAULT 'system',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_music_library_category ON music_library(category);
CREATE INDEX IF NOT EXISTS idx_music_library_status ON music_library(status);
CREATE INDEX IF NOT EXISTS idx_music_library_featured ON music_library(is_featured);

-- Seed Initial Built-in Curated Celebration Tracks
INSERT OR IGNORE INTO music_library (id, title, artist, description, category, relationship_suitability, storage_provider, storage_key, playback_url, mime_type, duration_seconds, size_bytes, status, is_featured, created_at, updated_at) VALUES
('mus_celebration_strings', 'Celebration Acoustic Strings', 'WishMagic Ensemble', 'Uplifting joyful strings and acoustic melody', 'celebration', '["friend","brother","sister","parents"]', 'b2', 'music/celebration-acoustic-strings.mp3', 'https://assets.wishmagic.live/music/celebration-strings.mp3', 'audio/mpeg', 160, 3145728, 'active', 1, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
('mus_romantic_piano', 'Romantic Midnight Piano', 'WishMagic Serenades', 'Gentle lyrical piano ballad for intimate celebrations', 'romantic', '["girlfriend","boyfriend","crush","wife","husband"]', 'b2', 'music/romantic-midnight-piano.mp3', 'https://assets.wishmagic.live/music/romantic-piano.mp3', 'audio/mpeg', 180, 4194304, 'active', 1, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
('mus_golden_elegance', 'Golden Nostalgia & Acoustic Cello', 'WishMagic Classical', 'Warm acoustic guitar and cello honoring parents and family', 'peaceful', '["mother","father","parents","wife","husband"]', 'b2', 'music/golden-nostalgia-cello.mp3', 'https://assets.wishmagic.live/music/golden-nostalgia.mp3', 'audio/mpeg', 210, 5242880, 'active', 1, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z');

-- ----------------------------------------------------------------------------
-- 10. TEMPLATE <-> MUSIC MAPPING TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS template_music (
  id TEXT PRIMARY KEY,
  template_version_id TEXT NOT NULL,
  music_id TEXT NOT NULL,
  relationship_variant_id TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (template_version_id) REFERENCES template_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (music_id) REFERENCES music_library(id) ON DELETE RESTRICT,
  FOREIGN KEY (relationship_variant_id) REFERENCES template_relationship_variants(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_music_unique ON template_music(template_version_id, music_id, relationship_variant_id);
CREATE INDEX IF NOT EXISTS idx_template_music_version ON template_music(template_version_id);
CREATE INDEX IF NOT EXISTS idx_template_music_song ON template_music(music_id);
CREATE INDEX IF NOT EXISTS idx_template_music_variant ON template_music(relationship_variant_id);

-- ----------------------------------------------------------------------------
-- 11. WISH MEDIA MAPPINGS TABLE (Critical Wish Slot Resolver)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wish_media_mappings (
  id TEXT PRIMARY KEY,
  wish_id TEXT NOT NULL,
  template_version_id TEXT,
  field_key TEXT NOT NULL, -- e.g. 'hero_photo', 'photo_1', 'photo_2', 'cover_photo', 'voice_note'
  media_id TEXT NOT NULL,
  section_key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (wish_id) REFERENCES wishes(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES wish_media(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wish_media_mappings_unique ON wish_media_mappings(wish_id, field_key, media_id);
CREATE INDEX IF NOT EXISTS idx_wish_media_mappings_wish ON wish_media_mappings(wish_id);
CREATE INDEX IF NOT EXISTS idx_wish_media_mappings_field ON wish_media_mappings(field_key);
CREATE INDEX IF NOT EXISTS idx_wish_media_mappings_media ON wish_media_mappings(media_id);

-- ----------------------------------------------------------------------------
-- 12. BACKFILL INITIAL TEMPLATES INTO FAMILIES & RELATIONSHIPS
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO template_families (id, slug, name, description, thumbnail, category, tier, price, is_featured, is_premium, status, created_at, updated_at)
SELECT 
  'fam_' || id,
  slug,
  name,
  description,
  thumbnail,
  category,
  tier,
  price,
  featured,
  is_premium,
  status,
  created_at,
  updated_at
FROM templates;

-- Link templates to standard relationships based on category and tags
INSERT OR IGNORE INTO template_relationships (id, template_id, relationship_id, template_family_id, enabled, sort_order, created_at)
SELECT 
  'trel_' || t.id || '_friend',
  t.id,
  'rel_friend',
  'fam_' || t.id,
  1,
  1,
  t.created_at
FROM templates t;

INSERT OR IGNORE INTO template_relationships (id, template_id, relationship_id, template_family_id, enabled, sort_order, created_at)
SELECT 
  'trel_' || t.id || '_girlfriend',
  t.id,
  'rel_girlfriend',
  'fam_' || t.id,
  1,
  2,
  t.created_at
FROM templates t
WHERE t.category IN ('Romantic', 'Anniversary', 'Love', 'Birthday');

INSERT OR IGNORE INTO template_relationships (id, template_id, relationship_id, template_family_id, enabled, sort_order, created_at)
SELECT 
  'trel_' || t.id || '_boyfriend',
  t.id,
  'rel_boyfriend',
  'fam_' || t.id,
  1,
  3,
  t.created_at
FROM templates t
WHERE t.category IN ('Romantic', 'Anniversary', 'Love', 'Birthday');

INSERT OR IGNORE INTO template_relationships (id, template_id, relationship_id, template_family_id, enabled, sort_order, created_at)
SELECT 
  'trel_' || t.id || '_crush',
  t.id,
  'rel_crush',
  'fam_' || t.id,
  1,
  4,
  t.created_at
FROM templates t
WHERE t.category IN ('Romantic', 'Love');

-- ----------------------------------------------------------------------------
-- 13. RECORD MIGRATION IN _MIGRATIONS
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0007', '0007_part19_final_d1_schema_and_mappings.sql', '2026-10-08T04:30:00.000Z');

-- ----------------------------------------------------------------------------
-- 14. PART 20: B2 TEMPLATE STORAGE & VERSION HASH ARCHITECTURE
-- ----------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_template_versions_family ON template_versions(template_family_id);
CREATE INDEX IF NOT EXISTS idx_template_versions_runtime_hash ON template_versions(runtime_hash);
CREATE INDEX IF NOT EXISTS idx_template_versions_provider ON template_versions(storage_provider);

INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0008', '0008_part20_b2_template_storage.sql', '2026-10-08T05:00:00.000Z');

-- ----------------------------------------------------------------------------
-- 15. PART 21: IMGBB IMAGE STORAGE & TEMPLATE IMAGE EXTENSIONS
-- ----------------------------------------------------------------------------
ALTER TABLE template_images ADD COLUMN template_id TEXT;
ALTER TABLE template_images ADD COLUMN delete_url TEXT;

CREATE INDEX IF NOT EXISTS idx_template_images_template_id ON template_images(template_id);
CREATE INDEX IF NOT EXISTS idx_template_images_provider_asset ON template_images(provider_asset_id);

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

INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0009', '0009_part21_imgbb_image_storage.sql', '2026-10-08T06:00:00.000Z');

-- ----------------------------------------------------------------------------
-- 16. PART 25: PUBLISHED WISH SNAPSHOTS & IMMUTABLE RENDERER ARCHITECTURE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wish_publication_snapshots (
  id TEXT PRIMARY KEY,
  wish_id TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  snapshot_version INTEGER NOT NULL DEFAULT 1,
  template_family_id TEXT,
  template_id TEXT NOT NULL,
  template_version_id TEXT NOT NULL,
  relationship_id TEXT,
  relationship_variant_id TEXT,
  recipient_name TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  theme_config_json TEXT NOT NULL DEFAULT '{}',
  content_json TEXT NOT NULL DEFAULT '{}',
  sections_json TEXT NOT NULL DEFAULT '[]',
  media_manifest_json TEXT NOT NULL DEFAULT '{}',
  music_manifest_json TEXT NOT NULL DEFAULT '{}',
  effects_config_json TEXT NOT NULL DEFAULT '{}',
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  tier TEXT NOT NULL DEFAULT 'free',
  is_private INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (wish_id) REFERENCES wishes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wish_pub_snapshots_wish_id ON wish_publication_snapshots(wish_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wish_pub_snapshots_slug ON wish_publication_snapshots(slug);
CREATE INDEX IF NOT EXISTS idx_wish_pub_snapshots_template_version ON wish_publication_snapshots(template_version_id);
CREATE INDEX IF NOT EXISTS idx_wish_pub_snapshots_event_date ON wish_publication_snapshots(event_date);

ALTER TABLE wishes ADD COLUMN active_snapshot_id TEXT;
CREATE INDEX IF NOT EXISTS idx_wishes_active_snapshot_id ON wishes(active_snapshot_id);

INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0010', '0010_part25_published_wish_snapshots.sql', '2026-10-08T07:30:00.000Z');

-- ----------------------------------------------------------------------------
-- 17. PART 26: WISH LIFECYCLE MANAGEMENT & FAVORITES PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_wishes_user_status ON wishes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_wishes_user_created ON wishes(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wishes_user_event_date ON wishes(user_id, event_date);
CREATE INDEX IF NOT EXISTS idx_favorites_user_type ON favorites(user_id, item_type);

INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0011', '0011_part26_wish_lifecycle_and_favorites.sql', '2026-10-08T08:00:00.000Z');

-- ----------------------------------------------------------------------------
-- 18. PART 27: TEMPLATE FAMILY & RELATIONSHIP VARIANT MANAGEMENT ARCHITECTURE
-- ----------------------------------------------------------------------------
ALTER TABLE template_relationship_variants ADD COLUMN version_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE template_relationship_variants ADD COLUMN parent_variant_id TEXT;
ALTER TABLE template_relationship_variants ADD COLUMN is_latest INTEGER NOT NULL DEFAULT 1;
ALTER TABLE template_relationship_variants ADD COLUMN lock_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE template_relationship_variants ADD COLUMN template_id TEXT;
ALTER TABLE template_relationship_variants ADD COLUMN template_family_id TEXT;
ALTER TABLE template_relationship_variants ADD COLUMN published_at TEXT;

ALTER TABLE template_versions ADD COLUMN fields_json TEXT DEFAULT '[]';
ALTER TABLE template_versions ADD COLUMN theme_defaults_json TEXT DEFAULT '{}';
ALTER TABLE template_versions ADD COLUMN effects_defaults_json TEXT DEFAULT '{}';

ALTER TABLE template_music ADD COLUMN relationship_id TEXT;

CREATE INDEX IF NOT EXISTS idx_trv_version_number ON template_relationship_variants(template_version_id, version_number);
CREATE INDEX IF NOT EXISTS idx_trv_template_status ON template_relationship_variants(template_id, status);
CREATE INDEX IF NOT EXISTS idx_trv_is_latest ON template_relationship_variants(is_latest);
CREATE INDEX IF NOT EXISTS idx_template_music_rel ON template_music(relationship_id);

INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0012', '0012_part27_template_family_variants.sql', '2026-10-08T09:30:00.000Z');

-- ----------------------------------------------------------------------------
-- 19. PART 28: TEMPLATE VERSION CONTROL, RELEASE PIPELINE & ROLLBACK ARCHITECTURE
-- ----------------------------------------------------------------------------
ALTER TABLE template_versions ADD COLUMN release_notes TEXT DEFAULT '';
ALTER TABLE template_versions ADD COLUMN published_by TEXT;
ALTER TABLE template_versions ADD COLUMN manifest_json TEXT DEFAULT '{}';
ALTER TABLE template_versions ADD COLUMN file_count INTEGER DEFAULT 0;
ALTER TABLE template_versions ADD COLUMN total_size_bytes INTEGER DEFAULT 0;
ALTER TABLE template_versions ADD COLUMN entry_point TEXT DEFAULT 'index.html';
ALTER TABLE template_versions ADD COLUMN integrity_status TEXT DEFAULT 'unverified';
ALTER TABLE template_versions ADD COLUMN integrity_checked_at TEXT;
ALTER TABLE template_versions ADD COLUMN validation_report_json TEXT DEFAULT '{}';
ALTER TABLE template_versions ADD COLUMN lock_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE template_versions ADD COLUMN is_current INTEGER NOT NULL DEFAULT 0;

ALTER TABLE template_families ADD COLUMN current_version_id TEXT;
ALTER TABLE template_families ADD COLUMN rollback_version_id TEXT;

ALTER TABLE templates ADD COLUMN current_version_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tv_is_current ON template_versions(template_id, is_current);
CREATE INDEX IF NOT EXISTS idx_tv_template_status ON template_versions(template_id, status);
CREATE INDEX IF NOT EXISTS idx_template_families_current_ver ON template_families(current_version_id);

INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0013', '0013_part28_template_version_management.sql', '2026-10-08T10:00:00.000Z');

-- ----------------------------------------------------------------------------
-- 20. PART 34: CUSTOMER SUPPORT, HELP CENTER & TICKET MANAGEMENT
-- ----------------------------------------------------------------------------
ALTER TABLE support_tickets ADD COLUMN order_id TEXT;
ALTER TABLE support_tickets ADD COLUMN user_name TEXT;
ALTER TABLE support_tickets ADD COLUMN last_customer_message_at TEXT;
ALTER TABLE support_tickets ADD COLUMN last_agent_response_at TEXT;
ALTER TABLE support_tickets ADD COLUMN resolved_at TEXT;
ALTER TABLE support_tickets ADD COLUMN closed_at TEXT;
ALTER TABLE support_tickets ADD COLUMN reopen_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE support_tickets ADD COLUMN satisfaction_rating INTEGER;
ALTER TABLE support_tickets ADD COLUMN satisfaction_feedback TEXT;
ALTER TABLE support_tickets ADD COLUMN contact_preference TEXT DEFAULT 'in_app';

CREATE INDEX IF NOT EXISTS idx_support_tickets_order ON support_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status ON support_tickets(user_id, status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  sender_type TEXT NOT NULL, -- 'user', 'admin', 'system'
  sender_id TEXT NOT NULL,
  sender_name TEXT,
  message TEXT NOT NULL,
  is_internal_note INTEGER NOT NULL DEFAULT 0,
  attachments_json TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON support_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created ON support_ticket_messages(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS support_attachments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  message_id TEXT,
  user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  url TEXT NOT NULL,
  storage_provider TEXT DEFAULT 'imgbb',
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_support_attachments_ticket ON support_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_attachments_user ON support_attachments(user_id);

CREATE TABLE IF NOT EXISTS help_articles (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  icon TEXT DEFAULT 'help_outline',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1,
  view_count INTEGER NOT NULL DEFAULT 0,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  not_helpful_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_help_articles_category ON help_articles(category_id, is_published);
CREATE INDEX IF NOT EXISTS idx_help_articles_slug ON help_articles(slug);
CREATE INDEX IF NOT EXISTS idx_help_articles_sort ON help_articles(sort_order);

INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0019', '0019_part34_customer_support_and_help_center.sql', '2026-10-09T03:00:00.000Z');

-- ----------------------------------------------------------------------------
-- 21. PART 35: USER ACCOUNT CENTER, PRIVACY CONTROLS & SESSION SECURITY
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_privacy_settings (
  user_id TEXT PRIMARY KEY,
  profile_visibility TEXT NOT NULL DEFAULT 'public',
  search_engine_indexing INTEGER NOT NULL DEFAULT 1,
  analytics_tracking INTEGER NOT NULL DEFAULT 1,
  marketing_emails INTEGER NOT NULL DEFAULT 0,
  activity_telemetry INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_privacy_user_id ON user_privacy_settings(user_id);

CREATE TABLE IF NOT EXISTS user_security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  device_info TEXT,
  details_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_security_events_user ON user_security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON user_security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON user_security_events(created_at);

CREATE TABLE IF NOT EXISTS user_data_exports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY',
  format TEXT NOT NULL DEFAULT 'json',
  summary_json TEXT DEFAULT '{}',
  payload_json TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  requested_at TEXT NOT NULL,
  completed_at TEXT,
  downloaded_at TEXT,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_data_exports_user ON user_data_exports(user_id);
CREATE INDEX IF NOT EXISTS idx_data_exports_status ON user_data_exports(status);
CREATE INDEX IF NOT EXISTS idx_data_exports_expires ON user_data_exports(expires_at);

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reason TEXT,
  feedback TEXT,
  wishes_handling TEXT NOT NULL DEFAULT 'retain_grace',
  financial_records_retained INTEGER NOT NULL DEFAULT 1,
  requested_at TEXT NOT NULL,
  grace_period_ends_at TEXT NOT NULL,
  cancelled_at TEXT,
  completed_at TEXT,
  admin_notes TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON account_deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON account_deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_grace ON account_deletion_requests(grace_period_ends_at);

INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0020', '0020_part35_account_privacy_security_management.sql', '2026-10-09T04:00:00.000Z');

-- ----------------------------------------------------------------------------
-- 22. PART 36: REFERRAL PROGRAM, REWARD LEDGER & FRAUD PREVENTION
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referral_programs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  qualifying_event TEXT NOT NULL DEFAULT 'FIRST_WISH',
  referrer_reward_type TEXT NOT NULL DEFAULT 'PREMIUM_DAYS',
  referrer_reward_amount INTEGER NOT NULL DEFAULT 7,
  referee_reward_type TEXT NOT NULL DEFAULT 'PREMIUM_DAYS',
  referee_reward_amount INTEGER NOT NULL DEFAULT 3,
  max_referrals_per_user INTEGER NOT NULL DEFAULT 50,
  attribution_window_days INTEGER NOT NULL DEFAULT 30,
  require_admin_approval INTEGER NOT NULL DEFAULT 0,
  fraud_strictness TEXT NOT NULL DEFAULT 'standard',
  terms_summary TEXT DEFAULT 'Invite friends to WishMagic. When they create their first celebration wish, both of you earn exclusive VIP access.',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO referral_programs (
  id, name, is_active, qualifying_event,
  referrer_reward_type, referrer_reward_amount,
  referee_reward_type, referee_reward_amount,
  max_referrals_per_user, attribution_window_days,
  require_admin_approval, fraud_strictness,
  terms_summary, created_at, updated_at
) VALUES (
  'default_program',
  'WishMagic Friends & Family Rewards',
  1,
  'FIRST_WISH',
  'PREMIUM_DAYS',
  7,
  'PREMIUM_DAYS',
  3,
  50,
  30,
  0,
  'standard',
  'Invite friends to WishMagic. When they create and publish their first celebration wish, you get 7 days of VIP access and your friend gets 3 days!',
  '2026-10-09T00:00:00.000Z',
  '2026-10-09T00:00:00.000Z'
);

CREATE TABLE IF NOT EXISTS user_referral_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  referral_code TEXT NOT NULL UNIQUE,
  custom_slug TEXT UNIQUE,
  total_clicks INTEGER NOT NULL DEFAULT 0,
  total_signups INTEGER NOT NULL DEFAULT 0,
  total_qualified INTEGER NOT NULL DEFAULT 0,
  total_rewards_earned INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON user_referral_codes(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON user_referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_slug ON user_referral_codes(custom_slug);

CREATE TABLE IF NOT EXISTS referral_attributions (
  id TEXT PRIMARY KEY,
  referral_code TEXT NOT NULL,
  referrer_user_id TEXT NOT NULL,
  referee_user_id TEXT,
  visitor_token TEXT NOT NULL,
  landing_page TEXT DEFAULT '/',
  ip_hash TEXT,
  user_agent_hash TEXT,
  device_fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  qualifying_event TEXT,
  attributed_at TEXT NOT NULL,
  qualified_at TEXT,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (referrer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (referee_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attributions_code ON referral_attributions(referral_code);
CREATE INDEX IF NOT EXISTS idx_attributions_referrer ON referral_attributions(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_attributions_referee ON referral_attributions(referee_user_id);
CREATE INDEX IF NOT EXISTS idx_attributions_status ON referral_attributions(status);
CREATE INDEX IF NOT EXISTS idx_attributions_token ON referral_attributions(visitor_token);

CREATE TABLE IF NOT EXISTS referral_rewards_ledger (
  id TEXT PRIMARY KEY,
  attribution_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  counterpart_user_id TEXT,
  role TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  reward_amount INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING',
  idempotency_key TEXT NOT NULL UNIQUE,
  granted_at TEXT,
  claimed_at TEXT,
  revoked_at TEXT,
  admin_notes TEXT,
  details_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (attribution_id) REFERENCES referral_attributions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reward_ledger_user ON referral_rewards_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_ledger_status ON referral_rewards_ledger(status);
CREATE INDEX IF NOT EXISTS idx_reward_ledger_idempotency ON referral_rewards_ledger(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_reward_ledger_attribution ON referral_rewards_ledger(attribution_id);

CREATE TABLE IF NOT EXISTS referral_fraud_logs (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT,
  referee_user_id TEXT,
  referral_code TEXT,
  risk_score INTEGER NOT NULL DEFAULT 0,
  flag_reasons TEXT NOT NULL DEFAULT '[]',
  ip_address TEXT,
  device_info TEXT,
  action_taken TEXT NOT NULL DEFAULT 'FLAGGED',
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fraud_referrer ON referral_fraud_logs(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_risk ON referral_fraud_logs(risk_score);
CREATE INDEX IF NOT EXISTS idx_fraud_created ON referral_fraud_logs(created_at);

INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0021', '0021_part36_referral_rewards_and_fraud_prevention.sql', '2026-10-09T05:00:00.000Z');

-- ============================================================================
-- WishMagic Cloudflare D1 Architecture Migration (Part 37)
-- 0022_part37_account_lifecycle_and_retention.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS account_lifecycle_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_eligible_retry_at TEXT,
  claimed_by TEXT,
  claim_expires_at TEXT,
  progress_step TEXT,
  details_json TEXT DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_jobs_user ON account_lifecycle_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_jobs_status ON account_lifecycle_jobs(status);
CREATE INDEX IF NOT EXISTS idx_lifecycle_jobs_retry ON account_lifecycle_jobs(next_eligible_retry_at);

CREATE TABLE IF NOT EXISTS account_cleanup_items (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  user_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  storage_key TEXT,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  is_shared_template_asset INTEGER NOT NULL DEFAULT 0,
  retained_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cleanup_items_user ON account_cleanup_items(user_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_items_job ON account_cleanup_items(job_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_items_status ON account_cleanup_items(status);

ALTER TABLE user_privacy_settings ADD COLUMN preferred_language TEXT DEFAULT 'en';
ALTER TABLE user_privacy_settings ADD COLUMN timezone TEXT DEFAULT 'Asia/Kolkata';

INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0022', '0022_part37_account_lifecycle_and_retention.sql', '2026-10-09T06:00:00.000Z');

-- ============================================================================
-- Part 38: Legal & Compliance Center
-- ============================================================================
CREATE TABLE IF NOT EXISTS legal_policies (
  id TEXT PRIMARY KEY,
  policy_type TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  content_format TEXT NOT NULL DEFAULT 'markdown',
  content TEXT NOT NULL,
  content_checksum TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  is_material_change INTEGER NOT NULL DEFAULT 0,
  change_summary TEXT,
  review_status TEXT NOT NULL DEFAULT 'approved',
  created_by TEXT NOT NULL DEFAULT 'system',
  reviewer_id TEXT,
  reviewed_at TEXT,
  published_at TEXT,
  effective_at TEXT,
  retired_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_legal_policies_type ON legal_policies(policy_type);
CREATE INDEX IF NOT EXISTS idx_legal_policies_status ON legal_policies(status);
CREATE INDEX IF NOT EXISTS idx_legal_policies_version ON legal_policies(policy_type, version);

CREATE TABLE IF NOT EXISTS legal_active_policies (
  policy_type TEXT PRIMARY KEY,
  current_policy_id TEXT NOT NULL,
  current_version TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (current_policy_id) REFERENCES legal_policies(id)
);

CREATE TABLE IF NOT EXISTS policy_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  policy_type TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  content_checksum TEXT NOT NULL,
  acceptance_method TEXT NOT NULL DEFAULT 'REGISTRATION',
  ip_hash TEXT,
  user_agent TEXT,
  accepted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_policy_acc_user ON policy_acceptances(user_id);
CREATE INDEX IF NOT EXISTS idx_policy_acc_type ON policy_acceptances(policy_type);
CREATE INDEX IF NOT EXISTS idx_policy_acc_user_type ON policy_acceptances(user_id, policy_type);

CREATE TABLE IF NOT EXISTS user_cookie_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  anonymous_token TEXT,
  essential INTEGER NOT NULL DEFAULT 1,
  functional INTEGER NOT NULL DEFAULT 1,
  analytics INTEGER NOT NULL DEFAULT 0,
  marketing INTEGER NOT NULL DEFAULT 0,
  consent_version TEXT NOT NULL DEFAULT '1.0.0',
  ip_hash TEXT,
  user_agent TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cookie_consent_user ON user_cookie_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_cookie_consent_anon ON user_cookie_consents(anonymous_token);

INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0023', '0023_part38_legal_and_compliance_center.sql', '2026-10-09T06:30:00.000Z');

-- ============================================================================
-- Part 39: Platform-Wide Search, Discovery & Analytics
-- ============================================================================
CREATE TABLE IF NOT EXISTS search_index (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  category TEXT,
  subcategory TEXT,
  relationships_json TEXT,
  features_json TEXT,
  tags_json TEXT,
  tier TEXT DEFAULT 'free',
  is_premium INTEGER DEFAULT 0,
  price INTEGER DEFAULT 0,
  popularity_score REAL DEFAULT 100.0,
  rating REAL DEFAULT 4.9,
  thumbnail TEXT,
  search_vector_text TEXT NOT NULL,
  is_published INTEGER DEFAULT 1,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_index_entity ON search_index(entity_type, is_published);
CREATE INDEX IF NOT EXISTS idx_search_index_cat ON search_index(category);
CREATE INDEX IF NOT EXISTS idx_search_index_tier ON search_index(tier, is_premium);
CREATE INDEX IF NOT EXISTS idx_search_index_pop ON search_index(popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_search_index_entity_id ON search_index(entity_id);

CREATE TABLE IF NOT EXISTS search_analytics (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  search_type TEXT DEFAULT 'all',
  filters_json TEXT,
  result_count INTEGER NOT NULL DEFAULT 0,
  has_results INTEGER NOT NULL DEFAULT 1,
  selected_entity_id TEXT,
  selected_entity_type TEXT,
  user_id TEXT,
  anonymous_session_id TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  execution_time_ms REAL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_analytics_created ON search_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON search_analytics(normalized_query);
CREATE INDEX IF NOT EXISTS idx_search_analytics_no_results ON search_analytics(has_results, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_analytics_user ON search_analytics(user_id);

CREATE TABLE IF NOT EXISTS search_synonyms_keywords (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  synonyms_json TEXT NOT NULL,
  boost_weight REAL DEFAULT 1.5,
  promoted_entity_id TEXT,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_synonyms_keyword ON search_synonyms_keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_search_synonyms_active ON search_synonyms_keywords(is_active);

CREATE TABLE IF NOT EXISTS search_recent_queries (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  session_id TEXT,
  query TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_recent_user ON search_recent_queries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_recent_session ON search_recent_queries(session_id, created_at DESC);

INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0024', '0024_part39_global_search_and_discovery_analytics.sql', '2026-10-09T07:00:00.000Z');




