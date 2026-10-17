import { webcrypto as _nodeWebCrypto } from 'node:crypto';
if (!globalThis.crypto) { globalThis.crypto = _nodeWebCrypto; }

/**
 * WishMagic Smart Template Recognition, Side-by-Side Preview & Safe Update Engine (Part 50)
 * =========================================================================================
 * Responsibilities:
 * 1. Strict ZIP archive & security validation (magic bytes, corrupt archive, size/count/depth
 *    limits, compression ratio / zip-bomb detection, path traversal, absolute paths, duplicate
 *    normalized paths, case collisions, symlinks, forbidden executables, UTF-8 encoding,
 *    missing entry HTML, malformed JSON, unsupported schema versions).
 * 2. Automatic Template Recognition Engine in strict priority order:
 *    A. Stable Template ID (manifest.template.id / manifest.id)
 *    B. Existing normalized slug (manifest.template.slug)
 *    C. Explicit update metadata (templateId, templateSlug, version, baseVersion, updateTarget)
 *    D. Cryptographic SHA-256 file fingerprints
 *    E. Structural similarity (sections, subsections, variants, fields, actions, entry HTML)
 *    F. Display name (supporting evidence only — never triggers an automatic update)
 * 3. Recognition Outcomes:
 *    - EXACT_EXISTING_IDENTITY
 *    - POSSIBLE_EXISTING_MATCH
 *    - MULTIPLE_POSSIBLE_MATCHES
 *    - NO_EXISTING_MATCH
 *    - IDENTITY_CONFLICT
 *    - INVALID_OR_UNSUPPORTED_PACKAGE
 * 4. Deep File & Manifest/UTP v1.2.0 Comparison Engine + Destructive-Change Warnings.
 * 5. Isolated Sandboxed Preview Renderer + Preview Diagnostics (missing HTML/CSS/JS/media,
 *    broken internal links, invalid variants, runtime JS errors, security isolation).
 * 6. Import Session Lifecycle State Machine & Server-Side Decision Validation.
 */

import JSZip from './vendor/jszip.js';
import { computeSha256Hex, getMimeType, getB2Config, B2StorageProvider } from './storage-provider.js';
import {
  UTP_SUPPORTED_SCHEMA_VERSIONS,
  UTP_SUPPORTED_ACTION_TYPES,
  normalizeRelationshipIdentifier
} from './template-protocol-schema.js';
import {
  validateUtpManifest,
  normalizeManifestToUtp
} from './template-protocol-validator.js';
import {
  resolveEffectiveTemplateConfiguration
} from './template-variant-engine.js';
import {
  ZIP_LIMITS,
  DANGEROUS_EXTENSIONS,
  classifyFileRole,
  analyzeHtmlString,
  createZipFromFiles
} from './template-ingest-pipeline.js';

export const RECOGNITION_OUTCOME = Object.freeze({
  EXACT_EXISTING_IDENTITY: 'EXACT_EXISTING_IDENTITY',
  POSSIBLE_EXISTING_MATCH: 'POSSIBLE_EXISTING_MATCH',
  MULTIPLE_POSSIBLE_MATCHES: 'MULTIPLE_POSSIBLE_MATCHES',
  NO_EXISTING_MATCH: 'NO_EXISTING_MATCH',
  IDENTITY_CONFLICT: 'IDENTITY_CONFLICT',
  INVALID_OR_UNSUPPORTED_PACKAGE: 'INVALID_OR_UNSUPPORTED_PACKAGE'
});

export const IMPORT_SESSION_STATE = Object.freeze({
  UPLOADED: 'UPLOADED',
  INSPECTING: 'INSPECTING',
  RECOGNIZED: 'RECOGNIZED',
  PREVIEW_READY: 'PREVIEW_READY',
  VALIDATING: 'VALIDATING',
  READY_TO_PUBLISH: 'READY_TO_PUBLISH',
  PUBLISHING: 'PUBLISHING',
  PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
});

export const IMPORT_DECISION_MODE = Object.freeze({
  UNDECIDED: 'undecided',
  UPDATE_EXISTING: 'update_existing',
  CREATE_NEW: 'create_new',
  CANCELLED: 'cancelled'
});

export const ALLOWED_IMPORT_STATE_TRANSITIONS = Object.freeze({
  UPLOADED: ['INSPECTING', 'FAILED', 'CANCELLED'],
  INSPECTING: ['RECOGNIZED', 'PREVIEW_READY', 'FAILED', 'CANCELLED'],
  RECOGNIZED: ['PREVIEW_READY', 'VALIDATING', 'FAILED', 'CANCELLED'],
  PREVIEW_READY: ['PREVIEW_READY', 'VALIDATING', 'READY_TO_PUBLISH', 'FAILED', 'CANCELLED'],
  VALIDATING: ['READY_TO_PUBLISH', 'PREVIEW_READY', 'FAILED', 'CANCELLED'],
  READY_TO_PUBLISH: ['VALIDATING', 'READY_TO_PUBLISH', 'PUBLISHING', 'PREVIEW_READY', 'FAILED', 'CANCELLED'],
  PUBLISHING: ['PUBLISHED', 'FAILED'],
  PUBLISHED: ['PUBLISHED'],
  FAILED: ['INSPECTING', 'VALIDATING', 'CANCELLED', 'FAILED'],
  CANCELLED: ['CANCELLED']
});

export function validateImportStateTransition(currentState, nextState) {
  const from = String(currentState || 'UPLOADED').toUpperCase();
  const to = String(nextState || '').toUpperCase();
  const allowed = ALLOWED_IMPORT_STATE_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    const err = new Error(`Invalid import session state transition from "${from}" to "${to}".`);
    err.code = 'INVALID_IMPORT_STATE_TRANSITION';
    err.status = 400;
    err.fromState = from;
    err.toState = to;
    throw err;
  }
  return true;
}

const STRICT_FORBIDDEN_EXTENSIONS = /\.(exe|sh|bat|cmd|com|vbs|php|py|pl|cgi|jar|war|scr|msi|dll|so|elf|bin|ps1|jsp|asp|aspx|rb|hta|pif|reg)$/i;
const ALLOWED_TEMPLATE_EXTENSIONS = new Set([
  'html', 'htm', 'css', 'js', 'mjs', 'json', 'txt', 'md',
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico', 'avif',
  'mp3', 'wav', 'ogg', 'm4a', 'aac',
  'mp4', 'webm', 'mov', 'm4v',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'map'
]);
const TEXT_FILE_EXTENSIONS = new Set(['html', 'htm', 'css', 'js', 'mjs', 'json', 'txt', 'md', 'svg']);
const SECRET_FILE_PATTERNS = /(?:^|\/)(?:\.env(?:\..+)?|\.git\/.*|id_rsa.*|.*\.pem|.*\.key|wrangler\.toml|credentials\.json)$/i;
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function normalizeCanonicalTemplateId(rawId) {
  if (!rawId || typeof rawId !== 'string') return '';
  const cleaned = rawId.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!cleaned) return '';
  return cleaned.startsWith('tpl_') ? cleaned : `tpl_${cleaned}`;
}

function normalizeIdentityStem(val) {
  if (!val || typeof val !== 'string') return '';
  return val.trim().toLowerCase().replace(/^tpl_/, '').replace(/^fam_/, '').replace(/[_-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function normalizeTemplateSlug(rawSlug) {
  if (!rawSlug || typeof rawSlug !== 'string') return '';
  return rawSlug
    .trim()
    .toLowerCase()
    .replace(/^tpl_/, '')
    .replace(/^fam_/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function safeJsonParse(str, fallback = null) {
  if (str === null || str === undefined) return fallback;
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(String(str));
  } catch (_) {
    return fallback;
  }
}

function isSymlinkZipEntry(entry) {
  if (!entry) return false;
  // UNIX symlink mode: 0120000 (0o120000 = 40960)
  const unixPerms = Number(entry.unixPermissions || 0);
  if (unixPerms && (unixPerms & 0o170000) === 0o120000) {
    return true;
  }
  const extAttr = Number(entry._data?.externalFileAttributes || 0);
  const unixMode = (extAttr >>> 16) & 0xffff;
  if (unixMode && (unixMode & 0o170000) === 0o120000) {
    return true;
  }
  return false;
}

/**
 * Validates and extracts explicit update metadata from wishmagic.json if declared.
 * Supports backward-compatible optional fields:
 * - templateId / updateTarget.templateId
 * - templateSlug / updateTarget.templateSlug
 * - version / templateVersion
 * - baseVersion / updateTarget.baseVersion
 * - updateTarget (string ID/slug or object)
 */
export function parseAndValidateExplicitUpdateMetadata(rawManifest) {
  const issues = [];
  if (!rawManifest || typeof rawManifest !== 'object') {
    return {
      present: false,
      valid: true,
      metadata: {
        templateId: null,
        templateSlug: null,
        version: null,
        baseVersion: null,
        updateTarget: null
      },
      issues
    };
  }

  const tplBlock = (rawManifest.template && typeof rawManifest.template === 'object') ? rawManifest.template : {};
  const rawUpdateTarget = rawManifest.updateTarget !== undefined ? rawManifest.updateTarget : tplBlock.updateTarget;
  const rawTemplateId = rawManifest.templateId !== undefined ? rawManifest.templateId : tplBlock.templateId;
  const rawTemplateSlug = rawManifest.templateSlug !== undefined ? rawManifest.templateSlug : tplBlock.templateSlug;
  const rawVersion = rawManifest.version !== undefined
    ? rawManifest.version
    : (tplBlock.templateVersion !== undefined ? tplBlock.templateVersion : tplBlock.version);
  const rawBaseVersion = rawManifest.baseVersion !== undefined
    ? rawManifest.baseVersion
    : (tplBlock.baseVersion !== undefined
        ? tplBlock.baseVersion
        : (rawUpdateTarget && typeof rawUpdateTarget === 'object' ? rawUpdateTarget.baseVersion : undefined));

  const validateSafeIdentifier = (val, fieldName) => {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val !== 'string') {
      issues.push({
        code: 'INVALID_UPDATE_METADATA_FIELD',
        severity: 'error',
        field: fieldName,
        message: `Explicit update metadata field "${fieldName}" must be a string.`,
        blocking: true
      });
      return null;
    }
    const trimmed = val.trim();
    if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(trimmed)) {
      issues.push({
        code: 'INVALID_UPDATE_METADATA_FIELD',
        severity: 'error',
        field: fieldName,
        message: `Explicit update metadata field "${fieldName}" ("${trimmed}") contains unsafe or invalid characters.`,
        blocking: true
      });
      return null;
    }
    return trimmed;
  };

  let targetId = validateSafeIdentifier(rawTemplateId, 'templateId');
  let targetSlug = validateSafeIdentifier(rawTemplateSlug, 'templateSlug');
  let updateTargetNormalized = null;

  if (rawUpdateTarget !== undefined && rawUpdateTarget !== null) {
    if (typeof rawUpdateTarget === 'string') {
      const cleanTarget = validateSafeIdentifier(rawUpdateTarget, 'updateTarget');
      if (cleanTarget) {
        updateTargetNormalized = cleanTarget;
        if (!targetId) targetId = cleanTarget;
      }
    } else if (typeof rawUpdateTarget === 'object' && !Array.isArray(rawUpdateTarget)) {
      const utId = validateSafeIdentifier(rawUpdateTarget.templateId || rawUpdateTarget.id, 'updateTarget.templateId');
      const utSlug = validateSafeIdentifier(rawUpdateTarget.templateSlug || rawUpdateTarget.slug, 'updateTarget.templateSlug');
      if (utId && !targetId) targetId = utId;
      if (utSlug && !targetSlug) targetSlug = utSlug;
      updateTargetNormalized = utId || utSlug || null;
    } else {
      issues.push({
        code: 'INVALID_UPDATE_METADATA_FIELD',
        severity: 'error',
        field: 'updateTarget',
        message: 'Field "updateTarget" must be a template identifier string or an object with templateId/templateSlug.',
        blocking: true
      });
    }
  }

  let versionStr = null;
  if (rawVersion !== undefined && rawVersion !== null && rawVersion !== '') {
    if (typeof rawVersion !== 'string' && typeof rawVersion !== 'number') {
      issues.push({
        code: 'INVALID_UPDATE_METADATA_VERSION',
        severity: 'error',
        field: 'version',
        message: 'Declared package version must be a semantic version string.',
        blocking: true
      });
    } else {
      const vClean = String(rawVersion).trim();
      if (!/^v?\d+(?:\.\d+){0,2}(?:-[a-zA-Z0-9.-]+)?$/.test(vClean)) {
        issues.push({
          code: 'INVALID_UPDATE_METADATA_VERSION',
          severity: 'error',
          field: 'version',
          message: `Declared package version "${vClean}" is not a valid version identifier.`,
          blocking: true
        });
      } else {
        versionStr = vClean;
      }
    }
  }

  const baseVersionStr = validateSafeIdentifier(rawBaseVersion, 'baseVersion');
  const present = Boolean(targetId || targetSlug || baseVersionStr || updateTargetNormalized);

  return {
    present,
    valid: issues.length === 0,
    metadata: {
      templateId: targetId,
      templateSlug: targetSlug ? normalizeTemplateSlug(targetSlug) : null,
      version: versionStr,
      baseVersion: baseVersionStr,
      updateTarget: updateTargetNormalized
    },
    issues
  };
}

/**
 * Inspects and strictly validates an uploaded template ZIP buffer or file bundle.
 * Never executes any uploaded script and never writes outside staging memory.
 */
export async function inspectAndValidateTemplateZip(zipInput, options = {}) {
  const limits = {
    MAX_ZIP_BYTES: options.maxZipBytes || ZIP_LIMITS.MAX_ZIP_BYTES,
    MAX_UNCOMPRESSED_BYTES: options.maxUncompressedBytes || ZIP_LIMITS.MAX_UNCOMPRESSED_BYTES,
    MAX_FILE_COUNT: options.maxFileCount || ZIP_LIMITS.MAX_FILE_COUNT,
    MAX_ENTRY_BYTES: options.maxEntryBytes || ZIP_LIMITS.MAX_ENTRY_BYTES,
    MAX_COMPRESSION_RATIO: options.maxCompressionRatio || ZIP_LIMITS.MAX_COMPRESSION_RATIO,
    MAX_DIRECTORY_DEPTH: options.maxDirectoryDepth || ZIP_LIMITS.MAX_DIRECTORY_DEPTH
  };

  const securityErrors = [];
  const validationErrors = [];
  const warnings = [];
  const invalidFiles = [];

  let zipBytes = null;
  if (zipInput instanceof Uint8Array) {
    zipBytes = zipInput;
  } else if (zipInput instanceof ArrayBuffer) {
    zipBytes = new Uint8Array(zipInput);
  } else if (typeof zipInput === 'string') {
    try {
      const cleanB64 = zipInput.replace(/^data:[^;]+;base64,/i, '').replace(/\s+/g, '');
      const bin = atob(cleanB64);
      zipBytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) zipBytes[i] = bin.charCodeAt(i);
    } catch (e) {
      return {
        valid: false,
        canPreview: false,
        errorCode: 'ZIP_INVALID_FORMAT',
        errorMessage: 'Uploaded data is not valid base64 or ZIP archive bytes.',
        securityErrors: [{ code: 'ZIP_INVALID_FORMAT', message: 'Invalid base64 ZIP payload.' }],
        validationErrors: [],
        warnings: [],
        files: new Map(),
        fileRecords: []
      };
    }
  } else if (zipInput && typeof zipInput === 'object') {
    try {
      zipBytes = await createZipFromFiles(zipInput);
    } catch (err) {
      return {
        valid: false,
        canPreview: false,
        errorCode: err.code || 'ZIP_EMPTY',
        errorMessage: err.message,
        securityErrors: [{ code: err.code || 'ZIP_EMPTY', message: err.message }],
        validationErrors: [],
        warnings: [],
        files: new Map(),
        fileRecords: []
      };
    }
  }

  if (!zipBytes || zipBytes.byteLength < 4) {
    return {
      valid: false,
      canPreview: false,
      errorCode: 'ZIP_INVALID_FORMAT',
      errorMessage: 'Uploaded file is empty or smaller than a valid ZIP header.',
      securityErrors: [{ code: 'ZIP_INVALID_FORMAT', message: 'Uploaded file is empty or smaller than 4 bytes.' }],
      validationErrors: [],
      warnings: [],
      files: new Map(),
      fileRecords: []
    };
  }

  if (zipBytes.byteLength > limits.MAX_ZIP_BYTES) {
    return {
      valid: false,
      canPreview: false,
      errorCode: 'ZIP_FILE_TOO_LARGE',
      errorMessage: `ZIP archive size (${zipBytes.byteLength} bytes) exceeds maximum allowed limit (${limits.MAX_ZIP_BYTES} bytes).`,
      securityErrors: [{ code: 'ZIP_FILE_TOO_LARGE', message: `Archive exceeds maximum upload size of ${limits.MAX_ZIP_BYTES} bytes.` }],
      validationErrors: [],
      warnings: [],
      files: new Map(),
      fileRecords: []
    };
  }

  const isZipSignature = (
    zipBytes[0] === 0x50 && zipBytes[1] === 0x4B && (
      (zipBytes[2] === 0x03 && zipBytes[3] === 0x04) ||
      (zipBytes[2] === 0x05 && zipBytes[3] === 0x06) ||
      (zipBytes[2] === 0x07 && zipBytes[3] === 0x08)
    )
  );
  if (!isZipSignature) {
    return {
      valid: false,
      canPreview: false,
      errorCode: 'ZIP_INVALID_FORMAT',
      errorMessage: 'Uploaded file is not a valid ZIP archive (magic bytes mismatch).',
      securityErrors: [{ code: 'ZIP_INVALID_FORMAT', message: 'Uploaded file magic bytes do not match PK ZIP signature.' }],
      validationErrors: [],
      warnings: [],
      files: new Map(),
      fileRecords: []
    };
  }

  let zip;
  try {
    zip = await JSZip.loadAsync(zipBytes);
  } catch (loadErr) {
    return {
      valid: false,
      canPreview: false,
      errorCode: 'ZIP_CORRUPTED',
      errorMessage: `Corrupted or unreadable ZIP archive: ${loadErr.message}`,
      securityErrors: [{ code: 'ZIP_CORRUPTED', message: `Corrupted or unreadable ZIP archive: ${loadErr.message}` }],
      validationErrors: [],
      warnings: [],
      files: new Map(),
      fileRecords: []
    };
  }

  const rawEntries = Object.keys(zip.files);
  const nonDirEntries = rawEntries.filter(p => !zip.files[p].dir);
  if (nonDirEntries.length === 0) {
    return {
      valid: false,
      canPreview: false,
      errorCode: 'ZIP_EMPTY',
      errorMessage: 'ZIP archive contains no files.',
      securityErrors: [{ code: 'ZIP_EMPTY', message: 'ZIP archive contains no files.' }],
      validationErrors: [],
      warnings: [],
      files: new Map(),
      fileRecords: []
    };
  }

  if (nonDirEntries.length > limits.MAX_FILE_COUNT) {
    return {
      valid: false,
      canPreview: false,
      errorCode: 'ZIP_FILE_COUNT_EXCEEDED',
      errorMessage: `ZIP archive contains ${nonDirEntries.length} files, exceeding the limit of ${limits.MAX_FILE_COUNT}.`,
      securityErrors: [{ code: 'ZIP_FILE_COUNT_EXCEEDED', message: `File count ${nonDirEntries.length} exceeds limit ${limits.MAX_FILE_COUNT}.` }],
      validationErrors: [],
      warnings: [],
      files: new Map(),
      fileRecords: []
    };
  }

  // First security pass on raw entry names BEFORE stripping any common prefix
  for (const rawPath of rawEntries) {
    const entry = zip.files[rawPath];
    const slashPath = String(rawPath).replace(/\\/g, '/');

    if (isSymlinkZipEntry(entry)) {
      securityErrors.push({
        code: 'ZIP_SYMLINK_NOT_ALLOWED',
        path: rawPath,
        message: `Symbolic link or special file entry "${rawPath}" is prohibited in template archives.`
      });
      invalidFiles.push({ path: rawPath, reason: 'ZIP_SYMLINK_NOT_ALLOWED' });
      continue;
    }

    if (/[\x00-\x1f]/.test(rawPath)) {
      securityErrors.push({
        code: 'ZIP_MALICIOUS_FILENAME',
        path: rawPath,
        message: `Filename "${rawPath}" contains control characters or null bytes.`
      });
      invalidFiles.push({ path: rawPath, reason: 'ZIP_MALICIOUS_FILENAME' });
      continue;
    }

    if (
      slashPath.startsWith('/') ||
      /^[a-zA-Z]:/.test(slashPath) ||
      slashPath.startsWith('//') ||
      slashPath.toLowerCase().startsWith('file://')
    ) {
      securityErrors.push({
        code: 'ZIP_ABSOLUTE_PATH',
        path: rawPath,
        message: `Absolute or drive-qualified path "${rawPath}" is prohibited.`
      });
      invalidFiles.push({ path: rawPath, reason: 'ZIP_ABSOLUTE_PATH' });
      continue;
    }

    const rawSegments = slashPath.split('/');
    if (
      slashPath.includes('../') ||
      slashPath.includes('/..') ||
      slashPath === '..' ||
      rawSegments.some(seg => seg === '..' || seg.toLowerCase() === '%2e%2e')
    ) {
      securityErrors.push({
        code: 'ZIP_PATH_TRAVERSAL',
        path: rawPath,
        message: `Path traversal sequence detected in "${rawPath}".`
      });
      invalidFiles.push({ path: rawPath, reason: 'ZIP_PATH_TRAVERSAL' });
      continue;
    }
  }

  if (securityErrors.length > 0) {
    return {
      valid: false,
      canPreview: false,
      errorCode: securityErrors[0].code,
      errorMessage: securityErrors[0].message,
      securityErrors,
      validationErrors,
      warnings,
      invalidFiles,
      files: new Map(),
      fileRecords: []
    };
  }

  // Compute optional single root folder wrapper (e.g. my-template/index.html)
  const cleanFileEntries = nonDirEntries
    .map(p => String(p).replace(/\\/g, '/'))
    .filter(p => !p.includes('__MACOSX/') && !p.endsWith('.DS_Store'));

  let commonPrefix = '';
  if (cleanFileEntries.length > 0 && !cleanFileEntries.some(p => p.toLowerCase() === 'index.html' || p.toLowerCase() === 'wishmagic.json')) {
    const rootMarker = cleanFileEntries
      .filter(p => /(?:^|\/)index\.html$/i.test(p) || /(?:^|\/)wishmagic\.json$/i.test(p))
      .sort((a, b) => a.length - b.length)[0];
    if (rootMarker && rootMarker.includes('/')) {
      const candidate = rootMarker.slice(0, rootMarker.lastIndexOf('/') + 1);
      if (cleanFileEntries.every(p => p.startsWith(candidate))) {
        commonPrefix = candidate;
      }
    }
  }

  const extractedFiles = new Map();
  const seenLowerPaths = new Map(); // lowerPath -> exact normalizedPath
  let totalUncompressedBytes = 0;

  for (const rawPath of nonDirEntries) {
    const entry = zip.files[rawPath];
    let normalized = String(rawPath).replace(/\\/g, '/');
    if (normalized.includes('__MACOSX/') || normalized.endsWith('.DS_Store')) continue;

    if (commonPrefix && normalized.startsWith(commonPrefix)) {
      normalized = normalized.slice(commonPrefix.length);
    }
    normalized = normalized.replace(/^(\.\/)+/, '').replace(/^\/+/, '').replace(/\/+/g, '/');
    if (!normalized) continue;

    const segments = normalized.split('/').filter(Boolean);
    if (segments.length > limits.MAX_DIRECTORY_DEPTH) {
      securityErrors.push({
        code: 'ZIP_MAX_DEPTH_EXCEEDED',
        path: normalized,
        message: `Path "${normalized}" exceeds maximum folder nesting depth of ${limits.MAX_DIRECTORY_DEPTH}.`
      });
      invalidFiles.push({ path: normalized, reason: 'ZIP_MAX_DEPTH_EXCEEDED' });
      continue;
    }

    // Check segments for Windows reserved names or suspicious patterns
    const hasBadSegment = segments.some(seg => WINDOWS_RESERVED_NAMES.test(seg) || seg.endsWith(' '));
    if (hasBadSegment) {
      securityErrors.push({
        code: 'ZIP_MALICIOUS_FILENAME',
        path: normalized,
        message: `Filename "${normalized}" uses a reserved or unsafe segment name.`
      });
      invalidFiles.push({ path: normalized, reason: 'ZIP_MALICIOUS_FILENAME' });
      continue;
    }

    // Duplicate normalized path or case collision check
    const lowerNorm = normalized.toLowerCase();
    if (seenLowerPaths.has(lowerNorm)) {
      const prevPath = seenLowerPaths.get(lowerNorm);
      securityErrors.push({
        code: prevPath === normalized ? 'ZIP_DUPLICATE_PATH' : 'ZIP_CASE_COLLISION_PATH',
        path: normalized,
        message: `Duplicate or case-colliding path detected in archive: "${normalized}" conflicts with "${prevPath}".`
      });
      invalidFiles.push({ path: normalized, reason: 'ZIP_DUPLICATE_OR_CASE_COLLISION_PATH' });
      continue;
    }
    seenLowerPaths.set(lowerNorm, normalized);

    if (SECRET_FILE_PATTERNS.test(normalized)) {
      securityErrors.push({
        code: 'ZIP_FORBIDDEN_SECRET_FILE',
        path: normalized,
        message: `Environment or credential file "${normalized}" is not allowed inside a template package.`
      });
      invalidFiles.push({ path: normalized, reason: 'ZIP_FORBIDDEN_SECRET_FILE' });
      continue;
    }

    // Executable or unsupported file extension check
    const fileName = segments[segments.length - 1];
    const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
    if (STRICT_FORBIDDEN_EXTENSIONS.test(normalized) || DANGEROUS_EXTENSIONS.test(normalized) || !ext || !ALLOWED_TEMPLATE_EXTENSIONS.has(ext)) {
      securityErrors.push({
        code: 'ZIP_UNSUPPORTED_FILE_TYPE',
        path: normalized,
        message: `Unsupported or executable file "${normalized}" (.${ext || 'none'}) is rejected by WishMagic security policy.`
      });
      invalidFiles.push({ path: normalized, reason: 'ZIP_UNSUPPORTED_FILE_TYPE' });
      continue;
    }

    // Check declared size and compression ratio
    const compressedSize = Number(entry._data?.compressedSize);
    const declaredUncompressed = Number(entry._data?.uncompressedSize);
    if (Number.isFinite(declaredUncompressed) && declaredUncompressed > limits.MAX_ENTRY_BYTES) {
      securityErrors.push({
        code: 'ZIP_ENTRY_TOO_LARGE',
        path: normalized,
        message: `File "${normalized}" (${declaredUncompressed} bytes) exceeds per-file limit of ${limits.MAX_ENTRY_BYTES} bytes.`
      });
      continue;
    }

    const entryBytes = await entry.async('uint8array');
    const actualSize = entryBytes.byteLength;

    if (actualSize > limits.MAX_ENTRY_BYTES) {
      securityErrors.push({
        code: 'ZIP_ENTRY_TOO_LARGE',
        path: normalized,
        message: `File "${normalized}" (${actualSize} bytes) exceeds per-file limit of ${limits.MAX_ENTRY_BYTES} bytes.`
      });
      continue;
    }

    totalUncompressedBytes += actualSize;
    if (totalUncompressedBytes > limits.MAX_UNCOMPRESSED_BYTES) {
      securityErrors.push({
        code: 'ZIP_TOTAL_SIZE_EXCEEDED',
        path: normalized,
        message: `Total extracted size (${totalUncompressedBytes} bytes) exceeds maximum limit of ${limits.MAX_UNCOMPRESSED_BYTES} bytes.`
      });
      break;
    }

    const effectiveCompressed = Number.isFinite(compressedSize) && compressedSize > 0 ? compressedSize : Math.max(1, Math.floor(zipBytes.byteLength / Math.max(1, nonDirEntries.length)));
    const actualRatio = actualSize / Math.max(1, effectiveCompressed);
    if (actualRatio > limits.MAX_COMPRESSION_RATIO && actualSize > 256 * 1024) {
      securityErrors.push({
        code: 'ZIP_BOMB_DETECTED',
        path: normalized,
        message: `File "${normalized}" compression ratio (${Math.round(actualRatio)}:1) exceeds maximum safe ratio (${limits.MAX_COMPRESSION_RATIO}:1).`
      });
      break;
    }

    // Validate UTF-8 encoding for text files
    let decodedText = null;
    if (TEXT_FILE_EXTENSIONS.has(ext)) {
      try {
        decodedText = new TextDecoder('utf-8', { fatal: true }).decode(entryBytes);
      } catch (encErr) {
        securityErrors.push({
          code: 'ZIP_INVALID_ENCODING',
          path: normalized,
          message: `Text file "${normalized}" contains invalid UTF-8 byte sequences.`
        });
        invalidFiles.push({ path: normalized, reason: 'ZIP_INVALID_ENCODING' });
        continue;
      }
    }

    extractedFiles.set(normalized, {
      relativePath: normalized,
      content: entryBytes,
      text: decodedText,
      sizeBytes: actualSize,
      mimeType: getMimeType(normalized)
    });
  }

  // Overall archive compression ratio check
  const overallRatio = totalUncompressedBytes / Math.max(1, zipBytes.byteLength);
  if (overallRatio > limits.MAX_COMPRESSION_RATIO && totalUncompressedBytes > 512 * 1024) {
    securityErrors.push({
      code: 'ZIP_BOMB_DETECTED',
      path: '__archive__',
      message: `Archive overall compression ratio (${Math.round(overallRatio)}:1) exceeds maximum safe ratio (${limits.MAX_COMPRESSION_RATIO}:1).`
    });
  }

  if (securityErrors.length > 0) {
    return {
      valid: false,
      canPreview: false,
      errorCode: securityErrors[0].code,
      errorMessage: securityErrors[0].message,
      securityErrors,
      validationErrors,
      warnings,
      invalidFiles,
      files: extractedFiles,
      fileRecords: []
    };
  }

  // Parse manifest if present (wishmagic.json or manifest.json)
  let rawManifest = null;
  let manifestPath = null;
  let manifestCount = 0;

  for (const [relPath, fileObj] of extractedFiles.entries()) {
    const lower = relPath.toLowerCase();
    if (lower === 'wishmagic.json' || lower === 'manifest.json') {
      manifestCount++;
      if (!rawManifest) {
        manifestPath = relPath;
        try {
          rawManifest = JSON.parse(fileObj.text ?? new TextDecoder('utf-8').decode(fileObj.content));
        } catch (jsonErr) {
          validationErrors.push({
            code: 'INVALID_MANIFEST_JSON',
            severity: 'error',
            path: relPath,
            message: `Malformed JSON in "${relPath}": ${jsonErr.message}`,
            blocking: true
          });
        }
      }
    } else if (lower.endsWith('.json')) {
      try {
        JSON.parse(fileObj.text ?? new TextDecoder('utf-8').decode(fileObj.content));
      } catch (jsonErr) {
        validationErrors.push({
          code: 'INVALID_JSON_FILE',
          severity: 'error',
          path: relPath,
          message: `Malformed JSON in "${relPath}": ${jsonErr.message}`,
          blocking: true
        });
      }
    }
  }

  if (manifestCount > 1) {
    validationErrors.push({
      code: 'MULTIPLE_MANIFESTS_CONFLICT',
      severity: 'error',
      message: `Multiple conflicting manifest files detected (${manifestCount}). Provide a single wishmagic.json at root.`,
      blocking: true
    });
  }

  // Check entry HTML file
  const declaredEntry = (rawManifest && ((rawManifest.template && rawManifest.template.entry) || (rawManifest.files && rawManifest.files.entry) || rawManifest.entry)) || 'index.html';
  const cleanDeclaredEntry = String(declaredEntry).replace(/^\.?\/+/, '');
  let entryFileKey = null;
  for (const k of extractedFiles.keys()) {
    if (k.toLowerCase() === cleanDeclaredEntry.toLowerCase() || k.toLowerCase() === 'index.html') {
      entryFileKey = k;
      if (k.toLowerCase() === cleanDeclaredEntry.toLowerCase()) break;
    }
  }

  if (!entryFileKey) {
    validationErrors.push({
      code: 'ENTRY_POINT_MISSING',
      severity: 'error',
      message: `Required entry HTML file ("${cleanDeclaredEntry}") is missing from the ZIP package.`,
      blocking: true
    });
  }

  // Check schemaVersion compatibility explicitly
  if (rawManifest && typeof rawManifest === 'object') {
    const declaredSchemaVer = rawManifest.schemaVersion || rawManifest.protocolVersion || (rawManifest.template && rawManifest.template.schemaVersion);
    if (declaredSchemaVer !== undefined && declaredSchemaVer !== null) {
      const verStr = String(declaredSchemaVer).trim();
      const supportedSet = new Set([...UTP_SUPPORTED_SCHEMA_VERSIONS, '1.0', '1.1', '1.2']);
      if (!supportedSet.has(verStr)) {
        validationErrors.push({
          code: 'UNSUPPORTED_SCHEMA_VERSION',
          severity: 'error',
          message: `Unsupported manifest schemaVersion "${verStr}". Supported versions: ${UTP_SUPPORTED_SCHEMA_VERSIONS.join(', ')}.`,
          blocking: true
        });
      }
    }
  }

  // Validate explicit update metadata if present
  const explicitUpdateMetaReport = parseAndValidateExplicitUpdateMetadata(rawManifest);
  if (!explicitUpdateMetaReport.valid) {
    validationErrors.push(...explicitUpdateMetaReport.issues);
  }

  // Compute SHA-256 hashes for all files
  const sourceZipSha256 = await computeSha256Hex(zipBytes);
  const fileRecords = [];
  const hashesMap = {};

  for (const [relPath, fileObj] of extractedFiles.entries()) {
    const sha256 = await computeSha256Hex(fileObj.content);
    const isEntry = relPath === entryFileKey;
    const role = classifyFileRole(relPath, isEntry);
    hashesMap[relPath] = {
      sha256,
      sizeBytes: fileObj.sizeBytes,
      mimeType: fileObj.mimeType,
      role
    };
    fileRecords.push({
      relativePath: relPath,
      sizeBytes: fileObj.sizeBytes,
      mimeType: fileObj.mimeType,
      sha256,
      fileRole: role,
      isEntryFile: isEntry ? 1 : 0
    });
  }

  const sortedPaths = Object.keys(hashesMap).sort();
  const packageFingerprint = await computeSha256Hex(sortedPaths.map(p => `${p}:${hashesMap[p].sha256}`).join('||'));
  const runtimeHash = await computeSha256Hex(sortedPaths.map(p => `${p}:${hashesMap[p].sha256}`).join('|'));

  // Analyze entry HTML if available
  const entryHtmlText = entryFileKey ? (extractedFiles.get(entryFileKey).text || '') : '';
  const htmlAnalysis = entryHtmlText ? analyzeHtmlString(entryHtmlText) : { title: 'Untitled Template', fields: [], fieldsCount: 0 };
  const schemaHash = await computeSha256Hex(JSON.stringify(htmlAnalysis.fields));

  // Run UTP validation if entry HTML exists and JSON was not malformed
  let utpReport = null;
  if (entryFileKey && !validationErrors.some(e => e.code === 'INVALID_MANIFEST_JSON' || e.code === 'UNSUPPORTED_SCHEMA_VERSION')) {
    const effectiveInputManifest = rawManifest || {
      schemaVersion: '1.0.0',
      template: {
        id: options.fallbackId || normalizeTemplateSlug(htmlAnalysis.title) || 'custom-template',
        name: htmlAnalysis.title || 'Custom Template',
        category: 'celebration'
      }
    };
    utpReport = validateUtpManifest(effectiveInputManifest, {
      filesMap: extractedFiles,
      entryFile: entryFileKey
    });
    for (const iss of utpReport.issues || []) {
      if (iss.severity === 'error' && iss.blocking !== false) {
        validationErrors.push(iss);
      } else if (iss.severity === 'warning') {
        warnings.push(iss);
      }
    }
  }

  // Run preview diagnostics (missing CSS/JS/media, unsafe script/media references)
  const previewDiagnostics = diagnosePackagePreview({
    extractedFiles,
    entryFile: entryFileKey,
    rawManifest,
    utpReport
  });

  for (const secErr of previewDiagnostics.securityViolations) {
    securityErrors.push(secErr);
  }
  for (const warn of previewDiagnostics.warnings) {
    warnings.push(warn);
  }

  // Extract identity signals from manifest and HTML
  const tplNode = (rawManifest && typeof rawManifest.template === 'object' && rawManifest.template)
    ? rawManifest.template
    : (rawManifest || {});
  const explicitStableId = tplNode.id ? String(tplNode.id).trim() : null;
  const explicitSlug = tplNode.slug
    ? normalizeTemplateSlug(String(tplNode.slug))
    : (explicitStableId ? normalizeTemplateSlug(explicitStableId) : null);
  const declaredName = (tplNode.name || tplNode.title || htmlAnalysis.title || '').trim();
  const declaredVersion = explicitUpdateMetaReport.metadata.version || tplNode.templateVersion || tplNode.version || null;
  const declaredSchemaVersion = (rawManifest && rawManifest.schemaVersion) || (utpReport?.protocol?.schemaVersion) || '1.0.0';
  const isLegacyPackage = !rawManifest || !rawManifest.schemaVersion || String(rawManifest.schemaVersion).startsWith('1.0');

  const isValid = securityErrors.length === 0 && validationErrors.length === 0;

  return {
    valid: isValid,
    canPreview: Boolean(entryFileKey) && securityErrors.length === 0 && previewDiagnostics.canRenderPreview,
    errorCode: !isValid ? ((securityErrors[0] || validationErrors[0])?.code || 'INVALID_PACKAGE') : null,
    errorMessage: !isValid ? ((securityErrors[0] || validationErrors[0])?.message || 'Package validation failed.') : null,
    securityErrors,
    validationErrors,
    warnings,
    invalidFiles,
    files: extractedFiles,
    fileRecords,
    hashesMap,
    entryFile: entryFileKey,
    entryHtmlText,
    fileCount: extractedFiles.size,
    zipSizeBytes: zipBytes.byteLength,
    totalUncompressedBytes,
    sourceZipSha256,
    packageFingerprint,
    runtimeHash,
    schemaHash,
    hasManifestFile: Boolean(rawManifest),
    manifestPath,
    rawManifest,
    normalizedManifest: utpReport?.normalized || (rawManifest ? normalizeManifestToUtp(rawManifest) : null),
    utpReport,
    htmlAnalysis,
    previewDiagnostics,
    identity: {
      explicitStableId,
      canonicalTemplateId: explicitStableId ? normalizeCanonicalTemplateId(explicitStableId) : null,
      explicitSlug,
      declaredName,
      declaredVersion,
      declaredSchemaVersion,
      isLegacyPackage,
      updateMetadata: explicitUpdateMetaReport.metadata,
      hasExplicitUpdateMetadata: explicitUpdateMetaReport.present
    }
  };
}

/**
 * Inspects HTML/CSS/JS/Manifest for preview readiness and security isolation violations.
 */
export function diagnosePackagePreview({ extractedFiles, entryFile, rawManifest, utpReport }) {
  const missingAssets = [];
  const brokenLinks = [];
  const invalidVariants = [];
  const unsupportedReferences = [];
  const securityViolations = [];
  const warnings = [];

  if (!entryFile || !extractedFiles || !extractedFiles.has(entryFile)) {
    return {
      canRenderPreview: false,
      status: 'error',
      missingEntryHtml: true,
      missingAssets,
      brokenLinks,
      invalidVariants,
      unsupportedReferences,
      securityViolations,
      warnings,
      summary: 'Missing required entry HTML file.'
    };
  }

  const hasFileCaseInsensitive = (relPath) => {
    const clean = String(relPath || '').split('?')[0].split('#')[0].replace(/\\/g, '/').replace(/^\.?\/+/, '');
    if (!clean) return true;
    if (extractedFiles.has(clean)) return true;
    const lower = clean.toLowerCase();
    for (const k of extractedFiles.keys()) {
      if (k.toLowerCase() === lower) return true;
    }
    return false;
  };

  const entryObj = extractedFiles.get(entryFile);
  const html = entryObj?.text || new TextDecoder('utf-8').decode(entryObj.content);

  // Check all HTML local asset references (<link>, <script>, <img>, <audio>, <video>, <source>)
  const assetTagRegex = /<(link|script|img|audio|video|source)\b([^>]*)>/gi;
  let match;
  while ((match = assetTagRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2] || '';
    const refMatch = attrs.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i);
    if (!refMatch) continue;
    const rawRef = refMatch[1].trim();
    if (!rawRef || rawRef.startsWith('#') || rawRef.startsWith('data:') || rawRef.startsWith('blob:') || rawRef.startsWith('{{')) {
      continue;
    }
    // Allow platform runtime protocol bridge
    if (rawRef === '/js/wishmagic-template-protocol.js' || rawRef.startsWith('https://fonts.googleapis.com') || rawRef.startsWith('https://fonts.gstatic.com') || rawRef.startsWith('https://cdn.tailwindcss.com')) {
      continue;
    }
    const lowerRef = rawRef.toLowerCase();
    if (lowerRef.startsWith('javascript:') || lowerRef.startsWith('vbscript:') || lowerRef.startsWith('file:')) {
      securityViolations.push({
        code: 'UNSAFE_ASSET_REFERENCE',
        severity: 'error',
        path: entryFile,
        reference: rawRef,
        message: `Unsafe URI scheme in <${tag}> reference: "${rawRef}".`
      });
      unsupportedReferences.push({ tag, reference: rawRef, reason: 'UNSAFE_URI_SCHEME' });
      continue;
    }
    if (rawRef.includes('../') || rawRef.startsWith('/') || /^[a-zA-Z]:\\/.test(rawRef)) {
      if (rawRef.startsWith('/assets/')) continue;
      unsupportedReferences.push({ tag, reference: rawRef, reason: 'OUTSIDE_PACKAGE_PATH' });
      securityViolations.push({
        code: 'UNSAFE_ASSET_PATH',
        severity: 'error',
        path: entryFile,
        reference: rawRef,
        message: `Asset reference "${rawRef}" in <${tag}> escapes the package root.`
      });
      continue;
    }
    if (lowerRef.startsWith('http://') || lowerRef.startsWith('https://')) {
      if (tag === 'script') {
        securityViolations.push({
          code: 'EXTERNAL_SCRIPT_FORBIDDEN',
          severity: 'error',
          path: entryFile,
          reference: rawRef,
          message: `External third-party script "${rawRef}" is blocked for preview security.`
        });
      }
      continue;
    }

    if (!hasFileCaseInsensitive(rawRef)) {
      const assetKind = tag === 'link' ? 'css' : (tag === 'script' ? 'js' : 'media');
      missingAssets.push({
        kind: assetKind,
        tag,
        path: rawRef,
        message: `Referenced ${assetKind.toUpperCase()} asset "${rawRef}" was not found in the uploaded ZIP.`
      });
      warnings.push({
        code: `MISSING_${assetKind.toUpperCase()}_ASSET`,
        severity: 'warning',
        path: rawRef,
        message: `Referenced ${assetKind.toUpperCase()} asset "${rawRef}" is missing from the ZIP package.`
      });
    }
  }

  // Check internal anchor links (<a href="#...">) against declared/existing IDs and sections
  const anchorRegex = /<a\b[^>]*\bhref\s*=\s*["']#([a-zA-Z0-9_-]+)["'][^>]*>/gi;
  while ((match = anchorRegex.exec(html)) !== null) {
    const anchorTarget = match[1];
    if (!anchorTarget) continue;
    const esc = anchorTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existsInDom = new RegExp(`(?:\\bid|data-wm-section|data-wm-subsection|data-wm-modal)\\s*=\\s*["']${esc}["']`, 'i').test(html);
    if (!existsInDom) {
      brokenLinks.push({
        type: 'anchor',
        target: `#${anchorTarget}`,
        message: `Internal anchor link "#${anchorTarget}" does not match any element id or data-wm-section in ${entryFile}.`
      });
    }
  }

  // Scan all JS/HTML files for attempts to access parent window / admin credentials
  for (const [relPath, fileObj] of extractedFiles.entries()) {
    const lower = relPath.toLowerCase();
    if (!lower.endsWith('.js') && !lower.endsWith('.mjs') && !lower.endsWith('.html')) continue;
    const text = fileObj.text || '';
    if (/\b(?:window\.)?(?:parent|top)\s*\.\s*(?:document|localStorage|sessionStorage|cookies|fetch|eval)\b/.test(text)) {
      securityViolations.push({
        code: 'PARENT_WINDOW_ACCESS_ATTEMPT',
        severity: 'error',
        path: relPath,
        message: `Untrusted script in "${relPath}" attempts to access parent window DOM or storage.`
      });
    }
  }

  // Check declared variants in manifest
  if (utpReport?.variants?.invalidVariants?.length > 0) {
    for (const iv of utpReport.variants.invalidVariants) {
      invalidVariants.push(iv);
    }
  }

  const hasMissingEssentialCode = missingAssets.some(a => a.kind === 'css' || a.kind === 'js');
  const canRenderPreview = securityViolations.length === 0 && !hasMissingEssentialCode && invalidVariants.length === 0;

  return {
    canRenderPreview,
    status: !canRenderPreview ? 'error' : (missingAssets.length > 0 || brokenLinks.length > 0 ? 'warning' : 'ready'),
    missingEntryHtml: false,
    missingAssets,
    brokenLinks,
    invalidVariants,
    unsupportedReferences,
    securityViolations,
    warnings,
    summary: canRenderPreview
      ? (missingAssets.length > 0 ? `Preview ready with ${missingAssets.length} missing media warning(s).` : 'Preview verified and ready.')
      : 'Package has missing essential dependencies, invalid variants, or security violations.'
  };
}

/**
 * Helper to flatten hierarchical sections + subsections into a flat map for structural comparison
 */
export function flattenSectionsTree(sections = [], depth = 1, parentId = null, out = []) {
  if (!Array.isArray(sections)) return out;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (!s) continue;
    if (typeof s === 'string') {
      out.push({
        id: s,
        label: s,
        depth,
        parentId,
        required: false,
        toggleable: true,
        defaultEnabled: true,
        emptyParentPolicy: 'collapse'
      });
      continue;
    }
    const id = String(s.id || s.key || '').trim();
    if (!id) continue;
    out.push({
      id,
      label: s.label || s.name || id,
      depth,
      parentId,
      required: Boolean(s.required),
      toggleable: s.required ? false : (s.toggleable !== false),
      defaultEnabled: s.required ? true : (s.defaultEnabled !== false && s.enabled !== false),
      emptyParentPolicy: s.emptyParentPolicy || 'collapse',
      fields: Array.isArray(s.fields) ? s.fields : [],
      actions: Array.isArray(s.actions) ? s.actions : []
    });
    if (Array.isArray(s.subsections) && s.subsections.length > 0) {
      flattenSectionsTree(s.subsections, depth + 1, id, out);
    }
  }
  return out;
}

function computeJaccardSimilarity(setA, setB) {
  const a = new Set(Array.from(setA || []).map(x => String(x).toLowerCase()));
  const b = new Set(Array.from(setB || []).map(x => String(x).toLowerCase()));
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Main Automatic Template Recognition Engine (Section 3)
 * Evaluates an inspected ZIP package against all existing templates in D1.
 *
 * Priority Order:
 * A. Stable Template ID
 * B. Existing Slug
 * C. Explicit Update Metadata (templateId, templateSlug, version, baseVersion, updateTarget)
 * D. File Fingerprints (SHA-256 — used to explain differences, never sole identity!)
 * E. Structural Similarity (sections, subsections, variants, fields, actions, entry HTML)
 * F. Display Name (supporting evidence only — never triggers automatic update!)
 */
export function recognizeTemplatePackage(inspection, existingTemplates = [], options = {}) {
  const intendedTargetTemplateId = options.intendedTargetTemplateId
    ? String(options.intendedTargetTemplateId).trim()
    : null;

  if (!inspection || !inspection.valid) {
    return {
      outcome: RECOGNITION_OUTCOME.INVALID_OR_UNSUPPORTED_PACKAGE,
      explanation: inspection?.errorMessage || 'The uploaded package is invalid and cannot be previewed.',
      errorCode: inspection?.errorCode || 'INVALID_OR_UNSUPPORTED_PACKAGE',
      candidates: [],
      recommendedAction: 'fix_package',
      recommendedTargetTemplateId: null,
      conflicts: [],
      intendedTargetTemplateId
    };
  }

  const templatesList = Array.isArray(existingTemplates) ? existingTemplates : [];
  const identity = inspection.identity || {};
  const pkgStableId = identity.explicitStableId ? String(identity.explicitStableId).trim() : null;
  const pkgCanonicalId = pkgStableId ? normalizeCanonicalTemplateId(pkgStableId) : null;
  const pkgSlug = identity.explicitSlug ? normalizeTemplateSlug(identity.explicitSlug) : null;
  const pkgName = (identity.declaredName || '').trim();
  const updateMeta = identity.updateMetadata || {};

  // Extract structural sets from uploaded package
  const normManifest = inspection.normalizedManifest || {};
  const pkgFlatSections = flattenSectionsTree(normManifest.sections || []);
  const pkgSectionIds = new Set(pkgFlatSections.map(s => s.id));
  const pkgFieldIds = new Set((normManifest.fields || []).map(f => f.id || f.key).filter(Boolean));
  const pkgActionIds = new Set((normManifest.actions || []).map(a => a.id).filter(Boolean));
  const pkgVariantRels = new Set(
    (normManifest.variants || []).map(v => v.relationship || v.slug || v.id).filter(Boolean)
  );
  const pkgCodeHashes = new Map();
  const pkgAssetHashes = new Map();
  for (const [relP, hObj] of Object.entries(inspection.hashesMap || {})) {
    if (['entry_html', 'stylesheet', 'script', 'manifest'].includes(hObj.role)) {
      pkgCodeHashes.set(relP, hObj.sha256);
    } else {
      pkgAssetHashes.set(relP, hObj.sha256);
    }
  }

  // Helper to match a template record by ID
  const matchesId = (tpl, rawCandidateId) => {
    if (!tpl || !rawCandidateId) return false;
    const cStem = normalizeIdentityStem(rawCandidateId);
    if (!cStem) return false;
    const tplIdStem = normalizeIdentityStem(tpl.id || '');
    const tplManifest = safeJsonParse(tpl.manifest_json || tpl.features, {});
    const manifestTplStem = normalizeIdentityStem(tplManifest?.template?.id || tplManifest?.id || '');
    return (
      tplIdStem === cStem ||
      (Boolean(manifestTplStem) && manifestTplStem === cStem)
    );
  };

  const matchesSlug = (tpl, rawCandidateSlug) => {
    if (!tpl || !rawCandidateSlug) return false;
    const sNorm = normalizeTemplateSlug(rawCandidateSlug);
    const tplSlug = normalizeTemplateSlug(tpl.slug || tpl.id || '');
    return Boolean(sNorm && tplSlug && sNorm === tplSlug);
  };

  // Check for Identity Conflicts first!
  const conflicts = [];
  const tplByStableId = pkgStableId ? templatesList.find(t => matchesId(t, pkgStableId)) : null;
  const tplBySlug = pkgSlug ? templatesList.find(t => matchesSlug(t, pkgSlug)) : null;
  const tplByUpdateTarget = (updateMeta.templateId || updateMeta.updateTarget)
    ? templatesList.find(t => matchesId(t, updateMeta.templateId || updateMeta.updateTarget) || matchesSlug(t, updateMeta.templateId || updateMeta.updateTarget))
    : (updateMeta.templateSlug ? templatesList.find(t => matchesSlug(t, updateMeta.templateSlug)) : null);
  const tplByIntended = intendedTargetTemplateId
    ? templatesList.find(t => matchesId(t, intendedTargetTemplateId) || matchesSlug(t, intendedTargetTemplateId))
    : null;

  // Conflict Case 1: Stable ID matches Template A, but explicit Slug matches a DIFFERENT Template B
  if (tplByStableId && tplBySlug && tplByStableId.id !== tplBySlug.id) {
    conflicts.push({
      code: 'STABLE_ID_SLUG_CONFLICT',
      message: `Package stable ID "${pkgStableId}" belongs to template "${tplByStableId.name}" (${tplByStableId.id}), while slug "${pkgSlug}" belongs to a different template "${tplBySlug.name}" (${tplBySlug.id}).`,
      templateA: { id: tplByStableId.id, name: tplByStableId.name, slug: tplByStableId.slug },
      templateB: { id: tplBySlug.id, name: tplBySlug.name, slug: tplBySlug.slug }
    });
  }

  // Conflict Case 2: Stable ID is explicitly set to a NEW/different ID, while explicit template.slug in manifest collides with an existing template that has a different immutable ID
  const hasExplicitDistinctSlug = Boolean(
    inspection.rawManifest?.template?.slug &&
    pkgStableId &&
    normalizeTemplateSlug(inspection.rawManifest.template.slug) !== normalizeTemplateSlug(pkgStableId)
  );
  if (!tplByStableId && pkgStableId && tplBySlug) {
    const existingManifest = safeJsonParse(tplBySlug.manifest_json || tplBySlug.features, {});
    const existingCanonicalId = normalizeCanonicalTemplateId(existingManifest?.template?.id || tplBySlug.id);
    if (existingCanonicalId && pkgCanonicalId && existingCanonicalId !== pkgCanonicalId) {
      conflicts.push({
        code: 'IMMUTABLE_ID_OWNERSHIP_CONFLICT',
        message: `Package declares stable ID "${pkgStableId}", which conflicts with existing template "${tplBySlug.name}" (${tplBySlug.id}) that owns slug "${tplBySlug.slug}".`,
        existingTemplate: { id: tplBySlug.id, name: tplBySlug.name, slug: tplBySlug.slug, canonicalId: existingCanonicalId },
        uploadedId: pkgStableId
      });
    }
  }

  // Conflict Case 3: Explicit updateTarget / templateId in metadata conflicts with manifest.template.id
  if (tplByStableId && tplByUpdateTarget && tplByStableId.id !== tplByUpdateTarget.id) {
    conflicts.push({
      code: 'UPDATE_TARGET_ID_CONFLICT',
      message: `Explicit updateTarget points to "${tplByUpdateTarget.name}" (${tplByUpdateTarget.id}), but manifest template.id matches "${tplByStableId.name}" (${tplByStableId.id}).`,
      templateA: { id: tplByStableId.id, name: tplByStableId.name },
      templateB: { id: tplByUpdateTarget.id, name: tplByUpdateTarget.name }
    });
  }

  // Conflict Case 4: Admin opened "Update Template" on Intended Template B, but uploaded a ZIP whose stable ID belongs to Template A (or a different explicit ID)
  if (tplByIntended && pkgStableId && !matchesId(tplByIntended, pkgStableId)) {
    conflicts.push({
      code: 'INTENDED_TARGET_IDENTITY_MISMATCH',
      message: `Selected update target is "${tplByIntended.name}" (${tplByIntended.id}), but the uploaded package declares stable ID "${pkgStableId}"${tplByStableId ? ` belonging to "${tplByStableId.name}" (${tplByStableId.id})` : ''}.`,
      intendedTemplate: { id: tplByIntended.id, name: tplByIntended.name, slug: tplByIntended.slug },
      conflictingTemplate: tplByStableId ? { id: tplByStableId.id, name: tplByStableId.name, slug: tplByStableId.slug } : null,
      uploadedId: pkgStableId
    });
  }

  // Evaluate each existing template for candidate scoring & evidence
  const candidates = [];

  for (const tpl of templatesList) {
    const reasons = [];
    const evidenceCategories = [];
    let priorityRank = 99;

    const idMatched = Boolean(pkgStableId && matchesId(tpl, pkgStableId));
    const slugMatched = Boolean(pkgSlug && matchesSlug(tpl, pkgSlug));
    const updateMetaMatched = Boolean(
      (updateMeta.templateId && matchesId(tpl, updateMeta.templateId)) ||
      (updateMeta.updateTarget && (matchesId(tpl, updateMeta.updateTarget) || matchesSlug(tpl, updateMeta.updateTarget))) ||
      (updateMeta.templateSlug && matchesSlug(tpl, updateMeta.templateSlug))
    );

    if (idMatched) {
      evidenceCategories.push('STABLE_TEMPLATE_ID');
      reasons.push(`Stable Template ID "${pkgStableId}" matched existing template "${tpl.id}".`);
      priorityRank = Math.min(priorityRank, 1);
    }

    if (slugMatched) {
      evidenceCategories.push('EXISTING_SLUG');
      reasons.push(`Normalized slug "${pkgSlug}" matched existing template slug "${tpl.slug}".`);
      priorityRank = Math.min(priorityRank, 2);
    }

    if (updateMetaMatched) {
      evidenceCategories.push('EXPLICIT_UPDATE_METADATA');
      reasons.push(`Explicit update metadata targeted "${tpl.id}"${updateMeta.baseVersion ? ` (baseVersion: ${updateMeta.baseVersion})` : ''}.`);
      priorityRank = Math.min(priorityRank, 3);
    }

    // D. File Fingerprints comparison (supporting evidence, never sole identity!)
    const existingFiles = Array.isArray(tpl.files) ? tpl.files : [];
    let exactCodeMatches = 0;
    let exactAssetMatches = 0;
    let modifiedFilePaths = 0;
    const existingHashByPath = new Map();
    const existingAssetHashSet = new Set();

    for (const ef of existingFiles) {
      const p = String(ef.relative_path || ef.relativePath || ef.path || '').replace(/^\.?\/+/, '');
      const h = ef.sha256 || ef.hash || '';
      if (!p || !h) continue;
      existingHashByPath.set(p, h);
      const role = ef.file_role || classifyFileRole(p, p.toLowerCase() === 'index.html');
      if (!['entry_html', 'stylesheet', 'script', 'manifest'].includes(role)) {
        existingAssetHashSet.add(h);
      }
    }

    for (const [relP, codeHash] of pkgCodeHashes.entries()) {
      if (existingHashByPath.has(relP)) {
        if (existingHashByPath.get(relP) === codeHash) exactCodeMatches++;
        else modifiedFilePaths++;
      }
    }
    for (const [relP, assetHash] of pkgAssetHashes.entries()) {
      if (existingHashByPath.get(relP) === assetHash || existingAssetHashSet.has(assetHash)) {
        exactAssetMatches++;
      }
    }

    if (exactCodeMatches > 0) {
      evidenceCategories.push('FILE_FINGERPRINTS');
      reasons.push(`${exactCodeMatches} core code/manifest file(s) have identical SHA-256 checksums.`);
    } else if (exactAssetMatches > 0) {
      // Asset hash overlap is noted for explanation only, never promotes a template to a match on its own
      reasons.push(`${exactAssetMatches} shared media/asset file fingerprint(s) detected (supporting context only).`);
    }

    // E. Structural similarity
    const tplManifest = safeJsonParse(tpl.manifest_json || tpl.features, {});
    const tplSectionsRaw = safeJsonParse(tpl.sections, tplManifest?.sections || []);
    const tplFlatSections = flattenSectionsTree(Array.isArray(tplSectionsRaw) ? tplSectionsRaw : []);
    const tplSectionIds = new Set(tplFlatSections.map(s => s.id));

    const tplFieldsRaw = safeJsonParse(tpl.detected_fields || tpl.fields_json, tplManifest?.fields || []);
    const tplFieldIds = new Set(
      (Array.isArray(tplFieldsRaw) ? tplFieldsRaw : []).map(f => f.id || f.key || f.field_key).filter(Boolean)
    );

    const tplActionsRaw = safeJsonParse(tpl.actions_json, tplManifest?.actions || []);
    const tplActionIds = new Set(
      (Array.isArray(tplActionsRaw) ? tplActionsRaw : []).map(a => a.id).filter(Boolean)
    );

    const tplVariantsRaw = safeJsonParse(tpl.variants_json, tplManifest?.variants || []);
    const tplVariantRels = new Set(
      (Array.isArray(tplVariantsRaw) ? tplVariantsRaw : []).map(v => v.relationshipSlug || v.relationship || v.slug || v.id).filter(Boolean)
    );

    const sectionSim = computeJaccardSimilarity(pkgSectionIds, tplSectionIds);
    const fieldSim = computeJaccardSimilarity(pkgFieldIds, tplFieldIds);
    const actionSim = (pkgActionIds.size > 0 || tplActionIds.size > 0)
      ? computeJaccardSimilarity(pkgActionIds, tplActionIds)
      : null;
    const variantSim = (pkgVariantRels.size > 0 || tplVariantRels.size > 0)
      ? computeJaccardSimilarity(pkgVariantRels, tplVariantRels)
      : null;

    const simComponents = [sectionSim, fieldSim];
    if (actionSim !== null) simComponents.push(actionSim);
    if (variantSim !== null) simComponents.push(variantSim);
    const structuralScore = simComponents.reduce((a, b) => a + b, 0) / Math.max(1, simComponents.length);

    // Structural similarity only counts as a primary match signal when Stable ID is missing (or matches this template)
    // and enough structural elements (sections/fields/variants) genuinely overlap.
    const hasCustomStructureOverlap = (
      structuralScore >= 0.65 &&
      (pkgSectionIds.size >= 2 || pkgVariantRels.size >= 1) &&
      (!pkgStableId || idMatched)
    );
    if (hasCustomStructureOverlap) {
      evidenceCategories.push('STRUCTURAL_SIMILARITY');
      reasons.push(
        `High structural similarity across sections (${pkgSectionIds.size}), fields (${pkgFieldIds.size})` +
        (pkgVariantRels.size > 0 ? `, and relationship variants (${pkgVariantRels.size})` : '') + '.'
      );
      priorityRank = Math.min(priorityRank, 5);
    }

    // F. Display name (supporting evidence only — never causes a match or update on its own!)
    const nameMatched = Boolean(
      pkgName &&
      tpl.name &&
      String(tpl.name).trim().toLowerCase() === pkgName.toLowerCase()
    );
    if (nameMatched) {
      evidenceCategories.push('DISPLAY_NAME');
      reasons.push(`Display name "${pkgName}" matches existing template title (supporting evidence only).`);
    }

    // Determine whether this template qualifies as a candidate:
    // - Name alone or shared asset hashes alone NEVER qualify a template as a match!
    const hasSubstantiveMatch = idMatched || slugMatched || updateMetaMatched || hasCustomStructureOverlap;
    if (!hasSubstantiveMatch) {
      continue;
    }

    const matchConfidence = idMatched
      ? 'EXACT_IDENTITY'
      : (slugMatched || updateMetaMatched ? 'HIGH_SIMILARITY' : 'STRUCTURAL_SIMILARITY');

    candidates.push({
      templateId: tpl.id,
      name: tpl.name || tpl.id,
      slug: tpl.slug || normalizeTemplateSlug(tpl.id),
      thumbnail: tpl.thumbnail || '/assets/file_ab2082.png',
      category: tpl.category || 'Celebration',
      currentVersionId: tpl.current_version_id || tpl.currentVersionId || `ver_${tpl.id}_v1`,
      currentVersionLabel: tpl.current_version_label || tpl.versionLabel || 'v1.0.0',
      status: tpl.status || (tpl.is_published || tpl.isPublished ? 'published' : 'draft'),
      updatedAt: tpl.updated_at || tpl.updatedAt || tpl.created_at || tpl.createdAt || null,
      lockVersion: Number(tpl.lock_version || tpl.lockVersion || 1),
      priorityRank,
      matchConfidence,
      evidenceCategories,
      reasons,
      structuralSummary: {
        sectionSimilarity: Number(sectionSim.toFixed(2)),
        fieldSimilarity: Number(fieldSim.toFixed(2)),
        exactCodeMatches,
        exactAssetMatches,
        modifiedFilePaths
      }
    });
  }

  // Sort candidates by priorityRank ASC, then exactCodeMatches DESC
  candidates.sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    return (b.structuralSummary.exactCodeMatches || 0) - (a.structuralSummary.exactCodeMatches || 0);
  });

  // Determine final recognition outcome
  if (conflicts.length > 0) {
    return {
      outcome: RECOGNITION_OUTCOME.IDENTITY_CONFLICT,
      explanation: conflicts[0].message,
      candidates,
      conflicts,
      recommendedAction: 'resolve_conflict',
      recommendedTargetTemplateId: tplByIntended?.id || tplByStableId?.id || tplBySlug?.id || null,
      intendedTargetTemplateId
    };
  }

  const exactIdCandidates = candidates.filter(c => c.evidenceCategories.includes('STABLE_TEMPLATE_ID'));
  if (exactIdCandidates.length === 1 && candidates.length === 1) {
    return {
      outcome: RECOGNITION_OUTCOME.EXACT_EXISTING_IDENTITY,
      explanation: `Stable Template ID "${pkgStableId}" matched existing template "${exactIdCandidates[0].name}" (${exactIdCandidates[0].templateId}). Review differences side by side before choosing to update.`,
      candidates,
      conflicts: [],
      recommendedAction: 'update_existing',
      recommendedTargetTemplateId: exactIdCandidates[0].templateId,
      intendedTargetTemplateId
    };
  }

  if (exactIdCandidates.length === 1 && candidates.length > 1) {
    // Stable ID matched one template, and no slug/updateTarget conflict existed
    return {
      outcome: RECOGNITION_OUTCOME.EXACT_EXISTING_IDENTITY,
      explanation: `Stable Template ID "${pkgStableId}" matched existing template "${exactIdCandidates[0].name}" (${exactIdCandidates[0].templateId}).`,
      candidates,
      conflicts: [],
      recommendedAction: 'update_existing',
      recommendedTargetTemplateId: exactIdCandidates[0].templateId,
      intendedTargetTemplateId
    };
  }

  if (candidates.length > 1) {
    return {
      outcome: RECOGNITION_OUTCOME.MULTIPLE_POSSIBLE_MATCHES,
      explanation: `Multiple templates (${candidates.length}) appear similar based on slug or package structure. Select the intended template explicitly or create a new template.`,
      candidates,
      conflicts: [],
      recommendedAction: 'select_candidate',
      recommendedTargetTemplateId: intendedTargetTemplateId || null,
      intendedTargetTemplateId
    };
  }

  if (candidates.length === 1) {
    const single = candidates[0];
    return {
      outcome: RECOGNITION_OUTCOME.POSSIBLE_EXISTING_MATCH,
      explanation: `Possible match found with "${single.name}" (${single.templateId}) based on ${single.evidenceCategories.join(' and ').toLowerCase().replace(/_/g, ' ')}.`,
      candidates,
      conflicts: [],
      recommendedAction: 'review_candidate',
      recommendedTargetTemplateId: single.templateId,
      intendedTargetTemplateId
    };
  }

  return {
    outcome: RECOGNITION_OUTCOME.NO_EXISTING_MATCH,
    explanation: 'No reliable existing template match was found. You can register this package as a new template.',
    candidates: [],
    conflicts: [],
    recommendedAction: 'create_new',
    recommendedTargetTemplateId: intendedTargetTemplateId || null,
    intendedTargetTemplateId
  };
}

/**
 * Redacts sensitive patterns (.env values, API keys, private tokens) from diff lines
 */
function redactSecretsFromText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/((?:api[_-]?key|secret|token|password|authorization|b2_application_key)\s*[:=]\s*["']?)([^"'\s\n]+)/gi, '$1[REDACTED_SECRET]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED_TOKEN]');
}

/**
 * Generates a concise unified text diff between two strings (up to maxDiffLines)
 */
export function computeUnifiedTextDiff(oldText = '', newText = '', filePath = 'file', maxDiffLines = 120) {
  const cleanOld = redactSecretsFromText(String(oldText || '')).replace(/\r\n/g, '\n').split('\n');
  const cleanNew = redactSecretsFromText(String(newText || '')).replace(/\r\n/g, '\n').split('\n');

  if (oldText === newText) {
    return {
      hasChanges: false,
      addedLines: 0,
      removedLines: 0,
      diffText: `--- a/${filePath}\n+++ b/${filePath}\n(No text differences)`
    };
  }

  const lines = [`--- a/${filePath}`, `+++ b/${filePath}`];
  let addedLines = 0;
  let removedLines = 0;

  const maxLen = Math.max(cleanOld.length, cleanNew.length);
  let i = 0;
  let j = 0;

  while (i < cleanOld.length || j < cleanNew.length) {
    if (i < cleanOld.length && j < cleanNew.length && cleanOld[i] === cleanNew[j]) {
      if (lines.length < maxDiffLines) {
        lines.push(`  ${cleanOld[i]}`);
      }
      i++;
      j++;
    } else if (j + 1 < cleanNew.length && i < cleanOld.length && cleanOld[i] === cleanNew[j + 1]) {
      addedLines++;
      if (lines.length < maxDiffLines) {
        lines.push(`+ ${cleanNew[j]}`);
      }
      j++;
    } else if (i + 1 < cleanOld.length && j < cleanNew.length && cleanOld[i + 1] === cleanNew[j]) {
      removedLines++;
      if (lines.length < maxDiffLines) {
        lines.push(`- ${cleanOld[i]}`);
      }
      i++;
    } else {
      if (i < cleanOld.length) {
        removedLines++;
        if (lines.length < maxDiffLines) {
          lines.push(`- ${cleanOld[i]}`);
        }
        i++;
      }
      if (j < cleanNew.length) {
        addedLines++;
        if (lines.length < maxDiffLines) {
          lines.push(`+ ${cleanNew[j]}`);
        }
        j++;
      }
    }
  }

  if (lines.length >= maxDiffLines && maxLen > maxDiffLines) {
    lines.push(`... (Diff truncated at ${maxDiffLines} lines)`);
  }

  return {
    hasChanges: addedLines > 0 || removedLines > 0,
    addedLines,
    removedLines,
    diffText: lines.join('\n')
  };
}

/**
 * Automatic Change Comparison Engine (Section 7)
 * Compares the selected existing published template version against the staged uploaded package.
 */
export function compareExistingTemplateWithStagedPackage(existingContext, stagedInspection) {
  if (!stagedInspection) {
    throw new Error('Staged package inspection is required for comparison.');
  }

  // If no existing template is selected (e.g. brand new template), return a clean initial-import comparison
  if (!existingContext || !existingContext.template) {
    const addedFiles = (stagedInspection.fileRecords || []).map(f => ({
      path: f.relativePath,
      status: 'added',
      sizeBytes: f.sizeBytes,
      mimeType: f.mimeType,
      newHash: f.sha256,
      role: f.fileRole
    }));
    const normNew = stagedInspection.normalizedManifest || {};
    const flatNewSecs = flattenSectionsTree(normNew.sections || []);
    return {
      hasExistingBaseline: false,
      existingTemplate: null,
      files: {
        added: addedFiles,
        modified: [],
        unchanged: [],
        removed: [],
        renamed: [],
        invalid: stagedInspection.invalidFiles || [],
        summary: {
          addedCount: addedFiles.length,
          modifiedCount: 0,
          unchangedCount: 0,
          removedCount: 0,
          renamedCount: 0,
          invalidCount: (stagedInspection.invalidFiles || []).length
        }
      },
      manifestDiff: {
        metadataChanges: [],
        variants: {
          added: (normNew.variants || []).map(v => v.relationship || v.slug || v.id),
          modified: [],
          removed: [],
          unchanged: []
        },
        sections: {
          existingCount: 0,
          newCount: flatNewSecs.filter(s => s.depth === 1).length,
          existingSubsectionCount: 0,
          newSubsectionCount: flatNewSecs.filter(s => s.depth > 1).length,
          added: flatNewSecs.map(s => ({ id: s.id, label: s.label, depth: s.depth, parentId: s.parentId })),
          modified: [],
          removed: [],
          unchanged: []
        },
        fields: {
          added: (normNew.fields || []).map(f => f.id || f.key),
          modified: [],
          removed: [],
          unchanged: []
        },
        actions: {
          added: (normNew.actions || []).map(a => a.id),
          modified: [],
          removed: [],
          unchanged: []
        },
        visibilityChanges: [],
        themeChanges: [],
        mediaChanges: [],
        compatibilityChanges: [],
        invalidReferences: []
      },
      destructiveWarnings: [],
      hasDestructiveChanges: false,
      hasBreakingChanges: false
    };
  }

  const tpl = existingContext.template;
  const ver = existingContext.version || {};
  const existingFilesList = Array.isArray(existingContext.files) ? existingContext.files : [];
  const existingTextByPath = existingContext.fileContentsMap instanceof Map
    ? existingContext.fileContentsMap
    : new Map(Object.entries(existingContext.fileContentsMap || {}));

  // 7.1 File Comparison
  const oldFilesByPath = new Map();
  for (const ef of existingFilesList) {
    const p = String(ef.relative_path || ef.relativePath || ef.path || '').replace(/\\/g, '/').replace(/^\.?\/+/, '');
    if (!p || SECRET_FILE_PATTERNS.test(p)) continue;
    oldFilesByPath.set(p, {
      path: p,
      sizeBytes: Number(ef.size_bytes ?? ef.sizeBytes ?? 0),
      mimeType: ef.mime_type || ef.mimeType || getMimeType(p),
      sha256: ef.sha256 || ef.hash || '',
      role: ef.file_role || ef.fileRole || classifyFileRole(p, p.toLowerCase() === 'index.html'),
      text: ef.text !== undefined ? ef.text : (existingTextByPath.get(p) || null)
    });
  }

  const newFilesByPath = new Map();
  for (const nf of stagedInspection.fileRecords || []) {
    const p = nf.relativePath;
    if (!p || SECRET_FILE_PATTERNS.test(p)) continue;
    const extractedObj = stagedInspection.files?.get(p);
    newFilesByPath.set(p, {
      path: p,
      sizeBytes: nf.sizeBytes,
      mimeType: nf.mimeType,
      sha256: nf.sha256,
      role: nf.fileRole,
      text: extractedObj?.text ?? null
    });
  }

  const rawAdded = [];
  const rawRemoved = [];
  const modified = [];
  const unchanged = [];

  const existingImagesByPath = existingContext.imagesByPath instanceof Map
    ? existingContext.imagesByPath
    : new Map();

  for (const [p, newF] of newFilesByPath.entries()) {
    const oldF = oldFilesByPath.get(p);
    if (!oldF) {
      rawAdded.push(newF);
      continue;
    }

    const ext = p.split('.').pop().toLowerCase();
    const isText = TEXT_FILE_EXTENSIONS.has(ext) && (oldF.text !== null || newF.text !== null);
    const imgRecord = existingImagesByPath.get(p) || existingImagesByPath.get(p.split('/').pop()) || null;
    const isStubbedExistingImage = Boolean(
      (newF.mimeType || '').startsWith('image/') &&
      oldF.sizeBytes > 0 &&
      oldF.sizeBytes <= 100 &&
      newF.sizeBytes > 100 &&
      (!imgRecord || !imgRecord.sha256 || imgRecord.sha256 === newF.sha256)
    );
    const isImgHashMatch = Boolean(imgRecord && imgRecord.sha256 && imgRecord.sha256 === newF.sha256);
    const isNormalizedTextMatch = Boolean(
      isText &&
      oldF.text !== null &&
      newF.text !== null &&
      oldF.text === newF.text
    );

    if (
      (oldF.sha256 && newF.sha256 && oldF.sha256 === newF.sha256) ||
      isStubbedExistingImage ||
      isImgHashMatch ||
      isNormalizedTextMatch
    ) {
      unchanged.push({
        path: p,
        status: 'unchanged',
        sizeBytes: newF.sizeBytes,
        mimeType: newF.mimeType,
        sha256: newF.sha256,
        role: newF.role
      });
    } else {
      const textDiff = isText
        ? computeUnifiedTextDiff(oldF.text || '', newF.text || '', p)
        : null;
      modified.push({
        path: p,
        status: 'modified',
        oldSizeBytes: oldF.sizeBytes,
        newSizeBytes: newF.sizeBytes,
        sizeDeltaBytes: newF.sizeBytes - oldF.sizeBytes,
        mimeType: newF.mimeType,
        oldHash: oldF.sha256,
        newHash: newF.sha256,
        role: newF.role,
        isText,
        diff: textDiff
      });
    }
  }

  for (const [p, oldF] of oldFilesByPath.entries()) {
    if (!newFilesByPath.has(p)) {
      rawRemoved.push(oldF);
    }
  }

  // Reliable rename detection:
  // Only classify as renamed when a removed file and an added file share the exact same SHA-256 content hash!
  // Never guess renames merely from similar filenames.
  const renamed = [];
  const matchedRemovedPaths = new Set();
  const matchedAddedPaths = new Set();

  for (const remF of rawRemoved) {
    if (!remF.sha256) continue;
    const matchingAdd = rawAdded.find(
      addF => !matchedAddedPaths.has(addF.path) && addF.sha256 && addF.sha256 === remF.sha256
    );
    if (matchingAdd) {
      matchedRemovedPaths.add(remF.path);
      matchedAddedPaths.add(matchingAdd.path);
      renamed.push({
        oldPath: remF.path,
        newPath: matchingAdd.path,
        status: 'renamed',
        sizeBytes: matchingAdd.sizeBytes,
        mimeType: matchingAdd.mimeType,
        sha256: matchingAdd.sha256,
        role: matchingAdd.role,
        evidence: 'EXACT_SHA256_CONTENT_MATCH'
      });
    }
  }

  const added = rawAdded
    .filter(f => !matchedAddedPaths.has(f.path))
    .map(f => ({
      path: f.path,
      status: 'added',
      sizeBytes: f.sizeBytes,
      mimeType: f.mimeType,
      newHash: f.sha256,
      role: f.role,
      isText: TEXT_FILE_EXTENSIONS.has(f.path.split('.').pop().toLowerCase()),
      diff: f.text ? computeUnifiedTextDiff('', f.text, f.path) : null
    }));

  const removed = rawRemoved
    .filter(f => !matchedRemovedPaths.has(f.path))
    .map(f => ({
      path: f.path,
      status: 'removed',
      sizeBytes: f.sizeBytes,
      mimeType: f.mimeType,
      oldHash: f.sha256,
      role: f.role
    }));

  // 7.2 Manifest & Configuration Comparison
  const rawOldManifest = safeJsonParse(ver.manifest_json || tpl.manifest_json || tpl.features, {});
  const oldNorm = normalizeManifestToUtp({
    ...rawOldManifest,
    schemaVersion: ver.schema_version || rawOldManifest.schemaVersion || '1.0.0',
    template: {
      ...(rawOldManifest.template || {}),
      id: rawOldManifest?.template?.id || tpl.id,
      slug: rawOldManifest?.template?.slug || tpl.slug,
      name: ver.name || tpl.name,
      description: ver.description || tpl.description,
      category: ver.category || tpl.category,
      tier: ver.tier || tpl.tier,
      price: ver.price ?? tpl.price,
      entry: ver.entry_point || tpl.entry_file || 'index.html'
    },
    sections: safeJsonParse(ver.sections || tpl.sections, rawOldManifest.sections || []),
    fields: safeJsonParse(ver.fields_json || tpl.detected_fields, rawOldManifest.fields || []),
    actions: safeJsonParse(ver.actions_json || tpl.actions_json, rawOldManifest.actions || []),
    variants: safeJsonParse(ver.variants_json || tpl.variants_json, rawOldManifest.variants || []),
    visibilityConfig: safeJsonParse(ver.visibility_config_json || tpl.visibility_config_json, rawOldManifest.visibilityConfig || {}),
    actionsConfig: safeJsonParse(ver.actions_config_json || tpl.actions_config_json, rawOldManifest.actionsConfig || {})
  });

  const newNorm = stagedInspection.normalizedManifest || {};

  // Metadata changes
  const metadataChanges = [];
  const compareMetaKey = (key, label, oldVal, newVal) => {
    const sOld = String(oldVal ?? '').trim();
    const sNew = String(newVal ?? '').trim();
    if (sOld !== sNew) {
      metadataChanges.push({ key, label, oldValue: sOld, newValue: sNew });
    }
  };
  compareMetaKey('id', 'Template ID', oldNorm.template?.id || tpl.id, newNorm.template?.id);
  compareMetaKey('slug', 'Template Slug', tpl.slug || oldNorm.template?.slug, stagedInspection.identity?.explicitSlug || newNorm.template?.slug);
  compareMetaKey('name', 'Template Name', tpl.name || oldNorm.template?.name, stagedInspection.identity?.declaredName || newNorm.template?.name);
  compareMetaKey('schemaVersion', 'UTP Schema Version', ver.schema_version || oldNorm.schemaVersion || '1.0.0', stagedInspection.identity?.declaredSchemaVersion || newNorm.schemaVersion || '1.0.0');
  compareMetaKey('templateVersion', 'Declared Package Version', ver.version_label || oldNorm.template?.templateVersion || 'v1.0.0', stagedInspection.identity?.declaredVersion || newNorm.template?.templateVersion || '');
  compareMetaKey('category', 'Category', tpl.category || oldNorm.template?.category, newNorm.template?.category);
  compareMetaKey('entry', 'Entry HTML', tpl.entry_file || oldNorm.template?.entry || 'index.html', stagedInspection.entryFile || 'index.html');

  // Relationship Variants comparison
  const oldVariantsList = Array.isArray(existingContext.variants) && existingContext.variants.length > 0
    ? existingContext.variants
    : (oldNorm.variants || []);
  const newVariantsList = newNorm.variants || [];

  const getVarKey = (v) => normalizeTemplateSlug(v.relationship_slug || v.relationshipSlug || v.relationship || v.slug || v.id || '');
  const oldVarMap = new Map();
  for (const v of oldVariantsList) {
    const k = getVarKey(v);
    if (k) oldVarMap.set(k, v);
  }
  const newVarMap = new Map();
  for (const v of newVariantsList) {
    const k = getVarKey(v);
    if (k) newVarMap.set(k, v);
  }

  const variantsAdded = [];
  const variantsModified = [];
  const variantsRemoved = [];
  const variantsUnchanged = [];

  for (const [k, nv] of newVarMap.entries()) {
    const ov = oldVarMap.get(k);
    if (!ov) {
      variantsAdded.push({
        key: k,
        id: nv.id,
        label: nv.relationshipLabel || nv.label || k,
        name: nv.name || k,
        entry: nv.entry || 'index.html'
      });
    } else {
      const oldCfg = safeJsonParse(ov.configuration_json || ov.configuration, ov);
      const oldMsgs = JSON.stringify(oldCfg?.messages || ov.messages || {});
      const newMsgs = JSON.stringify(nv.messages || {});
      const oldTheme = JSON.stringify(oldCfg?.theme || ov.theme || {});
      const newTheme = JSON.stringify(nv.theme || {});
      const oldVis = JSON.stringify(safeJsonParse(ov.visibility_json, oldCfg?.visibilityOverrides || ov.visibility || {}));
      const newVis = JSON.stringify(nv.visibilityOverrides || nv.visibility || {});
      const oldActs = JSON.stringify(safeJsonParse(ov.actions_json, oldCfg?.actions || ov.actions || []));
      const newActs = JSON.stringify(nv.actions || []);

      const changes = [];
      if (oldMsgs !== newMsgs) changes.push('messages');
      if (oldTheme !== newTheme) changes.push('theme');
      if (oldVis !== newVis) changes.push('visibilityOverrides');
      if (oldActs !== newActs) changes.push('actions');
      if ((ov.name || '') !== (nv.name || '')) changes.push('name');

      if (changes.length > 0) {
        variantsModified.push({
          key: k,
          id: nv.id || ov.id,
          label: nv.relationshipLabel || nv.label || ov.relationship_label || k,
          changedAspects: changes
        });
      } else {
        variantsUnchanged.push({
          key: k,
          id: nv.id || ov.id,
          label: nv.relationshipLabel || nv.label || ov.relationship_label || k
        });
      }
    }
  }

  for (const [k, ov] of oldVarMap.entries()) {
    if (!newVarMap.has(k)) {
      variantsRemoved.push({
        key: k,
        id: ov.id,
        label: ov.relationship_label || ov.relationshipLabel || ov.label || k,
        name: ov.name || k
      });
    }
  }

  // Sections & Subsections comparison
  const oldFlatSections = flattenSectionsTree(oldNorm.sections || []);
  const newFlatSections = flattenSectionsTree(newNorm.sections || []);
  const oldSecMap = new Map(oldFlatSections.map(s => [s.id, s]));
  const newSecMap = new Map(newFlatSections.map(s => [s.id, s]));

  const sectionsAdded = [];
  const sectionsModified = [];
  const sectionsRemoved = [];
  const sectionsUnchanged = [];

  for (const [id, ns] of newSecMap.entries()) {
    const os = oldSecMap.get(id);
    if (!os) {
      sectionsAdded.push(ns);
    } else {
      const changes = [];
      if (os.label !== ns.label) changes.push(`label: "${os.label}" -> "${ns.label}"`);
      if (Boolean(os.required) !== Boolean(ns.required)) changes.push(`required: ${os.required} -> ${ns.required}`);
      if (Boolean(os.toggleable) !== Boolean(ns.toggleable)) changes.push(`toggleable: ${os.toggleable} -> ${ns.toggleable}`);
      if (Boolean(os.defaultEnabled) !== Boolean(ns.defaultEnabled)) changes.push(`defaultEnabled: ${os.defaultEnabled} -> ${ns.defaultEnabled}`);
      if ((os.parentId || null) !== (ns.parentId || null)) changes.push(`parentId: ${os.parentId || 'root'} -> ${ns.parentId || 'root'}`);
      if (changes.length > 0) {
        sectionsModified.push({ id, label: ns.label, depth: ns.depth, parentId: ns.parentId, changes });
      } else {
        sectionsUnchanged.push({ id, label: ns.label, depth: ns.depth, parentId: ns.parentId });
      }
    }
  }

  for (const [id, os] of oldSecMap.entries()) {
    if (!newSecMap.has(id)) {
      sectionsRemoved.push(os);
    }
  }

  // Fields comparison
  const oldFieldsMap = new Map((oldNorm.fields || []).map(f => [f.id || f.key, f]));
  const newFieldsMap = new Map((newNorm.fields || []).map(f => [f.id || f.key, f]));

  const fieldsAdded = [];
  const fieldsModified = [];
  const fieldsRemoved = [];
  const fieldsUnchanged = [];

  for (const [id, nf] of newFieldsMap.entries()) {
    const of = oldFieldsMap.get(id);
    if (!of) {
      fieldsAdded.push({ id, label: nf.label || id, type: nf.type || 'text', required: Boolean(nf.required), section: nf.section || null });
    } else {
      const changes = [];
      if ((of.type || 'text') !== (nf.type || 'text')) changes.push(`type: ${of.type} -> ${nf.type}`);
      if (Boolean(of.required) !== Boolean(nf.required)) changes.push(`required: ${Boolean(of.required)} -> ${Boolean(nf.required)}`);
      if (String(of.defaultValue ?? '') !== String(nf.defaultValue ?? '')) changes.push('defaultValue changed');
      if ((of.label || '') !== (nf.label || '')) changes.push(`label: "${of.label}" -> "${nf.label}"`);
      if ((of.section || null) !== (nf.section || null)) changes.push(`section: ${of.section || 'none'} -> ${nf.section || 'none'}`);
      if (changes.length > 0) {
        fieldsModified.push({ id, label: nf.label || id, type: nf.type, changes, typeChanged: (of.type || 'text') !== (nf.type || 'text') });
      } else {
        fieldsUnchanged.push({ id, label: nf.label || id, type: nf.type });
      }
    }
  }

  for (const [id, of] of oldFieldsMap.entries()) {
    if (!newFieldsMap.has(id)) {
      fieldsRemoved.push({ id, label: of.label || id, type: of.type || 'text', required: Boolean(of.required) });
    }
  }

  // Actions comparison
  const oldActionsMap = new Map((oldNorm.actions || []).map(a => [a.id, a]));
  const newActionsMap = new Map((newNorm.actions || []).map(a => [a.id, a]));

  const actionsAdded = [];
  const actionsModified = [];
  const actionsRemoved = [];
  const actionsUnchanged = [];

  for (const [id, na] of newActionsMap.entries()) {
    const oa = oldActionsMap.get(id);
    if (!oa) {
      actionsAdded.push({ id, label: na.label, type: na.type, target: na.target || '' });
    } else {
      const changes = [];
      if (oa.label !== na.label) changes.push(`label: "${oa.label}" -> "${na.label}"`);
      if (oa.type !== na.type) changes.push(`type: ${oa.type} -> ${na.type}`);
      if ((oa.target || '') !== (na.target || '')) changes.push(`target: "${oa.target || ''}" -> "${na.target || ''}"`);
      if (Boolean(oa.defaultEnabled ?? true) !== Boolean(na.defaultEnabled ?? true)) changes.push('defaultEnabled changed');
      if (changes.length > 0) {
        actionsModified.push({ id, label: na.label, type: na.type, target: na.target || '', changes });
      } else {
        actionsUnchanged.push({ id, label: na.label, type: na.type, target: na.target || '' });
      }
    }
  }

  for (const [id, oa] of oldActionsMap.entries()) {
    if (!newActionsMap.has(id)) {
      actionsRemoved.push({ id, label: oa.label, type: oa.type, target: oa.target || '' });
    }
  }

  // Visibility settings comparison
  const oldVisCfg = oldNorm.visibilityConfig || {};
  const newVisCfg = newNorm.visibilityConfig || {};
  const visibilityChanges = [];
  const allVisKeys = new Set([...Object.keys(oldVisCfg), ...Object.keys(newVisCfg)]);
  for (const secKey of allVisKeys) {
    if (oldVisCfg[secKey] !== newVisCfg[secKey]) {
      visibilityChanges.push({
        sectionId: secKey,
        oldValue: oldVisCfg[secKey] ?? 'default',
        newValue: newVisCfg[secKey] ?? 'default'
      });
    }
  }

  // Invalid references check (e.g. configured actions or fields pointing to a removed or non-existent section)
  const invalidReferences = [];
  const existingActionsCfg = safeJsonParse(tpl.actions_config_json || ver.actions_config_json, {});
  for (const [actId, actOverride] of Object.entries(existingActionsCfg)) {
    const targetType = actOverride?.type || newActionsMap.get(actId)?.type;
    const targetSec = String(actOverride?.target || newActionsMap.get(actId)?.target || '').replace(/^#/, '');
    if (targetType === 'section' && targetSec && !newSecMap.has(targetSec)) {
      invalidReferences.push({
        kind: 'action_target_section_missing',
        actionId: actId,
        targetSectionId: targetSec,
        message: `Configured button "${actId}" points to section "${targetSec}" that no longer exists in the uploaded package.`
      });
    }
  }
  for (const [actId, na] of newActionsMap.entries()) {
    const targetSec = String(na.target || '').replace(/^#/, '');
    if (na.type === 'section' && targetSec && !newSecMap.has(targetSec)) {
      invalidReferences.push({
        kind: 'action_target_section_missing',
        actionId: actId,
        targetSectionId: targetSec,
        message: `Declared button "${actId}" points to section "${targetSec}" that does not exist in the uploaded package.`
      });
    }
  }

  // 7.3 Destructive-Change Warnings with exact computed counts
  const destructiveWarnings = [];
  const oldTopSectionCount = oldFlatSections.filter(s => s.depth === 1).length;
  const newTopSectionCount = newFlatSections.filter(s => s.depth === 1).length;
  const oldSubCount = oldFlatSections.filter(s => s.depth > 1).length;
  const newSubCount = newFlatSections.filter(s => s.depth > 1).length;

  if (sectionsRemoved.length > 0) {
    const removedTop = sectionsRemoved.filter(s => s.depth === 1);
    const removedSub = sectionsRemoved.filter(s => s.depth > 1);
    if (removedTop.length > 0) {
      destructiveWarnings.push({
        code: 'SECTIONS_REMOVED',
        severity: 'breaking',
        category: 'section',
        message: `The existing package has ${oldTopSectionCount} section(s); the new package declares ${newTopSectionCount}. Removed section(s): ${removedTop.map(s => s.id).join(', ')}.`,
        removedItems: removedTop.map(s => s.id),
        futureWishesImpact: 'Future wishes created after publishing this update will not include the removed section(s).',
        existingWishesImpact: 'Existing published wishes retain their original template version and published_config_snapshot_json and are unaffected.'
      });
    }
    if (removedSub.length > 0) {
      destructiveWarnings.push({
        code: 'SUBSECTIONS_REMOVED',
        severity: 'warning',
        category: 'subsection',
        message: `The existing package has ${oldSubCount} subsection(s); the new package declares ${newSubCount}. Removed subsection(s): ${removedSub.map(s => s.id).join(', ')}.`,
        removedItems: removedSub.map(s => s.id),
        futureWishesImpact: 'Future wishes will omit the removed subsection(s).',
        existingWishesImpact: 'Existing published wishes remain locked to their historical version snapshot.'
      });
    }
  }

  for (const remVar of variantsRemoved) {
    destructiveWarnings.push({
      code: 'VARIANT_REMOVED',
      severity: 'breaking',
      category: 'variant',
      message: `The '${remVar.key}' (${remVar.label}) variant is missing from the uploaded package.`,
      removedItems: [remVar.key],
      futureWishesImpact: `Visitors will no longer be able to select the '${remVar.label}' edition for new wishes.`,
      existingWishesImpact: `Existing wishes already created with the '${remVar.label}' variant remain intact and functional via their historical variant record.`
    });
  }

  if (fieldsRemoved.length > 0) {
    destructiveWarnings.push({
      code: 'FIELDS_REMOVED',
      severity: 'warning',
      category: 'field',
      message: `${fieldsRemoved.length} customizable field(s) were removed from the uploaded package: ${fieldsRemoved.map(f => f.id).join(', ')}.`,
      removedItems: fieldsRemoved.map(f => f.id),
      futureWishesImpact: 'These fields will no longer appear in the customizer for new wishes.',
      existingWishesImpact: 'Existing wishes retain their saved personalized field data and original template version.'
    });
  }

  if (actionsRemoved.length > 0) {
    destructiveWarnings.push({
      code: 'ACTIONS_REMOVED',
      severity: 'warning',
      category: 'action',
      message: `${actionsRemoved.length} configurable button/action(s) were removed: ${actionsRemoved.map(a => a.id).join(', ')}.`,
      removedItems: actionsRemoved.map(a => a.id),
      futureWishesImpact: 'Removed buttons will not appear in future wishes.',
      existingWishesImpact: 'Existing wishes retain their original action bindings.'
    });
  }

  for (const invRef of invalidReferences) {
    destructiveWarnings.push({
      code: 'ACTION_TARGET_MISSING',
      severity: 'breaking',
      category: 'action',
      message: invRef.message,
      removedItems: [invRef.targetSectionId],
      futureWishesImpact: 'The button will be automatically hidden or disabled by fallbackBehavior unless retargeted before publishing.',
      existingWishesImpact: 'Existing wishes are unaffected.'
    });
  }

  const removedMediaFiles = removed.filter(f => ['asset', 'audio', 'video'].includes(f.role));
  if (removedMediaFiles.length > 0) {
    destructiveWarnings.push({
      code: 'MEDIA_ASSETS_REMOVED',
      severity: 'warning',
      category: 'media',
      message: `${removedMediaFiles.length} existing media/asset file(s) are missing from the uploaded package: ${removedMediaFiles.map(f => f.path).join(', ')}.`,
      removedItems: removedMediaFiles.map(f => f.path),
      futureWishesImpact: 'New wishes will use the updated package assets.',
      existingWishesImpact: 'Existing wishes continue referencing the immutable storage keys of their original version.'
    });
  }

  return {
    hasExistingBaseline: true,
    existingTemplate: {
      id: tpl.id,
      name: tpl.name,
      slug: tpl.slug,
      currentVersionId: ver.id || tpl.current_version_id,
      currentVersionLabel: ver.version_label || `v${ver.version_number || 1}.0.0`,
      lockVersion: Number(tpl.lock_version || 1)
    },
    files: {
      added,
      modified,
      unchanged,
      removed,
      renamed,
      invalid: stagedInspection.invalidFiles || [],
      summary: {
        addedCount: added.length,
        modifiedCount: modified.length,
        unchangedCount: unchanged.length,
        removedCount: removed.length,
        renamedCount: renamed.length,
        invalidCount: (stagedInspection.invalidFiles || []).length
      }
    },
    manifestDiff: {
      metadataChanges,
      variants: {
        existingCount: oldVarMap.size,
        newCount: newVarMap.size,
        added: variantsAdded,
        modified: variantsModified,
        removed: variantsRemoved,
        unchanged: variantsUnchanged
      },
      sections: {
        existingCount: oldTopSectionCount,
        newCount: newTopSectionCount,
        existingSubsectionCount: oldSubCount,
        newSubsectionCount: newSubCount,
        added: sectionsAdded,
        modified: sectionsModified,
        removed: sectionsRemoved,
        unchanged: sectionsUnchanged
      },
      fields: {
        existingCount: oldFieldsMap.size,
        newCount: newFieldsMap.size,
        added: fieldsAdded,
        modified: fieldsModified,
        removed: fieldsRemoved,
        unchanged: fieldsUnchanged
      },
      actions: {
        existingCount: oldActionsMap.size,
        newCount: newActionsMap.size,
        added: actionsAdded,
        modified: actionsModified,
        removed: actionsRemoved,
        unchanged: actionsUnchanged
      },
      visibilityChanges,
      invalidReferences
    },
    destructiveWarnings,
    hasDestructiveChanges: destructiveWarnings.length > 0,
    hasBreakingChanges: destructiveWarnings.some(w => w.severity === 'breaking')
  };
}

/**
 * Builds a self-contained, strictly sandboxed HTML document for isolated preview rendering.
 * Prevents untrusted template JS from accessing parent DOM, admin cookies, tokens, or network.
 */
export function buildSandboxedTemplatePreviewHtml({
  entryHtml = '',
  filesMap = new Map(),
  normalizedManifest = null,
  relationshipSlug = null,
  visibilityConfig = {},
  actionsConfig = {},
  variantOverrides = {},
  previewBaseUrl = '',
  previewToken = '',
  assetUrlMap = null,
  allowMissingVariantFallback = false,
  side = 'staged'
}) {
  if (!entryHtml || typeof entryHtml !== 'string') {
    return {
      ok: false,
      errorCode: 'MISSING_ENTRY_HTML',
      html: `<!DOCTYPE html><html><body style="background:#120924;color:#fda4af;font-family:sans-serif;padding:32px;text-align:center;"><h3>Preview Unavailable</h3><p>Missing entry HTML file.</p></body></html>`
    };
  }

  const manifest = normalizedManifest || { sections: [], actions: [], fields: [], variants: [] };
  const variants = Array.isArray(manifest.variants) ? manifest.variants : [];
  let selectedVariant = null;
  let variantFallbackNotice = null;

  if (relationshipSlug && relationshipSlug !== 'all' && relationshipSlug !== 'default') {
    const targetNorm = normalizeTemplateSlug(relationshipSlug);
    selectedVariant = variants.find(v =>
      normalizeTemplateSlug(v.relationship || v.relationshipSlug || v.slug || v.id || '') === targetNorm
    ) || null;
    if (!selectedVariant && variants.length > 0) {
      if (allowMissingVariantFallback) {
        selectedVariant = variants.find(v => v.isDefault) || variants[0] || null;
        variantFallbackNotice = `Variant "${relationshipSlug}" is not in this ${side === 'existing' ? 'existing published' : 'uploaded'} version; showing "${selectedVariant?.relationshipLabel || selectedVariant?.label || selectedVariant?.relationship || 'Default'}" instead.`;
      } else {
        return {
          ok: false,
          errorCode: 'VARIANT_NOT_AVAILABLE_IN_VERSION',
          html: `<!DOCTYPE html><html><body style="background:#120924;color:#fde68a;font-family:sans-serif;padding:32px;text-align:center;"><h3>Variant Not Present in ${side === 'existing' ? 'Existing Published Version' : 'Uploaded Package'}</h3><p>The relationship variant <code>${relationshipSlug}</code> is not declared in this version.</p></body></html>`
        };
      }
    }
  } else if (variants.length > 0) {
    selectedVariant = variants.find(v => v.isDefault) || variants[0];
  }

  const effectiveRelSlug = selectedVariant ? (selectedVariant.relationship || selectedVariant.slug) : null;
  const resolvedConfig = resolveEffectiveTemplateConfiguration({
    manifest,
    visibilityConfig,
    actionsConfig,
    variantOverrides,
    relationshipSlug: effectiveRelSlug
  });

  // Build initial hydration payload from manifest defaults + selected variant messages/theme
  const fieldValues = {};
  for (const f of manifest.fields || []) {
    const k = f.id || f.key;
    if (k && f.defaultValue !== undefined) {
      fieldValues[k] = f.defaultValue;
    }
  }
  const variantMsgs = (selectedVariant && (selectedVariant.messages || selectedVariant.configuration?.messages)) || null;
  if (variantMsgs && typeof variantMsgs === 'object') {
    for (const [mk, mv] of Object.entries(variantMsgs)) {
      fieldValues[mk] = mv;
    }
  }
  const variantAssets = (selectedVariant && (selectedVariant.assets || selectedVariant.configuration?.assets)) || null;
  if (variantAssets && typeof variantAssets === 'object') {
    for (const [ak, av] of Object.entries(variantAssets)) {
      if (av) fieldValues[ak] = av;
    }
  }

  const themeVars = (selectedVariant && (selectedVariant.theme || selectedVariant.configuration?.theme)) || manifest.theme || {};
  const tokenQuerySuffix = previewToken ? `?token=${encodeURIComponent(previewToken)}` : '';

  const resolvePreviewAssetUrl = (relPath) => {
    const cleanRel = String(relPath || '').replace(/^\.?\/+/, '');
    if (!cleanRel) return relPath;
    if (/^(?:https?:|data:|blob:)/i.test(cleanRel)) return cleanRel;
    if (assetUrlMap) {
      const mapped = assetUrlMap instanceof Map ? assetUrlMap.get(cleanRel) : assetUrlMap[cleanRel];
      if (mapped) return mapped;
    }
    if (previewBaseUrl) {
      return `${previewBaseUrl.replace(/\/+$/, '')}/${cleanRel}${tokenQuerySuffix}`;
    }
    return cleanRel;
  };

  for (const [fk, fv] of Object.entries(fieldValues)) {
    if (typeof fv === 'string' && /^(?:\.?\/)?assets\//i.test(fv.trim())) {
      fieldValues[fk] = resolvePreviewAssetUrl(fv.trim());
    }
  }

  // Strip external /js/wishmagic-template-protocol.js script tags because we inject the runtime bridge directly in <head>
  let renderedHtml = entryHtml.replace(
    /<script[^>]+src\s*=\s*["'][^"']*wishmagic-template-protocol\.js[^"']*["'][^>]*>\s*<\/script>/gi,
    ''
  );

  // Collect all candidate asset paths from filesMap, assetUrlMap, and manifest
  const allAssetPaths = new Set();
  if (filesMap && filesMap.size > 0) {
    for (const k of filesMap.keys()) allAssetPaths.add(k);
  }
  if (assetUrlMap) {
    const keys = assetUrlMap instanceof Map ? Array.from(assetUrlMap.keys()) : Object.keys(assetUrlMap);
    for (const k of keys) allAssetPaths.add(k);
  }

  if (allAssetPaths.size > 0) {
    const sortedKeys = Array.from(allAssetPaths).sort((a, b) => b.length - a.length);
    for (const relP of sortedKeys) {
      const fObj = filesMap && filesMap.size > 0 ? filesMap.get(relP) : null;
      const escP = relP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const lowerP = relP.toLowerCase();

      if (lowerP.endsWith('.css') && fObj && (fObj.text || fObj.content)) {
        let cssText = fObj.text ?? new TextDecoder('utf-8').decode(fObj.content);
        for (const assetKey of sortedKeys) {
          if (assetKey.endsWith('.css') || assetKey.endsWith('.js')) continue;
          const escAsset = assetKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const resolvedAsset = resolvePreviewAssetUrl(assetKey);
          cssText = cssText.replace(
            new RegExp(`url\\(\\s*["']?(?:\\.\\.?\\/|\\/)*${escAsset}["']?\\s*\\)`, 'gi'),
            `url("${resolvedAsset}")`
          );
        }
        const safeCss = cssText.replace(/<\/style>/gi, '<\\/style>');
        const linkRegex = new RegExp(`<link[^>]+href\\s*=\\s*["'](?:\\.\\.?\\/|\\/)*${escP}["'][^>]*>`, 'gi');
        if (linkRegex.test(renderedHtml)) {
          renderedHtml = renderedHtml.replace(linkRegex, () => `<style data-wm-inlined="${relP}">\n${safeCss}\n</style>`);
        } else {
          const b64Css = typeof Buffer !== 'undefined'
            ? Buffer.from(cssText, 'utf8').toString('base64')
            : btoa(unescape(encodeURIComponent(cssText)));
          renderedHtml = renderedHtml.replace(
            new RegExp(`href\\s*=\\s*["'](?:\\.\\.?\\/|\\/)*${escP}["']`, 'gi'),
            `href="data:text/css;base64,${b64Css}"`
          );
        }
      } else if ((lowerP.endsWith('.js') || lowerP.endsWith('.mjs')) && !lowerP.endsWith('.json') && fObj && (fObj.text || fObj.content)) {
        let jsText = fObj.text ?? new TextDecoder('utf-8').decode(fObj.content);
        for (const assetKey of sortedKeys) {
          if (assetKey.endsWith('.css') || assetKey.endsWith('.js') || assetKey.endsWith('.html') || assetKey.endsWith('.json')) continue;
          const escAsset = assetKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const resolvedAsset = resolvePreviewAssetUrl(assetKey);
          jsText = jsText.replace(
            new RegExp(`(["'])(?:\\.\\.?\\/|\\/)*${escAsset}\\1`, 'g'),
            `$1${resolvedAsset}$1`
          );
        }
        const safeJs = jsText.replace(/<\/script>/gi, '<\\/script>');
        const scriptRegex = new RegExp(`<script[^>]+src\\s*=\\s*["'](?:\\.\\.?\\/|\\/)*${escP}["'][^>]*>\\s*<\\/script>`, 'gi');
        if (scriptRegex.test(renderedHtml)) {
          renderedHtml = renderedHtml.replace(scriptRegex, () => `<script data-wm-inlined="${relP}">\n${safeJs}\n</script>`);
        } else {
          const b64Js = typeof Buffer !== 'undefined'
            ? Buffer.from(jsText, 'utf8').toString('base64')
            : btoa(unescape(encodeURIComponent(jsText)));
          renderedHtml = renderedHtml.replace(
            new RegExp(`src\\s*=\\s*["'](?:\\.\\.?\\/|\\/)*${escP}["']`, 'gi'),
            `src="data:text/javascript;base64,${b64Js}"`
          );
        }
      } else if (previewBaseUrl || assetUrlMap) {
        const targetAssetUrl = resolvePreviewAssetUrl(relP);
        renderedHtml = renderedHtml.replace(
          new RegExp(`(["'(\\s])(?:\\.\\.?\\/|\\/)*${escP}(?=["')?\\s#])`, 'gi'),
          `$1${targetAssetUrl}`
        );
      }
    }
  }

  if (previewBaseUrl) {
    renderedHtml = renderedHtml.replace(
      /(["'(\s])(?:\.\.?\/|\/)*(assets\/[a-zA-Z0-9_./-]+)(?=["')?\s#])/gi,
      (match, prefix, relAssetPath) => `${prefix}${resolvePreviewAssetUrl(relAssetPath)}`
    );
  }

  // Security & UTP v1.2.0 Hydration Guard Script injected at top of <head>
  const isolationBootstrapScript = `<script>
(function() {
  // 1. Strict Sandbox Isolation Guard: prevent untrusted template JS from accessing parent/top or admin storage
  try {
    const blockedParentProxy = new Proxy({}, {
      get: function(_, prop) {
        if (prop === 'postMessage') return function() {};
        throw new Error('Security Isolation: Access to parent/top window state is prohibited inside template preview.');
      }
    });
    Object.defineProperty(window, 'parent', { get: function() { return blockedParentProxy; }, configurable: false });
    Object.defineProperty(window, 'top', { get: function() { return blockedParentProxy; }, configurable: false });
  } catch (_) {}
  try {
    Object.defineProperty(document, 'cookie', { get: function() { return ''; }, set: function() { return false; }, configurable: false });
  } catch (_) {}
  try {
    window.open = function() { return null; };
  } catch (_) {}

  const wmPreviewPayload = ${JSON.stringify({
    side,
    relationshipSlug: effectiveRelSlug,
    relationship: effectiveRelSlug,
    variantId: selectedVariant ? selectedVariant.id : null,
    variant: selectedVariant ? {
      id: selectedVariant.id,
      slug: selectedVariant.slug || effectiveRelSlug,
      name: selectedVariant.name,
      relationship: effectiveRelSlug,
      relationshipLabel: selectedVariant.relationshipLabel || selectedVariant.label || effectiveRelSlug,
      theme: themeVars,
      messages: variantMsgs || {},
      visibilityOverrides: selectedVariant.visibilityOverrides || selectedVariant.visibility || {},
      actions: selectedVariant.actions || []
    } : null,
    fieldValues,
    fields: fieldValues,
    messages: variantMsgs || {},
    theme: themeVars,
    visibilityMap: resolvedConfig.visibilityMap || {},
    visibility: resolvedConfig.visibilityMap || {},
    disabledSectionIds: resolvedConfig.disabledSectionIds || [],
    actionsMap: resolvedConfig.actionsMap || {},
    actions: resolvedConfig.actionsMap || {},
    variantFallbackNotice
  })};

  // Set relationship & theme attributes IMMEDIATELY on <html> before body/template scripts run!
  try {
    const rootEl = document.documentElement;
    if (wmPreviewPayload.relationshipSlug) {
      rootEl.setAttribute('data-wm-relationship', wmPreviewPayload.relationshipSlug);
    }
    if (wmPreviewPayload.variantId) {
      rootEl.setAttribute('data-wm-variant', wmPreviewPayload.variantId);
    }
    const initTheme = wmPreviewPayload.theme || {};
    if (initTheme.primary) rootEl.style.setProperty('--wm-primary', initTheme.primary);
    if (initTheme.secondary) rootEl.style.setProperty('--wm-secondary', initTheme.secondary);
    if (initTheme.accent) rootEl.style.setProperty('--wm-accent', initTheme.accent);
    if (initTheme.background) rootEl.style.setProperty('--wm-bg', initTheme.background);
    if (initTheme.text) rootEl.style.setProperty('--wm-text', initTheme.text);
  } catch (_) {}

  window.__WM_PREVIEW_DIAGNOSTICS__ = { errors: [], missingAssets: [], ready: false };

  window.addEventListener('error', function(ev) {
    if (ev && ev.target && (ev.target.tagName === 'IMG' || ev.target.tagName === 'SCRIPT' || ev.target.tagName === 'LINK' || ev.target.tagName === 'AUDIO' || ev.target.tagName === 'VIDEO')) {
      window.__WM_PREVIEW_DIAGNOSTICS__.missingAssets.push(ev.target.src || ev.target.href || ev.target.tagName);
    } else if (ev && ev.message) {
      window.__WM_PREVIEW_DIAGNOSTICS__.errors.push(String(ev.message));
    }
  }, true);

  function applyPreviewHydration(payload) {
    if (!payload) return;
    const root = document.documentElement;
    const t = payload.theme || {};
    if (t.primary) root.style.setProperty('--wm-primary', t.primary);
    if (t.secondary) root.style.setProperty('--wm-secondary', t.secondary);
    if (t.accent) root.style.setProperty('--wm-accent', t.accent);
    if (t.background) root.style.setProperty('--wm-bg', t.background);
    if (t.text) root.style.setProperty('--wm-text', t.text);
    if (payload.relationshipSlug) {
      root.setAttribute('data-wm-relationship', payload.relationshipSlug);
      if (document.body) document.body.setAttribute('data-wm-relationship', payload.relationshipSlug);
    }
    if (payload.variantId) {
      root.setAttribute('data-wm-variant', payload.variantId);
      if (document.body) document.body.setAttribute('data-wm-variant', payload.variantId);
    }

    // Physically remove disabled sections & subsections from DOM (UTP v1.2.0 Rule 5)
    const disabledIds = Array.isArray(payload.disabledSectionIds) ? payload.disabledSectionIds : [];
    disabledIds.forEach(function(secId) {
      const nodes = document.querySelectorAll('[data-wm-section="' + secId + '"], [data-wm-subsection="' + secId + '"]');
      nodes.forEach(function(node) {
        node.querySelectorAll('audio, video, iframe').forEach(function(m) {
          try { if (typeof m.pause === 'function') m.pause(); m.removeAttribute('src'); } catch (_) {}
        });
        node.remove();
      });
      document.querySelectorAll('a[href="#' + secId + '"], [data-wm-nav-target="' + secId + '"]').forEach(function(nav) {
        nav.remove();
      });
    });

    // Apply field values
    const fields = Object.assign({}, payload.fieldValues || {}, payload.fields || {}, payload.messages || {});
    Object.keys(fields).forEach(function(fKey) {
      const val = fields[fKey];
      if (val === undefined || val === null || val === '') return;
      document.querySelectorAll('[data-wm-field="' + fKey + '"], [data-wm="' + fKey + '"]').forEach(function(el) {
        const tag = el.tagName.toLowerCase();
        if (tag === 'img' || tag === 'audio' || tag === 'video' || tag === 'source') {
          if (typeof val === 'string' && !val.startsWith('assets/')) el.setAttribute('src', val);
        } else {
          el.textContent = String(val);
        }
      });
    });

    // Apply action configurations
    const actionsMap = payload.actionsMap || payload.actions || {};
    Object.keys(actionsMap).forEach(function(actId) {
      const act = actionsMap[actId];
      document.querySelectorAll('[data-wm-action="' + actId + '"]').forEach(function(btn) {
        if (!act || act.effectiveEnabled === false || act.enabled === false) {
          if (!act || act.fallbackBehavior !== 'disable') btn.remove();
          else { btn.setAttribute('disabled', 'disabled'); btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none'; }
          return;
        }
        if (act.label) {
          const labelSpan = btn.querySelector('.cta-label, [data-wm-action-label]');
          if (labelSpan) labelSpan.textContent = String(act.label);
          else btn.textContent = String(act.label);
        }
        btn.setAttribute('data-wm-action-type', act.type || 'section');
        btn.setAttribute('data-wm-action-target', act.target || '');
      });
    });

    if (window.BroCodeTemplate && typeof window.BroCodeTemplate.applyData === 'function') {
      try {
        window.BroCodeTemplate.applyData({
          relationship: payload.relationshipSlug,
          variantId: payload.variantId,
          theme: payload.theme,
          fields: fields,
          visibility: payload.visibilityMap || payload.visibility,
          actions: actionsMap
        });
      } catch (_) {}
    }

    try {
      window.dispatchEvent(new CustomEvent('wishmagic:data-updated', { detail: Object.assign({}, fields, payload) }));
    } catch (_) {}

    window.__WM_PREVIEW_DIAGNOSTICS__.ready = true;
  }

  // Provide global WishMagicTemplate bridge expected by UTP v1.0 / v1.1 / v1.2 templates
  window.WishMagicTemplate = window.WishMagicTemplate || {
    version: '1.2.0',
    applyData: function(data) {
      if (!data || typeof data !== 'object') return;
      applyPreviewHydration(Object.assign({}, wmPreviewPayload, {
        relationshipSlug: data.relationship || data.relationshipSlug || wmPreviewPayload.relationshipSlug,
        variantId: data.variantId || wmPreviewPayload.variantId,
        theme: Object.assign({}, wmPreviewPayload.theme || {}, data.theme || {}),
        fieldValues: Object.assign({}, wmPreviewPayload.fieldValues || {}, data.fields || data.fieldValues || data),
        visibilityMap: Object.assign({}, wmPreviewPayload.visibilityMap || {}, data.visibility || data.visibilityMap || {}),
        actionsMap: Object.assign({}, wmPreviewPayload.actionsMap || {}, data.actions || data.actionsMap || {})
      }));
    },
    removeDisabledContentFromDom: function() {
      applyPreviewHydration(wmPreviewPayload);
    }
  };

  document.addEventListener('DOMContentLoaded', function() {
    applyPreviewHydration(wmPreviewPayload);
    setTimeout(function() { applyPreviewHydration(wmPreviewPayload); }, 60);
  });
  window.addEventListener('load', function() {
    applyPreviewHydration(wmPreviewPayload);
  });
})();
</script>`;

  if (/<head[^>]*>/i.test(renderedHtml)) {
    renderedHtml = renderedHtml.replace(/<head([^>]*)>/i, `<head$1>${isolationBootstrapScript}`);
  } else {
    renderedHtml = `${isolationBootstrapScript}\n${renderedHtml}`;
  }

  return {
    ok: true,
    errorCode: null,
    selectedVariant,
    resolvedConfig,
    html: renderedHtml
  };
}

export const SANDBOXED_PREVIEW_CSP = [
  "default-src 'self' data: blob:",
  "script-src 'unsafe-inline' 'self' data: blob: https://cdn.tailwindcss.com",
  "style-src 'unsafe-inline' 'self' * data: blob: https://fonts.googleapis.com",
  "font-src 'self' * data: https://fonts.gstatic.com",
  "img-src 'self' * data: blob: https: http:",
  "media-src 'self' * data: blob: https: http:",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'none'",
  "base-uri 'self'"
].join('; ');


/**
 * Serializes extracted files map into a compact JSON object for staging persistence in D1
 */
export function serializeStagedFilesBundle(extractedFiles, options = {}) {
  const bundle = {};
  if (!extractedFiles || !(extractedFiles instanceof Map)) return bundle;

  // Cloudflare D1 enforces a hard 1 MB (1,000,000 byte) limit per SQL statement / bound parameter.
  // Always retain 100% of text/code files (HTML, CSS, JS, JSON, SVG) and cap inline binary media
  // in `staged_files_bundle_json` so the serialized JSON parameter never triggers D1 SQLITE_TOOBIG.
  const maxBinaryInlineBytes = Number(options.maxBinaryInlineBytes ?? 550 * 1024);
  let accumulatedBinaryBytes = 0;

  // Minimal valid 1x1 JPEG stub for binary image files that exceed the inline D1 staging budget
  const MINIMAL_JPEG_STUB_B64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

  for (const [relPath, fileObj] of extractedFiles.entries()) {
    if (fileObj.text !== null && fileObj.text !== undefined) {
      bundle[relPath] = {
        isBase64: false,
        content: fileObj.text,
        sizeBytes: fileObj.sizeBytes,
        mimeType: fileObj.mimeType
      };
    } else if (fileObj.content instanceof Uint8Array) {
      const bytes = fileObj.content;
      if (accumulatedBinaryBytes + bytes.byteLength <= maxBinaryInlineBytes) {
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        bundle[relPath] = {
          isBase64: true,
          content: btoa(binary),
          sizeBytes: fileObj.sizeBytes,
          mimeType: fileObj.mimeType
        };
        accumulatedBinaryBytes += bytes.byteLength;
      } else {
        const mime = String(fileObj.mimeType || getMimeType(relPath)).toLowerCase();
        bundle[relPath] = {
          isBase64: true,
          content: mime.startsWith('image/') ? MINIMAL_JPEG_STUB_B64 : '',
          sizeBytes: fileObj.sizeBytes,
          mimeType: fileObj.mimeType,
          omittedLargeBinary: true
        };
      }
    }
  }
  return bundle;
}

/**
 * Reconstructs a Map of extracted files from a serialized staged bundle
 */
export function deserializeStagedFilesBundle(bundleObj) {
  const map = new Map();
  if (!bundleObj || typeof bundleObj !== 'object') return map;
  for (const [relPath, item] of Object.entries(bundleObj)) {
    if (!item || typeof item !== 'object') continue;
    if (item.isBase64) {
      const clean = String(item.content || '').replace(/^data:[^;]+;base64,/i, '').replace(/\s+/g, '');
      const bin = atob(clean);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      map.set(relPath, {
        relativePath: relPath,
        content: bytes,
        text: null,
        sizeBytes: item.sizeBytes || bytes.byteLength,
        mimeType: item.mimeType || getMimeType(relPath)
      });
    } else {
      const text = String(item.content ?? '');
      const bytes = new TextEncoder().encode(text);
      map.set(relPath, {
        relativePath: relPath,
        content: bytes,
        text,
        sizeBytes: item.sizeBytes || bytes.byteLength,
        mimeType: item.mimeType || getMimeType(relPath)
      });
    }
  }
  return map;
}

/**
 * Computes synchronized relationship variant comparison list for the Side-by-Side Preview selector.
 * Marks variants that exist in both versions, only in the new uploaded ZIP ([NEW]), or only in the old version ([REMOVED]).
 */
export function buildPreviewVariantCatalog(existingVariants = [], stagedVariants = []) {
  const map = new Map();

  for (const ev of existingVariants) {
    const slug = normalizeTemplateSlug(ev.relationship_slug || ev.relationshipSlug || ev.relationship || ev.variant_slug || ev.slug || ev.id || '');
    if (!slug) continue;
    map.set(slug, {
      slug,
      label: ev.relationship_label || ev.relationshipLabel || ev.label || ev.name || slug,
      existsInExisting: true,
      existsInStaged: false,
      statusBadge: 'REMOVED_IN_NEW',
      existingVariantId: ev.id,
      stagedVariantId: null
    });
  }

  for (const sv of stagedVariants) {
    const slug = normalizeTemplateSlug(sv.relationship || sv.relationshipSlug || sv.slug || sv.id || '');
    if (!slug) continue;
    if (map.has(slug)) {
      const entry = map.get(slug);
      entry.existsInStaged = true;
      entry.statusBadge = 'SHARED';
      entry.stagedVariantId = sv.id;
      if (sv.relationshipLabel || sv.label) entry.label = sv.relationshipLabel || sv.label;
    } else {
      map.set(slug, {
        slug,
        label: sv.relationshipLabel || sv.label || sv.name || slug,
        existsInExisting: false,
        existsInStaged: true,
        statusBadge: 'NEW_ONLY',
        existingVariantId: null,
        stagedVariantId: sv.id
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Loads all registered templates and their active version files from D1 for recognition
 */
export async function loadExistingTemplatesForRecognition(db) {
  if (!db || typeof db.prepare !== 'function') return [];
  const tplRowsRes = await db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all().catch(() => ({ results: [] }));
  const templates = tplRowsRes.results || [];
  if (templates.length === 0) return [];

  const verRowsRes = await db.prepare('SELECT * FROM template_versions WHERE is_current = 1 OR status = "published" ORDER BY version_number DESC').all().catch(() => ({ results: [] }));
  const versions = verRowsRes.results || [];

  const filesRowsRes = await db.prepare('SELECT * FROM template_files').all().catch(() => ({ results: [] }));
  const allFiles = filesRowsRes.results || [];

  const filesByVersion = new Map();
  for (const f of allFiles) {
    const vid = f.template_version_id;
    if (!vid) continue;
    if (!filesByVersion.has(vid)) filesByVersion.set(vid, []);
    filesByVersion.get(vid).push(f);
  }

  const currentVersionByTpl = new Map();
  for (const v of versions) {
    if (!currentVersionByTpl.has(v.template_id) || v.is_current === 1) {
      currentVersionByTpl.set(v.template_id, v);
    }
  }

  return templates.map(tpl => {
    const curVer = currentVersionByTpl.get(tpl.id) || null;
    const verFiles = curVer ? (filesByVersion.get(curVer.id) || []) : [];
    return {
      ...tpl,
      current_version_id: curVer?.id || tpl.current_version_id || null,
      current_version_label: curVer?.version_label || `v${curVer?.version_number || 1}.0.0`,
      manifest_json: curVer?.manifest_json || tpl.features || '{}',
      files: verFiles
    };
  });
}

/**
 * Loads a single existing template's full comparison context (template, current version, files, variants, and stored file text when available)
 */
export async function loadSingleTemplateComparisonContext(db, templateId, env = {}) {
  if (!db || !templateId) return null;
  const tpl = await db.prepare('SELECT * FROM templates WHERE id = ? OR slug = ? LIMIT 1').bind(templateId, templateId).first().catch(() => null);
  if (!tpl) return null;

  let version = null;
  if (tpl.current_version_id) {
    version = await db.prepare('SELECT * FROM template_versions WHERE id = ? LIMIT 1').bind(tpl.current_version_id).first().catch(() => null);
  }
  if (!version) {
    version = await db.prepare('SELECT * FROM template_versions WHERE template_id = ? ORDER BY is_current DESC, version_number DESC LIMIT 1').bind(tpl.id).first().catch(() => null);
  }

  let files = [];
  if (version) {
    const fRes = await db.prepare('SELECT * FROM template_files WHERE template_version_id = ?').bind(version.id).all().catch(() => ({ results: [] }));
    files = fRes.results || [];
  }

  let images = [];
  if (version) {
    const imgRes = await db.prepare('SELECT * FROM template_images WHERE template_version_id = ?').bind(version.id).all().catch(() => ({ results: [] }));
    images = imgRes.results || [];
  }
  if (images.length === 0) {
    const imgRes = await db.prepare('SELECT * FROM template_images WHERE template_id = ?').bind(tpl.id).all().catch(() => ({ results: [] }));
    images = imgRes.results || [];
  }

  // Build map of relative image paths -> ImgBB display URLs and original image metadata
  const assetUrlMap = new Map();
  const imagesByPath = new Map();
  for (const img of images) {
    const origFilename = String(img.original_filename || '').replace(/^\.?\/+/, '');
    const displayUrl = img.display_url || img.image_url || '';
    if (origFilename && displayUrl) {
      assetUrlMap.set(origFilename, displayUrl);
      if (!origFilename.startsWith('assets/')) {
        assetUrlMap.set(`assets/images/${origFilename}`, displayUrl);
        assetUrlMap.set(`images/${origFilename}`, displayUrl);
      }
      imagesByPath.set(origFilename, img);
      imagesByPath.set(`assets/images/${origFilename}`, img);
    }
  }
  for (const f of files) {
    const relP = String(f.relative_path || f.path || '').replace(/^\.?\/+/, '');
    const stKey = String(f.storage_key || '');
    if (relP && /^https?:\/\//i.test(stKey)) {
      assetUrlMap.set(relP, stKey);
    }
  }

  const vRes = await db.prepare('SELECT * FROM template_relationship_variants WHERE template_id = ? AND is_latest = 1 ORDER BY sort_order ASC').bind(tpl.id).all().catch(() => ({ results: [] }));
  const variants = vRes.results || [];

  // Attempt to load text file contents from injected OR environment-configured B2 storage provider
  const fileContentsMap = new Map();
  const previewFileContentsMap = new Map();
  let storageProvider = env?.B2_STORAGE_PROVIDER || null;
  if (!storageProvider) {
    try {
      const b2Cfg = getB2Config(env);
      if (b2Cfg && b2Cfg.isConfigured) {
        storageProvider = B2StorageProvider.fromEnv(env);
      }
    } catch (_) {}
  }

  if (storageProvider && typeof storageProvider.getObject === 'function') {
    for (const f of files) {
      const relP = String(f.relative_path || f.path || '').replace(/^\.?\/+/, '');
      const ext = relP.split('.').pop().toLowerCase();
      if (TEXT_FILE_EXTENSIONS.has(ext) && f.storage_key && !f.storage_key.startsWith('http')) {
        try {
          const obj = await storageProvider.getObject({ key: f.storage_key });
          if (obj && obj.body) {
            const rawText = typeof obj.body === 'string'
              ? obj.body
              : new TextDecoder('utf-8').decode(obj.body instanceof Uint8Array ? obj.body : new Uint8Array(obj.body));
            previewFileContentsMap.set(relP, rawText);
            // Reverse-normalize any rewritten ImgBB CDN URLs back to their original relative paths so diffs against a new local ZIP are clean
            let normalizedDiffText = rawText;
            for (const [assetPath, cdnUrl] of assetUrlMap.entries()) {
              if (assetPath.startsWith('assets/') && cdnUrl && normalizedDiffText.includes(cdnUrl)) {
                normalizedDiffText = normalizedDiffText.split(cdnUrl).join(assetPath);
              }
            }
            fileContentsMap.set(relP, normalizedDiffText);
          }
        } catch (_) {}
      }
    }
  }

  return {
    template: tpl,
    version,
    files,
    images,
    imagesByPath,
    assetUrlMap,
    variants,
    fileContentsMap,
    previewFileContentsMap
  };
}


import {
  ensureTemplateIngestionSchema,
  executeB2TemplateIngestPipeline
} from './template-ingest-pipeline.js';
import {
  validateAdminTemplateConfiguration
} from './template-protocol-validator.js';

/**
 * Stages an uploaded template ZIP into `template_import_sessions`, runs strict ZIP security
 * & UTP v1.0/v1.1/v1.2 validation, executes Automatic Template Recognition against all
 * registered templates in D1, and prepares the Side-by-Side Comparison against the top/intended candidate.
 *
 * NEVER auto-publishes or mutates any live template record.
 */
export async function stageAndRecognizeTemplateZip({
  db,
  env = {},
  zipBuffer,
  filename = 'template-package.zip',
  intendedTargetTemplateId = null,
  idempotencyKey = null,
  adminUser = { id: 'admin', email: 'admin@wishmagic.in' },
  zipLimits = {}
}) {
  if (!db || typeof db.prepare !== 'function') {
    const err = new Error('D1 database binding is required for template import studio.');
    err.code = 'DATABASE_UNAVAILABLE';
    err.status = 503;
    throw err;
  }

  await ensureTemplateIngestionSchema(db);

  // Idempotency check
  if (idempotencyKey) {
    const existingSession = await db.prepare(
      'SELECT * FROM template_import_sessions WHERE idempotency_key = ? LIMIT 1'
    ).bind(String(idempotencyKey).trim()).first().catch(() => null);
    if (existingSession) {
      return await formatImportSessionResponse(db, existingSession, { idempotentReplay: true });
    }
  }

  const nowIso = new Date().toISOString();
  const sessionId = `imps_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  const previewToken = crypto.randomUUID().replace(/-/g, '');

  // 1. Insert initial session in UPLOADED -> INSPECTING state
  await db.prepare(`
    INSERT INTO template_import_sessions (
      id, idempotency_key, admin_id, admin_email, state,
      intended_target_template_id, decision_mode, recognition_outcome,
      preview_token, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    sessionId,
    idempotencyKey ? String(idempotencyKey).trim() : null,
    adminUser?.id || 'admin',
    adminUser?.email || '',
    IMPORT_SESSION_STATE.INSPECTING,
    intendedTargetTemplateId || null,
    IMPORT_DECISION_MODE.UNDECIDED,
    RECOGNITION_OUTCOME.NO_EXISTING_MATCH,
    previewToken,
    nowIso,
    nowIso
  ).run();

  // 2. Inspect and validate the ZIP package
  const inspection = await inspectAndValidateTemplateZip(zipBuffer, zipLimits);

  const packageMetadata = {
    filename: String(filename || 'template-package.zip'),
    zipSizeBytes: inspection.zipSizeBytes || (zipBuffer?.byteLength || 0),
    extractedSizeBytes: inspection.totalUncompressedBytes || 0,
    fileCount: inspection.fileCount || 0,
    entryFile: inspection.entryFile || null,
    hasManifestFile: Boolean(inspection.hasManifestFile),
    detectedId: inspection.identity?.explicitStableId || null,
    canonicalTemplateId: inspection.identity?.canonicalTemplateId || null,
    detectedSlug: inspection.identity?.explicitSlug || null,
    detectedName: inspection.identity?.declaredName || null,
    declaredVersion: inspection.identity?.declaredVersion || null,
    schemaVersion: inspection.identity?.declaredSchemaVersion || '1.0.0',
    isLegacyPackage: Boolean(inspection.identity?.isLegacyPackage),
    updateMetadata: inspection.identity?.updateMetadata || {}
  };

  const validationPayload = {
    valid: inspection.valid,
    canPreview: inspection.canPreview,
    errorCode: inspection.errorCode,
    errorMessage: inspection.errorMessage,
    securityErrors: inspection.securityErrors || [],
    validationErrors: inspection.validationErrors || [],
    warnings: inspection.warnings || [],
    utpSummary: inspection.utpReport?.summary || null,
    previewDiagnostics: inspection.previewDiagnostics || null
  };

  if (!inspection.valid) {
    const failedAt = new Date().toISOString();
    await db.prepare(`
      UPDATE template_import_sessions
      SET state = ?,
          recognition_outcome = ?,
          recognition_summary = ?,
          package_metadata_json = ?,
          validation_report_json = ?,
          error_code = ?,
          error_message = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(
      IMPORT_SESSION_STATE.FAILED,
      RECOGNITION_OUTCOME.INVALID_OR_UNSUPPORTED_PACKAGE,
      inspection.errorMessage || 'The uploaded package is invalid and cannot be previewed.',
      JSON.stringify(packageMetadata),
      JSON.stringify(validationPayload),
      inspection.errorCode || 'INVALID_OR_UNSUPPORTED_PACKAGE',
      inspection.errorMessage || 'The uploaded package is invalid and cannot be previewed.',
      failedAt,
      sessionId
    ).run();

    const failedRow = await db.prepare('SELECT * FROM template_import_sessions WHERE id = ?').bind(sessionId).first();
    return await formatImportSessionResponse(db, failedRow);
  }

  // 3. Load existing templates from D1 and run Automatic Template Recognition
  const existingTemplates = await loadExistingTemplatesForRecognition(db);
  const recognition = recognizeTemplatePackage(inspection, existingTemplates, {
    intendedTargetTemplateId
  });

  // 4. Determine initial candidate target for comparison (without making an automatic destructive decision!)
  const selectedTargetId = intendedTargetTemplateId ||
    recognition.recommendedTargetTemplateId ||
    (recognition.candidates.length === 1 ? recognition.candidates[0].templateId : null);

  let existingContext = null;
  if (selectedTargetId) {
    existingContext = await loadSingleTemplateComparisonContext(db, selectedTargetId, env);
  }

  const comparison = compareExistingTemplateWithStagedPackage(existingContext, inspection);
  const variantCatalog = buildPreviewVariantCatalog(
    existingContext?.variants || [],
    inspection.normalizedManifest?.variants || []
  );
  comparison.variantCatalog = variantCatalog;

  const stagedBundle = serializeStagedFilesBundle(inspection.files);
  const baseLockVersion = existingContext?.template ? Number(existingContext.template.lock_version || 1) : 1;
  const basePublishedVersionId = existingContext?.version?.id || existingContext?.template?.current_version_id || null;

  const nextState = inspection.canPreview
    ? IMPORT_SESSION_STATE.PREVIEW_READY
    : IMPORT_SESSION_STATE.RECOGNIZED;

  const updatedAt = new Date().toISOString();
  await db.prepare(`
    UPDATE template_import_sessions
    SET state = ?,
        selected_target_template_id = ?,
        recognition_outcome = ?,
        recognition_summary = ?,
        recognition_report_json = ?,
        package_metadata_json = ?,
        package_fingerprint = ?,
        source_zip_sha256 = ?,
        runtime_hash = ?,
        schema_hash = ?,
        manifest_json = ?,
        files_inventory_json = ?,
        staged_files_bundle_json = ?,
        validation_report_json = ?,
        comparison_report_json = ?,
        base_template_lock_version = ?,
        base_published_version_id = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(
    nextState,
    existingContext?.template?.id || selectedTargetId || null,
    recognition.outcome,
    recognition.explanation,
    JSON.stringify(recognition),
    JSON.stringify(packageMetadata),
    inspection.packageFingerprint,
    inspection.sourceZipSha256,
    inspection.runtimeHash,
    inspection.schemaHash,
    JSON.stringify(inspection.normalizedManifest || {}),
    JSON.stringify(inspection.fileRecords || []),
    JSON.stringify(stagedBundle),
    JSON.stringify(validationPayload),
    JSON.stringify(comparison),
    baseLockVersion,
    basePublishedVersionId,
    updatedAt,
    sessionId
  ).run();

  const savedSession = await db.prepare('SELECT * FROM template_import_sessions WHERE id = ?').bind(sessionId).first();
  return await formatImportSessionResponse(db, savedSession);
}

/**
 * Formats a `template_import_sessions` D1 row into the structured API response for the Admin Studio
 */
export async function formatImportSessionResponse(db, row, extra = {}) {
  if (!row) return null;
  const recognition = safeJsonParse(row.recognition_report_json, {
    outcome: row.recognition_outcome,
    explanation: row.recognition_summary,
    candidates: [],
    conflicts: []
  });
  const packageMetadata = safeJsonParse(row.package_metadata_json, {});
  const manifest = safeJsonParse(row.manifest_json, {});
  const filesInventory = safeJsonParse(row.files_inventory_json, []);
  const validation = safeJsonParse(row.validation_report_json, {});
  const comparison = safeJsonParse(row.comparison_report_json, {});
  const adminConfigOverrides = safeJsonParse(row.admin_config_overrides_json, {});

  const selectedTargetId = row.selected_target_template_id || null;
  let existingTemplateSummary = comparison?.existingTemplate || null;
  if (selectedTargetId && db && typeof db.prepare === 'function') {
    const liveTpl = await db.prepare('SELECT * FROM templates WHERE id = ? LIMIT 1').bind(selectedTargetId).first().catch(() => null);
    if (liveTpl) {
      let curVer = null;
      if (liveTpl.current_version_id) {
        curVer = await db.prepare('SELECT * FROM template_versions WHERE id = ? LIMIT 1').bind(liveTpl.current_version_id).first().catch(() => null);
      }
      existingTemplateSummary = {
        id: liveTpl.id,
        name: liveTpl.name,
        slug: liveTpl.slug,
        thumbnail: liveTpl.thumbnail || '/assets/file_ab2082.png',
        category: liveTpl.category,
        tier: liveTpl.tier,
        price: liveTpl.price,
        status: liveTpl.status || (liveTpl.is_published ? 'published' : 'draft'),
        currentVersionId: curVer?.id || liveTpl.current_version_id,
        currentVersionLabel: curVer?.version_label || `v${curVer?.version_number || 1}.0.0`,
        lockVersion: Number(liveTpl.lock_version || 1),
        sections: safeJsonParse(curVer?.sections || liveTpl.sections, []),
        fields: safeJsonParse(curVer?.fields_json || liveTpl.detected_fields, []),
        actions: safeJsonParse(curVer?.actions_json || liveTpl.actions_json, []),
        variants: safeJsonParse(curVer?.variants_json || liveTpl.variants_json, []),
        visibilityConfig: safeJsonParse(curVer?.visibility_config_json || liveTpl.visibility_config_json, {}),
        actionsConfig: safeJsonParse(curVer?.actions_config_json || liveTpl.actions_config_json, {}),
        updatedAt: liveTpl.updated_at || liveTpl.created_at
      };
    }
  }

  const entryFile = packageMetadata.entryFile || 'index.html';
  return {
    success: row.state !== IMPORT_SESSION_STATE.FAILED,
    sessionId: row.id,
    state: row.state,
    decisionMode: row.decision_mode || IMPORT_DECISION_MODE.UNDECIDED,
    intendedTargetTemplateId: row.intended_target_template_id || null,
    selectedTargetTemplateId: selectedTargetId,
    recognitionOutcome: row.recognition_outcome,
    recognitionSummary: row.recognition_summary,
    recognition,
    candidates: recognition.candidates || [],
    conflicts: recognition.conflicts || [],
    packageMetadata,
    manifest,
    filesInventory,
    validation,
    comparison,
    existingTemplate: existingTemplateSummary,
    adminConfigOverrides,
    baseTemplateLockVersion: row.base_template_lock_version,
    basePublishedVersionId: row.base_published_version_id,
    warningsAcknowledged: Boolean(row.warnings_acknowledged),
    publishedTemplateId: row.published_template_id || null,
    publishedVersionId: row.published_version_id || null,
    publishedVersionLabel: row.published_version_label || null,
    errorCode: row.error_code || null,
    errorMessage: row.error_message || null,
    previewToken: row.preview_token || null,
    previewUrls: {
      existing: selectedTargetId
        ? `/api/templates/import-studio/${row.id}/preview/existing/index.html${row.preview_token ? `?token=${encodeURIComponent(row.preview_token)}` : ''}`
        : null,
      staged: row.state !== IMPORT_SESSION_STATE.CANCELLED && validation.canPreview !== false
        ? `/api/templates/import-studio/${row.id}/preview/staged/${entryFile}${row.preview_token ? `?token=${encodeURIComponent(row.preview_token)}` : ''}`
        : null
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at || null,
    cancelledAt: row.cancelled_at || null,
    ...extra
  };
}

/**
 * Re-computes comparison and synchronized variant catalog when the admin selects a different candidate template
 */
export async function compareImportSessionWithTarget({
  db,
  env = {},
  sessionId,
  targetTemplateId
}) {
  await ensureTemplateIngestionSchema(db);
  const row = await db.prepare('SELECT * FROM template_import_sessions WHERE id = ? LIMIT 1').bind(sessionId).first();
  if (!row) {
    const err = new Error(`Import session "${sessionId}" not found.`);
    err.code = 'SESSION_NOT_FOUND';
    err.status = 404;
    throw err;
  }
  if (row.state === IMPORT_SESSION_STATE.CANCELLED) {
    const err = new Error('Cannot compare a cancelled import session.');
    err.code = 'SESSION_CANCELLED';
    err.status = 400;
    throw err;
  }

  const stagedBundle = safeJsonParse(row.staged_files_bundle_json, {});
  const extractedFiles = deserializeStagedFilesBundle(stagedBundle);
  const fileRecords = safeJsonParse(row.files_inventory_json, []);
  const normalizedManifest = safeJsonParse(row.manifest_json, {});
  const packageMetadata = safeJsonParse(row.package_metadata_json, {});

  const reconstructedInspection = {
    valid: row.state !== IMPORT_SESSION_STATE.FAILED,
    files: extractedFiles,
    fileRecords,
    normalizedManifest,
    entryFile: packageMetadata.entryFile || 'index.html',
    invalidFiles: [],
    identity: {
      explicitStableId: packageMetadata.detectedId,
      explicitSlug: packageMetadata.detectedSlug,
      declaredName: packageMetadata.detectedName,
      declaredVersion: packageMetadata.declaredVersion,
      declaredSchemaVersion: packageMetadata.schemaVersion
    }
  };

  let existingContext = null;
  if (targetTemplateId) {
    existingContext = await loadSingleTemplateComparisonContext(db, targetTemplateId, env);
    if (!existingContext) {
      const err = new Error(`Target template "${targetTemplateId}" not found.`);
      err.code = 'TARGET_TEMPLATE_NOT_FOUND';
      err.status = 404;
      throw err;
    }
  }

  const comparison = compareExistingTemplateWithStagedPackage(existingContext, reconstructedInspection);
  comparison.variantCatalog = buildPreviewVariantCatalog(
    existingContext?.variants || [],
    normalizedManifest?.variants || []
  );

  const baseLockVersion = existingContext?.template ? Number(existingContext.template.lock_version || 1) : 1;
  const basePublishedVersionId = existingContext?.version?.id || existingContext?.template?.current_version_id || null;
  const nowIso = new Date().toISOString();

  await db.prepare(`
    UPDATE template_import_sessions
    SET selected_target_template_id = ?,
        comparison_report_json = ?,
        base_template_lock_version = ?,
        base_published_version_id = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(
    existingContext?.template?.id || null,
    JSON.stringify(comparison),
    baseLockVersion,
    basePublishedVersionId,
    nowIso,
    sessionId
  ).run();

  const updatedRow = await db.prepare('SELECT * FROM template_import_sessions WHERE id = ?').bind(sessionId).first();
  return await formatImportSessionResponse(db, updatedRow);
}

/**
 * Validates the Administrator's explicit manual decision (Option A: update_existing vs Option B: create_new)
 * and transitions the session to READY_TO_PUBLISH if valid.
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
  await ensureTemplateIngestionSchema(db);
  const row = await db.prepare('SELECT * FROM template_import_sessions WHERE id = ? LIMIT 1').bind(sessionId).first();
  if (!row) {
    const err = new Error(`Import session "${sessionId}" not found.`);
    err.code = 'SESSION_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  validateImportStateTransition(row.state, IMPORT_SESSION_STATE.VALIDATING);

  const validation = safeJsonParse(row.validation_report_json, {});
  if (!validation.valid) {
    const err = new Error(validation.errorMessage || 'Cannot validate decision: package failed security or manifest validation.');
    err.code = validation.errorCode || 'PACKAGE_VALIDATION_FAILED';
    err.status = 400;
    throw err;
  }

  const mode = String(decisionMode || '').trim().toLowerCase();
  if (mode !== IMPORT_DECISION_MODE.UPDATE_EXISTING && mode !== IMPORT_DECISION_MODE.CREATE_NEW) {
    const err = new Error(`Invalid decisionMode "${decisionMode}". Must be "update_existing" or "create_new".`);
    err.code = 'INVALID_DECISION_MODE';
    err.status = 400;
    throw err;
  }

  const recognition = safeJsonParse(row.recognition_report_json, {});
  const packageMetadata = safeJsonParse(row.package_metadata_json, {});
  const manifest = safeJsonParse(row.manifest_json, {});
  const existingOverrides = safeJsonParse(row.admin_config_overrides_json, {});
  const mergedOverrides = {
    ...existingOverrides,
    ...(adminConfigOverrides && typeof adminConfigOverrides === 'object' ? adminConfigOverrides : {})
  };

  // Validate UTP v1.2.0 visibility & action configuration overrides if present
  if (
    mergedOverrides.visibilityConfig ||
    mergedOverrides.actionsConfig ||
    mergedOverrides.variantOverrides
  ) {
    const stagedBundle = safeJsonParse(row.staged_files_bundle_json, {});
    const entryFile = packageMetadata.entryFile || 'index.html';
    const entryHtmlText = stagedBundle[entryFile]?.content || '';
    const cfgCheck = validateAdminTemplateConfiguration({
      manifest,
      visibilityConfig: mergedOverrides.visibilityConfig || {},
      actionsConfig: mergedOverrides.actionsConfig || {},
      variantOverrides: mergedOverrides.variantOverrides || {},
      htmlContent: entryHtmlText
    });
    if (!cfgCheck.valid) {
      const err = new Error(cfgCheck.errors[0]?.message || 'Invalid section visibility or button action configuration.');
      err.code = 'UTP_CONFIG_VALIDATION_FAILED';
      err.status = 400;
      err.errors = cfgCheck.errors;
      throw err;
    }
  }

  let resolvedTargetTemplateId = targetTemplateId || row.selected_target_template_id || null;
  let comparison = safeJsonParse(row.comparison_report_json, {});
  let baseLockVersion = row.base_template_lock_version || 1;
  let basePublishedVersionId = row.base_published_version_id || null;

  if (mode === IMPORT_DECISION_MODE.UPDATE_EXISTING) {
    if (!resolvedTargetTemplateId) {
      const err = new Error('Target existing template ID is required when choosing "Update Existing Template".');
      err.code = 'TARGET_TEMPLATE_REQUIRED';
      err.status = 400;
      throw err;
    }

    const existingContext = await loadSingleTemplateComparisonContext(db, resolvedTargetTemplateId, env);
    if (!existingContext || !existingContext.template) {
      const err = new Error(`Target template "${resolvedTargetTemplateId}" does not exist in the database.`);
      err.code = 'TARGET_TEMPLATE_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const liveTpl = existingContext.template;
    resolvedTargetTemplateId = liveTpl.id;

    // Check if there is an identity conflict with ANOTHER template
    if (recognition.outcome === RECOGNITION_OUTCOME.IDENTITY_CONFLICT && !resolveConflictConfirmed) {
      const err = new Error(
        `Identity conflict detected: ${recognition.explanation} Confirm conflict resolution explicitly or fix the manifest identifier before updating.`
      );
      err.code = 'IDENTITY_CONFLICT_UNRESOLVED';
      err.status = 409;
      err.conflicts = recognition.conflicts;
      throw err;
    }

    // Check optimistic concurrency / stale published version if target was already selected when session started
    if (
      row.selected_target_template_id === liveTpl.id &&
      row.base_published_version_id &&
      liveTpl.current_version_id &&
      row.base_published_version_id !== liveTpl.current_version_id
    ) {
      const err = new Error(
        `Template "${liveTpl.name}" published version changed from "${row.base_published_version_id}" to "${liveTpl.current_version_id}" while this import was under review. Refresh comparison and revalidate before publishing.`
      );
      err.code = 'STALE_VERSION_CONFLICT';
      err.status = 409;
      throw err;
    }

    // Recompute fresh comparison against target template
    const stagedBundle = safeJsonParse(row.staged_files_bundle_json, {});
    const extractedFiles = deserializeStagedFilesBundle(stagedBundle);
    const fileRecords = safeJsonParse(row.files_inventory_json, []);
    comparison = compareExistingTemplateWithStagedPackage(existingContext, {
      valid: true,
      files: extractedFiles,
      fileRecords,
      normalizedManifest: manifest,
      entryFile: packageMetadata.entryFile || 'index.html',
      invalidFiles: [],
      identity: {
        explicitStableId: packageMetadata.detectedId,
        explicitSlug: packageMetadata.detectedSlug,
        declaredName: packageMetadata.detectedName,
        declaredVersion: packageMetadata.declaredVersion,
        declaredSchemaVersion: packageMetadata.schemaVersion
      }
    });
    comparison.variantCatalog = buildPreviewVariantCatalog(
      existingContext.variants || [],
      manifest.variants || []
    );

    baseLockVersion = Number(liveTpl.lock_version || 1);
    basePublishedVersionId = existingContext.version?.id || liveTpl.current_version_id || null;

    if (comparison.hasDestructiveChanges && !warningsAcknowledged && !row.warnings_acknowledged) {
      const err = new Error(
        `This update contains ${comparison.destructiveWarnings.length} destructive/removal warning(s). Please review and acknowledge the warnings before publishing.`
      );
      err.code = 'DESTRUCTIVE_WARNINGS_REQUIRE_ACKNOWLEDGMENT';
      err.status = 400;
      err.destructiveWarnings = comparison.destructiveWarnings;
      throw err;
    }

    mergedOverrides.allowSlugChange = Boolean(allowSlugChange);
    if (allowSlugChange && newTemplateSlug) {
      const cleanNewSlug = normalizeTemplateSlug(newTemplateSlug);
      const slugOwner = await db.prepare('SELECT id FROM templates WHERE slug = ? AND id != ? LIMIT 1').bind(cleanNewSlug, liveTpl.id).first().catch(() => null);
      if (slugOwner) {
        const err = new Error(`Requested slug "${cleanNewSlug}" is already in use by template "${slugOwner.id}".`);
        err.code = 'SLUG_CONFLICT';
        err.status = 409;
        throw err;
      }
      mergedOverrides.requestedSlug = cleanNewSlug;
    }
  } else if (mode === IMPORT_DECISION_MODE.CREATE_NEW) {
    // Option B: Create New Template
    // Verify that the package's stable ID / slug does not silently reuse or overwrite an existing template's identity!
    const rawCandidateSlug = newTemplateSlug || packageMetadata.detectedSlug || normalizeTemplateSlug(newTemplateName || packageMetadata.detectedName || 'new-template');
    const cleanSlug = normalizeTemplateSlug(rawCandidateSlug);
    const candidateCanonicalId = newTemplateId
      ? normalizeCanonicalTemplateId(newTemplateId)
      : (newTemplateSlug ? normalizeCanonicalTemplateId(cleanSlug) : (packageMetadata.canonicalTemplateId || normalizeCanonicalTemplateId(cleanSlug)));

    const altId = candidateCanonicalId.replace(/-/g, '_').replace(/^tpl__+/, 'tpl_');
    const existingIdOwner = await db.prepare('SELECT id, name, slug FROM templates WHERE id = ? OR id = ? LIMIT 1').bind(candidateCanonicalId, altId).first().catch(() => null);
    if (existingIdOwner) {
      const err = new Error(
        `Cannot create new template with ID "${candidateCanonicalId}": that stable template ID is already owned by "${existingIdOwner.name}" (${existingIdOwner.id}). Provide a unique newTemplateId/newTemplateSlug or choose Update Existing Template.`
      );
      err.code = 'STABLE_ID_ALREADY_OWNED';
      err.status = 409;
      err.existingOwner = existingIdOwner;
      throw err;
    }

    const existingSlugOwner = await db.prepare('SELECT id, name, slug FROM templates WHERE slug = ? LIMIT 1').bind(cleanSlug).first().catch(() => null);
    if (existingSlugOwner) {
      const err = new Error(
        `Cannot create new template with slug "${cleanSlug}": that slug is already owned by "${existingSlugOwner.name}" (${existingSlugOwner.id}). Provide a unique slug.`
      );
      err.code = 'SLUG_ALREADY_OWNED';
      err.status = 409;
      err.existingOwner = existingSlugOwner;
      throw err;
    }

    mergedOverrides.newTemplateId = candidateCanonicalId;
    mergedOverrides.newTemplateSlug = cleanSlug;
    if (newTemplateName) mergedOverrides.newTemplateName = String(newTemplateName).trim();
  }

  validateImportStateTransition(IMPORT_SESSION_STATE.VALIDATING, IMPORT_SESSION_STATE.READY_TO_PUBLISH);
  const nowIso = new Date().toISOString();

  await db.prepare(`
    UPDATE template_import_sessions
    SET state = ?,
        decision_mode = ?,
        selected_target_template_id = ?,
        comparison_report_json = ?,
        admin_config_overrides_json = ?,
        base_template_lock_version = ?,
        base_published_version_id = ?,
        warnings_acknowledged = ?,
        error_code = NULL,
        error_message = NULL,
        updated_at = ?
    WHERE id = ?
  `).bind(
    IMPORT_SESSION_STATE.READY_TO_PUBLISH,
    mode,
    mode === IMPORT_DECISION_MODE.UPDATE_EXISTING ? resolvedTargetTemplateId : null,
    JSON.stringify(comparison),
    JSON.stringify(mergedOverrides),
    baseLockVersion,
    basePublishedVersionId,
    warningsAcknowledged || row.warnings_acknowledged ? 1 : 0,
    nowIso,
    sessionId
  ).run();

  const updatedRow = await db.prepare('SELECT * FROM template_import_sessions WHERE id = ?').bind(sessionId).first();
  return await formatImportSessionResponse(db, updatedRow);
}

/**
 * Executes Atomic Publication of a validated Import Session (`READY_TO_PUBLISH -> PUBLISHING -> PUBLISHED`).
 * Enforces state machine guards, optimistic concurrency (`lockVersion` & stale version check),
 * immutable version creation, rollback pointer preservation, and existing-wish immutability.
 */
export async function publishImportSession({
  db,
  env = {},
  sessionId,
  expectedLockVersion = null,
  warningsAcknowledged = false,
  releaseNotes = '',
  zipBase64 = null,
  preUploadedImgbbMap = null,
  skipServerImgbbRetry = false,
  adminUser = { id: 'admin', email: 'admin@wishmagic.in' },
  storageProvider = null,
  imgbbProvider = null
}) {
  await ensureTemplateIngestionSchema(db);
  const row = await db.prepare('SELECT * FROM template_import_sessions WHERE id = ? LIMIT 1').bind(sessionId).first();
  if (!row) {
    const err = new Error(`Import session "${sessionId}" not found.`);
    err.code = 'SESSION_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  // Idempotent return if already PUBLISHED
  if (row.state === IMPORT_SESSION_STATE.PUBLISHED) {
    return await formatImportSessionResponse(db, row, { idempotentPublish: true, alreadyPublished: true });
  }

  // Strict server-side state machine guard: must be READY_TO_PUBLISH!
  if (row.state !== IMPORT_SESSION_STATE.READY_TO_PUBLISH) {
    const err = new Error(
      `Cannot publish import session in state "${row.state}". Session must pass validation and be in READY_TO_PUBLISH state first.`
    );
    err.code = 'INVALID_IMPORT_STATE_FOR_PUBLISH';
    err.status = 400;
    throw err;
  }

  const mode = row.decision_mode;
  if (mode !== IMPORT_DECISION_MODE.UPDATE_EXISTING && mode !== IMPORT_DECISION_MODE.CREATE_NEW) {
    const err = new Error('Explicit admin decision (update_existing or create_new) is required before publishing.');
    err.code = 'DECISION_REQUIRED';
    err.status = 400;
    throw err;
  }

  const comparison = safeJsonParse(row.comparison_report_json, {});
  if (
    mode === IMPORT_DECISION_MODE.UPDATE_EXISTING &&
    comparison.hasDestructiveChanges &&
    !warningsAcknowledged &&
    !row.warnings_acknowledged
  ) {
    const err = new Error('Destructive change warnings must be acknowledged before publishing.');
    err.code = 'DESTRUCTIVE_WARNINGS_REQUIRE_ACKNOWLEDGMENT';
    err.status = 400;
    throw err;
  }

  const packageMetadata = safeJsonParse(row.package_metadata_json, {});
  const manifest = safeJsonParse(row.manifest_json, {});
  const overrides = safeJsonParse(row.admin_config_overrides_json, {});
  const stagedBundle = safeJsonParse(row.staged_files_bundle_json, {});

  let targetTpl = null;
  let previousCurrentVersion = null;

  if (mode === IMPORT_DECISION_MODE.UPDATE_EXISTING) {
    const targetId = row.selected_target_template_id;
    targetTpl = await db.prepare('SELECT * FROM templates WHERE id = ? LIMIT 1').bind(targetId).first();
    if (!targetTpl) {
      const err = new Error(`Target template "${targetId}" no longer exists.`);
      err.code = 'TARGET_TEMPLATE_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const liveLock = Number(targetTpl.lock_version || 1);
    const checkLock = expectedLockVersion !== null && expectedLockVersion !== undefined
      ? Number(expectedLockVersion)
      : Number(row.base_template_lock_version || 1);

    if (liveLock !== checkLock) {
      const err = new Error(
        `Concurrency conflict: Template "${targetTpl.name}" was modified by another administrator (expected lockVersion ${checkLock}, found ${liveLock}). Refresh and revalidate before publishing.`
      );
      err.code = 'CONCURRENCY_CONFLICT';
      err.status = 409;
      err.currentLockVersion = liveLock;
      throw err;
    }

    if (
      row.base_published_version_id &&
      targetTpl.current_version_id &&
      row.base_published_version_id !== targetTpl.current_version_id
    ) {
      const err = new Error(
        `Stale version conflict: Template "${targetTpl.name}" active published version changed to "${targetTpl.current_version_id}" while this update was staged. Rebase/revalidate before publishing.`
      );
      err.code = 'STALE_VERSION_CONFLICT';
      err.status = 409;
      throw err;
    }

    if (targetTpl.current_version_id) {
      previousCurrentVersion = await db.prepare('SELECT * FROM template_versions WHERE id = ? LIMIT 1').bind(targetTpl.current_version_id).first().catch(() => null);
    }
    if (!previousCurrentVersion) {
      previousCurrentVersion = await db.prepare('SELECT * FROM template_versions WHERE template_id = ? AND is_current = 1 LIMIT 1').bind(targetTpl.id).first().catch(() => null);
    }
  } else {
    // Double-check uniqueness for create_new right before publish
    const createId = overrides.newTemplateId || normalizeCanonicalTemplateId(packageMetadata.detectedId || packageMetadata.detectedSlug || 'new-template');
    const createSlug = overrides.newTemplateSlug || normalizeTemplateSlug(createId);
    const conflictRow = await db.prepare('SELECT id, name FROM templates WHERE id = ? OR slug = ? LIMIT 1').bind(createId, createSlug).first().catch(() => null);
    if (conflictRow) {
      const err = new Error(`Conflict detected: Template ID "${createId}" or slug "${createSlug}" is already registered by "${conflictRow.name}".`);
      err.code = 'IDENTITY_CONFLICT';
      err.status = 409;
      throw err;
    }
  }

  // Transition session to PUBLISHING
  validateImportStateTransition(row.state, IMPORT_SESSION_STATE.PUBLISHING);
  await db.prepare('UPDATE template_import_sessions SET state = ?, updated_at = ? WHERE id = ?')
    .bind(IMPORT_SESSION_STATE.PUBLISHING, new Date().toISOString(), sessionId).run();

  try {
    // Use client-provided compact ZIP buffer if supplied during publish, otherwise rebuild from staged files
    let zipBuffer;
    if (zipBase64 && typeof zipBase64 === 'string' && zipBase64.length > 0) {
      const cleanB64 = zipBase64.replace(/^data:[^;]+;base64,/i, '').replace(/\s+/g, '');
      const binStr = atob(cleanB64);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      zipBuffer = bytes.buffer;
    } else {
      zipBuffer = await createZipFromFiles(stagedBundle);
    }

    let ingestTemplateId;
    let ingestFamilyId;
    let ingestSlug;
    let ingestName;
    let ingestCategory;
    let ingestTier;
    let ingestPrice;
    let ingestDescription;
    let ingestFeatured;
    let ingestPlacement;
    let ingestThumbnail;
    let nextVersionNumber = 1;
    let nextVersionLabel = packageMetadata.declaredVersion || 'v1.0.0';

    if (mode === IMPORT_DECISION_MODE.UPDATE_EXISTING && targetTpl) {
      // Preserve canonical template ID and slug (unless explicit slug change was validated)
      ingestTemplateId = targetTpl.id;
      ingestSlug = (overrides.allowSlugChange && overrides.requestedSlug) ? overrides.requestedSlug : targetTpl.slug;
      ingestFamilyId = `fam_${String(targetTpl.id).replace(/^tpl_/, '')}`;
      // Preserve administrative metadata unless explicitly overridden in studio
      ingestName = overrides.name || manifest.template?.name || targetTpl.name;
      ingestCategory = overrides.category || targetTpl.category || manifest.template?.category || 'celebration';
      ingestTier = overrides.tier || targetTpl.tier || 'free';
      ingestPrice = overrides.price !== undefined ? Number(overrides.price) : Number(targetTpl.price ?? 0);
      ingestDescription = overrides.description || manifest.template?.description || targetTpl.description || '';
      ingestFeatured = overrides.featured !== undefined ? Boolean(overrides.featured) : Boolean(targetTpl.featured);
      ingestPlacement = overrides.placement !== undefined ? Number(overrides.placement) : Number(targetTpl.placement ?? 99);
      ingestThumbnail = overrides.thumbnail || targetTpl.thumbnail || manifest.template?.thumbnail || '';

      const verRowsRes = await db.prepare('SELECT version_number, version_label FROM template_versions WHERE template_id = ? ORDER BY version_number DESC').bind(targetTpl.id).all().catch(() => ({ results: [] }));
      const existingVers = verRowsRes.results || [];
      const maxVerNum = existingVers.reduce((acc, v) => Math.max(acc, Number(v.version_number || 0)), 0);
      nextVersionNumber = maxVerNum + 1;
      if (packageMetadata.declaredVersion) {
        const cleanDecl = String(packageMetadata.declaredVersion).trim();
        nextVersionLabel = cleanDecl.startsWith('v') ? cleanDecl : `v${cleanDecl}`;
      } else {
        nextVersionLabel = `v1.${nextVersionNumber - 1}.0`;
      }
    } else {
      ingestSlug = overrides.newTemplateSlug || packageMetadata.detectedSlug || normalizeTemplateSlug(overrides.newTemplateName || packageMetadata.detectedName || 'custom-template');
      ingestTemplateId = overrides.newTemplateId || normalizeCanonicalTemplateId(ingestSlug);
      ingestFamilyId = `fam_${ingestSlug.replace(/-/g, '_')}`;
      ingestName = overrides.newTemplateName || overrides.name || packageMetadata.detectedName || manifest.template?.name || 'Custom Template';
      ingestCategory = overrides.category || manifest.template?.category || 'celebration';
      ingestTier = overrides.tier || manifest.template?.tier || 'free';
      ingestPrice = overrides.price !== undefined ? Number(overrides.price) : Number(manifest.template?.price ?? 0);
      ingestDescription = overrides.description || manifest.template?.description || '';
      ingestFeatured = overrides.featured !== undefined ? Boolean(overrides.featured) : false;
      ingestPlacement = overrides.placement !== undefined ? Number(overrides.placement) : 99;
      ingestThumbnail = overrides.thumbnail || manifest.template?.thumbnail || '';
      nextVersionNumber = 1;
      nextVersionLabel = packageMetadata.declaredVersion
        ? (String(packageMetadata.declaredVersion).startsWith('v') ? packageMetadata.declaredVersion : `v${packageMetadata.declaredVersion}`)
        : 'v1.0.0';
    }

    const activeB2Provider = storageProvider || env.B2_STORAGE_PROVIDER || null;
    const activeImgbbProvider = imgbbProvider || env.IMGBB_PROVIDER || null;

    const ingestRes = await executeB2TemplateIngestPipeline({
      zipBuffer,
      templateMetadata: {
        templateId: ingestTemplateId,
        familyId: ingestFamilyId,
        slug: ingestSlug,
        name: ingestName,
        category: ingestCategory,
        tier: ingestTier,
        price: ingestPrice,
        description: ingestDescription,
        featured: ingestFeatured,
        placement: ingestPlacement,
        thumbnail: ingestThumbnail,
        versionNumber: nextVersionNumber,
        versionLabel: nextVersionLabel,
        visibilityConfig: overrides.visibilityConfig || manifest.visibilityConfig || (targetTpl ? safeJsonParse(targetTpl.visibility_config_json, {}) : {}),
        actionsConfig: overrides.actionsConfig || manifest.actionsConfig || (targetTpl ? safeJsonParse(targetTpl.actions_config_json, {}) : {}),
        variantOverrides: overrides.variantOverrides || {},
        preUploadedImgbbMap: {
          ...(overrides.preUploadedImgbbMap || {}),
          ...(preUploadedImgbbMap && typeof preUploadedImgbbMap === 'object' ? preUploadedImgbbMap : {})
        },
        skipServerImgbbRetry: Boolean(skipServerImgbbRetry || overrides.skipServerImgbbRetry),
        publishImmediately: true
      },
      env,
      db,
      storageProvider: activeB2Provider,
      imgbbProvider: activeImgbbProvider,
      publishImmediately: true,
      authorId: adminUser?.id || 'admin'
    });

    if (!ingestRes || !ingestRes.success) {
      const err = new Error(ingestRes?.message || 'Storage or database ingestion failed during publication.');
      err.code = ingestRes?.code || 'PUBLISH_INGEST_FAILED';
      throw err;
    }

    const publishedVersionId = ingestRes.versionId;
    const publishedTemplateId = ingestRes.templateId;
    const nowIso = new Date().toISOString();

    const changeSummary = {
      mode,
      baseVersionId: previousCurrentVersion?.id || null,
      baseVersionLabel: previousCurrentVersion?.version_label || null,
      filesSummary: comparison?.files?.summary || {},
      sectionsAdded: (comparison?.manifestDiff?.sections?.added || []).map(s => s.id),
      sectionsRemoved: (comparison?.manifestDiff?.sections?.removed || []).map(s => s.id),
      variantsAdded: (comparison?.manifestDiff?.variants?.added || []).map(v => v.key || v),
      variantsRemoved: (comparison?.manifestDiff?.variants?.removed || []).map(v => v.key || v),
      fieldsAdded: (comparison?.manifestDiff?.fields?.added || []).map(f => f.id || f),
      fieldsRemoved: (comparison?.manifestDiff?.fields?.removed || []).map(f => f.id || f),
      actionsAdded: (comparison?.manifestDiff?.actions?.added || []).map(a => a.id || a),
      actionsRemoved: (comparison?.manifestDiff?.actions?.removed || []).map(a => a.id || a),
      destructiveWarningsCount: (comparison?.destructiveWarnings || []).length
    };

    // Atomic version pointer & rollback candidate transition
    const postPublishStmts = [];
    if (previousCurrentVersion && previousCurrentVersion.id !== publishedVersionId) {
      postPublishStmts.push(
        db.prepare(`
          UPDATE template_versions
          SET is_current = 0,
              status = 'rollback_candidate',
              updated_at = ?
          WHERE template_id = ? AND id != ? AND is_current = 1
        `).bind(nowIso, publishedTemplateId, publishedVersionId)
      );
    }

    postPublishStmts.push(
      db.prepare(`
        UPDATE template_versions
        SET is_current = 1,
            status = 'published',
            version_label = ?,
            base_version_id = ?,
            change_summary_json = ?,
            import_session_id = ?,
            release_notes = ?,
            published_at = ?,
            published_by = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(
        nextVersionLabel,
        previousCurrentVersion?.id || null,
        JSON.stringify(changeSummary),
        sessionId,
        releaseNotes || (mode === IMPORT_DECISION_MODE.UPDATE_EXISTING ? `Updated from ${previousCurrentVersion?.version_label || 'previous version'}` : 'Initial template release'),
        nowIso,
        adminUser?.id || 'admin',
        nowIso,
        publishedVersionId
      )
    );

    postPublishStmts.push(
      db.prepare(`
        UPDATE templates
        SET current_version_id = ?,
            rollback_version_id = ?,
            is_published = 1,
            status = 'published',
            placement = ?,
            featured = ?,
            lock_version = COALESCE(lock_version, 1) + 1,
            updated_at = ?
        WHERE id = ?
      `).bind(
        publishedVersionId,
        previousCurrentVersion?.id || null,
        ingestPlacement,
        ingestFeatured ? 1 : 0,
        nowIso,
        publishedTemplateId
      )
    );

    postPublishStmts.push(
      db.prepare(`
        UPDATE template_families
        SET current_version_id = ?,
            published_version_id = ?,
            latest_version_id = ?,
            rollback_version_id = ?,
            status = 'published',
            updated_at = ?
        WHERE id = ? OR slug = ?
      `).bind(
        publishedVersionId,
        publishedVersionId,
        publishedVersionId,
        previousCurrentVersion?.id || null,
        nowIso,
        ingestFamilyId,
        ingestSlug
      )
    );

    postPublishStmts.push(
      db.prepare(`
        UPDATE template_import_sessions
        SET state = ?,
            published_template_id = ?,
            published_version_id = ?,
            published_version_label = ?,
            staged_files_bundle_json = '{}',
            published_at = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(
        IMPORT_SESSION_STATE.PUBLISHED,
        publishedTemplateId,
        publishedVersionId,
        nextVersionLabel,
        nowIso,
        nowIso,
        sessionId
      )
    );

    if (typeof db.batch === 'function') {
      await db.batch(postPublishStmts);
    } else {
      for (const s of postPublishStmts) {
        await s.run();
      }
    }

    const finalRow = await db.prepare('SELECT * FROM template_import_sessions WHERE id = ?').bind(sessionId).first();
    return await formatImportSessionResponse(db, finalRow, {
      published: true,
      ingestResult: ingestRes,
      previousVersionId: previousCurrentVersion?.id || null,
      rollbackAvailable: Boolean(previousCurrentVersion?.id),
      changeSummary
    });
  } catch (pubErr) {
    // Ensure old published version remains active if publication failed!
    if (mode === IMPORT_DECISION_MODE.UPDATE_EXISTING && targetTpl && previousCurrentVersion) {
      try {
        await db.prepare('UPDATE templates SET current_version_id = ? WHERE id = ?')
          .bind(previousCurrentVersion.id, targetTpl.id).run();
        await db.prepare('UPDATE template_versions SET is_current = 1, status = "published" WHERE id = ?')
          .bind(previousCurrentVersion.id).run();
      } catch (_) {}
    }

    await db.prepare(`
      UPDATE template_import_sessions
      SET state = ?,
          error_code = ?,
          error_message = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(
      IMPORT_SESSION_STATE.FAILED,
      pubErr.code || 'PUBLISH_FAILED',
      pubErr.message,
      new Date().toISOString(),
      sessionId
    ).run();

    throw pubErr;
  }
}

/**
 * Cancels an active Import Session (`-> CANCELLED`), cleans up staged files, and leaves existing templates untouched.
 */
export async function cancelImportSession({
  db,
  sessionId
}) {
  await ensureTemplateIngestionSchema(db);
  const row = await db.prepare('SELECT * FROM template_import_sessions WHERE id = ? LIMIT 1').bind(sessionId).first();
  if (!row) {
    const err = new Error(`Import session "${sessionId}" not found.`);
    err.code = 'SESSION_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  if (row.state === IMPORT_SESSION_STATE.PUBLISHED) {
    const err = new Error('Cannot cancel an import session that has already been published. Use Version Rollback instead.');
    err.code = 'CANNOT_CANCEL_PUBLISHED_SESSION';
    err.status = 400;
    throw err;
  }

  const nowIso = new Date().toISOString();
  await db.prepare(`
    UPDATE template_import_sessions
    SET state = ?,
        decision_mode = ?,
        staged_files_bundle_json = '{}',
        cancelled_at = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(
    IMPORT_SESSION_STATE.CANCELLED,
    IMPORT_DECISION_MODE.CANCELLED,
    nowIso,
    nowIso,
    sessionId
  ).run();

  const cancelledRow = await db.prepare('SELECT * FROM template_import_sessions WHERE id = ?').bind(sessionId).first();
  return await formatImportSessionResponse(db, cancelledRow, { cancelled: true });
}
