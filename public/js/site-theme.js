// WishMagic Universal Device-Adaptive Theme Engine
(function() {
  function getSystemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function getActiveTheme() {
    const saved = localStorage.getItem('wishmagic_theme') || 'auto';
    if (saved === 'auto') {
      return getSystemTheme();
    }
    return saved;
  }

  function updateThemeUI(isDark, userSetting) {
    const icons = document.querySelectorAll('.site-theme-icon');
    const labels = document.querySelectorAll('.site-theme-label');
    
    icons.forEach(el => {
      el.textContent = isDark ? 'light_mode' : 'dark_mode';
    });

    labels.forEach(el => {
      el.textContent = isDark ? 'Light' : 'Dark';
    });
  }

  function updateBodyBackground(isDark) {
    if (typeof document === 'undefined' || !document.body) return;
    // Cloud background is powered exclusively by /css/cloud-background.css (no cb.png or cbd.png)
    document.body.style.backgroundImage = 'none';
    document.body.style.backgroundColor = 'transparent';
  }

  function applyTheme(targetTheme) {
    const isDark = targetTheme === 'dark';
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      if (document.body) {
        document.body.classList.add('dark');
      }
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
      if (document.body) {
        document.body.classList.remove('dark');
      }
    }
    updateBodyBackground(isDark);
    if (typeof window !== 'undefined' && typeof window.updateHeroVisualsForTheme === 'function') {
      window.updateHeroVisualsForTheme();
    }
    const userSetting = localStorage.getItem('wishmagic_theme') || 'auto';
    updateThemeUI(isDark, userSetting);
  }

  // 1. Initial immediate execution to avoid FOUC (Flash of Unstyled Content)
  applyTheme(getActiveTheme());

  // 2. Listen for Device System Theme changes in real-time
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const saved = localStorage.getItem('wishmagic_theme') || 'auto';
      if (saved === 'auto') {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  // 3. Global toggle function accessible anywhere
  window.toggleSiteTheme = function() {
    const currentIsDark = document.documentElement.classList.contains('dark');
    const newTheme = currentIsDark ? 'light' : 'dark';
    localStorage.setItem('wishmagic_theme', newTheme);
    applyTheme(newTheme);
    
    // Optional toast notification if present
    if (typeof showToast === 'function') {
      showToast(newTheme === 'dark' ? '🌙 Cosmic Dark Theme' : '☀️ Soft Light Theme');
    }
  };

  window.resetThemeToAuto = function() {
    localStorage.setItem('wishmagic_theme', 'auto');
    applyTheme(getSystemTheme());
    if (typeof showToast === 'function') {
      showToast('📱 Switched to Device System Theme');
    }
  };

  // Re-sync UI when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    const isDark = document.documentElement.classList.contains('dark');
    const userSetting = localStorage.getItem('wishmagic_theme') || 'auto';
    updateThemeUI(isDark, userSetting);
  });

  // Ensure solid opaque dropdown styling across all pages
  if (typeof document !== 'undefined') {
    const s = document.createElement('style');
    s.id = 'wishmagic-dropdown-solid-css';
    s.textContent = `
      #account-dropdown-menu,
      .account-dropdown-menu-solid {
        background-color: #ffffff !important;
        background: #ffffff !important;
        opacity: 1 !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        border: 2px solid #ddd6fe !important;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.4), 0 0 30px rgba(124, 58, 237, 0.2) !important;
        z-index: 9999999 !important;
      }
      html.dark #account-dropdown-menu,
      body.dark #account-dropdown-menu,
      [data-theme="dark"] #account-dropdown-menu {
        background-color: #150927 !important;
        background: #150927 !important;
        border-color: #7e22ce !important;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85), 0 0 35px rgba(124, 58, 237, 0.4) !important;
      }
    `;
    if (!document.getElementById('wishmagic-dropdown-solid-css')) {
      (document.head || document.documentElement).appendChild(s);
    }
  }

  // 4. Universal Dreamy Background Engine for full website: Powered exclusively by cloud-background.css
  function ensureCloudyBackground() {
    if (typeof document === 'undefined') return;

    // Link cloud-background.css if not present
    if (!document.getElementById('wishmagic-cloud-css')) {
      const link = document.createElement('link');
      link.id = 'wishmagic-cloud-css';
      link.rel = 'stylesheet';
      link.href = '/css/cloud-background.css';
      document.head.appendChild(link);
    }

    if (document.body) {
      const isDark = document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark';
      updateBodyBackground(isDark);

      // Ensure dedicated cloudy-background-stage div exists for cloud-background.css
      if (!document.querySelector('.cloudy-background-stage')) {
        const stage = document.createElement('div');
        stage.className = 'cloudy-background-stage';
        stage.setAttribute('aria-hidden', 'true');
        document.body.insertBefore(stage, document.body.firstChild);
      }

      const oldLayer = document.querySelector('.bg-ambient-layer');
      if (oldLayer) {
        oldLayer.style.display = 'none';
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureCloudyBackground);
  } else {
    ensureCloudyBackground();
  }
})();
