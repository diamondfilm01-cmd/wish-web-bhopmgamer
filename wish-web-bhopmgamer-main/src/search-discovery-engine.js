/**
 * WishMagic Production Global Search & Template Discovery Engine (Part 39)
 * ==============================================================================
 * Fast, multi-attribute, relationship-aware, category/feature-filtered discovery,
 * multi-entity search (Templates, Music, Help Articles), safe keyword highlighting,
 * ranking algorithms, suggestions, synonyms, and search analytics telemetry.
 *
 * Compatible with Node.js Express dev runtime and Cloudflare Workers (D1).
 */

import crypto from 'node:crypto';

// ============================================================================
// 1. CONSTANTS, ENUMS & DICTIONARIES
// ============================================================================

export const SEARCH_ENTITY_TYPES = Object.freeze({
  ALL: 'all',
  TEMPLATE: 'template',
  MUSIC: 'music',
  ARTICLE: 'article'
});

export const SORT_OPTIONS = Object.freeze({
  TRENDING: 'trending',
  NEWEST: 'newest',
  RATING: 'rating',
  FREE: 'free',
  PRICE_ASC: 'price_asc',
  PRICE_DESC: 'price_desc',
  NAME_ASC: 'name_asc',
  RELEVANCE: 'relevance'
});

export const TIER_FILTERS = Object.freeze({
  ALL: 'all',
  FREE: 'free',
  VIP: 'vip'
});

export const SUPPORTED_FEATURES = Object.freeze([
  '3d',
  'audio',
  'polaroid',
  'wax_seal',
  'countdown',
  'timeline',
  'voice_note',
  'secret_letter',
  'open_when',
  'confetti'
]);

export const FEATURE_METADATA = Object.freeze({
  '3d': { id: '3d', label: '3D Interactive', icon: 'view_in_ar', description: 'Real-time 3D animations and interactive canvas scenes' },
  'audio': { id: 'audio', label: 'Audio & BGM', icon: 'music_note', description: 'Curated binaural soundscapes, background melodies and audio reactions' },
  'polaroid': { id: 'polaroid', label: 'Photo Reel (Polaroid)', icon: 'photo_camera', description: 'Interactive floating memories reel and photo uploads' },
  'wax_seal': { id: 'wax_seal', label: 'Wax Seal & Confetti', icon: 'celebration', description: 'Realistic physical envelope unboxing with wax seal stamp' },
  'countdown': { id: 'countdown', label: 'Midnight Countdown', icon: 'schedule', description: 'Anticipation countdown clock for scheduled celebration unlocks' },
  'timeline': { id: 'timeline', label: 'Milestone Timeline', icon: 'timeline', description: 'Year-by-year relationship or friendship milestones' },
  'voice_note': { id: 'voice_note', label: 'Voice Note Audio', icon: 'mic', description: 'Personal spoken voice recording playback' },
  'secret_letter': { id: 'secret_letter', label: 'Secret Envelope', icon: 'mail_lock', description: 'Hidden reveal message or scratch-card surprise' },
  'open_when': { id: 'open_when', label: 'Open When Cards', icon: 'mark_email_unread', description: 'Timed or conditional notes to unwrap after celebration' },
  'confetti': { id: 'confetti', label: 'Confetti & Sparks', icon: 'auto_awesome', description: 'Interactive physics-driven particle explosions' }
});

export const DEFAULT_SYNONYMS = Object.freeze({
  'bday': ['birthday', 'celebration'],
  'janamdin': ['birthday', 'celebration'],
  'salgirah': ['anniversary', 'birthday'],
  'anniv': ['anniversary'],
  'shadi': ['anniversary', 'wedding'],
  'gf': ['girlfriend', 'romantic', 'love'],
  'bf': ['boyfriend', 'romantic', 'love'],
  'binaural': ['audio', 'music'],
  'bgm': ['music', 'audio', 'song'],
  'song': ['music', 'audio', 'track'],
  'track': ['music', 'audio', 'song'],
  'audio': ['music', 'audio'],
  'tune': ['music', 'audio'],
  'melody': ['music', 'audio'],
  'dost': ['friend', 'friendship', 'best friend'],
  'yaar': ['friend', 'friendship', 'best friend'],
  'dosti': ['friendship', 'friend'],
  'pyaar': ['love', 'romantic'],
  'ishq': ['love', 'romantic'],
  'mohabbat': ['love', 'romantic'],
  'mom': ['mother', 'family', 'parents'],
  'dad': ['father', 'family', 'parents'],
  'maa': ['mother', 'family'],
  'papa': ['father', 'family'],
  'bhai': ['brother', 'family'],
  'bro': ['brother', 'family', 'best friend'],
  'behen': ['sister', 'family'],
  'sis': ['sister', 'family', 'best friend'],
  'polaroids': ['polaroid', 'photos', 'gallery'],
  'photos': ['polaroid', 'gallery'],
  'pictures': ['polaroid', 'gallery'],
  'images': ['polaroid', 'gallery'],
  'pass': ['vip', 'premium'],
  'freebie': ['free'],
  'help': ['faq', 'support', 'articles'],
  'faq': ['help', 'support', 'articles'],
  'ticket': ['support', 'help'],
  'refund': ['billing', 'payments', 'orders'],
  'upi': ['billing', 'payments', 'checkout'],
  'payment': ['billing', 'orders', 'payments'],
  'clock': ['countdown'],
  'timer': ['countdown']
});

// ============================================================================
// 2. QUERY NORMALIZATION, TOKENIZATION & SYNONYMS
// ============================================================================

/**
 * Normalizes query string for uniform matching and logging.
 * Strips dangerous characters while preserving useful word boundaries.
 */
export function normalizeQuery(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') return '';
  return rawQuery
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\-\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits query into clean word tokens of length >= 2.
 */
export function tokenizeQuery(query) {
  const norm = normalizeQuery(query);
  if (!norm) return [];
  return norm
    .split(/\s+/)
    .map(t => t.trim().replace(/^#/, ''))
    .filter(t => t.length >= 1);
}

/**
 * Expands a list of tokens with configured synonyms.
 */
export function expandQueryTokens(tokens, customSynonyms = {}) {
  const synonyms = { ...DEFAULT_SYNONYMS, ...(customSynonyms || {}) };
  const expanded = new Set(tokens);

  for (const token of tokens) {
    const termLower = token.toLowerCase();
    if (synonyms[termLower]) {
      const syns = Array.isArray(synonyms[termLower]) ? synonyms[termLower] : [synonyms[termLower]];
      syns.forEach(s => expanded.add(s.toLowerCase()));
    }
  }

  return Array.from(expanded);
}

// ============================================================================
// 3. CAPABILITY & FEATURE DETECTION FOR TEMPLATES
// ============================================================================

/**
 * Inspects a template object and derives its searchable feature tags.
 */
export function extractTemplateFeatures(template) {
  if (!template) return [];
  const features = new Set();
  const caps = template.capabilities || {};
  const tId = String(template.id || '').toLowerCase();
  const name = String(template.name || '').toLowerCase();
  const desc = String(template.description || '').toLowerCase();
  const tags = Array.isArray(template.tags) ? template.tags.map(t => String(t).toLowerCase()) : [];
  const sections = Array.isArray(template.sections) ? template.sections.map(s => String(s).toLowerCase()) : [];

  // 3D Interactive
  if (caps.hero !== false || tId.includes('glitter') || tId.includes('3d') || name.includes('3d') || tags.includes('3d') || template.type?.includes('3d')) {
    features.add('3d');
  }

  // Audio / Music
  if (caps.music !== false || tags.includes('audio') || tags.includes('music') || name.includes('audio') || sections.some(s => s.includes('music') || s.includes('song'))) {
    features.add('audio');
  }

  // Polaroid / Photo reel
  if (caps.gallery !== false || caps.memories !== false || sections.some(s => s.includes('polaroid') || s.includes('photo') || s.includes('memory')) || desc.includes('polaroid') || desc.includes('photo')) {
    features.add('polaroid');
  }

  // Wax seal & Confetti
  if (caps.finalSurprise !== false || tId.includes('romantic') || sections.some(s => s.includes('confetti') || s.includes('wax') || s.includes('seal')) || desc.includes('wax') || desc.includes('confetti')) {
    features.add('wax_seal');
    features.add('confetti');
  }

  // Countdown
  if (Boolean(caps.countdown) || tId.includes('countdown') || name.includes('countdown') || desc.includes('countdown') || sections.some(s => s.includes('countdown'))) {
    features.add('countdown');
  }

  // Timeline
  if (Boolean(caps.timeline) || tId.includes('chronicles') || tId.includes('tribute') || name.includes('chronicles') || desc.includes('timeline') || sections.some(s => s.includes('timeline'))) {
    features.add('timeline');
  }

  // Voice note
  if (Boolean(caps.voiceNote) || template.supportsVoice || sections.some(s => s.includes('voice'))) {
    features.add('voice_note');
  }

  // Secret letter / Envelope drop
  if (Boolean(caps.secretMessage) || tId.includes('romantic') || tId.includes('scrapbook') || desc.includes('secret') || desc.includes('letter') || sections.some(s => s.includes('secret') || s.includes('letter'))) {
    features.add('secret_letter');
  }

  // Open when
  if (Boolean(caps.openWhen) || desc.includes('open when') || sections.some(s => s.includes('open when'))) {
    features.add('open_when');
  }

  return Array.from(features);
}

// ============================================================================
// 4. DOCUMENT SEARCH INDEXERS (TEMPLATES, MUSIC, ARTICLES)
// ============================================================================

/**
 * Transforms a raw template into a standardized searchable index document.
 */
export function createTemplateSearchDocument(template) {
  const isVip = template.tier === 'vip' || Boolean(template.isPremium) || (Number(template.price) > 0);
  const tier = isVip ? 'vip' : 'free';
  const price = isVip ? (Number(template.price) || 49) : 0;
  const isPub = template.status ? (template.status === 'published') : (template.isPublished !== false);
  const features = extractTemplateFeatures(template);
  const rels = Array.isArray(template.relationships) ? template.relationships : [];
  const tags = Array.isArray(template.tags) ? template.tags : [];

  // Popularity heuristic (base 100 + featured boost + rating weight)
  let popularity = 100.0;
  if (template.featured) popularity += 50.0;
  if (template.popularityScore) popularity += Number(template.popularityScore);
  const rating = Number(template.rating) || 4.9;

  // Search vector text contains all lowercased terms for rapid multi-attribute lookup
  const searchVectorParts = [
    template.id,
    template.slug || '',
    template.name || '',
    template.category || '',
    template.subcategory || '',
    tier,
    isVip ? 'premium vip paid' : 'free complimentary',
    template.description || '',
    rels.join(' '),
    tags.join(' '),
    features.join(' '),
    features.map(f => FEATURE_METADATA[f]?.label || '').join(' ')
  ];

  const searchVectorText = searchVectorParts
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return {
    id: `idx_tpl_${template.id}`,
    entity_type: SEARCH_ENTITY_TYPES.TEMPLATE,
    entity_id: template.id,
    title: template.name || 'Untitled Template',
    slug: template.slug || template.id,
    description: template.description || '',
    category: template.category || 'General',
    subcategory: template.subcategory || '',
    relationships_json: JSON.stringify(rels),
    features_json: JSON.stringify(features),
    tags_json: JSON.stringify(tags),
    tier,
    is_premium: isVip ? 1 : 0,
    price,
    popularity_score: popularity,
    rating,
    thumbnail: template.thumbnail || template.previewImages?.[0] || '/assets/default-template.jpg',
    search_vector_text: searchVectorText,
    is_published: isPub ? 1 : 0,
    metadata_json: JSON.stringify({
      previewImages: template.previewImages || [template.thumbnail],
      folder: template.folder || template.id,
      entryFile: template.entryFile || 'index.html',
      featured: Boolean(template.featured)
    }),
    raw_item: template
  };
}

/**
 * Transforms a raw music track into a standardized search document.
 */
export function createMusicSearchDocument(track) {
  const title = track.title || 'Untitled Track';
  const artist = track.artist || 'WishMagic Ensemble';
  const category = track.category || 'celebration';
  const suitability = Array.isArray(track.relationshipSuitability) ? track.relationshipSuitability : [];

  const searchVectorParts = [
    track.id,
    title,
    artist,
    category,
    suitability.join(' '),
    'music audio sound track song bgm melody'
  ];

  return {
    id: `idx_mus_${track.id}`,
    entity_type: SEARCH_ENTITY_TYPES.MUSIC,
    entity_id: track.id,
    title,
    slug: track.id,
    description: `Original background score by ${artist}. Suitable for ${category} celebrations.`,
    category,
    subcategory: 'Audio',
    relationships_json: JSON.stringify(suitability),
    features_json: JSON.stringify(['audio']),
    tags_json: JSON.stringify(['music', category, 'bgm']),
    tier: 'free',
    is_premium: 0,
    price: 0,
    popularity_score: track.isFeatured ? 120.0 : 80.0,
    rating: 4.9,
    thumbnail: '/assets/music-icon.png',
    search_vector_text: searchVectorParts.join(' ').toLowerCase(),
    is_published: track.status === 'inactive' ? 0 : 1,
    metadata_json: JSON.stringify({
      artist,
      playbackUrl: track.playbackUrl,
      duration: track.duration || 120,
      storageProvider: track.storageProvider || 'b2'
    }),
    raw_item: track
  };
}

/**
 * Transforms a help article into a standardized search document.
 */
export function createArticleSearchDocument(article) {
  const searchVectorParts = [
    article.id,
    article.slug || '',
    article.title || '',
    article.excerpt || '',
    article.categoryName || '',
    article.categoryId || '',
    article.contentMarkdown || '',
    'help center support faq article guide tutorial'
  ];

  return {
    id: `idx_art_${article.id}`,
    entity_type: SEARCH_ENTITY_TYPES.ARTICLE,
    entity_id: article.id,
    title: article.title || 'Help Article',
    slug: article.slug || article.id,
    description: article.excerpt || '',
    category: article.categoryName || 'Support',
    subcategory: article.categoryId || '',
    relationships_json: JSON.stringify([]),
    features_json: JSON.stringify([]),
    tags_json: JSON.stringify(['help', article.categoryId]),
    tier: 'free',
    is_premium: 0,
    price: 0,
    popularity_score: (100 - (article.sortOrder || 0)),
    rating: 5.0,
    thumbnail: article.icon || 'help_center',
    search_vector_text: searchVectorParts.join(' ').toLowerCase(),
    is_published: article.isPublished === 0 ? 0 : 1,
    metadata_json: JSON.stringify({
      categoryId: article.categoryId,
      categoryName: article.categoryName,
      icon: article.icon,
      sortOrder: article.sortOrder
    }),
    raw_item: article
  };
}

// ============================================================================
// 5. SCORING & MULTI-ATTRIBUTE RELEVANCE ENGINE
// ============================================================================

/**
 * Calculates a multi-attribute relevance score for a document against a normalized query.
 * Higher score = higher ranking.
 */
export function calculateRelevanceScore(doc, query, tokens, expandedTokens) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const title = (doc.title || '').toLowerCase();
  const desc = (doc.description || '').toLowerCase();
  const cat = (doc.category || '').toLowerCase();
  const vector = (doc.search_vector_text || '').toLowerCase();

  let relationships = [];
  try { relationships = JSON.parse(doc.relationships_json || '[]').map(r => String(r).toLowerCase()); } catch (e) {}

  let features = [];
  try { features = JSON.parse(doc.features_json || '[]').map(f => String(f).toLowerCase()); } catch (e) {}

  let tags = [];
  try { tags = JSON.parse(doc.tags_json || '[]').map(t => String(t).toLowerCase()); } catch (e) {}

  let score = 0;

  // 1. Exact Title Match
  if (title === q) {
    score += 120;
  } else if (title.startsWith(q)) {
    score += 80;
  } else if (title.includes(q)) {
    score += 50;
  }

  // 2. Exact Category or Relationship match
  if (cat === q) {
    score += 45;
  } else if (cat.includes(q)) {
    score += 25;
  }

  if (relationships.includes(q)) {
    score += 55;
  } else if (relationships.some(r => r.includes(q) || q.includes(r))) {
    score += 35;
  }

  // 3. Feature / capability match
  if (features.includes(q)) {
    score += 30;
  }

  // 4. Token matches
  let tokenMatches = 0;
  for (const t of tokens) {
    if (title.includes(t)) {
      score += 25;
      tokenMatches++;
    } else if (relationships.some(r => r.includes(t))) {
      score += 20;
      tokenMatches++;
    } else if (cat.includes(t)) {
      score += 15;
      tokenMatches++;
    } else if (features.includes(t)) {
      score += 15;
      tokenMatches++;
    } else if (tags.some(tag => tag.includes(t))) {
      score += 10;
      tokenMatches++;
    } else if (desc.includes(t)) {
      score += 8;
      tokenMatches++;
    } else if (vector.includes(t)) {
      score += 5;
      tokenMatches++;
    }
  }

  // 5. Expanded synonym matches (e.g. 'bday' matched 'birthday')
  for (const syn of expandedTokens) {
    if (!tokens.includes(syn) && vector.includes(syn)) {
      score += 12;
    }
  }

  // If none of the tokens or vector matched, score is 0
  if (score === 0 && !vector.includes(q)) {
    return 0;
  }

  // Popularity & rating fine-tuning (normalized to a small boost, e.g. 0-10)
  const popBoost = Math.min(10, (doc.popularity_score || 0) / 20);
  const ratingBoost = Math.min(5, (doc.rating || 0));
  score += popBoost + ratingBoost;

  return score;
}

// ============================================================================
// 6. SAFE KEYWORD HIGHLIGHTING (XSS PROTECTED)
// ============================================================================

/**
 * Escapes HTML characters to prevent XSS injection.
 */
export function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Safely wraps matched tokens in <mark> tags inside already-escaped HTML.
 * Guaranteed not to execute arbitrary scripts even if query contains malicious input!
 */
export function generateSafeHighlights(text, queryTokens) {
  if (!text || typeof text !== 'string') return '';
  const escaped = escapeHtml(text);
  if (!queryTokens || queryTokens.length === 0) return escaped;

  // Filter valid tokens
  const cleanTokens = queryTokens
    .map(t => escapeHtml(t.trim().toLowerCase()))
    .filter(t => t.length >= 2);

  if (cleanTokens.length === 0) return escaped;

  // Build regex safely escaping regex special characters
  const pattern = cleanTokens
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  const regex = new RegExp(`(${pattern})`, 'gi');
  return escaped.replace(regex, '<mark class="bg-amber-200/90 dark:bg-amber-500/30 text-purple-950 dark:text-amber-200 px-0.5 rounded font-semibold">$1</mark>');
}

// ============================================================================
// 7. TEMPLATE FILTERING & SORTING PIPELINE
// ============================================================================

/**
 * Performs server-side multi-attribute filtering, relationship-awareness,
 * feature checks, and sorting on an array of templates.
 */
export function filterAndSortTemplates(templates, {
  query = '',
  category = 'all',
  relationship = 'all',
  tier = 'all',
  features = [],
  sort = SORT_OPTIONS.TRENDING,
  page = 1,
  limit = 20,
  customSynonyms = {}
} = {}) {
  const normQuery = normalizeQuery(query);
  const tokens = tokenizeQuery(normQuery);
  const expandedTokens = expandQueryTokens(tokens, customSynonyms);

  const cleanCategory = (category || 'all').toLowerCase().trim();
  const cleanRelationship = (relationship || 'all').toLowerCase().trim();
  const cleanTier = (tier || 'all').toLowerCase().trim();
  const reqFeatures = Array.isArray(features)
    ? features.map(f => f.toLowerCase().trim()).filter(Boolean)
    : (typeof features === 'string' && features ? features.split(',').map(f => f.toLowerCase().trim()) : []);

  // 1. Filter only published templates
  let list = templates.filter(t => t.isPublished !== false && t.status !== 'draft');

  // Convert to search docs for uniform processing
  let docs = list.map(t => {
    const doc = createTemplateSearchDocument(t);
    doc.relevanceScore = normQuery ? calculateRelevanceScore(doc, normQuery, tokens, expandedTokens) : (doc.popularity_score || 100);
    return doc;
  });

  // 2. Query filter: if a query was provided, only keep items with relevance > 0
  if (normQuery) {
    docs = docs.filter(d => d.relevanceScore > 0);
  }

  // 3. Category filter
  if (cleanCategory && cleanCategory !== 'all') {
    docs = docs.filter(d => {
      const docCat = (d.category || '').toLowerCase();
      const docSub = (d.subcategory || '').toLowerCase();
      let rels = [];
      try { rels = JSON.parse(d.relationships_json || '[]').map(r => String(r).toLowerCase()); } catch (e) {}
      return docCat === cleanCategory || docSub === cleanCategory || rels.includes(cleanCategory);
    });
  }

  // 4. Relationship filter (relationship-aware discovery)
  if (cleanRelationship && cleanRelationship !== 'all') {
    docs = docs.filter(d => {
      let rels = [];
      try { rels = JSON.parse(d.relationships_json || '[]').map(r => String(r).toLowerCase()); } catch (e) {}
      const cat = (d.category || '').toLowerCase();
      return rels.some(r => r.includes(cleanRelationship) || cleanRelationship.includes(r)) || cat.includes(cleanRelationship);
    });
  }

  // 5. Tier / Price filter (Free vs VIP)
  if (cleanTier && cleanTier !== 'all') {
    if (cleanTier === 'free') {
      docs = docs.filter(d => d.tier === 'free' && !d.is_premium);
    } else if (cleanTier === 'vip') {
      docs = docs.filter(d => d.tier === 'vip' || d.is_premium === 1);
    }
  }

  // 6. Template capability / features filter
  if (reqFeatures.length > 0) {
    docs = docs.filter(d => {
      let docFeatures = [];
      try { docFeatures = JSON.parse(d.features_json || '[]'); } catch (e) {}
      return reqFeatures.every(rf => docFeatures.includes(rf));
    });
  }

  // 7. Calculate dynamic facets on the filtered set (before pagination)
  const facets = computeFacets(docs);

  // 8. Sorting
  docs.sort((a, b) => {
    switch (sort) {
      case SORT_OPTIONS.NEWEST: {
        const dateA = a.raw_item?.createdAt || a.raw_item?.created_at || 0;
        const dateB = b.raw_item?.createdAt || b.raw_item?.created_at || 0;
        return new Date(dateB) - new Date(dateA);
      }
      case SORT_OPTIONS.RATING:
        return (b.rating || 0) - (a.rating || 0);
      case SORT_OPTIONS.FREE:
        if (a.tier === 'free' && b.tier !== 'free') return -1;
        if (b.tier === 'free' && a.tier !== 'free') return 1;
        return (b.popularity_score || 0) - (a.popularity_score || 0);
      case SORT_OPTIONS.PRICE_ASC:
        return (a.price || 0) - (b.price || 0);
      case SORT_OPTIONS.PRICE_DESC:
        return (b.price || 0) - (a.price || 0);
      case SORT_OPTIONS.NAME_ASC:
        return (a.title || '').localeCompare(b.title || '');
      case SORT_OPTIONS.RELEVANCE:
        if (normQuery) {
          return (b.relevanceScore || 0) - (a.relevanceScore || 0);
        }
        return (b.popularity_score || 0) - (a.popularity_score || 0);
      case SORT_OPTIONS.TRENDING:
      default:
        if (normQuery) {
          return (b.relevanceScore || 0) - (a.relevanceScore || 0);
        }
        return (b.popularity_score || 0) - (a.popularity_score || 0);
    }
  });

  const total = docs.length;
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const offset = (p - 1) * l;
  const paginatedDocs = docs.slice(offset, offset + l);

  // Map to client response items with highlighted texts
  const items = paginatedDocs.map(d => {
    const raw = d.raw_item;
    let rels = [];
    try { rels = JSON.parse(d.relationships_json || '[]'); } catch (e) {}
    let feats = [];
    try { feats = JSON.parse(d.features_json || '[]'); } catch (e) {}

    return {
      ...raw,
      id: d.entity_id,
      name: d.title,
      slug: d.slug,
      description: d.description,
      category: d.category,
      tier: d.tier,
      isPremium: Boolean(d.is_premium),
      price: d.price,
      rating: d.rating,
      popularityScore: d.popularity_score,
      thumbnail: d.thumbnail,
      relationships: rels,
      features: feats,
      relevanceScore: d.relevanceScore,
      // Highlights for UI
      highlightedTitle: normQuery ? generateSafeHighlights(d.title, tokens) : escapeHtml(d.title),
      highlightedDescription: normQuery ? generateSafeHighlights(d.description, tokens) : escapeHtml(d.description)
    };
  });

  return {
    total,
    page: p,
    limit: l,
    totalPages: Math.ceil(total / l),
    hasMore: offset + items.length < total,
    items,
    facets
  };
}

/**
 * Computes dynamic facets (counts of categories, relationships, tiers, and features).
 */
export function computeFacets(docs) {
  const categories = {};
  const relationships = {};
  const tiers = { free: 0, vip: 0 };
  const features = {};

  for (const d of docs) {
    // Categories
    const cat = d.category || 'General';
    categories[cat] = (categories[cat] || 0) + 1;

    // Tiers
    if (d.tier === 'vip') tiers.vip++;
    else tiers.free++;

    // Relationships
    try {
      const rels = JSON.parse(d.relationships_json || '[]');
      rels.forEach(r => {
        relationships[r] = (relationships[r] || 0) + 1;
      });
    } catch (e) {}

    // Features
    try {
      const feats = JSON.parse(d.features_json || '[]');
      feats.forEach(f => {
        features[f] = (features[f] || 0) + 1;
      });
    } catch (e) {}
  }

  return {
    categories,
    relationships,
    tiers,
    features
  };
}

// ============================================================================
// 8. UNIFIED GLOBAL SEARCH (TEMPLATES + MUSIC + HELP ARTICLES)
// ============================================================================

/**
 * Searches across templates, music library, and help articles.
 */
export function executeGlobalSearch({
  query = '',
  type = SEARCH_ENTITY_TYPES.ALL,
  category = 'all',
  relationship = 'all',
  tier = 'all',
  features = [],
  sort = SORT_OPTIONS.TRENDING,
  page = 1,
  limit = 20,
  templates = [],
  musicLibrary = [],
  helpArticles = [],
  customSynonyms = {}
} = {}) {
  const normQuery = normalizeQuery(query);
  const tokens = tokenizeQuery(normQuery);
  const expandedTokens = expandQueryTokens(tokens, customSynonyms);

  const cleanType = (type || SEARCH_ENTITY_TYPES.ALL).toLowerCase().trim();

  // 1. Templates Discovery
  let templatesResult = { total: 0, items: [], facets: {} };
  if (cleanType === SEARCH_ENTITY_TYPES.ALL || cleanType === SEARCH_ENTITY_TYPES.TEMPLATE) {
    templatesResult = filterAndSortTemplates(templates, {
      query: normQuery,
      category,
      relationship,
      tier,
      features,
      sort,
      page,
      limit,
      customSynonyms
    });
  }

  // 2. Music Search
  let musicResult = { total: 0, items: [] };
  if (cleanType === SEARCH_ENTITY_TYPES.ALL || cleanType === SEARCH_ENTITY_TYPES.MUSIC) {
    let musicDocs = musicLibrary.map(m => {
      const doc = createMusicSearchDocument(m);
      doc.relevanceScore = normQuery ? calculateRelevanceScore(doc, normQuery, tokens, expandedTokens) : (doc.popularity_score || 80);
      return doc;
    });

    if (normQuery) {
      musicDocs = musicDocs.filter(d => d.relevanceScore > 0);
    }

    if (category && category !== 'all') {
      const catLower = category.toLowerCase().trim();
      musicDocs = musicDocs.filter(d => (d.category || '').toLowerCase() === catLower);
    }

    if (relationship && relationship !== 'all') {
      const relLower = relationship.toLowerCase().trim();
      musicDocs = musicDocs.filter(d => {
        let rels = [];
        try { rels = JSON.parse(d.relationships_json || '[]'); } catch (e) {}
        return rels.length === 0 || rels.includes(relLower);
      });
    }

    musicDocs.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    musicResult = {
      total: musicDocs.length,
      items: musicDocs.slice(0, 10).map(d => ({
        id: d.entity_id,
        title: d.title,
        artist: JSON.parse(d.metadata_json || '{}').artist || '',
        category: d.category,
        playbackUrl: JSON.parse(d.metadata_json || '{}').playbackUrl,
        highlightedTitle: normQuery ? generateSafeHighlights(d.title, tokens) : escapeHtml(d.title)
      }))
    };
  }

  // 3. Help Articles Search
  let helpResult = { total: 0, items: [] };
  if (cleanType === SEARCH_ENTITY_TYPES.ALL || cleanType === SEARCH_ENTITY_TYPES.ARTICLE) {
    let artDocs = helpArticles.map(a => {
      const doc = createArticleSearchDocument(a);
      doc.relevanceScore = normQuery ? calculateRelevanceScore(doc, normQuery, tokens, expandedTokens) : (doc.popularity_score || 80);
      return doc;
    });

    if (normQuery) {
      artDocs = artDocs.filter(d => d.relevanceScore > 0);
    }

    artDocs.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    helpResult = {
      total: artDocs.length,
      items: artDocs.slice(0, 5).map(d => ({
        id: d.entity_id,
        slug: d.slug,
        title: d.title,
        excerpt: d.description,
        category: d.category,
        highlightedTitle: normQuery ? generateSafeHighlights(d.title, tokens) : escapeHtml(d.title),
        highlightedExcerpt: normQuery ? generateSafeHighlights(d.description, tokens) : escapeHtml(d.description)
      }))
    };
  }

  const grandTotal = templatesResult.total + musicResult.total + helpResult.total;

  // 4. Alternative Suggestions when 0 or few results found
  let alternativeTemplates = [];
  if (templatesResult.total === 0 && templates.length > 0) {
    alternativeTemplates = findAlternativeSuggestions(normQuery, templates, { limit: 4 });
  }

  return {
    success: true,
    query: normQuery,
    type: cleanType,
    total: grandTotal,
    hasResults: grandTotal > 0,
    templates: templatesResult,
    music: musicResult,
    help: helpResult,
    alternatives: alternativeTemplates
  };
}

// ============================================================================
// 9. SEARCH SUGGESTIONS & AUTO-COMPLETE
// ============================================================================

/**
 * Fast, debounced auto-complete generator. Returns structured suggestions:
 * matching categories, matching relationships, matching templates, matching music.
 */
export function generateSearchSuggestions({
  query = '',
  templates = [],
  musicLibrary = [],
  helpArticles = [],
  recentQueries = [],
  limit = 8
} = {}) {
  const norm = normalizeQuery(query);
  if (!norm || norm.length < 1) {
    // Return recent searches if query is empty
    return {
      query: '',
      suggestions: recentQueries.slice(0, 5).map(q => ({
        type: 'recent',
        text: q,
        icon: 'history'
      }))
    };
  }

  const tokens = tokenizeQuery(norm);
  const suggestions = [];

  // 1. Category suggestions
  const allCategories = new Set();
  templates.forEach(t => { if (t.category) allCategories.add(t.category); });
  for (const cat of allCategories) {
    if (cat.toLowerCase().includes(norm) || norm.includes(cat.toLowerCase())) {
      suggestions.push({
        type: 'category',
        text: cat,
        label: `Category: ${cat}`,
        value: cat,
        icon: 'stars'
      });
    }
  }

  // 2. Relationship suggestions
  const allRels = new Set();
  templates.forEach(t => {
    if (Array.isArray(t.relationships)) {
      t.relationships.forEach(r => allRels.add(r));
    }
  });
  for (const rel of allRels) {
    if (rel.toLowerCase().includes(norm) || norm.includes(rel.toLowerCase())) {
      suggestions.push({
        type: 'relationship',
        text: rel,
        label: `Relationship: ${rel}`,
        value: rel,
        icon: 'favorite'
      });
    }
  }

  // 3. Template matching suggestions
  const matchingTemplates = templates
    .filter(t => t.isPublished !== false && t.status !== 'draft')
    .filter(t => {
      const name = (t.name || '').toLowerCase();
      const desc = (t.description || '').toLowerCase();
      return name.includes(norm) || desc.includes(norm);
    })
    .slice(0, 4);

  matchingTemplates.forEach(t => {
    suggestions.push({
      type: 'template',
      id: t.id,
      text: t.name,
      label: t.name,
      category: t.category,
      tier: t.tier || (t.isPremium ? 'vip' : 'free'),
      price: t.price || (t.tier === 'vip' ? 49 : 0),
      thumbnail: t.thumbnail || '/assets/default-template.jpg',
      icon: 'auto_awesome'
    });
  });

  // 4. Music matching suggestions
  const matchingMusic = musicLibrary
    .filter(m => (m.title || '').toLowerCase().includes(norm) || (m.artist || '').toLowerCase().includes(norm))
    .slice(0, 2);

  matchingMusic.forEach(m => {
    suggestions.push({
      type: 'music',
      id: m.id,
      text: m.title,
      label: `${m.title} (${m.artist || 'Audio'})`,
      playbackUrl: m.playbackUrl,
      icon: 'music_note'
    });
  });

  return {
    query: norm,
    suggestions: suggestions.slice(0, limit)
  };
}

// ============================================================================
// 10. RELATED & ALTERNATIVE TEMPLATE DISCOVERY
// ============================================================================

/**
 * Recommends related templates based on matching categories, overlapping relationships,
 * and shared features.
 */
export function findRelatedTemplates(targetTemplate, allTemplates, { limit = 4 } = {}) {
  if (!targetTemplate) return [];
  const targetId = targetTemplate.id;
  const targetCat = (targetTemplate.category || '').toLowerCase();
  const targetRels = new Set((targetTemplate.relationships || []).map(r => String(r).toLowerCase()));
  const targetFeatures = new Set(extractTemplateFeatures(targetTemplate));

  const candidates = allTemplates
    .filter(t => t.id !== targetId && t.isPublished !== false && t.status !== 'draft')
    .map(t => {
      let affinityScore = 0;
      const cat = (t.category || '').toLowerCase();
      if (cat === targetCat) affinityScore += 40;

      const rels = (t.relationships || []).map(r => String(r).toLowerCase());
      rels.forEach(r => {
        if (targetRels.has(r)) affinityScore += 20;
      });

      const feats = extractTemplateFeatures(t);
      feats.forEach(f => {
        if (targetFeatures.has(f)) affinityScore += 10;
      });

      // Bonus for popularity
      affinityScore += Math.min(10, (t.popularityScore || 100) / 20);

      return { template: t, affinityScore };
    });

  candidates.sort((a, b) => b.affinityScore - a.affinityScore);
  return candidates.slice(0, limit).map(c => c.template);
}

/**
 * Recommends alternative popular templates when a user query returns 0 results.
 */
export function findAlternativeSuggestions(query, allTemplates, { limit = 4 } = {}) {
  const norm = normalizeQuery(query);
  const published = allTemplates.filter(t => t.isPublished !== false && t.status !== 'draft');

  // Check if query had a partial category or relationship match
  const partialMatches = published.filter(t => {
    const cat = (t.category || '').toLowerCase();
    const rels = (t.relationships || []).map(r => String(r).toLowerCase()).join(' ');
    return cat.includes(norm) || norm.includes(cat) || rels.includes(norm);
  });

  if (partialMatches.length > 0) {
    return partialMatches.slice(0, limit);
  }

  // Fallback to top trending templates
  return [...published]
    .sort((a, b) => (b.popularityScore || 100) - (a.popularityScore || 100))
    .slice(0, limit);
}

// ============================================================================
// 11. SEARCH ANALYTICS TELEMETRY & DIAGNOSTICS
// ============================================================================

/**
 * Hashes client IP for GDPR-safe analytics.
 */
export function hashClientIp(ip) {
  if (!ip || typeof ip !== 'string') return '0000000000000000';
  try {
    if (crypto && typeof crypto.createHash === 'function') {
      return crypto.createHash('sha256').update(ip + 'wm_search_salt').digest('hex').substring(0, 16);
    }
  } catch (_) {}
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  const str = ip + 'wm_search_salt';
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return (hex1 + hex2).substring(0, 16);
}

/**
 * Constructs an immutable search analytics record.
 */
export function createSearchAnalyticsRecord({
  query = '',
  searchType = 'all',
  filters = {},
  resultCount = 0,
  selectedEntityId = null,
  selectedEntityType = null,
  userId = null,
  sessionId = null,
  ip = '',
  userAgent = '',
  executionTimeMs = 0
} = {}) {
  const normQuery = normalizeQuery(query);
  return {
    id: `srch_log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    query: query || '',
    normalized_query: normQuery,
    search_type: searchType,
    filters_json: JSON.stringify(filters || {}),
    result_count: parseInt(resultCount, 10) || 0,
    has_results: (resultCount > 0) ? 1 : 0,
    selected_entity_id: selectedEntityId,
    selected_entity_type: selectedEntityType,
    user_id: userId,
    anonymous_session_id: sessionId,
    ip_hash: hashClientIp(ip),
    user_agent: (userAgent || '').substring(0, 200),
    execution_time_ms: Math.round(Number(executionTimeMs) * 100) / 100,
    created_at: new Date().toISOString()
  };
}

/**
 * Computes administrative diagnostic metrics from search analytics logs.
 */
export function computeSearchDiagnostics(analyticsList = [], days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const filtered = analyticsList.filter(log => log.created_at >= cutoff);

  const totalSearches = filtered.length;
  const zeroResultSearches = filtered.filter(l => l.result_count === 0);
  const zeroResultCount = zeroResultSearches.length;
  const withResultsCount = totalSearches - zeroResultCount;

  // Click-through rate: how many searches had a selected_entity_id
  const clickCount = filtered.filter(l => Boolean(l.selected_entity_id)).length;
  const clickThroughRate = totalSearches > 0 ? Math.round((clickCount / totalSearches) * 100) : 0;

  // Top Search Terms
  const termCounts = {};
  filtered.forEach(l => {
    if (l.normalized_query) {
      termCounts[l.normalized_query] = (termCounts[l.normalized_query] || 0) + 1;
    }
  });

  const topSearches = Object.entries(termCounts)
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Top Zero-Result Queries (critical for finding missing templates!)
  const zeroTermCounts = {};
  zeroResultSearches.forEach(l => {
    if (l.normalized_query) {
      zeroTermCounts[l.normalized_query] = (zeroTermCounts[l.normalized_query] || 0) + 1;
    }
  });

  const topZeroResultQueries = Object.entries(zeroTermCounts)
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Daily search volume
  const dailyVolume = {};
  filtered.forEach(l => {
    const day = (l.created_at || '').substring(0, 10);
    dailyVolume[day] = (dailyVolume[day] || 0) + 1;
  });

  return {
    timeframeDays: days,
    totalSearches,
    withResultsCount,
    zeroResultCount,
    zeroResultRate: totalSearches > 0 ? Math.round((zeroResultCount / totalSearches) * 100) : 0,
    clickThroughRate,
    topSearches,
    topZeroResultQueries,
    dailyVolume
  };
}
