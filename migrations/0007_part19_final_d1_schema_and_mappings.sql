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
