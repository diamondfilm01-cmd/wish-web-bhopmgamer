import { webcrypto as _nodeWebCrypto } from 'node:crypto';
if (!globalThis.crypto) { globalThis.crypto = _nodeWebCrypto; }
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

import JSZip from './vendor/jszip.js';
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
import {
  ImgBBProvider,
  getImgBBConfig
} from './imgbb-provider.js';
import {
  validateTemplateSecurityAndModeration
} from './content-moderation-engine.js';

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
 * Normalizes uploaded files from either an Array ([{ path, content, isBase64 }])
 * or an Object map ({ [relPath]: { content, isBase64 } | string | Uint8Array })
 * into a canonical array of file descriptors.
 */
export function normalizeUploadedFilesInput(filesInput) {
  if (!filesInput) return [];
  if (Array.isArray(filesInput)) {
    return filesInput
      .map(f => {
        if (!f || typeof f !== "object") return null;
        const filePath = f.path || f.relativePath || f.name || f.filename;
        if (!filePath || typeof filePath !== "string") return null;
        return {
          path: filePath.replace(/\\/g, "/").replace(/^\/+/, ""),
          content: f.content !== undefined ? f.content : (f.data !== undefined ? f.data : ""),
          isBase64: Boolean(f.isBase64)
        };
      })
      .filter(Boolean);
  }
  if (typeof filesInput === "object") {
    return Object.entries(filesInput)
      .map(([relPath, val]) => {
        if (!relPath || typeof relPath !== "string") return null;
        if (val instanceof Uint8Array || val instanceof ArrayBuffer) {
          return { path: relPath.replace(/\\/g, "/").replace(/^\/+/, ""), content: new Uint8Array(val), isBase64: false };
        }
        if (typeof val === "string") {
          return { path: relPath.replace(/\\/g, "/").replace(/^\/+/, ""), content: val, isBase64: val.startsWith("data:") && val.includes(";base64,") };
        }
        if (val && typeof val === "object") {
          const rawContent = val.content !== undefined ? val.content : (val.data !== undefined ? val.data : "");
          return {
            path: (val.path || val.relativePath || relPath).replace(/\\/g, "/").replace(/^\/+/, ""),
            content: rawContent,
            isBase64: Boolean(val.isBase64 || (typeof rawContent === "string" && rawContent.startsWith("data:") && rawContent.includes(";base64,")))
          };
        }
        return null;
      })
      .filter(Boolean);
  }
  return [];
}

function decodeBase64ToBytes(b64String) {
  const cleanB64 = String(b64String || "").replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
  const binStr = atob(cleanB64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Creates a valid ZIP Uint8Array archive from an array or object map of files ({ path/name, content, isBase64 })
 */
export async function createZipFromFiles(files = []) {
  const normalizedList = normalizeUploadedFilesInput(files);
  if (normalizedList.length === 0) {
    const err = new Error("No valid files provided to build template ZIP archive");
    err.code = "ZIP_EMPTY";
    throw err;
  }
  const zip = new JSZip();
  for (const f of normalizedList) {
    const cleanPath = String(f.path || "").replace(/^[/\\]+/, "");
    if (!cleanPath) continue;
    const rawContent = f.content;
    if (rawContent instanceof Uint8Array) {
      zip.file(cleanPath, rawContent);
    } else if (rawContent instanceof ArrayBuffer) {
      zip.file(cleanPath, new Uint8Array(rawContent));
    } else if (typeof rawContent === "string" && (f.isBase64 || (rawContent.startsWith("data:") && rawContent.includes(";base64,")))) {
      zip.file(cleanPath, decodeBase64ToBytes(rawContent));
    } else {
      zip.file(cleanPath, String(rawContent ?? ""));
    }
  }
  return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
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

  // 4. Calculate common root folder if present (supports multi-level nested containers)
  const fileEntriesOnly = entries
    .filter(p => !zip.files[p].dir)
    .map(p => String(p).replace(/\\/g, "/"))
    .filter(p => !p.includes("__MACOSX/") && !p.endsWith(".DS_Store"));
  let commonPrefix = "";
  if (fileEntriesOnly.length > 0 && !fileEntriesOnly.some(p => p.toLowerCase() === "index.html")) {
    const rootMarker = fileEntriesOnly
      .filter(p => /(?:^|\/)index\.html$/i.test(p) || /(?:^|\/)wishmagic\.json$/i.test(p))
      .sort((a, b) => a.length - b.length)[0];
    if (rootMarker && rootMarker.includes("/")) {
      const candidatePrefix = rootMarker.slice(0, rootMarker.lastIndexOf("/") + 1);
      if (fileEntriesOnly.every(p => p.startsWith(candidatePrefix))) {
        commonPrefix = candidatePrefix;
      }
    }
    if (!commonPrefix) {
      const firstParts = fileEntriesOnly[0].split("/");
      if (firstParts.length > 1) {
        const candidate = firstParts[0] + "/";
        if (fileEntriesOnly.every(p => p.startsWith(candidate))) {
          commonPrefix = candidate;
        }
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

    // Check ZIP central-directory metadata before decompression.
    // JSZip stores these sizes on the compressed-object metadata.
    const compressedSize = Number(entry._data?.compressedSize);
    const declaredUncompressedSize = Number(entry._data?.uncompressedSize);

    if (
      Number.isFinite(declaredUncompressedSize) &&
      declaredUncompressedSize > ZIP_LIMITS.MAX_ENTRY_BYTES
    ) {
      const err = new Error(
        `File ${normalized} exceeds the per-entry uncompressed size limit`
      );
      err.code = 'ZIP_ENTRY_TOO_LARGE';
      throw err;
    }

    if (
      Number.isFinite(compressedSize) &&
      Number.isFinite(declaredUncompressedSize)
    ) {
      const ratio =
        declaredUncompressedSize / Math.max(compressedSize, 1);

      if (ratio > ZIP_LIMITS.MAX_COMPRESSION_RATIO && declaredUncompressedSize > 10 * 1024 * 1024) {
        const err = new Error(
          `File ${normalized} exceeds the maximum compression ratio`
        );
        err.code = 'ZIP_BOMB_DETECTED';
        throw err;
      }

      if (
        totalUncompressedBytes + declaredUncompressedSize >
        ZIP_LIMITS.MAX_UNCOMPRESSED_BYTES
      ) {
        const err = new Error(
          'ZIP archive exceeds the total uncompressed size limit'
        );
        err.code = 'ZIP_TOTAL_SIZE_EXCEEDED';
        throw err;
      }
    }

    const entryBuffer = await entry.async('uint8array');
    const entrySize = entryBuffer.byteLength;

    // Always verify the actual size too; ZIP metadata is not trusted blindly.
    if (entrySize > ZIP_LIMITS.MAX_ENTRY_BYTES) {
      const err = new Error(
        `File ${normalized} exceeds the per-entry size limit`
      );
      err.code = 'ZIP_ENTRY_TOO_LARGE';
      throw err;
    }

    totalUncompressedBytes += entrySize;

    if (totalUncompressedBytes > ZIP_LIMITS.MAX_UNCOMPRESSED_BYTES) {
      const err = new Error(
        'ZIP archive exceeds the total uncompressed size limit'
      );
      err.code = 'ZIP_TOTAL_SIZE_EXCEEDED';
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
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) return 'audio';
  if (['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'video';
  if (ext === 'json') return 'manifest';
  return 'asset';
}

/**
 * Fallback regex-based dynamic field analyzer when full DOM is not available
 */
export function isImageExtension(relPath) {
  return /\.(png|jpe?g|webp|gif)$/i.test(String(relPath || ''));
}

export function isAudioExtension(relPath) {
  return /\.(mp3|wav|ogg|m4a|aac)$/i.test(String(relPath || ''));
}

export function isVideoExtension(relPath) {
  return /\.(mp4|webm|mov|m4v)$/i.test(String(relPath || ''));
}

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
      originalSrc: f.originalSrc || f.defaultValue || '',
      isRequired: Boolean(f.isRequired),
      category: f.category || (['image', 'audio', 'video'].includes(f.type) ? 'media' : 'personal'),
      autoDetected: Boolean(f.autoDetected),
      validation: f.validation || {}
    });
  }

  const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
  let match;
  let unmarkedImgIdx = 0;
  let unmarkedAudioIdx = 0;
  let unmarkedVideoIdx = 0;

  while ((match = tagRegex.exec(htmlString)) !== null) {
    const tagLower = match[1].toLowerCase();
    const attrs = match[2] || '';
    const fieldMatch = attrs.match(/data-wm(?:-field)?=["']([^"']+)["']/i);
    const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
    const srcVal = srcMatch ? srcMatch[1].trim() : '';

    if (fieldMatch) {
      const key = fieldMatch[1].trim();
      const typeMatch = attrs.match(/data-wm-type=["']([^"']+)["']/i);
      const labelMatch = attrs.match(/data-wm-label=["']([^"']+)["']/i);
      const reqMatch = attrs.match(/data-wm-required=["']([^"']+)["']/i);
      const defaultMatch = attrs.match(/data-wm-default=["']([^"']+)["']/i);
      const inferredType = tagLower === 'img'
        ? 'image'
        : (tagLower === 'audio' ? 'audio' : (tagLower === 'video' ? 'video' : 'text'));

      addField({
        key,
        type: typeMatch ? typeMatch[1].toLowerCase() : inferredType,
        label: labelMatch ? labelMatch[1] : undefined,
        isRequired: reqMatch ? reqMatch[1] === 'true' : false,
        defaultValue: defaultMatch ? defaultMatch[1] : srcVal,
        originalSrc: srcVal
      });
    } else if (tagLower === 'img' && srcVal && !srcVal.startsWith('data:image/svg')) {
      unmarkedImgIdx++;
      const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
      const altMatch = attrs.match(/\balt=["']([^"']+)["']/i);
      const baseName = srcVal.split('/').pop().split('?')[0].replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]+/g, '_').toLowerCase();
      let candidateKey = (unmarkedImgIdx === 1 && !fieldKeysSeen.has('photo_1'))
        ? 'photo_1'
        : (idMatch ? idMatch[1].replace(/[^a-zA-Z0-9_]+/g, '_').toLowerCase() : (baseName ? 'photo_' + baseName : 'photo_' + unmarkedImgIdx));
      if (fieldKeysSeen.has(candidateKey)) candidateKey = 'photo_' + unmarkedImgIdx;
      addField({
        key: candidateKey,
        type: 'image',
        label: altMatch && altMatch[1].trim() ? altMatch[1].trim() : 'Template Photo ' + unmarkedImgIdx,
        defaultValue: srcVal,
        originalSrc: srcVal,
        category: 'media',
        autoDetected: true
      });
    } else if (tagLower === 'audio' && srcVal) {
      unmarkedAudioIdx++;
      const candidateKey = (unmarkedAudioIdx === 1 && !fieldKeysSeen.has('background_music')) ? 'background_music' : 'audio_track_' + unmarkedAudioIdx;
      addField({
        key: candidateKey,
        type: 'audio',
        label: unmarkedAudioIdx === 1 ? 'Background Music' : 'Audio Track ' + unmarkedAudioIdx,
        defaultValue: srcVal,
        originalSrc: srcVal,
        category: 'media',
        autoDetected: true
      });
    } else if (tagLower === 'video' && srcVal) {
      unmarkedVideoIdx++;
      const candidateKey = (unmarkedVideoIdx === 1 && !fieldKeysSeen.has('celebration_video')) ? 'celebration_video' : 'video_clip_' + unmarkedVideoIdx;
      addField({
        key: candidateKey,
        type: 'video',
        label: unmarkedVideoIdx === 1 ? 'Celebration Video' : 'Video Clip ' + unmarkedVideoIdx,
        defaultValue: srcVal,
        originalSrc: srcVal,
        category: 'media',
        autoDetected: true
      });
    }
  }

  const audioBlockRegex = /<audio\b([^>]*)>([\s\S]*?)<\/audio>/gi;
  while ((match = audioBlockRegex.exec(htmlString)) !== null) {
    const audioAttrs = match[1] || '';
    const innerHtml = match[2] || '';
    if (!/data-wm(?:-field)?=/i.test(audioAttrs) && !/\bsrc=/i.test(audioAttrs)) {
      const sourceMatch = innerHtml.match(/<source\b[^>]*\bsrc=["']([^"']+)["']/i);
      if (sourceMatch && sourceMatch[1]) {
        unmarkedAudioIdx++;
        const candidateKey = !fieldKeysSeen.has('background_music') ? 'background_music' : 'audio_track_' + unmarkedAudioIdx;
        addField({
          key: candidateKey,
          type: 'audio',
          label: candidateKey === 'background_music' ? 'Background Music' : 'Audio Track ' + unmarkedAudioIdx,
          defaultValue: sourceMatch[1].trim(),
          originalSrc: sourceMatch[1].trim(),
          category: 'media',
          autoDetected: true
        });
      }
    }
  }

  const videoBlockRegex = /<video\b([^>]*)>([\s\S]*?)<\/video>/gi;
  while ((match = videoBlockRegex.exec(htmlString)) !== null) {
    const videoAttrs = match[1] || '';
    const innerHtml = match[2] || '';
    if (!/data-wm(?:-field)?=/i.test(videoAttrs) && !/\bsrc=/i.test(videoAttrs)) {
      const sourceMatch = innerHtml.match(/<source\b[^>]*\bsrc=["']([^"']+)["']/i);
      if (sourceMatch && sourceMatch[1]) {
        unmarkedVideoIdx++;
        const candidateKey = !fieldKeysSeen.has('celebration_video') ? 'celebration_video' : 'video_clip_' + unmarkedVideoIdx;
        addField({
          key: candidateKey,
          type: 'video',
          label: candidateKey === 'celebration_video' ? 'Celebration Video' : 'Video Clip ' + unmarkedVideoIdx,
          defaultValue: sourceMatch[1].trim(),
          originalSrc: sourceMatch[1].trim(),
          category: 'media',
          autoDetected: true
        });
      }
    }
  }

  const mustacheRegex = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;
  while ((match = mustacheRegex.exec(htmlString)) !== null) {
    const key = match[1].trim();
    if (!key.startsWith('#') && !key.startsWith('/') && !key.startsWith('^')) {
      const type = key.includes('photo') || key.includes('image')
        ? 'image'
        : (key.includes('music') || key.includes('audio') ? 'audio'
        : (key.includes('video') ? 'video'
        : (key.includes('message') || key.includes('letter') ? 'textarea' : 'text')));
      addField({ key, type });
    }
  }

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
  let operationId = `top_${now.getTime().toString(36)}_${crypto.randomUUID()}`;

  // Helper to persist operation state if D1 available - errors are propagated and never swallowed
  const updateOperation = async (state, progressStage, progressPercent, extra = {}) => {
    if (db && typeof db.prepare === 'function') {
      try {
        const stmt = db.prepare(`
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
        );

        const res = await stmt.run();
        if (res && res.success === false) {
          throw new Error('Database operation persistence returned unsuccessful result');
        }
      } catch (opErr) {
        const err = new Error(`Failed to persist upload operation state "${state}": ${opErr.message}`);
        err.code = 'OPERATION_STATE_PERSISTENCE_FAILED';
        err.cause = opErr;
        throw err;
      }
    }
  };

  // Resolve an existing operation before any new storage writes.
  if (idempotencyKey) {
    if (!db || typeof db.prepare !== 'function') {
      const err = new Error(
        'Database is required to enforce upload idempotency'
      );
      err.code = 'DATABASE_UNAVAILABLE';
      throw err;
    }

    let existingOp;

    try {
      const stmt = db.prepare(`
        SELECT *
        FROM template_upload_operations
        WHERE idempotency_key = ?
        LIMIT 1
      `).bind(idempotencyKey);
      if (typeof stmt.first === 'function') {
        existingOp = await stmt.first();
      } else if (typeof stmt.all === 'function') {
        const res = await stmt.all();
        const rows = Array.isArray(res) ? res : (res?.results || []);
        existingOp = rows[0] || null;
      }
    } catch (error) {
      const err = new Error(
        'Unable to verify the existing upload operation'
      );
      err.code = 'IDEMPOTENCY_LOOKUP_FAILED';
      err.cause = error;
      throw err;
    }

    if (existingOp) {
      if (existingOp.state === UPLOAD_OPERATION_STATE.PREVIEW_READY) {
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
          message: 'This upload operation has already completed.'
        };
      }

      if (
        existingOp.state === UPLOAD_OPERATION_STATE.RECEIVED ||
        existingOp.state === UPLOAD_OPERATION_STATE.VALIDATING ||
        existingOp.state === UPLOAD_OPERATION_STATE.STAGING ||
        existingOp.state === UPLOAD_OPERATION_STATE.STAGED ||
        existingOp.state === UPLOAD_OPERATION_STATE.REGISTERING
      ) {
        return {
          success: false,
          idempotent: true,
          operationId: existingOp.id,
          error: 'UPLOAD_IN_PROGRESS',
          code: 'UPLOAD_IN_PROGRESS',
          message: 'An operation with this idempotency key is already in progress.'
        };
      }

      if (existingOp.state === UPLOAD_OPERATION_STATE.CLEANUP_PENDING) {
        return {
          success: false,
          idempotent: true,
          operationId: existingOp.id,
          error: 'CLEANUP_PENDING',
          code: 'CLEANUP_PENDING',
          message: 'The previous operation requires storage cleanup before retry.'
        };
      }

      if (
        existingOp.state === UPLOAD_OPERATION_STATE.FAILED &&
        Number(existingOp.is_retryable) !== 1
      ) {
        return {
          success: false,
          idempotent: true,
          operationId: existingOp.id,
          error: existingOp.error_code || 'UPLOAD_NOT_RETRYABLE',
          code: existingOp.error_code || 'UPLOAD_NOT_RETRYABLE',
          message: 'The previous upload failed and is not retryable.'
        };
      }

      // Reuse the same operation identity for a retryable failed operation.
      operationId = existingOp.id;
    }
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

  // 2c. Template Code Security & Content Moderation Scan (Part 47)
  const securityAndModReport = await validateTemplateSecurityAndModeration(
    extracted.files,
    rawManifest || { template: templateMetadata },
    { env }
  );

  if (!securityAndModReport.securityValid) {
    const firstSec = securityAndModReport.securityIssues[0];
    await updateOperation(UPLOAD_OPERATION_STATE.VALIDATION_FAILED, 'template_security_failed', 32, {
      errorCode: 'TEMPLATE_SECURITY_VIOLATION',
      errorMessage: firstSec.message,
      validationReport: { ...utpReport, securityIssues: securityAndModReport.securityIssues },
      isRetryable: false
    });
    return {
      success: false,
      operationId,
      error: 'TEMPLATE_SECURITY_VIOLATION',
      code: 'TEMPLATE_SECURITY_VIOLATION',
      message: firstSec.message,
      securityIssues: securityAndModReport.securityIssues,
      issues: securityAndModReport.securityIssues
    };
  }

  if (!securityAndModReport.moderationValid) {
    const firstMod = securityAndModReport.moderationIssues[0];
    await updateOperation(UPLOAD_OPERATION_STATE.VALIDATION_FAILED, 'template_moderation_failed', 33, {
      errorCode: 'TEMPLATE_MODERATION_REJECTED',
      errorMessage: firstMod.message,
      validationReport: { ...utpReport, moderationIssues: securityAndModReport.moderationIssues },
      isRetryable: false
    });
    return {
      success: false,
      operationId,
      error: 'TEMPLATE_MODERATION_REJECTED',
      code: 'TEMPLATE_MODERATION_REJECTED',
      message: firstMod.message,
      moderationIssues: securityAndModReport.moderationIssues,
      issues: securityAndModReport.moderationIssues
    };
  }

  // 3. Analyze template & compute hashes
  const analyzed = await analyzeTemplateAndBuildIntegrity(extracted, zipBuffer);

  // Merge manifest-declared fields with DOM-detected fields following UTP priority:
  // Explicit manifest declarations first; auto-detected HTML fields only auto-merged when no explicit manifest fields array exists (otherwise surfaced in suggestedFields until confirmed)
  const hasExplicitManifestFields = Boolean(
    rawManifest && (Array.isArray(rawManifest.fields) || (rawManifest.template && Array.isArray(rawManifest.template.fields)))
  );
  const finalFieldsMap = new Map();
  if (utpReport.normalized && Array.isArray(utpReport.normalized.fields)) {
    for (const mf of utpReport.normalized.fields) {
      const fKey = mf.id || mf.key;
      if (!fKey) continue;
      const htmlDetected = analyzed.detectedFields.find(df => df.key === fKey);
      finalFieldsMap.set(fKey, {
        id: fKey,
        key: fKey,
        label: mf.label || htmlDetected?.label || fKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        type: mf.type || htmlDetected?.type || "text",
        placeholder: mf.placeholder || htmlDetected?.placeholder || "",
        defaultValue: mf.defaultValue !== undefined && mf.defaultValue !== null && mf.defaultValue !== "" ? mf.defaultValue : (htmlDetected?.defaultValue || ""),
        originalSrc: htmlDetected?.originalSrc || (typeof mf.defaultValue === "string" ? mf.defaultValue : ""),
        isRequired: Boolean(mf.required ?? htmlDetected?.isRequired),
        required: Boolean(mf.required ?? htmlDetected?.isRequired),
        category: mf.group || mf.category || htmlDetected?.category || "personal",
        binding: mf.binding || { target: "text", selector: "[data-wm-field='" + fKey + "']" },
        options: mf.options || null,
        visibleIf: mf.visibleIf || null,
        clearOnHide: Boolean(mf.clearOnHide),
        autoDetected: false,
        confirmed: true,
        validation: mf.constraints || mf.validation || htmlDetected?.validation || {}
      });
    }
  }
  if (!hasExplicitManifestFields) {
    for (const f of analyzed.detectedFields) {
      if (!finalFieldsMap.has(f.key)) {
        finalFieldsMap.set(f.key, f);
      }
    }
  }
  if (Array.isArray(templateMetadata.detectedFields)) {
    for (const df of templateMetadata.detectedFields) {
      const fKey = df && (df.key || df.id);
      if (!fKey) continue;
      const existing = finalFieldsMap.get(fKey);
      finalFieldsMap.set(fKey, {
        key: fKey,
        label: df.label || existing?.label || fKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        type: df.type || existing?.type || 'text',
        placeholder: df.placeholder || existing?.placeholder || '',
        defaultValue: df.defaultValue !== undefined ? df.defaultValue : (existing?.defaultValue || ''),
        originalSrc: df.originalSrc || existing?.originalSrc || df.defaultValue || '',
        isRequired: df.isRequired !== undefined ? Boolean(df.isRequired) : Boolean(df.required ?? existing?.isRequired),
        category: df.category || df.group || existing?.category || 'personal',
        autoDetected: Boolean(df.autoDetected ?? existing?.autoDetected),
        validation: df.validation || existing?.validation || {}
      });
    }
  }
  const mergedFields = Array.from(finalFieldsMap.values());

  // 4. Generate deterministic identifiers and family/version reservation
  const familySlug = templateMetadata.slug || (utpReport.normalized?.template?.id) || (analyzed.title ? analyzed.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : 'custom-template');
  const templateFamilyId = templateMetadata.familyId || `fam_${familySlug}`;
  const templateId = templateMetadata.templateId || `tpl_${familySlug}`;
  
  // Concurrency-safe version number calculation from DB
  let versionNumber = Number(templateMetadata.versionNumber || 0);

  if (!versionNumber) {
    if (!db || typeof db.prepare !== 'function') {
      const err = new Error(
        'A database connection is required to reserve a template version'
      );
      err.code = 'DATABASE_UNAVAILABLE';
      throw err;
    }

    let maxVerRow;

    try {
      const stmt = db.prepare(`
        SELECT MAX(version_number) AS maxVer
        FROM template_versions
        WHERE template_id = ? OR template_family_id = ?
      `).bind(templateId, templateFamilyId);

      if (typeof stmt.first === 'function') {
        maxVerRow = await stmt.first();
      } else if (typeof stmt.all === 'function') {
        const res = await stmt.all();
        const rows = Array.isArray(res) ? res : (res?.results || []);
        maxVerRow = rows[0] || { maxVer: 0 };
      } else {
        maxVerRow = { maxVer: 0 };
      }
    } catch (error) {
      const err = new Error(
        'Unable to determine the next template version number'
      );
      err.code = 'VERSION_LOOKUP_FAILED';
      err.cause = error;
      throw err;
    }

    versionNumber = (Number(maxVerRow?.maxVer) || 0) + 1;
  }

  if (!Number.isSafeInteger(versionNumber) || versionNumber < 1) {
    const err = new Error('Invalid template version number');
    err.code = 'INVALID_VERSION_NUMBER';
    throw err;
  }

  // Duplicate Package Detection via package_fingerprint
  if (db && typeof db.prepare === 'function') {
    let duplicateVer = null;
    try {
      const stmt = db.prepare(`
        SELECT id, version_number, version_label, status FROM template_versions
        WHERE (template_id = ? OR template_family_id = ?) AND package_fingerprint = ? AND status != 'failed'
        LIMIT 1
      `).bind(templateId, templateFamilyId, packageFingerprint);
      if (typeof stmt.first === 'function') {
        duplicateVer = await stmt.first();
      } else if (typeof stmt.all === 'function') {
        const res = await stmt.all();
        const rows = Array.isArray(res) ? res : (res?.results || []);
        duplicateVer = rows[0] || null;
      }
    } catch (fpErr) {
      const err = new Error(`Database error querying package fingerprint: ${fpErr.message}`);
      err.code = 'DATABASE_ERROR';
      err.isRetryable = true;
      err.cause = fpErr;
      throw err;
    }

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

  // Validate db binding upfront before uploading any assets to B2
  if (!db || typeof db.prepare !== 'function') {
    await updateOperation(UPLOAD_OPERATION_STATE.FAILED, 'db_binding_required', 35, {
      errorCode: 'DB_BINDING_REQUIRED',
      errorMessage: 'D1 database binding is required for template ingestion',
      isRetryable: false
    });
    return {
      success: false,
      operationId,
      error: 'D1 database binding is required for template ingestion',
      code: 'DB_BINDING_REQUIRED',
      message: 'D1 database binding is required for template ingestion'
    };
  }

  const uploadedB2Objects = [];
  const uploadedImgbbImages = [];
  const imgbbUrlByRelPath = new Map();
  const b2MediaUrlByRelPath = new Map();
  const shouldPublishImmediately = Boolean(
    params.publishImmediately ||
    templateMetadata.publishImmediately ||
    templateMetadata.autoPublish ||
    templateMetadata.isPublished === true
  );

  // Resolve ImgBB Provider if configured or injected
  let activeImgbbProvider = params.imgbbProvider || null;
  if (!activeImgbbProvider && ImgBBProvider.isConfigured(env)) {
    try {
      activeImgbbProvider = ImgBBProvider.fromEnv(env);
    } catch (_) {
      activeImgbbProvider = null;
    }
  }

  try {
    // 5a. Upload All Template Images in the ZIP/Folder to ImgBB (preserving exact name & format)
    if (activeImgbbProvider) {
      for (const fileRecord of analyzed.fileRecords) {
        if (isImageExtension(fileRecord.relativePath)) {
          const exactFileName = fileRecord.relativePath.split('/').pop();
          const exactStem = exactFileName.replace(/\.[^/.]+$/, '');
          try {
            const imgbbRes = await activeImgbbProvider.uploadImage({
              data: fileRecord.content,
              filename: exactFileName,
              name: exactStem
            });
            const liveImgUrl = imgbbRes.displayUrl || imgbbRes.originalUrl || imgbbRes.url;
            if (liveImgUrl) {
              imgbbUrlByRelPath.set(fileRecord.relativePath, liveImgUrl);
              fileRecord.imgbbUrl = liveImgUrl;
              fileRecord.imgbbAssetId = imgbbRes.providerAssetId;
              fileRecord.publicUrl = liveImgUrl;

              // Find matching field key if any
              const matchingField = mergedFields.find(f => {
                const defClean = String(f.defaultValue || f.originalSrc || '').replace(/^\.?\/+/, '');
                return defClean === fileRecord.relativePath || defClean.endsWith('/' + exactFileName) || defClean === exactFileName;
              });
              const assetKey = matchingField ? matchingField.key : exactStem;

              uploadedImgbbImages.push({
                ...imgbbRes,
                relativePath: fileRecord.relativePath,
                exactFileName,
                assetKey
              });
            }
          } catch (imgErr) {
            console.warn('[Template Ingest ImgBB Image Upload Warning]:', fileRecord.relativePath, imgErr.message);
          }
        }
      }
    }

    // Resolve cover thumbnail (upload base64 cover to ImgBB if provided, or map from uploaded ZIP images)
    let resolvedThumbnail = templateMetadata.thumbnail || '';
    if (resolvedThumbnail && resolvedThumbnail.startsWith('data:image/') && activeImgbbProvider) {
      try {
        const thumbName = templateMetadata.thumbnailName || (familySlug + '-cover.png');
        const thumbStem = thumbName.replace(/\.[^/.]+$/, '');
        const thumbUpload = await activeImgbbProvider.uploadImage({
          data: resolvedThumbnail,
          filename: thumbName,
          name: thumbStem
        });
        resolvedThumbnail = thumbUpload.displayUrl || thumbUpload.originalUrl || thumbUpload.url || resolvedThumbnail;
        uploadedImgbbImages.push({
          ...thumbUpload,
          relativePath: '__cover_thumbnail__',
          exactFileName: thumbUpload.filename || thumbName,
          assetKey: 'cover_thumbnail'
        });
      } catch (thumbErr) {
        console.warn('[Template Ingest Cover Thumbnail ImgBB Warning]:', thumbErr.message);
      }
    } else if (resolvedThumbnail && !resolvedThumbnail.startsWith('http') && !resolvedThumbnail.startsWith('/')) {
      const cleanThumbRel = resolvedThumbnail.replace(/^\.?\/+/, '');
      if (imgbbUrlByRelPath.has(cleanThumbRel)) {
        resolvedThumbnail = imgbbUrlByRelPath.get(cleanThumbRel);
      }
    } else if (!resolvedThumbnail && uploadedImgbbImages.length > 0) {
      resolvedThumbnail = uploadedImgbbImages[0].displayUrl || uploadedImgbbImages[0].url || '';
    }

    // 5b. Map structured Backblaze B2 URLs for Audio & Video files (exact name & format preserved)
    for (const fileRecord of analyzed.fileRecords) {
      if (isAudioExtension(fileRecord.relativePath) || isVideoExtension(fileRecord.relativePath)) {
        const streamUrl = '/api/templates/' + templateId + '/versions/' + versionId + '/preview/' + fileRecord.relativePath;
        b2MediaUrlByRelPath.set(fileRecord.relativePath, streamUrl);
        fileRecord.publicUrl = streamUrl;
      } else if (!fileRecord.publicUrl) {
        fileRecord.publicUrl = '/api/templates/' + templateId + '/versions/' + versionId + '/preview/' + fileRecord.relativePath;
      }
    }

    // 5c. Update mergedFields default values so image slots point to ImgBB URLs and audio/video slots point to B2 stream URLs
    for (const field of mergedFields) {
      const rawDef = String(field.defaultValue || field.originalSrc || '').trim();
      if (!rawDef || rawDef.startsWith('http://') || rawDef.startsWith('https://') || rawDef.startsWith('data:')) continue;
      const cleanRel = rawDef.replace(/^\.?\/+/, '');
      if (imgbbUrlByRelPath.has(cleanRel)) {
        field.defaultValue = imgbbUrlByRelPath.get(cleanRel);
        field.imgbbUrl = field.defaultValue;
      } else if (b2MediaUrlByRelPath.has(cleanRel)) {
        field.defaultValue = b2MediaUrlByRelPath.get(cleanRel);
        field.b2StreamUrl = field.defaultValue;
      } else {
        for (const [relP, liveUrl] of imgbbUrlByRelPath.entries()) {
          if (relP.endsWith('/' + cleanRel) || relP.split('/').pop() === cleanRel.split('/').pop()) {
            field.defaultValue = liveUrl;
            field.imgbbUrl = liveUrl;
            break;
          }
        }
        for (const [relP, streamUrl] of b2MediaUrlByRelPath.entries()) {
          if (relP.endsWith('/' + cleanRel) || relP.split('/').pop() === cleanRel.split('/').pop()) {
            field.defaultValue = streamUrl;
            field.b2StreamUrl = streamUrl;
            break;
          }
        }
      }
    }

    // 5d. Rewrite image links (to ImgBB URLs) and audio/video links (to structured B2 URLs) inside HTML/CSS/JS/Manifest code
    if (imgbbUrlByRelPath.size > 0 || b2MediaUrlByRelPath.size > 0) {
      const replaceAssetReferencesInText = (textContent) => {
        let updated = textContent;
        // Replace longest paths first to avoid partial collisions
        const allMappings = [
          ...Array.from(imgbbUrlByRelPath.entries()),
          ...Array.from(b2MediaUrlByRelPath.entries())
        ].sort((a, b) => b[0].length - a[0].length);

        for (const [relPath, targetUrl] of allMappings) {
          const escapedRel = relPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Match "./relPath", "../relPath", "/relPath", or "relPath" inside quotes or CSS url(...)
          const attrAndCssPattern = new RegExp(
            '(["\'(\s])(?:\\.\\.?\\/|\\/)*' + escapedRel + '(?=["\')?\\s#])',
            'g'
          );
          updated = updated.replace(attrAndCssPattern, '$1' + targetUrl);
        }
        return updated;
      };

      for (const fileRecord of analyzed.fileRecords) {
        const lowerPath = fileRecord.relativePath.toLowerCase();
        if (lowerPath.endsWith('.html') || lowerPath.endsWith('.css') || lowerPath.endsWith('.js') || lowerPath.endsWith('.json')) {
          const originalText = new TextDecoder('utf-8').decode(fileRecord.content);
          let rewrittenText = replaceAssetReferencesInText(originalText);

          // For entry HTML, also ensure unmarked <img>/<audio>/<video> have data-wm-field attributes & live bridge listener
          if (fileRecord.isEntryFile && lowerPath.endsWith('.html')) {
            for (const f of mergedFields) {
              if (f.autoDetected && f.originalSrc) {
                const resolvedSrc = f.defaultValue || f.originalSrc;
                const escSrc = resolvedSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const tagType = f.type === 'image' ? 'img' : (f.type === 'audio' ? 'audio' : (f.type === 'video' ? 'video' : null));
                if (tagType) {
                  const tagPattern = new RegExp('<' + tagType + '\\b(?![^>]*data-wm)([^>]*\\bsrc=["\']' + escSrc + '["\'][^>]*)>', 'i');
                  rewrittenText = rewrittenText.replace(
                    tagPattern,
                    '<' + tagType + ' data-wm-field="' + f.key + '" data-wm="' + f.key + '" data-wm-type="' + f.type + '"$1>'
                  );
                }
              }
            }
          }

          if (rewrittenText !== originalText) {
            const encodedBytes = new TextEncoder().encode(rewrittenText);
            fileRecord.content = encodedBytes;
            fileRecord.sizeBytes = encodedBytes.byteLength;
            fileRecord.sha256 = await computeSha256Hex(encodedBytes);
            if (analyzed.hashesPayload && analyzed.hashesPayload.files && analyzed.hashesPayload.files[fileRecord.relativePath]) {
              analyzed.hashesPayload.files[fileRecord.relativePath].sha256 = fileRecord.sha256;
              analyzed.hashesPayload.files[fileRecord.relativePath].sizeBytes = fileRecord.sizeBytes;
            }
          }
        }
      }
    }

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

    // 6. Upload Extracted Runtime Files to B2 (preserving exact original filenames and formats for music, videos, and code)
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
          sha256: fileRecord.sha256,
          originalFilename: fileRecord.relativePath.split('/').pop()
        }
      });
      uploadedB2Objects.push({ key: b2Key, fileId: fileUploadRes.fileId });
      fileRecord.storageKey = b2Key;
      fileRecord.b2FileId = fileUploadRes.fileId;
    }

    // Enrich manifestPayload with ImgBB & B2 asset mappings before uploading manifest
    manifestPayload.thumbnail = resolvedThumbnail;
    manifestPayload.imgbbImages = uploadedImgbbImages.map(img => ({
      assetKey: img.assetKey,
      relativePath: img.relativePath,
      filename: img.exactFileName || img.filename,
      displayUrl: img.displayUrl,
      originalUrl: img.originalUrl || img.url,
      thumbnailUrl: img.thumbnailUrl,
      providerAssetId: img.providerAssetId,
      mimeType: img.mimeType,
      width: img.width,
      height: img.height
    }));
    manifestPayload.b2MediaAssets = analyzed.fileRecords
      .filter(f => isAudioExtension(f.relativePath) || isVideoExtension(f.relativePath))
      .map(f => ({
        relativePath: f.relativePath,
        filename: f.relativePath.split('/').pop(),
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        storageKey: f.storageKey,
        streamUrl: b2MediaUrlByRelPath.get(f.relativePath)
      }));

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

    // 8. Commit Records into D1 Database (D1 binding is required for authoritative registration)
    if (!db || typeof db.prepare !== 'function') {
      throw new Error('D1 database binding DB is required for template registration. Ingestion cannot complete without database persistence.');
    }

    await updateOperation(UPLOAD_OPERATION_STATE.REGISTERING, 'registering_d1', 80);

    const targetTemplateStatus = shouldPublishImmediately ? 'published' : 'draft';
    const targetIsPublishedInt = shouldPublishImmediately ? 1 : 0;
    const targetVersionStatus = shouldPublishImmediately ? 'published' : 'ready';

    // Build atomic statement list for transactional D1 registration
    const registrationStatements = [];

    // 1. Template Family statement
    registrationStatements.push(
      db.prepare(`
        INSERT OR IGNORE INTO template_families (
          id, slug, name, description, thumbnail, category, tier, price, is_featured, is_premium, status, visibility, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', ?, ?, ?)
      `).bind(
        templateFamilyId,
        familySlug,
        templateMetadata.name || analyzed.title,
        templateMetadata.description || 'Custom web celebration template',
        resolvedThumbnail,
        templateMetadata.category || 'celebration',
        templateMetadata.tier || 'free',
        Number(templateMetadata.price || 0),
        templateMetadata.featured ? 1 : 0,
        templateMetadata.isPremium ? 1 : 0,
        targetTemplateStatus,
        authorId,
        nowIso,
        nowIso
      )
    );

    // 2. Templates statement
    registrationStatements.push(
      db.prepare(`
        INSERT INTO templates (
          id, name, slug, description, category, relationships, tags,
          type, tier, price, is_premium, is_published, status, featured,
          placement, thumbnail, preview_images, capabilities, detected_fields,
          sections, features, theme, folder, entry_file, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, '[]', '[]',
          '3D Interactive', ?, ?, ?, ?, ?, ?,
          99, ?, ?, ?, ?,
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
          is_published = CASE WHEN excluded.is_published = 1 THEN 1 ELSE templates.is_published END,
          status = CASE WHEN excluded.status = 'published' THEN 'published' ELSE templates.status END,
          thumbnail = CASE WHEN excluded.thumbnail != '' THEN excluded.thumbnail ELSE templates.thumbnail END,
          preview_images = excluded.preview_images,
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
        targetIsPublishedInt,
        targetTemplateStatus,
        templateMetadata.featured ? 1 : 0,
        resolvedThumbnail,
        JSON.stringify(uploadedImgbbImages.map(img => img.displayUrl).filter(Boolean)),
        JSON.stringify(utpReport.normalized?.capabilities || templateMetadata.capabilities || {}),
        JSON.stringify(mergedFields || []),
        JSON.stringify(utpReport.normalized?.sections || templateMetadata.sections || []),
        JSON.stringify(utpReport.normalized || {}),
        familySlug,
        extracted.entryFile,
        nowIso,
        nowIso
      )
    );

    // 3. Template Versions statement
    registrationStatements.push(
      db.prepare(`
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
          ?, ?, ?
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
        resolvedThumbnail,
        keys.sourceZip,
        keys.runtimeRoot,
        keys.manifest,
        analyzed.schemaHash,
        analyzed.runtimeHash,
        analyzed.sourceZipSha256,
        packageFingerprint,
        b2Provider.bucketName || 'wishmagic-templates',
        JSON.stringify({
          filesCount: analyzed.fileRecords.length,
          totalBytes: extracted.totalUncompressedBytes,
          imgbbCount: uploadedImgbbImages.length,
          imgbbImages: manifestPayload.imgbbImages,
          b2MediaAssets: manifestPayload.b2MediaAssets
        }),
        targetVersionStatus,
        nowIso,
        authorId
      )
    );

    // 4. Template Files statements
    for (const f of analyzed.fileRecords) {
      const pathHash = (await computeSha256Hex(f.relativePath)).slice(0, 12);
      const fileRecordId = `tfile_${versionId}_${pathHash}`;
      registrationStatements.push(
        db.prepare(`
          INSERT INTO template_files (
            id, template_version_id, relative_path, storage_provider, storage_key,
            mime_type, size_bytes, sha256, file_role, is_entry_file, status, created_at
          ) VALUES (?, ?, ?, 'b2', ?, ?, ?, ?, ?, ?, 'active', ?)
          ON CONFLICT(id) DO UPDATE SET
            storage_key = excluded.storage_key,
            size_bytes = excluded.size_bytes,
            sha256 = excluded.sha256,
            status = 'active'
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
        )
      );
    }

    // 5. Template Fields statements
    let fieldOrder = 0;
    for (const field of mergedFields) {
      fieldOrder++;
      const fieldId = `tfld_${versionId}_${field.key}`;
      registrationStatements.push(
        db.prepare(`
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
        )
      );
    }

    // 6. Template Images statements (ImgBB records stored in D1)
    let imgIdx = 0;
    for (const img of uploadedImgbbImages) {
      imgIdx++;
      const imgRecordId = `timg_${versionId}_${imgIdx}_${(img.providerAssetId || 'asset').replace(/[^a-zA-Z0-9]/g, '')}`;
      registrationStatements.push(
        db.prepare(`
          INSERT OR REPLACE INTO template_images (
            id, template_id, template_version_id, asset_key, relationship_id,
            storage_provider, provider_asset_id, original_url, display_url,
            thumbnail_url, delete_url, mime_type, size_bytes, width, height,
            sha256, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, NULL, 'imgbb', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
        `).bind(
          imgRecordId,
          templateId,
          versionId,
          img.assetKey || img.exactFileName || ('image_' + imgIdx),
          img.providerAssetId || '',
          img.originalUrl || img.url || img.displayUrl || '',
          img.displayUrl || img.url || '',
          img.thumbnailUrl || img.displayUrl || '',
          img.deleteUrl || null,
          img.mimeType || 'image/png',
          Number(img.sizeBytes) || 0,
          Number(img.width) || 0,
          Number(img.height) || 0,
          img.sha256 || '',
          nowIso,
          nowIso
        )
      );
    }

    // Execute atomic D1 commit
    try {
      if (typeof db.batch === 'function') {
        const batchResults = await db.batch(registrationStatements);
        if (Array.isArray(batchResults) && batchResults.some(r => r && r.success === false)) {
          throw new Error('Atomic D1 registration batch reported failed statement result');
        }
      } else {
        for (const stmt of registrationStatements) {
          await stmt.run();
        }
      }
    } catch (batchErr) {
      throw new Error(`D1 registration batch commit failed: ${batchErr.message}`);
    }

    // If publishImmediately is requested, also update current_version_id / published_version_id safely
    if (shouldPublishImmediately) {
      try {
        await db.prepare(`UPDATE templates SET current_version_id = ?, is_published = 1, status = 'published', updated_at = ? WHERE id = ?`).bind(versionId, nowIso, templateId).run();
        await db.prepare(`UPDATE template_versions SET is_current = 1, status = 'published', published_at = ? WHERE id = ?`).bind(nowIso, versionId).run();
        await db.prepare(`UPDATE template_families SET published_version_id = ?, latest_version_id = ?, status = 'published', updated_at = ? WHERE id = ?`).bind(versionId, versionId, nowIso, templateFamilyId).run();
      } catch (_) {}
    }

    await updateOperation(UPLOAD_OPERATION_STATE.PREVIEW_READY, 'completed', 100, {
      templateFamilyId,
      templateId,
      versionId,
      versionNumber,
      versionLabel,
      packageFingerprint,
      validationReport: utpReport,
      inventory: analyzed.fileRecords.map(f => ({
        path: f.relativePath,
        size: f.sizeBytes,
        hash: f.sha256,
        provider: f.imgbbUrl ? 'imgbb+b2' : 'b2',
        publicUrl: f.publicUrl
      }))
    });

    return {
      success: true,
      operationId,
      message: `Template "${templateMetadata.name || analyzed.title}" successfully ingested into Backblaze B2 & ImgBB cloud storage.`,
      templateFamilyId,
      templateId,
      versionId,
      versionNumber,
      versionLabel,
      status: targetVersionStatus,
      isPublished: shouldPublishImmediately,
      thumbnail: resolvedThumbnail,
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
      suggestedFields: utpReport.suggestedFields || [],
      imgbbImages: manifestPayload.imgbbImages,
      b2MediaAssets: manifestPayload.b2MediaAssets,
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

/**
 * Creates a mock in-memory D1 database instance for unit testing.
 * Compatible with prepare().bind().run() / all() / first().
 */
export function createMockD1Database() {
  const store = {
    template_families: new Map(),
    template_versions: new Map(),
    templates: new Map(),
    template_upload_operations: new Map(),
    template_audit_logs: []
  };

  return {
    prepare(sql) {
      let boundParams = [];
      return {
        bind(...params) {
          boundParams = params;
          return this;
        },
        async run() {
          return { success: true, meta: { changes: 1 } };
        },
        async all() {
          return { results: [], success: true };
        },
        async first() {
          return null;
        }
      };
    }
  };
}

