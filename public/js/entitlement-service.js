// WishMagic Centralized Entitlement & Access Layer
// Part 11: Premium Access & Monetization Architecture
//
// ⚠️ SECURITY ARCHITECTURAL WARNING:
// Frontend entitlement checks are for UX enablement and flow control only.
// Frontend entitlement checks are NOT a security boundary.
// Production server-side authorization and webhook-verified payment entitlements
// will be enforced on the backend in subsequent parts.

(function(window) {
  'use strict';

  const STORAGE_KEY_PREFIX = 'wishmagic_entitlement_';
  const listeners = new Set();

  /**
   * Safe parser helper
   */
  function safeJSONParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  /**
   * Get active user ID safely from WishAuth
   */
  function getActiveUserId() {
    if (window.WishAuth && typeof window.WishAuth.getCurrentUser === 'function') {
      const u = window.WishAuth.getCurrentUser();
      if (u && u.id) return u.id;
    }
    return 'usr_guest';
  }

  /**
   * Default Entitlement Record Generator
   */
  function createDefaultEntitlement(userId, planId = 'free', source = 'default') {
    const isPremium = planId === 'premium';
    const plan = (window.WishPlanService && window.WishPlanService.getPlan(planId)) || {
      id: planId,
      features: isPremium ? [
        'premium_templates', 'advanced_themes', 'advanced_sections',
        'unlimited_photos', 'voice_note', 'premium_music',
        'remove_watermark', 'premium_effects', 'keep_memory_forever'
      ] : []
    };

    return {
      id: `ent_${userId}_${planId}`,
      userId,
      planId,
      isPremium,
      features: Array.isArray(plan.features) ? [...plan.features] : [],
      source, // 'dev_adapter' | 'default' | 'purchased'
      grantedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: null
    };
  }

  // Current session cache
  let cachedEntitlement = null;
  let cachedUserId = null;

  function loadEntitlementForUser(userId) {
    if (!userId) userId = getActiveUserId();
    const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;
    const raw = localStorage.getItem(storageKey);
    let record = safeJSONParse(raw, null);

    if (!record || !record.planId) {
      // By default in dev environment:
      // If user is 'usr_ankit_101', default to free plan to let developers test Free experience
      // If user is 'usr_admin_999', grant development admin VIP pass
      const defaultPlan = (userId === 'usr_admin_999') ? 'premium' : 'free';
      record = createDefaultEntitlement(userId, defaultPlan, 'dev_adapter');
      saveEntitlementForUser(userId, record);
    }

    cachedEntitlement = record;
    cachedUserId = userId;
    return record;
  }

  function saveEntitlementForUser(userId, record) {
    if (!userId) userId = getActiveUserId();
    const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(record));
    } catch (e) {
      console.warn('[WishEntitlement] Storage write error:', e);
    }
  }

  function notifyEntitlementChange() {
    listeners.forEach(fn => {
      try {
        fn(cachedEntitlement);
      } catch (err) {
        console.error('[WishEntitlement] Listener error:', err);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // CENTRAL ENTITLEMENT SERVICE
  // ---------------------------------------------------------------------------
  const WishEntitlement = {
    /**
     * Get the active normalized entitlement record for current user
     */
    getCurrentEntitlement() {
      const currentUserId = getActiveUserId();
      if (!cachedEntitlement || cachedUserId !== currentUserId) {
        loadEntitlementForUser(currentUserId);
      }
      return { ...cachedEntitlement };
    },

    /**
     * Check if active user has Premium entitlement
     */
    isPremium() {
      const ent = this.getCurrentEntitlement();
      return Boolean(ent && (ent.isPremium || ent.planId === 'premium'));
    },

    /**
     * Check if user has specific entitlement feature key
     * @param {string} entitlementKey (e.g., 'premium_templates', 'voice_note')
     * @param {Object} [context]
     */
    hasEntitlement(entitlementKey, context = {}) {
      if (!entitlementKey) return true;
      const ent = this.getCurrentEntitlement();
      if (!ent) return false;

      // If user is on premium plan, check if feature is included in premium
      if (ent.isPremium || ent.planId === 'premium') {
        return true;
      }

      // If Free plan, check if feature is in free feature list
      if (ent.features && ent.features.includes(entitlementKey)) {
        return true;
      }

      return false;
    },

    /**
     * Get current user's active plan object
     */
    getPlan() {
      const ent = this.getCurrentEntitlement();
      const planId = (ent && ent.planId) || 'free';
      return (window.WishPlanService && window.WishPlanService.getPlan(planId)) || null;
    },

    /**
     * Development-Only Entitlement Switcher (Section 17)
     * Clearly isolated mock development adapter
     * @param {'free' | 'premium'} targetPlanId
     */
    setDevelopmentPlan(targetPlanId = 'premium') {
      const userId = getActiveUserId();
      const normalizedPlan = (targetPlanId === 'premium') ? 'premium' : 'free';
      const record = createDefaultEntitlement(userId, normalizedPlan, 'dev_adapter');

      saveEntitlementForUser(userId, record);
      cachedEntitlement = record;
      cachedUserId = userId;

      console.info(`[WishEntitlement] Development entitlement switched to: ${normalizedPlan.toUpperCase()}`);
      notifyEntitlementChange();
      return { ...record };
    },

    /**
     * Determine a wish's plan/tier without corrupting saved data
     */
    getWishPlan(wish) {
      if (!wish) return 'free';
      if (wish.tier === 'vip' || wish.tier === 'premium' || wish.isPremium) return 'premium';
      if (wish.payment && (wish.payment.status === 'Completed' || wish.payment.amount > 0)) return 'premium';
      if (wish.customData && (wish.customData.tier === 'vip' || wish.customData.tier === 'premium' || wish.customData.isPremium)) return 'premium';
      if (wish.price && Number(wish.price) > 0) return 'premium';
      return 'free';
    },

    /**
     * Subscribe to entitlement state changes
     */
    onEntitlementChange(callback) {
      if (typeof callback === 'function') {
        listeners.add(callback);
        return () => listeners.delete(callback);
      }
      return () => {};
    }
  };

  // Listen to Auth State Changes from Part 9 auth service
  if (window.WishAuth && typeof window.WishAuth.onAuthStateChange === 'function') {
    window.WishAuth.onAuthStateChange((user) => {
      const userId = user ? user.id : 'usr_guest';
      loadEntitlementForUser(userId);
      notifyEntitlementChange();
    });
  }

  // Initial load
  loadEntitlementForUser(getActiveUserId());

  window.WishEntitlement = WishEntitlement;

})(typeof window !== 'undefined' ? window : globalThis);
