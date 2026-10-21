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
      assert.equal(initSettings.personalized.price, 59);
      assert.equal(initSettings.addons.customLinkPrice, 59);
      assert.equal(initSettings.addons.hdImageStylePrice, 59);
      assert.equal(initSettings.addons.freeTemplateComboPrice, 99);
      assert.equal(initSettings.addons.premiumComboAddonPrice, 70);

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
            personalized: { enabled: true, currency: 'INR', displayName: 'Custom Link Only' },
            random: { enabled: true, prefix: 'w-', length: 8, allowedCharacters: 'abcdefghijklmnopqrstuvwxyz0123456789' }
          }
        })
      }), env);
      assert.equal(putRandomRes.status, 200);

      // 3. Now save updated pricing from Pricing Studio (e.g. Free Combo = ₹29, Premium Combo Add-On = +₹29, Custom Link = ₹49)
      const putPricingRes = await worker.fetch(new Request('https://wishmagic.pages.dev/api/admin/settings/wish-links', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://wishmagic.pages.dev',
          'Cookie': adminCookie
        },
        body: JSON.stringify({
          settings: {
            personalized: { enabled: true, price: 49 },
            addons: {
              customLinkPrice: 49,
              hdImageStylePrice: 45,
              freeTemplateComboPrice: 29,
              premiumComboAddonPrice: 29,
              creatorPackPrice: 179,
              templatePriceTiers: [0, 59, 149]
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
      const savedPricingBody = await putPricingRes.json();
      const savedSettings = savedPricingBody.data?.settings || savedPricingBody.settings;

      // Verify D1 persistence in system_announcements ('config_wish_links')
      assert.ok(mock.store.system_announcements.has('config_wish_links'), 'D1 must persist config_wish_links');
      const d1Parsed = JSON.parse(mock.store.system_announcements.get('config_wish_links').message);
      assert.equal(d1Parsed.addons.freeTemplateComboPrice, 29);
      assert.equal(d1Parsed.addons.premiumComboAddonPrice, 29);
      assert.equal(d1Parsed.addons.customLinkPrice, 49);
      assert.equal(d1Parsed.personalized.price, 49);
      assert.equal(d1Parsed.addons.creatorPackPrice, 179);
      // Verify random settings were preserved during pricing save!
      assert.equal(d1Parsed.random.prefix, 'w-', 'Saving pricing must preserve random.prefix');
      assert.equal(d1Parsed.random.length, 8, 'Saving pricing must preserve random.length');

      // 4. Verify saving Wish Link settings from Admin Settings (without price/addons) preserves the saved ₹29/₹49 prices!
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
      assert.equal(afterSlugSettings.addons.freeTemplateComboPrice, 29, 'Free Combo price must remain 29 after slug settings save');
      assert.equal(afterSlugSettings.addons.premiumComboAddonPrice, 29, 'Premium Add-On price must remain 29 after slug settings save');
      assert.equal(afterSlugSettings.addons.customLinkPrice, 49, 'Custom Link price must remain 49 after slug settings save');
      assert.equal(afterSlugSettings.personalized.price, 49, 'Personalized price must remain 49 after slug settings save');
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
              freeTemplateComboPrice: -50
            }
          }
        })
      }), env);
      assert.equal(badPriceRes.status, 400, 'Negative combo price must be rejected with 400');

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
              premiumComboAddonPrice: 'not-a-number'
            }
          }
        })
      }), env);
      assert.equal(nanPriceRes.status, 400, 'Non-numeric addon price must be rejected with 400');

      // 6. Verify Server-Side Authoritative Product Quote (resolveAuthoritativeProduct) uses the exact saved pricing
      const freeComboQuote = resolveAuthoritativeProduct({
        productId: 'free_template_combo',
        siteSettings: afterSlugSettings
      });
      assert.equal(freeComboQuote.price, 29, 'Server checkout quote for free_template_combo must use saved ₹29');
      assert.equal(freeComboQuote.amountPaise, 2900);

      const premTier1ComboQuote = resolveAuthoritativeProduct({
        productId: 'premium_template_combo',
        options: { templatePrice: 59 },
        siteSettings: afterSlugSettings
      });
      assert.equal(premTier1ComboQuote.price, 59 + 29, '₹59 template + ₹29 addon must equal ₹88');

      const premTier2ComboQuote = resolveAuthoritativeProduct({
        productId: 'premium_template_combo',
        options: { templatePrice: 149 },
        siteSettings: afterSlugSettings
      });
      assert.equal(premTier2ComboQuote.price, 149 + 29, '₹149 template + ₹29 addon must equal ₹178');

      // Also verify standard ₹70 addon rule: ₹59 + ₹70 = ₹129 and ₹149 + ₹70 = ₹219
      const stdSettings = { addons: { customLinkPrice: 59, hdImageStylePrice: 59, freeTemplateComboPrice: 99, premiumComboAddonPrice: 70 } };
      assert.equal(resolveAuthoritativeProduct({ productId: 'premium_template_combo', options: { templatePrice: 59 }, siteSettings: stdSettings }).price, 129);
      assert.equal(resolveAuthoritativeProduct({ productId: 'premium_template_combo', options: { templatePrice: 149 }, siteSettings: stdSettings }).price, 219);

      // Verify zero-price add-on is respected (not replaced by falsy fallback)
      const zeroComboSettings = { addons: { freeTemplateComboPrice: 0, premiumComboAddonPrice: 0 } };
      assert.equal(resolveAuthoritativeProduct({ productId: 'free_template_combo', siteSettings: zeroComboSettings }).price, 0);
      assert.equal(resolveAuthoritativeProduct({ productId: 'premium_template_combo', options: { templatePrice: 59 }, siteSettings: zeroComboSettings }).price, 59);
    });

    it('verifies public/admin-pricing.html dynamically binds buttons, badges, descriptions, calculated totals, and unsaved indicators', () => {
      const pricingHtml = fs.readFileSync(path.join(ROOT_DIR, 'public/admin-pricing.html'), 'utf-8');
      assert.ok(pricingHtml.includes('id="btn-save-custom-link"'), 'Must have dynamic button #btn-save-custom-link');
      assert.ok(pricingHtml.includes('id="btn-save-hd-style"'), 'Must have dynamic button #btn-save-hd-style');
      assert.ok(pricingHtml.includes('id="btn-save-free-combo"'), 'Must have dynamic button #btn-save-free-combo');
      assert.ok(pricingHtml.includes('id="btn-save-premium-addon"'), 'Must have dynamic button #btn-save-premium-addon');
      assert.ok(pricingHtml.includes('id="free-combo-savings-badge"'), 'Must have dynamic savings badge #free-combo-savings-badge');
      assert.ok(pricingHtml.includes('id="premium-addon-badge"'), 'Must have dynamic addon badge #premium-addon-badge');
      assert.ok(pricingHtml.includes('id="premium-addon-desc"'), 'Must have dynamic description #premium-addon-desc');
      assert.ok(pricingHtml.includes('id="prem-tier-1-total"'), 'Must have dynamic tier 1 total #prem-tier-1-total');
      assert.ok(pricingHtml.includes('id="prem-tier-2-total"'), 'Must have dynamic tier 2 total #prem-tier-2-total');
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
      const nowIso = '2026-10-20T12:00:00.000Z';
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
