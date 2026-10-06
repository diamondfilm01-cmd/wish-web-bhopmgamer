// WishMagic Admin Studio - Universal Dual Theme Engine & Utilities

const SECRET_ADMIN_PREFIX = '/admin/anktech/anktech/admin';

// 1. Client-Side Admin Session Gatekeeper (Verifies authoritative server session via cookie or Google Admin account)
(async function checkAdminGatekeeper() {
  const currentPath = window.location.pathname.toLowerCase();
  const loginUrl = `${SECRET_ADMIN_PREFIX}/login`;
  const MASTER_ADMINS = ['ankit.babusaini@gmail.com', 'ankitsaini941413@gmail.com'];

  // If already at login page, do not redirect
  if (currentPath === loginUrl.toLowerCase() || currentPath.endsWith('admin-login.html') || currentPath.endsWith('/login')) {
    return;
  }

  // Helper to check if email is master admin
  const isMaster = (email) => email && MASTER_ADMINS.includes(email.toLowerCase().trim());

  try {
    // 1. Check authoritative server session
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const user = data.data?.user || data.user;
      if (user && (user.role === 'admin' || user.role === 'OWNER' || user.role === 'SUPER_ADMIN' || user.isAdmin || isMaster(user.email))) {
        return; // Valid admin session!
      }
    }
  } catch (err) {
    console.warn('[Admin Gatekeeper Session Check]', err);
  }

  // 2. Fallback: Check Firebase Auth state (e.g. if page refreshed before cookie sync)
  try {
    if (window.WishFirebaseAuth) {
      const auth = await window.WishFirebaseAuth.getAuthInstance();
      const fbUser = auth?.currentUser;
      if (fbUser && isMaster(fbUser.email)) {
        // Sync server session immediately
        await fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email: fbUser.email,
            displayName: fbUser.displayName || 'Ankit Saini',
            avatarUrl: fbUser.photoURL,
            role: 'admin',
            firebaseUid: fbUser.uid
          })
        });
        return; // Valid master admin!
      }
    }
  } catch (fbErr) {}

  // 3. Fallback: Check stored user in localStorage
  try {
    const localUser = JSON.parse(localStorage.getItem('wishmagic_user') || 'null');
    if (localUser && isMaster(localUser.email)) {
      return; // Authorized!
    }
  } catch (e) {}

  // Unauthorized: Block access and redirect to login gatekeeper
  document.body.style.display = 'none';
  window.location.replace(loginUrl);
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
