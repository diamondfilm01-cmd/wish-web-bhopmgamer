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
        if (u && (u.role === 'admin' || u.role === 'OWNER' || u.role === 'SUPER_ADMIN' || u.isAdmin === true)) {
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
  if (ADMIN_ROUTES_MAP[pathname]) {
    const pageReq = new Request(new URL(ADMIN_ROUTES_MAP[pathname], context.request.url), context.request);
    return await context.next(pageReq);
  }

  if (pathname.startsWith('/w/')) {
    const wishReq = new Request(new URL('/wish.html', context.request.url), context.request);
    return await context.next(wishReq);
  }
  if (pathname.startsWith('/template/')) {
    const tplReq = new Request(new URL('/template-preview.html', context.request.url), context.request);
    return await context.next(tplReq);
  }

  const env = {
    ...context.env,
    ASSETS: {
      fetch: async (req) => {
        const fetchReq = typeof req === 'string' ? new Request(new URL(req, context.request.url), context.request) : req;
        return await context.next(fetchReq);
      }
    }
  };

  return await worker.fetch(context.request, env, context);
}
