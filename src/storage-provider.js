/**
/**
 * WishMagic Storage Provider Abstraction & Backblaze B2 Implementation (Part 20)
 * ==============================================================================
 * Production-ready Backblaze B2 storage integration for immutable template ZIPs,
 * extracted runtime files, integrity manifests, and audio assets.
 * 
 * Rules:
 * 1. Provider-independent StorageProvider interface
 * 2. Real B2 Native REST API with SHA-1/SHA-256 checksum verification
 * 3. Never hardcode credentials; strictly read from Worker env / process.env
 * 4. Frontend NEVER receives B2 credentials
 * 5. Structured B2_NOT_CONFIGURED error when environment secrets are absent
 * 6. Deterministic, collision-safe immutable storage keys:
 *    templates/{templateFamilyId}/versions/{versionId}/...
 */

/**
 * Universal SHA-256 Hex Digest (Works in Workers and Node.js)
 */
export async function computeSha256Hex(data) {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : (data instanceof Uint8Array ? data : new Uint8Array(data));

  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Node.js fallback
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Universal SHA-1 Hex Digest for B2 Uploads
 */
export async function computeSha1Hex(data) {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : (data instanceof Uint8Array ? data : new Uint8Array(data));

  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-1', bytes);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Node.js fallback
  const { createHash } = await import('node:crypto');
  return createHash('sha1').update(bytes).digest('hex');
}

/**
 * Deterministic MIME type resolution
 */
export function getMimeType(filePath) {
  const ext = String(filePath).split('.').pop().toLowerCase();
  const mimeMap = {
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    mjs: 'application/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    zip: 'application/zip',
    txt: 'text/plain; charset=utf-8'
  };
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * Extracts and validates B2 Configuration from environment secrets
 */
export function getB2Config(env = {}) {
  const procEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};

  const applicationKeyId = env.B2_APPLICATION_KEY_ID || env.B2_KEY_ID || procEnv.B2_APPLICATION_KEY_ID || procEnv.B2_KEY_ID || null;
  const applicationKey = env.B2_APPLICATION_KEY || env.B2_APP_KEY || procEnv.B2_APPLICATION_KEY || procEnv.B2_APP_KEY || null;
  const bucketName = env.B2_BUCKET_NAME || procEnv.B2_BUCKET_NAME || null;
  const bucketId = env.B2_BUCKET_ID || procEnv.B2_BUCKET_ID || null;
  const endpoint = env.B2_ENDPOINT || env.B2_API_URL || procEnv.B2_ENDPOINT || procEnv.B2_API_URL || 'https://api.backblazeb2.com';
  const downloadUrl = env.B2_DOWNLOAD_URL || procEnv.B2_DOWNLOAD_URL || null;

  const missingKeys = [];
  if (!applicationKeyId) missingKeys.push('B2_APPLICATION_KEY_ID');
  if (!applicationKey) missingKeys.push('B2_APPLICATION_KEY');
  if (!bucketName && !bucketId) missingKeys.push('B2_BUCKET_NAME (or B2_BUCKET_ID)');

  const isConfigured = missingKeys.length === 0;

  return {
    isConfigured,
    applicationKeyId,
    applicationKey,
    bucketName: bucketName || 'wishmagic-templates',
    bucketId: bucketId || '',
    endpoint: endpoint.replace(/\/+$/, ''),
    downloadUrl: downloadUrl ? downloadUrl.replace(/\/+$/, '') : null,
    missingKeys
  };
}

/**
 * Builds standard deterministic immutable storage keys for templates
 */
export function buildTemplateStorageKeys(templateFamilyId, versionId) {
  const cleanFamilyId = String(templateFamilyId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanVersionId = String(versionId || 'v1').replace(/[^a-zA-Z0-9_-]/g, '_');
  const base = `templates/${cleanFamilyId}/versions/${cleanVersionId}`;

  return {
    base,
    sourceZip: `${base}/source/template.zip`,
    runtimeRoot: `${base}/runtime/`,
    runtimeFile: (relPath) => `${base}/runtime/${String(relPath).replace(/^\/+/, '')}`,
    manifest: `${base}/manifests/manifest.json`,
    analyzerSchema: `${base}/metadata/analyzer-schema.json`,
    hashes: `${base}/integrity/hashes.json`
  };
}

/**
 * Base Abstract Storage Provider Interface
 */
export class StorageProvider {
  async putObject(/* { key, body, contentType, contentLength, metadata } */) {
    throw new Error('putObject must be implemented by storage provider');
  }

  async getObject(/* { key } */) {
    throw new Error('getObject must be implemented by storage provider');
  }

  async headObject(/* { key } */) {
    throw new Error('headObject must be implemented by storage provider');
  }

  async deleteObject(/* { key, fileId } */) {
    throw new Error('deleteObject must be implemented by storage provider');
  }

  async listObjects(/* { prefix, maxKeys } */) {
    throw new Error('listObjects must be implemented by storage provider');
  }
}

/**
 * Real Backblaze B2 Storage Provider
 */
export class B2StorageProvider extends StorageProvider {
  constructor(config = {}) {
    super();
    this.applicationKeyId = config.applicationKeyId;
    this.applicationKey = config.applicationKey;
    this.bucketName = config.bucketName;
    this.bucketId = config.bucketId;
    this.endpoint = config.endpoint || 'https://api.backblazeb2.com';
    this.customDownloadUrl = config.downloadUrl || null;
    this.fetchFn = config.fetchFn || globalThis.fetch;

    this.authData = null;
    this.authExpiresAt = 0;
    this.uploadUrlCache = new Map(); // bucketId -> { uploadUrl, authorizationToken, expiresAt }
  }

  static fromEnv(env = {}, customFetch = null) {
    const config = getB2Config(env);
    if (!config.isConfigured) {
      const error = new Error(`Backblaze B2 is not configured. Missing: ${config.missingKeys.join(', ')}`);
      error.code = 'B2_NOT_CONFIGURED';
      error.missingKeys = config.missingKeys;
      throw error;
    }
    return new B2StorageProvider({
      ...config,
      fetchFn: customFetch || (typeof env.fetch === 'function' ? env.fetch : globalThis.fetch)
    });
  }

  static isConfigured(env = {}) {
    return getB2Config(env).isConfigured;
  }

  /**
   * Authorizes account with Backblaze B2 (b2_authorize_account)
   */
  async authorizeAccount(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.authData && this.authExpiresAt > now + 300000) {
      return this.authData;
    }

    if (!this.applicationKeyId || !this.applicationKey) {
      const err = new Error('B2 credentials missing: applicationKeyId and applicationKey are required.');
      err.code = 'B2_NOT_CONFIGURED';
      throw err;
    }

    // Basic Auth header
    const credentials = `${this.applicationKeyId}:${this.applicationKey}`;
    const basicAuth = (typeof btoa === 'function')
      ? btoa(credentials)
      : Buffer.from(credentials).toString('base64');

    const authUrl = `${this.endpoint}/b2api/v3/b2_authorize_account`;
    const response = await this.fetchFn(authUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${basicAuth}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson = {};
      try { errorJson = JSON.parse(errorText); } catch (_) {}
      const err = new Error(`B2 Authorization failed (${response.status}): ${errorJson.message || errorText}`);
      err.code = errorJson.code || 'B2_AUTH_FAILED';
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    this.authData = {
      accountId: data.accountId,
      authorizationToken: data.authorizationToken,
      apiUrl: data.apiUrl,
      downloadUrl: this.customDownloadUrl || data.downloadUrl,
      recommendedPartSize: data.recommendedPartSize,
      allowed: data.allowed || {}
    };

    // If bucketId wasn't provided, try using allowed bucket
    if (!this.bucketId && data.allowed?.bucketId) {
      this.bucketId = data.allowed.bucketId;
    }
    if (!this.bucketName && data.allowed?.bucketName) {
      this.bucketName = data.allowed.bucketName;
    }

    // Tokens typically last 24h; expire locally in 23h
    this.authExpiresAt = now + (23 * 3600 * 1000);
    return this.authData;
  }

  /**
   * Retrieves an upload URL for the target bucket (b2_get_upload_url)
   */
  async getUploadUrl(bucketId = null, forceRefresh = false) {
    const auth = await this.authorizeAccount();
    const targetBucketId = bucketId || this.bucketId;

    if (!targetBucketId) {
      throw new Error('B2 Bucket ID is required to get an upload URL.');
    }

    const cached = this.uploadUrlCache.get(targetBucketId);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      return cached;
    }

    const response = await this.fetchFn(`${auth.apiUrl}/b2api/v3/b2_get_upload_url`, {
      method: 'POST',
      headers: {
        'Authorization': auth.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ bucketId: targetBucketId })
    });

    if (!response.ok) {
      if (response.status === 401 && !forceRefresh) {
        // Auth token may have expired early, refresh and retry once
        await this.authorizeAccount(true);
        return this.getUploadUrl(targetBucketId, true);
      }
      const errorText = await response.text();
      throw new Error(`Failed to get B2 upload URL (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const uploadEntry = {
      uploadUrl: data.uploadUrl,
      authorizationToken: data.authorizationToken,
      bucketId: targetBucketId,
      expiresAt: Date.now() + (23 * 3600 * 1000)
    };

    this.uploadUrlCache.set(targetBucketId, uploadEntry);
    return uploadEntry;
  }

  /**
   * Upload an object into Backblaze B2 (b2_upload_file)
   */
  async putObject({ key, body, contentType, contentLength, metadata = {} }) {
    if (!key) throw new Error('Object storage key is required');
    if (body === undefined || body === null) throw new Error('Object body is required');

    // Convert string / Buffer / ArrayBuffer to Uint8Array
    let uint8Body;
    if (typeof body === 'string') {
      uint8Body = new TextEncoder().encode(body);
    } else if (body instanceof Uint8Array) {
      uint8Body = body;
    } else if (body instanceof ArrayBuffer) {
      uint8Body = new Uint8Array(body);
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) {
      uint8Body = new Uint8Array(body);
    } else {
      throw new Error('Unsupported body type for B2 upload');
    }

    const size = contentLength !== undefined ? contentLength : uint8Body.byteLength;
    const sha1Hex = await computeSha1Hex(uint8Body);
    const resolvedMime = contentType || getMimeType(key);

    let uploadTarget = await this.getUploadUrl();

    // B2 RFC 3986 URL Encoding for file name
    const encodedFileName = encodeURIComponent(key).replace(/%2F/gi, '/');

    const headers = {
      'Authorization': uploadTarget.authorizationToken,
      'X-Bz-File-Name': encodedFileName,
      'Content-Type': resolvedMime,
      'Content-Length': String(size),
      'X-Bz-Content-Sha1': sha1Hex
    };

    // Attach custom metadata tags
    if (metadata && typeof metadata === 'object') {
      for (const [metaK, metaV] of Object.entries(metadata)) {
        const cleanK = String(metaK).replace(/[^a-zA-Z0-9-]/g, '');
        if (cleanK) {
          headers[`X-Bz-Info-${cleanK}`] = encodeURIComponent(String(metaV));
        }
      }
    }

    let response = await this.fetchFn(uploadTarget.uploadUrl, {
      method: 'POST',
      headers,
      body: uint8Body
    });

    // Handle token expiration or upload URL invalidation
    if (response.status === 401 || response.status === 408) {
      uploadTarget = await this.getUploadUrl(null, true);
      headers['Authorization'] = uploadTarget.authorizationToken;
      response = await this.fetchFn(uploadTarget.uploadUrl, {
        method: 'POST',
        headers,
        body: uint8Body
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      let errJson = {};
      try { errJson = JSON.parse(errText); } catch (_) {}
      const err = new Error(`B2 putObject failed for ${key} (${response.status}): ${errJson.message || errText}`);
      err.code = errJson.code || 'B2_UPLOAD_FAILED';
      err.status = response.status;
      throw err;
    }

    const resData = await response.json();
    const publicDownloadBase = this.authData?.downloadUrl || this.customDownloadUrl || 'https://f000.backblazeb2.com';
    const downloadUrl = `${publicDownloadBase}/file/${this.bucketName}/${encodeURI(key)}`;

    return {
      success: true,
      storageProvider: 'b2',
      key,
      fileId: resData.fileId,
      fileName: resData.fileName,
      contentLength: resData.contentLength,
      sha1: resData.contentSha1,
      contentType: resData.contentType,
      uploadTimestamp: resData.uploadTimestamp,
      downloadUrl,
      url: downloadUrl
    };
  }

  /**
   * Retrieves an object from Backblaze B2 (b2_download_file_by_name)
   */
  async getObject({ key }) {
    if (!key) throw new Error('Object storage key is required');
    const auth = await this.authorizeAccount();
    const downloadBase = auth.downloadUrl || this.customDownloadUrl;
    const url = `${downloadBase}/file/${this.bucketName}/${encodeURI(key)}`;

    const headers = {};
    if (auth.authorizationToken) {
      headers['Authorization'] = auth.authorizationToken;
    }

    const response = await this.fetchFn(url, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const err = new Error(`B2 getObject failed for ${key} (${response.status})`);
      err.status = response.status;
      err.code = response.status === 404 ? 'NOT_FOUND' : 'B2_DOWNLOAD_FAILED';
      throw err;
    }

    const contentType = response.headers.get('content-type') || getMimeType(key);
    const contentLength = Number(response.headers.get('content-length') || 0);
    const fileId = response.headers.get('x-bz-file-id') || null;
    const sha1 = response.headers.get('x-bz-content-sha1') || null;
    const buffer = await response.arrayBuffer();

    return {
      success: true,
      key,
      fileId,
      sha1,
      contentType,
      contentLength,
      body: new Uint8Array(buffer)
    };
  }

  /**
   * Checks existence and metadata of an object
   */
  async headObject({ key }) {
    if (!key) throw new Error('Object storage key is required');
    const auth = await this.authorizeAccount();
    const downloadBase = auth.downloadUrl || this.customDownloadUrl;
    const url = `${downloadBase}/file/${this.bucketName}/${encodeURI(key)}`;

    const headers = {};
    if (auth.authorizationToken) {
      headers['Authorization'] = auth.authorizationToken;
    }

    const response = await this.fetchFn(url, {
      method: 'HEAD',
      headers
    });

    if (!response.ok) {
      return { exists: false, status: response.status, key };
    }

    return {
      exists: true,
      status: response.status,
      key,
      contentType: response.headers.get('content-type') || getMimeType(key),
      contentLength: Number(response.headers.get('content-length') || 0),
      fileId: response.headers.get('x-bz-file-id'),
      sha1: response.headers.get('x-bz-content-sha1')
    };
  }

  /**
   * Deletes an object version in Backblaze B2 (b2_delete_file_version)
   */
  async deleteObject({ key, fileId }) {
    const auth = await this.authorizeAccount();
    let targetFileId = fileId;

    if (!targetFileId) {
      const head = await this.headObject({ key });
      targetFileId = head.fileId;
    }

    if (!targetFileId) {
      return { success: false, message: 'fileId could not be resolved for deletion', key };
    }

    const response = await this.fetchFn(`${auth.apiUrl}/b2api/v3/b2_delete_file_version`, {
      method: 'POST',
      headers: {
        'Authorization': auth.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileName: key,
        fileId: targetFileId
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to delete B2 object ${key} (${response.status}): ${errText}`);
    }

    return { success: true, key, fileId: targetFileId };
  }

  /**
   * Lists object keys with prefix in target bucket (b2_list_file_names)
   */
  async listObjects({ prefix = '', maxKeys = 100 }) {
    const auth = await this.authorizeAccount();
    const response = await this.fetchFn(`${auth.apiUrl}/b2api/v3/b2_list_file_names`, {
      method: 'POST',
      headers: {
        'Authorization': auth.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bucketId: this.bucketId,
        prefix,
        maxFileCount: maxKeys
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to list B2 objects (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return {
      files: (data.files || []).map(f => ({
        key: f.fileName,
        fileId: f.fileId,
        contentLength: f.contentLength,
        contentType: f.contentType,
        uploadTimestamp: f.uploadTimestamp
      })),
      nextFileName: data.nextFileName || null
    };
  }
}
