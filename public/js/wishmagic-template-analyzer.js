/**
 * WishMagic Automatic Template Analyzer (v1.0)
 * =============================================================
 * Inspects a WishMagic-compatible wish template DOM and automatically
 * discovers its capability schema, fields, sections, media slots,
 * animations, themes, particles, and validation status.
 *
 * Fully serializable (JSON-ready) and framework-independent.
 */

(function (global) {
  'use strict';

  const PROTOCOL_VERSION = '1.0';

  const STANDARD_FIELD_TYPES = new Set([
    'text',
    'textarea',
    'date',
    'time',
    'datetime',
    'number',
    'email',
    'url',
    'phone',
    'color',
    'select',
    'multiselect',
    'toggle',
    'range',
    'image',
    'image-multiple',
    'video',
    'video-multiple',
    'audio',
    'voice',
    'font',
    'icon'
  ]);

  let cachedAnalysisResult = null;

  /**
   * Helper: Parse string list by comma
   */
  function parseList(str) {
    if (!str || typeof str !== 'string') return [];
    return str
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  /**
   * Helper: Parse boolean string attribute safely
   */
  function parseBoolean(val, fallback = false) {
    if (val === null || val === undefined) return fallback;
    const s = String(val).trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
    return fallback;
  }

  /**
   * Helper: Parse options from attribute (handles both JSON and comma-separated)
   */
  function parseOptions(optionsAttr, warnings, fieldKey) {
    if (!optionsAttr) return null;
    const trimmed = String(optionsAttr).trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map(opt => {
            if (typeof opt === 'string') {
              return { value: opt, label: opt.charAt(0).toUpperCase() + opt.slice(1) };
            }
            if (opt && typeof opt === 'object') {
              return {
                value: String(opt.value || opt.key || opt.id || ''),
                label: String(opt.label || opt.name || opt.value || '')
              };
            }
            return { value: String(opt), label: String(opt) };
          });
        }
      } catch (e) {
        warnings.push({
          code: 'INVALID_OPTIONS_FORMAT',
          field: fieldKey,
          message: `Malformed JSON options for field "${fieldKey}": ${e.message}`
        });
      }
    }

    // Comma-separated fallback
    const list = parseList(trimmed);
    if (list.length > 0) {
      return list.map(item => ({
        value: item,
        label: item.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      }));
    }

    return null;
  }

  /**
   * Core Analysis Execution
   */
  function executeAnalysis(rootDoc) {
    const doc = rootDoc || (typeof document !== 'undefined' ? document : null);
    if (!doc) {
      return {
        valid: false,
        protocol: { version: PROTOCOL_VERSION, compatible: false },
        template: { type: 'wish-template' },
        fields: [],
        sections: [],
        capabilities: {},
        animations: {},
        themes: [],
        particles: {},
        media: {},
        warnings: [{ code: 'NO_DOCUMENT', message: 'No DOM document available for analysis.' }],
        errors: [{ code: 'NO_DOCUMENT', message: 'Cannot analyze null document.' }]
      };
    }

    const warnings = [];
    const errors = [];

    const rootEl = doc.documentElement || doc;
    const bodyEl = doc.body || (doc.querySelector ? doc.querySelector('body') : null);

    // 1. Protocol Detection
    const rawProtocol = rootEl.getAttribute ? rootEl.getAttribute('data-wm-protocol') : null;
    const runtimeVer = rootEl.getAttribute ? rootEl.getAttribute('data-wm-template-runtime') : null;
    const metaVer = doc.querySelector ? doc.querySelector('meta[name="wishmagic-template-version"]')?.getAttribute('content') : null;
    const metaType = doc.querySelector ? doc.querySelector('meta[name="wishmagic-template-type"]')?.getAttribute('content') : null;

    const protocolVersion = rawProtocol || metaVer || PROTOCOL_VERSION;
    if (!rawProtocol && !metaVer) {
      warnings.push({
        code: 'PROTOCOL_MISSING',
        message: 'WishMagic protocol metadata (data-wm-protocol) was not found on root element.'
      });
    }

    // 2. Section Discovery (Part 5 - Universal Section & Layout Protocol)
    const rawSections = doc.querySelectorAll ? Array.from(doc.querySelectorAll('[data-wm-section]')) : [];
    const sectionsMap = new Map();
    const sectionKeysSet = new Set();
    const seenSectionKeys = new Map(); // Track duplicate occurrences

    rawSections.forEach((el, domIndex) => {
      const sectionKey = (el.getAttribute('data-wm-section') || '').trim();
      if (!sectionKey) return;

      const instance = el.getAttribute('data-wm-section-instance') || null;
      const mapKey = instance ? `${sectionKey}:${instance}` : sectionKey;

      // Duplicate Section Detection (Spec 11 & 56)
      if (seenSectionKeys.has(sectionKey)) {
        const occurrences = seenSectionKeys.get(sectionKey);
        seenSectionKeys.set(sectionKey, occurrences + 1);
        if (!instance) {
          warnings.push({
            code: 'DUPLICATE_SECTION_ID',
            section: sectionKey,
            message: `Duplicate section ID: ${sectionKey}`
          });
        }
      } else {
        seenSectionKeys.set(sectionKey, 1);
      }

      sectionKeysSet.add(sectionKey);

      // Section Order (Spec 7)
      const rawOrder = el.getAttribute('data-wm-order');
      let order = null;
      if (rawOrder !== null && rawOrder !== undefined && rawOrder !== '') {
        const parsedOrder = parseInt(rawOrder, 10);
        if (Number.isNaN(parsedOrder)) {
          warnings.push({
            code: 'INVALID_SECTION_ORDER',
            section: sectionKey,
            value: rawOrder,
            message: `Invalid section order "${rawOrder}" in section "${sectionKey}".`
          });
        } else {
          order = parsedOrder;
        }
      }

      // Required & Toggleable (Spec 4 & 5)
      const isRequired = parseBoolean(el.getAttribute('data-wm-required'), false);
      const rawToggleable = el.getAttribute('data-wm-toggleable');
      let toggleable = isRequired ? false : parseBoolean(rawToggleable, false);

      if (isRequired && rawToggleable !== null && parseBoolean(rawToggleable, false)) {
        warnings.push({
          code: 'REQUIRED_TOGGLEABLE_CONFLICT',
          section: sectionKey,
          message: `Section "${sectionKey}" is marked required="true" but toggleable="true". Required sections cannot be disabled.`
        });
        toggleable = false;
      }

      // Reorderable (Spec 9)
      const reorderable = parseBoolean(el.getAttribute('data-wm-reorderable'), false);

      // Default Enabled (Spec 6)
      const rawDefaultEnabled = el.getAttribute('data-wm-default-enabled');
      const enabledByDefault = isRequired ? true : parseBoolean(rawDefaultEnabled, true);

      // Label & Missing Label Warning (Spec 56)
      const rawLabel = el.getAttribute('data-wm-label');
      if (!rawLabel) {
        warnings.push({
          code: 'SECTION_LABEL_MISSING',
          section: sectionKey,
          message: `Section "${sectionKey}" is missing data-wm-label attribute.`
        });
      }
      const label = rawLabel || sectionKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      // Description
      const description = el.getAttribute('data-wm-description') || '';

      // Layouts & Default Layout (Spec 14, 15, 30, 31, 32)
      const layouts = parseList(el.getAttribute('data-wm-layouts'));
      const rawDefaultLayout = el.getAttribute('data-wm-default-layout');
      let defaultLayout = null;

      if (layouts.length > 0) {
        if (rawDefaultLayout) {
          const trimmedDefault = rawDefaultLayout.trim();
          if (layouts.includes(trimmedDefault)) {
            defaultLayout = trimmedDefault;
          } else {
            warnings.push({
              code: 'INVALID_DEFAULT_LAYOUT',
              section: sectionKey,
              value: rawDefaultLayout,
              message: `Default layout '${rawDefaultLayout}' is not declared.`
            });
            defaultLayout = layouts[0]; // Safe fallback to first valid layout (Spec 32)
          }
        } else {
          defaultLayout = layouts[0]; // First valid declared layout (Spec 31)
        }
      }

      // Capabilities & Required Dependencies (Spec 20, 33, 34)
      const capabilities = parseList(el.getAttribute('data-wm-capabilities'));
      const requires = parseList(el.getAttribute('data-wm-requires'));

      // Fixed Position (Spec 37, 38)
      const rawFixedPos = el.getAttribute('data-wm-fixed-position');
      let fixedPosition = null;
      if (rawFixedPos) {
        const normPos = rawFixedPos.trim().toLowerCase();
        if (normPos === 'start' || normPos === 'end') {
          fixedPosition = normPos;
        } else {
          warnings.push({
            code: 'INVALID_FIXED_POSITION',
            section: sectionKey,
            value: rawFixedPos,
            message: `Invalid fixed position: ${rawFixedPos}`
          });
        }
      }

      // Section Group & Instance (Spec 11, 39)
      const group = el.getAttribute('data-wm-section-group') || null;

      // Min / Max items
      const rawMin = el.getAttribute('data-wm-min-items');
      const rawMax = el.getAttribute('data-wm-max-items');
      const minItems = rawMin ? parseInt(rawMin, 10) : null;
      const maxItems = rawMax ? parseInt(rawMax, 10) : null;

      // Countdown Settings (Spec 21, 22)
      const countdownLiveSeconds = parseBoolean(el.getAttribute('data-wm-countdown-live-seconds'), false);
      const countdownTimezone = el.getAttribute('data-wm-countdown-timezone') || null;
      const countdownMidnightTransition = parseBoolean(el.getAttribute('data-wm-countdown-midnight-transition'), false);

      // Nested Section Check (Spec 48, 49, 50, 56)
      let parentSecEl = el.parentElement || el.parentNode;
      let nestedParent = null;
      while (parentSecEl) {
        if (parentSecEl.getAttribute && parentSecEl.hasAttribute('data-wm-section')) {
          nestedParent = parentSecEl.getAttribute('data-wm-section');
          break;
        }
        parentSecEl = parentSecEl.parentElement || parentSecEl.parentNode;
      }
      if (nestedParent) {
        warnings.push({
          code: 'NESTED_SECTION_AMBIGUITY',
          section: sectionKey,
          parentSection: nestedParent,
          message: `Section "${sectionKey}" is nested inside parent section "${nestedParent}".`
        });
      }

      // Animations
      const sectionAnims = parseList(el.getAttribute('data-wm-animation') || el.getAttribute('data-wm-animations'));

      if (sectionsMap.has(mapKey)) {
        const existing = sectionsMap.get(mapKey);
        existing.instances += 1;
        sectionAnims.forEach(anim => {
          if (!existing.animation.includes(anim)) existing.animation.push(anim);
        });
      } else {
        sectionsMap.set(mapKey, {
          id: sectionKey,
          key: sectionKey,
          label,
          name: label,
          description,
          supported: parseBoolean(el.getAttribute('data-wm-supported'), true),
          required: isRequired,
          toggleable,
          reorderable,
          enabledByDefault,
          order: order !== null ? order : (domIndex + 1),
          hasExplicitOrder: order !== null,
          layouts,
          defaultLayout,
          capabilities,
          requires,
          fixedPosition,
          group,
          instance,
          minItems: Number.isNaN(minItems) ? null : minItems,
          maxItems: Number.isNaN(maxItems) ? null : maxItems,
          settings: {
            countdownLiveSeconds,
            countdownTimezone,
            countdownMidnightTransition
          },
          animation: Array.from(new Set(sectionAnims)),
          instances: 1,
          domIndex
        });
      }
    });

    // Sort sections: fixed "start" first, then ordered/DOM sections, then fixed "end" last
    const sections = Array.from(sectionsMap.values()).sort((a, b) => {
      // 1. Fixed position priorities
      if (a.fixedPosition === 'start' && b.fixedPosition !== 'start') return -1;
      if (b.fixedPosition === 'start' && a.fixedPosition !== 'start') return 1;
      if (a.fixedPosition === 'end' && b.fixedPosition !== 'end') return 1;
      if (b.fixedPosition === 'end' && a.fixedPosition !== 'end') return -1;

      // 2. Explicit vs DOM order
      if (a.hasExplicitOrder && b.hasExplicitOrder) {
        return a.order - b.order;
      }
      if (a.hasExplicitOrder) return -1;
      if (b.hasExplicitOrder) return 1;
      return a.domIndex - b.domIndex;
    }).map((s, idx) => {
      const { hasExplicitOrder, domIndex, ...cleanSection } = s;
      cleanSection.order = idx + 1; // Normalized sequential order (Spec 7)
      return cleanSection;
    });

    // 3. Field Discovery
    const rawFields = doc.querySelectorAll ? Array.from(doc.querySelectorAll('[data-wm-field], [data-wm]')) : [];
    const fieldsMap = new Map();
    const fieldsList = [];

    rawFields.forEach((el) => {
      try {
        const isLegacy = !el.hasAttribute('data-wm-field') && el.hasAttribute('data-wm');
        const rawKey = el.getAttribute('data-wm-field') || el.getAttribute('data-wm');
        if (!rawKey) return;

        const fieldKey = rawKey.trim();
        if (!fieldKey) return;

        if (isLegacy) {
          warnings.push({
            code: 'LEGACY_METADATA',
            field: fieldKey,
            message: `Field "${fieldKey}" uses legacy data-wm attribute. Upgrade to data-wm-field.`
          });
        }

        // Type detection and validation
        let rawType = el.getAttribute('data-wm-type');
        let fieldType = rawType ? rawType.trim().toLowerCase() : null;

        if (!fieldType) {
          // Careful inference for legacy or unmarked elements
          if (el.tagName === 'IMG') {
            fieldType = 'image';
          } else if (el.tagName === 'TEXTAREA') {
            fieldType = 'textarea';
          } else if (el.tagName === 'VIDEO') {
            fieldType = 'video';
          } else if (el.tagName === 'AUDIO') {
            fieldType = 'audio';
          } else {
            fieldType = 'text';
          }

          if (!isLegacy) {
            warnings.push({
              code: 'FIELD_TYPE_MISSING',
              field: fieldKey,
              message: `Field "${fieldKey}" is missing data-wm-type attribute. Inferred as "${fieldType}".`
            });
          }
        } else if (!STANDARD_FIELD_TYPES.has(fieldType)) {
          errors.push({
            code: 'INVALID_FIELD_TYPE',
            field: fieldKey,
            value: rawType,
            message: `Invalid field type "${rawType}" on field "${fieldKey}".`
          });
        }

        // Required flag
        const rawRequired = el.getAttribute('data-wm-required');
        const isRequired = parseBoolean(rawRequired, false);

        // Label
        const fieldLabel = el.getAttribute('data-wm-label') ||
          fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        // Default & Placeholder
        const defaultValue = el.getAttribute('data-wm-default') || null;
        const placeholder = el.getAttribute('data-wm-placeholder') || null;

        // Maxlength
        const rawMaxlength = el.getAttribute('data-wm-maxlength');
        let maxlength = null;
        if (rawMaxlength !== null && rawMaxlength !== '') {
          const parsedMax = parseInt(rawMaxlength, 10);
          if (Number.isNaN(parsedMax) || parsedMax <= 0) {
            warnings.push({
              code: 'INVALID_MAX_LENGTH',
              field: fieldKey,
              value: rawMaxlength,
              message: `Invalid data-wm-maxlength "${rawMaxlength}" on field "${fieldKey}".`
            });
          } else {
            maxlength = parsedMax;
          }
        }

        // Group & Section
        let group = el.getAttribute('data-wm-group');
        if (!group) {
          // Infer standard group if not set
          if (fieldType === 'image' || fieldType === 'image-multiple' || fieldType === 'video' || fieldType === 'audio' || fieldType === 'voice') {
            group = 'media';
          } else if (fieldType === 'color') {
            group = 'appearance';
          } else {
            group = 'personal';
          }
        }

        const section = el.getAttribute('data-wm-section') || el.closest?.('[data-wm-section]')?.getAttribute('data-wm-section') || null;
        if (section && !sectionKeysSet.has(section)) {
          warnings.push({
            code: 'UNKNOWN_SECTION_REFERENCE',
            field: fieldKey,
            section,
            message: `Field "${fieldKey}" references undeclared section "${section}".`
          });
        }

        // Options
        const rawOptions = el.getAttribute('data-wm-options');
        const options = parseOptions(rawOptions, warnings, fieldKey);
        if ((fieldType === 'select' || fieldType === 'multiselect') && (!options || options.length === 0)) {
          warnings.push({
            code: 'SELECT_OPTIONS_MISSING',
            field: fieldKey,
            message: `Select field "${fieldKey}" does not have any options defined.`
          });
        }

        // Multi-target tracking & Conflict Resolution
        if (fieldsMap.has(fieldKey)) {
          const existing = fieldsMap.get(fieldKey);
          existing.targets += 1;

          // Check for conflicts
          if (existing.type !== fieldType) {
            errors.push({
              code: 'FIELD_METADATA_CONFLICT',
              field: fieldKey,
              message: `Type mismatch for field "${fieldKey}": defined as "${existing.type}" and "${fieldType}".`
            });
          }

          if (rawRequired !== null && existing.rawRequired !== null && existing.required !== isRequired) {
            warnings.push({
              code: 'FIELD_REQUIRED_CONFLICT',
              field: fieldKey,
              message: `Conflicting required metadata for field "${fieldKey}".`
            });
          }

          if (el.hasAttribute('data-wm-label') && existing.hasCustomLabel && existing.label !== fieldLabel) {
            warnings.push({
              code: 'FIELD_LABEL_CONFLICT',
              field: fieldKey,
              message: `Conflicting label metadata for field "${fieldKey}": "${existing.label}" vs "${fieldLabel}".`
            });
          }
        } else {
          const newField = {
            key: fieldKey,
            label: fieldLabel,
            type: fieldType,
            required: isRequired,
            rawRequired: rawRequired,
            hasCustomLabel: el.hasAttribute('data-wm-label'),
            defaultValue: defaultValue,
            placeholder: placeholder,
            maxlength: maxlength,
            group: group,
            section: section,
            options: options,
            legacy: isLegacy,
            targets: 1
          };

          fieldsMap.set(fieldKey, newField);
          fieldsList.push(newField);
        }
      } catch (err) {
        errors.push({
          code: 'FIELD_PARSING_ERROR',
          message: `Unexpected error parsing field: ${err.message}`
        });
      }
    });

    // Clean internal tracking properties from fields
    const fields = fieldsList.map(f => {
      const { rawRequired, hasCustomLabel, ...cleanField } = f;
      return cleanField;
    });

    // 4. Global Animations, Themes, Particles, Backgrounds, Surfaces & Part 6/7 Systems
    const rawAnimEnabled = (
      bodyEl?.getAttribute?.('data-wm-animations-enabled') ||
      bodyEl?.getAttribute?.('data-wm-animation-enabled') ||
      rootEl.getAttribute?.('data-wm-animations-enabled') ||
      rootEl.getAttribute?.('data-wm-animation-enabled') ||
      'true'
    );
    const animationsMasterEnabled = parseBoolean(rawAnimEnabled, true);

    // Standard Protocol Page Entrance Animations (Spec 7, 8)
    const STANDARD_PAGE_ANIMATIONS = new Set([
      'fade-up', 'fade', 'soft-scale', 'blur-reveal', 'cinematic', 'magical', 'none'
    ]);

    const rawPageAnimsAttr = (
      rootEl.getAttribute?.('data-wm-page-animations') ||
      bodyEl?.getAttribute?.('data-wm-page-animations') ||
      rootEl.getAttribute?.('data-wm-page-animation') ||
      rootEl.getAttribute?.('data-wm-animations') ||
      bodyEl?.getAttribute?.('data-wm-animations') ||
      ''
    );
    const parsedPageAnims = parseList(rawPageAnimsAttr);
    const supportedPageAnims = [];

    parsedPageAnims.forEach(anim => {
      const lower = anim.toLowerCase();
      if (!STANDARD_PAGE_ANIMATIONS.has(lower)) {
        warnings.push({
          code: 'UNRECOGNIZED_PAGE_ANIMATION',
          value: anim,
          message: `Unrecognized page animation "${anim}". Retaining as custom capability.`
        });
      }
      if (!supportedPageAnims.includes(lower)) {
        supportedPageAnims.push(lower);
      }
    });

    const pageAnims = supportedPageAnims.length > 0 ? supportedPageAnims : ['fade-up', 'soft-scale', 'cinematic'];

    const rawDefaultPageAnim = (
      bodyEl?.getAttribute?.('data-wm-default-page-animation') ||
      rootEl.getAttribute?.('data-wm-default-page-animation') ||
      ''
    ).trim().toLowerCase();

    let defaultPageAnim = pageAnims[0];
    if (rawDefaultPageAnim) {
      if (pageAnims.includes(rawDefaultPageAnim)) {
        defaultPageAnim = rawDefaultPageAnim;
      } else {
        warnings.push({
          code: 'INVALID_DEFAULT_PAGE_ANIMATION',
          value: rawDefaultPageAnim,
          message: `Default page animation "${rawDefaultPageAnim}" is not declared. Falling back to "${pageAnims[0]}".`
        });
      }
    }

    // Text Reveal Animations (Spec 13, 14)
    const STANDARD_TEXT_ANIMATIONS = new Set([
      'letter-fade', 'typewriter', 'glow', 'instant', 'none'
    ]);
    const rawTextAnimsAttr = (
      rootEl.getAttribute?.('data-wm-text-animations') ||
      bodyEl?.getAttribute?.('data-wm-text-animations') ||
      rootEl.getAttribute?.('data-wm-text-animation') ||
      bodyEl?.getAttribute?.('data-wm-text-animation') ||
      ''
    );
    const parsedTextAnims = parseList(rawTextAnimsAttr);
    const supportedTextAnims = [];
    parsedTextAnims.forEach(anim => {
      const lower = anim.toLowerCase();
      if (!supportedTextAnims.includes(lower)) supportedTextAnims.push(lower);
    });
    const textAnims = supportedTextAnims.length > 0 ? supportedTextAnims : ['fade', 'typewriter', 'glow'];
    const rawDefaultTextAnim = (
      bodyEl?.getAttribute?.('data-wm-default-text-animation') ||
      rootEl.getAttribute?.('data-wm-default-text-animation') ||
      ''
    ).trim().toLowerCase();
    const defaultTextAnim = textAnims.includes(rawDefaultTextAnim) ? rawDefaultTextAnim : textAnims[0];

    // Media Reveal Animations (Spec 15, 16)
    const STANDARD_MEDIA_ANIMATIONS = new Set([
      'fade', 'ken-burns', 'polaroid-pop', 'blur-clear', 'instant', 'none'
    ]);
    const rawMediaAnimsAttr = (
      rootEl.getAttribute?.('data-wm-media-animations') ||
      bodyEl?.getAttribute?.('data-wm-media-animations') ||
      rootEl.getAttribute?.('data-wm-media-animation') ||
      bodyEl?.getAttribute?.('data-wm-media-animation') ||
      ''
    );
    const parsedMediaAnims = parseList(rawMediaAnimsAttr);
    const supportedMediaAnims = [];
    parsedMediaAnims.forEach(anim => {
      const lower = anim.toLowerCase();
      if (!supportedMediaAnims.includes(lower)) supportedMediaAnims.push(lower);
    });
    const mediaAnims = supportedMediaAnims.length > 0 ? supportedMediaAnims : ['fade', 'polaroid-pop', 'ken-burns'];
    const rawDefaultMediaAnim = (
      bodyEl?.getAttribute?.('data-wm-default-media-animation') ||
      rootEl.getAttribute?.('data-wm-default-media-animation') ||
      ''
    ).trim().toLowerCase();
    const defaultMediaAnim = mediaAnims.includes(rawDefaultMediaAnim) ? rawDefaultMediaAnim : mediaAnims[0];

    // Animation Speed (Spec 28)
    const rawAnimSpeedAttr = (
      bodyEl?.getAttribute?.('data-wm-animation-speed') ||
      rootEl.getAttribute?.('data-wm-animation-speed') ||
      ''
    );
    const supportedAnimSpeeds = parseList(rawAnimSpeedAttr);

    // Replay intro support (Spec 50)
    const hasReplayIntro = parseBoolean(
      bodyEl?.getAttribute?.('data-wm-replay-intro') ||
      rootEl.getAttribute?.('data-wm-replay-intro'),
      false
    );

    // --- PART 6: THEMES & PRESETS (Spec 3, 4, 5, 6, 67) ---
    const rawRootThemes = rootEl.getAttribute?.('data-wm-themes') || rootEl.getAttribute?.('data-wm-theme');
    const rawBodyThemes = bodyEl?.getAttribute?.('data-wm-themes') || bodyEl?.getAttribute?.('data-wm-theme');

    if (rawRootThemes && rawBodyThemes && rawRootThemes !== rawBodyThemes) {
      warnings.push({
        code: 'THEME_METADATA_CONFLICT',
        message: `Conflict in theme declarations between <html> (${rawRootThemes}) and <body> (${rawBodyThemes}). Preferring <body> declaration.`
      });
    }

    const rawThemesAttr = rawBodyThemes || rawRootThemes;
    const hasThemeDeclaration = Boolean(rawThemesAttr);
    const parsedThemesList = parseList(rawThemesAttr || '');

    // Standard presets for normalization (Spec 3)
    const STANDARD_THEME_PRESETS = new Set([
      'magical', 'romantic', 'cute', 'elegant', 'royal', 'dark', 'pastel', 'celebration', 'joyful', 'festive'
    ]);

    const supportedThemes = [];
    parsedThemesList.forEach(thm => {
      const lower = thm.toLowerCase();
      if (!STANDARD_THEME_PRESETS.has(lower)) {
        warnings.push({
          code: 'UNRECOGNIZED_THEME_PRESET',
          value: thm,
          message: `Unrecognized or non-standard theme preset "${thm}". Retaining as custom theme capability.`
        });
      }
      if (!supportedThemes.includes(lower)) {
        supportedThemes.push(lower);
      }
    });

    const rawDefaultTheme = (
      bodyEl?.getAttribute?.('data-wm-default-theme') ||
      rootEl.getAttribute?.('data-wm-default-theme') ||
      ''
    ).trim().toLowerCase();

    let defaultTheme = null;
    if (supportedThemes.length > 0) {
      if (rawDefaultTheme && supportedThemes.includes(rawDefaultTheme)) {
        defaultTheme = rawDefaultTheme;
      } else {
        if (rawDefaultTheme) {
          warnings.push({
            code: 'INVALID_DEFAULT_THEME',
            value: rawDefaultTheme,
            message: `Declared default theme "${rawDefaultTheme}" is not in supported themes [${supportedThemes.join(', ')}]. Falling back to first valid theme.`
          });
        }
        defaultTheme = supportedThemes[0];
      }
    }

    // Normalized theme preset objects (Spec 6)
    const themePresetObjects = supportedThemes.map(thId => {
      const label = thId.charAt(0).toUpperCase() + thId.slice(1);
      return {
        id: thId,
        label,
        description: `${label} aesthetic theme`
      };
    });

    // Backward compatibility for existing themes array
    const themes = hasThemeDeclaration ? supportedThemes : ['magical', 'romantic', 'celebration'];

    // --- PART 6: COLORS & PALETTES (Spec 11, 12, 13) ---
    const rawColorsAttr = (
      bodyEl?.getAttribute?.('data-wm-colors') ||
      rootEl.getAttribute?.('data-wm-colors') ||
      ''
    );
    const declaredColorsList = parseList(rawColorsAttr);

    // Extract color defaults (Spec 12)
    const colorDefaults = {};
    const colorAttributes = ['primary', 'secondary', 'accent', 'glow', 'text', 'background', 'surface', 'muted', 'border'];
    colorAttributes.forEach(colKey => {
      const defVal = (
        bodyEl?.getAttribute?.(`data-wm-default-${colKey}`) ||
        rootEl.getAttribute?.(`data-wm-default-${colKey}`) ||
        null
      );
      if (defVal) {
        colorDefaults[colKey] = defVal.trim();
      }
    });

    // --- PART 6: BACKGROUNDS (Spec 14, 15, 17) ---
    const rawBackgroundsAttr = (
      bodyEl?.getAttribute?.('data-wm-backgrounds') ||
      rootEl.getAttribute?.('data-wm-backgrounds') ||
      ''
    );
    const backgrounds = parseList(rawBackgroundsAttr);
    const rawDefaultBg = (
      bodyEl?.getAttribute?.('data-wm-default-background') ||
      rootEl.getAttribute?.('data-wm-default-background') ||
      ''
    ).trim().toLowerCase();
    const defaultBackground = backgrounds.includes(rawDefaultBg)
      ? rawDefaultBg
      : (backgrounds.length > 0 ? backgrounds[0] : null);

    // --- PART 6: SURFACES (Spec 18, 19) ---
    const rawSurfacesAttr = (
      bodyEl?.getAttribute?.('data-wm-surfaces') ||
      rootEl.getAttribute?.('data-wm-surfaces') ||
      ''
    );
    const surfaces = parseList(rawSurfacesAttr);
    const rawDefaultSurface = (
      bodyEl?.getAttribute?.('data-wm-default-surface') ||
      rootEl.getAttribute?.('data-wm-default-surface') ||
      ''
    ).trim().toLowerCase();
    const defaultSurface = surfaces.includes(rawDefaultSurface)
      ? rawDefaultSurface
      : (surfaces.length > 0 ? surfaces[0] : null);

    // --- PART 6: BUTTON STYLES (Spec 20, 21) ---
    const rawButtonsAttr = (
      bodyEl?.getAttribute?.('data-wm-button-styles') ||
      rootEl.getAttribute?.('data-wm-button-styles') ||
      ''
    );
    const buttonStyles = parseList(rawButtonsAttr);
    const rawDefaultButton = (
      bodyEl?.getAttribute?.('data-wm-default-button-style') ||
      rootEl.getAttribute?.('data-wm-default-button-style') ||
      ''
    ).trim().toLowerCase();
    const defaultButtonStyle = buttonStyles.includes(rawDefaultButton)
      ? rawDefaultButton
      : (buttonStyles.length > 0 ? buttonStyles[0] : null);

    // --- PART 6: TYPOGRAPHY (Spec 22, 23, 24, 25, 26) ---
    const rawTypographyAttr = (
      bodyEl?.getAttribute?.('data-wm-typography') ||
      rootEl.getAttribute?.('data-wm-typography') ||
      ''
    );
    const typographySupported = parseList(rawTypographyAttr);

    const rawFontsAttr = (
      bodyEl?.getAttribute?.('data-wm-fonts') ||
      rootEl.getAttribute?.('data-wm-fonts') ||
      ''
    );
    const fontsList = parseList(rawFontsAttr);

    const rawFontWeightsAttr = (
      bodyEl?.getAttribute?.('data-wm-font-weights') ||
      rootEl.getAttribute?.('data-wm-font-weights') ||
      ''
    );
    const fontWeights = parseList(rawFontWeightsAttr);

    const customFontAllowed = parseBoolean(
      bodyEl?.getAttribute?.('data-wm-custom-font') ||
      rootEl.getAttribute?.('data-wm-custom-font'),
      false
    );

    // --- PART 6: BORDER RADIUS (Spec 27) ---
    const rawRadiusAttr = (
      bodyEl?.getAttribute?.('data-wm-radius') ||
      rootEl.getAttribute?.('data-wm-radius') ||
      ''
    );
    const radiusOptions = parseList(rawRadiusAttr);

    // --- PART 6: GLOW / EFFECT INTENSITY (Spec 28, 29) ---
    const rawIntensityAttr = (
      bodyEl?.getAttribute?.('data-wm-intensity') ||
      rootEl.getAttribute?.('data-wm-intensity') ||
      ''
    );
    const intensityOptions = parseList(rawIntensityAttr);
    const rawDefaultIntensity = (
      bodyEl?.getAttribute?.('data-wm-default-intensity') ||
      rootEl.getAttribute?.('data-wm-default-intensity') ||
      ''
    ).trim().toLowerCase();
    const defaultIntensity = intensityOptions.includes(rawDefaultIntensity)
      ? rawDefaultIntensity
      : (intensityOptions.length > 0 ? intensityOptions[0] : null);

    // --- PART 6: TEMPLATE-SPECIFIC CUSTOM VISUAL CONTROLS (Spec 49, 50, 51) ---
    const customControlElements = doc.querySelectorAll
      ? Array.from(doc.querySelectorAll('[data-wm-visual-control]'))
      : [];
    const customVisualControls = [];

    customControlElements.forEach(ctrlEl => {
      const ctrlId = (ctrlEl.getAttribute('data-wm-visual-control') || '').trim();
      if (!ctrlId) return;

      const ctrlType = (ctrlEl.getAttribute('data-wm-type') || 'range').trim().toLowerCase();
      const ctrlMin = parseFloat(ctrlEl.getAttribute('data-wm-min') || '0');
      const ctrlMax = parseFloat(ctrlEl.getAttribute('data-wm-max') || '100');
      const ctrlStep = parseFloat(ctrlEl.getAttribute('data-wm-step') || '1');
      const ctrlLabel = ctrlEl.getAttribute('data-wm-label') || ctrlId.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const rawDefault = ctrlEl.getAttribute('data-wm-default');
      let ctrlDefault = rawDefault !== null ? rawDefault : (ctrlType === 'range' ? 50 : '');
      if (ctrlType === 'range' || ctrlType === 'number') {
        ctrlDefault = Number(ctrlDefault);
      }

      customVisualControls.push({
        id: ctrlId,
        label: ctrlLabel,
        type: ctrlType,
        min: Number.isNaN(ctrlMin) ? 0 : ctrlMin,
        max: Number.isNaN(ctrlMax) ? 100 : ctrlMax,
        step: Number.isNaN(ctrlStep) ? 1 : ctrlStep,
        default: ctrlDefault,
        options: parseList(ctrlEl.getAttribute('data-wm-options'))
      });
    });

    // Standard Particle Types (Spec 17, 18, 19, 20)
    const STANDARD_PARTICLE_TYPES = new Set([
      'sparkles', 'hearts', 'rose-petals', 'stars', 'confetti', 'starlight-bokeh', 'none'
    ]);
    const rawParticlesAttr = (
      bodyEl?.getAttribute?.('data-wm-particles') ||
      rootEl.getAttribute?.('data-wm-particles') ||
      ''
    );
    const parsedParticles = parseList(rawParticlesAttr);
    const supportedParticles = [];
    parsedParticles.forEach(p => {
      const lower = p.toLowerCase();
      if (!supportedParticles.includes(lower)) supportedParticles.push(lower);
    });

    const particleStyles = supportedParticles.length > 0 ? supportedParticles : ['sparkles', 'confetti'];

    const rawDefaultParticles = (
      bodyEl?.getAttribute?.('data-wm-default-particles') ||
      rootEl.getAttribute?.('data-wm-default-particles') ||
      ''
    ).trim().toLowerCase();
    const defaultParticleType = particleStyles.includes(rawDefaultParticles)
      ? rawDefaultParticles
      : particleStyles[0];

    const particleIntensity = parseList(
      bodyEl?.getAttribute?.('data-wm-particle-intensity') ||
      rootEl.getAttribute?.('data-wm-particle-intensity') ||
      'minimal,soft,expressive'
    );

    // Interactive & Ambient Effects (Spec 24, 25, 26)
    const particleInteractive = parseList(
      bodyEl?.getAttribute?.('data-wm-interactive-effects') ||
      rootEl.getAttribute?.('data-wm-interactive-effects') ||
      ''
    );

    const ambientEffects = parseList(
      bodyEl?.getAttribute?.('data-wm-ambient-effects') ||
      rootEl.getAttribute?.('data-wm-ambient-effects') ||
      ''
    );

    // Custom Animation Controls (Spec 32, 74)
    const customAnimControlElements = doc.querySelectorAll
      ? Array.from(doc.querySelectorAll('[data-wm-animation-control]'))
      : [];
    const customAnimationControls = [];

    customAnimControlElements.forEach(ctrlEl => {
      const ctrlId = (ctrlEl.getAttribute('data-wm-animation-control') || '').trim();
      if (!ctrlId) return;

      const ctrlType = (ctrlEl.getAttribute('data-wm-type') || 'range').trim().toLowerCase();
      const ctrlMin = parseFloat(ctrlEl.getAttribute('data-wm-min') || '0');
      const ctrlMax = parseFloat(ctrlEl.getAttribute('data-wm-max') || '100');
      const ctrlStep = parseFloat(ctrlEl.getAttribute('data-wm-step') || '1');
      const ctrlLabel = ctrlEl.getAttribute('data-wm-label') || ctrlId.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const rawDefault = ctrlEl.getAttribute('data-wm-default');
      let ctrlDefault = rawDefault !== null ? rawDefault : (ctrlType === 'range' ? 50 : '');
      if (ctrlType === 'range' || ctrlType === 'number') {
        ctrlDefault = Number(ctrlDefault);
      }

      customAnimationControls.push({
        id: ctrlId,
        label: ctrlLabel,
        type: ctrlType,
        min: Number.isNaN(ctrlMin) ? 0 : ctrlMin,
        max: Number.isNaN(ctrlMax) ? 100 : ctrlMax,
        step: Number.isNaN(ctrlStep) ? 1 : ctrlStep,
        default: ctrlDefault,
        options: parseList(ctrlEl.getAttribute('data-wm-options'))
      });
    });

    // 5. Advanced Media Capability Discovery (Part 8 - Spec 1 to 78)
    let rawMediaElements = [];
    if (doc.querySelectorAll) {
      const mediaList = Array.from(doc.querySelectorAll('[data-wm-media]'));
      const fieldList = Array.from(doc.querySelectorAll('[data-wm-field]'));
      const mediaTypesSet = new Set(['image', 'image-multiple', 'video', 'video-multiple', 'audio', 'voice']);
      const mediaFieldList = fieldList.filter(el => {
        const t = (el.getAttribute('data-wm-type') || (el.tagName === 'IMG' ? 'image' : el.tagName === 'VIDEO' ? 'video' : el.tagName === 'AUDIO' ? 'audio' : '')).toLowerCase();
        return mediaTypesSet.has(t);
      });
      const combined = [...mediaList, ...mediaFieldList];
      const seenNodes = new Set();
      combined.forEach(n => {
        if (!seenNodes.has(n)) {
          seenNodes.add(n);
          rawMediaElements.push(n);
        }
      });
    }

    const mediaSlotsMap = new Map();
    const seenMediaIds = new Map();

    const STANDARD_MEDIA_ROLES = new Set([
      'cover', 'gallery', 'hero', 'background', 'memory', 'timeline', 'voice', 'music'
    ]);

    const STANDARD_FIT_MODES = new Set(['cover', 'contain', 'fill', 'none']);
    const STANDARD_POSITION_MODES = new Set(['center', 'top', 'bottom', 'left', 'right']);

    rawMediaElements.forEach((el) => {
      const explicitMediaId = el.getAttribute('data-wm-media');
      const fieldId = el.getAttribute('data-wm-field');
      const rawMediaId = (explicitMediaId || fieldId || '').trim();
      if (!rawMediaId) return;

      // Safe Protocol Identifier Validation (Spec 72)
      if (!/^[a-zA-Z0-9_\-]+$/.test(rawMediaId)) {
        warnings.push({
          code: 'INVALID_MEDIA_ID',
          mediaId: rawMediaId,
          message: `Media ID "${rawMediaId}" contains invalid characters. Use alphanumeric, underscore, or hyphens.`
        });
      }

      // Instance handling (Spec 74)
      const instance = el.getAttribute('data-wm-media-instance') || null;
      const slotMapKey = instance ? `${rawMediaId}:${instance}` : rawMediaId;

      // Duplicate Media ID detection (Spec 71 & 73)
      if (seenMediaIds.has(rawMediaId)) {
        const count = seenMediaIds.get(rawMediaId);
        seenMediaIds.set(rawMediaId, count + 1);
        if (!instance) {
          warnings.push({
            code: 'DUPLICATE_MEDIA_ID',
            mediaId: rawMediaId,
            message: `Duplicate media ID: "${rawMediaId}". Use data-wm-media-instance for repeated slots.`
          });
        }
      } else {
        seenMediaIds.set(rawMediaId, 1);
      }

      // Media Type
      let rawType = el.getAttribute('data-wm-type');
      if (!rawType) {
        if (el.tagName === 'IMG') rawType = 'image';
        else if (el.tagName === 'VIDEO') rawType = 'video';
        else if (el.tagName === 'AUDIO') rawType = 'audio';
        else rawType = 'image';
        warnings.push({
          code: 'MEDIA_TYPE_MISSING',
          mediaId: rawMediaId,
          message: `Media slot "${rawMediaId}" is missing data-wm-type attribute. Inferred as "${rawType}".`
        });
      }
      const mediaType = (rawType || 'image').trim().toLowerCase();

      const isMultiple = mediaType === 'image-multiple' || mediaType === 'video-multiple' || parseBoolean(el.getAttribute('data-wm-multiple'), false);

      // Role
      const rawRole = (el.getAttribute('data-wm-role') || '').trim().toLowerCase();
      let role = null;
      if (rawRole) {
        role = rawRole;
        if (!STANDARD_MEDIA_ROLES.has(rawRole)) {
          warnings.push({
            code: 'INVALID_MEDIA_ROLE',
            mediaId: rawMediaId,
            value: rawRole,
            message: `Custom or non-standard media role "${rawRole}" on slot "${rawMediaId}".`
          });
        }
      } else {
        if (rawMediaId.includes('cover')) role = 'cover';
        else if (rawMediaId.includes('gallery') || isMultiple) role = 'gallery';
        else if (mediaType === 'audio' || rawMediaId.includes('music')) role = 'music';
        else if (mediaType === 'voice' || rawMediaId.includes('voice')) role = 'voice';
      }

      // Required
      const isRequired = parseBoolean(el.getAttribute('data-wm-required'), false);

      // Label & Description
      const rawLabel = el.getAttribute('data-wm-label');
      const label = rawLabel || rawMediaId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const description = el.getAttribute('data-wm-description') || '';

      // Placement
      const placement = el.getAttribute('data-wm-media-placement') || (role === 'background' ? 'background' : role === 'cover' ? 'hero' : null);

      // Min / Max Items (Spec 8)
      const rawMin = parseInt(el.getAttribute('data-wm-min-items'), 10);
      const rawMax = parseInt(el.getAttribute('data-wm-max-items'), 10);
      let minItems = Number.isNaN(rawMin) ? (isRequired ? 1 : 0) : rawMin;
      let maxItems = Number.isNaN(rawMax) ? (isMultiple ? 8 : 1) : rawMax;

      if (!isMultiple && maxItems > 1) {
        warnings.push({
          code: 'MULTIPLE_MAX_CONFLICT',
          mediaId: rawMediaId,
          message: `Slot "${rawMediaId}" has multiple=false but maxItems=${maxItems}.`
        });
        maxItems = 1;
      }
      if (isRequired && minItems === 0) {
        warnings.push({
          code: 'REQUIRED_MIN_CONFLICT',
          mediaId: rawMediaId,
          message: `Slot "${rawMediaId}" is marked required=true but minItems=0.`
        });
        minItems = 1;
      }

      // Accept types (Spec 15 & 24 & 31)
      const rawAccept = el.getAttribute('data-wm-accept');
      let accept = [];
      if (rawAccept) {
        accept = parseList(rawAccept);
      } else {
        if (mediaType.startsWith('image')) accept = ['image/jpeg', 'image/png', 'image/webp'];
        else if (mediaType.startsWith('video')) accept = ['video/mp4', 'video/webm'];
        else if (mediaType === 'audio' || mediaType === 'voice') accept = ['audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg'];
      }

      // Max size bytes (Spec 16 & 25)
      const rawMaxSize = parseInt(el.getAttribute('data-wm-max-size'), 10);
      const maxSizeBytes = Number.isNaN(rawMaxSize) ? (mediaType.startsWith('video') ? 100 * 1024 * 1024 : 10 * 1024 * 1024) : rawMaxSize;

      // Dimensions (Spec 17)
      const minWidth = parseInt(el.getAttribute('data-wm-min-width'), 10) || null;
      const maxWidth = parseInt(el.getAttribute('data-wm-max-width'), 10) || null;
      const minHeight = parseInt(el.getAttribute('data-wm-min-height'), 10) || null;
      const maxHeight = parseInt(el.getAttribute('data-wm-max-height'), 10) || null;

      // Duration (Spec 26 & 39)
      const minDuration = parseInt(el.getAttribute('data-wm-min-duration'), 10) || null;
      const maxDuration = parseInt(el.getAttribute('data-wm-max-duration'), 10) || null;

      // Aspect ratio (Spec 18)
      const aspectRatio = el.getAttribute('data-wm-aspect-ratio') || null;

      // Crop (Spec 19)
      const crop = parseBoolean(el.getAttribute('data-wm-crop'), false);

      // Fit modes (Spec 20)
      const fitModes = parseList(el.getAttribute('data-wm-fit'));

      // Position modes (Spec 21)
      const positionModes = parseList(el.getAttribute('data-wm-position'));

      // Video Capabilities (Spec 27 & 28)
      const videoCapabilities = parseList(el.getAttribute('data-wm-video-capabilities'));
      const videoPoster = parseBoolean(el.getAttribute('data-wm-video-poster'), false);

      // Music & Audio options (Spec 32 & 33)
      const musicToggle = parseBoolean(el.getAttribute('data-wm-music-toggle'), true);
      const musicSource = parseList(el.getAttribute('data-wm-music-source') || 'curated,custom');
      const audioDucking = parseBoolean(el.getAttribute('data-wm-audio-ducking'), true);

      // Voice options (Spec 36, 37, 38)
      const voiceRecord = parseBoolean(el.getAttribute('data-wm-voice-record'), true);
      const voiceUpload = parseBoolean(el.getAttribute('data-wm-voice-upload'), true);

      // Reorderable & Alt (Spec 85 & 87)
      const reorderable = parseBoolean(el.getAttribute('data-wm-media-reorderable'), isMultiple);
      const allowAlt = parseBoolean(el.getAttribute('data-wm-alt'), true);

      // Custom Media Controls (Spec 76)
      const mediaControls = [];
      const ctrlElements = el.querySelectorAll ? Array.from(el.querySelectorAll('[data-wm-media-control]')) : [];
      ctrlElements.forEach(c => {
        mediaControls.push({
          id: c.getAttribute('data-wm-media-control'),
          type: c.getAttribute('data-wm-type') || 'select',
          options: parseList(c.getAttribute('data-wm-options'))
        });
      });

      if (!mediaSlotsMap.has(slotMapKey)) {
        mediaSlotsMap.set(slotMapKey, {
          id: rawMediaId,
          type: mediaType,
          role,
          label,
          description,
          required: isRequired,
          multiple: isMultiple,
          minItems,
          maxItems,
          accept,
          maxSizeBytes,
          minWidth,
          maxWidth,
          minHeight,
          maxHeight,
          minDuration,
          maxDuration,
          aspectRatio,
          crop,
          fit: fitModes,
          position: positionModes,
          placement,
          reorderable,
          allowAlt,
          videoCapabilities,
          videoPoster,
          musicToggle,
          musicSource,
          audioDucking,
          voiceRecord,
          voiceUpload,
          controls: mediaControls,
          instance
        });
      }
    });

    const mediaSlots = Array.from(mediaSlotsMap.values());

    const hasImageSlot = fields.some(f => f.type === 'image') || mediaSlots.some(m => m.type === 'image' || m.type === 'background-image');
    const hasMultipleImages = fields.some(f => f.type === 'image-multiple') || mediaSlots.some(m => m.type === 'image-multiple');
    const hasVideoSlot = fields.some(f => f.type === 'video' || f.type === 'background-video') || mediaSlots.some(m => m.type === 'video' || m.type === 'background-video');
    const hasMultipleVideos = fields.some(f => f.type === 'video-multiple') || mediaSlots.some(m => m.type === 'video-multiple');
    const hasAudioSlot = fields.some(f => f.type === 'audio') || mediaSlots.some(m => m.type === 'audio') || doc.querySelector?.('audio[data-wm-field], audio[data-wm-media]') !== null;
    const hasVoiceSlot = fields.some(f => f.type === 'voice') || mediaSlots.some(m => m.type === 'voice');

    // 6. Colors Discovery
    const colorFields = fields.filter(f => f.type === 'color').map(f => f.key);

    // 7. Dynamic Derived Capability Summary
    const hasRecipient = fields.some(f => f.key === 'recipient_name');
    const hasSender = fields.some(f => f.key === 'sender_name');
    const hasDate = fields.some(f => f.key === 'event_date' || f.type === 'date');
    const hasMessage = fields.some(f => f.key === 'custom_message' || f.type === 'textarea');
    const hasCountdown = sectionKeysSet.has('countdown') || fields.some(f => f.key === 'countdown' || f.type === 'datetime');
    const hasTimeline = sectionKeysSet.has('timeline');
    const hasOpenWhen = sectionKeysSet.has('open_when');
    const hasSecretMessage = sectionKeysSet.has('secret_message');
    const hasFinalSurprise = sectionKeysSet.has('final_surprise');
    const hasGallery = hasImageSlot || hasMultipleImages || sectionKeysSet.has('gallery');

    const capabilities = {
      recipientName: hasRecipient,
      senderName: hasSender,
      eventDate: hasDate,
      message: hasMessage,
      photos: hasImageSlot || hasMultipleImages,
      multiplePhotos: hasMultipleImages,
      videos: hasVideoSlot || hasMultipleVideos,
      multipleVideos: hasMultipleVideos,
      music: hasAudioSlot,
      voice: hasVoiceSlot,
      countdown: hasCountdown,
      timeline: hasTimeline,
      openWhen: hasOpenWhen,
      secretMessage: hasSecretMessage,
      finalSurprise: hasFinalSurprise,
      colors: colorFields.length > 0,
      gallery: hasGallery,
      themes: themes.length > 0,
      particles: particleStyles.length > 0,
      animations: pageAnims.length > 0
    };

    return {
      valid: errors.length === 0,
      protocol: {
        version: protocolVersion,
        compatible: true,
        runtime: runtimeVer || PROTOCOL_VERSION
      },
      template: {
        type: metaType || 'wish-template',
        version: metaVer || PROTOCOL_VERSION
      },
      fields,
      sections,
      capabilities,
      animations: {
        enabled: animationsMasterEnabled,
        page: pageAnims,
        text: textAnims,
        media: mediaAnims,
        sections: Array.from(new Set(sections.flatMap(s => s.animation))),
        pageEntrance: {
          supported: pageAnims,
          default: defaultPageAnim
        },
        textReveal: {
          supported: textAnims,
          default: defaultTextAnim
        },
        mediaReveal: {
          supported: mediaAnims,
          default: defaultMediaAnim
        },
        speeds: supportedAnimSpeeds,
        replayIntro: hasReplayIntro,
        customControls: customAnimationControls
      },
      themes,
      particles: {
        styles: particleStyles,
        default: defaultParticleType,
        intensity: particleIntensity,
        interactive: particleInteractive,
        ambient: ambientEffects
      },
      media: {
        images: hasImageSlot,
        multipleImages: hasMultipleImages,
        video: hasVideoSlot,
        multipleVideos: hasMultipleVideos,
        audio: hasAudioSlot,
        voice: hasVoiceSlot,
        slots: mediaSlots
      },
      colors: {
        supported: (declaredColorsList.length > 0) || (colorFields.length > 0),
        fields: colorFields,
        palette: declaredColorsList,
        defaults: colorDefaults
      },
      visual: {
        themes: {
          supported: supportedThemes,
          default: defaultTheme,
          presets: themePresetObjects
        },
        colors: {
          supported: declaredColorsList,
          defaults: colorDefaults
        },
        backgrounds: {
          supported: backgrounds,
          default: defaultBackground
        },
        surfaces: {
          supported: surfaces,
          default: defaultSurface
        },
        buttons: {
          supported: buttonStyles,
          default: defaultButtonStyle
        },
        typography: {
          supported: typographySupported,
          fonts: fontsList,
          weights: fontWeights,
          customFont: customFontAllowed
        },
        radius: {
          supported: radiusOptions
        },
        intensity: {
          supported: intensityOptions,
          default: defaultIntensity
        },
        customControls: customVisualControls
      },
      backgrounds,
      surfaces,
      buttonStyles,
      warnings,
      errors
    };
  }

  /**
   * Main Analyzer Object
   */
  const WishMagicTemplateAnalyzer = {
    PROTOCOL_VERSION,

    /**
     * Analyze current document or specific target document
     * @param {Object} options - { force: boolean, document: Document }
     */
    analyze(options = {}) {
      if (options.document) {
        return executeAnalysis(options.document);
      }
      if (cachedAnalysisResult && !options.force) {
        return cachedAnalysisResult;
      }
      cachedAnalysisResult = executeAnalysis(typeof document !== 'undefined' ? document : null);
      return cachedAnalysisResult;
    },

    getResult() {
      return cachedAnalysisResult || this.analyze();
    },

    getFields() {
      return (cachedAnalysisResult || this.analyze()).fields;
    },

    getSections() {
      return (cachedAnalysisResult || this.analyze()).sections;
    },

    getCapabilities() {
      return (cachedAnalysisResult || this.analyze()).capabilities;
    },

    getWarnings() {
      return (cachedAnalysisResult || this.analyze()).warnings;
    },

    getErrors() {
      return (cachedAnalysisResult || this.analyze()).errors;
    },

    /**
     * Concise summary report of template capabilities
     */
    getCapabilityReport(options = {}) {
      const res = this.analyze(options);
      return {
        templateCompatible: res.valid && res.protocol.compatible,
        protocolVersion: res.protocol.version,
        fields: res.fields.length,
        sections: res.sections.length,
        capabilities: res.capabilities,
        media: res.media,
        themes: res.themes.length,
        particles: res.particles.styles.length,
        warnings: res.warnings.length,
        errors: res.errors.length
      };
    },

    /**
     * Development console logger
     */
    debug(options = {}) {
      const res = this.analyze({ force: true, ...options });
      if (typeof console !== 'undefined' && console.log) {
        console.log('%c✨ WishMagic Template Analyzer Report', 'color:#ec4899;font-weight:bold;font-size:14px;');
        console.log('----------------------------------------------------');
        console.log(`Protocol Version : ${res.protocol.version}`);
        console.log(`Template Valid   : ${res.valid ? '✅ VALID' : '❌ INVALID'}`);
        console.log(`Discovered Fields: ${res.fields.length}`);
        console.log(`Sections         : ${res.sections.length}`);
        console.log('Capabilities     :', res.capabilities);
        console.log('Media Slots      :', res.media);
        console.log('Themes           :', res.themes);
        console.log('Particles        :', res.particles.styles);
        console.log(`Warnings (${res.warnings.length}):`, res.warnings);
        console.log(`Errors   (${res.errors.length}):`, res.errors);
        console.log('----------------------------------------------------');
      }
      return res;
    },

    invalidate() {
      cachedAnalysisResult = null;
    }
  };

  // Expose to global environment
  global.WishMagicTemplateAnalyzer = WishMagicTemplateAnalyzer;

  // Bridge with WishMagicTemplate protocol API from Part 1
  if (global.WishMagicTemplate) {
    global.WishMagicTemplate.getCapabilities = function () {
      return WishMagicTemplateAnalyzer.analyze();
    };
  }

})(typeof window !== 'undefined' ? window : this);
