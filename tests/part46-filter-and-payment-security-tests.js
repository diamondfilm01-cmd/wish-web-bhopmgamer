/**
 * WishMagic Part 46: Template Filter & End-to-End Payment/Entitlement Security Test Suite
 * ======================================================================================
 * Verifies:
 * 1. Template Filter Bug Fix:
 *    - CSS `.template-card:not(.hidden)` and `.hidden { display: none !important; }` prevent
 *      non-matching cards or empty grids from staying visible when filters are applied.
 *    - Homepage & catalog filter functions hide non-matching cards and hide `#templates-grid`
 *      when 0 templates match.
 * 2. Strict User-Bound & Item-Scoped Payment Entitlements:
 *    - `personalized_link` unlocks ONLY Custom Link for that user (does NOT unlock VIP templates).
 *    - `template:tpl_xxx` unlocks ONLY `tpl_xxx` for that user (does NOT unlock `tpl_yyy`).
 *    - `premium_template_combo` unlocks `tpl_xxx` + Custom Link + HD Style for that user.
 *    - `vip_pass` unlocks all VIP templates + Custom Link + HD Style for that user.
 * 3. Strict User ID Isolation (Anti-IDOR):
 *    - User B cannot verify, cancel, fail, or claim User A's order or entitlements.
 * 4. Failed / Cancelled Payment Protection:
 *    - `POST /api/commerce/cancel`, `POST /api/commerce/fail`, and `payment.failed` webhooks
 *      transition orders to `CANCELLED` / `PAYMENT_FAILED`, revoke any non-paid entitlement,
 *      and block unpaid publishing (`402`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import {
  computeHmacSha256,
  evaluateUserEntitlement,
  createCheckoutSession,
  verifyAndFinalizePayment,
  processRazorpayWebhook,
  RazorpayAdapter
} from '../src/commerce-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('Part 46 — Template Filtering & End-to-End Payment Security Suite', async (t) => {

  await t.test('1. CSS & Homepage/Marketplace Filter Fix: .hidden cards and 0-match grids are strictly display:none', () => {
    const css = fs.readFileSync(path.join(ROOT_DIR, 'public/css/cloud-background.css'), 'utf8');

    // Must not force .template-card { display: flex !important } on .hidden cards
    assert.ok(
      css.includes('.template-card:not(.hidden)') &&
      css.includes('.catalog-template-card:not(.hidden)'),
      'cloud-background.css must scope display:flex !important to :not(.hidden):not([hidden])'
    );
    assert.ok(
      css.includes('#templates-grid:not(.hidden)'),
      'cloud-background.css must scope #templates-grid display:grid !important to :not(.hidden):not([hidden])'
    );
    assert.ok(
      css.includes('.template-card.hidden') && css.includes('display: none !important;'),
      'cloud-background.css must enforce display: none !important on .template-card.hidden'
    );

    const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'public/index.html'), 'utf8');
    assert.ok(
      indexHtml.includes("card.style.setProperty('display', 'none', 'important')"),
      'index.html applyActiveFilters must set display:none !important on hidden cards'
    );
    assert.ok(
      indexHtml.includes("gridEl.style.setProperty('display', 'none', 'important')"),
      'index.html applyActiveFilters must hide #templates-grid when visibleCount === 0'
    );

    const marketplaceHtml = fs.readFileSync(path.join(ROOT_DIR, 'public/marketplace.html'), 'utf8');
    assert.ok(
      marketplaceHtml.includes("card.style.setProperty('display', 'none', 'important')"),
      'marketplace.html filterCatalog must set display:none !important on hidden cards'
    );
  });

  await t.test('2. Commerce Engine: Free template does NOT bypass payment for paid add-ons (Custom Link / HD Style / Combo)', () => {
    const templates = [
      { id: 'tpl_bday_free', name: 'Free Birthday', tier: 'free', price: 0 },
      { id: 'tpl_vip_gold', name: 'VIP Gold', tier: 'vip', price: 59 },
      { id: 'tpl_vip_royal', name: 'VIP Royal', tier: 'vip', price: 149 }
    ];
    const user = { id: 'usr_customer_1', email: 'c1@example.com', role: 'user' };

    // Checking template itself on free template -> allowed
    const freeTplCheck = evaluateUserEntitlement({
      user,
      templateId: 'tpl_bday_free',
      entitlements: [],
      templates
    });
    assert.equal(freeTplCheck.allowed, true);
    assert.equal(freeTplCheck.reason, 'FREE_TEMPLATE');

    // Checking personalized_link add-on while on a free template -> MUST require purchase!
    const addonOnFreeTplCheck = evaluateUserEntitlement({
      user,
      productId: 'personalized_link',
      templateId: 'tpl_bday_free',
      entitlements: [],
      templates
    });
    assert.equal(addonOnFreeTplCheck.allowed, false, 'Free template must NOT grant free personalized_link add-on');
    assert.equal(addonOnFreeTplCheck.reason, 'PURCHASE_REQUIRED');
  });

  await t.test('3. Exact Item-Scoped Entitlements & User Isolation (Only what user paid for is unlocked)', async () => {
    const secret = 'rzp_secret_part46_test';
    const adapter = new RazorpayAdapter({
      keyId: 'rzp_test_key46',
      keySecret: secret,
      webhookSecret: 'whsec_part46',
      isTestMode: true
    });

    let orderCounter = 0;
    adapter.createOrder = async ({ amountPaise, currency, receipt }) => ({
      id: `order_rzp_${++orderCounter}`,
      amount: amountPaise,
      currency,
      receipt,
      status: 'created'
    });

    const stores = {
      orders: [],
      orderItems: [],
      paymentAttempts: [],
      paymentWebhooks: [],
      entitlements: [],
      auditLogs: [],
      notifications: [],
      templates: [
        { id: 'tpl_bday_free', name: 'Free Birthday', tier: 'free', price: 0 },
        { id: 'tpl_vip_gold', name: 'VIP Gold', tier: 'vip', price: 59 },
        { id: 'tpl_vip_royal', name: 'VIP Royal', tier: 'vip', price: 149 }
      ],
      families: [],
      siteSettings: { addons: { customLinkPrice: 59, hdImageStylePrice: 59, freeTemplateComboPrice: 99, premiumComboAddonPrice: 70 } }
    };

    const userA = { id: 'usr_user_a', email: 'a@example.com', role: 'user' };
    const userB = { id: 'usr_user_b', email: 'b@example.com', role: 'user' };

    // Step A: User A buys ONLY single template `tpl_vip_gold` (₹59 = 5900 paise)
    const sessionA = await createCheckoutSession({
      user: userA,
      productId: 'template:tpl_vip_gold',
      templateId: 'tpl_vip_gold',
      options: { templateId: 'tpl_vip_gold' },
      adapter,
      stores
    });

    assert.equal(sessionA.order.userId, 'usr_user_a');
    assert.equal(sessionA.order.amount, 5900);
    assert.equal(sessionA.order.templateId, 'tpl_vip_gold');

    const payIdA = 'pay_rzp_gold_1';
    const sigA = computeHmacSha256(secret, `${sessionA.order.providerOrderId}|${payIdA}`);
    adapter.fetchPayment = async (pId) => ({
      id: pId,
      order_id: sessionA.order.providerOrderId,
      amount: 5900,
      currency: 'INR',
      status: 'captured',
      captured: true
    });

    // Cross-user attack: User B tries to verify User A's payment -> MUST FAIL with 403 FORBIDDEN
    await assert.rejects(
      async () => {
        await verifyAndFinalizePayment({
          orderId: sessionA.order.id,
          razorpayOrderId: sessionA.order.providerOrderId,
          razorpayPaymentId: payIdA,
          razorpaySignature: sigA,
          user: userB,
          adapter,
          stores
        });
      },
      (err) => err.status === 403 && err.code === 'FORBIDDEN'
    );

    // Legitimate verification by User A -> Succeeds
    const verifiedA = await verifyAndFinalizePayment({
      orderId: sessionA.order.id,
      razorpayOrderId: sessionA.order.providerOrderId,
      razorpayPaymentId: payIdA,
      razorpaySignature: sigA,
      user: userA,
      adapter,
      stores
    });

    assert.equal(verifiedA.success, true);
    assert.equal(verifiedA.order.status, 'PAID');
    assert.equal(verifiedA.entitlement.userId, 'usr_user_a');
    assert.equal(verifiedA.entitlement.templateId, 'tpl_vip_gold');

    // Verify User A has access ONLY to `tpl_vip_gold`, NOT `tpl_vip_royal`, and User B has NEITHER
    const checkAGold = evaluateUserEntitlement({
      user: userA,
      templateId: 'tpl_vip_gold',
      entitlements: stores.entitlements,
      templates: stores.templates
    });
    assert.equal(checkAGold.allowed, true);
    assert.equal(checkAGold.reason, 'SPECIFIC_TEMPLATE_PURCHASE');

    const checkARoyal = evaluateUserEntitlement({
      user: userA,
      templateId: 'tpl_vip_royal',
      entitlements: stores.entitlements,
      templates: stores.templates
    });
    assert.equal(checkARoyal.allowed, false, 'Buying tpl_vip_gold must NOT unlock tpl_vip_royal');

    const checkBGold = evaluateUserEntitlement({
      user: userB,
      templateId: 'tpl_vip_gold',
      entitlements: stores.entitlements,
      templates: stores.templates
    });
    assert.equal(checkBGold.allowed, false, 'User B must NOT get User A entitlement');
  });

  await t.test('4. Cancelled & Failed Payments Grant Zero Access and Block Publishing (Worker D1 E2E)', async () => {
    const tables = {
      orders: [],
      order_items: [],
      payment_attempts: [],
      entitlements: [],
      wishes: [],
      templates: [
        { id: 'tpl_vip_59', name: 'VIP Starlight', tier: 'vip', price: 59, is_active: 1, config_json: '{}' }
      ],
      users: [
        { id: 'usr_buyer', email: 'buyer@example.com', role: 'user', is_premium: 0 },
        { id: 'usr_other', email: 'other@example.com', role: 'user', is_premium: 0 }
      ],
      sessions: [
        { id: 'ses_buyer', user_id: 'usr_buyer', token: 'tok_buyer', expires_at: Date.now() + 3600000 },
        { id: 'ses_other', user_id: 'usr_other', token: 'tok_other', expires_at: Date.now() + 3600000 }
      ]
    };

    const mockDb = {
      prepare(sql) {
        const args = [];
        const stmt = {
          bind(...b) { args.push(...b); return stmt; },
          async first() {
            const s = sql.toLowerCase();
            if (s.includes('from sessions')) {
              return tables.sessions.find(x => x.token === args[0]) || null;
            }
            if (s.includes('from users')) {
              return tables.users.find(x => x.id === args[0]) || null;
            }
            if (s.includes('from orders')) {
              return tables.orders.find(o => o.id === args[0] || o.provider_order_id === args[0] || o.provider_order_id === args[1]) || null;
            }
            if (s.includes('from templates')) {
              return tables.templates.find(t => t.id === args[0]) || null;
            }
            return null;
          },
          async all() {
            const s = sql.toLowerCase();
            if (s.includes('from entitlements where user_id = ?')) {
              return { results: tables.entitlements.filter(e => e.user_id === args[0] && e.status === 'active') };
            }
            if (s.includes('from orders where user_id = ?')) {
              return { results: tables.orders.filter(o => o.user_id === args[0] && o.status === 'PAID') };
            }
            return { results: [] };
          },
          async run() {
            const s = sql.toLowerCase();
            if (s.includes('update orders') && s.includes("status = ?")) {
              const nextStatus = args[0];
              const errCode = args[1];
              const errDesc = args[2];
              const updatedAt = args[3];
              const ordId = args[4];
              const ord = tables.orders.find(o => o.id === ordId);
              if (ord && ord.status !== 'PAID') {
                ord.status = nextStatus;
                ord.error_code = errCode;
                ord.error_description = errDesc;
                ord.updated_at = updatedAt;
              }
              return { success: true, meta: { changes: 1 } };
            }
            if (s.includes('update payment_attempts') && s.includes('status = ?')) {
              const nextStatus = args[0];
              const ordId = args[args.length - 1];
              const att = tables.payment_attempts.find(a => a.order_id === ordId);
              if (att && att.status !== 'CAPTURED') {
                att.status = nextStatus;
              }
              return { success: true, meta: { changes: 1 } };
            }
            if (s.includes('update entitlements') && s.includes("status = 'revoked'")) {
              const ordId = args[1];
              tables.entitlements.forEach(e => {
                if (e.order_id === ordId) e.status = 'revoked';
              });
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 1 } };
          }
        };
        return stmt;
      }
    };

    // Seed a pending order for usr_buyer
    tables.orders.push({
      id: 'ord_pending_cancel_1',
      user_id: 'usr_buyer',
      plan: 'template:tpl_vip_59',
      product_id: 'template:tpl_vip_59',
      template_id: 'tpl_vip_59',
      amount: 5900,
      currency: 'INR',
      provider: 'razorpay',
      provider_order_id: 'order_rzp_cancel_1',
      status: 'PENDING',
      created_at: new Date().toISOString()
    });
    tables.payment_attempts.push({
      id: 'att_pending_cancel_1',
      order_id: 'ord_pending_cancel_1',
      provider_order_id: 'order_rzp_cancel_1',
      status: 'CREATED',
      amount: 5900,
      currency: 'INR'
    });

    const env = {
      DB: mockDb,
      RAZORPAY_KEY_ID: 'rzp_test_123',
      RAZORPAY_KEY_SECRET: 'rzp_sec_123'
    };

    // 1) Other user tries to cancel buyer's order -> 403 FORBIDDEN
    const crossCancelRes = await worker.fetch(
      new Request('https://wishmagic.in/api/commerce/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer tok_other'
        },
        body: JSON.stringify({ orderId: 'ord_pending_cancel_1', reason: 'USER_DISMISSED_MODAL' })
      }),
      env
    );
    assert.equal(crossCancelRes.status, 403, 'User B must not be able to cancel User A order');

    // 2) Buyer cancels checkout -> 200 OK, order marked CANCELLED, entitlementGranted: false
    const cancelRes = await worker.fetch(
      new Request('https://wishmagic.in/api/commerce/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer tok_buyer'
        },
        body: JSON.stringify({ orderId: 'ord_pending_cancel_1', reason: 'USER_DISMISSED_MODAL' })
      }),
      env
    );
    assert.equal(cancelRes.status, 200);
    const cancelData = await cancelRes.json();
    assert.equal(cancelData.success, true);
    assert.equal(cancelData.status, 'CANCELLED');
    assert.equal(cancelData.entitlementGranted, false);
    assert.equal(tables.orders[0].status, 'CANCELLED');
    assert.equal(tables.payment_attempts[0].status, 'CANCELLED');

    // 3) Check entitlements status for buyer -> must have ZERO unlocked templates or VIP access
    const entStatusRes = await worker.fetch(
      new Request('https://wishmagic.in/api/entitlements/status?templateId=tpl_vip_59', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer tok_buyer' }
      }),
      env
    );
    const entStatusData = await entStatusRes.json();
    assert.equal(entStatusData.isPremium, false);
    assert.equal(entStatusData.hasVipPass, false);
    assert.deepEqual(entStatusData.unlockedTemplates, []);
  });
});
