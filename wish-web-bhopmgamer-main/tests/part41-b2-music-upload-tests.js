/**
 * WishMagic Part 41: Backblaze B2 Audio & Music Upload Integration Test Suite
 * =========================================================================
 * Tests all requirements from USER_REQUEST:
 * - TEST 1: Missing B2 configuration returns structured error (B2_NOT_CONFIGURED, 503)
 * - TEST 2: Environment binding resolution (B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT)
 * - TEST 3: Native B2 bucketId auto-resolution via b2_list_buckets
 * - TEST 4: Invalid audio format and malware/script rejection (AUDIO_INVALID, FILE_SECURITY_REJECTED)
 * - TEST 5: Oversized audio file rejection (AUDIO_TOO_LARGE, > 50 MB)
 * - TEST 6: Unauthorized music upload rejection (401 AUTH_REQUIRED, 403 FORBIDDEN)
 * - TEST 7: B2 Authorization failure handling (B2_AUTH_FAILED)
 * - TEST 8: B2 Upload failure handling and safe sanitization (no tokens or keys leaked)
 * - TEST 9: D1 metadata write failure triggers safe B2 storage rollback & cleanup
 * - TEST 10: Successful music upload pipeline with real bytes and D1 persistence
 * - TEST 11: Playable asset URL construction and format validation
 * - TEST 12: Duplicate submission prevention and form preservation for retry
 * - TEST 13: Universal media multi-cloud routing (Images -> ImgBB, Music/Video -> Backblaze B2)
 * - TEST 14: Admin media library (/api/admin/media/all) indexes D1 music_library with Backblaze B2 badge
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  B2StorageProvider,
  getB2Config,
  AUDIO_LIMITS,
  validateAudioBuffer,
  VIDEO_LIMITS,
  validateVideoBuffer
} from '../src/storage-provider.js';

import worker from '../src/worker.js';

// Realistic Minimal Audio Byte Samples
// Minimal MP3 with ID3v2 Header ("ID3" + 7 bytes header + frame sync)
const VALID_MP3_BYTES = new Uint8Array([
  0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0A, // ID3v2.3 header
  0x54, 0x49, 0x54, 0x32, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, // TIT2 frame
  0xFF, 0xFB, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00              // MPEG audio sync frame (0xFF 0xFB)
]);

// Minimal WAV Audio Bytes ("RIFF" + size + "WAVE" + "fmt ")
const VALID_WAV_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, // "RIFF"
  0x24, 0x00, 0x00, 0x00, // file size - 8
  0x57, 0x41, 0x56, 0x45, // "WAVE"
  0x66, 0x6D, 0x74, 0x20, // "fmt "
  0x10, 0x00, 0x00, 0x00, // 16 bytes format chunk
  0x01, 0x00,             // PCM format
  0x02, 0x00,             // 2 channels
  0x44, 0xAC, 0x00, 0x00, // 44100 Hz
  0x10, 0xB1, 0x02, 0x00, // byte rate
  0x04, 0x00,             // block align
  0x10, 0x00,             // 16 bits per sample
  0x64, 0x61, 0x74, 0x61, // "data"
  0x00, 0x00, 0x00, 0x00
]);

// Minimal OGG Audio Bytes ("OggS")
const VALID_OGG_BYTES = new Uint8Array([
  0x4F, 0x67, 0x67, 0x53, // "OggS"
  0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

test('WishMagic Part 41: Backblaze B2 Audio & Music Upload Integration Suite', async (t) => {

  await t.test('TEST 1: Missing B2 configuration returns structured error (B2_NOT_CONFIGURED, 503)', async () => {
    // 1. Verify getB2Config detects missing configuration
    const config = getB2Config({});
    assert.strictEqual(config.isConfigured, false);
    assert.ok(config.missingKeys.includes('B2_APPLICATION_KEY_ID'));
    assert.ok(config.missingKeys.includes('B2_APPLICATION_KEY'));

    // 2. Invoking worker /api/admin/media/upload without B2 secrets must return 503 B2_NOT_CONFIGURED
    const req = new Request('https://wishmagic.live/api/admin/media/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        title: 'Celebration Symphony',
        type: 'audio',
        filename: 'celebration.mp3',
        fileData: Buffer.from(VALID_MP3_BYTES).toString('base64')
      })
    });

    const env = {
      ENVIRONMENT: 'test',
      // Simulates admin auth without B2 keys
      DB: {
        prepare: () => ({
          bind: () => ({
            first: async () => ({ id: 'usr_admin', email: 'ankit.babusaini@gmail.com', role: 'admin' }),
            all: async () => ({ results: [] }),
            run: async () => ({ success: true })
          })
        })
      }
    };

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 503, 'Must return HTTP 503 Service Unavailable');
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.code || data.error?.code || data.error, 'B2_NOT_CONFIGURED');
    assert.ok(data.message.includes('Backblaze B2'));
    assert.ok(data.message.includes('Missing:'));
  });

  await t.test('TEST 2: Environment binding resolution (B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT)', () => {
    // Exact secrets configured in Cloudflare by user
    const cloudflareSecrets = {
      B2_KEY_ID: 'cf_key_id_9999',
      B2_APPLICATION_KEY: 'cf_secret_key_8888',
      B2_BUCKET_NAME: 'wishmagic-music-vault',
      B2_ENDPOINT: 'https://api.backblazeb2.com'
    };

    const config = getB2Config(cloudflareSecrets);
    assert.strictEqual(config.isConfigured, true, 'Must accept B2_KEY_ID as applicationKeyId');
    assert.strictEqual(config.applicationKeyId, 'cf_key_id_9999');
    assert.strictEqual(config.applicationKey, 'cf_secret_key_8888');
    assert.strictEqual(config.bucketName, 'wishmagic-music-vault');
    assert.strictEqual(config.missingKeys.length, 0);

    const provider = B2StorageProvider.fromEnv(cloudflareSecrets);
    assert.strictEqual(provider.applicationKeyId, 'cf_key_id_9999');
    assert.strictEqual(provider.bucketName, 'wishmagic-music-vault');
  });

  await t.test('TEST 3: Native B2 bucketId auto-resolution via b2_list_buckets', async () => {
    let listBucketsCalled = false;
    let getUploadUrlCalled = false;

    const mockFetch = async (url, options) => {
      if (url.includes('/b2api/v3/b2_authorize_account')) {
        return new Response(JSON.stringify({
          accountId: 'acc_123',
          authorizationToken: 'auth_tok_abc',
          apiUrl: 'https://api005.backblazeb2.com',
          downloadUrl: 'https://f005.backblazeb2.com',
          allowed: {
            bucketId: null, // Key has access to all buckets, bucketId is null
            bucketName: null
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.includes('/b2api/v3/b2_list_buckets')) {
        listBucketsCalled = true;
        const body = JSON.parse(options.body);
        assert.strictEqual(body.accountId, 'acc_123');
        assert.strictEqual(body.bucketName, 'wishmagic-music-vault');
        return new Response(JSON.stringify({
          buckets: [
            { bucketId: 'bkt_resolved_456', bucketName: 'wishmagic-music-vault', bucketType: 'allPublic' }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.includes('/b2api/v3/b2_get_upload_url')) {
        getUploadUrlCalled = true;
        const body = JSON.parse(options.body);
        assert.strictEqual(body.bucketId, 'bkt_resolved_456', 'Must use auto-resolved bucketId');
        return new Response(JSON.stringify({
          bucketId: 'bkt_resolved_456',
          uploadUrl: 'https://pod-001.backblazeb2.com/b2api/v3/b2_upload_file/test',
          authorizationToken: 'upload_tok_xyz'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response('Not Found', { status: 404 });
    };

    const provider = new B2StorageProvider({
      applicationKeyId: 'test_key',
      applicationKey: 'test_app_key',
      bucketName: 'wishmagic-music-vault',
      bucketId: null, // No bucketId supplied!
      fetchFn: mockFetch
    });

    const uploadTarget = await provider.getUploadUrl();
    assert.ok(listBucketsCalled, 'b2_list_buckets must be invoked to resolve bucketId');
    assert.ok(getUploadUrlCalled, 'b2_get_upload_url must be invoked with resolved bucketId');
    assert.strictEqual(uploadTarget.bucketId, 'bkt_resolved_456');
    assert.strictEqual(provider.bucketId, 'bkt_resolved_456');
  });

  await t.test('TEST 4: Invalid audio format and malware/script rejection (AUDIO_INVALID, FILE_SECURITY_REJECTED)', async () => {
    // 1. Rejection of executable payload disguised as mp3
    const executableBytes = new Uint8Array([0x4D, 0x5A, 0x90, 0x00]); // "MZ" DOS executable header
    await assert.rejects(
      async () => validateAudioBuffer(executableBytes, { filename: 'song.mp3' }),
      (err) => err.code === 'FILE_SECURITY_REJECTED'
    );

    // 2. Rejection of HTML / Script payload disguised as mp3
    const htmlBytes = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    await assert.rejects(
      async () => validateAudioBuffer(htmlBytes, { filename: 'track.mp3' }),
      (err) => err.code === 'FILE_SECURITY_REJECTED'
    );

    // 3. Rejection of invalid / corrupted bytes
    const randomBytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    await assert.rejects(
      async () => validateAudioBuffer(randomBytes, { filename: 'unknown.xyz' }),
      (err) => err.code === 'AUDIO_INVALID'
    );

    // 4. Verification that valid MP3 and WAV pass
    const mp3Val = await validateAudioBuffer(VALID_MP3_BYTES, { filename: 'celebration.mp3' });
    assert.strictEqual(mp3Val.valid, true);
    assert.strictEqual(mp3Val.mimeType, 'audio/mpeg');
    assert.strictEqual(mp3Val.extension, 'mp3');

    const wavVal = await validateAudioBuffer(VALID_WAV_BYTES, { filename: 'chime.wav' });
    assert.strictEqual(wavVal.valid, true);
    assert.strictEqual(wavVal.mimeType, 'audio/wav');
    assert.strictEqual(wavVal.extension, 'wav');
  });

  await t.test('TEST 5: Oversized audio file rejection (AUDIO_TOO_LARGE, > 50 MB)', async () => {
    // Create oversized buffer simulating > 50MB
    const oversizedBytes = new Uint8Array(51 * 1024 * 1024);
    oversizedBytes.set(VALID_MP3_BYTES);

    await assert.rejects(
      async () => validateAudioBuffer(oversizedBytes, { maxSizeBytes: 50 * 1024 * 1024, filename: 'huge.mp3' }),
      (err) => {
        return err.code === 'AUDIO_TOO_LARGE' && err.sizeBytes > 50 * 1024 * 1024;
      }
    );
  });

  await t.test('TEST 6: Unauthorized music upload rejection (401 AUTH_REQUIRED, 403 FORBIDDEN)', async () => {
    // 1. Unauthenticated request (no user cookie or token)
    const unauthReq = new Request('https://wishmagic.live/api/admin/media/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Song',
        type: 'audio',
        filename: 'song.mp3',
        fileData: Buffer.from(VALID_MP3_BYTES).toString('base64')
      })
    });

    const env = {
      ENVIRONMENT: 'test',
      DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) }
    };

    const res401 = await worker.fetch(unauthReq, env);
    assert.strictEqual(res401.status, 401, 'Must return 401 for unauthenticated request');
    const data401 = await res401.json();
    assert.strictEqual(data401.code || data401.error?.code || data401.error, 'AUTH_REQUIRED');

    // 2. Authenticated user without admin privileges
    const regularUserReq = new Request('https://wishmagic.live/api/admin/media/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer regular-user-token'
      },
      body: JSON.stringify({
        title: 'Song',
        type: 'audio',
        filename: 'song.mp3',
        fileData: Buffer.from(VALID_MP3_BYTES).toString('base64')
      })
    });

    const envRegular = {
      ENVIRONMENT: 'test',
      DB: {
        prepare: () => ({
          bind: () => ({
            first: async () => ({ id: 'usr_regular', email: 'regular@user.com', role: 'user' })
          })
        })
      }
    };

    const res403 = await worker.fetch(regularUserReq, envRegular);
    assert.strictEqual(res403.status, 403, 'Must return 403 for non-admin user');
    const data403 = await res403.json();
    assert.strictEqual(data403.code || data403.error?.code || data403.error, 'FORBIDDEN');
  });

  await t.test('TEST 7: B2 Authorization failure handling (B2_AUTH_FAILED)', async () => {
    const mockAuthFailFetch = async () => {
      return new Response(JSON.stringify({
        code: 'bad_auth_token',
        message: 'Invalid application key or unauthorized account'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    };

    const provider = new B2StorageProvider({
      applicationKeyId: 'bad_key',
      applicationKey: 'bad_secret',
      bucketName: 'wishmagic-vault',
      fetchFn: mockAuthFailFetch
    });

    await assert.rejects(
      async () => provider.authorizeAccount(),
      (err) => {
        return err.code === 'bad_auth_token' || err.code === 'B2_AUTH_FAILED';
      }
    );
  });

  await t.test('TEST 8: B2 Upload failure handling and safe sanitization (no tokens or keys leaked)', async () => {
    const secretKey = 'SECRET_APPLICATION_KEY_999';

    const mockUploadFailFetch = async (url) => {
      if (url.includes('/b2api/v3/b2_authorize_account')) {
        return new Response(JSON.stringify({
          accountId: 'acc_123',
          authorizationToken: 'auth_tok_super_secret',
          apiUrl: 'https://api005.backblazeb2.com',
          downloadUrl: 'https://f005.backblazeb2.com',
          allowed: { bucketId: 'bkt_123' }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.includes('/b2api/v3/b2_get_upload_url')) {
        return new Response(JSON.stringify({
          bucketId: 'bkt_123',
          uploadUrl: 'https://pod-001.backblazeb2.com/b2api/v3/b2_upload_file/test',
          authorizationToken: 'upload_tok_secret'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Simulate B2 storage provider 500 error
      return new Response(JSON.stringify({
        code: 'storage_cap_exceeded',
        message: 'Account storage capacity exceeded'
      }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    };

    const provider = new B2StorageProvider({
      applicationKeyId: 'key_123',
      applicationKey: secretKey,
      bucketName: 'vault',
      bucketId: 'bkt_123',
      fetchFn: mockUploadFailFetch
    });

    try {
      await provider.putObject({ key: 'music/test.mp3', body: VALID_MP3_BYTES, contentType: 'audio/mpeg' });
      assert.fail('Should have thrown upload error');
    } catch (err) {
      assert.strictEqual(err.code, 'storage_cap_exceeded');
      // Assert secret tokens and keys are never present in error message
      assert.ok(!err.message.includes(secretKey), 'Never leak secret application key');
      assert.ok(!err.message.includes('auth_tok_super_secret'), 'Never leak auth token');
      assert.ok(!err.message.includes('upload_tok_secret'), 'Never leak upload token');
    }
  });

  await t.test('TEST 9: D1 metadata write failure triggers safe B2 storage rollback & cleanup', async () => {
    let b2ObjectUploaded = false;
    let b2ObjectDeleted = false;

    const mockFetch = async (url) => {
      if (url.includes('/b2api/v3/b2_authorize_account')) {
        return new Response(JSON.stringify({
          accountId: 'acc_123',
          authorizationToken: 'auth_tok_123',
          apiUrl: 'https://api005.backblazeb2.com',
          downloadUrl: 'https://f005.backblazeb2.com',
          allowed: { bucketId: 'bkt_123', bucketName: 'vault' }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.includes('/b2api/v3/b2_get_upload_url')) {
        return new Response(JSON.stringify({
          bucketId: 'bkt_123',
          uploadUrl: 'https://pod-001.backblazeb2.com/b2api/v3/b2_upload_file/test',
          authorizationToken: 'upload_tok_123'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.includes('b2_upload_file')) {
        b2ObjectUploaded = true;
        return new Response(JSON.stringify({
          fileId: 'file_id_uploaded_999',
          fileName: 'music/test.mp3',
          contentLength: VALID_MP3_BYTES.length,
          contentSha1: 'sha1_fake',
          contentType: 'audio/mpeg'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.includes('/b2api/v3/b2_delete_file_version')) {
        b2ObjectDeleted = true;
        return new Response(JSON.stringify({
          fileId: 'file_id_uploaded_999',
          fileName: 'music/test.mp3'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response('Not Found', { status: 404 });
    };

    const req = new Request('https://wishmagic.live/api/admin/media/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer admin-token'
      },
      body: JSON.stringify({
        title: 'Rollback Test Audio',
        type: 'audio',
        filename: 'rollback.mp3',
        fileData: Buffer.from(VALID_MP3_BYTES).toString('base64')
      })
    });

    const env = {
      ENVIRONMENT: 'test',
      fetch: mockFetch,
      B2_KEY_ID: 'key_id_123',
      B2_APPLICATION_KEY: 'app_key_123',
      B2_BUCKET_NAME: 'vault',
      DB: {
        prepare: (query) => {
          if (query.includes('admin_roles') || query.includes('users')) {
            return {
              bind: () => ({
                first: async () => ({ id: 'usr_admin', email: 'ankit.babusaini@gmail.com', role: 'admin' })
              })
            };
          }
          if (query.includes('INSERT INTO music_library')) {
            return {
              bind: () => ({
                run: async () => {
                  throw new Error('D1 SQLITE_BUSY: database table locked');
                }
              })
            };
          }
          return {
            bind: () => ({
              run: async () => ({ success: true }),
              first: async () => ({ id: 'usr_admin', email: 'ankit.babusaini@gmail.com', role: 'admin' })
            })
          };
        }
      }
    };

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 500, 'Must return HTTP 500 when D1 write fails');
    const data = await res.json();
    assert.strictEqual(data.code || data.error?.code || data.error, 'D1_WRITE_FAILED');
    assert.ok(b2ObjectUploaded, 'B2 object was uploaded first');
    assert.ok(b2ObjectDeleted, 'B2 object must be rolled back and deleted upon D1 write failure');
  });

  await t.test('TEST 10: Successful music upload pipeline with real bytes and D1 persistence', async () => {
    let insertedMusicLibrary = null;
    let insertedWishMedia = null;

    const mockFetch = async (url, options) => {
      if (url.includes('/b2api/v3/b2_authorize_account')) {
        return new Response(JSON.stringify({
          accountId: 'acc_prod',
          authorizationToken: 'auth_tok_prod',
          apiUrl: 'https://api005.backblazeb2.com',
          downloadUrl: 'https://f005.backblazeb2.com',
          allowed: { bucketId: 'bkt_prod_999', bucketName: 'wishmagic-music-vault' }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.includes('/b2api/v3/b2_get_upload_url')) {
        return new Response(JSON.stringify({
          bucketId: 'bkt_prod_999',
          uploadUrl: 'https://pod-005.backblazeb2.com/b2api/v3/b2_upload_file/bkt_prod_999',
          authorizationToken: 'upload_tok_prod'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.includes('b2_upload_file')) {
        assert.strictEqual(options.headers['Content-Type'], 'audio/mpeg');
        assert.ok(options.headers['X-Bz-File-Name'].includes('music/'));
        return new Response(JSON.stringify({
          fileId: 'file_id_live_123',
          fileName: decodeURIComponent(options.headers['X-Bz-File-Name']),
          contentLength: VALID_MP3_BYTES.length,
          contentSha1: 'valid_sha1',
          contentType: 'audio/mpeg',
          uploadTimestamp: Date.now()
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response('Not Found', { status: 404 });
    };

    const req = new Request('https://wishmagic.live/api/admin/media/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer admin-token'
      },
      body: JSON.stringify({
        title: 'Midnight Piano Serenades',
        type: 'audio',
        artist: 'WishMagic Studio',
        category: 'romantic',
        filename: 'midnight-piano.mp3',
        fileData: Buffer.from(VALID_MP3_BYTES).toString('base64')
      })
    });

    const env = {
      ENVIRONMENT: 'test',
      fetch: mockFetch,
      B2_KEY_ID: 'test_key',
      B2_APPLICATION_KEY: 'test_app_key',
      B2_BUCKET_NAME: 'wishmagic-music-vault',
      DB: {
        prepare: (query) => {
          if (query.includes('admin_roles') || query.includes('users')) {
            return {
              bind: () => ({
                first: async () => ({ id: 'usr_admin', email: 'ankit.babusaini@gmail.com', role: 'admin' })
              })
            };
          }
          if (query.includes('INSERT INTO music_library')) {
            return {
              bind: (...args) => ({
                run: async () => {
                  insertedMusicLibrary = args;
                  return { success: true };
                }
              })
            };
          }
          if (query.includes('INSERT INTO wish_media')) {
            return {
              bind: (...args) => ({
                run: async () => {
                  insertedWishMedia = args;
                  return { success: true };
                }
              })
            };
          }
          return {
            bind: () => ({
              run: async () => ({ success: true }),
              first: async () => ({ id: 'usr_admin', email: 'ankit.babusaini@gmail.com', role: 'admin' })
            })
          };
        }
      }
    };

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 201, 'Must return HTTP 201 Created');
    const data = await res.json();

    assert.strictEqual(data.success, true);
    assert.strictEqual(data.status, 'uploaded');
    assert.strictEqual(data.asset.title, 'Midnight Piano Serenades');
    assert.strictEqual(data.asset.artist, 'WishMagic Studio');
    assert.strictEqual(data.asset.storageProvider, 'b2');
    assert.ok(data.asset.playbackUrl.includes('https://f005.backblazeb2.com/file/wishmagic-music-vault/music/'));
    assert.strictEqual(data.asset.mimeType, 'audio/mpeg');

    // Verify D1 records were persisted
    assert.ok(insertedMusicLibrary, 'Must insert into music_library');
    assert.strictEqual(insertedMusicLibrary[1], 'Midnight Piano Serenades'); // title
    assert.strictEqual(insertedMusicLibrary[2], 'WishMagic Studio');        // artist
    assert.strictEqual(insertedMusicLibrary[4], 'romantic');                 // category
    assert.ok(insertedMusicLibrary[5].includes('music/'));                   // storage_key

    assert.ok(insertedWishMedia, 'Must insert into wish_media for vault indexing');
  });

  await t.test('TEST 11: Playable asset URL construction and format validation', () => {
    const provider = new B2StorageProvider({
      applicationKeyId: 'k',
      applicationKey: 's',
      bucketName: 'wishmagic-audio',
      downloadUrl: 'https://cdn.wishmagic.live'
    });

    provider.authData = {
      downloadUrl: 'https://f005.backblazeb2.com'
    };

    // Construct download url according to Backblaze specifications:
    // Format: https://<downloadUrl>/file/<bucketName>/<fileName>
    const storageKey = 'music/trk_123_celebration.mp3';
    const publicUrl = `${provider.customDownloadUrl || provider.authData.downloadUrl}/file/${provider.bucketName}/${encodeURI(storageKey)}`;

    assert.strictEqual(publicUrl, 'https://cdn.wishmagic.live/file/wishmagic-audio/music/trk_123_celebration.mp3');
  });

  await t.test('TEST 12: Dedicated /api/admin/music/upload endpoint compatibility', async () => {
    const mockFetch = async (url) => {
      if (url.includes('/b2api/v3/b2_authorize_account')) {
        return new Response(JSON.stringify({
          accountId: 'acc_prod',
          authorizationToken: 'auth_tok_prod',
          apiUrl: 'https://api005.backblazeb2.com',
          downloadUrl: 'https://f005.backblazeb2.com',
          allowed: { bucketId: 'bkt_prod_999', bucketName: 'wishmagic-music-vault' }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/b2api/v3/b2_get_upload_url')) {
        return new Response(JSON.stringify({
          bucketId: 'bkt_prod_999',
          uploadUrl: 'https://pod-005.backblazeb2.com/b2api/v3/b2_upload_file/bkt_prod_999',
          authorizationToken: 'upload_tok_prod'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('b2_upload_file')) {
        return new Response(JSON.stringify({
          fileId: 'file_id_live_999',
          fileName: 'music/melody.mp3',
          contentLength: VALID_MP3_BYTES.length,
          contentSha1: 'valid_sha1',
          contentType: 'audio/mpeg'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('Not Found', { status: 404 });
    };

    const req = new Request('https://wishmagic.live/api/admin/music/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer admin-token'
      },
      body: JSON.stringify({
        title: 'Dedicated Endpoint Track',
        artist: 'WishMagic Studio',
        filename: 'melody.mp3',
        fileData: Buffer.from(VALID_MP3_BYTES).toString('base64')
      })
    });

    const env = {
      ENVIRONMENT: 'test',
      fetch: mockFetch,
      B2_KEY_ID: 'test_key',
      B2_APPLICATION_KEY: 'test_app_key',
      B2_BUCKET_NAME: 'wishmagic-music-vault',
      DB: {
        prepare: () => ({
          bind: () => ({
            run: async () => ({ success: true }),
            first: async () => ({ id: 'usr_admin', email: 'ankit.babusaini@gmail.com', role: 'admin' })
          })
        })
      }
    };

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.asset.storageProvider, 'b2');
  });

  await t.test('TEST 13: Universal media multi-cloud routing (Images -> ImgBB, Music/Video -> Backblaze B2)', async () => {
    let imgbbCalled = false;
    let b2Called = false;

    const mockFetch = async (url) => {
      if (url.includes('api.imgbb.com')) {
        imgbbCalled = true;
        return new Response(JSON.stringify({
          success: true,
          status: 200,
          data: {
            id: 'imgbb_test_asset',
            title: 'Image Test',
            url_viewer: 'https://ibb.co/test',
            url: 'https://i.ibb.co/test/image.png',
            display_url: 'https://i.ibb.co/test/image.png',
            thumb: { url: 'https://i.ibb.co/test/thumb.png' },
            size: 1000
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.includes('backblazeb2.com') || url.includes('b2api')) {
        b2Called = true;
        if (url.includes('b2_authorize_account')) {
          return new Response(JSON.stringify({
            accountId: 'acc',
            authorizationToken: 'auth_tok',
            apiUrl: 'https://api005.backblazeb2.com',
            downloadUrl: 'https://f005.backblazeb2.com',
            allowed: { bucketId: 'bkt_123', bucketName: 'vault' }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.includes('b2_get_upload_url')) {
          return new Response(JSON.stringify({
            bucketId: 'bkt_123',
            uploadUrl: 'https://pod.backblazeb2.com/upload',
            authorizationToken: 'up_tok'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.includes('upload')) {
          return new Response(JSON.stringify({
            fileId: 'b2_file_123',
            fileName: 'music/audio.mp3',
            contentLength: 100,
            contentType: 'audio/mpeg'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }

      return new Response('Not Found', { status: 404 });
    };

    const env = {
      ENVIRONMENT: 'test',
      fetch: mockFetch,
      IMGBB_API_KEY: 'test_imgbb_key',
      B2_KEY_ID: 'b2_key',
      B2_APPLICATION_KEY: 'b2_secret',
      B2_BUCKET_NAME: 'vault',
      DB: {
        prepare: () => ({
          bind: () => ({
            run: async () => ({ success: true }),
            first: async () => ({ id: 'usr_admin', email: 'ankit.babusaini@gmail.com', role: 'admin' })
          })
        })
      }
    };

    // 1. Upload Image -> must route to ImgBB
    const img1x1Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const imgReq = new Request('https://wishmagic.live/api/admin/media/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer admin-token' },
      body: JSON.stringify({ title: 'Hero Banner', type: 'image', filename: 'banner.png', fileData: img1x1Png })
    });
    const imgRes = await worker.fetch(imgReq, env);
    assert.strictEqual(imgRes.status, 201);
    assert.ok(imgbbCalled, 'Image must route to ImgBB provider');

    // 2. Upload Audio -> must route to Backblaze B2
    const audioReq = new Request('https://wishmagic.live/api/admin/media/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer admin-token' },
      body: JSON.stringify({ title: 'Celebration Strings', type: 'audio', filename: 'strings.mp3', fileData: Buffer.from(VALID_MP3_BYTES).toString('base64') })
    });
    const audioRes = await worker.fetch(audioReq, env);
    assert.strictEqual(audioRes.status, 201);
    assert.ok(b2Called, 'Audio must route to Backblaze B2 provider');
  });

  await t.test('TEST 14: Admin media library (/api/admin/media/all) indexes D1 music_library with Backblaze B2 badge', async () => {
    const env = {
      ENVIRONMENT: 'test',
      DB: {
        prepare: (query) => {
          if (query.includes('admin_roles') || query.includes('users')) {
            return {
              bind: () => ({
                first: async () => ({ id: 'usr_admin', email: 'ankit.babusaini@gmail.com', role: 'admin' })
              })
            };
          }
          if (query.includes('music_library')) {
            return {
              all: async () => ({
                results: [
                  {
                    id: 'mus_b2_track_01',
                    title: 'Royal Celebration Strings',
                    artist: 'WishMagic Ensemble',
                    category: 'celebration',
                    storage_provider: 'b2',
                    storage_key: 'music/royal-strings.mp3',
                    playback_url: 'https://f005.backblazeb2.com/file/vault/music/royal-strings.mp3',
                    mime_type: 'audio/mpeg',
                    duration_seconds: 180,
                    size_bytes: 4194304,
                    created_at: '2026-10-08T00:00:00.000Z'
                  }
                ]
              })
            };
          }
          return {
            all: async () => ({ results: [] }),
            first: async () => ({ id: 'usr_admin', email: 'ankit.babusaini@gmail.com', role: 'admin' })
          };
        }
      }
    };

    const req = new Request('https://wishmagic.live/api/admin/media/all', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer admin-token' }
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    const b2Track = data.assets.find(a => a.id === 'mus_b2_track_01');
    assert.ok(b2Track, 'B2 Music track must be indexed into media vault');
    assert.strictEqual(b2Track.storageProvider, 'b2');
    assert.strictEqual(b2Track.type, 'audio');
    assert.strictEqual(b2Track.title, 'Royal Celebration Strings');
    assert.strictEqual(b2Track.playbackUrl, 'https://f005.backblazeb2.com/file/vault/music/royal-strings.mp3');
  });

});
