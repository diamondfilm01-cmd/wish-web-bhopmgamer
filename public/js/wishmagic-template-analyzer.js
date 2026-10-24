/**
 * WishMagic Universal Template Capability Analyzer & Auto Schema Generator (Part 12)
 * ==================================================================================
 * Declarative, multi-source capability inspector & automated schema generator.
 *
 * Inspects:
 * - HTML DOM / string (data-wm-* attributes, elements, mappings, structure)
 * - wishmagic.json manifest / schema metadata
 * - CSS stylesheets (CSS custom properties --wm-*, theme selectors, animations, surfaces)
 * - JavaScript sources (Safe static inspection - NO eval, NO new Function)
 * - Media Assets / Package Inventory (images, videos, audio, fonts)
 *
 * Core Principles:
 * - Source of Truth Priority: Explicit WishMagic metadata -> wishmagic.json -> data-wm-* HTML -> safe structure -> NO unsupported guessing.
 * - Honest Capabilities: Never guess or inflate capabilities (e.g. no voice unless declared, exact gallery slot limits).
 * - Multi-Mapping Tracking: Same field across multiple elements produces 1 field entry with multiple DOM mappings.
 * - Deterministic HTML + JSON Merge & Conflict Detection (e.g. type mismatch, bounds discrepancy).
 * - Media Inventory & Asset Validation: Missing required assets -> ERROR (blocks publish); Unused assets -> WARNING.
 * - Deterministic Output: Same inputs always produce identical schema with capabilitySchemaHash.
 * - Safe Path Traversal & Security Protection: Path sanitization, zero network fetching during analysis.
 *
 * Browser DOM and Headless Node.js / SSR compatible.
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
    'checkbox',
    'boolean',
    'repeater',
    'media_list',
    'theme',
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

  const KNOWN_SECTIONS = new Set([
    'hero',
    'message',
    'gallery',
    'memories',
    'timeline',
    'countdown',
    'voice',
    'open_when',
    'secret_message',
    'final_surprise'
  ]);

  let cachedAnalysisResult = null;

  // ---------------------------------------------------------------------------
  // UTILITY HELPERS
  // ---------------------------------------------------------------------------

  function parseList(str) {
    if (!str || typeof str !== 'string') return [];
    return str
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  function parseBoolean(val, fallback = false) {
    if (val === null || val === undefined) return fallback;
    const s = String(val).trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
    return fallback;
  }

  function sanitizePath(filePath) {
    if (!filePath || typeof filePath !== 'string') return '';
    return filePath
      .replace(/\\/g, '/')
      .replace(/\.\.+/g, '')
      .replace(/^\/+/, '')
      .replace(/^[a-zA-Z]:\//, '');
  }

  function computeDJB2Hash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

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
        if (warnings) {
          warnings.push({
            code: 'INVALID_OPTIONS_FORMAT',
            field: fieldKey,
            message: `Malformed JSON options for field "${fieldKey}": ${e.message}`
          });
        }
      }
    }

    const list = parseList(trimmed);
    if (list.length > 0) {
      return list.map(item => ({
        value: item,
        label: item.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      }));
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // MAIN WISHMAGIC TEMPLATE ANALYZER MODULE
  // ---------------------------------------------------------------------------

  const WishMagicTemplateAnalyzer = {
    version: '1.3.0',
    protocolVersion: PROTOCOL_VERSION,

    /**
     * Complete Template Analysis Entry Point
     */
    analyze(template, options = {}) {
      if (!options.force && cachedAnalysisResult && !template) {
        return cachedAnalysisResult;
      }

      const warnings = [];
      const errors = [];

      let htmlContent = '';
      let cssContent = '';
      let jsContent = '';
      let rawMetadata = null;
      let files = [];
      let doc = null;

      // 1. Ingest input variations
      if (template) {
        if (typeof template === 'string') {
          htmlContent = template;
        } else if (typeof template === 'object') {
          if (template.nodeType || template.documentElement || template.querySelectorAll) {
            doc = template;
          } else if (template.document || template.doc) {
            doc = template.document || template.doc;
          } else {
            htmlContent = template.html || template.indexHtml || template.content || '';
            cssContent = template.css || template.styles || '';
            jsContent = template.js || template.scripts || '';
            rawMetadata = template.json || template.wishmagicJson || template.manifestJson || template.metadata || template.manifest || null;
            files = Array.isArray(template.files) ? template.files : (template.files && typeof template.files === 'object' ? Object.keys(template.files).map(k => ({ path: k, ...template.files[k] })) : []);
          }
        }
      }

      // If in browser and no doc/html provided, inspect current document
      if (!doc && !htmlContent && typeof document !== 'undefined') {
        doc = document;
      }

      // Parse HTML string to DOM if needed
      if (!doc && htmlContent) {
        if (typeof DOMParser !== 'undefined') {
          try {
            const parser = new DOMParser();
            doc = parser.parseFromString(htmlContent, 'text/html');
          } catch (e) {
            warnings.push({ code: 'DOM_PARSE_ERROR', message: `DOMParser error: ${e.message}` });
          }
        }
      }

      // 2. Perform modular sub-analyses
      const metadataResult = this.analyzeMetadata(rawMetadata);
      if (metadataResult && metadataResult.valid === false && metadataResult.error) {
        errors.push({ code: 'METADATA_ERROR', message: metadataResult.error });
      }
      const htmlResult = doc ? this.analyzeHTML(doc, { warnings, errors }) : (htmlContent ? this.analyzeHTML(htmlContent, { warnings, errors }) : { fields: [], sections: [], media: [], themes: [], animations: {}, capabilities: {} });
      const cssResult = this.analyzeCSS(cssContent, { warnings, errors });
      const jsResult = this.analyzeJS(jsContent, { warnings, errors });
      const mediaInventory = this.analyzeMedia(files, { htmlDoc: doc, htmlContent, cssContent, metadata: metadataResult, warnings, errors });

      // 3. Assemble and Merge Final Schema
      const schema = this.generateSchema({
        metadata: metadataResult,
        html: htmlResult,
        css: cssResult,
        js: jsResult,
        mediaInventory,
        warnings,
        errors,
        options
      });

      // Validate assembled schema
      this.validateSchema(schema);

      const isValid = errors.length === 0;
      schema.valid = isValid;
      schema.canPublish = isValid;
      schema.errors = errors;
      schema.warnings = warnings;
      Object.defineProperty(schema, 'schema', {
        get() { return this; },
        enumerable: false,
        configurable: true
      });

      cachedAnalysisResult = schema;
      return schema;
    },

    /**
     * Analyze Metadata / wishmagic.json
     */
    analyzeMetadata(metadata) {
      if (!metadata) return null;
      let parsed = metadata;
      if (typeof metadata === 'string') {
        try {
          parsed = JSON.parse(metadata);
        } catch (e) {
          return {
            valid: false,
            error: `Malformed JSON metadata: ${e.message}`,
            fields: [],
            sections: [],
            capabilities: {}
          };
        }
      }

      const tObj = (parsed && typeof parsed.template === 'object') ? parsed.template : parsed || {};
      return {
        valid: true,
        template: {
          id: tObj.id || tObj.templateId || tObj.template_id || parsed.id || parsed.templateId || parsed.template_id || '',
          name: tObj.name || tObj.title || parsed.name || parsed.title || '',
          version: tObj.version || parsed.version || '1.0.0',
          category: tObj.category || parsed.category || 'general',
          tier: tObj.tier || parsed.tier || 'free',
          price: tObj.price !== undefined ? tObj.price : (parsed.price !== undefined ? parsed.price : 0),
          description: tObj.description || parsed.description || '',
          author: tObj.author || parsed.author || 'WishMagic'
        },
        capabilities: parsed.capabilities || tObj.capabilities || {},
        fields: Array.isArray(parsed.fields) ? parsed.fields : (Array.isArray(tObj.fields) ? tObj.fields : []),
        sections: Array.isArray(parsed.sections) ? parsed.sections : (Array.isArray(tObj.sections) ? tObj.sections : []),
        themes: Array.isArray(parsed.themes) ? parsed.themes : (Array.isArray(tObj.themes) ? tObj.themes : []),
        media: Array.isArray(parsed.media) ? parsed.media : (parsed.media && typeof parsed.media === 'object' ? Object.keys(parsed.media).map(k => ({ key: k, ...parsed.media[k] })) : []),
        animations: parsed.animations || tObj.animations || {},
        particles: parsed.particles || tObj.particles || {},
        raw: parsed
      };
    },

    /**
     * Analyze HTML structure & data-wm-* metadata
     */
    analyzeHTML(htmlOrDoc, context = {}) {
      const warnings = context.warnings || [];
      const errors = context.errors || [];
      let doc = htmlOrDoc;

      if (typeof htmlOrDoc === 'string') {
        if (typeof DOMParser !== 'undefined') {
          const parser = new DOMParser();
          doc = parser.parseFromString(htmlOrDoc, 'text/html');
        } else {
          return this._analyzeHtmlStringFallback(htmlOrDoc, warnings, errors);
        }
      }

      if (!doc) {
        return { fields: [], sections: [], media: [], themes: [], animations: {}, capabilities: {} };
      }

      const rootEl = doc.documentElement || doc;
      const protocolVersion = rootEl.getAttribute ? (rootEl.getAttribute('data-wm-protocol') || PROTOCOL_VERSION) : PROTOCOL_VERSION;

      // 1. Analyze Sections
      const sections = this.analyzeSections(doc, warnings, errors);

      // 2. Analyze Content Fields & Multi-targets
      const fields = this.analyzeFields(doc, null, warnings, errors);

      // 3. Analyze Media Elements & Slots
      const mediaSlots = this._analyzeHtmlMedia(doc, warnings, errors);

      // 4. Discover Themes & Visual metadata declared in HTML attributes
      const visual = this._analyzeVisualMetadata(doc, null, warnings, errors);
      const themes = visual.themes.supported;

      // 5. Discover Animation & Particle presets declared in HTML
      const animations = this.analyzeAnimations(doc, null, warnings, errors);

      const hasImages = mediaSlots.some(m => m.type === 'image' || m.type === 'image-multiple') || fields.some(f => f.type === 'image' || f.type === 'image-multiple');
      const hasMultipleImages = mediaSlots.some(m => m.type === 'image-multiple') || fields.some(f => f.type === 'image-multiple');
      const hasVideo = mediaSlots.some(m => m.type === 'video' || m.type === 'video-multiple') || fields.some(f => f.type === 'video' || f.type === 'video-multiple');
      const hasAudio = mediaSlots.some(m => m.type === 'audio') || fields.some(f => f.type === 'audio');
      const hasVoice = mediaSlots.some(m => m.type === 'voice') || fields.some(f => f.type === 'voice') || sections.some(s => s.key === 'voice');

      return {
        protocolVersion,
        fields,
        sections,
        media: {
          images: hasImages,
          multipleImages: hasMultipleImages,
          video: hasVideo,
          audio: hasAudio,
          voice: hasVoice,
          slots: mediaSlots
        },
        visual,
        themes,
        animations,
        capabilities: {
          photos: hasImages,
          multiplePhotos: hasMultipleImages,
          videos: hasVideo,
          music: hasAudio,
          voice: hasVoice,
          sections: sections.length > 0,
          gallery: sections.some(s => s.key === 'gallery') || hasMultipleImages,
          countdown: sections.some(s => s.key === 'countdown'),
          timeline: sections.some(s => s.key === 'timeline'),
          secretMessage: sections.some(s => s.key === 'secret_message' || s.key === 'open_when'),
          finalSurprise: sections.some(s => s.key === 'final_surprise')
        }
      };
    },

    /**
     * Analyze Sections from DOM
     */
    analyzeSections(doc, warnings = [], errors = []) {
      if (!doc || !doc.querySelectorAll) return [];
      const sectionElements = Array.from(doc.querySelectorAll('[data-wm-section]'));
      const sectionsMap = new Map();
      const seenSectionKeys = new Map();

      sectionElements.forEach((el, index) => {
        const rawKey = (el.getAttribute('data-wm-section') || '').trim();
        if (!rawKey) return;

        const instance = el.getAttribute('data-wm-section-instance') || null;
        const mapKey = instance ? `${rawKey}:${instance}` : rawKey;

        if (seenSectionKeys.has(rawKey)) {
          const count = seenSectionKeys.get(rawKey);
          seenSectionKeys.set(rawKey, count + 1);
          if (!instance) {
            warnings.push({
              code: 'DUPLICATE_SECTION_ID',
              section: rawKey,
              message: `Duplicate section ID: ${rawKey}`
            });
          }
        } else {
          seenSectionKeys.set(rawKey, 1);
        }

        // Check for nested section ambiguity
        let parentNode = el.parentNode;
        let isNested = false;
        while (parentNode) {
          if (parentNode.getAttribute && parentNode.getAttribute('data-wm-section')) {
            isNested = true;
            break;
          }
          parentNode = parentNode.parentNode;
        }
        if (isNested) {
          warnings.push({
            code: 'NESTED_SECTION_AMBIGUITY',
            section: rawKey,
            message: `Section "${rawKey}" is nested inside another section.`
          });
        }

        const isRequired = parseBoolean(el.getAttribute('data-wm-required'), false);
        const rawToggleable = el.getAttribute('data-wm-toggleable');
        let toggleable = isRequired ? false : parseBoolean(rawToggleable, false);

        if (isRequired && rawToggleable !== null && parseBoolean(rawToggleable, false)) {
          warnings.push({
            code: 'REQUIRED_TOGGLEABLE_CONFLICT',
            section: rawKey,
            message: `Section "${rawKey}" is marked required="true" but toggleable="true". Required sections cannot be disabled.`
          });
          toggleable = false;
        }

        const rawLabel = el.getAttribute('data-wm-label');
        if (!rawLabel) {
          warnings.push({
            code: 'SECTION_LABEL_MISSING',
            section: rawKey,
            message: `Section "${rawKey}" is missing data-wm-label attribute.`
          });
        }
        const label = rawLabel || rawKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const description = el.getAttribute('data-wm-description') || '';

        const rawOrder = el.getAttribute('data-wm-order');
        let order = index + 1;
        if (rawOrder !== null && rawOrder !== '') {
          const p = parseInt(rawOrder, 10);
          if (!isNaN(p)) order = p;
        }

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
                section: rawKey,
                value: rawDefaultLayout,
                message: `Default layout '${rawDefaultLayout}' is not declared.`
              });
              defaultLayout = layouts[0];
            }
          } else {
            defaultLayout = layouts[0];
          }
        }
        const animation = el.getAttribute('data-wm-animation') || null;
        const visibleIf = el.getAttribute('data-wm-visible-if') || null;
        const defaultEnabled = isRequired ? true : parseBoolean(el.getAttribute('data-wm-default-enabled'), true);

        sectionsMap.set(mapKey, {
          id: rawKey,
          key: rawKey,
          instance,
          label,
          description,
          required: isRequired,
          toggleable,
          defaultEnabled,
          order,
          layouts,
          defaultLayout,
          animation,
          visibleIf,
          isStandard: KNOWN_SECTIONS.has(rawKey)
        });
      });

      return Array.from(sectionsMap.values()).sort((a, b) => (a.order || 0) - (b.order || 0));
    },

    /**
     * Analyze Content Fields & Multi-targets
     */
    analyzeFields(doc, jsonFields = null, warnings = [], errors = []) {
      const fieldsMap = new Map();

      if (doc && doc.querySelectorAll) {
        const fieldElements = Array.from(doc.querySelectorAll('[data-wm-field], [data-wm]'));

        fieldElements.forEach((el) => {
          const isExplicitField = el.hasAttribute('data-wm-field');
          const fieldKey = (el.getAttribute('data-wm-field') || el.getAttribute('data-wm') || '').trim();
          if (!fieldKey) return;

          const isLegacy = !isExplicitField && el.hasAttribute('data-wm');
          const rawType = (el.getAttribute('data-wm-type') || '').trim().toLowerCase();
          const tagName = el.tagName ? el.tagName.toLowerCase() : '';
          const inputType = el.getAttribute('type') ? el.getAttribute('type').toLowerCase() : null;

          let inferredType = 'text';
          if (rawType) {
            if (STANDARD_FIELD_TYPES.has(rawType)) {
              inferredType = rawType;
            } else {
              errors.push({
                code: 'INVALID_FIELD_TYPE',
                field: fieldKey,
                type: rawType,
                message: `Invalid field type "${rawType}" on field "${fieldKey}".`
              });
              inferredType = 'text';
            }
          } else {
            if (tagName === 'textarea') {
              inferredType = 'textarea';
            } else if (tagName === 'img') {
              inferredType = 'image';
            } else if (tagName === 'video') {
              inferredType = 'video';
            } else if (tagName === 'audio') {
              inferredType = 'audio';
            } else if (tagName === 'input') {
              if (inputType === 'date') inferredType = 'date';
              else if (inputType === 'time') inferredType = 'time';
              else if (inputType === 'datetime-local') inferredType = 'datetime';
              else if (inputType === 'number') inferredType = 'number';
              else if (inputType === 'email') inferredType = 'email';
              else if (inputType === 'tel') inferredType = 'phone';
              else if (inputType === 'url') inferredType = 'url';
              else if (inputType === 'color') inferredType = 'color';
              else if (inputType === 'checkbox') inferredType = 'toggle';
              else if (inputType === 'range') inferredType = 'range';
            }
          }

          const rawLabel = el.getAttribute('data-wm-label');
          if (!rawLabel && isExplicitField) {
            warnings.push({
              code: 'FIELD_LABEL_MISSING',
              field: fieldKey,
              message: `Field "${fieldKey}" is missing data-wm-label attribute.`
            });
          }
          const label = rawLabel || fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

          const isRequired = parseBoolean(el.getAttribute('data-wm-required'), false);
          const defaultValue = el.getAttribute('data-wm-default') || null;
          const placeholder = el.getAttribute('data-wm-placeholder') || '';
          const description = el.getAttribute('data-wm-description') || '';

          const rawMinlength = el.getAttribute('data-wm-minlength');
          const minlength = rawMinlength !== null && rawMinlength !== '' && !isNaN(parseInt(rawMinlength, 10)) ? parseInt(rawMinlength, 10) : null;
          const rawMaxlength = el.getAttribute('data-wm-maxlength') || el.getAttribute('maxlength');
          const maxlength = rawMaxlength !== null && rawMaxlength !== '' && !isNaN(parseInt(rawMaxlength, 10)) ? parseInt(rawMaxlength, 10) : null;

          const rawMin = el.getAttribute('data-wm-min') || el.getAttribute('min');
          const min = rawMin !== null && rawMin !== '' && !isNaN(Number(rawMin)) ? Number(rawMin) : null;
          const rawMax = el.getAttribute('data-wm-max') || el.getAttribute('max');
          const max = rawMax !== null && rawMax !== '' && !isNaN(Number(rawMax)) ? Number(rawMax) : null;
          const rawStep = el.getAttribute('data-wm-step') || el.getAttribute('step');
          const step = rawStep !== null && rawStep !== '' && !isNaN(Number(rawStep)) ? Number(rawStep) : null;

          const pattern = el.getAttribute('data-wm-pattern') || null;
          const format = el.getAttribute('data-wm-format') || null;
          const target = el.getAttribute('data-wm-target') || (tagName === 'img' ? 'src' : 'text');
          const visibleIf = el.getAttribute('data-wm-visible-if') || null;
          const disabledIf = el.getAttribute('data-wm-disabled-if') || null;
          const requiredIf = el.getAttribute('data-wm-required-if') || null;
          const group = el.getAttribute('data-wm-group') || 'personal';

          const optionsAttr = el.getAttribute('data-wm-options');
          const options = parseOptions(optionsAttr, warnings, fieldKey);

          const mappingDesc = `${tagName}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).split(' ')[0] : ''} -> ${target}`;

          if (fieldsMap.has(fieldKey)) {
            const existing = fieldsMap.get(fieldKey);
            existing.targets += 1;
            existing.mappings.push(mappingDesc);

            if (existing.type !== inferredType && rawType) {
              errors.push({
                code: 'FIELD_METADATA_CONFLICT',
                field: fieldKey,
                message: `Conflicting types for same field: "${existing.type}" vs "${inferredType}".`
              });
            }
            if (maxlength !== null && existing.maxlength !== null && existing.maxlength !== maxlength) {
              warnings.push({
                code: 'FIELD_BOUND_CONFLICT',
                field: fieldKey,
                property: 'maxlength',
                message: `Field metadata conflict: ${fieldKey}.maxlength (${existing.maxlength} vs ${maxlength})`
              });
            }
          } else {
            fieldsMap.set(fieldKey, {
              key: fieldKey,
              label,
              type: inferredType,
              required: isRequired,
              defaultValue,
              placeholder,
              description,
              minlength,
              maxlength,
              min,
              max,
              step,
              pattern,
              format,
              target,
              visibleIf,
              disabledIf,
              requiredIf,
              group,
              options,
              targets: 1,
              mappings: [mappingDesc],
              legacy: isLegacy,
              isStandard: STANDARD_FIELD_TYPES.has(inferredType)
            });
          }
        });
      }

      if (Array.isArray(jsonFields)) {
        jsonFields.forEach(jf => {
          const key = jf.id || jf.key || jf.name;
          if (!key) return;

          if (fieldsMap.has(key)) {
            const existing = fieldsMap.get(key);
            if (jf.type && existing.type && jf.type !== existing.type) {
              warnings.push({
                code: 'FIELD_TYPE_CONFLICT',
                field: key,
                message: `Field metadata conflict: ${key}.type HTML="${existing.type}" JSON="${jf.type}"`
              });
            }
            if (jf.maxlength !== undefined && existing.maxlength !== null && jf.maxlength !== existing.maxlength) {
              warnings.push({
                code: 'FIELD_BOUND_CONFLICT',
                field: key,
                message: `Field metadata conflict: ${key}.maxlength HTML=${existing.maxlength} JSON=${jf.maxlength}`
              });
            }
            Object.assign(existing, {
              label: jf.label || existing.label,
              type: jf.type || existing.type,
              required: jf.required !== undefined ? jf.required : existing.required,
              defaultValue: jf.defaultValue !== undefined ? jf.defaultValue : existing.defaultValue,
              placeholder: jf.placeholder || existing.placeholder,
              description: jf.description || existing.description,
              options: jf.options || existing.options,
              minlength: jf.minlength !== undefined ? jf.minlength : existing.minlength,
              maxlength: jf.maxlength !== undefined ? jf.maxlength : existing.maxlength,
              min: jf.min !== undefined ? jf.min : existing.min,
              max: jf.max !== undefined ? jf.max : existing.max,
              visibleIf: jf.visibleIf || existing.visibleIf
            });
          } else {
            fieldsMap.set(key, {
              key,
              label: jf.label || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              type: jf.type || 'text',
              required: Boolean(jf.required),
              defaultValue: jf.defaultValue || null,
              placeholder: jf.placeholder || '',
              description: jf.description || '',
              options: jf.options || null,
              minlength: jf.minlength || null,
              maxlength: jf.maxlength || null,
              min: jf.min || null,
              max: jf.max || null,
              visibleIf: jf.visibleIf || null,
              targets: 0,
              mappings: ['(Declared in wishmagic.json)'],
              legacy: false,
              isStandard: STANDARD_FIELD_TYPES.has(jf.type || 'text')
            });
          }
        });
      }

      return Array.from(fieldsMap.values());
    },

    _analyzeHtmlMedia(doc, warnings = [], errors = []) {
      const mediaList = [];
      const seenMediaKeys = new Set();

      if (!doc || !doc.querySelectorAll) return mediaList;

      const mediaElements = Array.from(doc.querySelectorAll('[data-wm-media], img[data-wm-field], video[data-wm-field], audio[data-wm-field]'));

      mediaElements.forEach(el => {
        const key = el.getAttribute('data-wm-media') || el.getAttribute('data-wm-field');
        if (!key) return;
        if (seenMediaKeys.has(key)) {
          warnings.push({
            code: 'DUPLICATE_MEDIA_ID',
            mediaId: key,
            message: `Duplicate media slot ID detected: "${key}".`
          });
          return;
        }
        seenMediaKeys.add(key);

        const rawType = (el.getAttribute('data-wm-type') || el.tagName.toLowerCase()).toLowerCase();
        const normalizedType = (rawType === 'img' || rawType === 'image-multiple') ? 'image' : (rawType === 'video-multiple' ? 'video' : rawType);
        const label = el.getAttribute('data-wm-label') || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const role = el.getAttribute('data-wm-role') || (key.includes('cover') ? 'cover' : (key.includes('gallery') ? 'gallery' : 'general'));
        const isMultiple = rawType === 'image-multiple' || rawType === 'video-multiple' || parseBoolean(el.getAttribute('data-wm-multiple'), false) || role === 'gallery';
        
        const rawMaxSize = el.getAttribute('data-wm-max-size') || el.getAttribute('data-wm-max-size-bytes');
        const maxSizeBytes = rawMaxSize ? parseInt(rawMaxSize, 10) : null;
        
        const rawMinItems = el.getAttribute('data-wm-min-items') || el.getAttribute('data-wm-min');
        const minItems = rawMinItems ? parseInt(rawMinItems, 10) : (isMultiple ? 1 : 1);
        
        const rawMaxItems = el.getAttribute('data-wm-max-items') || el.getAttribute('data-wm-max');
        const maxItems = rawMaxItems ? parseInt(rawMaxItems, 10) : (isMultiple ? 10 : 1);
        
        const rawMaxDuration = el.getAttribute('data-wm-max-duration');
        const maxDuration = rawMaxDuration ? parseInt(rawMaxDuration, 10) : null;
        
        const rawMinDuration = el.getAttribute('data-wm-min-duration');
        const minDuration = rawMinDuration ? parseInt(rawMinDuration, 10) : null;

        const acceptAttr = el.getAttribute('data-wm-accept');
        const accept = acceptAttr ? acceptAttr.split(',').map(s => s.trim()) : null;

        const loop = parseBoolean(el.getAttribute('loop') || el.getAttribute('data-wm-loop'), false);
        const autoplay = parseBoolean(el.getAttribute('autoplay') || el.getAttribute('data-wm-autoplay'), false);
        const controls = parseBoolean(el.getAttribute('controls') || el.getAttribute('data-wm-controls'), true);
        const poster = el.getAttribute('poster') || null;
        const musicToggle = parseBoolean(el.getAttribute('data-wm-music-toggle'), false);

        mediaList.push({
          id: key,
          key,
          type: normalizedType,
          rawType,
          label,
          role,
          required: parseBoolean(el.getAttribute('data-wm-required'), false),
          multiple: isMultiple,
          accept,
          maxSizeBytes,
          minItems,
          maxItems,
          maxDuration,
          minDuration,
          musicToggle,
          loop,
          autoplay,
          controls,
          poster
        });
      });

      return mediaList;
    },

    _analyzeVisualMetadata(doc, css, warnings = [], errors = []) {
      const visual = {
        themes: { supported: [], default: null },
        colors: { supported: [], defaults: {} },
        backgrounds: { supported: [], default: null },
        surfaces: { supported: [], default: null },
        buttons: { supported: [], default: null },
        typography: { supported: [], fonts: [], weights: [] },
        radius: { supported: [], default: null },
        intensity: { supported: [], default: null },
        customControls: []
      };

      if (!doc) return visual;

      const rootEl = doc.documentElement || doc;
      const bodyEl = doc.body || (doc.querySelector ? doc.querySelector('body') : null);

      // 1. Themes
      const themeRes = this.analyzeThemes(doc, css, warnings, errors);
      visual.themes.supported = themeRes.supported;
      visual.themes.default = themeRes.default;

      // 2. Colors
      const rawColors = (bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute('data-wm-colors') : null) ||
        (rootEl.getAttribute ? rootEl.getAttribute('data-wm-colors') : null);
      if (rawColors) {
        visual.colors.supported = parseList(rawColors);
      } else if (css && css.customProperties && css.customProperties.length > 0) {
        visual.colors.supported = css.customProperties.map(c => c.replace('--wm-', ''));
      } else {
        visual.colors.supported = ['primary', 'secondary', 'accent'];
      }

      const colorDefaults = {};
      visual.colors.supported.forEach(col => {
        const attrVal = (bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute(`data-wm-default-${col}`) : null) ||
          (rootEl.getAttribute ? rootEl.getAttribute(`data-wm-default-${col}`) : null);
        if (attrVal) colorDefaults[col] = attrVal;
      });
      visual.colors.defaults = colorDefaults;

      // 3. Backgrounds
      const rawBgs = (bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute('data-wm-backgrounds') : null) ||
        (rootEl.getAttribute ? rootEl.getAttribute('data-wm-backgrounds') : null);
      if (rawBgs) {
        visual.backgrounds.supported = parseList(rawBgs);
        visual.backgrounds.default = (bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute('data-wm-default-background') : null) ||
          (rootEl.getAttribute ? rootEl.getAttribute('data-wm-default-background') : null) || visual.backgrounds.supported[0];
      }

      // 4. Surfaces
      const rawSurfaces = (bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute('data-wm-surfaces') : null) ||
        (rootEl.getAttribute ? rootEl.getAttribute('data-wm-surfaces') : null);
      if (rawSurfaces) {
        visual.surfaces.supported = parseList(rawSurfaces);
        visual.surfaces.default = visual.surfaces.supported[0];
      }

      // 5. Buttons
      const rawBtns = (bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute('data-wm-button-styles') : null) ||
        (rootEl.getAttribute ? rootEl.getAttribute('data-wm-button-styles') : null);
      if (rawBtns) {
        visual.buttons.supported = parseList(rawBtns);
        visual.buttons.default = visual.buttons.supported[0];
      }

      // 6. Typography
      const rawTypo = (bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute('data-wm-typography') : null) ||
        (rootEl.getAttribute ? rootEl.getAttribute('data-wm-typography') : null);
      const rawFonts = (bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute('data-wm-fonts') : null) ||
        (rootEl.getAttribute ? rootEl.getAttribute('data-wm-fonts') : null);
      const rawWeights = (bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute('data-wm-font-weights') : null) ||
        (rootEl.getAttribute ? rootEl.getAttribute('data-wm-font-weights') : null);

      if (rawTypo || rawFonts) {
        visual.typography.supported = parseList(rawTypo);
        visual.typography.fonts = parseList(rawFonts);
        visual.typography.weights = parseList(rawWeights);
      }

      // 7. Radius & Intensity
      const rawRadius = (bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute('data-wm-radius') : null) ||
        (rootEl.getAttribute ? rootEl.getAttribute('data-wm-radius') : null);
      if (rawRadius) {
        visual.radius.supported = parseList(rawRadius);
        visual.radius.default = visual.radius.supported[0];
      }

      const rawIntensity = (bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute('data-wm-intensity') : null) ||
        (rootEl.getAttribute ? rootEl.getAttribute('data-wm-intensity') : null);
      if (rawIntensity) {
        visual.intensity.supported = parseList(rawIntensity);
        visual.intensity.default = (bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute('data-wm-default-intensity') : null) ||
          (rootEl.getAttribute ? rootEl.getAttribute('data-wm-default-intensity') : null) || visual.intensity.supported[0];
      }

      // 8. Custom Controls (data-wm-visual-control)
      if (doc.querySelectorAll) {
        const customNodes = Array.from(doc.querySelectorAll('[data-wm-visual-control]'));
        customNodes.forEach(cNode => {
          const id = cNode.getAttribute('data-wm-visual-control');
          const type = cNode.getAttribute('data-wm-type') || 'range';
          const min = cNode.getAttribute('data-wm-min') ? Number(cNode.getAttribute('data-wm-min')) : 0;
          const max = cNode.getAttribute('data-wm-max') ? Number(cNode.getAttribute('data-wm-max')) : 100;
          const def = cNode.getAttribute('data-wm-default') ? Number(cNode.getAttribute('data-wm-default')) : min;
          const variable = cNode.getAttribute('data-wm-variable') || null;

          visual.customControls.push({ id, type, min, max, default: def, variable });
        });
      }

      return visual;
    },

    analyzeThemes(doc, css, warnings = [], errors = []) {
      const themeSet = new Set();
      let defaultTheme = null;

      if (doc) {
        const rootEl = doc.documentElement || doc;
        const bodyEl = doc.body || (doc.querySelector ? doc.querySelector('body') : null);
        const rootThemes = rootEl.getAttribute ? rootEl.getAttribute('data-wm-themes') : null;
        const bodyThemes = bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute('data-wm-themes') : null;

        if (rootThemes && bodyThemes && rootThemes !== bodyThemes) {
          warnings.push({
            code: 'THEME_METADATA_CONFLICT',
            message: 'Theme metadata conflict between html and body.'
          });
        }

        const rawThemes = bodyThemes || rootThemes;
        if (rawThemes) {
          parseList(rawThemes).forEach(t => themeSet.add(t));
        }

        const rawDefault = (bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute('data-wm-default-theme') : null) ||
          (rootEl.getAttribute ? rootEl.getAttribute('data-wm-default-theme') : null);

        if (rawDefault) {
          if (themeSet.has(rawDefault)) {
            defaultTheme = rawDefault;
          } else {
            warnings.push({
              code: 'INVALID_DEFAULT_THEME',
              value: rawDefault,
              message: `Default theme "${rawDefault}" is not in supported themes.`
            });
            defaultTheme = Array.from(themeSet)[0] || 'magical';
          }
        } else if (themeSet.size > 0) {
          defaultTheme = Array.from(themeSet)[0];
        }
      }

      if (css && typeof css === 'string') {
        const themeMatches = css.match(/\.theme-([a-zA-Z0-9_\-]+)/g) || [];
        themeMatches.forEach(m => {
          const themeId = m.replace('.theme-', '');
          themeSet.add(themeId);
        });
      }

      const supported = Array.from(themeSet);
      if (!defaultTheme && supported.length > 0) defaultTheme = supported[0];

      return {
        supported,
        default: defaultTheme || 'magical'
      };
    },

    analyzeAnimations(doc, css, warnings = [], errors = []) {
      const pageAnims = new Set();
      const sectionAnims = new Set();
      const particles = new Set();
      const intensity = new Set();

      if (doc) {
        const rootEl = doc.documentElement || doc;
        const bodyEl = doc.body || (doc.querySelector ? doc.querySelector('body') : null);

        const rawAnims = (rootEl.getAttribute ? rootEl.getAttribute('data-wm-animations') : null) ||
          (bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute('data-wm-animations') : null);
        if (rawAnims) parseList(rawAnims).forEach(a => pageAnims.add(a));

        const rawParticles = (rootEl.getAttribute ? rootEl.getAttribute('data-wm-particles') : null) ||
          (bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute('data-wm-particles') : null);
        if (rawParticles) parseList(rawParticles).forEach(p => particles.add(p));

        const rawIntensity = (rootEl.getAttribute ? rootEl.getAttribute('data-wm-particle-intensity') : null) ||
          (bodyEl && bodyEl.getAttribute ? bodyEl.getAttribute('data-wm-particle-intensity') : null);
        if (rawIntensity) parseList(rawIntensity).forEach(i => intensity.add(i));

        if (doc.querySelectorAll) {
          Array.from(doc.querySelectorAll('[data-wm-animation]')).forEach(el => {
            const a = el.getAttribute('data-wm-animation');
            if (a) parseList(a).forEach(it => sectionAnims.add(it));
          });
        }
      }

      return {
        page: Array.from(pageAnims),
        sections: Array.from(sectionAnims),
        reveals: Array.from(new Set([...pageAnims, ...sectionAnims])),
        particles: Array.from(particles),
        intensity: Array.from(intensity)
      };
    },

    analyzeCSS(css, context = {}) {
      if (!css || typeof css !== 'string') {
        return { customProperties: [], themes: [], keyframes: [] };
      }

      const customProperties = [];
      const keyframes = [];

      const varMatches = css.match(/--wm-([a-zA-Z0-9_\-]+)\s*:/g) || [];
      const seenVars = new Set();
      varMatches.forEach(v => {
        const cleanName = v.replace(':', '').trim();
        if (!seenVars.has(cleanName)) {
          seenVars.add(cleanName);
          customProperties.push(cleanName);
        }
      });

      const kfMatches = css.match(/@keyframes\s+([a-zA-Z0-9_\-]+)/g) || [];
      kfMatches.forEach(k => {
        const name = k.replace(/@keyframes\s+/, '').trim();
        keyframes.push(name);
      });

      return {
        customProperties,
        keyframes,
        hasThemeVariables: seenVars.has('--wm-primary') || seenVars.has('--wm-accent')
      };
    },

    analyzeJS(js, context = {}) {
      if (!js || typeof js !== 'string') {
        return { declaredCapabilities: {}, runtimeHooks: [] };
      }

      const declaredCapabilities = {};
      const runtimeHooks = [];

      try {
        if (js.includes('WishMagicTemplate') || js.includes('WishMagicRuntime')) {
          runtimeHooks.push('WishMagicRuntime');

          ['countdown', 'gallery', 'video', 'audio', 'voice', 'timeline', 'particles', 'themes'].forEach(cap => {
            const re = new RegExp(`${cap}\\s*:\\s*(true|false)`, 'i');
            const match = js.match(re);
            if (match) {
              declaredCapabilities[cap] = match[1].toLowerCase() === 'true';
            }
          });
        }
      } catch (e) {
        // Safe static inspection fallback
      }

      return {
        declaredCapabilities,
        runtimeHooks
      };
    },

    analyzeMedia(files, context = {}) {
      const warnings = context.warnings || [];
      const errors = context.errors || [];
      const htmlContent = context.htmlContent || '';
      const cssContent = context.cssContent || '';

      const inventory = {
        images: [],
        videos: [],
        audio: [],
        fonts: [],
        other: []
      };

      const fileMap = new Map();

      (files || []).forEach(f => {
        const rawPath = typeof f === 'string' ? f : (f.path || f.name || '');
        const cleanPath = sanitizePath(rawPath);
        if (!cleanPath) return;

        const ext = cleanPath.split('.').pop().toLowerCase();
        const size = f.size || 0;
        const entry = { path: cleanPath, extension: ext, size, isBase64: Boolean(f.isBase64) };

        fileMap.set(cleanPath, entry);

        if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'avif'].includes(ext)) {
          inventory.images.push(entry);
        } else if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) {
          inventory.videos.push(entry);
        } else if (['mp3', 'wav', 'aac', 'm4a', 'flac'].includes(ext)) {
          inventory.audio.push(entry);
        } else if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) {
          inventory.fonts.push(entry);
        } else {
          inventory.other.push(entry);
        }
      });

      const referencedPaths = new Set();

      if (htmlContent) {
        const srcMatches = htmlContent.match(/<(?:img|audio|video|source|link|script)\b[^>]*?\b(?:src|href|poster)=["']([^"']+)["']/gi) || [];
        srcMatches.forEach(m => {
          const attrMatch = m.match(/\b(?:src|href|poster)=["']([^"']+)["']/i);
          const val = attrMatch ? attrMatch[1].trim() : '';
          if (val && !val.startsWith('http://') && !val.startsWith('https://') && !val.startsWith('data:') && !val.startsWith('#') && !val.includes('wishmagic-template-protocol.js')) {
            referencedPaths.add(sanitizePath(val));
          }
        });
      }
      if (context.metadata && context.metadata.raw) {
        const rawM = context.metadata.raw;
        const thumbP = (rawM.template && (rawM.template.thumbnail || rawM.template.coverImage)) || rawM.thumbnail || rawM.coverImage || (rawM.metadata && (rawM.metadata.coverImage || rawM.metadata.thumbnail));
        if (thumbP && typeof thumbP === 'string') referencedPaths.add(sanitizePath(thumbP));
      }

      if (cssContent) {
        const urlMatches = cssContent.match(/url\(["']?([^"')]+)["']?\)/gi) || [];
        urlMatches.forEach(m => {
          const val = m.replace(/^url\(["']?|["']?\)$/gi, '').trim();
          if (val && !val.startsWith('http://') && !val.startsWith('https://') && !val.startsWith('data:')) {
            referencedPaths.add(sanitizePath(val));
          }
        });
      }

      referencedPaths.forEach(ref => {
        if (ref && !fileMap.has(ref) && !fileMap.has(ref.replace(/^\.\//, '')) && fileMap.size > 0) {
          const ext = ref.split('.').pop().toLowerCase();
          const isEssential = ['mp3', 'mp4', 'png', 'jpg'].includes(ext);
          if (isEssential) {
            errors.push({
              code: 'MISSING_MEDIA_ASSET',
              path: ref,
              message: `Missing media asset referenced in template: "${ref}"`
            });
          } else {
            warnings.push({
              code: 'MISSING_MEDIA_ASSET',
              path: ref,
              message: `Referenced asset not found in package: "${ref}"`
            });
          }
        }
      });

      fileMap.forEach((entry, pathKey) => {
        const isDevOrCover = /^(?:engine|tests?|__tests__|spec|node_modules)\//i.test(pathKey) || /(?:^|\/)readme\.(?:txt|md)$/i.test(pathKey) || /^preview\.html$/i.test(pathKey) || /(?:^|\/)cover\.(?:jpe?g|png|webp)$/i.test(pathKey);
        if (!isDevOrCover && !referencedPaths.has(pathKey) && !referencedPaths.has(`./${pathKey}`) && !pathKey.endsWith('index.html') && !pathKey.endsWith('wishmagic.json')) {
          warnings.push({
            code: 'UNUSED_MEDIA_ASSET',
            path: pathKey,
            message: `Asset "${pathKey}" is present in package but not referenced in template code.`
          });
        }
      });

      return inventory;
    },

    generateSchema(params) {
      const metadata = params.metadata || {};
      const html = params.html || {};
      const css = params.css || {};
      const js = params.js || {};
      const mediaInventory = params.mediaInventory || { images: [], videos: [], audio: [], fonts: [], other: [] };
      const warnings = params.warnings || [];
      const errors = params.errors || [];

      const template = {
        id: (metadata.template && metadata.template.id) || 'custom-wish-template',
        name: (metadata.template && metadata.template.name) || 'Celebration Wish Template',
        version: (metadata.template && metadata.template.version) || '1.0.0',
        category: (metadata.template && metadata.template.category) || 'birthday',
        tier: (metadata.template && metadata.template.tier) || 'free',
        price: (metadata.template && metadata.template.price) || 0,
        description: (metadata.template && metadata.template.description) || '',
        author: (metadata.template && metadata.template.author) || 'WishMagic'
      };

      // Merge HTML fields and Metadata fields (Manifest has priority)
      const rawMetaFields = Array.isArray(metadata.fields) && metadata.fields.length > 0
        ? metadata.fields
        : (metadata.capabilities && Array.isArray(metadata.capabilities.fields) ? metadata.capabilities.fields : []);

      const fieldsMap = new Map();

      // Seed with HTML fields
      (html.fields || []).forEach(f => {
        const id = f.id || f.key;
        if (id) fieldsMap.set(id, { ...f, id, key: id });
      });

      // Override or augment with metadata fields (Manifest has priority)
      rawMetaFields.forEach(mf => {
        if (typeof mf === 'string') {
          if (!fieldsMap.has(mf)) {
            fieldsMap.set(mf, {
              id: mf,
              key: mf,
              label: mf.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              type: 'text',
              required: false
            });
          }
        } else if (mf && typeof mf === 'object') {
          const id = mf.id || mf.key || mf.name;
          if (id) {
            const existing = fieldsMap.get(id) || {};
            fieldsMap.set(id, {
              ...existing,
              ...mf,
              id,
              key: id,
              label: mf.label || existing.label || id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              type: mf.type || existing.type || 'text',
              required: mf.required !== undefined ? mf.required : (existing.required || false)
            });
          }
        }
      });

      const fields = Array.from(fieldsMap.values());

      // Merge HTML sections and Metadata sections
      const rawMetaSections = Array.isArray(metadata.sections) && metadata.sections.length > 0
        ? metadata.sections
        : (metadata.capabilities && Array.isArray(metadata.capabilities.sections) ? metadata.capabilities.sections : []);

      const sectionsMap = new Map();
      (html.sections || []).forEach(s => {
        const id = s.id || s.key;
        const mapKey = s.instance ? `${id}:${s.instance}` : id;
        if (mapKey) sectionsMap.set(mapKey, { ...s, id, key: id });
      });

      rawMetaSections.forEach(ms => {
        if (typeof ms === 'string') {
          if (!sectionsMap.has(ms)) {
            sectionsMap.set(ms, { id: ms, key: ms, name: ms, required: false });
          }
        } else if (ms && typeof ms === 'object') {
          const id = ms.id || ms.key;
          if (id) {
            const mapKey = ms.instance ? `${id}:${ms.instance}` : id;
            const existing = sectionsMap.get(mapKey) || {};
            sectionsMap.set(mapKey, {
              ...existing,
              ...ms,
              id,
              key: id,
              name: ms.name || ms.label || existing.name || existing.label || id,
              required: ms.required !== undefined ? ms.required : (existing.required || false)
            });
          }
        }
      });

      const sections = Array.from(sectionsMap.values());
      const htmlThemesList = Array.isArray(html.themes) ? html.themes : ((html.themes && html.themes.supported) || []);
      const metaThemesList = Array.isArray(metadata.themes) && metadata.themes.length > 0
        ? metadata.themes
        : (metadata.capabilities && Array.isArray(metadata.capabilities.themes) ? metadata.capabilities.themes : []);
      const themes = Array.from(new Set([...htmlThemesList, ...metaThemesList]));
      const mediaSlots = (html.media && html.media.slots) || [];

      const hasImages = html.media?.images || js.declaredCapabilities?.gallery || fields.some(f => f.type === 'image' || f.type === 'image-multiple');
      const hasMultipleImages = html.media?.multipleImages || fields.some(f => f.type === 'image-multiple');
      const hasVideo = html.media?.video || js.declaredCapabilities?.video || fields.some(f => f.type === 'video' || f.type === 'video-multiple');
      const hasAudio = html.media?.audio || js.declaredCapabilities?.audio || fields.some(f => f.type === 'audio');
      const hasVoice = html.media?.voice || js.declaredCapabilities?.voice || fields.some(f => f.type === 'voice') || sections.some(s => s.key === 'voice');

      const capabilities = {
        photos: hasImages,
        multiplePhotos: hasMultipleImages,
        videos: hasVideo,
        music: hasAudio,
        voice: hasVoice,
        countdown: Boolean(html.capabilities?.countdown || js.declaredCapabilities?.countdown || metadata.capabilities?.countdown),
        gallery: Boolean(html.capabilities?.gallery || js.declaredCapabilities?.gallery || metadata.capabilities?.gallery),
        video: hasVideo,
        audio: hasAudio,
        timeline: Boolean(html.capabilities?.timeline || js.declaredCapabilities?.timeline || metadata.capabilities?.timeline),
        themes: themes.length > 0 || css.hasThemeVariables,
        particles: Boolean(html.animations?.particles?.length > 0 || metadata.particles),
        sections: sections.length > 0
      };

      const metaMedia = (metadata.capabilities && metadata.capabilities.media) || metadata.media || {};
      const media = {
        images: metaMedia.images !== undefined ? metaMedia.images : hasImages,
        multipleImages: metaMedia.multipleImages !== undefined ? metaMedia.multipleImages : hasMultipleImages,
        video: metaMedia.video !== undefined ? metaMedia.video : hasVideo,
        audio: metaMedia.audio !== undefined ? metaMedia.audio : hasAudio,
        voice: metaMedia.voice !== undefined ? metaMedia.voice : hasVoice,
        slots: mediaSlots,
        ...metaMedia
      };

      const colors = {
        supported: css.customProperties || ['--wm-primary', '--wm-secondary', '--wm-accent'],
        default: '#ff4d6d'
      };

      const backgrounds = ['solid', 'gradient', 'radial-glow'];
      const surfaces = ['glass-frosted', 'clean-minimal'];
      const buttons = ['gradient-pill', 'outline-glow'];

      const animations = {
        page: html.animations?.page || [],
        sections: html.animations?.sections || [],
        supported: html.animations?.reveals?.length > 0 ? html.animations.reveals : ['fade-up', 'soft-scale', 'blur-reveal'],
        default: 'fade-up'
      };

      const particles = {
        styles: html.animations?.particles?.length > 0 ? html.animations.particles : ['sparkles', 'hearts'],
        intensity: html.animations?.intensity?.length > 0 ? html.animations.intensity : ['minimal', 'soft', 'expressive'],
        density: ['minimal', 'soft', 'expressive'],
        default: 'soft'
      };

      let score = 100;
      if (errors.length > 0) score -= (errors.length * 25);
      if (warnings.length > 0) score -= (warnings.length * 3);
      if (score < 0) score = 0;

      const deterministicPayload = JSON.stringify({
        templateId: template.id,
        version: template.version,
        fields: fields.map(f => ({ key: f.key, type: f.type, required: f.required })),
        sections: sections.map(s => ({ key: s.key, required: s.required })),
        capabilities
      });
      const capabilitySchemaHash = computeDJB2Hash(deterministicPayload);

      const themeAnalysis = typeof html.themes === 'object' && html.themes.supported ? html.themes : { supported: Array.isArray(html.themes) ? html.themes : (html.themes ? [html.themes] : []), default: (html.themes && html.themes.default) || 'magical' };
      const supportedThemes = Array.from(new Set([...(themeAnalysis.supported || []), ...metaThemesList]));
      const defaultTheme = themeAnalysis.default || (supportedThemes[0] || 'magical');

      const visual = html.visual || {
        themes: {
          supported: supportedThemes,
          default: defaultTheme
        },
        colors: {
          supported: css.customProperties || ['primary', 'secondary', 'accent'],
          defaults: {}
        },
        backgrounds: {
          supported: ['solid', 'gradient', 'radial-glow'],
          default: 'gradient'
        },
        surfaces: {
          supported: ['glass-frosted', 'clean-minimal'],
          default: 'glass-frosted'
        },
        buttons: {
          supported: ['gradient-pill', 'outline-glow'],
          default: 'gradient-pill'
        },
        typography: {
          supported: [],
          fonts: []
        },
        radius: {
          supported: ['small', 'medium', 'pill'],
          default: 'medium'
        },
        intensity: {
          supported: ['minimal', 'soft', 'expressive'],
          default: 'soft'
        },
        customControls: []
      };

      return {
        valid: errors.length === 0,
        protocol: { version: PROTOCOL_VERSION, compatible: true },
        template,
        capabilities,
        visual,
        fields,
        media,
        sections,
        themes: supportedThemes,
        colors,
        backgrounds,
        surfaces,
        buttons,
        animations,
        particles,
        metadata: metadata.raw || {},
        mediaInventory,
        capabilityScore: score,
        capabilitySchemaHash,
        warnings,
        errors
      };
    },

    validateSchema(schema) {
      if (!schema || typeof schema !== 'object') {
        return { valid: false, errors: ['Null or invalid schema object'], warnings: [], canPublish: false };
      }

      const errors = schema.errors || [];
      const warnings = schema.warnings || [];

      const canPublish = errors.length === 0;

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        canPublish
      };
    },

    getWarnings() {
      return (cachedAnalysisResult && cachedAnalysisResult.warnings) || [];
    },

    getErrors() {
      return (cachedAnalysisResult && cachedAnalysisResult.errors) || [];
    },

    getCapabilityReport(options = {}) {
      const res = this.analyze(null, options);
      return {
        templateId: res.template.id,
        version: res.template.version,
        score: res.capabilityScore,
        hash: res.capabilitySchemaHash,
        fieldsCount: res.fields.length,
        sectionsCount: res.sections.length,
        capabilities: res.capabilities,
        media: res.media,
        themes: res.themes,
        warningsCount: res.warnings.length,
        errorsCount: res.errors.length,
        canPublish: res.errors.length === 0
      };
    },

    invalidate() {
      cachedAnalysisResult = null;
    },

    _analyzeHtmlStringFallback(html, warnings = [], errors = []) {
      const fields = [];
      const sections = [];
      const mediaSlots = [];
      const seenFields = new Map();
      const seenSections = new Map();
      const seenMedia = new Set();

      const parseTagAttributes = (tagStr) => {
        const attrs = {};
        const attrRegex = /([a-zA-Z0-9_\-]+)(?:=(?:["']([^"']*)["']|([^\s>]+)))?/g;
        let match;
        while ((match = attrRegex.exec(tagStr)) !== null) {
          const name = match[1].toLowerCase();
          const val = match[2] !== undefined ? match[2] : (match[3] !== undefined ? match[3] : 'true');
          attrs[name] = val;
        }
        return attrs;
      };

      const tagRegex = /<([a-zA-Z0-9\-]+)([^>]*)>/g;
      let tagMatch;

      while ((tagMatch = tagRegex.exec(html)) !== null) {
        const tagName = tagMatch[1].toLowerCase();
        const rawAttrs = tagMatch[2];
        const attrs = parseTagAttributes(rawAttrs);

        // Check for sections
        const sectionKey = attrs['data-wm-section'];
        if (sectionKey) {
          const instance = attrs['data-wm-section-instance'] || attrs['data-wm-instance'] || null;
          const mapKey = instance ? `${sectionKey}:${instance}` : sectionKey;
          if (!seenSections.has(mapKey)) {
            const rawLabel = attrs['data-wm-label'];
            const label = rawLabel || sectionKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const isRequired = attrs['data-wm-required'] === 'true';
            const toggleable = isRequired ? false : (attrs['data-wm-toggleable'] !== 'false');
            const layouts = attrs['data-wm-layouts'] ? attrs['data-wm-layouts'].split(',').map(s => s.trim()) : (attrs['data-wm-layout'] ? [attrs['data-wm-layout']] : []);
            const order = attrs['data-wm-order'] ? parseInt(attrs['data-wm-order'], 10) : 0;
            const secObj = {
              id: sectionKey,
              key: sectionKey,
              instance,
              label,
              required: isRequired,
              toggleable,
              defaultEnabled: isRequired ? true : (attrs['data-wm-default-enabled'] !== 'false'),
              order,
              layouts,
              defaultLayout: layouts[0] || null,
              isStandard: KNOWN_SECTIONS.has(sectionKey)
            };
            seenSections.set(mapKey, secObj);
            sections.push(secObj);
          }
        }

        // Check for fields
        const fieldKey = attrs['data-wm-field'] || attrs['data-wm'];
        if (fieldKey) {
          let fieldType = attrs['data-wm-type'] ? attrs['data-wm-type'].toLowerCase() : null;
          if (!fieldType) {
            if (tagName === 'textarea') fieldType = 'textarea';
            else if (tagName === 'img') fieldType = 'image';
            else if (tagName === 'video') fieldType = 'video';
            else if (tagName === 'audio') fieldType = 'audio';
            else if (tagName === 'input') {
              const inputType = attrs['type'] ? attrs['type'].toLowerCase() : 'text';
              fieldType = inputType;
            } else {
              fieldType = 'text';
            }
          }

          if (fieldType && !STANDARD_FIELD_TYPES.has(fieldType)) {
            errors.push({
              code: 'INVALID_FIELD_TYPE',
              field: fieldKey,
              type: fieldType,
              message: `Invalid field type "${fieldType}".`
            });
          }

          const rawLabel = attrs['data-wm-label'];
          const label = rawLabel || fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          const isRequired = attrs['data-wm-required'] === 'true';
          const maxLen = attrs['data-wm-maxlength'] ? parseInt(attrs['data-wm-maxlength'], 10) : (attrs['maxlength'] ? parseInt(attrs['maxlength'], 10) : null);
          const minLen = attrs['data-wm-minlength'] ? parseInt(attrs['data-wm-minlength'], 10) : (attrs['minlength'] ? parseInt(attrs['minlength'], 10) : null);

          if (seenFields.has(fieldKey)) {
            const existing = seenFields.get(fieldKey);
            existing.targets += 1;
            existing.mappings.push(`${tagName} -> ${attrs['data-wm-target'] || 'text'}`);
          } else {
            const fieldObj = {
              key: fieldKey,
              label,
              type: fieldType || 'text',
              required: isRequired,
              defaultValue: attrs['data-wm-default'] || null,
              placeholder: attrs['data-wm-placeholder'] || '',
              description: attrs['data-wm-description'] || '',
              minlength: minLen,
              maxlength: maxLen,
              pattern: attrs['data-wm-pattern'] || null,
              format: attrs['data-wm-format'] || null,
              target: attrs['data-wm-target'] || (tagName === 'img' ? 'src' : 'text'),
              visibleIf: attrs['data-wm-visible-if'] || null,
              disabledIf: attrs['data-wm-disabled-if'] || null,
              requiredIf: attrs['data-wm-required-if'] || null,
              group: attrs['data-wm-group'] || 'personal',
              options: attrs['data-wm-options'] ? parseOptions(attrs['data-wm-options'], warnings, fieldKey) : null,
              targets: 1,
              mappings: [`${tagName} -> ${attrs['data-wm-target'] || 'text'}`],
              legacy: !attrs['data-wm-field'] && Boolean(attrs['data-wm']),
              isStandard: STANDARD_FIELD_TYPES.has(fieldType || 'text')
            };
            seenFields.set(fieldKey, fieldObj);
            fields.push(fieldObj);
          }
        }

        // Check for media
        const mediaKey = attrs['data-wm-media'] || (['img', 'video', 'audio'].includes(tagName) ? (attrs['data-wm-field'] || attrs['id'] || tagName) : null);
        if (mediaKey && !seenMedia.has(mediaKey)) {
          seenMedia.add(mediaKey);
          const rawType = (attrs['data-wm-type'] || tagName).toLowerCase();
          const normalizedType = (rawType === 'img' || rawType === 'image-multiple') ? 'image' : (rawType === 'video-multiple' ? 'video' : rawType);
          const isMultiple = rawType === 'image-multiple' || rawType === 'video-multiple' || attrs['data-wm-multiple'] === 'true' || attrs['data-wm-role'] === 'gallery';
          const maxSizeBytes = attrs['data-wm-max-size'] ? parseInt(attrs['data-wm-max-size'], 10) : null;
          const minItems = attrs['data-wm-min-items'] ? parseInt(attrs['data-wm-min-items'], 10) : 1;
          const maxItems = attrs['data-wm-max-items'] ? parseInt(attrs['data-wm-max-items'], 10) : (isMultiple ? 10 : 1);
          const maxDuration = attrs['data-wm-max-duration'] ? parseInt(attrs['data-wm-max-duration'], 10) : null;

          mediaSlots.push({
            id: mediaKey,
            key: mediaKey,
            type: normalizedType,
            rawType,
            label: attrs['data-wm-label'] || mediaKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            role: attrs['data-wm-role'] || (mediaKey.includes('cover') ? 'cover' : (mediaKey.includes('gallery') ? 'gallery' : 'general')),
            required: attrs['data-wm-required'] === 'true',
            multiple: isMultiple,
            accept: attrs['data-wm-accept'] ? attrs['data-wm-accept'].split(',').map(s => s.trim()) : null,
            maxSizeBytes,
            minItems,
            maxItems,
            maxDuration
          });
        }
      }

      // Check capabilities
      const hasImages = mediaSlots.some(m => m.type === 'image' || m.type === 'image-multiple') || fields.some(f => f.type === 'image' || f.type === 'image-multiple') || html.includes('<img');
      const hasMultipleImages = mediaSlots.some(m => m.type === 'image-multiple') || fields.some(f => f.type === 'image-multiple') || sections.some(s => s.key === 'gallery');
      const hasVideo = mediaSlots.some(m => m.type === 'video' || m.type === 'video-multiple') || fields.some(f => f.type === 'video' || f.type === 'video-multiple') || html.includes('<video');
      const hasAudio = mediaSlots.some(m => m.type === 'audio') || fields.some(f => f.type === 'audio') || html.includes('<audio');
      const hasVoice = mediaSlots.some(m => m.type === 'voice') || fields.some(f => f.type === 'voice') || sections.some(s => s.key === 'voice');

      return {
        protocolVersion: PROTOCOL_VERSION,
        fields,
        sections: sections.sort((a, b) => (a.order || 0) - (b.order || 0)),
        media: {
          images: hasImages,
          multipleImages: hasMultipleImages,
          video: hasVideo,
          audio: hasAudio,
          voice: hasVoice,
          slots: mediaSlots
        },
        themes: [],
        animations: { page: [], sections: [], reveals: [], particles: [], intensity: [] },
        capabilities: {
          photos: hasImages,
          multiplePhotos: hasMultipleImages,
          videos: hasVideo,
          video: hasVideo,
          audio: hasAudio,
          music: hasAudio,
          voice: hasVoice,
          sections: sections.length > 0,
          gallery: hasMultipleImages,
          countdown: sections.some(s => s.key === 'countdown'),
          timeline: sections.some(s => s.key === 'timeline'),
          secretMessage: sections.some(s => s.key === 'secret_message' || s.key === 'secretMessage'),
          finalSurprise: sections.some(s => s.key === 'final_surprise' || s.key === 'finalSurprise')
        }
      };
    }
  };

  // Expose to global environment
  global.WishMagicTemplateAnalyzer = WishMagicTemplateAnalyzer;

  if (global.WishMagicTemplate) {
    global.WishMagicTemplate.getCapabilities = function () {
      return WishMagicTemplateAnalyzer.analyze();
    };
  }

})(typeof window !== 'undefined' ? window : this);
