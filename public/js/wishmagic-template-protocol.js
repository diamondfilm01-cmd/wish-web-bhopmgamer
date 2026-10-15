/**
 * WishMagic Universal Template Protocol (v1.0)
 * -------------------------------------------------------------
 * Provides self-describing capability discovery, validation,
 * safe DOM data hydration, manifest binding target execution,
 * and event listeners for all UTP v1.0.0 wish templates.
 */

(function (global) {
  'use strict';

  const PROTOCOL_VERSION = '1.0';
  const SCHEMA_VERSION = '1.0.0';
  const RUNTIME_API_VERSION = '1.0';

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
  function resolveFieldElements(key, fieldConfig) {
    const selectorParts = [`[data-wm-field="${key}"]`, `[data-wm="${key}"]`];
    if (fieldConfig && fieldConfig.binding && fieldConfig.binding.selector) {
      const customSel = String(fieldConfig.binding.selector).trim();
      if (customSel && ! customSel.startsWith('{{') && !customSel.startsWith('--')) {
        selectorParts.push(customSel);
      }
    }
    const nodeSet = new Set();
    selectorParts.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => nodeSet.add(el));
      } catch (_) {}
    });
    return Array.from(nodeSet);
  }

  /**
   * Universal Field Setter (supports all UTP v1.0.0 field types & binding targets)
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

    const elements = resolveFieldElements(key, fieldConfig);

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

      const isRequired = element.getAttribute('data-wm-required') === 'true' || Boolean(fieldConfig && fieldConfig.required);
      const defaultValue = element.getAttribute('data-wm-default') || (fieldConfig && fieldConfig.defaultValue !== undefined ? fieldConfig.defaultValue : '');

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

        case 'toggle': {
          const boolVal = typeof activeValue === 'boolean' ? activeValue : (String(activeValue).toLowerCase() === 'true');
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
            element.value = activeValue !== undefined && activeValue !== null ? String(activeValue) : '';
          } else if (key === 'sender_name') {
            const rawSender = String(activeValue || '').trim();
            setTextSafe(element, rawSender ? (rawSender.startsWith('—') ? rawSender : `— ${rawSender}`) : '— Someone Special');
          } else if (key === 'recipient_name') {
            setTextSafe(element, activeValue || 'Someone Special');
          } else if (key === 'custom_message') {
            setTextSafe(element, activeValue || 'May your day be filled with warm magic, sparkling smiles, and infinite moments of joy!');
          } else {
            setTextSafe(element, activeValue);
          }
          break;
        }
      }
    });
  }

  /**
   * Apply entire dataset to template
   */
  function applyData(data) {
    if (!data || typeof data !== 'object') return;

    // 1. Apply all direct keys in data
    Object.keys(data).forEach(key => {
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

    // 4. Colors & CSS custom properties
    if (data.colors && typeof data.colors === 'object') {
      if (data.colors.primary) document.documentElement.style.setProperty('--wm-primary', data.colors.primary);
      if (data.colors.secondary) document.documentElement.style.setProperty('--wm-secondary', data.colors.secondary);
      if (data.colors.accent) document.documentElement.style.setProperty('--wm-accent', data.colors.accent);
    }

    // 5. Theme attribute synchronization
    if (data.theme && typeof data.theme === 'string') {
      document.documentElement.setAttribute('data-wm-theme', data.theme);
      if (document.body) document.body.setAttribute('data-wm-theme', data.theme);
    }

    // 6. Section visibility toggles
    if (Array.isArray(data.sections)) {
      data.sections.forEach(sec => {
        const secId = sec.id || sec.key;
        if (!secId) return;
        const secEl = document.querySelector(`[data-wm-section="${secId}"]`);
        if (secEl) {
          const isRequired = secEl.getAttribute('data-wm-required') === 'true';
          const isToggleable = secEl.getAttribute('data-wm-toggleable') !== 'false' && !isRequired;
          if (isToggleable) {
            secEl.style.display = sec.enabled === false ? 'none' : '';
            secEl.setAttribute('data-wm-section-enabled', sec.enabled === false ? 'false' : 'true');
          }
        }
      });
    }

    // 7. Dispatch CustomEvent so template scripts (countdowns, carousels, particles) react immediately
    try {
      global.WishMagicData = data;
      const evt = new CustomEvent('wishmagic:data-updated', { detail: data });
      window.dispatchEvent(evt);
      document.dispatchEvent(evt);
    } catch (_) {}
  }

  /**
   * Discover and extract full template capabilities from DOM metadata
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

      sections.push({
        id: sectionKey,
        name: el.getAttribute('data-wm-label') || sectionKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        toggleable: el.getAttribute('data-wm-toggleable') !== 'false',
        reorderable: el.getAttribute('data-wm-reorderable') === 'true',
        order: el.getAttribute('data-wm-order') ? parseInt(el.getAttribute('data-wm-order'), 10) : null,
        animation: el.getAttribute('data-wm-animation') ? el.getAttribute('data-wm-animation').split(',').map(s => s.trim()) : []
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
    PROTOCOL_VERSION,
    SCHEMA_VERSION,
    RUNTIME_API_VERSION,
    getCapabilities,
    validate,
    applyData,
    setField: setWishMagicField
  };

  global.validateWishMagicTemplate = validate;
  global.setWishMagicField = setWishMagicField;

  // Auto-listen to incoming postMessage data from customizer or parent iframe
  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;
    if (
      event.data.type === 'WISHMAGIC_INIT' ||
      event.data.type === 'WISHMAGIC_LIVE_UPDATE' ||
      event.data.type === 'WISHMAGIC_UPDATE'
    ) {
      applyData(event.data.payload);
    }
  });

  // Auto-hydrate if window.WishMagicData is preset
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (global.WishMagicData) applyData(global.WishMagicData);
    });
  } else {
    if (global.WishMagicData) applyData(global.WishMagicData);
  }

})(typeof window !== 'undefined' ? window : this);
