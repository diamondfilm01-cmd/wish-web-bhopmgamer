/**
 * WishMagic Automated Test Suite: Part 29 — Storage Health, Orphan Detection & Recovery
 * =====================================================================================
 * Comprehensive end-to-end test suite verifying:
 * 1. Migration 0014 schema integrity, tables & additive columns
 * 2. Explicit health status enum completeness
 * 3. Real B2 provider object health verification via HEAD
 * 4. Published template version B2 integrity (missing file -> INTEGRITY_FAILED)
 * 5. Music asset B2 verification (missing audio -> MUSIC_ASSET_MISSING, protected if in wish)
 * 6. ImgBB image verification via probe (404 -> MISSING, probe down -> VERIFICATION_UNAVAILABLE)
 * 7. Hard invariant protection safeguards: published wishes & templates can NEVER be deleted
 * 8. Multi-cloud orphan detection (B2, ImgBB, and D1 ghost records)
 * 9. Safe cleanup pipeline with dry-run support & zero protected asset mutation
 * 10. Quarantine isolation & one-click recovery engine
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STORAGE_HEALTH_STATUS,
  ASSET_TYPES,
  evaluateAssetProtection,
  verifyB2ObjectHealth,
  verifyImgBBImageHealth,
  auditTemplateVersionsIntegrity,
  auditMusicAssetsIntegrity,
  auditImageAssetsHealth,
  detectStorageOrphans,
  executeSafeCleanup,
  restoreQuarantinedAsset,
  generateComprehensiveStorageHealthReport
} from '../src/storage-health-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('WishMagic Part 29: Storage Health & Orphan Recovery Suite', () => {

  test('TEST 1: Production D1 Migration 0014 Schema & Additive Integrity', () => {
    const migrationPath = path.join(ROOT_DIR, 'migrations', '0014_part29_storage_health_and_orphan_cleanup.sql');
    assert.ok(fs.existsSync(migrationPath), 'Migration 0014 must exist');

    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Invariant: Database UUID preserved
    assert.ok(sql.includes('c08b683b-eb07-4639-ab33-fb1139bfb295'), 'Must preserve production D1 UUID');

    // Required tables
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS storage_health_audits'), 'Must create storage_health_audits');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS storage_cleanup_jobs'), 'Must create storage_cleanup_jobs');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS storage_quarantine'), 'Must create storage_quarantine');

    // Additive columns
    assert.ok(sql.includes('ALTER TABLE template_images ADD COLUMN health_status'), 'template_images.health_status required');
    assert.ok(sql.includes('ALTER TABLE music_library ADD COLUMN health_status'), 'music_library.health_status required');
    assert.ok(sql.includes('ALTER TABLE wish_media ADD COLUMN health_status'), 'wish_media.health_status required');

    // Indexes
    assert.ok(sql.includes('idx_storage_health_audits_status'), 'Index on audits status required');
    assert.ok(sql.includes('idx_storage_quarantine_asset'), 'Index on quarantine asset required');
  });

  test('TEST 2: Explicit Health Statuses Completeness', () => {
    const requiredStatuses = [
      'HEALTHY',
      'MISSING',
      'ORPHANED',
      'BROKEN_REFERENCE',
      'UPLOAD_FAILED',
      'VERIFYING',
      'CLEANUP_PENDING',
      'PROTECTED',
      'ARCHIVED',
      'UNKNOWN',
      'VERIFICATION_UNAVAILABLE',
      'INTEGRITY_FAILED',
      'MUSIC_ASSET_MISSING'
    ];

    for (const st of requiredStatuses) {
      assert.equal(STORAGE_HEALTH_STATUS[st], st, `STORAGE_HEALTH_STATUS must define ${st}`);
    }
  });

  test('TEST 3: Real B2 Provider Object Health Check via HEAD', async () => {
    // Mock B2 provider implementing headObject
    const mockB2 = {
      headObject: async ({ key }) => {
        if (key === 'templates/fam_magical/versions/v1.0.0/source/template.zip') {
          return {
            exists: true,
            status: 200,
            key,
            contentLength: 1048576,
            contentType: 'application/zip',
            fileId: 'b2_file_001',
            sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709'
          };
        }
        if (key === 'templates/fam_broken/versions/v1.0.0/source/template.zip') {
          return {
            exists: true,
            status: 200,
            key,
            contentLength: 500, // size mismatch
            fileId: 'b2_file_002',
            sha1: 'wrong_sha1'
          };
        }
        return { exists: false, status: 404, key };
      }
    };

    // Case 1: Healthy existing object
    const healthyCheck = await verifyB2ObjectHealth({
      b2Provider: mockB2,
      key: 'templates/fam_magical/versions/v1.0.0/source/template.zip',
      expectedSize: 1048576,
      expectedSha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709'
    });
    assert.equal(healthyCheck.healthy, true);
    assert.equal(healthyCheck.status, STORAGE_HEALTH_STATUS.HEALTHY);
    assert.equal(healthyCheck.fileId, 'b2_file_001');

    // Case 2: Missing object in B2
    const missingCheck = await verifyB2ObjectHealth({
      b2Provider: mockB2,
      key: 'templates/fam_nonexistent/file.zip'
    });
    assert.equal(missingCheck.healthy, false);
    assert.equal(missingCheck.status, STORAGE_HEALTH_STATUS.MISSING);

    // Case 3: Integrity failure (size mismatch)
    const mismatchCheck = await verifyB2ObjectHealth({
      b2Provider: mockB2,
      key: 'templates/fam_broken/versions/v1.0.0/source/template.zip',
      expectedSize: 999999
    });
    assert.equal(mismatchCheck.healthy, false);
    assert.equal(mismatchCheck.status, STORAGE_HEALTH_STATUS.INTEGRITY_FAILED);
  });

  test('TEST 4: Template B2 Objects Verification (Missing file -> INTEGRITY_FAILED)', async () => {
    const mockB2 = {
      headObject: async ({ key }) => {
        // v1 has all files
        if (key.includes('v1.0.0')) return { exists: true, status: 200, contentLength: 5000 };
        // v2 is missing index.html
        if (key.includes('v2.0.0') && key.endsWith('index.html')) return { exists: false, status: 404 };
        if (key.includes('v2.0.0')) return { exists: true, status: 200, contentLength: 5000 };
        return { exists: false, status: 404 };
      }
    };

    const templates = [{ id: 'fam_test', name: 'Test Family', status: 'active' }];
    const templateVersions = [
      { id: 'tv_1', template_id: 'fam_test', version_label: 'v1.0.0', status: 'published', is_current: 1 },
      { id: 'tv_2', template_id: 'fam_test', version_label: 'v2.0.0', status: 'published', is_current: 0 }
    ];

    const audit = await auditTemplateVersionsIntegrity({
      templates,
      templateVersions,
      b2Provider: mockB2
    });

    assert.equal(audit.totalVersions, 2);
    assert.equal(audit.healthyVersions, 1);
    assert.equal(audit.failedVersions, 1);

    const v2Audit = audit.versionAudits.find(a => a.versionLabel === 'v2.0.0');
    assert.ok(v2Audit, 'v2 audit must exist');
    assert.equal(v2Audit.status, STORAGE_HEALTH_STATUS.INTEGRITY_FAILED, 'Published version with missing file must be INTEGRITY_FAILED');
    assert.equal(v2Audit.integrityFailed, true);
  });

  test('TEST 5: Music B2 Objects Verification (Missing track -> MUSIC_ASSET_MISSING)', async () => {
    const mockB2 = {
      headObject: async ({ key }) => {
        if (key.includes('celebration-strings')) return { exists: true, status: 200, contentLength: 2500000 };
        return { exists: false, status: 404 }; // golden nostalgia is missing
      }
    };

    const musicList = [
      { id: 'mus_strings', title: 'Celebration Strings', storageProvider: 'b2', playbackUrl: 'https://b2.com/celebration-strings.mp3', status: 'active' },
      { id: 'mus_golden', title: 'Golden Nostalgia', storageProvider: 'b2', playbackUrl: 'https://b2.com/golden-nostalgia.mp3', status: 'active' }
    ];

    // Wish that depends on golden nostalgia
    const wishes = [
      { id: 'wsh_pub_1', title: 'Grand Celebration', status: 'published', isPublished: 1, customData: { musicId: 'mus_golden' } }
    ];

    const musicAudit = await auditMusicAssetsIntegrity({
      musicList,
      wishes,
      b2Provider: mockB2
    });

    assert.equal(musicAudit.healthyMusic, 1);
    assert.equal(musicAudit.missingMusic, 1);

    const goldenTrack = musicAudit.musicAudits.find(m => m.id === 'mus_golden');
    assert.ok(goldenTrack);
    assert.equal(goldenTrack.status, STORAGE_HEALTH_STATUS.MUSIC_ASSET_MISSING);
    assert.equal(goldenTrack.isProtected, true, 'Track referenced by published wish must be marked protected');
  });

  test('TEST 6: ImgBB Image Verification Probes (404 -> MISSING, Down -> VERIFICATION_UNAVAILABLE)', async () => {
    const mockFetch = async (url) => {
      if (url.includes('404.jpg')) {
        return { ok: false, status: 404, headers: new Map() };
      }
      if (url.includes('timeout.jpg')) {
        throw new Error('Connection refused / timeout');
      }
      return {
        ok: true,
        status: 200,
        headers: new Map([
          ['content-type', 'image/jpeg'],
          ['content-length', '204800']
        ])
      };
    };

    // Case 1: Healthy image
    const healthyProbe = await verifyImgBBImageHealth({
      url: 'https://i.ibb.co/live/sample.jpg',
      providerAssetId: 'img_001',
      fetchFn: mockFetch
    });
    assert.equal(healthyProbe.healthy, true);
    assert.equal(healthyProbe.status, STORAGE_HEALTH_STATUS.HEALTHY);

    // Case 2: 404 Missing image
    const missingProbe = await verifyImgBBImageHealth({
      url: 'https://i.ibb.co/live/404.jpg',
      providerAssetId: 'img_404',
      fetchFn: mockFetch
    });
    assert.equal(missingProbe.healthy, false);
    assert.equal(missingProbe.status, STORAGE_HEALTH_STATUS.MISSING);

    // Case 3: Network probe failed -> VERIFICATION_UNAVAILABLE (NEVER fake healthy)
    const unavailProbe = await verifyImgBBImageHealth({
      url: 'https://i.ibb.co/live/timeout.jpg',
      providerAssetId: 'img_timeout',
      fetchFn: mockFetch
    });
    assert.equal(unavailProbe.healthy, null);
    assert.equal(unavailProbe.status, STORAGE_HEALTH_STATUS.VERIFICATION_UNAVAILABLE);
  });

  test('TEST 7: Hard Invariant Protection Safeguards (Published Wishes & Templates cannot be deleted)', () => {
    const wishes = [
      { id: 'wsh_pub_100', title: 'Priya & Ankit Wedding', status: 'published', isPublished: 1, customData: { photos: ['https://i.ibb.co/wedding.jpg'] } },
      { id: 'wsh_draft_200', title: 'Draft Birthday', status: 'draft', isPublished: 0, customData: {} }
    ];

    const templateVersions = [
      { id: 'tv_pub_v1', template_id: 'fam_memories', version_label: 'v1.0.0', status: 'published', is_current: 1 },
      { id: 'tv_draft_v2', template_id: 'fam_memories', version_label: 'v2.0.0', status: 'draft', is_current: 0 }
    ];

    const wishMediaMappings = [
      { wish_id: 'wsh_pub_100', media_id: 'med_pub_asset' }
    ];

    // Case 1: Asset referenced by published wish -> PROTECTED
    const protCheck1 = evaluateAssetProtection({
      assetId: 'med_pub_asset',
      url: 'https://i.ibb.co/wedding.jpg',
      wishes,
      templateVersions,
      wishMediaMappings
    });
    assert.equal(protCheck1.isProtected, true, 'Published wish asset must be protected');
    assert.ok(protCheck1.dependencies.publishedWishCount >= 1);

    // Case 2: Asset referenced by published template version -> PROTECTED
    const protCheck2 = evaluateAssetProtection({
      assetId: 'tv_pub_v1',
      storageKey: 'templates/fam_memories/versions/v1.0.0/source/template.zip',
      wishes,
      templateVersions,
      wishMediaMappings
    });
    assert.equal(protCheck2.isProtected, true, 'Published template version must be protected');
    assert.ok(protCheck2.dependencies.publishedVersionCount >= 1);

    // Case 3: Completely unreferenced orphan asset -> NOT PROTECTED
    const unprotCheck = evaluateAssetProtection({
      assetId: 'med_orphan_random_999',
      url: 'https://i.ibb.co/orphan-random.jpg',
      wishes,
      templateVersions,
      wishMediaMappings
    });
    assert.equal(unprotCheck.isProtected, false, 'Unreferenced orphan must NOT be protected');
  });

  test('TEST 8: Multi-Cloud Orphan Detection Engine (detectStorageOrphans)', async () => {
    const templates = [{ id: 'fam_active', name: 'Active Family', status: 'active' }];
    const templateVersions = [{ id: 'tv_1', template_id: 'fam_active', version_label: 'v1.0.0', status: 'published' }];
    const wishes = [{ id: 'wsh_1', title: 'Active Wish', status: 'published', isPublished: 1 }];
    const wishMediaMappings = [{ wish_id: 'wsh_1', media_id: 'med_linked' }];

    // Template images: 1 active, 1 orphan (template fam_deleted does not exist)
    const templateImages = [
      { id: 'ti_active', template_id: 'fam_active', url: 'https://i.ibb.co/active.jpg', status: 'active' },
      { id: 'ti_orphan', template_id: 'fam_deleted', url: 'https://i.ibb.co/orphan-tpl.jpg', status: 'active', size_bytes: 45000 }
    ];

    // Wish media: 1 linked, 1 orphan (wish_id wsh_deleted does not exist)
    const wishMediaList = [
      { id: 'med_linked', wish_id: 'wsh_1', url: 'https://i.ibb.co/linked.jpg', status: 'active', size_bytes: 120000 },
      { id: 'med_orphan', wish_id: 'wsh_deleted', url: 'https://i.ibb.co/orphan-user.jpg', status: 'active', size_bytes: 85000 }
    ];

    const orphansResult = await detectStorageOrphans({
      templates,
      templateVersions,
      musicList: [],
      templateImages,
      wishMediaList,
      wishMediaMappings,
      wishes,
      b2Provider: null
    });

    assert.equal(orphansResult.totalOrphans, 2, 'Should detect exactly 2 orphans');
    const orphanIds = orphansResult.orphans.map(o => o.id);
    assert.ok(orphanIds.includes('ti_orphan'), 'Should detect unreferenced template image orphan');
    assert.ok(orphanIds.includes('med_orphan'), 'Should detect abandoned wish media orphan');
    assert.equal(orphansResult.totalReclaimableBytes, 130000);
  });

  test('TEST 9: Safe Cleanup Pipeline with Dry-Run Mode & Protection Preserved', async () => {
    const templates = [{ id: 'fam_active', name: 'Active', status: 'active' }];
    const templateVersions = [{ id: 'tv_1', template_id: 'fam_active', version_label: 'v1.0.0', status: 'published' }];
    const wishes = [{ id: 'wsh_1', title: 'Published Wish', status: 'published', isPublished: 1 }];
    const wishMediaMappings = [{ wish_id: 'wsh_1', media_id: 'med_linked' }];

    const templateImages = [
      { id: 'ti_active', template_id: 'fam_active', url: 'https://i.ibb.co/active.jpg', status: 'active' },
      { id: 'ti_orphan', template_id: 'fam_deleted', url: 'https://i.ibb.co/orphan.jpg', status: 'active', size_bytes: 40000 }
    ];

    const wishMediaList = [
      { id: 'med_linked', wish_id: 'wsh_1', url: 'https://i.ibb.co/linked.jpg', status: 'active' }
    ];

    const quarantineList = [];
    const cleanupJobs = [];

    // Phase 1: Dry-Run Mode
    const dryRunResult = await executeSafeCleanup({
      dryRun: true,
      context: {
        wishes,
        templates,
        templateVersions,
        templateImages,
        wishMediaList,
        wishMediaMappings,
        quarantineList,
        cleanupJobs,
        saveQuarantine: () => {},
        saveCleanupJobs: (jobs) => cleanupJobs.push(...jobs)
      }
    });

    assert.equal(dryRunResult.success, true);
    assert.equal(dryRunResult.dryRun, true);
    assert.equal(dryRunResult.itemsCleaned, 1, '1 orphan should be eligible for cleanup');
    assert.equal(quarantineList.length, 0, 'Dry-run must not modify quarantine list');

    // Phase 2: Live Cleanup Execution
    let savedQuarantine = [];
    let savedTplImages = [...templateImages];

    const liveResult = await executeSafeCleanup({
      dryRun: false,
      context: {
        wishes,
        templates,
        templateVersions,
        templateImages: savedTplImages,
        wishMediaList,
        wishMediaMappings,
        quarantineList,
        cleanupJobs,
        saveTemplateImages: (updated) => { savedTplImages = updated; },
        saveQuarantine: (updated) => { savedQuarantine = updated; },
        saveCleanupJobs: (jobs) => cleanupJobs.push(...jobs)
      }
    });

    assert.equal(liveResult.success, true);
    assert.equal(liveResult.dryRun, false);
    assert.equal(liveResult.itemsCleaned, 1);
    assert.equal(savedQuarantine.length, 1, 'Live cleanup must place orphan in quarantine');
    assert.equal(savedQuarantine[0].asset_id, 'ti_orphan');
    assert.equal(savedQuarantine[0].status, 'quarantined');
    assert.equal(savedTplImages.length, 1, 'Orphan should be removed from active template images');
  });

  test('TEST 10: Quarantine Isolation & 1-Click Recovery Pipeline', async () => {
    let wishMediaList = [];
    let quarantineList = [
      {
        id: 'quar_test_01',
        asset_id: 'med_recovered_101',
        asset_type: ASSET_TYPES.IMGBB_WISH_MEDIA,
        provider: 'imgbb',
        url: 'https://i.ibb.co/recovered-photo.jpg',
        size_bytes: 90000,
        quarantine_reason: 'Unreferenced orphan test',
        status: 'quarantined',
        quarantined_at: new Date().toISOString(),
        metadata_json: JSON.stringify({ filename: 'family-celebration.jpg', wishId: 'wsh_recovered' })
      }
    ];

    const restoreResult = await restoreQuarantinedAsset({
      quarantineId: 'quar_test_01',
      context: {
        quarantineList,
        wishMediaList,
        saveQuarantine: (q) => { quarantineList = q; },
        saveMedia: (m) => { wishMediaList = m; }
      }
    });

    assert.equal(restoreResult.success, true);
    assert.equal(restoreResult.status, 'restored');
    assert.equal(restoreResult.assetId, 'med_recovered_101');
    assert.equal(quarantineList[0].status, 'restored');
    assert.ok(quarantineList[0].restored_at);
    assert.equal(wishMediaList.length, 1, 'Media must be restored back into active media array');
    assert.equal(wishMediaList[0].id, 'med_recovered_101');
    assert.equal(wishMediaList[0].status, 'active');
  });

});
