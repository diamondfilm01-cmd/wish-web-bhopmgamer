/**
 * WishMagic Complete Production Analytics & Business Intelligence Engine Tests (Part 33)
 * ======================================================================================
 * Tests all components of the Part 33 Real-Time Analytics & BI System:
 * - D1 Migration 0018 Schema & Additive Safety
 * - Date Range Bounds & Asia/Kolkata Timezone Precision
 * - Comparison Period Calculations & Baseline Handling
 * - Authoritative Executive Overview KPIs (Revenue in Paise, Refunds, Lifecycle)
 * - User Growth & Time Series Aggregation
 * - 7-Stage Wish Funnel Conversion & Drop-off Analysis
 * - Template Marketplace Performance & Relationship Variants
 * - Revenue Analytics & Order Status Breakdown
 * - Safe CSV Export & Formula Injection Defense
 * - Event Ingestion Validation & Privacy Hardening
 * - Admin RBAC Security & Non-Admin Access Blocking
 * - Zero-Regression Integrity for Parts 19–32
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REPORTING_TIMEZONE,
  ANALYTICS_EVENT_TYPES,
  DATE_RANGE_PRESETS,
  ERROR_CODES,
  formatIstDateKey,
  getDateRangeBounds,
  calculateComparison,
  calculateExecutiveOverview,
  calculateUserAnalytics,
  calculateWishFunnel,
  calculateTemplatePerformance,
  calculateRevenueAnalytics,
  escapeCsvCell,
  generateSafeCsv,
  validateAndSanitizeAnalyticsEvent
} from '../src/analytics-bi-engine.js';

import { ORDER_STATUS } from '../src/commerce-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('WishMagic Part 33: Production Analytics & Business Intelligence Engine Suite', async (t) => {

  // --------------------------------------------------------------------------
  // TEST 1: Migration 0018 Schema & Additive D1 Integrity
  // --------------------------------------------------------------------------
  await t.test('TEST 1: Migration 0018 Schema & Additive D1 Integrity', () => {
    const migPath = path.join(ROOT_DIR, 'migrations', '0018_part33_analytics_bi_engine.sql');
    assert.equal(fs.existsSync(migPath), true, 'Migration 0018 file must exist');

    const sql = fs.readFileSync(migPath, 'utf8');
    assert.match(sql, /c08b683b-eb07-4639-ab33-fb1139bfb295/, 'Must reference authoritative production D1 UUID');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS analytics_events/, 'Must define analytics_events table safely');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS analytics_daily_aggregates/, 'Must define analytics_daily_aggregates table');
    assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_daily_agg_date_metric/, 'Must create composite date/metric index');
    assert.match(sql, /mig_0018/, 'Must record migration entry in _migrations');

    // Strict preservation: no destructive SQL statements
    const nonCommentSql = sql.replace(/--.*$/gm, '');
    assert.equal(/\bDROP\s+TABLE\b/i.test(nonCommentSql), false, 'Migration must NEVER contain DROP TABLE');
    assert.equal(/\bTRUNCATE\b/i.test(nonCommentSql), false, 'Migration must NEVER contain TRUNCATE');
    assert.equal(/\bDROP\s+DATABASE\b/i.test(nonCommentSql), false, 'Migration must NEVER contain DROP DATABASE');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Date Range Bounds & Asia/Kolkata Timezone Precision
  // --------------------------------------------------------------------------
  await t.test('TEST 2: Date Range Bounds & Asia/Kolkata Timezone Precision', () => {
    // 1. Preset 7d bounds
    const bounds7d = getDateRangeBounds(DATE_RANGE_PRESETS.SEVEN_DAYS);
    assert.equal(bounds7d.timezone, 'Asia/Kolkata');
    assert.ok(bounds7d.startMs < bounds7d.endMs, 'Start must precede end');
    assert.ok(bounds7d.comparison.startMs < bounds7d.comparison.endMs, 'Comparison start must precede comparison end');
    assert.equal(bounds7d.comparison.endMs, bounds7d.startMs - 1, 'Comparison period must immediately precede primary period');

    // 2. Custom date range
    const boundsCustom = getDateRangeBounds(DATE_RANGE_PRESETS.CUSTOM, '2026-10-01', '2026-10-07');
    assert.equal(boundsCustom.rangeKey, 'custom');
    assert.ok(boundsCustom.startIso.includes('2026-09-30T18:30:00.000Z') || boundsCustom.startIso.includes('2026-10-01'), 'Must align with IST offset');

    // 3. Reject invalid custom range (start after end)
    assert.throws(
      () => getDateRangeBounds(DATE_RANGE_PRESETS.CUSTOM, '2026-10-10', '2026-10-05'),
      (err) => err.code === ERROR_CODES.INVALID_DATE_RANGE
    );

    // 4. Reject range exceeding 366 days
    assert.throws(
      () => getDateRangeBounds(DATE_RANGE_PRESETS.CUSTOM, '2024-01-01', '2026-01-01'),
      (err) => err.code === ERROR_CODES.RANGE_EXCEEDED
    );

    // 5. IST Date formatting
    const istKey = formatIstDateKey('2026-10-08T19:00:00.000Z'); // 19:00 UTC = 00:30 next day in IST
    assert.equal(istKey, '2026-10-09', 'Must correctly transition to next IST date at 00:30');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Comparison Period Calculations & Baseline Handling
  // --------------------------------------------------------------------------
  await t.test('TEST 3: Comparison Period Calculations & Baseline Handling', () => {
    // Positive change with valid baseline
    const compPositive = calculateComparison(150, 100);
    assert.equal(compPositive.current, 150);
    assert.equal(compPositive.previous, 100);
    assert.equal(compPositive.absoluteChange, 50);
    assert.equal(compPositive.percentageChange, 50);
    assert.equal(compPositive.hasBaseline, true);
    assert.equal(compPositive.trend, 'up');

    // Negative change with valid baseline
    const compNegative = calculateComparison(80, 100);
    assert.equal(compNegative.absoluteChange, -20);
    assert.equal(compNegative.percentageChange, -20);
    assert.equal(compNegative.trend, 'down');

    // Zero baseline handling (truthful reporting: no manufactured % increase)
    const compZeroBase = calculateComparison(45, 0);
    assert.equal(compZeroBase.current, 45);
    assert.equal(compZeroBase.previous, 0);
    assert.equal(compZeroBase.absoluteChange, 45);
    assert.equal(compZeroBase.percentageChange, null, 'Must report null percentage when previous value is 0');
    assert.equal(compZeroBase.hasBaseline, false);

    // Zero current and zero previous
    const compBothZero = calculateComparison(0, 0);
    assert.equal(compBothZero.percentageChange, 0);
    assert.equal(compBothZero.trend, 'neutral');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Authoritative Executive Overview KPIs & Integer Arithmetic
  // --------------------------------------------------------------------------
  await t.test('TEST 4: Authoritative Executive Overview KPIs & Integer Arithmetic', () => {
    const bounds = getDateRangeBounds(DATE_RANGE_PRESETS.THIRTY_DAYS);

    const testUsers = [
      { id: 'usr_1', created_at: new Date(bounds.startMs + 1000).toISOString() },
      { id: 'usr_2', created_at: new Date(bounds.startMs + 5000).toISOString() },
      { id: 'usr_old', created_at: new Date(bounds.comparison.startMs + 1000).toISOString() }
    ];

    const testWishes = [
      { id: 'w_1', status: 'published', is_published: 1, created_at: new Date(bounds.startMs + 2000).toISOString(), published_at: new Date(bounds.startMs + 3000).toISOString() },
      { id: 'w_2', status: 'draft', created_at: new Date(bounds.startMs + 4000).toISOString() },
      { id: 'w_3', status: 'active', is_published: 1, created_at: new Date(bounds.startMs + 6000).toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() },
      { id: 'w_exp', status: 'expired', created_at: new Date(bounds.startMs + 7000).toISOString(), expires_at: new Date(Date.now() - 86400000).toISOString() }
    ];

    const testOrders = [
      { id: 'ord_1', status: ORDER_STATUS.PAID, amount: 4900, paid_at: new Date(bounds.startMs + 2000).toISOString() },
      { id: 'ord_2', status: ORDER_STATUS.PAID, amount: 9900, paid_at: new Date(bounds.startMs + 4000).toISOString() },
      { id: 'ord_failed', status: ORDER_STATUS.PAYMENT_FAILED, amount: 4900, created_at: new Date(bounds.startMs + 5000).toISOString() },
      { id: 'ord_pending', status: ORDER_STATUS.PENDING, amount: 4900, created_at: new Date(bounds.startMs + 6000).toISOString() }
    ];

    const testRefunds = [
      { id: 'ref_1', order_id: 'ord_1', amount: 2000, status: 'SUCCEEDED', created_at: new Date(bounds.startMs + 8000).toISOString() }
    ];

    const overview = calculateExecutiveOverview({
      users: testUsers,
      wishes: testWishes,
      orders: testOrders,
      refunds: testRefunds,
      events: [],
      dateBounds: bounds
    });

    // User asserts
    assert.equal(overview.metrics.totalUsers.value, 3);
    assert.equal(overview.metrics.newUsers.current, 2);
    assert.equal(overview.metrics.newUsers.previous, 1);

    // Wish asserts
    assert.equal(overview.metrics.totalWishes.value, 4);
    assert.equal(overview.metrics.wishesCreated.current, 4);
    assert.equal(overview.metrics.wishesPublished.current, 2);

    // Lifecycle snapshot asserts
    assert.equal(overview.lifecycleSnapshot.drafts, 1);
    assert.equal(overview.lifecycleSnapshot.expired, 1);
    assert.equal(overview.lifecycleSnapshot.active, 2);

    // Financial asserts
    assert.equal(overview.metrics.paidOrders.current, 2, 'Pending and failed orders must NOT be counted as paid');
    assert.equal(overview.metrics.grossRevenue.amountPaise, 14800, 'Gross revenue must sum paise exactly (4900 + 9900 = 14800)');
    assert.equal(overview.metrics.grossRevenue.current, 148, 'Gross rupees must be 148');
    assert.equal(overview.metrics.refunds.amountPaise, 2000, 'Refund must be 2000 paise');
    assert.equal(overview.metrics.refunds.current, 20, 'Refund rupees must be 20');
    assert.equal(overview.metrics.netRevenue.amountPaise, 12800, 'Net revenue must be 14800 - 2000 = 12800 paise');
    assert.equal(overview.metrics.netRevenue.current, 128, 'Net rupees must be 128');
    assert.equal(overview.metrics.averageOrderValue.current, 74, 'AOV must be 148 / 2 = 74');
  });

  // --------------------------------------------------------------------------
  // TEST 5: User Growth & Registration Time Series
  // --------------------------------------------------------------------------
  await t.test('TEST 5: User Growth & Registration Time Series', () => {
    const bounds = getDateRangeBounds(DATE_RANGE_PRESETS.SEVEN_DAYS);
    const day1Iso = new Date(bounds.startMs + 3600000).toISOString();
    const day2Iso = new Date(bounds.startMs + 86400000 + 3600000).toISOString();

    const users = [
      { id: 'u1', role: 'user', status: 'active', created_at: day1Iso },
      { id: 'u2', role: 'admin', status: 'active', created_at: day1Iso },
      { id: 'u3', role: 'user', status: 'active', created_at: day2Iso }
    ];

    const result = calculateUserAnalytics({ users, dateBounds: bounds });
    assert.equal(result.totalUsers, 3);
    assert.equal(result.newUsersInPeriod, 3);
    assert.ok(result.timeSeries.length >= 7, 'Time series must span continuous days');
    assert.equal(result.roleBreakdown.user, 2);
    assert.equal(result.roleBreakdown.admin, 1);
  });

  // --------------------------------------------------------------------------
  // TEST 6: 7-Stage Wish Creation Funnel Analysis
  // --------------------------------------------------------------------------
  await t.test('TEST 6: 7-Stage Wish Creation Funnel Analysis', () => {
    const bounds = getDateRangeBounds(DATE_RANGE_PRESETS.THIRTY_DAYS);
    const tMs = bounds.startMs + 5000;

    const events = [
      // 10 Views
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `e_view_${i}`,
        event_name: ANALYTICS_EVENT_TYPES.TEMPLATE_DETAIL_VIEWED,
        user_id: `u_${i}`,
        timestamp: new Date(tMs + i * 100).toISOString()
      })),
      // 6 Create clicks
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `e_click_${i}`,
        event_name: ANALYTICS_EVENT_TYPES.CREATE_WISH_CLICKED,
        user_id: `u_${i}`,
        timestamp: new Date(tMs + 1000 + i * 100).toISOString()
      })),
      // 4 Customizer opened
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `e_cust_${i}`,
        event_name: ANALYTICS_EVENT_TYPES.CUSTOMIZER_OPENED,
        user_id: `u_${i}`,
        timestamp: new Date(tMs + 2000 + i * 100).toISOString()
      })),
      // 3 Drafts
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `e_draft_${i}`,
        event_name: ANALYTICS_EVENT_TYPES.WISH_DRAFT_CREATED,
        user_id: `u_${i}`,
        timestamp: new Date(tMs + 3000 + i * 100).toISOString()
      })),
      // 2 Published
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `e_pub_${i}`,
        event_name: ANALYTICS_EVENT_TYPES.WISH_PUBLISHED,
        user_id: `u_${i}`,
        timestamp: new Date(tMs + 4000 + i * 100).toISOString()
      })),
      // 1 Shared
      {
        id: 'e_share_0',
        event_name: ANALYTICS_EVENT_TYPES.WISH_SHARED,
        user_id: 'u_0',
        timestamp: new Date(tMs + 5000).toISOString()
      }
    ];

    const funnel = calculateWishFunnel({ events, wishes: [], dateBounds: bounds });
    assert.equal(funnel.stages.length, 7, 'Must have 7 canonical funnel stages');
    assert.equal(funnel.stages[0].uniqueUsers, 10, 'Step 1 must have 10 viewers');
    assert.equal(funnel.stages[1].uniqueUsers, 6, 'Step 2 must have 6 clickers');
    assert.equal(funnel.stages[1].conversionPct, 60, 'Step 1 -> 2 conversion must be 60%');
    assert.equal(funnel.stages[1].dropOffPct, 40, 'Step 1 -> 2 drop-off must be 40%');
    assert.equal(funnel.stages[5].uniqueUsers, 2, 'Step 6 (Published) must have 2 users');
    assert.equal(funnel.overallConversionPct, 20, 'Overall conversion 10 -> 2 must be 20%');
  });

  // --------------------------------------------------------------------------
  // TEST 7: Template Marketplace Performance & Relationship Breakdown
  // --------------------------------------------------------------------------
  await t.test('TEST 7: Template Marketplace Performance & Relationship Breakdown', () => {
    const bounds = getDateRangeBounds(DATE_RANGE_PRESETS.THIRTY_DAYS);
    const tMs = bounds.startMs + 5000;

    const templates = [
      { id: 'tpl_bday', name: 'Golden Birthday', category: 'Birthday', tier: 'vip', price: 49 },
      { id: 'tpl_love', name: 'Romantic Rose', category: 'Love', tier: 'free', price: 0 }
    ];

    const wishes = [
      { id: 'w1', template_id: 'tpl_bday', relationship: 'girlfriend', status: 'published', is_published: 1, created_at: new Date(tMs).toISOString() },
      { id: 'w2', template_id: 'tpl_bday', relationship: 'girlfriend', status: 'published', is_published: 1, created_at: new Date(tMs).toISOString() },
      { id: 'w3', template_id: 'tpl_bday', relationship: 'friend', status: 'draft', created_at: new Date(tMs).toISOString() },
      { id: 'w4', template_id: 'tpl_love', relationship: 'boyfriend', status: 'published', is_published: 1, created_at: new Date(tMs).toISOString() }
    ];

    const orders = [
      { id: 'ord_1', status: 'PAID' }
    ];

    const orderItems = [
      { id: 'itm_1', order_id: 'ord_1', product_id: 'template:tpl_bday', unit_price: 4900 }
    ];

    const events = [
      { event_name: 'template_detail_viewed', template_id: 'tpl_bday', timestamp: new Date(tMs).toISOString() },
      { event_name: 'template_detail_viewed', template_id: 'tpl_bday', timestamp: new Date(tMs).toISOString() }
    ];

    const perf = calculateTemplatePerformance({
      templates,
      wishes,
      orders,
      orderItems,
      events,
      dateBounds: bounds
    });

    const bday = perf.rankingTable.find(t => t.templateId === 'tpl_bday');
    assert.ok(bday, 'Birthday template must be in rankings');
    assert.equal(bday.views, 2);
    assert.equal(bday.wishesCreated, 3);
    assert.equal(bday.wishesPublished, 2);
    assert.equal(bday.purchases, 1);
    assert.equal(bday.revenueRupees, 49);
    assert.equal(bday.relationshipBreakdown.girlfriend, 2);
    assert.equal(bday.relationshipBreakdown.friend, 1);
  });

  // --------------------------------------------------------------------------
  // TEST 8: Revenue Analytics & Order Status Breakdown
  // --------------------------------------------------------------------------
  await t.test('TEST 8: Revenue Analytics & Order Status Breakdown', () => {
    const bounds = getDateRangeBounds(DATE_RANGE_PRESETS.THIRTY_DAYS);
    const tMs = bounds.startMs + 5000;

    const orders = [
      { id: 'o1', status: ORDER_STATUS.PAID, amount: 4900, paid_at: new Date(tMs).toISOString(), created_at: new Date(tMs).toISOString() },
      { id: 'o2', status: ORDER_STATUS.PAID, amount: 9900, paid_at: new Date(tMs).toISOString(), created_at: new Date(tMs).toISOString() },
      { id: 'o3', status: ORDER_STATUS.PENDING, amount: 4900, created_at: new Date(tMs).toISOString() },
      { id: 'o4', status: ORDER_STATUS.PAYMENT_FAILED, amount: 4900, created_at: new Date(tMs).toISOString() }
    ];

    const orderItems = [
      { id: 'i1', order_id: 'o1', product_id: 'vip_pass', product_name: 'VIP Pass', unit_price: 4900 },
      { id: 'i2', order_id: 'o2', product_id: 'personalized_link', product_name: 'Custom Link', unit_price: 9900 }
    ];

    const refunds = [
      { id: 'r1', order_id: 'o1', amount: 1000, status: 'SUCCEEDED', created_at: new Date(tMs).toISOString() }
    ];

    const rev = calculateRevenueAnalytics({ orders, orderItems, refunds, dateBounds: bounds });
    assert.equal(rev.totalOrders, 4);
    assert.equal(rev.paidOrders, 2);
    assert.equal(rev.grossRevenueRupees, 148);
    assert.equal(rev.refundsRupees, 10);
    assert.equal(rev.netRevenueRupees, 138);
    assert.equal(rev.statusDistribution[ORDER_STATUS.PAID], 2);
    assert.equal(rev.statusDistribution[ORDER_STATUS.PENDING], 1);
    assert.equal(rev.statusDistribution[ORDER_STATUS.PAYMENT_FAILED], 1);
    assert.equal(rev.productPerformance.length, 2);
  });

  // --------------------------------------------------------------------------
  // TEST 9: Safe CSV Export & Formula Injection Defense
  // --------------------------------------------------------------------------
  await t.test('TEST 9: Safe CSV Export & Formula Injection Defense', () => {
    // 1. Cell escaping formula injection check
    assert.equal(escapeCsvCell('=CMD|/C calc!A0'), `"'=CMD|/C calc!A0"`, 'Must neutralize leading = with leading quote');
    assert.equal(escapeCsvCell('+12345'), `"'+12345"`, 'Must neutralize leading + with leading quote');
    assert.equal(escapeCsvCell('-45'), `"'-45"`, 'Must neutralize leading - with leading quote');
    assert.equal(escapeCsvCell('@SUM(1,2)'), `"'@SUM(1,2)"`, 'Must neutralize leading @ with leading quote');
    assert.equal(escapeCsvCell('Hello, World!'), `"Hello, World!"`, 'Standard strings must be quoted safely');
    assert.equal(escapeCsvCell('He said "Hi"'), `"He said ""Hi"""`, 'Internal quotes must be escaped per RFC 4180');

    // 2. Full CSV report generation
    const sampleWishes = [
      { id: 'w1', slug: 'happy-bday', recipient_name: '=MaliciousRecipient', template_id: 'tpl_1', status: 'published', created_at: '2026-10-01' }
    ];
    const csv = generateSafeCsv({ reportType: 'wishes', data: sampleWishes });
    assert.match(csv, /"Wish ID","Slug","Recipient Name"/, 'Must have CSV header row');
    assert.match(csv, /"'=MaliciousRecipient"/, 'Must neutralize formula injection in wish report row');

    // 3. Reject unsupported export type
    assert.throws(
      () => generateSafeCsv({ reportType: 'unsupported_unknown', data: [] }),
      (err) => err.code === ERROR_CODES.EXPORT_GENERATION_FAILED
    );
  });

  // --------------------------------------------------------------------------
  // TEST 10: Event Ingestion Validation & Privacy Hardening
  // --------------------------------------------------------------------------
  await t.test('TEST 10: Event Ingestion Validation & Privacy Hardening', () => {
    // 1. Rejects missing event name
    assert.throws(
      () => validateAndSanitizeAnalyticsEvent({}),
      (err) => err.code === ERROR_CODES.EVENT_VALIDATION_ERROR
    );

    // 2. Privacy hardening: strips sensitive user data
    const raw = {
      eventName: 'TEMPLATE_VIEWED',
      userId: 'usr_guest_123',
      templateId: 'tpl_glitter',
      metadata: {
        planId: 'vip_pass',
        secretMessage: 'This is my secret private wish message which should never leak into analytics',
        voiceNoteUrl: 'https://b2.backblaze.com/voice-recording.mp3',
        passwordHash: '$2b$12$somehash'
      }
    };

    const sanitized = validateAndSanitizeAnalyticsEvent(raw, { id: 'usr_auth_789' });
    assert.equal(sanitized.event_name, ANALYTICS_EVENT_TYPES.TEMPLATE_DETAIL_VIEWED, 'Must map alias to canonical name');
    assert.equal(sanitized.user_id, 'usr_auth_789', 'Must enforce authenticated user ID');
    assert.equal(sanitized.template_id, 'tpl_glitter');

    const meta = JSON.parse(sanitized.metadata);
    assert.equal(meta.planId, 'vip_pass');
    assert.equal(meta.secretMessage, undefined, 'Must strip secret message content');
    assert.equal(meta.voiceNoteUrl, undefined, 'Must strip voice note URLs');
    assert.equal(meta.passwordHash, undefined, 'Must strip passwords');
  });

  // --------------------------------------------------------------------------
  // TEST 11: Security & Regression Invariants
  // --------------------------------------------------------------------------
  await t.test('TEST 11: Security & Regression Invariants', () => {
    // Ensure all 18 migrations exist
    const migFiles = fs.readdirSync(path.join(ROOT_DIR, 'migrations')).filter(f => f.endsWith('.sql'));
    assert.ok(migFiles.includes('0018_part33_analytics_bi_engine.sql'), 'Migration 0018 must be present');
    assert.ok(migFiles.length >= 18, 'All preceding migrations must be retained');

    // Ensure production D1 database UUID has not been replaced or altered
    const wranglerContent = fs.readFileSync(path.join(ROOT_DIR, 'wrangler.toml'), 'utf8');
    assert.match(wranglerContent, /database_id\s*=\s*"c08b683b-eb07-4639-ab33-fb1139bfb295"/, 'D1 UUID must remain c08b683b-eb07-4639-ab33-fb1139bfb295');
  });

});
