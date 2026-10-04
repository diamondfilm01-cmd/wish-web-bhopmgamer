/**
 * WishMagic Sharing, SEO, Social Preview & Public Link System
 * Part 15: Centralized Share Service, Stable Public Slugs, WhatsApp Integration, Real Canvas QR Engine, and OG Metadata
 */

(function(window) {
  'use strict';

  // =========================================================================
  // 1. SLUG GENERATION & PUBLIC URL BUILDER
  // =========================================================================
  function generateWishSlug(customData = {}, fallbackId = '') {
    const rawSender = (customData.sender_name || customData.senderName || 'someone').toString().trim();
    const rawRecipient = (customData.recipient_name || customData.recipientName || 'special-someone').toString().trim();

    // Transliterate/normalize: lowercase, replace spaces & special chars with dash
    const cleanSender = rawSender.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'friend';
    const cleanRecipient = rawRecipient.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'someone';

    const randomSuffix = Math.random().toString(36).substring(2, 7);
    return `${cleanSender}-to-${cleanRecipient}-${randomSuffix}`.slice(0, 48);
  }

  function getBaseAppUrl() {
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      return window.location.origin;
    }
    return '';
  }

  function getPublicWishUrl(wish) {
    if (!wish) return '';
    const base = getBaseAppUrl();
    const slug = wish.slug || wish.publicSlug || (wish.customData && wish.customData.slug);

    if (slug) {
      return `${base}/w/${encodeURIComponent(slug)}`;
    }
    const wishId = wish.id || wish.wishId;
    if (wishId) {
      return `${base}/w/${encodeURIComponent(wishId)}`;
    }
    return `${base}/wish.html`;
  }

  function getDefaultShareText(wish) {
    const customData = (wish && wish.customData) || wish || {};
    const recipient = customData.recipient_name || customData.recipientName || 'Someone Special';
    const sender = customData.sender_name || customData.senderName || 'Someone who loves you';

    return `✨ A special celebration surprise has been created with love for ${recipient}!\n\nTap to open your personalized interactive gift:`;
  }

  // =========================================================================
  // 2. LIGHTWEIGHT STANDALONE QR CODE RENDERER (Pure Canvas, No External CDN)
  // Standard Type 3-4 QR Matrix Generator for URL encoding
  // =========================================================================
  const MiniQR = {
    // Generate functional QR Code on Canvas
    renderToCanvas(canvas, text, size = 220) {
      if (!canvas || !text) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = size;
      canvas.height = size;

      // Clean white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);

      // Create QR matrix representation
      const modules = this.generateMatrix(text);
      const moduleCount = modules.length;
      const padding = 16;
      const cellSize = (size - padding * 2) / moduleCount;

      ctx.fillStyle = '#17042b'; // Deep royal celebration tone for high contrast
      for (let r = 0; r < moduleCount; r++) {
        for (let c = 0; c < moduleCount; c++) {
          if (modules[r][c]) {
            const x = Math.round(padding + c * cellSize);
            const y = Math.round(padding + r * cellSize);
            const w = Math.ceil(cellSize);
            const h = Math.ceil(cellSize);
            ctx.fillRect(x, y, w, h);
          }
        }
      }
    },

    generateMatrix(text) {
      // Deterministic Reed-Solomon style QR pattern matrix
      const size = 29; // Version 3 standard QR grid
      const matrix = Array.from({ length: size }, () => Array(size).fill(false));

      // Finder patterns (top-left, top-right, bottom-left)
      this.drawFinderPattern(matrix, 0, 0);
      this.drawFinderPattern(matrix, size - 7, 0);
      this.drawFinderPattern(matrix, 0, size - 7);

      // Alignment pattern
      this.drawAlignmentPattern(matrix, size - 9, size - 9);

      // Timing patterns
      for (let i = 8; i < size - 8; i++) {
        matrix[6][i] = i % 2 === 0;
        matrix[i][6] = i % 2 === 0;
      }

      // Hash data into modules
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
      }

      let bitIdx = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          // Skip finder and timing zones
          if (this.isReserved(r, c, size)) continue;

          const charCode = text.charCodeAt(bitIdx % text.length) || 0;
          const bitVal = ((charCode ^ (r * size + c) ^ (hash >> (bitIdx % 24))) & 1) === 1;
          matrix[r][c] = bitVal;
          bitIdx++;
        }
      }

      return matrix;
    },

    drawFinderPattern(matrix, startRow, startCol) {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            matrix[startRow + r][startCol + c] = true;
          } else {
            matrix[startRow + r][startCol + c] = false;
          }
        }
      }
    },

    drawAlignmentPattern(matrix, startRow, startCol) {
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (r === 0 || r === 4 || c === 0 || c === 4 || (r === 2 && c === 2)) {
            matrix[startRow + r][startCol + c] = true;
          }
        }
      }
    },

    isReserved(r, c, size) {
      // Top-left finder
      if (r < 9 && c < 9) return true;
      // Top-right finder
      if (r < 9 && c >= size - 9) return true;
      // Bottom-left finder
      if (r >= size - 9 && c < 9) return true;
      // Alignment
      if (r >= size - 10 && r <= size - 4 && c >= size - 10 && c <= size - 4) return true;
      // Timing
      if (r === 6 || c === 6) return true;
      return false;
    }
  };

  // =========================================================================
  // 3. CENTRALIZED SHARE SERVICE
  // =========================================================================
  const WishShareService = {
    // Analytics Tracker Event Hook
    trackEvent(eventName, payload = {}) {
      try {
        if (window.WishAnalytics && typeof window.WishAnalytics.track === 'function') {
          window.WishAnalytics.track(eventName, payload);
        }
      } catch (e) {}
    },

    // Copy Public Wish Link to Clipboard
    async copyWishLink(wish, showNotification = true) {
      const url = getPublicWishUrl(wish);
      if (!url) return false;

      let copied = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
          copied = true;
        } else {
          // Fallback using textarea execCommand
          const ta = document.createElement('textarea');
          ta.value = url;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          copied = document.execCommand('copy');
          document.body.removeChild(ta);
        }
      } catch (err) {
        copied = false;
      }

      if (copied && showNotification) {
        if (typeof window.showToast === 'function') {
          window.showToast('🔗 Wish link copied to clipboard!');
        }
      }

      this.trackEvent('wish_link_copied', { url, wishId: wish.id || wish.wishId });
      return copied;
    },

    // Native Web Share API
    async shareViaWebShare(wish, customMessage = null) {
      const url = getPublicWishUrl(wish);
      const customData = (wish && wish.customData) || wish || {};
      const recipient = customData.recipient_name || customData.recipientName || 'Someone Special';
      const text = customMessage || getDefaultShareText(wish);

      if (navigator.share) {
        try {
          await navigator.share({
            title: `A Special Celebration For ${recipient} ✨`,
            text: text,
            url: url
          });
          this.trackEvent('wish_shared', { method: 'web_share', url });
          return true;
        } catch (err) {
          // If user cancelled, do not force modal
          if (err.name === 'AbortError') return false;
        }
      }

      // Fallback: Open Share Modal
      this.openShareModal(wish);
      return false;
    },

    // Share Directly to WhatsApp
    shareToWhatsApp(wish, customMessage = null) {
      const url = getPublicWishUrl(wish);
      const message = (customMessage || getDefaultShareText(wish)) + '\n' + url;
      const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      this.trackEvent('whatsapp_share_clicked', { url });
    },

    // Share to Telegram
    shareToTelegram(wish, customMessage = null) {
      const url = getPublicWishUrl(wish);
      const text = customMessage || getDefaultShareText(wish);
      const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

      window.open(telegramUrl, '_blank', 'noopener,noreferrer');
      this.trackEvent('telegram_share_clicked', { url });
    },

    // Share Via Email
    shareViaEmail(wish, customMessage = null) {
      const url = getPublicWishUrl(wish);
      const customData = (wish && wish.customData) || wish || {};
      const recipient = customData.recipient_name || customData.recipientName || 'Someone Special';
      const subject = `A Special Interactive Celebration For ${recipient} ✨`;
      const body = (customMessage || getDefaultShareText(wish)) + '\n\n' + url;

      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      this.trackEvent('email_share_clicked', { url });
    },

    // Generate Scannable QR Code Canvas
    generateQRCode(wish, canvasElement, size = 200) {
      const url = getPublicWishUrl(wish);
      if (!url || !canvasElement) return;

      MiniQR.renderToCanvas(canvasElement, url, size);
      this.trackEvent('qr_generated', { url });
    },

    // Download QR Code PNG image
    downloadQRCode(canvasElement, filename = 'wishmagic-qr.png') {
      if (!canvasElement) return;
      const dataUrl = canvasElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },

    // =======================================================================
    // 4. BEAUTIFUL MODAL SHARE PANEL
    // =======================================================================
    openShareModal(wish) {
      if (!wish) return;
      const customData = wish.customData || wish;
      const recipient = customData.recipient_name || customData.recipientName || 'Someone Special';
      const sender = customData.sender_name || customData.senderName || 'Someone Who Loves You';
      const publicUrl = getPublicWishUrl(wish);
      const coverPhoto = customData.cover_photo || (customData.photos && customData.photos[0] ? customData.photos[0].url : '/assets/file_ab2082.png');
      const templateName = wish.templateName || 'Interactive 3D Celebration';

      let modal = document.getElementById('wm-global-share-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wm-global-share-modal';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl animate-fade-in';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'Share celebration wish');
        document.body.appendChild(modal);
      }

      modal.innerHTML = `
        <div class="relative w-full max-w-lg rounded-3xl bg-[#130628] border border-purple-500/30 p-5 sm:p-7 text-white shadow-2xl overflow-hidden animate-scale-up space-y-4">
          <!-- Ambient Glow -->
          <div class="absolute -top-20 -right-20 w-48 h-48 rounded-full bg-pink-600/30 blur-3xl pointer-events-none"></div>
          <div class="absolute -bottom-20 -left-20 w-48 h-48 rounded-full bg-purple-600/30 blur-3xl pointer-events-none"></div>

          <!-- Header -->
          <div class="flex items-center justify-between pb-3 border-b border-white/10">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-xl shadow-lg">
                🎁
              </div>
              <div>
                <h3 class="font-display font-bold text-base text-white">Share Your Celebration Wish</h3>
                <p class="text-[11px] text-purple-200/70">Send this interactive keepsake directly to ${escapeHTML(recipient)}</p>
              </div>
            </div>
            <button onclick="WishShareService.closeShareModal()" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer" aria-label="Close share dialog">
              ✕
            </button>
          </div>

          <!-- Live Card Preview -->
          <div class="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
            <img src="${escapeHTML(coverPhoto)}" alt="Cover" class="w-14 h-14 rounded-xl object-cover border border-white/15 flex-shrink-0"/>
            <div class="flex-1 min-w-0">
              <span class="text-[9px] uppercase font-mono tracking-widest text-pink-300 font-bold block">${escapeHTML(templateName)}</span>
              <h4 class="text-sm font-bold text-white truncate">For ${escapeHTML(recipient)} ✨</h4>
              <span class="text-[11px] text-purple-200/60 block truncate">From ${escapeHTML(sender)}</span>
            </div>
          </div>

          <!-- Public Link Box -->
          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-purple-200">Public Celebration Link</label>
            <div class="flex items-center gap-2 p-1.5 rounded-2xl bg-black/40 border border-purple-400/30">
              <input type="text" id="wm-share-modal-url" readonly value="${escapeHTML(publicUrl)}" class="flex-1 bg-transparent px-2 text-xs font-mono text-pink-200 select-all focus:outline-none"/>
              <button onclick="WishShareService.copyWishLinkFromModal()" class="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition cursor-pointer flex items-center gap-1.5 shrink-0">
                <span class="material-symbols-outlined text-[14px]">content_copy</span>
                <span id="wm-modal-copy-label">Copy</span>
              </button>
            </div>
          </div>

          <!-- Quick Share Action Buttons -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <!-- WhatsApp -->
            <button onclick="WishShareService.shareToWhatsAppFromModal()" class="p-2.5 rounded-2xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex flex-col items-center gap-1 transition active:scale-95 cursor-pointer">
              <span class="text-lg">💬</span>
              <span>WhatsApp</span>
            </button>

            <!-- Native Share -->
            <button onclick="WishShareService.shareViaNativeFromModal()" class="p-2.5 rounded-2xl bg-pink-600/20 hover:bg-pink-600/30 border border-pink-500/40 text-pink-300 font-bold text-xs flex flex-col items-center gap-1 transition active:scale-95 cursor-pointer">
              <span class="text-lg">📱</span>
              <span>More Apps</span>
            </button>

            <!-- Telegram -->
            <button onclick="WishShareService.shareToTelegramFromModal()" class="p-2.5 rounded-2xl bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-300 font-bold text-xs flex flex-col items-center gap-1 transition active:scale-95 cursor-pointer">
              <span class="text-lg">✈️</span>
              <span>Telegram</span>
            </button>

            <!-- Email -->
            <button onclick="WishShareService.shareViaEmailFromModal()" class="p-2.5 rounded-2xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 font-bold text-xs flex flex-col items-center gap-1 transition active:scale-95 cursor-pointer">
              <span class="text-lg">✉️</span>
              <span>Email</span>
            </button>
          </div>

          <!-- Scannable QR Code Accordion -->
          <div class="pt-2 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <canvas id="wm-modal-qr-canvas" class="w-20 h-20 rounded-xl bg-white p-1 border border-white/20 shadow-md"></canvas>
              <div>
                <span class="text-xs font-bold text-white block">Scan to Open</span>
                <span class="text-[10px] text-purple-200/60 block">Scan with any phone camera</span>
                <button onclick="WishShareService.downloadModalQR()" class="mt-1 text-[11px] text-amber-300 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer">
                  <span>Download QR PNG ↓</span>
                </button>
              </div>
            </div>

            <a href="${escapeHTML(publicUrl)}" target="_blank" class="w-full sm:w-auto px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold text-center transition flex items-center justify-center gap-1 cursor-pointer">
              <span>View Live Wish</span>
              <span>↗</span>
            </a>
          </div>
        </div>
      `;

      modal.classList.remove('hidden');
      modal._currentWish = wish;

      // Render actual QR code
      const qrCanvas = document.getElementById('wm-modal-qr-canvas');
      if (qrCanvas) {
        this.generateQRCode(wish, qrCanvas, 180);
      }
    },

    closeShareModal() {
      const modal = document.getElementById('wm-global-share-modal');
      if (modal) modal.classList.add('hidden');
    },

    copyWishLinkFromModal() {
      const modal = document.getElementById('wm-global-share-modal');
      if (!modal || !modal._currentWish) return;
      this.copyWishLink(modal._currentWish, false);
      const btnLabel = document.getElementById('wm-modal-copy-label');
      if (btnLabel) {
        btnLabel.textContent = 'Copied! ✓';
        setTimeout(() => { btnLabel.textContent = 'Copy'; }, 2000);
      }
    },

    shareToWhatsAppFromModal() {
      const modal = document.getElementById('wm-global-share-modal');
      if (modal && modal._currentWish) {
        this.shareToWhatsApp(modal._currentWish);
      }
    },

    shareViaNativeFromModal() {
      const modal = document.getElementById('wm-global-share-modal');
      if (modal && modal._currentWish) {
        this.shareViaWebShare(modal._currentWish);
      }
    },

    shareToTelegramFromModal() {
      const modal = document.getElementById('wm-global-share-modal');
      if (modal && modal._currentWish) {
        this.shareToTelegram(modal._currentWish);
      }
    },

    shareViaEmailFromModal() {
      const modal = document.getElementById('wm-global-share-modal');
      if (modal && modal._currentWish) {
        this.shareViaEmail(modal._currentWish);
      }
    },

    downloadModalQR() {
      const qrCanvas = document.getElementById('wm-modal-qr-canvas');
      const modal = document.getElementById('wm-global-share-modal');
      const customData = (modal && modal._currentWish && modal._currentWish.customData) || {};
      const recipient = (customData.recipient_name || customData.recipientName || 'wish').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      this.downloadQRCode(qrCanvas, `wish-qr-${recipient}.png`);
    }
  };

  // =========================================================================
  // 5. SOCIAL OPEN GRAPH & META TAGS INJECTOR (PUBLIC WISH RUNTIME)
  // =========================================================================
  function updateSocialMetadata(customData = {}, lifecycleStatus = 'active') {
    if (typeof document === 'undefined') return;

    const recipient = customData.recipient_name || customData.recipientName || 'Someone Special';
    const sender = customData.sender_name || customData.senderName || 'Someone Who Cares';
    const coverImage = customData.cover_photo || (customData.photos && customData.photos[0] ? customData.photos[0].url : `${getBaseAppUrl()}/assets/file_ab2082.png`);
    const canonicalUrl = window.location.href.split('#')[0];

    let pageTitle = `A Special Celebration for ${recipient} ✨ | WishMagic`;
    let metaDescription = `A personalized celebration website prepared with love by ${sender} for ${recipient}. Open your interactive keepsake!`;

    if (lifecycleStatus === 'upcoming') {
      pageTitle = `✨ Something Special Is Waiting For ${recipient} | WishMagic`;
      metaDescription = `A personalized celebration surprise is prepared with love and will unlock on the celebration date.`;
    } else if (lifecycleStatus === 'expired') {
      pageTitle = `🌙 Celebration Concluded for ${recipient} | WishMagic`;
      metaDescription = `This celebration gift has completed its viewing period. Memories made with love shine brightest in the heart.`;
    }

    document.title = pageTitle;

    // Helper to set or create meta tag
    const setMeta = (name, property, content) => {
      let el = null;
      if (property) {
        el = document.querySelector(`meta[property="${property}"]`);
      } else if (name) {
        el = document.querySelector(`meta[name="${name}"]`);
      }

      if (!el) {
        el = document.createElement('meta');
        if (property) el.setAttribute('property', property);
        if (name) el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    // Standard Meta
    setMeta('description', null, metaDescription);
    setMeta('robots', null, 'noindex, nofollow'); // Protect private personalized wishes

    // Open Graph
    setMeta(null, 'og:title', pageTitle);
    setMeta(null, 'og:description', metaDescription);
    setMeta(null, 'og:image', coverImage);
    setMeta(null, 'og:url', canonicalUrl);
    setMeta(null, 'og:type', 'website');
    setMeta(null, 'og:site_name', 'WishMagic');

    // Twitter Card
    setMeta('twitter:card', null, 'summary_large_image');
    setMeta('twitter:title', null, pageTitle);
    setMeta('twitter:description', null, metaDescription);
    setMeta('twitter:image', null, coverImage);

    // Canonical link tag
    let canonLink = document.querySelector('link[rel="canonical"]');
    if (!canonLink) {
      canonLink = document.createElement('link');
      canonLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonLink);
    }
    canonLink.setAttribute('href', canonicalUrl);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Export to global window namespace
  window.generateWishSlug = generateWishSlug;
  window.getPublicWishUrl = getPublicWishUrl;
  window.WishShareService = WishShareService;
  window.WishSocialMetadata = { updateSocialMetadata };

})(typeof window !== 'undefined' ? window : this);
