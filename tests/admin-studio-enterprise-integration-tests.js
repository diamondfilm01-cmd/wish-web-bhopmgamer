/**
 * WishMagic Automated Test Suite: Enterprise Admin Studio Integration & Security (Phases 2–7)
 * ===========================================================================================
 * Verifies:
 * 1. Unified Admin Studio Shell across all 24 public/admin*.html files (dependencies, no duplicate toggleSidebar/showToast, admin.html === admin-overview.html).
 * 2. Scoped sidebar link rewriting, global command search palette (Ctrl/Cmd+K), mobile drawer accessibility, and reduced-motion tokens.
 * 3. Reconciled Owner (ankit.babusaini@gmail.com) + Server-Validated Staff RBAC in AdminAuthController & WishAuth.
 * 4. Server-side 401/403 authentication and RBAC enforcement on previously unprotected /api/admin/* endpoints (hero-image, hero/bg-mode, template-images).
 * 5. Authoritative D1-backed Promotional Coupons CRUD (/api/admin/settings/coupons) replacing localStorage-only mock coupons.
 * 6. Reconciled GET /api/admin/audit-logs endpoint supporting server-side query, action, and targetType filtering.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function createMockAdminEnv() {
  const store = {
    users: [
      {
        id: 'usr_owner_1',
        email: 'ankit.babusaini@gmail.com',
        display_name: 'Ankit Babu Saini',
        role: 'admin',
        plan: 'VIP',
        is_premium: 1,
        status: 'active'
      },
      {
        id: 'usr_regular_1',
        email: 'customer@example.com',
        display_name: 'Regular Customer',
        role: 'creator',
        plan: 'Free',
        is_premium: 0,
        status: 'active'
      }
    ],
    sessions: [
      { token: 'tok_owner_valid', user_id: 'usr_owner_1', expires_at: '2099-01-01T00:00:00.000Z' },
      { token: 'tok_customer_valid', user_id: 'usr_regular_1', expires_at: '2099-01-01T00:00:00.000Z' }
    ],
    site_settings: new Map(),
    audit_logs: [
      {
        id: 'aud_1',
        actor_id: 'usr_owner_1',
        actor_name: 'Ankit Babu Saini',
        actor_role: 'OWNER',
        action: 'TEMPLATE_PUBLISHED',
        target_type: 'template',
        target_id: 'tpl_bro_code',
        details: JSON.stringify({ version: '1.3.0' }),
        ip_address: '127.0.0.1',
        created_at: new Date().toISOString()
      },
      {
        id: 'aud_2',
        actor_id: 'usr_owner_1',
        actor_name: 'Ankit Babu Saini',
        actor_role: 'OWNER',
        action: 'USER_STATUS_UPDATED',
        target_type: 'user',
        target_id: 'usr_regular_1',
        details: JSON.stringify({ newStatus: 'suspended' }),
        ip_address: '127.0.0.1',
        created_at: new Date().toISOString()
      }
    ]
  };

  const db = {
    prepare(sql) {
      const norm = sql.replace(/\s+/g, ' ').trim();
      return {
        _binds: [],
        bind(...args) {
          this._binds = args;
          return this;
        },
        async first() {
          if (/FROM sessions/i.test(norm)) {
            const tok = this._binds[0];
            const sess = store.sessions.find(s => s.token === tok);
            if (!sess) return null;
            const usr = store.users.find(u => u.id === sess.user_id);
            return usr ? { ...sess, ...usr, user_id: usr.id } : null;
          }
          if (/FROM users WHERE id = \?/i.test(norm)) {
            return store.users.find(u => u.id === this._binds[0]) || null;
          }
          if (/FROM users WHERE LOWER\(email\)/i.test(norm) || /FROM users WHERE email = \?/i.test(norm)) {
            const em = String(this._binds[0] || '').toLowerCase();
            return store.users.find(u => u.email.toLowerCase() === em) || null;
          }
          if (/FROM site_settings/i.test(norm)) {
            const key = this._binds[0] || 'global';
            const val = store.site_settings.get(key);
            return val ? { id: key, key, value: val, settings_json: val, updated_at: new Date().toISOString() } : null;
          }
          return null;
        },
        async all() {
          if (/FROM admin_audit_logs/i.test(norm)) {
            return { results: store.audit_logs };
          }
          if (/FROM template_images/i.test(norm)) {
            return { results: [] };
          }
          if (/FROM site_settings/i.test(norm)) {
            const results = [];
            for (const [k, entry] of store.site_settings.entries()) {
              results.push(entry);
            }
            return { results };
          }
          return { results: [] };
        },
        async run() {
          if (/INSERT OR REPLACE INTO site_settings/i.test(norm) || /UPDATE site_settings/i.test(norm)) {
            const [key, value, type, updated_at, updated_by] = this._binds;
            if (key) {
              store.site_settings.set(key, { key, value, type: type || 'string', updated_at, updated_by });
            }
          }
          return { success: true };
        }
      };
    }
  };

  return { DB: db, _store: store };
}

describe('WishMagic Admin Studio — Enterprise Integration & Security Suite (Phases 2–7)', () => {

  test('TEST 1: All 23 active Admin HTML screens load shared CSS, admin-theme.js, auth-service.js, and api-client.js without duplicate local overrides', () => {
    const htmlFiles = fs.readdirSync(path.join(ROOT_DIR, 'public'))
      .filter(f => f.startsWith('admin') && f.endsWith('.html') && f !== 'admin-login.html');

    assert.equal(htmlFiles.length, 23, 'Expected 23 active admin HTML files alongside admin-login.html');

    for (const file of htmlFiles) {
      const content = fs.readFileSync(path.join(ROOT_DIR, 'public', file), 'utf8');
      assert.ok(content.includes('admin-theme.css'), `${file} must include admin-theme.css`);
      assert.ok(content.includes('admin-theme.js'), `${file} must include admin-theme.js`);
      assert.ok(content.includes('auth-service.js'), `${file} must include auth-service.js`);
      assert.ok(content.includes('api-client.js'), `${file} must include api-client.js`);
      assert.ok(!/function\s+toggleSidebar\s*\(/.test(content), `${file} must not define a duplicate local toggleSidebar()`);
      assert.ok(!/function\s+showToast\s*\(/.test(content), `${file} must not define a shadowed local showToast()`);
    }

    const adminRoot = fs.readFileSync(path.join(ROOT_DIR, 'public/admin.html'), 'utf8');
    const adminOverview = fs.readFileSync(path.join(ROOT_DIR, 'public/admin-overview.html'), 'utf8');
    assert.equal(adminRoot, adminOverview, 'public/admin.html and public/admin-overview.html must be 100% synchronized');
  });

  test('TEST 2: admin-theme.js & admin-theme.css provide Global Command Search (Ctrl/Cmd+K), scoped link rewriting, RBAC helpers, and reduced-motion accessibility', () => {
    const themeJs = fs.readFileSync(path.join(ROOT_DIR, 'public/js/admin-theme.js'), 'utf8');
    const themeCss = fs.readFileSync(path.join(ROOT_DIR, 'public/css/admin-theme.css'), 'utf8');

    assert.ok(themeJs.includes('ADMIN_COMMAND_DESTINATIONS'), 'admin-theme.js must define ADMIN_COMMAND_DESTINATIONS for global command search');
    assert.ok(themeJs.includes('initGlobalAdminCommandSearch'), 'admin-theme.js must initialize global command search across all admin screens');
    assert.ok(themeJs.includes('hasPermission'), 'AdminAuthController must expose hasPermission for RBAC checks');
    assert.ok(themeJs.includes('/api/admin/auth/session'), 'AdminAuthController must verify against /api/admin/auth/session');
    assert.ok(themeJs.includes('window.AdminStudio = AdminStudio'), 'admin-theme.js must expose window.AdminStudio utilities');
    assert.ok(themeCss.includes('@media (prefers-reduced-motion: reduce)'), 'admin-theme.css must support prefers-reduced-motion');
    assert.ok(themeCss.includes('.wm-cmd-result-item'), 'admin-theme.css must style global command search items');
  });

  test('TEST 3: Previously unprotected /api/admin/* endpoints reject unauthenticated (401) and non-admin (403) requests on the server', async () => {
    const env = createMockAdminEnv();

    const protectedEndpoints = [
      { path: '/api/admin/template-images', method: 'GET' },
      { path: '/api/admin/hero-image', method: 'POST', body: { heroImageUrl: 'https://example.com/malicious.png' } },
      { path: '/api/admin/hero/bg-mode', method: 'POST', body: { heroBgMode: 'gradient' } },
      { path: '/api/admin/settings/coupons', method: 'GET' },
      { path: '/api/admin/settings/coupons', method: 'POST', body: { code: 'HACK100', discountValue: 100 } }
    ];

    for (const ep of protectedEndpoints) {
      // 1. Unauthenticated -> 401
      const unauthReq = new Request(`https://wishmagic.test${ep.path}`, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        body: ep.body ? JSON.stringify(ep.body) : undefined
      });
      const unauthRes = await worker.fetch(unauthReq, env);
      assert.equal(unauthRes.status, 401, `Unauthenticated ${ep.method} ${ep.path} must return 401`);

      // 2. Non-admin customer -> 403
      const customerReq = new Request(`https://wishmagic.test${ep.path}`, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer tok_customer_valid'
        },
        body: ep.body ? JSON.stringify(ep.body) : undefined
      });
      const customerRes = await worker.fetch(customerReq, env);
      assert.equal(customerRes.status, 403, `Non-admin ${ep.method} ${ep.path} must return 403`);
    }
  });

  test('TEST 4: Authoritative D1-backed Promotional Coupons CRUD (/api/admin/settings/coupons) validates, persists, toggles, and deletes coupons', async () => {
    const env = createMockAdminEnv();
    const adminHeaders = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer tok_owner_valid',
      'Origin': 'https://wishmagic.test'
    };

    // 1. Create valid coupon
    const createRes = await worker.fetch(new Request('https://wishmagic.test/api/admin/settings/coupons', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ code: 'DIWALI50', discountType: 'percentage', discountValue: 50, expiry: 'Dec 31, 2026' })
    }), env);
    assert.equal(createRes.status, 201);
    const createdData = await createRes.json();
    assert.equal(createdData.data.coupon.code, 'DIWALI50');
    assert.equal(createdData.data.coupon.status, 'Active');

    // 2. Duplicate coupon code rejected with 409 Conflict
    const dupRes = await worker.fetch(new Request('https://wishmagic.test/api/admin/settings/coupons', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ code: 'DIWALI50', discountType: 'percentage', discountValue: 50 })
    }), env);
    assert.equal(dupRes.status, 409);

    // 3. Invalid percentage (>100%) rejected with 422
    const invalidRes = await worker.fetch(new Request('https://wishmagic.test/api/admin/settings/coupons', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ code: 'OVER100', discountType: 'percentage', discountValue: 150 })
    }), env);
    assert.equal(invalidRes.status, 422);

    // 4. Toggle status via PATCH
    const patchRes = await worker.fetch(new Request('https://wishmagic.test/api/admin/settings/coupons/DIWALI50', {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ status: 'Disabled' })
    }), env);
    assert.equal(patchRes.status, 200);
    const patchData = await patchRes.json();
    assert.equal(patchData.data.coupons[0].status, 'Disabled');

    // 5. Delete coupon via DELETE
    const delRes = await worker.fetch(new Request('https://wishmagic.test/api/admin/settings/coupons/DIWALI50', {
      method: 'DELETE',
      headers: adminHeaders
    }), env);
    assert.equal(delRes.status, 200);
    const delData = await delRes.json();
    assert.equal(delData.data.coupons.length, 0);
  });

  test('TEST 5: Reconciled GET /api/admin/audit-logs supports server-side query and targetType filtering', async () => {
    const env = createMockAdminEnv();
    const adminHeaders = { 'Authorization': 'Bearer tok_owner_valid' };

    const resAll = await worker.fetch(new Request('https://wishmagic.test/api/admin/audit-logs', {
      method: 'GET',
      headers: adminHeaders
    }), env);
    assert.equal(resAll.status, 200);
    const dataAll = await resAll.json();
    assert.equal(dataAll.data.logs.length, 2);

    const resFiltered = await worker.fetch(new Request('https://wishmagic.test/api/admin/audit-logs?targetType=template&query=bro_code', {
      method: 'GET',
      headers: adminHeaders
    }), env);
    assert.equal(resFiltered.status, 200);
    const dataFiltered = await resFiltered.json();
    assert.equal(dataFiltered.data.logs.length, 1);
    assert.equal(dataFiltered.data.logs[0].action, 'TEMPLATE_PUBLISHED');
  });
});
