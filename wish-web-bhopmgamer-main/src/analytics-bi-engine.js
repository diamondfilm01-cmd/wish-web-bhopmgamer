/**
 * WishMagic Complete Production Analytics & Business Intelligence Engine (Part 33)
 * ==============================================================================
 * Real-Time Admin Dashboard + Revenue Analytics + User Growth + Template Performance
 * + Wish Lifecycle Analytics + Funnel Tracking + Safe CSV Reports + Alerts
 *
 * All financial arithmetic uses integer minor units (paise) for zero loss.
 * Standard Indian Business Reporting Timezone: Asia/Kolkata (UTC+05:30).
 */

import { isAuthoritativeAdmin, createAuditLogEntry } from './admin-operations-engine.js';
import { ORDER_STATUS } from './commerce-engine.js';

// ============================================================================
// 1. CONSTANTS, EVENT SCHEMAS & TIMEZONE DEFINITIONS
// ============================================================================

export const REPORTING_TIMEZONE = 'Asia/Kolkata';
export const TIMEZONE_OFFSET_MS = 5.5 * 60 * 60 * 1000; // IST is UTC +05:30

export const ANALYTICS_EVENT_TYPES = Object.freeze({
  TEMPLATE_DETAIL_VIEWED: 'template_detail_viewed',
  CREATE_WISH_CLICKED: 'create_wish_clicked',
  CUSTOMIZER_OPENED: 'customizer_opened',
  WISH_DRAFT_CREATED: 'wish_draft_created',
  WISH_PUBLISH_ATTEMPTED: 'wish_publish_attempted',
  WISH_PUBLISHED: 'wish_published',
  WISH_SHARED: 'wish_shared',
  CHECKOUT_STARTED: 'checkout_started',
  CHECKOUT_RETURNED: 'checkout_returned',
  PAYMENT_VERIFIED: 'payment_verified',
  REFUND_COMPLETED: 'refund_completed',
  TEMPLATE_FAVORITED: 'template_favorited'
});

// Aliases for historical / browser events compatibility
export const EVENT_NAME_ALIASES = Object.freeze({
  'template_viewed': ANALYTICS_EVENT_TYPES.TEMPLATE_DETAIL_VIEWED,
  'template_create_click': ANALYTICS_EVENT_TYPES.CREATE_WISH_CLICKED,
  'wish_draft_saved': ANALYTICS_EVENT_TYPES.WISH_DRAFT_CREATED,
  'publish_attempted': ANALYTICS_EVENT_TYPES.WISH_PUBLISH_ATTEMPTED,
  'wish_created': ANALYTICS_EVENT_TYPES.WISH_PUBLISHED
});

export const DATE_RANGE_PRESETS = Object.freeze({
  TODAY: 'today',
  YESTERDAY: 'yesterday',
  SEVEN_DAYS: '7d',
  THIRTY_DAYS: '30d',
  NINETY_DAYS: '90d',
  THIS_MONTH: 'this_month',
  PREV_MONTH: 'prev_month',
  THIS_YEAR: 'this_year',
  ALL_TIME: 'all',
  CUSTOM: 'custom'
});

export const ERROR_CODES = Object.freeze({
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  RANGE_EXCEEDED: 'RANGE_EXCEEDED',
  EVENT_VALIDATION_ERROR: 'EVENT_VALIDATION_ERROR',
  EXPORT_GENERATION_FAILED: 'EXPORT_GENERATION_FAILED'
});

// ============================================================================
// 2. TIMEZONE & DATE RANGE CALCULATOR (ASIA/KOLKATA BOUNDED)
// ============================================================================

/**
 * Converts a UTC timestamp into YYYY-MM-DD in Asia/Kolkata
 */
export function formatIstDateKey(dateInput) {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return null;
  // Shift by IST offset
  const istTime = new Date(date.getTime() + TIMEZONE_OFFSET_MS);
  return istTime.toISOString().slice(0, 10);
}

/**
 * Calculates start and end ISO bounds for preset or custom range in Asia/Kolkata,
 * as well as an identical-duration previous comparison period.
 */
export function getDateRangeBounds(rangeKey = '30d', customStart = null, customEnd = null) {
  const now = new Date();
  const nowIstMs = now.getTime() + TIMEZONE_OFFSET_MS;
  const nowIst = new Date(nowIstMs);

  let startUtcMs = 0;
  let endUtcMs = now.getTime();
  let label = 'Last 30 Days';

  const todayIstStartMs = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate())).getTime() - TIMEZONE_OFFSET_MS;
  const todayIstEndMs = todayIstStartMs + (24 * 60 * 60 * 1000) - 1;

  switch (rangeKey) {
    case DATE_RANGE_PRESETS.TODAY:
      startUtcMs = todayIstStartMs;
      endUtcMs = todayIstEndMs;
      label = 'Today';
      break;

    case DATE_RANGE_PRESETS.YESTERDAY:
      startUtcMs = todayIstStartMs - (24 * 60 * 60 * 1000);
      endUtcMs = todayIstStartMs - 1;
      label = 'Yesterday';
      break;

    case DATE_RANGE_PRESETS.SEVEN_DAYS:
      startUtcMs = todayIstStartMs - (6 * 24 * 60 * 60 * 1000);
      endUtcMs = now.getTime();
      label = 'Last 7 Days';
      break;

    case DATE_RANGE_PRESETS.THIRTY_DAYS:
      startUtcMs = todayIstStartMs - (29 * 24 * 60 * 60 * 1000);
      endUtcMs = now.getTime();
      label = 'Last 30 Days';
      break;

    case DATE_RANGE_PRESETS.NINETY_DAYS:
      startUtcMs = todayIstStartMs - (89 * 24 * 60 * 60 * 1000);
      endUtcMs = now.getTime();
      label = 'Last 90 Days';
      break;

    case DATE_RANGE_PRESETS.THIS_MONTH: {
      const monthStartIstMs = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), 1)).getTime() - TIMEZONE_OFFSET_MS;
      startUtcMs = monthStartIstMs;
      endUtcMs = now.getTime();
      label = 'This Month';
      break;
    }

    case DATE_RANGE_PRESETS.PREV_MONTH: {
      const prevMonthStartIstMs = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth() - 1, 1)).getTime() - TIMEZONE_OFFSET_MS;
      const prevMonthEndIstMs = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), 1)).getTime() - TIMEZONE_OFFSET_MS - 1;
      startUtcMs = prevMonthStartIstMs;
      endUtcMs = prevMonthEndIstMs;
      label = 'Previous Month';
      break;
    }

    case DATE_RANGE_PRESETS.THIS_YEAR: {
      const yearStartIstMs = new Date(Date.UTC(nowIst.getUTCFullYear(), 0, 1)).getTime() - TIMEZONE_OFFSET_MS;
      startUtcMs = yearStartIstMs;
      endUtcMs = now.getTime();
      label = 'This Year';
      break;
    }

    case DATE_RANGE_PRESETS.ALL_TIME:
      startUtcMs = 0;
      endUtcMs = now.getTime();
      label = 'All Time';
      break;

    case DATE_RANGE_PRESETS.CUSTOM: {
      if (!customStart || !customEnd) {
        const err = new Error('Both start and end dates required for custom range');
        err.code = ERROR_CODES.INVALID_DATE_RANGE;
        throw err;
      }

      const sDate = new Date(customStart + 'T00:00:00.000Z');
      const eDate = new Date(customEnd + 'T23:59:59.999Z');

      if (isNaN(sDate.getTime()) || isNaN(eDate.getTime())) {
        const err = new Error('Invalid custom date format. Expected YYYY-MM-DD');
        err.code = ERROR_CODES.INVALID_DATE_RANGE;
        throw err;
      }

      startUtcMs = sDate.getTime() - TIMEZONE_OFFSET_MS;
      endUtcMs = eDate.getTime() - TIMEZONE_OFFSET_MS;

      if (startUtcMs > endUtcMs) {
        const err = new Error('Start date cannot be after end date');
        err.code = ERROR_CODES.INVALID_DATE_RANGE;
        throw err;
      }

      // Max 366 days
      const durationDays = (endUtcMs - startUtcMs) / (24 * 60 * 60 * 1000);
      if (durationDays > 366) {
        const err = new Error('Custom range cannot exceed 366 days');
        err.code = ERROR_CODES.RANGE_EXCEEDED;
        throw err;
      }

      label = `${customStart} to ${customEnd}`;
      break;
    }

    default:
      startUtcMs = todayIstStartMs - (29 * 24 * 60 * 60 * 1000);
      endUtcMs = now.getTime();
      label = 'Last 30 Days';
  }

  const durationMs = endUtcMs - startUtcMs;
  const compEndUtcMs = startUtcMs - 1;
  const compStartUtcMs = Math.max(0, compEndUtcMs - durationMs);

  return {
    rangeKey,
    label,
    timezone: REPORTING_TIMEZONE,
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString(),
    startMs: startUtcMs,
    endMs: endUtcMs,
    comparison: {
      startIso: new Date(compStartUtcMs).toISOString(),
      endIso: new Date(compEndUtcMs).toISOString(),
      startMs: compStartUtcMs,
      endMs: compEndUtcMs
    }
  };
}

/**
 * Calculates metric comparison change
 */
export function calculateComparison(currentVal = 0, previousVal = 0) {
  const current = Number(currentVal) || 0;
  const previous = Number(previousVal) || 0;
  const absoluteChange = current - previous;

  let percentageChange = null;
  let hasBaseline = false;

  if (previous > 0) {
    hasBaseline = true;
    percentageChange = Math.round(((current - previous) / previous) * 1000) / 10;
  } else if (previous === 0 && current > 0) {
    hasBaseline = false;
    percentageChange = null; // No previous baseline
  } else {
    hasBaseline = true;
    percentageChange = 0;
  }

  return {
    current,
    previous,
    absoluteChange,
    percentageChange,
    hasBaseline,
    trend: absoluteChange > 0 ? 'up' : absoluteChange < 0 ? 'down' : 'neutral'
  };
}

// ============================================================================
// 3. EXECUTIVE OVERVIEW & KPI CALCULATION
// ============================================================================

/**
 * Computes authoritative executive summary KPIs
 */
export function calculateExecutiveOverview({
  users = [],
  wishes = [],
  orders = [],
  refunds = [],
  events = [],
  dateBounds
}) {
  const { startMs, endMs, comparison } = dateBounds;

  // 1. User metrics
  const totalRegisteredUsers = users.length;
  const newUsersCurrent = users.filter(u => {
    const t = new Date(u.created_at || u.createdAt || 0).getTime();
    return t >= startMs && t <= endMs;
  }).length;
  const newUsersPrev = users.filter(u => {
    const t = new Date(u.created_at || u.createdAt || 0).getTime();
    return t >= comparison.startMs && t <= comparison.endMs;
  }).length;

  // 2. Wish metrics
  const totalWishesCreated = wishes.length;
  const wishesCreatedInPeriod = wishes.filter(w => {
    const t = new Date(w.created_at || w.createdAt || 0).getTime();
    return t >= startMs && t <= endMs;
  }).length;
  const wishesCreatedPrev = wishes.filter(w => {
    const t = new Date(w.created_at || w.createdAt || 0).getTime();
    return t >= comparison.startMs && t <= comparison.endMs;
  }).length;

  const wishesPublishedInPeriod = wishes.filter(w => {
    const isPub = w.status === 'published' || w.status === 'active' || w.is_published === 1;
    if (!isPub) return false;
    const t = new Date(w.published_at || w.publishedAt || w.updated_at || w.created_at || 0).getTime();
    return t >= startMs && t <= endMs;
  }).length;
  const wishesPublishedPrev = wishes.filter(w => {
    const isPub = w.status === 'published' || w.status === 'active' || w.is_published === 1;
    if (!isPub) return false;
    const t = new Date(w.published_at || w.publishedAt || w.updated_at || w.created_at || 0).getTime();
    return t >= comparison.startMs && t <= comparison.endMs;
  }).length;

  // Current lifecycle state distribution (snapshot, not bounded by date)
  const nowMs = Date.now();
  let liveActiveWishes = 0;
  let upcomingWishes = 0;
  let expiredWishes = 0;
  let draftWishes = 0;

  wishes.forEach(w => {
    const status = String(w.status || '').toLowerCase();
    const expMs = w.expires_at || w.expiresAt ? new Date(w.expires_at || w.expiresAt).getTime() : null;

    if (status === 'draft') {
      draftWishes++;
    } else if (status === 'expired' || (expMs && expMs <= nowMs)) {
      expiredWishes++;
    } else if (status === 'upcoming' || status === 'future') {
      upcomingWishes++;
    } else if (status === 'active' || status === 'published' || w.is_published === 1) {
      liveActiveWishes++;
    } else {
      liveActiveWishes++;
    }
  });

  // 3. Financial metrics (authoritative orders in D1)
  const isPaidOrder = (o) => (
    o.status === ORDER_STATUS.PAID || 
    o.status === ORDER_STATUS.PARTIALLY_REFUNDED ||
    o.status === 'PAID'
  );

  const periodPaidOrders = orders.filter(o => {
    if (!isPaidOrder(o)) return false;
    const t = new Date(o.paid_at || o.paidAt || o.created_at || o.createdAt || 0).getTime();
    return t >= startMs && t <= endMs;
  });

  const prevPaidOrders = orders.filter(o => {
    if (!isPaidOrder(o)) return false;
    const t = new Date(o.paid_at || o.paidAt || o.created_at || o.createdAt || 0).getTime();
    return t >= comparison.startMs && t <= comparison.endMs;
  });

  const grossRevenuePaiseCurrent = periodPaidOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0);
  const grossRevenuePaisePrev = prevPaidOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0);

  // Authoritative refunds from refunds table
  const periodRefunds = refunds.filter(r => {
    if (r.status !== 'SUCCEEDED' && r.status !== 'processed') return false;
    const t = new Date(r.created_at || r.createdAt || 0).getTime();
    return t >= startMs && t <= endMs;
  });
  const prevRefunds = refunds.filter(r => {
    if (r.status !== 'SUCCEEDED' && r.status !== 'processed') return false;
    const t = new Date(r.created_at || r.createdAt || 0).getTime();
    return t >= comparison.startMs && t <= comparison.endMs;
  });

  const refundPaiseCurrent = periodRefunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const refundPaisePrev = prevRefunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  const netRevenuePaiseCurrent = Math.max(0, grossRevenuePaiseCurrent - refundPaiseCurrent);
  const netRevenuePaisePrev = Math.max(0, grossRevenuePaisePrev - refundPaisePrev);

  const aovCurrent = periodPaidOrders.length > 0
    ? Math.round((grossRevenuePaiseCurrent / periodPaidOrders.length) / 100)
    : 0;
  const aovPrev = prevPaidOrders.length > 0
    ? Math.round((grossRevenuePaisePrev / prevPaidOrders.length) / 100)
    : 0;

  return {
    dateRange: {
      key: dateBounds.rangeKey,
      label: dateBounds.label,
      startIso: dateBounds.startIso,
      endIso: dateBounds.endIso,
      timezone: dateBounds.timezone
    },
    metrics: {
      totalUsers: {
        value: totalRegisteredUsers,
        description: 'Total creator accounts registered'
      },
      newUsers: {
        ...calculateComparison(newUsersCurrent, newUsersPrev),
        description: 'New registrations during selected window'
      },
      totalWishes: {
        value: totalWishesCreated,
        description: 'Lifetime wishes created on platform'
      },
      wishesCreated: {
        ...calculateComparison(wishesCreatedInPeriod, wishesCreatedPrev),
        description: 'Wishes created during selected window'
      },
      wishesPublished: {
        ...calculateComparison(wishesPublishedInPeriod, wishesPublishedPrev),
        description: 'Wishes successfully published in window'
      },
      paidOrders: {
        ...calculateComparison(periodPaidOrders.length, prevPaidOrders.length),
        description: 'Verified paid orders completed'
      },
      grossRevenue: {
        ...calculateComparison(Math.round(grossRevenuePaiseCurrent / 100), Math.round(grossRevenuePaisePrev / 100)),
        amountPaise: grossRevenuePaiseCurrent,
        currency: 'INR',
        description: 'Gross captured customer payments'
      },
      refunds: {
        ...calculateComparison(Math.round(refundPaiseCurrent / 100), Math.round(refundPaisePrev / 100)),
        count: periodRefunds.length,
        amountPaise: refundPaiseCurrent,
        currency: 'INR',
        description: 'Total completed refunds processed'
      },
      netRevenue: {
        ...calculateComparison(Math.round(netRevenuePaiseCurrent / 100), Math.round(netRevenuePaisePrev / 100)),
        amountPaise: netRevenuePaiseCurrent,
        currency: 'INR',
        description: 'Net collected revenue (Gross minus Refunds)'
      },
      averageOrderValue: {
        ...calculateComparison(aovCurrent, aovPrev),
        currency: 'INR',
        description: 'Average transaction value for paid orders'
      }
    },
    lifecycleSnapshot: {
      active: liveActiveWishes,
      upcoming: upcomingWishes,
      expired: expiredWishes,
      drafts: draftWishes,
      total: totalWishesCreated
    },
    freshness: {
      updatedAt: new Date().toISOString(),
      updatedAtIst: new Date(new Date().getTime() + TIMEZONE_OFFSET_MS).toISOString().replace('Z', '+05:30'),
      dataSources: ['D1:users', 'D1:wishes', 'D1:orders', 'D1:refunds', 'D1:analytics_events']
    }
  };
}

// ============================================================================
// 4. USER GROWTH & REGISTRATION TREND ANALYTICS
// ============================================================================

/**
 * Calculates user growth trajectory over time
 */
export function calculateUserAnalytics({ users = [], dateBounds }) {
  const { startMs, endMs } = dateBounds;

  // Filter users inside date range
  const periodUsers = users.filter(u => {
    const t = new Date(u.created_at || u.createdAt || 0).getTime();
    return t >= startMs && t <= endMs;
  });

  // Group by IST day
  const dailyBuckets = {};
  periodUsers.forEach(u => {
    const dateKey = formatIstDateKey(u.created_at || u.createdAt || 0);
    if (dateKey) {
      dailyBuckets[dateKey] = (dailyBuckets[dateKey] || 0) + 1;
    }
  });

  // Build continuous time series across the range
  const timeSeries = [];
  const startDay = new Date(startMs + TIMEZONE_OFFSET_MS);
  const endDay = new Date(endMs + TIMEZONE_OFFSET_MS);

  const cur = new Date(Date.UTC(startDay.getUTCFullYear(), startDay.getUTCMonth(), startDay.getUTCDate()));
  const endLimit = new Date(Date.UTC(endDay.getUTCFullYear(), endDay.getUTCMonth(), endDay.getUTCDate()));

  let runningTotal = users.filter(u => new Date(u.created_at || u.createdAt || 0).getTime() < startMs).length;

  while (cur <= endLimit) {
    const dateKey = cur.toISOString().slice(0, 10);
    const count = dailyBuckets[dateKey] || 0;
    runningTotal += count;
    timeSeries.push({
      date: dateKey,
      newUsers: count,
      cumulativeUsers: runningTotal
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  // User role and status breakdowns
  const roleBreakdown = {};
  const statusBreakdown = {};
  users.forEach(u => {
    const r = u.role || 'user';
    const s = u.status || 'active';
    roleBreakdown[r] = (roleBreakdown[r] || 0) + 1;
    statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;
  });

  return {
    totalUsers: users.length,
    newUsersInPeriod: periodUsers.length,
    timeSeries,
    roleBreakdown,
    statusBreakdown
  };
}

// ============================================================================
// 5. WISH FUNNEL & LIFECYCLE ANALYTICS
// ============================================================================

/**
 * Calculates 7-stage conversion funnel and lifecycle metrics
 */
export function calculateWishFunnel({ events = [], wishes = [], dateBounds }) {
  const { startMs, endMs } = dateBounds;

  // Filter events inside date bounds
  const periodEvents = events.filter(e => {
    const t = new Date(e.timestamp || 0).getTime();
    return t >= startMs && t <= endMs;
  });

  // Map event names to canonical stages
  const getCanonicalName = (name) => {
    const n = String(name || '').trim().toLowerCase();
    return EVENT_NAME_ALIASES[n] || n;
  };

  const stageKeys = [
    { key: ANALYTICS_EVENT_TYPES.TEMPLATE_DETAIL_VIEWED, label: '1. Template Detail Viewed' },
    { key: ANALYTICS_EVENT_TYPES.CREATE_WISH_CLICKED, label: '2. Create This Wish Clicked' },
    { key: ANALYTICS_EVENT_TYPES.CUSTOMIZER_OPENED, label: '3. Customizer Opened' },
    { key: ANALYTICS_EVENT_TYPES.WISH_DRAFT_CREATED, label: '4. Draft Saved' },
    { key: ANALYTICS_EVENT_TYPES.WISH_PUBLISH_ATTEMPTED, label: '5. Publish Attempted' },
    { key: ANALYTICS_EVENT_TYPES.WISH_PUBLISHED, label: '6. Wish Published' },
    { key: ANALYTICS_EVENT_TYPES.WISH_SHARED, label: '7. Wish Shared' }
  ];

  // Also include published wishes from database if publication events were partially logged
  const publishedWishesInPeriod = wishes.filter(w => {
    const isPub = w.status === 'published' || w.status === 'active' || w.is_published === 1;
    if (!isPub) return false;
    const t = new Date(w.published_at || w.publishedAt || w.updated_at || w.created_at || 0).getTime();
    return t >= startMs && t <= endMs;
  });

  const stageCounts = {};
  const stageUniqueUsers = {};

  stageKeys.forEach(s => {
    stageCounts[s.key] = 0;
    stageUniqueUsers[s.key] = new Set();
  });

  periodEvents.forEach(e => {
    const cName = getCanonicalName(e.event_name || e.eventName);
    if (stageCounts[cName] !== undefined) {
      stageCounts[cName]++;
      const uid = e.user_id || e.userId || e.session_id || e.sessionId || e.id;
      stageUniqueUsers[cName].add(uid);
    }
  });

  // Reconcile stage 6 (Published) with D1 published wishes count if events are lower
  if (publishedWishesInPeriod.length > stageCounts[ANALYTICS_EVENT_TYPES.WISH_PUBLISHED]) {
    stageCounts[ANALYTICS_EVENT_TYPES.WISH_PUBLISHED] = publishedWishesInPeriod.length;
    publishedWishesInPeriod.forEach(w => stageUniqueUsers[ANALYTICS_EVENT_TYPES.WISH_PUBLISHED].add(w.user_id || w.userId || w.id));
  }

  // Build funnel stages array with step-to-step conversion
  const stages = [];
  let previousUsers = null;

  stageKeys.forEach((s, idx) => {
    const currentUsers = stageUniqueUsers[s.key].size;
    const currentEvents = stageCounts[s.key];

    let conversionPct = null;
    let dropOffPct = null;

    if (idx === 0) {
      conversionPct = currentUsers > 0 ? 100 : 0;
      dropOffPct = 0;
    } else if (previousUsers !== null && previousUsers > 0) {
      conversionPct = Math.round((currentUsers / previousUsers) * 1000) / 10;
      dropOffPct = Math.max(0, Math.round((100 - conversionPct) * 10) / 10);
    }

    stages.push({
      step: idx + 1,
      stageKey: s.key,
      label: s.label,
      uniqueUsers: currentUsers,
      totalEvents: currentEvents,
      conversionPct,
      dropOffPct
    });

    previousUsers = currentUsers;
  });

  const topOfFunnel = stages[0].uniqueUsers;
  const bottomOfFunnel = stages[5].uniqueUsers; // Step 6: Wish Published
  const overallConversionPct = topOfFunnel > 0 ? Math.round((bottomOfFunnel / topOfFunnel) * 1000) / 10 : 0;

  return {
    stages,
    overallConversionPct,
    hasEventTracking: periodEvents.length > 0,
    note: periodEvents.length === 0
      ? 'No browser interaction events recorded during this window. Event collection is active for subsequent visitor sessions.'
      : null
  };
}

// ============================================================================
// 6. TEMPLATE MARKETPLACE PERFORMANCE & RANKINGS
// ============================================================================

/**
 * Calculates template performance ranking table with relationship variant breakdowns
 */
export function calculateTemplatePerformance({
  templates = [],
  families = [],
  variants = [],
  wishes = [],
  orders = [],
  orderItems = [],
  events = [],
  dateBounds
}) {
  const { startMs, endMs } = dateBounds;

  // Filter wishes and events
  const periodWishes = wishes.filter(w => {
    const t = new Date(w.created_at || w.createdAt || 0).getTime();
    return t >= startMs && t <= endMs;
  });

  const periodEvents = events.filter(e => {
    const t = new Date(e.timestamp || 0).getTime();
    return t >= startMs && t <= endMs;
  });

  // Track views and create clicks per template
  const viewsByTemplate = {};
  const createClicksByTemplate = {};

  periodEvents.forEach(e => {
    const tId = e.template_id || e.templateId;
    if (!tId) return;
    const name = String(e.event_name || e.eventName || '').toLowerCase();
    if (name === ANALYTICS_EVENT_TYPES.TEMPLATE_DETAIL_VIEWED || name === 'template_viewed') {
      viewsByTemplate[tId] = (viewsByTemplate[tId] || 0) + 1;
    } else if (name === ANALYTICS_EVENT_TYPES.CREATE_WISH_CLICKED || name === 'template_create_click') {
      createClicksByTemplate[tId] = (createClicksByTemplate[tId] || 0) + 1;
    }
  });

  // Track wish creations and publications per template and relationship
  const creationsByTemplate = {};
  const publishedByTemplate = {};
  const relationshipsByTemplate = {};

  periodWishes.forEach(w => {
    const tId = w.template_id || w.templateId || 'unknown';
    creationsByTemplate[tId] = (creationsByTemplate[tId] || 0) + 1;

    const isPub = w.status === 'published' || w.status === 'active' || w.is_published === 1;
    if (isPub) {
      publishedByTemplate[tId] = (publishedByTemplate[tId] || 0) + 1;
    }

    const rel = String(w.relationship || w.relation || 'general').trim().toLowerCase();
    if (!relationshipsByTemplate[tId]) relationshipsByTemplate[tId] = {};
    relationshipsByTemplate[tId][rel] = (relationshipsByTemplate[tId][rel] || 0) + 1;
  });

  // Track paid revenue per template from order items
  const paidOrderIds = new Set(
    orders
      .filter(o => o.status === ORDER_STATUS.PAID || o.status === 'PAID')
      .map(o => o.id)
  );

  const revenueByTemplatePaise = {};
  const purchasesByTemplate = {};

  orderItems.forEach(item => {
    if (!paidOrderIds.has(item.order_id || item.orderId)) return;
    const prodId = item.product_id || item.productId || '';
    let targetTemplateId = null;

    if (prodId.startsWith('template:')) {
      targetTemplateId = prodId.replace('template:', '');
    } else if (item.template_id || item.templateId) {
      targetTemplateId = item.template_id || item.templateId;
    }

    if (targetTemplateId) {
      const price = Number(item.unit_price || item.unitPrice || 0);
      revenueByTemplatePaise[targetTemplateId] = (revenueByTemplatePaise[targetTemplateId] || 0) + price;
      purchasesByTemplate[targetTemplateId] = (purchasesByTemplate[targetTemplateId] || 0) + 1;
    }
  });

  // Build ranking table
  const rankingTable = templates.map(tpl => {
    const tId = tpl.id;
    const views = viewsByTemplate[tId] || 0;
    const createClicks = createClicksByTemplate[tId] || 0;
    const wishesCreated = creationsByTemplate[tId] || 0;
    const wishesPublished = publishedByTemplate[tId] || 0;
    const purchases = purchasesByTemplate[tId] || 0;
    const revenuePaise = revenueByTemplatePaise[tId] || 0;
    const revenueRupees = Math.round(revenuePaise / 100);

    const conversionRate = views > 0 ? Math.round((wishesPublished / views) * 1000) / 10 : 0;
    const supportedVariants = variants.filter(v => v.template_id === tId || v.family_id === tpl.family_id || v.familyId === tpl.family_id).map(v => v.relationship);

    return {
      templateId: tId,
      name: tpl.name || tId,
      category: tpl.category || 'Celebration',
      tier: tpl.tier || (tpl.price > 0 ? 'vip' : 'free'),
      price: Number(tpl.price || 0),
      views,
      createClicks,
      wishesCreated,
      wishesPublished,
      purchases,
      revenueRupees,
      conversionRate,
      relationshipBreakdown: relationshipsByTemplate[tId] || {},
      supportedVariants: Array.from(new Set(supportedVariants))
    };
  }).sort((a, b) => (b.wishesPublished + b.purchases) - (a.wishesPublished + a.purchases));

  return {
    templatesCount: templates.length,
    rankingTable,
    totalCreations: periodWishes.length
  };
}

// ============================================================================
// 7. PAYMENT & REVENUE ANALYTICS
// ============================================================================

/**
 * Calculates complete revenue and order analytics
 */
export function calculateRevenueAnalytics({ orders = [], orderItems = [], refunds = [], dateBounds }) {
  const { startMs, endMs } = dateBounds;

  // Filter orders in period
  const periodOrders = orders.filter(o => {
    const t = new Date(o.created_at || o.createdAt || 0).getTime();
    return t >= startMs && t <= endMs;
  });

  // Status distribution
  const statusDistribution = {
    [ORDER_STATUS.PAID]: 0,
    [ORDER_STATUS.PENDING]: 0,
    [ORDER_STATUS.REFUNDED]: 0,
    [ORDER_STATUS.PARTIALLY_REFUNDED]: 0,
    [ORDER_STATUS.PAYMENT_FAILED]: 0,
    [ORDER_STATUS.CANCELLED]: 0
  };

  periodOrders.forEach(o => {
    const s = o.status || ORDER_STATUS.PENDING;
    statusDistribution[s] = (statusDistribution[s] || 0) + 1;
  });

  // Daily revenue series
  const dailyRevenue = {};
  const periodPaid = periodOrders.filter(o => o.status === ORDER_STATUS.PAID || o.status === ORDER_STATUS.PARTIALLY_REFUNDED);

  periodPaid.forEach(o => {
    const key = formatIstDateKey(o.paid_at || o.paidAt || o.created_at || o.createdAt || 0);
    if (key) {
      if (!dailyRevenue[key]) dailyRevenue[key] = { grossPaise: 0, count: 0, refundPaise: 0 };
      dailyRevenue[key].grossPaise += Number(o.amount || 0);
      dailyRevenue[key].count += 1;
    }
  });

  // Succeeded refunds
  const periodRefunds = refunds.filter(r => {
    const t = new Date(r.created_at || r.createdAt || 0).getTime();
    return t >= startMs && t <= endMs && (r.status === 'SUCCEEDED' || r.status === 'processed');
  });

  periodRefunds.forEach(r => {
    const key = formatIstDateKey(r.created_at || r.createdAt || 0);
    if (key) {
      if (!dailyRevenue[key]) dailyRevenue[key] = { grossPaise: 0, count: 0, refundPaise: 0 };
      dailyRevenue[key].refundPaise += Number(r.amount || 0);
    }
  });

  const timeSeries = Object.entries(dailyRevenue).map(([date, val]) => ({
    date,
    grossRupees: Math.round(val.grossPaise / 100),
    refundsRupees: Math.round(val.refundPaise / 100),
    netRupees: Math.max(0, Math.round((val.grossPaise - val.refundPaise) / 100)),
    ordersCount: val.count
  })).sort((a, b) => a.date.localeCompare(b.date));

  // Product breakdown
  const productPerformance = {};
  const paidIds = new Set(periodPaid.map(o => o.id));

  orderItems.forEach(item => {
    if (!paidIds.has(item.order_id || item.orderId)) return;
    const pId = item.product_id || item.productId || 'vip_pass';
    const pName = item.product_name || item.productName || pId;
    const price = Number(item.unit_price || item.unitPrice || 0);

    if (!productPerformance[pId]) {
      productPerformance[pId] = {
        productId: pId,
        productName: pName,
        purchases: 0,
        revenuePaise: 0
      };
    }
    productPerformance[pId].purchases += 1;
    productPerformance[pId].revenuePaise += price;
  });

  const productsList = Object.values(productPerformance).map(p => ({
    ...p,
    revenueRupees: Math.round(p.revenuePaise / 100)
  })).sort((a, b) => b.revenueRupees - a.revenueRupees);

  const totalGrossPaise = periodPaid.reduce((s, o) => s + Number(o.amount || 0), 0);
  const totalRefundPaise = periodRefunds.reduce((s, r) => s + Number(r.amount || 0), 0);

  return {
    totalOrders: periodOrders.length,
    paidOrders: periodPaid.length,
    grossRevenuePaise: totalGrossPaise,
    grossRevenueRupees: Math.round(totalGrossPaise / 100),
    refundsPaise: totalRefundPaise,
    refundsRupees: Math.round(totalRefundPaise / 100),
    netRevenueRupees: Math.max(0, Math.round((totalGrossPaise - totalRefundPaise) / 100)),
    statusDistribution,
    timeSeries,
    productPerformance: productsList,
    currency: 'INR'
  };
}

// ============================================================================
// 8. SAFE CSV EXPORT GENERATOR (FORMULA INJECTION HARDENED)
// ============================================================================

/**
 * Escapes a single CSV cell with strict spreadsheet formula injection mitigation
 * RFC 4180 compliant with leading quote prepending for dangerous prefixes.
 */
export function escapeCsvCell(value) {
  if (value === null || value === undefined) return '""';
  let str = String(value);

  // Formula injection defense: prepend single quote if starts with dangerous tokens
  const dangerousPrefixes = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerousPrefixes.some(prefix => str.startsWith(prefix))) {
    str = "'" + str;
  }

  // Double quotes escape
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Generates secure RFC 4180 CSV for administrative reporting
 */
export function generateSafeCsv({ reportType, data, filters = {} }) {
  const rows = [];

  switch (reportType) {
    case 'wishes': {
      rows.push(['Wish ID', 'Slug', 'Recipient Name', 'Template ID', 'Status', 'Event Date', 'Created At', 'Published At']);
      (data || []).forEach(w => {
        rows.push([
          w.id || '',
          w.slug || '',
          w.recipient_name || w.recipientName || '',
          w.template_id || w.templateId || '',
          w.status || 'draft',
          w.event_date || w.eventDate || '',
          w.created_at || w.createdAt || '',
          w.published_at || w.publishedAt || ''
        ]);
      });
      break;
    }

    case 'revenue': {
      rows.push(['Date (IST)', 'Gross Revenue (INR)', 'Refunds (INR)', 'Net Revenue (INR)', 'Paid Orders Count']);
      (data || []).forEach(d => {
        rows.push([
          d.date || '',
          d.grossRupees || 0,
          d.refundsRupees || 0,
          d.netRupees || 0,
          d.ordersCount || 0
        ]);
      });
      break;
    }

    case 'templates': {
      rows.push(['Template ID', 'Name', 'Category', 'Tier', 'Price (INR)', 'Views', 'Creations', 'Published', 'Purchases', 'Revenue (INR)', 'Conversion %']);
      (data || []).forEach(t => {
        rows.push([
          t.templateId || '',
          t.name || '',
          t.category || '',
          t.tier || 'free',
          t.price || 0,
          t.views || 0,
          t.wishesCreated || 0,
          t.wishesPublished || 0,
          t.purchases || 0,
          t.revenueRupees || 0,
          t.conversionRate || 0
        ]);
      });
      break;
    }

    case 'users': {
      rows.push(['User ID', 'Email', 'Display Name', 'Role', 'Status', 'Created At']);
      (data || []).forEach(u => {
        rows.push([
          u.id || '',
          u.email || '',
          u.display_name || u.displayName || '',
          u.role || 'user',
          u.status || 'active',
          u.created_at || u.createdAt || ''
        ]);
      });
      break;
    }

    case 'funnel': {
      rows.push(['Step', 'Stage Name', 'Unique Users', 'Total Events', 'Step Conversion %', 'Drop-off %']);
      (data || []).forEach(f => {
        rows.push([
          f.step || '',
          f.label || '',
          f.uniqueUsers || 0,
          f.totalEvents || 0,
          f.conversionPct !== null ? `${f.conversionPct}%` : 'N/A',
          f.dropOffPct !== null ? `${f.dropOffPct}%` : 'N/A'
        ]);
      });
      break;
    }

    default: {
      const err = new Error(`Unsupported export report type: ${reportType}`);
      err.code = ERROR_CODES.EXPORT_GENERATION_FAILED;
      throw err;
    }
  }

  return rows.map(r => r.map(escapeCsvCell).join(',')).join('\r\n');
}

// ============================================================================
// 9. EVENT INGESTION & PRIVACY BOUNDARY VALIDATOR
// ============================================================================

/**
 * Validates incoming analytics events. Enforces strict privacy invariants:
 * Strips private messages, voice note blobs, photos and passwords.
 */
export function validateAndSanitizeAnalyticsEvent(rawEvent = {}, authenticatedUser = null) {
  if (!rawEvent || typeof rawEvent !== 'object') {
    const err = new Error('Invalid analytics event payload');
    err.code = ERROR_CODES.EVENT_VALIDATION_ERROR;
    throw err;
  }

  const rawName = String(rawEvent.eventName || rawEvent.event_name || rawEvent.event || '').trim().toLowerCase();
  if (!rawName) {
    const err = new Error('Event name is required');
    err.code = ERROR_CODES.EVENT_VALIDATION_ERROR;
    throw err;
  }

  // Canonicalize event name
  const canonicalName = EVENT_NAME_ALIASES[rawName] || rawName;

  // Enforce max string lengths & privacy
  const sanitized = {
    id: 'evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6),
    event_name: canonicalName.slice(0, 60),
    user_id: authenticatedUser ? authenticatedUser.id : (rawEvent.userId || rawEvent.user_id || 'guest').slice(0, 64),
    session_id: rawEvent.sessionId || rawEvent.session_id ? String(rawEvent.sessionId || rawEvent.session_id).slice(0, 64) : null,
    wish_id: rawEvent.wishId || rawEvent.wish_id ? String(rawEvent.wishId || rawEvent.wish_id).slice(0, 64) : null,
    slug: rawEvent.slug ? String(rawEvent.slug).slice(0, 100) : null,
    template_id: rawEvent.templateId || rawEvent.template_id ? String(rawEvent.templateId || rawEvent.template_id).slice(0, 64) : null,
    template_name: rawEvent.templateName || rawEvent.template_name ? String(rawEvent.templateName || rawEvent.template_name).slice(0, 100) : null,
    template_family_id: rawEvent.templateFamilyId || rawEvent.template_family_id ? String(rawEvent.templateFamilyId || rawEvent.template_family_id).slice(0, 64) : null,
    template_version_id: rawEvent.templateVersionId || rawEvent.template_version_id ? String(rawEvent.templateVersionId || rawEvent.template_version_id).slice(0, 32) : null,
    relationship_variant_id: rawEvent.relationshipVariantId || rawEvent.relationship_variant_id ? String(rawEvent.relationshipVariantId || rawEvent.relationship_variant_id).slice(0, 64) : null,
    category: rawEvent.category ? String(rawEvent.category).slice(0, 40) : null,
    recipient_name: rawEvent.recipientName || rawEvent.recipient_name ? String(rawEvent.recipientName || rawEvent.recipient_name).slice(0, 60) : null,
    order_id: rawEvent.orderId || rawEvent.order_id ? String(rawEvent.orderId || rawEvent.order_id).slice(0, 64) : null,
    source: rawEvent.source ? String(rawEvent.source).slice(0, 40) : 'direct',
    schema_version: 1,
    timestamp: rawEvent.timestamp ? new Date(rawEvent.timestamp).toISOString() : new Date().toISOString()
  };

  // Safe metadata: strip any secret / large binary content
  const rawMeta = rawEvent.metadata && typeof rawEvent.metadata === 'object' ? rawEvent.metadata : {};
  const safeMeta = {};

  ['planId', 'productId', 'price', 'currency', 'step', 'referrer', 'deviceType', 'browser'].forEach(key => {
    if (rawMeta[key] !== undefined) {
      safeMeta[key] = String(rawMeta[key]).slice(0, 100);
    }
  });

  sanitized.metadata = JSON.stringify(safeMeta);

  return sanitized;
}
