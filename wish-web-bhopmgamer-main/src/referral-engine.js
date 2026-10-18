/**
 * WishMagic Production Referral Program, Invite Rewards & Fraud Prevention Engine
 * Stack: Cloudflare Workers + Pages + D1 Database
 * Part 36 Architecture
 */

export const QUALIFYING_EVENTS = {
  SIGNUP: 'SIGNUP',
  FIRST_WISH: 'FIRST_WISH',
  FIRST_PURCHASE: 'FIRST_PURCHASE'
};

export const REWARD_TYPES = {
  PREMIUM_DAYS: 'PREMIUM_DAYS',
  VIP_DAYS: 'PREMIUM_DAYS', // convenient alias
  FREE_CUSTOM_LINK: 'FREE_CUSTOM_LINK',
  FREE_WISH_CREDIT: 'FREE_WISH_CREDIT',
  DISCOUNT_COUPON: 'DISCOUNT_COUPON',
  BADGE: 'BADGE',
  WALLET_POINTS: 'WALLET_POINTS'
};

export const LEDGER_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  GRANTED: 'GRANTED',
  CLAIMED: 'CLAIMED',
  REJECTED: 'REJECTED',
  REVOKED: 'REVOKED'
};

export const ATTRIBUTION_STATUS = {
  VISITED: 'VISITED',
  PENDING: 'PENDING',
  QUALIFIED: 'QUALIFIED',
  REWARDED: 'REWARDED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED'
};

export const DEFAULT_PROGRAM = {
  id: 'default_program',
  name: 'Share with 7 Friends • Unlock 1 Free Custom Link',
  is_active: 1,
  qualifying_event: 'FIRST_WISH',
  referrer_reward_type: 'FREE_CUSTOM_LINK',
  referrer_reward_amount: 1,
  referee_reward_type: 'NONE',
  referee_reward_amount: 0,
  required_referrals_for_reward: 7,
  count_free_templates: 1,
  max_referrals_per_user: 70,
  attribution_window_days: 30,
  require_admin_approval: 0,
  fraud_strictness: 'standard',
  terms_summary: 'Share WishMagic with 7 friends! When 7 referred friends create any wish template (even a ₹0 Free template), you unlock 1 Free Custom Link Credit (worth ₹59) for any Free template!'
};

/**
 * Mask an email address for privacy compliance
 * Example: "ankitsaini941413@gmail.com" -> "a***i@gmail.com"
 */
export function maskEmail(email) {
  if (!email || typeof email !== 'string') return 'Anonymous Creator';
  const parts = email.split('@');
  if (parts.length !== 2) return 'Creator';
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) {
    return `${name[0]}*@${domain}`;
  }
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}

/**
 * Mask an IP address for privacy compliance
 * Example: "192.168.1.100" -> "192.168.***.***"
 */
export function maskIp(ip) {
  if (!ip || typeof ip !== 'string') return '0.0.0.0';
  if (ip.includes('.')) {
    const segments = ip.split('.');
    if (segments.length === 4) {
      return `${segments[0]}.${segments[1]}.***.***`;
    }
  }
  if (ip.includes(':')) {
    const segments = ip.split(':');
    return `${segments.slice(0, 2).join(':')}:****:****`;
  }
  return '***.***';
}

/**
 * Hash a string (visitor token, IP, User-Agent) safely
 */
export function hashSignature(str) {
  if (!str) return 'unknown';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Generate a unique, readable referral code
 * Format: WM-XXXXXX (e.g. WM-7K9M2P)
 */
export function generateReferralCode(userId) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude ambiguous 0, 1, I, O
  let randomPart = '';
  // Combine timestamp + user id entropy
  const now = Date.now().toString(36).toUpperCase();
  const seed = (userId || 'wm') + now;
  for (let i = 0; i < 6; i++) {
    const idx = (seed.charCodeAt(i % seed.length) + Math.floor(Math.random() * chars.length)) % chars.length;
    randomPart += chars[idx];
  }
  return `WM-${randomPart}`;
}

/**
 * Retrieve active referral program configuration from D1
 */
export async function getProgramConfig(db) {
  if (!db) return DEFAULT_PROGRAM;
  try {
    const row = await db.prepare(
      'SELECT * FROM referral_programs WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
    ).first();
    if (row) {
      return {
        id: row.id,
        name: row.name,
        isActive: Boolean(row.is_active),
        qualifyingEvent: row.qualifying_event || 'FIRST_WISH',
        referrerRewardType: row.referrer_reward_type || 'FREE_CUSTOM_LINK',
        referrerRewardAmount: Number(row.referrer_reward_amount) || 1,
        refereeRewardType: row.referee_reward_type || 'NONE',
        refereeRewardAmount: Number(row.referee_reward_amount) || 0,
        requiredReferralsForReward: Number(row.required_referrals_for_reward) || 1,
        countFreeTemplates: row.count_free_templates !== undefined ? Boolean(row.count_free_templates) : true,
        maxReferralsPerUser: Number(row.max_referrals_per_user) || 70,
        attributionWindowDays: Number(row.attribution_window_days) || 30,
        requireAdminApproval: Boolean(row.require_admin_approval),
        fraudStrictness: row.fraud_strictness || 'standard',
        termsSummary: row.terms_summary || DEFAULT_PROGRAM.terms_summary
      };
    }
  } catch (err) {
    // Fallback if table not ready
  }
  return {
    id: DEFAULT_PROGRAM.id,
    name: DEFAULT_PROGRAM.name,
    isActive: Boolean(DEFAULT_PROGRAM.is_active),
    qualifyingEvent: DEFAULT_PROGRAM.qualifying_event,
    referrerRewardType: DEFAULT_PROGRAM.referrer_reward_type,
    referrerRewardAmount: DEFAULT_PROGRAM.referrer_reward_amount,
    refereeRewardType: DEFAULT_PROGRAM.referee_reward_type,
    refereeRewardAmount: DEFAULT_PROGRAM.referee_reward_amount,
    requiredReferralsForReward: DEFAULT_PROGRAM.required_referrals_for_reward || 7,
    countFreeTemplates: true,
    maxReferralsPerUser: DEFAULT_PROGRAM.max_referrals_per_user,
    attributionWindowDays: DEFAULT_PROGRAM.attribution_window_days,
    requireAdminApproval: Boolean(DEFAULT_PROGRAM.require_admin_approval),
    fraudStrictness: DEFAULT_PROGRAM.fraud_strictness,
    termsSummary: DEFAULT_PROGRAM.terms_summary
  };
}

/**
 * Ensure user has an authoritative referral code
 */
export async function ensureUserReferralCode(userId, db) {
  if (!userId) throw new Error('User ID is required');
  const now = new Date().toISOString();

  if (!db) {
    return {
      id: `rc_${userId}`,
      userId,
      referralCode: `WM-${userId.substring(0, 6).toUpperCase()}`,
      customSlug: null,
      totalClicks: 0,
      totalSignups: 0,
      totalQualified: 0,
      totalRewardsEarned: 0,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };
  }

  // Look up existing
  const existing = await db.prepare(
    'SELECT * FROM user_referral_codes WHERE user_id = ? LIMIT 1'
  ).bind(userId).first().catch(() => null);

  if (existing) {
    return {
      id: existing.id,
      userId: existing.user_id,
      referralCode: existing.referral_code,
      customSlug: existing.custom_slug,
      totalClicks: existing.total_clicks || 0,
      totalSignups: existing.total_signups || 0,
      totalQualified: existing.total_qualified || 0,
      totalRewardsEarned: existing.total_rewards_earned || 0,
      isActive: Boolean(existing.is_active),
      createdAt: existing.created_at,
      updatedAt: existing.updated_at
    };
  }

  // Generate unique code
  let newCode = generateReferralCode(userId);
  // Ensure uniqueness
  const conflict = await db.prepare(
    'SELECT id FROM user_referral_codes WHERE referral_code = ? LIMIT 1'
  ).bind(newCode).first().catch(() => null);

  if (conflict) {
    newCode = `WM-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  }

  const recordId = `refc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
  await db.prepare(`
    INSERT INTO user_referral_codes (
      id, user_id, referral_code, custom_slug,
      total_clicks, total_signups, total_qualified, total_rewards_earned,
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, 0, 0, 0, 0, 1, ?, ?)
  `).bind(recordId, userId, newCode, now, now).run().catch(() => {});

  return {
    id: recordId,
    userId,
    referralCode: newCode,
    customSlug: null,
    totalClicks: 0,
    totalSignups: 0,
    totalQualified: 0,
    totalRewardsEarned: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Record an incoming referral link click
 */
export async function trackReferralClick({ referralCode, visitorToken, ip, userAgent, landingPage = '/' }, db) {
  if (!referralCode) return { success: false, reason: 'MISSING_CODE' };
  const cleanCode = referralCode.trim().toUpperCase();

  // Find owner of referral code
  const codeRecord = await db.prepare(
    'SELECT * FROM user_referral_codes WHERE referral_code = ? OR custom_slug = ? LIMIT 1'
  ).bind(cleanCode, cleanCode).first().catch(() => null);

  if (!codeRecord || !codeRecord.is_active) {
    return { success: false, reason: 'INVALID_OR_INACTIVE_CODE' };
  }

  const program = await getProgramConfig(db);
  if (!program.isActive) {
    return { success: false, reason: 'PROGRAM_PAUSED' };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + (program.attributionWindowDays * 24 * 60 * 60 * 1000)).toISOString();
  const token = visitorToken || `vtok_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
  const ipHash = hashSignature(ip || 'unknown');
  const uaHash = hashSignature(userAgent || 'unknown');

  // Increment total clicks
  await db.prepare(
    'UPDATE user_referral_codes SET total_clicks = total_clicks + 1, updated_at = ? WHERE id = ?'
  ).bind(now.toISOString(), codeRecord.id).run().catch(() => {});

  // Check if attribution already exists for this visitor token and code
  const existingAttr = await db.prepare(
    'SELECT id FROM referral_attributions WHERE visitor_token = ? AND referral_code = ? LIMIT 1'
  ).bind(token, cleanCode).first().catch(() => null);

  const attributionId = existingAttr ? existingAttr.id : `attr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

  if (existingAttr) {
    await db.prepare(`
      UPDATE referral_attributions
      SET expires_at = ?, landing_page = ?, ip_hash = ?, user_agent_hash = ?
      WHERE id = ?
    `).bind(expiresAt, landingPage, ipHash, uaHash, attributionId).run().catch(() => {});
  } else {
    await db.prepare(`
      INSERT INTO referral_attributions (
        id, referral_code, referrer_user_id, referee_user_id,
        visitor_token, landing_page, ip_hash, user_agent_hash,
        status, qualifying_event, attributed_at, expires_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'VISITED', NULL, ?, ?)
    `).bind(
      attributionId, cleanCode, codeRecord.user_id,
      token, landingPage, ipHash, uaHash,
      now.toISOString(), expiresAt
    ).run().catch(() => {});
  }

  return {
    success: true,
    attributionId,
    visitorToken: token,
    referrerUserId: codeRecord.user_id,
    referralCode: cleanCode,
    expiresAt
  };
}

/**
 * Comprehensive server-side fraud checks
 */
export async function performFraudCheck({
  referrerUserId,
  refereeUserId,
  referralCode,
  referralCodeRecord,
  refereeEmail,
  clientIp,
  userAgent,
  db
}) {
  const flags = [];
  let riskScore = 0;
  const actualReferrerId = referrerUserId || referralCodeRecord?.userId || referralCodeRecord?.user_id;
  const actualRefCode = referralCode || referralCodeRecord?.referralCode || referralCodeRecord?.referral_code;

  // 1. Strict Self-Referral Prevention: Same user ID
  if (actualReferrerId && refereeUserId && actualReferrerId === refereeUserId) {
    flags.push('SELF_REFERRAL_SAME_USER_ID');
    riskScore += 100;
  }

  // 1b. Bot User Agent detection
  if (userAgent && (userAgent.toLowerCase().includes('curl') || userAgent.toLowerCase().includes('bot') || userAgent.toLowerCase().includes('headless'))) {
    flags.push('AUTOMATED_BOT_USER_AGENT');
    riskScore += 50;
  }

  // 1c. Disposable / temporary email domain check
  const DISPOSABLE_DOMAINS = ['temp-mail', 'mailinator', '10minutemail', 'guerrillamail', 'trashmail'];
  if (refereeEmail && DISPOSABLE_DOMAINS.some(d => refereeEmail.toLowerCase().includes(d))) {
    flags.push('DISPOSABLE_EMAIL_DOMAIN');
    riskScore += 45;
  }

  if (db && referrerUserId && refereeUserId) {
    // 2. Self-Referral Prevention: Same user email prefix or identical email domain/details
    const users = await db.prepare(
      'SELECT id, email, created_at FROM users WHERE id IN (?, ?)'
    ).bind(referrerUserId, refereeUserId).all().catch(() => ({ results: [] }));

    const referrerUser = (users.results || []).find(u => u.id === referrerUserId);
    const refereeUser = (users.results || []).find(u => u.id === refereeUserId);

    if (referrerUser && refereeUser && referrerUser.email && refereeUser.email) {
      if (referrerUser.email.toLowerCase() === refereeUser.email.toLowerCase()) {
        flags.push('SELF_REFERRAL_IDENTICAL_EMAIL');
        riskScore += 100;
      }
      // Check similar plus addressing (e.g. user+1@gmail.com vs user@gmail.com)
      const refBase = referrerUser.email.split('@')[0].split('+')[0].toLowerCase();
      const refEBase = refereeUser.email.split('@')[0].split('+')[0].toLowerCase();
      if (refBase === refEBase && referrerUser.email.split('@')[1] === refereeUser.email.split('@')[1]) {
        flags.push('SUSPICIOUS_ALIAS_EMAIL');
        riskScore += 70;
      }
    }

    // 3. Circular Referral Prevention: Referee previously referred Referrer
    const circular = await db.prepare(`
      SELECT id FROM referral_attributions
      WHERE referrer_user_id = ? AND referee_user_id = ?
      LIMIT 1
    `).bind(refereeUserId, referrerUserId).first().catch(() => null);

    if (circular) {
      flags.push('CIRCULAR_REFERRAL_LOOP');
      riskScore += 90;
    }

    // 4. Velocity Check: Referrer having too many signups in past 1 hour (bot swarm)
    const oneHourAgo = new Date(Date.now() - (60 * 60 * 1000)).toISOString();
    const recentCount = await db.prepare(`
      SELECT count(*) as count FROM referral_attributions
      WHERE referrer_user_id = ? AND attributed_at > ?
    `).bind(referrerUserId, oneHourAgo).first().catch(() => ({ count: 0 }));

    if (recentCount && recentCount.count >= 15) {
      flags.push('HIGH_VELOCITY_INVITES');
      riskScore += 50;
    }

    // 5. User Max Referrals Limit Check
    const program = await getProgramConfig(db);
    const qualifiedCount = await db.prepare(`
      SELECT count(*) as count FROM referral_attributions
      WHERE referrer_user_id = ? AND status IN ('QUALIFIED', 'REWARDED')
    `).bind(referrerUserId).first().catch(() => ({ count: 0 }));

    if (qualifiedCount && qualifiedCount.count >= program.maxReferralsPerUser) {
      flags.push('MAX_REFERRALS_LIMIT_EXCEEDED');
      riskScore += 80;
    }
  }

  // Determine action
  let actionTaken = 'ALLOWED';
  if (riskScore >= 90) {
    actionTaken = 'BLOCKED';
  } else if (riskScore >= 40) {
    actionTaken = 'FLAGGED';
  }

  // Record fraud log if flagged or blocked
  if (db && flags.length > 0) {
    const logId = `frd_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO referral_fraud_logs (
        id, referrer_user_id, referee_user_id, referral_code,
        risk_score, flag_reasons, ip_address, device_info,
        action_taken, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      logId,
      referrerUserId || null,
      refereeUserId || null,
      referralCode || null,
      Math.min(riskScore, 100),
      JSON.stringify(flags),
      maskIp(clientIp),
      (userAgent || '').substring(0, 100),
      actionTaken,
      now
    ).run().catch(() => {});
  }

  return {
    isClean: riskScore < 40,
    riskScore: Math.min(riskScore, 100),
    flags,
    actionTaken
  };
}

/**
 * Link newly registered user (referee) to an attribution
 */
export async function linkRefereeSignup({
  refereeUserId,
  referralCode,
  visitorToken,
  clientIp,
  userAgent
}, db, env) {
  if (!refereeUserId) return { success: false, reason: 'MISSING_REFEREE' };
  const now = new Date().toISOString();

  // 1. Check if user was already attributed (one attribution per user lifetime)
  const existingRef = await db.prepare(
    'SELECT id FROM referral_attributions WHERE referee_user_id = ? LIMIT 1'
  ).bind(refereeUserId).first().catch(() => null);

  if (existingRef) {
    return { success: false, reason: 'ALREADY_ATTRIBUTED' };
  }

  // 2. Find attribution by visitorToken or referralCode
  let attr = null;
  if (visitorToken) {
    attr = await db.prepare(
      'SELECT * FROM referral_attributions WHERE visitor_token = ? AND status = "VISITED" ORDER BY attributed_at DESC LIMIT 1'
    ).bind(visitorToken).first().catch(() => null);
  }

  if (!attr && referralCode) {
    const cleanCode = referralCode.trim().toUpperCase();
    const codeRec = await db.prepare(
      'SELECT user_id FROM user_referral_codes WHERE referral_code = ? OR custom_slug = ? LIMIT 1'
    ).bind(cleanCode, cleanCode).first().catch(() => null);

    if (codeRec) {
      // Create fresh attribution record
      const attrId = `attr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
      const program = await getProgramConfig(db);
      const expiresAt = new Date(Date.now() + (program.attributionWindowDays * 24 * 60 * 60 * 1000)).toISOString();
      attr = {
        id: attrId,
        referral_code: cleanCode,
        referrer_user_id: codeRec.user_id,
        referee_user_id: null,
        status: 'VISITED',
        attributed_at: now,
        expires_at: expiresAt
      };
      await db.prepare(`
        INSERT INTO referral_attributions (
          id, referral_code, referrer_user_id, referee_user_id,
          visitor_token, status, attributed_at, expires_at
        ) VALUES (?, ?, ?, NULL, ?, 'VISITED', ?, ?)
      `).bind(attrId, cleanCode, codeRec.user_id, visitorToken || attrId, now, expiresAt).run().catch(() => {});
    }
  }

  if (!attr) {
    return { success: false, reason: 'NO_ATTRIBUTION_FOUND' };
  }

  // 3. Strict Self-Referral Prevention (Immediate Check)
  if (attr.referrer_user_id && refereeUserId && attr.referrer_user_id === refereeUserId) {
    return { success: false, reason: 'SELF_REFERRAL', flags: ['SELF_REFERRAL_SAME_USER_ID'] };
  }

  // 4. Fraud & Abuse Scoring Check
  const fraudResult = await performFraudCheck({
    referrerUserId: attr.referrer_user_id,
    refereeUserId,
    referralCode: attr.referral_code,
    clientIp,
    userAgent,
    db
  });

  if (!fraudResult.isClean && fraudResult.actionTaken === 'BLOCKED') {
    await db.prepare(
      'UPDATE referral_attributions SET status = "REJECTED" WHERE id = ?'
    ).bind(attr.id).run().catch(() => {});
    return { success: false, reason: 'FRAUD_CHECK_FAILED', flags: fraudResult.flags };
  }

  // 4. Update attribution with referee and status PENDING
  await db.prepare(`
    UPDATE referral_attributions
    SET referee_user_id = ?, status = 'PENDING'
    WHERE id = ?
  `).bind(refereeUserId, attr.id).run().catch(() => {});

  // Increment referrer total_signups
  await db.prepare(`
    UPDATE user_referral_codes
    SET total_signups = total_signups + 1, updated_at = ?
    WHERE referral_code = ?
  `).bind(now, attr.referral_code).run().catch(() => {});

  // 5. If program qualifying event is SIGNUP, evaluate qualification immediately!
  const program = await getProgramConfig(db);
  if (program.isActive && program.qualifyingEvent === QUALIFYING_EVENTS.SIGNUP) {
    await evaluateQualifyingEvent(refereeUserId, QUALIFYING_EVENTS.SIGNUP, { attributionId: attr.id }, db, env);
  }

  return {
    success: true,
    attributionId: attr.id,
    referralCode: attr.referral_code,
    referrerUserId: attr.referrer_user_id,
    refereeUserId,
    fraudFlags: fraudResult.flags
  };
}

/**
 * Grant Authoritative Entitlement directly in D1
 */
async function grantPlatformEntitlement(userId, rewardType, rewardAmount, db) {
  if (!db || !userId || !rewardType || rewardType === 'NONE') return;
  const now = new Date();
  const startsAt = now.toISOString();

  if (rewardType === 'PREMIUM_DAYS' || rewardType === 'VIP_DAYS') {
    const days = Math.max(1, Number(rewardAmount) || 7);
    const existing = await db.prepare(
      "SELECT id, expires_at FROM entitlements WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1"
    ).bind(userId).first().catch(() => null);

    if (existing && existing.id) {
      const baseTime = existing.expires_at && new Date(existing.expires_at) > now
        ? new Date(existing.expires_at).getTime()
        : now.getTime();
      const extendedExpiresAt = new Date(baseTime + (days * 24 * 60 * 60 * 1000)).toISOString();
      await db.prepare(
        'UPDATE entitlements SET expires_at = ?, updated_at = ? WHERE id = ?'
      ).bind(extendedExpiresAt, startsAt, existing.id).run().catch(() => {});
      return;
    }

    const newExpiresAt = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000)).toISOString();
    const entId = `ent_ref_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    await db.prepare(`
      INSERT INTO entitlements (
        id, user_id, plan, status, source, starts_at, expires_at, created_at, updated_at
      ) VALUES (?, ?, 'VIP', 'active', 'referral', ?, ?, ?, ?)
    `).bind(entId, userId, startsAt, newExpiresAt, startsAt, startsAt).run().catch(() => {});
    return;
  }

  const credits = Math.max(1, Number(rewardAmount) || 1);
  const newExpiresAt = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000)).toISOString();
  for (let i = 0; i < credits; i++) {
    const entId = `ent_clink_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}_${i}`;
    await db.prepare(`
      INSERT INTO entitlements (
        id, user_id, item_type, plan, status, source, starts_at, expires_at, created_at, updated_at
      ) VALUES (?, ?, 'free_custom_link', 'FREE_CUSTOM_LINK', 'active', 'referral_7_friends', ?, ?, ?, ?)
    `).bind(entId, userId, startsAt, newExpiresAt, startsAt, startsAt).run().catch(() => {});
  }
}

/**
 * Trigger qualification check when a user performs a key milestone:
 * - FIRST_WISH (published/created wish)
 * - FIRST_PURCHASE (completed order)
 * - SIGNUP (account registration)
 */
export async function evaluateQualifyingEvent(userId, eventType, eventMetadata = {}, db, env) {
  if (!userId || !eventType || !db) return { qualified: false };

  // 1. Find pending referral attribution for this user as referee
  const attribution = await db.prepare(`
    SELECT * FROM referral_attributions
    WHERE referee_user_id = ? AND status IN ('PENDING', 'VISITED')
    ORDER BY attributed_at DESC LIMIT 1
  `).bind(userId).first().catch(() => null);

  if (!attribution) {
    return { qualified: false, reason: 'NO_PENDING_ATTRIBUTION' };
  }

  // 2. Check program configuration
  const program = await getProgramConfig(db);
  if (!program.isActive) {
    return { qualified: false, reason: 'PROGRAM_INACTIVE' };
  }

  // Check if current event matches configured qualifying event
  if (program.qualifyingEvent !== eventType) {
    return { qualified: false, reason: 'EVENT_DOES_NOT_MATCH_CONFIG' };
  }

  // 3. Expiration Check
  const now = new Date();
  if (attribution.expires_at && new Date(attribution.expires_at) < now) {
    await db.prepare('UPDATE referral_attributions SET status = "EXPIRED" WHERE id = ?').bind(attribution.id).run().catch(() => {});
    return { qualified: false, reason: 'ATTRIBUTION_EXPIRED' };
  }

  // 4. Server-Side Idempotency Check on Rewards Ledger
  const referrerIdemKey = `ref_grant_${attribution.id}_REFERRER_${eventType}`;
  const refereeIdemKey = `ref_grant_${attribution.id}_REFEREE_${eventType}`;

  const existingLedger = await db.prepare(
    'SELECT id FROM referral_rewards_ledger WHERE idempotency_key = ? LIMIT 1'
  ).bind(referrerIdemKey).first().catch(() => null);

  if (existingLedger) {
    return { qualified: false, reason: 'ALREADY_QUALIFIED_IDEMPOTENT' };
  }

  // 5. Fraud Check
  const fraud = await performFraudCheck({
    referrerUserId: attribution.referrer_user_id,
    refereeUserId: userId,
    referralCode: attribution.referral_code,
    clientIp: eventMetadata.ip,
    userAgent: eventMetadata.userAgent,
    db
  });

  if (!fraud.isClean && fraud.actionTaken === 'BLOCKED') {
    await db.prepare('UPDATE referral_attributions SET status = "REJECTED" WHERE id = ?').bind(attribution.id).run().catch(() => {});
    return { qualified: false, reason: 'FRAUD_BLOCKED', flags: fraud.flags };
  }

  // 6. Qualification Status & Milestone Evaluation
  const initialStatus = (program.requireAdminApproval || !fraud.isClean) ? LEDGER_STATUS.PENDING : LEDGER_STATUS.GRANTED;
  const nowIso = now.toISOString();
  const requiredFriends = Math.max(1, Number(program.requiredReferralsForReward) || 1);
  const referrerRewardType = program.referrerRewardType || 'PREMIUM_DAYS';
  const referrerRewardAmount = Math.max(1, Number(program.referrerRewardAmount) || 1);
  const refereeRewardType = program.refereeRewardType || 'NONE';
  const refereeRewardAmount = Math.max(0, Number(program.refereeRewardAmount) || 0);

  // Update Attribution Record to QUALIFIED / REWARDED
  const newAttrStatus = initialStatus === LEDGER_STATUS.GRANTED ? ATTRIBUTION_STATUS.REWARDED : ATTRIBUTION_STATUS.QUALIFIED;
  await db.prepare(`
    UPDATE referral_attributions
    SET status = ?, qualifying_event = ?, qualified_at = ?
    WHERE id = ?
  `).bind(newAttrStatus, eventType, nowIso, attribution.id).run().catch(() => {});

  // Count total qualified referrals for this referrer
  const qualCountRow = await db.prepare(`
    SELECT COUNT(*) as cnt FROM referral_attributions
    WHERE referrer_user_id = ? AND status IN ('QUALIFIED', 'REWARDED')
  `).bind(attribution.referrer_user_id).first().catch(() => null);
  const newQualifiedTotal = Number(qualCountRow?.cnt || 1);

  const milestoneUnlocked = (newQualifiedTotal > 0 && (newQualifiedTotal % requiredFriends === 0));
  const creditsEarnedNow = milestoneUnlocked ? referrerRewardAmount : 0;

  // Update Referrer Metrics
  await db.prepare(`
    UPDATE user_referral_codes
    SET total_qualified = ?,
        total_rewards_earned = total_rewards_earned + ?,
        updated_at = ?
    WHERE referral_code = ?
  `).bind(newQualifiedTotal, creditsEarnedNow, nowIso, attribution.referral_code).run().catch(() => {});

  const rewardsGranted = [];
  if (milestoneUnlocked) {
    const refLedgerId = `rw_r_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    await db.prepare(`
      INSERT INTO referral_rewards_ledger (
        id, attribution_id, user_id, counterpart_user_id, role,
        reward_type, reward_amount, status, idempotency_key,
        granted_at, details_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'REFERRER', ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      refLedgerId,
      attribution.id,
      attribution.referrer_user_id,
      userId,
      referrerRewardType,
      creditsEarnedNow,
      initialStatus,
      referrerIdemKey,
      initialStatus === LEDGER_STATUS.GRANTED ? nowIso : null,
      JSON.stringify({ eventType, milestoneQualifiedCount: newQualifiedTotal, requiredFriends, eventMetadata }),
      nowIso,
      nowIso
    ).run().catch(() => {});

    if (initialStatus === LEDGER_STATUS.GRANTED) {
      await grantPlatformEntitlement(attribution.referrer_user_id, referrerRewardType, creditsEarnedNow, db);
    }

    rewardsGranted.push({
      ledgerId: refLedgerId,
      userId: attribution.referrer_user_id,
      role: 'REFERRER',
      rewardType: referrerRewardType,
      rewardAmount: creditsEarnedNow,
      status: initialStatus
    });
  }

  if (refereeRewardType && refereeRewardType !== 'NONE' && refereeRewardAmount > 0) {
    const refereeLedgerId = `rw_e_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    await db.prepare(`
      INSERT INTO referral_rewards_ledger (
        id, attribution_id, user_id, counterpart_user_id, role,
        reward_type, reward_amount, status, idempotency_key,
        granted_at, details_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'REFEREE', ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      refereeLedgerId,
      attribution.id,
      userId,
      attribution.referrer_user_id,
      refereeRewardType,
      refereeRewardAmount,
      initialStatus,
      refereeIdemKey,
      initialStatus === LEDGER_STATUS.GRANTED ? nowIso : null,
      JSON.stringify({ eventType, eventMetadata }),
      nowIso,
      nowIso
    ).run().catch(() => {});

    if (initialStatus === LEDGER_STATUS.GRANTED) {
      await grantPlatformEntitlement(userId, refereeRewardType, refereeRewardAmount, db);
    }

    rewardsGranted.push({
      ledgerId: refereeLedgerId,
      userId,
      role: 'REFEREE',
      rewardType: refereeRewardType,
      rewardAmount: refereeRewardAmount,
      status: initialStatus
    });
  }

  return {
    qualified: true,
    milestoneUnlocked,
    newQualifiedTotal,
    requiredFriends,
    status: initialStatus,
    attributionId: attribution.id,
    referrerReward: { type: referrerRewardType, amount: creditsEarnedNow },
    refereeReward: { type: refereeRewardType, amount: refereeRewardAmount },
    rewardsGranted
  };
}

/**
 * Claim an approved or granted reward by user
 */
export async function claimUserReward(userId, ledgerId, db, env) {
  if (!userId || !ledgerId || !db) throw new Error('Invalid claim request parameters');
  const now = new Date().toISOString();

  const item = await db.prepare(`
    SELECT * FROM referral_rewards_ledger
    WHERE id = ? AND user_id = ? LIMIT 1
  `).bind(ledgerId, userId).first().catch(() => null);

  if (!item) {
    throw new Error('Reward record not found or access denied');
  }

  if (item.status === LEDGER_STATUS.CLAIMED) {
    throw new Error('Reward has already been claimed (ALREADY_CLAIMED)');
  }

  if (item.status === LEDGER_STATUS.REJECTED || item.status === LEDGER_STATUS.REVOKED) {
    throw new Error('Reward is not claimable (rejected or revoked)');
  }

  if (item.status === LEDGER_STATUS.PENDING) {
    throw new Error('Reward is currently pending qualification or admin review');
  }

  // Grant benefit
  await grantPlatformEntitlement(userId, item.reward_type, item.reward_amount, db);

  // Update ledger
  await db.prepare(`
    UPDATE referral_rewards_ledger
    SET status = 'CLAIMED', claimed_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(now, now, ledgerId).run();

  return {
    success: true,
    ledgerId,
    rewardType: item.reward_type,
    rewardAmount: item.reward_amount,
    claimedAt: now
  };
}

/**
 * Get User Referral Dashboard data
 */
export async function getUserReferralDashboard(userId, db, baseUrl = 'https://wishmagic.app') {
  if (!userId) throw new Error('User ID is required');

  const codeData = await ensureUserReferralCode(userId, db);
  const program = await getProgramConfig(db);

  const cleanBase = baseUrl.replace(/\/$/, '');
  const referralLink = `${cleanBase}/?ref=${codeData.referralCode}`;

  // Fetch invited users list with privacy masking
  let invitedFriends = [];
  let rewardsLedger = [];
  let claimableCount = 0;
  let pendingCount = 0;

  if (db) {
    // Attributions where user is referrer
    const attributions = await db.prepare(`
      SELECT a.*, u.email as referee_email, u.display_name as referee_name
      FROM referral_attributions a
      LEFT JOIN users u ON a.referee_user_id = u.id
      WHERE a.referrer_user_id = ?
      ORDER BY a.attributed_at DESC
      LIMIT 50
    `).bind(userId).all().catch(() => ({ results: [] }));

    invitedFriends = (attributions.results || []).map(r => ({
      id: r.id,
      maskedName: r.referee_name ? r.referee_name.substring(0, 1) + '***' : 'Friend',
      maskedEmail: maskEmail(r.referee_email),
      status: r.status,
      qualifyingEvent: r.qualifying_event,
      attributedAt: r.attributed_at,
      qualifiedAt: r.qualified_at
    }));

    // User's reward ledger entries (as referrer or referee)
    const ledger = await db.prepare(`
      SELECT * FROM referral_rewards_ledger
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).bind(userId).all().catch(() => ({ results: [] }));

    rewardsLedger = (ledger.results || []).map(l => {
      if (l.status === LEDGER_STATUS.GRANTED) claimableCount++;
      if (l.status === LEDGER_STATUS.PENDING) pendingCount++;
      return {
        id: l.id,
        role: l.role,
        rewardType: l.reward_type,
        rewardAmount: l.reward_amount,
        status: l.status,
        grantedAt: l.granted_at,
        claimedAt: l.claimed_at,
        createdAt: l.created_at
      };
    });
  }

  // Pre-formatted share messages
  const shareText = `Send personalized wishes with music & magic on WishMagic! Join via my link and get free VIP perks: ${referralLink}`;
  const shareUrls = {
    direct: referralLink,
    whatsapp: `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Create magical celebration wishes with VIP perks on WishMagic!')}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
    email: `mailto:?subject=${encodeURIComponent('VIP perks on WishMagic')}&body=${encodeURIComponent(shareText)}`
  };

  const targetFriends = Number(program.requiredReferralsForReward) || 7;
  const totalQual = Number(codeData.totalQualified) || 0;
  const completedMilestones = Math.floor(totalQual / targetFriends);
  const currentCycleProgress = totalQual % targetFriends;
  const friendsRemaining = targetFriends - currentCycleProgress;

  // Count active free_custom_link entitlements in DB if available
  let activeCustomLinkEnts = 0;
  let usedCustomLinkEnts = 0;
  if (db) {
    try {
      const entRows = await db.prepare(
        "SELECT status FROM entitlements WHERE user_id = ? AND item_type = 'free_custom_link'"
      ).bind(userId).all().catch(() => ({ results: [] }));
      for (const r of (entRows.results || [])) {
        if (r.status === 'active') activeCustomLinkEnts++;
        else if (r.status === 'used' || r.status === 'consumed') usedCustomLinkEnts++;
      }
    } catch (_) {}
  }

  const totalCreditsEarned = Math.max(completedMilestones, activeCustomLinkEnts + usedCustomLinkEnts);
  const freeCustomLinkCreditsAvailable = Math.max(activeCustomLinkEnts, Math.max(0, completedMilestones - usedCustomLinkEnts));

  return {
    success: true,
    referralCode: codeData.referralCode,
    referralLink,
    shareUrls,
    metrics: {
      totalClicks: codeData.totalClicks,
      totalSignups: codeData.totalSignups,
      totalQualified: totalQual,
      totalRewardsEarned: codeData.totalRewardsEarned,
      claimableRewardsCount: claimableCount,
      pendingRewardsCount: pendingCount,
      milestoneTarget: targetFriends,
      currentCycleProgress,
      friendsRemaining,
      completedMilestones,
      totalCreditsEarned,
      freeCustomLinkCreditsAvailable,
      freeCustomLinkCreditsUsed: usedCustomLinkEnts
    },
    program: {
      name: program.name,
      isActive: program.isActive,
      qualifyingEvent: program.qualifyingEvent,
      requiredReferralsForReward: targetFriends,
      countFreeTemplates: true,
      referrerRewardType: program.referrerRewardType,
      referrerRewardAmount: program.referrerRewardAmount,
      referrerReward: `1 Free Custom Link (per ${targetFriends} friends)`,
      refereeReward: 'None (7-Friends Referrer Milestone)',
      termsSummary: program.termsSummary
    },
    invitedFriends,
    rewardsLedger
  };
}

/**
 * Admin: Retrieve overall referral performance and metrics
 */
export async function getAdminReferralOverview(db) {
  if (!db) {
    const emptyMetrics = {
      totalCodes: 0,
      totalClicks: 0,
      totalSignups: 0,
      totalQualified: 0,
      conversionRate: 0,
      totalRewardsGranted: 0,
      pendingApprovals: 0,
      flaggedFraudCount: 0
    };
    return {
      success: true,
      metrics: emptyMetrics,
      ...emptyMetrics
    };
  }

  const totals = await db.prepare(`
    SELECT
      COUNT(DISTINCT referral_code) as totalCodes,
      SUM(total_clicks) as totalClicks,
      SUM(total_signups) as totalSignups,
      SUM(total_qualified) as totalQualified
    FROM user_referral_codes
  `).first().catch(() => ({ totalCodes: 0, totalClicks: 0, totalSignups: 0, totalQualified: 0 }));

  const pendingApprovals = await db.prepare(`
    SELECT count(*) as count FROM referral_rewards_ledger WHERE status = 'PENDING'
  `).first().catch(() => ({ count: 0 }));

  const totalAttributions = await db.prepare(`
    SELECT count(*) as count FROM referral_attributions
  `).first().catch(() => ({ count: 0 }));

  const flaggedFraud = await db.prepare(`
    SELECT count(*) as count FROM referral_fraud_logs
  `).first().catch(() => ({ count: 0 }));

  const clicks = Number(totals?.totalClicks) || 0;
  const qualified = Number(totals?.totalQualified) || 0;
  const conversionRate = clicks > 0 ? ((qualified / clicks) * 100).toFixed(1) : 0;

  const program = await getProgramConfig(db);

  const metrics = {
    totalCodes: Number(totals?.totalCodes) || 0,
    totalAttributions: Number(totalAttributions?.count) || 0,
    totalClicks: clicks,
    totalSignups: Number(totals?.totalSignups) || 0,
    totalQualified: qualified,
    conversionRate: Number(conversionRate),
    pendingApprovals: Number(pendingApprovals?.count) || 0,
    flaggedFraudCount: Number(flaggedFraud?.count) || 0
  };

  return {
    success: true,
    metrics,
    ...metrics,
    program
  };
}

/**
 * Admin: List attributions with user details & fraud flags
 */
export async function listAdminReferrals(filters = {}, db) {
  if (!db) return { items: [], total: 0 };
  const { status, limit = 50, offset = 0 } = filters;

  let query = `
    SELECT
      a.*,
      ru.email as referrer_email, ru.display_name as referrer_name,
      ee.email as referee_email, ee.display_name as referee_name
    FROM referral_attributions a
    LEFT JOIN users ru ON a.referrer_user_id = ru.id
    LEFT JOIN users ee ON a.referee_user_id = ee.id
  `;
  const params = [];

  if (status) {
    query += ' WHERE a.status = ?';
    params.push(status);
  }

  query += ' ORDER BY a.attributed_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const res = await db.prepare(query).bind(...params).all().catch(() => ({ results: [] }));
  const items = res.results || [];
  return { items, attributions: items, total: items.length };
}

/**
 * Admin: List reward ledger entries
 */
export async function listAdminRewardLedger(filters = {}, db) {
  if (!db) return { items: [], ledger: [], total: 0 };
  const { status, limit = 50, offset = 0 } = filters;

  let query = `
    SELECT
      l.*,
      u.email as user_email, u.display_name as user_name
    FROM referral_rewards_ledger l
    LEFT JOIN users u ON l.user_id = u.id
  `;
  const params = [];

  if (status) {
    query += ' WHERE l.status = ?';
    params.push(status);
  }

  query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const res = await db.prepare(query).bind(...params).all().catch(() => ({ results: [] }));
  const items = res.results || [];
  return { items, ledger: items, total: items.length };
}

/**
 * Admin: Approve a referral and disburse rewards
 */
export async function adminApproveReferral(attributionId, adminUser, db, env) {
  if (!attributionId || !db) throw new Error('Missing attribution ID');
  const now = new Date().toISOString();

  const attr = await db.prepare(
    'SELECT * FROM referral_attributions WHERE id = ? LIMIT 1'
  ).bind(attributionId).first().catch(() => null);

  if (!attr) throw new Error('Attribution record not found');

  // Find associated ledger entries
  const ledgers = await db.prepare(
    'SELECT * FROM referral_rewards_ledger WHERE attribution_id = ?'
  ).bind(attributionId).all().catch(() => ({ results: [] }));

  for (const item of (ledgers.results || [])) {
    if (item.status === LEDGER_STATUS.PENDING) {
      await db.prepare(`
        UPDATE referral_rewards_ledger
        SET status = 'GRANTED', granted_at = ?, admin_notes = ?, updated_at = ?
        WHERE id = ?
      `).bind(now, `Approved by admin ${adminUser?.email || 'admin'}`, now, item.id).run().catch(() => {});

      // Disburse platform entitlement
      await grantPlatformEntitlement(item.user_id, item.reward_type, item.reward_amount, db);
    }
  }

  await db.prepare(`
    UPDATE referral_attributions
    SET status = 'REWARDED'
    WHERE id = ?
  `).bind(attributionId).run().catch(() => {});

  return { success: true, attributionId, status: 'REWARDED' };
}

/**
 * Admin: Reject a referral
 */
export async function adminRejectReferral(attributionId, reason = 'Flagged by admin', adminUser, db) {
  if (!attributionId || !db) throw new Error('Missing attribution ID');
  const now = new Date().toISOString();

  await db.prepare(`
    UPDATE referral_rewards_ledger
    SET status = 'REJECTED', admin_notes = ?, updated_at = ?
    WHERE attribution_id = ?
  `).bind(`Rejected by ${adminUser?.email || 'admin'}: ${reason}`, now, attributionId).run().catch(() => {});

  await db.prepare(`
    UPDATE referral_attributions
    SET status = 'REJECTED'
    WHERE id = ?
  `).bind(attributionId).run().catch(() => {});

  return { success: true, attributionId, status: 'REJECTED' };
}

/**
 * Admin: Update referral program settings
 */
export async function updateProgramConfig(newConfig, adminUser, db) {
  if (!db) throw new Error('Database connection required');
  const now = new Date().toISOString();

  const current = await getProgramConfig(db);
  const updated = {
    ...current,
    ...newConfig,
    updatedAt: now
  };

  await db.prepare(`
    UPDATE referral_programs
    SET name = ?, is_active = ?, qualifying_event = ?,
        referrer_reward_type = ?, referrer_reward_amount = ?,
        referee_reward_type = ?, referee_reward_amount = ?,
        max_referrals_per_user = ?, attribution_window_days = ?,
        require_admin_approval = ?, fraud_strictness = ?,
        terms_summary = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    updated.name || current.name,
    updated.isActive ? 1 : 0,
    updated.qualifyingEvent || current.qualifyingEvent,
    updated.referrerRewardType || current.referrerRewardType,
    Number(updated.referrerRewardAmount) || current.referrerRewardAmount,
    updated.refereeRewardType || current.refereeRewardType,
    Number(updated.refereeRewardAmount) || current.refereeRewardAmount,
    Number(updated.maxReferralsPerUser) || current.maxReferralsPerUser,
    Number(updated.attributionWindowDays) || current.attributionWindowDays,
    updated.requireAdminApproval ? 1 : 0,
    updated.fraudStrictness || current.fraudStrictness,
    updated.termsSummary || current.termsSummary,
    now,
    current.id
  ).run();

  return { success: true, config: updated, ...updated };
}

/**
 * Admin: List fraud logs
 */
export async function getAdminFraudLogs(filters = {}, db) {
  if (!db) return { items: [], logs: [], total: 0 };
  const { limit = 50, offset = 0 } = filters;

  const res = await db.prepare(`
    SELECT * FROM referral_fraud_logs
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all().catch(() => ({ results: [] }));

  const items = res.results || [];
  return { items, logs: items, total: items.length };
}

/**
 * Validate vanity / custom referral slug format
 */
export function validateCustomReferralSlug(slug) {
  if (!slug || typeof slug !== 'string') return { valid: false, error: 'Slug is required' };
  const trimmed = slug.trim();
  if (trimmed.length < 4 || trimmed.length > 20) {
    return { valid: false, error: 'Custom slug must be between 4 and 20 characters' };
  }
  const RESERVED = ['ADMIN', 'ROOT', 'WISH', 'MAGIC', 'VIP', 'OFFICIAL', 'SUPPORT', 'HELP', 'SYSTEM'];
  if (RESERVED.includes(trimmed.toUpperCase())) {
    return { valid: false, error: 'This custom slug is reserved' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { valid: false, error: 'Custom slug can only contain letters, numbers, hyphens and underscores' };
  }
  return { valid: true, slug: trimmed.toUpperCase() };
}

/**
 * Pure risk scoring calculation helper
 */
export function calculateRiskScore({
  referrerUserId,
  refereeUserId,
  referrerEmail,
  refereeEmail,
  referrerIp,
  refereeIp,
  recentReferralsCount = 0,
  isCircular = false,
  isMaxLimitExceeded = false
}) {
  const flags = [];
  let score = 0;

  if (referrerUserId && refereeUserId && referrerUserId === refereeUserId) {
    flags.push('SELF_REFERRAL_SAME_USER_ID');
    score += 100;
  }

  if (referrerEmail && refereeEmail) {
    if (referrerEmail.trim().toLowerCase() === refereeEmail.trim().toLowerCase()) {
      flags.push('SELF_REFERRAL_IDENTICAL_EMAIL');
      score += 100;
    } else {
      const b1 = referrerEmail.split('@')[0].split('+')[0].toLowerCase();
      const b2 = refereeEmail.split('@')[0].split('+')[0].toLowerCase();
      const d1 = referrerEmail.split('@')[1]?.toLowerCase();
      const d2 = refereeEmail.split('@')[1]?.toLowerCase();
      if (b1 === b2 && d1 === d2) {
        flags.push('SUSPICIOUS_ALIAS_EMAIL');
        score += 70;
      }
    }
  }

  if (isCircular) {
    flags.push('CIRCULAR_REFERRAL_LOOP');
    score += 90;
  }

  if (referrerIp && refereeIp && referrerIp === refereeIp && referrerIp !== '127.0.0.1') {
    flags.push('SAME_IP_ADDRESS_COLLISION');
    score += 45;
  }

  if (recentReferralsCount >= 15) {
    flags.push('HIGH_VELOCITY_INVITES');
    score += 50;
  }

  if (isMaxLimitExceeded) {
    flags.push('MAX_REFERRALS_LIMIT_EXCEEDED');
    score += 80;
  }

  return {
    riskScore: Math.min(score, 100),
    flags,
    isClean: score < 40,
    action: score >= 90 ? 'BLOCKED' : (score >= 40 ? 'FLAGGED' : 'ALLOWED')
  };
}

/**
 * In-Memory Mock D1 Database for high-speed testing and local development
 */
export function createMockReferralDatabase(seed = {}) {
  const state = {
    programs: seed.programs || [
      {
        id: 'default_program',
        name: 'WishMagic Friends & Family Rewards',
        is_active: 1,
        qualifying_event: 'FIRST_WISH',
        referrer_reward_type: 'PREMIUM_DAYS',
        referrer_reward_amount: 7,
        referee_reward_type: 'PREMIUM_DAYS',
        referee_reward_amount: 3,
        required_referrals_for_reward: 1,
        count_free_templates: 1,
        max_referrals_per_user: 50,
        attribution_window_days: 30,
        require_admin_approval: 0,
        fraud_strictness: 'standard',
        terms_summary: 'Invite friends to WishMagic.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    user_referral_codes: seed.user_referral_codes || [],
    referral_attributions: seed.referral_attributions || [],
    referral_rewards_ledger: seed.referral_rewards_ledger || [],
    referral_fraud_logs: seed.referral_fraud_logs || [],
    users: seed.users || [],
    entitlements: seed.entitlements || []
  };

  return {
    _state: state,
    prepare(sql) {
      let boundParams = [];
      return {
        bind(...params) {
          boundParams = params;
          return this;
        },
        async first() {
          const res = await this.all();
          return res.results && res.results.length > 0 ? res.results[0] : null;
        },
        async all() {
          const cleanSql = sql.replace(/\s+/g, ' ').trim();
          if (cleanSql.includes('FROM referral_programs')) {
            return { results: [...state.programs] };
          }
          if (cleanSql.includes('FROM user_referral_codes WHERE user_id = ?')) {
            const uid = boundParams[0];
            const found = state.user_referral_codes.find(c => c.user_id === uid);
            return { results: found ? [found] : [] };
          }
          if (cleanSql.includes('FROM user_referral_codes WHERE referral_code = ? OR custom_slug = ?')) {
            const code = boundParams[0];
            const found = state.user_referral_codes.find(c => c.referral_code === code || c.custom_slug === code);
            return { results: found ? [found] : [] };
          }
          if (cleanSql.includes('FROM user_referral_codes WHERE referral_code = ?')) {
            const code = boundParams[0];
            const found = state.user_referral_codes.find(c => c.referral_code === code);
            return { results: found ? [found] : [] };
          }
          if (cleanSql.includes('COUNT(DISTINCT referral_code) as totalCodes') || cleanSql.includes('SUM(total_clicks) as totalClicks')) {
            const totalCodes = state.user_referral_codes.length;
            const totalClicks = state.user_referral_codes.reduce((s, c) => s + (Number(c.total_clicks) || 0), 0);
            const totalSignups = state.user_referral_codes.reduce((s, c) => s + (Number(c.total_signups) || 0), 0);
            const totalQualified = state.user_referral_codes.reduce((s, c) => s + (Number(c.total_qualified) || 0), 0);
            return { results: [{ totalCodes, totalClicks, totalSignups, totalQualified }] };
          }
          if (cleanSql.includes('FROM user_referral_codes')) {
            return { results: [...state.user_referral_codes] };
          }
          if (cleanSql.includes('FROM referral_attributions WHERE visitor_token = ? AND status = "VISITED"')) {
            const tok = boundParams[0];
            const found = state.referral_attributions.find(a => a.visitor_token === tok && a.status === 'VISITED');
            return { results: found ? [found] : [] };
          }
          if (cleanSql.includes('FROM referral_attributions WHERE visitor_token = ? AND referral_code = ?')) {
            const tok = boundParams[0];
            const code = boundParams[1];
            const found = state.referral_attributions.find(a => a.visitor_token === tok && a.referral_code === code);
            return { results: found ? [found] : [] };
          }
          if (cleanSql.includes('FROM referral_attributions WHERE referee_user_id = ?')) {
            const uid = boundParams[0];
            const found = state.referral_attributions.filter(a => a.referee_user_id === uid);
            return { results: found };
          }
          if (cleanSql.includes('FROM referral_attributions WHERE referrer_user_id = ? AND referee_user_id = ?')) {
            const r1 = boundParams[0];
            const r2 = boundParams[1];
            const found = state.referral_attributions.find(a => a.referrer_user_id === r1 && a.referee_user_id === r2);
            return { results: found ? [found] : [] };
          }
          if (cleanSql.includes('FROM referral_attributions WHERE referrer_user_id = ? AND attributed_at > ?')) {
            const r1 = boundParams[0];
            const time = boundParams[1];
            const found = state.referral_attributions.filter(a => a.referrer_user_id === r1 && a.attributed_at > time);
            return { results: [{ count: found.length }] };
          }
          if (cleanSql.includes('FROM referral_attributions WHERE referrer_user_id = ? AND status IN (\'QUALIFIED\', \'REWARDED\')')) {
            const r1 = boundParams[0];
            const found = state.referral_attributions.filter(a => a.referrer_user_id === r1 && (a.status === 'QUALIFIED' || a.status === 'REWARDED'));
            return { results: [{ count: found.length }] };
          }
          if (cleanSql.includes('FROM referral_attributions WHERE referrer_user_id = ?')) {
            const uid = boundParams[0];
            const found = state.referral_attributions.filter(a => a.referrer_user_id === uid);
            return { results: found };
          }
          if (cleanSql.includes('FROM referral_attributions WHERE id = ?')) {
            const id = boundParams[0];
            const found = state.referral_attributions.find(a => a.id === id);
            return { results: found ? [found] : [] };
          }
          if (cleanSql.includes('FROM referral_attributions')) {
            if (cleanSql.includes('count(*)')) {
              return { results: [{ count: state.referral_attributions.length }] };
            }
            return { results: [...state.referral_attributions] };
          }
          if (cleanSql.includes('FROM referral_rewards_ledger WHERE idempotency_key = ?')) {
            const key = boundParams[0];
            const found = state.referral_rewards_ledger.find(l => l.idempotency_key === key);
            return { results: found ? [found] : [] };
          }
          if (cleanSql.includes('FROM referral_rewards_ledger WHERE id = ? AND user_id = ?')) {
            const id = boundParams[0];
            const uid = boundParams[1];
            const found = state.referral_rewards_ledger.find(l => l.id === id && l.user_id === uid);
            return { results: found ? [found] : [] };
          }
          if (cleanSql.includes('FROM referral_rewards_ledger WHERE attribution_id = ?')) {
            const id = boundParams[0];
            const found = state.referral_rewards_ledger.filter(l => l.attribution_id === id);
            return { results: found };
          }
          if (cleanSql.includes('FROM referral_rewards_ledger WHERE user_id = ?')) {
            const uid = boundParams[0];
            const found = state.referral_rewards_ledger.filter(l => l.user_id === uid);
            return { results: found };
          }
          if (cleanSql.includes('FROM referral_rewards_ledger WHERE status = \'PENDING\'')) {
            const found = state.referral_rewards_ledger.filter(l => l.status === 'PENDING');
            return { results: [{ count: found.length }] };
          }
          if (cleanSql.includes('FROM referral_rewards_ledger')) {
            return { results: [...state.referral_rewards_ledger] };
          }
          if (cleanSql.includes('FROM users WHERE id IN')) {
            const uids = boundParams;
            const found = state.users.filter(u => uids.includes(u.id));
            return { results: found };
          }
          if (cleanSql.includes('FROM referral_fraud_logs')) {
            if (cleanSql.includes('SELECT count(*) as count')) {
              return { results: [{ count: state.referral_fraud_logs.length }] };
            }
            return { results: [...state.referral_fraud_logs] };
          }
          if (cleanSql.includes('FROM entitlements WHERE user_id = ?')) {
            const uid = boundParams[0];
            const found = state.entitlements.filter(e => e.user_id === uid);
            return { results: found };
          }
          return { results: [] };
        },
        async run() {
          const cleanSql = sql.replace(/\s+/g, ' ').trim();
          if (cleanSql.startsWith('INSERT INTO user_referral_codes')) {
            state.user_referral_codes.push({
              id: boundParams[0],
              user_id: boundParams[1],
              referral_code: boundParams[2],
              custom_slug: null,
              total_clicks: 0,
              total_signups: 0,
              total_qualified: 0,
              total_rewards_earned: 0,
              is_active: 1,
              created_at: boundParams[boundParams.length - 2] || new Date().toISOString(),
              updated_at: boundParams[boundParams.length - 1] || new Date().toISOString()
            });
            return { changes: 1 };
          }
          if (cleanSql.includes('UPDATE user_referral_codes SET total_clicks = total_clicks + 1')) {
            const updatedAt = boundParams[0];
            const id = boundParams[1];
            const rec = state.user_referral_codes.find(c => c.id === id);
            if (rec) {
              rec.total_clicks = (Number(rec.total_clicks) || 0) + 1;
              rec.updated_at = updatedAt;
            }
            return { changes: 1 };
          }
          if (cleanSql.includes('UPDATE user_referral_codes SET total_signups = total_signups + 1')) {
            const updatedAt = boundParams[0];
            const code = boundParams[1];
            const rec = state.user_referral_codes.find(c => c.referral_code === code);
            if (rec) {
              rec.total_signups = (Number(rec.total_signups) || 0) + 1;
              rec.updated_at = updatedAt;
            }
            return { changes: 1 };
          }
          if (cleanSql.includes('UPDATE user_referral_codes SET total_qualified = total_qualified + 1')) {
            const earned = boundParams[0];
            const updatedAt = boundParams[1];
            const code = boundParams[2];
            const rec = state.user_referral_codes.find(c => c.referral_code === code);
            if (rec) {
              rec.total_qualified = (Number(rec.total_qualified) || 0) + 1;
              rec.total_rewards_earned = (Number(rec.total_rewards_earned) || 0) + Number(earned);
              rec.updated_at = updatedAt;
            }
            return { changes: 1 };
          }
          if (cleanSql.startsWith('INSERT INTO referral_attributions')) {
            if (boundParams.length >= 9) {
              state.referral_attributions.push({
                id: boundParams[0],
                referral_code: boundParams[1],
                referrer_user_id: boundParams[2],
                referee_user_id: null,
                visitor_token: boundParams[3],
                landing_page: boundParams[4] || '/',
                ip_hash: boundParams[5] || null,
                user_agent_hash: boundParams[6] || null,
                status: 'VISITED',
                qualifying_event: null,
                attributed_at: boundParams[7] || new Date().toISOString(),
                expires_at: boundParams[8] || new Date().toISOString()
              });
            } else {
              state.referral_attributions.push({
                id: boundParams[0],
                referral_code: boundParams[1],
                referrer_user_id: boundParams[2],
                referee_user_id: null,
                visitor_token: boundParams[3],
                landing_page: '/',
                ip_hash: null,
                user_agent_hash: null,
                status: 'VISITED',
                qualifying_event: null,
                attributed_at: boundParams[4] || new Date().toISOString(),
                expires_at: boundParams[5] || new Date().toISOString()
              });
            }
            return { changes: 1 };
          }
          if (cleanSql.includes('UPDATE referral_attributions SET referee_user_id = ?')) {
            const refUserId = boundParams[0];
            const id = boundParams[1];
            const rec = state.referral_attributions.find(a => a.id === id);
            if (rec) {
              rec.referee_user_id = refUserId;
              rec.status = 'PENDING';
            }
            return { changes: 1 };
          }
          if (cleanSql.includes('UPDATE referral_attributions SET status = ?')) {
            const status = boundParams[0];
            const id = boundParams[boundParams.length - 1];
            const rec = state.referral_attributions.find(a => a.id === id);
            if (rec) {
              rec.status = status;
              if (boundParams.length > 2) {
                rec.qualifying_event = boundParams[1];
                rec.qualified_at = boundParams[2];
              }
            }
            return { changes: 1 };
          }
          if (cleanSql.startsWith('INSERT INTO referral_rewards_ledger')) {
            const hasExplicitType = boundParams.length >= 11;
            state.referral_rewards_ledger.push({
              id: boundParams[0],
              attribution_id: boundParams[1],
              user_id: boundParams[2],
              counterpart_user_id: boundParams[3],
              role: cleanSql.includes("'REFEREE'") ? 'REFEREE' : 'REFERRER',
              reward_type: hasExplicitType ? boundParams[4] : 'FREE_CUSTOM_LINK',
              reward_amount: hasExplicitType ? boundParams[5] : boundParams[4],
              status: hasExplicitType ? boundParams[6] : boundParams[5],
              idempotency_key: hasExplicitType ? boundParams[7] : boundParams[6],
              granted_at: hasExplicitType ? boundParams[8] : boundParams[7],
              details_json: hasExplicitType ? boundParams[9] : boundParams[8],
              created_at: hasExplicitType ? boundParams[10] : boundParams[9],
              updated_at: hasExplicitType ? boundParams[11] : boundParams[10]
            });
            return { changes: 1 };
          }
          if (cleanSql.includes("UPDATE referral_rewards_ledger SET status = 'CLAIMED'")) {
            const claimedAt = boundParams[0];
            const id = boundParams[2];
            const rec = state.referral_rewards_ledger.find(l => l.id === id);
            if (rec) {
              rec.status = 'CLAIMED';
              rec.claimed_at = claimedAt;
            }
            return { changes: 1 };
          }
          if (cleanSql.includes("UPDATE referral_rewards_ledger SET status = 'GRANTED'")) {
            const id = boundParams[3];
            const rec = state.referral_rewards_ledger.find(l => l.id === id);
            if (rec) {
              rec.status = 'GRANTED';
              rec.granted_at = boundParams[0];
              rec.admin_notes = boundParams[1];
            }
            return { changes: 1 };
          }
          if (cleanSql.includes("UPDATE referral_rewards_ledger SET status = 'REJECTED'")) {
            const notes = boundParams[0];
            const attrId = boundParams[2];
            for (const l of state.referral_rewards_ledger) {
              if (l.attribution_id === attrId) {
                l.status = 'REJECTED';
                l.admin_notes = notes;
              }
            }
            return { changes: 1 };
          }
          if (cleanSql.startsWith('INSERT INTO referral_fraud_logs')) {
            state.referral_fraud_logs.push({
              id: boundParams[0],
              referrer_user_id: boundParams[1],
              referee_user_id: boundParams[2],
              referral_code: boundParams[3],
              risk_score: boundParams[4],
              flag_reasons: boundParams[5],
              ip_address: boundParams[6],
              device_info: boundParams[7],
              action_taken: boundParams[8],
              created_at: boundParams[9]
            });
            return { changes: 1 };
          }
          if (cleanSql.startsWith('INSERT INTO entitlements')) {
            state.entitlements.push({
              id: boundParams[0],
              user_id: boundParams[1],
              item_type: 'referral_vip',
              plan: 'VIP',
              status: 'active',
              source: 'referral',
              starts_at: boundParams[2],
              expires_at: boundParams[3],
              created_at: boundParams[4],
              updated_at: boundParams[5]
            });
            return { changes: 1 };
          }
          if (cleanSql.includes('UPDATE entitlements SET expires_at = ?')) {
            const newExp = boundParams[0];
            const id = boundParams[2];
            const rec = state.entitlements.find(e => e.id === id);
            if (rec) {
              rec.expires_at = newExp;
            }
            return { changes: 1 };
          }
          if (cleanSql.startsWith('UPDATE referral_programs')) {
            if (state.programs.length > 0) {
              state.programs[0] = {
                ...state.programs[0],
                name: boundParams[0],
                is_active: boundParams[1],
                qualifying_event: boundParams[2],
                referrer_reward_type: boundParams[3],
                referrer_reward_amount: boundParams[4],
                referee_reward_type: boundParams[5],
                referee_reward_amount: boundParams[6],
                max_referrals_per_user: boundParams[7],
                attribution_window_days: boundParams[8],
                require_admin_approval: boundParams[9],
                fraud_strictness: boundParams[10],
                terms_summary: boundParams[11],
                updated_at: boundParams[12]
              };
            }
            return { changes: 1 };
          }
          return { changes: 0 };
        }
      };
    }
  };
}
