-- ============================================================================
-- WishMagic Cloudflare D1 Enterprise Architecture Migration (Part 36)
-- Migration: 0021_part36_referral_rewards_and_fraud_prevention.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
--
-- TARGET: Referral Program, Personal Invite Codes, Attribution Tracking,
--         Reward Ledger, Fraud Prevention & Administrative Management
-- PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. STRICT ADDITIVE SCHEMA ONLY
--   3. PRESERVE ALL FINANCIAL ORDERS, TOKENS, AND TEMPLATE ASSETS
-- ============================================================================

-- 1. REFERRAL PROGRAMS CONFIGURATION TABLE
CREATE TABLE IF NOT EXISTS referral_programs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  qualifying_event TEXT NOT NULL DEFAULT 'FIRST_WISH', -- 'SIGNUP', 'FIRST_WISH', 'FIRST_PURCHASE'
  referrer_reward_type TEXT NOT NULL DEFAULT 'PREMIUM_DAYS', -- 'PREMIUM_DAYS', 'FREE_WISH_CREDIT', 'DISCOUNT_COUPON', 'BADGE', 'WALLET_POINTS'
  referrer_reward_amount INTEGER NOT NULL DEFAULT 7,
  referee_reward_type TEXT NOT NULL DEFAULT 'PREMIUM_DAYS',
  referee_reward_amount INTEGER NOT NULL DEFAULT 3,
  max_referrals_per_user INTEGER NOT NULL DEFAULT 50,
  attribution_window_days INTEGER NOT NULL DEFAULT 30,
  require_admin_approval INTEGER NOT NULL DEFAULT 0, -- 0 = auto-grant if clean, 1 = manual approval
  fraud_strictness TEXT NOT NULL DEFAULT 'standard', -- 'lenient', 'standard', 'strict'
  terms_summary TEXT DEFAULT 'Invite friends to WishMagic. When they create their first celebration wish, both of you earn exclusive VIP access.',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Seed default program configuration if not exists
INSERT OR IGNORE INTO referral_programs (
  id, name, is_active, qualifying_event,
  referrer_reward_type, referrer_reward_amount,
  referee_reward_type, referee_reward_amount,
  max_referrals_per_user, attribution_window_days,
  require_admin_approval, fraud_strictness,
  terms_summary, created_at, updated_at
) VALUES (
  'default_program',
  'WishMagic Friends & Family Rewards',
  1,
  'FIRST_WISH',
  'PREMIUM_DAYS',
  7,
  'PREMIUM_DAYS',
  3,
  50,
  30,
  0,
  'standard',
  'Invite friends to WishMagic. When they create and publish their first celebration wish, you get 7 days of VIP access and your friend gets 3 days!',
  '2026-10-09T00:00:00.000Z',
  '2026-10-09T00:00:00.000Z'
);

-- 2. USER REFERRAL CODES & METRICS TABLE
CREATE TABLE IF NOT EXISTS user_referral_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  referral_code TEXT NOT NULL UNIQUE,
  custom_slug TEXT UNIQUE,
  total_clicks INTEGER NOT NULL DEFAULT 0,
  total_signups INTEGER NOT NULL DEFAULT 0,
  total_qualified INTEGER NOT NULL DEFAULT 0,
  total_rewards_earned INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON user_referral_codes(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON user_referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_slug ON user_referral_codes(custom_slug);

-- 3. REFERRAL ATTRIBUTIONS TABLE (Click & Signup Linkage)
CREATE TABLE IF NOT EXISTS referral_attributions (
  id TEXT PRIMARY KEY,
  referral_code TEXT NOT NULL,
  referrer_user_id TEXT NOT NULL,
  referee_user_id TEXT,
  visitor_token TEXT NOT NULL,
  landing_page TEXT DEFAULT '/',
  ip_hash TEXT,
  user_agent_hash TEXT,
  device_fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'VISITED', 'PENDING', 'QUALIFIED', 'REWARDED', 'REJECTED', 'EXPIRED'
  qualifying_event TEXT,
  attributed_at TEXT NOT NULL,
  qualified_at TEXT,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (referrer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (referee_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attributions_code ON referral_attributions(referral_code);
CREATE INDEX IF NOT EXISTS idx_attributions_referrer ON referral_attributions(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_attributions_referee ON referral_attributions(referee_user_id);
CREATE INDEX IF NOT EXISTS idx_attributions_status ON referral_attributions(status);
CREATE INDEX IF NOT EXISTS idx_attributions_token ON referral_attributions(visitor_token);

-- 4. REFERRAL REWARDS LEDGER TABLE (Immutable, Idempotent Financial/Benefit Audit)
CREATE TABLE IF NOT EXISTS referral_rewards_ledger (
  id TEXT PRIMARY KEY,
  attribution_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  counterpart_user_id TEXT,
  role TEXT NOT NULL, -- 'REFERRER' or 'REFEREE'
  reward_type TEXT NOT NULL, -- 'PREMIUM_DAYS', 'FREE_WISH_CREDIT', 'DISCOUNT_COUPON', 'BADGE', 'WALLET_POINTS'
  reward_amount INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'GRANTED', 'CLAIMED', 'REJECTED', 'REVOKED'
  idempotency_key TEXT NOT NULL UNIQUE,
  granted_at TEXT,
  claimed_at TEXT,
  revoked_at TEXT,
  admin_notes TEXT,
  details_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (attribution_id) REFERENCES referral_attributions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reward_ledger_user ON referral_rewards_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_ledger_status ON referral_rewards_ledger(status);
CREATE INDEX IF NOT EXISTS idx_reward_ledger_idempotency ON referral_rewards_ledger(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_reward_ledger_attribution ON referral_rewards_ledger(attribution_id);

-- 5. REFERRAL FRAUD & AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS referral_fraud_logs (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT,
  referee_user_id TEXT,
  referral_code TEXT,
  risk_score INTEGER NOT NULL DEFAULT 0, -- 0 (clean) to 100 (high risk)
  flag_reasons TEXT NOT NULL DEFAULT '[]', -- JSON array of reasons
  ip_address TEXT,
  device_info TEXT,
  action_taken TEXT NOT NULL DEFAULT 'FLAGGED', -- 'FLAGGED', 'BLOCKED', 'ALLOWED_MANUAL', 'REJECTED'
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fraud_referrer ON referral_fraud_logs(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_risk ON referral_fraud_logs(risk_score);
CREATE INDEX IF NOT EXISTS idx_fraud_created ON referral_fraud_logs(created_at);

-- 6. RECORD MIGRATION IN DATABASE LEDGER
INSERT OR IGNORE INTO _migrations (id, name, applied_at)
VALUES ('mig_0021', '0021_part36_referral_rewards_and_fraud_prevention.sql', CURRENT_TIMESTAMP);
