-- ============================================================================
-- WishMagic Cloudflare D1 Relational Database Canonical Schema
-- Generated from the authoritative 32-migration forward chain
-- Guaranteed 100% equivalence with sequential migrations
--
-- Integrated Migration Chain Manifest:
-- - 0001_initial_schema.sql
-- - 0002_seed_templates.sql
-- - 0003_complete_production_schema.sql
-- - 0004_admin_staff_and_audit_logs.sql
-- - 0005_site_settings.sql
-- - 0006_template_version_snapshots.sql
-- - 0007_part19_final_d1_schema_and_mappings.sql
-- - 0008_part20_b2_template_storage.sql
-- - 0009_part21_imgbb_image_storage.sql
-- - 0010_part25_published_wish_snapshots.sql
-- - 0011_part26_wish_lifecycle_and_favorites.sql
-- - 0012_part27_template_family_variants.sql
-- - 0013_part28_template_version_management.sql
-- - 0014_part29_storage_health_and_orphan_cleanup.sql
-- - 0015_part30_admin_operations_and_moderation.sql
-- - 0016_part31_enterprise_notifications.sql
-- - 0017_part32_payment_commerce_engine.sql
-- - 0018_part33_analytics_bi_engine.sql
-- - 0019_part34_customer_support_and_help_center.sql
-- - 0020_part35_account_privacy_security_management.sql
-- - 0021_part36_referral_rewards_and_fraud_prevention.sql
-- - 0022_part37_account_lifecycle_and_retention.sql
-- - 0023_part38_legal_and_compliance_center.sql
-- - 0024_part39_global_search_and_discovery_analytics.sql
-- - 0025_part41_b2_music_and_audio_storage.sql
-- - 0026_part42_media_storage_inventory_reconciliation.sql
-- - 0027_part2_universal_template_protocol.sql
-- - 0028_part3_template_ingestion_operations.sql
-- - 0029_part4_customizer_draft_concurrency.sql
-- - 0030_part5_universal_runtime_publishing_immutability.sql
-- - 0031_part9_admin_control_center.sql
-- - 0032_reconcile_template_version_and_migration_tracking.sql
-- ============================================================================

-- SECTION 1: TABLES

-- Table: _migrations
CREATE TABLE IF NOT EXISTS _migrations (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  checksum TEXT,
  applied_at TEXT NOT NULL
);

-- Table: account_cleanup_items
CREATE TABLE IF NOT EXISTS account_cleanup_items (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  user_id TEXT NOT NULL,
  resource_type TEXT NOT NULL, -- 'imgbb_image', 'b2_asset', 'wish_draft', 'session', 'notification_job', 'export_artifact'
  resource_id TEXT NOT NULL,
  storage_key TEXT,
  provider TEXT NOT NULL, -- 'imgbb', 'backblaze_b2', 'd1_database'
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'DEPENDENCY_BLOCKED', 'DELETED', 'RETAINED_STATUTORY', 'FAILED'
  is_shared_template_asset INTEGER NOT NULL DEFAULT 0, -- 1 = NEVER DELETE (Safety Invariant)
  retained_reason TEXT, -- e.g. 'Statutory financial accounting compliance', 'Shared template catalog dependency'
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table: account_deletion_requests
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'CANCELLED', 'COMPLETED', 'DEACTIVATED'
  reason TEXT,
  feedback TEXT,
  wishes_handling TEXT NOT NULL DEFAULT 'retain_grace', -- 'retain_grace', 'unpublish_immediately'
  financial_records_retained INTEGER NOT NULL DEFAULT 1,
  requested_at TEXT NOT NULL,
  grace_period_ends_at TEXT NOT NULL,
  cancelled_at TEXT,
  completed_at TEXT,
  admin_notes TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table: account_lifecycle_jobs
CREATE TABLE IF NOT EXISTS account_lifecycle_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_type TEXT NOT NULL, -- 'ACCOUNT_DELETION_PURGE', 'DATA_EXPORT_GENERATION', 'STORAGE_MEDIA_CLEANUP', 'GRACE_PERIOD_EXPIRATION'
  status TEXT NOT NULL DEFAULT 'QUEUED', -- 'QUEUED', 'PROCESSING', 'READY', 'COMPLETED', 'FAILED', 'FAILED_RETRYABLE', 'CANCELLED'
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_eligible_retry_at TEXT,
  claimed_by TEXT,
  claim_expires_at TEXT,
  progress_step TEXT, -- 'INSPECT_DEPENDENCIES', 'ARCHIVE_WISHES', 'ANONYMIZE_PROFILE', 'CLEANUP_ORPHAN_MEDIA', 'REVOKE_SESSIONS', 'FINALIZED'
  details_json TEXT DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table: account_retention_audit_log
CREATE TABLE IF NOT EXISTS account_retention_audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  details_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

-- Table: admin_audit_logs
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL, -- e.g. 'ADMIN_LOGIN', 'STAFF_CREATED', 'STAFF_DISABLED', 'ROLE_CHANGED'
  target_type TEXT,     -- 'staff', 'template', 'wish', 'user', 'settings'
  target_id TEXT,
  details TEXT,         -- JSON payload of non-sensitive changes
  ip_address TEXT,
  created_at TEXT NOT NULL
);

-- Table: admin_error_logs
CREATE TABLE IF NOT EXISTS admin_error_logs (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL, -- 'ingestion', 'validation', 'compatibility', 'runtime', 'b2_storage', 'imgbb', 'database', 'auth', 'general'
  severity TEXT DEFAULT 'error', -- 'warning', 'error', 'critical'
  component TEXT NOT NULL,
  error_code TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT DEFAULT '{}', -- JSON string with safe diagnostic details
  target_type TEXT, -- 'template_family', 'template_version', 'wish', 'song', 'media', 'user'
  target_id TEXT,
  correlation_id TEXT,
  resolved INTEGER DEFAULT 0,
  resolution_notes TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

-- Table: admin_ingestion_jobs
CREATE TABLE IF NOT EXISTS admin_ingestion_jobs (
  id TEXT PRIMARY KEY,
  package_filename TEXT NOT NULL,
  family_id TEXT,
  template_version TEXT,
  status TEXT NOT NULL, -- 'received', 'extracting', 'validating', 'storing', 'completed', 'failed'
  error_code TEXT,
  error_message TEXT,
  validation_issues TEXT DEFAULT '[]', -- JSON array of UTP validation issues
  retry_count INTEGER DEFAULT 0,
  retry_eligible INTEGER DEFAULT 1,
  correlation_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

-- Table: admin_roles
CREATE TABLE IF NOT EXISTS admin_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'SUPER_ADMIN', 'ADMIN', 'EDITOR', 'ANALYST'
  permissions TEXT NOT NULL, -- JSON array of granted permission strings
  granted_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table: admin_staff
CREATE TABLE IF NOT EXISTS admin_staff (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  mobile TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'EDITOR', -- 'OWNER', 'ADMIN', 'MANAGER', 'EDITOR', 'SUPPORT', 'ANALYST'
  permissions TEXT NOT NULL DEFAULT '[]', -- JSON array of permission keys
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'disabled', 'suspended'
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  firebase_uid TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table: analytics_daily_aggregates
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

-- Table: analytics_events
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  user_id TEXT DEFAULT 'guest',
  wish_id TEXT,
  slug TEXT,
  template_id TEXT,
  template_name TEXT,
  category TEXT,
  recipient_name TEXT,
  metadata TEXT, -- JSON
  timestamp TEXT NOT NULL
);

-- Table: b2_storage_objects
CREATE TABLE IF NOT EXISTS b2_storage_objects (
  id TEXT PRIMARY KEY,
  bucket_id TEXT,
  bucket_name TEXT,
  object_key TEXT NOT NULL,
  file_id TEXT,
  content_type TEXT,
  content_length INTEGER,
  sha256 TEXT,
  public_url TEXT,
  entity_type TEXT DEFAULT 'music', -- 'music', 'video', 'template'
  entity_id TEXT,
  uploader_id TEXT,
  upload_status TEXT DEFAULT 'completed', -- 'completed', 'failed', 'deleted'
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Table: categories
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '✨',
  sort_order INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Table: enterprise_announcements
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

-- Table: entitlements
CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free', -- 'free', 'vip'
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'expired', 'revoked'
  source TEXT NOT NULL DEFAULT 'purchase', -- 'purchase', 'admin_grant', 'promo', 'sandbox'
  starts_at TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table: favorites
CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'template', -- 'template', 'wish'
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table: help_articles
CREATE TABLE IF NOT EXISTS help_articles (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  icon TEXT DEFAULT 'help_outline',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1,
  view_count INTEGER NOT NULL DEFAULT 0,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  not_helpful_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Table: legal_active_policies
CREATE TABLE IF NOT EXISTS legal_active_policies (
  policy_type TEXT PRIMARY KEY,
  current_policy_id TEXT NOT NULL,
  current_version TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (current_policy_id) REFERENCES legal_policies(id)
);

-- Table: legal_policies
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

-- Table: moderation_reports
CREATE TABLE IF NOT EXISTS moderation_reports (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL DEFAULT 'wish', -- 'wish', 'user', 'media', 'template'
  target_id TEXT NOT NULL,
  reporter_id TEXT,
  reporter_email TEXT,
  report_reason TEXT NOT NULL,              -- 'inappropriate_content', 'copyright', 'harassment', 'spam', 'other'
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending', 'resolved', 'dismissed', 'escalated'
  resolution_action TEXT,                   -- 'approved', 'suspended', 'content_removed', 'dismissed'
  resolution_notes TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

-- Table: music_library
CREATE TABLE IF NOT EXISTS music_library (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT DEFAULT 'WishMagic Studio',
  description TEXT,
  category TEXT NOT NULL DEFAULT 'celebration', -- 'romantic', 'celebration', 'acoustic', 'party', 'peaceful'
  relationship_suitability TEXT DEFAULT '[]', -- JSON array of relationship slugs
  storage_provider TEXT NOT NULL DEFAULT 'b2',
  storage_key TEXT NOT NULL,
  playback_url TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'audio/mpeg',
  duration_seconds INTEGER DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'archived', 'retired'
  is_featured INTEGER NOT NULL DEFAULT 0,
  created_by TEXT DEFAULT 'system',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, health_status TEXT DEFAULT 'HEALTHY', last_health_check_at TEXT, health_issues TEXT, sha256 TEXT, provider_file_id TEXT, original_filename TEXT, metadata_status TEXT DEFAULT 'verified');

-- Table: notification_delivery_attempts
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

-- Table: notification_delivery_jobs
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

-- Table: notification_preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  in_app INTEGER NOT NULL DEFAULT 1,
  email INTEGER NOT NULL DEFAULT 1,
  whatsapp INTEGER NOT NULL DEFAULT 0,
  marketing INTEGER NOT NULL DEFAULT 0,
  wish_reminders INTEGER NOT NULL DEFAULT 1,
  draft_reminders INTEGER NOT NULL DEFAULT 1,
  expiry_reminders INTEGER NOT NULL DEFAULT 1,
  product_updates INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table: notification_scheduled_reminders
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

-- Table: notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TEXT,
  related_type TEXT,
  related_id TEXT,
  action_url TEXT,
  icon TEXT DEFAULT 'notifications',
  severity TEXT DEFAULT 'info',
  metadata TEXT, -- JSON
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table: order_items
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

-- Table: orders
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  provider TEXT NOT NULL DEFAULT 'manual', -- 'stripe', 'razorpay', 'upi', 'sandbox'
  provider_order_id TEXT,
  transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',  -- 'PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  verified_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table: payment_attempts
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

-- Table: payment_webhooks
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

-- Table: policy_acceptances
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

-- Table: referral_attributions
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

-- Table: referral_fraud_logs
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

-- Table: referral_programs
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

-- Table: referral_rewards_ledger
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

-- Table: refunds
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

-- Table: relationships
CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  icon TEXT DEFAULT '❤️',
  category TEXT DEFAULT 'general', -- 'romantic', 'family', 'friends', 'celebration'
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'disabled'
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Table: search_analytics
CREATE TABLE IF NOT EXISTS search_analytics (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  search_type TEXT DEFAULT 'all', -- 'all', 'template', 'music', 'article'
  filters_json TEXT, -- Filter parameters snapshot { category, relationship, tier, features, sort }
  result_count INTEGER NOT NULL DEFAULT 0,
  has_results INTEGER NOT NULL DEFAULT 1,
  selected_entity_id TEXT, -- Populated if a user clicks a result
  selected_entity_type TEXT,
  user_id TEXT,
  anonymous_session_id TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  execution_time_ms REAL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Table: search_index
CREATE TABLE IF NOT EXISTS search_index (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL, -- 'template', 'music', 'article'
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  category TEXT,
  subcategory TEXT,
  relationships_json TEXT, -- JSON array of supported relationship slugs/names
  features_json TEXT, -- JSON array of capability tags ['3d', 'audio', 'polaroid', etc.]
  tags_json TEXT, -- JSON array of tags
  tier TEXT DEFAULT 'free', -- 'free', 'vip'
  is_premium INTEGER DEFAULT 0,
  price INTEGER DEFAULT 0,
  popularity_score REAL DEFAULT 100.0,
  rating REAL DEFAULT 4.9,
  thumbnail TEXT,
  search_vector_text TEXT NOT NULL, -- Lowercase normalized text for full substring/token search
  is_published INTEGER DEFAULT 1,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Table: search_recent_queries
CREATE TABLE IF NOT EXISTS search_recent_queries (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  session_id TEXT,
  query TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Table: search_synonyms_keywords
CREATE TABLE IF NOT EXISTS search_synonyms_keywords (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  synonyms_json TEXT NOT NULL, -- JSON array of equivalent terms ['bday', 'janamdin', 'salgirah']
  boost_weight REAL DEFAULT 1.5,
  promoted_entity_id TEXT, -- Optional pinned template or article ID
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Table: sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table: site_settings
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'string', -- 'string', 'number', 'boolean', 'json'
  description TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

-- Table: storage_cleanup_jobs
CREATE TABLE IF NOT EXISTS storage_cleanup_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL DEFAULT 'dry_run',
  status TEXT NOT NULL DEFAULT 'completed',
  target_provider TEXT NOT NULL DEFAULT 'all',
  dry_run INTEGER NOT NULL DEFAULT 1,
  items_scanned INTEGER NOT NULL DEFAULT 0,
  items_quarantined INTEGER NOT NULL DEFAULT 0,
  items_protected INTEGER NOT NULL DEFAULT 0,
  bytes_reclaimed INTEGER NOT NULL DEFAULT 0,
  results_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  initiated_by TEXT NOT NULL DEFAULT 'admin'
);

-- Table: storage_health_audits
CREATE TABLE IF NOT EXISTS storage_health_audits (
  id TEXT PRIMARY KEY,
  audit_type TEXT NOT NULL DEFAULT 'full',
  status TEXT NOT NULL DEFAULT 'completed',
  b2_status TEXT NOT NULL DEFAULT 'HEALTHY',
  imgbb_status TEXT NOT NULL DEFAULT 'HEALTHY',
  d1_status TEXT NOT NULL DEFAULT 'HEALTHY',
  summary_json TEXT NOT NULL DEFAULT '{}',
  issues_json TEXT NOT NULL DEFAULT '[]',
  orphans_count INTEGER NOT NULL DEFAULT 0,
  broken_refs_count INTEGER NOT NULL DEFAULT 0,
  protected_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER DEFAULT 0,
  initiated_by TEXT NOT NULL DEFAULT 'system'
);

-- Table: storage_providers
CREATE TABLE IF NOT EXISTS storage_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL, -- 'images', 'files', 'audio', 'hybrid'
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'read_only', 'archived'
  config_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Table: storage_quarantine
CREATE TABLE IF NOT EXISTS storage_quarantine (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  storage_key TEXT,
  provider_asset_id TEXT,
  url TEXT,
  size_bytes INTEGER DEFAULT 0,
  quarantine_reason TEXT NOT NULL,
  original_status TEXT DEFAULT 'active',
  status TEXT NOT NULL DEFAULT 'quarantined',
  quarantined_at TEXT NOT NULL,
  restored_at TEXT,
  purged_at TEXT,
  metadata_json TEXT DEFAULT '{}'
);

-- Table: support_attachments
CREATE TABLE IF NOT EXISTS support_attachments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  message_id TEXT,
  user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  url TEXT NOT NULL,
  storage_provider TEXT DEFAULT 'imgbb',
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
);

-- Table: support_ticket_messages
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  sender_type TEXT NOT NULL, -- 'user', 'admin', 'system'
  sender_id TEXT NOT NULL,
  sender_name TEXT,
  message TEXT NOT NULL,
  is_internal_note INTEGER NOT NULL DEFAULT 0,
  attachments_json TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
);

-- Table: support_tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  ticket_number TEXT UNIQUE NOT NULL,
  user_id TEXT,
  user_email TEXT,
  wish_id TEXT,
  order_id TEXT,
  category TEXT NOT NULL DEFAULT 'general', -- 'link_issue', 'billing', 'media_error', 'customization', 'general'
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',      -- 'open', 'in_progress', 'resolved', 'closed'
  priority TEXT NOT NULL DEFAULT 'medium',  -- 'low', 'medium', 'high', 'urgent'
  admin_notes TEXT,
  assigned_to TEXT,
  diagnostic_data TEXT DEFAULT '{}',
  resolution_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Table: system_announcements
CREATE TABLE IF NOT EXISTS system_announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT DEFAULT 'info',
  is_active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

-- Table: template_families
CREATE TABLE IF NOT EXISTS template_families (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  thumbnail TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'celebration',
  tier TEXT NOT NULL DEFAULT 'free', -- 'free', 'vip'
  price INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_premium INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published', -- 'published', 'draft', 'archived'
  visibility TEXT NOT NULL DEFAULT 'public', -- 'public', 'unlisted', 'private'
  created_by TEXT DEFAULT 'system',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, current_version_id TEXT, rollback_version_id TEXT, supported_relationships_json TEXT DEFAULT '["friend","girlfriend","boyfriend","best_friend","crush","wife","husband","mother","father","parents","sister","brother"]', default_runtime_api TEXT DEFAULT '1.0', published_version_id TEXT, latest_version_id TEXT);

-- Table: template_fields
CREATE TABLE IF NOT EXISTS template_fields (
  id TEXT PRIMARY KEY,
  template_version_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_type TEXT NOT NULL, -- 'text', 'textarea', 'date', 'image', 'audio', 'voice', 'color', 'toggle', 'range', 'select'
  label TEXT NOT NULL,
  placeholder TEXT,
  help_text TEXT,
  is_required INTEGER NOT NULL DEFAULT 0,
  default_value TEXT,
  validation_json TEXT DEFAULT '{}',
  capabilities_json TEXT DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  group_name TEXT DEFAULT 'personal',
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'hidden', 'retired'
  created_at TEXT NOT NULL,
  FOREIGN KEY (template_version_id) REFERENCES template_versions(id) ON DELETE CASCADE
);

-- Table: template_files
CREATE TABLE IF NOT EXISTS template_files (
  id TEXT PRIMARY KEY,
  template_version_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'b2',
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  file_role TEXT DEFAULT 'asset', -- 'entry_html', 'stylesheet', 'script', 'asset', 'font', 'manifest'
  is_entry_file INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'archived'
  created_at TEXT NOT NULL,
  FOREIGN KEY (template_version_id) REFERENCES template_versions(id) ON DELETE CASCADE
);

-- Table: template_images
CREATE TABLE IF NOT EXISTS template_images (
  id TEXT PRIMARY KEY,
  template_version_id TEXT NOT NULL,
  asset_key TEXT NOT NULL, -- e.g. 'hero_photo', 'cover_photo', 'bg_photo', 'preview_1'
  original_filename TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'imgbb',
  provider_asset_id TEXT,
  original_url TEXT NOT NULL,
  display_url TEXT NOT NULL,
  thumbnail_url TEXT,
  relationship_id TEXT, -- Optional: variant-specific image tag
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'archived', 'retired'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, template_id TEXT, delete_url TEXT, health_status TEXT DEFAULT 'HEALTHY', last_health_check_at TEXT, health_issues TEXT,
  FOREIGN KEY (template_version_id) REFERENCES template_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (relationship_id) REFERENCES relationships(id) ON DELETE SET NULL
);

-- Table: template_music
CREATE TABLE IF NOT EXISTS template_music (
  id TEXT PRIMARY KEY,
  template_version_id TEXT NOT NULL,
  music_id TEXT NOT NULL,
  relationship_variant_id TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, relationship_id TEXT,
  FOREIGN KEY (template_version_id) REFERENCES template_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (music_id) REFERENCES music_library(id) ON DELETE RESTRICT,
  FOREIGN KEY (relationship_variant_id) REFERENCES template_relationship_variants(id) ON DELETE SET NULL
);

-- Table: template_relationship_variants
CREATE TABLE IF NOT EXISTS template_relationship_variants (
  id TEXT PRIMARY KEY,
  template_version_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  name TEXT NOT NULL,
  configuration_json TEXT NOT NULL DEFAULT '{}', -- Safe JSON: theme, palette, texts, animations, defaults
  schema_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'archived'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, version_number INTEGER NOT NULL DEFAULT 1, parent_variant_id TEXT, is_latest INTEGER NOT NULL DEFAULT 1, lock_version INTEGER NOT NULL DEFAULT 1, template_id TEXT, template_family_id TEXT, published_at TEXT,
  FOREIGN KEY (template_version_id) REFERENCES template_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (relationship_id) REFERENCES relationships(id) ON DELETE RESTRICT
);

-- Table: template_relationships
CREATE TABLE IF NOT EXISTS template_relationships (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  template_family_id TEXT,
  template_version_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
  FOREIGN KEY (relationship_id) REFERENCES relationships(id) ON DELETE RESTRICT
);

-- Table: template_upload_operations
CREATE TABLE IF NOT EXISTS template_upload_operations (
  id TEXT PRIMARY KEY,                       -- e.g. 'top_...' or UUID
  idempotency_key TEXT,                     -- Unique client idempotency key or content hash
  author_id TEXT NOT NULL,                  -- Administrator who uploaded
  template_family_id TEXT,                  -- Resolved family ID
  template_id TEXT,                         -- Resolved template ID
  version_id TEXT,                          -- Resolved immutable version ID
  version_number INTEGER,                   -- Assigned version number
  version_label TEXT,                       -- Assigned version label (e.g. 'v1.0.0')
  package_fingerprint TEXT,                 -- Deterministic SHA-256 fingerprint of package files
  state TEXT NOT NULL DEFAULT 'received',   -- 'received', 'validating', 'validation_failed', 'staging', 'staged', 'registering', 'preview_ready', 'failed', 'cleanup_pending'
  progress_stage TEXT DEFAULT 'received',
  progress_percent INTEGER DEFAULT 0,
  is_retryable INTEGER DEFAULT 1,
  error_code TEXT,
  error_message TEXT,
  validation_report_json TEXT DEFAULT '{}',
  inventory_json TEXT DEFAULT '[]',
  b2_objects_json TEXT DEFAULT '[]',        -- List of B2 objects written by this operation for targeted cleanup
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Table: template_versions
CREATE TABLE IF NOT EXISTS template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  sections TEXT,      -- JSON array of section definitions
  capabilities TEXT,  -- JSON object of supported template capabilities
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL, template_family_id TEXT, version_label TEXT DEFAULT 'v1.0.0', source_zip_storage_key TEXT, runtime_root_storage_key TEXT, manifest_storage_key TEXT, schema_hash TEXT, runtime_hash TEXT, source_zip_hash TEXT, storage_provider TEXT DEFAULT 'b2', storage_bucket TEXT, storage_metadata_json TEXT DEFAULT '{}', error_message TEXT, published_at TEXT, archived_at TEXT, fields_json TEXT DEFAULT '[]', theme_defaults_json TEXT DEFAULT '{}', effects_defaults_json TEXT DEFAULT '{}', release_notes TEXT DEFAULT '', published_by TEXT, manifest_json TEXT DEFAULT '{}', file_count INTEGER DEFAULT 0, total_size_bytes INTEGER DEFAULT 0, entry_point TEXT DEFAULT 'index.html', integrity_status TEXT DEFAULT 'unverified', integrity_checked_at TEXT, validation_report_json TEXT DEFAULT '{}', lock_version INTEGER NOT NULL DEFAULT 1, is_current INTEGER NOT NULL DEFAULT 0, protocol_version TEXT DEFAULT '1.0', schema_version TEXT DEFAULT '1.0.0', runtime_api_version TEXT DEFAULT '1.0', is_publishable INTEGER NOT NULL DEFAULT 1, package_fingerprint TEXT, category TEXT, tier TEXT DEFAULT 'free', price INTEGER DEFAULT 0, thumbnail TEXT, theme TEXT, layout TEXT, animations TEXT, default_config TEXT, snapshot_data TEXT, created_by TEXT DEFAULT 'system',
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
);

-- Table: templates
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  relationships TEXT,       -- JSON array
  tags TEXT,                -- JSON array
  type TEXT DEFAULT '3D Interactive',
  tier TEXT NOT NULL DEFAULT 'free', -- 'free', 'vip'
  price INTEGER NOT NULL DEFAULT 0,
  is_premium INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'published', -- 'published', 'draft', 'archived'
  featured INTEGER NOT NULL DEFAULT 0,
  placement INTEGER NOT NULL DEFAULT 99,
  thumbnail TEXT NOT NULL,
  preview_images TEXT,      -- JSON array
  capabilities TEXT,        -- JSON object
  detected_fields TEXT,     -- JSON array
  sections TEXT,            -- JSON array
  features TEXT,            -- JSON array
  theme TEXT,               -- JSON object
  folder TEXT NOT NULL,
  entry_file TEXT NOT NULL DEFAULT 'index.html',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, current_version_id TEXT);

-- Table: user_activity_logs
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,              -- 'LOGIN', 'LOGOUT', 'WISH_CREATED', 'STATUS_CHANGED', 'ROLE_CHANGED', 'SESSIONS_REVOKED'
  description TEXT NOT NULL,
  metadata_json TEXT DEFAULT '{}',
  actor_id TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL
);

-- Table: user_cookie_consents
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

-- Table: user_data_exports
CREATE TABLE IF NOT EXISTS user_data_exports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY', -- 'PENDING', 'READY', 'DOWNLOADED', 'EXPIRED'
  format TEXT NOT NULL DEFAULT 'json',
  summary_json TEXT DEFAULT '{}',
  payload_json TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  requested_at TEXT NOT NULL,
  completed_at TEXT,
  downloaded_at TEXT,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table: user_privacy_settings
CREATE TABLE IF NOT EXISTS user_privacy_settings (
  user_id TEXT PRIMARY KEY,
  profile_visibility TEXT NOT NULL DEFAULT 'public', -- 'public', 'unlisted', 'private'
  search_engine_indexing INTEGER NOT NULL DEFAULT 1, -- 1 = allow indexing, 0 = noindex
  analytics_tracking INTEGER NOT NULL DEFAULT 1,    -- 1 = allow analytics telemetry, 0 = opt-out
  marketing_emails INTEGER NOT NULL DEFAULT 0,      -- 1 = consent, 0 = no marketing
  activity_telemetry INTEGER NOT NULL DEFAULT 1,    -- 1 = allow performance logs, 0 = minimal
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, preferred_language TEXT DEFAULT 'en', timezone TEXT DEFAULT 'Asia/Kolkata',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table: user_referral_codes
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

-- Table: user_security_events
CREATE TABLE IF NOT EXISTS user_security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'LOGIN', 'LOGOUT', 'SESSION_REVOKED', 'ALL_SESSIONS_REVOKED', 'PROFILE_UPDATED', 'PRIVACY_UPDATED', 'DATA_EXPORT_REQUESTED', 'DATA_EXPORT_DOWNLOADED', 'ACCOUNT_DELETION_REQUESTED', 'ACCOUNT_DELETION_CANCELLED', 'ACCOUNT_DEACTIVATED'
  ip_address TEXT,
  user_agent TEXT,
  device_info TEXT, -- Parsed device/browser summary e.g. "Chrome on Windows"
  details_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table: users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'creator', -- 'creator', 'admin', 'editor'
  plan TEXT NOT NULL DEFAULT 'Free',    -- 'Free', 'VIP'
  is_premium INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'deactivated'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, suspension_reason TEXT, admin_notes TEXT, last_login_at TEXT, failed_login_attempts INTEGER DEFAULT 0, email_verified INTEGER DEFAULT 1);

-- Table: wish_media
CREATE TABLE IF NOT EXISTS wish_media (
  id TEXT PRIMARY KEY,
  wish_id TEXT,
  user_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL, -- 'image', 'audio', 'voice_note'
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  url TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, storage_provider TEXT DEFAULT 'imgbb', provider_asset_id TEXT, display_url TEXT, thumbnail_url TEXT, delete_url TEXT, sha256 TEXT, width INTEGER, height INTEGER, status TEXT DEFAULT 'active', updated_at TEXT, health_status TEXT DEFAULT 'HEALTHY', last_health_check_at TEXT, health_issues TEXT, original_filename TEXT, metadata_status TEXT DEFAULT 'verified',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table: wish_media_mappings
CREATE TABLE IF NOT EXISTS wish_media_mappings (
  id TEXT PRIMARY KEY,
  wish_id TEXT NOT NULL,
  template_version_id TEXT,
  field_key TEXT NOT NULL, -- e.g. 'hero_photo', 'photo_1', 'photo_2', 'cover_photo', 'voice_note'
  media_id TEXT NOT NULL,
  section_key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (wish_id) REFERENCES wishes(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES wish_media(id) ON DELETE CASCADE
);

-- Table: wish_publication_snapshots
CREATE TABLE IF NOT EXISTS wish_publication_snapshots (
  id TEXT PRIMARY KEY,                       -- e.g. 'snp_wm_...'
  wish_id TEXT NOT NULL,                     -- Foreign key to wishes(id)
  slug TEXT UNIQUE NOT NULL,                 -- Canonical public slug at publication time
  snapshot_version INTEGER NOT NULL DEFAULT 1, -- Version of publication snapshot for this wish
  template_family_id TEXT,                   -- Template family identifier
  template_id TEXT NOT NULL,                 -- Template ID (e.g. 'tpl_glitter_birthday')
  template_version_id TEXT NOT NULL,         -- Exact immutable template version (e.g. 'tv_tpl_glitter_birthday_v1')
  relationship_id TEXT,                      -- Relationship ID (e.g. 'crush', 'friend')
  relationship_variant_id TEXT,              -- Exact relationship variant ID reference
  recipient_name TEXT NOT NULL,              -- Sanitized recipient name
  sender_name TEXT NOT NULL,                 -- Sanitized sender name
  event_date TEXT NOT NULL,                  -- YYYY-MM-DD
  expiry_date TEXT NOT NULL,                 -- YYYY-MM-DD (End of celebration active window in IST)
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  theme_config_json TEXT NOT NULL DEFAULT '{}', -- Frozen visual theme & palette
  content_json TEXT NOT NULL DEFAULT '{}',   -- Frozen content overrides & custom messages
  sections_json TEXT NOT NULL DEFAULT '[]',  -- Frozen sections ordering & configurations
  media_manifest_json TEXT NOT NULL DEFAULT '{}', -- Frozen resolved media slot URLs & metadata
  music_manifest_json TEXT NOT NULL DEFAULT '{}', -- Frozen music playback reference & metadata
  effects_config_json TEXT NOT NULL DEFAULT '{}', -- Frozen animation, particle & confetti configuration
  capabilities_json TEXT NOT NULL DEFAULT '{}',   -- Frozen template capabilities & schema snapshot
  tier TEXT NOT NULL DEFAULT 'free',         -- 'free', 'vip'
  is_private INTEGER NOT NULL DEFAULT 0,     -- 1 = noindex, nofollow
  published_at TEXT NOT NULL,                -- Publication ISO timestamp
  created_at TEXT NOT NULL,
  FOREIGN KEY (wish_id) REFERENCES wishes(id) ON DELETE CASCADE
);

-- Table: wish_sections
CREATE TABLE IF NOT EXISTS wish_sections (
  id TEXT PRIMARY KEY,
  wish_id TEXT NOT NULL,
  section_type TEXT NOT NULL, -- 'hero', 'letter', 'photos', 'timeline', 'audio', 'voice', 'envelope', 'memories', 'vault'
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  section_data TEXT NOT NULL DEFAULT '{}', -- JSON configuration payload
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (wish_id) REFERENCES wishes(id) ON DELETE CASCADE
);

-- Table: wishes
CREATE TABLE IF NOT EXISTS wishes (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  order_id TEXT,
  template_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free', -- 'free', 'vip'
  price INTEGER NOT NULL DEFAULT 0,
  is_private INTEGER NOT NULL DEFAULT 0,
  buyer_name TEXT NOT NULL,
  buyer_contact TEXT,
  recipient_name TEXT NOT NULL,
  event_date TEXT NOT NULL,          -- YYYY-MM-DD
  expiry_date TEXT NOT NULL,         -- YYYY-MM-DD (End of grace window)
  lifecycle_status TEXT DEFAULT 'active',
  views INTEGER NOT NULL DEFAULT 0,
  custom_data TEXT NOT NULL,         -- Full custom data JSON
  payment TEXT,                      -- JSON object or NULL
  status TEXT NOT NULL DEFAULT 'published', -- 'published', 'draft', 'archived'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, template_version_id TEXT, active_snapshot_id TEXT, moderation_status TEXT DEFAULT 'approved', moderation_reason TEXT, moderated_by TEXT, moderated_at TEXT, is_flagged INTEGER DEFAULT 0, admin_notes TEXT, extended_expiry_at TEXT, original_creator_id TEXT, lock_version INTEGER DEFAULT 1, published_at TEXT, pinned_version_hash TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- SECTION 2: INDEXES

-- Index: idx_admin_audit_logs_action
CREATE INDEX idx_admin_audit_logs_action ON admin_audit_logs(action);

-- Index: idx_admin_audit_logs_actor
CREATE INDEX idx_admin_audit_logs_actor ON admin_audit_logs(actor_id);

-- Index: idx_admin_audit_logs_created
CREATE INDEX idx_admin_audit_logs_created ON admin_audit_logs(created_at);

-- Index: idx_admin_error_category
CREATE INDEX idx_admin_error_category ON admin_error_logs(category, created_at DESC);

-- Index: idx_admin_error_code
CREATE INDEX idx_admin_error_code ON admin_error_logs(error_code);

-- Index: idx_admin_error_resolved
CREATE INDEX idx_admin_error_resolved ON admin_error_logs(resolved, created_at DESC);

-- Index: idx_admin_error_target
CREATE INDEX idx_admin_error_target ON admin_error_logs(target_type, target_id);

-- Index: idx_admin_ingestion_family
CREATE INDEX idx_admin_ingestion_family ON admin_ingestion_jobs(family_id);

-- Index: idx_admin_ingestion_status
CREATE INDEX idx_admin_ingestion_status ON admin_ingestion_jobs(status, started_at DESC);

-- Index: idx_admin_roles_user
CREATE UNIQUE INDEX idx_admin_roles_user ON admin_roles(user_id);

-- Index: idx_admin_staff_mobile
CREATE INDEX idx_admin_staff_mobile ON admin_staff(mobile);

-- Index: idx_admin_staff_role
CREATE INDEX idx_admin_staff_role ON admin_staff(role);

-- Index: idx_admin_staff_status
CREATE INDEX idx_admin_staff_status ON admin_staff(status);

-- Index: idx_analytics_event_name
CREATE INDEX idx_analytics_event_name ON analytics_events(event_name);

-- Index: idx_analytics_event_time
CREATE INDEX idx_analytics_event_time ON analytics_events(event_name, timestamp);

-- Index: idx_analytics_template_name
CREATE INDEX idx_analytics_template_name ON analytics_events(template_id, event_name);

-- Index: idx_analytics_timestamp
CREATE INDEX idx_analytics_timestamp ON analytics_events(timestamp);

-- Index: idx_analytics_user_id
CREATE INDEX idx_analytics_user_id ON analytics_events(user_id);

-- Index: idx_analytics_wish_event
CREATE INDEX idx_analytics_wish_event ON analytics_events(wish_id, event_name);

-- Index: idx_attributions_code
CREATE INDEX idx_attributions_code ON referral_attributions(referral_code);

-- Index: idx_attributions_referee
CREATE INDEX idx_attributions_referee ON referral_attributions(referee_user_id);

-- Index: idx_attributions_referrer
CREATE INDEX idx_attributions_referrer ON referral_attributions(referrer_user_id);

-- Index: idx_attributions_status
CREATE INDEX idx_attributions_status ON referral_attributions(status);

-- Index: idx_attributions_token
CREATE INDEX idx_attributions_token ON referral_attributions(visitor_token);

-- Index: idx_b2_storage_objects_entity
CREATE INDEX idx_b2_storage_objects_entity ON b2_storage_objects(entity_type, entity_id);

-- Index: idx_b2_storage_objects_file_id
CREATE INDEX idx_b2_storage_objects_file_id ON b2_storage_objects(file_id);

-- Index: idx_b2_storage_objects_key
CREATE INDEX idx_b2_storage_objects_key ON b2_storage_objects(object_key);

-- Index: idx_b2_storage_objects_status
CREATE INDEX idx_b2_storage_objects_status ON b2_storage_objects(upload_status);

-- Index: idx_categories_slug
CREATE INDEX idx_categories_slug ON categories(slug);

-- Index: idx_categories_sort_order
CREATE INDEX idx_categories_sort_order ON categories(sort_order);

-- Index: idx_cleanup_items_job
CREATE INDEX idx_cleanup_items_job ON account_cleanup_items(job_id);

-- Index: idx_cleanup_items_status
CREATE INDEX idx_cleanup_items_status ON account_cleanup_items(status);

-- Index: idx_cleanup_items_user
CREATE INDEX idx_cleanup_items_user ON account_cleanup_items(user_id);

-- Index: idx_cookie_consent_anon
CREATE INDEX idx_cookie_consent_anon ON user_cookie_consents(anonymous_token);

-- Index: idx_cookie_consent_user
CREATE INDEX idx_cookie_consent_user ON user_cookie_consents(user_id);

-- Index: idx_daily_agg_date_metric
CREATE INDEX idx_daily_agg_date_metric ON analytics_daily_aggregates(reporting_date, metric_name);

-- Index: idx_daily_agg_dim
CREATE INDEX idx_daily_agg_dim ON analytics_daily_aggregates(dimension_key, dimension_value);

-- Index: idx_daily_agg_metric
CREATE INDEX idx_daily_agg_metric ON analytics_daily_aggregates(metric_name);

-- Index: idx_data_exports_expires
CREATE INDEX idx_data_exports_expires ON user_data_exports(expires_at);

-- Index: idx_data_exports_status
CREATE INDEX idx_data_exports_status ON user_data_exports(status);

-- Index: idx_data_exports_user
CREATE INDEX idx_data_exports_user ON user_data_exports(user_id);

-- Index: idx_deletion_requests_grace
CREATE INDEX idx_deletion_requests_grace ON account_deletion_requests(grace_period_ends_at);

-- Index: idx_deletion_requests_status
CREATE INDEX idx_deletion_requests_status ON account_deletion_requests(status);

-- Index: idx_deletion_requests_user
CREATE INDEX idx_deletion_requests_user ON account_deletion_requests(user_id);

-- Index: idx_ent_announcements_created
CREATE INDEX idx_ent_announcements_created ON enterprise_announcements(created_at);

-- Index: idx_ent_announcements_status
CREATE INDEX idx_ent_announcements_status ON enterprise_announcements(status);

-- Index: idx_entitlements_status
CREATE INDEX idx_entitlements_status ON entitlements(status);

-- Index: idx_entitlements_user_id
CREATE INDEX idx_entitlements_user_id ON entitlements(user_id);

-- Index: idx_favorites_user
CREATE INDEX idx_favorites_user ON favorites(user_id);

-- Index: idx_favorites_user_item
CREATE UNIQUE INDEX idx_favorites_user_item ON favorites(user_id, item_id);

-- Index: idx_favorites_user_type
CREATE INDEX idx_favorites_user_type ON favorites(user_id, item_type);

-- Index: idx_fraud_created
CREATE INDEX idx_fraud_created ON referral_fraud_logs(created_at);

-- Index: idx_fraud_referrer
CREATE INDEX idx_fraud_referrer ON referral_fraud_logs(referrer_user_id);

-- Index: idx_fraud_risk
CREATE INDEX idx_fraud_risk ON referral_fraud_logs(risk_score);

-- Index: idx_help_articles_category
CREATE INDEX idx_help_articles_category ON help_articles(category_id, is_published);

-- Index: idx_help_articles_slug
CREATE INDEX idx_help_articles_slug ON help_articles(slug);

-- Index: idx_help_articles_sort
CREATE INDEX idx_help_articles_sort ON help_articles(sort_order);

-- Index: idx_legal_policies_status
CREATE INDEX idx_legal_policies_status ON legal_policies(status);

-- Index: idx_legal_policies_type
CREATE INDEX idx_legal_policies_type ON legal_policies(policy_type);

-- Index: idx_legal_policies_version
CREATE INDEX idx_legal_policies_version ON legal_policies(policy_type, version);

-- Index: idx_lifecycle_jobs_retry
CREATE INDEX idx_lifecycle_jobs_retry ON account_lifecycle_jobs(next_eligible_retry_at);

-- Index: idx_lifecycle_jobs_status
CREATE INDEX idx_lifecycle_jobs_status ON account_lifecycle_jobs(status);

-- Index: idx_lifecycle_jobs_user
CREATE INDEX idx_lifecycle_jobs_user ON account_lifecycle_jobs(user_id);

-- Index: idx_moderation_reports_status
CREATE INDEX idx_moderation_reports_status ON moderation_reports(status, created_at);

-- Index: idx_moderation_reports_target
CREATE INDEX idx_moderation_reports_target ON moderation_reports(target_type, target_id);

-- Index: idx_music_library_category
CREATE INDEX idx_music_library_category ON music_library(category);

-- Index: idx_music_library_featured
CREATE INDEX idx_music_library_featured ON music_library(is_featured);

-- Index: idx_music_library_health
CREATE INDEX idx_music_library_health ON music_library(health_status);

-- Index: idx_music_library_sha256
CREATE INDEX idx_music_library_sha256 ON music_library(sha256);

-- Index: idx_music_library_status
CREATE INDEX idx_music_library_status ON music_library(status);

-- Index: idx_notif_attempts_created
CREATE INDEX idx_notif_attempts_created ON notification_delivery_attempts(created_at);

-- Index: idx_notif_attempts_job
CREATE INDEX idx_notif_attempts_job ON notification_delivery_attempts(job_id);

-- Index: idx_notif_jobs_created_at
CREATE INDEX idx_notif_jobs_created_at ON notification_delivery_jobs(created_at);

-- Index: idx_notif_jobs_idempotency
CREATE INDEX idx_notif_jobs_idempotency ON notification_delivery_jobs(idempotency_key);

-- Index: idx_notif_jobs_recipient
CREATE INDEX idx_notif_jobs_recipient ON notification_delivery_jobs(recipient_user_id);

-- Index: idx_notif_jobs_status_retry
CREATE INDEX idx_notif_jobs_status_retry ON notification_delivery_jobs(status, next_eligible_retry_at);

-- Index: idx_notifications_created_at
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- Index: idx_notifications_user_id
CREATE INDEX idx_notifications_user_id ON notifications(user_id);

-- Index: idx_notifications_user_read
CREATE INDEX idx_notifications_user_read ON notifications(user_id, read_at);

-- Index: idx_notifications_user_unread
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at);

-- Index: idx_order_items_order_id
CREATE INDEX idx_order_items_order_id ON order_items(order_id);

-- Index: idx_order_items_product_id
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- Index: idx_orders_prov_order_id
CREATE INDEX idx_orders_prov_order_id ON orders(provider_order_id);

-- Index: idx_orders_status
CREATE INDEX idx_orders_status ON orders(status);

-- Index: idx_orders_user_created
CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);

-- Index: idx_orders_user_id
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Index: idx_payment_attempts_order_id
CREATE INDEX idx_payment_attempts_order_id ON payment_attempts(order_id);

-- Index: idx_payment_attempts_prov_order
CREATE INDEX idx_payment_attempts_prov_order ON payment_attempts(provider_order_id);

-- Index: idx_payment_attempts_prov_pay
CREATE INDEX idx_payment_attempts_prov_pay ON payment_attempts(provider_payment_id);

-- Index: idx_payment_attempts_status
CREATE INDEX idx_payment_attempts_status ON payment_attempts(status);

-- Index: idx_payment_webhooks_event_id
CREATE INDEX idx_payment_webhooks_event_id ON payment_webhooks(event_id);

-- Index: idx_payment_webhooks_order_id
CREATE INDEX idx_payment_webhooks_order_id ON payment_webhooks(order_id);

-- Index: idx_payment_webhooks_status
CREATE INDEX idx_payment_webhooks_status ON payment_webhooks(status);

-- Index: idx_policy_acc_type
CREATE INDEX idx_policy_acc_type ON policy_acceptances(policy_type);

-- Index: idx_policy_acc_user
CREATE INDEX idx_policy_acc_user ON policy_acceptances(user_id);

-- Index: idx_policy_acc_user_type
CREATE INDEX idx_policy_acc_user_type ON policy_acceptances(user_id, policy_type);

-- Index: idx_privacy_user_id
CREATE INDEX idx_privacy_user_id ON user_privacy_settings(user_id);

-- Index: idx_referral_codes_code
CREATE INDEX idx_referral_codes_code ON user_referral_codes(referral_code);

-- Index: idx_referral_codes_slug
CREATE INDEX idx_referral_codes_slug ON user_referral_codes(custom_slug);

-- Index: idx_referral_codes_user
CREATE INDEX idx_referral_codes_user ON user_referral_codes(user_id);

-- Index: idx_refunds_order_id
CREATE INDEX idx_refunds_order_id ON refunds(order_id);

-- Index: idx_refunds_prov_refund
CREATE INDEX idx_refunds_prov_refund ON refunds(provider_refund_id);

-- Index: idx_refunds_status
CREATE INDEX idx_refunds_status ON refunds(status);

-- Index: idx_relationships_slug
CREATE INDEX idx_relationships_slug ON relationships(slug);

-- Index: idx_relationships_sort_order
CREATE INDEX idx_relationships_sort_order ON relationships(sort_order);

-- Index: idx_relationships_status
CREATE INDEX idx_relationships_status ON relationships(status);

-- Index: idx_retention_audit_user
CREATE INDEX idx_retention_audit_user ON account_retention_audit_log(user_id);

-- Index: idx_reward_ledger_attribution
CREATE INDEX idx_reward_ledger_attribution ON referral_rewards_ledger(attribution_id);

-- Index: idx_reward_ledger_idempotency
CREATE INDEX idx_reward_ledger_idempotency ON referral_rewards_ledger(idempotency_key);

-- Index: idx_reward_ledger_status
CREATE INDEX idx_reward_ledger_status ON referral_rewards_ledger(status);

-- Index: idx_reward_ledger_user
CREATE INDEX idx_reward_ledger_user ON referral_rewards_ledger(user_id);

-- Index: idx_sched_remind_dedup
CREATE INDEX idx_sched_remind_dedup ON notification_scheduled_reminders(dedup_key);

-- Index: idx_sched_remind_status_date
CREATE INDEX idx_sched_remind_status_date ON notification_scheduled_reminders(status, scheduled_for);

-- Index: idx_search_analytics_created
CREATE INDEX idx_search_analytics_created ON search_analytics(created_at DESC);

-- Index: idx_search_analytics_no_results
CREATE INDEX idx_search_analytics_no_results ON search_analytics(has_results, created_at DESC);

-- Index: idx_search_analytics_query
CREATE INDEX idx_search_analytics_query ON search_analytics(normalized_query);

-- Index: idx_search_analytics_user
CREATE INDEX idx_search_analytics_user ON search_analytics(user_id);

-- Index: idx_search_index_cat
CREATE INDEX idx_search_index_cat ON search_index(category);

-- Index: idx_search_index_entity
CREATE INDEX idx_search_index_entity ON search_index(entity_type, is_published);

-- Index: idx_search_index_entity_id
CREATE INDEX idx_search_index_entity_id ON search_index(entity_id);

-- Index: idx_search_index_pop
CREATE INDEX idx_search_index_pop ON search_index(popularity_score DESC);

-- Index: idx_search_index_tier
CREATE INDEX idx_search_index_tier ON search_index(tier, is_premium);

-- Index: idx_search_recent_session
CREATE INDEX idx_search_recent_session ON search_recent_queries(session_id, created_at DESC);

-- Index: idx_search_recent_user
CREATE INDEX idx_search_recent_user ON search_recent_queries(user_id, created_at DESC);

-- Index: idx_search_synonyms_active
CREATE INDEX idx_search_synonyms_active ON search_synonyms_keywords(is_active);

-- Index: idx_search_synonyms_keyword
CREATE INDEX idx_search_synonyms_keyword ON search_synonyms_keywords(keyword);

-- Index: idx_security_events_created
CREATE INDEX idx_security_events_created ON user_security_events(created_at);

-- Index: idx_security_events_type
CREATE INDEX idx_security_events_type ON user_security_events(event_type);

-- Index: idx_security_events_user
CREATE INDEX idx_security_events_user ON user_security_events(user_id);

-- Index: idx_sessions_expires_at
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Index: idx_sessions_token
CREATE INDEX idx_sessions_token ON sessions(token);

-- Index: idx_sessions_user_id
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- Index: idx_site_settings_key
CREATE INDEX idx_site_settings_key ON site_settings(key);

-- Index: idx_storage_cleanup_jobs_status
CREATE INDEX idx_storage_cleanup_jobs_status ON storage_cleanup_jobs(status, started_at);

-- Index: idx_storage_health_audits_status
CREATE INDEX idx_storage_health_audits_status ON storage_health_audits(status, started_at);

-- Index: idx_storage_quarantine_asset
CREATE INDEX idx_storage_quarantine_asset ON storage_quarantine(asset_id, provider);

-- Index: idx_storage_quarantine_status
CREATE INDEX idx_storage_quarantine_status ON storage_quarantine(status, quarantined_at);

-- Index: idx_support_attachments_ticket
CREATE INDEX idx_support_attachments_ticket ON support_attachments(ticket_id);

-- Index: idx_support_attachments_user
CREATE INDEX idx_support_attachments_user ON support_attachments(user_id);

-- Index: idx_support_tickets_created_at
CREATE INDEX idx_support_tickets_created_at ON support_tickets(created_at);

-- Index: idx_support_tickets_order
CREATE INDEX idx_support_tickets_order ON support_tickets(order_id);

-- Index: idx_support_tickets_status
CREATE INDEX idx_support_tickets_status ON support_tickets(status, priority);

-- Index: idx_support_tickets_user
CREATE INDEX idx_support_tickets_user ON support_tickets(user_id);

-- Index: idx_support_tickets_user_status
CREATE INDEX idx_support_tickets_user_status ON support_tickets(user_id, status);

-- Index: idx_support_tickets_wish
CREATE INDEX idx_support_tickets_wish ON support_tickets(wish_id);

-- Index: idx_template_families_category
CREATE INDEX idx_template_families_category ON template_families(category);

-- Index: idx_template_families_current_ver
CREATE INDEX idx_template_families_current_ver ON template_families(current_version_id);

-- Index: idx_template_families_slug
CREATE INDEX idx_template_families_slug ON template_families(slug);

-- Index: idx_template_families_status
CREATE INDEX idx_template_families_status ON template_families(status);

-- Index: idx_template_families_tier
CREATE INDEX idx_template_families_tier ON template_families(tier);

-- Index: idx_template_fields_key
CREATE INDEX idx_template_fields_key ON template_fields(field_key);

-- Index: idx_template_fields_unique
CREATE UNIQUE INDEX idx_template_fields_unique ON template_fields(template_version_id, field_key);

-- Index: idx_template_fields_version
CREATE INDEX idx_template_fields_version ON template_fields(template_version_id);

-- Index: idx_template_files_key
CREATE INDEX idx_template_files_key ON template_files(storage_key);

-- Index: idx_template_files_unique
CREATE UNIQUE INDEX idx_template_files_unique ON template_files(template_version_id, relative_path);

-- Index: idx_template_files_version
CREATE INDEX idx_template_files_version ON template_files(template_version_id);

-- Index: idx_template_images_asset_key
CREATE INDEX idx_template_images_asset_key ON template_images(asset_key);

-- Index: idx_template_images_health
CREATE INDEX idx_template_images_health ON template_images(health_status);

-- Index: idx_template_images_provider_asset
CREATE INDEX idx_template_images_provider_asset ON template_images(provider_asset_id);

-- Index: idx_template_images_rel
CREATE INDEX idx_template_images_rel ON template_images(relationship_id);

-- Index: idx_template_images_status
CREATE INDEX idx_template_images_status ON template_images(status);

-- Index: idx_template_images_template_id
CREATE INDEX idx_template_images_template_id ON template_images(template_id);

-- Index: idx_template_images_version
CREATE INDEX idx_template_images_version ON template_images(template_version_id);

-- Index: idx_template_music_rel
CREATE INDEX idx_template_music_rel ON template_music(relationship_id);

-- Index: idx_template_music_song
CREATE INDEX idx_template_music_song ON template_music(music_id);

-- Index: idx_template_music_unique
CREATE UNIQUE INDEX idx_template_music_unique ON template_music(template_version_id, music_id, relationship_variant_id);

-- Index: idx_template_music_variant
CREATE INDEX idx_template_music_variant ON template_music(relationship_variant_id);

-- Index: idx_template_music_version
CREATE INDEX idx_template_music_version ON template_music(template_version_id);

-- Index: idx_template_rel_variants_relationship
CREATE INDEX idx_template_rel_variants_relationship ON template_relationship_variants(relationship_id);

-- Index: idx_template_rel_variants_status
CREATE INDEX idx_template_rel_variants_status ON template_relationship_variants(status);

-- Index: idx_template_rel_variants_unique
CREATE UNIQUE INDEX idx_template_rel_variants_unique ON template_relationship_variants(template_version_id, relationship_id);

-- Index: idx_template_rel_variants_version
CREATE INDEX idx_template_rel_variants_version ON template_relationship_variants(template_version_id);

-- Index: idx_template_relationships_family
CREATE INDEX idx_template_relationships_family ON template_relationships(template_family_id);

-- Index: idx_template_relationships_relationship
CREATE INDEX idx_template_relationships_relationship ON template_relationships(relationship_id);

-- Index: idx_template_relationships_template
CREATE INDEX idx_template_relationships_template ON template_relationships(template_id);

-- Index: idx_template_relationships_unique
CREATE UNIQUE INDEX idx_template_relationships_unique ON template_relationships(template_id, relationship_id);

-- Index: idx_template_relationships_version
CREATE INDEX idx_template_relationships_version ON template_relationships(template_version_id);

-- Index: idx_template_upload_author
CREATE INDEX idx_template_upload_author ON template_upload_operations(author_id);

-- Index: idx_template_upload_family
CREATE INDEX idx_template_upload_family ON template_upload_operations(template_family_id);

-- Index: idx_template_upload_fingerprint
CREATE INDEX idx_template_upload_fingerprint ON template_upload_operations(package_fingerprint);

-- Index: idx_template_upload_idempotency
CREATE UNIQUE INDEX idx_template_upload_idempotency ON template_upload_operations(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Index: idx_template_upload_state
CREATE INDEX idx_template_upload_state ON template_upload_operations(state);

-- Index: idx_template_versions_family
CREATE INDEX idx_template_versions_family ON template_versions(template_family_id);

-- Index: idx_template_versions_protocol
CREATE INDEX idx_template_versions_protocol ON template_versions(protocol_version, schema_version);

-- Index: idx_template_versions_provider
CREATE INDEX idx_template_versions_provider ON template_versions(storage_provider);

-- Index: idx_template_versions_publishable
CREATE INDEX idx_template_versions_publishable ON template_versions(is_publishable, status);

-- Index: idx_template_versions_runtime_hash
CREATE INDEX idx_template_versions_runtime_hash ON template_versions(runtime_hash);

-- Index: idx_template_versions_status
CREATE INDEX idx_template_versions_status ON template_versions(status);

-- Index: idx_template_versions_template
CREATE INDEX idx_template_versions_template ON template_versions(template_id);

-- Index: idx_template_versions_template_curr
CREATE INDEX idx_template_versions_template_curr ON template_versions(template_id, is_current);

-- Index: idx_template_versions_unique
CREATE UNIQUE INDEX idx_template_versions_unique ON template_versions(template_id, version_number);

-- Index: idx_templates_category
CREATE INDEX idx_templates_category ON templates(category);

-- Index: idx_templates_slug
CREATE INDEX idx_templates_slug ON templates(slug);

-- Index: idx_templates_status
CREATE INDEX idx_templates_status ON templates(status);

-- Index: idx_templates_tier
CREATE INDEX idx_templates_tier ON templates(tier);

-- Index: idx_ticket_messages_created
CREATE INDEX idx_ticket_messages_created ON support_ticket_messages(ticket_id, created_at);

-- Index: idx_ticket_messages_ticket
CREATE INDEX idx_ticket_messages_ticket ON support_ticket_messages(ticket_id);

-- Index: idx_trv_is_latest
CREATE INDEX idx_trv_is_latest ON template_relationship_variants(is_latest);

-- Index: idx_trv_template_status
CREATE INDEX idx_trv_template_status ON template_relationship_variants(template_id, status);

-- Index: idx_trv_version_number
CREATE INDEX idx_trv_version_number ON template_relationship_variants(template_version_id, version_number);

-- Index: idx_tv_is_current
CREATE INDEX idx_tv_is_current ON template_versions(template_id, is_current);

-- Index: idx_tv_package_fingerprint
CREATE INDEX idx_tv_package_fingerprint ON template_versions(package_fingerprint);

-- Index: idx_tv_template_status
CREATE INDEX idx_tv_template_status ON template_versions(template_id, status);

-- Index: idx_user_activity_logs_type
CREATE INDEX idx_user_activity_logs_type ON user_activity_logs(activity_type);

-- Index: idx_user_activity_logs_user
CREATE INDEX idx_user_activity_logs_user ON user_activity_logs(user_id, created_at);

-- Index: idx_users_email
CREATE INDEX idx_users_email ON users(email);

-- Index: idx_users_last_login
CREATE INDEX idx_users_last_login ON users(last_login_at);

-- Index: idx_users_role
CREATE INDEX idx_users_role ON users(role);

-- Index: idx_users_status
CREATE INDEX idx_users_status ON users(status);

-- Index: idx_wish_media_health
CREATE INDEX idx_wish_media_health ON wish_media(health_status);

-- Index: idx_wish_media_key
CREATE INDEX idx_wish_media_key ON wish_media(object_key);

-- Index: idx_wish_media_mappings_field
CREATE INDEX idx_wish_media_mappings_field ON wish_media_mappings(field_key);

-- Index: idx_wish_media_mappings_media
CREATE INDEX idx_wish_media_mappings_media ON wish_media_mappings(media_id);

-- Index: idx_wish_media_mappings_unique
CREATE UNIQUE INDEX idx_wish_media_mappings_unique ON wish_media_mappings(wish_id, field_key, media_id);

-- Index: idx_wish_media_mappings_wish
CREATE INDEX idx_wish_media_mappings_wish ON wish_media_mappings(wish_id);

-- Index: idx_wish_media_provider
CREATE INDEX idx_wish_media_provider ON wish_media(storage_provider);

-- Index: idx_wish_media_provider_asset
CREATE INDEX idx_wish_media_provider_asset ON wish_media(provider_asset_id);

-- Index: idx_wish_media_status
CREATE INDEX idx_wish_media_status ON wish_media(status);

-- Index: idx_wish_media_user_id
CREATE INDEX idx_wish_media_user_id ON wish_media(user_id);

-- Index: idx_wish_media_wish_id
CREATE INDEX idx_wish_media_wish_id ON wish_media(wish_id);

-- Index: idx_wish_pub_snapshots_event_date
CREATE INDEX idx_wish_pub_snapshots_event_date ON wish_publication_snapshots(event_date);

-- Index: idx_wish_pub_snapshots_slug
CREATE UNIQUE INDEX idx_wish_pub_snapshots_slug ON wish_publication_snapshots(slug);

-- Index: idx_wish_pub_snapshots_template_version
CREATE INDEX idx_wish_pub_snapshots_template_version ON wish_publication_snapshots(template_version_id);

-- Index: idx_wish_pub_snapshots_wish_id
CREATE INDEX idx_wish_pub_snapshots_wish_id ON wish_publication_snapshots(wish_id);

-- Index: idx_wish_sections_order
CREATE INDEX idx_wish_sections_order ON wish_sections(wish_id, sort_order);

-- Index: idx_wish_sections_wish_id
CREATE INDEX idx_wish_sections_wish_id ON wish_sections(wish_id);

-- Index: idx_wishes_active_snapshot
CREATE INDEX idx_wishes_active_snapshot ON wishes(active_snapshot_id);

-- Index: idx_wishes_active_snapshot_id
CREATE INDEX idx_wishes_active_snapshot_id ON wishes(active_snapshot_id);

-- Index: idx_wishes_created_at
CREATE INDEX idx_wishes_created_at ON wishes(created_at);

-- Index: idx_wishes_event_date
CREATE INDEX idx_wishes_event_date ON wishes(event_date);

-- Index: idx_wishes_moderation
CREATE INDEX idx_wishes_moderation ON wishes(moderation_status, is_flagged);

-- Index: idx_wishes_pinned_version
CREATE INDEX idx_wishes_pinned_version ON wishes(template_version_id, status);

-- Index: idx_wishes_slug
CREATE INDEX idx_wishes_slug ON wishes(slug);

-- Index: idx_wishes_slug_status
CREATE INDEX idx_wishes_slug_status ON wishes(slug, status);

-- Index: idx_wishes_template_id
CREATE INDEX idx_wishes_template_id ON wishes(template_id);

-- Index: idx_wishes_template_version
CREATE INDEX idx_wishes_template_version ON wishes(template_version_id);

-- Index: idx_wishes_template_version_id
CREATE INDEX idx_wishes_template_version_id ON wishes(template_version_id);

-- Index: idx_wishes_user_created
CREATE INDEX idx_wishes_user_created ON wishes(user_id, created_at);

-- Index: idx_wishes_user_event_date
CREATE INDEX idx_wishes_user_event_date ON wishes(user_id, event_date);

-- Index: idx_wishes_user_id
CREATE INDEX idx_wishes_user_id ON wishes(user_id);

-- Index: idx_wishes_user_status
CREATE INDEX idx_wishes_user_status ON wishes(user_id, status);

-- Index: idx_wishes_slug_unique (Migration 0033)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wishes_slug_unique ON wishes(slug);

-- Index: idx_wishes_lifecycle_status (Migration 0033)
CREATE INDEX IF NOT EXISTS idx_wishes_lifecycle_status ON wishes(lifecycle_status);

-- Index: idx_wishes_expiry_date (Migration 0033)
CREATE INDEX IF NOT EXISTS idx_wishes_expiry_date ON wishes(expiry_date);

-- Index: idx_templates_published_cat (Migration 0034)
CREATE INDEX IF NOT EXISTS idx_templates_published_cat ON templates(is_published, category);

-- Index: idx_templates_published_tier (Migration 0034)
CREATE INDEX IF NOT EXISTS idx_templates_published_tier ON templates(is_published, tier);

-- Index: idx_templates_published_placement (Migration 0034)
CREATE INDEX IF NOT EXISTS idx_templates_published_placement ON templates(is_published, placement);

-- Index: idx_template_rel_enabled (Migration 0034)
CREATE INDEX IF NOT EXISTS idx_template_rel_enabled ON template_relationships(template_id, enabled);

-- ============================================================================
-- WishMagic Cloudflare D1 Architecture Migration (Part 47)
-- Migration: 0035_part47_content_moderation_system.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description:
--   Complete Production Content Moderation, Media Quarantine, Multi-Provider
--   Scan Ledger, Repeat-Offender Strike & Restriction Tracking, Appeal
--   Workflow, and Sealed CSAM Legal Compliance Incident Tables.
-- ============================================================================

-- 1. ADDITIVE MODERATION & QUARANTINE COLUMNS ON EXISTING TABLES
ALTER TABLE wish_media ADD COLUMN moderation_status TEXT DEFAULT 'APPROVED';
ALTER TABLE wish_media ADD COLUMN moderation_reason TEXT;
ALTER TABLE wish_media ADD COLUMN moderation_item_id TEXT;
ALTER TABLE wish_media ADD COLUMN is_quarantined INTEGER DEFAULT 0;

ALTER TABLE music_library ADD COLUMN moderation_status TEXT DEFAULT 'APPROVED';
ALTER TABLE music_library ADD COLUMN moderation_reason TEXT;
ALTER TABLE music_library ADD COLUMN moderation_item_id TEXT;

ALTER TABLE users ADD COLUMN moderation_strikes INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN moderation_restricted INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN moderation_restriction_reason TEXT;
ALTER TABLE users ADD COLUMN moderation_restricted_until TEXT;

-- 2. MODERATION ITEMS & QUARANTINE VAULT TABLE
CREATE TABLE IF NOT EXISTS moderation_items (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  owner_user_id TEXT,
  owner_email TEXT,
  media_kind TEXT DEFAULT 'text',
  filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER DEFAULT 0,
  sha256 TEXT,
  storage_provider TEXT,
  private_storage_key TEXT,
  approved_public_url TEXT,
  thumbnail_url TEXT,
  content_excerpt TEXT,
  extracted_ocr_text TEXT,
  transcript_text TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  is_quarantined INTEGER NOT NULL DEFAULT 1,
  is_csam_locked INTEGER NOT NULL DEFAULT 0,
  categories_json TEXT DEFAULT '[]',
  confidence_score INTEGER DEFAULT 0,
  provider_name TEXT DEFAULT 'local_hybrid',
  rejection_reason TEXT,
  scan_report_json TEXT DEFAULT '{}',
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_notes TEXT,
  appeal_status TEXT DEFAULT 'NONE',
  retention_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 3. MODERATION SCAN ATTEMPTS & PROVIDER TELEMETRY TABLE
CREATE TABLE IF NOT EXISTS moderation_scans (
  id TEXT PRIMARY KEY,
  moderation_item_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  media_kind TEXT NOT NULL,
  scan_status TEXT NOT NULL,
  verdict TEXT NOT NULL,
  confidence_score INTEGER DEFAULT 0,
  categories_json TEXT DEFAULT '[]',
  error_code TEXT,
  error_message TEXT,
  latency_ms INTEGER DEFAULT 0,
  raw_summary_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (moderation_item_id) REFERENCES moderation_items(id) ON DELETE CASCADE
);

-- 4. USER MODERATION VIOLATIONS & STRIKE LEDGER TABLE
CREATE TABLE IF NOT EXISTS moderation_violations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  moderation_item_id TEXT,
  target_type TEXT NOT NULL,
  target_id TEXT,
  violation_category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'HIGH',
  reason TEXT NOT NULL,
  strike_weight INTEGER NOT NULL DEFAULT 1,
  action_taken TEXT NOT NULL DEFAULT 'CONTENT_BLOCKED',
  created_at TEXT NOT NULL
);

-- 5. MODERATION APPEALS & RECHECK REQUESTS TABLE
CREATE TABLE IF NOT EXISTS moderation_appeals (
  id TEXT PRIMARY KEY,
  moderation_item_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_email TEXT,
  appeal_reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  resolution_notes TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (moderation_item_id) REFERENCES moderation_items(id) ON DELETE CASCADE
);

-- 6. SEALED CSAM LEGAL COMPLIANCE INCIDENTS TABLE (ZERO-EXPOSURE)
CREATE TABLE IF NOT EXISTS csam_compliance_incidents (
  id TEXT PRIMARY KEY,
  moderation_item_id TEXT NOT NULL,
  offender_user_id TEXT,
  offender_ip_hash TEXT,
  sha256_evidence TEXT,
  detection_source TEXT NOT NULL,
  legal_report_status TEXT NOT NULL DEFAULT 'PENDING_MANDATORY_REPORT',
  sealed_metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

-- 7. PERFORMANCE & LOOKUP INDEXES
CREATE INDEX IF NOT EXISTS idx_mod_items_status ON moderation_items(status, created_at);
CREATE INDEX IF NOT EXISTS idx_mod_items_target ON moderation_items(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_mod_items_owner ON moderation_items(owner_user_id, status);
CREATE INDEX IF NOT EXISTS idx_mod_items_sha256 ON moderation_items(sha256);
CREATE INDEX IF NOT EXISTS idx_mod_scans_item ON moderation_scans(moderation_item_id);
CREATE INDEX IF NOT EXISTS idx_mod_violations_user ON moderation_violations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mod_appeals_status ON moderation_appeals(status, created_at);
CREATE INDEX IF NOT EXISTS idx_wish_media_mod_status ON wish_media(moderation_status, is_quarantined);

-- 8. RECORD MIGRATION IN _MIGRATIONS REGISTRY
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0035', '0035_part47_content_moderation_system.sql', '2026-10-15T16:50:00.000Z');


-- ============================================================================
-- WishMagic Cloudflare D1 Architecture Migration (Part 48)
-- Migration: 0036_part48_utp_v1_1_variant_system.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description:
--   Universal Template Variant System + UTP v1.1.0 Standard Update:
--   1. Additive columns on template_relationship_variants for variant slug,
--      relationship slug/label, entry file, thumbnail, fields/sections/assets
--      overrides, enabled flag, sort order, and default variant flag.
--   2. Additive variant summary columns on templates and template_versions.
--   3. Seed complete canonical relationships catalog (including best_friend,
--      son, daughter, grandparents, family, colleague, teacher, mentor,
--      partner, fiance, sibling) for foreign key integrity.
--   4. Performance indexes for gallery relation tag lookups and variant resolution.
-- ============================================================================

-- 1. SEED EXTENDED CANONICAL RELATIONSHIPS CATALOG
INSERT OR IGNORE INTO relationships (id, slug, name, display_name, icon, category, status, sort_order, created_at, updated_at) VALUES
('rel_best_friend', 'best_friend', 'Best Friend', 'Best Friend Forever', '🌟', 'friends', 'active', 6, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_partner', 'partner', 'Partner', 'Beloved Partner', '💫', 'romantic', 'active', 12, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_fiance', 'fiance', 'Fiance', 'Beloved Fiance', '💎', 'romantic', 'active', 13, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_sibling', 'sibling', 'Sibling', 'Cherished Sibling', '🤝', 'family', 'active', 14, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_son', 'son', 'Son', 'Dearest Son', '🚀', 'family', 'active', 15, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_daughter', 'daughter', 'Daughter', 'Dearest Daughter', '🌷', 'family', 'active', 16, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_grandparents', 'grandparents', 'Grandparents', 'Beloved Grandparents', '🕊️', 'family', 'active', 17, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_family', 'family', 'Family', 'Family Celebration', '🏡', 'family', 'active', 18, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_colleague', 'colleague', 'Colleague', 'Valued Colleague', '🎉', 'general', 'active', 19, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_teacher', 'teacher', 'Teacher', 'Inspiring Teacher', '📚', 'general', 'active', 20, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
('rel_mentor', 'mentor', 'Mentor', 'Trusted Mentor', '🧭', 'general', 'active', 21, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z');

-- 2. ADDITIVE COLUMNS ON TEMPLATE_RELATIONSHIP_VARIANTS
ALTER TABLE template_relationship_variants ADD COLUMN variant_slug TEXT;
ALTER TABLE template_relationship_variants ADD COLUMN relationship_slug TEXT;
ALTER TABLE template_relationship_variants ADD COLUMN relationship_label TEXT;
ALTER TABLE template_relationship_variants ADD COLUMN description TEXT DEFAULT '';
ALTER TABLE template_relationship_variants ADD COLUMN thumbnail TEXT DEFAULT '';
ALTER TABLE template_relationship_variants ADD COLUMN entry_file TEXT DEFAULT 'index.html';
ALTER TABLE template_relationship_variants ADD COLUMN fields_json TEXT DEFAULT '[]';
ALTER TABLE template_relationship_variants ADD COLUMN sections_json TEXT DEFAULT '[]';
ALTER TABLE template_relationship_variants ADD COLUMN assets_json TEXT DEFAULT '{}';
ALTER TABLE template_relationship_variants ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE template_relationship_variants ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 1;
ALTER TABLE template_relationship_variants ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;

-- 3. ADDITIVE COLUMNS ON TEMPLATES & TEMPLATE_VERSIONS
ALTER TABLE templates ADD COLUMN variants_json TEXT DEFAULT '[]';
ALTER TABLE templates ADD COLUMN has_variants INTEGER NOT NULL DEFAULT 0;
ALTER TABLE template_versions ADD COLUMN variants_json TEXT DEFAULT '[]';

-- 4. BACKFILL RELATIONSHIP_SLUG AND RELATIONSHIP_LABEL ON EXISTING VARIANTS
UPDATE template_relationship_variants
SET relationship_slug = (
  SELECT r.slug FROM relationships r WHERE r.id = template_relationship_variants.relationship_id
)
WHERE relationship_slug IS NULL OR relationship_slug = '';

UPDATE template_relationship_variants
SET relationship_label = (
  SELECT r.name FROM relationships r WHERE r.id = template_relationship_variants.relationship_id
)
WHERE relationship_label IS NULL OR relationship_label = '';

-- 5. PERFORMANCE INDEXES FOR GALLERY & VARIANT RESOLUTION
CREATE INDEX IF NOT EXISTS idx_trv_family_status ON template_relationship_variants(template_family_id, status, enabled, is_latest);
CREATE INDEX IF NOT EXISTS idx_trv_rel_slug ON template_relationship_variants(relationship_slug);
CREATE INDEX IF NOT EXISTS idx_trv_variant_slug ON template_relationship_variants(variant_slug);

-- 6. RECORD MIGRATION IN _MIGRATIONS REGISTRY
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0036', '0036_part48_utp_v1_1_variant_system.sql', '2026-10-17T00:00:00.000Z');


-- ============================================================================
-- WishMagic Cloudflare D1 Architecture Migration (Part 49)
-- Migration: 0037_part49_utp_v1_2_sections_actions_visibility.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description:
--   UTP v1.2.0 Extension + Admin Section/Subsection Visibility +
--   Button Action/Link Configuration + Draft/Published Snapshot Persistence:
--   1. Additive columns on templates and template_versions for:
--      - actions_json (manifest-declared action definitions)
--      - visibility_config_json (published template-wide section/subsection visibility)
--      - actions_config_json (published template-wide button label/action/destination overrides)
--      - draft_config_json (admin draft edits prior to publication)
--      - lock_version (optimistic concurrency control counter for admin edits)
--   2. Additive columns on template_relationship_variants for:
--      - actions_json (relationship-specific button/action overrides)
--      - visibility_json (relationship-specific section/subsection visibility overrides)
--      - draft_configuration_json (per-variant admin draft state)
--   3. Additive column on wishes for:
--      - published_config_snapshot_json (immutable published section/subsection/action
--        snapshot at wish creation/publication time so existing wish links remain
--        unaffected by subsequent template configuration updates).
-- ============================================================================

-- 1. ADDITIVE COLUMNS ON TEMPLATES
ALTER TABLE templates ADD COLUMN actions_json TEXT DEFAULT '[]';
ALTER TABLE templates ADD COLUMN visibility_config_json TEXT DEFAULT '{}';
ALTER TABLE templates ADD COLUMN actions_config_json TEXT DEFAULT '{}';
ALTER TABLE templates ADD COLUMN draft_config_json TEXT DEFAULT '{}';
ALTER TABLE templates ADD COLUMN lock_version INTEGER NOT NULL DEFAULT 1;

-- 2. ADDITIVE COLUMNS ON TEMPLATE_VERSIONS
ALTER TABLE template_versions ADD COLUMN actions_json TEXT DEFAULT '[]';
ALTER TABLE template_versions ADD COLUMN visibility_config_json TEXT DEFAULT '{}';
ALTER TABLE template_versions ADD COLUMN actions_config_json TEXT DEFAULT '{}';
ALTER TABLE template_versions ADD COLUMN draft_config_json TEXT DEFAULT '{}';

-- 3. ADDITIVE COLUMNS ON TEMPLATE_RELATIONSHIP_VARIANTS
ALTER TABLE template_relationship_variants ADD COLUMN actions_json TEXT DEFAULT '[]';
ALTER TABLE template_relationship_variants ADD COLUMN visibility_json TEXT DEFAULT '{}';
ALTER TABLE template_relationship_variants ADD COLUMN draft_configuration_json TEXT DEFAULT '{}';

-- 4. ADDITIVE COLUMN ON WISHES FOR IMMUTABLE PUBLISHED CONFIGURATION SNAPSHOTS
ALTER TABLE wishes ADD COLUMN published_config_snapshot_json TEXT DEFAULT '{}';

-- 5. PERFORMANCE INDEXES FOR VERSIONED CONFIGURATION & WISH SNAPSHOT RESOLUTION
CREATE INDEX IF NOT EXISTS idx_templates_slug_lock ON templates(slug, lock_version);
CREATE INDEX IF NOT EXISTS idx_tv_template_published ON template_versions(template_id, status, is_current);

-- 6. RECORD MIGRATION IN _MIGRATIONS REGISTRY
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0037', '0037_part49_utp_v1_2_sections_actions_visibility.sql', '2026-10-17T00:00:00.000Z');


-- ============================================================================
-- WishMagic Cloudflare D1 Architecture Migration (Part 50)
-- Migration: 0038_part50_smart_template_recognition_and_update_studio.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description:
--   Smart Template Recognition, Side-by-Side Preview & Safe Update Studio:
--   1. Creates template_import_sessions table to stage uploaded ZIP packages,
--      persist automatic template recognition outcomes & candidate evidence,
--      store isolated preview bundles, file & manifest comparison reports,
--      and track explicit admin decisions (update_existing, create_new, cancel)
--      without mutating live published templates during inspection/preview.
--   2. Adds additive lineage and change-summary columns to template_versions
--      and templates (base_version_id, change_summary_json, import_session_id,
--      rollback_from_version_id, rollback_version_id).
-- ============================================================================

-- 1. CREATE TEMPLATE_IMPORT_SESSIONS TABLE
CREATE TABLE IF NOT EXISTS template_import_sessions (
  id TEXT PRIMARY KEY,
  operation_id TEXT,
  idempotency_key TEXT,
  admin_id TEXT NOT NULL DEFAULT 'admin',
  admin_email TEXT DEFAULT '',
  state TEXT NOT NULL DEFAULT 'UPLOADED',
  intended_target_template_id TEXT,
  selected_target_template_id TEXT,
  decision_mode TEXT NOT NULL DEFAULT 'undecided',
  recognition_outcome TEXT NOT NULL DEFAULT 'NO_EXISTING_MATCH',
  recognition_summary TEXT DEFAULT '',
  recognition_report_json TEXT DEFAULT '{}',
  package_metadata_json TEXT DEFAULT '{}',
  package_fingerprint TEXT,
  source_zip_sha256 TEXT,
  runtime_hash TEXT,
  schema_hash TEXT,
  manifest_json TEXT DEFAULT '{}',
  files_inventory_json TEXT DEFAULT '[]',
  staged_files_bundle_json TEXT DEFAULT '{}',
  validation_report_json TEXT DEFAULT '{}',
  comparison_report_json TEXT DEFAULT '{}',
  admin_config_overrides_json TEXT DEFAULT '{}',
  base_template_lock_version INTEGER DEFAULT 1,
  base_published_version_id TEXT,
  published_template_id TEXT,
  published_version_id TEXT,
  published_version_label TEXT,
  preview_token TEXT,
  warnings_acknowledged INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  cancelled_at TEXT
);

-- 2. ADDITIVE COLUMNS ON TEMPLATES & TEMPLATE_VERSIONS FOR LINEAGE, DIFF SUMMARY & ROLLBACK
ALTER TABLE templates ADD COLUMN rollback_version_id TEXT DEFAULT NULL;
ALTER TABLE template_versions ADD COLUMN base_version_id TEXT DEFAULT NULL;
ALTER TABLE template_versions ADD COLUMN change_summary_json TEXT DEFAULT '{}';
ALTER TABLE template_versions ADD COLUMN import_session_id TEXT DEFAULT NULL;
ALTER TABLE template_versions ADD COLUMN rollback_from_version_id TEXT DEFAULT NULL;
ALTER TABLE template_versions ADD COLUMN updated_at TEXT DEFAULT NULL;

-- 3. INDEXES FOR FAST RECOGNITION, SESSION LOOKUP & CONCURRENCY CHECKS
CREATE INDEX IF NOT EXISTS idx_tis_state ON template_import_sessions(state, updated_at);
CREATE INDEX IF NOT EXISTS idx_tis_target_tpl ON template_import_sessions(selected_target_template_id, state);
CREATE INDEX IF NOT EXISTS idx_tis_fingerprint ON template_import_sessions(package_fingerprint);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tis_idempotency ON template_import_sessions(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tv_base_version ON template_versions(template_id, base_version_id);

-- 4. RECORD MIGRATION IN _MIGRATIONS REGISTRY
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0038', '0038_part50_smart_template_recognition_and_update_studio.sql', '2026-10-17T00:00:00.000Z');


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
