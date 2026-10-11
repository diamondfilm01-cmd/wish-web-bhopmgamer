/**
 * WishMagic Part 32: Production-Grade Razorpay Webhook Test Suite
 * ===============================================================
 * Validates production-grade Razorpay webhook lifecycle, cryptographic
 * authentication, deduplication, state transitions, cumulative refunds,
 * D1 batch persistence, and failure recovery.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { computeHmacSha256 } from '../src/commerce-engine.js';

function createMockD1() {
  const tables = {
    orders: [],
    order_items: [],
    payment_attempts: [],
    payment_webhooks: [],
    refunds: [],
    entitlements: []
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
          if (lower.includes('from payment_webhooks where')) {
            const eventId = boundArgs[0];
            return tables.payment_webhooks.find(w => w.event_id === eventId) || null;
          }
          if (lower.includes('from orders where')) {
            if (lower.includes('provider_order_id = ?')) {
              const provId = boundArgs[0];
              return tables.orders.find(o => o.provider_order_id === provId) || null;
            }
            if (lower.includes('transaction_id = ?')) {
              const txId = boundArgs[0];
              return tables.orders.find(o => o.transaction_id === txId) || null;
            }
            const id = boundArgs[0];
            return tables.orders.find(o => o.id === id) || null;
          }
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          const lower = sql.toLowerCase();
          if (lower.includes('insert into payment_webhooks')) {
            // INSERT INTO payment_webhooks (id, provider, event_id, event_type, status, received_at) VALUES (?, 'razorpay', ?, ?, 'RECEIVED', ?)
            tables.payment_webhooks.push({
              id: boundArgs[0],
              provider: 'razorpay',
              event_id: boundArgs[1],
              event_type: boundArgs[2],
              status: 'RECEIVED',
              received_at: boundArgs[3]
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (lower.includes('update payment_webhooks set')) {
            const eventId = boundArgs[boundArgs.length - 1];
            const hook = tables.payment_webhooks.find(h => h.event_id === eventId);
            if (hook) {
              if (lower.includes("status = 'ignored'")) hook.status = 'IGNORED';
              if (lower.includes("status = 'processed'")) hook.status = 'PROCESSED';
              if (lower.includes("status = 'failed'")) hook.status = 'FAILED';
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (lower.includes('update orders set status =')) {
            if (lower.includes("status = 'paid'")) {
              const txId = boundArgs[0];
              const ordId = boundArgs[3];
              const ord = tables.orders.find(o => o.id === ordId);
              if (ord) {
                ord.status = 'PAID';
                ord.transaction_id = txId;
              }
            } else {
              const status = boundArgs[0];
              const totRefunded = boundArgs[1];
              const ordId = boundArgs[3];
              const ord = tables.orders.find(o => o.id === ordId);
              if (ord) {
                ord.status = status;
                ord.total_refunded = totRefunded;
              }
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (lower.includes('update payment_attempts set')) {
            const payId = boundArgs[0];
            const provOrderId = boundArgs[3];
            const att = tables.payment_attempts.find(a => a.provider_order_id === provOrderId);
            if (att) {
              att.status = 'CAPTURED';
              att.provider_payment_id = payId;
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (lower.includes('update entitlements set')) {
            // UPDATE entitlements SET status = 'revoked', updated_at = ? WHERE user_id = ? AND id = ?
            const status = 'revoked';
            const uId = boundArgs[1];
            const entId = boundArgs[2];
            const ent = tables.entitlements.find(e => e.id === entId || e.user_id === uId);
            if (ent) {
              ent.status = status;
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (lower.includes('into entitlements')) {
            tables.entitlements.push({
              id: boundArgs[0],
              user_id: boundArgs[1],
              plan: boundArgs[2],
              status: boundArgs[3] || 'active'
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (lower.includes('into refunds')) {
            tables.refunds.push({
              id: boundArgs[0],
              order_id: boundArgs[1],
              provider_refund_id: boundArgs[2],
              amount: boundArgs[3],
              currency: boundArgs[4],
              status: 'SUCCEEDED'
            });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true };
        }
      };
      return stmt;
    },
    async batch(statements) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    }
  };
}

test('WishMagic Part 32: Production-Grade Razorpay Webhook Suite', async (t) => {
  const webhookSecret = 'whsec_prod_safe_secret_7788';
  const keyId = 'rzp_test_123';
  const keySecret = 'rzp_sec_456';

  function buildEnv(mockDb, overrides = {}) {
    return {
      DB: mockDb,
      RAZORPAY_KEY_ID: keyId,
      RAZORPAY_KEY_SECRET: keySecret,
      RAZORPAY_WEBHOOK_SECRET: webhookSecret,
      ENVIRONMENT: 'production',
      ...overrides
    };
  }

  // 1. Missing Webhook Secret Configuration
  await t.test('1. Reject when webhook secret is unconfigured (503)', async () => {
    const mockDb = createMockD1();
    const env = buildEnv(mockDb, { RAZORPAY_WEBHOOK_SECRET: null });
    const payload = JSON.stringify({ event: 'order.paid', id: 'evt_1' });

    const req = new Request('https://wishmagic.live/api/commerce/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'sig' },
      body: payload
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 503);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.error.code, 'PAYMENT_PROVIDER_NOT_CONFIGURED');
  });

  // 2. Cryptographic Authentication & Tamper Resistance
  await t.test('2. Reject invalid or tampered webhook signatures (403)', async () => {
    const mockDb = createMockD1();
    const env = buildEnv(mockDb);
    const payload = JSON.stringify({ event: 'order.paid', id: 'evt_tamper_1' });

    // Missing signature
    const reqNoSig = new Request('https://wishmagic.live/api/commerce/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
    const resNoSig = await worker.fetch(reqNoSig, env);
    assert.equal(resNoSig.status, 403);

    // Invalid signature
    const reqBadSig = new Request('https://wishmagic.live/api/commerce/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'fake_signature_abc' },
      body: payload
    });
    const resBadSig = await worker.fetch(reqBadSig, env);
    assert.equal(resBadSig.status, 403);

    // Tampered payload with original signature
    const validSig = computeHmacSha256(webhookSecret, payload);
    const tamperedPayload = JSON.stringify({ event: 'order.paid', id: 'evt_tamper_1', injected: true });
    const reqTampered = new Request('https://wishmagic.live/api/commerce/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': validSig },
      body: tamperedPayload
    });
    const resTampered = await worker.fetch(reqTampered, env);
    assert.equal(resTampered.status, 403);
  });

  // 3. Payload Integrity: Malformed JSON
  await t.test('3. Reject malformed JSON body safely without crash (400)', async () => {
    const mockDb = createMockD1();
    const env = buildEnv(mockDb);
    const brokenBody = '{ event: "order.paid", unclosed json ';
    const sig = computeHmacSha256(webhookSecret, brokenBody);

    const req = new Request('https://wishmagic.live/api/commerce/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
      body: brokenBody
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error.code, 'BAD_REQUEST');
  });

  // 4. Header-derived vs Payload Event Identity & Deduplication
  await t.test('4. Support X-Razorpay-Event-Id header and deduplicate replays', async () => {
    const mockDb = createMockD1();
    const env = buildEnv(mockDb);

    mockDb._tables.orders.push({
      id: 'ord_wh_head_1',
      user_id: 'usr_head_customer',
      plan: 'VIP',
      amount: 4900,
      currency: 'INR',
      provider_order_id: 'order_head_rzp_99',
      status: 'PENDING'
    });

    mockDb._tables.payment_attempts.push({
      id: 'att_head_1',
      order_id: 'ord_wh_head_1',
      provider_order_id: 'order_head_rzp_99',
      status: 'PENDING'
    });

    const payload = JSON.stringify({
      event: 'order.paid',
      payload: {
        order: { entity: { id: 'order_head_rzp_99', amount: 4900 } },
        payment: { entity: { id: 'pay_head_rzp_99', order_id: 'order_head_rzp_99' } }
      }
    });

    const validSig = computeHmacSha256(webhookSecret, payload);

    // First delivery via X-Razorpay-Event-Id header
    const req1 = new Request('https://wishmagic.live/api/commerce/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': validSig,
        'x-razorpay-event-id': 'evt_header_rzp_unique_42'
      },
      body: payload
    });

    const res1 = await worker.fetch(req1, env);
    assert.equal(res1.status, 200);
    const json1 = await res1.json();
    assert.equal(json1.data.processed, true);
    assert.equal(json1.data.eventId, 'evt_header_rzp_unique_42');

    // Verify order marked PAID and entitlement created
    const ord = mockDb._tables.orders.find(o => o.id === 'ord_wh_head_1');
    assert.equal(ord.status, 'PAID');
    assert.equal(mockDb._tables.entitlements.length, 1);

    // Replay delivery: must be deduplicated
    const req2 = new Request('https://wishmagic.live/api/commerce/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': validSig,
        'x-razorpay-event-id': 'evt_header_rzp_unique_42'
      },
      body: payload
    });

    const res2 = await worker.fetch(req2, env);
    assert.equal(res2.status, 200);
    const json2 = await res2.json();
    assert.equal(json2.data.deduplicated, true);
    assert.equal(mockDb._tables.entitlements.length, 1, 'Entitlement must not be duplicated');
  });

  // 5. Cumulative Refund Handling (Partial vs Full Refund)
  await t.test('5. Webhook handles cumulative partial refunds and full entitlement revocation', async () => {
    const mockDb = createMockD1();
    const env = buildEnv(mockDb);

    // Initial paid order
    mockDb._tables.orders.push({
      id: 'ord_ref_test_1',
      user_id: 'usr_refund_bob',
      plan: 'VIP',
      amount: 10000, // ₹100.00
      currency: 'INR',
      transaction_id: 'pay_bob_captured_77',
      total_refunded: 0,
      status: 'PAID'
    });

    mockDb._tables.entitlements.push({
      id: 'ent_usr_refund_bob_ord_ref_test_1',
      user_id: 'usr_refund_bob',
      plan: 'VIP',
      status: 'active'
    });

    // 1st partial refund event: ₹40.00 (4000 paise)
    const refundPayload1 = JSON.stringify({
      event: 'refund.processed',
      event_id: 'evt_ref_part_1',
      payload: {
        refund: {
          entity: {
            id: 'rfnd_bob_1',
            payment_id: 'pay_bob_captured_77',
            amount: 4000
          }
        }
      }
    });

    const sig1 = computeHmacSha256(webhookSecret, refundPayload1);
    const res1 = await worker.fetch(new Request('https://wishmagic.live/api/commerce/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig1 },
      body: refundPayload1
    }), env);

    assert.equal(res1.status, 200);
    const json1 = await res1.json();
    assert.equal(json1.data.status, 'PARTIALLY_REFUNDED');
    assert.equal(json1.data.totalRefunded, 4000);

    const ordAfterPart1 = mockDb._tables.orders.find(o => o.id === 'ord_ref_test_1');
    assert.equal(ordAfterPart1.status, 'PARTIALLY_REFUNDED');
    assert.equal(ordAfterPart1.total_refunded, 4000);
    // Entitlement must remain active after partial refund
    const entAfterPart1 = mockDb._tables.entitlements.find(e => e.user_id === 'usr_refund_bob');
    assert.equal(entAfterPart1.status, 'active');

    // 2nd refund event: remaining ₹60.00 (6000 paise) -> cumulative reaches 10000 paise (100%)
    const refundPayload2 = JSON.stringify({
      event: 'refund.processed',
      event_id: 'evt_ref_part_2',
      payload: {
        refund: {
          entity: {
            id: 'rfnd_bob_2',
            payment_id: 'pay_bob_captured_77',
            amount: 6000
          }
        }
      }
    });

    const sig2 = computeHmacSha256(webhookSecret, refundPayload2);
    const res2 = await worker.fetch(new Request('https://wishmagic.live/api/commerce/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig2 },
      body: refundPayload2
    }), env);

    assert.equal(res2.status, 200);
    const json2 = await res2.json();
    assert.equal(json2.data.status, 'REFUNDED');
    assert.equal(json2.data.totalRefunded, 10000);

    const ordAfterFull = mockDb._tables.orders.find(o => o.id === 'ord_ref_test_1');
    assert.equal(ordAfterFull.status, 'REFUNDED');
    assert.equal(ordAfterFull.total_refunded, 10000);
    // Entitlement must now be revoked
    const entAfterFull = mockDb._tables.entitlements.find(e => e.user_id === 'usr_refund_bob');
    assert.equal(entAfterFull.status, 'revoked');
  });

  // 6. Ignored Events Return processed: false
  await t.test('6. Unmatched or unsupported events return honest processed: false', async () => {
    const mockDb = createMockD1();
    const env = buildEnv(mockDb);

    // Unsupported event type (e.g., payment.dispute.created)
    const unsupportedPayload = JSON.stringify({
      event: 'payment.dispute.created',
      event_id: 'evt_unsupported_99',
      payload: {}
    });

    const sig = computeHmacSha256(webhookSecret, unsupportedPayload);
    const res = await worker.fetch(new Request('https://wishmagic.live/api/commerce/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
      body: unsupportedPayload
    }), env);

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.processed, false);
    assert.equal(json.data.ignored, true);
    assert.equal(json.data.reason, 'UNSUPPORTED_EVENT_TYPE');

    // Verify logged in payment_webhooks as IGNORED
    const hook = mockDb._tables.payment_webhooks.find(h => h.event_id === 'evt_unsupported_99');
    assert.equal(hook.status, 'IGNORED');
  });
});
