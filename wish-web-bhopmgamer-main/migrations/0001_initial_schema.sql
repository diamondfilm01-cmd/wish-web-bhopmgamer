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
