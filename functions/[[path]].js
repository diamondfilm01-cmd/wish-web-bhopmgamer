/**
 * Cloudflare Pages Functions Catch-all Adapter
 * Routes dynamic requests and pretty URLs directly through the centralized worker API in src/worker.js
 */

import worker from '../src/worker.js';

const ADMIN_ROUTES_MAP = {
  '/admin/anktech/anktech/admin': '/admin-overview.html',
  '/admin/anktech/anktech/admin/': '/admin-overview.html',
  '/admin/anktech/anktech/admin/overview': '/admin-overview.html',
  '/admin/anktech/anktech/admin/templates': '/admin-templates.html',
  '/admin/anktech/anktech/admin/occasions': '/admin-occasions.html',
  '/admin/anktech/anktech/admin/categories': '/admin-occasions.html',
  '/admin/anktech/anktech/admin/users': '/admin-users.html',
  '/admin/anktech/anktech/admin/wishes': '/admin-wishes.html',
  '/admin/anktech/anktech/admin/orders': '/admin-orders.html',
  '/admin/anktech/anktech/admin/media': '/admin-media.html',
  '/admin/anktech/anktech/admin/pricing': '/admin-pricing.html',
  '/admin/anktech/anktech/admin/settings': '/admin-settings.html',
  '/admin/anktech/anktech/admin/user-creations': '/admin-user-creations.html',
  '/admin/anktech/anktech/admin/staff': '/admin-staff.html'
};

const PUBLIC_PAGES_MAP = {
  '/account': '/account.html',
  '/account/': '/account.html',
  '/profile': '/account.html',
  '/profile/': '/account.html',
  '/settings': '/account.html',
  '/settings/': '/account.html',
  '/my-wishes': '/my-wishes.html',
  '/my-wishes/': '/my-wishes.html',
  '/favorites': '/favorites.html',
  '/favorites/': '/favorites.html',
  '/marketplace': '/marketplace.html',
  '/marketplace/': '/marketplace.html',
  '/pricing': '/pricing.html',
  '/pricing/': '/pricing.html',
  '/checkout': '/checkout.html',
  '/checkout/': '/checkout.html',
  '/customize': '/customize.html',
  '/customize/': '/customize.html',
  '/create': '/create.html',
  '/create/': '/create.html'
};

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
        const isMaster = u && (u.role === 'admin' || u.role === 'OWNER' || u.role === 'SUPER_ADMIN' || u.isAdmin === true || (u.email && u.email.toLowerCase() === 'ankit.babusaini@gmail.com'));
        if (isMaster) {
          const cleanPath = pathname.replace(/\/+$/, '');
          const targetFile = ADMIN_ROUTES_MAP[cleanPath] || ADMIN_ROUTES_MAP[pathname] || '/admin-overview.html';
          const pageReq = new Request(new URL(targetFile, context.request.url), context.request);
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
    if (context.env.ASSETS && typeof context.env.ASSETS.fetch === 'function') {
      const pageReq = new Request(new URL(targetAdminFile, context.request.url), context.request);
      return await context.env.ASSETS.fetch(pageReq);
    }
    const pageReq = new Request(new URL(targetAdminFile, context.request.url), context.request);
    return await context.next(pageReq);
  }

  const targetPublicFile = PUBLIC_PAGES_MAP[cleanPath] || PUBLIC_PAGES_MAP[pathname];
  if (targetPublicFile) {
    if (context.env.ASSETS && typeof context.env.ASSETS.fetch === 'function') {
      const pageReq = new Request(new URL(targetPublicFile, context.request.url), context.request);
      return await context.env.ASSETS.fetch(pageReq);
    }
    const pageReq = new Request(new URL(targetPublicFile, context.request.url), context.request);
    return await context.next(pageReq);
  }

  if (pathname.startsWith('/w/')) {
    if (context.env.ASSETS && typeof context.env.ASSETS.fetch === 'function') {
      const wishReq = new Request(new URL('/wish.html', context.request.url), context.request);
      return await context.env.ASSETS.fetch(wishReq);
    }
    const wishReq = new Request(new URL('/wish.html', context.request.url), context.request);
    return await context.next(wishReq);
  }
  if (pathname.startsWith('/template/')) {
    if (context.env.ASSETS && typeof context.env.ASSETS.fetch === 'function') {
      const tplReq = new Request(new URL('/template-preview.html', context.request.url), context.request);
      return await context.env.ASSETS.fetch(tplReq);
    }
    const tplReq = new Request(new URL('/template-preview.html', context.request.url), context.request);
    return await context.next(tplReq);
  }

  const env = {
    ...context.env,
    DB: context.env.DB || context.env.wishmagic_db || context.env.DATABASE,
    ASSETS: {
      fetch: async (req) => {
        const fetchReq = typeof req === 'string' ? new Request(new URL(req, context.request.url), context.request) : req;
        return await context.next(fetchReq);
      }
    }
  };

  return await worker.fetch(context.request, env, context);
}
