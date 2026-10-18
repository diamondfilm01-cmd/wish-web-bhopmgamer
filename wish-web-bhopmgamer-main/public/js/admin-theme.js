// Universal Admin Fetch Credentials Interceptor (Ensures all /api/ calls send session cookies)
(function patchAdminFetchCredentials() {
  if (typeof window === 'undefined' || !window.fetch || window.__wmFetchPatched) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    try {
      const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (urlStr.startsWith('/api/') || urlStr.includes('/api/')) {
        init = Object.assign({ credentials: 'include' }, init || {});
        if (!init.credentials) init.credentials = 'include';
      }
    } catch (_) {}
    return originalFetch(input, init);
  };
  window.__wmFetchPatched = true;
})();

// WishMagic Admin Studio - Universal Dual Theme Engine & Strict Owner Gatekeeper
const SECRET_ADMIN_PREFIX = '/admin/anktech/anktech/admin';

/*
 * WishMagic Admin Studio - Authoritative Owner Session Gatekeeper
 * STRICT SECURITY RULE:
 * - No separate Admin Login page exists.
 * - ONLY ankit.babusaini@gmail.com authenticated via Firebase Google Auth on the Main Website can open the Admin Panel.
 * - Anyone else or any unauthenticated visitor is immediately redirected to '/'.
 */
const AdminAuthController = (() => {
  'use strict';

  const MASTER_EMAIL = 'ankit.babusaini@gmail.com';
  const ADMIN_TARGET = '/admin/anktech/anktech/admin/overview';
  const HOME_TARGET = '/';

  const STATE = Object.freeze({
    BOOTING: 'BOOTING',
    READY: 'READY',
    LOGIN_REQUIRED: 'LOGIN_REQUIRED',
    AUTHENTICATING: 'AUTHENTICATING',
    ERROR: 'ERROR'
  });

  let currentState = STATE.BOOTING;
  let sessionCheckPromise = null;
  let signInPromise = null;
  let navigationStarted = false;
  let redirectStarted = false;

  function cleanEmail(v) {
    return String(v || '').trim().toLowerCase();
  }

  function isAuthorizedEmail(email) {
    return cleanEmail(email) === MASTER_EMAIL;
  }

  function isValidAdminUser(user) {
    if (!user || !user.email) return false;
    return cleanEmail(user.email) === MASTER_EMAIL;
  }

  // Deduplicated GET /api/auth/session check
  async function checkSession() {
    if (sessionCheckPromise) {
      return sessionCheckPromise;
    }

    sessionCheckPromise = (async () => {
      try {
        const response = await fetch('/api/auth/session', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Accept': 'application/json' }
        });

        const data = await response.json().catch(() => ({}));
        const user = data?.data?.user || data?.user || null;
        const isAuth = Boolean(data?.isAuthenticated === true || data?.data?.isAuthenticated === true);

        if (response.ok && data?.success === true && isAuth && isValidAdminUser(user)) {
          window.__WishMagicVerifiedAdminUser = user;
          window.WishMagicAdminSession = { authenticated: true, user };
          currentState = STATE.READY;
          return user;
        }

        currentState = STATE.LOGIN_REQUIRED;
        return null;
      } catch (err) {
        console.warn('[AdminAuthController] Session check failed:', err);
        currentState = STATE.ERROR;
        return null;
      } finally {
        sessionCheckPromise = null;
      }
    })();

    return sessionCheckPromise;
  }

  // Authoritative Firebase Google sign-in and server session verification
  async function signIn() {
    if (signInPromise) return signInPromise;
    if (navigationStarted) return;

    currentState = STATE.AUTHENTICATING;

    signInPromise = (async () => {
      try {
        if (!window.WishFirebaseAuth) {
          throw new Error('Firebase Google Authentication is initializing. Please sign in from the Main Website.');
        }

        const firebaseUser = await window.WishFirebaseAuth.signInWithGoogle();
        if (!firebaseUser) {
          throw new Error('Google sign-in was not completed.');
        }

        const email = cleanEmail(firebaseUser.email);
        if (!isAuthorizedEmail(email)) {
          try { await window.WishFirebaseAuth.signOut(); } catch (_) {}
          const err = new Error('Access Denied: Only the authorized owner account can access Admin Studio.');
          err.code = 'UNAUTHORIZED_EMAIL';
          throw err;
        }

        let idToken = null;
        if (typeof firebaseUser.getIdToken === 'function') {
          try {
            idToken = await firebaseUser.getIdToken();
          } catch (tErr) {
            console.warn('[AdminAuthController] getIdToken note:', tErr);
          }
        }

        const headers = {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        };
        if (idToken) {
          headers['Authorization'] = `Bearer ${idToken}`;
        }

        const signinRes = await fetch('/api/auth/signin', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers,
          body: JSON.stringify({
            email,
            displayName: firebaseUser.displayName || 'Ankit Saini',
            avatarUrl: firebaseUser.photoURL || null,
            provider: 'google',
            firebaseUid: firebaseUser.uid,
            idToken: idToken || undefined
          })
        });

        const signinData = await signinRes.json().catch(() => ({}));
        if (!signinRes.ok || signinData?.success !== true) {
          throw new Error(signinData?.error?.message || signinData?.message || 'Admin authentication failed.');
        }

        const verifiedUser = await checkSession();
        if (!verifiedUser) {
          throw new Error('Unable to verify server session.');
        }

        if (!navigationStarted) {
          navigationStarted = true;
          window.location.replace(ADMIN_TARGET);
        }

        return verifiedUser;
      } finally {
        signInPromise = null;
      }
    })();

    return signInPromise;
  }

  async function init() {
    currentState = STATE.BOOTING;
    const existing = await checkSession();
    if (existing) {
      if (!navigationStarted) {
        navigationStarted = true;
        window.location.replace(ADMIN_TARGET);
      }
      return existing;
    }
    currentState = STATE.LOGIN_REQUIRED;
    if (!redirectStarted) {
      redirectStarted = true;
      window.location.replace(HOME_TARGET);
    }
    return null;
  }

  async function logout() {
    try {
      await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' });
    } catch (_) {}
    if (window.WishFirebaseAuth) {
      try { await window.WishFirebaseAuth.signOut(); } catch (_) {}
    }
    try {
      localStorage.removeItem('wishmagic_auth_user');
      localStorage.removeItem('wishmagic_user');
      localStorage.removeItem('wishmagic_last_user_email');
    } catch (_) {}
    window.__WishMagicVerifiedAdminUser = null;
    window.WishMagicAdminSession = null;
    currentState = STATE.LOGIN_REQUIRED;
    if (!redirectStarted) {
      redirectStarted = true;
      window.location.replace(HOME_TARGET);
    }
  }

  return {
    STATE,
    getState: () => currentState,
    isAuthorizedEmail,
    checkSession,
    signIn,
    init,
    logout
  };
})();

window.AdminAuthController = AdminAuthController;

// Client-Side Admin Session Gatekeeper (Strictly requires ankit.babusaini@gmail.com; redirects others to '/')
(async function checkAdminGatekeeper() {
  'use strict';

  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const isLoginPage = pathname.endsWith('/login') || pathname === '/admin-login.html' || pathname === '/admin-login';

  if (isLoginPage) {
    window.location.replace('/');
    return;
  }

  let adminRedirectStarted = false;

  try {
    const user = await window.AdminAuthController.checkSession();
    if (user && String(user.email || '').trim().toLowerCase() === 'ankit.babusaini@gmail.com') {
      const screen = document.getElementById('admin-access-restricted-screen');
      if (screen) screen.remove();
      if (document.body) document.body.style.display = '';
      const emailEl = document.getElementById('wm-admin-header-email');
      if (emailEl && user.email) emailEl.textContent = user.email;
      return;
    }

    if (!adminRedirectStarted) {
      adminRedirectStarted = true;
      window.location.replace('/');
    }
  } catch (err) {
    console.warn('[AdminGate] Gatekeeper verification error:', err);
    if (!adminRedirectStarted) {
      adminRedirectStarted = true;
      window.location.replace('/');
    }
  }
})();

// 2. Automatically ensure all sidebar and navigation links strictly use /admin/anktech/anktech/admin/<section> and highlight ONLY the active section
function rewriteAdminSidebarLinks() {
  const sectionMap = {
    'user-creations': 'user-creations',
    ' storage-health': 'storage-health',
    'storage-health': 'storage-health',
    'activity-logs': 'audit-logs',
    'subscriptions': 'pricing',
    'announcements': 'announcements',
    'notifications': 'notifications',
    'add-template': 'add-template',
    'diagnostics': 'settings',
    'audit-logs': 'audit-logs',
    'categories': 'occasions',
    'moderation': 'moderation',
    'compliance': 'legal',
    'creations': 'user-creations',
    'analytics': 'analytics',
    'templates': 'templates',
    'occasions': 'occasions',
    'referrals': 'referrals',
    'expiring': 'wishes',
    'payments': 'orders',
    'settings': 'settings',
    'overview': 'overview',
    'rewards': 'referrals',
    'support': 'support',
    'storage': 'storage-health',
    'backups': 'storage-health',
    'billing': 'orders',
    'pricing': 'pricing',
    'orders': 'orders',
    'search': 'search',
    'wishes': 'wishes',
    'media': 'media',
    'music': 'media',
    'users': 'users',
    'staff': 'staff',
    'legal': 'legal',
    'audit': 'audit-logs'
  };

  const currentPath = window.location.pathname.toLowerCase();
  const currentSearch = window.location.search.toLowerCase();
  const currentHash = window.location.hash.toLowerCase();
  let currentSection = 'overview';

  const sortedKeys = Object.keys(sectionMap).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    const cleanKey = key.trim();
    if (currentPath.includes(cleanKey)) {
      currentSection = sectionMap[key];
      break;
    }
  }

  const isAddTemplateActive =
    currentSection === 'add-template' ||
    currentPath.includes('add-template') ||
    (currentSection === 'templates' && (currentSearch.includes('action=add') || currentHash.includes('upload')));

  const isMusicActive =
    currentPath.endsWith('/music') ||
    currentPath.endsWith('/music/') ||
    (currentSection === 'media' && (currentSearch.includes('tab=audio') || currentHash.includes('music')));

  const isExpiringActive =
    currentPath.endsWith('/expiring') ||
    currentPath.endsWith('/expiring/') ||
    (currentSection === 'wishes' && (currentSearch.includes('filter=expiring') || currentHash.includes('expiring')));

  const isBackupsActive =
    currentPath.endsWith('/backups') ||
    currentPath.endsWith('/backups/') ||
    (currentSection === 'storage-health' && (currentSearch.includes('tab=backups') || currentHash.includes('backups')));

  document.querySelectorAll('a[href*="admin"]').forEach(a => {
    let href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

    let suffix = '';
    const qIdx = href.indexOf('?');
    const hIdx = href.indexOf('#');
    let baseHref = href;
    if (qIdx !== -1) {
      suffix = href.slice(qIdx);
      baseHref = href.slice(0, qIdx);
    } else if (hIdx !== -1) {
      suffix = href.slice(hIdx);
      baseHref = href.slice(0, hIdx);
    }

    let matchedSection = null;
    for (const key of sortedKeys) {
      const cleanKey = key.trim();
      if (baseHref.toLowerCase().includes(cleanKey)) {
        matchedSection = sectionMap[key];
        break;
      }
    }

    if (matchedSection) {
      a.setAttribute('href', `${SECRET_ADMIN_PREFIX}/${matchedSection}${suffix}`);
    } else if (
      baseHref.toLowerCase().endsWith('/admin') ||
      baseHref.toLowerCase().endsWith('/admin/') ||
      baseHref.toLowerCase().endsWith('admin.html') ||
      baseHref.toLowerCase().endsWith('admin-overview.html')
    ) {
      a.setAttribute('href', `${SECRET_ADMIN_PREFIX}/overview${suffix}`);
    }
  });

  const moreSections = ['user-creations', 'search', 'referrals', 'moderation', 'support', 'staff', 'legal', 'announcements', 'notifications'];
  if (moreSections.includes(currentSection)) {
    const extra = document.getElementById('wm-sidebar-more-group');
    const chevron = document.getElementById('wm-sidebar-more-chevron');
    if (extra) extra.classList.remove('hidden');
    if (chevron) chevron.style.transform = 'rotate(180deg)';
  }

  const sidebarNav = document.querySelector('#admin-sidebar nav, aside nav');
  if (sidebarNav) {
    const navLinks = sidebarNav.querySelectorAll('a');
    navLinks.forEach(a => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      const isDashboardBtn =
        a.getAttribute('data-nav-role') === 'dashboard' ||
        href.endsWith('/overview') ||
        href.endsWith('/overview/') ||
        href.endsWith('admin-overview.html');

      a.classList.remove('wm-dashboard-pill', 'wm-inactive-pill', 'active', 'wm-nav-active');

      let isTarget = false;

      if (isDashboardBtn) {
        isTarget = (currentSection === 'overview' && !isAddTemplateActive && !isMusicActive && !isExpiringActive && !isBackupsActive);
      } else if (href.includes('add-template') || href.includes('action=add')) {
        isTarget = isAddTemplateActive;
      } else if (href.includes('tab=audio') || href.endsWith('/music') || href.includes('#music')) {
        isTarget = isMusicActive;
      } else if (href.includes('filter=expiring') || href.endsWith('/expiring')) {
        isTarget = isExpiringActive;
      } else if (href.includes('tab=backups') || href.endsWith('/backups') || href.includes('#backups')) {
        isTarget = isBackupsActive;
      } else {
        const cleanHref = href.split('?')[0].split('#')[0];
        const matchesSection =
          cleanHref.endsWith('/' + currentSection) ||
          cleanHref.endsWith('/' + currentSection + '/') ||
          cleanHref.includes('/admin-' + currentSection + '.html');

        if (matchesSection) {
          if (currentSection === 'templates' && isAddTemplateActive) isTarget = false;
          else if (currentSection === 'media' && isMusicActive) isTarget = false;
          else if (currentSection === 'wishes' && isExpiringActive) isTarget = false;
          else if (currentSection === 'storage-health' && isBackupsActive) isTarget = false;
          else isTarget = true;
        }
      }

      if (isTarget) {
        a.classList.add('active', 'wm-nav-active');
      }
    });
  }
}

function handleAdminQueryActions() {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.toLowerCase();
  const path = window.location.pathname.toLowerCase();

  if (params.get('action') === 'add' || hash === '#upload') {
    setTimeout(() => {
      const uploadSection = document.getElementById('upload-code-modal');
      if (uploadSection) {
        uploadSection.classList.remove('hidden');
        uploadSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
  }

  if (params.get('tab') === 'audio' || hash === '#music' || path.endsWith('/music')) {
    setTimeout(() => {
      if (typeof setMediaFilter === 'function') {
        setMediaFilter('audio');
      }
    }, 250);
  }
  if (params.get('action') === 'upload') {
    setTimeout(() => {
      const mediaModal = document.getElementById('upload-media-modal');
      if (mediaModal && mediaModal.classList.contains('hidden')) {
        if (typeof toggleModal === 'function') toggleModal('upload-media-modal');
        else {
          mediaModal.classList.remove('hidden');
          mediaModal.classList.add('flex');
        }
      }
    }, 250);
  }

  if (params.get('filter') === 'expiring' || hash === '#expiring' || path.endsWith('/expiring')) {
    setTimeout(() => {
      if (typeof filterStatus === 'function') {
        filterStatus('expiring');
      }
    }, 250);
  }

  if (params.get('tab') === 'backups' || hash === '#backups' || path.endsWith('/backups')) {
    setTimeout(() => {
      const backupEl = document.getElementById('backups-section') || document.getElementById('btn-open-cleanup');
      if (backupEl) backupEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
  }
}

async function loadLiveAdminHeaderNotifications() {
  const badge = document.getElementById('wm-header-notif-badge');
  const dropdown = document.getElementById('wm-admin-notif-dropdown');
  if (!badge && !dropdown) return;

  try {
    const [wishesRes, auditRes] = await Promise.all([
      fetch('/api/wishes?all=true', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
      fetch('/api/admin/audit-logs?limit=5', { credentials: 'include' }).then(r => r.json()).catch(() => ({}))
    ]);

    const wishes = Array.isArray(wishesRes?.wishes) ? wishesRes.wishes : (Array.isArray(wishesRes?.data?.wishes) ? wishesRes.data.wishes : []);
    const logs = Array.isArray(auditRes?.logs) ? auditRes.logs : (Array.isArray(auditRes?.data?.logs) ? auditRes.data.logs : []);

    const items = [];
    wishes.slice(0, 3).forEach(w => {
      const rec = w.recipientName || w.recipient_name || w.title || 'Celebration Wish';
      const tpl = w.templateName || w.template_name || w.templateId || 'WishMagic Template';
      items.push({
        href: '/admin/anktech/anktech/admin/wishes',
        icon: 'send',
        iconCls: 'bg-pink-100 text-pink-600 dark:bg-pink-950/60 dark:text-pink-300',
        title: `Wish created for ${rec}`,
        sub: `${tpl}`,
        ts: w.createdAt || w.created_at || null
      });
    });

    logs.slice(0, 3).forEach(l => {
      items.push({
        href: '/admin/anktech/anktech/admin/audit-logs',
        icon: 'verified_user',
        iconCls: 'bg-purple-100 text-purple-600 dark:bg-purple-950/60 dark:text-purple-300',
        title: (l.action || l.event_type || 'System Action').replace(/_/g, ' '),
        sub: l.actor_email || l.target_id || 'Admin Studio',
        ts: l.created_at || l.timestamp || null
      });
    });

    const totalCount = items.length;
    if (badge) {
      badge.textContent = String(totalCount);
      if (totalCount === 0) badge.classList.add('hidden');
      else badge.classList.remove('hidden');
    }

    if (dropdown) {
      const listHtml = items.length === 0
        ? '<div class="py-6 text-center text-xs text-on-surface-variant">No new live notifications right now.</div>'
        : items.slice(0, 5).map(item => `
            <a href="${item.href}" class="flex items-start gap-2.5 p-2 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/30 transition">
              <span class="w-7 h-7 rounded-full ${item.iconCls} flex items-center justify-center shrink-0 mt-0.5">
                <span class="material-symbols-outlined text-[15px]">${item.icon}</span>
              </span>
              <div class="min-w-0 flex-1">
                <div class="font-bold text-on-surface truncate capitalize">${item.title}</div>
                <div class="text-[11px] text-on-surface-variant truncate">${item.sub}</div>
              </div>
            </a>
          `).join('');

      dropdown.innerHTML = `
        <div class="flex items-center justify-between pb-2.5 mb-2 border-b border-purple-100 dark:border-purple-800/40">
          <span class="font-bold text-sm text-on-surface">Live Notifications</span>
          <a href="/admin/anktech/anktech/admin/notifications" class="text-[11px] font-bold text-purple-600 dark:text-purple-300 hover:underline">Delivery Queue →</a>
        </div>
        <div class="space-y-1.5">${listHtml}</div>
      `;
    }
  } catch (e) {
    console.warn('[AdminTheme] Notification poll note:', e);
  }
}

function toggleMoreSidebarSections() {
  const extra = document.getElementById('wm-sidebar-more-group');
  const chevron = document.getElementById('wm-sidebar-more-chevron');
  if (!extra) return;
  const isHidden = extra.classList.contains('hidden');
  if (isHidden) {
    extra.classList.remove('hidden');
    if (chevron) chevron.style.transform = 'rotate(180deg)';
  } else {
    extra.classList.add('hidden');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
  }
}
window.toggleMoreSidebarSections = toggleMoreSidebarSections;

function toggleAdminProfileMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('wm-admin-profile-dropdown');
  const notif = document.getElementById('wm-admin-notif-dropdown');
  if (notif) notif.classList.add('hidden');
  if (menu) menu.classList.toggle('hidden');
}
window.toggleAdminProfileMenu = toggleAdminProfileMenu;

function toggleAdminNotifMenu(event) {
  if (event) event.stopPropagation();
  const notif = document.getElementById('wm-admin-notif-dropdown');
  const menu = document.getElementById('wm-admin-profile-dropdown');
  if (menu) menu.classList.add('hidden');
  if (notif) notif.classList.toggle('hidden');
}
window.toggleAdminNotifMenu = toggleAdminNotifMenu;

document.addEventListener('click', () => {
  const menu = document.getElementById('wm-admin-profile-dropdown');
  const notif = document.getElementById('wm-admin-notif-dropdown');
  if (menu) menu.classList.add('hidden');
  if (notif) notif.classList.add('hidden');
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    const input = document.querySelector('.wm-header-search-input, #global-admin-search-input');
    if (input) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  }
});

function initAdminNavigationAndNotifications() {
  rewriteAdminSidebarLinks();
  handleAdminQueryActions();
  loadLiveAdminHeaderNotifications();
  setInterval(loadLiveAdminHeaderNotifications, 15000);

  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) return;
    const openModal = document.querySelector('[id*="modal"]:not(.hidden):not([data-inline-page="true"])');
    if (openModal && openModal.classList.contains('fixed')) return;

    const p = window.location.pathname.toLowerCase();
    try {
      if (p.includes('wishes') || p.includes('expiring')) {
        if (typeof window.loadWishes === 'function') window.loadWishes();
      } else if (p.includes('user-creations') || p.includes('creations')) {
        if (typeof window.loadUserCreations === 'function') window.loadUserCreations();
      } else if (p.includes('users')) {
        if (typeof window.loadUsers === 'function') window.loadUsers();
      } else if (p.includes('audit') || p.includes('activity-logs')) {
        if (typeof window.loadAuditLogs === 'function') window.loadAuditLogs();
      } else if (p.includes('moderation')) {
        if (typeof window.loadModerationData === 'function') window.loadModerationData();
      } else if (p.includes('notifications')) {
        if (typeof window.loadQueueData === 'function') window.loadQueueData();
      } else if (p.includes('announcements')) {
        if (typeof window.loadAnnouncements === 'function') window.loadAnnouncements();
      } else if (p.includes('referrals')) {
        if (typeof window.loadAdminReferralData === 'function') window.loadAdminReferralData();
      }
    } catch (_) {}
  }, 8000);

  const sidebarNav = document.querySelector('#admin-sidebar nav, aside nav');
  if (sidebarNav) {
    sidebarNav.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link) return;
      sidebarNav.querySelectorAll('a').forEach(a => {
        a.classList.remove('wm-dashboard-pill', 'wm-inactive-pill', 'active', 'wm-nav-active');
      });
      link.classList.add('active', 'wm-nav-active');
      if (window.innerWidth < 768) {
        const sidebar = document.getElementById('admin-sidebar');
        if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
          toggleSidebar();
        }
      }
    });
  }
}

window.addEventListener('popstate', () => {
  rewriteAdminSidebarLinks();
  handleAdminQueryActions();
});
window.addEventListener('hashchange', () => {
  rewriteAdminSidebarLinks();
  handleAdminQueryActions();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminNavigationAndNotifications);
} else {
  initAdminNavigationAndNotifications();
}

function updateThemeIcons(isDark) {
  const sunPill = document.getElementById('wm-theme-sun-pill');
  const moonPill = document.getElementById('wm-theme-moon-pill');
  if (sunPill) {
    sunPill.className = 'wm-theme-pill-sun';
    const sunIcon = sunPill.querySelector('.material-symbols-outlined');
    if (sunIcon) sunIcon.textContent = 'light_mode';
  }
  if (moonPill) {
    moonPill.className = 'wm-theme-pill-knob';
    const moonIcon = moonPill.querySelector('.material-symbols-outlined');
    if (moonIcon) moonIcon.textContent = 'dark_mode';
  }
  document.querySelectorAll('.wm-theme-pill-btn').forEach(btn => {
    btn.setAttribute('data-theme-mode', isDark ? 'dark' : 'light');
    btn.setAttribute('aria-checked', isDark ? 'true' : 'false');
  });
}

(function initTheme() {
  const savedTheme = localStorage.getItem('wishmagic_admin_theme_v2') || 'light';
  const isDark = savedTheme === 'dark';
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => updateThemeIcons(isDark));
  } else {
    updateThemeIcons(isDark);
  }
})();

function toggleAdminTheme() {
  const isCurrentlyDark = document.documentElement.classList.contains('dark');
  if (isCurrentlyDark) {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('wishmagic_admin_theme_v2', 'light');
    localStorage.setItem('wishmagic_admin_theme', 'light');
    updateThemeIcons(false);
    showToast('☀️ Fairytale Light Mode Activated');
  } else {
    document.documentElement.classList.add('dark');
    localStorage.setItem('wishmagic_admin_theme_v2', 'dark');
    localStorage.setItem('wishmagic_admin_theme', 'dark');
    updateThemeIcons(true);
    showToast('🌙 Cosmic Dark Mode Activated');
  }
}
window.toggleAdminTheme = toggleAdminTheme;
window.toggleTheme = toggleAdminTheme;

function toggleSidebar() {
  const sidebar = document.getElementById('admin-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  const isClosed = sidebar.classList.contains('-translate-x-full');
  if (isClosed) {
    sidebar.classList.remove('-translate-x-full');
    if (backdrop) backdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  } else {
    sidebar.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
    document.body.style.overflow = '';
  }
}
window.toggleSidebar = toggleSidebar;

var showToast = function(msg, type = 'info') {
  let toast = document.getElementById('admin-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'admin-toast';
    toast.className = 'fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-2xl text-white font-bold text-sm shadow-2xl backdrop-blur-xl border flex items-center gap-3 transform transition-all duration-300 translate-y-20 opacity-0 pointer-events-none';
    document.body.appendChild(toast);
  }

  let icon = 'magic_button';
  let bg = 'bg-[#240d54]/95';
  let border = 'border-purple-400/40';
  let iconColor = 'text-pink-400';

  if (type === 'success') {
    icon = 'check_circle';
    bg = 'bg-emerald-900/95';
    border = 'border-emerald-500/40';
    iconColor = 'text-emerald-400';
  } else if (type === 'error' || type === 'danger') {
    icon = 'error';
    bg = 'bg-rose-900/95';
    border = 'border-rose-500/40';
    iconColor = 'text-rose-400';
  } else if (type === 'warning') {
    icon = 'warning';
    bg = 'bg-amber-900/95';
    border = 'border-amber-500/40';
    iconColor = 'text-amber-400';
  }

  toast.className = `fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-2xl text-white font-bold text-sm shadow-2xl backdrop-blur-xl border flex items-center gap-3 transform transition-all duration-300 ${bg} ${border}`;
  toast.innerHTML = `<span class="material-symbols-outlined ${iconColor}">${icon}</span><span>${msg}</span>`;

  toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');

  if (window.toastTimeout) clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
  }, 4000);
};
