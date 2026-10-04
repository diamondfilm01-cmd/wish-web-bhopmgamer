// WishMagic Reusable Premium Lock & Upgrade Prompt Component
// Part 11: Premium Access & Monetization Architecture

(function(window) {
  'use strict';

  let activeModalEl = null;
  let activeCallback = null;

  function ensureModalElement() {
    let el = document.getElementById('wm-premium-lock-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wm-premium-lock-modal';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.className = 'fixed inset-0 z-[100] bg-black/80 backdrop-blur-md hidden items-center justify-center p-4 transition-all duration-300';
      document.body.appendChild(el);
    }
    return el;
  }

  function handleEscKey(e) {
    if (e.key === 'Escape') {
      WishPremiumLock.close();
    }
  }

  const WishPremiumLock = {
    /**
     * Open the Premium Lock upgrade dialog
     * @param {Object} options
     *   - context: 'template' | 'theme' | 'section' | 'media_limit' | 'voice' | 'music_upload' | 'watermark' | 'preservation'
     *   - template: Optional template object
     *   - onUnlocked: Callback when development unlock is triggered
     *   - onCancel: Callback when dismissed
     */
    open(options = {}) {
      const modal = ensureModalElement();
      activeModalEl = modal;
      activeCallback = options.onUnlocked || null;

      const contextType = options.context || 'template';
      const details = (window.WishFeatureAccess && window.WishFeatureAccess.explainLock(contextType, options.key)) || {
        title: 'Unlock VIP Magic Pass',
        badge: 'VIP BENEFIT',
        subtitle: 'Elevate your celebration website into an unforgettable digital keepsake.',
        bullets: [
          'Full access to all exclusive VIP blueprints',
          'Up to 16 high-resolution photo memories',
          'Spoken voice dedication audio note (up to 2 mins)',
          '100% white-label with zero platform watermark',
          'Permanent link with lifetime anniversary preservation'
        ],
        cta: 'Unlock VIP Pass • ₹49'
      };

      const templateName = options.template ? (options.template.name || 'VIP Blueprint') : null;

      modal.innerHTML = `
        <div class="w-full max-w-lg bg-[#140628] text-white rounded-3xl border border-purple-500/30 shadow-[0_25px_60px_-15px_rgba(168,85,247,0.4)] p-6 sm:p-8 flex flex-col gap-5 relative overflow-hidden" onclick="event.stopPropagation()">
          
          <!-- Background ambient glow -->
          <div class="absolute -top-24 -right-24 w-60 h-60 bg-pink-500/20 rounded-full blur-3xl pointer-events-none"></div>
          <div class="absolute -bottom-24 -left-24 w-60 h-60 bg-purple-600/20 rounded-full blur-3xl pointer-events-none"></div>

          <!-- Close button -->
          <button onclick="WishPremiumLock.close()" aria-label="Close dialog" class="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center font-bold text-xs transition cursor-pointer">
            ✕
          </button>

          <!-- Top Badge & Header -->
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 text-white flex items-center justify-center text-2xl shadow-lg shadow-pink-500/30 flex-shrink-0">
              👑
            </div>
            <div class="min-w-0 pr-6">
              <div class="flex items-center gap-2 mb-1">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400 text-purple-950 shadow-sm">
                  ${details.badge}
                </span>
                <span class="text-xs text-amber-300 font-bold font-mono">₹49 ONE-TIME</span>
              </div>
              <h3 class="font-display font-black text-xl text-white tracking-tight leading-snug">
                ${details.title}
              </h3>
              ${templateName ? `<p class="text-xs text-pink-300 font-semibold mt-0.5">${templateName}</p>` : ''}
            </div>
          </div>

          <!-- Description & Benefits -->
          <p class="text-xs sm:text-sm text-purple-200/90 leading-relaxed font-medium">
            ${details.subtitle}
          </p>

          <div class="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-2.5">
            <span class="text-[11px] font-bold text-amber-300 uppercase tracking-wider">What Premium Unlocks:</span>
            <ul class="flex flex-col gap-2 text-xs text-purple-100">
              ${details.bullets.map(b => `
                <li class="flex items-center gap-2">
                  <span class="text-emerald-400 font-bold">✓</span>
                  <span>${b}</span>
                </li>
              `).join('')}
            </ul>
          </div>

          <!-- Development Sandbox Notice (Section 1, 17, 23) -->
          <div class="p-3 rounded-xl bg-purple-950/80 border border-purple-500/40 text-[11px] text-purple-300 flex items-start gap-2">
            <span class="text-sm">🧪</span>
            <div>
              <span class="font-bold text-white block uppercase tracking-wider text-[10px]">Development Sandbox Mode</span>
              <span>Production payment gateways (Razorpay/Stripe) will be integrated in subsequent parts. You can simulate unlocking the VIP Pass immediately below for testing.</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
            <button onclick="WishPremiumLock.unlockDevelopment()" class="w-full sm:flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-amber-400 via-pink-500 to-purple-600 hover:brightness-110 active:scale-95 text-purple-950 font-extrabold text-xs sm:text-sm shadow-xl shadow-pink-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer">
              <span>✨ Unlock VIP Pass (Dev Mode)</span>
            </button>
            <a href="/premium" class="w-full sm:w-auto py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs text-center transition cursor-pointer">
              Compare Plans
            </a>
            <button onclick="WishPremiumLock.close()" class="w-full sm:w-auto py-3 px-4 rounded-2xl text-purple-300/80 hover:text-white font-medium text-xs text-center transition cursor-pointer">
              Continue Exploring
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
    },

    async unlockDevelopment() {
      if (window.WishPaymentService && typeof window.WishPaymentService.completeDevelopmentUnlock === 'function') {
        await window.WishPaymentService.completeDevelopmentUnlock();
      } else if (window.WishEntitlement) {
        window.WishEntitlement.setDevelopmentPlan('premium');
      }

      this.close();

      // Show toast if available
      if (typeof window.showToast === 'function') {
        window.showToast('👑 VIP Magic Pass unlocked in Development Mode!');
      } else {
        alert('👑 VIP Magic Pass unlocked in Development Mode! All premium features and templates are now active.');
      }

      if (typeof activeCallback === 'function') {
        activeCallback();
      }
    }
  };

  window.WishPremiumLock = WishPremiumLock;

})(typeof window !== 'undefined' ? window : globalThis);
