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
