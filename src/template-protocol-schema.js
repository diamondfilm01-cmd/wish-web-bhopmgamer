/**
 * WishMagic Universal Template Protocol (UTP v1.0.0 / v1.1.0 / v1.2.0)
 * ====================================================================
 * Formal machine-readable specification for self-contained celebration templates,
 * including:
 * - UTP v1.0.0 single-variant templates
 * - UTP v1.1.0 multi-relationship variant families
 * - UTP v1.2.0 nested section/subsection hierarchy, relationship-scoped visibility
 *   precedence, and deterministic admin-editable button/action registry.
 */

export const UTP_SCHEMA_VERSION = '1.0.0';
export const UTP_VARIANT_SCHEMA_VERSION = '1.1.0';
export const UTP_SECTIONS_ACTIONS_SCHEMA_VERSION = '1.2.0';
export const UTP_LINK_MANAGER_SCHEMA_VERSION = '1.3.0';
export const UTP_FESTIVAL_SCHEMA_VERSION = '1.4.0';
export const UTP_V1_4_SCHEMA_VERSION = '1.4.0';
export const UTP_LATEST_SCHEMA_VERSION = '1.4.0';
export const UTP_SUPPORTED_SCHEMA_VERSIONS = Object.freeze(['1.0', '1.0.0', '1.1', '1.1.0', '1.2', '1.2.0', '1.3', '1.3.0', '1.4', '1.4.0']);
export const UTP_RUNTIME_API_VERSION = '1.0';
export const UTP_LATEST_RUNTIME_API_VERSION = '1.4';
export const UTP_FESTIVAL_RUNTIME_API_VERSION = '1.4';
export const UTP_SUPPORTED_RUNTIME_API_VERSIONS = Object.freeze(['1.0', '1.1', '1.2', '1.3', '1.4']);
export const UTP_PROTOCOL_NAME = 'wishmagic-template';

/**
 * Maximum supported nesting depth for sections -> subsections -> nested subsections.
 * Level 1 = top-level section, Level 2 = child subsection, Level 3 = grandchild subsection.
 */
export const UTP_MAX_SECTION_NESTING_DEPTH = 3;

/**
 * Supported empty-parent handling policies when all subsections inside a parent section are disabled.
 * - 'collapse': completely remove the parent section from DOM so no empty container or gap remains.
 * - 'keep': keep the parent section if it has its own standalone non-subsection content.
 */
export const UTP_EMPTY_PARENT_POLICIES = new Set(['collapse', 'keep']);

/**
 * Supported button / link action types in UTP v1.2.0 (`actions[]` in `wishmagic.json`).
 * Verified against real WishMagic runtime and routing capabilities:
 * - 'internal_url': Navigates to a validated internal WishMagic route (preserving template/variant/rel context)
 * - 'external_url': Opens a validated safe HTTPS (or explicitly allowed HTTP) external URL in a new tab with rel="noopener noreferrer"
 * - 'section': Smooth-scrolls to or reveals an enabled `[data-wm-section]` or `[data-wm-subsection]` inside the template
 * - 'modal': Opens an existing in-template modal (`[data-wm-modal="<target>"]` or `#<target>`)
 * - 'customizer': Navigates directly to `/customize.html` preserving `template`, `variant`, and `rel` parameters without re-prompting for relationship
 * - 'none': Passive/decorative button or handled purely by template-local non-navigation visual effect (e.g. confetti burst)
 */
export const UTP_SUPPORTED_ACTION_TYPES = new Set([
  'internal_url',
  'external_url',
  'section',
  'modal',
  'customizer',
  'global_link',
  'template_link',
  'interaction',
  'navigation',
  'button',
  'audio',
  'trigger',
  'none'
]);

export const UTP_SUPPORTED_LOGICAL_LINKS = Object.freeze({
  'global.home': '/',
  'global.explore': '/templates.html',
  'global.browseTemplates': '/templates.html',
  'global.marketplace': '/marketplace.html',
  'global.createWish': '/create.html',
  'global.pricing': '/pricing.html',
  'global.help': '/help.html',
  'global.contact': '/contact.html',
  'template.create': '/customize.html',
  'template.customize': '/customize.html',
  'template.preview': '/template-preview.html'
});

export function isValidLogicalLinkIdentifier(rawId) {
  if (!rawId || typeof rawId !== 'string') return false;
  return Object.prototype.hasOwnProperty.call(UTP_SUPPORTED_LOGICAL_LINKS, rawId.trim());
}

/**
 * Supported fallback behaviors when an action's target section or modal is disabled or unavailable:
 * - 'hide': Completely remove the button from DOM so customers never see a dead or broken button (Default)
 * - 'disable': Render button inert/non-interactive (only if explicitly requested by template layout)
 * - 'none': Do nothing
 */
export const UTP_ACTION_FALLBACK_BEHAVIORS = new Set([
  'hide',
  'disable',
  'none'
]);

/**
 * Authoritative allowlist of valid internal WishMagic routes for `internal_url` actions.
 */
export const UTP_VALID_INTERNAL_ROUTES = Object.freeze([
  '/',
  '/index.html',
  '/templates',
  '/templates.html',
  '/marketplace',
  '/marketplace.html',
  '/template-preview',
  '/template-preview.html',
  '/customize',
  '/customize.html',
  '/create',
  '/create.html',
  '/my-wishes',
  '/my-wishes.html',
  '/pricing',
  '/pricing.html',
  '/premium',
  '/premium.html',
  '/favorites',
  '/favorites.html',
  '/help',
  '/help.html',
  '/contact',
  '/contact.html',
  '/wish',
  '/wish.html'
]);

/**
 * Validates whether a path is a supported internal WishMagic route.
 */
export function isValidInternalWishMagicRoute(rawTarget) {
  if (!rawTarget || typeof rawTarget !== 'string') return false;
  let trimmed = rawTarget.trim();
  if (!trimmed || trimmed.startsWith('//')) return false;
  if (/[\0<>'"`]/.test(trimmed)) return false;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.toLowerCase();
      const isWishMagicHost =
        host === 'wishmagic.pages.dev' ||
        host === 'www.wishmagic.pages.dev' ||
        host === 'wishmagic.live' ||
        host === 'www.wishmagic.live' ||
        host === 'wishmagic.in' ||
        host === 'www.wishmagic.in' ||
        host.endsWith('.wishmagic.in') ||
        host.endsWith('.wishmagic.live') ||
        host.endsWith('.wishmagic.org') ||
        host.endsWith('.pages.dev') ||
        host === 'localhost' ||
        host === '127.0.0.1';
      if (!isWishMagicHost) return false;
      if (parsed.protocol !== 'https:' && host !== 'localhost' && host !== '127.0.0.1') return false;
      trimmed = `${parsed.pathname || '/'}${parsed.search || ''}${parsed.hash || ''}`;
    } catch (_) {
      return false;
    }
  }

  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return false;

  const [pathnamePart] = trimmed.split(/[?#]/);
  const cleanPath = pathnamePart.replace(/\/+$/, '') || '/';

  if (UTP_VALID_INTERNAL_ROUTES.includes(cleanPath)) return true;
  if (/^\/templates?\/[a-zA-Z0-9_.-]+$/.test(cleanPath)) return true;
  if (/^\/w(ish)?\/[a-zA-Z0-9_.-]+$/.test(cleanPath)) return true;
  if (/^\/(legal|privacy|terms|about|refund|faq|support)(\.html)?$/i.test(cleanPath)) return true;
  return false;
}

/**
 * Validates whether a URL is safe for `external_url` or `internal_url` action navigation.
 * Strictly rejects `javascript:`, `data:`, `file:`, `vbscript:`, `blob:`, protocol-relative `//`,
 * and inline script payloads.
 */
export function validateActionDestinationUrl(arg1, arg2 = "external_url", options = {}) {
  let rawUrl = arg1;
  let actionType = arg2;
  if (typeof arg1 === "string" && UTP_SUPPORTED_ACTION_TYPES.has(arg1.toLowerCase().trim()) && arg2 !== undefined && !UTP_SUPPORTED_ACTION_TYPES.has(String(arg2).toLowerCase().trim())) {
    actionType = arg1.toLowerCase().trim();
    rawUrl = arg2;
  } else {
    actionType = String(arg2 || "external_url").toLowerCase().trim();
  }

  if ((actionType === "customizer" || actionType === "template_link") && (rawUrl === undefined || rawUrl === null || String(rawUrl).trim() === "")) {
    rawUrl = "/customize.html";
  }
  if (actionType === "global_link" && (rawUrl === undefined || rawUrl === null || String(rawUrl).trim() === "")) {
    rawUrl = "global.home";
  }

  if (rawUrl === undefined || rawUrl === null) {
    const msg = "Action target URL is required.";
    return { valid: false, code: "MISSING_ACTION_TARGET", message: msg, reason: msg };
  }
  const str = String(rawUrl).trim();
  if (!str) {
    const msg = "Action target URL cannot be empty.";
    return { valid: false, code: "EMPTY_ACTION_TARGET", message: msg, reason: msg };
  }

  const lower = str.replace(/\s+/g, "").toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("//") ||
    lower.includes("<script") ||
    lower.includes("onerror=") ||
    lower.includes("onclick=")
  ) {
    const msg = `Unsafe URL scheme or script payload rejected in action target "${str}".`;
    return {
      valid: false,
      code: "UNSAFE_URL_SCHEME",
      message: msg,
      reason: msg
    };
  }

  if (str.startsWith("global.") || str.startsWith("template.")) {
    if (!isValidLogicalLinkIdentifier(str)) {
      const msg = `Unknown UTP v1.3.0 logical link identifier "${str}".`;
      return {
        valid: false,
        code: "UNKNOWN_LOGICAL_LINK_ID",
        message: msg,
        reason: msg
      };
    }
    const defaultRoute = UTP_SUPPORTED_LOGICAL_LINKS[str];
    return { valid: true, normalizedTarget: defaultRoute, normalizedUrl: defaultRoute, logicalLink: str };
  }

  // If target is a full http(s):// URL, validate as safe HTTPS URL regardless of whether actionType is internal_url, template_link, global_link, customizer, or external_url
  if (lower.startsWith("https://") || lower.startsWith("http://")) {
    let parsed;
    try {
      parsed = new URL(str);
    } catch (_) {
      const msg = `URL "${str}" is not a valid absolute URL.`;
      return {
        valid: false,
        code: "INVALID_EXTERNAL_URL",
        message: msg,
        reason: msg
      };
    }
    const allowHttp = Boolean(options.allowHttpExternal || options.allowHttp);
    if (parsed.protocol !== "https:" && !(allowHttp && parsed.protocol === "http:")) {
      const msg = `External URL "${str}" must use HTTPS (received "${parsed.protocol}").`;
      return {
        valid: false,
        code: "UNSAFE_EXTERNAL_URL_PROTOCOL",
        message: msg,
        reason: msg
      };
    }
    const norm = parsed.toString();
    return { valid: true, normalizedTarget: norm, normalizedUrl: norm, isAbsoluteUrl: true };
  }

  if (actionType === "internal_url" || actionType === "customizer" || actionType === "global_link" || actionType === "template_link") {
    if (str.startsWith("#") && /^#[a-zA-Z0-9_-]{1,80}$/.test(str)) {
      return { valid: true, normalizedTarget: str, normalizedUrl: str };
    }
    const isStandardRoute = isValidInternalWishMagicRoute(str);
    const isSafeCustomAdminPath = Boolean(
      options.allowCustomAdminTarget &&
      str.startsWith("/") &&
      !str.startsWith("//") &&
      !str.includes("..") &&
      !/[\0<>'"`]/.test(str) &&
      !/\.(php|exe|sh|bat|cmd|dll|py|cgi|jsp|asp|aspx)(\?|$|#)/i.test(str)
    );
    if (!isStandardRoute && !isSafeCustomAdminPath) {
      const msg = `Internal URL "${str}" does not match an existing supported WishMagic route.`;
      return {
        valid: false,
        code: "INVALID_INTERNAL_ROUTE",
        message: msg,
        reason: msg
      };
    }
    return { valid: true, normalizedTarget: str, normalizedUrl: str };
  }

  if (actionType === "external_url") {
    if (str.startsWith("/") && !str.startsWith("//")) {
      const isStandardRoute = isValidInternalWishMagicRoute(str);
      const isSafeCustomAdminPath = Boolean(
        options.allowCustomAdminTarget &&
        !str.includes("..") &&
        !/[\0<>'"`]/.test(str) &&
        !/\.(php|exe|sh|bat|cmd|dll|py|cgi|jsp|asp|aspx)(\?|$|#)/i.test(str)
      );
      if (isStandardRoute || isSafeCustomAdminPath) {
        return { valid: true, normalizedTarget: str, normalizedUrl: str };
      }
    }
    let parsed;
    try {
      parsed = new URL(str);
    } catch (_) {
      const msg = `External URL "${str}" is not a valid absolute URL.`;
      return {
        valid: false,
        code: "INVALID_EXTERNAL_URL",
        message: msg,
        reason: msg
      };
    }
    const allowHttp = Boolean(options.allowHttpExternal || options.allowHttp);
    if (parsed.protocol !== "https:" && !(allowHttp && parsed.protocol === "http:")) {
      const msg = `External URL "${str}" must use HTTPS (received "${parsed.protocol}").`;
      return {
        valid: false,
        code: "UNSAFE_EXTERNAL_URL_PROTOCOL",
        message: msg,
        reason: msg
      };
    }
    const norm = parsed.toString();
    return { valid: true, normalizedTarget: norm, normalizedUrl: norm };
  }

  return { valid: true, normalizedTarget: str, normalizedUrl: str };
}

export const UTP_SUPPORTED_FIELD_TYPES = new Set([
  'text',
  'textarea',
  'date',
  'time',
  'datetime',
  'number',
  'email',
  'url',
  'phone',
  'color',
  'select',
  'multiselect',
  'toggle',
  'checkbox',
  'boolean',
  'repeater',
  'media_list',
  'range',
  'image',
  'image-multiple',
  'video',
  'video-multiple',
  'audio',
  'voice',
  'font',
  'icon'
]);

/**
 * Supported DOM / CSS / JS binding targets for fields
 */
export const UTP_SUPPORTED_BINDING_TARGETS = new Set([
  'text',
  'src',
  'background-image',
  'href',
  'style-property',
  'css-variable',
  'visibility',
  'toggle',
  'boolean',
  'collection',
  'media_list',
  'theme',
  'attribute',
  'html',
  'value'
]);

/**
 * Canonical relationship identifiers supported across the platform
 */
export const UTP_CANONICAL_RELATIONSHIPS = new Set([
  'friend',
  'best_friend',
  'boyfriend',
  'girlfriend',
  'husband',
  'wife',
  'partner',
  'fiance',
  'fiancee',
  'life_partner',
  'mother',
  'father',
  'parents',
  'sister',
  'brother',
  'sibling',
  'son',
  'daughter',
  'child',
  'grandparents',
  'colleague',
  'boss',
  'mentor',
  'teacher',
  'crush',
  'boy_best_friend',
  'girl_best_friend',
  'cousin',
  'grandfather',
  'grandmother',
  'uncle',
  'aunt',
  'nephew',
  'niece',
  'in_laws',
  'family',
  'kids',
  'relatives',
  'teachers',
  'elders',
  'colleagues',
  'universal',
  'custom',
  'any'
]);

/**
 * Canonical metadata catalog for relationships (IDs, slugs, display labels, icons, categories)
 */
export const UTP_RELATIONSHIP_CATALOG = Object.freeze({
  best_friend: { id: 'rel_best_friend', slug: 'best_friend', label: 'Best Friend', displayName: 'Best Friend Forever', icon: '🌟', category: 'friendship', sortOrder: 1 },
  brother: { id: 'rel_brother', slug: 'brother', label: 'Brother', displayName: 'Brother Edition', icon: '👊', category: 'family', sortOrder: 2 },
  sister: { id: 'rel_sister', slug: 'sister', label: 'Sister', displayName: 'Beloved Sister', icon: '🦋', category: 'family', sortOrder: 3 },
  boyfriend: { id: 'rel_boyfriend', slug: 'boyfriend', label: 'Boyfriend', displayName: 'Handsome Boyfriend', icon: '💙', category: 'romantic', sortOrder: 4 },
  girlfriend: { id: 'rel_girlfriend', slug: 'girlfriend', label: 'Girlfriend', displayName: 'Dearest Girlfriend', icon: '💖', category: 'romantic', sortOrder: 5 },
  mother: { id: 'rel_mother', slug: 'mother', label: 'Mother', displayName: 'Dearest Mother', icon: '🌸', category: 'family', sortOrder: 6 },
  father: { id: 'rel_father', slug: 'father', label: 'Father', displayName: 'Loving Father', icon: '👔', category: 'family', sortOrder: 7 },
  parents: { id: 'rel_parents', slug: 'parents', label: 'Parents', displayName: 'Mom & Dad Together', icon: '🌺', category: 'family', sortOrder: 8 },
  wife: { id: 'rel_wife', slug: 'wife', label: 'Wife', displayName: 'Beloved Wife', icon: '💍', category: 'romantic', sortOrder: 9 },
  husband: { id: 'rel_husband', slug: 'husband', label: 'Husband', displayName: 'Loving Husband', icon: '👑', category: 'romantic', sortOrder: 10 },
  crush: { id: 'rel_crush', slug: 'crush', label: 'Crush', displayName: 'Secret Crush', icon: '✨', category: 'romantic', sortOrder: 11 },
  friend: { id: 'rel_friend', slug: 'friend', label: 'Friend', displayName: 'Dear Friend', icon: '🎈', category: 'friendship', sortOrder: 12 },
  partner: { id: 'rel_partner', slug: 'partner', label: 'Partner', displayName: 'Beloved Partner', icon: '💫', category: 'romantic', sortOrder: 13 },
  fiance: { id: 'rel_fiance', slug: 'fiance', label: 'Fiancé', displayName: 'Beloved Fiancé', icon: '💎', category: 'romantic', sortOrder: 14 },
  fiancee: { id: 'rel_fiancee', slug: 'fiancee', label: 'Fiancée', displayName: 'Beloved Fiancée', icon: '🌸', category: 'romantic', sortOrder: 14 },
  life_partner: { id: 'rel_life_partner', slug: 'life_partner', label: 'Life Partner', displayName: 'Beloved Life Partner', icon: '🪐', category: 'romantic', sortOrder: 14 },
  sibling: { id: 'rel_sibling', slug: 'sibling', label: 'Sibling', displayName: 'Sibling Edition', icon: '🤝', category: 'family', sortOrder: 15 },
  son: { id: 'rel_son', slug: 'son', label: 'Son', displayName: 'Dearest Son', icon: '🚀', category: 'family', sortOrder: 16 },
  daughter: { id: 'rel_daughter', slug: 'daughter', label: 'Daughter', displayName: 'Dearest Daughter', icon: '🌷', category: 'family', sortOrder: 17 },
  grandparents: { id: 'rel_grandparents', slug: 'grandparents', label: 'Grandparents', displayName: 'Beloved Grandparents', icon: '🕊️', category: 'family', sortOrder: 18 },
  family: { id: 'rel_family', slug: 'family', label: 'Family', displayName: 'Family Edition', icon: '🏡', category: 'family', sortOrder: 19 },
  colleague: { id: 'rel_colleague', slug: 'colleague', label: 'Colleague', displayName: 'Valued Colleague', icon: '🎉', category: 'professional', sortOrder: 20 },
  teacher: { id: 'rel_teacher', slug: 'teacher', label: 'Teacher', displayName: 'Inspiring Teacher', icon: '📚', category: 'professional', sortOrder: 21 },
  mentor: { id: 'rel_mentor', slug: 'mentor', label: 'Mentor', displayName: 'Trusted Mentor', icon: '🧭', category: 'professional', sortOrder: 22 },
  kids: { id: 'rel_kids', slug: 'kids', label: 'Kids', displayName: 'Kids Celebration', icon: '🎈', category: 'family', sortOrder: 23 },
  boy_best_friend: { id: 'rel_boy_best_friend', slug: 'boy_best_friend', label: 'Boy Best Friend', displayName: 'Boy Best Friend', icon: '⚡', category: 'friendship', sortOrder: 24 },
  girl_best_friend: { id: 'rel_girl_best_friend', slug: 'girl_best_friend', label: 'Girl Best Friend', displayName: 'Girl Best Friend', icon: '🌸', category: 'friendship', sortOrder: 25 },
  cousin: { id: 'rel_cousin', slug: 'cousin', label: 'Cousin', displayName: 'Beloved Cousin', icon: '🎉', category: 'family', sortOrder: 26 },
  universal: { id: 'rel_universal', slug: 'universal', label: 'Everyone', displayName: 'Universal Edition', icon: '✨', category: 'celebration', sortOrder: 27 },
  relatives: { id: 'rel_relatives', slug: 'relatives', label: 'Relatives', displayName: 'Extended Family & Relatives', icon: '🪷', category: 'family', sortOrder: 28 },
  teachers: { id: 'rel_teachers', slug: 'teachers', label: 'Teachers', displayName: 'Respected Teachers & Mentors', icon: '📖', category: 'professional', sortOrder: 29 },
  elders: { id: 'rel_elders', slug: 'elders', label: 'Elders', displayName: 'Respected Elders', icon: '🙏', category: 'family', sortOrder: 30 },
  colleagues: { id: 'rel_colleagues', slug: 'colleagues', label: 'Colleagues', displayName: 'Team & Colleagues', icon: '🏛️', category: 'professional', sortOrder: 31 }
});

export const DEFAULT_PLATFORM_BRANDING_FOOTER = Object.freeze({
  enabled: true,
  websiteName: 'WishMagic',
  brandIcon: '✨',
  badgeText: '✨ Official WishMagic Celebration Experience',
  tagline: 'Crafted with Love on WishMagic — Interactive 3D Celebration Studio',
  detailsText: 'Create personalized 3D wishes, polaroid memories & festival greetings for your loved ones in 60 seconds.',
  primaryBtnLabel: 'Create Your Own Wish ✨',
  primaryBtnLink: 'template.customize',
  secondaryBtnLabel: 'Explore All Templates ➔',
  secondaryBtnLink: 'global.explore',
  copyrightText: '© 2026 WishMagic • All Rights Reserved',
  showPrimaryBtn: true,
  showSecondaryBtn: true
});

/**
 * Normalizes any relationship string or object into canonical relationship metadata
 */
export function normalizeRelationshipIdentifier(relInput, customLabel = null) {
  if (!relInput) return null;
  let rawSlug = '';
  let explicitLabel = customLabel;
  let explicitIcon = null;

  if (typeof relInput === 'object') {
    rawSlug = String(relInput.slug || relInput.relationship || relInput.relationshipId || relInput.id || relInput.name || '').trim();
    explicitLabel = explicitLabel || relInput.label || relInput.relationshipLabel || relInput.name || relInput.displayName || null;
    explicitIcon = relInput.icon || null;
  } else {
    rawSlug = String(relInput).trim();
  }

  if (!rawSlug) return null;

  let cleanSlug = rawSlug
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^rel_/, '')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '');

  const synonymMap = {
    bestfriend: 'best_friend',
    bestie: 'best_friend',
    bff: 'best_friend',
    bro: 'brother',
    sis: 'sister',
    bf: 'boyfriend',
    gf: 'girlfriend',
    mom: 'mother',
    mum: 'mother',
    dad: 'father',
    papa: 'father'
  };
  if (synonymMap[cleanSlug]) {
    cleanSlug = synonymMap[cleanSlug];
  }

  if (!cleanSlug) return null;

  const catalogEntry = UTP_RELATIONSHIP_CATALOG[cleanSlug];
  const fallbackLabel = cleanSlug
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const resolvedLabel = (explicitLabel && String(explicitLabel).trim())
    ? String(explicitLabel).trim()
    : (catalogEntry ? catalogEntry.label : fallbackLabel);

  return {
    id: catalogEntry ? catalogEntry.id : `rel_${cleanSlug}`,
    slug: cleanSlug,
    label: resolvedLabel,
    name: resolvedLabel,
    displayName: catalogEntry ? catalogEntry.displayName : `${resolvedLabel} Edition`,
    icon: explicitIcon || (catalogEntry ? catalogEntry.icon : '✨'),
    category: catalogEntry ? catalogEntry.category : 'celebration',
    sortOrder: catalogEntry ? catalogEntry.sortOrder : 99,
    isCanonical: UTP_CANONICAL_RELATIONSHIPS.has(cleanSlug)
  };
}

/**
 * Canonical template categories
 */
export const UTP_CATEGORIES = new Set([
  'birthday',
  'anniversary',
  'love',
  'romantic',
  'friendship',
  'thank-you',
  'congratulations',
  'festival',
  'festivals',
  'apology',
  'proposal',
  'wedding',
  'graduation',
  'new-baby',
  'farewell',
  'celebration',
  'general'
]);

/**
 * Canonical template pricing tiers
 */
export const UTP_TIERS = new Set(['free', 'vip', 'premium']);

/**
 * Capability Registry: maps capability keys to customizer controls and runtime requirements
 */
export const UTP_CAPABILITY_REGISTRY = Object.freeze({
  photos: {
    key: 'photos',
    label: 'Single or Cover Photo',
    customizerGroup: 'media',
    requiresFieldTypes: ['image', 'image-multiple']
  },
  multiplePhotos: {
    key: 'multiplePhotos',
    label: 'Multiple Photo Slots',
    customizerGroup: 'media',
    requiresFieldTypes: ['image', 'image-multiple']
  },
  gallery: {
    key: 'gallery',
    label: 'Photo Gallery Layout',
    customizerGroup: 'media',
    requiresFieldTypes: ['image', 'image-multiple']
  },
  music: {
    key: 'music',
    label: 'Background Music Track',
    customizerGroup: 'audio',
    requiresFieldTypes: ['audio']
  },
  audio: {
    key: 'audio',
    label: 'Background Audio',
    customizerGroup: 'audio',
    requiresFieldTypes: ['audio']
  },
  voice: {
    key: 'voice',
    label: 'Spoken Voice Note',
    customizerGroup: 'audio',
    requiresFieldTypes: ['voice']
  },
  voiceNote: {
    key: 'voiceNote',
    label: 'Spoken Voice Note',
    customizerGroup: 'audio',
    requiresFieldTypes: ['voice']
  },
  video: {
    key: 'video',
    label: 'Video Clip',
    customizerGroup: 'media',
    requiresFieldTypes: ['video', 'video-multiple']
  },
  multipleVideos: {
    key: 'multipleVideos',
    label: 'Multiple Video Clips',
    customizerGroup: 'media',
    requiresFieldTypes: ['video-multiple', 'video']
  },
  countdown: {
    key: 'countdown',
    label: 'Live Event Countdown',
    customizerGroup: 'sections',
    requiresFieldTypes: ['date', 'datetime']
  },
  timeline: {
    key: 'timeline',
    label: 'Memory Timeline',
    customizerGroup: 'sections',
    requiresFieldTypes: []
  },
  themes: {
    key: 'themes',
    label: 'Theme & Color Palette Support',
    customizerGroup: 'style',
    requiresFieldTypes: ['color']
  },
  themeSupport: {
    key: 'themeSupport',
    label: 'Theme Support',
    customizerGroup: 'style',
    requiresFieldTypes: []
  },
  animations: {
    key: 'animations',
    label: 'Interactive Animations',
    customizerGroup: 'style',
    requiresFieldTypes: []
  },
  animationSupport: {
    key: 'animationSupport',
    label: 'Animation Support',
    customizerGroup: 'style',
    requiresFieldTypes: []
  },
  particles: {
    key: 'particles',
    label: 'Ambient Particles & Confetti',
    customizerGroup: 'effects',
    requiresFieldTypes: []
  },
  sections: {
    key: 'sections',
    label: 'Toggleable Template Sections',
    customizerGroup: 'sections',
    requiresFieldTypes: []
  },
  subsections: {
    key: 'subsections',
    label: 'Nested Subsection Visibility Controls',
    customizerGroup: 'sections',
    requiresFieldTypes: []
  },
  actions: {
    key: 'actions',
    label: 'Configurable Buttons & Action Links',
    customizerGroup: 'actions',
    requiresFieldTypes: []
  },
  secretMessage: {
    key: 'secretMessage',
    label: 'Locked / Secret Message Reveal',
    customizerGroup: 'sections',
    requiresFieldTypes: []
  },
  openWhen: {
    key: 'openWhen',
    label: 'Open When Envelopes',
    customizerGroup: 'sections',
    requiresFieldTypes: []
  },
  finalSurprise: {
    key: 'finalSurprise',
    label: 'Grand Finale Celebration',
    customizerGroup: 'sections',
    requiresFieldTypes: []
  },
  variants: {
    key: 'variants',
    label: 'Multi-Relationship Template Variants',
    customizerGroup: 'personal',
    requiresFieldTypes: []
  },
  festivalMetadata: {
    key: 'festivalMetadata',
    label: 'Festival Campaign Compatibility Metadata (UTP v1.4.0)',
    customizerGroup: 'personal',
    requiresFieldTypes: []
  },
  brandingFooter: {
    key: 'brandingFooter',
    label: 'Platform Branding Footer Bar (UTP v1.4.0)',
    customizerGroup: 'sections',
    requiresFieldTypes: []
  }
});

/**
 * Checks if a version string is valid SemVer (X.Y.Z)
 */
export function isValidSemver(version) {
  if (!version || typeof version !== 'string') return false;
  return /^[vV]?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version.trim());
}

/**
 * Checks identifier slug format (lowercase letters, numbers, underscores, hyphens)
 */
export function isValidIdentifier(id) {
  if (!id || typeof id !== 'string') return false;
  return /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(id.trim());
}


/**
 * UTP v1.4.0 Canonical Festival & Occasion Tags
 */
export const UTP_CANONICAL_FESTIVAL_TAGS = new Set([
  'diwali',
  'deepavali',
  'holi',
  'raksha-bandhan',
  'rakhi',
  'bhai-dooj',
  'karwa-chauth',
  'navratri',
  'dussehra',
  'ganesh-chaturthi',
  'eid-ul-fitr',
  'eid-ul-adha',
  'eid',
  'janmashtami',
  'makar-sankranti',
  'pongal',
  'onam',
  'baisakhi',
  'durga-puja',
  'mahashivratri',
  'ram-navami',
  'chhath-puja',
  'christmas',
  'new-year',
  'valentines-day',
  'friendship-day',
  'mothers-day',
  'fathers-day',
  'independence-day',
  'republic-day',
  'easter',
  'thanksgiving',
  'festival',
  'celebration'
]);

/**
 * UTP v1.4.0 Forbidden Template-Level Scheduling Keys:
 * Templates MUST NEVER declare an authoritative festival date, publication window,
 * or bypass flag that attempts to override the platform Festival Scheduler.
 */
export const UTP_FORBIDDEN_FESTIVAL_SCHEDULE_KEYS = new Set([
  'authoritativeFestivalDate',
  'effectiveFestivalDate',
  'fixedFestivalDate',
  'hardcodedFestivalDate',
  'festivalDate',
  'authoritativeDate',
  'forceActive',
  'alwaysActive',
  'permanentlyActive',
  'bypassSchedule',
  'bypassCampaignWindow',
  'overrideServerSchedule',
  'ignoreExpiry',
  'disableExpiry',
  'publicationStartDate',
  'publicationEndDate',
  'windowStartDate',
  'windowEndDate',
  'clientScheduleEnforcement',
  'startDate',
  'endDate',
  'publishAt',
  'unpublishAt',
  'expireAt',
  'activeFrom',
  'activeUntil',
  'scheduleStart',
  'scheduleEnd',
  'cron',
  'forcePublish',
  'autoPublishDate',
  'windowStart',
  'windowEnd',
  'leadDays',
  'graceDays'
]);

export const UTP_SUPPORTED_CAMPAIGN_COMPATIBILITY_MODES = new Set([
  'festival_campaign',
  'evergreen_and_festival',
  'festival_only',
  'any'
]);

/**
 * Validates and normalizes UTP v1.4.0 optional `festivalMetadata` block.
 */
export function validateAndNormalizeFestivalMetadata(rawFestivalMeta, rootManifest = {}) {
  const issues = [];

  // Check root and template object for forbidden schedule-override keys even if festivalMetadata is omitted
  for (const container of [rootManifest, rootManifest?.template]) {
    if (!container || typeof container !== 'object') continue;
    for (const key of Object.keys(container)) {
      if (UTP_FORBIDDEN_FESTIVAL_SCHEDULE_KEYS.has(key) && key !== 'festivalDate') {
        issues.push({
          code: 'TEMPLATE_CANNOT_OVERRIDE_SERVER_SCHEDULE',
          severity: 'error',
          field: key,
          message: `Template manifest property "${key}" is forbidden in UTP v1.4.0. Templates must not declare authoritative festival dates or bypass server-controlled campaign windows.`,
          blocking: true
        });
      }
    }
  }

  if (rawFestivalMeta === undefined || rawFestivalMeta === null) {
    return {
      valid: issues.length === 0,
      issues,
      normalized: null
    };
  }

  if (typeof rawFestivalMeta !== 'object' || Array.isArray(rawFestivalMeta)) {
    issues.push({
      code: 'INVALID_FESTIVAL_METADATA_OBJECT',
      severity: 'error',
      message: '"festivalMetadata" in wishmagic.json must be a JSON object.',
      blocking: true
    });
    return { valid: false, issues, normalized: null };
  }

  for (const key of Object.keys(rawFestivalMeta)) {
    if (UTP_FORBIDDEN_FESTIVAL_SCHEDULE_KEYS.has(key)) {
      issues.push({
        code: 'TEMPLATE_CANNOT_OVERRIDE_SERVER_SCHEDULE',
        severity: 'error',
        field: `festivalMetadata.${key}`,
        message: `"festivalMetadata.${key}" is forbidden in UTP v1.4.0. Authoritative festival dates and publication windows are controlled exclusively by the WishMagic Festival Scheduler.`,
        blocking: true
      });
    }
  }

  const rawTags = rawFestivalMeta.festivalTags !== undefined
    ? rawFestivalMeta.festivalTags
    : (rawFestivalMeta.occasionTags !== undefined ? rawFestivalMeta.occasionTags : rawFestivalMeta.festivals);

  const normalizedTags = [];
  if (rawTags !== undefined) {
    if (!Array.isArray(rawTags)) {
      issues.push({
        code: 'INVALID_FESTIVAL_TAGS',
        severity: 'error',
        message: '"festivalMetadata.festivalTags" must be an array of festival/occasion slug strings.',
        blocking: true
      });
    } else {
      for (const t of rawTags) {
        if (typeof t !== 'string' || !t.trim() || !/^[a-zA-Z0-9_-]{1,64}$/.test(t.trim())) {
          issues.push({
            code: 'INVALID_FESTIVAL_TAG_ENTRY',
            severity: 'error',
            message: `Invalid festival tag "${t}" in festivalMetadata.festivalTags. Use alphanumeric slug strings.`,
            blocking: true
          });
        } else {
          normalizedTags.push(t.trim().toLowerCase());
        }
      }
    }
  }

  const rawRels = rawFestivalMeta.suitableRelationships !== undefined
    ? rawFestivalMeta.suitableRelationships
    : rawFestivalMeta.supportedRelationships;
  const normalizedRels = [];
  if (rawRels !== undefined) {
    if (!Array.isArray(rawRels)) {
      issues.push({
        code: 'INVALID_FESTIVAL_RELATIONSHIPS',
        severity: 'error',
        message: '"festivalMetadata.suitableRelationships" must be an array of relationship identifiers.',
        blocking: true
      });
    } else {
      for (const r of rawRels) {
        const normRel = normalizeRelationshipIdentifier(r);
        if (!normRel) {
          issues.push({
            code: 'INVALID_FESTIVAL_RELATIONSHIP_ENTRY',
            severity: 'error',
            message: `Invalid relationship identifier "${r}" in festivalMetadata.suitableRelationships.`,
            blocking: true
          });
        } else {
          normalizedRels.push(normRel.slug);
        }
      }
    }
  }

  let campaignMode = 'evergreen_and_festival';
  let campaignCompatibilityObj = null;
  if (rawFestivalMeta.campaignCompatibility !== undefined) {
    if (typeof rawFestivalMeta.campaignCompatibility === 'boolean') {
      campaignMode = rawFestivalMeta.campaignCompatibility ? 'evergreen_and_festival' : 'any';
    } else if (typeof rawFestivalMeta.campaignCompatibility === 'string') {
      const m = rawFestivalMeta.campaignCompatibility.trim().toLowerCase();
      if (!UTP_SUPPORTED_CAMPAIGN_COMPATIBILITY_MODES.has(m)) {
        issues.push({
          code: 'INVALID_CAMPAIGN_COMPATIBILITY_MODE',
          severity: 'error',
          message: `Invalid festivalMetadata.campaignCompatibility "${rawFestivalMeta.campaignCompatibility}". Allowed: festival_campaign, evergreen_and_festival, festival_only, any.`,
          blocking: true
        });
      } else {
        campaignMode = m;
      }
    } else if (
      rawFestivalMeta.campaignCompatibility &&
      typeof rawFestivalMeta.campaignCompatibility === 'object' &&
      !Array.isArray(rawFestivalMeta.campaignCompatibility)
    ) {
      campaignCompatibilityObj = {
        spotlightEligible: Boolean(rawFestivalMeta.campaignCompatibility.spotlightEligible !== false),
        bannerEligible: Boolean(rawFestivalMeta.campaignCompatibility.bannerEligible !== false),
        festivalHubEligible: Boolean(rawFestivalMeta.campaignCompatibility.festivalHubEligible),
        autoFeatureInFestival: Boolean(rawFestivalMeta.campaignCompatibility.autoFeatureInFestival),
        priorityWeight: Number(rawFestivalMeta.campaignCompatibility.priorityWeight || 80)
      };
      campaignMode = campaignCompatibilityObj.festivalHubEligible ? 'evergreen_and_festival' : 'any';
    } else {
      issues.push({
        code: 'INVALID_CAMPAIGN_COMPATIBILITY_MODE',
        severity: 'error',
        message: '"festivalMetadata.campaignCompatibility" must be a boolean, compatibility object, or valid compatibility mode string.',
        blocking: true
      });
    }
  }

  const rawPref = rawFestivalMeta.suggestedPublicationPreferences || rawFestivalMeta.suggestedWindowPreference;
  let suggestedPreferences = null;
  if (rawPref !== undefined && rawPref !== null) {
    if (typeof rawPref !== 'object' || Array.isArray(rawPref)) {
      issues.push({
        code: 'INVALID_FESTIVAL_SUGGESTED_PREFERENCES',
        severity: 'error',
        message: '"festivalMetadata.suggestedPublicationPreferences" must be a JSON object.',
        blocking: true
      });
    } else {
      if (rawPref.authoritative === true || rawPref.enforceOnClient === true || rawPref.overrideServerWindow === true) {
        issues.push({
          code: 'TEMPLATE_CANNOT_OVERRIDE_SERVER_SCHEDULE',
          severity: 'error',
          message: '"festivalMetadata.suggestedPublicationPreferences" is strictly advisory and cannot set authoritative=true or enforceOnClient=true.',
          blocking: true
        });
      }
      for (const k of Object.keys(rawPref)) {
        if (UTP_FORBIDDEN_FESTIVAL_SCHEDULE_KEYS.has(k)) {
          issues.push({
            code: 'TEMPLATE_CANNOT_OVERRIDE_SERVER_SCHEDULE',
            severity: 'error',
            message: `"festivalMetadata.suggestedPublicationPreferences.${k}" is forbidden. Templates must not hardcode authoritative festival dates or windows.`,
            blocking: true
          });
        }
      }
      const sBefore = rawPref.suggestedDaysBefore !== undefined ? Number(rawPref.suggestedDaysBefore) : 15;
      const sAfter = rawPref.suggestedDaysAfter !== undefined ? Number(rawPref.suggestedDaysAfter) : 3;
      if (!Number.isInteger(sBefore) || sBefore < 0 || sBefore > 180 || !Number.isInteger(sAfter) || sAfter < 0 || sAfter > 60) {
        issues.push({
          code: 'INVALID_FESTIVAL_SUGGESTED_WINDOW_DAYS',
          severity: 'error',
          message: 'Suggested publication window days must be valid integers (suggestedDaysBefore: 0-180, suggestedDaysAfter: 0-60).',
          blocking: true
        });
      }
      suggestedPreferences = {
        suggestedDaysBefore: sBefore,
        suggestedDaysAfter: sAfter,
        advisoryOnly: true
      };
    }
  }

  const displayBadge = rawFestivalMeta.displayBadge !== undefined
    ? (typeof rawFestivalMeta.displayBadge === 'object' && rawFestivalMeta.displayBadge !== null
        ? String(rawFestivalMeta.displayBadge.text || rawFestivalMeta.displayBadge.label || '').trim().slice(0, 80)
        : String(rawFestivalMeta.displayBadge || '').trim().slice(0, 80))
    : (rawFestivalMeta.suggestedBadge !== undefined ? String(rawFestivalMeta.suggestedBadge || '').trim().slice(0, 80) : '');

  return {
    valid: !issues.some(i => i.severity === 'error'),
    issues,
    normalized: {
      festivalTags: Array.from(new Set(normalizedTags)),
      suitableRelationships: Array.from(new Set(normalizedRels)),
      campaignCompatibility: campaignMode,
      displayBadge,
      suggestedPublicationPreferences: suggestedPreferences,
      scheduleAuthority: 'platform_server'
    }
  };
}
