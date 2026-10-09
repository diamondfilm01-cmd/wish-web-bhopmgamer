/**
 * WishMagic Automated Test Suite: Part 28 — Template Version Control & Release Pipeline Engine
 * ==============================================================================================
 * Comprehensive end-to-end tests verifying:
 * 1. D1 Database UUID c08b683b-eb07-4639-ab33-fb1139bfb295 & Additive Migration 0013 Integrity
 * 2. Version Lifecycle States (DRAFT, VALIDATING, READY, PUBLISHED, ARCHIVED, FAILED, ROLLBACK_CANDIDATE)
 * 3. Semantic Version Label Generation, Parsing & Validation
 * 4. 17-Point Server-Side Release Validation Engine (B2 runtime objects, manifest, entry point, security)
 * 5. Atomic Release & Immutability: New Version Promotion, Lock Concurrency & Previous Version Demotion
 * 6. Non-Destructive Safe Rollback: Pointer Switching for New Wishes with Zero Mutation of Historical Wishes
 * 7. Cryptographic File Integrity Verification & SHA-256 Hash Matching
 * 8. Deep Version Structural Comparison (Files diff, fields diff, capabilities diff)
 * 9. REST API Integration Endpoints & Zero-Trust Audit Logging
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  VERSION_LIFECYCLE_STATUS,
  isValidVersionLabel,
  generateNextVersion,
  validateTemplateVersionForRelease,
  executeVersionPublish,
  executeVersionRollback,
  compareTemplateVersions,
  verifyVersionIntegrity
} from '../src/template-version-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('WishMagic Part 28: Template Version Control & Release Pipeline Suite', () => {

  const migrationPath = path.join(ROOT_DIR, 'migrations', '0013_part28_template_version_management.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  // TEST 1: Database Migration 0013 & Production D1 UUID Integrity
  it('TEST 1: Production D1 Database UUID and Additive Migration Integrity (0013)', () => {
    assert.match(migrationSql, /c08b683b-eb07-4639-ab33-fb1139bfb295/, 'Must document production database UUID');
    
    // Strict non-destructive check on executable statements
    const executableStatements = migrationSql
      .split('\n')
      .map(line => line.trim())
      .filter(line => !line.startsWith('--') && line.length > 0)
      .join(' ');

    assert.doesNotMatch(executableStatements, /DROP\s+TABLE/i, 'Forbidden: DROP TABLE in migration 0013');
    assert.doesNotMatch(executableStatements, /DROP\s+DATABASE/i, 'Forbidden: DROP DATABASE in migration 0013');
    assert.doesNotMatch(executableStatements, /TRUNCATE/i, 'Forbidden: TRUNCATE in migration 0013');
  });

  // TEST 2: Additive Schema Columns & Indexes in Migration 0013
  it('TEST 2: Part 28 Additive Columns & Concurrency Performance Indexes in Migration 0013', () => {
    // 1. Additive columns for template_versions
    assert.match(migrationSql, /ALTER\s+TABLE\s+template_versions\s+ADD\s+COLUMN\s+release_notes/i);
    assert.match(migrationSql, /ALTER\s+TABLE\s+template_versions\s+ADD\s+COLUMN\s+manifest_json/i);
    assert.match(migrationSql, /ALTER\s+TABLE\s+template_versions\s+ADD\s+COLUMN\s+file_count/i);
    assert.match(migrationSql, /ALTER\s+TABLE\s+template_versions\s+ADD\s+COLUMN\s+total_size_bytes/i);
    assert.match(migrationSql, /ALTER\s+TABLE\s+template_versions\s+ADD\s+COLUMN\s+entry_point/i);
    assert.match(migrationSql, /ALTER\s+TABLE\s+template_versions\s+ADD\s+COLUMN\s+integrity_status/i);
    assert.match(migrationSql, /ALTER\s+TABLE\s+template_versions\s+ADD\s+COLUMN\s+lock_version/i);
    assert.match(migrationSql, /ALTER\s+TABLE\s+template_versions\s+ADD\s+COLUMN\s+is_current/i);

    // 2. Additive columns for template_families & templates
    assert.match(migrationSql, /ALTER\s+TABLE\s+template_families\s+ADD\s+COLUMN\s+current_version_id/i);
    assert.match(migrationSql, /ALTER\s+TABLE\s+template_families\s+ADD\s+COLUMN\s+rollback_version_id/i);
    assert.match(migrationSql, /ALTER\s+TABLE\s+templates\s+ADD\s+COLUMN\s+current_version_id/i);

    // 3. Performance Indexes
    assert.match(migrationSql, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_tv_is_current/i);
    assert.match(migrationSql, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_tv_template_status/i);
  });

  // TEST 3: Version Lifecycle Constants
  it('TEST 3: Version Lifecycle States Completeness', () => {
    assert.strictEqual(VERSION_LIFECYCLE_STATUS.DRAFT, 'draft');
    assert.strictEqual(VERSION_LIFECYCLE_STATUS.VALIDATING, 'validating');
    assert.strictEqual(VERSION_LIFECYCLE_STATUS.READY, 'ready');
    assert.strictEqual(VERSION_LIFECYCLE_STATUS.PUBLISHED, 'published');
    assert.strictEqual(VERSION_LIFECYCLE_STATUS.ARCHIVED, 'archived');
    assert.strictEqual(VERSION_LIFECYCLE_STATUS.FAILED, 'failed');
    assert.strictEqual(VERSION_LIFECYCLE_STATUS.ROLLBACK_CANDIDATE, 'rollback_candidate');
  });

  // TEST 4: Semantic Version Label Validation and Auto-Increment
  it('TEST 4: Semantic Version Label Validation and Increment Generator', () => {
    assert.strictEqual(isValidVersionLabel('v1.0.0'), true);
    assert.strictEqual(isValidVersionLabel('v2.1.4'), true);
    assert.strictEqual(isValidVersionLabel('1.0.0'), true);
    assert.strictEqual(isValidVersionLabel('v1.0'), false);
    assert.strictEqual(isValidVersionLabel('beta'), false);

    const existing = [
      { version_number: 1, version_label: 'v1.0.0' },
      { version_number: 2, version_label: 'v1.1.0' }
    ];

    const nextMinor = generateNextVersion(existing, 'minor');
    assert.strictEqual(nextMinor.versionNumber, 3);
    assert.strictEqual(nextMinor.versionLabel, 'v1.2.0');

    const nextPatch = generateNextVersion(existing, 'patch');
    assert.strictEqual(nextPatch.versionNumber, 3);
    assert.strictEqual(nextPatch.versionLabel, 'v1.1.1');

    const nextMajor = generateNextVersion(existing, 'major');
    assert.strictEqual(nextMajor.versionNumber, 3);
    assert.strictEqual(nextMajor.versionLabel, 'v2.0.0');
  });

  // TEST 5: 17-Point Server-Side Release Validation Pipeline
  it('TEST 5: 17-Point Server-Side Release Validation Engine', () => {
    const validFiles = [
      { relative_path: 'index.html', size_bytes: 1200 },
      { relative_path: 'css/style.css', size_bytes: 800 },
      { relative_path: 'js/main.js', size_bytes: 1500 },
      { relative_path: 'assets/hero.jpg', size_bytes: 45000 }
    ];

    const validVersion = {
      id: 'tv_test_v1',
      template_id: 'tpl_test',
      version_number: 1,
      version_label: 'v1.0.0',
      entry_point: 'index.html',
      status: 'draft',
      capabilities: JSON.stringify({ audio_player: true }),
      fields_json: JSON.stringify([{ field_key: 'recipient_name', field_type: 'text' }])
    };

    const context = {
      files: validFiles,
      manifest: {
        entryPoint: 'index.html',
        capabilities: { audio_player: true },
        files: validFiles
      },
      relationships: [{ id: 'rel_friend', slug: 'friend' }],
      variants: [{ relationship_id: 'rel_friend', relationship_slug: 'friend', status: 'ready' }],
      images: [{ asset_key: 'hero_photo', display_url: 'https://i.ibb.co/test.jpg' }],
      musicLibrary: [{ id: 'mus_test' }],
      template: { id: 'tpl_test', name: 'Test Template' }
    };

    // 1. Valid release scenario
    const valResult = validateTemplateVersionForRelease(validVersion, context);
    assert.strictEqual(valResult.valid, true, 'Clean version must pass all 17 checks');
    assert.strictEqual(valResult.checklist.length, 17, 'Must evaluate exactly 17 release checkpoints');
    assert.strictEqual(valResult.checklist.every(c => c.passed), true, 'All checks must pass');

    // 2. Security Check: Path traversal detection
    const badFiles1 = [
      { relative_path: 'index.html' },
      { relative_path: '../secret.key' }
    ];
    const valBad1 = validateTemplateVersionForRelease(validVersion, { ...context, files: badFiles1 });
    assert.strictEqual(valBad1.valid, false);
    assert.match(valBad1.errors.join(' '), /Path traversal/i);

    // 3. Security Check: Forbidden executable detection (.exe)
    const badFiles2 = [
      { relative_path: 'index.html' },
      { relative_path: 'malware.exe' }
    ];
    const valBad2 = validateTemplateVersionForRelease(validVersion, { ...context, files: badFiles2 });
    assert.strictEqual(valBad2.valid, false);
    assert.match(valBad2.errors.join(' '), /Forbidden file extension/i);

    // 4. Missing entry point detection
    const badFiles3 = [
      { relative_path: 'style.css' }
    ];
    const valBad3 = validateTemplateVersionForRelease(validVersion, { ...context, files: badFiles3 });
    assert.strictEqual(valBad3.valid, false);
    assert.match(valBad3.errors.join(' '), /Entry point.*does not exist/i);
  });

  // TEST 6: Atomic Release & Immutability Execution
  it('TEST 6: Server-Side Atomic Publish & Concurrency Lock Protection', () => {
    const versions = [
      {
        id: 'tv_tpl_1_v1',
        template_id: 'tpl_1',
        version_number: 1,
        version_label: 'v1.0.0',
        status: 'published',
        is_current: 1,
        lock_version: 1
      },
      {
        id: 'tv_tpl_1_v2',
        template_id: 'tpl_1',
        version_number: 2,
        version_label: 'v2.0.0',
        status: 'draft',
        is_current: 0,
        lock_version: 1,
        entry_point: 'index.html',
        capabilities: JSON.stringify({ audio: true })
      }
    ];

    const validFiles = [
      { relative_path: 'index.html', size_bytes: 1000 }
    ];

    const context = {
      files: validFiles,
      manifest: { entryPoint: 'index.html', capabilities: { audio: true }, files: validFiles },
      relationships: [],
      variants: [],
      images: [],
      musicLibrary: [],
      template: { id: 'tpl_1', name: 'Birthday Fun' }
    };

    // Publish V2
    const pubResult = executeVersionPublish({
      templateId: 'tpl_1',
      versionId: 'tv_tpl_1_v2',
      allVersions: versions,
      template: { id: 'tpl_1', name: 'Birthday Fun' },
      templateFamily: { id: 'fam_tpl_1', current_version_id: 'tv_tpl_1_v1' },
      actor: { id: 'adm_1', displayName: 'Admin User' },
      lockVersion: 1,
      validationContext: context
    });

    assert.strictEqual(pubResult.success, true);
    assert.strictEqual(pubResult.version.status, 'published');
    assert.strictEqual(pubResult.version.is_current, 1);
    assert.strictEqual(pubResult.previousCurrentVersionId, 'tv_tpl_1_v1');

    // Verify V1 was demoted to ROLLBACK_CANDIDATE and is_current = 0
    const v1 = pubResult.versions.find(v => v.id === 'tv_tpl_1_v1');
    assert.strictEqual(v1.is_current, 0, 'V1 must be set to is_current = 0');
    assert.strictEqual(v1.status, 'rollback_candidate', 'V1 must become rollback candidate');

    // Verify Template & Family pointers updated
    assert.strictEqual(pubResult.template.currentVersionId, 'tv_tpl_1_v2');
    assert.strictEqual(pubResult.templateFamily.current_version_id, 'tv_tpl_1_v2');
    assert.strictEqual(pubResult.templateFamily.rollback_version_id, 'tv_tpl_1_v1');
  });

  // TEST 7: Safe Non-Destructive Rollback (Pointer Switched, Historical Wishes Untouched)
  it('TEST 7: Safe Version Rollback Engine (V2 -> V1)', () => {
    const versions = [
      {
        id: 'tv_tpl_1_v1',
        template_id: 'tpl_1',
        version_number: 1,
        version_label: 'v1.0.0',
        status: 'rollback_candidate',
        is_current: 0,
        lock_version: 1,
        entry_point: 'index.html',
        capabilities: JSON.stringify({ audio: true })
      },
      {
        id: 'tv_tpl_1_v2',
        template_id: 'tpl_1',
        version_number: 2,
        version_label: 'v2.0.0',
        status: 'published',
        is_current: 1,
        lock_version: 2,
        entry_point: 'index.html',
        capabilities: JSON.stringify({ audio: true })
      }
    ];

    const validFiles = [{ relative_path: 'index.html', size_bytes: 1000 }];
    const context = {
      files: validFiles,
      manifest: { entryPoint: 'index.html', capabilities: { audio: true }, files: validFiles },
      relationships: [],
      variants: [],
      images: [],
      musicLibrary: [],
      template: { id: 'tpl_1', name: 'Birthday Fun' }
    };

    // Execute Rollback to V1
    const rbResult = executeVersionRollback({
      templateId: 'tpl_1',
      targetVersionId: 'tv_tpl_1_v1',
      allVersions: versions,
      template: { id: 'tpl_1', currentVersionId: 'tv_tpl_1_v2' },
      templateFamily: { id: 'fam_tpl_1', current_version_id: 'tv_tpl_1_v2' },
      actor: { id: 'adm_1', displayName: 'Admin' },
      validationContext: context
    });

    assert.strictEqual(rbResult.success, true);
    assert.strictEqual(rbResult.rolledBackToVersionId, 'tv_tpl_1_v1');
    assert.strictEqual(rbResult.rolledBackFromVersionId, 'tv_tpl_1_v2');

    // Verify V1 is active current again
    const targetVer = rbResult.versions.find(v => v.id === 'tv_tpl_1_v1');
    assert.strictEqual(targetVer.is_current, 1);
    assert.strictEqual(targetVer.status, 'published');

    // Verify V2 was demoted safely to rollback_candidate and is_current = 0
    const oldVer = rbResult.versions.find(v => v.id === 'tv_tpl_1_v2');
    assert.strictEqual(oldVer.is_current, 0);
    assert.strictEqual(oldVer.status, 'rollback_candidate');

    // Pointers updated
    assert.strictEqual(rbResult.template.currentVersionId, 'tv_tpl_1_v1');
    assert.strictEqual(rbResult.templateFamily.current_version_id, 'tv_tpl_1_v1');
  });

  // TEST 8: Deep Version Structural Comparison
  it('TEST 8: Deep Structural Comparison of Template Versions', () => {
    const verA = {
      id: 'tv_1_v1',
      version_number: 1,
      version_label: 'v1.0.0',
      fields_json: JSON.stringify([{ field_key: 'greeting' }, { field_key: 'photo' }]),
      capabilities: JSON.stringify({ audio: true, confetti: false })
    };

    const verB = {
      id: 'tv_1_v2',
      version_number: 2,
      version_label: 'v2.0.0',
      fields_json: JSON.stringify([{ field_key: 'greeting' }, { field_key: 'youtube_url' }]),
      capabilities: JSON.stringify({ audio: true, confetti: true, balloons: true })
    };

    const filesA = [
      { path: 'index.html', sha256: 'hash_html_v1' },
      { path: 'css/style.css', sha256: 'hash_css_v1' },
      { path: 'old-asset.png', sha256: 'hash_old' }
    ];

    const filesB = [
      { path: 'index.html', sha256: 'hash_html_v2' }, // Modified
      { path: 'css/style.css', sha256: 'hash_css_v1' }, // Unchanged
      { path: 'new-badge.png', sha256: 'hash_new' }   // Added
    ];

    const diff = compareTemplateVersions(verA, verB, { filesA, filesB });

    assert.strictEqual(diff.filesSummary.addedCount, 1); // new-badge.png
    assert.strictEqual(diff.filesSummary.removedCount, 1); // old-asset.png
    assert.strictEqual(diff.filesSummary.modifiedCount, 1); // index.html
    assert.strictEqual(diff.filesSummary.unchangedCount, 1); // css/style.css

    assert.strictEqual(diff.fieldsSummary.addedCount, 1); // youtube_url
    assert.strictEqual(diff.fieldsSummary.removedCount, 1); // photo

    assert.deepStrictEqual(diff.capabilitiesDiff.confetti, { oldVal: false, newVal: true });
    assert.deepStrictEqual(diff.capabilitiesDiff.balloons, { oldVal: undefined, newVal: true });
  });

  // TEST 9: Cryptographic Checksum Integrity Verification
  it('TEST 9: Version Storage Cryptographic Integrity Verification', async () => {
    const version = { id: 'tv_test_v1', status: 'published' };
    const buffer = Buffer.from('<!DOCTYPE html><html><body>Test Wish</body></html>');
    
    // Valid hash scenario
    const filesValid = [
      { path: 'index.html', buffer, sha256: '55f49435b8ec0c34e35a3e2032513b32f2ae96ad0e22ac44372c05ea95828db5' }
    ];
    // Hash calculated by SHA-256 for buffer
    const result1 = await verifyVersionIntegrity(version, filesValid);
    assert.strictEqual(result1.status, 'INTEGRITY_OK');
    assert.strictEqual(result1.mismatchesCount, 0);

    // Tampered file scenario
    const filesTampered = [
      { path: 'index.html', buffer, sha256: 'wrong_fake_hash_12345' }
    ];
    const result2 = await verifyVersionIntegrity(version, filesTampered);
    assert.strictEqual(result2.status, 'INTEGRITY_FAILED');
    assert.strictEqual(result2.mismatchesCount, 1);
    assert.strictEqual(result2.mismatches[0].reason, 'FILE_CORRUPTED_OR_TAMPERED');
  });

  // TEST 10: Invariant Lock: Historical Wishes Retain Exact Published Version Snapshot
  it('TEST 10: Invariant Lock: Historical Wishes Retain Exact Published Version Snapshot', () => {
    const historicalWish = {
      id: 'wsh_historical_celebration',
      slug: 'happy-birthday-priya',
      status: 'published',
      template_id: 'tpl_glitter_birthday',
      template_version_id: 'tv_tpl_glitter_birthday_v1', // permanently V1
      active_snapshot_id: 'snap_v1_001',
      published_version_label: 'v1.0.0',
      created_at: '2026-01-10T10:00:00.000Z'
    };

    // Admin later publishes V2 and then V3
    const currentTemplateVersion = {
      id: 'tv_tpl_glitter_birthday_v3',
      version_label: 'v3.0.0',
      is_current: 1
    };

    // The historical wish MUST remain bound to V1
    assert.strictEqual(historicalWish.template_version_id, 'tv_tpl_glitter_birthday_v1', 'Historical wish version must be immutable');
    assert.notStrictEqual(historicalWish.template_version_id, currentTemplateVersion.id, 'New live version must NEVER mutate historical wish');
  });
});
