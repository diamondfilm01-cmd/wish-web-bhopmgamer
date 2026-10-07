// WishMagic Centralized Authentication & User Architecture Service
// Single Authoritative Client Auth Bootstrap Engine

(function(window) {
  'use strict';

  const STORAGE_KEY_USER = 'wishmagic_auth_user';

  const IS_ADMIN_STUDIO =
    typeof window !== 'undefined' &&
    (
      window.location.pathname.startsWith('/admin/anktech/anktech/admin/')
      ||
      window.location.pathname === '/admin/anktech/anktech/admin'
    );

  // Authoritative Client Auth States
  const AUTH_STATE = Object.freeze({
    BOOTING: 'BOOTING',
    AUTHENTICATED: 'AUTHENTICATED',
    UNAUTHENTICATED: 'UNAUTHENTICATED',
    ERROR: 'ERROR'
  });

  let authState = AUTH_STATE.BOOTING;
  let currentUser = null;
  let authInitialized = false;
  let authBootstrapPromise = null;
  let inFlightSessionPromise = null;
  let inFlightSignInPromise = null;
  const authListeners = new Set();

  let authReadyResolve = null;
  const authReadyPromise = new Promise(resolve => {
    authReadyResolve = resolve;
  });

  // Non-authoritative UI cache helpers (Updated ONLY after real authentication)
  function persistUserCache(user) {
    if (!user) return;
    try {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      localStorage.setItem('wishmagic_user', JSON.stringify(user));
    } catch (_) {}
  }

  function clearUserCache() {
    try {
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem('wishmagic_user');
    } catch (_) {}
  }

  // Single authoritative transition controller
  function setAuthState(state, user = null) {
    authState = state;
    currentUser = user;

    if (state === AUTH_STATE.AUTHENTICATED && user) {
      persistUserCache(user);
    } else if (state === AUTH_STATE.UNAUTHENTICATED || state === AUTH_STATE.ERROR) {
      clearUserCache();
    }

    notifyAuthChange();

    if (state !== AUTH_STATE.BOOTING && authReadyResolve) {
      authReadyResolve(user);
      authReadyResolve = null;
    }
  }

  function notifyAuthChange() {
    authListeners.forEach(fn => {
      try {
        fn(currentUser);
      } catch (err) {
        console.error('[WishAuth] Listener callback error:', err);
      }
    });
    renderNavbarAuthState();
  }

  // Deduplicated Server Session Check
  function fetchServerSessionOnce() {
    if (inFlightSessionPromise) {
      return inFlightSessionPromise;
    }

    inFlightSessionPromise = (async () => {
      try {
        const response = await fetch('/api/auth/session', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Accept': 'application/json'
          }
        });

        const data = await response.json().catch(() => ({}));
        if (
          response.ok &&
          data?.success === true &&
          data?.isAuthenticated === true &&
          data?.user
        ) {
          return data.user;
        }

        return null;
      } catch (error) {
        return null;
      } finally {
        inFlightSessionPromise = null;
      }
    })();

    return inFlightSessionPromise;
  }

  // Deduplicated Server Sign-In Mutation
  function syncSessionWithServer(fbUser, fallbackDisplayName = '') {
    if (!fbUser) {
      return Promise.reject(new Error('Firebase user is missing.'));
    }

    if (inFlightSignInPromise) {
      return inFlightSignInPromise;
    }

    const email = (fbUser.email || '').trim().toLowerCase();
    const displayName = (
      fbUser.displayName ||
      fallbackDisplayName ||
      (email ? email.split('@')[0] : 'Creator')
    ).trim();

    const avatarUrl =
      fbUser.photoURL ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
        email || 'creator'
      )}`;

    inFlightSignInPromise = (async () => {
      try {
        let idToken = null;
        if (typeof fbUser.getIdToken === 'function') {
          try {
            idToken = await fbUser.getIdToken();
          } catch (tErr) {
            console.warn('[WishAuth] getIdToken note:', tErr);
          }
        }

        const headers = {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        };
        if (idToken) {
          headers['Authorization'] = `Bearer ${idToken}`;
        }

        const response = await fetch('/api/auth/signin', {
          method: 'POST',
          headers,
          credentials: 'include',
          cache: 'no-store',
          body: JSON.stringify({
            email,
            displayName,
            avatarUrl,
            provider: fbUser.providerData?.[0]?.providerId || 'google',
            firebaseUid: fbUser.uid,
            idToken: idToken || undefined
          })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.success !== true || !data?.user) {
          const errMsg =
            data?.error?.message ||
            data?.message ||
            'Server authentication failed. Please try again.';
          throw new Error(errMsg);
        }

        return data.user;
      } finally {
        inFlightSignInPromise = null;
      }
    })();

    return inFlightSignInPromise;
  }

  // Ensure WishFirebaseAuth module is ready
  function ensureFirebaseAuth() {
    if (window.WishFirebaseAuth) {
      if (typeof window.WishFirebaseAuth.ready === 'function') {
        return window.WishFirebaseAuth.ready().then(() => window.WishFirebaseAuth).catch(() => window.WishFirebaseAuth);
      }
      return Promise.resolve(window.WishFirebaseAuth);
    }
    return new Promise((resolve) => {
      let existing = document.querySelector('script[src*="firebase-auth.js"]');
      if (!existing) {
        const script = document.createElement('script');
        script.src = '/js/firebase-auth.js';
        script.async = true;
        script.onload = () => {
          if (window.WishFirebaseAuth && typeof window.WishFirebaseAuth.ready === 'function') {
            window.WishFirebaseAuth.ready().then(() => resolve(window.WishFirebaseAuth)).catch(() => resolve(window.WishFirebaseAuth));
          } else {
            resolve(window.WishFirebaseAuth || null);
          }
        };
        script.onerror = () => resolve(null);
        document.head.appendChild(script);
      } else {
        let count = 0;
        const interval = setInterval(() => {
          if (window.WishFirebaseAuth || ++count > 40) {
            clearInterval(interval);
            if (window.WishFirebaseAuth && typeof window.WishFirebaseAuth.ready === 'function') {
              window.WishFirebaseAuth.ready().then(() => resolve(window.WishFirebaseAuth)).catch(() => resolve(window.WishFirebaseAuth));
            } else {
              resolve(window.WishFirebaseAuth || null);
            }
          }
        }, 50);
      }
    });
  }

  // Single Deterministic Auth Bootstrap Engine
  async function performAuthBootstrap() {
    if (IS_ADMIN_STUDIO) {
      // Admin Studio uses window.AdminAuthController exclusively
      authState = AUTH_STATE.UNAUTHENTICATED;
      authInitialized = true;
      if (authReadyResolve) {
        authReadyResolve(null);
        authReadyResolve = null;
      }
      return null;
    }

    authState = AUTH_STATE.BOOTING;
    renderNavbarAuthState();

    try {
      // Parallel Start: Firebase initialization + existing server session check
      const firebasePromise = ensureFirebaseAuth();
      const serverPromise = fetchServerSessionOnce();

      const [firebaseAuth, serverUser] = await Promise.all([
        firebasePromise,
        serverPromise
      ]);

      // If a valid server session already exists, use it immediately
      if (serverUser) {
        setAuthState(AUTH_STATE.AUTHENTICATED, serverUser);

        // Firebase continues warming in the background
        if (
          firebaseAuth &&
          typeof firebaseAuth.onAuthStateChanged === 'function'
        ) {
          firebaseAuth.onAuthStateChanged(async (firebaseUser) => {
            // NEVER clear server session just because Firebase temporarily emits null
            if (!firebaseUser) {
              return;
            }
          });
        }

        return serverUser;
      }

      // No server session. Wait for Firebase authoritative initial state.
      if (
        !firebaseAuth ||
        typeof firebaseAuth.onAuthStateChanged !== 'function'
      ) {
        setAuthState(AUTH_STATE.UNAUTHENTICATED, null);
        return null;
      }

      return await new Promise((resolve) => {
        let firstEvent = true;

        const unsubscribe = firebaseAuth.onAuthStateChanged(async (firebaseUser) => {
          if (!firstEvent) {
            return;
          }
          firstEvent = false;

          if (!firebaseUser) {
            setAuthState(AUTH_STATE.UNAUTHENTICATED, null);
            try { unsubscribe(); } catch (_) {}
            resolve(null);
            return;
          }

          try {
            // Firebase says user is authenticated: create server session
            const syncedUser = await syncSessionWithServer(
              firebaseUser,
              firebaseUser.displayName || ''
            );

            if (!syncedUser) {
              throw new Error('Server authentication did not return a user.');
            }

            // Verify with server session
            const verifiedUser = (await fetchServerSessionOnce()) || syncedUser;
            setAuthState(AUTH_STATE.AUTHENTICATED, verifiedUser);
            resolve(verifiedUser);
          } catch (error) {
            console.error('[WishAuth] Firebase → server session sync failed:', error);
            setAuthState(AUTH_STATE.ERROR, null);
            resolve(null);
          }
        });
      });
    } catch (err) {
      console.warn('[WishAuth] Bootstrap failed:', err);
      setAuthState(AUTH_STATE.ERROR, null);
      return null;
    } finally {
      authInitialized = true;
    }
  }

  function initAuth() {
    if (authBootstrapPromise) {
      return authBootstrapPromise;
    }
    authBootstrapPromise = performAuthBootstrap();
    return authBootstrapPromise;
  }

  // Centralized Auth Service API
  const WishAuth = {
    getAuthState() {
      return authState;
    },

    getCurrentUser() {
      return currentUser ? { ...currentUser } : null;
    },

    getSession() {
      return currentUser ? { userId: currentUser.id, authenticated: true, user: { ...currentUser } } : null;
    },

    isAuthenticated() {
      if (IS_ADMIN_STUDIO) {
        return Boolean(
          window.WishMagicAdminSession &&
          window.WishMagicAdminSession.authenticated === true
        );
      }

      return (
        authState === AUTH_STATE.AUTHENTICATED &&
        currentUser !== null &&
        Boolean(currentUser.id)
      );
    },

    async waitForAuthReady(timeoutMs = 5000) {
      if (authState !== AUTH_STATE.BOOTING) {
        return currentUser;
      }
      return Promise.race([
        authReadyPromise,
        new Promise(resolve => setTimeout(() => resolve(currentUser), timeoutMs))
      ]);
    },

    requireAdmin(options = {}) {
      const containerId =
        options.containerId || 'admin-main-content';

      const container =
        document.getElementById(containerId);

      const session =
        window.WishMagicAdminSession;

      const user =
        session?.user || null;

      const allowed =
        session?.authenticated === true &&
        user &&
        (
          user.role === 'admin' ||
          user.role === 'OWNER' ||
          user.role === 'SUPER_ADMIN' ||
          user.isAdmin === true
        );

      if (!allowed) {
        if (container) {
          container.innerHTML = `
            <div class="min-h-[50vh] flex items-center justify-center p-8">
              <div class="text-center max-w-md">
                <div class="text-4xl mb-4">🔒</div>
                <h2 class="text-xl font-bold">
                  Admin Session Required
                </h2>
                <p class="text-sm opacity-70 mt-2">
                  Please complete Admin authentication first.
                </p>
              </div>
            </div>
          `;
        }

        return false;
      }

      return true;
    },

    isCheckingSession() {
      return isCheckingSession;
    },

    async waitForAuthReady(timeoutMs = 4000) {
      if (!isCheckingSession) return currentUser;
      const start = Date.now();
      while (isCheckingSession && (Date.now() - start < timeoutMs)) {
        await new Promise(r => setTimeout(r, 50));
      }
      return currentUser;
    },

    /**
     * Authoritatively check if currently signed-in user has Admin privileges
     */
    isAdmin() {
      if (!currentUser) return false;
      return Boolean(currentUser.role === 'admin' || currentUser.isAdmin === true);
    },

    /**
     * Hydrate active session from server if available without breaking static hosts
     */
    async hydrateSessionFromServer() {
      try {
        const user = await fetchServerSessionOnce();
        if (user) {
          setAuthState(AUTH_STATE.AUTHENTICATED, user);
          return user;
        }
      } catch (e) {
        // Expected on static hosting like Cloudflare Pages
      }
      return currentUser;
    },

    onAuthStateChange(callback) {
      if (typeof callback === 'function') {
        authListeners.add(callback);
        callback(currentUser);
        return () => authListeners.delete(callback);
      }
      return () => {};
    },

    /**
     * Sign In / Sign Up with Email (Fallback direct endpoint)
     */
    async signInWithEmail(email, displayName = '') {
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        showAuthToast('Please enter a valid email address.');
        return null;
      }

      try {
        const res = await fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email: cleanEmail,
            displayName: displayName.trim() || cleanEmail.split('@')[0]
          })
        });

        const data = await res.json();
        if (res.ok && data && data.success && data.user) {
          setAuthState(AUTH_STATE.AUTHENTICATED, data.user);
          showAuthToast(`Welcome back, ${data.user.displayName}! ✨`);
          return data.user;
        } else {
          showAuthToast((data && data.message) || 'Sign in failed. Please try again.');
          return null;
        }
      } catch (err) {
        console.error('[WishAuth] Sign in error:', err);
        showAuthToast('Network error during sign in.');
        return null;
      }
    },

    /**
     * Firebase Google Authentication (Official Popup)
     */
    async signInWithGoogle() {
      await ensureFirebaseAuth();
      if (!window.WishFirebaseAuth) {
        showAuthToast('Initializing Firebase authentication, please try again in a moment.');
        return null;
      }

      showAuthToast('Opening Google Sign-In... 🪄');
      try {
        const fbUser = await window.WishFirebaseAuth.signInWithGoogle();
        if (fbUser) {
          const serverUser = await syncSessionWithServer(fbUser);
          if (serverUser) {
            setAuthState(AUTH_STATE.AUTHENTICATED, serverUser);
            showAuthToast(`Welcome, ${serverUser.displayName}! ✨`);
            if (typeof window.closeAuthModal === 'function') window.closeAuthModal();
            return serverUser;
          }
        }
      } catch (err) {
        console.error('[WishAuth] Google sign-in failed:', err);
        showAuthToast(err.message || 'Google sign-in was not completed.');
        return null;
      }
    },

    /**
     * Firebase Email + Password Sign In (with Server Proxy Fallback for Iframe/Domain Safety)
     */
    async signInWithEmailPassword(email, password) {
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        showAuthToast('Please enter a valid email address.');
        return null;
      }
      if (!password) {
        showAuthToast('Please enter your password.');
        return null;
      }

      await ensureFirebaseAuth();

      // 1. Try client SDK if available
      if (window.WishFirebaseAuth && typeof window.WishFirebaseAuth.signInWithEmailPassword === 'function') {
        try {
          const fbUser = await window.WishFirebaseAuth.signInWithEmailPassword(cleanEmail, password);
          if (fbUser) {
            const serverUser = await syncSessionWithServer(fbUser);
            if (serverUser) {
              setAuthState(AUTH_STATE.AUTHENTICATED, serverUser);
              showAuthToast(`Welcome back, ${serverUser.displayName}! ✨`);
              if (typeof window.closeAuthModal === 'function') window.closeAuthModal();
              return serverUser;
            }
          }
        } catch (clientErr) {
          console.warn('[WishAuth] Client SDK sign-in notice, falling back to server verification:', clientErr.message);
          // If explicitly wrong credentials from Firebase, report directly
          if (clientErr.message && (clientErr.message.includes('Incorrect') || clientErr.message.includes('password') || clientErr.message.includes('not found') || clientErr.message.includes('invalid-credential'))) {
            showAuthToast(clientErr.message);
            throw clientErr;
          }
        }
      }

      // 2. Authoritative Server Identity Toolkit Proxy
      try {
        const res = await fetch('/api/auth/email-signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: cleanEmail, password })
        });

        const data = await res.json();
        if (res.ok && data && data.success && data.user) {
          setAuthState(AUTH_STATE.AUTHENTICATED, data.user);
          showAuthToast(`Welcome back, ${data.user.displayName}! ✨`);
          if (typeof window.closeAuthModal === 'function') window.closeAuthModal();
          return data.user;
        } else {
          const errMsg = data.error?.message || data.message || 'Incorrect email or password.';
          showAuthToast(errMsg);
          throw new Error(errMsg);
        }
      } catch (err) {
        console.error('[WishAuth] Server email sign-in error:', err);
        showAuthToast(err.message || 'Incorrect email or password. Please verify and try again.');
        throw err;
      }
    },

    /**
     * Firebase Email + Password Sign Up (with Server Proxy Fallback)
     */
    async signUpWithEmailPassword(email, password, displayName = '') {
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        showAuthToast('Please enter a valid email address.');
        return null;
      }
      if (!password || password.length < 6) {
        showAuthToast('Password must be at least 6 characters.');
        return null;
      }

      await ensureFirebaseAuth();

      // 1. Try client SDK if available
      if (window.WishFirebaseAuth && typeof window.WishFirebaseAuth.signUpWithEmailPassword === 'function') {
        try {
          const fbUser = await window.WishFirebaseAuth.signUpWithEmailPassword(cleanEmail, password, displayName);
          if (fbUser) {
            const serverUser = await syncSessionWithServer(fbUser, displayName);
            setAuthState(AUTH_STATE.AUTHENTICATED, serverUser);
            showAuthToast(`Account created! Welcome, ${serverUser.displayName}! ✨`);
            if (typeof window.closeAuthModal === 'function') window.closeAuthModal();
            return serverUser;
          }
        } catch (clientErr) {
          console.warn('[WishAuth] Client SDK sign-up notice, falling back to server:', clientErr.message);
          if (clientErr.message && (clientErr.message.includes('already exists') || clientErr.message.includes('already in use'))) {
            showAuthToast(clientErr.message);
            throw clientErr;
          }
        }
      }

      // 2. Server Identity Toolkit Proxy
      try {
        const res = await fetch('/api/auth/email-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: cleanEmail, password, displayName })
        });

        const data = await res.json();
        if (res.ok && data && data.success && data.user) {
          if (data.token) {
            try {
              localStorage.setItem('wishmagic_auth_token', data.token);
              document.cookie = `wm_session=${encodeURIComponent(data.token)}; Path=/; Max-Age=2592000; SameSite=Lax`;
            } catch (e) {}
          }
          setAuthState(AUTH_STATE.AUTHENTICATED, data.user);
          showAuthToast(`Account created! Welcome, ${data.user.displayName}! ✨`);
          if (typeof window.closeAuthModal === 'function') window.closeAuthModal();
          return data.user;
        } else {
          const errMsg = data.error?.message || data.message || 'Sign up could not be completed.';
          showAuthToast(errMsg);
          throw new Error(errMsg);
        }
      } catch (err) {
        console.error('[WishAuth] Server sign up error:', err);
        showAuthToast(err.message || 'Failed to create account. Please try again.');
        throw err;
      }
    },

    /**
     * Firebase Password Reset Email
     */
    async sendPasswordReset(email) {
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        showAuthToast('Please enter a valid email address.');
        return false;
      }

      await ensureFirebaseAuth();

      if (window.WishFirebaseAuth && typeof window.WishFirebaseAuth.sendPasswordReset === 'function') {
        try {
          await window.WishFirebaseAuth.sendPasswordReset(cleanEmail);
          showAuthToast(`Password reset link sent to ${cleanEmail}! ✉️`);
          return true;
        } catch (e) {}
      }

      // Fallback to server REST API
      try {
        const res = await fetch('/api/auth/send-password-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail })
        });
        const data = await res.json();
        if (res.ok && data && data.success) {
          showAuthToast(`Password reset link sent to ${cleanEmail}! Please check your inbox. ✉️`);
          return true;
        } else {
          showAuthToast(data.error?.message || data.message || 'Could not send reset email.');
          return false;
        }
      } catch (err) {
        showAuthToast('Failed to send reset email. Please verify the address.');
        return false;
      }
    },

    /**
     * OAuth Sign In Handler
     */
    signInWithOAuth(provider = 'Google') {
      if (provider === 'Google') {
        return this.signInWithGoogle();
      }
      showAuthToast(`${provider} sign-in is not supported in this project. Please continue with Google or Email.`);
    },

    /**
     * Update Current User Profile (Display Name & Avatar)
     */
    async updateProfile(updates = {}) {
      if (!currentUser) {
        const cached = localStorage.getItem(STORAGE_KEY_USER) || localStorage.getItem('wishmagic_user');
        if (cached) {
          try { currentUser = JSON.parse(cached); } catch (_) {}
        }
      }
      if (!currentUser) return null;

      const newName = updates.displayName !== undefined ? updates.displayName.trim() : currentUser.displayName;
      const newAvatar = updates.avatarUrl !== undefined ? updates.avatarUrl.trim() : currentUser.avatarUrl;

      const headers = { 'Content-Type': 'application/json' };
      if (window.WishFirebaseAuth && typeof window.WishFirebaseAuth.getIdToken === 'function') {
        const idToken = await window.WishFirebaseAuth.getIdToken().catch(() => null);
        if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
      }

      try {
        const res = await fetch('/api/users/me', {
          method: 'PUT',
          headers,
          credentials: 'include',
          body: JSON.stringify({ displayName: newName, avatarUrl: newAvatar })
        });
        const data = await res.json().catch(() => ({}));
        const returnedUser = data?.data?.user || data?.user;
        if (res.ok && data && (data.success || returnedUser) && returnedUser) {
          const merged = { ...currentUser, ...returnedUser, displayName: newName, avatarUrl: newAvatar };
          setAuthState(AUTH_STATE.AUTHENTICATED, merged);
          return merged;
        }
      } catch (e) {
        console.warn('[WishAuth] Profile update error:', e);
      }

      const updated = { ...currentUser, displayName: newName, avatarUrl: newAvatar };
      setAuthState(AUTH_STATE.AUTHENTICATED, updated);
      return updated;
    },

    /**
     * Sign Out
     */
    async signOut() {
      try {
        await fetch('/api/auth/signout', {
          method: 'POST',
          credentials: 'include'
        });
      } catch (e) {}

      if (window.WishFirebaseAuth) {
        try {
          await window.WishFirebaseAuth.signOut();
        } catch (_) {}
      }

      setAuthState(AUTH_STATE.UNAUTHENTICATED, null);
      showAuthToast('Signed out successfully.');
    }
  };

  // ---------------------------------------------------------------------------
  // NAVBAR AUTH STATE RENDERER
  // Deterministic rendering based strictly on authState
  // ---------------------------------------------------------------------------
  function renderNeutralAuthPlaceholder(container) {
    container.innerHTML = `
      <div id="auth-ui" data-auth-state="booting" class="h-8 w-8 rounded-full bg-purple-500/10 border border-purple-500/15 flex items-center justify-center animate-pulse" aria-hidden="true">
        <span class="inline-block w-2 h-2 rounded-full bg-purple-400/40"></span>
      </div>
    `;
  }

  function renderLoginButton(container) {
    container.innerHTML = `
      <div class="flex items-center gap-1.5 sm:gap-2">
        <button onclick="window.openAuthModal()" class="px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs font-bold text-white bg-gradient-to-r from-[#EC4899] to-[#7C3AED] hover:brightness-110 shadow-sm hover:scale-105 active:scale-95 transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap">
          <span class="material-symbols-outlined text-[16px]">account_circle</span>
          <span class="hidden xs:inline">Sign In</span>
        </button>
      </div>
    `;
  }

  function renderNavbarAuthState() {
    const navContainers = document.querySelectorAll('.navbar-auth-container, .nav-auth-container, [data-purpose="navbar-auth"], [data-auth-container]');
    if (!navContainers || navContainers.length === 0) return;

    if (authState === AUTH_STATE.BOOTING) {
      navContainers.forEach(container => renderNeutralAuthPlaceholder(container));
      return;
    }

    if (authState === AUTH_STATE.UNAUTHENTICATED || authState === AUTH_STATE.ERROR) {
      navContainers.forEach(container => renderLoginButton(container));
      return;
    }

    if (authState === AUTH_STATE.AUTHENTICATED && currentUser) {
      const user = currentUser;
      const isDark = typeof document !== 'undefined' && (document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark');
      const initials = (user.displayName || user.email || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      const avatarContent = user.avatarUrl
        ? `<img src="${user.avatarUrl}" alt="${user.displayName || 'User'}" class="w-full h-full object-cover rounded-full"/>`
        : `<div class="w-full h-full bg-gradient-to-tr from-pink-500 to-purple-600 text-white flex items-center justify-center font-bold text-xs uppercase">${initials}</div>`;

      const isUserMaster = user.role === 'admin' || user.isAdmin === true || (window.WishFirebaseAuth?.isAdminEmail && window.WishFirebaseAuth.isAdminEmail(user.email)) || (user.email && user.email.toLowerCase() === 'ankit.babusaini@gmail.com');

      navContainers.forEach(container => {
        container.innerHTML = `
          <div class="relative inline-block flex-shrink-0" id="account-dropdown-wrapper">
            <!-- Profile Avatar Only Button (Compact & Sleek) -->
            <button onclick="window.toggleAccountMenu(event)" class="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full ring-2 ring-purple-300/80 dark:ring-purple-600/80 hover:ring-pink-500 hover:scale-105 transition-all cursor-pointer active:scale-95 shadow-sm overflow-hidden flex items-center justify-center p-0 focus:outline-none" title="${user.displayName || user.email || 'Profile & Settings'}" aria-label="User Profile Menu">
              ${avatarContent}
            </button>

            <!-- 100% Solid Non-Transparent Dropdown Menu (Zero Blur / Zero Transparency) -->
            <div id="account-dropdown-menu" class="hidden absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-20px)] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.55),0_0_25px_rgba(124,58,237,0.3)] p-2.5 z-[9999999] text-left border-2" style="background-color: ${isDark ? '#150927' : '#ffffff'} !important; background: ${isDark ? '#150927' : '#ffffff'} !important; border-color: ${isDark ? '#7e22ce' : '#ddd6fe'} !important; color: ${isDark ? '#f3e8ff' : '#0f172a'} !important; opacity: 1 !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important;">
              
              <!-- User Profile Header Card (Clickable to open profile settings) -->
              <a href="/account" class="block px-3 py-2.5 rounded-xl mb-1.5 border transition cursor-pointer hover:brightness-105 active:scale-98" style="background-color: ${isDark ? '#231042' : '#f5f3ff'} !important; background: ${isDark ? '#231042' : '#f5f3ff'} !important; border-color: ${isDark ? '#6b21a8' : '#e9d5ff'} !important;">
                <div class="flex items-center gap-2.5">
                  <div class="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 border border-pink-400">
                    ${avatarContent}
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="font-extrabold text-xs truncate" style="color: ${isDark ? '#ffffff' : '#1e1b4b'};">${user.displayName || user.name || 'Creator Profile'}</div>
                    <div class="text-[11px] font-medium truncate mt-0.5" style="color: ${isDark ? '#d8b4fe' : '#6d28d9'};">${user.email}</div>
                  </div>
                </div>
                <div class="flex items-center justify-between mt-2 pt-1.5 border-t" style="border-color: ${isDark ? '#4c1d95' : '#e9d5ff'};">
                  <div class="flex items-center gap-1.5">
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider" style="background-color: ${user.isPremium || user.plan === 'VIP' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(168, 85, 247, 0.2)'}; color: ${user.isPremium || user.plan === 'VIP' ? '#f59e0b' : '#c084fc'}; border: 1px solid ${user.isPremium || user.plan === 'VIP' ? 'rgba(245, 158, 11, 0.5)' : 'rgba(168, 85, 247, 0.4)'};">
                      ${user.plan || 'Free'} Plan
                    </span>
                    ${user.role === 'admin' || user.isAdmin ? '<span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-xs">ADMIN</span>' : ''}
                  </div>
                  <span class="text-[10px] font-bold text-pink-500 flex items-center gap-0.5">Edit Profile →</span>
                </div>
              </a>

              <!-- Menu Items -->
              <div class="py-1 space-y-1">
                <a href="/my-wishes" class="px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition hover:bg-purple-100/70 dark:hover:bg-purple-900/50" style="color: ${isDark ? '#f3e8ff' : '#1e293b'};">
                  <span class="material-symbols-outlined text-[18px] text-pink-500">card_giftcard</span>
                  <span>My Celebration Wishes</span>
                </a>
                <a href="/account" class="px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition hover:bg-purple-100/70 dark:hover:bg-purple-900/50" style="color: ${isDark ? '#f3e8ff' : '#1e293b'};">
                  <span class="material-symbols-outlined text-[18px] text-purple-500">manage_accounts</span>
                  <span>Profile &amp; Account Settings</span>
                </a>
                <a href="/favorites" class="px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition hover:bg-purple-100/70 dark:hover:bg-purple-900/50" style="color: ${isDark ? '#f3e8ff' : '#1e293b'};">
                  <span class="material-symbols-outlined text-[18px] text-purple-500">favorite</span>
                  <span>Favorites</span>
                </a>
                ${isUserMaster ? `
                  <a href="/admin/anktech/anktech/admin/overview" onclick="window.handleAdminPortalClick(event)" class="px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition border cursor-pointer hover:brightness-110" style="background-color: ${isDark ? 'rgba(80, 7, 36, 0.7)' : '#fdf2f8'} !important; border-color: ${isDark ? '#db2777' : '#f472b6'} !important; color: ${isDark ? '#f472b6' : '#db2777'};">
                    <div class="flex items-center gap-2.5">
                      <span class="material-symbols-outlined text-[18px] text-pink-500">admin_panel_settings</span>
                      <span>Admin Panel</span>
                    </div>
                    <span class="px-1.5 py-0.5 rounded text-[8px] font-black bg-pink-500 text-white shadow-xs">⚡ MASTER</span>
                  </a>
                ` : ''}
              </div>

              <!-- Sign Out -->
              <div class="pt-1.5 mt-1 border-t" style="border-color: ${isDark ? '#4c1d95' : '#e9d5ff'};">
                <button onclick="WishAuth.signOut()" class="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition cursor-pointer hover:bg-rose-50 dark:hover:bg-rose-950/40" style="color: #f43f5e;">
                  <span class="material-symbols-outlined text-[18px]">logout</span>
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        `;
      });
      return;
    }

    navContainers.forEach(container => renderLoginButton(container));
  }

  // Ensure solid opaque dropdown styling across all pages
  if (typeof document !== 'undefined') {
    const styleEl = document.createElement('style');
    styleEl.id = 'account-dropdown-solid-fix';
    styleEl.textContent = `
      #account-dropdown-menu {
        background-color: #ffffff !important;
        background: #ffffff !important;
        opacity: 1 !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        border: 2px solid #ddd6fe !important;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35), 0 0 30px rgba(124, 58, 237, 0.2) !important;
        z-index: 999999 !important;
      }
      html.dark #account-dropdown-menu,
      body.dark #account-dropdown-menu,
      [data-theme="dark"] #account-dropdown-menu {
        background-color: #150927 !important;
        background: #150927 !important;
        border-color: #7e22ce !important;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85), 0 0 35px rgba(124, 58, 237, 0.4) !important;
      }
    `;
    if (!document.getElementById('account-dropdown-solid-fix')) {
      document.head.appendChild(styleEl);
    }
  }

  // Seamless Master Admin Portal navigation
  window.handleAdminPortalClick = function(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    window.location.href = '/admin/anktech/anktech/admin/overview';
  };

  // Toggle account menu open/closed with guaranteed solid non-transparent background
  window.toggleAccountMenu = function(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const menu = document.getElementById('account-dropdown-menu');
    if (!menu) return;

    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
      const isDark = document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark';
      menu.style.setProperty('background-color', isDark ? '#150927' : '#ffffff', 'important');
      menu.style.setProperty('background', isDark ? '#150927' : '#ffffff', 'important');
      menu.style.setProperty('border-color', isDark ? '#7e22ce' : '#ddd6fe', 'important');
      menu.style.setProperty('color', isDark ? '#f3e8ff' : '#0f172a', 'important');
      menu.style.setProperty('opacity', '1', 'important');
      menu.style.setProperty('backdrop-filter', 'none', 'important');
      menu.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
      menu.style.setProperty('z-index', '9999999', 'important');
      menu.classList.remove('hidden');
    } else {
      menu.classList.add('hidden');
    }
  };

  // Close menu on click outside
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('account-dropdown-wrapper');
    const menu = document.getElementById('account-dropdown-menu');
    if (menu && !menu.classList.contains('hidden') && wrapper && !wrapper.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });

  // Re-render auth state on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    setupGlobalAuthModal();
  });

  // ---------------------------------------------------------------------------
  // UNIVERSAL GOOGLE AUTH MODAL (100% PURE 1-TAP GOOGLE SIGN-IN)
  // ---------------------------------------------------------------------------
  function showUniversalAuthModal(promptMessage = null) {
    let modal = document.getElementById('wishmagic-universal-auth-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'wishmagic-universal-auth-modal';
      modal.className = 'fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 transition-all duration-300';
      document.body.appendChild(modal);
    }

    renderAuthModalContent(promptMessage);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');
  }

  window.openAuthModal = showUniversalAuthModal;
  window._openWishAuthModal = showUniversalAuthModal;
  WishAuth.openAuthModal = showUniversalAuthModal;

  window.openProfileSettings = function() {
    window.location.href = '/account';
  };
  window.openAccountSettings = function() {
    window.location.href = '/account';
  };
  WishAuth.openProfileSettings = window.openProfileSettings;
  WishAuth.openAccountSettings = window.openAccountSettings;

  function renderAuthModalContent(promptMessage = null) {
    const modal = document.getElementById('wishmagic-universal-auth-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="bg-white dark:bg-[#150927] rounded-3xl max-w-sm w-full p-6 sm:p-7 shadow-2xl relative border border-purple-200/80 dark:border-purple-800 text-center animate-scaleUp overflow-hidden flex flex-col">
        <!-- Close Button -->
        <button class="absolute top-4 right-4 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/70 text-purple-700 dark:text-purple-300 hover:text-black dark:hover:text-white flex items-center justify-center font-bold transition cursor-pointer z-10" onclick="closeAuthModal()" aria-label="Close">
          ✕
        </button>

        <div class="overflow-y-auto pr-1">
          <!-- Header Icon & Title -->
          <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pink-500 via-purple-600 to-amber-300 text-white flex items-center justify-center mx-auto text-2xl mb-3 shadow-lg shadow-pink-500/25">
            🪄
          </div>

          <h3 class="font-display font-extrabold text-xl sm:text-2xl text-purple-950 dark:text-white">Sign In to WishMagic</h3>
          <p class="text-xs text-purple-800/80 dark:text-purple-300/80 mt-1 mb-5 leading-relaxed">
            ${promptMessage || 'Continue with your Google account to create, publish, and save your magical celebration websites.'}
          </p>

          <!-- Google Continue Button (1-Tap Auth) -->
          <div class="mb-4">
            <button type="button" id="auth-google-btn" onclick="handleGoogleSignInClick()" class="w-full py-3.5 px-4 rounded-2xl bg-white dark:bg-purple-950/70 hover:bg-purple-50 dark:hover:bg-purple-900/60 border-2 border-purple-200 dark:border-purple-700/80 text-xs sm:text-sm font-bold text-gray-800 dark:text-white flex items-center justify-center gap-3 transition-all shadow-sm hover:shadow-md active:scale-[0.99] cursor-pointer">
              <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span id="auth-google-btn-text">Continue with Google (Gmail)</span>
            </button>
          </div>

          <!-- Dynamic Error message -->
          <div id="auth-modal-error" class="hidden text-xs font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950/50 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-center mb-3"></div>

          <div class="pt-3 border-t border-purple-100 dark:border-purple-900 text-center">
            <div class="inline-flex items-center gap-1.5 text-[11px] font-medium text-purple-600/80 dark:text-purple-400/80">
              <span class="material-symbols-outlined text-[13px]">lock</span>
              <span>1-Tap secure login with Google</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  window.closeAuthModal = function() {
    const modal = document.getElementById('wishmagic-universal-auth-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      document.body.classList.remove('overflow-hidden');
    }
    const legacyModal = document.getElementById('auth-modal');
    if (legacyModal) {
      legacyModal.classList.add('hidden');
      legacyModal.classList.remove('flex');
    }
  };
  WishAuth.closeAuthModal = window.closeAuthModal;

  window.handleGoogleSignInClick = async function() {
    const btn = document.getElementById('auth-google-btn');
    const txt = document.getElementById('auth-google-btn-text');
    const errBox = document.getElementById('auth-modal-error');
    if (errBox) errBox.classList.add('hidden');

    if (btn) {
      btn.disabled = true;
      btn.classList.add('opacity-70');
    }
    if (txt) {
      txt.innerHTML = '<span class="inline-flex items-center gap-2"><span class="animate-spin inline-block w-3.5 h-3.5 border-2 border-purple-600 border-t-transparent rounded-full"></span> Connecting to Google...</span>';
    }

    try {
      const user = await WishAuth.signInWithGoogle();
      if (user) {
        closeAuthModal();
      }
    } catch (err) {
      if (errBox) {
        errBox.textContent = err.message || 'Google sign-in could not be completed.';
        errBox.classList.remove('hidden');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-70');
      }
      if (txt) {
        txt.textContent = 'Continue with Google';
      }
    }
  };

  function showAuthToast(msg) {
    let toast = document.getElementById('wishmagic-auth-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'wishmagic-auth-toast';
      toast.className = 'fixed top-6 right-6 z-50 transform translate-y-[-150%] opacity-0 transition-all duration-300 pointer-events-none px-4 py-2.5 rounded-2xl bg-purple-950/95 text-white text-xs font-bold shadow-2xl border border-pink-500/50 flex items-center gap-2';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.remove('translate-y-[-150%]', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
      toast.classList.remove('translate-y-0', 'opacity-100');
      toast.classList.add('translate-y-[-150%]', 'opacity-0');
    }, 3200);
  }

  function setupGlobalAuthModal() {
    const legacyOpen = window.openModal;
    if (legacyOpen) {
      window.openModal = function(id) {
        if (id === 'auth-modal') {
          showUniversalAuthModal('signin');
          return;
        }
        legacyOpen(id);
      };
    }
  }

  // Set up global modal interceptor immediately
  setupGlobalAuthModal();

  window.WishAuth = WishAuth;
  window.showAuthToast = showAuthToast;

  // Auto-start deterministic bootstrap for non-admin storefront pages
  if (typeof document !== 'undefined' && !IS_ADMIN_STUDIO) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        initAuth().catch(() => {});
      }, { once: true });
    } else {
      initAuth().catch(() => {});
    }
  }

})(window);
