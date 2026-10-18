-- Migration 0033: Part 8 Wish Lifecycle, Unique Slugs, and Performance Indexes
-- Authoritative unique constraint on wishes(slug) and performance indexes for lifecycle and expiry queries

CREATE UNIQUE INDEX IF NOT EXISTS idx_wishes_slug_unique ON wishes(slug);
CREATE INDEX IF NOT EXISTS idx_wishes_lifecycle_status ON wishes(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_wishes_expiry_date ON wishes(expiry_date);
