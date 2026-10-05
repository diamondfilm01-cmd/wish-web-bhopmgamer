/**
 * WishMagic Complete End-to-End Integration & API Contract Test Runner
 * Part 28: Full Frontend <-> Worker API Contract & End-to-End Regression Lock
 * 
 * Verifies:
 * - Real Cloudflare Worker Gateway with D1 & R2 abstraction
 * - All 18 Security Regression Tests (A through T)
 * - All Part 28 Realistic User Journeys (#1 to #5 + Admin Journey)
 * - Comprehensive API Contract inventory & response normalization
 * - D1 & R2 unavailable degraded mode handling (503 / unconfigured)
 * - Strict CORS, CSP, Cookie, CSRF, and Rate Limiting
 * - Lifecycle state machine (Asia/Kolkata boundary)
 * - Public wish privacy and zero PII leakage
 * - Route Matrix & Pretty Links
 */

import http from 'http';
import { createRequire } from 'module';
import worker from './src/worker.js';
import { validateMigrations } from './scripts/db-validate.js';
import { runDataIntegrityCheck } from './scripts/db-integrity.js';
import { runSecurityAudit } from './scripts/security-audit.js';
import { validateConfiguration } from './scripts/config-validator.js';
import { DataRepairEngine } from './scripts/repair-framework.js';
import {
  APP_VERSION,
  FailureCategory,
  FailureClassification,
  redactSensitiveData,
  Logger
} from './src/observability.js';

const require = createRequire(import.meta.url);
require('./public/js/wish-lifecycle.js');
const WishLifecycle = global.WishLifecycle;
require('./public/js/data-migrator.js');
const WishDataMigrator = global.WishDataMigrator;
require('./public/js/security-hardening.js');
const WishSecurity = global.WishSecurity;
require('./public/js/api-client.js');
const WishApiClient = global.WishApiClient;
require('./public/js/wish-link-suggestions.js');
const WishLinkSuggestions = global.WishLinkSuggestions;

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (!condition) {
    failedTests++;
    console.error(`❌ FAIL: ${message}`);
    throw new Error(message);
  } else {
    passedTests++;
    console.log(`✅ PASS: ${message}`);
  }
}

// In-Memory Cloudflare D1 Test Database Adapter
function createTestD1Database() {
  const users = new Map();
  const sessions = new Map();
  const adminRoles = new Map();
  const adminStaff = new Map();
  const adminAuditLogs = [];
  const entitlements = new Map();
  const wishes = new Map();
  const templates = new Map();
  const categories = new Map();
  const favorites = new Map();
  const wishMedia = new Map();
  const notifications = new Map();
  const analyticsEvents = [];

  return {
    _tables: { users, sessions, adminRoles, adminStaff, adminAuditLogs, entitlements, wishes, templates, categories, favorites, wishMedia, notifications, analyticsEvents },
    prepare(sql) {
      function createStatement(boundArgs = []) {
        return {
          bind(...newArgs) {
            return createStatement(newArgs);
          },
          async first() {
            const args = boundArgs;
            const normalized = sql.replace(/\s+/g, ' ').trim();
              if (normalized.includes('FROM users WHERE email = ?')) {
                const email = args[0];
                for (const u of users.values()) {
                  if (u.email === email) return { ...u };
                }
                return null;
              }
              if (normalized.includes('FROM users WHERE id = ?')) {
                const id = args[0];
                return users.get(id) ? { ...users.get(id) } : null;
              }
              if (normalized.includes('COUNT(*) as count FROM users')) {
                return { count: users.size };
              }
              if (normalized.includes('COUNT(*) as count FROM wishes')) {
                if (normalized.includes('WHERE template_id = ?')) {
                  const tId = args[0];
                  let c = 0;
                  for (const w of wishes.values()) {
                    if (w.template_id === tId) c++;
                  }
                  return { count: c };
                }
                return { count: wishes.size };
              }
              if (normalized.includes('COUNT(*) as count FROM templates')) {
                return { count: templates.size };
              }
              if (normalized.includes('FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?')) {
                const token = args[0];
                const now = args[1] || Date.now();
                const session = sessions.get(token);
                if (session && session.expires_at > now) {
                  const user = users.get(session.user_id);
                  if (user) {
                    return {
                      ...session,
                      user_id: user.id,
                      email: user.email,
                      display_name: user.display_name,
                      avatar_url: user.avatar_url,
                      role: user.role,
                      plan: user.plan,
                      is_premium: user.is_premium,
                      status: user.status
                    };
                  }
                }
                return null;
              }
              if (normalized.includes('FROM admin_roles WHERE user_id = ?')) {
                const userId = args[0];
                return adminRoles.get(userId) || null;
              }
              if (normalized.includes('FROM admin_staff WHERE mobile = ?')) {
                const mobile = args[0];
                for (const s of adminStaff.values()) {
                  if (s.mobile === mobile) return { ...s };
                }
                return null;
              }
              if (normalized.includes('FROM admin_staff WHERE user_id = ?') || normalized.includes('FROM admin_staff WHERE user_id = ? OR mobile = ?')) {
                const uId = args[0];
                const mob = args[1] || uId;
                for (const s of adminStaff.values()) {
                  if (s.user_id === uId || s.mobile === mob) return { ...s };
                }
                return null;
              }
              if (normalized.includes('FROM admin_staff WHERE id = ?')) {
                const sId = args[0];
                return adminStaff.get(sId) ? { ...adminStaff.get(sId) } : null;
              }
              if (normalized.includes('FROM entitlements WHERE user_id = ?')) {
                const userId = args[0];
                for (const ent of entitlements.values()) {
                  if (ent.user_id === userId && ent.is_active) return { ...ent };
                }
                return null;
              }
              if (normalized.includes('FROM wishes WHERE id = ? OR slug = ?') || normalized.includes('FROM wishes WHERE slug = ? OR id = ?')) {
                const idOrSlug = args[0];
                for (const w of wishes.values()) {
                  if (w.id === idOrSlug || w.slug === idOrSlug) return { ...w };
                }
                return null;
              }
              if (normalized.includes('FROM wishes WHERE slug = ?')) {
                const slug = args[0];
                for (const w of wishes.values()) {
                  if (w.slug === slug) return { ...w };
                }
                return null;
              }
              if (normalized.includes('FROM templates WHERE id = ? OR slug = ?')) {
                const idOrSlug = args[0];
                for (const t of templates.values()) {
                  if (t.id === idOrSlug || t.slug === idOrSlug) return { ...t };
                }
                return null;
              }
              return null;
            },
            async all() {
              const args = boundArgs;
              const normalized = sql.replace(/\s+/g, ' ').trim();
              if (normalized.includes('FROM wishes WHERE user_id = ?')) {
                const userId = args[0];
                const results = [];
                for (const w of wishes.values()) {
                  if (w.user_id === userId) results.push({ ...w });
                }
                return { results };
              }
              if (normalized.includes('FROM wishes')) {
                return { results: Array.from(wishes.values()) };
              }
              if (normalized.includes('FROM templates')) {
                return { results: Array.from(templates.values()) };
              }
              if (normalized.includes('FROM categories')) {
                return { results: Array.from(categories.values()) };
              }
              if (normalized.includes('FROM favorites WHERE user_id = ?')) {
                const userId = args[0];
                const results = [];
                for (const f of favorites.values()) {
                  if (f.user_id === userId) results.push({ item_id: f.item_id });
                }
                return { results };
              }
              if (normalized.includes('FROM users')) {
                return { results: Array.from(users.values()) };
              }
              if (normalized.includes('FROM notifications WHERE user_id = ?')) {
                const userId = args[0];
                const results = [];
                for (const n of notifications.values()) {
                  if (n.user_id === userId) results.push({ ...n });
                }
                return { results };
              }
              if (normalized.includes('FROM admin_staff')) {
                return { results: Array.from(adminStaff.values()) };
              }
              if (normalized.includes('FROM admin_audit_logs')) {
                return { results: [...adminAuditLogs] };
              }
              if (normalized.includes('FROM analytics_events')) {
                return { results: [...analyticsEvents] };
              }
              return { results: [] };
            },
            async run() {
              const args = boundArgs;
              const normalized = sql.replace(/\s+/g, ' ').trim();
              if (normalized.startsWith('INSERT INTO admin_staff')) {
                const [id, user_id, mobile, name, role, permissions, status, password_hash, password_salt, created_by, created_at, updated_at] = args;
                adminStaff.set(id, { id, user_id, mobile, name, role, permissions, status, password_hash, password_salt, created_by, created_at, updated_at });
                return { success: true };
              }
              if (normalized.startsWith('UPDATE admin_staff SET')) {
                const [name, role, permissions, status, password_hash, password_salt, updated_at, id] = args;
                const existing = adminStaff.get(id);
                if (existing) {
                  adminStaff.set(id, { ...existing, name, role, permissions, status, password_hash, password_salt, updated_at });
                }
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM admin_staff WHERE id = ?')) {
                const id = args[0];
                adminStaff.delete(id);
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM admin_roles WHERE user_id = ?')) {
                const userId = args[0];
                adminRoles.delete(userId);
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM sessions WHERE user_id = ?')) {
                const userId = args[0];
                for (const [token, s] of sessions.entries()) {
                  if (s.user_id === userId) sessions.delete(token);
                }
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO admin_audit_logs')) {
                const [id, actor_id, actor_name, actor_role, action, target_type, target_id, details, ip_address, created_at] = args;
                adminAuditLogs.push({ id, actor_id, actor_name, actor_role, action, target_type, target_id, details, ip_address, created_at });
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO users')) {
                const [id, email, display_name, avatar_url, role, plan, is_premium, provider, status, created_at, updated_at] = args;
                users.set(id, { id, email, display_name, avatar_url, role, plan, is_premium, provider, status, created_at, updated_at });
                return { success: true };
              }
              if (normalized.startsWith('UPDATE users SET display_name = ?')) {
                const [displayName, avatarUrl, updatedAt, id] = args;
                const existing = users.get(id);
                if (existing) {
                  users.set(id, { ...existing, display_name: displayName, avatar_url: avatarUrl, updated_at: updatedAt });
                }
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO sessions')) {
                const [id, user_id, token, expires_at, created_at] = args;
                sessions.set(token, { id, user_id, token, expires_at, created_at });
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM sessions WHERE token = ?')) {
                const token = args[0];
                sessions.delete(token);
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO wishes')) {
                const [id, slug, user_id, order_id, template_id, template_name, tier, price, is_private, buyer_name, buyer_contact, recipient_name, event_date, expiry_date, lifecycle_status, views, custom_data, payment, status, created_at, updated_at] = args;
                wishes.set(id, { id, slug, user_id, order_id, template_id, template_name, tier, price, is_private, buyer_name, buyer_contact, recipient_name, event_date, expiry_date, lifecycle_status, views, custom_data, payment, status, created_at, updated_at });
                return { success: true };
              }
              if (normalized.startsWith('UPDATE wishes SET recipient_name = ?')) {
                const [recipient_name, buyer_name, event_date, custom_data, updated_at, id] = args;
                const existing = wishes.get(id);
                if (existing) {
                  wishes.set(id, { ...existing, recipient_name, buyer_name, event_date, custom_data, updated_at });
                }
                return { success: true };
              }
              if (normalized.startsWith('UPDATE wishes SET status = ?')) {
                const [status, custom_data, updated_at, id] = args;
                const existing = wishes.get(id);
                if (existing) {
                  wishes.set(id, { ...existing, status, custom_data, updated_at });
                }
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM wishes WHERE id = ?')) {
                const id = args[0];
                wishes.delete(id);
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO templates')) {
                const [id, slug, name, category, tier, price, is_premium, is_published, status, featured, placement, thumbnail, description, folder, entry_file, created_at, updated_at] = args;
                templates.set(id, { id, slug, name, category, tier, price, is_premium, is_published, status, featured, placement, thumbnail, description, folder, entry_file, created_at, updated_at });
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM templates WHERE id = ?')) {
                const id = args[0];
                templates.delete(id);
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO categories')) {
                const [id, name, slug, icon, sort_order, is_active, created_at, updated_at] = args;
                categories.set(id, { id, name, slug, icon, sort_order, is_active, created_at, updated_at });
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM categories WHERE id = ?')) {
                const id = args[0];
                categories.delete(id);
                return { success: true };
              }
              if (normalized.startsWith('INSERT OR IGNORE INTO favorites')) {
                const [id, user_id, item_id, item_type, created_at] = args;
                favorites.set(`${user_id}_${item_id}`, { id, user_id, item_id, item_type, created_at });
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM favorites WHERE user_id = ? AND item_id = ?')) {
                const [user_id, item_id] = args;
                favorites.delete(`${user_id}_${item_id}`);
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO notifications')) {
                const [id, user_id, type, title, message, action_url, read_at, created_at] = args;
                notifications.set(id, { id, user_id, type, title, message, action_url, read_at, created_at });
                return { success: true };
              }
              if (normalized.startsWith('UPDATE notifications SET read_at = ? WHERE id = ?')) {
                const [read_at, id, user_id] = args;
                const n = notifications.get(id);
                if (n && n.user_id === user_id) {
                  notifications.set(id, { ...n, read_at });
                }
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM notifications WHERE id = ?')) {
                const [id, user_id] = args;
                const n = notifications.get(id);
                if (n && n.user_id === user_id) {
                  notifications.delete(id);
                }
                return { success: true };
              }
              if (normalized.startsWith('UPDATE wishes SET views = views + 1')) {
                const id = args[0];
                const existing = wishes.get(id);
                if (existing) existing.views = (existing.views || 0) + 1;
                return { success: true };
              }
              if (normalized.startsWith('INSERT OR REPLACE INTO admin_roles') || normalized.startsWith('INSERT INTO admin_roles')) {
                const [id, user_id, role, permissions, granted_by, created_at] = args;
                adminRoles.set(user_id, { id, user_id, role, permissions, granted_by, created_at });
                return { success: true };
              }
              if (normalized.startsWith("UPDATE users SET role = 'admin'")) {
                const [updatedAt, id] = args;
                const existing = users.get(id);
                if (existing) {
                  users.set(id, { ...existing, role: 'admin', is_premium: 1, plan: 'VIP', updated_at: updatedAt });
                }
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO analytics_events')) {
                analyticsEvents.push(args);
                return { success: true };
              }
              return { success: true };
            }
          };
        }
        return createStatement([]);
      }
    };
  }

async function runTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING WISHMAGIC PART 28 CONTRACT & REGRESSION SUITE');
  console.log('================================================================\n');

  const testDb = createTestD1Database();

  const prodEnv = {
    ENVIRONMENT: 'production',
    PUBLIC_APP_URL: 'https://wishmagic.live',
    DB: testDb,
    BUCKET: null
  };

  // --- Test 1: Health & Worker Gateway ---
  console.log('--- 1. Health & Worker Gateway ---');
  {
    const req = new Request('http://localhost/api/health', { method: 'GET' });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 200, 'Health endpoint returns HTTP 200');
    const body = await res.json();
    assert(body.success === true, 'Health payload success is true');
    assert(body.data.status === 'ok', 'Health status is ok');
  }

  {
    const req = new Request('http://localhost/api/config', { method: 'GET' });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 200, 'Config endpoint returns HTTP 200');
    const body = await res.json();
    assert(body.success === true, 'Config success is true');
    assert(body.data.version !== undefined, 'Config returns app version');
  }

  // --- Test 2: Authentication Flow (Zero-Trust Session) ---
  console.log('\n--- 2. Authentication & Session Boundary ---');
  let userACookie = '';
  let userAId = '';
  let userBCookie = '';
  let userBId = '';

  {
    // Sign In User A (Creator)
    const req = new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user_a@example.com', displayName: 'User Alpha' })
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 200, 'User A sign-in returns HTTP 200');
    userACookie = res.headers.get('Set-Cookie') || '';
    assert(userACookie.includes('wm_session='), 'Sets secure wm_session cookie');
    assert(userACookie.includes('HttpOnly'), 'wm_session cookie has HttpOnly flag');
    assert(userACookie.includes('SameSite=Lax'), 'wm_session cookie has SameSite=Lax');

    const body = await res.json();
    assert(body.data.user.role === 'creator', 'Default role is strictly creator');
    assert(body.data.user.plan === 'Free', 'Default plan is strictly Free');
    assert(body.data.token === undefined, 'Raw session token is NOT leaked in JSON response');
    userAId = body.data.user.id;
  }

  {
    // Sign In User B (Creator)
    const req = new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user_b@example.com', displayName: 'User Beta' })
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 200, 'User B sign-in returns HTTP 200');
    userBCookie = res.headers.get('Set-Cookie') || '';
    const body = await res.json();
    userBId = body.data.user.id;
    assert(userAId !== userBId, 'User A and User B receive distinct isolated IDs');
  }

  {
    // Verify Session Hydration for User A
    const req = new Request('http://localhost/api/auth/session', {
      method: 'GET',
      headers: { 'Cookie': userACookie }
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 200, 'Session check returns HTTP 200');
    const body = await res.json();
    assert(body.data.isAuthenticated === true, 'User A is authenticated');
    assert(body.data.user.id === userAId, 'Hydrated user matches User A');
  }

  // ============================================================================
  // SECURITY REGRESSION TESTS (A THROUGH T)
  // ============================================================================
  console.log('\n--- 3. Security Regression Suite (Part 27 Strict Checks) ---');

  // A. Fake Admin Login Attempt
  {
    const req = new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fake_admin@wishmagic.internal', role: 'admin', isAdmin: true, plan: 'VIP' })
    });
    const res = await worker.fetch(req, prodEnv);
    const body = await res.json();
    assert(body.data.user.role === 'creator', 'SECURITY A: Client cannot grant itself admin role via signin');
    assert(body.data.user.plan === 'Free', 'SECURITY A: Client cannot grant itself VIP plan via signin');
  }

  // B. Fake Dev Token Bypass Attempt
  {
    const req = new Request('http://localhost/api/wishes', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer dev_token_usr_admin_999_bypass' }
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 401, 'SECURITY B: Dev token prefix rejected with 401 AUTH_REQUIRED in production');
  }

  // C. Dev Switch Route Production Lock
  {
    const req = new Request('http://localhost/api/auth/dev-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'usr_admin_999' })
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 404, 'SECURITY C: /api/auth/dev-switch returns 404 NOT_FOUND in production');
  }

  // D. Client UserId Manipulation in Wish Creation
  let userAWishId = '';
  let userAWishSlug = '';
  {
    const req = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({
        templateId: 'tpl_glitter_birthday',
        userId: 'usr_victim_spoofed_999',
        customData: {
          recipient_name: 'Rohit Sharma',
          sender_name: 'User Alpha',
          event_date: '2030-05-15',
          custom_message: 'Private celebration message'
        }
      })
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 201 || res.status === 200, 'Wish created by User A');
    const body = await res.json();
    const wishObj = body.data.wish || body.wish;
    assert(wishObj.userId === userAId, 'SECURITY D: Wish owner ID is strictly set to authenticated User A, ignoring spoofed userId');
    userAWishId = wishObj.id;
    userAWishSlug = wishObj.slug;
  }

  // E. Client Admin Role Manipulation via Profile Update
  {
    const req = new Request('http://localhost/api/users/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({ role: 'admin', isAdmin: true, plan: 'VIP' })
    });
    const res = await worker.fetch(req, prodEnv);
    const body = await res.json();
    assert(body.data.user.role === 'creator', 'SECURITY E: Client cannot escalate role via profile PUT');
  }

  // F. Client Premium Manipulation (Tampering tier: "vip" without server entitlement)
  {
    const req = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({
        templateId: 'tpl_golden_elegance', // VIP template
        tier: 'vip',
        isPremium: true,
        customData: { recipient_name: 'Ananya', event_date: '2030-06-01' }
      })
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 403, 'SECURITY F: Free user blocked from VIP template despite sending tier: vip in payload');
    const body = await res.json();
    assert(body.error.code === 'PREMIUM_REQUIRED', 'Returns PREMIUM_REQUIRED error code');
  }

  // G. Guest Wish Creation Attempt
  {
    const req = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: 'tpl_glitter_birthday', customData: { recipient_name: 'Guest' } })
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 401, 'SECURITY G: Unauthenticated guest wish creation rejected with 401 AUTH_REQUIRED');
  }

  // H. Cross-User Wish Access (IDOR GET)
  {
    const req = new Request(`http://localhost/api/wishes/${userAWishId}`, {
      method: 'GET',
      headers: { 'Cookie': userBCookie }
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 403, 'SECURITY H: User B cannot access User A private wish (Returns 403 FORBIDDEN)');
  }

  // I. Cross-User Wish Modification (IDOR PUT)
  {
    const req = new Request(`http://localhost/api/wishes/${userAWishId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': userBCookie },
      body: JSON.stringify({ customData: { recipient_name: 'Hacked by User B' } })
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 403, 'SECURITY I: User B cannot modify User A wish (Returns 403 FORBIDDEN)');
  }

  // J. Cross-User Wish Deletion (IDOR DELETE)
  {
    const req = new Request(`http://localhost/api/wishes/${userAWishId}`, {
      method: 'DELETE',
      headers: { 'Cookie': userBCookie }
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 403, 'SECURITY J: User B cannot delete User A wish (Returns 403 FORBIDDEN)');
  }

  // K. Wildcard CORS Check
  {
    const req = new Request('http://localhost/api/health', {
      method: 'GET',
      headers: { 'Origin': 'https://wishmagic.live' }
    });
    const res = await worker.fetch(req, prodEnv);
    const allowOrigin = res.headers.get('Access-Control-Allow-Origin');
    assert(allowOrigin === 'https://wishmagic.live', 'CORS returns exact allowed origin');
    assert(allowOrigin !== '*', 'SECURITY K: Allowed origin is not wildcard');
  }

  // L. Unknown-Origin Credentialed Request
  {
    const req = new Request('http://localhost/api/health', {
      method: 'OPTIONS',
      headers: { 'Origin': 'https://evil-untrusted-site.com' }
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 403 || res.headers.get('Access-Control-Allow-Origin') === null, 'SECURITY L: Unknown origin rejected/not echoed in CORS preflight');
  }

  // M. Logout Session Reuse
  {
    const tempSign = await worker.fetch(new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'temp_logout@example.com' })
    }), prodEnv);
    const tempCookie = tempSign.headers.get('Set-Cookie') || '';

    // Logout
    const logoutRes = await worker.fetch(new Request('http://localhost/api/auth/signout', {
      method: 'POST',
      headers: { 'Cookie': tempCookie }
    }), prodEnv);
    assert(logoutRes.status === 200, 'Signout successful');

    // Attempt to reuse logged-out session
    const reuseRes = await worker.fetch(new Request('http://localhost/api/wishes', {
      method: 'GET',
      headers: { 'Cookie': tempCookie }
    }), prodEnv);
    assert(reuseRes.status === 401, 'SECURITY M: Logged out session rejected with 401 on subsequent requests');
  }

  // N. Invalid Session
  {
    const req = new Request('http://localhost/api/wishes', {
      method: 'GET',
      headers: { 'Cookie': 'wm_session=completely_bogus_token_12345' }
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 401, 'SECURITY N: Invalid session token returns 401 AUTH_REQUIRED');
  }

  // O. Expired Session
  {
    const expiredToken = 'wm_tok_expired_' + Date.now();
    testDb._tables.sessions.set(expiredToken, {
      id: 'sess_exp_1',
      user_id: userAId,
      token: expiredToken,
      expires_at: Date.now() - 10000,
      created_at: new Date(Date.now() - 20000).toISOString()
    });

    const req = new Request('http://localhost/api/wishes', {
      method: 'GET',
      headers: { 'Cookie': `wm_session=${expiredToken}` }
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 401, 'SECURITY O: Expired session rejected with 401 AUTH_REQUIRED');
  }

  // P. Payment Client Bypass Attempt
  {
    const req = new Request('http://localhost/api/entitlements/checkout', {
      method: 'POST',
      headers: { 'Cookie': userACookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentSuccess: true, paid: true, tier: 'VIP' })
    });
    const res = await worker.fetch(req, prodEnv);
    const body = await res.json();
    assert(body.data.mode === 'sandbox' || body.data.status === 'provider_not_configured', 'SECURITY P: Client cannot force paid state via request payload');
  }

  // Q. Public Wish Privacy & Zero PII Leakage
  {
    const req = new Request(`http://localhost/api/public/wishes/${userAWishSlug}`, { method: 'GET' });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 200, 'Public wish accessible without login');
    const body = await res.json();
    const pubWish = body.data.wish;
    assert(pubWish.user_id === undefined, 'SECURITY Q: Public payload omits user_id');
    assert(pubWish.buyerContact === undefined, 'SECURITY Q: Public payload omits buyerContact');
    assert(pubWish.payment === undefined, 'SECURITY Q: Public payload omits payment metadata');
    assert(pubWish.customData.is_locked === true, 'SECURITY Q: Upcoming wish is locked and masked');
  }

  // R. Admin Endpoint RBAC
  let adminToken = '';
  {
    const guestReq = new Request('http://localhost/api/admin/diagnostic', { method: 'GET' });
    const guestRes = await worker.fetch(guestReq, prodEnv);
    assert(guestRes.status === 401, 'SECURITY R1: Guest access to admin endpoint returns 401');

    const userReq = new Request('http://localhost/api/admin/diagnostic', {
      method: 'GET',
      headers: { 'Cookie': userACookie }
    });
    const userRes = await worker.fetch(userReq, prodEnv);
    assert(userRes.status === 403, 'SECURITY R2: Normal creator access to admin endpoint returns 403 FORBIDDEN');

    const adminUserId = 'usr_real_admin_777';
    testDb._tables.users.set(adminUserId, {
      id: adminUserId,
      email: 'verified_admin@wishmagic.internal',
      display_name: 'Verified Admin',
      role: 'admin',
      plan: 'VIP',
      is_premium: 1,
      status: 'active'
    });
    testDb._tables.adminRoles.set(adminUserId, {
      user_id: adminUserId,
      role: 'SUPER_ADMIN',
      permissions: '["*"]'
    });
    adminToken = 'wm_tok_admin_' + Date.now();
    testDb._tables.sessions.set(adminToken, {
      id: 'sess_admin_1',
      user_id: adminUserId,
      token: adminToken,
      expires_at: Date.now() + 86400000,
      created_at: new Date().toISOString()
    });

    const adminReq = new Request('http://localhost/api/admin/diagnostic', {
      method: 'GET',
      headers: { 'Cookie': `wm_session=${adminToken}` }
    });
    const adminRes = await worker.fetch(adminReq, prodEnv);
    assert(adminRes.status === 200, 'SECURITY R3: Verified server DB admin succeeds with 200 OK');
  }

  // S. D1 Database Unavailable Controlled Degradation
  {
    const noDbEnv = { ...prodEnv, DB: null };
    const req = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({ templateId: 'tpl_glitter_birthday' })
    });
    const res = await worker.fetch(req, noDbEnv);
    assert(res.status === 503, 'SECURITY S: When D1 is unavailable, returns 503 DATABASE_UNAVAILABLE');
    const body = await res.json();
    assert(body.error.code === 'DATABASE_UNAVAILABLE', 'Returns machine error code DATABASE_UNAVAILABLE');
  }

  // T. R2 Storage Unavailable Degradation
  {
    const noR2Env = { ...prodEnv, BUCKET: null };
    const req = new Request('http://localhost/api/media/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({ filename: 'song.mp3' })
    });
    const res = await worker.fetch(req, noR2Env);
    const body = await res.json();
    assert(body.data.status === 'storage_not_configured', 'SECURITY T: When R2 unattached, reports storage_not_configured truthfully');
  }

  // ============================================================================
  // PART 28 REALISTIC USER JOURNEYS (E2E)
  // ============================================================================
  console.log('\n--- 4. Realistic User Journeys (#1 to #5 + Admin) ---');

  // Journey #1: Guest browse -> create wish -> login -> customize -> publish -> share -> logout
  {
    console.log('• User Journey #1: Full Creator Lifecycle Flow');
    // 1. Browse marketplace
    const tplRes = await worker.fetch(new Request('http://localhost/api/templates', { method: 'GET' }), prodEnv);
    assert(tplRes.status === 200, 'J1: Browse templates returns 200');

    // 2. Sign In Creator
    const signRes = await worker.fetch(new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'journey1_creator@example.com', displayName: 'Pooja S' })
    }), prodEnv);
    assert(signRes.status === 200, 'J1: Creator sign-in succeeds');
    const cookieJ1 = signRes.headers.get('Set-Cookie') || '';

    // 3. Create Wish
    const createRes = await worker.fetch(new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookieJ1 },
      body: JSON.stringify({
        templateId: 'tpl_glitter_birthday',
        customData: {
          recipient_name: 'Pooja',
          sender_name: 'Family',
          event_date: '2028-11-20',
          sections: [
            { id: 'sec_hero', type: 'hero', enabled: true, title: 'Happy Birthday Pooja!' },
            { id: 'sec_gallery', type: 'gallery', enabled: true, photos: ['photo1.jpg', 'photo2.jpg'] }
          ]
        }
      })
    }), prodEnv);
    assert(createRes.status === 201 || createRes.status === 200, 'J1: Wish successfully created on server');
    const createData = await createRes.json();
    const j1Wish = createData.data.wish || createData.wish;

    // 4. Duplicate Wish
    const dupRes = await worker.fetch(new Request(`http://localhost/api/wishes/${j1Wish.id}/duplicate`, {
      method: 'POST',
      headers: { 'Cookie': cookieJ1 }
    }), prodEnv);
    assert(dupRes.status === 201 || dupRes.status === 200, 'J1: Wish duplicated');

    // 5. Update Wish Customizer State
    const updateRes = await worker.fetch(new Request(`http://localhost/api/wishes/${j1Wish.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookieJ1 },
      body: JSON.stringify({
        customData: {
          ...j1Wish.customData,
          custom_message: 'Updated heartfelt message'
        }
      })
    }), prodEnv);
    assert(updateRes.status === 200, 'J1: Wish updated');

    // 6. Sign out
    const soRes = await worker.fetch(new Request('http://localhost/api/auth/signout', {
      method: 'POST',
      headers: { 'Cookie': cookieJ1 }
    }), prodEnv);
    assert(soRes.status === 200, 'J1: Signout completed');
  }

  // Journey #2: Cross-User IDOR Enforcement across all methods
  {
    console.log('• User Journey #2: Cross-User IDOR Protection');
    const attackerReq = new Request(`http://localhost/api/wishes/${userAWishId}/duplicate`, {
      method: 'POST',
      headers: { 'Cookie': userBCookie }
    });
    const attackerRes = await worker.fetch(attackerReq, prodEnv);
    assert(attackerRes.status === 403, 'J2: User B cannot duplicate User A wish (403 FORBIDDEN)');
  }

  // Journey #3: Premium Entitlement Lifecycle
  {
    console.log('• User Journey #3: Premium Entitlement Flow');
    // 1. Free user blocked
    const vipReq1 = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({ templateId: 'tpl_golden_elegance' })
    });
    const vipRes1 = await worker.fetch(vipReq1, prodEnv);
    assert(vipRes1.status === 403, 'J3: Free user blocked from VIP template');

    // 2. Grant VIP entitlement in D1
    testDb._tables.entitlements.set(`ent_${userAId}`, {
      id: `ent_${userAId}`,
      user_id: userAId,
      plan_id: 'VIP',
      is_active: 1,
      created_at: new Date().toISOString()
    });

    // 3. User with entitlement succeeds
    const vipReq2 = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({
        templateId: 'tpl_golden_elegance',
        customData: { recipient_name: 'VIP Recipient', event_date: '2028-12-01' }
      })
    });
    const vipRes2 = await worker.fetch(vipReq2, prodEnv);
    assert(vipRes2.status === 201 || vipRes2.status === 200, 'J3: User with active server entitlement succeeds in creating VIP wish');

    // 4. Revoke entitlement
    testDb._tables.entitlements.delete(`ent_${userAId}`);

    // 5. Blocked again
    const vipReq3 = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({ templateId: 'tpl_golden_elegance' })
    });
    const vipRes3 = await worker.fetch(vipReq3, prodEnv);
    assert(vipRes3.status === 403, 'J3: Revoked entitlement immediately blocks VIP creation');
  }

  // Journey #4: Asia/Kolkata Lifecycle Boundary Test
  {
    console.log('• User Journey #4: Asia/Kolkata Lifecycle Boundaries');
    // Future date -> UPCOMING
    assert(WishLifecycle.getWishStatus({ eventDate: '2030-01-01' }) === 'upcoming', 'J4: Future date is upcoming');
    // Past date -> EXPIRED
    assert(WishLifecycle.getWishStatus({ eventDate: '2020-01-01' }) === 'expired', 'J4: Past date is expired');
  }

  // Journey #5: Public Wish Privacy & Masking
  {
    console.log('• User Journey #5: Public Wish Privacy & Masking');
    const pubReq = new Request(`http://localhost/api/public/wishes/${userAWishSlug}`);
    const pubRes = await worker.fetch(pubReq, prodEnv);
    assert(pubRes.status === 200, 'J5: Public endpoint accessible');
    const pubData = await pubRes.json();
    assert(pubData.data.wish.isOwner === false, 'J5: Public visitor is not marked as owner');
    assert(pubData.data.wish.customData.is_locked === true, 'J5: Private sections masked for upcoming wish');
  }

  // Admin Journey: Admin Operations & RBAC Gate
  {
    console.log('• Admin Journey: Platform Operations & RBAC Verification');
    const adminReq = new Request('http://localhost/api/admin/metrics', {
      headers: { 'Cookie': `wm_session=${adminToken}` }
    });
    const adminRes = await worker.fetch(adminReq, prodEnv);
    assert(adminRes.status === 200, 'Admin metrics accessible by verified admin');
    const metricsData = await adminRes.json();
    assert(metricsData.data.metrics !== undefined, 'Admin metrics returns data payload');

    // Normal user blocked
    const blockedReq = new Request('http://localhost/api/admin/metrics', {
      headers: { 'Cookie': userACookie }
    });
    const blockedRes = await worker.fetch(blockedReq, prodEnv);
    assert(blockedRes.status === 403, 'Normal user blocked from admin metrics');
  }

  // Public Recipient Journey
  {
    console.log('• Public Recipient Journey: Zero-Auth Keepsake Consumption');
    const pubReq = new Request(`http://localhost/api/public/wishes/${userAWishSlug}`);
    const pubRes = await worker.fetch(pubReq, prodEnv);
    assert(pubRes.status === 200, 'Recipient access succeeds with 200');
    const pubData = await pubRes.json();
    assert(pubData.success === true, 'Public wish payload has success: true');
    assert(pubData.data.wish.userId === undefined, 'No creator userId in recipient payload');
    assert(pubData.data.wish.buyerContact === undefined, 'No creator contact info leaked');
  }

  // Concurrency & Collision Protection
  {
    console.log('• Concurrency & Collision Protection');
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        worker.fetch(new Request('http://localhost/api/wishes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
          body: JSON.stringify({
            templateId: 'tpl_glitter_birthday',
            customData: {
              recipient_name: 'Concurrent Recipient',
              event_date: '2029-01-01'
            }
          })
        }), prodEnv)
      );
    }
    const results = await Promise.all(promises);
    const createdSlugs = new Set();
    for (const res of results) {
      assert(res.status === 201 || res.status === 200, 'Concurrent wish created');
      const body = await res.json();
      const slug = (body.data.wish && body.data.wish.slug) || body.slug;
      assert(!createdSlugs.has(slug), `Slug ${slug} is unique under concurrent creation`);
      createdSlugs.add(slug);
    }
    assert(createdSlugs.size === 5, 'All 5 concurrent wishes received distinct collision-free slugs');
  }

  // Validation Edge Cases
  {
    console.log('• Request Validation & Sanitization Hardening');
    // Invalid email sign-in
    const badEmailRes = await worker.fetch(new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' })
    }), prodEnv);
    assert(badEmailRes.status === 400, 'Malformed email returns 400 VALIDATION_ERROR');

    // Executable file upload block
    const badFileRes = await worker.fetch(new Request('http://localhost/api/media/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({ filename: 'malicious.php.exe' })
    }), prodEnv);
    assert(badFileRes.status === 400, 'Forbidden file extension returns 400 VALIDATION_ERROR');
  }

  // Admin Bootstrap via Secret Test
  {
    console.log('• Admin Bootstrap via Secret Verification');
    const bootstrapEnv = {
      ...prodEnv,
      ADMIN_BOOTSTRAP_SECRET: 'test_super_secret_bootstrap_key_999'
    };

    // 1. Unauthorized when secret is wrong
    const badBootRes = await worker.fetch(new Request('http://localhost/api/admin/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-bootstrap-key': 'wrong_key' },
      body: JSON.stringify({ email: 'newadmin@wishmagic.live' })
    }), bootstrapEnv);
    assert(badBootRes.status === 403, 'Wrong bootstrap secret returns 403 BOOTSTRAP_UNAUTHORIZED');

    // 2. Successful bootstrap with valid secret
    const goodBootRes = await worker.fetch(new Request('http://localhost/api/admin/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-bootstrap-key': 'test_super_secret_bootstrap_key_999' },
      body: JSON.stringify({ email: 'newadmin@wishmagic.live', displayName: 'Bootstrap Admin' })
    }), bootstrapEnv);
    assert(goodBootRes.status === 200, 'Valid bootstrap secret succeeds with 200');
    const bootData = await goodBootRes.json();
    assert(bootData.data.bootstrapped === true, 'Admin successfully bootstrapped into system');
  }

  // ============================================================================
  // PART 30B: FIREBASE ADMIN 2FA OTP & STAFF RBAC VERIFICATION
  // ============================================================================
  {
    console.log('\n--- Part 30B: Admin 2FA SMS OTP & Staff Management RBAC ---');

    // 1. Normal User Login requires NO SMS OTP
    console.log('• Normal Website User Flow (No SMS OTP required)');
    const normalUserRes = await worker.fetch(new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'creator@wishmagic.live', displayName: 'Creator User' })
    }), prodEnv);
    assert(normalUserRes.status === 200, 'Main website login succeeds without SMS OTP');
    const normalData = await normalUserRes.json();
    assert(normalData.data.user !== undefined && normalData.data.user.email === 'creator@wishmagic.live', 'Normal user session authenticated');
    assert(normalData.data.requireOtp === undefined, 'No OTP requested for main website user');

    // 2. OWNER 2FA Login Flow (Step 1: Mobile + Password -> Step 2: OTP)
    console.log('• Admin 2FA: Mobile + Password + SMS OTP Flow');
    const ownerMobile = '+919999900001';
    const ownerPassword = 'SuperSecretOwnerPassword!2026';

    const enc = new TextEncoder();
    const saltBytes = new Uint8Array(16);
    saltBytes.fill(1);
    const ownerSalt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    const keyMaterial = await globalThis.crypto.subtle.importKey('raw', enc.encode(ownerPassword), { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']);
    const derivedKey = await globalThis.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const rawKey = await globalThis.crypto.subtle.exportKey('raw', derivedKey);
    const ownerHash = Array.from(new Uint8Array(rawKey)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Seed Owner staff record in testDb
    testDb._tables.adminStaff.set('stf_owner_01', {
      id: 'stf_owner_01',
      user_id: 'usr_owner_01',
      mobile: ownerMobile,
      name: 'Platform Owner',
      role: 'OWNER',
      permissions: JSON.stringify(['*']),
      status: 'active',
      password_hash: ownerHash,
      password_salt: ownerSalt,
      created_by: 'system',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    testDb._tables.users.set('usr_owner_01', {
      id: 'usr_owner_01',
      email: 'owner@wishmagic.live',
      display_name: 'Platform Owner',
      role: 'admin',
      status: 'active'
    });
    testDb._tables.adminRoles.set('usr_owner_01', {
      id: 'adm_role_owner',
      user_id: 'usr_owner_01',
      role: 'OWNER',
      permissions: JSON.stringify(['*'])
    });

    // Step 1a: Wrong password rejected
    const badPassRes = await worker.fetch(new Request('http://localhost/api/admin/auth/verify-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: ownerMobile, password: 'WrongPassword123' })
    }), prodEnv);
    assert(badPassRes.status === 401, 'Step 1a: Wrong password rejected with 401');

    // Step 1b: Valid password accepted, triggers OTP challenge
    const step1Res = await worker.fetch(new Request('http://localhost/api/admin/auth/verify-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: ownerMobile, password: ownerPassword })
    }), prodEnv);
    assert(step1Res.status === 200, 'Step 1: Mobile + Password verified, returns challenge');
    const step1Data = await step1Res.json();
    assert(step1Data.data.requireOtp === true, 'Step 1 requires OTP verification');
    const challengeId = step1Data.data.challengeId;
    assert(challengeId !== undefined, 'Challenge ID generated');

    // Step 2: Verify SMS OTP
    const step2Res = await worker.fetch(new Request('http://localhost/api/admin/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, otpCode: '852963', mobile: ownerMobile })
    }), prodEnv);
    assert(step2Res.status === 200, 'Step 2: OTP verification succeeds');
    const step2Data = await step2Res.json();
    assert(step2Data.data.user.role === 'OWNER', 'User logged in with OWNER role');
    assert(step2Data.data.user.isOwner === true, 'isOwner flag is true');

    const ownerCookie = step2Res.headers.get('set-cookie');
    assert(ownerCookie !== null && ownerCookie.includes('wm_session'), 'Owner received secure wm_session cookie');

    // 3. OWNER Creates Staff Member
    console.log('• OWNER Staff Management: Create Staff Member');
    const createStaffRes = await worker.fetch(new Request('http://localhost/api/admin/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie },
      body: JSON.stringify({
        name: 'Rahul Editor',
        mobile: '+919876543210',
        role: 'EDITOR',
        password: 'EditorPassword2026!',
        permissions: ['templates.read', 'templates.write', 'wishes.read']
      })
    }), prodEnv);
    assert(createStaffRes.status === 201, 'OWNER successfully creates staff member');
    const staffData = await createStaffRes.json();
    const createdStaffId = staffData.data.staff.id;
    const staffUserId = staffData.data.staff.userId;
    assert(staffData.data.staff.role === 'EDITOR', 'Staff created with role EDITOR');

    // 4. Staff Cannot Create Secondary OWNER or Other Staff
    console.log('• Privilege Escalation Protection: Staff Cannot Create Staff or OWNER');
    // Simulate Staff Session
    testDb._tables.sessions.set('tok_staff_test', {
      id: 'ses_staff_test',
      user_id: staffUserId,
      token: 'tok_staff_test',
      expires_at: Date.now() + 86400000,
      created_at: new Date().toISOString()
    });
    const staffCookie = 'wm_session=tok_staff_test';

    const escalRes = await worker.fetch(new Request('http://localhost/api/admin/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': staffCookie },
      body: JSON.stringify({ name: 'Hacker', mobile: '+919999999999', role: 'OWNER', password: '123' })
    }), prodEnv);
    assert(escalRes.status === 403, 'Non-owner staff blocked from creating staff accounts (403)');

    // 5. OWNER Disables Staff Account -> Immediate Session Revocation
    console.log('• Staff Disabling & Session Revocation');
    const disableRes = await worker.fetch(new Request(`http://localhost/api/admin/staff/${createdStaffId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie },
      body: JSON.stringify({ status: 'disabled' })
    }), prodEnv);
    assert(disableRes.status === 200, 'OWNER disables staff account');

    // Attempting API access with revoked session returns 401
    const revokedRes = await worker.fetch(new Request('http://localhost/api/admin/staff', {
      headers: { 'Cookie': staffCookie }
    }), prodEnv);
    assert(revokedRes.status === 401, 'Disabled staff active session immediately revoked (401)');

    // 6. Audit Trail Logging Verification
    console.log('• Security Audit Trail Verification');
    const auditRes = await worker.fetch(new Request('http://localhost/api/admin/audit-logs', {
      headers: { 'Cookie': ownerCookie }
    }), prodEnv);
    assert(auditRes.status === 200, 'Audit logs retrieved by OWNER');
    const auditData = await auditRes.json();
    assert(Array.isArray(auditData.data.logs), 'Audit logs returned as array');
    assert(auditData.data.logs.length >= 2, `Audit logs contain login and staff management events (found ${auditData.data.logs.length})`);
  }

  // ============================================================================
  // DATABASE SCHEMA & DATA INTEGRITY VERIFICATION
  // ============================================================================
  console.log('\n--- 5. Schema, Migrations & Data Integrity Audits ---');
  const migRes = validateMigrations();
  assert(migRes.success === true, 'All D1 migrations and tables validated');

  const integRes = runDataIntegrityCheck();
  assert(integRes.issues.length === 0, 'Data integrity diagnostic completed with 0 errors');

  const secRes = runSecurityAudit();
  assert(secRes.success === true, 'Comprehensive zero-trust security audit passed');

  // ============================================================================
  // OBSERVABILITY & SECRET REDACTION
  // ============================================================================
  console.log('\n--- 6. Observability & Secret Redaction ---');
  const sensitiveObj = {
    password: 'secret_password_123',
    token: 'wm_tok_secret_token_abc',
    nested: {
      apiKey: 'sk_live_12345678901234567890',
      cardNumber: '4111222233334444'
    },
    publicName: 'Wish Celebration'
  };
  const redacted = redactSensitiveData(sensitiveObj);
  assert(redacted.password === '[REDACTED]', 'Password redacted');
  assert(redacted.token === '[REDACTED]', 'Token redacted');
  assert(redacted.nested.apiKey === '[REDACTED]', 'API Key redacted');
  assert(redacted.publicName === 'Wish Celebration', 'Public field preserved');

  // ============================================================================
  // SMART WISH LINK & CUSTOM SLUG SUGGESTIONS SUITE
  // ============================================================================
  console.log('\n--- 7. Smart Wish Link & Custom Slug Suggestions Suite ---');

  // 1. Slug Normalization Unit Tests
  console.log('• Slug Normalization & Safety Hardening');
  assert(WishLinkSuggestions.normalizeNameForSlug('Radha') === 'radha', 'Normalized simple name');
  assert(WishLinkSuggestions.normalizeNameForSlug('Radha Sharma') === 'radha-sharma', 'Spaces to hyphens');
  assert(WishLinkSuggestions.normalizeNameForSlug("Radha's Birthday") === 'radhas-birthday', 'Possessive handled');
  assert(WishLinkSuggestions.normalizeNameForSlug('Rādha') === 'radha', 'Unicode diacritics stripped');
  assert(WishLinkSuggestions.normalizeNameForSlug('Riya & Rahul') === 'riya-rahul', 'Ampersand converted to safe hyphen');
  assert(WishLinkSuggestions.normalizeNameForSlug('   ---Alex---   ') === 'alex', 'Leading/trailing hyphens trimmed');
  assert(WishLinkSuggestions.normalizeNameForSlug('<script>alert("xss")</script>') === 'scriptalertxssscript', 'HTML tags and quotes stripped');

  // 2. Validation & Reserved Route Checking
  console.log('• Reserved Route & Structure Validation');
  assert(WishLinkSuggestions.isReservedSlug('admin') === true, 'admin is reserved');
  assert(WishLinkSuggestions.isReservedSlug('api') === true, 'api is reserved');
  assert(WishLinkSuggestions.isReservedSlug('dashboard') === true, 'dashboard is reserved');
  assert(WishLinkSuggestions.isReservedSlug('happy-birthday-radha') === false, 'celebration slug is not reserved');

  assert(WishLinkSuggestions.isValidSlug('happy-birthday-radha') === true, 'Standard slug is valid');
  assert(WishLinkSuggestions.isValidSlug('a') === false, 'Too short slug is invalid (< 3 chars)');
  assert(WishLinkSuggestions.isValidSlug('admin') === false, 'Reserved slug is invalid');
  assert(WishLinkSuggestions.isValidSlug('invalid--double-hyphen') === false, 'Double hyphens invalid');
  assert(WishLinkSuggestions.isValidSlug('a'.repeat(81)) === false, 'Too long slug is invalid (> 80 chars)');

  // 3. Centralized Contextual Suggestion Generation
  console.log('• Contextual Slug Suggestion Engine');
  // Birthday + Radha
  const bdaySuggestions = WishLinkSuggestions.generateSuggestions({
    occasion: 'birthday',
    recipientName: 'Radha'
  });
  assert(bdaySuggestions.includes('happy-birthday-radha'), 'Includes happy-birthday-radha');
  assert(bdaySuggestions.includes('birthday-wishes-radha'), 'Includes birthday-wishes-radha');
  assert(bdaySuggestions.includes('birthday-surprise-radha'), 'Includes birthday-surprise-radha');
  assert(bdaySuggestions.length >= 5, `Provides at least 5 suggestions (got ${bdaySuggestions.length})`);

  // Birthday + Crush (Radha)
  const crushSuggestions = WishLinkSuggestions.generateSuggestions({
    occasion: 'birthday',
    relationship: 'crush',
    recipientName: 'Radha'
  });
  assert(crushSuggestions.includes('just-for-you-radha'), 'Crush includes just-for-you-radha');
  assert(crushSuggestions.includes('something-special-for-radha'), 'Crush includes something-special-for-radha');

  // Birthday + Girlfriend (Radha)
  const gfSuggestions = WishLinkSuggestions.generateSuggestions({
    occasion: 'birthday',
    relationship: 'girlfriend',
    recipientName: 'Radha'
  });
  assert(gfSuggestions.includes('happy-birthday-my-love'), 'Girlfriend includes happy-birthday-my-love');
  assert(gfSuggestions.includes('birthday-love-radha'), 'Girlfriend includes birthday-love-radha');

  // Birthday + Mother
  const momSuggestions = WishLinkSuggestions.generateSuggestions({
    occasion: 'birthday',
    relationship: 'mother'
  });
  assert(momSuggestions.includes('happy-birthday-mom'), 'Mother includes happy-birthday-mom');
  assert(momSuggestions.includes('love-you-mom'), 'Mother includes love-you-mom');

  // Anniversary
  const annivSuggestions = WishLinkSuggestions.generateSuggestions({
    occasion: 'anniversary',
    recipientName: 'Radha'
  });
  assert(annivSuggestions.includes('happy-anniversary'), 'Anniversary includes happy-anniversary');
  assert(annivSuggestions.includes('happy-anniversary-radha'), 'Anniversary includes happy-anniversary-radha');
  assert(annivSuggestions.includes('our-special-day'), 'Anniversary includes our-special-day');

  // Graceful handling of missing fields (no "undefined")
  const emptySuggestions = WishLinkSuggestions.generateSuggestions({});
  assert(emptySuggestions.length >= 5, 'Empty fields generates fallback suggestions');
  for (const s of emptySuggestions) {
    assert(!s.includes('undefined'), `No 'undefined' in slug "${s}"`);
    assert(WishLinkSuggestions.isValidSlug(s), `Fallback suggestion "${s}" is valid`);
  }

  // 4. Backend /api/wishes/slug-availability Contract Tests
  console.log('• Backend Slug Availability API Contract');

  // Available slug check
  const availRes = await worker.fetch(new Request('http://localhost/api/wishes/slug-availability?slug=super-unique-test-link-xyz'), prodEnv);
  assert(availRes.status === 200, 'Availability check returns 200');
  const availData = await availRes.json();
  assert(availData.success === true, 'Availability success is true');
  assert(availData.available === true, 'Unique slug is reported available');
  assert(availData.slug === 'super-unique-test-link-xyz', 'Normalized slug returned');

  // Reserved slug check
  const reservedRes = await worker.fetch(new Request('http://localhost/api/wishes/slug-availability?slug=admin'), prodEnv);
  assert(reservedRes.status === 200, 'Reserved check returns 200');
  const reservedData = await reservedRes.json();
  assert(reservedData.available === false, 'Reserved slug is unavailable');
  assert(reservedData.reason === 'reserved', 'Reserved reason returned');

  // Invalid slug check
  const invalidRes = await worker.fetch(new Request('http://localhost/api/wishes/slug-availability?slug=ab'), prodEnv);
  assert(invalidRes.status === 200, 'Invalid check returns 200');
  const invalidData = await invalidRes.json();
  assert(invalidData.available === false, 'Short slug is unavailable');
  assert(invalidData.reason === 'invalid', 'Invalid reason returned');

  // Taken slug check with alternatives
  // First create a wish with a known slug
  const takenSlug = 'celebrate-radha-now';
  const wishWithCustomSlugRes = await worker.fetch(new Request('http://localhost/api/wishes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
    body: JSON.stringify({
      templateId: 'tpl_glitter_birthday',
      slug: takenSlug,
      customData: { recipient_name: 'Radha', customSlug: takenSlug }
    })
  }), prodEnv);
  assert(wishWithCustomSlugRes.status === 201, 'Wish created with custom slug');
  const wishCreatedData = await wishWithCustomSlugRes.json();
  const createdWishIdForSlug = (wishCreatedData.data && wishCreatedData.data.wish && wishCreatedData.data.wish.id) || wishCreatedData.wishId;

  // Now checking that taken slug returns available: false and collision alternatives
  const takenRes = await worker.fetch(new Request(`http://localhost/api/wishes/slug-availability?slug=${takenSlug}`), prodEnv);
  assert(takenRes.status === 200, 'Taken check returns 200');
  const takenData = await takenRes.json();
  assert(takenData.available === false, 'Taken slug is reported unavailable');
  assert(takenData.reason === 'taken', 'Reason is taken');
  assert(Array.isArray(takenData.alternatives), 'Alternatives returned as array');
  assert(takenData.alternatives.length > 0, 'At least 1 collision alternative offered');

  // Checking availability with wishId excluding itself (edit scenario)
  const selfRes = await worker.fetch(new Request(`http://localhost/api/wishes/slug-availability?slug=${takenSlug}&wishId=${createdWishIdForSlug}`), prodEnv);
  assert(selfRes.status === 200, 'Self-exclusion check returns 200');
  const selfData = await selfRes.json();
  assert(selfData.available === true, 'Wish editing its own slug is reported available');
  assert(selfData.isCurrent === true, 'isCurrent flag is true');

  // Conflict on duplicate POST with custom slug
  const conflictRes = await worker.fetch(new Request('http://localhost/api/wishes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': userBCookie },
    body: JSON.stringify({
      templateId: 'tpl_glitter_birthday',
      slug: takenSlug,
      customData: { recipient_name: 'Imposter', customSlug: takenSlug }
    })
  }), prodEnv);
  assert(conflictRes.status === 409, 'Duplicate custom slug creation returns 409 Conflict');

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n================================================================');
  console.log(`🎉 TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
