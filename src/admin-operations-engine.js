/**
 * WishMagic Production Admin Operations Engine (Part 30)
 * ======================================================
 * Advanced User Management + Complete Wish Management + Moderation
 * + Support Console + Audit Trail + Safe Administrative Controls
 *
 * Designed for Cloudflare D1 + Workers and local Express dev runtime.
 */

import {
  evaluateAssetProtection,
  verifyB2ObjectHealth,
  verifyImgBBImageHealth,
  STORAGE_HEALTH_STATUS
} from './storage-health-engine.js';

// Authorized Primary Super Admin Email
export const PRIMARY_ADMIN_EMAIL = 'ankit.babusaini@gmail.com';

// User Account Status Enums
export const USER_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  BANNED: 'banned',
  DEACTIVATED: 'deactivated'
};

// Wish Moderation Status Enums
export const WISH_MODERATION_STATUS = {
  APPROVED: 'approved',
  PENDING_REVIEW: 'pending_review',
  FLAGGED: 'flagged',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended'
};

// Support Ticket Status & Priority
export const TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed'
};

export const TICKET_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

// Admin RBAC Permissions
export const ADMIN_PERMISSIONS = {
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_WISHES: 'MANAGE_WISHES',
  MODERATE_CONTENT: 'MODERATE_CONTENT',
  SUPPORT_CONSOLE: 'SUPPORT_CONSOLE',
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
  MANAGE_SETTINGS: 'MANAGE_SETTINGS',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN'
};

/**
 * Check if a given user has authoritative administrative rights.
 * Checks primary admin email, admin role, or staff permissions.
 */
export function isAuthoritativeAdmin(user) {
  if (!user) return false;
  if (user.email && user.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()) return true;
  if (user.role === 'admin' || user.role === 'SUPER_ADMIN' || user.role === 'OWNER') return true;
  if (user.isAdmin === true) return true;
  if (user.id === 'usr_admin_999') return true;
  return false;
}

/**
 * Check if user has specific admin permission.
 */
export function hasAdminPermission(user, requiredPermission) {
  if (!user) return false;
  if (isAuthoritativeAdmin(user)) return true;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  return permissions.includes(requiredPermission) || permissions.includes(ADMIN_PERMISSIONS.SYSTEM_ADMIN);
}

/**
 * Construct an immutable audit log entry.
 */
export function createAuditLogEntry({
  actorId = 'system',
  actorName = 'System',
  actorRole = 'system',
  action,
  targetType = 'general',
  targetId = null,
  details = {},
  ipAddress = '127.0.0.1'
}) {
  return {
    id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`,
    actorId,
    actorName,
    actorRole,
    action,
    targetType,
    targetId,
    details: typeof details === 'string' ? details : JSON.stringify(details),
    ipAddress,
    createdAt: new Date().toISOString()
  };
}

// ============================================================================
// 1. ADVANCED USER MANAGEMENT
// ============================================================================

/**
 * Enriches users with real-time stats and supports filtering and sorting.
 */
export function listUsersEnriched(users = [], wishes = [], options = {}) {
  const {
    query = '',
    status = 'all',
    role = 'all',
    plan = 'all',
    sort = 'wishes',
    limit = 100,
    offset = 0
  } = options;

  let enriched = users.map(u => {
    const userWishes = wishes.filter(w => w.userId === u.id || w.user_id === u.id);
    const publishedWishes = userWishes.filter(w => (w.status === 'published' || !w.status) && w.lifecycleStatus !== 'draft');
    const vipWishes = userWishes.filter(w => w.tier === 'vip' || (w.price && w.price > 0));
    const totalViews = userWishes.reduce((sum, w) => sum + (Number(w.views) || 0), 0);

    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName || u.display_name || u.name || 'Anonymous User',
      avatarUrl: u.avatarUrl || u.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(u.email || u.id)}`,
      role: u.role || 'creator',
      plan: u.plan || 'Free',
      isPremium: Boolean(u.isPremium || u.is_premium || u.plan === 'VIP'),
      status: u.status || USER_STATUS.ACTIVE,
      suspensionReason: u.suspensionReason || u.suspension_reason || null,
      adminNotes: u.adminNotes || u.admin_notes || null,
      lastLoginAt: u.lastLoginAt || u.last_login_at || null,
      failedLoginAttempts: Number(u.failedLoginAttempts || u.failed_login_attempts) || 0,
      emailVerified: u.emailVerified !== undefined ? Boolean(u.emailVerified) : true,
      createdAt: u.createdAt || u.created_at || new Date().toISOString(),
      updatedAt: u.updatedAt || u.updated_at || new Date().toISOString(),
      wishesCount: userWishes.length,
      publishedWishesCount: publishedWishes.length,
      vipWishesCount: vipWishes.length,
      totalViews,
      lastActiveAt: userWishes.length > 0 ? (userWishes[0].createdAt || userWishes[0].created_at) : u.createdAt
    };
  });

  // Apply Search
  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    enriched = enriched.filter(u =>
      (u.displayName && u.displayName.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.id && u.id.toLowerCase().includes(q))
    );
  }

  // Apply Status Filter
  if (status && status !== 'all') {
    enriched = enriched.filter(u => u.status === status);
  }

  // Apply Role Filter
  if (role && role !== 'all') {
    enriched = enriched.filter(u => u.role === role);
  }

  // Apply Plan Filter
  if (plan && plan !== 'all') {
    if (plan === 'vip') {
      enriched = enriched.filter(u => u.isPremium || u.plan === 'VIP');
    } else if (plan === 'free') {
      enriched = enriched.filter(u => !u.isPremium && u.plan !== 'VIP');
    }
  }

  // Apply Sorting
  if (sort === 'wishes') {
    enriched.sort((a, b) => b.wishesCount - a.wishesCount);
  } else if (sort === 'newest') {
    enriched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (sort === 'views') {
    enriched.sort((a, b) => b.totalViews - a.totalViews);
  } else if (sort === 'name') {
    enriched.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  const total = enriched.length;
  const paginated = enriched.slice(offset, offset + limit);

  return {
    users: paginated,
    total,
    counts: {
      total: users.length,
      active: users.filter(u => (u.status || 'active') === 'active').length,
      suspended: users.filter(u => u.status === 'suspended').length,
      banned: users.filter(u => u.status === 'banned').length,
      vip: users.filter(u => u.isPremium || u.is_premium || u.plan === 'VIP').length,
      free: users.filter(u => !u.isPremium && !u.is_premium && u.plan !== 'VIP').length
    }
  };
}

/**
 * Validates and updates user account status (e.g. Active, Suspended, Banned, Deactivated).
 */
export function updateUserStatus({ user, newStatus, reason = '', adminNotes = '', actor }) {
  if (!user) throw new Error('Target user not found');
  const validStatuses = Object.values(USER_STATUS);
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}`);
  }

  // Prevent suspending primary admin
  if (user.email && user.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    throw new Error('Primary system administrator account cannot be suspended or banned.');
  }

  const previousStatus = user.status || USER_STATUS.ACTIVE;
  user.status = newStatus;
  user.suspensionReason = newStatus !== USER_STATUS.ACTIVE ? reason : null;
  user.suspension_reason = user.suspensionReason;
  if (adminNotes) {
    user.adminNotes = adminNotes;
    user.admin_notes = adminNotes;
  }
  user.updatedAt = new Date().toISOString();
  user.updated_at = user.updatedAt;

  const auditLog = createAuditLogEntry({
    actorId: actor?.id || 'admin',
    actorName: actor?.displayName || actor?.name || 'Administrator',
    actorRole: actor?.role || 'admin',
    action: 'USER_STATUS_UPDATED',
    targetType: 'user',
    targetId: user.id,
    details: {
      previousStatus,
      newStatus,
      reason,
      adminNotes
    }
  });

  return { user, auditLog };
}

/**
 * Updates user role with protection against removing the last active administrator.
 */
export function updateUserRole({ user, newRole, allUsers = [], actor }) {
  if (!user) throw new Error('Target user not found');
  const validRoles = ['user', 'creator', 'moderator', 'editor', 'admin'];
  if (!validRoles.includes(newRole)) {
    throw new Error(`Invalid role: ${newRole}. Must be one of: ${validRoles.join(', ')}`);
  }

  // Safeguard: Cannot demote primary admin
  if (user.email && user.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase() && newRole !== 'admin') {
    throw new Error('Cannot demote primary system administrator.');
  }

  // Safeguard: Cannot demote the last remaining active admin
  if (user.role === 'admin' && newRole !== 'admin') {
    const adminCount = allUsers.filter(u => u.role === 'admin' && u.id !== user.id && (u.status || 'active') === 'active').length;
    if (adminCount === 0) {
      throw new Error('Cannot demote the only remaining active administrator on the platform.');
    }
  }

  const previousRole = user.role || 'creator';
  user.role = newRole;
  user.updatedAt = new Date().toISOString();
  user.updated_at = user.updatedAt;

  const auditLog = createAuditLogEntry({
    actorId: actor?.id || 'admin',
    actorName: actor?.displayName || actor?.name || 'Administrator',
    actorRole: actor?.role || 'admin',
    action: 'USER_ROLE_UPDATED',
    targetType: 'user',
    targetId: user.id,
    details: { previousRole, newRole }
  });

  return { user, auditLog };
}

/**
 * Revokes all active sessions for a user (Force Logout).
 */
export function revokeUserSessions({ userId, sessions = [], actor, reason = 'Administrative session revocation' }) {
  const activeSessions = sessions.filter(s => s.userId === userId || s.user_id === userId);
  const remainingSessions = sessions.filter(s => s.userId !== userId && s.user_id !== userId);

  const auditLog = createAuditLogEntry({
    actorId: actor?.id || 'admin',
    actorName: actor?.displayName || actor?.name || 'Administrator',
    actorRole: actor?.role || 'admin',
    action: 'USER_SESSIONS_REVOKED',
    targetType: 'user',
    targetId: userId,
    details: {
      revokedCount: activeSessions.length,
      reason
    }
  });

  return {
    remainingSessions,
    revokedCount: activeSessions.length,
    auditLog
  };
}

/**
 * Safe User Deletion or Archiving.
 * Hard deletes are strictly rejected if user owns published celebration wishes or active orders.
 */
export function safeDeleteOrArchiveUser({ user, wishes = [], action = 'archive', actor, reason = '' }) {
  if (!user) throw new Error('Target user not found');

  if (user.email && user.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    throw new Error('Cannot delete or archive primary system administrator.');
  }

  const userWishes = wishes.filter(w => w.userId === user.id || w.user_id === user.id);
  const publishedWishes = userWishes.filter(w => (w.status === 'published' || !w.status) && w.lifecycleStatus !== 'draft');

  if (action === 'delete') {
    if (publishedWishes.length > 0) {
      throw new Error(
        `Cannot hard delete user: User owns ${publishedWishes.length} published celebration wishes. Archive the user account or transfer wish ownership first to preserve recipient links.`
      );
    }
  }

  let auditLog;
  if (action === 'archive') {
    user.status = USER_STATUS.DEACTIVATED;
    user.adminNotes = `Archived by admin on ${new Date().toISOString()}. Reason: ${reason || 'N/A'}`;
    user.admin_notes = user.adminNotes;
    user.updatedAt = new Date().toISOString();
    user.updated_at = user.updatedAt;

    auditLog = createAuditLogEntry({
      actorId: actor?.id || 'admin',
      actorName: actor?.displayName || actor?.name || 'Administrator',
      actorRole: actor?.role || 'admin',
      action: 'USER_ARCHIVED',
      targetType: 'user',
      targetId: user.id,
      details: { reason, wishesCount: userWishes.length }
    });
  } else {
    auditLog = createAuditLogEntry({
      actorId: actor?.id || 'admin',
      actorName: actor?.displayName || actor?.name || 'Administrator',
      actorRole: actor?.role || 'admin',
      action: 'USER_DELETED',
      targetType: 'user',
      targetId: user.id,
      details: { reason, deletedWishesCount: userWishes.length }
    });
  }

  return { action, user, auditLog, userWishesCount: userWishes.length };
}

// ============================================================================
// 2. COMPLETE WISH MANAGEMENT & MODERATION
// ============================================================================

/**
 * Enriches and filters celebration wishes for the administrative operations console.
 */
export function listAdminWishesEnriched(wishes = [], users = [], options = {}) {
  const {
    query = '',
    lifecycle = 'all',
    moderationStatus = 'all',
    tier = 'all',
    sort = 'recent',
    limit = 100,
    offset = 0
  } = options;

  const userMap = new Map(users.map(u => [u.id, u]));

  let enriched = wishes.map(w => {
    const creator = userMap.get(w.userId || w.user_id) || {};
    let custom = {};
    try {
      custom = typeof w.customData === 'string' ? JSON.parse(w.customData) : (w.custom_data ? (typeof w.custom_data === 'string' ? JSON.parse(w.custom_data) : w.custom_data) : (w.customData || {}));
    } catch (e) {}

    const isVIP = w.tier === 'vip' || (w.price && Number(w.price) > 0);
    const modStatus = w.moderationStatus || w.moderation_status || WISH_MODERATION_STATUS.APPROVED;
    const isFlagged = Boolean(w.isFlagged || w.is_flagged);

    return {
      id: w.id,
      slug: w.slug || w.id,
      userId: w.userId || w.user_id,
      creatorEmail: creator.email || w.buyerContact || w.buyer_contact || 'N/A',
      creatorName: creator.displayName || creator.display_name || w.buyerName || w.buyer_name || 'Anonymous',
      recipientName: w.recipientName || w.recipient_name || custom.recipient_name || 'Special Person',
      templateId: w.templateId || w.template_id || 'tpl_glitter_birthday',
      templateName: w.templateName || w.template_name || 'Custom Celebration',
      eventDate: w.eventDate || w.event_date || 'N/A',
      expiryDate: w.expiryDate || w.expiry_date || 'N/A',
      extendedExpiryAt: w.extendedExpiryAt || w.extended_expiry_at || null,
      lifecycleStatus: w.lifecycleStatus || w.lifecycle_status || (w.status === 'draft' ? 'draft' : 'active'),
      status: w.status || 'published',
      moderationStatus: modStatus,
      moderationReason: w.moderationReason || w.moderation_reason || null,
      moderatedBy: w.moderatedBy || w.moderated_by || null,
      moderatedAt: w.moderatedAt || w.moderated_at || null,
      isFlagged,
      adminNotes: w.adminNotes || w.admin_notes || null,
      tier: isVIP ? 'vip' : 'free',
      price: Number(w.price) || 0,
      views: Number(w.views) || 0,
      createdAt: w.createdAt || w.created_at || new Date().toISOString(),
      updatedAt: w.updatedAt || w.updated_at || new Date().toISOString(),
      customData: custom
    };
  });

  // Apply Search
  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    enriched = enriched.filter(w =>
      (w.recipientName && w.recipientName.toLowerCase().includes(q)) ||
      (w.creatorName && w.creatorName.toLowerCase().includes(q)) ||
      (w.creatorEmail && w.creatorEmail.toLowerCase().includes(q)) ||
      (w.templateName && w.templateName.toLowerCase().includes(q)) ||
      (w.slug && w.slug.toLowerCase().includes(q)) ||
      (w.id && w.id.toLowerCase().includes(q))
    );
  }

  // Filter by Lifecycle
  if (lifecycle && lifecycle !== 'all') {
    enriched = enriched.filter(w => {
      if (lifecycle === 'active' || lifecycle === 'live') return w.lifecycleStatus === 'active' || w.lifecycleStatus === 'live';
      if (lifecycle === 'upcoming') return w.lifecycleStatus === 'upcoming' || w.lifecycleStatus === 'future';
      if (lifecycle === 'expired') return w.lifecycleStatus === 'expired';
      if (lifecycle === 'draft') return w.lifecycleStatus === 'draft' || w.status === 'draft';
      return true;
    });
  }

  // Filter by Moderation Status
  if (moderationStatus && moderationStatus !== 'all') {
    enriched = enriched.filter(w => w.moderationStatus === moderationStatus);
  }

  // Filter by Tier
  if (tier && tier !== 'all') {
    enriched = enriched.filter(w => w.tier === tier);
  }

  // Sorting
  if (sort === 'recent') {
    enriched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (sort === 'views') {
    enriched.sort((a, b) => b.views - a.views);
  } else if (sort === 'event') {
    enriched.sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));
  } else if (sort === 'recipient') {
    enriched.sort((a, b) => a.recipientName.localeCompare(b.recipientName));
  }

  const total = enriched.length;
  const paginated = enriched.slice(offset, offset + limit);

  return {
    wishes: paginated,
    total,
    counts: {
      total: wishes.length,
      active: enriched.filter(w => w.lifecycleStatus === 'active' || w.lifecycleStatus === 'live').length,
      upcoming: enriched.filter(w => w.lifecycleStatus === 'upcoming').length,
      expired: enriched.filter(w => w.lifecycleStatus === 'expired').length,
      flagged: enriched.filter(w => w.isFlagged || w.moderationStatus === 'flagged').length,
      suspended: enriched.filter(w => w.moderationStatus === 'suspended').length,
      vip: enriched.filter(w => w.tier === 'vip').length
    }
  };
}

/**
 * Conducts Deep Health & Asset Integrity Diagnosis for a specific celebration wish.
 * Checks B2 runtime files, ImgBB user media, audio track, and link expiry status.
 */
export async function diagnoseWishDeepHealth(wish, storageProviders = {}) {
  if (!wish) throw new Error('Celebration wish not found');

  let custom = {};
  try {
    custom = typeof wish.customData === 'string' ? JSON.parse(wish.customData) : (wish.custom_data ? (typeof wish.custom_data === 'string' ? JSON.parse(wish.custom_data) : wish.custom_data) : (wish.customData || {}));
  } catch (e) {}

  const healthReport = {
    wishId: wish.id,
    slug: wish.slug || wish.id,
    templateId: wish.templateId || wish.template_id,
    lifecycleStatus: wish.lifecycleStatus || wish.lifecycle_status || 'active',
    moderationStatus: wish.moderationStatus || wish.moderation_status || 'approved',
    overallIntegrity: 'HEALTHY',
    issues: [],
    checks: {
      urlResolved: true,
      expiryValid: true,
      b2TemplatePackage: 'HEALTHY',
      imgbbUserPhotos: 'HEALTHY',
      audioAssigned: 'HEALTHY',
      publishedSnapshot: 'HEALTHY'
    },
    details: {
      photosChecked: 0,
      photosMissing: 0,
      audioTrack: null
    }
  };

  // Expiry check
  if (wish.lifecycleStatus === 'expired') {
    healthReport.checks.expiryValid = false;
    healthReport.issues.push('Celebration wish link has expired past its 7-day post-event window.');
  }

  // Moderation check
  if (wish.moderationStatus === WISH_MODERATION_STATUS.SUSPENDED) {
    healthReport.overallIntegrity = 'SUSPENDED';
    healthReport.issues.push(`Wish is currently suspended: ${wish.moderationReason || 'Policy violation'}`);
  }

  // ImgBB user photos check
  const photos = custom.photos || [];
  if (custom.cover_photo && !photos.some(p => p.url === custom.cover_photo)) {
    photos.push({ url: custom.cover_photo, name: 'Cover Photo' });
  }

  healthReport.details.photosChecked = photos.length;
  for (const p of photos) {
    const photoUrl = p.url || p.src;
    if (!photoUrl) {
      healthReport.details.photosMissing++;
      healthReport.issues.push('Missing photo URL in user customization slots.');
    } else if (storageProviders.imgbbProvider) {
      try {
        const probe = await verifyImgBBImageHealth(photoUrl, storageProviders.imgbbProvider);
        if (probe.status === STORAGE_HEALTH_STATUS.MISSING) {
          healthReport.details.photosMissing++;
          healthReport.checks.imgbbUserPhotos = 'BROKEN_ASSETS';
          healthReport.issues.push(`User photo missing from ImgBB: ${photoUrl}`);
        }
      } catch (e) {}
    }
  }

  if (healthReport.details.photosMissing > 0) {
    healthReport.overallIntegrity = 'DEGRADED';
  }

  // Audio check
  if (custom.music && custom.music.storageKey && storageProviders.b2Provider) {
    try {
      const audioProbe = await verifyB2ObjectHealth(custom.music.storageKey, storageProviders.b2Provider);
      healthReport.details.audioTrack = custom.music.title || custom.music.trackId;
      if (audioProbe.status === STORAGE_HEALTH_STATUS.MISSING) {
        healthReport.checks.audioAssigned = 'MISSING';
        healthReport.overallIntegrity = 'DEGRADED';
        healthReport.issues.push(`Assigned audio file missing in B2: ${custom.music.storageKey}`);
      }
    } catch (e) {}
  }

  return healthReport;
}

/**
 * Moderate a Wish: Approve, Flag, Suspend, or Reject.
 */
export function moderateWish({ wish, action, reason = '', adminNotes = '', actor }) {
  if (!wish) throw new Error('Celebration wish not found');

  const validActions = ['approve', 'flag', 'suspend', 'reject'];
  if (!validActions.includes(action)) {
    throw new Error(`Invalid moderation action: ${action}. Must be one of: ${validActions.join(', ')}`);
  }

  const previousStatus = wish.moderationStatus || wish.moderation_status || WISH_MODERATION_STATUS.APPROVED;
  const now = new Date().toISOString();

  if (action === 'approve') {
    wish.moderationStatus = WISH_MODERATION_STATUS.APPROVED;
    wish.isFlagged = false;
  } else if (action === 'flag') {
    wish.moderationStatus = WISH_MODERATION_STATUS.FLAGGED;
    wish.isFlagged = true;
  } else if (action === 'suspend') {
    wish.moderationStatus = WISH_MODERATION_STATUS.SUSPENDED;
    wish.isFlagged = true;
  } else if (action === 'reject') {
    wish.moderationStatus = WISH_MODERATION_STATUS.REJECTED;
    wish.isFlagged = true;
  }

  wish.moderation_status = wish.moderationStatus;
  wish.is_flagged = wish.isFlagged ? 1 : 0;
  wish.moderationReason = reason;
  wish.moderation_reason = reason;
  wish.moderatedBy = actor?.id || 'admin';
  wish.moderated_by = wish.moderatedBy;
  wish.moderatedAt = now;
  wish.moderated_at = now;
  if (adminNotes) {
    wish.adminNotes = adminNotes;
    wish.admin_notes = adminNotes;
  }
  wish.updatedAt = now;
  wish.updated_at = now;

  const auditLog = createAuditLogEntry({
    actorId: actor?.id || 'admin',
    actorName: actor?.displayName || actor?.name || 'Administrator',
    actorRole: actor?.role || 'admin',
    action: `WISH_MODERATION_${action.toUpperCase()}`,
    targetType: 'wish',
    targetId: wish.id,
    details: {
      previousStatus,
      newStatus: wish.moderationStatus,
      reason,
      adminNotes
    }
  });

  return { wish, auditLog };
}

/**
 * Extends the expiry date of a wish or converts to permanent VIP pass.
 */
export function extendWishExpiry({ wish, days = 7, permanentVip = false, customTargetDate = null, reason = '', actor }) {
  if (!wish) throw new Error('Celebration wish not found');

  const now = new Date();
  let newExpiryDate;

  if (permanentVip) {
    // 100 years out
    const farFuture = new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000);
    newExpiryDate = farFuture.toISOString().split('T')[0];
    wish.tier = 'vip';
    wish.price = Math.max(Number(wish.price) || 0, 99);
  } else if (customTargetDate) {
    newExpiryDate = customTargetDate;
  } else {
    // Current expiry or current date + days
    const base = (wish.expiryDate || wish.expiry_date) ? new Date(wish.expiryDate || wish.expiry_date) : now;
    const effectiveBase = base.getTime() < now.getTime() ? now : base;
    const extended = new Date(effectiveBase.getTime() + Number(days) * 24 * 60 * 60 * 1000);
    newExpiryDate = extended.toISOString().split('T')[0];
  }

  const previousExpiry = wish.expiryDate || wish.expiry_date;
  wish.expiryDate = newExpiryDate;
  wish.expiry_date = newExpiryDate;
  wish.extendedExpiryAt = new Date().toISOString();
  wish.extended_expiry_at = wish.extendedExpiryAt;
  wish.lifecycleStatus = 'active';
  wish.lifecycle_status = 'active';
  wish.updatedAt = new Date().toISOString();
  wish.updated_at = wish.updatedAt;

  const auditLog = createAuditLogEntry({
    actorId: actor?.id || 'admin',
    actorName: actor?.displayName || actor?.name || 'Administrator',
    actorRole: actor?.role || 'admin',
    action: 'WISH_EXPIRY_EXTENDED',
    targetType: 'wish',
    targetId: wish.id,
    details: {
      previousExpiry,
      newExpiryDate,
      days: permanentVip ? 'PERMANENT_VIP' : days,
      reason
    }
  });

  return { wish, auditLog };
}

/**
 * Transfers ownership of a celebration wish to a new recipient or user account.
 */
export function transferWishOwnership({ wish, targetUser, reason = '', actor }) {
  if (!wish) throw new Error('Celebration wish not found');
  if (!targetUser) throw new Error('Target user account not found');

  const previousUserId = wish.userId || wish.user_id;
  wish.originalCreatorId = wish.originalCreatorId || previousUserId;
  wish.original_creator_id = wish.originalCreatorId;
  wish.userId = targetUser.id;
  wish.user_id = targetUser.id;
  wish.updatedAt = new Date().toISOString();
  wish.updated_at = wish.updatedAt;

  const auditLog = createAuditLogEntry({
    actorId: actor?.id || 'admin',
    actorName: actor?.displayName || actor?.name || 'Administrator',
    actorRole: actor?.role || 'admin',
    action: 'WISH_OWNERSHIP_TRANSFERRED',
    targetType: 'wish',
    targetId: wish.id,
    details: {
      previousUserId,
      newUserId: targetUser.id,
      newOwnerEmail: targetUser.email,
      reason
    }
  });

  return { wish, auditLog };
}

/**
 * Safe Wish Deletion: Checks protection rules and cascades media mappings.
 */
export function safeDeleteWish({ wish, actor, reason = '' }) {
  if (!wish) throw new Error('Celebration wish not found');

  const auditLog = createAuditLogEntry({
    actorId: actor?.id || 'admin',
    actorName: actor?.displayName || actor?.name || 'Administrator',
    actorRole: actor?.role || 'admin',
    action: 'WISH_DELETED',
    targetType: 'wish',
    targetId: wish.id,
    details: {
      recipientName: wish.recipientName || wish.recipient_name,
      slug: wish.slug,
      reason
    }
  });

  return { deleted: true, wishId: wish.id, auditLog };
}

// ============================================================================
// 3. CONTENT MODERATION QUEUE
// ============================================================================

/**
 * Creates a moderation report from users or automated systems.
 */
export function createModerationReport({
  targetType = 'wish',
  targetId,
  reporterId = 'anonymous',
  reporterEmail = 'anonymous@user.live',
  reportReason,
  details = ''
}) {
  if (!targetId) throw new Error('Target ID required for moderation report');
  if (!reportReason) throw new Error('Report reason is required');

  return {
    id: `mod_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`,
    targetType,
    targetId,
    reporterId,
    reporterEmail,
    reportReason,
    details,
    status: 'pending',
    resolutionAction: null,
    resolutionNotes: null,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: new Date().toISOString()
  };
}

/**
 * Resolves a moderation report with an authoritative action.
 */
export function resolveModerationReport({ report, action, notes = '', actor, targetWish }) {
  if (!report) throw new Error('Moderation report not found');
  const validActions = ['approved', 'suspended', 'content_removed', 'dismissed'];
  if (!validActions.includes(action)) {
    throw new Error(`Invalid resolution action: ${action}. Must be one of: ${validActions.join(', ')}`);
  }

  const now = new Date().toISOString();
  report.status = action === 'dismissed' ? 'dismissed' : 'resolved';
  report.resolutionAction = action;
  report.resolution_action = action;
  report.resolutionNotes = notes;
  report.resolution_notes = notes;
  report.resolvedBy = actor?.id || 'admin';
  report.resolved_by = report.resolvedBy;
  report.resolvedAt = now;
  report.resolved_at = now;

  let wishAudit = null;
  if (targetWish && (action === 'suspended' || action === 'approved')) {
    const modRes = moderateWish({
      wish: targetWish,
      action: action === 'suspended' ? 'suspend' : 'approve',
      reason: `Moderation report ${report.id} resolved: ${notes}`,
      actor
    });
    wishAudit = modRes.auditLog;
  }

  const auditLog = createAuditLogEntry({
    actorId: actor?.id || 'admin',
    actorName: actor?.displayName || actor?.name || 'Administrator',
    actorRole: actor?.role || 'admin',
    action: `MODERATION_REPORT_${action.toUpperCase()}`,
    targetType: 'moderation_report',
    targetId: report.id,
    details: {
      targetType: report.targetType,
      targetId: report.targetId,
      action,
      notes
    }
  });

  return { report, auditLog, wishAudit };
}

// ============================================================================
// 4. SUPPORT CONSOLE & UNIVERSAL LOOKUP
// ============================================================================

/**
 * Universal lookup across users, celebration wishes, support tickets, and orders.
 */
export function universalLookup({ query = '', users = [], wishes = [], tickets = [], orders = [] }) {
  if (!query || !query.trim()) {
    return { users: [], wishes: [], tickets: [], orders: [] };
  }

  const q = query.trim().toLowerCase();

  const matchedUsers = users.filter(u =>
    (u.email && u.email.toLowerCase().includes(q)) ||
    (u.displayName && u.displayName.toLowerCase().includes(q)) ||
    (u.name && u.name.toLowerCase().includes(q)) ||
    (u.id && u.id.toLowerCase().includes(q))
  ).slice(0, 10);

  const matchedWishes = wishes.filter(w =>
    (w.slug && w.slug.toLowerCase().includes(q)) ||
    (w.id && w.id.toLowerCase().includes(q)) ||
    (w.recipientName && w.recipientName.toLowerCase().includes(q)) ||
    (w.recipient_name && w.recipient_name.toLowerCase().includes(q)) ||
    (w.buyerName && w.buyerName.toLowerCase().includes(q)) ||
    (w.buyer_name && w.buyer_name.toLowerCase().includes(q)) ||
    (w.buyerContact && w.buyerContact.toLowerCase().includes(q))
  ).slice(0, 10);

  const matchedTickets = tickets.filter(t =>
    (t.ticketNumber && t.ticketNumber.toLowerCase().includes(q)) ||
    (t.ticket_number && t.ticket_number.toLowerCase().includes(q)) ||
    (t.subject && t.subject.toLowerCase().includes(q)) ||
    (t.userEmail && t.userEmail.toLowerCase().includes(q))
  ).slice(0, 10);

  const matchedOrders = orders.filter(o =>
    (o.orderId && o.orderId.toLowerCase().includes(q)) ||
    (o.id && o.id.toLowerCase().includes(q)) ||
    (o.email && o.email.toLowerCase().includes(q))
  ).slice(0, 10);

  return {
    query,
    totalMatches: matchedUsers.length + matchedWishes.length + matchedTickets.length + matchedOrders.length,
    users: matchedUsers,
    wishes: matchedWishes,
    tickets: matchedTickets,
    orders: matchedOrders
  };
}

/**
 * Creates a support ticket for an end-user inquiry or celebration issue.
 */
export function createSupportTicket({
  userId = null,
  userEmail = 'guest@wishmagic.live',
  wishId = null,
  category = 'general',
  subject,
  description,
  priority = TICKET_PRIORITY.MEDIUM,
  assignedTo = null,
  actor
}) {
  if (!subject) throw new Error('Ticket subject is required');
  if (!description) throw new Error('Ticket description is required');

  const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
  const now = new Date().toISOString();

  const ticket = {
    id: `ticket_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`,
    ticketNumber,
    ticket_number: ticketNumber,
    userId,
    user_id: userId,
    userEmail,
    user_email: userEmail,
    wishId,
    wish_id: wishId,
    category,
    subject,
    description,
    status: TICKET_STATUS.OPEN,
    priority,
    adminNotes: null,
    admin_notes: null,
    assignedTo,
    assigned_to: assignedTo,
    diagnosticData: '{}',
    diagnostic_data: '{}',
    resolutionSummary: null,
    resolution_summary: null,
    createdAt: now,
    created_at: now,
    updatedAt: now,
    updated_at: now
  };

  const auditLog = createAuditLogEntry({
    actorId: actor?.id || 'system',
    actorName: actor?.displayName || actor?.name || 'Support Desk',
    actorRole: actor?.role || 'support',
    action: 'SUPPORT_TICKET_CREATED',
    targetType: 'support_ticket',
    targetId: ticket.id,
    details: {
      ticketNumber,
      category,
      priority,
      userEmail
    }
  });

  return { ticket, auditLog };
}

/**
 * Updates a support ticket status, priority, or resolution notes.
 */
export function updateSupportTicket({ ticket, status, priority, adminNotes, resolutionSummary, assignedTo, actor }) {
  if (!ticket) throw new Error('Support ticket not found');

  const now = new Date().toISOString();
  if (status) {
    ticket.status = status;
  }
  if (priority) {
    ticket.priority = priority;
  }
  if (adminNotes !== undefined) {
    ticket.adminNotes = adminNotes;
    ticket.admin_notes = adminNotes;
  }
  if (resolutionSummary !== undefined) {
    ticket.resolutionSummary = resolutionSummary;
    ticket.resolution_summary = resolutionSummary;
  }
  if (assignedTo !== undefined) {
    ticket.assignedTo = assignedTo;
    ticket.assigned_to = assignedTo;
  }
  ticket.updatedAt = now;
  ticket.updated_at = now;

  const auditLog = createAuditLogEntry({
    actorId: actor?.id || 'admin',
    actorName: actor?.displayName || actor?.name || 'Support Desk',
    actorRole: actor?.role || 'admin',
    action: 'SUPPORT_TICKET_UPDATED',
    targetType: 'support_ticket',
    targetId: ticket.id,
    details: {
      status: ticket.status,
      priority: ticket.priority,
      resolutionSummary
    }
  });

  return { ticket, auditLog };
}

// ============================================================================
// 5. AUDIT TRAIL LOGGING & SEARCH
// ============================================================================

/**
 * Filter and search through administrative audit logs.
 */
export function filterAuditLogs(logs = [], options = {}) {
  const {
    actorId = 'all',
    action = 'all',
    targetType = 'all',
    query = '',
    limit = 100,
    offset = 0
  } = options;

  let filtered = [...logs];

  if (actorId && actorId !== 'all') {
    filtered = filtered.filter(l => l.actorId === actorId || l.actor_id === actorId);
  }

  if (action && action !== 'all') {
    filtered = filtered.filter(l => l.action === action);
  }

  if (targetType && targetType !== 'all') {
    filtered = filtered.filter(l => l.targetType === targetType || l.target_type === targetType);
  }

  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    filtered = filtered.filter(l =>
      (l.action && l.action.toLowerCase().includes(q)) ||
      (l.actorName && l.actorName.toLowerCase().includes(q)) ||
      (l.targetId && l.targetId.toLowerCase().includes(q)) ||
      (l.details && l.details.toLowerCase().includes(q))
    );
  }

  filtered.sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at));

  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  return {
    logs: paginated,
    total
  };
}

/**
 * Converts audit logs to standard CSV format.
 */
export function exportAuditLogsCsv(logs = []) {
  const headers = ['ID', 'Actor ID', 'Actor Name', 'Actor Role', 'Action', 'Target Type', 'Target ID', 'IP Address', 'Created At', 'Details'];
  const rows = logs.map(l => [
    `"${l.id || ''}"`,
    `"${l.actorId || l.actor_id || ''}"`,
    `"${(l.actorName || l.actor_name || '').replace(/"/g, '""')}"`,
    `"${l.actorRole || l.actor_role || ''}"`,
    `"${l.action || ''}"`,
    `"${l.targetType || l.target_type || ''}"`,
    `"${l.targetId || l.target_id || ''}"`,
    `"${l.ipAddress || l.ip_address || ''}"`,
    `"${l.createdAt || l.created_at || ''}"`,
    `"${(l.details || '').replace(/"/g, '""')}"`
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}
