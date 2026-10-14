/**
 * WishMagic Customizer UX, Field Renderer & Interaction System (Part 11)
 * =======================================================================
 * Declarative, schema-driven, centralized field renderer and interaction engine.
 *
 * Responsibilities:
 * - Centralized window.WishMagicFieldRenderer architecture:
 *   - render(field, state, onChange, options)
 *   - update(field, state, domElement)
 *   - destroy(field, domElement)
 *   - validate(field, value)
 *   - focus(field, domElement)
 *   - scrollTo(field, domElement, options)
 *
 * - Supported Field Types:
 *   text, textarea, date, time, datetime, number, email, phone, url, color,
 *   select, multiselect, toggle, range, image, image-multiple, video,
 *   video-multiple, audio, voice, font, icon.
 *
 * - Advanced UX Features:
 *   - Real-time inline validation feedback, aria-invalid, aria-describedby
 *   - Dynamic character counters (x / max) for text/textarea
 *   - Stepper controls (+/-) and range slider value badges
 *   - Interactive Color Picker with preset palette swatches and hex sync
 *   - Font Family Selector with live typography previews
 *   - Icon / Emoji Grid Selector with search filtering
 *   - Multi-select Tag Pill / Chip system with Select All / Clear All
 *   - Accessible Switch Toggles with role="switch"
 *   - Seamless Media System integration (Part 8 media slots)
 *   - Non-destructive DOM in-place updates preserving cursor & focus
 *   - Auto-scroll & focus to first invalid field with gentle highlight/shake
 *   - Safe HTML escaping (Anti-XSS) for all labels, help text & values
 *
 * Node.js (SSR / Unit Test) and Browser DOM compatible.
 */

(function (global) {
  'use strict';

  const RENDERER_VERSION = '1.0.0';

  // Safe HTML Escaping Helper
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Predefined Font Families for Font Selector
  const PRESET_FONTS = [
    { value: 'Inter, sans-serif', label: 'Inter (Modern Sans)', sample: 'WishMagic Love' },
    { value: "'Playfair Display', serif", label: 'Playfair Display (Elegant Serif)', sample: 'Warmest Wishes' },
    { value: "'Dancing Script', cursive", label: 'Dancing Script (Playful Script)', sample: 'Happy Birthday' },
    { value: "'Great Vibes', cursive", label: 'Great Vibes (Formal Calligraphy)', sample: 'Celebrate Together' },
    { value: "'Poppins', sans-serif", label: 'Poppins (Clean Geometric)', sample: 'Always With You' },
    { value: "'Caveat', cursive", label: 'Caveat (Casual Handwriting)', sample: 'Forever & Always' },
    { value: "'Pacifico', cursive", label: 'Pacifico (Fun Brush)', sample: 'Sweet Memories' },
    { value: "'Cinzel', serif", label: 'Cinzel (Cinematic Classic)', sample: 'Cherished Moments' },
    { value: "'Satisfy', cursive", label: 'Satisfy (Smooth Cursive)', sample: 'With All My Love' },
    { value: "'Montserrat', sans-serif", label: 'Montserrat (Bold Modern)', sample: 'Bright Future' }
  ];

  // Predefined Icons / Emojis for Icon Selector
  const PRESET_ICONS = [
    { value: '❤️', label: 'Heart', category: 'love' },
    { value: '💖', label: 'Sparkling Heart', category: 'love' },
    { value: '🎂', label: 'Birthday Cake', category: 'celebration' },
    { value: '🎉', label: 'Party Popper', category: 'celebration' },
    { value: '🎈', label: 'Balloon', category: 'celebration' },
    { value: '🌟', label: 'Glowing Star', category: 'magic' },
    { value: '✨', label: 'Sparkles', category: 'magic' },
    { value: '🎁', label: 'Gift Box', category: 'celebration' },
    { value: '🥂', label: 'Cheers Glasses', category: 'celebration' },
    { value: '💍', label: 'Ring', category: 'wedding' },
    { value: '🕊️', label: 'Dove', category: 'peace' },
    { value: '🌸', label: 'Cherry Blossom', category: 'nature' },
    { value: '🌺', label: 'Hibiscus', category: 'nature' },
    { value: '👑', label: 'Crown', category: 'royalty' },
    { value: '💌', label: 'Love Letter', category: 'love' },
    { value: '🚀', label: 'Rocket', category: 'future' }
  ];

  // Predefined Color Swatches for Color Picker
  const PRESET_COLOR_SWATCHES = [
    '#ff4d6d', '#f72585', '#7209b7', '#3a0ca3',
    '#4361ee', '#4cc9f0', '#2ec4b6', '#ffb703',
    '#fb8500', '#e63946', '#ffffff', '#1f2937'
  ];

  // DOM node creation helper that works in Browser and Node mock DOM
  function createEl(tagName, attributes = {}, innerHtml = '') {
    if (typeof document === 'undefined') {
      return null;
    }
    const el = document.createElement(tagName);
    Object.keys(attributes).forEach(attr => {
      if (attr === 'className') {
        el.className = attributes[attr];
      } else if (attr === 'style' && typeof attributes[attr] === 'object') {
        Object.assign(el.style, attributes[attr]);
      } else if (attr.startsWith('on') && typeof attributes[attr] === 'function') {
        const eventName = attr.substring(2).toLowerCase();
        el.addEventListener(eventName, attributes[attr]);
      } else if (attributes[attr] !== null && attributes[attr] !== undefined) {
        el.setAttribute(attr, attributes[attr]);
      }
    });
    if (innerHtml) {
      el.innerHTML = innerHtml;
    }
    return el;
  }

  // ---------------------------------------------------------------------------
  // 1. CENTRALIZED FIELD RENDERER OBJECT
  // ---------------------------------------------------------------------------
  const WishMagicFieldRenderer = {
    version: RENDERER_VERSION,

    /**
     * Map of active listeners & cleanup functions per DOM element
     */
    _cleanups: new WeakMap(),

    /**
     * Core Validation API
     * Validates any field value against defined schema rules.
     *
     * @param {Object} field - Field configuration object
     * @param {*} value - Field value to validate
     * @returns {Object} { valid: boolean, errors: Array<string>, code?: string }
     */
    validate(field, value) {
      if (!field || typeof field !== 'object') {
        return { valid: true, errors: [] };
      }

      const errors = [];
      let firstCode = null;

      function addError(code, message) {
        if (!firstCode) firstCode = code;
        errors.push(message);
      }

      const fieldIdentifier = field.label || field.key || field.id || 'Field';
      const isRequired = field.required === true;
      const isEmpty = value === undefined || value === null || value === '' ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);

      // 1. Required Check
      if (isRequired && isEmpty) {
        addError('REQUIRED', `${fieldIdentifier} is required`);
        return { valid: false, errors, code: firstCode };
      }

      // If empty and not required, skip further value validations
      if (isEmpty) {
        return { valid: true, errors: [] };
      }

      const strVal = String(value).trim();
      const constraints = field.constraints || {};

      // 2. Text & Textarea Bounds
      const rawMinLength = field.minlength !== undefined && field.minlength !== null ? field.minlength :
        (field.minLength !== undefined && field.minLength !== null ? field.minLength :
        (constraints.minLength !== undefined ? constraints.minLength : constraints.minlength));
      const minlength = rawMinLength !== undefined && rawMinLength !== null ? parseInt(rawMinLength, 10) : null;

      const rawMaxLength = field.maxlength !== undefined && field.maxlength !== null ? field.maxlength :
        (field.maxLength !== undefined && field.maxLength !== null ? field.maxLength :
        (constraints.maxLength !== undefined ? constraints.maxLength : constraints.maxlength));
      const maxlength = rawMaxLength !== undefined && rawMaxLength !== null ? parseInt(rawMaxLength, 10) : null;

      if (minlength !== null && !isNaN(minlength) && strVal.length < minlength) {
        addError('MIN_LENGTH', `${fieldIdentifier} must be at least ${minlength} characters`);
      }

      if (maxlength !== null && !isNaN(maxlength) && strVal.length > maxlength) {
        addError('MAX_LENGTH', `${fieldIdentifier} cannot exceed ${maxlength} characters`);
      }

      // 3. Number & Range Bounds
      if (field.type === 'number' || field.type === 'range') {
        const numVal = Number(value);
        if (isNaN(numVal)) {
          addError('INVALID_NUMBER', `${fieldIdentifier} must be a valid number`);
        } else {
          const rawMin = field.min !== undefined && field.min !== null ? field.min : constraints.min;
          const rawMax = field.max !== undefined && field.max !== null ? field.max : constraints.max;
          if (rawMin !== undefined && rawMin !== null && !isNaN(Number(rawMin)) && numVal < Number(rawMin)) {
            addError('MIN_VALUE', `${fieldIdentifier} must be at least ${rawMin}`);
          }
          if (rawMax !== undefined && rawMax !== null && !isNaN(Number(rawMax)) && numVal > Number(rawMax)) {
            addError('MAX_VALUE', `${fieldIdentifier} cannot exceed ${rawMax}`);
          }
        }
      }

      // 4. Pattern Regex
      const patternVal = field.pattern || constraints.pattern;
      if (patternVal) {
        try {
          const regex = new RegExp(patternVal);
          if (!regex.test(strVal)) {
            addError('PATTERN_MISMATCH', `${fieldIdentifier} format is invalid`);
          }
        } catch (e) {
          // Ignore bad regex in template
        }
      }

      // 5. Specialized Field Type Formats
      if (field.type === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(strVal)) {
          addError('INVALID_EMAIL', 'Please enter a valid email address');
        }
      } else if (field.type === 'url') {
        let isValidUrl = false;
        try {
          if (typeof URL === 'function' && URL.prototype) {
            const parsed = new URL(strVal);
            isValidUrl = ['http:', 'https:'].includes(parsed.protocol);
          } else {
            isValidUrl = /^(https?:\/\/)[^\s/$.?#].[^\s]*$/i.test(strVal);
          }
        } catch (e) {
          isValidUrl = false;
        }
        if (!isValidUrl) {
          addError('INVALID_URL', 'Please enter a valid web link (URL)');
        }
      } else if (field.type === 'phone') {
        const cleanPhone = strVal.replace(/[\s\-().+]/g, '');
        if (cleanPhone.length < 5 || cleanPhone.length > 16 || !/^\d+$/.test(cleanPhone)) {
          addError('INVALID_PHONE', 'Please enter a valid phone number');
        }
      } else if (field.type === 'date') {
        const dateMatch = /^\d{4}-\d{2}-\d{2}$/.test(strVal);
        const parsedTime = Date.parse(strVal);
        if (!dateMatch || isNaN(parsedTime)) {
          addError('INVALID_DATE', 'Please enter a valid date in YYYY-MM-DD format');
        }
      } else if (field.type === 'datetime') {
        const dtMatch = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(strVal);
        if (!dtMatch || isNaN(Date.parse(strVal))) {
          addError('INVALID_DATETIME', 'Please enter a valid date and time');
        }
      } else if (field.type === 'time') {
        const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/.test(strVal);
        if (!timeMatch) {
          addError('INVALID_TIME', 'Please enter a valid time (HH:mm)');
        }
      } else if (field.type === 'color') {
        const hexMatch = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(strVal);
        const rgbMatch = /^rgba?\(/.test(strVal);
        if (!hexMatch && !rgbMatch) {
          addError('INVALID_COLOR', 'Please provide a valid color hex code (e.g. #ff4d6d)');
        }
      } else if (field.type === 'select') {
        if (Array.isArray(field.options) && field.options.length > 0) {
          const allowed = field.options.map(opt => typeof opt === 'object' && opt !== null ? opt.value : String(opt));
          if (!allowed.includes(strVal)) {
            addError('INVALID_OPTION', `Selected option is not in declared choices`);
          }
        }
      } else if (field.type === 'multiselect') {
        if (Array.isArray(value) && Array.isArray(field.options) && field.options.length > 0) {
          const allowed = field.options.map(opt => typeof opt === 'object' && opt !== null ? opt.value : String(opt));
          const hasInvalid = value.some(v => !allowed.includes(String(v)));
          if (hasInvalid) {
            addError('INVALID_OPTION', `One or more selected options are invalid`);
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        code: firstCode || null
      };
    },

    /**
     * Render a complete customizer field container
     *
     * @param {Object} field - Schema field definition
     * @param {Object|*} state - Current field value or full state object { value, disabled, visible, error }
     * @param {Function} onChange - Change handler callback (key, value, field)
     * @param {Object} [options] - Additional render options
     * @returns {HTMLElement|string} Field DOM element or HTML string
     */
    render(field, state, onChange, options = {}) {
      if (!field || typeof field !== 'object') {
        return '';
      }

      const isBrowser = typeof document !== 'undefined';
      const fieldKey = field.key || field.id;
      const fieldType = (field.type || 'text').toLowerCase();
      const rawVal = (state && typeof state === 'object' && 'value' in state) ? state.value : state;
      const initialVal = rawVal !== undefined && rawVal !== null ? rawVal : (field.defaultValue !== undefined ? field.defaultValue : '');
      const isVisible = state && typeof state === 'object' && state.visible !== undefined ? state.visible : true;
      const isDisabled = state && typeof state === 'object' && state.disabled !== undefined ? state.disabled : false;
      const initialError = state && typeof state === 'object' && state.error ? state.error : '';

      const labelText = (state && typeof state === 'object' && state.dynamicLabel) || field.label || (fieldKey ? fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Field');
      const descText = (state && typeof state === 'object' && state.dynamicDescription) || field.description || '';
      const isRequired = field.required === true || (state && typeof state === 'object' && state.required === true);

      // Browser DOM Rendering
      if (isBrowser) {
        const container = createEl('div', {
          className: `wm-field-group wm-field-${fieldType} ${!isVisible ? 'wm-field-hidden' : ''} ${isDisabled ? 'wm-field-disabled' : ''}`,
          'data-field-key': fieldKey,
          'data-field-type': fieldType,
          style: {
            display: isVisible ? 'block' : 'none',
            marginBottom: '1rem',
            position: 'relative'
          }
        });

        // Label Header with optional required star & help tooltip
        const labelRow = createEl('div', {
          className: 'wm-field-header',
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }
        });

        const label = createEl('label', {
          className: 'wm-field-label block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider',
          htmlFor: `wm-ctrl-${fieldKey}`
        });
        label.textContent = labelText;

        if (isRequired) {
          const star = createEl('span', { className: 'wm-required-star text-rose-500 font-bold ml-1' });
          star.textContent = '*';
          label.appendChild(star);
        }
        labelRow.appendChild(label);

        // Character Counter / Value Indicator in header for text/textarea/range
        const countBadge = createEl('span', {
          className: 'wm-field-count-badge text-[11px] text-slate-400 font-mono hidden'
        });
        labelRow.appendChild(countBadge);

        container.appendChild(labelRow);

        // Optional Description text
        if (descText) {
          const descEl = createEl('p', {
            className: 'wm-field-description text-xs text-slate-500 dark:text-slate-400 mb-2 leading-relaxed'
          });
          descEl.textContent = descText;
          container.appendChild(descEl);
        }

        // Control Wrapper
        const ctrlWrap = createEl('div', { className: 'wm-field-control-wrapper relative' });

        // Dispatch change helper
        const triggerChange = (newVal) => {
          this._updateCharCounter(container, field, newVal);
          if (typeof onChange === 'function') {
            onChange(fieldKey, newVal, field);
          }
        };

        // Render Type-Specific Control
        const controlEl = this._renderTypeControl(field, initialVal, isDisabled, triggerChange, countBadge);
        if (controlEl) {
          ctrlWrap.appendChild(controlEl);
        }
        container.appendChild(ctrlWrap);

        // Error Message Box
        const errorEl = createEl('div', {
          className: `wm-field-error text-xs text-rose-600 dark:text-rose-400 mt-1.5 flex items-center gap-1 ${!initialError ? 'hidden' : ''}`,
          role: 'alert'
        });
        errorEl.innerHTML = `<svg class="w-3.5 h-3.5 inline shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg><span class="wm-error-text">${escapeHtml(initialError)}</span>`;
        container.appendChild(errorEl);

        // Initialize Char Counter
        this._updateCharCounter(container, field, initialVal);

        return container;
      }

      // Fallback SSR / String Template representation
      return this._renderHtmlString(field, initialVal, isVisible, isDisabled, initialError, labelText, descText, isRequired);
    },

    /**
     * Render Type-Specific DOM controls
     */
    _renderTypeControl(field, value, isDisabled, onChange, countBadge) {
      const fieldKey = field.key || field.id;
      const type = (field.type || 'text').toLowerCase();

      switch (type) {
        case 'textarea': {
          const textarea = createEl('textarea', {
            id: `wm-ctrl-${fieldKey}`,
            name: fieldKey,
            className: 'wm-input wm-textarea w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition resize-y min-h-[90px]',
            placeholder: field.placeholder || 'Enter your message...',
            rows: 3
          });
          if (field.maxLength || field.maxlength) {
            textarea.setAttribute('maxlength', field.maxLength || field.maxlength);
          }
          if (field.minlength) {
            textarea.setAttribute('minlength', field.minlength);
          }
          if (isDisabled) textarea.disabled = true;
          textarea.value = value !== undefined && value !== null ? String(value) : '';

          textarea.addEventListener('input', (e) => onChange(e.target.value));
          return textarea;
        }

        case 'toggle': {
          const isChecked = value === true || value === 'true' || value === 1 || value === '1';
          const toggleWrap = createEl('div', { className: 'flex items-center gap-3 py-1' });

          const switchBtn = createEl('button', {
            type: 'button',
            id: `wm-ctrl-${fieldKey}`,
            role: 'switch',
            'aria-checked': isChecked ? 'true' : 'false',
            className: `relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${isChecked ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`
          });

          const knob = createEl('span', {
            className: `pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isChecked ? 'translate-x-5' : 'translate-x-0'}`
          });
          switchBtn.appendChild(knob);

          const statusText = createEl('span', {
            className: 'text-xs font-medium text-slate-600 dark:text-slate-300'
          });
          statusText.textContent = isChecked ? 'Enabled' : 'Disabled';

          if (!isDisabled) {
            switchBtn.addEventListener('click', () => {
              const nextVal = switchBtn.getAttribute('aria-checked') !== 'true';
              switchBtn.setAttribute('aria-checked', nextVal ? 'true' : 'false');
              if (nextVal) {
                switchBtn.classList.remove('bg-slate-300', 'dark:bg-slate-700');
                switchBtn.classList.add('bg-amber-500');
                knob.classList.remove('translate-x-0');
                knob.classList.add('translate-x-5');
                statusText.textContent = 'Enabled';
              } else {
                switchBtn.classList.remove('bg-amber-500');
                switchBtn.classList.add('bg-slate-300', 'dark:bg-slate-700');
                knob.classList.remove('translate-x-5');
                knob.classList.add('translate-x-0');
                statusText.textContent = 'Disabled';
              }
              onChange(nextVal);
            });
          }

          toggleWrap.appendChild(switchBtn);
          toggleWrap.appendChild(statusText);
          return toggleWrap;
        }

        case 'range': {
          const min = field.min !== undefined && field.min !== null ? Number(field.min) : 0;
          const max = field.max !== undefined && field.max !== null ? Number(field.max) : 100;
          const step = field.step !== undefined && field.step !== null ? Number(field.step) : 1;
          const currentNum = value !== undefined && value !== null && !isNaN(Number(value)) ? Number(value) : min;

          const rangeWrap = createEl('div', { className: 'space-y-2' });
          const sliderRow = createEl('div', { className: 'flex items-center gap-3' });

          const rangeInput = createEl('input', {
            type: 'range',
            id: `wm-ctrl-${fieldKey}`,
            name: fieldKey,
            min: String(min),
            max: String(max),
            step: String(step),
            value: String(currentNum),
            className: 'w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500'
          });
          if (isDisabled) rangeInput.disabled = true;

          const badge = createEl('span', {
            className: 'inline-flex items-center justify-center px-2.5 py-1 text-xs font-mono font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-lg border border-amber-200 dark:border-amber-800/60 min-w-[3rem]'
          });
          badge.textContent = String(currentNum);

          rangeInput.addEventListener('input', (e) => {
            const val = Number(e.target.value);
            badge.textContent = String(val);
            onChange(val);
          });

          sliderRow.appendChild(rangeInput);
          sliderRow.appendChild(badge);
          rangeWrap.appendChild(sliderRow);

          const boundsRow = createEl('div', {
            className: 'flex justify-between text-[11px] text-slate-400 font-mono px-0.5'
          });
          boundsRow.innerHTML = `<span>${min}</span><span>${max}</span>`;
          rangeWrap.appendChild(boundsRow);

          return rangeWrap;
        }

        case 'number': {
          const min = field.min !== undefined && field.min !== null ? Number(field.min) : null;
          const max = field.max !== undefined && field.max !== null ? Number(field.max) : null;
          const step = field.step !== undefined && field.step !== null ? Number(field.step) : 1;

          const numWrap = createEl('div', { className: 'flex items-center gap-2' });

          const decBtn = createEl('button', {
            type: 'button',
            className: 'w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition select-none disabled:opacity-40',
            innerHTML: '&minus;'
          });

          const numInput = createEl('input', {
            type: 'number',
            id: `wm-ctrl-${fieldKey}`,
            name: fieldKey,
            value: value !== undefined && value !== null ? String(value) : '',
            step: String(step),
            className: 'wm-input flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm text-center font-mono focus:ring-2 focus:ring-amber-500 outline-none'
          });
          if (min !== null) numInput.min = String(min);
          if (max !== null) numInput.max = String(max);
          if (isDisabled) {
            numInput.disabled = true;
            decBtn.disabled = true;
          }

          const incBtn = createEl('button', {
            type: 'button',
            className: 'w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition select-none disabled:opacity-40',
            innerHTML: '&plus;'
          });
          if (isDisabled) incBtn.disabled = true;

          decBtn.addEventListener('click', () => {
            const current = Number(numInput.value || 0);
            let next = current - step;
            if (min !== null && next < min) next = min;
            numInput.value = String(next);
            onChange(next);
          });

          incBtn.addEventListener('click', () => {
            const current = Number(numInput.value || 0);
            let next = current + step;
            if (max !== null && next > max) next = max;
            numInput.value = String(next);
            onChange(next);
          });

          numInput.addEventListener('input', (e) => {
            const parsed = e.target.value === '' ? '' : Number(e.target.value);
            onChange(parsed);
          });

          numWrap.appendChild(decBtn);
          numWrap.appendChild(numInput);
          numWrap.appendChild(incBtn);
          return numWrap;
        }

        case 'color': {
          const colorWrap = createEl('div', { className: 'space-y-2' });
          const hexVal = (value || '#ff4d6d').toString();

          const pickerRow = createEl('div', { className: 'flex items-center gap-3' });

          const previewSwatch = createEl('div', {
            className: 'w-10 h-10 rounded-xl border-2 border-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 shrink-0 relative overflow-hidden cursor-pointer',
            style: { backgroundColor: hexVal }
          });

          const hiddenNativePicker = createEl('input', {
            type: 'color',
            value: hexVal.startsWith('#') && hexVal.length === 7 ? hexVal : '#ff4d6d',
            className: 'opacity-0 absolute inset-0 w-full h-full cursor-pointer'
          });
          previewSwatch.appendChild(hiddenNativePicker);

          const hexInput = createEl('input', {
            type: 'text',
            id: `wm-ctrl-${fieldKey}`,
            name: fieldKey,
            value: hexVal,
            placeholder: '#ff4d6d',
            maxLength: 9,
            className: 'wm-input flex-1 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm font-mono uppercase focus:ring-2 focus:ring-amber-500 outline-none'
          });

          if (isDisabled) {
            hiddenNativePicker.disabled = true;
            hexInput.disabled = true;
          }

          hiddenNativePicker.addEventListener('input', (e) => {
            const col = e.target.value;
            previewSwatch.style.backgroundColor = col;
            hexInput.value = col;
            onChange(col);
          });

          hexInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(val)) {
              previewSwatch.style.backgroundColor = val;
              hiddenNativePicker.value = val.length === 4 ? `#${val[1]}${val[1]}${val[2]}${val[2]}${val[3]}${val[3]}` : val;
            }
            onChange(val);
          });

          pickerRow.appendChild(previewSwatch);
          pickerRow.appendChild(hexInput);
          colorWrap.appendChild(pickerRow);

          // Preset Swatches Grid
          const swatchesRow = createEl('div', { className: 'flex items-center gap-1.5 flex-wrap pt-1' });
          PRESET_COLOR_SWATCHES.forEach(swatchColor => {
            const btn = createEl('button', {
              type: 'button',
              className: 'w-6 h-6 rounded-lg border border-black/10 dark:border-white/10 shadow-xs hover:scale-110 active:scale-95 transition transform',
              style: { backgroundColor: swatchColor }
            });
            btn.addEventListener('click', () => {
              previewSwatch.style.backgroundColor = swatchColor;
              hexInput.value = swatchColor;
              hiddenNativePicker.value = swatchColor;
              onChange(swatchColor);
            });
            swatchesRow.appendChild(btn);
          });
          colorWrap.appendChild(swatchesRow);

          return colorWrap;
        }

        case 'font': {
          const fontWrap = createEl('div', { className: 'space-y-2' });
          const currentFont = String(value || PRESET_FONTS[0].value);

          const selectEl = createEl('select', {
            id: `wm-ctrl-${fieldKey}`,
            name: fieldKey,
            className: 'wm-input w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:ring-2 focus:ring-amber-500 outline-none'
          });
          if (isDisabled) selectEl.disabled = true;

          const previewCard = createEl('div', {
            className: 'p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-center text-lg text-slate-800 dark:text-slate-100 transition duration-150',
            style: { fontFamily: currentFont }
          });
          previewCard.textContent = 'Preview: Happy Birthday & Warmest Wishes!';

          PRESET_FONTS.forEach(f => {
            const opt = createEl('option', { value: f.value });
            opt.textContent = f.label;
            if (f.value === currentFont) opt.selected = true;
            selectEl.appendChild(opt);
          });

          selectEl.addEventListener('change', (e) => {
            const chosen = e.target.value;
            previewCard.style.fontFamily = chosen;
            onChange(chosen);
          });

          fontWrap.appendChild(selectEl);
          fontWrap.appendChild(previewCard);
          return fontWrap;
        }

        case 'icon': {
          const iconWrap = createEl('div', { className: 'space-y-2' });
          const currentIcon = String(value || PRESET_ICONS[0].value);

          const searchInput = createEl('input', {
            type: 'text',
            placeholder: 'Search emoji / icon...',
            className: 'w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 outline-none mb-1'
          });

          const grid = createEl('div', {
            className: 'grid grid-cols-8 gap-1.5 p-2 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 max-h-36 overflow-y-auto'
          });

          const renderGridItems = (filterText = '') => {
            grid.innerHTML = '';
            PRESET_ICONS.filter(item => !filterText || item.label.toLowerCase().includes(filterText.toLowerCase()) || item.category.includes(filterText.toLowerCase()))
              .forEach(item => {
                const btn = createEl('button', {
                  type: 'button',
                  className: `w-8 h-8 rounded-lg flex items-center justify-center text-lg transition hover:scale-125 ${item.value === currentIcon ? 'bg-amber-100 dark:bg-amber-900/40 ring-2 ring-amber-500' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`
                });
                btn.textContent = item.value;
                btn.title = item.label;

                btn.addEventListener('click', () => {
                  Array.from(grid.children).forEach(c => c.classList.remove('bg-amber-100', 'dark:bg-amber-900/40', 'ring-2', 'ring-amber-500'));
                  btn.classList.add('bg-amber-100', 'dark:bg-amber-900/40', 'ring-2', 'ring-amber-500');
                  onChange(item.value);
                });
                grid.appendChild(btn);
              });
          };

          searchInput.addEventListener('input', (e) => renderGridItems(e.target.value));
          renderGridItems();

          iconWrap.appendChild(searchInput);
          iconWrap.appendChild(grid);
          return iconWrap;
        }

        case 'multiselect': {
          const multiWrap = createEl('div', { className: 'space-y-2' });
          const selectedVals = new Set(Array.isArray(value) ? value : (value ? [value] : []));
          const options = Array.isArray(field.options) ? field.options : [];

          const chipsContainer = createEl('div', { className: 'flex flex-wrap gap-1.5' });

          const updateChips = () => {
            chipsContainer.innerHTML = '';
            options.forEach(opt => {
              const optVal = typeof opt === 'object' && opt !== null ? opt.value : opt;
              const optLabel = typeof opt === 'object' && opt !== null ? (opt.label || opt.value) : opt;
              const isSelected = selectedVals.has(optVal);

              const chip = createEl('button', {
                type: 'button',
                className: `px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer border ${isSelected ? 'bg-amber-500 text-white border-amber-500 shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'}`
              });
              chip.textContent = optLabel;

              chip.addEventListener('click', () => {
                if (selectedVals.has(optVal)) {
                  selectedVals.delete(optVal);
                } else {
                  selectedVals.add(optVal);
                }
                updateChips();
                onChange(Array.from(selectedVals));
              });

              chipsContainer.appendChild(chip);
            });
          };

          // Action Toolbar: Select All / Clear
          const toolbar = createEl('div', { className: 'flex justify-between items-center text-[11px] text-amber-600 dark:text-amber-400 font-medium' });
          const selectAllBtn = createEl('button', { type: 'button', className: 'hover:underline', textContent: 'Select All' });
          selectAllBtn.addEventListener('click', () => {
            options.forEach(opt => selectedVals.add(typeof opt === 'object' ? opt.value : opt));
            updateChips();
            onChange(Array.from(selectedVals));
          });
          const clearBtn = createEl('button', { type: 'button', className: 'hover:underline text-slate-400 hover:text-slate-600', textContent: 'Clear' });
          clearBtn.addEventListener('click', () => {
            selectedVals.clear();
            updateChips();
            onChange([]);
          });
          toolbar.appendChild(selectAllBtn);
          toolbar.appendChild(clearBtn);

          updateChips();
          multiWrap.appendChild(toolbar);
          multiWrap.appendChild(chipsContainer);
          return multiWrap;
        }

        case 'select': {
          const selectEl = createEl('select', {
            id: `wm-ctrl-${fieldKey}`,
            name: fieldKey,
            className: 'wm-input w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:ring-2 focus:ring-amber-500 outline-none'
          });
          if (isDisabled) selectEl.disabled = true;

          const options = Array.isArray(field.options) ? field.options : [];
          options.forEach(opt => {
            const optVal = typeof opt === 'object' && opt !== null ? opt.value : opt;
            const optLabel = typeof opt === 'object' && opt !== null ? (opt.label || opt.value) : opt;
            const optionNode = createEl('option', { value: String(optVal) });
            optionNode.textContent = String(optLabel);
            if (String(optVal) === String(value)) {
              optionNode.selected = true;
            }
            selectEl.appendChild(optionNode);
          });

          selectEl.addEventListener('change', (e) => onChange(e.target.value));
          return selectEl;
        }

        case 'image':
        case 'image-multiple':
        case 'video':
        case 'video-multiple':
        case 'audio':
        case 'voice': {
          // Delegate to Media System if present, or render media slot card
          const mediaWrap = createEl('div', { className: 'wm-media-slot-container' });
          if (global.WishMagicMedia && typeof global.WishMagicMedia.renderSlotCard === 'function') {
            const slotCard = global.WishMagicMedia.renderSlotCard(field, value, onChange);
            if (slotCard) {
              mediaWrap.appendChild(slotCard);
              return mediaWrap;
            }
          }
          // Default media fallback card
          const placeholderBox = createEl('div', {
            className: 'border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-4 text-center bg-slate-50 dark:bg-slate-800/40 hover:border-amber-400 transition cursor-pointer'
          });
          placeholderBox.innerHTML = `<div class="text-xs font-medium text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">${type} slot: ${escapeHtml(field.label || fieldKey)}</div><div class="text-[11px] text-slate-400">Click or Drag to Upload</div>`;
          mediaWrap.appendChild(placeholderBox);
          return mediaWrap;
        }

        // Standard Textual Input (text, date, time, datetime, email, phone, url)
        default: {
          const input = createEl('input', {
            type: ['date', 'time', 'datetime-local', 'email', 'tel', 'url', 'password'].includes(type) ?
              (type === 'datetime' ? 'datetime-local' : (type === 'phone' ? 'tel' : type)) : 'text',
            id: `wm-ctrl-${fieldKey}`,
            name: fieldKey,
            value: value !== undefined && value !== null ? String(value) : '',
            placeholder: field.placeholder || `Enter ${field.label || fieldKey}...`,
            className: 'wm-input w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition'
          });

          if (field.maxLength || field.maxlength) {
            input.setAttribute('maxlength', field.maxLength || field.maxlength);
          }
          if (field.minlength) {
            input.setAttribute('minlength', field.minlength);
          }
          if (field.pattern) {
            input.setAttribute('pattern', field.pattern);
          }
          if (isDisabled) input.disabled = true;

          input.addEventListener('input', (e) => onChange(e.target.value));
          return input;
        }
      }
    },

    /**
     * Update dynamic character count badge
     */
    _updateCharCounter(container, field, value) {
      if (!container) return;
      const countBadge = container.querySelector('.wm-field-count-badge');
      if (!countBadge) return;

      const maxlength = field.maxlength !== undefined && field.maxlength !== null ? parseInt(field.maxlength, 10) :
        (field.maxLength !== undefined && field.maxLength !== null ? parseInt(field.maxLength, 10) : null);
      const minlength = field.minlength !== undefined && field.minlength !== null ? parseInt(field.minlength, 10) : null;

      if (maxlength !== null || minlength !== null) {
        const len = String(value || '').length;
        countBadge.classList.remove('hidden');
        if (maxlength !== null) {
          countBadge.textContent = `${len} / ${maxlength}`;
          if (len > maxlength) {
            countBadge.classList.add('text-rose-500', 'font-bold');
            countBadge.classList.remove('text-slate-400');
          } else {
            countBadge.classList.remove('text-rose-500', 'font-bold');
            countBadge.classList.add('text-slate-400');
          }
        } else if (minlength !== null) {
          countBadge.textContent = `${len} (min ${minlength})`;
        }
      } else {
        countBadge.classList.add('hidden');
      }
    },

    /**
     * Update an existing rendered field DOM element in-place
     *
     * @param {Object} field - Schema field definition
     * @param {Object|*} state - New state object or value
     * @param {HTMLElement} domElement - Container element
     */
    update(field, state, domElement) {
      if (!domElement || typeof domElement !== 'object') return;

      const val = (state && typeof state === 'object' && 'value' in state) ? state.value : state;
      const isVisible = state && typeof state === 'object' && state.visible !== undefined ? state.visible : true;
      const isDisabled = state && typeof state === 'object' && state.disabled !== undefined ? state.disabled : false;
      const errorMsg = state && typeof state === 'object' && state.error ? state.error : '';

      // 1. Visibility toggle
      domElement.style.display = isVisible ? 'block' : 'none';
      if (!isVisible) {
        domElement.classList.add('wm-field-hidden');
      } else {
        domElement.classList.remove('wm-field-hidden');
      }

      // 2. Disabled toggle
      if (isDisabled) {
        domElement.classList.add('wm-field-disabled');
      } else {
        domElement.classList.remove('wm-field-disabled');
      }

      // 3. Dynamic Label & Description
      if (state && typeof state === 'object' && state.dynamicLabel) {
        const labelEl = domElement.querySelector('.wm-field-label');
        if (labelEl) {
          labelEl.childNodes[0].nodeValue = state.dynamicLabel;
        }
      }
      if (state && typeof state === 'object' && state.dynamicDescription) {
        let descEl = domElement.querySelector('.wm-field-description');
        if (descEl) {
          descEl.textContent = state.dynamicDescription;
        }
      }

      // 4. Update Interactive Inputs without losing focus
      const inputEl = domElement.querySelector(`input, textarea, select, [role="switch"]`);
      if (inputEl) {
        if (inputEl.getAttribute('role') === 'switch') {
          const isChecked = val === true || val === 'true' || val === 1 || val === '1';
          inputEl.setAttribute('aria-checked', isChecked ? 'true' : 'false');
          const knob = inputEl.querySelector('span');
          if (knob) {
            if (isChecked) {
              inputEl.classList.remove('bg-slate-300', 'dark:bg-slate-700');
              inputEl.classList.add('bg-amber-500');
              knob.classList.remove('translate-x-0');
              knob.classList.add('translate-x-5');
            } else {
              inputEl.classList.remove('bg-amber-500');
              inputEl.classList.add('bg-slate-300', 'dark:bg-slate-700');
              knob.classList.remove('translate-x-5');
              knob.classList.add('translate-x-0');
            }
          }
        } else if (inputEl.type === 'checkbox') {
          inputEl.checked = Boolean(val);
        } else if (inputEl.type === 'range') {
          inputEl.value = val !== undefined && val !== null ? String(val) : '0';
          const badge = domElement.querySelector('.wm-field-control-wrapper span');
          if (badge) badge.textContent = String(val || 0);
        } else if (document.activeElement !== inputEl) {
          // Only sync value if user is not actively typing to avoid cursor jumping
          if (val !== undefined && val !== null && inputEl.value !== String(val)) {
            inputEl.value = String(val);
          }
        }

        if (isDisabled) {
          inputEl.setAttribute('disabled', 'true');
        } else {
          inputEl.removeAttribute('disabled');
        }
      }

      // 5. Update Error Presentation
      const errorBox = domElement.querySelector('.wm-field-error');
      const errText = domElement.querySelector('.wm-error-text');
      if (errorBox) {
        if (errorMsg) {
          errorBox.classList.remove('hidden');
          if (errText) errText.textContent = errorMsg;
          if (inputEl) {
            inputEl.setAttribute('aria-invalid', 'true');
            inputEl.classList.add('border-rose-500', 'focus:ring-rose-500');
            inputEl.classList.remove('border-slate-300', 'focus:ring-amber-500');
          }
        } else {
          errorBox.classList.add('hidden');
          if (inputEl) {
            inputEl.removeAttribute('aria-invalid');
            inputEl.classList.remove('border-rose-500', 'focus:ring-rose-500');
            inputEl.classList.add('border-slate-300', 'focus:ring-amber-500');
          }
        }
      }

      // 6. Update Character Counter
      this._updateCharCounter(domElement, field, val);
    },

    /**
     * Focus interactive control inside field container
     *
     * @param {Object} field - Schema field definition
     * @param {HTMLElement} domElement - Field container
     */
    focus(field, domElement) {
      if (!domElement) return;
      const target = domElement.querySelector(`input, textarea, select, button[role="switch"], button`);
      if (target && typeof target.focus === 'function') {
        target.focus();
      }
    },

    /**
     * Smoothly scroll field container into view and trigger highlight
     *
     * @param {Object} field - Schema field definition
     * @param {HTMLElement} domElement - Field container
     * @param {Object} [options] - Scroll options
     */
    scrollTo(field, domElement, options = {}) {
      if (!domElement) return;

      if (typeof domElement.scrollIntoView === 'function') {
        domElement.scrollIntoView({
          behavior: options.behavior || 'smooth',
          block: options.block || 'center'
        });
      }

      // Add brief pulse/shake highlight animation
      domElement.classList.add('wm-field-highlight');
      setTimeout(() => {
        domElement.classList.remove('wm-field-highlight');
      }, 1500);

      this.focus(field, domElement);
    },

    /**
     * Clean up and destroy field container
     */
    destroy(field, domElement) {
      if (domElement) {
        if (domElement.parentNode) {
          domElement.parentNode.removeChild(domElement);
        }
      }
    },

    /**
     * Fallback String Renderer for Server/Testing Environments
     */
    _renderHtmlString(field, value, isVisible, isDisabled, error, labelText, descText, isRequired) {
      const fieldKey = field.key || field.id;
      const fieldType = (field.type || 'text').toLowerCase();
      const escVal = escapeHtml(value);

      return `
        <div class="wm-field-group wm-field-${fieldType} ${!isVisible ? 'wm-field-hidden' : ''}"
             data-field-key="${escapeHtml(fieldKey)}"
             style="${!isVisible ? 'display:none;' : ''}">
          <div class="wm-field-header">
            <label class="wm-field-label font-semibold text-xs text-slate-700">${escapeHtml(labelText)}${isRequired ? '<span class="text-rose-500 font-bold ml-1">*</span>' : ''}</label>
          </div>
          ${descText ? `<p class="wm-field-description text-xs text-slate-500 mb-1">${escapeHtml(descText)}</p>` : ''}
          <div class="wm-field-control-wrapper">
            <input type="${fieldType === 'email' ? 'email' : 'text'}"
                   id="wm-ctrl-${escapeHtml(fieldKey)}"
                   name="${escapeHtml(fieldKey)}"
                   value="${escVal}"
                   class="wm-input w-full px-3 py-2 rounded-xl border border-slate-300"
                   ${isDisabled ? 'disabled' : ''} />
          </div>
          <div class="wm-field-error text-xs text-rose-600 ${!error ? 'hidden' : ''}" role="alert">
            <span class="wm-error-text">${escapeHtml(error)}</span>
          </div>
        </div>
      `.trim();
    }
  };

  // Expose global API
  if (typeof global !== 'undefined' && global) {
    global.WishMagicFieldRenderer = WishMagicFieldRenderer;
  }
  if (typeof window !== 'undefined' && window) {
    window.WishMagicFieldRenderer = WishMagicFieldRenderer;
  }
  if (typeof globalThis !== 'undefined' && globalThis) {
    globalThis.WishMagicFieldRenderer = WishMagicFieldRenderer;
  }

})(typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)));
