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

    // Active Window: Target Date - 2 days to Target Date + 2 days
    // We set active_from to start of 2 days prior (00:00:00)
    const activeFrom = new Date(targetDateObj);
    activeFrom.setDate(activeFrom.getDate() - 2);
    activeFrom.setHours(0, 0, 0, 0);

    // We set active_until to end of 2 days after (23:59:59)
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

/**
 * WishMagic UTP v1.1.0 Shared Relationship Variant Selection & Routing Flow
 * Implements Core Product Rules A–G across Gallery, Preview, and Customizer.
 */
(function () {
  'use strict';

  const CANONICAL_RELATION_LABELS = {
    rel_partner: { slug: 'partner', label: 'Partner', icon: '💑' },
    partner: { slug: 'partner', label: 'Partner', icon: '💑' },
    rel_boyfriend: { slug: 'boyfriend', label: 'Boyfriend', icon: '💙' },
    boyfriend: { slug: 'boyfriend', label: 'Boyfriend', icon: '💙' },
    rel_girlfriend: { slug: 'girlfriend', label: 'Girlfriend', icon: '💖' },
    girlfriend: { slug: 'girlfriend', label: 'Girlfriend', icon: '💖' },
    rel_husband: { slug: 'husband', label: 'Husband', icon: '💍' },
    husband: { slug: 'husband', label: 'Husband', icon: '💍' },
    rel_wife: { slug: 'wife', label: 'Wife', icon: '👰' },
    wife: { slug: 'wife', label: 'Wife', icon: '👰' },
    rel_best_friend: { slug: 'best_friend', label: 'Best Friend', icon: '🌟' },
    best_friend: { slug: 'best_friend', label: 'Best Friend', icon: '🌟' },
    'best-friend': { slug: 'best_friend', label: 'Best Friend', icon: '🌟' },
    bestfriend: { slug: 'best_friend', label: 'Best Friend', icon: '🌟' },
    rel_friend: { slug: 'friend', label: 'Friend', icon: '🤝' },
    friend: { slug: 'friend', label: 'Friend', icon: '🤝' },
    rel_brother: { slug: 'brother', label: 'Brother', icon: '🛡️' },
    brother: { slug: 'brother', label: 'Brother', icon: '🛡️' },
    rel_sister: { slug: 'sister', label: 'Sister', icon: '🌸' },
    sister: { slug: 'sister', label: 'Sister', icon: '🌸' },
    rel_mother: { slug: 'mother', label: 'Mother', icon: '🌷' },
    mother: { slug: 'mother', label: 'Mother', icon: '🌷' },
    rel_father: { slug: 'father', label: 'Father', icon: '👑' },
    father: { slug: 'father', label: 'Father', icon: '👑' },
    rel_parents: { slug: 'parents', label: 'Parents', icon: '🏡' },
    parents: { slug: 'parents', label: 'Parents', icon: '🏡' },
    rel_family: { slug: 'family', label: 'Family', icon: '👨‍👩‍👧‍👦' },
    family: { slug: 'family', label: 'Family', icon: '👨‍👩‍👧‍👦' },
    rel_kids: { slug: 'kids', label: 'Kids', icon: '🎈' },
    kids: { slug: 'kids', label: 'Kids', icon: '🎈' },
    rel_colleague: { slug: 'colleague', label: 'Colleague', icon: '💼' },
    colleague: { slug: 'colleague', label: 'Colleague', icon: '💼' },
    rel_crush: { slug: 'crush', label: 'Crush', icon: '💘' },
    crush: { slug: 'crush', label: 'Crush', icon: '💘' },
    rel_fiance: { slug: 'fiance', label: 'Fiancé', icon: '💎' },
    fiance: { slug: 'fiance', label: 'Fiancé', icon: '💎' },
    rel_fiancee: { slug: 'fiancee', label: 'Fiancée', icon: '🌸' },
    fiancee: { slug: 'fiancee', label: 'Fiancée', icon: '🌸' },
    rel_life_partner: { slug: 'life_partner', label: 'Life Partner', icon: '🪐' },
    life_partner: { slug: 'life_partner', label: 'Life Partner', icon: '🪐' },
    'life-partner': { slug: 'life_partner', label: 'Life Partner', icon: '🪐' },
    rel_teacher: { slug: 'teacher', label: 'Teacher / Mentor', icon: '🎓' },
    teacher: { slug: 'teacher', label: 'Teacher / Mentor', icon: '🎓' }
  };

  function escapeHtmlSafe(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeRelationSlug(relInput) {
    const raw = String(relInput || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    if (!raw || raw === 'all') return '';
    if (CANONICAL_RELATION_LABELS[raw]) return CANONICAL_RELATION_LABELS[raw].slug;
    const stripped = raw.replace(/^rel_/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (CANONICAL_RELATION_LABELS[stripped]) return CANONICAL_RELATION_LABELS[stripped].slug;
    return stripped;
  }

  function getRelationMeta(relInput, customLabel) {
    const slug = normalizeRelationSlug(relInput);
    const known = CANONICAL_RELATION_LABELS[slug] || CANONICAL_RELATION_LABELS['rel_' + slug];
    const fallbackLabel = slug ? slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Special One';
    return {
      slug: slug || 'friend',
      id: 'rel_' + (slug || 'friend'),
      label: customLabel && String(customLabel).trim() ? String(customLabel).trim() : (known ? known.label : fallbackLabel),
      icon: known ? known.icon : '✨'
    };
  }

  /**
   * Returns only valid, published, enabled variants for public users.
   * Never returns missing, draft-only, disabled, or unpublished variants.
   */
  function getAvailablePublishedVariants(family) {
    if (!family || typeof family !== 'object') return [];
    // Authoritative precedence: if availableVariants array is provided by the server, never fall back to raw variants
    const rawList = Array.isArray(family.availableVariants)
      ? family.availableVariants
      : (Array.isArray(family.variants) ? family.variants : []);

    // Build authoritative enabled relationship set if family specifies enabledVariants or relationships
    let allowedRelSlugs = null;
    const rawEnabledList = Array.isArray(family.enabledVariants) && family.enabledVariants.length > 0
      ? family.enabledVariants
      : (Array.isArray(family.enabled_variants_json) ? family.enabled_variants_json : null);
    if (Array.isArray(rawEnabledList) && rawEnabledList.length > 0) {
      allowedRelSlugs = new Set(rawEnabledList.map(r => normalizeRelationSlug(r)).filter(Boolean));
    } else if (!Array.isArray(family.availableVariants) && Array.isArray(family.relationships) && family.relationships.length > 0) {
      const normRels = family.relationships.map(r => normalizeRelationSlug(r)).filter(Boolean);
      if (normRels.length > 0) allowedRelSlugs = new Set(normRels);
    }

    const seenRels = new Set();
    const seenIds = new Set();
    const valid = [];

    for (let i = 0; i < rawList.length; i++) {
      const v = rawList[i];
      if (!v || typeof v !== 'object') continue;
      const status = String(v.status || 'published').toLowerCase();
      if (status !== 'published' && status !== 'active') continue;
      if (v.enabled === false || v.enabled === 0) continue;

      const relRaw = v.relationshipSlug || v.relationship || v.relationship_slug || v.relationship_id || v.relationshipId || '';
      const relMeta = getRelationMeta(relRaw, v.relationshipLabel || v.relationship_label || v.label);
      if (!relMeta.slug) continue;
      if (allowedRelSlugs && !allowedRelSlugs.has(relMeta.slug)) continue;

      const varId = String(v.id || v.variant_id || v.slug || v.variant_slug || `var_${family.id || 'tpl'}_${relMeta.slug}`).trim();
      const varSlug = String(v.slug || v.variant_slug || varId).trim();
      if (seenIds.has(varId) || seenRels.has(relMeta.slug)) continue;
      seenIds.add(varId);
      seenRels.add(relMeta.slug);

      valid.push({
        id: varId,
        slug: varSlug,
        templateId: family.id || v.templateId || v.template_id,
        name: String(v.name || v.variant_name || `${family.name || 'Template'} — ${relMeta.label}`).trim(),
        relationshipId: relMeta.id,
        relationshipSlug: relMeta.slug,
        relationshipLabel: relMeta.label,
        icon: relMeta.icon,
        description: String(v.description || '').trim(),
        thumbnail: String(v.thumbnail || v.previewUrl || family.previewUrl || family.thumbnail || '').trim(),
        entryFile: String(v.entryFile || v.entry_file || family.entryFile || 'index.html').trim(),
        theme: v.theme || v.palette || null,
        messages: v.messages || {},
        fields: Array.isArray(v.fields) ? v.fields : null,
        sections: Array.isArray(v.sections) ? v.sections : null,
        assets: v.assets || {},
        isDefault: Boolean(v.isDefault || v.is_default),
        order: Number.isFinite(Number(v.order ?? v.sort_order)) ? Number(v.order ?? v.sort_order) : (i + 1)
      });
    }

    valid.sort((a, b) => (a.order - b.order) || a.relationshipLabel.localeCompare(b.relationshipLabel));
    return valid;
  }

  /**
   * Resolves a specific available published variant for a relation slug/id or variant id/slug.
   */
  function resolveVariantForRelation(family, relOrVariantInput) {
    if (!family || !relOrVariantInput) return null;
    const rawTarget = String(relOrVariantInput).trim().toLowerCase();
    if (!rawTarget || rawTarget === 'all') return null;
    const targetSlug = normalizeRelationSlug(rawTarget);
    const variants = getAvailablePublishedVariants(family);

    return variants.find(v =>
      v.id.toLowerCase() === rawTarget ||
      v.slug.toLowerCase() === rawTarget ||
      v.relationshipSlug.toLowerCase() === targetSlug ||
      v.relationshipId.toLowerCase() === rawTarget ||
      v.relationshipId.toLowerCase() === 'rel_' + targetSlug ||
      v.relationshipLabel.toLowerCase() === rawTarget
    ) || null;
  }

  /**
   * Checks whether a family is a variant-enabled template family
   */
  function isVariantFamily(family) {
    if (!family || typeof family !== 'object') return false;
    if (family.hasVariants === true || family.has_variants === 1) return true;
    const avail = getAvailablePublishedVariants(family);
    return avail.length > 0;
  }

  /**
   * Active explicit relationship filter state (Rule F: only explicit relation filters or
   * clearly resolved relation context count — never generic keyword searches)
   */
  let _activeExplicitRelationFilter = '';
  try {
    const params = new URLSearchParams(window.location.search);
    const urlRel = params.get('rel') || params.get('relationship') || '';
    if (urlRel && urlRel !== 'all') {
      _activeExplicitRelationFilter = normalizeRelationSlug(urlRel);
    }
  } catch (_) {}

  function getActiveRelationFilter() {
    return _activeExplicitRelationFilter || '';
  }

  function setActiveRelationFilter(relInput) {
    const slug = normalizeRelationSlug(relInput);
    _activeExplicitRelationFilter = slug;
    try {
      const url = new URL(window.location.href);
      if (slug) {
        url.searchParams.set('relationship', slug);
      } else {
        url.searchParams.delete('relationship');
        url.searchParams.delete('rel');
      }
      window.history.replaceState({}, '', url.toString());
    } catch (_) {}
    return _activeExplicitRelationFilter;
  }

  /**
   * Renders public relation tags for a gallery card (Rule B).
   * Displays only valid, published, available variants.
   * If a template has no variants, returns empty string to preserve existing legacy design.
   */
  function renderCardRelationTagsHtml(family, options = {}) {
    const variants = getAvailablePublishedVariants(family);
    if (!variants.length) return '';

    const activeRel = normalizeRelationSlug(options.activeRelation || _activeExplicitRelationFilter);
    const maxVisible = options.maxVisible || 6;
    const shown = variants.slice(0, maxVisible);
    const overflowCount = Math.max(0, variants.length - shown.length);

    const pills = shown.map(v => {
      const isHighlighted = activeRel && v.relationshipSlug === activeRel;
      const pillStyle = isHighlighted
        ? 'display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;font-size:0.7rem;font-weight:700;background:rgba(236,72,153,0.22);color:#fbcfe8;border:1px solid rgba(236,72,153,0.55);line-height:1.2;white-space:nowrap;'
        : 'display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;font-size:0.7rem;font-weight:600;background:rgba(255,255,255,0.07);color:#cbd5e1;border:1px solid rgba(255,255,255,0.12);line-height:1.2;white-space:nowrap;';
      return `<span class="wm-relation-tag" data-relation-slug="${escapeHtmlSafe(v.relationshipSlug)}" style="${pillStyle}">${escapeHtmlSafe(v.relationshipLabel)}</span>`;
    }).join('');

    const moreBadge = overflowCount > 0
      ? `<span class="wm-relation-tag-more" style="display:inline-flex;align-items:center;padding:3px 7px;border-radius:999px;font-size:0.68rem;font-weight:700;background:rgba(139,92,246,0.16);color:#c4b5fd;border:1px solid rgba(139,92,246,0.3);line-height:1.2;">+${overflowCount} more</span>`
      : '';

    return `<div class="wm-card-relation-tags" aria-label="Supported relationships" style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;margin-bottom:4px;">${pills}${moreBadge}</div>`;
  }

  /**
   * Builds a destination URL for Preview or Customize preserving template family + selected variant + relation
   */
  function buildActionDestinationUrl(family, action, variant) {
    const tplId = encodeURIComponent(family.id || family.slug || '');
    const isCustomize = action === 'customize' || action === 'create';
    const basePath = isCustomize ? '/customize.html' : '/template-preview.html';
    const campId = family && family.festivalCampaign && family.festivalCampaign.campaignId
      ? `&campaign=${encodeURIComponent(family.festivalCampaign.campaignId)}`
      : '';
    if (!variant) {
      return `${basePath}?template=${tplId}${campId}`;
    }
    const varParam = encodeURIComponent(variant.id || variant.slug || '');
    const relParam = encodeURIComponent(variant.relationshipSlug || '');
    return `${basePath}?template=${tplId}&variant=${varParam}&rel=${relParam}${campId}`;
  }

  /**
   * Shows a clear, accessible unavailable-state dialog when a requested relation or variant
   * is not supported or unavailable for a template (Rule F & Flow J).
   */
  function showUnavailableVariantNotice(family, requestedRelation) {
    const existing = document.getElementById('wm-relation-selector-overlay');
    if (existing) existing.remove();

    const relMeta = getRelationMeta(requestedRelation);
    const tplName = (family && (family.name || family.title)) || 'This template';
    const avail = getAvailablePublishedVariants(family);
    const availLabels = avail.map(v => v.relationshipLabel).join(', ');

    const overlay = document.createElement('div');
    overlay.id = 'wm-relation-selector-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Relation Unavailable');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(7,5,16,0.85);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:16px;';

    overlay.innerHTML = `
      <div style="width:100%;max-width:440px;background:#130f26;border:1px solid rgba(244,63,94,0.35);border-radius:20px;padding:24px;color:#f8fafc;box-shadow:0 24px 60px rgba(0,0,0,0.65);text-align:center;font-family:'Plus Jakarta Sans',sans-serif;">
        <div style="width:52px;height:52px;border-radius:50%;background:rgba(244,63,94,0.15);border:1px solid rgba(244,63,94,0.35);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:1.5rem;">⚠️</div>
        <h3 style="margin:0 0 8px;font-size:1.15rem;font-weight:800;color:#fff;">Relation Variant Unavailable</h3>
        <p style="margin:0 0 14px;font-size:0.88rem;color:#94a3b8;line-height:1.55;">
          <strong>${escapeHtmlSafe(tplName)}</strong> does not have an active published variant for <strong>${escapeHtmlSafe(relMeta.label)}</strong>.
        </p>
        ${availLabels ? `<p style="margin:0 0 18px;font-size:0.8rem;color:#cbd5e1;background:rgba(255,255,255,0.04);padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);">Available relations for this template: <strong>${escapeHtmlSafe(availLabels)}</strong></p>` : ''}
        <button type="button" id="wm-rel-unavail-close" style="padding:10px 22px;border-radius:999px;border:none;background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#fff;font-weight:700;font-size:0.88rem;cursor:pointer;">Close</button>
      </div>
    `;

    document.body.appendChild(overlay);
    const closeBtn = overlay.querySelector('#wm-rel-unavail-close');
    if (closeBtn) {
      closeBtn.focus();
      closeBtn.addEventListener('click', () => overlay.remove());
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  /**
   * Opens the accessible, mobile-responsive Relation Selection Modal (Rules C, D, G).
   * Preserves the visitor's original action ('preview' or 'customize') and executes it immediately on selection.
   */
  function showRelationSelectionModal(family, variants, action, context = {}) {
    const existing = document.getElementById('wm-relation-selector-overlay');
    if (existing) existing.remove();

    const isCustomize = action === 'customize' || action === 'create';
    const actionTitle = isCustomize ? 'Choose Relation to Customize' : 'Choose Relation to Preview';
    const actionSubtitle = isCustomize
      ? `Select who this wish is for to open the ${escapeHtmlSafe(family.name || 'template')} customizer with tailored fields and defaults.`
      : `Select a relationship variant to preview ${escapeHtmlSafe(family.name || 'this template')} with its tailored theme and message.`;
    const actionBadgeText = isCustomize ? '✨ Customize Variant' : '👁️ Live Variant Preview';

    const overlay = document.createElement('div');
    overlay.id = 'wm-relation-selector-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'wm-rel-modal-title');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(7,5,16,0.84);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:16px;animation:wmFadeIn 0.18s ease-out;';

    const cardsHtml = variants.map((v, idx) => {
      const thumbHtml = v.thumbnail
        ? `<img src="${escapeHtmlSafe(v.thumbnail)}" alt="${escapeHtmlSafe(v.relationshipLabel)}" style="width:46px;height:46px;border-radius:12px;object-fit:cover;border:1px solid rgba(255,255,255,0.14);flex-shrink:0;" onerror="this.style.display='none'" />`
        : `<div style="width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,rgba(236,72,153,0.22),rgba(139,92,246,0.22));border:1px solid rgba(236,72,153,0.35);display:flex;align-items:center;justify-content:center;font-size:1.35rem;flex-shrink:0;">${escapeHtmlSafe(v.icon || '✨')}</div>`;

      const descHtml = v.description
        ? `<span style="display:block;font-size:0.75rem;color:#94a3b8;margin-top:2px;line-height:1.35;">${escapeHtmlSafe(v.description)}</span>`
        : `<span style="display:block;font-size:0.74rem;color:#94a3b8;margin-top:2px;">Open ${escapeHtmlSafe(v.relationshipLabel)} edition</span>`;

      return `
        <button type="button"
                class="wm-relation-option-btn"
                data-variant-id="${escapeHtmlSafe(v.id)}"
                data-relation-slug="${escapeHtmlSafe(v.relationshipSlug)}"
                data-option-index="${idx}"
                style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#f8fafc;text-align:left;cursor:pointer;transition:all 0.16s ease;">
          <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1;">
            ${thumbHtml}
            <div style="min-width:0;flex:1;">
              <div style="font-size:0.95rem;font-weight:700;color:#fff;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span>${escapeHtmlSafe(v.relationshipLabel)}</span>
                ${v.isDefault ? '<span style="font-size:0.65rem;padding:2px 7px;border-radius:999px;background:rgba(236,72,153,0.18);color:#f472b6;border:1px solid rgba(236,72,153,0.35);font-weight:700;">Default</span>' : ''}
              </div>
              ${descHtml}
            </div>
          </div>
          <span style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:999px;background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#fff;font-size:0.75rem;font-weight:700;flex-shrink:0;">
            ${isCustomize ? 'Customize →' : 'Preview →'}
          </span>
        </button>
      `;
    }).join('');

    overlay.innerHTML = `
      <div class="wm-relation-modal-card" style="width:100%;max-width:500px;max-height:88vh;display:flex;flex-direction:column;background:#130f26;border:1px solid rgba(255,255,255,0.14);border-radius:22px;padding:22px;color:#f8fafc;box-shadow:0 28px 70px rgba(0,0,0,0.72);font-family:'Plus Jakarta Sans',sans-serif;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;">
          <div>
            <span style="display:inline-block;font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;padding:3px 10px;border-radius:999px;background:rgba(236,72,153,0.15);color:#f472b6;border:1px solid rgba(236,72,153,0.35);margin-bottom:6px;">${actionBadgeText}</span>
            <h3 id="wm-rel-modal-title" style="margin:0;font-size:1.2rem;font-weight:800;color:#fff;">${actionTitle}</h3>
          </div>
          <button type="button" id="wm-rel-modal-close" aria-label="Close relation selector" style="width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:#cbd5e1;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">✕</button>
        </div>
        <p style="margin:0 0 16px;font-size:0.84rem;color:#94a3b8;line-height:1.5;">${actionSubtitle}</p>
        <div class="wm-relation-options-list" style="display:flex;flex-direction:column;gap:10px;overflow-y:auto;padding-right:4px;max-height:56vh;">
          ${cardsHtml}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      if (typeof context.onCancel === 'function') {
        context.onCancel();
      }
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const closeBtn = overlay.querySelector('#wm-rel-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    const optionBtns = overlay.querySelectorAll('.wm-relation-option-btn');
    optionBtns.forEach((btn) => {
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(236,72,153,0.12)';
        btn.style.borderColor = 'rgba(236,72,153,0.45)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(255,255,255,0.04)';
        btn.style.borderColor = 'rgba(255,255,255,0.1)';
      });
      btn.addEventListener('click', () => {
        const varId = btn.getAttribute('data-variant-id');
        const selected = variants.find(v => v.id === varId) || variants[0];
        document.removeEventListener('keydown', onKeyDown);
        overlay.remove();
        continueOriginalAction(family, action, selected, context);
      });
    });

    if (optionBtns[0]) {
      optionBtns[0].focus();
    }
  }

  /**
   * Executes the visitor's original action ('preview' or 'customize') with the resolved variant.
   */
  function continueOriginalAction(family, action, variant, context = {}) {
    if (typeof context.onSelectVariant === 'function') {
      context.onSelectVariant(variant, family, action);
      return;
    }

    const isCustomize = action === 'customize' || action === 'create';
    if (!isCustomize && typeof context.openPreviewModal === 'function') {
      context.openPreviewModal(family.id, variant, family);
      return;
    }

    const targetUrl = buildActionDestinationUrl(family, action, variant);
    window.location.href = targetUrl;
  }

  /**
   * Executes legacy non-variant template action (Rule C & D legacy preservation).
   */
  function continueLegacyAction(family, action, context = {}) {
    if (typeof context.onSelectLegacy === 'function') {
      context.onSelectLegacy(family, action);
      return;
    }

    const isCustomize = action === 'customize' || action === 'create';
    if (!isCustomize && typeof context.openPreviewModal === 'function') {
      context.openPreviewModal(family.id, null, family);
      return;
    }

    const targetUrl = buildActionDestinationUrl(family, action, null);
    window.location.href = targetUrl;
  }

  /**
   * Unified Template Action Handler (Part 7 Pseudo-logic implementation):
   * Resolves family from object or window._wmLoadedTemplatesMap, checks explicit relation context,
   * handles 1-variant auto-open, >1-variant relation prompt, and legacy 0-variant preservation.
   */
  function handleTemplateAction(familyOrId, action = 'preview', context = {}) {
    let family = familyOrId;
    if (typeof familyOrId === 'string') {
      const map = window._wmLoadedTemplatesMap || {};
      family = map[familyOrId] || null;
      if (!family && Array.isArray(window.LIVE_TEMPLATES)) {
        family = window.LIVE_TEMPLATES.find(t => t.id === familyOrId || t.slug === familyOrId) || null;
      }
      if (!family && Array.isArray(window.allMarketplaceTemplates)) {
        family = window.allMarketplaceTemplates.find(t => t.id === familyOrId || t.slug === familyOrId) || null;
      }
    }

    if (!family || typeof family !== 'object') {
      const fallbackId = typeof familyOrId === 'string' ? familyOrId : '';
      if (fallbackId) {
        const dest = (action === 'customize' || action === 'create')
          ? `/customize.html?template=${encodeURIComponent(fallbackId)}`
          : `/template-preview.html?template=${encodeURIComponent(fallbackId)}`;
        window.location.href = dest;
      }
      return;
    }

    const variants = getAvailablePublishedVariants(family);
    const hasDeclaredVariants = Boolean(family.hasVariants || family.has_variants || variants.length > 0);

    // Check if an explicit relation was already selected (via context.relation, context.variantId, or active relation filter)
    const explicitRelOrVariant = context.variantId || context.relation || (_activeExplicitRelationFilter || '');

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

    if (!hasDeclaredVariants) {
      continueLegacyAction(family, action, context);
      return;
    }

    showUnavailableVariantNotice(family, explicitRelOrVariant || 'any relation');
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
})();
