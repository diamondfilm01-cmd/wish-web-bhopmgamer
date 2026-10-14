window.WishMagicCore = {
  DB_KEY_TEMPLATES: "wishmagic_templates_v1",
  DB_KEY_WISHES: "wishmagic_wishes_v1",

  // --- Utility Methods ---
  getAllTemplatesRaw() {
    const raw = localStorage.getItem(this.DB_KEY_TEMPLATES);
    return raw ? JSON.parse(raw) : this.getSeedTemplates();
  },

  getAllWishesRaw() {
    const raw = localStorage.getItem(this.DB_KEY_WISHES);
    return raw ? JSON.parse(raw) : [];
  },

  dispatch(eventName, detail) {
    console.log(`[WishMagicCore] Event: ${eventName}`, detail);
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  },

  // --- Seed Data ---
  getSeedTemplates() {
    return [];
  },

  // --- 1. Template Methods ---
  getTemplates(filter = { status: "published" }) {
    const list = this.getAllTemplatesRaw();
    return list.filter(t => {
      if (filter.status && filter.status !== 'all' && t.status !== filter.status) return false;
      if (filter.category && filter.category !== "all" && t.category !== filter.category) return false;
      return true;
    });
  },

  getTemplateBySlug(slug) {
    const list = this.getAllTemplatesRaw();
    return list.find(t => t.slug === slug || t.id === slug) || null;
  },

  // --- 2. Wish Methods (with Target Date & Expiry Logic) ---
  createWish(templateSlug, formValues, targetDateStr) {
    const template = this.getTemplateBySlug(templateSlug);
    if (!template) throw new Error("Template not found: " + templateSlug);

    const publicSlug = "wm-" + Math.random().toString(36).substring(2, 8);
    const id = "wish_" + Date.now();

    // Process Target Date
    // targetDateStr should be YYYY-MM-DD
    if (!targetDateStr) {
        throw new Error("Target date is required");
    }
    const targetDateObj = new Date(targetDateStr);

    // Active Window: Target Date - 1 day to Target Date + 1 day
    // We set active_from to start of previous day (00:00:00)
    const activeFrom = new Date(targetDateObj);
    activeFrom.setDate(activeFrom.getDate() - 1);
    activeFrom.setHours(0, 0, 0, 0);

    // We set active_until to end of next day (23:59:59)
    const activeUntil = new Date(targetDateObj);
    activeUntil.setDate(activeUntil.getDate() + 1);
    activeUntil.setHours(23, 59, 59, 999);

    const newWish = {
      id,
      public_slug: publicSlug,
      template_id: template.id,
      template_slug: template.slug,
      template_name: template.name,
      template_version: template.version,
      customization_data: { ...formValues },
      target_date: targetDateStr,
      active_from: activeFrom.toISOString(),
      active_until: activeUntil.toISOString(),
      payment_status: template.pricing_type === "free" ? "not_required" : "pending",
      status: "active",
      views_count: 0,
      created_at: new Date().toISOString()
    };

    const wishes = this.getAllWishesRaw();
    wishes.unshift(newWish);
    localStorage.setItem(this.DB_KEY_WISHES, JSON.stringify(wishes));
    this.dispatch('wish_created', { wish: newWish });
    return newWish;
  },

  getWishBySlug(slug) {
    const wishes = this.getAllWishesRaw();
    return wishes.find(w => w.public_slug === slug || w.id === slug) || null;
  },

  getWishStatus(wish) {
      if (!wish) return 'not_found';
      if (wish.status !== 'active') return wish.status; // e.g. disabled by admin

      const now = new Date();
      const activeFrom = new Date(wish.active_from);
      const activeUntil = new Date(wish.active_until);

      if (now < activeFrom) return 'too_early';
      if (now > activeUntil) return 'expired';

      return 'active';
  },

  confirmWishPayment(wishId, txnId) {
    const wishes = this.getAllWishesRaw();
    const wish = wishes.find(w => w.id === wishId || w.public_slug === wishId);
    if (wish) {
      wish.payment_status = "paid";
      wish.payment_transaction_id = txnId;
      wish.updated_at = new Date().toISOString();
      localStorage.setItem(this.DB_KEY_WISHES, JSON.stringify(wishes));
      this.dispatch('wish_paid', { wish });
      return wish;
    }
    return null;
  },

  // --- 3. Dynamic Variable Hydration Engine ---
  hydrateTemplateVariables(textOrDom, customizationData) {
    if (typeof textOrDom === "string") {
      let result = textOrDom;
      for (const [key, val] of Object.entries(customizationData)) {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
        result = result.replace(regex, val !== undefined && val !== null ? String(val) : '');
      }
      return result;
    }
    return textOrDom;
  },

  // --- 4. Navigation ---
  navigate(routePath, params = {}) {
    console.log(`[WishMagicRouter] Navigating to: ${routePath}`, params);
    let url = routePath;
    if (Object.keys(params).length > 0) {
        const qs = new URLSearchParams(params).toString();
        url += '?' + qs;
    }
    window.location.href = url;
  }
};
