/**
 * WishMagic Enterprise-Grade Notification & Communication Engine (Part 31)
 * =========================================================================
 * Complete In-App Notifications + Transactional Email + Scheduled Reminders
 * + User Preferences + Admin Announcements + Delivery Queue + Retry & Recovery
 * + Delivery Analytics
 */

// ============================================================================
// CONSTANTS & ENUMS
// ============================================================================

export const NOTIFICATION_CHANNELS = {
  IN_APP: 'in_app',
  EMAIL: 'email'
};

export const NOTIFICATION_TYPES = {
  WISH_PUBLISHED: 'WISH_PUBLISHED',
  UPCOMING_WISH_REMINDER: 'UPCOMING_WISH_REMINDER',
  WISH_EXPIRING_SOON: 'WISH_EXPIRING_SOON',
  WISH_EXPIRED: 'WISH_EXPIRED',
  ACCOUNT_SECURITY: 'ACCOUNT_SECURITY',
  ADMIN_ANNOUNCEMENT: 'ADMIN_ANNOUNCEMENT',
  SYSTEM_FAILURE_ALERT: 'SYSTEM_FAILURE_ALERT'
};

export const JOB_STATUS = {
  PENDING: 'PENDING',
  CLAIMED: 'CLAIMED',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  RETRY_PENDING: 'RETRY_PENDING',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
};

export const ANNOUNCEMENT_STATUS = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED'
};

export const ANNOUNCEMENT_AUDIENCE = {
  ALL_ACTIVE: 'ALL_ACTIVE',
  VIP_ONLY: 'VIP_ONLY',
  FREE_ONLY: 'FREE_ONLY'
};

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  inApp: true,
  transactionalEmail: true,
  upcomingWishReminders: true,
  expiryReminders: true,
  promotionalEmail: false,
  adminAnnouncements: true
};

export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOTIFICATION_NOT_FOUND: 'NOTIFICATION_NOT_FOUND',
  INVALID_NOTIFICATION_PREFERENCE: 'INVALID_NOTIFICATION_PREFERENCE',
  EMAIL_PROVIDER_NOT_CONFIGURED: 'EMAIL_PROVIDER_NOT_CONFIGURED',
  EMAIL_PROVIDER_UNAVAILABLE: 'EMAIL_PROVIDER_UNAVAILABLE',
  INVALID_RECIPIENT: 'INVALID_RECIPIENT',
  JOB_NOT_RETRYABLE: 'JOB_NOT_RETRYABLE',
  RETRY_LIMIT_REACHED: 'RETRY_LIMIT_REACHED',
  ANNOUNCEMENT_NOT_FOUND: 'ANNOUNCEMENT_NOT_FOUND',
  INVALID_ANNOUNCEMENT_STATE: 'INVALID_ANNOUNCEMENT_STATE',
  DUPLICATE_NOTIFICATION: 'DUPLICATE_NOTIFICATION',
  OPERATION_FAILED: 'OPERATION_FAILED'
};

// ============================================================================
// SECURITY & HTML SANITIZATION HELPERS
// ============================================================================

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

// ============================================================================
// TIMEZONE & DATE ENGINE (Authoritative IST UTC+5:30)
// ============================================================================

export const IST_OFFSET_MINUTES = 330; // UTC + 5:30

export function getNowIST(dateObj = new Date()) {
  const utcMs = dateObj.getTime();
  const istMs = utcMs + IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(istMs);
}

export function formatISTDate(dateObj = new Date()) {
  const ist = getNowIST(dateObj);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isSameISTDay(dateStr1, dateStr2) {
  if (!dateStr1 || !dateStr2) return false;
  return dateStr1.split('T')[0] === dateStr2.split('T')[0];
}

// ============================================================================
// USER NOTIFICATION PREFERENCES LOGIC
// ============================================================================

export function sanitizeNotificationPreferences(input) {
  const p = input || {};
  return {
    inApp: p.inApp !== false,
    transactionalEmail: p.transactionalEmail !== false && p.email !== false,
    upcomingWishReminders: p.upcomingWishReminders !== false && p.wishReminders !== false,
    expiryReminders: p.expiryReminders !== false,
    promotionalEmail: Boolean(p.promotionalEmail || p.marketing),
    adminAnnouncements: p.adminAnnouncements !== false && p.productUpdates !== false
  };
}

/**
 * Evaluates whether a notification is eligible to be delivered through a channel
 * based on recipient preferences.
 * CRITICAL INVARIANT: Mandatory security notices CANNOT be opted out of.
 */
export function evaluateNotificationEligibility({ preferences, channel, notificationType }) {
  const prefs = sanitizeNotificationPreferences(preferences);

  // INVARIANT: Account security notifications are MANDATORY across all channels
  if (notificationType === NOTIFICATION_TYPES.ACCOUNT_SECURITY) {
    return { eligible: true, reason: 'MANDATORY_SECURITY_NOTICE' };
  }

  // In-App Channel eligibility
  if (channel === NOTIFICATION_CHANNELS.IN_APP) {
    if (!prefs.inApp) {
      return { eligible: false, reason: 'OPTED_OUT_OF_IN_APP' };
    }
    return { eligible: true, reason: 'IN_APP_ENABLED' };
  }

  // Email Channel eligibility
  if (channel === NOTIFICATION_CHANNELS.EMAIL) {
    if (!prefs.transactionalEmail) {
      return { eligible: false, reason: 'OPTED_OUT_OF_EMAIL' };
    }

    switch (notificationType) {
      case NOTIFICATION_TYPES.UPCOMING_WISH_REMINDER:
        if (!prefs.upcomingWishReminders) {
          return { eligible: false, reason: 'OPTED_OUT_OF_UPCOMING_REMINDERS' };
        }
        break;

      case NOTIFICATION_TYPES.WISH_EXPIRING_SOON:
      case NOTIFICATION_TYPES.WISH_EXPIRED:
        if (!prefs.expiryReminders) {
          return { eligible: false, reason: 'OPTED_OUT_OF_EXPIRY_REMINDERS' };
        }
        break;

      case NOTIFICATION_TYPES.ADMIN_ANNOUNCEMENT:
        if (!prefs.adminAnnouncements) {
          return { eligible: false, reason: 'OPTED_OUT_OF_ANNOUNCEMENTS' };
        }
        break;

      default:
        // Transactional emails (e.g. WISH_PUBLISHED) are allowed if transactionalEmail is true
        break;
    }

    return { eligible: true, reason: 'EMAIL_ENABLED' };
  }

  return { eligible: true, reason: 'DEFAULT_ELIGIBLE' };
}

// ============================================================================
// RESPONSIVE BRANDED EMAIL TEMPLATES
// ============================================================================

export function renderEmailLayout({ title, contentHtml, footerNote = '', appUrl = 'https://wishmagic.live' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0b0217; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9; }
    .wrapper { max-width: 580px; margin: 0 auto; padding: 32px 16px; }
    .card { background: #130924; border: 1px solid #2a1b4e; border-radius: 16px; padding: 32px 24px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
    .brand { font-size: 20px; font-weight: 800; color: #ec4899; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    .brand-sub { color: #c084fc; font-weight: 600; }
    .heading { font-size: 20px; font-weight: 700; color: #ffffff; margin: 24px 0 12px 0; line-height: 1.3; }
    .paragraph { font-size: 14px; line-height: 1.6; color: #cbd5e1; margin: 0 0 16px 0; }
    .btn { display: inline-block; background: #9333ea; color: #ffffff !important; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 10px; text-decoration: none; margin: 16px 0; text-align: center; }
    .meta-box { background: #1c0e35; border-left: 3px solid #c084fc; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0; font-size: 13px; color: #e2e8f0; }
    .footer { text-align: center; font-size: 12px; color: #64748b; margin-top: 24px; line-height: 1.5; }
    .footer a { color: #94a3b8; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <a href="${escapeHtml(appUrl)}" class="brand">
        ✨ WishMagic <span class="brand-sub">Celebrations</span>
      </a>
      ${contentHtml}
      ${footerNote ? `<div class="meta-box">${footerNote}</div>` : ''}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} WishMagic Platform. Beautiful Interactive Web Celebrations.</p>
      <p>Manage your notification settings anytime in <a href="${escapeHtml(appUrl)}/account">Account Settings</a>.</p>
    </div>
  </div>
</body>
</html>`;
}

export function renderWishPublishedEmail({ recipientName, buyerName, slug, appUrl = 'https://wishmagic.live' }) {
  const wishUrl = `${appUrl}/w/${encodeURIComponent(slug || '')}`;
  const subject = `Your WishMagic celebration for ${recipientName || 'someone special'} is live! ✨`;
  const content = `
    <h1 class="heading">Celebration Published Successfully! 🚀</h1>
    <p class="paragraph">Hello ${escapeHtml(buyerName || 'Creator')},</p>
    <p class="paragraph">Your special celebration webpage for <strong>${escapeHtml(recipientName || 'your loved one')}</strong> has been generated and is now live worldwide.</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${escapeHtml(wishUrl)}" class="btn">View &amp; Share Celebration ✨</a>
    </div>
    <p class="paragraph" style="font-size: 13px; color: #94a3b8;">Direct celebration link:<br><a href="${escapeHtml(wishUrl)}" style="color: #c084fc; word-break: break-all;">${escapeHtml(wishUrl)}</a></p>
  `;
  return {
    subject,
    html: renderEmailLayout({ title: subject, contentHtml: content, appUrl }),
    text: `Your celebration for ${recipientName} is live! View link: ${wishUrl}`
  };
}

export function renderUpcomingWishReminderEmail({ recipientName, eventDate, slug, appUrl = 'https://wishmagic.live' }) {
  const wishUrl = `${appUrl}/w/${encodeURIComponent(slug || '')}`;
  const subject = `Reminder: ${recipientName}'s special celebration is coming up! 📅`;
  const content = `
    <h1 class="heading">Special Occasion Reminder ⏳</h1>
    <p class="paragraph">Friendly reminder that the celebration for <strong>${escapeHtml(recipientName || 'your loved one')}</strong> is scheduled for <strong>${escapeHtml(eventDate || 'soon')}</strong>.</p>
    <p class="paragraph">Make sure everything is ready and share the celebration link with friends and family before the big moment.</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${escapeHtml(wishUrl)}" class="btn">Open Celebration Page</a>
    </div>
  `;
  return {
    subject,
    html: renderEmailLayout({ title: subject, contentHtml: content, appUrl }),
    text: `Reminder: Celebration for ${recipientName} is on ${eventDate}. Link: ${wishUrl}`
  };
}

export function renderWishExpiringEmail({ recipientName, expiryDate, slug, appUrl = 'https://wishmagic.live' }) {
  const wishUrl = `${appUrl}/w/${encodeURIComponent(slug || '')}`;
  const subject = `Notice: Celebration for ${recipientName} expires soon (7-day window) ⏳`;
  const content = `
    <h1 class="heading">Celebration Expiring Soon ⏳</h1>
    <p class="paragraph">The 7-day public viewing period for <strong>${escapeHtml(recipientName || 'your wish')}</strong> concludes on <strong>${escapeHtml(expiryDate || 'soon')}</strong> at 23:59:59 IST.</p>
    <p class="paragraph">If you want to keep this celebration permanent or extend viewing, you can upgrade to a VIP Lifetime Pass.</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${escapeHtml(appUrl)}/account" class="btn">Extend or Upgrade Celebration</a>
    </div>
  `;
  return {
    subject,
    html: renderEmailLayout({ title: subject, contentHtml: content, appUrl }),
    text: `Celebration for ${recipientName} expires on ${expiryDate} at 23:59:59 IST.`
  };
}

export function renderAccountSecurityEmail({ recipientName, details, timestamp, appUrl = 'https://wishmagic.live' }) {
  const subject = `WishMagic Account Security Alert 🔒`;
  const content = `
    <h1 class="heading">Security Notice 🔒</h1>
    <p class="paragraph">Hello ${escapeHtml(recipientName || 'User')},</p>
    <p class="paragraph">A security-sensitive event was recorded on your WishMagic account:</p>
    <div class="meta-box">
      <strong>Event:</strong> ${escapeHtml(details || 'Account status updated or session revoked')}<br>
      <strong>Time:</strong> ${escapeHtml(timestamp || new Date().toISOString())}
    </div>
    <p class="paragraph">If you did not authorize this action, please sign in immediately and update your credentials or contact support.</p>
  `;
  return {
    subject,
    html: renderEmailLayout({ title: subject, contentHtml: content, appUrl }),
    text: `Security Notice: ${details} at ${timestamp}`
  };
}

export function renderAnnouncementEmail({ recipientName, title, message, appUrl = 'https://wishmagic.live' }) {
  const subject = `WishMagic Announcement: ${title}`;
  const content = `
    <h1 class="heading">${escapeHtml(title)}</h1>
    <p class="paragraph">Hello ${escapeHtml(recipientName || 'Creator')},</p>
    <p class="paragraph" style="white-space: pre-line;">${escapeHtml(message)}</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${escapeHtml(appUrl)}" class="btn">Visit WishMagic Platform</a>
    </div>
  `;
  return {
    subject,
    html: renderEmailLayout({ title: subject, contentHtml: content, appUrl }),
    text: `${title}\n\n${message}`
  };
}

// ============================================================================
// EMAIL PROVIDER ABSTRACTION
// ============================================================================

export class BaseEmailProvider {
  async sendEmail(_options) {
    throw new Error('Not implemented');
  }

  async getHealthStatus() {
    return { configured: false, status: 'NOT_IMPLEMENTED' };
  }
}

/**
 * Real Resend Email Provider Adapter
 */
export class ResendEmailProvider extends BaseEmailProvider {
  constructor(apiKey, fromAddress = 'WishMagic <notifications@wishmagic.live>') {
    super();
    this.apiKey = apiKey;
    this.fromAddress = fromAddress;
  }

  async sendEmail({ to, subject, html, text, idempotencyKey }) {
    if (!this.apiKey) {
      return {
        success: false,
        errorCode: ERROR_CODES.EMAIL_PROVIDER_NOT_CONFIGURED,
        errorMessage: 'Resend API key is not configured',
        retryable: false
      };
    }

    if (!isValidEmail(to)) {
      return {
        success: false,
        errorCode: ERROR_CODES.INVALID_RECIPIENT,
        errorMessage: `Invalid recipient email: ${to}`,
        retryable: false
      };
    }

    try {
      const headers = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      };
      if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from: this.fromAddress,
          to: [to],
          subject,
          html,
          text
        })
      });

      const resData = await res.json().catch(() => ({}));

      if (res.status === 200 || res.status === 201) {
        return {
          success: true,
          providerMessageId: resData.id || `resend_${Date.now()}`,
          status: 'ACCEPTED'
        };
      }

      if (res.status === 429) {
        return {
          success: false,
          errorCode: 'RATE_LIMITED',
          errorMessage: resData.message || 'Rate limit exceeded on Resend',
          retryable: true
        };
      }

      if (res.status >= 500) {
        return {
          success: false,
          errorCode: ERROR_CODES.EMAIL_PROVIDER_UNAVAILABLE,
          errorMessage: resData.message || 'Resend server error',
          retryable: true
        };
      }

      return {
        success: false,
        errorCode: 'PROVIDER_REJECTED',
        errorMessage: resData.message || `Resend returned ${res.status}`,
        retryable: false
      };
    } catch (err) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: err.message,
        retryable: true
      };
    }
  }

  async getHealthStatus() {
    return {
      configured: Boolean(this.apiKey),
      providerName: 'Resend',
      fromAddress: this.fromAddress,
      status: this.apiKey ? 'CONFIGURED' : 'MISSING_API_KEY'
    };
  }
}

/**
 * Mock Email Provider for testing & fallback
 */
export class MockEmailProvider extends BaseEmailProvider {
  constructor({ simulateFailure = false, simulateRateLimit = false, simulateTransient = false } = {}) {
    super();
    this.sentEmails = [];
    this.simulateFailure = simulateFailure;
    this.simulateRateLimit = simulateRateLimit;
    this.simulateTransient = simulateTransient;
  }

  async sendEmail({ to, subject, html, text, idempotencyKey }) {
    if (!isValidEmail(to)) {
      return {
        success: false,
        errorCode: ERROR_CODES.INVALID_RECIPIENT,
        errorMessage: `Invalid recipient email address: ${to}`,
        retryable: false
      };
    }

    if (this.simulateRateLimit) {
      return {
        success: false,
        errorCode: 'RATE_LIMITED',
        errorMessage: 'Simulated HTTP 429 Rate Limit',
        retryable: true
      };
    }

    if (this.simulateTransient) {
      return {
        success: false,
        errorCode: ERROR_CODES.EMAIL_PROVIDER_UNAVAILABLE,
        errorMessage: 'Simulated 503 Provider Unavailable',
        retryable: true
      };
    }

    if (this.simulateFailure) {
      return {
        success: false,
        errorCode: 'PERMANENT_ERROR',
        errorMessage: 'Simulated permanent failure',
        retryable: false
      };
    }

    const messageId = `mock_msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.sentEmails.push({ to, subject, html, text, idempotencyKey, messageId, sentAt: new Date().toISOString() });

    return {
      success: true,
      providerMessageId: messageId,
      status: 'ACCEPTED'
    };
  }

  async getHealthStatus() {
    return {
      configured: true,
      providerName: 'MockEmailProvider (Test Environment)',
      sentCount: this.sentEmails.length,
      status: 'CONFIGURED'
    };
  }
}

/**
 * Unconfigured Email Provider when credentials are not supplied
 */
export class UnconfiguredEmailProvider extends BaseEmailProvider {
  async sendEmail() {
    return {
      success: false,
      errorCode: ERROR_CODES.EMAIL_PROVIDER_NOT_CONFIGURED,
      errorMessage: 'Email provider credentials not configured. Please supply RESEND_API_KEY or MAILCHANNELS_API_KEY in Worker environment.',
      retryable: false
    };
  }

  async getHealthStatus() {
    return {
      configured: false,
      providerName: 'None',
      status: 'NOT_CONFIGURED'
    };
  }
}

export function resolveEmailProvider(env = {}) {
  if (env.RESEND_API_KEY) {
    return new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM || 'WishMagic <notifications@wishmagic.live>');
  }
  if (process.env?.RESEND_API_KEY) {
    return new ResendEmailProvider(process.env.RESEND_API_KEY, process.env.EMAIL_FROM || 'WishMagic <notifications@wishmagic.live>');
  }
  // If explicitly in test mode or local test harness
  if (env.USE_MOCK_EMAIL || process.env?.NODE_ENV === 'test') {
    return new MockEmailProvider();
  }
  return new UnconfiguredEmailProvider();
}

// ============================================================================
// IN-APP NOTIFICATION REPOSITORY & CREATION
// ============================================================================

export function createInAppNotification({
  id,
  userId,
  type = NOTIFICATION_TYPES.SYSTEM_NOTICE,
  title,
  message,
  relatedType = null,
  relatedId = null,
  actionUrl = null,
  icon = 'notifications',
  severity = 'info',
  metadata = {}
}) {
  if (!userId) throw new Error('Recipient userId is required');
  if (!title) throw new Error('Notification title is required');

  const notifId = id || `ntf_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
  const now = new Date().toISOString();

  return {
    id: notifId,
    userId,
    user_id: userId,
    type,
    title,
    message: message || '',
    readAt: null,
    read_at: null,
    relatedType,
    related_type: relatedType,
    relatedId,
    related_id: relatedId,
    actionUrl,
    action_url: actionUrl,
    icon,
    severity,
    metadata: metadata || {},
    createdAt: now,
    created_at: now
  };
}

export function markNotificationAsRead({ notification, actorId }) {
  if (!notification) throw new Error('Notification not found');
  // Check ownership
  const ownerId = notification.userId || notification.user_id;
  if (ownerId !== 'all' && ownerId !== actorId) {
    const err = new Error('Forbidden: Cannot modify another user notification');
    err.code = ERROR_CODES.FORBIDDEN;
    throw err;
  }

  const now = new Date().toISOString();
  notification.readAt = now;
  notification.read_at = now;
  return notification;
}

export function markAllNotificationsAsRead({ notifications = [], userId }) {
  if (!userId) throw new Error('userId is required');
  const now = new Date().toISOString();
  let updatedCount = 0;

  notifications.forEach(n => {
    const ownerId = n.userId || n.user_id;
    if ((ownerId === userId || ownerId === 'all') && !n.readAt && !n.read_at) {
      n.readAt = now;
      n.read_at = now;
      updatedCount++;
    }
  });

  return updatedCount;
}

export function calculateUnreadCount({ notifications = [], userId }) {
  if (!userId) return 0;
  return notifications.filter(n => {
    const ownerId = n.userId || n.user_id;
    return (ownerId === userId || ownerId === 'all') && (!n.readAt && !n.read_at);
  }).length;
}

// ============================================================================
// DELIVERY QUEUE & JOB PROCESSOR
// ============================================================================

export function createDeliveryJob({
  id,
  notificationId = null,
  channel = NOTIFICATION_CHANNELS.EMAIL,
  recipientUserId,
  recipientEmail,
  notificationType,
  subject,
  maxAttempts = 3,
  idempotencyKey = null,
  metadata = {}
}) {
  if (!recipientUserId) throw new Error('Recipient user ID required');
  const jobId = id || `job_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
  const now = new Date().toISOString();
  const autoKey = idempotencyKey || `idem_${jobId}`;

  return {
    id: jobId,
    notificationId,
    notification_id: notificationId,
    channel,
    recipientUserId,
    recipient_user_id: recipientUserId,
    recipientEmail: recipientEmail || null,
    recipient_email: recipientEmail || null,
    notificationType,
    notification_type: notificationType,
    subject: subject || 'WishMagic Notification',
    status: JOB_STATUS.PENDING,
    attemptCount: 0,
    attempt_count: 0,
    maxAttempts,
    max_attempts: maxAttempts,
    nextEligibleRetryAt: now,
    next_eligible_retry_at: now,
    claimedBy: null,
    claimed_by: null,
    claimExpiresAt: null,
    claim_expires_at: null,
    providerMessageId: null,
    provider_message_id: null,
    lastErrorCode: null,
    last_error_code: null,
    lastErrorMessage: null,
    last_error_message: null,
    idempotencyKey: autoKey,
    idempotency_key: autoKey,
    metadata: metadata || {},
    createdAt: now,
    created_at: now,
    updatedAt: now,
    updated_at: now
  };
}

/**
 * Calculates exponential backoff retry interval in milliseconds
 * Attempt 1 -> 1 minute, Attempt 2 -> 5 minutes, Attempt 3 -> 30 minutes
 */
export function calculateBackoffRetryMs(attemptCount) {
  const intervalsMinutes = [1, 5, 30, 120, 360];
  const idx = Math.min(Math.max(0, attemptCount - 1), intervalsMinutes.length - 1);
  return intervalsMinutes[idx] * 60 * 1000;
}

/**
 * Atomic lease claiming of eligible delivery jobs
 */
export function claimEligibleJobs({ jobs = [], limit = 10, workerId, leaseDurationMs = 5 * 60 * 1000, now = new Date() }) {
  const nowIso = now.toISOString();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs).toISOString();

  const claimed = [];
  for (const job of jobs) {
    if (claimed.length >= limit) break;

    const isPending = job.status === JOB_STATUS.PENDING;
    const isRetryEligible = job.status === JOB_STATUS.RETRY_PENDING && (!job.nextEligibleRetryAt || job.nextEligibleRetryAt <= nowIso);
    const isStaleLease = job.status === JOB_STATUS.CLAIMED && job.claimExpiresAt && job.claimExpiresAt < nowIso;

    if (isPending || isRetryEligible || isStaleLease) {
      job.status = JOB_STATUS.CLAIMED;
      job.claimedBy = workerId;
      job.claimed_by = workerId;
      job.claimExpiresAt = leaseExpiresAt;
      job.claim_expires_at = leaseExpiresAt;
      job.updatedAt = nowIso;
      job.updated_at = nowIso;
      claimed.push(job);
    }
  }

  return claimed;
}

/**
 * Recovers stale claimed jobs whose lease has expired
 */
export function recoverStaleClaimedJobs({ jobs = [], now = new Date() }) {
  const nowIso = now.toISOString();
  let recoveredCount = 0;

  for (const job of jobs) {
    if (job.status === JOB_STATUS.CLAIMED && job.claimExpiresAt && job.claimExpiresAt < nowIso) {
      job.status = JOB_STATUS.RETRY_PENDING;
      job.claimedBy = null;
      job.claimed_by = null;
      job.claimExpiresAt = null;
      job.claim_expires_at = null;
      job.nextEligibleRetryAt = nowIso;
      job.next_eligible_retry_at = nowIso;
      job.updatedAt = nowIso;
      job.updated_at = nowIso;
      recoveredCount++;
    }
  }

  return recoveredCount;
}

/**
 * Processes a single claimed delivery job with an email provider
 */
export async function executeDeliveryJob({
  job,
  emailProvider,
  renderedContent = null,
  now = new Date()
}) {
  if (!job) throw new Error('Job is required');
  const nowIso = now.toISOString();
  job.attemptCount = (job.attemptCount || job.attempt_count || 0) + 1;
  job.attempt_count = job.attemptCount;

  const attemptId = `att_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
  const startTime = Date.now();

  let attemptResult = null;

  // Process based on channel
  if (job.channel === NOTIFICATION_CHANNELS.EMAIL) {
    const toEmail = job.recipientEmail || job.recipient_email;
    if (!toEmail) {
      job.status = JOB_STATUS.FAILED;
      job.lastErrorCode = ERROR_CODES.INVALID_RECIPIENT;
      job.lastErrorMessage = 'No email address on record for user';
      job.updatedAt = nowIso;
      attemptResult = {
        id: attemptId,
        jobId: job.id,
        attemptNumber: job.attemptCount,
        status: 'FAILED',
        provider: 'none',
        errorCode: ERROR_CODES.INVALID_RECIPIENT,
        errorMessage: job.lastErrorMessage,
        durationMs: Date.now() - startTime,
        createdAt: nowIso
      };
      return { job, attempt: attemptResult };
    }

    const emailPayload = renderedContent || {
      subject: job.subject || 'WishMagic Notification',
      html: `<p>${escapeHtml(job.subject || 'WishMagic Notification')}</p>`,
      text: job.subject || 'WishMagic Notification'
    };

    const providerResult = await emailProvider.sendEmail({
      to: toEmail,
      subject: emailPayload.subject,
      html: emailPayload.html,
      text: emailPayload.text,
      idempotencyKey: job.idempotencyKey || job.idempotency_key
    });

    const durationMs = Date.now() - startTime;

    if (providerResult.success) {
      job.status = JOB_STATUS.SENT; // Accepted by provider
      job.providerMessageId = providerResult.providerMessageId;
      job.provider_message_id = providerResult.providerMessageId;
      job.lastErrorCode = null;
      job.lastErrorMessage = null;
      job.updatedAt = nowIso;

      attemptResult = {
        id: attemptId,
        jobId: job.id,
        attemptNumber: job.attemptCount,
        status: 'ACCEPTED',
        provider: emailProvider.constructor.name,
        providerMessageId: providerResult.providerMessageId,
        errorCode: null,
        errorMessage: null,
        durationMs,
        createdAt: nowIso
      };
    } else {
      job.lastErrorCode = providerResult.errorCode;
      job.lastErrorMessage = providerResult.errorMessage;
      job.updatedAt = nowIso;

      const maxAttempts = job.maxAttempts || job.max_attempts || 3;
      const canRetry = providerResult.retryable && job.attemptCount < maxAttempts;

      if (canRetry) {
        job.status = JOB_STATUS.RETRY_PENDING;
        const retryDelayMs = calculateBackoffRetryMs(job.attemptCount);
        job.nextEligibleRetryAt = new Date(now.getTime() + retryDelayMs).toISOString();
        job.next_eligible_retry_at = job.nextEligibleRetryAt;
      } else {
        job.status = JOB_STATUS.FAILED;
      }

      attemptResult = {
        id: attemptId,
        jobId: job.id,
        attemptNumber: job.attemptCount,
        status: providerResult.errorCode === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'FAILED',
        provider: emailProvider.constructor.name,
        errorCode: providerResult.errorCode,
        errorMessage: providerResult.errorMessage,
        durationMs,
        createdAt: nowIso
      };
    }
  } else {
    // In-app job auto-completes as DELIVERED
    job.status = JOB_STATUS.DELIVERED;
    job.updatedAt = nowIso;
    attemptResult = {
      id: attemptId,
      jobId: job.id,
      attemptNumber: 1,
      status: 'DELIVERED',
      provider: 'internal_in_app',
      durationMs: Date.now() - startTime,
      createdAt: nowIso
    };
  }

  // Clear claim lease
  job.claimedBy = null;
  job.claimed_by = null;
  job.claimExpiresAt = null;
  job.claim_expires_at = null;

  return { job, attempt: attemptResult };
}

// ============================================================================
// BUSINESS EVENT NOTIFICATION WORKFLOWS
// ============================================================================

/**
 * Handles Wish Published Event:
 * Verifies publication state -> creates In-App notification -> queues Email delivery job if eligible.
 */
export function handleWishPublishedEvent({
  wish,
  ownerUser,
  preferences,
  appUrl = 'https://wishmagic.live'
}) {
  if (!wish || !wish.id) throw new Error('Valid wish record required');
  if (!ownerUser || !ownerUser.id) throw new Error('Valid ownerUser record required');

  // Verify wish is genuinely published
  if (wish.status !== 'published') {
    throw new Error('Cannot send publication notification for unpublished wish');
  }

  const recipientName = wish.recipientName || wish.recipient_name || 'Someone Special';
  const buyerName = wish.buyerName || wish.buyer_name || ownerUser.displayName || 'Creator';
  const slug = wish.slug || wish.id;

  // 1. In-App Notification
  const inAppEligibility = evaluateNotificationEligibility({
    preferences,
    channel: NOTIFICATION_CHANNELS.IN_APP,
    notificationType: NOTIFICATION_TYPES.WISH_PUBLISHED
  });

  let inAppNotification = null;
  if (inAppEligibility.eligible) {
    inAppNotification = createInAppNotification({
      userId: ownerUser.id,
      type: NOTIFICATION_TYPES.WISH_PUBLISHED,
      title: `Celebration for ${recipientName} is live! 🚀`,
      message: `Your special celebration page is published and ready to share.`,
      relatedType: 'wish',
      relatedId: wish.id,
      actionUrl: `/w/${slug}`,
      icon: 'public',
      severity: 'success',
      metadata: { slug, recipientName }
    });
  }

  // 2. Email Delivery Job
  const emailEligibility = evaluateNotificationEligibility({
    preferences,
    channel: NOTIFICATION_CHANNELS.EMAIL,
    notificationType: NOTIFICATION_TYPES.WISH_PUBLISHED
  });

  let emailJob = null;
  let emailContent = null;
  if (emailEligibility.eligible && ownerUser.email) {
    emailContent = renderWishPublishedEmail({
      recipientName,
      buyerName,
      slug,
      appUrl
    });

    emailJob = createDeliveryJob({
      notificationId: inAppNotification ? inAppNotification.id : null,
      channel: NOTIFICATION_CHANNELS.EMAIL,
      recipientUserId: ownerUser.id,
      recipientEmail: ownerUser.email,
      notificationType: NOTIFICATION_TYPES.WISH_PUBLISHED,
      subject: emailContent.subject,
      idempotencyKey: `publish_${wish.id}_${ownerUser.id}`,
      metadata: { wishId: wish.id, slug }
    });
  }

  return {
    inAppNotification,
    emailJob,
    emailContent
  };
}

// ============================================================================
// SCHEDULED REMINDER ENGINE (IST Date Boundaries & Deduplication)
// ============================================================================

export function evaluateScheduledRemindersForWish({
  wish,
  ownerUser,
  preferences,
  existingReminderKeys = new Set(),
  nowIST = getNowIST()
}) {
  if (!wish || wish.status !== 'published') return [];
  if (!ownerUser || !ownerUser.id) return [];

  const reminders = [];
  const todayISTStr = formatISTDate(nowIST);

  // Authoritative date strings
  const eventDateStr = wish.eventDate || wish.event_date;
  const expiryDateStr = wish.expiryDate || wish.expiry_date;
  const recipientName = wish.recipientName || wish.recipient_name || 'Someone Special';

  // 1. Upcoming Special Date Reminder (24h before event date in IST)
  if (eventDateStr) {
    const dedupKeyUpcoming = `remind_${wish.id}_upcoming_24h_${eventDateStr}`;
    if (!existingReminderKeys.has(dedupKeyUpcoming)) {
      // Check if event date is today or tomorrow in IST
      const [eY, eM, eD] = eventDateStr.split('-').map(Number);
      const eventDateIST = new Date(Date.UTC(eY, eM - 1, eD));
      const todayDateIST = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()));

      const diffDays = Math.round((eventDateIST - todayDateIST) / (24 * 60 * 60 * 1000));

      if (diffDays === 1 || diffDays === 0) {
        const inAppElig = evaluateNotificationEligibility({ preferences, channel: NOTIFICATION_CHANNELS.IN_APP, notificationType: NOTIFICATION_TYPES.UPCOMING_WISH_REMINDER });
        const emailElig = evaluateNotificationEligibility({ preferences, channel: NOTIFICATION_CHANNELS.EMAIL, notificationType: NOTIFICATION_TYPES.UPCOMING_WISH_REMINDER });

        if (inAppElig.eligible || emailElig.eligible) {
          reminders.push({
            type: NOTIFICATION_TYPES.UPCOMING_WISH_REMINDER,
            wishId: wish.id,
            recipientUserId: ownerUser.id,
            recipientEmail: ownerUser.email,
            dedupKey: dedupKeyUpcoming,
            scheduledFor: todayISTStr,
            inApp: inAppElig.eligible,
            email: emailElig.eligible,
            title: `Reminder: ${recipientName}'s celebration is coming up! 📅`,
            message: `Celebration is scheduled for ${eventDateStr}. Share the link with friends and family!`
          });
        }
      }
    }
  }

  // 2. Expiry Reminder (24h before expiry date in IST)
  if (expiryDateStr) {
    const dedupKeyExpiry = `remind_${wish.id}_expiry_24h_${expiryDateStr}`;
    if (!existingReminderKeys.has(dedupKeyExpiry)) {
      const [expY, expM, expD] = expiryDateStr.split('-').map(Number);
      const expDateIST = new Date(Date.UTC(expY, expM - 1, expD));
      const todayDateIST = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()));

      const diffDays = Math.round((expDateIST - todayDateIST) / (24 * 60 * 60 * 1000));

      if (diffDays === 1) {
        const inAppElig = evaluateNotificationEligibility({ preferences, channel: NOTIFICATION_CHANNELS.IN_APP, notificationType: NOTIFICATION_TYPES.WISH_EXPIRING_SOON });
        const emailElig = evaluateNotificationEligibility({ preferences, channel: NOTIFICATION_CHANNELS.EMAIL, notificationType: NOTIFICATION_TYPES.WISH_EXPIRING_SOON });

        if (inAppElig.eligible || emailElig.eligible) {
          reminders.push({
            type: NOTIFICATION_TYPES.WISH_EXPIRING_SOON,
            wishId: wish.id,
            recipientUserId: ownerUser.id,
            recipientEmail: ownerUser.email,
            dedupKey: dedupKeyExpiry,
            scheduledFor: todayISTStr,
            inApp: inAppElig.eligible,
            email: emailElig.eligible,
            title: `Celebration for ${recipientName} expires soon (7-day window) ⏳`,
            message: `Viewing window concludes on ${expiryDateStr} at 23:59:59 IST.`
          });
        }
      }
    }
  }

  return reminders;
}

// ============================================================================
// ENTERPRISE ANNOUNCEMENTS
// ============================================================================

export function createAnnouncementDraft({
  internalTitle,
  title,
  message,
  channels = [NOTIFICATION_CHANNELS.IN_APP],
  targetAudience = ANNOUNCEMENT_AUDIENCE.ALL_ACTIVE,
  creatorUser
}) {
  if (!internalTitle || !title || !message) {
    throw new Error('Internal title, user-facing title, and message are required');
  }
  if (!creatorUser || !creatorUser.id) {
    throw new Error('Authorized creator user required');
  }

  const id = `ann_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
  const now = new Date().toISOString();

  return {
    id,
    internalTitle: internalTitle.trim(),
    internal_title: internalTitle.trim(),
    title: title.trim(),
    message: message.trim(),
    channels: Array.isArray(channels) ? channels : [NOTIFICATION_CHANNELS.IN_APP],
    targetAudience,
    target_audience: targetAudience,
    status: ANNOUNCEMENT_STATUS.DRAFT,
    scheduledAt: null,
    scheduled_at: null,
    publishedAt: null,
    published_at: null,
    archivedAt: null,
    archived_at: null,
    creatorId: creatorUser.id,
    creator_id: creatorUser.id,
    totalRecipients: 0,
    total_recipients: 0,
    deliveredCount: 0,
    delivered_count: 0,
    failedCount: 0,
    failed_count: 0,
    createdAt: now,
    created_at: now,
    updatedAt: now,
    updated_at: now
  };
}

export function publishAnnouncement({
  announcement,
  allUsers = [],
  preferencesMap = {},
  actorUser
}) {
  if (!announcement) throw new Error('Announcement required');
  if (announcement.status === ANNOUNCEMENT_STATUS.PUBLISHED) {
    throw new Error('Announcement is already published (duplicate publish blocked)');
  }
  if (announcement.status === ANNOUNCEMENT_STATUS.ARCHIVED) {
    throw new Error('Archived announcements cannot be published');
  }

  const now = new Date().toISOString();
  announcement.status = ANNOUNCEMENT_STATUS.PUBLISHED;
  announcement.publishedAt = now;
  announcement.published_at = now;
  announcement.updatedAt = now;
  announcement.updated_at = now;

  // Filter target audience
  let targetUsers = allUsers.filter(u => u.status !== 'banned' && u.status !== 'suspended' && u.status !== 'deactivated');
  if (announcement.targetAudience === ANNOUNCEMENT_AUDIENCE.VIP_ONLY) {
    targetUsers = targetUsers.filter(u => u.isPremium || u.is_premium || u.plan === 'VIP');
  } else if (announcement.targetAudience === ANNOUNCEMENT_AUDIENCE.FREE_ONLY) {
    targetUsers = targetUsers.filter(u => !u.isPremium && !u.is_premium && u.plan !== 'VIP');
  }

  announcement.totalRecipients = targetUsers.length;
  announcement.total_recipients = targetUsers.length;

  const generatedInApp = [];
  const generatedJobs = [];

  const deliversInApp = announcement.channels.includes(NOTIFICATION_CHANNELS.IN_APP);
  const deliversEmail = announcement.channels.includes(NOTIFICATION_CHANNELS.EMAIL);

  for (const user of targetUsers) {
    const userPrefs = preferencesMap[user.id] || DEFAULT_NOTIFICATION_PREFERENCES;

    // In-App
    if (deliversInApp) {
      const inAppElig = evaluateNotificationEligibility({
        preferences: userPrefs,
        channel: NOTIFICATION_CHANNELS.IN_APP,
        notificationType: NOTIFICATION_TYPES.ADMIN_ANNOUNCEMENT
      });
      if (inAppElig.eligible) {
        generatedInApp.push(createInAppNotification({
          userId: user.id,
          type: NOTIFICATION_TYPES.ADMIN_ANNOUNCEMENT,
          title: announcement.title,
          message: announcement.message,
          relatedType: 'announcement',
          relatedId: announcement.id,
          actionUrl: null,
          icon: 'campaign',
          severity: 'info'
        }));
      }
    }

    // Email
    if (deliversEmail && user.email) {
      const emailElig = evaluateNotificationEligibility({
        preferences: userPrefs,
        channel: NOTIFICATION_CHANNELS.EMAIL,
        notificationType: NOTIFICATION_TYPES.ADMIN_ANNOUNCEMENT
      });
      if (emailElig.eligible) {
        const emailContent = renderAnnouncementEmail({
          recipientName: user.displayName || user.name || 'Creator',
          title: announcement.title,
          message: announcement.message
        });

        generatedJobs.push(createDeliveryJob({
          notificationId: null,
          channel: NOTIFICATION_CHANNELS.EMAIL,
          recipientUserId: user.id,
          recipientEmail: user.email,
          notificationType: NOTIFICATION_TYPES.ADMIN_ANNOUNCEMENT,
          subject: emailContent.subject,
          idempotencyKey: `ann_${announcement.id}_${user.id}`,
          metadata: { announcementId: announcement.id }
        }));
      }
    }
  }

  const auditLog = {
    id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`,
    actorId: actorUser ? actorUser.id : 'admin',
    actorName: actorUser ? (actorUser.displayName || actorUser.name || 'Admin') : 'Admin',
    actorRole: actorUser ? (actorUser.role || 'admin') : 'admin',
    action: 'ANNOUNCEMENT_PUBLISHED',
    targetType: 'announcement',
    targetId: announcement.id,
    details: {
      title: announcement.title,
      targetAudience: announcement.targetAudience,
      totalRecipients: announcement.totalRecipients,
      inAppCount: generatedInApp.length,
      emailJobsCount: generatedJobs.length
    },
    createdAt: now
  };

  return {
    announcement,
    generatedInApp,
    generatedJobs,
    auditLog
  };
}
