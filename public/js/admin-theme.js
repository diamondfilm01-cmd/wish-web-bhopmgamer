// Universal Admin Fetch Credentials, In-Flight Deduplication & Fast Section Sync Cache Interceptor
(function patchAdminFetchCredentials() {
  if (typeof window === 'undefined' || !window.fetch || window.__wmFetchPatched) return;
  const originalFetch = window.fetch.bind(window);
  const inFlightGets = new Map();
  const CACHE_PREFIX = 'wm_api_fastcache_v1:';
  const CACHE_TTL_MS = 20000;

  function clearAdminApiCache() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && (k.startsWith(CACHE_PREFIX) || k === 'wm_admin_header_notif_v1' || k === 'clay_admin_overview_cache_v1')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => sessionStorage.removeItem(k));
    } catch (_) {}
  }
  window.clearAdminApiCache = clearAdminApiCache;

  function isCacheableGetUrl(urlStr, init) {
    if (!urlStr) return false;
    if (init && (init.cache === 'no-store' || init.cache === 'reload')) return false;
    if (urlStr.includes('reconcile=true') || urlStr.includes('/api/auth/') || urlStr.includes('/api/admin/auth/')) return false;
    return (
      urlStr.includes('/api/templates') ||
      urlStr.includes('/api/categories') ||
      urlStr.includes('/api/admin/') ||
      urlStr.includes('/api/wishes') ||
      urlStr.includes('/api/users') ||
      urlStr.includes('/api/media') ||
      urlStr.includes('/api/music') ||
      urlStr.includes('/api/pricing') ||
      urlStr.includes('/api/settings') ||
      urlStr.includes('/api/analytics')
    );
  }

  window.fetch = function(input, init) {
    let urlStr = '';
    let method = 'GET';
    try {
      urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (urlStr.startsWith('/api/') || urlStr.includes('/api/')) {
        init = Object.assign({ credentials: 'include' }, init || {});
        if (!init.credentials) init.credentials = 'include';
      }
    } catch (_) {}

    if (method !== 'GET' && method !== 'HEAD') {
      if (urlStr.startsWith('/api/') || urlStr.includes('/api/')) {
        clearAdminApiCache();
      }
      return originalFetch(input, init);
    }

    if (typeof input === 'string' && isCacheableGetUrl(urlStr, init)) {
      const cacheKey = CACHE_PREFIX + urlStr;
      try {
        const rawCached = sessionStorage.getItem(cacheKey);
        if (rawCached) {
          const parsed = JSON.parse(rawCached);
          if (parsed && parsed.ts && (Date.now() - parsed.ts < CACHE_TTL_MS) && typeof parsed.body === 'string') {
            return Promise.resolve(new Response(parsed.body, {
              status: parsed.status || 200,
              headers: { 'Content-Type': parsed.contentType || 'application/json', 'X-WM-Fast-Cache': 'HIT' }
            }));
          }
        }
      } catch (_) {}

      if (inFlightGets.has(urlStr)) {
        return inFlightGets.get(urlStr).then(r => r.clone());
      }

      const reqPromise = originalFetch(input, init).then(async (res) => {
        try {
          if (res && res.ok) {
            const cType = res.headers.get('content-type') || '';
            if (cType.includes('application/json')) {
              const cloned = res.clone();
              const text = await cloned.text();
              if (text && text.length < 350000) {
                sessionStorage.setItem(cacheKey, JSON.stringify({
                  ts: Date.now(),
                  status: res.status,
                  contentType: cType,
                  body: text
                }));
              }
            }
          }
        } catch (_) {}
        return res;
      }).finally(() => {
        inFlightGets.delete(urlStr);
      });

      inFlightGets.set(urlStr, reqPromise);
      return reqPromise.then(r => r.clone());
    }

    return originalFetch(input, init);
  };
  window.__wmFetchPatched = true;
})();

// WishMagic Admin Studio - Universal Dual Theme Engine, Unified Shell & Authoritative Session Gatekeeper
const SECRET_ADMIN_PREFIX = '/admin/anktech/anktech/admin';

/*
 * WishMagic Admin Studio - Authoritative Owner & Server-Verified Staff RBAC Gatekeeper
 * SECURITY POLICY:
 * - Primary Owner account remains strictly 'ankit.babusaini@gmail.com' via Firebase Google Auth.
 * - Active staff accounts verified by the backend (/api/admin/auth/session) are honored with their server-granted RBAC permissions.
 * - Client localStorage, URL parameters, or DOM flags are NEVER trusted for authorization.
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
    UNAUTHORIZED: 'UNAUTHORIZED',
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
    if (!user) return false;
    if (user.email && cleanEmail(user.email) === MASTER_EMAIL) return true;
    if (user.isOwner === true || user.isAdmin === true) return true;
    const role = String(user.role || '').toUpperCase();
    return ['OWNER', 'SUPER_ADMIN', 'ADMIN', 'TEMPLATE_MANAGER', 'MODERATOR', 'SUPPORT', 'EDITOR', 'ANALYST'].includes(role);
  }

  function hasPermission(permission) {
    const session = window.WishMagicAdminSession;
    const user = session?.user || window.__WishMagicVerifiedAdminUser;
    if (!user) return false;
    if (isAuthorizedEmail(user.email) || user.isOwner === true || session?.isOwner === true) return true;
    const perms = Array.isArray(session?.permissions)
      ? session.permissions
      : (Array.isArray(user.permissions) ? user.permissions : []);
    if (perms.includes('*') || perms.includes('SYSTEM_ADMIN')) return true;
    if (!permission) return true;
    return perms.includes(permission);
  }

  const SESSION_CACHE_KEY = 'wm_verified_admin_session_v1';
  const SESSION_CACHE_TTL_MS = 60000;

  function saveVerifiedSessionCache(sessionObj) {
    try {
      sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({
        ts: Date.now(),
        session: sessionObj
      }));
    } catch (_) {}
  }

  function clearVerifiedSessionCache() {
    try {
      sessionStorage.removeItem(SESSION_CACHE_KEY);
    } catch (_) {}
  }

  // Deduplicated authoritative server session check (/api/auth/session + /api/admin/auth/session)
  async function checkSession(options = {}) {
    if (!options.force) {
      try {
        const cachedRaw = sessionStorage.getItem(SESSION_CACHE_KEY);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          const age = Date.now() - (parsed?.ts || 0);
          if (parsed?.session?.authenticated && parsed?.session?.user && age < SESSION_CACHE_TTL_MS) {
            window.__WishMagicVerifiedAdminUser = parsed.session.user;
            window.WishMagicAdminSession = parsed.session;
            currentState = STATE.READY;
            if (age > 20000 && !sessionCheckPromise) {
              setTimeout(() => { checkSession({ force: true }).catch(() => {}); }, 800);
            }
            return parsed.session.user;
          }
        }
      } catch (_) {}
    }

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

        if (response.ok && data?.success === true && isAuth && user && isAuthorizedEmail(user.email)) {
          const enrichedOwner = Object.assign({}, user, {
            isOwner: true,
            isAdmin: true,
            role: 'OWNER',
            permissions: ['*']
          });
          window.__WishMagicVerifiedAdminUser = enrichedOwner;
          window.WishMagicAdminSession = {
            authenticated: true,
            user: enrichedOwner,
            isOwner: true,
            role: 'OWNER',
            permissions: ['*']
          };
          saveVerifiedSessionCache(window.WishMagicAdminSession);
          currentState = STATE.READY;
          return enrichedOwner;
        }

        // Also check authoritative /api/admin/auth/session for server-verified staff RBAC or owner session
        const adminRes = await fetch('/api/admin/auth/session', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Accept': 'application/json' }
        }).catch(() => null);

        if (adminRes && adminRes.ok) {
          const adminData = await adminRes.json().catch(() => ({}));
          const adminPayload = adminData?.data || adminData || {};
          const adminRecord = adminPayload.admin || null;
          if ((adminPayload.authenticated === true || adminData?.success === true) && adminRecord) {
            const verifiedAdmin = Object.assign({}, user || {}, {
              id: adminRecord.id || user?.id,
              email: adminRecord.email || user?.email || '',
              displayName: adminRecord.name || user?.displayName || 'Admin Staff',
              name: adminRecord.name || user?.displayName || 'Admin Staff',
              mobile: adminRecord.mobile || null,
              role: adminRecord.role || 'ADMIN',
              isOwner: Boolean(adminRecord.isOwner || isAuthorizedEmail(adminRecord.email)),
              isAdmin: true,
              permissions: Array.isArray(adminRecord.permissions) ? adminRecord.permissions : []
            });
            window.__WishMagicVerifiedAdminUser = verifiedAdmin;
            window.WishMagicAdminSession = {
              authenticated: true,
              user: verifiedAdmin,
              isOwner: verifiedAdmin.isOwner,
              role: verifiedAdmin.role,
              permissions: verifiedAdmin.permissions
            };
            saveVerifiedSessionCache(window.WishMagicAdminSession);
            currentState = STATE.READY;
            return verifiedAdmin;
          }
        }

        clearVerifiedSessionCache();
        currentState = isAuth ? STATE.UNAUTHORIZED : STATE.LOGIN_REQUIRED;
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
          const err = new Error('Access Denied: Only the authorized owner account can sign in via Google OAuth.');
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
      await Promise.allSettled([
        fetch('/api/auth/signout', { method: 'POST', credentials: 'include' }),
        fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'include' })
      ]);
    } catch (_) {}
    if (window.WishFirebaseAuth) {
      try { await window.WishFirebaseAuth.signOut(); } catch (_) {}
    }
    try {
      clearVerifiedSessionCache();
      if (typeof window.clearAdminApiCache === 'function') window.clearAdminApiCache();
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
    isValidAdminUser,
    hasPermission,
    checkSession,
    signIn,
    init,
    logout
  };
})();

window.AdminAuthController = AdminAuthController;

// Client-Side Admin Session Gatekeeper (Honors Owner ankit.babusaini@gmail.com and Server-Validated Staff Sessions)
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
    if (user && window.AdminAuthController.isValidAdminUser(user)) {
      const screen = document.getElementById('admin-access-restricted-screen');
      if (screen) screen.remove();
      if (document.body) document.body.style.display = '';
      const emailEl = document.getElementById('wm-admin-header-email');
      if (emailEl) {
        emailEl.textContent = user.email || user.mobile || user.displayName || 'ankit.babusaini@gmail.com';
      }
      const dropdownEmailEls = document.querySelectorAll('#wm-admin-profile-dropdown .truncate');
      if (dropdownEmailEls.length > 0 && (user.email || user.mobile)) {
        dropdownEmailEls[dropdownEmailEls.length - 1].textContent = user.email || user.mobile;
      }
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
    'festival-scheduler': 'festivals',
    'festivals': 'festivals',
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

  // Scope rewriting to navigation/header/admin-file links and preserve query/hash suffixes
  // Ensure Festival Scheduler link is always present in #admin-sidebar nav
  const primarySidebarNav = document.querySelector('#admin-sidebar nav, aside nav');
  if (primarySidebarNav && !primarySidebarNav.querySelector('a[href*="/festivals"], a[href*="admin-festivals"]')) {
    const addTplLink = primarySidebarNav.querySelector('a[href*="add-template"]');
    const festLink = document.createElement('a');
    festLink.setAttribute('href', SECRET_ADMIN_PREFIX + '/festivals');
    festLink.innerHTML = '<span class="material-symbols-outlined">event_available</span><span>Festival Scheduler</span>';
    if (addTplLink && addTplLink.parentNode === primarySidebarNav) {
      addTplLink.insertAdjacentElement('afterend', festLink);
    } else {
      primarySidebarNav.appendChild(festLink);
    }
  }

  const candidateLinks = document.querySelectorAll(
    '#admin-sidebar a, aside a, header a[href*="admin"], a[data-admin-nav-link], a[href^="/admin/"], a[href^="/admin-"], a[href^="admin-"]'
  );
  candidateLinks.forEach(a => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('/api/')) return;

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

    const lowerBase = baseHref.toLowerCase();
    let matchedSection = null;
    for (const key of sortedKeys) {
      const cleanKey = key.trim();
      const segRegex = new RegExp(`(?:^|/|admin-)${cleanKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\.html|/|\\b)$`, 'i');
      if (segRegex.test(lowerBase) || lowerBase.endsWith('/' + cleanKey) || lowerBase.endsWith('admin-' + cleanKey + '.html')) {
        matchedSection = sectionMap[key];
        break;
      }
    }

    if (matchedSection) {
      // Preserve special sub-routes (/music, /expiring, /backups) if no explicit suffix was present
      if (!suffix && lowerBase.endsWith('/music')) suffix = '?tab=audio';
      else if (!suffix && lowerBase.endsWith('/expiring')) suffix = '?filter=expiring';
      else if (!suffix && lowerBase.endsWith('/backups')) suffix = '?tab=backups';
      a.setAttribute('href', `${SECRET_ADMIN_PREFIX}/${matchedSection}${suffix}`);
    } else if (
      lowerBase.endsWith('/admin') ||
      lowerBase.endsWith('/admin/') ||
      lowerBase.endsWith('admin.html') ||
      lowerBase.endsWith('admin-overview.html')
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
      a.removeAttribute('aria-current');

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
        a.setAttribute('aria-current', 'page');
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

function escapeAdminHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAdminHeaderNotificationsItems(items) {
  const badge = document.getElementById('wm-header-notif-badge');
  const dropdown = document.getElementById('wm-admin-notif-dropdown');
  const totalCount = Array.isArray(items) ? items.length : 0;
  if (badge) {
    badge.textContent = String(totalCount);
    if (totalCount === 0) badge.classList.add('hidden');
    else badge.classList.remove('hidden');
  }

  if (dropdown) {
    const listHtml = totalCount === 0
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
}

async function loadLiveAdminHeaderNotifications(forceNetwork = false) {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  const badge = document.getElementById('wm-header-notif-badge');
  const dropdown = document.getElementById('wm-admin-notif-dropdown');
  if (!badge && !dropdown) return;

  const NOTIF_CACHE_KEY = 'wm_admin_header_notif_v1';
  if (!forceNetwork) {
    try {
      const raw = sessionStorage.getItem(NOTIF_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.items)) {
          renderAdminHeaderNotificationsItems(parsed.items);
          if (parsed.ts && (Date.now() - parsed.ts < 30000)) {
            return;
          }
        }
      }
    } catch (_) {}
  }

  try {
    const [wishesRes, auditRes] = await Promise.all([
      fetch('/api/admin/wishes?limit=5', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
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
        title: `Wish created for ${escapeAdminHtml(rec)}`,
        sub: escapeAdminHtml(tpl),
        ts: w.createdAt || w.created_at || null
      });
    });

    logs.slice(0, 3).forEach(l => {
      items.push({
        href: '/admin/anktech/anktech/admin/audit-logs',
        icon: 'verified_user',
        iconCls: 'bg-purple-100 text-purple-600 dark:bg-purple-950/60 dark:text-purple-300',
        title: escapeAdminHtml((l.action || l.event_type || 'System Action').replace(/_/g, ' ')),
        sub: escapeAdminHtml(l.actorName || l.actor_email || l.targetId || l.target_id || 'Admin Studio'),
        ts: l.createdAt || l.created_at || l.timestamp || null
      });
    });

    try {
      sessionStorage.setItem(NOTIF_CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
    } catch (_) {}

    renderAdminHeaderNotificationsItems(items);
  } catch (e) {
    console.warn('[AdminTheme] Notification poll note:', e);
  }
}

// 3. Universal Global Command & Search Palette (Ctrl/Cmd+K & Header Input across all 23 Admin Pages)
const ADMIN_COMMAND_DESTINATIONS = [
  { title: 'Overview & Control Center', sub: 'Executive KPIs, activity & health', href: `${SECRET_ADMIN_PREFIX}/overview`, icon: 'dashboard', keywords: 'dashboard home overview metrics kpi health' },
  { title: 'Analytics & BI Funnel', sub: 'Revenue, conversion funnel & cohorts', href: `${SECRET_ADMIN_PREFIX}/analytics`, icon: 'monitoring', keywords: 'analytics revenue funnel conversion bi charts', perm: 'VIEW_ANALYTICS' },
  { title: 'Templates Library', sub: 'Manage UTP v1.3.0 templates, variants & versions', href: `${SECRET_ADMIN_PREFIX}/templates`, icon: 'auto_awesome_mosaic', keywords: 'templates library catalog variants versions utp', perm: 'MANAGE_TEMPLATES' },
  { title: 'Add & Upload Template', sub: 'Upload ZIP/folder & Smart Recognition Studio', href: `${SECRET_ADMIN_PREFIX}/add-template`, icon: 'upload_file', keywords: 'add upload template zip studio import', perm: 'MANAGE_TEMPLATES' },
  { title: 'Festival Scheduler', sub: 'Annual festival calendar, date overrides, campaigns & template windows', href: `${SECRET_ADMIN_PREFIX}/festivals`, icon: 'event_available', keywords: 'festival scheduler calendar campaigns diwali holi overrides publication window utp 1.4.0', perm: 'MANAGE_TEMPLATES' },
  { title: 'Occasions & Categories', sub: 'Categories, ordering & popular tags', href: `${SECRET_ADMIN_PREFIX}/occasions`, icon: 'category', keywords: 'occasions categories tags birthday anniversary', perm: 'MANAGE_CATEGORIES' },
  { title: 'All Wishes Management', sub: 'Inspect, moderate, extend expiry & transfer wishes', href: `${SECRET_ADMIN_PREFIX}/wishes`, icon: 'celebration', keywords: 'wishes links expiring published drafts', perm: 'MANAGE_WISHES' },
  { title: 'User Uploads & Creations', sub: 'Customer photos, voice notes & wish gallery', href: `${SECRET_ADMIN_PREFIX}/user-creations`, icon: 'perm_media', keywords: 'user creations uploads photos voice gallery', perm: 'MANAGE_WISHES' },
  { title: 'Users & Account Lifecycle', sub: 'User directory, VIP status, sessions & security', href: `${SECRET_ADMIN_PREFIX}/users`, icon: 'group', keywords: 'users accounts vip suspend ban sessions', perm: 'MANAGE_USERS' },
  { title: 'Orders & Commerce', sub: 'Payments, refunds, comp passes & reconciliation', href: `${SECRET_ADMIN_PREFIX}/orders`, icon: 'receipt_long', keywords: 'orders payments razorpay refunds vip pass commerce', perm: 'MANAGE_SETTINGS' },
  { title: 'Media, Music & Hero Banner', sub: 'ImgBB/B2 assets, background tracks & hero banner', href: `${SECRET_ADMIN_PREFIX}/media`, icon: 'library_music', keywords: 'media music audio hero banner imgbb b2 upload', perm: 'MANAGE_TEMPLATES' },
  { title: 'Pricing, Plans & Coupons', sub: 'Monetization tiers, link pricing & promo codes', href: `${SECRET_ADMIN_PREFIX}/pricing`, icon: 'sell', keywords: 'pricing plans coupons discounts monetization vip', perm: 'MANAGE_SETTINGS' },
  { title: 'Referral Program & Fraud', sub: 'Attributions, credit ledger & fraud logs', href: `${SECRET_ADMIN_PREFIX}/referrals`, icon: 'redeem', keywords: 'referrals rewards credits ledger fraud', perm: 'MANAGE_USERS' },
  { title: 'Content Moderation Queue', sub: 'Flagged wishes, safety scanner & appeals', href: `${SECRET_ADMIN_PREFIX}/moderation`, icon: 'shield', keywords: 'moderation queue flagged reports appeals safety', perm: 'MODERATE_CONTENT' },
  { title: 'Customer Support & Diagnostics', sub: 'Tickets, universal lookup & wish link auto-repair', href: `${SECRET_ADMIN_PREFIX}/support`, icon: 'support_agent', keywords: 'support tickets help lookup diagnose repair', perm: 'SUPPORT_CONSOLE' },
  { title: 'Search & Synonym Diagnostics', sub: 'Top queries, zero-result analytics & synonyms', href: `${SECRET_ADMIN_PREFIX}/search`, icon: 'manage_search', keywords: 'search synonyms reindex discovery queries', perm: 'MANAGE_TEMPLATES' },
  { title: 'Cloud Storage Health & Orphans', sub: 'B2/ImgBB verification, orphans & quarantine', href: `${SECRET_ADMIN_PREFIX}/storage-health`, icon: 'cloud_done', keywords: 'storage health orphans quarantine backups b2 imgbb', perm: 'SYSTEM_ADMIN' },
  { title: 'Notification Delivery Queue', sub: 'Email/push jobs, retries & event reminders', href: `${SECRET_ADMIN_PREFIX}/notifications`, icon: 'notifications_active', keywords: 'notifications delivery queue reminders jobs retry', perm: 'SYSTEM_ADMIN' },
  { title: 'Platform Announcements', sub: 'Broadcast banners & maintenance notices', href: `${SECRET_ADMIN_PREFIX}/announcements`, icon: 'campaign', keywords: 'announcements broadcast banner notice', perm: 'MANAGE_SETTINGS' },
  { title: 'Staff & Access Control (RBAC)', sub: 'Team roles, permissions & 2FA sessions', href: `${SECRET_ADMIN_PREFIX}/staff`, icon: 'badge', keywords: 'staff roles permissions rbac team', perm: 'MANAGE_STAFF' },
  { title: 'Legal & Compliance Center', sub: 'Terms, Privacy Policy versions & acceptances', href: `${SECRET_ADMIN_PREFIX}/legal`, icon: 'gavel', keywords: 'legal compliance terms privacy refund cookies', perm: 'MANAGE_SETTINGS' },
  { title: 'Administrative Audit Trail', sub: 'Immutable security & operation logs', href: `${SECRET_ADMIN_PREFIX}/audit-logs`, icon: 'history_edu', keywords: 'audit logs security history export', perm: 'VIEW_AUDIT_LOGS' },
  { title: 'Site Settings & Central Links', sub: 'Brand CMS, maintenance & UTP v1.3.0 Link Manager', href: `${SECRET_ADMIN_PREFIX}/settings`, icon: 'settings', keywords: 'settings cms domain central links maintenance', perm: 'MANAGE_SETTINGS' }
];

let globalSearchAbortController = null;
let globalSearchDebounceTimer = null;

function initGlobalAdminCommandSearch() {
  const input = document.querySelector('.wm-header-search-input, #global-admin-search-input');
  if (!input || input.dataset.wmGlobalSearchBound === 'true') return;
  input.dataset.wmGlobalSearchBound = 'true';

  const wrap = input.closest('.wm-header-search-wrap') || input.parentElement;
  if (!wrap) return;
  wrap.style.position = 'relative';

  let dropdown = document.getElementById('wm-global-command-dropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'wm-global-command-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', 'Admin Studio Search Results');
    dropdown.className = 'hidden absolute left-0 right-0 top-full mt-2 rounded-2xl border border-purple-200 dark:border-purple-800/60 bg-white/98 dark:bg-[#190e36]/98 shadow-2xl backdrop-blur-xl z-[120] max-h-[420px] overflow-y-auto p-2 text-xs';
    wrap.appendChild(dropdown);
  }

  function getPermittedDestinations(query) {
    const q = String(query || '').trim().toLowerCase();
    return ADMIN_COMMAND_DESTINATIONS.filter(dest => {
      if (dest.perm && window.AdminAuthController && !window.AdminAuthController.hasPermission(dest.perm)) {
        return false;
      }
      if (!q) return true;
      return (
        dest.title.toLowerCase().includes(q) ||
        dest.sub.toLowerCase().includes(q) ||
        dest.keywords.includes(q)
      );
    });
  }

  function renderDropdown(query, liveData = null, isLoading = false) {
    const q = String(query || '').trim();
    const matchedDests = getPermittedDestinations(q).slice(0, q ? 6 : 8);

    let html = `<div class="px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-300 flex items-center justify-between">
      <span>${q ? 'Matching Admin Screens' : 'Quick Jump (Ctrl/Cmd + K)'}</span>
      <span class="text-[10px] font-normal opacity-75">Esc to close</span>
    </div>`;

    if (matchedDests.length === 0) {
      html += `<div class="px-3 py-2 text-on-surface-variant">No matching admin destinations.</div>`;
    } else {
      html += matchedDests.map((d, idx) => `
        <a href="${d.href}" data-cmd-item="true" data-cmd-idx="${idx}" class="wm-cmd-result-item flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/40 transition">
          <span class="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[18px]">${d.icon}</span>
          </span>
          <div class="min-w-0 flex-1">
            <div class="font-bold text-on-surface truncate">${escapeAdminHtml(d.title)}</div>
            <div class="text-[11px] text-on-surface-variant truncate">${escapeAdminHtml(d.sub)}</div>
          </div>
          <span class="material-symbols-outlined text-[16px] text-on-surface-variant">arrow_forward</span>
        </a>
      `).join('');
    }

    if (q.length >= 2) {
      html += `<div class="mt-2 pt-2 border-t border-purple-100 dark:border-purple-800/40 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-pink-600 dark:text-pink-300">Live Platform Records</div>`;
      if (isLoading) {
        html += `<div class="px-3 py-3 text-on-surface-variant flex items-center gap-2"><span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span> Searching templates, wishes & users...</div>`;
      } else if (liveData) {
        const { templates = [], wishes = [], users = [] } = liveData;
        if (templates.length === 0 && wishes.length === 0 && users.length === 0) {
          html += `<div class="px-3 py-2.5 text-on-surface-variant">No matching templates, wishes, or users for "${escapeAdminHtml(q)}".</div>`;
        } else {
          templates.slice(0, 3).forEach(t => {
            html += `
              <a href="${SECRET_ADMIN_PREFIX}/templates?search=${encodeURIComponent(t.name || t.id)}" data-cmd-item="true" class="wm-cmd-result-item flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/40 transition">
                <span class="w-7 h-7 rounded-lg bg-pink-100 dark:bg-pink-950/60 text-pink-600 dark:text-pink-300 flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-[15px]">web</span>
                </span>
                <div class="min-w-0 flex-1">
                  <div class="font-bold text-on-surface truncate">Template: ${escapeAdminHtml(t.name || t.id)}</div>
                  <div class="text-[11px] text-on-surface-variant truncate">${escapeAdminHtml(t.category || 'Occasion')} • ${escapeAdminHtml(t.tier || 'free')}</div>
                </div>
              </a>`;
          });
          wishes.slice(0, 3).forEach(w => {
            const rec = w.recipientName || w.recipient_name || w.slug || w.id;
            html += `
              <a href="${SECRET_ADMIN_PREFIX}/wishes?search=${encodeURIComponent(rec)}" data-cmd-item="true" class="wm-cmd-result-item flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/40 transition">
                <span class="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-[15px]">celebration</span>
                </span>
                <div class="min-w-0 flex-1">
                  <div class="font-bold text-on-surface truncate">Wish: ${escapeAdminHtml(rec)}</div>
                  <div class="text-[11px] text-on-surface-variant truncate">/${escapeAdminHtml(w.slug || w.id)} • ${escapeAdminHtml(w.status || 'published')}</div>
                </div>
              </a>`;
          });
          users.slice(0, 3).forEach(u => {
            const label = u.displayName || u.display_name || u.email || u.id;
            html += `
              <a href="${SECRET_ADMIN_PREFIX}/users?search=${encodeURIComponent(u.email || label)}" data-cmd-item="true" class="wm-cmd-result-item flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/40 transition">
                <span class="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-[15px]">person</span>
                </span>
                <div class="min-w-0 flex-1">
                  <div class="font-bold text-on-surface truncate">User: ${escapeAdminHtml(label)}</div>
                  <div class="text-[11px] text-on-surface-variant truncate">${escapeAdminHtml(u.email || u.id)} • ${escapeAdminHtml(u.plan || 'Free')}</div>
                </div>
              </a>`;
          });
        }
      }
    }

    dropdown.innerHTML = html;
    dropdown.classList.remove('hidden');
  }

  async function executeLiveCommandSearch(q) {
    if (globalSearchAbortController) {
      try { globalSearchAbortController.abort(); } catch (_) {}
    }
    if (!q || q.length < 2) {
      renderDropdown(q, null, false);
      return;
    }

    renderDropdown(q, null, true);
    const controller = new AbortController();
    globalSearchAbortController = controller;

    try {
      const lowerQ = q.toLowerCase();
      const [tplRes, wishRes, usrRes] = await Promise.all([
        fetch('/api/templates?includeDrafts=true', { signal: controller.signal, credentials: 'include' }).then(r => r.json()).catch(() => ({})),
        fetch(`/api/admin/wishes?query=${encodeURIComponent(q)}&limit=10`, { signal: controller.signal, credentials: 'include' }).then(r => r.json()).catch(() => ({})),
        fetch(`/api/admin/users?query=${encodeURIComponent(q)}&limit=10`, { signal: controller.signal, credentials: 'include' }).then(r => r.json()).catch(() => ({}))
      ]);
      if (controller.signal.aborted) return;

      const allTpls = Array.isArray(tplRes?.templates) ? tplRes.templates : (Array.isArray(tplRes?.data?.templates) ? tplRes.data.templates : []);
      const templates = allTpls.filter(t =>
        (t.name && t.name.toLowerCase().includes(lowerQ)) ||
        (t.id && t.id.toLowerCase().includes(lowerQ)) ||
        (t.category && t.category.toLowerCase().includes(lowerQ))
      );
      const wishes = Array.isArray(wishRes?.wishes) ? wishRes.wishes : (Array.isArray(wishRes?.data?.wishes) ? wishRes.data.wishes : []);
      const users = Array.isArray(usrRes?.users) ? usrRes.users : (Array.isArray(usrRes?.data?.users) ? usrRes.data.users : []);

      renderDropdown(q, { templates, wishes, users }, false);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        renderDropdown(q, { templates: [], wishes: [], users: [] }, false);
      }
    }
  }

  input.addEventListener('focus', () => {
    renderDropdown(input.value, null, false);
    if (input.value && input.value.trim().length >= 2) {
      executeLiveCommandSearch(input.value.trim());
    }
  });

  input.addEventListener('input', () => {
    const val = input.value.trim();
    if (globalSearchDebounceTimer) clearTimeout(globalSearchDebounceTimer);
    if (val.length < 2) {
      renderDropdown(val, null, false);
      return;
    }
    globalSearchDebounceTimer = setTimeout(() => executeLiveCommandSearch(val), 220);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdown.classList.add('hidden');
      input.blur();
      return;
    }
    const items = Array.from(dropdown.querySelectorAll('[data-cmd-item="true"]'));
    if (!items.length) return;
    const activeIdx = items.findIndex(el => el.classList.contains('wm-cmd-item-focused'));

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = activeIdx < items.length - 1 ? activeIdx + 1 : 0;
      items.forEach((el, i) => el.classList.toggle('wm-cmd-item-focused', i === nextIdx));
      items[nextIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = activeIdx > 0 ? activeIdx - 1 : items.length - 1;
      items.forEach((el, i) => el.classList.toggle('wm-cmd-item-focused', i === prevIdx));
      items[prevIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      const target = activeIdx >= 0 ? items[activeIdx] : items[0];
      if (target && !dropdown.classList.contains('hidden')) {
        e.preventDefault();
        window.location.href = target.getAttribute('href');
      }
    }
  });
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
  const cmd = document.getElementById('wm-global-command-dropdown');
  if (notif) notif.classList.add('hidden');
  if (cmd) cmd.classList.add('hidden');
  if (menu) menu.classList.toggle('hidden');
}
window.toggleAdminProfileMenu = toggleAdminProfileMenu;

function toggleAdminNotifMenu(event) {
  if (event) event.stopPropagation();
  const notif = document.getElementById('wm-admin-notif-dropdown');
  const menu = document.getElementById('wm-admin-profile-dropdown');
  const cmd = document.getElementById('wm-global-command-dropdown');
  if (menu) menu.classList.add('hidden');
  if (cmd) cmd.classList.add('hidden');
  if (notif) notif.classList.toggle('hidden');
}
window.toggleAdminNotifMenu = toggleAdminNotifMenu;

document.addEventListener('click', (e) => {
  const menu = document.getElementById('wm-admin-profile-dropdown');
  const notif = document.getElementById('wm-admin-notif-dropdown');
  const cmd = document.getElementById('wm-global-command-dropdown');
  if (menu && !e.target.closest('#wm-admin-profile-dropdown')) menu.classList.add('hidden');
  if (notif && !e.target.closest('#wm-admin-notif-dropdown')) notif.classList.add('hidden');
  if (cmd && !e.target.closest('.wm-header-search-wrap')) cmd.classList.add('hidden');
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    const input = document.querySelector('.wm-header-search-input, #global-admin-search-input');
    if (input) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  } else if (e.key === 'Escape') {
    // Close mobile sidebar drawer if open
    const sidebar = document.getElementById('admin-sidebar');
    if (sidebar && window.innerWidth < 768 && !sidebar.classList.contains('-translate-x-full')) {
      toggleSidebar(false);
    }
  }
});

// Ensure viewport resize from mobile (<768px) to desktop (>=768px) clears mobile drawer scroll lock
window.addEventListener('resize', () => {
  if (window.innerWidth >= 768) {
    const backdrop = document.getElementById('sidebar-backdrop');
    if (backdrop && !backdrop.classList.contains('hidden')) {
      backdrop.classList.add('hidden');
    }
    if (document.body && document.body.style.overflow === 'hidden') {
      const openModal = document.querySelector('[id*="modal"]:not(.hidden):not([data-inline-page="true"])');
      if (!openModal) document.body.style.overflow = '';
    }
  }
});

function initAdminNavigationAndNotifications() {
  rewriteAdminSidebarLinks();
  handleAdminQueryActions();
  initGlobalAdminCommandSearch();
  loadLiveAdminHeaderNotifications();

  // Compatibility aliases for page refresh callbacks
  if (typeof window.loadAuditLogs !== 'function' && typeof window.loadLogs === 'function') {
    window.loadAuditLogs = window.loadLogs;
  }
  if (typeof window.loadModerationData !== 'function' && typeof window.loadModerationQueue === 'function') {
    window.loadModerationData = window.loadModerationQueue;
  }

  // Apply search query parameter from global command search deep links (?search=...)
  const urlSearchParam = new URLSearchParams(window.location.search).get('search');
  if (urlSearchParam) {
    setTimeout(() => {
      const pageSearchInput = document.querySelector(
        '#search-input, #user-search, #wish-search, #admin-template-search, input[oninput*="Search"], input[oninput*="filter"]'
      );
      if (pageSearchInput && !pageSearchInput.classList.contains('wm-header-search-input')) {
        pageSearchInput.value = urlSearchParam;
        pageSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, 300);
  }

  if (!window.__wmAdminNotifTimer) {
    window.__wmAdminNotifTimer = setInterval(loadLiveAdminHeaderNotifications, 30000);
  }

  if (!window.__wmAdminAutoRefreshTimer) {
    window.__wmAdminAutoRefreshTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (window.__wmAdminMutationInFlight) return;
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) return;
      const openModal = document.querySelector('[id*="modal"]:not(.hidden):not([data-inline-page="true"])');
      if (openModal && openModal.classList.contains('fixed')) return;

      // Do not overwrite user-filtered views when a page search input has text
      const activeSearchInput = document.querySelector('#search-input, #user-search, #wish-search, #admin-template-search');
      if (activeSearchInput && String(activeSearchInput.value || '').trim().length > 0) return;

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
          else if (typeof window.loadLogs === 'function') window.loadLogs();
        } else if (p.includes('moderation')) {
          if (typeof window.loadModerationData === 'function') window.loadModerationData();
          else if (typeof window.loadModerationQueue === 'function') window.loadModerationQueue();
        } else if (p.includes('notifications')) {
          if (typeof window.loadQueueData === 'function') window.loadQueueData();
        } else if (p.includes('announcements')) {
          if (typeof window.loadAnnouncements === 'function') window.loadAnnouncements();
        } else if (p.includes('referrals')) {
          if (typeof window.loadAdminReferralData === 'function') window.loadAdminReferralData();
        }
      } catch (_) {}
    }, 20000);
  }

  const sidebarNav = document.querySelector('#admin-sidebar nav, aside nav');
  if (sidebarNav && !sidebarNav.dataset.wmNavBound) {
    sidebarNav.dataset.wmNavBound = 'true';
    const prefetchedHrefs = new Set();
    sidebarNav.addEventListener('mouseover', (e) => {
      const link = e.target.closest('a');
      if (!link) return;
      const href = link.getAttribute('href');
      if (href && href.startsWith('/') && !prefetchedHrefs.has(href)) {
        prefetchedHrefs.add(href);
        try {
          const pf = document.createElement('link');
          pf.rel = 'prefetch';
          pf.href = href;
          document.head.appendChild(pf);
        } catch (_) {}
      }
    });
    sidebarNav.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link) return;
      sidebarNav.querySelectorAll('a').forEach(a => {
        a.classList.remove('wm-dashboard-pill', 'wm-inactive-pill', 'active', 'wm-nav-active');
        a.removeAttribute('aria-current');
      });
      link.classList.add('active', 'wm-nav-active');
      link.setAttribute('aria-current', 'page');
      if (window.innerWidth < 768) {
        const sidebar = document.getElementById('admin-sidebar');
        if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
          toggleSidebar(false);
        }
      }
    });
  }
}

// ============================================================================
// VESSA BOTANICAL SAGE & FOREST EMERALD SHELL + CIRCULAR VIEW-TRANSITION WIPE
// Pixel-Matched 1:1 to Reference Video (src > ui.ts > wipe) Across All 24 Pages
// ============================================================================

function getGreetingByHour() {
  const hr = new Date().getHours();
  if (hr < 12) return 'Good morning';
  if (hr < 17) return 'Good afternoon';
  return 'Good evening';
}

function getVessaCenterTabsForPath(pathname) {
  const p = String(pathname || '').toLowerCase();
  if (p.includes('template') || p.includes('festival') || p.includes('occasion') || p.includes('media')) {
    return [
      { label: 'Catalog', href: `${SECRET_ADMIN_PREFIX}/templates`, match: ['templates'] },
      { label: 'Batches & Upload', href: `${SECRET_ADMIN_PREFIX}/add-template`, match: ['add-template'] },
      { label: 'Festivals', href: `${SECRET_ADMIN_PREFIX}/festivals`, match: ['festivals'] },
      { label: 'Categories', href: `${SECRET_ADMIN_PREFIX}/occasions`, match: ['occasions'] },
      { label: 'Media Vault', href: `${SECRET_ADMIN_PREFIX}/media`, match: ['media'] }
    ];
  }
  if (p.includes('analytic') || p.includes('order') || p.includes('pricing') || p.includes('referral')) {
    return [
      { label: 'Overview', href: `${SECRET_ADMIN_PREFIX}/overview`, match: ['overview'] },
      { label: 'Sales', href: `${SECRET_ADMIN_PREFIX}/orders`, match: ['orders'] },
      { label: 'Reports', href: `${SECRET_ADMIN_PREFIX}/analytics`, match: ['analytics'] },
      { label: 'VIP Plans', href: `${SECRET_ADMIN_PREFIX}/pricing`, match: ['pricing'] },
      { label: 'Stock health', href: `${SECRET_ADMIN_PREFIX}/storage-health`, match: ['storage-health'] }
    ];
  }
  if (p.includes('wish') || p.includes('creation') || p.includes('user') || p.includes('moderation')) {
    return [
      { label: 'All Wishes', href: `${SECRET_ADMIN_PREFIX}/wishes`, match: ['wishes'] },
      { label: 'User Creations', href: `${SECRET_ADMIN_PREFIX}/user-creations`, match: ['user-creations'] },
      { label: 'Users', href: `${SECRET_ADMIN_PREFIX}/users`, match: ['users'] },
      { label: 'Moderation', href: `${SECRET_ADMIN_PREFIX}/moderation`, match: ['moderation'] }
    ];
  }
  if (p.includes('setting') || p.includes('staff') || p.includes('legal') || p.includes('announcement') || p.includes('support') || p.includes('search')) {
    return [
      { label: 'Storefront CMS', href: `${SECRET_ADMIN_PREFIX}/settings`, match: ['settings'] },
      { label: 'Search', href: `${SECRET_ADMIN_PREFIX}/search`, match: ['search'] },
      { label: 'Announcements', href: `${SECRET_ADMIN_PREFIX}/announcements`, match: ['announcements'] },
      { label: 'Staff & RBAC', href: `${SECRET_ADMIN_PREFIX}/staff`, match: ['staff'] },
      { label: 'Support', href: `${SECRET_ADMIN_PREFIX}/support`, match: ['support'] }
    ];
  }
  // Default Overview / Activity / Alerts / Stock health (Matches Video Top Center Pill 1:1)
  return [
    { label: 'Overview', href: `${SECRET_ADMIN_PREFIX}/overview`, match: ['overview', 'admin.html'] },
    { label: 'Activity', href: `${SECRET_ADMIN_PREFIX}/audit-logs`, match: ['audit-logs'] },
    { label: 'Alerts', href: `${SECRET_ADMIN_PREFIX}/notifications`, match: ['notifications'] },
    { label: 'Sales', href: `${SECRET_ADMIN_PREFIX}/orders`, match: ['orders'] },
    { label: 'Stock health', href: `${SECRET_ADMIN_PREFIX}/storage-health`, match: ['storage-health'] }
  ];
}

function mountVessaAdminShell() {
  const pathname = window.location.pathname.toLowerCase();

  // 1. Mount Vessa 3-Zone Top Bar inside <header class="wm-top-header">
  const header = document.querySelector('header.wm-top-header');
  if (header && !header.dataset.vessaMounted) {
    header.dataset.vessaMounted = 'true';

    const searchWrap = header.querySelector('.wm-header-search-wrap');
    const searchInput = header.querySelector('.wm-header-search-input');
    if (searchInput) {
      searchInput.setAttribute('placeholder', 'Search...');
    }
    const ctrlK = header.querySelector('.wm-ctrl-k-badge');
    if (ctrlK) {
      ctrlK.textContent = '⌘K';
    }

    const notifBadge = document.getElementById('wm-header-notif-badge');
    const notifDropdown = document.getElementById('wm-admin-notif-dropdown');
    const profileDropdown = document.getElementById('wm-admin-profile-dropdown');
    const existingEmail = document.getElementById('wm-admin-header-email')?.textContent || 'ankit.babusaini@gmail.com';

    const tabs = getVessaCenterTabsForPath(pathname);
    const tabsHtml = tabs.map((t, idx) => {
      const isAct = t.match.some(m => pathname.includes(m)) || (idx === 0 && !tabs.some(x => x.match.some(m => pathname.includes(m))));
      return `<a href="${t.href}" class="vessa-center-tab ${isAct ? 'active' : ''}">${escapeAdminHtml(t.label)}</a>`;
    }).join('');

    const inner = document.createElement('div');
    inner.className = 'vessa-top-header-inner';

    // Left Zone: Mobile Menu + Brand Emblem + WishMagic
    const leftDiv = document.createElement('div');
    leftDiv.className = 'flex items-center gap-3 flex-shrink-0';
    leftDiv.innerHTML = `
      <button type="button" class="md:hidden vessa-icon-circle-btn" onclick="toggleSidebar()" aria-label="Open Navigation">
        <span class="material-symbols-outlined text-[20px]">menu</span>
      </button>
      <a href="${SECRET_ADMIN_PREFIX}/overview" class="vessa-brand-block">
        <div class="vessa-brand-logo-circle">
          <span class="material-symbols-outlined text-[20px]">experiment</span>
        </div>
        <div class="flex flex-col">
          <span class="vessa-brand-title">WishMagic</span>
          <span class="vessa-brand-sub">Admin &amp; Studio</span>
        </div>
      </a>
    `;

    // Center Zone: Segmented Sub-Tab Pill Switcher
    const centerDiv = document.createElement('nav');
    centerDiv.className = 'vessa-center-tabs hidden lg:inline-flex';
    centerDiv.setAttribute('aria-label', 'Section Switcher');
    centerDiv.innerHTML = tabsHtml;

    // Right Zone: Search + Settings + Notifications + "+ New" + Greeting Profile
    const rightDiv = document.createElement('div');
    rightDiv.className = 'vessa-header-right';

    if (searchWrap) {
      rightDiv.appendChild(searchWrap);
    }

    // Settings quick button
    const settingsLink = document.createElement('a');
    settingsLink.href = `${SECRET_ADMIN_PREFIX}/settings`;
    settingsLink.className = 'vessa-icon-circle-btn hidden sm:inline-flex';
    settingsLink.title = 'Storefront CMS & Settings';
    settingsLink.innerHTML = `<span class="material-symbols-outlined text-[18px]">settings</span>`;
    rightDiv.appendChild(settingsLink);

    // Notification Bell wrapper
    const notifWrap = document.createElement('div');
    notifWrap.className = 'relative';
    const notifBtn = document.createElement('button');
    notifBtn.type = 'button';
    notifBtn.className = 'vessa-icon-circle-btn';
    notifBtn.title = 'Live Notifications';
    notifBtn.setAttribute('onclick', 'toggleAdminNotifMenu(event)');
    notifBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">notifications</span>`;
    if (notifBadge) {
      notifBadge.className = 'hidden absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center shadow';
      notifBtn.appendChild(notifBadge);
    }
    notifWrap.appendChild(notifBtn);
    if (notifDropdown) {
      notifWrap.appendChild(notifDropdown);
    }
    rightDiv.appendChild(notifWrap);

    // Primary "+ New" Emerald Pill Button
    const newBtn = document.createElement('a');
    newBtn.href = `${SECRET_ADMIN_PREFIX}/add-template`;
    newBtn.className = 'vessa-new-btn';
    newBtn.innerHTML = `<span class="material-symbols-outlined text-[16px]">add</span><span>New</span>`;
    rightDiv.appendChild(newBtn);

    // Profile Greeting Pill ("Good morning / Ankit Saini")
    const profWrap = document.createElement('div');
    profWrap.className = 'relative';
    const profPill = document.createElement('div');
    profPill.className = 'wm-admin-profile-pill';
    profPill.setAttribute('onclick', 'toggleAdminProfileMenu(event)');
    profPill.innerHTML = `
      <div class="vessa-avatar-circle">AS</div>
      <div class="hidden sm:flex flex-col text-left leading-tight">
        <span class="text-[10px] font-medium text-on-surface-variant">${getGreetingByHour()}</span>
        <span class="text-[12px] font-bold text-on-surface">Ankit Saini</span>
        <span id="wm-admin-header-email" class="hidden">${escapeAdminHtml(existingEmail)}</span>
      </div>
      <span class="material-symbols-outlined text-[16px] text-on-surface-variant">expand_more</span>
    `;
    profWrap.appendChild(profPill);
    if (profileDropdown) {
      profWrap.appendChild(profileDropdown);
    }
    rightDiv.appendChild(profWrap);

    header.innerHTML = '';
    inner.appendChild(leftDiv);
    inner.appendChild(centerDiv);
    inner.appendChild(rightDiv);
    header.appendChild(inner);
  }

  // 2. Mount Vessa Vertical Sun/Moon Theme Wipe Capsule & Expand Button in <aside id="admin-sidebar">
  const sidebar = document.getElementById('admin-sidebar');
  if (sidebar && !sidebar.dataset.vessaMounted) {
    sidebar.dataset.vessaMounted = 'true';

    const capsule = document.createElement('div');
    capsule.className = 'vessa-theme-capsule';
    capsule.innerHTML = `
      <button type="button" class="vessa-theme-circle-btn" data-theme-target="light" onclick="window.setTheme('light', this)" title="Light Mode (Circular Wipe)" aria-label="Switch to Light Mode">
        <span class="material-symbols-outlined text-[18px]">light_mode</span>
      </button>
      <button type="button" class="vessa-theme-circle-btn" data-theme-target="dark" onclick="window.setTheme('dark', this)" title="Dark Mode (Circular Wipe)" aria-label="Switch to Dark Mode">
        <span class="material-symbols-outlined text-[17px]">dark_mode</span>
      </button>
    `;
    sidebar.insertBefore(capsule, sidebar.firstChild);

    // Ensure all 23 sections inside #wm-sidebar-more-group are visible as icons on the rail or in expanded mode
    const moreGroup = document.getElementById('wm-sidebar-more-group');
    if (moreGroup) {
      moreGroup.classList.remove('hidden');
      moreGroup.style.borderLeft = 'none';
      moreGroup.style.marginLeft = '0';
      moreGroup.style.paddingLeft = '0';
    }

    // Add bottom rail button to expand/collapse full text labels for all 23 sections
    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'vessa-rail-expand-btn';
    expandBtn.title = 'Expand / Collapse All 23 Studio Sections';
    expandBtn.innerHTML = `<span class="material-symbols-outlined text-[19px]" id="vessa-rail-expand-icon">dock_to_right</span>`;
    expandBtn.addEventListener('click', () => {
      const isExp = sidebar.classList.toggle('vessa-rail-expanded');
      const ic = document.getElementById('vessa-rail-expand-icon');
      if (ic) ic.textContent = isExp ? 'keyboard_double_arrow_left' : 'dock_to_right';
    });
    sidebar.appendChild(expandBtn);
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
  document.addEventListener('DOMContentLoaded', () => {
    mountVessaAdminShell();
    initAdminNavigationAndNotifications();
  });
} else {
  mountVessaAdminShell();
  initAdminNavigationAndNotifications();
}

function updateThemeIcons(isDark) {
  document.querySelectorAll('.wm-theme-pill-btn').forEach(btn => {
    btn.setAttribute('data-theme-mode', isDark ? 'dark' : 'light');
    btn.setAttribute('aria-checked', isDark ? 'true' : 'false');
  });
  document.querySelectorAll('.vessa-theme-circle-btn').forEach(btn => {
    const target = btn.getAttribute('data-theme-target');
    const active = (target === 'dark' && isDark) || (target === 'light' && !isDark);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

// Exact Circular View-Transition Theme Wipe from Video (src > ui.ts > wipe)
function wipe(origin, change) {
  const r = origin && typeof origin.getBoundingClientRect === 'function'
    ? origin.getBoundingClientRect()
    : null;
  const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
  const y = r ? r.top + r.height / 2 : window.innerHeight / 2;
  const end = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );
  if (typeof document.startViewTransition !== 'function') {
    change();
    return;
  }
  try {
    const transition = document.startViewTransition(change);
    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${end}px at ${x}px ${y}px)`
          ]
        },
        {
          duration: 620,
          easing: 'cubic-bezier(.65,0,.35,1)',
          pseudoElement: '::view-transition-new(root)'
        }
      );
    }).catch(() => {});
  } catch (_) {
    change();
  }
}
window.wipe = wipe;

function applyThemePreference(pref) {
  const isDark = pref === 'dark';
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  localStorage.setItem('wishmagic_admin_theme_v2', isDark ? 'dark' : 'light');
  localStorage.setItem('wishmagic_admin_theme', isDark ? 'dark' : 'light');
  updateThemeIcons(isDark);
}

function setTheme(pref, origin) {
  const targetDark = pref === 'dark';
  const isCurrentlyDark = document.documentElement.classList.contains('dark');
  if (targetDark === isCurrentlyDark) return;
  const originEl = origin || document.querySelector(`.vessa-theme-circle-btn[data-theme-target="${pref}"]`);
  wipe(originEl, () => {
    applyThemePreference(pref);
  });
}
window.setTheme = setTheme;

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

function toggleAdminTheme(event) {
  const isCurrentlyDark = document.documentElement.classList.contains('dark');
  const nextPref = isCurrentlyDark ? 'light' : 'dark';
  const originEl = (event && event.currentTarget) ||
    document.querySelector(`.vessa-theme-circle-btn[data-theme-target="${nextPref}"]`) ||
    document.querySelector('.wm-theme-pill-btn');
  setTheme(nextPref, originEl);
}
window.toggleAdminTheme = toggleAdminTheme;
window.toggleTheme = toggleAdminTheme;

function toggleSidebar(forceOpen) {
  const sidebar = document.getElementById('admin-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  const isCurrentlyClosed = sidebar.classList.contains('-translate-x-full');
  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : isCurrentlyClosed;

  if (shouldOpen) {
    sidebar.classList.remove('-translate-x-full');
    sidebar.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.classList.remove('hidden');
    if (window.innerWidth < 768) {
      document.body.style.overflow = 'hidden';
      const firstLink = sidebar.querySelector('nav a, button');
      if (firstLink && typeof firstLink.focus === 'function') {
        setTimeout(() => firstLink.focus({ preventScroll: true }), 50);
      }
    }
  } else {
    sidebar.classList.add('-translate-x-full');
    if (window.innerWidth < 768) {
      sidebar.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) backdrop.classList.add('hidden');
    document.body.style.overflow = '';
  }
}
window.toggleSidebar = toggleSidebar;

var showToast = function(msg, type) {
  let resolvedType = type || 'info';
  const textStr = String(msg || '');
  if (!type || type === 'info') {
    if (textStr.includes('❌') || /fail|error|invalid|reject/i.test(textStr)) {
      resolvedType = 'error';
    } else if (textStr.includes('⚠️') || /warn|cannot/i.test(textStr)) {
      resolvedType = 'warning';
    } else if (textStr.includes('✨') || textStr.includes('✅') || /saved|published|updated|restored|exported|persisted/i.test(textStr)) {
      resolvedType = 'success';
    }
  }

  let toast = document.getElementById('admin-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'admin-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }

  let icon = 'check_circle';
  let bgHex = 'rgba(20, 30, 24, 0.96)';
  let borderHex = 'rgba(56, 201, 118, 0.45)';
  let iconHex = '#38c976';

  if (resolvedType === 'success') {
    icon = 'check_circle';
    bgHex = 'rgba(17, 42, 29, 0.96)';
    borderHex = 'rgba(56, 201, 118, 0.55)';
    iconHex = '#38c976';
  } else if (resolvedType === 'error' || resolvedType === 'danger') {
    icon = 'error';
    bgHex = 'rgba(136, 19, 55, 0.96)';
    borderHex = 'rgba(251, 113, 133, 0.55)';
    iconHex = '#fb7185';
  } else if (resolvedType === 'warning') {
    icon = 'warning';
    bgHex = 'rgba(120, 53, 15, 0.96)';
    borderHex = 'rgba(251, 191, 36, 0.55)';
    iconHex = '#fbbf24';
  }

  toast.className = 'fixed bottom-6 right-6 z-[9999] px-5 py-3.5 rounded-2xl text-white font-bold text-sm shadow-2xl backdrop-blur-xl border flex items-center gap-3 transform transition-all duration-300';
  toast.style.cssText = [
    'position: fixed',
    'bottom: 24px',
    'right: 24px',
    'z-index: 2147483647',
    'padding: 13px 18px',
    'border-radius: 14px',
    'background: ' + bgHex,
    'border: 1px solid ' + borderHex,
    'color: #ffffff',
    'font-weight: 700',
    'font-size: 13.5px',
    'line-height: 1.4',
    'box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35)',
    'backdrop-filter: blur(14px)',
    '-webkit-backdrop-filter: blur(14px)',
    'display: flex',
    'align-items: center',
    'gap: 10px',
    'max-width: min(92vw, 440px)',
    'transform: translateY(0)',
    'opacity: 1',
    'pointer-events: auto',
    'transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease'
  ].join('; ');

  toast.innerHTML = `<span class="material-symbols-outlined" style="color:${iconHex};font-size:20px;flex-shrink:0;">${icon}</span><span style="color:#ffffff;word-break:break-word;">${escapeAdminHtml(textStr)}</span>`;

  if (window.toastTimeout) clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => {
    toast.style.transform = 'translateY(80px)';
    toast.style.opacity = '0';
    toast.style.pointerEvents = 'none';
  }, 4000);
};
window.showToast = showToast;

// 4. Shared Enterprise Admin Studio Utilities (Double-Submit Prevention, Confirmations & Safe API Calls)
const AdminStudio = (() => {
  const activeControllers = new Map();

  function createAbortSignal(key) {
    if (key && activeControllers.has(key)) {
      try { activeControllers.get(key).abort(); } catch (_) {}
    }
    const controller = new AbortController();
    if (key) activeControllers.set(key, controller);
    return controller.signal;
  }

  async function withButtonLock(buttonEl, asyncFn, loadingLabel = null) {
    if (buttonEl && buttonEl.dataset.wmLocked === 'true') return;
    const originalHtml = buttonEl ? buttonEl.innerHTML : null;
    const originalDisabled = buttonEl ? buttonEl.disabled : false;
    window.__wmAdminMutationInFlight = true;
    if (buttonEl) {
      buttonEl.dataset.wmLocked = 'true';
      buttonEl.disabled = true;
      buttonEl.setAttribute('aria-busy', 'true');
      if (loadingLabel) {
        buttonEl.innerHTML = `<span class="material-symbols-outlined text-[16px] animate-spin align-middle mr-1.5">progress_activity</span>${escapeAdminHtml(loadingLabel)}`;
      }
    }
    try {
      return await asyncFn();
    } finally {
      window.__wmAdminMutationInFlight = false;
      if (buttonEl) {
        delete buttonEl.dataset.wmLocked;
        buttonEl.disabled = originalDisabled;
        buttonEl.removeAttribute('aria-busy');
        if (loadingLabel && originalHtml !== null) {
          buttonEl.innerHTML = originalHtml;
        }
      }
    }
  }

  return {
    escapeHtml: escapeAdminHtml,
    createAbortSignal,
    withButtonLock
  };
})();
window.AdminStudio = AdminStudio;
