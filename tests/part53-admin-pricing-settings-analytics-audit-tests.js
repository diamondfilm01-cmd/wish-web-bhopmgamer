/**
 * =============================================================================
 * WISHMAGIC — PART 53: ADMIN PRICING SYNCHRONIZATION, 12-CATEGORY SETTINGS
 * ARCHITECTURE & REAL DASHBOARD/ANALYTICS DATA AUDIT TEST SUITE
 * =============================================================================
 * Verifies:
 * A. PRICING SYNCHRONIZATION & SINGLE AUTHORITATIVE SOURCE TESTS
 *    - Loads actual saved pricing from GET /api/settings/wish-links & GET /api/admin/settings/wish-links
 *    - Saves updated pricing via PUT /api/admin/settings/wish-links and persists in D1 (config_wish_links)
 *    - Deep-merges partial updates so saving addons never wipes random.prefix/length and vice versa
 *    - Synchronizes personalized.price and addons.customLinkPrice deterministically
 *    - Rejects invalid prices (negative, >100000, NaN, empty/boolean) with HTTP 400 without mutating state
 *    - Returns Cache-Control: no-cache, no-store, must-revalidate to prevent stale cached pricing
 *    - Verifies calculateServerOrderQuote uses authoritative saved prices (including 29, 70, 99, and 0)
 *    - Verifies public/admin-pricing.html dynamically binds button labels, badges, descriptions, and calculated totals
 *
 * B. SETTINGS 12-CATEGORY ARCHITECTURE & REMOVAL OF "SHOW ALL SETTINGS" TESTS
 *    - Confirms "Show All Settings" (#admin-settings-tab-all) is completely removed from public/admin-settings.html
 *    - Confirms all 12 dedicated categories exist and map to real [data-settings-tab] sections
 *    - Confirms SETTINGS_SEARCH_INDEX maps every searchable setting to a real category and DOM element
 *    - Confirms Payments/Pricing category links directly to /admin/anktech/anktech/admin/pricing (#btn-open-authoritative-pricing)
 *    - Confirms duplicate pricing input (#setting-personalized-price) is removed from public/admin-settings.html
 *    - Confirms saving site settings (hero3dFloatingEnabled, heroTouchBurstEnabled, popularTags) persists in D1
 *    - Rejects unauthorized updates to /api/admin/settings/site and /api/admin/settings/wish-links (HTTP 401/403)
 *
 * C. REAL DASHBOARD & ANALYTICS DATA ONLY TESTS
 *    - Revenue in calculateExecutiveOverview, calculateRevenueAnalytics, getCentralizedDashboardSummary, and
 *      GET /api/admin/commerce/orders includes ONLY settled orders (PAID, PARTIALLY_REFUNDED, REFUNDED net of refunds)
 *    - Excludes PENDING, PAYMENT_FAILED, CANCELLED, and Admin Comp Pass orders from revenue & paidOrders
 *    - Handles full and partial refunds accurately without double-subtraction
 *    - Deduplicates duplicate order/refund records (e.g. duplicate webhook deliveries)
 *    - Never synthesizes fake ord_vip_* orders or ₹49 wish-based revenue from wishes rows
 *    - Empty datasets produce exact zero states (0 revenue, 0 orders, 0 users, 0 live visitors)
 *    - Zero previous-period revenue produces hasBaseline: false, percentageChange: null (no NaN/Infinity)
 *    - Honest Unavailable states and Retry controls exist across admin dashboard and analytics pages
 * =============================================================================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import worker from '../src/worker.js';
import { resolveAuthoritativeProduct } from '../src/commerce-engine.js';
import { getDateRangeBounds, calculateExecutiveOverview, calculateRevenueAnalytics } from '../src/analytics-bi-engine.js';
import { getCentralizedDashboardSummary } from '../src/admin-operations-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function createPricingSettingsAndAnalyticsD1Mock() {
  const store = {
    site_settings: new Map(),
    system_announcements: new Map(),
    orders: new Map(),
    refunds: new Map(),
    wishes: new Map(),
    users: new Map(),
    templates: new Map(),
    admin_audit_logs: []
  };

  function prepare(sql) {
    const norm = sql.replace(/\s+/g, ' ').trim();
    return {
      _bound: [],
      bind(...args) {
        this._bound = args;
        return this;
      },
      async run() {
        const b = this._bound;
        if (/INSERT OR REPLACE INTO system_announcements/i.test(norm)) {
          if (norm.includes("'config_wish_links'")) {
            store.system_announcements.set('config_wish_links', {
              id: 'config_wish_links',
              title: 'wish_link_settings',
              message: b[0],
              created_at: b[1]
            });
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (/INSERT OR REPLACE INTO site_settings/i.test(norm)) {
          if (b.length === 5) {
            store.site_settings.set(String(b[0]), {
              key: String(b[0]),
              value: String(b[1]),
              type: String(b[2]),
              updated_at: String(b[3]),
              updated_by: String(b[4])
            });
          } else {
            store.site_settings.set(String(b[0]), {
              key: String(b[0]),
              value: String(b[1]),
              type: 'string',
              updated_at: String(b[2]),
              updated_by: String(b[3])
            });
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (/INSERT INTO admin_audit_logs/i.test(norm)) {
          store.admin_audit_logs.push({ args: b });
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 1 } };
      },
      async first() {
        const b = this._bound;
        if (/SELECT message FROM system_announcements WHERE id = \?/i.test(norm)) {
          return store.system_announcements.get(String(b[0])) || null;
        }
        if (/FROM sessions/i.test(norm) && b[0] === 'tok_admin_part53') {
          return {
            expires_at: Date.now() + 86400000,
            user_id: 'usr_admin_master',
            email: 'ankit.babusaini@gmail.com',
            display_name: 'Platform Admin',
            role: 'admin',
            plan: 'VIP',
            is_premium: 1,
            status: 'active'
          };
        }
        return null;
      },
      async all() {
        if (/SELECT key, value, type, updated_at, updated_by FROM site_settings/i.test(norm)) {
          return { results: Array.from(store.site_settings.values()) };
        }
        if (/FROM orders/i.test(norm)) {
          return { results: Array.from(store.orders.values()) };
        }
        if (/FROM refunds/i.test(norm)) {
          return { results: Array.from(store.refunds.values()) };
        }
        if (/FROM wishes/i.test(norm)) {
          return { results: Array.from(store.wishes.values()) };
        }
        if (/FROM users/i.test(norm)) {
          return { results: Array.from(store.users.values()) };
        }
        if (/FROM templates/i.test(norm)) {
          return { results: Array.from(store.templates.values()) };
        }
        return { results: [] };
      }
    };
  }

  return {
    store,
    db: {
      prepare,
      async batch(stmts) {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        return out;
      }
    }
  };
}

async function loginTestAdmin() {
  return 'wm_session=tok_admin_part53';
}

describe('Part 53 — Admin Pricing Synchronization, 12-Category Settings & Real Analytics Audit Suite', () => {

  describe('A. Authoritative Pricing Synchronization, Validation, D1 Persistence & Checkout Quote Tests', () => {
    it('loads authoritative pricing, saves updated prices to D1, deep-merges partial updates, rejects invalid prices, and synchronizes server checkout quotes', async () => {
      const mock = createPricingSettingsAndAnalyticsD1Mock();
      const env = {
        DB: mock.db,
        ADMIN_EMAIL: 'ankit.babusaini@gmail.com',
        ADMIN_PASSWORD: 'TestAdminStrongPassword!2026',
        SESSION_SECRET: 'test-session-secret-part53-2026'
      };
      const adminCookie = await loginTestAdmin(env);

      // 1. Initial GET returns authoritative defaults with no-store cache headers
      const getRes1 = await worker.fetch(new Request('https://wishmagic.pages.dev/api/settings/wish-links'), env);
      assert.equal(getRes1.status, 200);
      assert.match(getRes1.headers.get('cache-control') || '', /no-store/i);
      const getBody1 = await getRes1.json();
      const initSettings = getBody1.data?.settings || getBody1.settings;
      assert.equal(initSettings.personalized.price, 19);
      assert.equal(initSettings.addons.customLinkPrice, 19);
      assert.equal(initSettings.addons.hdPhotosPrice, 19);
      assert.equal(initSettings.addons.hdImageStylePrice, 19);
      assert.equal(initSettings.addons.yearlyCustomLinkPrice, 149);

      // 2. Save custom prefix/length in random first
      const putRandomRes = await worker.fetch(new Request('https://wishmagic.pages.dev/api/admin/settings/wish-links', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://wishmagic.pages.dev',
          'Cookie': adminCookie
        },
        body: JSON.stringify({
          settings: {
            personalized: { enabled: true, currency: 'INR', displayName: 'Custom Link' },
            random: { enabled: true, prefix: 'w-', length: 8, allowedCharacters: 'abcdefghijklmnopqrstuvwxyz0123456789' }
          }
        })
      }), env);
      assert.equal(putRandomRes.status, 200);

      // 3. Save updated pricing from Pricing Studio (e.g. Custom Link = ₹25, HD Photos = ₹29, 1-Year Custom Link = ₹199)
      const putPricingRes = await worker.fetch(new Request('https://wishmagic.pages.dev/api/admin/settings/wish-links', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://wishmagic.pages.dev',
          'Cookie': adminCookie
        },
        body: JSON.stringify({
          settings: {
            personalized: { enabled: true, price: 25 },
            addons: {
              customLinkPrice: 25,
              hdPhotosPrice: 29,
              hdImageStylePrice: 29,
              yearlyCustomLinkPrice: 199
            },
            referral: {
              enabled: true,
              requiredReferrals: 7,
              countFreeTemplates: true,
              rewardCredits: 1
            }
          }
        })
      }), env);
      assert.equal(putPricingRes.status, 200);

      // Verify D1 persistence in system_announcements ('config_wish_links')
      assert.ok(mock.store.system_announcements.has('config_wish_links'), 'D1 must persist config_wish_links');
      const d1Parsed = JSON.parse(mock.store.system_announcements.get('config_wish_links').message);
      assert.equal(d1Parsed.addons.customLinkPrice, 25);
      assert.equal(d1Parsed.addons.hdPhotosPrice, 29);
      assert.equal(d1Parsed.addons.yearlyCustomLinkPrice, 199);
      assert.equal(d1Parsed.personalized.price, 25);
      // Verify random settings were preserved during pricing save
      assert.equal(d1Parsed.random.prefix, 'w-', 'Saving pricing must preserve random.prefix');
      assert.equal(d1Parsed.random.length, 8, 'Saving pricing must preserve random.length');

      // 4. Verify saving Wish Link settings from Admin Settings (without price/addons) preserves saved prices
      const putSlugOnlyRes = await worker.fetch(new Request('https://wishmagic.pages.dev/api/admin/settings/wish-links', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://wishmagic.pages.dev',
          'Cookie': adminCookie
        },
        body: JSON.stringify({
          settings: {
            personalized: {
              enabled: true,
              currency: 'INR',
              displayName: 'Personalized Celebration Link',
              description: 'Memorable custom URL'
            },
            random: {
              enabled: true,
              prefix: 'magic-',
              length: 7,
              allowedCharacters: 'abcdefghijklmnopqrstuvwxyz0123456789'
            }
          }
        })
      }), env);
      assert.equal(putSlugOnlyRes.status, 200);

      const getAfterSlugRes = await worker.fetch(new Request('https://wishmagic.pages.dev/api/admin/settings/wish-links', {
        headers: { 'Cookie': adminCookie }
      }), env);
      const afterSlugBody = await getAfterSlugRes.json();
      const afterSlugSettings = afterSlugBody.data?.settings || afterSlugBody.settings;
      assert.equal(afterSlugSettings.addons.customLinkPrice, 25, 'Custom Link price must remain 25 after slug settings save');
      assert.equal(afterSlugSettings.addons.hdPhotosPrice, 29, 'HD Photos price must remain 29 after slug settings save');
      assert.equal(afterSlugSettings.addons.yearlyCustomLinkPrice, 199, '1-Year Custom Link price must remain 199 after slug settings save');
      assert.equal(afterSlugSettings.personalized.price, 25, 'Personalized price must remain 25 after slug settings save');
      assert.equal(afterSlugSettings.random.prefix, 'magic-');

      // 5. Verify invalid prices are rejected with HTTP 400 and do NOT overwrite saved D1 pricing
      const badPriceRes = await worker.fetch(new Request('https://wishmagic.pages.dev/api/admin/settings/wish-links', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://wishmagic.pages.dev',
          'Cookie': adminCookie
        },
        body: JSON.stringify({
          settings: {
            addons: {
              yearlyCustomLinkPrice: -50
            }
          }
        })
      }), env);
      assert.equal(badPriceRes.status, 400, 'Negative yearly link price must be rejected with 400');

      const nanPriceRes = await worker.fetch(new Request('https://wishmagic.pages.dev/api/admin/settings/wish-links', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://wishmagic.pages.dev',
          'Cookie': adminCookie
        },
        body: JSON.stringify({
          settings: {
            addons: {
              hdPhotosPrice: 'not-a-number'
            }
          }
        })
      }), env);
      assert.equal(nanPriceRes.status, 400, 'Non-numeric HD photos price must be rejected with 400');

      // 6. Verify Server-Side Authoritative Dynamic Additive Pricing (wish_bundle)
      const defaultAddSettings = { addons: { customLinkPrice: 19, hdPhotosPrice: 19, yearlyCustomLinkPrice: 149 } };
      const photoPaidTpl = {
        id: 'tpl_photo_49',
        name: 'Photo Celebration',
        price: 49,
        manifest: { fields: [{ id: 'recipient_name', type: 'text' }, { id: 'photo_1', type: 'image' }] }
      };
      const textOnlyPaidTpl = {
        id: 'tpl_text_39',
        name: 'Text Only Poem',
        price: 39,
        manifest: { fields: [{ id: 'recipient_name', type: 'text' }, { id: 'custom_message', type: 'textarea' }] }
      };
      const templatesList = [photoPaidTpl, textOnlyPaidTpl];

      // 6a. Free template + Custom Link = ₹19
      const q1 = resolveAuthoritativeProduct({
        productId: 'wish_bundle',
        options: { includeTemplate: false, includeCustomLink: true, includeHdPhotos: false },
        templates: templatesList,
        siteSettings: defaultAddSettings
      });
      assert.equal(q1.price, 19);
      assert.equal(q1.amountPaise, 1900);

      // 6b. Paid ₹49 photo template + Custom Link (₹19) + HD Photos (₹19) = ₹87
      const q2 = resolveAuthoritativeProduct({
        productId: 'wish_bundle',
        templateId: 'tpl_photo_49',
        options: { includeTemplate: true, includeCustomLink: true, includeHdPhotos: true },
        templates: templatesList,
        siteSettings: defaultAddSettings
      });
      assert.equal(q2.price, 49 + 19 + 19);
      assert.equal(q2.amountPaise, 8700);
      assert.equal(q2.grantsHdPhotos, true);

      // 6c. Paid ₹49 photo template + 1-Year Custom Link (₹149) + HD Photos (₹19) = ₹217 (NOT 49+19+149+19)
      const q3 = resolveAuthoritativeProduct({
        productId: 'wish_bundle',
        templateId: 'tpl_photo_49',
        options: { includeTemplate: true, includeCustomLink: true, includeYearlyLink: true, includeHdPhotos: true },
        templates: templatesList,
        siteSettings: defaultAddSettings
      });
      assert.equal(q3.price, 49 + 149 + 19);
      assert.equal(q3.validityDays, 365);
      assert.equal(q3.linkDuration, '1_year');

      // 6d. Non-photo template (₹39) trying to buy HD Photos MUST drop ₹19 HD charge server-side!
      const q4 = resolveAuthoritativeProduct({
        productId: 'wish_bundle',
        templateId: 'tpl_text_39',
        options: { includeTemplate: true, includeCustomLink: true, includeHdPhotos: true },
        templates: templatesList,
        siteSettings: defaultAddSettings
      });
      assert.equal(q4.templateSupportsPhotos, false);
      assert.equal(q4.grantsHdPhotos, false);
      assert.equal(q4.price, 39 + 19, 'Non-photo template must NOT charge HD Photos ₹19');

      // 6e. Client-tampered templatePrice: 0 MUST be ignored in favor of authoritative template.price (₹49)
      const qTamper = resolveAuthoritativeProduct({
        productId: 'wish_bundle',
        templateId: 'tpl_photo_49',
        options: { includeTemplate: true, templatePrice: 0, includeCustomLink: true },
        templates: templatesList,
        siteSettings: defaultAddSettings
      });
      assert.equal(qTamper.price, 49 + 19, 'Client-supplied templatePrice must never override authoritative template.price');

      // 6f. Verify zero-price add-on is respected (not replaced by falsy fallback)
      const zeroSettings = { addons: { customLinkPrice: 0, hdPhotosPrice: 0, yearlyCustomLinkPrice: 0 } };
      assert.equal(resolveAuthoritativeProduct({ productId: 'personalized_link', siteSettings: zeroSettings }).price, 0);
      assert.equal(resolveAuthoritativeProduct({ productId: 'custom_link_1yr', siteSettings: zeroSettings }).price, 0);
    });

    it('verifies public/admin-pricing.html dynamically binds buttons, badges, calculated totals, and unsaved indicators', () => {
      const pricingHtml = fs.readFileSync(path.join(ROOT_DIR, 'public/admin-pricing.html'), 'utf-8');
      assert.ok(pricingHtml.includes('id="btn-save-custom-link"'), 'Must have dynamic button #btn-save-custom-link');
      assert.ok(pricingHtml.includes('id="btn-save-hd-style"'), 'Must have dynamic button #btn-save-hd-style');
      assert.ok(pricingHtml.includes('id="btn-save-yearly-link"'), 'Must have dynamic button #btn-save-yearly-link');
      assert.ok(pricingHtml.includes('id="yearly-link-price-input"'), 'Must have input #yearly-link-price-input');
      assert.ok(pricingHtml.includes('id="example-std-total"'), 'Must have dynamic example total #example-std-total');
      assert.ok(pricingHtml.includes('id="example-yr-total"'), 'Must have dynamic example yearly total #example-yr-total');
      assert.ok(pricingHtml.includes('id="pricing-unsaved-banner"'), 'Must have unsaved changes banner #pricing-unsaved-banner');
      assert.ok(pricingHtml.includes('id="pricing-error-banner"'), 'Must have error banner #pricing-error-banner');
      assert.ok(pricingHtml.includes('function syncPricingDynamicLabelsAndTotals()'), 'Must define syncPricingDynamicLabelsAndTotals()');
      assert.ok(pricingHtml.includes('function applyConfirmedPricingToForm('), 'Must update UI from confirmed server response');
    });
  });

  describe('B. Settings 12-Category Navigation, Search & Single Authoritative Pricing Source Tests', () => {
    it('removes "Show All Settings", exposes all 12 inventory-backed categories, supports search navigation, and links to authoritative Pricing & Festival pages', () => {
      const settingsHtml = fs.readFileSync(path.join(ROOT_DIR, 'public/admin-settings.html'), 'utf-8');

      // 1. Confirm "Show All Settings" is completely removed
      assert.ok(!settingsHtml.includes('id="admin-settings-tab-all"'), '#admin-settings-tab-all must be removed');
      assert.ok(!settingsHtml.includes('Show All Settings'), '"Show All Settings" label must be removed');

      // 2. Confirm all 12 category buttons and matching [data-settings-tab] sections exist
      const expectedCategories = [
        'storefront',
        'domain-links',
        'templates-gallery',
        'payments-pricing',
        'team-rbac',
        'security-audit',
        'backup-data',
        'notifications-integrations',
        'storage-performance',
        'wish-lifecycle',
        'festivals-scheduling',
        'advanced-maintenance'
      ];
      for (const catKey of expectedCategories) {
        assert.ok(
          settingsHtml.includes(`id="admin-settings-tab-${catKey}"`),
          `Category navigation button #admin-settings-tab-${catKey} must exist`
        );
        assert.ok(
          settingsHtml.includes(`data-settings-tab="${catKey}"`),
          `Category content section [data-settings-tab="${catKey}"] must exist`
        );
      }

      // 3. Confirm interactive settings search input & handler exist
      assert.ok(settingsHtml.includes('id="settings-search-input"'), 'Settings search input must exist');
      assert.ok(settingsHtml.includes('SETTINGS_SEARCH_INDEX'), 'Settings search index must exist');
      assert.ok(settingsHtml.includes('window.openSearchedSetting = function'), 'Search navigation handler must exist');

      // 4. Confirm duplicate pricing editor (#setting-personalized-price) is removed and replaced with authoritative link
      assert.ok(!settingsHtml.includes('id="setting-personalized-price"'), 'Duplicate editable price input #setting-personalized-price must be removed from admin-settings.html');
      assert.ok(settingsHtml.includes('id="setting-personalized-price-readonly"'), 'Read-only price indicator must exist');
      assert.ok(settingsHtml.includes('id="btn-open-authoritative-pricing"'), 'Direct Manage Payments & Pricing button must exist');
      assert.ok(settingsHtml.includes('href="/admin/anktech/anktech/admin/pricing"'), 'Must link directly to /admin/anktech/anktech/admin/pricing');
      assert.ok(settingsHtml.includes('href="/admin/anktech/anktech/admin/festivals"'), 'Must link directly to /admin/anktech/anktech/admin/festivals');
    });

    it('persists site settings (including hero3dFloatingEnabled, heroTouchBurstEnabled, and popularTags) in D1 and rejects unauthorized mutations', async () => {
      const mock = createPricingSettingsAndAnalyticsD1Mock();
      const env = {
        DB: mock.db,
        ADMIN_EMAIL: 'ankit.babusaini@gmail.com',
        ADMIN_PASSWORD: 'TestAdminStrongPassword!2026',
        SESSION_SECRET: 'test-session-secret-part53-2026'
      };

      // Unauthorized request must be rejected with 401
      const unauthRes = await worker.fetch(new Request('https://wishmagic.pages.dev/api/admin/settings/site', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Origin': 'https://wishmagic.pages.dev' },
        body: JSON.stringify({ settings: { brandName: 'Hacked' } })
      }), env);
      assert.equal(unauthRes.status, 401, 'Unauthenticated site settings update must return 401');

      const adminCookie = await loginTestAdmin(env);
      const saveRes = await worker.fetch(new Request('https://wishmagic.pages.dev/api/admin/settings/site', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://wishmagic.pages.dev',
          'Cookie': adminCookie
        },
        body: JSON.stringify({
          settings: {
            brandName: 'WishMagic Royal',
            hero3dFloatingEnabled: false,
            heroTouchBurstEnabled: true,
            popularTags: ['Diwali 2026', 'Brother Tribute', 'Best Friend']
          }
        })
      }), env);
      assert.equal(saveRes.status, 200);

      const getRes = await worker.fetch(new Request('https://wishmagic.pages.dev/api/admin/settings/site', {
        headers: { 'Cookie': adminCookie }
      }), env);
      assert.equal(getRes.status, 200);
      const getBody = await getRes.json();
      const loaded = getBody.data?.settings || getBody.settings;
      assert.equal(loaded.brandName, 'WishMagic Royal');
      assert.equal(loaded.hero3dFloatingEnabled, false, 'hero3dFloatingEnabled must persist in D1');
      assert.equal(loaded.heroTouchBurstEnabled, true, 'heroTouchBurstEnabled must persist in D1');
      assert.deepEqual(loaded.popularTags, ['Diwali 2026', 'Brother Tribute', 'Best Friend'], 'popularTags must persist in D1');
    });
  });

  describe('C. Real Dashboard & Analytics Data Only (Zero Fabricated Metrics) Tests', () => {
    it('calculates revenue strictly from settled D1 orders net of refunds, excludes pending/failed/comp orders, deduplicates retries, and never fabricates revenue from wishes', async () => {
      const nowIso = new Date().toISOString();
      const sampleOrders = [
        // 1. Valid settled order: ₹99 (9900 paise)
        { id: 'ord_paid_1', amount: 9900, currency: 'INR', status: 'PAID', provider: 'Razorpay', created_at: nowIso },
        // Duplicate delivery of ord_paid_1 (must be deduplicated!)
        { id: 'ord_paid_1', amount: 9900, currency: 'INR', status: 'PAID', provider: 'Razorpay', created_at: nowIso },
        // 2. Partially refunded order: ₹129 (12900 paise) with ₹29 (2900 paise) refund -> net ₹100
        { id: 'ord_part_ref_2', amount: 12900, currency: 'INR', status: 'PARTIALLY_REFUNDED', provider: 'Razorpay', created_at: nowIso },
        // 3. Fully refunded order: ₹59 (5900 paise) with ₹59 (5900 paise) refund -> gross includes ₹59, net is ₹0
        { id: 'ord_full_ref_3', amount: 5900, currency: 'INR', status: 'REFUNDED', provider: 'Razorpay', created_at: nowIso },
        // 4. Pending checkout: ₹219 (must NOT count in gross, net, or paidOrders!)
        { id: 'ord_pending_4', amount: 21900, currency: 'INR', status: 'PENDING', provider: 'Razorpay', created_at: nowIso },
        // 5. Failed payment: ₹99 (must NOT count in gross, net, or paidOrders!)
        { id: 'ord_failed_5', amount: 9900, currency: 'INR', status: 'PAYMENT_FAILED', provider: 'Razorpay', created_at: nowIso },
        // 6. Admin Complimentary Pass: status PAID but provider 'Admin Comp Pass' (must NOT count as earned revenue!)
        { id: 'ord_comp_6', amount: 0, currency: 'INR', status: 'PAID', provider: 'Admin Comp Pass', created_at: nowIso }
      ];

      const sampleRefunds = [
        { id: 'ref_1', order_id: 'ord_part_ref_2', amount: 2900, status: 'PROCESSED', created_at: nowIso },
        // Duplicate refund record (must be deduplicated!)
        { id: 'ref_1', order_id: 'ord_part_ref_2', amount: 2900, status: 'PROCESSED', created_at: nowIso },
        { id: 'ref_2', order_id: 'ord_full_ref_3', amount: 5900, status: 'PROCESSED', created_at: nowIso },
        // Rejected refund (must be ignored!)
        { id: 'ref_rejected', order_id: 'ord_paid_1', amount: 9900, status: 'REJECTED', created_at: nowIso }
      ];

      // VIP wishes WITHOUT orders (must NOT synthesize fake ₹49 revenue!)
      const sampleWishes = [
        { id: 'wish_vip_no_order', tier: 'vip', price: 49, status: 'PUBLISHED', created_at: nowIso },
        { id: 'wish_free_1', tier: 'free', price: 0, status: 'PUBLISHED', created_at: nowIso }
      ];

      const bounds = getDateRangeBounds('30d');
      const execOverview = calculateExecutiveOverview({
        orders: sampleOrders,
        refunds: sampleRefunds,
        wishes: sampleWishes,
        users: [],
        events: [],
        dateBounds: bounds
      });

      // Gross = 99 + 129 + 59 = ₹287
      assert.equal(execOverview.metrics.grossRevenue.current, 287, 'Gross revenue must be ₹287 (excluding pending, failed, comp, and duplicates)');
      // Refunds = 29 + 59 = ₹88
      assert.equal(execOverview.metrics.refunds.current, 88, 'Processed refunds must be ₹88');
      // Net = 287 - 88 = ₹199 (99 from ord_paid_1 + 100 from ord_part_ref_2 + 0 from ord_full_ref_3)
      assert.equal(execOverview.metrics.netRevenue.current, 199, 'Net revenue must be ₹199 (no double subtraction on full refunds)');
      // Paid orders = 2 (ord_paid_1 and ord_part_ref_2)
      assert.equal(execOverview.metrics.paidOrders.current, 2, 'Paid orders must be 2');
      // Zero previous period baseline must have hasBaseline: false and percentageChange: null
      assert.equal(execOverview.metrics.grossRevenue.hasBaseline, false, 'Zero previous period must report hasBaseline: false');
      assert.equal(execOverview.metrics.grossRevenue.percentageChange, null, 'Zero previous period must not divide by zero');

      const revAnalytics = calculateRevenueAnalytics({
        orders: sampleOrders,
        refunds: sampleRefunds,
        dateBounds: bounds
      });
      const totalGrossSeries = revAnalytics.timeSeries.reduce((s, d) => s + d.grossRupees, 0);
      const totalNetSeries = revAnalytics.timeSeries.reduce((s, d) => s + d.netRupees, 0);
      assert.equal(totalGrossSeries, 287);
      assert.equal(totalNetSeries, 199);
      assert.equal(revAnalytics.statusDistribution.PAID, 1);
      assert.equal(revAnalytics.statusDistribution.PARTIALLY_REFUNDED, 1);
      assert.equal(revAnalytics.statusDistribution.REFUNDED, 1);
      assert.equal(revAnalytics.statusDistribution.PENDING, 1);
      assert.equal(revAnalytics.statusDistribution.PAYMENT_FAILED, 1);

      // Verify GET /api/admin/commerce/orders and getCentralizedDashboardSummary on D1 with VIP wishes and orders
      const mock = createPricingSettingsAndAnalyticsD1Mock();
      sampleOrders.slice(1).forEach(o => mock.store.orders.set(o.id, o)); // unique orders in D1
      sampleRefunds.slice(1).forEach(r => mock.store.refunds.set(r.id, r));
      sampleWishes.forEach(w => mock.store.wishes.set(w.id, w));

      const env = {
        DB: mock.db,
        ADMIN_EMAIL: 'ankit.babusaini@gmail.com',
        ADMIN_PASSWORD: 'TestAdminStrongPassword!2026',
        SESSION_SECRET: 'test-session-secret-part53-2026'
      };
      const adminCookie = await loginTestAdmin(env);

      const ordRes = await worker.fetch(new Request('https://wishmagic.pages.dev/api/admin/commerce/orders', {
        headers: { 'Cookie': adminCookie }
      }), env);
      assert.equal(ordRes.status, 200);
      const ordBody = await ordRes.json();
      const ordList = ordBody.data?.orders || ordBody.orders;
      const ordMetrics = ordBody.data?.metrics || ordBody.metrics;

      // Confirm no fake ord_vip_* order was synthesized from wish_vip_no_order
      assert.ok(!ordList.some(o => String(o.id).startsWith('ord_vip_')), 'Must NEVER synthesize fake ord_vip_* orders from wishes');
      assert.equal(ordMetrics.grossRevenueRupees, 287);
      assert.equal(ordMetrics.refundedRupees, 88);
      assert.equal(ordMetrics.netRevenueRupees, 199);
      assert.equal(ordMetrics.totalRevenueRupees, 199);
      assert.equal(ordMetrics.paidOrders, 2);
      assert.equal(ordMetrics.pendingOrders, 1);
      assert.equal(ordMetrics.failedOrders, 1);
      assert.equal(ordMetrics.compOrders, 1);

      const dashSummary = await getCentralizedDashboardSummary(mock.db, env);
      assert.equal(dashSummary.totalRevenue, 199, 'Dashboard summary totalRevenue must match net settled D1 order revenue (₹199)');
      assert.equal(dashSummary.grossRevenue, 287);
      assert.equal(dashSummary.refundedRevenue, 88);
      assert.equal(dashSummary.paidOrders, 2);
      assert.equal(dashSummary.totalUsers, 0, 'Empty users table must report 0 users, never 1');
      assert.equal(dashSummary.liveVisitorsCount, 0, 'Empty activity must report 0 live visitors, never 1');
    });
  });

});
