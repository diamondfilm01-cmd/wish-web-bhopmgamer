// WishMagic Universal Admin-Matched Theme Engine & Unified Storefront Header Controller
(function() {
  'use strict';

  function getSystemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function getActiveTheme() {
    const saved = localStorage.getItem('wishmagic_theme') || 'light';
    if (saved === 'auto') {
      return getSystemTheme();
    }
    return saved;
  }

  function updateThemeUI(isDark) {
    const icons = document.querySelectorAll('.site-theme-icon');
    const labels = document.querySelectorAll('.site-theme-label');

    icons.forEach(el => {
      el.textContent = isDark ? 'light_mode' : 'dark_mode';
    });

    labels.forEach(el => {
      el.textContent = isDark ? 'Light' : 'Dark';
    });

    document.querySelectorAll('.wm-theme-pill-btn').forEach(btn => {
      btn.setAttribute('data-theme-mode', isDark ? 'dark' : 'light');
      btn.setAttribute('aria-checked', isDark ? 'true' : 'false');
    });
  }

  function updateBodyBackground() {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.style.removeProperty('background-image');
    document.body.style.removeProperty('background-size');
    document.body.style.removeProperty('background-position');
    document.body.style.removeProperty('background-attachment');
  }

  function applyTheme(targetTheme) {
    const isDark = targetTheme === 'dark';
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      if (document.body) {
        document.body.classList.add('dark');
      }
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
      if (document.body) {
        document.body.classList.remove('dark');
      }
    }
    updateBodyBackground();
    if (typeof window !== 'undefined' && typeof window.updateHeroVisualsForTheme === 'function') {
      window.updateHeroVisualsForTheme();
    }
    updateThemeUI(isDark);
  }

  // 1. Immediate execution to avoid FOUC
  applyTheme(getActiveTheme());

  // 2. Listen for Device System Theme changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const saved = localStorage.getItem('wishmagic_theme') || 'light';
      if (saved === 'auto') {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  // 3. Global toggle function accessible on all pages
  window.toggleSiteTheme = function() {
    const currentIsDark = document.documentElement.classList.contains('dark');
    const newTheme = currentIsDark ? 'light' : 'dark';
    localStorage.setItem('wishmagic_theme', newTheme);
    localStorage.setItem('wishmagic_admin_theme_v2', newTheme);
    applyTheme(newTheme);

    if (typeof window.showAuthToast === 'function') {
      window.showAuthToast(newTheme === 'dark' ? '🌙 Cosmic Dark Mode Activated' : '☀️ Fairytale Light Mode Activated');
    } else if (typeof window.showToast === 'function') {
      window.showToast(newTheme === 'dark' ? '🌙 Cosmic Dark Mode Activated' : '☀️ Fairytale Light Mode Activated');
    }
  };

  window.resetThemeToAuto = function() {
    localStorage.setItem('wishmagic_theme', 'auto');
    applyTheme(getSystemTheme());
  };

  window.toggleMobileStorefrontNav = function() {
    const drawer = document.getElementById('wm-mobile-nav-drawer');
    if (!drawer) return;
    drawer.classList.toggle('hidden');
  };

  function getThemePillButtonHTML() {
    const isDark = document.documentElement.classList.contains('dark');
    return `
      <button type="button" onclick="toggleSiteTheme()" class="wm-theme-pill-btn" data-theme-mode="${isDark ? 'dark' : 'light'}" aria-checked="${isDark ? 'true' : 'false'}" title="Switch Light / Dark Mode" aria-label="Toggle Light or Dark Theme">
        <span class="wm-theme-pill-sun">
          <span class="material-symbols-outlined text-[15px]" style="font-variation-settings: 'FILL' 1;">light_mode</span>
        </span>
        <span class="wm-theme-pill-knob">
          <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">dark_mode</span>
        </span>
      </button>
    `;
  }

  // 4. Ensure Unified Admin-Style Header & Navigation Buttons Across Every Storefront Page/Section
  function ensureUnifiedStorefrontHeader() {
    if (typeof document === 'undefined' || !document.body) return;
    const pathname = (window.location.pathname || '/').toLowerCase();

    // Do not inject storefront header on Admin pages or fullscreen Wish player
    if (pathname.startsWith('/admin') || pathname.includes('wish.html')) return;

    // Ensure Material Symbols Outlined font is loaded for icons
    if (!document.querySelector('link[href*="Material+Symbols+Outlined"]')) {
      const iconLink = document.createElement('link');
      iconLink.rel = 'stylesheet';
      iconLink.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap';
      document.head.appendChild(iconLink);
    }

    // Ensure cloud-background.css is loaded
    if (!document.getElementById('wishmagic-cloud-css') && !document.querySelector('link[href*="cloud-background.css"]')) {
      const link = document.createElement('link');
      link.id = 'wishmagic-cloud-css';
      link.rel = 'stylesheet';
      link.href = '/css/cloud-background.css?v=20261014_v5';
      document.head.appendChild(link);
    }

    // Special handling for customize.html: preserve customizer toolbar controls, upgrade theme button & remove dev toggle
    if (pathname.includes('customize')) {
      const devToggle = document.getElementById('dev-toggle-entitlement-btn');
      if (devToggle && devToggle.parentElement) {
        devToggle.parentElement.remove();
      }
      const oldThemeBtn = document.querySelector('header button[onclick*="toggleSiteTheme"]');
      if (oldThemeBtn && !oldThemeBtn.classList.contains('wm-theme-pill-btn')) {
        oldThemeBtn.outerHTML = getThemePillButtonHTML();
      }
      return;
    }

    // Determine active nav item
    const isHome = pathname === '/' || pathname.endsWith('/index.html');
    const isTemplates = pathname.includes('template') || pathname.includes('marketplace');
    const isCreate = pathname.includes('create');
    const isMyWishes = pathname.includes('my-wishes') || pathname.includes('favorites');
    const isPricing = pathname.includes('pricing') || pathname.includes('premium') || pathname.includes('checkout');
    const isHelp = pathname.includes('help') || pathname.includes('contact') || pathname.includes('support') || pathname.includes('legal');

    // On index.html, upgrade the existing header's theme button and nav pills while keeping #nav-search-input intact
    if (isHome) {
      const oldThemeBtn = document.querySelector('header button[onclick*="toggleSiteTheme"]');
      if (oldThemeBtn && !oldThemeBtn.classList.contains('wm-theme-pill-btn')) {
        oldThemeBtn.outerHTML = getThemePillButtonHTML();
      }
      const navLinks = document.querySelectorAll('header nav a');
      navLinks.forEach((a, idx) => {
        a.classList.add('wm-nav-pill');
        if (idx === 0) a.classList.add('active');
      });
      return;
    }

    // On all other storefront pages (templates, marketplace, create, my-wishes, pricing, premium, account, profile, settings, favorites, referrals, checkout, contact, help, legal, notifications, support-tickets, expired, maintenance), render the unified Admin-Style Storefront Header so NO button is ever missing!
    const existingHeader = document.querySelector('header');
    const unifiedHeaderHTML = `
      <div class="wm-site-header-bar glass-nav rounded-2xl sm:rounded-full px-3 sm:px-5 lg:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2 sm:gap-4">
        <!-- Left: Brand Logo -->
        <a href="/" class="flex items-center gap-2.5 group flex-shrink-0 text-decoration-none">
          <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-[#a855f7] via-[#ec4899] to-[#f59e0b] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
            <span class="material-symbols-outlined text-[20px] sm:text-[22px]">auto_fix_high</span>
          </div>
          <div class="flex flex-col">
            <span id="navbar-brand-name" class="brand-name-text font-display font-extrabold text-base sm:text-xl tracking-tight leading-none">
              <span class="text-[#1a0f30] dark:text-white">Wish</span><span class="wm-brand-magic">Magic</span>
            </span>
            <span class="text-[10px] font-semibold text-[#6e5d8f] dark:text-[#a594c9] tracking-wide mt-0.5 hidden sm:inline-block">Create. Personalize. Celebrate.</span>
          </div>
        </a>

        <!-- Center: Admin-Style Navigation Pills -->
        <nav class="hidden lg:flex items-center gap-1 xl:gap-1.5">
          <a href="/" class="wm-nav-pill ${isHome ? 'active' : ''}">
            <span class="material-symbols-outlined text-[17px]">home</span>
            <span>Home</span>
          </a>
          <a href="/templates.html" class="wm-nav-pill ${isTemplates ? 'active' : ''}">
            <span class="material-symbols-outlined text-[17px]">grid_view</span>
            <span>Templates</span>
          </a>
          <a href="/create.html" class="wm-nav-pill ${isCreate ? 'active' : ''}">
            <span class="material-symbols-outlined text-[17px]">auto_awesome</span>
            <span>Create Wish</span>
          </a>
          <a href="/my-wishes.html" class="wm-nav-pill ${isMyWishes ? 'active' : ''}">
            <span class="material-symbols-outlined text-[17px]">card_giftcard</span>
            <span>My Wishes</span>
          </a>
          <a href="/pricing.html" class="wm-nav-pill ${isPricing ? 'active' : ''}">
            <span class="material-symbols-outlined text-[17px]">workspace_premium</span>
            <span>Pricing</span>
          </a>
          <a href="/help.html" class="wm-nav-pill ${isHelp ? 'active' : ''}">
            <span class="material-symbols-outlined text-[17px]">support_agent</span>
            <span>Help</span>
          </a>
        </nav>

        <!-- Right: Theme Switch, Create CTA, Profile / Google Sign-In & Mobile Menu -->
        <div class="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
          ${getThemePillButtonHTML()}

          <a href="/create.html" class="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-extrabold text-white bg-gradient-to-r from-[#ff2a85] via-[#ec4899] to-[#a855f7] hover:brightness-110 shadow-[0_6px_18px_rgba(236,72,153,0.3)] transition-all">
            <span class="material-symbols-outlined text-[15px]">add_circle</span>
            <span>Create Wish</span>
          </a>

          <div data-purpose="navbar-auth" class="navbar-auth-container flex-shrink-0"></div>

          <button type="button" onclick="toggleMobileStorefrontNav()" class="lg:hidden w-9 h-9 rounded-full bg-[#f4effc] dark:bg-purple-900/60 border border-[#d6c8f2] dark:border-purple-500/40 flex items-center justify-center text-[#1a0f30] dark:text-white cursor-pointer" aria-label="Open Navigation Menu">
            <span class="material-symbols-outlined text-[20px]">menu</span>
          </button>
        </div>
      </div>

      <!-- Mobile Navigation Drawer -->
      <div id="wm-mobile-nav-drawer" class="hidden lg:hidden mt-2 p-3 rounded-2xl wm-card space-y-1.5">
        <a href="/" class="wm-nav-pill w-full ${isHome ? 'active' : ''}">
          <span class="material-symbols-outlined text-[18px]">home</span>
          <span>Home</span>
        </a>
        <a href="/templates.html" class="wm-nav-pill w-full ${isTemplates ? 'active' : ''}">
          <span class="material-symbols-outlined text-[18px]">grid_view</span>
          <span>Templates</span>
        </a>
        <a href="/create.html" class="wm-nav-pill w-full ${isCreate ? 'active' : ''}">
          <span class="material-symbols-outlined text-[18px]">auto_awesome</span>
          <span>Create Wish</span>
        </a>
        <a href="/my-wishes.html" class="wm-nav-pill w-full ${isMyWishes ? 'active' : ''}">
          <span class="material-symbols-outlined text-[18px]">card_giftcard</span>
          <span>My Wishes</span>
        </a>
        <a href="/pricing.html" class="wm-nav-pill w-full ${isPricing ? 'active' : ''}">
          <span class="material-symbols-outlined text-[18px]">workspace_premium</span>
          <span>Pricing</span>
        </a>
        <a href="/help.html" class="wm-nav-pill w-full ${isHelp ? 'active' : ''}">
          <span class="material-symbols-outlined text-[18px]">support_agent</span>
          <span>Help &amp; Support</span>
        </a>
      </div>
    `;

    if (existingHeader) {
      existingHeader.className = 'sticky top-2 sm:top-4 z-50 px-2.5 sm:px-6 md:px-8 max-w-7xl mx-auto w-full transition-all';
      existingHeader.innerHTML = unifiedHeaderHTML;
    } else {
      const newHeader = document.createElement('header');
      newHeader.className = 'sticky top-2 sm:top-4 z-50 px-2.5 sm:px-6 md:px-8 max-w-7xl mx-auto w-full transition-all';
      newHeader.innerHTML = unifiedHeaderHTML;
      document.body.insertAdjacentElement('afterbegin', newHeader);
    }

    // If checkout.html or expired.html had pt-20 on main due to fixed header, normalize it
    const mainEl = document.querySelector('main');
    if (mainEl && mainEl.classList.contains('pt-20')) {
      mainEl.classList.remove('pt-20');
      mainEl.classList.add('pt-4');
    }

    // Trigger WishAuth to populate the newly injected .navbar-auth-container if already loaded
    if (window.WishAuth && typeof window.WishAuth.onAuthStateChange === 'function') {
      try {
        window.WishAuth.onAuthStateChange(() => {});
      } catch (_) {}
    }
  }

  function initStorefrontThemeAndHeader() {
    const isDark = document.documentElement.classList.contains('dark');
    ensureUnifiedStorefrontHeader();
    updateThemeUI(isDark);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStorefrontThemeAndHeader);
  } else {
    initStorefrontThemeAndHeader();
  }
})();

(function() {
  function syncHeroCastleBoundary() {
    var hero = document.getElementById('hero-desktop-section') || document.querySelector('.hero-desktop-canvas');
    if (!hero || !document.body) return;
    var bodyRect = document.body.getBoundingClientRect();
    var heroRect = hero.getBoundingClientRect();
    var endY = Math.round(heroRect.bottom - bodyRect.top + 10);
    if (endY > 180) {
      document.documentElement.style.setProperty('--wm-hero-end', endY + 'px');
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncHeroCastleBoundary);
  } else {
    syncHeroCastleBoundary();
  }
  window.addEventListener('load', syncHeroCastleBoundary);
  window.addEventListener('resize', syncHeroCastleBoundary);
})();

// 5. Universal Storefront Live Settings Synchronizer
(function() {
  async function syncGlobalStorefrontSettings() {
    if (typeof window.loadLiveSiteConfiguration === 'function') {
      return;
    }
    try {
      const res = await fetch('/api/settings/site?_t=' + Date.now(), {
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      }).catch(() => null);
      if (!res || !res.ok) return;
      const data = await res.json().catch(() => ({}));
      const s = (data.data && data.data.settings) || data.settings;
      if (!s) return;
      window._cachedSiteSettings = s;

      if (s.brandName) {
        document.querySelectorAll('.brand-name-text, #navbar-brand-name, #footer-brand-name, #copyright-brand-name').forEach(el => {
          el.textContent = s.brandName;
        });
      }
      if (s.supportWa) {
        const waText = document.getElementById('footer-support-wa-text');
        if (waText) waText.textContent = s.supportWa;
      }
      if (s.supportWaUrl) {
        const waLink = document.getElementById('footer-support-wa-link');
        if (waLink) waLink.href = s.supportWaUrl;
      }

      let banner = document.getElementById('wm-storefront-promo-banner');
      const isActive = Boolean(s.promoBannerActive || s.promoFreeOfferMode);
      const text = s.promoBannerActive
        ? (s.promoBannerText || '🎉 Special Launch Offer: All Personalized Links & VIP Wishes are 100% FREE Today!')
        : (s.promoFreeOfferMode ? (s.promoBadgeText || '🔥 Limited Time Offer: 100% FREE VIP Celebrations Active Now!') : '');
      if (!isActive || !text) {
        if (banner) banner.classList.add('hidden');
      } else if (document.body) {
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'wm-storefront-promo-banner';
          banner.className = 'w-full py-2 px-4 bg-gradient-to-r from-[#ff2a85] via-[#ec4899] to-[#a855f7] text-white text-center text-xs font-extrabold shadow-md z-[60] relative';
          document.body.insertAdjacentElement('afterbegin', banner);
        }
        banner.classList.remove('hidden');
        banner.textContent = text;
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncGlobalStorefrontSettings);
  } else {
    syncGlobalStorefrontSettings();
  }
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('wishmagic_site_settings');
      bc.onmessage = () => syncGlobalStorefrontSettings();
    }
  } catch (_) {}
  window.addEventListener('storage', (e) => {
    if (e.key === 'wishmagic_site_settings_updated_at') syncGlobalStorefrontSettings();
  });
})();
