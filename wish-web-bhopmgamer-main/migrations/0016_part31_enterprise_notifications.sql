-- ============================================================================
-- WishMagic Cloudflare D1 Enterprise Architecture Migration (Part 31)
-- Migration: 0016_part31_enterprise_notifications.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Purpose: Enterprise Notification & Communication System:
--          Delivery Jobs, Delivery Attempts, Scheduled Reminders,
--          Enterprise Announcements, and Deduplication Constraints
-- ============================================================================

-- 1. Notification Delivery Jobs Queue
CREATE TABLE IF NOT EXISTS notification_delivery_jobs (
  id TEXT PRIMARY KEY,
  notification_id TEXT,
  channel TEXT NOT NULL, -- 'in_app', 'email'
  recipient_user_id TEXT NOT NULL,
  recipient_email TEXT,
  notification_type TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'CLAIMED', 'SENT', 'DELIVERED', 'RETRY_PENDING', 'FAILED', 'CANCELLED'
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_eligible_retry_at TEXT,
  claimed_by TEXT,
  claim_expires_at TEXT,
  provider_message_id TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  idempotency_key TEXT UNIQUE,
  metadata TEXT, -- JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notif_jobs_status_retry ON notification_delivery_jobs(status, next_eligible_retry_at);
CREATE INDEX IF NOT EXISTS idx_notif_jobs_recipient ON notification_delivery_jobs(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notif_jobs_created_at ON notification_delivery_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_notif_jobs_idempotency ON notification_delivery_jobs(idempotency_key);

-- 2. Delivery Attempts Log (Detailed Provider Audit)
CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL, -- 'ACCEPTED', 'FAILED', 'RATE_LIMITED', 'DELIVERED'
  provider TEXT NOT NULL, -- 'resend', 'mailchannels', 'mock_provider'
  provider_message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  duration_ms INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES notification_delivery_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notif_attempts_job ON notification_delivery_attempts(job_id);
CREATE INDEX IF NOT EXISTS idx_notif_attempts_created ON notification_delivery_attempts(created_at);

-- 3. Scheduled Reminders Registry (Anti-Duplicate Tracking)
CREATE TABLE IF NOT EXISTS notification_scheduled_reminders (
  id TEXT PRIMARY KEY,
  wish_id TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL, -- 'UPCOMING_WISH_24H', 'UPCOMING_WISH_3H', 'EXPIRY_REMINDER_24H', 'EXPIRY_FINAL'
  scheduled_for TEXT NOT NULL,
  dedup_key TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED', -- 'SCHEDULED', 'PROCESSED', 'CANCELLED', 'SKIPPED'
  processed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (wish_id) REFERENCES wishes(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sched_remind_status_date ON notification_scheduled_reminders(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_sched_remind_dedup ON notification_scheduled_reminders(dedup_key);

-- 4. Enterprise Administrative Announcements
CREATE TABLE IF NOT EXISTS enterprise_announcements (
  id TEXT PRIMARY KEY,
  internal_title TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  channels TEXT NOT NULL DEFAULT '["in_app"]', -- JSON array: ["in_app", "email"]
  target_audience TEXT NOT NULL DEFAULT 'ALL_ACTIVE', -- 'ALL_ACTIVE', 'VIP_ONLY', 'FREE_ONLY'
  status TEXT NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'
  scheduled_at TEXT,
  published_at TEXT,
  archived_at TEXT,
  creator_id TEXT NOT NULL,
  total_recipients INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ent_announcements_status ON enterprise_announcements(status);
CREATE INDEX IF NOT EXISTS idx_ent_announcements_created ON enterprise_announcements(created_at);

-- 5. Additive Columns to notifications table if missing
-- SQLite D1 supports ADD COLUMN (if already exists, app code handles gracefully)
-- We ensure idx_notifications_user_unread index for fast unread counts
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at);
