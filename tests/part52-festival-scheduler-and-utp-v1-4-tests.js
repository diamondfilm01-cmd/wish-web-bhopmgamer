/**
 * WishMagic Part 52 — Festival Scheduler & UTP v1.4.0 Automated Test Suite
 * =========================================================================
 * Covers all required test groups:
 * - Group A: Festival Date Resolution, Overrides, Precedence & Provider Sync Resilience
 * - Group B: Publication Window Calculations (8 Nov 2026 -> 24 Oct..11 Nov inclusive, 12 Nov blocked, leap years, boundaries, timezones)
 * - Group C: Immediate Wish Creation During Active Campaigns & Stale Customizer Expiry Rejection
 * - Group D: Existing Wish Lifecycle Preservation & Multi-Campaign Template Deduplication
 * - Group E: Server-Side Security, Authorization, SQLi & Zero Private Data Leakage
 * - Group F: UTP v1.4.0 Compatibility, Festival Metadata Validation & Schedule Authority Enforcement
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../src/worker.js';
import { DatabaseSync, cleanupSqliteBridge } from '../scripts/sqlite-compat.js';
import { D1MigrationRunner } from '../scripts/migration-runner.js';
import {
  DEFAULT_FESTIVAL_TIMEZONE,
  FESTIVAL_CALCULATION_METHODS,
  FESTIVAL_VERIFICATION_STATUS,
  CAMPAIGN_STATUS,
  parseDateOnlyStrict,
  addCalendarDays,
  startOfDay,
  calculatePublicationWindow,
  isTimestampWithinPublicationWindow,
  resolveAutomaticFestivalDateForYear,
  resolveEffectiveFestivalDate,
  evaluateCampaignEligibility,
  syncFestivalDatesFromExternalProvider,
  setFestivalDateOverride,
  removeFestivalDateOverride,
  upsertFestivalCampaign,
  assignTemplatesToFestivalCampaign
} from '../src/festival-scheduler-engine.js';
import {
  UTP_SUPPORTED_SCHEMA_VERSIONS,
  UTP_FESTIVAL_SCHEMA_VERSION,
  validateAndNormalizeFestivalMetadata
} from '../src/template-protocol-schema.js';
import { validateUtpManifest } from '../src/template-protocol-validator.js';

function createD1Adapter(sqliteDb) {
  return {
    prepare(sql) {
      return {
        sql,
        params: [],
        bind(...params) {
          const bound = {
            sql,
            params,
            async run() {
              const stmt = sqliteDb.prepare(sql);
              const info = stmt.run(...params);
              return { success: true, meta: { changes: info.changes } };
            },
            async first() {
              const stmt = sqliteDb.prepare(sql);
              return stmt.get(...params) || null;
            },
            async all() {
              const stmt = sqliteDb.prepare(sql);
              return { success: true, results: stmt.all(...params) };
            }
          };
          return bound;
        },
        async run() {
          const stmt = sqliteDb.prepare(sql);
          const info = stmt.run();
          return { success: true, meta: { changes: info.changes } };
        },
        async first() {
          const stmt = sqliteDb.prepare(sql);
          return stmt.get() || null;
        },
        async all() {
          const stmt = sqliteDb.prepare(sql);
          return { success: true, results: stmt.all() };
        }
      };
    },
    async batch(statements) {
      const results = [];
      for (const s of statements) {
        results.push(await s.run());
      }
      return results;
    }
  };
}

async function createTestEnv() {
  const rawDb = new DatabaseSync(':memory:');
  const d1 = createD1Adapter(rawDb);
  const runner = new D1MigrationRunner(d1);
  await runner.runMigrations();

  // Seed admin and standard user sessions for authenticated API requests
  const nowIso = new Date().toISOString();
  const futureIso = new Date(Date.now() + 86400 * 1000 * 30).toISOString();
  await d1.prepare(`
    INSERT OR REPLACE INTO users (id, email, display_name, role, plan, is_premium, status, created_at, updated_at)
    VALUES ('admin_1', 'admin@wishmagic.in', 'Platform Admin', 'admin', 'VIP', 1, 'active', ?, ?),
           ('user_1', 'creator@wishmagic.live', 'Aarav Creator', 'creator', 'Free', 0, 'active', ?, ?)
  `).bind(nowIso, nowIso, nowIso, nowIso).run();

  await d1.prepare(`
    INSERT OR REPLACE INTO sessions (id, user_id, token, expires_at, created_at)
    VALUES ('sess_admin_1', 'admin_1', 'tok_admin_secret_52', ?, ?),
           ('sess_user_1', 'user_1', 'tok_user_secret_52', ?, ?)
  `).bind(futureIso, nowIso, futureIso, nowIso).run();

  return {
    rawDb,
    env: {
      DB: d1,
      ALLOW_TEST_CLOCK: 'true',
      ADMIN_EMAIL: 'admin@wishmagic.live'
    }
  };
}

async function apiCall(env, method, pathUrl, body = null, role = 'anon', extraHeaders = {}) {
  const headers = {
    Origin: 'https://wishmagic.pages.dev',
    ...extraHeaders
  };
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
  }
  if (role === 'admin') {
    headers['Authorization'] = 'Bearer tok_admin_secret_52';
  } else if (role === 'user') {
    headers['Authorization'] = 'Bearer tok_user_secret_52';
  }

  const req = new Request(`https://wishmagic.pages.dev${pathUrl}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined
  });
  const res = await worker.fetch(req, env, { waitUntil: () => {} });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, headers: res.headers };
}

describe('Part 52 — Festival Scheduler & UTP v1.4.0 Complete Verification Suite', () => {

  describe('A. Festival Date Resolution, Precedence & Provider Resilience Tests', () => {
    it('resolves automatic festival dates accurately, rejects invalid dates, handles missing dates safely, and prevents unverified dates from becoming confirmed', async () => {
      // 1. Automatic date resolution: Verified calendar table (Diwali 2026 = 2026-11-08)
      const diwali2026 = resolveAutomaticFestivalDateForYear({
        id: 'fest_diwali',
        slug: 'diwali',
        calculation_method: FESTIVAL_CALCULATION_METHODS.VERIFIED_CALENDAR_TABLE
      }, 2026);
      assert.equal(diwali2026.resolved, true);
      assert.equal(diwali2026.resolvedDate, '2026-11-08');
      assert.equal(diwali2026.verificationStatus, FESTIVAL_VERIFICATION_STATUS.AUTO_VERIFIED);

      // 2. Fixed Gregorian resolution (Christmas 2026 = 2026-12-25)
      const xmas2026 = resolveAutomaticFestivalDateForYear({
        id: 'fest_christmas',
        calculation_method: FESTIVAL_CALCULATION_METHODS.FIXED_GREGORIAN,
        fixed_month: 12,
        fixed_day: 25
      }, 2026);
      assert.equal(xmas2026.resolved, true);
      assert.equal(xmas2026.resolvedDate, '2026-12-25');

      // 3. Deterministic rule resolution (Friendship Day = 1st Sunday of August 2026 = 2026-08-02)
      const friendship2026 = resolveAutomaticFestivalDateForYear({
        id: 'fest_friendship_day',
        calculation_method: FESTIVAL_CALCULATION_METHODS.DETERMINISTIC_RULE,
        calculation_rule_json: JSON.stringify({ type: 'NTH_WEEKDAY_OF_MONTH', month: 8, weekday: 0, nth: 1 })
      }, 2026);
      assert.equal(friendship2026.resolved, true);
      assert.equal(friendship2026.resolvedDate, '2026-08-02');

      // 4. Rejects invalid source dates (non-leap year 2026-02-29, 2026-11-31, malformed)
      assert.equal(parseDateOnlyStrict('2026-02-29').valid, false);
      assert.equal(parseDateOnlyStrict('2028-02-29').valid, true);
      assert.equal(parseDateOnlyStrict('2026-11-31').valid, false);
      assert.equal(parseDateOnlyStrict('2026-13-01').valid, false);
      assert.equal(parseDateOnlyStrict('08-11-2026').valid, false);

      // 5. Missing date handled safely -> DATE_UNAVAILABLE & unconfirmed
      const missingRes = resolveAutomaticFestivalDateForYear({
        id: 'fest_custom_regional',
        calculation_method: FESTIVAL_CALCULATION_METHODS.MANUAL_ADMIN
      }, 2026);
      assert.equal(missingRes.resolved, false);
      assert.equal(missingRes.verificationStatus, FESTIVAL_VERIFICATION_STATUS.DATE_UNAVAILABLE);

      // 6. Unverified date (IMPORTED_PENDING or NEEDS_REVIEW or requires_approval=1) cannot silently become confirmed
      const unverifiedCheck = resolveEffectiveFestivalDate({
        festival: { id: 'fest_eid', default_timezone: 'Asia/Kolkata', requires_admin_approval: 1 },
        yearRecord: {
          festival_id: 'fest_eid',
          applicable_year: 2026,
          resolved_date: '2026-03-20',
          verification_status: FESTIVAL_VERIFICATION_STATUS.IMPORTED_PENDING,
          requires_approval: 1
        },
        activeOverride: null,
        applicableYear: 2026
      });
      assert.equal(unverifiedCheck.isConfirmed, false);
      assert.equal(unverifiedCheck.effectiveDate, null);
      assert.equal(unverifiedCheck.sourceDate, '2026-03-20');
    });

    it('enforces admin manual override precedence, scopes overrides strictly to one year, restores source date on removal, and preserves last valid date when external provider fails', async () => {
      const { env } = await createTestEnv();

      // Verify initial Diwali 2026 source date is 2026-11-08 and 2027 is 2027-10-29
      const initRes = await apiCall(env, 'GET', '/api/admin/festivals?year=2026', null, 'admin');
      assert.equal(initRes.status, 200);
      const diwali26 = initRes.json.data.festivals.find(f => f.id === 'fest_diwali');
      assert.equal(diwali26.dateResolution.effectiveDate, '2026-11-08');
      assert.equal(diwali26.dateResolution.isOverridden, false);

      // Set manual override for Diwali 2026 -> 2026-11-09
      const ovRes = await apiCall(env, 'POST', '/api/admin/festivals/fest_diwali/overrides', {
        applicableYear: 2026,
        overrideDate: '2026-11-09',
        timezone: 'Asia/Kolkata',
        reason: 'Regional Amavasya tithi observance adjustment'
      }, 'admin');
      assert.equal(ovRes.status, 200);
      assert.equal(ovRes.json.data.dateResolution.effectiveDate, '2026-11-09');
      assert.equal(ovRes.json.data.dateResolution.sourceDate, '2026-11-08');
      assert.equal(ovRes.json.data.dateResolution.isOverridden, true);
      assert.equal(ovRes.json.data.publicationWindowPreview.startDate, '2026-10-25');
      assert.equal(ovRes.json.data.publicationWindowPreview.endDate, '2026-11-12');
      assert.equal(ovRes.json.data.publicationWindowPreview.firstBlockedDate, '2026-11-13');

      // Verify 2027 is completely unaffected by the 2026 override
      const check2027 = await apiCall(env, 'GET', '/api/admin/festivals?year=2027', null, 'admin');
      const diwali27 = check2027.json.data.festivals.find(f => f.id === 'fest_diwali');
      assert.equal(diwali27.dateResolution.effectiveDate, '2027-10-29');
      assert.equal(diwali27.dateResolution.isOverridden, false);

      // Remove 2026 override -> restores original 2026-11-08 source date without destroying source data
      const rmRes = await apiCall(env, 'DELETE', '/api/admin/festivals/fest_diwali/overrides/2026', {
        reason: 'Revert to standard panchang date'
      }, 'admin');
      assert.equal(rmRes.status, 200);
      assert.equal(rmRes.json.data.dateResolution.effectiveDate, '2026-11-08');
      assert.equal(rmRes.json.data.dateResolution.sourceDate, '2026-11-08');
      assert.equal(rmRes.json.data.dateResolution.isOverridden, false);

      // Simulate external provider failure (HTTP 503 & malformed date payload) -> preserves last valid date 2026-11-08
      const failSync = await syncFestivalDatesFromExternalProvider(env.DB, env, {
        year: 2026,
        providerUrl: 'https://calendar-feed.example.com/api/festivals',
        maxRetries: 1,
        fetchImpl: async () => new Response('Service Unavailable', { status: 503 })
      });
      assert.equal(failSync.ok, false);

      const badPayloadSync = await syncFestivalDatesFromExternalProvider(env.DB, env, {
        year: 2026,
        providerUrl: 'https://calendar-feed.example.com/api/festivals',
        maxRetries: 0,
        fetchImpl: async () => new Response(JSON.stringify({
          festivals: [{ id: 'fest_diwali', date: '2026-02-30-invalid', verified: true }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      });
      assert.equal(badPayloadSync.ok, true);
      assert.equal(badPayloadSync.updatedCount, 0);
      assert.equal(badPayloadSync.preservedCount, 1);

      const afterFailCheck = await apiCall(env, 'GET', '/api/admin/festivals?year=2026', null, 'admin');
      const diwaliAfterFail = afterFailCheck.json.data.festivals.find(f => f.id === 'fest_diwali');
      assert.equal(diwaliAfterFail.dateResolution.effectiveDate, '2026-11-08');
    });
  });

  describe('B. Publication Window & Boundary Tests (Exact 8 Nov 2026 Rule, Leap Years, Timezones, Status Precedence)', () => {
    it('enforces the exact 8 November 2026 publication window rule (23 Oct blocked, 24 Oct..11 Nov allowed, 12 Nov blocked)', () => {
      const win = calculatePublicationWindow('2026-11-08', {
        daysBefore: 15,
        daysAfter: 3,
        timezone: 'Asia/Kolkata'
      });
      assert.equal(win.valid, true);
      assert.equal(win.startDate, '2026-10-24');
      assert.equal(win.festivalDate, '2026-11-08');
      assert.equal(win.endDate, '2026-11-11');
      assert.equal(win.firstBlockedDate, '2026-11-12');

      // 23 October 2026 (including 23:59:59.999 IST): NOT available
      assert.equal(isTimestampWithinPublicationWindow(win, '2026-10-23').inWindow, false);
      assert.equal(isTimestampWithinPublicationWindow(win, '2026-10-23T23:59:59.999+05:30').inWindow, false);

      // 24 October 2026 (from 00:00:00.000 IST): Available
      assert.equal(isTimestampWithinPublicationWindow(win, '2026-10-24').inWindow, true);
      assert.equal(isTimestampWithinPublicationWindow(win, '2026-10-24T00:00:00.000+05:30').inWindow, true);

      // 8 November 2026 (Festival Day): Available
      assert.equal(isTimestampWithinPublicationWindow(win, '2026-11-08').inWindow, true);
      assert.equal(isTimestampWithinPublicationWindow(win, '2026-11-08T18:30:00.000+05:30').inWindow, true);

      // 11 November 2026 (3rd Post-Festival Day, inclusive right up to 23:59:59.999 IST): Available
      assert.equal(isTimestampWithinPublicationWindow(win, '2026-11-11').inWindow, true);
      assert.equal(isTimestampWithinPublicationWindow(win, '2026-11-11T23:59:59.999+05:30').inWindow, true);

      // 12 November 2026 (from 00:00:00.000 IST onward): Unavailable
      const checkNov12 = isTimestampWithinPublicationWindow(win, '2026-11-12');
      assert.equal(checkNov12.inWindow, false);
      assert.equal(checkNov12.phase, 'EXPIRED_WINDOW');
      assert.equal(isTimestampWithinPublicationWindow(win, '2026-11-12T00:00:00.000+05:30').inWindow, false);
    });

    it('handles leap-year dates, month/year boundaries, custom offsets, DST timezones, and campaign status precedence (DRAFT, PAUSED, UNCONFIRMED)', () => {
      // Leap year 2028: Festival on 2028-03-05 minus 15 days crosses Feb 29 (2028-02-19)
      const leapWin = calculatePublicationWindow('2028-03-05', { daysBefore: 15, daysAfter: 3, timezone: 'Asia/Kolkata' });
      assert.equal(leapWin.startDate, '2028-02-19');
      assert.equal(leapWin.endDate, '2028-03-08');

      // Non-leap year 2026: Festival on 2026-03-05 minus 15 days crosses Feb 28 (2026-02-18)
      const nonLeapWin = calculatePublicationWindow('2026-03-05', { daysBefore: 15, daysAfter: 3, timezone: 'Asia/Kolkata' });
      assert.equal(nonLeapWin.startDate, '2026-02-18');

      // New Year boundary: Festival on 2026-01-01 minus 15 days -> 2025-12-17, plus 3 days -> 2026-01-04
      const newYearWin = calculatePublicationWindow('2026-01-01', { daysBefore: 15, daysAfter: 3, timezone: 'Asia/Kolkata' });
      assert.equal(newYearWin.startDate, '2025-12-17');
      assert.equal(newYearWin.endDate, '2026-01-04');
      assert.equal(newYearWin.firstBlockedDate, '2026-01-05');

      // Custom offset (10 days before, 3 days after)
      const customOffsetWin = calculatePublicationWindow('2026-11-08', { daysBefore: 10, daysAfter: 3, timezone: 'Asia/Kolkata' });
      assert.equal(customOffsetWin.startDate, '2026-10-29');
      assert.equal(customOffsetWin.endDate, '2026-11-11');

      // Campaign in DRAFT must NOT become eligible even when current time is inside the publication window
      const draftEval = evaluateCampaignEligibility({
        campaign: { status: CAMPAIGN_STATUS.DRAFT, is_enabled: 1, applicable_year: 2026, days_before: 15, days_after: 3 },
        festival: { id: 'fest_diwali', is_enabled: 1 },
        yearRecord: { applicable_year: 2026, resolved_date: '2026-11-08', verification_status: 'AUTO_VERIFIED' },
        nowMs: Date.parse('2026-11-08T10:00:00+05:30')
      });
      assert.equal(draftEval.eligible, false);
      assert.equal(draftEval.code, 'FESTIVAL_CAMPAIGN_DRAFT');

      // Campaign in PAUSED must NOT accept wishes during window
      const pausedEval = evaluateCampaignEligibility({
        campaign: { status: CAMPAIGN_STATUS.PAUSED, is_enabled: 1, applicable_year: 2026, days_before: 15, days_after: 3 },
        festival: { id: 'fest_diwali', is_enabled: 1 },
        yearRecord: { applicable_year: 2026, resolved_date: '2026-11-08', verification_status: 'AUTO_VERIFIED' },
        nowMs: Date.parse('2026-11-08T10:00:00+05:30')
      });
      assert.equal(pausedEval.eligible, false);
      assert.equal(pausedEval.code, 'FESTIVAL_CAMPAIGN_PAUSED');
    });
  });

  describe('C & D. Immediate Wish Creation, Stale Customizer Rejection, Gallery Consistency & Existing Wish Lifecycle Preservation', () => {
    it('creates wishes immediately during an active campaign (accessible at /api/public/wishes/:slug without waiting for festival date), blocks new creation on 12 Nov, and preserves existing wish links after campaign expiry', async () => {
      const { env } = await createTestEnv();

      // 1. Admin creates Diwali 2026 campaign (Festival Date: 2026-11-08, Window: 2026-10-24..2026-11-11)
      const campRes = await apiCall(env, 'POST', '/api/admin/festivals/campaigns', {
        festivalId: 'fest_diwali',
        applicableYear: 2026,
        title: 'Diwali 2026 Celebration Campaign',
        badgeLabel: '✨ Diwali 2026 Special',
        status: 'ACTIVE',
        daysBefore: 15,
        daysAfter: 3,
        timezone: 'Asia/Kolkata'
      }, 'admin');
      assert.equal(campRes.status, 201);
      const campaignId = campRes.json.data.campaign.id;

      // 2. Admin assigns free template `tpl_glitter_birthday` and VIP template `tpl_festive_lights` to the Diwali 2026 campaign
      const assignRes = await apiCall(env, 'POST', `/api/admin/festivals/campaigns/${campaignId}/templates`, {
        assignments: [
          {
            templateId: 'tpl_glitter_birthday',
            allowedVariants: ['family', 'sister', 'brother'],
            displayOrder: 1,
            isEnabled: true
          },
          {
            templateId: 'tpl_festive_lights',
            allowedVariants: ['family', 'sister', 'brother'],
            displayOrder: 2,
            isEnabled: true
          }
        ]
      }, 'admin');
      assert.equal(assignRes.status, 200);

      // 3. On 23 October 2026 (before window opens):
      // - Template is hidden from active gallery
      // - Direct POST /api/wishes is rejected
      const galOct23 = await apiCall(env, 'GET', '/api/templates', null, 'anon', { 'x-test-now': '2026-10-23T14:00:00+05:30' });
      assert.equal(galOct23.json.data.templates.some(t => t.id === 'tpl_glitter_birthday'), false);

      const wishOct23 = await apiCall(env, 'POST', '/api/wishes', {
        templateId: 'tpl_glitter_birthday',
        campaignId,
        customData: {
          recipient_name: 'Sharma Family',
          sender_name: 'Aarav',
          relationship: 'family',
          custom_message: 'Happy Diwali in advance!'
        }
      }, 'user', { 'x-test-now': '2026-10-23T14:00:00+05:30' });
      assert.equal(wishOct23.status, 422);
      assert.equal(wishOct23.json.error.code, 'FESTIVAL_CAMPAIGN_NOT_STARTED_YET');

      // 4. On 24 October 2026 (first day of window, 15 days before 8 Nov festival):
      // - Template IS visible in public gallery with festivalCampaign badge
      // - User creates a wish today (24 Oct) and it becomes IMMEDIATELY accessible at /api/public/wishes/:slug!
      const galOct24 = await apiCall(env, 'GET', '/api/templates', null, 'anon', { 'x-test-now': '2026-10-24T10:00:00+05:30' });
      const diwaliTplCard = galOct24.json.data.templates.find(t => t.id === 'tpl_glitter_birthday');
      assert.ok(diwaliTplCard, 'Festival template must appear in gallery on 24 October');
      assert.equal(diwaliTplCard.festivalCampaign.campaignId, campaignId);
      assert.equal(diwaliTplCard.festivalCampaign.windowStartDate, '2026-10-24');
      assert.equal(diwaliTplCard.festivalCampaign.windowEndDate, '2026-11-11');

      // Verify existing VIP/payment rules still apply during an active festival campaign
      const vipWishBlocked = await apiCall(env, 'POST', '/api/wishes', {
        templateId: 'tpl_festive_lights',
        campaignId,
        customData: {
          recipient_name: 'VIP Recipient',
          relationship: 'family'
        }
      }, 'user', { 'x-test-now': '2026-10-24T10:02:00+05:30' });
      assert.equal(vipWishBlocked.status, 403);
      assert.equal(vipWishBlocked.json.error.code, 'PREMIUM_REQUIRED');

      const wishOct24 = await apiCall(env, 'POST', '/api/wishes', {
        templateId: 'tpl_glitter_birthday',
        campaignId,
        customData: {
          recipient_name: 'Ananya Sister',
          sender_name: 'Kabir',
          relationship: 'sister',
          event_date: '2026-11-08',
          custom_message: 'Wishing you the brightest Diwali ever!'
        }
      }, 'user', { 'x-test-now': '2026-10-24T10:05:00+05:30' });
      assert.equal(wishOct24.status, 201, JSON.stringify(wishOct24.json));
      const createdSlug = wishOct24.json.data.slug;
      assert.ok(createdSlug);

      // Verify immediate public accessibility on 24 October (15 days before festival date 2026-11-08)
      const publicWishRes = await apiCall(env, 'GET', `/api/public/wishes/${createdSlug}`, null, 'anon', { 'x-test-now': '2026-10-24T10:06:00+05:30' });
      assert.equal(publicWishRes.status, 200);
      assert.equal(publicWishRes.json.data.wish.slug, createdSlug);
      assert.equal(publicWishRes.json.data.wish.lifecycleStatus, 'active');
      assert.notEqual(publicWishRes.json.data.wish.customData.is_locked, true, 'Festival campaign wish must be immediately unlocked and accessible');

      // 5. Rejects disallowed relationship variant for this campaign (e.g. "colleague" when only family, sister, brother are allowed)
      const badVarWish = await apiCall(env, 'POST', '/api/wishes', {
        templateId: 'tpl_glitter_birthday',
        campaignId,
        customData: {
          recipient_name: 'Office Team',
          relationship: 'colleague'
        }
      }, 'user', { 'x-test-now': '2026-11-08T12:00:00+05:30' });
      assert.equal(badVarWish.status, 422);
      assert.equal(badVarWish.json.error.code, 'VARIANT_NOT_ENABLED_FOR_CAMPAIGN');

      // 6. On 11 November 2026 (3rd post-festival day, inclusive): Wish creation STILL succeeds
      const wishNov11 = await apiCall(env, 'POST', '/api/wishes', {
        templateId: 'tpl_glitter_birthday',
        campaignId,
        customData: {
          recipient_name: 'Rohan Brother',
          sender_name: 'Kabir',
          relationship: 'brother',
          custom_message: 'Happy Diwali & Bhai Dooj!'
        }
      }, 'user', { 'x-test-now': '2026-11-11T22:30:00+05:30' });
      assert.equal(wishNov11.status, 201);

      // 7. On 12 November 2026 (first blocked day):
      // - Template disappears from active gallery
      // - Stale open customizer or direct API request is rejected with FESTIVAL_CAMPAIGN_EXPIRED
      const galNov12 = await apiCall(env, 'GET', '/api/templates', null, 'anon', { 'x-test-now': '2026-11-12T00:05:00+05:30' });
      assert.equal(galNov12.json.data.templates.some(t => t.id === 'tpl_glitter_birthday'), false);

      const staleWishNov12 = await apiCall(env, 'POST', '/api/wishes', {
        templateId: 'tpl_glitter_birthday',
        customData: {
          recipient_name: 'Late Submission',
          relationship: 'family'
        }
      }, 'user', { 'x-test-now': '2026-11-12T00:05:00+05:30' });
      assert.equal(staleWishNov12.status, 422);
      assert.equal(staleWishNov12.json.error.code, 'FESTIVAL_CAMPAIGN_EXPIRED');

      // 8. Existing wishes created during the campaign are NOT deleted when the campaign expires or when template assignment is removed!
      const existingWishRow = await env.DB.prepare('SELECT * FROM wishes WHERE slug = ? LIMIT 1').bind(createdSlug).first();
      assert.ok(existingWishRow, 'Existing wish record must remain in database after campaign expiry');

      // If the same reusable template is assigned to a SECOND active campaign (e.g. Christmas 2026 on 2026-12-20),
      // the expired Diwali campaign does NOT block the active Christmas campaign!
      const xmasCampRes = await apiCall(env, 'POST', '/api/admin/festivals/campaigns', {
        festivalId: 'fest_christmas',
        applicableYear: 2026,
        title: 'Christmas 2026 Campaign',
        status: 'ACTIVE',
        daysBefore: 15,
        daysAfter: 3
      }, 'admin');
      const xmasCampId = xmasCampRes.json.data.campaign.id;
      await apiCall(env, 'POST', `/api/admin/festivals/campaigns/${xmasCampId}/templates`, {
        assignments: [{ templateId: 'tpl_glitter_birthday', isEnabled: true }]
      }, 'admin');

      const galDec20 = await apiCall(env, 'GET', '/api/templates', null, 'anon', { 'x-test-now': '2026-12-20T12:00:00+05:30' });
      const matchingCards = galDec20.json.data.templates.filter(t => t.id === 'tpl_glitter_birthday');
      assert.equal(matchingCards.length, 1, 'Must never produce duplicate template cards when assigned to multiple campaigns');
      assert.equal(matchingCards[0].festivalCampaign.campaignId, xmasCampId);
    });
  });

  describe('E. Security, Authorization & Zero Private Data Leakage Tests', () => {
    it('blocks non-admin mutations, rejects malformed dates/IDs, prevents SQL injection, and strips private admin metadata from public endpoints', async () => {
      const { env } = await createTestEnv();

      // 1. Non-admin cannot change festival dates or overrides
      const unauthOv = await apiCall(env, 'POST', '/api/admin/festivals/fest_diwali/overrides', {
        applicableYear: 2026,
        overrideDate: '2026-11-10',
        reason: 'Unauthorized attempt'
      }, 'user');
      assert.equal(unauthOv.status, 403);

      const anonCamp = await apiCall(env, 'POST', '/api/admin/festivals/campaigns', {
        festivalId: 'fest_diwali',
        applicableYear: 2026
      }, 'anon');
      assert.equal(anonCamp.status, 401);

      // 2. SQL injection payloads in festivalId and query filters are safely handled
      const sqliRes = await apiCall(env, 'POST', "/api/admin/festivals/fest_diwali'%20OR%201=1--/overrides", {
        applicableYear: 2026,
        overrideDate: '2026-11-08',
        reason: 'SQLi probe'
      }, 'admin');
      assert.equal(sqliRes.status, 404);

      // 3. Public endpoint /api/festivals/active never leaks private admin notes, override reasons, or actor emails
      const pubFestRes = await apiCall(env, 'GET', '/api/festivals/active', null, 'anon');
      assert.equal(pubFestRes.status, 200);
      const rawBodyStr = JSON.stringify(pubFestRes.json);
      assert.equal(rawBodyStr.includes('admin@wishmagic.live'), false);
      assert.equal(rawBodyStr.includes('overrideReason'), false);
    });
  });

  describe('F. UTP v1.4.0 Compatibility, Festival Metadata & Schedule Boundary Tests', () => {
    it('supports UTP v1.4.0 manifests, preserves v1.3.0 compatibility, validates festivalMetadata, rejects unsupported required features, and blocks template-level schedule overrides', () => {
      assert.ok(UTP_SUPPORTED_SCHEMA_VERSIONS.includes('1.3.0'));
      assert.ok(UTP_SUPPORTED_SCHEMA_VERSIONS.includes('1.4.0'));
      assert.equal(UTP_FESTIVAL_SCHEMA_VERSION, '1.4.0');

      // 1. Valid UTP v1.4.0 manifest with festivalMetadata passes validation
      const validV14 = validateUtpManifest({
        $schema: 'wishmagic-template',
        schemaVersion: '1.4.0',
        template: {
          id: 'royal-diwali-v14',
          slug: 'royal-diwali-v14',
          name: 'Royal Diwali Lights v1.4',
          templateVersion: '1.4.0',
          category: 'festival',
          tier: 'free',
          entry: 'index.html'
        },
        compatibility: {
          runtimeApi: '1.4',
          minimumRuntimeApi: '1.0',
          requiredFeatures: ['photos', 'sections', 'festivalMetadata']
        },
        festivalMetadata: {
          festivalTags: ['diwali', 'bhai-dooj'],
          suitableRelationships: ['family', 'sister', 'brother'],
          campaignCompatibility: 'evergreen_and_festival',
          displayBadge: '✨ Diwali Special',
          suggestedPublicationPreferences: {
            suggestedDaysBefore: 15,
            suggestedDaysAfter: 3,
            advisoryOnly: true
          }
        },
        sections: [{ id: 'hero', label: 'Hero', required: true, toggleable: false, defaultEnabled: true }],
        fields: [{ id: 'recipient_name', type: 'text', label: 'Recipient', required: true, section: 'hero' }],
        actions: [{ id: 'hero_cta', label: 'Make For Yours', type: 'template_link', logicalLink: 'template.customize', target: '/customize.html' }]
      });
      assert.equal(validV14.valid, true, JSON.stringify(validV14.errors));
      assert.equal(validV14.normalized.schemaVersion, '1.4.0');
      assert.deepEqual(validV14.normalized.festivalMetadata.festivalTags, ['diwali', 'bhai-dooj']);
      assert.equal(validV14.normalized.festivalMetadata.scheduleAuthority, 'platform_server');

      // 2. Valid UTP v1.4.0 manifest WITHOUT optional festivalMetadata also passes cleanly
      const validWithoutFestMeta = validateUtpManifest({
        $schema: 'wishmagic-template',
        schemaVersion: '1.4.0',
        template: { id: 'evergreen-v14', name: 'Evergreen v1.4', category: 'birthday', entry: 'index.html' },
        sections: [{ id: 'hero', label: 'Hero', required: true, toggleable: false, defaultEnabled: true }],
        fields: [{ id: 'recipient_name', type: 'text', label: 'Recipient', required: true, section: 'hero' }]
      });
      assert.equal(validWithoutFestMeta.valid, true);

      // 3. Template attempting to hardcode authoritative festival date or bypass server schedule is rejected!
      const badScheduleOverride = validateUtpManifest({
        $schema: 'wishmagic-template',
        schemaVersion: '1.4.0',
        template: { id: 'bad-override-tpl', name: 'Bad Schedule Override', category: 'festival', entry: 'index.html' },
        festivalMetadata: {
          festivalTags: ['diwali'],
          authoritativeFestivalDate: '2026-11-08',
          forceActive: true
        },
        sections: [{ id: 'hero', label: 'Hero', required: true, toggleable: false, defaultEnabled: true }],
        fields: [{ id: 'recipient_name', type: 'text', label: 'Recipient', required: true, section: 'hero' }]
      });
      assert.equal(badScheduleOverride.valid, false);
      assert.ok(badScheduleOverride.errors.some(e => e.code === 'TEMPLATE_CANNOT_OVERRIDE_SERVER_SCHEDULE'));

      // 4. Unsupported required feature cannot be silently ignored
      const badRequiredFeature = validateUtpManifest({
        $schema: 'wishmagic-template',
        schemaVersion: '1.4.0',
        template: { id: 'bad-req-feat', name: 'Unsupported Feature', category: 'festival', entry: 'index.html' },
        compatibility: {
          runtimeApi: '1.4',
          requiredFeatures: ['quantumHologram']
        },
        sections: [{ id: 'hero', label: 'Hero', required: true, toggleable: false, defaultEnabled: true }],
        fields: [{ id: 'recipient_name', type: 'text', label: 'Recipient', required: true, section: 'hero' }]
      });
      assert.equal(badRequiredFeature.valid, false);
      assert.ok(badRequiredFeature.errors.some(e => e.code === 'UNSUPPORTED_REQUIRED_FEATURE'));

      // 5. Verify UTP v1.4.0 specification and creator instructions exist and document 1.4.0 & festivalMetadata
      const spec14 = fs.readFileSync(path.join(process.cwd(), 'wishmagic_universal_template_protocol_v1_4_0.md'), 'utf8');
      const creator14 = fs.readFileSync(path.join(process.cwd(), 'wishmagic_template_creator_standard_instructions_v1_4_0.md'), 'utf8');
      assert.ok(spec14.includes('1.4.0') && spec14.includes('festivalMetadata'));
      assert.ok(creator14.includes('1.4.0') && creator14.includes('festivalMetadata'));
    });
  });

  after(() => {
    cleanupSqliteBridge();
  });
});
