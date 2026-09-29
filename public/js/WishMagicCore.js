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
    return [
      {
        id: "tpl_bday_glitter",
        slug: "glitter-birthday-bash-3d",
        name: "Glitter Birthday Bash 3D",
        description: "A magical 3D unboxing experience filled with glitter, neon balloons, and floating text.",
        category: "birthday",
        tags: ["3D", "Glitter", "Neon", "Birthday"],
        thumbnail: "https://images.unsplash.com/photo-1530103862676-de3c9de59f9e?auto=format&fit=crop&w=600&q=80",
        preview_asset_url: "", // Not used directly in this demo
        status: "published",
        pricing_type: "premium",
        price: 49,
        rating: 4.9,
        review_count: 3420,
        version: "1.0.0",
        fields: [
          {
            id: "fld_recipient_name",
            template_id: "tpl_bday_glitter",
            label: "Recipient's Name",
            variable: "recipient_name",
            type: "text",
            required: true,
            placeholder: "e.g. Kritika",
            sort_order: 1
          },
          {
            id: "fld_sender_name",
            template_id: "tpl_bday_glitter",
            label: "Your Name",
            variable: "sender_name",
            type: "text",
            required: true,
            placeholder: "e.g. Rahul",
            sort_order: 2
          },
          {
            id: "fld_message",
            template_id: "tpl_bday_glitter",
            label: "Special Message",
            variable: "message",
            type: "textarea",
            required: false,
            placeholder: "Wishing you a magical birthday...",
            sort_order: 3
          }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
       {
        id: "tpl_love_nebula",
        slug: "cosmic-love-nebula",
        name: "Cosmic Love Nebula",
        description: "A breathtaking journey through a cosmic nebula for your special someone.",
        category: "love",
        tags: ["Space", "Romantic", "Cosmic"],
        thumbnail: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80",
        preview_asset_url: "",
        status: "published",
        pricing_type: "free",
        price: 0,
        rating: 4.8,
        review_count: 1250,
        version: "1.0.0",
        fields: [
          {
            id: "fld_recipient_name_2",
            template_id: "tpl_love_nebula",
            label: "Partner's Name",
            variable: "recipient_name",
            type: "text",
            required: true,
            placeholder: "e.g. Ananya",
            sort_order: 1
          },
           {
            id: "fld_sender_name_2",
            template_id: "tpl_love_nebula",
            label: "Your Name",
            variable: "sender_name",
            type: "text",
            required: true,
            placeholder: "e.g. Vikram",
            sort_order: 2
          }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
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
