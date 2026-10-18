// WishMagic Centralized Entitlement & Access Layer
// Part 11 + Scoped Item-Level Entitlement Architecture
//
// ⚠️ SECURITY ARCHITECTURAL WARNING:
// Frontend entitlement checks are for UX enablement and flow control only.
// Authoritative entitlement verification is strictly enforced on the server.

(function(window) {
  'use strict';

  const STORAGE_KEY_PREFIX = 'wishmagic_entitlement_';
  const listeners = new Set();

  function safeJSONParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function getActiveUserId() {
    if (window.WishAuth && typeof window.WishAuth.getCurrentUser === 'function') {
      const u = window.WishAuth.getCurrentUser();
      if (u && u.id) return u.id;
    }
    return 'usr_guest';
  }

  function createDefaultEntitlement(userId, planId = 'free', source = 'default') {
    const isPremium = planId === 'premium';
    const plan = (window.WishPlanService && window.WishPlanService.getPlan(planId)) || {
      id: planId,
      features: isPremium ? [
        'premium_templates', 'advanced_themes', 'advanced_sections',
        'unlimited_photos', 'voice_note', 'premium_music',
        'remove_watermark', 'premium_effects', 'keep_memory_forever',
        'custom_link'
      ] : []
    };

    return {
      id: `ent_${userId}_${planId}`,
      userId,
      planId,
      isPremium,
      hasVipPass: isPremium,
      hasCustomLinkEntitlement: isPremium,
      hasHdStyleEntitlement: isPremium,
      unlockedTemplates: [],
      unlockedSlugs: [],
      activeEntitlements: [],
      features: Array.isArray(plan.features) ? [...plan.features] : [],
      source,
      grantedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: null
    };
  }

  let cachedEntitlement = null;
  let cachedUserId = null;

  function loadEntitlementForUser(userId) {
    if (!userId) userId = getActiveUserId();
    const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;
    const raw = localStorage.getItem(storageKey);
    let record = safeJSONParse(raw, null);

    if (!record || !record.planId || (record.userId && record.userId !== userId)) {
      const isUserPremium = Boolean(window.WishAuth && (window.WishAuth.getCurrentUser()?.isPremium || window.WishAuth.getCurrentUser()?.plan === 'VIP'));
      const defaultPlan = isUserPremium ? 'premium' : 'free';
      record = createDefaultEntitlement(userId, defaultPlan, 'auth_session');
      saveEntitlementForUser(userId, record);
    }

    // Ensure arrays exist on older cached records
    if (!Array.isArray(record.unlockedTemplates)) record.unlockedTemplates = [];
    if (!Array.isArray(record.unlockedSlugs)) record.unlockedSlugs = [];
    if (!Array.isArray(record.activeEntitlements)) record.activeEntitlements = [];

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
     * Check if active user has full VIP Pass entitlement
     */
    isPremium() {
      const ent = this.getCurrentEntitlement();
      return Boolean(ent && (ent.hasVipPass || ent.isPremium || ent.planId === 'premium'));
    },

    /**
     * Check if active user has unlocked a specific template (via VIP Pass, single template unlock, or premium template combo)
     */
    hasTemplateEntitlement(templateId) {
      if (!templateId) return this.isPremium();
      const ent = this.getCurrentEntitlement();
      if (!ent) return false;
      if (ent.hasVipPass || ent.isPremium || ent.planId === 'premium') return true;
      const cleanId = String(templateId).trim();
      if (Array.isArray(ent.unlockedTemplates) && ent.unlockedTemplates.includes(cleanId)) {
        return true;
      }
      if (Array.isArray(ent.activeEntitlements)) {
        return ent.activeEntitlements.some(e =>
          e && e.status === 'ACTIVE' && (
            e.itemType === 'VIP_PASS' ||
            e.templateId === cleanId ||
            e.itemId === cleanId ||
            e.productId === `template:${cleanId}`
          )
        );
      }
      return false;
    },

    /**
     * Check if active user has Custom Link entitlement (via VIP Pass, Custom Link pack, Free Combo, or Premium Combo)
     */
    hasCustomLinkAccess(slug = null, templateId = null) {
      const ent = this.getCurrentEntitlement();
      if (!ent) return false;
      if (ent.hasVipPass || ent.isPremium || ent.planId === 'premium') return true;
      if (ent.hasCustomLinkEntitlement) {
        if (!templateId) return true;
        // If tied to a specific template combo, check matching template or general custom link entitlement
        const matchingEnt = (ent.activeEntitlements || []).find(e =>
          e && e.status === 'ACTIVE' && (
            e.itemType === 'CUSTOM_LINK' ||
            e.itemType === 'FREE_COMBO' ||
            (e.itemType === 'PREMIUM_COMBO' && (!e.templateId || e.templateId === templateId))
          )
        );
        if (matchingEnt || !(ent.activeEntitlements || []).length) return true;
      }
      if (slug && Array.isArray(ent.unlockedSlugs) && ent.unlockedSlugs.includes(String(slug).toLowerCase().trim())) {
        return true;
      }
      return false;
    },

    /**
     * Check if active user has HD Images & Custom Style entitlement
     */
    hasHdStyleAccess(templateId = null) {
      const ent = this.getCurrentEntitlement();
      if (!ent) return false;
      if (ent.hasVipPass || ent.isPremium || ent.planId === 'premium') return true;
      if (ent.hasHdStyleEntitlement) {
        if (!templateId) return true;
        const matchingEnt = (ent.activeEntitlements || []).find(e =>
          e && e.status === 'ACTIVE' && (
            e.itemType === 'HD_STYLE' ||
            e.itemType === 'FREE_COMBO' ||
            (e.itemType === 'PREMIUM_COMBO' && (!e.templateId || e.templateId === templateId))
          )
        );
        if (matchingEnt || !(ent.activeEntitlements || []).length) return true;
      }
      return false;
    },

    /**
     * Check if user has specific entitlement feature key
     * @param {string} entitlementKey (e.g., 'premium_templates', 'voice_note', 'custom_link', 'advanced_themes')
     * @param {Object} [context]
     */
    hasEntitlement(entitlementKey, context = {}) {
      if (!entitlementKey) return true;
      const ent = this.getCurrentEntitlement();
      if (!ent) return false;

      if (ent.hasVipPass || ent.isPremium || ent.planId === 'premium') {
        return true;
      }

      if (entitlementKey === 'premium_templates' && context && context.templateId) {
        return this.hasTemplateEntitlement(context.templateId);
      }

      if (entitlementKey === 'custom_link') {
        return this.hasCustomLinkAccess(context?.slug, context?.templateId);
      }

      if (entitlementKey === 'advanced_themes' || entitlementKey === 'unlimited_photos') {
        return this.hasHdStyleAccess(context?.templateId);
      }

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
     * Refresh authoritative entitlement state from the server
     */
    async refresh() {
      const userId = getActiveUserId();
      try {
        const res = await fetch('/api/entitlements/status', { credentials: 'include' });
        const data = await res.json();
        if (data && data.success) {
          const hasVipPass = Boolean(data.hasVipPass ?? data.isPremium);
          const hasCustomLinkEntitlement = Boolean(data.hasCustomLinkEntitlement || hasVipPass);
          const hasHdStyleEntitlement = Boolean(data.hasHdStyleEntitlement || hasVipPass);
          const unlockedTemplates = Array.isArray(data.unlockedTemplates) ? data.unlockedTemplates : [];
          const activeEntitlements = Array.isArray(data.activeEntitlements) ? data.activeEntitlements : [];
          const unlockedSlugs = activeEntitlements
            .map(e => e && e.requestedSlug)
            .filter(Boolean);

          const planId = hasVipPass ? 'premium' : 'free';
          const record = createDefaultEntitlement(userId, planId, 'server_authoritative');
          record.isPremium = hasVipPass;
          record.hasVipPass = hasVipPass;
          record.hasCustomLinkEntitlement = hasCustomLinkEntitlement;
          record.hasHdStyleEntitlement = hasHdStyleEntitlement;
          record.unlockedTemplates = unlockedTemplates;
          record.unlockedSlugs = unlockedSlugs;
          record.activeEntitlements = activeEntitlements;

          const extraFeatures = new Set(record.features || []);
          if (hasCustomLinkEntitlement) extraFeatures.add('custom_link');
          if (hasHdStyleEntitlement) {
            extraFeatures.add('advanced_themes');
            extraFeatures.add('unlimited_photos');
            extraFeatures.add('remove_watermark');
          }
          if (unlockedTemplates.length > 0) {
            extraFeatures.add('unlocked_template');
          }
          record.features = Array.from(extraFeatures);

          saveEntitlementForUser(userId, record);
          cachedEntitlement = record;
          cachedUserId = userId;
          notifyEntitlementChange();
          return record;
        }
      } catch (err) {
        console.warn('[WishEntitlement] Could not sync with server:', err);
      }
      return this.getCurrentEntitlement();
    },

    /**
     * Safe Entitlement State Synchronization
     */
    setDevelopmentPlan() {
      console.warn('[WishEntitlement] Client-side entitlement elevation is disabled. Entitlements are strictly server-authoritative.');
      return this.refresh();
    },

    /**
     * Determine a wish's plan/tier without corrupting saved data
     */
    getWishPlan(wish) {
      if (!wish) return 'free';
      if (wish.tier === 'vip' || wish.tier === 'premium' || wish.isPremium) return 'premium';
      if (wish.payment && (wish.payment.status === 'Completed' || wish.payment.status === 'PAID')) return 'premium';
      if (wish.customData && (wish.customData.tier === 'vip' || wish.customData.tier === 'premium' || wish.customData.isPremium)) return 'premium';
      if (wish.price && Number(wish.price) > 0 && wish.payment && (wish.payment.status === 'Completed' || wish.payment.status === 'PAID')) return 'premium';
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

  if (window.WishAuth && typeof window.WishAuth.onAuthStateChange === 'function') {
    window.WishAuth.onAuthStateChange((user) => {
      const userId = user ? user.id : 'usr_guest';
      loadEntitlementForUser(userId);
      if (user && user.id) {
        WishEntitlement.refresh();
      } else {
        notifyEntitlementChange();
      }
    });
  }

  loadEntitlementForUser(getActiveUserId());

  window.WishEntitlement = WishEntitlement;

})(typeof window !== 'undefined' ? window : globalThis);
