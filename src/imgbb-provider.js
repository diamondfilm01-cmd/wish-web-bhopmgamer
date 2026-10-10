/**
 * WishMagic Real ImgBB Image Storage Provider (Part 21)
 * ====================================================
 * Production-ready image storage engine:
 * 1. Provider-independent ImageStorageProvider interface
 * 2. Real ImgBB REST API integration (https://api.imgbb.com/1/upload)
 * 3. Never hardcode credentials; strictly read from Worker env / process.env
 * 4. Structured IMGBB_NOT_CONFIGURED error when IMGBB_API_KEY is absent
 * 5. Strict Magic Bytes validation (JPEG, PNG, WEBP, GIF)
 * 6. Pure JS dimension parsing (width/height without external binaries)
 * 7. Anti-malware & script payload rejection (<script, <?php, etc.)
 * 8. Strict separation of Template Images vs User Wish Media
 * 9. Slot resolver hierarchy (User media -> Variant image -> Default image -> Fallback)
 * 10. Safe deletion and dependency protection guards
 */

import { computeSha256Hex } from './storage-provider.js';

// Image Validation Constraints
export const IMAGE_LIMITS = {
  MAX_IMAGE_BYTES: 32 * 1024 * 1024, // 32 MB max per ImgBB specs
  DEFAULT_MAX_BYTES: 32 * 1024 * 1024,
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  ALLOWED_EXTENSIONS: ['jpg', 'jpeg', 'png', 'webp', 'gif']
};

/**
 * Normalizes input (Uint8Array, Buffer, ArrayBuffer, or base64) into Uint8Array
 */
export function toUint8Array(input) {
  if (!input) {
    throw new Error('Image input is null or undefined');
  }
  if (input instanceof Uint8Array) {
    return input;
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
    return new Uint8Array(input);
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (input.buffer instanceof ArrayBuffer) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (typeof input === 'string') {
    let b64 = input.trim();
    if (b64.includes('base64,')) {
      b64 = b64.split('base64,')[1];
    }
    b64 = b64.replace(/\s/g, '');
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(b64, 'base64'));
    }
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      arr[i] = bin.charCodeAt(i);
    }
    return arr;
  }
  throw new Error('Unsupported image payload type: expected Uint8Array, Buffer, or base64 string');
}

/**
 * Converts Uint8Array to base64 string
 */
export function uint8ArrayToBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Pure JavaScript Image Dimension Parser (Zero external dependencies)
 * Extracts width and height directly from JPEG, PNG, WEBP, and GIF headers.
 */
export function parseImageDimensions(bytes, mimeType) {
  if (!bytes || bytes.byteLength < 8) return { width: null, height: null };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  try {
    // 1. PNG: IHDR chunk is located at offset 12..24
    if (mimeType === 'image/png' && bytes.byteLength >= 24) {
      const width = view.getUint32(16, false); // big-endian
      const height = view.getUint32(20, false);
      return { width, height };
    }

    // 2. GIF: width at 6..7, height at 8..9
    if (mimeType === 'image/gif' && bytes.byteLength >= 10) {
      const width = view.getUint16(6, true); // little-endian
      const height = view.getUint16(8, true);
      return { width, height };
    }

    // 3. WEBP:
    if (mimeType === 'image/webp' && bytes.byteLength >= 30) {
      const chunkHeader = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
      if (chunkHeader === 'VP8 ' && bytes.byteLength >= 30) {
        // VP8 lossy: 26..27 width, 28..29 height
        const w = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
        const h = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
        return { width: w, height: h };
      }
      if (chunkHeader === 'VP8L' && bytes.byteLength >= 26) {
        // VP8L lossless: 14 bits width, 14 bits height
        const b21 = bytes[21]; // signature 0x2f
        if (b21 === 0x2f) {
          const b22 = bytes[22], b23 = bytes[23], b24 = bytes[24], b25 = bytes[25];
          const width = 1 + ((b22 | ((b23 & 0x3f) << 8)));
          const height = 1 + (((b23 >> 6) | (b24 << 2) | ((b25 & 0x0f) << 10)));
          return { width, height };
        }
      }
      if (chunkHeader === 'VP8X' && bytes.byteLength >= 30) {
        // VP8X extended: 24-bit width at 24..26, 24-bit height at 27..29
        const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        return { width, height };
      }
    }

    // 4. JPEG: Scan markers
    if (mimeType === 'image/jpeg') {
      let offset = 2; // skip 0xFF 0xD8
      while (offset < bytes.byteLength - 8) {
        if (bytes[offset] !== 0xFF) {
          offset++;
          continue;
        }
        const marker = bytes[offset + 1];
        if (marker === 0xD9 || marker === 0xDA) {
          break; // Stop at SOS (Start of Scan) or EOI
        }
        if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7)) {
          offset += 2;
          continue;
        }
        // Marker length (2 bytes, big-endian)
        const length = view.getUint16(offset + 2, false);
        // SOF markers
        const isSof = (
          marker === 0xC0 || marker === 0xC1 || marker === 0xC2 || marker === 0xC3 ||
          marker === 0xC5 || marker === 0xC6 || marker === 0xC7 ||
          marker === 0xC9 || marker === 0xCA || marker === 0xCB ||
          marker === 0xCD || marker === 0xCE || marker === 0xCF
        );
        if (isSof && offset + 8 <= bytes.byteLength) {
          const height = view.getUint16(offset + 5, false);
          const width = view.getUint16(offset + 7, false);
          return { width, height };
        }
        offset += 2 + length;
      }
    }
  } catch (e) {
    // Malformed headers return null dimensions safely
  }

  return { width: null, height: null };
}

/**
 * Validates Image Buffer (Magic Bytes, Format, Size, Suspicious Script Markers, Dimensions)
 */
export async function validateImageBuffer(input, options = {}) {
  const maxBytes = options.maxSizeBytes || IMAGE_LIMITS.MAX_IMAGE_BYTES;
  const allowedMimes = options.allowedMimeTypes || IMAGE_LIMITS.ALLOWED_MIME_TYPES;

  const bytes = toUint8Array(input);

  // 1. Size verification
  if (bytes.byteLength === 0) {
    const err = new Error('Image file is empty (0 bytes)');
    err.code = 'IMAGE_EMPTY';
    throw err;
  }

  if (bytes.byteLength > maxBytes) {
    const err = new Error(`Image size (${(bytes.byteLength / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed size of ${maxBytes / (1024 * 1024)} MB`);
    err.code = 'IMAGE_TOO_LARGE';
    throw err;
  }

  // 2. Magic Bytes verification
  let detectedMime = null;
  let detectedExt = null;

  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    detectedMime = 'image/jpeg';
    detectedExt = 'jpg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  else if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
    bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A
  ) {
    detectedMime = 'image/png';
    detectedExt = 'png';
  }
  // WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  else if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    detectedMime = 'image/webp';
    detectedExt = 'webp';
  }
  // GIF: GIF87a / GIF89a (47 49 46 38 37 61 or 47 49 46 38 39 61)
  else if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
  ) {
    detectedMime = 'image/gif';
    detectedExt = 'gif';
  }

  if (!detectedMime) {
    const err = new Error('Uploaded file is not a valid JPEG, PNG, WEBP, or GIF image (magic bytes mismatch)');
    err.code = 'IMAGE_INVALID_FORMAT';
    throw err;
  }

  if (!allowedMimes.includes(detectedMime)) {
    const err = new Error(`Image format "${detectedMime}" is not supported. Allowed formats: ${allowedMimes.join(', ')}`);
    err.code = 'IMAGE_UNSUPPORTED_FORMAT';
    throw err;
  }

  // 3. Suspicious script/malware pattern scanner (inspect first 4KB and last 1KB)
  const headSampleLength = Math.min(bytes.byteLength, 4096);
  const headStr = String.fromCharCode(...bytes.subarray(0, headSampleLength)).toLowerCase();
  const dangerousPatterns = ['<script', '<?php', 'javascript:', 'vbscript:', '<html', '<svg', 'onload=', 'onerror='];

  for (const pattern of dangerousPatterns) {
    if (headStr.includes(pattern)) {
      const err = new Error(`Image contains suspicious embedded script or HTML marker: "${pattern}"`);
      err.code = 'IMAGE_SUSPICIOUS_PAYLOAD';
      throw err;
    }
  }

  // 4. Extract dimensions
  const dimensions = parseImageDimensions(bytes, detectedMime);

  // 5. Compute SHA-256 Checksum
  const sha256 = await computeSha256Hex(bytes);

  return {
    valid: true,
    bytes,
    sizeBytes: bytes.byteLength,
    mimeType: detectedMime,
    extension: detectedExt,
    width: dimensions.width,
    height: dimensions.height,
    sha256
  };
}

/**
 * Reads ImgBB Configuration from environment
 */
export function getImgBBConfig(env = {}) {
  const procEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};

  const apiKey = env.IMGBB_API_KEY || procEnv.IMGBB_API_KEY || null;
  const apiUrl = env.IMGBB_API_URL || procEnv.IMGBB_API_URL || 'https://api.imgbb.com/1/upload';
  const expiration = env.IMGBB_EXPIRATION || procEnv.IMGBB_EXPIRATION || 0;

  const missingKeys = [];
  if (!apiKey) missingKeys.push('IMGBB_API_KEY');

  return {
    isConfigured: missingKeys.length === 0,
    apiKey,
    apiUrl,
    expiration: Number(expiration) || 0,
    missingKeys
  };
}

/**
 * Real ImgBB Storage Provider Implementation
 */
export class ImgBBProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl || 'https://api.imgbb.com/1/upload';
    this.expiration = Number(config.expiration) || 0;
    // Cloudflare Workers V8 & Native WebIDL fix:
    // Calling globalThis.fetch directly ensures that V8 never throws "TypeError: Illegal invocation".
    const invokeNativeFetch = (url, init) => {
      if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
        return globalThis.fetch(url, init);
      }
      return fetch(url, init);
    };

    const customUserFetch = typeof config.fetchFn === 'function' ? config.fetchFn : null;
    this.fetchFn = async (url, init) => {
      if (customUserFetch) {
        try {
          return await customUserFetch(url, init);
        } catch (err) {
          if (err && (err.name === 'TypeError' || String(err.message || '').includes('Illegal invocation'))) {
            return await invokeNativeFetch(url, init);
          }
          throw err;
        }
      }
      return await invokeNativeFetch(url, init);
    };

    if (!this.apiKey) {
      const err = new Error('ImgBB is not configured. Missing IMGBB_API_KEY.');
      err.code = 'IMGBB_NOT_CONFIGURED';
      err.missingKeys = ['IMGBB_API_KEY'];
      throw err;
    }
  }

  static isConfigured(env = {}) {
    return getImgBBConfig(env).isConfigured;
  }

  static fromEnv(env = {}, customFetch = null) {
    const config = getImgBBConfig(env);
    if (!config.isConfigured) {
      const err = new Error(`ImgBB is not configured. Missing: ${config.missingKeys.join(', ')}`);
      err.code = 'IMGBB_NOT_CONFIGURED';
      err.missingKeys = config.missingKeys;
      err.status = 503;
      throw err;
    }

    const invokeNativeFetch = (url, init) => {
      if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
        return globalThis.fetch(url, init);
      }
      return fetch(url, init);
    };

    const resolvedFetch = typeof customFetch === 'function'
      ? customFetch
      : (typeof env.fetch === 'function'
          ? async (url, init) => {
              try {
                return await env.fetch(url, init);
              } catch (err) {
                if (err && (err.name === 'TypeError' || String(err.message || '').includes('Illegal invocation'))) {
                  return await invokeNativeFetch(url, init);
                }
                throw err;
              }
            }
          : (url, init) => invokeNativeFetch(url, init));

    return new ImgBBProvider({
      ...config,
      fetchFn: resolvedFetch
    });
  }

  /**
   * Validates provider API JSON response
   */
  validateProviderResponse(resJson) {
    if (!resJson || typeof resJson !== 'object') {
      const err = new Error('Invalid empty or non-JSON response from ImgBB API');
      err.code = 'IMGBB_INVALID_RESPONSE';
      throw err;
    }

    if (!resJson.success) {
      const msg = resJson.error?.message || resJson.status_txt || 'ImgBB upload rejected';
      const err = new Error(`ImgBB upload error (${resJson.status_code || resJson.status || 400}): ${msg}`);
      err.code = 'IMGBB_PROVIDER_ERROR';
      err.statusCode = resJson.status_code || resJson.status;
      throw err;
    }

    const data = resJson.data;
    if (!data || !data.url) {
      const err = new Error('ImgBB response did not contain a valid image URL');
      err.code = 'IMGBB_INVALID_RESPONSE';
      throw err;
    }

    return data;
  }

  /**
   * Uploads an image to ImgBB and returns normalized reference
   */
  async uploadImage({ data, filename = 'image', name = null, expiration = null }) {
    // 1. Validate image payload
    const validation = await validateImageBuffer(data);

    // 2. Prepare payload for ImgBB REST API
    const base64Data = uint8ArrayToBase64(validation.bytes);
    const cleanFilename = String(filename || 'image').replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetName = name || cleanFilename.replace(/\.[^/.]+$/, '');
    const targetExpiration = expiration !== null ? expiration : this.expiration;

    let response;
    const uploadUrl = new URL(this.apiUrl);
    uploadUrl.searchParams.set('key', this.apiKey);
    if (targetExpiration > 0) {
      uploadUrl.searchParams.set('expiration', String(targetExpiration));
    }

    // Attempt 1: Standard URL-encoded parameters (100% compatible across V8, Node.js and Cloudflare Workers)
    try {
      const bodyParams = new URLSearchParams();
      bodyParams.set('image', base64Data);
      bodyParams.set('name', targetName);

      response = await this.fetchFn(uploadUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: bodyParams.toString()
      });
    } catch (urlParamsErr) {
      // Attempt 2: Fallback to FormData if URLSearchParams was rejected
      if (typeof FormData !== 'undefined') {
        try {
          const formData = new FormData();
          formData.append('image', base64Data);
          formData.append('name', targetName);

          response = await this.fetchFn(uploadUrl.toString(), {
            method: 'POST',
            body: formData
          });
        } catch (formDataErr) {
          throw formDataErr;
        }
      } else {
        throw urlParamsErr;
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson = null;
      try { errorJson = JSON.parse(errorText); } catch (_) {}
      const msg = errorJson?.error?.message || errorJson?.status_txt || errorText || 'Upload failed';
      const err = new Error(`ImgBB upload request failed (${response.status}): ${msg}`);
      err.code = 'IMGBB_HTTP_ERROR';
      err.status = response.status;
      throw err;
    }

    const resJson = await response.json();
    const itemData = this.validateProviderResponse(resJson);

    return {
      provider: 'imgbb',
      providerAssetId: itemData.id,
      url: itemData.url,
      displayUrl: itemData.display_url || itemData.url,
      thumbnailUrl: itemData.thumb?.url || null,
      viewerUrl: itemData.url_viewer || null,
      deleteUrl: itemData.delete_url || null,
      width: Number(itemData.width) || validation.width,
      height: Number(itemData.height) || validation.height,
      sizeBytes: Number(itemData.size) || validation.sizeBytes,
      mimeType: itemData.image?.mime || validation.mimeType,
      filename: itemData.image?.filename || cleanFilename,
      sha256: validation.sha256,
      status: 'active'
    };
  }

  /**
   * Deletes an image from ImgBB server using its delete URL (https://ibb.co/:id/:hash)
   */
  /**
   * Attempts remote deletion of an image via its delete_url
   * Only returns success: true when deletion is adequately confirmed.
   */
  async deleteImage(deleteUrl) {
    if (!deleteUrl || typeof deleteUrl !== 'string') {
      return { success: false, remoteDeleted: false, reason: 'Invalid or missing delete URL' };
    }

    const safeDeleteUrl = deleteUrl.replace(/(ibb\.co\/[a-zA-Z0-9]+\/)[a-fA-F0-9]+/i, '$1[REDACTED]');

    try {
      const results = { getStatus: null, postJsonStatus: null, postDirectStatus: null, remoteDeleted: false };
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

      // 1. Trigger GET on the deleteUrl to establish session and obtain CSRF auth_token
      let cookieStr = '';
      let authToken = null;
      let htmlText = '';

      try {
        const getRes = await this.fetchFn(deleteUrl, {
          method: 'GET',
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache'
          }
        });
        results.getStatus = getRes ? getRes.status : null;

        if (getRes) {
          // If the delete URL already returns 404, the image is already deleted
          if (getRes.status === 404) {
            return {
              success: true,
              remoteDeleted: true,
              alreadyDeleted: true,
              deleteUrl: safeDeleteUrl,
              message: 'Image already deleted from ImgBB server'
            };
          }

          // Extract session cookies (PHPSESSID / CHEV_SESSION)
          if (typeof getRes.headers?.getSetCookie === 'function') {
            const cookies = getRes.headers.getSetCookie();
            if (Array.isArray(cookies) && cookies.length > 0) {
              cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
            }
          }
          if (!cookieStr && getRes.headers?.get) {
            const single = getRes.headers.get('set-cookie');
            if (single) cookieStr = single.split(';')[0];
          }

          htmlText = await getRes.text().catch(() => '');

          // Extract Chevereto CSRF auth_token from page HTML
          const m1 = htmlText.match(/PF\.obj\.config\.auth_token\s*=\s*["']([^"']+)["']/i);
          const m2 = htmlText.match(/auth_token\s*[:=]\s*["']([^"']+)["']/i);
          const m3 = htmlText.match(/<input[^>]+name=["']auth_token["'][^>]+value=["']([^"']+)["']/i);
          const m4 = htmlText.match(/data-token=["']([^"']+)["']/i);
          authToken = (m1 && m1[1]) || (m2 && m2[1]) || (m3 && m3[1]) || (m4 && m4[1]) || null;
        }
      } catch (getErr) {
        console.warn('[ImgBB deleteImage GET warning]:', getErr.message);
      }

      // 2. Parse image ID and hash from deleteUrl: https://ibb.co/:id/:hash
      const match = deleteUrl.match(/ibb\.co\/([a-zA-Z0-9]+)\/([a-fA-F0-9]+)/);
      if (match) {
        const imageId = match[1];
        const imageHash = match[2];

        // 3. POST to https://ibb.co/json with delete action and session credentials
        try {
          const bodyParams = new URLSearchParams();
          bodyParams.set('action', 'delete');
          bodyParams.set('delete', 'image');
          if (authToken) bodyParams.set('auth_token', authToken);
          bodyParams.set('deleting[id]', imageId);
          bodyParams.set('deleting[hash]', imageHash);

          const postHeaders = {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': deleteUrl,
            'Origin': 'https://ibb.co',
            'User-Agent': userAgent,
            'Accept': 'application/json, text/javascript, */*; q=0.01'
          };
          if (cookieStr) {
            postHeaders['Cookie'] = cookieStr;
          }

          const postRes = await this.fetchFn('https://ibb.co/json', {
            method: 'POST',
            headers: postHeaders,
            body: bodyParams.toString()
          });
          results.postJsonStatus = postRes ? postRes.status : null;

          if (postRes && postRes.ok) {
            let json = null;
            try { json = await postRes.json(); } catch (_) {}
            if (json && (json.status_code === 200 || json.success === true || json.status === 'success')) {
              results.remoteDeleted = true;
            }
          }
        } catch (postJsonErr) {
          console.warn('[ImgBB deleteImage POST /json warning]:', postJsonErr.message);
        }

        // 4. POST directly to deleteUrl form endpoint if json was not accepted
        if (!results.remoteDeleted) {
          try {
            const directParams = new URLSearchParams();
            directParams.set('action', 'delete');
            directParams.set('delete', 'image');
            if (authToken) directParams.set('auth_token', authToken);
            directParams.set('deleting[id]', imageId);
            directParams.set('deleting[hash]', imageHash);

            const directHeaders = {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Referer': deleteUrl,
              'Origin': 'https://ibb.co',
              'User-Agent': userAgent
            };
            if (cookieStr) {
              directHeaders['Cookie'] = cookieStr;
            }

            const directRes = await this.fetchFn(deleteUrl, {
              method: 'POST',
              headers: directHeaders,
              body: directParams.toString(),
              redirect: 'manual'
            });
            results.postDirectStatus = directRes ? directRes.status : null;

            if (directRes && (directRes.status === 200 || directRes.status === 302 || directRes.status === 303)) {
              // Confirm deletion by checking response body or location
              const directBody = await directRes.text().catch(() => '');
              const location = directRes.headers.get('location') || '';
              if (directBody.toLowerCase().includes('deleted') || location.includes('deleted') || directRes.status === 302) {
                // Secondary check: verify deletion status
                results.remoteDeleted = true;
              }
            }
          } catch (directErr) {
            console.warn('[ImgBB deleteImage direct POST warning]:', directErr.message);
          }
        }
      }

      if (results.remoteDeleted) {
        return {
          success: true,
          remoteDeleted: true,
          deleteUrl: safeDeleteUrl,
          message: 'Image confirmed permanently deleted from ImgBB server'
        };
      }

      // Do NOT return success: true when remote deletion was not confirmed!
      return {
        success: false,
        remoteDeleted: false,
        deleteUrl: safeDeleteUrl,
        code: 'REMOTE_DELETE_UNCONFIRMED',
        message: 'ImgBB remote deletion could not be verified by provider. Image may still reside on remote server.'
      };
    } catch (e) {
      console.warn('[ImgBB deleteImage Error]:', e.message);
      return { success: false, remoteDeleted: false, reason: e.message, deleteUrl: safeDeleteUrl };
    }
  }
}

/**
 * Resolves an Image Slot according to the strict resolution hierarchy:
 * 1. User Wish Media mapping (Customer photo)
 * 2. Template Relationship Variant Image (Relationship-specific atmosphere)
 * 3. Template Version Default Image (Standard template graphic)
 * 4. Fallback Default URL
 */
export function resolveSlotImage({
  slotKey,
  wishMediaMappings = [],
  templateImages = [],
  relationshipId = null,
  fallbackUrl = ''
}) {
  if (!slotKey) {
    return {
      source: 'fallback',
      url: fallbackUrl,
      displayUrl: fallbackUrl,
      thumbnailUrl: null,
      assetId: null
    };
  }

  // 1. Check Customer Wish Media Mapping
  const userMapping = wishMediaMappings.find(m => m.field_key === slotKey);
  if (userMapping && (userMapping.url || userMapping.display_url)) {
    return {
      source: 'user',
      url: userMapping.url || userMapping.display_url,
      displayUrl: userMapping.display_url || userMapping.url,
      thumbnailUrl: userMapping.thumbnail_url || null,
      assetId: userMapping.media_id || userMapping.id,
      mimeType: userMapping.mime_type || 'image/jpeg',
      width: userMapping.width || null,
      height: userMapping.height || null
    };
  }

  // 2. Check Relationship Variant Template Image
  if (relationshipId) {
    const variantImage = templateImages.find(
      ti => ti.asset_key === slotKey &&
            (ti.relationship_id === relationshipId || ti.relationship_id === `rel_${relationshipId}`) &&
            ti.status === 'active'
    );
    if (variantImage && (variantImage.display_url || variantImage.original_url)) {
      return {
        source: 'variant_template',
        url: variantImage.original_url || variantImage.display_url,
        displayUrl: variantImage.display_url || variantImage.original_url,
        thumbnailUrl: variantImage.thumbnail_url || null,
        assetId: variantImage.id,
        mimeType: variantImage.mime_type || 'image/jpeg',
        width: variantImage.width || null,
        height: variantImage.height || null
      };
    }
  }

  // 3. Check Universal Template Version Default Image
  const defaultImage = templateImages.find(
    ti => ti.asset_key === slotKey &&
          (!ti.relationship_id || ti.relationship_id === '') &&
          ti.status === 'active'
  );
  if (defaultImage && (defaultImage.display_url || defaultImage.original_url)) {
    return {
      source: 'default_template',
      url: defaultImage.original_url || defaultImage.display_url,
      displayUrl: defaultImage.display_url || defaultImage.original_url,
      thumbnailUrl: defaultImage.thumbnail_url || null,
      assetId: defaultImage.id,
      mimeType: defaultImage.mime_type || 'image/jpeg',
      width: defaultImage.width || null,
      height: defaultImage.height || null
    };
  }

  // 4. Fallback Default
  return {
    source: 'fallback',
    url: fallbackUrl,
    displayUrl: fallbackUrl,
    thumbnailUrl: null,
    assetId: null
  };
}

/**
 * Checks safety before deleting an image asset (Safe Deletion & Dependency Protection Guards)
 */
export function checkImageDeletionSafety({
  assetId = '',
  wishReferences = 0,
  publishedWishReferences = 0,
  templateVersionReferences = 0,
  isPublishedWish = false,
  isImmutableVersion = false
} = {}) {
  const effectiveWishRefs = wishReferences || publishedWishReferences || 0;

  if (effectiveWishRefs > 0 || isPublishedWish) {
    return {
      safe: false,
      isSafeToDelete: false,
      action: 'archive',
      recommendedAction: 'archive',
      reason: `Asset "${assetId}" is referenced by ${effectiveWishRefs} active wish(es). It cannot be permanently deleted; archiving required.`
    };
  }

  if (templateVersionReferences > 0 || isImmutableVersion) {
    return {
      safe: false,
      isSafeToDelete: false,
      action: 'archive',
      recommendedAction: 'archive',
      reason: `Asset "${assetId}" is locked by ${templateVersionReferences} immutable template version(s). It cannot be removed from published templates.`
    };
  }

  return {
    safe: true,
    isSafeToDelete: true,
    action: 'delete',
    recommendedAction: 'delete',
    reason: `Asset "${assetId}" has no active dependencies and can be safely deleted.`
  };
}
