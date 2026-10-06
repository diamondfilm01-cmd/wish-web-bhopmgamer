/**
 * Cloudflare Pages Functions Catch-all Adapter
 * Routes dynamic requests directly through the centralized worker API in src/worker.js
 */

import worker from '../src/worker.js';

export async function onRequest(context) {
  const env = {
    ...context.env,
    ASSETS: context.env.ASSETS || {
      fetch: async (req) => {
        return await context.next(req);
      }
    }
  };
  return await worker.fetch(context.request, env, context);
}
