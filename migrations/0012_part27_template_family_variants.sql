-- ============================================================================
-- WishMagic Cloudflare D1 Final Architecture Migration (Part 27)
-- Migration: 0012_part27_template_family_variants.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description:
--   Admin Template Family + Relationship Variant Management + Visual Configuration:
--   1. Additive versioning, lock, status, and family columns on template_relationship_variants
--   2. Additive fields, theme, and effects defaults on template_versions
--   3. Additive relationship mapping column on template_music
--   4. Query optimization indexes for variant version lookup and status filtering
--   5. Backfill denormalized template_id for rapid variant lookups
--
-- STRICT PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. ADDITIVE MIGRATION ONLY
--   3. Preserves all existing tables, records, and relationships from Parts 1–26
-- ============================================================================

-- 1. ADDITIVE COLUMNS FOR TEMPLATE RELATIONSHIP VARIANTS (Part 27)
ALTER TABLE template_relationship_variants ADD COLUMN version_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE template_relationship_variants ADD COLUMN parent_variant_id TEXT;
ALTER TABLE template_relationship_variants ADD COLUMN is_latest INTEGER NOT NULL DEFAULT 1;
ALTER TABLE template_relationship_variants ADD COLUMN lock_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE template_relationship_variants ADD COLUMN template_id TEXT;
ALTER TABLE template_relationship_variants ADD COLUMN template_family_id TEXT;
ALTER TABLE template_relationship_variants ADD COLUMN published_at TEXT;

-- 2. ADDITIVE COLUMNS FOR TEMPLATE VERSIONS (Part 27)
ALTER TABLE template_versions ADD COLUMN fields_json TEXT DEFAULT '[]';
ALTER TABLE template_versions ADD COLUMN theme_defaults_json TEXT DEFAULT '{}';
ALTER TABLE template_versions ADD COLUMN effects_defaults_json TEXT DEFAULT '{}';

-- 3. ADDITIVE COLUMNS FOR TEMPLATE MUSIC (Part 27)
ALTER TABLE template_music ADD COLUMN relationship_id TEXT;

-- 4. PERFORMANCE & CONCURRENCY INDEXES
CREATE INDEX IF NOT EXISTS idx_trv_version_number ON template_relationship_variants(template_version_id, version_number);
CREATE INDEX IF NOT EXISTS idx_trv_template_status ON template_relationship_variants(template_id, status);
CREATE INDEX IF NOT EXISTS idx_trv_is_latest ON template_relationship_variants(is_latest);
CREATE INDEX IF NOT EXISTS idx_template_music_rel ON template_music(relationship_id);

-- 5. BACKFILL TEMPLATE_ID ON EXISTING VARIANTS
UPDATE template_relationship_variants
SET template_id = (
  SELECT tv.template_id 
  FROM template_versions tv 
  WHERE tv.id = template_relationship_variants.template_version_id
)
WHERE template_id IS NULL OR template_id = '';

-- 6. RECORD MIGRATION IN _MIGRATIONS REGISTRY
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0012', '0012_part27_template_family_variants.sql', '2026-10-08T09:30:00.000Z');
