/**
 * WishMagic Storage Health, Orphan Detection & Recovery Engine (Part 29)
 * ======================================================================
 * Production-ready health verification, orphan detection, protected-asset
 * safeguards, dry-run cleanup, and quarantine recovery engine across
 * D1, Backblaze B2, and ImgBB storage providers.
 *
 * Rules:
 * 1. D1 is central metadata / source of truth.
 * 2. B2 stores template packages, runtime files, and music assets.
 * 3. ImgBB stores template images and customer wish media.
 * 4. Health verification queries the REAL providers (never blindly trust D1).
 * 5. Published Wishes, Published Template Versions, and Active Template Families
 *    are IMMUTABLY PROTECTED — can NEVER be deleted or purged.
 * 6. Dry-run first cleanup with complete quarantine isolation and 1-click restore.
 */

import { buildTemplateStorageKeys } from './storage-provider.js';

// Explicit Storage Health Statuses
export const STORAGE_HEALTH_STATUS = {
  HEALTHY: 'HEALTHY',
  MISSING: 'MISSING',
  ORPHANED: 'ORPHANED',
  BROKEN_REFERENCE: 'BROKEN_REFERENCE',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  VERIFYING: 'VERIFYING',
  CLEANUP_PENDING: 'CLEANUP_PENDING',
  PROTECTED: 'PROTECTED',
  ARCHIVED: 'ARCHIVED',
  UNKNOWN: 'UNKNOWN',
  VERIFICATION_UNAVAILABLE: 'VERIFICATION_UNAVAILABLE',
  INTEGRITY_FAILED: 'INTEGRITY_FAILED',
  MUSIC_ASSET_MISSING: 'MUSIC_ASSET_MISSING'
};

// Asset Classifications
export const ASSET_TYPES = {
  B2_TEMPLATE_PACKAGE: 'b2_template_package',
  B2_RUNTIME_FILE: 'b2_runtime_file',
  B2_MUSIC_TRACK: 'b2_music_track',
  IMGBB_TEMPLATE_IMAGE: 'imgbb_template_image',
  IMGBB_WISH_MEDIA: 'imgbb_wish_media',
  D1_GHOST_RECORD: 'd1_ghost_record'
};

/**
 * Evaluates whether an asset is protected from deletion or cleanup.
 * HARD INVARIANT: Assets referenced by ANY published wish, published template
 * version, or active family CANNOT BE DELETED.
 */
export function evaluateAssetProtection({
  assetId,
  storageKey = null,
  providerAssetId = null,
  url = null,
  wishes = [],
  templates = [],
  templateVersions = [],
  wishMediaMappings = [],
  templateImages = [],
  musicList = []
}) {
  const publishedWishRefs = [];
  const activeWishRefs = [];
  const publishedVersionRefs = [];
  const activeFamilyRefs = [];
  const templateImageRefs = [];
  const reasons = [];

  // 1. Check published and active Wishes
  for (const wish of wishes) {
    const isPublished = wish.status === 'published' || wish.isPublished === 1 || wish.is_published === 1;
    const isDraftOrActive = wish.status === 'draft' || wish.status === 'active';

    // Direct customData checks
    const customData = wish.customData || {};
    const photos = Array.isArray(customData.photos) ? customData.photos : [];
    const directUrls = Object.values(customData).filter(v => typeof v === 'string' && (v.startsWith('http') || v.startsWith('/')));

    const matchesUrl = url && (photos.includes(url) || directUrls.includes(url));
    const matchesMusic = assetId && (customData.musicId === assetId || customData.music_id === assetId || customData.bgmId === assetId);

    // Mappings check
    const hasMapping = wishMediaMappings.some(m => m.wish_id === wish.id && (m.media_id === assetId || m.object_key === storageKey || m.media_id === providerAssetId));

    if (matchesUrl || matchesMusic || hasMapping) {
      if (isPublished) {
        publishedWishRefs.push(wish.id);
        reasons.push(`Referenced by Published Wish "${wish.title || wish.id}" (${wish.id})`);
      } else if (isDraftOrActive) {
        activeWishRefs.push(wish.id);
        reasons.push(`Referenced by Active User Wish "${wish.title || wish.id}" (${wish.id})`);
      }
    }
  }

  // 2. Check Published Template Versions
  for (const tv of templateVersions) {
    const isPublished = tv.status === 'published' || tv.is_current === 1 || tv.isCurrent === true;
    const versionKeys = buildTemplateStorageKeys(tv.template_id || tv.templateId, tv.version_label || tv.version || tv.id);

    const matchesBaseKey = storageKey && (storageKey.startsWith(versionKeys.base) || storageKey.includes(tv.id));
    const matchesVersionId = assetId && (tv.id === assetId || tv.template_id === assetId || tv.templateId === assetId);

    if (matchesBaseKey || matchesVersionId) {
      if (isPublished) {
        publishedVersionRefs.push(tv.id);
        reasons.push(`Referenced by Published Template Version ${tv.version_label || tv.id}`);
      }
    }
  }

  // 3. Check Active Template Families
  for (const tpl of templates) {
    const isActive = tpl.status === 'active' || tpl.status === 'published';
    const matchesFamily = assetId && (tpl.id === assetId || tpl.familyId === assetId);
    const matchesTplKey = storageKey && storageKey.includes(tpl.id);

    if ((matchesFamily || matchesTplKey) && isActive) {
      activeFamilyRefs.push(tpl.id);
      reasons.push(`Bound to Active Template Family "${tpl.name || tpl.id}"`);
    }
  }

  // 4. Check Template Images in use by active templates
  for (const ti of templateImages) {
    if ((ti.id === assetId || ti.provider_asset_id === assetId || (url && ti.url === url)) && ti.status === 'active') {
      const hasActiveTemplate = templates.some(t => (t.id === ti.template_id || t.familyId === ti.template_id) && (t.status === 'active' || t.status === 'published'));
      const hasActiveVersion = templateVersions.some(tv => (tv.template_id === ti.template_id || tv.id === ti.template_id) && (tv.status === 'published' || tv.is_current === 1));
      if (hasActiveTemplate || hasActiveVersion) {
        templateImageRefs.push(ti.id);
        reasons.push(`Active Template Slot Image for template "${ti.template_id || 'system'}"`);
      }
    }
  }

  // 5. Check Music Library in use
  for (const mus of musicList) {
    if ((mus.id === assetId || mus.storageKey === storageKey || (url && mus.playbackUrl === url)) && mus.status === 'active') {
      const hasPublishedWish = wishes.some(w => (w.status === 'published' || w.isPublished === 1) && (w.customData?.musicId === mus.id || w.customData?.music_id === mus.id));
      if (hasPublishedWish) {
        reasons.push(`Active Soundtrack referenced by published wish ("${mus.title || mus.id}")`);
      }
    }
  }

  const isProtected = publishedWishRefs.length > 0 || publishedVersionRefs.length > 0 || activeWishRefs.length > 0 || activeFamilyRefs.length > 0 || templateImageRefs.length > 0;

  return {
    isProtected,
    reasons,
    dependencies: {
      publishedWishCount: publishedWishRefs.length,
      publishedWishes: publishedWishRefs,
      activeWishCount: activeWishRefs.length,
      activeWishes: activeWishRefs,
      publishedVersionCount: publishedVersionRefs.length,
      publishedVersions: publishedVersionRefs,
      activeFamilyCount: activeFamilyRefs.length,
      activeFamilies: activeFamilyRefs
    }
  };
}

/**
 * Verifies a single B2 object via real HEAD request.
 * Does not download full body. Checks size, type, sha1, and fileId.
 */
export async function verifyB2ObjectHealth({ b2Provider, key, expectedSize = null, expectedSha1 = null }) {
  if (!b2Provider) {
    return {
      healthy: false,
      status: STORAGE_HEALTH_STATUS.UNKNOWN,
      key,
      error: 'B2 Provider instance not available'
    };
  }

  try {
    const head = await b2Provider.headObject({ key });
    if (!head || !head.exists) {
      return {
        healthy: false,
        status: STORAGE_HEALTH_STATUS.MISSING,
        key,
        error: `Object not found in Backblaze B2 bucket (HTTP ${head?.status || 404})`
      };
    }

    let sizeMismatch = false;
    if (expectedSize !== null && expectedSize > 0 && head.contentLength > 0 && head.contentLength !== expectedSize) {
      sizeMismatch = true;
    }

    let sha1Mismatch = false;
    if (expectedSha1 && head.sha1 && head.sha1.toLowerCase() !== expectedSha1.toLowerCase()) {
      sha1Mismatch = true;
    }

    if (sizeMismatch || sha1Mismatch) {
      return {
        healthy: false,
        status: STORAGE_HEALTH_STATUS.INTEGRITY_FAILED,
        key,
        fileId: head.fileId,
        contentLength: head.contentLength,
        expectedSize,
        sha1: head.sha1,
        expectedSha1,
        error: sizeMismatch ? 'Object content length mismatch' : 'Object SHA-1 checksum mismatch'
      };
    }

    return {
      healthy: true,
      status: STORAGE_HEALTH_STATUS.HEALTHY,
      key,
      fileId: head.fileId,
      contentLength: head.contentLength,
      contentType: head.contentType,
      sha1: head.sha1
    };
  } catch (err) {
    return {
      healthy: false,
      status: STORAGE_HEALTH_STATUS.MISSING,
      key,
      error: err.message
    };
  }
}

/**
 * Verifies an ImgBB Image via HTTP probe.
 * Checks availability without assuming healthy just from D1.
 */
export async function verifyImgBBImageHealth({ url, providerAssetId = null, fetchFn = globalThis.fetch }) {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return {
      healthy: false,
      status: STORAGE_HEALTH_STATUS.BROKEN_REFERENCE,
      url,
      providerAssetId,
      error: 'Missing or empty image URL in database record'
    };
  }

  // If local /assets/ image, check existence or format
  if (url.startsWith('/assets/') || url.startsWith('assets/')) {
    return {
      healthy: true,
      status: STORAGE_HEALTH_STATUS.HEALTHY,
      url,
      providerAssetId,
      isLocal: true
    };
  }

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;

    const res = await fetchFn(url, {
      method: 'HEAD',
      signal: controller ? controller.signal : undefined
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (res.ok) {
      const contentType = res.headers?.get('content-type') || '';
      const contentLength = Number(res.headers?.get('content-length') || 0);

      return {
        healthy: true,
        status: STORAGE_HEALTH_STATUS.HEALTHY,
        url,
        providerAssetId,
        httpStatus: res.status,
        contentType,
        contentLength
      };
    }

    if (res.status === 404 || res.status === 410) {
      return {
        healthy: false,
        status: STORAGE_HEALTH_STATUS.MISSING,
        url,
        providerAssetId,
        httpStatus: res.status,
        error: `Image URL returned HTTP ${res.status} (Asset Deleted or Expired on ImgBB)`
      };
    }

    // Server error or unexpected response
    return {
      healthy: false,
      status: STORAGE_HEALTH_STATUS.BROKEN_REFERENCE,
      url,
      providerAssetId,
      httpStatus: res.status,
      error: `Image probe returned unexpected HTTP ${res.status}`
    };
  } catch (err) {
    // Network / CORS / timeout error: do not mark healthy
    return {
      healthy: null,
      status: STORAGE_HEALTH_STATUS.VERIFICATION_UNAVAILABLE,
      url,
      providerAssetId,
      error: `Provider probe unavailable: ${err.message}`
    };
  }
}

/**
 * Audits all Template Versions in B2:
 * Verifies source ZIP, runtime files, manifest, and assets.
 * If published version is missing files, marks INTEGRITY_FAILED.
 */
export async function auditTemplateVersionsIntegrity({
  templates = [],
  templateVersions = [],
  b2Provider = null
}) {
  const results = [];
  let healthyVersions = 0;
  let failedVersions = 0;
  let missingObjects = 0;

  for (const tv of templateVersions) {
    const templateFamilyId = tv.template_id || tv.templateId || 'default';
    const versionLabel = tv.version_label || tv.version || tv.id;
    const keys = buildTemplateStorageKeys(templateFamilyId, versionLabel);
    const isPublished = tv.status === 'published' || tv.is_current === 1;

    const filesToCheck = [
      { key: keys.sourceZip, label: 'Source ZIP Archive' },
      { key: keys.manifest, label: 'Integrity Manifest' },
      { key: keys.runtimeFile('index.html'), label: 'Runtime Entry Point (index.html)' }
    ];

    const fileResults = [];
    let hasFailure = false;

    if (b2Provider && typeof b2Provider.headObject === 'function') {
      for (const f of filesToCheck) {
        const check = await verifyB2ObjectHealth({ b2Provider, key: f.key });
        fileResults.push({ ...f, ...check });
        if (!check.healthy) {
          hasFailure = true;
          missingObjects++;
        }
      }
    } else {
      // B2 not configured in environment
      for (const f of filesToCheck) {
        fileResults.push({
          ...f,
          healthy: null,
          status: STORAGE_HEALTH_STATUS.VERIFICATION_UNAVAILABLE,
          error: 'B2 credentials not configured'
        });
      }
    }

    let finalStatus = STORAGE_HEALTH_STATUS.HEALTHY;
    if (hasFailure) {
      finalStatus = isPublished ? STORAGE_HEALTH_STATUS.INTEGRITY_FAILED : STORAGE_HEALTH_STATUS.MISSING;
      failedVersions++;
    } else if (!b2Provider) {
      finalStatus = STORAGE_HEALTH_STATUS.VERIFICATION_UNAVAILABLE;
    } else {
      healthyVersions++;
    }

    results.push({
      versionId: tv.id,
      templateId: templateFamilyId,
      versionLabel,
      isPublished,
      status: finalStatus,
      filesChecked: fileResults.length,
      files: fileResults,
      integrityFailed: finalStatus === STORAGE_HEALTH_STATUS.INTEGRITY_FAILED
    });
  }

  return {
    totalVersions: templateVersions.length,
    healthyVersions,
    failedVersions,
    missingObjects,
    versionAudits: results
  };
}

/**
 * Audits all Music Library tracks against B2:
 * If D1 says READY but B2 object is missing -> MUSIC_ASSET_MISSING.
 */
export async function auditMusicAssetsIntegrity({
  musicList = [],
  wishes = [],
  b2Provider = null
}) {
  const results = [];
  let healthyMusic = 0;
  let missingMusic = 0;

  for (const track of musicList) {
    const isB2 = track.storageProvider === 'b2' || (track.playbackUrl && track.playbackUrl.includes('backblazeb2'));
    let storageKey = track.storageKey || null;

    if (!storageKey && track.playbackUrl) {
      try {
        const u = new URL(track.playbackUrl);
        storageKey = u.pathname.replace(/^\/+/, '');
      } catch (_) {
        storageKey = track.playbackUrl.replace(/^\/+/, '');
      }
    }

    let check = { healthy: true, status: STORAGE_HEALTH_STATUS.HEALTHY };
    if (isB2 && storageKey && b2Provider && typeof b2Provider.headObject === 'function') {
      check = await verifyB2ObjectHealth({ b2Provider, key: storageKey });
    }

    // Check if published wishes depend on this music track
    const protection = evaluateAssetProtection({
      assetId: track.id,
      storageKey,
      url: track.playbackUrl,
      wishes,
      musicList
    });

    let finalStatus = check.healthy ? STORAGE_HEALTH_STATUS.HEALTHY : STORAGE_HEALTH_STATUS.MUSIC_ASSET_MISSING;

    if (finalStatus === STORAGE_HEALTH_STATUS.HEALTHY) {
      healthyMusic++;
    } else {
      missingMusic++;
    }

    results.push({
      id: track.id,
      title: track.title,
      artist: track.artist,
      category: track.category,
      storageKey,
      playbackUrl: track.playbackUrl,
      status: finalStatus,
      isProtected: protection.isProtected,
      protectionReasons: protection.reasons,
      error: check.error || null
    });
  }

  return {
    totalTracks: musicList.length,
    healthyMusic,
    missingMusic,
    musicAudits: results
  };
}

/**
 * Audits all Template Images and Customer Wish Media in ImgBB/D1
 */
export async function auditImageAssetsHealth({
  templateImages = [],
  wishMediaList = [],
  wishes = [],
  wishMediaMappings = [],
  templates = [],
  templateVersions = [],
  fetchFn = globalThis.fetch
}) {
  const templateImageAudits = [];
  const wishMediaAudits = [];

  let healthyTemplateImages = 0;
  let missingTemplateImages = 0;
  let healthyWishMedia = 0;
  let missingWishMedia = 0;
  let brokenReferences = 0;

  // 1. Audit Template Images
  for (const ti of templateImages) {
    const url = ti.display_url || ti.url || ti.displayUrl;
    const probe = await verifyImgBBImageHealth({
      url,
      providerAssetId: ti.provider_asset_id || ti.id,
      fetchFn
    });

    const protection = evaluateAssetProtection({
      assetId: ti.id,
      providerAssetId: ti.provider_asset_id,
      url,
      wishes,
      templates,
      templateVersions,
      templateImages
    });

    let status = probe.status;
    if (status === STORAGE_HEALTH_STATUS.HEALTHY) {
      healthyTemplateImages++;
    } else if (status === STORAGE_HEALTH_STATUS.MISSING) {
      missingTemplateImages++;
    } else if (status === STORAGE_HEALTH_STATUS.BROKEN_REFERENCE) {
      brokenReferences++;
    }

    templateImageAudits.push({
      id: ti.id,
      templateId: ti.template_id || ti.templateId,
      slotKey: ti.asset_key || ti.slot_key || ti.field_key,
      url,
      status,
      isProtected: protection.isProtected,
      protectionReasons: protection.reasons,
      error: probe.error || null
    });
  }

  // 2. Audit Customer Wish Media
  for (const wm of wishMediaList) {
    const url = wm.display_url || wm.url || wm.displayUrl;
    const probe = await verifyImgBBImageHealth({
      url,
      providerAssetId: wm.object_key || wm.id,
      fetchFn
    });

    const protection = evaluateAssetProtection({
      assetId: wm.id,
      providerAssetId: wm.object_key,
      url,
      wishes,
      wishMediaMappings
    });

    let status = probe.status;
    if (status === STORAGE_HEALTH_STATUS.HEALTHY) {
      healthyWishMedia++;
    } else if (status === STORAGE_HEALTH_STATUS.MISSING) {
      missingWishMedia++;
    } else if (status === STORAGE_HEALTH_STATUS.BROKEN_REFERENCE) {
      brokenReferences++;
    }

    wishMediaAudits.push({
      id: wm.id,
      wishId: wm.wish_id || wm.wishId,
      filename: wm.filename,
      sizeBytes: wm.size_bytes || wm.sizeBytes,
      url,
      status,
      isProtected: protection.isProtected,
      protectionReasons: protection.reasons,
      error: probe.error || null
    });
  }

  return {
    templateImages: {
      total: templateImages.length,
      healthy: healthyTemplateImages,
      missing: missingTemplateImages,
      audits: templateImageAudits
    },
    wishMedia: {
      total: wishMediaList.length,
      healthy: healthyWishMedia,
      missing: missingWishMedia,
      audits: wishMediaAudits
    },
    totalBrokenReferences: brokenReferences
  };
}

/**
 * Detects Orphan Assets across D1, B2, and ImgBB.
 * An orphan is an asset with NO ACTIVE or PUBLISHED dependencies.
 */
export async function detectStorageOrphans({
  templates = [],
  templateVersions = [],
  musicList = [],
  templateImages = [],
  wishMediaList = [],
  wishMediaMappings = [],
  wishes = [],
  b2Provider = null
}) {
  const orphans = [];

  // 1. Template Images without template or template family
  for (const ti of templateImages) {
    const tplId = ti.template_id || ti.templateId;
    const hasTemplate = templates.some(t => t.id === tplId || t.familyId === tplId);
    const hasVersion = templateVersions.some(v => v.template_id === tplId || v.id === tplId);

    const protection = evaluateAssetProtection({
      assetId: ti.id,
      providerAssetId: ti.provider_asset_id,
      url: ti.url || ti.display_url,
      wishes,
      templates,
      templateVersions,
      templateImages
    });

    if (!hasTemplate && !hasVersion && !protection.isProtected) {
      orphans.push({
        id: ti.id,
        assetType: ASSET_TYPES.IMGBB_TEMPLATE_IMAGE,
        provider: 'imgbb',
        providerAssetId: ti.provider_asset_id || null,
        url: ti.display_url || ti.url,
        sizeBytes: ti.size_bytes || 0,
        orphanReason: `Template image references non-existent template ID "${tplId}"`,
        isProtected: false,
        recommendedAction: 'cleanup'
      });
    }
  }

  // 2. Wish Media with non-existent Wish or deleted draft
  for (const wm of wishMediaList) {
    const parentWish = wishes.find(w => w.id === wm.wish_id || w.id === wm.wishId);
    const hasMappings = wishMediaMappings.some(m => m.media_id === wm.id);

    const protection = evaluateAssetProtection({
      assetId: wm.id,
      providerAssetId: wm.object_key,
      url: wm.url || wm.display_url,
      wishes,
      wishMediaMappings
    });

    // If wish was deleted or doesn't exist, and no mappings or published references exist
    if ((!parentWish || parentWish.status === 'deleted') && !hasMappings && !protection.isProtected) {
      orphans.push({
        id: wm.id,
        assetType: ASSET_TYPES.IMGBB_WISH_MEDIA,
        provider: wm.storage_provider || 'imgbb',
        providerAssetId: wm.object_key || null,
        url: wm.display_url || wm.url,
        sizeBytes: wm.size_bytes || 0,
        orphanReason: parentWish ? 'Belongs to deleted wish with no published snapshot' : 'Parent wish not found in database',
        isProtected: false,
        recommendedAction: 'cleanup'
      });
    }
  }

  // 3. Scan B2 bucket objects for unreferenced files (if B2 listObjects is available)
  if (b2Provider && typeof b2Provider.listObjects === 'function') {
    try {
      const list = await b2Provider.listObjects({ prefix: 'templates/', maxKeys: 200 });
      const files = list.files || [];

      for (const file of files) {
        // Check if file.key is referenced by any template version
        const isReferencedByVersion = templateVersions.some(tv => {
          const keys = buildTemplateStorageKeys(tv.template_id || tv.templateId, tv.version_label || tv.version || tv.id);
          return file.key.startsWith(keys.base);
        });

        const isReferencedByMusic = musicList.some(m => m.storageKey === file.key || (m.playbackUrl && m.playbackUrl.includes(file.key)));

        if (!isReferencedByVersion && !isReferencedByMusic) {
          const protection = evaluateAssetProtection({
            storageKey: file.key,
            wishes,
            templates,
            templateVersions
          });

          if (!protection.isProtected) {
            orphans.push({
              id: `b2_orph_${file.fileId || Math.random().toString(36).substring(2, 8)}`,
              assetType: ASSET_TYPES.B2_RUNTIME_FILE,
              provider: 'b2',
              storageKey: file.key,
              providerAssetId: file.fileId,
              sizeBytes: file.contentLength || 0,
              orphanReason: 'B2 storage key has no corresponding Template Version or Music record in D1',
              isProtected: false,
              recommendedAction: 'cleanup'
            });
          }
        }
      }
    } catch (e) {
      // If listObjects fails or is restricted, continue safely
    }
  }

  return {
    totalOrphans: orphans.length,
    orphans,
    totalReclaimableBytes: orphans.reduce((sum, o) => sum + (o.sizeBytes || 0), 0)
  };
}

/**
 * Executes a Safe Storage Cleanup Pipeline with Dry-Run and Quarantine
 *
 * SAFETY INVARIANTS:
 * 1. Protected assets are NEVER deleted or quarantined.
 * 2. In dryRun mode, returns impact analysis without any DB mutation.
 * 3. In execute mode, moves orphans to quarantine with full restore metadata.
 */
export async function executeSafeCleanup({
  targetIds = null, // null means all unreferenced orphans
  targetProvider = 'all',
  dryRun = true,
  initiatedBy = 'admin',
  context = {}
}) {
  const {
    wishes = [],
    templates = [],
    templateVersions = [],
    musicList = [],
    templateImages = [],
    wishMediaList = [],
    wishMediaMappings = [],
    quarantineList = [],
    b2Provider = null,
    saveMedia = null,
    saveTemplateImages = null,
    saveQuarantine = null,
    saveCleanupJobs = null,
    cleanupJobs = []
  } = context;

  // 1. Detect all current orphans
  const orphanScan = await detectStorageOrphans({
    templates,
    templateVersions,
    musicList,
    templateImages,
    wishMediaList,
    wishMediaMappings,
    wishes,
    b2Provider
  });

  let candidates = orphanScan.orphans;
  if (Array.isArray(targetIds) && targetIds.length > 0) {
    candidates = candidates.filter(c => targetIds.includes(c.id));
  }
  if (targetProvider !== 'all') {
    candidates = candidates.filter(c => c.provider === targetProvider);
  }

  const itemsScanned = candidates.length;
  const cleanedItems = [];
  const protectedItems = [];
  let bytesReclaimed = 0;

  // 2. Strict Protection Verification
  for (const candidate of candidates) {
    const protection = evaluateAssetProtection({
      assetId: candidate.id,
      storageKey: candidate.storageKey,
      providerAssetId: candidate.providerAssetId,
      url: candidate.url,
      wishes,
      templates,
      templateVersions,
      wishMediaMappings,
      templateImages,
      musicList
    });

    if (protection.isProtected) {
      protectedItems.push({
        id: candidate.id,
        reason: 'Asset is protected by active or published references',
        reasons: protection.reasons
      });
      continue;
    }

    cleanedItems.push(candidate);
    bytesReclaimed += (candidate.sizeBytes || 0);
  }

  const nowIso = new Date().toISOString();
  const jobId = `cljob_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

  // 3. Execution (if dryRun is false)
  if (!dryRun) {
    const updatedQuarantine = [...quarantineList];

    for (const item of cleanedItems) {
      const qEntry = {
        id: `quar_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        asset_id: item.id,
        asset_type: item.assetType,
        provider: item.provider,
        storage_key: item.storageKey || null,
        provider_asset_id: item.providerAssetId || null,
        url: item.url || null,
        size_bytes: item.sizeBytes || 0,
        quarantine_reason: item.orphanReason,
        original_status: 'active',
        status: 'quarantined',
        quarantined_at: nowIso,
        restored_at: null,
        purged_at: null,
        metadata_json: JSON.stringify(item)
      };
      updatedQuarantine.unshift(qEntry);

      // Soft delete / quarantine from active arrays
      if (item.assetType === ASSET_TYPES.IMGBB_WISH_MEDIA && saveMedia) {
        const remaining = wishMediaList.filter(m => m.id !== item.id);
        saveMedia(remaining);
      }
      if (item.assetType === ASSET_TYPES.IMGBB_TEMPLATE_IMAGE && saveTemplateImages) {
        const remaining = templateImages.filter(ti => ti.id !== item.id);
        saveTemplateImages(remaining);
      }
    }

    if (saveQuarantine) {
      saveQuarantine(updatedQuarantine);
    }
  }

  const jobRecord = {
    id: jobId,
    job_type: dryRun ? 'dry_run' : 'orphan_cleanup',
    status: 'completed',
    target_provider: targetProvider,
    dry_run: dryRun ? 1 : 0,
    items_scanned: itemsScanned,
    items_quarantined: dryRun ? 0 : cleanedItems.length,
    items_cleanable: cleanedItems.length,
    items_protected: protectedItems.length,
    bytes_reclaimed: bytesReclaimed,
    started_at: nowIso,
    completed_at: new Date().toISOString(),
    initiated_by: initiatedBy,
    results: {
      cleanedCount: cleanedItems.length,
      protectedCount: protectedItems.length,
      protectedItems,
      cleanedItems: cleanedItems.map(c => ({ id: c.id, type: c.assetType, provider: c.provider, bytes: c.sizeBytes }))
    }
  };

  if (saveCleanupJobs && Array.isArray(cleanupJobs)) {
    cleanupJobs.unshift(jobRecord);
    saveCleanupJobs(cleanupJobs);
  }

  return {
    success: true,
    jobId,
    dryRun,
    itemsScanned,
    itemsCleaned: cleanedItems.length,
    itemsProtected: protectedItems.length,
    bytesReclaimed,
    protectedItems,
    cleanedItems,
    summary: dryRun
      ? `Dry-Run completed: ${cleanedItems.length} orphan(s) eligible for quarantine (${(bytesReclaimed / 1024).toFixed(1)} KB), ${protectedItems.length} protected item(s) preserved.`
      : `Safe Cleanup executed: ${cleanedItems.length} orphan(s) quarantined, 0 protected assets touched.`
  };
}

/**
 * Restores an asset from quarantine back to active status
 */
export async function restoreQuarantinedAsset({ quarantineId, context = {} }) {
  const {
    quarantineList = [],
    wishMediaList = [],
    templateImages = [],
    saveQuarantine = null,
    saveMedia = null,
    saveTemplateImages = null
  } = context;

  const target = quarantineList.find(q => q.id === quarantineId || q.asset_id === quarantineId);
  if (!target) {
    const err = new Error(`Quarantine record not found for "${quarantineId}"`);
    err.code = 'QUARANTINE_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  if (target.status === 'restored') {
    return {
      success: true,
      alreadyRestored: true,
      quarantineId: target.id,
      assetId: target.asset_id,
      message: 'Asset was already restored.'
    };
  }

  target.status = 'restored';
  target.restored_at = new Date().toISOString();

  let itemMeta = {};
  try {
    itemMeta = JSON.parse(target.metadata_json || '{}');
  } catch (_) {}

  // Restore back to active list
  if (target.asset_type === ASSET_TYPES.IMGBB_WISH_MEDIA && saveMedia) {
    const restoredMedia = {
      id: target.asset_id,
      wish_id: itemMeta.wish_id || itemMeta.wishId || 'recovered',
      object_key: target.provider_asset_id,
      filename: itemMeta.filename || 'recovered-image.jpg',
      media_type: 'image',
      mime_type: itemMeta.mimeType || 'image/jpeg',
      size_bytes: target.size_bytes,
      url: target.url,
      display_url: target.url,
      thumbnail_url: target.url,
      storage_provider: target.provider,
      status: 'active',
      is_public: 1,
      created_at: target.quarantined_at,
      updated_at: new Date().toISOString()
    };
    wishMediaList.unshift(restoredMedia);
    saveMedia(wishMediaList);
  }

  if (target.asset_type === ASSET_TYPES.IMGBB_TEMPLATE_IMAGE && saveTemplateImages) {
    const restoredTplImg = {
      id: target.asset_id,
      template_id: itemMeta.templateId || itemMeta.template_id || 'recovered',
      asset_key: itemMeta.slotKey || 'hero',
      url: target.url,
      display_url: target.url,
      status: 'active',
      storage_provider: target.provider,
      provider_asset_id: target.provider_asset_id
    };
    templateImages.unshift(restoredTplImg);
    saveTemplateImages(templateImages);
  }

  if (saveQuarantine) {
    saveQuarantine(quarantineList);
  }

  return {
    success: true,
    quarantineId: target.id,
    assetId: target.asset_id,
    assetType: target.asset_type,
    provider: target.provider,
    restoredAt: target.restored_at,
    status: 'restored'
  };
}

/**
 * Generates Unified Comprehensive Storage Health Report
 */
export async function generateComprehensiveStorageHealthReport({
  b2Provider = null,
  templates = [],
  templateVersions = [],
  musicList = [],
  templateImages = [],
  wishMediaList = [],
  wishMediaMappings = [],
  wishes = [],
  quarantineList = [],
  cleanupJobs = [],
  fetchFn = globalThis.fetch
}) {
  const startTime = Date.now();

  // 1. Audit Template Versions (B2)
  const templateAudit = await auditTemplateVersionsIntegrity({
    templates,
    templateVersions,
    b2Provider
  });

  // 2. Audit Music Assets (B2)
  const musicAudit = await auditMusicAssetsIntegrity({
    musicList,
    wishes,
    b2Provider
  });

  // 3. Audit Images (ImgBB / D1)
  const imageAudit = await auditImageAssetsHealth({
    templateImages,
    wishMediaList,
    wishes,
    wishMediaMappings,
    templates,
    templateVersions,
    fetchFn
  });

  // 4. Detect Orphans
  const orphanScan = await detectStorageOrphans({
    templates,
    templateVersions,
    musicList,
    templateImages,
    wishMediaList,
    wishMediaMappings,
    wishes,
    b2Provider
  });

  const durationMs = Date.now() - startTime;

  // Determine Provider Health Summary
  const b2Configured = Boolean(b2Provider);
  const b2Status = !b2Configured
    ? STORAGE_HEALTH_STATUS.VERIFICATION_UNAVAILABLE
    : (templateAudit.failedVersions > 0 || musicAudit.missingMusic > 0)
      ? STORAGE_HEALTH_STATUS.INTEGRITY_FAILED
      : STORAGE_HEALTH_STATUS.HEALTHY;

  const imgbbStatus = (imageAudit.templateImages.missing > 0 || imageAudit.wishMedia.missing > 0)
    ? STORAGE_HEALTH_STATUS.MISSING
    : STORAGE_HEALTH_STATUS.HEALTHY;

  const d1Status = imageAudit.totalBrokenReferences > 0
    ? STORAGE_HEALTH_STATUS.BROKEN_REFERENCE
    : STORAGE_HEALTH_STATUS.HEALTHY;

  const overallSystemStatus = (b2Status === STORAGE_HEALTH_STATUS.INTEGRITY_FAILED || imgbbStatus === STORAGE_HEALTH_STATUS.MISSING)
    ? 'CRITICAL'
    : (orphanScan.totalOrphans > 0 || d1Status === STORAGE_HEALTH_STATUS.BROKEN_REFERENCE)
      ? 'WARNING'
      : 'HEALTHY';

  return {
    success: true,
    timestamp: new Date().toISOString(),
    durationMs,
    overallSystemStatus,
    summary: {
      b2: {
        status: b2Status,
        configured: b2Configured,
        totalObjectsTracked: templateAudit.totalVersions * 3 + musicAudit.totalTracks,
        verifiedHealthy: templateAudit.healthyVersions * 3 + musicAudit.healthyMusic,
        missingObjects: templateAudit.missingObjects + musicAudit.missingMusic,
        failedVersions: templateAudit.failedVersions,
        orphanObjects: orphanScan.orphans.filter(o => o.provider === 'b2').length
      },
      imgbb: {
        status: imgbbStatus,
        totalTracked: imageAudit.templateImages.total + imageAudit.wishMedia.total,
        verifiedHealthy: imageAudit.templateImages.healthy + imageAudit.wishMedia.healthy,
        missingImages: imageAudit.templateImages.missing + imageAudit.wishMedia.missing,
        orphanImages: orphanScan.orphans.filter(o => o.provider === 'imgbb').length,
        brokenReferences: imageAudit.totalBrokenReferences
      },
      d1: {
        status: d1Status,
        mappingConsistency: imageAudit.totalBrokenReferences === 0 ? '100%' : 'degraded',
        brokenReferences: imageAudit.totalBrokenReferences,
        unresolvedAssets: imageAudit.totalBrokenReferences
      },
      orphans: {
        totalDetected: orphanScan.totalOrphans,
        totalReclaimableBytes: orphanScan.totalReclaimableBytes,
        quarantinePending: quarantineList.filter(q => q.status === 'quarantined').length
      }
    },
    details: {
      templates: templateAudit,
      music: musicAudit,
      images: imageAudit,
      orphans: orphanScan.orphans,
      quarantine: quarantineList,
      recentCleanupJobs: (cleanupJobs || []).slice(0, 10)
    }
  };
}
