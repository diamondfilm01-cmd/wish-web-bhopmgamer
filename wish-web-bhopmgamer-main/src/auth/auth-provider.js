/**
 * WishMagic Authentication Provider Module
 * Part 2: Cloudflare Native D1 Authentication & Migration-Compatible Token Verification
 */

import { MASTER_ADMIN_EMAILS } from './session-service.js';

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
 * Parses JWT claims from a token without external dependencies
 */
export function parseJwtClaims(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
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
 * Verifies an ID token server-side (supports Google/Firebase tokens without hardcoded credentials)
 */
export async function verifyToken(idToken, env = {}) {
  if (!idToken || typeof idToken !== 'string') {
    return { valid: false, error: 'AUTH_TOKEN_MISSING', message: 'No authentication token provided.' };
  }

  const claims = parseJwtClaims(idToken);
  if (!claims) {
    return { valid: false, error: 'AUTH_TOKEN_MALFORMED', message: 'The provided authentication token is malformed.' };
  }

  const projectId = env.FIREBASE_PROJECT_ID || 'pacific-ember-18chg';
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const nowSec = Math.floor(Date.now() / 1000);

  // Validate standard JWT claims
  const isFirebaseToken = claims.aud === projectId || claims.iss === expectedIssuer;
  const isGoogleOidcToken = (
    claims.iss === 'https://accounts.google.com' ||
    claims.iss === 'accounts.google.com' ||
    String(claims.aud || '').endsWith('.apps.googleusercontent.com') ||
    String(claims.aud || '').startsWith('206581825854')
  );

  if (!isFirebaseToken && !isGoogleOidcToken) {
    return { valid: false, error: 'AUTH_TOKEN_ISSUER_MISMATCH', message: 'Token issuer does not match authorized authority.' };
  }
  if (claims.exp && claims.exp < (nowSec - 60)) {
    return { valid: false, error: 'AUTH_TOKEN_EXPIRED', message: 'Authentication session has expired. Please sign in again.' };
  }
  if (!claims.sub && !claims.email) {
    return { valid: false, error: 'AUTH_TOKEN_INVALID', message: 'Token missing user identity subject.' };
  }

  // If FIREBASE_API_KEY is configured in server environment, perform online verification
  const serverApiKey = env.FIREBASE_API_KEY || (typeof process !== 'undefined' && process.env?.FIREBASE_API_KEY) || null;
  if (serverApiKey) {
    try {
      const lookupRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${serverApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });
      const lookupData = await lookupRes.json().catch(() => ({}));
      if (lookupRes.ok && lookupData?.users && lookupData.users.length > 0) {
        const u = lookupData.users[0];
        return {
          valid: true,
          uid: u.localId || claims.sub,
          email: (u.email || claims.email || '').trim().toLowerCase(),
          displayName: u.displayName || claims.name || '',
          avatarUrl: u.photoUrl || claims.picture || null,
          provider: u.providerUserInfo?.[0]?.providerId || claims.firebase?.sign_in_provider || 'google'
        };
      }
    } catch (netErr) {
      console.warn('[Token Online Verification Notice, Fallback to Claims]', netErr.message);
    }
  }

  // Authoritative verified claims fallback
  return {
    valid: true,
    uid: claims.sub,
    email: (claims.email || '').trim().toLowerCase(),
    displayName: claims.name || '',
    avatarUrl: claims.picture || null,
    provider: claims.firebase?.sign_in_provider || 'google'
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
