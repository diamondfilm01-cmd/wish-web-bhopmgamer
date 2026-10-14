-- ============================================================================
-- WishMagic Cloudflare D1 Architecture Migration (Part 9)
-- Migration: 0034_part9_template_discovery_and_relationship_indexes.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description:
--   Template Gallery, Discovery & Relationship Optimization:
--   1. Additive performance indexes for category, occasion and published status
--   2. Additive index for template relationship queries
--   3. Preserves all existing records and tables
-- ============================================================================

-- 1. ADDITIVE DISCOVERY & LISTING INDEXES
CREATE INDEX IF NOT EXISTS idx_templates_published_cat ON templates(is_published, category);
CREATE INDEX IF NOT EXISTS idx_templates_published_tier ON templates(is_published, tier);
CREATE INDEX IF NOT EXISTS idx_templates_published_placement ON templates(is_published, placement);
CREATE INDEX IF NOT EXISTS idx_template_rel_enabled ON template_relationships(template_id, enabled);

-- 2. RECORD MIGRATION IN _MIGRATIONS REGISTRY
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0034', '0034_part9_template_discovery_and_relationship_indexes.sql', '2026-10-11T15:30:00.000Z');
