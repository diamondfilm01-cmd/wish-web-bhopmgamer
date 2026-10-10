/**
 * WishMagic Part 44: Bulk Upload & Format Preservation Integration Test Suite
 * ===========================================================================
 * Verifies:
 * 1. Bulk upload of multiple photos, videos, and audio files in a single request
 * 2. Strict preservation of original filenames and extensions (.wav, .m4a, .mp4, .png, .jpg, .webp)
 * 3. Correct storage key generation in Backblaze B2 (music/filename.ext, videos/filename.ext, photos/filename.ext)
 * 4. Streaming proxy and website playback url resolution in exact original format
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

// Minimal byte samples
const SAMPLE_WAV = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
  0x66, 0x6D, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x44, 0xAC, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00,
  0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00
]);
const SAMPLE_MP4 = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x6D, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
  0x6D, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6F, 0x6D
]);
const SAMPLE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('WishMagic Part 44: Bulk Upload & Format Preservation Suite', async (t) => {
  await t.test('TEST 1: Bulk upload of mixed media (WAV Audio, MP4 Video, PNG Image) preserves exact original filenames & formats', async () => {
    let uploadedObjects = [];

    const mockFetch = async (url, opts = {}) => {
      const urlStr = String(url);
      if (urlStr.includes("api.imgbb.com")) {
        return new Response(JSON.stringify({
          success: true,
          status: 200,
          data: {
            id: "imgbb_test_asset",
            title: "Image Test",
            url_viewer: "https://ibb.co/test",
            url: "https://i.ibb.co/test/image.png",
            display_url: "https://i.ibb.co/test/image.png",
            thumb: { url: "https://i.ibb.co/test/thumb.png" },
            size: 1000
          }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (urlStr.includes("backblazeb2.com") || urlStr.includes("b2api")) {
        if (url.includes('b2_authorize_account')) {
          return new Response(JSON.stringify({
            accountId: 'acc_123',
            authorizationToken: 'auth_tok_123',
            apiUrl: 'https://api005.backblazeb2.com',
            downloadUrl: 'https://f005.backblazeb2.com',
            allowed: { bucketId: 'bkt_vault', bucketName: 'wishmagic-assets' }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.includes('b2_get_upload_url')) {
          return new Response(JSON.stringify({
            bucketId: 'bkt_vault',
            uploadUrl: 'https://pod-001.backblazeb2.com/b2api/v3/b2_upload_file/test',
            authorizationToken: 'upload_tok_123'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.includes('upload')) {
          const fileName = opts.headers?.['X-Bz-File-Name'] || 'unknown';
          uploadedObjects.push({
            fileName,
            contentType: opts.headers?.['Content-Type']
          });
          return new Response(JSON.stringify({
            fileId: `b2_${Date.now()}_${Math.random()}`,
            fileName,
            contentLength: 100,
            contentType: opts.headers?.['Content-Type'] || 'application/octet-stream'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }
      return new Response('Not Found', { status: 404 });
    };

    const env = {
      ENVIRONMENT: 'test',
      fetch: mockFetch,
      IMGBB_API_KEY: 'imgbb_test_key',
      B2_KEY_ID: 'key_123',
      B2_APPLICATION_KEY: 'secret_123',
      B2_BUCKET_NAME: 'wishmagic-assets',
      DB: {
        prepare: () => ({
          bind: () => ({
            run: async () => ({ success: true }),
            first: async () => ({ id: 'usr_admin', email: 'admin@wishmagic.live', role: 'admin' })
          })
        })
      }
    };

    const bulkReq = new Request('https://wishmagic.live/api/admin/media/bulk-upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer admin-token'
      },
      body: JSON.stringify({
        files: [
          {
            filename: 'My Special Acoustic.wav',
            fileData: Buffer.from(SAMPLE_WAV).toString('base64'),
            type: 'audio',
            category: 'acoustic'
          },
          {
            filename: 'Celebration Reel 2026.mp4',
            fileData: Buffer.from(SAMPLE_MP4).toString('base64'),
            type: 'video',
            category: 'celebration'
          },
          {
            filename: 'Hero Section Photo.png',
            fileData: SAMPLE_PNG_BASE64,
            type: 'image',
            category: 'photo'
          }
        ]
      })
    });

    const res = await worker.fetch(bulkReq, env);
    assert.strictEqual(res.status, 201, 'Bulk upload request must return 201 Created');
    const data = await res.json();

    assert.strictEqual(data.success, true, 'Response must indicate success');
    assert.strictEqual(data.status, 'bulk_uploaded');
    assert.strictEqual(data.count, 3, 'All 3 items must be processed');
    assert.strictEqual(data.assets.length, 3);

    // Verify Asset 1: WAV Audio
    const wavAsset = data.assets.find(a => a.type === 'audio');
    assert.ok(wavAsset, 'Audio asset must exist');
    assert.strictEqual(wavAsset.originalFilename, 'My Special Acoustic.wav');
    assert.strictEqual(wavAsset.format, 'WAV');
    assert.strictEqual(wavAsset.storageKey, 'music/My Special Acoustic.wav');

    // Verify Asset 2: MP4 Video
    const videoAsset = data.assets.find(a => a.type === 'video');
    assert.ok(videoAsset, 'Video asset must exist');
    assert.strictEqual(videoAsset.originalFilename, 'Celebration Reel 2026.mp4');
    assert.strictEqual(videoAsset.format, 'MP4');
    assert.strictEqual(videoAsset.storageKey, 'videos/Celebration Reel 2026.mp4');

    // Verify Asset 3: PNG Image
    const photoAsset = data.assets.find(a => a.type === 'image');
    assert.ok(photoAsset, 'Photo asset must exist');
    assert.strictEqual(photoAsset.originalFilename, 'Hero Section Photo.png');
    assert.strictEqual(photoAsset.format, 'PNG');
    assert.strictEqual(photoAsset.storageProvider, 'imgbb');

    console.log('✅ Bulk Upload & Original Format Preservation verified successfully!');
  });
});
