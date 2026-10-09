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

function sanitizeB2Secret(val) {
  if (val === undefined || val === null) return null;
  let str = String(val).trim();
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }
  return str || null;
}

/**
 * Extracts and validates B2 Configuration from environment secrets.
 *
 * Deterministic Credential Precedence Order:
 * 1. Primary Cloudflare Secret: B2_KEY_ID
 * 2. Legacy / Alias Fallback: B2_APPLICATION_KEY_ID, BACKBLAZE_KEY_ID, BACKBLAZE_APPLICATION_KEY_ID
 * 3. Process Environment Fallback: process.env.B2_KEY_ID, process.env.B2_APPLICATION_KEY_ID
 */
export function getB2Config(env = {}) {
  const procEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};

  // Deterministic priority: B2_KEY_ID takes precedence over legacy aliases
  const applicationKeyId = sanitizeB2Secret(
    env.B2_KEY_ID || env.B2_APPLICATION_KEY_ID || env.BACKBLAZE_KEY_ID || env.BACKBLAZE_APPLICATION_KEY_ID ||
    env.B2_KEYID || env.KEY_ID || env.B2_APP_KEY_ID ||
    procEnv.B2_KEY_ID || procEnv.B2_APPLICATION_KEY_ID
  );
  const applicationKey = sanitizeB2Secret(
    env.B2_APPLICATION_KEY || env.B2_APP_KEY || env.BACKBLAZE_APPLICATION_KEY || env.BACKBLAZE_APP_KEY ||
    env.APPLICATION_KEY || env.APP_KEY || env.B2_SECRET_KEY || env.B2_SECRET ||
    procEnv.B2_APPLICATION_KEY || procEnv.B2_APP_KEY
  );
  const explicitBucketName = sanitizeB2Secret(
    env.B2_BUCKET_NAME || env.BACKBLAZE_BUCKET_NAME || env.B2_BUCKET || env.BACKBLAZE_BUCKET ||
    env.BUCKET_NAME || env.BUCKET || env.B2_BUCKET_NAME_ID || env.B2_STORAGE_BUCKET ||
    env.STORAGE_BUCKET || env.B2_MUSIC_BUCKET || env.B2_AUDIO_BUCKET ||
    procEnv.B2_BUCKET_NAME || procEnv.BACKBLAZE_BUCKET_NAME || procEnv.B2_BUCKET || procEnv.BUCKET_NAME
  );
  const bucketId = sanitizeB2Secret(
    env.B2_BUCKET_ID || env.BACKBLAZE_BUCKET_ID || env.BUCKET_ID || env.B2_BUCKETID ||
    procEnv.B2_BUCKET_ID || procEnv.BACKBLAZE_BUCKET_ID
  );
  const rawEndpoint = sanitizeB2Secret(
    env.B2_ENDPOINT || env.B2_API_URL || env.B2_API_ENDPOINT || env.BACKBLAZE_ENDPOINT || env.BACKBLAZE_API_URL ||
    procEnv.B2_ENDPOINT || procEnv.B2_API_URL || 'https://api.backblazeb2.com'
  );
  const downloadUrl = sanitizeB2Secret(
    env.B2_DOWNLOAD_URL || env.BACKBLAZE_DOWNLOAD_URL || procEnv.B2_DOWNLOAD_URL
  );

  let endpoint = rawEndpoint || 'https://api.backblazeb2.com';
  if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    endpoint = `https://${endpoint}`;
  }

  // If application credentials are configured, bucket name can safely default to 'wishmagic-assets'
  // and will auto-resolve the bucket ID or first account bucket via native b2_list_buckets
  const bucketName = explicitBucketName || (applicationKeyId && applicationKey ? 'wishmagic-assets' : null);

  const missingKeys = [];
  if (!applicationKeyId) {
    missingKeys.push('B2_KEY_ID');
    missingKeys.push('B2_APPLICATION_KEY_ID');
  }
  if (!applicationKey) missingKeys.push('B2_APPLICATION_KEY');
  if (!bucketName && !bucketId) missingKeys.push('B2_BUCKET_NAME (or B2_BUCKET_ID)');

  const isConfigured = missingKeys.length === 0;

  return {
    isConfigured,
    applicationKeyId,
    applicationKey,
    bucketName: bucketName || 'wishmagic-assets',
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
  const cleanVersionId = String(versionId || 'v1').replace(/[^a-zA-Z0-9_.-]/g, '_');
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
    this.bucketName = config.bucketName || 'wishmagic-assets';
    this.bucketId = config.bucketId || '';
    this.endpoint = config.endpoint || 'https://api.backblazeb2.com';
    this.customDownloadUrl = config.downloadUrl || null;
    
    // Cloudflare Workers V8 & Native WebIDL fix: wrap fetch to prevent Illegal invocation error
    const invokeNativeFetch = (url, init) => {
      if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
        return globalThis.fetch.call(globalThis, url, init);
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

    const invokeNativeFetch = (url, init) => {
      if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
        return globalThis.fetch.call(globalThis, url, init);
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

    return new B2StorageProvider({
      ...config,
      fetchFn: resolvedFetch
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

    // Determine native B2 API authorization endpoint
    let authBase = 'https://api.backblazeb2.com';
    if (this.endpoint) {
      let cleanEndpoint = String(this.endpoint).trim().replace(/\/+$/, '');
      if (!cleanEndpoint.startsWith('http://') && !cleanEndpoint.startsWith('https://')) {
        cleanEndpoint = `https://${cleanEndpoint}`;
      }
      if (!cleanEndpoint.includes('s3.') && (cleanEndpoint.includes('backblazeb2.com') || cleanEndpoint.includes('localhost') || cleanEndpoint.includes('127.0.0.1') || cleanEndpoint.includes('mock'))) {
        authBase = cleanEndpoint;
      }
    }

    const authUrl = `${authBase}/b2api/v3/b2_authorize_account`;
    let response = await this.fetchFn(authUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${basicAuth}`
      }
    });

    // If custom endpoint failed, fallback to global native B2 API endpoint
    if (!response.ok && authBase !== 'https://api.backblazeb2.com') {
      try {
        const fallbackRes = await this.fetchFn('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${basicAuth}`
          }
        });
        if (fallbackRes.ok) {
          response = fallbackRes;
        }
      } catch (_) {}
    }

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
   * Automatically resolves bucketId from bucketName via native B2 b2_list_buckets
   */
  async resolveBucketId(forceRefresh = false) {
    if (this.bucketId && !forceRefresh) return this.bucketId;
    const auth = await this.authorizeAccount(forceRefresh);
    if (auth.allowed?.bucketId) {
      this.bucketId = auth.allowed.bucketId;
      return this.bucketId;
    }

    if (!this.bucketName) return null;

    try {
      const listUrl = `${auth.apiUrl}/b2api/v3/b2_list_buckets`;
      let res = await this.fetchFn(listUrl, {
        method: 'POST',
        headers: {
          'Authorization': auth.authorizationToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accountId: auth.accountId,
          bucketName: this.bucketName
        })
      });

      if (res.ok) {
        const listData = await res.json();
        const buckets = listData.buckets || [];
        const match = buckets.find(b => b.bucketName === this.bucketName || b.bucketName?.toLowerCase() === this.bucketName?.toLowerCase()) || buckets[0];
        if (match && match.bucketId) {
          this.bucketId = match.bucketId;
          if (match.bucketName) this.bucketName = match.bucketName;
          return this.bucketId;
        }
      } else {
        // Fallback: list buckets without bucketName filter
        const fallbackRes = await this.fetchFn(listUrl, {
          method: 'POST',
          headers: {
            'Authorization': auth.authorizationToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            accountId: auth.accountId
          })
        });
        if (fallbackRes.ok) {
          const listData = await fallbackRes.json();
          const buckets = listData.buckets || [];
          const match = buckets.find(b => b.bucketName === this.bucketName || b.bucketName?.toLowerCase() === this.bucketName?.toLowerCase()) || buckets[0];
          if (match && match.bucketId) {
            this.bucketId = match.bucketId;
            if (match.bucketName) this.bucketName = match.bucketName;
            return this.bucketId;
          }
        }
      }
    } catch (listErr) {
      console.warn('[B2] Auto-resolve bucketId warning:', listErr.message);
    }

    return this.bucketId;
  }

  /**
   * Retrieves an upload URL for the target bucket (b2_get_upload_url)
   */
  async getUploadUrl(bucketId = null, forceRefresh = false) {
    const auth = await this.authorizeAccount(forceRefresh);
    let targetBucketId = bucketId || this.bucketId;

    if (!targetBucketId) {
      targetBucketId = await this.resolveBucketId(forceRefresh);
    }

    if (!targetBucketId) {
      throw new Error(`B2 Bucket ID could not be resolved for bucket "${this.bucketName || 'unknown'}". Please ensure B2_BUCKET_NAME exists in Backblaze or provide B2_BUCKET_ID.`);
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
      let errorJson = {};
      try { errorJson = JSON.parse(errorText); } catch (_) {}
      const err = new Error(`Failed to get B2 upload URL (${response.status}): ${errorJson.message || errorText}`);
      err.code = errorJson.code || 'B2_UPLOAD_URL_FAILED';
      throw err;
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

    // Support Private Buckets: obtain download authorization token if available
    let playbackUrl = downloadUrl;
    let downloadToken = null;
    try {
      downloadToken = await this.getDownloadAuthorization({ fileNamePrefix: key, validDurationInSeconds: 604800 });
      if (downloadToken) {
        playbackUrl = `${downloadUrl}?b2-download-token=${downloadToken}`;
      }
    } catch (_) {}

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
      playbackUrl,
      downloadToken,
      url: playbackUrl
    };
  }

  /**
   * Generates a temporary download authorization token for private buckets
   * (b2_get_download_authorization)
   */
  async getDownloadAuthorization({ bucketId = null, fileNamePrefix = '', validDurationInSeconds = 604800 } = {}) {
    const auth = await this.authorizeAccount();
    const targetBucketId = bucketId || this.bucketId || (await this.resolveBucketId());

    if (!targetBucketId) return null;

    try {
      const res = await this.fetchFn(`${auth.apiUrl}/b2api/v3/b2_get_download_authorization`, {
        method: 'POST',
        headers: {
          'Authorization': auth.authorizationToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bucketId: targetBucketId,
          fileNamePrefix: fileNamePrefix || '',
          validDurationInSeconds: Math.min(validDurationInSeconds, 604800)
        })
      });

      if (res.ok) {
        const data = await res.json();
        return data.authorizationToken || null;
      }
    } catch (e) {
      console.warn('[B2] getDownloadAuthorization warning:', e.message);
    }

    return null;
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

// ============================================================================
// AUDIO & VIDEO VALIDATION CONSTRAINTS AND ENGINES (Part 41 / Backblaze B2)
// ============================================================================

export const AUDIO_LIMITS = {
  MAX_AUDIO_BYTES: 50 * 1024 * 1024, // 50 MB max per audio track
  DEFAULT_MAX_BYTES: 50 * 1024 * 1024,
  ALLOWED_MIME_TYPES: [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/ogg',
    'audio/opus',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/flac',
    'audio/webm'
  ],
  ALLOWED_EXTENSIONS: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'weba', 'opus']
};

export const VIDEO_LIMITS = {
  MAX_VIDEO_BYTES: 100 * 1024 * 1024, // 100 MB max for celebration video reels
  DEFAULT_MAX_BYTES: 100 * 1024 * 1024,
  ALLOWED_MIME_TYPES: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'],
  ALLOWED_EXTENSIONS: ['mp4', 'webm', 'mov', 'mkv']
};

/**
 * Normalizes base64 string, Data URL, Buffer, or ArrayBuffer into Uint8Array
 */
export function normalizeBinaryInput(input) {
  if (!input) {
    const err = new Error('Audio payload is missing or empty');
    err.code = 'AUDIO_EMPTY';
    throw err;
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

  if (typeof input === 'string') {
    let cleanBase64 = input;
    if (input.includes(',')) {
      cleanBase64 = input.split(',')[1];
    }
    cleanBase64 = cleanBase64.replace(/\s/g, '');

    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(cleanBase64, 'base64'));
    }

    const binaryStr = atob(cleanBase64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }

  const err = new Error('Unsupported binary payload format');
  err.code = 'AUDIO_INVALID';
  throw err;
}

/**
 * Validates audio bytes, MIME type, size limits, and magic signatures
 */
export async function validateAudioBuffer(input, options = {}) {
  const maxBytes = options.maxSizeBytes || AUDIO_LIMITS.MAX_AUDIO_BYTES;
  const filename = String(options.filename || 'track.mp3').toLowerCase();
  const fileExt = filename.split('.').pop() || 'mp3';

  const bytes = normalizeBinaryInput(input);
  const sizeBytes = bytes.byteLength;

  if (sizeBytes === 0) {
    const err = new Error('Audio file is empty (0 bytes)');
    err.code = 'AUDIO_EMPTY';
    throw err;
  }

  if (sizeBytes > maxBytes) {
    const err = new Error(`Audio file exceeds maximum allowed size of ${(maxBytes / (1024 * 1024)).toFixed(0)} MB (Received ${(sizeBytes / (1024 * 1024)).toFixed(2)} MB)`);
    err.code = 'AUDIO_TOO_LARGE';
    err.sizeBytes = sizeBytes;
    err.maxBytes = maxBytes;
    throw err;
  }

  // Security check: reject executable or HTML scripts disguised as audio
  if (sizeBytes >= 4) {
    // Windows executable MZ
    if (bytes[0] === 0x4D && bytes[1] === 0x5A) {
      const err = new Error('Executable files (.exe, MZ) are strictly rejected');
      err.code = 'FILE_SECURITY_REJECTED';
      throw err;
    }
    // ELF executable \x7FELF
    if (bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46) {
      const err = new Error('Executable binary files are strictly rejected');
      err.code = 'FILE_SECURITY_REJECTED';
      throw err;
    }
    // HTML / Script check (<html, <!DOCTYPE, <?php, <script)
    const previewStr = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, Math.min(sizeBytes, 64))).toLowerCase();
    if (previewStr.includes('<!doctype') || previewStr.includes('<html') || previewStr.includes('<?php') || previewStr.includes('<script')) {
      const err = new Error('Script or HTML documents are rejected as audio files');
      err.code = 'FILE_SECURITY_REJECTED';
      throw err;
    }
  }

  // Detect signature / audio format
  let detectedMime = null;
  let detectedExt = null;

  // 1. MP3 with ID3v2 tag (bytes: "ID3" = 0x49, 0x44, 0x33)
  if (sizeBytes >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    detectedMime = 'audio/mpeg';
    detectedExt = 'mp3';
  }
  // 2. MP3 raw MPEG audio frame sync: 0xFF followed by 0xE0..0xFF (e.g. 0xFB, 0xF3, 0xF2)
  else if (sizeBytes >= 2 && bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0 && (bytes[1] & 0x18) !== 0x08) {
    detectedMime = 'audio/mpeg';
    detectedExt = 'mp3';
  }
  // 3. WAV: "RIFF" (0x52, 0x49, 0x46, 0x46) and offset 8 "WAVE" (0x57, 0x41, 0x56, 0x45)
  else if (sizeBytes >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
    detectedMime = 'audio/wav';
    detectedExt = 'wav';
  }
  // 4. OGG: "OggS" (0x4F, 0x67, 0x67, 0x53)
  else if (sizeBytes >= 4 && bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    detectedMime = 'audio/ogg';
    detectedExt = 'ogg';
  }
  // 5. FLAC: "fLaC" (0x66, 0x4C, 0x61, 0x43)
  else if (sizeBytes >= 4 && bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43) {
    detectedMime = 'audio/flac';
    detectedExt = 'flac';
  }
  // 6. M4A / AAC (MP4 container with 'ftyp'): offset 4..7 is "ftyp"
  else if (sizeBytes >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    detectedMime = 'audio/mp4';
    detectedExt = 'm4a';
  }
  // 7. WEBM / Matroska EBML: 0x1A, 0x45, 0xDF, 0xA3
  else if (sizeBytes >= 4 && bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
    detectedMime = 'audio/webm';
    detectedExt = 'weba';
  }
  // 8. ADTS AAC: 0xFF followed by 0xF0 or 0xF1..0xF9
  else if (sizeBytes >= 2 && bytes[0] === 0xFF && (bytes[1] & 0xF6) === 0xF0) {
    detectedMime = 'audio/aac';
    detectedExt = 'aac';
  }
  // Fallback to extension validation if valid audio extension
  else if (AUDIO_LIMITS.ALLOWED_EXTENSIONS.includes(fileExt)) {
    detectedExt = fileExt;
    detectedMime = getMimeType(`track.${fileExt}`);
  }

  if (!detectedMime || !detectedExt) {
    const err = new Error(`Invalid or unsupported audio file format (.${fileExt}). Please upload MP3, WAV, OGG, M4A, AAC, or FLAC.`);
    err.code = 'AUDIO_INVALID';
    throw err;
  }

  const sha256 = await computeSha256Hex(bytes);

  return {
    valid: true,
    bytes,
    sizeBytes,
    mimeType: detectedMime,
    extension: detectedExt,
    sha256
  };
}

/**
 * Validates video bytes and constraints for celebration reels
 */
export async function validateVideoBuffer(input, options = {}) {
  const maxBytes = options.maxSizeBytes || VIDEO_LIMITS.MAX_VIDEO_BYTES;
  const filename = String(options.filename || 'video.mp4').toLowerCase();
  const fileExt = filename.split('.').pop() || 'mp4';

  const bytes = normalizeBinaryInput(input);
  const sizeBytes = bytes.byteLength;

  if (sizeBytes === 0) {
    const err = new Error('Video file is empty (0 bytes)');
    err.code = 'VIDEO_EMPTY';
    throw err;
  }

  if (sizeBytes > maxBytes) {
    const err = new Error(`Video file exceeds maximum allowed size of ${(maxBytes / (1024 * 1024)).toFixed(0)} MB`);
    err.code = 'VIDEO_TOO_LARGE';
    throw err;
  }

  let detectedMime = null;
  let detectedExt = null;

  // MP4/MOV container: offset 4 'ftyp'
  if (sizeBytes >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    detectedMime = 'video/mp4';
    detectedExt = 'mp4';
  }
  // WebM / Matroska EBML: 0x1A, 0x45, 0xDF, 0xA3
  else if (sizeBytes >= 4 && bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
    detectedMime = 'video/webm';
    detectedExt = 'webm';
  }
  else if (VIDEO_LIMITS.ALLOWED_EXTENSIONS.includes(fileExt)) {
    detectedExt = fileExt;
    detectedMime = fileExt === 'webm' ? 'video/webm' : 'video/mp4';
  }

  if (!detectedMime) {
    const err = new Error(`Invalid or unsupported video file format (.${fileExt}). Please upload MP4 or WebM.`);
    err.code = 'VIDEO_INVALID';
    throw err;
  }

  const sha256 = await computeSha256Hex(bytes);

  return {
    valid: true,
    bytes,
    sizeBytes,
    mimeType: detectedMime,
    extension: detectedExt,
    sha256
  };
}
