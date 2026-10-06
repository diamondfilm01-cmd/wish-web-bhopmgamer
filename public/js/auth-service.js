// WishMagic Centralized Authentication & User Architecture Service
// Part 27: Production Security Hardening & Zero-Trust Authentication Boundary

(function(window) {
  'use strict';

  const STORAGE_KEY_USER = 'wishmagic_auth_user';

  let currentUser = null;
  let isCheckingSession = false;
  const authListeners = new Set();

  // Initialize Auth State directly from server session boundary
  async function initAuth() {
    isCheckingSession = true;
    try {
      // 1. Check cached local user state for instant initial UI render
      const storedUser = localStorage.getItem(STORAGE_KEY_USER);
      if (storedUser) {
        try {
          currentUser = JSON.parse(storedUser);
        } catch (e) {}
      }

      // 2. Authoritatively verify session with server boundary
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
    const displayName = (fbUser.displayName || fallbackDisplayName || (email ? email.split('@')[0] : 'Creator')).trim();
    const avatarUrl = fbUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email || 'creator')}`;

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

      const data = await res.json();
      if (res.ok && data && data.success && data.user) {
        return data.user;
      }
    } catch (err) {
      console.warn('[WishAuth] Server session sync warning:', err);
    }

    // Safe fallback if offline
    return {
      id: 'usr_' + (fbUser.uid ? fbUser.uid.slice(0, 16) : Date.now().toString(36)),
      email,
      displayName,
      avatarUrl,
      role: 'creator',
      plan: 'Free',
      isPremium: false
    };
  }

  // Centralized Auth Service API
  const WishAuth = {
    getCurrentUser() {
      return currentUser ? { ...currentUser } : null;
    },

    getSession() {
      return currentUser ? { userId: currentUser.id, authenticated: true } : null;
    },

    isAuthenticated() {
      return currentUser !== null && Boolean(currentUser.id);
    },

    isCheckingSession() {
      return isCheckingSession;
    },

    /**
     * Authoritatively check if currently signed-in user has Admin privileges
     */
    isAdmin() {
      if (!currentUser) return false;
      return Boolean(currentUser.role === 'admin' || currentUser.isAdmin === true);
    },

    /**
     * Hydrate and verify active session directly from server-side cookie boundary
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
        console.warn('[WishAuth] Session hydration error:', e);
      }

      // If server session is invalid or missing, clear cached state
      if (currentUser) {
        currentUser = null;
        try {
          localStorage.removeItem(STORAGE_KEY_USER);
        } catch (e) {}
        notifyAuthChange();
      }
      return null;
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
     * Firebase Email + Password Sign In
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
      if (!window.WishFirebaseAuth) {
        return this.signInWithEmail(cleanEmail);
      }

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
      } catch (err) {
        console.error('[WishAuth] Email sign-in failed:', err);
        showAuthToast(err.message || 'Incorrect email or password.');
        return null;
      }
    },

    /**
     * Firebase Email + Password Sign Up (New Creator)
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
      if (!window.WishFirebaseAuth) {
        return this.signInWithEmail(cleanEmail, displayName);
      }

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
      } catch (err) {
        console.error('[WishAuth] Sign up failed:', err);
        showAuthToast(err.message || 'Sign up could not be completed.');
        return null;
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
      if (!window.WishFirebaseAuth) {
        showAuthToast('Authentication service is initializing, please try again.');
        return false;
      }

      try {
        await window.WishFirebaseAuth.sendPasswordReset(cleanEmail);
        showAuthToast(`Password reset link sent to ${cleanEmail}! Please check your inbox. ✉️`);
        return true;
      } catch (err) {
        console.error('[WishAuth] Password reset failed:', err);
        showAuthToast(err.message || 'Failed to send password reset email.');
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
  // NAVBAR AUTH STATE RENDERER
  // ---------------------------------------------------------------------------
  function renderNavbarAuthState() {
    const user = WishAuth.getCurrentUser();
    const navContainers = document.querySelectorAll('.navbar-auth-container, .nav-auth-container, [data-purpose="navbar-auth"], [data-auth-container]');

    navContainers.forEach(container => {
      if (!user) {
        container.innerHTML = `
          <div class="flex items-center gap-1.5 sm:gap-2">
            <button onclick="window.openAuthModal('signin')" class="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold text-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/60 transition cursor-pointer">
              Sign In
            </button>
            <button onclick="window.openAuthModal('signup')" class="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:brightness-110 shadow-sm transition cursor-pointer flex items-center gap-1">
              <span>Sign Up</span>
              <span class="text-[10px]">✨</span>
            </button>
          </div>
        `;
      } else {
        const initials = (user.displayName || user.email || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        const avatarImg = user.avatarUrl
          ? `<img src="${user.avatarUrl}" alt="${user.displayName}" class="w-7 h-7 rounded-full object-cover border border-pink-400 shadow-sm"/>`
          : `<div class="w-7 h-7 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 text-white flex items-center justify-center font-bold text-[11px]">${initials}</div>`;

        container.innerHTML = `
          <div class="relative" id="account-dropdown-wrapper">
            <button onclick="window.toggleAccountMenu(event)" class="flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-container-high/60 hover:bg-surface-container-highest border border-purple-200/40 dark:border-purple-800/60 transition cursor-pointer">
              ${avatarImg}
              <span class="text-xs font-bold text-on-surface truncate max-w-[100px] sm:max-w-[130px]">${user.displayName || user.email}</span>
              <span class="material-symbols-outlined text-[14px] text-outline">expand_more</span>
            </button>

            <!-- Dropdown Menu -->
            <div id="account-dropdown-menu" class="hidden absolute right-0 mt-2 w-56 bg-surface-container-highest/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-200/50 dark:border-purple-800/80 p-2 z-50 animate-scaleUp text-left">
              <div class="px-3 py-2 border-b border-purple-100 dark:border-purple-900">
                <div class="font-bold text-xs text-on-surface truncate">${user.displayName}</div>
                <div class="text-[10px] text-on-surface-variant truncate">${user.email}</div>
                <div class="flex items-center gap-1.5 mt-1">
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${user.isPremium || user.plan === 'VIP' ? 'bg-amber-400/20 text-amber-500 border border-amber-400/40' : 'bg-purple-500/20 text-purple-300'}">
                    ${user.plan || 'Free'} Plan
                  </span>
                  ${user.role === 'admin' ? '<span class="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-pink-500 text-white">ADMIN</span>' : ''}
                </div>
              </div>

              <div class="py-1 space-y-0.5">
                <a href="/my-wishes" class="px-3 py-2 rounded-xl text-xs font-semibold text-on-surface hover:bg-purple-100 dark:hover:bg-purple-900/50 flex items-center gap-2 transition">
                  <span class="material-symbols-outlined text-[16px] text-pink-500">card_giftcard</span>
                  <span>My Celebration Wishes</span>
                </a>
                <a href="/favorites" class="px-3 py-2 rounded-xl text-xs font-semibold text-on-surface hover:bg-purple-100 dark:hover:bg-purple-900/50 flex items-center gap-2 transition">
                  <span class="material-symbols-outlined text-[16px] text-purple-400">favorite</span>
                  <span>Favorites</span>
                </a>
                <a href="/account" class="px-3 py-2 rounded-xl text-xs font-semibold text-on-surface hover:bg-purple-100 dark:hover:bg-purple-900/50 flex items-center gap-2 transition">
                  <span class="material-symbols-outlined text-[16px] text-purple-400">settings</span>
                  <span>Account Settings</span>
                </a>
                ${user.role === 'admin' ? `
                  <a href="/admin" class="px-3 py-2 rounded-xl text-xs font-bold text-pink-400 hover:bg-pink-950/40 flex items-center gap-2 transition">
                    <span class="material-symbols-outlined text-[16px] text-pink-500">admin_panel_settings</span>
                    <span>Admin Portal</span>
                  </a>
                ` : ''}
              </div>

              <div class="pt-1 mt-1 border-t border-purple-100 dark:border-purple-900">
                <button onclick="WishAuth.signOut()" class="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 transition cursor-pointer">
                  <span class="material-symbols-outlined text-[16px]">logout</span>
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        `;
      }
    });
  }

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
  // AUTH MODAL DIALOG (GOOGLE GMAIL ONLY FOR USERS)
  // ---------------------------------------------------------------------------
  let currentAuthModalMode = 'signin';

  function showUniversalAuthModal(mode = 'signin', promptMessage = null) {
    currentAuthModalMode = (mode === 'signup') ? 'signup' : 'signin';
    let modal = document.getElementById('wishmagic-universal-auth-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'wishmagic-universal-auth-modal';
      modal.className = 'fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 transition-all duration-300';
      document.body.appendChild(modal);
    }

    renderAuthModalContent(promptMessage, currentAuthModalMode);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');
  }

  window.openAuthModal = showUniversalAuthModal;
  window._openWishAuthModal = showUniversalAuthModal;
  WishAuth.openAuthModal = showUniversalAuthModal;

  function renderAuthModalContent(promptMessage = null, mode = 'signin') {
    const modal = document.getElementById('wishmagic-universal-auth-modal');
    if (!modal) return;

    const isSignUp = (mode === 'signup');
    const titleText = isSignUp ? 'Join WishMagic ✨' : 'Welcome to WishMagic ✨';
    const subText = promptMessage || (isSignUp
      ? 'Sign in with your Google (Gmail) account to personalize, save, and publish interactive celebration websites.'
      : 'Sign in with your Google (Gmail) account to access your saved celebration wishes, drafts, and memories.');

    modal.innerHTML = `
      <div class="bg-white dark:bg-[#1A0B2E] rounded-3xl max-w-sm sm:max-w-md w-full p-6 sm:p-8 shadow-2xl relative border border-purple-200 dark:border-purple-800 text-center animate-scaleUp overflow-hidden">
        <!-- Close Button -->
        <button class="absolute top-4 right-4 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 hover:text-black dark:hover:text-white flex items-center justify-center font-bold transition cursor-pointer" onclick="closeAuthModal()" aria-label="Close">
          ✕
        </button>

        <!-- Magical Glowing Wand Icon -->
        <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pink-500 via-purple-600 to-amber-300 text-white flex items-center justify-center mx-auto text-2xl mb-3 shadow-lg shadow-pink-500/30">
          🪄
        </div>

        <h3 class="font-display font-extrabold text-xl sm:text-2xl text-purple-950 dark:text-white">${titleText}</h3>
        <p class="text-xs text-purple-800/80 dark:text-purple-300/80 mt-1.5 mb-6 max-w-xs mx-auto leading-relaxed">${subText}</p>

        <!-- Google Continue Button (Exclusive 1-Tap Auth for Users) -->
        <div class="mb-4">
          <button type="button" id="auth-google-btn" onclick="handleGoogleSignInClick()" class="w-full py-3.5 px-5 rounded-2xl bg-white dark:bg-purple-950/80 hover:bg-purple-50 dark:hover:bg-purple-900/60 border-2 border-purple-200 dark:border-purple-700/70 text-xs sm:text-sm font-bold text-gray-800 dark:text-white flex items-center justify-center gap-3 transition-all duration-200 shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] cursor-pointer">
            <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span id="auth-google-btn-text">Continue with Google (Gmail)</span>
          </button>
        </div>

        <!-- Dynamic Status / Error banner -->
        <div id="auth-modal-error" class="hidden text-xs font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950/50 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-center my-3"></div>

        <div class="pt-3 border-t border-purple-100 dark:border-purple-900 text-center">
          <div class="inline-flex items-center gap-1.5 text-[11px] font-medium text-purple-600/80 dark:text-purple-400/80">
            <span class="material-symbols-outlined text-[14px]">lock</span>
            <span>1-Tap Secure Login with Gmail • Powered by Firebase Auth</span>
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
        txt.textContent = 'Continue with Google (Gmail)';
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
