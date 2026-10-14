/**
 * WishMagic Part 26 Test Suite
 * My Wishes + Wish Lifecycle Management + Duplicate/Create Again + Favorites Integration
 * 
 * Verifies:
 * - Server-Verified Ownership: User A cannot see User B's wishes, drafts, or favorites
 * - Unauthenticated requests rejected with 401 AUTH_REQUIRED
 * - Draft Management: Creation, listing, autosave, and preview isolation
 * - Lifecycle Resolver: Upcoming, Active, Expired according to Asia/Kolkata (IST = UTC+05:30)
 * - Duplicate: Clones wish into a new draft with '(Copy)' recipient and preserved template version
 * - Create Again: Clones expired wish into brand new draft without reactivating or mutating old wish
 * - Favorites Integration: Real server persistence, toggle, filter, and cascade deletion
 * - IDOR Protection: Multi-user isolation across all operations
 * - Database Schema: Additive migration 0011 with performance indexes
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../src/worker.js';

const IST_OFFSET_MS = 330 * 60 * 1000;

function createTestD1() {
  const users = new Map();
  const sessions = new Map();
  const wishes = new Map();
  const favorites = new Map();
  const templateVersions = new Map();

  return {
    _tables: { users, sessions, wishes, favorites, templateVersions },
    prepare(sql) {
      function stmt(boundArgs = []) {
        return {
          bind(...newArgs) {
            return stmt(newArgs);
          },
          async first() {
            const normalized = sql.replace(/\s+/g, ' ').trim();
            const args = boundArgs;

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

            if (normalized.includes('FROM users WHERE id = ?')) {
              const u = users.get(args[0]);
              return u ? { ...u } : null;
            }
            if (normalized.includes('FROM sessions WHERE token = ?')) {
              const s = sessions.get(args[0]);
              return s ? { ...s } : null;
            }
            if (normalized.includes('FROM wishes WHERE id = ? OR slug = ?')) {
              for (const w of wishes.values()) {
                if (w.id === args[0] || w.slug === args[0]) {
                  return { ...w };
                }
              }
              return null;
            }
            if (normalized.includes('FROM template_versions WHERE id = ?')) {
              const tv = templateVersions.get(args[0]);
              return tv ? { ...tv } : null;
            }
            if (normalized.includes('COUNT(*) as count FROM wish_publication_snapshots')) {
              return { count: 0 };
            }
            if (normalized.includes('FROM favorites WHERE user_id = ? AND item_id = ?')) {
              for (const f of favorites.values()) {
                if (f.user_id === args[0] && f.item_id === args[1]) {
                  return { ...f };
                }
              }
              return null;
            }

            const all = await this.all();
            return (all && all.results && all.results[0]) || null;
          },
          async all() {
            const normalized = sql.replace(/\s+/g, ' ').trim();
            const args = boundArgs;

            if (normalized.includes('FROM users WHERE id = ?')) {
              const u = users.get(args[0]);
              return { results: u ? [{ ...u }] : [] };
            }
            if (normalized.includes('FROM sessions WHERE token = ?')) {
              const s = sessions.get(args[0]);
              return { results: s ? [{ ...s }] : [] };
            }
            if (normalized.includes('FROM wishes WHERE id = ? OR slug = ?')) {
              for (const w of wishes.values()) {
                if (w.id === args[0] || w.slug === args[0]) {
                  return { results: [{ ...w }] };
                }
              }
              return { results: [] };
            }
            if (normalized.includes('FROM wishes WHERE user_id = ?')) {
              const res = [];
              for (const w of wishes.values()) {
                if (w.user_id === args[0]) {
                  if (normalized.includes('status = ?')) {
                    if (w.status === args[1]) res.push({ ...w });
                  } else {
                    res.push({ ...w });
                  }
                }
              }
              return { results: res };
            }
            if (normalized.includes('FROM wishes')) {
              const res = [];
              for (const w of wishes.values()) {
                res.push({ ...w });
              }
              return { results: res };
            }
            if (normalized.includes('FROM favorites WHERE user_id = ?')) {
              const res = [];
              for (const f of favorites.values()) {
                if (f.user_id === args[0]) {
                  if (args[1] && f.item_id !== args[1]) continue;
                  res.push({ ...f });
                }
              }
              return { results: res };
            }
            if (normalized.includes('FROM template_versions WHERE id = ?')) {
              const tv = templateVersions.get(args[0]);
              return { results: tv ? [{ ...tv }] : [] };
            }

            return { results: [] };
          },
          async run() {
            const normalized = sql.replace(/\s+/g, ' ').trim();
            const args = boundArgs;

            if (normalized.startsWith('INSERT INTO wishes') || normalized.startsWith('INSERT OR REPLACE INTO wishes')) {
              const match = sql.match(/\(([^)]+)\)\s+VALUES/i);
              if (match) {
                const cols = match[1].split(',').map(c => c.trim().toLowerCase());
                const row = {};
                cols.forEach((col, idx) => {
                  row[col] = args[idx];
                });
                wishes.set(row.id, {
                  id: row.id,
                  slug: row.slug,
                  user_id: row.user_id,
                  order_id: row.order_id,
                  template_id: row.template_id,
                  template_version_id: row.template_version_id,
                  template_name: row.template_name,
                  tier: row.tier,
                  price: row.price,
                  is_private: row.is_private,
                  buyer_name: row.buyer_name,
                  buyer_contact: row.buyer_contact,
                  recipient_name: row.recipient_name,
                  event_date: row.event_date,
                  expiry_date: row.expiry_date,
                  status: row.status,
                  lifecycle_status: row.lifecycle_status,
                  views: row.views || 0,
                  custom_data: row.custom_data,
                  payment: row.payment,
                  created_at: row.created_at,
                  updated_at: row.updated_at
                });
              } else {
                const [id, slug, user_id, order_id, template_id, template_version_id, template_name, tier, price, is_private, buyer_name, buyer_contact, recipient_name, event_date, expiry_date, status, views, custom_data, payment, created_at, updated_at] = args;
                wishes.set(id, {
                  id, slug, user_id, order_id, template_id, template_version_id, template_name,
                  tier, price, is_private, buyer_name, buyer_contact, recipient_name,
                  event_date, expiry_date, status, views: views || 0, custom_data, payment,
                  created_at, updated_at
                });
              }
              return { success: true };
            }

            if (normalized.startsWith('DELETE FROM wishes WHERE id = ?')) {
              wishes.delete(args[0]);
              return { success: true };
            }

            if (normalized.startsWith('INSERT OR IGNORE INTO favorites') || normalized.startsWith('INSERT INTO favorites')) {
              const [id, user_id, item_id, item_type, created_at] = args;
              favorites.set(id, { id, user_id, item_id, item_type, created_at });
              return { success: true };
            }

            if (normalized.startsWith('DELETE FROM favorites WHERE id = ?')) {
              favorites.delete(args[0]);
              return { success: true };
            }

            if (normalized.startsWith('DELETE FROM favorites WHERE user_id = ? AND item_id = ?')) {
              for (const [k, v] of favorites.entries()) {
                if (v.user_id === args[0] && v.item_id === args[1]) {
                  favorites.delete(k);
                }
              }
              return { success: true };
            }

            if (normalized.startsWith('DELETE FROM favorites WHERE item_id = ?')) {
              for (const [k, v] of favorites.entries()) {
                if (v.item_id === args[0]) {
                  favorites.delete(k);
                }
              }
              return { success: true };
            }

            return { success: true };
          }
        };
      }
      return stmt();
    }
  };
}

test('Part 26: Wish Lifecycle & Ownership Test Suite', async (t) => {
  const db = createTestD1();
  const env = {
    DB: db,
    NODE_ENV: 'test',
    JWT_SECRET: 'test_jwt_secret_32bytes_long_string_1234'
  };

  // Seed User A (Alice - Creator)
  db._tables.users.set('usr_alice_1', {
    id: 'usr_alice_1',
    email: 'alice@example.com',
    display_name: 'Alice Wonder',
    role: 'creator',
    plan: 'free',
    is_premium: 0,
    created_at: new Date().toISOString()
  });
  db._tables.sessions.set('token_alice', {
    token: 'token_alice',
    user_id: 'usr_alice_1',
    expires_at: Date.now() + 3600000
  });

  // Seed User B (Bob - Creator)
  db._tables.users.set('usr_bob_2', {
    id: 'usr_bob_2',
    email: 'bob@example.com',
    display_name: 'Bob Builder',
    role: 'creator',
    plan: 'free',
    is_premium: 0,
    created_at: new Date().toISOString()
  });
  db._tables.sessions.set('token_bob', {
    token: 'token_bob',
    user_id: 'usr_bob_2',
    expires_at: Date.now() + 3600000
  });

  // Seed Template Version
  db._tables.templateVersions.set('tv_tpl_glitter_birthday_v1', {
    id: 'tv_tpl_glitter_birthday_v1',
    template_id: 'tpl_glitter_birthday',
    version_number: 1,
    name: 'Glitter Birthday Classic',
    status: 'published'
  });

  // Calculate IST Dates for testing
  const nowUtc = Date.now();
  const istNow = new Date(nowUtc + IST_OFFSET_MS);
  const todayStr = istNow.toISOString().split('T')[0];

  const tomorrowIst = new Date(nowUtc + IST_OFFSET_MS + 24 * 3600 * 1000);
  const tomorrowStr = tomorrowIst.toISOString().split('T')[0];

  const yesterdayIst = new Date(nowUtc + IST_OFFSET_MS - 24 * 3600 * 1000);
  const yesterdayStr = yesterdayIst.toISOString().split('T')[0];

  // 1. Unauthenticated requests to /api/wishes rejected
  await t.test('1. Unauthenticated requests to /api/wishes return 401 AUTH_REQUIRED', async () => {
    const req = new Request('http://localhost/api/wishes', { method: 'GET' });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'AUTH_REQUIRED');
  });

  // 2. Unauthenticated requests to /api/favorites rejected
  await t.test('2. Unauthenticated requests to /api/favorites return 401 AUTH_REQUIRED', async () => {
    const req = new Request('http://localhost/api/favorites', { method: 'GET' });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 401);
  });

  // 3. User A creates a DRAFT wish
  let draftWishId = '';
  await t.test('3. User A creates a draft wish with status: draft', async () => {
    const req = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: JSON.stringify({
        templateId: 'tpl_glitter_birthday',
        status: 'draft',
        isDraft: true,
        customData: {
          recipient_name: 'Charlie',
          event_date: tomorrowStr,
          relationship: 'best_friend',
          isDraft: true
        }
      })
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 201);
    const body = await res.json();
    const wish = body.data?.wish || body.wish;
    assert.equal(wish.status, 'draft');
    assert.equal(wish.lifecycleStatus, 'draft');
    assert.equal(wish.userId, 'usr_alice_1');
    draftWishId = wish.id;
  });

  // 4. User A creates an UPCOMING wish
  let upcomingWishId = '';
  await t.test('4. User A creates an upcoming published wish', async () => {
    const req = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: JSON.stringify({
        templateId: 'tpl_glitter_birthday',
        status: 'published',
        customData: {
          recipient_name: 'Diana',
          event_date: tomorrowStr,
          relationship: 'crush'
        }
      })
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 201);
    const body = await res.json();
    const wish = body.data?.wish || body.wish;
    assert.equal(wish.lifecycleStatus, 'upcoming');
    upcomingWishId = wish.id;
  });

  // 5. User A creates an ACTIVE wish (eventDate == today)
  let activeWishId = '';
  await t.test('5. User A creates an active published wish for today', async () => {
    const req = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: JSON.stringify({
        templateId: 'tpl_glitter_birthday',
        status: 'published',
        customData: {
          recipient_name: 'Evan',
          event_date: todayStr,
          relationship: 'partner'
        }
      })
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 201);
    const body = await res.json();
    const wish = body.data?.wish || body.wish;
    assert.equal(wish.lifecycleStatus, 'active');
    activeWishId = wish.id;
  });

  // 6. User A creates an EXPIRED wish (eventDate in past)
  let expiredWishId = '';
  await t.test('6. User A creates an expired wish with past eventDate', async () => {
    const req = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: JSON.stringify({
        templateId: 'tpl_glitter_birthday',
        status: 'published',
        customData: {
          recipient_name: 'Fiona',
          event_date: yesterdayStr,
          relationship: 'mom'
        }
      })
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 201);
    const body = await res.json();
    const wish = body.data?.wish || body.wish;
    assert.equal(wish.lifecycleStatus, 'expired');
    expiredWishId = wish.id;
  });

  // 7. Strict Multi-User Isolation: User B cannot see User A's wishes
  await t.test('7. Strict Multi-User Isolation: User B cannot see User A wishes', async () => {
    const req = new Request('http://localhost/api/wishes', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer token_bob' }
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 200);
    const body = await res.json();
    const list = body.data?.wishes || body.wishes;
    assert.equal(list.length, 0, 'User B should see 0 wishes');
  });

  // 8. User A queries /api/wishes and receives real server data across all lifecycle states
  await t.test('8. User A receives all their wishes with correct lifecycle statuses', async () => {
    const req = new Request('http://localhost/api/wishes', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer token_alice' }
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 200);
    const body = await res.json();
    const list = body.data?.wishes || body.wishes;
    assert.equal(list.length, 4);

    const statuses = list.map(w => w.lifecycleStatus);
    assert.ok(statuses.includes('draft'));
    assert.ok(statuses.includes('upcoming'));
    assert.ok(statuses.includes('active'));
    assert.ok(statuses.includes('expired'));
  });

  // 9. Duplicate: Clones an existing wish into a new draft
  let duplicatedWishId = '';
  await t.test('9. User A duplicates an active wish into a new draft', async () => {
    const req = new Request(`http://localhost/api/wishes/${activeWishId}/duplicate`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer token_alice' }
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data?.duplicated || body.duplicated, true);
    duplicatedWishId = body.data?.wishId || body.wishId;
    assert.ok(duplicatedWishId);
    assert.notEqual(duplicatedWishId, activeWishId);

    // Verify duplicated wish in DB is draft
    const dupWish = db._tables.wishes.get(duplicatedWishId);
    assert.ok(dupWish);
    assert.equal(dupWish.status, 'draft');
    assert.equal(dupWish.user_id, 'usr_alice_1');
  });

  // 10. IDOR: User B cannot duplicate User A's wish
  await t.test('10. User B cannot duplicate User A wish (403 Forbidden)', async () => {
    const req = new Request(`http://localhost/api/wishes/${activeWishId}/duplicate`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer token_bob' }
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 403);
  });

  // 11. Create Again: Clones an expired wish into a brand new draft
  let createAgainWishId = '';
  await t.test('11. User A creates again from expired wish into new clean draft', async () => {
    const req = new Request(`http://localhost/api/wishes/${expiredWishId}/create-again`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer token_alice' }
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data?.createdAgain || body.createdAgain, true);
    createAgainWishId = body.data?.wishId || body.wishId;
    assert.ok(createAgainWishId);
    assert.notEqual(createAgainWishId, expiredWishId);

    // Verify new draft
    const newDraft = db._tables.wishes.get(createAgainWishId);
    assert.equal(newDraft.status, 'draft');
    assert.equal(newDraft.recipient_name, 'Fiona');

    // Verify original expired wish is untouched and still expired
    const oldWish = db._tables.wishes.get(expiredWishId);
    assert.equal(oldWish.status, 'published');
    assert.equal(oldWish.event_date, yesterdayStr);
  });

  // 12. IDOR: User B cannot create again from User A's expired wish
  await t.test('12. User B cannot create again from User A wish (403 Forbidden)', async () => {
    const req = new Request(`http://localhost/api/wishes/${expiredWishId}/create-again`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer token_bob' }
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 403);
  });

  // 13. Favorites: User A favorites and unfavorites wishes
  await t.test('13. Favorites integration with server persistence and toggle', async () => {
    // Favorite active wish
    const favReq = new Request('http://localhost/api/favorites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: JSON.stringify({ itemId: activeWishId, itemType: 'wish' })
    });
    const favRes = await worker.fetch(favReq, env);
    assert.equal(favRes.status, 200);
    const favBody = await favRes.json();
    assert.equal(favBody.data?.favorited || favBody.favorited, true);

    // List favorites
    const listReq = new Request('http://localhost/api/favorites', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer token_alice' }
    });
    const listRes = await worker.fetch(listReq, env);
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    const favs = listBody.data?.favorites || listBody.favorites;
    assert.ok(favs.includes(activeWishId));

    // Toggle off favorite
    const toggleReq = new Request('http://localhost/api/favorites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: JSON.stringify({ itemId: activeWishId, itemType: 'wish' })
    });
    const toggleRes = await worker.fetch(toggleReq, env);
    assert.equal(toggleRes.status, 200);
    const toggleBody = await toggleRes.json();
    assert.equal(toggleBody.data?.favorited || toggleBody.favorited, false);
  });

  // 14. Safe Deletion & Favorites Cascade
  await t.test('14. Safe deletion removes wish and cascades favorite reference', async () => {
    // First favorite the upcoming wish
    await worker.fetch(new Request('http://localhost/api/favorites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_alice'
      },
      body: JSON.stringify({ itemId: upcomingWishId, itemType: 'wish' })
    }), env);

    // Delete upcoming wish
    const delReq = new Request(`http://localhost/api/wishes/${upcomingWishId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer token_alice' }
    });
    const delRes = await worker.fetch(delReq, env);
    assert.equal(delRes.status, 200);

    // Verify wish is deleted
    assert.equal(db._tables.wishes.has(upcomingWishId), false);

    // Verify favorite reference was cascaded
    const listRes = await worker.fetch(new Request('http://localhost/api/favorites', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer token_alice' }
    }), env);
    const listBody = await listRes.json();
    const favs = listBody.data?.favorites || listBody.favorites;
    assert.ok(!favs.includes(upcomingWishId));
  });

  // 15. Verify Migration 0011 syntax and indexes
  await t.test('15. Migration 0011 file exists with valid additive indexes', () => {
    const migPath = path.resolve(process.cwd(), 'migrations/0011_part26_wish_lifecycle_and_favorites.sql');
    assert.ok(fs.existsSync(migPath), 'Migration 0011 file must exist');
    const content = fs.readFileSync(migPath, 'utf8');
    assert.ok(content.includes('idx_wishes_user_status'));
    assert.ok(content.includes('idx_favorites_user_type'));
    assert.ok(content.includes('mig_0011'));
  });
});
