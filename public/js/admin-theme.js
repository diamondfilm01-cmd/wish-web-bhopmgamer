// Universal Admin Fetch Credentials, Bearer Session Token Sync, Cross-Tab Broadcast & Fast Deduplication Interceptor
(function patchAdminFetchCredentials() {
  if (typeof window === 'undefined' || !window.fetch || window.__wmFetchPatched) return;
  const originalFetch = window.fetch.bind(window);
  const inFlightGets = new Map();
  const CACHE_PREFIX = 'wm_api_fastcache_v1:';
  const CACHE_TTL_MS = 4000;
  const TOKEN_KEYS = ['wm_admin_session_token', 'wishmagic_admin_token', 'clay_admin_token'];

  function getAdminStoredSessionToken() {
    try {
      for (const k of TOKEN_KEYS) {
        const val = localStorage.getItem(k);
        if (val && typeof val === 'string' && val.trim().length > 6) {
          return val.trim();
        }
      }
    } catch (_) {}
    return '';
  }

  function saveAdminStoredSessionToken(token) {
    if (!token || typeof token !== 'string' || token.trim().length < 6) return;
    const clean = token.trim();
    try {
      TOKEN_KEYS.forEach(k => localStorage.setItem(k, clean));
    } catch (_) {}
  }

  function clearAdminStoredSessionToken() {
    try {
      TOKEN_KEYS.forEach(k => localStorage.removeItem(k));
    } catch (_) {}
  }

  window.getAdminStoredSessionToken = getAdminStoredSessionToken;
  window.saveAdminStoredSessionToken = saveAdminStoredSessionToken;
  window.clearAdminStoredSessionToken = clearAdminStoredSessionToken;

  let mutationNotifyTimer = null;
  window.__wmActiveMutations = 0;
  window.__wmLastMutationTs = 0;
  window.__wmLastUserEditTs = 0;
  window.__wmLastFocusSyncTs = 0;

  if (typeof document !== 'undefined') {
    const trackAdminUserEdit = (ev) => {
      const t = ev && ev.target;
      if (!t || !t.tagName) return;
      const tag = t.tagName.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) {
        if (t.classList && (t.classList.contains('wm-header-search-input') || t.id === 'global-admin-search-input')) {
          return;
        }
        window.__wmLastUserEditTs = Date.now();
      }
    };
    document.addEventListener('input', trackAdminUserEdit, true);
    document.addEventListener('change', trackAdminUserEdit, true);
  }

  function canRunBackgroundAdminSync(options = {}) {
    if (options && options.manual) return true;
    if (window.__wmAdminMutationInFlight || (window.__wmActiveMutations && window.__wmActiveMutations > 0)) {
      return false;
    }
    const sinceLastMutation = Date.now() - (window.__wmLastMutationTs || 0);
    if (options && options.fromBroadcast) {
      if (sinceLastMutation < 1800) return false;
    } else {
      if (sinceLastMutation < 4000) return false;
      if (Date.now() - (window.__wmLastUserEditTs || 0) < 15000) return false;
    }

    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable)) {
      return false;
    }

    const openModal = document.querySelector('[id*="modal"]:not(.hidden):not([data-inline-page="true"])');
    if (openModal && (openModal.classList.contains('fixed') || openModal.getAttribute('role') === 'dialog')) {
      return false;
    }

    const unsavedPricingBanner = document.getElementById('pricing-unsaved-banner');
    if (unsavedPricingBanner && !unsavedPricingBanner.classList.contains('hidden')) {
      return false;
    }

    const activeSearchInput = document.querySelector('#search-input, #user-search, #wish-search, #admin-template-search');
    if (activeSearchInput && String(activeSearchInput.value || '').trim().length > 0) {
      return false;
    }

    return true;
  }
  window.canRunBackgroundAdminSync = canRunBackgroundAdminSync;

  let syncChannel = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      syncChannel = new BroadcastChannel('wm_admin_live_sync_v1');
      syncChannel.addEventListener('message', (ev) => {
        if (!ev || !ev.data) return;
        if (ev.data.type === 'WM_ADMIN_MUTATION' || ev.data.type === 'WM_ADMIN_FORCE_SYNC') {
          clearAdminApiCache();
          if (typeof window.triggerAdminLiveSync === 'function' && canRunBackgroundAdminSync({ fromBroadcast: true })) {
            window.triggerAdminLiveSync(true, { silent: true, fromBroadcast: true });
          }
        } else if (ev.data.type === 'WM_ADMIN_TOKEN_SYNC' && ev.data.token) {
          saveAdminStoredSessionToken(ev.data.token);
        }
      });
    }
  } catch (_) {}

  window.addEventListener('storage', (ev) => {
    if (!ev) return;
    if (ev.key === 'wm_admin_last_mutation_ts') {
      clearAdminApiCache();
      if (typeof window.triggerAdminLiveSync === 'function' && canRunBackgroundAdminSync({ fromBroadcast: true })) {
        window.triggerAdminLiveSync(true, { silent: true, fromBroadcast: true });
      }
    }
  });

  function isNonMutationBackgroundEndpoint(urlStr) {
    if (!urlStr) return true;
    return (
      urlStr.includes('/api/events') ||
      urlStr.includes('/api/analytics/event') ||
      urlStr.includes('/api/auth/session') ||
      urlStr.includes('/api/admin/auth/session')
    );
  }

  function notifyAdminMutation(urlStr) {
    clearAdminApiCache();
    window.__wmLastMutationTs = Date.now();
    window.__wmLastUserEditTs = 0;
    if (mutationNotifyTimer) clearTimeout(mutationNotifyTimer);
    mutationNotifyTimer = setTimeout(() => {
      if (window.__wmActiveMutations > 0) return;
      try {
        localStorage.setItem('wm_admin_last_mutation_ts', String(Date.now()));
      } catch (_) {}
      try {
        if (syncChannel) {
          syncChannel.postMessage({ type: 'WM_ADMIN_MUTATION', url: urlStr, ts: Date.now() });
        }
      } catch (_) {}
      try {
        const publicTplChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('wishmagic_templates_sync') : null;
        if (publicTplChannel) {
          publicTplChannel.postMessage({ type: 'TEMPLATES_UPDATED', ts: Date.now(), url: urlStr });
          setTimeout(() => { try { publicTplChannel.close(); } catch (_) {} }, 250);
        }
      } catch (_) {}
    }, 180);
  }
  window.notifyAdminMutation = notifyAdminMutation;

  function clearAdminApiCache() {
    inFlightGets.clear();
    try {
      if (window.WishApiClient && typeof window.WishApiClient.invalidateCache === 'function') {
        window.WishApiClient.invalidateCache();
      }
    } catch (_) {}
    try {
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && (k.startsWith(CACHE_PREFIX) || k.startsWith('wm_public_templates_cache') || k === 'wm_admin_header_notif_v1' || k === 'clay_admin_overview_cache_v1')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => sessionStorage.removeItem(k));
    } catch (_) {}
    try {
      localStorage.removeItem('wm_public_templates_cache_v2');
      localStorage.removeItem('wishmagic_templates_v1');
      localStorage.removeItem('wishmagic_site_settings_v1');
      localStorage.removeItem('wishmagic_pricing_rules_v4');
    } catch (_) {}
  }
  window.clearAdminApiCache = clearAdminApiCache;

  function isCacheableGetUrl(urlStr) {
    if (!urlStr) return false;
    if (window.__wmBypassFastCache) return false;
    if ((window.__wmActiveMutations && window.__wmActiveMutations > 0) || (Date.now() - (window.__wmLastMutationTs || 0) < 2500)) {
      return false;
    }
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

  function captureSessionHeaderFromResponse(res) {
    try {
      if (res && res.headers && typeof res.headers.get === 'function') {
        const hdrToken = res.headers.get('X-WishMagic-Admin-Session');
        if (hdrToken && hdrToken.trim().length > 6) {
          saveAdminStoredSessionToken(hdrToken);
          try {
            if (syncChannel) syncChannel.postMessage({ type: 'WM_ADMIN_TOKEN_SYNC', token: hdrToken.trim() });
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  window.fetch = function(input, init) {
    let urlStr = '';
    let method = 'GET';
    const callerExplicitNoStore = Boolean(init && (init.cache === 'no-store' || init.cache === 'reload'));
    try {
      urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (urlStr.startsWith('/api/') || urlStr.includes('/api/')) {
        init = Object.assign({ credentials: 'include' }, init || {});
        if (!init.credentials) init.credentials = 'include';
        if (!init.cache) init.cache = 'no-store';

        const storedToken = getAdminStoredSessionToken();
        if (storedToken) {
          if (init.headers instanceof Headers) {
            init.headers.set('Authorization', `Bearer ${storedToken}`);
          } else {
            const hdrs = Object.assign({}, init.headers || {});
            hdrs['Authorization'] = `Bearer ${storedToken}`;
            init.headers = hdrs;
          }
        }
      }
    } catch (_) {}

    if (method !== 'GET' && method !== 'HEAD') {
      const isApiCall = urlStr.startsWith('/api/') || urlStr.includes('/api/');
      const isMutation = isApiCall && !isNonMutationBackgroundEndpoint(urlStr);
      if (isMutation) {
        window.__wmActiveMutations = (window.__wmActiveMutations || 0) + 1;
        window.__wmAdminMutationInFlight = true;
        window.__wmLastMutationTs = Date.now();
        clearAdminApiCache();
      }
      return originalFetch(input, init).then((res) => {
        captureSessionHeaderFromResponse(res);
        if (isMutation) {
          window.__wmLastMutationTs = Date.now();
          if (res && res.ok) {
            notifyAdminMutation(urlStr);
          } else {
            clearAdminApiCache();
          }
        }
        return res;
      }).finally(() => {
        if (isMutation) {
          window.__wmActiveMutations = Math.max(0, (window.__wmActiveMutations || 1) - 1);
          window.__wmAdminMutationInFlight = window.__wmActiveMutations > 0;
          window.__wmLastMutationTs = Date.now();
        }
      });
    }

    if (typeof input === 'string' && !callerExplicitNoStore && isCacheableGetUrl(urlStr)) {
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
        captureSessionHeaderFromResponse(res);
        try {
          if (res && res.ok && !window.__wmAdminMutationInFlight) {
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

    return originalFetch(input, init).then((res) => {
      captureSessionHeaderFromResponse(res);
      return res;
    });
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
  const SESSION_CACHE_TTL_MS = 180000;

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

  async function ensureFirebaseAuthBridgeLoaded() {
    if (window.WishFirebaseAuth) {
      if (typeof window.WishFirebaseAuth.ready === 'function') {
        try { await window.WishFirebaseAuth.ready(); } catch (_) {}
      }
      return window.WishFirebaseAuth;
    }
    const loadScript = (src) => new Promise((res) => {
      if (document.querySelector(`script[src*="${src}"]`)) return res();
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => res();
      s.onerror = () => res();
      document.head.appendChild(s);
    });
    if (!window.firebase) {
      await loadScript('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js');
    }
    await loadScript('/js/firebase-auth.js');
    if (window.WishFirebaseAuth && typeof window.WishFirebaseAuth.ready === 'function') {
      try { await window.WishFirebaseAuth.ready(); } catch (_) {}
    }
    return window.WishFirebaseAuth;
  }

  async function trySilentFirebaseAdminRestore() {
    try {
      const fbBridge = await ensureFirebaseAuthBridgeLoaded();
      if (!fbBridge) return null;

      let fbUser = typeof fbBridge.getCurrentUser === 'function' ? fbBridge.getCurrentUser() : null;
      if (!fbUser && typeof fbBridge.onAuthStateChanged === 'function') {
        fbUser = await new Promise((resolve) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) { settled = true; resolve(null); }
          }, 1800);
          fbBridge.onAuthStateChanged((u) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve(u || null);
            }
          });
        });
      }

      if (!fbUser || !isAuthorizedEmail(fbUser.email)) return null;

      let idToken = null;
      if (typeof fbUser.getIdToken === 'function') {
        try { idToken = await fbUser.getIdToken(); } catch (_) {}
      }

      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

      const signinRes = await fetch('/api/auth/signin', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers,
        body: JSON.stringify({
          email: cleanEmail(fbUser.email),
          displayName: fbUser.displayName || 'Ankit Saini',
          avatarUrl: fbUser.photoURL || null,
          provider: 'google',
          firebaseUid: fbUser.uid,
          idToken: idToken || undefined
        })
      });

      const signinData = await signinRes.json().catch(() => ({}));
      const hdrToken = (signinRes.headers && signinRes.headers.get ? signinRes.headers.get('X-WishMagic-Admin-Session') : null) || signinData?.token || signinData?.data?.token;
      if (hdrToken && typeof window.saveAdminStoredSessionToken === 'function') {
        window.saveAdminStoredSessionToken(hdrToken);
      }

      if (signinRes.ok && signinData?.success === true) {
        const u = signinData?.user || signinData?.data?.user || {
          id: fbUser.uid,
          email: cleanEmail(fbUser.email),
          displayName: fbUser.displayName || 'Ankit Saini'
        };
        const enrichedOwner = Object.assign({}, u, {
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
    } catch (e) {
      console.warn('[AdminAuthController] Silent Firebase restore note:', e);
    }
    return null;
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
              displayName: adminRecord.name || adminRecord.displayName || user?.displayName || 'Admin Staff',
              name: adminRecord.name || adminRecord.displayName || user?.displayName || 'Admin Staff',
              mobile: adminRecord.mobile || null,
              role: adminRecord.role || 'ADMIN',
              isOwner: Boolean(adminRecord.isOwner || isAuthorizedEmail(adminRecord.email)),
              isAdmin: true,
              permissions: Array.isArray(adminRecord.permissions) ? adminRecord.permissions : ['*']
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

        // Attempt silent restoration from Firebase IndexedDB if owner is signed into Google on this device
        if (!options.skipFirebaseRestore) {
          const restoredUser = await trySilentFirebaseAdminRestore();
          if (restoredUser) {
            return restoredUser;
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
  async function signIn(options = {}) {
    if (signInPromise) return signInPromise;
    if (navigationStarted) return;

    currentState = STATE.AUTHENTICATING;

    signInPromise = (async () => {
      try {
        const fbBridge = await ensureFirebaseAuthBridgeLoaded();
        if (!fbBridge) {
          throw new Error('Firebase Google Authentication is initializing. Please try again or use Admin Credentials below.');
        }

        const firebaseUser = await fbBridge.signInWithGoogle();
        if (!firebaseUser) {
          throw new Error('Google sign-in was not completed.');
        }

        const email = cleanEmail(firebaseUser.email);
        if (!isAuthorizedEmail(email)) {
          try { await fbBridge.signOut(); } catch (_) {}
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
        const hdrToken = (signinRes.headers && signinRes.headers.get ? signinRes.headers.get('X-WishMagic-Admin-Session') : null) || signinData?.token || signinData?.data?.token;
        if (hdrToken && typeof window.saveAdminStoredSessionToken === 'function') {
          window.saveAdminStoredSessionToken(hdrToken);
        }

        if (!signinRes.ok || signinData?.success !== true) {
          throw new Error(signinData?.error?.message || signinData?.message || 'Admin authentication failed.');
        }

        const verifiedUser = await checkSession({ force: true, skipFirebaseRestore: true });
        if (!verifiedUser) {
          throw new Error('Unable to verify server session.');
        }

        if (options.stayOnCurrentPage) {
          if (typeof window.triggerAdminLiveSync === 'function') {
            window.triggerAdminLiveSync(true);
          }
          return verifiedUser;
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

  async function signInWithCredentials(identifier, password, options = {}) {
    const cleanId = String(identifier || '').trim();
    const cleanPass = String(password || '');
    if (!cleanId || !cleanPass) {
      throw new Error('Admin username and password are required.');
    }

    const res = await fetch('/api/admin/auth/verify-credentials', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        username: cleanId,
        identifier: cleanId,
        password: cleanPass
      })
    });

    const data = await res.json().catch(() => ({}));
    const hdrToken = (res.headers && res.headers.get ? res.headers.get('X-WishMagic-Admin-Session') : null) || data?.data?.token || data?.token;
    if (hdrToken && typeof window.saveAdminStoredSessionToken === 'function') {
      window.saveAdminStoredSessionToken(hdrToken);
    }

    if (!res.ok || data?.success !== true) {
      throw new Error(data?.error?.message || data?.message || 'Invalid admin credentials.');
    }

    const verifiedUser = await checkSession({ force: true, skipFirebaseRestore: true });
    if (!verifiedUser) {
      throw new Error('Session verified but unable to load admin profile.');
    }

    if (options.stayOnCurrentPage) {
      if (typeof window.triggerAdminLiveSync === 'function') {
        window.triggerAdminLiveSync(true);
      }
      return verifiedUser;
    }

    if (!navigationStarted) {
      navigationStarted = true;
      window.location.replace(ADMIN_TARGET);
    }
    return verifiedUser;
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
      if (typeof window.clearAdminStoredSessionToken === 'function') window.clearAdminStoredSessionToken();
      if (typeof window.clearAdminApiCache === 'function') window.clearAdminApiCache();
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'WM_ADMIN_LOGOUT' });
      }
      if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).catch(() => {});
      }
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
    signInWithCredentials,
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

  function applyVerifiedAdminUiState(user) {
    const screen = document.getElementById('admin-access-restricted-screen');
    if (screen) screen.remove();
    const pwaScreen = document.getElementById('admin-pwa-signin-screen');
    if (pwaScreen) pwaScreen.remove();
    if (document.body) document.body.style.display = '';
    const emailEl = document.getElementById('wm-admin-header-email');
    if (emailEl) {
      emailEl.textContent = user.email || user.mobile || user.displayName || 'ankit.babusaini@gmail.com';
    }
    const dropdownEmailEls = document.querySelectorAll('#wm-admin-profile-dropdown .truncate');
    if (dropdownEmailEls.length > 0 && (user.email || user.mobile)) {
      dropdownEmailEls[dropdownEmailEls.length - 1].textContent = user.email || user.mobile;
    }
    // Trigger a live data sync once auth session is verified so any initial page fetch that ran before token restoration immediately populates
    setTimeout(() => {
      if (typeof window.triggerAdminLiveSync === 'function') {
        window.triggerAdminLiveSync(true, { silent: true });
      }
    }, 80);
  }

  try {
    const user = await window.AdminAuthController.checkSession();
    if (user && window.AdminAuthController.isValidAdminUser(user)) {
      applyVerifiedAdminUiState(user);
      return;
    }

    // Show interactive Admin Sign-In overlay (supports both Google OAuth and Built-In Admin Credentials so installed PWA & browser sessions sync without losing context)
    const mountSignInOverlay = () => {
      if (!document.body) return;
      document.body.style.display = '';
      let authOverlay = document.getElementById('admin-pwa-signin-screen');
      if (!authOverlay) {
        authOverlay = document.createElement('div');
        authOverlay.id = 'admin-pwa-signin-screen';
        authOverlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;padding:20px;font-family:"Plus Jakarta Sans",sans-serif;overflow-y:auto;';
        authOverlay.innerHTML = `
          <div style="width:100%;max-width:400px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 24px;text-align:center;">
            <div style="width:42px;height:42px;border-radius:8px;background:#0f172a;color:#ffffff;display:inline-flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;margin-bottom:12px;">W</div>
            <h2 style="font-size:18px;font-weight:700;margin:0 0 6px 0;color:#0f172a;">WishMagic Admin</h2>
            <p style="font-size:12.5px;line-height:1.5;color:#475569;margin:0 0 18px 0;">Sign in to manage templates, wishes, orders, and live settings.</p>
            <button type="button" id="wm-pwa-google-signin-btn" style="width:100%;min-height:42px;border-radius:8px;background:#2563eb;color:#ffffff;font-size:13.5px;font-weight:600;border:none;cursor:pointer;margin-bottom:14px;display:flex;align-items:center;justify-content:center;gap:8px;">
              <span>Sign In with Owner Google Account</span>
            </button>
            <div style="display:flex;align-items:center;gap:10px;margin:12px 0;">
              <div style="flex:1;height:1px;background:#e2e8f0;"></div>
              <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Or Admin Credentials</span>
              <div style="flex:1;height:1px;background:#e2e8f0;"></div>
            </div>
            <form id="wm-pwa-cred-form" style="display:flex;flex-direction:column;gap:10px;text-align:left;margin-bottom:14px;">
              <input type="text" id="wm-pwa-cred-user" placeholder="Admin Username" autocomplete="username" style="width:100%;height:40px;padding:0 12px;border-radius:8px;border:1px solid #cbd5e1;background:#ffffff;color:#0f172a;font-size:13px;outline:none;" />
              <input type="password" id="wm-pwa-cred-pass" placeholder="Admin Password" autocomplete="current-password" style="width:100%;height:40px;padding:0 12px;border-radius:8px;border:1px solid #cbd5e1;background:#ffffff;color:#0f172a;font-size:13px;outline:none;" />
              <button type="submit" id="wm-pwa-cred-submit" style="width:100%;min-height:40px;border-radius:8px;background:#0f172a;color:#ffffff;border:none;font-size:13px;font-weight:600;cursor:pointer;">Sign In</button>
            </form>
            <a href="/" style="display:inline-block;font-size:12px;font-weight:600;color:#475569;text-decoration:none;">← Open Public Storefront</a>
            <div id="wm-pwa-signin-error" style="margin-top:12px;font-size:12px;color:#b91c1c;display:none;"></div>
          </div>
        `;
        document.body.appendChild(authOverlay);
        const btn = document.getElementById('wm-pwa-google-signin-btn');
        const credForm = document.getElementById('wm-pwa-cred-form');
        const credUser = document.getElementById('wm-pwa-cred-user');
        const credPass = document.getElementById('wm-pwa-cred-pass');
        const credSubmit = document.getElementById('wm-pwa-cred-submit');
        const errBox = document.getElementById('wm-pwa-signin-error');

        if (btn) {
          btn.onclick = async () => {
            btn.disabled = true;
            btn.textContent = 'Signing in with Google...';
            if (errBox) errBox.style.display = 'none';
            try {
              const signedInUser = await window.AdminAuthController.signIn({ stayOnCurrentPage: true });
              if (signedInUser) {
                applyVerifiedAdminUiState(signedInUser);
              }
            } catch (signInErr) {
              btn.disabled = false;
              btn.textContent = 'Sign In with Owner Google Account';
              if (errBox) {
                errBox.textContent = signInErr?.message || 'Sign-in failed. Please try again.';
                errBox.style.display = 'block';
              }
            }
          };
        }

        if (credForm) {
          credForm.onsubmit = async (ev) => {
            ev.preventDefault();
            if (errBox) errBox.style.display = 'none';
            if (credSubmit) {
              credSubmit.disabled = true;
              credSubmit.textContent = 'Connecting & Syncing...';
            }
            try {
              const signedInUser = await window.AdminAuthController.signInWithCredentials(
                credUser ? credUser.value : '',
                credPass ? credPass.value : '',
                { stayOnCurrentPage: true }
              );
              if (signedInUser) {
                applyVerifiedAdminUiState(signedInUser);
              }
            } catch (credErr) {
              if (credSubmit) {
                credSubmit.disabled = false;
                credSubmit.textContent = 'Connect & Sync Live Studio';
              }
              if (errBox) {
                errBox.textContent = credErr?.message || 'Invalid credentials. Please try again.';
                errBox.style.display = 'block';
              }
            }
          };
        }
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountSignInOverlay, { once: true });
    } else {
      mountSignInOverlay();
    }
  } catch (err) {
    console.warn('[AdminGate] Gatekeeper verification error:', err);
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

}

function escapeAdminHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}



// 3. Universal Global Command & Search Palette (Ctrl/Cmd+K & Header Input across all 23 Admin Pages)
const ADMIN_COMMAND_DESTINATIONS = [
  { title: 'Overview & Control Center', sub: 'Executive KPIs, activity & health', href: `${SECRET_ADMIN_PREFIX}/overview`, icon: 'dashboard', keywords: 'dashboard home overview metrics kpi health' },
  { title: 'Analytics & BI Funnel', sub: 'Revenue, conversion funnel & cohorts', href: `${SECRET_ADMIN_PREFIX}/analytics`, icon: 'monitoring', keywords: 'analytics revenue funnel conversion bi charts', perm: 'VIEW_ANALYTICS' },
  { title: 'Templates Library', sub: 'Manage UTP v1.3.0 templates, variants & versions', href: `${SECRET_ADMIN_PREFIX}/templates`, icon: 'auto_awesome_mosaic', keywords: 'templates library catalog variants versions utp', perm: 'MANAGE_TEMPLATES' },
  { title: 'Add & Upload Template', sub: 'Upload ZIP/folder & Smart Recognition Studio', href: `${SECRET_ADMIN_PREFIX}/add-template`, icon: 'upload_file', keywords: 'add upload template zip studio import', perm: 'MANAGE_TEMPLATES' },
  { title: 'Festival Scheduler', sub: 'Annual festival calendar, date overrides, campaigns & template windows', href: `${SECRET_ADMIN_PREFIX}/festivals`, icon: 'event_available', keywords: 'festival scheduler calendar campaigns diwali holi overrides publication window utp 1.4.0', perm: 'MANAGE_TEMPLATES' },
  { title: 'Occasions & Categories', sub: 'Categories, ordering & popular tags', href: `${SECRET_ADMIN_PREFIX}/occasions`, icon: 'category', keywords: 'occasions categories tags birthday anniversary', perm: 'MANAGE_CATEGORIES' },
  { title: 'All Wishes Management', sub: 'Inspect, extend expiry & manage wishes', href: `${SECRET_ADMIN_PREFIX}/wishes`, icon: 'celebration', keywords: 'wishes links expiring published drafts', perm: 'MANAGE_WISHES' },
  { title: 'Users & Account Lifecycle', sub: 'User directory, VIP status & accounts', href: `${SECRET_ADMIN_PREFIX}/users`, icon: 'group', keywords: 'users accounts vip suspend ban', perm: 'MANAGE_USERS' },
  { title: 'Orders & Commerce', sub: 'Payments, refunds, comp passes & reconciliation', href: `${SECRET_ADMIN_PREFIX}/orders`, icon: 'receipt_long', keywords: 'orders payments razorpay refunds vip pass commerce', perm: 'MANAGE_SETTINGS' },
  { title: 'Media, Music & Hero Banner', sub: 'ImgBB/B2 assets, background tracks & hero banner', href: `${SECRET_ADMIN_PREFIX}/media`, icon: 'library_music', keywords: 'media music audio hero banner imgbb b2 upload', perm: 'MANAGE_TEMPLATES' },
  { title: 'Pricing, Plans & Coupons', sub: 'Monetization tiers, link pricing & promo codes', href: `${SECRET_ADMIN_PREFIX}/pricing`, icon: 'sell', keywords: 'pricing plans coupons discounts monetization vip', perm: 'MANAGE_SETTINGS' },
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
    dropdown.className = 'hidden absolute left-0 right-0 top-full mt-1.5 rounded-lg border border-slate-200 bg-white shadow-lg z-[120] max-h-[400px] overflow-y-auto p-1.5 text-xs';
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

    let html = `<div class="px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center justify-between">
      <span>${q ? 'Matching Admin Screens' : 'Quick Jump (Ctrl/Cmd + K)'}</span>
      <span class="text-[10px] font-normal opacity-75">Esc to close</span>
    </div>`;

    if (matchedDests.length === 0) {
      html += `<div class="px-3 py-2 text-on-surface-variant">No matching admin destinations.</div>`;
    } else {
      html += matchedDests.map((d, idx) => `
        <a href="${d.href}" data-cmd-item="true" data-cmd-idx="${idx}" class="wm-cmd-result-item flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 transition">
          <span class="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
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
      html += `<div class="mt-2 pt-2 border-t border-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Live Platform Records</div>`;
      if (isLoading) {
        html += `<div class="px-3 py-3 text-on-surface-variant flex items-center gap-2"><span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span> Searching templates, wishes & users...</div>`;
      } else if (liveData) {
        const { templates = [], wishes = [], users = [] } = liveData;
        if (templates.length === 0 && wishes.length === 0 && users.length === 0) {
          html += `<div class="px-3 py-2.5 text-on-surface-variant">No matching templates, wishes, or users for "${escapeAdminHtml(q)}".</div>`;
        } else {
          templates.slice(0, 3).forEach(t => {
            html += `
              <a href="${SECRET_ADMIN_PREFIX}/templates?search=${encodeURIComponent(t.name || t.id)}" data-cmd-item="true" class="wm-cmd-result-item flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 transition">
                <span class="w-7 h-7 rounded-lg bg-pink-100 dark:bg-pink-950/60 text-slate-500 flex items-center justify-center shrink-0">
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
              <a href="${SECRET_ADMIN_PREFIX}/wishes?search=${encodeURIComponent(rec)}" data-cmd-item="true" class="wm-cmd-result-item flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 transition">
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
              <a href="${SECRET_ADMIN_PREFIX}/users?search=${encodeURIComponent(u.email || label)}" data-cmd-item="true" class="wm-cmd-result-item flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 transition">
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

function toggleAdminProfileMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('wm-admin-profile-dropdown');
  const cmd = document.getElementById('wm-global-command-dropdown');
  if (cmd) cmd.classList.add('hidden');
  if (menu) menu.classList.toggle('hidden');
}
window.toggleAdminProfileMenu = toggleAdminProfileMenu;

document.addEventListener('click', (e) => {
  const menu = document.getElementById('wm-admin-profile-dropdown');
  const cmd = document.getElementById('wm-global-command-dropdown');
  if (menu && !e.target.closest('#wm-admin-profile-dropdown')) menu.classList.add('hidden');
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

  // Universal Live Sync Dispatcher across all 23 Admin Studio sections
  window.triggerAdminLiveSync = async function triggerAdminLiveSync(force = true, options = {}) {
    if (window.__wmLiveSyncRunning) return;
    const isManualClick = Boolean(options && options.showToastFeedback);
    if (!isManualClick && typeof window.canRunBackgroundAdminSync === 'function' && !window.canRunBackgroundAdminSync(options)) {
      return;
    }
    window.__wmLiveSyncRunning = true;
    const syncIcon = document.getElementById('wm-header-live-sync-icon');
    if (syncIcon) {
      syncIcon.style.transition = 'transform 0.6s linear';
      syncIcon.style.transform = 'rotate(360deg)';
    }

    try {
      if (force && typeof window.clearAdminApiCache === 'function') {
        window.clearAdminApiCache();
      }
      window.__wmBypassFastCache = true;

      const tasks = [];
      const callIfFn = (fnName, ...args) => {
        if (typeof window[fnName] === 'function') {
          try {
            const res = window[fnName](...args);
            if (res && typeof res.then === 'function') tasks.push(res.catch(() => {}));
          } catch (_) {}
        }
      };

      const p = window.location.pathname.toLowerCase();
      if (p.includes('overview') || p.endsWith('/admin') || p.endsWith('/admin/') || p.endsWith('admin.html') || p.endsWith('admin-overview.html')) {
        callIfFn('loadDashboard');
      }
      if (p.includes('templates') && !p.includes('add-template')) {
        callIfFn('loadDynamicTemplates');
      }
      if (p.includes('festivals') || p.includes('festival-scheduler')) {
        callIfFn('loadFestivalSchedulerData');
      }
      if (p.includes('occasions')) {
        callIfFn('loadOccasionsData');
      }
      if (p.includes('media') || p.includes('music')) {
        callIfFn('loadAllMedia');
      }
      if (p.includes('wishes') || p.includes('expiring')) {
        callIfFn('loadWishes');
      }
      if (p.includes('analytics')) {
        callIfFn('loadAllAnalytics');
      }
      if (p.includes('users')) {
        callIfFn('loadUsers');
      }
      if (p.includes('pricing')) {
        callIfFn('loadPricingMetrics');
        callIfFn('loadServerCoupons');
        callIfFn('loadWishLinkSettings');
      }
      if (p.includes('orders')) {
        callIfFn('loadOrdersData');
      }
      if (p.includes('settings')) {
        callIfFn('loadSiteSettings');
        callIfFn('loadWishLinkSettings');
      }

      if (tasks.length > 0) {
        await Promise.allSettled(tasks);
      }

      if (options.showToastFeedback && typeof window.showToast === 'function') {
        window.showToast('✅ Live data synced with server!', 'success');
      }
    } finally {
      window.__wmBypassFastCache = false;
      window.__wmLiveSyncRunning = false;
      if (syncIcon) {
        setTimeout(() => {
          syncIcon.style.transition = 'none';
          syncIcon.style.transform = 'rotate(0deg)';
        }, 620);
      }
    }
  };

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
    initAdminNavigationAndNotifications();
  });
} else {
  initAdminNavigationAndNotifications();
}

function updateThemeIcons() {
  document.querySelectorAll('.wm-theme-pill-btn, #clay-theme-toggle-btn, #theme-toggle-btn, button[onclick*="toggleAdminTheme"], button[onclick*="toggleSiteTheme"], button[onclick*="toggleTheme"]').forEach(btn => {
    btn.remove();
  });
}

function applyThemePreference() {
  document.documentElement.classList.remove('dark');
  if (document.body) document.body.classList.remove('dark');
  try {
    localStorage.setItem('wishmagic_admin_theme_v2', 'light');
    localStorage.setItem('wishmagic_admin_theme', 'light');
    let metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme && document.head) {
      metaTheme = document.createElement('meta');
      metaTheme.name = 'theme-color';
      document.head.appendChild(metaTheme);
    }
    if (metaTheme) {
      metaTheme.setAttribute('content', '#0f172a');
    }
  } catch (_) {}
  updateThemeIcons();
}

function setTheme() {
  applyThemePreference('light');
}
window.setTheme = setTheme;

(function initTheme() {
  document.documentElement.classList.remove('dark');
  try {
    localStorage.setItem('wishmagic_admin_theme_v2', 'light');
    localStorage.setItem('wishmagic_admin_theme', 'light');
  } catch (_) {}
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => updateThemeIcons());
  } else {
    updateThemeIcons();
  }
})();

function toggleAdminTheme() {
  applyThemePreference('light');
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
      setTimeout(() => {
        const activeLink = sidebar.querySelector('nav a.wm-nav-active, nav a.active');
        const scroller = sidebar.querySelector(".wm-sidebar-scroll, .custom-scrollbar");
        if (activeLink && scroller) {
          const topOffset = activeLink.offsetTop - Math.max(60, scroller.clientHeight / 3);
          scroller.scrollTo({ top: Math.max(0, topOffset), behavior: 'smooth' });
        }
      }, 60);
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
  let bgHex = '#0f172a';
  let borderHex = '#334155';
  let iconHex = '#22c55e';

  if (resolvedType === 'success') {
    icon = 'check_circle';
    bgHex = '#0f172a';
    borderHex = '#334155';
    iconHex = '#22c55e';
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

// ============================================================================
// 5. ADMIN PWA ENGINE, SERVICE WORKER, MOBILE KEYBOARD & TOUCH UX (Phases 3-7)
// ============================================================================
(function initWishMagicAdminPwaAndMobileUx() {
  if (typeof window === 'undefined' || window.__wmAdminPwaInitialized) return;
  window.__wmAdminPwaInitialized = true;

  let swRegistration = null;
  let isRefreshingForSwUpdate = false;

  function showServiceWorkerUpdateBanner(waitingWorker) {
    if (!waitingWorker || !document.body) return;
    let banner = document.getElementById('wm-pwa-update-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'wm-pwa-update-banner';
      banner.setAttribute('role', 'status');
      banner.innerHTML = `
        <span class="material-symbols-outlined text-[18px]" style="color:#22c55e;">system_update</span>
        <span>New Admin Studio version ready</span>
        <button type="button" class="wm-pwa-update-now" id="wm-pwa-apply-update-btn">Update Now</button>
        <button type="button" style="background:transparent;border:none;color:#96aba0;cursor:pointer;padding:2px;" onclick="this.parentElement.remove()" aria-label="Dismiss">✕</button>
      `;
      document.body.appendChild(banner);
    }
    const applyBtn = document.getElementById('wm-pwa-apply-update-btn');
    if (applyBtn) {
      applyBtn.onclick = () => {
        try {
          waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        } catch (_) {
          window.location.reload();
        }
      };
    }
  }

  function registerAdminServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isSecure) return;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (isRefreshingForSwUpdate) return;
      isRefreshingForSwUpdate = true;
      if (typeof window.clearAdminApiCache === 'function') window.clearAdminApiCache();
      window.location.reload();
    });

    navigator.serviceWorker.register('/wm-admin-sw.js', { scope: '/' })
      .then((reg) => {
        swRegistration = reg;
        if (reg.waiting) {
          showServiceWorkerUpdateBanner(reg.waiting);
        }
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showServiceWorkerUpdateBanner(newWorker);
            }
          });
        });

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && swRegistration) {
            swRegistration.update().catch(() => {});
          }
        });
      })
      .catch((err) => {
        console.warn('[AdminPWA] Service Worker registration note:', err);
      });
  }

  function initNetworkStatusMonitor() {
    function getOrCreateNetBar() {
      let bar = document.getElementById('wm-network-status-bar');
      if (!bar && document.body) {
        bar = document.createElement('div');
        bar.id = 'wm-network-status-bar';
        bar.setAttribute('role', 'status');
        bar.setAttribute('aria-live', 'polite');
        document.body.appendChild(bar);
      }
      return bar;
    }

    window.addEventListener('offline', () => {
      const bar = getOrCreateNetBar();
      if (bar) {
        bar.className = 'offline';
        bar.innerHTML = `<span class="material-symbols-outlined text-[16px]">wifi_off</span><span>You are offline — Live D1 & Cloud changes will resume once connected.</span>`;
      }
    });

    window.addEventListener('online', () => {
      const bar = getOrCreateNetBar();
      if (bar) {
        bar.className = 'online-restored';
        bar.innerHTML = `<span class="material-symbols-outlined text-[16px]">wifi</span><span>Back online — Syncing latest Admin Studio data...</span>`;
        setTimeout(() => {
          if (bar.classList.contains('online-restored')) {
            bar.className = '';
          }
        }, 3200);
      }
      if (typeof window.clearAdminApiCache === 'function') window.clearAdminApiCache();
      if (typeof window.triggerAdminLiveSync === 'function') {
        window.triggerAdminLiveSync(true, { showToastFeedback: true });
      }
    });
  }

  function initMobileKeyboardViewportHelper() {
    if (!window.visualViewport) return;
    const vv = window.visualViewport;
    const updateKeyboardState = () => {
      if (window.innerWidth >= 768) {
        document.body.classList.remove('wm-keyboard-open');
        document.documentElement.style.removeProperty('--wm-kb-height');
        return;
      }
      const kbHeight = Math.max(0, Math.round(window.innerHeight - vv.height));
      const isKbOpen = kbHeight > 130;
      document.body.classList.toggle('wm-keyboard-open', isKbOpen);
      document.documentElement.style.setProperty('--wm-kb-height', `${kbHeight}px`);
      document.documentElement.style.setProperty('--wm-vv-height', `${Math.round(vv.height)}px`);
    };

    vv.addEventListener('resize', updateKeyboardState, { passive: true });
    document.addEventListener('focusin', (e) => {
      if (window.innerWidth >= 768) return;
      const el = e.target;
      if (!el || !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      if (el.classList.contains('wm-header-search-input')) return;
      setTimeout(() => {
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_) {}
      }, 240);
    }, { passive: true });
  }

  function initMobileTouchGesturesAndTables() {
    let touchStartX = 0;
    let touchStartY = 0;

    document.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      if (window.innerWidth >= 768 || !e.changedTouches || e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
      if (dy > 60) return;

      const sidebar = document.getElementById('admin-sidebar');
      if (!sidebar) return;
      const isOpen = !sidebar.classList.contains('-translate-x-full');

      if (isOpen && dx < -55) {
        toggleSidebar(false);
      } else if (!isOpen && touchStartX < 24 && dx > 65) {
        toggleSidebar(true);
      }
    }, { passive: true });

    function wrapAdminTablesForMobile() {
      document.querySelectorAll('main table, [id*="modal"] table').forEach((tbl) => {
        const parent = tbl.parentElement;
        if (!parent) return;
        const parentCls = String(parent.className || '');
        if (!parentCls.includes('overflow-x-auto') && !parent.classList.contains('wm-table-scroll-wrap')) {
          parent.classList.add('overflow-x-auto', 'wm-table-scroll-wrap');
        }
      });
    }
    wrapAdminTablesForMobile();

    document.addEventListener('click', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if ((href.startsWith('/w/') || href.startsWith('/wish/') || href.startsWith('/template/')) && !a.getAttribute('target')) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
      }
    });
  }

  function initAdminDoubleSubmitProtection() {
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (!form || form.tagName !== 'FORM') return;
      const now = Date.now();
      const lastSubmitTs = Number(form.dataset.wmLastSubmitTs || 0);
      if (now - lastSubmitTs < 1200) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      form.dataset.wmLastSubmitTs = String(now);
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      registerAdminServiceWorker();
      initNetworkStatusMonitor();
      initMobileKeyboardViewportHelper();
      initMobileTouchGesturesAndTables();
      initAdminDoubleSubmitProtection();
    });
  } else {
    registerAdminServiceWorker();
    initNetworkStatusMonitor();
    initMobileKeyboardViewportHelper();
    initMobileTouchGesturesAndTables();
    initAdminDoubleSubmitProtection();
  }
})();
