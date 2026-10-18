-- ============================================================================
-- WishMagic Development & Staging Seed Script (OPTIONAL DEV SEED ONLY)
-- File: migrations/seeds/dev_seed.sql
-- DO NOT RUN IN PRODUCTION ENVIRONMENT
-- ============================================================================

-- Dev Admin Bootstrap for Local Testing
INSERT OR IGNORE INTO users (id, email, display_name, avatar_url, role, plan, is_premium, provider, status, created_at, updated_at) VALUES
('usr_dev_admin_001', 'admin@wishmagic.local', 'Local Dev Admin', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80', 'admin', 'VIP', 1, 'local', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO admin_roles (id, user_id, role, permissions, granted_by, created_at) VALUES
('adm_role_dev', 'usr_dev_admin_001', 'SUPER_ADMIN', '["MANAGE_TEMPLATES","MANAGE_CATEGORIES","MANAGE_USERS","MANAGE_WISHES","VIEW_ANALYTICS","MANAGE_SETTINGS"]', 'system', '2026-01-01T00:00:00.000Z');
