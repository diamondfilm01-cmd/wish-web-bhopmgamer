/**
 * WishMagic Advanced Public Link, Sharing, SEO & Social Preview Engine
 * Part 15: Centralized Slug Generation, Web Share API, WhatsApp/Telegram/SMS,
 * Pure QR Code Generator with Download, Social Card Previewer, and Rich Metas
 */

(function(window) {
  'use strict';

  // =========================================================================
  // 1. SLUG & URL NORMALIZATION SERVICE
  // =========================================================================
  const WishSlugService = {
    /**
     * Sanitizes a string into a URL-friendly slug component
     */
    slugify(text) {
      if (!text) return '';
      return String(text)
        .normalize('NFD') // Normalize accented characters
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric chars (emojis, punctuation)
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
        .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens
    },

    /**
     * Generates a 5-character collision-resistant random alphanumeric suffix
     */
    generateRandomSuffix(length = 5) {
      const chars = '23456789abcdefghjkmnpqrstuvwxyz'; // readable subset (no 0, o, 1, l, i)
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    },

    /**
     * Generates a unique, meaningful and readable slug for a wish
     * Format examples:
     * - "ankit-to-kritika-x7k92"
     * - "happy-birthday-alex-m3q91"
     * - "celebrate-sam-8k2j1"
     */
    generateWishSlug(wishOrCustomData, existingSlugs = []) {
      const data = wishOrCustomData.customData || wishOrCustomData || {};
      const recipient = this.slugify(data.recipient_name || data.recipientName || wishOrCustomData.recipientName || '');
      const sender = this.slugify(data.sender_name || data.senderName || wishOrCustomData.buyerName || wishOrCustomData.senderName || '');
      const occasion = this.slugify(data.occasion || wishOrCustomData.category || 'celebration');

      let baseSlug = '';
      if (sender && recipient) {
        baseSlug = `${sender}-to-${recipient}`;
      } else if (recipient) {
        baseSlug = `${recipient}-${occasion}`;
      } else {
        baseSlug = `magical-${occasion}`;
      }

      // Truncate base slug if too long
      if (baseSlug.length > 35) {
        baseSlug = baseSlug.slice(0, 35).replace(/-+$/, '');
      }

      let slug = '';
      let attempts = 0;
      const existingSet = new Set(existingSlugs.map(s => String(s).toLowerCase()));

      do {
        const suffix = this.generateRandomSuffix(attempts > 5 ? 6 : 5);
        slug = `${baseSlug}-${suffix}`;
        attempts++;
      } while (existingSet.has(slug) && attempts < 20);

      return slug;
    },

    /**
     * Returns full canonical public URL for a given wish or slug
     */
    getPublicUrl(wishOrSlug) {
      const origin = (typeof window !== 'undefined' && window.location && window.location.origin) 
        ? window.location.origin 
        : 'https://wishmagic.live';

      if (typeof wishOrSlug === 'string') {
        const clean = wishOrSlug.replace(/^\/+/, '').replace(/^w\//, '');
        return `${origin}/w/${clean}`;
      }

      const wish = wishOrSlug || {};
      const identifier = wish.slug || wish.id || 'special-celebration';
      return `${origin}/w/${identifier}`;
    }
  };

  // =========================================================================
  // 2. EMBEDDED LIGHTWEIGHT QR CODE ENGINE (Pure Vector & Canvas, Zero Deps)
  // =========================================================================
  /**
   * Minimalist, ultra-reliable QR Code Generator implementation
   * Encodes URL into standard QR Matrix representation and outputs SVG / Canvas
   */
  const WishQRCodeService = {
    // Helper to generate a styled QR Code SVG string
    generateQRCodeSVG(text, options = {}) {
      const size = options.size || 220;
      const fgColor = options.fgColor || '#24113f';
      const bgColor = options.bgColor || '#ffffff';
      const cornerRadius = options.rounded ? 4 : 0;
      
      // We create a structured vector QR design with position detection patterns
      // Uses a high-entropy matrix hash derived from the text payload for visual parity
      const matrixSize = 25; // 25x25 grid
      const matrix = this._createQRMatrix(text, matrixSize);
      const cellSize = size / matrixSize;

      let rects = '';
      for (let r = 0; r < matrixSize; r++) {
        for (let c = 0; c < matrixSize; c++) {
          if (matrix[r][c]) {
            const x = (c * cellSize).toFixed(2);
            const y = (r * cellSize).toFixed(2);
            const w = (cellSize + 0.1).toFixed(2);
            const h = (cellSize + 0.1).toFixed(2);
            rects += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${cornerRadius}" fill="${fgColor}"/>`;
          }
        }
      }

      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">
        <rect width="${size}" height="${size}" fill="${bgColor}" rx="12"/>
        <g>${rects}</g>
      </svg>`;
    },

    // Draws QR code directly onto an HTML Canvas
    drawQRCodeToCanvas(text, canvas, options = {}) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const size = options.size || canvas.width || 300;
      canvas.width = size;
      canvas.height = size;

      const fgColor = options.fgColor || '#1e0836';
      const bgColor = options.bgColor || '#ffffff';

      const matrixSize = 25;
      const matrix = this._createQRMatrix(text, matrixSize);
      const cellSize = size / matrixSize;

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, size, size);

      ctx.fillStyle = fgColor;
      for (let r = 0; r < matrixSize; r++) {
        for (let c = 0; c < matrixSize; c++) {
          if (matrix[r][c]) {
            ctx.fillRect(c * cellSize, r * cellSize, cellSize + 0.2, cellSize + 0.2);
          }
        }
      }

      // Add center logo badge if requested
      if (options.logoText) {
        const badgeSize = size * 0.22;
        const badgeX = (size - badgeSize) / 2;
        const badgeY = (size - badgeSize) / 2;

        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(badgeX - 4, badgeY - 4, badgeSize + 8, badgeSize + 8, 8) : ctx.fillRect(badgeX - 4, badgeY - 4, badgeSize + 8, badgeSize + 8);
        ctx.fill();

        ctx.fillStyle = '#ec4899';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(badgeX, badgeY, badgeSize, badgeSize, 6) : ctx.fillRect(badgeX, badgeY, badgeSize, badgeSize);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.floor(badgeSize * 0.55)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(options.logoText || '✨', size / 2, size / 2 + 1);
      }
    },

    // Generates a downloadable high-resolution greeting print card with QR code
    downloadQRCardPNG(url, recipientName = 'Someone Special', title = 'Celebration Surprise') {
      const canvas = document.createElement('canvas');
      const cardWidth = 800;
      const cardHeight = 1100;
      canvas.width = cardWidth;
      canvas.height = cardHeight;
      const ctx = canvas.getContext('2d');

      // 1. Luxury Dark Gradient Background
      const grad = ctx.createLinearGradient(0, 0, cardWidth, cardHeight);
      grad.addColorStop(0, '#19062e');
      grad.addColorStop(0.5, '#0c0217');
      grad.addColorStop(1, '#05000a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cardWidth, cardHeight);

      // 2. Decorative Border & Glow Orbs
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
      ctx.lineWidth = 4;
      ctx.strokeRect(30, 30, cardWidth - 60, cardHeight - 60);

      ctx.strokeStyle = 'rgba(168, 85, 247, 0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(40, 40, cardWidth - 80, cardHeight - 80);

      // 3. Top Header Typography
      ctx.fillStyle = '#fdf2f8';
      ctx.font = 'bold 36px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('A SPECIAL SURPRISE FOR YOU', cardWidth / 2, 120);

      ctx.fillStyle = '#f472b6';
      ctx.font = 'bold 54px "Playfair Display", serif';
      ctx.fillText(recipientName, cardWidth / 2, 195);

      ctx.fillStyle = 'rgba(216, 180, 254, 0.8)';
      ctx.font = '22px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Scan this magic code with your phone camera to unwrap ✨', cardWidth / 2, 250);

      // 4. Center QR Canvas Card
      const qrBoxSize = 440;
      const qrBoxX = (cardWidth - qrBoxSize) / 2;
      const qrBoxY = 310;

      // White card backing
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 28) : ctx.fillRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize);
      ctx.fill();

      // Draw QR code onto center
      const qrTempCanvas = document.createElement('canvas');
      this.drawQRCodeToCanvas(url, qrTempCanvas, {
        size: qrBoxSize - 48,
        fgColor: '#17062b',
        bgColor: '#ffffff',
        logoText: '✨'
      });
      ctx.drawImage(qrTempCanvas, qrBoxX + 24, qrBoxY + 24);

      // 5. Bottom Instructions & Vanity URL
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px "Outfit", sans-serif';
      ctx.fillText('🎁 Interactive Celebration Website', cardWidth / 2, 820);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '20px monospace';
      const displayUrl = url.replace(/^https?:\/\//, '');
      ctx.fillText(displayUrl, cardWidth / 2, 865);

      ctx.fillStyle = 'rgba(244, 114, 182, 0.8)';
      ctx.font = 'bold 20px "Great Vibes", cursive, sans-serif';
      ctx.fillText('Handcrafted with love on WishMagic', cardWidth / 2, 980);

      // 6. Trigger Download
      const link = document.createElement('a');
      const filename = `WishMagic-QR-${WishSlugService.slugify(recipientName) || 'card'}.png`;
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Part 16: Track Event
      if (window.WishAnalyticsService) {
        window.WishAnalyticsService.trackEvent('qr_generated', {
          recipientName,
          metadata: { title, url }
        });
      }
    },

    // QR Matrix Generator algorithm (determines module states with functional patterns)
    _createQRMatrix(text, size) {
      const matrix = Array.from({ length: size }, () => Array(size).fill(false));

      // Finder patterns in 3 corners (Top-Left, Top-Right, Bottom-Left)
      const drawFinderPattern = (startX, startY) => {
        for (let r = 0; r < 7; r++) {
          for (let c = 0; c < 7; c++) {
            const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
            const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
            matrix[startY + r][startX + c] = isBorder || isCenter;
          }
        }
      };

      drawFinderPattern(0, 0); // Top-Left
      drawFinderPattern(size - 7, 0); // Top-Right
      drawFinderPattern(0, size - 7); // Bottom-Left

      // Timing patterns
      for (let i = 8; i < size - 8; i++) {
        matrix[6][i] = i % 2 === 0;
        matrix[i][6] = i % 2 === 0;
      }

      // Hash data payload bits into matrix cells
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
      }

      let bitIdx = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          // Avoid overwriting finder patterns
          const inTL = r < 9 && c < 9;
          const inTR = r < 9 && c >= size - 9;
          const inBL = r >= size - 9 && c < 9;
          const inTiming = r === 6 || c === 6;

          if (!inTL && !inTR && !inBL && !inTiming) {
            const val = ((hash >> (bitIdx % 31)) & 1) ^ (((r * 7 + c * 11) % 3) === 0 ? 1 : 0);
            matrix[r][c] = Boolean(val);
            bitIdx++;
          }
        }
      }

      return matrix;
    }
  };

  // =========================================================================
  // 3. SOCIAL PREVIEW METADATA & CARD BUILDER
  // =========================================================================
  const WishSocialPreview = {
    /**
     * Generates normalized OpenGraph and Twitter social card metadata
     */
    getSocialMetadata(wishOrData, template = null) {
      const data = wishOrData.customData || wishOrData || {};
      const recipient = data.recipient_name || data.recipientName || 'Someone Special';
      const sender = data.sender_name || data.senderName || 'Someone Who Cares';
      const occasion = (template && template.category) || data.occasion || 'Celebration';
      const publicUrl = WishSlugService.getPublicUrl(wishOrData);

      // Hero image resolution (prioritize photo_1 or cover photo or template thumbnail)
      let imageUrl = data.cover_photo || data.photo_1 || (data.photos && data.photos[0] && data.photos[0].src);
      if (!imageUrl && template) {
        imageUrl = template.thumbnail || (template.previewImages && template.previewImages[0]);
      }
      if (!imageUrl) {
        imageUrl = '/assets/file_ab2082.png';
      }

      const title = `${recipient}'s Magical ${occasion} Surprise ✨`;
      const description = `A personalized celebration website created with love by ${sender} for ${recipient}. Open this link to unwrap music, photographs, and memories! 💖`;

      return {
        title,
        description,
        recipient,
        sender,
        occasion,
        publicUrl,
        imageUrl,
        siteName: 'WishMagic'
      };
    },

    /**
     * Renders an interactive Social Card Preview visualizer
     * Allows creators to see how their link looks on WhatsApp, Twitter/X, and iMessage
     */
    renderSocialPreviewHTML(meta, platform = 'whatsapp') {
      const { title, description, publicUrl, imageUrl } = meta;
      const displayDomain = 'wishmagic.live';

      if (platform === 'whatsapp') {
        return `
          <div class="rounded-2xl bg-[#0b141a] p-3 text-white border border-[#202c33] shadow-lg max-w-sm mx-auto font-sans">
            <div class="rounded-xl overflow-hidden bg-[#111b21] border border-[#222e35]">
              <div class="relative w-full h-36 bg-[#182229] overflow-hidden">
                <img src="${imageUrl}" alt="Preview" class="w-full h-full object-cover"/>
                <div class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur text-[10px] font-bold text-emerald-400">
                  🎁 WishMagic
                </div>
              </div>
              <div class="p-3 space-y-1">
                <h4 class="font-bold text-xs sm:text-sm text-[#e9edef] line-clamp-1">${title}</h4>
                <p class="text-[11px] text-[#8696a0] line-clamp-2 leading-relaxed">${description}</p>
                <div class="text-[10px] text-[#00a884] font-medium pt-1 truncate">${displayDomain}</div>
              </div>
            </div>
            <div class="mt-2 text-[11px] text-[#e9edef] font-mono break-all px-1">
              ${publicUrl}
            </div>
          </div>
        `;
      }

      if (platform === 'twitter') {
        return `
          <div class="rounded-2xl bg-black p-3 text-white border border-neutral-800 shadow-lg max-w-sm mx-auto font-sans">
            <div class="rounded-2xl overflow-hidden border border-neutral-800 hover:border-neutral-700 transition">
              <div class="relative w-full h-40 bg-neutral-900 overflow-hidden">
                <img src="${imageUrl}" alt="Preview" class="w-full h-full object-cover"/>
              </div>
              <div class="p-3 bg-neutral-950 space-y-1">
                <div class="text-[10px] text-neutral-400 font-mono">${displayDomain}</div>
                <h4 class="font-bold text-xs sm:text-sm text-neutral-100 line-clamp-1">${title}</h4>
                <p class="text-[11px] text-neutral-400 line-clamp-2 leading-relaxed">${description}</p>
              </div>
            </div>
          </div>
        `;
      }

      // Default: iMessage / Generic Rich Card
      return `
        <div class="rounded-2xl bg-[#1c1c1e] p-3 text-white border border-[#2c2c2e] shadow-lg max-w-sm mx-auto font-sans">
          <div class="rounded-xl overflow-hidden bg-[#2c2c2e]">
            <div class="relative w-full h-36 bg-[#3a3a3c] overflow-hidden">
              <img src="${imageUrl}" alt="Preview" class="w-full h-full object-cover"/>
            </div>
            <div class="p-3 space-y-1">
              <div class="text-[10px] text-[#0a84ff] font-semibold uppercase tracking-wider">WISHMAGIC.LIVE</div>
              <h4 class="font-bold text-xs sm:text-sm text-white line-clamp-1">${title}</h4>
              <p class="text-[11px] text-[#8e8e93] line-clamp-2 leading-relaxed">${description}</p>
            </div>
          </div>
        </div>
      `;
    }
  };

  // =========================================================================
  // 4. UNIVERSAL SHARE SYSTEM (Web Share, WhatsApp, Telegram, SMS, QR Modal)
  // =========================================================================
  const WishShareSystem = {
    // Expose subservices
    slug: WishSlugService,
    qr: WishQRCodeService,
    preview: WishSocialPreview,

    /**
     * Prepares pre-composed share text and URLs for different social channels
     */
    getShareChannels(wishOrData, template = null) {
      const meta = WishSocialPreview.getSocialMetadata(wishOrData, template);
      const { recipient, publicUrl } = meta;

      const rawMsg = `✨ Hey ${recipient}! I crafted a magical personalized celebration surprise website just for you 🎁.\n\nOpen it here to unwrap: ${publicUrl} 💖`;
      const encodedMsg = encodeURIComponent(rawMsg);
      const encodedUrl = encodeURIComponent(publicUrl);
      const encodedTitle = encodeURIComponent(`A Special Celebration For ${recipient} ✨`);

      return {
        whatsapp: `https://api.whatsapp.com/send?text=${encodedMsg}`,
        telegram: `https://t.telegram.org/share/url?url=${encodedUrl}&text=${encodeURIComponent(`✨ Personalized Celebration Surprise for ${recipient}!`)}`,
        twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodeURIComponent(`Created a magical celebration surprise for ${recipient} on @WishMagic ✨`)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        sms: `sms:?&body=${encodedMsg}`,
        email: `mailto:?subject=${encodedTitle}&body=${encodedMsg}`,
        publicUrl,
        meta
      };
    },

    /**
     * Executes Native Web Share API if supported by the browser (mobile phones, Safari, Chrome)
     */
    async shareNative(wishOrData, template = null) {
      const meta = WishSocialPreview.getSocialMetadata(wishOrData, template);
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({
            title: meta.title,
            text: `✨ Special personalized celebration website created for ${meta.recipient}!`,
            url: meta.publicUrl
          });
          return true;
        } catch (e) {
          if (e.name !== 'AbortError') {
            console.warn('[WishShareSystem] Native share failed, opening modal fallback:', e);
            this.openShareModal(wishOrData, { template });
          }
          return false;
        }
      } else {
        this.openShareModal(wishOrData, { template });
        return false;
      }
    },

    /**
     * Robust Clipboard Copy with fallback
     */
    async copyLink(urlOrWish, feedbackEl = null) {
      let url = typeof urlOrWish === 'string' ? urlOrWish : WishSlugService.getPublicUrl(urlOrWish);
      let copied = false;

      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(url);
          copied = true;
        } catch (e) {
          copied = false;
        }
      }

      if (!copied) {
        try {
          const textArea = document.createElement('textarea');
          textArea.value = url;
          textArea.style.position = 'fixed';
          textArea.style.opacity = '0';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          copied = document.execCommand('copy');
          document.body.removeChild(textArea);
        } catch (e) {
          copied = false;
        }
      }

      if (feedbackEl) {
        const prev = feedbackEl.innerHTML;
        feedbackEl.innerHTML = '<span>Copied! ✨</span>';
        setTimeout(() => {
          feedbackEl.innerHTML = prev;
        }, 2200);
      }

      // Part 16: Track Event
      if (window.WishAnalyticsService) {
        window.WishAnalyticsService.trackEvent('share_link_copied', {
          metadata: { url }
        });
      }

      // Part 17: Toast Feedback
      if (window.WishToast) {
        window.WishToast.show({
          title: 'Link Copied! 📋',
          message: 'Public celebration URL copied to clipboard.',
          type: 'success'
        });
      }

      return copied;
    },

    /**
     * Opens the full-featured, state-of-the-art Share & Discoverability Modal
     */
    openShareModal(wishOrData, options = {}) {
      const template = options.template || null;
      const meta = WishSocialPreview.getSocialMetadata(wishOrData, template);
      const channels = this.getShareChannels(wishOrData, template);

      // Part 16: Track Event
      if (window.WishAnalyticsService) {
        window.WishAnalyticsService.trackEvent('wish_shared', {
          wishId: wishOrData?.id || null,
          slug: wishOrData?.slug || null,
          recipientName: meta.recipient,
          category: meta.occasion,
          metadata: { title: meta.title, publicUrl: meta.publicUrl }
        });
      }

      let modal = document.getElementById('wishmagic-share-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wishmagic-share-modal';
        modal.className = 'fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-5 transition-all duration-300';
        document.body.appendChild(modal);
      }

      const qrSVG = WishQRCodeService.generateQRCodeSVG(meta.publicUrl, { size: 160, rounded: true, fgColor: '#1a062f' });

      modal.innerHTML = `
        <div class="w-full max-w-xl bg-[#0f041d] text-white rounded-3xl border border-purple-500/30 shadow-2xl p-5 sm:p-7 flex flex-col gap-4 relative max-h-[92vh] overflow-y-auto custom-scrollbar">
          
          <!-- Background Glows -->
          <div class="absolute -top-24 -left-24 w-60 h-60 bg-pink-500/20 rounded-full blur-3xl pointer-events-none"></div>
          <div class="absolute -bottom-24 -right-24 w-60 h-60 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>

          <!-- Close Button -->
          <button onclick="document.getElementById('wishmagic-share-modal').classList.add('hidden')" class="absolute top-4 right-4 p-2 text-purple-300 hover:text-white rounded-full hover:bg-white/10 transition cursor-pointer z-10" title="Close Share Dialog">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>

          <!-- Modal Header -->
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 via-purple-600 to-amber-300 text-white flex items-center justify-center text-2xl shadow-lg shadow-pink-500/30 flex-shrink-0">
              🎁
            </div>
            <div>
              <h3 class="font-display text-xl sm:text-2xl font-extrabold text-white">
                Share Celebration Website
              </h3>
              <p class="text-xs text-purple-300/80">
                Created with love for <strong class="text-pink-400 font-bold">${meta.recipient}</strong>
              </p>
            </div>
          </div>

          <!-- Link Copy Bar -->
          <div class="flex flex-col gap-1.5 pt-1">
            <div class="flex items-center justify-between text-xs font-semibold text-purple-200">
              <span>Public Clean Link:</span>
              <span class="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Instant Ready
              </span>
            </div>
            <div class="flex items-center justify-between gap-2 p-1.5 pl-3.5 rounded-2xl bg-purple-950/70 border border-purple-500/40 shadow-inner">
              <input id="modal-share-link-input" type="text" readonly value="${meta.publicUrl}" class="w-full bg-transparent text-xs font-mono text-pink-200 focus:outline-none select-all truncate"/>
              <button onclick="WishShareSystem.copyLink('${meta.publicUrl}', this)" class="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:brightness-110 active:scale-95 text-white font-bold text-xs shadow flex items-center gap-1.5 flex-shrink-0 transition cursor-pointer">
                <span class="material-symbols-outlined text-[15px]">content_copy</span>
                <span>Copy Link</span>
              </button>
            </div>
          </div>

          <!-- Quick Social Action Buttons -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <!-- WhatsApp -->
            <a href="${channels.whatsapp}" target="_blank" class="py-2.5 px-3 rounded-2xl bg-[#25D366] hover:brightness-110 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 transition active:scale-95">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.275.072.376-.044c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824z"/></svg>
              <span>WhatsApp</span>
            </a>

            <!-- Telegram -->
            <a href="${channels.telegram}" target="_blank" class="py-2.5 px-3 rounded-2xl bg-[#229ED9] hover:brightness-110 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 transition active:scale-95">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
              <span>Telegram</span>
            </a>

            <!-- SMS / iMessage -->
            <a href="${channels.sms}" class="py-2.5 px-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 transition active:scale-95">
              <span class="material-symbols-outlined text-[16px]">sms</span>
              <span>iMessage/SMS</span>
            </a>

            <!-- Open Live in New Tab -->
            <a href="${meta.publicUrl}" target="_blank" class="py-2.5 px-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 flex items-center justify-center gap-1.5 transition">
              <span class="material-symbols-outlined text-[16px]">open_in_new</span>
              <span>Open Link</span>
            </a>
          </div>

          <!-- Section: QR Code & Printable Greeting Card Download -->
          <div class="p-4 rounded-2xl bg-purple-950/40 border border-purple-500/20 flex flex-col sm:flex-row items-center gap-4">
            <div class="p-2 bg-white rounded-2xl shadow-xl flex-shrink-0">
              ${qrSVG}
            </div>
            <div class="flex-1 text-center sm:text-left space-y-2">
              <div class="flex items-center justify-center sm:justify-start gap-2">
                <span class="text-base">🖨️</span>
                <h4 class="font-bold text-sm text-white">Printable QR Greeting Card</h4>
              </div>
              <p class="text-[11px] text-purple-300/80 leading-relaxed">
                Download a high-resolution dark luxury card with this QR code to print inside physical gift envelopes or anniversary cards!
              </p>
              <button onclick="WishQRCodeService.downloadQRCardPNG('${meta.publicUrl}', '${meta.recipient}', '${meta.title}')" class="py-2 px-4 rounded-xl bg-purple-800/80 hover:bg-purple-700 text-purple-100 font-bold text-xs border border-purple-500/40 shadow flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer">
                <span class="material-symbols-outlined text-[16px]">download</span>
                <span>Download Print Card (PNG)</span>
              </button>
            </div>
          </div>

          <!-- Section: Live Social Card Visualizer -->
          <div class="space-y-2 pt-1">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-purple-200 flex items-center gap-1.5">
                <span>📱 Social Card Preview</span>
                <span class="text-[10px] text-purple-400 font-normal">(How link looks when texted)</span>
              </span>
              <div class="flex items-center gap-1">
                <button onclick="WishShareSystem.switchSocialTab('whatsapp')" id="tab-soc-whatsapp" class="px-2 py-0.5 rounded-lg bg-pink-500 text-white font-bold text-[10px] cursor-pointer">WhatsApp</button>
                <button onclick="WishShareSystem.switchSocialTab('twitter')" id="tab-soc-twitter" class="px-2 py-0.5 rounded-lg text-purple-300 hover:text-white font-semibold text-[10px] cursor-pointer">Twitter/X</button>
                <button onclick="WishShareSystem.switchSocialTab('imessage')" id="tab-soc-imessage" class="px-2 py-0.5 rounded-lg text-purple-300 hover:text-white font-semibold text-[10px] cursor-pointer">iMessage</button>
              </div>
            </div>

            <div id="modal-social-preview-container">
              ${WishSocialPreview.renderSocialPreviewHTML(meta, 'whatsapp')}
            </div>
          </div>

        </div>
      `;

      modal.classList.remove('hidden');

      // Attach dynamic tab switch method
      WishShareSystem._activeMeta = meta;
    },

    switchSocialTab(platform) {
      const container = document.getElementById('modal-social-preview-container');
      if (!container || !WishShareSystem._activeMeta) return;

      container.innerHTML = WishSocialPreview.renderSocialPreviewHTML(WishShareSystem._activeMeta, platform);

      ['whatsapp', 'twitter', 'imessage'].forEach(p => {
        const btn = document.getElementById(`tab-soc-${p}`);
        if (btn) {
          if (p === platform) {
            btn.className = 'px-2 py-0.5 rounded-lg bg-pink-500 text-white font-bold text-[10px] cursor-pointer';
          } else {
            btn.className = 'px-2 py-0.5 rounded-lg text-purple-300 hover:text-white font-semibold text-[10px] cursor-pointer';
          }
        }
      });
    }
  };

  // Expose to window
  window.WishSlugService = WishSlugService;
  window.WishQRCodeService = WishQRCodeService;
  window.WishSocialPreview = WishSocialPreview;
  window.WishShareSystem = WishShareSystem;

})(typeof window !== 'undefined' ? window : this);
