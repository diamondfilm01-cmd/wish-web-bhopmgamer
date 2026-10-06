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

(async function checkAdminGatekeeper() {
  'use strict';

  const ADMIN_TARGET = '/admin/anktech/anktech/admin/overview';
  const MASTER_EMAIL = 'ankit.babusaini@gmail.com';

  let navigationStarted = false;
  let sessionCheckStarted = false;
  let firebaseSyncStarted = false;

  const cleanEmail = (value) =>
    String(value || '').trim().toLowerCase();

  const isAuthorizedEmail = (email) =>
    cleanEmail(email) === MASTER_EMAIL;

  function isValidAdminServerUser(user) {
    if (!user) return false;

    const email = cleanEmail(user.email);

    return (
      email === MASTER_EMAIL &&
      (
        user.role === 'admin' ||
        user.role === 'OWNER' ||
        user.role === 'SUPER_ADMIN' ||
        user.isAdmin === true
      )
    );
  }

  function removeGate() {
    const screen = document.getElementById(
      'admin-access-restricted-screen'
    );

    if (screen) {
      screen.remove();
    }

    document.body.style.display = '';

    if (window.__WishMagicVerifiedAdminUser) {
      window.WishMagicAdminSession = {
        authenticated: true,
        user: window.__WishMagicVerifiedAdminUser
      };
    }
  }

  function showAccessRestrictedScreen(isDenied = false) {
    if (document.getElementById('admin-access-restricted-screen')) {
      const alertBox = document.getElementById('admin-gate-alert');
      if (alertBox && isDenied) {
        alertBox.innerHTML = `
          <div class="mt-2.5 pt-2 border-t border-red-800/60 text-[11px] text-red-300">
            Current account is not authorized for Admin Studio.
          </div>
        `;
      }
      return;
    }

    document.body.style.display = 'block';

    const container = document.createElement('div');
    container.id = 'admin-access-restricted-screen';
    container.className = 'fixed inset-0 z-[999999] bg-[#07040d] flex items-center justify-center p-4 text-white font-sans overflow-y-auto';
    container.innerHTML = `
      <div class="fixed -top-32 -left-32 w-96 h-96 bg-purple-600/20 rounded-full blur-[128px] pointer-events-none"></div>
      <div class="fixed -bottom-32 -right-32 w-96 h-96 bg-pink-600/15 rounded-full blur-[128px] pointer-events-none"></div>

      <div class="w-full max-w-md bg-[#120a22]/95 border border-purple-500/30 rounded-3xl p-7 sm:p-8 shadow-[0_0_80px_rgba(0,0,0,0.9),0_0_30px_rgba(124,58,237,0.25)] backdrop-blur-2xl text-center relative z-10 flex flex-col gap-6">
        <div class="flex flex-col items-center gap-3">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 flex items-center justify-center shadow-[0_0_35px_rgba(168,85,247,0.5)] border border-white/20">
            <span class="material-symbols-outlined text-white text-3xl">shield_person</span>
          </div>
          <div>
            <h1 class="text-2xl font-extrabold text-white tracking-tight font-display">
              WishMagic <span class="bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300 bg-clip-text text-transparent">Admin Studio</span>
            </h1>
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] font-bold mt-2">
              <span>🔒 Master Access Restricted</span>
            </div>
          </div>
        </div>

        <div class="bg-purple-950/40 border border-purple-800/60 rounded-2xl p-4 text-left">
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined text-amber-400 text-xl shrink-0 mt-0.5">verified_user</span>
            <div>
              <h2 class="text-xs font-bold text-white uppercase tracking-wider">Authorized Google Admin Only</h2>
              <p class="text-xs text-purple-200/80 mt-1.5 leading-relaxed">
                Yeh Admin Studio password-free hai aur sirf authorized Master Admin Google account ke liye secured hai.
              </p>
              <div id="admin-gate-alert">
                ${isDenied ? `
                  <div class="mt-2.5 pt-2 border-t border-purple-800/60 text-[11px] text-amber-300">
                    Current account is not authorized for Admin Studio.
                  </div>
                ` : `
                  <div class="mt-2.5 pt-2 border-t border-purple-800/60 text-[11px] text-purple-300">
                    Aap currently signed in nahi hain. Niche diye button se Google login karein.
                  </div>
                `}
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <button type="button" id="admin-gate-google-btn" onclick="window.handleAdminGateGoogleLogin()" class="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:brightness-110 text-white font-bold text-sm tracking-wide shadow-[0_0_30px_rgba(147,51,234,0.4)] flex items-center justify-center gap-3 transition-all cursor-pointer active:scale-98">
            <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#ffffff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#ffffff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#ffffff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#ffffff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span id="admin-gate-btn-txt">Continue with Google</span>
          </button>

          <a href="/" class="w-full py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-purple-200 transition-all flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-base">arrow_back</span>
            <span>Return to Main Website</span>
          </a>
        </div>
      </div>
    `;
    document.body.appendChild(container);
  }

  function navigateOnce() {
    if (navigationStarted) {
      return;
    }

    navigationStarted = true;

    window.location.replace(ADMIN_TARGET);
  }

  async function getServerAdminSession() {
    if (sessionCheckStarted) {
      return null;
    }

    sessionCheckStarted = true;

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

      const user =
        data?.data?.user ||
        data?.user ||
        null;

      if (
        response.ok &&
        data?.success === true &&
        data?.isAuthenticated === true &&
        isValidAdminServerUser(user)
      ) {
        window.__WishMagicVerifiedAdminUser = user;
        window.WishMagicAdminSession = {
          authenticated: true,
          user
        };
        return user;
      }

      return null;

    } catch (error) {
      console.warn(
        '[AdminGate] Server session check failed:',
        error
      );

      return null;

    } finally {
      sessionCheckStarted = false;
    }
  }

  async function createAndVerifyServerSession(firebaseUser) {
    if (!firebaseUser) {
      throw new Error('Firebase user is missing.');
    }

    const email = cleanEmail(firebaseUser.email);

    if (!isAuthorizedEmail(email)) {
      throw new Error(
        'This Google account is not authorized for Admin Studio.'
      );
    }

    if (firebaseSyncStarted) {
      return null;
    }

    firebaseSyncStarted = true;

    try {
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          email,
          displayName:
            firebaseUser.displayName ||
            'Ankit Saini',
          avatarUrl:
            firebaseUser.photoURL ||
            null,
          provider: 'google',
          firebaseUid: firebaseUser.uid
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.success !== true) {
        throw new Error(
          data?.error?.message ||
          data?.message ||
          'Could not create secure server session.'
        );
      }

      /*
       * IMPORTANT:
       * Verify the cookie/session using the server.
       */
      const verifiedUser = await getServerAdminSession();

      if (!verifiedUser) {
        throw new Error(
          'Server session was created but could not be verified.'
        );
      }

      window.__WishMagicVerifiedAdminUser = verifiedUser;
      window.WishMagicAdminSession = {
        authenticated: true,
        user: verifiedUser
      };

      return verifiedUser;

    } finally {
      firebaseSyncStarted = false;
    }
  }

  async function bootstrap() {
    /*
     * NEVER inspect localStorage for authorization.
     */

    /*
     * STEP 1:
     * Existing server session.
     */
    const existingUser =
      await getServerAdminSession();

    if (existingUser) {
      window.__WishMagicVerifiedAdminUser = existingUser;
      window.WishMagicAdminSession = {
        authenticated: true,
        user: existingUser
      };
      removeGate();
      return;
    }

    /*
     * STEP 2:
     * Wait for Firebase auth state.
     */
    if (
      window.WishFirebaseAuth &&
      typeof window.WishFirebaseAuth.onAuthStateChanged === 'function'
    ) {
      let handled = false;

      window.WishFirebaseAuth.onAuthStateChanged(
        async (firebaseUser) => {
          if (handled) {
            return;
          }

          if (!firebaseUser) {
            handled = true;
            showAccessRestrictedScreen(false);
            return;
          }

          const email =
            cleanEmail(firebaseUser.email);

          if (!isAuthorizedEmail(email)) {
            handled = true;

            try {
              await window.WishFirebaseAuth.signOut();
            } catch (_) {}

            showAccessRestrictedScreen(true);
            return;
          }

          try {
            await createAndVerifyServerSession(
              firebaseUser
            );

            handled = true;

            /*
             * Session is now server-verified.
             */
            removeGate();

          } catch (error) {
            handled = true;

            console.error(
              '[AdminGate] Firebase → server session failed:',
              error
            );

            showAccessRestrictedScreen(false);

            const alertBox =
              document.getElementById('admin-gate-alert');

            if (alertBox) {
              alertBox.innerHTML = `
                <div class="mt-2.5 pt-2 border-t border-red-800/60 text-[11px] text-red-300">
                  ${String(
                    error?.message ||
                    'Secure Admin session could not be established.'
                  )}
                </div>
              `;
            }
          }
        }
      );

      return;
    }

    showAccessRestrictedScreen(false);
  }

  /*
   * Existing Google gate button.
   * It MUST establish and verify the server session.
   */
  window.handleAdminGateGoogleLogin = async function () {
    if (navigationStarted || firebaseSyncStarted) {
      return;
    }

    const btn =
      document.getElementById('admin-gate-google-btn');

    const txt =
      document.getElementById('admin-gate-btn-txt');

    if (btn) btn.disabled = true;

    if (txt) {
      txt.textContent =
        'Connecting to Google...';
    }

    try {
      const firebaseUser =
        await window.WishFirebaseAuth.signInWithGoogle();

      if (!firebaseUser) {
        throw new Error(
          'Google Sign-In was cancelled.'
        );
      }

      const email =
        cleanEmail(firebaseUser.email);

      if (!isAuthorizedEmail(email)) {
        try {
          await window.WishFirebaseAuth.signOut();
        } catch (_) {}

        throw new Error(
          'This Google account is not authorized for Admin Studio.'
        );
      }

      if (txt) {
        txt.textContent =
          'Verifying secure Admin session...';
      }

      /*
       * IMPORTANT:
       * No navigation until server session is verified.
       */
      await createAndVerifyServerSession(
        firebaseUser
      );

      removeGate();

    } catch (error) {
      console.error(
        '[AdminGate] Login failed:',
        error
      );

      if (txt) {
        txt.textContent =
          'Continue with Google';
      }

      if (btn) {
        btn.disabled = false;
      }

      const alertBox =
        document.getElementById('admin-gate-alert');

      if (alertBox) {
        alertBox.innerHTML = `
          <div class="mt-2.5 pt-2 border-t border-red-800/60 text-[11px] text-red-300">
            ${String(
              error?.message ||
              'Authentication failed.'
            )}
          </div>
        `;
      }
    }
  };

  /*
   * Start only once.
   */
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      bootstrap,
      { once: true }
    );
  } else {
    bootstrap();
  }

})();

// 2. Automatically ensure all sidebar and navigation links strictly use /admin/anktech/anktech/admin/<section>
function rewriteAdminSidebarLinks() {
  const sectionMap = {
    'user-creations': 'user-creations',
    'overview': 'overview',
    'media': 'media',
    'templates': 'templates',
    'wishes': 'wishes',
    'users': 'users',
    'occasions': 'occasions',
    'categories': 'occasions',
    'orders': 'orders',
    'settings': 'settings',
    'pricing': 'pricing',
    'staff': 'staff',
    'login': 'login'
  };

  document.querySelectorAll('a[href*="admin"]').forEach(a => {
    let href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

    // Detect target section
    let matchedSection = 'overview';
    for (const [key, val] of Object.entries(sectionMap)) {
      if (href.toLowerCase().includes(key)) {
        matchedSection = val;
        break;
      }
    }

    // Strictly enforce /admin/anktech/anktech/admin/<section> without query string tokens
    const newHref = `${SECRET_ADMIN_PREFIX}/${matchedSection}`;
    a.setAttribute('href', newHref);
  });
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
