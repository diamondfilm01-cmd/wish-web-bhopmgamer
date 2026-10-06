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
  '/admin/anktech/anktech/admin/staff': '/admin-staff.html',
  '/admin-login': '/admin-login.html',
  '/admin-login.html': '/admin-login.html'
};

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // Block plain /admin routes without the secret token
  if ((pathname === '/admin' || pathname.startsWith('/admin/')) && !pathname.startsWith('/admin/anktech/anktech/admin')) {
    return new Response('Not Found', { status: 404 });
  }

  // Secret Admin Portal Entry: Verify admin session
  if (pathname.startsWith('/admin/anktech/anktech/admin')) {
    const cookieHeader = context.request.headers.get('Cookie') || '';
    const match = cookieHeader.match(/wm_session=([^;]+)/);
    const sessionToken = match ? decodeURIComponent(match[1]) : null;

    let isAuthenticatedAdmin = false;
    if (sessionToken && context.env.DB && typeof context.env.DB.prepare === 'function') {
      try {
        const sessionRow = await context.env.DB.prepare(
          'SELECT s.user_id, u.role as user_role, ar.role as admin_role FROM sessions s LEFT JOIN users u ON u.id = s.user_id LEFT JOIN admin_roles ar ON ar.user_id = s.user_id WHERE s.token = ? AND s.expires_at > ? LIMIT 1'
        ).bind(sessionToken, Date.now()).first();

        if (sessionRow && (sessionRow.user_role === 'admin' || sessionRow.admin_role === 'OWNER' || sessionRow.admin_role === 'ADMIN')) {
          isAuthenticatedAdmin = true;
        }
      } catch (e) {
        console.warn('[Admin Auth Check Error]', e);
      }
    }

    // If not authenticated, serve the login page first!
    if (!isAuthenticatedAdmin) {
      const loginReq = new Request(new URL('/admin-login.html', context.request.url), context.request);
      return await context.next(loginReq);
    }

    // Already authenticated -> serve requested admin page directly without repeated login!
    const targetFile = ADMIN_ROUTES_MAP[pathname] || '/admin-overview.html';
    const pageReq = new Request(new URL(targetFile, context.request.url), context.request);
    return await context.next(pageReq);
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
