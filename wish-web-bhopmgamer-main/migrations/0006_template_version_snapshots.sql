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
