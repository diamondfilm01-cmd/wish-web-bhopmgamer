/**
 * Automated Test Suite for WishMagic Part 3:
 * Automatic Template ZIP Ingestion Engine, Secure Extraction, Versioned B2 Storage & D1 Registration
 * =================================================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from '../src/vendor/jszip.js';

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
    assert.ok(fieldsInsert.length >= 1 && fieldsInsert[0].args.includes('partner_name') && fieldsInsert[0].args.includes('love_note'), 'template_fields records inserted into D1');
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


  await t.test("TEST 11: Real SQLite D1 Auto-Healing when template_upload_operations or template_versions columns are missing", async () => {
    const { DatabaseSync } = await import("../scripts/sqlite-compat.js");
    const rawDb = new DatabaseSync(":memory:");
    // Simulate legacy D1 database missing template_upload_operations and missing category/tier/price on template_versions
    rawDb.exec(`
      CREATE TABLE templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        thumbnail TEXT NOT NULL DEFAULT "",
        folder TEXT NOT NULL DEFAULT "",
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE template_versions (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        version_number INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT "active",
        created_at TEXT NOT NULL
      );
    `);

    const realD1 = {
      prepare(sql) {
        let bound = [];
        return {
          bind(...args) { bound = args; return this; },
          async run() {
            const stmt = rawDb.prepare(sql);
            const info = stmt.run(...bound);
            return { success: true, meta: { changes: info.changes } };
          },
          async first() {
            const stmt = rawDb.prepare(sql);
            return stmt.get(...bound) || null;
          },
          async all() {
            const stmt = rawDb.prepare(sql);
            return { success: true, results: stmt.all(...bound) };
          }
        };
      },
      async batch(stmts) {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        return out;
      }
    };

    const zip = new JSZip();
    zip.file("wishmagic.json", JSON.stringify({
      "$schema": "wishmagic-template",
      "schemaVersion": "1.0.0",
      "template": {
        "id": "bro-code-dost-hai-ya-namuna",
        "name": "Bro Code: Dost Hai Ya Namuna?",
        "category": "friendship",
        "tier": "free",
        "price": 0,
        "entry": "index.html"
      },
      "fields": [
        { "id": "recipient_name", "type": "text", "label": "Friend Name", "required": true, "defaultValue": "Rohan" },
        { "id": "photo_1", "type": "image", "label": "Cover Photo", "required": false, "defaultValue": "assets/images/cover.jpg" }
      ]
    }));
    zip.file("index.html", "<!DOCTYPE html><html><head><title>Bro Code</title></head><body><h1 data-wm-field=\"recipient_name\" data-wm-type=\"text\">Rohan</h1><img data-wm-field=\"photo_1\" data-wm-type=\"image\" src=\"assets/images/cover.jpg\"/></body></html>");
    zip.file("assets/images/cover.jpg", new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]));
    const zipBuffer = await zip.generateAsync({ type: "uint8array" });

    const res = await executeB2TemplateIngestPipeline({
      zipBuffer,
      templateMetadata: {
        name: "Bro Code: Dost Hai Ya Namuna?",
        category: "Friendship",
        tier: "free",
        price: 0,
        publishImmediately: true
      },
      env: {},
      db: realD1,
      storageProvider: {
        bucketName: "wishmagic-assets",
        async putObject({ key }) { return { success: true, key, fileId: "b2_" + key }; }
      },
      imgbbProvider: {
        async uploadImage({ filename, name }) {
          return {
            displayUrl: "https://i.ibb.co/bro/" + filename,
            originalUrl: "https://i.ibb.co/bro/" + filename,
            thumbnailUrl: "https://i.ibb.co/bro/t_" + filename,
            providerAssetId: "imgbb_" + name,
            mimeType: "image/jpeg",
            sizeBytes: 1024,
            width: 600,
            height: 600
          };
        }
      },
      authorId: "admin_ankit",
      idempotencyKey: "op_auto_heal_bro_code_v1"
    });

    assert.strictEqual(res.success, true, "Must auto-heal D1 schema and complete ingestion without IDEMPOTENCY_LOOKUP_FAILED");
    assert.strictEqual(res.templateId, "tpl_bro-code-dost-hai-ya-namuna");
    assert.strictEqual(res.isPublished, true);

    const savedOp = rawDb.prepare("SELECT * FROM template_upload_operations WHERE idempotency_key = ?").get("op_auto_heal_bro_code_v1");
    assert.ok(savedOp, "template_upload_operations row must be persisted after auto-healing");
    assert.strictEqual(savedOp.state, UPLOAD_OPERATION_STATE.PREVIEW_READY);

    const savedImg = rawDb.prepare("SELECT * FROM template_images WHERE template_id = ?").get("tpl_bro-code-dost-hai-ya-namuna");
    assert.ok(savedImg, "template_images row must be persisted with original_filename");
    assert.strictEqual(savedImg.original_filename, "cover.jpg");
  });


  await t.test("TEST 12: Mandatory Name & DOB Enforcement and Default Message/Text Preservation When Uncustomized", async () => {
    const vm = await import("node:vm");
    const zip = new JSZip();
    zip.file("wishmagic.json", JSON.stringify({
      "$schema": "wishmagic-template",
      "schemaVersion": "1.0.0",
      "template": {
        "id": "bro-code-default-preservation",
        "name": "Bro Code Default Preservation",
        "category": "friendship",
        "tier": "free",
        "price": 0,
        "entry": "index.html"
      },
      "fields": [
        { "id": "recipient_name", "type": "text", "label": "Friend Name", "required": true, "defaultValue": "Rohan" },
        { "id": "event_date", "type": "date", "label": "Date of Birth", "required": false, "defaultValue": "2026-12-25" },
        { "id": "custom_message", "type": "textarea", "label": "Main Message", "required": true, "defaultValue": "Tu chahe kitna bhi namuna ho, bhai hamesha rahega!" },
        { "id": "hero_title", "type": "text", "label": "Hero Title", "required": true, "defaultValue": "BRO CODE" },
        { "id": "sender_name", "type": "text", "label": "Sender Name", "required": false, "defaultValue": "Tera Asli Bhai" }
      ]
    }));
    zip.file(
      "index.html",
      "<!DOCTYPE html><html><head><title>Bro Code</title></head><body>" +
      "<h1 data-wm-field=\"hero_title\" data-wm-type=\"text\">BRO CODE</h1>" +
      "<span data-wm-field=\"recipient_name\" data-wm-type=\"text\">Rohan</span>" +
      "<span data-wm-field=\"event_date\" data-wm-type=\"date\">2026-12-25</span>" +
      "<p data-wm-field=\"custom_message\" data-wm-type=\"textarea\">Tu chahe kitna bhi namuna ho, bhai hamesha rahega!</p>" +
      "<span data-wm-field=\"sender_name\" data-wm-type=\"text\">Tera Asli Bhai</span>" +
      "</body></html>"
    );
    const zipBuffer = await zip.generateAsync({ type: "uint8array" });

    const mockDb = {
      prepare() {
        return {
          bind() {
            return {
              async run() { return { success: true }; },
              async first() { return null; },
              async all() { return { results: [] }; }
            };
          }
        };
      }
    };

    const res = await executeB2TemplateIngestPipeline({
      zipBuffer,
      templateMetadata: { name: "Bro Code Default Preservation", category: "Friendship" },
      env: {},
      db: mockDb,
      storageProvider: { bucketName: "test", async putObject({ key }) { return { success: true, key, fileId: "f1" }; } },
      authorId: "admin_ankit"
    });

    assert.strictEqual(res.success, true);
    const byKey = new Map(res.detectedFields.map(f => [f.key, f]));
    assert.strictEqual(byKey.get("recipient_name").isRequired, true, "recipient_name (Name) must be mandatory");
    assert.strictEqual(byKey.get("event_date").isRequired, true, "event_date (DOB) must be mandatory");
    assert.strictEqual(byKey.get("custom_message").isRequired, false, "custom_message must be optional when default text exists");
    assert.strictEqual(byKey.get("hero_title").isRequired, false, "hero_title must be optional when default text exists");
    assert.strictEqual(byKey.get("sender_name").isRequired, false, "sender_name must be optional when default text exists");

    // Verify runtime protocol preserves normal template text when user only enters Name and DOB
    const elementsByField = {
      hero_title: { tagName: "H1", textContent: "BRO CODE", _attrs: { "data-wm-field": "hero_title", "data-wm-type": "text" } },
      recipient_name: { tagName: "SPAN", textContent: "Rohan", _attrs: { "data-wm-field": "recipient_name", "data-wm-type": "text" } },
      event_date: { tagName: "SPAN", textContent: "2026-12-25", _attrs: { "data-wm-field": "event_date", "data-wm-type": "date" } },
      custom_message: { tagName: "P", textContent: "Tu chahe kitna bhi namuna ho, bhai hamesha rahega!", _attrs: { "data-wm-field": "custom_message", "data-wm-type": "textarea" } },
      sender_name: { tagName: "SPAN", textContent: "Tera Asli Bhai", _attrs: { "data-wm-field": "sender_name", "data-wm-type": "text" } }
    };
    Object.values(elementsByField).forEach(el => {
      el.getAttribute = (k) => el._attrs[k] ?? null;
      el.setAttribute = (k, v) => { el._attrs[k] = String(v); };
      el.hasAttribute = (k) => Object.prototype.hasOwnProperty.call(el._attrs, k);
      el.removeAttribute = (k) => { delete el._attrs[k]; };
      el.style = {};
    });

    const sandbox = {
      window: { addEventListener: () => {}, dispatchEvent: () => {} },
      document: {
        readyState: "complete",
        documentElement: { style: { setProperty: () => {} }, setAttribute: () => {}, getAttribute: () => "1.0" },
        body: { setAttribute: () => {}, getAttribute: () => null },
        addEventListener: () => {},
        dispatchEvent: () => {},
        querySelectorAll: (sel) => {
          const m = sel.match(/\[data-wm(?:-field)?="([^"]+)"\]/);
          if (m && elementsByField[m[1]]) return [elementsByField[m[1]]];
          return [];
        }
      },
      CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } }
    };
    sandbox.window.document = sandbox.document;
    sandbox.window.window = sandbox.window;
    const protoCode = fs.readFileSync("public/js/wishmagic-template-protocol.js", "utf8");
    vm.runInContext(protoCode, vm.createContext(sandbox));

    // User only customized recipient_name and event_date, leaving custom_message, hero_title, sender_name empty
    sandbox.window.WishMagicTemplate.applyData({
      recipient_name: "Ankit",
      event_date: "2002-08-15",
      custom_message: "",
      hero_title: "",
      sender_name: ""
    });

    assert.strictEqual(elementsByField.recipient_name.textContent, "Ankit", "Customized Name must update");
    assert.strictEqual(elementsByField.event_date.textContent, "2002-08-15", "Customized DOB/Date must update");
    assert.strictEqual(elementsByField.custom_message.textContent, "Tu chahe kitna bhi namuna ho, bhai hamesha rahega!", "Uncustomized message must stay as normal template message");
    assert.strictEqual(elementsByField.hero_title.textContent, "BRO CODE", "Uncustomized title must stay as normal template text");
    assert.strictEqual(elementsByField.sender_name.textContent, "Tera Asli Bhai", "Uncustomized sender name must stay as normal template text");
  });

});
