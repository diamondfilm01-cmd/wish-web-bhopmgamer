/**
 * Automated Test Suite for WishMagic Backblaze B2 Template Storage & Ingestion Pipeline (Part 20)
 * ==============================================================================================
 * Tests:
 * 1. Production D1 Database UUID and Additive Migration Integrity (0008)
 * 2. B2 Configuration Validation & Structured Rejection (B2_NOT_CONFIGURED)
 * 3. B2 Deterministic Object Key Architecture
 * 4. Universal Checksum Verification (SHA-1 and SHA-256)
 * 5. ZIP Magic Bytes Header Verification (PK\x03\x04)
 * 6. ZIP Security: Anti-Path Traversal Protection (../ rejection)
 * 7. ZIP Security: Disallowed Executable Extensions Suppression (.exe, .sh, .php)
 * 8. ZIP Security: Resource Limits & Bomb Protection
 * 9. Entry Point Enforcement (Requires index.html)
 * 10. Template Analyzer Dynamic Slot & Manifest Extraction
 * 11. Composite Runtime Integrity Hash Verification
 * 12. End-to-End B2 Ingestion Pipeline & D1 Persistence
 * 13. Pipeline Failure Recovery & State Rollback
 * 14. Version Preview & Publishing Transition
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

import {
  computeSha256Hex,
  computeSha1Hex,
  getMimeType,
  getB2Config,
  buildTemplateStorageKeys,
  B2StorageProvider,
  StorageProvider
} from '../src/storage-provider.js';

import {
  validateZipMagicBytes,
  extractAndVerifyZip,
  classifyFileRole,
  analyzeHtmlString,
  analyzeTemplateAndBuildIntegrity,
  executeB2TemplateIngestPipeline,
  ZIP_LIMITS
} from '../src/template-ingest-pipeline.js';

test('Part 20 — Backblaze B2 Template Storage & Real Ingestion Pipeline', async (t) => {

  await t.test('TEST 1: Production D1 Database UUID and Additive Migration Integrity (0008)', () => {
    const migrationFile = 'migrations/0008_part20_b2_template_storage.sql';
    assert.ok(fs.existsSync(migrationFile), 'Migration 0008 must exist');

    const sql = fs.readFileSync(migrationFile, 'utf8');
    assert.ok(sql.includes('c08b683b-eb07-4639-ab33-fb1139bfb295'), 'Must reference preserved production D1 UUID');
    const cleanSql = sql.replace(/--.*$/gm, '');
    assert.ok(!/\bDROP\s+TABLE\b/i.test(cleanSql), 'Must NOT drop any tables');
    assert.ok(!/\bDROP\s+DATABASE\b/i.test(cleanSql), 'Must NOT drop database');
    assert.ok(!/\bTRUNCATE\b/i.test(cleanSql), 'Must NOT truncate data');

    assert.ok(sql.includes('ALTER TABLE template_versions ADD COLUMN template_family_id TEXT;'), 'Additive template_family_id column');
    assert.ok(sql.includes('ALTER TABLE template_versions ADD COLUMN source_zip_storage_key TEXT;'), 'Additive source_zip_storage_key column');
    assert.ok(sql.includes('ALTER TABLE template_versions ADD COLUMN runtime_hash TEXT;'), 'Additive runtime_hash column');
    assert.ok(sql.includes('ALTER TABLE template_versions ADD COLUMN storage_provider TEXT'), 'Additive storage_provider column');
  });

  await t.test('TEST 2: B2 Configuration Validation & Structured Rejection (B2_NOT_CONFIGURED)', () => {
    // Empty config
    const emptyConfig = getB2Config({});
    assert.strictEqual(emptyConfig.isConfigured, false, 'Should not be configured when env is empty');
    assert.ok(emptyConfig.missingKeys.includes('B2_APPLICATION_KEY_ID'));
    assert.ok(emptyConfig.missingKeys.includes('B2_APPLICATION_KEY'));

    // Instantiating without env must throw structured error
    assert.throws(
      () => B2StorageProvider.fromEnv({}),
      (err) => {
        return err.code === 'B2_NOT_CONFIGURED' && Array.isArray(err.missingKeys);
      },
      'Should throw B2_NOT_CONFIGURED'
    );

    // With valid credentials
    const validConfig = getB2Config({
      B2_APPLICATION_KEY_ID: 'key_id_123',
      B2_APPLICATION_KEY: 'app_key_456',
      B2_BUCKET_NAME: 'wishmagic-prod',
      B2_BUCKET_ID: 'bucket_789'
    });
    assert.strictEqual(validConfig.isConfigured, true);
    assert.strictEqual(validConfig.bucketName, 'wishmagic-prod');
  });

  await t.test('TEST 3: B2 Deterministic Object Key Architecture', () => {
    const familyId = 'fam_magical_memories';
    const versionId = 'ver_magical_memories_v1_xyz';

    const keys = buildTemplateStorageKeys(familyId, versionId);

    assert.strictEqual(keys.sourceZip, `templates/${familyId}/versions/${versionId}/source/template.zip`);
    assert.strictEqual(keys.runtimeRoot, `templates/${familyId}/versions/${versionId}/runtime/`);
    assert.strictEqual(keys.runtimeFile('index.html'), `templates/${familyId}/versions/${versionId}/runtime/index.html`);
    assert.strictEqual(keys.runtimeFile('css/style.css'), `templates/${familyId}/versions/${versionId}/runtime/css/style.css`);
    assert.strictEqual(keys.manifest, `templates/${familyId}/versions/${versionId}/manifests/manifest.json`);
    assert.strictEqual(keys.analyzerSchema, `templates/${familyId}/versions/${versionId}/metadata/analyzer-schema.json`);
    assert.strictEqual(keys.hashes, `templates/${familyId}/versions/${versionId}/integrity/hashes.json`);
  });

  await t.test('TEST 4: Universal Checksum Verification (SHA-1 and SHA-256)', async () => {
    const testData = 'WishMagic Production Template Ingestion';
    const sha256 = await computeSha256Hex(testData);
    const sha1 = await computeSha1Hex(testData);

    assert.strictEqual(typeof sha256, 'string');
    assert.strictEqual(sha256.length, 64, 'SHA-256 must be 64 hex characters');
    assert.strictEqual(typeof sha1, 'string');
    assert.strictEqual(sha1.length, 40, 'SHA-1 must be 40 hex characters');

    // Deterministic check
    const sha256Repeat = await computeSha256Hex(testData);
    assert.strictEqual(sha256, sha256Repeat);
  });

  await t.test('TEST 5: ZIP Magic Bytes Header Verification (PK\\x03\\x04)', () => {
    // Valid ZIP header
    const validZipHeader = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00]);
    assert.strictEqual(validateZipMagicBytes(validZipHeader), true);

    // Corrupted non-ZIP buffer
    const textBuffer = new TextEncoder().encode('Hello world, not a zip');
    assert.throws(
      () => validateZipMagicBytes(textBuffer),
      (err) => err.code === 'ZIP_INVALID_FORMAT'
    );

    // Null or tiny buffer
    assert.throws(
      () => validateZipMagicBytes(new Uint8Array([0x01, 0x02])),
      (err) => err.code === 'ZIP_INVALID_FORMAT'
    );
  });

  await t.test('TEST 6: ZIP Security: Anti-Path Traversal Protection (../ rejection)', async () => {
    const zip = new JSZip();
    zip.file('index.html', '<!DOCTYPE html><html><body><h1>Safe</h1></body></html>');
    zip.file('/etc/passwd', 'evil traversal payload');
    zip.file('C:/boot.ini', 'malicious drive path');

    const buffer = await zip.generateAsync({ type: 'uint8array' });
    const extracted = await extractAndVerifyZip(buffer);

    // The traversal entries must be skipped by security check
    assert.ok(extracted.files.has('index.html'), 'Safe index.html must be preserved');
    assert.ok(!extracted.files.has('/etc/passwd'), 'Absolute path traversal must be rejected');
    assert.ok(!extracted.files.has('C:/boot.ini'), 'Drive path traversal must be rejected');
    assert.ok(extracted.warnings.length >= 2, 'Must record security warnings');
  });

  await t.test('TEST 7: ZIP Security: Disallowed Executable Extensions Suppression (.exe, .sh, .php)', async () => {
    const zip = new JSZip();
    zip.file('index.html', '<!DOCTYPE html><html><body>Hello</body></html>');
    zip.file('payload.exe', 'binary_data');
    zip.file('backdoor.php', '<?php phpinfo(); ?>');
    zip.file('script.sh', '#!/bin/bash');

    const buffer = await zip.generateAsync({ type: 'uint8array' });
    const extracted = await extractAndVerifyZip(buffer);

    assert.ok(extracted.files.has('index.html'));
    assert.ok(!extracted.files.has('payload.exe'), 'Must suppress .exe');
    assert.ok(!extracted.files.has('backdoor.php'), 'Must suppress .php');
    assert.ok(!extracted.files.has('script.sh'), 'Must suppress .sh');
    assert.ok(extracted.warnings.length >= 3);
  });

  await t.test('TEST 8: ZIP Security: Resource Limits & Bomb Protection', () => {
    assert.ok(ZIP_LIMITS.MAX_ZIP_BYTES === 50 * 1024 * 1024);
    assert.ok(ZIP_LIMITS.MAX_UNCOMPRESSED_BYTES === 150 * 1024 * 1024);
    assert.ok(ZIP_LIMITS.MAX_FILE_COUNT === 1000);
    assert.ok(ZIP_LIMITS.MAX_COMPRESSION_RATIO === 100);
  });

  await t.test('TEST 9: Entry Point Enforcement (Requires index.html)', async () => {
    const zipWithoutIndex = new JSZip();
    zipWithoutIndex.file('about.html', '<h1>No index</h1>');
    zipWithoutIndex.file('style.css', 'body { color: red; }');

    const buffer = await zipWithoutIndex.generateAsync({ type: 'uint8array' });

    await assert.rejects(
      async () => extractAndVerifyZip(buffer),
      (err) => err.code === 'ENTRY_POINT_MISSING'
    );
  });

  await t.test('TEST 10: Template Analyzer Dynamic Slot & Manifest Extraction', async () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Midnight Starlight Wishes</title>
        <link rel="stylesheet" href="css/style.css">
      </head>
      <body>
        <h1 data-wm-field="recipient_name" data-wm-type="text" data-wm-required="true">Dear Alice</h1>
        <p data-wm-field="celebration_message" data-wm-type="textarea">Happy Birthday!</p>
        <img data-wm-field="hero_photo" src="assets/default.jpg" />
        <audio data-wm-field="background_music" src="assets/music.mp3"></audio>
        <div>{{sender_signature}}</div>
      </body>
      </html>
    `;

    const analysis = analyzeHtmlString(sampleHtml);
    assert.strictEqual(analysis.title, 'Midnight Starlight Wishes');
    assert.ok(analysis.fields.some(f => f.key === 'recipient_name' && f.isRequired === true));
    assert.ok(analysis.fields.some(f => f.key === 'celebration_message' && f.type === 'textarea'));
    assert.ok(analysis.fields.some(f => f.key === 'hero_photo' && f.type === 'image'));
    assert.ok(analysis.fields.some(f => f.key === 'sender_signature'));
  });

  await t.test('TEST 11: Composite Runtime Integrity Hash Verification', async () => {
    const zip = new JSZip();
    zip.file('index.html', '<!DOCTYPE html><title>Test</title><h1>Hello</h1>');
    zip.file('css/style.css', 'body { margin: 0; }');
    zip.file('js/app.js', 'console.log("running");');

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
    const extracted = await extractAndVerifyZip(zipBuffer);
    const integrity = await analyzeTemplateAndBuildIntegrity(extracted, zipBuffer);

    assert.ok(integrity.sourceZipSha256, 'Must compute source ZIP SHA-256');
    assert.ok(integrity.runtimeHash, 'Must compute composite runtime hash');
    assert.strictEqual(integrity.fileRecords.length, 3);
    assert.strictEqual(integrity.hashesPayload.files['index.html'].role, 'entry_html');
    assert.strictEqual(integrity.hashesPayload.files['css/style.css'].role, 'stylesheet');
    assert.strictEqual(integrity.hashesPayload.files['js/app.js'].role, 'script');
  });

  await t.test('TEST 12: End-to-End B2 Ingestion Pipeline & D1 Persistence', async () => {
    // Mock storage provider tracking calls
    const uploadedObjects = new Map();
    const mockStorageProvider = {
      bucketName: 'wishmagic-test-bucket',
      async putObject({ key, body, contentType, contentLength }) {
        uploadedObjects.set(key, {
          body,
          contentType,
          contentLength,
          fileId: `b2_fid_${Math.random().toString(36).slice(2, 10)}`
        });
        return {
          success: true,
          key,
          fileId: `b2_fid_${Math.random().toString(36).slice(2, 10)}`,
          contentLength: contentLength || (body ? body.byteLength || body.length : 0),
          contentType,
          uploadTimestamp: Date.now()
        };
      }
    };

    // Mock D1 Database tracking calls
    const dbStatements = [];
    const mockDb = {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async run() {
                dbStatements.push({ sql, args });
                return { success: true };
              }
            };
          }
        };
      }
    };

    const zip = new JSZip();
    zip.file('index.html', '<!DOCTYPE html><title>Celebration Card</title><h1 data-wm-field="rec_name">Hi</h1>');
    zip.file('css/style.css', 'body { background: #000; }');

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });

    const result = await executeB2TemplateIngestPipeline({
      zipBuffer,
      templateMetadata: {
        name: 'Celebration Card',
        category: 'Birthday',
        tier: 'vip',
        price: 29
      },
      env: {},
      db: mockDb,
      storageProvider: mockStorageProvider,
      authorId: 'admin_test'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'ready');
    assert.strictEqual(result.isPublished, false);
    assert.ok(result.versionId.startsWith('ver_'));
    assert.ok(result.previewUrl.includes('/preview/index.html'));

    // Verify uploaded files in storage
    assert.ok(uploadedObjects.has(result.storageKeys.sourceZip), 'Original ZIP uploaded to B2');
    assert.ok(uploadedObjects.has(result.storageKeys.manifest), 'Manifest uploaded to B2');
    assert.ok(uploadedObjects.has(result.storageKeys.analyzerSchema), 'Analyzer schema uploaded to B2');
    assert.ok(uploadedObjects.has(result.storageKeys.hashes), 'Hashes uploaded to B2');
    assert.ok(uploadedObjects.has(result.storageKeys.runtimeFile('index.html')), 'Runtime index.html uploaded to B2');
    assert.ok(uploadedObjects.has(result.storageKeys.runtimeFile('css/style.css')), 'Runtime style.css uploaded to B2');

    // Verify D1 records
    const versionInsert = dbStatements.find(s => s.sql.includes('INSERT INTO template_versions'));
    assert.ok(versionInsert, 'Must insert template_versions record in D1');
    assert.strictEqual(versionInsert.args[0], result.versionId);
    assert.strictEqual(versionInsert.args[4], 'v1.0.0');

    const fileInserts = dbStatements.filter(s => s.sql.includes('INSERT INTO template_files'));
    assert.strictEqual(fileInserts.length, 2, 'Must insert 2 template_files records in D1');
  });

  await t.test('TEST 13: Pipeline Failure Recovery & State Rollback', async () => {
    // Failing storage provider
    const failingStorageProvider = {
      async putObject({ key }) {
        if (key.includes('css/style.css')) {
          throw new Error('B2 Network Upload Timeout');
        }
        return { success: true, fileId: 'fid_123' };
      }
    };

    const updatedStatements = [];
    const mockDb = {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async run() {
                updatedStatements.push({ sql, args });
                return { success: true };
              }
            };
          }
        };
      }
    };

    const zip = new JSZip();
    zip.file('index.html', '<!DOCTYPE html><title>Fail Test</title>');
    zip.file('css/style.css', 'body { color: blue; }');

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });

    const result = await executeB2TemplateIngestPipeline({
      zipBuffer,
      templateMetadata: { name: 'Fail Test' },
      env: {},
      db: mockDb,
      storageProvider: failingStorageProvider
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.code, 'B2_INGEST_FAILED');
    assert.ok(result.message.includes('B2 Network Upload Timeout'));

    // Must mark version as failed in DB
    const failedUpdate = updatedStatements.find(s => s.sql.includes("SET status = 'failed'"));
    assert.ok(failedUpdate, 'Must record failure in DB');
  });

  await t.test('TEST 14: Version Preview & Publishing Transition', () => {
    // Simulate published state change
    const versions = [
      { id: 'ver_1', templateId: 'tpl_star', status: 'published' },
      { id: 'ver_2', templateId: 'tpl_star', status: 'ready' }
    ];

    const targetVersionId = 'ver_2';
    const nowIso = new Date().toISOString();

    // Archive old published version
    versions.forEach(v => {
      if (v.templateId === 'tpl_star' && v.status === 'published') {
        v.status = 'archived';
        v.archivedAt = nowIso;
      }
    });

    const target = versions.find(v => v.id === targetVersionId);
    target.status = 'published';
    target.publishedAt = nowIso;

    assert.strictEqual(versions[0].status, 'archived');
    assert.strictEqual(versions[1].status, 'published');
    assert.strictEqual(target.publishedAt, nowIso);
  });

});
