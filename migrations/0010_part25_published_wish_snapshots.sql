-- ============================================================================
-- MIGRATION: 0010_part25_published_wish_snapshots.sql
-- WishMagic Part 25 — Published Wish Renderer + Immutable Snapshot + Lifecycle / Expiry
--
-- Target Database: Cloudflare D1
-- STRICT PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. ADDITIVE MIGRATION ONLY
--   3. Preserves all existing tables, records, and relationships from Parts 1–24
-- ============================================================================

-- 1. Immutable Published Wish Snapshots Table
CREATE TABLE IF NOT EXISTS wish_publication_snapshots (
  id TEXT PRIMARY KEY,                       -- e.g. 'snp_wm_...'
  wish_id TEXT NOT NULL,                     -- Foreign key to wishes(id)
  slug TEXT UNIQUE NOT NULL,                 -- Canonical public slug at publication time
  snapshot_version INTEGER NOT NULL DEFAULT 1, -- Version of publication snapshot for this wish
  template_family_id TEXT,                   -- Template family identifier
  template_id TEXT NOT NULL,                 -- Template ID (e.g. 'tpl_glitter_birthday')
  template_version_id TEXT NOT NULL,         -- Exact immutable template version (e.g. 'tv_tpl_glitter_birthday_v1')
  relationship_id TEXT,                      -- Relationship ID (e.g. 'crush', 'friend')
  relationship_variant_id TEXT,              -- Exact relationship variant ID reference
  recipient_name TEXT NOT NULL,              -- Sanitized recipient name
  sender_name TEXT NOT NULL,                 -- Sanitized sender name
  event_date TEXT NOT NULL,                  -- YYYY-MM-DD
  expiry_date TEXT NOT NULL,                 -- YYYY-MM-DD (End of celebration active window in IST)
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  theme_config_json TEXT NOT NULL DEFAULT '{}', -- Frozen visual theme & palette
  content_json TEXT NOT NULL DEFAULT '{}',   -- Frozen content overrides & custom messages
  sections_json TEXT NOT NULL DEFAULT '[]',  -- Frozen sections ordering & configurations
  media_manifest_json TEXT NOT NULL DEFAULT '{}', -- Frozen resolved media slot URLs & metadata
  music_manifest_json TEXT NOT NULL DEFAULT '{}', -- Frozen music playback reference & metadata
  effects_config_json TEXT NOT NULL DEFAULT '{}', -- Frozen animation, particle & confetti configuration
  capabilities_json TEXT NOT NULL DEFAULT '{}',   -- Frozen template capabilities & schema snapshot
  tier TEXT NOT NULL DEFAULT 'free',         -- 'free', 'vip'
  is_private INTEGER NOT NULL DEFAULT 0,     -- 1 = noindex, nofollow
  published_at TEXT NOT NULL,                -- Publication ISO timestamp
  created_at TEXT NOT NULL,
  FOREIGN KEY (wish_id) REFERENCES wishes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wish_pub_snapshots_wish_id ON wish_publication_snapshots(wish_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wish_pub_snapshots_slug ON wish_publication_snapshots(slug);
CREATE INDEX IF NOT EXISTS idx_wish_pub_snapshots_template_version ON wish_publication_snapshots(template_version_id);
CREATE INDEX IF NOT EXISTS idx_wish_pub_snapshots_event_date ON wish_publication_snapshots(event_date);

-- 2. Additive columns for wishes table to ensure snapshot linkage & lifecycle
ALTER TABLE wishes ADD COLUMN active_snapshot_id TEXT;
CREATE INDEX IF NOT EXISTS idx_wishes_active_snapshot_id ON wishes(active_snapshot_id);

-- 3. Record migration in _migrations registry
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0010', '0010_part25_published_wish_snapshots.sql', '2026-10-08T07:30:00.000Z');
