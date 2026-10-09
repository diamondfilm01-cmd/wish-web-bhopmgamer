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

