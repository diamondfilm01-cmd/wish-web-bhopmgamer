/**
 * WishMagic Template Runtime (Part 4)
 * =============================================================
 * Template-side execution engine that receives structured messages from
 * WishMagicRuntimeBridge, applies safe updates to matching data-wm-field
 * targets, manages single-interval countdowns, controls section visibility,
 * and maintains clean state without arbitrary DOM rewriting.
 */

(function (global) {
  'use strict';

  const PROTOCOL_VERSION = '1.0';

  const ALLOWED_MESSAGE_TYPES = new Set([
    'WISHMAGIC_INIT',
    'WISHMAGIC_STATE',
    'WISHMAGIC_UPDATE',
    'WISHMAGIC_SECTION',
    'WISHMAGIC_SECTION_LAYOUT',
    'WISHMAGIC_SECTION_ORDER',
    'WISHMAGIC_THEME',
    'WISHMAGIC_COLOR',
    'WISHMAGIC_BACKGROUND',
    'WISHMAGIC_SURFACE',
    'WISHMAGIC_BUTTON_STYLE',
    'WISHMAGIC_TYPOGRAPHY',
    'WISHMAGIC_RADIUS',
    'WISHMAGIC_INTENSITY',
    'WISHMAGIC_CUSTOM_VISUAL',
    'WISHMAGIC_VISUAL_RESET',
    'WISHMAGIC_ANIMATION',
    'WISHMAGIC_SECTION_ANIMATION',
    'WISHMAGIC_TEXT_ANIMATION',
    'WISHMAGIC_MEDIA_ANIMATION',
    'WISHMAGIC_PARTICLES',
    'WISHMAGIC_INTERACTIVE_EFFECT',
    'WISHMAGIC_AMBIENT_EFFECT',
    'WISHMAGIC_CUSTOM_ANIMATION',
    'WISHMAGIC_ANIMATION_RESET',
    'WISHMAGIC_REPLAY_INTRO',
    'WISHMAGIC_MEDIA',
    'WISHMAGIC_MEDIA_ORDER',
    'WISHMAGIC_MEDIA_SETTINGS',
    'WISHMAGIC_RESET',
    'WISHMAGIC_LIVE_UPDATE'
  ]);

  let runtimeState = {};
  let defaultState = {};
  let activeCountdownInterval = null;
  let boundMessageListener = null;

  function getDocument() {
    if (typeof document !== 'undefined' && document) return document;
    if (global && global.document) return global.document;
    if (typeof window !== 'undefined' && window && window.document) return window.document;
    return null;
  }

  function emitEvent(name, detail = {}) {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent(name, { detail }));
      } catch (e) {}
    }
  }

  function setTextSafe(el, text) {
    if (!el) return;
    el.textContent = text !== undefined && text !== null ? String(text) : '';
  }

  function setImageSafe(el, src) {
    if (!el) return;
    const defaultSrc = el.getAttribute('data-wm-default-src') || el.getAttribute('data-wm-default') || el.getAttribute('src') || '/assets/file_ab2082.png';
    const finalSrc = src || defaultSrc;

    if (src) {
      el.src = src;
      el.removeAttribute('data-wm-empty');
    } else {
      el.src = defaultSrc;
      el.setAttribute('data-wm-empty', 'true');
    }
  }

  const WishMagicRuntime = {
    PROTOCOL_VERSION,

    /**
     * Initialize Template Runtime and capture default template state
     */
    init(data = {}) {
      const doc = getDocument();
      // Capture default values from DOM on first run
      if (doc && Object.keys(defaultState).length === 0) {
        doc.querySelectorAll('[data-wm-field], [data-wm]').forEach(el => {
          const key = el.getAttribute('data-wm-field') || el.getAttribute('data-wm');
          if (key && !defaultState[key]) {
            defaultState[key] = el.getAttribute('data-wm-default') || (el.tagName === 'IMG' ? el.src : el.textContent.trim());
          }
        });
      }

      this.updateState(data, 'init');
      emitEvent('wishmagic:ready', { protocol: PROTOCOL_VERSION });
      return this;
    },

    /**
     * Get read-only cloned state snapshot
     */
    getState() {
      return JSON.parse(JSON.stringify(runtimeState));
    },

    /**
     * Update entire state
     */
    updateState(data, source = 'bridge') {
      if (!data || typeof data !== 'object') return;

      const mergedData = { ...runtimeState, ...data };

      // Apply each field
      Object.keys(mergedData).forEach(key => {
        this.updateField(key, mergedData[key], source);
      });

      // Special handling for photo lists
      if (Array.isArray(mergedData.photos)) {
        mergedData.photos.forEach((photo, idx) => {
          const url = typeof photo === 'string' ? photo : (photo && (photo.url || photo.src));
          if (url) this.updateField(`photo_${idx + 1}`, url, source);
        });
      }

      // Special handling for theme & colors
      if (mergedData.theme) {
        this.updateTheme(mergedData.theme, mergedData.colors);
      } else if (mergedData.colors) {
        this.updateColors(mergedData.colors);
      }

      // Special handling for sections (Spec 29, 44, 45)
      if (mergedData.sections && typeof mergedData.sections === 'object') {
        Object.keys(mergedData.sections).forEach(secKey => {
          const val = mergedData.sections[secKey];
          if (typeof val === 'boolean') {
            this.updateSection(secKey, val);
          } else if (val && typeof val === 'object') {
            if (val.enabled !== undefined) {
              this.updateSection(secKey, val.enabled);
            }
            if (val.layout) {
              this.updateSectionLayout(secKey, val.layout);
            }
          }
        });
      }

      // Special handling for section order (Spec 10, 43, 46)
      if (Array.isArray(mergedData.sectionOrder)) {
        this.updateSectionOrder(mergedData.sectionOrder);
      }

      // Special handling for WishMagicData.media (Part 8 - Spec 43, 50, 53)
      if (mergedData.media && typeof mergedData.media === 'object') {
        Object.keys(mergedData.media).forEach(mediaId => {
          this.updateMedia(mediaId, 'set', mergedData.media[mediaId], source);
        });
      }

      // Special handling for WishMagicData.mediaSettings (Part 8 - Spec 77)
      if (mergedData.mediaSettings && typeof mergedData.mediaSettings === 'object') {
        Object.keys(mergedData.mediaSettings).forEach(mediaId => {
          this.updateMediaSettings(mediaId, mergedData.mediaSettings[mediaId]);
        });
      }

      emitEvent('wishmagic:state-applied', { source });
    },

    /**
     * Update single field targets
     */
    updateField(key, value, source = 'bridge') {
      const doc = getDocument();
      if (!key || !doc) return;

      runtimeState[key] = value;

      // Check optional template hook
      if (global.WishMagicTemplateHooks && typeof global.WishMagicTemplateHooks.onFieldUpdate === 'function') {
        try {
          const handled = global.WishMagicTemplateHooks.onFieldUpdate(key, value);
          if (handled === true) {
            emitEvent('wishmagic:field-updated', { key, value, source });
            return;
          }
        } catch (err) {
          console.warn('WishMagicTemplateHooks.onFieldUpdate error:', err);
        }
      }

      const elements = doc.querySelectorAll(`[data-wm-field="${key}"], [data-wm="${key}"]`);
      if (elements.length === 0) return;

      elements.forEach(el => {
        const type = el.getAttribute('data-wm-type') || (el.tagName === 'IMG' ? 'image' : el.tagName === 'AUDIO' ? 'audio' : el.tagName === 'VIDEO' ? 'video' : 'text');

        switch (type) {
          case 'image':
            if (el.tagName === 'IMG') {
              setImageSafe(el, value);
            } else {
              el.style.backgroundImage = value ? `url("${value}")` : '';
            }
            break;

          case 'video':
            if (el.tagName === 'VIDEO') {
              if (value && el.src !== value) {
                el.src = value;
                try {
                  el.load();
                } catch (e) {}
              }
            }
            break;

          case 'audio':
            if (el.tagName === 'AUDIO') {
              if (value && el.src !== value) {
                el.src = value;
                try {
                  el.load();
                } catch (e) {}
              }
            }
            break;

          case 'color':
            if (key.includes('primary')) document.documentElement.style.setProperty('--wm-primary', value);
            else if (key.includes('secondary')) document.documentElement.style.setProperty('--wm-secondary', value);
            else if (key.includes('accent')) document.documentElement.style.setProperty('--wm-accent', value);
            break;

          case 'text':
          case 'textarea':
          case 'date':
          case 'time':
          case 'datetime':
          default:
            if (key === 'sender_name') {
              setTextSafe(el, value ? `— ${value}` : '— Someone Special');
            } else if (key === 'recipient_name') {
              setTextSafe(el, value || 'Someone Special');
            } else if (key === 'custom_message') {
              setTextSafe(el, value || 'May your day be filled with warm magic, sparkling smiles, and infinite moments of joy!');
            } else {
              setTextSafe(el, value);
            }
            break;
        }
      });

      // Handle countdown dependency if date changed
      if (key === 'event_date') {
        this.updateCountdown(value);
      }

      emitEvent('wishmagic:field-updated', { key, value, source });
    },

    /**
     * Controlled Media Update (Part 8 - Spec 50, 51, 52, 53)
     */
    updateMedia(mediaId, action = 'set', mediaOrItems = null, source = 'bridge') {
      const doc = getDocument();
      if (!mediaId || !doc) return false;

      if (!runtimeState.media) runtimeState.media = {};

      const elements = doc.querySelectorAll(`[data-wm-media="${mediaId}"], [data-wm-field="${mediaId}"]`);

      if (action === 'remove') {
        // Required check (Spec 51)
        let isRequired = false;
        elements.forEach(el => {
          if (el.getAttribute('data-wm-required') === 'true') isRequired = true;
        });

        if (isRequired) {
          console.warn(`[WishMagicRuntime] Cannot remove required media "${mediaId}".`);
          return false;
        }

        delete runtimeState.media[mediaId];

        elements.forEach(el => {
          if (el.tagName === 'IMG') {
            setImageSafe(el, '');
          } else if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
            el.src = '';
            el.removeAttribute('src');
          } else {
            el.style.backgroundImage = '';
          }
          el.setAttribute('data-wm-empty', 'true');
        });

        emitEvent('wishmagic:media-updated', { mediaId, action: 'remove', source });
        return true;
      }

      // Set action
      runtimeState.media[mediaId] = mediaOrItems;

      if (Array.isArray(mediaOrItems)) {
        // Gallery / Multi-item
        elements.forEach(el => {
          // If template has container with img children or dynamic items
          const container = el.querySelector ? (el.querySelector('[data-wm-gallery-items]') || el) : el;
          if (container && container.children) {
            // Apply photos to existing slot elements if present
            const childImgs = container.querySelectorAll ? Array.from(container.querySelectorAll('img')) : [];
            mediaOrItems.forEach((item, idx) => {
              const url = typeof item === 'string' ? item : (item && item.url);
              if (childImgs[idx] && url) {
                setImageSafe(childImgs[idx], url);
              }
            });
          }
        });
      } else {
        // Single media item
        const url = typeof mediaOrItems === 'string' ? mediaOrItems : (mediaOrItems && mediaOrItems.url);
        elements.forEach(el => {
          if (el.tagName === 'IMG') {
            setImageSafe(el, url);
            if (mediaOrItems && mediaOrItems.alt) {
              el.alt = mediaOrItems.alt;
            }
          } else if (el.tagName === 'VIDEO') {
            if (url && el.src !== url) {
              el.src = url;
              try { el.load(); } catch (e) {}
            }
          } else if (el.tagName === 'AUDIO') {
            if (url && el.src !== url) {
              el.src = url;
              try { el.load(); } catch (e) {}
            }
          } else {
            el.style.backgroundImage = url ? `url("${url}")` : '';
          }
        });
      }

      emitEvent('wishmagic:media-updated', { mediaId, action: 'set', media: mediaOrItems, source });
      return true;
    },

    /**
     * Media Order Update (Part 8 - Spec 54)
     */
    updateMediaOrder(mediaId, orderIds) {
      if (!mediaId || !Array.isArray(orderIds)) return false;
      if (!runtimeState.media || !Array.isArray(runtimeState.media[mediaId])) return false;

      const currentItems = runtimeState.media[mediaId];
      const itemMap = new Map();
      currentItems.forEach(item => {
        const id = item.id || item.url;
        itemMap.set(id, item);
      });

      const reordered = [];
      orderIds.forEach(id => {
        if (itemMap.has(id)) {
          reordered.push(itemMap.get(id));
        }
      });

      runtimeState.media[mediaId] = reordered;
      this.updateMedia(mediaId, 'set', reordered);
      emitEvent('wishmagic:media-order-updated', { mediaId, order: orderIds });
      return true;
    },

    /**
     * Media Settings Update (Part 8 - Spec 77)
     */
    updateMediaSettings(mediaId, settings) {
      const doc = getDocument();
      if (!mediaId || !settings || typeof settings !== 'object' || !doc) return false;

      if (!runtimeState.mediaSettings) runtimeState.mediaSettings = {};
      runtimeState.mediaSettings[mediaId] = { ...(runtimeState.mediaSettings[mediaId] || {}), ...settings };

      const elements = doc.querySelectorAll(`[data-wm-media="${mediaId}"]`);
      elements.forEach(el => {
        if (settings.fit) {
          el.style.objectFit = settings.fit;
        }
        if (settings.position) {
          el.style.objectPosition = settings.position;
        }
      });

      emitEvent('wishmagic:media-settings-updated', { mediaId, settings });
      return true;
    },

    /**
     * Controlled Section Visibility with Non-Toggleable & Required Protection
     * (Spec 4, 5, 12, 13, 44, 45)
     */
    updateSection(key, enabled) {
      const doc = getDocument();
      if (!key || !doc) return false;

      const secEl = doc.querySelector(`[data-wm-section="${key}"]`);
      if (!secEl) return false;

      const isRequired = secEl.getAttribute('data-wm-required') === 'true';
      const isToggleable = secEl.getAttribute('data-wm-toggleable') !== 'false';

      // Required section cannot be disabled (Spec 4)
      if (isRequired && enabled === false) {
        console.warn(`[WishMagicRuntime] Section "${key}" is required and cannot be disabled.`);
        return false;
      }

      // Non-toggleable section cannot be disabled (Spec 5)
      if (!isToggleable && enabled === false) {
        console.warn(`[WishMagicRuntime] Section "${key}" is not toggleable and cannot be disabled.`);
        return false;
      }

      const shouldEnable = Boolean(enabled);

      if (!shouldEnable) {
        secEl.hidden = true;
        secEl.setAttribute('data-wm-enabled', 'false');
        secEl.setAttribute('data-wm-hidden', 'true');
        secEl.style.display = 'none';
      } else {
        secEl.hidden = false;
        secEl.setAttribute('data-wm-enabled', 'true');
        secEl.removeAttribute('data-wm-hidden');
        secEl.style.display = '';
      }

      // Store in runtime state
      if (!runtimeState.sections) runtimeState.sections = {};
      if (!runtimeState.sections[key]) runtimeState.sections[key] = {};
      runtimeState.sections[key].enabled = shouldEnable;

      // Check optional template hooks (Spec 53)
      if (global.WishMagicTemplateHooks) {
        if (typeof global.WishMagicTemplateHooks.onSectionVisibilityUpdate === 'function') {
          try {
            global.WishMagicTemplateHooks.onSectionVisibilityUpdate(key, shouldEnable);
          } catch (e) {}
        }
        if (typeof global.WishMagicTemplateHooks.onSectionUpdate === 'function') {
          try {
            global.WishMagicTemplateHooks.onSectionUpdate(key, shouldEnable);
          } catch (e) {}
        }
      }

      emitEvent('wishmagic:section-updated', { key, enabled: shouldEnable });
      return true;
    },

    /**
     * Controlled Section Layout Updating with Strict Capability Validation
     * (Spec 16, 17, 18, 52, 53, 54)
     */
    updateSectionLayout(sectionId, layout) {
      const doc = getDocument();
      if (!sectionId || !layout || !doc) return false;

      const secEl = doc.querySelector(`[data-wm-section="${sectionId}"]`);
      if (!secEl) {
        console.warn(`[WishMagicRuntime] Section "${sectionId}" not found for layout update.`);
        return false;
      }

      // Check declared layouts (Spec 18)
      const rawLayouts = secEl.getAttribute('data-wm-layouts') || '';
      const declaredLayouts = rawLayouts
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

      const targetLayout = String(layout).trim().toLowerCase();

      // If template declared layouts, reject unsupported layout (Spec 18)
      if (declaredLayouts.length > 0 && !declaredLayouts.includes(targetLayout)) {
        console.warn(`[WishMagicRuntime] Rejected invalid layout "${layout}" for section "${sectionId}". Declared layouts: [${declaredLayouts.join(', ')}]`);
        return false;
      }

      // 1. Check optional template hook (Spec 53)
      let customHandled = false;
      if (global.WishMagicTemplateHooks && typeof global.WishMagicTemplateHooks.onSectionLayoutUpdate === 'function') {
        try {
          const res = global.WishMagicTemplateHooks.onSectionLayoutUpdate(sectionId, targetLayout);
          if (res !== false) customHandled = true;
        } catch (e) {
          console.warn('WishMagicTemplateHooks.onSectionLayoutUpdate error:', e);
        }
      }

      // 2. Generic fallback (Spec 54)
      secEl.dataset.wmLayout = targetLayout;
      secEl.setAttribute('data-wm-layout', targetLayout);

      // Store in runtime state
      if (!runtimeState.sections) runtimeState.sections = {};
      if (!runtimeState.sections[sectionId]) runtimeState.sections[sectionId] = {};
      runtimeState.sections[sectionId].layout = targetLayout;

      emitEvent('wishmagic:section-layout-updated', { section: sectionId, layout: targetLayout });
      return true;
    },

    /**
     * Controlled Section Reordering with Safe Normalization and DOM preservation
     * (Spec 9, 10, 43, 45, 46, 47, 48, 49)
     */
    updateSectionOrder(incomingOrder) {
      const doc = getDocument();
      if (!Array.isArray(incomingOrder) || !doc) return false;

      // Find all declared section roots in DOM
      const allSecElements = Array.from(doc.querySelectorAll('[data-wm-section]'));
      if (allSecElements.length === 0) return false;

      const declaredSecMap = new Map();
      const declaredOriginalOrder = [];
      const fixedStart = [];
      const fixedEnd = [];

      allSecElements.forEach((el) => {
        const secId = el.getAttribute('data-wm-section');
        if (!secId) return;
        if (!declaredSecMap.has(secId)) {
          declaredSecMap.set(secId, el);
          declaredOriginalOrder.push(secId);
          const fixedPos = (el.getAttribute('data-wm-fixed-position') || '').toLowerCase();
          if (fixedPos === 'start') fixedStart.push(secId);
          if (fixedPos === 'end') fixedEnd.push(secId);
        }
      });

      // Filter and normalize incomingOrder (Spec 46, 47)
      const validSeen = new Set();
      const normalized = [];

      // 1. Fixed-start sections always first (Spec 37, 38)
      fixedStart.forEach(id => {
        if (!validSeen.has(id) && declaredSecMap.has(id)) {
          normalized.push(id);
          validSeen.add(id);
        }
      });

      // 2. Add incoming valid declared IDs
      incomingOrder.forEach(rawId => {
        const id = String(rawId).trim();
        if (declaredSecMap.has(id) && !validSeen.has(id) && !fixedEnd.includes(id)) {
          normalized.push(id);
          validSeen.add(id);
        }
      });

      // 3. Restore any declared sections missing from incoming order (Spec 47)
      declaredOriginalOrder.forEach(id => {
        if (!validSeen.has(id) && !fixedEnd.includes(id)) {
          normalized.push(id);
          validSeen.add(id);
        }
      });

      // 4. Fixed-end sections always last (Spec 37, 38)
      fixedEnd.forEach(id => {
        if (!validSeen.has(id) && declaredSecMap.has(id)) {
          normalized.push(id);
          validSeen.add(id);
        }
      });

      // Apply reordering in DOM without rebuilding innerHTML (Spec 52)
      normalized.forEach(secId => {
        const secEl = declaredSecMap.get(secId);
        if (secEl && secEl.parentNode) {
          secEl.parentNode.appendChild(secEl);
        }
      });

      // Custom hook
      if (global.WishMagicTemplateHooks && typeof global.WishMagicTemplateHooks.onSectionOrderUpdate === 'function') {
        try {
          global.WishMagicTemplateHooks.onSectionOrderUpdate(normalized);
        } catch (e) {
          console.warn('WishMagicTemplateHooks.onSectionOrderUpdate error:', e);
        }
      }

      runtimeState.sectionOrder = [...normalized];
      emitEvent('wishmagic:section-order-updated', { order: normalized });
      return true;
    },

    /**
     * Controlled Theme & Color Updating (Spec 7, 8, 45, 46, 47)
     */
    setTheme(themeName, colors) {
      return this.updateTheme(themeName, colors);
    },

    updateTheme(themeName, colors) {
      const doc = getDocument();
      if (!doc || !themeName) return false;

      const targetTheme = String(themeName).trim().toLowerCase();

      // Validate against declared template themes if present (Spec 7)
      const rawThemes = (
        doc.body?.getAttribute?.('data-wm-themes') ||
        doc.documentElement?.getAttribute?.('data-wm-themes') ||
        doc.body?.getAttribute?.('data-wm-theme') ||
        doc.documentElement?.getAttribute?.('data-wm-theme') ||
        ''
      );
      if (rawThemes) {
        const declared = rawThemes.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (declared.length > 0 && !declared.includes(targetTheme)) {
          console.warn(`[WishMagicRuntime] Theme "${themeName}" rejected. Not in template declared themes: [${declared.join(', ')}]`);
          return false;
        }
      }

      // Safe DOM application (Spec 45)
      doc.documentElement.dataset.wmTheme = targetTheme;
      doc.documentElement.setAttribute('data-wm-theme', targetTheme);

      if (!runtimeState.visual) runtimeState.visual = {};
      runtimeState.visual.theme = targetTheme;

      if (colors && typeof colors === 'object') {
        this.updateColors(colors);
      }

      // Template Hook (Spec 8, 46)
      if (global.WishMagicTemplateHooks) {
        if (typeof global.WishMagicTemplateHooks.onThemeChange === 'function') {
          try {
            global.WishMagicTemplateHooks.onThemeChange(targetTheme);
          } catch (e) {}
        } else if (typeof global.WishMagicTemplateHooks.onThemeUpdate === 'function') {
          try {
            global.WishMagicTemplateHooks.onThemeUpdate(targetTheme);
          } catch (e) {}
        }
      }

      emitEvent('wishmagic:theme-updated', { theme: targetTheme });
      return true;
    },

    /**
     * Sanitize color string against injection (Spec 13, 56, 57)
     */
    sanitizeColor(val) {
      if (!val || typeof val !== 'string') return null;
      const s = val.trim();
      if (/^(javascript:|data:|url\(|<|>|expression\()/i.test(s)) {
        return null;
      }
      // Hex, rgb/rgba, hsl/hsla
      if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s;
      if (/^(rgb|hsl)a?\(\s*[\d.%\s,/]+\)$/i.test(s)) return s;
      // Named CSS colors
      if (/^[a-zA-Z]{3,20}$/.test(s)) return s;
      return null;
    },

    /**
     * Update dynamic CSS variables for colors (Spec 9, 10, 11, 12, 13, 47)
     */
    updateColors(colors) {
      const doc = getDocument();
      if (!colors || typeof colors !== 'object' || !doc) return;

      const allowedColorKeys = ['primary', 'secondary', 'accent', 'glow', 'text', 'background', 'surface', 'muted', 'border'];

      if (!runtimeState.visual) runtimeState.visual = {};
      if (!runtimeState.visual.colors) runtimeState.visual.colors = {};

      Object.keys(colors).forEach(key => {
        const cleanKey = key.toLowerCase();
        if (!allowedColorKeys.includes(cleanKey)) return;

        const rawVal = colors[key];
        if (rawVal === null || rawVal === '') {
          // Reset specific color override (Spec 31)
          doc.documentElement.style.removeProperty(`--wm-${cleanKey}`);
          delete runtimeState.visual.colors[cleanKey];
          if (global.WishMagicTemplateHooks && typeof global.WishMagicTemplateHooks.onColorChange === 'function') {
            try { global.WishMagicTemplateHooks.onColorChange(cleanKey, null); } catch (e) {}
          }
          return;
        }

        const safeVal = this.sanitizeColor(rawVal);
        if (safeVal) {
          doc.documentElement.style.setProperty(`--wm-${cleanKey}`, safeVal);
          runtimeState.visual.colors[cleanKey] = safeVal;
          if (global.WishMagicTemplateHooks && typeof global.WishMagicTemplateHooks.onColorChange === 'function') {
            try { global.WishMagicTemplateHooks.onColorChange(cleanKey, safeVal); } catch (e) {}
          }
        }
      });
    },

    /**
     * Controlled Background Updating (Spec 14, 15, 16, 45, 46)
     */
    setBackground(background) {
      const doc = getDocument();
      if (!doc || !background) return false;

      const targetBg = String(background).trim().toLowerCase();

      // Validate against template declared backgrounds
      const rawBgs = (
        doc.body?.getAttribute?.('data-wm-backgrounds') ||
        doc.documentElement?.getAttribute?.('data-wm-backgrounds') ||
        ''
      );
      if (rawBgs) {
        const declared = rawBgs.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (declared.length > 0 && !declared.includes(targetBg)) {
          console.warn(`[WishMagicRuntime] Background "${background}" rejected. Not in template declared backgrounds: [${declared.join(', ')}]`);
          return false;
        }
      }

      doc.documentElement.dataset.wmBackground = targetBg;
      doc.documentElement.setAttribute('data-wm-background', targetBg);

      if (!runtimeState.visual) runtimeState.visual = {};
      runtimeState.visual.background = targetBg;

      if (global.WishMagicTemplateHooks && typeof global.WishMagicTemplateHooks.onBackgroundChange === 'function') {
        try { global.WishMagicTemplateHooks.onBackgroundChange(targetBg); } catch (e) {}
      }

      emitEvent('wishmagic:background-updated', { background: targetBg });
      return true;
    },

    /**
     * Controlled Surface Updating (Spec 18, 19, 45, 46)
     */
    setSurface(surface) {
      const doc = getDocument();
      if (!doc || !surface) return false;

      const targetSurface = String(surface).trim().toLowerCase();

      // Validate against template declared surfaces
      const rawSurfaces = (
        doc.body?.getAttribute?.('data-wm-surfaces') ||
        doc.documentElement?.getAttribute?.('data-wm-surfaces') ||
        ''
      );
      if (rawSurfaces) {
        const declared = rawSurfaces.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (declared.length > 0 && !declared.includes(targetSurface)) {
          console.warn(`[WishMagicRuntime] Surface "${surface}" rejected. Not in template declared surfaces: [${declared.join(', ')}]`);
          return false;
        }
      }

      doc.documentElement.dataset.wmSurface = targetSurface;
      doc.documentElement.setAttribute('data-wm-surface', targetSurface);

      if (!runtimeState.visual) runtimeState.visual = {};
      runtimeState.visual.surface = targetSurface;

      if (global.WishMagicTemplateHooks && typeof global.WishMagicTemplateHooks.onSurfaceChange === 'function') {
        try { global.WishMagicTemplateHooks.onSurfaceChange(targetSurface); } catch (e) {}
      }

      emitEvent('wishmagic:surface-updated', { surface: targetSurface });
      return true;
    },

    /**
     * Controlled Button Style Updating (Spec 20, 21, 45, 46)
     */
    setButtonStyle(style) {
      const doc = getDocument();
      if (!doc || !style) return false;

      const targetStyle = String(style).trim().toLowerCase();

      // Validate against template declared button styles
      const rawStyles = (
        doc.body?.getAttribute?.('data-wm-button-styles') ||
        doc.documentElement?.getAttribute?.('data-wm-button-styles') ||
        ''
      );
      if (rawStyles) {
        const declared = rawStyles.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (declared.length > 0 && !declared.includes(targetStyle)) {
          console.warn(`[WishMagicRuntime] Button style "${style}" rejected. Not in declared styles: [${declared.join(', ')}]`);
          return false;
        }
      }

      doc.documentElement.dataset.wmButtonStyle = targetStyle;
      doc.documentElement.setAttribute('data-wm-button-style', targetStyle);

      if (!runtimeState.visual) runtimeState.visual = {};
      runtimeState.visual.buttonStyle = targetStyle;

      if (global.WishMagicTemplateHooks && typeof global.WishMagicTemplateHooks.onButtonStyleChange === 'function') {
        try { global.WishMagicTemplateHooks.onButtonStyleChange(targetStyle); } catch (e) {}
      }

      emitEvent('wishmagic:button-style-updated', { style: targetStyle });
      return true;
    },

    /**
     * Controlled Typography Updating (Spec 22, 23, 24, 25, 26, 46)
     */
    setTypography(key, value) {
      const doc = getDocument();
      if (!doc || !key || !value) return false;

      const cleanKey = String(key).trim();
      const cleanVal = String(value).trim();

      if (/^(javascript:|data:|<|>)/i.test(cleanVal)) return false;

      if (!runtimeState.visual) runtimeState.visual = {};
      if (!runtimeState.visual.typography) runtimeState.visual.typography = {};
      runtimeState.visual.typography[cleanKey] = cleanVal;

      if (cleanKey === 'headingFont') {
        doc.documentElement.style.setProperty('--wm-heading-font', cleanVal);
      } else if (cleanKey === 'bodyFont') {
        doc.documentElement.style.setProperty('--wm-body-font', cleanVal);
      } else if (cleanKey === 'headingWeight') {
        doc.documentElement.style.setProperty('--wm-heading-weight', cleanVal);
      }

      if (global.WishMagicTemplateHooks && typeof global.WishMagicTemplateHooks.onTypographyChange === 'function') {
        try { global.WishMagicTemplateHooks.onTypographyChange(cleanKey, cleanVal); } catch (e) {}
      }

      emitEvent('wishmagic:typography-updated', { key: cleanKey, value: cleanVal });
      return true;
    },

    /**
     * Controlled Border Radius Updating (Spec 27)
     */
    setRadius(radius) {
      const doc = getDocument();
      if (!doc || !radius) return false;
      const targetRadius = String(radius).trim().toLowerCase();

      doc.documentElement.dataset.wmRadius = targetRadius;
      doc.documentElement.setAttribute('data-wm-radius', targetRadius);

      if (!runtimeState.visual) runtimeState.visual = {};
      runtimeState.visual.radius = targetRadius;

      emitEvent('wishmagic:radius-updated', { radius: targetRadius });
      return true;
    },

    /**
     * Controlled Visual Intensity Updating (Spec 28)
     */
    setIntensity(intensity) {
      const doc = getDocument();
      if (!doc || !intensity) return false;
      const targetIntensity = String(intensity).trim().toLowerCase();

      doc.documentElement.dataset.wmIntensity = targetIntensity;
      doc.documentElement.setAttribute('data-wm-intensity', targetIntensity);

      if (!runtimeState.visual) runtimeState.visual = {};
      runtimeState.visual.intensity = targetIntensity;

      if (global.WishMagicTemplateHooks && typeof global.WishMagicTemplateHooks.onVisualIntensityChange === 'function') {
        try { global.WishMagicTemplateHooks.onVisualIntensityChange(targetIntensity); } catch (e) {}
      }

      emitEvent('wishmagic:intensity-updated', { intensity: targetIntensity });
      return true;
    },

    /**
     * Template-Specific Custom Visual Control (Spec 49, 50, 51)
     */
    setCustomVisual(controlId, value) {
      const doc = getDocument();
      if (!doc || !controlId) return false;

      if (!runtimeState.visual) runtimeState.visual = {};
      if (!runtimeState.visual.custom) runtimeState.visual.custom = {};
      runtimeState.visual.custom[controlId] = value;

      // Update matching DOM element or CSS variable if declared (Spec 48, 49)
      const ctrlEl = doc.querySelector(`[data-wm-visual-control="${controlId}"]`);
      if (ctrlEl) {
        const varName = ctrlEl.getAttribute('data-wm-variable') || `--wm-custom-${controlId}`;
        doc.documentElement.style.setProperty(varName, String(value));
      }

      emitEvent('wishmagic:custom-visual-updated', { id: controlId, value });
      return true;
    },

    /**
     * Complete Visual Reset (Spec 34, 35)
     */
    resetVisualState() {
      const doc = getDocument();
      if (!doc) return;

      // Clear all --wm-* styles
      const customVars = ['--wm-primary', '--wm-secondary', '--wm-accent', '--wm-glow', '--wm-text', '--wm-background', '--wm-surface', '--wm-muted', '--wm-border', '--wm-heading-font', '--wm-body-font', '--wm-heading-weight'];
      customVars.forEach(v => doc.documentElement.style.removeProperty(v));

      // Reset data attributes to template defaults if declared
      const defaultTheme = doc.body?.getAttribute?.('data-wm-default-theme') || doc.documentElement?.getAttribute?.('data-wm-default-theme');
      if (defaultTheme) {
        doc.documentElement.dataset.wmTheme = defaultTheme;
        doc.documentElement.setAttribute('data-wm-theme', defaultTheme);
      } else {
        delete doc.documentElement.dataset.wmTheme;
        doc.documentElement.removeAttribute('data-wm-theme');
      }

      delete doc.documentElement.dataset.wmBackground;
      doc.documentElement.removeAttribute('data-wm-background');
      delete doc.documentElement.dataset.wmSurface;
      doc.documentElement.removeAttribute('data-wm-surface');
      delete doc.documentElement.dataset.wmButtonStyle;
      doc.documentElement.removeAttribute('data-wm-button-style');
      delete doc.documentElement.dataset.wmIntensity;
      doc.documentElement.removeAttribute('data-wm-intensity');
      delete doc.documentElement.dataset.wmRadius;
      doc.documentElement.removeAttribute('data-wm-radius');

      delete runtimeState.visual;

      emitEvent('wishmagic:visual-reset', {});
    },

    /**
     * Update Animation Scope & Master Toggle (Part 7 - Spec 3, 4, 5, 7, 39, 41)
     */
    setAnimation(category, value) {
      return this.updateAnimation(category, value);
    },

    updateAnimation(category, value) {
      const doc = getDocument();
      if (!doc) return false;

      if (!runtimeState.animations) runtimeState.animations = { enabled: true };

      if (category === 'enabled') {
        const isEnabled = Boolean(value);
        runtimeState.animations.enabled = isEnabled;
        doc.documentElement.dataset.wmAnimationEnabled = String(isEnabled);
        doc.documentElement.setAttribute('data-wm-animation-enabled', String(isEnabled));

        if (!isEnabled) {
          doc.documentElement.classList.add('wm-animations-disabled');
          // Stop active particle loop when master disabled
          this.stopParticleLoop();
        } else {
          doc.documentElement.classList.remove('wm-animations-disabled');
          // Resume particles if previously enabled
          if (runtimeState.animations.particles && runtimeState.animations.particles.enabled !== false) {
            this.startParticleLoop();
          }
        }

        if (global.WishMagicTemplateHooks && typeof global.WishMagicTemplateHooks.onAnimationChange === 'function') {
          try { global.WishMagicTemplateHooks.onAnimationChange({ enabled: isEnabled }); } catch (e) {}
        }
        emitEvent('wishmagic:animation-updated', { category: 'enabled', value: isEnabled });
        return true;
      }

      const cleanVal = String(value).trim().toLowerCase();
      // Sanitize against arbitrary injection (Spec 76)
      if (/^(javascript:|data:|<|>|url\(|expression\()/i.test(cleanVal)) return false;

      if (category === 'page' || category === 'pageEntrance') {
        doc.documentElement.dataset.wmPageAnimation = cleanVal;
        doc.documentElement.setAttribute('data-wm-page-animation', cleanVal);
        runtimeState.animations.pageEntrance = cleanVal;
      } else if (category === 'text' || category === 'textReveal') {
        doc.documentElement.dataset.wmTextAnimation = cleanVal;
        doc.documentElement.setAttribute('data-wm-text-animation', cleanVal);
        runtimeState.animations.textReveal = cleanVal;
      } else if (category === 'media' || category === 'mediaReveal') {
        doc.documentElement.dataset.wmMediaAnimation = cleanVal;
        doc.documentElement.setAttribute('data-wm-media-animation', cleanVal);
        runtimeState.animations.mediaReveal = cleanVal;
        runtimeState.animations.media = cleanVal;
      }

      if (global.WishMagicTemplateHooks && typeof global.WishMagicTemplateHooks.onAnimationChange === 'function') {
        try { global.WishMagicTemplateHooks.onAnimationChange({ category, value: cleanVal }); } catch (e) {}
      }

      emitEvent('wishmagic:animation-updated', { category, value: cleanVal });
      return true;
    },

    /**
     * Controlled Section Animation (Spec 9, 10, 36, 39, 41)
     */
    setSectionAnimation(sectionId, animation) {
      const doc = getDocument();
      if (!doc || !sectionId || !animation) return false;

      const secEl = doc.querySelector(`[data-wm-section="${sectionId}"]`);
      if (!secEl) {
        console.warn(`[WishMagicRuntime] Section "${sectionId}" not found for animation.`);
        return false;
      }

      const cleanAnim = String(animation).trim().toLowerCase();
      if (/^(javascript:|data:|<|>)/i.test(cleanAnim)) return false;

      // Validate against declared section animations if declared (Spec 10)
      const rawSecAnims = secEl.getAttribute('data-wm-animation') || secEl.getAttribute('data-wm-animations');
      if (rawSecAnims) {
        const declared = rawSecAnims.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (declared.length > 0 && !declared.includes(cleanAnim)) {
          console.warn(`[WishMagicRuntime] Animation "${cleanAnim}" rejected for section "${sectionId}". Declared: [${declared.join(', ')}]`);
          return false;
        }
      }

      secEl.dataset.wmAnimation = cleanAnim;
      secEl.setAttribute('data-wm-animation', cleanAnim);

      if (!runtimeState.animations) runtimeState.animations = { enabled: true };
      if (!runtimeState.animations.sectionReveal) runtimeState.animations.sectionReveal = {};
      runtimeState.animations.sectionReveal[sectionId] = cleanAnim;

      if (global.WishMagicTemplateHooks && typeof global.WishMagicTemplateHooks.onSectionAnimationChange === 'function') {
        try { global.WishMagicTemplateHooks.onSectionAnimationChange(sectionId, cleanAnim); } catch (e) {}
      }

      emitEvent('wishmagic:section-animation-updated', { section: sectionId, animation: cleanAnim });
      return true;
    },

    /**
     * Text Animation (Spec 13, 14, 37, 39)
     */
    setTextAnimation(animation) {
      return this.updateAnimation('textReveal', animation);
    },

    /**
     * Media Animation (Spec 15, 16, 38, 39)
     */
    setMediaAnimation(animation) {
      return this.updateAnimation('mediaReveal', animation);
    },

    /**
     * Centralized Performance-Safe Particle Engine (Spec 17, 18, 19, 20, 21, 22, 23, 45, 46, 47, 56)
     */
    setParticles(config) {
      const doc = getDocument();
      if (!doc || !config || typeof config !== 'object') return false;

      if (!runtimeState.animations) runtimeState.animations = { enabled: true };
      if (!runtimeState.animations.particles) runtimeState.animations.particles = { enabled: true, type: 'sparkles', intensity: 'soft' };

      const isEnabled = config.enabled !== false;
      const type = (config.type || runtimeState.animations.particles.type || 'sparkles').toLowerCase();
      const intensity = (config.intensity || runtimeState.animations.particles.intensity || 'soft').toLowerCase();

      // Validate particle type against template declaration if present (Spec 23)
      const rawParticlesAttr = doc.body?.getAttribute?.('data-wm-particles') || doc.documentElement?.getAttribute?.('data-wm-particles');
      if (rawParticlesAttr) {
        const declared = rawParticlesAttr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (declared.length > 0 && !declared.includes(type) && type !== 'none') {
          console.warn(`[WishMagicRuntime] Particle type "${type}" rejected. Declared types: [${declared.join(', ')}]`);
          return false;
        }
      }

      runtimeState.animations.particles = {
        enabled: isEnabled,
        type,
        intensity
      };

      doc.documentElement.dataset.wmParticles = isEnabled ? type : 'none';
      doc.documentElement.dataset.wmParticleIntensity = intensity;

      if (isEnabled && type !== 'none') {
        this.startParticleLoop(type, intensity);
      } else {
        this.stopParticleLoop();
      }

      if (global.WishMagicTemplateHooks && typeof global.WishMagicTemplateHooks.onParticlesChange === 'function') {
        try { global.WishMagicTemplateHooks.onParticlesChange({ enabled: isEnabled, type, intensity }); } catch (e) {}
      }

      emitEvent('wishmagic:particles-updated', { enabled: isEnabled, type, intensity });
      return true;
    },

    /**
     * Interactive Effects Controller (Spec 24, 25, 34, 39)
     */
    setInteractiveEffect(effect, enabled = true) {
      const doc = getDocument();
      if (!doc) return false;

      const cleanEff = String(effect).trim().toLowerCase();
      const isEnabled = Boolean(enabled);

      if (!runtimeState.animations) runtimeState.animations = { enabled: true };
      runtimeState.animations.interactive = {
        enabled: isEnabled,
        effect: cleanEff
      };

      doc.documentElement.dataset.wmInteractive = isEnabled ? cleanEff : 'none';

      if (global.WishMagicTemplateHooks && typeof global.WishMagicTemplateHooks.onInteractiveEffectChange === 'function') {
        try { global.WishMagicTemplateHooks.onInteractiveEffectChange({ effect: cleanEff, enabled: isEnabled }); } catch (e) {}
      }

      emitEvent('wishmagic:interactive-updated', { effect: cleanEff, enabled: isEnabled });
      return true;
    },

    /**
     * Ambient Effects Controller (Spec 26, 34, 39)
     */
    setAmbientEffect(type, enabled = true) {
      const doc = getDocument();
      if (!doc) return false;

      const cleanType = String(type).trim().toLowerCase();
      const isEnabled = Boolean(enabled);

      if (!runtimeState.animations) runtimeState.animations = { enabled: true };
      runtimeState.animations.ambient = {
        enabled: isEnabled,
        type: cleanType
      };

      doc.documentElement.dataset.wmAmbient = isEnabled ? cleanType : 'none';

      if (global.WishMagicTemplateHooks && typeof global.WishMagicTemplateHooks.onAmbientEffectChange === 'function') {
        try { global.WishMagicTemplateHooks.onAmbientEffectChange({ type: cleanType, enabled: isEnabled }); } catch (e) {}
      }

      emitEvent('wishmagic:ambient-updated', { type: cleanType, enabled: isEnabled });
      return true;
    },

    /**
     * Custom Animation Controls (Spec 32, 74, 75)
     */
    setCustomAnimation(controlId, value) {
      const doc = getDocument();
      if (!doc || !controlId) return false;

      if (!runtimeState.animations) runtimeState.animations = { enabled: true };
      if (!runtimeState.animations.custom) runtimeState.animations.custom = {};
      runtimeState.animations.custom[controlId] = value;

      const ctrlEl = doc.querySelector(`[data-wm-animation-control="${controlId}"]`);
      if (ctrlEl) {
        const varName = ctrlEl.getAttribute('data-wm-variable') || `--wm-anim-${controlId}`;
        doc.documentElement.style.setProperty(varName, String(value));
      }

      emitEvent('wishmagic:custom-animation-updated', { id: controlId, value });
      return true;
    },

    /**
     * Replay Page Entrance Intro (Spec 50)
     */
    replayIntro() {
      const doc = getDocument();
      if (!doc) return;

      const currentAnim = (runtimeState.animations && runtimeState.animations.pageEntrance) || 'fade-up';
      doc.documentElement.dataset.wmPageAnimation = 'none';

      setTimeout(() => {
        doc.documentElement.dataset.wmPageAnimation = currentAnim;
      }, 50);

      emitEvent('wishmagic:intro-replayed', { animation: currentAnim });
    },

    /**
     * Reset Animation State (Spec 65)
     */
    resetAnimationState() {
      const doc = getDocument();
      if (!doc) return;

      this.stopParticleLoop();

      delete doc.documentElement.dataset.wmPageAnimation;
      doc.documentElement.removeAttribute('data-wm-page-animation');
      delete doc.documentElement.dataset.wmTextAnimation;
      doc.documentElement.removeAttribute('data-wm-text-animation');
      delete doc.documentElement.dataset.wmMediaAnimation;
      doc.documentElement.removeAttribute('data-wm-media-animation');
      delete doc.documentElement.dataset.wmParticles;
      doc.documentElement.removeAttribute('data-wm-particles');
      delete doc.documentElement.dataset.wmParticleIntensity;
      doc.documentElement.removeAttribute('data-wm-particle-intensity');
      delete doc.documentElement.dataset.wmInteractive;
      doc.documentElement.removeAttribute('data-wm-interactive');
      delete doc.documentElement.dataset.wmAmbient;
      doc.documentElement.removeAttribute('data-wm-ambient');

      // Clear section animations
      const secElements = doc.querySelectorAll ? Array.from(doc.querySelectorAll('[data-wm-section]')) : [];
      secElements.forEach(s => {
        delete s.dataset.wmAnimation;
        s.removeAttribute('data-wm-animation');
      });

      delete runtimeState.animations;

      emitEvent('wishmagic:animation-reset', {});
    },

    /**
     * Internal Single Particle Loop Manager (Spec 45, 46, 47, 58, 59, 60, 61)
     */
    startParticleLoop(type = 'sparkles', intensity = 'soft') {
      const doc = getDocument();
      if (!doc || typeof window === 'undefined') return;

      this.stopParticleLoop();

      // Respect reduced-motion accessibility preference (Spec 5, 61, 62)
      if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }

      // Max particle density bounds (Spec 56)
      const count = intensity === 'expressive' ? 35 : (intensity === 'minimal' ? 8 : 18);

      let container = doc.getElementById('wm-particle-runtime-canvas');
      if (!container) {
        container = doc.createElement('div');
        container.id = 'wm-particle-runtime-canvas';
        container.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:1;';
        doc.body.appendChild(container);
      }

      // Populate subtle CSS particle particles
      const symbols = {
        sparkles: '✦',
        hearts: '💖',
        'rose-petals': '🌸',
        stars: '★',
        confetti: '🎉',
        'starlight-bokeh': '✨'
      };
      const symbol = symbols[type] || '✦';

      for (let i = 0; i < count; i++) {
        const p = doc.createElement('div');
        p.className = 'wm-particle-node';
        p.textContent = symbol;
        const left = Math.floor(Math.random() * 100);
        const top = Math.floor(Math.random() * 100);
        const delay = (Math.random() * 3).toFixed(1);
        const duration = (2 + Math.random() * 3).toFixed(1);
        p.style.cssText = `position:absolute;left:${left}%;top:${top}%;font-size:12px;opacity:0.3;animation:wmFloat ${duration}s ease-in-out ${delay}s infinite alternate;pointer-events:none;`;
        container.appendChild(p);
      }
    },

    stopParticleLoop() {
      const doc = getDocument();
      if (!doc) return;
      const container = doc.getElementById ? doc.getElementById('wm-particle-runtime-canvas') : null;
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },

    /**
     * Single Interval Countdown Manager
     */
    updateCountdown(dateStr) {
      if (!dateStr || typeof document === 'undefined') return;

      // Always clear existing interval first to prevent timer leaks
      if (activeCountdownInterval) {
        clearInterval(activeCountdownInterval);
        activeCountdownInterval = null;
      }

      const targetTime = new Date(dateStr).getTime();
      if (Number.isNaN(targetTime)) return;

      const hoursEl = document.getElementById('clock-hours');
      const minsEl = document.getElementById('clock-mins');
      const secsEl = document.getElementById('clock-secs');

      if (!hoursEl && !minsEl && !secsEl) return;

      function tick() {
        const now = Date.now();
        const diff = Math.max(0, targetTime - now);

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);

        if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
        if (minsEl) minsEl.textContent = String(mins).padStart(2, '0');
        if (secsEl) secsEl.textContent = String(secs).padStart(2, '0');
      }

      tick();
      activeCountdownInterval = setInterval(tick, 1000);
    },

    /**
     * Reset to captured default state
     */
    reset() {
      this.updateState(defaultState, 'reset');
    },

    /**
     * Destroy runtime listeners and timers
     */
    destroy() {
      if (activeCountdownInterval) {
        clearInterval(activeCountdownInterval);
        activeCountdownInterval = null;
      }
      if (typeof window !== 'undefined' && boundMessageListener) {
        window.removeEventListener('message', boundMessageListener);
        boundMessageListener = null;
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Message Bus Listener inside Template
  // ---------------------------------------------------------------------------
  if (typeof window !== 'undefined') {
    boundMessageListener = (event) => {
      if (!event.data || typeof event.data !== 'object') return;

      const msgType = event.data.type;
      if (!ALLOWED_MESSAGE_TYPES.has(msgType)) return;

      const payload = event.data.payload || event.data.data || {};

      switch (msgType) {
        case 'WISHMAGIC_INIT':
          WishMagicRuntime.init(payload.data || payload);
          break;

        case 'WISHMAGIC_STATE':
        case 'WISHMAGIC_LIVE_UPDATE':
          WishMagicRuntime.updateState(payload);
          break;

        case 'WISHMAGIC_UPDATE':
          if (payload.key) {
            WishMagicRuntime.updateField(payload.key, payload.value);
          }
          break;

        case 'WISHMAGIC_SECTION': {
          const secKey = payload.section || payload.key;
          if (secKey) {
            WishMagicRuntime.updateSection(secKey, payload.enabled);
          }
          break;
        }

        case 'WISHMAGIC_SECTION_LAYOUT': {
          const secKey = payload.section || payload.id;
          if (secKey && payload.layout) {
            WishMagicRuntime.updateSectionLayout(secKey, payload.layout);
          }
          break;
        }

        case 'WISHMAGIC_SECTION_ORDER': {
          if (Array.isArray(payload.order)) {
            WishMagicRuntime.updateSectionOrder(payload.order);
          }
          break;
        }

        case 'WISHMAGIC_THEME':
          WishMagicRuntime.updateTheme(payload.theme || payload.value, payload.colors);
          break;

        case 'WISHMAGIC_COLOR':
          if (payload.key) {
            WishMagicRuntime.updateColors({ [payload.key]: payload.value });
          }
          break;

        case 'WISHMAGIC_BACKGROUND':
          if (payload.background) {
            WishMagicRuntime.setBackground(payload.background);
          }
          break;

        case 'WISHMAGIC_SURFACE':
          if (payload.surface) {
            WishMagicRuntime.setSurface(payload.surface);
          }
          break;

        case 'WISHMAGIC_BUTTON_STYLE':
          if (payload.style) {
            WishMagicRuntime.setButtonStyle(payload.style);
          }
          break;

        case 'WISHMAGIC_TYPOGRAPHY':
          if (payload.key && payload.value) {
            WishMagicRuntime.setTypography(payload.key, payload.value);
          }
          break;

        case 'WISHMAGIC_INTENSITY':
          if (payload.intensity) {
            WishMagicRuntime.setIntensity(payload.intensity);
          }
          break;

        case 'WISHMAGIC_RADIUS':
          if (payload.radius) {
            WishMagicRuntime.setRadius(payload.radius);
          }
          break;

        case 'WISHMAGIC_CUSTOM_VISUAL':
          if (payload.id) {
            WishMagicRuntime.setCustomVisual(payload.id, payload.value);
          }
          break;

        case 'WISHMAGIC_VISUAL_RESET':
          WishMagicRuntime.resetVisualState();
          break;

        case 'WISHMAGIC_ANIMATION':
          WishMagicRuntime.updateAnimation(payload.scope || 'page', payload.value);
          break;

        case 'WISHMAGIC_MEDIA': {
          const mediaId = payload.mediaId || payload.key || payload.id;
          const action = payload.action || 'set';
          const itemsOrMedia = payload.items || payload.media || payload.value;
          if (mediaId) {
            WishMagicRuntime.updateMedia(mediaId, action, itemsOrMedia);
            // Also update legacy field if mapped
            WishMagicRuntime.updateField(mediaId, payload.value || (itemsOrMedia && itemsOrMedia.url) || itemsOrMedia);
          }
          break;
        }

        case 'WISHMAGIC_MEDIA_ORDER': {
          const mediaId = payload.mediaId || payload.key;
          if (mediaId && Array.isArray(payload.order)) {
            WishMagicRuntime.updateMediaOrder(mediaId, payload.order);
          }
          break;
        }

        case 'WISHMAGIC_MEDIA_SETTINGS': {
          const mediaId = payload.mediaId || payload.key;
          if (mediaId && payload.settings) {
            WishMagicRuntime.updateMediaSettings(mediaId, payload.settings);
          }
          break;
        }

        case 'WISHMAGIC_RESET':
          WishMagicRuntime.reset();
          break;
      }
    };

    if (typeof window.addEventListener === 'function') {
      window.addEventListener('message', boundMessageListener);
    }

    // Send READY signal to parent customizer on load
    function signalReady() {
      const readyMsg = {
        protocol: PROTOCOL_VERSION,
        type: 'WISHMAGIC_READY'
      };

      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(readyMsg, '*');
        }
        if (window.opener) {
          window.opener.postMessage(readyMsg, '*');
        }
      } catch (e) {}

      WishMagicRuntime.init(global.WishMagicData || {});
    }

    if (typeof document !== 'undefined' && document) {
      if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', signalReady);
      } else {
        signalReady();
      }
    }
  }

  // Expose global runtime
  global.WishMagicRuntime = WishMagicRuntime;

})(typeof window !== 'undefined' ? window : this);
