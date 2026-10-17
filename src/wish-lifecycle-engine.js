/**
 * WishMagic Wish Lifecycle & Public Link Engine
 * Part 8: Complete Wish Lifecycle, Unique Public Links, Asia/Kolkata Expiry, Create Again & My Wishes
 * 
 * Responsibilities:
 * 1. Consistent Unicode Slug Normalization & Validation (slugifyText, isValidSlug, isReservedSlug)
 * 2. Readable & Random Unique Slug Generation with Bounded DB Collision Retries
 * 3. Canonical Public URL Resolution with Trusted Origin Protection
 * 4. Deterministic Asia/Kolkata (IST = UTC+05:30) Expiry & Boundary State Machine
 * 5. Server-Side Creation & Field Validation (Template, Version, Media Extension Filtering)
 * 6. Isolated Create Again Cloning without Source Wish Mutation
 * 7. Idempotency Support
 */

export const IST_OFFSET_MS = 330 * 60 * 1000; // 5 hours 30 minutes in milliseconds
export const DEFAULT_APP_BASE_URL = 'https://wishmagic.live';

export const RESERVED_SLUGS = new Set([
  'admin', 'login', 'signup', 'register', 'dashboard', 'settings',
  'api', 'auth', 'templates', 'preview', 'create', 'edit',
  'my-wishes', 'favorites', 'pricing', 'about', 'contact', 'help',
  'privacy', 'terms', 'robots', 'sitemap', 'w', 'wish',
  'marketplace', 'checkout', 'premium', 'account', 'expired',
  'media', 'css', 'js', 'assets', 'fonts', 'static', 'health',
  'config', 'null', 'undefined', 'public', 'share', 'status',
  'test', 'feed', 'rss', 'search', 'draft', 'published',
  'support', 'tickets', 'legal', 'compliance', 'analytics'
]);

export const DANGEROUS_MEDIA_EXTENSIONS = new Set([
  '.exe', '.js', '.mjs', '.cjs', '.sh', '.bash', '.php', '.py',
  '.rb', '.pl', '.bat', '.cmd', '.vbs', '.svg', '.html', '.htm',
  '.xhtml', '.xml', '.jar', '.apk', '.msi', '.bin', '.cgi'
]);

/**
 * Normalizes any string into a clean, URL-safe slug
 * Handles Unicode NFD normalization, diacritics removal, quotes, and punctuation
 */
export function slugifyText(text, maxLength = 80) {
  if (!text) return '';
  const clean = String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics / accents
    .replace(/['’]s\b/gi, 's')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // remove non-alphanumeric except spaces and hyphens
    .replace(/[\s_-]+/g, '-')     // collapse whitespace and underscores to hyphen
    .replace(/-+/g, '-')          // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '');     // trim leading and trailing hyphens

  if (clean.length <= maxLength) return clean;
  // Truncate at word boundary if possible
  const truncated = clean.slice(0, maxLength);
  const lastHyphen = truncated.lastIndexOf('-');
  if (lastHyphen > Math.floor(maxLength * 0.6)) {
    return truncated.slice(0, lastHyphen).replace(/-+$/, '');
  }
  return truncated.replace(/-+$/, '');
}

/**
 * Checks if a slug is reserved for system routes
 */
export function isReservedSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  const s = slug.toLowerCase().trim();
  return RESERVED_SLUGS.has(s);
}

/**
 * Validates whether a normalized slug meets URL safety constraints
 */
export function isValidSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  const s = slug.toLowerCase().trim();
  if (s.length < 3 || s.length > 80) return false;
  if (!/^[a-z0-9](?:[a-z0-9]|-(?!-)){1,78}[a-z0-9]$/.test(s)) return false;
  if (isReservedSlug(s)) return false;
  return true;
}

/**
 * Generates a candidate readable slug based on recipient name, occasion, and sender
 * e.g. "Radha" + Birthday -> "happy-birthday-radha"
 */
export function generateReadableSlugCandidate(customData = {}, template = null) {
  const rawRecipient = customData.recipient_name || customData.recipientName || '';
  const rawSender = customData.sender_name || customData.senderName || '';
  const rawOccasion = (template && (template.category || template.name)) || customData.occasion || 'celebration';

  const cleanRecipient = slugifyText(rawRecipient, 30) || 'friend';
  const cleanSender = slugifyText(rawSender, 25);
  const cleanOccasion = slugifyText(rawOccasion, 20) || 'celebration';

  let base = '';
  if (cleanOccasion.includes('birthday')) {
    base = `happy-birthday-${cleanRecipient}`;
  } else if (cleanOccasion.includes('anniversary')) {
    base = `happy-anniversary-${cleanRecipient}`;
  } else if (cleanSender && cleanRecipient) {
    base = `${cleanSender}-to-${cleanRecipient}`;
  } else {
    base = `${cleanRecipient}-${cleanOccasion}`;
  }

  // Ensure base slug doesn't collide with reserved names
  if (isReservedSlug(base)) {
    base = `celebration-${base}`;
  }

  return slugifyText(base, 45);
}

/**
 * Generates cryptographically secure random alphanumeric string
 */
export function generateRandomString(length = 6, allowedChars = 'abcdefghijklmnopqrstuvwxyz0123456789') {
  const chars = allowedChars || 'abcdefghijklmnopqrstuvwxyz0123456789';
  const charsLen = chars.length;
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let res = '';
  for (let i = 0; i < length; i++) {
    res += chars[bytes[i] % charsLen];
  }
  return res;
}

export const activeSlugReservations = new Set();

export function releaseSlugReservation(slug) {
  if (slug) {
    activeSlugReservations.delete(String(slug).toLowerCase());
  }
}

/**
 * Generates a collision-resistant unique slug with database existence checks
 */
export async function generateUniqueSlugWithRetry(db, options = {}) {
  const {
    desiredSlug = null,
    customData = {},
    template = null,
    linkType = 'readable',
    prefix = 'wish-',
    maxRetries = 10
  } = options;

  async function isSlugAvailable(candidate) {
    const norm = String(candidate).toLowerCase();
    if (activeSlugReservations.has(norm)) return false;
    // Synchronously claim lock immediately before any await to prevent concurrent race conditions
    activeSlugReservations.add(norm);
    if (typeof setTimeout === 'function') {
      setTimeout(() => activeSlugReservations.delete(norm), 15000);
    }
    if (!db || typeof db.prepare !== 'function') return true;
    try {
      const row = await db.prepare('SELECT id, event_date, status, custom_data FROM wishes WHERE slug = ? LIMIT 1').bind(norm).first();
      if (row) {
        if (row.event_date || row.status === 'expired' || row.status === 'deleted') {
          let cd = {};
          try { cd = typeof row.custom_data === 'string' ? JSON.parse(row.custom_data) : (row.custom_data || {}); } catch (_) {}
          const lc = computeWishLifecycle({ eventDate: row.event_date, customData: cd, status: row.status });
          if (lc === 'expired' || row.status === 'expired' || row.status === 'deleted') {
            await db.prepare('UPDATE wishes SET slug = ?, status = ? WHERE id = ?')
              .bind(`${norm}__expired__${row.id}`, 'expired', row.id).run().catch(() => {});
            return true;
          }
        }
        return false;
      }
      return true;
    } catch (_) {
      return true;
    }
  }

  function claimSlug(candidate) {
    const norm = String(candidate).toLowerCase();
    activeSlugReservations.add(norm);
    if (typeof setTimeout === 'function') {
      setTimeout(() => activeSlugReservations.delete(norm), 15000);
    }
    return norm;
  }

  // 1. If explicit desiredSlug is provided by user (personalized option)
  if (desiredSlug) {
    const normalized = slugifyText(desiredSlug, 80);
    if (!isValidSlug(normalized)) {
      throw new Error(isReservedSlug(normalized) ? 'SLUG_RESERVED' : 'INVALID_SLUG');
    }

    if (activeSlugReservations.has(normalized)) {
      throw new Error('SLUG_TAKEN');
    }

    if (db && typeof db.prepare !== 'function') {
      // no-op
    } else if (db && typeof db.prepare === 'function') {
      const existing = await db.prepare('SELECT id, event_date, status, custom_data FROM wishes WHERE slug = ? LIMIT 1').bind(normalized).first();
      if (existing) {
        let isExpiredExisting = existing.status === 'expired' || existing.status === 'deleted';
        if (!isExpiredExisting && existing.event_date) {
          let cd = {};
          try { cd = typeof existing.custom_data === 'string' ? JSON.parse(existing.custom_data) : (existing.custom_data || {}); } catch (_) {}
          isExpiredExisting = computeWishLifecycle({ eventDate: existing.event_date, customData: cd, status: existing.status }) === 'expired';
        }
        if (isExpiredExisting) {
          await db.prepare('UPDATE wishes SET slug = ?, status = ? WHERE id = ?')
            .bind(`${normalized}__expired__${existing.id}`, 'expired', existing.id).run().catch(() => {});
        } else {
          throw new Error('SLUG_TAKEN');
        }
      }
    }
    return claimSlug(normalized);
  }

  // 2. Option: Random Slug
  if (linkType === 'random') {
    const cleanPrefix = (prefix || 'wish-').toLowerCase().trim();
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const candidate = `${cleanPrefix}${generateRandomString(6)}`.toLowerCase();
      if (!isValidSlug(candidate) || isReservedSlug(candidate)) continue;

      if (await isSlugAvailable(candidate)) {
        return claimSlug(candidate);
      }
    }
    // High-entropy fallback
    const fallback = `${cleanPrefix}${generateRandomString(6)}-${Date.now().toString(36).slice(-4)}`;
    return claimSlug(fallback);
  }

  // 3. Option: Readable Slug (e.g. happy-birthday-radha)
  const baseCandidate = generateReadableSlugCandidate(customData, template);

  if (isValidSlug(baseCandidate) && !isReservedSlug(baseCandidate) && (await isSlugAvailable(baseCandidate))) {
    return claimSlug(baseCandidate);
  }

  // Collision detected: generate suffix with bounded retry
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const suffix = generateRandomString(4);
    const candidate = `${baseCandidate}-${suffix}`;
    if (!isValidSlug(candidate) || isReservedSlug(candidate)) continue;

    if (await isSlugAvailable(candidate)) {
      return claimSlug(candidate);
    }
  }

  const entropyFallback = `${baseCandidate}-${generateRandomString(4)}-${Date.now().toString(36).slice(-4)}`;
  return claimSlug(entropyFallback);
}

/**
 * Computes exact boundaries for a date-only (YYYY-MM-DD) string in Asia/Kolkata (IST = UTC+05:30)
 * Deterministic without server-timezone shift
 */
export function getISTDateBoundaries(eventDateStr) {
  let dateStr = String(eventDateStr || '').trim();
  if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];

  const parts = dateStr.split('-').map(Number);
  const isInvalid = parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2]) ||
                    parts[0] < 2000 || parts[0] > 2100 || parts[1] < 1 || parts[1] > 12 || parts[2] < 1 || parts[2] > 31;

  if (isInvalid) {
    // Graceful fallback: today in IST
    const nowIst = new Date(Date.now() + IST_OFFSET_MS);
    const y = nowIst.getUTCFullYear();
    const m = nowIst.getUTCMonth();
    const d = nowIst.getUTCDate();
    const startOfDayUtcMs = Date.UTC(y, m, d, 0, 0, 0, 0) - IST_OFFSET_MS;
    const endOfDayUtcMs = startOfDayUtcMs + (24 * 60 * 60 * 1000) - 1;
    return {
      isValid: false,
      dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      startOfDayUtcMs,
      endOfDayUtcMs,
      expiryDateStr: computeExpiryDate(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    };
  }

  const [year, month, day] = parts;
  // Active window starts 2 days before event_date (00:00:00.000 IST)
  const startOfDayUtcMs = Date.UTC(year, month - 1, day - 2, 0, 0, 0, 0) - IST_OFFSET_MS;
  // Active window ends 2 days after event_date (23:59:59.999 IST on day + 2)
  const endOfDayUtcMs = Date.UTC(year, month - 1, day + 3, 0, 0, 0, 0) - IST_OFFSET_MS - 1;

  return {
    isValid: true,
    dateStr,
    startOfDayUtcMs,
    endOfDayUtcMs,
    expiryDateStr: computeExpiryDate(dateStr)
  };
}

/**
 * Computes the date string (YYYY-MM-DD) when the wish expires (after 2 days past the selected occasion date in IST)
 * Handles leap years, month boundaries, and year boundaries correctly
 */
export function computeExpiryDate(eventDateStr) {
  let clean = String(eventDateStr || '').trim();
  if (clean.includes('T')) clean = clean.split('T')[0];

  const parts = clean.split('-').map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return clean;
  }

  const [year, month, day] = parts;
  // Day + 3 at 00:00:00 IST (expires after 2 full days following event_date)
  const nextDayUtcMs = Date.UTC(year, month - 1, day + 3, 0, 0, 0, 0) - IST_OFFSET_MS;
  const nextDayIst = new Date(nextDayUtcMs + IST_OFFSET_MS);

  const expY = nextDayIst.getUTCFullYear();
  const expM = String(nextDayIst.getUTCMonth() + 1).padStart(2, '0');
  const expD = String(nextDayIst.getUTCDate()).padStart(2, '0');

  return `${expY}-${expM}-${expD}`;
}

/**
 * Authoritative Server Lifecycle Evaluator
 * Upcoming: before occasion date 00:00:00 IST
 * Active: between 00:00:00 and 23:59:59.999 IST on occasion date
 * Expired: after 23:59:59.999 IST on occasion date
 */
export function computeWishLifecycle(wishOrData, options = {}) {
  if (!wishOrData) return 'active';
  const customData = wishOrData.customData || wishOrData.custom_data || {};
  if (wishOrData.status === 'draft' || customData.isDraft || Boolean(wishOrData.isDraft)) {
    return 'draft';
  }

  const eventDate = wishOrData.eventDate || wishOrData.event_date || customData.event_date || customData.eventDate;
  if (!eventDate) return 'active';

  const boundaries = getISTDateBoundaries(eventDate);
  const nowMs = options.nowMs !== undefined ? options.nowMs : Date.now();

  if (nowMs < boundaries.startOfDayUtcMs) return 'upcoming';
  if (nowMs >= boundaries.startOfDayUtcMs && nowMs <= boundaries.endOfDayUtcMs) return 'active';
  return 'expired';
}

/**
 * Builds the canonical public wish URL consistently across backend, UI, share, and copy actions
 * Uses trusted base URL from configuration and never echoes untrusted Host headers
 */
export function getCanonicalPublicWishUrl(slugOrWish, options = {}) {
  const slug = typeof slugOrWish === 'string'
    ? slugOrWish
    : (slugOrWish?.slug || slugOrWish?.id || '');

  const baseUrl = options.baseUrl || options.env?.PUBLIC_APP_URL || options.env?.APP_URL || DEFAULT_APP_BASE_URL;
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const cleanSlug = encodeURIComponent(String(slug).trim());

  return `${cleanBase}/wish/${cleanSlug}`;
}

/**
 * Checks for dangerous media file extensions or unsafe URI schemes
 */
export function validateMediaReference(url) {
  if (!url || typeof url !== 'string') return true;
  const lower = url.toLowerCase().trim();

  // Reject dangerous schemes
  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:text/html')) {
    return false;
  }

  // Reject executable or script extensions
  for (const ext of DANGEROUS_MEDIA_EXTENSIONS) {
    if (lower.includes(ext + '?') || lower.includes(ext + '#') || lower.endsWith(ext)) {
      return false;
    }
  }

  return true;
}

/**
 * Validates wish creation payload before saving
 */
export function validateWishCreationPayload(body, template, activeVersion) {
  const customData = body.customData || body;
  const isDraft = Boolean(body.status === 'draft' || body.isDraft || customData.isDraft);

  // Template existence check
  if (!template) {
    return {
      isValid: false,
      error: { code: 'INVALID_TEMPLATE', message: 'The selected template does not exist.', status: 404 }
    };
  }

  // Template publication check
  if (!isDraft && template.is_published === 0) {
    return {
      isValid: false,
      error: { code: 'UNPUBLISHED_TEMPLATE', message: 'The selected template is not currently published.', status: 422 }
    };
  }

  // Version mismatch check if client passed explicit version
  const requestedVersionId = body.templateVersionId || customData.templateVersionId || customData.template_version_id;
  if (requestedVersionId && activeVersion) {
    if (activeVersion.template_id && activeVersion.template_id !== template.id) {
      return {
        isValid: false,
        error: { code: 'TEMPLATE_VERSION_MISMATCH', message: 'The specified version does not belong to this template.', status: 400 }
      };
    }
    if (activeVersion.status && activeVersion.status !== 'published' && !isDraft) {
      return {
        isValid: false,
        error: { code: 'UNPUBLISHED_VERSION', message: 'The selected template version is not available.', status: 422 }
      };
    }
  }

  // Required field checks for published wishes
  if (!isDraft) {
    const recipient = customData.recipient_name || customData.recipientName;
    if (!recipient || !String(recipient).trim()) {
      return {
        isValid: false,
        error: { code: 'VALIDATION_FAILED', message: 'Recipient name is required to create a wish.', status: 400 }
      };
    }
  }

  // Media references validation
  const mediaToCheck = [
    customData.cover_photo,
    customData.photo_1,
    customData.bg_music,
    customData.soundtrack_url
  ];
  if (Array.isArray(customData.photos)) {
    customData.photos.forEach(p => {
      if (typeof p === 'string') mediaToCheck.push(p);
      else if (p && p.url) mediaToCheck.push(p.url);
      else if (p && p.src) mediaToCheck.push(p.src);
    });
  }

  for (const m of mediaToCheck) {
    if (m && !validateMediaReference(m)) {
      return {
        isValid: false,
        error: { code: 'INVALID_MEDIA_REFERENCE', message: 'Media reference contains an unsafe or unsupported file type.', status: 400 }
      };
    }
  }

  return { isValid: true };
}

/**
 * Prepares a clean independent draft from an existing wish for the "Create Again" flow
 * Guaranteed never to mutate or reactivate the source wish
 */
export function prepareCreateAgainDraft(sourceWish, currentUserId, isAdmin = false) {
  if (!sourceWish) {
    throw new Error('NOT_FOUND');
  }

  const sourceOwnerId = sourceWish.userId || sourceWish.user_id;
  if (sourceOwnerId !== currentUserId && !isAdmin) {
    throw new Error('FORBIDDEN');
  }

  let cd = {};
  try {
    const raw = sourceWish.customData || sourceWish.custom_data;
    cd = typeof raw === 'string' ? JSON.parse(raw) : (raw ? { ...raw } : {});
  } catch (_) {
    cd = {};
  }

  // Clean out publication artifacts & internal references
  delete cd.publishedSnapshotId;
  delete cd.active_snapshot_id;
  delete cd.lock_version;
  delete cd.lockVersion;
  cd.isDraft = true;

  // Set today as new default event date in IST
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const todayStr = `${nowIst.getUTCFullYear()}-${String(nowIst.getUTCMonth() + 1).padStart(2, '0')}-${String(nowIst.getUTCDate()).padStart(2, '0')}`;
  cd.event_date = todayStr;
  cd.eventDate = todayStr;

  const sourceVersionId = sourceWish.templateVersionId || sourceWish.template_version_id || cd.templateVersionId || cd.template_version_id || `tv_${sourceWish.templateId || sourceWish.template_id}_v1`;
  cd.templateVersionId = sourceVersionId;
  cd.template_version_id = sourceVersionId;

  const newId = `wm_${Date.now().toString(36)}_${generateRandomString(4)}`;
  const nowIso = new Date().toISOString();
  const expiryDate = computeExpiryDate(todayStr);

  return {
    id: newId,
    userId: currentUserId,
    templateId: sourceWish.templateId || sourceWish.template_id,
    templateVersionId: sourceVersionId,
    templateName: sourceWish.templateName || sourceWish.template_name || 'Celebration Experience',
    tier: sourceWish.tier || 'free',
    price: 0,
    isPrivate: true,
    buyerName: sourceWish.buyerName || sourceWish.buyer_name || 'Creator',
    buyerContact: sourceWish.buyerContact || sourceWish.buyer_contact || '',
    recipientName: sourceWish.recipientName || sourceWish.recipient_name || 'Special Person',
    eventDate: todayStr,
    expiryDate,
    lifecycleStatus: 'draft',
    status: 'draft',
    views: 0,
    customData: cd,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}
