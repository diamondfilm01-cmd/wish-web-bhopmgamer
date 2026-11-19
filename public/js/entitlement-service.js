(function (window2) {
  "use strict";
  const STORAGE_KEY_PREFIX = "wishmagic_entitlement_";
  const listeners = new Set();

  function safeJSONParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function getActiveUserId() {
    if (window2.WishAuth && typeof window2.WishAuth.getCurrentUser === "function") {
      const u = window2.WishAuth.getCurrentUser();
      if (u && u.id) return u.id;
    }
    return "usr_guest";
  }

  function isEntActive(e) {
    if (!e || typeof e !== "object") return false;
    const st = String(e.status || "").trim().toUpperCase();
    return st === "ACTIVE" || e.isActive === true || e.is_active === 1 || e.is_active === true;
  }

  function parseWishBundle(productId) {
    const raw = String(productId || "").trim();
    if (!raw.toLowerCase().startsWith("wish_bundle:")) return null;
    const parts = raw.split(":");
    const rawTpl = String(parts[1] || "").trim();
    const rawLink = String(parts[2] || "none").trim().toLowerCase();
    const rawHd = String(parts[3] || "0").trim().toLowerCase();
    return {
      templateId: rawTpl && rawTpl.toLowerCase() !== "free" && rawTpl.toLowerCase() !== "none" ? rawTpl : null,
      linkMode: rawLink === "1yr" || rawLink === "1_year" ? "1yr" : rawLink === "custom" ? "custom" : "none",
      hasHdPhotos: rawHd === "1" || rawHd === "true" || rawHd === "hd"
    };
  }

  function getEntKeys(e) {
    const itemType = String(e.itemType || e.item_type || "").trim().toLowerCase();
    const productIdRaw = String(e.productId || e.product_id || "").trim();
    const productId = productIdRaw.toLowerCase();
    const plan = String(e.plan || e.plan_id || "").trim().toLowerCase();
    const bundle = parseWishBundle(productIdRaw);
    const templateId = String(
      e.templateId ||
        e.template_id ||
        (bundle && bundle.templateId ? bundle.templateId : "") ||
        (productId.startsWith("template:") ? productIdRaw.slice(9) : "") ||
        (productId.startsWith("premium_combo:") ? productIdRaw.slice(14) : "") ||
        (productId.startsWith("premium_link:") ? productIdRaw.slice(13) : "") ||
        (productId.startsWith("premium_hd:") ? productIdRaw.slice(11) : "") ||
        e.itemId ||
        e.item_id ||
        ""
    ).trim();
    return { itemType, productId, productIdRaw, plan, templateId, bundle };
  }

  function createDefaultEntitlement(userId, planId = "free", source = "default") {
    const isPremium = planId === "premium";
    const plan = (window2.WishPlanService && window2.WishPlanService.getPlan(planId)) || {
      id: planId,
      features: isPremium
        ? [
            "premium_templates",
            "custom_link",
            "yearly_custom_link",
            "hd_photos",
            "unlimited_photos",
            "remove_watermark",
            "keep_memory_forever"
          ]
        : []
    };
    return {
      id: `ent_${userId}_${planId}`,
      userId,
      planId,
      isPremium,
      hasVipPass: isPremium,
      hasCustomLinkEntitlement: isPremium,
      hasYearlyLinkEntitlement: isPremium,
      hasHdPhotosEntitlement: isPremium,
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
    userId || (userId = getActiveUserId());
    const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;
    const raw = localStorage.getItem(storageKey);
    let record = safeJSONParse(raw, null);
    if (!record || !record.planId || (record.userId && record.userId !== userId)) {
      const curUser =
        window2.WishAuth && typeof window2.WishAuth.getCurrentUser === "function"
          ? window2.WishAuth.getCurrentUser()
          : null;
      const defaultPlan = Boolean(curUser && (curUser.isPremium || curUser.plan === "VIP" || curUser.role === "admin"))
        ? "premium"
        : "free";
      record = createDefaultEntitlement(userId, defaultPlan, "auth_session");
      saveEntitlementForUser(userId, record);
    }
    if (!Array.isArray(record.unlockedTemplates)) record.unlockedTemplates = [];
    if (!Array.isArray(record.unlockedSlugs)) record.unlockedSlugs = [];
    if (!Array.isArray(record.activeEntitlements)) record.activeEntitlements = [];
    cachedEntitlement = record;
    cachedUserId = userId;
    return record;
  }

  function saveEntitlementForUser(userId, record) {
    userId || (userId = getActiveUserId());
    const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(record));
    } catch (e) {
      console.warn("[WishEntitlement] Storage write error:", e);
    }
  }

  function notifyEntitlementChange() {
    listeners.forEach((fn) => {
      try {
        fn(cachedEntitlement);
      } catch (err) {
        console.error("[WishEntitlement] Listener error:", err);
      }
    });
  }

  const WishEntitlement = {
    getCurrentEntitlement() {
      const currentUserId = getActiveUserId();
      if (!cachedEntitlement || cachedUserId !== currentUserId) {
        loadEntitlementForUser(currentUserId);
      }
      return { ...cachedEntitlement };
    },

    isPremium() {
      const ent = this.getCurrentEntitlement();
      return Boolean(ent && (ent.hasVipPass || ent.isPremium || ent.planId === "premium"));
    },

    hasTemplateEntitlement(templateId) {
      if (!templateId) return this.isPremium();
      const ent = this.getCurrentEntitlement();
      if (!ent) return false;
      if (ent.hasVipPass || ent.isPremium || ent.planId === "premium") return true;
      const cleanId = String(templateId).trim();
      const cleanIdLower = cleanId.toLowerCase();
      if (
        Array.isArray(ent.unlockedTemplates) &&
        (ent.unlockedTemplates.includes("*") || ent.unlockedTemplates.includes(cleanId))
      ) {
        return true;
      }
      if (!Array.isArray(ent.activeEntitlements)) return false;
      return ent.activeEntitlements.some((e) => {
        if (!isEntActive(e)) return false;
        const { itemType, productId, plan, templateId: entTplId, bundle } = getEntKeys(e);
        if (itemType === "vip_pass" || productId === "vip_pass" || plan === "vip" || plan === "vip_pass") {
          return true;
        }
        if (bundle && bundle.templateId && bundle.templateId.toLowerCase() === cleanIdLower) {
          return true;
        }
        return (
          entTplId === cleanId ||
          productId === `template:${cleanIdLower}` ||
          productId === `premium_combo:${cleanIdLower}` ||
          productId === `premium_link:${cleanIdLower}` ||
          productId === `premium_hd:${cleanIdLower}`
        );
      });
    },

    hasYearlyLinkAccess(slug = null, templateId = null) {
      const ent = this.getCurrentEntitlement();
      if (!ent) return false;
      if (ent.hasVipPass || ent.isPremium || ent.planId === "premium") return true;

      const activeList = Array.isArray(ent.activeEntitlements) ? ent.activeEntitlements.filter(isEntActive) : [];
      const cleanTplId = templateId ? String(templateId).trim().toLowerCase() : "";

      const matchedEntry = activeList.some((e) => {
        const { itemType, productId, plan, templateId: entTplId, bundle } = getEntKeys(e);
        if (
          itemType === "vip_pass" ||
          productId === "vip_pass" ||
          plan === "vip" ||
          itemType === "custom_link_1yr" ||
          productId === "custom_link_1yr" ||
          plan === "custom_link_1yr" ||
          e.linkDuration === "1_year" ||
          Number(e.validityDays || 0) >= 365
        ) {
          return true;
        }
        if (bundle && bundle.linkMode === "1yr") {
          return !cleanTplId || !bundle.templateId || bundle.templateId.toLowerCase() === cleanTplId;
        }
        if (entTplId && cleanTplId && entTplId.toLowerCase() === cleanTplId && e.linkDuration === "1_year") {
          return true;
        }
        return false;
      });

      if (matchedEntry) return true;
      return Boolean(ent.hasYearlyLinkEntitlement && (!cleanTplId || activeList.length === 0));
    },

    hasCustomLinkAccess(slug = null, templateId = null) {
      const ent = this.getCurrentEntitlement();
      if (!ent) return false;
      if (ent.hasVipPass || ent.isPremium || ent.planId === "premium") return true;
      if (this.hasYearlyLinkAccess(slug, templateId)) return true;

      const cleanSlug = slug ? String(slug).toLowerCase().trim() : "";
      if (cleanSlug && Array.isArray(ent.unlockedSlugs) && ent.unlockedSlugs.includes(cleanSlug)) {
        return true;
      }

      const activeList = Array.isArray(ent.activeEntitlements) ? ent.activeEntitlements.filter(isEntActive) : [];
      const cleanTplId = templateId ? String(templateId).trim().toLowerCase() : "";

      const matchedEntry = activeList.some((e) => {
        const { itemType, productId, plan, templateId: entTplId, bundle } = getEntKeys(e);
        if (
          itemType === "vip_pass" ||
          productId === "vip_pass" ||
          plan === "vip" ||
          itemType === "custom_link" ||
          itemType === "personalized_link" ||
          itemType === "custom_link_1yr" ||
          itemType === "free_custom_link" ||
          productId === "personalized_link" ||
          productId === "custom_link_1yr" ||
          productId === "custom_link_only" ||
          plan === "custom_link" ||
          plan === "custom_link_1yr" ||
          itemType === "free_combo" ||
          itemType === "free_template_combo" ||
          productId === "free_template_combo" ||
          productId === "combo_99" ||
          plan === "free_combo"
        ) {
          return true;
        }
        if (bundle && (bundle.linkMode === "custom" || bundle.linkMode === "1yr")) {
          return !cleanTplId || !bundle.templateId || bundle.templateId.toLowerCase() === cleanTplId;
        }
        if (
          itemType === "premium_combo" ||
          itemType === "premium_template_combo" ||
          productId === "premium_template_combo" ||
          productId.startsWith("premium_combo:") ||
          plan === "premium_combo" ||
          itemType === "premium_link" ||
          itemType === "premium_template_custom_link" ||
          productId === "premium_template_custom_link" ||
          productId.startsWith("premium_link:") ||
          plan === "premium_custom_link"
        ) {
          return !cleanTplId || !entTplId || entTplId.toLowerCase() === cleanTplId || entTplId === "single_template";
        }
        return false;
      });

      if (matchedEntry) return true;
      return Boolean(ent.hasCustomLinkEntitlement && (!cleanTplId || activeList.length === 0));
    },

    hasHdPhotosAccess(templateId = null) {
      const ent = this.getCurrentEntitlement();
      if (!ent) return false;
      if (ent.hasVipPass || ent.isPremium || ent.planId === "premium") return true;

      const activeList = Array.isArray(ent.activeEntitlements) ? ent.activeEntitlements.filter(isEntActive) : [];
      const cleanTplId = templateId ? String(templateId).trim().toLowerCase() : "";

      const matchedEntry = activeList.some((e) => {
        const { itemType, productId, plan, templateId: entTplId, bundle } = getEntKeys(e);
        if (
          itemType === "vip_pass" ||
          productId === "vip_pass" ||
          plan === "vip" ||
          itemType === "hd_photos" ||
          itemType === "hd_style" ||
          itemType === "hd_image_style_pack" ||
          productId === "hd_photos" ||
          productId === "hd_image_style_pack" ||
          plan === "hd_photos" ||
          plan === "hd_style" ||
          itemType === "free_combo" ||
          itemType === "free_template_combo" ||
          productId === "free_template_combo" ||
          productId === "combo_99" ||
          plan === "free_combo"
        ) {
          return true;
        }
        if (bundle && bundle.hasHdPhotos) {
          return !cleanTplId || !bundle.templateId || bundle.templateId.toLowerCase() === cleanTplId;
        }
        if (
          itemType === "premium_combo" ||
          itemType === "premium_template_combo" ||
          productId === "premium_template_combo" ||
          productId.startsWith("premium_combo:") ||
          plan === "premium_combo" ||
          itemType === "premium_hd" ||
          itemType === "premium_template_hd_style" ||
          productId === "premium_template_hd_style" ||
          productId.startsWith("premium_hd:") ||
          plan === "premium_hd_style"
        ) {
          return !cleanTplId || !entTplId || entTplId.toLowerCase() === cleanTplId || entTplId === "single_template";
        }
        return false;
      });

      if (matchedEntry) return true;
      return Boolean((ent.hasHdPhotosEntitlement || ent.hasHdStyleEntitlement) && (!cleanTplId || activeList.length === 0));
    },

    hasHdStyleAccess(templateId = null) {
      return this.hasHdPhotosAccess(templateId);
    },

    hasEntitlement(entitlementKey, context = {}) {
      if (!entitlementKey) return true;
      const ent = this.getCurrentEntitlement();
      if (!ent) return false;
      if (ent.hasVipPass || ent.isPremium || ent.planId === "premium") return true;
      if (entitlementKey === "premium_templates" && context && context.templateId) {
        return this.hasTemplateEntitlement(context.templateId);
      }
      if (entitlementKey === "yearly_custom_link") {
        return this.hasYearlyLinkAccess(context && context.slug, context && context.templateId);
      }
      if (entitlementKey === "custom_link") {
        return this.hasCustomLinkAccess(context && context.slug, context && context.templateId);
      }
      if (entitlementKey === "hd_photos" || entitlementKey === "advanced_themes" || entitlementKey === "unlimited_photos") {
        return this.hasHdPhotosAccess(context && context.templateId);
      }
      return Boolean(ent.features && ent.features.includes(entitlementKey));
    },

    getPlan() {
      const ent = this.getCurrentEntitlement();
      const planId = (ent && ent.planId) || "free";
      return (window2.WishPlanService && window2.WishPlanService.getPlan(planId)) || null;
    },

    async refresh() {
      const userId = getActiveUserId();
      try {
        const res = await fetch("/api/entitlements/status", { credentials: "include" });
        const data = await res.json();
        if (data && data.success) {
          const hasVipPass = Boolean(data.hasVipPass ?? data.isPremium);
          const hasYearlyLinkEntitlement = Boolean(data.hasYearlyLinkEntitlement || hasVipPass);
          const hasCustomLinkEntitlement = Boolean(data.hasCustomLinkEntitlement || hasYearlyLinkEntitlement || hasVipPass);
          const hasHdPhotosEntitlement = Boolean(data.hasHdPhotosEntitlement || data.hasHdStyleEntitlement || hasVipPass);
          const unlockedTemplates = Array.isArray(data.unlockedTemplates) ? data.unlockedTemplates : [];
          const activeEntitlements = Array.isArray(data.activeEntitlements) ? data.activeEntitlements : [];
          const unlockedSlugs = activeEntitlements
            .map((e) => e && (e.requestedSlug || e.requested_slug))
            .filter(Boolean)
            .map((s) => String(s).toLowerCase().trim());

          const record = createDefaultEntitlement(userId, hasVipPass ? "premium" : "free", "server_authoritative");
          record.isPremium = hasVipPass;
          record.hasVipPass = hasVipPass;
          record.hasCustomLinkEntitlement = hasCustomLinkEntitlement;
          record.hasYearlyLinkEntitlement = hasYearlyLinkEntitlement;
          record.hasHdPhotosEntitlement = hasHdPhotosEntitlement;
          record.hasHdStyleEntitlement = hasHdPhotosEntitlement;
          record.unlockedTemplates = unlockedTemplates;
          record.unlockedSlugs = unlockedSlugs;
          record.activeEntitlements = activeEntitlements;

          const extraFeatures = new Set(record.features || []);
          if (hasCustomLinkEntitlement) extraFeatures.add("custom_link");
          if (hasYearlyLinkEntitlement) {
            extraFeatures.add("yearly_custom_link");
            extraFeatures.add("keep_memory_forever");
          }
          if (hasHdPhotosEntitlement) {
            extraFeatures.add("hd_photos");
            extraFeatures.add("advanced_themes");
            extraFeatures.add("unlimited_photos");
            extraFeatures.add("remove_watermark");
          }
          if (unlockedTemplates.length > 0) extraFeatures.add("unlocked_template");
          record.features = Array.from(extraFeatures);

          saveEntitlementForUser(userId, record);
          cachedEntitlement = record;
          cachedUserId = userId;
          notifyEntitlementChange();
          return record;
        }
      } catch (err) {
        console.warn("[WishEntitlement] Could not sync with server:", err);
      }
      return this.getCurrentEntitlement();
    },

    setDevelopmentPlan() {
      console.warn("[WishEntitlement] Client-side entitlement elevation is disabled. Entitlements are strictly server-authoritative.");
      return this.refresh();
    },

    getWishPlan(wish) {
      return wish &&
        (wish.tier === "vip" ||
          wish.tier === "premium" ||
          wish.isPremium ||
          (wish.payment && (wish.payment.status === "Completed" || wish.payment.status === "PAID")) ||
          (wish.customData && (wish.customData.tier === "vip" || wish.customData.tier === "premium" || wish.customData.isPremium)) ||
          (wish.price && Number(wish.price) > 0 && wish.payment && (wish.payment.status === "Completed" || wish.payment.status === "PAID")))
        ? "premium"
        : "free";
    },

    onEntitlementChange(callback) {
      if (typeof callback === "function") {
        listeners.add(callback);
        return () => listeners.delete(callback);
      }
      return () => {};
    }
  };

  if (window2.WishAuth && typeof window2.WishAuth.onAuthStateChange === "function") {
    window2.WishAuth.onAuthStateChange((user) => {
      const userId = user ? user.id : "usr_guest";
      loadEntitlementForUser(userId);
      if (user && user.id) {
        WishEntitlement.refresh();
      } else {
        notifyEntitlementChange();
      }
    });
  }

  loadEntitlementForUser(getActiveUserId());
  window2.WishEntitlement = WishEntitlement;
})(typeof window !== "undefined" ? window : globalThis);
