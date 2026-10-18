-- ============================================================================
-- WishMagic Cloudflare D1 Enterprise Architecture Migration (Part 32)
-- Migration: 0017_part32_payment_commerce_engine.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Complete Production Payment & Premium Commerce Engine
-- Real Payment Gateway (Razorpay) + Orders + Order Items + Payment Attempts
-- + Webhooks + Entitlements + Refunds + Reconciliation
-- ============================================================================

-- 1. ORDER ITEMS TABLE (Immutable Historical Purchase Snapshots)
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_type TEXT NOT NULL, -- 'vip_pass', 'template_family', 'template', 'personalized_link'
  product_name TEXT NOT NULL,
  template_family_id TEXT,
  template_id TEXT,
  version_id TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL DEFAULT 0, -- Minor units (paise)
  currency TEXT NOT NULL DEFAULT 'INR',
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- 2. PAYMENT ATTEMPTS TABLE (Independent Lifecycle Per Gateway Attempt)
CREATE TABLE IF NOT EXISTS payment_attempts (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_order_id TEXT,
  provider_payment_id TEXT,
  provider_signature TEXT,
  amount INTEGER NOT NULL DEFAULT 0, -- Minor units (paise)
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'CREATED', -- 'CREATED', 'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED'
  error_code TEXT,
  error_description TEXT,
  signature_verified INTEGER NOT NULL DEFAULT 0,
  raw_response_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  verified_at TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_order_id ON payment_attempts(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_prov_order ON payment_attempts(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_prov_pay ON payment_attempts(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_status ON payment_attempts(status);

-- 3. PAYMENT WEBHOOKS TABLE (Durable Deduplication & Audit for Gateway Events)
CREATE TABLE IF NOT EXISTS payment_webhooks (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  event_id TEXT UNIQUE, -- Provider event ID for idempotent processing
  event_type TEXT NOT NULL,
  order_id TEXT,
  payment_id TEXT,
  payload_summary TEXT,
  status TEXT NOT NULL DEFAULT 'RECEIVED', -- 'RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED_DUPLICATE'
  error_code TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_event_id ON payment_webhooks(event_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_order_id ON payment_webhooks(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_status ON payment_webhooks(status);

-- 4. REFUNDS TABLE (Audited Refund Operations)
CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  payment_attempt_id TEXT,
  provider_refund_id TEXT,
  amount INTEGER NOT NULL DEFAULT 0, -- Minor units (paise)
  currency TEXT NOT NULL DEFAULT 'INR',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'REQUESTED', -- 'REQUESTED', 'PENDING', 'SUCCEEDED', 'FAILED'
  requested_by TEXT NOT NULL, -- Actor user ID (admin or customer)
  error_code TEXT,
  error_description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_prov_refund ON refunds(provider_refund_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);

-- 5. COMPOSITE PERFORMANCE & IDEMPOTENCY INDEXES
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_prov_order_id ON orders(provider_order_id);
