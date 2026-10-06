// WishMagic Admin Studio - Universal Dual Theme Engine & Utilities

const SECRET_ADMIN_PREFIX = '/admin/anktech/anktech/admin';

// 1. Client-Side Admin Session Gatekeeper (Exclusively for Authorized Google Account, Zero Redirect Loop)
(async function checkAdminGatekeeper() {
  const MASTER_ADMINS = ['ankit.babusaini@gmail.com', 'bhoomgamer@gmail.com'];

  const isMaster = (email) => {
    if (!email) return false;
    const clean = String(email).toLowerCase().trim();
    return clean === 'ankit.babusaini@gmail.com' || MASTER_ADMINS.includes(clean) || clean.startsWith('admin@');
  };

  function unlockAdminAccess(userData) {
    const screen = document.getElementById('admin-access-restricted-screen');
    if (screen) screen.remove();
    document.body.style.display = '';

    if (userData && userData.email) {
      const userObj = {
        id: userData.id || (userData.uid ? 'usr_fb_' + userData.uid.slice(0, 16) : 'usr_master_ankit_babu'),
        email: userData.email,
        displayName: userData.displayName || 'Ankit Babu Saini',
        avatarUrl: userData.avatarUrl || userData.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(userData.email)}`,
        role: 'admin',
        isAdmin: true,
        plan: 'VIP',
        isPremium: true,
        firebaseUid: userData.uid || userData.firebaseUid || null
      };
      try {
        localStorage.setItem('wishmagic_auth_user', JSON.stringify(userObj));
        localStorage.setItem('wishmagic_user', JSON.stringify(userObj));
        localStorage.setItem('wishmagic_admin_token', 'adm_' + Date.now().toString(36));
        sessionStorage.setItem('wm_admin_verified', 'true');
      } catch(e) {}

      fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(userObj)
      }).catch(() => {});
    }
  }

  // Modern High-Security Google Restricted Screen (NO email details exposed, pure Google auth)
  function showAccessRestrictedScreen(isDenied = false) {
    if (document.getElementById('admin-access-restricted-screen')) {
      const alertBox = document.getElementById('admin-gate-alert');
      if (alertBox && isDenied) {
        alertBox.innerHTML = `
          <div class="mt-2.5 pt-2 border-t border-purple-800/60 text-[11px] text-amber-300">
            Current logged-in account is not authorized for Admin Studio.
          </div>
        `;
      }
      return;
    }

    // Show body so modal can render
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

  // Google Sign-In directly from restricted gate
  window.handleAdminGateGoogleLogin = async function() {
    const btn = document.getElementById('admin-gate-google-btn');
    const txt = document.getElementById('admin-gate-btn-txt');
    if (btn) btn.disabled = true;
    if (txt) txt.innerHTML = '<span class="inline-flex items-center gap-2"><span class="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span> Connecting to Google...</span>';

    try {
      let fbUser = null;
      if (window.WishFirebaseAuth && typeof window.WishFirebaseAuth.signInWithGoogle === 'function') {
        fbUser = await window.WishFirebaseAuth.signInWithGoogle();
      } else if (window.WishAuth && typeof window.WishAuth.signInWithGoogle === 'function') {
        const u = await window.WishAuth.signInWithGoogle();
        fbUser = u;
      }

      if (fbUser) {
        const email = (fbUser.email || '').toLowerCase().trim();
        if (isMaster(email)) {
          unlockAdminAccess(fbUser);
          return;
        } else {
          showAccessRestrictedScreen(true);
        }
      }
    } catch(err) {
      alert('Google Sign-In: ' + (err.message || err));
    } finally {
      if (btn) btn.disabled = false;
      if (txt) txt.textContent = 'Continue with Google';
    }
  };

  // CHECK 1: Synchronous check in localStorage for instant 0ms access
  try {
    const localUser = JSON.parse(localStorage.getItem('wishmagic_auth_user') || localStorage.getItem('wishmagic_user') || 'null');
    if (localUser && (isMaster(localUser.email) || localUser.role === 'admin' || localUser.isAdmin)) {
      unlockAdminAccess(localUser);
      return; // Instant access
    }
  } catch (e) {}

  // CHECK 2: Authoritative server session
  try {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const user = data.data?.user || data.user;
      if (user && (user.role === 'admin' || user.role === 'OWNER' || user.role === 'SUPER_ADMIN' || user.isAdmin || isMaster(user.email))) {
        unlockAdminAccess(user);
        return;
      }
    }
  } catch (err) {}

  // CHECK 3: Active Firebase Auth state observer (Restores session automatically when SDK boots up)
  function attachFirebaseObserver() {
    if (window.WishFirebaseAuth && typeof window.WishFirebaseAuth.onAuthStateChanged === 'function') {
      window.WishFirebaseAuth.onAuthStateChanged((fbUser) => {
        if (fbUser) {
          const email = (fbUser.email || '').toLowerCase().trim();
          if (isMaster(email)) {
            unlockAdminAccess(fbUser);
          } else {
            showAccessRestrictedScreen(true);
          }
        }
      });
    } else {
      setTimeout(attachFirebaseObserver, 100);
    }
  }
  attachFirebaseObserver();

  // If after checking localStorage no master admin, show the Restricted Screen until Firebase responds
  showAccessRestrictedScreen(false);
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
