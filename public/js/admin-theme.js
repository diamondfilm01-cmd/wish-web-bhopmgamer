// WishMagic Admin Studio - Universal Dual Theme Engine & Utilities

const SECRET_ADMIN_PREFIX = '/admin/anktech/anktech/admin';

// 1. Client-Side Admin Session Gatekeeper (Verifies session & prevents repeated logins)
(async function checkAdminGatekeeper() {
  if (window.location.pathname.includes('admin-login')) return;

  try {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    if (!res.ok) {
      window.location.replace('/admin-login.html');
      return;
    }
    const data = await res.json();
    if (!data || !data.isAuthenticated || !data.user || (data.user.role !== 'admin' && !data.user.isAdmin)) {
      window.location.replace('/admin-login.html');
      return;
    }
    sessionStorage.setItem('wm_admin_verified', 'true');
  } catch (err) {
    console.warn('[Admin Gatekeeper]', err);
  }
})();

// 2. Automatically ensure all sidebar links use the secret admin path
function rewriteAdminSidebarLinks() {
  document.querySelectorAll('#admin-sidebar a[href^="/admin"]').forEach(a => {
    const href = a.getAttribute('href');
    if (!href.startsWith(SECRET_ADMIN_PREFIX)) {
      const suffix = href.replace(/^\/admin/, '');
      a.setAttribute('href', SECRET_ADMIN_PREFIX + (suffix || '/overview'));
    }
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
