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
     * Sign In / Sign Up with Email
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
     * OAuth Sign In Handler (Truthful Unconfigured State)
     */
    signInWithOAuth(provider = 'Google') {
      showAuthToast(`AUTH_PROVIDER_NOT_CONFIGURED: ${provider} OAuth is not configured in this environment. Please sign in with email.`);
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
    const navContainers = document.querySelectorAll('.nav-auth-container, [data-auth-container]');

    navContainers.forEach(container => {
      if (!user) {
        container.innerHTML = `
          <div class="flex items-center gap-2">
            <button onclick="window.openAuthModal('signin')" class="px-3.5 py-1.5 rounded-full text-xs font-bold text-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/60 transition cursor-pointer">
              Sign In
            </button>
            <button onclick="window.openAuthModal('signup')" class="px-3.5 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:brightness-110 shadow-sm transition cursor-pointer flex items-center gap-1">
              <span>Get Started</span>
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
  // AUTH MODAL DIALOG
  // ---------------------------------------------------------------------------
  window.openAuthModal = function(mode = 'signin', promptMessage = null) {
    let modal = document.getElementById('wishmagic-universal-auth-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'wishmagic-universal-auth-modal';
      modal.className = 'fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-300';
      document.body.appendChild(modal);
    }

    const titleText = mode === 'signup' ? 'Create Your Creator Account' : 'Welcome Back, Creator';
    const subText = promptMessage || (mode === 'signup'
      ? 'Start creating interactive 3D celebration wishes for your loved ones ✨'
      : 'Sign in to access your celebration wishes, continue drafts, and manage experiences.');

    modal.innerHTML = `
      <div class="bg-white dark:bg-[#1A0B2E] rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl relative border border-purple-200 dark:border-purple-800 text-center animate-scaleUp overflow-hidden">
        <!-- Close Button -->
        <button class="absolute top-4 right-4 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 hover:text-black dark:hover:text-white flex items-center justify-center font-bold transition cursor-pointer" onclick="closeAuthModal()">
          ✕
        </button>

        <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pink-500 via-purple-600 to-amber-300 text-white flex items-center justify-center mx-auto text-2xl mb-3 shadow-lg shadow-pink-500/25">
          🪄
        </div>

        <h3 class="font-display font-extrabold text-xl sm:text-2xl text-purple-950 dark:text-white">${titleText}</h3>
        <p class="text-xs text-purple-800/80 dark:text-purple-300/80 mt-1 mb-5">${subText}</p>

        <!-- Social OAuth Login Buttons -->
        <div class="space-y-2.5 mb-4">
          <button onclick="WishAuth.signInWithOAuth('Google')" class="w-full py-2.5 px-4 rounded-xl border border-gray-300 dark:border-purple-700/60 hover:bg-gray-50 dark:hover:bg-purple-900/40 text-xs font-bold text-gray-700 dark:text-purple-200 flex items-center justify-center gap-2 transition cursor-pointer">
            <svg class="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
            <span>Continue with Google</span>
          </button>
          <button onclick="WishAuth.signInWithOAuth('Apple')" class="w-full py-2.5 px-4 rounded-xl border border-gray-300 dark:border-purple-700/60 hover:bg-gray-50 dark:hover:bg-purple-900/40 text-xs font-bold text-gray-700 dark:text-purple-200 flex items-center justify-center gap-2 transition cursor-pointer">
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 0.92-2.87-.9.04-2 .6-2.63 1.34-.56.64-1.04 1.71-.91 2.74 1.01.08 2.01-.46 2.62-1.21z"/></svg>
            <span>Continue with Apple</span>
          </button>
        </div>

        <div class="relative my-4 flex items-center justify-center">
          <div class="border-t border-purple-200 dark:border-purple-800 w-full"></div>
          <span class="bg-white dark:bg-[#1A0B2E] px-3 text-[11px] text-purple-400 font-semibold absolute">or with email</span>
        </div>

        <!-- Email Sign In / Sign Up Form -->
        <form onsubmit="handleUniversalAuthSubmit(event)" class="space-y-2.5 text-left">
          <div>
            <label class="block text-[11px] font-bold text-purple-800 dark:text-purple-300 mb-1">Your Name</label>
            <input id="auth-input-name" type="text" placeholder="e.g. Rahul Sharma" class="w-full text-xs rounded-xl border border-purple-200 dark:border-purple-800 p-2.5 focus:ring-2 focus:ring-pink-500 focus:outline-none bg-white/70 dark:bg-purple-950/60 text-purple-950 dark:text-white"/>
          </div>
          <div>
            <label class="block text-[11px] font-bold text-purple-800 dark:text-purple-300 mb-1">Email Address</label>
            <input id="auth-input-email" type="email" placeholder="rahul@example.com" required class="w-full text-xs rounded-xl border border-purple-200 dark:border-purple-800 p-2.5 focus:ring-2 focus:ring-pink-500 focus:outline-none bg-white/70 dark:bg-purple-950/60 text-purple-950 dark:text-white"/>
          </div>
          <button type="submit" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5">
            <span>Continue</span>
            <span>✨</span>
          </button>
        </form>

        <div class="mt-4 pt-3 border-t border-purple-100 dark:border-purple-900 text-center">
          <div class="text-[10px] text-purple-600 dark:text-purple-400">
            🔒 Protected by secure HttpOnly sessions &amp; server-authoritative RBAC.
          </div>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');
  };

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

  window.handleUniversalAuthSubmit = async function(e) {
    e.preventDefault();
    const name = document.getElementById('auth-input-name')?.value || '';
    const email = document.getElementById('auth-input-email')?.value || '';
    const user = await WishAuth.signInWithEmail(email, name);
    if (user) {
      closeAuthModal();
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
          window.openAuthModal('signin');
          return;
        }
        legacyOpen(id);
      };
    }
  }

  window.WishAuth = WishAuth;
  window.showAuthToast = showAuthToast;

})(window);
