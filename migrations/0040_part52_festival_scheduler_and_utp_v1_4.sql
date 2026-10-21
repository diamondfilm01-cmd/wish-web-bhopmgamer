-- ============================================================================
-- WishMagic Cloudflare D1 Architecture Migration (Part 52)
-- Migration: 0040_part52_festival_scheduler_and_utp_v1_4.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description:
--   Festival Scheduler & Universal Template Protocol (UTP) v1.4.0:
--   1. Creates festival_definitions table for annual festival calendar records,
--      localized names, categories, date-calculation methods, default windows,
--      and timezone settings.
--   2. Creates festival_year_dates table for year-specific resolved dates,
--      verification statuses, source references, and verification timestamps.
--   3. Creates festival_date_overrides table for year-scoped administrator
--      manual date overrides without destroying underlying resolved source data.
--   4. Creates festival_campaigns table for campaign-level publication windows,
--      status precedence (DRAFT, SCHEDULED, ACTIVE, PAUSED, ENDED, CANCELLED),
--      and timezone-aware calendar-day boundaries.
--   5. Creates festival_campaign_templates table for assigning reusable
--      templates and relation variants to festival campaigns without file
--      duplication.
--   6. Creates festival_sync_logs table for external provider synchronization
--      diagnostics and administrative audit history.
--   7. Adds additive UTP v1.4.0 columns festival_metadata_json on templates and
--      template_versions, and festival_campaign_id on wishes.
-- ============================================================================

-- 1. CREATE FESTIVAL_DEFINITIONS TABLE
CREATE TABLE IF NOT EXISTS festival_definitions (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  localized_names_json TEXT NOT NULL DEFAULT '{}',
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'festival',
  calculation_method TEXT NOT NULL DEFAULT 'VERIFIED_CALENDAR_TABLE',
  fixed_month INTEGER DEFAULT NULL,
  fixed_day INTEGER DEFAULT NULL,
  calculation_rule_json TEXT NOT NULL DEFAULT '{}',
  default_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  default_days_before INTEGER NOT NULL DEFAULT 15,
  default_days_after INTEGER NOT NULL DEFAULT 3,
  requires_admin_approval INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  source_attribution TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  lock_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT DEFAULT 'system'
);

-- 2. CREATE FESTIVAL_YEAR_DATES TABLE
CREATE TABLE IF NOT EXISTS festival_year_dates (
  id TEXT PRIMARY KEY,
  festival_id TEXT NOT NULL,
  applicable_year INTEGER NOT NULL,
  resolved_date TEXT DEFAULT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  verification_status TEXT NOT NULL DEFAULT 'DATE_UNAVAILABLE',
  resolution_source TEXT NOT NULL DEFAULT 'system',
  source_reference TEXT DEFAULT '',
  provider_payload_json TEXT NOT NULL DEFAULT '{}',
  last_verified_at TEXT DEFAULT NULL,
  verified_by TEXT DEFAULT NULL,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (festival_id) REFERENCES festival_definitions(id) ON DELETE CASCADE
);

-- 3. CREATE FESTIVAL_DATE_OVERRIDES TABLE
CREATE TABLE IF NOT EXISTS festival_date_overrides (
  id TEXT PRIMARY KEY,
  festival_id TEXT NOT NULL,
  applicable_year INTEGER NOT NULL,
  override_date TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  reason TEXT NOT NULL DEFAULT '',
  notes TEXT DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  previous_effective_date TEXT DEFAULT NULL,
  created_by TEXT NOT NULL DEFAULT 'admin',
  updated_by TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_at TEXT DEFAULT NULL,
  removed_by TEXT DEFAULT NULL,
  FOREIGN KEY (festival_id) REFERENCES festival_definitions(id) ON DELETE CASCADE
);

-- 4. CREATE FESTIVAL_CAMPAIGNS TABLE
CREATE TABLE IF NOT EXISTS festival_campaigns (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  festival_id TEXT NOT NULL,
  applicable_year INTEGER NOT NULL,
  title TEXT NOT NULL,
  badge_label TEXT DEFAULT '',
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  days_before INTEGER NOT NULL DEFAULT 15,
  days_after INTEGER NOT NULL DEFAULT 3,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  effective_festival_date TEXT DEFAULT NULL,
  window_start_date TEXT DEFAULT NULL,
  window_end_date TEXT DEFAULT NULL,
  first_blocked_date TEXT DEFAULT NULL,
  display_priority INTEGER NOT NULL DEFAULT 10,
  lock_version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT DEFAULT 'system',
  updated_by TEXT DEFAULT 'system',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (festival_id) REFERENCES festival_definitions(id) ON DELETE CASCADE
);

-- 5. CREATE FESTIVAL_CAMPAIGN_TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS festival_campaign_templates (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  festival_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 1,
  allowed_variants_json TEXT NOT NULL DEFAULT '[]',
  custom_days_before INTEGER DEFAULT NULL,
  custom_days_after INTEGER DEFAULT NULL,
  badge_override TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  assigned_by TEXT DEFAULT 'admin',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES festival_campaigns(id) ON DELETE CASCADE
);

-- 6. CREATE FESTIVAL_SYNC_LOGS TABLE
CREATE TABLE IF NOT EXISTS festival_sync_logs (
  id TEXT PRIMARY KEY,
  festival_id TEXT DEFAULT NULL,
  applicable_year INTEGER DEFAULT NULL,
  campaign_id TEXT DEFAULT NULL,
  action_type TEXT NOT NULL,
  provider_name TEXT DEFAULT 'internal',
  status TEXT NOT NULL DEFAULT 'SUCCESS',
  previous_value_json TEXT NOT NULL DEFAULT '{}',
  new_value_json TEXT NOT NULL DEFAULT '{}',
  reason TEXT DEFAULT '',
  error_code TEXT DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  actor_id TEXT NOT NULL DEFAULT 'system',
  actor_email TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

-- 7. ADDITIVE COLUMNS FOR UTP v1.4.0 FESTIVAL METADATA & WISH CAMPAIGN TRACKING
ALTER TABLE templates ADD COLUMN festival_metadata_json TEXT DEFAULT '{}';
ALTER TABLE template_versions ADD COLUMN festival_metadata_json TEXT DEFAULT '{}';
ALTER TABLE wishes ADD COLUMN festival_campaign_id TEXT DEFAULT NULL;

-- 8. PERFORMANCE & INTEGRITY INDEXES FOR FESTIVAL SCHEDULER
CREATE INDEX IF NOT EXISTS idx_fd_enabled_category ON festival_definitions(is_enabled, category, slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fyd_festival_year ON festival_year_dates(festival_id, applicable_year);
CREATE INDEX IF NOT EXISTS idx_fyd_year_status ON festival_year_dates(applicable_year, verification_status, resolved_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fdo_active_festival_year ON festival_date_overrides(festival_id, applicable_year) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_fdo_lookup ON festival_date_overrides(festival_id, applicable_year, is_active);
CREATE INDEX IF NOT EXISTS idx_fc_festival_year ON festival_campaigns(festival_id, applicable_year, status);
CREATE INDEX IF NOT EXISTS idx_fc_active_window ON festival_campaigns(is_enabled, status, window_start_date, window_end_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fct_campaign_template ON festival_campaign_templates(campaign_id, template_id);
CREATE INDEX IF NOT EXISTS idx_fct_template_lookup ON festival_campaign_templates(template_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_fct_festival_lookup ON festival_campaign_templates(festival_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_fsl_festival_year ON festival_sync_logs(festival_id, applicable_year, created_at);
CREATE INDEX IF NOT EXISTS idx_fsl_action_created ON festival_sync_logs(action_type, created_at);
CREATE INDEX IF NOT EXISTS idx_wishes_festival_campaign ON wishes(festival_campaign_id);

-- 9. RECORD MIGRATION IN _MIGRATIONS REGISTRY
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0040', '0040_part52_festival_scheduler_and_utp_v1_4.sql', '2026-10-20T00:00:00.000Z');
