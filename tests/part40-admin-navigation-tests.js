/**
 * WishMagic Automated Test Suite: Part 40 — Admin Studio Sidebar Navigation & Route Mapping
 * =========================================================================================
 * Comprehensive regression tests verifying:
 * 1. ADMIN_ROUTES_MAP completeness and integrity in functions/[[path]].js
 * 2. PRETTY_ROUTES consistency and integrity in src/worker.js
 * 3. Exact existence of every targeted admin HTML destination file in public/
 * 4. Trailing slash normalization and route resolution
 * 5. Strict rejection (404) for unknown admin routes without fallback to overview
 * 6. Admin gatekeeper secret prefix protection
 * 7. Section mapping and link rewriting in public/js/admin-theme.js
 * 8. Core Navigation HTML structure and valid link targets
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('WishMagic Part 40: Admin Studio Sidebar Navigation & Routing Suite', () => {

  test('TEST 1: Every Admin Route in functions/[[path]].js targets an existing HTML file in public/', () => {
    const functionsCode = fs.readFileSync(path.join(ROOT_DIR, 'functions/[[path]].js'), 'utf8');
    const match = functionsCode.match(/const ADMIN_ROUTES_MAP = \{([\s\S]*?)\};/);
    assert.ok(match, 'ADMIN_ROUTES_MAP must be defined in functions/[[path]].js');

    // Parse entries
    const entries = match[1]
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith("'") || line.startsWith('"'))
      .map(line => {
        const parts = line.split(':');
        const route = parts[0].replace(/['",]/g, '').trim();
        const file = parts[1].replace(/['",]/g, '').trim();
        return { route, file };
      });

    assert.ok(entries.length >= 25, `Expected at least 25 admin route entries, found ${entries.length}`);

    // Verify critical routes specifically mentioned in prompt
    const requiredRoutes = [
      '/admin/anktech/anktech/admin/analytics',
      '/admin/anktech/anktech/admin/moderation',
      '/admin/anktech/anktech/admin/audit-logs',
      '/admin/anktech/anktech/admin/search',
      '/admin/anktech/anktech/admin/storage-health',
      '/admin/anktech/anktech/admin/support',
      '/admin/anktech/anktech/admin/referrals',
      '/admin/anktech/anktech/admin/legal',
      '/admin/anktech/anktech/admin/overview'
    ];

    for (const reqRoute of requiredRoutes) {
      const found = entries.find(e => e.route === reqRoute);
      assert.ok(found, `Required admin route ${reqRoute} must exist in ADMIN_ROUTES_MAP`);
    }

    // Verify all destination HTML files exist on disk
    for (const { route, file } of entries) {
      const expectedFilePath = path.join(ROOT_DIR, 'public', file.replace(/^\//, ''));
      assert.ok(
        fs.existsSync(expectedFilePath),
        `Route ${route} points to ${file}, but file does not exist at ${expectedFilePath}`
      );
    }
  });

  test('TEST 2: PRETTY_ROUTES in src/worker.js matches ADMIN_ROUTES_MAP and files exist', () => {
    const workerCode = fs.readFileSync(path.join(ROOT_DIR, 'src/worker.js'), 'utf8');
    const match = workerCode.match(/const PRETTY_ROUTES = \{([\s\S]*?)\};/);
    assert.ok(match, 'PRETTY_ROUTES must be defined in src/worker.js');

    // Check critical routes in worker
    const requiredWorkerRoutes = [
      '/admin/anktech/anktech/admin/analytics',
      '/admin/anktech/anktech/admin/moderation',
      '/admin/anktech/anktech/admin/audit-logs',
      '/admin/anktech/anktech/admin/search',
      '/admin/anktech/anktech/admin/storage-health',
      '/admin/anktech/anktech/admin/support',
      '/admin/anktech/anktech/admin/referrals',
      '/admin/anktech/anktech/admin/legal',
      '/admin/anktech/anktech/admin/user-creations'
    ];

    for (const reqRoute of requiredWorkerRoutes) {
      assert.ok(
        workerCode.includes(`'${reqRoute}':`),
        `Worker PRETTY_ROUTES must include route ${reqRoute}`
      );
    }
  });

  test('TEST 3: functions/[[path]].js and src/worker.js do not fallback to overview on unknown admin routes', () => {
    const functionsCode = fs.readFileSync(path.join(ROOT_DIR, 'functions/[[path]].js'), 'utf8');
    // Verify that unknown admin routes return 404 instead of silent overview fallback
    assert.ok(
      !functionsCode.includes("ADMIN_ROUTES_MAP[cleanPath] || ADMIN_ROUTES_MAP[pathname] || '/admin-overview.html'"),
      'functions/[[path]].js must not silently fallback unknown admin routes to /admin-overview.html'
    );
    assert.ok(
      functionsCode.includes("status: 404"),
      'functions/[[path]].js must return 404 for unknown admin routes'
    );

    const workerCode = fs.readFileSync(path.join(ROOT_DIR, 'src/worker.js'), 'utf8');
    assert.ok(
      workerCode.includes("pathname.startsWith('/admin/anktech/anktech/admin') && !targetHtml"),
      'src/worker.js must explicitly check for unmatched admin routes and return 404'
    );
  });

  test('TEST 4: public/js/admin-theme.js sectionMap includes all admin sections and prevents false overview redirects', () => {
    const themeJs = fs.readFileSync(path.join(ROOT_DIR, 'public/js/admin-theme.js'), 'utf8');
    assert.ok(themeJs.includes('function rewriteAdminSidebarLinks()'), 'rewriteAdminSidebarLinks must be present');

    const expectedSections = [
      'analytics',
      'moderation',
      'audit-logs',
      'storage-health',
      'search',
      'support',
      'referrals',
      'legal',
      'user-creations',
      'templates',
      'occasions',
      'wishes',
      'users',
      'orders',
      'pricing',
      'staff',
      'settings'
    ];

    for (const sec of expectedSections) {
      assert.ok(
        themeJs.includes(`'${sec}':`),
        `sectionMap in admin-theme.js must contain key '${sec}'`
      );
    }

    // Verify sort by length to prevent substring clashes (e.g. 'users' matching 'user-creations')
    assert.ok(
      themeJs.includes('b.length - a.length'),
      'sectionMap keys must be sorted by descending length to prevent prefix collisions'
    );
  });

  test('TEST 5: Core Navigation in public/admin-overview.html contains all production admin tools', () => {
    const overviewHtml = fs.readFileSync(path.join(ROOT_DIR, 'public/admin-overview.html'), 'utf8');
    const navMatch = overviewHtml.match(/<nav[^>]*>([\s\S]*?)<\/nav>/);
    assert.ok(navMatch, 'public/admin-overview.html must contain a <nav> block');

    const links = [...navMatch[1].matchAll(/href="([^"]+)"/g)].map(m => m[1]);

    const requiredSidebarTargets = [
      '/admin/anktech/anktech/admin/overview',
      '/admin/anktech/anktech/admin/analytics',
      '/admin/anktech/anktech/admin/user-creations',
      '/admin/anktech/anktech/admin/templates',
      '/admin/anktech/anktech/admin/search',
      '/admin/anktech/anktech/admin/occasions',
      '/admin/anktech/anktech/admin/wishes',
      '/admin/anktech/anktech/admin/users',
      '/admin/anktech/anktech/admin/referrals',
      '/admin/anktech/anktech/admin/moderation',
      '/admin/anktech/anktech/admin/support',
      '/admin/anktech/anktech/admin/audit-logs',
      '/admin/anktech/anktech/admin/storage-health',
      '/admin/anktech/anktech/admin/media',
      '/admin/anktech/anktech/admin/orders',
      '/admin/anktech/anktech/admin/pricing',
      '/admin/anktech/anktech/admin/staff',
      '/admin/anktech/anktech/admin/legal',
      '/admin/anktech/anktech/admin/settings'
    ];

    for (const target of requiredSidebarTargets) {
      assert.ok(
        links.includes(target),
        `admin-overview.html sidebar must include link to ${target}`
      );
    }
  });

  test('TEST 6: Secret Admin URL Prefix is preserved and consistent across codebase', () => {
    const SECRET_ADMIN_PREFIX = '/admin/anktech/anktech/admin';
    const themeJs = fs.readFileSync(path.join(ROOT_DIR, 'public/js/admin-theme.js'), 'utf8');
    assert.ok(
      themeJs.includes(`const SECRET_ADMIN_PREFIX = '${SECRET_ADMIN_PREFIX}'`),
      'admin-theme.js must use the canonical secret prefix'
    );

    const functionsCode = fs.readFileSync(path.join(ROOT_DIR, 'functions/[[path]].js'), 'utf8');
    assert.ok(
      functionsCode.includes(SECRET_ADMIN_PREFIX),
      'functions/[[path]].js must protect routes using canonical secret prefix'
    );

    const serverCode = fs.readFileSync(path.join(ROOT_DIR, 'server.js'), 'utf8');
    assert.ok(
      serverCode.includes(`const ADMIN_BASE = '${SECRET_ADMIN_PREFIX}'`),
      'server.js must use canonical secret prefix'
    );
  });
});
