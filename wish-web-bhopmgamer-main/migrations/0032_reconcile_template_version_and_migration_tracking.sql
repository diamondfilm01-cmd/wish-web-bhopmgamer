-- ============================================================================
-- MIGRATION: 0032_reconcile_template_version_and_migration_tracking.sql
-- WishMagic Part 9 & Security / D1 Reconciliation
-- Target Database: c08b683b-eb07-4639-ab33-fb1139bfb295
--
-- STRICT PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. STRICT ADDITIVE SCHEMA ONLY
--   3. Reconciles existing databases safely so all columns and indexes exist
-- ============================================================================

-- 1. Ensure template_versions status and snapshot indexes
CREATE INDEX IF NOT EXISTS idx_template_versions_status ON template_versions(status);
CREATE INDEX IF NOT EXISTS idx_template_versions_template_curr ON template_versions(template_id, is_current);

-- 2. Ensure wishes template_version_id index exists
CREATE INDEX IF NOT EXISTS idx_wishes_template_version_id ON wishes(template_version_id);

-- 3. Ensure support_tickets performance indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_order ON support_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status ON support_tickets(user_id, status);

-- 4. Record migration in _migrations
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0032', '0032_reconcile_template_version_and_migration_tracking.sql', '2026-10-10T12:00:00.000Z');
