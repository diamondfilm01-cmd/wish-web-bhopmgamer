/**
 * WishMagic Template ZIP Ingestion & Security Pipeline (Part 20)
 * =============================================================
 * Real administrator template ingestion engine:
 * 1. ZIP magic bytes validation (PK\x03\x04)
 * 2. ZIP bomb protection & resource limits (file count, uncompressed bytes, ratio)
 * 3. Anti-path traversal & dangerous executable suppression
 * 4. Required entry point enforcement (index.html)
 * 5. Template analyzer execution & slot discovery
 * 6. Integrity hashing (SHA-256 per file, source ZIP, composite runtime hash)
 * 7. B2 immutable storage key mapping
 * 8. Real B2 uploads & D1 version/file/field persistence
 * 9. Structured failure recovery
 */

import JSZip from 'jszip';
import {
  computeSha256Hex,
  getB2Config,
  getMimeType,
  buildTemplateStorageKeys,
  B2StorageProvider
} from './storage-provider.js';
import {
  UTP_PROTOCOL_NAME,
  UTP_SCHEMA_VERSION,
  UTP_RUNTIME_API_VERSION
} from './template-protocol-schema.js';
import {
  validateUtpManifest,
  normalizeManifestToUtp
} from './template-protocol-validator.js';

// Security & Resource Constraints
export const ZIP_LIMITS = {
  MAX_ZIP_BYTES: 50 * 1024 * 1024,          // 50 MB max zip size
  MAX_UNCOMPRESSED_BYTES: 150 * 1024 * 1024, // 150 MB max total uncompressed
  MAX_FILE_COUNT: 1000,                      // 1000 files max
  MAX_ENTRY_BYTES: 25 * 1024 * 1024,        // 25 MB max per file
  MAX_COMPRESSION_RATIO: 100,                // 100:1 ratio limit
  MAX_MANIFEST_BYTES: 5 * 1024 * 1024,       // 5 MB max manifest json size
  MAX_DIRECTORY_DEPTH: 8                     // 8 max folder nesting depth
};

export const UPLOAD_OPERATION_STATE = {
  RECEIVED: 'received',
  VALIDATING: 'validating',
  VALIDATION_FAILED: 'validation_failed',
  STAGING: 'staging',
  STAGED: 'staged',
  REGISTERING: 'registering',
  PREVIEW_READY: 'preview_ready',
  FAILED: 'failed',
  CLEANUP_PENDING: 'cleanup_pending'
};

/**
 * Computes deterministic package fingerprint across normalized file paths and contents
 */
export async function computePackageFingerprint(filesMap) {
  const sortedPaths = Array.from(filesMap.keys()).sort();
  const chunks = [];
  for (const p of sortedPaths) {
    const f = filesMap.get(p);
    const hash = await computeSha256Hex(f.content);
    chunks.push(`${p}:${hash}`);
  }
  return await computeSha256Hex(chunks.join('||'));
}

export const DANGEROUS_EXTENSIONS = /\.(exe|sh|bat|cmd|com|vbs|php|py|pl|cgi|jar|war|scr|msi|dll|so)$/i;

/**
 * Creates a valid ZIP Uint8Array archive from an array of files ({ path/name, content })
 */
export async function createZipFromFiles(files = []) {
  const zip = new JSZip();
  for (const f of files) {
    const filePath = f.path || f.name || f.filename;
    if (!filePath) continue;
    const cleanPath = filePath.replace(/^[/\\]+/, '');
    const content = f.content || f.data || '';
    zip.file(cleanPath, content);
  }
  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/**
 * Validates ZIP Magic Bytes (PK signature)
 */
export function validateZipMagicBytes(buffer) {
  if (!buffer || buffer.byteLength < 4) {
    const err = new Error('Invalid file: buffer is empty or smaller than 4 bytes');
    err.code = 'ZIP_INVALID_FORMAT';
    throw err;
  }

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  
  // PK\x03\x04 (standard), PK\x05\x06 (empty), PK\x07\x08 (spanned)
  const isZip = (
    bytes[0] === 0x50 && bytes[1] === 0x4B && (
      (bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08)
    )
  );

  if (!isZip) {
    const err = new Error('Uploaded file is not a valid ZIP archive (magic bytes mismatch)');
    err.code = 'ZIP_INVALID_FORMAT';
    throw err;
  }

  return true;
}

/**
 * Safely extracts and sanitizes a ZIP archive into a memory bundle of relative files
 */
export async function extractAndVerifyZip(zipBuffer) {
  const bytes = zipBuffer instanceof Uint8Array ? zipBuffer : new Uint8Array(zipBuffer);
  
  // 1. Verify buffer size
  if (bytes.byteLength > ZIP_LIMITS.MAX_ZIP_BYTES) {
    const err = new Error(`ZIP archive size (${Math.round(bytes.byteLength / 1024 / 1024)}MB) exceeds limit of ${ZIP_LIMITS.MAX_ZIP_BYTES / 1024 / 1024}MB`);
    err.code = 'ZIP_FILE_TOO_LARGE';
    throw err;
  }

  // 2. Magic bytes check
  validateZipMagicBytes(bytes);

  // 3. Load with JSZip
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (loadErr) {
    const err = new Error(`Corrupted or unreadable ZIP archive: ${loadErr.message}`);
    err.code = 'ZIP_CORRUPTED';
    throw err;
  }

  const entries = Object.keys(zip.files);
  if (entries.length === 0) {
    const err = new Error('ZIP archive is empty');
    err.code = 'ZIP_EMPTY';
    throw err;
  }

  if (entries.length > ZIP_LIMITS.MAX_FILE_COUNT) {
    const err = new Error(`ZIP archive exceeds maximum file count limit of ${ZIP_LIMITS.MAX_FILE_COUNT} entries (found ${entries.length})`);
    err.code = 'ZIP_FILE_COUNT_EXCEEDED';
    throw err;
  }

  // 4. Calculate common root folder if present
  // If all files start with "folder_name/", we can strip the top-level container
  const fileEntriesOnly = entries.filter(p => !zip.files[p].dir);
  let commonPrefix = '';
  if (fileEntriesOnly.length > 0 && !fileEntriesOnly.some(p => p.toLowerCase() === 'index.html')) {
    const firstParts = fileEntriesOnly[0].split('/');
    if (firstParts.length > 1) {
      const candidate = firstParts[0] + '/';
      const allShare = fileEntriesOnly.every(p => p.startsWith(candidate));
      if (allShare) {
        commonPrefix = candidate;
      }
    }
  }

  let totalUncompressedBytes = 0;
  const extractedFiles = new Map(); // normalizedRelPath -> { content: Uint8Array, text: string|null, size: number }
  const warnings = [];

  for (const rawPath of entries) {
    const entry = zip.files[rawPath];
    if (entry.dir) continue;

    // Normalize path separators to forward slashes
    let normalized = String(rawPath).replace(/\\/g, '/');

    // Anti-path traversal verification
    if (
      normalized.startsWith('/') ||
      normalized.includes('../') ||
      normalized.includes('/..') ||
      normalized === '..' ||
      /^[a-zA-Z]:/.test(normalized) ||
      normalized.includes('\0')
    ) {
      warnings.push(`[Security] Skipped path traversal attempt: ${rawPath}`);
      continue;
    }

    // Dangerous extension check
    if (DANGEROUS_EXTENSIONS.test(normalized)) {
      warnings.push(`[Security] Skipped dangerous executable file: ${rawPath}`);
      continue;
    }

    // Strip common prefix if applicable
    if (commonPrefix && normalized.startsWith(commonPrefix)) {
      normalized = normalized.slice(commonPrefix.length);
    }
    normalized = normalized.replace(/^\/+/, '');
    if (!normalized) continue;

    // Directory depth limit check
    const pathParts = normalized.split('/').filter(Boolean);
    if (pathParts.length > ZIP_LIMITS.MAX_DIRECTORY_DEPTH) {
      warnings.push(`[Security] Skipped file exceeding maximum directory depth (${pathParts.length} > ${ZIP_LIMITS.MAX_DIRECTORY_DEPTH}): ${rawPath}`);
      continue;
    }

    // Extract entry as binary buffer
    const entryBuffer = await entry.async('uint8array');
    const entrySize = entryBuffer.byteLength;

    if (entrySize > ZIP_LIMITS.MAX_ENTRY_BYTES) {
      const err = new Error(`File ${normalized} exceeds single entry size limit of ${ZIP_LIMITS.MAX_ENTRY_BYTES / 1024 / 1024}MB`);
      err.code = 'ZIP_ENTRY_TOO_LARGE';
      throw err;
    }

    totalUncompressedBytes += entrySize;
    if (totalUncompressedBytes > ZIP_LIMITS.MAX_UNCOMPRESSED_BYTES) {
      const err = new Error(`ZIP total uncompressed size exceeds limit of ${ZIP_LIMITS.MAX_UNCOMPRESSED_BYTES / 1024 / 1024}MB (ZIP bomb detected)`);
      err.code = 'ZIP_BOMB_DETECTED';
      throw err;
    }

    // Check compression ratio
    if (bytes.byteLength > 0 && (totalUncompressedBytes / bytes.byteLength) > ZIP_LIMITS.MAX_COMPRESSION_RATIO && totalUncompressedBytes > 10 * 1024 * 1024) {
      const err = new Error('Suspicious compression ratio detected in ZIP archive (potential ZIP bomb)');
      err.code = 'ZIP_BOMB_DETECTED';
      throw err;
    }

    extractedFiles.set(normalized, {
      relativePath: normalized,
      content: entryBuffer,
      sizeBytes: entrySize,
      mimeType: getMimeType(normalized)
    });
  }

  // 5. Enforce required entry point index.html
  let indexFileKey = null;
  for (const pathKey of extractedFiles.keys()) {
    if (pathKey.toLowerCase() === 'index.html') {
      indexFileKey = pathKey;
      break;
    }
  }

  if (!indexFileKey) {
    const err = new Error('ZIP archive must contain an index.html entry file at the root or within template directory');
    err.code = 'ENTRY_POINT_MISSING';
    throw err;
  }

  return {
    files: extractedFiles,
    entryFile: indexFileKey,
    fileCount: extractedFiles.size,
    totalUncompressedBytes,
    zipSizeBytes: bytes.byteLength,
    warnings
  };
}

/**
 * Assigns a role to each template file
 */
export function classifyFileRole(relPath, isEntry) {
  if (isEntry) return 'entry_html';
  const ext = relPath.split('.').pop().toLowerCase();
  if (ext === 'css') return 'stylesheet';
  if (ext === 'js' || ext === 'mjs') return 'script';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico'].includes(ext)) return 'asset';
  if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) return 'font';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (ext === 'json') return 'manifest';
  return 'asset';
}

/**
 * Fallback regex-based dynamic field analyzer when full DOM is not available
 */
export function analyzeHtmlString(htmlString) {
  const fields = [];
  const fieldKeysSeen = new Set();

  function addField(f) {
    if (!f.key || fieldKeysSeen.has(f.key)) return;
    fieldKeysSeen.add(f.key);
    fields.push({
      key: f.key,
      label: f.label || f.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      type: f.type || 'text',
      placeholder: f.placeholder || '',
      defaultValue: f.defaultValue || '',
      isRequired: Boolean(f.isRequired),
      category: f.category || 'personal',
      validation: f.validation || {}
    });
  }

  // 1. data-wm-* attribute extraction
  // Matches: data-wm-field="rec_name" data-wm-type="text" data-wm-label="..." data-wm-required="true"
  const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
  let match;
  while ((match = tagRegex.exec(htmlString)) !== null) {
    const attrs = match[2];
    const fieldMatch = attrs.match(/data-wm-field=["']([^"']+)["']/i);
    if (fieldMatch) {
      const key = fieldMatch[1].trim();
      const typeMatch = attrs.match(/data-wm-type=["']([^"']+)["']/i);
      const labelMatch = attrs.match(/data-wm-label=["']([^"']+)["']/i);
      const reqMatch = attrs.match(/data-wm-required=["']([^"']+)["']/i);
      const defaultMatch = attrs.match(/data-wm-default=["']([^"']+)["']/i);
      
      addField({
        key,
        type: typeMatch ? typeMatch[1].toLowerCase() : (match[1].toLowerCase() === 'img' ? 'image' : 'text'),
        label: labelMatch ? labelMatch[1] : undefined,
        isRequired: reqMatch ? reqMatch[1] === 'true' : false,
        defaultValue: defaultMatch ? defaultMatch[1] : ''
      });
    }
  }

  // 2. Mustache variable extraction: {{recipient_name}}, {{wish_message}}
  const mustacheRegex = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;
  while ((match = mustacheRegex.exec(htmlString)) !== null) {
    const key = match[1].trim();
    if (!key.startsWith('#') && !key.startsWith('/') && !key.startsWith('^')) {
      const type = key.includes('photo') || key.includes('image')
        ? 'image'
        : (key.includes('message') || key.includes('letter') ? 'textarea' : 'text');
      addField({ key, type });
    }
  }

  // 3. Extract title if present
  const titleMatch = htmlString.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Magical Wish Template';

  return {
    title,
    fields,
    fieldsCount: fields.length
  };
}

/**
 * Analyzes extracted template files and builds normalized integrity hashes
 */
export async function analyzeTemplateAndBuildIntegrity(extractedData, originalZipBytes) {
  const { files, entryFile } = extractedData;

  // 1. Read index.html as UTF-8 string
  const indexEntry = files.get(entryFile);
  const indexHtml = new TextDecoder('utf-8').decode(indexEntry.content);

  // 2. Analyze HTML
  const analysis = analyzeHtmlString(indexHtml);

  // 3. Compute SHA-256 for original zip
  const sourceZipSha256 = await computeSha256Hex(originalZipBytes);

  // 4. Compute SHA-256 for each extracted file
  const fileRecords = [];
  const hashesMap = {};

  for (const [relPath, fileObj] of files.entries()) {
    const sha256 = await computeSha256Hex(fileObj.content);
    const isEntry = relPath === entryFile;
    const role = classifyFileRole(relPath, isEntry);

    hashesMap[relPath] = {
      sha256,
      sizeBytes: fileObj.sizeBytes,
      mimeType: fileObj.mimeType,
      role
    };

    fileRecords.push({
      relativePath: relPath,
      content: fileObj.content,
      sizeBytes: fileObj.sizeBytes,
      mimeType: fileObj.mimeType,
      sha256,
      fileRole: role,
      isEntryFile: isEntry ? 1 : 0
    });
  }

  // 5. Compute composite runtime hash
  // Sort relative paths deterministically and hash their combined hashes
  const sortedPaths = Object.keys(hashesMap).sort();
  const compositeString = sortedPaths.map(p => `${p}:${hashesMap[p].sha256}`).join('|');
  const runtimeHash = await computeSha256Hex(compositeString);

  // 6. Schema hash
  const schemaJson = JSON.stringify(analysis.fields);
  const schemaHash = await computeSha256Hex(schemaJson);

  const hashesPayload = {
    sourceZipSha256,
    runtimeHash,
    schemaHash,
    filesCount: fileRecords.length,
    files: hashesMap
  };

  return {
    title: analysis.title,
    detectedFields: analysis.fields,
    sourceZipSha256,
    runtimeHash,
    schemaHash,
    fileRecords,
    hashesPayload
  };
}

/**
 * Full End-to-End Real B2 Ingest Pipeline
 * 
 * Flow:
 * 1. Validate environment & B2 config
 * 2. Unzip & security sanitization
 * 3. Analyze template & build manifests
 * 4. Create immutable storage keys
 * 5. Real upload of original ZIP to B2
 * 6. Real upload of runtime files to B2
 * 7. Real upload of manifests & hashes to B2
 * 8. Commit immutable version records into D1
 * 9. Provide preview-ready metadata
 */
export async function executeB2TemplateIngestPipeline(params) {
  const {
    zipBuffer,
    templateMetadata = {},
    env = {},
    db = null,
    storageProvider = null, // Can inject for custom/testing
    authorId = 'admin_system',
    idempotencyKey = null
  } = params;

  const now = new Date();
  const nowIso = now.toISOString();
  const operationId = `top_${now.getTime().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

  // Helper to persist operation state if D1 available
  const updateOperation = async (state, progressStage, progressPercent, extra = {}) => {
    if (db && typeof db.prepare === 'function') {
      try {
        await db.prepare(`
          INSERT INTO template_upload_operations (
            id, idempotency_key, author_id, template_family_id, template_id, version_id,
            version_number, version_label, package_fingerprint, state, progress_stage,
            progress_percent, is_retryable, error_code, error_message, validation_report_json,
            inventory_json, b2_objects_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            state = excluded.state,
            progress_stage = excluded.progress_stage,
            progress_percent = excluded.progress_percent,
            template_family_id = COALESCE(excluded.template_family_id, template_upload_operations.template_family_id),
            template_id = COALESCE(excluded.template_id, template_upload_operations.template_id),
            version_id = COALESCE(excluded.version_id, template_upload_operations.version_id),
            version_number = COALESCE(excluded.version_number, template_upload_operations.version_number),
            version_label = COALESCE(excluded.version_label, template_upload_operations.version_label),
            package_fingerprint = COALESCE(excluded.package_fingerprint, template_upload_operations.package_fingerprint),
            is_retryable = excluded.is_retryable,
            error_code = excluded.error_code,
            error_message = excluded.error_message,
            validation_report_json = COALESCE(excluded.validation_report_json, template_upload_operations.validation_report_json),
            inventory_json = COALESCE(excluded.inventory_json, template_upload_operations.inventory_json),
            b2_objects_json = COALESCE(excluded.b2_objects_json, template_upload_operations.b2_objects_json),
            updated_at = excluded.updated_at
        `).bind(
          operationId,
          idempotencyKey || null,
          authorId,
          extra.templateFamilyId || null,
          extra.templateId || null,
          extra.versionId || null,
          extra.versionNumber || null,
          extra.versionLabel || null,
          extra.packageFingerprint || null,
          state,
          progressStage,
          progressPercent,
          extra.isRetryable !== undefined ? (extra.isRetryable ? 1 : 0) : 1,
          extra.errorCode || null,
          extra.errorMessage || null,
          typeof extra.validationReport === 'object' ? JSON.stringify(extra.validationReport) : (extra.validationReportJson || '{}'),
          Array.isArray(extra.inventory) ? JSON.stringify(extra.inventory) : (extra.inventoryJson || '[]'),
          Array.isArray(extra.b2Objects) ? JSON.stringify(extra.b2Objects) : (extra.b2ObjectsJson || '[]'),
          nowIso,
          new Date().toISOString()
        ).run().catch(e => console.warn('[Upload Operation DB Warning]:', e.message));
      } catch (opErr) {
        console.warn('[Upload Operation DB Err]:', opErr.message);
      }
    }
  };

  // Check idempotency if key provided
  if (idempotencyKey && db && typeof db.prepare === 'function') {
    try {
      const existingOp = await db.prepare(`
        SELECT * FROM template_upload_operations WHERE idempotency_key = ? LIMIT 1
      `).bind(idempotencyKey).first();
      if (existingOp && existingOp.state === UPLOAD_OPERATION_STATE.PREVIEW_READY) {
        return {
          success: true,
          idempotent: true,
          operationId: existingOp.id,
          templateFamilyId: existingOp.template_family_id,
          templateId: existingOp.template_id,
          versionId: existingOp.version_id,
          versionNumber: existingOp.version_number,
          versionLabel: existingOp.version_label,
          status: 'ready',
          isPublished: false,
          message: 'Idempotent request: template version already successfully staged.'
        };
      }
    } catch (_) {}
  }

  await updateOperation(UPLOAD_OPERATION_STATE.RECEIVED, 'archive_received', 10);

  // 1. Verify B2 Configuration
  let b2Provider = storageProvider;
  if (!b2Provider) {
    const config = getB2Config(env);
    if (!config.isConfigured) {
      await updateOperation(UPLOAD_OPERATION_STATE.FAILED, 'b2_check_failed', 10, {
        errorCode: 'B2_NOT_CONFIGURED',
        errorMessage: `Backblaze B2 storage credentials are not configured: ${config.missingKeys.join(', ')}`,
        isRetryable: true
      });
      return {
        success: false,
        operationId,
        error: 'B2_NOT_CONFIGURED',
        code: 'B2_NOT_CONFIGURED',
        message: `Backblaze B2 storage credentials are not configured in environment secrets. Missing: ${config.missingKeys.join(', ')}`,
        requiredEnv: config.missingKeys
      };
    }
    b2Provider = B2StorageProvider.fromEnv(env);
  }

  await updateOperation(UPLOAD_OPERATION_STATE.VALIDATING, 'validating_archive', 20);

  // 2. Extract and sanitize ZIP
  const extracted = await extractAndVerifyZip(zipBuffer);
  const packageFingerprint = await computePackageFingerprint(extracted.files);

  // 2b. Parse & Validate Universal Template Protocol (UTP) Manifest
  let rawManifest = null;
  let manifestPath = null;
  let manifestCount = 0;
  for (const [p, f] of extracted.files.entries()) {
    const lower = p.toLowerCase();
    if (lower === 'wishmagic.json' || lower === 'manifest.json' || lower.endsWith('/wishmagic.json') || lower.endsWith('/manifest.json')) {
      manifestCount++;
      if (!rawManifest) {
        manifestPath = p;
        try {
          const text = new TextDecoder('utf-8').decode(f.content);
          rawManifest = JSON.parse(text);
        } catch (jsonErr) {
          await updateOperation(UPLOAD_OPERATION_STATE.VALIDATION_FAILED, 'manifest_syntax_error', 25, {
            errorCode: 'INVALID_MANIFEST_JSON',
            errorMessage: `Malformed JSON in ${p}: ${jsonErr.message}`,
            isRetryable: false
          });
          return {
            success: false,
            operationId,
            error: 'INVALID_MANIFEST_JSON',
            code: 'INVALID_MANIFEST_JSON',
            message: `Malformed JSON in ${p}: ${jsonErr.message}`,
            issues: [{
              code: 'INVALID_MANIFEST_JSON',
              severity: 'error',
              message: `Malformed JSON in ${p}: ${jsonErr.message}`,
              blocking: true
            }]
          };
        }
      }
    }
  }

  // Reject ambiguous multiple conflicting manifests
  if (manifestCount > 1) {
    await updateOperation(UPLOAD_OPERATION_STATE.VALIDATION_FAILED, 'ambiguous_manifests', 25, {
      errorCode: 'MULTIPLE_MANIFESTS_CONFLICT',
      errorMessage: `Multiple conflicting manifest files detected in ZIP archive (${manifestCount} manifests found).`,
      isRetryable: false
    });
    return {
      success: false,
      operationId,
      error: 'MULTIPLE_MANIFESTS_CONFLICT',
      code: 'MULTIPLE_MANIFESTS_CONFLICT',
      message: `Multiple conflicting manifest files detected in ZIP archive (${manifestCount} manifests found). Provide exactly one wishmagic.json manifest.`
    };
  }

  // Authoritative server-side UTP validation
  const utpReport = validateUtpManifest(rawManifest || {
    template: {
      id: templateMetadata.slug || templateMetadata.templateId || 'custom-template',
      name: templateMetadata.name || 'Custom Template',
      category: templateMetadata.category || 'celebration'
    }
  }, {
    filesMap: extracted.files,
    entryFile: extracted.entryFile
  });

  if (!utpReport.valid && utpReport.issues.some(i => i.severity === 'error' && i.blocking !== false)) {
    await updateOperation(UPLOAD_OPERATION_STATE.VALIDATION_FAILED, 'utp_validation_failed', 30, {
      errorCode: 'UTP_VALIDATION_FAILED',
      errorMessage: `Template package failed Universal Template Protocol validation with ${utpReport.summary.errors} error(s).`,
      validationReport: utpReport,
      isRetryable: false
    });
    return {
      success: false,
      operationId,
      error: 'UTP_VALIDATION_FAILED',
      code: 'UTP_VALIDATION_FAILED',
      message: `Template package failed Universal Template Protocol validation with ${utpReport.summary.errors} error(s).`,
      validationReport: utpReport,
      issues: utpReport.issues
    };
  }

  // 3. Analyze template & compute hashes
  const analyzed = await analyzeTemplateAndBuildIntegrity(extracted, zipBuffer);

  // Merge manifest-declared fields with DOM-detected fields without duplicates
  const finalFieldsMap = new Map();
  for (const f of analyzed.detectedFields) {
    finalFieldsMap.set(f.key, f);
  }
  if (utpReport.normalized && Array.isArray(utpReport.normalized.fields)) {
    for (const mf of utpReport.normalized.fields) {
      const fKey = mf.id || mf.key;
      if (!fKey) continue;
      if (!finalFieldsMap.has(fKey)) {
        finalFieldsMap.set(fKey, {
          key: fKey,
          label: mf.label || fKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          type: mf.type || 'text',
          placeholder: mf.placeholder || '',
          defaultValue: mf.defaultValue || '',
          isRequired: Boolean(mf.required),
          category: mf.group || mf.category || 'personal',
          validation: mf.constraints || mf.validation || {}
        });
      }
    }
  }
  const mergedFields = Array.from(finalFieldsMap.values());

  // 4. Generate deterministic identifiers and family/version reservation
  const familySlug = templateMetadata.slug || (utpReport.normalized?.template?.id) || (analyzed.title ? analyzed.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : 'custom-template');
  const templateFamilyId = templateMetadata.familyId || `fam_${familySlug}`;
  const templateId = templateMetadata.templateId || `tpl_${familySlug}`;
  
  // Concurrency-safe version number calculation from DB
  let versionNumber = Number(templateMetadata.versionNumber || 0);
  if (!versionNumber && db && typeof db.prepare === 'function') {
    try {
      const maxVerRow = await db.prepare(`
        SELECT MAX(version_number) as maxVer FROM template_versions
        WHERE template_id = ? OR template_family_id = ?
      `).bind(templateId, templateFamilyId).first();
      versionNumber = (Number(maxVerRow?.maxVer) || 0) + 1;
    } catch (_) {
      versionNumber = 1;
    }
  }
  if (!versionNumber || versionNumber < 1) versionNumber = 1;

  // Duplicate Package Detection via package_fingerprint
  if (db && typeof db.prepare === 'function') {
    try {
      const duplicateVer = await db.prepare(`
        SELECT id, version_number, version_label, status FROM template_versions
        WHERE (template_id = ? OR template_family_id = ?) AND package_fingerprint = ? AND status != 'failed'
        LIMIT 1
      `).bind(templateId, templateFamilyId, packageFingerprint).first();
      if (duplicateVer) {
        await updateOperation(UPLOAD_OPERATION_STATE.PREVIEW_READY, 'duplicate_detected', 100, {
          templateFamilyId,
          templateId,
          versionId: duplicateVer.id,
          versionNumber: duplicateVer.version_number,
          versionLabel: duplicateVer.version_label,
          packageFingerprint
        });
        return {
          success: true,
          duplicateDetected: true,
          operationId,
          templateFamilyId,
          templateId,
          versionId: duplicateVer.id,
          versionNumber: duplicateVer.version_number,
          versionLabel: duplicateVer.version_label,
          status: duplicateVer.status || 'ready',
          isPublished: duplicateVer.status === 'published',
          message: `Identical package fingerprint already exists for this template family as ${duplicateVer.version_label}.`,
          previewUrl: `/api/templates/${templateId}/versions/${duplicateVer.id}/preview/${extracted.entryFile}`
        };
      }
    } catch (_) {}
  }

  const versionId = `ver_${templateId}_v${versionNumber}_${now.getTime().toString(36)}`;
  const versionLabel = templateMetadata.versionLabel || `v${versionNumber}.0.0`;

  // Deterministic storage keys
  const keys = buildTemplateStorageKeys(templateFamilyId, versionId);

  await updateOperation(UPLOAD_OPERATION_STATE.STAGING, 'staging_to_b2', 40, {
    templateFamilyId,
    templateId,
    versionId,
    versionNumber,
    versionLabel,
    packageFingerprint
  });

  // Build manifest payloads
  const manifestPayload = {
    protocol: UTP_PROTOCOL_NAME,
    schemaVersion: UTP_SCHEMA_VERSION,
    templateFamilyId,
    templateId,
    versionId,
    versionNumber,
    versionLabel,
    name: templateMetadata.name || utpReport.normalized?.template?.name || analyzed.title,
    category: templateMetadata.category || utpReport.normalized?.template?.category || 'celebration',
    tier: templateMetadata.tier || utpReport.normalized?.template?.tier || 'free',
    price: Number(templateMetadata.price ?? utpReport.normalized?.template?.price ?? 0),
    entryFile: extracted.entryFile,
    fileCount: analyzed.fileRecords.length,
    totalBytes: extracted.totalUncompressedBytes,
    sourceZipBytes: extracted.zipSizeBytes,
    sourceZipSha256: analyzed.sourceZipSha256,
    runtimeHash: analyzed.runtimeHash,
    schemaHash: analyzed.schemaHash,
    packageFingerprint,
    fields: mergedFields,
    capabilities: utpReport.normalized?.capabilities || templateMetadata.capabilities || {},
    sections: utpReport.normalized?.sections || templateMetadata.sections || [],
    relationships: utpReport.normalized?.relationships || [],
    storageKeys: keys,
    validationReport: utpReport,
    createdAt: now.toISOString()
  };

  const analyzerSchemaPayload = {
    versionId,
    fields: analyzed.detectedFields,
    capabilities: templateMetadata.capabilities || {},
    sections: templateMetadata.sections || [],
    defaultConfig: templateMetadata.defaultConfig || {}
  };

  const uploadedB2Objects = [];

  try {
    // 5. Upload Original ZIP to B2
    const zipUploadRes = await b2Provider.putObject({
      key: keys.sourceZip,
      body: zipBuffer,
      contentType: 'application/zip',
      contentLength: zipBuffer.byteLength,
      metadata: {
        familyId: templateFamilyId,
        versionId,
        sha256: analyzed.sourceZipSha256
      }
    });
    uploadedB2Objects.push({ key: keys.sourceZip, fileId: zipUploadRes.fileId });

    // 6. Upload Extracted Runtime Files to B2
    for (const fileRecord of analyzed.fileRecords) {
      const b2Key = keys.runtimeFile(fileRecord.relativePath);
      const fileUploadRes = await b2Provider.putObject({
        key: b2Key,
        body: fileRecord.content,
        contentType: fileRecord.mimeType,
        contentLength: fileRecord.sizeBytes,
        metadata: {
          familyId: templateFamilyId,
          versionId,
          sha256: fileRecord.sha256
        }
      });
      uploadedB2Objects.push({ key: b2Key, fileId: fileUploadRes.fileId });
      fileRecord.storageKey = b2Key;
      fileRecord.b2FileId = fileUploadRes.fileId;
    }

    // 7. Upload Manifest, Analyzer Schema, Hashes to B2
    const manifestJson = JSON.stringify(manifestPayload, null, 2);
    await b2Provider.putObject({
      key: keys.manifest,
      body: manifestJson,
      contentType: 'application/json; charset=utf-8',
      contentLength: new TextEncoder().encode(manifestJson).byteLength
    });
    uploadedB2Objects.push({ key: keys.manifest });

    const schemaJson = JSON.stringify(analyzerSchemaPayload, null, 2);
    await b2Provider.putObject({
      key: keys.analyzerSchema,
      body: schemaJson,
      contentType: 'application/json; charset=utf-8',
      contentLength: new TextEncoder().encode(schemaJson).byteLength
    });
    uploadedB2Objects.push({ key: keys.analyzerSchema });

    const hashesJson = JSON.stringify(analyzed.hashesPayload, null, 2);
    await b2Provider.putObject({
      key: keys.hashes,
      body: hashesJson,
      contentType: 'application/json; charset=utf-8',
      contentLength: new TextEncoder().encode(hashesJson).byteLength
    });
    uploadedB2Objects.push({ key: keys.hashes });

    await updateOperation(UPLOAD_OPERATION_STATE.STAGED, 'b2_upload_complete', 70, {
      b2Objects: uploadedB2Objects
    });

    // 8. Commit Records into D1 Database (if DB binding provided)
    if (db && typeof db.prepare === 'function') {
      await updateOperation(UPLOAD_OPERATION_STATE.REGISTERING, 'registering_d1', 80);

      // Ensure template_family exists
      await db.prepare(`
        INSERT OR IGNORE INTO template_families (
          id, slug, name, description, thumbnail, category, tier, price, is_featured, is_premium, status, visibility, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'public', ?, ?, ?)
      `).bind(
        templateFamilyId,
        familySlug,
        templateMetadata.name || analyzed.title,
        templateMetadata.description || 'Custom web celebration template',
        templateMetadata.thumbnail || '',
        templateMetadata.category || 'celebration',
        templateMetadata.tier || 'free',
        Number(templateMetadata.price || 0),
        templateMetadata.featured ? 1 : 0,
        templateMetadata.isPremium ? 1 : 0,
        authorId,
        nowIso,
        nowIso
      ).run().catch(e => console.warn('template_family insert warning:', e.message));

      // Ensure templates record exists / upserted for immediate store/admin visibility
      await db.prepare(`
        INSERT INTO templates (
          id, name, slug, description, category, relationships, tags,
          type, tier, price, is_premium, is_published, status, featured,
          placement, thumbnail, preview_images, capabilities, detected_fields,
          sections, features, theme, folder, entry_file, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, '[]', '[]',
          '3D Interactive', ?, ?, ?, 0, 'draft', ?,
          99, ?, '[]', ?, ?,
          '[]', '[]', '{}', ?, ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          slug = excluded.slug,
          description = excluded.description,
          category = excluded.category,
          tier = excluded.tier,
          price = excluded.price,
          is_premium = excluded.is_premium,
          thumbnail = excluded.thumbnail,
          capabilities = excluded.capabilities,
          detected_fields = excluded.detected_fields,
          entry_file = excluded.entry_file,
          updated_at = excluded.updated_at
      `).bind(
        templateId,
        templateMetadata.name || analyzed.title,
        familySlug,
        templateMetadata.description || 'Custom web celebration template',
        templateMetadata.category || 'celebration',
        templateMetadata.tier || 'free',
        Number(templateMetadata.price || 0),
        templateMetadata.tier === 'vip' || templateMetadata.isPremium ? 1 : 0,
        templateMetadata.featured ? 1 : 0,
        templateMetadata.thumbnail || '',
        JSON.stringify(templateMetadata.capabilities || {}),
        JSON.stringify(analyzed.detectedFields || []),
        familySlug,
        extracted.entryFile,
        nowIso,
        nowIso
      ).run().catch(e => console.warn('templates table upsert warning:', e.message));

      // Insert template_versions record
      await db.prepare(`
        INSERT INTO template_versions (
          id, template_id, template_family_id, version_number, version_label,
          name, description, category, tier, price, thumbnail,
          source_zip_storage_key, runtime_root_storage_key, manifest_storage_key,
          schema_hash, runtime_hash, source_zip_hash, package_fingerprint,
          storage_provider, storage_bucket, storage_metadata_json,
          status, created_at, created_by
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          'b2', ?, ?,
          'ready', ?, ?
        )
      `).bind(
        versionId,
        templateId,
        templateFamilyId,
        versionNumber,
        versionLabel,
        templateMetadata.name || analyzed.title,
        templateMetadata.description || '',
        templateMetadata.category || 'celebration',
        templateMetadata.tier || 'free',
        Number(templateMetadata.price || 0),
        templateMetadata.thumbnail || '',
        keys.sourceZip,
        keys.runtimeRoot,
        keys.manifest,
        analyzed.schemaHash,
        analyzed.runtimeHash,
        analyzed.sourceZipSha256,
        packageFingerprint,
        b2Provider.bucketName || 'wishmagic-templates',
        JSON.stringify({ filesCount: analyzed.fileRecords.length, totalBytes: extracted.totalUncompressedBytes }),
        nowIso,
        authorId
      ).run();

      // Insert template_files records
      for (const f of analyzed.fileRecords) {
        const fileRecordId = `tfile_${versionId}_${f.sha256.slice(0, 8)}_${Math.random().toString(36).slice(-4)}`;
        await db.prepare(`
          INSERT INTO template_files (
            id, template_version_id, relative_path, storage_provider, storage_key,
            mime_type, size_bytes, sha256, file_role, is_entry_file, status, created_at
          ) VALUES (?, ?, ?, 'b2', ?, ?, ?, ?, ?, ?, 'active', ?)
        `).bind(
          fileRecordId,
          versionId,
          f.relativePath,
          f.storageKey,
          f.mimeType,
          f.sizeBytes,
          f.sha256,
          f.fileRole,
          f.isEntryFile,
          nowIso
        ).run().catch(e => console.warn('template_file insert warning:', e.message));
      }

      // Insert template_fields records
      let fieldOrder = 0;
      for (const field of mergedFields) {
        fieldOrder++;
        const fieldId = `tfld_${versionId}_${field.key}`;
        await db.prepare(`
          INSERT OR REPLACE INTO template_fields (
            id, template_version_id, field_key, field_type, label, placeholder,
            help_text, is_required, default_value, validation_json, capabilities_json,
            sort_order, group_name, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, 'active', ?)
        `).bind(
          fieldId,
          versionId,
          field.key,
          field.type,
          field.label,
          field.placeholder || '',
          field.helpText || '',
          field.isRequired ? 1 : 0,
          field.defaultValue || '',
          JSON.stringify(field.validation || {}),
          fieldOrder,
          field.category || 'personal',
          nowIso
        ).run().catch(e => console.warn('template_field insert warning:', e.message));
      }
    }

    await updateOperation(UPLOAD_OPERATION_STATE.PREVIEW_READY, 'completed', 100, {
      templateFamilyId,
      templateId,
      versionId,
      versionNumber,
      versionLabel,
      packageFingerprint,
      validationReport: utpReport,
      inventory: analyzed.fileRecords.map(f => ({ path: f.relativePath, size: f.sizeBytes, hash: f.sha256 }))
    });

    return {
      success: true,
      operationId,
      message: `Template "${templateMetadata.name || analyzed.title}" successfully ingested into Backblaze B2 storage.`,
      templateFamilyId,
      templateId,
      versionId,
      versionNumber,
      versionLabel,
      status: 'ready',
      isPublished: false,
      protocol: {
        schemaVersion: UTP_SCHEMA_VERSION,
        runtimeApi: UTP_RUNTIME_API_VERSION
      },
      validationReport: utpReport,
      entryFile: extracted.entryFile,
      previewUrl: `/api/templates/${templateId}/versions/${versionId}/preview/${extracted.entryFile}`,
      storageKeys: keys,
      hashes: {
        sourceZip: analyzed.sourceZipSha256,
        runtimeHash: analyzed.runtimeHash,
        schemaHash: analyzed.schemaHash,
        packageFingerprint
      },
      fileCount: analyzed.fileRecords.length,
      fieldsCount: mergedFields.length,
      detectedFields: mergedFields,
      storageProvider: 'b2'
    };

  } catch (error) {
    console.error(`[Template Ingest Pipeline Error]: ${error.message}. Initiating rollback of ${uploadedB2Objects.length} B2 objects...`);

    // Clean up all B2 objects uploaded during this failed run to prevent untracked orphans
    const rollbackErrors = [];
    for (const obj of uploadedB2Objects) {
      try {
        if (b2Provider && typeof b2Provider.deleteObject === 'function') {
          await b2Provider.deleteObject({ key: obj.key, fileId: obj.fileId || null });
        }
      } catch (delErr) {
        rollbackErrors.push({ key: obj.key, error: delErr.message });
      }
    }

    // Failure Recovery: mark version as failed in DB if created, update operation status
    if (db && typeof db.prepare === 'function') {
      try {
        await db.prepare(`
          UPDATE template_versions 
          SET status = 'failed', error_message = ?
          WHERE id = ?
        `).bind(error.message, versionId).run();
      } catch (_) {}
    }

    const finalOpState = rollbackErrors.length > 0 ? UPLOAD_OPERATION_STATE.CLEANUP_PENDING : UPLOAD_OPERATION_STATE.FAILED;
    await updateOperation(finalOpState, 'failed', 100, {
      templateFamilyId,
      templateId,
      versionId,
      errorCode: error.code || 'B2_INGEST_FAILED',
      errorMessage: error.message,
      isRetryable: true,
      b2Objects: rollbackErrors
    });

    const errRes = {
      success: false,
      operationId,
      error: 'B2_INGEST_FAILED',
      code: error.code || 'B2_INGEST_FAILED',
      message: `Template ingestion failed: ${error.message}`,
      versionId,
      uploadedCount: uploadedB2Objects.length,
      rolledBackCount: uploadedB2Objects.length - rollbackErrors.length,
      rollbackErrors: rollbackErrors.length > 0 ? rollbackErrors : undefined
    };
    return errRes;
  }
}
