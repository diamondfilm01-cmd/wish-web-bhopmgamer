/**
 * WishMagic Universal Template Protocol (v1.0, v1.1 & v1.2 Runtime Bridge)
 * -------------------------------------------------------------------------
 * Provides self-describing capability discovery, validation,
 * safe DOM data hydration, manifest binding target execution,
 * relationship variant resolution, physical DOM removal of disabled
 * sections/subsections (with media/timer/navigation cleanup and empty-parent collapse),
 * and deterministic button/action execution (`data-wm-action`) for all UTP templates.
 */

(function (global) {
  'use strict';

  const PROTOCOL_VERSION = '1.4';
  const SCHEMA_VERSION = '1.4.0';
  const RUNTIME_API_VERSION = '1.4';

  const DEFAULT_CENTRAL_LINK_CONFIG = {
    canonicalBaseUrl: 'https://wishmagic.pages.dev',
    globalDestinations: {
      'global.home': '/',
      'global.explore': '/templates.html',
      'global.browseTemplates': '/templates.html',
      'global.marketplace': '/marketplace.html',
      'global.createWish': '/create.html',
      'global.pricing': '/pricing.html',
      'global.help': '/help.html',
      'global.contact': '/contact.html'
    },
    templateRoutes: {
      'template.create': '/customize.html',
      'template.customize': '/customize.html',
      'template.preview': '/template-preview.html'
    }
  };

  function getActiveCentralLinkConfig() {
    const custom = global.WishMagicCentralLinks || (global.WishMagicData && global.WishMagicData.centralLinkConfig) || {};
    return {
      canonicalBaseUrl: custom.canonicalBaseUrl || DEFAULT_CENTRAL_LINK_CONFIG.canonicalBaseUrl,
      globalDestinations: Object.assign({}, DEFAULT_CENTRAL_LINK_CONFIG.globalDestinations, custom.globalDestinations || {}),
      templateRoutes: Object.assign({}, DEFAULT_CENTRAL_LINK_CONFIG.templateRoutes, custom.templateRoutes || {})
    };
  }

  function setCentralLinkConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    global.WishMagicCentralLinks = Object.assign({}, getActiveCentralLinkConfig(), cfg);
  }

  /**
   * UTP v1.3.0 Runtime Logical Link Resolver (`global.*` and `template.*`)
   */
  function resolveLogicalLink(logicalIdOrTarget, contextData) {
    const raw = String(logicalIdOrTarget || '').trim();
    if (!raw) return '';
    const cfg = getActiveCentralLinkConfig();
    const ctx = contextData || global.WishMagicData || {};
    const useAbsolute = Boolean(ctx.useAbsoluteCanonical || ctx.includeOrigin || ctx.absoluteUrl);
    const baseOrigin = String(cfg.canonicalBaseUrl || 'https://wishmagic.pages.dev').replace(/\/+$/, '');

    if (raw.startsWith('global.')) {
      const route = cfg.globalDestinations[raw] || '/';
      return useAbsolute ? (baseOrigin + route) : route;
    }

    if (raw.startsWith('template.')) {
      const baseRoute = cfg.templateRoutes[raw] || '/customize.html';
      const resolvedRel = resolveClientInternalActionUrl(baseRoute, ctx);
      return useAbsolute ? (baseOrigin + resolvedRel) : resolvedRel;
    }

    return resolveClientInternalActionUrl(raw, ctx);
  }

  /**
   * Helper to safely sanitize and set text without XSS risks
   */
  function setTextSafe(el, text) {
    if (!el) return;
    el.textContent = text !== undefined && text !== null ? String(text) : '';
  }

  /**
   * Helper to set image source with graceful fallback
   */
  function setImageSafe(el, src, fallback) {
    if (!el) return;
    const finalSrc = src || fallback || el.getAttribute('data-wm-default') || '';
    if (finalSrc) {
      el.src = finalSrc;
      el.removeAttribute('data-wm-empty');
    } else {
      el.setAttribute('data-wm-empty', 'true');
    }
  }

  /**
   * Lookup manifest field definition if window.WishMagicManifest is available
   */
  function getManifestFieldConfig(key) {
    const manifest = global.WishMagicManifest;
    if (!manifest || !Array.isArray(manifest.fields)) return null;
    return manifest.fields.find(f => (f.id || f.key) === key) || null;
  }

  /**
   * Resolve DOM elements for a field key using both standard [data-wm-field] / [data-wm]
   * and any custom binding.selector declared in wishmagic.json
   */
  function resolveFieldElements(key, fieldConfig, rootDoc) {
    const doc = rootDoc || document;
    const selectorParts = [`[data-wm-field="${key}"]`, `[data-wm="${key}"]`, `[data-wm-alias="${key}"]`, `[data-wm-alias~="${key}"]`];
    if (fieldConfig && Array.isArray(fieldConfig.aliases)) {
      fieldConfig.aliases.forEach(al => {
        if (al) selectorParts.push(`[data-wm-field="${al}"]`, `[data-wm="${al}"]`, `[data-wm-alias="${al}"]`);
      });
    }
    if (fieldConfig && fieldConfig.binding && fieldConfig.binding.selector) {
      const customSel = String(fieldConfig.binding.selector).trim();
      if (customSel && !customSel.startsWith('{{') && !customSel.startsWith('--')) {
        selectorParts.push(customSel);
      }
    }
    const nodeSet = new Set();
    selectorParts.forEach(sel => {
      try {
        doc.querySelectorAll(sel).forEach(el => nodeSet.add(el));
      } catch (_) {}
    });
    return Array.from(nodeSet);
  }

  /**
   * Safely stops and unloads any active media, timers, or observers inside an element before removal.
   */
  function cleanupElementResourcesBeforeRemoval(el, sectionId, rootDoc) {
    if (!el) return;
    try {
      const mediaNodes = [];
      if (el.tagName === 'AUDIO' || el.tagName === 'VIDEO') {
        mediaNodes.push(el);
      }
      if (typeof el.querySelectorAll === 'function') {
        el.querySelectorAll('audio, video, iframe').forEach(m => mediaNodes.push(m));
      }
      mediaNodes.forEach(m => {
        try {
          if (typeof m.pause === 'function') m.pause();
          m.removeAttribute('src');
          if (typeof m.querySelectorAll === 'function') {
            m.querySelectorAll('source').forEach(s => s.removeAttribute('src'));
          }
          if (typeof m.load === 'function') m.load();
        } catch (_) {}
      });
    } catch (_) {}

    try {
      const evt = new CustomEvent('wishmagic:section-removed', {
        detail: { id: sectionId || el.getAttribute('data-wm-section') || el.getAttribute('data-wm-subsection') || el.id || null }
      });
      window.dispatchEvent(evt);
      if (rootDoc && rootDoc !== document && typeof rootDoc.dispatchEvent === 'function') {
        rootDoc.dispatchEvent(evt);
      }
    } catch (_) {}
  }

  /**
   * Completely removes disabled sections and subsections from the DOM (`el.remove()`),
   * cleans up dependent media/navigation links/separators, and collapses empty parent sections
   * according to the UTP v1.2.0 empty-parent policy so customers never see blank gaps or placeholders.
   */

  /**
   * Finds the outer visual card/frame/slot wrapper for a photo or field element
   * so hiding photo_6 in a 6-photo album removes the entire polaroid/frame/caption card
   * and lets the remaining 5 photo cards reflow cleanly without an empty frame.
   */
  function findPhotoOrFieldSlotContainer(el, doc, fieldKey) {
    if (!el || !doc) return el;
    const cleanKey = String(fieldKey || "").trim();
    if (cleanKey) {
      try {
        const explicitSlot = el.closest(`[data-wm-photo-slot="${cleanKey}"], [data-wm-field-slot="${cleanKey}"]`) ||
          doc.querySelector(`[data-wm-photo-slot="${cleanKey}"], [data-wm-field-slot="${cleanKey}"]`);
        if (explicitSlot) return explicitSlot;
      } catch (_) {}
    }

    // Check if wrapped in a dedicated subsection that only holds this photo (and optional caption)
    try {
      const subEl = el.closest("[data-wm-subsection]");
      if (subEl) {
        const allMediaFieldsInSub = Array.from(subEl.querySelectorAll("img[data-wm-field], img[data-wm], [data-wm-type=\"image\"]"));
        const otherMedia = allMediaFieldsInSub.filter(node => {
          const nk = node.getAttribute("data-wm-field") || node.getAttribute("data-wm") || "";
          return nk && nk !== cleanKey;
        });
        if (otherMedia.length === 0) return subEl;
      }
    } catch (_) {}

    // Walk up up to 4 levels to find the highest card/figure/item container that does not contain ANY OTHER photo slot
    const isPhotoField = /^photo_\d+$/i.test(cleanKey) || el.tagName === "IMG" || (el.getAttribute("data-wm-type") || "").toLowerCase() === "image";
    if (!isPhotoField) return el;

    let bestContainer = el;
    let curr = el.parentElement;
    let depth = 0;
    while (curr && depth < 4) {
      const tag = (curr.tagName || "").toUpperCase();
      if (tag === "BODY" || tag === "HTML" || tag === "MAIN" || tag === "SECTION" || curr.hasAttribute("data-wm-section")) {
        break;
      }
      // Check if curr contains any OTHER photo field or image
      const imgsAndPhotoFields = Array.from(curr.querySelectorAll("img, [data-wm-field], [data-wm]"));
      const hasOtherPhoto = imgsAndPhotoFields.some(node => {
        if (node === el || el.contains(node)) return false;
        const nk = (node.getAttribute("data-wm-field") || node.getAttribute("data-wm") || "").trim();
        const nType = (node.getAttribute("data-wm-type") || "").toLowerCase();
        if (node.tagName === "IMG" && (!nk || nk !== cleanKey)) return true;
        if (nType === "image" && nk && nk !== cleanKey) return true;
        if (/^photo_\d+$/i.test(nk) && nk !== cleanKey) return true;
        // Also stop if this ancestor contains an unrelated primary text field like recipient_name or custom_message
        if (["recipient_name", "custom_message", "sender_name", "event_date", "hero_title"].includes(nk)) return true;
        return false;
      });
      if (hasOtherPhoto) {
        break;
      }
      bestContainer = curr;
      curr = curr.parentElement;
      depth++;
    }
    return bestContainer;
  }

  /**
   * Restores any previously removed customer-toggled nodes in live preview mode when re-enabled.
   */
  function restorePreviouslyRemovedPreviewNodes(doc, activeDisabledSectionsSet, activeHiddenFieldsSet) {
    if (!doc || !Array.isArray(doc._wmRestorableNodes) || doc._wmRestorableNodes.length === 0) return;
    const remaining = [];
    // Restore in reverse removal order so nested/sibling order stays intact
    for (let i = doc._wmRestorableNodes.length - 1; i >= 0; i--) {
      const entry = doc._wmRestorableNodes[i];
      if (!entry || !entry.node || !entry.parent) continue;
      const stillHidden = entry.kind === "field"
        ? activeHiddenFieldsSet.has(entry.id)
        : activeDisabledSectionsSet.has(entry.id);
      if (stillHidden) {
        remaining.unshift(entry);
      } else {
        try {
          if (entry.nextSibling && entry.nextSibling.parentNode === entry.parent) {
            entry.parent.insertBefore(entry.node, entry.nextSibling);
          } else {
            entry.parent.appendChild(entry.node);
          }
        } catch (_) {}
      }
    }
    doc._wmRestorableNodes = remaining;
  }

  function recordRestorableNodeBeforeRemove(doc, kind, id, node) {
    if (!doc || !node || !node.parentNode) return;
    if (!Array.isArray(doc._wmRestorableNodes)) {
      doc._wmRestorableNodes = [];
    }
    if (!doc._wmRestorableNodes.some(e => e.node === node)) {
      doc._wmRestorableNodes.push({
        kind,
        id,
        node,
        parent: node.parentNode,
        nextSibling: node.nextSibling
      });
    }
  }

  function removeDisabledContentFromDom(rootDoc, visibilityConfigOrPayload) {
    const isDocFirst = Boolean(rootDoc && typeof rootDoc.querySelectorAll === 'function');
    const doc = isDocFirst ? rootDoc : document;
    if (!doc || typeof doc.querySelectorAll !== 'function') return { removedIds: [] };

    const data = (isDocFirst ? visibilityConfigOrPayload : rootDoc) || {};
    const eff = data.effectiveConfig || data;
    const visibilityMap = (eff.visibilityMap && typeof eff.visibilityMap === 'object')
      ? eff.visibilityMap
      : ((data.visibilityMap && typeof data.visibilityMap === 'object') ? data.visibilityMap : {});

    const disabledSet = new Set();
    if (Array.isArray(eff.disabledIds)) {
      eff.disabledIds.forEach(id => { if (id) disabledSet.add(String(id).trim()); });
    }
    if (Array.isArray(data.disabledIds)) {
      data.disabledIds.forEach(id => { if (id) disabledSet.add(String(id).trim()); });
    }
    Object.entries(visibilityMap).forEach(([id, enabled]) => {
      if (enabled === false) disabledSet.add(String(id).trim());
    });

    const walkSectionsForDisabled = (secList, parentDisabled = false) => {
      if (!Array.isArray(secList)) return;
      secList.forEach(sec => {
        if (!sec || typeof sec !== 'object') return;
        const sId = String(sec.id || sec.key || '').trim();
        const isOff = parentDisabled || sec.enabled === false || sec.isEnabled === false || sec.effectiveEnabled === false;
        if (sId && isOff) {
          disabledSet.add(sId);
        }
        if (Array.isArray(sec.subsections)) {
          walkSectionsForDisabled(sec.subsections, isOff);
        }
      });
    };
    if (Array.isArray(eff.sections)) walkSectionsForDisabled(eff.sections, false);
    if (Array.isArray(data.sections)) walkSectionsForDisabled(data.sections, false);

    // Support customer-hidden sections (_hiddenSections / hiddenSections / sectionsMap)
    const customerHiddenSections = Array.isArray(data._hiddenSections)
      ? data._hiddenSections
      : (Array.isArray(data.hiddenSections) ? data.hiddenSections : (Array.isArray(eff._hiddenSections) ? eff._hiddenSections : []));
    customerHiddenSections.forEach(sId => {
      if (sId) disabledSet.add(String(sId).trim());
    });
    if (data.sectionsMap && typeof data.sectionsMap === "object") {
      Object.entries(data.sectionsMap).forEach(([sId, cfg]) => {
        if (cfg && cfg.enabled === false) disabledSet.add(String(sId).trim());
      });
    }

    // Support customer-hidden photo slots & fields (_hiddenFields / hiddenFields)
    const hiddenFieldsSet = new Set();
    const rawHiddenFields = Array.isArray(data._hiddenFields)
      ? data._hiddenFields
      : (Array.isArray(data.hiddenFields) ? data.hiddenFields : (Array.isArray(eff._hiddenFields) ? eff._hiddenFields : []));
    rawHiddenFields.forEach(fKey => {
      if (fKey) hiddenFieldsSet.add(String(fKey).trim());
    });

    const isLivePreview = Boolean(data._isLiveCustomizerPreview);
    if (isLivePreview) {
      restorePreviouslyRemovedPreviewNodes(doc, disabledSet, hiddenFieldsSet);
    }

    const removedIds = [];
    const removedFieldIds = [];

    // 1. Physically remove all disabled sections and subsections from the DOM
    disabledSet.forEach(secId => {
      if (!secId) return;
      const selectors = [
        `[data-wm-section="${secId}"]`,
        `[data-wm-subsection="${secId}"]`,
        `#section-${secId}`
      ];
      selectors.forEach(sel => {
        try {
          doc.querySelectorAll(sel).forEach(el => {
            const isReq = el.getAttribute('data-wm-required') === 'true';
            if (isReq) return;
            const nextSib = el.nextElementSibling;
            if (nextSib && (nextSib.hasAttribute('data-wm-separator') || nextSib.getAttribute('data-wm-for-section') === secId)) {
              if (isLivePreview) recordRestorableNodeBeforeRemove(doc, 'section', secId, nextSib);
              nextSib.remove();
            }
            if (isLivePreview) {
              recordRestorableNodeBeforeRemove(doc, 'section', secId, el);
            } else {
              cleanupElementResourcesBeforeRemoval(el, secId, doc);
            }
            el.remove();
            if (!removedIds.includes(secId)) removedIds.push(secId);
          });
        } catch (_) {}
      });

      // 2. Remove navigation links, section index pills, and action triggers pointing to the disabled section
      const navSelectors = [
        `a[href="#${secId}"]`,
        `a[href="#section-${secId}"]`,
        `[data-wm-nav-target="${secId}"]`,
        `[data-wm-scroll-to="${secId}"]`,
        `[data-wm-section-link="${secId}"]`
      ];
      navSelectors.forEach(navSel => {
        try {
          doc.querySelectorAll(navSel).forEach(navEl => {
            // Skip [data-wm-action] elements here if they have their own fallbackBehavior handled in applyActionsToDom
            if (navEl.hasAttribute('data-wm-action') || navEl.hasAttribute('data-wm-button')) return;
            const parentLi = navEl.parentElement && navEl.parentElement.tagName === 'LI' ? navEl.parentElement : null;
            navEl.remove();
            if (parentLi && parentLi.children.length === 0 && !parentLi.textContent.trim()) {
              parentLi.remove();
            }
          });
        } catch (_) {}
      });
    });

    // 3. Apply Empty-Parent Collapse Policy:
    // If a parent [data-wm-section] had child [data-wm-subsection] elements removed and now has
    // no remaining child subsections, fields, media, or meaningful body content (or all its children were removed),
    // remove the parent section cleanly so no orphaned heading or blank gap remains.
    try {
      doc.querySelectorAll('[data-wm-section]').forEach(secEl => {
        const policy = (secEl.getAttribute('data-wm-empty-policy') || secEl.getAttribute('data-wm-empty-parent-policy') || 'collapse').toLowerCase();
        if (policy === 'keep' || secEl.getAttribute('data-wm-required') === 'true') return;
        const secId = secEl.getAttribute('data-wm-section');
        if (secEl.getAttribute('data-wm-had-subsections') === 'true' || disabledSet.size > 0) {
          const remainingSubsections = secEl.querySelectorAll('[data-wm-subsection]');
          const remainingFields = secEl.querySelectorAll('[data-wm-field], [data-wm]');
          const remainingMedia = secEl.querySelectorAll('img, audio, video, canvas, iframe');
          const remainingActions = secEl.querySelectorAll('[data-wm-action], [data-wm-button]');
          if (
            remainingSubsections.length === 0 &&
            remainingFields.length === 0 &&
            remainingMedia.length === 0 &&
            remainingActions.length === 0 &&
            secEl.children.length <= 1
          ) {
            // Check if only an orphaned heading remains
            const onlyHeading = secEl.children.length === 0 ||
              (secEl.children.length === 1 && /^H[1-6]$/.test(secEl.children[0].tagName));
            if (onlyHeading && removedIds.length > 0) {
              cleanupElementResourcesBeforeRemoval(secEl, secId, doc);
              secEl.remove();
              if (secId && !removedIds.includes(secId)) removedIds.push(secId);
            }
          }
        }
      });
    } catch (_) {}

    // 4. Physically remove customer-hidden individual photo slots / fields (_hiddenFields) and their card wrappers
    if (hiddenFieldsSet.size > 0) {
      hiddenFieldsSet.forEach(fieldKey => {
        if (!fieldKey) return;
        const fieldSelectors = [
          `[data-wm-photo-slot="${fieldKey}"]`,
          `[data-wm-field-slot="${fieldKey}"]`,
          `[data-wm-field="${fieldKey}"]`,
          `[data-wm="${fieldKey}"]`
        ];
        const matchedNodes = new Set();
        fieldSelectors.forEach(sel => {
          try {
            doc.querySelectorAll(sel).forEach(n => matchedNodes.add(n));
          } catch (_) {}
        });
        matchedNodes.forEach(el => {
          if (!el || !el.isConnected) return;
          const slotContainer = findPhotoOrFieldSlotContainer(el, doc, fieldKey) || el;
          if (!slotContainer || !slotContainer.parentNode) return;
          if (isLivePreview) {
            recordRestorableNodeBeforeRemove(doc, 'field', fieldKey, slotContainer);
          } else {
            cleanupElementResourcesBeforeRemoval(slotContainer, fieldKey, doc);
          }
          slotContainer.remove();
          if (!removedFieldIds.includes(fieldKey)) removedFieldIds.push(fieldKey);
        });
      });

      // If all photo slots inside an optional gallery/album section were hidden by the customer, collapse the empty gallery section
      try {
        doc.querySelectorAll('[data-wm-section]').forEach(secEl => {
          if (secEl.getAttribute('data-wm-required') === 'true') return;
          const secId = secEl.getAttribute('data-wm-section') || '';
          if (['gallery', 'photos', 'album', 'memories'].includes(secId.toLowerCase())) {
            const remainingImgs = secEl.querySelectorAll('img');
            if (remainingImgs.length === 0) {
              if (isLivePreview) {
                recordRestorableNodeBeforeRemove(doc, 'field', '__sec_' + secId, secEl);
              }
              secEl.remove();
            }
          }
        });
      } catch (_) {}
    }

    return { removedIds, removedFieldIds };
  }

  /**
   * Builds a safe internal URL preserving `template`, `variant`, and `rel` context parameters.
   */
  function resolveClientInternalActionUrl(rawTarget, contextData) {
    const trimmed = String(rawTarget || '').trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:') || lower.startsWith('file:') || lower.startsWith('//')) {
      return '';
    }
    const data = contextData || {};

    if (lower.startsWith('https://') || lower.startsWith('http://')) {
      try {
        const parsed = new URL(trimmed);
        const cleanPath = (parsed.pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
        const isContextual =
          cleanPath === '/customize' ||
          cleanPath === '/customize.html' ||
          cleanPath === '/preview' ||
          cleanPath === '/template-preview' ||
          cleanPath === '/template-preview.html';
        if (isContextual) {
          const tplId = data.templateId || data.template_id || data.templateSlug || '';
          const varId = data.variantId || data.variant_id || data.variantSlug || (data.variant && (data.variant.id || data.variant.slug)) || '';
          const relSlug = data.relationshipSlug || data.relationship_slug || data.relationship || (data.variant && (data.variant.relationshipSlug || data.variant.relationship)) || '';
          if (tplId && !parsed.searchParams.has('template') && !parsed.searchParams.has('id')) parsed.searchParams.set('template', tplId);
          if (varId && !parsed.searchParams.has('variant')) parsed.searchParams.set('variant', varId);
          if (relSlug && relSlug !== 'general' && !parsed.searchParams.has('rel') && !parsed.searchParams.has('relationship')) parsed.searchParams.set('rel', relSlug);
        }
        return parsed.toString();
      } catch (_) {
        return trimmed;
      }
    }

    const hashIdx = trimmed.indexOf('#');
    const hashPart = hashIdx !== -1 ? trimmed.slice(hashIdx) : '';
    const withoutHash = hashIdx !== -1 ? trimmed.slice(0, hashIdx) : trimmed;
    const qIdx = withoutHash.indexOf('?');
    const pathname = qIdx !== -1 ? withoutHash.slice(0, qIdx) : withoutHash;
    const searchStr = qIdx !== -1 ? withoutHash.slice(qIdx + 1) : '';
    const params = new URLSearchParams(searchStr);

    const cleanPath = pathname.toLowerCase().replace(/\/+$/, '') || '/';
    const isContextual =
      cleanPath === '/customize' ||
      cleanPath === '/customize.html' ||
      cleanPath === '/preview' ||
      cleanPath === '/template-preview' ||
      cleanPath === '/template-preview.html';

    if (isContextual) {
      const tplId = data.templateId || data.template_id || data.templateSlug || '';
      const varId = data.variantId || data.variant_id || data.variantSlug || (data.variant && (data.variant.id || data.variant.slug)) || '';
      const relSlug = data.relationshipSlug || data.relationship_slug || data.relationship || (data.variant && (data.variant.relationshipSlug || data.variant.relationship)) || '';
      if (tplId && !params.has('template') && !params.has('id')) params.set('template', tplId);
      if (varId && !params.has('variant')) params.set('variant', varId);
      if (relSlug && relSlug !== 'general' && !params.has('rel') && !params.has('relationship')) params.set('rel', relSlug);
    }

    const qs = params.toString();
    return `${pathname}${qs ? `?${qs}` : ''}${hashPart}`;
  }

  /**
   * Applies the UTP v1.2.0 Button & Link Action Registry (`actions[]`) to the DOM.
   * Updates labels safely (`textContent`), validates targets, applies fallback behaviors
   * (`hide` -> `el.remove()`, `disable` -> `disabled`), and binds deterministic click handlers.
   */
  function applyActionsToDom(arg1, arg2, arg3) {
    let doc = document;
    let payload = {};
    let ctx = {};
    if (arg1 && typeof arg1.querySelectorAll === 'function') {
      doc = arg1;
      payload = arg2 || {};
      ctx = arg3 || payload || {};
    } else {
      doc = document;
      if (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1) && !arg1.actions && !arg1.actionsMap && !arg1.effectiveConfig) {
        payload = { actionsMap: arg1, visibilityMap: (arg2 && typeof arg2 === 'object') ? arg2 : {} };
        ctx = arg3 || {};
      } else {
        payload = arg1 || {};
        ctx = arg3 || arg2 || payload || {};
      }
    }
    if (!doc || typeof doc.querySelectorAll !== 'function') return;

    const eff = payload.effectiveConfig || payload;

    let actionsList = [];
    if (Array.isArray(payload)) {
      actionsList = payload;
    } else if (Array.isArray(eff.actions)) {
      actionsList = eff.actions;
    } else if (Array.isArray(payload.actions)) {
      actionsList = payload.actions;
    } else if (eff.actionsMap && typeof eff.actionsMap === 'object') {
      actionsList = Object.values(eff.actionsMap);
    } else if (payload.actionsMap && typeof payload.actionsMap === 'object') {
      actionsList = Object.values(payload.actionsMap);
    } else if (global.WishMagicManifest && Array.isArray(global.WishMagicManifest.actions)) {
      actionsList = global.WishMagicManifest.actions;
    }

    if (!Array.isArray(actionsList) || actionsList.length === 0) return;

    const disabledSectionSet = new Set(
      Array.isArray(eff.disabledIds) ? eff.disabledIds : (Array.isArray(payload.disabledIds) ? payload.disabledIds : [])
    );
    const visMap = eff.visibilityMap || payload.visibilityMap || {};
    Object.entries(visMap).forEach(([k, v]) => {
      if (v === false) disabledSectionSet.add(k);
    });

    actionsList.forEach(action => {
      if (!action || typeof action !== 'object') return;
      const actId = String(action.id || action.key || '').trim();
      if (!actId) return;

      const selectors = [
        `[data-wm-action="${actId}"]`,
        `[data-wm-button="${actId}"]`,
        `[data-wm-cta="${actId}"]`
      ];
      if (action.binding && action.binding.selector) {
        const customSel = String(action.binding.selector).trim();
        if (customSel) selectors.push(customSel);
      }

      const elements = new Set();
      selectors.forEach(sel => {
        try {
          doc.querySelectorAll(sel).forEach(el => elements.add(el));
        } catch (_) {}
      });

      elements.forEach(el => {
        let actType = String(action.type || action.actionType || 'section').toLowerCase().trim();
        const rawTarget = String(action.resolvedUrl || action.target || action.targetSection || action.destination || '').trim();
        if (actType === 'navigation' && rawTarget && !rawTarget.startsWith('/') && !rawTarget.startsWith('http')) {
          actType = 'section';
        }
        const fallback = String(action.fallbackBehavior || 'hide').toLowerCase().trim();
        let isActionEnabled = action.enabled !== false && action.effectiveEnabled !== false;

        // Verify target existence & availability in the live DOM for 'section' and 'modal' actions
        let targetEl = null;
        if (actType === 'section') {
          const cleanSecId = String(action.target || rawTarget).replace(/^#/, '').trim();
          if (!cleanSecId || disabledSectionSet.has(cleanSecId)) {
            isActionEnabled = false;
          } else {
            targetEl = doc.querySelector(`[data-wm-section="${cleanSecId}"], [data-wm-subsection="${cleanSecId}"], #${cleanSecId}, #section-${cleanSecId}`);
            if (!targetEl) {
              isActionEnabled = false;
            }
          }
        } else if (actType === 'modal') {
          const cleanModId = String(action.target || rawTarget).replace(/^#/, '').trim();
          if (!cleanModId || disabledSectionSet.has(cleanModId)) {
            isActionEnabled = false;
          } else {
            targetEl = doc.querySelector(`[data-wm-modal="${cleanModId}"], #${cleanModId}`);
            if (!targetEl) {
              isActionEnabled = false;
            }
          }
        } else if (actType === 'external_url') {
          const lowerUrl = rawTarget.toLowerCase();
          if (!rawTarget || (!lowerUrl.startsWith('https://') && !lowerUrl.startsWith('http://') && !lowerUrl.startsWith('/')) || lowerUrl.startsWith('javascript:') || lowerUrl.startsWith('data:')) {
            isActionEnabled = false;
          }
        } else if (actType === 'internal_url' || actType === 'customizer' || actType === 'global_link' || actType === 'template_link') {
          const explicitTarget = String(action.target || action.destination || '').trim();
          const explicitResolved = String(action.resolvedUrl || '').trim();
          const hasCustomTargetUrl = Boolean(
            (explicitResolved && (explicitResolved.startsWith('https://') || explicitResolved.startsWith('http://') || explicitResolved.startsWith('/template/') || explicitResolved.startsWith('/w/'))) ||
            (explicitTarget && !explicitTarget.startsWith('global.') && !explicitTarget.startsWith('template.') && (explicitTarget.startsWith('https://') || explicitTarget.startsWith('http://') || (explicitTarget !== '/customize.html' && explicitTarget !== '/customize' && !action.logicalLink)))
          );
          const logicalId = hasCustomTargetUrl
            ? String(action.logicalLink || action.linkId || '').trim()
            : String(action.logicalLink || action.linkId || el.getAttribute('data-wm-link') || '').trim();
          const resolvedInternal = explicitResolved
            ? resolveClientInternalActionUrl(explicitResolved, ctx)
            : (logicalId
              ? resolveLogicalLink(logicalId, ctx)
              : resolveLogicalLink(rawTarget || (actType === 'customizer' || actType === 'template_link' ? 'template.customize' : (actType === 'global_link' ? 'global.home' : '')), ctx));
          if (!resolvedInternal || (!resolvedInternal.startsWith('/') && !resolvedInternal.startsWith('https://') && !resolvedInternal.startsWith('http://') && !resolvedInternal.startsWith('#'))) {
            isActionEnabled = false;
          }
        }

        // Handle disabled / unavailable action according to fallbackBehavior
        if (!isActionEnabled) {
          if (fallback === 'disable') {
            el.disabled = true;
            el.setAttribute('disabled', 'disabled');
            el.setAttribute('aria-disabled', 'true');
            el.setAttribute('data-wm-action-disabled', 'true');
            el.removeAttribute('href');
            el.style.pointerEvents = 'none';
            el.style.opacity = '0.5';
            return;
          }
          // Default fallbackBehavior === 'hide': physically remove from DOM so no dead button remains
          el.remove();
          return;
        }

        // Safely set button label via textContent (for interaction buttons, preserve template icon/text unless explicitly overridden)
        const shouldSetLabel = action.label !== undefined && action.label !== null && String(action.label).trim() !== '' &&
          (!(['interaction', 'button', 'audio', 'trigger'].includes(actType)) || Boolean(action.isOverridden));
        if (shouldSetLabel) {
          const labelSpan = el.querySelector('[data-wm-action-label]');
          if (labelSpan) {
            setTextSafe(labelSpan, action.label);
          } else {
            setTextSafe(el, action.label);
          }
        }

        el.setAttribute('data-wm-action-type', actType);
        el.removeAttribute('disabled');
        el.removeAttribute('aria-disabled');
        el.removeAttribute('data-wm-action-disabled');

        // Configure href and deterministic click handler
        if (actType === 'internal_url' || actType === 'customizer' || actType === 'global_link' || actType === 'template_link') {
          const explicitTarget = String(action.target || action.destination || '').trim();
          const explicitResolved = String(action.resolvedUrl || '').trim();
          const hasCustomTargetUrl = Boolean(
            (explicitResolved && (explicitResolved.startsWith('https://') || explicitResolved.startsWith('http://') || explicitResolved.startsWith('/template/') || explicitResolved.startsWith('/w/'))) ||
            (explicitTarget && !explicitTarget.startsWith('global.') && !explicitTarget.startsWith('template.') && (explicitTarget.startsWith('https://') || explicitTarget.startsWith('http://') || (explicitTarget !== '/customize.html' && explicitTarget !== '/customize' && !action.logicalLink)))
          );
          const logicalId = hasCustomTargetUrl
            ? String(action.logicalLink || action.linkId || '').trim()
            : String(action.logicalLink || action.linkId || el.getAttribute('data-wm-link') || '').trim();
          const finalUrl = explicitResolved
            ? resolveClientInternalActionUrl(explicitResolved, ctx)
            : (hasCustomTargetUrl && explicitTarget
              ? resolveClientInternalActionUrl(explicitTarget, ctx)
              : (logicalId
                ? resolveLogicalLink(logicalId, ctx)
                : resolveLogicalLink(explicitTarget || (actType === 'customizer' || actType === 'template_link' ? 'template.customize' : 'global.home'), ctx)));
          if (logicalId) {
            el.setAttribute('data-wm-link', logicalId);
          } else if (hasCustomTargetUrl) {
            el.removeAttribute('data-wm-link');
          }
          if (el.tagName === 'A') {
            el.setAttribute('href', finalUrl);
          }
          el.onclick = function (ev) {
            ev.preventDefault();
            let navUrl = finalUrl;
            try {
              const topWin = (window.top && window.top !== window) ? window.top : window;
              const topPath = String((topWin.location && topWin.location.pathname) || "").toLowerCase();
              const isAlreadyOnPreviewPage = topPath.startsWith("/template/") || topPath.includes("template-preview");
              const isPointingToTemplatePreview = /\/template\/[a-zA-Z0-9_.-]+$/i.test(String(finalUrl || "").split("?")[0]);
              if (isAlreadyOnPreviewPage && isPointingToTemplatePreview && (actType === "template_link" || actType === "customizer")) {
                navUrl = resolveClientInternalActionUrl("/customize.html", ctx);
              }
              topWin.location.href = navUrl;
            } catch (_) {
              window.location.href = navUrl;
            }
          };
        } else if (actType === 'external_url') {
          const safeExtUrl = rawTarget;
          if (el.tagName === 'A') {
            el.setAttribute('href', safeExtUrl);
            el.setAttribute('rel', 'noopener noreferrer');
            if (action.openInNewTab !== false) {
              el.setAttribute('target', '_blank');
            }
          }
          el.onclick = function (ev) {
            ev.preventDefault();
            if (action.openInNewTab !== false) {
              window.open(safeExtUrl, '_blank', 'noopener,noreferrer');
            } else {
              window.location.href = safeExtUrl;
            }
          };
        } else if (actType === 'section') {
          const cleanSecId = String(action.target || rawTarget).replace(/^#/, '').trim();
          if (el.tagName === 'A') {
            el.setAttribute('href', `#${cleanSecId}`);
          }
          el.onclick = function (ev) {
            ev.preventDefault();
            const liveTarget = doc.querySelector(`[data-wm-section="${cleanSecId}"], [data-wm-subsection="${cleanSecId}"], #${cleanSecId}, #section-${cleanSecId}`);
            if (liveTarget && typeof liveTarget.scrollIntoView === 'function') {
              liveTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          };
        } else if (actType === 'modal') {
          const cleanModId = String(action.target || rawTarget).replace(/^#/, '').trim();
          const modalClickHandler = function (ev) {
            if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
            const liveModal = doc.querySelector(`[data-wm-modal="${cleanModId}"], #${cleanModId}`);
            if (liveModal) {
              if (liveModal.classList && typeof liveModal.classList.remove === 'function') {
                liveModal.classList.remove('hidden');
              }
              liveModal.style.display = '';
              liveModal.setAttribute('data-wm-modal-open', 'true');
              liveModal.setAttribute('aria-hidden', 'false');
              try {
                const modEvt = new CustomEvent('wishmagic:modal-open', { detail: { modalId: cleanModId, triggerId: actId } });
                window.dispatchEvent(modEvt);
                doc.dispatchEvent(modEvt);
              } catch (_) {}
            }
          };
          el.onclick = modalClickHandler;
          if (typeof el.addEventListener === 'function') el.addEventListener('click', modalClickHandler);
        } else if (['interaction', 'button', 'audio', 'trigger'].includes(actType)) {
          const targetSec = String(action.targetSection || action.sectionId || action.target || '').replace(/^#/, '').trim();
          if (targetSec && disabledSectionSet.has(targetSec)) {
            if (fallback === 'disable') {
              el.disabled = true;
              el.setAttribute('disabled', 'disabled');
              el.style.pointerEvents = 'none';
              el.style.opacity = '0.5';
            } else {
              el.remove();
            }
            return;
          }
        } else if (actType === 'none') {
          if (el.tagName === 'A') {
            el.removeAttribute('href');
          }
          el.onclick = function (ev) {
            ev.preventDefault();
          };
        }
      });
    });
  }

  /**
   * Universal Field Setter (supports all UTP v1.0.0, v1.1.0 & v1.2.0 field types & binding targets)
   */
  function setWishMagicField(key, value, customData) {
    const fieldConfig = getManifestFieldConfig(key);
    const declaredType = fieldConfig && fieldConfig.type ? String(fieldConfig.type).toLowerCase() : '';
    const bindingTarget = fieldConfig && fieldConfig.binding && fieldConfig.binding.target
      ? String(fieldConfig.binding.target).toLowerCase()
      : '';

    // Handle root CSS variable binding even if no specific DOM element is targeted
    if (declaredType === 'color' || bindingTarget === 'css-variable') {
      const cssVarName = (fieldConfig && fieldConfig.binding && (fieldConfig.binding.attribute || fieldConfig.binding.selector)) || '';
      const activeColor = (value !== undefined && value !== null && String(value).trim() !== '')
        ? String(value).trim()
        : (fieldConfig && fieldConfig.defaultValue ? String(fieldConfig.defaultValue) : '');
      if (activeColor) {
        if (cssVarName && cssVarName.startsWith('--')) {
          document.documentElement.style.setProperty(cssVarName, activeColor);
        } else if (key === 'primary_color' || key === 'primary') {
          document.documentElement.style.setProperty('--wm-primary', activeColor);
        } else if (key === 'secondary_color' || key === 'secondary') {
          document.documentElement.style.setProperty('--wm-secondary', activeColor);
        } else if (key === 'accent_color' || key === 'accent') {
          document.documentElement.style.setProperty('--wm-accent', activeColor);
        } else {
          document.documentElement.style.setProperty(`--wm-${key.replace(/_/g, '-')}`, activeColor);
        }
      }
    }

    const elements = resolveFieldElements(key, fieldConfig, document);

    elements.forEach(element => {
      const type = (
        element.getAttribute('data-wm-type') ||
        declaredType ||
        (element.tagName === 'IMG' ? 'image' : (element.tagName === 'AUDIO' ? 'audio' : (element.tagName === 'VIDEO' ? 'video' : 'text')))
      ).toLowerCase();
      const target = (
        element.getAttribute('data-wm-target') ||
        bindingTarget ||
        (element.tagName === 'IMG' || element.tagName === 'AUDIO' || element.tagName === 'VIDEO' ? 'src' : 'text')
      ).toLowerCase();

      if (
        !element.hasAttribute('data-wm-original-text') &&
        !['IMG', 'AUDIO', 'VIDEO', 'INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
      ) {
        element.setAttribute('data-wm-original-text', element.textContent || '');
      }
      const originalDomText = element.getAttribute('data-wm-original-text') || '';
      const isNameOrDob = ['recipient_name', 'recipientname', 'event_date', 'eventdate', 'dob', 'birth_date', 'celebration_date'].includes(String(key).toLowerCase());
      const isRequired = isNameOrDob || element.getAttribute('data-wm-required') === 'true' || Boolean(fieldConfig && fieldConfig.required);
      const manifestDef = (fieldConfig && fieldConfig.defaultValue !== undefined && fieldConfig.defaultValue !== null && String(fieldConfig.defaultValue) !== '')
        ? fieldConfig.defaultValue
        : '';
      const defaultValue = element.getAttribute('data-wm-default') || manifestDef || originalDomText || '';

      const hasValue = value !== undefined && value !== null && (
        Array.isArray(value) ? value.length > 0 : String(value).trim() !== ''
      );

      if (!hasValue && !isRequired && !defaultValue) {
        element.setAttribute('data-wm-empty', 'true');
      } else {
        element.removeAttribute('data-wm-empty');
      }

      const activeValue = hasValue ? value : defaultValue;

      // Explicit binding target support
      if (target === 'background-image') {
        const bgUrl = typeof activeValue === 'object' && activeValue !== null ? (activeValue.displayUrl || activeValue.url || activeValue.src || '') : activeValue;
        element.style.backgroundImage = bgUrl ? `url("${bgUrl}")` : '';
        return;
      }
      if (target === 'href') {
        if (activeValue) element.setAttribute('href', String(activeValue));
        return;
      }
      if (target === 'css-variable') {
        const varProp = element.getAttribute('data-wm-css-var') || (fieldConfig?.binding?.attribute) || `--wm-${key.replace(/_/g, '-')}`;
        if (activeValue) element.style.setProperty(varProp, String(activeValue));
        return;
      }
      if (target === 'style-property') {
        const styleProp = element.getAttribute('data-wm-style-prop') || (fieldConfig?.binding?.attribute) || 'color';
        if (activeValue) element.style[styleProp] = String(activeValue);
        return;
      }
      if (target === 'visibility') {
        const visible = Boolean(activeValue && activeValue !== 'false' && activeValue !== '0');
        element.style.display = visible ? '' : 'none';
        return;
      }

      switch (type) {
        case 'image': {
          const imgUrl = typeof activeValue === 'object' && activeValue !== null
            ? (activeValue.displayUrl || activeValue.url || activeValue.src || '')
            : String(activeValue || '');
          if (element.tagName === 'IMG') {
            setImageSafe(element, imgUrl, '/assets/file_ab2082.png');
          } else {
            element.style.backgroundImage = imgUrl ? `url("${imgUrl}")` : '';
          }
          break;
        }

        case 'image-multiple': {
          const list = Array.isArray(activeValue) ? activeValue : [];
          const childImgs = element.querySelectorAll('img');
          if (childImgs.length > 0) {
            childImgs.forEach((imgEl, idx) => {
              const item = list[idx];
              const itemUrl = typeof item === 'string' ? item : (item && (item.displayUrl || item.url || item.src));
              if (itemUrl) {
                imgEl.src = itemUrl;
                imgEl.style.display = '';
              }
            });
          }
          break;
        }

        case 'video':
        case 'video-multiple': {
          const vidUrl = typeof activeValue === 'object' && activeValue !== null
            ? (activeValue.streamUrl || activeValue.url || activeValue.src || '')
            : String(activeValue || '');
          if (element.tagName === 'VIDEO' && vidUrl) {
            if (element.src !== vidUrl) {
              element.src = vidUrl;
              const sourceChild = element.querySelector('source');
              if (sourceChild) sourceChild.src = vidUrl;
              try { element.load(); } catch (_) {}
            }
          }
          break;
        }

        case 'audio':
        case 'voice': {
          const audUrl = typeof activeValue === 'object' && activeValue !== null
            ? (activeValue.streamUrl || activeValue.url || activeValue.src || '')
            : String(activeValue || '');
          const audioEl = element.tagName === 'AUDIO' ? element : element.querySelector('audio');
          if (audioEl && audUrl) {
            if (audioEl.src !== audUrl) {
              audioEl.src = audUrl;
              const sourceChild = audioEl.querySelector('source');
              if (sourceChild) sourceChild.src = audUrl;
              try { audioEl.load(); } catch (_) {}
            }
          }
          break;
        }

        case 'color': {
          if (key === 'primary_color' || key === 'primary') {
            document.documentElement.style.setProperty('--wm-primary', activeValue);
          } else if (key === 'secondary_color' || key === 'secondary') {
            document.documentElement.style.setProperty('--wm-secondary', activeValue);
          } else if (key === 'accent_color' || key === 'accent') {
            document.documentElement.style.setProperty('--wm-accent', activeValue);
          } else {
            document.documentElement.style.setProperty(`--wm-${key.replace(/_/g, '-')}`, activeValue);
          }
          break;
        }

        case 'toggle':
        case 'boolean':
        case 'checkbox': {
          const boolVal = typeof activeValue === 'boolean' ? activeValue : (String(activeValue).toLowerCase() === 'true');
          if (element.tagName === 'INPUT' && element.type === 'checkbox') {
            element.checked = boolVal;
          }
          if (!boolVal) {
            element.setAttribute('data-wm-disabled', 'true');
            if (target === 'toggle' && element.hasAttribute('data-wm-hide-when-off')) {
              element.style.display = 'none';
            }
          } else {
            element.removeAttribute('data-wm-disabled');
            if (target === 'toggle' && element.hasAttribute('data-wm-hide-when-off')) {
              element.style.display = '';
            }
          }
          break;
        }

        case 'repeater':
        case 'media_list': {
          // Do not overwrite repeater container innerHTML with [object Object]
          break;
        }

        case 'date':
        case 'time':
        case 'datetime': {
          if (activeValue) {
            element.setAttribute('data-wm-date-value', String(activeValue));
          }
          setTextSafe(element, activeValue);
          break;
        }

        case 'text':
        case 'textarea':
        case 'number':
        case 'phone':
        case 'email':
        case 'select':
        case 'multiselect':
        case 'range':
        default: {
          if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
            if (element.tagName === 'INPUT' && element.type === 'file') {
              // Never set non-empty string on <input type="file">
            } else {
              try {
                element.value = activeValue !== undefined && activeValue !== null ? String(activeValue) : '';
              } catch (_) {}
            }
          } else if (key === 'sender_name') {
            if (hasValue) {
              const rawSender = String(value).trim();
              const origStartsDash = originalDomText.trim().startsWith('—');
              setTextSafe(element, origStartsDash && !rawSender.startsWith('—') ? `— ${rawSender}` : rawSender);
            } else {
              setTextSafe(element, defaultValue || originalDomText || '— Someone Special');
            }
          } else if (key === 'recipient_name') {
            setTextSafe(element, activeValue || originalDomText || 'Someone Special');
          } else if (key === 'custom_message') {
            setTextSafe(element, activeValue || originalDomText || 'May your day be filled with warm magic, sparkling smiles, and infinite moments of joy!');
          } else {
            if (hasValue || activeValue !== '') {
              setTextSafe(element, activeValue);
            } else if (originalDomText) {
              setTextSafe(element, originalDomText);
            }
          }
          break;
        }
      }
    });

    if (global.WishMagicRuntime) {
      try {
        if ((key === 'theme_variant' || bindingTarget === 'theme') && typeof global.WishMagicRuntime.applyThemeVariant === 'function' && value) {
          global.WishMagicRuntime.applyThemeVariant(String(value));
        } else if ((key === 'music_enabled' || bindingTarget === 'boolean') && typeof global.WishMagicRuntime.setMusicEnabled === 'function' && value !== undefined && value !== null) {
          global.WishMagicRuntime.setMusicEnabled(value, false);
        } else if (typeof global.WishMagicRuntime.applyFieldUpdate === 'function' && value !== undefined && value !== null && value !== '') {
          global.WishMagicRuntime.applyFieldUpdate(key, value);
        }
      } catch (_) {}
    }
  }

  /**
   * Apply entire dataset (including UTP v1.1.0 & v1.2.0 variant overrides, visibility removal, actions, messages, palette, and assets) to template
   */

  const DEFAULT_PLATFORM_BRANDING_FOOTER = {
    enabled: true,
    websiteName: 'WishMagic',
    brandIcon: '✨',
    badgeText: '✨ Official WishMagic Celebration Experience',
    tagline: 'Crafted with Love on WishMagic — Interactive 3D Celebration Studio',
    detailsText: 'Create personalized 3D wishes, polaroid memories & festival greetings for your loved ones in 60 seconds.',
    primaryBtnLabel: 'Create Your Own Wish ✨',
    primaryBtnLink: 'template.customize',
    secondaryBtnLabel: 'Explore All Templates ➔',
    secondaryBtnLink: 'global.explore',
    copyrightText: '© 2026 WishMagic • All Rights Reserved',
    showPrimaryBtn: true,
    showSecondaryBtn: true
  };

  let activePlatformBrandingFooter = Object.assign({}, DEFAULT_PLATFORM_BRANDING_FOOTER);

  function setPlatformBrandingFooterConfig(customBranding) {
    if (!customBranding || typeof customBranding !== 'object') return activePlatformBrandingFooter;
    activePlatformBrandingFooter = Object.assign({}, DEFAULT_PLATFORM_BRANDING_FOOTER, customBranding);
    return activePlatformBrandingFooter;
  }

  function getPlatformBrandingFooterConfig() {
    return Object.assign({}, activePlatformBrandingFooter);
  }

  /**
   * UTP v1.4.0 Host-Controlled Customization & Variant Switcher Enforcement:
   * Customization and variant selection happen exclusively on the WishMagic website/app after upload,
   * never via an in-template drawer or in-template relation bar.
   */
  function enforceHostControlledTemplateUi(doc) {
    const rootDoc = doc || document;
    if (!rootDoc || typeof rootDoc.querySelectorAll !== 'function') return;
    try {
      const forbiddenInTemplateSelectors = [
        '#wmCustomizerBackdrop',
        '#wmCustomizerPanel',
        '#wmOpenCustomizerBtn',
        '.wm-customizer-drawer-backdrop',
        '.wm-customizer-panel',
        '[data-wm-in-template-customizer]',
        '.wm-relation-bar',
        '#wmEligibilityModalBackdrop',
        '[data-wm-in-template-variants]',
        '#btn-theme-cycle'
      ];
      rootDoc.querySelectorAll(forbiddenInTemplateSelectors.join(', ')).forEach(el => {
        el.remove();
      });
    } catch (_) {}
  }

  /**
   * UTP v1.4.0 Platform Branding Footer Hydration:
   * The visual design lives inside the template (`[data-wm-platform-footer]`, hidden before upload),
   * while the WishMagic platform controls the text and activates it upon upload/preview/publish.
   */
  function applyBrandingFooterToDom(brandingOverride, contextData, targetDoc) {
    const doc = targetDoc || document;
    if (!doc || !doc.body || typeof doc.querySelector !== 'function') return;
    const rawBranding = (brandingOverride && typeof brandingOverride === 'object')
      ? brandingOverride
      : ((contextData && contextData.brandingFooter && typeof contextData.brandingFooter === 'object')
        ? contextData.brandingFooter
        : (global.__WM_BRANDING_FOOTER__ || activePlatformBrandingFooter));
    const cfg = Object.assign({}, DEFAULT_PLATFORM_BRANDING_FOOTER, rawBranding || {});

    let footerEl = doc.querySelector('[data-wm-platform-footer], #wm-platform-footer');
    if (cfg.enabled === false) {
      if (footerEl) {
        footerEl.setAttribute('hidden', 'hidden');
        footerEl.style.display = 'none';
      }
      return;
    }

    // Never inject a synthetic footer into host shell pages or templates that do not declare [data-wm-platform-footer]
    if (typeof doc.getElementById === 'function' && (doc.getElementById('live-template-viewport') || doc.getElementById('live-template-iframe'))) {
      if (footerEl) footerEl.remove();
      return;
    }
    if (!footerEl) {
      return;
    }
    if (footerEl.style && footerEl.style.zIndex === '35') {
      footerEl.style.zIndex = '1';
    }

    footerEl.removeAttribute('hidden');
    footerEl.style.display = '';
    footerEl.setAttribute('data-wm-footer-hydrated', 'true');

    const setSlot = (selector, val) => {
      const el = footerEl.querySelector(selector);
      if (!el) return;
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        setTextSafe(el, String(val));
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    };

    setSlot('[data-wm-brand-badge]', cfg.badgeText);
    setSlot('[data-wm-brand-icon], [data-wm-brand-logo]', cfg.brandIcon);
    setSlot('[data-wm-brand-name]', cfg.websiteName || cfg.brandName);
    setSlot('[data-wm-brand-tagline]', cfg.tagline);
    setSlot('[data-wm-brand-details], [data-wm-brand-note]', cfg.detailsText || cfg.footerNote);
    setSlot('[data-wm-brand-copyright]', cfg.copyrightText);

    const ctx = contextData || global.WishMagicData || {};
    const primaryBtn = footerEl.querySelector('[data-wm-brand-primary-btn], [data-wm-brand-cta]');
    if (primaryBtn) {
      if (cfg.showPrimaryBtn === false || !cfg.primaryBtnLabel) {
        primaryBtn.style.display = 'none';
      } else {
        primaryBtn.style.display = '';
        setTextSafe(primaryBtn, cfg.primaryBtnLabel);
        const pLink = cfg.primaryBtnLink || 'template.customize';
        const resolvedPrimary = pLink.startsWith('/') || pLink.startsWith('http')
          ? resolveClientInternalActionUrl(pLink, ctx)
          : resolveLogicalLink(pLink, ctx);
        if (primaryBtn.tagName === 'A' && resolvedPrimary) {
          primaryBtn.setAttribute('href', resolvedPrimary);
        }
      }
    }

    const secondaryBtn = footerEl.querySelector('[data-wm-brand-secondary-btn], [data-wm-brand-secondary-cta]');
    if (secondaryBtn) {
      if (cfg.showSecondaryBtn === false || !cfg.secondaryBtnLabel) {
        secondaryBtn.style.display = 'none';
      } else {
        secondaryBtn.style.display = '';
        setTextSafe(secondaryBtn, cfg.secondaryBtnLabel);
        const sLink = cfg.secondaryBtnLink || 'global.explore';
        const resolvedSecondary = sLink.startsWith('/') || sLink.startsWith('http')
          ? resolveClientInternalActionUrl(sLink, ctx)
          : resolveLogicalLink(sLink, ctx);
        if (secondaryBtn.tagName === 'A' && resolvedSecondary) {
          secondaryBtn.setAttribute('href', resolvedSecondary);
        }
      }
    }

    if (global.WishMagicRuntime && typeof global.WishMagicRuntime.applyBrandingFooter === 'function') {
      try { global.WishMagicRuntime.applyBrandingFooter(cfg); } catch (_) {}
    }
  }

  function checkRelationEligibility(relationSlug, enabledVariants, campaignAllowedVariants) {
    const normalized = String(relationSlug || '').trim().toLowerCase();
    const allowedList = Array.isArray(enabledVariants) && enabledVariants.length > 0
      ? enabledVariants.map(r => String(r).toLowerCase())
      : null;
    const campaignList = Array.isArray(campaignAllowedVariants) && campaignAllowedVariants.length > 0
      ? campaignAllowedVariants.map(r => String(r).toLowerCase())
      : null;
    if (allowedList && !allowedList.includes(normalized)) {
      return { eligible: false, code: 'VARIANT_DISABLED_OR_UNAVAILABLE', relationship: normalized, availableRelationships: allowedList };
    }
    if (campaignList && !campaignList.includes(normalized)) {
      return { eligible: false, code: 'VARIANT_NOT_ENABLED_FOR_CAMPAIGN', relationship: normalized, availableRelationships: campaignList };
    }
    return { eligible: true, code: 'ELIGIBLE', relationship: normalized };
  }

  let _isApplyingWishMagicData = false;
  let _isDispatchingDataUpdatedEvent = false;
  let _applyBurstWindowStart = 0;
  let _applyBurstCount = 0;
  let _lastAppliedPayloadSig = '';
  let _lastAppliedPayloadTime = 0;

  function computeFastPayloadSignature(data) {
    if (!data || typeof data !== 'object') return '';
    try {
      const f = data.fields || data.customData || data;
      const keys = Object.keys(f).slice(0, 24);
      let sig = (data.variantId || data.variant || '') + '|' + (data.relationshipSlug || data.relationship || '') + '|';
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = f[k];
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          sig += k + ':' + String(v).slice(0, 40) + ';';
        }
      }
      return sig;
    } catch (_) {
      return '';
    }
  }

  function applyData(data) {
    enforceHostControlledTemplateUi(document);
    // HARD CIRCUIT BREAKER:
    // 1. Block any re-entrant call or any call triggered from inside a 'wishmagic:data-updated' listener!
    if (_isApplyingWishMagicData || _isDispatchingDataUpdatedEvent || !data || typeof data !== 'object') {
      return;
    }
    // 2. Burst rate-limiter: prevent synchronous/asynchronous postMessage or MutationObserver echo loops (>8 calls in 60ms)
    const now = Date.now();
    if (now - _applyBurstWindowStart < 60) {
      _applyBurstCount++;
      if (_applyBurstCount > 8) {
        return;
      }
    } else {
      _applyBurstWindowStart = now;
      _applyBurstCount = 1;
    }
    // 3. Deduplicate identical back-to-back payloads within 40ms
    const sig = computeFastPayloadSignature(data);
    if (sig && sig === _lastAppliedPayloadSig && (now - _lastAppliedPayloadTime) < 40) {
      return;
    }
    _lastAppliedPayloadSig = sig;
    _lastAppliedPayloadTime = now;

    _isApplyingWishMagicData = true;
    try {

    // Mark parent sections that contain subsections before removal so empty-parent collapse knows which sections had subsections
    try {
      document.querySelectorAll('[data-wm-section]').forEach(secEl => {
        if (secEl.querySelector('[data-wm-subsection]')) {
          secEl.setAttribute('data-wm-had-subsections', 'true');
        }
      });
    } catch (_) {}

    // 0. Physically remove disabled sections & subsections from DOM first (UTP v1.2.0 strict requirement)
    removeDisabledContentFromDom(document, data);

    // 0a. Apply UTP v1.1.0 / v1.2.0 variant & relationship attributes on root html/body
    const variantId = data.variantId || data.variant_id || (data.variant && (data.variant.id || data.variant.slug)) || '';
    const relSlug = data.relationshipSlug || data.relationship_slug || data.relationship || (data.variant && (data.variant.relationshipSlug || data.variant.relationship)) || '';
    if (variantId && typeof variantId === 'string') {
      document.documentElement.setAttribute('data-wm-variant', variantId);
      if (document.body) document.body.setAttribute('data-wm-variant', variantId);
      if (global.WishMagicRuntime && typeof global.WishMagicRuntime.applyThemeVariant === 'function' && !data.theme_variant) {
        try { global.WishMagicRuntime.applyThemeVariant(variantId); } catch (_) {}
      }
    }
    if (relSlug && typeof relSlug === 'string') {
      document.documentElement.setAttribute('data-wm-relationship', relSlug);
      if (document.body) document.body.setAttribute('data-wm-relationship', relSlug);
    }

    // 0b. Apply variant messages & default assets first (so direct user keys in step 1 take higher precedence)
    const variantMessages = (data.messages && typeof data.messages === 'object')
      ? data.messages
      : (data.variant && data.variant.messages && typeof data.variant.messages === 'object' ? data.variant.messages : null);
    if (variantMessages) {
      Object.keys(variantMessages).forEach(msgKey => {
        if (data[msgKey] === undefined || data[msgKey] === null || data[msgKey] === '') {
          setWishMagicField(msgKey, variantMessages[msgKey], data);
        }
      });
    }

    const variantAssets = (data.assets && typeof data.assets === 'object')
      ? data.assets
      : (data.variant && data.variant.assets && typeof data.variant.assets === 'object' ? data.variant.assets : null);
    if (variantAssets) {
      Object.keys(variantAssets).forEach(assetKey => {
        if (data[assetKey] === undefined || data[assetKey] === null || data[assetKey] === '') {
          setWishMagicField(assetKey, variantAssets[assetKey], data);
        }
      });
    }

    // 1. Apply all direct keys in data (Customer Wish values override variant defaults)
    Object.keys(data).forEach(key => {
      if (['messages', 'assets', 'variant', 'colors', 'palette', 'sections', 'sectionsMap', '_hiddenSections', 'hiddenSections', '_hiddenFields', 'hiddenFields', '_isLiveCustomizerPreview', 'media', 'visibilityMap', 'disabledIds', 'enabledIds', 'actions', 'actionsMap', 'effectiveConfig'].includes(key)) return;
      setWishMagicField(key, data[key], data);
    });

    // 2. Special handling for photos array (e.g. photo_1, photo_2, gallery slots)
    const photosList = Array.isArray(data.photos)
      ? data.photos
      : (data.media && Array.isArray(data.media.photos) ? data.media.photos : []);

    if (photosList.length > 0) {
      photosList.forEach((photo, idx) => {
        const photoUrl = typeof photo === 'string' ? photo : (photo && (photo.displayUrl || photo.url || photo.src));
        if (photoUrl) {
          setWishMagicField(`photo_${idx + 1}`, photoUrl, data);
        }
      });
      const firstPhoto = typeof photosList[0] === 'string'
        ? photosList[0]
        : (photosList[0] && (photosList[0].displayUrl || photosList[0].url || photosList[0].src));
      if (firstPhoto) {
        setWishMagicField('photo_1', firstPhoto, data);
        if (!data.cover_photo) setWishMagicField('cover_photo', firstPhoto, data);
      }
      setWishMagicField('photos', photosList, data);
      setWishMagicField('gallery_photos', photosList, data);
    }

    if (data.cover_photo) {
      setWishMagicField('photo_1', data.cover_photo, data);
      setWishMagicField('cover_photo', data.cover_photo, data);
    }

    // 3. Background Music & Voice Note hydration
    const musicSrc = data.background_music ||
      (data.music && (data.music.url || data.music.src)) ||
      (data.media && data.media.music && data.media.music.enabled !== false && (data.media.music.src || data.media.music.url));
    if (musicSrc) {
      setWishMagicField('background_music', musicSrc, data);
      setWishMagicField('music', musicSrc, data);
    }

    const voiceSrc = (data.voice_note && (typeof data.voice_note === 'string' ? data.voice_note : (data.voice_note.url || data.voice_note.src))) ||
      (data.media && data.media.voiceNote && data.media.voiceNote.enabled && (data.media.voiceNote.src || data.media.voiceNote.url));
    if (voiceSrc) {
      setWishMagicField('voice_note', voiceSrc, data);
      setWishMagicField('voice', voiceSrc, data);
    }

    // 4. Colors, Palette & CSS custom properties
    const colorSource = (data.colors && typeof data.colors === 'object')
      ? data.colors
      : ((data.palette && typeof data.palette === 'object')
        ? data.palette
        : (data.theme && typeof data.theme === 'object' ? data.theme : (data.variant && data.variant.theme && typeof data.variant.theme === 'object' ? data.variant.theme : null)));
    if (colorSource) {
      if (colorSource.primary) document.documentElement.style.setProperty('--wm-primary', colorSource.primary);
      if (colorSource.secondary) document.documentElement.style.setProperty('--wm-secondary', colorSource.secondary);
      if (colorSource.accent) document.documentElement.style.setProperty('--wm-accent', colorSource.accent);
      if (colorSource.background) document.documentElement.style.setProperty('--wm-bg', colorSource.background);
      if (colorSource.text) document.documentElement.style.setProperty('--wm-text', colorSource.text);
    }

    // 5. Theme attribute synchronization
    const themeName = typeof data.theme === 'string'
      ? data.theme
      : (data.theme && typeof data.theme.preset === 'string' ? data.theme.preset : '');
    if (themeName) {
      document.documentElement.setAttribute('data-wm-theme', themeName);
      if (document.body) document.body.setAttribute('data-wm-theme', themeName);
    }

    // 6. Apply UTP v1.2.0 / v1.3.0 Action & Logical Link configurations (`data-wm-action` & `data-wm-link`)
    if (data.centralLinkConfig) {
      setCentralLinkConfig(data.centralLinkConfig);
    }
    applyActionsToDom(document, data, data);
    try {
      document.querySelectorAll('[data-wm-link]').forEach(el => {
        if (el.hasAttribute('data-wm-action') || el.hasAttribute('data-wm-button')) return;
        const linkId = el.getAttribute('data-wm-link');
        if (!linkId) return;
        const resolvedHref = resolveLogicalLink(linkId, data);
        if (!resolvedHref) return;
        if (el.tagName === 'A') el.setAttribute('href', resolvedHref);
        el.onclick = function (ev) {
          ev.preventDefault();
          try {
            if (window.top && window.top !== window) window.top.location.href = resolvedHref;
            else window.location.href = resolvedHref;
          } catch (_) {
            window.location.href = resolvedHref;
          }
        };
      });
    } catch (_) {}

    // 6b. Apply UTP v1.4.0 Platform Branding Footer (unhides [data-wm-platform-footer] and populates website-controlled text)
    if (data.brandingFooter) {
      setPlatformBrandingFooterConfig(data.brandingFooter);
    }
    applyBrandingFooterToDom(data.brandingFooter, data, document);

    // 7. Dispatch CustomEvent so template scripts (countdowns, carousels, particles) react immediately
    // Keep _isDispatchingDataUpdatedEvent = true during dispatch so if a legacy template calls
    // WishMagicTemplate.applyData() inside its 'wishmagic:data-updated' listener, it is safely ignored!
    try {
      global.WishMagicData = data;
      _isDispatchingDataUpdatedEvent = true;
      const evt = new CustomEvent('wishmagic:data-updated', { detail: data });
      window.dispatchEvent(evt);
      document.dispatchEvent(evt);
    } catch (_) {
    } finally {
      _isDispatchingDataUpdatedEvent = false;
    }
    } finally {
      _isApplyingWishMagicData = false;
    }
  }

  /**
   * Discover and extract full template capabilities from DOM metadata (including subsections & actions)
   */
  function getCapabilities() {
    const fields = [];
    const fieldMap = new Map();

    document.querySelectorAll('[data-wm-field], [data-wm]').forEach(el => {
      const fieldKey = el.getAttribute('data-wm-field') || el.getAttribute('data-wm');
      if (!fieldKey || fieldMap.has(fieldKey)) return;

      const fieldMeta = {
        key: fieldKey,
        label: el.getAttribute('data-wm-label') || fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        type: el.getAttribute('data-wm-type') || (el.tagName === 'IMG' ? 'image' : el.tagName === 'TEXTAREA' ? 'textarea' : 'text'),
        required: el.getAttribute('data-wm-required') === 'true',
        default: el.getAttribute('data-wm-default') || '',
        placeholder: el.getAttribute('data-wm-placeholder') || '',
        maxlength: el.getAttribute('data-wm-maxlength') ? parseInt(el.getAttribute('data-wm-maxlength'), 10) : null,
        section: el.getAttribute('data-wm-section') || el.closest('[data-wm-section]')?.getAttribute('data-wm-section') || 'main',
        subsection: el.getAttribute('data-wm-subsection') || el.closest('[data-wm-subsection]')?.getAttribute('data-wm-subsection') || null,
        group: el.getAttribute('data-wm-group') || 'personal'
      };

      const optionsAttr = el.getAttribute('data-wm-options');
      if (optionsAttr) {
        try {
          fieldMeta.options = JSON.parse(optionsAttr);
        } catch (e) {
          fieldMeta.options = optionsAttr.split(',').map(s => s.trim());
        }
      }

      fieldMap.set(fieldKey, fieldMeta);
      fields.push(fieldMeta);
    });

    const sections = [];
    document.querySelectorAll('[data-wm-section]').forEach(el => {
      const sectionKey = el.getAttribute('data-wm-section');
      if (!sectionKey) return;

      const subsections = [];
      el.querySelectorAll('[data-wm-subsection]').forEach(subEl => {
        const subKey = subEl.getAttribute('data-wm-subsection');
        if (!subKey) return;
        subsections.push({
          id: subKey,
          label: subEl.getAttribute('data-wm-label') || subKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          toggleable: subEl.getAttribute('data-wm-toggleable') !== 'false',
          defaultEnabled: subEl.getAttribute('data-wm-default-enabled') !== 'false'
        });
      });

      sections.push({
        id: sectionKey,
        name: el.getAttribute('data-wm-label') || sectionKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        toggleable: el.getAttribute('data-wm-toggleable') !== 'false',
        reorderable: el.getAttribute('data-wm-reorderable') === 'true',
        order: el.getAttribute('data-wm-order') ? parseInt(el.getAttribute('data-wm-order'), 10) : null,
        animation: el.getAttribute('data-wm-animation') ? el.getAttribute('data-wm-animation').split(',').map(s => s.trim()) : [],
        subsections
      });
    });

    const actions = [];
    document.querySelectorAll('[data-wm-action], [data-wm-button], [data-wm-cta]').forEach(el => {
      const actionId = el.getAttribute('data-wm-action') || el.getAttribute('data-wm-button') || el.getAttribute('data-wm-cta');
      if (!actionId) return;
      actions.push({
        id: actionId,
        label: el.getAttribute('data-wm-label') || (el.textContent || '').trim(),
        type: el.getAttribute('data-wm-action-type') || 'section',
        target: el.getAttribute('data-wm-action-target') || el.getAttribute('href') || ''
      });
    });

    const rootEl = document.documentElement;
    const bodyEl = document.body;

    const animations = (bodyEl?.getAttribute('data-wm-animations') || rootEl.getAttribute('data-wm-animations') || 'fade-up,soft-scale,cinematic').split(',').map(s => s.trim());
    const particles = (bodyEl?.getAttribute('data-wm-particles') || rootEl.getAttribute('data-wm-particles') || 'sparkles,confetti').split(',').map(s => s.trim());
    const themes = (bodyEl?.getAttribute('data-wm-themes') || rootEl.getAttribute('data-wm-themes') || 'magical,romantic,celebration').split(',').map(s => s.trim());

    if (global.WishMagicTemplateAnalyzer && typeof global.WishMagicTemplateAnalyzer.analyze === 'function') {
      return global.WishMagicTemplateAnalyzer.analyze();
    }

    return {
      protocol: rootEl.getAttribute('data-wm-protocol') || PROTOCOL_VERSION,
      templateRuntime: rootEl.getAttribute('data-wm-template-runtime') || PROTOCOL_VERSION,
      fields,
      sections,
      actions,
      animations,
      particles,
      themes,
      media: {
        images: fields.some(f => f.type === 'image' || f.type === 'image-multiple'),
        videos: fields.some(f => f.type === 'video' || f.type === 'video-multiple'),
        audio: fields.some(f => f.type === 'audio'),
        voice: fields.some(f => f.type === 'voice')
      }
    };
  }

  /**
   * Template validation utility
   */
  function validate() {
    const errors = [];
    const warnings = [];

    const fieldElements = document.querySelectorAll('[data-wm-field], [data-wm]');
    if (fieldElements.length === 0) {
      warnings.push({ code: 'NO_FIELDS_FOUND', message: 'No customizable fields declared in template.' });
    }

    fieldElements.forEach(el => {
      const key = el.getAttribute('data-wm-field') || el.getAttribute('data-wm');
      const type = el.getAttribute('data-wm-type');

      if (!type && !el.getAttribute('data-wm')) {
        errors.push({ field: key, message: `Field "${key}" is missing data-wm-type attribute.` });
      }

      if (el.tagName === 'IMG' && type && type !== 'image') {
        warnings.push({ field: key, message: `<img> tag declared with non-image type: "${type}".` });
      }
    });

    return {
      valid: errors.length === 0,
      protocol: PROTOCOL_VERSION,
      errors,
      warnings
    };
  }

  // Public API
  global.WishMagicTemplate = {
    version: SCHEMA_VERSION,
    utpVersion: '1.4.0',
    UTP_VERSION: '1.4.0',
    supportedVersions: ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0'],
    PROTOCOL_VERSION,
    SCHEMA_VERSION,
    RUNTIME_API_VERSION,
    getCapabilities,
    validate,
    applyData,
    setField: setWishMagicField,
    removeDisabledContentFromDom,
    applyActionsToDom,
    resolveClientInternalActionUrl,
    resolveLogicalLink,
    setCentralLinkConfig,
    getActiveCentralLinkConfig,
    applyBrandingFooterToDom,
    setPlatformBrandingFooterConfig,
    getPlatformBrandingFooterConfig,
    enforceHostControlledTemplateUi,
    checkRelationEligibility
  };

  global.validateWishMagicTemplate = validate;
  global.setWishMagicField = setWishMagicField;

  // Auto-listen to incoming postMessage data from customizer or parent iframe
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('message', (event) => {
    if (event.source === window) return; // UTP v1.4.0 Anti-Hang #3: ignore self-echo postMessages
    if (!event.data || typeof event.data !== 'object') return;
    if (
      event.data.type === 'WISHMAGIC_INIT' ||
      event.data.type === 'WISHMAGIC_LIVE_UPDATE' ||
      event.data.type === 'WISHMAGIC_UPDATE'
    ) {
      applyData(event.data.payload || event.data);
    } else if (event.data.type === 'WISHMAGIC_BRANDING_FOOTER') {
      const bf = event.data.brandingFooter || event.data.payload || event.data;
      setPlatformBrandingFooterConfig(bf);
      applyBrandingFooterToDom(bf, global.WishMagicData || {}, document);
    }
  });
  }

  function installTemplateBrokenImageGuard(rootDoc) {
    const doc = rootDoc || document;
    if (!doc || doc._wmBrokenImgGuardInstalled) return;
    doc._wmBrokenImgGuardInstalled = true;

    const getTplIdFromEnv = () => {
      try {
        if (global.__WM_PREVIEW_TEMPLATE_ID__) return global.__WM_PREVIEW_TEMPLATE_ID__;
        if (global.WishMagicData && (global.WishMagicData.templateId || global.WishMagicData.template_id)) {
          return global.WishMagicData.templateId || global.WishMagicData.template_id;
        }
        const htmlTpl = doc.documentElement && doc.documentElement.getAttribute('data-wm-template-id');
        if (htmlTpl) return htmlTpl;
        const m = String(doc.location && doc.location.pathname || '').match(/\/api\/templates\/([^/]+)\/versions\/([^/]+)\/preview\//);
        if (m) return m[1];
        const up = new URLSearchParams(String(doc.location && doc.location.search || ''));
        return up.get('template') || up.get('id') || '';
      } catch (_) {
        return '';
      }
    };

    const getVerIdFromEnv = () => {
      try {
        if (global.__WM_PREVIEW_VERSION_ID__) return global.__WM_PREVIEW_VERSION_ID__;
        const m = String(doc.location && doc.location.pathname || '').match(/\/api\/templates\/([^/]+)\/versions\/([^/]+)\/preview\//);
        return m ? m[2] : '';
      } catch (_) {
        return '';
      }
    };

    const healImgElement = (img) => {
      if (!img || img.tagName !== 'IMG' || img.dataset.wmImgHealed === '1') return;
      const src = String(img.getAttribute('src') || img.src || '').trim();
      if (!src || src.startsWith('data:') || src.includes('/api/media/safe-img')) return;
      const isIbb = src.includes('ibb.co/');
      const isUnavailablePlaceholder = isIbb && img.complete && img.naturalWidth > 0 && img.naturalWidth <= 220 && img.naturalHeight > 0 && img.naturalHeight <= 220 && Math.abs(img.naturalWidth - img.naturalHeight) <= 4;
      const isBroken = img.complete && img.naturalWidth === 0 && src.length > 0;
      if (isUnavailablePlaceholder || (isIbb && isBroken)) {
        img.dataset.wmImgHealed = '1';
        const tplId = img.getAttribute('data-wm-tpl-id') || getTplIdFromEnv();
        const verId = getVerIdFromEnv();
        img.src = '/api/media/safe-img?u=' + encodeURIComponent(src) + (tplId ? '&tpl=' + encodeURIComponent(tplId) : '') + (verId ? '&ver=' + encodeURIComponent(verId) : '');
      }
    };

    if (typeof doc.addEventListener === 'function') {
      doc.addEventListener('load', (e) => {
        if (e && e.target && e.target.tagName === 'IMG') healImgElement(e.target);
      }, true);

      doc.addEventListener('error', (e) => {
        const img = e && e.target;
        if (!img || img.tagName !== 'IMG' || img.dataset.wmImgHealed === '1') return;
        const src = String(img.getAttribute('src') || img.src || '').trim();
        if (!src || src.startsWith('data:') || src.includes('/api/media/safe-img')) return;
        img.dataset.wmImgHealed = '1';
        const tplId = img.getAttribute('data-wm-tpl-id') || getTplIdFromEnv();
        const verId = getVerIdFromEnv();
        img.src = '/api/media/safe-img?u=' + encodeURIComponent(src) + (tplId ? '&tpl=' + encodeURIComponent(tplId) : '') + (verId ? '&ver=' + encodeURIComponent(verId) : '');
      }, true);
    }

    const scanAll = () => {
      try {
        if (typeof doc.querySelectorAll === 'function') {
          doc.querySelectorAll('img').forEach(healImgElement);
        }
      } catch (_) {}
    };
    scanAll();
    if (typeof setTimeout === 'function' && typeof doc.addEventListener === 'function') {
      setTimeout(scanAll, 600);
      setTimeout(scanAll, 1800);
    }
  }

  // Auto-hydrate if window.WishMagicData is preset (skip host wrapper shells like template-preview.html)
  const isHostPreviewShell = () => Boolean(
    typeof document !== 'undefined' &&
    typeof document.getElementById === 'function' &&
    (document.getElementById('live-template-viewport') || document.getElementById('live-template-iframe'))
  );
  if (typeof document !== 'undefined' && document.readyState === 'loading' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', () => {
      installTemplateBrokenImageGuard(document);
      if (isHostPreviewShell()) return;
      enforceHostControlledTemplateUi(document);
      if (global.WishMagicData) applyData(global.WishMagicData);
      else applyBrandingFooterToDom(global.__WM_BRANDING_FOOTER__, {}, document);
    });
  } else if (typeof document !== 'undefined') {
    installTemplateBrokenImageGuard(document);
    if (!isHostPreviewShell()) {
      enforceHostControlledTemplateUi(document);
      if (global.WishMagicData) applyData(global.WishMagicData);
      else applyBrandingFooterToDom(global.__WM_BRANDING_FOOTER__, {}, document);
    }
  }

})(typeof window !== 'undefined' ? window : this);
