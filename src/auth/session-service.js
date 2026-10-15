/**
 * WishMagic Enterprise Session & Authorization Service
 * Part 2 & Part 9: Server-Authoritative D1 Sessions & Admin Role Verification
 */

export const SESSION_COOKIE_NAME = 'wm_session';
export const DEFAULT_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const PRIMARY_OWNER_ADMIN_EMAIL = 'ankit.babusaini@gmail.com';

export const MASTER_ADMIN_EMAILS = new Set([
  PRIMARY_OWNER_ADMIN_EMAIL
]);

/**
 * Extracts a cookie value from the request Cookie header
 */
export function getCookie(request, name = SESSION_COOKIE_NAME) {
  if (!request) return null;
  const cookieHeader = request.headers && typeof request.headers.get === 'function'
    ? request.headers.get('Cookie')
    : (request.headers?.cookie || request.headers?.Cookie || null);
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

/**
 * Generates an HttpOnly, SameSite=Lax, Secure session cookie string
 */
export function createSessionCookie(token, maxAgeSeconds = 30 * 24 * 60 * 60) {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAgeSeconds}`;
}

/**
 * Generates a session cookie expiration header string
 */
export function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/**
 * Creates a persistent session record in D1
 */
export async function createSession(db, userId, durationMs = DEFAULT_SESSION_DURATION_MS) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('D1 database binding DB is required for session creation');
  }
  const sessionToken = 'wm_tok_' + crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
  const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '');
  const now = Date.now();
  const expiresAt = now + durationMs;
  const createdIso = new Date(now).toISOString();

  await db.prepare(
    'INSERT OR REPLACE INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(sessionId, userId, sessionToken, expiresAt, createdIso).run();

  return { sessionId, sessionToken, expiresAt };
}

/**
 * Validates a session token against D1 and returns the authenticated user record
 */
export async function getSessionUser(db, token) {
  if (!token || typeof token !== 'string') return null;
  if (!db || typeof db.prepare !== 'function') return null;

  const now = Date.now();
  try {
    const sessionRow = await db.prepare(
      `SELECT s.id as session_id, s.expires_at, u.id, u.email, u.display_name, u.avatar_url, u.role, u.plan, u.is_premium, u.status
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > ?
       LIMIT 1`
    ).bind(token, now).first();

    if (!sessionRow) return null;
    if (sessionRow.status === 'suspended' || sessionRow.status === 'deactivated') {
      return null;
    }

    return {
      id: sessionRow.id,
      email: sessionRow.email,
      displayName: sessionRow.display_name,
      avatarUrl: sessionRow.avatar_url,
      role: sessionRow.role || 'creator',
      plan: sessionRow.plan || 'Free',
      isPremium: Boolean(sessionRow.is_premium),
      status: sessionRow.status || 'active',
      sessionId: sessionRow.session_id
    };
  } catch (err) {
    console.warn('[SessionService Error]', err.message);
    return null;
  }
}

/**
 * Revokes a session token in D1
 */
export async function revokeSession(db, token) {
  if (!token || !db || typeof db.prepare !== 'function') return false;
  try {
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Revokes all sessions for a user
 */
export async function revokeAllUserSessions(db, userId) {
  if (!userId || !db || typeof db.prepare !== 'function') return false;
  try {
    await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Server-authoritative check for administrative privileges
 * Never trusts client request bodies or claims without database / primary identity verification
 */
export async function verifyAdminRole(user, env = {}, db = null) {
  if (!user || !user.email) return false;
  if (user.status === 'suspended' || user.status === 'deactivated') return false;

  const normEmail = user.email.trim().toLowerCase();
  const primaryAdmin = (env.PRIMARY_ADMIN_EMAIL || '').trim().toLowerCase();

  // 1. Check canonical owner-admin email policy
  if (MASTER_ADMIN_EMAILS.has(normEmail) || (primaryAdmin && normEmail === primaryAdmin)) {
    return true;
  }

  // 2. Check role on user object if already resolved from DB
  if (user.role === 'admin' || user.role === 'superadmin') {
    return true;
  }

  // 3. Check authoritative admin_roles table in D1
  const activeDb = db || env.DB;
  if (activeDb && typeof activeDb.prepare === 'function') {
    try {
      const roleRow = await activeDb.prepare(
        "SELECT role FROM admin_roles WHERE user_id = ? AND status = 'active' LIMIT 1"
      ).bind(user.id).first();
      if (roleRow && (roleRow.role === 'admin' || roleRow.role === 'superadmin')) {
        return true;
      }
    } catch (e) {}
  }

  return false;
}
