-- ============================================================================
-- WishMagic Cloudflare D1 Architecture Migration (Part 51)
-- Migration: 0039_part51_utp_v1_3_central_link_manager_and_variant_visibility.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description:
--   UTP v1.3.0 Central Link Manager, Future Custom Domain Support,
--   Template Link Migration Tracking & Authoritative Variant Visibility:
--   1. Creates central_link_settings table for storing canonical production
--      base URL (default https://wishmagic.pages.dev), global logical link
--      destinations (global.home, global.explore, global.browseTemplates,
--      global.createWish, global.pricing, global.help, global.contact),
--      template-specific logical routes (template.create, template.customize,
--      template.preview), button label recognition rules, approved origins,
--      and domain migration status.
--   2. Creates template_link_migrations table for tracking scanned template
--      packages, detected buttons/links, ambiguous link review flags, and
--      safe normalization/migration history without overwriting live wishes.
--   3. Adds additive columns enabled_variants_json and link_mappings_json on
--      templates and template_versions for authoritative variant visibility
--      and UTP v1.3.0 logical link bindings.
-- ============================================================================

-- 1. CREATE CENTRAL_LINK_SETTINGS TABLE
CREATE TABLE IF NOT EXISTS central_link_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  canonical_base_url TEXT NOT NULL DEFAULT 'https://wishmagic.pages.dev',
  custom_domain_url TEXT DEFAULT '',
  domain_migration_status TEXT NOT NULL DEFAULT 'pages_default',
  global_destinations_json TEXT NOT NULL DEFAULT '{}',
  template_routes_json TEXT NOT NULL DEFAULT '{}',
  global_button_labels_json TEXT NOT NULL DEFAULT '[]',
  template_button_labels_json TEXT NOT NULL DEFAULT '[]',
  approved_origins_json TEXT NOT NULL DEFAULT '[]',
  enforce_https INTEGER NOT NULL DEFAULT 1,
  lock_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT DEFAULT 'system'
);

-- 2. CREATE TEMPLATE_LINK_MIGRATIONS TABLE
CREATE TABLE IF NOT EXISTS template_link_migrations (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  source_version_id TEXT,
  target_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'scanned',
  total_links_scanned INTEGER NOT NULL DEFAULT 0,
  global_links_count INTEGER NOT NULL DEFAULT 0,
  template_links_count INTEGER NOT NULL DEFAULT 0,
  external_links_count INTEGER NOT NULL DEFAULT 0,
  ambiguous_links_count INTEGER NOT NULL DEFAULT 0,
  requires_admin_review INTEGER NOT NULL DEFAULT 0,
  scan_report_json TEXT NOT NULL DEFAULT '{}',
  proposed_mappings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  published_by TEXT
);

-- 3. ADDITIVE COLUMNS ON TEMPLATES & TEMPLATE_VERSIONS FOR AUTHORITATIVE VARIANT VISIBILITY & LOGICAL LINKS
ALTER TABLE templates ADD COLUMN enabled_variants_json TEXT DEFAULT '[]';
ALTER TABLE templates ADD COLUMN link_mappings_json TEXT DEFAULT '{}';
ALTER TABLE template_versions ADD COLUMN enabled_variants_json TEXT DEFAULT '[]';
ALTER TABLE template_versions ADD COLUMN link_mappings_json TEXT DEFAULT '{}';

-- 4. INDEXES FOR CENTRAL LINK MANAGER & TEMPLATE LINK MIGRATIONS
CREATE INDEX IF NOT EXISTS idx_tlm_template_status ON template_link_migrations(template_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_cls_domain_status ON central_link_settings(domain_migration_status);

-- 5. SEED DEFAULT CENTRAL LINK CONFIGURATION
INSERT OR IGNORE INTO central_link_settings (
  id, canonical_base_url, custom_domain_url, domain_migration_status,
  global_destinations_json, template_routes_json,
  global_button_labels_json, template_button_labels_json,
  approved_origins_json, enforce_https, lock_version, updated_at, updated_by
) VALUES (
  'default',
  'https://wishmagic.pages.dev',
  '',
  'pages_default',
  '{"global.home":"/","global.explore":"/templates.html","global.browseTemplates":"/templates.html","global.marketplace":"/marketplace.html","global.createWish":"/create.html","global.pricing":"/pricing.html","global.help":"/help.html","global.contact":"/contact.html"}',
  '{"template.create":"/customize.html","template.customize":"/customize.html","template.preview":"/template-preview.html"}',
  '["Explore More","Visit WishMagic","Browse Templates","Create a Wish","Back to WishMagic","Back to Templates","Explore Templates","View All Templates","Home"]',
  '["Make For Yours","Create Yours","Make One For Me","Customize This Template","Create Your Wish","Personalize This Template","Use This Template"]',
  '["https://wishmagic.pages.dev","https://wishmagic.live","https://www.wishmagic.live"]',
  1,
  1,
  '2026-10-18T00:00:00.000Z',
  'system'
);

-- 6. RECORD MIGRATION IN _MIGRATIONS REGISTRY
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0039', '0039_part51_utp_v1_3_central_link_manager_and_variant_visibility.sql', '2026-10-18T00:00:00.000Z');
