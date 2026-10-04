/**
 * Cloudflare Pages Functions Catch-all Adapter
 * Routes dynamic requests directly through the centralized worker API in src/worker.js
 */

import worker from '../src/worker.js';

export async function onRequest(context) {
  return await worker.fetch(context.request, context.env, context);
}
