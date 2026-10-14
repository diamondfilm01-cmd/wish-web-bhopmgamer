/**
 * WishMagic Universal Template Protocol (v1.0)
 * -------------------------------------------------------------
 * Provides self-describing capability discovery, validation,
 * safe DOM data hydration, and event listeners for all wish templates.
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
   * Universal Field Setter
   */
  function setWishMagicField(key, value, customData) {
    // Look for elements with data-wm-field or legacy data-wm
    const elements = document.querySelectorAll(`[data-wm-field="${key}"], [data-wm="${key}"]`);
    
    elements.forEach(element => {
      const type = element.getAttribute('data-wm-type') || (element.tagName === 'IMG' ? 'image' : 'text');
      const isRequired = element.getAttribute('data-wm-required') === 'true';
      const defaultValue = element.getAttribute('data-wm-default') || '';

      // Check empty state
      const hasValue = value !== undefined && value !== null && String(value).trim() !== '';

      if (!hasValue && !isRequired && !defaultValue) {
        element.setAttribute('data-wm-empty', 'true');
      } else {
        element.removeAttribute('data-wm-empty');
      }

      const activeValue = hasValue ? value : defaultValue;

      switch (type) {
        case 'image':
          if (element.tagName === 'IMG') {
            setImageSafe(element, activeValue, '/assets/file_ab2082.png');
          } else {
            element.style.backgroundImage = activeValue ? `url("${activeValue}")` : '';
          }
          break;

        case 'video':
          if (element.tagName === 'VIDEO') {
            if (activeValue) {
              element.src = activeValue;
              element.load();
            }
          }
          break;

        case 'audio':
          if (element.tagName === 'AUDIO') {
            if (activeValue) {
              element.src = activeValue;
            }
          }
          break;

        case 'color':
          if (key === 'primary_color' || key === 'primary') {
            document.documentElement.style.setProperty('--wm-primary', activeValue);
          } else if (key === 'secondary_color' || key === 'secondary') {
            document.documentElement.style.setProperty('--wm-secondary', activeValue);
          } else if (key === 'accent_color' || key === 'accent') {
            document.documentElement.style.setProperty('--wm-accent', activeValue);
          }
          break;

        case 'toggle':
          if (typeof activeValue === 'boolean') {
            if (!activeValue) {
              element.setAttribute('data-wm-disabled', 'true');
            } else {
              element.removeAttribute('data-wm-disabled');
            }
          }
          break;

        case 'text':
        case 'textarea':
        case 'date':
        case 'time':
        case 'datetime':
        case 'number':
        case 'phone':
        case 'email':
        default:
          if (key === 'sender_name') {
            // Standard formatting for sender attribution
            setTextSafe(element, activeValue ? `— ${activeValue}` : '— Someone Special');
          } else if (key === 'recipient_name') {
            setTextSafe(element, activeValue || 'Someone Special');
          } else if (key === 'custom_message') {
            setTextSafe(element, activeValue || 'May your day be filled with warm magic, sparkling smiles, and infinite moments of joy!');
          } else {
            setTextSafe(element, activeValue);
          }
          break;
      }
    });
  }

  /**
   * Apply entire dataset to template
   */
  function applyData(data) {
    if (!data || typeof data !== 'object') return;

    // Apply known standard fields
    Object.keys(data).forEach(key => {
      setWishMagicField(key, data[key], data);
    });

    // Special handling for photos array (e.g. photo_1, photo_2, etc.)
    if (Array.isArray(data.photos)) {
      data.photos.forEach((photo, idx) => {
        const photoUrl = typeof photo === 'string' ? photo : (photo && (photo.url || photo.src));
        if (photoUrl) {
          setWishMagicField(`photo_${idx + 1}`, photoUrl, data);
        }
      });
      if (data.photos.length > 0) {
        const firstPhoto = typeof data.photos[0] === 'string' ? data.photos[0] : (data.photos[0] && (data.photos[0].url || data.photos[0].src));
        if (firstPhoto) setWishMagicField('photo_1', firstPhoto, data);
      }
    }

    if (data.cover_photo) {
      setWishMagicField('photo_1', data.cover_photo, data);
    }

    // Colors
    if (data.colors && typeof data.colors === 'object') {
      if (data.colors.primary) document.documentElement.style.setProperty('--wm-primary', data.colors.primary);
      if (data.colors.secondary) document.documentElement.style.setProperty('--wm-secondary', data.colors.secondary);
      if (data.colors.accent) document.documentElement.style.setProperty('--wm-accent', data.colors.accent);
    }

    // Section visibility
    if (Array.isArray(data.sections)) {
      data.sections.forEach(sec => {
        const secEl = document.querySelector(`[data-wm-section="${sec.id || sec.key}"]`);
        if (secEl && secEl.getAttribute('data-wm-toggleable') === 'true') {
          secEl.style.display = sec.enabled === false ? 'none' : '';
        }
      });
    }
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
