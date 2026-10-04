// WishMagic Centralized Authentication & User Architecture Service
// Part 9: User Accounts + Authentication Abstraction + Creator Ownership

(function(window) {
  'use strict';

  const STORAGE_KEY_USER = 'wishmagic_auth_user';
  const STORAGE_KEY_SESSION = 'wishmagic_auth_session';
  const STORAGE_KEY_ALL_USERS = 'wishmagic_registered_users';

  // Standard Normalized Development Test Accounts
  const DEV_ACCOUNTS = [
    {
      id: 'usr_ankit_101',
      email: 'ankit@example.com',
      displayName: 'Ankit Verma',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      provider: 'dev',
      createdAt: '2026-01-15T10:00:00.000Z',
      updatedAt: '2026-10-01T12:00:00.000Z'
    },
    {
      id: 'usr_priya_202',
      email: 'priya@example.com',
      displayName: 'Priya Sharma',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      role: 'creator',
      isAdmin: false,
      provider: 'dev',
      createdAt: '2026-02-20T14:30:00.000Z',
      updatedAt: '2026-10-02T09:15:00.000Z'
    },
    {
      id: 'usr_admin_999',
      email: 'admin@wishmagic.internal',
      displayName: 'Development Admin',
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      role: 'admin',
      isAdmin: true,
      provider: 'dev_admin',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-10-04T00:00:00.000Z'
    }
  ];

  let currentUser = null;
  let currentSession = null;
  let isCheckingSession = false;
  const authListeners = new Set();

  // Initialize Auth State from storage on load
  function initAuth() {
    isCheckingSession = true;
    try {
      const storedUser = localStorage.getItem(STORAGE_KEY_USER);
      const storedSession = localStorage.getItem(STORAGE_KEY_SESSION);

      if (storedUser && storedSession) {
        currentUser = JSON.parse(storedUser);
        currentSession = JSON.parse(storedSession);

        // Check session expiration if set
        if (currentSession && currentSession.expiresAt && Date.now() > currentSession.expiresAt) {
          console.warn('[WishAuth] Session expired, clearing...');
          signOut();
          isCheckingSession = false;
          return;
        }
      } else {
        // By default on first creator session, seed Ankit Verma as active dev account
        // so the creator dashboard has an immediate active identity
        const hasInitialized = localStorage.getItem('wishmagic_auth_initialized');
        if (!hasInitialized) {
          localStorage.setItem('wishmagic_auth_initialized', 'true');
          WishAuth.signInWithDevAccount('usr_ankit_101', false);
        }
      }
    } catch (e) {
      console.warn('[WishAuth] Error initializing auth state:', e);
      currentUser = null;
      currentSession = null;
    } finally {
      isCheckingSession = false;
    }
  }

  function notifyAuthChange() {
    authListeners.forEach(fn => {
      try {
        fn(currentUser, currentSession);
      } catch (err) {
        console.error('[WishAuth] Listener callback error:', err);
      }
    });
    // Update navbar avatar / menu across pages
    renderNavbarAuthState();
  }

  // Abstraction API
  const WishAuth = {
    DEV_ACCOUNTS,

    getCurrentUser() {
      return currentUser ? { ...currentUser } : null;
    },

    getSession() {
      return currentSession ? { ...currentSession } : null;
    },

    isAuthenticated() {
      return currentUser !== null && currentSession !== null;
    },

    isCheckingSession() {
      return isCheckingSession;
    },

    async hydrateSessionFromServer() {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        const data = await res.json();
        if (data && data.success && data.user) {
          currentUser = data.user;
          try {
            localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
          } catch (e) {}
          notifyAuthChange();
          return currentUser;
        }
      } catch (e) {}
      return currentUser;
    },

    /**
     * Check if currently signed-in user has Admin privileges
     */
    isAdmin() {
      if (!currentUser) return false;
      return Boolean(currentUser.role === 'admin' || currentUser.isAdmin === true || currentUser.id === 'usr_admin_999');
    },

    onAuthStateChange(callback) {
      if (typeof callback === 'function') {
        authListeners.add(callback);
        // Call immediately with current state
        callback(currentUser, currentSession);
        return () => authListeners.delete(callback);
      }
      return () => {};
    },

    /**
     * Development Account Sign-In (Switch to Ankit, Priya, or a custom test creator)
     */
    signInWithDevAccount(userIdOrProfile, notify = true) {
      let targetUser = null;

      if (typeof userIdOrProfile === 'string') {
        targetUser = DEV_ACCOUNTS.find(u => u.id === userIdOrProfile);
        if (!targetUser) {
          // Check custom registered users
          const customUsers = WishAuth.getAllKnownUsers();
          targetUser = customUsers.find(u => u.id === userIdOrProfile);
        }
      } else if (typeof userIdOrProfile === 'object' && userIdOrProfile.id) {
        targetUser = userIdOrProfile;
      }

      if (!targetUser) {
        targetUser = DEV_ACCOUNTS[0];
      }

      currentUser = {
        ...targetUser,
        updatedAt: new Date().toISOString()
      };

      currentSession = {
        userId: currentUser.id,
        token: 'dev_token_' + Date.now().toString(36),
        provider: currentUser.provider || 'dev',
        createdAt: Date.now(),
        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
      };

      try {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
        localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(currentSession));
      } catch (e) {
        console.warn('[WishAuth] Error saving session to storage:', e);
      }

      // Sync session with Production Server API (Sets HttpOnly wm_session cookie)
      try {
        fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            userId: currentUser.id,
            email: currentUser.email,
            displayName: currentUser.displayName
          })
        }).catch(() => {});
      } catch (e) {}

      // Migrate any guest draft or unassigned local wishes to this user
      WishAuth.migrateGuestData(currentUser.id);

      if (notify) {
        notifyAuthChange();
      }

      return currentUser;
    },

    /**
     * Create / Sign-in with custom test user (email + name) without storing fake passwords
     */
    signInWithCustomDevAccount(name, email) {
      const cleanName = (name || '').trim() || 'Creative Creator';
      const cleanEmail = (email || '').trim().toLowerCase() || 'creator@example.com';
      const userId = 'usr_' + cleanEmail.replace(/[^a-z0-9]/g, '_').slice(0, 16) + '_' + Math.random().toString(36).substr(2, 4);

      const newUser = {
        id: userId,
        email: cleanEmail,
        displayName: cleanName,
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanName)}`,
        provider: 'dev_custom',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Save to known users list
      try {
        const customUsers = WishAuth.getAllKnownUsers();
        if (!customUsers.some(u => u.id === newUser.id)) {
          customUsers.push(newUser);
          localStorage.setItem(STORAGE_KEY_ALL_USERS, JSON.stringify(customUsers));
        }
      } catch (e) {}

      return WishAuth.signInWithDevAccount(newUser);
    },

    getAllKnownUsers() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_ALL_USERS);
        const custom = stored ? JSON.parse(stored) : [];
        return [...DEV_ACCOUNTS, ...custom];
      } catch (e) {
        return [...DEV_ACCOUNTS];
      }
    },

    /**
     * Update Current User Profile (Display Name & Avatar)
     */
    updateProfile(updates = {}) {
      if (!currentUser) return null;

      currentUser = {
        ...currentUser,
        displayName: updates.displayName !== undefined ? updates.displayName.trim() : currentUser.displayName,
        avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl.trim() : currentUser.avatarUrl,
        updatedAt: new Date().toISOString()
      };

      try {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
      } catch (e) {}

      notifyAuthChange();
      return currentUser;
    },

    /**
     * Sign Out
     */
    signOut() {
      currentUser = null;
      currentSession = null;
      try {
        localStorage.removeItem(STORAGE_KEY_USER);
        localStorage.removeItem(STORAGE_KEY_SESSION);
      } catch (e) {}

      // Clear server session cookie
      try {
        fetch('/api/auth/signout', {
          method: 'POST',
          credentials: 'include'
        }).catch(() => {});
      } catch (e) {}

      notifyAuthChange();
    },

    /**
     * Migrate guest drafts and unowned wishes to the logged-in user
     */
    migrateGuestData(userId) {
      if (!userId) return;

      // 1. Migrate guest drafts
      try {
        const rawDrafts = localStorage.getItem('wishmagic_drafts');
        if (rawDrafts) {
          const drafts = JSON.parse(rawDrafts);
          if (Array.isArray(drafts)) {
            let updated = false;
            drafts.forEach(d => {
              if (!d.userId || d.userId === 'guest') {
                d.userId = userId;
                updated = true;
              }
            });
            if (updated) {
              localStorage.setItem('wishmagic_drafts', JSON.stringify(drafts));
              console.log('[WishAuth] Migrated guest drafts to user:', userId);
            }
          }
        }
      } catch (e) {
        console.warn('[WishAuth] Error migrating drafts:', e);
      }

      // 2. Migrate guest wishes
      try {
        const rawWishes = localStorage.getItem('wishmagic_user_wishes');
        if (rawWishes) {
          const wishes = JSON.parse(rawWishes);
          if (Array.isArray(wishes)) {
            let updated = false;
            wishes.forEach(w => {
              if (!w.userId || w.userId === 'guest') {
                w.userId = userId;
                updated = true;
              }
            });
            if (updated) {
              localStorage.setItem('wishmagic_user_wishes', JSON.stringify(wishes));
              console.log('[WishAuth] Migrated guest wishes to user:', userId);
            }
          }
        }
      } catch (e) {
        console.warn('[WishAuth] Error migrating wishes:', e);
      }
    },

    /**
     * Route Protection Guard
     */
    requireAuth(options = {}) {
      if (WishAuth.isAuthenticated()) {
        return true;
      }

      const redirectTo = options.redirectTo || null;
      const message = options.message || 'Please sign in to access your creator dashboard.';

      if (options.showModal !== false) {
        openAuthModal('signin', message);
      }

      if (redirectTo && typeof window !== 'undefined') {
        window.location.href = redirectTo;
      }

      return false;
    },

    /**
     * Admin Route Protection Guard (Part 10)
     * Enforces requireAuth() + requireAdmin(). If not admin, displays Access Denied (403)
     */
    requireAdmin(options = {}) {
      const containerId = options.containerId || 'admin-main-content';
      const barrierId = options.barrierId || 'admin-access-denied-barrier';

      if (WishAuth.isAuthenticated() && WishAuth.isAdmin()) {
        const barrier = document.getElementById(barrierId);
        if (barrier) barrier.classList.add('hidden');
        const container = document.getElementById(containerId);
        if (container) container.classList.remove('hidden');
        return true;
      }

      // Not an admin: render or reveal access denied barrier
      const barrier = document.getElementById(barrierId);
      const container = document.getElementById(containerId);

      if (container) container.classList.add('hidden');

      if (barrier) {
        barrier.classList.remove('hidden');
      } else {
        // Create access denied barrier
        const newBarrier = document.createElement('div');
        newBarrier.id = barrierId;
        newBarrier.className = 'w-full min-h-[60vh] flex items-center justify-center p-6';
        newBarrier.innerHTML = `
          <div class="max-w-md w-full p-8 rounded-3xl bg-surface-container-high/90 border border-rose-500/40 text-center shadow-2xl backdrop-blur-xl">
            <div class="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center text-3xl mx-auto mb-4 border border-rose-500/30">
              🛡️
            </div>
            <div class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 mb-2">
              403 FORBIDDEN • ADMIN ACCESS REQUIRED
            </div>
            <h2 class="text-2xl font-black text-on-surface mb-2">Access Denied</h2>
            <p class="text-xs text-on-surface-variant mb-6 leading-relaxed">
              You are signed in as <strong>${currentUser ? currentUser.displayName : 'Guest'}</strong> (${currentUser ? currentUser.email : 'not authenticated'}).
              This management studio is restricted to platform administrators.
            </p>
            <div class="space-y-3">
              <button onclick="WishAuth.signInWithDevAccount('usr_admin_999'); location.reload();" class="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-bold text-xs shadow-lg hover:brightness-110 active:scale-95 transition cursor-pointer flex items-center justify-center gap-2">
                <span>⚡ Switch to Development Admin</span>
                <span>(Testing Mode)</span>
              </button>
              <a href="/marketplace.html" class="block w-full py-2.5 px-4 rounded-xl bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest font-bold text-xs transition">
                ← Return to Public Marketplace
              </a>
            </div>
          </div>
        `;
        const targetParent = container ? container.parentNode : document.body;
        targetParent.appendChild(newBarrier);
      }

      return false;
    }
  };

  // Run initial state recovery
  initAuth();

  // Export to global window
  window.WishAuth = WishAuth;

  // Centralized Authorization Service Interface (Part 10 Architectural Specification)
  window.authorizationService = {
    isAuthenticated: () => WishAuth.isAuthenticated(),
    isAdmin: () => WishAuth.isAdmin(),
    canManageTemplates: () => WishAuth.isAdmin(),
    canManageCategories: () => WishAuth.isAdmin(),
    canManageMedia: () => WishAuth.isAdmin()
  };

  // ---------------------------------------------------------------------------
  // NAVBAR AUTH STATE RENDERER & ACCOUNT DROPDOWN
  // ---------------------------------------------------------------------------
  function renderNavbarAuthState() {
    const user = WishAuth.getCurrentUser();
    const navAuthContainers = document.querySelectorAll('[data-purpose="navbar-auth"], .navbar-auth-container');

    navAuthContainers.forEach(container => {
      if (!user) {
        // Logged Out / Guest state
        container.innerHTML = `
          <div class="flex items-center gap-1.5 sm:gap-2">
            <button class="px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-[11px] sm:text-xs md:text-sm font-bold text-purple-950 dark:text-purple-100 rounded-full hover:bg-white/80 dark:hover:bg-purple-900/70 hover:text-purple-700 dark:hover:text-pink-300 transition whitespace-nowrap cursor-pointer" onclick="openAuthModal('signin')">
              Sign In
            </button>
            <button class="px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-[11px] sm:text-xs md:text-sm font-bold text-white bg-gradient-to-r from-[#EC4899] to-[#7C3AED] rounded-full shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-1 whitespace-nowrap cursor-pointer" onclick="openAuthModal('signup')">
              <span>Sign Up</span>
              <span class="text-amber-300 text-[10px] sm:text-xs">✨</span>
            </button>
          </div>
        `;
      } else {
        // Authenticated Creator Account Menu
        const initials = user.displayName ? user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'ME';
        container.innerHTML = `
          <div class="relative" id="account-dropdown-wrapper">
            <button onclick="toggleAccountMenu(event)" class="flex items-center gap-2 p-1 sm:pr-3 rounded-full glass-pill hover:border-pink-400 transition cursor-pointer" id="btn-account-menu">
              <img src="${user.avatarUrl}" alt="${user.displayName}" class="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-pink-400 shadow-sm" onerror="this.src='https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.displayName)}'"/>
              <div class="hidden sm:flex flex-col text-left leading-tight">
                <span class="text-xs font-bold text-purple-950 dark:text-white truncate max-w-[110px]">${user.displayName}</span>
                <span class="text-[9px] text-pink-600 dark:text-pink-400 font-semibold flex items-center gap-0.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Creator
                </span>
              </div>
              <span class="material-symbols-outlined text-[16px] text-purple-600 dark:text-purple-300">expand_more</span>
            </button>

            <!-- Dropdown Menu -->
            <div id="account-dropdown-menu" class="hidden absolute right-0 top-full mt-2 w-60 bg-white dark:bg-purple-950 rounded-2xl shadow-2xl border border-purple-200 dark:border-purple-800 p-2 z-50 animate-scaleUp">
              <div class="px-3 py-2.5 border-b border-purple-100 dark:border-purple-900 flex items-center gap-2.5">
                <img src="${user.avatarUrl}" alt="${user.displayName}" class="w-9 h-9 rounded-full object-cover border border-pink-400"/>
                <div class="min-w-0">
                  <div class="text-xs font-bold text-purple-950 dark:text-white truncate">${user.displayName}</div>
                  <div class="text-[10px] text-purple-600 dark:text-purple-400 truncate">${user.email}</div>
                </div>
              </div>

              <div class="py-1">
                <a href="/my-wishes" class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900 transition">
                  <span class="material-symbols-outlined text-[18px] text-pink-500">auto_awesome_mosaic</span>
                  <span>My Wishes</span>
                </a>
                <a href="/my-wishes?tab=favorites" class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900 transition">
                  <span class="material-symbols-outlined text-[18px] text-pink-500 font-fill">favorite</span>
                  <span>Favorite Wishes</span>
                </a>
                <a href="/account" class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900 transition">
                  <span class="material-symbols-outlined text-[18px] text-purple-600 dark:text-purple-400">person</span>
                  <span>Account &amp; Profile</span>
                </a>
                ${user.role === 'admin' || user.isAdmin ? `
                  <a href="/admin/overview" class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition">
                    <span class="material-symbols-outlined text-[18px] text-amber-500">admin_panel_settings</span>
                    <span>Admin Studio ⚙️</span>
                  </a>
                ` : `
                  <a href="/admin/overview" class="flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900 transition">
                    <span class="material-symbols-outlined text-[16px] text-purple-500">lock</span>
                    <span>Admin Portal</span>
                  </a>
                `}
              </div>

              <!-- Dev Account Quick Switcher -->
              <div class="pt-2 border-t border-purple-100 dark:border-purple-900">
                <div class="px-3 py-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center justify-between">
                  <span>⚡ Switch Dev User</span>
                  <span class="text-[9px] text-amber-500 font-black">TESTING</span>
                </div>
                <div class="space-y-0.5 mt-1">
                  <button onclick="WishAuth.signInWithDevAccount('usr_ankit_101')" class="w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-between ${user.id === 'usr_ankit_101' ? 'bg-pink-500/10 text-pink-600 font-bold' : 'text-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900'}">
                    <span>Ankit Verma</span>
                    ${user.id === 'usr_ankit_101' ? '✓' : ''}
                  </button>
                  <button onclick="WishAuth.signInWithDevAccount('usr_priya_202')" class="w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-between ${user.id === 'usr_priya_202' ? 'bg-pink-500/10 text-pink-600 font-bold' : 'text-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900'}">
                    <span>Priya Sharma</span>
                    ${user.id === 'usr_priya_202' ? '✓' : ''}
                  </button>
                  <button onclick="WishAuth.signInWithDevAccount('usr_admin_999')" class="w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-between ${user.id === 'usr_admin_999' ? 'bg-amber-500/20 text-amber-500 font-bold' : 'text-amber-700 dark:text-amber-400 hover:bg-amber-500/10'}">
                    <span>🛡️ Dev Admin</span>
                    ${user.id === 'usr_admin_999' ? '✓' : ''}
                  </button>
                </div>
              </div>

              <div class="pt-2 mt-1 border-t border-purple-100 dark:border-purple-900">
                <button onclick="WishAuth.signOut()" class="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 transition cursor-pointer">
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
    renderNavbarAuthState();
    setupGlobalAuthModal();
  });

  // ---------------------------------------------------------------------------
  // UPGRADED AUTH MODAL (Replaces fake mockAuthSuccess with real authService)
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
      ? 'Start surprising your loved ones with interactive 3D wish websites ✨'
      : 'Sign in to access your saved wishes, continue drafts, and manage celebrations.');

    modal.innerHTML = `
      <div class="bg-white dark:bg-[#1A0B2E] rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl relative border border-purple-200 dark:border-purple-800 text-center animate-scaleUp overflow-hidden">
        <!-- Close Button -->
        <button class="absolute top-4 right-4 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 hover:text-black dark:hover:text-white flex items-center justify-center font-bold transition cursor-pointer" onclick="closeAuthModal()">
          ✕
        </button>

        <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pink-500 via-purple-600 to-amber-300 text-white flex items-center justify-center mx-auto text-2xl mb-3 shadow-lg shadow-pink-500/25">
          🪄
        </div>

        <h3 class="font-display font-extrabold text-xl sm:text-2xl text-purple-950 dark:text-white" id="universal-auth-title">${titleText}</h3>
        <p class="text-xs text-purple-800/80 dark:text-purple-300/80 mt-1 mb-5" id="universal-auth-subtitle">${subText}</p>

        <!-- Development Mode Notice (Transparent & Explicit) -->
        <div class="mb-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-left text-xs">
          <div class="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
            <span class="material-symbols-outlined text-[16px]">info</span>
            <span>Development Authentication Adapter</span>
          </div>
          <p class="text-[11px] text-amber-700/90 dark:text-amber-300/80 mt-1 leading-snug">
            Real Google &amp; Apple OAuth will connect in the production cloud deployment phase. For local testing, choose a development identity below to test complete user ownership!
          </p>
        </div>

        <!-- 1-Click Fast Development User Profiles -->
        <div class="space-y-2 mb-4">
          <div class="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 text-left px-1">
            ⚡ Quick Test Profiles
          </div>
          <button onclick="handleDevAuthSelect('usr_ankit_101')" class="w-full p-2.5 rounded-2xl glass-pill hover:border-pink-500 flex items-center justify-between text-left transition cursor-pointer group">
            <div class="flex items-center gap-2.5">
              <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80" class="w-8 h-8 rounded-full object-cover border border-purple-400"/>
              <div>
                <div class="text-xs font-bold text-purple-950 dark:text-white group-hover:text-pink-600">Ankit Verma</div>
                <div class="text-[10px] text-purple-600 dark:text-purple-400">ankit@example.com</div>
              </div>
            </div>
            <span class="text-xs font-bold text-pink-600 dark:text-pink-400 flex items-center gap-1">
              <span>Sign in as Ankit</span>
              <span>→</span>
            </span>
          </button>

          <button onclick="handleDevAuthSelect('usr_priya_202')" class="w-full p-2.5 rounded-2xl glass-pill hover:border-pink-500 flex items-center justify-between text-left transition cursor-pointer group">
            <div class="flex items-center gap-2.5">
              <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80" class="w-8 h-8 rounded-full object-cover border border-purple-400"/>
              <div>
                <div class="text-xs font-bold text-purple-950 dark:text-white group-hover:text-pink-600">Priya Sharma</div>
                <div class="text-[10px] text-purple-600 dark:text-purple-400">priya@example.com (Creator)</div>
              </div>
            </div>
            <span class="text-xs font-bold text-pink-600 dark:text-pink-400 flex items-center gap-1">
              <span>Sign in as Priya</span>
              <span>→</span>
            </span>
          </button>

          <button onclick="handleDevAuthSelect('usr_admin_999')" class="w-full p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/40 hover:border-amber-500 flex items-center justify-between text-left transition cursor-pointer group">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-purple-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                🛡️
              </div>
              <div>
                <div class="text-xs font-bold text-amber-900 dark:text-amber-200 group-hover:text-amber-600 flex items-center gap-1.5">
                  <span>Development Admin</span>
                  <span class="px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500 text-purple-950">ADMIN</span>
                </div>
                <div class="text-[10px] text-purple-600 dark:text-purple-400">admin@wishmagic.internal</div>
              </div>
            </div>
            <span class="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <span>Admin Studio</span>
              <span>→</span>
            </span>
          </button>
        </div>

        <div class="relative my-4 flex items-center justify-center">
          <div class="border-t border-purple-200 dark:border-purple-800 w-full"></div>
          <span class="bg-white dark:bg-[#1A0B2E] px-3 text-[11px] text-purple-400 font-semibold absolute">or test custom identity</span>
        </div>

        <!-- Custom User Login / Registration Form -->
        <form onsubmit="handleCustomAuthSubmit(event)" class="space-y-2.5 text-left">
          <div>
            <label class="block text-[11px] font-bold text-purple-800 dark:text-purple-300 mb-1">Your Display Name</label>
            <input id="auth-input-name" type="text" placeholder="e.g. Rahul Mehta" required class="w-full text-xs rounded-xl border border-purple-200 dark:border-purple-800 p-2.5 focus:ring-2 focus:ring-pink-500 focus:outline-none bg-white/70 dark:bg-purple-950/60 text-purple-950 dark:text-white"/>
          </div>
          <div>
            <label class="block text-[11px] font-bold text-purple-800 dark:text-purple-300 mb-1">Email Address</label>
            <input id="auth-input-email" type="email" placeholder="rahul@example.com" required class="w-full text-xs rounded-xl border border-purple-200 dark:border-purple-800 p-2.5 focus:ring-2 focus:ring-pink-500 focus:outline-none bg-white/70 dark:bg-purple-950/60 text-purple-950 dark:text-white"/>
          </div>
          <button type="submit" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5">
            <span>Continue to Creator Studio</span>
            <span>✨</span>
          </button>
        </form>

        <!-- OAuth Notice -->
        <div class="mt-4 pt-3 border-t border-purple-100 dark:border-purple-900 text-center">
          <div class="text-[10px] text-purple-600 dark:text-purple-400">
            🔒 Passwords are never stored in frontend code. Real OAuth tokens will be handled server-side.
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
    // Also close legacy modal if open
    const legacyModal = document.getElementById('auth-modal');
    if (legacyModal) {
      legacyModal.classList.add('hidden');
      legacyModal.classList.remove('flex');
    }
  };

  window.handleDevAuthSelect = function(devUserId) {
    WishAuth.signInWithDevAccount(devUserId);
    closeAuthModal();
    showAuthToast(`Welcome back, ${WishAuth.getCurrentUser().displayName}! ✨`);
  };

  window.handleCustomAuthSubmit = function(e) {
    e.preventDefault();
    const name = document.getElementById('auth-input-name')?.value || '';
    const email = document.getElementById('auth-input-email')?.value || '';
    WishAuth.signInWithCustomDevAccount(name, email);
    closeAuthModal();
    showAuthToast(`Signed in as ${name}! ✨`);
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
    }, 2800);
  }

  function setupGlobalAuthModal() {
    // Intercept legacy openAuthModal calls to route through upgraded modal
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

})(window);
