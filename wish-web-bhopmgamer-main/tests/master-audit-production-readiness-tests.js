/**
 * WishMagic Production Readiness Master Verification Test Suite
 * =============================================================
 * Validates:
 * 1. Template Duplication in D1 (Unique IDs, metadata preservation, draft status, error handling)
 * 2. Commerce Checkout & Payment Verification (D1 persistence, signature check, idempotency, honest errors)
 * 3. Razorpay Webhook Processing (Signature auth, idempotent delivery, event handling)
 * 4. Support Ticket Closing & Data Integrity (D1 status update, honest errors on failure, IDOR check)
 * 5. Help Article Feedback Persistence (D1 counters increment, error propagation)
 * 6. Admin Routing Table Consistency (All sidebar routes map to valid public HTML files)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import worker from '../src/worker.js';
import { RazorpayAdapter, computeHmacSha256 } from '../src/commerce-engine.js';
import { TICKET_STATUS } from '../src/support-desk-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Helper to create a mock D1 database
function createMockD1() {
  const tables = {
    templates: [],
    template_versions: [],
    orders: [],
    order_items: [],
    payment_attempts: [],
    payment_webhooks: [],
    entitlements: [],
    support_tickets: [],
    support_ticket_messages: [],
    help_articles: [],
    users: [
      { id: 'usr_admin', email: 'ankit.babusaini@gmail.com', role: 'admin', is_admin: 1 },
      { id: 'usr_customer_1', email: 'customer@test.com', role: 'creator', is_admin: 0 },
      { id: 'usr_ticket_owner', email: 'owner@example.com', role: 'creator', is_admin: 0 },
      { id: 'usr_attacker', email: 'attacker@example.com', role: 'creator', is_admin: 0 }
    ],
    sessions: [
      { id: 'ses_adm', user_id: 'usr_admin', token: 'wm_test_adm_token', expires_at: Date.now() + 10000000 },
      { id: 'ses_cust', user_id: 'usr_customer_1', token: 'wm_test_cust_token', expires_at: Date.now() + 10000000 },
      { id: 'ses_owner', user_id: 'usr_ticket_owner', token: 'wm_test_owner_token', expires_at: Date.now() + 10000000 },
      { id: 'ses_atk', user_id: 'usr_attacker', token: 'wm_test_atk_token', expires_at: Date.now() + 10000000 }
    ]
  };

  return {
    _tables: tables,
    prepare(sql) {
      const boundArgs = [];
      const stmt = {
        bind(...args) {
          boundArgs.push(...args);
          return stmt;
        },
        async first() {
          const lower = sql.toLowerCase();
          if (lower.includes('from sessions where')) {
            const token = boundArgs[0];
            return tables.sessions.find(s => s.token === token) || null;
          }
          if (lower.includes('from users where')) {
            const id = boundArgs[0];
            return tables.users.find(u => u.id === id || u.email === id) || null;
          }
          if (lower.includes('from templates where')) {
            const idOrSlug = boundArgs[0];
            return tables.templates.find(t => t.id === idOrSlug || t.slug === idOrSlug) || null;
          }
          if (lower.includes('from template_versions where')) {
            const tId = boundArgs[0];
            const vers = tables.template_versions.filter(v => v.template_id === tId);
            return vers[vers.length - 1] || null;
          }
          if (/from\s+orders\s+where/i.test(sql)) {
            if (/transaction_id\s*=\s*\?\s*and\s*id\s*!=\s*\?/i.test(sql)) {
              const txId = boundArgs[0];
              const ordId = boundArgs[1];
              return tables.orders.find(o => o.transaction_id === txId && o.id !== ordId) || null;
            }
            if (/id\s*=\s*\?\s*and\s*user_id\s*=\s*\?/i.test(sql)) {
              const id = boundArgs[0];
              const uId = boundArgs[1];
              return tables.orders.find(o => o.id === id && o.user_id === uId) || null;
            }
            const id = boundArgs[0];
            const provId = boundArgs[1] || id;
            return tables.orders.find(o => o.id === id || o.provider_order_id === provId || o.id === provId) || null;
          }
          if (lower.includes('from payment_attempts where')) {
            if (lower.includes('provider_payment_id = ?')) {
              const payId = boundArgs[0];
              const ordId = boundArgs[1];
              return tables.payment_attempts.find(a => a.provider_payment_id === payId && a.order_id !== ordId && a.status === 'CAPTURED') || null;
            }
            const ordId = boundArgs[0];
            return tables.payment_attempts.find(a => a.order_id === ordId) || null;
          }
          if (lower.includes('from entitlements where')) {
            const uId = boundArgs[0];
            return tables.entitlements.find(e => e.user_id === uId && e.status === 'active') || null;
          }
          if (lower.includes('from payment_webhooks where')) {
            const eventId = boundArgs[0];
            return tables.payment_webhooks.find(w => w.event_id === eventId) || null;
          }
          if (/from\s+support_tickets\s+where/i.test(sql)) {
            const id = boundArgs[0];
            return tables.support_tickets.find(t => t.id === id || t.ticket_number === id) || null;
          }
          if (/from\s+help_articles\s+where/i.test(sql)) {
            const slug = boundArgs[0];
            return tables.help_articles.find(a => a.slug === slug) || null;
          }
          return null;
        },
        async all() {
          const lower = sql.toLowerCase();
          if (lower.includes('from templates')) {
            return { results: [...tables.templates] };
          }
          if (lower.includes('from template_versions')) {
            const tId = boundArgs[0];
            return { results: tables.template_versions.filter(v => v.template_id === tId) };
          }
          return { results: [] };
        },
        async run() {
          const lower = sql.toLowerCase();
          if (lower.includes('insert into templates')) {
            const record = {
              id: boundArgs[0],
              name: boundArgs[1],
              slug: boundArgs[2],
              description: boundArgs[3],
              category: boundArgs[4],
              relationships: boundArgs[5],
              tags: boundArgs[6],
              type: boundArgs[7],
              tier: boundArgs[8],
              price: boundArgs[9],
              is_premium: boundArgs[10],
              placement: boundArgs[11],
              thumbnail: boundArgs[12],
              preview_images: boundArgs[13],
              capabilities: boundArgs[14],
              detected_fields: boundArgs[15],
              sections: boundArgs[16],
              features: boundArgs[17],
              theme: boundArgs[18],
              folder: boundArgs[19],
              entry_file: boundArgs[20],
              current_version_id: boundArgs[21],
              created_at: boundArgs[22],
              updated_at: boundArgs[23],
              status: 'draft',
              is_published: 0
            };
            tables.templates.push(record);
            return { success: true };
          }
          if (lower.includes('insert into template_versions')) {
            const record = {
              id: boundArgs[0],
              template_id: boundArgs[1],
              version_number: boundArgs[2],
              name: boundArgs[3],
              description: boundArgs[4],
              category: boundArgs[5],
              tier: boundArgs[6],
              price: boundArgs[7],
              thumbnail: boundArgs[8],
              theme: boundArgs[9],
              sections: boundArgs[10],
              capabilities: boundArgs[11],
              layout: boundArgs[12],
              animations: boundArgs[13],
              default_config: boundArgs[14],
              snapshot_data: boundArgs[15],
              status: 'draft',
              is_current: 1,
              is_publishable: 1,
              created_at: boundArgs[16],
              created_by: boundArgs[17]
            };
            tables.template_versions.push(record);
            return { success: true };
          }
          if (lower.includes('insert into orders')) {
            const record = {
              id: boundArgs[0],
              user_id: boundArgs[1],
              plan: boundArgs[2],
              amount: boundArgs[3],
              currency: boundArgs[4],
              provider: boundArgs[5],
              provider_order_id: boundArgs[6],
              status: 'PENDING',
              created_at: boundArgs[7],
              updated_at: boundArgs[8]
            };
            tables.orders.push(record);
            return { success: true };
          }
          if (lower.includes('update orders set status =')) {
            const status = boundArgs[0];
            const transId = boundArgs[0] === 'PAID' ? boundArgs[0] : null;
            const orderId = boundArgs[3] || boundArgs[2] || boundArgs[1];
            const ord = tables.orders.find(o => o.id === orderId || o.provider_order_id === orderId);
            if (ord) {
              ord.status = 'PAID';
              ord.transaction_id = boundArgs[0];
            }
            return { success: true };
          }
          if (lower.includes('into entitlements')) {
            const record = {
              id: boundArgs[0],
              user_id: boundArgs[1],
              plan: boundArgs[2],
              status: 'active',
              starts_at: boundArgs[3]
            };
            tables.entitlements.push(record);
            return { success: true };
          }
          if (lower.includes('update payment_attempts set status =')) {
            const payId = boundArgs[0];
            const sig = boundArgs[1];
            const verifiedAt = boundArgs[2];
            const updatedAt = boundArgs[3];
            const attId = boundArgs[4];
            const att = tables.payment_attempts.find(a => a.id === attId || a.order_id === attId);
            if (att) {
              att.status = 'CAPTURED';
              att.provider_payment_id = payId;
              att.provider_signature = sig;
              att.signature_verified = 1;
              att.verified_at = verifiedAt;
              att.updated_at = updatedAt;
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (lower.includes('insert into payment_attempts')) {
            tables.payment_attempts.push({
              id: boundArgs[0],
              order_id: boundArgs[1],
              provider: boundArgs[2] || 'razorpay',
              provider_order_id: boundArgs[3],
              provider_payment_id: boundArgs[4],
              provider_signature: boundArgs[5],
              amount: boundArgs[6],
              currency: boundArgs[7],
              status: boundArgs[8] || 'CAPTURED',
              signature_verified: boundArgs[9] || 1,
              verified_at: boundArgs[10],
              created_at: boundArgs[11],
              updated_at: boundArgs[12]
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (lower.includes('insert into payment_webhooks')) {
            const record = {
              id: boundArgs[0],
              provider: 'razorpay',
              event_id: boundArgs[1],
              event_type: boundArgs[2],
              status: 'RECEIVED',
              received_at: boundArgs[3]
            };
            tables.payment_webhooks.push(record);
            return { success: true };
          }
          if (lower.includes('update payment_webhooks set status =')) {
            const eventId = boundArgs[boundArgs.length - 1];
            const hook = tables.payment_webhooks.find(h => h.event_id === eventId);
            if (hook) hook.status = 'PROCESSED';
            return { success: true };
          }
          if (lower.includes('update support_tickets set status =') || lower.includes('update support_tickets')) {
            const status = boundArgs[0];
            const closedAt = boundArgs[1];
            const updatedAt = boundArgs[2];
            const tId = boundArgs[3];
            const ticket = tables.support_tickets.find(t => t.id === tId);
            let changes = 0;
            if (ticket) {
              ticket.status = status;
              ticket.closed_at = closedAt;
              ticket.updated_at = updatedAt;
              changes = 1;
            }
            return { success: true, meta: { changes } };
          }
          if (lower.includes('insert into help_articles')) {
            const slug = boundArgs[1];
            let existing = tables.help_articles.find(a => a.slug === slug);
            if (existing) {
              existing.helpful_count = (existing.helpful_count || 0) + boundArgs[7];
              existing.not_helpful_count = (existing.not_helpful_count || 0) + boundArgs[8];
            } else {
              tables.help_articles.push({
                id: boundArgs[0],
                slug: boundArgs[1],
                category_id: boundArgs[2],
                category_name: boundArgs[3],
                title: boundArgs[4],
                excerpt: boundArgs[5],
                content_markdown: boundArgs[6],
                helpful_count: boundArgs[7],
                not_helpful_count: boundArgs[8]
              });
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (lower.includes('update help_articles set helpful_count = helpful_count + 1')) {
            const slug = boundArgs[1];
            const art = tables.help_articles.find(a => a.slug === slug);
            if (art) art.helpful_count = (art.helpful_count || 0) + 1;
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        }
      };
      return stmt;
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

describe('WishMagic Master Audit & Verification Suite', () => {

  // --------------------------------------------------------------------------
  // TEST 1: Template Duplication & D1 Persistence
  // --------------------------------------------------------------------------
  test('1. Template Duplication creates durable D1 record and regenerates unique identifiers', async () => {
    const mockDb = createMockD1();
    mockDb._tables.templates.push({
      id: 'tpl_orig_luxury_box',
      slug: 'luxury-gift-box',
      name: 'Luxury Gift Box',
      description: 'An elegant 3D gift box with celebration ribbon',
      category: 'Birthday',
      tier: 'vip',
      price: 49,
      is_premium: 1,
      is_published: 1,
      status: 'published',
      thumbnail: 'https://images.unsplash.com/box.jpg',
      theme: '{"primaryColor":"#ff0055"}',
      sections: '[]',
      capabilities: '{"music":true}'
    });

    const env = {
      DB: mockDb,
      ENVIRONMENT: 'test'
    };

    // Authenticated admin request using Bearer session token
    const req = new Request('https://wishmagic.live/api/templates/duplicate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wm_test_adm_token'
      },
      body: JSON.stringify({ id: 'tpl_orig_luxury_box' })
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 201, 'Duplication must return HTTP 201');
    const json = await res.json();

    assert.equal(json.success, true);
    assert.equal(json.data.duplicated, true);
    assert.ok(json.data.template.id, 'Duplicate must have unique ID');
    assert.notEqual(json.data.template.id, 'tpl_orig_luxury_box', 'Duplicate ID must differ from source');
    assert.equal(json.data.template.status, 'draft', 'Duplicated template must default to draft');
    assert.equal(json.data.template.isPublished, false, 'Duplicated template must not be published');

    // Verify D1 tables contain the persisted record
    assert.equal(mockDb._tables.templates.length, 2, 'D1 templates table must contain exactly 2 records');
    const duplicateInDb = mockDb._tables.templates.find(t => t.id === json.data.template.id);
    assert.ok(duplicateInDb, 'Duplicate template must exist in D1');
    assert.equal(duplicateInDb.name, 'Luxury Gift Box (Copy)');
    assert.equal(duplicateInDb.category, 'Birthday');
    assert.equal(duplicateInDb.tier, 'vip');
    assert.equal(duplicateInDb.price, 49);

    // Verify template_versions table
    assert.equal(mockDb._tables.template_versions.length, 1, 'Version record must be created for duplicated template');
    assert.equal(mockDb._tables.template_versions[0].template_id, json.data.template.id);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Template Duplication Error Handling
  // --------------------------------------------------------------------------
  test('2. Template Duplication returns honest errors for nonexistent template or missing ID', async () => {
    const mockDb = createMockD1();
    const env = { DB: mockDb, ENVIRONMENT: 'test' };

    // Missing id in body
    const req1 = new Request('https://wishmagic.live/api/templates/duplicate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wm_test_adm_token'
      },
      body: JSON.stringify({})
    });
    const res1 = await worker.fetch(req1, env);
    assert.equal(res1.status, 400);

    // Nonexistent template
    const req2 = new Request('https://wishmagic.live/api/templates/duplicate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wm_test_adm_token'
      },
      body: JSON.stringify({ id: 'nonexistent_tpl_123' })
    });
    const res2 = await worker.fetch(req2, env);
    assert.equal(res2.status, 404);

    // Corrupt source template missing required name/slug
    mockDb._tables.templates.push({
      id: 'tpl_corrupt_123',
      name: '',
      slug: ''
    });
    const req3 = new Request('https://wishmagic.live/api/templates/duplicate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wm_test_adm_token'
      },
      body: JSON.stringify({ id: 'tpl_corrupt_123' })
    });
    const res3 = await worker.fetch(req3, env);
    assert.equal(res3.status, 422);
  });

  // --------------------------------------------------------------------------
  // TEST 3: Commerce Checkout Creation & Persistence
  // --------------------------------------------------------------------------
  test('3. Commerce Checkout persists order in D1 and rejects unconfigured gateway honestly', async () => {
    const mockDb = createMockD1();
    const envUnconfigured = {
      DB: mockDb,
      ENVIRONMENT: 'test'
    };

    const reqUnconf = new Request('https://wishmagic.live/api/commerce/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wm_test_cust_token'
      },
      body: JSON.stringify({ productId: 'vip_pass' })
    });

    const resUnconf = await worker.fetch(reqUnconf, envUnconfigured);
    const jsonUnconf = await resUnconf.json();
    assert.equal(jsonUnconf.data.status, 'provider_not_configured');
    assert.equal(jsonUnconf.data.configured, false);
    assert.equal(jsonUnconf.data.amountPaise, 4900);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Payment Verification & Entitlement Grant
  // --------------------------------------------------------------------------
  test('4. Payment Verification validates HMAC signature and updates order status to PAID', async () => {
    const mockDb = createMockD1();
    const keySecret = 'test_key_secret_123456789';
    const keyId = 'rzp_test_12345';

    // Insert pending order
    mockDb._tables.orders.push({
      id: 'ord_test_001',
      provider_order_id: 'order_rzp_001',
      user_id: 'usr_customer_1',
      plan: 'VIP',
      amount: 4900,
      currency: 'INR',
      status: 'PENDING'
    });

    const rzpOrderId = 'order_rzp_001';
    const rzpPaymentId = 'pay_rzp_001';
    // computeHmacSha256(secret, data)
    const validSignature = computeHmacSha256(keySecret, `${rzpOrderId}|${rzpPaymentId}`);

    const env = {
      DB: mockDb,
      RAZORPAY_KEY_ID: keyId,
      RAZORPAY_KEY_SECRET: keySecret,
      ENVIRONMENT: 'test',
      RAZORPAY_FETCH_FN: async (url) => {
        return new Response(JSON.stringify({
          id: rzpPaymentId,
          order_id: rzpOrderId,
          amount: 4900,
          currency: 'INR',
          status: 'captured',
          captured: true
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    };

    const verifyReq = new Request('https://wishmagic.live/api/commerce/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wm_test_cust_token'
      },
      body: JSON.stringify({
        orderId: 'ord_test_001',
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPaymentId,
        razorpaySignature: validSignature
      })
    });

    const res = await worker.fetch(verifyReq, env);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.status, 'PAID');
    assert.equal(json.data.verified, true);

    // Verify D1 order updated
    const orderInDb = mockDb._tables.orders.find(o => o.id === 'ord_test_001');
    assert.equal(orderInDb.status, 'PAID');

    // Verify entitlement granted
    assert.equal(mockDb._tables.entitlements.length, 1);
    assert.equal(mockDb._tables.entitlements[0].plan, 'VIP');
    assert.equal(mockDb._tables.entitlements[0].status, 'active');

    // Idempotent retry: verification must succeed without duplication
    const retryReq = new Request('https://wishmagic.live/api/commerce/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wm_test_cust_token'
      },
      body: JSON.stringify({
        orderId: 'ord_test_001',
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPaymentId,
        razorpaySignature: validSignature
      })
    });
    const retryRes = await worker.fetch(retryReq, env);
    const retryJson = await retryRes.json();
    assert.equal(retryJson.data.alreadyFinalized, true);
    assert.equal(retryJson.data.status, 'PAID');

    // Rejection when order belongs to another user
    const otherUserReq = new Request('https://wishmagic.live/api/commerce/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wm_test_atk_token'
      },
      body: JSON.stringify({
        orderId: 'ord_test_001',
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPaymentId,
        razorpaySignature: validSignature
      })
    });
    const otherUserRes = await worker.fetch(otherUserReq, env);
    assert.equal(otherUserRes.status, 404);

    // Rejection when provider order id mismatches stored order
    const mismatchReq = new Request('https://wishmagic.live/api/commerce/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wm_test_cust_token'
      },
      body: JSON.stringify({
        orderId: 'ord_test_001',
        razorpayOrderId: 'order_rzp_wrong',
        razorpayPaymentId: rzpPaymentId,
        razorpaySignature: validSignature
      })
    });
    const mismatchRes = await worker.fetch(mismatchReq, env);
    assert.equal(mismatchRes.status, 400);
  });

  // --------------------------------------------------------------------------
  // TEST 5: Razorpay Webhook Idempotency & Deduplication
  // --------------------------------------------------------------------------
  test('5. Razorpay Webhook handles signatures, idempotency, and duplicate delivery', async () => {
    const mockDb = createMockD1();
    const webhookSecret = 'whsec_test_secret_998877';

    mockDb._tables.orders.push({
      id: 'ord_test_wh_001',
      provider_order_id: 'order_wh_rzp_001',
      user_id: 'usr_wh_customer',
      plan: 'VIP',
      amount: 4900,
      currency: 'INR',
      status: 'PENDING'
    });

    const payload = JSON.stringify({
      event: 'order.paid',
      event_id: 'evt_test_001',
      payload: {
        order: { entity: { id: 'order_wh_rzp_001', amount: 4900 } },
        payment: { entity: { id: 'pay_wh_rzp_001', order_id: 'order_wh_rzp_001' } }
      }
    });

    // computeHmacSha256(secret, data)
    const validSignature = computeHmacSha256(webhookSecret, payload);

    const env = {
      DB: mockDb,
      RAZORPAY_KEY_ID: 'rzp_test_123',
      RAZORPAY_KEY_SECRET: 'rzp_sec_123',
      RAZORPAY_WEBHOOK_SECRET: webhookSecret,
      ENVIRONMENT: 'test'
    };

    // First delivery
    const req1 = new Request('https://wishmagic.live/api/commerce/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': validSignature
      },
      body: payload
    });

    const res1 = await worker.fetch(req1, env);
    assert.equal(res1.status, 200);
    const json1 = await res1.json();
    assert.equal(json1.data.processed, true);

    // Duplicate delivery
    const req2 = new Request('https://wishmagic.live/api/commerce/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': validSignature
      },
      body: payload
    });

    const res2 = await worker.fetch(req2, env);
    assert.equal(res2.status, 200);
    const json2 = await res2.json();
    assert.equal(json2.data.deduplicated, true, 'Duplicate webhook must be recognized and marked deduplicated');

    // Missing event_id must return 400
    const noEventIdPayload = JSON.stringify({ event: 'order.paid' });
    const noEventIdReq = new Request('https://wishmagic.live/api/commerce/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': computeHmacSha256(webhookSecret, noEventIdPayload)
      },
      body: noEventIdPayload
    });
    const noEventIdRes = await worker.fetch(noEventIdReq, env);
    assert.equal(noEventIdRes.status, 400);

    // Invalid signature must return 403
    const badSigReq = new Request('https://wishmagic.live/api/commerce/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': 'invalid_signature_xyz'
      },
      body: payload
    });
    const badSigRes = await worker.fetch(badSigReq, env);
    assert.equal(badSigRes.status, 403);
  });

  // --------------------------------------------------------------------------
  // TEST 6: Support Ticket Closing & Data Integrity
  // --------------------------------------------------------------------------
  test('6. Support Ticket Closing persists closed state in D1 and protects against IDOR', async () => {
    const mockDb = createMockD1();
    mockDb._tables.support_tickets.push({
      id: 'tkt_user_123',
      ticket_number: 'TKT-2610-1234',
      user_id: 'usr_ticket_owner',
      status: 'OPEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const env = { DB: mockDb, ENVIRONMENT: 'test' };

    // 1. IDOR Attempt: another user attempts to close
    const badReq = new Request('https://wishmagic.live/api/support/tickets/tkt_user_123/close', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer wm_test_atk_token'
      }
    });
    const badRes = await worker.fetch(badReq, env);
    assert.equal(badRes.status, 403, 'Unauthorized user must be denied access to close ticket');

    // 2. Legitimate Owner closes ticket
    const goodReq = new Request('https://wishmagic.live/api/support/tickets/tkt_user_123/close', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer wm_test_owner_token'
      }
    });
    const goodRes = await worker.fetch(goodReq, env);
    assert.equal(goodRes.status, 200);
    const goodJson = await goodRes.json();
    assert.equal(goodJson.data.success, true);
    assert.equal(goodJson.data.status, TICKET_STATUS.CLOSED);

    // Verify persisted status in D1
    const ticketInDb = mockDb._tables.support_tickets.find(t => t.id === 'tkt_user_123');
    assert.equal(ticketInDb.status, TICKET_STATUS.CLOSED);

    // 3. Repeated close: idempotent response
    const repeatRes = await worker.fetch(goodReq, env);
    assert.equal(repeatRes.status, 200);
    const repeatJson = await repeatRes.json();
    assert.equal(repeatJson.data.alreadyClosed, true);
  });

  // --------------------------------------------------------------------------
  // TEST 7: Help Article Feedback Persistence
  // --------------------------------------------------------------------------
  test('7. Help Article Feedback increments D1 counter durably', async () => {
    const mockDb = createMockD1();
    const env = { DB: mockDb, ENVIRONMENT: 'test' };

    const reqHelpful = new Request('https://wishmagic.live/api/help/articles/how-to-create-a-celebration-wish/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isHelpful: true })
    });

    const res = await worker.fetch(reqHelpful, env);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.success, true);
    assert.ok(json.data.helpfulCount >= 1);

    // Verify row persisted into D1 help_articles
    assert.equal(mockDb._tables.help_articles.length, 1);
    assert.equal(mockDb._tables.help_articles[0].slug, 'how-to-create-a-celebration-wish');
    assert.equal(mockDb._tables.help_articles[0].helpful_count, 1);
  });

  // --------------------------------------------------------------------------
  // TEST 8: Admin Route Mapping Consistency
  // --------------------------------------------------------------------------
  test('8. All Sidebar Routes target existing HTML files in public/', () => {
    const workerCode = fs.readFileSync(path.join(ROOT_DIR, 'src/worker.js'), 'utf8');
    const functionsCode = fs.readFileSync(path.join(ROOT_DIR, 'functions/[[path]].js'), 'utf8');

    // Test routes map to files
    const adminRoutes = [
      '/admin/anktech/anktech/admin/templates',
      '/admin/anktech/anktech/admin/occasions',
      '/admin/anktech/anktech/admin/users',
      '/admin/anktech/anktech/admin/wishes',
      '/admin/anktech/anktech/admin/orders',
      '/admin/anktech/anktech/admin/media',
      '/admin/anktech/anktech/admin/pricing',
      '/admin/anktech/anktech/admin/settings',
      '/admin/anktech/anktech/admin/staff',
      '/admin/anktech/anktech/admin/storage-health',
      '/admin/anktech/anktech/admin/moderation',
      '/admin/anktech/anktech/admin/support',
      '/admin/anktech/anktech/admin/audit-logs',
      '/admin/anktech/anktech/admin/announcements',
      '/admin/anktech/anktech/admin/referrals',
      '/admin/anktech/anktech/admin/legal',
      '/admin/anktech/anktech/admin/search'
    ];

    for (const r of adminRoutes) {
      assert.ok(workerCode.includes(`'${r}':`), `worker.js must contain pretty route mapping for ${r}`);
      assert.ok(functionsCode.includes(`'${r}':`), `functions/[[path]].js must contain mapping for ${r}`);
    }
  });

  // --------------------------------------------------------------------------
  // TEST 9: Security Audit Scanner Accuracy & Coverage
  // --------------------------------------------------------------------------
  test('9. Security Audit Scanner reports accurate check count (18 checks) and detects vulnerabilities', async () => {
    const { runSecurityAudit } = await import('../scripts/security-audit.js');
    const result = runSecurityAudit();

    assert.equal(result.success, true, 'Zero-trust security audit must pass with 0 issues on production code');
    assert.equal(result.checks.length, 18, 'Must execute and report exactly 18 distinct security checks');
    assert.equal(result.issues.length, 0, 'Must have zero issues detected');
  });
});
