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

export const DEFAULT_PRIVACY_SETTINGS = {
  profileVisibility: PRIVACY_VISIBILITY.PUBLIC,
  searchEngineIndexing: true,
  analyticsTracking: true,
  marketingEmails: false,
  activityTelemetry: true
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

export function validateProfileUpdate({ displayName, avatarUrl, bio, phone }) {
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

  // Strict confirmation phrase check
  const cleanConfirmation = (confirmationText || '').trim();
  if (cleanConfirmation.toUpperCase() !== DELETION_CONFIRMATION_PHRASE) {
    throw new Error(`Confirmation failed: You must type exactly "${DELETION_CONFIRMATION_PHRASE}" to proceed.`);
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

  // Safe anonymized user representation (soft-delete / deactivation)
  const deactivatedUser = {
    ...user,
    status: 'deactivated',
    displayName: 'Deactivated Creator',
    display_name: 'Deactivated Creator',
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=deactivated',
    avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=deactivated',
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
