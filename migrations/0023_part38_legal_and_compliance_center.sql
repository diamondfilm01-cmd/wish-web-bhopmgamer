-- ============================================================================
-- WishMagic Cloudflare D1 Enterprise Architecture Migration (Part 38)
-- Migration: 0023_part38_legal_and_compliance_center.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
--
-- TARGET: Production Legal Center, Versioned Policies, User Acceptance Audit,
--         Granular Cookie/Consent Management & Material Re-Consent Engine
-- PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. STRICT ADDITIVE SCHEMA ONLY
--   3. PRESERVE ALL FINANCIAL ORDERS, TOKENS, REFERRAL REWARDS & TEMPLATE ASSETS
-- ============================================================================

-- 1. LEGAL POLICIES (Versioned Policy Documents)
CREATE TABLE IF NOT EXISTS legal_policies (
  id TEXT PRIMARY KEY,
  policy_type TEXT NOT NULL, -- 'terms_of_service', 'privacy_policy', 'cookie_policy', 'refund_policy', 'premium_terms', 'content_policy', 'referral_terms', 'community_guidelines'
  version TEXT NOT NULL,      -- e.g. '1.0.0'
  title TEXT NOT NULL,
  content_format TEXT NOT NULL DEFAULT 'markdown', -- 'markdown', 'html'
  content TEXT NOT NULL,
  content_checksum TEXT NOT NULL, -- SHA-256
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'published', 'retired'
  is_material_change INTEGER NOT NULL DEFAULT 0, -- 1 = triggers user re-consent prompt
  change_summary TEXT,
  review_status TEXT NOT NULL DEFAULT 'approved', -- 'draft', 'in_review', 'approved', 'rejected'
  created_by TEXT NOT NULL DEFAULT 'system',
  reviewer_id TEXT,
  reviewed_at TEXT,
  published_at TEXT,
  effective_at TEXT,
  retired_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_legal_policies_type ON legal_policies(policy_type);
CREATE INDEX IF NOT EXISTS idx_legal_policies_status ON legal_policies(status);
CREATE INDEX IF NOT EXISTS idx_legal_policies_version ON legal_policies(policy_type, version);

-- 2. LEGAL ACTIVE POLICIES (Authoritative Current Pointer per Type)
CREATE TABLE IF NOT EXISTS legal_active_policies (
  policy_type TEXT PRIMARY KEY,
  current_policy_id TEXT NOT NULL,
  current_version TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (current_policy_id) REFERENCES legal_policies(id)
);

-- 3. POLICY ACCEPTANCES (Immutable Audit Trail of User Agreements)
CREATE TABLE IF NOT EXISTS policy_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  policy_type TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  content_checksum TEXT NOT NULL,
  acceptance_method TEXT NOT NULL DEFAULT 'REGISTRATION', -- 'REGISTRATION', 'RECONSENT_MODAL', 'BANNER', 'SETTINGS', 'CHECKOUT', 'EXPLICIT_ACCEPT'
  ip_hash TEXT,
  user_agent TEXT,
  accepted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_policy_acc_user ON policy_acceptances(user_id);
CREATE INDEX IF NOT EXISTS idx_policy_acc_type ON policy_acceptances(policy_type);
CREATE INDEX IF NOT EXISTS idx_policy_acc_user_type ON policy_acceptances(user_id, policy_type);

-- 4. USER COOKIE CONSENTS (Granular Preferences for Visitors and Authenticated Users)
CREATE TABLE IF NOT EXISTS user_cookie_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  anonymous_token TEXT,
  essential INTEGER NOT NULL DEFAULT 1,
  functional INTEGER NOT NULL DEFAULT 1,
  analytics INTEGER NOT NULL DEFAULT 0,
  marketing INTEGER NOT NULL DEFAULT 0,
  consent_version TEXT NOT NULL DEFAULT '1.0.0',
  ip_hash TEXT,
  user_agent TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cookie_consent_user ON user_cookie_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_cookie_consent_anon ON user_cookie_consents(anonymous_token);

-- 5. RECORD MIGRATION IN DATABASE LEDGER
INSERT OR IGNORE INTO _migrations (id, name, applied_at)
VALUES ('mig_0023', '0023_part38_legal_and_compliance_center.sql', CURRENT_TIMESTAMP);
