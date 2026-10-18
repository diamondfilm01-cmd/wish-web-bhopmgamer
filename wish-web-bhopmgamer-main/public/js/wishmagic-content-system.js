/**
 * WishMagic Universal Advanced Content & Personalization System (Part 9)
 * ======================================================================
 * Declarative, template-driven personalization engine that scans data-wm-*
 * content metadata from template DOM/code, automatically constructs capability
 * and customizer field schemas, provides multi-element mapping, safe text
 * rendering, date/time formatting, token hydration, centralized validation,
 * conditional field evaluation, and seamless runtime bridge synchronization.
 *
 * Fully framework-agnostic, JSON-serializable, and Node/Browser compatible.
 */

(function (global) {
  'use strict';

  const PROTOCOL_VERSION = '1.0';

  // Standard supported field types for WishMagic
  const SUPPORTED_FIELD_TYPES = new Set([
    'text',
    'textarea',
    'date',
    'time',
    'datetime',
    'number',
    'email',
    'phone',
    'url',
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

  // Standard Personalization field keys
  const STANDARD_PERSONALIZATION_KEYS = new Set([
    'recipient_name',
    'sender_name',
    'occasion',
    'relationship',
    'event_date',
    'event_time',
    'timezone',
    'custom_message'
  ]);

  // Month names for date formatting
  const MONTHS_FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const MONTHS_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  // Helper: Parse boolean string safely
  function parseBool(val, fallback = false) {
    if (val === null || val === undefined) return fallback;
    const s = String(val).trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
    return fallback;
  }

  // Helper: Parse comma list or JSON array
  function parseOptionsList(optionsAttr) {
    if (!optionsAttr) return [];
    const trimmed = String(optionsAttr).trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map(opt => {
            if (typeof opt === 'string') {
              return { value: opt, label: opt.charAt(0).toUpperCase() + opt.slice(1).replace(/_/g, ' ') };
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
      } catch (e) {}
    }

    return trimmed
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(item => ({
        value: item,
        label: item.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      }));
  }

  // Helper: Format Date string
  function formatDateString(val, formatStr) {
    if (!val || typeof val !== 'string') return val || '';
    const cleanDate = val.trim().split('T')[0]; // YYYY-MM-DD
    const parts = cleanDate.split('-');
    if (parts.length !== 3) return val;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
      return val;
    }

    const fmt = (formatStr || 'YYYY-MM-DD').trim();
    const monthName = MONTHS_FULL[month - 1] || '';
    const monthShort = MONTHS_SHORT[month - 1] || '';
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month).padStart(2, '0');
    const yearStr = String(year);

    switch (fmt) {
      case 'DD MMMM YYYY':
        return `${day} ${monthName} ${year}`;
      case 'DD MMM YYYY':
        return `${day} ${monthShort} ${year}`;
      case 'MMMM DD, YYYY':
        return `${monthName} ${day}, ${year}`;
      case 'MMM DD, YYYY':
        return `${monthShort} ${day}, ${year}`;
      case 'DD/MM/YYYY':
        return `${dayStr}/${monthStr}/${yearStr}`;
      case 'MM/DD/YYYY':
        return `${monthStr}/${dayStr}/${yearStr}`;
      case 'YYYY-MM-DD':
        return `${yearStr}-${monthStr}-${dayStr}`;
      default: {
        let result = fmt;
        result = result.replace(/YYYY/g, yearStr);
        result = result.replace(/MMMM/g, monthName);
        result = result.replace(/MMM/g, monthShort);
        result = result.replace(/MM/g, monthStr);
        result = result.replace(/DD/g, dayStr);
        result = result.replace(/D/g, String(day));
        return result;
      }
    }
  }

  // Helper: Safe DOM text setter
  function setElementTextSafe(el, text, targetAttr = 'text') {
    if (!el) return;
    const strVal = text !== undefined && text !== null ? String(text) : '';

    if (targetAttr && targetAttr.startsWith('attr:')) {
      const attrName = targetAttr.slice(5).trim();
      if (attrName) {
        el.setAttribute(attrName, strVal);
      }
      return;
    }

    if (targetAttr === 'value' && ('value' in el)) {
      el.value = strVal;
      return;
    }

    // Default safe textContent
    el.textContent = strVal;
  }

  // Helper: Evaluate conditional visibility rule (data-wm-visible-if)
  function evaluateVisibleIf(conditionStr, state) {
    if (!conditionStr || typeof conditionStr !== 'string') return true;
    const cond = conditionStr.trim();
    if (!cond) return true;

    // Negation: "!field"
    if (cond.startsWith('!')) {
      const fieldKey = cond.slice(1).trim();
      const val = state[fieldKey];
      return !val || val === 'false' || val === false;
    }

    // Inequality: "field!=value"
    if (cond.includes('!=')) {
      const [fieldKey, targetVal] = cond.split('!=').map(s => s.trim());
      const curVal = state[fieldKey];
      const normTarget = targetVal === 'true' ? true : targetVal === 'false' ? false : targetVal;
      return String(curVal) !== String(normTarget);
    }

    // Equality: "field=value" or "field==value"
    if (cond.includes('=')) {
      const parts = cond.split('=').filter(Boolean);
      if (parts.length >= 2) {
        const fieldKey = parts[0].trim();
        const targetVal = parts[1].trim();
        const curVal = state[fieldKey];
        if (targetVal === 'true') return curVal === true || curVal === 'true';
        if (targetVal === 'false') return curVal === false || curVal === 'false';
        return String(curVal).trim().toLowerCase() === targetVal.toLowerCase();
      }
    }

    // Truthy: "field"
    const curVal = state[cond];
    return Boolean(curVal) && curVal !== 'false' && curVal !== 0;
  }

  // Internal state
  let currentSchema = null;
  let currentContent = {};
  let defaultContent = {};
  let initialTokenTemplates = new Map(); // Store original template text containing {{tokens}}
  let changeListeners = [];
  let previewBridge = null;
  let activeDocument = null;

  const WishMagicContent = {
    PROTOCOL_VERSION,

    /**
     * Scan template document and extract declarative content schema
     * @param {Document|Element} rootDoc
     * @returns {Object} Normalized content schema
     */
    scan(rootDoc) {
      const doc = rootDoc || activeDocument || (typeof document !== 'undefined' ? document : null);
      if (doc) activeDocument = doc;
      if (!doc) {
        return {
          valid: false,
          fields: [],
          groups: [],
          standardFields: [],
          templateSpecificFields: [],
          warnings: [{ code: 'NO_DOCUMENT', message: 'No document available for content scan.' }],
          errors: [{ code: 'NO_DOCUMENT', message: 'Cannot scan null document.' }]
        };
      }

      const warnings = [];
      const errors = [];
      const fieldsMap = new Map();
      const fieldsList = [];

      // Query all elements declaring fields
      const rawElements = doc.querySelectorAll ? Array.from(doc.querySelectorAll('[data-wm-field], [data-wm]')) : [];

      rawElements.forEach((el) => {
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
            if (el.tagName === 'IMG') fieldType = 'image';
            else if (el.tagName === 'TEXTAREA') fieldType = 'textarea';
            else if (el.tagName === 'VIDEO') fieldType = 'video';
            else if (el.tagName === 'AUDIO') fieldType = 'audio';
            else if (el.tagName === 'INPUT') {
              const inType = (el.getAttribute('type') || '').toLowerCase();
              if (inType === 'checkbox') fieldType = 'toggle';
              else if (inType === 'range') fieldType = 'range';
              else if (inType === 'date') fieldType = 'date';
              else if (inType === 'time') fieldType = 'time';
              else if (inType === 'datetime-local') fieldType = 'datetime';
              else if (inType === 'number') fieldType = 'number';
              else if (inType === 'color') fieldType = 'color';
              else if (inType === 'email') fieldType = 'email';
              else if (inType === 'tel') fieldType = 'phone';
              else if (inType === 'url') fieldType = 'url';
              else fieldType = 'text';
            } else if (el.tagName === 'SELECT') {
              fieldType = el.hasAttribute('multiple') ? 'multiselect' : 'select';
            } else {
              fieldType = 'text';
            }

            if (!isLegacy) {
              warnings.push({
                code: 'FIELD_TYPE_INFERRED',
                field: fieldKey,
                message: `Field "${fieldKey}" is missing data-wm-type attribute. Inferred as "${fieldType}".`
              });
            }
          } else if (!SUPPORTED_FIELD_TYPES.has(fieldType)) {
            warnings.push({
              code: 'UNSUPPORTED_FIELD_TYPE',
              field: fieldKey,
              value: rawType,
              message: `Unsupported WishMagic field type: ${rawType}`
            });
            return; // Safely skip unsupported field type per requirement #45
          }

          // Required flag
          const rawRequired = el.getAttribute('data-wm-required');
          const isRequired = parseBool(rawRequired, false);

          // Label
          const fieldLabel = el.getAttribute('data-wm-label') ||
            fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

          // Default value
          let defaultValue = el.getAttribute('data-wm-default');
          if (defaultValue === null || defaultValue === undefined) {
            if (el.tagName === 'IMG') {
              defaultValue = el.getAttribute('src') || '';
            } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
              defaultValue = el.value || '';
            } else if (!el.children || el.children.length === 0) {
              const rawTxt = el.textContent ? el.textContent.trim() : '';
              if (rawTxt && !rawTxt.includes('{{')) {
                defaultValue = rawTxt;
              }
            }
          }

          // Placeholder & Description
          const placeholder = el.getAttribute('data-wm-placeholder') || null;
          const description = el.getAttribute('data-wm-description') || null;

          // Maxlength & Minlength
          const rawMax = el.getAttribute('data-wm-maxlength');
          let maxlength = null;
          if (rawMax !== null && rawMax !== '') {
            const parsedMax = parseInt(rawMax, 10);
            if (Number.isNaN(parsedMax) || parsedMax <= 0) {
              warnings.push({
                code: 'INVALID_MAX_LENGTH',
                field: fieldKey,
                value: rawMax,
                message: `Invalid data-wm-maxlength "${rawMax}" on field "${fieldKey}".`
              });
            } else {
              maxlength = parsedMax;
            }
          }

          const rawMinLen = el.getAttribute('data-wm-minlength');
          let minlength = null;
          if (rawMinLen !== null && rawMinLen !== '') {
            const parsedMinLen = parseInt(rawMinLen, 10);
            if (Number.isNaN(parsedMinLen) || parsedMinLen < 0) {
              warnings.push({
                code: 'INVALID_MIN_LENGTH',
                field: fieldKey,
                value: rawMinLen,
                message: `Invalid data-wm-minlength "${rawMinLen}" on field "${fieldKey}".`
              });
            } else {
              minlength = parsedMinLen;
            }
          }

          // Numeric Min, Max, Step
          const rawNumMin = el.getAttribute('data-wm-min');
          const min = rawNumMin !== null && rawNumMin !== '' && !Number.isNaN(Number(rawNumMin)) ? Number(rawNumMin) : null;

          const rawNumMax = el.getAttribute('data-wm-max');
          const max = rawNumMax !== null && rawNumMax !== '' && !Number.isNaN(Number(rawNumMax)) ? Number(rawNumMax) : null;

          const rawStep = el.getAttribute('data-wm-step');
          const step = rawStep !== null && rawStep !== '' && !Number.isNaN(Number(rawStep)) ? Number(rawStep) : null;

          // Pattern & Format
          const pattern = el.getAttribute('data-wm-pattern') || null;
          const format = el.getAttribute('data-wm-format') || null;
          const target = el.getAttribute('data-wm-target') || 'text';

          // Group & Order
          let group = el.getAttribute('data-wm-group');
          if (!group) {
            if (fieldType === 'image' || fieldType === 'image-multiple' || fieldType === 'video' || fieldType === 'video-multiple' || fieldType === 'audio' || fieldType === 'voice') {
              group = 'media';
            } else if (fieldType === 'color') {
              group = 'appearance';
            } else if (fieldKey === 'custom_message' || fieldKey.includes('message') || fieldKey.includes('letter')) {
              group = 'message';
            } else if (fieldKey === 'event_date' || fieldKey === 'event_time' || fieldKey === 'timezone') {
              group = 'event';
            } else {
              group = 'personal';
            }
          }

          const rawOrder = el.getAttribute('data-wm-order');
          const order = rawOrder !== null && rawOrder !== '' && !Number.isNaN(parseInt(rawOrder, 10)) ? parseInt(rawOrder, 10) : null;

          // Conditional visibility & dependencies
          const visibleIf = el.getAttribute('data-wm-visible-if') || null;
          const disabledIf = el.getAttribute('data-wm-disabled-if') || null;
          const requiredIf = el.getAttribute('data-wm-required-if') || null;
          const labelIf = el.getAttribute('data-wm-label-if') || null;
          const descriptionIf = el.getAttribute('data-wm-description-if') || null;
          const clearOnHide = parseBool(el.getAttribute('data-wm-clear-on-hide'), false);

          // Options (for select & multiselect)
          const rawOptions = el.getAttribute('data-wm-options');
          const options = parseOptionsList(rawOptions);
          if ((fieldType === 'select' || fieldType === 'multiselect') && options.length === 0) {
            warnings.push({
              code: 'SELECT_OPTIONS_MISSING',
              field: fieldKey,
              message: `Select field "${fieldKey}" has no declared options.`
            });
          }

          // Multi-target tracking & Conflict Resolution (Requirement #46)
          if (fieldsMap.has(fieldKey)) {
            const existing = fieldsMap.get(fieldKey);
            existing.targets += 1;

            if (existing.type !== fieldType) {
              warnings.push({
                code: 'FIELD_TYPE_CONFLICT',
                field: fieldKey,
                message: `Type mismatch for field "${fieldKey}": declared as "${existing.type}" and "${fieldType}". Retaining primary type "${existing.type}".`
              });
            }

            if (rawRequired !== null && existing.rawRequired !== null && existing.required !== isRequired) {
              warnings.push({
                code: 'FIELD_REQUIRED_CONFLICT',
                field: fieldKey,
                message: `Conflicting required declaration for field "${fieldKey}".`
              });
            }

            if (maxlength !== null && existing.maxlength !== null && existing.maxlength !== maxlength) {
              warnings.push({
                code: 'FIELD_MAXLENGTH_CONFLICT',
                field: fieldKey,
                message: `Conflicting maxlength for field "${fieldKey}": ${existing.maxlength} vs ${maxlength}.`
              });
            }
          } else {
            const newField = {
              key: fieldKey,
              label: fieldLabel,
              type: fieldType,
              required: isRequired,
              rawRequired: rawRequired,
              defaultValue: defaultValue,
              placeholder: placeholder,
              description: description,
              minlength: minlength,
              maxlength: maxlength,
              min: min,
              max: max,
              step: step,
              pattern: pattern,
              format: format,
              target: target,
              group: group,
              order: order,
              visibleIf: visibleIf,
              disabledIf: disabledIf,
              requiredIf: requiredIf,
              labelIf: labelIf,
              descriptionIf: descriptionIf,
              clearOnHide: clearOnHide,
              options: options,
              isStandard: STANDARD_PERSONALIZATION_KEYS.has(fieldKey),
              legacy: isLegacy,
              targets: 1
            };

            fieldsMap.set(fieldKey, newField);
            fieldsList.push(newField);
          }
        } catch (err) {
          errors.push({
            code: 'FIELD_SCAN_ERROR',
            message: `Error scanning field element: ${err.message}`
          });
        }
      });

      // Sort fields: respect data-wm-order if defined, preserving DOM order otherwise
      const sortedFields = [...fieldsList].sort((a, b) => {
        if (a.order !== null && b.order !== null) return a.order - b.order;
        if (a.order !== null) return -1;
        if (b.order !== null) return 1;
        return 0;
      });

      // Group fields
      const groupsMap = new Map();
      sortedFields.forEach(f => {
        const grp = f.group || 'general';
        if (!groupsMap.has(grp)) {
          groupsMap.set(grp, {
            id: grp,
            key: grp,
            title: grp.charAt(0).toUpperCase() + grp.slice(1).replace(/_/g, ' '),
            fields: []
          });
        }
        groupsMap.get(grp).fields.push(f);
      });

      const standardFields = sortedFields.filter(f => f.isStandard);
      const templateSpecificFields = sortedFields.filter(f => !f.isStandard);

      currentSchema = {
        valid: errors.length === 0,
        protocol: { version: PROTOCOL_VERSION },
        fields: sortedFields,
        groups: Array.from(groupsMap.values()),
        standardFields,
        templateSpecificFields,
        warnings,
        errors
      };

      return currentSchema;
    },

    /**
     * Initialize Content System with template document and initial data
     * @param {Object} options
     */
    init(options = {}) {
      const doc = options.document || (typeof document !== 'undefined' ? document : null);
      if (doc) {
        this.scan(doc);
        this.captureTokenTemplates(doc);
      }

      // Populate default content from schema
      defaultContent = {};
      if (currentSchema && Array.isArray(currentSchema.fields)) {
        currentSchema.fields.forEach(f => {
          if (f.defaultValue !== null && f.defaultValue !== undefined) {
            defaultContent[f.key] = f.defaultValue;
          } else if (f.type === 'toggle') {
            defaultContent[f.key] = false;
          } else if (f.type === 'multiselect') {
            defaultContent[f.key] = [];
          } else {
            defaultContent[f.key] = '';
          }
        });
      }

      // Merge initial content preserving existing state
      const initialData = options.data || {};
      const initialContent = initialData.content || initialData;
      currentContent = { ...defaultContent };

      Object.keys(initialContent).forEach(k => {
        if (initialContent[k] !== undefined && initialContent[k] !== null) {
          currentContent[k] = initialContent[k];
        }
      });

      // Maintain global window.WishMagicData.content and window.WishMagicData.event
      if (typeof window !== 'undefined') {
        window.WishMagicData = window.WishMagicData || {};
        window.WishMagicData.content = { ...currentContent };

        if (currentContent.event_date || currentContent.event_time || currentContent.timezone) {
          window.WishMagicData.event = {
            date: currentContent.event_date || '',
            time: currentContent.event_time || '00:00',
            timezone: currentContent.timezone || 'Asia/Kolkata'
          };
        }
      }

      if (options.previewBridge || options.previewTarget || options.previewIframe) {
        previewBridge = options.previewBridge || options.previewTarget || options.previewIframe;
      }

      if (typeof options.onChange === 'function') {
        this.onChange(options.onChange);
      }

      // Render tokens and initial fields
      if (doc) {
        this.renderTokens(doc, currentContent);
        this.applyContentToDOM(doc, currentContent);
      }

      return this;
    },

    /**
     * Capture elements containing {{tokens}} for safe continuous hydration
     */
    captureTokenTemplates(doc) {
      if (!doc) return;
      try {
        const walker = (doc.createTreeWalker && doc.body)
          ? doc.createTreeWalker(doc.body, 4 /* NodeFilter.SHOW_TEXT */, null, false)
          : null;

        if (walker) {
          let node;
          while ((node = walker.nextNode())) {
            const txt = node.nodeValue;
            if (txt && txt.includes('{{') && txt.includes('}}')) {
              initialTokenTemplates.set(node, txt);
            }
          }
        }
      } catch (e) {}
    },

    /**
     * Get current scanned schema
     */
    getSchema() {
      return currentSchema;
    },

    /**
     * Get list of fields
     */
    getFields() {
      return currentSchema ? currentSchema.fields : [];
    },

    /**
     * Get value of a specific field
     */
    getValue(key) {
      return currentContent[key];
    },

    /**
     * Set value of a specific field
     */
    setValue(key, value) {
      if (!key) return;
      const oldValue = currentContent[key];
      currentContent[key] = value;

      // Update global state
      if (typeof window !== 'undefined') {
        window.WishMagicData = window.WishMagicData || {};
        window.WishMagicData.content = window.WishMagicData.content || {};
        window.WishMagicData.content[key] = value;

        if (key === 'event_date' || key === 'event_time' || key === 'timezone') {
          window.WishMagicData.event = {
            date: currentContent.event_date || '',
            time: currentContent.event_time || '00:00',
            timezone: currentContent.timezone || 'Asia/Kolkata'
          };
        }
      }

      // Update local DOM safely
      const doc = activeDocument || (typeof document !== 'undefined' ? document : null);
      if (doc) {
        this.updateFieldInDOM(doc, key, value);
        this.renderTokens(doc, currentContent);
      }

      // Update Preview via Runtime Bridge
      this.sendUpdateToBridge(key, value);

      // Notify Change Listeners
      const changeObj = { key, oldValue, newValue: value, content: { ...currentContent } };
      changeListeners.forEach(cb => {
        try {
          cb(changeObj);
        } catch (e) {
          console.warn('[WishMagicContent] Listener error:', e);
        }
      });
    },

    /**
     * Set multiple field values in batch
     */
    setValues(values = {}) {
      if (!values || typeof values !== 'object') return;
      Object.keys(values).forEach(k => {
        currentContent[k] = values[k];
      });

      if (typeof window !== 'undefined') {
        window.WishMagicData = window.WishMagicData || {};
        window.WishMagicData.content = { ...currentContent };

        if (currentContent.event_date || currentContent.event_time || currentContent.timezone) {
          window.WishMagicData.event = {
            date: currentContent.event_date || '',
            time: currentContent.event_time || '00:00',
            timezone: currentContent.timezone || 'Asia/Kolkata'
          };
        }
      }

      const doc = activeDocument || (typeof document !== 'undefined' ? document : null);
      if (doc) {
        this.applyContentToDOM(doc, currentContent);
        this.renderTokens(doc, currentContent);
      }

      this.sendStateToBridge(currentContent);
    },

    /**
     * Get all content values (clean serializable object)
     */
    getValues() {
      return JSON.parse(JSON.stringify(currentContent));
    },

    /**
     * Central Validation System (Requirement #23)
     */
    validate(valuesToValidate) {
      const data = valuesToValidate || currentContent;
      const errors = [];
      const fields = currentSchema ? currentSchema.fields : [];

      fields.forEach(f => {
        // Check visibility via WishMagicDependencies if available
        let isVisible = true;
        if (f.visibleIf) {
          if (global.WishMagicDependencies && typeof global.WishMagicDependencies.evaluate === 'function') {
            isVisible = global.WishMagicDependencies.evaluate(f.visibleIf, data);
          } else {
            isVisible = evaluateVisibleIf(f.visibleIf, data);
          }
        }

        // If field is conditionally hidden, skip validation completely (Requirement #11)
        if (!isVisible) return;

        // Check conditional required (data-wm-required-if)
        let isRequired = f.required === true;
        if (f.requiredIf && global.WishMagicDependencies && typeof global.WishMagicDependencies.evaluate === 'function') {
          isRequired = global.WishMagicDependencies.evaluate(f.requiredIf, data);
        }

        const val = data[f.key];
        const isBlank = val === undefined || val === null || (typeof val === 'string' && val.trim() === '') || (Array.isArray(val) && val.length === 0);

        // 1. REQUIRED check
        if (isRequired && isBlank) {
          errors.push({
            field: f.key,
            code: 'REQUIRED',
            message: `${f.label} is required.`
          });
          return;
        }

        // If field is optional and blank, skip further type checks
        if (isBlank) return;

        // 2. MIN_LENGTH check
        if (f.minlength !== null && typeof val === 'string' && val.length < f.minlength) {
          errors.push({
            field: f.key,
            code: 'MIN_LENGTH',
            message: `${f.label} must be at least ${f.minlength} characters.`
          });
        }

        // 3. MAX_LENGTH check
        if (f.maxlength !== null && typeof val === 'string' && val.length > f.maxlength) {
          errors.push({
            field: f.key,
            code: 'MAX_LENGTH',
            message: `${f.label} cannot exceed ${f.maxlength} characters.`
          });
        }

        // 4. INVALID_DATE check (canonical YYYY-MM-DD)
        if (f.type === 'date') {
          const dateStr = String(val).trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            errors.push({
              field: f.key,
              code: 'INVALID_DATE',
              message: `Please enter a valid date in YYYY-MM-DD format.`
            });
          }
        }

        // 5. INVALID_TIME check (HH:mm)
        if (f.type === 'time') {
          const timeStr = String(val).trim();
          if (!/^\d{2}:\d{2}(:\d{2})?$/.test(timeStr)) {
            errors.push({
              field: f.key,
              code: 'INVALID_TIME',
              message: `Please enter a valid time in HH:mm format.`
            });
          }
        }

        // 6. INVALID_EMAIL check
        if (f.type === 'email') {
          const emailStr = String(val).trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
            errors.push({
              field: f.key,
              code: 'INVALID_EMAIL',
              message: `Please enter a valid email address.`
            });
          }
        }

        // 7. INVALID_PHONE check
        if (f.type === 'phone') {
          const phoneStr = String(val).trim();
          if (!/^[\d+\-\s()]{6,20}$/.test(phoneStr)) {
            errors.push({
              field: f.key,
              code: 'INVALID_PHONE',
              message: `Please enter a valid phone number.`
            });
          }
        }

        // 8. INVALID_URL check (safe http/https/relative, reject javascript:)
        if (f.type === 'url') {
          const urlStr = String(val).trim();
          if (urlStr.toLowerCase().startsWith('javascript:') || urlStr.toLowerCase().startsWith('data:text/html')) {
            errors.push({
              field: f.key,
              code: 'INVALID_URL',
              message: `Unsafe URL scheme is not permitted.`
            });
          } else if (!/^(https?:\/\/|\/|#)/i.test(urlStr)) {
            errors.push({
              field: f.key,
              code: 'INVALID_URL',
              message: `Please enter a valid URL.`
            });
          }
        }

        // 9. INVALID_NUMBER check
        if (f.type === 'number' || f.type === 'range') {
          const num = Number(val);
          if (Number.isNaN(num)) {
            errors.push({
              field: f.key,
              code: 'INVALID_NUMBER',
              message: `${f.label} must be a valid number.`
            });
          } else {
            if (f.min !== null && num < f.min) {
              errors.push({
                field: f.key,
                code: 'INVALID_NUMBER',
                message: `${f.label} must be at least ${f.min}.`
              });
            }
            if (f.max !== null && num > f.max) {
              errors.push({
                field: f.key,
                code: 'INVALID_NUMBER',
                message: `${f.label} cannot exceed ${f.max}.`
              });
            }
          }
        }

        // 10. INVALID_OPTION check for select & multiselect
        if (f.type === 'select' && f.options && f.options.length > 0) {
          const allowed = f.options.map(o => String(o.value));
          if (!allowed.includes(String(val))) {
            errors.push({
              field: f.key,
              code: 'INVALID_OPTION',
              message: `Selected value for ${f.label} is not a declared option.`
            });
          }
        }

        if (f.type === 'multiselect' && f.options && f.options.length > 0) {
          const allowed = f.options.map(o => String(o.value));
          const items = Array.isArray(val) ? val : [val];
          const hasInvalid = items.some(item => !allowed.includes(String(item)));
          if (hasInvalid) {
            errors.push({
              field: f.key,
              code: 'INVALID_OPTION',
              message: `One or more selected options for ${f.label} are invalid.`
            });
          }
        }

        // 11. INVALID_PATTERN check
        if (f.pattern) {
          try {
            const re = new RegExp(f.pattern);
            if (!re.test(String(val))) {
              errors.push({
                field: f.key,
                code: 'INVALID_PATTERN',
                message: `${f.label} does not match required pattern.`
              });
            }
          } catch (e) {}
        }
      });

      return {
        valid: errors.length === 0,
        errors
      };
    },

    /**
     * Reset all content to template defaults
     */
    reset() {
      currentContent = { ...defaultContent };
      if (typeof window !== 'undefined') {
        window.WishMagicData = window.WishMagicData || {};
        window.WishMagicData.content = { ...currentContent };
      }

      const doc = activeDocument || (typeof document !== 'undefined' ? document : null);
      if (doc) {
        this.applyContentToDOM(doc, currentContent);
        this.renderTokens(doc, currentContent);
      }

      this.sendStateToBridge(currentContent);
    },

    /**
     * Format a value according to format string or type rules
     */
    formatValue(key, value, format) {
      if (format) {
        return formatDateString(value, format);
      }
      return value !== undefined && value !== null ? String(value) : '';
    },

    /**
     * Resolve a dynamic token string
     */
    resolveToken(token, data) {
      if (!token) return '';
      const cleanToken = token.replace(/[{}]/g, '').trim();
      const dataSource = data || currentContent;
      const val = dataSource[cleanToken] !== undefined ? dataSource[cleanToken] : (global.WishMagicData && global.WishMagicData[cleanToken]);
      return val !== undefined && val !== null ? String(val) : '';
    },

    /**
     * Render dynamic {{tokens}} across text nodes in DOM tree safely as text
     */
    renderTokens(root, data) {
      if (!root) return;
      const source = data || currentContent;

      // Hydrate stored token nodes
      if (initialTokenTemplates.size > 0) {
        initialTokenTemplates.forEach((templateStr, textNode) => {
          if (textNode && textNode.parentNode) {
            let replaced = templateStr;
            replaced = replaced.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, key) => {
              const val = source[key] !== undefined ? source[key] : (global.WishMagicData && global.WishMagicData[key]);
              return val !== undefined && val !== null ? String(val) : match;
            });
            textNode.nodeValue = replaced;
          }
        });
        return;
      }

      // Fallback live walk
      try {
        const walker = (root.createTreeWalker && root.body)
          ? root.createTreeWalker(root.body, 4 /* NodeFilter.SHOW_TEXT */, null, false)
          : null;

        if (walker) {
          let node;
          while ((node = walker.nextNode())) {
            const txt = node.nodeValue;
            if (txt && txt.includes('{{') && txt.includes('}}')) {
              initialTokenTemplates.set(node, txt);
              const replaced = txt.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, key) => {
                const val = source[key] !== undefined ? source[key] : (global.WishMagicData && global.WishMagicData[key]);
                return val !== undefined && val !== null ? String(val) : match;
              });
              node.nodeValue = replaced;
            }
          }
        }
      } catch (e) {}
    },

    /**
     * Update single field targets in DOM
     */
    updateFieldInDOM(doc, key, value) {
      if (!doc || !key) return;
      const elements = doc.querySelectorAll ? Array.from(doc.querySelectorAll(`[data-wm-field="${key}"], [data-wm="${key}"]`)) : [];

      elements.forEach(el => {
        const type = el.getAttribute('data-wm-type') || (el.tagName === 'IMG' ? 'image' : 'text');
        const format = el.getAttribute('data-wm-format');
        const target = el.getAttribute('data-wm-target') || 'text';

        let displayValue = value;
        if (format && (type === 'date' || type === 'datetime')) {
          displayValue = formatDateString(value, format);
        }

        if (type === 'image' && el.tagName === 'IMG') {
          el.src = displayValue || el.getAttribute('data-wm-default') || '/assets/file_ab2082.png';
        } else if (type === 'toggle' && el.tagName === 'INPUT' && el.type === 'checkbox') {
          el.checked = Boolean(value);
        } else if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') && target === 'value') {
          el.value = displayValue !== undefined && displayValue !== null ? displayValue : '';
        } else {
          setElementTextSafe(el, displayValue, target);
        }
      });
    },

    /**
     * Apply full content map to DOM
     */
    applyContentToDOM(doc, data) {
      if (!doc || !data) return;
      Object.keys(data).forEach(k => {
        this.updateFieldInDOM(doc, k, data[k]);
      });
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
     * Send update via runtime bridge
     */
    sendUpdateToBridge(key, value) {
      const bridge = previewBridge || global.WishMagicRuntimeBridge;
      if (bridge && typeof bridge.send === 'function') {
        bridge.send('WISHMAGIC_UPDATE', {
          key,
          value,
          content: { [key]: value }
        });
      }
    },

    /**
     * Send full state via runtime bridge
     */
    sendStateToBridge(content) {
      const bridge = previewBridge || global.WishMagicRuntimeBridge;
      if (bridge && typeof bridge.send === 'function') {
        bridge.send('WISHMAGIC_STATE', {
          content: { ...content }
        });
      }
    },

    /**
     * Update preview
     */
    updatePreview(data) {
      const content = data || currentContent;
      this.sendStateToBridge(content);
    },

    /**
     * Destroy / Cleanup
     */
    destroy() {
      changeListeners = [];
      initialTokenTemplates.clear();
      currentContent = {};
      defaultContent = {};
      currentSchema = null;
    }
  };

  // Export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WishMagicContent;
  }
  if (typeof window !== 'undefined') {
    window.WishMagicContent = WishMagicContent;
  }
  global.WishMagicContent = WishMagicContent;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
