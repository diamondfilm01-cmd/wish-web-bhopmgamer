-- ============================================================================
-- WishMagic Cloudflare D1 Final Architecture Migration (Part 29)
-- Migration: 0014_part29_storage_health_and_orphan_cleanup.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description:
--   Storage Health + Orphan Detection + Safe Cleanup + Recovery System
--   1. storage_health_audits: tracks automated & on-demand health verification audits
--   2. storage_cleanup_jobs: logs safe cleanup executions, dry-runs, and reclaimed storage
--   3. storage_quarantine: isolates orphan assets before purge with full recovery support
--   4. Additive health tracking columns on template_images, music_library, wish_media
--   5. High-performance composite indexes for audit queries & quarantine lookups
--
-- STRICT PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. ADDITIVE MIGRATION ONLY
--   3. Preserves all existing tables, records, and relationships from Parts 1–28
-- ============================================================================

-- 1. STORAGE HEALTH AUDITS TABLE
CREATE TABLE IF NOT EXISTS storage_health_audits (
  id TEXT PRIMARY KEY,
  audit_type TEXT NOT NULL DEFAULT 'full',
  status TEXT NOT NULL DEFAULT 'completed',
  b2_status TEXT NOT NULL DEFAULT 'HEALTHY',
  imgbb_status TEXT NOT NULL DEFAULT 'HEALTHY',
  d1_status TEXT NOT NULL DEFAULT 'HEALTHY',
  summary_json TEXT NOT NULL DEFAULT '{}',
  issues_json TEXT NOT NULL DEFAULT '[]',
  orphans_count INTEGER NOT NULL DEFAULT 0,
  broken_refs_count INTEGER NOT NULL DEFAULT 0,
  protected_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER DEFAULT 0,
  initiated_by TEXT NOT NULL DEFAULT 'system'
);

-- 2. STORAGE CLEANUP JOBS TABLE
CREATE TABLE IF NOT EXISTS storage_cleanup_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL DEFAULT 'dry_run',
  status TEXT NOT NULL DEFAULT 'completed',
  target_provider TEXT NOT NULL DEFAULT 'all',
  dry_run INTEGER NOT NULL DEFAULT 1,
  items_scanned INTEGER NOT NULL DEFAULT 0,
  items_quarantined INTEGER NOT NULL DEFAULT 0,
  items_protected INTEGER NOT NULL DEFAULT 0,
  bytes_reclaimed INTEGER NOT NULL DEFAULT 0,
  results_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  initiated_by TEXT NOT NULL DEFAULT 'admin'
);

-- 3. STORAGE QUARANTINE TABLE
CREATE TABLE IF NOT EXISTS storage_quarantine (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  storage_key TEXT,
  provider_asset_id TEXT,
  url TEXT,
  size_bytes INTEGER DEFAULT 0,
  quarantine_reason TEXT NOT NULL,
  original_status TEXT DEFAULT 'active',
  status TEXT NOT NULL DEFAULT 'quarantined',
  quarantined_at TEXT NOT NULL,
  restored_at TEXT,
  purged_at TEXT,
  metadata_json TEXT DEFAULT '{}'
);

-- 4. ADDITIVE HEALTH COLUMNS FOR EXISTING MEDIA TABLES (Part 29)
ALTER TABLE template_images ADD COLUMN health_status TEXT DEFAULT 'HEALTHY';
ALTER TABLE template_images ADD COLUMN last_health_check_at TEXT;
ALTER TABLE template_images ADD COLUMN health_issues TEXT;

ALTER TABLE music_library ADD COLUMN health_status TEXT DEFAULT 'HEALTHY';
ALTER TABLE music_library ADD COLUMN last_health_check_at TEXT;
ALTER TABLE music_library ADD COLUMN health_issues TEXT;

ALTER TABLE wish_media ADD COLUMN health_status TEXT DEFAULT 'HEALTHY';
ALTER TABLE wish_media ADD COLUMN last_health_check_at TEXT;
ALTER TABLE wish_media ADD COLUMN health_issues TEXT;

-- 5. PERFORMANCE & AUDIT INDEXES
CREATE INDEX IF NOT EXISTS idx_storage_health_audits_status ON storage_health_audits(status, started_at);
CREATE INDEX IF NOT EXISTS idx_storage_cleanup_jobs_status ON storage_cleanup_jobs(status, started_at);
CREATE INDEX IF NOT EXISTS idx_storage_quarantine_asset ON storage_quarantine(asset_id, provider);
CREATE INDEX IF NOT EXISTS idx_storage_quarantine_status ON storage_quarantine(status, quarantined_at);
CREATE INDEX IF NOT EXISTS idx_template_images_health ON template_images(health_status);
CREATE INDEX IF NOT EXISTS idx_music_library_health ON music_library(health_status);
CREATE INDEX IF NOT EXISTS idx_wish_media_health ON wish_media(health_status);
