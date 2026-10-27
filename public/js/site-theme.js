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

  // Single Mutual-Exclusion Dropdown Coordinator (Profile, Notifications, and 3-Line Menu NEVER open together!)
  window.closeAllHeaderDropdowns = function(exceptId) {
    if (exceptId !== 'account-dropdown-menu') {
      const acc = document.getElementById('account-dropdown-menu');
      if (acc) acc.classList.add('hidden');
    }
    if (exceptId !== 'wm-mobile-nav-drawer') {
      const mob = document.getElementById('wm-mobile-nav-drawer');
      if (mob) mob.classList.add('hidden');
    }
    if (exceptId !== 'wishmagic-notification-popover') {
      if (window.WishNotificationCenter && typeof window.WishNotificationCenter.close === 'function') {
        window.WishNotificationCenter.close();
      } else {
        const notif = document.getElementById('wishmagic-notification-popover');
        if (notif) notif.classList.add('hidden');
      }
    }
  };

  window.toggleMobileStorefrontNav = function(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    // Always close Profile dropdown & Notifications popover before toggling 3-line menu!
    window.closeAllHeaderDropdowns('wm-mobile-nav-drawer');
    const drawer = document.getElementById('wm-mobile-nav-drawer');
    if (!drawer) return;
    drawer.classList.toggle('hidden');
  };

  // Close mobile menu when clicking anywhere outside the header
  document.addEventListener('click', (e) => {
    const drawer = document.getElementById('wm-mobile-nav-drawer');
    const btn = document.getElementById('wm-mobile-menu-btn');
    if (drawer && !drawer.classList.contains('hidden')) {
      if (!drawer.contains(e.target) && (!btn || !btn.contains(e.target))) {
        drawer.classList.add('hidden');
      }
    }
  });

  // Working Navigation Handler for the 5 Header Options: Home, Templates, How It Works, Pricing, About
  window.handleStorefrontNav = function(event, targetKey) {
    window.closeAllHeaderDropdowns(null);
    const pathname = (window.location.pathname || '/').toLowerCase();
    const isHome = pathname === '/' || pathname.endsWith('/index.html');

    if (targetKey === 'home') {
      if (isHome) {
        if (event) event.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        highlightActiveHeaderNav('home');
      }
      return true;
    }

    if (targetKey === 'how-it-works') {
      const el = document.getElementById('how-it-works');
      if (isHome && el) {
        if (event) event.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        highlightActiveHeaderNav('how-it-works');
        return false;
      }
      return true;
    }

    if (targetKey === 'about') {
      const el = document.getElementById('about-section') || document.querySelector('footer');
      if (isHome && el) {
        if (event) event.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        highlightActiveHeaderNav('about');
        return false;
      }
      return true;
    }

    return true;
  };

  function highlightActiveHeaderNav(activeKey) {
    document.querySelectorAll('[data-nav-key]').forEach(el => {
      if (el.getAttribute('data-nav-key') === activeKey) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  function getThemePillButtonHTML() {
    const isDark = document.documentElement.classList.contains('dark');
    return `
      <button type="button" onclick="toggleSiteTheme()" class="wm-theme-pill-btn" data-theme-mode="${isDark ? 'dark' : 'light'}" aria-checked="${isDark ? 'true' : 'false'}" title="Switch Light / Dark Mode" aria-label="Toggle Light or Dark Theme">
        <span class="wm-theme-pill-sun" aria-hidden="true">
          <svg width="14" height="14" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 7a5 5 0 100 10 5 5 0 000-10zM2 13h2a1 1 0 100-2H2a1 1 0 100 2zm18 0h2a1 1 0 100-2h-2a1 1 0 100 2zM11 2v2a1 1 0 102 0V2a1 1 0 10-2 0zm0 18v2a1 1 0 102 0v-2a1 1 0 10-2 0zM5.99 4.58a1 1 0 00-1.41 1.41l1.06 1.06a1 1 0 001.41-1.41L5.99 4.58zm12.37 12.37a1 1 0 00-1.41 1.41l1.06 1.06a1 1 0 001.41-1.41l-1.06-1.06zm1.06-10.96a1 1 0 00-1.41-1.41l-1.06 1.06a1 1 0 001.41 1.41l1.06-1.06zM7.05 18.36a1 1 0 00-1.41-1.41l-1.06 1.06a1 1 0 001.41 1.41l1.06-1.06z"/>
          </svg>
        </span>
        <span class="wm-theme-pill-knob" aria-hidden="true">
          <svg width="14" height="14" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.1 22c-5.52 0-10-4.48-10-10 0-4.75 3.31-8.72 7.75-9.74.68-.16 1.24.53.94 1.16A7.96 7.96 0 0010 7c0 4.42 3.58 8 8 8 1.29 0 2.51-.31 3.58-.85.63-.31 1.32.25 1.16.94C21.72 19.53 17.34 22 12.1 22z"/>
          </svg>
        </span>
      </button>
    `;
  }

  // 4. Unified Header Across All Storefront Pages:
  //    - Desktop (>= 768px): Shows the 5 Options (Home, Templates, How It Works, Pricing, About) directly in the header, NO 3-line button, ZERO overflow!
  //    - Mobile (< 768px): Hides the 5 options from the bar, shows compact icon buttons + the 3-line button whose dropdown has the 5 options!
  function ensureUnifiedStorefrontHeader() {
    if (typeof document === 'undefined' || !document.body) return;
    const pathname = (window.location.pathname || '/').toLowerCase();
    const hash = (window.location.hash || '').toLowerCase();

    // Do not inject storefront header on Admin pages or fullscreen Wish player
    if (pathname.startsWith('/admin') || pathname.includes('wish.html') || pathname.includes('template-preview') || pathname.startsWith('/template/')) return;

    const isHome = pathname === '/' || pathname.endsWith('/index.html');
    if (isHome) {
      document.body.setAttribute('data-page', 'home');
      document.documentElement.setAttribute('data-page', 'home');
    } else {
      document.body.removeAttribute('data-page');
      document.documentElement.removeAttribute('data-page');
    }

    if (!document.querySelector('link[href*="Material+Symbols+Outlined"]')) {
      const iconLink = document.createElement('link');
      iconLink.rel = 'stylesheet';
      iconLink.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap';
      document.head.appendChild(iconLink);
    }

    let cloudLink = document.getElementById('wishmagic-cloud-css') || document.querySelector('link[href*="cloud-background.css"]');
    if (!cloudLink) {
      cloudLink = document.createElement('link');
      cloudLink.id = 'wishmagic-cloud-css';
      cloudLink.rel = 'stylesheet';
      cloudLink.href = '/css/cloud-background.css?v=20261027_mobile2col_v1';
      document.head.appendChild(cloudLink);
    }

    if (pathname.includes('customize')) {
      const devToggle = document.getElementById('dev-toggle-entitlement-btn');
      if (devToggle && devToggle.parentElement) {
        devToggle.parentElement.remove();
      }
      const oldThemeBtn = document.querySelector('header button[onclick*="toggleSiteTheme"]');
      if (oldThemeBtn && !oldThemeBtn.classList.contains('wm-theme-pill-btn')) {
        oldThemeBtn.outerHTML = getThemePillButtonHTML();
      }
      const customizerHeader = document.querySelector('header');
      if (customizerHeader) {
        customizerHeader.setAttribute('data-purpose', 'site-navigation');
        const navInner = customizerHeader.querySelector('.glass-nav');
        if (navInner) navInner.classList.add('wm-site-header-bar');
      }
      return;
    }

    let activeKey = 'home';
    if (pathname.includes('template') || pathname.includes('marketplace')) activeKey = 'templates';
    else if (pathname.includes('pricing') || pathname.includes('premium') || pathname.includes('checkout')) activeKey = 'pricing';
    else if (pathname.includes('help') || pathname.includes('contact') || pathname.includes('legal') || pathname.includes('support')) activeKey = 'about';
    else if (hash.includes('how-it-works')) activeKey = 'how-it-works';
    else if (hash.includes('about')) activeKey = 'about';

    const existingHeader = document.querySelector('header');
    const unifiedHeaderHTML = `
      <div class="wm-site-header-bar glass-nav rounded-full flex items-center justify-between relative">
        <!-- Left: Brand Logo -->
        <a href="/" onclick="return window.handleStorefrontNav(event, 'home')" class="wm-header-brand flex items-center gap-2 group flex-shrink-0 text-decoration-none min-w-0">
          <div class="wm-brand-icon-box w-8 h-8 rounded-xl bg-gradient-to-br from-[#a855f7] via-[#ec4899] to-[#f59e0b] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform flex-shrink-0">
            <svg width="16" height="16" class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
            </svg>
          </div>
          <div class="flex flex-col min-w-0">
            <span id="navbar-brand-name" class="brand-name-text font-display font-extrabold text-[15px] sm:text-[17px] lg:text-[19px] tracking-tight leading-none truncate">
              <span class="text-[#1a0f30] dark:text-white">Wish</span><span class="wm-brand-magic">Magic</span>
            </span>
            <span class="wm-brand-tagline text-[9px] font-semibold text-[#6e5d8f] dark:text-[#cfc2eb] tracking-wide mt-0.5 hidden 2xl:inline-block whitespace-nowrap">Create. Personalize. Celebrate.</span>
          </div>
        </a>

        <!-- Center: 5 Direct Working Options for Desktop View ONLY (Hidden on Mobile < 768px) -->
        <nav class="wm-desktop-nav items-center justify-center min-w-0" aria-label="Main Navigation">
          <a href="/" data-nav-key="home" onclick="return window.handleStorefrontNav(event, 'home')" class="wm-nav-pill ${activeKey === 'home' ? 'active' : ''}">
            <svg width="14" height="14" class="wm-nav-icon w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5.5v-6h-5v6H4a1 1 0 01-1-1v-9.5z"/></svg>
            <span>Home</span>
          </a>
          <a href="/templates.html" data-nav-key="templates" onclick="return window.handleStorefrontNav(event, 'templates')" class="wm-nav-pill ${activeKey === 'templates' ? 'active' : ''}">
            <svg width="14" height="14" class="wm-nav-icon w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            <span>Templates</span>
          </a>
          <a href="/#how-it-works" data-nav-key="how-it-works" onclick="return window.handleStorefrontNav(event, 'how-it-works')" class="wm-nav-pill ${activeKey === 'how-it-works' ? 'active' : ''}">
            <svg width="14" height="14" class="wm-nav-icon w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            <span>How It Works</span>
          </a>
          <a href="/pricing.html" data-nav-key="pricing" onclick="return window.handleStorefrontNav(event, 'pricing')" class="wm-nav-pill ${activeKey === 'pricing' ? 'active' : ''}">
            <svg width="14" height="14" class="wm-nav-icon w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M3 7l4.5 5L12 5l4.5 7L21 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
            <span>Pricing</span>
          </a>
          <a href="/#about-section" data-nav-key="about" onclick="return window.handleStorefrontNav(event, 'about')" class="wm-nav-pill ${activeKey === 'about' ? 'active' : ''}">
            <svg width="14" height="14" class="wm-nav-icon w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span>About</span>
          </a>
        </nav>

        <!-- Right: Compact Icon Controls on Mobile, Balanced Controls on Desktop -->
        <div class="wm-header-actions flex items-center flex-shrink-0">
          ${getThemePillButtonHTML()}

          <!-- Create Wish: Icon-only circle on Mobile (<640px), Compact Pill on Desktop -->
          <a href="/create.html" class="wm-header-create-btn inline-flex items-center justify-center rounded-full font-extrabold text-white bg-gradient-to-r from-[#ff2a85] via-[#ec4899] to-[#a855f7] hover:brightness-110 shadow-[0_6px_18px_rgba(236,72,153,0.3)] transition-all flex-shrink-0 whitespace-nowrap" title="Create Wish">
            <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
            <span class="wm-create-text-short">Create</span>
            <span class="wm-create-text-full">Create Wish</span>
          </a>

          <div data-purpose="navbar-notifications" class="relative inline-flex items-center flex-shrink-0"></div>

          <div data-purpose="navbar-auth" class="navbar-auth-container flex-shrink-0"></div>

          <!-- 3-Line Menu Button: Visible ONLY on Mobile (< 768px), Strictly Hidden on Desktop! -->
          <button type="button" id="wm-mobile-menu-btn" onclick="window.toggleMobileStorefrontNav(event)" class="wm-mobile-only-btn rounded-full bg-[#f4effc] dark:bg-[#25144a] border border-[#d6c8f2] dark:border-purple-500/40 items-center justify-center text-[#1a0f30] dark:text-white cursor-pointer flex-shrink-0" aria-label="Open Navigation Menu">
            <svg width="16" height="16" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.3" d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
        </div>
      </div>

      <!-- Mobile 3-Line Navigation Dropdown (Contains the 5 Options for Mobile View Only) -->
      <div id="wm-mobile-nav-drawer" class="hidden wm-mobile-only-drawer mt-2 p-3 rounded-2xl wm-card space-y-1 shadow-2xl">
        <a href="/" data-nav-key="home" onclick="return window.handleStorefrontNav(event, 'home')" class="wm-nav-pill w-full ${activeKey === 'home' ? 'active' : ''}">
          <svg width="16" height="16" class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5.5v-6h-5v6H4a1 1 0 01-1-1v-9.5z"/></svg>
          <span>Home</span>
        </a>
        <a href="/templates.html" data-nav-key="templates" onclick="return window.handleStorefrontNav(event, 'templates')" class="wm-nav-pill w-full ${activeKey === 'templates' ? 'active' : ''}">
          <svg width="16" height="16" class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          <span>Templates</span>
        </a>
        <a href="/#how-it-works" data-nav-key="how-it-works" onclick="return window.handleStorefrontNav(event, 'how-it-works')" class="wm-nav-pill w-full ${activeKey === 'how-it-works' ? 'active' : ''}">
          <svg width="16" height="16" class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          <span>How It Works</span>
        </a>
        <a href="/pricing.html" data-nav-key="pricing" onclick="return window.handleStorefrontNav(event, 'pricing')" class="wm-nav-pill w-full ${activeKey === 'pricing' ? 'active' : ''}">
          <svg width="16" height="16" class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M3 7l4.5 5L12 5l4.5 7L21 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
          <span>Pricing</span>
        </a>
        <a href="/#about-section" data-nav-key="about" onclick="return window.handleStorefrontNav(event, 'about')" class="wm-nav-pill w-full ${activeKey === 'about' ? 'active' : ''}">
          <svg width="16" height="16" class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>About</span>
        </a>
        <div class="pt-2 mt-1 border-t border-[#e2d6f8] dark:border-purple-800/60 flex items-center gap-2">
          <a href="/create.html" class="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#ff2a85] via-[#ec4899] to-[#a855f7] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm">
            <svg width="14" height="14" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
            <span>Create Wish</span>
          </a>
          <a href="/my-wishes.html" class="flex-1 py-2.5 px-3 rounded-xl bg-[#f4effc] dark:bg-[#25144a] border border-[#d6c8f2] dark:border-purple-500/40 text-[#1a0f30] dark:text-white font-extrabold text-xs flex items-center justify-center gap-1.5">
            <span>🎁</span>
            <span>My Wishes</span>
          </a>
        </div>
      </div>
    `;

    if (existingHeader) {
      existingHeader.className = 'sticky top-2 sm:top-4 z-50 px-2 sm:px-4 lg:px-6 max-w-7xl mx-auto w-full transition-all';
      existingHeader.setAttribute('data-purpose', 'site-navigation');
      if (!existingHeader.querySelector('.wm-site-header-bar')) {
        existingHeader.innerHTML = unifiedHeaderHTML;
      } else {
        highlightActiveHeaderNav(activeKey);
      }
    } else {
      const newHeader = document.createElement('header');
      newHeader.className = 'sticky top-2 sm:top-4 z-50 px-2 sm:px-4 lg:px-6 max-w-7xl mx-auto w-full transition-all';
      newHeader.setAttribute('data-purpose', 'site-navigation');
      newHeader.innerHTML = unifiedHeaderHTML;
      document.body.insertAdjacentElement('afterbegin', newHeader);
    }

    const mainEl = document.querySelector('main');
    if (mainEl && mainEl.classList.contains('pt-20')) {
      mainEl.classList.remove('pt-20');
      mainEl.classList.add('pt-4');
    }

    if (window.WishNotificationCenter && typeof window.WishNotificationCenter._renderNotificationCenter === 'function') {
      try {
        window.WishNotificationCenter._renderNotificationCenter();
        window.WishNotificationCenter.refreshBadgeCount();
      } catch (_) {}
    }
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
    const _p = (window.location.pathname || '/').toLowerCase();
    if (_p.includes('template-preview') || _p.startsWith('/template/')) return;
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
      try {
        const bgm = s.pageBgMode === 'diwali-palace' ? 'diwali-palace' : 'cloudy';
        const bgl = Math.min(50, Math.max(1, Math.round(Number(s.pageBgBlur) || 1)));
        document.documentElement.setAttribute('data-page-bg-mode', bgm);
        document.documentElement.setAttribute('data-page-bg-blur', String(bgl));
        if (document.body) {
          document.body.setAttribute('data-page-bg-mode', bgm);
          document.body.setAttribute('data-page-bg-blur', String(bgl));
        }
        localStorage.setItem('wishmagic_site_settings_v1', JSON.stringify(s));
      } catch (_) {}

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

  function escapeHtmlSafe(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function syncStorefrontFestivalSchedule() {
    if (typeof document === 'undefined' || !document.body) return;
    const pathname = (window.location.pathname || '/').toLowerCase();
    if (pathname.startsWith('/admin') || pathname.includes('wish.html') || pathname.includes('template-preview') || pathname.startsWith('/template/')) return;

    try {
      const res = await fetch('/api/festivals/active?_t=' + Date.now(), {
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      }).catch(() => null);
      if (!res || !res.ok) return;
      const json = await res.json().catch(() => ({}));
      const data = json.data || json || {};
      const activeCampaigns = Array.isArray(data.activeCampaigns) ? data.activeCampaigns : [];
      const inWindowFestivals = Array.isArray(data.inWindowFestivals) ? data.inWindowFestivals : [];
      const upcomingFestivals = Array.isArray(data.upcomingFestivals) ? data.upcomingFestivals : [];
      window._wmActiveFestivalState = { activeCampaigns, inWindowFestivals, upcomingFestivals, storefrontSpotlight: data.storefrontSpotlight || null };

      // 1. Inject dynamic active campaign filter pills into #occasion-pills if present
      const pillsBox = document.getElementById('occasion-pills');
      if (pillsBox) {
        pillsBox.querySelectorAll('[data-dynamic-festival-pill="1"]').forEach(el => el.remove());
        activeCampaigns.forEach(camp => {
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.setAttribute('data-dynamic-festival-pill', '1');
          pill.setAttribute('data-category', camp.festivalSlug || 'festive');
          pill.className = 'category-btn glass-pill px-4 py-2 rounded-full text-xs sm:text-sm font-extrabold text-amber-900 dark:text-amber-200 border border-amber-400/50 bg-amber-500/10 flex items-center gap-1.5 transition whitespace-nowrap shadow-sm cursor-pointer';
          pill.innerHTML = '<span>🪔</span><span>' + escapeHtmlSafe(camp.badgeLabel || camp.festivalName || camp.title) + '</span>';
          pill.onclick = function() {
            if (typeof window.filterTemplates === 'function') {
              window.filterTemplates('festive', pill);
            }
          };
          pillsBox.insertAdjacentElement('afterbegin', pill);
        });
      }

      // 2. Render Live Festival Campaign Spotlight Banner above templates grid on Home & Templates pages
      const anchorEl = document.getElementById('occasion-pills') || document.getElementById('templates-grid') || document.getElementById('templates-grid-container');
      let spotlightEl = document.getElementById('wm-festival-scheduler-spotlight');

      const primaryActive = activeCampaigns[0] || null;
      const primaryFestival = primaryActive || inWindowFestivals[0] || upcomingFestivals[0] || null;

      if (!primaryFestival || !anchorEl || !anchorEl.parentNode) {
        if (spotlightEl) spotlightEl.classList.add('hidden');
        return;
      }

      const festName = primaryActive ? (primaryActive.festivalName || primaryActive.title) : (primaryFestival.name || 'Festival Celebration');
      const badgeLabel = primaryActive ? (primaryActive.badgeLabel || ('✨ ' + festName + ' Live')) : (primaryFestival.isWindowOpen ? ('🟢 ' + festName + ' Window Open') : ('📅 Upcoming: ' + festName));
      const effDate = primaryActive ? primaryActive.effectiveFestivalDate : primaryFestival.effectiveDate;
      const winStart = primaryActive ? primaryActive.windowStartDate : primaryFestival.windowStartDate;
      const winEnd = primaryActive ? primaryActive.windowEndDate : primaryFestival.windowEndDate;
      const firstTplId = (primaryActive && Array.isArray(primaryActive.assignedTemplateIds) && primaryActive.assignedTemplateIds[0]) || 'tpl_festive_lights';
      const campParam = primaryActive && primaryActive.id ? ('&campaign=' + encodeURIComponent(primaryActive.id)) : '';

      let daysAwayText = 'Live Now!';
      if (effDate) {
        const diffMs = new Date(effDate + 'T00:00:00+05:30').getTime() - Date.now();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays > 0) daysAwayText = diffDays + (diffDays === 1 ? ' Day to Go' : ' Days to Go');
        else if (diffDays === 0) daysAwayText = '🎉 Festival Today!';
        else daysAwayText = '✨ Celebration Window Open';
      }

      if (!spotlightEl) {
        spotlightEl = document.createElement('div');
        spotlightEl.id = 'wm-festival-scheduler-spotlight';
        anchorEl.parentNode.insertBefore(spotlightEl, anchorEl);
      }

      spotlightEl.className = 'mb-6 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#2b1055]/95 via-[#4c1d95]/95 to-[#831843]/95 border border-amber-400/40 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4';
      spotlightEl.innerHTML = `
        <div class="space-y-1.5">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-3 py-1 rounded-full text-[11px] font-extrabold bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-sm">${escapeHtmlSafe(badgeLabel)}</span>
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/15 text-amber-200 border border-white/20">⏳ ${escapeHtmlSafe(daysAwayText)}</span>
            <span class="text-xs font-mono text-purple-200">Festival Date: <strong>${escapeHtmlSafe(effDate || '—')}</strong> • Active Window: <strong>${escapeHtmlSafe(winStart || '—')} → ${escapeHtmlSafe(winEnd || '—')}</strong></span>
          </div>
          <h3 class="text-base sm:text-lg font-extrabold tracking-tight text-white">🪔 ${escapeHtmlSafe(primaryActive ? primaryActive.title : (festName + ' Celebration Special'))}</h3>
          <p class="text-xs text-purple-100/90 max-w-2xl">${escapeHtmlSafe(primaryActive && primaryActive.description ? primaryActive.description : 'Create personalized interactive festival wishes with 3D animations, photos & music — your wish link opens immediately!')}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2.5 shrink-0">
          <button type="button" onclick="if(window.filterTemplates){window.filterTemplates('festive');const g=document.getElementById('templates-grid');if(g)g.scrollIntoView({behavior:'smooth'});}else{window.location.href='/templates.html?category=festival';}" class="px-4 py-2.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/30 text-white text-xs font-extrabold transition cursor-pointer">
            🎉 View Festival Templates
          </button>
          <a href="/customize.html?template=${encodeURIComponent(firstTplId)}${campParam}" class="px-4 py-2.5 rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 hover:brightness-110 text-slate-950 text-xs font-extrabold shadow-lg transition">
            ✨ Create Festival Wish Now
          </a>
        </div>
      `;
    } catch (_) {}
  }

  window.syncStorefrontFestivalSchedule = syncStorefrontFestivalSchedule;

  function triggerAllStorefrontLiveSync() {
    syncGlobalStorefrontSettings();
    syncStorefrontFestivalSchedule();
    if (typeof window.loadLiveSiteConfiguration === 'function') {
      try { window.loadLiveSiteConfiguration(); } catch (_) {}
    }
    if (typeof window.refreshHomepageTemplates === 'function') {
      try { window.refreshHomepageTemplates(); } catch (_) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      syncGlobalStorefrontSettings();
      syncStorefrontFestivalSchedule();
    });
  } else {
    syncGlobalStorefrontSettings();
    syncStorefrontFestivalSchedule();
  }
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('wishmagic_site_settings');
      bc.onmessage = () => triggerAllStorefrontLiveSync();
    }
  } catch (_) {}
  window.addEventListener('storage', (e) => {
    if (e.key === 'wishmagic_site_settings_updated_at') {
      triggerAllStorefrontLiveSync();
      WishPricingEngine.refreshFromServer();
    }
  });

  // =========================================================================
  // 6. GLOBAL MODULAR & COMBO PRICING ENGINE + 7-REFERRAL AUTO-TRACKER
  // =========================================================================
  const DEFAULT_PRICING_RULES = {
    customLinkPrice: 59,        // ₹59 for Custom Link only
    hdImageStylePrice: 59,      // ₹59 for High Quality Images + Custom Style
    freeTemplateComboPrice: 99, // ₹99 for Free Template Combo (Custom Link + HD Images + Style)
    premiumComboAddonPrice: 70, // +₹70 added to any Premium Template price for full Combo
    templatePriceTiers: [0, 59, 149],
    requiredReferrals: 7
  };

  let activePricingRules = { ...DEFAULT_PRICING_RULES };
  try {
    const cachedPricing = localStorage.getItem('wishmagic_pricing_rules_v4');
    if (cachedPricing) {
      activePricingRules = { ...DEFAULT_PRICING_RULES, ...JSON.parse(cachedPricing) };
    }
  } catch (_) {}

  const WishPricingEngine = {
    getRules() {
      return { ...activePricingRules };
    },

    async refreshFromServer() {
      try {
        const res = await fetch('/api/settings/wish-links', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const s = (data && data.data && data.data.settings) || (data && data.settings) || {};
          const a = s.addons || {};
          const refCfg = s.referral || {};
          const toNonNeg = (val, fallback) => {
            if (val === undefined || val === null || val === '' || typeof val === 'boolean') return fallback;
            const n = Number(val);
            return Number.isFinite(n) && n >= 0 ? n : fallback;
          };
          activePricingRules = {
            customLinkPrice: toNonNeg(a.customLinkPrice ?? s.personalized?.price, 59),
            hdImageStylePrice: toNonNeg(a.hdImageStylePrice, 59),
            freeTemplateComboPrice: toNonNeg(a.freeTemplateComboPrice, 99),
            premiumComboAddonPrice: toNonNeg(a.premiumComboAddonPrice, 70),
            creatorPackPrice: toNonNeg(a.creatorPackPrice, 99),
            vipPassPrice: toNonNeg(a.vipPassPrice, 49),
            templatePriceTiers: Array.isArray(a.templatePriceTiers) && a.templatePriceTiers.length > 0 ? a.templatePriceTiers.map(Number) : [0, 59, 149],
            requiredReferrals: Math.max(1, parseInt(refCfg.requiredReferrals ?? 7, 10) || 7),
            vipPlans: Array.isArray(s.vipPlans) ? s.vipPlans : []
          };
          window._cachedWishLinkSettings = s;
          if (window.WishPlanService && typeof window.WishPlanService.syncFromServerSettings === "function") {
            window.WishPlanService.syncFromServerSettings(s);
          }
          try {
            localStorage.setItem('wishmagic_pricing_rules_v4', JSON.stringify(activePricingRules));
          } catch (_) {}
        }
      } catch (_) {}
      return { ...activePricingRules };
    },

    /**
     * Calculates exact price breakdown for any template + add-on / combo selection:
     * - Free Template (₹0):
     *   • Custom Link Only = ₹59 (or ₹0 with 7-Friends Referral Credit!)
     *   • HD Images + Style Only = ₹59
     *   • All-in-One Combo (Custom Link + HD Images + Style) = ₹99 (Save ₹19)
     * - Premium Template (₹59, ₹149, etc.):
     *   • Template Only (Random Link) = Template Price (e.g. ₹59 or ₹149)
     *   • Template + Custom Link Only = Template Price + ₹59
     *   • Template + HD Images & Style Only = Template Price + ₹59
     *   • Template + Full Combo (Custom Link + HD Images + Style) = Template Price + ₹70 (Save ₹48!)
     */
    calculateQuote(opts = {}) {
      const rules = this.getRules();
      const tplPrice = Math.max(0, Number(opts.templatePrice || 0));
      const isPremiumTemplate = tplPrice > 0;
      const isCombo = Boolean(opts.isCombo || (opts.hasCustomLink && opts.hasHdImageStyle));
      const hasCustomLink = Boolean(isCombo || opts.hasCustomLink);
      const hasHdImageStyle = Boolean(isCombo || opts.hasHdImageStyle);
      const useReferralCredit = Boolean(opts.useReferralCredit && !isPremiumTemplate && hasCustomLink);

      const clPrice = rules.customLinkPrice;
      const hdPrice = rules.hdImageStylePrice;
      const freeCombo = rules.freeTemplateComboPrice;
      const premComboAddon = rules.premiumComboAddonPrice;

      let regularTotal = tplPrice + (hasCustomLink ? clPrice : 0) + (hasHdImageStyle ? hdPrice : 0);
      let finalPayable = regularTotal;
      let planCode = 'free_random';
      let planLabel = 'Free Template + Random Link';

      if (!isPremiumTemplate) {
        if (isCombo) {
          if (useReferralCredit) {
            finalPayable = hdPrice; // Custom link is free via referral credit, only HD+Style paid
            planCode = 'hd_image_style_pack';
            planLabel = 'Free Template + Referral Free Custom Link + HD Images & Style';
          } else {
            finalPayable = freeCombo; // ₹99 Combo
            planCode = 'free_template_combo';
            planLabel = `Free Template + All-in-One Combo (Custom Link + HD Images & Style) • ₹${freeCombo}`;
          }
        } else if (hasCustomLink) {
          if (useReferralCredit) {
            finalPayable = 0;
            planCode = 'referral_free_custom_link';
            planLabel = 'Free Custom Link (7-Friends Referral Reward Redeemed • ₹0)';
          } else {
            finalPayable = clPrice; // ₹59
            planCode = 'personalized_link';
            planLabel = `Custom Link Only • ₹${clPrice}`;
          }
        } else if (hasHdImageStyle) {
          finalPayable = hdPrice; // ₹59
          planCode = 'hd_image_style_pack';
          planLabel = `HD Images + Custom Style Pack • ₹${hdPrice}`;
        } else {
          finalPayable = 0;
          planCode = 'free_random';
          planLabel = 'Free Template + Free Random Link • ₹0';
        }
      } else {
        // Premium Template (e.g. ₹59 or ₹149)
        if (isCombo) {
          finalPayable = tplPrice + premComboAddon; // Template Price + ₹70
          planCode = 'premium_template_combo';
          planLabel = `Premium Template (₹${tplPrice}) + Full Combo (+₹${premComboAddon} for Custom Link + HD Images & Style)`;
        } else if (hasCustomLink) {
          finalPayable = tplPrice + clPrice;
          planCode = 'template_plus_custom_link';
          planLabel = `Premium Template (₹${tplPrice}) + Custom Link (₹${clPrice})`;
        } else if (hasHdImageStyle) {
          finalPayable = tplPrice + hdPrice;
          planCode = 'template_plus_hd_style';
          planLabel = `Premium Template (₹${tplPrice}) + HD Images & Style (₹${hdPrice})`;
        } else {
          finalPayable = tplPrice;
          planCode = 'template_only';
          planLabel = `Premium Template Only (₹${tplPrice}) + Free Random Link`;
        }
      }

      const savings = Math.max(0, regularTotal - finalPayable);
      return {
        templatePrice: tplPrice,
        isPremiumTemplate,
        hasCustomLink,
        hasHdImageStyle,
        isCombo,
        useReferralCredit,
        customLinkUnitPrice: clPrice,
        hdImageStyleUnitPrice: hdPrice,
        freeComboUnitPrice: freeCombo,
        premiumComboAddonUnitPrice: premComboAddon,
        regularTotal,
        finalPayable,
        savings,
        planCode,
        planLabel
      };
    }
  };

  window.WishPricingEngine = WishPricingEngine;
  WishPricingEngine.refreshFromServer();

  // Global ?ref= Referral Code Auto-Capture & Attribution Linker
  (function initGlobalReferralCapture() {
    try {
      const params = new URLSearchParams(window.location.search);
      const refCode = (params.get('ref') || params.get('invite') || '').trim().toUpperCase();
      if (refCode && refCode.length >= 3) {
        localStorage.setItem('wm_pending_referral_code', refCode);
        document.cookie = `wm_ref=${encodeURIComponent(refCode)}; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Lax`;
        fetch('/api/referrals/track-click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            referralCode: refCode,
            landingPage: window.location.pathname
          })
        }).catch(() => {});
      }

      // Whenever a user authenticates, link their pending referral code if not already linked
      const tryLinkPendingReferral = () => {
        const pendingCode = localStorage.getItem('wm_pending_referral_code');
        if (!pendingCode) return;
        if (window.WishAuth && typeof window.WishAuth.onAuthStateChange === 'function') {
          window.WishAuth.onAuthStateChange((user) => {
            if (user && user.id) {
              const linkedKey = `wm_ref_linked_${user.id}`;
              if (localStorage.getItem(linkedKey)) return;
              fetch('/api/referrals/link-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ referralCode: pendingCode })
              }).then(r => r.json()).then(res => {
                if (res && (res.success || res.reason === 'ALREADY_ATTRIBUTED')) {
                  localStorage.setItem(linkedKey, '1');
                }
              }).catch(() => {});
            }
          });
        }
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryLinkPendingReferral);
      } else {
        tryLinkPendingReferral();
      }
    } catch (_) {}
  })();

})();
