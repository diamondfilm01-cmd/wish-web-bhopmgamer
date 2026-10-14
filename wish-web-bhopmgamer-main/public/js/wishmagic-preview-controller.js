/**
 * WishMagic Template Preview & Rendering Isolation System (Part 14)
 * =================================================================
 * Production-grade preview architecture that manages isolated,
 * version-locked, responsive, and secure template previews.
 *
 * Architecture:
 * Customizer -> WishMagicData -> Preview Controller -> Template Sandbox -> Template Runtime -> Rendered Template
 */

(function (global) {
  'use strict';

  const PROTOCOL_VERSION = '1.0';

  const VIEWPORT_CONFIGS = {
    mobile: {
      name: 'Mobile Phone',
      width: 390,
      height: 844,
      device: 'mobile',
      aspect: '9/19.5',
      frameClass: 'wm-frame-mobile'
    },
    tablet: {
      name: 'Tablet Screen',
      width: 768,
      height: 1024,
      device: 'tablet',
      aspect: '3/4',
      frameClass: 'wm-frame-tablet'
    },
    desktop: {
      name: 'Desktop Display',
      width: '100%',
      height: '100%',
      maxWidth: 1440,
      minHeight: 800,
      device: 'desktop',
      frameClass: 'wm-frame-desktop'
    },
    fullscreen: {
      name: 'Fullscreen Presentation',
      width: '100vw',
      height: '100vh',
      device: 'fullscreen',
      frameClass: 'wm-frame-fullscreen'
    }
  };

  /**
   * Preview Instance Controller
   */
  class WishMagicPreviewInstance {
    constructor(options = {}) {
      this.previewInstanceId = options.previewInstanceId || `preview_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      this.templateId = options.templateId || 'default_template';
      this.templateVersionId = options.templateVersionId || options.version || 'v1.0';
      this.container = options.container || null;
      this.viewportMode = options.viewport || 'mobile';
      this.deviceFrame = options.deviceFrame || 'iphone';
      this.interactionMode = options.interactionMode || 'edit'; // 'edit' | 'presentation'
      this.animationsEnabled = options.animationsEnabled !== false;

      this.status = 'IDLE'; // IDLE | LOADING | READY | UPDATING | ERROR | TIMEOUT | RELOADING | DESTROYED
      this.schema = options.schema || null;
      this.canonicalData = options.data ? JSON.parse(JSON.stringify(options.data)) : {
        content: {},
        media: {},
        sections: {},
        visual: {},
        animations: {},
        metadata: {}
      };

      this.sandbox = null;
      this.wrapperEl = null;
      this.frameEl = null;
      this.loadingEl = null;
      this.errorEl = null;
      this.resizeObserver = null;
      this.debounceTimers = new Map();
      this.lastRenderAt = null;
      this.errorCount = 0;
      this.warningCount = 0;

      this.onStatusChange = options.onStatusChange || null;
      this.onReady = options.onReady || null;
      this.onError = options.onError || null;

      this.diagnostics = {
        template: this.templateId,
        version: this.templateVersionId,
        runtime: 'IDLE',
        protocol: PROTOCOL_VERSION,
        render: 'INITIALIZING',
        viewport: this.viewportMode,
        assets: { total: 0, loaded: 0, failed: 0 },
        warnings: [],
        errors: []
      };
    }

    _setStatus(newStatus, details = {}) {
      this.status = newStatus;
      this.diagnostics.runtime = newStatus;
      if (typeof this.onStatusChange === 'function') {
        try {
          this.onStatusChange({
            status: this.status,
            previewInstanceId: this.previewInstanceId,
            templateId: this.templateId,
            templateVersionId: this.templateVersionId,
            viewport: this.viewportMode,
            lastRenderAt: this.lastRenderAt,
            ...details
          });
        } catch (e) {
          console.warn('[WishMagicPreview] onStatusChange error:', e);
        }
      }
    }

    getState() {
      return {
        previewInstanceId: this.previewInstanceId,
        status: this.status,
        templateId: this.templateId,
        templateVersionId: this.templateVersionId,
        viewport: this.viewportMode,
        deviceFrame: this.deviceFrame,
        interactionMode: this.interactionMode,
        animationsEnabled: this.animationsEnabled,
        lastRenderAt: this.lastRenderAt,
        errors: [...this.diagnostics.errors],
        warnings: [...this.diagnostics.warnings]
      };
    }

    getDiagnostics() {
      return {
        ...this.diagnostics,
        status: this.status,
        templateId: this.templateId,
        templateVersionId: this.templateVersionId,
        viewport: this.viewportMode,
        lastRenderAt: this.lastRenderAt
      };
    }

    /**
     * Mount and initialize preview inside container
     */
    mount(containerElement, templateSource, options = {}) {
      this.destroy();

      this.container = containerElement || this.container;
      if (!this.container) {
        throw new Error('[WishMagicPreview] Valid container element required.');
      }

      this.templateId = options.templateId || this.templateId;
      this.templateVersionId = options.templateVersionId || options.version || this.templateVersionId;
      this.schema = options.schema || this.schema;
      if (options.data) {
        this.canonicalData = JSON.parse(JSON.stringify(options.data));
      }

      this._buildPreviewDOM();
      this._setStatus('LOADING');

      // Create Sandbox with locked version and instance metadata
      const SandboxClass = (typeof global !== 'undefined' && global.WishMagicTemplateSandbox) || (typeof window !== 'undefined' && window.WishMagicTemplateSandbox);
      if (!SandboxClass) {
        throw new Error('[WishMagicPreview] WishMagicTemplateSandbox module is not loaded.');
      }

      this.sandbox = new SandboxClass({
        container: this.frameEl,
        timeoutMs: options.timeoutMs || 8000,
        onReady: (handshake) => {
          this._setStatus('READY');
          this.diagnostics.render = 'PASS';
          this.lastRenderAt = Date.now();
          this._hideLoader();

          if (typeof this.onReady === 'function') {
            this.onReady({
              previewInstanceId: this.previewInstanceId,
              templateId: this.templateId,
              templateVersionId: this.templateVersionId,
              status: 'READY'
            });
          }
        },
        onError: (err) => {
          this.errorCount++;
          this.diagnostics.errors.push(err);
          this.diagnostics.render = 'FAIL';
          this._showError(err);
          if (typeof this.onError === 'function') {
            this.onError(err);
          }
        }
      });

      // Launch isolated sandbox
      this.sandbox.createSandbox(this.frameEl, templateSource, {
        schema: this.schema,
        data: this.canonicalData,
        templateId: this.templateId,
        templateVersionId: this.templateVersionId,
        previewInstanceId: this.previewInstanceId
      });

      this._setupResizeObserver();
      this.setViewport(this.viewportMode);
      return this;
    }

    _buildPreviewDOM() {
      this.container.innerHTML = '';

      // Outer wrapper
      const wrapper = document.createElement('div');
      wrapper.className = 'wm-preview-root relative w-full h-full flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden select-none bg-slate-950/40 backdrop-blur-md rounded-2xl sm:rounded-3xl border border-purple-500/10';
      wrapper.setAttribute('data-preview-instance-id', this.previewInstanceId);
      this.wrapperEl = wrapper;

      // Chrome / Device Frame Wrapper
      const frameWrapper = document.createElement('div');
      frameWrapper.className = 'wm-device-frame relative w-full h-full flex items-center justify-center transition-all duration-300';
      this.frameEl = frameWrapper;

      // Loading Skeleton Element
      const loader = document.createElement('div');
      loader.className = 'wm-preview-loader absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md text-white transition-opacity duration-300';
      loader.innerHTML = `
        <div class="flex flex-col items-center gap-3 p-6 text-center">
          <div class="w-10 h-10 border-3 border-pink-500/30 border-t-pink-500 rounded-full animate-spin"></div>
          <p class="text-sm font-semibold text-purple-200 tracking-wide">Loading Template Preview...</p>
          <span class="text-xs text-purple-400/80">Version locked: ${this.templateVersionId}</span>
        </div>
      `;
      this.loadingEl = loader;

      // Error Display Element
      const errBox = document.createElement('div');
      errBox.className = 'wm-preview-error absolute inset-0 z-40 hidden flex-col items-center justify-center p-6 bg-slate-950/90 backdrop-blur-lg text-white text-center';
      errBox.innerHTML = `
        <div class="max-w-md p-6 rounded-2xl bg-rose-950/40 border border-rose-500/30 shadow-2xl flex flex-col items-center gap-3">
          <div class="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-xl font-bold">⚠️</div>
          <h4 class="text-base font-bold text-rose-200">Unable to load template preview</h4>
          <p class="wm-error-message text-xs text-rose-300/80 leading-relaxed"></p>
          <button type="button" class="wm-reload-btn mt-2 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white text-xs font-bold shadow-lg transition active:scale-95">
            Reload Preview
          </button>
        </div>
      `;
      const reloadBtn = errBox.querySelector('.wm-reload-btn');
      if (reloadBtn) {
        reloadBtn.addEventListener('click', () => this.reloadPreview());
      }
      this.errorEl = errBox;

      wrapper.appendChild(frameWrapper);
      wrapper.appendChild(loader);
      wrapper.appendChild(errBox);
      this.container.appendChild(wrapper);
    }

    _hideLoader() {
      if (this.loadingEl) {
        this.loadingEl.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => {
          if (this.loadingEl && this.loadingEl.parentNode) {
            this.loadingEl.classList.add('hidden');
          }
        }, 300);
      }
    }

    _showError(err) {
      if (this.loadingEl) this.loadingEl.classList.add('hidden');
      if (this.errorEl) {
        const msgEl = this.errorEl.querySelector('.wm-error-message');
        if (msgEl) {
          msgEl.textContent = err.message || 'The template runtime could not initialize safely.';
        }
        this.errorEl.classList.remove('hidden');
        this.errorEl.classList.add('flex');
      }
      this._setStatus('ERROR', { error: err });
    }

    _setupResizeObserver() {
      if (typeof ResizeObserver === 'undefined') return;
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (this.sandbox && this.status === 'READY') {
            this.sandbox.sendMessage('WISHMAGIC_RESIZE', {
              width: Math.round(width),
              height: Math.round(height),
              device: this.viewportMode,
              previewInstanceId: this.previewInstanceId
            });
          }
        }
      });

      if (this.frameEl) {
        this.resizeObserver.observe(this.frameEl);
      }
    }

    /**
     * Set responsive viewport mode (mobile, tablet, desktop, fullscreen)
     */
    setViewport(mode) {
      if (!VIEWPORT_CONFIGS[mode]) return;
      this.viewportMode = mode;
      this.diagnostics.viewport = mode;

      if (!this.frameEl) return;

      const conf = VIEWPORT_CONFIGS[mode];
      this.frameEl.style.maxWidth = '';
      this.frameEl.style.width = '';
      this.frameEl.style.height = '';
      this.frameEl.style.aspectRatio = '';
      this.frameEl.className = 'wm-device-frame relative transition-all duration-300 flex items-center justify-center';

      if (mode === 'mobile') {
        this.frameEl.style.width = '100%';
        this.frameEl.style.maxWidth = '390px';
        this.frameEl.style.height = '100%';
        this.frameEl.style.maxHeight = '844px';
        this.frameEl.classList.add('rounded-[42px]', 'p-2', 'shadow-2xl', 'bg-slate-900', 'border-[6px]', 'border-slate-800');
      } else if (mode === 'tablet') {
        this.frameEl.style.width = '100%';
        this.frameEl.style.maxWidth = '768px';
        this.frameEl.style.height = '100%';
        this.frameEl.style.maxHeight = '1024px';
        this.frameEl.classList.add('rounded-[28px]', 'p-2.5', 'shadow-2xl', 'bg-slate-900', 'border-[5px]', 'border-slate-800');
      } else if (mode === 'desktop') {
        this.frameEl.style.width = '100%';
        this.frameEl.style.height = '100%';
        this.frameEl.classList.add('rounded-2xl', 'shadow-lg', 'border', 'border-purple-500/20');
      } else if (mode === 'fullscreen') {
        this.frameEl.style.width = '100vw';
        this.frameEl.style.height = '100vh';
        this.frameEl.classList.add('fixed', 'inset-0', 'z-50', 'bg-black');
      }

      if (this.sandbox && this.status === 'READY') {
        this.sandbox.sendMessage('WISHMAGIC_RESIZE', {
          device: mode,
          previewInstanceId: this.previewInstanceId
        });
      }

      this._setStatus(this.status);
    }

    /**
     * Real-time Debounced Field Update
     */
    updateField(field, value, formattedValue = null, immediate = false) {
      if (!field) return;

      if (!this.canonicalData.content) this.canonicalData.content = {};
      this.canonicalData.content[field] = value;
      this.canonicalData[field] = value;

      const send = () => {
        if (this.sandbox) {
          this.sandbox.updateField(field, value, formattedValue);
        }
      };

      if (immediate) {
        send();
      } else {
        if (this.debounceTimers.has(field)) {
          clearTimeout(this.debounceTimers.get(field));
        }
        const timer = setTimeout(() => {
          send();
          this.debounceTimers.delete(field);
        }, 60);
        this.debounceTimers.set(field, timer);
      }
    }

    /**
     * Media Slot Synchronization
     */
    updateMedia(field, url, action = 'set', details = {}) {
      if (!field) return;
      if (!this.canonicalData.media) this.canonicalData.media = {};
      if (action === 'set') {
        this.canonicalData.media[field] = typeof url === 'object' ? url : { url, ...details };
      } else if (action === 'remove') {
        delete this.canonicalData.media[field];
      }

      if (this.sandbox) {
        this.sandbox.updateMedia(field, url, action, details);
      }
    }

    /**
     * Visual / Theme Update
     */
    updateTheme(theme, colors = null) {
      if (!theme) return;
      if (!this.canonicalData.visual) this.canonicalData.visual = {};
      this.canonicalData.visual.theme = theme;
      if (colors) this.canonicalData.visual.colors = colors;

      if (this.sandbox) {
        this.sandbox.updateTheme(theme, colors);
      }
    }

    /**
     * Section Controls
     */
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

      if (this.sandbox) {
        this.sandbox.updateSection(section, enabled, layout);
      }
    }

    updateSectionOrder(order) {
      if (!Array.isArray(order)) return;
      this.canonicalData.sectionOrder = [...order];
      if (this.sandbox) {
        this.sandbox.updateSectionOrder(order);
      }
    }

    /**
     * Animations & Particles
     */
    updateAnimation(animation, particles = null) {
      if (!this.canonicalData.animations) this.canonicalData.animations = {};
      if (animation) this.canonicalData.animations.style = animation;
      if (particles) this.canonicalData.animations.particles = particles;

      if (this.sandbox && this.animationsEnabled) {
        this.sandbox.updateAnimation(animation, particles);
      }
    }

    setAnimationsEnabled(enabled) {
      this.animationsEnabled = Boolean(enabled);
      if (this.sandbox) {
        if (!this.animationsEnabled) {
          this.sandbox.updateAnimation('none', 'none');
        } else {
          const style = this.canonicalData.animations && this.canonicalData.animations.style;
          const particles = this.canonicalData.animations && this.canonicalData.animations.particles;
          this.sandbox.updateAnimation(style || 'fade', particles || 'sparkles');
        }
      }
    }

    /**
     * Reload Preview without losing user customization state or version lock
     */
    reloadPreview() {
      this._setStatus('RELOADING');
      if (this.loadingEl) {
        this.loadingEl.classList.remove('hidden', 'opacity-0');
      }
      if (this.errorEl) {
        this.errorEl.classList.add('hidden');
        this.errorEl.classList.remove('flex');
      }

      if (this.sandbox) {
        this.sandbox.destroySandbox();
        this.sandbox.createSandbox(this.frameEl, this.sandbox.iframe ? this.sandbox.iframe.src || this.sandbox.iframe.srcdoc : '', {
          schema: this.schema,
          data: this.canonicalData,
          templateId: this.templateId,
          templateVersionId: this.templateVersionId,
          previewInstanceId: this.previewInstanceId
        });
      }
    }

    /**
     * Reset Preview (resets viewport and zoom only, preserves Wish data)
     */
    resetPreview() {
      this.setViewport('mobile');
      this.setAnimationsEnabled(true);
    }

    /**
     * Switch Template cleanly
     */
    switchTemplate(newTemplateSource, options = {}) {
      const nextTemplateId = options.templateId || this.templateId;
      const nextVersionId = options.templateVersionId || options.version || 'v1.0';
      const nextSchema = options.schema || null;

      let compatibleData;
      let nextCanonical = this.canonicalData;

      if (global.WishMagicStateMigrator && typeof global.WishMagicStateMigrator.migrate === 'function') {
        const migration = global.WishMagicStateMigrator.migrate({
          canonicalData: this.canonicalData,
          targetSchema: nextSchema,
          sourceSchema: this.schema
        });
        nextCanonical = migration.canonicalData;
        compatibleData = migration.projectedData;
      } else {
        // Filter compatible fields based on new schema
        compatibleData = {
          content: {},
          media: { ...(this.canonicalData.media || {}) },
          sections: { ...(this.canonicalData.sections || {}) },
          visual: { ...(this.canonicalData.visual || {}) },
          animations: { ...(this.canonicalData.animations || {}) }
        };

        const currContent = this.canonicalData.content || this.canonicalData;
        if (nextSchema && Array.isArray(nextSchema.fields)) {
          nextSchema.fields.forEach(f => {
            const k = f.key || f.name;
            if (k && currContent[k] !== undefined) {
              compatibleData.content[k] = currContent[k];
              compatibleData[k] = currContent[k];
            }
          });
        } else {
          compatibleData.content = { ...currContent };
        }
      }

      this.templateId = nextTemplateId;
      this.templateVersionId = nextVersionId;
      this.schema = nextSchema;
      this.canonicalData = nextCanonical;

      return this.mount(this.container, newTemplateSource, {
        templateId: nextTemplateId,
        templateVersionId: nextVersionId,
        schema: nextSchema,
        data: compatibleData
      });
    }

    destroy() {
      this.debounceTimers.forEach(t => clearTimeout(t));
      this.debounceTimers.clear();

      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }

      if (this.sandbox) {
        this.sandbox.destroySandbox();
        this.sandbox = null;
      }

      if (this.wrapperEl && this.wrapperEl.parentNode) {
        this.wrapperEl.parentNode.removeChild(this.wrapperEl);
      }
      this.wrapperEl = null;
      this.frameEl = null;
      this.loadingEl = null;
      this.errorEl = null;

      this._setStatus('DESTROYED');
    }
  }

  /**
   * Universal Preview Controller (Multi-instance Registry & Manager)
   */
  const WishMagicPreviewController = {
    instances: new Map(),

    createPreview(container, options = {}) {
      const instance = new WishMagicPreviewInstance(options);
      this.instances.set(instance.previewInstanceId, instance);

      if (options.templateSource) {
        instance.mount(container, options.templateSource, options);
      }
      return instance;
    },

    getPreview(instanceId) {
      return this.instances.get(instanceId) || null;
    },

    destroyPreview(instanceId) {
      if (this.instances.has(instanceId)) {
        const inst = this.instances.get(instanceId);
        inst.destroy();
        this.instances.delete(instanceId);
      }
    },

    destroyAll() {
      this.instances.forEach(inst => inst.destroy());
      this.instances.clear();
    },

    VIEWPORT_CONFIGS
  };

  // Export to global environment
  if (typeof global !== 'undefined') {
    global.WishMagicPreviewInstance = WishMagicPreviewInstance;
    global.WishMagicPreviewController = WishMagicPreviewController;
  }
  if (typeof window !== 'undefined') {
    window.WishMagicPreviewInstance = WishMagicPreviewInstance;
    window.WishMagicPreviewController = WishMagicPreviewController;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.WishMagicPreviewInstance = WishMagicPreviewInstance;
    globalThis.WishMagicPreviewController = WishMagicPreviewController;
  }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
