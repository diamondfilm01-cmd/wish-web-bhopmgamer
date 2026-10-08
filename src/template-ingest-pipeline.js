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

// Security & Resource Constraints
export const ZIP_LIMITS = {
  MAX_ZIP_BYTES: 50 * 1024 * 1024,          // 50 MB max zip size
  MAX_UNCOMPRESSED_BYTES: 150 * 1024 * 1024, // 150 MB max total uncompressed
  MAX_FILE_COUNT: 1000,                      // 1000 files max
  MAX_ENTRY_BYTES: 25 * 1024 * 1024,        // 25 MB max per file
  MAX_COMPRESSION_RATIO: 100                 // 100:1 ratio limit
};

export const DANGEROUS_EXTENSIONS = /\.(exe|sh|bat|cmd|com|vbs|php|py|pl|cgi|jar|war|scr|msi|dll|so)$/i;

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
    authorId = 'admin_system'
  } = params;

  // 1. Verify B2 Configuration
  let b2Provider = storageProvider;
  if (!b2Provider) {
    const config = getB2Config(env);
    if (!config.isConfigured) {
      return {
        success: false,
        error: 'B2_NOT_CONFIGURED',
        code: 'B2_NOT_CONFIGURED',
        message: `Backblaze B2 storage credentials are not configured in environment secrets. Missing: ${config.missingKeys.join(', ')}`,
        requiredEnv: config.missingKeys
      };
    }
    b2Provider = B2StorageProvider.fromEnv(env);
  }

  // 2. Extract and sanitize ZIP
  const extracted = await extractAndVerifyZip(zipBuffer);

  // 3. Analyze template & compute hashes
  const analyzed = await analyzeTemplateAndBuildIntegrity(extracted, zipBuffer);

  // 4. Generate deterministic identifiers
  const familySlug = templateMetadata.slug || (analyzed.title ? analyzed.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : 'custom-template');
  const templateFamilyId = templateMetadata.familyId || `fam_${familySlug}`;
  const templateId = templateMetadata.templateId || `tpl_${familySlug}`;
  
  const now = new Date();
  const versionNumber = Number(templateMetadata.versionNumber || 1);
  const versionId = `ver_${templateId}_v${versionNumber}_${now.getTime().toString(36)}`;
  const versionLabel = templateMetadata.versionLabel || `v${versionNumber}.0.0`;

  // Deterministic storage keys
  const keys = buildTemplateStorageKeys(templateFamilyId, versionId);

  // Build manifest payloads
  const manifestPayload = {
    templateFamilyId,
    templateId,
    versionId,
    versionNumber,
    versionLabel,
    name: templateMetadata.name || analyzed.title,
    category: templateMetadata.category || 'celebration',
    tier: templateMetadata.tier || 'free',
    price: Number(templateMetadata.price || 0),
    entryFile: extracted.entryFile,
    fileCount: analyzed.fileRecords.length,
    totalBytes: extracted.totalUncompressedBytes,
    sourceZipBytes: extracted.zipSizeBytes,
    sourceZipSha256: analyzed.sourceZipSha256,
    runtimeHash: analyzed.runtimeHash,
    schemaHash: analyzed.schemaHash,
    fields: analyzed.detectedFields,
    storageKeys: keys,
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

    // 8. Commit Records into D1 Database (if DB binding provided)
    if (db && typeof db.prepare === 'function') {
      const nowIso = now.toISOString();

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

      // Insert template_versions record
      await db.prepare(`
        INSERT INTO template_versions (
          id, template_id, template_family_id, version_number, version_label,
          name, description, category, tier, price, thumbnail,
          source_zip_storage_key, runtime_root_storage_key, manifest_storage_key,
          schema_hash, runtime_hash, source_zip_hash,
          storage_provider, storage_bucket, storage_metadata_json,
          status, created_at, created_by
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
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
      for (const field of analyzed.detectedFields) {
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

    return {
      success: true,
      message: `Template "${templateMetadata.name || analyzed.title}" successfully ingested into Backblaze B2 storage.`,
      templateFamilyId,
      templateId,
      versionId,
      versionNumber,
      versionLabel,
      status: 'ready',
      isPublished: false,
      entryFile: extracted.entryFile,
      previewUrl: `/api/templates/${templateId}/versions/${versionId}/preview/${extracted.entryFile}`,
      storageKeys: keys,
      hashes: {
        sourceZip: analyzed.sourceZipSha256,
        runtimeHash: analyzed.runtimeHash,
        schemaHash: analyzed.schemaHash
      },
      fileCount: analyzed.fileRecords.length,
      fieldsCount: analyzed.detectedFields.length,
      detectedFields: analyzed.detectedFields,
      storageProvider: 'b2'
    };

  } catch (error) {
    // Failure Recovery: mark version as failed in DB if created, return structured error
    if (db && typeof db.prepare === 'function') {
      try {
        await db.prepare(`
          UPDATE template_versions 
          SET status = 'failed', error_message = ?
          WHERE id = ?
        `).bind(error.message, versionId).run();
      } catch (_) {}
    }

    const errRes = {
      success: false,
      error: 'B2_INGEST_FAILED',
      code: error.code || 'B2_INGEST_FAILED',
      message: `Template ingestion failed: ${error.message}`,
      versionId,
      uploadedCount: uploadedB2Objects.length
    };
    return errRes;
  }
}
