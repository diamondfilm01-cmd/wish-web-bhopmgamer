-- ============================================================================
-- WishMagic Cloudflare D1 Enterprise Architecture Migration (Part 39)
-- Migration: 0024_part39_global_search_and_discovery_analytics.sql
-- Database UUID: c08b683b-eb07-4639-ab33-fb1139bfb295
-- Description: Platform-Wide Search Indexing, Template Discovery,
-- Multi-Attribute Filtering, Search Analytics, Synonyms & Diagnostics.
-- ============================================================================

-- 1. Search Index Table (Multi-entity tokenized documents)
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

CREATE INDEX IF NOT EXISTS idx_search_index_entity ON search_index(entity_type, is_published);
CREATE INDEX IF NOT EXISTS idx_search_index_cat ON search_index(category);
CREATE INDEX IF NOT EXISTS idx_search_index_tier ON search_index(tier, is_premium);
CREATE INDEX IF NOT EXISTS idx_search_index_pop ON search_index(popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_search_index_entity_id ON search_index(entity_id);

-- 2. Search Analytics & Query Telemetry Table
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

CREATE INDEX IF NOT EXISTS idx_search_analytics_created ON search_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON search_analytics(normalized_query);
CREATE INDEX IF NOT EXISTS idx_search_analytics_no_results ON search_analytics(has_results, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_analytics_user ON search_analytics(user_id);

-- 3. Search Synonyms, Query Rewrites & Boost Keywords Table
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

CREATE INDEX IF NOT EXISTS idx_search_synonyms_keyword ON search_synonyms_keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_search_synonyms_active ON search_synonyms_keywords(is_active);

-- 4. User Recent Searches (Session / User history for suggestions)
CREATE TABLE IF NOT EXISTS search_recent_queries (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  session_id TEXT,
  query TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_recent_user ON search_recent_queries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_recent_session ON search_recent_queries(session_id, created_at DESC);
