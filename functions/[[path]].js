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
  '/admin': '/admin-overview.html',
  '/admin/': '/admin-overview.html',
  '/admin/overview': '/admin-overview.html',
  '/admin/templates': '/admin-templates.html',
  '/admin/occasions': '/admin-occasions.html',
  '/admin/categories': '/admin-occasions.html',
  '/admin/users': '/admin-users.html',
  '/admin/wishes': '/admin-wishes.html',
  '/admin/orders': '/admin-orders.html',
  '/admin/media': '/admin-media.html',
  '/admin/pricing': '/admin-pricing.html',
  '/admin/settings': '/admin-settings.html',
  '/admin/staff': '/admin-staff.html'
};

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

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
