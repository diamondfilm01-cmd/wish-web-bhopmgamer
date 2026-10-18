// WishMagic Reusable Premium Lock & Upgrade Prompt Component
// Supports contextual item-scoped checkout (Single Template, HD Style Pack, or VIP Pass)

(function(window) {
  'use strict';

  let activeModalEl = null;
  let activeCallback = null;
  let activeOptions = {};

  function ensureModalElement() {
    let el = document.getElementById('wm-premium-lock-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wm-premium-lock-modal';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.className = 'fixed inset-0 z-[140] bg-black/75 backdrop-blur-md hidden items-center justify-center p-4 transition-all duration-300';
      document.body.appendChild(el);
    }
    return el;
  }

  function handleEscKey(e) {
    if (e.key === 'Escape') {
      WishPremiumLock.close();
    }
  }

  function resolveContextualProduct(options = {}) {
    if (options.productId) {
      return {
        productId: options.productId,
        templateId: options.templateId || (options.template && options.template.id) || null,
        templatePrice: Number((options.template && options.template.price) || options.templatePrice || 0)
      };
    }
    const contextType = options.context || 'template';
    if (contextType === 'template' && options.template && options.template.id) {
      return {
        productId: `template:${options.template.id}`,
        templateId: options.template.id,
        templatePrice: Number(options.template.price || 59) || 59
      };
    }
    if (contextType === 'theme' || contextType === 'media_limit' || contextType === 'section' || contextType === 'watermark') {
      return {
        productId: 'hd_image_style_pack',
        templateId: (options.template && options.template.id) || null,
        templatePrice: 59
      };
    }
    return {
      productId: 'vip_pass',
      templateId: (options.template && options.template.id) || null,
      templatePrice: 49
    };
  }

  const WishPremiumLock = {
    open(options = {}) {
      const modal = ensureModalElement();
      activeModalEl = modal;
      activeCallback = options.onUnlocked || null;
      activeOptions = options || {};

      const contextType = options.context || 'template';
      const details = (window.WishFeatureAccess && window.WishFeatureAccess.explainLock(contextType, options.key, options.template)) || {
        title: 'Unlock VIP Magic Pass',
        badge: 'VIP BENEFIT',
        priceLabel: '₹59 ONE-TIME',
        subtitle: 'Elevate your celebration website into an unforgettable digital keepsake.',
        bullets: [
          'Full access to all exclusive VIP blueprints',
          'Up to 16 high-resolution photo memories',
          'Spoken voice dedication audio note (up to 2 mins)',
          '100% white-label with zero platform watermark',
          'Permanent link with lifetime anniversary preservation'
        ],
        cta: 'Unlock Add-On / Combo • From ₹59'
      };

      const templateName = options.template ? (options.template.name || 'VIP Blueprint') : null;
      const priceLabel = details.priceLabel || '₹59 ONE-TIME';
      const ctaLabel = details.cta || 'Unlock Now • ₹59';

      modal.innerHTML = `
        <div class="wm-card w-full max-w-lg bg-white dark:bg-[#1f123e] text-[#1a0f30] dark:text-white rounded-3xl border-2 border-[#d6c8f2] dark:border-purple-500/40 shadow-[0_25px_70px_rgba(26,15,48,0.45)] p-6 sm:p-8 flex flex-col gap-5 relative overflow-hidden" onclick="event.stopPropagation()">
          
          <!-- Close button -->
          <button type="button" onclick="WishPremiumLock.close()" aria-label="Close dialog" class="absolute top-5 right-5 w-9 h-9 rounded-full bg-[#f4effc] dark:bg-purple-900/70 text-[#4c1d95] dark:text-purple-200 hover:bg-[#e9defa] dark:hover:bg-purple-800 flex items-center justify-center font-extrabold text-xs transition cursor-pointer">
            ✕
          </button>

          <!-- Top Badge & Header -->
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#a855f7] via-[#ec4899] to-[#f59e0b] text-white flex items-center justify-center text-2xl shadow-lg shadow-pink-500/30 flex-shrink-0">
              👑
            </div>
            <div class="min-w-0 pr-6 text-left">
              <div class="flex items-center gap-2 mb-1">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400 text-[#1a0f30] shadow-xs">
                  ${details.badge}
                </span>
                <span class="text-xs text-[#be185d] dark:text-amber-300 font-extrabold font-mono">${priceLabel}</span>
              </div>
              <h3 class="font-display font-extrabold text-xl text-[#1a0f30] dark:text-white tracking-tight leading-snug">
                ${details.title}
              </h3>
              ${templateName ? `<p class="text-xs text-[#ec4899] font-bold mt-0.5">${templateName}</p>` : ''}
            </div>
          </div>

          <!-- Description & Benefits -->
          <p class="text-xs sm:text-sm text-[#533f78] dark:text-[#cfc2eb] leading-relaxed font-medium text-left">
            ${details.subtitle}
          </p>

          <div class="p-4 rounded-2xl bg-[#f7f3fe] dark:bg-[#170d30] border border-[#dfd2f7] dark:border-purple-500/30 flex flex-col gap-2.5 text-left">
            <span class="text-[11px] font-extrabold text-[#6d28d9] dark:text-amber-300 uppercase tracking-wider">What Your Purchase Unlocks:</span>
            <ul class="flex flex-col gap-2 text-xs text-[#1a0f30] dark:text-[#f7f4ff] font-medium">
              ${details.bullets.map(b => `
                <li class="flex items-center gap-2">
                  <span class="text-emerald-600 dark:text-emerald-400 font-extrabold">✓</span>
                  <span>${b}</span>
                </li>
              `).join('')}
            </ul>
          </div>

          <!-- Payment Gateway Notice -->
          <div class="p-3.5 rounded-2xl bg-[#faf7ff] dark:bg-purple-950/70 border border-[#d6c8f2] dark:border-purple-500/40 text-[11px] text-[#533f78] dark:text-[#cfc2eb] flex items-start gap-2.5 text-left">
            <span class="text-base">🔒</span>
            <div>
              <span class="font-extrabold text-[#1a0f30] dark:text-white block uppercase tracking-wider text-[10px]">Secure User-Bound Payment</span>
              <span>Your purchase is cryptographically verified and saved directly to your account ID on our server.</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
            <button type="button" id="wm-lock-pay-btn" onclick="WishPremiumLock.initiateCheckout()" class="w-full sm:flex-1 py-3 px-5 rounded-full bg-gradient-to-r from-[#ff2a85] via-[#ec4899] to-[#a855f7] hover:brightness-110 active:scale-95 text-white font-extrabold text-xs sm:text-sm shadow-[0_8px_24px_rgba(236,72,153,0.35)] flex items-center justify-center gap-2 transition-all cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">lock_open</span>
              <span id="wm-lock-pay-btn-text" data-default-label="${ctaLabel}">${ctaLabel}</span>
            </button>
            <button type="button" onclick="WishPremiumLock.close()" class="w-full sm:w-auto py-3 px-4 rounded-full text-[#533f78] dark:text-purple-300 hover:text-[#1a0f30] dark:hover:text-white font-bold text-xs text-center transition cursor-pointer">
              Cancel
            </button>
          </div>

        </div>
      `;

      modal.classList.remove('hidden');
      modal.classList.add('flex');
      document.body.classList.add('overflow-hidden');
      document.addEventListener('keydown', handleEscKey);
    },

    close() {
      if (activeModalEl) {
        activeModalEl.classList.remove('flex');
        activeModalEl.classList.add('hidden');
      }
      document.body.classList.remove('overflow-hidden');
      document.removeEventListener('keydown', handleEscKey);
      activeCallback = null;
      activeOptions = {};
    },

    async initiateCheckout() {
      const btn = document.getElementById('wm-lock-pay-btn');
      const btnText = document.getElementById('wm-lock-pay-btn-text');
      const defaultLabel = (btnText && btnText.getAttribute('data-default-label')) || 'Unlock Now • ₹59';
      if (btn) btn.disabled = true;
      if (btnText) btnText.textContent = 'Connecting Gateway...';

      try {
        if (!window.WishPaymentService) {
          throw new Error('Payment service not loaded');
        }
        const resolved = resolveContextualProduct(activeOptions);
        const result = await window.WishPaymentService.createCheckout(resolved.productId, {
          templateId: resolved.templateId,
          templatePrice: resolved.templatePrice,
          slug: activeOptions.slug || null,
          requestedSlug: activeOptions.slug || null,
          wishId: activeOptions.wishId || null
        });
        if (result && result.success && result.verified === true) {
          const cb = activeCallback;
          this.close();
          if (typeof cb === 'function') {
            await cb(result);
          }
        } else if (result && result.status === 'provider_not_configured') {
          if (btnText) btnText.textContent = 'Gateway Unavailable';
        }
      } catch (err) {
        alert('Could not start checkout: ' + err.message);
      } finally {
        if (btn) btn.disabled = false;
        if (btnText && btnText.textContent === 'Connecting Gateway...') {
          btnText.textContent = defaultLabel;
        }
      }
    }
  };

  window.WishPremiumLock = WishPremiumLock;

})(typeof window !== 'undefined' ? window : globalThis);
