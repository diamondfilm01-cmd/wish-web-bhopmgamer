/**
 * WishMagic Authentication Provider Module
 * Part 2: Cloudflare Native D1 Authentication & Cryptographic Fail-Closed Token Verification
 */

import { MASTER_ADMIN_EMAILS } from './session-service.js';

const DEFAULT_FIREBASE_PROJECT_ID = 'wish-magic-47944';
const DEFAULT_GOOGLE_OAUTH_CLIENT_ID = '206581825854-7v4s15i3ac3qckhnh8s7peol0173a74h.apps.googleusercontent.com';

const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const GOOGLE_OIDC_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

// In-memory JWK cache with TTL (1 hour)
const jwksCache = new Map();

/**
 * Computes a SHA-256 hash using the Web Crypto API
 */
export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${password}:wishmagic_secure_salt`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifies a candidate password against stored hash and salt
 */
export async function verifyPassword(password, expectedHash, salt) {
  if (!password || !expectedHash || !salt) return false;
  const computedHash = await hashPassword(password, salt);
  return computedHash === expectedHash;
}

/**
 * Decodes a Base64URL string into a UTF-8 JSON object
 */
function decodeBase64UrlJson(segment) {
  if (!segment || typeof segment !== 'string') return null;
  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padLen);
    const jsonPayload = decodeURIComponent(
      atob(padded)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

/**
 * Decodes a Base64URL string into a Uint8Array
 */
function decodeBase64UrlBytes(segment) {
  if (!segment || typeof segment !== 'string') return null;
  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padLen);
    const raw = atob(padded);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    return null;
  }
}

/**
 * Parses JWT header from a token
 */
export function parseJwtHeader(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  return decodeBase64UrlJson(parts[0]);
}

/**
 * Parses JWT claims from a token without external dependencies
 */
export function parseJwtClaims(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  return decodeBase64UrlJson(parts[1]);
}

/**
 * Fetches or resolves JWKS keys for cryptographic RS256 signature verification
 */
async function resolveProviderJwks(isFirebaseToken, env = {}) {
  if (env.JWKS && Array.isArray(env.JWKS.keys)) {
    return env.JWKS.keys;
  }
  if (isFirebaseToken && env.FIREBASE_JWKS && Array.isArray(env.FIREBASE_JWKS.keys)) {
    return env.FIREBASE_JWKS.keys;
  }
  if (!isFirebaseToken && env.GOOGLE_JWKS && Array.isArray(env.GOOGLE_JWKS.keys)) {
    return env.GOOGLE_JWKS.keys;
  }

  const jwksUrl = isFirebaseToken ? (env.FIREBASE_JWKS_URL || FIREBASE_JWKS_URL) : (env.GOOGLE_JWKS_URL || GOOGLE_OIDC_JWKS_URL);
  if (env.DISABLE_REMOTE_JWKS === true || env.DISABLE_REMOTE_JWKS === 'true') {
    return null;
  }

  const cached = jwksCache.get(jwksUrl);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.keys;
  }

  const fetchImpl = env.fetch || (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) return null;

  const res = await fetchImpl(jwksUrl, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });
  if (!res || !res.ok) {
    throw new Error(`JWKS endpoint returned HTTP ${res ? res.status : 'ERR'}`);
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.keys) || data.keys.length === 0) {
    throw new Error('JWKS endpoint returned invalid or empty key set');
  }
  jwksCache.set(jwksUrl, {
    keys: data.keys,
    expiresAt: now + 60 * 60 * 1000
  });
  return data.keys;
}

/**
 * Cryptographically verifies an RS256 JWT signature against a trusted JWK set
 */
export async function verifyJwtSignatureWithJwks(idToken, header, isFirebaseToken, env = {}) {
  const parts = idToken.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return { verified: false, error: 'AUTH_TOKEN_MALFORMED', message: 'Malformed JWT structure.' };
  }

  if (!header || header.alg !== 'RS256') {
    return {
      verified: false,
      error: 'AUTH_TOKEN_ALG_UNSUPPORTED',
      message: `Unsupported or insecure JWT signature algorithm: ${header?.alg || 'none'}. Expected RS256.`
    };
  }

  const signatureBytes = decodeBase64UrlBytes(parts[2]);
  if (!signatureBytes || signatureBytes.byteLength < 32) {
    return {
      verified: false,
      error: 'AUTH_TOKEN_SIGNATURE_INVALID',
      message: 'Token signature is missing or truncated.'
    };
  }

  let keys = null;
  try {
    keys = await resolveProviderJwks(isFirebaseToken, env);
  } catch (jwksErr) {
    return {
      verified: false,
      serviceUnavailable: true,
      error: 'AUTH_VERIFICATION_UNAVAILABLE',
      message: `Unable to fetch provider JWKS for signature verification: ${jwksErr.message}`
    };
  }

  if (!keys || keys.length === 0) {
    return {
      verified: false,
      noKeysConfigured: true,
      error: 'AUTH_VERIFICATION_UNAVAILABLE',
      message: 'No JWKS public keys available for cryptographic signature verification.'
    };
  }

  const candidateKeys = header.kid
    ? keys.filter(k => k.kid === header.kid && (k.kty === 'RSA' || !k.kty))
    : keys.filter(k => k.kty === 'RSA' || !k.kty);

  if (candidateKeys.length === 0) {
    return {
      verified: false,
      error: 'AUTH_TOKEN_SIGNATURE_INVALID',
      message: `No matching trusted public key found for kid "${header.kid || 'unspecified'}".`
    };
  }

  const signingInputBytes = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);

  for (const jwk of candidateKeys) {
    try {
      const cryptoKey = await crypto.subtle.importKey(
        'jwk',
        { kty: 'RSA', e: jwk.e, n: jwk.n, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      const isValid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        signatureBytes,
        signingInputBytes
      );
      if (isValid) {
        return { verified: true, kid: jwk.kid || null };
      }
    } catch (_) {}
  }

  return {
    verified: false,
    error: 'AUTH_TOKEN_SIGNATURE_INVALID',
    message: 'Cryptographic signature verification failed for authentication token.'
  };
}

/**
 * Verifies an ID token server-side with strict cryptographic signature / online provider verification.
 * Fails closed whenever signature/online verification fails or verification services are unavailable.
 * Never returns valid:true from unverified JWT payload decoding alone.
 */
export async function verifyToken(idToken, env = {}) {
  if (!idToken || typeof idToken !== 'string') {
    return { valid: false, error: 'AUTH_TOKEN_MISSING', message: 'No authentication token provided.' };
  }

  const parts = idToken.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return { valid: false, error: 'AUTH_TOKEN_MALFORMED', message: 'The provided authentication token is malformed.' };
  }

  const header = parseJwtHeader(idToken);
  const claims = parseJwtClaims(idToken);
  if (!header || !claims || typeof claims !== 'object') {
    return { valid: false, error: 'AUTH_TOKEN_MALFORMED', message: 'The provided authentication token is malformed.' };
  }

  // 1. Reject insecure/unsigned algorithms immediately
  if (!header.alg || String(header.alg).toLowerCase() === 'none' || header.alg !== 'RS256') {
    return {
      valid: false,
      error: 'AUTH_TOKEN_SIGNATURE_INVALID',
      message: `Invalid or untrusted JWT algorithm "${header.alg || 'none'}". Only RS256 signed tokens are accepted.`
    };
  }

  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
  const googleClientId = env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_OAUTH_CLIENT_ID;
  const expectedFirebaseIssuer = `https://securetoken.google.com/${projectId}`;
  const nowSec = Math.floor(Date.now() / 1000);

  // 2. Enforce strict Issuer (iss) and Audience (aud) matching together
  const isFirebaseIssuer = claims.iss === expectedFirebaseIssuer;
  const isGoogleOidcIssuer = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';

  if (!isFirebaseIssuer && !isGoogleOidcIssuer) {
    return {
      valid: false,
      error: 'AUTH_TOKEN_ISSUER_MISMATCH',
      message: 'Token issuer does not match authorized authority.'
    };
  }

  const isFirebaseAudValid = isFirebaseIssuer && claims.aud === projectId;
  const isGoogleOidcAudValid = isGoogleOidcIssuer && (claims.aud === googleClientId || claims.aud === projectId);

  if (!isFirebaseAudValid && !isGoogleOidcAudValid) {
    return {
      valid: false,
      error: 'AUTH_TOKEN_AUDIENCE_MISMATCH',
      message: 'Token audience does not match project configuration.'
    };
  }

  // 3. Enforce mandatory expiry (exp), issued-at (iat), not-before (nbf), and subject (sub) claims
  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) {
    return {
      valid: false,
      error: 'AUTH_TOKEN_INVALID',
      message: 'Token is missing required expiration (exp) claim.'
    };
  }
  if (claims.exp <= nowSec) {
    return {
      valid: false,
      error: 'AUTH_TOKEN_EXPIRED',
      message: 'Authentication session has expired. Please sign in again.'
    };
  }

  if (typeof claims.iat !== 'number' || !Number.isFinite(claims.iat) || claims.iat > (nowSec + 300)) {
    return {
      valid: false,
      error: 'AUTH_TOKEN_INVALID',
      message: 'Token has a missing or future issued-at (iat) timestamp.'
    };
  }

  if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > (nowSec + 60))) {
    return {
      valid: false,
      error: 'AUTH_TOKEN_INVALID',
      message: 'Token is not yet valid (nbf claim is in the future).'
    };
  }

  const subject = typeof claims.sub === 'string' ? claims.sub.trim() : '';
  const claimEmail = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (!subject || subject.length > 128 || !claimEmail || !claimEmail.includes('@')) {
    return {
      valid: false,
      error: 'AUTH_TOKEN_INVALID',
      message: 'Token missing required user identity subject (sub) or email claim.'
    };
  }

  // 4. Cryptographic Signature Verification via JWKS (if JWKS keys are configured or reachable)
  let jwksResult = { verified: false, noKeysConfigured: true };
  const hasExplicitJwks = Boolean(env.JWKS || env.FIREBASE_JWKS || env.GOOGLE_JWKS || env.FIREBASE_JWKS_URL || env.GOOGLE_JWKS_URL || env.ENFORCE_JWKS === true);
  const serverApiKey = env.FIREBASE_API_KEY || (typeof process !== 'undefined' && process.env?.FIREBASE_API_KEY) || null;

  if (hasExplicitJwks || !serverApiKey) {
    jwksResult = await verifyJwtSignatureWithJwks(idToken, header, isFirebaseIssuer, env);
    // If JWKS keys were loaded and signature verification explicitly failed, fail closed immediately
    if (!jwksResult.verified && !jwksResult.noKeysConfigured && !jwksResult.serviceUnavailable) {
      return {
        valid: false,
        error: jwksResult.error || 'AUTH_TOKEN_SIGNATURE_INVALID',
        message: jwksResult.message || 'Cryptographic signature verification failed.'
      };
    }
  }

  // 5. Online Verification via Google Identity Toolkit when FIREBASE_API_KEY is configured
  if (serverApiKey) {
    const fetchImpl = env.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!fetchImpl) {
      return {
        valid: false,
        error: 'AUTH_VERIFICATION_UNAVAILABLE',
        message: 'Authentication verification transport is unavailable.'
      };
    }

    try {
      const lookupRes = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${serverApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });

      if (lookupRes.status >= 500) {
        return {
          valid: false,
          error: 'AUTH_VERIFICATION_UNAVAILABLE',
          message: 'Authentication verification service is temporarily unavailable.'
        };
      }

      const lookupData = await lookupRes.json().catch(() => ({}));
      if (!lookupRes.ok || lookupData?.error || !Array.isArray(lookupData?.users) || lookupData.users.length === 0) {
        const errMsg = lookupData?.error?.message || 'INVALID_ID_TOKEN';
        return {
          valid: false,
          error: errMsg.includes('EXPIRED') ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID',
          message: 'Authentication token rejected by identity provider.'
        };
      }

      const u = lookupData.users[0];
      if (u.disabled) {
        return {
          valid: false,
          error: 'AUTH_USER_DISABLED',
          message: 'This user account has been disabled.'
        };
      }
      if (u.localId && u.localId !== subject) {
        return {
          valid: false,
          error: 'AUTH_TOKEN_SUBJECT_MISMATCH',
          message: 'Verified identity subject does not match token claims.'
        };
      }

      const resolvedEmail = (u.email || claimEmail).trim().toLowerCase();
      if (!resolvedEmail || !resolvedEmail.includes('@')) {
        return {
          valid: false,
          error: 'AUTH_TOKEN_INVALID',
          message: 'Verified account does not have a valid email address.'
        };
      }

      return {
        valid: true,
        uid: u.localId || subject,
        email: resolvedEmail,
        displayName: u.displayName || claims.name || '',
        avatarUrl: u.photoUrl || claims.picture || null,
        provider: u.providerUserInfo?.[0]?.providerId || claims.firebase?.sign_in_provider || 'google',
        verifiedBy: jwksResult.verified ? 'jwks+identitytoolkit' : 'identitytoolkit'
      };
    } catch (netErr) {
      // Fail closed when verification service is unreachable unless cryptographic JWKS verification already succeeded
      if (!jwksResult.verified) {
        return {
          valid: false,
          error: 'AUTH_VERIFICATION_UNAVAILABLE',
          message: 'Authentication verification service is currently unreachable. Failing closed.'
        };
      }
    }
  }

  // 6. If cryptographic JWKS signature verification succeeded, return verified identity
  if (jwksResult.verified) {
    return {
      valid: true,
      uid: subject,
      email: claimEmail,
      displayName: claims.name || '',
      avatarUrl: claims.picture || null,
      provider: claims.firebase?.sign_in_provider || (isGoogleOidcIssuer ? 'google.com' : 'google'),
      verifiedBy: 'jwks'
    };
  }

  // 7. Fail closed: never trust decoded JWT claims without cryptographic or online provider verification
  return {
    valid: false,
    error: jwksResult.error || 'AUTH_VERIFICATION_UNAVAILABLE',
    message: jwksResult.message || 'Authentication token could not be cryptographically verified (verification provider unavailable or unconfigured).'
  };
}

/**
 * Authenticates user credentials via D1 database with automatic migration fallback
 */
export async function authenticateWithPassword(db, email, password, env = {}) {
  const normEmail = (email || '').trim().toLowerCase();
  if (!normEmail || !password) {
    return { success: false, code: 'VALIDATION_ERROR', message: 'Email and password are required', status: 400 };
  }

  let userRecord = await db.prepare(
    'SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1'
  ).bind(normEmail).first().catch(() => null);

  // If user has local password hash in D1, verify locally
  if (userRecord && userRecord.password_hash && userRecord.password_salt) {
    const isValid = await verifyPassword(password, userRecord.password_hash, userRecord.password_salt);
    if (!isValid) {
      return { success: false, code: 'AUTH_FAILED', message: 'Incorrect email or password. Please verify and try again.', status: 401 };
    }
    return { success: true, user: userRecord };
  }

  // If server has FIREBASE_API_KEY configured in secrets, verify against Identity Toolkit and backfill D1 hash
  const serverApiKey = env.FIREBASE_API_KEY || (typeof process !== 'undefined' && process.env?.FIREBASE_API_KEY) || null;
  if (serverApiKey) {
    try {
      const fbRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${serverApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normEmail, password, returnSecureToken: true })
      });
      const fbData = await fbRes.json().catch(() => ({}));
      if (fbData.error) {
        return { success: false, code: 'AUTH_FAILED', message: 'Incorrect email or password. Please verify and try again.', status: 401 };
      }

      // Backfill password hash in D1
      const salt = crypto.randomUUID().replace(/-/g, '');
      const hash = await hashPassword(password, salt);
      if (userRecord) {
        await db.prepare(
          'UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?'
        ).bind(hash, salt, new Date().toISOString(), userRecord.id).run().catch(() => {});
      } else {
        const newUserId = `usr_fb_${fbData.localId}`;
        const nowIso = new Date().toISOString();
        const isMaster = MASTER_ADMIN_EMAILS.has(normEmail);
        await db.prepare(
          `INSERT OR REPLACE INTO users (id, email, display_name, avatar_url, role, plan, is_premium, provider, status, password_hash, password_salt, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'password', 'active', ?, ?, ?, ?)`
        ).bind(
          newUserId, normEmail, normEmail.split('@')[0],
          `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(normEmail)}`,
          isMaster ? 'admin' : 'creator', isMaster ? 'VIP' : 'Free', isMaster ? 1 : 0,
          hash, salt, nowIso, nowIso
        ).run().catch(() => {});
        userRecord = await db.prepare('SELECT * FROM users WHERE id = ?').bind(newUserId).first();
      }
      return { success: true, user: userRecord };
    } catch (netErr) {
      return { success: false, code: 'GATEWAY_ERROR', message: 'Authentication service temporarily unavailable.', status: 502 };
    }
  }

  // If user does not exist in D1 and no external provider configured
  if (!userRecord) {
    return { success: false, code: 'AUTH_FAILED', message: 'No account found with this email. Please sign up.', status: 401 };
  }

  return { success: false, code: 'AUTH_PASSWORD_NOT_SET', message: 'Password authentication not initialized for this account. Please use password reset.', status: 401 };
}

/**
 * Registers a new user with password in D1
 */
export async function registerWithPassword(db, { email, password, displayName }, env = {}) {
  const normEmail = (email || '').trim().toLowerCase();
  if (!normEmail || !password || password.length < 6) {
    return { success: false, code: 'VALIDATION_ERROR', message: 'Valid email and password (minimum 6 characters) required.', status: 400 };
  }

  const existing = await db.prepare(
    'SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1'
  ).bind(normEmail).first().catch(() => null);

  if (existing) {
    return { success: false, code: 'EMAIL_EXISTS', message: 'An account already exists with this email address. Please sign in instead.', status: 400 };
  }

  const salt = crypto.randomUUID().replace(/-/g, '');
  const hash = await hashPassword(password, salt);
  const newUserId = `usr_${crypto.randomUUID().replace(/-/g, '')}`;
  const nowIso = new Date().toISOString();
  const name = displayName ? displayName.trim() : normEmail.split('@')[0];
  const isMaster = MASTER_ADMIN_EMAILS.has(normEmail);

  // If FIREBASE_API_KEY is configured in secrets, optionally register with Firebase for compatibility
  const serverApiKey = env.FIREBASE_API_KEY || (typeof process !== 'undefined' && process.env?.FIREBASE_API_KEY) || null;
  if (serverApiKey) {
    try {
      await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${serverApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normEmail, password, returnSecureToken: true })
      }).catch(() => {});
    } catch (e) {}
  }

  await db.prepare(
    `INSERT INTO users (id, email, display_name, avatar_url, role, plan, is_premium, provider, status, password_hash, password_salt, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'password', 'active', ?, ?, ?, ?)`
  ).bind(
    newUserId, normEmail, name,
    `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(normEmail)}`,
    isMaster ? 'admin' : 'creator', isMaster ? 'VIP' : 'Free', isMaster ? 1 : 0,
    hash, salt, nowIso, nowIso
  ).run();

  const userRecord = await db.prepare('SELECT * FROM users WHERE id = ?').bind(newUserId).first();
  return { success: true, user: userRecord };
}
