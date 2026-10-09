// WishMagic Admin Studio - Universal Dual Theme Engine & Utilities

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

        const firebaseUser = await window.WishFirebaseAuth.signInWithGoogle();
        if (!firebaseUser) {
          throw new Error('Google Sign-In was cancelled.');
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

        // Call POST /api/auth/signin
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

        // Authoritative verification via GET /api/auth/session
        const verifiedUser = await checkSession();
        if (!verifiedUser) {
          throw new Error('Unable to verify server session.');
        }

        // Exactly one navigation
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

  // Initialization method for Admin login page
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

  // Logout method
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

// Client-Side Admin Session Gatekeeper (Only for Content Pages, Never Loops)
(async function checkAdminGatekeeper() {
  'use strict';

  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const isLoginPage = pathname.endsWith('/login') || pathname === '/admin-login.html';

  if (isLoginPage) {
    // Admin login page manages its own dedicated lifecycle via AdminAuthController.init()
    return;
  }

  let adminRedirectStarted = false;

  try {
    const user = await window.AdminAuthController.checkSession();
    if (user) {
      // Validated Admin Session! Unhide page
      const screen = document.getElementById('admin-access-restricted-screen');
      if (screen) screen.remove();
      document.body.style.display = '';
      return;
    }

    // Missing or invalid session: single redirect to login page
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
  let currentSection = 'overview';

  // Sort keys by descending length so multi-word keys (e.g., 'user-creations', 'audit-logs', 'storage-health') take priority
  const sortedKeys = Object.keys(sectionMap).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (currentPath.includes(key)) {
      currentSection = sectionMap[key];
      break;
    }
  }

  // Update hrefs on all admin links
  document.querySelectorAll('a[href*="admin"]').forEach(a => {
    let href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

    // Detect target section
    let matchedSection = null;
    for (const key of sortedKeys) {
      if (href.toLowerCase().includes(key)) {
        matchedSection = sectionMap[key];
        break;
      }
    }

    if (matchedSection) {
      // Strictly enforce /admin/anktech/anktech/admin/<section> without query string tokens
      a.setAttribute('href', `${SECRET_ADMIN_PREFIX}/${matchedSection}`);
    } else if (href.toLowerCase().endsWith('/admin') || href.toLowerCase().endsWith('/admin/') || href.toLowerCase().endsWith('admin.html') || href.toLowerCase().endsWith('admin-overview.html')) {
      a.setAttribute('href', `${SECRET_ADMIN_PREFIX}/overview`);
    }
  });

  // Highlight active link in sidebar and ensure uniform heights & states across all pages
  const sidebarNav = document.querySelector('#admin-sidebar nav, aside nav');
  if (sidebarNav) {
    const navLinks = sidebarNav.querySelectorAll('a');
    navLinks.forEach(a => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      const isTarget = href.endsWith('/' + currentSection) || 
                       href.endsWith('/' + currentSection + '/') ||
                       href.includes('/admin-' + currentSection + '.html') ||
                       (currentSection === 'overview' && (
                         href.endsWith('/overview') ||
                         href.endsWith('/overview/') ||
                         href.endsWith('/admin') ||
                         href.endsWith('/admin/') ||
                         href.endsWith('admin.html') ||
                         href.endsWith('admin-overview.html')
                       ));
      
      const icon = a.querySelector('.material-symbols-outlined');

      if (isTarget) {
        a.className = 'group flex items-center gap-space-sm px-space-md py-2.5 rounded-lg bg-primary-container text-white font-semibold shadow-[0_0_24px_rgba(124,58,237,0.35)] transition-all duration-200';
        if (icon) {
          icon.className = 'material-symbols-outlined text-[20px] transition-transform group-hover:scale-110 text-white';
        }
      } else {
        a.className = 'group flex items-center gap-space-sm px-space-md py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all duration-200';
        if (icon) {
          icon.className = 'material-symbols-outlined text-[20px] transition-transform group-hover:scale-110 text-on-surface-variant group-hover:text-on-surface';
        }
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', rewriteAdminSidebarLinks);
} else {
  rewriteAdminSidebarLinks();
}

function updateThemeIcons(isDark) {
  const icons = document.querySelectorAll('.theme-toggle-icon, #theme-toggle-icon');
  icons.forEach(icon => {
    icon.textContent = isDark ? 'light_mode' : 'dark_mode';
  });
}

(function initTheme() {
  const savedTheme = localStorage.getItem('wishmagic_admin_theme') || 'light';
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
    localStorage.setItem('wishmagic_admin_theme', 'light');
    updateThemeIcons(false);
    showToast('☀️ Clean Light Mode Activated');
  } else {
    document.documentElement.classList.add('dark');
    localStorage.setItem('wishmagic_admin_theme', 'dark');
    updateThemeIcons(true);
    showToast('🌙 Cosmic Dark Mode Activated');
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('admin-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar || !backdrop) return;
  const isClosed = sidebar.classList.contains('-translate-x-full');
  if (isClosed) {
    sidebar.classList.remove('-translate-x-full');
    backdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  } else {
    sidebar.classList.add('-translate-x-full');
    backdrop.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

var showToast = function(msg) {
  let toast = document.getElementById('admin-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'admin-toast';
    toast.className = 'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-purple-900 text-white font-semibold text-xs sm:text-sm shadow-2xl backdrop-blur-md border border-purple-500/30 flex items-center gap-2 transform transition-all duration-300 translate-y-20 opacity-0 pointer-events-none';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span class="material-symbols-outlined text-amber-400 text-lg">magic_button</span><span>${msg}</span>`;
  toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
  }, 2500);
}
