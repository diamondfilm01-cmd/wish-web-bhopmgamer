/**
 * WishMagic Runtime Bridge (Part 4)
 * =============================================================
 * Controlled communication and state synchronization bridge between
 * the Customizer and the Template Preview (iframe or embedded runtime).
 *
 * Implements strict message protocol, origin validation, handshake,
 * rapid update sequencing, and automatic reconnection.
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
    'WISHMAGIC_READY',
    'WISHMAGIC_LIVE_UPDATE'
  ]);

  let previewTarget = null;
  let targetOrigin = '*';
  let isConnected = false;
  let isReady = false;
  let pendingState = null;
  let messageCount = 0;
  let lastUpdateKey = null;
  let errorCount = 0;
  let statusChangeListeners = [];
  let boundWindowMessageListener = null;
  let boundIframeLoadListener = null;
  let handshakeTimer = null;
  let createdObjectURLs = new Set();

  function notifyStatusChange() {
    const status = {
      connected: isConnected,
      ready: isReady,
      mode: previewTarget ? (previewTarget.tagName === 'IFRAME' ? 'iframe' : 'embedded') : 'none',
      lastUpdate: lastUpdateKey,
      messageCount,
      errors: errorCount
    };
    statusChangeListeners.forEach(cb => {
      try {
        cb(status);
      } catch (e) {
        console.warn('RuntimeBridge status callback error:', e);
      }
    });
  }

  const WishMagicRuntimeBridge = {
    PROTOCOL_VERSION,

    /**
     * Initialize Runtime Bridge
     * @param {Object} options - { previewElement, targetOrigin, onStatusChange, initialData }
     */
    init(options = {}) {
      this.destroy();

      if (options.previewElement) {
        previewTarget = options.previewElement;
      }
      if (options.targetOrigin) {
        targetOrigin = options.targetOrigin;
      }
      if (options.onStatusChange) {
        this.onStatusChange(options.onStatusChange);
      }
      if (options.initialData) {
        pendingState = JSON.parse(JSON.stringify(options.initialData));
      }

      this.connect();
      return this;
    },

    /**
     * Connect listeners to preview target and window message bus
     */
    connect() {
      if (typeof window === 'undefined') return;

      // 1. Listen for template handshake messages
      boundWindowMessageListener = (event) => {
        if (!event.data || typeof event.data !== 'object') return;

        // Security check: validate origin if targetOrigin is not wildcard
        if (targetOrigin !== '*' && event.origin !== targetOrigin) {
          return;
        }

        const msgType = event.data.type;
        if (!ALLOWED_MESSAGE_TYPES.has(msgType)) {
          return;
        }

        // Handshake: Template Runtime signals it is READY
        if (msgType === 'WISHMAGIC_READY') {
          isConnected = true;
          isReady = true;
          if (handshakeTimer) {
            clearTimeout(handshakeTimer);
            handshakeTimer = null;
          }

          notifyStatusChange();

          // Dispatch pending initialization state
          if (pendingState) {
            this.sendState(pendingState);
          } else if (global.WishMagicData) {
            this.sendState(global.WishMagicData);
          }
        }
      };

      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('message', boundWindowMessageListener);
      }

      // 2. Listen for iframe reload / load events to re-establish handshake
      if (previewTarget && previewTarget.tagName === 'IFRAME') {
        boundIframeLoadListener = () => {
          isReady = false;
          isConnected = true;
          notifyStatusChange();

          // Wait for WISHMAGIC_READY with bounded timeout
          if (handshakeTimer) clearTimeout(handshakeTimer);
          handshakeTimer = setTimeout(() => {
            if (!isReady) {
              console.warn('WishMagic template runtime did not send WISHMAGIC_READY within timeout. Resending init.');
              if (pendingState || global.WishMagicData) {
                this.send('WISHMAGIC_INIT', {
                  protocol: PROTOCOL_VERSION,
                  data: pendingState || global.WishMagicData
                });
              }
            }
          }, 1500);
        };

        previewTarget.addEventListener('load', boundIframeLoadListener);
      }

      isConnected = true;
      notifyStatusChange();
    },

    /**
     * Send a raw structured message to template preview
     */
    send(type, payload) {
      if (!ALLOWED_MESSAGE_TYPES.has(type)) {
        console.warn(`Rejected unpermitted message type: "${type}"`);
        errorCount++;
        return;
      }

      if (!previewTarget) return;

      const message = {
        protocol: PROTOCOL_VERSION,
        type,
        source: 'customizer',
        timestamp: Date.now(),
        payload: payload !== undefined ? payload : null
      };

      try {
        if (previewTarget.contentWindow) {
          previewTarget.contentWindow.postMessage(message, targetOrigin);
          messageCount++;
        } else if (typeof previewTarget.postMessage === 'function') {
          previewTarget.postMessage(message, targetOrigin);
          messageCount++;
        }
      } catch (err) {
        errorCount++;
        console.warn('WishMagicRuntimeBridge send error:', err);
      }

      notifyStatusChange();
    },

    /**
     * Send entire state snapshot (bulk initialization)
     */
    sendState(data) {
      pendingState = JSON.parse(JSON.stringify(data));
      lastUpdateKey = '*bulk_state*';
      this.send('WISHMAGIC_INIT', {
        protocol: PROTOCOL_VERSION,
        data: pendingState
      });
      this.send('WISHMAGIC_STATE', pendingState);
    },

    /**
     * Send single field update
     */
    updateField(key, value) {
      if (!key) return;
      lastUpdateKey = key;
      if (pendingState) pendingState[key] = value;
      this.send('WISHMAGIC_UPDATE', { key, value });
    },

    /**
     * Send section visibility update (Spec 44)
     */
     updateSection(key, enabled, order) {
      if (!key) return;
      lastUpdateKey = `section:${key}`;
      if (pendingState) {
        if (!pendingState.sections) pendingState.sections = {};
        if (typeof pendingState.sections[key] === 'object') {
          pendingState.sections[key].enabled = Boolean(enabled);
        } else {
          pendingState.sections[key] = { enabled: Boolean(enabled) };
        }
      }
      this.send('WISHMAGIC_SECTION', { section: key, key, enabled: Boolean(enabled), order });
    },

    /**
     * Send section layout update (Spec 16, 17, 42)
     */
    updateSectionLayout(sectionId, layout) {
      if (!sectionId || !layout) return;
      lastUpdateKey = `section_layout:${sectionId}`;
      if (pendingState) {
        if (!pendingState.sections) pendingState.sections = {};
        if (typeof pendingState.sections[sectionId] === 'object') {
          pendingState.sections[sectionId].layout = String(layout);
        } else {
          pendingState.sections[sectionId] = { enabled: true, layout: String(layout) };
        }
      }
      this.send('WISHMAGIC_SECTION_LAYOUT', { section: sectionId, layout: String(layout) });
    },

    /**
     * Send section order update (Spec 43)
     */
    updateSectionOrder(order) {
      if (!Array.isArray(order)) return;
      lastUpdateKey = 'section_order';
      if (pendingState) {
        pendingState.sectionOrder = [...order];
      }
      this.send('WISHMAGIC_SECTION_ORDER', { order: [...order] });
    },

    /**
     * Send theme update (Spec 7, 8)
     */
    updateTheme(theme, colors) {
      lastUpdateKey = `theme:${theme}`;
      if (pendingState) {
        if (!pendingState.visual) pendingState.visual = {};
        pendingState.visual.theme = theme;
        if (colors) {
          if (!pendingState.visual.colors) pendingState.visual.colors = {};
          Object.assign(pendingState.visual.colors, colors);
        }
      }
      this.send('WISHMAGIC_THEME', { theme, colors });
    },

    /**
     * Send color override update (Spec 11, 12, 13, 30, 31)
     */
    updateColor(colorKey, value) {
      lastUpdateKey = `color:${colorKey}`;
      if (pendingState) {
        if (!pendingState.visual) pendingState.visual = {};
        if (!pendingState.visual.colors) pendingState.visual.colors = {};
        pendingState.visual.colors[colorKey] = value;
      }
      this.send('WISHMAGIC_COLOR', { key: colorKey, value });
    },

    /**
     * Send background update (Spec 14, 15, 16)
     */
    updateBackground(background) {
      lastUpdateKey = `background:${background}`;
      if (pendingState) {
        if (!pendingState.visual) pendingState.visual = {};
        pendingState.visual.background = background;
      }
      this.send('WISHMAGIC_BACKGROUND', { background });
    },

    /**
     * Send surface style update (Spec 18, 19)
     */
    updateSurface(surface) {
      lastUpdateKey = `surface:${surface}`;
      if (pendingState) {
        if (!pendingState.visual) pendingState.visual = {};
        pendingState.visual.surface = surface;
      }
      this.send('WISHMAGIC_SURFACE', { surface });
    },

    /**
     * Send button style update (Spec 20, 21)
     */
    updateButtonStyle(style) {
      lastUpdateKey = `button_style:${style}`;
      if (pendingState) {
        if (!pendingState.visual) pendingState.visual = {};
        pendingState.visual.buttonStyle = style;
      }
      this.send('WISHMAGIC_BUTTON_STYLE', { style });
    },

    /**
     * Send typography update (Spec 22, 23, 24, 25, 26)
     */
    updateTypography(typeKey, value) {
      lastUpdateKey = `typography:${typeKey}`;
      if (pendingState) {
        if (!pendingState.visual) pendingState.visual = {};
        if (!pendingState.visual.typography) pendingState.visual.typography = {};
        pendingState.visual.typography[typeKey] = value;
      }
      this.send('WISHMAGIC_TYPOGRAPHY', { key: typeKey, value });
    },

    /**
     * Send visual intensity update (Spec 28)
     */
    updateIntensity(intensity) {
      lastUpdateKey = `intensity:${intensity}`;
      if (pendingState) {
        if (!pendingState.visual) pendingState.visual = {};
        pendingState.visual.intensity = intensity;
      }
      this.send('WISHMAGIC_INTENSITY', { intensity });
    },

    /**
     * Send border radius update (Spec 27)
     */
    updateRadius(radius) {
      lastUpdateKey = `radius:${radius}`;
      if (pendingState) {
        if (!pendingState.visual) pendingState.visual = {};
        pendingState.visual.radius = radius;
      }
      this.send('WISHMAGIC_RADIUS', { radius });
    },

    /**
     * Send template-specific custom visual control update (Spec 49, 50, 51)
     */
    updateCustomVisual(controlId, value) {
      lastUpdateKey = `custom_visual:${controlId}`;
      if (pendingState) {
        if (!pendingState.visual) pendingState.visual = {};
        if (!pendingState.visual.custom) pendingState.visual.custom = {};
        pendingState.visual.custom[controlId] = value;
      }
      this.send('WISHMAGIC_CUSTOM_VISUAL', { id: controlId, value });
    },

    /**
     * Send complete visual state reset (Spec 35)
     */
    resetVisualState() {
      lastUpdateKey = 'visual_reset';
      if (pendingState) {
        delete pendingState.visual;
      }
      this.send('WISHMAGIC_VISUAL_RESET', {});
    },

    /**
     * Send animation update (Spec 33, 34, 35)
     */
    updateAnimation(category, value) {
      lastUpdateKey = `animation:${category}`;
      if (pendingState) {
        if (!pendingState.animations) pendingState.animations = {};
        if (category === 'enabled') {
          pendingState.animations.enabled = Boolean(value);
        } else if (category === 'pageEntrance' || category === 'page') {
          pendingState.animations.pageEntrance = value;
        } else {
          pendingState.animations[category] = value;
        }
      }
      this.send('WISHMAGIC_ANIMATION', { category, value });
    },

    /**
     * Send section reveal animation update (Spec 34, 36)
     */
    updateSectionAnimation(sectionId, animation) {
      lastUpdateKey = `section_animation:${sectionId}`;
      if (pendingState) {
        if (!pendingState.animations) pendingState.animations = {};
        if (!pendingState.animations.sectionReveal) pendingState.animations.sectionReveal = {};
        pendingState.animations.sectionReveal[sectionId] = animation;
      }
      this.send('WISHMAGIC_SECTION_ANIMATION', { section: sectionId, animation });
    },

    /**
     * Send text reveal animation update (Spec 34, 37)
     */
    updateTextAnimation(animation) {
      lastUpdateKey = `text_animation:${animation}`;
      if (pendingState) {
        if (!pendingState.animations) pendingState.animations = {};
        pendingState.animations.textReveal = animation;
      }
      this.send('WISHMAGIC_TEXT_ANIMATION', { animation });
    },

    /**
     * Send media reveal animation update (Spec 34, 38)
     */
    updateMediaAnimation(animation) {
      lastUpdateKey = `media_animation:${animation}`;
      if (pendingState) {
        if (!pendingState.animations) pendingState.animations = {};
        pendingState.animations.mediaReveal = animation;
      }
      this.send('WISHMAGIC_MEDIA_ANIMATION', { animation });
    },

    /**
     * Send particles configuration (Spec 21, 22, 34)
     */
    updateParticles(config) {
      lastUpdateKey = 'particles';
      if (pendingState) {
        if (!pendingState.animations) pendingState.animations = {};
        pendingState.animations.particles = { ...config };
      }
      this.send('WISHMAGIC_PARTICLES', config);
    },

    /**
     * Send interactive effect update (Spec 24, 25, 34)
     */
    updateInteractiveEffect(effect, enabled = true) {
      lastUpdateKey = `interactive_effect:${effect}`;
      if (pendingState) {
        if (!pendingState.animations) pendingState.animations = {};
        pendingState.animations.interactive = { effect, enabled: Boolean(enabled) };
      }
      this.send('WISHMAGIC_INTERACTIVE_EFFECT', { effect, enabled: Boolean(enabled) });
    },

    /**
     * Send ambient effect update (Spec 26, 34)
     */
    updateAmbientEffect(type, enabled = true) {
      lastUpdateKey = `ambient_effect:${type}`;
      if (pendingState) {
        if (!pendingState.animations) pendingState.animations = {};
        pendingState.animations.ambient = { type, enabled: Boolean(enabled) };
      }
      this.send('WISHMAGIC_AMBIENT_EFFECT', { type, enabled: Boolean(enabled) });
    },

    /**
     * Send custom animation control update (Spec 32, 74, 75)
     */
    updateCustomAnimation(controlId, value) {
      lastUpdateKey = `custom_animation:${controlId}`;
      if (pendingState) {
        if (!pendingState.animations) pendingState.animations = {};
        if (!pendingState.animations.custom) pendingState.animations.custom = {};
        pendingState.animations.custom[controlId] = value;
      }
      this.send('WISHMAGIC_CUSTOM_ANIMATION', { id: controlId, value });
    },

    /**
     * Reset complete animation state (Spec 65)
     */
    resetAnimationState() {
      lastUpdateKey = 'animation_reset';
      if (pendingState) {
        delete pendingState.animations;
      }
      this.send('WISHMAGIC_ANIMATION_RESET', {});
    },

    /**
     * Replay intro animation (Spec 50)
     */
    replayIntro() {
      lastUpdateKey = 'replay_intro';
      this.send('WISHMAGIC_REPLAY_INTRO', {});
    },

    /**
     * Send media slot update (Part 8 - Spec 50, 51, 52, 53)
     */
    updateMedia(mediaId, action = 'set', mediaOrItems = null) {
      lastUpdateKey = `media:${mediaId}:${action}`;
      let payload = {};
      if (typeof action === 'object' && action !== null && mediaOrItems === null) {
        // Overload updateMedia(mediaId, { action, media, items, key, value })
        payload = { mediaId, ...action };
      } else if (typeof action === 'string') {
        payload = {
          mediaId,
          action,
          media: Array.isArray(mediaOrItems) ? null : mediaOrItems,
          items: Array.isArray(mediaOrItems) ? mediaOrItems : null,
          key: mediaId,
          value: Array.isArray(mediaOrItems) ? mediaOrItems : (mediaOrItems && (mediaOrItems.url || mediaOrItems))
        };
      } else {
        payload = { mediaId, action: 'set', media: action, key: mediaId, value: action };
      }

      if (pendingState) {
        if (!pendingState.media) pendingState.media = {};
        if (payload.action === 'remove') {
          delete pendingState.media[mediaId];
        } else if (payload.items) {
          pendingState.media[mediaId] = payload.items;
        } else if (payload.media) {
          pendingState.media[mediaId] = payload.media;
        }
      }

      this.send('WISHMAGIC_MEDIA', payload);
    },

    /**
     * Send gallery media reordering update (Part 8 - Spec 54)
     */
    updateMediaOrder(mediaId, order) {
      lastUpdateKey = `media_order:${mediaId}`;
      if (pendingState && pendingState.media && Array.isArray(pendingState.media[mediaId])) {
        const currentItems = pendingState.media[mediaId];
        const itemMap = new Map();
        currentItems.forEach(item => {
          const id = item.id || item.url;
          itemMap.set(id, item);
        });
        const reordered = [];
        order.forEach(id => {
          if (itemMap.has(id)) reordered.push(itemMap.get(id));
        });
        pendingState.media[mediaId] = reordered;
      }
      this.send('WISHMAGIC_MEDIA_ORDER', { mediaId, order });
    },

    /**
     * Send media custom settings update (Part 8 - Spec 76, 77)
     */
    updateMediaSettings(mediaId, settings) {
      lastUpdateKey = `media_settings:${mediaId}`;
      if (pendingState) {
        if (!pendingState.mediaSettings) pendingState.mediaSettings = {};
        pendingState.mediaSettings[mediaId] = { ...(pendingState.mediaSettings[mediaId] || {}), ...settings };
      }
      this.send('WISHMAGIC_MEDIA_SETTINGS', { mediaId, settings });
    },

    /**
     * Track temporary Blob / Object URL for memory cleanup
     */
    trackObjectURL(url) {
      if (url && typeof url === 'string' && url.startsWith('blob:')) {
        createdObjectURLs.add(url);
      }
      return url;
    },

    /**
     * Revoke single temporary Blob URL
     */
    revokeObjectURL(url) {
      if (url && createdObjectURLs.has(url)) {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
        createdObjectURLs.delete(url);
      }
    },

    /**
     * Revoke all tracked temporary object URLs
     */
    cleanupObjectURLs() {
      createdObjectURLs.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
      });
      createdObjectURLs.clear();
    },

    /**
     * Reset template preview to initial default state
     */
    reset() {
      lastUpdateKey = '*reset*';
      this.send('WISHMAGIC_RESET', {});
    },

    /**
     * Register status listener
     */
    onStatusChange(cb) {
      if (typeof cb === 'function') {
        statusChangeListeners.push(cb);
      }
    },

    /**
     * Get current status
     */
    getStatus() {
      return {
        connected: isConnected,
        ready: isReady,
        mode: previewTarget ? (previewTarget.tagName === 'IFRAME' ? 'iframe' : 'embedded') : 'none',
        lastUpdate: lastUpdateKey,
        messageCount,
        errors: errorCount
      };
    },

    /**
     * Development console logger
     */
    debug() {
      console.log('%c✨ WishMagic Runtime Bridge Status', 'color:#ec4899;font-weight:bold;font-size:13px;');
      console.log('-------------------------------------------');
      console.log('Bridge Connected :', isConnected ? '✅ YES' : '❌ NO');
      console.log('Runtime Ready    :', isReady ? '✅ READY' : '⏳ WAITING');
      console.log('Target Origin    :', targetOrigin);
      console.log('Messages Sent    :', messageCount);
      console.log('Last Updated Key :', lastUpdateKey);
      console.log('Bridge Errors    :', errorCount);
      console.log('Tracked Blobs    :', createdObjectURLs.size);
      console.log('-------------------------------------------');
      return this.getStatus();
    },

    /**
     * Disconnect and clean up all listeners and resources
     */
    destroy() {
      if (typeof window !== 'undefined' && boundWindowMessageListener) {
        window.removeEventListener('message', boundWindowMessageListener);
        boundWindowMessageListener = null;
      }

      if (previewTarget && boundIframeLoadListener) {
        previewTarget.removeEventListener('load', boundIframeLoadListener);
        boundIframeLoadListener = null;
      }

      if (handshakeTimer) {
        clearTimeout(handshakeTimer);
        handshakeTimer = null;
      }

      this.cleanupObjectURLs();

      isConnected = false;
      isReady = false;
      pendingState = null;
      messageCount = 0;
      lastUpdateKey = null;
      errorCount = 0;
      statusChangeListeners = [];
    }
  };

  // Expose to global environment
  global.WishMagicRuntimeBridge = WishMagicRuntimeBridge;

})(typeof window !== 'undefined' ? window : this);
