-- ============================================================================
-- WishMagic Cloudflare D1 Architecture Migration (Part 49)
-- Migration: 0037_part49_utp_v1_2_sections_actions_visibility.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description:
--   UTP v1.2.0 Extension + Admin Section/Subsection Visibility +
--   Button Action/Link Configuration + Draft/Published Snapshot Persistence:
--   1. Additive columns on templates and template_versions for:
--      - actions_json (manifest-declared action definitions)
--      - visibility_config_json (published template-wide section/subsection visibility)
--      - actions_config_json (published template-wide button label/action/destination overrides)
--      - draft_config_json (admin draft edits prior to publication)
--      - lock_version (optimistic concurrency control counter for admin edits)
--   2. Additive columns on template_relationship_variants for:
--      - actions_json (relationship-specific button/action overrides)
--      - visibility_json (relationship-specific section/subsection visibility overrides)
--      - draft_configuration_json (per-variant admin draft state)
--   3. Additive column on wishes for:
--      - published_config_snapshot_json (immutable published section/subsection/action
--        snapshot at wish creation/publication time so existing wish links remain
--        unaffected by subsequent template configuration updates).
-- ============================================================================

-- 1. ADDITIVE COLUMNS ON TEMPLATES
ALTER TABLE templates ADD COLUMN actions_json TEXT DEFAULT '[]';
ALTER TABLE templates ADD COLUMN visibility_config_json TEXT DEFAULT '{}';
ALTER TABLE templates ADD COLUMN actions_config_json TEXT DEFAULT '{}';
ALTER TABLE templates ADD COLUMN draft_config_json TEXT DEFAULT '{}';
ALTER TABLE templates ADD COLUMN lock_version INTEGER NOT NULL DEFAULT 1;

-- 2. ADDITIVE COLUMNS ON TEMPLATE_VERSIONS
ALTER TABLE template_versions ADD COLUMN actions_json TEXT DEFAULT '[]';
ALTER TABLE template_versions ADD COLUMN visibility_config_json TEXT DEFAULT '{}';
ALTER TABLE template_versions ADD COLUMN actions_config_json TEXT DEFAULT '{}';
ALTER TABLE template_versions ADD COLUMN draft_config_json TEXT DEFAULT '{}';

-- 3. ADDITIVE COLUMNS ON TEMPLATE_RELATIONSHIP_VARIANTS
ALTER TABLE template_relationship_variants ADD COLUMN actions_json TEXT DEFAULT '[]';
ALTER TABLE template_relationship_variants ADD COLUMN visibility_json TEXT DEFAULT '{}';
ALTER TABLE template_relationship_variants ADD COLUMN draft_configuration_json TEXT DEFAULT '{}';

-- 4. ADDITIVE COLUMN ON WISHES FOR IMMUTABLE PUBLISHED CONFIGURATION SNAPSHOTS
ALTER TABLE wishes ADD COLUMN published_config_snapshot_json TEXT DEFAULT '{}';

-- 5. PERFORMANCE INDEXES FOR VERSIONED CONFIGURATION & WISH SNAPSHOT RESOLUTION
CREATE INDEX IF NOT EXISTS idx_templates_slug_lock ON templates(slug, lock_version);
CREATE INDEX IF NOT EXISTS idx_tv_template_published ON template_versions(template_id, status, is_current);

-- 6. RECORD MIGRATION IN _MIGRATIONS REGISTRY
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0037', '0037_part49_utp_v1_2_sections_actions_visibility.sql', '2026-10-17T00:00:00.000Z');
