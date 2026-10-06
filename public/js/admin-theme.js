// WishMagic Admin Studio - Universal Dual Theme Engine & Utilities

const SECRET_ADMIN_PREFIX = '/admin/anktech/anktech/admin';

function isStaticEnvironment() {
  const host = window.location.hostname.toLowerCase();
  const path = window.location.pathname.toLowerCase();
  return host.includes('pages.dev') || path.endsWith('.html') || path.startsWith('/admin-');
}

// Extract and cache any auth token passed via URL
(function syncAdminTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('auth') || params.get('token');
  if (urlToken) {
    localStorage.setItem('wishmagic_admin_token', urlToken);
    localStorage.setItem('wishmagic_auth_token', urlToken);
    sessionStorage.setItem('wm_admin_verified', 'true');
    try {
      document.cookie = 'wm_session=' + encodeURIComponent(urlToken) + '; Path=/; Max-Age=2592000; SameSite=Lax';
      document.cookie = 'wishmagic_admin_token=' + encodeURIComponent(urlToken) + '; Path=/; Max-Age=2592000; SameSite=Lax';
    } catch (e) {}
  }
})();

// 1. Client-Side Admin Session Gatekeeper (Verifies session & prevents repeated logins)
(async function checkAdminGatekeeper() {
  const currentPath = window.location.pathname.toLowerCase();
  const loginUrl = isStaticEnvironment() ? '/admin-login.html' : `${SECRET_ADMIN_PREFIX}/login`;

  // If already at login page, do not redirect
  if (currentPath === loginUrl.toLowerCase() || currentPath.endsWith('admin-login.html') || currentPath.endsWith('/login')) {
    return;
  }

  const adminToken = localStorage.getItem('wishmagic_admin_token') || localStorage.getItem('wishmagic_auth_token');

  // If already verified in this session or we hold a valid admin token, keep user in Admin Studio
  if (sessionStorage.getItem('wm_admin_verified') === 'true' || adminToken) {
    sessionStorage.setItem('wm_admin_verified', 'true');
    return;
  }

  try {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.isAuthenticated && data.user && (data.user.role === 'admin' || data.user.isAdmin)) {
        sessionStorage.setItem('wm_admin_verified', 'true');
        return;
      }
    }
    // If not authenticated, open login
    window.location.replace(loginUrl);
  } catch (err) {
    console.warn('[Admin Gatekeeper]', err);
  }
})();

// 2. Automatically ensure all navigation links work seamlessly on both Cloudflare Pages and Express
function rewriteAdminSidebarLinks() {
  const isStatic = isStaticEnvironment();
  const token = localStorage.getItem('wishmagic_admin_token') || localStorage.getItem('wishmagic_auth_token');
  if (token) {
    try {
      document.cookie = 'wm_session=' + encodeURIComponent(token) + '; Path=/; Max-Age=2592000; SameSite=Lax';
    } catch (e) {}
  }

  document.querySelectorAll('a[href*="admin"]').forEach(a => {
    let href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

    if (isStatic) {
      // Map section names to static html files on Cloudflare Pages
      if (href.includes('user-creations')) href = '/admin-user-creations.html';
      else if (href.includes('overview')) href = '/admin-overview.html';
      else if (href.includes('media')) href = '/admin-media.html';
      else if (href.includes('templates')) href = '/admin-templates.html';
      else if (href.includes('wishes')) href = '/admin-wishes.html';
      else if (href.includes('users')) href = '/admin-users.html';
      else if (href.includes('occasions')) href = '/admin-occasions.html';
      else if (href.includes('orders')) href = '/admin-orders.html';
      else if (href.includes('settings')) href = '/admin-settings.html';
      else if (href.includes('pricing')) href = '/admin-pricing.html';
      else if (href.includes('staff')) href = '/admin-staff.html';
      else if (href.includes('login')) href = '/admin-login.html';
    } else {
      // Express router format
      if (href.startsWith('/admin') && !href.startsWith(SECRET_ADMIN_PREFIX)) {
        const suffix = href.replace(/^\/admin/, '');
        href = SECRET_ADMIN_PREFIX + (suffix || '/overview');
      }
    }

    // Attach token to avoid session dropping on section navigation
    if (token && !href.includes('auth=') && !href.includes('token=')) {
      const sep = href.includes('?') ? '&' : '?';
      href = href + sep + 'auth=' + encodeURIComponent(token);
    }
    a.setAttribute('href', href);
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
