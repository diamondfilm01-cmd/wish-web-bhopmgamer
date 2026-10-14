-- ============================================================================
-- WishMagic Cloudflare D1 Enterprise Architecture Migration (Part 33)
-- Migration: 0018_part33_analytics_bi_engine.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
--
-- TARGET: Production Analytics, Business Intelligence & Admin Reporting
-- PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. STRICT ADDITIVE SCHEMA ONLY
--   3. PRESERVE ALL PRODUCTION USER, WISH, TEMPLATE, AND ORDER RECORDS
-- ============================================================================

-- 1. Ensure analytics_events table exists with full normalized schema
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  user_id TEXT DEFAULT 'guest',
  session_id TEXT,
  wish_id TEXT,
  slug TEXT,
  template_id TEXT,
  template_name TEXT,
  template_family_id TEXT,
  template_version_id TEXT,
  relationship_variant_id TEXT,
  category TEXT,
  recipient_name TEXT,
  order_id TEXT,
  source TEXT DEFAULT 'direct',
  schema_version INTEGER DEFAULT 1,
  metadata TEXT, -- JSON safe attributes (no PII, no messages)
  timestamp TEXT NOT NULL
);

-- Performance Indexes for fast multi-dimensional analytics querying
CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_time ON analytics_events(event_name, timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_template_name ON analytics_events(template_id, event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_wish_event ON analytics_events(wish_id, event_name);

-- 2. Additive Daily Aggregates Table for Fast Bounded Reporting
CREATE TABLE IF NOT EXISTS analytics_daily_aggregates (
  id TEXT PRIMARY KEY,
  reporting_date TEXT NOT NULL, -- YYYY-MM-DD in Asia/Kolkata
  metric_name TEXT NOT NULL,   -- e.g. 'users_created', 'wishes_published', 'revenue_captured_paise'
  dimension_key TEXT DEFAULT 'global',   -- e.g. 'global', 'template', 'category', 'relationship'
  dimension_value TEXT DEFAULT 'all',    -- e.g. 'all', 'tpl_glitter_birthday', 'birthday', 'girlfriend'
  metric_value REAL NOT NULL DEFAULT 0,
  metadata TEXT, -- JSON safe extra context
  updated_at TEXT NOT NULL,
  UNIQUE(reporting_date, metric_name, dimension_key, dimension_value)
);

CREATE INDEX IF NOT EXISTS idx_daily_agg_date_metric ON analytics_daily_aggregates(reporting_date, metric_name);
CREATE INDEX IF NOT EXISTS idx_daily_agg_metric ON analytics_daily_aggregates(metric_name);
CREATE INDEX IF NOT EXISTS idx_daily_agg_dim ON analytics_daily_aggregates(dimension_key, dimension_value);

-- 3. Register Migration in _migrations table
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0018', '0018_part33_analytics_bi_engine.sql', '2026-10-09T02:00:00.000Z');
