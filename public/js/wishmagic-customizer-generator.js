/**
 * WishMagic Automatic Customizer Generator (Part 3)
 * =============================================================
 * Consumes the Capability Schema from WishMagicTemplateAnalyzer and
 * dynamically generates accessible, responsive customization form controls.
 *
 * Maintains central window.WishMagicData and communicates with
 * the template preview via WishMagicRuntimeBridge.
 */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. WISHMAGIC CUSTOMIZER SCHEMA NORMALIZATION LAYER
  // ---------------------------------------------------------------------------
  const WishMagicCustomizerSchema = {
    /**
     * Converts raw analyzer output into a structured customizer schema
     * @param {Object} analysis - Output from WishMagicTemplateAnalyzer.analyze()
     * @returns {Object} Normalized schema
     */
    fromAnalysis(analysis) {
      if (!analysis || typeof analysis !== 'object') {
        return {
          valid: false,
          fields: [],
          sections: [],
          groups: [],
          capabilities: {},
          themes: [],
          particles: {},
          animations: {},
          media: {},
          colors: {}
        };
      }

      const standardGroupOrder = [
        'personal',
        'message',
        'media',
        'sections',
        'appearance',
        'animation',
        'audio',
        'advanced'
      ];

      const groupLabels = {
        personal: 'Personal Details',
        message: 'Heartfelt Message',
        media: 'Photos & Keepsakes',
        sections: 'Template Sections',
        appearance: 'Themes & Colors',
        animation: 'Animations & Effects',
        audio: 'Music & Voice',
        advanced: 'Advanced Settings'
      };

      const groupIcons = {
        personal: 'person',
        message: 'edit_note',
        media: 'photo_library',
        sections: 'view_agenda',
        appearance: 'palette',
        animation: 'auto_awesome',
        audio: 'music_note',
        advanced: 'tune'
      };

      // 1. Normalize Fields
      const normalizedFields = (analysis.fields || []).map(f => ({
        key: f.key,
        label: f.label || f.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        type: f.type || 'text',
        required: f.required === true,
        defaultValue: f.defaultValue !== undefined ? f.defaultValue : null,
        placeholder: f.placeholder || '',
        description: f.description || '',
        minlength: f.minlength !== undefined && f.minlength !== null ? f.minlength : null,
        maxLength: f.maxlength !== undefined && f.maxlength !== null ? f.maxlength : (f.maxLength !== undefined && f.maxLength !== null ? f.maxLength : null),
        min: f.min !== undefined && f.min !== null ? f.min : null,
        max: f.max !== undefined && f.max !== null ? f.max : null,
        step: f.step !== undefined && f.step !== null ? f.step : null,
        pattern: f.pattern || null,
        format: f.format || null,
        target: f.target || 'text',
        order: f.order !== undefined && f.order !== null ? f.order : null,
        visibleIf: f.visibleIf || null,
        disabledIf: f.disabledIf || null,
        requiredIf: f.requiredIf || null,
        labelIf: f.labelIf || null,
        descriptionIf: f.descriptionIf || null,
        clearOnHide: f.clearOnHide === true,
        group: f.group || 'personal',
        section: f.section || null,
        options: Array.isArray(f.options) ? f.options : [],
        targets: f.targets || 1,
        legacy: f.legacy === true
      }));

      // 2. Organize into Groups
      const groupMap = new Map();
      normalizedFields.forEach(f => {
        const grpKey = f.group.toLowerCase();
        if (!groupMap.has(grpKey)) {
          groupMap.set(grpKey, {
            key: grpKey,
            title: groupLabels[grpKey] || (grpKey.charAt(0).toUpperCase() + grpKey.slice(1)),
            icon: groupIcons[grpKey] || 'category',
            fields: []
          });
        }
        groupMap.get(grpKey).fields.push(f);
      });

      // Sort groups by predefined order, then custom groups
      const groups = Array.from(groupMap.values()).sort((a, b) => {
        const idxA = standardGroupOrder.indexOf(a.key);
        const idxB = standardGroupOrder.indexOf(b.key);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.title.localeCompare(b.title);
      });

      // 3. Normalize Sections (Part 5 - Spec 27, 28)
      const normalizedSections = (analysis.sections || []).map(sec => {
        const secId = sec.id || sec.key;
        const isRequired = sec.required === true;
        const isToggleable = !isRequired && sec.toggleable !== false;
        const layouts = Array.isArray(sec.layouts) ? sec.layouts : [];
        const controls = [];

        if (isRequired) {
          controls.push({
            type: 'required-badge',
            key: `section.${secId}.enabled`,
            label: 'Required'
          });
        } else if (isToggleable) {
          controls.push({
            type: 'toggle',
            key: `section.${secId}.enabled`,
            label: sec.label || sec.name || secId
          });
        } else {
          controls.push({
            type: 'fixed-badge',
            key: `section.${secId}.enabled`,
            label: 'Fixed'
          });
        }

        if (layouts.length > 0) {
          controls.push({
            type: 'select',
            key: `section.${secId}.layout`,
            label: `${sec.label || sec.name || secId} Layout`,
            options: layouts,
            default: sec.defaultLayout || layouts[0]
          });
        }

        return {
          type: 'section',
          id: secId,
          key: secId,
          label: sec.label || sec.name || secId,
          name: sec.name || sec.label || secId,
          description: sec.description || '',
          required: isRequired,
          toggleable: isToggleable,
          reorderable: sec.reorderable === true,
          enabledByDefault: isRequired ? true : (sec.enabledByDefault !== false),
          order: sec.order || 1,
          layouts: layouts,
          defaultLayout: sec.defaultLayout || (layouts.length > 0 ? layouts[0] : null),
          capabilities: sec.capabilities || [],
          requires: sec.requires || [],
          fixedPosition: sec.fixedPosition || null,
          group: sec.group || null,
          instance: sec.instance || null,
          settings: sec.settings || {},
          controls
        };
      });

      // 4. Normalize Visual System (Part 6 - Spec 2, 5, 12, 24, 40, 63)
      const rawVisual = analysis.visual || {};
      const normalizedVisual = {
        themes: {
          supported: (rawVisual.themes && rawVisual.themes.supported) || (analysis.themes || []),
          default: (rawVisual.themes && rawVisual.themes.default) || (analysis.themes && analysis.themes[0]) || null,
          presets: (rawVisual.themes && rawVisual.themes.presets) || []
        },
        colors: {
          supported: (rawVisual.colors && rawVisual.colors.supported) || (analysis.colors && analysis.colors.palette) || [],
          defaults: (rawVisual.colors && rawVisual.colors.defaults) || (analysis.colors && analysis.colors.defaults) || {}
        },
        backgrounds: {
          supported: (rawVisual.backgrounds && rawVisual.backgrounds.supported) || (analysis.backgrounds || []),
          default: (rawVisual.backgrounds && rawVisual.backgrounds.default) || (analysis.backgrounds && analysis.backgrounds[0]) || null
        },
        surfaces: {
          supported: (rawVisual.surfaces && rawVisual.surfaces.supported) || (analysis.surfaces || []),
          default: (rawVisual.surfaces && rawVisual.surfaces.default) || (analysis.surfaces && analysis.surfaces[0]) || null
        },
        buttons: {
          supported: (rawVisual.buttons && rawVisual.buttons.supported) || (analysis.buttonStyles || []),
          default: (rawVisual.buttons && rawVisual.buttons.default) || (analysis.buttonStyles && analysis.buttonStyles[0]) || null
        },
        typography: {
          supported: (rawVisual.typography && rawVisual.typography.supported) || [],
          fonts: (rawVisual.typography && rawVisual.typography.fonts) || [],
          weights: (rawVisual.typography && rawVisual.typography.weights) || [],
          customFont: Boolean(rawVisual.typography && rawVisual.typography.customFont)
        },
        radius: {
          supported: (rawVisual.radius && rawVisual.radius.supported) || []
        },
        intensity: {
          supported: (rawVisual.intensity && rawVisual.intensity.supported) || [],
          default: (rawVisual.intensity && rawVisual.intensity.default) || null
        },
        customControls: (rawVisual.customControls) || []
      };

      // 5. Normalize Media Capabilities (Part 8 - Spec 1 to 42, 81)
      const rawMedia = analysis.media || {};
      const normalizedMedia = {
        images: Boolean(rawMedia.images),
        multipleImages: Boolean(rawMedia.multipleImages),
        video: Boolean(rawMedia.video),
        multipleVideos: Boolean(rawMedia.multipleVideos),
        audio: Boolean(rawMedia.audio),
        voice: Boolean(rawMedia.voice),
        slots: Array.isArray(rawMedia.slots) ? rawMedia.slots : []
      };

      return {
        valid: analysis.valid !== false,
        protocol: analysis.protocol || { version: '1.0' },
        fields: normalizedFields,
        sections: normalizedSections,
        groups,
        capabilities: analysis.capabilities || {},
        themes: normalizedVisual.themes.supported,
        particles: analysis.particles || { styles: [], intensity: [], interactive: [] },
        animations: analysis.animations || { page: [], text: [], media: [], sections: [] },
        media: normalizedMedia,
        colors: analysis.colors || { supported: false, fields: [] },
        backgrounds: normalizedVisual.backgrounds.supported,
        surfaces: normalizedVisual.surfaces.supported,
        buttonStyles: normalizedVisual.buttons.supported,
        visual: normalizedVisual
      };
    }
  };

  // ---------------------------------------------------------------------------
  // 2. WISHMAGIC RUNTIME BRIDGE
  // ---------------------------------------------------------------------------
  const WishMagicRuntimeBridge = {
    previewElement: null,
    targetOrigin: '*',

    init(previewElement, targetOrigin = '*') {
      this.previewElement = previewElement;
      this.targetOrigin = targetOrigin;
    },

    send(type, payload) {
      if (!this.previewElement) return;

      const message = {
        protocol: '1.0',
        type,
        payload
      };

      try {
        if (this.previewElement.contentWindow) {
          this.previewElement.contentWindow.postMessage(message, this.targetOrigin);
        } else if (typeof this.previewElement.postMessage === 'function') {
          this.previewElement.postMessage(message, this.targetOrigin);
        }
      } catch (err) {
        console.warn('WishMagicRuntimeBridge dispatch error:', err);
      }
    },

    sendInit(data) {
      this.send('WISHMAGIC_INIT', data);
    },

    updateField(key, value) {
      this.send('WISHMAGIC_UPDATE', { key, value });
    },

    updateState(data) {
      this.send('WISHMAGIC_STATE', data);
      this.send('WISHMAGIC_LIVE_UPDATE', data);
    },

    updateSection(sectionKey, enabled, order) {
      if (global.WishMagicRuntimeBridge && typeof global.WishMagicRuntimeBridge.updateSection === 'function' && global.WishMagicRuntimeBridge !== this) {
        global.WishMagicRuntimeBridge.updateSection(sectionKey, enabled, order);
        return;
      }
      this.send('WISHMAGIC_SECTION', { key: sectionKey, section: sectionKey, enabled, order });
    },

    updateSectionLayout(sectionKey, layout) {
      if (global.WishMagicRuntimeBridge && typeof global.WishMagicRuntimeBridge.updateSectionLayout === 'function' && global.WishMagicRuntimeBridge !== this) {
        global.WishMagicRuntimeBridge.updateSectionLayout(sectionKey, layout);
        return;
      }
      this.send('WISHMAGIC_SECTION_LAYOUT', { key: sectionKey, section: sectionKey, layout });
    },

    updateSectionOrder(order) {
      if (global.WishMagicRuntimeBridge && typeof global.WishMagicRuntimeBridge.updateSectionOrder === 'function' && global.WishMagicRuntimeBridge !== this) {
        global.WishMagicRuntimeBridge.updateSectionOrder(order);
        return;
      }
      this.send('WISHMAGIC_SECTION_ORDER', { order });
    },

    updateTheme(themeName, colors) {
      if (global.WishMagicRuntimeBridge && typeof global.WishMagicRuntimeBridge.updateTheme === 'function' && global.WishMagicRuntimeBridge !== this) {
        global.WishMagicRuntimeBridge.updateTheme(themeName, colors);
        return;
      }
      this.send('WISHMAGIC_THEME', { theme: themeName, colors });
    },

    updateColor(colorKey, value) {
      if (global.WishMagicRuntimeBridge && typeof global.WishMagicRuntimeBridge.updateColor === 'function' && global.WishMagicRuntimeBridge !== this) {
        global.WishMagicRuntimeBridge.updateColor(colorKey, value);
        return;
      }
      this.send('WISHMAGIC_COLOR', { key: colorKey, value });
    },

    updateBackground(background) {
      if (global.WishMagicRuntimeBridge && typeof global.WishMagicRuntimeBridge.updateBackground === 'function' && global.WishMagicRuntimeBridge !== this) {
        global.WishMagicRuntimeBridge.updateBackground(background);
        return;
      }
      this.send('WISHMAGIC_BACKGROUND', { background });
    },

    updateSurface(surface) {
      if (global.WishMagicRuntimeBridge && typeof global.WishMagicRuntimeBridge.updateSurface === 'function' && global.WishMagicRuntimeBridge !== this) {
        global.WishMagicRuntimeBridge.updateSurface(surface);
        return;
      }
      this.send('WISHMAGIC_SURFACE', { surface });
    },

    updateButtonStyle(style) {
      if (global.WishMagicRuntimeBridge && typeof global.WishMagicRuntimeBridge.updateButtonStyle === 'function' && global.WishMagicRuntimeBridge !== this) {
        global.WishMagicRuntimeBridge.updateButtonStyle(style);
        return;
      }
      this.send('WISHMAGIC_BUTTON_STYLE', { style });
    },

    updateTypography(typeKey, value) {
      if (global.WishMagicRuntimeBridge && typeof global.WishMagicRuntimeBridge.updateTypography === 'function' && global.WishMagicRuntimeBridge !== this) {
        global.WishMagicRuntimeBridge.updateTypography(typeKey, value);
        return;
      }
      this.send('WISHMAGIC_TYPOGRAPHY', { key: typeKey, value });
    },

    updateIntensity(intensity) {
      if (global.WishMagicRuntimeBridge && typeof global.WishMagicRuntimeBridge.updateIntensity === 'function' && global.WishMagicRuntimeBridge !== this) {
        global.WishMagicRuntimeBridge.updateIntensity(intensity);
        return;
      }
      this.send('WISHMAGIC_INTENSITY', { intensity });
    },

    updateRadius(radius) {
      if (global.WishMagicRuntimeBridge && typeof global.WishMagicRuntimeBridge.updateRadius === 'function' && global.WishMagicRuntimeBridge !== this) {
        global.WishMagicRuntimeBridge.updateRadius(radius);
        return;
      }
      this.send('WISHMAGIC_RADIUS', { radius });
    },

    updateCustomVisual(controlId, value) {
      if (global.WishMagicRuntimeBridge && typeof global.WishMagicRuntimeBridge.updateCustomVisual === 'function' && global.WishMagicRuntimeBridge !== this) {
        global.WishMagicRuntimeBridge.updateCustomVisual(controlId, value);
        return;
      }
      this.send('WISHMAGIC_CUSTOM_VISUAL', { id: controlId, value });
    },

    resetVisualState() {
      if (global.WishMagicRuntimeBridge && typeof global.WishMagicRuntimeBridge.resetVisualState === 'function' && global.WishMagicRuntimeBridge !== this) {
        global.WishMagicRuntimeBridge.resetVisualState();
        return;
      }
      this.send('WISHMAGIC_VISUAL_RESET', {});
    },

    updateMedia(mediaId, action = 'set', mediaOrItems = null) {
      if (global.WishMagicRuntimeBridge && typeof global.WishMagicRuntimeBridge.updateMedia === 'function' && global.WishMagicRuntimeBridge !== this) {
        global.WishMagicRuntimeBridge.updateMedia(mediaId, action, mediaOrItems);
        return;
      }
      this.send('WISHMAGIC_MEDIA', { mediaId, action, media: mediaOrItems, items: Array.isArray(mediaOrItems) ? mediaOrItems : null, key: mediaId, value: mediaOrItems });
    },

    updateMediaOrder(mediaId, order) {
      if (global.WishMagicRuntimeBridge && typeof global.WishMagicRuntimeBridge.updateMediaOrder === 'function' && global.WishMagicRuntimeBridge !== this) {
        global.WishMagicRuntimeBridge.updateMediaOrder(mediaId, order);
        return;
      }
      this.send('WISHMAGIC_MEDIA_ORDER', { mediaId, order });
    },

    updateMediaSettings(mediaId, settings) {
      if (global.WishMagicRuntimeBridge && typeof global.WishMagicRuntimeBridge.updateMediaSettings === 'function' && global.WishMagicRuntimeBridge !== this) {
        global.WishMagicRuntimeBridge.updateMediaSettings(mediaId, settings);
        return;
      }
      this.send('WISHMAGIC_MEDIA_SETTINGS', { mediaId, settings });
    }
  };

  // ---------------------------------------------------------------------------
  // 3. WISHMAGIC AUTOMATIC CUSTOMIZER CORE
  // ---------------------------------------------------------------------------
  let currentSchema = null;
  let currentData = {};
  let currentContainer = null;
  let changeListeners = [];
  let isDirtyState = false;
  let activeCreatedObjectURLs = new Set();

  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const WishMagicCustomizer = {
    /**
     * Initialize Customizer
     * @param {Object} options
     */
    init(options = {}) {
      this.destroy();

      const analysis = options.analysis || (global.WishMagicTemplateAnalyzer ? global.WishMagicTemplateAnalyzer.analyze() : null);
      currentSchema = WishMagicCustomizerSchema.fromAnalysis(analysis);

      // Initialize Central Wish Data
      currentData = {
        recipient_name: '',
        sender_name: '',
        event_date: '',
        custom_message: '',
        photos: [],
        videos: [],
        bg_music: null,
        voice_note: null,
        theme: null,
        primary_color: '#ec4899',
        secondary_color: '#8b5cf6',
        accent_color: '#fbbf24',
        sections: {},
        animations: {},
        ...options.initialData
      };

      // Set default values from template schema
      currentSchema.fields.forEach(f => {
        if (currentData[f.key] === undefined || currentData[f.key] === null || currentData[f.key] === '') {
          if (f.defaultValue !== null && f.defaultValue !== undefined) {
            currentData[f.key] = f.defaultValue;
          }
        }
      });

      // Initialize sections state and section order (Part 5 - Spec 10, 29, 62)
      if (!currentData.sections || typeof currentData.sections !== 'object') {
        currentData.sections = {};
      }

      currentSchema.sections.forEach(sec => {
        const secId = sec.id || sec.key;
        if (!currentData.sections[secId]) {
          currentData.sections[secId] = {
            enabled: sec.required ? true : (sec.enabledByDefault !== false),
            layout: sec.defaultLayout || (sec.layouts && sec.layouts[0]) || null
          };
        } else if (typeof currentData.sections[secId] === 'boolean') {
          currentData.sections[secId] = {
            enabled: currentData.sections[secId],
            layout: sec.defaultLayout || (sec.layouts && sec.layouts[0]) || null
          };
        } else if (typeof currentData.sections[secId] === 'object') {
          if (currentData.sections[secId].enabled === undefined) {
            currentData.sections[secId].enabled = sec.required ? true : (sec.enabledByDefault !== false);
          }
          if (!currentData.sections[secId].layout && (sec.defaultLayout || (sec.layouts && sec.layouts[0]))) {
            currentData.sections[secId].layout = sec.defaultLayout || sec.layouts[0];
          }
        }
      });

      if (!Array.isArray(currentData.sectionOrder) || currentData.sectionOrder.length === 0) {
        currentData.sectionOrder = currentSchema.sections.map(s => s.id || s.key);
      }

      // Initialize and normalize WishMagicData.visual (Part 6 - Spec 30, 32, 61, 63)
      if (!currentData.visual || typeof currentData.visual !== 'object') {
        currentData.visual = {};
      }

      const visualCap = currentSchema.visual || {};

      // Normalize Theme
      if (visualCap.themes && visualCap.themes.supported && visualCap.themes.supported.length > 0) {
        if (!currentData.visual.theme || !visualCap.themes.supported.includes(currentData.visual.theme)) {
          currentData.visual.theme = currentData.theme && visualCap.themes.supported.includes(currentData.theme)
            ? currentData.theme
            : (visualCap.themes.default || visualCap.themes.supported[0]);
        }
      } else {
        delete currentData.visual.theme;
      }
      currentData.theme = currentData.visual.theme || currentData.theme;

      // Normalize Colors
      if (!currentData.visual.colors || typeof currentData.visual.colors !== 'object') {
        currentData.visual.colors = {};
      }
      if (visualCap.colors && visualCap.colors.supported) {
        visualCap.colors.supported.forEach(colKey => {
          if (currentData.visual.colors[colKey] === undefined) {
            currentData.visual.colors[colKey] = (visualCap.colors.defaults && visualCap.colors.defaults[colKey]) || null;
          }
        });
      }

      // Normalize Background
      if (visualCap.backgrounds && visualCap.backgrounds.supported && visualCap.backgrounds.supported.length > 0) {
        if (!currentData.visual.background || !visualCap.backgrounds.supported.includes(currentData.visual.background)) {
          currentData.visual.background = visualCap.backgrounds.default || visualCap.backgrounds.supported[0];
        }
      } else {
        delete currentData.visual.background;
      }

      // Normalize Surface
      if (visualCap.surfaces && visualCap.surfaces.supported && visualCap.surfaces.supported.length > 0) {
        if (!currentData.visual.surface || !visualCap.surfaces.supported.includes(currentData.visual.surface)) {
          currentData.visual.surface = visualCap.surfaces.default || visualCap.surfaces.supported[0];
        }
      } else {
        delete currentData.visual.surface;
      }

      // Normalize Button Style
      if (visualCap.buttons && visualCap.buttons.supported && visualCap.buttons.supported.length > 0) {
        if (!currentData.visual.buttonStyle || !visualCap.buttons.supported.includes(currentData.visual.buttonStyle)) {
          currentData.visual.buttonStyle = visualCap.buttons.default || visualCap.buttons.supported[0];
        }
      } else {
        delete currentData.visual.buttonStyle;
      }

      // Normalize Typography
      if (visualCap.typography && visualCap.typography.supported && visualCap.typography.supported.length > 0) {
        if (!currentData.visual.typography || typeof currentData.visual.typography !== 'object') {
          currentData.visual.typography = {};
        }
        if (visualCap.typography.fonts && visualCap.typography.fonts.length > 0) {
          if (!currentData.visual.typography.headingFont) {
            currentData.visual.typography.headingFont = visualCap.typography.fonts[0];
          }
          if (!currentData.visual.typography.bodyFont) {
            currentData.visual.typography.bodyFont = visualCap.typography.fonts[0];
          }
        }
      } else {
        delete currentData.visual.typography;
      }

      // Normalize Intensity
      if (visualCap.intensity && visualCap.intensity.supported && visualCap.intensity.supported.length > 0) {
        if (!currentData.visual.intensity || !visualCap.intensity.supported.includes(currentData.visual.intensity)) {
          currentData.visual.intensity = visualCap.intensity.default || visualCap.intensity.supported[0];
        }
      } else {
        delete currentData.visual.intensity;
      }

      // Initialize and normalize WishMagicData.media & mediaSettings (Part 8 - Spec 43, 77, 81)
      if (!currentData.media || typeof currentData.media !== 'object') {
        currentData.media = {};
      }
      if (!currentData.mediaSettings || typeof currentData.mediaSettings !== 'object') {
        currentData.mediaSettings = {};
      }

      const mediaCap = currentSchema.media || {};
      const declaredSlots = mediaCap.slots || [];
      const declaredSlotIds = new Set(declaredSlots.map(s => s.id));

      // Remove slots from active state that are unsupported in this template (Spec 81)
      if (declaredSlots.length > 0) {
        Object.keys(currentData.media).forEach(k => {
          if (!declaredSlotIds.has(k)) {
            delete currentData.media[k];
          }
        });
      }

      // Synchronize global window.WishMagicData
      global.WishMagicData = currentData;
      isDirtyState = false;

      // Connect runtime bridge if preview is provided
      if (options.previewTarget || options.previewIframe) {
        const previewEl = options.previewTarget || options.previewIframe;
        WishMagicRuntimeBridge.init(previewEl);
      }

      if (options.onChange) {
        this.onChange(options.onChange);
      }

      if (options.container) {
        this.render(options.container);
      }

      // Dispatch initial data to preview
      this.updatePreview();

      return this;
    },

    /**
     * Get dirty state
     */
    isDirty() {
      return isDirtyState;
    },

    /**
     * Register Change Listener
     */
    onChange(callback) {
      if (typeof callback === 'function') {
        changeListeners.push(callback);
      }
    },

    /**
     * Set specific field value
     */
    setValue(key, value) {
      if (!key) return;

      const oldValue = currentData[key];
      currentData[key] = value;
      global.WishMagicData = currentData;
      isDirtyState = true;

      // Update Preview via Runtime Bridge
      WishMagicRuntimeBridge.updateField(key, value);
      WishMagicRuntimeBridge.updateState(currentData);

      // Notify Change Listeners
      const changeObj = { key, oldValue, newValue: value };
      changeListeners.forEach(cb => {
        try {
          cb(changeObj);
        } catch (e) {
          console.warn('Customizer change listener error:', e);
        }
      });

      // Update matching DOM control if rendered
      this.syncFieldToDOM(key, value);

      // Re-evaluate dependencies & update dynamic UI
      if (global.WishMagicDependencies && typeof global.WishMagicDependencies.evaluateAll === 'function' && currentSchema?.fields) {
        const evaluated = global.WishMagicDependencies.evaluateAll(currentSchema.fields, currentData);
        if (currentContainer) {
          global.WishMagicDependencies.updateDOM(currentContainer, evaluated);
        }
      }
    },

    /**
     * Get specific field value
     */
    getValue(key) {
      return currentData[key];
    },

    /**
     * Get full clean serializable data object
     */
    getData() {
      // Return a clean serializable clone without DOM/Functions
      return JSON.parse(JSON.stringify(currentData));
    },

    /**
     * Validate all fields
     */
    validate() {
      const errors = [];
      if (!currentSchema || !currentSchema.fields) {
        return { valid: true, errors: [] };
      }

      // 1. Run WishMagicContent validator if available
      if (global.WishMagicContent && typeof global.WishMagicContent.validate === 'function') {
        const contentValidation = global.WishMagicContent.validate(currentData.content || currentData);
        if (contentValidation && Array.isArray(contentValidation.errors)) {
          contentValidation.errors.forEach(err => {
            if (!errors.some(e => e.field === err.field)) {
              errors.push(err);
            }
          });
        }
      }

      currentSchema.fields.forEach(field => {
        const val = currentData[field.key];
        const isBlank = val === undefined || val === null || String(val).trim() === '' || (Array.isArray(val) && val.length === 0);

        // Required check
        if (field.required && isBlank) {
          if (!errors.some(e => e.field === field.key)) {
            errors.push({
              field: field.key,
              code: 'REQUIRED',
              message: `${field.label} is required.`
            });
          }
          return;
        }

        if (isBlank) return;

        // Minlength check
        if (field.minlength !== null && field.minlength !== undefined && typeof val === 'string' && val.length < field.minlength) {
          if (!errors.some(e => e.field === field.key)) {
            errors.push({
              field: field.key,
              code: 'MIN_LENGTH',
              message: `${field.label} must be at least ${field.minlength} characters.`
            });
          }
        }

        // Maxlength check
        if (field.maxLength && val && String(val).length > field.maxLength) {
          if (!errors.some(e => e.field === field.key)) {
            errors.push({
              field: field.key,
              code: 'MAX_LENGTH',
              message: `${field.label} exceeds maximum allowed length of ${field.maxLength} characters.`
            });
          }
        }

        // Select allowed options check
        if ((field.type === 'select' || field.type === 'multiselect') && field.options.length > 0 && val) {
          const allowedValues = field.options.map(o => o.value);
          if (field.type === 'select') {
            if (!allowedValues.includes(val)) {
              if (!errors.some(e => e.field === field.key)) {
                errors.push({
                  field: field.key,
                  code: 'INVALID_OPTION',
                  message: `Invalid option selected for ${field.label}.`
                });
              }
            }
          }
        }
      });

      // Validate declared media capability slots (Part 8 - Spec 59, 60, 99, 100)
      if (currentSchema.media && Array.isArray(currentSchema.media.slots)) {
        currentSchema.media.slots.forEach(slot => {
          const slotVal = currentData.media && currentData.media[slot.id];
          if (slot.multiple) {
            const items = Array.isArray(slotVal) ? slotVal : [];
            if (slot.required && items.length === 0) {
              errors.push({
                field: slot.id,
                message: `${slot.label || slot.id} is required.`
              });
            } else if (typeof slot.minItems === 'number' && items.length < slot.minItems) {
              errors.push({
                field: slot.id,
                message: `${slot.label || slot.id} requires at least ${slot.minItems} items (currently ${items.length}).`
              });
            } else if (typeof slot.maxItems === 'number' && items.length > slot.maxItems) {
              errors.push({
                field: slot.id,
                message: `${slot.label || slot.id} exceeds maximum of ${slot.maxItems} items (currently ${items.length}).`
              });
            }
          } else {
            if (slot.required && (!slotVal || !slotVal.url)) {
              errors.push({
                field: slot.id,
                message: `${slot.label || slot.id} is required.`
              });
            }
          }
        });
      }

      this.renderValidationErrors(errors);
      return {
        valid: errors.length === 0,
        errors
      };
    },

    /**
     * Display validation errors in the UI
     */
    renderValidationErrors(errors) {
      if (!currentContainer) return;

      // Clear previous error messages & highlights
      currentContainer.querySelectorAll('.wm-field-error').forEach(el => el.remove());
      currentContainer.querySelectorAll('.wm-field-invalid').forEach(el => el.classList.remove('wm-field-invalid', 'border-red-500'));

      if (errors.length === 0) return;

      let firstInvalidEl = null;

      errors.forEach(err => {
        const fieldEl = currentContainer.querySelector(`[data-wm-control-for="${err.field}"]`);
        if (fieldEl) {
          fieldEl.classList.add('wm-field-invalid', 'border-red-500');
          if (!firstInvalidEl) firstInvalidEl = fieldEl;

          const errBanner = document.createElement('p');
          errBanner.className = 'wm-field-error text-xs text-red-500 font-semibold mt-1 flex items-center gap-1';
          errBanner.innerHTML = `<span class="material-symbols-outlined text-sm">error</span><span>${escapeHTML(err.message)}</span>`;
          fieldEl.parentNode.appendChild(errBanner);
        }
      });

      if (firstInvalidEl && typeof firstInvalidEl.scrollIntoView === 'function') {
        firstInvalidEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof firstInvalidEl.focus === 'function') firstInvalidEl.focus();
      }
    },

    /**
     * Reset customizer to defaults
     */
    reset() {
      if (!currentSchema) return;

      currentSchema.fields.forEach(f => {
        currentData[f.key] = f.defaultValue !== null ? f.defaultValue : '';
      });

      global.WishMagicData = currentData;
      isDirtyState = false;

      this.updatePreview();
      if (currentContainer) {
        this.render(currentContainer);
      }
    },

    /**
     * Send current state to preview
     */
    updatePreview() {
      WishMagicRuntimeBridge.updateState(currentData);
    },

    /**
     * Synchronize a specific value to its DOM control
     */
    syncFieldToDOM(key, value) {
      if (!currentContainer) return;
      const input = currentContainer.querySelector(`[data-wm-control-for="${key}"]`);
      if (!input) return;

      if (input.type === 'file') {
        // Never set non-empty string on <input type="file">
      } else if (input.type === 'checkbox') {
        input.checked = Boolean(value);
      } else if (input.tagName === 'SELECT' || input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
        try {
          input.value = value !== undefined && value !== null ? value : '';
        } catch (_) {}
      }

      // Update live character counter if textarea
      const charCounter = currentContainer.querySelector(`[data-wm-charcount-for="${key}"]`);
      if (charCounter) {
        const len = value ? String(value).length : 0;
        const max = charCounter.getAttribute('data-wm-max') || '500';
        charCounter.textContent = `${len} / ${max}`;
      }
    },

    /**
     * Render the Customizer into a container element
     * @param {HTMLElement|string} container
     */
    render(container) {
      const target = typeof container === 'string' ? document.querySelector(container) : container;
      if (!target) return;
      currentContainer = target;

      if (!currentSchema) {
        target.innerHTML = `
          <div class="p-6 text-center text-sm text-purple-800/70 dark:text-purple-300/70">
            <span class="material-symbols-outlined text-3xl mb-2 text-pink-500">auto_fix</span>
            <p>No template capability schema available.</p>
          </div>
        `;
        return;
      }

      // Build Customizer UI
      let html = `<div class="wishmagic-auto-customizer flex flex-col gap-5 w-full">`;

      // Render Field Groups
      currentSchema.groups.forEach((group, grpIdx) => {
        html += `
          <div class="wm-group-card rounded-3xl bg-white/80 dark:bg-purple-950/50 backdrop-blur-md border border-purple-200/60 dark:border-purple-800/50 p-5 sm:p-6 shadow-xl shadow-purple-900/5 transition-all">
            <div class="flex items-center gap-2.5 pb-3.5 mb-4 border-b border-purple-100 dark:border-purple-800/40">
              <span class="material-symbols-outlined text-xl text-pink-500">${escapeHTML(group.icon)}</span>
              <h3 class="text-sm font-bold text-purple-950 dark:text-purple-100 tracking-tight">${escapeHTML(group.title)}</h3>
            </div>
            <div class="flex flex-col gap-4">
        `;

        group.fields.forEach(field => {
          html += this.renderFieldControl(field);
        });

        html += `
            </div>
          </div>
        `;
      });

      // Render Dynamic Sections Panel (Part 5 - Spec 8, 14, 15, 28, 35, 40, 59, 64, 65)
      if (currentSchema.sections && currentSchema.sections.length > 0) {
        html += this.renderSectionsManagerHTML();
      }

      // Render Dynamic Media Capabilities Panel (Part 8 - Spec 1 to 90)
      if (this.hasMediaSlots()) {
        html += this.renderMediaManagerHTML();
      }

      // Render Dynamic Visual & Themes System (Part 6 - Spec 3, 11, 14, 18, 20, 22, 28, 41, 42)
      if (this.hasVisualControls()) {
        html += this.renderVisualManagerHTML();
      }

      html += `</div>`;
      target.innerHTML = html;

      // Initial dependency evaluation and DOM update
      if (global.WishMagicDependencies && typeof global.WishMagicDependencies.evaluateAll === 'function' && currentSchema?.fields) {
        const evaluated = global.WishMagicDependencies.evaluateAll(currentSchema.fields, currentData);
        global.WishMagicDependencies.updateDOM(target, evaluated);
      }
    },

    /**
     * Render individual field controls
     */
    renderFieldControl(field) {
      const val = currentData[field.key] !== undefined && currentData[field.key] !== null ? currentData[field.key] : (field.defaultValue || '');
      const reqIndicator = field.required ? '<span class="text-pink-500 font-bold ml-0.5" aria-hidden="true">*</span>' : '';
      const visibleAttr = field.visibleIf ? `data-wm-visible-if="${escapeHTML(field.visibleIf)}"` : '';

      switch (field.type) {
        case 'text':
        case 'phone':
        case 'email':
        case 'url': {
          const max = field.maxLength || null;
          const len = String(val).length;
          return `
            <div class="wm-control-wrapper flex flex-col gap-1.5" ${visibleAttr}>
              <div class="flex items-center justify-between">
                <label for="wm-field-${escapeHTML(field.key)}" class="text-xs font-bold text-purple-900 dark:text-purple-200">
                  ${escapeHTML(field.label)} ${reqIndicator}
                </label>
                ${max ? `<span data-wm-charcount-for="${escapeHTML(field.key)}" data-wm-max="${max}" class="text-[10px] font-mono text-purple-600 dark:text-purple-400">${len} / ${max}</span>` : ''}
              </div>
              <input
                id="wm-field-${escapeHTML(field.key)}"
                data-wm-control-for="${escapeHTML(field.key)}"
                type="${field.type === 'phone' ? 'tel' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}"
                value="${escapeHTML(val)}"
                placeholder="${escapeHTML(field.placeholder || 'Enter ' + field.label.toLowerCase())}"
                ${max ? `maxlength="${max}"` : ''}
                ${field.required ? 'aria-required="true" required' : ''}
                aria-label="${escapeHTML(field.label)}"
                class="w-full text-xs sm:text-sm font-semibold rounded-2xl border border-purple-200/80 dark:border-purple-800/60 px-4 py-3 bg-white dark:bg-purple-950/60 text-purple-950 dark:text-purple-100 focus:outline-none focus:ring-2 focus:ring-pink-500 transition shadow-inner"
                oninput="window.WishMagicCustomizer.setValue('${escapeHTML(field.key)}', this.value)"
              />
            </div>
          `;
        }

        case 'textarea': {
          const max = field.maxLength || 500;
          const len = String(val).length;
          return `
            <div class="wm-control-wrapper flex flex-col gap-1.5" ${visibleAttr}>
              <div class="flex items-center justify-between">
                <label for="wm-field-${escapeHTML(field.key)}" class="text-xs font-bold text-purple-900 dark:text-purple-200">
                  ${escapeHTML(field.label)} ${reqIndicator}
                </label>
                <span data-wm-charcount-for="${escapeHTML(field.key)}" data-wm-max="${max}" class="text-[10px] font-mono text-purple-600 dark:text-purple-400">
                  ${len} / ${max}
                </span>
              </div>
              <textarea
                id="wm-field-${escapeHTML(field.key)}"
                data-wm-control-for="${escapeHTML(field.key)}"
                rows="4"
                maxlength="${max}"
                ${field.required ? 'aria-required="true" required' : ''}
                aria-label="${escapeHTML(field.label)}"
                placeholder="${escapeHTML(field.placeholder || 'Write your message here...')}"
                class="w-full text-xs sm:text-sm font-medium rounded-2xl border border-purple-200/80 dark:border-purple-800/60 p-4 bg-white dark:bg-purple-950/60 text-purple-950 dark:text-purple-100 focus:outline-none focus:ring-2 focus:ring-pink-500 transition shadow-inner leading-relaxed"
                oninput="window.WishMagicCustomizer.setValue('${escapeHTML(field.key)}', this.value)"
              >${escapeHTML(val)}</textarea>
            </div>
          `;
        }

        case 'date':
        case 'time':
        case 'datetime':
          return `
            <div class="wm-control-wrapper flex flex-col gap-1.5" ${visibleAttr}>
              <label for="wm-field-${escapeHTML(field.key)}" class="text-xs font-bold text-purple-900 dark:text-purple-200">
                ${escapeHTML(field.label)} ${reqIndicator}
              </label>
              <input
                id="wm-field-${escapeHTML(field.key)}"
                data-wm-control-for="${escapeHTML(field.key)}"
                type="${field.type === 'datetime' ? 'datetime-local' : field.type === 'time' ? 'time' : 'date'}"
                value="${escapeHTML(val)}"
                ${field.required ? 'aria-required="true" required' : ''}
                aria-label="${escapeHTML(field.label)}"
                class="w-full text-xs sm:text-sm font-semibold rounded-2xl border border-purple-200/80 dark:border-purple-800/60 px-4 py-3 bg-white dark:bg-purple-950/60 text-purple-950 dark:text-purple-100 focus:outline-none focus:ring-2 focus:ring-pink-500 transition shadow-inner cursor-pointer"
                onchange="window.WishMagicCustomizer.setValue('${escapeHTML(field.key)}', this.value)"
              />
            </div>
          `;

        case 'number': {
          const min = field.min !== null ? `min="${field.min}"` : '';
          const max = field.max !== null ? `max="${field.max}"` : '';
          const step = field.step !== null ? `step="${field.step}"` : '';
          return `
            <div class="wm-control-wrapper flex flex-col gap-1.5" ${visibleAttr}>
              <label for="wm-field-${escapeHTML(field.key)}" class="text-xs font-bold text-purple-900 dark:text-purple-200">
                ${escapeHTML(field.label)} ${reqIndicator}
              </label>
              <input
                id="wm-field-${escapeHTML(field.key)}"
                data-wm-control-for="${escapeHTML(field.key)}"
                type="number"
                value="${escapeHTML(val)}"
                ${min} ${max} ${step}
                ${field.required ? 'aria-required="true" required' : ''}
                aria-label="${escapeHTML(field.label)}"
                class="w-full text-xs sm:text-sm font-semibold rounded-2xl border border-purple-200/80 dark:border-purple-800/60 px-4 py-3 bg-white dark:bg-purple-950/60 text-purple-950 dark:text-purple-100 focus:outline-none focus:ring-2 focus:ring-pink-500 transition shadow-inner"
                oninput="window.WishMagicCustomizer.setValue('${escapeHTML(field.key)}', Number(this.value))"
              />
            </div>
          `;
        }

        case 'range': {
          const minVal = field.min !== null ? field.min : 0;
          const maxVal = field.max !== null ? field.max : 100;
          const stepVal = field.step !== null ? field.step : 1;
          const currentNum = val !== '' ? val : minVal;
          return `
            <div class="wm-control-wrapper flex flex-col gap-1.5" ${visibleAttr}>
              <div class="flex items-center justify-between">
                <label for="wm-field-${escapeHTML(field.key)}" class="text-xs font-bold text-purple-900 dark:text-purple-200">
                  ${escapeHTML(field.label)} ${reqIndicator}
                </label>
                <span id="wm-range-val-${escapeHTML(field.key)}" class="text-xs font-mono font-bold text-pink-500">${currentNum}</span>
              </div>
              <input
                id="wm-field-${escapeHTML(field.key)}"
                data-wm-control-for="${escapeHTML(field.key)}"
                type="range"
                value="${escapeHTML(currentNum)}"
                min="${minVal}"
                max="${maxVal}"
                step="${stepVal}"
                aria-label="${escapeHTML(field.label)}"
                class="w-full h-2 rounded-lg appearance-none bg-purple-200 dark:bg-purple-800 accent-pink-500 cursor-pointer"
                oninput="document.getElementById('wm-range-val-${escapeHTML(field.key)}').textContent = this.value; window.WishMagicCustomizer.setValue('${escapeHTML(field.key)}', Number(this.value));"
              />
            </div>
          `;
        }

        case 'color':
          return `
            <div class="wm-control-wrapper flex items-center justify-between p-3 rounded-2xl bg-purple-50/60 dark:bg-purple-900/30 border border-purple-100/80 dark:border-purple-800/40" ${visibleAttr}>
              <label for="wm-field-${escapeHTML(field.key)}" class="text-xs font-bold text-purple-900 dark:text-purple-200">
                ${escapeHTML(field.label)} ${reqIndicator}
              </label>
              <input
                id="wm-field-${escapeHTML(field.key)}"
                data-wm-control-for="${escapeHTML(field.key)}"
                type="color"
                value="${escapeHTML(val || '#ec4899')}"
                aria-label="${escapeHTML(field.label)}"
                class="w-9 h-9 rounded-xl border-0 cursor-pointer bg-transparent"
                onchange="window.WishMagicCustomizer.setValue('${escapeHTML(field.key)}', this.value)"
              />
            </div>
          `;

        case 'select':
          return `
            <div class="wm-control-wrapper flex flex-col gap-1.5" ${visibleAttr}>
              <label for="wm-field-${escapeHTML(field.key)}" class="text-xs font-bold text-purple-900 dark:text-purple-200">
                ${escapeHTML(field.label)} ${reqIndicator}
              </label>
              <select
                id="wm-field-${escapeHTML(field.key)}"
                data-wm-control-for="${escapeHTML(field.key)}"
                aria-label="${escapeHTML(field.label)}"
                class="w-full text-xs sm:text-sm font-semibold rounded-2xl border border-purple-200/80 dark:border-purple-800/60 px-4 py-3 bg-white dark:bg-purple-950/60 text-purple-950 dark:text-purple-100 focus:outline-none focus:ring-2 focus:ring-pink-500 transition shadow-inner cursor-pointer"
                onchange="window.WishMagicCustomizer.setValue('${escapeHTML(field.key)}', this.value)"
              >
                ${(field.options || []).map(opt => `<option value="${escapeHTML(opt.value)}" ${opt.value === val ? 'selected' : ''}>${escapeHTML(opt.label)}</option>`).join('')}
              </select>
            </div>
          `;

        case 'multiselect': {
          const selectedList = Array.isArray(val) ? val : (val ? [val] : []);
          return `
            <div class="wm-control-wrapper flex flex-col gap-2" ${visibleAttr}>
              <label class="text-xs font-bold text-purple-900 dark:text-purple-200">
                ${escapeHTML(field.label)} ${reqIndicator}
              </label>
              <div class="flex flex-wrap gap-2">
                ${(field.options || []).map(opt => {
                  const isChecked = selectedList.includes(opt.value);
                  return `
                    <label class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer border transition ${isChecked ? 'bg-pink-500 text-white border-pink-500' : 'bg-purple-50 dark:bg-purple-900/40 text-purple-900 dark:text-purple-200 border-purple-200 dark:border-purple-800'}">
                      <input
                        type="checkbox"
                        value="${escapeHTML(opt.value)}"
                        ${isChecked ? 'checked' : ''}
                        class="sr-only"
                        onchange="
                          const currentArr = Array.isArray(window.WishMagicCustomizer.getValue('${escapeHTML(field.key)}')) ? [...window.WishMagicCustomizer.getValue('${escapeHTML(field.key)}')] : [];
                          if (this.checked) { if (!currentArr.includes('${escapeHTML(opt.value)}')) currentArr.push('${escapeHTML(opt.value)}'); }
                          else { const idx = currentArr.indexOf('${escapeHTML(opt.value)}'); if (idx !== -1) currentArr.splice(idx, 1); }
                          window.WishMagicCustomizer.setValue('${escapeHTML(field.key)}', currentArr);
                        "
                      />
                      <span>${escapeHTML(opt.label)}</span>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        case 'toggle':
          return `
            <div class="wm-control-wrapper flex items-center justify-between p-3 rounded-2xl bg-purple-50/60 dark:bg-purple-900/30 border border-purple-100/80 dark:border-purple-800/40" ${visibleAttr}>
              <div>
                <p class="text-xs font-bold text-purple-950 dark:text-purple-100">${escapeHTML(field.label)} ${reqIndicator}</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  id="wm-field-${escapeHTML(field.key)}"
                  data-wm-control-for="${escapeHTML(field.key)}"
                  type="checkbox"
                  class="sr-only peer"
                  aria-label="${escapeHTML(field.label)}"
                  ${val ? 'checked' : ''}
                  onchange="window.WishMagicCustomizer.setValue('${escapeHTML(field.key)}', this.checked)"
                />
                <div class="w-9 h-5 bg-purple-200 dark:bg-purple-900 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-500"></div>
              </label>
            </div>
          `;

        case 'font': {
          const fonts = [
            { value: 'Inter, sans-serif', label: 'Inter' },
            { value: "'Playfair Display', serif", label: 'Playfair Display' },
            { value: "'Dancing Script', cursive", label: 'Dancing Script' },
            { value: "'Great Vibes', cursive", label: 'Great Vibes' },
            { value: "'Poppins', sans-serif", label: 'Poppins' },
            { value: "'Caveat', cursive", label: 'Caveat' },
            { value: "'Pacifico', cursive", label: 'Pacifico' },
            { value: "'Cinzel', serif", label: 'Cinzel' },
            { value: "'Satisfy', cursive", label: 'Satisfy' }
          ];
          const currentFont = String(val || fonts[0].value);
          return `
            <div class="wm-control-wrapper flex flex-col gap-1.5" ${visibleAttr}>
              <label for="wm-field-${escapeHTML(field.key)}" class="text-xs font-bold text-purple-900 dark:text-purple-200">
                ${escapeHTML(field.label)} ${reqIndicator}
              </label>
              <select
                id="wm-field-${escapeHTML(field.key)}"
                data-wm-control-for="${escapeHTML(field.key)}"
                aria-label="${escapeHTML(field.label)}"
                class="w-full text-xs sm:text-sm font-semibold rounded-2xl border border-purple-200/80 dark:border-purple-800/60 px-4 py-3 bg-white dark:bg-purple-950/60 text-purple-950 dark:text-purple-100 focus:outline-none focus:ring-2 focus:ring-pink-500 transition shadow-inner cursor-pointer"
                onchange="window.WishMagicCustomizer.setValue('${escapeHTML(field.key)}', this.value)"
              >
                ${fonts.map(f => `<option value="${escapeHTML(f.value)}" ${f.value === currentFont ? 'selected' : ''}>${escapeHTML(f.label)}</option>`).join('')}
              </select>
            </div>
          `;
        }

        case 'icon': {
          const icons = ['❤️', '🎂', '🎉', '🌟', '💍', '🌸', '🎁', '🕊️', '🥂', '🎈', '💖', '👑', '✨', '🌺'];
          const currentIcon = String(val || icons[0]);
          return `
            <div class="wm-control-wrapper flex flex-col gap-1.5" ${visibleAttr}>
              <label class="text-xs font-bold text-purple-900 dark:text-purple-200">
                ${escapeHTML(field.label)} ${reqIndicator}
              </label>
              <div class="grid grid-cols-7 gap-1.5 p-2 bg-purple-50/50 dark:bg-purple-900/30 rounded-2xl border border-purple-100 dark:border-purple-800/50">
                ${icons.map(ic => `
                  <button type="button" class="w-8 h-8 rounded-xl flex items-center justify-center text-base transition ${ic === currentIcon ? 'bg-pink-500 text-white shadow-sm' : 'hover:bg-purple-200/60 dark:hover:bg-purple-800'}" onclick="window.WishMagicCustomizer.setValue('${escapeHTML(field.key)}', '${escapeHTML(ic)}')">
                    ${escapeHTML(ic)}
                  </button>
                `).join('')}
              </div>
            </div>
          `;
        }

        case 'image':
          return `
            <div class="wm-control-wrapper flex flex-col gap-2">
              <label class="text-xs font-bold text-purple-900 dark:text-purple-200">
                ${escapeHTML(field.label)} ${reqIndicator}
              </label>
              <div class="flex items-center gap-3">
                <div class="w-16 h-16 rounded-2xl bg-purple-100 dark:bg-purple-900/60 border border-purple-200 dark:border-purple-800 overflow-hidden flex items-center justify-center shrink-0 shadow-inner">
                  ${
                    val
                      ? `<img src="${escapeHTML(val)}" id="wm-img-prev-${escapeHTML(field.key)}" class="w-full h-full object-cover" alt="Preview"/>`
                      : `<img src="/assets/file_ab2082.png" id="wm-img-prev-${escapeHTML(field.key)}" class="w-full h-full object-cover opacity-60" alt="Preview"/>`
                  }
                </div>
                <div class="flex flex-col gap-1.5 flex-1">
                  <div class="flex items-center gap-2">
                    <button type="button" onclick="document.getElementById('wm-file-${escapeHTML(field.key)}').click()" class="px-3.5 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-bold text-xs shadow-md shadow-pink-500/20 transition active:scale-95 flex items-center gap-1.5">
                      <span class="material-symbols-outlined text-sm">cloud_upload</span>
                      <span>Upload Photo</span>
                    </button>
                    ${
                      val
                        ? `<button type="button" onclick="window.WishMagicCustomizer.handleRemoveImage('${escapeHTML(field.key)}')" class="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs font-semibold hover:bg-red-100 transition" title="Remove Photo"><span class="material-symbols-outlined text-base">delete</span></button>`
                        : ''
                    }
                  </div>
                  <input type="file" id="wm-file-${escapeHTML(field.key)}" accept="image/*" class="hidden" onchange="window.WishMagicCustomizer.handleImageUpload('${escapeHTML(field.key)}', this)"/>
                  <span class="text-[10px] text-purple-600 dark:text-purple-400">JPG, PNG, WEBP (Max 5MB)</span>
                </div>
              </div>
            </div>
          `;

        case 'audio':
          return `
            <div class="wm-control-wrapper flex flex-col gap-2">
              <label class="text-xs font-bold text-purple-900 dark:text-purple-200">
                ${escapeHTML(field.label)} ${reqIndicator}
              </label>
              <div class="flex items-center gap-2">
                <button type="button" onclick="document.getElementById('wm-file-${escapeHTML(field.key)}').click()" class="px-3.5 py-2 rounded-xl bg-purple-900 dark:bg-purple-800 hover:bg-purple-800 text-white font-bold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-sm">music_note</span>
                  <span>Choose Audio Track</span>
                </button>
                <input type="file" id="wm-file-${escapeHTML(field.key)}" accept="audio/*" class="hidden" onchange="window.WishMagicCustomizer.handleAudioUpload('${escapeHTML(field.key)}', this)"/>
              </div>
            </div>
          `;

        default:
          return `
            <div class="wm-control-wrapper flex flex-col gap-1.5">
              <label for="wm-field-${escapeHTML(field.key)}" class="text-xs font-bold text-purple-900 dark:text-purple-200">
                ${escapeHTML(field.label)} ${reqIndicator}
              </label>
              <input
                id="wm-field-${escapeHTML(field.key)}"
                data-wm-control-for="${escapeHTML(field.key)}"
                type="text"
                value="${escapeHTML(val)}"
                class="w-full text-xs sm:text-sm font-semibold rounded-2xl border border-purple-200/80 dark:border-purple-800/60 px-4 py-3 bg-white dark:bg-purple-950/60 text-purple-950 dark:text-purple-100 focus:outline-none focus:ring-2 focus:ring-pink-500 transition shadow-inner"
                oninput="window.WishMagicCustomizer.setValue('${escapeHTML(field.key)}', this.value)"
              />
            </div>
          `;
      }
    },

    /**
     * File Upload Handlers
     */
    async handleImageUpload(key, input) {
      if (!input || !input.files || !input.files[0]) return;
      const file = input.files[0];

      if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file (PNG, JPG, WEBP, GIF)');
        return;
      }

      if (file.size > 16 * 1024 * 1024) {
        alert('Image file size must not exceed 16MB');
        return;
      }

      const tempBlobUrl = URL.createObjectURL(file);
      activeCreatedObjectURLs.add(tempBlobUrl);
      this.setValue(key, tempBlobUrl);
      if (currentContainer) this.render(currentContainer);

      try {
        if (global.WishMediaSystem && global.WishMediaSystem.ImageProcessor) {
          const uploaded = await global.WishMediaSystem.ImageProcessor.processImageFile(file);
          if (uploaded && (uploaded.displayUrl || uploaded.url || uploaded.src)) {
            this.setValue(key, uploaded.displayUrl || uploaded.url || uploaded.src);
            if (currentContainer) this.render(currentContainer);
            return;
          }
        }
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        const apiRes = await fetch('/api/imgbb/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileData: dataUrl,
            filename: file.name,
            type: 'image',
            title: file.name.replace(/\.[^/.]+$/, '')
          })
        });
        const apiJson = await apiRes.json().catch(() => ({}));
        const payload = apiJson?.data || apiJson || {};
        const liveUrl = payload.displayUrl || payload.url || payload.track?.url;
        if (apiRes.ok && liveUrl) {
          this.setValue(key, liveUrl);
          if (currentContainer) this.render(currentContainer);
        }
      } catch (e) {
        console.warn('[Customizer Image ImgBB Upload Fallback]:', e);
      }
    },

    hasMediaSlots() {
      if (!currentSchema || !currentSchema.media) return false;
      const slots = currentSchema.media.slots;
      return Array.isArray(slots) && slots.length > 0;
    },

    renderMediaManagerHTML() {
      if (!this.hasMediaSlots()) return '';
      const slots = currentSchema.media.slots || [];

      let html = `
        <div id="wm-dynamic-media-panel" class="wm-group-card rounded-3xl bg-white/80 dark:bg-purple-950/50 backdrop-blur-md border border-purple-200/60 dark:border-purple-800/50 p-5 sm:p-6 shadow-xl shadow-purple-900/5">
          <div class="flex items-center justify-between pb-3.5 mb-4 border-b border-purple-100 dark:border-purple-800/40">
            <div class="flex items-center gap-2.5">
              <span class="material-symbols-outlined text-xl text-pink-500">perm_media</span>
              <div>
                <h3 class="text-sm font-bold text-purple-950 dark:text-purple-100 tracking-tight">Media & Keepsakes</h3>
                <p class="text-[11px] text-purple-700/70 dark:text-purple-300/70">Declared template photos, music, video & voice dedictions</p>
              </div>
            </div>
          </div>
          <div class="flex flex-col gap-4">
      `;

      slots.forEach(slot => {
        const slotVal = (currentData.media && currentData.media[slot.id]) || null;
        const reqBadge = slot.required ? '<span class="text-pink-500 font-bold ml-0.5">*</span>' : '';

        if (slot.multiple) {
          // Multiple Images / Gallery
          const items = Array.isArray(slotVal) ? slotVal : [];
          const countSatisfied = typeof slot.minItems === 'number' && items.length >= slot.minItems;
          const countExceeded = typeof slot.maxItems === 'number' && items.length > slot.maxItems;

          html += `
            <div class="wm-media-slot p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-800/40 flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="text-xs font-bold text-purple-950 dark:text-purple-100">${escapeHTML(slot.label)} ${reqBadge}</h4>
                  <p class="text-[10px] text-purple-600 dark:text-purple-400">
                    ${items.length} / ${slot.maxItems || 8} items ${slot.minItems ? `(Min: ${slot.minItems})` : ''}
                  </p>
                </div>
                ${items.length < (slot.maxItems || 8) ? `
                  <button type="button" onclick="document.getElementById('wm-media-input-${escapeHTML(slot.id)}').click()" class="px-3 py-1.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-bold text-xs shadow-md shadow-pink-500/20 transition active:scale-95 flex items-center gap-1.5" aria-label="Add photos to ${escapeHTML(slot.label)}">
                    <span class="material-symbols-outlined text-sm">add_photo_alternate</span>
                    <span>Add Photos</span>
                  </button>
                ` : ''}
              </div>
              <input type="file" id="wm-media-input-${escapeHTML(slot.id)}" accept="${escapeHTML((slot.accept || ['image/*']).join(','))}" multiple class="hidden" onchange="window.WishMagicCustomizer.handleMultipleMediaUpload('${escapeHTML(slot.id)}', this)" />

              <!-- Gallery Grid / Items with Reorder & Remove -->
              ${items.length > 0 ? `
                <div class="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pt-1">
                  ${items.map((item, idx) => `
                    <div class="relative group rounded-xl overflow-hidden aspect-square bg-purple-950/40 border border-purple-200 dark:border-purple-700 shadow-sm">
                      <img src="${escapeHTML(item.url || item)}" class="w-full h-full object-cover" alt="${escapeHTML(item.alt || slot.label + ' ' + (idx + 1))}" />
                      <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 p-1">
                        ${idx > 0 && slot.reorderable ? `
                          <button type="button" onclick="window.WishMagicCustomizer.handleMoveMediaItem('${escapeHTML(slot.id)}', ${idx}, 'prev')" class="p-1 rounded-lg bg-white/80 hover:bg-white text-purple-950 text-xs shadow" aria-label="Move item left">
                            <span class="material-symbols-outlined text-xs">arrow_back</span>
                          </button>
                        ` : ''}
                        <button type="button" onclick="window.WishMagicCustomizer.handleRemoveMediaItem('${escapeHTML(slot.id)}', ${idx})" class="p-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs shadow" aria-label="Delete photo">
                          <span class="material-symbols-outlined text-xs">delete</span>
                        </button>
                        ${idx < items.length - 1 && slot.reorderable ? `
                          <button type="button" onclick="window.WishMagicCustomizer.handleMoveMediaItem('${escapeHTML(slot.id)}', ${idx}, 'next')" class="p-1 rounded-lg bg-white/80 hover:bg-white text-purple-950 text-xs shadow" aria-label="Move item right">
                            <span class="material-symbols-outlined text-xs">arrow_forward</span>
                          </button>
                        ` : ''}
                      </div>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div class="p-4 rounded-xl border border-dashed border-purple-300 dark:border-purple-700 text-center text-xs text-purple-600 dark:text-purple-400">
                  No photos added yet. ${slot.minItems ? `At least ${slot.minItems} photos required.` : ''}
                </div>
              `}
            </div>
          `;
        } else if (slot.type === 'voice') {
          // Voice Note Slot (Recording + Upload)
          const hasVoice = slotVal && slotVal.url;
          html += `
            <div class="wm-media-slot p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-800/40 flex flex-col gap-2.5">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="text-xs font-bold text-purple-950 dark:text-purple-100">${escapeHTML(slot.label)} ${reqBadge}</h4>
                  <p class="text-[10px] text-purple-600 dark:text-purple-400">Voice dedication audio note</p>
                </div>
                ${hasVoice ? `
                  <button type="button" onclick="window.WishMagicCustomizer.handleRemoveSlotMedia('${escapeHTML(slot.id)}')" class="p-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs font-semibold transition" aria-label="Delete voice note">
                    <span class="material-symbols-outlined text-sm">delete</span>
                  </button>
                ` : ''}
              </div>

              ${hasVoice ? `
                <div class="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-purple-950/60 border border-purple-200/60 dark:border-purple-800/50">
                  <span class="material-symbols-outlined text-pink-500 text-xl">mic</span>
                  <div class="flex-1">
                    <p class="text-xs font-bold text-purple-950 dark:text-purple-100">Recorded Audio</p>
                    <p class="text-[10px] text-purple-600 dark:text-purple-400">${slotVal.duration ? slotVal.duration + ' seconds' : 'Audio note'}</p>
                  </div>
                  <audio controls src="${escapeHTML(slotVal.url)}" preload="metadata" class="h-8 max-w-[180px]"></audio>
                </div>
              ` : `
                <div class="flex items-center gap-2">
                  ${slot.voiceRecord !== false ? `
                    <button type="button" onclick="window.WishMagicCustomizer.handleRecordVoice('${escapeHTML(slot.id)}')" class="px-3.5 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-bold text-xs shadow-md shadow-pink-500/20 transition active:scale-95 flex items-center gap-1.5" aria-label="Record Voice Note">
                      <span class="material-symbols-outlined text-sm">mic</span>
                      <span>Record Voice</span>
                    </button>
                  ` : ''}
                  ${slot.voiceUpload !== false ? `
                    <button type="button" onclick="document.getElementById('wm-voice-file-${escapeHTML(slot.id)}').click()" class="px-3.5 py-2 rounded-xl bg-purple-900 dark:bg-purple-800 hover:bg-purple-800 text-white font-bold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5" aria-label="Upload Voice Audio">
                      <span class="material-symbols-outlined text-sm">upload_file</span>
                      <span>Upload Audio</span>
                    </button>
                    <input type="file" id="wm-voice-file-${escapeHTML(slot.id)}" accept="audio/*" class="hidden" onchange="window.WishMagicCustomizer.handleSingleMediaUpload('${escapeHTML(slot.id)}', this, 'voice')" />
                  ` : ''}
                </div>
              `}
            </div>
          `;
        } else if (slot.type === 'audio') {
          // Background Music Slot (Curated / Custom)
          const hasMusic = slotVal && slotVal.url;
          html += `
            <div class="wm-media-slot p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-800/40 flex flex-col gap-2.5">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="text-xs font-bold text-purple-950 dark:text-purple-100">${escapeHTML(slot.label)} ${reqBadge}</h4>
                  <p class="text-[10px] text-purple-600 dark:text-purple-400">Background soundscape</p>
                </div>
                ${hasMusic ? `
                  <button type="button" onclick="window.WishMagicCustomizer.handleRemoveSlotMedia('${escapeHTML(slot.id)}')" class="p-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs font-semibold transition" aria-label="Remove background music">
                    <span class="material-symbols-outlined text-sm">delete</span>
                  </button>
                ` : ''}
              </div>

              ${hasMusic ? `
                <div class="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-purple-950/60 border border-purple-200/60 dark:border-purple-800/50">
                  <span class="material-symbols-outlined text-pink-500 text-xl">music_note</span>
                  <div class="flex-1">
                    <p class="text-xs font-bold text-purple-950 dark:text-purple-100">${escapeHTML(slotVal.title || slotVal.name || 'Selected Music')}</p>
                    <p class="text-[10px] text-purple-600 dark:text-purple-400">${slotVal.provider === 'curated' ? 'Curated Soundscape' : 'Custom Audio'}</p>
                  </div>
                  <audio controls src="${escapeHTML(slotVal.url)}" preload="metadata" class="h-8 max-w-[180px]"></audio>
                </div>
              ` : `
                <div class="flex items-center gap-2">
                  <button type="button" onclick="document.getElementById('wm-music-file-${escapeHTML(slot.id)}').click()" class="px-3.5 py-2 rounded-xl bg-purple-900 dark:bg-purple-800 hover:bg-purple-800 text-white font-bold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5" aria-label="Select audio track">
                    <span class="material-symbols-outlined text-sm">music_note</span>
                    <span>Upload Track</span>
                  </button>
                  <input type="file" id="wm-music-file-${escapeHTML(slot.id)}" accept="audio/*" class="hidden" onchange="window.WishMagicCustomizer.handleSingleMediaUpload('${escapeHTML(slot.id)}', this, 'audio')" />
                </div>
              `}
            </div>
          `;
        } else if (slot.type.startsWith('video')) {
          // Video Slot
          const hasVideo = slotVal && slotVal.url;
          html += `
            <div class="wm-media-slot p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-800/40 flex flex-col gap-2.5">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="text-xs font-bold text-purple-950 dark:text-purple-100">${escapeHTML(slot.label)} ${reqBadge}</h4>
                  <p class="text-[10px] text-purple-600 dark:text-purple-400">Max ${slot.maxDuration || 120}s, MP4/WebM</p>
                </div>
                ${hasVideo ? `
                  <button type="button" onclick="window.WishMagicCustomizer.handleRemoveSlotMedia('${escapeHTML(slot.id)}')" class="p-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs font-semibold transition" aria-label="Remove video">
                    <span class="material-symbols-outlined text-sm">delete</span>
                  </button>
                ` : ''}
              </div>

              ${hasVideo ? `
                <div class="rounded-xl overflow-hidden bg-black max-w-xs border border-purple-200/60 dark:border-purple-800/50">
                  <video controls src="${escapeHTML(slotVal.url)}" preload="metadata" class="w-full max-h-48 object-cover"></video>
                </div>
              ` : `
                <div>
                  <button type="button" onclick="document.getElementById('wm-video-file-${escapeHTML(slot.id)}').click()" class="px-3.5 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-bold text-xs shadow-md shadow-pink-500/20 transition active:scale-95 flex items-center gap-1.5" aria-label="Upload video for ${escapeHTML(slot.label)}">
                    <span class="material-symbols-outlined text-sm">videocam</span>
                    <span>Upload Video</span>
                  </button>
                  <input type="file" id="wm-video-file-${escapeHTML(slot.id)}" accept="video/mp4,video/webm" class="hidden" onchange="window.WishMagicCustomizer.handleSingleMediaUpload('${escapeHTML(slot.id)}', this, 'video')" />
                </div>
              `}
            </div>
          `;
        } else {
          // Single Image / Cover Photo
          const hasImg = slotVal && slotVal.url;
          html += `
            <div class="wm-media-slot p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-800/40 flex flex-col gap-2.5">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="text-xs font-bold text-purple-950 dark:text-purple-100">${escapeHTML(slot.label)} ${reqBadge}</h4>
                  <p class="text-[10px] text-purple-600 dark:text-purple-400">JPG, PNG, WEBP (Max ${Math.round((slot.maxSizeBytes || 10485760)/(1024*1024))}MB)</p>
                </div>
                ${hasImg && !slot.required ? `
                  <button type="button" onclick="window.WishMagicCustomizer.handleRemoveSlotMedia('${escapeHTML(slot.id)}')" class="p-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs font-semibold transition" aria-label="Remove image">
                    <span class="material-symbols-outlined text-sm">delete</span>
                  </button>
                ` : ''}
              </div>

              <div class="flex items-center gap-3">
                <div class="w-16 h-16 rounded-2xl bg-purple-100 dark:bg-purple-900/60 border border-purple-200 dark:border-purple-800 overflow-hidden flex items-center justify-center shrink-0 shadow-inner">
                  ${hasImg ? `
                    <img src="${escapeHTML(slotVal.url)}" class="w-full h-full object-cover" alt="${escapeHTML(slotVal.alt || slot.label)}" />
                  ` : `
                    <img src="/assets/file_ab2082.png" class="w-full h-full object-cover opacity-60" alt="Placeholder" />
                  `}
                </div>
                <div class="flex flex-col gap-1.5">
                  <button type="button" onclick="document.getElementById('wm-single-media-${escapeHTML(slot.id)}').click()" class="px-3.5 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-bold text-xs shadow-md shadow-pink-500/20 transition active:scale-95 flex items-center gap-1.5" aria-label="Upload photo for ${escapeHTML(slot.label)}">
                    <span class="material-symbols-outlined text-sm">cloud_upload</span>
                    <span>${hasImg ? 'Replace Photo' : 'Upload Photo'}</span>
                  </button>
                  <input type="file" id="wm-single-media-${escapeHTML(slot.id)}" accept="image/*" class="hidden" onchange="window.WishMagicCustomizer.handleSingleMediaUpload('${escapeHTML(slot.id)}', this, 'image')" />
                </div>
              </div>
            </div>
          `;
        }
      });

      html += `
          </div>
        </div>
      `;
      return html;
    },

    /**
     * Single Media Slot Upload Handler (Part 8)
     */
    async handleSingleMediaUpload(slotId, input, mediaType = 'image') {
      if (!input || !input.files || !input.files[0]) return;
      const file = input.files[0];

      const slot = (currentSchema.media && currentSchema.media.slots || []).find(s => s.id === slotId);

      // Validate MIME
      if (slot && slot.accept && slot.accept.length > 0) {
        const accept = slot.accept.map(a => a.toLowerCase().trim());
        const fileMime = (file.type || '').toLowerCase();
        const matched = accept.some(acc => {
          if (acc.endsWith('/*')) return fileMime.startsWith(acc.split('/')[0] + '/');
          return acc === fileMime;
        });
        if (!matched) {
          alert(`Please select a valid file type. Accepted: ${slot.accept.join(', ')}`);
          return;
        }
      }

      // Validate Max Size
      const maxBytes = (slot && slot.maxSizeBytes) || (mediaType === 'video' ? 100 * 1024 * 1024 : 10 * 1024 * 1024);
      if (file.size > maxBytes) {
        alert(`File size exceeds maximum allowed of ${Math.round(maxBytes / (1024 * 1024))}MB`);
        return;
      }

      // Cleanup old preview URL if replaced
      const oldSlotVal = currentData.media && currentData.media[slotId];
      if (oldSlotVal && oldSlotVal.url && activeCreatedObjectURLs.has(oldSlotVal.url)) {
        URL.revokeObjectURL(oldSlotVal.url);
        activeCreatedObjectURLs.delete(oldSlotVal.url);
      }

      let resolvedUrl = URL.createObjectURL(file);
      let resolvedProvider = 'temporary';
      activeCreatedObjectURLs.add(resolvedUrl);

      try {
        const isImg = mediaType === 'image' || (file.type && file.type.startsWith('image/'));
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        const endpoint = isImg ? '/api/imgbb/upload' : '/api/media/upload';
        const upRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileData: dataUrl,
            filename: file.name,
            type: isImg ? 'image' : mediaType,
            title: file.name.replace(/\.[^/.]+$/, '')
          })
        });
        const upJson = await upRes.json().catch(() => ({}));
        const payload = upJson?.data || upJson || {};
        const cloudUrl = payload.displayUrl || payload.url || payload.track?.playbackUrl || payload.track?.url;
        if (upRes.ok && cloudUrl) {
          resolvedUrl = cloudUrl;
          resolvedProvider = isImg ? 'imgbb' : 'b2';
        }
      } catch (_) {}

      const mediaRef = {
        id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        provider: resolvedProvider,
        providerId: slotId,
        url: resolvedUrl,
        displayUrl: resolvedUrl,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        name: file.name,
        filename: file.name
      };

      if (!currentData.media) currentData.media = {};
      currentData.media[slotId] = mediaRef;
      currentData[slotId] = resolvedUrl;
      global.WishMagicData = currentData;
      isDirtyState = true;

      WishMagicRuntimeBridge.updateMedia(slotId, 'set', mediaRef);
      this.updatePreview();
      if (currentContainer) this.render(currentContainer);
    },

    /**
     * Multiple Media Upload Handler (Gallery)
     */
    async handleMultipleMediaUpload(slotId, input) {
      if (!input || !input.files || input.files.length === 0) return;
      const slot = (currentSchema.media && currentSchema.media.slots || []).find(s => s.id === slotId);

      if (!currentData.media) currentData.media = {};
      const currentItems = Array.isArray(currentData.media[slotId]) ? [...currentData.media[slotId]] : [];

      const maxItems = (slot && slot.maxItems) || 8;
      const filesToAdd = Array.from(input.files).slice(0, maxItems - currentItems.length);

      for (const file of filesToAdd) {
        let resolvedUrl = URL.createObjectURL(file);
        let resolvedProvider = 'temporary';
        activeCreatedObjectURLs.add(resolvedUrl);

        try {
          if (global.WishMediaSystem && global.WishMediaSystem.ImageProcessor && file.type.startsWith('image/')) {
            const processed = await global.WishMediaSystem.ImageProcessor.processImageFile(file);
            if (processed && (processed.displayUrl || processed.url)) {
              resolvedUrl = processed.displayUrl || processed.url;
              resolvedProvider = processed.provider || 'imgbb';
            }
          }
        } catch (_) {}

        currentItems.push({
          id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          provider: resolvedProvider,
          url: resolvedUrl,
          displayUrl: resolvedUrl,
          mimeType: file.type || 'image/jpeg',
          size: file.size,
          name: file.name,
          filename: file.name
        });
      }

      currentData.media[slotId] = currentItems;
      global.WishMagicData = currentData;
      isDirtyState = true;

      WishMagicRuntimeBridge.updateMedia(slotId, 'set', currentItems);
      this.updatePreview();
      if (currentContainer) this.render(currentContainer);
    },

    /**
     * Remove Item from Multiple Gallery
     */
    handleRemoveMediaItem(slotId, index) {
      if (!currentData.media || !Array.isArray(currentData.media[slotId])) return;
      const items = [...currentData.media[slotId]];
      const removed = items.splice(index, 1)[0];

      if (removed && removed.url && activeCreatedObjectURLs.has(removed.url)) {
        URL.revokeObjectURL(removed.url);
        activeCreatedObjectURLs.delete(removed.url);
      }

      currentData.media[slotId] = items;
      global.WishMagicData = currentData;
      isDirtyState = true;

      WishMagicRuntimeBridge.updateMedia(slotId, 'set', items);
      this.updatePreview();
      if (currentContainer) this.render(currentContainer);
    },

    /**
     * Reorder Items in Multiple Gallery
     */
    handleMoveMediaItem(slotId, index, direction) {
      if (!currentData.media || !Array.isArray(currentData.media[slotId])) return;
      const items = [...currentData.media[slotId]];

      if (direction === 'prev' && index > 0) {
        const tmp = items[index - 1];
        items[index - 1] = items[index];
        items[index] = tmp;
      } else if (direction === 'next' && index < items.length - 1) {
        const tmp = items[index + 1];
        items[index + 1] = items[index];
        items[index] = tmp;
      }

      currentData.media[slotId] = items;
      global.WishMagicData = currentData;
      isDirtyState = true;

      WishMagicRuntimeBridge.updateMedia(slotId, 'set', items);
      this.updatePreview();
      if (currentContainer) this.render(currentContainer);
    },

    /**
     * Remove Slot Media (Single)
     */
    handleRemoveSlotMedia(slotId) {
      const slot = (currentSchema.media && currentSchema.media.slots || []).find(s => s.id === slotId);
      if (slot && slot.required) {
        alert(`${slot.label || slotId} is required and cannot be removed.`);
        return;
      }

      if (currentData.media && currentData.media[slotId]) {
        const oldRef = currentData.media[slotId];
        if (oldRef && oldRef.url && activeCreatedObjectURLs.has(oldRef.url)) {
          URL.revokeObjectURL(oldRef.url);
          activeCreatedObjectURLs.delete(oldRef.url);
        }
        delete currentData.media[slotId];
      }

      global.WishMagicData = currentData;
      isDirtyState = true;
      WishMagicRuntimeBridge.updateMedia(slotId, 'remove');
      this.updatePreview();
      if (currentContainer) this.render(currentContainer);
    },

    /**
     * Voice Recorder Handler
     */
    async handleRecordVoice(slotId) {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Microphone recording is not supported in this browser.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        const chunks = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const blobUrl = URL.createObjectURL(blob);
          activeCreatedObjectURLs.add(blobUrl);

          // Stop all stream tracks immediately (Rule 92)
          stream.getTracks().forEach(track => {
            if (typeof track.stop === 'function') track.stop();
          });

          const mediaRef = {
            id: `voice_${Date.now()}`,
            provider: 'temporary',
            url: blobUrl,
            mimeType: 'audio/webm',
            size: blob.size,
            duration: 10
          };

          if (!currentData.media) currentData.media = {};
          currentData.media[slotId] = mediaRef;
          global.WishMagicData = currentData;
          isDirtyState = true;

          WishMagicRuntimeBridge.updateMedia(slotId, 'set', mediaRef);
          this.updatePreview();
          if (currentContainer) this.render(currentContainer);
        };

        // Record 3 second sample demonstration or manual stop
        mediaRecorder.start();
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
        }, 3000);
      } catch (err) {
        alert('Microphone access is needed to record a voice note.');
      }
    },

    renderSectionsManagerHTML() {
      if (!currentSchema || !currentSchema.sections || currentSchema.sections.length === 0) return '';

      // Normalize section order (Spec 10)
      if (!Array.isArray(currentData.sectionOrder) || currentData.sectionOrder.length === 0) {
        currentData.sectionOrder = currentSchema.sections.map(s => s.id || s.key);
      }

      const orderList = currentData.sectionOrder;
      const sectionsMap = new Map();
      currentSchema.sections.forEach(s => sectionsMap.set(s.id || s.key, s));

      // Build ordered sections
      const orderedSections = [];
      orderList.forEach(id => {
        if (sectionsMap.has(id)) orderedSections.push(sectionsMap.get(id));
      });
      // Append any missing declared sections (Spec 47)
      currentSchema.sections.forEach(s => {
        const sid = s.id || s.key;
        if (!orderedSections.some(os => (os.id || os.key) === sid)) {
          orderedSections.push(s);
        }
      });

      let html = `
        <div id="wm-dynamic-sections-panel" class="wm-group-card rounded-3xl bg-white/80 dark:bg-purple-950/50 backdrop-blur-md border border-purple-200/60 dark:border-purple-800/50 p-5 sm:p-6 shadow-xl shadow-purple-900/5">
          <div class="flex items-center justify-between pb-3.5 mb-4 border-b border-purple-100 dark:border-purple-800/40">
            <div class="flex items-center gap-2.5">
              <span class="material-symbols-outlined text-xl text-indigo-500">view_agenda</span>
              <div>
                <h3 class="text-sm font-bold text-purple-950 dark:text-purple-100 tracking-tight">Template Sections & Layouts</h3>
                <p class="text-[10px] text-purple-600/80 dark:text-purple-300/70">Control visibility, styles & order</p>
              </div>
            </div>
            <button type="button" onclick="window.WishMagicCustomizer.resetSections()" class="text-[11px] font-semibold text-purple-600 dark:text-purple-300 hover:text-pink-600 transition flex items-center gap-1 cursor-pointer" title="Reset sections to template defaults">
              <span>↺</span>
              <span>Reset Defaults</span>
            </button>
          </div>
          <div class="flex flex-col gap-3">
      `;

      orderedSections.forEach((sec, idx) => {
        const secId = sec.id || sec.key;
        const secState = (currentData.sections && currentData.sections[secId]) || {};
        const isEnabled = typeof secState === 'boolean' ? secState : (secState.enabled !== false);
        const curLayout = (typeof secState === 'object' && secState.layout) || sec.defaultLayout || (sec.layouts && sec.layouts[0]) || null;
        const isRequired = sec.required === true;
        const isToggleable = !isRequired && sec.toggleable !== false;
        const isReorderable = sec.reorderable === true && !sec.fixedPosition;

        // Check if previous or next are fixed-position (Spec 37, 38)
        const prevSec = idx > 0 ? orderedSections[idx - 1] : null;
        const nextSec = idx < orderedSections.length - 1 ? orderedSections[idx + 1] : null;
        const canMoveUp = isReorderable && idx > 0 && (!prevSec || prevSec.fixedPosition !== 'start');
        const canMoveDown = isReorderable && idx < orderedSections.length - 1 && (!nextSec || nextSec.fixedPosition !== 'end');

        // Check data dependency (Spec 33, 34)
        let dependencyMissingNotice = '';
        if (sec.requires && sec.requires.length > 0) {
          const missingFields = sec.requires.filter(reqKey => {
            const val = currentData[reqKey];
            return val === undefined || val === null || val === '';
          });
          if (missingFields.length > 0) {
            dependencyMissingNotice = `
              <div class="mt-2 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-xl border border-amber-200/60 dark:border-amber-800/40 flex items-center gap-1.5">
                <span>💡</span>
                <span>Requires ${escapeHTML(missingFields.join(', '))}: add details to fully activate.</span>
              </div>
            `;
          }
        }

        // Layouts controls (Spec 14, 15, 19, 21, 23, 24, 25, 26, 35, 55)
        let layoutsHTML = '';
        if (sec.layouts && sec.layouts.length > 1) {
          layoutsHTML = `
            <div class="mt-3 pt-2.5 border-t border-purple-100/60 dark:border-purple-800/40 ${!isEnabled ? 'opacity-40 pointer-events-none' : ''}">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-[11px] font-bold text-purple-900 dark:text-purple-200">${escapeHTML(sec.name)} Layout</span>
                <span class="text-[10px] font-mono text-purple-600 dark:text-purple-300 uppercase">${escapeHTML(curLayout || '')}</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                ${sec.layouts.map(lay => {
                  const isLaySelected = curLayout === lay;
                  return `
                    <button type="button" aria-label="Select ${escapeHTML(lay)} layout for ${escapeHTML(sec.name)}" onclick="window.WishMagicCustomizer.handleSectionLayout('${escapeHTML(secId)}', '${escapeHTML(lay)}')" class="px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                      isLaySelected
                        ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-sm'
                        : 'bg-white dark:bg-purple-900/40 text-purple-900 dark:text-purple-200 border border-purple-200/60 dark:border-purple-800/50 hover:border-pink-300'
                    }">
                      ${escapeHTML(lay.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        html += `
          <div class="p-3.5 rounded-2xl border transition-all ${
            isEnabled
              ? 'bg-purple-50/60 dark:bg-purple-900/30 border-purple-100/80 dark:border-purple-800/40'
              : 'bg-purple-50/20 dark:bg-purple-950/20 border-purple-100/40 dark:border-purple-900/30 opacity-75'
          }">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 min-w-0">
                ${isReorderable ? `
                  <div class="flex flex-col gap-0.5 shrink-0">
                    <button type="button" aria-label="Move ${escapeHTML(sec.name)} section up" onclick="window.WishMagicCustomizer.handleMoveSection('${escapeHTML(secId)}', 'up')" ${canMoveUp ? '' : 'disabled class="opacity-25 pointer-events-none"'} class="w-5 h-5 rounded hover:bg-purple-200 dark:hover:bg-purple-800 text-[10px] flex items-center justify-center font-bold text-purple-800 dark:text-purple-200 cursor-pointer">▲</button>
                    <button type="button" aria-label="Move ${escapeHTML(sec.name)} section down" onclick="window.WishMagicCustomizer.handleMoveSection('${escapeHTML(secId)}', 'down')" ${canMoveDown ? '' : 'disabled class="opacity-25 pointer-events-none"'} class="w-5 h-5 rounded hover:bg-purple-200 dark:hover:bg-purple-800 text-[10px] flex items-center justify-center font-bold text-purple-800 dark:text-purple-200 cursor-pointer">▼</button>
                  </div>
                ` : `
                  <div class="w-5 h-5 shrink-0 flex items-center justify-center text-purple-400 text-xs">•</div>
                `}
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <p class="text-xs font-bold text-purple-950 dark:text-purple-100 truncate">${escapeHTML(sec.name)}</p>
                    ${isRequired ? `<span class="px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100">Required ✓</span>` : ''}
                    ${!isRequired && !isToggleable ? `<span class="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300">Fixed</span>` : ''}
                    ${sec.fixedPosition === 'start' ? `<span class="px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">📌 Start</span>` : ''}
                    ${sec.fixedPosition === 'end' ? `<span class="px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">🏁 End</span>` : ''}
                  </div>
                  <p class="text-[10px] text-purple-600/80 dark:text-purple-300/70 truncate mt-0.5">${escapeHTML(sec.description || (isEnabled ? 'Active in template' : 'Hidden in template'))}</p>
                </div>
              </div>

              <div class="shrink-0 flex items-center">
                ${isRequired ? `
                  <span class="text-xs font-bold text-purple-500 dark:text-purple-400 py-1 px-2 rounded-lg bg-purple-100 dark:bg-purple-900/50">Required</span>
                ` : isToggleable ? `
                  <label class="relative inline-flex items-center cursor-pointer" aria-label="Toggle ${escapeHTML(sec.name)}">
                    <input type="checkbox" class="sr-only peer" ${isEnabled ? 'checked' : ''} onchange="window.WishMagicCustomizer.handleSectionToggle('${escapeHTML(secId)}', this.checked)">
                    <div class="w-9 h-5 bg-purple-200 dark:bg-purple-900 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-500"></div>
                  </label>
                ` : `
                  <span class="text-xs font-semibold text-gray-400 py-1 px-2">Fixed</span>
                `}
              </div>
            </div>

            ${dependencyMissingNotice}
            ${layoutsHTML}
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;

      return html;
    },

    handleSectionToggle(sectionKey, enabled) {
      if (!currentData.sections) currentData.sections = {};
      const secMeta = currentSchema && currentSchema.sections
        ? currentSchema.sections.find(s => (s.id || s.key) === sectionKey)
        : null;

      // Reject if required (Spec 4)
      if (secMeta && secMeta.required && !enabled) {
        return;
      }

      if (typeof currentData.sections[sectionKey] === 'object' && currentData.sections[sectionKey] !== null) {
        currentData.sections[sectionKey].enabled = Boolean(enabled);
      } else {
        const curLayout = secMeta ? (secMeta.defaultLayout || (secMeta.layouts && secMeta.layouts[0]) || null) : null;
        currentData.sections[sectionKey] = {
          enabled: Boolean(enabled),
          layout: curLayout
        };
      }

      global.WishMagicData = currentData;
      isDirtyState = true;
      WishMagicRuntimeBridge.updateSection(sectionKey, enabled);
      this.updatePreview();
      this.renderSectionsPanel();
    },

    handleSectionLayout(sectionKey, layout) {
      if (!currentData.sections) currentData.sections = {};
      if (typeof currentData.sections[sectionKey] === 'object' && currentData.sections[sectionKey] !== null) {
        currentData.sections[sectionKey].layout = String(layout);
      } else {
        currentData.sections[sectionKey] = {
          enabled: true,
          layout: String(layout)
        };
      }

      global.WishMagicData = currentData;
      isDirtyState = true;
      WishMagicRuntimeBridge.updateSectionLayout(sectionKey, layout);
      this.updatePreview();
      this.renderSectionsPanel();
    },

    handleMoveSection(sectionKey, direction) {
      if (!Array.isArray(currentData.sectionOrder)) {
        currentData.sectionOrder = (currentSchema.sections || []).map(s => s.id || s.key);
      }

      const order = [...currentData.sectionOrder];
      const idx = order.indexOf(sectionKey);
      if (idx === -1) return;

      const secMeta = (currentSchema.sections || []).find(s => (s.id || s.key) === sectionKey);
      if (secMeta && secMeta.fixedPosition) return;

      if (direction === 'up') {
        if (idx <= 0) return;
        const prevId = order[idx - 1];
        const prevMeta = (currentSchema.sections || []).find(s => (s.id || s.key) === prevId);
        if (prevMeta && prevMeta.fixedPosition === 'start') return;
        order[idx] = prevId;
        order[idx - 1] = sectionKey;
      } else if (direction === 'down') {
        if (idx >= order.length - 1) return;
        const nextId = order[idx + 1];
        const nextMeta = (currentSchema.sections || []).find(s => (s.id || s.key) === nextId);
        if (nextMeta && nextMeta.fixedPosition === 'end') return;
        order[idx] = nextId;
        order[idx + 1] = sectionKey;
      }

      currentData.sectionOrder = order;
      global.WishMagicData = currentData;
      isDirtyState = true;
      WishMagicRuntimeBridge.updateSectionOrder(order);
      this.updatePreview();
      this.renderSectionsPanel();
    },

    resetSections() {
      if (!currentSchema || !currentSchema.sections) return;
      currentData.sections = {};
      currentSchema.sections.forEach(sec => {
        const secId = sec.id || sec.key;
        currentData.sections[secId] = {
          enabled: sec.required ? true : (sec.enabledByDefault !== false),
          layout: sec.defaultLayout || (sec.layouts && sec.layouts[0]) || null
        };
      });
      currentData.sectionOrder = currentSchema.sections.map(s => s.id || s.key);
      global.WishMagicData = currentData;
      isDirtyState = true;

      Object.keys(currentData.sections).forEach(secId => {
        WishMagicRuntimeBridge.updateSection(secId, currentData.sections[secId].enabled);
        if (currentData.sections[secId].layout) {
          WishMagicRuntimeBridge.updateSectionLayout(secId, currentData.sections[secId].layout);
        }
      });
      WishMagicRuntimeBridge.updateSectionOrder(currentData.sectionOrder);
      this.updatePreview();
      this.renderSectionsPanel();
    },

    renderSectionsPanel() {
      if (!currentContainer) return;
      const panel = currentContainer.querySelector('#wm-dynamic-sections-panel');
      if (panel) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = this.renderSectionsManagerHTML();
        const newPanel = tempDiv.firstElementChild;
        if (newPanel && panel.parentNode) {
          panel.parentNode.replaceChild(newPanel, panel);
        }
      } else {
        this.render(currentContainer);
      }
    },

    handleThemeSelect(themeName) {
      if (!currentData.visual) currentData.visual = {};
      currentData.visual.theme = themeName;
      currentData.theme = themeName;
      global.WishMagicData = currentData;
      isDirtyState = true;
      WishMagicRuntimeBridge.updateTheme(themeName);
      this.updatePreview();
      if (currentContainer) this.render(currentContainer);
    },

    /**
     * Check if current template declares any visual system capabilities (Spec 42)
     */
    hasVisualControls() {
      if (!currentSchema) return false;
      const v = currentSchema.visual || {};
      const hasThemes = v.themes && v.themes.supported && v.themes.supported.length > 0;
      const hasColors = v.colors && v.colors.supported && v.colors.supported.length > 0;
      const hasBg = v.backgrounds && v.backgrounds.supported && v.backgrounds.supported.length > 0;
      const hasSurface = v.surfaces && v.surfaces.supported && v.surfaces.supported.length > 0;
      const hasButtons = v.buttons && v.buttons.supported && v.buttons.supported.length > 0;
      const hasTypography = v.typography && v.typography.supported && v.typography.supported.length > 0;
      const hasIntensity = v.intensity && v.intensity.supported && v.intensity.supported.length > 0;
      const hasCustom = v.customControls && v.customControls.length > 0;
      return hasThemes || hasColors || hasBg || hasSurface || hasButtons || hasTypography || hasIntensity || hasCustom;
    },

    /**
     * Render the Visual Customization Panel (Part 6 - Spec 3, 11, 14, 18, 20, 22, 28, 41, 42)
     */
    renderVisualManagerHTML() {
      if (!currentSchema || !this.hasVisualControls()) return '';

      const v = currentSchema.visual || {};
      const visState = currentData.visual || {};
      const colorState = visState.colors || {};

      let html = `
        <div id="wm-dynamic-visual-panel" class="wm-group-card rounded-3xl bg-white/80 dark:bg-purple-950/50 backdrop-blur-md border border-purple-200/60 dark:border-purple-800/50 p-5 sm:p-6 shadow-xl shadow-purple-900/5">
          <div class="flex items-center justify-between pb-3.5 mb-4 border-b border-purple-100 dark:border-purple-800/40">
            <div class="flex items-center gap-2.5">
              <span class="material-symbols-outlined text-xl text-amber-500">palette</span>
              <div>
                <h3 class="text-sm font-bold text-purple-950 dark:text-purple-100 tracking-tight">Visual Style & Atmosphere</h3>
                <p class="text-[10px] text-purple-600/80 dark:text-purple-300/70">Themes, colors, surfaces & typography</p>
              </div>
            </div>
            <button type="button" onclick="window.WishMagicCustomizer.handleResetVisuals()" class="text-[11px] font-semibold text-purple-600 dark:text-purple-300 hover:text-pink-600 transition flex items-center gap-1 cursor-pointer" title="Reset visual customizations to template defaults">
              <span>↺</span>
              <span>Reset Style</span>
            </button>
          </div>
          <div class="flex flex-col gap-5">
      `;

      // 1. THEME PRESETS (Spec 3, 4, 5, 6, 42)
      if (v.themes && v.themes.supported && v.themes.supported.length > 0) {
        const curTheme = visState.theme || v.themes.default || v.themes.supported[0];
        html += `
          <div class="flex flex-col gap-2">
            <span class="text-xs font-bold text-purple-900 dark:text-purple-200">Theme Preset</span>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              ${v.themes.supported.map(th => {
                const isSelected = curTheme === th;
                return `
                  <button type="button" aria-pressed="${isSelected ? 'true' : 'false'}" aria-label="Select ${escapeHTML(th)} theme preset" onclick="window.WishMagicCustomizer.handleThemeSelect('${escapeHTML(th)}')" class="px-3 py-2 rounded-2xl border text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white border-transparent shadow-md'
                      : 'bg-white dark:bg-purple-900/40 text-purple-900 dark:text-purple-200 border-purple-200/80 dark:border-purple-800/60 hover:border-pink-300'
                  }">
                    <span>✦</span>
                    <span>${escapeHTML(th.charAt(0).toUpperCase() + th.slice(1))}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      // 2. COLOR PALETTE OVERRIDES (Spec 11, 12, 13, 30, 31, 42)
      if (v.colors && v.colors.supported && v.colors.supported.length > 0) {
        html += `
          <div class="flex flex-col gap-2 pt-3 border-t border-purple-100/60 dark:border-purple-800/40">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-purple-900 dark:text-purple-200">Custom Colors</span>
              <span class="text-[10px] text-purple-500 dark:text-purple-400">Overrides theme default</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              ${v.colors.supported.map(colKey => {
                const curVal = colorState[colKey] || (v.colors.defaults && v.colors.defaults[colKey]) || '#EC4899';
                const hasOverride = colorState[colKey] !== undefined && colorState[colKey] !== null;
                const label = colKey.charAt(0).toUpperCase() + colKey.slice(1);
                return `
                  <div class="p-2.5 rounded-2xl bg-purple-50/60 dark:bg-purple-900/30 border border-purple-100/80 dark:border-purple-800/40 flex flex-col gap-1.5">
                    <div class="flex items-center justify-between">
                      <label for="wm-color-${escapeHTML(colKey)}" class="text-[11px] font-bold text-purple-900 dark:text-purple-200">${escapeHTML(label)}</label>
                      ${hasOverride ? `
                        <button type="button" aria-label="Reset ${escapeHTML(label)} color override" onclick="window.WishMagicCustomizer.handleResetColor('${escapeHTML(colKey)}')" class="text-[10px] text-purple-500 hover:text-pink-600 font-bold" title="Reset override">↺</button>
                      ` : ''}
                    </div>
                    <div class="flex items-center gap-2">
                      <input type="color" id="wm-color-${escapeHTML(colKey)}" aria-label="${escapeHTML(label)} color picker" value="${escapeHTML(curVal)}" onchange="window.WishMagicCustomizer.handleColorChange('${escapeHTML(colKey)}', this.value)" class="w-7 h-7 rounded-lg border-0 cursor-pointer p-0 bg-transparent" />
                      <span class="text-[10px] font-mono font-semibold text-purple-700 dark:text-purple-300 uppercase">${escapeHTML(curVal)}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      // 3. BACKGROUND SELECTION (Spec 14, 15, 16, 42)
      if (v.backgrounds && v.backgrounds.supported && v.backgrounds.supported.length > 0) {
        const curBg = visState.background || v.backgrounds.default || v.backgrounds.supported[0];
        html += `
          <div class="flex flex-col gap-2 pt-3 border-t border-purple-100/60 dark:border-purple-800/40">
            <label for="wm-visual-background" class="text-xs font-bold text-purple-900 dark:text-purple-200">Atmosphere Background</label>
            <div class="flex flex-wrap gap-1.5">
              ${v.backgrounds.supported.map(bg => {
                const isSelected = curBg === bg;
                return `
                  <button type="button" aria-pressed="${isSelected ? 'true' : 'false'}" aria-label="Select ${escapeHTML(bg)} background" onclick="window.WishMagicCustomizer.handleBackgroundSelect('${escapeHTML(bg)}')" class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-sm'
                      : 'bg-white dark:bg-purple-900/40 text-purple-900 dark:text-purple-200 border border-purple-200/60 dark:border-purple-800/50 hover:border-pink-300'
                  }">
                    ${escapeHTML(bg.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      // 4. SURFACE / CARD STYLE (Spec 18, 19, 42)
      if (v.surfaces && v.surfaces.supported && v.surfaces.supported.length > 0) {
        const curSurface = visState.surface || v.surfaces.default || v.surfaces.supported[0];
        html += `
          <div class="flex flex-col gap-2 pt-3 border-t border-purple-100/60 dark:border-purple-800/40">
            <span class="text-xs font-bold text-purple-900 dark:text-purple-200">Card / Surface Glass</span>
            <div class="flex flex-wrap gap-1.5">
              ${v.surfaces.supported.map(surf => {
                const isSelected = curSurface === surf;
                return `
                  <button type="button" aria-pressed="${isSelected ? 'true' : 'false'}" aria-label="Select ${escapeHTML(surf)} surface style" onclick="window.WishMagicCustomizer.handleSurfaceSelect('${escapeHTML(surf)}')" class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-sm'
                      : 'bg-white dark:bg-purple-900/40 text-purple-900 dark:text-purple-200 border border-purple-200/60 dark:border-purple-800/50 hover:border-pink-300'
                  }">
                    ${escapeHTML(surf.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      // 5. BUTTON STYLES (Spec 20, 21, 42)
      if (v.buttons && v.buttons.supported && v.buttons.supported.length > 0) {
        const curBtn = visState.buttonStyle || v.buttons.default || v.buttons.supported[0];
        html += `
          <div class="flex flex-col gap-2 pt-3 border-t border-purple-100/60 dark:border-purple-800/40">
            <span class="text-xs font-bold text-purple-900 dark:text-purple-200">Interactive Button Style</span>
            <div class="flex flex-wrap gap-1.5">
              ${v.buttons.supported.map(btn => {
                const isSelected = curBtn === btn;
                return `
                  <button type="button" aria-pressed="${isSelected ? 'true' : 'false'}" aria-label="Select ${escapeHTML(btn)} button style" onclick="window.WishMagicCustomizer.handleButtonSelect('${escapeHTML(btn)}')" class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-sm'
                      : 'bg-white dark:bg-purple-900/40 text-purple-900 dark:text-purple-200 border border-purple-200/60 dark:border-purple-800/50 hover:border-pink-300'
                  }">
                    ${escapeHTML(btn.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      // 6. TYPOGRAPHY (Spec 22, 23, 24, 25, 26, 42)
      if (v.typography && v.typography.supported && v.typography.supported.length > 0 && v.typography.fonts && v.typography.fonts.length > 0) {
        const curHeadingFont = (visState.typography && visState.typography.headingFont) || v.typography.fonts[0];
        html += `
          <div class="flex flex-col gap-2 pt-3 border-t border-purple-100/60 dark:border-purple-800/40">
            <span class="text-xs font-bold text-purple-900 dark:text-purple-200">Typography Font</span>
            <div class="flex flex-wrap gap-1.5">
              ${v.typography.fonts.map(fnt => {
                const isSelected = curHeadingFont === fnt;
                return `
                  <button type="button" aria-pressed="${isSelected ? 'true' : 'false'}" aria-label="Select ${escapeHTML(fnt)} font family" onclick="window.WishMagicCustomizer.handleTypographySelect('headingFont', '${escapeHTML(fnt)}')" class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-sm'
                      : 'bg-white dark:bg-purple-900/40 text-purple-900 dark:text-purple-200 border border-purple-200/60 dark:border-purple-800/50 hover:border-pink-300'
                  }">
                    ${escapeHTML(fnt.charAt(0).toUpperCase() + fnt.slice(1))}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      // 7. INTENSITY & GLOW (Spec 28, 29, 42)
      if (v.intensity && v.intensity.supported && v.intensity.supported.length > 0) {
        const curIntensity = visState.intensity || v.intensity.default || v.intensity.supported[0];
        html += `
          <div class="flex flex-col gap-2 pt-3 border-t border-purple-100/60 dark:border-purple-800/40">
            <span class="text-xs font-bold text-purple-900 dark:text-purple-200">Visual Glow Intensity</span>
            <div class="flex flex-wrap gap-1.5">
              ${v.intensity.supported.map(lvl => {
                const isSelected = curIntensity === lvl;
                return `
                  <button type="button" aria-pressed="${isSelected ? 'true' : 'false'}" aria-label="Select ${escapeHTML(lvl)} visual glow intensity" onclick="window.WishMagicCustomizer.handleIntensitySelect('${escapeHTML(lvl)}')" class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-sm'
                      : 'bg-white dark:bg-purple-900/40 text-purple-900 dark:text-purple-200 border border-purple-200/60 dark:border-purple-800/50 hover:border-pink-300'
                  }">
                    ${escapeHTML(lvl.charAt(0).toUpperCase() + lvl.slice(1))}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      // 8. TEMPLATE-SPECIFIC CUSTOM VISUAL CONTROLS (Spec 49, 50, 51)
      if (v.customControls && v.customControls.length > 0) {
        html += `
          <div class="flex flex-col gap-3 pt-3 border-t border-purple-100/60 dark:border-purple-800/40">
            <span class="text-xs font-bold text-purple-900 dark:text-purple-200">Template Atmospheric Controls</span>
            ${v.customControls.map(ctrl => {
              const curCustomVal = (visState.custom && visState.custom[ctrl.id]) !== undefined
                ? visState.custom[ctrl.id]
                : ctrl.default;
              if (ctrl.type === 'range') {
                return `
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between text-xs">
                      <label for="wm-custom-ctrl-${escapeHTML(ctrl.id)}" class="font-bold text-purple-900 dark:text-purple-200">${escapeHTML(ctrl.label)}</label>
                      <span id="wm-custom-val-${escapeHTML(ctrl.id)}" class="font-mono text-pink-500 font-bold">${curCustomVal}</span>
                    </div>
                    <input type="range" id="wm-custom-ctrl-${escapeHTML(ctrl.id)}" aria-label="${escapeHTML(ctrl.label)} slider" min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}" value="${curCustomVal}" oninput="document.getElementById('wm-custom-val-${escapeHTML(ctrl.id)}').textContent = this.value; window.WishMagicCustomizer.handleCustomVisualChange('${escapeHTML(ctrl.id)}', Number(this.value))" class="w-full h-2 rounded-lg appearance-none bg-purple-200 dark:bg-purple-800 accent-pink-500 cursor-pointer" />
                  </div>
                `;
              }
              return '';
            }).join('')}
          </div>
        `;
      }

      html += `
          </div>
        </div>
      `;

      return html;
    },

    handleColorChange(colorKey, value) {
      if (!currentData.visual) currentData.visual = {};
      if (!currentData.visual.colors) currentData.visual.colors = {};
      currentData.visual.colors[colorKey] = value;
      global.WishMagicData = currentData;
      isDirtyState = true;
      WishMagicRuntimeBridge.updateColor(colorKey, value);
      this.updatePreview();
      if (currentContainer) this.render(currentContainer);
    },

    handleResetColor(colorKey) {
      if (currentData.visual && currentData.visual.colors) {
        delete currentData.visual.colors[colorKey];
      }
      global.WishMagicData = currentData;
      isDirtyState = true;
      WishMagicRuntimeBridge.updateColor(colorKey, null);
      this.updatePreview();
      if (currentContainer) this.render(currentContainer);
    },

    handleBackgroundSelect(bg) {
      if (!currentData.visual) currentData.visual = {};
      currentData.visual.background = bg;
      global.WishMagicData = currentData;
      isDirtyState = true;
      WishMagicRuntimeBridge.updateBackground(bg);
      this.updatePreview();
      if (currentContainer) this.render(currentContainer);
    },

    handleSurfaceSelect(surface) {
      if (!currentData.visual) currentData.visual = {};
      currentData.visual.surface = surface;
      global.WishMagicData = currentData;
      isDirtyState = true;
      WishMagicRuntimeBridge.updateSurface(surface);
      this.updatePreview();
      if (currentContainer) this.render(currentContainer);
    },

    handleButtonSelect(style) {
      if (!currentData.visual) currentData.visual = {};
      currentData.visual.buttonStyle = style;
      global.WishMagicData = currentData;
      isDirtyState = true;
      WishMagicRuntimeBridge.updateButtonStyle(style);
      this.updatePreview();
      if (currentContainer) this.render(currentContainer);
    },

    handleTypographySelect(typeKey, value) {
      if (!currentData.visual) currentData.visual = {};
      if (!currentData.visual.typography) currentData.visual.typography = {};
      currentData.visual.typography[typeKey] = value;
      global.WishMagicData = currentData;
      isDirtyState = true;
      WishMagicRuntimeBridge.updateTypography(typeKey, value);
      this.updatePreview();
      if (currentContainer) this.render(currentContainer);
    },

    handleIntensitySelect(intensity) {
      if (!currentData.visual) currentData.visual = {};
      currentData.visual.intensity = intensity;
      global.WishMagicData = currentData;
      isDirtyState = true;
      WishMagicRuntimeBridge.updateIntensity(intensity);
      this.updatePreview();
      if (currentContainer) this.render(currentContainer);
    },

    handleCustomVisualChange(controlId, value) {
      if (!currentData.visual) currentData.visual = {};
      if (!currentData.visual.custom) currentData.visual.custom = {};
      currentData.visual.custom[controlId] = value;
      global.WishMagicData = currentData;
      isDirtyState = true;
      WishMagicRuntimeBridge.updateCustomVisual(controlId, value);
      this.updatePreview();
    },

    handleResetVisuals() {
      const v = (currentSchema && currentSchema.visual) || {};
      currentData.visual = {
        theme: (v.themes && v.themes.default) || (v.themes && v.themes.supported && v.themes.supported[0]) || null,
        colors: {},
        background: (v.backgrounds && v.backgrounds.default) || (v.backgrounds && v.backgrounds.supported && v.backgrounds.supported[0]) || null,
        surface: (v.surfaces && v.surfaces.default) || (v.surfaces && v.surfaces.supported && v.surfaces.supported[0]) || null,
        buttonStyle: (v.buttons && v.buttons.default) || (v.buttons && v.buttons.supported && v.buttons.supported[0]) || null,
        intensity: (v.intensity && v.intensity.default) || (v.intensity && v.intensity.supported && v.intensity.supported[0]) || null
      };
      if (currentData.visual.theme) {
        currentData.theme = currentData.visual.theme;
      }
      global.WishMagicData = currentData;
      isDirtyState = true;
      WishMagicRuntimeBridge.resetVisualState();
      this.updatePreview();
      if (currentContainer) this.render(currentContainer);
    },

    /**
     * Clean up resources and object URLs
     */
    destroy() {
      activeCreatedObjectURLs.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
      });
      activeCreatedObjectURLs.clear();
      changeListeners = [];
      currentContainer = null;
      isDirtyState = false;
    }
  };

  const WishMagicCustomizerGenerator = {
    generateForm(templateOrOptions = {}) {
      const caps = templateOrOptions.capabilities || templateOrOptions;
      const rawFields = Array.isArray(caps.fields)
        ? caps.fields
        : (Array.isArray(templateOrOptions.fields) ? templateOrOptions.fields : []);

      const normalizedFields = rawFields.map(f => {
        const id = f.id || f.key;
        return {
          id,
          key: id,
          type: f.type || 'text',
          label: f.label || id,
          required: Boolean(f.required),
          min: f.min,
          max: f.max,
          minLength: f.minLength,
          maxLength: f.maxLength,
          options: f.options,
          default: f.default !== undefined ? f.default : f.defaultValue,
          visibleIf: f.visibleIf,
          ...f
        };
      });

      return {
        id: templateOrOptions.id || 'form_generated',
        fields: normalizedFields,
        sections: caps.sections || [],
        media: caps.media || {},
        render: (container) => {
          if (WishMagicCustomizer && typeof WishMagicCustomizer.render === 'function') {
            return WishMagicCustomizer.render(container, { fields: normalizedFields });
          }
        }
      };
    },

    validateFormValues(values = {}, schema = {}) {
      const fields = Array.isArray(schema.fields)
        ? schema.fields
        : (schema.capabilities && Array.isArray(schema.capabilities.fields) ? schema.capabilities.fields : []);

      const errors = [];
      const valObj = values || {};

      fields.forEach(field => {
        const key = field.id || field.key;
        const val = valObj[key];

        // Required check
        if (field.required) {
          if (val === undefined || val === null || val === '') {
            errors.push({ field: key, message: `${field.label || key} is required` });
            return;
          }
        }

        if (val === undefined || val === null || val === '') {
          return;
        }

        // minLength / maxLength for string types
        if (typeof val === 'string') {
          if (field.minLength !== undefined && val.length < field.minLength) {
            errors.push({ field: key, message: `${field.label || key} must be at least ${field.minLength} characters` });
          }
          if (field.maxLength !== undefined && val.length > field.maxLength) {
            errors.push({ field: key, message: `${field.label || key} must be at most ${field.maxLength} characters` });
          }
        }

        // min / max for numbers
        if (field.type === 'number' || field.type === 'range' || typeof val === 'number') {
          const num = Number(val);
          if (!isNaN(num)) {
            if (field.min !== undefined && num < field.min) {
              errors.push({ field: key, message: `${field.label || key} must be >= ${field.min}` });
            }
            if (field.max !== undefined && num > field.max) {
              errors.push({ field: key, message: `${field.label || key} must be <= ${field.max}` });
            }
          }
        }

        // Email validation
        if (field.type === 'email' && typeof val === 'string') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(val)) {
            errors.push({ field: key, message: `${field.label || key} must be a valid email address` });
          }
        }

        // URL validation
        if (field.type === 'url' && typeof val === 'string') {
          try {
            new URL(val);
          } catch (e) {
            errors.push({ field: key, message: `${field.label || key} must be a valid URL` });
          }
        }

        // Phone validation
        if (field.type === 'phone' && typeof val === 'string') {
          if (!/^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{4,}$/.test(val)) {
            errors.push({ field: key, message: `${field.label || key} must be a valid phone number` });
          }
        }
      });

      return {
        valid: errors.length === 0,
        errors
      };
    }
  };

  // Expose global APIs
  global.WishMagicCustomizerGenerator = WishMagicCustomizerGenerator;
  global.WishMagicCustomizerSchema = WishMagicCustomizerSchema;
  global.WishMagicRuntimeBridge = WishMagicRuntimeBridge;
  global.WishMagicCustomizer = WishMagicCustomizer;

})(typeof window !== 'undefined' ? window : this);
