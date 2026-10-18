/**
 * WishMagic Part 39: Production Global Search, Template Discovery,
 * Advanced Filtering, Sorting, Indexing & Search Analytics Test Suite
 * ==============================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  SEARCH_ENTITY_TYPES,
  SORT_OPTIONS,
  TIER_FILTERS,
  SUPPORTED_FEATURES,
  DEFAULT_SYNONYMS,
  normalizeQuery,
  tokenizeQuery,
  expandQueryTokens,
  extractTemplateFeatures,
  createTemplateSearchDocument,
  createMusicSearchDocument,
  createArticleSearchDocument,
  calculateRelevanceScore,
  escapeHtml,
  generateSafeHighlights,
  filterAndSortTemplates,
  computeFacets,
  executeGlobalSearch,
  generateSearchSuggestions,
  findRelatedTemplates,
  findAlternativeSuggestions,
  hashClientIp,
  createSearchAnalyticsRecord,
  computeSearchDiagnostics
} from '../src/search-discovery-engine.js';

import { DEFAULT_HELP_ARTICLES } from '../src/support-desk-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Mock template set for thorough testing
const MOCK_TEMPLATES = [
  {
    id: 'tpl_glitter_birthday',
    slug: 'glitter-birthday-bash',
    name: 'Glitter Birthday Bash 3D',
    category: 'Birthday',
    description: 'Explosive 3D celebration with interactive polaroid photo memories, confetti particles, and custom cake cutting.',
    tier: 'free',
    isPremium: false,
    price: 0,
    rating: 4.9,
    popularityScore: 160,
    featured: true,
    isPublished: true,
    status: 'published',
    relationships: ['Best Friend', 'Brother', 'Sister', 'Friendship', 'Girlfriend'],
    tags: ['birthday', 'cake', 'confetti', '3d'],
    capabilities: { hero: true, gallery: true, music: true, countdown: true, timeline: false }
  },
  {
    id: 'tpl_romantic_scrapbook',
    slug: 'starlit-romance-scrapbook',
    name: 'Starlit Romance & Love Letter',
    category: 'Love',
    description: 'Wax seal opening envelope with starlit night sky, romantic polaroid memories reel and secret love message.',
    tier: 'vip',
    isPremium: true,
    price: 49,
    rating: 5.0,
    popularityScore: 190,
    featured: true,
    isPublished: true,
    status: 'published',
    relationships: ['Girlfriend', 'Boyfriend', 'Wife', 'Husband', 'Crush'],
    tags: ['love', 'romance', 'anniversary', 'wax seal'],
    capabilities: { hero: true, gallery: true, music: true, countdown: false, secretMessage: true, openWhen: true }
  },
  {
    id: 'tpl_midnight_countdown',
    slug: 'midnight-celebration-countdown',
    name: 'Midnight Celebration Countdown Clock',
    category: 'Birthday',
    description: 'Anticipation countdown clock for scheduled celebration unlocks at midnight with binaural background score.',
    tier: 'vip',
    isPremium: true,
    price: 49,
    rating: 4.8,
    popularityScore: 140,
    featured: false,
    isPublished: true,
    status: 'published',
    relationships: ['Birthday', 'Best Friend', 'Crush'],
    tags: ['countdown', 'midnight', 'birthday'],
    capabilities: { hero: true, gallery: true, music: true, countdown: true, timeline: false }
  },
  {
    id: 'tpl_golden_anniversary',
    slug: 'golden-memories-anniversary',
    name: 'Golden Memories Keepsake',
    category: 'Anniversary',
    description: 'Nostalgic golden photo memories and milestone celebration for couples and parents.',
    tier: 'free',
    isPremium: false,
    price: 0,
    rating: 4.95,
    popularityScore: 110,
    featured: false,
    isPublished: true,
    status: 'published',
    relationships: ['Mother', 'Father', 'Wife', 'Husband', 'Family'],
    tags: ['anniversary', 'golden', 'parents'],
    capabilities: { hero: true, gallery: true, music: true, timeline: true }
  },
  {
    id: 'tpl_friendship_chronicles',
    slug: 'forever-friends-funhouse',
    name: 'Forever Friends Funhouse',
    category: 'Friendship',
    description: 'Hilarious photo reel and milestone timeline celebrating crazy best friend memories and inside jokes.',
    tier: 'free',
    isPremium: false,
    price: 0,
    rating: 4.85,
    popularityScore: 130,
    featured: false,
    isPublished: true,
    status: 'published',
    relationships: ['Best Friend', 'Friendship', 'Female Friend', 'Male Friend'],
    tags: ['friendship', 'best friend', 'memories'],
    capabilities: { hero: true, gallery: true, music: true, timeline: true }
  },
  {
    id: 'tpl_parents_tribute',
    slug: 'dearest-parents-tribute',
    name: 'Dearest Parents Tribute',
    category: 'Family',
    description: 'Emotional tribute to parents with gratitude letters, timeline milestones, and heartfelt memories.',
    tier: 'vip',
    isPremium: true,
    price: 49,
    rating: 4.98,
    popularityScore: 150,
    featured: false,
    isPublished: true,
    status: 'published',
    relationships: ['Mother', 'Father', 'Family', 'Parents'],
    tags: ['parents', 'family', 'gratitude'],
    capabilities: { hero: true, gallery: true, music: true, timeline: true }
  },
  {
    id: 'tpl_draft_unpublished',
    slug: 'draft-unreleased-template',
    name: 'Secret In-Development Draft',
    category: 'Birthday',
    description: 'Should never appear in public search results.',
    tier: 'free',
    isPublished: false,
    status: 'draft',
    relationships: ['Best Friend'],
    tags: ['draft']
  }
];

const MOCK_MUSIC = [
  {
    id: 'mus_celebration_strings',
    title: 'Celebration Acoustic Strings',
    artist: 'WishMagic Ensemble',
    category: 'celebration',
    relationshipSuitability: ['birthday', 'friendship'],
    playbackUrl: 'https://assets.wishmagic.live/music/celebration-strings.mp3',
    status: 'active',
    isFeatured: 1
  },
  {
    id: 'mus_romantic_piano',
    title: 'Romantic Midnight Piano',
    artist: 'WishMagic Serenades',
    category: 'romantic',
    relationshipSuitability: ['girlfriend', 'boyfriend', 'wife', 'husband', 'crush'],
    playbackUrl: 'https://assets.wishmagic.live/music/romantic-piano.mp3',
    status: 'active',
    isFeatured: 1
  }
];

test('WishMagic Part 39: Production Global Search & Discovery Suite', async (t) => {

  await t.test('TEST 1: Migration 0024 Schema & D1 Additive Invariants', () => {
    const migrationPath = path.join(ROOT_DIR, 'migrations', '0024_part39_global_search_and_discovery_analytics.sql');
    assert.ok(fs.existsSync(migrationPath), 'Migration 0024 file must exist');

    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.match(sql, /c08b683b-eb07-4639-ab33-fb1139bfb295/, 'Must preserve production D1 database UUID');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS search_index/, 'Must define search_index table');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS search_analytics/, 'Must define search_analytics table');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS search_synonyms_keywords/, 'Must define search_synonyms_keywords table');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS search_recent_queries/, 'Must define search_recent_queries table');
    assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_search_index_entity/, 'Must define entity index');
    assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_search_analytics_created/, 'Must define search analytics timestamp index');
  });

  await t.test('TEST 2: Query Normalization, Tokenization & Synonyms Expansion', () => {
    // Normalization
    assert.equal(normalizeQuery('  Birthday   Party! #Celebration  '), 'birthday party celebration');
    assert.equal(normalizeQuery(''), '');
    assert.equal(normalizeQuery(null), '');

    // Tokenization
    const tokens = tokenizeQuery('Glitter 3D Birthday #Bash');
    assert.deepEqual(tokens, ['glitter', '3d', 'birthday', 'bash']);

    // Synonym expansion
    const expanded = expandQueryTokens(['bday', 'gf']);
    assert.ok(expanded.includes('bday'), 'Must contain original token');
    assert.ok(expanded.includes('birthday'), 'Must expand bday to birthday');
    assert.ok(expanded.includes('girlfriend'), 'Must expand gf to girlfriend');
    assert.ok(expanded.includes('romantic'), 'Must expand gf to romantic');

    // Custom synonyms support
    const customExpanded = expandQueryTokens(['janamdin'], { janamdin: ['birthday', 'celebration'] });
    assert.ok(customExpanded.includes('birthday'), 'Custom synonym must expand');
  });

  await t.test('TEST 3: Multi-Attribute Relevance Scoring & Ranking', () => {
    const doc1 = createTemplateSearchDocument(MOCK_TEMPLATES[0]); // Glitter Birthday Bash 3D
    const doc2 = createTemplateSearchDocument(MOCK_TEMPLATES[1]); // Starlit Romance

    // Exact title match should score highest
    const score1 = calculateRelevanceScore(doc1, 'glitter birthday bash 3d', ['glitter', 'birthday'], ['glitter', 'birthday']);
    const score2 = calculateRelevanceScore(doc2, 'glitter birthday bash 3d', ['glitter', 'birthday'], ['glitter', 'birthday']);
    assert.ok(score1 > score2, 'Glitter template must score much higher than Romance template for Glitter query');
    assert.ok(score1 > 100, 'Exact title match must score above 100');

    // Category match
    const bdayScore = calculateRelevanceScore(doc1, 'birthday', ['birthday'], ['birthday']);
    assert.ok(bdayScore > 40, 'Category match must provide significant score');

    // Tag / Feature match
    const polaroidScore = calculateRelevanceScore(doc1, 'polaroid', ['polaroid'], ['polaroid']);
    assert.ok(polaroidScore > 15, 'Feature match must register');
  });

  await t.test('TEST 4: Safe HTML Escaping & Keyword Highlighting (XSS Defenses)', () => {
    // Escape verification
    const dangerous = '<script>alert("XSS")</script>';
    const escaped = escapeHtml(dangerous);
    assert.equal(escaped, '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');

    // Safe highlighting should NOT produce raw unescaped script tags
    const highlighted = generateSafeHighlights(dangerous, ['alert', 'script']);
    assert.ok(!highlighted.includes('<script>'), 'Must never render raw unescaped script tags');
    assert.ok(highlighted.includes('&lt;<mark class='), 'Must wrap escaped characters inside mark safely');

    // Benign highlight test
    const cleanHighlight = generateSafeHighlights('Happy Birthday Celebration', ['birthday']);
    assert.match(cleanHighlight, /Happy <mark class="[^"]+">Birthday<\/mark> Celebration/);
  });

  await t.test('TEST 5: Template Capability & Feature Extraction', () => {
    const glitterFeatures = extractTemplateFeatures(MOCK_TEMPLATES[0]);
    assert.ok(glitterFeatures.includes('3d'), 'Glitter template must have 3d feature');
    assert.ok(glitterFeatures.includes('audio'), 'Glitter template must have audio feature');
    assert.ok(glitterFeatures.includes('polaroid'), 'Glitter template must have polaroid feature');
    assert.ok(glitterFeatures.includes('countdown'), 'Glitter template must have countdown feature');

    const romanceFeatures = extractTemplateFeatures(MOCK_TEMPLATES[1]);
    assert.ok(romanceFeatures.includes('wax_seal'), 'Romantic template must have wax_seal feature');
    assert.ok(romanceFeatures.includes('secret_letter'), 'Romantic template must have secret_letter feature');
  });

  await t.test('TEST 6: Multi-Entity Global Search (Templates, Music Library & Help Articles)', () => {
    const globalRes = executeGlobalSearch({
      query: 'birthday',
      type: SEARCH_ENTITY_TYPES.ALL,
      templates: MOCK_TEMPLATES,
      musicLibrary: MOCK_MUSIC,
      helpArticles: DEFAULT_HELP_ARTICLES
    });

    assert.equal(globalRes.success, true);
    assert.ok(globalRes.total > 0, 'Total results must be > 0');
    assert.ok(globalRes.templates.total > 0, 'Must match birthday templates');
    assert.ok(globalRes.music.total > 0, 'Must match birthday music tracks');
    assert.ok(globalRes.help.total > 0, 'Must match birthday help articles');

    // Entity-type filter: templates only
    const tplOnly = executeGlobalSearch({
      query: 'birthday',
      type: SEARCH_ENTITY_TYPES.TEMPLATE,
      templates: MOCK_TEMPLATES,
      musicLibrary: MOCK_MUSIC,
      helpArticles: DEFAULT_HELP_ARTICLES
    });
    assert.equal(tplOnly.music.total, 0, 'Music total should be 0 when type=template');
    assert.equal(tplOnly.help.total, 0, 'Help total should be 0 when type=template');
  });

  await t.test('TEST 7: Relationship-Aware Template Discovery', () => {
    // Search query for "girlfriend" should surface romance and glitter templates that support girlfriend
    const relSearch = filterAndSortTemplates(MOCK_TEMPLATES, {
      relationship: 'girlfriend'
    });

    assert.ok(relSearch.total >= 2, 'Should find at least 2 templates supporting girlfriend');
    relSearch.items.forEach(item => {
      const rels = (item.relationships || []).map(r => r.toLowerCase());
      assert.ok(rels.includes('girlfriend') || item.category.toLowerCase().includes('love'), 'Every item must support girlfriend');
    });

    // Query synonym: "gf" should match "girlfriend"
    const gfSearch = filterAndSortTemplates(MOCK_TEMPLATES, {
      query: 'gf'
    });
    assert.ok(gfSearch.total > 0, 'Synonym gf must expand and match templates supporting girlfriend');
  });

  await t.test('TEST 8: Category, Tier (Free vs VIP) and Feature Filtering', () => {
    // Free filter
    const freeOnly = filterAndSortTemplates(MOCK_TEMPLATES, { tier: 'free' });
    assert.ok(freeOnly.total > 0);
    freeOnly.items.forEach(t => assert.equal(t.tier, 'free'));

    // VIP filter
    const vipOnly = filterAndSortTemplates(MOCK_TEMPLATES, { tier: 'vip' });
    assert.ok(vipOnly.total > 0);
    vipOnly.items.forEach(t => assert.equal(t.tier, 'vip'));

    // Category filter
    const bdayOnly = filterAndSortTemplates(MOCK_TEMPLATES, { category: 'birthday' });
    bdayOnly.items.forEach(t => assert.equal(t.category.toLowerCase(), 'birthday'));

    // Capability feature filter: countdown
    const countdownOnly = filterAndSortTemplates(MOCK_TEMPLATES, { features: ['countdown'] });
    assert.ok(countdownOnly.total >= 2, 'Should find at least 2 countdown templates');
    countdownOnly.items.forEach(t => {
      assert.ok(t.features.includes('countdown'), 'Must include countdown feature');
    });

    // Unpublished drafts must NEVER leak into public search
    const allSearch = filterAndSortTemplates(MOCK_TEMPLATES, { query: 'draft' });
    assert.equal(allSearch.total, 0, 'Draft templates must never appear in public search');
  });

  await t.test('TEST 9: Sorting and Pagination Invariants', () => {
    // Rating sort
    const ratingSorted = filterAndSortTemplates(MOCK_TEMPLATES, { sort: SORT_OPTIONS.RATING });
    for (let i = 0; i < ratingSorted.items.length - 1; i++) {
      assert.ok(ratingSorted.items[i].rating >= ratingSorted.items[i + 1].rating, 'Ratings must be in descending order');
    }

    // Name ascending sort
    const nameSorted = filterAndSortTemplates(MOCK_TEMPLATES, { sort: SORT_OPTIONS.NAME_ASC });
    for (let i = 0; i < nameSorted.items.length - 1; i++) {
      assert.ok(nameSorted.items[i].name.localeCompare(nameSorted.items[i + 1].name) <= 0, 'Names must be alphabetical');
    }

    // Pagination
    const page1 = filterAndSortTemplates(MOCK_TEMPLATES, { page: 1, limit: 2 });
    const page2 = filterAndSortTemplates(MOCK_TEMPLATES, { page: 2, limit: 2 });
    assert.equal(page1.items.length, 2);
    assert.equal(page2.items.length, 2);
    assert.notEqual(page1.items[0].id, page2.items[0].id, 'Page 1 and Page 2 must have distinct items');
    assert.equal(page1.hasMore, true);
  });

  await t.test('TEST 10: Search Suggestions, Auto-complete & Recent Searches', () => {
    const suggestions = generateSearchSuggestions({
      query: 'birth',
      templates: MOCK_TEMPLATES,
      musicLibrary: MOCK_MUSIC,
      helpArticles: DEFAULT_HELP_ARTICLES
    });

    assert.ok(suggestions.suggestions.length > 0, 'Must produce suggestions for partial query');
    const types = suggestions.suggestions.map(s => s.type);
    assert.ok(types.includes('category') || types.includes('template'), 'Must include category or template suggestion');

    // Empty query returns recent searches
    const emptySuggestions = generateSearchSuggestions({
      query: '',
      recentQueries: ['anniversary', 'golden photo reel']
    });
    assert.equal(emptySuggestions.suggestions.length, 2);
    assert.equal(emptySuggestions.suggestions[0].type, 'recent');
    assert.equal(emptySuggestions.suggestions[0].text, 'anniversary');
  });

  await t.test('TEST 11: Related & Alternative Template Discovery', () => {
    // Related templates for Romance template
    const romanceTpl = MOCK_TEMPLATES[1];
    const related = findRelatedTemplates(romanceTpl, MOCK_TEMPLATES, { limit: 3 });
    assert.ok(related.length > 0, 'Must recommend related templates');
    assert.notEqual(related[0].id, romanceTpl.id, 'Must not recommend self');

    // Alternative recommendations when query returns 0 results
    const alternatives = findAlternativeSuggestions('nonexistentquery12345', MOCK_TEMPLATES, { limit: 3 });
    assert.ok(alternatives.length > 0, 'Must provide alternative templates when 0 results found');
    assert.equal(alternatives.some(a => a.status === 'draft'), false, 'Alternatives must never include drafts');
  });

  await t.test('TEST 12: Search Telemetry, Diagnostics & Zero-Result Analytics', () => {
    // IP hashing test
    const ipHash1 = hashClientIp('192.168.1.100');
    const ipHash2 = hashClientIp('192.168.1.100');
    assert.equal(ipHash1, ipHash2, 'Same IP must yield deterministic hash');
    assert.equal(ipHash1.length, 16, 'Hash must be 16 characters');

    // Log record creation
    const log = createSearchAnalyticsRecord({
      query: 'retirement party',
      resultCount: 0,
      ip: '10.0.0.1'
    });
    assert.equal(log.has_results, 0);
    assert.equal(log.normalized_query, 'retirement party');

    const mockLogs = [
      createSearchAnalyticsRecord({ query: 'birthday', resultCount: 4 }),
      createSearchAnalyticsRecord({ query: 'birthday', resultCount: 4, selectedEntityId: 'tpl_glitter_birthday' }),
      createSearchAnalyticsRecord({ query: 'farewell', resultCount: 0 }),
      createSearchAnalyticsRecord({ query: 'farewell', resultCount: 0 })
    ];

    const diagnostics = computeSearchDiagnostics(mockLogs, 30);
    assert.equal(diagnostics.totalSearches, 4);
    assert.equal(diagnostics.zeroResultCount, 2);
    assert.equal(diagnostics.zeroResultRate, 50);
    assert.equal(diagnostics.clickThroughRate, 25);
    assert.equal(diagnostics.topZeroResultQueries[0].query, 'farewell');
    assert.equal(diagnostics.topZeroResultQueries[0].count, 2);
  });

});
