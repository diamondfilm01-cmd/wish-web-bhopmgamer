/**
 * Automated Test Suite for WishMagic Universal Template Protocol (UTP) (Part 2)
 * ==============================================================================
 * Tests:
 * 1. Schema constants and identifiers (Protocol Name, Schema Version, Runtime Version)
 * 2. Manifest normalization (Canonical UTP vs Legacy v1.0 adaptors)
 * 3. Schema validation: Valid manifest passes
 * 4. Schema validation: Rejection of missing required properties (template.id, template.name)
 * 5. Schema validation: Rejection of invalid template ID characters
 * 6. Schema validation: Rejection of invalid semver version labels
 * 7. Schema validation: Rejection of duplicate field IDs
 * 8. Schema validation: Rejection of unsupported field types
 * 9. Schema validation: Rejection of impossible constraints (min > max)
 * 10. Schema validation: Incompatible Runtime API version detection
 * 11. Schema validation: Missing declared package assets detection
 * 12. End-to-end Ingestion Pipeline integration with UTP validation
 * 13. Forward Migration 0027 integrity & preserved production D1 UUID
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

import {
  UTP_PROTOCOL_NAME,
  UTP_SCHEMA_VERSION,
  UTP_RUNTIME_API_VERSION,
  UTP_SUPPORTED_FIELD_TYPES,
  UTP_CAPABILITY_REGISTRY,
  isValidSemver,
  isValidIdentifier
} from '../src/template-protocol-schema.js';

import {
  validateUtpManifest,
  normalizeManifestToUtp
} from '../src/template-protocol-validator.js';

import {
  executeB2TemplateIngestPipeline
} from '../src/template-ingest-pipeline.js';

test('Part 2 — Universal Template Protocol (UTP) Specification & Validator Suite', async (t) => {

  await t.test('TEST 1: Protocol Schema Constants and Identifiers Integrity', () => {
    assert.strictEqual(UTP_PROTOCOL_NAME, 'wishmagic-template');
    assert.strictEqual(UTP_SCHEMA_VERSION, '1.0.0');
    assert.strictEqual(UTP_RUNTIME_API_VERSION, '1.0');
    assert.ok(UTP_SUPPORTED_FIELD_TYPES.has('text'));
    assert.ok(UTP_SUPPORTED_FIELD_TYPES.has('image'));
    assert.ok(UTP_SUPPORTED_FIELD_TYPES.has('audio'));
    assert.ok(Boolean(UTP_CAPABILITY_REGISTRY.photos));
    assert.ok(Boolean(UTP_CAPABILITY_REGISTRY.music));
  });

  await t.test('TEST 2: Semver & Identifier Validation Logic', () => {
    assert.strictEqual(isValidSemver('1.0.0'), true);
    assert.strictEqual(isValidSemver('v2.1.0'), true);
    assert.strictEqual(isValidSemver('invalid-version'), false);
    assert.strictEqual(isValidSemver('1.0'), false);

    assert.strictEqual(isValidIdentifier('romantic-scrapbook'), true);
    assert.strictEqual(isValidIdentifier('tpl_bday_01'), true);
    assert.strictEqual(isValidIdentifier('invalid id with spaces!'), false);
  });

  await t.test('TEST 3: Legacy Manifest Normalization to Canonical UTP', () => {
    const legacyManifest = {
      protocol: '1.0',
      type: 'wish-template',
      template: {
        id: 'tpl_glitter_birthday',
        title: 'Glitter Birthday Bash 3D',
        category: 'birthday'
      },
      capabilities: {
        photos: true,
        music: true,
        video: false
      }
    };

    const normalized = normalizeManifestToUtp(legacyManifest);
    assert.strictEqual(normalized.protocol, 'wishmagic-template');
    assert.strictEqual(normalized.schemaVersion, '1.0.0');
    assert.strictEqual(normalized.template.id, 'tpl_glitter_birthday');
    assert.strictEqual(normalized.template.name, 'Glitter Birthday Bash 3D');
    assert.ok(normalized.capabilities.includes('photos'));
    assert.ok(normalized.capabilities.includes('music'));
    assert.ok(!normalized.capabilities.includes('video'));
  });

  await t.test('TEST 4: Valid Manifest Passes Server-Side Validation', () => {
    const validManifest = {
      protocol: 'wishmagic-template',
      schemaVersion: '1.0.0',
      template: {
        id: 'starlit-anniversary',
        name: 'Starlit Anniversary Keepsake',
        description: 'Constellation memory celebration',
        templateVersion: '1.0.0',
        category: 'anniversary'
      },
      compatibility: {
        runtimeApi: '1.0'
      },
      fields: [
        {
          id: 'partner_name',
          type: 'text',
          label: 'Partner Name',
          required: true,
          constraints: { minLength: 1, maxLength: 50 }
        },
        {
          id: 'anniversary_date',
          type: 'date',
          label: 'Anniversary Date',
          required: true
        }
      ],
      sections: [
        { id: 'hero', label: 'Main Hero', required: true, toggleable: false }
      ],
      capabilities: ['photos', 'animations', 'themes']
    };

    const report = validateUtpManifest(validManifest);
    assert.strictEqual(report.valid, true);
    assert.strictEqual(report.publishable, true);
    assert.strictEqual(report.summary.errors, 0);
  });

  await t.test('TEST 5: Manifest Rejection on Missing ID or Name', () => {
    const invalidManifest = {
      protocol: 'wishmagic-template',
      schemaVersion: '1.0.0',
      template: {
        id: '',
        name: ''
      }
    };

    const report = validateUtpManifest(invalidManifest);
    assert.strictEqual(report.valid, false);
    assert.ok(report.issues.some(i => i.code === 'MISSING_TEMPLATE_ID'));
    assert.ok(report.issues.some(i => i.code === 'MISSING_TEMPLATE_NAME'));
  });

  await t.test('TEST 6: Manifest Rejection on Duplicate Field IDs', () => {
    const duplicateFieldsManifest = {
      protocol: 'wishmagic-template',
      schemaVersion: '1.0.0',
      template: {
        id: 'test-dup-fields',
        name: 'Test Duplicate Fields',
        templateVersion: '1.0.0'
      },
      fields: [
        { id: 'user_message', type: 'text', label: 'Message 1' },
        { id: 'user_message', type: 'textarea', label: 'Message 2' }
      ]
    };

    const report = validateUtpManifest(duplicateFieldsManifest);
    assert.strictEqual(report.valid, false);
    assert.ok(report.issues.some(i => i.code === 'DUPLICATE_FIELD_ID'));
  });

  await t.test('TEST 7: Manifest Rejection on Unsupported Field Types', () => {
    const unsupportedTypeManifest = {
      protocol: 'wishmagic-template',
      schemaVersion: '1.0.0',
      template: {
        id: 'test-unsupported',
        name: 'Test Unsupported',
        templateVersion: '1.0.0'
      },
      fields: [
        { id: 'unknown_slot', type: 'holographic-projection', label: 'Slot' }
      ]
    };

    const report = validateUtpManifest(unsupportedTypeManifest);
    assert.strictEqual(report.valid, false);
    assert.ok(report.issues.some(i => i.code === 'UNSUPPORTED_FIELD_TYPE'));
  });

  await t.test('TEST 8: Manifest Rejection on Incompatible Future Runtime API', () => {
    const futureApiManifest = {
      protocol: 'wishmagic-template',
      schemaVersion: '1.0.0',
      template: {
        id: 'future-template',
        name: 'Future Template',
        templateVersion: '1.0.0'
      },
      compatibility: {
        minimumRuntimeApi: '9.0' // Higher than current platform 1.0
      }
    };

    const report = validateUtpManifest(futureApiManifest);
    assert.strictEqual(report.valid, false);
    assert.ok(report.issues.some(i => i.code === 'INCOMPATIBLE_RUNTIME_API'));
  });

  await t.test('TEST 9: Missing Declared Archive Asset Generates Issue', () => {
    const filesMap = new Map();
    filesMap.set('index.html', { content: new Uint8Array([1, 2, 3]) });

    const assetManifest = {
      protocol: 'wishmagic-template',
      schemaVersion: '1.0.0',
      template: {
        id: 'asset-test',
        name: 'Asset Test',
        templateVersion: '1.0.0',
        entry: 'index.html'
      },
      assets: [
        { path: 'assets/images/missing-sparkle.png', required: true }
      ]
    };

    const report = validateUtpManifest(assetManifest, { filesMap, entryFile: 'index.html' });
    assert.strictEqual(report.valid, false);
    assert.ok(report.issues.some(i => i.code === 'ASSET_NOT_FOUND'));
  });

  await t.test('TEST 10: Ingestion Pipeline Rejects Package with Corrupt Manifest JSON', async () => {
    const zip = new JSZip();
    zip.file('index.html', '<html><body><h1 data-wm-field="rec_name">Wish</h1></body></html>');
    zip.file('wishmagic.json', '{ this is invalid json !!!');

    const zipBytes = await zip.generateAsync({ type: 'uint8array' });

    const fakeB2Provider = {
      bucketName: 'wishmagic-templates',
      putObject: async () => ({ fileId: 'b2_file_mock' }),
      deleteObject: async () => ({ deleted: true })
    };

    const res = await executeB2TemplateIngestPipeline({
      zipBuffer: zipBytes,
      storageProvider: fakeB2Provider,
      templateMetadata: { name: 'Corrupt Test' }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'INVALID_MANIFEST_JSON');
  });

  await t.test('TEST 11: Ingestion Pipeline Validates & Merges UTP Manifest with Live Archive', async () => {
    const zip = new JSZip();
    zip.file('index.html', '<html><head><title>Romantic Surprise</title></head><body><h1 data-wm-field="recipient_name">Dear Love</h1></body></html>');
    zip.file('wishmagic.json', JSON.stringify({
      protocol: 'wishmagic-template',
      schemaVersion: '1.0.0',
      template: {
        id: 'romantic-surprise',
        name: 'Romantic Surprise 3D',
        templateVersion: '1.0.0',
        category: 'love'
      },
      fields: [
        { id: 'recipient_name', type: 'text', label: 'Recipient Name', required: true },
        { id: 'secret_letter', type: 'textarea', label: 'Secret Letter', required: false }
      ],
      capabilities: ['photos', 'music', 'animations']
    }));

    const zipBytes = await zip.generateAsync({ type: 'uint8array' });

    const fakeB2Provider = {
      bucketName: 'wishmagic-templates',
      putObject: async () => ({ fileId: 'b2_file_mock_123' }),
      deleteObject: async () => ({ deleted: true })
    };

    const res = await executeB2TemplateIngestPipeline({
      zipBuffer: zipBytes,
      storageProvider: fakeB2Provider,
      templateMetadata: { name: 'Romantic Surprise 3D' }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.protocol.schemaVersion, '1.0.0');
    assert.strictEqual(res.protocol.runtimeApi, '1.0');
    assert.ok(res.validationReport && res.validationReport.valid);
    assert.ok(res.detectedFields.some(f => f.key === 'recipient_name'));
    assert.ok(res.detectedFields.some(f => f.key === 'secret_letter'));
  });

  await t.test('TEST 12: Production D1 Database UUID and Additive Migration Integrity (0027)', () => {
    const migrationFile = 'migrations/0027_part2_universal_template_protocol.sql';
    assert.ok(fs.existsSync(migrationFile), 'Migration 0027 must exist');

    const sql = fs.readFileSync(migrationFile, 'utf8');
    assert.ok(sql.includes('c08b683b-eb07-4639-ab33-fb1139bfb295'), 'Must reference preserved production D1 UUID');
    const cleanSql = sql.replace(/--.*$/gm, '');
    assert.ok(!/\bDROP\s+TABLE\b/i.test(cleanSql), 'Must NOT drop any tables');
    assert.ok(!/\bDROP\s+DATABASE\b/i.test(cleanSql), 'Must NOT drop database');
    assert.ok(!/\bTRUNCATE\b/i.test(cleanSql), 'Must NOT truncate data');

    assert.ok(sql.includes('ALTER TABLE template_versions ADD COLUMN protocol_version TEXT'), 'Additive protocol_version column');
    assert.ok(sql.includes('ALTER TABLE template_versions ADD COLUMN schema_version TEXT'), 'Additive schema_version column');
    assert.ok(sql.includes('ALTER TABLE template_versions ADD COLUMN runtime_api_version TEXT'), 'Additive runtime_api_version column');
    assert.ok(sql.includes('ALTER TABLE template_versions ADD COLUMN validation_report_json TEXT'), 'Additive validation_report_json column');
  });

});
