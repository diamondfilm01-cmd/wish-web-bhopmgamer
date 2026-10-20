/**
 * WishMagic Production User Account Center, Privacy & Session Engine (Part 35)
 * ==============================================================================
 * Comprehensive user profile management, session security, privacy controls,
 * personal data portability (GDPR/DPDP Export), and multi-step account deletion
 * with financial record retention and published wish lifecycle preservation.
 *
 * Compatible with Cloudflare Workers (D1) and local Express dev runtime.
 */

import { createAuditLogEntry, isAuthoritativeAdmin } from './admin-operations-engine.js';
import { createInAppNotification } from './notification-engine.js';

// ============================================================================
// 1. ENUMS & CONSTANTS
// ============================================================================

export const PRIVACY_VISIBILITY = {
  PUBLIC: 'public',
  UNLISTED: 'unlisted',
  PRIVATE: 'private'
};

export const SUPPORTED_LANGUAGES = ['en', 'hi', 'gu', 'mr', 'ta', 'te', 'bn'];
export const SUPPORTED_TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'UTC'];

export const DEFAULT_PRIVACY_SETTINGS = {
  profileVisibility: PRIVACY_VISIBILITY.PUBLIC,
  searchEngineIndexing: true,
  analyticsTracking: true,
  marketingEmails: false,
  activityTelemetry: true,
  preferredLanguage: 'en',
  timezone: 'Asia/Kolkata'
};

export const ACCOUNT_LIFECYCLE_STATE = {
  ACTIVE: 'active',
  DELETION_PENDING: 'deletion_pending',
  DELETION_PROCESSING: 'deletion_processing',
  DELETED: 'deleted',
  DELETION_FAILED_RETRYABLE: 'deletion_failed_retryable'
};

export const LIFECYCLE_JOB_TYPES = {
  ACCOUNT_DELETION_PURGE: 'ACCOUNT_DELETION_PURGE',
  DATA_EXPORT_GENERATION: 'DATA_EXPORT_GENERATION',
  STORAGE_MEDIA_CLEANUP: 'STORAGE_MEDIA_CLEANUP',
  GRACE_PERIOD_EXPIRATION: 'GRACE_PERIOD_EXPIRATION'
};

export const LIFECYCLE_JOB_STATUSES = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  CANCELLED: 'CANCELLED'
};

export const CLEANUP_RESOURCE_TYPES = {
  IMGBB_IMAGE: 'imgbb_image',
  B2_ASSET: 'b2_asset',
  WISH_DRAFT: 'wish_draft',
  SESSION: 'session',
  NOTIFICATION_JOB: 'notification_job',
  EXPORT_ARTIFACT: 'export_artifact'
};

export const DATA_RETENTION_POLICIES = {
  USER_PERSONAL_DATA: {
    category: 'profile_and_credentials',
    action: 'ANONYMIZE_THEN_PURGE',
    retentionDays: 14,
    purgeAllowed: true,
    description: 'Personal display name, custom avatar and private contact details are stripped. Soft-deleted during grace period, then permanently anonymized.'
  },
  WISH_DRAFTS: {
    category: 'user_drafts',
    action: 'DELETE_PERMANENTLY',
    retentionDays: 14,
    purgeAllowed: true,
    description: 'Unpublished drafts and scratchpads are deleted upon account purge.'
  },
  PUBLISHED_WISHES: {
    category: 'published_celebrations',
    action: 'POLICY_CONFIGURED',
    retentionDays: 14,
    purgeAllowed: false,
    description: 'Preserved during 14-day grace period (retain_grace) or unlisted/archived immediately. Slugs are permanently reserved to prevent imposter collisions.'
  },
  SHARED_TEMPLATE_ASSETS: {
    category: 'template_catalog',
    action: 'RETAIN_PERMANENTLY',
    retentionYears: 99,
    purgeAllowed: false,
    description: 'Marketplace templates, system audio tracks and catalog preview images are system assets and must NEVER be deleted.'
  },
  FINANCIAL_TRANSACTIONS: {
    category: 'payments_and_invoices',
    action: 'RETAIN_STATUTORY_COMPLIANCE',
    retentionYears: 8,
    purgeAllowed: false,
    description: 'Order ledger, payment reference IDs and tax invoices must be retained for 8 years under statutory accounting regulations with user identity anonymized.'
  },
  ORDERS_AND_INVOICES: {
    category: 'payments_and_invoices',
    action: 'RETAIN_STATUTORY_COMPLIANCE',
    retentionYears: 8,
    purgeAllowed: false,
    description: 'Order ledger, payment reference IDs and tax invoices must be retained for 8 years under statutory accounting regulations with user identity anonymized.'
  },
  REFERRAL_LEDGER: {
    category: 'referrals_and_fraud',
    action: 'RETAIN_AUDIT_LOG',
    retentionDays: 730,
    purgeAllowed: false,
    description: 'Referral reward ledgers and fraud logs are preserved to prevent double-spending and ledger manipulation.'
  },
  SYSTEM_AUDIT_LOGS: {
    category: 'security_and_audit',
    action: 'RETAIN_AUDIT_LOG',
    retentionDays: 730,
    purgeAllowed: false,
    description: 'Security and administrative audit trails retained for compliance and forensics.'
  },
  SUPPORT_TICKETS: {
    category: 'support_conversations',
    action: 'ANONYMIZE',
    retentionDays: 365,
    purgeAllowed: true,
    description: 'Internal support threads are retained with user identification stripped for product quality and security tracking.'
  }
};

export const SECURITY_EVENT_TYPES = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  SESSION_REVOKED: 'SESSION_REVOKED',
  ALL_SESSIONS_REVOKED: 'ALL_SESSIONS_REVOKED',
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  PRIVACY_UPDATED: 'PRIVACY_UPDATED',
  DATA_EXPORT_REQUESTED: 'DATA_EXPORT_REQUESTED',
  DATA_EXPORT_DOWNLOADED: 'DATA_EXPORT_DOWNLOADED',
  ACCOUNT_DELETION_REQUESTED: 'ACCOUNT_DELETION_REQUESTED',
  ACCOUNT_DELETION_CANCELLED: 'ACCOUNT_DELETION_CANCELLED',
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED'
};

export const EXPORT_STATUS = {
  PENDING: 'PENDING',
  READY: 'READY',
  DOWNLOADED: 'DOWNLOADED',
  EXPIRED: 'EXPIRED'
};

export const DELETION_STATUS = {
  PENDING: 'PENDING',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
  DEACTIVATED: 'DEACTIVATED'
};

export const DELETION_CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT';
export const DELETION_GRACE_PERIOD_DAYS = 14;

// ============================================================================
// 2. DEVICE & IP UTILITIES
// ============================================================================

/**
 * Parses user agent into human-readable browser, OS and device descriptors.
 */
export function parseUserAgent(ua) {
  if (!ua || typeof ua !== 'string') {
    return {
      browser: 'Web Browser',
      os: 'Web Device',
      device: 'Desktop',
      label: 'Web Browser on Desktop'
    };
  }

  const cleanUa = ua.trim();
  let browser = 'Web Browser';
  let os = 'Unknown OS';
  let device = 'Desktop';

  // Browser detection
  if (cleanUa.includes('Edg/')) {
    browser = 'Microsoft Edge';
  } else if (cleanUa.includes('Chrome/') && !cleanUa.includes('Edg/')) {
    browser = 'Google Chrome';
  } else if (cleanUa.includes('Safari/') && !cleanUa.includes('Chrome/')) {
    browser = 'Apple Safari';
  } else if (cleanUa.includes('Firefox/')) {
    browser = 'Mozilla Firefox';
  } else if (cleanUa.includes('Postman') || cleanUa.includes('curl')) {
    browser = 'API Client';
  }

  // OS detection
  if (cleanUa.includes('Android')) {
    os = 'Android';
  } else if (cleanUa.includes('iPhone')) {
    os = 'iOS (iPhone)';
  } else if (cleanUa.includes('iPad')) {
    os = 'iPadOS';
  } else if (cleanUa.includes('Windows NT 10')) {
    os = 'Windows 10/11';
  } else if (cleanUa.includes('Windows')) {
    os = 'Windows';
  } else if (cleanUa.includes('Mac OS X') || cleanUa.includes('Macintosh')) {
    os = 'macOS';
  } else if (cleanUa.includes('Linux')) {
    os = 'Linux';
  }

  // Device form factor
  if (cleanUa.includes('Mobile') || cleanUa.includes('Android') || cleanUa.includes('iPhone')) {
    device = 'Mobile';
  } else if (cleanUa.includes('iPad') || cleanUa.includes('Tablet')) {
    device = 'Tablet';
  }

  return {
    browser,
    os,
    device,
    label: `${browser} on ${os}`
  };
}

/**
 * Anonymizes/masks IP address for safe presentation in user-facing security center.
 */
export function maskIpAddress(ip) {
  if (!ip || typeof ip !== 'string') return 'Protected IP';
  const clean = ip.trim();

  // IPv4
  if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.***.***`;
    }
  }

  // IPv6
  if (clean.includes(':')) {
    const parts = clean.split(':');
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}:****:****`;
    }
  }

  return 'Protected IP';
}

/**
 * Sanitizes input text against basic HTML script injections.
 */
function sanitizeText(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// 3. PROFILE VALIDATION
// ============================================================================

export function validateProfileUpdate({ displayName, avatarUrl, bio, phone, preferredLanguage, timezone }) {
  const errors = {};
  const cleaned = {};

  if (displayName !== undefined) {
    if (typeof displayName !== 'string' || displayName.trim().length < 2) {
      errors.displayName = 'Display name must be at least 2 characters long.';
    } else if (displayName.trim().length > 60) {
      errors.displayName = 'Display name cannot exceed 60 characters.';
    } else {
      cleaned.displayName = sanitizeText(displayName.trim());
    }
  }

  if (avatarUrl !== undefined && avatarUrl !== null && avatarUrl !== '') {
    if (typeof avatarUrl !== 'string' || (!avatarUrl.startsWith('http://') && !avatarUrl.startsWith('https://'))) {
      errors.avatarUrl = 'Avatar URL must begin with http:// or https://.';
    } else if (avatarUrl.length > 1000) {
      errors.avatarUrl = 'Avatar URL is too long.';
    } else {
      cleaned.avatarUrl = avatarUrl.trim();
    }
  } else if (avatarUrl === '') {
    cleaned.avatarUrl = '';
  }

  if (bio !== undefined && bio !== null) {
    if (typeof bio !== 'string') {
      errors.bio = 'Bio must be a valid text string.';
    } else if (bio.trim().length > 500) {
      errors.bio = 'Bio cannot exceed 500 characters.';
    } else {
      cleaned.bio = sanitizeText(bio.trim());
    }
  }

  if (phone !== undefined && phone !== null && phone !== '') {
    const cleanPhone = String(phone).replace(/\s+/g, '');
    if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
      errors.phone = 'Please enter a valid phone number (7-15 digits).';
    } else {
      cleaned.phone = cleanPhone;
    }
  }

  if (preferredLanguage !== undefined && preferredLanguage !== null) {
    const lang = String(preferredLanguage).trim().toLowerCase();
    if (SUPPORTED_LANGUAGES.includes(lang)) {
      cleaned.preferredLanguage = lang;
    } else {
      errors.preferredLanguage = `Unsupported language. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`;
    }
  }

  if (timezone !== undefined && timezone !== null) {
    const tz = String(timezone).trim();
    if (SUPPORTED_TIMEZONES.includes(tz)) {
      cleaned.timezone = tz;
    } else {
      errors.timezone = `Unsupported timezone. Supported: ${SUPPORTED_TIMEZONES.join(', ')}`;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    cleaned
  };
}

// ============================================================================
// 4. PRIVACY SETTINGS VALIDATION & NORMALIZATION
// ============================================================================

export function validatePrivacySettings(settings = {}) {
  const normalized = { ...DEFAULT_PRIVACY_SETTINGS };

  if (settings.profileVisibility) {
    const val = String(settings.profileVisibility).toLowerCase().trim();
    if (Object.values(PRIVACY_VISIBILITY).includes(val)) {
      normalized.profileVisibility = val;
    }
  }

  if (settings.searchEngineIndexing !== undefined) {
    normalized.searchEngineIndexing = Boolean(settings.searchEngineIndexing);
  }

  if (settings.analyticsTracking !== undefined) {
    normalized.analyticsTracking = Boolean(settings.analyticsTracking);
  }

  if (settings.marketingEmails !== undefined) {
    normalized.marketingEmails = Boolean(settings.marketingEmails);
  }

  if (settings.activityTelemetry !== undefined) {
    normalized.activityTelemetry = Boolean(settings.activityTelemetry);
  }

  if (settings.preferredLanguage) {
    const lang = String(settings.preferredLanguage).toLowerCase().trim();
    if (SUPPORTED_LANGUAGES.includes(lang)) {
      normalized.preferredLanguage = lang;
    }
  }

  if (settings.timezone) {
    const tz = String(settings.timezone).trim();
    if (SUPPORTED_TIMEZONES.includes(tz)) {
      normalized.timezone = tz;
    }
  }

  return normalized;
}

// ============================================================================
// 5. SESSION FORMATTING & SECURITY EVENT AUDIT
// ============================================================================

export function formatSessionForUser(session, currentToken = null) {
  if (!session) return null;
  const isCurrent = Boolean(currentToken && session.token === currentToken);
  const parsedUa = parseUserAgent(session.userAgent || session.user_agent);
  const rawIp = session.ipAddress || session.ip_address || '';
  const maskedIp = maskIpAddress(rawIp);

  return {
    id: session.id,
    isCurrent,
    device: parsedUa,
    maskedIp,
    lastActiveAt: session.lastActiveAt || session.last_active_at || session.createdAt || session.created_at,
    createdAt: session.createdAt || session.created_at,
    expiresAt: session.expiresAt || session.expires_at
  };
}

export function createSecurityEventRecord({
  userId,
  eventType,
  ipAddress = '',
  userAgent = '',
  details = {}
}) {
  if (!userId) throw new Error('User ID is required for security event logging');
  if (!eventType) throw new Error('Event type is required');

  const now = new Date().toISOString();
  const id = `secevt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const parsed = parseUserAgent(userAgent);

  return {
    id,
    userId,
    user_id: userId,
    eventType,
    event_type: eventType,
    ipAddress,
    ip_address: ipAddress,
    userAgent,
    user_agent: userAgent,
    deviceInfo: parsed.label,
    device_info: parsed.label,
    detailsJson: JSON.stringify(details || {}),
    details_json: JSON.stringify(details || {}),
    createdAt: now,
    created_at: now
  };
}

// ============================================================================
// 6. PERSONAL DATA EXPORT (GDPR / DPDP ARTICLE 20 PORTABILITY)
// ============================================================================

export function compileUserDataExport({
  user,
  privacySettings = null,
  wishes = [],
  drafts = [],
  favorites = [],
  orders = [],
  entitlements = [],
  supportTickets = [],
  notificationPreferences = null,
  securityEvents = []
}) {
  const generatedAt = new Date().toISOString();
  const exportId = `wm_export_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  // Summary counts for high-level manifest
  const summary = {
    exportId,
    generatedAt,
    userId: user?.id,
    wishesCount: wishes.length,
    draftsCount: drafts.length,
    favoritesCount: favorites.length,
    ordersCount: orders.length,
    entitlementsCount: entitlements.length,
    supportTicketsCount: supportTickets.length,
    securityEventsCount: securityEvents.length
  };

  const payload = {
    _exportMetadata: {
      application: 'WishMagic Celebration Platform',
      version: '1.0.0',
      exportId,
      generatedAt,
      complianceNotice: 'This personal data archive contains your complete account records in accordance with GDPR Article 20 and Digital Personal Data Protection (DPDP) Act standards.',
      license: 'Personal Non-Commercial Export Archive'
    },
    userProfile: {
      id: user?.id,
      email: user?.email,
      displayName: user?.displayName || user?.display_name,
      avatarUrl: user?.avatarUrl || user?.avatar_url,
      role: user?.role || 'creator',
      plan: user?.plan || 'Free',
      isPremium: Boolean(user?.isPremium || user?.is_premium),
      status: user?.status || 'active',
      createdAt: user?.createdAt || user?.created_at,
      updatedAt: user?.updatedAt || user?.updated_at
    },
    privacySettings: privacySettings || DEFAULT_PRIVACY_SETTINGS,
    notificationPreferences: notificationPreferences || {},
    celebrationWishes: wishes.map(w => ({
      id: w.id,
      slug: w.slug,
      title: w.title || w.recipient_name,
      recipientName: w.recipientName || w.recipient_name,
      occasion: w.occasion,
      relationship: w.relationship,
      status: w.status,
      shareUrl: `https://wishmagic.live/w/${w.slug || w.id}`,
      createdAt: w.createdAt || w.created_at,
      celebrationDate: w.celebrationDate || w.celebration_date
    })),
    savedDrafts: drafts.map(d => ({
      id: d.id,
      templateId: d.templateId || d.template_id,
      recipientName: d.recipientName || d.recipient_name,
      updatedAt: d.updatedAt || d.updated_at
    })),
    favorites: favorites.map(f => ({
      templateId: f.templateId || f.template_id,
      createdAt: f.createdAt || f.created_at
    })),
    ordersAndReceipts: orders.map(o => ({
      orderId: o.id,
      productName: o.productName || o.product_name,
      amountRupees: o.amountRupees || o.amount_rupees,
      currency: o.currency || 'INR',
      status: o.status,
      paymentMethod: o.paymentMethod || o.payment_method,
      transactionId: o.transactionId || o.transaction_id,
      createdAt: o.createdAt || o.created_at
    })),
    entitlements: entitlements.map(e => ({
      featureCode: e.featureCode || e.feature_code,
      status: e.status,
      grantedAt: e.grantedAt || e.granted_at,
      expiresAt: e.expiresAt || e.expires_at
    })),
    supportTickets: supportTickets.map(t => ({
      ticketNumber: t.ticketNumber || t.ticket_number,
      category: t.category,
      subject: t.subject,
      description: t.description,
      status: t.status,
      satisfactionRating: t.satisfactionRating || t.satisfaction_rating,
      createdAt: t.createdAt || t.created_at,
      resolvedAt: t.resolvedAt || t.resolved_at
    })),
    securityAuditLog: securityEvents.map(s => ({
      eventType: s.eventType || s.event_type,
      deviceInfo: s.deviceInfo || s.device_info,
      createdAt: s.createdAt || s.created_at
    }))
  };

  const payloadString = JSON.stringify(payload, null, 2);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7-day download availability

  return {
    exportId,
    summary,
    payload,
    payloadString,
    fileSizeBytes: Buffer.byteLength ? Buffer.byteLength(payloadString, 'utf8') : payloadString.length,
    expiresAt
  };
}

// ============================================================================
// 7. ACCOUNT DELETION & SAFE DEACTIVATION WORKFLOW
// ============================================================================

/**
 * Validates and processes an account deletion request with strict financial
 * and published wish preservation rules.
 */
export function processAccountDeletionRequest({
  user,
  confirmationText,
  reason = 'Other',
  feedback = '',
  wishesHandling = 'retain_grace', // 'retain_grace' or 'unpublish_immediately'
  actor = null
}) {
  if (!user) throw new Error('User record is required');

  // Strict confirmation phrase check ("DELETE MY ACCOUNT")
  const cleanConfirmation = String(confirmationText || '').trim().toUpperCase();
  if (cleanConfirmation !== DELETION_CONFIRMATION_PHRASE) {
    throw new Error(`Confirmation failed: Please type "${DELETION_CONFIRMATION_PHRASE}" to proceed.`);
  }

  const now = new Date();
  const requestedAt = now.toISOString();
  const graceEndsAt = new Date(now.getTime() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const requestId = `delreq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  // Deletion request record
  const deletionRecord = {
    id: requestId,
    userId: user.id,
    user_id: user.id,
    status: DELETION_STATUS.DEACTIVATED,
    reason: sanitizeText(reason),
    feedback: sanitizeText(feedback),
    wishesHandling: wishesHandling === 'unpublish_immediately' ? 'unpublish_immediately' : 'retain_grace',
    wishes_handling: wishesHandling === 'unpublish_immediately' ? 'unpublish_immediately' : 'retain_grace',
    financialRecordsRetained: 1,
    financial_records_retained: 1,
    requestedAt,
    requested_at: requestedAt,
    gracePeriodEndsAt: graceEndsAt,
    grace_period_ends_at: graceEndsAt,
    completedAt: null,
    adminNotes: 'User initiated account deactivation with statutory financial retention.'
  };

  // Soft-deactivated user representation (preserves displayName & avatarUrl during 14-day grace period so re-login restores cleanly)
  const preservedName = user.displayName || user.display_name || 'Creator';
  const preservedAvatar = user.avatarUrl || user.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=creator';
  const deactivatedUser = {
    ...user,
    status: 'deactivated',
    displayName: 'Deactivated Creator',
    display_name: preservedName,
    originalDisplayName: preservedName,
    avatarUrl: preservedAvatar,
    avatar_url: preservedAvatar,
    updatedAt: requestedAt,
    updated_at: requestedAt
  };

  const auditLog = createAuditLogEntry({
    actorId: actor?.id || user.id,
    actorName: user.displayName || user.email,
    actorRole: actor?.role || 'creator',
    action: 'ACCOUNT_DELETION_REQUESTED',
    targetType: 'user_account',
    targetId: user.id,
    details: {
      requestId,
      reason,
      wishesHandling,
      graceEndsAt,
      financialRecordsRetained: true
    }
  });

  return {
    requestId,
    deletionRecord,
    deactivatedUser,
    auditLog,
    message: `Your account has been deactivated. In accordance with statutory financial compliance, purchase records are preserved. You have a ${DELETION_GRACE_PERIOD_DAYS}-day grace period to restore your account.`
  };
}

/**
 * Restores a deactivated account if within the grace period.
 */
export function restoreDeactivatedAccount({ user, deletionRequest, originalName = 'Restored Creator' }) {
  if (!user) throw new Error('User is required');
  if (deletionRequest && deletionRequest.status === DELETION_STATUS.COMPLETED) {
    throw new Error('This account has been permanently purged and cannot be restored.');
  }

  const now = new Date().toISOString();

  const restoredUser = {
    ...user,
    status: 'active',
    displayName: originalName || 'Restored Creator',
    display_name: originalName || 'Restored Creator',
    updatedAt: now,
    updated_at: now
  };

  if (deletionRequest) {
    deletionRequest.status = DELETION_STATUS.CANCELLED;
    deletionRequest.cancelledAt = now;
    deletionRequest.cancelled_at = now;
  }

  return {
    restoredUser,
    deletionRequest,
    message: 'Your WishMagic account has been successfully reactivated! Welcome back.'
  };
}

// ============================================================================
// 8. PART 37: ACCOUNT OVERVIEW & METRICS AGGREGATOR
// ============================================================================

/**
 * Computes live, verifiable statistics for the Account Overview screen.
 */
export function computeAccountOverviewStats({
  user,
  wishes = [],
  orders = [],
  favorites = [],
  tickets = [],
  deletionRequest = null
}) {
  if (!user) return null;

  const userWishes = wishes.filter(w => (w.userId === user.id || w.user_id === user.id));
  
  let draftsCount = 0;
  let activeCount = 0;
  let upcomingCount = 0;
  let expiredCount = 0;

  const now = new Date();

  userWishes.forEach(w => {
    if (w.status === 'draft' || w.isDraft) {
      draftsCount++;
      return;
    }

    // Determine lifecycle state based on eventDate and expiryDate
    const expiryStr = w.expiryDate || w.expiry_date;
    const eventStr = w.eventDate || w.event_date;
    
    if (expiryStr && new Date(expiryStr) < now) {
      expiredCount++;
    } else if (eventStr && new Date(eventStr) > now) {
      upcomingCount++;
    } else {
      activeCount++;
    }
  });

  const verifiedPaidOrders = orders.filter(o => 
    (o.userId === user.id || o.user_id === user.id) && 
    (o.status === 'COMPLETED' || o.status === 'PAID' || o.status === 'Verified Paid')
  );

  const isPendingDeletion = Boolean(
    deletionRequest && 
    (deletionRequest.status === DELETION_STATUS.PENDING || deletionRequest.status === DELETION_STATUS.DEACTIVATED)
  );

  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName || user.display_name || 'Creator',
    avatarUrl: user.avatarUrl || user.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=creator',
    role: user.role || 'creator',
    plan: user.plan || (user.isPremium ? 'VIP' : 'Free'),
    isPremium: Boolean(user.isPremium || user.is_premium),
    createdAt: user.createdAt || user.created_at || '2026-01-01T00:00:00Z',
    status: user.status || 'active',
    accountState: isPendingDeletion ? ACCOUNT_LIFECYCLE_STATE.DELETION_PENDING : ACCOUNT_LIFECYCLE_STATE.ACTIVE,
    isPendingDeletion,
    deletionGracePeriodEndsAt: deletionRequest?.gracePeriodEndsAt || deletionRequest?.grace_period_ends_at || null,
    totalWishesCount: userWishes.length,
    draftWishesCount: draftsCount,
    activeWishesCount: activeCount,
    upcomingWishesCount: upcomingCount,
    expiredWishesCount: expiredCount,
    totalOrdersCount: orders.filter(o => o.userId === user.id || o.user_id === user.id).length,
    paidOrdersCount: verifiedPaidOrders.length,
    totalSpendRupees: verifiedPaidOrders.reduce((sum, o) => sum + (Number(o.amountRupees || o.amount) || 0), 0),
    favoritesCount: Array.isArray(favorites) ? favorites.length : 0,
    openTicketsCount: Array.isArray(tickets) ? tickets.filter(t => t.status !== 'resolved' && t.status !== 'closed').length : 0,
    metrics: {
      totalWishes: userWishes.length,
      draftsCount,
      activeCount,
      upcomingCount,
      expiredCount,
      favoritesCount: Array.isArray(favorites) ? favorites.length : 0,
      ordersCount: verifiedPaidOrders.length,
      supportTicketsCount: Array.isArray(tickets) ? tickets.length : 0
    }
  };
}

// ============================================================================
// 9. PART 37: STORAGE & DEPENDENCY INSPECTOR
// ============================================================================

/**
 * Evaluates user-owned media items and checks dependencies against active wishes
 * and shared marketplace templates before scheduling deletion.
 */
export function evaluateUserStorageDependencies({
  user,
  userId,
  wishes = [],
  mediaList = [],
  templates = []
}) {
  const effectiveUserId = userId || user?.id;
  if (!effectiveUserId) throw new Error('User ID is required for dependency evaluation');

  // Build a set of URLs referenced by shared marketplace templates
  const sharedTemplateUrls = new Set();
  (templates || []).forEach(t => {
    if (t.thumbnail) sharedTemplateUrls.add(t.thumbnail);
    if (Array.isArray(t.previewImages)) {
      t.previewImages.forEach(img => sharedTemplateUrls.add(img));
    }
    if (t.audioUrl || t.musicUrl) sharedTemplateUrls.add(t.audioUrl || t.musicUrl);
  });

  // Build a set of media URLs referenced by active/published wishes
  const activeWishMediaUrls = new Set();
  (wishes || []).forEach(w => {
    const cd = typeof w.customData === 'string' ? JSON.parse(w.customData || '{}') : (w.customData || {});
    if (cd.cover_photo) activeWishMediaUrls.add(cd.cover_photo);
    if (cd.music_url || cd.musicUrl) activeWishMediaUrls.add(cd.music_url || cd.musicUrl);
    if (Array.isArray(cd.photos)) {
      cd.photos.forEach(p => {
        if (p?.src) activeWishMediaUrls.add(p.src);
      });
    }
  });

  const evaluation = {
    totalMediaChecked: 0,
    safeToDeleteCount: 0,
    sharedTemplateAssetsPreserved: 0,
    activeWishDependenciesPreserved: 0,
    cleanupItems: []
  };

  (mediaList || []).forEach(m => {
    const isOwner = (m.userId === effectiveUserId || m.user_id === effectiveUserId);
    if (!isOwner) return;

    evaluation.totalMediaChecked++;

    const isShared = Boolean(
      m.isDefault || 
      m.isTemplateImage || 
      m.is_template_image || 
      sharedTemplateUrls.has(m.url) || 
      sharedTemplateUrls.has(m.thumbnailUrl)
    );

    const isInActiveWish = activeWishMediaUrls.has(m.url);

    if (isShared) {
      evaluation.sharedTemplateAssetsPreserved++;
      evaluation.cleanupItems.push({
        resourceId: m.id,
        resourceType: CLEANUP_RESOURCE_TYPES.IMGBB_IMAGE,
        url: m.url,
        provider: 'imgbb',
        status: 'DEPENDENCY_BLOCKED',
        isSharedTemplateAsset: 1,
        retainedReason: DATA_RETENTION_POLICIES.SHARED_TEMPLATE_ASSETS.description
      });
    } else if (isInActiveWish) {
      evaluation.activeWishDependenciesPreserved++;
      evaluation.cleanupItems.push({
        resourceId: m.id,
        resourceType: CLEANUP_RESOURCE_TYPES.IMGBB_IMAGE,
        url: m.url,
        provider: 'imgbb',
        status: 'DEPENDENCY_BLOCKED',
        isSharedTemplateAsset: 0,
        retainedReason: 'Referenced by active published celebration wish'
      });
    } else {
      evaluation.safeToDeleteCount++;
      evaluation.cleanupItems.push({
        resourceId: m.id,
        resourceType: CLEANUP_RESOURCE_TYPES.IMGBB_IMAGE,
        url: m.url,
        provider: 'imgbb',
        status: 'PENDING',
        isSharedTemplateAsset: 0,
        retainedReason: null
      });
    }
  });

  // Track wish-level custom media assets that belong to user's wishes
  (wishes || []).forEach(w => {
    const isOwner = (w.userId === effectiveUserId || w.user_id === effectiveUserId);
    if (!isOwner) return;

    if (w.coverImage && !sharedTemplateUrls.has(w.coverImage)) {
      evaluation.cleanupItems.push({
        resourceId: `wish_cover_${w.id}`,
        resourceType: CLEANUP_RESOURCE_TYPES.IMGBB_IMAGE,
        url: w.coverImage,
        provider: w.coverImage.includes('ibb.co') ? 'imgbb' : 'backblaze_b2',
        status: 'PENDING',
        isSharedTemplateAsset: 0,
        retainedReason: null
      });
    }

    if (w.backgroundMusic && !sharedTemplateUrls.has(w.backgroundMusic)) {
      evaluation.cleanupItems.push({
        resourceId: `wish_music_${w.id}`,
        resourceType: CLEANUP_RESOURCE_TYPES.B2_ASSET,
        url: w.backgroundMusic,
        provider: 'backblaze_b2',
        status: 'PENDING',
        isSharedTemplateAsset: 0,
        retainedReason: null
      });
    }
  });

  evaluation.userId = effectiveUserId;
  const providersSet = new Set();
  evaluation.cleanupItems.forEach(item => {
    if (item.provider) providersSet.add(item.provider);
  });
  // Also check inline wish media references for B2 audio or other storage
  (wishes || []).forEach(w => {
    const music = w.backgroundMusic || w.musicUrl || w.music_url;
    if (music && music.includes('backblazeb2.com')) providersSet.add('backblaze_b2');
  });
  evaluation.externalProviders = Array.from(providersSet);

  return evaluation;
}

// ============================================================================
// 10. PART 37: ACCOUNT DELETION IMPACT SUMMARY
// ============================================================================

/**
 * Returns a transparent consequence summary to display in the UI before confirmation.
 */
export function getAccountDeletionConsequences({
  user,
  wishes = [],
  mediaList = [],
  orders = [],
  templates = []
}) {
  if (!user) return null;

  const userWishes = wishes.filter(w => (w.userId === user.id || w.user_id === user.id));
  const drafts = userWishes.filter(w => w.status === 'draft' || w.isDraft);
  const liveWishes = userWishes.filter(w => w.status === 'published' && !w.isDraft);
  const userOrders = orders.filter(o => o.userId === user.id || o.user_id === user.id);

  const storageEval = evaluateUserStorageDependencies({
    userId: user.id,
    wishes: userWishes,
    mediaList,
    templates
  });

  return {
    userId: user.id,
    totalWishesCount: userWishes.length,
    publishedWishesCount: liveWishes.length,
    draftWishesCount: drafts.length,
    ordersCount: userOrders.length,
    retainedFinancialRecordsCount: userOrders.length,
    gracePeriodDays: DELETION_GRACE_PERIOD_DAYS,
    requiredConfirmationPhrase: DELETION_CONFIRMATION_PHRASE,
    legalDisclosures: [
      'Financial transaction receipts and tax invoices are retained for 8 years under statutory accounting regulations.',
      'Slugs of published celebration wishes remain reserved to prevent impersonation.',
      'A 14-day grace window applies before permanent deletion during which you can reactivate your account.'
    ],
    impact: {
      totalWishesAffected: userWishes.length,
      draftsCount: drafts.length,
      publishedLinksCount: liveWishes.length,
      exclusiveMediaFilesSafeForCleanup: storageEval.safeToDeleteCount,
      sharedTemplateAssetsPreserved: storageEval.sharedTemplateAssetsPreserved,
      financialOrdersRetainedUnderLaw: userOrders.length
    },
    statutoryNotice: 'Financial invoices and transaction receipts are permanently preserved under tax and accounting laws with personal identifiers redacted.'
  };
}

// ============================================================================
// 11. PART 37: LIFECYCLE BACKGROUND JOBS ENGINE
// ============================================================================

/**
 * Creates an asynchronous lifecycle job record for background execution.
 */
export function createLifecycleJobRecord({
  userId,
  jobType,
  progressStep = 'INITIALIZED',
  details = {}
}) {
  if (!userId) throw new Error('User ID is required');
  if (!jobType) throw new Error('Job type is required');

  const now = new Date().toISOString();
  const id = `lifejob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    userId,
    user_id: userId,
    jobType,
    job_type: jobType,
    status: LIFECYCLE_JOB_STATUSES.QUEUED,
    attemptCount: 0,
    attempt_count: 0,
    maxAttempts: 5,
    max_attempts: 5,
    nextEligibleRetryAt: now,
    next_eligible_retry_at: now,
    claimedBy: null,
    claimed_by: null,
    claimExpiresAt: null,
    claim_expires_at: null,
    progressStep,
    progress_step: progressStep,
    detailsJson: JSON.stringify(details || {}),
    details_json: JSON.stringify(details || {}),
    errorCode: null,
    error_code: null,
    errorMessage: null,
    error_message: null,
    createdAt: now,
    created_at: now,
    updatedAt: now,
    updated_at: now,
    completedAt: null,
    completed_at: null
  };
}

/**
 * Processes queued account lifecycle jobs (bounded batch claim).
 */
export function processLifecycleJobsQueue({
  jobs = [],
  workerId = 'worker_node',
  limit = 10
}) {
  const now = new Date();
  const claimedJobs = [];

  for (const job of jobs) {
    if (claimedJobs.length >= limit) break;

    const isQueued = (job.status === LIFECYCLE_JOB_STATUSES.QUEUED || job.status === LIFECYCLE_JOB_STATUSES.FAILED_RETRYABLE);
    const retryEligible = !job.nextEligibleRetryAt || new Date(job.nextEligibleRetryAt) <= now;

    if (isQueued && retryEligible && job.attemptCount < (job.maxAttempts || 5)) {
      job.status = LIFECYCLE_JOB_STATUSES.PROCESSING;
      job.claimedBy = workerId;
      job.workerId = workerId;
      job.claimExpiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
      job.attemptCount = (job.attemptCount || 0) + 1;
      job.updatedAt = now.toISOString();
      claimedJobs.push(job);
    }
  }

  return {
    claimedCount: claimedJobs.length,
    claimedJobs
  };
}

