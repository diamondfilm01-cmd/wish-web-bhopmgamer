// WishMagic Centralized Authentication & User Architecture Service
// Pure Firebase Google Sign-In & Strict Master Admin Dropdown Access Control

(function(window) {
  'use strict';

  const STORAGE_KEY_USER = 'wishmagic_auth_user';
  const MASTER_ADMIN_EMAIL = 'ankit.babusaini@gmail.com';

  const IS_ADMIN_STUDIO =
    typeof window !== 'undefined' &&
    (
      window.location.pathname.startsWith('/admin/anktech/anktech/admin/')
      ||
      window.location.pathname === '/admin/anktech/anktech/admin'
    );

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

  function isMasterAdminEmail(email) {
    if (!email) return false;
    return String(email).trim().toLowerCase() === MASTER_ADMIN_EMAIL;
  }

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
      localStorage.removeItem('wishmagic_last_user_email');
    } catch (_) {}
  }

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
        const user = data?.data?.user || data?.user || null;
        if (
          response.ok &&
          data?.success === true &&
          (data?.isAuthenticated === true || data?.data?.isAuthenticated === true) &&
          user
        ) {
          return user;
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
            provider: 'google',
            firebaseUid: fbUser.uid,
            idToken: idToken || undefined
          })
        });

        const data = await response.json().catch(() => ({}));
        const user = data?.user || data?.data?.user;
        if (!response.ok || data?.success !== true || !user) {
          const errMsg =
            data?.error?.message ||
            data?.message ||
            'Server authentication failed. Please try again.';
          throw new Error(errMsg);
        }

        return user;
      } finally {
        inFlightSignInPromise = null;
      }
    })();

    return inFlightSignInPromise;
  }

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

  async function performAuthBootstrap() {
    if (IS_ADMIN_STUDIO) {
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
      const firebasePromise = ensureFirebaseAuth();
      const serverPromise = fetchServerSessionOnce();

      const [firebaseAuth, serverUser] = await Promise.all([
        firebasePromise,
        serverPromise
      ]);

      if (serverUser) {
        setAuthState(AUTH_STATE.AUTHENTICATED, serverUser);
        if (firebaseAuth && typeof firebaseAuth.onAuthStateChanged === 'function') {
          firebaseAuth.onAuthStateChanged(async (firebaseUser) => {
            if (!firebaseUser) return;
          });
        }
        return serverUser;
      }

      if (!firebaseAuth || typeof firebaseAuth.onAuthStateChanged !== 'function') {
        setAuthState(AUTH_STATE.UNAUTHENTICATED, null);
        return null;
      }

      return await new Promise((resolve) => {
        let firstEvent = true;

        const unsubscribe = firebaseAuth.onAuthStateChanged(async (firebaseUser) => {
          if (!firstEvent) return;
          firstEvent = false;

          if (!firebaseUser) {
            setAuthState(AUTH_STATE.UNAUTHENTICATED, null);
            try { unsubscribe(); } catch (_) {}
            resolve(null);
            return;
          }

          try {
            const syncedUser = await syncSessionWithServer(
              firebaseUser,
              firebaseUser.displayName || ''
            );

            if (!syncedUser) {
              throw new Error('Server authentication did not return a user.');
            }

            const verifiedUser = (await fetchServerSessionOnce()) || syncedUser;
            setAuthState(AUTH_STATE.AUTHENTICATED, verifiedUser);
            resolve(verifiedUser);
          } catch (error) {
            console.error('[WishAuth] Firebase -> server session sync failed:', error);
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
          window.WishMagicAdminSession.authenticated === true &&
          window.WishMagicAdminSession.user &&
          isMasterAdminEmail(window.WishMagicAdminSession.user.email)
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
      if (IS_ADMIN_STUDIO || window.AdminAuthController) {
        return true;
      }

      const session = window.WishMagicAdminSession;
      const user = session?.user || window.__WishMagicVerifiedAdminUser || currentUser || null;
      const allowed = Boolean(user && isMasterAdminEmail(user.email));

      if (!allowed) {
        window.location.replace('/');
        return false;
      }

      return true;
    },

    isCheckingSession() {
      return authState === AUTH_STATE.BOOTING;
    },

    /**
     * Authoritatively check if currently signed-in user is the Master Admin (ankit.babusaini@gmail.com)
     */
    isAdmin() {
      if (!currentUser || !currentUser.email) return false;
      return isMasterAdminEmail(currentUser.email);
    },

    async hydrateSessionFromServer() {
      try {
        const user = await fetchServerSessionOnce();
        if (user) {
          setAuthState(AUTH_STATE.AUTHENTICATED, user);
          return user;
        }
      } catch (e) {}
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
     * Pure Firebase Google Authentication (ONLY allowed sign-in method)
     */
    async signInWithGoogle() {
      await ensureFirebaseAuth();
      if (!window.WishFirebaseAuth) {
        throw new Error('Firebase Google Authentication is initializing. Please try again.');
      }

      try {
        const fbUser = await window.WishFirebaseAuth.signInWithGoogle();
        if (fbUser) {
          const serverUser = await syncSessionWithServer(fbUser);
          if (serverUser) {
            setAuthState(AUTH_STATE.AUTHENTICATED, serverUser);
            showAuthToast(`Welcome, ${serverUser.displayName || serverUser.email}! ✨`);
            if (typeof window.closeAuthModal === 'function') window.closeAuthModal();
            // If we are on maintenance.html and signed in as Master Admin, reload or go to homepage
            if (window.location.pathname.includes('maintenance') && isMasterAdminEmail(serverUser.email)) {
              window.location.replace('/');
            }
            return serverUser;
          }
        }
        return null;
      } catch (err) {
        console.warn('[WishAuth] Firebase Google sign-in error:', err.message || err);
        throw err;
      }
    },

    /**
     * Sign out current user from both Firebase & Server Session
     */
    async signOut() {
      try {
        if (window.WishFirebaseAuth) {
          await window.WishFirebaseAuth.signOut();
        }
      } catch (e) {
        console.warn('[WishAuth] Firebase signOut notice:', e);
      }

      try {
        await fetch('/api/auth/signout', {
          method: 'POST',
          credentials: 'include'
        });
      } catch (err) {
        console.warn('[WishAuth] Server signout notice:', err);
      }

      setAuthState(AUTH_STATE.UNAUTHENTICATED, null);
      showAuthToast('Signed out of WishMagic.');

      const menu = document.getElementById('account-dropdown-menu');
      if (menu) menu.classList.add('hidden');

      const protectedPages = ['/my-wishes', '/account', '/profile', '/settings', '/favorites', '/referrals', '/notifications', '/support-tickets', '/admin'];
      if (protectedPages.some(p => window.location.pathname.startsWith(p))) {
        window.location.replace('/');
      }
    },

    requireAuth(actionLabel = 'continue') {
      if (this.isAuthenticated()) {
        return true;
      }
      showUniversalAuthModal(`Sign in with Google to ${actionLabel}`);
      return false;
    },

    getUserHeaders(extraHeaders = {}) {
      const headers = { ...extraHeaders };
      if (currentUser && currentUser.id) {
        headers['x-user-id'] = currentUser.id;
        headers['x-user-email'] = currentUser.email || '';
      }
      return headers;
    }
  };

  function renderNeutralAuthPlaceholder(container) {
    container.innerHTML = `
      <div class="h-9 w-9 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center animate-pulse" aria-hidden="true">
        <span class="inline-block w-2 h-2 rounded-full bg-purple-400/50"></span>
      </div>
    `;
  }

  function renderLoginButton(container) {
    container.innerHTML = `
      <div class="flex items-center gap-1.5 sm:gap-2">
        <button type="button" onclick="window.openAuthModal()" class="wm-nav-signin-btn px-3 sm:px-4 py-2 rounded-full text-xs font-extrabold text-white bg-gradient-to-r from-[#ff2a85] via-[#ec4899] to-[#a855f7] hover:brightness-110 shadow-[0_6px_18px_rgba(236,72,153,0.32)] hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
          <svg class="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24">
            <path fill="#ffffff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#ffffff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#ffffff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#ffffff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>Sign In</span>
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
        : `<div class="w-full h-full bg-gradient-to-tr from-[#ff2a85] via-[#ec4899] to-[#a855f7] text-white flex items-center justify-center font-extrabold text-xs uppercase">${initials}</div>`;

      // STRICT RULE: Admin Panel option in profile dropdown ONLY appears when signed in as ankit.babusaini@gmail.com
      const isStrictMasterAdmin = isMasterAdminEmail(user.email);

      navContainers.forEach(container => {
        container.innerHTML = `
          <div class="relative inline-block flex-shrink-0" id="account-dropdown-wrapper">
            <button type="button" onclick="window.toggleAccountMenu(event)" class="w-9 h-9 rounded-full ring-2 ring-[#d6c8f2] dark:ring-purple-500/60 hover:ring-[#ec4899] hover:scale-105 transition-all cursor-pointer active:scale-95 shadow-md overflow-hidden flex items-center justify-center p-0 focus:outline-none" title="${user.displayName || user.email || 'Profile & Settings'}" aria-label="User Profile Menu">
              ${avatarContent}
            </button>

            <div id="account-dropdown-menu" class="hidden absolute right-0 top-full mt-2.5 w-68 max-w-[calc(100vw-24px)] rounded-2xl shadow-[0_24px_60px_rgba(26,15,48,0.35)] p-3 z-[9999999] text-left border-2" style="background-color: ${isDark ? '#1b0f36' : '#ffffff'} !important; background: ${isDark ? '#1b0f36' : '#ffffff'} !important; border-color: ${isDark ? '#7e22ce' : '#d6c8f2'} !important; color: ${isDark ? '#f7f4ff' : '#1a0f30'} !important; opacity: 1 !important;">
              
              <!-- User Profile Header Card -->
              <a href="/account.html" class="block px-3.5 py-3 rounded-xl mb-2 border transition cursor-pointer hover:brightness-105 active:scale-98" style="background-color: ${isDark ? '#26154a' : '#f7f3fe'} !important; border-color: ${isDark ? '#6b21a8' : '#e2d6f8'} !important;">
                <div class="flex items-center gap-2.5">
                  <div class="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border-2 border-[#ec4899]">
                    ${avatarContent}
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="font-extrabold text-xs truncate" style="color: ${isDark ? '#ffffff' : '#1a0f30'};">${user.displayName || user.name || 'Creator Profile'}</div>
                    <div class="text-[11px] font-semibold truncate mt-0.5" style="color: ${isDark ? '#d8b4fe' : '#6d28d9'};">${user.email}</div>
                  </div>
                </div>
                <div class="flex items-center justify-between mt-2.5 pt-2 border-t" style="border-color: ${isDark ? '#4c1d95' : '#e2d6f8'};">
                  <div class="flex items-center gap-1.5">
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider" style="background-color: ${user.isPremium || user.plan === 'VIP' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(168, 85, 247, 0.16)'}; color: ${user.isPremium || user.plan === 'VIP' ? '#d97706' : (isDark ? '#d8b4fe' : '#6d28d9')}; border: 1px solid ${user.isPremium || user.plan === 'VIP' ? 'rgba(245, 158, 11, 0.45)' : 'rgba(168, 85, 247, 0.35)'};">
                      ${user.plan || 'Free'} Plan
                    </span>
                    ${isStrictMasterAdmin ? '<span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-gradient-to-r from-[#ff2a85] to-[#a855f7] text-white shadow-xs">OWNER</span>' : ''}
                  </div>
                  <span class="text-[10px] font-extrabold text-[#ec4899] flex items-center gap-0.5">Profile →</span>
                </div>
              </a>

              <!-- Menu Items -->
              <div class="py-1 space-y-1">
                ${isStrictMasterAdmin ? `
                  <a href="/admin/anktech/anktech/admin/overview" onclick="window.handleAdminPortalClick(event)" class="px-3.5 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-between transition border cursor-pointer hover:brightness-105 shadow-sm mb-1" style="background: linear-gradient(90deg, rgba(255,42,133,0.14) 0%, rgba(168,85,247,0.14) 100%) !important; border-color: ${isDark ? '#ec4899' : '#f472b6'} !important; color: ${isDark ? '#fbcfe8' : '#be185d'} !important;">
                    <div class="flex items-center gap-2.5">
                      <span class="material-symbols-outlined text-[18px] text-[#ec4899]">admin_panel_settings</span>
                      <span>Admin Panel</span>
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-gradient-to-r from-[#ff2a85] to-[#a855f7] text-white shadow-xs">STUDIO</span>
                  </a>
                ` : ''}
                <a href="/my-wishes.html" class="px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition hover:bg-purple-100/70 dark:hover:bg-purple-900/50" style="color: ${isDark ? '#f7f4ff' : '#1a0f30'};">
                  <span class="material-symbols-outlined text-[18px] text-[#ec4899]">card_giftcard</span>
                  <span>My Celebration Wishes</span>
                </a>
                <a href="/account.html" class="px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition hover:bg-purple-100/70 dark:hover:bg-purple-900/50" style="color: ${isDark ? '#f7f4ff' : '#1a0f30'};">
                  <span class="material-symbols-outlined text-[18px] text-[#8b5cf6]">manage_accounts</span>
                  <span>Profile &amp; Account Settings</span>
                </a>
                <a href="/favorites.html" class="px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition hover:bg-purple-100/70 dark:hover:bg-purple-900/50" style="color: ${isDark ? '#f7f4ff' : '#1a0f30'};">
                  <span class="material-symbols-outlined text-[18px] text-[#ec4899]">favorite</span>
                  <span>Saved Favorites</span>
                </a>
                <a href="/referrals.html" class="px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition hover:bg-purple-100/70 dark:hover:bg-purple-900/50" style="color: ${isDark ? '#f7f4ff' : '#1a0f30'};">
                  <span class="material-symbols-outlined text-[18px] text-[#f59e0b]">redeem</span>
                  <span>Referrals &amp; Rewards</span>
                </a>
              </div>

              <!-- Sign Out -->
              <div class="pt-1.5 mt-1 border-t" style="border-color: ${isDark ? '#4c1d95' : '#e2d6f8'};">
                <button type="button" onclick="WishAuth.signOut()" class="w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2.5 transition cursor-pointer hover:bg-rose-50 dark:hover:bg-rose-950/40" style="color: #e11d48;">
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

  window.handleAdminPortalClick = function(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!currentUser || !isMasterAdminEmail(currentUser.email)) {
      showAuthToast('Admin Panel requires signing in with the authorized owner Google account.');
      return;
    }
    window.location.href = '/admin/anktech/anktech/admin/overview';
  };

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
      menu.style.setProperty('background-color', isDark ? '#1b0f36' : '#ffffff', 'important');
      menu.style.setProperty('background', isDark ? '#1b0f36' : '#ffffff', 'important');
      menu.style.setProperty('border-color', isDark ? '#7e22ce' : '#d6c8f2', 'important');
      menu.style.setProperty('color', isDark ? '#f7f4ff' : '#1a0f30', 'important');
      menu.style.setProperty('opacity', '1', 'important');
      menu.style.setProperty('z-index', '9999999', 'important');
      menu.classList.remove('hidden');
    } else {
      menu.classList.add('hidden');
    }
  };

  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('account-dropdown-wrapper');
    const menu = document.getElementById('account-dropdown-menu');
    if (menu && !menu.classList.contains('hidden') && wrapper && !wrapper.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    setupGlobalAuthModal();
  });

  // ---------------------------------------------------------------------------
  // UNIVERSAL GOOGLE AUTH MODAL (STRICTLY "CONTINUE WITH GOOGLE" VIA FIREBASE)
  // ---------------------------------------------------------------------------
  function showUniversalAuthModal(promptMessage = null) {
    let modal = document.getElementById('wishmagic-universal-auth-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'wishmagic-universal-auth-modal';
      modal.className = 'fixed inset-0 z-[150] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-300';
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
    window.location.href = '/account.html';
  };
  window.openAccountSettings = function() {
    window.location.href = '/account.html';
  };
  WishAuth.openProfileSettings = window.openProfileSettings;
  WishAuth.openAccountSettings = window.openAccountSettings;

  function renderAuthModalContent(promptMessage = null) {
    const modal = document.getElementById('wishmagic-universal-auth-modal');
    if (!modal) return;

    const cleanPrompt = (promptMessage && promptMessage !== 'signin' && promptMessage !== 'signup')
      ? promptMessage
      : 'Continue with your Google account to create, personalize, and manage your magical celebration websites.';

    modal.innerHTML = `
      <div class="wm-modal-card bg-white dark:bg-[#1f123e] rounded-[26px] max-w-md w-full p-6 sm:p-8 shadow-[0_25px_70px_rgba(26,15,48,0.45)] relative border-2 border-[#d6c8f2] dark:border-purple-500/40 text-center overflow-hidden flex flex-col" onclick="event.stopPropagation()">
        <!-- Close Button -->
        <button type="button" class="absolute top-4 right-4 w-9 h-9 rounded-full bg-[#f4effc] dark:bg-purple-900/70 text-[#4c1d95] dark:text-purple-200 hover:bg-[#e9defa] dark:hover:bg-purple-800 flex items-center justify-center font-extrabold transition cursor-pointer z-10" onclick="closeAuthModal()" aria-label="Close">
          ✕
        </button>

        <div class="flex flex-col items-center">
          <!-- Brand Magic Wand Icon -->
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#a855f7] via-[#ec4899] to-[#f59e0b] text-white flex items-center justify-center mx-auto mb-4 shadow-[0_10px_28px_rgba(236,72,153,0.35)]">
            <span class="material-symbols-outlined text-[32px]">auto_fix_high</span>
          </div>

          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f5f0fd] dark:bg-purple-900/60 border border-[#dfd2f7] dark:border-purple-500/35 text-[11px] font-extrabold text-[#6d28d9] dark:text-purple-200 mb-2">
            <span>✨ Official Google Authentication</span>
          </div>

          <h3 class="font-display font-extrabold text-2xl text-[#1a0f30] dark:text-white tracking-tight">
            Welcome to Wish<span class="bg-gradient-to-r from-[#ff2a85] to-[#a855f7] bg-clip-text text-transparent">Magic</span>
          </h3>
          <p class="text-xs sm:text-sm text-[#533f78] dark:text-[#cfc2eb] mt-1.5 mb-5 leading-relaxed font-medium">
            ${cleanPrompt}
          </p>

          <!-- Dynamic Notice / Error Box -->
          <div id="auth-modal-error" class="hidden w-full text-xs font-semibold p-3 rounded-2xl border text-center mb-4"></div>

          <!-- ONLY Continue with Google Button (Firebase Auth) -->
          <button type="button" id="auth-google-btn" onclick="handleGoogleSignInClick()" class="w-full py-3.5 px-5 rounded-full bg-gradient-to-r from-[#ff2a85] via-[#ec4899] to-[#a855f7] hover:brightness-105 text-white font-extrabold text-sm tracking-wide shadow-[0_10px_28px_rgba(236,72,153,0.38)] flex items-center justify-center gap-3 transition-all active:scale-[0.98] cursor-pointer">
            <span class="w-7 h-7 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-xs">
              <svg class="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
            </span>
            <span id="auth-google-btn-text">Continue with Google</span>
          </button>

          <div class="w-full pt-4 mt-5 border-t border-[#e5daf8] dark:border-purple-800/60 text-center">
            <div class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#6e5d8f] dark:text-[#a594c9]">
              <span class="material-symbols-outlined text-[14px] text-[#ec4899]">verified_user</span>
              <span>Secured by Firebase Google Authentication</span>
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
      btn.classList.add('opacity-75');
    }
    if (txt) {
      txt.innerHTML = '<span class="inline-flex items-center gap-2"><span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span> Connecting to Google...</span>';
    }

    try {
      const user = await WishAuth.signInWithGoogle();
      if (user) {
        closeAuthModal();
        return;
      }
    } catch (err) {
      console.warn('[WishAuth] Google sign-in error:', err.message || err);
      if (errBox) {
        errBox.className = 'w-full text-xs font-semibold text-rose-700 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 p-3 rounded-2xl border border-rose-200 dark:border-rose-800/70 text-center mb-4 block';
        errBox.textContent = err.message || 'Google sign-in could not be completed. Please try again.';
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-75');
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
      toast.className = 'fixed top-6 right-6 z-[200] transform translate-y-[-150%] opacity-0 transition-all duration-300 pointer-events-none px-4 py-2.5 rounded-2xl bg-[#1a0f30] text-white text-xs font-extrabold shadow-2xl border border-[#ec4899]/50 flex items-center gap-2';
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
          showUniversalAuthModal();
          return;
        }
        legacyOpen(id);
      };
    }
  }

  setupGlobalAuthModal();

  window.WishAuth = WishAuth;
  window.showAuthToast = showAuthToast;

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
