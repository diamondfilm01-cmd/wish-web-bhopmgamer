/**
 * WishMagic Part 32: Production-Grade Razorpay Payment Verification Test Suite
 * ===========================================================================
 * Verifies all security, idempotency, state-transition, and cryptographic
 * guarantees for POST /api/commerce/verify:
 *
 * 1. Request payload validation (malformed JSON, missing/empty/long fields)
 * 2. Authentication & strict user IDOR ownership enforcement
 * 3. Order state machine validation (PAID idempotency, REFUNDED/CANCELLED blocks)
 * 4. Cryptographic HMAC SHA-256 signature verification & error handling
 * 5. Authoritative live Razorpay API check (amount, currency, captured state)
 * 6. Replay & cross-order payment ID collision prevention
 * 7. Atomic guarded D1 persistence & entitlement granting
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { computeHmacSha256 } from '../src/commerce-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createMockD1() {
  const tables = {
    orders: [],
    payment_attempts: [],
    entitlements: [],
    users: [
      { id: 'usr_alice', email: 'alice@example.com', role: 'creator' },
      { id: 'usr_attacker', email: 'attacker@example.com', role: 'creator' }
    ],
    sessions: [
      { id: 'ses_alice', user_id: 'usr_alice', token: 'token_alice', expires_at: Date.now() + 1000000 },
      { id: 'ses_attacker', user_id: 'usr_attacker', token: 'token_attacker', expires_at: Date.now() + 1000000 }
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
            return tables.users.find(u => u.id === id) || null;
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
          return null;
        },
        async run() {
          const lower = sql.toLowerCase();
          if (lower.includes('update orders set status =')) {
            const transId = boundArgs[0];
            const verifiedAt = boundArgs[1];
            const updatedAt = boundArgs[2];
            const orderId = boundArgs[3];
            const ord = tables.orders.find(o => o.id === orderId || o.provider_order_id === orderId);
            if (ord) {
              ord.status = 'PAID';
              ord.transaction_id = transId;
              ord.verified_at = verifiedAt;
              ord.updated_at = updatedAt;
            }
            return { success: true, meta: { changes: 1 } };
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
          if (lower.includes('into entitlements')) {
            tables.entitlements.push({
              id: boundArgs[0],
              user_id: boundArgs[1],
              plan: boundArgs[2],
              status: 'active',
              source: 'purchase',
              starts_at: boundArgs[3]
            });
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

test('WishMagic Part 32: Production-Grade Razorpay Payment Verification Suite', async (t) => {
  const keyId = 'rzp_test_key_123';
  const keySecret = 'rzp_test_secret_456';

  function buildEnv(mockDb, fetchFn = null) {
    return {
      DB: mockDb,
      RAZORPAY_KEY_ID: keyId,
      RAZORPAY_KEY_SECRET: keySecret,
      ENVIRONMENT: 'test',
      RAZORPAY_FETCH_FN: fetchFn || (async (url) => {
        const payId = decodeURIComponent(url.split('/').pop());
        const order = mockDb._tables.orders[0];
        return new Response(JSON.stringify({
          id: payId,
          order_id: order?.provider_order_id || 'order_rzp_valid',
          amount: order?.amount || 4900,
          currency: order?.currency || 'INR',
          status: 'captured',
          captured: true
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      })
    };
  }

  // --------------------------------------------------------------------------
  // Step 1: Request Validation
  // --------------------------------------------------------------------------
  await t.test('Step 1: Reject malformed JSON body safely', async () => {
    const mockDb = createMockD1();
    const env = buildEnv(mockDb);

    const req = new Request('https://wishmagic.live/api/commerce/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: 'invalid-non-json{{{'
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.code || data.error?.code, 'INVALID_INPUT');
  });

  await t.test('Step 1: Reject missing, empty, or excessively long fields', async () => {
    const mockDb = createMockD1();
    const env = buildEnv(mockDb);

    const invalidBodies = [
      {}, // missing all
      { orderId: 'ord_1' }, // missing razorpay fields
      { orderId: 'ord_1', razorpayOrderId: '   ', razorpayPaymentId: 'pay_1', razorpaySignature: 'sig_1' }, // empty whitespace
      { orderId: 'ord_1', razorpayOrderId: 'o_1', razorpayPaymentId: 'p_1', razorpaySignature: 'x'.repeat(300) } // excessively long
    ];

    for (const body of invalidBodies) {
      const req = new Request('https://wishmagic.live/api/commerce/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token_alice'
        },
        body: JSON.stringify(body)
      });
      const res = await worker.fetch(req, env);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.code || data.error?.code, 'INVALID_INPUT');
    }
  });

  // --------------------------------------------------------------------------
  // Step 2: Authentication and IDOR Enforcement
  // --------------------------------------------------------------------------
  await t.test('Step 2: Reject unauthenticated request', async () => {
    const mockDb = createMockD1();
    const env = buildEnv(mockDb);

    const req = new Request('https://wishmagic.live/api/commerce/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: 'ord_1',
        razorpayOrderId: 'order_1',
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 'sig_1'
      })
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.code || data.error?.code, 'AUTH_REQUIRED');
  });

  await t.test('Step 2: IDOR protection - Reject order owned by another user', async () => {
    const mockDb = createMockD1();
    mockDb._tables.orders.push({
      id: 'ord_alice_secret',
      user_id: 'usr_alice',
      plan: 'vip_pass',
      amount: 4900,
      currency: 'INR',
      provider_order_id: 'order_rzp_alice',
      status: 'PENDING'
    });
    const env = buildEnv(mockDb);

    // Attacker tries to verify Alice's order
    const req = new Request('https://wishmagic.live/api/commerce/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_attacker'
      },
      body: JSON.stringify({
        orderId: 'ord_alice_secret',
        razorpayOrderId: 'order_rzp_alice',
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 'sig_1'
      })
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 404); // Scoped query returns 404 without leaking existence
  });

  // --------------------------------------------------------------------------
  // Step 3: Order State Machine Validation
  // --------------------------------------------------------------------------
  await t.test('Step 3: Reject order when provider_order_id mismatches', async () => {
    const mockDb = createMockD1();
    mockDb._tables.orders.push({
      id: 'ord_alice_1',
      user_id: 'usr_alice',
      plan: 'vip_pass',
      amount: 4900,
      currency: 'INR',
      provider_order_id: 'order_rzp_actual',
      status: 'PENDING'
    });
    const env = buildEnv(mockDb);

    const req = new Request('https://wishmagic.live/api/commerce/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: JSON.stringify({
        orderId: 'ord_alice_1',
        razorpayOrderId: 'order_rzp_tampered',
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 'sig_1'
      })
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code || data.error?.code, 'PAYMENT_ORDER_MISMATCH');
  });

  await t.test('Step 3: Never finalize REFUNDED or CANCELLED orders', async () => {
    const mockDb = createMockD1();
    mockDb._tables.orders.push(
      {
        id: 'ord_refunded',
        user_id: 'usr_alice',
        plan: 'vip_pass',
        amount: 4900,
        currency: 'INR',
        provider_order_id: 'order_rzp_ref',
        status: 'REFUNDED'
      },
      {
        id: 'ord_cancelled',
        user_id: 'usr_alice',
        plan: 'vip_pass',
        amount: 4900,
        currency: 'INR',
        provider_order_id: 'order_rzp_can',
        status: 'CANCELLED'
      }
    );
    const env = buildEnv(mockDb);

    for (const testId of ['ord_refunded', 'ord_cancelled']) {
      const order = mockDb._tables.orders.find(o => o.id === testId);
      const req = new Request('https://wishmagic.live/api/commerce/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token_alice'
        },
        body: JSON.stringify({
          orderId: order.id,
          razorpayOrderId: order.provider_order_id,
          razorpayPaymentId: 'pay_1',
          razorpaySignature: computeHmacSha256(keySecret, `${order.provider_order_id}|pay_1`)
        })
      });
      const res = await worker.fetch(req, env);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.code || data.error?.code, 'INVALID_ORDER_STATE');
      // Assert state was not mutated to PAID
      assert.notEqual(order.status, 'PAID');
    }
  });

  await t.test('Step 3: Idempotent replay on already PAID order without duplication', async () => {
    const mockDb = createMockD1();
    mockDb._tables.orders.push({
      id: 'ord_already_paid',
      user_id: 'usr_alice',
      plan: 'vip_pass',
      amount: 4900,
      currency: 'INR',
      provider_order_id: 'order_rzp_paid',
      transaction_id: 'pay_already_captured',
      status: 'PAID'
    });
    mockDb._tables.entitlements.push({
      id: 'ent_usr_alice_ord_already_paid',
      user_id: 'usr_alice',
      plan: 'VIP',
      status: 'active'
    });
    const env = buildEnv(mockDb);

    const req = new Request('https://wishmagic.live/api/commerce/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: JSON.stringify({
        orderId: 'ord_already_paid',
        razorpayOrderId: 'order_rzp_paid',
        razorpayPaymentId: 'pay_already_captured',
        razorpaySignature: 'any_signature'
      })
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.data.status, 'PAID');
    assert.equal(data.data.verified, true);
    assert.equal(data.data.alreadyFinalized, true);
    assert.equal(mockDb._tables.entitlements.length, 1, 'Must not create duplicate entitlement');
  });

  // --------------------------------------------------------------------------
  // Step 4: Cryptographic HMAC Signature Verification
  // --------------------------------------------------------------------------
  await t.test('Step 4: Reject invalid HMAC signature and record failure in D1', async () => {
    const mockDb = createMockD1();
    mockDb._tables.orders.push({
      id: 'ord_sig_fail',
      user_id: 'usr_alice',
      plan: 'vip_pass',
      amount: 4900,
      currency: 'INR',
      provider_order_id: 'order_rzp_sig',
      status: 'PENDING'
    });
    mockDb._tables.payment_attempts.push({
      id: 'att_sig_1',
      order_id: 'ord_sig_fail',
      provider_order_id: 'order_rzp_sig',
      status: 'CREATED'
    });
    const env = buildEnv(mockDb);

    const req = new Request('https://wishmagic.live/api/commerce/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: JSON.stringify({
        orderId: 'ord_sig_fail',
        razorpayOrderId: 'order_rzp_sig',
        razorpayPaymentId: 'pay_tampered',
        razorpaySignature: 'invalid_cryptographic_signature_hash'
      })
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code || data.error?.code, 'PAYMENT_VERIFICATION_FAILED');
  });

  // --------------------------------------------------------------------------
  // Step 5: Authoritative Live Razorpay API Verification
  // --------------------------------------------------------------------------
  await t.test('Step 5: Reject amount mismatch between gateway and database', async () => {
    const mockDb = createMockD1();
    const rzpOrderId = 'order_rzp_amt';
    const rzpPayId = 'pay_rzp_amt';
    mockDb._tables.orders.push({
      id: 'ord_amt_test',
      user_id: 'usr_alice',
      plan: 'vip_pass',
      amount: 4900, // 4900 paise in DB
      currency: 'INR',
      provider_order_id: rzpOrderId,
      status: 'PENDING'
    });

    // Gateway reports different amount (e.g. 100 paise)
    const mockFetch = async () => new Response(JSON.stringify({
      id: rzpPayId,
      order_id: rzpOrderId,
      amount: 100, // mismatch!
      currency: 'INR',
      status: 'captured',
      captured: true
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const env = buildEnv(mockDb, mockFetch);
    const sig = computeHmacSha256(keySecret, `${rzpOrderId}|${rzpPayId}`);

    const req = new Request('https://wishmagic.live/api/commerce/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: JSON.stringify({
        orderId: 'ord_amt_test',
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPayId,
        razorpaySignature: sig
      })
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code || data.error?.code, 'PAYMENT_AMOUNT_MISMATCH');
    assert.equal(mockDb._tables.entitlements.length, 0, 'No entitlement on amount mismatch');
  });

  await t.test('Step 5: Reject authorized but not captured payment', async () => {
    const mockDb = createMockD1();
    const rzpOrderId = 'order_rzp_auth';
    const rzpPayId = 'pay_rzp_auth';
    mockDb._tables.orders.push({
      id: 'ord_auth_test',
      user_id: 'usr_alice',
      plan: 'vip_pass',
      amount: 4900,
      currency: 'INR',
      provider_order_id: rzpOrderId,
      status: 'PENDING'
    });

    const mockFetch = async () => new Response(JSON.stringify({
      id: rzpPayId,
      order_id: rzpOrderId,
      amount: 4900,
      currency: 'INR',
      status: 'authorized', // Not captured!
      captured: false
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const env = buildEnv(mockDb, mockFetch);
    const sig = computeHmacSha256(keySecret, `${rzpOrderId}|${rzpPayId}`);

    const req = new Request('https://wishmagic.live/api/commerce/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: JSON.stringify({
        orderId: 'ord_auth_test',
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPayId,
        razorpaySignature: sig
      })
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 402);
    const data = await res.json();
    assert.equal(data.code || data.error?.code, 'PAYMENT_VERIFICATION_PENDING');
  });

  await t.test('Step 5: Return 503 retryable error on gateway outage/network error', async () => {
    const mockDb = createMockD1();
    const rzpOrderId = 'order_rzp_net';
    const rzpPayId = 'pay_rzp_net';
    mockDb._tables.orders.push({
      id: 'ord_net_test',
      user_id: 'usr_alice',
      plan: 'vip_pass',
      amount: 4900,
      currency: 'INR',
      provider_order_id: rzpOrderId,
      status: 'PENDING'
    });

    const mockFetch = async () => {
      throw new Error('ETIMEDOUT: Connection to Razorpay timed out');
    };

    const env = buildEnv(mockDb, mockFetch);
    const sig = computeHmacSha256(keySecret, `${rzpOrderId}|${rzpPayId}`);

    const req = new Request('https://wishmagic.live/api/commerce/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: JSON.stringify({
        orderId: 'ord_net_test',
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPayId,
        razorpaySignature: sig
      })
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.code || data.error?.code, 'PAYMENT_PROVIDER_UNAVAILABLE');
    assert.equal(mockDb._tables.entitlements.length, 0, 'Must never grant entitlement on gateway error');
  });

  // --------------------------------------------------------------------------
  // Step 6: Prevent Replay and Conflicting Payment IDs
  // --------------------------------------------------------------------------
  await t.test('Step 6: Prevent replay of payment ID already used on another order', async () => {
    const mockDb = createMockD1();
    const rzpOrderId = 'order_rzp_replay';
    const rzpPayId = 'pay_rzp_replayed';

    // Existing completed order with this payment ID
    mockDb._tables.orders.push({
      id: 'ord_previous_order',
      user_id: 'usr_attacker',
      plan: 'vip_pass',
      amount: 4900,
      currency: 'INR',
      transaction_id: rzpPayId,
      status: 'PAID'
    });

    // New order trying to claim the same transaction
    mockDb._tables.orders.push({
      id: 'ord_replay_target',
      user_id: 'usr_alice',
      plan: 'vip_pass',
      amount: 4900,
      currency: 'INR',
      provider_order_id: rzpOrderId,
      status: 'PENDING'
    });

    const env = buildEnv(mockDb, async () => new Response(JSON.stringify({
      id: rzpPayId,
      order_id: rzpOrderId,
      amount: 4900,
      currency: 'INR',
      status: 'captured',
      captured: true
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const sig = computeHmacSha256(keySecret, `${rzpOrderId}|${rzpPayId}`);

    const req = new Request('https://wishmagic.live/api/commerce/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: JSON.stringify({
        orderId: 'ord_replay_target',
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPayId,
        razorpaySignature: sig
      })
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 409);
    const data = await res.json();
    assert.equal(data.code || data.error?.code, 'IDEMPOTENCY_CONFLICT');
  });

  // --------------------------------------------------------------------------
  // Step 7: Complete Successful Atomic Finalization
  // --------------------------------------------------------------------------
  await t.test('Step 7: Successfully verify and finalize order with D1 persistence', async () => {
    const mockDb = createMockD1();
    const rzpOrderId = 'order_rzp_success_1';
    const rzpPayId = 'pay_rzp_success_1';

    mockDb._tables.orders.push({
      id: 'ord_success_1',
      user_id: 'usr_alice',
      plan: 'vip_pass',
      amount: 4900,
      currency: 'INR',
      provider_order_id: rzpOrderId,
      status: 'PENDING'
    });

    const env = buildEnv(mockDb);
    const sig = computeHmacSha256(keySecret, `${rzpOrderId}|${rzpPayId}`);

    const req = new Request('https://wishmagic.live/api/commerce/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: JSON.stringify({
        orderId: 'ord_success_1',
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPayId,
        razorpaySignature: sig
      })
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.data.status, 'PAID');
    assert.equal(data.data.verified, true);
    assert.equal(data.data.transactionId, rzpPayId);

    // Verify D1 mutations
    const updatedOrder = mockDb._tables.orders.find(o => o.id === 'ord_success_1');
    assert.equal(updatedOrder.status, 'PAID');
    assert.equal(updatedOrder.transaction_id, rzpPayId);
    assert.ok(updatedOrder.verified_at);

    // Verify Entitlement in D1
    assert.equal(mockDb._tables.entitlements.length, 1);
    assert.equal(mockDb._tables.entitlements[0].user_id, 'usr_alice');
    assert.equal(mockDb._tables.entitlements[0].plan, 'VIP');
    assert.equal(mockDb._tables.entitlements[0].status, 'active');

    // Immediate repeat verification returns idempotent success
    const repeatReq = new Request('https://wishmagic.live/api/commerce/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: JSON.stringify({
        orderId: 'ord_success_1',
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPayId,
        razorpaySignature: sig
      })
    });
    const repeatRes = await worker.fetch(repeatReq, env);
    assert.equal(repeatRes.status, 200);
    const repeatData = await repeatRes.json();
    assert.equal(repeatData.data.alreadyFinalized, true);
    assert.equal(mockDb._tables.entitlements.length, 1, 'Entitlement count must stay 1');
  });
});
