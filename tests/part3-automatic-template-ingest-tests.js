/**
 * Automated Test Suite for WishMagic Part 3:
 * Automatic Template ZIP Ingestion Engine, Secure Extraction, Versioned B2 Storage & D1 Registration
 * =================================================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from 'jszip';

import {
  executeB2TemplateIngestPipeline,
  extractAndVerifyZip,
  computePackageFingerprint,
  validateZipMagicBytes,
  UPLOAD_OPERATION_STATE,
  ZIP_LIMITS
} from '../src/template-ingest-pipeline.js';

import {
  buildTemplateStorageKeys,
  computeSha256Hex,
  B2StorageProvider
} from '../src/storage-provider.js';

test('Part 3 — Automatic Template ZIP Ingestion Engine & Storage Pipeline', async (t) => {

  await t.test('TEST 1: Migration 0028 Additive Integrity & Production D1 UUID', () => {
    const migrationFile = 'migrations/0028_part3_template_ingestion_operations.sql';
    assert.ok(fs.existsSync(migrationFile), 'Migration 0028 must exist');

    const sql = fs.readFileSync(migrationFile, 'utf8');
    assert.ok(sql.includes('c08b683b-eb07-4639-ab33-fb1139bfb295'), 'Must reference preserved production D1 UUID');
    const cleanSql = sql.replace(/--.*$/gm, '');
    assert.ok(!/\bDROP\s+TABLE\b/i.test(cleanSql), 'Must NOT drop any tables');
    assert.ok(!/\bDROP\s+DATABASE\b/i.test(cleanSql), 'Must NOT drop database');
    assert.ok(!/\bTRUNCATE\b/i.test(cleanSql), 'Must NOT truncate data');

    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS template_upload_operations'), 'Must create template_upload_operations table');
    assert.ok(sql.includes('idempotency_key'), 'Must include idempotency_key');
    assert.ok(sql.includes('package_fingerprint'), 'Must include package_fingerprint');
    assert.ok(sql.includes('b2_objects_json'), 'Must include b2_objects_json for rollback tracking');
    assert.ok(sql.includes('ALTER TABLE template_versions ADD COLUMN package_fingerprint TEXT'), 'Additive package_fingerprint on template_versions');
  });

  await t.test('TEST 2: Secure Extraction - Path Traversal Suppression & Security Warnings', async () => {
    const zip = new JSZip();
    zip.file('index.html', '<!DOCTYPE html><title>Test</title><h1>Hello</h1>');
    zip.file('/etc/passwd', 'malicious content');
    zip.file('C:/boot.ini', 'drive traversal payload');

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
    const extracted = await extractAndVerifyZip(zipBuffer);

    assert.ok(extracted.files.has('index.html'), 'Legitimate files must be retained');
    assert.ok(!extracted.files.has('/etc/passwd'), 'Path traversal must be rejected');
    assert.ok(!extracted.files.has('C:/boot.ini'), 'Drive traversal must be rejected');
    assert.ok(extracted.warnings.length >= 2, 'Security warnings must be recorded');
  });

  await t.test('TEST 3: Secure Extraction - Forbidden Executable Suppression', async () => {
    const zip = new JSZip();
    zip.file('index.html', '<!DOCTYPE html><title>Test</title><h1>Hello</h1>');
    zip.file('scripts/malware.exe', 'MZ\x90\x00');
    zip.file('server/backdoor.php', '<?php system($_GET["c"]); ?>');

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
    const extracted = await extractAndVerifyZip(zipBuffer);

    assert.ok(extracted.files.has('index.html'));
    assert.ok(!extracted.files.has('scripts/malware.exe'), 'Must suppress .exe');
    assert.ok(!extracted.files.has('server/backdoor.php'), 'Must suppress .php');
    assert.ok(extracted.warnings.length >= 2, 'Must record warnings for dangerous files');
  });

  await t.test('TEST 4: Secure Extraction - Missing Entry Point Rejection (ENTRY_POINT_MISSING)', async () => {
    const zip = new JSZip();
    zip.file('style.css', 'body { color: red; }');
    zip.file('app.js', 'console.log("no html");');

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });

    await assert.rejects(
      async () => await extractAndVerifyZip(zipBuffer),
      (err) => err.code === 'ENTRY_POINT_MISSING',
      'Should reject archive missing index.html'
    );
  });

  await t.test('TEST 5: UTP Manifest Validation - Rejection of Malformed JSON in wishmagic.json', async () => {
    const zip = new JSZip();
    zip.file('index.html', '<!DOCTYPE html><title>Test</title><h1>Hello</h1>');
    zip.file('wishmagic.json', '{ invalid_json_syntax: missing_quotes ');

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });

    const result = await executeB2TemplateIngestPipeline({
      zipBuffer,
      templateMetadata: { name: 'Malformed Manifest Template' },
      env: {},
      storageProvider: { bucketName: 'test', putObject: async () => ({ success: true }) },
      authorId: 'admin_test'
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.code, 'INVALID_MANIFEST_JSON');
    assert.ok(result.message.includes('Malformed JSON'));
  });

  await t.test('TEST 6: UTP Manifest Validation - Rejection of Conflicting Multiple Manifests', async () => {
    const zip = new JSZip();
    zip.file('index.html', '<!DOCTYPE html><title>Test</title><h1>Hello</h1>');
    zip.file('wishmagic.json', JSON.stringify({ protocol: 'WishMagic Universal Template Protocol', schema_version: '1.0.0', template: { id: 'test-1', name: 'Test 1' } }));
    zip.file('manifest.json', JSON.stringify({ protocol: 'WishMagic Universal Template Protocol', schema_version: '1.0.0', template: { id: 'test-2', name: 'Test 2' } }));

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });

    const result = await executeB2TemplateIngestPipeline({
      zipBuffer,
      templateMetadata: { name: 'Dual Manifest Template' },
      env: {},
      storageProvider: { bucketName: 'test', putObject: async () => ({ success: true }) },
      authorId: 'admin_test'
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.code, 'MULTIPLE_MANIFESTS_CONFLICT');
  });

  await t.test('TEST 7: Deterministic Package Fingerprinting & Storage Key Hierarchy', async () => {
    const zip = new JSZip();
    zip.file('index.html', '<!DOCTYPE html><title>Galaxy Surprise</title><h1 data-wm-field="recipient_name">Dear Alex</h1>');
    zip.file('css/style.css', 'body { background: #0b0c10; }');
    zip.file('js/galaxy.js', 'console.log("3D galaxy initialized");');

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
    const extracted = await extractAndVerifyZip(zipBuffer);
    const fingerprint = await computePackageFingerprint(extracted.files);

    assert.strictEqual(typeof fingerprint, 'string');
    assert.strictEqual(fingerprint.length, 64, 'SHA-256 hex must be 64 characters');

    // Deterministic verify
    const fingerprint2 = await computePackageFingerprint(extracted.files);
    assert.strictEqual(fingerprint, fingerprint2, 'Fingerprint must be deterministic for identical files');

    // Storage Keys Hierarchy
    const keys = buildTemplateStorageKeys('fam_galaxy_surprise', 'ver_galaxy_v1');
    assert.strictEqual(keys.sourceZip, 'templates/fam_galaxy_surprise/versions/ver_galaxy_v1/source/template.zip');
    assert.strictEqual(keys.manifest, 'templates/fam_galaxy_surprise/versions/ver_galaxy_v1/manifests/manifest.json');
    assert.strictEqual(keys.analyzerSchema, 'templates/fam_galaxy_surprise/versions/ver_galaxy_v1/metadata/analyzer-schema.json');
    assert.strictEqual(keys.hashes, 'templates/fam_galaxy_surprise/versions/ver_galaxy_v1/integrity/hashes.json');
    assert.strictEqual(keys.runtimeFile('js/galaxy.js'), 'templates/fam_galaxy_surprise/versions/ver_galaxy_v1/runtime/js/galaxy.js');
  });

  await t.test('TEST 8: End-to-End Ingestion, Operation State Machine & Staged State', async () => {
    const uploadedObjects = new Map();
    const mockStorageProvider = {
      bucketName: 'wishmagic-b2-prod',
      async putObject({ key, body, contentType, contentLength }) {
        uploadedObjects.set(key, { key, body, contentType, contentLength, fileId: `b2_fid_${Math.random().toString(36).slice(2, 8)}` });
        return { success: true, key, fileId: `b2_fid_${Math.random().toString(36).slice(2, 8)}` };
      }
    };

    const recordedOperations = [];
    const dbStatements = [];
    const mockDb = {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async run() {
                dbStatements.push({ sql, args });
                if (sql.includes('template_upload_operations')) {
                  recordedOperations.push({ sql, args });
                }
                return { success: true };
              },
              async first() {
                if (sql.includes('MAX(version_number)')) {
                  return { maxVer: 0 };
                }
                return null;
              }
            };
          }
        };
      }
    };

    const zip = new JSZip();
    zip.file('index.html', '<!DOCTYPE html><title>Interactive Love Letter</title><h1 data-wm-field="partner_name">My Love</h1><p data-wm-field="love_note">Forever and always</p>');
    zip.file('css/romantic.css', '.letter { font-family: cursive; }');
    zip.file('wishmagic.json', JSON.stringify({
      protocol: 'WishMagic Universal Template Protocol',
      schema_version: '1.0.0',
      template: {
        id: 'romantic-love-letter',
        name: 'Interactive Love Letter',
        category: 'romance',
        tier: 'vip',
        price: 39
      },
      capabilities: {
        envelope_opening: true,
        bgm_player: true
      },
      fields: [
        { id: 'partner_name', label: 'Partner Name', type: 'text', required: true },
        { id: 'love_note', label: 'Love Note', type: 'textarea', required: true }
      ]
    }));

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });

    const result = await executeB2TemplateIngestPipeline({
      zipBuffer,
      templateMetadata: {
        name: 'Interactive Love Letter',
        category: 'romance',
        tier: 'vip',
        price: 39
      },
      env: {},
      db: mockDb,
      storageProvider: mockStorageProvider,
      authorId: 'admin_alex',
      idempotencyKey: 'idem_op_test_123'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'ready');
    assert.strictEqual(result.isPublished, false, 'Staged version must not be published automatically');
    assert.ok(result.operationId, 'Must return operationId');
    assert.ok(result.versionId, 'Must return versionId');
    assert.strictEqual(result.versionNumber, 1);
    assert.strictEqual(result.versionLabel, 'v1.0.0');
    assert.ok(result.previewUrl.includes('/preview/index.html'), 'Must provide isolated preview URL');

    // Verify operations state machine recorded transitions
    assert.ok(recordedOperations.length >= 3, 'Must record state transitions in template_upload_operations');
    const finalOp = recordedOperations[recordedOperations.length - 1];
    // State is arg index 9 in updateOperation
    assert.strictEqual(finalOp.args[9], UPLOAD_OPERATION_STATE.PREVIEW_READY);

    // Verify Backblaze B2 objects uploaded
    assert.ok(uploadedObjects.has(result.storageKeys.sourceZip), 'Source ZIP stored in B2');
    assert.ok(uploadedObjects.has(result.storageKeys.manifest), 'UTP manifest stored in B2');
    assert.ok(uploadedObjects.has(result.storageKeys.runtimeFile('index.html')), 'Runtime index.html stored in B2');
    assert.ok(uploadedObjects.has(result.storageKeys.runtimeFile('css/romantic.css')), 'Runtime romantic.css stored in B2');

    // Verify D1 records
    const versionInsert = dbStatements.find(s => s.sql.includes('INSERT INTO template_versions'));
    assert.ok(versionInsert, 'template_versions record inserted into D1');
    assert.strictEqual(versionInsert.args[0], result.versionId);
    assert.strictEqual(versionInsert.args[3], 1); // version_number
    assert.strictEqual(versionInsert.args[4], 'v1.0.0'); // version_label

    const fieldsInsert = dbStatements.filter(s => s.sql.includes('template_fields'));
    assert.ok(fieldsInsert.length >= 2, 'template_fields records inserted into D1');
  });

  await t.test('TEST 9: Idempotency & Duplicate Package Detection', async () => {
    const zip = new JSZip();
    zip.file('index.html', '<!DOCTYPE html><title>Duplicate Test</title><h1>Hello</h1>');
    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
    const extracted = await extractAndVerifyZip(zipBuffer);
    const expectedFingerprint = await computePackageFingerprint(extracted.files);

    const mockDb = {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async run() { return { success: true }; },
              async first() {
                if (sql.includes('package_fingerprint = ?')) {
                  return {
                    id: 'ver_existing_v1_xyz',
                    version_number: 1,
                    version_label: 'v1.0.0',
                    status: 'ready'
                  };
                }
                return null;
              }
            };
          }
        };
      }
    };

    const result = await executeB2TemplateIngestPipeline({
      zipBuffer,
      templateMetadata: { name: 'Duplicate Test' },
      env: {},
      db: mockDb,
      storageProvider: { bucketName: 'test', putObject: async () => ({ success: true }) },
      authorId: 'admin_test'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.duplicateDetected, true, 'Must detect duplicate package fingerprint');
    assert.strictEqual(result.versionId, 'ver_existing_v1_xyz');
    assert.strictEqual(result.versionLabel, 'v1.0.0');
    assert.ok(result.message.includes('Identical package fingerprint already exists'));
  });

  await t.test('TEST 10: Atomic Rollback on Mid-Flight B2 Upload Failure', async () => {
    const deletedObjects = [];
    const mockStorageProvider = {
      bucketName: 'wishmagic-b2-test',
      async putObject({ key }) {
        if (key.includes('css/broken.css')) {
          throw new Error('Simulated B2 connection reset');
        }
        return { success: true, key, fileId: `b2_fid_${key}` };
      },
      async deleteObject({ key }) {
        deletedObjects.push(key);
        return { success: true };
      }
    };

    const mockDb = {
      prepare(sql) {
        return {
          bind() {
            return {
              async run() { return { success: true }; },
              async first() { return null; }
            };
          }
        };
      }
    };

    const zip = new JSZip();
    zip.file('index.html', '<!DOCTYPE html><title>Rollback Test</title><h1>Rollback</h1>');
    zip.file('css/broken.css', 'body { color: black; }');
    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });

    const result = await executeB2TemplateIngestPipeline({
      zipBuffer,
      templateMetadata: { name: 'Rollback Test' },
      env: {},
      db: mockDb,
      storageProvider: mockStorageProvider,
      authorId: 'admin_test'
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.code, 'B2_INGEST_FAILED');
    assert.ok(deletedObjects.length > 0, 'Must clean up uploaded B2 objects on failure');
    assert.ok(deletedObjects.some(k => k.includes('source/template.zip') || k.includes('runtime/index.html')), 'Source ZIP or runtime files deleted during rollback');
  });

});
