-- ============================================================================
-- WishMagic Cloudflare D1 Architecture Migration (Part 48)
-- Migration: 0036_part48_utp_v1_1_variant_system.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description:
--   Universal Template Variant System + UTP v1.1.0 Standard Update:
--   1. Additive columns on template_relationship_variants for variant slug,
--      relationship slug/label, entry file, thumbnail, fields/sections/assets
--      overrides, enabled flag, sort order, and default variant flag.
--   2. Additive variant summary columns on templates and template_versions.
--   3. Seed complete canonical relationships catalog (including best_friend,
--      son, daughter, grandparents, family, colleague, teacher, mentor,
--      partner, fiance, sibling) for foreign key integrity.
--   4. Performance indexes for gallery relation tag lookups and variant resolution.
-- ============================================================================

-- 1. SEED EXTENDED CANONICAL RELATIONSHIPS CATALOG
INSERT OR IGNORE INTO relationships (id, slug, name, display_name, icon, category, status, sort_order, created_at, updated_at) VALUES
('rel_best_friend', 'best_friend', 'Best Friend', 'Best Friend Forever', '🌟', 'friends', 'active', 6, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_partner', 'partner', 'Partner', 'Beloved Partner', '💫', 'romantic', 'active', 12, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_fiance', 'fiance', 'Fiance', 'Beloved Fiance', '💎', 'romantic', 'active', 13, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_sibling', 'sibling', 'Sibling', 'Cherished Sibling', '🤝', 'family', 'active', 14, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_son', 'son', 'Son', 'Dearest Son', '🚀', 'family', 'active', 15, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_daughter', 'daughter', 'Daughter', 'Dearest Daughter', '🌷', 'family', 'active', 16, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_grandparents', 'grandparents', 'Grandparents', 'Beloved Grandparents', '🕊️', 'family', 'active', 17, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_family', 'family', 'Family', 'Family Celebration', '🏡', 'family', 'active', 18, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_colleague', 'colleague', 'Colleague', 'Valued Colleague', '🎉', 'general', 'active', 19, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_teacher', 'teacher', 'Teacher', 'Inspiring Teacher', '📚', 'general', 'active', 20, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_mentor', 'mentor', 'Mentor', 'Trusted Mentor', '🧭', 'general', 'active', 21, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z');

-- 2. ADDITIVE COLUMNS ON TEMPLATE_RELATIONSHIP_VARIANTS
ALTER TABLE template_relationship_variants ADD COLUMN variant_slug TEXT;
ALTER TABLE template_relationship_variants ADD COLUMN relationship_slug TEXT;
ALTER TABLE template_relationship_variants ADD COLUMN relationship_label TEXT;
ALTER TABLE template_relationship_variants ADD COLUMN description TEXT DEFAULT '';
ALTER TABLE template_relationship_variants ADD COLUMN thumbnail TEXT DEFAULT '';
ALTER TABLE template_relationship_variants ADD COLUMN entry_file TEXT DEFAULT 'index.html';
ALTER TABLE template_relationship_variants ADD COLUMN fields_json TEXT DEFAULT '[]';
ALTER TABLE template_relationship_variants ADD COLUMN sections_json TEXT DEFAULT '[]';
ALTER TABLE template_relationship_variants ADD COLUMN assets_json TEXT DEFAULT '{}';
ALTER TABLE template_relationship_variants ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE template_relationship_variants ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 1;
ALTER TABLE template_relationship_variants ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;

-- 3. ADDITIVE COLUMNS ON TEMPLATES & TEMPLATE_VERSIONS
ALTER TABLE templates ADD COLUMN variants_json TEXT DEFAULT '[]';
ALTER TABLE templates ADD COLUMN has_variants INTEGER NOT NULL DEFAULT 0;
ALTER TABLE template_versions ADD COLUMN variants_json TEXT DEFAULT '[]';

-- 4. BACKFILL RELATIONSHIP_SLUG AND RELATIONSHIP_LABEL ON EXISTING VARIANTS
UPDATE template_relationship_variants
SET relationship_slug = (
  SELECT r.slug FROM relationships r WHERE r.id = template_relationship_variants.relationship_id
)
WHERE relationship_slug IS NULL OR relationship_slug = '';

UPDATE template_relationship_variants
SET relationship_label = (
  SELECT r.name FROM relationships r WHERE r.id = template_relationship_variants.relationship_id
)
WHERE relationship_label IS NULL OR relationship_label = '';

-- 5. PERFORMANCE INDEXES FOR GALLERY & VARIANT RESOLUTION
CREATE INDEX IF NOT EXISTS idx_trv_family_status ON template_relationship_variants(template_family_id, status, enabled, is_latest);
CREATE INDEX IF NOT EXISTS idx_trv_rel_slug ON template_relationship_variants(relationship_slug);
CREATE INDEX IF NOT EXISTS idx_trv_variant_slug ON template_relationship_variants(variant_slug);

-- 6. RECORD MIGRATION IN _MIGRATIONS REGISTRY
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0036', '0036_part48_utp_v1_1_variant_system.sql', '2026-10-17T00:00:00.000Z');
