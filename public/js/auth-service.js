// WishMagic Centralized Authentication & User Architecture Service
// Part 27: Production Security Hardening & Zero-Trust Authentication Boundary

(function(window) {
  'use strict';

  const STORAGE_KEY_USER = 'wishmagic_auth_user';

  let currentUser = null;
  let isCheckingSession = false;
  const authListeners = new Set();

  // Initialize Auth State directly with Firebase SDK and fallback cache
  async function initAuth() {
    isCheckingSession = true;
    try {
      // 1. Check cached local user state for instant initial UI render
      const storedUser = localStorage.getItem(STORAGE_KEY_USER);
      if (storedUser) {
        try {
          currentUser = JSON.parse(storedUser);
          notifyAuthChange();
        } catch (e) {}
      }

      // 2. Connect Firebase Auth State Observer for real-time auth
      const fb = await ensureFirebaseAuth();
      if (fb && typeof fb.onAuthStateChanged === 'function') {
        fb.onAuthStateChanged(async (fbUser) => {
          if (fbUser) {
            const email = (fbUser.email || '').trim().toLowerCase();
            const isAdmin = fb.isAdminEmail ? fb.isAdminEmail(email) : (email === 'ankit.babusaini@gmail.com' || email === 'ankitsaini941413@gmail.com' || email === 'bhoomgamer@gmail.com');
            const displayName = (fbUser.displayName || (email ? email.split('@')[0] : 'Creator')).trim();
            const avatarUrl = fbUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email || 'creator')}`;

            currentUser = {
              id: 'usr_fb_' + (fbUser.uid ? fbUser.uid.slice(0, 16) : Date.now().toString(36)),
              email,
              displayName,
              avatarUrl,
              role: isAdmin ? 'admin' : 'creator',
              isAdmin: isAdmin,
              plan: isAdmin ? 'VIP' : 'Free',
              isPremium: isAdmin,
              provider: fbUser.providerData?.[0]?.providerId || 'firebase',
              firebaseUid: fbUser.uid
            };

            try {
              localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
              if (isAdmin) {
                const adminToken = 'adm_token_' + fbUser.uid;
                localStorage.setItem('wishmagic_admin_token', adminToken);
                localStorage.setItem('wishmagic_auth_token', adminToken);
                sessionStorage.setItem('wm_admin_verified', 'true');
              }
            } catch (e) {}

            notifyAuthChange();
            // Background sync with server if available
            syncSessionWithServer(fbUser, displayName).catch(() => {});
          } else {
            // User signed out in Firebase
            const hadUser = currentUser !== null;
            currentUser = null;
            try {
              localStorage.removeItem(STORAGE_KEY_USER);
            } catch (e) {}
            if (hadUser) notifyAuthChange();
          }
        });
      }

      // 3. Try server hydration if running in Express environment
      await WishAuth.hydrateSessionFromServer();
    } catch (e) {
      console.warn('[WishAuth] Error initializing auth state:', e);
    } finally {
      isCheckingSession = false;
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

  // Helper to ensure WishFirebaseAuth is loaded
  function ensureFirebaseAuth() {
    if (window.WishFirebaseAuth) return Promise.resolve(window.WishFirebaseAuth);
    return new Promise((resolve) => {
      let existing = document.querySelector('script[src*="firebase-auth.js"]');
      if (!existing) {
        const script = document.createElement('script');
        script.src = '/js/firebase-auth.js';
        script.async = true;
        script.onload = () => resolve(window.WishFirebaseAuth || null);
        script.onerror = () => resolve(null);
        document.head.appendChild(script);
      } else {
        let count = 0;
        const interval = setInterval(() => {
          if (window.WishFirebaseAuth || ++count > 40) {
            clearInterval(interval);
            resolve(window.WishFirebaseAuth || null);
          }
        }, 50);
      }
    });
  }

  // Authoritatively sync authenticated Firebase identity with server-side session cookie
  async function syncSessionWithServer(fbUser, fallbackDisplayName = '') {
    const email = (fbUser.email || '').trim().toLowerCase();
    const isAdmin = window.WishFirebaseAuth?.isAdminEmail ? window.WishFirebaseAuth.isAdminEmail(email) : (email === 'ankit.babusaini@gmail.com' || email === 'ankitsaini941413@gmail.com' || email === 'bhoomgamer@gmail.com');
    const displayName = (fbUser.displayName || fallbackDisplayName || (email ? email.split('@')[0] : 'Creator')).trim();
    const avatarUrl = fbUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email || 'creator')}`;

    const fallbackUser = {
      id: 'usr_fb_' + (fbUser.uid ? fbUser.uid.slice(0, 16) : Date.now().toString(36)),
      email,
      displayName,
      avatarUrl,
      role: isAdmin ? 'admin' : 'creator',
      isAdmin: isAdmin,
      plan: isAdmin ? 'VIP' : 'Free',
      isPremium: isAdmin,
      provider: fbUser.providerData?.[0]?.providerId || 'firebase',
      firebaseUid: fbUser.uid
    };

    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          displayName,
          avatarUrl,
          provider: fbUser.providerData?.[0]?.providerId || 'firebase',
          firebaseUid: fbUser.uid
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.user) {
          return data.user;
        }
      }
    } catch (err) {
      // Server is offline or static host (Cloudflare Pages), use direct client fallback
    }

    return fallbackUser;
  }

  // Centralized Auth Service API
  const WishAuth = {
    getCurrentUser() {
      return currentUser ? { ...currentUser } : null;
    },

    getSession() {
      return currentUser ? { userId: currentUser.id, authenticated: true, user: { ...currentUser } } : null;
    },

    isAuthenticated() {
      return currentUser !== null && Boolean(currentUser.id);
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
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && data.user) {
            currentUser = data.user;
            try {
              localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
            } catch (e) {}
            notifyAuthChange();
            return currentUser;
          }
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
          currentUser = data.user;
          try {
            localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
          } catch (e) {}
          notifyAuthChange();
          showAuthToast(`Welcome back, ${currentUser.displayName}! ✨`);
          return currentUser;
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
            currentUser = serverUser;
            try {
              localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
            } catch (e) {}
            notifyAuthChange();
            showAuthToast(`Welcome, ${currentUser.displayName}! ✨`);
            if (typeof window.closeAuthModal === 'function') window.closeAuthModal();
            return currentUser;
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
            currentUser = serverUser;
            try {
              localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
            } catch (e) {}
            notifyAuthChange();
            showAuthToast(`Welcome back, ${currentUser.displayName}! ✨`);
            if (typeof window.closeAuthModal === 'function') window.closeAuthModal();
            return currentUser;
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
          currentUser = data.user;
          try {
            localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
            if (data.token) {
              localStorage.setItem('wishmagic_auth_token', data.token);
              document.cookie = `wm_session=${encodeURIComponent(data.token)}; Path=/; Max-Age=2592000; SameSite=Lax`;
            }
          } catch (e) {}
          notifyAuthChange();
          showAuthToast(`Welcome back, ${currentUser.displayName}! ✨`);
          if (typeof window.closeAuthModal === 'function') window.closeAuthModal();
          return currentUser;
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
            currentUser = serverUser;
            try {
              localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
            } catch (e) {}
            notifyAuthChange();
            showAuthToast(`Account created! Welcome, ${currentUser.displayName}! ✨`);
            if (typeof window.closeAuthModal === 'function') window.closeAuthModal();
            return currentUser;
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
          currentUser = data.user;
          try {
            localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
            if (data.token) {
              localStorage.setItem('wishmagic_auth_token', data.token);
              document.cookie = `wm_session=${encodeURIComponent(data.token)}; Path=/; Max-Age=2592000; SameSite=Lax`;
            }
          } catch (e) {}
          notifyAuthChange();
          showAuthToast(`Account created! Welcome, ${currentUser.displayName}! ✨`);
          if (typeof window.closeAuthModal === 'function') window.closeAuthModal();
          return currentUser;
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
      if (!currentUser) return null;

      const newName = updates.displayName !== undefined ? updates.displayName.trim() : currentUser.displayName;
      const newAvatar = updates.avatarUrl !== undefined ? updates.avatarUrl.trim() : currentUser.avatarUrl;

      try {
        const res = await fetch('/api/users/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ displayName: newName, avatarUrl: newAvatar })
        });
        const data = await res.json();
        if (res.ok && data && data.success && data.user) {
          currentUser = data.user;
          try {
            localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
          } catch (e) {}
          notifyAuthChange();
          return currentUser;
        }
      } catch (e) {
        console.warn('[WishAuth] Profile update error:', e);
      }

      currentUser = { ...currentUser, displayName: newName, avatarUrl: newAvatar };
      try {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
      } catch (e) {}
      notifyAuthChange();
      return currentUser;
    },

    /**
     * Sign Out
     */
    async signOut() {
      currentUser = null;
      try {
        localStorage.removeItem(STORAGE_KEY_USER);
      } catch (e) {}

      if (window.WishFirebaseAuth) {
        window.WishFirebaseAuth.signOut().catch(() => {});
      }

      try {
        await fetch('/api/auth/signout', {
          method: 'POST',
          credentials: 'include'
        });
      } catch (e) {}

      notifyAuthChange();
      showAuthToast('Signed out successfully.');
    }
  };

  // ---------------------------------------------------------------------------
  // NAVBAR AUTH STATE RENDERER (Clean Sign In only, no sign-up button)
  // ---------------------------------------------------------------------------
  function renderNavbarAuthState() {
    const user = WishAuth.getCurrentUser();
    const navContainers = document.querySelectorAll('.navbar-auth-container, .nav-auth-container, [data-purpose="navbar-auth"], [data-auth-container]');

    navContainers.forEach(container => {
      if (!user) {
        container.innerHTML = `
          <div class="flex items-center gap-1.5 sm:gap-2">
            <button onclick="window.openAuthModal()" class="px-3.5 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-[#EC4899] to-[#7C3AED] hover:brightness-110 shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
              <span class="material-symbols-outlined text-[16px]">account_circle</span>
              <span>Sign In</span>
            </button>
          </div>
        `;
      } else {
        const initials = (user.displayName || user.email || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        const avatarImg = user.avatarUrl
          ? `<img src="${user.avatarUrl}" alt="${user.displayName}" class="w-7 h-7 rounded-full object-cover border border-pink-400 shadow-sm"/>`
          : `<div class="w-7 h-7 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 text-white flex items-center justify-center font-bold text-[11px]">${initials}</div>`;

        container.innerHTML = `
          <div class="relative inline-block" id="account-dropdown-wrapper">
            <button onclick="window.toggleAccountMenu(event)" class="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 rounded-full bg-surface-container-high/70 hover:bg-surface-container-highest border border-purple-200/50 dark:border-purple-800/60 transition cursor-pointer active:scale-95">
              ${avatarImg}
              <span class="text-xs font-bold text-on-surface truncate max-w-[70px] xs:max-w-[100px] sm:max-w-[130px]">${user.displayName || user.email}</span>
              <span class="material-symbols-outlined text-[14px] text-outline">expand_more</span>
            </button>

            <!-- Dropdown Menu -->
            <div id="account-dropdown-menu" class="hidden absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-24px)] !bg-white dark:!bg-[#150927] rounded-2xl shadow-2xl shadow-purple-950/25 dark:shadow-black/70 border-2 border-purple-200/90 dark:border-purple-800 p-2.5 z-[100] animate-scaleUp text-left" style="background-color: #ffffff; opacity: 1 !important;">
              <div class="px-3 py-2.5 border-b border-purple-100 dark:border-purple-800/80 !bg-purple-50 dark:!bg-purple-900/30 rounded-xl mb-1.5" style="background-color: #f5f3ff;">
                <div class="font-extrabold text-xs !text-purple-950 dark:!text-white truncate" style="color: #1e1b4b;">${user.displayName}</div>
                <div class="text-[11px] font-medium !text-purple-700 dark:!text-purple-300 truncate mt-0.5" style="color: #6d28d9;">${user.email}</div>
                <div class="flex items-center gap-1.5 mt-2">
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${user.isPremium || user.plan === 'VIP' ? 'bg-amber-400/20 text-amber-700 dark:text-amber-400 border border-amber-400/50' : 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-300/60'}">
                    ${user.plan || 'Free'} Plan
                  </span>
                  ${user.role === 'admin' ? '<span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-xs">ADMIN</span>' : ''}
                </div>
              </div>

              <div class="py-1 space-y-1">
                <a href="/my-wishes" class="px-3 py-2.5 rounded-xl text-xs font-bold !text-gray-900 dark:!text-purple-100 hover:!bg-purple-100/80 dark:hover:!bg-purple-900/50 flex items-center gap-2.5 transition" style="color: #111827;">
                  <span class="material-symbols-outlined text-[18px] text-pink-500">card_giftcard</span>
                  <span>My Celebration Wishes</span>
                </a>
                <a href="/favorites" class="px-3 py-2.5 rounded-xl text-xs font-bold !text-gray-900 dark:!text-purple-100 hover:!bg-purple-100/80 dark:hover:!bg-purple-900/50 flex items-center gap-2.5 transition" style="color: #111827;">
                  <span class="material-symbols-outlined text-[18px] text-purple-500">favorite</span>
                  <span>Favorites</span>
                </a>
                <a href="/account" class="px-3 py-2.5 rounded-xl text-xs font-bold !text-gray-900 dark:!text-purple-100 hover:!bg-purple-100/80 dark:hover:!bg-purple-900/50 flex items-center gap-2.5 transition" style="color: #111827;">
                  <span class="material-symbols-outlined text-[18px] text-purple-500">settings</span>
                  <span>Account Settings</span>
                </a>
                ${(user.role === 'admin' || user.isAdmin === true || (window.WishFirebaseAuth?.isAdminEmail && window.WishFirebaseAuth.isAdminEmail(user.email)) || (user.email && (user.email.toLowerCase() === 'ankit.babusaini@gmail.com' || user.email.toLowerCase() === 'ankitsaini941413@gmail.com'))) ? `
                  <a href="/admin/anktech/anktech/admin/overview" onclick="window.handleAdminPortalClick(event)" class="px-3 py-2.5 rounded-xl text-xs font-bold !text-pink-600 dark:!text-pink-400 !bg-pink-50/80 dark:!bg-pink-950/40 hover:!bg-pink-100 dark:hover:!bg-pink-900/50 flex items-center justify-between transition group border border-pink-500/20 cursor-pointer" style="color: #db2777;">
                    <div class="flex items-center gap-2.5">
                      <span class="material-symbols-outlined text-[18px] text-pink-500">admin_panel_settings</span>
                      <span>Admin Panel</span>
                    </div>
                    <span class="px-1.5 py-0.5 rounded text-[8px] font-black bg-pink-500 text-white shadow-xs">⚡ MASTER</span>
                  </a>
                ` : ''}
              </div>

              <div class="pt-1.5 mt-1 border-t border-purple-100 dark:border-purple-800/80">
                <button onclick="WishAuth.signOut()" class="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold !text-rose-600 dark:!text-rose-400 hover:!bg-rose-50 dark:hover:!bg-rose-950/40 flex items-center gap-2.5 transition cursor-pointer" style="color: #e11d48;">
                  <span class="material-symbols-outlined text-[18px]">logout</span>
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        `;
      }
    });
  }

  // Ensure solid opaque dropdown styling across all pages
  if (typeof document !== 'undefined') {
    const styleEl = document.createElement('style');
    styleEl.id = 'account-dropdown-solid-fix';
    styleEl.textContent = `
      #account-dropdown-menu {
        background: #ffffff !important;
        background-color: #ffffff !important;
        opacity: 1 !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      html.dark #account-dropdown-menu,
      body.dark #account-dropdown-menu {
        background: #150927 !important;
        background-color: #150927 !important;
      }
    `;
    if (!document.getElementById('account-dropdown-solid-fix')) {
      document.head.appendChild(styleEl);
    }
  }

  // Seamless Master Admin Portal navigation
  window.handleAdminPortalClick = async function(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const user = WishAuth.getCurrentUser();
    const isMaster = user && (user.role === 'admin' || user.isAdmin || (user.email && (user.email.toLowerCase() === 'ankit.babusaini@gmail.com' || user.email.toLowerCase() === 'ankitsaini941413@gmail.com')));

    if (isMaster) {
      try {
        await fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email: user.email,
            displayName: user.displayName || 'Ankit Saini',
            avatarUrl: user.avatarUrl,
            role: 'admin',
            firebaseUid: user.firebaseUid
          })
        });
      } catch (err) {}
      window.location.href = '/admin/anktech/anktech/admin/overview';
    } else {
      showAuthToast('Admin panel is restricted to authorized Google account only.');
    }
  };

  // Toggle account menu open/closed
  window.toggleAccountMenu = function(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('account-dropdown-menu');
    if (menu) {
      menu.classList.toggle('hidden');
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

})(window);
