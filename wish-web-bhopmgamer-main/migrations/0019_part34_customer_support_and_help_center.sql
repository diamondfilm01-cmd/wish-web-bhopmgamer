-- ============================================================================
-- WishMagic Cloudflare D1 Enterprise Architecture Migration (Part 34)
-- Migration: 0019_part34_customer_support_and_help_center.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
--
-- TARGET: Production Customer Support, Help Center, Ticket Desk & Admin Operations
-- PRESERVATION RULES:
--   1. NO DROP TABLE, NO TRUNCATE, NO DROP DATABASE
--   2. STRICT ADDITIVE SCHEMA ONLY
--   3. PRESERVE ALL PRODUCTION USER, WISH, TEMPLATE, ORDER, AND NOTIFICATION RECORDS
-- ============================================================================

-- 1. Ensure support_tickets table exists with full normalized schema
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  ticket_number TEXT UNIQUE NOT NULL,
  user_id TEXT,
  user_email TEXT,
  user_name TEXT,
  wish_id TEXT,
  order_id TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  admin_notes TEXT,
  assigned_to TEXT,
  diagnostic_data TEXT DEFAULT '{}',
  resolution_summary TEXT,
  last_customer_message_at TEXT,
  last_agent_response_at TEXT,
  resolved_at TEXT,
  closed_at TEXT,
  reopen_count INTEGER NOT NULL DEFAULT 0,
  satisfaction_rating INTEGER,
  satisfaction_feedback TEXT,
  contact_preference TEXT DEFAULT 'in_app',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Performance Indexes for Support Tickets
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_wish ON support_tickets(wish_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_order ON support_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status ON support_tickets(user_id, status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at);

-- 2. Support Ticket Messages Table (Conversation Thread)
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

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON support_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created ON support_ticket_messages(ticket_id, created_at);

-- 3. Support Attachments & Diagnostic Evidence Table
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

CREATE INDEX IF NOT EXISTS idx_support_attachments_ticket ON support_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_attachments_user ON support_attachments(user_id);

-- 4. Help Center Articles & Knowledge Base Table
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

CREATE INDEX IF NOT EXISTS idx_help_articles_category ON help_articles(category_id, is_published);
CREATE INDEX IF NOT EXISTS idx_help_articles_slug ON help_articles(slug);
CREATE INDEX IF NOT EXISTS idx_help_articles_sort ON help_articles(sort_order);

-- 5. Register Migration in _migrations table
INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES
('mig_0019', '0019_part34_customer_support_and_help_center.sql', '2026-10-09T03:00:00.000Z');
