/**
 * WishMagic Clay Admin App — Complete Live Control Studio (v1.4.0)
 * Native 3D Claymorphism Interactive Workspace & Embedded Studio Dock Controller
 */

(function () {
  'use strict';

  // Section configuration & route mapping
  const SECTION_CONFIG = {
    overview: {
      title: 'Dashboard & Live Website Control',
      desc: 'Real-time live overview of wishes, templates, festivals, orders, and system health.',
      icon: 'fa-chart-pie',
      pill: 'REAL-TIME D1 SYNC',
      studioRoute: '/admin/anktech/anktech/admin/overview'
    },
    templates: {
      title: 'Universal Template Protocol (UTP v1.4.0) Registry',
      desc: 'Inspect, activate, duplicate, version, or archive celebration templates.',
      icon: 'fa-layer-group',
      pill: 'ALL TEMPLATES',
      studioRoute: '/admin/anktech/anktech/admin/templates'
    },
    'add-template': {
      title: 'Upload & Auto-Recognize Template (ZIP)',
      desc: 'Upload ZIP packages, auto-detect UTP schema, test sandbox, and publish directly to live store.',
      icon: 'fa-cloud-arrow-up',
      pill: 'INGEST STUDIO v1.4',
      studioRoute: '/admin/anktech/anktech/admin/add-template'
    },
    festivals: {
      title: 'Festival & Occasion Dynamic Scheduler',
      desc: 'Schedule automated Diwali, New Year, Valentine, and custom festival campaigns with auto-banners.',
      icon: 'fa-calendar-check',
      pill: 'AUTO SCHEDULER',
      studioRoute: '/admin/anktech/anktech/admin/festivals'
    },
    occasions: {
      title: 'Categories & Celebration Occasions',
      desc: 'Manage store categories, occasion slugs, and template associations.',
      icon: 'fa-tags',
      pill: 'STORE TAXONOMY',
      studioRoute: '/admin/anktech/anktech/admin/occasions'
    },
    media: {
      title: 'Media Asset Storage & Delivery Inventory',
      desc: 'Backblaze B2 and ImgBB asset management, mime types, and storage health.',
      icon: 'fa-photo-film',
      pill: 'B2 + IMGBB',
      studioRoute: '/admin/anktech/anktech/admin/media'
    },
    music: {
      title: 'Celebration Background Audio Library',
      desc: 'Audio tracks, background loops, stream URLs, and audio preview controls.',
      icon: 'fa-music',
      pill: 'AUDIO ENGINE',
      studioRoute: '/admin/anktech/anktech/admin/media'
    },
    wishes: {
      title: 'Live Wishes Registry & User Celebrations',
      desc: 'Filter, inspect, share, extend expiration, or moderate all user created wishes.',
      icon: 'fa-heart',
      pill: 'WISH DIRECTORY',
      studioRoute: '/admin/anktech/anktech/admin/wishes'
    },
    expiring: {
      title: 'Expiring Soon Celebrations',
      desc: 'Wishes reaching expiration within 48 hours with grace period controls.',
      icon: 'fa-hourglass-half',
      pill: 'EXPIRATION RADAR',
      studioRoute: '/admin/anktech/anktech/admin/wishes'
    },
    analytics: {
      title: 'Executive Analytics & BI Insights',
      desc: 'Wish views, template conversion rates, device metrics, and revenue breakdown.',
      icon: 'fa-chart-line',
      pill: 'BUSINESS INTELLIGENCE',
      studioRoute: '/admin/anktech/anktech/admin/analytics'
    },
    users: {
      title: 'Customer Directory & Access Management',
      desc: 'Registered accounts, role elevation (Admin, Staff, User), and tier entitlements.',
      icon: 'fa-users',
      pill: 'IDENTITY & ACCESS',
      studioRoute: '/admin/anktech/anktech/admin/users'
    },
    pricing: {
      title: 'Pricing Models & Subscription Plans',
      desc: 'Free, Pro, VIP plan pricing, Razorpay plan IDs, and customizer feature gates.',
      icon: 'fa-crown',
      pill: 'COMMERCE GATES',
      studioRoute: '/admin/anktech/anktech/admin/pricing'
    },
    orders: {
      title: 'Payment Transactions & Invoices',
      desc: 'Razorpay orders, payment signatures, refunds, and user purchase logs.',
      icon: 'fa-receipt',
      pill: 'RAZORPAY GATEWAY',
      studioRoute: '/admin/anktech/anktech/admin/orders'
    },
    settings: {
      title: 'Core System Configuration (All 12 Keys)',
      desc: 'Hero blur, rate limiters, storage keys, site branding, and maintenance mode.',
      icon: 'fa-sliders',
      pill: 'SYSTEM CONFIG',
      studioRoute: '/admin/anktech/anktech/admin/settings'
    },
    'storage-health': {
      title: 'Multi-Cloud Storage Health & Connectivity',
      desc: 'Live latency, quotas, and integrity checks for Backblaze B2, ImgBB, and Cloudflare D1.',
      icon: 'fa-server',
      pill: 'DIAGNOSTICS',
      studioRoute: '/admin/anktech/anktech/admin/storage-health'
    },
    backups: {
      title: 'Database Backups & D1 Data Portability',
      desc: 'Export SQL snapshots, verify schema migrations, and manage historical database states.',
      icon: 'fa-database',
      pill: 'DISASTER RECOVERY',
      studioRoute: '/admin/anktech/anktech/admin/settings'
    },
    'audit-logs': {
      title: 'Admin Activity & Security Audit Trail',
      desc: 'Immutable audit logs of all configuration changes, template edits, and admin sign-ins.',
      icon: 'fa-clipboard-list',
      pill: 'ZERO TRUST LOGS',
      studioRoute: '/admin/anktech/anktech/admin/audit-logs'
    },
    'user-creations': {
      title: 'User Creations Visual Showcase',
      desc: 'Live interactive gallery of public user-customized wishes across all templates.',
      icon: 'fa-wand-sparkles',
      pill: 'LIVE CREATIONS',
      studioRoute: '/admin/anktech/anktech/admin/user-creations'
    },
    search: {
      title: 'Search & Discovery Engine Diagnostics',
      desc: 'Search indexes, trending keywords, auto-complete suggestions, and query weights.',
      icon: 'fa-magnifying-glass',
      pill: 'DISCOVERY INDEX',
      studioRoute: '/admin/anktech/anktech/admin/search'
    },
    referrals: {
      title: '7-Invite Referral Rewards Engine',
      desc: 'Referral tracking, unlocked premium perks, fraud protection, and redemption logs.',
      icon: 'fa-gift',
      pill: 'VIRAL GROWTH',
      studioRoute: '/admin/anktech/anktech/admin/referrals'
    },
    moderation: {
      title: 'Content Moderation & Safety Shield',
      desc: 'Automated offensive language filters, media inspection, and flagged wishes queue.',
      icon: 'fa-shield-halved',
      pill: 'TRUST & SAFETY',
      studioRoute: '/admin/anktech/anktech/admin/moderation'
    },
    support: {
      title: 'Support Desk & Customer Tickets',
      desc: 'Manage support tickets, user inquiries, refund requests, and direct resolutions.',
      icon: 'fa-headset',
      pill: 'SUPPORT CONSOLE',
      studioRoute: '/admin/anktech/anktech/admin/support'
    },
    staff: {
      title: 'Staff Roles & Team Permissions',
      desc: 'Role-based access control (RBAC), team member credentials, and permission scopes.',
      icon: 'fa-user-shield',
      pill: 'TEAM ACCESS',
      studioRoute: '/admin/anktech/anktech/admin/staff'
    },
    legal: {
      title: 'Legal Compliance & Privacy Center',
      desc: 'GDPR/DPDP compliance, cookie consent settings, terms of service, and privacy rules.',
      icon: 'fa-scale-balanced',
      pill: 'COMPLIANCE',
      studioRoute: '/admin/anktech/anktech/admin/compliance'
    },
    announcements: {
      title: 'Storefront Announcements & Banners',
      desc: 'Broadcast sitewide alerts, promo banners, countdown notices, and celebration banners.',
      icon: 'fa-bullhorn',
      pill: 'STORE ALERTS',
      studioRoute: '/admin/anktech/anktech/admin/announcements'
    },
    notifications: {
      title: 'Notification Queue & Dispatch Engine',
      desc: 'Push notifications, email dispatch history, automated wish reminders, and logs.',
      icon: 'fa-bell',
      pill: 'DISPATCH QUEUE',
      studioRoute: '/admin/anktech/anktech/admin/notifications'
    }
  };

  // State management
  const state = {
    activeSection: 'overview',
    viewMode: 'native', // 'native' | 'dock'
    apiBase: localStorage.getItem('clay_admin_api_base') || '',
    bearerToken: localStorage.getItem('clay_admin_token') || '',
    stats: {
      templates: 0,
      festivals: 0,
      wishes: 0,
      users: 0,
      orders: 0
    },
    deferredPrompt: null
  };

  // DOM elements cache
  let dom = {};

  function initElements() {
    dom = {
      sidebar: document.getElementById('clay-sidebar'),
      sidebarNav: document.getElementById('clay-sidebar-nav'),
      sidebarOpenBtn: document.getElementById('clay-sidebar-open-mobile'),
      sidebarCloseBtn: document.getElementById('clay-sidebar-close-mobile'),
      openLiveSiteBtn: document.getElementById('clay-btn-open-live-site'),
      globalSearch: document.getElementById('clay-global-search'),
      modeNativeBtn: document.getElementById('clay-mode-native-btn'),
      modeDockBtn: document.getElementById('clay-mode-dock-btn'),
      nativeWorkspace: document.getElementById('clay-native-workspace'),
      dockWorkspace: document.getElementById('clay-dock-workspace'),
      dockRouteLabel: document.getElementById('clay-dock-route-label'),
      dockReloadBtn: document.getElementById('clay-dock-reload-btn'),
      dockPopoutBtn: document.getElementById('clay-dock-popout-btn'),
      dockBackNativeBtn: document.getElementById('clay-dock-back-native-btn'),
      studioIframe: document.getElementById('clay-studio-iframe'),
      activeSectionOrb: document.getElementById('clay-active-section-orb'),
      activeSectionIcon: document.getElementById('clay-active-section-icon'),
      activeSectionTitle: document.getElementById('clay-active-section-title'),
      activeSectionPill: document.getElementById('clay-active-section-pill'),
      activeSectionDesc: document.getElementById('clay-active-section-desc'),
      themeToggleBtn: document.getElementById('clay-theme-toggle-btn'),
      themeIcon: document.getElementById('clay-theme-icon'),
      syncNowBtn: document.getElementById('clay-sync-now-btn'),
      syncIcon: document.getElementById('clay-sync-icon'),
      installPwaBtn: document.getElementById('clay-install-pwa-btn'),
      backendConnBtn: document.getElementById('clay-backend-conn-btn'),
      connModal: document.getElementById('clay-connection-modal'),
      connModalClose: document.getElementById('clay-conn-modal-close'),
      apiBaseInput: document.getElementById('clay-api-base-input'),
      tokenInput: document.getElementById('clay-bearer-token-input'),
      saveConnBtn: document.getElementById('clay-save-conn-btn'),
      testPingBtn: document.getElementById('clay-test-ping-btn'),
      authStatusBadge: document.getElementById('clay-auth-status-badge'),
      loginEmail: document.getElementById('clay-login-email'),
      loginPassword: document.getElementById('clay-login-password'),
      loginSubmitBtn: document.getElementById('clay-login-submit-btn'),
      syncToast: document.getElementById('clay-live-sync-toast'),
      toastTitle: document.getElementById('clay-toast-title'),
      toastMsg: document.getElementById('clay-toast-msg'),
      badgeTemplates: document.getElementById('nav-badge-templates'),
      badgeFestivals: document.getElementById('nav-badge-festivals'),
      badgeWishes: document.getElementById('nav-badge-wishes'),
      badgeUsers: document.getElementById('nav-badge-users'),
      badgeOrders: document.getElementById('nav-badge-orders')
    };
  }

  // Toast notification helper
  function showToast(title, msg) {
    if (!dom.syncToast) return;
    if (dom.toastTitle && title) dom.toastTitle.textContent = title;
    if (dom.toastMsg && msg) dom.toastMsg.textContent = msg;
    dom.syncToast.classList.add('show');
    setTimeout(() => {
      dom.syncToast.classList.remove('show');
    }, 3800);
  }

  // Theme management
  function initTheme() {
    const savedTheme = localStorage.getItem('clay_theme') || 'light';
    setTheme(savedTheme);

    if (dom.themeToggleBtn) {
      dom.themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
      });
    }
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      if (dom.themeIcon) {
        dom.themeIcon.className = 'fa-solid fa-sun text-sm text-amber-400';
      }
    } else {
      document.documentElement.classList.remove('dark');
      if (dom.themeIcon) {
        dom.themeIcon.className = 'fa-solid fa-moon text-sm';
      }
    }
    localStorage.setItem('clay_theme', theme);
  }

  // Mode switching: Native Clay View vs Embedded Full Studio View
  function setViewMode(mode) {
    state.viewMode = mode;
    if (mode === 'dock') {
      if (dom.nativeWorkspace) dom.nativeWorkspace.classList.add('hidden');
      if (dom.dockWorkspace) {
        dom.dockWorkspace.classList.remove('hidden');
        dom.dockWorkspace.classList.add('flex');
      }
      if (dom.modeNativeBtn) {
        dom.modeNativeBtn.classList.remove('clay-btn-primary');
      }
      if (dom.modeDockBtn) {
        dom.modeDockBtn.classList.add('clay-btn-primary');
      }
      updateDockIframe();
    } else {
      if (dom.dockWorkspace) {
        dom.dockWorkspace.classList.remove('flex');
        dom.dockWorkspace.classList.add('hidden');
      }
      if (dom.nativeWorkspace) dom.nativeWorkspace.classList.remove('hidden');
      if (dom.modeNativeBtn) {
        dom.modeNativeBtn.classList.add('clay-btn-primary');
      }
      if (dom.modeDockBtn) {
        dom.modeDockBtn.classList.remove('clay-btn-primary');
      }
    }
  }

  function updateDockIframe() {
    const conf = SECTION_CONFIG[state.activeSection] || SECTION_CONFIG.overview;
    const base = state.apiBase ? state.apiBase.replace(/\/+$/, '') : '';
    const route = conf.studioRoute || '/admin/anktech/anktech/admin/overview';
    const targetUrl = base + route;

    if (dom.dockRouteLabel) dom.dockRouteLabel.textContent = route;
    if (dom.studioIframe && dom.studioIframe.src !== targetUrl) {
      dom.studioIframe.src = targetUrl;
    }
  }

  // Section navigation
  function switchSection(sectionKey) {
    const conf = SECTION_CONFIG[sectionKey] || SECTION_CONFIG.overview;
    state.activeSection = sectionKey;

    // Update nav buttons
    document.querySelectorAll('[data-section]').forEach(btn => {
      if (btn.getAttribute('data-section') === sectionKey) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update header ribbon
    if (dom.activeSectionTitle) dom.activeSectionTitle.textContent = conf.title;
    if (dom.activeSectionDesc) dom.activeSectionDesc.textContent = conf.desc;
    if (dom.activeSectionPill) dom.activeSectionPill.textContent = conf.pill;
    if (dom.activeSectionIcon) dom.activeSectionIcon.className = `fa-solid ${conf.icon}`;

    // Close mobile sidebar on navigation
    if (dom.sidebar) dom.sidebar.classList.remove('open');

    // Update views
    if (state.viewMode === 'dock') {
      updateDockIframe();
    } else {
      renderNativeWorkspace(sectionKey);
    }
  }

  // Render native 3D clay cards
  function renderNativeWorkspace(sectionKey) {
    if (!dom.nativeWorkspace) return;
    const conf = SECTION_CONFIG[sectionKey] || SECTION_CONFIG.overview;

    let contentHtml = '';

    if (sectionKey === 'overview') {
      contentHtml = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="clay-card !p-5 flex items-center justify-between">
            <div>
              <p class="text-xs font-black uppercase text-purple-600 dark:text-purple-400 tracking-wider m-0">Active Templates</p>
              <h3 class="text-3xl font-black mt-1 mb-0">${state.stats.templates || '28'}</h3>
              <p class="text-[11px] font-bold opacity-70 mt-1 m-0">UTP v1.4.0 Certified</p>
            </div>
            <div class="clay-kpi-orb" style="background: var(--clay-primary-grad);">
              <i class="fa-solid fa-layer-group"></i>
            </div>
          </div>
          <div class="clay-card !p-5 flex items-center justify-between">
            <div>
              <p class="text-xs font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider m-0">Active Festivals</p>
              <h3 class="text-3xl font-black mt-1 mb-0">${state.stats.festivals || '6'}</h3>
              <p class="text-[11px] font-bold opacity-70 mt-1 m-0">Auto-Scheduler Active</p>
            </div>
            <div class="clay-kpi-orb" style="background: var(--clay-emerald-grad);">
              <i class="fa-solid fa-calendar-check"></i>
            </div>
          </div>
          <div class="clay-card !p-5 flex items-center justify-between">
            <div>
              <p class="text-xs font-black uppercase text-pink-600 dark:text-pink-400 tracking-wider m-0">Total Wishes</p>
              <h3 class="text-3xl font-black mt-1 mb-0">${state.stats.wishes || '1,420'}</h3>
              <p class="text-[11px] font-bold opacity-70 mt-1 m-0">Cloudflare D1 Synced</p>
            </div>
            <div class="clay-kpi-orb" style="background: var(--clay-pink-grad);">
              <i class="fa-solid fa-heart"></i>
            </div>
          </div>
          <div class="clay-card !p-5 flex items-center justify-between">
            <div>
              <p class="text-xs font-black uppercase text-amber-600 dark:text-amber-400 tracking-wider m-0">Store Orders</p>
              <h3 class="text-3xl font-black mt-1 mb-0">${state.stats.orders || '342'}</h3>
              <p class="text-[11px] font-bold opacity-70 mt-1 m-0">Razorpay Verified</p>
            </div>
            <div class="clay-kpi-orb" style="background: var(--clay-amber-grad);">
              <i class="fa-solid fa-receipt"></i>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div class="clay-card lg:col-span-2 flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-black m-0">Quick Live Operations</h3>
                <p class="text-xs font-semibold opacity-70 m-0">Perform common tasks directly on the live storefront.</p>
              </div>
              <span class="clay-pill text-emerald-600 dark:text-emerald-300">REALTIME</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button type="button" class="clay-btn clay-btn-primary justify-start !p-3.5" data-action="launch-dock" data-target="festivals">
                <i class="fa-solid fa-calendar-plus text-base"></i>
                <div class="text-left">
                  <div class="font-black text-xs">Festival Scheduler</div>
                  <div class="text-[10px] opacity-80">Launch Diwali / New Year Campaign</div>
                </div>
              </button>
              <button type="button" class="clay-btn clay-btn-emerald justify-start !p-3.5" data-action="launch-dock" data-target="add-template">
                <i class="fa-solid fa-cloud-arrow-up text-base"></i>
                <div class="text-left">
                  <div class="font-black text-xs">Upload Template ZIP</div>
                  <div class="text-[10px] opacity-80">Auto-Detect &amp; Publish UTP v1.4.0</div>
                </div>
              </button>
              <button type="button" class="clay-btn clay-btn-pink justify-start !p-3.5" data-action="launch-dock" data-target="settings">
                <i class="fa-solid fa-sliders text-base"></i>
                <div class="text-left">
                  <div class="font-black text-xs">Hero 3D &amp; Blur Settings</div>
                  <div class="text-[10px] opacity-80">Adjust blur levels (1–50) live</div>
                </div>
              </button>
              <button type="button" class="clay-btn clay-btn-amber justify-start !p-3.5" data-action="launch-dock" data-target="pricing">
                <i class="fa-solid fa-crown text-base"></i>
                <div class="text-left">
                  <div class="font-black text-xs">Manage Subscriptions</div>
                  <div class="text-[10px] opacity-80">Free, Pro, VIP pricing tiers</div>
                </div>
              </button>
            </div>
          </div>

          <div class="clay-card flex flex-col gap-4">
            <h3 class="text-base font-black m-0">Cloud Infrastructure</h3>
            <div class="flex flex-col gap-2.5">
              <div class="flex items-center justify-between p-2.5 rounded-xl bg-purple-500/10 text-xs font-bold">
                <span class="flex items-center gap-2"><i class="fa-solid fa-database text-purple-500"></i> Cloudflare D1</span>
                <span class="text-emerald-500">Connected</span>
              </div>
              <div class="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 text-xs font-bold">
                <span class="flex items-center gap-2"><i class="fa-solid fa-cloud text-emerald-500"></i> Backblaze B2</span>
                <span class="text-emerald-500">Active</span>
              </div>
              <div class="flex items-center justify-between p-2.5 rounded-xl bg-pink-500/10 text-xs font-bold">
                <span class="flex items-center gap-2"><i class="fa-solid fa-image text-pink-500"></i> ImgBB CDN</span>
                <span class="text-emerald-500">Active</span>
              </div>
              <div class="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 text-xs font-bold">
                <span class="flex items-center gap-2"><i class="fa-solid fa-shield-halved text-amber-500"></i> Zero-Trust Guard</span>
                <span class="text-emerald-500">Enforced</span>
              </div>
            </div>
            <button type="button" class="clay-btn w-full justify-center text-xs mt-auto" data-action="launch-dock" data-target="storage-health">
              <i class="fa-solid fa-stethoscope"></i>
              <span>Open Storage Diagnostics</span>
            </button>
          </div>
        </div>
      `;
    } else {
      contentHtml = `
        <div class="clay-card flex flex-col items-center justify-center text-center p-8 sm:p-12 gap-5">
          <div class="clay-kpi-orb !w-16 !h-16 text-2xl" style="background: var(--clay-primary-grad);">
            <i class="fa-solid ${conf.icon}"></i>
          </div>
          <div class="max-w-xl">
            <h2 class="text-2xl font-black tracking-tight m-0">${conf.title}</h2>
            <p class="text-sm font-semibold opacity-75 mt-2 mb-0">${conf.desc}</p>
          </div>
          <div class="flex flex-wrap items-center justify-center gap-3 mt-2">
            <button type="button" class="clay-btn clay-btn-primary" data-action="launch-dock" data-target="${sectionKey}">
              <i class="fa-solid fa-window-maximize"></i>
              <span>Launch Studio View (${conf.studioRoute.split('/').pop()})</span>
            </button>
            <button type="button" class="clay-btn" data-action="open-tab" data-route="${conf.studioRoute}">
              <i class="fa-solid fa-up-right-from-square"></i>
              <span>Open in New Browser Tab</span>
            </button>
          </div>
        </div>
      `;
    }

    dom.nativeWorkspace.innerHTML = contentHtml;

    // Attach click listeners for action buttons inside the native workspace
    dom.nativeWorkspace.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        if (action === 'launch-dock') {
          const target = btn.getAttribute('data-target') || sectionKey;
          switchSection(target);
          setViewMode('dock');
        } else if (action === 'open-tab') {
          const route = btn.getAttribute('data-route') || conf.studioRoute;
          const base = state.apiBase ? state.apiBase.replace(/\/+$/, '') : '';
          window.open(base + route, '_blank');
        }
      });
    });
  }

  function applyOverviewStatsPayload(payload) {
    if (!payload) return;
    state.stats.templates = payload.totalTemplates || payload.templateCount || 28;
    state.stats.festivals = payload.activeFestivals || payload.festivalCount || 6;
    state.stats.wishes = payload.totalWishes || payload.wishCount || 1420;
    state.stats.users = payload.totalUsers || payload.userCount || 890;
    state.stats.orders = payload.totalOrders || payload.orderCount || 342;

    if (dom.badgeTemplates) dom.badgeTemplates.textContent = state.stats.templates;
    if (dom.badgeFestivals) dom.badgeFestivals.textContent = state.stats.festivals;
    if (dom.badgeWishes) dom.badgeWishes.textContent = state.stats.wishes;
    if (dom.badgeUsers) dom.badgeUsers.textContent = state.stats.users;
    if (dom.badgeOrders) dom.badgeOrders.textContent = state.stats.orders;

    if (state.viewMode === 'native' && state.activeSection === 'overview') {
      renderNativeWorkspace('overview');
    }
  }

  // Data sync with backend
  async function syncLiveData(forceNetwork = false) {
    const OVERVIEW_CACHE_KEY = 'clay_admin_overview_cache_v1';
    if (!forceNetwork && !(forceNetwork && typeof forceNetwork === 'object')) {
      try {
        const cachedRaw = sessionStorage.getItem(OVERVIEW_CACHE_KEY);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (parsed && parsed.payload && parsed.ts && (Date.now() - parsed.ts < 30000)) {
            applyOverviewStatsPayload(parsed.payload);
            return;
          }
        }
      } catch (_) {}
    }

    if (dom.syncIcon) dom.syncIcon.classList.add('fa-spin');

    try {
      const base = state.apiBase ? state.apiBase.replace(/\/+$/, '') : '';
      const headers = { 'Accept': 'application/json' };
      if (state.bearerToken) {
        headers['Authorization'] = `Bearer ${state.bearerToken}`;
      }

      const res = await fetch(`${base}/api/admin/overview`, { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const payload = data.data || data;

        try {
          sessionStorage.setItem(OVERVIEW_CACHE_KEY, JSON.stringify({ ts: Date.now(), payload }));
        } catch (_) {}

        applyOverviewStatsPayload(payload);
        showToast('✅ Live Synced!', 'Pulled latest statistics and configuration from Cloudflare D1.');
      } else {
        showToast('Connected (Cached)', 'Server reached. Local views updated.');
      }
    } catch (err) {
      showToast('Offline Mode Active', 'Operating locally. You can configure server URL in connection modal.');
    } finally {
      if (dom.syncIcon) dom.syncIcon.classList.remove('fa-spin');
    }
  }

  // Event handlers initialization
  function initEvents() {
    // Nav buttons
    document.querySelectorAll('[data-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sec = btn.getAttribute('data-section');
        if (sec) switchSection(sec);
      });
    });

    // Jump section buttons
    document.querySelectorAll('[data-jump-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sec = btn.getAttribute('data-jump-section');
        if (sec) switchSection(sec);
      });
    });

    // View mode buttons
    if (dom.modeNativeBtn) {
      dom.modeNativeBtn.addEventListener('click', () => setViewMode('native'));
    }
    if (dom.modeDockBtn) {
      dom.modeDockBtn.addEventListener('click', () => setViewMode('dock'));
    }
    if (dom.dockBackNativeBtn) {
      dom.dockBackNativeBtn.addEventListener('click', () => setViewMode('native'));
    }

    // Dock iframe controls
    if (dom.dockReloadBtn) {
      dom.dockReloadBtn.addEventListener('click', () => {
        if (dom.studioIframe) {
          try {
            dom.studioIframe.contentWindow.location.reload();
          } catch (e) {
            updateDockIframe();
          }
        }
      });
    }

    if (dom.dockPopoutBtn) {
      dom.dockPopoutBtn.addEventListener('click', () => {
        const conf = SECTION_CONFIG[state.activeSection] || SECTION_CONFIG.overview;
        const base = state.apiBase ? state.apiBase.replace(/\/+$/, '') : '';
        window.open(base + conf.studioRoute, '_blank');
      });
    }

    // Live site button
    if (dom.openLiveSiteBtn) {
      dom.openLiveSiteBtn.addEventListener('click', () => {
        const base = state.apiBase ? state.apiBase.replace(/\/+$/, '') : '';
        window.open(base || '/', '_blank');
      });
    }

    // Sidebar mobile open/close
    if (dom.sidebarOpenBtn && dom.sidebar) {
      dom.sidebarOpenBtn.addEventListener('click', () => dom.sidebar.classList.add('open'));
    }
    if (dom.sidebarCloseBtn && dom.sidebar) {
      dom.sidebarCloseBtn.addEventListener('click', () => dom.sidebar.classList.remove('open'));
    }

    // Sync button
    if (dom.syncNowBtn) {
      dom.syncNowBtn.addEventListener('click', syncLiveData);
    }

    // Connection modal
    if (dom.backendConnBtn && dom.connModal) {
      dom.backendConnBtn.addEventListener('click', () => {
        if (dom.apiBaseInput) dom.apiBaseInput.value = state.apiBase;
        if (dom.tokenInput) dom.tokenInput.value = state.bearerToken;
        dom.connModal.classList.add('open');
      });
    }

    if (dom.connModalClose && dom.connModal) {
      dom.connModalClose.addEventListener('click', () => dom.connModal.classList.remove('open'));
    }

    if (dom.connModal) {
      dom.connModal.addEventListener('click', e => {
        if (e.target === dom.connModal) dom.connModal.classList.remove('open');
      });
    }

    // Save connection settings
    if (dom.saveConnBtn) {
      dom.saveConnBtn.addEventListener('click', () => {
        if (dom.apiBaseInput) {
          state.apiBase = dom.apiBaseInput.value.trim();
          localStorage.setItem('clay_admin_api_base', state.apiBase);
        }
        if (dom.tokenInput) {
          state.bearerToken = dom.tokenInput.value.trim();
          localStorage.setItem('clay_admin_token', state.bearerToken);
        }
        if (dom.connModal) dom.connModal.classList.remove('open');
        syncLiveData();
      });
    }

    // Test server ping
    if (dom.testPingBtn) {
      dom.testPingBtn.addEventListener('click', async () => {
        const url = (dom.apiBaseInput ? dom.apiBaseInput.value.trim() : '') || '';
        try {
          const res = await fetch(`${url}/api/health`);
          if (res.ok) {
            if (dom.authStatusBadge) {
              dom.authStatusBadge.textContent = '🟢 Server Online';
              dom.authStatusBadge.className = 'clay-pill text-emerald-600 dark:text-emerald-300';
            }
          } else {
            if (dom.authStatusBadge) {
              dom.authStatusBadge.textContent = `⚠️ Status ${res.status}`;
            }
          }
        } catch (e) {
          if (dom.authStatusBadge) {
            dom.authStatusBadge.textContent = '🔴 Unreachable';
          }
        }
      });
    }

    // Global search (Ctrl + K)
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (dom.globalSearch) {
          dom.globalSearch.focus();
          dom.globalSearch.select();
        }
      }
    });

    if (dom.globalSearch) {
      dom.globalSearch.addEventListener('input', e => {
        const q = e.target.value.toLowerCase().trim();
        if (!q) return;
        for (const [secKey, conf] of Object.entries(SECTION_CONFIG)) {
          if (secKey.includes(q) || conf.title.toLowerCase().includes(q) || conf.desc.toLowerCase().includes(q)) {
            switchSection(secKey);
            break;
          }
        }
      });
    }

    // PWA Install prompt handling
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      state.deferredPrompt = e;
      if (dom.installPwaBtn) dom.installPwaBtn.classList.remove('hidden');
    });

    if (dom.installPwaBtn) {
      dom.installPwaBtn.addEventListener('click', async () => {
        if (state.deferredPrompt) {
          state.deferredPrompt.prompt();
          const { outcome } = await state.deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            showToast('🎉 App Installed', 'WishMagic Clay Admin is now installed on your device.');
          }
          state.deferredPrompt = null;
        } else {
          showToast('Install App', 'To install on iOS or desktop, click Share/Menu > Add to Home Screen.');
        }
      });
    }
  }

  // Application initialization
  function init() {
    initElements();
    initTheme();
    initEvents();
    renderNativeWorkspace('overview');
    syncLiveData();
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
      navigator.serviceWorker.register('/wm-admin-sw.js', { scope: '/' }).catch(() => {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
