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
