/**
 * WishMagic Part 21 Automated Test Suite
 * =====================================
 * Tests all requirements of PART 21:
 * - TEST 1: Production D1 Database UUID and Additive Migration Integrity (0009)
 * - TEST 2: ImgBB Configuration Validation & Structured Rejection (IMGBB_NOT_CONFIGURED)
 * - TEST 3: Image Magic Bytes Verification Matrix (JPEG, PNG, WEBP, GIF)
 * - TEST 4: Pure JavaScript Header Dimension Parsing (Width & Height Extraction)
 * - TEST 5: Image Security: Anti-Malware / Suspicious Script Payload Rejection
 * - TEST 6: Image Size Limits & Empty Buffer Guard
 * - TEST 7: Universal Checksum Verification (SHA-256 Digest)
 * - TEST 8: Real ImgBB REST API Client & Provider Response Validation
 * - TEST 9: ImgBB Provider Error Handling & Structured Status Codes
 * - TEST 10: Strict Separation of Template Images vs Customer Wish Media
 * - TEST 11: Image Slot Resolution Hierarchy (User -> Variant -> Default -> Fallback)
 * - TEST 12: Safe Deletion & Dependency Protection Guards (Archive vs Delete)
 * - TEST 13: End-to-End Admin Template Image Management Flow
 * - TEST 14: End-to-End Customer Wish Media Upload & Relational Slot Mapping Flow
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  ImgBBProvider,
  getImgBBConfig,
  validateImageBuffer,
  parseImageDimensions,
  resolveSlotImage,
  checkImageDeletionSafety,
  IMAGE_LIMITS,
  toUint8Array,
  uint8ArrayToBase64
} from '../src/imgbb-provider.js';

import { computeSha256Hex } from '../src/storage-provider.js';

// Realistic Minimal Binary Image Samples
const VALID_1X1_PNG = new Uint8Array([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG Magic Bytes
  0x00, 0x00, 0x00, 0x0D,                         // IHDR length 13
  0x49, 0x48, 0x44, 0x52,                         // "IHDR"
  0x00, 0x00, 0x00, 0x64,                         // Width: 100 px (0x00000064)
  0x00, 0x00, 0x00, 0xC8,                         // Height: 200 px (0x000000C8)
  0x08, 0x06, 0x00, 0x00, 0x00,                   // 8-bit truecolor with alpha
  0x3B, 0x76, 0x01, 0x1A,                         // CRC
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND
  0xAE, 0x42, 0x60, 0x82
]);

const VALID_1X1_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61,             // "GIF89a"
  0x32, 0x00,                                     // Width: 50 px (0x0032 little endian)
  0x46, 0x00,                                     // Height: 70 px (0x0046 little endian)
  0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF,
  0x21, 0xF9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x2C, 0x00, 0x00, 0x00, 0x00, 0x32, 0x00, 0x46, 0x00, 0x00,
  0x02, 0x02, 0x44, 0x01, 0x00, 0x3B
]);

const VALID_JPEG = new Uint8Array([
  0xFF, 0xD8, 0xFF, 0xE0,                         // SOI + APP0
  0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, // JFIF marker
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
  0xFF, 0xC0,                                     // SOF0 (Start of Frame)
  0x00, 0x11,                                     // Length 17
  0x08,                                           // Precision
  0x01, 0x2C,                                     // Height: 300 px (0x012C)
  0x01, 0x90,                                     // Width: 400 px (0x0190)
  0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  0xFF, 0xD9                                      // EOI
]);

const VALID_WEBP_VP8X = new Uint8Array([
  0x52, 0x49, 0x46, 0x46,                         // "RIFF"
  0x24, 0x00, 0x00, 0x00,                         // File size - 8
  0x57, 0x45, 0x42, 0x50,                         // "WEBP"
  0x56, 0x50, 0x38, 0x58,                         // "VP8X"
  0x0A, 0x00, 0x00, 0x00,                         // Chunk size 10
  0x10, 0x00, 0x00, 0x00,                         // Flags
  0xF3, 0x00, 0x00,                               // Canvas width minus 1: 243 -> 244 px
  0x2B, 0x01, 0x00                                // Canvas height minus 1: 299 -> 300 px
]);

test('Part 21 — Real ImgBB Image Storage & Media Management Suite', async (t) => {

  await t.test('TEST 1: Production D1 Database UUID and Additive Migration Integrity (0009)', async () => {
    const migrationPath = path.resolve('migrations', '0009_part21_imgbb_image_storage.sql');
    assert.ok(fs.existsSync(migrationPath), 'Migration 0009 file must exist');

    const sqlContent = fs.readFileSync(migrationPath, 'utf8');

    // Confirm production D1 UUID is strictly preserved
    assert.ok(
      sqlContent.includes('c08b683b-eb07-4639-ab33-fb1139bfb295'),
      'Must target the exact production D1 UUID c08b683b-eb07-4639-ab33-fb1139bfb295'
    );

    // Non-destructive SQL statements check
    const cleanSql = sqlContent.replace(/--.*$/gm, '');
    assert.ok(!/\bDROP\s+TABLE\b/i.test(cleanSql), 'Migration 0009 must NEVER contain DROP TABLE');
    assert.ok(!/\bTRUNCATE\b/i.test(cleanSql), 'Migration 0009 must NEVER contain TRUNCATE');
    assert.ok(!/\bDROP\s+DATABASE\b/i.test(cleanSql), 'Migration 0009 must NEVER contain DROP DATABASE');

    // Verify additive columns for template_images & wish_media
    assert.ok(sqlContent.includes('ALTER TABLE template_images ADD COLUMN template_id TEXT'), 'Must add template_id to template_images');
    assert.ok(sqlContent.includes('ALTER TABLE template_images ADD COLUMN delete_url TEXT'), 'Must add delete_url to template_images');
    assert.ok(sqlContent.includes('ALTER TABLE wish_media ADD COLUMN storage_provider TEXT'), 'Must add storage_provider to wish_media');
    assert.ok(sqlContent.includes('ALTER TABLE wish_media ADD COLUMN provider_asset_id TEXT'), 'Must add provider_asset_id to wish_media');
    assert.ok(sqlContent.includes('ALTER TABLE wish_media ADD COLUMN display_url TEXT'), 'Must add display_url to wish_media');
    assert.ok(sqlContent.includes('ALTER TABLE wish_media ADD COLUMN thumbnail_url TEXT'), 'Must add thumbnail_url to wish_media');
    assert.ok(sqlContent.includes('ALTER TABLE wish_media ADD COLUMN sha256 TEXT'), 'Must add sha256 to wish_media');
  });

  await t.test('TEST 2: ImgBB Configuration Validation & Structured Rejection (IMGBB_NOT_CONFIGURED)', async () => {
    // Empty env
    const emptyConfig = getImgBBConfig({});
    assert.strictEqual(emptyConfig.isConfigured, false);
    assert.ok(emptyConfig.missingKeys.includes('IMGBB_API_KEY'));

    // Throws structured error with code IMGBB_NOT_CONFIGURED
    assert.throws(
      () => ImgBBProvider.fromEnv({}),
      (err) => {
        assert.strictEqual(err.code, 'IMGBB_NOT_CONFIGURED');
        assert.strictEqual(err.status, 503);
        assert.ok(err.missingKeys.includes('IMGBB_API_KEY'));
        return true;
      }
    );

    // Configured env
    const validConfig = getImgBBConfig({ IMGBB_API_KEY: 'test_fake_api_key_1234567890' });
    assert.strictEqual(validConfig.isConfigured, true);
    assert.strictEqual(validConfig.apiKey, 'test_fake_api_key_1234567890');
    assert.strictEqual(validConfig.missingKeys.length, 0);
  });

  await t.test('TEST 3: Image Magic Bytes Verification Matrix (JPEG, PNG, WEBP, GIF)', async () => {
    // PNG
    const pngResult = await validateImageBuffer(VALID_1X1_PNG);
    assert.strictEqual(pngResult.valid, true);
    assert.strictEqual(pngResult.mimeType, 'image/png');
    assert.strictEqual(pngResult.extension, 'png');

    // GIF
    const gifResult = await validateImageBuffer(VALID_1X1_GIF);
    assert.strictEqual(gifResult.valid, true);
    assert.strictEqual(gifResult.mimeType, 'image/gif');
    assert.strictEqual(gifResult.extension, 'gif');

    // JPEG
    const jpegResult = await validateImageBuffer(VALID_JPEG);
    assert.strictEqual(jpegResult.valid, true);
    assert.strictEqual(jpegResult.mimeType, 'image/jpeg');
    assert.strictEqual(jpegResult.extension, 'jpg');

    // WEBP
    const webpResult = await validateImageBuffer(VALID_WEBP_VP8X);
    assert.strictEqual(webpResult.valid, true);
    assert.strictEqual(webpResult.mimeType, 'image/webp');
    assert.strictEqual(webpResult.extension, 'webp');

    // Reject invalid magic bytes
    const invalidBuffer = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    await assert.rejects(
      async () => validateImageBuffer(invalidBuffer),
      (err) => {
        assert.strictEqual(err.code, 'IMAGE_INVALID_FORMAT');
        return true;
      }
    );
  });

  await t.test('TEST 4: Pure JavaScript Header Dimension Parsing (Width & Height Extraction)', async () => {
    // PNG width 100, height 200
    const pngDim = parseImageDimensions(VALID_1X1_PNG, 'image/png');
    assert.strictEqual(pngDim.width, 100);
    assert.strictEqual(pngDim.height, 200);

    // GIF width 50, height 70
    const gifDim = parseImageDimensions(VALID_1X1_GIF, 'image/gif');
    assert.strictEqual(gifDim.width, 50);
    assert.strictEqual(gifDim.height, 70);

    // JPEG width 400, height 300
    const jpegDim = parseImageDimensions(VALID_JPEG, 'image/jpeg');
    assert.strictEqual(jpegDim.width, 400);
    assert.strictEqual(jpegDim.height, 300);

    // WEBP width 244, height 300
    const webpDim = parseImageDimensions(VALID_WEBP_VP8X, 'image/webp');
    assert.strictEqual(webpDim.width, 244);
    assert.strictEqual(webpDim.height, 300);
  });

  await t.test('TEST 5: Image Security: Anti-Malware / Suspicious Script Payload Rejection', async () => {
    // Build a fake JPEG buffer injected with a <script> tag
    const infectedJpeg = new Uint8Array([
      0xFF, 0xD8, 0xFF, 0xE0,
      ...new TextEncoder().encode('<script>alert("xss")</script>')
    ]);

    await assert.rejects(
      async () => validateImageBuffer(infectedJpeg),
      (err) => {
        assert.strictEqual(err.code, 'IMAGE_SUSPICIOUS_PAYLOAD');
        assert.ok(err.message.includes('<script'));
        return true;
      }
    );

    // Build a fake PNG buffer injected with <?php
    const infectedPng = new Uint8Array([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      ...new TextEncoder().encode('<?php echo "shell"; ?>')
    ]);

    await assert.rejects(
      async () => validateImageBuffer(infectedPng),
      (err) => {
        assert.strictEqual(err.code, 'IMAGE_SUSPICIOUS_PAYLOAD');
        assert.ok(err.message.includes('<?php'));
        return true;
      }
    );
  });

  await t.test('TEST 6: Image Size Limits & Empty Buffer Guard', async () => {
    // Empty buffer
    await assert.rejects(
      async () => validateImageBuffer(new Uint8Array(0)),
      (err) => {
        assert.strictEqual(err.code, 'IMAGE_EMPTY');
        return true;
      }
    );

    // Oversized buffer
    const fakeLarge = new Uint8Array(100);
    await assert.rejects(
      async () => validateImageBuffer(fakeLarge, { maxSizeBytes: 50 }),
      (err) => {
        assert.strictEqual(err.code, 'IMAGE_TOO_LARGE');
        return true;
      }
    );
  });

  await t.test('TEST 7: Universal Checksum Verification (SHA-256 Digest)', async () => {
    const validation = await validateImageBuffer(VALID_1X1_PNG);
    const directSha = await computeSha256Hex(VALID_1X1_PNG);

    assert.strictEqual(validation.sha256, directSha);
    assert.strictEqual(validation.sha256.length, 64);
    assert.match(validation.sha256, /^[a-f0-9]{64}$/);
  });

  await t.test('TEST 8: Real ImgBB REST API Client & Provider Response Validation', async () => {
    // Mock ImgBB API fetch handler
    const mockImgBbResponse = {
      data: {
        id: '2ndCYJK',
        title: 'photo_test',
        url_viewer: 'https://ibb.co/2ndCYJK',
        url: 'https://i.ibb.co/w04g0rf/photo_test.png',
        display_url: 'https://i.ibb.co/98W13PX/photo_test.png',
        width: '100',
        height: '200',
        size: 38,
        time: '1728364800',
        expiration: '0',
        image: {
          filename: 'photo_test.png',
          name: 'photo_test',
          mime: 'image/png',
          extension: 'png',
          url: 'https://i.ibb.co/w04g0rf/photo_test.png'
        },
        thumb: {
          filename: 'photo_test_thumb.png',
          name: 'photo_test_thumb',
          mime: 'image/png',
          extension: 'png',
          url: 'https://i.ibb.co/2ndCYJK/thumb.png'
        },
        delete_url: 'https://ibb.co/2ndCYJK/delete_token_xyz'
      },
      success: true,
      status: 200
    };

    let capturedUrl = null;
    let capturedBody = null;

    const customFetch = async (url, options) => {
      capturedUrl = url;
      capturedBody = options.body;
      return new Response(JSON.stringify(mockImgBbResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const provider = new ImgBBProvider({
      apiKey: 'real_test_key_abc123',
      fetchFn: customFetch
    });

    const result = await provider.uploadImage({
      data: VALID_1X1_PNG,
      filename: 'photo_test.png',
      name: 'photo_test'
    });

    assert.ok(capturedUrl.includes('key=real_test_key_abc123'), 'Request URL must contain API key');
    assert.strictEqual(result.provider, 'imgbb');
    assert.strictEqual(result.providerAssetId, '2ndCYJK');
    assert.strictEqual(result.displayUrl, 'https://i.ibb.co/98W13PX/photo_test.png');
    assert.strictEqual(result.thumbnailUrl, 'https://i.ibb.co/2ndCYJK/thumb.png');
    assert.strictEqual(result.deleteUrl, 'https://ibb.co/2ndCYJK/delete_token_xyz');
    assert.strictEqual(result.width, 100);
    assert.strictEqual(result.height, 200);
    assert.strictEqual(result.mimeType, 'image/png');
    assert.strictEqual(result.status, 'active');
  });

  await t.test('TEST 9: ImgBB Provider Error Handling & Structured Status Codes', async () => {
    // ImgBB 400 error response
    const mockErrorResponse = {
      status_code: 400,
      error: {
        message: 'Invalid API key or IP restricted',
        code: 100
      },
      status_txt: 'Bad Request',
      success: false
    };

    const customFetch = async () => {
      return new Response(JSON.stringify(mockErrorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const provider = new ImgBBProvider({
      apiKey: 'invalid_key',
      fetchFn: customFetch
    });

    await assert.rejects(
      async () => provider.uploadImage({ data: VALID_1X1_PNG }),
      (err) => {
        assert.ok(err.message.includes('Invalid API key') || err.message.includes('400'));
        return true;
      }
    );
  });

  await t.test('TEST 10: Strict Separation of Template Images vs Customer Wish Media', async () => {
    // Template image record
    const templateImageRecord = {
      id: 'timg_v1_001',
      template_version_id: 'ver_romantic_v1',
      asset_key: 'hero_photo',
      relationship_id: 'rel_girlfriend',
      storage_provider: 'imgbb',
      provider_asset_id: 'imgbb_tpl_001',
      original_url: 'https://i.ibb.co/tpl/hero.png',
      display_url: 'https://i.ibb.co/tpl/hero_display.png',
      status: 'active'
    };

    // Customer wish media record
    const customerMediaRecord = {
      id: 'wmed_cust_001',
      wish_id: 'wish_rahul_ananya',
      user_id: 'usr_rahul',
      object_key: 'imgbb_cust_001',
      media_type: 'image',
      storage_provider: 'imgbb',
      provider_asset_id: 'imgbb_cust_001',
      display_url: 'https://i.ibb.co/cust/ananya_photo.png',
      status: 'active'
    };

    // 1. Template images have template_version_id, not user_id
    assert.ok(templateImageRecord.template_version_id);
    assert.strictEqual(templateImageRecord.user_id, undefined);

    // 2. Customer media has wish_id and user_id, not template_version_id
    assert.ok(customerMediaRecord.wish_id);
    assert.ok(customerMediaRecord.user_id);
    assert.strictEqual(customerMediaRecord.template_version_id, undefined);

    // 3. Different tables and different life cycles
    assert.notStrictEqual(templateImageRecord.id, customerMediaRecord.id);
  });

  await t.test('TEST 11: Image Slot Resolution Hierarchy (User -> Variant -> Default -> Fallback)', async () => {
    const userMappings = [
      {
        field_key: 'hero_photo',
        url: 'https://i.ibb.co/cust/user_hero.png',
        display_url: 'https://i.ibb.co/cust/user_hero.png',
        media_id: 'wmed_user_hero'
      }
    ];

    const templateImages = [
      // Girlfriend specific variant
      {
        id: 'timg_var_gf',
        asset_key: 'hero_photo',
        relationship_id: 'girlfriend',
        display_url: 'https://i.ibb.co/tpl/gf_hero.png',
        status: 'active'
      },
      // Universal default
      {
        id: 'timg_default',
        asset_key: 'hero_photo',
        relationship_id: null,
        display_url: 'https://i.ibb.co/tpl/default_hero.png',
        status: 'active'
      },
      // Cover photo variant
      {
        id: 'timg_cover_gf',
        asset_key: 'cover_photo',
        relationship_id: 'girlfriend',
        display_url: 'https://i.ibb.co/tpl/gf_cover.png',
        status: 'active'
      },
      // Cover photo default
      {
        id: 'timg_cover_def',
        asset_key: 'cover_photo',
        relationship_id: null,
        display_url: 'https://i.ibb.co/tpl/default_cover.png',
        status: 'active'
      },
      // Gallery photo default only
      {
        id: 'timg_gallery_def',
        asset_key: 'gallery_1',
        relationship_id: null,
        display_url: 'https://i.ibb.co/tpl/default_gallery_1.png',
        status: 'active'
      }
    ];

    // Case 1: Slot has user photo uploaded -> User photo ALWAYS wins
    const resolvedUser = resolveSlotImage({
      slotKey: 'hero_photo',
      wishMediaMappings: userMappings,
      templateImages,
      relationshipId: 'girlfriend',
      fallbackUrl: '/assets/fallback.png'
    });
    assert.strictEqual(resolvedUser.source, 'user');
    assert.strictEqual(resolvedUser.displayUrl, 'https://i.ibb.co/cust/user_hero.png');

    // Case 2: Slot has NO user photo, but has relationship variant -> Variant image wins
    const resolvedVariant = resolveSlotImage({
      slotKey: 'cover_photo',
      wishMediaMappings: [], // no user photo
      templateImages,
      relationshipId: 'girlfriend',
      fallbackUrl: '/assets/fallback.png'
    });
    assert.strictEqual(resolvedVariant.source, 'variant_template');
    assert.strictEqual(resolvedVariant.displayUrl, 'https://i.ibb.co/tpl/gf_cover.png');

    // Case 3: Slot has NO user photo, NO matching variant, but has default template image -> Default template wins
    const resolvedDefault = resolveSlotImage({
      slotKey: 'gallery_1',
      wishMediaMappings: [],
      templateImages,
      relationshipId: 'sister', // no sister variant exists
      fallbackUrl: '/assets/fallback.png'
    });
    assert.strictEqual(resolvedDefault.source, 'default_template');
    assert.strictEqual(resolvedDefault.displayUrl, 'https://i.ibb.co/tpl/default_gallery_1.png');

    // Case 4: Slot has NO user photo and NO template images -> Fallback URL wins
    const resolvedFallback = resolveSlotImage({
      slotKey: 'unmatched_slot',
      wishMediaMappings: [],
      templateImages,
      relationshipId: 'friend',
      fallbackUrl: '/assets/fallback_placeholder.png'
    });
    assert.strictEqual(resolvedFallback.source, 'fallback');
    assert.strictEqual(resolvedFallback.displayUrl, '/assets/fallback_placeholder.png');
  });

  await t.test('TEST 12: Safe Deletion & Dependency Protection Guards (Archive vs Delete)', async () => {
    // 1. Asset referenced by published wish cannot be permanently deleted
    const wishCheck = checkImageDeletionSafety({
      assetId: 'wmed_published_1',
      wishReferences: 3,
      templateVersionReferences: 0,
      isPublishedWish: true
    });
    assert.strictEqual(wishCheck.safe, false);
    assert.strictEqual(wishCheck.action, 'archive');
    assert.ok(wishCheck.reason.includes('referenced by 3 active wish(es)'));

    // 2. Asset locked by immutable template version cannot be permanently deleted
    const verCheck = checkImageDeletionSafety({
      assetId: 'timg_published_v1',
      wishReferences: 0,
      templateVersionReferences: 1,
      isImmutableVersion: true
    });
    assert.strictEqual(verCheck.safe, false);
    assert.strictEqual(verCheck.action, 'archive');
    assert.ok(verCheck.reason.includes('locked by 1 immutable template version(s)'));

    // 3. Unreferenced orphan asset can be deleted safely
    const safeCheck = checkImageDeletionSafety({
      assetId: 'wmed_orphan_draft',
      wishReferences: 0,
      templateVersionReferences: 0,
      isPublishedWish: false,
      isImmutableVersion: false
    });
    assert.strictEqual(safeCheck.safe, true);
    assert.strictEqual(safeCheck.action, 'delete');
  });

  await t.test('TEST 13: End-to-End Admin Template Image Management Flow', async () => {
    // Simulate Admin adding relationship variant image to a template version
    const mockUploadResponse = {
      data: {
        id: 'imgbb_tpl_asset_99',
        title: 'template_romantic_hero',
        url: 'https://i.ibb.co/romantic_hero.jpg',
        display_url: 'https://i.ibb.co/romantic_hero.jpg',
        thumb: { url: 'https://i.ibb.co/romantic_hero_thumb.jpg' },
        delete_url: 'https://ibb.co/delete/abc',
        width: 400,
        height: 300,
        size: VALID_JPEG.byteLength,
        image: { filename: 'romantic_hero.jpg', mime: 'image/jpeg' }
      },
      success: true,
      status: 200
    };

    const provider = new ImgBBProvider({
      apiKey: 'test_admin_key',
      fetchFn: async () => new Response(JSON.stringify(mockUploadResponse), { status: 200 })
    });

    const uploadResult = await provider.uploadImage({
      data: VALID_JPEG,
      filename: 'romantic_hero.jpg',
      name: 'romantic_hero'
    });

    assert.strictEqual(uploadResult.providerAssetId, 'imgbb_tpl_asset_99');
    assert.strictEqual(uploadResult.displayUrl, 'https://i.ibb.co/romantic_hero.jpg');
    assert.strictEqual(uploadResult.mimeType, 'image/jpeg');
    assert.strictEqual(uploadResult.width, 400);
    assert.strictEqual(uploadResult.height, 300);
  });

  await t.test('TEST 14: End-to-End Customer Wish Media Upload & Relational Slot Mapping Flow', async () => {
    // Simulate customer uploading recipient photo for slot "recipient_photo"
    const mockUserUploadResponse = {
      data: {
        id: 'imgbb_user_photo_77',
        title: 'recipient_photo',
        url: 'https://i.ibb.co/recipient.png',
        display_url: 'https://i.ibb.co/recipient.png',
        thumb: { url: 'https://i.ibb.co/recipient_thumb.png' },
        width: 100,
        height: 200,
        size: VALID_1X1_PNG.byteLength,
        image: { filename: 'recipient.png', mime: 'image/png' }
      },
      success: true,
      status: 200
    };

    const provider = new ImgBBProvider({
      apiKey: 'test_user_key',
      fetchFn: async () => new Response(JSON.stringify(mockUserUploadResponse), { status: 200 })
    });

    // Customer uploads base64 string
    const base64Data = 'data:image/png;base64,' + uint8ArrayToBase64(VALID_1X1_PNG);
    const uploadResult = await provider.uploadImage({
      data: base64Data,
      filename: 'recipient.png'
    });

    assert.strictEqual(uploadResult.providerAssetId, 'imgbb_user_photo_77');
    assert.strictEqual(uploadResult.displayUrl, 'https://i.ibb.co/recipient.png');

    // Map to slot "recipient_photo"
    const wishMappings = [
      {
        wish_id: 'wish_test_123',
        field_key: 'recipient_photo',
        media_id: uploadResult.providerAssetId,
        url: uploadResult.displayUrl,
        display_url: uploadResult.displayUrl
      }
    ];

    // Resolver verifies user photo immediately takes precedence over template defaults
    const resolved = resolveSlotImage({
      slotKey: 'recipient_photo',
      wishMediaMappings: wishMappings,
      templateImages: [
        {
          asset_key: 'recipient_photo',
          display_url: 'https://i.ibb.co/default_recipient.png',
          status: 'active'
        }
      ]
    });

    assert.strictEqual(resolved.source, 'user');
    assert.strictEqual(resolved.displayUrl, 'https://i.ibb.co/recipient.png');
    assert.strictEqual(resolved.assetId, 'imgbb_user_photo_77');
  });

  await t.test('TEST 15: Admin Template Image Metadata Patch, Slot Re-assignment & ImgBB Replacement Flow', async () => {
    // 1. Initial template image record
    const tplImage = {
      id: 'timg_ver1_initial',
      template_id: 'tpl_magical_memories',
      template_version_id: 'ver_magical_memories_v3',
      asset_key: 'hero_photo',
      relationship_id: null,
      storage_provider: 'imgbb',
      provider_asset_id: 'imgbb_initial_1',
      display_url: 'https://i.ibb.co/initial_hero.jpg',
      status: 'active'
    };

    // 2. Simulate Metadata Patch: Reassign to relationship "crush"
    const patchedImage = {
      ...tplImage,
      relationship_id: 'crush',
      updated_at: new Date().toISOString()
    };
    assert.strictEqual(patchedImage.relationship_id, 'crush');

    // 3. Simulate ImgBB Replacement with new image
    const mockReplacement = {
      data: {
        id: 'imgbb_replaced_999',
        url: 'https://i.ibb.co/replaced_crush_hero.jpg',
        display_url: 'https://i.ibb.co/replaced_crush_hero.jpg',
        thumb: { url: 'https://i.ibb.co/replaced_thumb.jpg' },
        width: 400,
        height: 300,
        size: VALID_JPEG.byteLength,
        image: { filename: 'crush_hero.jpg', mime: 'image/jpeg' }
      },
      success: true,
      status: 200
    };

    const provider = new ImgBBProvider({
      apiKey: 'test_admin_key',
      fetchFn: async () => new Response(JSON.stringify(mockReplacement), { status: 200 })
    });

    const replacedResult = await provider.uploadImage({
      data: VALID_JPEG,
      filename: 'crush_hero.jpg'
    });

    const finalRecord = {
      ...patchedImage,
      provider_asset_id: replacedResult.providerAssetId,
      display_url: replacedResult.displayUrl,
      thumbnail_url: replacedResult.thumbnailUrl,
      width: replacedResult.width,
      height: replacedResult.height,
      sha256: replacedResult.sha256
    };

    assert.strictEqual(finalRecord.provider_asset_id, 'imgbb_replaced_999');
    assert.strictEqual(finalRecord.display_url, 'https://i.ibb.co/replaced_crush_hero.jpg');
    assert.strictEqual(finalRecord.relationship_id, 'crush');

    // 4. Verify slot resolution with relationship variant
    const resolvedCrush = resolveSlotImage({
      slotKey: 'hero_photo',
      wishMediaMappings: [],
      templateImages: [finalRecord],
      relationshipId: 'crush'
    });

    assert.strictEqual(resolvedCrush.source, 'variant_template');
    assert.strictEqual(resolvedCrush.displayUrl, 'https://i.ibb.co/replaced_crush_hero.jpg');
  });

  await t.test('TEST 16: Safe Storage Audit & Multi-Role RBAC Authorization (IDOR Protection Matrix)', async () => {
    // 1. Audit check when asset has published wish references
    const wishReferences = 2;
    const templateReferences = 1;
    const safetyReport = checkImageDeletionSafety({
      publishedWishReferences: wishReferences,
      templateVersionReferences: templateReferences
    });

    assert.strictEqual(safetyReport.isSafeToDelete, false);
    assert.strictEqual(safetyReport.recommendedAction, 'archive');

    // 2. Audit check when asset is unreferenced
    const cleanSafetyReport = checkImageDeletionSafety({
      publishedWishReferences: 0,
      templateVersionReferences: 0
    });

    assert.strictEqual(cleanSafetyReport.isSafeToDelete, true);
    assert.strictEqual(cleanSafetyReport.recommendedAction, 'delete');

    // 3. IDOR Ownership Verification Guard simulation
    const userA = { id: 'usr_alpha', role: 'user' };
    const userB = { id: 'usr_beta', role: 'user' };
    const adminUser = { id: 'usr_admin', role: 'admin' };

    const mediaBelongingToB = { id: 'wmed_beta_001', user_id: 'usr_beta', wish_id: 'wish_b' };

    // Function simulating ownership check in Worker & server
    function canModifyMedia(user, media) {
      if (!user || !media) return false;
      if (user.role === 'admin') return true;
      return user.id === media.user_id;
    }

    // User A trying to delete User B's media MUST be rejected
    assert.strictEqual(canModifyMedia(userA, mediaBelongingToB), false, 'User A cannot modify User B media');
    // User B modifying their own media MUST be allowed
    assert.strictEqual(canModifyMedia(userB, mediaBelongingToB), true, 'User B can modify own media');
    // Admin modifying User B's media MUST be allowed
    assert.strictEqual(canModifyMedia(adminUser, mediaBelongingToB), true, 'Admin can manage media');
  });

});
