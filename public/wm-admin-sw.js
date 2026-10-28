/**
 * WishMagic Admin Studio — Production Service Worker (v1.4.0)
 *
 * STRICT SECURITY & CACHING POLICY (Checklist Items 31, 32, 33, 34, 52, 58):
 * 1. ONLY caches safe, non-sensitive static assets (CSS, JS shell, icons, manifest).
 * 2. NEVER caches:
 *    - Any `/api/*` or `/auth/*` request (admin or public API responses)
 *    - Any non-GET request (`POST`, `PUT`, `PATCH`, `DELETE`)
 *    - Any authenticated Admin HTML document (`/admin/anktech/anktech/admin*`, `/admin*.html`)
 *    - Any personal user data, session endpoints, or customer wish links (`/w/*`, `/wish/*`)
 *    - Any request carrying `Authorization` headers or `cache: 'no-store'`
 * 3. Supports instant version upgrades via `SKIP_WAITING` and full cache purge on `WM_ADMIN_LOGOUT`.
 */

const SW_VERSION = 'wm-admin-pwa-v1.6.0-20261028';
const STATIC_CACHE_NAME = `wishmagic-admin-static-${SW_VERSION}`;

// Safe static assets allowlist (strictly public CSS, JS shell, icons, and webmanifest)
const SAFE_STATIC_PRECACHE_URLS = [
  '/wm-clay-admin.webmanifest',
  '/css/admin-theme.css',
  '/css/clay-admin-app.css',
  '/js/tailwind-config.js',
  '/js/admin-theme.js',
  '/js/WishMagicCore.js',
  '/assets/icons/admin-icon-192.png',
  '/assets/icons/admin-icon-512.png',
  '/assets/icons/admin-icon-maskable-192.png',
  '/assets/icons/admin-icon-maskable-512.png',
  '/assets/icons/apple-touch-icon.png'
];

const SAFE_STATIC_PATH_ALLOWLIST = new Set([
  '/wm-clay-admin.webmanifest',
  '/css/admin-theme.css',
  '/css/clay-admin-app.css',
  '/css/cloud-background.css',
  '/js/tailwind-config.js',
  '/js/admin-theme.js',
  '/js/WishMagicCore.js',
  '/js/api-client.js',
  '/js/auth-service.js',
  '/js/wish-lifecycle.js',
  '/js/repositories.js',
  '/js/analytics-service.js',
  '/js/share-system.js',
  '/js/security-hardening.js',
  '/js/admin-template-uploader.js',
  '/js/clay-admin-app.js',
  '/assets/icons/admin-icon-192.png',
  '/assets/icons/admin-icon-512.png',
  '/assets/icons/admin-icon-maskable-192.png',
  '/assets/icons/admin-icon-maskable-512.png',
  '/assets/icons/apple-touch-icon.png'
]);

/**
 * Determines if a request must strictly bypass Service Worker caching (Item 33).
 */
function mustBypassCache(request, url) {
  if (!request || !url) return true;

  // 1. Only GET requests can ever use static cache
  if (request.method !== 'GET') return true;

  // 2. Only same-origin requests are managed
  if (url.origin !== self.location.origin) return true;

  const pathname = url.pathname || '/';

  // 3. NEVER cache API responses, auth endpoints, media streams, or wish links
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/w/') ||
    pathname.startsWith('/wish/') ||
    pathname.startsWith('/template/') ||
    pathname.startsWith('/templates-store/')
  ) {
    return true;
  }

  // 4. NEVER cache authenticated Admin HTML pages or any HTML document navigations
  if (
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    pathname.startsWith('/admin') ||
    pathname.endsWith('.html') ||
    pathname === '/'
  ) {
    return true;
  }

  // 5. NEVER cache requests with Authorization headers or explicit no-store
  if (request.headers && (request.headers.get('Authorization') || request.headers.get('X-CSRF-Token'))) {
    return true;
  }
  if (request.cache === 'no-store' || request.cache === 'reload') {
    return true;
  }

  // 6. Only allow explicitly safe static assets (/assets/icons/* or SAFE_STATIC_PATH_ALLOWLIST)
  if (SAFE_STATIC_PATH_ALLOWLIST.has(pathname) || pathname.startsWith('/assets/icons/')) {
    return false;
  }

  return true;
}

function buildOfflineAdminResponse() {
  const html = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="theme-color" content="#111714"/>
  <title>WishMagic Admin Studio — Offline</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: #111714;
      color: #eff5f1;
      font-family: -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", "Segoe UI", Roboto, sans-serif;
    }
    .card {
      width: 100%;
      max-width: 420px;
      background: #1a231e;
      border: 1px solid #26342c;
      border-radius: 22px;
      padding: 28px 24px;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
    }
    .badge {
      width: 56px;
      height: 56px;
      border-radius: 999px;
      background: rgba(56, 201, 118, 0.16);
      color: #38c976;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      margin-bottom: 14px;
      border: 1px solid rgba(56, 201, 118, 0.35);
    }
    h1 {
      font-size: 20px;
      font-weight: 800;
      margin: 0 0 8px 0;
    }
    p {
      font-size: 13.5px;
      line-height: 1.55;
      color: #96aba0;
      margin: 0 0 20px 0;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 46px;
      padding: 12px 20px;
      border-radius: 999px;
      background: #38c976;
      color: #0b1911;
      font-size: 14px;
      font-weight: 800;
      border: none;
      cursor: pointer;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">⚡</div>
    <h1>Internet Connection Required</h1>
    <p>WishMagic Admin Studio is connected to your live Cloudflare D1 database, ImgBB, and Backblaze B2 storage. Please check your network connection and tap Retry.</p>
    <button type="button" class="btn" onclick="window.location.reload()">Retry Connection</button>
  </div>
  <script>
    window.addEventListener('online', function() { window.location.reload(); });
  </script>
</body>
</html>`;
  return new Response(html, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        SAFE_STATIC_PRECACHE_URLS.map(async (assetUrl) => {
          try {
            const res = await fetch(new Request(assetUrl, { cache: 'reload' }));
            if (res && res.ok && res.status === 200) {
              await cache.put(assetUrl, res.clone());
            }
          } catch (_) {}
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  let url = null;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }

  // Handle offline fallback for Admin navigation requests without ever caching authenticated HTML
  if (
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    (request.mode === 'navigate' || request.destination === 'document') &&
    (url.pathname.startsWith('/admin/anktech/anktech/admin') || url.pathname.startsWith('/admin-'))
  ) {
    event.respondWith(
      fetch(request).catch(() => buildOfflineAdminResponse())
    );
    return;
  }

  // Strictly bypass cache for APIs, mutations, personal data, and non-allowlisted paths
  if (mustBypassCache(request, url)) {
    return;
  }

  // Network-First with Safe Static Cache Fallback for allowlisted static assets
  const canonicalAssetKey = url.pathname;
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE_NAME);
      try {
        const isScriptOrStyle = canonicalAssetKey.endsWith('.js') || canonicalAssetKey.endsWith('.css');
        const networkResponse = await fetch(request, isScriptOrStyle ? { cache: 'no-cache' } : undefined);
        if (
          networkResponse &&
          networkResponse.ok &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic'
        ) {
          const cacheControl = (networkResponse.headers.get('Cache-Control') || '').toLowerCase();
          if (!cacheControl.includes('no-store') && !cacheControl.includes('private')) {
            cache.put(canonicalAssetKey, networkResponse.clone()).catch(() => {});
          }
        }
        return networkResponse;
      } catch (networkErr) {
        const cachedResponse = await cache.match(canonicalAssetKey) || await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }
        throw networkErr;
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'WM_ADMIN_LOGOUT' || data.type === 'CLEAR_ADMIN_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  } else if (data.type === 'GET_SW_VERSION') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ version: SW_VERSION });
    }
  }
});
