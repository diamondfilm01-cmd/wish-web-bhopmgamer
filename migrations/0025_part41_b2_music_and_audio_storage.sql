-- ============================================================================
-- MIGRATION: 0025_part41_b2_music_and_audio_storage.sql
-- WishMagic Part 41 — Backblaze B2 Audio & Music Storage Invariants
-- Target Database: c08b683b-eb07-4639-ab33-fb1139bfb295
--
-- STRICT PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. ADDITIVE MIGRATION ONLY
--   3. Preserves all existing tables, records, and relationships from Parts 1–40
-- ============================================================================

-- 1. B2 Storage Objects Tracking Table
CREATE TABLE IF NOT EXISTS b2_storage_objects (
  id TEXT PRIMARY KEY,
  bucket_id TEXT,
  bucket_name TEXT,
  object_key TEXT NOT NULL,
  file_id TEXT,
  content_type TEXT,
  content_length INTEGER,
  sha256 TEXT,
  public_url TEXT,
  entity_type TEXT DEFAULT 'music', -- 'music', 'video', 'template'
  entity_id TEXT,
  uploader_id TEXT,
  upload_status TEXT DEFAULT 'completed', -- 'completed', 'failed', 'deleted'
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_b2_storage_objects_key ON b2_storage_objects(object_key);
CREATE INDEX IF NOT EXISTS idx_b2_storage_objects_file_id ON b2_storage_objects(file_id);
CREATE INDEX IF NOT EXISTS idx_b2_storage_objects_entity ON b2_storage_objects(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_b2_storage_objects_status ON b2_storage_objects(upload_status);

-- 2. Additive columns for music_library if not already present
-- SQLite ALTER TABLE will silently ignore duplicate columns in migration runners that catch errors
-- but for standard D1 safety, these ensure music_library has sha256 & provider_file_id
ALTER TABLE music_library ADD COLUMN sha256 TEXT;
ALTER TABLE music_library ADD COLUMN provider_file_id TEXT;

CREATE INDEX IF NOT EXISTS idx_music_library_sha256 ON music_library(sha256);

-- 3. Record migration in _migrations registry
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0025', '0025_part41_b2_music_and_audio_storage.sql', '2026-10-09T08:00:00.000Z');
