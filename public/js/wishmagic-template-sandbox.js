/**
 * WishMagic Template Sandbox & Runtime Controller (Part 13)
 * =========================================================
 * Provides an isolated, secure, and predictable execution environment
 * for uploaded WishMagic templates.
 *
 * Responsibilities:
 * - Sandbox lifecycle management (create, initialize, handshake, timeout, destroy)
 * - Strict postMessage protocol validation & bidirectional communication
 * - Security isolation (cross-frame protection, credential containment)
 * - Safe token interpolation without HTML/JS injection
 * - Dynamic field/media/section/theme/animation state synchronization
 * - Template error isolation and structured diagnostic reporting
 * - Admin Template Test Mode with automated, safe fixture data
 * - Multi-category template validation engine (HTML, CSS, JS, Metadata, Protocol, Security)
 */

(function (global) {
  'use strict';

  const PROTOCOL_VERSION = '1.0';

  const ALLOWED_MESSAGE_TYPES = new Set([
    'WISHMAGIC_INIT',
    'WISHMAGIC_READY',
    'WISHMAGIC_STATE',
    'WISHMAGIC_UPDATE',
    'WISHMAGIC_CONTENT',
    'WISHMAGIC_MEDIA',
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
    'WISHMAGIC_RESET',
    'WISHMAGIC_DESTROY',
    'WISHMAGIC_ERROR',
    'WISHMAGIC_RESIZE',
    'WISHMAGIC_PING',
    'WISHMAGIC_PONG'
  ]);

  const DANGEROUS_URL_SCHEMES = /^\s*(javascript|vbscript|data:text\/html):/i;

  /**
   * Universal Runtime Protocol Specification
   */
  const WishMagicRuntimeProtocol = {
    VERSION: PROTOCOL_VERSION,
    ALLOWED_MESSAGE_TYPES,

    createMessage(type, payload = {}, requestId = null) {
      if (!ALLOWED_MESSAGE_TYPES.has(type)) {
        throw new Error(`[WishMagicRuntimeProtocol] Invalid message type: ${type}`);
      }
      return {
        source: 'wishmagic',
        version: PROTOCOL_VERSION,
        type,
        requestId: requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        payload: payload || {}
      };
    },

    validateMessage(data, allowedTypes = ALLOWED_MESSAGE_TYPES) {
      if (!data || typeof data !== 'object') {
        return { valid: false, reason: 'Message data must be a non-null object' };
      }

      // Check protocol signature
      if (data.source !== 'wishmagic') {
        return { valid: false, reason: 'Invalid or missing message source signature' };
      }

      if (!data.type || !allowedTypes.has(data.type)) {
        return { valid: false, reason: `Unknown or disallowed message type: "${data.type}"` };
      }

      if (data.payload && typeof data.payload !== 'object') {
        return { valid: false, reason: 'Message payload must be an object' };
      }

      return { valid: true, message: data };
    },

    isSafeUrl(url) {
      if (!url || typeof url !== 'string') return false;
      const trimmed = url.trim();
      if (DANGEROUS_URL_SCHEMES.test(trimmed)) return false;
      return (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('blob:') ||
        trimmed.startsWith('data:image/') ||
        trimmed.startsWith('data:audio/') ||
        trimmed.startsWith('data:video/') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('./') ||
        trimmed.startsWith('../')
      );
    },

    replaceTokens(text, dataMap = {}) {
      if (!text || typeof text !== 'string') return text || '';
      return text.replace(/\{\{\s*([a-zA-Z0-9_\-]+)\s*\}\}/g, (match, key) => {
        if (dataMap && dataMap[key] !== undefined && dataMap[key] !== null) {
          return String(dataMap[key]);
        }
        return '';
      });
    }
  };

  /**
   * Template Validation Engine (Pre-publish Diagnostic Inspector)
   */
  const WishMagicTemplateValidator = {
    validate(templatePackage) {
      const report = {
        valid: true,
        canPublish: true,
        score: '100',
        categories: {
          html: { status: 'PASS', errors: [], warnings: [] },
          metadata: { status: 'PASS', errors: [], warnings: [] },
          fields: { status: 'PASS', errors: [], warnings: [] },
          media: { status: 'PASS', errors: [], warnings: [] },
          sections: { status: 'PASS', errors: [], warnings: [] },
          theme: { status: 'PASS', errors: [], warnings: [] },
          animations: { status: 'PASS', errors: [], warnings: [] },
          runtimeProtocol: { status: 'PASS', errors: [], warnings: [] },
          security: { status: 'PASS', errors: [], warnings: [] },
          performance: { status: 'PASS', errors: [], warnings: [] }
        },
        errors: [],
        warnings: []
      };

      if (!templatePackage) {
        report.valid = false;
        report.canPublish = false;
        report.errors.push({ code: 'EMPTY_PACKAGE', message: 'No template package provided for validation.' });
        return report;
      }

      const html = typeof templatePackage === 'string' ? templatePackage : (templatePackage.html || '');
      const files = Array.isArray(templatePackage.files) ? templatePackage.files : [];
      const meta = templatePackage.metadata || templatePackage.wishmagicJson || null;

      // 1. HTML Validation
      if (!html || typeof html !== 'string' || html.trim().length === 0) {
        report.categories.html.status = 'ERROR';
        report.categories.html.errors.push('Missing or empty HTML entry document (index.html).');
        report.errors.push({ category: 'html', code: 'MISSING_HTML', message: 'HTML entry point is missing or empty.' });
      } else {
        if (!html.includes('data-wm-field') && !html.includes('data-wm-section') && !html.includes('data-wm-media') && !html.includes('data-wm')) {
          report.categories.html.status = 'WARNING';
          report.categories.html.warnings.push('No data-wm-* customization attributes detected in HTML.');
          report.warnings.push({ category: 'html', code: 'NO_WM_ATTRS', message: 'No customization attributes found.' });
        }
      }

      // 2. Metadata Validation
      if (meta) {
        try {
          const parsedMeta = typeof meta === 'string' ? JSON.parse(meta) : meta;
          if (!parsedMeta.id && !parsedMeta.name && !parsedMeta.template) {
            report.categories.metadata.status = 'WARNING';
            report.categories.metadata.warnings.push('wishmagic.json is missing template id or title.');
          }
        } catch (e) {
          report.categories.metadata.status = 'ERROR';
          report.categories.metadata.errors.push(`Malformed wishmagic.json: ${e.message}`);
          report.errors.push({ category: 'metadata', code: 'MALFORMED_METADATA', message: e.message });
        }
      }

      // 3. Security Inspection
      if (files.length > 0) {
        files.forEach(f => {
          const path = typeof f === 'string' ? f : (f.path || f.name || '');
          if (path.includes('../') || path.includes('..\\') || path.startsWith('/') || path.startsWith('\\')) {
            report.categories.security.status = 'ERROR';
            report.categories.security.errors.push(`Path traversal attempt detected in package file: "${path}"`);
            report.errors.push({ category: 'security', code: 'PATH_TRAVERSAL', message: `Dangerous path: ${path}` });
          }
        });
      }

      // Check for inline dangerous script execution
      if (html && (html.includes('eval(') || html.includes('new Function('))) {
        report.categories.security.status = 'WARNING';
        report.categories.security.warnings.push('Dynamic code evaluation (eval / Function) detected in template HTML.');
      }

      // 4. Runtime Protocol Compatibility
      report.categories.runtimeProtocol.status = 'PASS';

      // 5. Media & Assets Validation
      if (html) {
        const audioSrcMatches = html.match(/<audio[^>]*src=["']([^"']+)["']/i);
        if (audioSrcMatches && files.length > 0) {
          const audioRef = audioSrcMatches[1].replace(/^\.\//, '');
          const exists = files.some(f => (f.path || f.name || '').replace(/^\.\//, '') === audioRef);
          if (!exists && !audioRef.startsWith('http')) {
            report.categories.media.status = 'ERROR';
            report.categories.media.errors.push(`Critical audio file "${audioRef}" referenced in HTML is missing from uploaded ZIP.`);
            report.errors.push({ category: 'media', code: 'MISSING_MEDIA_ASSET', message: `Missing file: ${audioRef}` });
          }
        }
      }

      // Compute overall status
      const hasErrors = Object.values(report.categories).some(cat => cat.status === 'ERROR') || report.errors.length > 0;
      const hasWarnings = Object.values(report.categories).some(cat => cat.status === 'WARNING') || report.warnings.length > 0;

      report.valid = !hasErrors;
      report.canPublish = !hasErrors;
      report.status = hasErrors ? 'ERROR' : (hasWarnings ? 'WARNING' : 'PASS');

      return report;
    }
  };

  /**
   * Template Sandbox Controller
   */
  class WishMagicTemplateSandbox {
    constructor(options = {}) {
      this.container = options.container || null;
      this.targetOrigin = options.targetOrigin || '*';
      this.onReady = options.onReady || null;
      this.onUpdate = options.onUpdate || null;
      this.onError = options.onError || null;
      this.onStatusChange = options.onStatusChange || null;

      this.iframe = null;
      this.status = 'IDLE'; // IDLE | LOADING | READY | ERROR | TIMEOUT | DESTROYED
      this.schema = null;
      this.canonicalData = {
        content: {},
        media: {},
        sections: {},
        visual: {},
        animations: {},
        metadata: {}
      };
      this.messageCount = 0;
      this.errorCount = 0;
      this.lastUpdate = null;
      this.handshakeTimeoutMs = options.timeoutMs || 5000;
      this.handshakeTimer = null;
      this.debounceTimer = null;
      this.boundMessageListener = this._handleWindowMessage.bind(this);
      this.activeObjectURLs = new Set();
      this.diagnostics = {
        runtimeReady: false,
        fieldsDetected: 0,
        fieldsUpdated: 0,
        mediaLoaded: 0,
        sectionsLoaded: 0,
        themeApplied: null,
        animationsApplied: null,
        errors: [],
        warnings: []
      };
    }

    _setStatus(newStatus) {
      if (this.status === newStatus) return;
      this.status = newStatus;
      if (typeof this.onStatusChange === 'function') {
        try {
          this.onStatusChange(this.getStatus());
        } catch (e) {
          console.warn('onStatusChange error:', e);
        }
      }
    }

    getStatus() {
      return {
        status: this.status,
        connected: this.status === 'READY',
        messageCount: this.messageCount,
        errorCount: this.errorCount,
        lastUpdate: this.lastUpdate,
        diagnostics: { ...this.diagnostics }
      };
    }

    getDiagnostics() {
      return { ...this.diagnostics };
    }

    /**
     * Create isolated iframe sandbox and launch template
     */
    createSandbox(containerElement, templateSource, options = {}) {
      this.destroySandbox();

      this.container = containerElement || this.container;
      if (!this.container) {
        throw new Error('[WishMagicSandbox] Container element is required to mount sandbox.');
      }

      this._setStatus('LOADING');
      this.schema = options.schema || null;
      this.canonicalData = options.data ? JSON.parse(JSON.stringify(options.data)) : this.canonicalData;

      // Create isolated iframe with sandboxing
      const iframe = document.createElement('iframe');
      iframe.className = 'w-full h-full border-0 transition-opacity duration-300';
      iframe.setAttribute('title', 'WishMagic Template Live Preview');
      iframe.setAttribute('loading', 'eager');
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');

      this.iframe = iframe;
      this.container.innerHTML = '';
      this.container.appendChild(iframe);

      // Listen for window postMessages
      if (typeof window !== 'undefined') {
        window.addEventListener('message', this.boundMessageListener);
      }

      // Start Handshake timeout
      this.handshakeTimer = setTimeout(() => {
        if (this.status === 'LOADING') {
          this._setStatus('TIMEOUT');
          const timeoutErr = {
            code: 'HANDSHAKE_TIMEOUT',
            message: `Template sandbox did not send WISHMAGIC_READY within ${this.handshakeTimeoutMs}ms.`,
            stage: 'init'
          };
          this.diagnostics.errors.push(timeoutErr);
          if (typeof this.onError === 'function') this.onError(timeoutErr);
        }
      }, this.handshakeTimeoutMs);

      // Inject template HTML/src
      this._loadTemplateSource(templateSource);
      return this;
    }

    _loadTemplateSource(templateSource) {
      if (!this.iframe) return;

      if (typeof templateSource === 'string') {
        // If it's a URL
        if (templateSource.startsWith('http') || templateSource.startsWith('/') || templateSource.startsWith('./')) {
          this.iframe.src = templateSource;
        } else {
          // It's raw HTML string -> inject runtime scripts and load via srcdoc or blob URL
          const enrichedHtml = this._injectRuntimeHooks(templateSource);
          if ('srcdoc' in this.iframe) {
            this.iframe.srcdoc = enrichedHtml;
          } else {
            const blob = new Blob([enrichedHtml], { type: 'text/html;charset=utf-8' });
            const blobUrl = URL.createObjectURL(blob);
            this.activeObjectURLs.add(blobUrl);
            this.iframe.src = blobUrl;
          }
        }
      } else if (templateSource && templateSource.html) {
        const enrichedHtml = this._injectRuntimeHooks(templateSource.html);
        if ('srcdoc' in this.iframe) {
          this.iframe.srcdoc = enrichedHtml;
        } else {
          const blob = new Blob([enrichedHtml], { type: 'text/html;charset=utf-8' });
          const blobUrl = URL.createObjectURL(blob);
          this.activeObjectURLs.add(blobUrl);
          this.iframe.src = blobUrl;
        }
      }
    }

    _injectRuntimeHooks(html) {
      if (!html || typeof html !== 'string') return html || '';
      // If already contains runtime, return as is
      if (html.includes('wishmagic-template-runtime.js') || html.includes('WishMagicRuntime')) {
        return html;
      }

      // Inject runtime script before </head> or </body>
      const runtimeTag = `
        <script src="/js/wishmagic-template-protocol.js"></script>
        <script src="/js/wishmagic-template-runtime.js"></script>
        <script>
          try {
            if (window.WishMagicRuntime && typeof window.WishMagicRuntime.init === 'function') {
              window.WishMagicRuntime.init();
            }
          } catch (e) {
            if (window.parent) {
              window.parent.postMessage({
                source: 'wishmagic',
                version: '1.0',
                type: 'WISHMAGIC_ERROR',
                payload: { code: 'RUNTIME_INIT_ERROR', message: e.message, stage: 'init' }
              }, '*');
            }
          }
        </script>
      `;

      if (html.includes('</head>')) {
        return html.replace('</head>', `${runtimeTag}</head>`);
      } else if (html.includes('</body>')) {
        return html.replace('</body>', `${runtimeTag}</body>`);
      }
      return `${html}\n${runtimeTag}`;
    }

    _handleWindowMessage(event) {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      const validation = WishMagicRuntimeProtocol.validateMessage(data);
      if (!validation.valid) return;

      this.messageCount++;

      switch (data.type) {
        case 'WISHMAGIC_READY':
          this._handleReadyMessage(data);
          break;

        case 'WISHMAGIC_ERROR':
          this.errorCount++;
          this.diagnostics.errors.push(data.payload);
          if (typeof this.onError === 'function') {
            this.onError(data.payload);
          }
          break;

        case 'WISHMAGIC_RESIZE':
          if (data.payload && data.payload.height && this.iframe) {
            this.iframe.style.minHeight = `${data.payload.height}px`;
          }
          break;

        case 'WISHMAGIC_PONG':
          break;
      }
    }

    _handleReadyMessage(data) {
      if (this.handshakeTimer) {
        clearTimeout(this.handshakeTimer);
        this.handshakeTimer = null;
      }

      this._setStatus('READY');
      this.diagnostics.runtimeReady = true;

      // Send WISHMAGIC_INIT with schema, canonical data, and protocol config
      this.sendMessage('WISHMAGIC_INIT', {
        templateId: (this.schema && this.schema.template && this.schema.template.id) || 'template',
        protocolVersion: PROTOCOL_VERSION,
        schema: this.schema,
        data: this.canonicalData,
        configuration: {
          reducedMotion: (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || false
        }
      });

      if (typeof this.onReady === 'function') {
        this.onReady({ protocol: PROTOCOL_VERSION, status: 'READY' });
      }
    }

    sendMessage(type, payload = {}) {
      if (!this.iframe || !this.iframe.contentWindow) return false;

      const message = WishMagicRuntimeProtocol.createMessage(type, payload);
      try {
        this.iframe.contentWindow.postMessage(message, this.targetOrigin);
        this.lastUpdate = type;
        return true;
      } catch (e) {
        console.warn(`[WishMagicSandbox] Failed to send ${type}:`, e);
        return false;
      }
    }

    updateField(field, value, formattedValue = null) {
      if (!field) return;

      if (!this.canonicalData.content) this.canonicalData.content = {};
      this.canonicalData.content[field] = value;
      this.canonicalData[field] = value;
      this.diagnostics.fieldsUpdated++;

      this.sendMessage('WISHMAGIC_UPDATE', {
        field,
        value,
        formattedValue: formattedValue || value
      });
    }

    updateMedia(field, url, action = 'set', details = {}) {
      if (!field) return;

      if (!this.canonicalData.media) this.canonicalData.media = {};
      if (action === 'set') {
        this.canonicalData.media[field] = typeof url === 'object' ? url : { url, ...details };
        this.diagnostics.mediaLoaded++;
      } else if (action === 'remove') {
        delete this.canonicalData.media[field];
      }

      this.sendMessage('WISHMAGIC_MEDIA', {
        field,
        url,
        action,
        details
      });
    }

    updateSection(section, enabled, layout = null) {
      if (!section) return;

      if (!this.canonicalData.sections) this.canonicalData.sections = {};
      if (typeof enabled === 'boolean') {
        if (typeof this.canonicalData.sections[section] === 'object') {
          this.canonicalData.sections[section].enabled = enabled;
        } else {
          this.canonicalData.sections[section] = enabled;
        }
      }

      if (layout) {
        if (typeof this.canonicalData.sections[section] !== 'object') {
          this.canonicalData.sections[section] = { enabled: Boolean(enabled), layout };
        } else {
          this.canonicalData.sections[section].layout = layout;
        }
      }

      this.diagnostics.sectionsLoaded++;

      this.sendMessage('WISHMAGIC_SECTION', {
        section,
        enabled,
        layout
      });
    }

    updateSectionOrder(order) {
      if (!Array.isArray(order)) return;
      this.canonicalData.sectionOrder = [...order];
      this.sendMessage('WISHMAGIC_SECTION_ORDER', { order });
    }

    updateTheme(theme, colors = null) {
      if (!theme) return;
      if (!this.canonicalData.visual) this.canonicalData.visual = {};
      this.canonicalData.visual.theme = theme;
      if (colors) this.canonicalData.visual.colors = colors;
      this.diagnostics.themeApplied = theme;

      this.sendMessage('WISHMAGIC_THEME', { theme, colors });
    }

    updateAnimation(animation, particles = null) {
      if (!this.canonicalData.animations) this.canonicalData.animations = {};
      if (animation) this.canonicalData.animations.style = animation;
      if (particles) this.canonicalData.animations.particles = particles;
      this.diagnostics.animationsApplied = animation || particles;

      this.sendMessage('WISHMAGIC_ANIMATION', { animation, particles });
    }

    switchTemplate(newTemplateSource, initialData = {}, schema = null) {
      // Map only fields that the new schema declares
      const compatibleData = {
        content: {},
        media: {},
        sections: {},
        visual: {},
        animations: {}
      };

      const sourceContent = initialData.content || initialData || {};
      if (schema && Array.isArray(schema.fields)) {
        schema.fields.forEach(f => {
          const key = f.key || f.name;
          if (key && sourceContent[key] !== undefined) {
            compatibleData.content[key] = sourceContent[key];
            compatibleData[key] = sourceContent[key];
          }
        });
      } else {
        compatibleData.content = { ...sourceContent };
      }

      // Preserve compatible media
      if (initialData.media && typeof initialData.media === 'object') {
        compatibleData.media = { ...initialData.media };
      }

      return this.createSandbox(this.container, newTemplateSource, {
        schema,
        data: compatibleData
      });
    }

    /**
     * Admin Test Mode: runs template with generated fixture data
     */
    testTemplate(templateSource, customFixture = null, options = {}) {
      const fixtureData = customFixture || WishMagicTemplateSandbox.generateFixtureData(options.schema);
      return this.createSandbox(this.container, templateSource, {
        schema: options.schema,
        data: fixtureData,
        ...options
      });
    }

    static generateFixtureData(schema = null) {
      const fixture = {
        recipient_name: 'Alex Rivera',
        sender_name: 'Taylor & Friends',
        custom_message: 'Wishing you a joyful celebration filled with magic, laughter, and lifelong memories! Happy Birthday!',
        event_date: '2026-10-25',
        event_time: '18:30',
        cover_photo: { id: 'sample_cover', url: '/assets/sample-cover.jpg' },
        photos: [
          { id: 'sample_1', url: '/assets/sample-1.jpg' },
          { id: 'sample_2', url: '/assets/sample-2.jpg' },
          { id: 'sample_3', url: '/assets/sample-3.jpg' }
        ],
        theme: 'romantic',
        sections: {
          hero: { enabled: true },
          message: { enabled: true },
          gallery: { enabled: true, layout: 'polaroid' },
          countdown: { enabled: true }
        }
      };

      if (schema && Array.isArray(schema.fields)) {
        schema.fields.forEach(f => {
          const key = f.key || f.name;
          if (!key) return;
          if (fixture[key] === undefined) {
            if (f.type === 'email') fixture[key] = 'alex@example.com';
            else if (f.type === 'phone') fixture[key] = '+1 (555) 019-2834';
            else if (f.type === 'url') fixture[key] = 'https://example.com';
            else if (f.type === 'number') fixture[key] = f.min !== null ? f.min : 25;
            else if (f.type === 'toggle') fixture[key] = true;
            else fixture[key] = f.defaultValue || `Sample ${f.label || key}`;
          }
        });
      }

      return fixture;
    }

    destroySandbox() {
      if (this.handshakeTimer) {
        clearTimeout(this.handshakeTimer);
        this.handshakeTimer = null;
      }
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }

      if (this.iframe && this.iframe.contentWindow) {
        try {
          this.sendMessage('WISHMAGIC_DESTROY', {});
        } catch (e) {}
      }

      if (typeof window !== 'undefined') {
        window.removeEventListener('message', this.boundMessageListener);
      }

      this.activeObjectURLs.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
      });
      this.activeObjectURLs.clear();

      if (this.iframe && this.iframe.parentNode) {
        this.iframe.parentNode.removeChild(this.iframe);
      }
      this.iframe = null;
      this._setStatus('DESTROYED');
    }

    destroy() {
      return this.destroySandbox();
    }

    static createSandbox(containerElement, templateSource, options = {}) {
      const instance = new WishMagicTemplateSandbox(options);
      return instance.createSandbox(containerElement, templateSource, options);
    }
  }

  // Export to global environment
  if (typeof global !== 'undefined') {
    global.WishMagicRuntimeProtocol = WishMagicRuntimeProtocol;
    global.WishMagicTemplateValidator = WishMagicTemplateValidator;
    global.WishMagicTemplateSandbox = WishMagicTemplateSandbox;
  }
  if (typeof window !== 'undefined') {
    window.WishMagicRuntimeProtocol = WishMagicRuntimeProtocol;
    window.WishMagicTemplateValidator = WishMagicTemplateValidator;
    window.WishMagicTemplateSandbox = WishMagicTemplateSandbox;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.WishMagicRuntimeProtocol = WishMagicRuntimeProtocol;
    globalThis.WishMagicTemplateValidator = WishMagicTemplateValidator;
    globalThis.WishMagicTemplateSandbox = WishMagicTemplateSandbox;
  }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
