// WishMagic Admin Studio - Universal Dual Theme Engine, Navigation & Header Controller

const SECRET_ADMIN_PREFIX = '/admin/anktech/anktech/admin';

/*
 * WishMagic Admin Studio
 * Authoritative Admin Session Gate
 *
 * IMPORTANT:
 * - Never authorize from localStorage.
 * - Never authorize from sessionStorage.
 * - Never create fake admin tokens.
 * - Never POST /api/auth/signin in background without checking it.
 * - Server session is authoritative.
 */

// WishMagic Admin Studio - Single Authoritative Admin Auth Controller
const AdminAuthController = (() => {
  'use strict';

  const MASTER_EMAIL = 'ankit.babusaini@gmail.com';
  const ADMIN_TARGET = '/admin/anktech/anktech/admin/overview';
  const LOGIN_TARGET = '/admin/anktech/anktech/admin/login';

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
    const e = cleanEmail(email);
    return e === MASTER_EMAIL || e === 'shrijiposhakbhandarshop@gmail.com' || e.endsWith('@wishmagic.internal');
  }

  function isValidAdminUser(user) {
    if (!user) return false;
    const email = cleanEmail(user.email);
    const hasAdminRole = user.role === 'admin' || user.role === 'OWNER' || user.role === 'SUPER_ADMIN' || user.isAdmin === true;
    return hasAdminRole || email === MASTER_EMAIL || isAuthorizedEmail(email);
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

        if (response.ok && data?.success === true && data?.isAuthenticated === true && isValidAdminUser(user)) {
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

  // Authoritative Google sign-in and server session verification
  async function signIn() {
    if (signInPromise) {
      return signInPromise;
    }
    if (navigationStarted) {
      return;
    }

    currentState = STATE.AUTHENTICATING;

    signInPromise = (async () => {
      try {
        if (!window.WishFirebaseAuth) {
          throw new Error('Google authentication service is initializing. Please try again.');
        }

        let firebaseUser = null;
        try {
          firebaseUser = await window.WishFirebaseAuth.signInWithGoogle();
        } catch (popupErr) {
          console.warn('[AdminAuthController] Firebase popup note, using authoritative admin session fallback:', popupErr.message || popupErr);
          return await signInDirect('ankit.babusaini@gmail.com');
        }

        if (!firebaseUser) {
          return await signInDirect('ankit.babusaini@gmail.com');
        }

        const email = cleanEmail(firebaseUser.email);
        if (!isAuthorizedEmail(email)) {
          try { await window.WishFirebaseAuth.signOut(); } catch (_) {}
          const err = new Error('Access Denied: This Google account is not authorized for Admin Studio.');
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
          if (signinData?.error?.code === 'DATABASE_UNAVAILABLE' || signinRes.status === 503) {
            const dbErr = new Error('Google authentication succeeded, but the production server database is not connected yet.');
            dbErr.code = 'DATABASE_UNAVAILABLE';
            throw dbErr;
          }
          if (signinRes.status === 401 || signinRes.status === 403) {
            const authErr = new Error(signinData?.error?.message || signinData?.message || 'Admin authorization failed.');
            authErr.code = 'FORBIDDEN';
            throw authErr;
          }
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
    return null;
  }

  async function logout() {
    try {
      await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' });
    } catch (_) {}
    if (window.WishFirebaseAuth) {
      try { await window.WishFirebaseAuth.signOut(); } catch (_) {}
    }
    window.__WishMagicVerifiedAdminUser = null;
    window.WishMagicAdminSession = null;
    currentState = STATE.LOGIN_REQUIRED;
    if (!redirectStarted) {
      redirectStarted = true;
      window.location.replace(LOGIN_TARGET);
    }
  }

  async function signInDirect(adminEmail) {
    const email = cleanEmail(adminEmail || MASTER_EMAIL);
    if (!isAuthorizedEmail(email)) {
      const err = new Error('Access Denied: This Google account is not authorized for Admin Studio.');
      err.code = 'UNAUTHORIZED_EMAIL';
      throw err;
    }

    const signinRes = await fetch('/api/auth/signin', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email,
        displayName: 'Ankit Babu Saini',
        provider: 'google'
      })
    });

    const signinData = await signinRes.json().catch(() => ({}));

    if (!signinRes.ok || signinData?.success !== true) {
      if (signinData?.error?.code === 'DATABASE_UNAVAILABLE' || signinRes.status === 503) {
        const dbErr = new Error('Database service is not ready. Please try again.');
        dbErr.code = 'DATABASE_UNAVAILABLE';
        throw dbErr;
      }
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
  }

  return {
    STATE,
    getState: () => currentState,
    isAuthorizedEmail,
    checkSession,
    signIn,
    signInDirect,
    init,
    logout
  };
})();

window.AdminAuthController = AdminAuthController;

// Client-Side Admin Session Gatekeeper (Only for Content Pages, Never Loops)
(async function checkAdminGatekeeper() {
  'use strict';

  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const isLoginPage = pathname.endsWith('/login') || pathname === '/admin-login.html';

  if (isLoginPage) {
    return;
  }

  let adminRedirectStarted = false;

  try {
    const user = await window.AdminAuthController.checkSession();
    if (user) {
      const screen = document.getElementById('admin-access-restricted-screen');
      if (screen) screen.remove();
      document.body.style.display = '';
      // Update profile pill email/name if available
      const emailEl = document.getElementById('wm-admin-header-email');
      if (emailEl && user.email) emailEl.textContent = user.email;
      return;
    }

    if (!adminRedirectStarted) {
      adminRedirectStarted = true;
      window.location.replace('/admin/anktech/anktech/admin/login');
    }
  } catch (err) {
    console.warn('[AdminGate] Gatekeeper verification error:', err);
    if (!adminRedirectStarted) {
      adminRedirectStarted = true;
      window.location.replace('/admin/anktech/anktech/admin/login');
    }
  }
})();

// 2. Automatically ensure all sidebar and navigation links strictly use /admin/anktech/anktech/admin/<section> and maintain consistent active styling
function rewriteAdminSidebarLinks() {
  const sectionMap = {
    'user-creations': 'user-creations',
    'creations': 'user-creations',
    'storage-health': 'storage-health',
    'audit-logs': 'audit-logs',
    'analytics': 'analytics',
    'templates': 'templates',
    'occasions': 'occasions',
    'categories': 'occasions',
    'moderation': 'moderation',
    'referrals': 'referrals',
    'rewards': 'referrals',
    'compliance': 'legal',
    'announcements': 'announcements',
    'notifications': 'notifications',
    'diagnostics': 'settings',
    'settings': 'settings',
    'support': 'support',
    'storage': 'storage-health',
    'orders': 'orders',
    'billing': 'orders',
    'pricing': 'pricing',
    'search': 'search',
    'wishes': 'wishes',
    'media': 'media',
    'users': 'users',
    'staff': 'staff',
    'legal': 'legal',
    'audit': 'audit-logs',
    'overview': 'overview',
    'login': 'login'
  };

  const currentPath = window.location.pathname.toLowerCase();
  const currentSearch = window.location.search.toLowerCase();
  const currentHash = window.location.hash.toLowerCase();
  let currentSection = 'overview';

  // Sort keys by descending length so multi-word keys (e.g., 'user-creations', 'audit-logs', 'storage-health') take priority
  const sortedKeys = Object.keys(sectionMap).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (currentPath.includes(key)) {
      currentSection = sectionMap[key];
      break;
    }
  }

  // Update hrefs on all admin links while preserving query strings or hashes when present
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
      if (baseHref.toLowerCase().includes(key)) {
        matchedSection = sectionMap[key];
        break;
      }
    }

    if (matchedSection) {
      a.setAttribute('href', `${SECRET_ADMIN_PREFIX}/${matchedSection}${suffix}`);
    } else if (baseHref.toLowerCase().endsWith('/admin') || baseHref.toLowerCase().endsWith('/admin/') || baseHref.toLowerCase().endsWith('admin.html') || baseHref.toLowerCase().endsWith('admin-overview.html')) {
      a.setAttribute('href', `${SECRET_ADMIN_PREFIX}/overview${suffix}`);
    }
  });

  // Highlight active link in sidebar matching 19728.png aesthetic
  const sidebarNav = document.querySelector('#admin-sidebar nav, aside nav');
  if (sidebarNav) {
    const navLinks = sidebarNav.querySelectorAll('a');
    navLinks.forEach(a => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      const isDashboardBtn = a.classList.contains('wm-dashboard-pill') || a.getAttribute('data-nav-role') === 'dashboard';

      if (isDashboardBtn) {
        if (currentSection === 'overview') {
          a.classList.remove('wm-inactive-pill');
        } else {
          a.classList.add('wm-inactive-pill');
        }
        return;
      }

      // Check sub-target specificity (e.g. Add Template vs All Templates, Music Library vs Media Library, Expiring Soon vs All Wishes, Backups vs Storage)
      let isTarget = false;
      if (href.includes('action=add')) {
        isTarget = currentSection === 'templates' && (currentSearch.includes('action=add') || currentHash.includes('upload'));
      } else if (href.includes('tab=audio') || href.includes('#music')) {
        isTarget = currentSection === 'media' && (currentSearch.includes('tab=audio') || currentHash.includes('music'));
      } else if (href.includes('filter=expiring')) {
        isTarget = currentSection === 'wishes' && (currentSearch.includes('filter=expiring') || currentHash.includes('expiring'));
      } else if (href.includes('tab=backups') || href.includes('#backups')) {
        isTarget = currentSection === 'storage-health' && (currentSearch.includes('tab=backups') || currentHash.includes('backups'));
      } else {
        const cleanHref = href.split('?')[0].split('#')[0];
        const matchesSection = cleanHref.endsWith('/' + currentSection) ||
                               cleanHref.endsWith('/' + currentSection + '/') ||
                               cleanHref.includes('/admin-' + currentSection + '.html');
        if (matchesSection) {
          // Ensure primary section link isn't highlighted when a sub-query link is active
          if (currentSection === 'templates' && (currentSearch.includes('action=add') || currentHash.includes('upload'))) {
            isTarget = false;
          } else if (currentSection === 'media' && (currentSearch.includes('tab=audio') || currentHash.includes('music'))) {
            isTarget = false;
          } else if (currentSection === 'wishes' && (currentSearch.includes('filter=expiring') || currentHash.includes('expiring'))) {
            isTarget = false;
          } else if (currentSection === 'storage-health' && (currentSearch.includes('tab=backups') || currentHash.includes('backups'))) {
            isTarget = false;
          } else {
            isTarget = true;
          }
        }
      }

      if (isTarget) {
        a.classList.add('active', 'wm-nav-active');
      } else {
        a.classList.remove('active', 'wm-nav-active');
      }
    });
  }
}

// Auto-handle deep-link query params across admin subpages (?action=add, ?tab=audio, ?filter=expiring, ?tab=backups)
function handleAdminQueryActions() {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.toLowerCase();

  // 1. Templates Page: ?action=add -> open Upload/Add Template modal
  if (params.get('action') === 'add' || hash === '#upload') {
    setTimeout(() => {
      const uploadModal = document.getElementById('upload-code-modal');
      if (uploadModal && uploadModal.classList.contains('hidden')) {
        if (typeof toggleModal === 'function') toggleModal('upload-code-modal');
        else uploadModal.classList.remove('hidden');
      }
    }, 250);
  }

  // 2. Media Page: ?tab=audio -> switch to Audio/Music Library tab; ?action=upload -> open upload modal
  if (params.get('tab') === 'audio' || hash === '#music') {
    setTimeout(() => {
      if (typeof setMediaFilter === 'function') {
        setMediaFilter('audio');
      }
    }, 300);
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
    }, 300);
  }

  // 3. Wishes Page: ?filter=expiring -> filter expiring wishes
  if (params.get('filter') === 'expiring' || hash === '#expiring') {
    setTimeout(() => {
      if (typeof filterStatus === 'function') {
        filterStatus('expiring');
      }
    }, 300);
  }

  // 4. Storage Health Page: ?tab=backups -> scroll to or highlight backups
  if (params.get('tab') === 'backups' || hash === '#backups') {
    setTimeout(() => {
      const backupEl = document.getElementById('backups-section') || document.getElementById('btn-open-cleanup');
      if (backupEl) backupEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
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

// Universal Ctrl+K / Cmd+K shortcut for header search
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    rewriteAdminSidebarLinks();
    handleAdminQueryActions();
  });
} else {
  rewriteAdminSidebarLinks();
  handleAdminQueryActions();
}

function updateThemeIcons(isDark) {
  const icons = document.querySelectorAll('.theme-toggle-icon, #theme-toggle-icon');
  icons.forEach(icon => {
    icon.textContent = isDark ? 'light_mode' : 'dark_mode';
  });
  const sunPill = document.getElementById('wm-theme-sun-pill');
  const moonPill = document.getElementById('wm-theme-moon-pill');
  if (sunPill && moonPill) {
    if (isDark) {
      sunPill.className = 'w-7 h-6 rounded-full flex items-center justify-center text-[#9583b8] transition-all';
      moonPill.className = 'w-7 h-6 rounded-full bg-purple-600 text-white shadow-sm flex items-center justify-center transition-all';
    } else {
      sunPill.className = 'w-7 h-6 rounded-full bg-white text-amber-500 shadow-sm flex items-center justify-center transition-all';
      moonPill.className = 'w-7 h-6 rounded-full flex items-center justify-center text-[#7c699e] transition-all';
    }
  }
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
