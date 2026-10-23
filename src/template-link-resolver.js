/**
 * WishMagic UTP v1.3.0 Central Link Manager, Logical Link Resolver,
 * ZIP Button Inspector & Safe Existing-Template Link Migration Engine
 * ============================================================================
 * Part C & Part E:
 * - Central Link Configuration (D1-backed `central_link_settings`)
 * - Two Distinct Link Categories:
 *   1. Global WishMagic Links (`global.home`, `global.explore`, `global.browseTemplates`,
 *      `global.marketplace`, `global.createWish`, `global.pricing`, `global.help`, `global.contact`)
 *   2. Template-Specific Creation/Customization Links (`template.create`, `template.customize`, `template.preview`)
 * - Deterministic Runtime Link Resolver (safe URLSearchParams construction, zero open-redirect or
 *   untrusted Host-header injection)
 * - Smart Button & Link Detection during ZIP Upload (with evidence & ambiguity flagging)
 * - Existing Template Link Scanner & Non-Destructive Migration Workflow
 */

import {
  isValidInternalWishMagicRoute,
  validateActionDestinationUrl
} from './template-protocol-schema.js';

export const DEFAULT_CANONICAL_BASE_URL = 'https://wishmagic.pages.dev';

export const KNOWN_INTERNAL_WISHMAGIC_HOSTS = Object.freeze([
  'wishmagic.pages.dev',
  'www.wishmagic.pages.dev',
  'wishmagic.live',
  'www.wishmagic.live',
  'wishmagic.in',
  'www.wishmagic.in'
]);

export const UTP_GLOBAL_LOGICAL_LINKS = Object.freeze({
  'global.home': {
    id: 'global.home',
    category: 'global',
    defaultPath: '/',
    label: 'WishMagic Home',
    description: 'Navigates to the main WishMagic homepage.'
  },
  'global.explore': {
    id: 'global.explore',
    category: 'global',
    defaultPath: '/templates.html',
    label: 'Explore More Templates',
    description: 'Navigates to the public template discovery gallery.'
  },
  'global.browseTemplates': {
    id: 'global.browseTemplates',
    category: 'global',
    defaultPath: '/templates.html',
    label: 'Browse All Templates',
    description: 'Opens the main template catalog.'
  },
  'global.marketplace': {
    id: 'global.marketplace',
    category: 'global',
    defaultPath: '/marketplace.html',
    label: 'Template Marketplace',
    description: 'Opens the WishMagic Marketplace.'
  },
  'global.createWish': {
    id: 'global.createWish',
    category: 'global',
    defaultPath: '/create.html',
    label: 'Global Create a Wish',
    description: 'Opens the general wish creation wizard.'
  },
  'global.pricing': {
    id: 'global.pricing',
    category: 'global',
    defaultPath: '/pricing.html',
    label: 'Pricing & VIP Pass',
    description: 'Opens the WishMagic pricing page.'
  },
  'global.help': {
    id: 'global.help',
    category: 'global',
    defaultPath: '/help.html',
    label: 'Help & Support Center',
    description: 'Opens the customer help center.'
  },
  'global.contact': {
    id: 'global.contact',
    category: 'global',
    defaultPath: '/contact.html',
    label: 'Contact WishMagic',
    description: 'Opens the contact page.'
  }
});

export const UTP_TEMPLATE_LOGICAL_LINKS = Object.freeze({
  'template.create': {
    id: 'template.create',
    category: 'template',
    defaultPath: '/customize.html',
    preservesTemplateContext: true,
    label: 'Create With This Template',
    description: 'Opens the creation/customization flow pre-selected for this exact template and active relationship variant.'
  },
  'template.customize': {
    id: 'template.customize',
    category: 'template',
    defaultPath: '/customize.html',
    preservesTemplateContext: true,
    label: 'Customize This Template',
    description: 'Opens the template customizer preserving template ID, variant, and relationship context.'
  },
  'template.preview': {
    id: 'template.preview',
    category: 'template',
    defaultPath: '/template-preview.html',
    preservesTemplateContext: true,
    label: 'Preview This Template',
    description: 'Opens the interactive preview page for this template and relationship variant.'
  }
});

export const UTP_ALL_LOGICAL_LINKS = Object.freeze({
  ...UTP_GLOBAL_LOGICAL_LINKS,
  ...UTP_TEMPLATE_LOGICAL_LINKS
});

export const DEFAULT_GLOBAL_BUTTON_LABELS = Object.freeze([
  'Explore More',
  'Visit WishMagic',
  'Browse Templates',
  'Create a Wish',
  'Back to WishMagic',
  'Back to Templates',
  'Explore Templates',
  'View All Templates',
  'More Templates',
  'Discover More',
  'WishMagic Home',
  'Home'
]);

export const DEFAULT_TEMPLATE_BUTTON_LABELS = Object.freeze([
  'Make For Yours',
  'Create Yours',
  'Make One For Me',
  'Customize This Template',
  'Create Your Wish',
  'Personalize This Template',
  'Use This Template',
  'Make One Like This',
  'Customize Now',
  'Create For Your Best Friend',
  'Create For Your Brother',
  'Create For Your Sister',
  'Create For Your Boyfriend',
  'Create For Your Girlfriend',
  'Create For Your Mother',
  'Create For Your Father',
  'Create For Your Partner',
  'Create For Your Wife',
  'Create For Your Husband'
]);

const AMBIGUOUS_GENERIC_BUTTON_LABELS = new Set([
  'click here',
  'learn more',
  'continue',
  'open',
  'go',
  'next',
  'start',
  'view',
  'submit',
  'link',
  'button',
  'tap here'
]);

function safeJsonParse(str, fallback) {
  if (str === null || str === undefined) return fallback;
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(str);
  } catch (_) {
    return fallback;
  }
}

/**
 * Builds the default Central Link Settings object.
 */
export function getDefaultCentralLinkSettings() {
  const globalDestinations = {};
  for (const [k, v] of Object.entries(UTP_GLOBAL_LOGICAL_LINKS)) {
    globalDestinations[k] = v.defaultPath;
  }
  const templateRoutes = {};
  for (const [k, v] of Object.entries(UTP_TEMPLATE_LOGICAL_LINKS)) {
    templateRoutes[k] = v.defaultPath;
  }
  return {
    id: 'default',
    canonicalBaseUrl: DEFAULT_CANONICAL_BASE_URL,
    customDomainUrl: '',
    domainMigrationStatus: 'pages_default',
    globalDestinations,
    templateRoutes,
    globalButtonLabels: [...DEFAULT_GLOBAL_BUTTON_LABELS],
    templateButtonLabels: [...DEFAULT_TEMPLATE_BUTTON_LABELS],
    approvedOrigins: [
      'https://wishmagic.pages.dev',
      'https://wishmagic.live',
      'https://www.wishmagic.live'
    ],
    enforceHttps: true,
    lockVersion: 1,
    updatedAt: '2026-10-18T00:00:00.000Z',
    updatedBy: 'system',
    infrastructureAdvisory: 'Note: Changing the canonical production URL updates runtime-resolved global and template creation links across the platform. DNS records, SSL/TLS certificates, and Cloudflare Pages/Workers custom-domain bindings must be configured and verified separately in Cloudflare.'
  };
}

/**
 * Validates a canonical base origin URL (must be HTTPS, valid hostname, no path/query/hash/credentials/unsafe schemes).
 */
export function validateCanonicalOriginUrl(rawOrigin, { allowEmpty = false, allowLocalhostHttp = false } = {}) {
  const str = String(rawOrigin ?? '').trim();
  if (!str) {
    if (allowEmpty) return { valid: true, normalizedOrigin: '' };
    return { valid: false, code: 'EMPTY_CANONICAL_URL', message: 'Canonical production base URL is required.' };
  }

  const lower = str.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('//') ||
    /[\0<>'"`\s]/.test(str)
  ) {
    return { valid: false, code: 'UNSAFE_ORIGIN_SCHEME', message: `Unsafe URL scheme or characters rejected: "${str}".` };
  }

  let parsed;
  try {
    parsed = new URL(str);
  } catch (_) {
    return { valid: false, code: 'INVALID_ORIGIN_URL', message: `"${str}" is not a valid absolute URL.` };
  }

  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(allowLocalhostHttp && isLocalhost && parsed.protocol === 'http:')) {
    return {
      valid: false,
      code: 'HTTPS_REQUIRED',
      message: `Canonical production URL must use HTTPS (received "${parsed.protocol}").`
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      code: 'CREDENTIALS_IN_URL_REJECTED',
      message: 'Canonical URL must not contain embedded credentials.'
    };
  }

  if ((parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) {
    return {
      valid: false,
      code: 'ORIGIN_MUST_NOT_HAVE_PATH_OR_QUERY',
      message: 'Canonical base URL must be a root origin (e.g. https://wishmagic.pages.dev) without path, query, or hash.'
    };
  }

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(parsed.hostname) && !isLocalhost) {
    return {
      valid: false,
      code: 'INVALID_HOSTNAME',
      message: `Hostname "${parsed.hostname}" is not a valid domain.`
    };
  }

  return {
    valid: true,
    normalizedOrigin: parsed.origin,
    hostname: parsed.hostname
  };
}

/**
 * Validates a full Central Link Manager configuration payload before persisting to D1.
 */
export function validateCentralLinkSettings(incoming = {}) {
  const errors = [];
  const defaults = getDefaultCentralLinkSettings();

  const canonicalCheck = validateCanonicalOriginUrl(
    incoming.canonicalBaseUrl !== undefined ? incoming.canonicalBaseUrl : defaults.canonicalBaseUrl,
    { allowEmpty: false }
  );
  if (!canonicalCheck.valid) {
    errors.push({ field: 'canonicalBaseUrl', code: canonicalCheck.code, message: canonicalCheck.message });
  }

  const customDomainCheck = validateCanonicalOriginUrl(
    incoming.customDomainUrl !== undefined ? incoming.customDomainUrl : '',
    { allowEmpty: true }
  );
  if (!customDomainCheck.valid) {
    errors.push({ field: 'customDomainUrl', code: customDomainCheck.code, message: customDomainCheck.message });
  }

  const approvedSet = new Set(defaults.approvedOrigins);
  if (canonicalCheck.valid && canonicalCheck.normalizedOrigin) {
    approvedSet.add(canonicalCheck.normalizedOrigin);
  }
  if (customDomainCheck.valid && customDomainCheck.normalizedOrigin) {
    approvedSet.add(customDomainCheck.normalizedOrigin);
  }

  if (Array.isArray(incoming.approvedOrigins)) {
    for (const orig of incoming.approvedOrigins) {
      const chk = validateCanonicalOriginUrl(orig, { allowEmpty: true });
      if (!chk.valid) {
        errors.push({ field: 'approvedOrigins', code: chk.code, message: `Invalid approved origin "${orig}": ${chk.message}` });
      } else if (chk.normalizedOrigin) {
        approvedSet.add(chk.normalizedOrigin);
      }
    }
  }

  const normalizedGlobalDestinations = { ...defaults.globalDestinations };
  if (incoming.globalDestinations && typeof incoming.globalDestinations === 'object') {
    for (const [key, rawDest] of Object.entries(incoming.globalDestinations)) {
      if (!UTP_GLOBAL_LOGICAL_LINKS[key] && !/^global\.[a-zA-Z0-9_]{1,40}$/.test(key)) {
        errors.push({
          field: `globalDestinations.${key}`,
          code: 'INVALID_GLOBAL_LINK_ID',
          message: `Unsupported global logical link identifier "${key}". Must start with "global.".`
        });
        continue;
      }
      const valRes = validateLogicalDestinationTarget(rawDest, approvedSet);
      if (!valRes.valid) {
        errors.push({
          field: `globalDestinations.${key}`,
          code: valRes.code,
          message: `Invalid destination for ${key}: ${valRes.message}`
        });
      } else {
        normalizedGlobalDestinations[key] = valRes.normalizedPathOrUrl;
      }
    }
  }

  const normalizedTemplateRoutes = { ...defaults.templateRoutes };
  if (incoming.templateRoutes && typeof incoming.templateRoutes === 'object') {
    for (const [key, rawDest] of Object.entries(incoming.templateRoutes)) {
      if (!UTP_TEMPLATE_LOGICAL_LINKS[key]) {
        errors.push({
          field: `templateRoutes.${key}`,
          code: 'INVALID_TEMPLATE_LINK_ID',
          message: `Unsupported template logical link identifier "${key}".`
        });
        continue;
      }
      const valRes = validateLogicalDestinationTarget(rawDest, approvedSet, { requireInternalContextualRoute: true });
      if (!valRes.valid) {
        errors.push({
          field: `templateRoutes.${key}`,
          code: valRes.code,
          message: `Invalid route for ${key}: ${valRes.message}`
        });
      } else {
        normalizedTemplateRoutes[key] = valRes.normalizedPathOrUrl;
      }
    }
  }

  const cleanLabels = (arr, fallback) => {
    if (!Array.isArray(arr)) return fallback;
    const seen = new Set();
    const out = [];
    for (const item of arr) {
      const s = String(item ?? '').trim();
      if (!s || s.length > 80) continue;
      const low = s.toLowerCase();
      if (seen.has(low)) continue;
      seen.add(low);
      out.push(s);
    }
    return out.length > 0 ? out : fallback;
  };

  const validStatuses = new Set(['pages_default', 'custom_domain_staged', 'custom_domain_active']);
  let migrationStatus = String(incoming.domainMigrationStatus || '').trim();
  if (!validStatuses.has(migrationStatus)) {
    if (canonicalCheck.valid && canonicalCheck.normalizedOrigin && canonicalCheck.normalizedOrigin !== DEFAULT_CANONICAL_BASE_URL) {
      migrationStatus = 'custom_domain_active';
    } else if (customDomainCheck.valid && customDomainCheck.normalizedOrigin) {
      migrationStatus = 'custom_domain_staged';
    } else {
      migrationStatus = 'pages_default';
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: {
      id: 'default',
      canonicalBaseUrl: canonicalCheck.valid ? canonicalCheck.normalizedOrigin : defaults.canonicalBaseUrl,
      customDomainUrl: customDomainCheck.valid ? customDomainCheck.normalizedOrigin : '',
      domainMigrationStatus: migrationStatus,
      globalDestinations: normalizedGlobalDestinations,
      templateRoutes: normalizedTemplateRoutes,
      globalButtonLabels: cleanLabels(incoming.globalButtonLabels, defaults.globalButtonLabels),
      templateButtonLabels: cleanLabels(incoming.templateButtonLabels, defaults.templateButtonLabels),
      approvedOrigins: Array.from(approvedSet),
      enforceHttps: true,
      infrastructureAdvisory: defaults.infrastructureAdvisory
    }
  };
}

/**
 * Validates that a global or template route destination is either a valid internal WishMagic route
 * or an approved HTTPS origin + valid internal route. Blocks open redirects and unsafe schemes.
 */
export function validateLogicalDestinationTarget(rawDest, approvedOriginsSet = new Set(), options = {}) {
  const str = String(rawDest ?? '').trim();
  if (!str) {
    return { valid: false, code: 'EMPTY_DESTINATION', message: 'Destination cannot be empty.' };
  }
  const lower = str.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('//') ||
    /[\0<>'"`]/.test(str)
  ) {
    return { valid: false, code: 'UNSAFE_URL_SCHEME', message: `Unsafe scheme or payload in "${str}".` };
  }

  let pathnameAndSearch = str;
  if (lower.startsWith('https://') || lower.startsWith('http://')) {
    let parsed;
    try {
      parsed = new URL(str);
    } catch (_) {
      return { valid: false, code: 'INVALID_URL', message: `Malformed URL "${str}".` };
    }
    if (parsed.protocol !== 'https:') {
      return { valid: false, code: 'HTTPS_REQUIRED', message: `Destination "${str}" must use HTTPS.` };
    }
    const isKnownHost = KNOWN_INTERNAL_WISHMAGIC_HOSTS.includes(parsed.hostname.toLowerCase()) ||
      approvedOriginsSet.has(parsed.origin);
    if (!isKnownHost) {
      return {
        valid: false,
        code: 'UNAPPROVED_ORIGIN',
        message: `Origin "${parsed.origin}" is not in the approved WishMagic origins list.`
      };
    }
    pathnameAndSearch = `${parsed.pathname || '/'}${parsed.search || ''}`;
  }

  if (!isValidInternalWishMagicRoute(pathnameAndSearch)) {
    return {
      valid: false,
      code: 'UNSUPPORTED_INTERNAL_ROUTE',
      message: `Route "${pathnameAndSearch}" is not a supported internal WishMagic route.`
    };
  }

  // Block open-redirect parameters
  const qIdx = pathnameAndSearch.indexOf('?');
  if (qIdx !== -1) {
    const params = new URLSearchParams(pathnameAndSearch.slice(qIdx + 1));
    for (const [k, v] of params.entries()) {
      const vLow = String(v || '').toLowerCase();
      if (vLow.startsWith('http://') || vLow.startsWith('https://') || vLow.startsWith('//') || vLow.startsWith('javascript:')) {
        return {
          valid: false,
          code: 'OPEN_REDIRECT_PARAM_REJECTED',
          message: `Query parameter "${k}" contains an external or unsafe redirect URL.`
        };
      }
    }
  }

  if (options.requireInternalContextualRoute) {
    const cleanPath = pathnameAndSearch.split('?')[0].toLowerCase().replace(/\/+$/, '') || '/';
    const allowedContextual = new Set([
      '/customize',
      '/customize.html',
      '/create',
      '/create.html',
      '/template-preview',
      '/template-preview.html'
    ]);
    if (!allowedContextual.has(cleanPath)) {
      return {
        valid: false,
        code: 'INVALID_TEMPLATE_ROUTE',
        message: `Template-specific route "${cleanPath}" must point to /customize.html, /create.html, or /template-preview.html.`
      };
    }
  }

  return {
    valid: true,
    normalizedPathOrUrl: pathnameAndSearch
  };
}

// In-memory cache invalidated immediately on save/reset
let cachedCentralLinkSettings = null;

export function invalidateCentralLinkSettingsCache() {
  cachedCentralLinkSettings = null;
}

/**
 * Ensures the `central_link_settings` and `template_link_migrations` tables exist in D1.
 */
export async function ensureCentralLinkManagerSchema(db) {
  if (!db || typeof db.prepare !== 'function') return false;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS central_link_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        canonical_base_url TEXT NOT NULL DEFAULT 'https://wishmagic.pages.dev',
        custom_domain_url TEXT DEFAULT '',
        domain_migration_status TEXT NOT NULL DEFAULT 'pages_default',
        global_destinations_json TEXT NOT NULL DEFAULT '{}',
        template_routes_json TEXT NOT NULL DEFAULT '{}',
        global_button_labels_json TEXT NOT NULL DEFAULT '[]',
        template_button_labels_json TEXT NOT NULL DEFAULT '[]',
        approved_origins_json TEXT NOT NULL DEFAULT '[]',
        enforce_https INTEGER NOT NULL DEFAULT 1,
        lock_version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        updated_by TEXT DEFAULT 'system'
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS template_link_migrations (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        source_version_id TEXT,
        target_version_id TEXT,
        status TEXT NOT NULL DEFAULT 'scanned',
        total_links_scanned INTEGER NOT NULL DEFAULT 0,
        global_links_count INTEGER NOT NULL DEFAULT 0,
        template_links_count INTEGER NOT NULL DEFAULT 0,
        external_links_count INTEGER NOT NULL DEFAULT 0,
        ambiguous_links_count INTEGER NOT NULL DEFAULT 0,
        requires_admin_review INTEGER NOT NULL DEFAULT 0,
        scan_report_json TEXT NOT NULL DEFAULT '{}',
        proposed_mappings_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT,
        published_by TEXT
      )
    `).run();
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Loads the authoritative Central Link Settings from D1 (with safe fallback to defaults).
 */
export async function getCentralLinkSettings(env = {}) {
  const db = env?.DB || env?.wishmagic_db || env?.DATABASE || null;
  if (!db || typeof db.prepare !== 'function') {
    return cachedCentralLinkSettings || getDefaultCentralLinkSettings();
  }

  try {
    await ensureCentralLinkManagerSchema(db);
    const row = await db.prepare('SELECT * FROM central_link_settings WHERE id = ? LIMIT 1').bind('default').first();
    if (!row) {
      const defaults = getDefaultCentralLinkSettings();
      await db.prepare(`
        INSERT OR IGNORE INTO central_link_settings (
          id, canonical_base_url, custom_domain_url, domain_migration_status,
          global_destinations_json, template_routes_json,
          global_button_labels_json, template_button_labels_json,
          approved_origins_json, enforce_https, lock_version, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, 'system')
      `).bind(
        'default',
        defaults.canonicalBaseUrl,
        defaults.customDomainUrl,
        defaults.domainMigrationStatus,
        JSON.stringify(defaults.globalDestinations),
        JSON.stringify(defaults.templateRoutes),
        JSON.stringify(defaults.globalButtonLabels),
        JSON.stringify(defaults.templateButtonLabels),
        JSON.stringify(defaults.approvedOrigins),
        defaults.updatedAt
      ).run().catch(() => {});
      cachedCentralLinkSettings = defaults;
      return defaults;
    }

    const defaults = getDefaultCentralLinkSettings();
    const loaded = {
      id: row.id || 'default',
      canonicalBaseUrl: row.canonical_base_url || defaults.canonicalBaseUrl,
      customDomainUrl: row.custom_domain_url || '',
      domainMigrationStatus: row.domain_migration_status || 'pages_default',
      globalDestinations: {
        ...defaults.globalDestinations,
        ...safeJsonParse(row.global_destinations_json, {})
      },
      templateRoutes: {
        ...defaults.templateRoutes,
        ...safeJsonParse(row.template_routes_json, {})
      },
      globalButtonLabels: safeJsonParse(row.global_button_labels_json, defaults.globalButtonLabels),
      templateButtonLabels: safeJsonParse(row.template_button_labels_json, defaults.templateButtonLabels),
      approvedOrigins: safeJsonParse(row.approved_origins_json, defaults.approvedOrigins),
      enforceHttps: Boolean(row.enforce_https ?? 1),
      lockVersion: Number(row.lock_version || 1),
      updatedAt: row.updated_at || defaults.updatedAt,
      updatedBy: row.updated_by || 'system',
      infrastructureAdvisory: defaults.infrastructureAdvisory
    };
    cachedCentralLinkSettings = loaded;
    return loaded;
  } catch (_) {
    return cachedCentralLinkSettings || getDefaultCentralLinkSettings();
  }
}

/**
 * Validates and persists updated Central Link Settings to D1.
 */
export async function saveCentralLinkSettings(env = {}, incoming = {}, actor = {}) {
  const current = await getCentralLinkSettings(env);
  const mergedInput = {
    canonicalBaseUrl: incoming.canonicalBaseUrl !== undefined ? incoming.canonicalBaseUrl : current.canonicalBaseUrl,
    customDomainUrl: incoming.customDomainUrl !== undefined ? incoming.customDomainUrl : current.customDomainUrl,
    domainMigrationStatus: incoming.domainMigrationStatus !== undefined ? incoming.domainMigrationStatus : current.domainMigrationStatus,
    globalDestinations: {
      ...current.globalDestinations,
      ...(incoming.globalDestinations || {})
    },
    templateRoutes: {
      ...current.templateRoutes,
      ...(incoming.templateRoutes || {})
    },
    globalButtonLabels: incoming.globalButtonLabels !== undefined ? incoming.globalButtonLabels : current.globalButtonLabels,
    templateButtonLabels: incoming.templateButtonLabels !== undefined ? incoming.templateButtonLabels : current.templateButtonLabels,
    approvedOrigins: incoming.approvedOrigins !== undefined ? incoming.approvedOrigins : current.approvedOrigins
  };

  const validation = validateCentralLinkSettings(mergedInput);
  if (!validation.valid) {
    return {
      success: false,
      code: validation.errors[0]?.code || 'INVALID_LINK_SETTINGS',
      error: validation.errors[0]?.message || 'Invalid central link settings.',
      errors: validation.errors
    };
  }

  const norm = validation.normalized;
  const nowIso = new Date().toISOString();
  const nextLock = (Number(current.lockVersion) || 1) + 1;
  const actorName = actor.name || actor.email || actor.id || 'admin';

  const db = env?.DB || env?.wishmagic_db || env?.DATABASE || null;
  if (db && typeof db.prepare === 'function') {
    await ensureCentralLinkManagerSchema(db);
    if (incoming.lockVersion !== undefined && Number(incoming.lockVersion) !== Number(current.lockVersion)) {
      return {
        success: false,
        code: 'CONCURRENCY_CONFLICT',
        status: 409,
        error: 'Central link settings were modified by another administrator. Please reload before saving.'
      };
    }

    await db.prepare(`
      INSERT INTO central_link_settings (
        id, canonical_base_url, custom_domain_url, domain_migration_status,
        global_destinations_json, template_routes_json,
        global_button_labels_json, template_button_labels_json,
        approved_origins_json, enforce_https, lock_version, updated_at, updated_by
      ) VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        canonical_base_url = excluded.canonical_base_url,
        custom_domain_url = excluded.custom_domain_url,
        domain_migration_status = excluded.domain_migration_status,
        global_destinations_json = excluded.global_destinations_json,
        template_routes_json = excluded.template_routes_json,
        global_button_labels_json = excluded.global_button_labels_json,
        template_button_labels_json = excluded.template_button_labels_json,
        approved_origins_json = excluded.approved_origins_json,
        lock_version = excluded.lock_version,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).bind(
      norm.canonicalBaseUrl,
      norm.customDomainUrl,
      norm.domainMigrationStatus,
      JSON.stringify(norm.globalDestinations),
      JSON.stringify(norm.templateRoutes),
      JSON.stringify(norm.globalButtonLabels),
      JSON.stringify(norm.templateButtonLabels),
      JSON.stringify(norm.approvedOrigins),
      nextLock,
      nowIso,
      actorName
    ).run();
  }

  const saved = {
    ...norm,
    lockVersion: nextLock,
    updatedAt: nowIso,
    updatedBy: actorName
  };
  cachedCentralLinkSettings = saved;
  return {
    success: true,
    settings: saved
  };
}

/**
 * Resets Central Link Settings back to factory defaults (`https://wishmagic.pages.dev`).
 */
export async function resetCentralLinkSettings(env = {}, actor = {}) {
  const defaults = getDefaultCentralLinkSettings();
  return await saveCentralLinkSettings(env, defaults, actor);
}

/**
 * Resolves a logical link identifier (`global.*` or `template.*`) or action definition
 * into a safe runtime URL using the authoritative Central Link Settings and template/relationship context.
 *
 * Never constructs routes via unsafe string concatenation. Always uses URL / URLSearchParams.
 */
export function resolveLogicalLink(logicalIdOrAction, context = {}, linkSettings = null) {
  const settings = linkSettings || cachedCentralLinkSettings || getDefaultCentralLinkSettings();
  const canonicalBase = (settings.canonicalBaseUrl || DEFAULT_CANONICAL_BASE_URL).replace(/\/+$/, '');
  const useAbsolute = Boolean(context.useAbsoluteCanonical || context.absoluteUrl || context.includeOrigin);

  let logicalId = '';
  let rawTarget = '';
  let actionType = '';

  if (typeof logicalIdOrAction === 'string') {
    const trimmed = logicalIdOrAction.trim();
    if (trimmed.startsWith('global.') || trimmed.startsWith('template.')) {
      logicalId = trimmed;
    } else {
      rawTarget = trimmed;
    }
  } else if (logicalIdOrAction && typeof logicalIdOrAction === 'object') {
    logicalId = String(logicalIdOrAction.logicalLink || logicalIdOrAction.linkId || '').trim();
    rawTarget = String(logicalIdOrAction.target || logicalIdOrAction.destination || '').trim();
    actionType = String(logicalIdOrAction.type || logicalIdOrAction.actionType || '').toLowerCase().trim();
    if (!logicalId && (rawTarget.startsWith('global.') || rawTarget.startsWith('template.'))) {
      logicalId = rawTarget;
    }
  }

  // Infer logicalId when actionType is 'customizer' or 'template_link' and no explicit logicalId is set
  if (!logicalId) {
    if (actionType === 'customizer' || actionType === 'template_link') {
      const cleanT = rawTarget.split('?')[0].toLowerCase();
      if (cleanT === '/template-preview' || cleanT === '/template-preview.html' || cleanT === '/preview') {
        logicalId = 'template.preview';
      } else {
        logicalId = 'template.customize';
      }
    } else if (actionType === 'global_link') {
      logicalId = inferGlobalLogicalIdFromPath(rawTarget) || 'global.home';
    }
  }

  // 1. Handle Global WishMagic Logical Links (`global.*`)
  if (logicalId && logicalId.startsWith('global.')) {
    const configuredDest = (settings.globalDestinations && settings.globalDestinations[logicalId]) ||
      (UTP_GLOBAL_LOGICAL_LINKS[logicalId] && UTP_GLOBAL_LOGICAL_LINKS[logicalId].defaultPath) ||
      '/';

    const urlObj = new URL(configuredDest.startsWith('/') ? configuredDest : `/${configuredDest}`, canonicalBase);
    // Preserve safe extra query params if provided in rawTarget
    if (rawTarget && rawTarget.includes('?')) {
      const existingQs = rawTarget.slice(rawTarget.indexOf('?') + 1).split('#')[0];
      const extraParams = new URLSearchParams(existingQs);
      for (const [k, v] of extraParams.entries()) {
        if (!urlObj.searchParams.has(k) && !/^https?:\/\/|^\/\//i.test(v)) {
          urlObj.searchParams.set(k, v);
        }
      }
    }

    const relativeUrl = `${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
    return {
      valid: true,
      category: 'global',
      logicalLink: logicalId,
      canonicalOrigin: canonicalBase,
      relativePath: relativeUrl,
      absoluteUrl: urlObj.toString(),
      url: useAbsolute ? urlObj.toString() : relativeUrl,
      resolvedUrl: useAbsolute ? urlObj.toString() : relativeUrl
    };
  }

  // 2. Handle Template-Specific Logical Links (`template.*`)
  if (logicalId && logicalId.startsWith('template.')) {
    const configuredRoute = (settings.templateRoutes && settings.templateRoutes[logicalId]) ||
      (UTP_TEMPLATE_LOGICAL_LINKS[logicalId] && UTP_TEMPLATE_LOGICAL_LINKS[logicalId].defaultPath) ||
      '/customize.html';

    const urlObj = new URL(configuredRoute.startsWith('/') ? configuredRoute : `/${configuredRoute}`, canonicalBase);

    // Preserve any existing query parameters on rawTarget first
    if (rawTarget && rawTarget.includes('?')) {
      const existingQs = rawTarget.slice(rawTarget.indexOf('?') + 1).split('#')[0];
      const extraParams = new URLSearchParams(existingQs);
      for (const [k, v] of extraParams.entries()) {
        if (!/^https?:\/\/|^\/\//i.test(v)) {
          urlObj.searchParams.set(k, v);
        }
      }
    }

    // Deterministically set template, variant, and relationship context
    const tplSlug = String(context.templateSlug || context.templateId || context.template || '').trim();
    const varSlug = String(context.variantSlug || context.variantId || context.variant || '').trim();
    const relSlug = String(context.relationshipSlug || context.relationship || context.rel || '').trim();

    if (tplSlug && !urlObj.searchParams.has('template') && !urlObj.searchParams.has('id')) {
      urlObj.searchParams.set('template', tplSlug);
    }
    if (varSlug && !urlObj.searchParams.has('variant')) {
      urlObj.searchParams.set('variant', varSlug);
    }
    if (relSlug && relSlug !== 'general' && !urlObj.searchParams.has('rel') && !urlObj.searchParams.has('relationship')) {
      urlObj.searchParams.set('rel', relSlug);
    }

    const relativeUrl = `${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
    return {
      valid: true,
      category: 'template',
      logicalLink: logicalId,
      canonicalOrigin: canonicalBase,
      relativePath: relativeUrl,
      absoluteUrl: urlObj.toString(),
      url: useAbsolute ? urlObj.toString() : relativeUrl,
      resolvedUrl: useAbsolute ? urlObj.toString() : relativeUrl
    };
  }

  return {
    valid: false,
    category: 'unknown',
    logicalLink: null,
    canonicalOrigin: canonicalBase,
    relativePath: rawTarget || '',
    absoluteUrl: rawTarget || '',
    resolvedUrl: rawTarget || ''
  };
}

/**
 * Infers a `global.*` logical link identifier from an internal path and optional button label.
 */
export function inferGlobalLogicalIdFromPath(rawPath = '', buttonLabel = '') {
  const cleanPath = String(rawPath || '').split(/[?#]/)[0].toLowerCase().replace(/\/+$/, '') || '/';
  const labelLow = String(buttonLabel || '').trim().toLowerCase();

  if (cleanPath === '/' || cleanPath === '/index.html') {
    return 'global.home';
  }
  if (cleanPath === '/templates' || cleanPath === '/templates.html') {
    if (labelLow.includes('explore') || labelLow.includes('discover')) return 'global.explore';
    return 'global.browseTemplates';
  }
  if (cleanPath === '/marketplace' || cleanPath === '/marketplace.html') {
    return 'global.marketplace';
  }
  if (cleanPath === '/create' || cleanPath === '/create.html') {
    return 'global.createWish';
  }
  if (cleanPath === '/pricing' || cleanPath === '/pricing.html' || cleanPath === '/premium' || cleanPath === '/premium.html') {
    return 'global.pricing';
  }
  if (cleanPath === '/help' || cleanPath === '/help.html') {
    return 'global.help';
  }
  if (cleanPath === '/contact' || cleanPath === '/contact.html') {
    return 'global.contact';
  }
  return null;
}

/**
 * Infers whether a button label strongly indicates a Global WishMagic link vs a Template-Specific link.
 */
export function classifyButtonLabelIntent(rawLabel = '', linkSettings = null) {
  const label = String(rawLabel || '').trim();
  const low = label.toLowerCase().replace(/\s+/g, ' ');
  if (!low) return { category: 'none', logicalLink: null, confidence: 'none' };

  if (AMBIGUOUS_GENERIC_BUTTON_LABELS.has(low)) {
    return { category: 'ambiguous_label', logicalLink: null, confidence: 'low' };
  }

  const settings = linkSettings || cachedCentralLinkSettings || getDefaultCentralLinkSettings();

  // Check explicit template-specific phrases first ("make for yours", "create yours", "make one for me", "customize this template", "create for your <relation>")
  if (
    /\b(make\s+for\s+yours|create\s+yours|make\s+one\s+for\s+me|customize\s+this|personalize\s+this|use\s+this\s+template|make\s+one\s+like\s+this)\b/i.test(low) ||
    /\b(create|make|customize|personalize)\s+(?:one\s+)?for\s+(?:your|my)\s+[a-z\s]+/i.test(low)
  ) {
    return { category: 'template', logicalLink: 'template.customize', confidence: 'high' };
  }

  for (const tplLbl of (settings.templateButtonLabels || DEFAULT_TEMPLATE_BUTTON_LABELS)) {
    if (String(tplLbl).trim().toLowerCase() === low) {
      return { category: 'template', logicalLink: 'template.customize', confidence: 'high' };
    }
  }

  // Check explicit global phrases
  if (/\b(visit\s+wishmagic|back\s+to\s+wishmagic|wishmagic\s+home)\b/i.test(low) || low === 'home') {
    return { category: 'global', logicalLink: 'global.home', confidence: 'high' };
  }
  if (/\b(explore\s+more|explore\s+templates|discover\s+more)\b/i.test(low)) {
    return { category: 'global', logicalLink: 'global.explore', confidence: 'high' };
  }
  if (/\b(browse\s+templates|back\s+to\s+templates|view\s+all\s+templates|more\s+templates|all\s+templates)\b/i.test(low)) {
    return { category: 'global', logicalLink: 'global.browseTemplates', confidence: 'high' };
  }
  if (low === 'create a wish') {
    return { category: 'global', logicalLink: 'global.createWish', confidence: 'medium' };
  }

  for (const glbLbl of (settings.globalButtonLabels || DEFAULT_GLOBAL_BUTTON_LABELS)) {
    if (String(glbLbl).trim().toLowerCase() === low) {
      const mapped = low.includes('home') || low.includes('visit')
        ? 'global.home'
        : (low.includes('explore') ? 'global.explore' : (low.includes('create') ? 'global.createWish' : 'global.browseTemplates'));
      return { category: 'global', logicalLink: mapped, confidence: 'high' };
    }
  }

  return { category: 'unknown', logicalLink: null, confidence: 'low' };
}

/**
 * Checks if an absolute URL points to a known internal WishMagic domain (`wishmagic.pages.dev`, `wishmagic.live`, or configured canonical/custom domain).
 */
export function parseInternalWishMagicUrl(rawUrl = '', linkSettings = null) {
  const str = String(rawUrl || '').trim();
  if (!str) return { isInternalDomain: false, isRelativeInternal: false };

  if (str.startsWith('/') && !str.startsWith('//')) {
    const qIdx = str.indexOf('?');
    const hIdx = str.indexOf('#');
    const pathEnd = qIdx !== -1 ? qIdx : (hIdx !== -1 ? hIdx : str.length);
    return {
      isInternalDomain: false,
      isRelativeInternal: true,
      pathname: str.slice(0, pathEnd) || '/',
      search: qIdx !== -1 ? str.slice(qIdx, hIdx !== -1 ? hIdx : str.length) : '',
      hash: hIdx !== -1 ? str.slice(hIdx) : '',
      fullPath: str
    };
  }

  if (!/^https?:\/\//i.test(str)) {
    return { isInternalDomain: false, isRelativeInternal: false };
  }

  let parsed;
  try {
    parsed = new URL(str);
  } catch (_) {
    return { isInternalDomain: false, isRelativeInternal: false };
  }

  const settings = linkSettings || cachedCentralLinkSettings || getDefaultCentralLinkSettings();
  const hostLow = parsed.hostname.toLowerCase();
  const knownHosts = new Set(KNOWN_INTERNAL_WISHMAGIC_HOSTS);
  try {
    if (settings.canonicalBaseUrl) knownHosts.add(new URL(settings.canonicalBaseUrl).hostname.toLowerCase());
    if (settings.customDomainUrl) knownHosts.add(new URL(settings.customDomainUrl).hostname.toLowerCase());
    for (const orig of (settings.approvedOrigins || [])) {
      knownHosts.add(new URL(orig).hostname.toLowerCase());
    }
  } catch (_) {}

  const isInternalHost = knownHosts.has(hostLow) || hostLow.endsWith('.wishmagic.pages.dev');
  if (!isInternalHost) {
    return {
      isInternalDomain: false,
      isRelativeInternal: false,
      isExternalUrl: true,
      origin: parsed.origin,
      hostname: hostLow,
      pathname: parsed.pathname,
      fullUrl: parsed.toString()
    };
  }

  return {
    isInternalDomain: true,
    isRelativeInternal: false,
    origin: parsed.origin,
    hostname: hostLow,
    pathname: parsed.pathname || '/',
    search: parsed.search || '',
    hash: parsed.hash || '',
    fullPath: `${parsed.pathname || '/'}${parsed.search || ''}${parsed.hash || ''}`
  };
}

/**
 * Inspects a single button/action (from manifest `actions[]` or HTML `<a>`/`<button>`)
 * and produces a structured Part C5 Button Detection & Link Mapping report.
 */
export function inspectAndClassifySingleButton(btnInput = {}, context = {}, linkSettings = null) {
  const settings = linkSettings || cachedCentralLinkSettings || getDefaultCentralLinkSettings();
  const id = String(btnInput.id || btnInput.actionId || btnInput.elementId || '').trim() || 'unnamed_button';
  const label = String(btnInput.label || btnInput.text || '').trim();
  const declaredType = String(btnInput.type || btnInput.actionType || '').toLowerCase().trim();
  const declaredLogicalLink = String(btnInput.logicalLink || btnInput.linkId || '').trim();
  const originalDestination = String(btnInput.target ?? btnInput.href ?? btnInput.destination ?? '').trim();
  const evidence = [];

  const labelIntent = classifyButtonLabelIntent(label, settings);
  const urlInfo = parseInternalWishMagicUrl(originalDestination, settings);

  // 1. Explicit Section Anchor (`type: "section"` or `href="#section"`)
  if (declaredType === 'section' || (originalDestination.startsWith('#') && declaredType !== 'modal')) {
    const cleanSec = originalDestination.replace(/^#/, '').trim();
    evidence.push(declaredType === 'section' ? 'Manifest action type is "section"' : `Anchor href="#${cleanSec}" targets in-page section`);
    return {
      id,
      label,
      originalDestination,
      detectedActionType: 'section',
      category: 'section_anchor',
      logicalLink: null,
      proposedDestination: cleanSec ? `#${cleanSec}` : originalDestination,
      evidence,
      validationResult: {
        valid: Boolean(cleanSec),
        status: cleanSec ? 'valid' : 'invalid',
        code: cleanSec ? 'VALID_SECTION_ANCHOR' : 'EMPTY_SECTION_TARGET',
        message: cleanSec ? `Preserves in-template section scroll to "${cleanSec}".` : 'Section anchor target is empty.'
      },
      requiresAdminConfirmation: !cleanSec
    };
  }

  // 2. Explicit Modal Trigger (`type: "modal"`)
  if (declaredType === 'modal' || btnInput.modalTarget) {
    const cleanModal = (btnInput.modalTarget || originalDestination).replace(/^#/, '').trim();
    evidence.push('Targets in-template modal dialog');
    return {
      id,
      label,
      originalDestination,
      detectedActionType: 'modal',
      category: 'modal_trigger',
      logicalLink: null,
      proposedDestination: cleanModal,
      evidence,
      validationResult: {
        valid: Boolean(cleanModal),
        status: cleanModal ? 'valid' : 'invalid',
        code: cleanModal ? 'VALID_MODAL_TRIGGER' : 'EMPTY_MODAL_TARGET',
        message: cleanModal ? `Preserves in-template modal trigger for "${cleanModal}".` : 'Modal target ID is empty.'
      },
      requiresAdminConfirmation: !cleanModal
    };
  }

  // 3. Passive / None / Interaction / Local Runtime Handler Button (`type: "none" | "interaction" | "button" | "audio" | "trigger"`)
  if (
    ('none' === declaredType && !originalDestination && !declaredLogicalLink) ||
    ['interaction', 'button', 'audio', 'trigger'].includes(declaredType) ||
    Boolean(btnInput.handler && !declaredLogicalLink && !urlInfo.isInternalDomain && !urlInfo.isExternalUrl)
  ) {
    const isInteractive = declaredType !== 'none' || Boolean(btnInput.handler);
    evidence.push(isInteractive ? `Declared as in-template interactive action (${btnInput.handler || declaredType})` : 'Declared as passive/local button (`type: "none"`)');
    return {
      id,
      label,
      originalDestination: originalDestination || btnInput.targetSection || '',
      detectedActionType: isInteractive ? (declaredType || 'interaction') : 'none',
      category: 'passive_button',
      logicalLink: null,
      proposedDestination: originalDestination || btnInput.targetSection || '',
      evidence,
      validationResult: {
        valid: true,
        status: 'valid',
        code: isInteractive ? 'VALID_INTERACTION_ACTION' : 'VALID_PASSIVE_BUTTON',
        message: isInteractive ? `In-template interactive handler (${btnInput.handler || id}) preserved.` : 'Passive/decorative button preserved with no navigation.'
      },
      requiresAdminConfirmation: false
    };
  }

  // 4. Unsafe URL Scheme Check
  const lowerDest = originalDestination.toLowerCase();
  if (
    lowerDest.startsWith('javascript:') ||
    lowerDest.startsWith('data:') ||
    lowerDest.startsWith('vbscript:') ||
    lowerDest.startsWith('file:') ||
    lowerDest.startsWith('//')
  ) {
    evidence.push(`Unsafe URL scheme detected in "${originalDestination}"`);
    return {
      id,
      label,
      originalDestination,
      detectedActionType: 'invalid',
      category: 'unsafe',
      logicalLink: null,
      proposedDestination: '',
      evidence,
      validationResult: {
        valid: false,
        status: 'invalid',
        code: 'UNSAFE_URL_SCHEME',
        message: `Unsafe URL scheme rejected: "${originalDestination}".`
      },
      requiresAdminConfirmation: true
    };
  }

  // 5. Explicit External URL (Non-WishMagic domain)
  if (urlInfo.isExternalUrl) {
    const extCheck = validateActionDestinationUrl(originalDestination, 'external_url');
    evidence.push(`External domain "${urlInfo.hostname}" is not an internal WishMagic host`);
    if (declaredType === 'external_url') {
      evidence.push('Manifest explicitly declares `type: "external_url"`');
    }
    return {
      id,
      label,
      originalDestination,
      detectedActionType: 'external_url',
      category: 'external',
      logicalLink: null,
      proposedDestination: originalDestination,
      evidence,
      validationResult: {
        valid: extCheck.valid,
        status: extCheck.valid ? 'valid' : 'invalid',
        code: extCheck.valid ? 'VALID_EXTERNAL_URL' : extCheck.code,
        message: extCheck.valid ? 'External HTTPS URL preserved unchanged.' : extCheck.message
      },
      requiresAdminConfirmation: !extCheck.valid
    };
  }

  // 6. Explicit UTP v1.3.0 Logical Link Identifier (`global.*` or `template.*`)
  const explicitLogical = declaredLogicalLink ||
    ((originalDestination.startsWith('global.') || originalDestination.startsWith('template.')) ? originalDestination : '');
  if (explicitLogical) {
    const isSupportedLogical = Boolean(UTP_ALL_LOGICAL_LINKS[explicitLogical]);
    if (!isSupportedLogical) {
      evidence.push(`Declared unknown logical link identifier "${explicitLogical}"`);
      return {
        id,
        label,
        originalDestination: originalDestination || explicitLogical,
        detectedActionType: 'ambiguous',
        category: 'ambiguous',
        logicalLink: explicitLogical,
        proposedDestination: '',
        evidence,
        validationResult: {
          valid: false,
          status: 'invalid',
          code: 'UNKNOWN_LOGICAL_LINK_ID',
          message: `Logical link identifier "${explicitLogical}" is not registered in UTP v1.3.0.`
        },
        requiresAdminConfirmation: true
      };
    }

    const resolved = resolveLogicalLink(explicitLogical, context, settings);
    evidence.push(`Explicit UTP v1.3.0 logical link identifier "${explicitLogical}"`);
    return {
      id,
      label,
      originalDestination: originalDestination || explicitLogical,
      detectedActionType: resolved.category === 'template' ? 'customizer' : 'global_link',
      category: resolved.category === 'template' ? 'template_specific' : 'global_internal',
      logicalLink: explicitLogical,
      proposedDestination: resolved.resolvedUrl,
      evidence,
      validationResult: {
        valid: true,
        status: 'valid',
        code: 'VALID_LOGICAL_LINK',
        message: `Resolves dynamically via "${explicitLogical}" to "${resolved.resolvedUrl}".`
      },
      requiresAdminConfirmation: false
    };
  }

  // 7. Internal WishMagic URL (either hardcoded `https://wishmagic.pages.dev/...` or relative `/...`) or `type: "customizer"` / `type: "internal_url"`
  const targetPathname = urlInfo.pathname || (declaredType === 'customizer' ? '/customize.html' : '');
  const cleanPath = targetPathname.toLowerCase().replace(/\/+$/, '') || '/';

  if (urlInfo.isInternalDomain) {
    evidence.push(`Hardcoded internal WishMagic domain "${urlInfo.origin}" detected`);
  } else if (urlInfo.isRelativeInternal) {
    evidence.push(`Internal WishMagic route "${urlInfo.fullPath}" detected`);
  }

  const isPathCustomizer = cleanPath === '/customize' || cleanPath === '/customize.html';
  const isPathPreview = cleanPath === '/template-preview' || cleanPath === '/template-preview.html' || cleanPath === '/preview';
  const isPathGlobalCreate = cleanPath === '/create' || cleanPath === '/create.html';
  const isPathHome = cleanPath === '/' || cleanPath === '/index.html';

  // Check for conflict or ambiguity between Button Label and Target Path!
  // Example 1: Button says "Make For Yours" (template-specific) but points to "/" or "/templates.html" or "/pricing.html"
  if (labelIntent.category === 'template' && targetPathname && !isPathCustomizer && !isPathPreview && !isPathGlobalCreate) {
    evidence.push(`Button label "${label}" implies template-specific creation, but target "${originalDestination}" points to global route "${cleanPath}"`);
    const resolvedProposed = resolveLogicalLink('template.customize', context, settings);
    return {
      id,
      label,
      originalDestination,
      detectedActionType: 'ambiguous',
      category: 'ambiguous',
      logicalLink: 'template.customize',
      proposedDestination: resolvedProposed.resolvedUrl,
      evidence,
      validationResult: {
        valid: true,
        status: 'warning',
        code: 'AMBIGUOUS_LABEL_VS_DESTINATION',
        message: `Ambiguous button intent: label "${label}" suggests customizing this template, but link points to "${originalDestination}". Administrator confirmation required.`
      },
      requiresAdminConfirmation: true
    };
  }

  // Example 2: Button says "Explore More" or "Browse Templates" (global) but action type was set to "customizer"
  if (labelIntent.category === 'global' && (declaredType === 'customizer' || isPathCustomizer) && labelIntent.logicalLink !== 'global.createWish') {
    evidence.push(`Button label "${label}" implies global navigation (${labelIntent.logicalLink}), but target/type points to template customizer`);
    const resolvedProposed = resolveLogicalLink(labelIntent.logicalLink, context, settings);
    return {
      id,
      label,
      originalDestination,
      detectedActionType: 'ambiguous',
      category: 'ambiguous',
      logicalLink: labelIntent.logicalLink,
      proposedDestination: resolvedProposed.resolvedUrl,
      evidence,
      validationResult: {
        valid: true,
        status: 'warning',
        code: 'AMBIGUOUS_GLOBAL_LABEL_ON_CUSTOMIZER',
        message: `Ambiguous button intent: label "${label}" suggests global navigation (${labelIntent.logicalLink}), but target is "${originalDestination}". Administrator confirmation required.`
      },
      requiresAdminConfirmation: true
    };
  }

  // Example 3: Generic button label ("Click Here", "Continue", "Learn More") pointing to bare homepage or hardcoded domain
  if (labelIntent.category === 'ambiguous_label' && (urlInfo.isInternalDomain || isPathHome)) {
    evidence.push(`Generic button label "${label}" cannot disambiguate global vs template-specific intent`);
    return {
      id,
      label,
      originalDestination,
      detectedActionType: 'ambiguous',
      category: 'ambiguous',
      logicalLink: isPathCustomizer ? 'template.customize' : 'global.home',
      proposedDestination: originalDestination,
      evidence,
      validationResult: {
        valid: true,
        status: 'warning',
        code: 'AMBIGUOUS_BUTTON_LABEL',
        message: `Button label "${label}" is ambiguous. Please confirm whether this button should navigate globally or open this template's customizer.`
      },
      requiresAdminConfirmation: true
    };
  }

  // Unambiguous Template-Specific Customizer / Preview Link
  if (
    declaredType === 'customizer' ||
    declaredType === 'template_link' ||
    isPathCustomizer ||
    isPathPreview ||
    (isPathGlobalCreate && labelIntent.category === 'template') ||
    (!originalDestination && labelIntent.category === 'template')
  ) {
    const logicalId = isPathPreview ? 'template.preview' : 'template.customize';
    const resolved = resolveLogicalLink(logicalId, context, settings);
    if (declaredType === 'customizer') evidence.push('Action type is "customizer"');
    if (labelIntent.category === 'template') evidence.push(`Button label "${label}" matches template-specific creation pattern`);
    if (isPathCustomizer) evidence.push('Target route is /customize.html');
    return {
      id,
      label,
      originalDestination: originalDestination || '/customize.html',
      detectedActionType: 'customizer',
      category: 'template_specific',
      logicalLink: logicalId,
      proposedDestination: resolved.resolvedUrl,
      evidence,
      validationResult: {
        valid: true,
        status: urlInfo.isInternalDomain ? 'warning' : 'valid',
        code: urlInfo.isInternalDomain ? 'MIGRATE_HARDCODED_TEMPLATE_LINK' : 'VALID_TEMPLATE_LINK',
        message: urlInfo.isInternalDomain
          ? `Hardcoded domain in "${originalDestination}" mapped to logical "${logicalId}" (${resolved.resolvedUrl}).`
          : `Resolves to template creation route "${resolved.resolvedUrl}".`
      },
      requiresAdminConfirmation: false
    };
  }

  // Unambiguous Global Internal Link
  if (urlInfo.isInternalDomain || urlInfo.isRelativeInternal || labelIntent.category === 'global') {
    const routeValid = targetPathname ? isValidInternalWishMagicRoute(targetPathname) : true;
    if (!routeValid) {
      evidence.push(`Internal path "${targetPathname}" is not in the supported WishMagic route allowlist`);
      return {
        id,
        label,
        originalDestination,
        detectedActionType: 'ambiguous',
        category: 'ambiguous',
        logicalLink: null,
        proposedDestination: originalDestination,
        evidence,
        validationResult: {
          valid: false,
          status: 'invalid',
          code: 'UNSUPPORTED_INTERNAL_ROUTE',
          message: `Internal route "${targetPathname}" is not a recognized WishMagic route. Admin review required.`
        },
        requiresAdminConfirmation: true
      };
    }

    const inferredGlobalId = (targetPathname ? inferGlobalLogicalIdFromPath(targetPathname, label) : null) ||
      labelIntent.logicalLink ||
      'global.home';
    const resolved = resolveLogicalLink(inferredGlobalId, context, settings);
    if (labelIntent.category === 'global') {
      evidence.push(`Button label "${label}" matches global navigation label (${inferredGlobalId})`);
    }
    return {
      id,
      label,
      originalDestination: originalDestination || resolved.relativePath,
      detectedActionType: 'global_link',
      category: 'global_internal',
      logicalLink: inferredGlobalId,
      proposedDestination: resolved.resolvedUrl,
      evidence,
      validationResult: {
        valid: true,
        status: urlInfo.isInternalDomain ? 'warning' : 'valid',
        code: urlInfo.isInternalDomain ? 'MIGRATE_HARDCODED_GLOBAL_LINK' : 'VALID_GLOBAL_LINK',
        message: urlInfo.isInternalDomain
          ? `Hardcoded domain in "${originalDestination}" mapped to central "${inferredGlobalId}" (${resolved.resolvedUrl}).`
          : `Resolves via central "${inferredGlobalId}" to "${resolved.resolvedUrl}".`
      },
      requiresAdminConfirmation: false
    };
  }

  // Fallback: unrecognized / ambiguous button
  evidence.push('Could not deterministically classify button destination from manifest or HTML attributes');
  return {
    id,
    label,
    originalDestination,
    detectedActionType: 'ambiguous',
    category: 'ambiguous',
    logicalLink: null,
    proposedDestination: originalDestination,
    evidence,
    validationResult: {
      valid: false,
      status: 'warning',
      code: 'AMBIGUOUS_ACTION_TARGET',
      message: `Button "${label || id}" has an ambiguous destination ("${originalDestination}"). Please review and select its destination.`
    },
    requiresAdminConfirmation: true
  };
}

/**
 * Inspects all buttons and links across a template package (`manifest` + HTML files)
 * during ZIP upload or existing-template link scanning (Requirements C5 & C6).
 */
export function detectAndClassifyPackageButtons({
  manifest = {},
  htmlContent = '',
  htmlFilesMap = null,
  templateContext = {},
  linkSettings = null
} = {}) {
  const settings = linkSettings || cachedCentralLinkSettings || getDefaultCentralLinkSettings();
  const context = {
    templateId: templateContext.templateId || manifest?.template?.id || '',
    templateSlug: templateContext.templateSlug || manifest?.template?.slug || manifest?.template?.id || '',
    variantSlug: templateContext.variantSlug || '',
    relationshipSlug: templateContext.relationshipSlug || ''
  };

  const detectedButtons = [];
  const seenActionIds = new Set();

  // 1. Inspect manifest `actions[]`
  const manifestActions = Array.isArray(manifest?.actions) ? manifest.actions : [];
  for (const act of manifestActions) {
    if (!act || typeof act !== 'object') continue;
    const actId = String(act.id || act.key || '').trim();
    if (actId) seenActionIds.add(actId);
    const report = inspectAndClassifySingleButton({
      id: actId,
      label: act.label || act.defaultLabel || '',
      type: act.type || act.actionType || '',
      logicalLink: act.logicalLink || act.linkId || '',
      target: act.target || act.destination || ''
    }, context, settings);
    report.source = 'manifest_action';
    report.sectionId = act.sectionId || null;
    detectedButtons.push(report);
  }

  // 2. Inspect HTML `<a>` and `<button>` elements (including unmarked hardcoded links!)
  const htmlSources = [];
  if (htmlContent && typeof htmlContent === 'string') {
    htmlSources.push({ path: 'index.html', content: htmlContent });
  }
  if (htmlFilesMap instanceof Map) {
    for (const [p, entry] of htmlFilesMap.entries()) {
      if (!p.toLowerCase().endsWith('.html')) continue;
      const txt = typeof entry === 'string' ? entry : (entry?.text || entry?.content || '');
      if (txt && !htmlSources.some(s => s.path === p)) {
        htmlSources.push({ path: p, content: txt });
      }
    }
  }

  const anchorOrBtnRegex = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const src of htmlSources) {
    let match;
    let autoIdx = 1;
    while ((match = anchorOrBtnRegex.exec(src.content)) !== null) {
      const tag = match[1].toLowerCase();
      const attrs = match[2] || '';
      const innerHtml = match[3] || '';
      const innerText = innerHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

      const wmActionMatch = attrs.match(/\bdata-wm-(?:action|button)\s*=\s*["']([^"']+)["']/i);
      const wmLinkMatch = attrs.match(/\bdata-wm-link\s*=\s*["']([^"']+)["']/i);
      const wmTypeMatch = attrs.match(/\bdata-wm-action-type\s*=\s*["']([^"']+)["']/i);
      const wmTargetMatch = attrs.match(/\bdata-wm-action-target\s*=\s*["']([^"']+)["']/i);
      const wmModalMatch = attrs.match(/\bdata-wm-modal-target\s*=\s*["']([^"']+)["']/i);
      const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
      const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);

      const actId = wmActionMatch ? wmActionMatch[1].trim() : '';
      if (actId && seenActionIds.has(actId)) {
        // Enrich existing manifest action report if HTML had a hardcoded href or data-wm-link
        const existingReport = detectedButtons.find(b => b.id === actId);
        if (existingReport && wmLinkMatch && !existingReport.logicalLink) {
          existingReport.logicalLink = wmLinkMatch[1].trim();
        }
        continue;
      }

      const rawHref = wmTargetMatch ? wmTargetMatch[1].trim() : (hrefMatch ? hrefMatch[1].trim() : '');
      const rawLogical = wmLinkMatch ? wmLinkMatch[1].trim() : '';
      const rawType = wmTypeMatch ? wmTypeMatch[1].trim() : '';
      const rawModal = wmModalMatch ? wmModalMatch[1].trim() : '';

      // Skip plain non-navigation buttons that have no action attribute, no href, no modal target, and no link intent
      if (tag === 'button' && !actId && !rawHref && !rawLogical && !rawType && !rawModal) {
        const intent = classifyButtonLabelIntent(innerText, settings);
        if (intent.category !== 'global' && intent.category !== 'template') {
          continue;
        }
      }

      const elementId = actId || (idMatch ? idMatch[1].trim() : `html_${tag}_${autoIdx++}`);
      if (actId) seenActionIds.add(actId);

      const report = inspectAndClassifySingleButton({
        id: elementId,
        label: innerText || elementId,
        type: rawType,
        logicalLink: rawLogical,
        target: rawHref,
        modalTarget: rawModal
      }, context, settings);
      report.source = actId ? 'html_wm_action' : `html_${tag}`;
      report.filePath = src.path;
      detectedButtons.push(report);
    }
  }

  const summary = {
    totalDetected: detectedButtons.length,
    globalLinksCount: detectedButtons.filter(b => b.category === 'global_internal').length,
    templateLinksCount: detectedButtons.filter(b => b.category === 'template_specific').length,
    externalLinksCount: detectedButtons.filter(b => b.category === 'external').length,
    sectionAnchorsCount: detectedButtons.filter(b => b.category === 'section_anchor').length,
    modalTriggersCount: detectedButtons.filter(b => b.category === 'modal_trigger').length,
    ambiguousCount: detectedButtons.filter(b => b.requiresAdminConfirmation).length,
    requiresAdminConfirmation: detectedButtons.some(b => b.requiresAdminConfirmation)
  };

  return {
    buttons: detectedButtons,
    summary
  };
}

/**
 * C6: Scans a template's files/manifest/records for hardcoded internal WishMagic URLs
 * and classifies every occurrence into the 6 required categories:
 * - `global_internal`
 * - `template_specific`
 * - `external`
 * - `environment_config`
 * - `historical_content`
 * - `documentation_fixture`
 * - `ambiguous`
 */
export function scanTemplateForLinkMigration({
  templateId,
  templateSlug,
  templateName = '',
  versionId = null,
  manifest = {},
  htmlContent = '',
  filesMap = null,
  linkSettings = null
} = {}) {
  const settings = linkSettings || cachedCentralLinkSettings || getDefaultCentralLinkSettings();
  const context = {
    templateId: templateId || manifest?.template?.id || '',
    templateSlug: templateSlug || manifest?.template?.slug || templateId || ''
  };

  const buttonInspection = detectAndClassifyPackageButtons({
    manifest,
    htmlContent,
    htmlFilesMap: filesMap,
    templateContext: context,
    linkSettings: settings
  });

  const occurrences = [];
  const proposedMappings = {};

  for (const btn of buttonInspection.buttons) {
    const urlInfo = parseInternalWishMagicUrl(btn.originalDestination, settings);
    const hasHardcodedDomain = Boolean(urlInfo.isInternalDomain);
    occurrences.push({
      id: btn.id,
      filePath: btn.filePath || 'wishmagic.json',
      elementOrField: btn.source,
      label: btn.label,
      originalUrl: btn.originalDestination,
      classification: btn.category,
      detectedActionType: btn.detectedActionType,
      logicalLink: btn.logicalLink,
      proposedDestination: btn.proposedDestination,
      hasHardcodedInternalDomain: hasHardcodedDomain,
      requiresAdminConfirmation: btn.requiresAdminConfirmation,
      evidence: btn.evidence,
      validationResult: btn.validationResult
    });

    if (btn.logicalLink && !btn.requiresAdminConfirmation) {
      proposedMappings[btn.id] = {
        actionId: btn.id,
        label: btn.label,
        logicalLink: btn.logicalLink,
        type: btn.category === 'template_specific' ? 'customizer' : 'internal_url',
        originalDestination: btn.originalDestination,
        proposedDestination: btn.proposedDestination
      };
    }
  }

  // Also scan raw text files (HTML/JS/CSS/JSON/MD) for any other hardcoded internal domain references
  const textEntries = [];
  if (htmlContent) textEntries.push({ path: 'index.html', text: htmlContent });
  if (filesMap instanceof Map) {
    for (const [p, entry] of filesMap.entries()) {
      const txt = typeof entry === 'string' ? entry : (entry?.text || entry?.content || '');
      if (txt && !textEntries.some(e => e.path === p)) {
        textEntries.push({ path: p, text: txt });
      }
    }
  }

  const domainRegex = /https?:\/\/(?:www\.)?(?:wishmagic\.pages\.dev|wishmagic\.live|wishmagic\.in)([^\s"'<>`)]*)/gi;
  for (const entry of textEntries) {
    const lowerPath = entry.path.toLowerCase();
    const isDocOrTest = lowerPath.endsWith('.md') || lowerPath.endsWith('.txt') || lowerPath.includes('test') || lowerPath.includes('readme');
    let m;
    while ((m = domainRegex.exec(entry.text)) !== null) {
      const fullUrl = m[0];
      const subPath = m[1] || '/';
      // Skip if already captured by button inspection
      if (occurrences.some(o => o.originalUrl === fullUrl && o.filePath === entry.path)) {
        continue;
      }
      let classification = 'environment_config';
      let requiresReview = false;
      if (isDocOrTest) {
        classification = 'documentation_fixture';
      } else if (subPath.startsWith('/w/') || subPath.startsWith('/wish')) {
        classification = 'historical_content';
      } else if (subPath.startsWith('/api/') || subPath.startsWith('/js/') || subPath.startsWith('/assets/')) {
        classification = 'environment_config';
      } else {
        classification = 'ambiguous';
        requiresReview = true;
      }
      occurrences.push({
        id: `ref_${occurrences.length + 1}`,
        filePath: entry.path,
        elementOrField: 'text_reference',
        label: '',
        originalUrl: fullUrl,
        classification,
        detectedActionType: classification,
        logicalLink: null,
        proposedDestination: fullUrl,
        hasHardcodedInternalDomain: true,
        requiresAdminConfirmation: requiresReview,
        evidence: [`Found hardcoded internal domain reference in ${entry.path}`],
        validationResult: {
          valid: !requiresReview,
          status: requiresReview ? 'warning' : 'valid',
          code: requiresReview ? 'AMBIGUOUS_DOMAIN_REFERENCE' : 'NON_ACTION_REFERENCE',
          message: requiresReview
            ? `Hardcoded domain URL "${fullUrl}" in ${entry.path} requires admin review.`
            : `Classified as ${classification}; preserved without blind replacement.`
        }
      });
    }
  }

  const summary = {
    templateId: context.templateId,
    templateSlug: context.templateSlug,
    templateName,
    versionId,
    totalScanned: occurrences.length,
    globalInternalCount: occurrences.filter(o => o.classification === 'global_internal').length,
    templateSpecificCount: occurrences.filter(o => o.classification === 'template_specific').length,
    externalCount: occurrences.filter(o => o.classification === 'external').length,
    environmentConfigCount: occurrences.filter(o => o.classification === 'environment_config').length,
    historicalContentCount: occurrences.filter(o => o.classification === 'historical_content').length,
    documentationFixtureCount: occurrences.filter(o => o.classification === 'documentation_fixture').length,
    ambiguousCount: occurrences.filter(o => o.requiresAdminConfirmation).length,
    hardcodedDomainCount: occurrences.filter(o => o.hasHardcodedInternalDomain).length,
    requiresAdminReview: occurrences.some(o => o.requiresAdminConfirmation)
  };

  return {
    templateId: context.templateId,
    templateSlug: context.templateSlug,
    templateName,
    versionId,
    summary,
    occurrences,
    buttons: buttonInspection.buttons,
    proposedMappings
  };
}

/**
 * Applies validated logical link mappings to a template's manifest `actions[]` and HTML content
 * without blindly replacing external links, prose, or unrelated domain mentions.
 */
export function applySafeLinkNormalizationToTemplate({
  manifest = {},
  htmlContent = '',
  confirmedMappings = {},
  templateContext = {},
  linkSettings = null
} = {}) {
  const settings = linkSettings || cachedCentralLinkSettings || getDefaultCentralLinkSettings();
  const context = {
    templateId: templateContext.templateId || manifest?.template?.id || '',
    templateSlug: templateContext.templateSlug || manifest?.template?.slug || ''
  };

  const clonedManifest = JSON.parse(JSON.stringify(manifest || {}));
  const actions = Array.isArray(clonedManifest.actions) ? clonedManifest.actions : [];
  let updatedHtml = String(htmlContent || '');
  const appliedChanges = [];

  for (const [actionId, mapping] of Object.entries(confirmedMappings || {})) {
    if (!mapping || typeof mapping !== 'object') continue;
    const logicalId = String(mapping.logicalLink || '').trim();
    if (!logicalId || !UTP_ALL_LOGICAL_LINKS[logicalId]) continue;

    const resolved = resolveLogicalLink(logicalId, context, settings);
    const targetType = resolved.category === 'template' ? 'customizer' : 'internal_url';

    const existingAct = actions.find(a => (a.id || a.key) === actionId);
    if (existingAct) {
      const prevTarget = existingAct.target;
      existingAct.logicalLink = logicalId;
      existingAct.type = targetType;
      existingAct.target = resolved.relativePath;
      if (mapping.label) existingAct.label = String(mapping.label).trim();
      appliedChanges.push({
        actionId,
        logicalLink: logicalId,
        previousTarget: prevTarget,
        normalizedTarget: resolved.relativePath
      });
    } else {
      actions.push({
        id: actionId,
        label: mapping.label || actionId,
        type: targetType,
        logicalLink: logicalId,
        target: resolved.relativePath,
        editableLabel: true,
        configurable: true,
        relationshipSpecific: resolved.category === 'template',
        required: false,
        defaultEnabled: true,
        fallbackBehavior: 'hide'
      });
      appliedChanges.push({
        actionId,
        logicalLink: logicalId,
        previousTarget: mapping.originalDestination || '',
        normalizedTarget: resolved.relativePath
      });
    }

    // Update matching HTML element with `data-wm-action="<actionId>"` or `id="<actionId>"` to include `data-wm-link="<logicalId>"`
    // and replace hardcoded internal href on that specific element only
    if (updatedHtml) {
      const escapedId = actionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const elRegex = new RegExp(`(<(?:a|button)\\b[^>]*\\b(?:data-wm-(?:action|button)|id)\\s*=\\s*["']${escapedId}["'][^>]*>)`, 'gi');
      updatedHtml = updatedHtml.replace(elRegex, (tagOpen) => {
        let nextTag = tagOpen;
        if (!/\bdata-wm-link\s*=/i.test(nextTag)) {
          nextTag = nextTag.replace(/>$/, ` data-wm-link="${logicalId}">`);
        } else {
          nextTag = nextTag.replace(/\bdata-wm-link\s*=\s*["'][^"']*["']/i, `data-wm-link="${logicalId}"`);
        }
        if (/\bhref\s*=\s*["'][^"']*["']/i.test(nextTag)) {
          nextTag = nextTag.replace(/\bhref\s*=\s*["'][^"']*["']/i, `href="${resolved.relativePath}"`);
        }
        return nextTag;
      });
    }
  }

  clonedManifest.actions = actions;
  return {
    normalizedManifest: clonedManifest,
    normalizedHtml: updatedHtml,
    appliedChanges
  };
}
