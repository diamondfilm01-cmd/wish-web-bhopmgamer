/**
 * Cloudflare Pages Functions Catch-all Adapter
 * Routes dynamic requests and pretty URLs directly through the centralized worker API in src/worker.js
 * Includes Clean-URL 308 redirect loop protection for Cloudflare Pages ASSETS.fetch.
 */

import worker from '../src/worker.js';

const ADMIN_ROUTES_MAP = {
  '/admin/anktech/anktech/admin': '/admin-overview.html',
  '/admin/anktech/anktech/admin/': '/admin-overview.html',
  '/admin/anktech/anktech/admin/overview': '/admin-overview.html',
  '/admin/anktech/anktech/admin/overview/': '/admin-overview.html',
  '/admin/anktech/anktech/admin/analytics': '/admin-analytics.html',
  '/admin/anktech/anktech/admin/analytics/': '/admin-analytics.html',
  '/admin/anktech/anktech/admin/user-creations': '/admin-user-creations.html',
  '/admin/anktech/anktech/admin/user-creations/': '/admin-user-creations.html',
  '/admin/anktech/anktech/admin/creations': '/admin-user-creations.html',
  '/admin/anktech/anktech/admin/creations/': '/admin-user-creations.html',
  '/admin/anktech/anktech/admin/templates': '/admin-templates.html',
  '/admin/anktech/anktech/admin/templates/': '/admin-templates.html',
  '/admin/anktech/anktech/admin/add-template': '/admin-add-template.html',
  '/admin/anktech/anktech/admin/add-template/': '/admin-add-template.html',
  '/admin/anktech/anktech/admin/search': '/admin-search.html',
  '/admin/anktech/anktech/admin/search/': '/admin-search.html',
  '/admin/anktech/anktech/admin/occasions': '/admin-occasions.html',
  '/admin/anktech/anktech/admin/occasions/': '/admin-occasions.html',
  '/admin/anktech/anktech/admin/categories': '/admin-occasions.html',
  '/admin/anktech/anktech/admin/categories/': '/admin-occasions.html',
  '/admin/anktech/anktech/admin/users': '/admin-users.html',
  '/admin/anktech/anktech/admin/users/': '/admin-users.html',
  '/admin/anktech/anktech/admin/wishes': '/admin-wishes.html',
  '/admin/anktech/anktech/admin/wishes/': '/admin-wishes.html',
  '/admin/anktech/anktech/admin/orders': '/admin-orders.html',
  '/admin/anktech/anktech/admin/orders/': '/admin-orders.html',
  '/admin/anktech/anktech/admin/media': '/admin-media.html',
  '/admin/anktech/anktech/admin/media/': '/admin-media.html',
  '/admin/anktech/anktech/admin/storage-health': '/admin-storage-health.html',
  '/admin/anktech/anktech/admin/storage-health/': '/admin-storage-health.html',
  '/admin/anktech/anktech/admin/storage': '/admin-storage-health.html',
  '/admin/anktech/anktech/admin/storage/': '/admin-storage-health.html',
  '/admin/anktech/anktech/admin/moderation': '/admin-moderation.html',
  '/admin/anktech/anktech/admin/moderation/': '/admin-moderation.html',
  '/admin/anktech/anktech/admin/support': '/admin-support.html',
  '/admin/anktech/anktech/admin/support/': '/admin-support.html',
  '/admin/anktech/anktech/admin/audit-logs': '/admin-audit-logs.html',
  '/admin/anktech/anktech/admin/audit-logs/': '/admin-audit-logs.html',
  '/admin/anktech/anktech/admin/audit': '/admin-audit-logs.html',
  '/admin/anktech/anktech/admin/audit/': '/admin-audit-logs.html',
  '/admin/anktech/anktech/admin/pricing': '/admin-pricing.html',
  '/admin/anktech/anktech/admin/pricing/': '/admin-pricing.html',
  '/admin/anktech/anktech/admin/settings': '/admin-settings.html',
  '/admin/anktech/anktech/admin/settings/': '/admin-settings.html',
  '/admin/anktech/anktech/admin/diagnostics': '/admin-settings.html',
  '/admin/anktech/anktech/admin/diagnostics/': '/admin-settings.html',
  '/admin/anktech/anktech/admin/staff': '/admin-staff.html',
  '/admin/anktech/anktech/admin/staff/': '/admin-staff.html',
  '/admin/anktech/anktech/admin/referrals': '/admin-referrals.html',
  '/admin/anktech/anktech/admin/referrals/': '/admin-referrals.html',
  '/admin/anktech/anktech/admin/legal': '/admin-legal.html',
  '/admin/anktech/anktech/admin/legal/': '/admin-legal.html',
  '/admin/anktech/anktech/admin/compliance': '/admin-legal.html',
  '/admin/anktech/anktech/admin/compliance/': '/admin-legal.html',
  '/admin/anktech/anktech/admin/announcements': '/admin-announcements.html',
  '/admin/anktech/anktech/admin/announcements/': '/admin-announcements.html',
  '/admin/anktech/anktech/admin/notifications': '/admin-notifications.html',
  '/admin/anktech/anktech/admin/notifications/': '/admin-notifications.html',
  '/admin/anktech/anktech/admin/music': '/admin-media.html',
  '/admin/anktech/anktech/admin/music/': '/admin-media.html',
  '/admin/anktech/anktech/admin/expiring': '/admin-wishes.html',
  '/admin/anktech/anktech/admin/expiring/': '/admin-wishes.html',
  '/admin/anktech/anktech/admin/subscriptions': '/admin-pricing.html',
  '/admin/anktech/anktech/admin/subscriptions/': '/admin-pricing.html',
  '/admin/anktech/anktech/admin/payments': '/admin-orders.html',
  '/admin/anktech/anktech/admin/payments/': '/admin-orders.html',
  '/admin/anktech/anktech/admin/backups': '/admin-storage-health.html',
  '/admin/anktech/anktech/admin/backups/': '/admin-storage-health.html',
  '/admin/anktech/anktech/admin/activity-logs': '/admin-audit-logs.html',
  '/admin/anktech/anktech/admin/activity-logs/': '/admin-audit-logs.html',
};

const PUBLIC_PAGES_MAP = {
  '/': '/index.html',
  '/index.html': '/index.html',
  '/legal': '/legal.html',
  '/legal/': '/legal.html',
  '/legal.html': '/legal.html',
  '/terms': '/legal.html',
  '/terms/': '/legal.html',
  '/terms.html': '/legal.html',
  '/terms-of-service': '/legal.html',
  '/terms-of-service/': '/legal.html',
  '/terms-of-service.html': '/legal.html',
  '/privacy': '/legal.html',
  '/privacy/': '/legal.html',
  '/privacy.html': '/legal.html',
  '/privacy-policy': '/legal.html',
  '/privacy-policy/': '/legal.html',
  '/privacy-policy.html': '/legal.html',
  '/cookies': '/legal.html',
  '/cookies/': '/legal.html',
  '/cookies.html': '/legal.html',
  '/cookie-policy': '/legal.html',
  '/cookie-policy/': '/legal.html',
  '/cookie-policy.html': '/legal.html',
  '/compliance': '/legal.html',
  '/compliance/': '/legal.html',
  '/compliance.html': '/legal.html',
  '/account': '/account.html',
  '/account/': '/account.html',
  '/account.html': '/account.html',
  '/profile': '/account.html',
  '/profile/': '/account.html',
  '/profile.html': '/account.html',
  '/settings': '/account.html',
  '/settings/': '/account.html',
  '/settings.html': '/account.html',
  '/security': '/account.html',
  '/security/': '/account.html',
  '/security.html': '/account.html',
  '/export': '/account.html',
  '/export/': '/account.html',
  '/export.html': '/account.html',
  '/data-export': '/account.html',
  '/data-export/': '/account.html',
  '/data-export.html': '/account.html',
  '/deletion': '/account.html',
  '/deletion/': '/account.html',
  '/deletion.html': '/account.html',
  '/my-wishes': '/my-wishes.html',
  '/my-wishes/': '/my-wishes.html',
  '/my-wishes.html': '/my-wishes.html',
  '/favorites': '/favorites.html',
  '/favorites/': '/favorites.html',
  '/favorites.html': '/favorites.html',
  '/templates': '/templates.html',
  '/templates/': '/templates.html',
  '/templates.html': '/templates.html',
  '/marketplace': '/templates.html',
  '/marketplace/': '/templates.html',
  '/marketplace.html': '/templates.html',
  '/pricing': '/pricing.html',
  '/pricing/': '/pricing.html',
  '/pricing.html': '/pricing.html',
  '/premium': '/pricing.html',
  '/premium/': '/pricing.html',
  '/premium.html': '/pricing.html',
  '/checkout': '/checkout.html',
  '/checkout/': '/checkout.html',
  '/checkout.html': '/checkout.html',
  '/customize': '/customize.html',
  '/customize/': '/customize.html',
  '/customize.html': '/customize.html',
  '/create': '/create.html',
  '/create/': '/create.html',
  '/create.html': '/create.html',
  '/help': '/help.html',
  '/help/': '/help.html',
  '/help.html': '/help.html',
  '/help/contact': '/contact.html',
  '/help/contact/': '/contact.html',
  '/help/contact.html': '/contact.html',
  '/contact': '/contact.html',
  '/contact/': '/contact.html',
  '/contact.html': '/contact.html',
  '/support': '/help.html',
  '/support/': '/help.html',
  '/support.html': '/help.html',
  '/support/tickets': '/support-tickets.html',
  '/support/tickets/': '/support-tickets.html',
  '/support/tickets.html': '/support-tickets.html',
  '/support-tickets': '/support-tickets.html',
  '/support-tickets/': '/support-tickets.html',
  '/support-tickets.html': '/support-tickets.html',
  '/expired': '/expired.html',
  '/expired/': '/expired.html',
  '/expired.html': '/expired.html',
  '/notifications': '/notifications.html',
  '/notifications/': '/notifications.html',
  '/notifications.html': '/notifications.html',
  '/referrals': '/referrals.html',
  '/referrals/': '/referrals.html',
  '/referrals.html': '/referrals.html'
};

/**
 * Fetches a static HTML file from Cloudflare Pages ASSETS or context.next
 * while resolving Clean-URL 308 redirects internally so the browser NEVER gets a redirect loop.
 */
async function serveHtmlAsset(context, targetHtmlFile, search = '') {
  const cleanExtPath = (targetHtmlFile === '/index.html') ? '/' : targetHtmlFile.replace(/\.html$/i, '');
  const candidates = [targetHtmlFile + search, cleanExtPath + search];

  const fetchCandidate = async (pathWithSearch) => {
    const targetUrl = new URL(pathWithSearch, context.request.url);
    const reqInit = { method: 'GET', headers: context.request.headers };
    if (context.env && context.env.ASSETS && typeof context.env.ASSETS.fetch === 'function') {
      return await context.env.ASSETS.fetch(new Request(targetUrl, reqInit));
    }
    if (typeof context.next === 'function') {
      return await context.next(new Request(targetUrl, reqInit));
    }
    return null;
  };

  for (const cand of candidates) {
    try {
      let res = await fetchCandidate(cand);
      // If Cloudflare Pages Clean URLs returned 308/301/302/307 redirect, follow Location once against ASSETS
      if (res && res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('Location');
        if (loc) {
          res = await fetchCandidate(loc);
        }
      }
      if (res && res.status === 200) {
        const headers = new Headers(res.headers);
        headers.set('Content-Type', 'text/html; charset=utf-8');
        headers.set('Cache-Control', 'no-cache, must-revalidate');
        return new Response(res.body, { status: 200, headers });
      }
    } catch (err) {
      console.warn('[serveHtmlAsset candidate warning]', cand, err);
    }
  }
  return null;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const pathname = url.pathname.toLowerCase();

  // Block ALL admin routes EXCEPT the secret path
  if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/admin.') || pathname.startsWith('/admin-')) {
    if (!pathname.startsWith('/admin/anktech/anktech/admin')) {
      return new Response('Not Found', { status: 404 });
    }
  }

  // Secret Admin Portal Entry: Direct route mapping with Server-Side Protection
  if (pathname.startsWith('/admin/anktech/anktech/admin')) {
    if (pathname === '/admin/anktech/anktech/admin/login' || pathname.endsWith('/login')) {
      const loginHtml = await serveHtmlAsset(context, '/admin-login.html', url.search);
      if (loginHtml) return loginHtml;
      const loginReq = new Request(new URL('/admin-login.html', context.request.url), context.request);
      return await context.next(loginReq);
    }

    // Server-Side Authentication & Role Verification
    try {
      const sessionRes = await worker.fetch(new Request(new URL('/api/auth/session', context.request.url), {
        headers: context.request.headers
      }), context.env);

      if (sessionRes.status === 200) {
        const sessionData = await sessionRes.json().catch(() => ({}));
        const u = sessionData.data?.user || sessionData.user;
        const isMaster = u && (u.role === 'admin' || u.role === 'OWNER' || u.role === 'SUPER_ADMIN' || u.isAdmin === true || (u.email && (u.email.toLowerCase() === 'ankit.babusaini@gmail.com' || u.email.toLowerCase() === 'shrijiposhakbhandarshop@gmail.com')));
        if (isMaster) {
          const cleanPath = pathname.replace(/\/+$/, '') || '/admin/anktech/anktech/admin';
          const targetFile = ADMIN_ROUTES_MAP[cleanPath] || ADMIN_ROUTES_MAP[pathname];
          if (!targetFile) {
            return new Response('Not Found', {
              status: 404,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          }
          const adminHtml = await serveHtmlAsset(context, targetFile, url.search);
          if (adminHtml) return adminHtml;
          const destinationUrl = new URL(targetFile + url.search, context.request.url);
          const pageReq = new Request(destinationUrl, context.request);
          return await context.next(pageReq);
        } else if (u) {
          return new Response('Access Denied: Insufficient administrative privileges.', {
            status: 403,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
      }
    } catch (e) {
      console.warn('[Server Admin Guard]', e);
    }

    // Unauthenticated: redirect to login
    return Response.redirect(new URL('/admin/anktech/anktech/admin/login', context.request.url), 302);
  }

  // Pretty admin and storefront route mapping
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  const targetAdminFile = ADMIN_ROUTES_MAP[cleanPath] || ADMIN_ROUTES_MAP[pathname];
  if (targetAdminFile) {
    const adminHtml = await serveHtmlAsset(context, targetAdminFile, url.search);
    if (adminHtml) return adminHtml;
  }

  const targetPublicFile = PUBLIC_PAGES_MAP[cleanPath] || PUBLIC_PAGES_MAP[pathname] || (pathname.endsWith('.html') ? pathname : null);
  if (targetPublicFile) {
    const pubHtml = await serveHtmlAsset(context, targetPublicFile, url.search);
    if (pubHtml) return pubHtml;
  }

  if (pathname.startsWith('/template/')) {
    const tplHtml = await serveHtmlAsset(context, '/template-preview.html', url.search);
    if (tplHtml) return tplHtml;
  }

  const env = {
    ...context.env,
    IMGBB_API_KEY: context.env.IMGBB_API_KEY || null,
    DB: context.env.DB || context.env.wishmagic_db || context.env.DATABASE,
    ASSETS: {
      fetch: async (req) => {
        const reqUrl = typeof req === 'string' ? new URL(req, context.request.url) : new URL(req.url);
        const rawFetcher = (context.env && context.env.ASSETS && typeof context.env.ASSETS.fetch === 'function')
          ? (r) => context.env.ASSETS.fetch(r)
          : (r) => context.next(r);
        let res = await rawFetcher(new Request(reqUrl, { method: 'GET', headers: context.request.headers }));
        if (res && res.status >= 300 && res.status < 400) {
          const loc = res.headers.get('Location');
          if (loc) {
            res = await rawFetcher(new Request(new URL(loc, context.request.url), { method: 'GET', headers: context.request.headers }));
          }
        }
        return res;
      }
    }
  };

  return await worker.fetch(context.request, env, context);
}
