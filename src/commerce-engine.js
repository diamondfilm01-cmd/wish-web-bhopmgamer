/**
 * WishMagic Complete Production Payment & Premium Commerce Engine (Part 32)
 * =========================================================================
 * Real Payment Gateway (Razorpay) + Checkout + Orders + Verification
 * + Webhooks + Entitlements + Refunds + Reconciliation + Admin Financial Ops
 *
 * Fully dual-runtime: Runs identically in Cloudflare Workers (D1) and Node.js (Express).
 */

import crypto from 'node:crypto';
import { isAuthoritativeAdmin, createAuditLogEntry } from './admin-operations-engine.js';
import { createInAppNotification, createDeliveryJob, NOTIFICATION_TYPES } from './notification-engine.js';

// ============================================================================
// 1. CONSTANTS, ENUMS & ERROR CODES
// ============================================================================

export const ORDER_STATUS = {
  PENDING: 'PENDING',
  PAYMENT_PROCESSING: 'PAYMENT_PROCESSING',
  PAID: 'PAID',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  CANCELLED: 'CANCELLED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUNDED: 'REFUNDED'
};

export const PAYMENT_STATUS = {
  CREATED: 'CREATED',
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED'
};

export const REFUND_STATUS = {
  REQUESTED: 'REQUESTED',
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED'
};

export const PRODUCT_TYPES = {
  VIP_PASS: 'vip_pass',
  PERSONALIZED_LINK: 'personalized_link',
  HD_IMAGE_STYLE_PACK: 'hd_image_style_pack',
  FREE_TEMPLATE_COMBO: 'free_template_combo',
  PREMIUM_TEMPLATE_COMBO: 'premium_template_combo',
  TEMPLATE_FAMILY: 'template_family',
  TEMPLATE: 'template'
};

export const PAYMENT_PROVIDERS = {
  RAZORPAY: 'razorpay'
};

export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  PRODUCT_NOT_PURCHASABLE: 'PRODUCT_NOT_PURCHASABLE',
  ALREADY_ENTITLED: 'ALREADY_ENTITLED',
  PAYMENT_PROVIDER_NOT_CONFIGURED: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
  PAYMENT_PROVIDER_UNAVAILABLE: 'PAYMENT_PROVIDER_UNAVAILABLE',
  CHECKOUT_CREATION_FAILED: 'CHECKOUT_CREATION_FAILED',
  PAYMENT_VERIFICATION_PENDING: 'PAYMENT_VERIFICATION_PENDING',
  PAYMENT_VERIFICATION_FAILED: 'PAYMENT_VERIFICATION_FAILED',
  PAYMENT_AMOUNT_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH',
  PAYMENT_CURRENCY_MISMATCH: 'PAYMENT_CURRENCY_MISMATCH',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  INVALID_ORDER_STATE: 'INVALID_ORDER_STATE',
  ENTITLEMENT_NOT_FOUND: 'ENTITLEMENT_NOT_FOUND',
  REFUND_NOT_ALLOWED: 'REFUND_NOT_ALLOWED',
  REFUND_AMOUNT_INVALID: 'REFUND_AMOUNT_INVALID',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  RECONCILIATION_REQUIRED: 'RECONCILIATION_REQUIRED'
};

// ============================================================================
// 2. CRYPTOGRAPHIC & GATEWAY HELPER UTILITIES
// ============================================================================

/**
 * Computes HMAC-SHA256 hex string using Node crypto or Web Crypto API
 */
export function computeHmacSha256(secret, data) {
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
export function timingSafeEqualStrings(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates Razorpay client checkout response signature
 * Signature = HMAC-SHA256(order_id + "|" + razorpay_payment_id, secret)
 */
export function verifyRazorpayPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature, secret }) {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !secret) {
    return false;
  }
  const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = computeHmacSha256(secret, payload);
  return timingSafeEqualStrings(expectedSignature, razorpaySignature);
}

/**
 * Validates Razorpay Webhook signature from X-Razorpay-Signature header
 */
export function verifyRazorpayWebhookSignature({ rawBody, signature, webhookSecret }) {
  if (!rawBody || !signature || !webhookSecret) {
    return false;
  }
  const expectedSignature = computeHmacSha256(webhookSecret, rawBody);
  return timingSafeEqualStrings(expectedSignature, signature);
}

// ============================================================================
// 3. PRODUCT CATALOGUE & AUTHORITATIVE PRICE RESOLUTION
// ============================================================================

/**
 * Authoritatively resolves product details, price in minor units (paise), and currency
 */
export function resolveAuthoritativeProduct({ productId, templateId, options = {}, templates = [], families = [], siteSettings = {} }) {
  const normId = String(productId || '').trim().toLowerCase();

  const toFiniteNonNeg = (val, fallback) => {
    if (val === undefined || val === null || val === '') return fallback;
    const n = Number(val);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const addons = siteSettings?.addons || {};
  const customLinkUnit = toFiniteNonNeg(addons.customLinkPrice ?? siteSettings?.personalized?.price, 59);
  const hdStyleUnit = toFiniteNonNeg(addons.hdImageStylePrice, 59);
  const freeComboUnit = toFiniteNonNeg(addons.freeTemplateComboPrice, 99);
  const premComboAddon = toFiniteNonNeg(addons.premiumComboAddonPrice, 70);
  const vipPassUnit = toFiniteNonNeg(addons.vipPassPrice, 49);
  const resolvedCurrency = String(siteSettings?.personalized?.currency || siteSettings?.currency || 'INR').trim().toUpperCase() || 'INR';

  const configuredPlans = Array.isArray(siteSettings?.vipPlans) ? siteSettings.vipPlans : [];
  const matchedVipPlan = configuredPlans.find(p => p && String(p.id || "").toLowerCase() === normId);

  // 1. VIP Pass (Universal creator upgrade)
  if (normId === 'vip_pass' || normId === 'vip' || normId === 'premium') {
    const vipPlanObj = matchedVipPlan || configuredPlans.find(p => p && (p.id === 'vip_pass' || p.id === 'plan_vip_49'));
    const effectiveVipPrice = vipPlanObj && Number.isFinite(Number(vipPlanObj.price)) && Number(vipPlanObj.price) >= 0
      ? Number(vipPlanObj.price)
      : vipPassUnit;
    const paise = Math.round(effectiveVipPrice * 100);
    return {
      productId: 'vip_pass',
      productType: PRODUCT_TYPES.VIP_PASS,
      productName: (vipPlanObj && vipPlanObj.name) || 'WishMagic VIP Creator Pass',
      description: (vipPlanObj && vipPlanObj.description) || 'Unlimited VIP blueprints, custom audio, watermark removal & permanent link preservation.',
      amountPaise: paise,
      price: effectiveVipPrice,
      currency: resolvedCurrency,
      priceDisplay: `₹${effectiveVipPrice}`,
      scope: 'all_templates',
      perks: (vipPlanObj && vipPlanObj.perks) || null,
      isFree: paise === 0
    };
  }

  // 1b. Any Custom or Admin-Configured VIP Plan in siteSettings.vipPlans
  if (matchedVipPlan && !['personalized_link', 'custom_link_only', 'hd_image_style_pack', 'hd_style', 'free_template_combo', 'combo_99', 'premium_template_combo'].includes(normId)) {
    const planPrice = toFiniteNonNeg(matchedVipPlan.price, 49);
    const paise = Math.round(planPrice * 100);
    return {
      productId: matchedVipPlan.id,
      productType: PRODUCT_TYPES.VIP_PASS,
      productName: matchedVipPlan.name || 'WishMagic VIP Plan',
      description: matchedVipPlan.description || 'Custom VIP celebration plan.',
      amountPaise: paise,
      price: planPrice,
      currency: resolvedCurrency,
      priceDisplay: `₹${planPrice}`,
      scope: matchedVipPlan.perks && matchedVipPlan.perks.unlockVipTemplates ? 'all_templates' : 'combo_pack',
      perks: matchedVipPlan.perks || {},
      isFree: paise === 0
    };
  }

  // 2. Personalized Link Only (₹59 default)
  if (normId === 'personalized_link' || normId === 'custom_link_only') {
    const customPrice = toFiniteNonNeg(
      siteSettings?.monetization?.personalizedLinkPrice ?? addons.customLinkPrice ?? siteSettings?.personalized?.price,
      customLinkUnit
    );
    const paise = Math.round(customPrice * 100);
    const price = Math.round(paise / 100);
    return {
      productId: 'personalized_link',
      productType: PRODUCT_TYPES.PERSONALIZED_LINK,
      productName: 'Custom Celebration Link',
      description: `Custom branded link reservation (${options.requestedSlug || 'custom-name'}).`,
      amountPaise: paise,
      price,
      currency: 'INR',
      priceDisplay: `₹${price}`,
      scope: 'custom_slug',
      isFree: false
    };
  }

  // 2b. High Quality Images + Custom Style Pack (₹59 default)
  if (normId === 'hd_image_style_pack' || normId === 'hd_style') {
    const paise = Math.round(hdStyleUnit * 100);
    return {
      productId: 'hd_image_style_pack',
      productType: PRODUCT_TYPES.HD_IMAGE_STYLE_PACK,
      productName: 'HD Images & Custom Style Pack',
      description: 'Upload High Quality (HD) photos and customize fonts, colors, frames & effects.',
      amountPaise: paise,
      price: hdStyleUnit,
      currency: 'INR',
      priceDisplay: `₹${hdStyleUnit}`,
      scope: 'hd_style',
      isFree: false
    };
  }

  // 2c. Free Template Super Combo (₹99 default: Custom Link + HD Images + Custom Style)
  if (normId === 'free_template_combo' || normId === 'combo_99') {
    const paise = Math.round(freeComboUnit * 100);
    return {
      productId: 'free_template_combo',
      productType: PRODUCT_TYPES.FREE_TEMPLATE_COMBO,
      productName: 'All-in-One Celebration Combo (Custom Link + HD Images + Style)',
      description: 'Includes Custom Link (/w/your-name) + High Quality (HD) Images + Custom Style.',
      amountPaise: paise,
      price: freeComboUnit,
      currency: 'INR',
      priceDisplay: `₹${freeComboUnit}`,
      scope: 'combo_pack',
      isFree: false
    };
  }

  // 2d. Premium Template Royal Combo (Template Price + ₹70: Template + Custom Link + HD Images + Style)
  if (normId === 'premium_template_combo' || normId.startsWith('premium_combo:')) {
    const targetTplId = templateId || normId.replace('premium_combo:', '');
    const tplObj = templates.find(t => t.id === targetTplId);
    const baseTplPrice = toFiniteNonNeg(options.templatePrice ?? tplObj?.price, 59);
    const totalRupees = baseTplPrice + premComboAddon;
    const paise = Math.round(totalRupees * 100);
    return {
      productId: targetTplId ? `premium_combo:${targetTplId}` : 'premium_template_combo',
      productType: PRODUCT_TYPES.PREMIUM_TEMPLATE_COMBO,
      productName: `${tplObj?.name || 'Premium Template'} + Full Combo (Custom Link + HD Images + Style)`,
      description: `Premium Template (₹${baseTplPrice}) + Custom Link + High Quality Images + Custom Style (+₹${premComboAddon} Combo).`,
      templateId: targetTplId || null,
      amountPaise: paise,
      price: totalRupees,
      currency: 'INR',
      priceDisplay: `₹${totalRupees}`,
      scope: 'premium_combo',
      isFree: false
    };
  }

  // 3. Specific Template
  const tpl = templates.find(t => t.id === normId || t.id === templateId);
  if (tpl) {
    const isVip = tpl.tier === 'vip' || (tpl.price && Number(tpl.price) > 0);
    const rupees = Number(tpl.price) || (isVip ? 49 : 0);
    const paise = Math.round(rupees * 100);

    return {
      productId: `template:${tpl.id}`,
      productType: PRODUCT_TYPES.TEMPLATE,
      productName: tpl.name || 'Premium Celebration Blueprint',
      description: tpl.description || `Single template access for ${tpl.name || tpl.id}`,
      templateId: tpl.id,
      templateFamilyId: tpl.familyId || tpl.family_id || null,
      versionId: tpl.activeVersionId || tpl.version || 'v1.0.0',
      amountPaise: paise,
      price: rupees,
      currency: 'INR',
      priceDisplay: isVip ? `₹${rupees}` : 'Free',
      scope: 'single_template',
      isFree: !isVip || paise === 0
    };
  }

  // 4. Template Family
  const fam = families.find(f => f.id === normId || f.id === options.familyId);
  if (fam) {
    const rupees = Number(fam.price) || 49;
    const paise = Math.round(rupees * 100);
    return {
      productId: `family:${fam.id}`,
      productType: PRODUCT_TYPES.TEMPLATE_FAMILY,
      productName: fam.name ? `${fam.name} (All Variations)` : 'Premium Blueprint Family',
      description: fam.description || 'Full access to this template family across all relationships & themes.',
      templateFamilyId: fam.id,
      amountPaise: paise,
      price: rupees,
      currency: 'INR',
      priceDisplay: `₹${rupees}`,
      scope: 'template_family',
      isFree: false
    };
  }

  return null;
}

// ============================================================================
// 4. SERVER-AUTHORITATIVE ENTITLEMENT EVALUATION ENGINE
// ============================================================================

/**
 * Authoritatively answers whether a user is entitled to a product/template
 */
export function evaluateUserEntitlement({
  user,
  productId,
  templateId,
  templateFamilyId,
  entitlements = [],
  templates = []
}) {
  // If checking template entitlement itself and the template is inherently free, allow
  const normProd = String(productId || '').trim().toLowerCase();
  const isPaidAddonCheck = (
    normProd === 'vip_pass' ||
    normProd === 'personalized_link' ||
    normProd === 'custom_link_only' ||
    normProd === 'hd_image_style_pack' ||
    normProd === 'hd_style' ||
    normProd === 'free_template_combo' ||
    normProd === 'combo_99' ||
    normProd === 'premium_template_combo' ||
    normProd.startsWith('premium_combo:')
  );
  if (templateId && !isPaidAddonCheck) {
    const tpl = templates.find(t => t.id === templateId);
    if (tpl && (tpl.tier === 'free' || !tpl.price || Number(tpl.price) === 0)) {
      return { allowed: true, isFree: true, reason: 'FREE_TEMPLATE' };
    }
  }

  if (!user || !user.id) {
    return { allowed: false, isFree: false, reason: 'UNAUTHENTICATED' };
  }

  // Admins always have full platform entitlement
  if (isAuthoritativeAdmin(user)) {
    return { allowed: true, isFree: false, reason: 'ADMIN_PRIVILEGE' };
  }

  // Check user record direct VIP flag
  if (user.isPremium || user.is_premium || user.plan === 'VIP' || user.role === 'VIP') {
    return { allowed: true, isFree: false, reason: 'USER_VIP_PLAN' };
  }

  // Filter active entitlements for this user
  const userEnts = (entitlements || []).filter(e => {
    const uMatch = (e.userId === user.id || e.user_id === user.id);
    const active = (e.status === 'active' || e.status === 'ACTIVE');
    const notExpired = !e.expiresAt && !e.expires_at || new Date(e.expiresAt || e.expires_at).getTime() > Date.now();
    return uMatch && active && notExpired;
  });

  // 1. Check for universal VIP Pass entitlement
  const hasVipPass = userEnts.some(e =>
    e.productId === 'vip_pass' || e.plan === 'vip' || e.plan === 'VIP' || e.scope === 'all_templates'
  );
  if (hasVipPass) {
    return { allowed: true, isFree: false, reason: 'VIP_PASS_ENTITLEMENT' };
  }

  // 2. Check for specific template entitlement
  if (templateId) {
    const hasTpl = userEnts.some(e =>
      e.productId === `template:${templateId}` ||
      e.templateId === templateId ||
      e.template_id === templateId
    );
    if (hasTpl) {
      return { allowed: true, isFree: false, reason: 'SPECIFIC_TEMPLATE_PURCHASE' };
    }
  }

  // 3. Check for template family entitlement
  if (templateFamilyId) {
    const hasFam = userEnts.some(e =>
      e.productId === `family:${templateFamilyId}` ||
      e.templateFamilyId === templateFamilyId ||
      e.template_family_id === templateFamilyId
    );
    if (hasFam) {
      return { allowed: true, isFree: false, reason: 'FAMILY_PURCHASE' };
    }
  }

  // 4. Check matching product ID directly
  if (productId) {
    const hasProd = userEnts.some(e => e.productId === productId || e.product_id === productId);
    if (hasProd) {
      return { allowed: true, isFree: false, reason: 'PRODUCT_PURCHASE' };
    }
  }

  return { allowed: false, isFree: false, reason: 'PURCHASE_REQUIRED' };
}

// ============================================================================
// 5. REAL RAZORPAY PAYMENT GATEWAY ADAPTER
// ============================================================================

export class RazorpayAdapter {
  constructor({ keyId, keySecret, webhookSecret, isTestMode = false, fetchFn = null }) {
    this.keyId = keyId || null;
    this.keySecret = keySecret || null;
    this.webhookSecret = webhookSecret || null;
    this.isTestMode = Boolean(isTestMode);
    this.baseUrl = 'https://api.razorpay.com/v1';
    this.fetchFn = fetchFn || null;
  }

  isConfigured() {
    return Boolean(this.keyId && this.keySecret);
  }

  getBasicAuthHeader() {
    const credentials = `${this.keyId}:${this.keySecret}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  /**
   * Creates an order with Razorpay API (POST /v1/orders)
   */
  async createOrder({ amountPaise, currency = 'INR', receipt, notes = {} }) {
    if (!this.isConfigured()) {
      throw new Error(ERROR_CODES.PAYMENT_PROVIDER_NOT_CONFIGURED);
    }

    const payload = {
      amount: amountPaise,
      currency: currency.toUpperCase(),
      receipt: String(receipt).slice(0, 40),
      notes: {
        ...notes,
        platform: 'WishMagic',
        environment: this.isTestMode ? 'test' : 'live'
      }
    };

    const fetchImpl = this.fetchFn || fetch;
    const res = await fetchImpl(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.getBasicAuthHeader()
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error?.description || 'Razorpay order creation failed');
      err.code = data.error?.code || ERROR_CODES.CHECKOUT_CREATION_FAILED;
      err.providerData = data;
      throw err;
    }

    return data;
  }

  /**
   * Fetches order details from Razorpay API (GET /v1/orders/:order_id)
   */
  async fetchOrder(providerOrderId) {
    if (!this.isConfigured()) {
      throw new Error(ERROR_CODES.PAYMENT_PROVIDER_NOT_CONFIGURED);
    }

    const fetchImpl = this.fetchFn || fetch;
    const res = await fetchImpl(`${this.baseUrl}/orders/${encodeURIComponent(providerOrderId)}`, {
      headers: {
        'Authorization': this.getBasicAuthHeader()
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error?.description || 'Razorpay fetch order failed');
      err.code = data.error?.code || 'ORDER_FETCH_FAILED';
      throw err;
    }

    return data;
  }

  /**
   * Fetches payment details from Razorpay API (GET /v1/payments/:payment_id)
   */
  async fetchPayment(providerPaymentId) {
    if (!this.isConfigured()) {
      throw new Error(ERROR_CODES.PAYMENT_PROVIDER_NOT_CONFIGURED);
    }

    const fetchImpl = this.fetchFn || fetch;
    const res = await fetchImpl(`${this.baseUrl}/payments/${encodeURIComponent(providerPaymentId)}`, {
      headers: {
        'Authorization': this.getBasicAuthHeader()
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error?.description || 'Razorpay fetch payment failed');
      err.code = data.error?.code || 'PAYMENT_FETCH_FAILED';
      err.status = res.status;
      err.providerData = data;
      throw err;
    }

    return data;
  }

  /**
   * Initiates a refund with Razorpay API (POST /v1/payments/:payment_id/refund)
   */
  async createRefund({ providerPaymentId, amountPaise, notes = {} }) {
    if (!this.isConfigured()) {
      throw new Error(ERROR_CODES.PAYMENT_PROVIDER_NOT_CONFIGURED);
    }

    const payload = {
      notes: {
        ...notes,
        initiatedBy: 'WishMagic_Admin_Ops'
      }
    };
    if (amountPaise && Number(amountPaise) > 0) {
      payload.amount = Math.round(Number(amountPaise));
    }

    const fetchImpl = this.fetchFn || fetch;
    const res = await fetchImpl(`${this.baseUrl}/payments/${encodeURIComponent(providerPaymentId)}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.getBasicAuthHeader()
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error?.description || 'Razorpay refund failed');
      err.code = data.error?.code || ERROR_CODES.REFUND_NOT_ALLOWED;
      err.providerData = data;
      throw err;
    }

    return data;
  }

  /**
   * Verifies client payment signature
   */
  verifyPayment({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
    return verifyRazorpayPaymentSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      secret: this.keySecret
    });
  }

  /**
   * Verifies webhook signature
   */
  verifyWebhook({ rawBody, signature }) {
    return verifyRazorpayWebhookSignature({
      rawBody,
      signature,
      webhookSecret: this.webhookSecret
    });
  }
}

// ============================================================================
// 6. ORDER CREATION & CHECKOUT ORCHESTRATION
// ============================================================================

/**
 * Creates a pending commercial order, historical order items, and gateway session
 */
export async function createCheckoutSession({
  user,
  productId,
  templateId,
  options = {},
  idempotencyKey,
  adapter,
  stores: {
    orders,
    orderItems,
    paymentAttempts,
    entitlements,
    templates,
    families,
    siteSettings
  }
}) {
  if (!user || !user.id) {
    const err = new Error('Authentication required for checkout');
    err.code = ERROR_CODES.UNAUTHORIZED;
    err.status = 401;
    throw err;
  }

  // 1. Idempotency verification: Check if order with identical key already exists
  if (idempotencyKey) {
    const existing = orders.find(o => o.idempotencyKey === idempotencyKey && o.userId === user.id);
    if (existing) {
      const attempt = paymentAttempts.find(p => p.orderId === existing.id);
      return {
        order: existing,
        item: orderItems.find(i => i.orderId === existing.id),
        attempt,
        isIdempotentReplay: true
      };
    }
  }

  // 2. Resolve authoritative product details and price
  const product = resolveAuthoritativeProduct({
    productId,
    templateId,
    options,
    templates,
    families,
    siteSettings
  });

  if (!product) {
    const err = new Error('The requested product was not found in the catalogue');
    err.code = ERROR_CODES.PRODUCT_NOT_FOUND;
    err.status = 404;
    throw err;
  }

  if (product.isFree) {
    const err = new Error('This template is completely free and does not require checkout');
    err.code = ERROR_CODES.PRODUCT_NOT_PURCHASABLE;
    err.status = 400;
    throw err;
  }

  // 3. Check if user already owns active entitlement for this product
  const entitlementCheck = evaluateUserEntitlement({
    user,
    productId: product.productId,
    templateId: product.templateId,
    templateFamilyId: product.templateFamilyId,
    entitlements,
    templates
  });

  if (entitlementCheck.allowed) {
    const err = new Error('You already own an active pass for this product');
    err.code = ERROR_CODES.ALREADY_ENTITLED;
    err.status = 400;
    throw err;
  }

  // 4. Verify payment gateway configuration
  if (!adapter || !adapter.isConfigured()) {
    const err = new Error('Payment gateway is not currently configured in server environment');
    err.code = ERROR_CODES.PAYMENT_PROVIDER_NOT_CONFIGURED;
    err.status = 503;
    throw err;
  }

  const now = new Date().toISOString();
  const orderId = `ord_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  const itemId = `itm_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  const attemptId = `att_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

  // 5. Create order in payment gateway (Razorpay)
  let providerOrder;
  try {
    providerOrder = await adapter.createOrder({
      amountPaise: product.amountPaise,
      currency: product.currency,
      receipt: orderId,
      notes: {
        orderId,
        userId: user.id,
        userEmail: user.email || 'customer@wishmagic.live',
        productId: product.productId
      }
    });
  } catch (provErr) {
    const err = new Error(`Payment provider order creation failed: ${provErr.message}`);
    err.code = provErr.code || ERROR_CODES.CHECKOUT_CREATION_FAILED;
    err.status = 502;
    throw err;
  }

  // 6. Build Order Record (Strict Integer minor currency units)
  const requestedSlug = options.requestedSlug || options.slug || null;
  const wishId = options.wishId || null;
  const resolvedTplId = product.templateId || templateId || options.templateId || null;

  const orderRecord = {
    id: orderId,
    userId: user.id,
    user_id: user.id,
    plan: product.productId,
    productId: product.productId,
    product_id: product.productId,
    productName: product.productName,
    product_name: product.productName,
    templateId: resolvedTplId,
    template_id: resolvedTplId,
    wishId,
    wish_id: wishId,
    requestedSlug,
    requested_slug: requestedSlug,
    amount: product.amountPaise, // in paise
    currency: product.currency,
    provider: PAYMENT_PROVIDERS.RAZORPAY,
    providerOrderId: providerOrder.id,
    provider_order_id: providerOrder.id,
    transactionId: null,
    transaction_id: null,
    status: ORDER_STATUS.PENDING,
    idempotencyKey: idempotencyKey || null,
    idempotency_key: idempotencyKey || null,
    orderNotes: JSON.stringify({
      productName: product.productName,
      customerEmail: user.email || null,
      scope: product.scope
    }),
    refundStatus: 'NONE',
    refund_status: 'NONE',
    totalRefunded: 0,
    total_refunded: 0,
    createdAt: now,
    created_at: now,
    updatedAt: now,
    updated_at: now,
    verifiedAt: null,
    verified_at: null
  };

  // 7. Build Historical Order Item Snapshot
  const itemRecord = {
    id: itemId,
    orderId,
    order_id: orderId,
    productId: product.productId,
    product_id: product.productId,
    productType: product.productType,
    product_type: product.productType,
    productName: product.productName,
    product_name: product.productName,
    templateFamilyId: product.templateFamilyId || null,
    template_family_id: product.templateFamilyId || null,
    templateId: product.templateId || null,
    template_id: product.templateId || null,
    versionId: product.versionId || null,
    version_id: product.versionId || null,
    quantity: 1,
    unitPrice: product.amountPaise,
    unit_price: product.amountPaise,
    currency: product.currency,
    createdAt: now,
    created_at: now
  };

  // 8. Build Initial Payment Attempt Record
  const attemptRecord = {
    id: attemptId,
    orderId,
    order_id: orderId,
    provider: PAYMENT_PROVIDERS.RAZORPAY,
    providerOrderId: providerOrder.id,
    provider_order_id: providerOrder.id,
    providerPaymentId: null,
    provider_payment_id: null,
    providerSignature: null,
    provider_signature: null,
    amount: product.amountPaise,
    currency: product.currency,
    status: PAYMENT_STATUS.CREATED,
    errorCode: null,
    error_code: null,
    errorDescription: null,
    error_description: null,
    signatureVerified: 0,
    signature_verified: 0,
    rawResponseSummary: JSON.stringify({ providerOrderId: providerOrder.id, status: providerOrder.status }),
    raw_response_summary: JSON.stringify({ providerOrderId: providerOrder.id, status: providerOrder.status }),
    createdAt: now,
    created_at: now,
    updatedAt: now,
    updated_at: now,
    verifiedAt: null,
    verified_at: null
  };

  // 9. Persist
  orders.push(orderRecord);
  orderItems.push(itemRecord);
  paymentAttempts.push(attemptRecord);

  return {
    order: orderRecord,
    item: itemRecord,
    attempt: attemptRecord,
    providerOrder,
    keyId: adapter.keyId,
    isIdempotentReplay: false
  };
}

// ============================================================================
// 7. SECURE PAYMENT VERIFICATION & IDEMPOTENT FINALIZATION
// ============================================================================

/**
 * Cryptographically verifies payment evidence and idempotently finalizes order + grants entitlement
 */
export async function verifyAndFinalizePayment({
  orderId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  user,
  adapter,
  stores: {
    orders,
    orderItems,
    paymentAttempts,
    entitlements,
    auditLogs = [],
    notifications = []
  }
}) {
  // 1. Validate Input
  if (
    typeof orderId !== 'string' || !orderId.trim() || orderId.trim().length > 128 ||
    typeof razorpayOrderId !== 'string' || !razorpayOrderId.trim() || razorpayOrderId.trim().length > 128 ||
    typeof razorpayPaymentId !== 'string' || !razorpayPaymentId.trim() || razorpayPaymentId.trim().length > 128 ||
    typeof razorpaySignature !== 'string' || !razorpaySignature.trim() || razorpaySignature.trim().length > 256
  ) {
    const err = new Error('Required payment verification fields are missing, empty, or invalid.');
    err.code = ERROR_CODES.PAYMENT_VERIFICATION_FAILED;
    err.status = 400;
    throw err;
  }

  const cleanOrderId = orderId.trim();
  const cleanRzpOrderId = razorpayOrderId.trim();
  const cleanRzpPaymentId = razorpayPaymentId.trim();
  const cleanRzpSignature = razorpaySignature.trim();

  // 2. Locate Order
  const order = orders.find(o => o.id === cleanOrderId || o.providerOrderId === cleanRzpOrderId || o.provider_order_id === cleanRzpOrderId);
  if (!order) {
    const err = new Error('Commercial order not found');
    err.code = ERROR_CODES.ORDER_NOT_FOUND;
    err.status = 404;
    throw err;
  }

  // 3. IDOR Protection: If non-admin user supplied, ensure order belongs to them
  const orderUserId = order.userId || order.user_id;
  if (user && !isAuthoritativeAdmin(user) && user.role !== 'system') {
    if (orderUserId !== user.id) {
      const err = new Error('Access denied to this order record');
      err.code = ERROR_CODES.FORBIDDEN;
      err.status = 403;
      throw err;
    }
  }

  // 4. Validate Provider Order ID match
  const storedProvOrderId = order.providerOrderId || order.provider_order_id;
  if (storedProvOrderId && storedProvOrderId !== cleanRzpOrderId) {
    const err = new Error('Payment does not match the requested order.');
    err.code = 'PAYMENT_ORDER_MISMATCH';
    err.status = 400;
    throw err;
  }

  // 5. Order State Machine Rules & Idempotency Check
  if (order.status === ORDER_STATUS.PAID) {
    const activeEnt = entitlements.find(e => (e.orderId === order.id || e.order_id === order.id || e.userId === orderUserId || e.user_id === orderUserId) && e.status === 'active');
    return {
      success: true,
      alreadyFinalized: true,
      order,
      entitlement: activeEnt
    };
  }

  if (order.status === ORDER_STATUS.REFUNDED) {
    const err = new Error('Order has already been refunded and cannot be finalized.');
    err.code = ERROR_CODES.INVALID_ORDER_STATE;
    err.status = 400;
    throw err;
  }

  if (order.status === ORDER_STATUS.PARTIALLY_REFUNDED) {
    const err = new Error('Order is partially refunded and cannot be re-finalized.');
    err.code = ERROR_CODES.INVALID_ORDER_STATE;
    err.status = 400;
    throw err;
  }

  if (order.status === ORDER_STATUS.CANCELLED) {
    const err = new Error('Cancelled order cannot be finalized.');
    err.code = ERROR_CODES.INVALID_ORDER_STATE;
    err.status = 400;
    throw err;
  }

  const PAYABLE_STATES = [ORDER_STATUS.PENDING, ORDER_STATUS.PAYMENT_PROCESSING, ORDER_STATUS.PAYMENT_FAILED, 'CREATED'];
  if (!PAYABLE_STATES.includes(order.status)) {
    const err = new Error(`Order status '${order.status}' is not eligible for payment finalization.`);
    err.code = ERROR_CODES.INVALID_ORDER_STATE;
    err.status = 400;
    throw err;
  }

  // 6. Prevent replay & conflicting payment IDs
  const conflictingOrder = orders.find(o => (o.transactionId === cleanRzpPaymentId || o.transaction_id === cleanRzpPaymentId) && o.id !== order.id);
  if (conflictingOrder) {
    const err = new Error('Payment transaction has already been applied to another order.');
    err.code = ERROR_CODES.IDEMPOTENCY_CONFLICT;
    err.status = 409;
    throw err;
  }

  const conflictingAttempt = paymentAttempts.find(p => (p.providerPaymentId === cleanRzpPaymentId || p.provider_payment_id === cleanRzpPaymentId) && (p.orderId !== order.id && p.order_id !== order.id) && p.status === PAYMENT_STATUS.CAPTURED);
  if (conflictingAttempt) {
    const err = new Error('Payment has already been captured for another order attempt.');
    err.code = ERROR_CODES.IDEMPOTENCY_CONFLICT;
    err.status = 409;
    throw err;
  }

  // 7. Validate Gateway Config
  if (!adapter || !adapter.isConfigured()) {
    const err = new Error('Payment gateway credentials missing');
    err.code = ERROR_CODES.PAYMENT_PROVIDER_NOT_CONFIGURED;
    err.status = 503;
    throw err;
  }

  // 8. Verify cryptographic signature
  const isValidSignature = adapter.verifyPayment({
    razorpayOrderId: cleanRzpOrderId,
    razorpayPaymentId: cleanRzpPaymentId,
    razorpaySignature: cleanRzpSignature
  });

  const now = new Date().toISOString();

  // Find or create payment attempt
  let attempt = paymentAttempts.find(p => (p.orderId === order.id || p.order_id === order.id) && (p.providerOrderId === cleanRzpOrderId || p.provider_order_id === cleanRzpOrderId));
  if (!attempt) {
    attempt = {
      id: `att_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`,
      orderId: order.id,
      order_id: order.id,
      provider: PAYMENT_PROVIDERS.RAZORPAY,
      providerOrderId: cleanRzpOrderId,
      provider_order_id: cleanRzpOrderId,
      providerPaymentId: cleanRzpPaymentId,
      provider_payment_id: cleanRzpPaymentId,
      amount: order.amount,
      currency: order.currency,
      status: PAYMENT_STATUS.PENDING,
      createdAt: now,
      created_at: now,
      updatedAt: now,
      updated_at: now
    };
    paymentAttempts.push(attempt);
  }

  attempt.providerPaymentId = cleanRzpPaymentId;
  attempt.provider_payment_id = cleanRzpPaymentId;
  attempt.providerSignature = cleanRzpSignature;
  attempt.provider_signature = cleanRzpSignature;
  attempt.updatedAt = now;
  attempt.updated_at = now;

  if (!isValidSignature) {
    attempt.status = PAYMENT_STATUS.FAILED;
    attempt.errorCode = ERROR_CODES.PAYMENT_VERIFICATION_FAILED;
    attempt.error_code = ERROR_CODES.PAYMENT_VERIFICATION_FAILED;
    attempt.errorDescription = 'Cryptographic signature mismatch against order and payment reference';
    attempt.error_description = 'Cryptographic signature mismatch against order and payment reference';
    attempt.signatureVerified = 0;
    attempt.signature_verified = 0;

    order.status = ORDER_STATUS.PAYMENT_FAILED;
    order.updatedAt = now;
    order.updated_at = now;

    const err = new Error('Payment signature verification failed');
    err.code = ERROR_CODES.PAYMENT_VERIFICATION_FAILED;
    err.status = 400;
    throw err;
  }

  // 9. Authoritative Live Verification with Gateway API (fetchPayment)
  let provPayment = null;
  try {
    provPayment = await adapter.fetchPayment(cleanRzpPaymentId);
  } catch (apiErr) {
    if (
      apiErr.code === ERROR_CODES.PAYMENT_AMOUNT_MISMATCH ||
      apiErr.code === ERROR_CODES.PAYMENT_CURRENCY_MISMATCH ||
      apiErr.code === ERROR_CODES.PAYMENT_VERIFICATION_PENDING ||
      apiErr.code === ERROR_CODES.INVALID_ORDER_STATE ||
      apiErr.code === ERROR_CODES.PAYMENT_VERIFICATION_FAILED
    ) {
      throw apiErr;
    }
    const err = new Error(`Payment gateway verification unavailable: ${apiErr.message || 'API error'}`);
    err.code = ERROR_CODES.PAYMENT_PROVIDER_UNAVAILABLE;
    err.status = 503;
    throw err;
  }

  if (!provPayment || typeof provPayment !== 'object') {
    const err = new Error('Invalid response received from payment provider.');
    err.code = ERROR_CODES.PAYMENT_VERIFICATION_FAILED;
    err.status = 502;
    throw err;
  }

  if (provPayment.id && provPayment.id !== cleanRzpPaymentId) {
    const err = new Error('Provider payment ID mismatch.');
    err.code = ERROR_CODES.PAYMENT_VERIFICATION_FAILED;
    err.status = 400;
    throw err;
  }

  if (provPayment.order_id && provPayment.order_id !== cleanRzpOrderId) {
    const err = new Error('Provider payment order reference mismatch.');
    err.code = 'PAYMENT_ORDER_MISMATCH';
    err.status = 400;
    throw err;
  }

  const expectedAmount = Number(order.amount);
  const provAmount = Number(provPayment.amount);
  if (!Number.isInteger(expectedAmount) || !Number.isInteger(provAmount) || provAmount !== expectedAmount) {
    attempt.status = PAYMENT_STATUS.FAILED;
    attempt.errorCode = ERROR_CODES.PAYMENT_AMOUNT_MISMATCH;
    attempt.error_code = ERROR_CODES.PAYMENT_AMOUNT_MISMATCH;
    order.status = ORDER_STATUS.PAYMENT_FAILED;
    const err = new Error(`Payment amount mismatch: expected ${expectedAmount}, received ${provAmount}`);
    err.code = ERROR_CODES.PAYMENT_AMOUNT_MISMATCH;
    err.status = 400;
    throw err;
  }

  const expectedCurrency = String(order.currency || 'INR').toUpperCase();
  const provCurrency = String(provPayment.currency || 'INR').toUpperCase();
  if (provCurrency !== expectedCurrency) {
    attempt.status = PAYMENT_STATUS.FAILED;
    attempt.errorCode = ERROR_CODES.PAYMENT_CURRENCY_MISMATCH;
    attempt.error_code = ERROR_CODES.PAYMENT_CURRENCY_MISMATCH;
    order.status = ORDER_STATUS.PAYMENT_FAILED;
    const err = new Error(`Payment currency mismatch: expected ${expectedCurrency}, received ${provCurrency}`);
    err.code = ERROR_CODES.PAYMENT_CURRENCY_MISMATCH;
    err.status = 400;
    throw err;
  }

  const provStatus = String(provPayment.status || '').toLowerCase();
  if (provStatus === 'authorized' || provPayment.captured === false) {
    const err = new Error('Payment is authorized but not yet captured by payment gateway.');
    err.code = ERROR_CODES.PAYMENT_VERIFICATION_PENDING;
    err.status = 402;
    throw err;
  }

  if (provStatus === 'refunded' || provPayment.refund_status) {
    const err = new Error('Payment has been refunded and cannot be accepted.');
    err.code = ERROR_CODES.INVALID_ORDER_STATE;
    err.status = 400;
    throw err;
  }

  if (provStatus !== 'captured') {
    const err = new Error(`Payment has not been captured by provider (status: ${provStatus}).`);
    err.code = ERROR_CODES.PAYMENT_VERIFICATION_FAILED;
    err.status = 400;
    throw err;
  }

  // 10. Transition States to PAID and CAPTURED
  attempt.status = PAYMENT_STATUS.CAPTURED;
  attempt.signatureVerified = 1;
  attempt.signature_verified = 1;
  attempt.verifiedAt = now;
  attempt.verified_at = now;

  order.status = ORDER_STATUS.PAID;
  order.transactionId = razorpayPaymentId;
  order.transaction_id = razorpayPaymentId;
  order.verifiedAt = now;
  order.verified_at = now;
  order.updatedAt = now;
  order.updated_at = now;

  // 8. Grant Entitlement Idempotently
  const orderItem = orderItems.find(i => i.orderId === order.id);
  const entitlementId = `ent_${order.userId}_${order.plan}_${order.id.slice(-6)}`;

  let entitlement = entitlements.find(e => e.orderId === order.id || e.order_id === order.id);
  if (!entitlement) {
    const resolvedTplId = orderItem?.templateId || order.templateId || order.template_id || null;
    const resolvedSlug = order.requestedSlug || order.requested_slug || null;
    const resolvedWishId = order.wishId || order.wish_id || null;
    entitlement = {
      id: entitlementId,
      userId: order.userId,
      user_id: order.userId,
      orderId: order.id,
      order_id: order.id,
      productId: order.plan,
      product_id: order.plan,
      itemType: orderItem?.productType || order.plan,
      item_type: orderItem?.productType || order.plan,
      itemId: resolvedTplId || resolvedSlug || order.plan,
      item_id: resolvedTplId || resolvedSlug || order.plan,
      plan: order.plan === 'vip_pass' ? 'VIP' : order.plan,
      templateId: resolvedTplId,
      template_id: resolvedTplId,
      wishId: resolvedWishId,
      wish_id: resolvedWishId,
      requestedSlug: resolvedSlug,
      requested_slug: resolvedSlug,
      amountPaise: order.amount,
      amount_paise: order.amount,
      templateFamilyId: orderItem?.templateFamilyId || null,
      template_family_id: orderItem?.templateFamilyId || null,
      status: 'active',
      source: 'purchase',
      startsAt: now,
      starts_at: now,
      expiresAt: null,
      expires_at: null,
      createdAt: now,
      created_at: now,
      updatedAt: now,
      updated_at: now
    };
    entitlements.push(entitlement);
  }

  // 9. Generate In-App & Email Purchase Notification (Non-blocking)
  try {
    const notif = createInAppNotification({
      userId: order.userId,
      title: '👑 Celebration Pass Unlocked!',
      message: `Your payment of ₹${Math.round(order.amount / 100)} was verified. ${orderItem?.productName || 'VIP privileges'} are now active!`,
      type: NOTIFICATION_TYPES.ACCOUNT_SECURITY,
      metadata: { orderId: order.id, transactionId: razorpayPaymentId }
    });
    notifications.push(notif);
  } catch (notifErr) {
    console.warn('[Notification] Purchase notification could not be created:', notifErr.message);
  }

  // 10. Audit Log Integration (Part 30)
  try {
    const audit = createAuditLogEntry({
      actorId: user?.id || order.userId,
      actorName: user?.displayName || user?.email || 'Customer',
      actorRole: 'customer',
      action: 'PAYMENT_VERIFIED_SUCCESS',
      targetType: 'order',
      targetId: order.id,
      details: {
        amount: order.amount,
        currency: order.currency,
        razorpayPaymentId,
        productId: order.plan
      }
    });
    auditLogs.push(audit);
  } catch (auditErr) {
    console.warn('[Audit] Payment audit could not be created:', auditErr.message);
  }

  return {
    success: true,
    alreadyFinalized: false,
    order,
    attempt,
    entitlement
  };
}

// ============================================================================
// 8. WEBHOOK PROCESSING & DEDUPLICATION
// ============================================================================

/**
 * Securely processes Razorpay Webhook events idempotently
 */
export async function processRazorpayWebhook({
  rawBody,
  signature,
  adapter,
  stores
}) {
  if (!adapter || !adapter.isConfigured()) {
    const err = new Error('Gateway webhook credentials not configured');
    err.code = ERROR_CODES.PAYMENT_PROVIDER_NOT_CONFIGURED;
    throw err;
  }

  // 1. Verify Webhook Signature
  const isValid = adapter.verifyWebhook({ rawBody, signature });
  if (!isValid) {
    const err = new Error('Webhook signature authentication failed');
    err.code = ERROR_CODES.FORBIDDEN;
    throw err;
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (jsonErr) {
    throw new Error('Malformed JSON webhook payload');
  }

  const eventId = typeof event.event_id === 'string' && event.event_id.trim() ? event.event_id.trim() : (typeof event.id === 'string' && event.id.trim() ? event.id.trim() : null);
  if (!eventId) {
    const err = new Error('Missing or invalid provider event ID');
    err.code = ERROR_CODES.BAD_REQUEST || 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }
  const eventType = event.event;

  // 2. Deduplication check in payment_webhooks store
  const existingWebhook = stores.paymentWebhooks.find(w => w.eventId === eventId || w.event_id === eventId);
  if (existingWebhook && existingWebhook.status === 'PROCESSED') {
    return {
      success: true,
      deduplicated: true,
      message: 'Event was already processed idempotently.'
    };
  }

  const now = new Date().toISOString();
  const webhookRecord = existingWebhook || {
    id: `wb_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`,
    provider: PAYMENT_PROVIDERS.RAZORPAY,
    eventId,
    event_id: eventId,
    eventType,
    event_type: eventType,
    orderId: null,
    order_id: null,
    paymentId: null,
    payment_id: null,
    payloadSummary: JSON.stringify({ event: eventType, entity: event.payload?.payment?.entity?.id || event.payload?.order?.entity?.id }),
    status: 'RECEIVED',
    receivedAt: now,
    received_at: now
  };

  if (!existingWebhook) {
    stores.paymentWebhooks.push(webhookRecord);
  }

  try {
    // 3. Handle Supported Event Types
    if (eventType === 'order.paid' || eventType === 'payment.captured') {
      const paymentEntity = event.payload?.payment?.entity || {};
      const orderEntity = event.payload?.order?.entity || {};
      const provOrderId = paymentEntity.order_id || orderEntity.id;
      const provPayId = paymentEntity.id;

      webhookRecord.orderId = provOrderId;
      webhookRecord.order_id = provOrderId;
      webhookRecord.paymentId = provPayId;
      webhookRecord.payment_id = provPayId;

      if (provOrderId) {
        const order = stores.orders.find(o => o.providerOrderId === provOrderId || o.provider_order_id === provOrderId);
        if (order && order.status !== ORDER_STATUS.PAID) {
          const webhookAdapter = Object.create(adapter);
          webhookAdapter.verifyPayment = () => true;
          webhookAdapter.fetchPayment = async () => ({
            id: provPayId,
            order_id: provOrderId,
            amount: Number(paymentEntity.amount || order.amount),
            currency: String(paymentEntity.currency || order.currency || 'INR'),
            status: 'captured',
            captured: true
          });

          await verifyAndFinalizePayment({
            orderId: order.id,
            razorpayOrderId: provOrderId,
            razorpayPaymentId: provPayId,
            razorpaySignature: 'WEBHOOK_VERIFIED', // Signature was verified at top of webhook
            user: { id: order.userId || order.user_id, role: 'system' },
            adapter: webhookAdapter,
            stores
          });
        }
      }
    } else if (eventType === 'payment.failed' || eventType === 'order.cancelled') {
      const paymentEntity = event.payload?.payment?.entity || {};
      const orderEntity = event.payload?.order?.entity || {};
      const provOrderId = paymentEntity.order_id || orderEntity.id;
      const provPayId = paymentEntity.id || null;
      const errCode = paymentEntity.error_code || (eventType === 'order.cancelled' ? 'ORDER_CANCELLED' : 'PAYMENT_FAILED');
      const errDesc = paymentEntity.error_description || paymentEntity.error_reason || 'Payment failed or was cancelled at gateway';

      webhookRecord.orderId = provOrderId;
      webhookRecord.order_id = provOrderId;
      webhookRecord.paymentId = provPayId;
      webhookRecord.payment_id = provPayId;

      if (provOrderId) {
        const order = stores.orders.find(o => o.providerOrderId === provOrderId || o.provider_order_id === provOrderId);
        if (order && order.status !== ORDER_STATUS.PAID) {
          order.status = eventType === 'order.cancelled' ? ORDER_STATUS.CANCELLED : ORDER_STATUS.PAYMENT_FAILED;
          order.errorCode = errCode;
          order.error_code = errCode;
          order.errorDescription = errDesc;
          order.error_description = errDesc;
          order.updatedAt = now;
          order.updated_at = now;

          const attempt = stores.paymentAttempts.find(p => p.orderId === order.id || p.order_id === order.id);
          if (attempt && attempt.status !== PAYMENT_STATUS.CAPTURED) {
            attempt.status = eventType === 'order.cancelled' ? PAYMENT_STATUS.CANCELLED : PAYMENT_STATUS.FAILED;
            attempt.providerPaymentId = provPayId || attempt.providerPaymentId;
            attempt.provider_payment_id = provPayId || attempt.provider_payment_id;
            attempt.errorCode = errCode;
            attempt.error_code = errCode;
            attempt.errorDescription = errDesc;
            attempt.error_description = errDesc;
            attempt.updatedAt = now;
            attempt.updated_at = now;
          }

          const ent = stores.entitlements.find(e => e.orderId === order.id || e.order_id === order.id);
          if (ent) {
            ent.status = 'revoked';
            ent.updatedAt = now;
            ent.updated_at = now;
          }
        }
      }
    } else if (eventType === 'refund.processed') {
      const refundEntity = event.payload?.refund?.entity || {};
      const provPayId = refundEntity.payment_id;
      const refundId = refundEntity.id || `rfnd_${Date.now().toString(36)}`;
      const refundAmount = Number(refundEntity.amount || 0);

      const order = stores.orders.find(o => o.transactionId === provPayId || o.transaction_id === provPayId);
      if (order) {
        const prevRefunded = Number(order.totalRefunded || order.total_refunded || 0);
        order.totalRefunded = prevRefunded + refundAmount;
        order.total_refunded = order.totalRefunded;
        order.status = (order.totalRefunded >= Number(order.amount)) ? ORDER_STATUS.REFUNDED : ORDER_STATUS.PARTIALLY_REFUNDED;
        order.refundStatus = order.status;
        order.refund_status = order.status;
        order.updatedAt = now;
        order.updated_at = now;

        if (Array.isArray(stores.refunds)) {
          stores.refunds.push({
            id: refundId,
            orderId: order.id,
            order_id: order.id,
            providerRefundId: refundId,
            provider_refund_id: refundId,
            amount: refundAmount,
            currency: order.currency || 'INR',
            status: REFUND_STATUS.SUCCEEDED,
            createdAt: now,
            created_at: now
          });
        }

        // Revoke entitlement if 100% refunded
        if (order.status === ORDER_STATUS.REFUNDED) {
          const ent = stores.entitlements.find(e => e.orderId === order.id || e.order_id === order.id);
          if (ent) {
            ent.status = 'revoked';
            ent.updatedAt = now;
            ent.updated_at = now;
          }
        }
      }
    }

    webhookRecord.status = 'PROCESSED';
    webhookRecord.processedAt = new Date().toISOString();
    webhookRecord.processed_at = webhookRecord.processedAt;
  } catch (procErr) {
    webhookRecord.status = 'FAILED';
    webhookRecord.errorCode = procErr.code || 'WEBHOOK_PROCESSING_FAILED';
    throw procErr;
  }

  return {
    success: true,
    eventId,
    eventType,
    status: 'PROCESSED'
  };
}

// ============================================================================
// 9. ADMIN REFUND OPERATIONS
// ============================================================================

/**
 * Initiates an authorized refund via Razorpay API and maintains audited records
 */
export async function processAdminRefund({
  orderId,
  amountPaise,
  reason = 'Customer Request',
  actor,
  adapter,
  stores: {
    orders,
    paymentAttempts,
    refunds,
    entitlements,
    auditLogs = []
  }
}) {
  if (!actor || !isAuthoritativeAdmin(actor)) {
    const err = new Error('Administrative privileges required to initiate refunds');
    err.code = ERROR_CODES.FORBIDDEN;
    err.status = 403;
    throw err;
  }

  const order = orders.find(o => o.id === orderId);
  if (!order) {
    const err = new Error('Order not found');
    err.code = ERROR_CODES.ORDER_NOT_FOUND;
    err.status = 404;
    throw err;
  }

  if (order.status === ORDER_STATUS.REFUNDED) {
    const err = new Error('This order has already been fully refunded');
    err.code = ERROR_CODES.REFUND_AMOUNT_INVALID;
    err.status = 400;
    throw err;
  }

  if (order.status !== ORDER_STATUS.PAID && order.status !== ORDER_STATUS.PARTIALLY_REFUNDED) {
    const err = new Error(`Cannot refund order in state: ${order.status}`);
    err.code = ERROR_CODES.REFUND_NOT_ALLOWED;
    err.status = 400;
    throw err;
  }

  const currentRefunded = Number(order.totalRefunded || order.total_refunded || 0);
  const remainingRefundable = order.amount - currentRefunded;

  if (remainingRefundable <= 0) {
    const err = new Error('This order has already been fully refunded');
    err.code = ERROR_CODES.REFUND_AMOUNT_INVALID;
    err.status = 400;
    throw err;
  }

  const targetAmount = amountPaise ? Math.min(Number(amountPaise), remainingRefundable) : remainingRefundable;
  if (targetAmount <= 0) {
    const err = new Error('Invalid refund amount specified');
    err.code = ERROR_CODES.REFUND_AMOUNT_INVALID;
    err.status = 400;
    throw err;
  }

  if (!adapter || !adapter.isConfigured()) {
    const err = new Error('Payment gateway not configured for live refund execution');
    err.code = ERROR_CODES.PAYMENT_PROVIDER_NOT_CONFIGURED;
    err.status = 503;
    throw err;
  }

  const paymentAttempt = paymentAttempts.find(p => p.orderId === order.id && p.status === PAYMENT_STATUS.CAPTURED);
  const providerPaymentId = order.transactionId || order.transaction_id || paymentAttempt?.providerPaymentId || paymentAttempt?.provider_payment_id;

  if (!providerPaymentId) {
    const err = new Error('No captured gateway payment reference available to refund');
    err.code = ERROR_CODES.REFUND_NOT_ALLOWED;
    err.status = 400;
    throw err;
  }

  const now = new Date().toISOString();
  const refundId = `ref_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`;

  // Submit to Razorpay API
  let providerRefund;
  try {
    providerRefund = await adapter.createRefund({
      providerPaymentId,
      amountPaise: targetAmount,
      notes: { orderId: order.id, refundReason: reason }
    });
  } catch (apiErr) {
    const err = new Error(`Gateway refund rejected: ${apiErr.message}`);
    err.code = apiErr.code || ERROR_CODES.REFUND_NOT_ALLOWED;
    err.status = 502;
    throw err;
  }

  const isFullRefund = (currentRefunded + targetAmount) >= order.amount;

  const refundRecord = {
    id: refundId,
    orderId: order.id,
    order_id: order.id,
    paymentAttemptId: paymentAttempt?.id || null,
    payment_attempt_id: paymentAttempt?.id || null,
    providerRefundId: providerRefund.id,
    provider_refund_id: providerRefund.id,
    amount: targetAmount,
    currency: order.currency,
    reason,
    status: REFUND_STATUS.SUCCEEDED,
    requestedBy: actor.id,
    requested_by: actor.id,
    errorCode: null,
    error_code: null,
    errorDescription: null,
    error_description: null,
    createdAt: now,
    created_at: now,
    updatedAt: now,
    updated_at: now,
    completedAt: now,
    completed_at: now
  };

  refunds.push(refundRecord);

  // Update Order
  order.totalRefunded = currentRefunded + targetAmount;
  order.total_refunded = order.totalRefunded;
  order.status = isFullRefund ? ORDER_STATUS.REFUNDED : ORDER_STATUS.PARTIALLY_REFUNDED;
  order.refundStatus = order.status;
  order.refund_status = order.status;
  order.updatedAt = now;
  order.updated_at = now;

  // Revoke entitlement if full refund
  if (isFullRefund) {
    const ent = entitlements.find(e => (e.orderId === order.id || e.order_id === order.id) && e.status === 'active');
    if (ent) {
      ent.status = 'revoked';
      ent.updatedAt = now;
      ent.updated_at = now;
    }
  }

  // Audit Log Entry
  try {
    const audit = createAuditLogEntry({
      actorId: actor.id,
      actorName: actor.displayName || actor.name || 'Admin',
      actorRole: actor.role || 'ADMIN',
      action: 'ORDER_REFUND_EXECUTED',
      targetType: 'order',
      targetId: order.id,
      details: {
        refundId,
        providerRefundId: providerRefund.id,
        amountPaise: targetAmount,
        currency: order.currency,
        isFullRefund,
        reason
      }
    });
    auditLogs.push(audit);
  } catch (aErr) {}

  return {
    success: true,
    refund: refundRecord,
    order,
    isFullRefund
  };
}

// ============================================================================
// 10. RECONCILIATION & RECOVERY ENGINE
// ============================================================================

/**
 * Reconciles unresolved orders against the payment gateway to repair state inconsistencies
 */
export async function reconcileUnresolvedOrders({
  adapter,
  batchSize = 25,
  maxAgeMs = 15 * 60 * 1000, // 15 mins
  stores
}) {
  const result = {
    scanned: 0,
    repaired: 0,
    pending: 0,
    failed: 0,
    details: []
  };

  if (!adapter || !adapter.isConfigured()) {
    result.error = ERROR_CODES.PAYMENT_PROVIDER_NOT_CONFIGURED;
    return result;
  }

  const now = Date.now();
  // Find pending or payment_processing orders older than 5 mins
  const candidateOrders = stores.orders
    .filter(o => o.status === ORDER_STATUS.PENDING || o.status === ORDER_STATUS.PAYMENT_PROCESSING)
    .filter(o => (now - new Date(o.createdAt || o.created_at).getTime()) > 5 * 60 * 1000)
    .slice(0, batchSize);

  result.scanned = candidateOrders.length;

  for (const order of candidateOrders) {
    try {
      const provOrderId = order.providerOrderId || order.provider_order_id;
      if (!provOrderId) {
        result.pending++;
        continue;
      }

      const provOrder = await adapter.fetchOrder(provOrderId);
      if (provOrder && provOrder.status === 'paid') {
        // Gateway confirms paid! Repair order and grant entitlement
        const reconciledPayId = `pay_reconciled_${Date.now()}`;
        const reconcileAdapter = Object.create(adapter);
        reconcileAdapter.verifyPayment = () => true;
        reconcileAdapter.fetchPayment = async () => ({
          id: reconciledPayId,
          order_id: provOrderId,
          amount: Number(order.amount),
          currency: String(order.currency || 'INR'),
          status: 'captured',
          captured: true
        });

        await verifyAndFinalizePayment({
          orderId: order.id,
          razorpayOrderId: provOrderId,
          razorpayPaymentId: reconciledPayId,
          razorpaySignature: 'RECONCILED_FROM_GATEWAY',
          user: { id: order.userId || order.user_id, role: 'system' },
          adapter: reconcileAdapter,
          stores
        });

        result.repaired++;
        result.details.push({ orderId: order.id, action: 'REPAIRED_TO_PAID' });
      } else if (provOrder && (provOrder.status === 'attempted' || provOrder.status === 'created')) {
        result.pending++;
      }
    } catch (recErr) {
      result.failed++;
      result.details.push({ orderId: order.id, error: recErr.message });
    }
  }

  return result;
}
