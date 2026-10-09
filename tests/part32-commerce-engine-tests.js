/**
 * WishMagic Part 32: Complete Production Payment & Premium Commerce Engine Test Suite
 * =================================================================================
 * Real Payment Gateway (Razorpay) + Checkout + Orders + Payment Verification
 * + Webhooks + Entitlements + Refunds + Reconciliation + Admin Financial Ops
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ORDER_STATUS,
  PAYMENT_STATUS,
  REFUND_STATUS,
  PRODUCT_TYPES,
  ERROR_CODES,
  RazorpayAdapter,
  computeHmacSha256,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
  resolveAuthoritativeProduct,
  evaluateUserEntitlement,
  createCheckoutSession,
  verifyAndFinalizePayment,
  processRazorpayWebhook,
  processAdminRefund,
  reconcileUnresolvedOrders
} from '../src/commerce-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('WishMagic Part 32: Complete Payment & Premium Commerce Engine Suite', async (t) => {

  // --------------------------------------------------------------------------
  // TEST 1: Migration 0017 Schema & Additive D1 Database Integrity
  // --------------------------------------------------------------------------
  await t.test('TEST 1: Migration 0017 Schema & Additive D1 Integrity', () => {
    const migPath = path.join(ROOT_DIR, 'migrations', '0017_part32_payment_commerce_engine.sql');
    assert.ok(fs.existsSync(migPath), '0017_part32_payment_commerce_engine.sql must exist');

    const sql = fs.readFileSync(migPath, 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS order_items/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS payment_attempts/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS payment_webhooks/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS refunds/i);
    assert.match(sql, /c08b683b-eb07-4639-ab33-fb1139bfb295/, 'Must preserve authoritative D1 database UUID');
    assert.match(sql, /idx_payment_attempts_order_id/i);
    assert.match(sql, /idx_payment_webhooks_event_id/i);
    assert.match(sql, /idx_refunds_order_id/i);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Authoritative Product Resolution & Server-Side Price Calculation
  // --------------------------------------------------------------------------
  await t.test('TEST 2: Authoritative Product Resolution & Server-Side Price Calculation', () => {
    const mockTemplates = [
      { id: 'tpl_free_celebration', name: 'Free Bday', tier: 'free', price: 0 },
      { id: 'tpl_golden_wax', name: 'Golden 3D Seal', tier: 'vip', price: 49, familyId: 'fam_golden' }
    ];

    // Free template
    const freeProd = resolveAuthoritativeProduct({
      productId: 'tpl_free_celebration',
      templates: mockTemplates
    });
    assert.ok(freeProd);
    assert.equal(freeProd.isFree, true);
    assert.equal(freeProd.amountPaise, 0);

    // VIP Pass
    const vipProd = resolveAuthoritativeProduct({ productId: 'vip_pass' });
    assert.ok(vipProd);
    assert.equal(vipProd.productId, 'vip_pass');
    assert.equal(vipProd.amountPaise, 4900, 'VIP Pass must strictly resolve to 4900 paise (₹49)');
    assert.equal(vipProd.currency, 'INR');
    assert.equal(vipProd.isFree, false);

    // Premium Template
    const tplProd = resolveAuthoritativeProduct({
      productId: 'tpl_golden_wax',
      templates: mockTemplates
    });
    assert.ok(tplProd);
    assert.equal(tplProd.amountPaise, 4900);
    assert.equal(tplProd.currency, 'INR');

    // Personalized Link
    const linkProd = resolveAuthoritativeProduct({
      productId: 'personalized_link',
      options: { requestedSlug: 'rahul-priya' },
      siteSettings: { monetization: { personalizedLinkPrice: 99 } }
    });
    assert.ok(linkProd);
    assert.equal(linkProd.amountPaise, 9900);

    // Non-existent product
    const nullProd = resolveAuthoritativeProduct({ productId: 'invalid_xyz' });
    assert.equal(nullProd, null);
  });

  // --------------------------------------------------------------------------
  // TEST 3: Cryptographic Signature Verification & Webhook Authentication
  // --------------------------------------------------------------------------
  await t.test('TEST 3: Cryptographic Signature Verification & Webhook Authentication', () => {
    const secret = 'test_razorpay_secret_key_12345';
    const orderId = 'order_DA2910AKSF';
    const paymentId = 'pay_9898ALSKDJ';

    // Compute legitimate client signature
    const validSignature = computeHmacSha256(secret, `${orderId}|${paymentId}`);
    assert.ok(validSignature);

    // Verify valid signature
    const isGood = verifyRazorpayPaymentSignature({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: validSignature,
      secret
    });
    assert.equal(isGood, true, 'Valid HMAC signature must verify true');

    // Reject forged / altered signature
    const isBad = verifyRazorpayPaymentSignature({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: 'forged_fake_signature_abc123',
      secret
    });
    assert.equal(isBad, false, 'Tampered signature must be rejected');

    // Webhook HMAC Verification
    const webhookSecret = 'whsec_9918237198273';
    const rawBody = JSON.stringify({ event: 'payment.captured', entity: { id: paymentId } });
    const webhookSig = computeHmacSha256(webhookSecret, rawBody);

    assert.equal(verifyRazorpayWebhookSignature({ rawBody, signature: webhookSig, webhookSecret }), true);
    assert.equal(verifyRazorpayWebhookSignature({ rawBody: rawBody + ' ', signature: webhookSig, webhookSecret }), false, 'Body modification must fail verification');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Gateway Configuration Check & Safe Missing Secret Handling
  // --------------------------------------------------------------------------
  await t.test('TEST 4: Gateway Configuration Check & Safe Missing Secret Handling', async () => {
    const unconfiguredAdapter = new RazorpayAdapter({ keyId: null, keySecret: null });
    assert.equal(unconfiguredAdapter.isConfigured(), false);

    // Attempting order creation with unconfigured adapter throws PAYMENT_PROVIDER_NOT_CONFIGURED
    await assert.rejects(
      async () => {
        await unconfiguredAdapter.createOrder({ amountPaise: 4900, receipt: 'ord_1' });
      },
      (err) => err.message === ERROR_CODES.PAYMENT_PROVIDER_NOT_CONFIGURED
    );
  });

  // --------------------------------------------------------------------------
  // TEST 5: Checkout Session Creation, Historical Item Snapshot & Idempotency
  // --------------------------------------------------------------------------
  await t.test('TEST 5: Checkout Session Creation, Historical Item Snapshot & Idempotency', async () => {
    const user = { id: 'usr_alice_42', email: 'alice@example.com' };
    const mockAdapter = new RazorpayAdapter({ keyId: 'rzp_test_1', keySecret: 'sec_1', isTestMode: true });

    // Mock adapter createOrder
    mockAdapter.createOrder = async ({ amountPaise, receipt }) => ({
      id: 'order_rzp_mock_123',
      amount: amountPaise,
      currency: 'INR',
      status: 'created',
      receipt
    });

    const stores = {
      orders: [],
      orderItems: [],
      paymentAttempts: [],
      entitlements: [],
      templates: [{ id: 'tpl_vip_1', tier: 'vip', price: 49 }],
      families: [],
      siteSettings: {}
    };

    // 1. Initial Checkout Creation
    const session = await createCheckoutSession({
      user,
      productId: 'vip_pass',
      idempotencyKey: 'idemp_key_session_100',
      adapter: mockAdapter,
      stores
    });

    assert.ok(session.order);
    assert.equal(session.order.userId, 'usr_alice_42');
    assert.equal(session.order.amount, 4900);
    assert.equal(session.order.currency, 'INR');
    assert.equal(session.order.status, ORDER_STATUS.PENDING);
    assert.equal(session.isIdempotentReplay, false);
    assert.equal(stores.orders.length, 1);
    assert.equal(stores.orderItems.length, 1);
    assert.equal(stores.paymentAttempts.length, 1);

    // Check historical snapshot
    assert.equal(stores.orderItems[0].productName, 'WishMagic VIP Creator Pass');
    assert.equal(stores.orderItems[0].unitPrice, 4900);

    // 2. Idempotent Replay with same key
    const replaySession = await createCheckoutSession({
      user,
      productId: 'vip_pass',
      idempotencyKey: 'idemp_key_session_100',
      adapter: mockAdapter,
      stores
    });

    assert.equal(replaySession.isIdempotentReplay, true);
    assert.equal(replaySession.order.id, session.order.id);
    assert.equal(stores.orders.length, 1, 'Orders count must not increase on duplicate checkout attempt');
  });

  // --------------------------------------------------------------------------
  // TEST 6: Payment Verification, Idempotent Finalization & Entitlement Grant
  // --------------------------------------------------------------------------
  await t.test('TEST 6: Payment Verification, Idempotent Finalization & Entitlement Grant', async () => {
    const user = { id: 'usr_bob_88', email: 'bob@example.com' };
    const secret = 'rzp_sec_bob_test';
    const adapter = new RazorpayAdapter({ keyId: 'rzp_key_bob', keySecret: secret });

    // Mock fetchPayment to confirm amount
    adapter.fetchPayment = async () => ({ amount: 4900, currency: 'INR', status: 'captured' });

    const orderId = 'ord_bob_999';
    const rzpOrderId = 'order_rzp_bob_1';
    const rzpPaymentId = 'pay_rzp_bob_pay_1';
    const validSig = computeHmacSha256(secret, `${rzpOrderId}|${rzpPaymentId}`);

    const stores = {
      orders: [{
        id: orderId,
        userId: user.id,
        plan: 'vip_pass',
        amount: 4900,
        currency: 'INR',
        providerOrderId: rzpOrderId,
        status: ORDER_STATUS.PENDING,
        createdAt: new Date().toISOString()
      }],
      orderItems: [{
        id: 'itm_1',
        orderId,
        productId: 'vip_pass',
        productName: 'VIP Pass',
        unitPrice: 4900
      }],
      paymentAttempts: [{
        id: 'att_1',
        orderId,
        providerOrderId: rzpOrderId,
        status: PAYMENT_STATUS.CREATED
      }],
      entitlements: [],
      auditLogs: [],
      notifications: []
    };

    // Verify & finalize
    const result = await verifyAndFinalizePayment({
      orderId,
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: rzpPaymentId,
      razorpaySignature: validSig,
      user,
      adapter,
      stores
    });

    assert.equal(result.success, true);
    assert.equal(result.order.status, ORDER_STATUS.PAID);
    assert.equal(result.attempt.status, PAYMENT_STATUS.CAPTURED);
    assert.equal(stores.entitlements.length, 1);
    assert.equal(stores.entitlements[0].userId, user.id);
    assert.equal(stores.entitlements[0].status, 'active');

    // Repeat verification idempotency check
    const repeatResult = await verifyAndFinalizePayment({
      orderId,
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: rzpPaymentId,
      razorpaySignature: validSig,
      user,
      adapter,
      stores
    });
    assert.equal(repeatResult.success, true);
    assert.equal(repeatResult.alreadyFinalized, true);
    assert.equal(stores.entitlements.length, 1, 'Entitlement count must remain 1 on duplicate verification');
  });

  // --------------------------------------------------------------------------
  // TEST 7: Security: IDOR Ownership Protection & Tamper Resistance
  // --------------------------------------------------------------------------
  await t.test('TEST 7: Security: IDOR Ownership Protection & Tamper Resistance', async () => {
    const victimUser = { id: 'usr_victim_1', role: 'user' };
    const attackerUser = { id: 'usr_attacker_99', role: 'user' };
    const adapter = new RazorpayAdapter({ keyId: 'k', keySecret: 's' });

    const stores = {
      orders: [{
        id: 'ord_victim_confidential',
        userId: victimUser.id,
        plan: 'vip_pass',
        amount: 4900,
        currency: 'INR',
        status: ORDER_STATUS.PENDING
      }],
      orderItems: [],
      paymentAttempts: [],
      entitlements: []
    };

    // Attacker tries to finalize victim's order
    await assert.rejects(
      async () => {
        await verifyAndFinalizePayment({
          orderId: 'ord_victim_confidential',
          razorpayOrderId: 'fake_order',
          razorpayPaymentId: 'fake_pay',
          razorpaySignature: 'fake_sig',
          user: attackerUser,
          adapter,
          stores
        });
      },
      (err) => err.code === ERROR_CODES.FORBIDDEN
    );
  });

  // --------------------------------------------------------------------------
  // TEST 8: Webhook Idempotency & Duplicate Event Prevention
  // --------------------------------------------------------------------------
  await t.test('TEST 8: Webhook Idempotency & Duplicate Event Prevention', async () => {
    const webhookSecret = 'wh_secret_xyz';
    const adapter = new RazorpayAdapter({ keyId: 'k', keySecret: 's', webhookSecret });
    const eventPayload = {
      event: 'payment.captured',
      event_id: 'evt_unique_12345',
      payload: {
        payment: { entity: { id: 'pay_999', order_id: 'ord_rzp_999' } }
      }
    };
    const rawBody = JSON.stringify(eventPayload);
    const signature = computeHmacSha256(webhookSecret, rawBody);

    const stores = {
      orders: [{
        id: 'ord_local_1',
        providerOrderId: 'ord_rzp_999',
        userId: 'usr_buyer_1',
        plan: 'vip_pass',
        amount: 4900,
        currency: 'INR',
        status: ORDER_STATUS.PENDING
      }],
      orderItems: [{ orderId: 'ord_local_1', productName: 'VIP Pass' }],
      paymentAttempts: [{ orderId: 'ord_local_1', providerOrderId: 'ord_rzp_999' }],
      paymentWebhooks: [],
      entitlements: [],
      auditLogs: [],
      notifications: []
    };

    // First Webhook Delivery
    const firstDelivery = await processRazorpayWebhook({ rawBody, signature, adapter, stores });
    assert.equal(firstDelivery.success, true);
    assert.equal(stores.paymentWebhooks.length, 1);
    assert.equal(stores.orders[0].status, ORDER_STATUS.PAID);

    // Duplicate Webhook Delivery (Provider Retry)
    const duplicateDelivery = await processRazorpayWebhook({ rawBody, signature, adapter, stores });
    assert.equal(duplicateDelivery.success, true);
    assert.equal(duplicateDelivery.deduplicated, true);
    assert.equal(stores.paymentWebhooks.length, 1, 'Webhook table must not duplicate event record');
  });

  // --------------------------------------------------------------------------
  // TEST 9: Admin Refund Workflow & Cumulative Balance Safeguards
  // --------------------------------------------------------------------------
  await t.test('TEST 9: Admin Refund Workflow & Cumulative Balance Safeguards', async () => {
    const adminUser = { id: 'usr_admin_1', email: 'ankit.babusaini@gmail.com', role: 'admin' };
    const nonAdminUser = { id: 'usr_charlie_3', email: 'charlie@test.com', role: 'user' };

    const adapter = new RazorpayAdapter({ keyId: 'k', keySecret: 's' });
    adapter.createRefund = async ({ providerPaymentId, amountPaise }) => ({
      id: 'rfnd_rzp_mock_1',
      payment_id: providerPaymentId,
      amount: amountPaise,
      status: 'processed'
    });

    const stores = {
      orders: [{
        id: 'ord_paid_to_refund',
        userId: 'usr_buyer_1',
        amount: 4900,
        currency: 'INR',
        status: ORDER_STATUS.PAID,
        transactionId: 'pay_capture_123',
        totalRefunded: 0
      }],
      paymentAttempts: [{
        id: 'att_1',
        orderId: 'ord_paid_to_refund',
        status: PAYMENT_STATUS.CAPTURED,
        providerPaymentId: 'pay_capture_123'
      }],
      refunds: [],
      entitlements: [{
        id: 'ent_1',
        orderId: 'ord_paid_to_refund',
        status: 'active'
      }],
      auditLogs: []
    };

    // 1. Non-admin cannot initiate refund
    await assert.rejects(
      async () => {
        await processAdminRefund({
          orderId: 'ord_paid_to_refund',
          amountPaise: 4900,
          actor: nonAdminUser,
          adapter,
          stores
        });
      },
      (err) => err.code === ERROR_CODES.FORBIDDEN
    );

    // 2. Admin executes full refund
    const refundResult = await processAdminRefund({
      orderId: 'ord_paid_to_refund',
      amountPaise: 4900,
      actor: adminUser,
      adapter,
      stores
    });

    assert.equal(refundResult.success, true);
    assert.equal(refundResult.isFullRefund, true);
    assert.equal(stores.orders[0].status, ORDER_STATUS.REFUNDED);
    assert.equal(stores.entitlements[0].status, 'revoked', 'Full refund must revoke entitlement');
    assert.equal(stores.refunds.length, 1);

    // 3. Reject further refunds exceeding balance
    await assert.rejects(
      async () => {
        await processAdminRefund({
          orderId: 'ord_paid_to_refund',
          amountPaise: 100,
          actor: adminUser,
          adapter,
          stores
        });
      },
      (err) => err.code === ERROR_CODES.REFUND_AMOUNT_INVALID
    );
  });

  // --------------------------------------------------------------------------
  // TEST 10: Reconciliation Engine: Safe Recovery without Guessing
  // --------------------------------------------------------------------------
  await t.test('TEST 10: Reconciliation Engine: Safe Recovery without Guessing', async () => {
    const adapter = new RazorpayAdapter({ keyId: 'k', keySecret: 's' });
    adapter.fetchOrder = async (orderId) => {
      if (orderId === 'order_paid_in_gateway') {
        return { id: orderId, status: 'paid', amount_paid: 4900 };
      }
      return { id: orderId, status: 'created', amount_paid: 0 };
    };

    const stores = {
      orders: [
        {
          id: 'ord_crashed_1',
          userId: 'usr_dave_1',
          plan: 'vip_pass',
          amount: 4900,
          currency: 'INR',
          providerOrderId: 'order_paid_in_gateway',
          status: ORDER_STATUS.PENDING,
          createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 mins ago
        },
        {
          id: 'ord_pending_normal',
          userId: 'usr_eve_2',
          plan: 'vip_pass',
          amount: 4900,
          currency: 'INR',
          providerOrderId: 'order_still_pending',
          status: ORDER_STATUS.PENDING,
          createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString()
        }
      ],
      orderItems: [
        { orderId: 'ord_crashed_1', productName: 'VIP Pass' },
        { orderId: 'ord_pending_normal', productName: 'VIP Pass' }
      ],
      paymentAttempts: [],
      entitlements: [],
      auditLogs: [],
      notifications: []
    };

    const recResult = await reconcileUnresolvedOrders({ adapter, stores });
    assert.equal(recResult.scanned, 2);
    assert.equal(recResult.repaired, 1, 'Only gateway-confirmed paid order should be repaired');
    assert.equal(recResult.pending, 1);
    assert.equal(stores.orders[0].status, ORDER_STATUS.PAID);
    assert.equal(stores.orders[1].status, ORDER_STATUS.PENDING, 'Unconfirmed order must remain pending without guessing');
    assert.equal(stores.entitlements.length, 1);
  });

  // --------------------------------------------------------------------------
  // TEST 11: Regression Integrity: Free Templates & Snapshots Protected
  // --------------------------------------------------------------------------
  await t.test('TEST 11: Regression Integrity: Free Templates & Snapshots Protected', () => {
    const freeTemplates = [
      { id: 'tpl_friendship_chronicles', tier: 'free', price: 0 },
      { id: 'tpl_parents_tribute', tier: 'free', price: 0 }
    ];

    // Guest user accessing free template
    const guestEvaluation = evaluateUserEntitlement({
      user: null,
      templateId: 'tpl_friendship_chronicles',
      templates: freeTemplates
    });
    assert.equal(guestEvaluation.allowed, true);
    assert.equal(guestEvaluation.isFree, true);

    // Unauthenticated user attempting to checkout free template
    const freeProduct = resolveAuthoritativeProduct({
      productId: 'tpl_friendship_chronicles',
      templates: freeTemplates
    });
    assert.equal(freeProduct.isFree, true);
  });

});
