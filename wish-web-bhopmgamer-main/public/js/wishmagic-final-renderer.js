/**
 * WishMagic Final Wish Renderer & Published Experience Integration (Part 16)
 * =========================================================================
 * Production-grade final rendering engine for published celebration wishes.
 *
 * Guarantees that recipients experience the exact customized template
 * based on an immutable publish snapshot and locked template version.
 *
 * Architecture:
 * Published Wish URL (/w/:slug)
 *          │
 *          ├───> [Authoritative Public Wish API / SSR Data]
 *          │              │
 *          │              ▼
 *          ├───> [WishMagicFinalRenderer]
 *          │              │
 *          │      (Lifecycle Check: Upcoming / Active / Expired)
 *          │              │
 *          │      (Template Version Lock: Exact Published Version)
 *          │              │
 *          │      (Runtime Protocol & Sandbox Isolation)
 *          │              │
 *          ▼              ▼
 * Standalone Immersive Public Celebration Experience (Zero Customizer/Admin Artifacts)
 */

(function (global) {
  'use strict';

  const PROTOCOL_VERSION = '1.0';

  /**
   * Helper: Escape HTML entities for safe text rendering
   */
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Helper: Deep clone JSON-serializable objects
   */
  function deepClone(obj) {
    if (obj === undefined || obj === null) return obj;
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      if (Array.isArray(obj)) return obj.slice();
      if (typeof obj === 'object') return { ...obj };
      return obj;
    }
  }

  /**
   * WishMagic Published Snapshot Builder & Normalizer
   */
  const WishMagicSnapshotManager = {
    version: '1.0.0',

    /**
     * Creates an immutable published snapshot from validated customizer data & template
     */
    createPublishSnapshot(wishData = {}, template = {}, options = {}) {
      const wishId = wishData.id || wishData.wishId || `wm_${Date.now().toString(36)}`;
      const templateId = template.id || wishData.templateId || 'tpl_general';
      const templateVersionId = wishData.templateVersionId || template.versionId || template.templateVersionId || `tv_${templateId}_v${template.templateVersion || template.version || 1}`;

      const customData = wishData.customData || wishData.custom_data || {};
      const content = deepClone(wishData.content || {});
      // Ingest standard top-level fields & customData fields
      ['recipient_name', 'sender_name', 'custom_message', 'event_date', 'occasion', 'relationship', 'customSlug', 'slug', 'buyerName'].forEach(k => {
        if (content[k] === undefined) {
          if (wishData[k] !== undefined) content[k] = wishData[k];
          else if (customData[k] !== undefined) content[k] = customData[k];
        }
      });
      if (!content.recipient_name && customData.recipientName) content.recipient_name = customData.recipientName;
      if (!content.sender_name && customData.senderName) content.sender_name = customData.senderName;
      if (!content.custom_message && customData.customMessage) content.custom_message = customData.customMessage;

      const media = deepClone(wishData.media || {
        coverPhoto: wishData.cover_photo || wishData.photo_1 || null,
        photos: Array.isArray(wishData.photos) ? wishData.photos : [],
        music: wishData.music || { enabled: true },
        voiceNote: wishData.voice_note || { enabled: false },
        video: wishData.video || null,
        galleryLayout: wishData.galleryLayout || 'grid'
      });

      const sections = deepClone(wishData.sections || []);
      const visual = deepClone(wishData.visual || {
        theme: wishData.theme || 'magical',
        palette: wishData.activePalette || 'rose-gold',
        colors: wishData.colors || {},
        typography: wishData.typography || {},
        surfaces: wishData.surfaces || {},
        buttons: wishData.buttons || {}
      });

      const animations = deepClone(wishData.animations || wishData.effects || {
        master: true,
        particles: true,
        particleType: 'sparkles',
        confetti: true
      });

      const snapshot = {
        wishId,
        slug: wishData.slug || wishData.customSlug || wishId,
        templateId,
        templateVersionId,
        templateName: template.name || wishData.templateName || 'Celebration Experience',
        content,
        media,
        sections,
        visual,
        animations,
        schema: deepClone(template.schema || template.capabilities || {}),
        publishedAt: options.publishedAt || new Date().toISOString(),
        snapshotVersion: '1.0',
        tier: wishData.tier || (template.tier === 'vip' ? 'vip' : 'free'),
        isPrivate: Boolean(wishData.isPrivate)
      };

      return Object.freeze(snapshot);
    },

    /**
     * Normalizes incoming wish into standard published snapshot structure
     */
    normalizeWish(rawWish, rawTemplate = null) {
      if (!rawWish) return null;

      // If already an immutable published snapshot
      if (rawWish.publishedSnapshot && typeof rawWish.publishedSnapshot === 'object') {
        return rawWish.publishedSnapshot;
      }

      let customData = {};
      if (rawWish.customData && typeof rawWish.customData === 'object') {
        customData = rawWish.customData;
      } else if (typeof rawWish.customData === 'string') {
        try { customData = JSON.parse(rawWish.customData); } catch (e) {}
      } else if (rawWish.custom_data && typeof rawWish.custom_data === 'object') {
        customData = rawWish.custom_data;
      } else if (typeof rawWish.custom_data === 'string') {
        try { customData = JSON.parse(rawWish.custom_data); } catch (e) {}
      }

      const template = rawTemplate || {
        id: rawWish.templateId || rawWish.template_id || customData.templateId || 'tpl_general',
        templateVersionId: rawWish.templateVersionId || rawWish.template_version_id || customData.templateVersionId || `tv_${rawWish.templateId || 'tpl_general'}_v1`
      };

      return this.createPublishSnapshot({
        ...rawWish,
        ...customData
      }, template);
    }
  };

  /**
   * Final Wish Experience Renderer
   */
  class WishMagicFinalRendererEngine {
    constructor() {
      this.status = 'IDLE'; // IDLE | LOADING | ACTIVE | UPCOMING | EXPIRED | ERROR | DESTROYED
      this.container = null;
      this.publishedSnapshot = null;
      this.templateRecord = null;
      this.sandboxInstance = null;
      this.audioPlayer = null;
      this.isAudioPlaying = false;
      this.countdownInterval = null;
      this.eventListeners = [];
      this.diagnostics = {
        loadedAt: null,
        renderedAt: null,
        templateVersionId: null,
        lifecycle: null,
        errors: [],
        warnings: []
      };
    }

    /**
     * Load wish and template from API or SSR data
     */
    async load(slugOrWishId, options = {}) {
      this.status = 'LOADING';

      // 1. Fast-path: Check SSR Data
      if (typeof window !== 'undefined' && window.__SSR_WISH_DATA__ && window.__SSR_WISH_DATA__.wish) {
        const ssr = window.__SSR_WISH_DATA__;
        const normalized = WishMagicSnapshotManager.normalizeWish(ssr.wish, ssr.template);
        this.publishedSnapshot = normalized;
        this.templateRecord = ssr.template || null;
        this.diagnostics.loadedAt = new Date().toISOString();
        return { success: true, wish: normalized, template: this.templateRecord, fromSSR: true };
      }

      if (!slugOrWishId) {
        throw new Error('Wish ID or Slug is required for final rendering');
      }

      // 2. Fetch authoritative public wish data from server
      let wishRes;
      try {
        wishRes = await fetch(`/api/public/wishes/${encodeURIComponent(slugOrWishId)}`);
        if (!wishRes.ok) {
          wishRes = await fetch(`/api/wishes/${encodeURIComponent(slugOrWishId)}`);
        }
      } catch (networkErr) {
        this.status = 'ERROR';
        this.diagnostics.errors.push(`Network fetch failure: ${networkErr.message}`);
        throw networkErr;
      }

      const resData = await wishRes.json();
      if (!resData || !resData.success || !resData.wish) {
        this.status = 'ERROR';
        throw new Error((resData && resData.message) || 'Published wish not found or expired');
      }

      const rawWish = resData.wish;
      const rawTemplate = resData.template || null;

      this.publishedSnapshot = WishMagicSnapshotManager.normalizeWish(rawWish, rawTemplate);
      this.templateRecord = rawTemplate;
      this.diagnostics.loadedAt = new Date().toISOString();
      this.diagnostics.templateVersionId = this.publishedSnapshot.templateVersionId;

      return {
        success: true,
        wish: this.publishedSnapshot,
        template: this.templateRecord,
        rawWish
      };
    }

    /**
     * Validates snapshot & prevents arbitrary script execution
     */
    validate(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') {
        return { valid: false, error: 'Invalid published snapshot payload' };
      }

      if (!snapshot.wishId) {
        return { valid: false, error: 'Missing wishId in published snapshot' };
      }

      if (!snapshot.templateId || !snapshot.templateVersionId) {
        return { valid: false, error: 'Template version lock is missing in published snapshot' };
      }

      return { valid: true, error: null };
    }

    /**
     * Evaluate server-authoritative lifecycle status
     */
    evaluateLifecycle(snapshot) {
      if (global.WishLifecycle && typeof global.WishLifecycle.getWishStatus === 'function') {
        return global.WishLifecycle.getWishStatus(snapshot);
      }

      const rawDate = snapshot.content?.event_date || snapshot.eventDate || '';
      if (!rawDate) return 'active';

      const clean = String(rawDate).includes('T') ? String(rawDate).split('T')[0] : String(rawDate).trim();
      const parts = clean.split('-').map(Number);
      if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return 'active';

      const now = Date.now();
      // Asia/Kolkata (IST = UTC+5:30 = 330 mins)
      const istOffsetMs = 330 * 60 * 1000;
      const startOfDayMs = Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0) - istOffsetMs;
      const endOfDayMs = Date.UTC(parts[0], parts[1] - 1, parts[2] + 1, 0, 0, 0, 0) - istOffsetMs;

      if (now < startOfDayMs) return 'upcoming';
      if (now >= endOfDayMs) return 'expired';
      return 'active';
    }

    /**
     * Main Render Entry Point
     */
    async render(container, wishSnapshot = null, options = {}) {
      if (wishSnapshot) {
        this.publishedSnapshot = WishMagicSnapshotManager.normalizeWish(wishSnapshot, options.template);
      }

      if (!this.publishedSnapshot) {
        throw new Error('No published snapshot available to render');
      }

      const validation = this.validate(this.publishedSnapshot);
      if (!validation.valid) {
        this.renderError(container, validation.error);
        return;
      }

      this.container = typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.container) {
        throw new Error('Target container element not found in DOM');
      }

      // Check Lifecycle status
      const lifecycle = this.evaluateLifecycle(this.publishedSnapshot);
      this.status = lifecycle.toUpperCase();
      this.diagnostics.lifecycle = lifecycle;
      this.diagnostics.renderedAt = new Date().toISOString();

      // Clear previous container contents
      this.container.innerHTML = '';

      if (lifecycle === 'upcoming') {
        this.renderUpcomingView(this.container, this.publishedSnapshot);
      } else if (lifecycle === 'expired') {
        this.renderExpiredView(this.container, this.publishedSnapshot);
      } else {
        await this.renderActiveStoryView(this.container, this.publishedSnapshot);
      }
    }

    /**
     * Render Upcoming Waiting Page (Protected secrets, active countdown clock)
     */
    renderUpcomingView(container, snapshot) {
      const recipient = escapeHTML(snapshot.content?.recipient_name || 'Special Person');
      const sender = escapeHTML(snapshot.content?.sender_name || 'A Loved One');
      const eventDate = snapshot.content?.event_date || '';

      const wrapper = document.createElement('div');
      wrapper.className = 'wishmagic-waiting-screen min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 text-center text-white bg-slate-950 relative overflow-hidden';

      wrapper.innerHTML = `
        <!-- Background Ambient Glow -->
        <div class="absolute inset-0 bg-radial from-purple-900/30 via-slate-950 to-slate-950 pointer-events-none"></div>
        <div class="relative z-10 max-w-lg w-full space-y-6 animate-fade-in">
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 text-xs font-bold tracking-wider uppercase">
            <span>✨ Secret Celebration Gift</span>
          </div>

          <div class="relative mx-auto w-28 h-28 flex items-center justify-center">
            <div class="absolute inset-0 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 blur-xl opacity-60 animate-pulse"></div>
            <div class="relative text-6xl select-none">🎁</div>
          </div>

          <div class="space-y-2">
            <h1 class="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-purple-200 to-amber-200 font-display">
              A Special Surprise For ${recipient}
            </h1>
            <p class="text-sm text-purple-200/80">
              Crafted with heartfelt love by <span class="font-bold text-pink-300">${sender}</span>
            </p>
          </div>

          <div class="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl space-y-4">
            <p class="text-xs font-semibold text-purple-300 uppercase tracking-widest">Unwraps At Midnight (IST)</p>
            <div id="wm-upcoming-countdown" class="grid grid-cols-4 gap-2 text-center">
              <div class="p-2.5 rounded-xl bg-purple-950/60 border border-purple-800/40">
                <span id="wm-cd-days" class="block text-2xl font-black text-pink-400">00</span>
                <span class="text-[10px] text-purple-300 font-bold uppercase">Days</span>
              </div>
              <div class="p-2.5 rounded-xl bg-purple-950/60 border border-purple-800/40">
                <span id="wm-cd-hours" class="block text-2xl font-black text-pink-400">00</span>
                <span class="text-[10px] text-purple-300 font-bold uppercase">Hours</span>
              </div>
              <div class="p-2.5 rounded-xl bg-purple-950/60 border border-purple-800/40">
                <span id="wm-cd-minutes" class="block text-2xl font-black text-pink-400">00</span>
                <span class="text-[10px] text-purple-300 font-bold uppercase">Mins</span>
              </div>
              <div class="p-2.5 rounded-xl bg-purple-950/60 border border-purple-800/40">
                <span id="wm-cd-seconds" class="block text-2xl font-black text-pink-400">00</span>
                <span class="text-[10px] text-purple-300 font-bold uppercase">Secs</span>
              </div>
            </div>
            <p class="text-xs text-purple-300/60">Keep this special link saved! It unlocks automatically.</p>
          </div>
        </div>
      `;

      container.innerHTML = wrapper.innerHTML;
      container.appendChild(wrapper);
      this.startCountdownTimer(eventDate, () => {
        // Countdown reached zero -> Transition smoothly into Active Wish without page reload!
        this.render(container, snapshot);
      });
    }

    /**
     * Render Expired Experience
     */
    renderExpiredView(container, snapshot) {
      const recipient = escapeHTML(snapshot.content?.recipient_name || 'Special Person');
      const sender = escapeHTML(snapshot.content?.sender_name || 'A Loved One');

      const wrapper = document.createElement('div');
      wrapper.className = 'wishmagic-expired-screen min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 text-center text-white bg-slate-950 relative';

      wrapper.innerHTML = `
        <div class="relative z-10 max-w-md w-full p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl space-y-5 animate-fade-in">
          <div class="w-16 h-16 mx-auto rounded-full bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-3xl">
            ⏳
          </div>
          <div class="space-y-1.5">
            <h1 class="text-2xl font-bold text-white font-display">Celebration Keepsake Expired</h1>
            <p class="text-sm text-purple-200/80">
              The celebration link created by <span class="font-semibold text-pink-300">${sender}</span> for <span class="font-semibold text-pink-300">${recipient}</span> has concluded.
            </p>
          </div>
          <p class="text-xs text-purple-300/60">
            Wishes remain active for 24 hours from the celebration date. Memories live on in our hearts forever ✨
          </p>
          <div class="pt-2">
            <a href="/" class="inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-sm shadow-lg hover:brightness-110 transition active:scale-95">
              Create a New Wish Experience ✨
            </a>
          </div>
        </div>
      `;

      container.innerHTML = wrapper.innerHTML;
      container.appendChild(wrapper);
    }

    /**
     * Render Active Story View with Sandbox Isolation & Runtime Protocol
     */
    async renderActiveStoryView(container, snapshot) {
      const sandboxContainer = document.createElement('div');
      sandboxContainer.className = 'wishmagic-public-runtime-wrapper w-full h-full min-h-screen relative';
      container.appendChild(sandboxContainer);

      // 1. Initialize template sandbox frame if Part 13 sandbox is available
      if (global.WishMagicTemplateSandbox && typeof global.WishMagicTemplateSandbox.createSandbox === 'function') {
        const templateFolder = `/templates-store/${snapshot.templateId}`;
        const entryFile = `${templateFolder}/index.html`;

        try {
          this.sandboxInstance = global.WishMagicTemplateSandbox.createSandbox(
            sandboxContainer,
            entryFile,
            {
              templateId: snapshot.templateId,
              templateVersionId: snapshot.templateVersionId,
              data: snapshot,
              schema: snapshot.schema,
              interactive: true
            }
          );
        } catch (e) {
          console.warn('[WishMagicFinalRenderer] Sandbox initialization fallback:', e);
        }
      }

      // 2. Fallback to existing rich public wish renderer if present in DOM
      if (typeof global.renderWishLifecycleRouter === 'function') {
        try {
          global.renderWishLifecycleRouter(snapshot.content || snapshot, this.templateRecord || { id: snapshot.templateId });
        } catch (e) {
          console.warn('[WishMagicFinalRenderer] Existing renderer adapter warning:', e);
        }
      }

      // 3. Audio & Autoplay Fallback handling
      this.initAudioPlayback(snapshot.media?.music);
    }

    /**
     * Countdown Timer Engine
     */
    startCountdownTimer(targetDateStr, onZero) {
      if (!targetDateStr) return;
      if (this.countdownInterval) clearInterval(this.countdownInterval);

      const parts = targetDateStr.split('-').map(Number);
      if (parts.length !== 3) return;

      const istOffsetMs = 330 * 60 * 1000;
      const targetTime = Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0) - istOffsetMs;

      const tick = () => {
        const now = Date.now();
        const diff = targetTime - now;

        if (diff <= 0) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
          if (typeof onZero === 'function') onZero();
          return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const dEl = document.getElementById('wm-cd-days');
        const hEl = document.getElementById('wm-cd-hours');
        const mEl = document.getElementById('wm-cd-minutes');
        const sEl = document.getElementById('wm-cd-seconds');

        if (dEl) dEl.textContent = String(days).padStart(2, '0');
        if (hEl) hEl.textContent = String(hours).padStart(2, '0');
        if (mEl) mEl.textContent = String(minutes).padStart(2, '0');
        if (sEl) sEl.textContent = String(seconds).padStart(2, '0');
      };

      const initialNow = Date.now();
      if (targetTime - initialNow <= 0) {
        if (typeof onZero === 'function') onZero();
        return;
      }

      tick();
      this.countdownInterval = setInterval(tick, 1000);
    }

    /**
     * Audio Playback with Autoplay Restriction Fallback
     */
    initAudioPlayback(musicConfig) {
      if (!musicConfig || musicConfig.enabled === false) return;

      const src = musicConfig.src || musicConfig.url || '';
      if (!src) return;

      try {
        const audio = new Audio(src);
        audio.loop = true;
        this.audioPlayer = audio;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            this.isAudioPlaying = true;
          }).catch(() => {
            // Autoplay blocked by browser policy -> Display tap to play badge
            this.showAudioPlayBadge(audio);
          });
        }
      } catch (e) {
        console.warn('[WishMagicFinalRenderer] Audio playback notice:', e);
      }
    }

    showAudioPlayBadge(audio) {
      if (document.getElementById('wm-audio-floating-badge')) return;

      const badge = document.createElement('button');
      badge.id = 'wm-audio-floating-badge';
      badge.className = 'fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-full bg-purple-900/90 hover:bg-purple-850 border border-purple-500/40 text-white shadow-xl backdrop-blur-md text-xs font-bold transition-transform hover:scale-105 active:scale-95 animate-bounce-soft';
      badge.innerHTML = `<span>🎵</span><span>Play Music</span>`;

      badge.addEventListener('click', () => {
        audio.play().then(() => {
          this.isAudioPlaying = true;
          badge.innerHTML = `<span>🔊</span><span>Playing</span>`;
          setTimeout(() => badge.remove(), 2000);
        }).catch(() => {});
      });

      document.body.appendChild(badge);
    }

    /**
     * Render Error View
     */
    renderError(container, errorMessage) {
      this.status = 'ERROR';
      container.innerHTML = `
        <div class="min-h-screen w-full flex items-center justify-center p-6 text-center text-white bg-slate-950">
          <div class="max-w-md w-full p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl space-y-4">
            <div class="text-4xl select-none">✨</div>
            <h2 class="text-xl font-bold text-pink-300">Celebration Experience</h2>
            <p class="text-sm text-purple-200/80">This Wish is temporarily unavailable or undergoing preparation. Please check back shortly.</p>
            <div class="pt-2">
              <a href="/" class="inline-block text-xs font-bold text-purple-300 underline hover:text-white">Return to WishMagic Home</a>
            </div>
          </div>
        </div>
      `;
    }

    /**
     * Clean up all timers and resources
     */
    destroy() {
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
      if (this.audioPlayer) {
        try { this.audioPlayer.pause(); } catch (e) {}
        this.audioPlayer = null;
      }
      if (this.sandboxInstance && typeof this.sandboxInstance.destroySandbox === 'function') {
        try { this.sandboxInstance.destroySandbox(); } catch (e) {}
        this.sandboxInstance = null;
      }
      this.status = 'DESTROYED';
    }

    getState() {
      return {
        status: this.status,
        publishedSnapshot: this.publishedSnapshot,
        diagnostics: this.diagnostics,
        isAudioPlaying: this.isAudioPlaying
      };
    }
  }

  // Singleton instance
  const WishMagicFinalRenderer = new WishMagicFinalRendererEngine();

  // Export to global scope
  global.WishMagicSnapshotManager = WishMagicSnapshotManager;
  global.WishMagicFinalRenderer = WishMagicFinalRenderer;

})(typeof window !== 'undefined' ? window : globalThis);
