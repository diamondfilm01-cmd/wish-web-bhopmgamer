/**
 * WishMagic Production Consent & Legal Compliance Client Manager (Part 38)
 * ==============================================================================
 * Manages cookie consent, granular category toggles (essential, functional,
 * analytics, marketing), local storage persistence, backend synchronization,
 * and automated material change re-consent prompting.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'wishmagic_cookie_consent_v1';
  const ANON_TOKEN_KEY = 'wishmagic_anon_client_token';

  // Get or initialize anonymous client token
  function getAnonymousToken() {
    let token = localStorage.getItem(ANON_TOKEN_KEY);
    if (!token) {
      token = 'anon_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      localStorage.setItem(ANON_TOKEN_KEY, token);
    }
    return token;
  }

  // Current consent state in memory
  let currentConsent = null;

  function loadLocalConsent() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {}
    return null;
  }

  function saveLocalConsent(prefs) {
    const full = {
      essential: true, // Invariant: Always true
      functional: prefs.functional !== false,
      analytics: Boolean(prefs.analytics),
      marketing: Boolean(prefs.marketing),
      consentVersion: '1.0.0',
      timestamp: new Date().toISOString()
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
    } catch (e) {}
    currentConsent = full;

    // Dispatch event for other scripts
    try {
      window.dispatchEvent(new CustomEvent('wishmagic:consent-updated', { detail: full }));
    } catch (e) {}

    // Sync to backend asynchronously
    syncConsentToBackend(full);
    return full;
  }

  async function syncConsentToBackend(prefs) {
    try {
      await fetch('/api/legal/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anonymousToken: getAnonymousToken(),
          functional: prefs.functional ? 1 : 0,
          analytics: prefs.analytics ? 1 : 0,
          marketing: prefs.marketing ? 1 : 0,
          consentVersion: prefs.consentVersion || '1.0.0'
        })
      });
    } catch (e) {
      // Offline or network error; local preference is already saved
    }
  }

  // --- UI CREATION & INJECTION ---

  function createCookieBanner() {
    if (document.getElementById('wm-cookie-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'wm-cookie-banner';
    banner.className = 'fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 transform transition-all duration-300 ease-out animate-fade-in';
    banner.innerHTML = `
      <div class="p-5 rounded-2xl bg-white/95 dark:bg-[#1A0B2E]/95 backdrop-blur-xl border border-purple-200/80 dark:border-purple-800/80 shadow-2xl text-purple-950 dark:text-white">
        <div class="flex items-start gap-3 mb-3">
          <div class="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 flex items-center justify-center flex-shrink-0 text-lg shadow-sm">
            🍪
          </div>
          <div class="flex-1">
            <h4 class="font-bold text-sm tracking-tight">Your Privacy &amp; Cookies</h4>
            <p class="text-xs text-purple-800/80 dark:text-purple-300/80 mt-1 leading-relaxed">
              We use essential cookies for secure login and encrypted celebration delivery. With your consent, we use optional cookies to measure site performance and personalize greetings.
            </p>
          </div>
        </div>

        <div class="flex items-center justify-between text-xs text-purple-600 dark:text-purple-400 font-semibold mb-4 px-1">
          <a href="/legal?policy=cookie_policy" class="hover:underline flex items-center gap-1">
            <span>Read Cookie Notice</span>
            <span class="text-[10px]">↗</span>
          </a>
          <button type="button" id="wm-btn-customize-banner" class="text-pink-600 dark:text-pink-400 hover:underline">
            Customize
          </button>
        </div>

        <div class="grid grid-cols-2 gap-2 pt-1 border-t border-purple-100 dark:border-purple-900/40">
          <button type="button" id="wm-btn-reject-optional" class="w-full py-2 px-3 rounded-xl border border-purple-200 dark:border-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/40 text-xs font-bold transition text-purple-800 dark:text-purple-200">
            Reject Optional
          </button>
          <button type="button" id="wm-btn-accept-all" class="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-xs font-bold shadow-md transition">
            Accept All
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    // Event listeners
    document.getElementById('wm-btn-accept-all').addEventListener('click', () => {
      saveLocalConsent({ functional: true, analytics: true, marketing: true });
      dismissBanner();
    });

    document.getElementById('wm-btn-reject-optional').addEventListener('click', () => {
      saveLocalConsent({ functional: true, analytics: false, marketing: false });
      dismissBanner();
    });

    document.getElementById('wm-btn-customize-banner').addEventListener('click', () => {
      dismissBanner();
      openConsentModal();
    });
  }

  function dismissBanner() {
    const banner = document.getElementById('wm-cookie-banner');
    if (banner) {
      banner.classList.add('opacity-0', 'translate-y-4');
      setTimeout(() => banner.remove(), 300);
    }
  }

  function openConsentModal() {
    let modal = document.getElementById('wm-consent-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'wm-consent-modal';
      modal.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in';
      modal.innerHTML = `
        <div class="bg-white dark:bg-[#1A0B2E] rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-purple-200 dark:border-purple-800 text-purple-950 dark:text-white relative max-h-[90vh] overflow-y-auto">
          <button type="button" id="wm-close-modal-x" class="absolute top-5 right-5 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 hover:bg-purple-200 flex items-center justify-center text-sm font-bold">
            ✕
          </button>

          <div class="flex items-center gap-3 mb-2">
            <span class="text-2xl">🛡️</span>
            <h3 class="font-extrabold text-lg sm:text-xl">Cookie &amp; Tracking Preferences</h3>
          </div>
          <p class="text-xs text-purple-800/80 dark:text-purple-300/80 mb-5 leading-relaxed">
            Manage your granular consent. Strictly necessary cookies cannot be disabled as they provide security and core account functionality.
          </p>

          <div class="space-y-3.5 mb-6 text-xs">
            <!-- 1. Strictly Necessary -->
            <div class="p-3.5 rounded-2xl bg-purple-50/80 dark:bg-purple-950/60 border border-purple-100 dark:border-purple-900/50 flex items-start justify-between gap-3">
              <div class="flex-1">
                <div class="flex items-center gap-1.5 font-bold text-sm">
                  <span>Essential Cookies</span>
                  <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">Required</span>
                </div>
                <p class="text-purple-800/80 dark:text-purple-300/80 mt-0.5 leading-relaxed">
                  Authentication tokens, CSRF protection, and platform security defenses.
                </p>
              </div>
              <input type="checkbox" checked disabled class="mt-1 w-5 h-5 rounded text-purple-600 cursor-not-allowed opacity-80" />
            </div>

            <!-- 2. Functional -->
            <div class="p-3.5 rounded-2xl bg-purple-50/80 dark:bg-purple-950/60 border border-purple-100 dark:border-purple-900/50 flex items-start justify-between gap-3">
              <div class="flex-1">
                <div class="font-bold text-sm">Functional Preferences</div>
                <p class="text-purple-800/80 dark:text-purple-300/80 mt-0.5 leading-relaxed">
                  Remembers your Dark/Light theme, chosen language, and audio playback settings.
                </p>
              </div>
              <input type="checkbox" id="wm-pref-functional" class="mt-1 w-5 h-5 rounded text-purple-600 focus:ring-purple-400 cursor-pointer" />
            </div>

            <!-- 3. Analytics -->
            <div class="p-3.5 rounded-2xl bg-purple-50/80 dark:bg-purple-950/60 border border-purple-100 dark:border-purple-900/50 flex items-start justify-between gap-3">
              <div class="flex-1">
                <div class="font-bold text-sm">Analytics &amp; Performance</div>
                <p class="text-purple-800/80 dark:text-purple-300/80 mt-0.5 leading-relaxed">
                  Anonymous template traffic analysis and error diagnostics (Part 33 BI Engine).
                </p>
              </div>
              <input type="checkbox" id="wm-pref-analytics" class="mt-1 w-5 h-5 rounded text-purple-600 focus:ring-purple-400 cursor-pointer" />
            </div>

            <!-- 4. Marketing -->
            <div class="p-3.5 rounded-2xl bg-purple-50/80 dark:bg-purple-950/60 border border-purple-100 dark:border-purple-900/50 flex items-start justify-between gap-3">
              <div class="flex-1">
                <div class="font-bold text-sm">Marketing &amp; Referrals</div>
                <p class="text-purple-800/80 dark:text-purple-300/80 mt-0.5 leading-relaxed">
                  Tracks friend invite referral codes (Part 36) and celebration promotions.
                </p>
              </div>
              <input type="checkbox" id="wm-pref-marketing" class="mt-1 w-5 h-5 rounded text-purple-600 focus:ring-purple-400 cursor-pointer" />
            </div>
          </div>

          <div class="flex items-center justify-between gap-3 pt-4 border-t border-purple-200/60 dark:border-purple-800/60">
            <button type="button" id="wm-btn-modal-accept-all" class="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline">
              Allow All Categories
            </button>
            <div class="flex items-center gap-2">
              <button type="button" id="wm-btn-modal-cancel" class="px-4 py-2 rounded-xl border border-purple-200 dark:border-purple-700 text-xs font-bold hover:bg-purple-50 dark:hover:bg-purple-900/40">
                Cancel
              </button>
              <button type="button" id="wm-btn-modal-save" class="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-xs font-bold shadow-md">
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // Event handlers
      document.getElementById('wm-close-modal-x').addEventListener('click', closeConsentModal);
      document.getElementById('wm-btn-modal-cancel').addEventListener('click', closeConsentModal);

      document.getElementById('wm-btn-modal-accept-all').addEventListener('click', () => {
        saveLocalConsent({ functional: true, analytics: true, marketing: true });
        closeConsentModal();
      });

      document.getElementById('wm-btn-modal-save').addEventListener('click', () => {
        const functional = document.getElementById('wm-pref-functional').checked;
        const analytics = document.getElementById('wm-pref-analytics').checked;
        const marketing = document.getElementById('wm-pref-marketing').checked;
        saveLocalConsent({ functional, analytics, marketing });
        closeConsentModal();
      });
    }

    // Set checkboxes based on current preferences
    const p = currentConsent || { functional: true, analytics: false, marketing: false };
    document.getElementById('wm-pref-functional').checked = p.functional !== false;
    document.getElementById('wm-pref-analytics').checked = Boolean(p.analytics);
    document.getElementById('wm-pref-marketing').checked = Boolean(p.marketing);

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeConsentModal() {
    const modal = document.getElementById('wm-consent-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  // --- RE-CONSENT NOTICE ENGINE (MATERIAL CHANGES) ---

  async function checkUserReconsentWorkflow() {
    try {
      const res = await fetch('/api/legal/acceptance/status');
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));

      if (data.authenticated && data.reconsentRequired && Array.isArray(data.pendingPolicies) && data.pendingPolicies.length > 0) {
        showReconsentModal(data.pendingPolicies);
      }
    } catch (e) {
      // Ignored if unauthenticated or network failure
    }
  }

  function showReconsentModal(pendingPolicies) {
    if (document.getElementById('wm-reconsent-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'wm-reconsent-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in';

    const policiesHtml = pendingPolicies.map(p => `
      <div class="p-3.5 rounded-2xl bg-purple-50/90 dark:bg-purple-950/70 border border-purple-200 dark:border-purple-800">
        <div class="flex items-center justify-between gap-2">
          <span class="font-bold text-sm text-purple-950 dark:text-white">${p.policyName}</span>
          <span class="px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-600 dark:text-pink-400 font-bold text-[10px]">
            Updated to v${p.requiredVersion}
          </span>
        </div>
        <p class="text-xs text-purple-800/80 dark:text-purple-300/80 mt-1 leading-relaxed">
          ${p.changeSummary || 'Terms updated for compliance and transparency.'}
        </p>
        <div class="mt-2 text-right">
          <a href="/legal?policy=${p.policyType}" target="_blank" class="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline">
            Review Policy ↗
          </a>
        </div>
      </div>
    `).join('');

    modal.innerHTML = `
      <div class="bg-white dark:bg-[#1A0B2E] rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-purple-300 dark:border-purple-700 text-purple-950 dark:text-white max-h-[90vh] overflow-y-auto">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-10 h-10 rounded-2xl bg-pink-100 dark:bg-pink-900/60 text-pink-600 dark:text-pink-300 flex items-center justify-center text-xl font-bold">
            📜
          </div>
          <div>
            <h3 class="font-extrabold text-lg sm:text-xl">Platform Policy Update</h3>
            <span class="text-xs text-purple-700/80 dark:text-purple-300/80">Please review and accept our updated terms</span>
          </div>
        </div>

        <p class="text-xs text-purple-800/90 dark:text-purple-200/90 my-3 leading-relaxed">
          WishMagic has updated one or more of its core legal policies. To continue creating, customizing, and sharing celebrations, please accept the updated agreements.
        </p>

        <div class="space-y-3 my-4">
          ${policiesHtml}
        </div>

        <div class="pt-4 border-t border-purple-200/60 dark:border-purple-800/60 flex items-center justify-between gap-3">
          <a href="/legal" target="_blank" class="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline">
            View All Policies
          </a>
          <button type="button" id="wm-btn-accept-reconsent" class="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-xs font-bold shadow-lg transition">
            I Accept Updated Terms
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('wm-btn-accept-reconsent').addEventListener('click', async () => {
      const btn = document.getElementById('wm-btn-accept-reconsent');
      btn.disabled = true;
      btn.textContent = 'Recording acceptance...';

      try {
        const payload = {
          acceptanceMethod: 'RECONSENT_MODAL',
          policies: pendingPolicies.map(p => ({
            policyType: p.policyType,
            policyVersion: p.requiredVersion,
            policyId: p.currentPolicyId
          }))
        };

        const res = await fetch('/api/legal/acceptance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          modal.remove();
        } else {
          btn.disabled = false;
          btn.textContent = 'Retry Acceptance';
        }
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Retry Acceptance';
      }
    });
  }

  // --- INITIALIZATION ---

  function init() {
    currentConsent = loadLocalConsent();

    // If no consent recorded yet, show non-intrusive floating cookie banner
    if (!currentConsent) {
      // Delay slightly for smoother page entrance
      setTimeout(createCookieBanner, 800);
    }

    // Attach click handlers to any triggers on the page
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action="cookie-preferences"], a[href="#cookie-preferences"], .cookie-pref-btn');
      if (target) {
        e.preventDefault();
        openConsentModal();
      }
    });

    // Check re-consent for authenticated users
    checkUserReconsentWorkflow();
  }

  // Global API
  window.WishMagicConsent = {
    openPreferences: openConsentModal,
    getPreferences: () => currentConsent || { essential: true, functional: true, analytics: false, marketing: false },
    hasConsented: (cat) => {
      if (cat === 'essential') return true;
      if (!currentConsent) return false;
      return Boolean(currentConsent[cat]);
    },
    acceptAll: () => saveLocalConsent({ functional: true, analytics: true, marketing: true }),
    rejectOptional: () => saveLocalConsent({ functional: true, analytics: false, marketing: false })
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
