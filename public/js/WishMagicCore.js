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
    return list.filter((t) => {
      if (filter.status && filter.status !== "all" && t.status !== filter.status) return false;
      if (filter.category && filter.category !== "all" && t.category !== filter.category) return false;
      return true;
    });
  },
  getTemplateBySlug(slug) {
    const list = this.getAllTemplatesRaw();
    return list.find((t) => t.slug === slug || t.id === slug) || null;
  },
  // --- 2. Wish Methods (with Target Date & Expiry Logic) ---
  createWish(templateSlug, formValues, targetDateStr) {
    const template = this.getTemplateBySlug(templateSlug);
    if (!template) throw new Error("Template not found: " + templateSlug);
    const publicSlug = "wm-" + Math.random().toString(36).substring(2, 8);
    const id = "wish_" + Date.now();
    if (!targetDateStr) {
      throw new Error("Target date is required");
    }
    const targetDateObj = new Date(targetDateStr);
    const activeFrom = new Date(targetDateObj);
    activeFrom.setDate(activeFrom.getDate() - 2);
    activeFrom.setHours(0, 0, 0, 0);
    const activeUntil = new Date(targetDateObj);
    activeUntil.setDate(activeUntil.getDate() + 2);
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
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const wishes = this.getAllWishesRaw();
    wishes.unshift(newWish);
    localStorage.setItem(this.DB_KEY_WISHES, JSON.stringify(wishes));
    this.dispatch("wish_created", { wish: newWish });
    return newWish;
  },
  getWishBySlug(slug) {
    const wishes = this.getAllWishesRaw();
    return wishes.find((w) => w.public_slug === slug || w.id === slug) || null;
  },
  getWishStatus(wish) {
    if (!wish) return "not_found";
    if (wish.status !== "active") return wish.status;
    const now = /* @__PURE__ */ new Date();
    const activeFrom = new Date(wish.active_from);
    const activeUntil = new Date(wish.active_until);
    if (now < activeFrom) return "too_early";
    if (now > activeUntil) return "expired";
    return "active";
  },
  confirmWishPayment(wishId, txnId) {
    const wishes = this.getAllWishesRaw();
    const wish = wishes.find((w) => w.id === wishId || w.public_slug === wishId);
    if (wish) {
      wish.payment_status = "paid";
      wish.payment_transaction_id = txnId;
      wish.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      localStorage.setItem(this.DB_KEY_WISHES, JSON.stringify(wishes));
      this.dispatch("wish_paid", { wish });
      return wish;
    }
    return null;
  },
  // --- 3. Dynamic Variable Hydration Engine ---
  hydrateTemplateVariables(textOrDom, customizationData) {
    if (typeof textOrDom === "string") {
      let result = textOrDom;
      for (const [key, val] of Object.entries(customizationData)) {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
        result = result.replace(regex, val !== void 0 && val !== null ? String(val) : "");
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
      url += "?" + qs;
    }
    window.location.href = url;
  }
};
(function() {
  "use strict";
  const CANONICAL_RELATION_LABELS = {
    rel_partner: { slug: "partner", label: "Partner", icon: "\u{1F491}" },
    partner: { slug: "partner", label: "Partner", icon: "\u{1F491}" },
    rel_boyfriend: { slug: "boyfriend", label: "Boyfriend", icon: "\u{1F499}" },
    boyfriend: { slug: "boyfriend", label: "Boyfriend", icon: "\u{1F499}" },
    rel_girlfriend: { slug: "girlfriend", label: "Girlfriend", icon: "\u{1F496}" },
    girlfriend: { slug: "girlfriend", label: "Girlfriend", icon: "\u{1F496}" },
    rel_husband: { slug: "husband", label: "Husband", icon: "\u{1F48D}" },
    husband: { slug: "husband", label: "Husband", icon: "\u{1F48D}" },
    rel_wife: { slug: "wife", label: "Wife", icon: "\u{1F470}" },
    wife: { slug: "wife", label: "Wife", icon: "\u{1F470}" },
    rel_best_friend: { slug: "best_friend", label: "Best Friend", icon: "\u{1F31F}" },
    best_friend: { slug: "best_friend", label: "Best Friend", icon: "\u{1F31F}" },
    "best-friend": { slug: "best_friend", label: "Best Friend", icon: "\u{1F31F}" },
    bestfriend: { slug: "best_friend", label: "Best Friend", icon: "\u{1F31F}" },
    rel_friend: { slug: "friend", label: "Friend", icon: "\u{1F91D}" },
    friend: { slug: "friend", label: "Friend", icon: "\u{1F91D}" },
    rel_brother: { slug: "brother", label: "Brother", icon: "\u{1F6E1}\uFE0F" },
    brother: { slug: "brother", label: "Brother", icon: "\u{1F6E1}\uFE0F" },
    rel_sister: { slug: "sister", label: "Sister", icon: "\u{1F338}" },
    sister: { slug: "sister", label: "Sister", icon: "\u{1F338}" },
    rel_mother: { slug: "mother", label: "Mother", icon: "\u{1F337}" },
    mother: { slug: "mother", label: "Mother", icon: "\u{1F337}" },
    rel_father: { slug: "father", label: "Father", icon: "\u{1F451}" },
    father: { slug: "father", label: "Father", icon: "\u{1F451}" },
    rel_parents: { slug: "parents", label: "Parents", icon: "\u{1F3E1}" },
    parents: { slug: "parents", label: "Parents", icon: "\u{1F3E1}" },
    rel_family: { slug: "family", label: "Family", icon: "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}" },
    family: { slug: "family", label: "Family", icon: "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}" },
    rel_kids: { slug: "kids", label: "Kids", icon: "\u{1F388}" },
    kids: { slug: "kids", label: "Kids", icon: "\u{1F388}" },
    rel_colleague: { slug: "colleague", label: "Colleague", icon: "\u{1F4BC}" },
    colleague: { slug: "colleague", label: "Colleague", icon: "\u{1F4BC}" },
    rel_crush: { slug: "crush", label: "Crush", icon: "\u{1F498}" },
    crush: { slug: "crush", label: "Crush", icon: "\u{1F498}" },
    rel_fiance: { slug: "fiance", label: "Fianc\xE9", icon: "\u{1F48E}" },
    fiance: { slug: "fiance", label: "Fianc\xE9", icon: "\u{1F48E}" },
    rel_fiancee: { slug: "fiancee", label: "Fianc\xE9e", icon: "\u{1F338}" },
    fiancee: { slug: "fiancee", label: "Fianc\xE9e", icon: "\u{1F338}" },
    rel_life_partner: { slug: "life_partner", label: "Life Partner", icon: "\u{1FA90}" },
    life_partner: { slug: "life_partner", label: "Life Partner", icon: "\u{1FA90}" },
    "life-partner": { slug: "life_partner", label: "Life Partner", icon: "\u{1FA90}" },
    rel_teacher: { slug: "teacher", label: "Teacher / Mentor", icon: "\u{1F393}" },
    teacher: { slug: "teacher", label: "Teacher / Mentor", icon: "\u{1F393}" }
  };
  function escapeHtmlSafe(str) {
    return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function normalizeRelationSlug(relInput) {
    const raw = String(relInput || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    if (!raw || raw === "all") return "";
    if (CANONICAL_RELATION_LABELS[raw]) return CANONICAL_RELATION_LABELS[raw].slug;
    const stripped = raw.replace(/^rel_/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (CANONICAL_RELATION_LABELS[stripped]) return CANONICAL_RELATION_LABELS[stripped].slug;
    return stripped;
  }
  function getRelationMeta(relInput, customLabel) {
    const slug = normalizeRelationSlug(relInput);
    const known = CANONICAL_RELATION_LABELS[slug] || CANONICAL_RELATION_LABELS["rel_" + slug];
    const fallbackLabel = slug ? slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Special One";
    return {
      slug: slug || "friend",
      id: "rel_" + (slug || "friend"),
      label: customLabel && String(customLabel).trim() ? String(customLabel).trim() : known ? known.label : fallbackLabel,
      icon: known ? known.icon : "\u2728"
    };
  }
  function getAvailablePublishedVariants(family) {
    if (!family || typeof family !== "object") return [];
    const rawList = Array.isArray(family.availableVariants) && family.availableVariants.length > 0 ? family.availableVariants : Array.isArray(family.variants) && family.variants.length > 0 ? family.variants : Array.isArray(family.availableRelations) && family.availableRelations.length > 0 ? family.availableRelations : [];
    const allDisabledBug = rawList.length > 0 && rawList.every((v) => v && (v.enabled === false || v.enabled === 0 || String(v.status || "").toLowerCase() === "disabled"));
    let allowedRelSlugs = null;
    const rawEnabledList = Array.isArray(family.enabledVariants) && family.enabledVariants.length > 0 ? family.enabledVariants : Array.isArray(family.enabled_variants_json) ? family.enabled_variants_json : null;
    if (Array.isArray(rawEnabledList) && rawEnabledList.length > 0) {
      allowedRelSlugs = new Set(rawEnabledList.map((r) => normalizeRelationSlug(r)).filter(Boolean));
    } else if (!Array.isArray(family.availableVariants) && Array.isArray(family.relationships) && family.relationships.length > 0) {
      const normRels = family.relationships.map((r) => normalizeRelationSlug(r)).filter(Boolean);
      if (normRels.length > 0) allowedRelSlugs = new Set(normRels);
    }
    const seenRels = /* @__PURE__ */ new Set();
    const seenIds = /* @__PURE__ */ new Set();
    const valid = [];
    for (let i = 0; i < rawList.length; i++) {
      const v = rawList[i];
      if (!v || typeof v !== "object") continue;
      const status = String(v.status || "published").toLowerCase();
      if (!allDisabledBug) {
        if (status !== "published" && status !== "active") continue;
        if (v.enabled === false || v.enabled === 0) continue;
      }
      const relRaw = v.relationshipSlug || v.relationship || v.relationship_slug || v.slug || v.relationship_id || v.relationshipId || "";
      const relMeta = getRelationMeta(relRaw, v.relationshipLabel || v.relationship_label || v.label || v.name);
      if (!relMeta.slug) continue;
      if (allowedRelSlugs && !allowedRelSlugs.has(relMeta.slug)) continue;
      const varId = String(v.id || v.variantId || v.variant_id || v.slug || v.variantSlug || v.variant_slug || `trv_${family.id || "tpl"}_${relMeta.slug}`).trim();
      const varSlug = String(v.slug || v.variantSlug || v.variant_slug || relMeta.slug).trim();
      const declaredId = String(v.declaredId || v.declaredVariantId || (!varId.startsWith("trv_") ? varId : "") || varSlug || relMeta.slug).trim();
      if (seenIds.has(varId) || seenRels.has(relMeta.slug)) continue;
      seenIds.add(varId);
      seenRels.add(relMeta.slug);
      valid.push({
        id: varId,
        declaredId,
        declaredVariantId: declaredId,
        slug: varSlug,
        templateId: family.id || v.templateId || v.template_id,
        name: String(v.name || v.displayName || v.variant_name || `${family.name || "Template"} \u2014 ${relMeta.label}`).trim(),
        label: relMeta.label,
        relationshipId: relMeta.id,
        relationshipSlug: relMeta.slug,
        relationshipLabel: relMeta.label,
        icon: v.icon || relMeta.icon,
        description: String(v.description || "").trim(),
        thumbnail: String(v.thumbnail || v.previewUrl || family.previewUrl || family.thumbnail || "").trim(),
        entryFile: String(v.entryFile || v.entry_file || family.entryFile || "index.html").trim(),
        theme: v.theme || v.palette || null,
        palette: v.palette || v.theme || null,
        messages: v.messages || {},
        fields: Array.isArray(v.fields) ? v.fields : null,
        sections: Array.isArray(v.sections) ? v.sections : null,
        actions: Array.isArray(v.actions) ? v.actions : null,
        assets: v.assets || {},
        isDefault: Boolean(v.isDefault || v.is_default),
        order: Number.isFinite(Number(v.order ?? v.sortOrder ?? v.sort_order)) ? Number(v.order ?? v.sortOrder ?? v.sort_order) : i + 1
      });
    }
    valid.sort((a, b) => a.order - b.order || a.relationshipLabel.localeCompare(b.relationshipLabel));
    return valid;
  }
  function resolveVariantForRelation(family, relOrVariantInput) {
    if (!family || !relOrVariantInput) return null;
    const rawTarget = String(relOrVariantInput).trim().toLowerCase();
    if (!rawTarget || rawTarget === "all") return null;
    const strippedTarget = rawTarget.replace(/^(var|trv|utpvar)_[^_]+_/, "");
    const targetSlug = normalizeRelationSlug(strippedTarget) || normalizeRelationSlug(rawTarget);
    const variants = getAvailablePublishedVariants(family);
    return variants.find((v) => {
      const vId = String(v.id || "").toLowerCase();
      const vDeclaredId = String(v.declaredId || v.declaredVariantId || "").toLowerCase();
      const vSlug = String(v.slug || "").toLowerCase();
      const vSlugNorm = normalizeRelationSlug(vSlug);
      const vRelSlug = String(v.relationshipSlug || "").toLowerCase();
      const vRelId = String(v.relationshipId || "").toLowerCase();
      const vLabel = String(v.relationshipLabel || v.label || "").toLowerCase();
      return vId === rawTarget || vDeclaredId && vDeclaredId === rawTarget || vSlug === rawTarget || vSlugNorm === targetSlug || vRelSlug === targetSlug || vRelId === rawTarget || vRelId === "rel_" + targetSlug || vLabel === rawTarget || vLabel === strippedTarget.replace(/_/g, " ");
    }) || null;
  }
  function isVariantFamily(family) {
    if (!family || typeof family !== "object") return false;
    const avail = getAvailablePublishedVariants(family);
    return avail.length > 0;
  }
  let _activeExplicitRelationFilter = "";
  try {
    const params = new URLSearchParams(window.location.search);
    const urlRel = params.get("rel") || params.get("relationship") || "";
    if (urlRel && urlRel !== "all") {
      _activeExplicitRelationFilter = normalizeRelationSlug(urlRel);
    }
  } catch (_) {
  }
  function getActiveRelationFilter() {
    return _activeExplicitRelationFilter || "";
  }
  function setActiveRelationFilter(relInput) {
    const slug = normalizeRelationSlug(relInput);
    _activeExplicitRelationFilter = slug;
    try {
      const url = new URL(window.location.href);
      if (slug) {
        url.searchParams.set("relationship", slug);
      } else {
        url.searchParams.delete("relationship");
        url.searchParams.delete("rel");
      }
      window.history.replaceState({}, "", url.toString());
    } catch (_) {
    }
    return _activeExplicitRelationFilter;
  }
  function renderCardRelationTagsHtml(family, options = {}) {
    return "";
  }
  function buildActionDestinationUrl(family, action, variant) {
    const tplId = encodeURIComponent(family.id || family.slug || "");
    const isCustomize = action === "customize" || action === "create";
    const basePath = isCustomize ? "/customize.html" : "/template-preview.html";
    const campId = family && family.festivalCampaign && family.festivalCampaign.campaignId ? `&campaign=${encodeURIComponent(family.festivalCampaign.campaignId)}` : "";
    if (!variant) {
      return `${basePath}?template=${tplId}${campId}`;
    }
    const varParam = encodeURIComponent(variant.id || variant.slug || "");
    const relParam = encodeURIComponent(variant.relationshipSlug || "");
    return `${basePath}?template=${tplId}&variant=${varParam}&rel=${relParam}${campId}`;
  }
  function showUnavailableVariantNotice(family, requestedRelation) {
    const existing = document.getElementById("wm-relation-selector-overlay");
    if (existing) existing.remove();
    const relMeta = getRelationMeta(requestedRelation);
    const tplName = family && (family.name || family.title) || "This template";
    const avail = getAvailablePublishedVariants(family);
    const availLabels = avail.map((v) => v.relationshipLabel).join(", ");
    const overlay = document.createElement("div");
    overlay.id = "wm-relation-selector-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Relation Unavailable");
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.5);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;";
    overlay.innerHTML = `
      <div style="width:100%;max-width:440px;background:#ffffff;border:1px solid #fecdd3;border-radius:20px;padding:24px;color:#0f172a;box-shadow:0 20px 50px rgba(15,23,42,0.16);text-align:center;font-family:'Plus Jakarta Sans',sans-serif;">
        <div style="width:52px;height:52px;border-radius:50%;background:#fff1f2;border:1px solid #fecdd3;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:1.5rem;">\u26A0\uFE0F</div>
        <h3 style="margin:0 0 8px;font-size:1.15rem;font-weight:800;color:#0f172a;">Relation Not Available</h3>
        <p style="margin:0 0 14px;font-size:0.88rem;color:#475569;line-height:1.55;">
          <strong>${escapeHtmlSafe(tplName)}</strong> is not available for <strong>${escapeHtmlSafe(relMeta.label)}</strong>.
        </p>
        ${availLabels ? `<p style="margin:0 0 18px;font-size:0.8rem;color:#334155;background:#f8fafc;padding:10px 12px;border-radius:10px;border:1px solid #e2e8f0;">Available for: <strong>${escapeHtmlSafe(availLabels)}</strong></p>` : ""}
        <button type="button" id="wm-rel-unavail-close" style="padding:10px 22px;border-radius:999px;border:none;background:linear-gradient(135deg,#ec4899,#7c3aed);color:#fff;font-weight:700;font-size:0.88rem;cursor:pointer;">Close</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const closeBtn = overlay.querySelector("#wm-rel-unavail-close");
    if (closeBtn) {
      closeBtn.focus();
      closeBtn.addEventListener("click", () => overlay.remove());
    }
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }
  function showRelationSelectionModal(family, variants, action, context = {}) {
    const existing = document.getElementById("wm-relation-selector-overlay");
    if (existing) existing.remove();
    const isCustomize = action === "customize" || action === "create";
    const actionTitle = isCustomize ? "Select Relation to Customize" : "Select Relation to Preview";
    const actionSubtitle = isCustomize ? `Choose who this wish is for to open ${escapeHtmlSafe(family.name || "the template")} customizer.` : `Choose a relation to preview ${escapeHtmlSafe(family.name || "this template")}.`;
    const actionBadgeText = isCustomize ? "Customize" : "Preview";
    const overlay = document.createElement("div");
    overlay.id = "wm-relation-selector-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "wm-rel-modal-title");
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.5);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;animation:wmFadeIn 0.18s ease-out;";
    const cardsHtml = variants.map((v, idx) => {
      const thumbHtml = v.thumbnail ? `<img src="${escapeHtmlSafe(v.thumbnail)}" data-wm-tpl-id="${escapeHtmlSafe(family.id || family.slug || "")}" alt="${escapeHtmlSafe(v.relationshipLabel)}" style="width:44px;height:44px;border-radius:12px;object-fit:cover;border:1px solid #e2e8f0;flex-shrink:0;" onerror="if(!this.dataset.wmImgHealed){this.dataset.wmImgHealed='1';this.src='/api/media/safe-img?u='+encodeURIComponent(this.src)+'&tpl=${escapeHtmlSafe(encodeURIComponent(family.id || family.slug || ""))}';}else{this.style.display='none';}" />` : `<div style="width:44px;height:44px;border-radius:12px;background:#f3e8ff;border:1px solid #e9d5ff;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">${escapeHtmlSafe(v.icon || "\u2728")}</div>`;
      const descHtml = v.description ? `<span style="display:block;font-size:0.74rem;color:#64748b;margin-top:2px;line-height:1.35;">${escapeHtmlSafe(v.description)}</span>` : `<span style="display:block;font-size:0.73rem;color:#64748b;margin-top:2px;">Open ${escapeHtmlSafe(v.relationshipLabel)} version</span>`;
      const previewHref = buildActionDestinationUrl(family, "preview", v);
      const useDirectNewTabLink = !isCustomize && typeof context.onSelectVariant !== "function";
      if (useDirectNewTabLink) {
        return `
          <a href="${escapeHtmlSafe(previewHref)}"
             target="_blank"
             rel="noopener"
             class="wm-relation-option-btn"
             data-variant-id="${escapeHtmlSafe(v.id)}"
             data-relation-slug="${escapeHtmlSafe(v.relationshipSlug)}"
             data-option-index="${idx}"
             style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;color:#0f172a;text-align:left;cursor:pointer;transition:all 0.16s ease;text-decoration:none;">
            <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1;">
              ${thumbHtml}
              <div style="min-width:0;flex:1;">
                <div style="font-size:0.95rem;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                  <span>${escapeHtmlSafe(v.relationshipLabel)}</span>
                  ${v.isDefault ? '<span style="font-size:0.65rem;padding:2px 7px;border-radius:999px;background:#fce7f3;color:#be185d;border:1px solid #f9a8d4;font-weight:700;">Default</span>' : ""}
                </div>
                ${descHtml}
              </div>
            </div>
            <span style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:999px;background:linear-gradient(135deg,#ec4899,#7c3aed);color:#fff;font-size:0.75rem;font-weight:700;flex-shrink:0;">
              Preview \u2197
            </span>
          </a>
        `;
      }
      return `
        <button type="button"
                class="wm-relation-option-btn"
                data-variant-id="${escapeHtmlSafe(v.id)}"
                data-relation-slug="${escapeHtmlSafe(v.relationshipSlug)}"
                data-option-index="${idx}"
                style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;color:#0f172a;text-align:left;cursor:pointer;transition:all 0.16s ease;">
          <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1;">
            ${thumbHtml}
            <div style="min-width:0;flex:1;">
              <div style="font-size:0.95rem;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span>${escapeHtmlSafe(v.relationshipLabel)}</span>
                ${v.isDefault ? '<span style="font-size:0.65rem;padding:2px 7px;border-radius:999px;background:#fce7f3;color:#be185d;border:1px solid #f9a8d4;font-weight:700;">Default</span>' : ""}
              </div>
              ${descHtml}
            </div>
          </div>
          <span style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:999px;background:linear-gradient(135deg,#ec4899,#7c3aed);color:#fff;font-size:0.75rem;font-weight:700;flex-shrink:0;">
            ${isCustomize ? "Customize \u2192" : "Preview \u2192"}
          </span>
        </button>
      `;
    }).join("");
    overlay.innerHTML = `
      <div class="wm-relation-modal-card" style="width:100%;max-width:480px;max-height:88vh;display:flex;flex-direction:column;background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;padding:20px;color:#0f172a;box-shadow:0 20px 50px rgba(15,23,42,0.16);font-family:'Plus Jakarta Sans',sans-serif;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;">
          <div>
            <span style="display:inline-block;font-size:0.68rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;padding:3px 10px;border-radius:999px;background:#f3e8ff;color:#6b21a8;border:1px solid #e9d5ff;margin-bottom:6px;">${actionBadgeText}</span>
            <h3 id="wm-rel-modal-title" style="margin:0;font-size:1.15rem;font-weight:800;color:#0f172a;">${actionTitle}</h3>
          </div>
          <button type="button" id="wm-rel-modal-close" aria-label="Close relation selector" style="width:34px;height:34px;border-radius:50%;border:1px solid #e2e8f0;background:#f8fafc;color:#475569;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">\u2715</button>
        </div>
        <p style="margin:0 0 14px;font-size:0.84rem;color:#475569;line-height:1.45;">${actionSubtitle}</p>
        <div class="wm-relation-options-list" style="display:flex;flex-direction:column;gap:8px;overflow-y:auto;padding-right:4px;max-height:56vh;">
          ${cardsHtml}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const closeModal = () => {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      if (typeof context.onCancel === "function") {
        context.onCancel();
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const closeBtn = overlay.querySelector("#wm-rel-modal-close");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
    const optionBtns = overlay.querySelectorAll(".wm-relation-option-btn");
    optionBtns.forEach((btn) => {
      btn.addEventListener("mouseenter", () => {
        btn.style.background = "#faf5ff";
        btn.style.borderColor = "#c084fc";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "#f8fafc";
        btn.style.borderColor = "#e2e8f0";
      });
      btn.addEventListener("click", () => {
        const varId = btn.getAttribute("data-variant-id");
        const selected = variants.find((v) => v.id === varId) || variants[0];
        document.removeEventListener("keydown", onKeyDown);
        if (btn.tagName.toLowerCase() === "a") {
          setTimeout(() => overlay.remove(), 60);
          return;
        }
        overlay.remove();
        continueOriginalAction(family, action, selected, context);
      });
    });
    if (optionBtns[0]) {
      optionBtns[0].focus();
    }
  }
  function openPreviewInNewTabOrNavigate(targetUrl) {
    try {
      const win = window.open(targetUrl, "_blank", "noopener");
      if (win) return;
    } catch (_) {
    }
    window.location.href = targetUrl;
  }
  function continueOriginalAction(family, action, variant, context = {}) {
    if (typeof context.onSelectVariant === "function") {
      context.onSelectVariant(variant, family, action);
      return;
    }
    const isCustomize = action === "customize" || action === "create";
    const targetUrl = buildActionDestinationUrl(family, action, variant);
    if (!isCustomize) {
      openPreviewInNewTabOrNavigate(targetUrl);
      return;
    }
    if (window.WishAuth && typeof window.WishAuth.requireGoogleAuthForCustomize === "function") {
      window.WishAuth.requireGoogleAuthForCustomize(targetUrl);
      return;
    }
    window.location.href = targetUrl;
  }
  function continueLegacyAction(family, action, context = {}) {
    if (typeof context.onSelectLegacy === "function") {
      context.onSelectLegacy(family, action);
      return;
    }
    const isCustomize = action === "customize" || action === "create";
    const targetUrl = buildActionDestinationUrl(family, action, null);
    if (!isCustomize) {
      openPreviewInNewTabOrNavigate(targetUrl);
      return;
    }
    if (window.WishAuth && typeof window.WishAuth.requireGoogleAuthForCustomize === "function") {
      window.WishAuth.requireGoogleAuthForCustomize(targetUrl);
      return;
    }
    window.location.href = targetUrl;
  }
  function handleTemplateAction(familyOrId, action = "preview", context = {}) {
    const isCustomizeAction = action === "customize" || action === "create";
    if (isCustomizeAction && window.WishAuth && typeof window.WishAuth.isGoogleLoggedIn === "function" && !window.WishAuth.isGoogleLoggedIn()) {
      window.WishAuth.requireGoogleAuthForCustomize(() => {
        handleTemplateAction(familyOrId, action, context);
      });
      return;
    }
    let family = familyOrId;
    if (typeof familyOrId === "string") {
      const map = window._wmLoadedTemplatesMap || {};
      family = map[familyOrId] || null;
      if (!family && Array.isArray(window.LIVE_TEMPLATES)) {
        family = window.LIVE_TEMPLATES.find((t) => t.id === familyOrId || t.slug === familyOrId) || null;
      }
      if (!family && Array.isArray(window.allMarketplaceTemplates)) {
        family = window.allMarketplaceTemplates.find((t) => t.id === familyOrId || t.slug === familyOrId) || null;
      }
    }
    if (!family || typeof family !== "object") {
      const fallbackId = typeof familyOrId === "string" ? familyOrId : "";
      if (fallbackId) {
        const dest = action === "customize" || action === "create" ? `/customize.html?template=${encodeURIComponent(fallbackId)}` : `/template-preview.html?template=${encodeURIComponent(fallbackId)}`;
        window.location.href = dest;
      }
      return;
    }
    const variants = getAvailablePublishedVariants(family);
    const hasDeclaredVariants = Boolean(family.hasVariants || family.has_variants || variants.length > 0);
    const explicitRelOrVariant = context.variantId || context.relation || (_activeExplicitRelationFilter || "");
    if (explicitRelOrVariant && hasDeclaredVariants) {
      const matchedVariant = resolveVariantForRelation(family, explicitRelOrVariant);
      if (!matchedVariant) {
        showUnavailableVariantNotice(family, explicitRelOrVariant);
        return;
      }
      continueOriginalAction(family, action, matchedVariant, context);
      return;
    }
    if (variants.length === 1) {
      continueOriginalAction(family, action, variants[0], context);
      return;
    }
    if (variants.length > 1) {
      showRelationSelectionModal(family, variants, action, context);
      return;
    }
    if (!hasDeclaredVariants || variants.length === 0 || !explicitRelOrVariant) {
      continueLegacyAction(family, action, context);
      return;
    }
    showUnavailableVariantNotice(family, explicitRelOrVariant);
  }
  window.WishMagicVariantFlow = {
    CANONICAL_RELATION_LABELS,
    normalizeRelationSlug,
    getRelationMeta,
    getAvailablePublishedVariants,
    resolveVariantForRelation,
    isVariantFamily,
    getActiveRelationFilter,
    setActiveRelationFilter,
    renderCardRelationTagsHtml,
    buildActionDestinationUrl,
    showUnavailableVariantNotice,
    showRelationSelectionModal,
    handleTemplateAction
  };
  window.handleTemplateAction = handleTemplateAction;
  function resolveTemplateIdForImgElement(img) {
    if (!img) return "";
    const direct = img.getAttribute("data-wm-tpl-id") || img.getAttribute("data-template-id");
    if (direct) return direct;
    try {
      const card = img.closest('[data-template-id], [onclick*="handleTemplateAction"], [onclick*="openTemplatePreview"], [onclick*="openMarketplacePreview"], .group');
      if (card) {
        const dt = card.getAttribute("data-template-id");
        if (dt) return dt;
        const htmlStr = card.outerHTML || "";
        const m = htmlStr.match(/(?:handleTemplateAction|openTemplatePreview|openMarketplacePreview)\(\s*['"]([^'"]+)['"]/) || htmlStr.match(/customize\.html\?template=([^&"'\s>]+)/);
        if (m && m[1]) return decodeURIComponent(m[1]);
      }
      const src = String(img.getAttribute("src") || img.src || "").trim();
      const map = window._wmLoadedTemplatesMap || {};
      for (const k of Object.keys(map)) {
        const t = map[k];
        if (!t) continue;
        if (t.thumbnail === src) return t.id || k;
        if (Array.isArray(t.availableVariants) && t.availableVariants.some((v) => v && v.thumbnail === src)) {
          return t.id || k;
        }
      }
    } catch (_) {
    }
    return "";
  }
  function healStorefrontImageIfUnavailable(img) {
    if (!img || img.tagName !== "IMG" || img.dataset.wmImgHealed === "1") return;
    const src = String(img.getAttribute("src") || img.src || "").trim();
    if (!src || src.startsWith("data:") || src.includes("/api/media/safe-img")) return;
    const isIbb = src.includes("ibb.co/");
    const isUnavailableBox = isIbb && img.complete && img.naturalWidth > 0 && img.naturalWidth <= 220 && img.naturalHeight > 0 && img.naturalHeight <= 220 && Math.abs(img.naturalWidth - img.naturalHeight) <= 4;
    const isBroken = img.complete && img.naturalWidth === 0 && src.length > 0;
    if (isUnavailableBox || isIbb && isBroken) {
      img.dataset.wmImgHealed = "1";
      const tplId = resolveTemplateIdForImgElement(img);
      img.src = "/api/media/safe-img?u=" + encodeURIComponent(src) + (tplId ? "&tpl=" + encodeURIComponent(tplId) : "");
    }
  }
  if (typeof document !== "undefined") {
    document.addEventListener("load", (e) => {
      if (e && e.target && e.target.tagName === "IMG") {
        healStorefrontImageIfUnavailable(e.target);
      }
    }, true);
    document.addEventListener("error", (e) => {
      const img = e && e.target;
      if (!img || img.tagName !== "IMG" || img.dataset.wmImgHealed === "1") return;
      const src = String(img.getAttribute("src") || img.src || "").trim();
      if (!src || src.startsWith("data:") || src.includes("/api/media/safe-img")) return;
      if (src.includes("ibb.co/") || src.startsWith("/api/templates/")) {
        e.stopImmediatePropagation();
        img.dataset.wmImgHealed = "1";
        const tplId = resolveTemplateIdForImgElement(img);
        img.src = "/api/media/safe-img?u=" + encodeURIComponent(src) + (tplId ? "&tpl=" + encodeURIComponent(tplId) : "");
      }
    }, true);
    const runInitialScan = () => {
      try {
        document.querySelectorAll("img").forEach(healStorefrontImageIfUnavailable);
      } catch (_) {
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", runInitialScan);
    } else {
      runInitialScan();
    }
    setTimeout(runInitialScan, 800);
    setTimeout(runInitialScan, 2200);
  }

  // --- Universal 80% Quality WebP Image Optimizer (User Photos + Admin Templates & Media) ---
  const DEFAULT_WEBP_QUALITY = 0.8;
  const DEFAULT_MAX_DIMENSION = 1920;

  function toWebpFilename(filename) {
    const clean = String(filename || "image.webp").trim() || "image.webp";
    if (/\.(svg|gif)$/i.test(clean)) return clean;
    if (/\.webp$/i.test(clean)) return clean;
    if (/\.[a-z0-9]{2,5}$/i.test(clean)) {
      return clean.replace(/\.[a-z0-9]{2,5}$/i, ".webp");
    }
    return clean + ".webp";
  }

  function isSkippedImageFormat(mimeOrName) {
    const s = String(mimeOrName || "").toLowerCase();
    return s.includes("image/svg") || s.includes("image/gif") || /\.svg(\?|$)/i.test(s) || /\.gif(\?|$)/i.test(s);
  }

  function estimateDataUrlBytes(dataUrl) {
    if (!dataUrl || typeof dataUrl !== "string") return 0;
    const commaIdx = dataUrl.indexOf(",");
    const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    return Math.floor((b64.length * 3) / 4);
  }

  function convertDataUrlToWebP(rawDataUrl, filename = "photo.jpg", options = {}) {
    return new Promise((resolve) => {
      const quality = typeof options.quality === "number" && options.quality > 0 && options.quality <= 1 ? options.quality : DEFAULT_WEBP_QUALITY;
      const maxDimension = typeof options.maxDimension === "number" && options.maxDimension > 0 ? options.maxDimension : DEFAULT_MAX_DIMENSION;
      const origName = String(filename || "photo.jpg");
      const originalBytes = estimateDataUrlBytes(rawDataUrl);

      if (!rawDataUrl || typeof rawDataUrl !== "string" || !rawDataUrl.startsWith("data:image/")) {
        return resolve({ dataUrl: rawDataUrl, filename: origName, mimeType: "application/octet-stream", converted: false, quality, originalBytes, optimizedBytes: originalBytes, width: 0, height: 0 });
      }
      if (isSkippedImageFormat(rawDataUrl.slice(0, 64)) || isSkippedImageFormat(origName)) {
        const mimeMatch = rawDataUrl.match(/^data:([^;]+);/i);
        return resolve({ dataUrl: rawDataUrl, filename: origName, mimeType: mimeMatch ? mimeMatch[1] : "image/gif", converted: false, quality, originalBytes, optimizedBytes: originalBytes, width: 0, height: 0 });
      }
      if (typeof document === "undefined" || typeof Image === "undefined") {
        return resolve({ dataUrl: rawDataUrl, filename: origName, mimeType: "image/jpeg", converted: false, quality, originalBytes, optimizedBytes: originalBytes, width: 0, height: 0 });
      }

      const img = new Image();
      img.onload = () => {
        try {
          const origW = img.naturalWidth || img.width || 0;
          const origH = img.naturalHeight || img.height || 0;
          if (!origW || !origH) {
            return resolve({ dataUrl: rawDataUrl, filename: origName, mimeType: "image/jpeg", converted: false, quality, originalBytes, optimizedBytes: originalBytes, width: 0, height: 0 });
          }

          let targetW = origW;
          let targetH = origH;
          if (maxDimension > 0 && (origW > maxDimension || origH > maxDimension)) {
            const scale = Math.min(maxDimension / origW, maxDimension / origH);
            targetW = Math.max(1, Math.round(origW * scale));
            targetH = Math.max(1, Math.round(origH * scale));
          }

          const canvas = document.createElement("canvas");
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return resolve({ dataUrl: rawDataUrl, filename: origName, mimeType: "image/jpeg", converted: false, quality, originalBytes, optimizedBytes: originalBytes, width: origW, height: origH });
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.clearRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);

          const webpDataUrl = canvas.toDataURL("image/webp", quality);
          if (webpDataUrl && webpDataUrl.startsWith("data:image/webp")) {
            const optimizedBytes = estimateDataUrlBytes(webpDataUrl);
            const webpName = toWebpFilename(origName);
            return resolve({
              dataUrl: webpDataUrl,
              filename: webpName,
              mimeType: "image/webp",
              converted: true,
              quality,
              width: targetW,
              height: targetH,
              originalWidth: origW,
              originalHeight: origH,
              originalBytes,
              optimizedBytes
            });
          }
          return resolve({ dataUrl: rawDataUrl, filename: origName, mimeType: "image/jpeg", converted: false, quality, originalBytes, optimizedBytes: originalBytes, width: origW, height: origH });
        } catch (_) {
          return resolve({ dataUrl: rawDataUrl, filename: origName, mimeType: "image/jpeg", converted: false, quality, originalBytes, optimizedBytes: originalBytes, width: 0, height: 0 });
        }
      };
      img.onerror = () => {
        resolve({ dataUrl: rawDataUrl, filename: origName, mimeType: "image/jpeg", converted: false, quality, originalBytes, optimizedBytes: originalBytes, width: 0, height: 0 });
      };
      img.src = rawDataUrl;
    });
  }

  function convertFileToWebP(file, options = {}) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("No image file provided."));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Unable to read the image file."));
      reader.onload = async (e) => {
        const rawDataUrl = e.target.result;
        const result = await convertDataUrlToWebP(rawDataUrl, file.name || "photo.jpg", options);
        result.originalSize = file.size || result.originalBytes;
        resolve(result);
      };
      reader.readAsDataURL(file);
    });
  }

  window.WishImageOptimizer = {
    DEFAULT_WEBP_QUALITY,
    DEFAULT_MAX_DIMENSION,
    toWebpFilename,
    convertDataUrlToWebP,
    convertFileToWebP
  };
})();
