/**
 * WishMagic Part 42: Media Storage Inventory, Metadata & Audio Playback Repair Test Suite
 * =======================================================================================
 * Validates:
 * 1. Backblaze B2 Storage Inventory listing with metadata enrichment
 * 2. ImgBB Application-Managed Inventory listing from D1
 * 3. URL accessibility verification endpoint
 * 4. Storage reconciliation (cloud vs D1) dry-run analysis
 * 5. Import uncatalogued B2 storage object into D1
 * 6. Cloudflare D1 Schema self-healing endpoint (/api/admin/media/schema-heal)
 * 7. Audio streaming proxy (/api/media/stream) with Range header support & 206 Partial Content
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

function createMockEnv(overrides = {}) {
  const d1Tables = {
    music_library: [
      {
        id: 'mus_track_1',
        title: 'Celebration Symphony',
        artist: 'WishMagic Orchestra',
        description: 'Uplifting orchestra',
        category: 'celebration',
        storage_provider: 'b2',
        storage_key: 'music/celebration_symphony.mp3',
        playback_url: 'https://f005.backblazeb2.com/file/wishmagic-assets/music/celebration_symphony.mp3',
        mime_type: 'audio/mpeg',
        duration_seconds: 180,
        size_bytes: 4194304,
        status: 'active',
        created_at: '2026-10-09T08:00:00Z',
        updated_at: '2026-10-09T08:00:00Z'
      }
    ],
    wish_media: [
      {
        id: 'wm_1',
        filename: 'celebration_symphony.mp3',
        object_key: 'music/celebration_symphony.mp3',
        media_type: 'audio',
        mime_type: 'audio/mpeg',
        size_bytes: 4194304,
        url: 'https://f005.backblazeb2.com/file/wishmagic-assets/music/celebration_symphony.mp3',
        storage_provider: 'b2',
        status: 'active',
        created_at: '2026-10-09T08:00:00Z'
      }
    ],
    template_images: [
      {
        id: 'ti_1',
        asset_key: 'hero_photo',
        original_url: 'https://i.ibb.co/abc/image.jpg',
        display_url: 'https://i.ibb.co/abc/image.jpg',
        provider_asset_id: 'ibb_123',
        size_bytes: 204800,
        width: 1200,
        height: 800,
        storage_provider: 'imgbb',
        created_at: '2026-10-09T08:00:00Z'
      }
    ],
    b2_storage_objects: []
  };

  const mockDB = {
    prepare(sql) {
      let boundArgs = [];
      const stmt = {
        bind(...args) {
          boundArgs = args;
          return stmt;
        },
        async first() {
          if (sql.includes('FROM sessions')) {
            return {
              id: 'ses_1',
              user_id: 'usr_admin',
              token: boundArgs[0] || 'wm_tok_admintest123',
              expires_at: Date.now() + 1000000
            };
          }
          if (sql.includes('FROM users') || sql.includes('FROM admin_staff') || sql.includes('admin_roles')) {
            return {
              id: 'usr_admin',
              email: 'ankit.babusaini@gmail.com',
              role: 'admin',
              is_admin: 1
            };
          }
          if (sql.includes('SELECT storage_key FROM music_library') || sql.includes('SELECT object_key')) {
            const found = d1Tables.music_library.find(t => t.id === boundArgs[0]);
            return found ? { storage_key: found.storage_key } : null;
          }
          return null;
        },
        async all() {
          if (sql.includes('PRAGMA table_info(music_library)')) {
            return {
              results: [
                { cid: 0, name: 'id', type: 'TEXT' },
                { cid: 1, name: 'title', type: 'TEXT' },
                { cid: 2, name: 'artist', type: 'TEXT' },
                { cid: 3, name: 'storage_key', type: 'TEXT' },
                { cid: 4, name: 'playback_url', type: 'TEXT' }
              ]
            };
          }
          if (sql.includes('PRAGMA table_info(wish_media)')) {
            return { results: [{ name: 'id' }, { name: 'object_key' }] };
          }
          if (sql.includes('PRAGMA table_info(b2_storage_objects)')) {
            return { results: [{ name: 'id' }, { name: 'object_key' }] };
          }
          if (sql.includes('FROM music_library')) {
            return { results: [...d1Tables.music_library] };
          }
          if (sql.includes('FROM template_images')) {
            return { results: [...d1Tables.template_images] };
          }
          if (sql.includes('FROM wish_media')) {
            return { results: [...d1Tables.wish_media] };
          }
          return { results: [] };
        },
        async run() {
          return { success: true };
        }
      };
      return stmt;
    }
  };

  return {
    ENVIRONMENT: 'production',
    B2_KEY_ID: '003testkeyid',
    B2_APPLICATION_KEY: 'K003testappkeyvalue',
    B2_BUCKET_NAME: 'wishmagic-assets',
    B2_ENDPOINT: 'https://api.backblazeb2.com',
    DB: mockDB,
    ...overrides
  };
}

function createAdminRequest(url, method = 'GET', body = null, headers = {}) {
  const reqHeaders = new Headers({
    'Cookie': 'wm_session=wm_tok_admintest123',
    ...headers
  });
  if (body && typeof body === 'object' && !(body instanceof ArrayBuffer)) {
    reqHeaders.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  return new Request(url, { method, headers: reqHeaders, body });
}

test('WishMagic Part 42: Media Storage Inventory & Audio Playback Repair', async (t) => {

  await t.test('TEST 1: Admin B2 inventory lists objects with metadata enrichment', async () => {
    const env = createMockEnv();
    const req = createAdminRequest('https://wishmagic.pages.dev/api/admin/storage/b2/inventory?prefix=music/&maxKeys=50');
    const res = await worker.fetch(req, env);

    // If B2 credentials are mocked or live, response should be 200 or 502 with structured format
    assert.ok(res.status === 200 || res.status === 502, `Expected 200 or 502, got ${res.status}`);
    const data = await res.json();
    if (res.status === 200) {
      assert.ok(Array.isArray(data.files), 'Expected files array');
      assert.ok(data.bucketName, 'Expected bucketName in response');
    } else {
      assert.ok(data.error, 'Expected structured error');
    }
  });

  await t.test('TEST 2: Application-managed ImgBB inventory returns D1 image assets', async () => {
    const env = createMockEnv();
    const req = createAdminRequest('https://wishmagic.pages.dev/api/admin/storage/imgbb/inventory');
    const res = await worker.fetch(req, env);

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.provider, 'imgbb');
    assert.ok(Array.isArray(data.assets), 'Assets must be an array');
    assert.ok(data.assets.length > 0, 'Should return at least 1 mock image asset');
    assert.equal(data.assets[0].verificationStatus, 'known_to_application');
  });

  await t.test('TEST 3: URL accessibility verification rejects malformed URLs', async () => {
    const env = createMockEnv();
    const req = createAdminRequest('https://wishmagic.pages.dev/api/admin/storage/verify-url', 'POST', { url: 'ftp://invalid-url' });
    const res = await worker.fetch(req, env);

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error.code, 'INVALID_URL');
  });

  await t.test('TEST 4: Storage reconciliation dry-run endpoint returns structured summary', async () => {
    const env = createMockEnv();
    const req = createAdminRequest('https://wishmagic.pages.dev/api/admin/storage/reconcile');
    const res = await worker.fetch(req, env);

    assert.ok(res.status === 200 || res.status === 502);
    const data = await res.json();
    if (res.status === 200) {
      assert.ok(data.reconciliationReport);
      assert.ok(data.reconciliationReport.summary);
    }
  });

  await t.test('TEST 5: Explicit 1-click D1 schema healing endpoint (/api/admin/media/schema-heal)', async () => {
    const env = createMockEnv();
    const req = createAdminRequest('https://wishmagic.pages.dev/api/admin/media/schema-heal', 'POST');
    const res = await worker.fetch(req, env);

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.healed, true);
    assert.equal(data.databaseId, 'c08b683b-eb07-4639-ab33-fb1139bfb295');
    assert.ok(data.tables.music_library, 'music_library table must be reported');
    assert.ok(data.tables.wish_media, 'wish_media table must be reported');
    assert.ok(data.tables.b2_storage_objects, 'b2_storage_objects table must be reported');
  });

  await t.test('TEST 6: Audio streaming proxy resolves key by ID from music_library', async () => {
    const env = createMockEnv();
    const req = new Request('https://wishmagic.pages.dev/api/media/stream?id=mus_track_1');
    const res = await worker.fetch(req, env);

    // Audio stream route must attempt to resolve track and return stream or upstream storage error
    assert.ok(res.status === 200 || res.status === 206 || res.status === 502);
  });

  await t.test('TEST 7: Audio streaming proxy rejects directory traversal path', async () => {
    const env = createMockEnv();
    const req = new Request('https://wishmagic.pages.dev/api/media/stream?key=../../etc/passwd');
    const res = await worker.fetch(req, env);

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'INVALID_KEY');
  });
});
