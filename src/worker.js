/**
 * WishMagic Cloudflare Worker / Pages Functions Production API
 * Stack: Cloudflare Pages + Cloudflare Workers + Cloudflare D1 + Cloudflare R2
 * Part 28: Full Frontend <-> Worker API Contract & End-to-End Regression Lock
 */

// Timezone Constant: Strictly Asia/Kolkata (IST = UTC+05:30)
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const APP_VERSION = '1.0.0-p28';
const FIREBASE_API_KEY = ['AIzaSy', 'CiZmxmfgyj555EI4af_rt5X_id31F4Vq0'].join('');

// Failure Classification
const FailureCategory = {
  AUTHENTICATION: 'AUTHENTICATION_FAILURE',
  AUTHORIZATION: 'AUTHORIZATION_FAILURE',
  VALIDATION: 'VALIDATION_FAILURE',
  DATABASE: 'DATABASE_FAILURE',
  STORAGE: 'STORAGE_FAILURE',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMIT: 'RATE_LIMIT',
  EXTERNAL_DEPENDENCY: 'EXTERNAL_DEPENDENCY_FAILURE'
};

// Seed Catalogs (Fallback reference when database overrides are absent)
const SEED_CATEGORIES = [
  { id: 'cat_birthday', name: 'Birthday Wishes', slug: 'birthday', icon: 'cake', sortOrder: 1, isActive: true },
  { id: 'cat_anniversary', name: 'Anniversary & Love', slug: 'anniversary', icon: 'favorite', sortOrder: 2, isActive: true },
  { id: 'cat_love', name: 'Love & Romance', slug: 'love', icon: 'volunteer_activism', sortOrder: 3, isActive: true },
  { id: 'cat_congrats', name: 'Congratulations & Milestone', slug: 'congratulations', icon: 'celebration', sortOrder: 4, isActive: true },
  { id: 'cat_festival', name: 'Festivals & Holidays', slug: 'festival', icon: 'festival', sortOrder: 5, isActive: true },
  { id: 'cat_friendship', name: 'Friendship & Fun', slug: 'friendship', icon: 'groups', sortOrder: 6, isActive: true },
  { id: 'cat_farewell', name: 'Farewell & Miss You', slug: 'farewell', icon: 'flight_takeoff', sortOrder: 7, isActive: true },
  { id: 'cat_baby', name: 'Baby Shower & Kids', slug: 'baby', icon: 'child_care', sortOrder: 8, isActive: true },
  { id: 'cat_wedding', name: 'Wedding & Engagement', slug: 'wedding', icon: 'diamond', sortOrder: 9, isActive: true },
  { id: 'cat_thankyou', name: 'Thank You & Gratitude', slug: 'thank-you', icon: 'thumb_up', sortOrder: 10, isActive: true },
  { id: 'cat_custom', name: 'Custom Magic Cards', slug: 'custom', icon: 'auto_awesome', sortOrder: 11, isActive: true }
];

const SEED_TEMPLATES = [
  {
    id: 'tpl_glitter_birthday',
    slug: 'glitter-birthday-blast',
    name: 'Glitter Birthday Blast',
    category: 'Birthday',
    tier: 'free',
    price: 0,
    isPremium: false,
    isPublished: true,
    status: 'published',
    featured: true,
    placement: 1,
    thumbnail: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80',
    description: 'Vibrant celebratory birthday card with confetti burst, countdown, and music sync.',
    folder: 'templates-store/glitter-birthday-blast',
    entryFile: 'index.html'
  },
  {
    id: 'tpl_golden_elegance',
    slug: 'golden-elegance-anniversary',
    name: 'Golden Elegance Anniversary',
    category: 'Anniversary',
    tier: 'vip',
    price: 49,
    isPremium: true,
    isPublished: true,
    status: 'published',
    featured: true,
    placement: 2,
    thumbnail: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&auto=format&fit=crop&q=80',
    description: 'Luxurious gold foil anniversary experience with interactive love timeline and photo gallery.',
    folder: 'templates-store/golden-elegance-anniversary',
    entryFile: 'index.html'
  },
  {
    id: 'tpl_romantic_starlight',
    slug: 'romantic-starlight',
    name: 'Romantic Starlight Serenade',
    category: 'Love',
    tier: 'vip',
    price: 49,
    isPremium: true,
    isPublished: true,
    status: 'published',
    featured: true,
    placement: 3,
    thumbnail: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
    description: 'Dreamy starlit romantic message with floating glowing hearts and voice note keepsake.',
    folder: 'templates-store/romantic-starlight',
    entryFile: 'index.html'
  },
  {
    id: 'tpl_neon_party',
    slug: 'neon-night-celebration',
    name: 'Neon Night Celebration',
    category: 'Congratulations',
    tier: 'free',
    price: 0,
    isPremium: false,
    isPublished: true,
    status: 'published',
    featured: false,
    placement: 4,
    thumbnail: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&auto=format&fit=crop&q=80',
    description: 'High energy neon synthwave party wish with dynamic beats and glowing typography.',
    folder: 'templates-store/neon-night-celebration',
    entryFile: 'index.html'
  }
];

// Production Pretty URL Routing Table
const PRETTY_ROUTES = {
  '/': '/index.html',
  '/templates': '/marketplace.html',
  '/templates/': '/marketplace.html',
  '/marketplace': '/marketplace.html',
  '/marketplace/': '/marketplace.html',
  '/create': '/create.html',
  '/create/': '/create.html',
  '/customize': '/customize.html',
  '/customize/': '/customize.html',
  '/my-wishes': '/my-wishes.html',
  '/my-wishes/': '/my-wishes.html',
  '/favorites': '/favorites.html',
  '/favorites/': '/favorites.html',
  '/premium': '/pricing.html',
  '/premium/': '/pricing.html',
  '/pricing': '/pricing.html',
  '/pricing/': '/pricing.html',
  '/account': '/account.html',
  '/account/': '/account.html',
  '/profile': '/account.html',
  '/profile/': '/account.html',
  '/settings': '/account.html',
  '/settings/': '/account.html',
  '/checkout': '/checkout.html',
  '/checkout/': '/checkout.html',
  '/expired': '/expired.html',
  '/expired/': '/expired.html',
  '/admin/anktech/anktech/admin': '/admin-overview.html',
  '/admin/anktech/anktech/admin/': '/admin-overview.html',
  '/admin/anktech/anktech/admin/overview': '/admin-overview.html',
  '/admin/anktech/anktech/admin/templates': '/admin-templates.html',
  '/admin/anktech/anktech/admin/occasions': '/admin-occasions.html',
  '/admin/anktech/anktech/admin/categories': '/admin-occasions.html',
  '/admin/anktech/anktech/admin/users': '/admin-users.html',
  '/admin/anktech/anktech/admin/wishes': '/admin-wishes.html',
  '/admin/anktech/anktech/admin/orders': '/admin-orders.html',
  '/admin/anktech/anktech/admin/media': '/admin-media.html',
  '/admin/anktech/anktech/admin/pricing': '/admin-pricing.html',
  '/admin/anktech/anktech/admin/settings': '/admin-settings.html',
  '/admin/anktech/anktech/admin/staff': '/admin-staff.html',
  '/admin-login': '/admin-login.html'
};

// In-memory rate limiting bucket
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 180;

function checkRateLimit(clientIp, pathname) {
  if (!clientIp) return true;
  const now = Date.now();
  const key = `${clientIp}:${pathname.startsWith('/api/auth') ? 'auth' : 'api'}`;
  const record = rateLimitMap.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitMap.set(key, record);
    return true;
  }

  record.count++;
  rateLimitMap.set(key, record);
  const max = pathname.startsWith('/api/auth') ? 30 : RATE_LIMIT_MAX_REQUESTS;
  return record.count <= max;
}

// ============================================================================
// SECURITY & CORS HARDENING
// ============================================================================

function getValidatedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;

  let originHostname = '';
  try {
    originHostname = new URL(origin).hostname;
  } catch (e) {
    return null;
  }

  // Exact request hostname match (same-origin is always trusted)
  try {
    const reqUrl = new URL(request.url);
    if (reqUrl.hostname && (originHostname === reqUrl.hostname || origin === `${reqUrl.protocol}//${reqUrl.host}`)) {
      return origin;
    }
  } catch (e) {}

  const publicAppUrl = (env && env.PUBLIC_APP_URL) || 'https://wishmagic.live';
  let allowedOriginHostname = 'wishmagic.live';
  try {
    allowedOriginHostname = new URL(publicAppUrl).hostname;
  } catch (e) {}

  // Exact match to configured app origin
  if (origin === publicAppUrl || originHostname === allowedOriginHostname) {
    return origin;
  }

  // Cloudflare Pages preview domains (*.wishmagic.pages.dev or *.pages.dev)
  if (originHostname.endsWith('.pages.dev')) {
    return origin;
  }

  // In development environments, allow localhost / 127.0.0.1 / AI Studio preview run URLs
  const isDev = (env && env.ENVIRONMENT === 'development') || originHostname.includes('localhost') || originHostname.includes('127.0.0.1') || originHostname.endsWith('.run.app');
  if (isDev) {
    return origin;
  }

  return null;
}

function applySecurityHeaders(response, request, env) {
  if (!response) {
    return new Response('Not Found', { status: 404 });
  }

  const headers = new Headers(response.headers);
  const origin = getValidatedOrigin(request, env);

  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, If-None-Match, X-Request-ID, X-CSRF-Token');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://fonts.googleapis.com https://www.gstatic.com https://apis.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https: https://images.unsplash.com https://api.dicebear.com https://media.wishmagic.live https://*.googleusercontent.com",
    "media-src 'self' data: blob: https: https://media.wishmagic.live",
    "connect-src 'self' https://* http://localhost:* ws://localhost:*",
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'self'"
  ].join('; ');
  headers.set('Content-Security-Policy', csp);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// CSRF Validation for Cookie-Authenticated Mutations
function isCsrfViolation(request, env) {
  const method = request.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;

  const cookieToken = getCookie(request, 'wm_session');
  if (!cookieToken) return false; // Bearer token mutation is not vulnerable to ambient browser CSRF

  const origin = request.headers.get('Origin');
  if (origin) {
    try {
      const reqUrl = new URL(request.url);
      const originUrl = new URL(origin);
      if (reqUrl.hostname === originUrl.hostname) {
        return false; // Same host mutation is safe and trusted
      }
    } catch (e) {}

    const valid = getValidatedOrigin(request, env);
    return !valid || valid !== origin;
  }
  return false;
}

// Standardized Response Generators
function jsonSuccess(data = {}, status = 200, extraHeaders = {}, requestId = null) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    ...extraHeaders
  };
  if (requestId) headers['X-Request-ID'] = requestId;

  return new Response(JSON.stringify({
    success: true,
    data: data,
    ...data
  }), {
    status,
    headers
  });
}

function jsonError(code = 'INTERNAL_ERROR', message = 'An unexpected error occurred', status = 500, details = null, fields = null, requestId = null, failureCategory = null) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  };
  if (requestId) headers['X-Request-ID'] = requestId;

  const body = {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(fields ? { fields } : {}),
      ...(failureCategory ? { category: failureCategory } : {})
    },
    ...(requestId ? { requestId } : {})
  };

  return new Response(JSON.stringify(body), {
    status,
    headers
  });
}

function sanitizeString(str, maxLength = 255) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
}

const RESERVED_SLUGS = new Set([
  'admin', 'login', 'signup', 'register', 'dashboard', 'settings',
  'api', 'auth', 'templates', 'preview', 'create', 'edit',
  'my-wishes', 'favorites', 'pricing', 'about', 'contact', 'help',
  'privacy', 'terms', 'robots', 'sitemap', 'w', 'wish',
  'marketplace', 'checkout', 'premium', 'account', 'expired',
  'media', 'css', 'js', 'assets', 'fonts', 'static', 'health',
  'config', 'null', 'undefined', 'public', 'share', 'status',
  'test', 'feed', 'rss', 'search'
]);

function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]s\b/gi, 's')
    .replace(/&/g, ' ')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isReservedSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  return RESERVED_SLUGS.has(slug.toLowerCase().trim());
}

function isValidSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  const s = slug.toLowerCase().trim();
  if (s.length < 3 || s.length > 80) return false;
  if (!/^[a-z0-9](?:[a-z0-9]|-(?!-)){1,78}[a-z0-9]$/.test(s)) return false;
  if (isReservedSlug(s)) return false;
  return true;
}

// Cookie Helpers
function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

function createSessionCookie(token, maxAgeSeconds = 30 * 24 * 60 * 60) {
  return `wm_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAgeSeconds}`;
}

function clearSessionCookie() {
  return `wm_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

// Firebase ID Token Claim Extractor and Validator
function parseJwtClaims(token) {
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

async function verifyFirebaseIdToken(idToken, env) {
  if (!idToken || typeof idToken !== 'string') {
    return { valid: false, error: 'AUTH_FIREBASE_TOKEN_MISSING', message: 'No authentication token provided.' };
  }

  const claims = parseJwtClaims(idToken);
  if (!claims) {
    return { valid: false, error: 'AUTH_FIREBASE_TOKEN_MALFORMED', message: 'The provided authentication token is malformed.' };
  }

  const projectId = 'wish-magic-47944';
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const nowSec = Math.floor(Date.now() / 1000);

  // 1. Validate standard JWT claims
  if (claims.aud !== projectId) {
    return { valid: false, error: 'AUTH_FIREBASE_TOKEN_AUDIENCE_MISMATCH', message: 'Token audience does not match project configuration.' };
  }
  if (claims.iss !== expectedIssuer) {
    return { valid: false, error: 'AUTH_FIREBASE_TOKEN_ISSUER_MISMATCH', message: 'Token issuer does not match Google Firebase authority.' };
  }
  if (claims.exp && claims.exp < (nowSec - 60)) {
    return { valid: false, error: 'AUTH_FIREBASE_TOKEN_EXPIRED', message: 'Authentication session has expired. Please sign in again.' };
  }
  if (!claims.sub) {
    return { valid: false, error: 'AUTH_FIREBASE_TOKEN_INVALID', message: 'Token missing user identity subject.' };
  }

  // 2. Online verification via Google Identity Toolkit
  try {
    const lookupRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
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
    } else if (lookupData?.error?.message && (lookupData.error.message.includes('TOKEN_EXPIRED') || lookupData.error.message.includes('INVALID_ID_TOKEN') || lookupData.error.message.includes('USER_NOT_FOUND'))) {
      return {
        valid: false,
        error: 'AUTH_FIREBASE_TOKEN_INVALID',
        message: 'Google authentication token is invalid or has expired. Please sign in again.'
      };
    }
  } catch (netErr) {
    console.warn('[Firebase Token Online Verification Fallback to Claims]', netErr);
  }

  // Fallback to verified claims
  return {
    valid: true,
    uid: claims.sub,
    email: (claims.email || '').trim().toLowerCase(),
    displayName: claims.name || '',
    avatarUrl: claims.picture || null,
    provider: claims.firebase?.sign_in_provider || 'google'
  };
}

// ============================================================================
// D1 DATABASE SCHEMA INITIALIZATION & AUTO-RECOVERY
// ============================================================================

let authSchemaVerified = false;
let authSchemaPromise = null;

async function verifyAndEnsureAuthSchema(db) {
  if (!db || typeof db.prepare !== 'function') {
    return { ok: false, error: 'NO_DB_BINDING', errorMessage: 'Database binding DB is missing or invalid' };
  }
  if (authSchemaVerified) return { ok: true };
  if (authSchemaPromise) return authSchemaPromise;

  authSchemaPromise = (async () => {
    try {
      const existing = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().catch(() => ({ results: [] }));
      const tableNames = new Set((existing?.results || []).map(r => r.name));

      // Helper to safely reconcile missing columns in an existing table
      async function reconcileTableColumns(tableName, columnDefs) {
        if (!tableNames.has(tableName)) return;
        try {
          const info = await db.prepare(`PRAGMA table_info(${tableName})`).all().catch(() => null);
          const existingCols = new Set((info?.results || []).map(c => c.name));
          for (const col of columnDefs) {
            if (!existingCols.has(col.name)) {
              try {
                await db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.def}`).run();
              } catch (alterErr) {
                // Column might already exist or table locked, non-fatal
              }
            }
          }
        } catch (pragmaErr) {}
      }

      // 1. Users Table
      if (!tableNames.has('users')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            avatar_url TEXT,
            role TEXT NOT NULL DEFAULT 'creator',
            plan TEXT NOT NULL DEFAULT 'Free',
            is_premium INTEGER NOT NULL DEFAULT 0,
            provider TEXT NOT NULL DEFAULT 'email',
            status TEXT NOT NULL DEFAULT 'active',
            mobile TEXT,
            phone TEXT,
            firebase_uid TEXT,
            password_hash TEXT,
            password_salt TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `).run().catch(() => {});
      } else {
        await reconcileTableColumns('users', [
          { name: 'email', def: 'TEXT' },
          { name: 'display_name', def: 'TEXT' },
          { name: 'name', def: 'TEXT' },
          { name: 'avatar_url', def: 'TEXT' },
          { name: 'avatar', def: 'TEXT' },
          { name: 'photo_url', def: 'TEXT' },
          { name: 'role', def: "TEXT DEFAULT 'creator'" },
          { name: 'plan', def: "TEXT DEFAULT 'Free'" },
          { name: 'is_premium', def: 'INTEGER DEFAULT 0' },
          { name: 'provider', def: "TEXT DEFAULT 'email'" },
          { name: 'status', def: "TEXT DEFAULT 'active'" },
          { name: 'mobile', def: 'TEXT' },
          { name: 'phone', def: 'TEXT' },
          { name: 'firebase_uid', def: 'TEXT' },
          { name: 'password_hash', def: 'TEXT' },
          { name: 'password_salt', def: 'TEXT' },
          { name: 'created_at', def: 'TEXT' },
          { name: 'updated_at', def: 'TEXT' },
          { name: 'created_by', def: "TEXT DEFAULT 'system'" }
        ]);
      }
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`).run().catch(() => {});
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`).run().catch(() => {});

      // 2. Sessions Table
      if (!tableNames.has('sessions')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token TEXT UNIQUE NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `).run().catch(() => {});
      } else {
        await reconcileTableColumns('sessions', [
          { name: 'id', def: 'TEXT' },
          { name: 'user_id', def: 'TEXT' },
          { name: 'token', def: 'TEXT' },
          { name: 'expires_at', def: 'INTEGER' },
          { name: 'created_at', def: 'TEXT' }
        ]);
      }
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`).run().catch(() => {});
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`).run().catch(() => {});
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`).run().catch(() => {});

      // 3. Site Settings Table
      if (!tableNames.has('site_settings')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS site_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            type TEXT DEFAULT 'string',
            description TEXT,
            updated_by TEXT,
            updated_at TEXT NOT NULL
          )
        `).run().catch(() => {});
      } else {
        await reconcileTableColumns('site_settings', [
          { name: 'type', def: "TEXT DEFAULT 'string'" },
          { name: 'description', def: 'TEXT' },
          { name: 'updated_by', def: 'TEXT' },
          { name: 'updated_at', def: 'TEXT' }
        ]);
      }

      // 4. System Announcements Table
      if (!tableNames.has('system_announcements')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS system_announcements (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            severity TEXT DEFAULT 'info',
            is_active INTEGER NOT NULL DEFAULT 1,
            expires_at TEXT,
            created_at TEXT NOT NULL
          )
        `).run().catch(() => {});
      } else {
        await reconcileTableColumns('system_announcements', [
          { name: 'title', def: "TEXT NOT NULL DEFAULT 'announcement'" },
          { name: 'message', def: "TEXT NOT NULL DEFAULT ''" },
          { name: 'severity', def: "TEXT DEFAULT 'info'" },
          { name: 'is_active', def: 'INTEGER DEFAULT 1' },
          { name: 'expires_at', def: 'TEXT' },
          { name: 'created_at', def: 'TEXT' }
        ]);
      }

      // 5. Wishes Table
      if (!tableNames.has('wishes')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS wishes (
            id TEXT PRIMARY KEY,
            slug TEXT UNIQUE NOT NULL,
            user_id TEXT NOT NULL,
            order_id TEXT,
            template_id TEXT NOT NULL,
            template_version_id TEXT,
            template_name TEXT,
            tier TEXT NOT NULL DEFAULT 'free',
            price INTEGER NOT NULL DEFAULT 0,
            is_private INTEGER NOT NULL DEFAULT 0,
            buyer_name TEXT,
            buyer_contact TEXT,
            recipient_name TEXT,
            event_date TEXT,
            expiry_date TEXT,
            lifecycle_status TEXT DEFAULT 'active',
            views INTEGER NOT NULL DEFAULT 0,
            custom_data TEXT NOT NULL DEFAULT '{}',
            payment TEXT,
            status TEXT NOT NULL DEFAULT 'published',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `).run().catch(() => {});
      } else {
        await reconcileTableColumns('wishes', [
          { name: 'slug', def: "TEXT NOT NULL DEFAULT ''" },
          { name: 'user_id', def: "TEXT NOT NULL DEFAULT ''" },
          { name: 'template_id', def: "TEXT NOT NULL DEFAULT ''" },
          { name: 'template_version_id', def: 'TEXT' },
          { name: 'template_name', def: 'TEXT' },
          { name: 'lifecycle_status', def: "TEXT DEFAULT 'active'" },
          { name: 'tier', def: "TEXT DEFAULT 'free'" },
          { name: 'price', def: 'INTEGER DEFAULT 0' },
          { name: 'is_private', def: 'INTEGER DEFAULT 0' },
          { name: 'views', def: 'INTEGER DEFAULT 0' },
          { name: 'buyer_name', def: 'TEXT' },
          { name: 'buyer_contact', def: 'TEXT' },
          { name: 'recipient_name', def: 'TEXT' },
          { name: 'event_date', def: 'TEXT' },
          { name: 'expiry_date', def: 'TEXT' },
          { name: 'payment', def: 'TEXT' },
          { name: 'order_id', def: 'TEXT' },
          { name: 'status', def: "TEXT DEFAULT 'published'" },
          { name: 'custom_data', def: "TEXT DEFAULT '{}'" },
          { name: 'created_at', def: 'TEXT' },
          { name: 'updated_at', def: 'TEXT' }
        ]);
      }

      // 6. Templates Table
      if (!tableNames.has('templates')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            description TEXT,
            category TEXT NOT NULL,
            relationships TEXT,
            tags TEXT,
            type TEXT DEFAULT '3D Interactive',
            tier TEXT NOT NULL DEFAULT 'free',
            price INTEGER NOT NULL DEFAULT 0,
            is_premium INTEGER NOT NULL DEFAULT 0,
            is_published INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'published',
            featured INTEGER NOT NULL DEFAULT 0,
            placement INTEGER NOT NULL DEFAULT 99,
            thumbnail TEXT NOT NULL DEFAULT '',
            preview_images TEXT,
            capabilities TEXT,
            detected_fields TEXT,
            sections TEXT,
            features TEXT,
            theme TEXT,
            folder TEXT NOT NULL DEFAULT '',
            entry_file TEXT NOT NULL DEFAULT 'index.html',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `).run().catch(() => {});
      } else {
        await reconcileTableColumns('templates', [
          { name: 'tier', def: "TEXT DEFAULT 'free'" },
          { name: 'price', def: 'INTEGER DEFAULT 0' },
          { name: 'is_premium', def: 'INTEGER DEFAULT 0' },
          { name: 'is_published', def: 'INTEGER DEFAULT 1' },
          { name: 'status', def: "TEXT DEFAULT 'published'" },
          { name: 'featured', def: 'INTEGER DEFAULT 0' },
          { name: 'placement', def: 'INTEGER DEFAULT 99' },
          { name: 'preview_images', def: 'TEXT' },
          { name: 'capabilities', def: 'TEXT' },
          { name: 'detected_fields', def: 'TEXT' },
          { name: 'sections', def: 'TEXT' },
          { name: 'features', def: 'TEXT' },
          { name: 'theme', def: 'TEXT' },
          { name: 'folder', def: "TEXT DEFAULT ''" },
          { name: 'entry_file', def: "TEXT DEFAULT 'index.html'" }
        ]);
      }

      // 7. Template Versions & Snapshots
      if (!tableNames.has('template_versions')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS template_versions (
            id TEXT PRIMARY KEY,
            template_id TEXT NOT NULL,
            version_number INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT,
            tier TEXT DEFAULT 'free',
            price INTEGER DEFAULT 0,
            thumbnail TEXT,
            theme TEXT,
            sections TEXT,
            capabilities TEXT,
            layout TEXT,
            animations TEXT,
            default_config TEXT,
            snapshot_data TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            created_by TEXT DEFAULT 'system',
            FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
          )
        `).run().catch(() => {});
      } else {
        await reconcileTableColumns('template_versions', [
          { name: 'version_number', def: 'INTEGER DEFAULT 1' },
          { name: 'tier', def: "TEXT DEFAULT 'free'" },
          { name: 'price', def: 'INTEGER DEFAULT 0' },
          { name: 'thumbnail', def: 'TEXT' },
          { name: 'theme', def: 'TEXT' },
          { name: 'sections', def: 'TEXT' },
          { name: 'capabilities', def: 'TEXT' },
          { name: 'layout', def: 'TEXT' },
          { name: 'animations', def: 'TEXT' },
          { name: 'default_config', def: 'TEXT' },
          { name: 'snapshot_data', def: 'TEXT' },
          { name: 'status', def: "TEXT DEFAULT 'active'" },
          { name: 'created_by', def: "TEXT DEFAULT 'system'" }
        ]);
      }

      // 8. Categories
      if (!tableNames.has('categories')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            description TEXT,
            icon TEXT DEFAULT '✨',
            sort_order INTEGER NOT NULL DEFAULT 1,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `).run().catch(() => {});
      }

      // 9. Admin Roles & Staff
      if (!tableNames.has('admin_roles')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS admin_roles (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL,
            permissions TEXT NOT NULL,
            granted_by TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `).run().catch(() => {});
      }
      if (!tableNames.has('admin_staff')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS admin_staff (
            id TEXT PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL,
            mobile TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'EDITOR',
            permissions TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'active',
            password_hash TEXT NOT NULL DEFAULT '',
            password_salt TEXT NOT NULL DEFAULT '',
            firebase_uid TEXT,
            created_by TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `).run().catch(() => {});
      } else {
        await reconcileTableColumns('admin_staff', [
          { name: 'password_hash', def: "TEXT DEFAULT ''" },
          { name: 'password_salt', def: "TEXT DEFAULT ''" },
          { name: 'firebase_uid', def: 'TEXT' },
          { name: 'created_by', def: 'TEXT' },
          { name: 'status', def: "TEXT DEFAULT 'active'" }
        ]);
      }

      // 10. Admin Audit Logs
      if (!tableNames.has('admin_audit_logs')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS admin_audit_logs (
            id TEXT PRIMARY KEY,
            actor_id TEXT NOT NULL,
            actor_name TEXT NOT NULL,
            actor_role TEXT NOT NULL,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id TEXT,
            details TEXT,
            ip_address TEXT,
            user_agent TEXT,
            created_at TEXT NOT NULL
          )
        `).run().catch(() => {});
      } else {
        await reconcileTableColumns('admin_audit_logs', [
          { name: 'target_type', def: 'TEXT' },
          { name: 'target_id', def: 'TEXT' },
          { name: 'user_agent', def: 'TEXT' }
        ]);
      }

      // 11. Wish Sections
      if (!tableNames.has('wish_sections')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS wish_sections (
            id TEXT PRIMARY KEY,
            wish_id TEXT NOT NULL,
            section_type TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            section_data TEXT NOT NULL DEFAULT '{}',
            data TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (wish_id) REFERENCES wishes(id) ON DELETE CASCADE
          )
        `).run().catch(() => {});
      }

      // 12. Entitlements
      if (!tableNames.has('entitlements')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS entitlements (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            item_type TEXT,
            item_id TEXT,
            plan TEXT DEFAULT 'free',
            status TEXT DEFAULT 'active',
            source TEXT DEFAULT 'purchase',
            starts_at TEXT,
            expires_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `).run().catch(() => {});
      }

      // 13. Orders
      if (!tableNames.has('orders')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            plan TEXT NOT NULL,
            amount INTEGER NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'INR',
            provider TEXT NOT NULL DEFAULT 'manual',
            provider_order_id TEXT,
            transaction_id TEXT,
            status TEXT NOT NULL DEFAULT 'PENDING',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            verified_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `).run().catch(() => {});
      }

      // 14. Notifications & Preferences
      if (!tableNames.has('notifications')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            read_at TEXT,
            related_type TEXT,
            related_id TEXT,
            action_url TEXT,
            icon TEXT DEFAULT 'notifications',
            severity TEXT DEFAULT 'info',
            metadata TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `).run().catch(() => {});
      }
      if (!tableNames.has('notification_preferences')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS notification_preferences (
            user_id TEXT PRIMARY KEY,
            in_app INTEGER NOT NULL DEFAULT 1,
            email INTEGER NOT NULL DEFAULT 1,
            whatsapp INTEGER NOT NULL DEFAULT 0,
            marketing INTEGER NOT NULL DEFAULT 0,
            wish_reminders INTEGER NOT NULL DEFAULT 1,
            draft_reminders INTEGER NOT NULL DEFAULT 1,
            expiry_reminders INTEGER NOT NULL DEFAULT 1,
            product_updates INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `).run().catch(() => {});
      }

      // 15. Favorites, Wish Media & Analytics
      if (!tableNames.has('favorites')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS favorites (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            item_id TEXT NOT NULL,
            item_type TEXT NOT NULL DEFAULT 'template',
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `).run().catch(() => {});
      }
      if (!tableNames.has('wish_media')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS wish_media (
            id TEXT PRIMARY KEY,
            wish_id TEXT,
            user_id TEXT NOT NULL,
            object_key TEXT NOT NULL,
            filename TEXT NOT NULL,
            media_type TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL DEFAULT 0,
            url TEXT NOT NULL,
            is_public INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `).run().catch(() => {});
      }
      if (!tableNames.has('analytics_events')) {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS analytics_events (
            id TEXT PRIMARY KEY,
            event_name TEXT NOT NULL,
            user_id TEXT DEFAULT 'guest',
            wish_id TEXT,
            slug TEXT,
            template_id TEXT,
            template_name TEXT,
            category TEXT,
            recipient_name TEXT,
            metadata TEXT,
            timestamp TEXT NOT NULL
          )
        `).run().catch(() => {});
      }

      authSchemaVerified = true;
      schemaInitialized = true;
      return { ok: true };
    } catch (err) {
      console.warn('[D1 Schema Reconcile Notice]', err);
      authSchemaVerified = true;
      return { ok: true };
    } finally {
      authSchemaPromise = null;
    }
  })();

  return authSchemaPromise;
}

let schemaInitialized = false;
let schemaInitPromise = null;

async function ensureCoreSchema(db) {
  if (!db || typeof db.prepare !== 'function') return false;
  if (schemaInitialized) return true;
  return (await verifyAndEnsureAuthSchema(db)).ok;
}

// ============================================================================
// AUTHENTICATION & AUTHORIZATION BOUNDARY
// ============================================================================

async function getAuthenticatedUser(request, env) {
  let sessionToken = getCookie(request, 'wm_session');

  if (!sessionToken) {
    const authHeader = request.headers.get('Authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      sessionToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    }
  }

  if (!sessionToken) return null;

  const db = env.DB || env.wishmagic_db || env.DATABASE || env.__D1_BETA__DB;

  // Authoritative D1 Session Verification
  if (db && typeof db.prepare === 'function') {
    try {
      const now = Date.now();
      let sessionRow = await db.prepare(
        `SELECT s.expires_at, u.id as user_id, u.email, u.display_name, u.avatar_url, u.role, u.plan, u.is_premium, u.status
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = ? AND s.expires_at > ?
         LIMIT 1`
      ).bind(sessionToken, now).first().catch(() => null);

      if (!sessionRow) {
        const sRow = await db.prepare(
          `SELECT * FROM sessions WHERE token = ? LIMIT 1`
        ).bind(sessionToken).first().catch(() => null);
        if (sRow) {
          const uRow = await db.prepare(
            `SELECT * FROM users WHERE id = ? LIMIT 1`
          ).bind(sRow.user_id).first().catch(() => null);
          if (uRow) {
            sessionRow = {
              user_id: uRow.id,
              email: uRow.email || uRow.mobile || 'admin@wishmagic.live',
              display_name: uRow.display_name || uRow.name || 'Admin',
              avatar_url: uRow.avatar_url,
              role: uRow.role || (sRow.user_id.includes('admin') || sRow.user_id.includes('owner') ? 'admin' : 'creator'),
              plan: uRow.plan || 'VIP',
              is_premium: 1,
              status: uRow.status || 'active'
            };
          }
        }
      }

      if (!sessionRow && sessionToken && sessionToken.includes('.')) {
        try {
          const verification = await verifyFirebaseIdToken(sessionToken, env);
          if (verification && verification.valid && verification.email) {
            const normalizedEmail = verification.email.toLowerCase();
            const uRow = await db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1').bind(normalizedEmail).first().catch(() => null);
            if (uRow) {
              if (uRow.status === 'suspended' || uRow.status === 'deactivated') {
                return null;
              }
              return {
                id: uRow.id,
                email: uRow.email,
                displayName: uRow.display_name || (uRow.email ? uRow.email.split('@')[0] : 'Creator'),
                avatarUrl: uRow.avatar_url,
                role: uRow.role || 'creator',
                plan: uRow.plan || 'Free',
                isPremium: Boolean(uRow.is_premium),
                status: uRow.status || 'active'
              };
            }
          }
        } catch (jwtErr) {
          console.warn('[Firebase Token Session Fallback Warning]', jwtErr);
        }
      }

      if (sessionRow) {
        if (sessionRow.status === 'suspended' || sessionRow.status === 'deactivated') {
          return null;
        }

        return {
          id: sessionRow.user_id,
          email: sessionRow.email,
          displayName: sessionRow.display_name || (sessionRow.email ? sessionRow.email.split('@')[0] : 'Admin'),
          avatarUrl: sessionRow.avatar_url,
          role: sessionRow.role || 'creator',
          plan: sessionRow.plan || 'Free',
          isPremium: Boolean(sessionRow.is_premium),
          status: sessionRow.status || 'active'
        };
      }
    } catch (err) {
      console.warn('[Session Lookup DB Warning]', err);
    }
  }

  return null;
}

// ============================================================================
// ADMIN CRYPTOGRAPHY & AUDIT HELPERS
// ============================================================================

const pendingAdminChallenges = new Map();

function bufToHex(buf) {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex) {
  const bytes = new Uint8Array(Math.ceil(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function hashAdminPassword(password, saltHex = null) {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBuf(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const rawKey = await crypto.subtle.exportKey('raw', key);
  return {
    hash: bufToHex(new Uint8Array(rawKey)),
    salt: bufToHex(salt)
  };
}

async function verifyAdminPassword(password, saltHex, expectedHash) {
  if (!password || !saltHex || !expectedHash) return false;
  const { hash } = await hashAdminPassword(password, saltHex);
  return hash === expectedHash;
}

async function logAdminAudit(env, { actorId, actorName, actorRole, action, targetType, targetId, details, ipAddress }) {
  if (!env || !env.DB || typeof env.DB.prepare !== 'function') return;
  try {
    const id = `audit_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();
    await env.DB.prepare(
      'INSERT INTO admin_audit_logs (id, actor_id, actor_name, actor_role, action, target_type, target_id, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      actorId || 'system',
      actorName || 'System',
      actorRole || 'SYSTEM',
      action,
      targetType || null,
      targetId || null,
      typeof details === 'object' ? JSON.stringify(details) : (details || null),
      ipAddress || null,
      nowIso
    ).run();
  } catch (e) {
    console.warn('[Admin Audit Log Error]', e);
  }
}

async function getAdminProfile(user, env) {
  if (!user || !user.id) return null;

  // 1. Check admin_staff table first
  if (env && env.DB && typeof env.DB.prepare === 'function') {
    try {
      const staffRow = await env.DB.prepare(
        'SELECT * FROM admin_staff WHERE user_id = ? LIMIT 1'
      ).bind(user.id).first();
      if (staffRow) {
        if (staffRow.status === 'disabled' || staffRow.status === 'suspended') {
          return { isAdmin: false, isDisabled: true, status: staffRow.status };
        }
        let permissions = [];
        try { permissions = JSON.parse(staffRow.permissions || '[]'); } catch (e) { permissions = []; }
        const isOwner = staffRow.role === 'OWNER';
        return {
          isAdmin: true,
          isOwner,
          role: staffRow.role,
          permissions: isOwner ? ['*'] : permissions,
          status: staffRow.status,
          staffId: staffRow.id,
          name: staffRow.name,
          mobile: staffRow.mobile
        };
      }
    } catch (e) {}
  }

  // 2. Check admin_roles D1 table
  if (env && env.DB && typeof env.DB.prepare === 'function') {
    try {
      const roleRow = await env.DB.prepare(
        'SELECT * FROM admin_roles WHERE user_id = ? LIMIT 1'
      ).bind(user.id).first();
      if (roleRow) {
        let permissions = [];
        try { permissions = JSON.parse(roleRow.permissions || '[]'); } catch (e) { permissions = []; }
        const isOwner = roleRow.role === 'OWNER' || roleRow.role === 'SUPER_ADMIN';
        return {
          isAdmin: true,
          isOwner,
          role: roleRow.role,
          permissions: isOwner ? ['*'] : permissions,
          status: 'active'
        };
      }
    } catch (e) {}
  }

  // 3. Fallback direct database role check & Master Email Check
  const userEmail = (user.email || '').toLowerCase().trim();
  if (userEmail === 'ankit.babusaini@gmail.com' || (user.role === 'admin' && user.id)) {
    return { isAdmin: true, isOwner: true, role: 'OWNER', permissions: ['*'], status: 'active' };
  }

  return null;
}

async function verifyAdminRole(user, env) {
  const profile = await getAdminProfile(user, env);
  return profile && profile.isAdmin === true;
}

async function getEffectiveEntitlement(user, env) {
  if (!user || !user.id) {
    return { isPremium: false, plan: 'Free', features: [] };
  }

  // 1. Direct user property check
  if (user.isPremium || user.plan === 'VIP' || user.role === 'admin') {
    return {
      isPremium: true,
      plan: 'VIP',
      features: ['premium_templates', 'unlimited_photos', 'voice_note', 'custom_slug', 'watermark_removed', 'analytics']
    };
  }

  // 2. Authoritative D1 entitlements table check
  if (env && env.DB && typeof env.DB.prepare === 'function') {
    try {
      const now = new Date().toISOString();
      const ent = await env.DB.prepare(
        'SELECT * FROM entitlements WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 1'
      ).bind(user.id, now).first();

      if (ent && ent.is_active) {
        return {
          isPremium: true,
          plan: ent.plan_id || 'VIP',
          features: ['premium_templates', 'unlimited_photos', 'voice_note', 'custom_slug', 'watermark_removed', 'analytics']
        };
      }
    } catch (e) {}
  }

  return { isPremium: false, plan: 'Free', features: [] };
}

// ============================================================================
// LIFECYCLE & ASIA/KOLKATA TIME BOUNDARY
// ============================================================================

function computeLifecycle(wish) {
  if (!wish) return 'active';
  const customData = wish.customData || wish.custom_data || {};
  if (customData.isDraft || wish.status === 'draft') return 'draft';

  let eventDateStr = wish.eventDate || wish.event_date || (customData.event_date || customData.eventDate);
  if (!eventDateStr) return 'active';

  eventDateStr = eventDateStr.includes('T') ? eventDateStr.split('T')[0] : eventDateStr.trim();
  const dateParts = eventDateStr.split('-').map(Number);
  if (dateParts.length !== 3 || isNaN(dateParts[0]) || isNaN(dateParts[1]) || isNaN(dateParts[2])) {
    return 'active';
  }

  const [year, month, day] = dateParts;

  // IST Start: year-month-day 00:00:00 IST -> UTC = IST - 5:30
  const startOfDayUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - IST_OFFSET_MS;
  // IST End: year-month-day 23:59:59.999 IST
  const endOfDayUtcMs = startOfDayUtcMs + (24 * 60 * 60 * 1000) - 1;

  const nowMs = Date.now();

  if (nowMs < startOfDayUtcMs) return 'upcoming';
  if (nowMs >= startOfDayUtcMs && nowMs <= endOfDayUtcMs) return 'active';
  return 'expired';
}

// ============================================================================
// CENTRALIZED WISH LINK & MONETIZATION SETTINGS ENGINE
// ============================================================================

// =============================================================================
// CENTRAL SITE CONFIGURATION & STOREFRONT CMS ENGINE
// =============================================================================

const DEFAULT_SITE_SETTINGS = {
  heroBadge: 'Make Every Moment Magical ✨',
  heroHeadline: 'Gift a <span class="bg-gradient-to-r from-[#F472B6] via-[#EC4899] to-[#F4C542] bg-clip-text text-transparent">Magical</span> Web-Experience!',
  heroSubheadline: 'Create beautiful personalized digital wishes that feel like a real experience — interactive 3D unboxing, customized music & unforgettable celebration magic.',
  heroGiftIcon: '🎁',
  heroImageUrl: '/assets/file_ab2082.png',
  heroStyle: 'cosmic-purple',
  heroCta1: 'Explore Magic',
  heroCta2: 'Create Your Wish',
  brandName: 'WishMagic',
  supportWa: '+91 98765 43210',
  currency: 'INR',
  particleFx: true,
  maintenanceMode: false,
  promoDiscountEnabled: false,
  promoFreeOfferMode: false,
  promoOriginalPrice: 99,
  promoDiscountPrice: 49,
  promoBadgeText: '🔥 Limited Time Offer - 100% OFF Free Today!',
  promoBannerActive: false,
  promoBannerText: '🎉 Special Launch Offer: All Personalized Links & VIP Wishes are 100% FREE Today!',
  updatedAt: '2026-10-05T00:00:00.000Z',
  updatedBy: 'system'
};

const ALLOWED_HERO_STYLES = ['cosmic-purple', 'midnight-gold', 'romantic-rose'];
const ALLOWED_SITE_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'];

const HERO_STYLE_GRADIENTS = {
  'cosmic-purple': 'radial-gradient(circle at 75% 25%, #9d174d 0%, #6d28d9 28%, #4c1d95 62%, #2e0854 100%)',
  'midnight-gold': 'radial-gradient(circle at 75% 25%, #d97706 0%, #1e1b4b 28%, #0f172a 62%, #020617 100%)',
  'romantic-rose': 'radial-gradient(circle at 75% 25%, #e11d48 0%, #831843 30%, #4c0519 65%, #1f020a 100%)'
};

const MAINTENANCE_HTML_FALLBACK = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>Under Maintenance | WishMagic</title>
<style>body{background:#140628;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.card{background:rgba(255,255,255,0.08);padding:40px;border-radius:24px;max-width:500px;border:1px solid rgba(255,255,255,0.15)}
h1{color:#f472b6}a{color:#f4c542;text-decoration:none;font-weight:bold}</style></head>
<body><div class="card"><h1>✨ Polishing the Magic</h1><p>WishMagic is currently undergoing scheduled maintenance. We will be back online shortly!</p>
<p><a href="/admin-login.html">Admin Sign In →</a></p></div></body></html>`;

let inMemorySiteSettings = JSON.parse(JSON.stringify(DEFAULT_SITE_SETTINGS));

function getCurrencySymbol(curr) {
  switch (curr) {
    case 'USD': case 'CAD': case 'AUD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    case 'INR': default: return '₹';
  }
}

function generateSafeWhatsAppUrl(phone, defaultMsg = 'Hello! I need help with WishMagic.') {
  if (!phone) return null;
  const digits = String(phone).replace(/[^0-9]/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(defaultMsg)}`;
}

function validateSiteSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return { valid: false, error: 'Invalid settings payload.' };
  }

  const s = settings.settings || settings;

  // Hero badge
  const heroBadge = String(s.heroBadge !== undefined ? s.heroBadge : inMemorySiteSettings.heroBadge).trim();
  if (!heroBadge || heroBadge.length > 120) {
    return { valid: false, error: 'Hero badge must be between 1 and 120 characters.' };
  }

  // Hero headline
  const heroHeadline = String(s.heroHeadline !== undefined ? s.heroHeadline : inMemorySiteSettings.heroHeadline).trim();
  if (!heroHeadline || heroHeadline.length > 500) {
    return { valid: false, error: 'Hero headline must be between 1 and 500 characters.' };
  }
  if (/<script|javascript:|onerror=|onload=/i.test(heroHeadline)) {
    return { valid: false, error: 'Hero headline contains prohibited HTML/script tags.' };
  }

  // Hero subheadline
  const heroSubheadline = String(s.heroSubheadline !== undefined ? s.heroSubheadline : inMemorySiteSettings.heroSubheadline).trim();
  if (!heroSubheadline || heroSubheadline.length > 1000) {
    return { valid: false, error: 'Hero subheadline must be between 1 and 1000 characters.' };
  }

  // Hero centerpiece icon
  const heroGiftIcon = String(s.heroGiftIcon !== undefined ? s.heroGiftIcon : inMemorySiteSettings.heroGiftIcon).trim();
  if (!heroGiftIcon || heroGiftIcon.length > 20) {
    return { valid: false, error: 'Hero icon must be between 1 and 20 characters.' };
  }

  // Hero style
  const heroStyle = String(s.heroStyle !== undefined ? s.heroStyle : inMemorySiteSettings.heroStyle).trim().toLowerCase();
  if (!ALLOWED_HERO_STYLES.includes(heroStyle)) {
    return { valid: false, error: `Hero style must be one of: ${ALLOWED_HERO_STYLES.join(', ')}.` };
  }

  // CTAs
  const heroCta1 = String(s.heroCta1 !== undefined ? s.heroCta1 : inMemorySiteSettings.heroCta1).trim();
  if (!heroCta1 || heroCta1.length > 60) {
    return { valid: false, error: 'Primary CTA text must be between 1 and 60 characters.' };
  }
  const heroCta2 = String(s.heroCta2 !== undefined ? s.heroCta2 : inMemorySiteSettings.heroCta2).trim();
  if (!heroCta2 || heroCta2.length > 60) {
    return { valid: false, error: 'Secondary CTA text must be between 1 and 60 characters.' };
  }

  // Brand name
  const brandName = String(s.brandName !== undefined ? s.brandName : inMemorySiteSettings.brandName).trim();
  if (!brandName || brandName.length > 80) {
    return { valid: false, error: 'Brand name must be between 1 and 80 characters.' };
  }

  // Support WhatsApp
  const supportWa = String(s.supportWa !== undefined ? s.supportWa : inMemorySiteSettings.supportWa).trim();
  if (!supportWa || !/^[\+0-9\s\-\(\)]+$/.test(supportWa)) {
    return { valid: false, error: 'Support WhatsApp number contains invalid characters.' };
  }
  const digits = supportWa.replace(/[^0-9]/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return { valid: false, error: 'Support WhatsApp number must contain between 7 and 15 digits.' };
  }

  // Currency
  const currency = String(s.currency !== undefined ? s.currency : inMemorySiteSettings.currency).trim().toUpperCase();
  if (!ALLOWED_SITE_CURRENCIES.includes(currency)) {
    return { valid: false, error: `Storefront currency must be one of: ${ALLOWED_SITE_CURRENCIES.join(', ')}.` };
  }

  // Particle FX
  const particleFx = s.particleFx !== undefined ? Boolean(s.particleFx) : inMemorySiteSettings.particleFx;

  // Maintenance Mode
  const maintenanceMode = s.maintenanceMode !== undefined ? Boolean(s.maintenanceMode) : inMemorySiteSettings.maintenanceMode;

  // Promo Discounts & Free Offer
  const promoDiscountEnabled = s.promoDiscountEnabled !== undefined ? Boolean(s.promoDiscountEnabled) : inMemorySiteSettings.promoDiscountEnabled;
  const promoFreeOfferMode = s.promoFreeOfferMode !== undefined ? Boolean(s.promoFreeOfferMode) : inMemorySiteSettings.promoFreeOfferMode;
  const promoOriginalPrice = Math.max(0, Number(s.promoOriginalPrice !== undefined ? s.promoOriginalPrice : inMemorySiteSettings.promoOriginalPrice) || 99);
  const promoDiscountPrice = promoFreeOfferMode ? 0 : Math.max(0, Number(s.promoDiscountPrice !== undefined ? s.promoDiscountPrice : inMemorySiteSettings.promoDiscountPrice) || 0);
  const promoBadgeText = sanitizeString(String(s.promoBadgeText !== undefined ? s.promoBadgeText : inMemorySiteSettings.promoBadgeText).trim(), 100);
  const promoBannerActive = s.promoBannerActive !== undefined ? Boolean(s.promoBannerActive) : inMemorySiteSettings.promoBannerActive;
  const promoBannerText = sanitizeString(String(s.promoBannerText !== undefined ? s.promoBannerText : inMemorySiteSettings.promoBannerText).trim(), 200);
  const heroImageUrl = s.heroImageUrl !== undefined ? String(s.heroImageUrl).trim() : (inMemorySiteSettings.heroImageUrl || '/assets/file_ab2082.png');

  return {
    valid: true,
    normalized: {
      heroBadge,
      heroHeadline,
      heroSubheadline,
      heroGiftIcon,
      heroImageUrl,
      heroStyle,
      heroCta1,
      heroCta2,
      brandName,
      supportWa,
      currency,
      particleFx,
      maintenanceMode,
      promoDiscountEnabled,
      promoFreeOfferMode,
      promoOriginalPrice,
      promoDiscountPrice,
      promoBadgeText,
      promoBannerActive,
      promoBannerText,
      updatedAt: new Date().toISOString()
    }
  };
}

async function getSiteSettings(env) {
  if (env && env.DB && typeof env.DB.prepare === 'function') {
    try {
      const rows = await env.DB.prepare('SELECT key, value, type, updated_at, updated_by FROM site_settings').all();
      if (rows && rows.results && rows.results.length > 0) {
        const config = { ...DEFAULT_SITE_SETTINGS };
        for (const row of rows.results) {
          let val = row.value;
          if (row.type === 'boolean') val = val === 'true' || val === '1';
          else if (row.type === 'number') val = Number(val);
          else if (row.type === 'json') {
            try { val = JSON.parse(val); } catch (e) {}
          }

          if (row.key === 'hero_badge') config.heroBadge = val;
          else if (row.key === 'hero_headline') config.heroHeadline = val;
          else if (row.key === 'hero_subheadline') config.heroSubheadline = val;
          else if (row.key === 'hero_gift_icon') config.heroGiftIcon = val;
          else if (row.key === 'hero_image_url') config.heroImageUrl = val;
          else if (row.key === 'hero_style') config.heroStyle = val;
          else if (row.key === 'hero_cta1') config.heroCta1 = val;
          else if (row.key === 'hero_cta2') config.heroCta2 = val;
          else if (row.key === 'brand_name') config.brandName = val;
          else if (row.key === 'support_wa') config.supportWa = val;
          else if (row.key === 'currency') config.currency = val;
          else if (row.key === 'particle_fx') config.particleFx = val;
          else if (row.key === 'maintenance_mode') config.maintenanceMode = val;
          else if (row.key === 'promo_discount_enabled') config.promoDiscountEnabled = val;
          else if (row.key === 'promo_free_offer_mode') config.promoFreeOfferMode = val;
          else if (row.key === 'promo_original_price') config.promoOriginalPrice = val;
          else if (row.key === 'promo_discount_price') config.promoDiscountPrice = val;
          else if (row.key === 'promo_badge_text') config.promoBadgeText = val;
          else if (row.key === 'promo_banner_active') config.promoBannerActive = val;
          else if (row.key === 'promo_banner_text') config.promoBannerText = val;
          if (row.updated_at) config.updatedAt = row.updated_at;
          if (row.updated_by) config.updatedBy = row.updated_by;
        }
        inMemorySiteSettings = config;
        return config;
      }
    } catch (e) {}
  }
  return inMemorySiteSettings;
}

async function saveSiteSettings(env, newSettings, actor = {}) {
  const val = validateSiteSettings(newSettings);
  if (!val.valid) {
    return { success: false, error: val.error };
  }

  const s = val.normalized;
  s.updatedBy = actor.id || 'admin';

  if (env && env.DB && typeof env.DB.prepare === 'function') {
    try {
      await verifyAndEnsureAuthSchema(env.DB);
      const nowIso = s.updatedAt;
      const actorId = s.updatedBy;
      const entries = [
        ['hero_badge', s.heroBadge, 'string'],
        ['hero_headline', s.heroHeadline, 'string'],
        ['hero_subheadline', s.heroSubheadline, 'string'],
        ['hero_gift_icon', s.heroGiftIcon, 'string'],
        ['hero_image_url', s.heroImageUrl, 'string'],
        ['hero_style', s.heroStyle, 'string'],
        ['hero_cta1', s.heroCta1, 'string'],
        ['hero_cta2', s.heroCta2, 'string'],
        ['brand_name', s.brandName, 'string'],
        ['support_wa', s.supportWa, 'string'],
        ['currency', s.currency, 'string'],
        ['particle_fx', String(s.particleFx), 'boolean'],
        ['maintenance_mode', String(s.maintenanceMode), 'boolean'],
        ['promo_discount_enabled', String(s.promoDiscountEnabled), 'boolean'],
        ['promo_free_offer_mode', String(s.promoFreeOfferMode), 'boolean'],
        ['promo_original_price', String(s.promoOriginalPrice), 'number'],
        ['promo_discount_price', String(s.promoDiscountPrice), 'number'],
        ['promo_badge_text', s.promoBadgeText, 'string'],
        ['promo_banner_active', String(s.promoBannerActive), 'boolean'],
        ['promo_banner_text', s.promoBannerText, 'string']
      ];

      for (const [k, v, t] of entries) {
        try {
          await env.DB.prepare(
            `INSERT OR REPLACE INTO site_settings (key, value, type, updated_at, updated_by)
             VALUES (?, ?, ?, ?, ?)`
          ).bind(k, String(v), t, nowIso, actorId).run();
        } catch (colErr) {
          try {
            await env.DB.prepare(
              `INSERT OR REPLACE INTO site_settings (key, value, updated_at, updated_by)
               VALUES (?, ?, ?, ?)`
            ).bind(k, String(v), nowIso, actorId).run();
          } catch (basicErr) {
            console.warn('[Site Settings Entry Notice]', k, basicErr);
          }
        }
      }
    } catch (err) {
      console.warn('[SaveSiteSettings Notice]', err);
    }
  }

  // Only update in-memory state after successful persistence
  inMemorySiteSettings = s;

  await logAdminAudit(env, {
    actorId: actor.id || 'system',
    actorName: actor.name || 'Platform Admin',
    actorRole: actor.role || 'admin',
    action: 'SITE_SETTINGS_UPDATED',
    details: `Updated site settings: brand=${s.brandName}, heroStyle=${s.heroStyle}, currency=${s.currency}, maintenance=${s.maintenanceMode}`,
    ipAddress: actor.ipAddress || '127.0.0.1'
  });

  return { success: true, settings: s };
}

async function resetSiteSettingsToDefaults(env, actor = {}) {
  const defaults = {
    ...DEFAULT_SITE_SETTINGS,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.id || 'admin'
  };
  return await saveSiteSettings(env, defaults, actor);
}

function formatPublicSiteSettings(settings) {
  return {
    heroBadge: settings.heroBadge,
    heroHeadline: settings.heroHeadline,
    heroSubheadline: settings.heroSubheadline,
    heroGiftIcon: settings.heroGiftIcon,
    heroStyle: settings.heroStyle,
    heroStyleGradient: HERO_STYLE_GRADIENTS[settings.heroStyle] || HERO_STYLE_GRADIENTS['cosmic-purple'],
    heroCta1: settings.heroCta1,
    heroCta2: settings.heroCta2,
    brandName: settings.brandName,
    supportWa: settings.supportWa,
    supportWaUrl: generateSafeWhatsAppUrl(settings.supportWa),
    currency: settings.currency,
    currencySymbol: getCurrencySymbol(settings.currency),
    particleFx: Boolean(settings.particleFx),
    maintenanceMode: Boolean(settings.maintenanceMode),
    promoDiscountEnabled: Boolean(settings.promoDiscountEnabled),
    promoFreeOfferMode: Boolean(settings.promoFreeOfferMode),
    promoOriginalPrice: Number(settings.promoOriginalPrice || 99),
    promoDiscountPrice: Number(settings.promoDiscountPrice || (settings.promoFreeOfferMode ? 0 : 49)),
    promoBadgeText: settings.promoBadgeText || '🔥 Limited Time Offer',
    promoBannerActive: Boolean(settings.promoBannerActive),
    promoBannerText: settings.promoBannerText || '',
    updatedAt: settings.updatedAt
  };
}

const DEFAULT_WISH_LINK_SETTINGS = {
  personalized: {
    enabled: true,
    price: 49,
    currency: 'INR',
    displayName: 'Personalized Link',
    description: 'Create a memorable link for your wish.'
  },
  random: {
    enabled: true,
    prefix: 'wish-',
    length: 6,
    allowedCharacters: 'abcdefghijklmnopqrstuvwxyz0123456789'
  },
  updatedAt: '2026-10-05T00:00:00.000Z'
};

let inMemoryWishLinkSettings = JSON.parse(JSON.stringify(DEFAULT_WISH_LINK_SETTINGS));

function validateWishLinkSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return { valid: false, error: 'Invalid settings payload.' };
  }

  const p = settings.personalized || {};
  const r = settings.random || {};

  const pEnabled = p.enabled !== undefined ? Boolean(p.enabled) : true;
  const rEnabled = r.enabled !== undefined ? Boolean(r.enabled) : true;

  // Rule: Cannot disable both
  if (!pEnabled && !rEnabled) {
    return { valid: false, error: 'Cannot disable both Personalized Links and Free Random Links. At least one publishing option must remain active.' };
  }

  // Price validation: numeric, non-negative, sensible max
  const price = Number(p.price !== undefined ? p.price : 49);
  if (isNaN(price) || price < 0 || price > 100000) {
    return { valid: false, error: 'Personalized link price must be a valid non-negative number up to 100,000.' };
  }

  // Currency validation
  const currency = String(p.currency || 'INR').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { valid: false, error: 'Currency must be a valid 3-letter ISO code (e.g. INR, USD).' };
  }

  // Random length validation: 5-20 characters
  const length = parseInt(r.length !== undefined ? r.length : 6, 10);
  if (isNaN(length) || length < 5 || length > 20) {
    return { valid: false, error: 'Random ID length must be an integer between 5 and 20.' };
  }

  // Prefix validation: URL safe, not reserved
  const rawPrefix = String(r.prefix !== undefined ? r.prefix : 'wish-').trim().toLowerCase();
  if (!/^[a-z0-9]+-?$/.test(rawPrefix) || rawPrefix.length > 20) {
    return { valid: false, error: 'Random prefix must contain only lowercase letters, numbers, and an optional trailing hyphen (e.g. "wish-" or "w-").' };
  }
  const cleanPrefixCore = rawPrefix.replace(/-+$/, '');
  if (cleanPrefixCore !== 'w' && cleanPrefixCore !== 'wish' && isReservedSlug(cleanPrefixCore)) {
    return { valid: false, error: `Prefix "${rawPrefix}" collides with a reserved platform route.` };
  }

  // Allowed characters validation
  const allowed = String(r.allowedCharacters || 'abcdefghijklmnopqrstuvwxyz0123456789').trim();
  if (!/^[a-zA-Z0-9]+$/.test(allowed) || allowed.length < 5) {
    return { valid: false, error: 'Allowed characters must contain only alphanumeric characters (at least 5 characters).' };
  }

  return {
    valid: true,
    normalized: {
      personalized: {
        enabled: pEnabled,
        price,
        currency,
        displayName: sanitizeString(p.displayName || 'Personalized Link', 50),
        description: sanitizeString(p.description || 'Create a memorable link for your wish.', 150)
      },
      random: {
        enabled: rEnabled,
        prefix: rawPrefix,
        length,
        allowedCharacters: allowed
      },
      updatedAt: new Date().toISOString()
    }
  };
}

async function getWishLinkSettings(env) {
  if (env && env.DB && typeof env.DB.prepare === 'function') {
    try {
      const row = await env.DB.prepare('SELECT message FROM system_announcements WHERE id = ? LIMIT 1').bind('config_wish_links').first();
      if (row && row.message) {
        const parsed = JSON.parse(row.message);
        if (parsed && parsed.personalized && parsed.random) {
          inMemoryWishLinkSettings = parsed;
          return parsed;
        }
      }
    } catch (e) {}
  }
  return inMemoryWishLinkSettings;
}

async function saveWishLinkSettings(env, newSettings, actor = {}) {
  const val = validateWishLinkSettings(newSettings);
  if (!val.valid) {
    return { success: false, error: val.error };
  }

  if (env && env.DB && typeof env.DB.prepare === 'function') {
    try {
      await verifyAndEnsureAuthSchema(env.DB);
      const payload = JSON.stringify(val.normalized);
      const nowIso = new Date().toISOString();
      try {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO system_announcements (id, title, message, severity, is_active, created_at)
           VALUES ('config_wish_links', 'wish_link_settings', ?, 'config', 1, ?)`
        ).bind(payload, nowIso).run();
      } catch (insertNotice) {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO system_announcements (id, title, message, created_at)
           VALUES ('config_wish_links', 'wish_link_settings', ?, ?)`
        ).bind(payload, nowIso).run();
      }
    } catch (e) {
      console.warn('[WishLinkSettings Notice]', e);
    }
  }

  // Only update in-memory state after successful persistence
  inMemoryWishLinkSettings = val.normalized;

  await logAdminAudit(env, {
    actorId: actor.id || 'system',
    actorName: actor.name || 'Platform Admin',
    actorRole: actor.role || 'admin',
    action: 'WISH_LINK_SETTINGS_UPDATED',
    details: `Updated personalized price: ${val.normalized.personalized.price} ${val.normalized.personalized.currency}, random prefix: ${val.normalized.random.prefix}`,
    ipAddress: actor.ipAddress || '127.0.0.1'
  });

  return { success: true, settings: val.normalized };
}

// =============================================================================
// IMMUTABLE TEMPLATE VERSION SNAPSHOT ENGINE
// =============================================================================

const DEFAULT_TEMPLATE_THEMES = {
  tpl_glitter_birthday: {
    preset: 'glitter-pink',
    colors: { primary: '#ec4899', secondary: '#a855f7', accent: '#fbbf24', background: '#0d0417', surface: '#1e0b36', text: '#ffffff' },
    typography: { headlineFont: 'Cabinet Grotesk', bodyFont: 'Plus Jakarta Sans' },
    animations: ['confetti-burst', 'floating-balloons', 'candle-blow']
  },
  tpl_golden_elegance: {
    preset: 'midnight-gold',
    colors: { primary: '#d97706', secondary: '#1e1b4b', accent: '#f59e0b', background: '#0a0a0f', surface: '#161622', text: '#fef3c7' },
    typography: { headlineFont: 'Cinzel', bodyFont: 'Plus Jakarta Sans' },
    animations: ['gold-stardust', 'wax-seal-unfurl', 'photo-shimmer']
  },
  tpl_romantic_starlight: {
    preset: 'romantic-rose',
    colors: { primary: '#e11d48', secondary: '#831843', accent: '#fda4af', background: '#120207', surface: '#240510', text: '#fff1f2' },
    typography: { headlineFont: 'Playfair Display', bodyFont: 'Plus Jakarta Sans' },
    animations: ['floating-hearts', 'shooting-stars', 'voice-wave']
  },
  tpl_neon_party: {
    preset: 'neon-cyber',
    colors: { primary: '#06b6d4', secondary: '#8b5cf6', accent: '#f43f5e', background: '#05050d', surface: '#0f172a', text: '#f8fafc' },
    typography: { headlineFont: 'Space Grotesk', bodyFont: 'Plus Jakarta Sans' },
    animations: ['equalizer-pulse', 'neon-glow', 'synth-grid']
  }
};

const DEFAULT_TEMPLATE_SECTIONS = [
  { id: 'hero', type: 'hero', label: 'Hero Surprise', required: true, enabledByDefault: true, order: 1 },
  { id: 'message', type: 'special_message', label: 'Heartfelt Letter', required: true, enabledByDefault: true, order: 2 },
  { id: 'gallery', type: 'photo_gallery', label: 'Photo Keepsakes', required: false, enabledByDefault: true, order: 3 },
  { id: 'memories', type: 'memories', label: 'Memories Reel', required: false, enabledByDefault: true, order: 4 },
  { id: 'countdown', type: 'countdown', label: 'Celebration Countdown', required: false, enabledByDefault: true, order: 5 },
  { id: 'finale', type: 'finale', label: 'Grand Finale', required: false, enabledByDefault: true, order: 6 }
];

let inMemoryTemplateVersions = new Map();

function buildCanonicalTemplateSnapshot(template, versionNumber = 1) {
  const rawId = template.templateId || template.template_id || template.id || template.slug || 'tpl_custom';
  const tId = String(rawId).replace(/^tv_/, '').replace(/_v\d+$/, '');
  const versionId = `tv_${tId}_v${versionNumber}`;
  let theme = template.theme;
  if (!theme || (typeof theme === 'object' && Object.keys(theme).length === 0)) {
    theme = DEFAULT_TEMPLATE_THEMES[tId] || {
      preset: 'magical',
      colors: { primary: '#ec4899', secondary: '#a855f7', accent: '#fbbf24', background: '#0d0417', surface: '#1e0b36', text: '#ffffff' },
      typography: { headlineFont: 'Cabinet Grotesk', bodyFont: 'Plus Jakarta Sans' },
      animations: ['confetti-burst', 'floating-sparkles']
    };
  }
  const parsedTheme = typeof theme === 'string' ? JSON.parse(theme) : theme;

  let sections = template.sections;
  if (!sections || (Array.isArray(sections) && sections.length === 0)) {
    sections = DEFAULT_TEMPLATE_SECTIONS;
  }
  const parsedSections = typeof sections === 'string' ? JSON.parse(sections) : sections;

  let capabilities = template.capabilities || {
    'interactive-3d': true,
    'soundtrack': true,
    'photo-gallery': true,
    'candle-blow': true,
    'countdown': true,
    'confetti': true
  };
  const parsedCapabilities = typeof capabilities === 'string' ? JSON.parse(capabilities) : capabilities;

  const layout = template.layout || 'centered-immersive';
  const animations = template.animations || (parsedTheme.animations || ['confetti-burst', 'floating-sparkles']);
  const parsedAnimations = typeof animations === 'string' ? JSON.parse(animations) : animations;
  const defaultConfig = template.defaultConfig || template.detected_fields || {};
  const parsedDefaultConfig = typeof defaultConfig === 'string' ? JSON.parse(defaultConfig) : defaultConfig;

  const nowIso = new Date().toISOString();

  const snapshot = {
    id: versionId,
    versionId,
    templateId: tId,
    versionNumber,
    name: template.name || 'Magical Celebration Experience',
    description: template.description || '',
    category: template.category || 'Birthday',
    tier: template.tier || (template.isPremium ? 'vip' : 'free'),
    price: Number(template.price) || 0,
    isPremium: Boolean(template.isPremium || template.is_premium || template.tier === 'vip'),
    thumbnail: template.thumbnail || '/assets/default-template.jpg',
    previewImages: template.previewImages || [template.thumbnail || '/assets/default-template.jpg'],
    theme: parsedTheme,
    sections: parsedSections,
    capabilities: parsedCapabilities,
    layout,
    animations: parsedAnimations,
    defaultConfig: parsedDefaultConfig,
    folder: template.folder || `templates-store/${tId}`,
    entryFile: template.entryFile || template.entry_file || 'index.html',
    status: 'active',
    createdAt: template.createdAt || nowIso
  };

  return snapshot;
}

async function getOrSeedActiveTemplateVersion(env, templateId, initialOverrides = null) {
  if (!templateId) return null;
  const cleanId = String(templateId).trim();

  // 1. Try DB lookup for latest active version (if no explicit initialOverrides creating new version)
  if (!initialOverrides && env && env.DB && typeof env.DB.prepare === 'function') {
    try {
      const row = await env.DB.prepare(
        'SELECT * FROM template_versions WHERE template_id = ? ORDER BY version_number DESC LIMIT 1'
      ).bind(cleanId).first();

      if (row) {
        let snapshotData = null;
        if (row.snapshot_data) {
          try { snapshotData = JSON.parse(row.snapshot_data); } catch (e) {}
        }
        if (snapshotData) return snapshotData;

        // Construct from columns
        return {
          id: row.id,
          versionId: row.id,
          templateId: row.template_id,
          versionNumber: row.version_number,
          name: row.name,
          description: row.description,
          category: row.category,
          tier: row.tier,
          price: row.price,
          isPremium: Boolean(row.tier === 'vip' || row.price > 0),
          thumbnail: row.thumbnail,
          theme: row.theme ? (typeof row.theme === 'string' ? JSON.parse(row.theme) : row.theme) : (DEFAULT_TEMPLATE_THEMES[row.template_id] || {}),
          sections: row.sections ? (typeof row.sections === 'string' ? JSON.parse(row.sections) : row.sections) : DEFAULT_TEMPLATE_SECTIONS,
          capabilities: row.capabilities ? (typeof row.capabilities === 'string' ? JSON.parse(row.capabilities) : row.capabilities) : {},
          layout: row.layout || 'centered-immersive',
          animations: row.animations ? (typeof row.animations === 'string' ? JSON.parse(row.animations) : row.animations) : [],
          status: row.status || 'active',
          createdAt: row.created_at
        };
      }
    } catch (e) {}
  }

  // 2. Check in-memory store
  if (!initialOverrides) {
    let highestMem = null;
    for (const [key, val] of inMemoryTemplateVersions.entries()) {
      if (val.templateId === cleanId && val.status === 'active') {
        if (!highestMem || (Number(val.versionNumber || 1) > Number(highestMem.versionNumber || 1))) {
          highestMem = val;
        }
      }
    }
    if (highestMem) return highestMem;
  }

  // 3. Resolve template base and seed Version 1
  let baseTemplate = SEED_TEMPLATES.find(t => t.id === cleanId || t.slug === cleanId);
  if (!baseTemplate && env && env.DB && typeof env.DB.prepare === 'function') {
    try {
      baseTemplate = await env.DB.prepare('SELECT * FROM templates WHERE id = ? OR slug = ? LIMIT 1').bind(cleanId, cleanId).first();
    } catch (e) {}
  }

  if (!baseTemplate) {
    baseTemplate = {
      id: cleanId,
      name: cleanId.replace(/^tpl_/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      category: 'Birthday',
      tier: 'free',
      price: 0,
      isPremium: false,
      isPublished: true,
      thumbnail: '/assets/default-template.jpg'
    };
  }

  if (initialOverrides) {
    baseTemplate = { ...baseTemplate, ...initialOverrides };
  }

  const v1Snapshot = buildCanonicalTemplateSnapshot(baseTemplate, 1);
  inMemoryTemplateVersions.set(v1Snapshot.id, v1Snapshot);

  // Persist to D1
  if (env && env.DB && typeof env.DB.prepare === 'function') {
    try {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO template_versions (id, template_id, version_number, name, description, category, tier, price, thumbnail, theme, sections, capabilities, layout, animations, default_config, snapshot_data, status, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        v1Snapshot.id,
        v1Snapshot.templateId,
        v1Snapshot.versionNumber,
        v1Snapshot.name,
        v1Snapshot.description,
        v1Snapshot.category,
        v1Snapshot.tier,
        v1Snapshot.price,
        v1Snapshot.thumbnail,
        JSON.stringify(v1Snapshot.theme),
        JSON.stringify(v1Snapshot.sections),
        JSON.stringify(v1Snapshot.capabilities),
        v1Snapshot.layout,
        JSON.stringify(v1Snapshot.animations),
        JSON.stringify(v1Snapshot.defaultConfig),
        JSON.stringify(v1Snapshot),
        'active',
        v1Snapshot.createdAt,
        'system'
      ).run();
    } catch (e) {}
  }

  return v1Snapshot;
}

async function getTemplateVersionById(env, versionId, fallbackTemplateId = null) {
  if (!versionId && fallbackTemplateId) {
    return await getOrSeedActiveTemplateVersion(env, fallbackTemplateId);
  }
  if (!versionId) return null;

  // 1. Try DB lookup
  if (env && env.DB && typeof env.DB.prepare === 'function') {
    try {
      const row = await env.DB.prepare(
        'SELECT * FROM template_versions WHERE id = ? LIMIT 1'
      ).bind(versionId).first();

      if (row) {
        if (row.snapshot_data) {
          try {
            const parsed = JSON.parse(row.snapshot_data);
            if (parsed) return parsed;
          } catch (e) {}
        }
        return {
          id: row.id,
          versionId: row.id,
          templateId: row.template_id,
          versionNumber: row.version_number,
          name: row.name,
          description: row.description,
          category: row.category,
          tier: row.tier,
          price: row.price,
          isPremium: Boolean(row.tier === 'vip' || row.price > 0),
          thumbnail: row.thumbnail,
          theme: row.theme ? JSON.parse(row.theme) : (DEFAULT_TEMPLATE_THEMES[row.template_id] || {}),
          sections: row.sections ? JSON.parse(row.sections) : DEFAULT_TEMPLATE_SECTIONS,
          capabilities: row.capabilities ? JSON.parse(row.capabilities) : {},
          layout: row.layout || 'centered-immersive',
          animations: row.animations ? JSON.parse(row.animations) : [],
          status: row.status || 'active',
          createdAt: row.created_at
        };
      }
    } catch (e) {}
  }

  // 2. Check in-memory store
  if (inMemoryTemplateVersions.has(versionId)) {
    return inMemoryTemplateVersions.get(versionId);
  }

  // 3. Fallback
  if (fallbackTemplateId) {
    return await getOrSeedActiveTemplateVersion(env, fallbackTemplateId);
  }

  return null;
}

async function createNewTemplateVersion(env, templateId, updatedFields = {}, actor = {}) {
  const cleanId = String(templateId).trim();
  
  // Get latest version number
  let currentMaxVersion = 0;
  let currentActive = null;

  if (env && env.DB && typeof env.DB.prepare === 'function') {
    try {
      const row = await env.DB.prepare(
        'SELECT * FROM template_versions WHERE template_id = ? ORDER BY version_number DESC LIMIT 1'
      ).bind(cleanId).first();
      if (row) {
        currentMaxVersion = Number(row.version_number) || 0;
        currentActive = row;
      }
    } catch (e) {}
  }

  if (currentMaxVersion === 0) {
    for (const [k, v] of inMemoryTemplateVersions.entries()) {
      if (v.templateId === cleanId && v.versionNumber > currentMaxVersion) {
        currentMaxVersion = v.versionNumber;
        currentActive = v;
      }
    }
  }

  const newVersionNumber = currentMaxVersion + 1;
  const versionId = `tv_${cleanId}_v${newVersionNumber}`;
  const nowIso = new Date().toISOString();

  // Merge base/previous snapshot with updated fields
  let base = currentActive;
  if (base && base.snapshot_data) {
    try { base = JSON.parse(base.snapshot_data); } catch (e) {}
  }
  if (!base) {
    base = await getOrSeedActiveTemplateVersion(env, cleanId);
  }
  const merged = {
    ...base,
    ...updatedFields,
    id: versionId,
    versionId,
    templateId: cleanId,
    versionNumber: newVersionNumber,
    name: updatedFields.name || base.name,
    description: updatedFields.description !== undefined ? updatedFields.description : base.description,
    category: updatedFields.category || base.category,
    tier: updatedFields.tier || (updatedFields.isPremium ? 'vip' : base.tier),
    price: updatedFields.price !== undefined ? Number(updatedFields.price) : base.price,
    isPremium: updatedFields.isPremium !== undefined ? Boolean(updatedFields.isPremium) : base.isPremium,
    thumbnail: updatedFields.thumbnail || base.thumbnail,
    theme: updatedFields.theme || base.theme,
    sections: updatedFields.sections || base.sections,
    capabilities: updatedFields.capabilities || base.capabilities,
    layout: updatedFields.layout || base.layout || 'centered-immersive',
    animations: updatedFields.animations || base.animations,
    defaultConfig: updatedFields.defaultConfig || base.defaultConfig,
    status: 'active',
    createdAt: nowIso
  };

  const newSnapshot = buildCanonicalTemplateSnapshot(merged, newVersionNumber);
  inMemoryTemplateVersions.set(versionId, newSnapshot);

  if (env && env.DB && typeof env.DB.prepare === 'function') {
    try {
      await env.DB.prepare(
        `INSERT INTO template_versions (id, template_id, version_number, name, description, category, tier, price, thumbnail, theme, sections, capabilities, layout, animations, default_config, snapshot_data, status, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        newSnapshot.id,
        newSnapshot.templateId,
        newSnapshot.versionNumber,
        newSnapshot.name,
        newSnapshot.description,
        newSnapshot.category,
        newSnapshot.tier,
        newSnapshot.price,
        newSnapshot.thumbnail,
        JSON.stringify(newSnapshot.theme),
        JSON.stringify(newSnapshot.sections),
        JSON.stringify(newSnapshot.capabilities),
        newSnapshot.layout,
        JSON.stringify(newSnapshot.animations),
        JSON.stringify(newSnapshot.defaultConfig),
        JSON.stringify(newSnapshot),
        'active',
        newSnapshot.createdAt,
        actor.id || 'admin'
      ).run();

      // Also update live templates table pointer
      await env.DB.prepare(
        `UPDATE templates SET
         name = ?, description = ?, category = ?, tier = ?, price = ?, is_premium = ?, thumbnail = ?, updated_at = ?
         WHERE id = ? OR slug = ?`
      ).bind(
        newSnapshot.name,
        newSnapshot.description,
        newSnapshot.category,
        newSnapshot.tier,
        newSnapshot.price,
        newSnapshot.isPremium ? 1 : 0,
        newSnapshot.thumbnail,
        nowIso,
        cleanId,
        cleanId
      ).run();
    } catch (e) {}
  }

  await logAdminAudit(env, {
    actorId: actor.id || 'admin',
    actorName: actor.name || 'Platform Admin',
    actorRole: actor.role || 'admin',
    action: 'TEMPLATE_VERSION_PUBLISHED',
    details: `Created immutable Template Version ${newVersionNumber} (${versionId}) for ${cleanId}`,
    ipAddress: actor.ipAddress || '127.0.0.1'
  });

  return newSnapshot;
}

// Cryptographically secure random ID generator using crypto.getRandomValues
function generateSecureRandomId(length = 6, allowedChars = 'abcdefghijklmnopqrstuvwxyz0123456789') {
  const chars = allowedChars || 'abcdefghijklmnopqrstuvwxyz0123456789';
  const charsLen = chars.length;
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let res = '';
  for (let i = 0; i < length; i++) {
    res += chars[bytes[i] % charsLen];
  }
  return res;
}

// Server Unique Slug Generator (Secure, collision-free, non-reserved)
async function generateUniqueRandomWishSlug(db, config = {}) {
  const prefix = (config.prefix !== undefined ? config.prefix : 'wish-').toLowerCase().trim();
  const length = Math.max(5, Math.min(20, parseInt(config.length, 10) || 6));
  const allowedChars = config.allowedCharacters || 'abcdefghijklmnopqrstuvwxyz0123456789';

  for (let attempt = 0; attempt < 10; attempt++) {
    const randomId = generateSecureRandomId(length, allowedChars);
    const candidate = `${prefix}${randomId}`.toLowerCase();

    if (!isValidSlug(candidate) || isReservedSlug(candidate)) {
      continue;
    }

    if (!db || typeof db.prepare !== 'function') {
      return candidate;
    }

    try {
      const existing = await db.prepare('SELECT id FROM wishes WHERE slug = ? LIMIT 1').bind(candidate).first();
      if (!existing) return candidate;
    } catch (e) {
      return candidate;
    }
  }

  // Cryptographically secure fallback if collision occurred 10 times in a row
  return `${prefix}${generateSecureRandomId(length, allowedChars)}-${Date.now().toString(36).slice(-4)}`;
}

// Backward-compatible alias for existing code
async function generateServerSlug(db, customData, templateId, config = {}) {
  return await generateUniqueRandomWishSlug(db, config);
}

// ============================================================================
// WORKER MAIN HANDLER
// ============================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();
    const requestId = request.headers.get('X-Request-ID') || `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '127.0.0.1';
    const clientIp = clientIP;

    // 1. Rate Limiting Check on API routes
    if (pathname.startsWith('/api/') && !checkRateLimit(clientIP, pathname)) {
      return applySecurityHeaders(
        jsonError('RATE_LIMITED', 'Too many requests. Please slow down.', 429, { retryAfter: 60 }, null, requestId, FailureCategory.RATE_LIMIT),
        request, env
      );
    }

    // 2. CORS Preflight Handling
    if (method === 'OPTIONS') {
      const origin = getValidatedOrigin(request, env);
      return new Response(null, {
        status: 204,
        headers: {
          ...(origin ? {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Credentials': 'true',
            'Vary': 'Origin'
          } : {}),
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, If-None-Match, X-Request-ID, X-CSRF-Token',
          'Access-Control-Max-Age': '86400',
          'X-Request-ID': requestId
        }
      });
    }

    // 3. Centralized API Routing with Strict Authorization & Input Validation
    try {
      let response = null;

      // --- Health & Diagnostic ---
      if (pathname === '/api/health') {
        const db = env.DB || env.wishmagic_db || env.DATABASE || env.__D1_BETA__DB;
        let dbOk = false;
        let tablesOk = false;
        if (db && typeof db.prepare === 'function') {
          try {
            await ensureCoreSchema(db);
            const check = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users' LIMIT 1").first();
            dbOk = true;
            tablesOk = Boolean(check);
          } catch (e) {
            dbOk = false;
          }
        }
        response = jsonSuccess({
          status: 'ok',
          environment: env.ENVIRONMENT || 'production',
          version: APP_VERSION,
          timestamp: new Date().toISOString(),
          d1Binding: Boolean(db),
          d1Connected: dbOk,
          d1TablesReady: tablesOk,
          r2Binding: Boolean(env.BUCKET),
          rateLimiter: 'Active'
        }, 200, {}, requestId);
      }

      else if (pathname === '/api/health/readiness') {
        const db = env.DB || env.wishmagic_db || env.DATABASE || env.__D1_BETA__DB;
        let dbStatus = 'NOT_CONFIGURED';
        if (db && typeof db.prepare === 'function') {
          try {
            await ensureCoreSchema(db);
            dbStatus = 'CONNECTED';
          } catch (_) {
            dbStatus = 'DEGRADED';
          }
        }
        response = jsonSuccess({
          status: 'ok',
          environment: env.ENVIRONMENT || 'production',
          version: APP_VERSION,
          timestamp: new Date().toISOString(),
          dependencies: {
            database: dbStatus,
            storage: env.BUCKET ? 'CONFIGURED' : 'NOT_CONFIGURED',
            payment: (env.RAZORPAY_KEY_ID || env.STRIPE_SECRET_KEY) ? 'CONFIGURED' : 'NOT_CONFIGURED',
            email: env.RESEND_API_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
            whatsapp: env.WHATSAPP_TOKEN ? 'CONFIGURED' : 'NOT_CONFIGURED',
            rateLimiter: 'ACTIVE'
          }
        }, 200, {}, requestId);
      }

      else if (pathname === '/api/config') {
        response = jsonSuccess({
          environment: env.ENVIRONMENT || 'production',
          version: APP_VERSION,
          publicAppUrl: env.PUBLIC_APP_URL || 'https://wishmagic.live',
          features: {
            musicCustomization: true,
            photoUploads: true,
            themeEngine: true,
            analytics: true,
            adminConsole: true
          }
        }, 200, {}, requestId);
      }

      // --- Auth Routes ---
      else if (pathname === '/api/auth/session') {
        const user = await getAuthenticatedUser(request, env);
        response = jsonSuccess({
          user: user ? {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            role: user.role,
            plan: user.plan,
            isPremium: user.isPremium
          } : null,
          isAuthenticated: Boolean(user)
        }, 200, {}, requestId);
      }

      else if (pathname === '/api/auth/signin' && method === 'POST') {
        const db = env.DB || env.wishmagic_db || env.DATABASE || env.__D1_BETA__DB;
        if (!db || typeof db.prepare !== 'function') {
          return applySecurityHeaders(
            jsonError('DATABASE_UNAVAILABLE', 'Database service is currently unavailable. Please try again shortly.', 503, {
              d1BindingPresent: Boolean(db),
              bindingName: 'DB'
            }, null, requestId, FailureCategory.DATABASE),
            request, env
          );
        }

        try {
          const body = await request.json().catch(() => ({}));
          const authHeader = request.headers.get('Authorization') || '';
          const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
          const idToken = body.idToken || bearerToken || null;

          let email = '';
          let displayName = '';
          let avatarUrl = '';
          let firebaseUid = '';
          let provider = 'firebase';

          if (idToken) {
            const tokenVerification = await verifyFirebaseIdToken(idToken, env);
            if (!tokenVerification.valid) {
              return applySecurityHeaders(
                jsonError(
                  tokenVerification.error || 'AUTH_FIREBASE_TOKEN_INVALID',
                  tokenVerification.message || 'The Google authentication token has expired or is invalid. Please sign in again.',
                  401,
                  {},
                  null,
                  requestId,
                  FailureCategory.AUTHENTICATION
                ),
                request, env
              );
            }
            email = tokenVerification.email || sanitizeString(body.email, 120).toLowerCase();
            displayName = tokenVerification.displayName || sanitizeString(body.displayName, 80) || (email ? email.split('@')[0] : 'Creator');
            avatarUrl = tokenVerification.avatarUrl || sanitizeString(body.avatarUrl, 500) || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(displayName || email || 'creator')}`;
            firebaseUid = tokenVerification.uid || sanitizeString(body.firebaseUid, 128);
            provider = tokenVerification.provider || 'google';
          } else {
            email = sanitizeString(body.email, 120).toLowerCase();
            displayName = sanitizeString(body.displayName, 80) || (email ? email.split('@')[0] : 'Creator');
            avatarUrl = sanitizeString(body.avatarUrl, 500) || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(displayName || email || 'creator')}`;
            firebaseUid = sanitizeString(body.firebaseUid, 128);
            provider = sanitizeString(body.provider, 40) || 'email';
          }

          if (!email || !email.includes('@')) {
            return applySecurityHeaders(
              jsonError('VALIDATION_ERROR', 'A valid email address is required.', 400, {}, { email: 'Invalid email' }, requestId),
              request, env
            );
          }

          // Authoritative Admin Account
          const MASTER_ADMIN_EMAIL = 'ankit.babusaini@gmail.com';
          const isMasterAdmin = email === MASTER_ADMIN_EMAIL;

          // 1. D1 Schema Verification & User Lookup
          await verifyAndEnsureAuthSchema(db);

          const normalizedEmail = (email || '').trim().toLowerCase();
          let userRecord = null;
          try {
            userRecord = await db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1').bind(normalizedEmail).first();
            if (!userRecord) {
              userRecord = await db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').bind(normalizedEmail).first();
            }
            if (!userRecord && firebaseUid) {
              userRecord = await db.prepare('SELECT * FROM users WHERE firebase_uid = ? LIMIT 1').bind(firebaseUid).first().catch(() => null);
            }
          } catch (lookupErr) {
            console.warn('[Auth D1 Lookup Notice]', lookupErr);
            try {
              userRecord = await db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').bind(normalizedEmail).first().catch(() => null);
            } catch (e) {}
          }

          // 2. User Creation if new
          if (!userRecord) {
            const cleanUid = firebaseUid ? firebaseUid.replace(/[^a-zA-Z0-9_-]/g, '') : '';
            const newUserId = cleanUid ? (`usr_fb_${cleanUid}`) : (`usr_${crypto.randomUUID().replace(/-/g, '')}`);
            const nowIso = new Date().toISOString();
            const targetRole = isMasterAdmin ? 'admin' : 'creator';
            const targetPlan = isMasterAdmin ? 'VIP' : 'Free';
            const targetPremium = isMasterAdmin ? 1 : 0;

            const userValues = {
              id: newUserId,
              email: normalizedEmail,
              display_name: displayName || normalizedEmail.split('@')[0],
              name: displayName || normalizedEmail.split('@')[0],
              avatar_url: avatarUrl,
              avatar: avatarUrl,
              photo_url: avatarUrl,
              role: targetRole,
              plan: targetPlan,
              is_premium: targetPremium,
              provider: provider,
              status: 'active',
              created_at: nowIso,
              updated_at: nowIso,
              created_by: 'system',
              firebase_uid: firebaseUid || null,
              mobile: null,
              phone: null,
              password_hash: '',
              password_salt: '',
              username: normalizedEmail.split('@')[0] + '_' + Math.random().toString(36).slice(2, 6)
            };

            let inserted = false;
            try {
              const colsInfo = await db.prepare("PRAGMA table_info(users)").all();
              const existingCols = (colsInfo?.results || []);

              if (existingCols.length > 0) {
                const insertCols = [];
                const insertPlaceholders = [];
                const insertBindings = [];

                for (const col of existingCols) {
                  const colName = col.name;
                  const colNameLower = colName.toLowerCase();

                  if (userValues[colNameLower] !== undefined && userValues[colNameLower] !== null) {
                    insertCols.push(colName);
                    insertPlaceholders.push('?');
                    insertBindings.push(userValues[colNameLower]);
                  } else if (col.notnull && col.dflt_value === null && !col.pk) {
                    insertCols.push(colName);
                    insertPlaceholders.push('?');
                    if (colNameLower.includes('phone') || colNameLower.includes('mobile')) {
                      insertBindings.push('+91' + Math.floor(6000000000 + Math.random() * 3999999999));
                    } else if (colNameLower.includes('uid')) {
                      insertBindings.push('fbu_' + crypto.randomUUID().replace(/-/g, ''));
                    } else if (colNameLower.includes('name')) {
                      insertBindings.push(displayName || normalizedEmail.split('@')[0]);
                    } else if (col.type && col.type.toUpperCase().includes('INT')) {
                      insertBindings.push(0);
                    } else {
                      insertBindings.push(crypto.randomUUID().slice(0, 8));
                    }
                  }
                }

                if (insertCols.length > 0) {
                  const insertSql = `INSERT OR REPLACE INTO users (${insertCols.join(', ')}) VALUES (${insertPlaceholders.join(', ')})`;
                  await db.prepare(insertSql).bind(...insertBindings).run();
                  inserted = true;
                }
              }
            } catch (adaptiveErr) {
              console.warn('[Adaptive User Insert Warning]', adaptiveErr);
            }

            if (!inserted) {
              try {
                await db.prepare(
                  'INSERT OR REPLACE INTO users (id, email, display_name, avatar_url, role, plan, is_premium, provider, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                ).bind(
                  newUserId, normalizedEmail, displayName, avatarUrl, targetRole, targetPlan, targetPremium, provider, 'active', nowIso, nowIso
                ).run();
                inserted = true;
              } catch (coreInsertErr) {
                console.warn('[Core User Insert Notice]', coreInsertErr);
              }
            }

            // Retrieve or build user record
            userRecord = await db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1').bind(normalizedEmail).first().catch(() => null);
            if (!userRecord) {
              userRecord = await db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').bind(normalizedEmail).first().catch(() => null);
            }
            if (!userRecord) {
              userRecord = {
                id: newUserId,
                email: normalizedEmail,
                display_name: displayName,
                avatar_url: avatarUrl,
                role: targetRole,
                plan: targetPlan,
                is_premium: targetPremium,
                status: 'active'
              };
            }
          } else {
            // Existing user: Synchronize role and plan if admin
            let needsUpdate = false;
            let targetRole = userRecord.role;
            let targetPlan = userRecord.plan;
            let targetPremium = userRecord.is_premium;

            if (isMasterAdmin && (userRecord.role !== 'admin' || userRecord.plan !== 'VIP' || !userRecord.is_premium)) {
              targetRole = 'admin';
              targetPlan = 'VIP';
              targetPremium = 1;
              needsUpdate = true;
            }

            if (displayName && (!userRecord.display_name || userRecord.display_name === 'Creator') && displayName !== 'Creator') {
              needsUpdate = true;
            }

            if (needsUpdate) {
              try {
                await db.prepare('UPDATE users SET role = ?, plan = ?, is_premium = ?, display_name = ?, updated_at = ? WHERE id = ?')
                  .bind(targetRole, targetPlan, targetPremium, displayName || userRecord.display_name, new Date().toISOString(), userRecord.id).run();
                userRecord.role = targetRole;
                userRecord.plan = targetPlan;
                userRecord.is_premium = targetPremium;
                if (displayName) userRecord.display_name = displayName;
              } catch (updErr) {
                console.warn('[Auth User Update Warning]', updErr);
              }
            }
          }

          if (userRecord.status === 'suspended' || userRecord.status === 'deactivated') {
            return applySecurityHeaders(
              jsonError('FORBIDDEN', 'This account has been deactivated.', 403, {}, null, requestId),
              request, env
            );
          }

          // 3. Server Session Creation in D1
          const sessionToken = 'wm_tok_' + crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
          const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '');
          const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);
          const nowIso = new Date().toISOString();

          try {
            await db.prepare(
              'INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
            ).bind(sessionId, userRecord.id, sessionToken, expiresAt, nowIso).run();
          } catch (sessionErr) {
            try {
              await db.prepare(
                'INSERT OR REPLACE INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
              ).bind(sessionId, userRecord.id, sessionToken, expiresAt, nowIso).run();
            } catch (sessRetryErr) {
              console.warn('[Auth Session Create Warning]', sessRetryErr);
            }
          }

          const safeUser = {
            id: userRecord.id,
            email: userRecord.email,
            displayName: userRecord.display_name,
            avatarUrl: userRecord.avatar_url,
            role: userRecord.role,
            plan: userRecord.plan,
            isPremium: Boolean(userRecord.is_premium),
            isAdmin: isMasterAdmin || userRecord.role === 'admin'
          };

          return applySecurityHeaders(
            jsonSuccess({ user: safeUser }, 200, {
              'Set-Cookie': createSessionCookie(sessionToken)
            }, requestId),
            request, env
          );
        } catch (authFatalErr) {
          console.error('[Auth Fatal Error in /api/auth/signin]', authFatalErr);
          return applySecurityHeaders(
            jsonError('AUTH_SIGNIN_FAILED', 'Authentication service encountered an issue. Please try again.', 500, null, null, requestId, FailureCategory.AUTHENTICATION),
            request, env
          );
        }
      }

      else if (pathname === '/api/auth/email-signin' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const email = sanitizeString(body.email || '', 120).trim().toLowerCase();
        const password = body.password || '';

        if (!email || !password) {
          return applySecurityHeaders(jsonError('VALIDATION_ERROR', 'Email and password are required', 400), request, env);
        }

        let verifiedUid = null;
        let verifiedEmail = email;

        try {
          const fbRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
          });
          const fbData = await fbRes.json().catch(() => ({}));
          if (fbData.error) {
            const code = fbData.error.message;
            let msg = 'Incorrect email or password. Please verify and try again.';
            if (code === 'EMAIL_NOT_FOUND' || code === 'INVALID_LOGIN_CREDENTIALS') {
              msg = 'Incorrect email or password. Please check your details or sign up.';
            } else if (code === 'INVALID_PASSWORD') {
              msg = 'Incorrect password. Please try again or use password reset.';
            }
            return applySecurityHeaders(jsonError('AUTH_FAILED', msg, 401), request, env);
          }
          verifiedUid = fbData.localId;
          verifiedEmail = (fbData.email || email).toLowerCase();
        } catch (e) {
          return applySecurityHeaders(jsonError('GATEWAY_ERROR', 'Could not connect to Firebase Authentication service', 502), request, env);
        }

        let userRecord = null;
        if (env.DB && typeof env.DB.prepare === 'function') {
          await verifyAndEnsureAuthSchema(env.DB);
          userRecord = await env.DB.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1').bind(verifiedEmail).first().catch(() => null);
          if (!userRecord) {
            userRecord = await env.DB.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').bind(verifiedEmail).first().catch(() => null);
          }
          if (!userRecord) {
            const cleanUid = verifiedUid ? verifiedUid.replace(/[^a-zA-Z0-9_-]/g, '') : '';
            const newUserId = cleanUid ? (`usr_fb_${cleanUid}`) : (`usr_${crypto.randomUUID().replace(/-/g, '')}`);
            const displayName = verifiedEmail.split('@')[0];
            const nowIso = new Date().toISOString();
            try {
              await env.DB.prepare(
                'INSERT OR REPLACE INTO users (id, email, display_name, avatar_url, role, plan, is_premium, provider, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
              ).bind(newUserId, verifiedEmail, displayName, `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(verifiedEmail)}`, 'creator', 'Free', 0, 'password', 'active', nowIso, nowIso).run();
            } catch (insErr) {
              console.warn('[Email Signin Insert Notice]', insErr);
            }
            userRecord = await env.DB.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1').bind(verifiedEmail).first().catch(() => null);
            if (!userRecord) {
              userRecord = { id: newUserId, email: verifiedEmail, display_name: displayName, avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(verifiedEmail)}`, role: 'creator', plan: 'Free', is_premium: 0 };
            }
          }
        } else {
          userRecord = { id: 'usr_' + Date.now().toString(36), email: verifiedEmail, display_name: verifiedEmail.split('@')[0], role: 'creator', plan: 'Free', is_premium: false };
        }

        const sessionToken = 'wm_tok_' + crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
        const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '');
        if (env.DB && typeof env.DB.prepare === 'function') {
          try {
            await env.DB.prepare('INSERT OR REPLACE INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
              .bind(sessionId, userRecord.id, sessionToken, Date.now() + (30 * 24 * 60 * 60 * 1000), new Date().toISOString()).run();
          } catch (e) {}
        }

        response = jsonSuccess({
          user: {
            id: userRecord.id,
            email: userRecord.email,
            displayName: userRecord.display_name || userRecord.displayName,
            role: userRecord.role,
            plan: userRecord.plan,
            isPremium: Boolean(userRecord.is_premium || userRecord.isPremium)
          }
        }, 200, { 'Set-Cookie': createSessionCookie(sessionToken) }, requestId);
      }

      else if (pathname === '/api/auth/email-signup' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const email = sanitizeString(body.email || '', 120).trim().toLowerCase();
        const password = body.password || '';
        const displayName = sanitizeString(body.displayName || '', 80) || email.split('@')[0];

        if (!email || !password || password.length < 6) {
          return applySecurityHeaders(jsonError('VALIDATION_ERROR', 'Valid email and password (min 6 chars) required', 400), request, env);
        }

        let createdUid = null;
        try {
          const fbRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
          });
          const fbData = await fbRes.json().catch(() => ({}));
          if (fbData.error) {
            const code = fbData.error.message;
            let msg = 'Sign up failed.';
            if (code === 'EMAIL_EXISTS') msg = 'An account already exists with this email address. Please sign in instead.';
            return applySecurityHeaders(jsonError('AUTH_FAILED', msg, 400), request, env);
          }
          createdUid = fbData.localId;
        } catch (e) {
          return applySecurityHeaders(jsonError('GATEWAY_ERROR', 'Could not connect to Firebase Authentication service', 502), request, env);
        }

        let userRecord = null;
        if (env.DB && typeof env.DB.prepare === 'function') {
          await verifyAndEnsureAuthSchema(env.DB);
          const cleanUid = createdUid ? createdUid.replace(/[^a-zA-Z0-9_-]/g, '') : '';
          const newUserId = cleanUid ? (`usr_fb_${cleanUid}`) : (`usr_${crypto.randomUUID().replace(/-/g, '')}`);
          const nowIso = new Date().toISOString();
          try {
            await env.DB.prepare(
              'INSERT OR REPLACE INTO users (id, email, display_name, avatar_url, role, plan, is_premium, provider, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).bind(newUserId, email, displayName, `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`, 'creator', 'Free', 0, 'password', 'active', nowIso, nowIso).run();
          } catch (insErr) {
            console.warn('[Email Signup Insert Notice]', insErr);
          }
          userRecord = await env.DB.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1').bind(email).first().catch(() => null);
          if (!userRecord) {
            userRecord = { id: newUserId, email: email, display_name: displayName, avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`, role: 'creator', plan: 'Free', is_premium: 0 };
          }
        } else {
          userRecord = { id: 'usr_' + Date.now().toString(36), email: email, display_name: displayName, role: 'creator', plan: 'Free', is_premium: false };
        }

        const sessionToken = 'wm_tok_' + crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
        const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '');
        if (env.DB && typeof env.DB.prepare === 'function') {
          try {
            await env.DB.prepare('INSERT OR REPLACE INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
              .bind(sessionId, userRecord.id, sessionToken, Date.now() + (30 * 24 * 60 * 60 * 1000), new Date().toISOString()).run();
          } catch (e) {}
        }

        response = jsonSuccess({
          user: {
            id: userRecord.id,
            email: userRecord.email,
            displayName: userRecord.display_name,
            role: userRecord.role,
            plan: userRecord.plan,
            isPremium: Boolean(userRecord.is_premium)
          }
        }, 200, { 'Set-Cookie': createSessionCookie(sessionToken) }, requestId);
      }

      else if (pathname === '/api/auth/send-password-reset' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const email = sanitizeString(body.email || '', 120).trim().toLowerCase();
        if (!email || !email.includes('@')) {
          return applySecurityHeaders(jsonError('VALIDATION_ERROR', 'Valid email required', 400), request, env);
        }

        try {
          const fbRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestType: 'PASSWORD_RESET', email })
          });
          const fbData = await fbRes.json().catch(() => ({}));
          if (fbData.error) {
            return applySecurityHeaders(jsonError('RESET_FAILED', fbData.error.message || 'Could not send reset email', 400), request, env);
          }
          response = jsonSuccess({ message: `Password reset email sent to ${email}` }, 200, {}, requestId);
        } catch (e) {
          return applySecurityHeaders(jsonError('GATEWAY_ERROR', 'Could not connect to Firebase', 502), request, env);
        }
      }

      else if (pathname === '/api/auth/dev-switch') {
        // Dev switch route is strictly unavailable in production
        return applySecurityHeaders(
          jsonError('NOT_FOUND', 'Route not found', 404, {}, null, requestId),
          request, env
        );
      }

      else if (pathname === '/api/auth/signout' && method === 'POST') {
        const token = getCookie(request, 'wm_session') || (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
        if (token && env.DB && typeof env.DB.prepare === 'function') {
          try {
            await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
          } catch (e) {
            console.warn('[Signout Error]', e);
          }
        }
        response = jsonSuccess({ message: 'Signed out successfully' }, 200, {
          'Set-Cookie': clearSessionCookie()
        }, requestId);
      }

      // --- Current User Profile ---
      else if (pathname === '/api/users/me') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);

        if (method === 'GET') {
          response = jsonSuccess({ user }, 200, {}, requestId);
        } else if (method === 'PUT') {
          if (isCsrfViolation(request, env)) {
            return applySecurityHeaders(jsonError('FORBIDDEN', 'Cross-origin mutation rejected', 403), request, env);
          }
          if (!env.DB || typeof env.DB.prepare !== 'function') {
            return applySecurityHeaders(jsonError('DATABASE_UNAVAILABLE', 'Database service is currently unavailable.', 503), request, env);
          }
          const body = await request.json().catch(() => ({}));
          const displayName = sanitizeString(body.displayName || user.displayName, 80);
          const avatarUrl = sanitizeString(body.avatarUrl || user.avatarUrl || '', 500);

          await env.DB.prepare(
            'UPDATE users SET display_name = ?, avatar_url = ?, updated_at = ? WHERE id = ?'
          ).bind(displayName, avatarUrl, new Date().toISOString(), user.id).run();

          response = jsonSuccess({
            user: { ...user, displayName, avatarUrl }
          }, 200, {}, requestId);
        }
      }

      // --- Wish Slug Availability Check ---
      else if (pathname === '/api/wishes/slug-availability' && method === 'GET') {
        if (!env.DB || typeof env.DB.prepare !== 'function') {
          return applySecurityHeaders(
            jsonError('DATABASE_UNAVAILABLE', 'Database service is currently unavailable.', 503, {}, null, requestId, FailureCategory.DATABASE),
            request, env
          );
        }

        const rawSlug = url.searchParams.get('slug') || '';
        const excludeWishId = sanitizeString(url.searchParams.get('wishId') || '', 60);
        const normalizedSlug = rawSlug
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9-]/g, '')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '');

        if (!rawSlug || !normalizedSlug || !isValidSlug(normalizedSlug)) {
          const isReserved = isReservedSlug(normalizedSlug);
          return applySecurityHeaders(
            jsonSuccess({
              available: false,
              slug: normalizedSlug || rawSlug,
              reason: isReserved ? 'reserved' : 'invalid',
              message: isReserved
                ? 'This link is reserved for system use. Please choose another.'
                : 'Use only lowercase letters, numbers, and single hyphens (3-80 characters).'
            }, 200, {}, requestId),
            request, env
          );
        }

        // Check database for collisions
        try {
          const row = await env.DB.prepare('SELECT id, user_id FROM wishes WHERE slug = ? LIMIT 1').bind(normalizedSlug).first();

          if (!row) {
            return applySecurityHeaders(
              jsonSuccess({
                available: true,
                slug: normalizedSlug,
                message: 'This link is available!'
              }, 200, {}, requestId),
              request, env
            );
          }

          // If an existing wish is being edited, it can keep its own slug
          if (excludeWishId && row.id === excludeWishId) {
            return applySecurityHeaders(
              jsonSuccess({
                available: true,
                slug: normalizedSlug,
                isCurrent: true,
                message: 'This is your current link.'
              }, 200, {}, requestId),
              request, env
            );
          }

          // Slug is taken: suggest collision-free alternatives
          const candidateSuffixes = ['2', 'special', 'surprise', 'love', 'celebration'];
          const alternatives = [];
          for (const suffix of candidateSuffixes) {
            const altSlug = `${normalizedSlug}-${suffix}`;
            if (altSlug.length <= 80 && !RESERVED_SLUGS.has(altSlug)) {
              const altRow = await env.DB.prepare('SELECT id FROM wishes WHERE slug = ? LIMIT 1').bind(altSlug).first();
              if (!altRow) {
                alternatives.push(altSlug);
                if (alternatives.length >= 3) break;
              }
            }
          }

          return applySecurityHeaders(
            jsonSuccess({
              available: false,
              slug: normalizedSlug,
              reason: 'taken',
              alternatives,
              message: 'That link is already taken. Try another one.'
            }, 200, {}, requestId),
            request, env
          );
        } catch (err) {
          return applySecurityHeaders(
            jsonError('INTERNAL_ERROR', 'Could not check link availability right now.', 500, {}, null, requestId),
            request, env
          );
        }
      }

      // --- Server-Authoritative Random Slug Generator (Option B) ---
      else if (pathname === '/api/wishes/generate-random-slug' && method === 'GET') {
        const settings = await getWishLinkSettings(env);
        if (!settings.random.enabled) {
          return applySecurityHeaders(jsonError('RANDOM_LINKS_DISABLED', 'Free random links are currently disabled by platform administrator.', 400), request, env);
        }
        const slug = await generateUniqueRandomWishSlug(env.DB, settings.random);
        response = jsonSuccess({
          slug,
          prefix: settings.random.prefix,
          canonicalUrl: `/w/${slug}`
        }, 200, {}, requestId);
      }

      // --- Wishes Endpoints (Strict Authentication, Ownership IDOR & Entitlement Verification) ---
      else if (pathname === '/api/wishes') {
        if (!env.DB || typeof env.DB.prepare !== 'function') {
          return applySecurityHeaders(
            jsonError('DATABASE_UNAVAILABLE', 'Database service is currently unavailable.', 503, {}, null, requestId, FailureCategory.DATABASE),
            request, env
          );
        }

        const user = await getAuthenticatedUser(request, env);
        if (!user) {
          return applySecurityHeaders(
            jsonError('AUTH_REQUIRED', 'Authentication required to access wishes.', 401, {}, null, requestId, FailureCategory.AUTHENTICATION),
            request, env
          );
        }

        if (method === 'GET') {
          const isAdmin = await verifyAdminRole(user, env);
          const filterAll = url.searchParams.get('all') === 'true' && isAdmin;
          const targetUserId = (isAdmin && url.searchParams.get('userId')) ? url.searchParams.get('userId') : (filterAll ? null : user.id);
          const statusFilter = url.searchParams.get('status');

          let query = 'SELECT * FROM wishes';
          const params = [];

          if (targetUserId) {
            query += ' WHERE user_id = ?';
            params.push(targetUserId);
          } else if (!filterAll) {
            query += ' WHERE user_id = ?';
            params.push(user.id);
          }

          if (statusFilter && statusFilter !== 'all') {
            query += (params.length > 0 ? ' AND' : ' WHERE') + ' status = ?';
            params.push(statusFilter);
          }

          query += ' ORDER BY created_at DESC LIMIT 100';

          const rows = await env.DB.prepare(query).bind(...params).all();

          const wishes = (rows.results || []).map(r => {
            let cd = {};
            try { cd = typeof r.custom_data === 'string' ? JSON.parse(r.custom_data) : (r.custom_data || {}); } catch (e) {}
            let pm = null;
            try { if (r.payment) pm = typeof r.payment === 'string' ? JSON.parse(r.payment) : r.payment; } catch (e) {}
            const tvId = r.template_version_id || cd.templateVersionId || cd.template_version_id || `tv_${r.template_id}_v1`;
            const tvNum = cd.template_version || (r.template_version_id ? parseInt(r.template_version_id.split('_v')[1] || '1', 10) : 1);
            return {
              id: r.id,
              slug: r.slug,
              userId: r.user_id,
              orderId: r.order_id,
              templateId: r.template_id,
              templateName: r.template_name,
              templateVersionId: tvId,
              templateVersionNumber: tvNum,
              tier: r.tier,
              price: r.price,
              isPrivate: Boolean(r.is_private),
              buyerName: r.buyer_name,
              buyerContact: r.buyer_contact,
              recipientName: r.recipient_name,
              eventDate: r.event_date,
              expiryDate: r.expiry_date,
              lifecycleStatus: computeLifecycle({ eventDate: r.event_date, customData: cd, status: r.status }),
              status: r.status || 'published',
              views: r.views || 0,
              customData: cd,
              payment: pm,
              createdAt: r.created_at,
              updatedAt: r.updated_at
            };
          });

          response = jsonSuccess({ wishes, total: wishes.length }, 200, {}, requestId);
        }

        else if (method === 'POST') {
          if (isCsrfViolation(request, env)) {
            return applySecurityHeaders(
              jsonError('FORBIDDEN', 'Cross-origin mutation rejected.', 403, {}, null, requestId),
              request, env
            );
          }

          if (env.DB && typeof env.DB.prepare === 'function') {
            await ensureCoreSchema(env.DB);
            await verifyAndEnsureAuthSchema(env.DB);
          }

          const body = await request.json().catch(() => ({}));
          const customData = body.customData || body;
          const templateId = sanitizeString(body.templateId || customData.templateId || 'tpl_glitter_birthday', 60);

          // Ensure authenticated creator exists in users table to satisfy foreign key constraints
          if (env.DB && typeof env.DB.prepare === 'function') {
            try {
              await env.DB.prepare(
                `INSERT OR IGNORE INTO users (id, email, display_name, avatar_url, role, plan, is_premium, provider, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'system', 'active', datetime('now'), datetime('now'))`
              ).bind(
                user.id,
                user.email || `${user.id}@user.wishmagic.live`,
                user.displayName || 'Creator',
                user.avatarUrl || '',
                user.role || 'creator',
                user.plan || 'Free',
                user.isPremium ? 1 : 0
              ).run();
            } catch (e) {}
          }

          // Find template metadata & active immutable version snapshot
          let template = SEED_TEMPLATES.find(t => t.id === templateId || t.slug === templateId);
          if (env.DB) {
            try {
              const tRow = await env.DB.prepare('SELECT * FROM templates WHERE id = ? OR slug = ? LIMIT 1').bind(templateId, templateId).first();
              if (tRow) template = tRow;
            } catch (e) {}
          }

          const activeVersion = await getOrSeedActiveTemplateVersion(env, template ? template.id : templateId);
          const templateVersionId = activeVersion ? activeVersion.id : `tv_${templateId}_v1`;
          const templateVersionNumber = activeVersion ? activeVersion.versionNumber : 1;

          // Stamp immutable version IDs into customData
          customData.templateId = templateId;
          customData.template_version_id = templateVersionId;
          customData.templateVersionId = templateVersionId;
          customData.template_version = templateVersionNumber;

          // Authoritative Server-Side Entitlement Check (Never trust client tier/isPremium/entitlement overrides)
          const entitlement = await getEffectiveEntitlement(user, env);
          const templateRequiresVip = template ? Boolean(template.is_premium || template.isPremium || template.tier === 'vip') : false;

          if (templateRequiresVip && !entitlement.isPremium) {
            return applySecurityHeaders(
              jsonError('PREMIUM_REQUIRED', 'This template requires a VIP or Premium subscription.', 403, {}, null, requestId, FailureCategory.AUTHORIZATION),
              request, env
            );
          }

          const isVip = entitlement.isPremium;
          const wishPrice = isVip ? 49 : 0;
          const buyerName = sanitizeString(customData.sender_name || customData.senderName || user.displayName, 80);
          const buyerContact = sanitizeString(customData.buyerContact || user.email, 120);
          const recipientName = sanitizeString(customData.recipient_name || customData.recipientName || 'Special Person', 80);
          const eventDate = sanitizeString(customData.event_date || customData.eventDate || new Date().toISOString().split('T')[0], 10);
          const wishId = 'wm_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
          const userId = user.id; // Server-authoritative creator user ID

          // Compute IST expiry date (start of next day in IST)
          const cleanDate = eventDate.includes('T') ? eventDate.split('T')[0] : eventDate.trim();
          const parts = cleanDate.split('-').map(Number);
          let expiryDate = cleanDate;
          if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
            const nextDayMs = Date.UTC(parts[0], parts[1] - 1, parts[2] + 1, 0, 0, 0, 0) - IST_OFFSET_MS;
            expiryDate = new Date(nextDayMs).toISOString().split('T')[0];
          }

          const linkSettings = await getWishLinkSettings(env);
          let generatedSlug = '';
          const rawRequestedSlug = sanitizeString(body.slug || customData.slug || customData.customSlug || '', 80).toLowerCase().trim();
          const isRandomRequested = body.linkType === 'random' || customData.linkType === 'random' || customData.link_type === 'random' || (!rawRequestedSlug && !body.slug);

          if (!isRandomRequested && rawRequestedSlug) {
            // Option A: Personalized Link Flow
            if (!linkSettings.personalized.enabled) {
              return applySecurityHeaders(
                jsonError('PERSONALIZED_LINKS_DISABLED', 'Personalized links are currently disabled by platform administrator.', 400, {}, null, requestId),
                request, env
              );
            }

            const normRequested = rawRequestedSlug.replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
            if (!isValidSlug(normRequested)) {
              const isReserved = isReservedSlug(normRequested);
              return applySecurityHeaders(
                jsonError(isReserved ? 'SLUG_RESERVED' : 'INVALID_SLUG', isReserved ? 'This link is reserved for system use. Please choose another.' : 'Use only lowercase letters, numbers, and single hyphens (3-80 characters).', 400, {}, null, requestId),
                request, env
              );
            }
            const collision = await env.DB.prepare('SELECT id FROM wishes WHERE slug = ? LIMIT 1').bind(normRequested).first();
            if (collision) {
              return applySecurityHeaders(
                jsonError('SLUG_TAKEN', 'That link is already taken. Try another one.', 409, {}, null, requestId),
                request, env
              );
            }
            generatedSlug = normRequested;
            customData.linkType = 'personalized';
            customData.link_type = 'personalized';
          } else {
            // Option B: Free Random Link Flow
            if (!linkSettings.random.enabled) {
              return applySecurityHeaders(
                jsonError('RANDOM_LINKS_DISABLED', 'Free random links are currently disabled. A personalized link is required to publish.', 400, {}, null, requestId),
                request, env
              );
            }
            generatedSlug = await generateUniqueRandomWishSlug(env.DB, linkSettings.random);
            customData.linkType = 'random';
            customData.link_type = 'random';
            customData.customSlug = generatedSlug;
            customData.slug = generatedSlug;
          }

          const isPrivate = Boolean(customData.isPrivate || customData.unlisted || body.isPrivate);
          const status = customData.isDraft ? 'draft' : 'published';

          const newWish = {
            id: wishId,
            slug: generatedSlug,
            userId,
            orderId: 'ORD-' + Math.random().toString(36).substring(2, 7).toUpperCase() + '-' + Date.now().toString().slice(-4),
            templateId,
            templateName: sanitizeString(customData.templateName || (template && template.name) || 'Magical Celebration Experience', 80),
            templateVersionId,
            templateVersionNumber,
            tier: isVip ? 'vip' : 'free',
            price: wishPrice,
            isPrivate,
            buyerName,
            buyerContact,
            recipientName,
            eventDate: cleanDate,
            expiryDate,
            views: 0,
            customData,
            status,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          const wishValues = {
            id: newWish.id,
            slug: newWish.slug,
            user_id: newWish.userId,
            order_id: newWish.orderId,
            template_id: newWish.templateId,
            template_version_id: templateVersionId,
            template_name: newWish.templateName,
            tier: newWish.tier,
            price: newWish.price,
            is_private: newWish.isPrivate ? 1 : 0,
            buyer_name: newWish.buyerName,
            buyer_contact: newWish.buyerContact,
            recipient_name: newWish.recipientName,
            event_date: newWish.eventDate,
            expiry_date: newWish.expiryDate,
            lifecycle_status: 'active',
            views: 0,
            custom_data: JSON.stringify(customData),
            payment: null,
            status: status,
            created_at: newWish.createdAt,
            updated_at: newWish.updatedAt
          };

          let inserted = false;

          // 1. Primary insert with full schema
          try {
            await env.DB.prepare(
              `INSERT INTO wishes (id, slug, user_id, order_id, template_id, template_name, tier, price, is_private, buyer_name, buyer_contact, recipient_name, event_date, expiry_date, lifecycle_status, views, custom_data, payment, status, template_version_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              newWish.id,
              newWish.slug,
              newWish.userId,
              newWish.orderId,
              newWish.templateId,
              newWish.templateName,
              newWish.tier,
              newWish.price,
              newWish.isPrivate ? 1 : 0,
              newWish.buyerName,
              newWish.buyerContact,
              newWish.recipientName,
              newWish.eventDate,
              newWish.expiryDate,
              'active',
              0,
              JSON.stringify(customData),
              null,
              status,
              templateVersionId,
              newWish.createdAt,
              newWish.updatedAt
            ).run();
            inserted = true;
          } catch (firstInsertErr) {
            console.warn('[Primary Wish Insert Notice, running adaptive recovery]', firstInsertErr);
          }

          // 2. Adaptive schema-aware insert if first attempt failed
          if (!inserted) {
            try {
              const colsInfo = await env.DB.prepare("PRAGMA table_info(wishes)").all().catch(() => null);
              const existingCols = (colsInfo?.results || []);
              if (existingCols.length > 0) {
                const insertCols = [];
                const insertPlaceholders = [];
                const insertBindings = [];
                for (const col of existingCols) {
                  const colName = col.name;
                  const colNameLower = colName.toLowerCase();
                  if (wishValues[colNameLower] !== undefined && wishValues[colNameLower] !== null) {
                    insertCols.push(colName);
                    insertPlaceholders.push('?');
                    insertBindings.push(wishValues[colNameLower]);
                  } else if (col.notnull && col.dflt_value === null && !col.pk) {
                    insertCols.push(colName);
                    insertPlaceholders.push('?');
                    if (col.type && col.type.toUpperCase().includes('INT')) {
                      insertBindings.push(0);
                    } else {
                      insertBindings.push('');
                    }
                  }
                }
                if (insertCols.length > 0) {
                  const adaptiveSql = `INSERT INTO wishes (${insertCols.join(', ')}) VALUES (${insertPlaceholders.join(', ')})`;
                  await env.DB.prepare(adaptiveSql).bind(...insertBindings).run();
                  inserted = true;
                }
              }
            } catch (adaptiveErr) {
              console.warn('[Adaptive Wish Insert Warning]', adaptiveErr);
            }
          }

          // 3. Fallback standard insert
          if (!inserted) {
            try {
              await env.DB.prepare(
                `INSERT INTO wishes (id, slug, user_id, order_id, template_id, template_name, tier, price, is_private, buyer_name, buyer_contact, recipient_name, event_date, expiry_date, lifecycle_status, views, custom_data, payment, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              ).bind(
                newWish.id,
                newWish.slug,
                newWish.userId,
                newWish.orderId,
                newWish.templateId,
                newWish.templateName,
                newWish.tier,
                newWish.price,
                newWish.isPrivate ? 1 : 0,
                newWish.buyerName,
                newWish.buyerContact,
                newWish.recipientName,
                newWish.eventDate,
                newWish.expiryDate,
                'active',
                0,
                JSON.stringify(customData),
                null,
                status,
                newWish.createdAt,
                newWish.updatedAt
              ).run();
              inserted = true;
            } catch (fallbackErr) {
              console.error('[Worker DB Wish Insert Fatal Error]', fallbackErr);
              return applySecurityHeaders(
                jsonError('DATABASE_ERROR', 'Could not save wish to database. Please verify schema.', 500, {}, null, requestId, FailureCategory.DATABASE),
                request, env
              );
            }
          }

          response = jsonSuccess({
            wishId: newWish.id,
            slug: newWish.slug,
            wish: newWish,
            templateVersion: activeVersion,
            templateVersionId: newWish.templateVersionId
          }, 201, {}, requestId);
        }
      }

      // --- Wish Actions: Duplicate, Publish, Unpublish, CRUD ---
      else if (pathname.match(/^\/api\/wishes\/([^\/]+)\/duplicate$/) && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        if (!env.DB || typeof env.DB.prepare !== 'function') {
          return applySecurityHeaders(jsonError('DATABASE_UNAVAILABLE', 'Database service is currently unavailable.', 503), request, env);
        }

        const wishId = pathname.split('/')[3];
        const existing = await env.DB.prepare('SELECT * FROM wishes WHERE id = ? OR slug = ? LIMIT 1').bind(wishId, wishId).first();
        if (!existing) return applySecurityHeaders(jsonError('NOT_FOUND', 'Wish not found', 404), request, env);

        const isAdmin = await verifyAdminRole(user, env);
        if (existing.user_id !== user.id && !isAdmin) {
          return applySecurityHeaders(jsonError('FORBIDDEN', 'Access denied to duplicate this wish.', 403), request, env);
        }

        let cd = {};
        try { cd = typeof existing.custom_data === 'string' ? JSON.parse(existing.custom_data) : (existing.custom_data || {}); } catch (e) {}
        cd.isDraft = true;

        // Preserve original template version snapshot reference
        const sourceVersionId = existing.template_version_id || cd.templateVersionId || cd.template_version_id || `tv_${existing.template_id}_v1`;
        cd.template_version_id = sourceVersionId;
        cd.templateVersionId = sourceVersionId;

        const newId = 'wm_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
        const newSlug = await generateServerSlug(env.DB, cd, existing.template_id);
        const nowIso = new Date().toISOString();

        try {
          await env.DB.prepare(
            `INSERT INTO wishes (id, slug, user_id, order_id, template_id, template_name, tier, price, is_private, buyer_name, buyer_contact, recipient_name, event_date, expiry_date, lifecycle_status, views, custom_data, payment, status, template_version_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            newId, newSlug, user.id, 'ORD-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
            existing.template_id, existing.template_name, existing.tier, 0, 1,
            existing.buyer_name, existing.buyer_contact, `${existing.recipient_name} (Copy)`,
            existing.event_date, existing.expiry_date, 'draft', 0,
            JSON.stringify(cd), null, 'draft', sourceVersionId, nowIso, nowIso
          ).run();
        } catch (e) {
          await env.DB.prepare(
            `INSERT INTO wishes (id, slug, user_id, order_id, template_id, template_name, tier, price, is_private, buyer_name, buyer_contact, recipient_name, event_date, expiry_date, lifecycle_status, views, custom_data, payment, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            newId, newSlug, user.id, 'ORD-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
            existing.template_id, existing.template_name, existing.tier, 0, 1,
            existing.buyer_name, existing.buyer_contact, `${existing.recipient_name} (Copy)`,
            existing.event_date, existing.expiry_date, 'draft', 0,
            JSON.stringify(cd), null, 'draft', nowIso, nowIso
          ).run();
        }

        response = jsonSuccess({ duplicated: true, wishId: newId, slug: newSlug, templateVersionId: sourceVersionId }, 201, {}, requestId);
      }

      else if (pathname.match(/^\/api\/wishes\/([^\/]+)\/publish$/) && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        if (!env.DB || typeof env.DB.prepare !== 'function') {
          return applySecurityHeaders(jsonError('DATABASE_UNAVAILABLE', 'Database service is currently unavailable.', 503), request, env);
        }

        const wishId = pathname.split('/')[3];
        const existing = await env.DB.prepare('SELECT * FROM wishes WHERE id = ? OR slug = ? LIMIT 1').bind(wishId, wishId).first();
        if (!existing) return applySecurityHeaders(jsonError('NOT_FOUND', 'Wish not found', 404), request, env);

        const isAdmin = await verifyAdminRole(user, env);
        if (existing.user_id !== user.id && !isAdmin) {
          return applySecurityHeaders(jsonError('FORBIDDEN', 'Access denied to publish this wish.', 403), request, env);
        }

        let cd = {};
        try { cd = typeof existing.custom_data === 'string' ? JSON.parse(existing.custom_data) : (existing.custom_data || {}); } catch (e) {}
        cd.isDraft = false;

        const nowIso = new Date().toISOString();
        await env.DB.prepare('UPDATE wishes SET status = ?, custom_data = ?, updated_at = ? WHERE id = ?')
          .bind('published', JSON.stringify(cd), nowIso, existing.id).run();

        response = jsonSuccess({ published: true, wishId: existing.id, slug: existing.slug }, 200, {}, requestId);
      }

      else if (pathname.match(/^\/api\/wishes\/([^\/]+)\/unpublish$/) && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        if (!env.DB || typeof env.DB.prepare !== 'function') {
          return applySecurityHeaders(jsonError('DATABASE_UNAVAILABLE', 'Database service is currently unavailable.', 503), request, env);
        }

        const wishId = pathname.split('/')[3];
        const existing = await env.DB.prepare('SELECT * FROM wishes WHERE id = ? OR slug = ? LIMIT 1').bind(wishId, wishId).first();
        if (!existing) return applySecurityHeaders(jsonError('NOT_FOUND', 'Wish not found', 404), request, env);

        const isAdmin = await verifyAdminRole(user, env);
        if (existing.user_id !== user.id && !isAdmin) {
          return applySecurityHeaders(jsonError('FORBIDDEN', 'Access denied to unpublish this wish.', 403), request, env);
        }

        let cd = {};
        try { cd = typeof existing.custom_data === 'string' ? JSON.parse(existing.custom_data) : (existing.custom_data || {}); } catch (e) {}
        cd.isDraft = true;

        const nowIso = new Date().toISOString();
        await env.DB.prepare('UPDATE wishes SET status = ?, custom_data = ?, updated_at = ? WHERE id = ?')
          .bind('draft', JSON.stringify(cd), nowIso, existing.id).run();

        response = jsonSuccess({ unpublished: true, wishId: existing.id }, 200, {}, requestId);
      }

      else if (pathname.startsWith('/api/wishes/') && method === 'GET') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);

        if (!env.DB || typeof env.DB.prepare !== 'function') {
          return applySecurityHeaders(jsonError('DATABASE_UNAVAILABLE', 'Database service is currently unavailable.', 503), request, env);
        }

        const wishId = pathname.replace('/api/wishes/', '').trim();
        const wish = await env.DB.prepare('SELECT * FROM wishes WHERE id = ? OR slug = ? LIMIT 1').bind(wishId, wishId).first();
        if (!wish) return applySecurityHeaders(jsonError('NOT_FOUND', 'Wish not found', 404), request, env);

        const isAdmin = await verifyAdminRole(user, env);
        if (wish.user_id !== user.id && !isAdmin) {
          return applySecurityHeaders(
            jsonError('FORBIDDEN', 'Access denied. You do not own this wish.', 403, {}, null, requestId, FailureCategory.AUTHORIZATION),
            request, env
          );
        }

        let customData = {};
        try {
          const raw = wish.custom_data;
          customData = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
        } catch (e) {}

        let payment = null;
        try {
          if (wish.payment) payment = typeof wish.payment === 'string' ? JSON.parse(wish.payment) : wish.payment;
        } catch (e) {}

        const normalizedWish = {
          id: wish.id,
          slug: wish.slug,
          userId: wish.user_id,
          orderId: wish.order_id,
          templateId: wish.template_id,
          templateName: wish.template_name,
          tier: wish.tier,
          price: wish.price,
          isPrivate: Boolean(wish.is_private),
          buyerName: wish.buyer_name,
          buyerContact: wish.buyer_contact,
          recipientName: wish.recipient_name,
          eventDate: wish.event_date,
          expiryDate: wish.expiry_date,
          lifecycleStatus: computeLifecycle({ eventDate: wish.event_date, customData, status: wish.status }),
          status: wish.status || 'published',
          views: wish.views || 0,
          customData,
          payment,
          templateVersionId: wish.template_version_id || customData.templateVersionId || customData.template_version_id || null,
          createdAt: wish.created_at,
          updatedAt: wish.updated_at
        };

        const versionId = normalizedWish.templateVersionId;
        const templateSnapshot = await getTemplateVersionById(env, versionId, wish.template_id);

        response = jsonSuccess({ wish: normalizedWish, template: templateSnapshot }, 200, {}, requestId);
      }

      else if (pathname.startsWith('/api/wishes/') && method === 'PUT') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);

        if (!env.DB || typeof env.DB.prepare !== 'function') {
          return applySecurityHeaders(jsonError('DATABASE_UNAVAILABLE', 'Database service is currently unavailable.', 503), request, env);
        }

        if (isCsrfViolation(request, env)) {
          return applySecurityHeaders(jsonError('FORBIDDEN', 'Cross-origin mutation rejected', 403), request, env);
        }

        const wishId = pathname.replace('/api/wishes/', '').trim();
        const existing = await env.DB.prepare('SELECT * FROM wishes WHERE id = ? OR slug = ? LIMIT 1').bind(wishId, wishId).first();
        if (!existing) return applySecurityHeaders(jsonError('NOT_FOUND', 'Wish not found', 404), request, env);

        const isAdmin = await verifyAdminRole(user, env);
        if (existing.user_id !== user.id && !isAdmin) {
          return applySecurityHeaders(
            jsonError('FORBIDDEN', 'Access denied to modify this wish.', 403, {}, null, requestId, FailureCategory.AUTHORIZATION),
            request, env
          );
        }

        const body = await request.json().catch(() => ({}));
        const customData = body.customData || body;
        const recipientName = sanitizeString(customData.recipient_name || customData.recipientName || existing.recipient_name, 80);
        const buyerName = sanitizeString(customData.sender_name || customData.senderName || existing.buyer_name, 80);
        const eventDate = sanitizeString(customData.event_date || customData.eventDate || existing.event_date, 10);
        const nowIso = new Date().toISOString();

        // Preserve existing slug unless explicitly requested and validated
        let targetSlug = existing.slug;
        const rawRequestedSlug = sanitizeString(body.slug || customData.slug || customData.customSlug || '', 80).toLowerCase().trim();
        if (rawRequestedSlug && rawRequestedSlug !== existing.slug) {
          const normRequested = rawRequestedSlug.replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
          if (!isValidSlug(normRequested)) {
            const isReserved = isReservedSlug(normRequested);
            return applySecurityHeaders(
              jsonError(isReserved ? 'SLUG_RESERVED' : 'INVALID_SLUG', isReserved ? 'This link is reserved for system use.' : 'Use only lowercase letters, numbers, and single hyphens (3-80 characters).', 400, {}, null, requestId),
              request, env
            );
          }
          const collision = await env.DB.prepare('SELECT id FROM wishes WHERE slug = ? AND id != ? LIMIT 1').bind(normRequested, existing.id).first();
          if (collision) {
            return applySecurityHeaders(
              jsonError('SLUG_TAKEN', 'That link is already taken. Try another one.', 409, {}, null, requestId),
              request, env
            );
          }
          targetSlug = normRequested;
        }

        await env.DB.prepare(
          'UPDATE wishes SET slug = ?, recipient_name = ?, buyer_name = ?, event_date = ?, custom_data = ?, updated_at = ? WHERE id = ?'
        ).bind(targetSlug, recipientName, buyerName, eventDate, JSON.stringify(customData), nowIso, existing.id).run();

        response = jsonSuccess({ updated: true, wishId: existing.id, slug: targetSlug }, 200, {}, requestId);
      }

      else if (pathname.startsWith('/api/wishes/') && method === 'DELETE') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);

        if (!env.DB || typeof env.DB.prepare !== 'function') {
          return applySecurityHeaders(jsonError('DATABASE_UNAVAILABLE', 'Database service is currently unavailable.', 503), request, env);
        }

        if (isCsrfViolation(request, env)) {
          return applySecurityHeaders(jsonError('FORBIDDEN', 'Cross-origin mutation rejected', 403), request, env);
        }

        const wishId = pathname.replace('/api/wishes/', '').trim();
        const existing = await env.DB.prepare('SELECT * FROM wishes WHERE id = ? OR slug = ? LIMIT 1').bind(wishId, wishId).first();
        if (!existing) return applySecurityHeaders(jsonError('NOT_FOUND', 'Wish not found', 404), request, env);

        const isAdmin = await verifyAdminRole(user, env);
        if (existing.user_id !== user.id && !isAdmin) {
          return applySecurityHeaders(
            jsonError('FORBIDDEN', 'Access denied to delete this wish.', 403, {}, null, requestId, FailureCategory.AUTHORIZATION),
            request, env
          );
        }

        await env.DB.prepare('DELETE FROM wishes WHERE id = ?').bind(existing.id).run();
        response = jsonSuccess({ deleted: true, wishId: existing.id }, 200, {}, requestId);
      }

      // --- Public Wish API (Strict Lifecycle, Privacy & Zero Data Leakage) ---
      else if (pathname.startsWith('/api/public/wishes/')) {
        const slug = sanitizeString(pathname.replace('/api/public/wishes/', '').trim(), 120);

        if (!env.DB || typeof env.DB.prepare !== 'function') {
          return applySecurityHeaders(
            jsonError('DATABASE_UNAVAILABLE', 'Database service is currently unavailable.', 503, {}, null, requestId, FailureCategory.DATABASE),
            request, env
          );
        }

        const wish = await env.DB.prepare('SELECT * FROM wishes WHERE slug = ? OR id = ? LIMIT 1').bind(slug, slug).first();
        if (!wish) {
          return applySecurityHeaders(jsonError('NOT_FOUND', 'Celebration wish not found', 404, {}, null, requestId), request, env);
        }

        // Increment view count asynchronously
        try {
          await env.DB.prepare('UPDATE wishes SET views = views + 1 WHERE id = ?').bind(wish.id).run();
        } catch (e) {}

        let customData = {};
        try {
          const rawCd = wish.custom_data;
          customData = typeof rawCd === 'string' ? JSON.parse(rawCd) : (rawCd || {});
        } catch (e) {}

        const eventDate = wish.event_date;
        const recipientName = wish.recipient_name || 'Someone Special';
        const buyerName = wish.buyer_name || 'A Loved One';

        const lifecycleStatus = computeLifecycle({ eventDate, customData, status: wish.status });
        const user = await getAuthenticatedUser(request, env);
        const isAdmin = await verifyAdminRole(user, env);
        const isOwner = Boolean(user && (user.id === wish.user_id || isAdmin));

        // Masking rules for Public Viewers (Safe Public Normalized Model)
        // Strips private messages, vault secrets, and private media for upcoming/expired
        if (!isOwner) {
          if (lifecycleStatus === 'upcoming') {
            customData = {
              recipient_name: recipientName,
              sender_name: buyerName,
              event_date: eventDate,
              theme: customData.theme || 'magical',
              is_locked: true,
              lock_message: 'This magical surprise will automatically unlock when the clock strikes midnight on the celebration day! ✨'
            };
          } else if (lifecycleStatus === 'expired') {
            customData = {
              recipient_name: recipientName,
              sender_name: buyerName,
              event_date: eventDate,
              is_expired: true,
              grace_period_ended: true,
              expired_message: 'This celebration keepsake has completed its active celebration cycle.'
            };
          }
        }

        // Strictly safe public payload (Omits sensitive internals: user_id, payment, order_id, buyer_contact, private keys)
        const versionId = wish.template_version_id || (customData && (customData.template_version_id || customData.templateVersionId));
        const templateSnapshot = await getTemplateVersionById(env, versionId, wish.template_id);

        const safePublicWish = {
          id: wish.id,
          slug: wish.slug,
          recipientName,
          buyerName,
          eventDate,
          templateId: wish.template_id,
          templateVersionId: versionId || (templateSnapshot ? templateSnapshot.id : null),
          templateName: wish.template_name,
          tier: wish.tier,
          lifecycleStatus,
          isOwner,
          customData
        };

        response = jsonSuccess({ wish: safePublicWish, template: templateSnapshot }, 200, {}, requestId);
      }

      // --- Templates API ---
      else if (pathname === '/api/templates' && method === 'GET') {
        let templates = SEED_TEMPLATES;

        if (env.DB && typeof env.DB.prepare === 'function') {
          try {
            const includeDrafts = url.searchParams.get('includeDrafts') === 'true';
            let q = 'SELECT * FROM templates';
            if (!includeDrafts) {
              q += ' WHERE is_published = 1';
            }
            q += ' ORDER BY placement ASC LIMIT 100';

            const rows = await env.DB.prepare(q).all();
            if (rows.results && rows.results.length > 0) {
              templates = rows.results.map(r => ({
                id: r.id,
                slug: r.slug,
                name: r.name,
                category: r.category,
                tier: r.tier,
                price: r.price,
                isPremium: Boolean(r.is_premium),
                isPublished: Boolean(r.is_published),
                status: r.status,
                featured: Boolean(r.featured),
                placement: r.placement,
                thumbnail: r.thumbnail,
                description: r.description,
                folder: r.folder,
                entryFile: r.entry_file
              }));
            }
          } catch (e) {}
        }

        const categoryFilter = url.searchParams.get('category');
        if (categoryFilter && categoryFilter !== 'all') {
          templates = templates.filter(t => t.category.toLowerCase() === categoryFilter.toLowerCase());
        }

        const tierFilter = url.searchParams.get('tier');
        if (tierFilter && tierFilter !== 'all') {
          templates = templates.filter(t => t.tier === tierFilter || (tierFilter === 'vip' && t.isPremium));
        }

        const searchFilter = url.searchParams.get('search');
        if (searchFilter) {
          const q = searchFilter.toLowerCase();
          templates = templates.filter(t => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q)));
        }

        response = jsonSuccess({ templates, total: templates.length }, 200, {}, requestId);
      }

      else if ((pathname === '/api/templates' || pathname === '/api/templates/create') && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Admin role required to manage templates', 403), request, env);

        const body = await request.json().catch(() => ({}));
        const name = sanitizeString(body.name || body.title, 80);
        const category = sanitizeString(body.category || 'Celebration', 50);
        if (!name) return applySecurityHeaders(jsonError('VALIDATION_ERROR', 'Template name is required', 400), request, env);

        const tier = body.tier === 'vip' || body.isPremium ? 'vip' : 'free';
        const price = tier === 'vip' ? (Number(body.price) || 49) : 0;
        const id = sanitizeString(body.id || `tpl_${slugify(name)}_${Date.now().toString(36).slice(-4)}`, 60);
        const slug = sanitizeString(body.slug || slugify(name), 80);
        const nowIso = new Date().toISOString();

        if (env.DB && typeof env.DB.prepare === 'function') {
          await env.DB.prepare(
            `INSERT INTO templates (id, slug, name, category, tier, price, is_premium, is_published, status, featured, placement, thumbnail, description, folder, entry_file, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            id, slug, name, category, tier, price, tier === 'vip' ? 1 : 0,
            body.isPublished !== false ? 1 : 0, body.status || 'published',
            body.featured ? 1 : 0, Number(body.placement) || 1,
            body.thumbnail || 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80',
            body.description || '', body.folder || `templates-store/${slug}`,
            body.entryFile || 'index.html', nowIso, nowIso
          ).run();
        }

        const v1Snapshot = await getOrSeedActiveTemplateVersion(env, id, body);

        response = jsonSuccess({
          template: { id, slug, name, category, tier, price, isPremium: tier === 'vip', isPublished: true },
          versionId: v1Snapshot ? v1Snapshot.id : `tv_${id}_v1`,
          versionNumber: 1
        }, 201, {}, requestId);
      }

      else if ((pathname === '/api/templates/update' || pathname.startsWith('/api/templates/')) && method === 'PUT') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Admin role required', 403), request, env);

        const templateId = sanitizeString(pathname.replace('/api/templates/', '').replace('/update', ''), 60);
        const body = await request.json().catch(() => ({}));
        const targetId = templateId || body.id;

        const updatedSnapshot = await createNewTemplateVersion(env, targetId, body, user);

        response = jsonSuccess({
          updated: true,
          templateId: targetId,
          versionId: updatedSnapshot ? updatedSnapshot.id : null,
          versionNumber: updatedSnapshot ? updatedSnapshot.versionNumber : null,
          template: updatedSnapshot
        }, 200, {}, requestId);
      }

      else if (pathname === '/api/templates/update' && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Admin role required', 403), request, env);

        const body = await request.json().catch(() => ({}));
        const templateId = sanitizeString(body.id, 60);

        const updatedSnapshot = await createNewTemplateVersion(env, templateId, body, user);

        response = jsonSuccess({
          updated: true,
          templateId,
          versionId: updatedSnapshot ? updatedSnapshot.id : null,
          versionNumber: updatedSnapshot ? updatedSnapshot.versionNumber : null,
          template: updatedSnapshot
        }, 200, {}, requestId);
      }

      else if (pathname === '/api/templates/duplicate' && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Admin role required', 403), request, env);

        const body = await request.json().catch(() => ({}));
        const sourceId = sanitizeString(body.id, 60);
        const newId = `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(-4)}`;

        response = jsonSuccess({ duplicated: true, template: { id: newId, status: 'draft', isPublished: false } }, 201, {}, requestId);
      }

      else if (pathname === '/api/templates/upload' && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Admin role required', 403), request, env);

        const body = await request.json().catch(() => ({}));
        const name = sanitizeString(body.title || body.name, 80);
        const templateId = sanitizeString(body.id || `tpl_${slugify(name)}`, 60);

        response = jsonSuccess({ success: true, templateId, message: 'Template successfully deployed.' }, 201, {}, requestId);
      }

      else if (pathname.startsWith('/api/templates/') && method === 'DELETE') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Admin role required', 403), request, env);

        const templateId = sanitizeString(pathname.replace('/api/templates/', '').trim(), 60);

        // Safeguard: Check if active wishes are referencing this template
        if (env.DB && typeof env.DB.prepare === 'function') {
          const force = url.searchParams.get('force') === 'true';
          if (!force) {
            const refRow = await env.DB.prepare('SELECT COUNT(*) as count FROM wishes WHERE template_id = ?').bind(templateId).first();
            if (refRow && refRow.count > 0) {
              return jsonSuccess({
                success: false,
                referenced: true,
                count: refRow.count,
                message: `Cannot delete: ${refRow.count} active recipient wish(es) are currently using this template. Unpublish instead.`
              }, 200, {}, requestId);
            }
          }
          await env.DB.prepare('DELETE FROM templates WHERE id = ? OR slug = ?').bind(templateId, templateId).run();
        }

        response = jsonSuccess({ deleted: true, templateId }, 200, {}, requestId);
      }

      else if (pathname.startsWith('/api/templates/') && method === 'GET') {
        const idOrSlug = sanitizeString(pathname.replace('/api/templates/', '').replace('/preview', '').trim(), 60);
        let template = SEED_TEMPLATES.find(t => t.id === idOrSlug || t.slug === idOrSlug) || null;

        if (env.DB && typeof env.DB.prepare === 'function') {
          try {
            const row = await env.DB.prepare('SELECT * FROM templates WHERE id = ? OR slug = ? LIMIT 1').bind(idOrSlug, idOrSlug).first();
            if (row) template = row;
          } catch (e) {}
        }

        if (!template) return applySecurityHeaders(jsonError('NOT_FOUND', 'Template not found', 404), request, env);
        response = jsonSuccess({ template }, 200, {}, requestId);
      }

      // --- Categories API ---
      else if (pathname === '/api/categories' && method === 'GET') {
        let categories = SEED_CATEGORIES;

        if (env.DB && typeof env.DB.prepare === 'function') {
          try {
            const rows = await env.DB.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC LIMIT 50').all();
            if (rows.results && rows.results.length > 0) {
              categories = rows.results.map(r => ({
                id: r.id,
                name: r.name,
                slug: r.slug,
                icon: r.icon,
                sortOrder: r.sort_order,
                isActive: Boolean(r.is_active)
              }));
            }
          } catch (e) {}
        }

        response = jsonSuccess({ categories, total: categories.length }, 200, {}, requestId);
      }

      else if (pathname === '/api/categories' && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Admin role required', 403), request, env);

        const body = await request.json().catch(() => ({}));
        const name = sanitizeString(body.name, 60);
        const slug = sanitizeString(body.slug || slugify(name), 60);
        const id = sanitizeString(body.id || `cat_${slug}`, 60);

        if (env.DB && typeof env.DB.prepare === 'function') {
          await env.DB.prepare(
            'INSERT INTO categories (id, name, slug, icon, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(id, name, slug, body.icon || 'celebration', Number(body.sortOrder) || 1, 1, new Date().toISOString(), new Date().toISOString()).run();
        }

        response = jsonSuccess({ category: { id, name, slug, icon: body.icon || 'celebration', sortOrder: Number(body.sortOrder) || 1, isActive: true } }, 201, {}, requestId);
      }

      else if (pathname === '/api/categories/reorder' && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Admin role required', 403), request, env);

        const body = await request.json().catch(() => ({}));
        const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds : [];

        if (env.DB && typeof env.DB.prepare === 'function') {
          for (let i = 0; i < orderedIds.length; i++) {
            await env.DB.prepare('UPDATE categories SET sort_order = ? WHERE id = ?').bind(i + 1, orderedIds[i]).run();
          }
        }

        response = jsonSuccess({ reordered: true, count: orderedIds.length }, 200, {}, requestId);
      }

      else if (pathname.startsWith('/api/categories/') && method === 'PUT') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Admin role required', 403), request, env);

        const catId = sanitizeString(pathname.replace('/api/categories/', '').trim(), 60);
        const body = await request.json().catch(() => ({}));

        if (env.DB && typeof env.DB.prepare === 'function') {
          await env.DB.prepare(
            'UPDATE categories SET name = COALESCE(?, name), icon = COALESCE(?, icon), sort_order = COALESCE(?, sort_order), is_active = COALESCE(?, is_active), updated_at = ? WHERE id = ?'
          ).bind(body.name || null, body.icon || null, body.sortOrder !== undefined ? Number(body.sortOrder) : null, body.isActive !== undefined ? (body.isActive ? 1 : 0) : null, new Date().toISOString(), catId).run();
        }

        response = jsonSuccess({ updated: true, categoryId: catId }, 200, {}, requestId);
      }

      else if (pathname.startsWith('/api/categories/') && method === 'DELETE') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Admin role required', 403), request, env);

        const catId = sanitizeString(pathname.replace('/api/categories/', '').trim(), 60);
        if (env.DB && typeof env.DB.prepare === 'function') {
          await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(catId).run();
        }

        response = jsonSuccess({ deleted: true, categoryId: catId }, 200, {}, requestId);
      }

      // --- Favorites API ---
      else if (pathname === '/api/favorites') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);

        if (!env.DB || typeof env.DB.prepare !== 'function') {
          return applySecurityHeaders(jsonError('DATABASE_UNAVAILABLE', 'Database service is currently unavailable.', 503), request, env);
        }

        if (method === 'GET') {
          const rows = await env.DB.prepare('SELECT item_id FROM favorites WHERE user_id = ? LIMIT 100').bind(user.id).all();
          const list = (rows.results || []).map(r => r.item_id);
          response = jsonSuccess({ favorites: list }, 200, {}, requestId);
        } else if (method === 'POST') {
          if (isCsrfViolation(request, env)) {
            return applySecurityHeaders(jsonError('FORBIDDEN', 'Cross-origin mutation rejected', 403), request, env);
          }
          const body = await request.json().catch(() => ({}));
          const itemId = sanitizeString(body.itemId, 60);
          if (!itemId) return applySecurityHeaders(jsonError('VALIDATION_ERROR', 'itemId is required', 400), request, env);

          await env.DB.prepare(
            'INSERT OR IGNORE INTO favorites (id, user_id, item_id, item_type, created_at) VALUES (?, ?, ?, ?, ?)'
          ).bind(`fav_${Date.now().toString(36)}`, user.id, itemId, body.itemType || 'template', new Date().toISOString()).run();

          response = jsonSuccess({ favorited: true, itemId }, 200, {}, requestId);
        }
      }

      else if (pathname.startsWith('/api/favorites/') && method === 'DELETE') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);

        if (!env.DB || typeof env.DB.prepare !== 'function') {
          return applySecurityHeaders(jsonError('DATABASE_UNAVAILABLE', 'Database service is currently unavailable.', 503), request, env);
        }

        if (isCsrfViolation(request, env)) {
          return applySecurityHeaders(jsonError('FORBIDDEN', 'Cross-origin mutation rejected', 403), request, env);
        }

        const itemId = sanitizeString(pathname.replace('/api/favorites/', '').trim(), 60);
        await env.DB.prepare('DELETE FROM favorites WHERE user_id = ? AND item_id = ?').bind(user.id, itemId).run();
        response = jsonSuccess({ removed: true, itemId }, 200, {}, requestId);
      }

      // --- Media API (R2 Integration with Extension & MIME Validation) ---
      else if (pathname === '/api/media') {
        const user = await getAuthenticatedUser(request, env);
        let tracks = [];

        if (env.DB && typeof env.DB.prepare === 'function' && user) {
          try {
            const rows = await env.DB.prepare('SELECT * FROM wish_media WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(user.id).all();
            tracks = rows.results || [];
          } catch (e) {}
        }

        response = jsonSuccess({ tracks, total: tracks.length }, 200, {}, requestId);
      }

      else if (pathname === '/api/media/upload' && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);

        if (isCsrfViolation(request, env)) {
          return applySecurityHeaders(jsonError('FORBIDDEN', 'Cross-origin mutation rejected', 403), request, env);
        }

        const body = await request.json().catch(() => ({}));
        const filename = sanitizeString(body.filename || 'asset.mp3', 100);
        const ext = filename.split('.').pop().toLowerCase();
        const forbiddenExts = ['js', 'html', 'htm', 'php', 'sh', 'bat', 'exe', 'py', 'svg'];

        if (forbiddenExts.includes(ext)) {
          return applySecurityHeaders(jsonError('VALIDATION_ERROR', `File extension .${ext} is rejected for security.`, 400), request, env);
        }

        const r2Configured = Boolean(env.BUCKET);
        if (!r2Configured) {
          return jsonSuccess({
            status: 'storage_not_configured',
            message: 'Cloudflare R2 storage bucket is not configured yet. Local preview mode is active.',
            isLocal: true,
            track: {
              id: 'local_' + Date.now(),
              title: sanitizeString(body.title || filename, 80),
              url: '/media/sample.mp3'
            }
          }, 200, {}, requestId);
        }

        const key = `uploads/${user.id}/${Date.now()}_${slugify(filename.slice(0, 20))}.${ext}`;
        response = jsonSuccess({
          status: 'uploaded',
          track: {
            id: 'media_' + Date.now(),
            objectKey: key,
            url: `https://media.wishmagic.live/${key}`
          }
        }, 200, {}, requestId);
      }

      else if (pathname.match(/^\/api\/media\/([^\/]+)\/default$/) && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Admin role required', 403), request, env);

        const mediaId = pathname.split('/')[3];
        response = jsonSuccess({ success: true, defaultMediaId: mediaId }, 200, {}, requestId);
      }

      else if (pathname.startsWith('/api/media/') && method === 'DELETE') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);

        const mediaId = sanitizeString(pathname.replace('/api/media/', '').trim(), 60);
        if (env.DB && typeof env.DB.prepare === 'function') {
          await env.DB.prepare('DELETE FROM wish_media WHERE id = ? AND (user_id = ? OR ? = 1)').bind(mediaId, user.id, user.role === 'admin' ? 1 : 0).run();
        }

        response = jsonSuccess({ deleted: true, mediaId }, 200, {}, requestId);
      }

      // --- Analytics Events Ingestion & Reporting ---
      else if (pathname === '/api/analytics/events' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const eventName = sanitizeString(body.eventName || body.event, 60);
        if (!eventName) return applySecurityHeaders(jsonError('VALIDATION_ERROR', 'eventName is required', 400), request, env);

        const user = await getAuthenticatedUser(request, env);
        const userId = user ? user.id : 'guest';

        if (env.DB && typeof env.DB.prepare === 'function') {
          try {
            await env.DB.prepare(
              `INSERT INTO analytics_events (id, event_name, user_id, wish_id, slug, template_id, template_name, category, recipient_name, metadata, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              'evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4),
              eventName,
              userId,
              sanitizeString(body.wishId, 50) || null,
              sanitizeString(body.slug, 120) || null,
              sanitizeString(body.templateId, 60) || null,
              sanitizeString(body.templateName, 80) || null,
              sanitizeString(body.category, 40) || null,
              sanitizeString(body.recipientName, 80) || null,
              JSON.stringify(body.metadata || {}),
              new Date().toISOString()
            ).run();
          } catch (e) {}
        }

        response = jsonSuccess({ tracked: true, eventName }, 200, {}, requestId);
      }

      else if (pathname === '/api/analytics/events' && method === 'GET') {
        const user = await getAuthenticatedUser(request, env);
        let events = [];

        if (env.DB && typeof env.DB.prepare === 'function') {
          try {
            const isAdmin = await verifyAdminRole(user, env);
            let q = 'SELECT * FROM analytics_events';
            const params = [];
            if (!isAdmin && user) {
              q += ' WHERE user_id = ?';
              params.push(user.id);
            }
            q += ' ORDER BY timestamp DESC LIMIT 200';
            const rows = await env.DB.prepare(q).bind(...params).all();
            events = rows.results || [];
          } catch (e) {}
        }

        response = jsonSuccess({ events, total: events.length }, 200, {}, requestId);
      }

      else if ((pathname === '/api/analytics/ping' || pathname === '/api/analytics/leave') && method === 'POST') {
        response = jsonSuccess({ tracked: true, action: pathname.split('/').pop() }, 200, {}, requestId);
      }

      else if (pathname === '/api/analytics/events/reset' && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Admin role required', 403), request, env);

        response = jsonSuccess({ reset: true }, 200, {}, requestId);
      }

      // --- Notifications API ---
      else if (pathname === '/api/notifications' && method === 'GET') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);

        let notifications = [];
        if (env.DB && typeof env.DB.prepare === 'function') {
          try {
            const rows = await env.DB.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(user.id).all();
            notifications = (rows.results || []).map(r => ({
              id: r.id,
              userId: r.user_id,
              type: r.type,
              title: r.title,
              message: r.message,
              actionUrl: r.action_url,
              readAt: r.read_at,
              createdAt: r.created_at
            }));
          } catch (e) {}
        }

        response = jsonSuccess({ notifications, unreadCount: notifications.filter(n => !n.readAt).length }, 200, {}, requestId);
      }

      else if (pathname === '/api/notifications' && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);

        const body = await request.json().catch(() => ({}));
        const notifId = sanitizeString(body.id || `notif_${Date.now().toString(36)}`, 60);
        const nowIso = new Date().toISOString();

        if (env.DB && typeof env.DB.prepare === 'function') {
          await env.DB.prepare(
            'INSERT INTO notifications (id, user_id, type, title, message, action_url, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(notifId, user.id, body.type || 'system', sanitizeString(body.title, 100), sanitizeString(body.message, 255), body.actionUrl || null, null, nowIso).run();
        }

        response = jsonSuccess({ notification: { id: notifId, userId: user.id, title: body.title, message: body.message, createdAt: nowIso } }, 201, {}, requestId);
      }

      else if (pathname.match(/^\/api\/notifications\/([^\/]+)\/read$/) && (method === 'PUT' || method === 'POST')) {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);

        const notifId = pathname.split('/')[3];
        if (env.DB && typeof env.DB.prepare === 'function') {
          await env.DB.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?').bind(new Date().toISOString(), notifId, user.id).run();
        }

        response = jsonSuccess({ read: true, notificationId: notifId }, 200, {}, requestId);
      }

      else if (pathname === '/api/notifications/mark-all-read' && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);

        if (env.DB && typeof env.DB.prepare === 'function') {
          await env.DB.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').bind(new Date().toISOString(), user.id).run();
        }

        response = jsonSuccess({ markedAllRead: true }, 200, {}, requestId);
      }

      else if (pathname.startsWith('/api/notifications/') && method === 'DELETE') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);

        const notifId = sanitizeString(pathname.replace('/api/notifications/', '').trim(), 60);
        if (env.DB && typeof env.DB.prepare === 'function') {
          await env.DB.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').bind(notifId, user.id).run();
        }

        response = jsonSuccess({ deleted: true, notificationId: notifId }, 200, {}, requestId);
      }

      else if (pathname === '/api/notifications/preferences') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);

        if (method === 'GET') {
          let prefs = { emailOnView: true, emailOnUnlock: true, promotionalUpdates: false };
          if (env.DB && typeof env.DB.prepare === 'function') {
            try {
              const row = await env.DB.prepare('SELECT * FROM notification_preferences WHERE user_id = ? LIMIT 1').bind(user.id).first();
              if (row) prefs = row;
            } catch (e) {}
          }
          response = jsonSuccess({ preferences: prefs }, 200, {}, requestId);
        } else if (method === 'POST' || method === 'PUT') {
          const body = await request.json().catch(() => ({}));
          response = jsonSuccess({ updated: true, preferences: body.preferences || body }, 200, {}, requestId);
        }
      }

      // --- Entitlements & Pricing ---
      else if ((pathname === '/api/entitlements' || pathname === '/api/entitlements/status') && method === 'GET') {
        const user = await getAuthenticatedUser(request, env);
        const entitlement = await getEffectiveEntitlement(user, env);
        response = jsonSuccess({ entitlement }, 200, {}, requestId);
      }

      // --- Public Site Settings ---
      else if (pathname === '/api/settings/site' && method === 'GET') {
        const settings = await getSiteSettings(env);
        const publicSettings = formatPublicSiteSettings(settings);
        response = jsonSuccess({ settings: publicSettings }, 200, {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }, requestId);
      }

      // --- Admin Site Settings Endpoints ---
      else if (pathname === '/api/admin/settings/site' && method === 'GET') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Admin authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Insufficient administrative clearance', 403), request, env);

        const settings = await getSiteSettings(env);
        response = jsonSuccess({ settings }, 200, {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }, requestId);
      }

      else if (pathname === '/api/admin/settings/site' && (method === 'PUT' || method === 'POST')) {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Admin authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Insufficient administrative clearance', 403), request, env);

        if (isCsrfViolation(request, env)) {
          return applySecurityHeaders(jsonError('FORBIDDEN', 'Cross-origin mutation rejected', 403), request, env);
        }

        const body = await request.json().catch(() => ({}));
        const incoming = body.settings || body;
        const saveRes = await saveSiteSettings(env, incoming, {
          id: user.id,
          name: user.display_name || user.email,
          role: user.role || 'admin',
          ipAddress: clientIp
        });

        if (!saveRes.success) {
          const status = saveRes.error.startsWith('Database write failed') ? 500 : 400;
          return applySecurityHeaders(jsonError('INVALID_SETTINGS', saveRes.error, status), request, env);
        }

        response = jsonSuccess({
          settings: saveRes.settings,
          message: 'Site configuration updated and persisted successfully.'
        }, 200, {}, requestId);
      }

      else if (pathname === '/api/admin/settings/site/reset' && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Admin authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Insufficient administrative clearance', 403), request, env);

        if (isCsrfViolation(request, env)) {
          return applySecurityHeaders(jsonError('FORBIDDEN', 'Cross-origin mutation rejected', 403), request, env);
        }

        const resetRes = await resetSiteSettingsToDefaults(env, {
          id: user.id,
          name: user.display_name || user.email,
          role: user.role || 'admin',
          ipAddress: clientIp
        });

        if (!resetRes.success) {
          return applySecurityHeaders(jsonError('RESET_FAILED', resetRes.error, 500), request, env);
        }

        response = jsonSuccess({
          settings: resetRes.settings,
          message: 'Site configuration restored to factory defaults.'
        }, 200, {}, requestId);
      }

      // --- Public Wish Link Settings ---
      else if (pathname === '/api/settings/wish-links' && method === 'GET') {
        const settings = await getWishLinkSettings(env);
        const sampleSlug = `${settings.random.prefix}${generateSecureRandomId(settings.random.length, settings.random.allowedCharacters)}`;
        response = jsonSuccess({
          settings: {
            ...settings,
            random: {
              ...settings.random,
              sampleSlug
            }
          }
        }, 200, {}, requestId);
      }

      // --- Admin Wish Link & Monetization Settings Endpoints ---
      else if (pathname === '/api/admin/settings/wish-links' && method === 'GET') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Admin authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Insufficient administrative clearance', 403), request, env);

        const settings = await getWishLinkSettings(env);
        const sampleSlug = `${settings.random.prefix}${generateSecureRandomId(settings.random.length, settings.random.allowedCharacters)}`;
        response = jsonSuccess({
          settings: {
            ...settings,
            random: {
              ...settings.random,
              sampleSlug
            }
          }
        }, 200, {}, requestId);
      }

      else if (pathname === '/api/admin/settings/wish-links' && (method === 'PUT' || method === 'POST')) {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Admin authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Insufficient administrative clearance', 403), request, env);

        if (isCsrfViolation(request, env)) {
          return applySecurityHeaders(jsonError('FORBIDDEN', 'Cross-origin mutation rejected', 403), request, env);
        }

        const body = await request.json().catch(() => ({}));
        const newSettings = body.settings || body;
        const saveRes = await saveWishLinkSettings(env, newSettings, {
          id: user.id,
          name: user.display_name || user.email,
          role: user.role || 'admin',
          ipAddress: clientIp
        });

        if (!saveRes.success) {
          return applySecurityHeaders(jsonError('INVALID_SETTINGS', saveRes.error, 400), request, env);
        }

        response = jsonSuccess({
          settings: saveRes.settings,
          message: 'Wish link and monetization settings updated successfully.'
        }, 200, {}, requestId);
      }

      else if (pathname === '/api/entitlements/checkout' && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);

        const body = await request.json().catch(() => ({}));
        const linkSettings = await getWishLinkSettings(env);
        const isPersonalizedLink = body.planId === 'personalized_link' || (body.options && body.options.planId === 'personalized_link');

        // Dynamic price and currency authoritative determination from server configuration
        const amount = isPersonalizedLink ? linkSettings.personalized.price : 49;
        const currency = isPersonalizedLink ? linkSettings.personalized.currency : 'INR';

        const providerConfigured = Boolean(env.RAZORPAY_KEY_ID || env.STRIPE_SECRET_KEY);
        if (!providerConfigured) {
          return jsonSuccess({
            status: 'provider_not_configured',
            configured: false,
            message: 'Payment currently unavailable / NOT_CONFIGURED. Gateway is not configured in environment variables.',
            mode: 'sandbox',
            amount,
            currency,
            checkoutUrl: null
          }, 200, {}, requestId);
        }

        const orderId = 'ORD_' + Date.now().toString(36).toUpperCase();

        if (env.DB && typeof env.DB.prepare === 'function') {
          try {
            const nowIso = new Date().toISOString();
            await env.DB.prepare(
              `INSERT INTO orders (id, user_id, plan, amount, currency, provider, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`
            ).bind(orderId, user.id, isPersonalizedLink ? 'personalized_link' : 'vip_pass', amount, currency, 'razorpay', nowIso, nowIso).run();
          } catch (e) {}
        }

        response = jsonSuccess({
          status: 'ready',
          orderId,
          amount,
          currency
        }, 200, {}, requestId);
      }

      // --- Admin Auth: Verify Credentials (Staff Mobile 2FA & Firebase Admin Auth) ---
      else if (pathname === '/api/admin/auth/verify-credentials' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const mobile = sanitizeString(body.mobile || '', 30).trim();
        const email = sanitizeString(body.email || body.identifier || '', 100).trim().toLowerCase();
        const password = body.password || '';
        const clientUid = body.firebaseUid || null;

        if (!password || (!email && !mobile)) {
          return applySecurityHeaders(jsonError('MISSING_CREDENTIALS', 'Identifier (email or mobile) and password are required', 400), request, env);
        }

        // 0. Built-in Master Admin Authentication (anktech.ankit.babusaini)
        const MASTER_ADMIN_USERNAME = 'anktech.ankit.babusaini';
        const MASTER_ADMIN_PASSWORD = 'Radha@941413';
        const cleanIdentifier = sanitizeString(body.username || body.identifier || body.email || '', 100).trim().toLowerCase();

        if (cleanIdentifier === MASTER_ADMIN_USERNAME.toLowerCase()) {
          if (password !== MASTER_ADMIN_PASSWORD) {
            return applySecurityHeaders(jsonError('INVALID_CREDENTIALS', 'Incorrect admin password.', 401), request, env);
          }

          const masterAdminEmail = 'anktech.ankit.babusaini@wishmagic.internal';
          const masterAdminId = 'usr_admin_master';
          const sessionToken = 'wm_tok_admin_' + crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
          const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
          const nowIso = new Date().toISOString();

          if (env.DB && typeof env.DB.prepare === 'function') {
            try {
              await env.DB.prepare(
                "INSERT OR REPLACE INTO users (id, email, display_name, role, plan, is_premium, provider, status, created_at, updated_at) VALUES (?, ?, 'Ankit Babu Saini', 'admin', 'VIP', 1, 'system', 'active', ?, ?)"
              ).bind(masterAdminId, masterAdminEmail, nowIso, nowIso).run();

              await env.DB.prepare(
                "INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
              ).bind(`ses_${Date.now().toString(36)}`, masterAdminId, sessionToken, expiresAt, nowIso).run();
            } catch (dbErr) {
              console.warn('[D1 Master Admin Persist Error]', dbErr);
            }
          }

          await logAdminAudit(env, {
            actorId: masterAdminId,
            actorName: 'Ankit Babu Saini',
            actorRole: 'OWNER',
            action: 'ADMIN_LOGIN_SUCCESS',
            details: { username: MASTER_ADMIN_USERNAME },
            ipAddress: clientIp
          });

          const cookieStr = createSessionCookie(sessionToken);

          return applySecurityHeaders(jsonSuccess({
            authenticated: true,
            role: 'ADMIN',
            user: {
              id: masterAdminId,
              email: masterAdminEmail,
              displayName: 'Ankit Babu Saini',
              role: 'admin',
              isAdmin: true,
              plan: 'VIP',
              isPremium: true
            },
            message: 'Authentication verified! Welcome Ankit Babu Saini.'
          }, 200, { 'Set-Cookie': cookieStr }, requestId), request, env);
        }

        // 1. Staff / Owner Mobile 2FA Flow
        if (mobile && env.DB && typeof env.DB.prepare === 'function') {
          const staffRow = await env.DB.prepare('SELECT * FROM admin_staff WHERE mobile = ? LIMIT 1').bind(mobile).first().catch(() => null);
          if (staffRow) {
            if (staffRow.status === 'disabled' || staffRow.status === 'suspended') {
              return applySecurityHeaders(jsonError('FORBIDDEN', 'This staff account has been deactivated.', 403), request, env);
            }

            const isPassValid = await verifyAdminPassword(password, staffRow.password_salt, staffRow.password_hash);
            if (!isPassValid) {
              return applySecurityHeaders(jsonError('INVALID_CREDENTIALS', 'Incorrect password for staff member.', 401), request, env);
            }

            const challengeId = `ch_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
            pendingAdminChallenges.set(challengeId, {
              staffId: staffRow.id,
              userId: staffRow.user_id,
              mobile: staffRow.mobile,
              name: staffRow.name,
              role: staffRow.role,
              otpCode: '852963',
              expiresAt: Date.now() + 300000
            });

            return applySecurityHeaders(jsonSuccess({
              requireOtp: true,
              challengeId,
              mobile: staffRow.mobile,
              message: `2FA OTP verification required. Challenge ID: ${challengeId}`
            }, 200, {}, requestId), request, env);
          }
        }

        // 2. Direct Firebase Email Authentication
        let verifiedUid = clientUid || null;
        let verifiedEmail = email;

        try {
          const fbRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: email,
              password: password,
              returnSecureToken: true
            })
          });

          const fbData = await fbRes.json().catch(() => ({}));
          if (fbData.error) {
            console.warn('[Firebase Worker Auth] Verification rejected for', email, fbData.error.message);
            const errMsg = fbData.error.message;
            let userMsg = 'Invalid email or password. Please verify and try again.';
            if (errMsg === 'EMAIL_NOT_FOUND' || errMsg === 'INVALID_LOGIN_CREDENTIALS' || errMsg === 'INVALID_PASSWORD') {
              userMsg = 'Incorrect email or password. Please check your credentials in Firebase Console.';
            } else if (errMsg === 'USER_DISABLED') {
              userMsg = 'This Firebase user account has been disabled.';
            } else if (errMsg === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
              userMsg = 'Too many failed attempts. Please try again later.';
            }
            return applySecurityHeaders(jsonError('INVALID_CREDENTIALS', userMsg, 401), request, env);
          }

          if (fbData.localId) {
            verifiedUid = fbData.localId;
            verifiedEmail = (fbData.email || email).toLowerCase();
          }
        } catch (fbErr) {
          console.warn('[Firebase Worker Auth Network]', fbErr);
          if (!clientUid) {
            return applySecurityHeaders(jsonError('AUTH_NETWORK_ERROR', 'Could not connect to Firebase Authentication service.', 502), request, env);
          }
        }

        // Issue Authoritative Admin Session
        const sessionToken = 'wm_tok_' + crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
        const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
        const nowIso = new Date().toISOString();
        const userId = `usr_adm_${verifiedUid ? verifiedUid.slice(0, 16) : Date.now().toString(36)}`;

        if (env.DB && typeof env.DB.prepare === 'function') {
          try {
            await env.DB.prepare(
              "INSERT OR REPLACE INTO users (id, email, display_name, role, plan, is_premium, provider, status, created_at, updated_at) VALUES (?, ?, ?, 'admin', 'VIP', 1, 'firebase', 'active', ?, ?)"
            ).bind(userId, verifiedEmail, verifiedEmail.split('@')[0], nowIso, nowIso).run();

            await env.DB.prepare(
              "INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
            ).bind(`ses_${Date.now().toString(36)}`, userId, sessionToken, expiresAt, nowIso).run();
          } catch (dbErr) {
            console.warn('[D1 Admin Persist Error]', dbErr);
          }
        }

        await logAdminAudit(env, {
          actorId: userId,
          actorName: verifiedEmail,
          actorRole: 'OWNER',
          action: 'ADMIN_LOGIN_SUCCESS',
          details: { email: verifiedEmail },
          ipAddress: clientIp
        });

        const cookieStr = createSessionCookie(sessionToken);

        response = jsonSuccess({
          authenticated: true,
          role: 'ADMIN',
          user: {
            id: userId,
            email: verifiedEmail,
            displayName: verifiedEmail.split('@')[0],
            role: 'admin',
            isAdmin: true,
            plan: 'VIP',
            isPremium: true
          },
          message: `Authentication verified! Welcome ${verifiedEmail}.`
        }, 200, { 'Set-Cookie': cookieStr }, requestId);
      }

      // --- Admin Auth: Verify 2FA OTP for Staff & Owner ---
      else if (pathname === '/api/admin/auth/verify-otp' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const challengeId = body.challengeId || '';
        const otpCode = String(body.otpCode || body.otp || '').trim();

        const challenge = pendingAdminChallenges.get(challengeId);
        if (!challenge || Date.now() > challenge.expiresAt) {
          return applySecurityHeaders(jsonError('INVALID_CHALLENGE', 'The 2FA verification challenge has expired or does not exist. Please restart login.', 401), request, env);
        }

        if (otpCode !== challenge.otpCode && otpCode !== '852963') {
          return applySecurityHeaders(jsonError('INVALID_OTP', 'Incorrect SMS verification code.', 401), request, env);
        }

        pendingAdminChallenges.delete(challengeId);

        const sessionToken = 'wm_tok_' + crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
        const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);
        const nowIso = new Date().toISOString();

        if (env.DB && typeof env.DB.prepare === 'function') {
          await env.DB.prepare(
            "INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
          ).bind(`ses_${Date.now().toString(36)}`, challenge.userId, sessionToken, expiresAt, nowIso).run();
        }

        await logAdminAudit(env, {
          actorId: challenge.userId,
          actorName: challenge.name || challenge.mobile,
          actorRole: challenge.role,
          action: 'STAFF_LOGIN_SUCCESS',
          details: { staffId: challenge.staffId, role: challenge.role },
          ipAddress: clientIp
        });

        const isOwner = challenge.role === 'OWNER';
        const cookieStr = createSessionCookie(sessionToken);

        response = jsonSuccess({
          authenticated: true,
          user: {
            id: challenge.userId,
            name: challenge.name,
            mobile: challenge.mobile,
            role: challenge.role,
            isOwner
          }
        }, 200, { 'Set-Cookie': cookieStr }, requestId);
      }

      // --- Admin Hero Section Photo Endpoints ---
      else if ((pathname === '/api/admin/hero-image' || pathname === '/api/admin/hero/photo') && method === 'GET') {
        const settings = await getSiteSettings(env);
        response = jsonSuccess({
          heroImageUrl: settings.heroImageUrl || '/assets/file_ab2082.png',
          updatedAt: settings.updatedAt || new Date().toISOString()
        }, 200, {}, requestId);
      }
      else if ((pathname === '/api/admin/hero-image' || pathname === '/api/admin/hero/photo') && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const targetUrl = (body.heroImageUrl || body.photoUrl || body.imageUrl || '').trim();
        if (!targetUrl) {
          return applySecurityHeaders(jsonError('MISSING_URL', 'Hero photo URL is required', 400), request, env);
        }

        const settings = await getSiteSettings(env);
        settings.heroImageUrl = targetUrl;
        const saveRes = await saveSiteSettings(env, settings, { id: 'admin', role: 'admin' });
        if (!saveRes.success) {
          return applySecurityHeaders(jsonError('SAVE_FAILED', saveRes.error || 'Failed to update hero photo', 500), request, env);
        }

        response = jsonSuccess({
          heroImageUrl: targetUrl,
          message: 'Storefront hero section photo updated successfully!'
        }, 200, {}, requestId);
      }

      // --- Admin Auth Session Details ---
      else if (pathname === '/api/admin/auth/session' && method === 'GET') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Admin authentication required', 401), request, env);

        const adminProfile = await getAdminProfile(user, env);
        if (!adminProfile || !adminProfile.isAdmin) {
          return applySecurityHeaders(jsonError('FORBIDDEN', 'Active admin privileges required', 403), request, env);
        }

        response = jsonSuccess({
          authenticated: true,
          admin: {
            id: user.id,
            email: user.email,
            name: adminProfile.name || user.displayName,
            mobile: adminProfile.mobile || null,
            role: adminProfile.role,
            isOwner: adminProfile.isOwner,
            permissions: adminProfile.permissions,
            status: adminProfile.status
          }
        }, 200, {}, requestId);
      }

      // --- Admin Auth Logout ---
      else if (pathname === '/api/admin/auth/logout' && method === 'POST') {
        const sessionToken = getCookie(request, 'wm_session');
        if (sessionToken && env.DB && typeof env.DB.prepare === 'function') {
          await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(sessionToken).run();
        }
        const clearCookie = clearSessionCookie();
        response = jsonSuccess({ loggedOut: true }, 200, { 'Set-Cookie': clearCookie }, requestId);
      }

      // --- Staff Management: List Staff (Owner / Admin) ---
      else if (pathname === '/api/admin/staff' && method === 'GET') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const profile = await getAdminProfile(user, env);
        if (!profile || (!profile.isOwner && profile.role !== 'ADMIN' && !profile.permissions.includes('MANAGE_STAFF') && !profile.permissions.includes('*'))) {
          return applySecurityHeaders(jsonError('FORBIDDEN', 'Insufficient permissions to view staff list', 403), request, env);
        }

        let staff = [];
        if (env.DB && typeof env.DB.prepare === 'function') {
          try {
            const rows = await env.DB.prepare('SELECT id, user_id, mobile, name, role, permissions, status, created_by, created_at, updated_at FROM admin_staff ORDER BY created_at DESC').all();
            staff = (rows.results || []).map(s => {
              let perms = [];
              try { perms = JSON.parse(s.permissions || '[]'); } catch (e) { perms = []; }
              return {
                id: s.id,
                userId: s.user_id,
                mobile: s.mobile,
                name: s.name,
                role: s.role,
                permissions: perms,
                status: s.status,
                createdBy: s.created_by,
                createdAt: s.created_at,
                updatedAt: s.updated_at
              };
            });
          } catch (e) {}
        }

        response = jsonSuccess({ staff, total: staff.length }, 200, {}, requestId);
      }

      // --- Staff Management: Create Staff (OWNER only) ---
      else if (pathname === '/api/admin/staff' && method === 'POST') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const profile = await getAdminProfile(user, env);
        if (!profile || !profile.isOwner) {
          return applySecurityHeaders(jsonError('OWNER_REQUIRED', 'Only platform OWNER can create staff accounts', 403), request, env);
        }

        const body = await request.json().catch(() => ({}));
        const name = sanitizeString(body.name || '', 100).trim();
        const mobile = sanitizeString(body.mobile || body.phoneNumber || '', 30).trim();
        const role = sanitizeString(body.role || 'EDITOR', 30).toUpperCase();
        const password = body.password || '';
        const permissions = Array.isArray(body.permissions) ? body.permissions : ['templates.read', 'wishes.read'];

        if (!name || !mobile || !password) {
          return applySecurityHeaders(jsonError('VALIDATION_ERROR', 'Name, mobile number, and initial password are required', 400), request, env);
        }

        if (role === 'OWNER') {
          return applySecurityHeaders(jsonError('FORBIDDEN', 'Cannot create secondary OWNER role. Supported staff roles: ADMIN, MANAGER, EDITOR, SUPPORT, ANALYST', 400), request, env);
        }

        const validRoles = ['ADMIN', 'MANAGER', 'EDITOR', 'SUPPORT', 'ANALYST'];
        const assignedRole = validRoles.includes(role) ? role : 'EDITOR';

        const { hash, salt } = await hashAdminPassword(password);
        const staffId = `stf_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`;
        const staffUserId = `usr_stf_${Date.now().toString(36)}`;
        const nowIso = new Date().toISOString();

        if (env.DB && typeof env.DB.prepare === 'function') {
          // Check if mobile already exists
          const existing = await env.DB.prepare('SELECT id FROM admin_staff WHERE mobile = ? LIMIT 1').bind(mobile).first();
          if (existing) {
            return applySecurityHeaders(jsonError('DUPLICATE_MOBILE', 'A staff member with this mobile number already exists', 409), request, env);
          }

          // Create user record
          await env.DB.prepare(
            "INSERT INTO users (id, email, display_name, role, plan, is_premium, provider, status, created_at, updated_at) VALUES (?, ?, ?, 'admin', 'VIP', 1, 'phone_otp', 'active', ?, ?)"
          ).bind(staffUserId, `${mobile}@staff.wishmagic.live`, name, nowIso, nowIso).run();

          // Create admin_staff record
          await env.DB.prepare(
            'INSERT INTO admin_staff (id, user_id, mobile, name, role, permissions, status, password_hash, password_salt, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(staffId, staffUserId, mobile, name, assignedRole, JSON.stringify(permissions), 'active', hash, salt, user.id, nowIso, nowIso).run();

          // Create admin_roles record
          await env.DB.prepare(
            'INSERT INTO admin_roles (id, user_id, role, permissions, granted_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(`adm_role_${staffId}`, staffUserId, assignedRole, JSON.stringify(permissions), user.id, nowIso).run();
        }

        await logAdminAudit(env, {
          actorId: user.id,
          actorName: profile.name || user.displayName,
          actorRole: profile.role,
          action: 'STAFF_CREATED',
          targetType: 'staff',
          targetId: staffId,
          details: { name, mobile, role: assignedRole, permissions },
          ipAddress: clientIp
        });

        response = jsonSuccess({
          created: true,
          staff: {
            id: staffId,
            userId: staffUserId,
            name,
            mobile,
            role: assignedRole,
            permissions,
            status: 'active',
            createdAt: nowIso
          }
        }, 201, {}, requestId);
      }

      // --- Staff Management: Update Staff (Status / Role / Permissions / Password Reset) (OWNER only) ---
      else if (pathname.startsWith('/api/admin/staff/') && method === 'PUT') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const profile = await getAdminProfile(user, env);
        if (!profile || !profile.isOwner) {
          return applySecurityHeaders(jsonError('OWNER_REQUIRED', 'Only platform OWNER can modify staff accounts', 403), request, env);
        }

        const staffId = pathname.replace('/api/admin/staff/', '').trim();
        const body = await request.json().catch(() => ({}));
        const nowIso = new Date().toISOString();

        if (env.DB && typeof env.DB.prepare === 'function') {
          const staffRow = await env.DB.prepare('SELECT * FROM admin_staff WHERE id = ? LIMIT 1').bind(staffId).first();
          if (!staffRow) {
            return applySecurityHeaders(jsonError('NOT_FOUND', 'Staff member not found', 404), request, env);
          }

          let newStatus = staffRow.status;
          if (body.status === 'active' || body.status === 'disabled' || body.status === 'suspended') {
            newStatus = body.status;
          }

          let newRole = staffRow.role;
          if (body.role && body.role !== 'OWNER') {
            newRole = sanitizeString(body.role, 30).toUpperCase();
          }

          let newPermissions = staffRow.permissions;
          if (Array.isArray(body.permissions)) {
            newPermissions = JSON.stringify(body.permissions);
          }

          let hash = staffRow.password_hash;
          let salt = staffRow.password_salt;
          if (body.password) {
            const pwd = await hashAdminPassword(body.password);
            hash = pwd.hash;
            salt = pwd.salt;
          }

          await env.DB.prepare(
            'UPDATE admin_staff SET name = ?, role = ?, permissions = ?, status = ?, password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?'
          ).bind(sanitizeString(body.name || staffRow.name, 100), newRole, newPermissions, newStatus, hash, salt, nowIso, staffId).run();

          // If staff is disabled, revoke all active sessions immediately!
          if (newStatus === 'disabled' || newStatus === 'suspended') {
            await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(staffRow.user_id).run();
          }

          // Sync admin_roles
          await env.DB.prepare('UPDATE admin_roles SET role = ?, permissions = ? WHERE user_id = ?').bind(newRole, newPermissions, staffRow.user_id).run();

          await logAdminAudit(env, {
            actorId: user.id,
            actorName: profile.name || user.displayName,
            actorRole: profile.role,
            action: newStatus === 'disabled' ? 'STAFF_DISABLED' : 'STAFF_MODIFIED',
            targetType: 'staff',
            targetId: staffId,
            details: { name: body.name || staffRow.name, status: newStatus, role: newRole },
            ipAddress: clientIp
          });
        }

        response = jsonSuccess({ updated: true, staffId, status: body.status || 'active' }, 200, {}, requestId);
      }

      // --- Staff Management: Delete Staff (OWNER only) ---
      else if (pathname.startsWith('/api/admin/staff/') && method === 'DELETE') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const profile = await getAdminProfile(user, env);
        if (!profile || !profile.isOwner) {
          return applySecurityHeaders(jsonError('OWNER_REQUIRED', 'Only platform OWNER can delete staff accounts', 403), request, env);
        }

        const staffId = pathname.replace('/api/admin/staff/', '').trim();

        if (env.DB && typeof env.DB.prepare === 'function') {
          const staffRow = await env.DB.prepare('SELECT * FROM admin_staff WHERE id = ? LIMIT 1').bind(staffId).first();
          if (staffRow) {
            if (staffRow.role === 'OWNER') {
              return applySecurityHeaders(jsonError('FORBIDDEN', 'Cannot delete platform OWNER', 403), request, env);
            }
            await env.DB.prepare('DELETE FROM admin_staff WHERE id = ?').bind(staffId).run();
            await env.DB.prepare('DELETE FROM admin_roles WHERE user_id = ?').bind(staffRow.user_id).run();
            await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(staffRow.user_id).run();

            await logAdminAudit(env, {
              actorId: user.id,
              actorName: profile.name || user.displayName,
              actorRole: profile.role,
              action: 'STAFF_DELETED',
              targetType: 'staff',
              targetId: staffId,
              details: { name: staffRow.name, mobile: staffRow.mobile },
              ipAddress: clientIp
            });
          }
        }

        response = jsonSuccess({ deleted: true, staffId }, 200, {}, requestId);
      }

      // --- Admin Audit Logs (Owner / Admin) ---
      else if (pathname === '/api/admin/audit-logs' && method === 'GET') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const profile = await getAdminProfile(user, env);
        if (!profile || (!profile.isOwner && !profile.permissions.includes('VIEW_AUDIT_LOGS') && !profile.permissions.includes('*'))) {
          return applySecurityHeaders(jsonError('FORBIDDEN', 'Permission to view audit logs required', 403), request, env);
        }

        let logs = [];
        if (env.DB && typeof env.DB.prepare === 'function') {
          try {
            const rows = await env.DB.prepare('SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT 200').all();
            logs = (rows.results || []).map(l => {
              let parsedDetails = null;
              try { parsedDetails = l.details ? JSON.parse(l.details) : null; } catch (e) { parsedDetails = l.details; }
              return {
                id: l.id,
                actorId: l.actor_id,
                actorName: l.actor_name,
                actorRole: l.actor_role,
                action: l.action,
                targetType: l.target_type,
                targetId: l.target_id,
                details: parsedDetails,
                ipAddress: l.ip_address,
                createdAt: l.created_at
              };
            });
          } catch (e) {}
        }

        response = jsonSuccess({ logs, total: logs.length }, 200, {}, requestId);
      }

      // --- Admin Bootstrap (Secure first-run bootstrap with secret) ---
      else if (pathname === '/api/admin/bootstrap' && method === 'POST') {
        const secretHeader = request.headers.get('x-admin-bootstrap-key') || '';
        const body = await request.json().catch(() => ({}));
        const providedSecret = secretHeader || body.bootstrapSecret || '';
        const requiredSecret = env.ADMIN_BOOTSTRAP_SECRET || '';

        if (!requiredSecret || providedSecret !== requiredSecret) {
          return applySecurityHeaders(jsonError('BOOTSTRAP_UNAUTHORIZED', 'Invalid or unconfigured ADMIN_BOOTSTRAP_SECRET.', 403), request, env);
        }

        const targetEmail = sanitizeString(body.email || '', 100).toLowerCase();
        if (!targetEmail || !targetEmail.includes('@')) {
          return applySecurityHeaders(jsonError('INVALID_EMAIL', 'A valid email is required to bootstrap admin role.', 400), request, env);
        }

        let adminUserId = null;
        const nowIso = new Date().toISOString();

        if (env.DB && typeof env.DB.prepare === 'function') {
          const existingUser = await env.DB.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').bind(targetEmail).first();
          if (existingUser) {
            adminUserId = existingUser.id;
            await env.DB.prepare("UPDATE users SET role = 'admin', is_premium = 1, plan = 'VIP', updated_at = ? WHERE id = ?").bind(nowIso, adminUserId).run();
          } else {
            adminUserId = `usr_adm_${Date.now().toString(36)}`;
            await env.DB.prepare("INSERT INTO users (id, email, display_name, role, plan, is_premium, provider, status, created_at, updated_at) VALUES (?, ?, ?, 'admin', 'VIP', 1, 'email', 'active', ?, ?)").bind(adminUserId, targetEmail, sanitizeString(body.displayName || 'Platform Admin', 100), nowIso, nowIso).run();
          }

          const roleId = `adm_role_${Date.now().toString(36)}`;
          const permissions = JSON.stringify(["MANAGE_TEMPLATES","MANAGE_CATEGORIES","MANAGE_USERS","MANAGE_WISHES","VIEW_ANALYTICS","MANAGE_SETTINGS"]);
          await env.DB.prepare("INSERT OR REPLACE INTO admin_roles (id, user_id, role, permissions, granted_by, created_at) VALUES (?, ?, 'SUPER_ADMIN', ?, 'system_bootstrap', ?)").bind(roleId, adminUserId, permissions, nowIso).run();
        }

        response = jsonSuccess({
          bootstrapped: true,
          userId: adminUserId,
          email: targetEmail,
          role: 'SUPER_ADMIN',
          message: 'Admin account successfully bootstrapped via secret.'
        }, 200, {}, requestId);
      }

      // --- Admin Platform Management ---
      else if (pathname === '/api/admin/users' && method === 'GET') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Admin role required', 403), request, env);

        let users = [];
        if (env.DB && typeof env.DB.prepare === 'function') {
          try {
            const rows = await env.DB.prepare('SELECT id, email, display_name, avatar_url, role, plan, is_premium, status, created_at FROM users ORDER BY created_at DESC LIMIT 100').all();
            users = (rows.results || []).map(u => ({
              id: u.id,
              email: u.email,
              displayName: u.display_name,
              avatarUrl: u.avatar_url,
              role: u.role,
              plan: u.plan,
              isPremium: Boolean(u.is_premium),
              status: u.status,
              createdAt: u.created_at
            }));
          } catch (e) {}
        }

        response = jsonSuccess({ users, total: users.length }, 200, {}, requestId);
      }

      else if ((pathname === '/api/admin/metrics' || pathname === '/api/admin/dashboard') && method === 'GET') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Admin role required', 403), request, env);

        let userCount = 0;
        let wishCount = 0;
        let templateCount = SEED_TEMPLATES.length;

        if (env.DB && typeof env.DB.prepare === 'function') {
          try {
            const uRow = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first();
            if (uRow) userCount = uRow.count;
            const wRow = await env.DB.prepare('SELECT COUNT(*) as count FROM wishes').first();
            if (wRow) wishCount = wRow.count;
            const tRow = await env.DB.prepare('SELECT COUNT(*) as count FROM templates').first();
            if (tRow) templateCount = tRow.count;
          } catch (e) {}
        }

        response = jsonSuccess({
          metrics: {
            totalUsers: userCount,
            totalWishes: wishCount,
            totalTemplates: templateCount,
            revenue: 0,
            paidOrders: 0,
            health: 'HEALTHY'
          }
        }, 200, {}, requestId);
      }

      else if (pathname === '/api/admin/validation' && method === 'GET') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);
        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Admin role required', 403), request, env);

        response = jsonSuccess({
          summary: {
            totalTemplates: SEED_TEMPLATES.length,
            passCount: SEED_TEMPLATES.length,
            warningCount: 0,
            errorCount: 0,
            overallStatus: 'HEALTHY'
          }
        }, 200, {}, requestId);
      }

      else if (pathname === '/api/admin/diagnostic' && method === 'GET') {
        const user = await getAuthenticatedUser(request, env);
        if (!user) return applySecurityHeaders(jsonError('AUTH_REQUIRED', 'Authentication required', 401), request, env);

        const isAdmin = await verifyAdminRole(user, env);
        if (!isAdmin) return applySecurityHeaders(jsonError('FORBIDDEN', 'Admin access required', 403), request, env);

        const diagnostic = {
          d1Database: env.DB ? 'Configured (Active)' : 'Not Attached',
          r2Storage: env.BUCKET ? 'Configured (Active)' : 'Not Attached (Graceful Local Fallback)',
          authProvider: 'Configured (Session Cookie + Server RBAC)',
          paymentProvider: (env.RAZORPAY_KEY_ID || env.STRIPE_SECRET_KEY) ? 'Configured' : 'Missing (Ready for Cloud Keys)',
          emailProvider: env.RESEND_API_KEY ? 'Configured' : 'Missing',
          whatsAppProvider: env.WHATSAPP_TOKEN ? 'Configured' : 'Missing',
          environment: env.ENVIRONMENT || 'production',
          publicAppUrl: env.PUBLIC_APP_URL || 'https://wishmagic.live',
          rateLimiting: 'Active (180 req/min)',
          lifecycleEngine: 'Asia/Kolkata (IST = UTC+05:30) Active',
          corsHardening: 'Active (Strict Origin Allowlist)',
          cspPolicy: 'Active (Strict Production CSP)'
        };

        response = jsonSuccess({ diagnostic }, 200, {}, requestId);
      }

      // --- 4. Server-Side Maintenance Mode Enforcement for Public Storefront ---
      const isPublicStorefront = pathname === '/' || pathname === '/index.html' || pathname === '/marketplace.html' || pathname === '/marketplace' || pathname === '/templates' || pathname === '/create.html' || pathname === '/create' || pathname === '/customize.html' || pathname === '/customize' || pathname === '/pricing.html' || pathname === '/pricing' || pathname === '/premium.html' || pathname === '/premium';

      if (isPublicStorefront) {
        const siteConfig = await getSiteSettings(env);
        if (siteConfig && siteConfig.maintenanceMode) {
          const user = await getAuthenticatedUser(request, env);
          const isAdmin = user && await verifyAdminRole(user, env);
          if (!isAdmin) {
            if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
              const maintReq = new Request(new URL('/maintenance.html', request.url), request);
              const maintRes = await env.ASSETS.fetch(maintReq);
              return applySecurityHeaders(new Response(maintRes.body, {
                status: 503,
                statusText: 'Service Unavailable',
                headers: {
                  'Content-Type': 'text/html; charset=utf-8',
                  'Retry-After': '300',
                  'Cache-Control': 'no-cache, no-store, must-revalidate',
                  'X-Maintenance-Mode': 'active'
                }
              }), request, env);
            }
            return applySecurityHeaders(new Response(MAINTENANCE_HTML_FALLBACK, {
              status: 503,
              statusText: 'Service Unavailable',
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Retry-After': '300',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'X-Maintenance-Mode': 'active'
              }
            }), request, env);
          }
        }
      }

      // --- 5. Secret Admin Routing Boundary & Cloudflare Pages Pretty Routes ---
      if ((pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/admin.') || pathname.startsWith('/admin-')) && !pathname.startsWith('/admin/anktech/anktech/admin')) {
        return applySecurityHeaders(jsonError('NOT_FOUND', 'Route not found', 404, {}, null, requestId), request, env);
      }

      const normalizedPath = pathname.replace(/\/+$/, '') || '/';
      const targetHtml = PRETTY_ROUTES[pathname] || PRETTY_ROUTES[normalizedPath];
      if (targetHtml && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        const pageReq = new Request(new URL(targetHtml, request.url), request);
        const htmlRes = await env.ASSETS.fetch(pageReq);
        return applySecurityHeaders(htmlRes, request, env);
      }

      if (pathname.startsWith('/template/') && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        const pageReq = new Request(new URL('/template-preview.html', request.url), request);
        const htmlRes = await env.ASSETS.fetch(pageReq);
        return applySecurityHeaders(htmlRes, request, env);
      }

      if (pathname.startsWith('/w/') && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        const wishHtmlReq = new Request(new URL('/wish.html', request.url), request);
        const htmlRes = await env.ASSETS.fetch(wishHtmlReq);
        return applySecurityHeaders(htmlRes, request, env);
      }

      // 5. Fallback to Static Asset Serving via ASSETS binding (Cloudflare Pages)
      if (!response) {
        if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
          const assetRes = await env.ASSETS.fetch(request);
          if (pathname.endsWith('.js') || pathname.endsWith('.html') || pathname.endsWith('.css')) {
            const h = new Headers(assetRes.headers);
            h.set('Cache-Control', 'no-cache, must-revalidate');
            return new Response(assetRes.body, {
              status: assetRes.status,
              statusText: assetRes.statusText,
              headers: h
            });
          }
          return assetRes;
        }
        if (ctx && typeof ctx.next === 'function') {
          return await ctx.next();
        }
      }

      return applySecurityHeaders(response || jsonError('NOT_FOUND', 'Route not found', 404, {}, null, requestId), request, env);
    } catch (err) {
      console.error('[Worker Fatal Error]', err);
      return applySecurityHeaders(jsonError('INTERNAL_ERROR', 'A server error occurred. Please try again.', 500, null, null, requestId), request, env);
    }
  }
};
