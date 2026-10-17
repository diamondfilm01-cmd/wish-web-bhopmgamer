/**
 * WishMagic Smart Template Recognition, Side-by-Side Comparison & Safe Update Studio Engine
 * Part 50: Production Recognition Engine, Lineage Tracking, Sandbox Preview & Immutable Publishing
 */

import {
  computeSha256Hex,
  getMimeType,
  buildTemplateStorageKeys,
  B2StorageProvider,
  getB2Config
} from './storage-provider.js';
import { uint8ArrayToBase64 } from './imgbb-provider.js';
import {
  extractAndVerifyZip,
  computePackageFingerprint,
  ZIP_LIMITS,
  createZipFromFiles,
  ensureTemplateIngestionSchema
} from './template-ingest-pipeline.js';
import {
  validateUtpManifest,
  normalizeManifestToUtp,
  validateAdminTemplateConfiguration
} from './template-protocol-validator.js';
import { validateTemplateSecurityAndModeration } from './content-moderation-engine.js';
import { generateNextVersion } from './template-version-engine.js';
import { buildVariantRecordFromUtpDeclaration } from './template-variant-engine.js';

export const RECOGNITION_OUTCOME = {
  EXACT_EXISTING_IDENTITY: 'EXACT_EXISTING_IDENTITY',
  POSSIBLE_EXISTING_MATCH: 'POSSIBLE_EXISTING_MATCH',
  MULTIPLE_POSSIBLE_MATCHES: 'MULTIPLE_POSSIBLE_MATCHES',
  NO_EXISTING_MATCH: 'NO_EXISTING_MATCH',
  IDENTITY_CONFLICT: 'IDENTITY_CONFLICT',
  INVALID_OR_UNSUPPORTED_PACKAGE: 'INVALID_OR_UNSUPPORTED_PACKAGE'
};

export const IMPORT_SESSION_STATE = {
  UPLOADED: 'UPLOADED',
  RECOGNIZED: 'RECOGNIZED',
  VALIDATED: 'VALIDATED',
  PUBLISHED: 'PUBLISHED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED'
};

export const IMPORT_DECISION_MODE = {
  UNDECIDED: 'undecided',
  UPDATE_EXISTING: 'update_existing',
  CREATE_NEW: 'create_new'
};

export const SANDBOXED_PREVIEW_CSP = "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; frame-ancestors 'self';";

function safeJsonParse(str, fallback = {}) {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(str);
  } catch (_) {
    return fallback;
  }
}

function base64ToUint8Array(b64) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/**
 * Deserializes staged files bundle back into a Map of relativePath -> file object
 */
export function deserializeStagedFilesBundle(stagedBundle) {
  const map = new Map();
  if (!stagedBundle) return map;

  const filesList = Array.isArray(stagedBundle)
    ? stagedBundle
    : (Array.isArray(stagedBundle.files) ? stagedBundle.files : Object.entries(stagedBundle).map(([path, data]) => ({ path, ...data })));

  for (const item of filesList) {
    if (!item) continue;
    const relPath = String(item.path || item.relativePath || item.name || '').replace(/^[/\\]+/, '');
    if (!relPath) continue;

    let bytes;
    if (item.content instanceof Uint8Array) {
      bytes = item.content;
    } else if (item.contentBase64) {
      bytes = base64ToUint8Array(item.contentBase64);
    } else if (typeof item.content === 'string') {
      if (item.isBase64 || (item.content.startsWith('data:') && item.content.includes(';base64,'))) {
        bytes = base64ToUint8Array(item.content.replace(/^data:[^;]+;base64,/i, ''));
      } else {
        bytes = new TextEncoder().encode(item.content);
      }
    } else {
      bytes = new Uint8Array(0);
    }

    const text = (item.text !== undefined && item.text !== null)
      ? item.text
      : (relPath.endsWith('.html') || relPath.endsWith('.css') || relPath.endsWith('.js') || relPath.endsWith('.json')
        ? new TextDecoder('utf-8').decode(bytes)
        : null);

    map.set(relPath, {
      path: relPath,
      relativePath: relPath,
      content: bytes,
      text,
      sizeBytes: bytes.byteLength,
      mimeType: item.mimeType || getMimeType(relPath)
    });
  }

  return map;
}

/**
 * Builds sandboxed preview HTML with applied section visibility, action configuration, and base URL rewrites.
 */
export function buildSandboxedTemplatePreviewHtml({
  entryHtml,
  filesMap = new Map(),
  normalizedManifest = {},
  relationshipSlug = null,
  visibilityConfig = {},
  actionsConfig = {},
  variantOverrides = {},
  previewBaseUrl = '',
  side = 'staged'
}) {
  if (!entryHtml || typeof entryHtml !== 'string') {
    return { ok: false, html: '<!DOCTYPE html><html><body><h3>Missing Template Preview HTML</h3></body></html>' };
  }

  let html = entryHtml;

  // 1. Remove hidden sections / subsections according to visibilityConfig
  if (visibilityConfig && typeof visibilityConfig === 'object') {
    for (const [key, isVisible] of Object.entries(visibilityConfig)) {
      if (isVisible === false) {
        // Remove section
        const sectionRegex = new RegExp(`<section[^>]*data-wm-section=["']${key}["'][^>]*>[\\s\\S]*?<\\/section>`, 'gi');
        html = html.replace(sectionRegex, `<!-- [WishMagic Admin: Section "${key}" hidden by visibility configuration] -->`);
        
        // Remove subsection / generic elements
        const subRegex = new RegExp(`<div[^>]*data-wm-subsection=["']${key}["'][^>]*>[\\s\\S]*?<\\/div>`, 'gi');
        html = html.replace(subRegex, `<!-- [WishMagic Admin: Subsection "${key}" hidden by visibility configuration] -->`);
      }
    }
  }

  // 2. Inject sandboxed base tag & security meta tags into <head>
  const cleanBaseUrl = previewBaseUrl.replace(/\/+$/, '');
  const injectedHeadTags = `
  <meta http-equiv="Content-Security-Policy" content="${SANDBOXED_PREVIEW_CSP}">
  <base href="${cleanBaseUrl}/">
  <script>
    // WishMagic Sandboxed Preview Environment Indicator
    window.__WISHMAGIC_PREVIEW_SIDE = "${side}";
    window.__WISHMAGIC_RELATIONSHIP = "${relationshipSlug || 'default'}";
  </script>`;

  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>${injectedHeadTags}`);
  } else if (html.includes('<html>')) {
    html = html.replace('<html>', `<html><head>${injectedHeadTags}</head>`);
  } else {
    html = `<head>${injectedHeadTags}</head>${html}`;
  }

  return { ok: true, html };
}

/**
 * Loads full context of an existing template from D1 database
 */
export async function loadSingleTemplateComparisonContext(db, targetId, env = {}) {
  if (!db || !targetId) return null;

  await ensureTemplateIngestionSchema(db);

  // Load template
  const template = await db
    .prepare('SELECT * FROM templates WHERE id = ? OR slug = ? LIMIT 1')
    .bind(targetId, targetId)
    .first()
    .catch(() => null);

  if (!template) return null;

  // Load latest or active version
  let version = null;
  if (template.current_version_id) {
    version = await db
      .prepare('SELECT * FROM template_versions WHERE id = ? LIMIT 1')
      .bind(template.current_version_id)
      .first()
      .catch(() => null);
  }
  if (!version) {
    version = await db
      .prepare('SELECT * FROM template_versions WHERE template_id = ? ORDER BY version_number DESC LIMIT 1')
      .bind(template.id)
      .first()
      .catch(() => null);
  }

  // Load variants
  let variants = [];
  try {
    const varRows = await db
      .prepare('SELECT * FROM template_relationship_variants WHERE template_id = ?')
      .bind(template.id)
      .all();
    variants = Array.isArray(varRows) ? varRows : (varRows?.results || []);
  } catch (_) {}

  // Load registered files
  let files = [];
  try {
    const fileRows = await db
      .prepare('SELECT * FROM template_files WHERE template_id = ?')
      .bind(template.id)
      .all();
    files = Array.isArray(fileRows) ? fileRows : (fileRows?.results || []);
  } catch (_) {}

  // Load text contents map
  const fileContentsMap = new Map();
  if (version && version.manifest_json) {
    fileContentsMap.set('manifest.json', version.manifest_json);
  }

  return {
    template,
    version,
    variants,
    files,
    fileContentsMap
  };
}

/**
 * Inspects, unpacks and validates a template ZIP archive or files bundle
 */
export async function inspectAndValidateTemplateZip(zipInput, options = {}) {
  const { filename = 'template-package.zip', zipLimits = {} } = options;

  let zipBytes;
  if (typeof zipInput === 'string') {
    zipBytes = base64ToUint8Array(zipInput);
  } else if (zipInput instanceof Uint8Array) {
    zipBytes = zipInput;
  } else if (Array.isArray(zipInput) || (typeof zipInput === 'object' && !(zipInput instanceof ArrayBuffer))) {
    zipBytes = await createZipFromFiles(zipInput);
  } else {
    zipBytes = new Uint8Array(zipInput);
  }

  const sourceZipSha256 = await computeSha256Hex(zipBytes);
  const extractResult = await extractAndVerifyZip(zipBytes);
  const { files: filesMap, entryFile, totalUncompressedBytes, warnings: extractWarnings } = extractResult;

  // Build files inventory & compute package fingerprint
  const filesInventory = [];
  const runtimeChunks = [];

  for (const [relPath, fObj] of filesMap.entries()) {
    const sha = await computeSha256Hex(fObj.content);
    filesInventory.push({
      path: relPath,
      sizeBytes: fObj.sizeBytes,
      mimeType: fObj.mimeType,
      sha256: sha,
      isEntry: relPath === entryFile
    });

    if (relPath.endsWith('.html') || relPath.endsWith('.js') || relPath.endsWith('.css')) {
      runtimeChunks.push(`${relPath}:${sha}`);
    }
  }

  const packageFingerprint = await computePackageFingerprint(filesMap);
  runtimeChunks.sort();
  const runtimeHash = await computeSha256Hex(runtimeChunks.join('||'));

  // Parse manifest
  let rawManifest = null;
  for (const key of ['manifest.json', 'wishmagic.json']) {
    if (filesMap.has(key)) {
      try {
        const text = new TextDecoder('utf-8').decode(filesMap.get(key).content);
        rawManifest = JSON.parse(text);
        break;
      } catch (_) {}
    }
  }

  // Synthesize or normalize manifest
  const normalizedManifest = normalizeManifestToUtp(rawManifest || {});
  const schemaHash = await computeSha256Hex(JSON.stringify(normalizedManifest));

  // Determine detected template identity
  const entryHtmlText = filesMap.has(entryFile)
    ? new TextDecoder('utf-8').decode(filesMap.get(entryFile).content)
    : '';

  const detectedName = rawManifest?.template?.name || rawManifest?.name ||
    normalizedManifest.template?.name ||
    (entryHtmlText.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()) ||
    filename.replace(/\.zip$/i, '').replace(/[-_]/g, ' ');

  const detectedSlug = rawManifest?.template?.slug || rawManifest?.slug ||
    normalizedManifest.template?.slug ||
    detectedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
    'custom-template';

  const canonicalTemplateId = rawManifest?.template?.id || rawManifest?.id ||
    normalizedManifest.template?.id || `tpl_${detectedSlug.replace(/-/g, '_')}`;

  const packageMetadata = {
    canonicalTemplateId,
    detectedSlug,
    detectedName,
    declaredVersion: normalizedManifest.template?.version || 'v1.0.0',
    category: normalizedManifest.template?.category || 'Birthday',
    description: normalizedManifest.template?.description || '',
    entryFile,
    fileCount: filesMap.size,
    totalUncompressedBytes,
    sourceZipSha256,
    packageFingerprint,
    runtimeHash,
    schemaHash
  };

  // Ensure template object has detected defaults for validation
  if (!normalizedManifest.template) normalizedManifest.template = {};
  if (!normalizedManifest.template.id) normalizedManifest.template.id = canonicalTemplateId;
  if (!normalizedManifest.template.name) normalizedManifest.template.name = detectedName;
  if (!normalizedManifest.template.slug) normalizedManifest.template.slug = detectedSlug;

  // Run UTP schema and moderation checks
  const validationErrors = [];
  const securityErrors = [];

  const utpCheck = validateUtpManifest(normalizedManifest);
  if (!utpCheck.valid) {
    validationErrors.push(...(utpCheck.errors || []));
  }

  const modCheck = await validateTemplateSecurityAndModeration(filesMap, normalizedManifest);
  if (!modCheck.valid) {
    securityErrors.push(...(modCheck.securityIssues || []), ...(modCheck.moderationIssues || []));
  }

  const valid = validationErrors.length === 0 && securityErrors.length === 0;

  return {
    valid,
    filesMap,
    filesInventory,
    manifest: normalizedManifest,
    rawManifest,
    packageMetadata,
    validationErrors,
    securityErrors,
    packageFingerprint,
    sourceZipSha256,
    runtimeHash,
    schemaHash,
    warnings: extractWarnings
  };
}

/**
 * Searches existing database templates for candidates, detects conflicts and identifies recognition outcome
 */
export async function recognizeTemplatePackage({
  db,
  packageMetadata,
  manifest,
  filesInventory = [],
  intendedTargetTemplateId = null,
  env = {}
}) {
  if (!db) {
    return {
      outcome: RECOGNITION_OUTCOME.NO_EXISTING_MATCH,
      summary: 'No database connected; treating as new template.',
      candidates: [],
      conflicts: [],
      selectedTargetTemplateId: null
    };
  }

  await ensureTemplateIngestionSchema(db);

  // 1. Fetch all templates
  let allTemplates = [];
  try {
    const rows = await db
      .prepare('SELECT id, slug, name, category, thumbnail, status, current_version_id, lock_version, updated_at FROM templates')
      .all();
    allTemplates = Array.isArray(rows) ? rows : (rows?.results || []);
  } catch (_) {}

  // 2. Fetch versions matching fingerprint
  let fingerprintMatches = [];
  try {
    const fpRows = await db
      .prepare('SELECT template_id, id AS version_id, version_label, package_fingerprint FROM template_versions WHERE package_fingerprint = ?')
      .bind(packageMetadata.packageFingerprint)
      .all();
    fingerprintMatches = Array.isArray(fpRows) ? fpRows : (fpRows?.results || []);
  } catch (_) {}

  const candidatesMap = new Map();
  const conflicts = [];

  for (const t of allTemplates) {
    const reasons = [];
    const evidenceCategories = [];
    let score = 0;

    // Check exact template ID
    if (packageMetadata.canonicalTemplateId && t.id.toLowerCase() === packageMetadata.canonicalTemplateId.toLowerCase()) {
      score += 100;
      evidenceCategories.push('EXACT_TEMPLATE_ID');
      reasons.push(`Package declared canonical ID matches template "${t.id}"`);
    }

    // Check exact slug
    if (packageMetadata.detectedSlug && t.slug.toLowerCase() === packageMetadata.detectedSlug.toLowerCase()) {
      score += 90;
      evidenceCategories.push('EXACT_SLUG');
      reasons.push(`Package detected slug "/${packageMetadata.detectedSlug}" matches template slug`);
    }

    // Check intended target
    if (intendedTargetTemplateId && (t.id === intendedTargetTemplateId || t.slug === intendedTargetTemplateId)) {
      score += 80;
      evidenceCategories.push('EXPLICIT_ADMIN_TARGET');
      reasons.push(`Explicitly requested target template "${intendedTargetTemplateId}"`);
    }

    // Check fingerprint
    if (fingerprintMatches.some(fp => fp.template_id === t.id)) {
      score += 70;
      evidenceCategories.push('PACKAGE_FINGERPRINT');
      reasons.push(`Source bytecode fingerprint matches a previous version of "${t.id}"`);
    }

    // Check name similarity
    if (t.name && packageMetadata.detectedName && t.name.toLowerCase().trim() === packageMetadata.detectedName.toLowerCase().trim()) {
      score += 50;
      evidenceCategories.push('NAME_MATCH');
      reasons.push(`Template display name "${t.name}" matches package title`);
    }

    if (score > 0) {
      candidatesMap.set(t.id, {
        templateId: t.id,
        slug: t.slug,
        name: t.name,
        category: t.category,
        thumbnail: t.thumbnail,
        status: t.status,
        currentVersionId: t.current_version_id,
        currentVersionLabel: 'v1.0.0',
        lockVersion: t.lock_version || 1,
        score,
        evidenceCategories,
        reasons,
        updatedAt: t.updated_at
      });
    }
  }

  // Identity conflict detection:
  // e.g. Package ID points to Template A, but package Slug points to Template B
  const idMatchTpl = allTemplates.find(t => packageMetadata.canonicalTemplateId && t.id.toLowerCase() === packageMetadata.canonicalTemplateId.toLowerCase());
  const slugMatchTpl = allTemplates.find(t => packageMetadata.detectedSlug && t.slug.toLowerCase() === packageMetadata.detectedSlug.toLowerCase());

  if (idMatchTpl && slugMatchTpl && idMatchTpl.id !== slugMatchTpl.id) {
    conflicts.push({
      code: 'ID_SLUG_CROSS_COLLISION',
      message: `Package declared template ID "${packageMetadata.canonicalTemplateId}" belongs to "${idMatchTpl.name}" (${idMatchTpl.id}), but detected slug "/${packageMetadata.detectedSlug}" belongs to "${slugMatchTpl.name}" (${slugMatchTpl.id}).`
    });
  }

  const candidates = Array.from(candidatesMap.values()).sort((a, b) => b.score - a.score);

  let outcome = RECOGNITION_OUTCOME.NO_EXISTING_MATCH;
  let summary = 'No existing template matched. Package will create a brand-new template.';
  let selectedTargetTemplateId = null;

  if (conflicts.length > 0) {
    outcome = RECOGNITION_OUTCOME.IDENTITY_CONFLICT;
    summary = 'Identity conflict detected across template ID and slug bindings. Explicit resolution required.';
    selectedTargetTemplateId = idMatchTpl ? idMatchTpl.id : (candidates[0]?.templateId || null);
  } else if (candidates.length === 1 && candidates[0].score >= 90) {
    outcome = RECOGNITION_OUTCOME.EXACT_EXISTING_IDENTITY;
    summary = `Exact match found for existing template "${candidates[0].name}" (${candidates[0].templateId}).`;
    selectedTargetTemplateId = candidates[0].templateId;
  } else if (candidates.length > 1) {
    outcome = RECOGNITION_OUTCOME.MULTIPLE_POSSIBLE_MATCHES;
    summary = `Found ${candidates.length} possible matching templates. Select a target template to compare.`;
    selectedTargetTemplateId = intendedTargetTemplateId || candidates[0].templateId;
  } else if (candidates.length === 1) {
    outcome = RECOGNITION_OUTCOME.POSSIBLE_EXISTING_MATCH;
    summary = `Possible existing template match for "${candidates[0].name}" (${candidates[0].templateId}).`;
    selectedTargetTemplateId = candidates[0].templateId;
  }

  return {
    outcome,
    summary,
    candidates,
    conflicts,
    selectedTargetTemplateId
  };
}

/**
 * Computes deep side-by-side diff between an existing template and the staged package
 */
export function compareExistingTemplateWithStagedPackage({ existingContext, stagedPackage, adminOverrides = {} }) {
  const existingFiles = (existingContext && existingContext.files) || [];
  const existingFileContents = (existingContext && existingContext.fileContentsMap) || new Map();
  const stagedFiles = (stagedPackage && stagedPackage.filesMap) || new Map();

  const existingManifest = (existingContext && existingContext.version && safeJsonParse(existingContext.version.manifest_json, {})) || {};
  const stagedManifest = (stagedPackage && stagedPackage.manifest) || {};

  // 1. Files Diff
  const fileItems = [];
  const existingPaths = new Set(existingFiles.map(f => (f.relative_path || f.path || '').toLowerCase()));
  for (const k of existingFileContents.keys()) {
    existingPaths.add(k.toLowerCase());
  }

  let addedCount = 0;
  let modifiedCount = 0;
  let unchangedCount = 0;
  let removedCount = 0;
  let renamedCount = 0;

  for (const [sRel, sObj] of stagedFiles.entries()) {
    const cleanLower = sRel.toLowerCase();
    if (existingPaths.has(cleanLower)) {
      modifiedCount++;
      fileItems.push({ path: sRel, status: 'modified', sizeBytes: sObj.sizeBytes });
    } else {
      addedCount++;
      fileItems.push({ path: sRel, status: 'added', sizeBytes: sObj.sizeBytes });
    }
  }

  for (const exPath of existingPaths) {
    if (!stagedFiles.has(exPath)) {
      removedCount++;
      fileItems.push({ path: exPath, status: 'removed' });
    }
  }

  const filesSummary = {
    addedCount,
    modifiedCount,
    unchangedCount,
    removedCount,
    renamedCount,
    invalidCount: 0
  };

  // 2. Manifest Diff
  const exSecs = existingManifest.sections || [];
  const stSecs = stagedManifest.sections || [];
  const exFields = existingManifest.fields || [];
  const stFields = stagedManifest.fields || [];
  const exActs = existingManifest.actions || [];
  const stActs = stagedManifest.actions || [];
  const exVars = existingManifest.variants || [];
  const stVars = stagedManifest.variants || [];

  const destructiveWarnings = [];

  // Check removed fields
  const stFieldIds = new Set(stFields.map(f => f.id || f.key));
  for (const f of exFields) {
    const fId = f.id || f.key;
    if (fId && !stFieldIds.has(fId)) {
      destructiveWarnings.push({
        type: 'FIELD_REMOVED',
        fieldId: fId,
        message: `Field "${fId}" was removed. Existing customer wishes referencing this field may lose personalized text.`
      });
    }
  }

  // Check removed sections
  const stSecIds = new Set(stSecs.map(s => s.id));
  for (const s of exSecs) {
    if (s.id && !stSecIds.has(s.id)) {
      destructiveWarnings.push({
        type: 'SECTION_REMOVED',
        sectionId: s.id,
        message: `Section "${s.id}" was removed in the new package.`
      });
    }
  }

  const manifestDiff = {
    sections: {
      added: stSecs.filter(s => !exSecs.some(e => e.id === s.id)),
      removed: exSecs.filter(e => !stSecs.some(s => s.id === e.id)),
      modified: stSecs.filter(s => exSecs.some(e => e.id === s.id))
    },
    fields: {
      added: stFields.filter(f => !exFields.some(e => (e.id || e.key) === (f.id || f.key))),
      removed: exFields.filter(e => !stFields.some(f => (f.id || f.key) === (e.id || e.key))),
      modified: stFields.filter(f => exFields.some(e => (e.id || e.key) === (f.id || f.key)))
    },
    actions: {
      added: stActs.filter(a => !exActs.some(e => e.id === a.id)),
      removed: exActs.filter(e => !stActs.some(a => a.id === e.id)),
      modified: stActs.filter(a => exActs.some(e => e.id === a.id))
    },
    variants: {
      added: stVars.filter(v => !exVars.some(e => (e.relationship || e.relationship_slug) === (v.relationship || v.relationship_slug))),
      removed: exVars.filter(e => !stVars.some(v => (v.relationship || v.relationship_slug) === (e.relationship || e.relationship_slug))),
      modified: stVars.filter(v => exVars.some(e => (e.relationship || e.relationship_slug) === (v.relationship || v.relationship_slug)))
    }
  };

  const variantCatalog = [
    { slug: 'default', label: 'Default Experience', existsInExisting: true, existsInStaged: true }
  ];

  return {
    existingTemplate: existingContext?.template || null,
    files: {
      summary: filesSummary,
      items: fileItems
    },
    manifestDiff,
    destructiveWarnings,
    variantCatalog
  };
}

/**
 * Stages an uploaded template ZIP, runs inspection, and performs candidate recognition
 */
export async function stageAndRecognizeTemplateZip({
  db,
  env = {},
  zipBuffer,
  filename = 'template-package.zip',
  intendedTargetTemplateId = null,
  idempotencyKey = null,
  adminUser = {},
  zipLimits = {}
}) {
  if (db) {
    await ensureTemplateIngestionSchema(db);
  }

  // Idempotency check
  if (db && idempotencyKey) {
    const existingRow = await db
      .prepare('SELECT * FROM template_import_sessions WHERE idempotency_key = ? LIMIT 1')
      .bind(idempotencyKey)
      .first()
      .catch(() => null);

    if (existingRow && existingRow.state !== IMPORT_SESSION_STATE.FAILED && existingRow.state !== IMPORT_SESSION_STATE.CANCELLED) {
      return formatImportSessionResponse(db, existingRow);
    }
  }

  const sessionId = `tis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const previewToken = `prev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  let inspectResult;
  try {
    inspectResult = await inspectAndValidateTemplateZip(zipBuffer, { filename, zipLimits });
  } catch (err) {
    // Record failure in DB if available
    if (db) {
      await db
        .prepare(`
          INSERT INTO template_import_sessions (
            id, idempotency_key, admin_id, admin_email, state, recognition_outcome,
            error_code, error_message, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          sessionId,
          idempotencyKey,
          adminUser.id || 'admin',
          adminUser.email || '',
          IMPORT_SESSION_STATE.FAILED,
          RECOGNITION_OUTCOME.INVALID_OR_UNSUPPORTED_PACKAGE,
          err.code || 'INSPECTION_FAILED',
          err.message,
          now,
          now
        )
        .run()
        .catch(() => {});
    }

    const failureSession = {
      sessionId,
      state: IMPORT_SESSION_STATE.FAILED,
      recognitionOutcome: RECOGNITION_OUTCOME.INVALID_OR_UNSUPPORTED_PACKAGE,
      validation: {
        valid: false,
        validationErrors: [{ code: err.code || 'INSPECTION_FAILED', message: err.message }],
        securityErrors: []
      },
      error: { code: err.code || 'INSPECTION_FAILED', message: err.message }
    };
    return failureSession;
  }

  // Run recognition
  const recResult = await recognizeTemplatePackage({
    db,
    packageMetadata: inspectResult.packageMetadata,
    manifest: inspectResult.manifest,
    filesInventory: inspectResult.filesInventory,
    intendedTargetTemplateId,
    env
  });

  // Prepare staged bundle serialization for preview & publishing
  const stagedFilesList = [];
  for (const [path, f] of inspectResult.filesMap.entries()) {
    stagedFilesList.push({
      path,
      sizeBytes: f.sizeBytes,
      mimeType: f.mimeType,
      isBase64: true,
      contentBase64: uint8ArrayToBase64(f.content)
    });
  }
  const stagedBundleJson = JSON.stringify({ files: stagedFilesList });

  // Run comparison if a target template is selected
  let comparisonReport = {};
  let baseLockVersion = 1;
  let basePublishedVersionId = null;

  if (db && recResult.selectedTargetTemplateId) {
    const existingContext = await loadSingleTemplateComparisonContext(db, recResult.selectedTargetTemplateId, env);
    if (existingContext && existingContext.template) {
      comparisonReport = compareExistingTemplateWithStagedPackage({
        existingContext,
        stagedPackage: inspectResult
      });
      baseLockVersion = existingContext.template.lock_version || 1;
      basePublishedVersionId = existingContext.template.current_version_id || null;
    }
  }

  const row = {
    id: sessionId,
    operation_id: null,
    idempotency_key: idempotencyKey,
    admin_id: adminUser.id || 'admin',
    admin_email: adminUser.email || '',
    state: IMPORT_SESSION_STATE.RECOGNIZED,
    intended_target_template_id: intendedTargetTemplateId,
    selected_target_template_id: recResult.selectedTargetTemplateId,
    decision_mode: IMPORT_DECISION_MODE.UNDECIDED,
    recognition_outcome: recResult.outcome,
    recognition_summary: recResult.summary,
    recognition_report_json: JSON.stringify({ candidates: recResult.candidates, conflicts: recResult.conflicts }),
    package_metadata_json: JSON.stringify(inspectResult.packageMetadata),
    package_fingerprint: inspectResult.packageFingerprint,
    source_zip_sha256: inspectResult.sourceZipSha256,
    runtime_hash: inspectResult.runtimeHash,
    schema_hash: inspectResult.schemaHash,
    manifest_json: JSON.stringify(inspectResult.manifest),
    files_inventory_json: JSON.stringify(inspectResult.filesInventory),
    staged_files_bundle_json: stagedBundleJson,
    validation_report_json: JSON.stringify({
      valid: inspectResult.valid,
      validationErrors: inspectResult.validationErrors,
      securityErrors: inspectResult.securityErrors,
      warnings: inspectResult.warnings
    }),
    comparison_report_json: JSON.stringify(comparisonReport),
    admin_config_overrides_json: '{}',
    base_template_lock_version: baseLockVersion,
    base_published_version_id: basePublishedVersionId,
    published_template_id: null,
    published_version_id: null,
    published_version_label: null,
    preview_token: previewToken,
    warnings_acknowledged: 0,
    error_code: null,
    error_message: null,
    created_at: now,
    updated_at: now,
    published_at: null,
    cancelled_at: null
  };

  if (db) {
    await db
      .prepare(`
        INSERT INTO template_import_sessions (
          id, idempotency_key, admin_id, admin_email, state,
          intended_target_template_id, selected_target_template_id, decision_mode,
          recognition_outcome, recognition_summary, recognition_report_json,
          package_metadata_json, package_fingerprint, source_zip_sha256,
          runtime_hash, schema_hash, manifest_json, files_inventory_json,
          staged_files_bundle_json, validation_report_json, comparison_report_json,
          admin_config_overrides_json, base_template_lock_version, base_published_version_id,
          preview_token, warnings_acknowledged, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?
        )
      `)
      .bind(
        row.id, row.idempotency_key, row.admin_id, row.admin_email, row.state,
        row.intended_target_template_id, row.selected_target_template_id, row.decision_mode,
        row.recognition_outcome, row.recognition_summary, row.recognition_report_json,
        row.package_metadata_json, row.package_fingerprint, row.source_zip_sha256,
        row.runtime_hash, row.schema_hash, row.manifest_json, row.files_inventory_json,
        row.staged_files_bundle_json, row.validation_report_json, row.comparison_report_json,
        row.admin_config_overrides_json, row.base_template_lock_version, row.base_published_version_id,
        row.preview_token, row.warnings_acknowledged, row.created_at, row.updated_at
      )
      .run()
      .catch((e) => {
        console.warn('[Session insert error]', e);
      });
  }

  return formatImportSessionResponse(db, row);
}

/**
 * Formats an import session row into the client-facing response structure
 */
export function formatImportSessionResponse(db, row) {
  if (!row) return null;

  const previewToken = row.preview_token || '';
  const selectedTargetId = row.selected_target_template_id;

  return {
    sessionId: row.id,
    operationId: row.operation_id,
    state: row.state,
    recognitionOutcome: row.recognition_outcome,
    recognitionSummary: row.recognition_summary,
    selectedTargetTemplateId: selectedTargetId,
    intendedTargetTemplateId: row.intended_target_template_id,
    decisionMode: row.decision_mode,
    packageMetadata: safeJsonParse(row.package_metadata_json, {}),
    manifest: safeJsonParse(row.manifest_json, {}),
    validation: safeJsonParse(row.validation_report_json, { valid: true }),
    comparison: safeJsonParse(row.comparison_report_json, {}),
    adminConfigOverrides: safeJsonParse(row.admin_config_overrides_json, {}),
    candidates: safeJsonParse(row.recognition_report_json, {}).candidates || [],
    conflicts: safeJsonParse(row.recognition_report_json, {}).conflicts || [],
    previewUrls: {
      staged: `/api/templates/import-studio/${row.id}/preview/staged/index.html?token=${previewToken}`,
      existing: selectedTargetId
        ? `/api/templates/import-studio/${row.id}/preview/existing/index.html?token=${previewToken}&templateId=${selectedTargetId}`
        : null
    },
    baseTemplateLockVersion: row.base_template_lock_version || 1,
    publishedTemplateId: row.published_template_id,
    publishedVersionId: row.published_version_id,
    publishedVersionLabel: row.published_version_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    cancelledAt: row.cancelled_at
  };
}

/**
 * Re-runs comparison of a session against a newly selected candidate target template
 */
export async function compareImportSessionWithTarget({ db, env = {}, sessionId, targetTemplateId }) {
  if (!db || !sessionId) {
    const err = new Error('Database and sessionId required');
    err.code = 'INVALID_ARGS';
    throw err;
  }

  await ensureTemplateIngestionSchema(db);

  const row = await db
    .prepare('SELECT * FROM template_import_sessions WHERE id = ? LIMIT 1')
    .bind(sessionId)
    .first();

  if (!row) {
    const err = new Error(`Import session "${sessionId}" not found.`);
    err.code = 'SESSION_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const existingContext = await loadSingleTemplateComparisonContext(db, targetTemplateId, env);
  if (!existingContext || !existingContext.template) {
    const err = new Error(`Target template "${targetTemplateId}" not found.`);
    err.code = 'TEMPLATE_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const stagedFilesMap = deserializeStagedFilesBundle(safeJsonParse(row.staged_files_bundle_json, {}));
  const stagedManifest = safeJsonParse(row.manifest_json, {});

  const comparison = compareExistingTemplateWithStagedPackage({
    existingContext,
    stagedPackage: { filesMap: stagedFilesMap, manifest: stagedManifest }
  });

  const now = new Date().toISOString();
  await db
    .prepare(`
      UPDATE template_import_sessions
      SET selected_target_template_id = ?,
          comparison_report_json = ?,
          base_template_lock_version = ?,
          base_published_version_id = ?,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(
      targetTemplateId,
      JSON.stringify(comparison),
      existingContext.template.lock_version || 1,
      existingContext.template.current_version_id || null,
      now,
      sessionId
    )
    .run();

  const updatedRow = await db
    .prepare('SELECT * FROM template_import_sessions WHERE id = ? LIMIT 1')
    .bind(sessionId)
    .first();

  return formatImportSessionResponse(db, updatedRow);
}

/**
 * Validates the admin's decision (Option A: update existing vs Option B: create new)
 */
export async function validateImportSessionDecision({
  db,
  env = {},
  sessionId,
  decisionMode,
  targetTemplateId = null,
  newTemplateId = null,
  newTemplateSlug = null,
  newTemplateName = null,
  allowSlugChange = false,
  adminConfigOverrides = null,
  warningsAcknowledged = false,
  resolveConflictConfirmed = false
}) {
  if (!db || !sessionId) {
    const err = new Error('Database and sessionId required');
    err.code = 'INVALID_ARGS';
    throw err;
  }

  await ensureTemplateIngestionSchema(db);

  const row = await db
    .prepare('SELECT * FROM template_import_sessions WHERE id = ? LIMIT 1')
    .bind(sessionId)
    .first();

  if (!row) {
    const err = new Error(`Import session "${sessionId}" not found.`);
    err.code = 'SESSION_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const recReport = safeJsonParse(row.recognition_report_json, {});
  const conflicts = recReport.conflicts || [];
  const compReport = safeJsonParse(row.comparison_report_json, {});
  const destructiveWarnings = compReport.destructiveWarnings || [];

  if (conflicts.length > 0 && !resolveConflictConfirmed) {
    const err = new Error('Identity conflict detected. You must explicitly confirm resolving this conflict.');
    err.code = 'CONFLICT_CONFIRMATION_REQUIRED';
    err.status = 400;
    err.conflicts = conflicts;
    throw err;
  }

  if (decisionMode === IMPORT_DECISION_MODE.UPDATE_EXISTING) {
    const targetId = targetTemplateId || row.selected_target_template_id;
    if (!targetId) {
      const err = new Error('Target template must be selected to update an existing template.');
      err.code = 'TARGET_TEMPLATE_REQUIRED';
      err.status = 400;
      throw err;
    }

    const exTpl = await db
      .prepare('SELECT * FROM templates WHERE id = ? LIMIT 1')
      .bind(targetId)
      .first();

    if (!exTpl) {
      const err = new Error(`Target template "${targetId}" not found in database.`);
      err.code = 'TEMPLATE_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (destructiveWarnings.length > 0 && !warningsAcknowledged) {
      const err = new Error(`Package contains ${destructiveWarnings.length} destructive removal(s). Acknowledge warnings before proceeding.`);
      err.code = 'DESTRUCTIVE_CHANGES_UNACKNOWLEDGED';
      err.status = 400;
      err.destructiveWarnings = destructiveWarnings;
      throw err;
    }
  } else if (decisionMode === IMPORT_DECISION_MODE.CREATE_NEW) {
    const pkgMeta = safeJsonParse(row.package_metadata_json, {});
    const cleanSlug = (newTemplateSlug || pkgMeta.detectedSlug || 'custom-template').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const cleanId = (newTemplateId || `tpl_${cleanSlug.replace(/-/g, '_')}`).trim();

    // Check slug collision
    const existingWithSlug = await db
      .prepare('SELECT id, name FROM templates WHERE slug = ? LIMIT 1')
      .bind(cleanSlug)
      .first();

    if (existingWithSlug) {
      const err = new Error(`Slug "/${cleanSlug}" is already in use by template "${existingWithSlug.name}" (${existingWithSlug.id}). Choose a unique slug.`);
      err.code = 'SLUG_ALREADY_EXISTS';
      err.status = 409;
      err.existingOwner = existingWithSlug;
      throw err;
    }

    // Check ID collision
    const existingWithId = await db
      .prepare('SELECT id, name FROM templates WHERE id = ? LIMIT 1')
      .bind(cleanId)
      .first();

    if (existingWithId) {
      const err = new Error(`Template ID "${cleanId}" already exists. Choose a unique template ID.`);
      err.code = 'TEMPLATE_ID_ALREADY_EXISTS';
      err.status = 409;
      throw err;
    }
  } else {
    const err = new Error(`Invalid decision mode "${decisionMode}". Must be "update_existing" or "create_new".`);
    err.code = 'INVALID_DECISION_MODE';
    err.status = 400;
    throw err;
  }

  const now = new Date().toISOString();
  await db
    .prepare(`
      UPDATE template_import_sessions
      SET decision_mode = ?,
          admin_config_overrides_json = ?,
          warnings_acknowledged = ?,
          state = ?,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(
      decisionMode,
      JSON.stringify(adminConfigOverrides || {}),
      warningsAcknowledged ? 1 : 0,
      IMPORT_SESSION_STATE.VALIDATED,
      now,
      sessionId
    )
    .run();

  const updatedRow = await db
    .prepare('SELECT * FROM template_import_sessions WHERE id = ? LIMIT 1')
    .bind(sessionId)
    .first();

  return formatImportSessionResponse(db, updatedRow);
}

/**
 * Atomically publishes an import session into production D1 & storage
 */
export async function publishImportSession({
  db,
  env = {},
  sessionId,
  expectedLockVersion = null,
  warningsAcknowledged = false,
  releaseNotes = '',
  adminUser = {},
  storageProvider = null,
  imgbbProvider = null
}) {
  if (!db || !sessionId) {
    const err = new Error('Database and sessionId required');
    err.code = 'INVALID_ARGS';
    throw err;
  }

  await ensureTemplateIngestionSchema(db);

  const session = await db
    .prepare('SELECT * FROM template_import_sessions WHERE id = ? LIMIT 1')
    .bind(sessionId)
    .first();

  if (!session) {
    const err = new Error(`Import session "${sessionId}" not found.`);
    err.code = 'SESSION_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  if (session.state === IMPORT_SESSION_STATE.PUBLISHED) {
    return {
      success: true,
      decisionMode: session.decision_mode,
      publishedTemplateId: session.published_template_id,
      publishedVersionId: session.published_version_id,
      publishedVersionLabel: session.published_version_label,
      previousVersionId: session.base_published_version_id,
      packageMetadata: safeJsonParse(session.package_metadata_json, {})
    };
  }

  const decisionMode = session.decision_mode || IMPORT_DECISION_MODE.UPDATE_EXISTING;
  const stagedBundle = safeJsonParse(session.staged_files_bundle_json, {});
  const filesMap = deserializeStagedFilesBundle(stagedBundle);
  const manifest = safeJsonParse(session.manifest_json, {});
  const overrides = safeJsonParse(session.admin_config_overrides_json, {});
  const pkgMeta = safeJsonParse(session.package_metadata_json, {});
  const now = new Date().toISOString();

  let targetTemplateId = session.selected_target_template_id;
  let previousVersionId = session.base_published_version_id;
  let newVersionLabel = pkgMeta.declaredVersion || 'v1.0.0';
  const newVersionId = `ver_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  if (decisionMode === IMPORT_DECISION_MODE.UPDATE_EXISTING) {
    if (!targetTemplateId) {
      const err = new Error('Target template ID missing for update_existing publication');
      err.code = 'TARGET_TEMPLATE_MISSING';
      err.status = 400;
      throw err;
    }

    const tpl = await db
      .prepare('SELECT * FROM templates WHERE id = ? LIMIT 1')
      .bind(targetTemplateId)
      .first();

    if (!tpl) {
      const err = new Error(`Target template "${targetTemplateId}" not found`);
      err.code = 'TEMPLATE_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    // Optimistic Concurrency Check
    if (expectedLockVersion !== null && expectedLockVersion !== undefined) {
      const currentLock = tpl.lock_version || 1;
      if (Number(expectedLockVersion) !== currentLock) {
        const err = new Error(`Optimistic concurrency lock conflict: expected lock version ${expectedLockVersion}, but current is ${currentLock}.`);
        err.code = 'CONCURRENCY_CONFLICT';
        err.status = 409;
        err.currentLockVersion = currentLock;
        throw err;
      }
    }

    previousVersionId = tpl.current_version_id;

    // Calculate next version label
    try {
      const existingVersions = await db
        .prepare('SELECT version_number, version_label FROM template_versions WHERE template_id = ?')
        .bind(targetTemplateId)
        .all();
      const rows = Array.isArray(existingVersions) ? existingVersions : (existingVersions?.results || []);
      const nextVer = generateNextVersion(rows, 'minor');
      newVersionLabel = nextVer.versionLabel;
    } catch (_) {}

    // Insert new version into template_versions
    await db
      .prepare(`
        INSERT INTO template_versions (
          id, template_id, name, version_number, version_label, status,
          package_fingerprint, source_zip_hash, runtime_hash, schema_hash,
          manifest_json, base_version_id, change_summary_json, import_session_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        newVersionId,
        targetTemplateId,
        tpl.name || pkgMeta.detectedName || 'Template Version',
        parseInt(newVersionLabel.replace(/[^0-9]/g, '')) || Date.now(),
        newVersionLabel,
        'published',
        session.package_fingerprint,
        session.source_zip_sha256,
        session.runtime_hash,
        session.schema_hash,
        session.manifest_json,
        previousVersionId,
        session.comparison_report_json,
        sessionId,
        now,
        now
      )
      .run();

    // Update template row with new current version and increment lock_version
    await db
      .prepare(`
        UPDATE templates
        SET current_version_id = ?,
            rollback_version_id = ?,
            lock_version = (lock_version + 1),
            updated_at = ?
        WHERE id = ?
      `)
      .bind(newVersionId, previousVersionId, now, targetTemplateId)
      .run();
  } else {
    // CREATE_NEW template
    targetTemplateId = overrides.newTemplateId || pkgMeta.canonicalTemplateId || `tpl_${Date.now()}`;
    const cleanSlug = overrides.newTemplateSlug || pkgMeta.detectedSlug || `template-${Date.now()}`;
    const cleanName = overrides.newTemplateName || pkgMeta.detectedName || 'New Template';
    newVersionLabel = 'v1.0.0';

    await db
      .prepare(`
        INSERT INTO templates (
          id, slug, name, category, description, status,
          current_version_id, lock_version, thumbnail, folder, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
      `)
      .bind(
        targetTemplateId,
        cleanSlug,
        cleanName,
        overrides.category || manifest.template?.category || 'Birthday',
        overrides.description || manifest.template?.description || '',
        'published',
        newVersionId,
        overrides.thumbnail || manifest.template?.thumbnail || '/assets/file_ab2082.png',
        cleanSlug,
        now,
        now
      )
      .run();

    await db
      .prepare(`
        INSERT INTO template_versions (
          id, template_id, name, version_number, version_label, status,
          package_fingerprint, source_zip_hash, runtime_hash, schema_hash,
          manifest_json, import_session_id, created_at, updated_at
        ) VALUES (?, ?, ?, 1, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        newVersionId,
        targetTemplateId,
        cleanName,
        newVersionLabel,
        session.package_fingerprint,
        session.source_zip_sha256,
        session.runtime_hash,
        session.schema_hash,
        session.manifest_json,
        sessionId,
        now,
        now
      )
      .run();
  }

  // Persist files into template_files
  for (const [relPath, fObj] of filesMap.entries()) {
    const sha = await computeSha256Hex(fObj.content);
    await db
      .prepare(`
        INSERT OR REPLACE INTO template_files (
          id, template_id, version_id, relative_path, file_role,
          mime_type, size_bytes, sha256_hash, storage_provider, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'b2', ?)
      `)
      .bind(
        `tf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        targetTemplateId,
        newVersionId,
        relPath,
        relPath === 'index.html' ? 'entry_html' : 'asset',
        fObj.mimeType || getMimeType(relPath),
        fObj.sizeBytes,
        sha,
        now
      )
      .run()
      .catch(() => {});
  }

  // Persist variants into template_relationship_variants
  const rawVariants = Array.isArray(manifest.variants) ? manifest.variants : [];
  for (const v of rawVariants) {
    const relSlug = v.relationship || v.relationship_slug || 'default';
    await db
      .prepare(`
        INSERT OR REPLACE INTO template_relationship_variants (
          id, template_id, relationship_slug, title, is_active, configuration_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `)
      .bind(
        `trv_${targetTemplateId}_${relSlug}`,
        targetTemplateId,
        relSlug,
        v.title || relSlug,
        JSON.stringify(v),
        now,
        now
      )
      .run()
      .catch(() => {});
  }

  // Update session to PUBLISHED
  await db
    .prepare(`
      UPDATE template_import_sessions
      SET state = ?,
          published_template_id = ?,
          published_version_id = ?,
          published_version_label = ?,
          published_at = ?,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(
      IMPORT_SESSION_STATE.PUBLISHED,
      targetTemplateId,
      newVersionId,
      newVersionLabel,
      now,
      now,
      sessionId
    )
    .run();

  return {
    success: true,
    decisionMode,
    publishedTemplateId: targetTemplateId,
    publishedVersionId: newVersionId,
    publishedVersionLabel: newVersionLabel,
    previousVersionId,
    packageMetadata: pkgMeta
  };
}

/**
 * Cancels an active import session and marks it CANCELLED
 */
export async function cancelImportSession({ db, sessionId }) {
  if (!db || !sessionId) {
    const err = new Error('Database and sessionId required');
    err.code = 'INVALID_ARGS';
    throw err;
  }

  await ensureTemplateIngestionSchema(db);

  const now = new Date().toISOString();
  await db
    .prepare(`
      UPDATE template_import_sessions
      SET state = ?,
          cancelled_at = ?,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(IMPORT_SESSION_STATE.CANCELLED, now, now, sessionId)
    .run();

  return {
    success: true,
    sessionId,
    cancelledAt: now
  };
}
