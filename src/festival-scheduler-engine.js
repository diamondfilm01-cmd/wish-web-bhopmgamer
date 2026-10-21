/**
 * WishMagic Enterprise Festival Scheduler & Authoritative Campaign Engine (Part 52)
 * =================================================================================
 * Responsibilities:
 * 1. Annual Festival Calendar Definitions & Multi-Approach Date Resolution:
 *    - FIXED_GREGORIAN (deterministic fixed month/day observances)
 *    - DETERMINISTIC_RULE (algorithmic weekday/Easter rules)
 *    - VERIFIED_CALENDAR_TABLE (maintained authoritative Panchang/Gazette dates 2024-2030)
 *    - EXTERNAL_PROVIDER (remote calendar feed with timeout, retry, rate-limit, schema validation & last-valid preservation)
 *    - MANUAL_ADMIN (administrator-entered dates)
 * 2. Year-Scoped Manual Date Overrides & Explicit Date Precedence:
 *    - Tier 1: Active Manual Override for (festival_id, applicable_year)
 *    - Tier 2: Confirmed Automatic or Imported Date for (festival_id, applicable_year)
 *    - Tier 3: Unconfirmed / Unavailable (never silently promoted to production)
 * 3. Timezone-Aware Calendar-Day Publication Window Calculation:
 *    - Start Date = F - daysBefore (default 15 calendar days, inclusive)
 *    - End Date   = F + daysAfter  (default 3 calendar days, inclusive)
 *    - First Blocked Date = End Date + 1 calendar day
 *    - Authoritative Interval:
 *      startOfDay(start_date, timezone) <= current_time < startOfDay(end_date + 1 calendar day, timezone)
 * 4. Campaign State Machine & Template/Variant Assignment Management:
 *    - Statuses: DRAFT, SCHEDULED, ACTIVE, PAUSED, ENDED, CANCELLED
 *    - Non-destructive assignment of existing WishMagic templates & relation variants
 *    - Deterministic deduplication when a reusable template is assigned to multiple festivals
 * 5. In-Memory & Edge Cache Invalidation + Comprehensive Audit Logging
 */

import { normalizeRelationshipIdentifier } from './template-protocol-schema.js';

export const DEFAULT_FESTIVAL_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_DAYS_BEFORE_FESTIVAL = 15;
export const DEFAULT_DAYS_AFTER_FESTIVAL = 3;
export const IST_OFFSET_MS = 330 * 60 * 1000; // +05:30 in milliseconds

export const FESTIVAL_CALCULATION_METHODS = Object.freeze({
  FIXED_GREGORIAN: 'FIXED_GREGORIAN',
  DETERMINISTIC_RULE: 'DETERMINISTIC_RULE',
  VERIFIED_CALENDAR_TABLE: 'VERIFIED_CALENDAR_TABLE',
  EXTERNAL_PROVIDER: 'EXTERNAL_PROVIDER',
  MANUAL_ADMIN: 'MANUAL_ADMIN'
});

export const FESTIVAL_VERIFICATION_STATUS = Object.freeze({
  AUTO_VERIFIED: 'AUTO_VERIFIED',
  IMPORTED_PENDING: 'IMPORTED_PENDING',
  MANUALLY_CONFIRMED: 'MANUALLY_CONFIRMED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  DATE_UNAVAILABLE: 'DATE_UNAVAILABLE'
});

export const CAMPAIGN_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ENDED: 'ENDED',
  CANCELLED: 'CANCELLED'
});

export const VALID_CAMPAIGN_STATUSES = new Set(Object.values(CAMPAIGN_STATUS));
export const VALID_VERIFICATION_STATUSES = new Set(Object.values(FESTIVAL_VERIFICATION_STATUS));
export const VALID_CALCULATION_METHODS = new Set(Object.values(FESTIVAL_CALCULATION_METHODS));

/**
 * Authoritative Maintained Festival Catalog & Multi-Year Verified Dates (2024–2030)
 * Note: Lunar/tithi festivals (Diwali, Holi, Raksha Bandhan, Eid, Navratri, Ganesh Chaturthi, etc.)
 * do NOT use fake fixed Gregorian formulas; they use verified panchang/gazette tables, external
 * providers, or administrator confirmation.
 */
export const CANONICAL_FESTIVAL_CATALOG = Object.freeze([
  {
    id: 'fest_diwali',
    slug: 'diwali',
    name: 'Diwali (Deepavali)',
    localizedNames: { hi: 'दीपावली', en: 'Diwali', mr: 'दिवाळी', gu: 'દિવાળી', ta: 'தீபாவளி' },
    description: 'Festival of Lights celebrating the victory of light over darkness (Kartika Amavasya).',
    category: 'indian_festival',
    calculationMethod: FESTIVAL_CALCULATION_METHODS.VERIFIED_CALENDAR_TABLE,
    defaultTimezone: 'Asia/Kolkata',
    defaultDaysBefore: 15,
    defaultDaysAfter: 3,
    requiresAdminApproval: false,
    sourceAttribution: 'Government of India Gazette & Positional Astronomy Centre (IMD Panchang)',
    verifiedDatesByYear: {
      2024: '2024-10-31',
      2025: '2025-10-20',
      2026: '2026-11-08',
      2027: '2027-10-29',
      2028: '2028-10-17',
      2029: '2029-11-05',
      2030: '2030-10-26'
    }
  },
  {
    id: 'fest_holi',
    slug: 'holi',
    name: 'Holi (Festival of Colors)',
    localizedNames: { hi: 'होली', en: 'Holi', mr: 'होळी', bn: 'দোলযাত্রা' },
    description: 'Vibrant spring festival of colors, love, and renewal (Phalguna Purnima).',
    category: 'indian_festival',
    calculationMethod: FESTIVAL_CALCULATION_METHODS.VERIFIED_CALENDAR_TABLE,
    defaultTimezone: 'Asia/Kolkata',
    defaultDaysBefore: 15,
    defaultDaysAfter: 3,
    requiresAdminApproval: false,
    sourceAttribution: 'Government of India Gazette & Positional Astronomy Centre (IMD Panchang)',
    verifiedDatesByYear: {
      2024: '2024-03-25',
      2025: '2025-03-14',
      2026: '2026-03-04',
      2027: '2027-03-22',
      2028: '2028-03-11',
      2029: '2029-03-01',
      2030: '2030-03-20'
    }
  },
  {
    id: 'fest_raksha_bandhan',
    slug: 'raksha-bandhan',
    name: 'Raksha Bandhan',
    localizedNames: { hi: 'रक्षा बंधन', en: 'Raksha Bandhan', gu: 'રક્ષાબંધન' },
    description: 'Sacred celebration of the bond of protection and love between brothers and sisters (Shravana Purnima).',
    category: 'indian_festival',
    calculationMethod: FESTIVAL_CALCULATION_METHODS.VERIFIED_CALENDAR_TABLE,
    defaultTimezone: 'Asia/Kolkata',
    defaultDaysBefore: 15,
    defaultDaysAfter: 3,
    requiresAdminApproval: false,
    sourceAttribution: 'Government of India Gazette & Positional Astronomy Centre (IMD Panchang)',
    verifiedDatesByYear: {
      2024: '2024-08-19',
      2025: '2025-08-09',
      2026: '2026-08-28',
      2027: '2027-08-17',
      2028: '2028-08-05',
      2029: '2029-08-23',
      2030: '2030-08-13'
    }
  },
  {
    id: 'fest_bhai_dooj',
    slug: 'bhai-dooj',
    name: 'Bhai Dooj',
    localizedNames: { hi: 'भाई दूज', en: 'Bhai Dooj', mr: 'भाऊबीज', bn: 'ভাইফোঁটা' },
    description: 'Celebration of sibling affection on the second lunar day of Shukla Paksha in Kartika.',
    category: 'indian_festival',
    calculationMethod: FESTIVAL_CALCULATION_METHODS.VERIFIED_CALENDAR_TABLE,
    defaultTimezone: 'Asia/Kolkata',
    defaultDaysBefore: 15,
    defaultDaysAfter: 3,
    requiresAdminApproval: false,
    sourceAttribution: 'Positional Astronomy Centre (IMD Panchang)',
    verifiedDatesByYear: {
      2024: '2024-11-03',
      2025: '2025-10-23',
      2026: '2026-11-11',
      2027: '2027-10-31',
      2028: '2028-10-19',
      2029: '2029-11-07',
      2030: '2030-10-28'
    }
  },
  {
    id: 'fest_karwa_chauth',
    slug: 'karwa-chauth',
    name: 'Karwa Chauth',
    localizedNames: { hi: 'करवा चौथ', en: 'Karwa Chauth', pa: 'ਕਰਵਾ ਚੌਥ' },
    description: 'Traditional celebration of marital devotion observed on Kartika Krishna Chaturthi.',
    category: 'indian_festival',
    calculationMethod: FESTIVAL_CALCULATION_METHODS.VERIFIED_CALENDAR_TABLE,
    defaultTimezone: 'Asia/Kolkata',
    defaultDaysBefore: 15,
    defaultDaysAfter: 3,
    requiresAdminApproval: false,
    sourceAttribution: 'Positional Astronomy Centre (IMD Panchang)',
    verifiedDatesByYear: {
      2024: '2024-10-20',
      2025: '2025-10-10',
      2026: '2026-10-29',
      2027: '2027-10-18',
      2028: '2028-10-07',
      2029: '2029-10-26',
      2030: '2030-10-15'
    }
  },
  {
    id: 'fest_navratri',
    slug: 'navratri',
    name: 'Sharad Navratri',
    localizedNames: { hi: 'शारदीय नवरात्रि', en: 'Sharad Navratri', gu: 'નવરાત્રી' },
    description: 'Nine-night celebration of Goddess Durga beginning on Ashwin Shukla Pratipada.',
    category: 'indian_festival',
    calculationMethod: FESTIVAL_CALCULATION_METHODS.VERIFIED_CALENDAR_TABLE,
    defaultTimezone: 'Asia/Kolkata',
    defaultDaysBefore: 15,
    defaultDaysAfter: 3,
    requiresAdminApproval: false,
    sourceAttribution: 'Positional Astronomy Centre (IMD Panchang)',
    verifiedDatesByYear: {
      2024: '2024-10-03',
      2025: '2025-09-22',
      2026: '2026-10-11',
      2027: '2027-09-30',
      2028: '2028-09-19',
      2029: '2029-10-08',
      2030: '2030-09-28'
    }
  },
  {
    id: 'fest_ganesh_chaturthi',
    slug: 'ganesh-chaturthi',
    name: 'Ganesh Chaturthi',
    localizedNames: { hi: 'गणेश चतुर्थी', mr: 'गणेशोत्सव', en: 'Ganesh Chaturthi' },
    description: 'Auspicious festival celebrating the birth of Lord Ganesha (Bhadrapada Shukla Chaturthi).',
    category: 'indian_festival',
    calculationMethod: FESTIVAL_CALCULATION_METHODS.VERIFIED_CALENDAR_TABLE,
    defaultTimezone: 'Asia/Kolkata',
    defaultDaysBefore: 15,
    defaultDaysAfter: 3,
    requiresAdminApproval: false,
    sourceAttribution: 'Positional Astronomy Centre (IMD Panchang)',
    verifiedDatesByYear: {
      2024: '2024-09-07',
      2025: '2025-08-27',
      2026: '2026-09-14',
      2027: '2027-09-04',
      2028: '2028-08-23',
      2029: '2029-09-11',
      2030: '2030-09-01'
    }
  },
  {
    id: 'fest_eid_ul_fitr',
    slug: 'eid-ul-fitr',
    name: 'Eid-ul-Fitr',
    localizedNames: { ur: 'عید الفطر', hi: 'ईद-उल-फ़ित्र', en: 'Eid-ul-Fitr' },
    description: 'Joyous celebration marking the completion of Ramadan (subject to lunar crescent sighting).',
    category: 'cultural_celebration',
    calculationMethod: FESTIVAL_CALCULATION_METHODS.VERIFIED_CALENDAR_TABLE,
    defaultTimezone: 'Asia/Kolkata',
    defaultDaysBefore: 15,
    defaultDaysAfter: 3,
    requiresAdminApproval: true,
    sourceAttribution: 'Government of India Gazette (Subject to local moon sighting confirmation)',
    verifiedDatesByYear: {
      2024: '2024-04-11',
      2025: '2025-03-31',
      2026: '2026-03-20',
      2027: '2027-03-10',
      2028: '2028-02-27',
      2029: '2029-02-15',
      2030: '2030-02-05'
    }
  },
  {
    id: 'fest_christmas',
    slug: 'christmas',
    name: 'Christmas',
    localizedNames: { en: 'Christmas', hi: 'क्रिसमस' },
    description: 'Annual celebration of joy, warmth, and giving on 25 December.',
    category: 'global_festival',
    calculationMethod: FESTIVAL_CALCULATION_METHODS.FIXED_GREGORIAN,
    fixedMonth: 12,
    fixedDay: 25,
    defaultTimezone: 'Asia/Kolkata',
    defaultDaysBefore: 15,
    defaultDaysAfter: 3,
    requiresAdminApproval: false,
    sourceAttribution: 'Fixed Gregorian Calendar (25 December)'
  },
  {
    id: 'fest_new_year',
    slug: 'new-year',
    name: 'New Year Celebration',
    localizedNames: { en: 'New Year', hi: 'नव वर्ष' },
    description: 'Global New Year celebration on 1 January.',
    category: 'global_festival',
    calculationMethod: FESTIVAL_CALCULATION_METHODS.FIXED_GREGORIAN,
    fixedMonth: 1,
    fixedDay: 1,
    defaultTimezone: 'Asia/Kolkata',
    defaultDaysBefore: 15,
    defaultDaysAfter: 3,
    requiresAdminApproval: false,
    sourceAttribution: 'Fixed Gregorian Calendar (1 January)'
  },
  {
    id: 'fest_valentines_day',
    slug: 'valentines-day',
    name: "Valentine's Day",
    localizedNames: { en: "Valentine's Day", hi: 'वैलेंटाइन डे' },
    description: 'Celebration of love, romance, and heartfelt affection on 14 February.',
    category: 'global_festival',
    calculationMethod: FESTIVAL_CALCULATION_METHODS.FIXED_GREGORIAN,
    fixedMonth: 2,
    fixedDay: 14,
    defaultTimezone: 'Asia/Kolkata',
    defaultDaysBefore: 15,
    defaultDaysAfter: 3,
    requiresAdminApproval: false,
    sourceAttribution: 'Fixed Gregorian Calendar (14 February)'
  },
  {
    id: 'fest_friendship_day',
    slug: 'friendship-day',
    name: 'International Friendship Day (India)',
    localizedNames: { en: 'Friendship Day', hi: 'मित्रता दिवस' },
    description: 'Celebrated in India on the first Sunday of August every year.',
    category: 'cultural_celebration',
    calculationMethod: FESTIVAL_CALCULATION_METHODS.DETERMINISTIC_RULE,
    calculationRule: { type: 'NTH_WEEKDAY_OF_MONTH', month: 8, weekday: 0, nth: 1 },
    defaultTimezone: 'Asia/Kolkata',
    defaultDaysBefore: 15,
    defaultDaysAfter: 3,
    requiresAdminApproval: false,
    sourceAttribution: 'Deterministic Rule: First Sunday of August'
  }
]);

// ============================================================================
// IN-MEMORY CACHE WITH EXPLICIT INVALIDATION VERSION
// ============================================================================
let _festivalCacheVersion = 1;
const _activeCampaignCache = new Map();
const CACHE_TTL_MS = 30 * 1000; // Short 30s TTL; also invalidated immediately on any admin write

export function invalidateFestivalSchedulerCache() {
  _festivalCacheVersion += 1;
  _activeCampaignCache.clear();
  return _festivalCacheVersion;
}

export function getFestivalCacheVersion() {
  return _festivalCacheVersion;
}

// ============================================================================
// TIMEZONE & CALENDAR-DAY ARITHMETIC UTILITIES
// ============================================================================

/**
 * Validates whether a timezone identifier is supported by Intl.DateTimeFormat in the runtime.
 */
export function isValidIanaTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  const trimmed = tz.trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (trimmed === 'Asia/Kolkata' || trimmed === 'UTC' || trimmed === 'Etc/UTC') return true;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Strictly validates a YYYY-MM-DD calendar date string, including leap-year and month-length checks.
 * Rejects malformed strings, impossible dates (e.g., 2026-02-29, 2026-11-31, 2026-13-01), and timestamps.
 */
export function parseDateOnlyStrict(dateInput) {
  if (!dateInput || typeof dateInput !== 'string') {
    return { valid: false, reason: 'Date must be a non-empty YYYY-MM-DD string.' };
  }
  const str = dateInput.trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return { valid: false, reason: `Invalid date format "${str}". Expected strict YYYY-MM-DD.` };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1970 || year > 2100) {
    return { valid: false, reason: `Year ${year} is out of supported range (1970-2100).` };
  }
  if (month < 1 || month > 12) {
    return { valid: false, reason: `Month ${month} is out of range (01-12).` };
  }
  if (day < 1 || day > 31) {
    return { valid: false, reason: `Day ${day} is out of range (01-31).` };
  }

  const probe = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return {
      valid: false,
      reason: `Calendar date "${str}" does not exist (check leap year or days in month).`
    };
  }

  return {
    valid: true,
    dateStr: str,
    year,
    month,
    day
  };
}

/**
 * Adds or subtracts integer calendar days from a validated YYYY-MM-DD date string.
 * Handles leap years, month boundaries, and year boundaries deterministically.
 */
export function addCalendarDays(dateStr, deltaDays) {
  const parsed = parseDateOnlyStrict(dateStr);
  if (!parsed.valid) {
    throw new Error(parsed.reason || `Invalid date "${dateStr}"`);
  }
  const delta = Number(deltaDays);
  if (!Number.isInteger(delta)) {
    throw new Error(`deltaDays must be an integer (received ${deltaDays}).`);
  }
  const d = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + delta, 0, 0, 0, 0));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Extracts local calendar parts (year, month, day, hour, minute, second) for a UTC timestamp in `timezone`.
 */
export function getLocalTimePartsInTimezone(utcMs, timezone = DEFAULT_FESTIVAL_TIMEZONE) {
  const tz = isValidIanaTimezone(timezone) ? timezone.trim() : DEFAULT_FESTIVAL_TIMEZONE;
  if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') {
    const shifted = new Date(Number(utcMs) + IST_OFFSET_MS);
    const y = shifted.getUTCFullYear();
    const m = shifted.getUTCMonth() + 1;
    const d = shifted.getUTCDate();
    const hr = shifted.getUTCHours();
    const min = shifted.getUTCMinutes();
    const sec = shifted.getUTCSeconds();
    return {
      year: y,
      month: m,
      day: d,
      hour: hr,
      minute: min,
      second: sec,
      dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      timezone: 'Asia/Kolkata'
    };
  }

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const parts = dtf.formatToParts(new Date(Number(utcMs)));
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  const y = map.year;
  const m = map.month;
  const d = map.day;
  return {
    year: y,
    month: m,
    day: d,
    hour: map.hour === 24 ? 0 : (map.hour || 0),
    minute: map.minute || 0,
    second: map.second || 0,
    dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    timezone: tz
  };
}

/**
 * Computes the exact UTC epoch timestamp (in milliseconds) corresponding to 00:00:00.000
 * at the start of `dateStr` (YYYY-MM-DD) in the specified IANA `timezone`.
 * Handles fixed-offset timezones (such as Asia/Kolkata) and DST-observing timezones accurately.
 */
export function startOfDay(dateStr, timezone = DEFAULT_FESTIVAL_TIMEZONE) {
  const parsed = parseDateOnlyStrict(dateStr);
  if (!parsed.valid) {
    throw new Error(parsed.reason || `Invalid date "${dateStr}"`);
  }
  const tz = isValidIanaTimezone(timezone) ? timezone.trim() : DEFAULT_FESTIVAL_TIMEZONE;
  const targetMidnightUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0, 0);

  if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') {
    return targetMidnightUtc - IST_OFFSET_MS;
  }
  if (tz === 'UTC' || tz === 'Etc/UTC') {
    return targetMidnightUtc;
  }

  // Two-pass offset convergence for general IANA timezones (handles DST transitions cleanly)
  let guessUtc = targetMidnightUtc;
  for (let i = 0; i < 3; i++) {
    const localParts = getLocalTimePartsInTimezone(guessUtc, tz);
    const observedLocalAsUtc = Date.UTC(
      localParts.year,
      localParts.month - 1,
      localParts.day,
      localParts.hour,
      localParts.minute,
      localParts.second,
      0
    );
    const diffMs = observedLocalAsUtc - targetMidnightUtc;
    if (diffMs === 0) break;
    guessUtc -= diffMs;
  }
  return guessUtc;
}

/**
 * Resolves the authoritative publication window for a festival date `F` (`YYYY-MM-DD`).
 *
 * REQUIRED BUSINESS RULE:
 * - Start date = F minus `daysBefore` calendar days (default 15, inclusive)
 * - End date   = F plus `daysAfter` calendar days (default 3, inclusive)
 * - First blocked date = End date + 1 calendar day
 * - Authoritative Interval:
 *   startOfDay(start_date, timezone) <= current_time < startOfDay(end_date + 1 calendar day, timezone)
 */
export function calculatePublicationWindow(festivalDateStr, options = {}) {
  const parsed = parseDateOnlyStrict(festivalDateStr);
  if (!parsed.valid) {
    return {
      valid: false,
      reason: parsed.reason,
      festivalDate: null,
      startDate: null,
      endDate: null,
      firstBlockedDate: null,
      windowStartUtcMs: null,
      windowEndExclusiveUtcMs: null,
      windowEndInclusiveUtcMs: null
    };
  }

  const rawBefore = options.daysBefore !== undefined && options.daysBefore !== null
    ? Number(options.daysBefore)
    : DEFAULT_DAYS_BEFORE_FESTIVAL;
  const rawAfter = options.daysAfter !== undefined && options.daysAfter !== null
    ? Number(options.daysAfter)
    : DEFAULT_DAYS_AFTER_FESTIVAL;

  if (!Number.isInteger(rawBefore) || rawBefore < 0 || rawBefore > 180) {
    return {
      valid: false,
      reason: `daysBefore must be an integer between 0 and 180 (received ${options.daysBefore}).`
    };
  }
  if (!Number.isInteger(rawAfter) || rawAfter < 0 || rawAfter > 60) {
    return {
      valid: false,
      reason: `daysAfter must be an integer between 0 and 60 (received ${options.daysAfter}).`
    };
  }

  const timezone = isValidIanaTimezone(options.timezone)
    ? options.timezone.trim()
    : DEFAULT_FESTIVAL_TIMEZONE;

  const startDate = addCalendarDays(parsed.dateStr, -rawBefore);
  const endDate = addCalendarDays(parsed.dateStr, rawAfter);
  const firstBlockedDate = addCalendarDays(endDate, 1);

  const windowStartUtcMs = startOfDay(startDate, timezone);
  const windowEndExclusiveUtcMs = startOfDay(firstBlockedDate, timezone);
  const windowEndInclusiveUtcMs = windowEndExclusiveUtcMs - 1;

  return {
    valid: true,
    festivalDate: parsed.dateStr,
    startDate,
    endDate,
    firstBlockedDate,
    daysBefore: rawBefore,
    daysAfter: rawAfter,
    timezone,
    windowStartUtcMs,
    windowEndExclusiveUtcMs,
    windowEndInclusiveUtcMs,
    windowStartIso: new Date(windowStartUtcMs).toISOString(),
    windowEndExclusiveIso: new Date(windowEndExclusiveUtcMs).toISOString(),
    windowEndInclusiveIso: new Date(windowEndInclusiveUtcMs).toISOString()
  };
}

/**
 * Checks whether a timestamp (or YYYY-MM-DD local date in the festival timezone) falls inside
 * the publication window `[startOfDay(startDate, tz), startOfDay(endDate + 1 day, tz))`.
 */
export function isTimestampWithinPublicationWindow(windowInfo, nowInput = Date.now()) {
  if (!windowInfo || !windowInfo.valid) {
    return {
      inWindow: false,
      phase: 'INVALID_WINDOW',
      reason: windowInfo?.reason || 'Publication window is invalid or unconfirmed.'
    };
  }

  let nowUtcMs;
  if (typeof nowInput === 'number') {
    nowUtcMs = nowInput;
  } else if (nowInput instanceof Date) {
    nowUtcMs = nowInput.getTime();
  } else if (typeof nowInput === 'string') {
    const trimmed = nowInput.trim();
    const dateOnlyCheck = parseDateOnlyStrict(trimmed);
    if (dateOnlyCheck.valid) {
      // Interpret bare YYYY-MM-DD in the festival's configured timezone
      nowUtcMs = startOfDay(trimmed, windowInfo.timezone);
    } else {
      const parsedMs = Date.parse(trimmed);
      if (Number.isNaN(parsedMs)) {
        return {
          inWindow: false,
          phase: 'INVALID_TIMESTAMP',
          reason: `Invalid timestamp "${trimmed}".`
        };
      }
      nowUtcMs = parsedMs;
    }
  } else {
    nowUtcMs = Date.now();
  }

  const localNow = getLocalTimePartsInTimezone(nowUtcMs, windowInfo.timezone);

  if (nowUtcMs < windowInfo.windowStartUtcMs) {
    return {
      inWindow: false,
      phase: 'BEFORE_WINDOW',
      localDate: localNow.dateStr,
      nowUtcMs,
      reason: `Campaign opens on ${windowInfo.startDate} (${windowInfo.timezone}).`
    };
  }

  if (nowUtcMs >= windowInfo.windowEndExclusiveUtcMs) {
    return {
      inWindow: false,
      phase: 'EXPIRED_WINDOW',
      localDate: localNow.dateStr,
      nowUtcMs,
      reason: `Campaign ended after ${windowInfo.endDate} (${windowInfo.timezone}). New wishes are blocked starting ${windowInfo.firstBlockedDate}.`
    };
  }

  return {
    inWindow: true,
    phase: 'ACTIVE_WINDOW',
    localDate: localNow.dateStr,
    nowUtcMs,
    reason: `Campaign is active from ${windowInfo.startDate} through ${windowInfo.endDate} inclusive (${windowInfo.timezone}).`
  };
}

// ============================================================================
// FESTIVAL DATE RESOLUTION & ALGORITHMIC / TABLE / PROVIDER RESOLVERS
// ============================================================================

/**
 * Computes Nth weekday of a given month and year (e.g. 1st Sunday of August).
 * weekday: 0 = Sunday .. 6 = Saturday
 * nth: 1..5
 */
export function computeNthWeekdayOfMonth(year, month, weekday, nth) {
  const y = Number(year);
  const m = Number(month);
  const wd = Number(weekday);
  const n = Number(nth);
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || wd < 0 || wd > 6 || n < 1 || n > 5) {
    return null;
  }
  const firstDayOfWeek = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const offset = (wd - firstDayOfWeek + 7) % 7;
  const dayOfMonth = 1 + offset + (n - 1) * 7;
  const candidate = `${y}-${String(m).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
  const check = parseDateOnlyStrict(candidate);
  return check.valid ? check.dateStr : null;
}

/**
 * Computes Gregorian Easter Sunday using the anonymous Gregorian (Meeus/Jones/Butcher) algorithm.
 */
export function computeEasterSunday(year) {
  const Y = Number(year);
  if (!Number.isInteger(Y) || Y < 1970 || Y > 2100) return null;
  const a = Y % 19;
  const b = Math.floor(Y / 100);
  const c = Y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const candidate = `${Y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const check = parseDateOnlyStrict(candidate);
  return check.valid ? check.dateStr : null;
}

/**
 * Resolves a festival date for `applicableYear` using its configured calculation method.
 * Never fabricates a formula for lunar/tithi festivals when no verified table or provider date exists.
 */
export function resolveAutomaticFestivalDateForYear(festivalDef, applicableYear) {
  const year = Number(applicableYear);
  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    return {
      resolved: false,
      resolvedDate: null,
      verificationStatus: FESTIVAL_VERIFICATION_STATUS.DATE_UNAVAILABLE,
      resolutionSource: 'INVALID_YEAR',
      sourceReference: '',
      requiresApproval: true,
      notes: `Invalid applicable year: ${applicableYear}`
    };
  }

  const method = String(festivalDef?.calculation_method || festivalDef?.calculationMethod || FESTIVAL_CALCULATION_METHODS.VERIFIED_CALENDAR_TABLE).toUpperCase().trim();
  const requiresApproval = Boolean(festivalDef?.requires_admin_approval ?? festivalDef?.requiresAdminApproval ?? false);
  let ruleObj = {};
  try {
    const rawRule = festivalDef?.calculation_rule_json || festivalDef?.calculationRule || {};
    ruleObj = typeof rawRule === 'string' ? JSON.parse(rawRule) : (rawRule || {});
  } catch (_) {
    ruleObj = {};
  }

  // 1. Fixed Gregorian Date (only for genuinely fixed Gregorian observances like Christmas, New Year, Valentine's Day)
  if (method === FESTIVAL_CALCULATION_METHODS.FIXED_GREGORIAN) {
    const fm = Number(festivalDef?.fixed_month ?? festivalDef?.fixedMonth ?? ruleObj.month);
    const fd = Number(festivalDef?.fixed_day ?? festivalDef?.fixedDay ?? ruleObj.day);
    const candidate = `${year}-${String(fm).padStart(2, '0')}-${String(fd).padStart(2, '0')}`;
    const check = parseDateOnlyStrict(candidate);
    if (!check.valid) {
      return {
        resolved: false,
        resolvedDate: null,
        verificationStatus: FESTIVAL_VERIFICATION_STATUS.DATE_UNAVAILABLE,
        resolutionSource: FESTIVAL_CALCULATION_METHODS.FIXED_GREGORIAN,
        sourceReference: festivalDef?.source_attribution || festivalDef?.sourceAttribution || 'Fixed Gregorian Rule',
        requiresApproval: true,
        notes: check.reason
      };
    }
    return {
      resolved: true,
      resolvedDate: check.dateStr,
      verificationStatus: requiresApproval
        ? FESTIVAL_VERIFICATION_STATUS.IMPORTED_PENDING
        : FESTIVAL_VERIFICATION_STATUS.AUTO_VERIFIED,
      resolutionSource: FESTIVAL_CALCULATION_METHODS.FIXED_GREGORIAN,
      sourceReference: festivalDef?.source_attribution || festivalDef?.sourceAttribution || `Fixed Gregorian (${fm}/${fd})`,
      requiresApproval,
      notes: 'Resolved via fixed Gregorian calendar rule.'
    };
  }

  // 2. Deterministic Algorithmic Rule (e.g. Nth weekday of month, Easter)
  if (method === FESTIVAL_CALCULATION_METHODS.DETERMINISTIC_RULE) {
    let computedDate = null;
    const ruleType = String(ruleObj.type || '').toUpperCase();
    if (ruleType === 'NTH_WEEKDAY_OF_MONTH') {
      computedDate = computeNthWeekdayOfMonth(year, ruleObj.month, ruleObj.weekday, ruleObj.nth);
    } else if (ruleType === 'EASTER_SUNDAY') {
      computedDate = computeEasterSunday(year);
    }
    const check = computedDate ? parseDateOnlyStrict(computedDate) : { valid: false };
    if (!check.valid) {
      return {
        resolved: false,
        resolvedDate: null,
        verificationStatus: FESTIVAL_VERIFICATION_STATUS.DATE_UNAVAILABLE,
        resolutionSource: FESTIVAL_CALCULATION_METHODS.DETERMINISTIC_RULE,
        sourceReference: festivalDef?.source_attribution || 'Deterministic Calendar Algorithm',
        requiresApproval: true,
        notes: 'Algorithmic rule could not resolve a valid date for this year.'
      };
    }
    return {
      resolved: true,
      resolvedDate: check.dateStr,
      verificationStatus: requiresApproval
        ? FESTIVAL_VERIFICATION_STATUS.IMPORTED_PENDING
        : FESTIVAL_VERIFICATION_STATUS.AUTO_VERIFIED,
      resolutionSource: FESTIVAL_CALCULATION_METHODS.DETERMINISTIC_RULE,
      sourceReference: festivalDef?.source_attribution || festivalDef?.sourceAttribution || `Algorithmic Rule (${ruleType})`,
      requiresApproval,
      notes: `Resolved deterministically via ${ruleType}.`
    };
  }

  // 3. Verified Calendar Table (Maintained Official Panchang / Gazette Table)
  if (method === FESTIVAL_CALCULATION_METHODS.VERIFIED_CALENDAR_TABLE) {
    const catalogMatch = CANONICAL_FESTIVAL_CATALOG.find(
      c => c.id === festivalDef?.id || c.slug === festivalDef?.slug
    );
    const verifiedMap = {
      ...(catalogMatch?.verifiedDatesByYear || {}),
      ...(ruleObj?.verifiedDatesByYear || {})
    };
    const rawDate = verifiedMap[year] || verifiedMap[String(year)] || null;
    if (rawDate) {
      const check = parseDateOnlyStrict(rawDate);
      if (check.valid) {
        return {
          resolved: true,
          resolvedDate: check.dateStr,
          verificationStatus: requiresApproval
            ? FESTIVAL_VERIFICATION_STATUS.IMPORTED_PENDING
            : FESTIVAL_VERIFICATION_STATUS.AUTO_VERIFIED,
          resolutionSource: FESTIVAL_CALCULATION_METHODS.VERIFIED_CALENDAR_TABLE,
          sourceReference: festivalDef?.source_attribution || festivalDef?.sourceAttribution || catalogMatch?.sourceAttribution || 'Maintained Verified Festival Calendar',
          requiresApproval,
          notes: requiresApproval
            ? 'Resolved from verified calendar table; awaiting administrator confirmation for regional/lunar observance.'
            : 'Resolved from maintained verified Panchang/Gazette calendar table.'
        };
      }
    }
    return {
      resolved: false,
      resolvedDate: null,
      verificationStatus: FESTIVAL_VERIFICATION_STATUS.DATE_UNAVAILABLE,
      resolutionSource: FESTIVAL_CALCULATION_METHODS.VERIFIED_CALENDAR_TABLE,
      sourceReference: festivalDef?.source_attribution || 'Maintained Verified Festival Calendar',
      requiresApproval: true,
      notes: `No verified Panchang/Gazette date on file for year ${year}. Administrator confirmation or external provider sync required.`
    };
  }

  // 4. Manual Admin / External Provider without cached sync yet
  return {
    resolved: false,
    resolvedDate: null,
    verificationStatus: FESTIVAL_VERIFICATION_STATUS.DATE_UNAVAILABLE,
    resolutionSource: method,
    sourceReference: festivalDef?.source_attribution || '',
    requiresApproval: true,
    notes: 'Requires administrator date entry or external calendar provider synchronization.'
  };
}

/**
 * Evaluates explicit 3-tier date precedence for a festival and applicable year:
 * 1. Active administrator manual override for (festival_id, applicable_year)
 * 2. Confirmed & validated automatic or imported festival date for (festival_id, applicable_year)
 * 3. Unconfirmed / Date Unavailable (never silently promoted to confirmed schedule)
 */
export function resolveEffectiveFestivalDate({ festival, yearRecord, activeOverride, applicableYear }) {
  const targetYear = Number(applicableYear || yearRecord?.applicable_year || activeOverride?.applicable_year || new Date().getUTCFullYear());
  const defaultTz = isValidIanaTimezone(festival?.default_timezone || festival?.defaultTimezone)
    ? (festival.default_timezone || festival.defaultTimezone)
    : DEFAULT_FESTIVAL_TIMEZONE;

  const sourceDate = yearRecord && Number(yearRecord.applicable_year) === targetYear
    ? (yearRecord.resolved_date || null)
    : null;
  const sourceDateValid = sourceDate ? parseDateOnlyStrict(sourceDate).valid : false;
  const sourceVerificationStatus = yearRecord && Number(yearRecord.applicable_year) === targetYear
    ? (yearRecord.verification_status || FESTIVAL_VERIFICATION_STATUS.DATE_UNAVAILABLE)
    : FESTIVAL_VERIFICATION_STATUS.DATE_UNAVAILABLE;

  // Tier 1: Valid, active administrator override for the exact applicable year
  if (
    activeOverride &&
    Number(activeOverride.is_active ?? 1) === 1 &&
    Number(activeOverride.applicable_year) === targetYear &&
    (!festival?.id || !activeOverride.festival_id || activeOverride.festival_id === festival.id)
  ) {
    const ovCheck = parseDateOnlyStrict(activeOverride.override_date);
    if (ovCheck.valid && ovCheck.year === targetYear) {
      const effectiveTz = isValidIanaTimezone(activeOverride.timezone)
        ? activeOverride.timezone.trim()
        : (isValidIanaTimezone(yearRecord?.timezone) ? yearRecord.timezone.trim() : defaultTz);
      return {
        applicableYear: targetYear,
        effectiveDate: ovCheck.dateStr,
        sourceDate: sourceDateValid ? sourceDate : null,
        timezone: effectiveTz,
        isOverridden: true,
        isConfirmed: true,
        precedenceTier: 'MANUAL_OVERRIDE',
        dateSource: 'MANUAL_OVERRIDE',
        verificationStatus: FESTIVAL_VERIFICATION_STATUS.MANUALLY_CONFIRMED,
        overrideReason: activeOverride.reason || '',
        overrideBy: activeOverride.updated_by || activeOverride.created_by || 'admin',
        overrideUpdatedAt: activeOverride.updated_at || activeOverride.created_at || null,
        sourceReference: yearRecord?.source_reference || festival?.source_attribution || ''
      };
    }
  }

  // Tier 2: Validated and confirmed automatic or imported festival date for the exact applicable year
  if (yearRecord && Number(yearRecord.applicable_year) === targetYear && sourceDateValid) {
    const parsedSource = parseDateOnlyStrict(sourceDate);
    const requiresApproval = Boolean(yearRecord.requires_approval ?? festival?.requires_admin_approval ?? false);
    const isVerifiedStatus =
      sourceVerificationStatus === FESTIVAL_VERIFICATION_STATUS.AUTO_VERIFIED ||
      sourceVerificationStatus === FESTIVAL_VERIFICATION_STATUS.MANUALLY_CONFIRMED;
    const isApproved = !requiresApproval || sourceVerificationStatus === FESTIVAL_VERIFICATION_STATUS.MANUALLY_CONFIRMED;

    if (parsedSource.valid && parsedSource.year === targetYear && isVerifiedStatus && isApproved) {
      const effectiveTz = isValidIanaTimezone(yearRecord.timezone)
        ? yearRecord.timezone.trim()
        : defaultTz;
      return {
        applicableYear: targetYear,
        effectiveDate: parsedSource.dateStr,
        sourceDate: parsedSource.dateStr,
        timezone: effectiveTz,
        isOverridden: false,
        isConfirmed: true,
        precedenceTier: 'CONFIRMED_SOURCE_DATE',
        dateSource: yearRecord.resolution_source || festival?.calculation_method || 'AUTO_RESOLVED',
        verificationStatus: sourceVerificationStatus,
        overrideReason: null,
        overrideBy: null,
        overrideUpdatedAt: null,
        sourceReference: yearRecord.source_reference || festival?.source_attribution || ''
      };
    }
  }

  // Tier 3: Unconfirmed or unavailable date — NEVER silently treated as confirmed
  return {
    applicableYear: targetYear,
    effectiveDate: null,
    sourceDate: sourceDateValid ? sourceDate : null,
    timezone: isValidIanaTimezone(yearRecord?.timezone) ? yearRecord.timezone.trim() : defaultTz,
    isOverridden: false,
    isConfirmed: false,
    precedenceTier: 'UNCONFIRMED_OR_UNAVAILABLE',
    dateSource: yearRecord?.resolution_source || 'UNAVAILABLE',
    verificationStatus: sourceVerificationStatus,
    overrideReason: null,
    overrideBy: null,
    overrideUpdatedAt: null,
    sourceReference: yearRecord?.source_reference || festival?.source_attribution || ''
  };
}

/**
 * Evaluates authoritative campaign eligibility and publication window state.
 * Enforces deterministic precedence:
 * 1. Disabled festival -> ineligible
 * 2. Disabled campaign -> ineligible
 * 3. Cancelled campaign -> ineligible
 * 4. Draft campaign -> ineligible (even if date falls within window!)
 * 5. Paused campaign -> ineligible
 * 6. Ended campaign -> ineligible
 * 7. Unconfirmed / missing effective festival date -> ineligible (even if status is ACTIVE!)
 * 8. Timezone-aware calendar-day window check:
 *    - Before startOfDay(startDate, tz) -> UPCOMING_SCHEDULED (ineligible)
 *    - >= startOfDay(endDate + 1 day, tz) -> EXPIRED (ineligible)
 *    - Inside [startOfDay(startDate, tz), startOfDay(endDate + 1 day, tz)) -> ACTIVE (eligible)
 */
export function evaluateCampaignEligibility({
  campaign,
  festival,
  yearRecord,
  activeOverride,
  assignment = null,
  nowMs = Date.now()
}) {
  const applicableYear = Number(campaign?.applicable_year || campaign?.applicableYear || yearRecord?.applicable_year || new Date().getUTCFullYear());
  const dateResolution = resolveEffectiveFestivalDate({
    festival,
    yearRecord,
    activeOverride,
    applicableYear
  });

  const daysBefore = (assignment && assignment.custom_days_before !== null && assignment.custom_days_before !== undefined)
    ? Number(assignment.custom_days_before)
    : Number(campaign?.days_before ?? campaign?.daysBefore ?? festival?.default_days_before ?? DEFAULT_DAYS_BEFORE_FESTIVAL);
  const daysAfter = (assignment && assignment.custom_days_after !== null && assignment.custom_days_after !== undefined)
    ? Number(assignment.custom_days_after)
    : Number(campaign?.days_after ?? campaign?.daysAfter ?? festival?.default_days_after ?? DEFAULT_DAYS_AFTER_FESTIVAL);
  const timezone = isValidIanaTimezone(campaign?.timezone)
    ? campaign.timezone.trim()
    : dateResolution.timezone;

  const windowInfo = dateResolution.effectiveDate
    ? calculatePublicationWindow(dateResolution.effectiveDate, { daysBefore, daysAfter, timezone })
    : {
        valid: false,
        reason: 'Festival date is not confirmed.',
        festivalDate: null,
        startDate: null,
        endDate: null,
        firstBlockedDate: null,
        daysBefore,
        daysAfter,
        timezone
      };

  const rawStatus = String(campaign?.status || CAMPAIGN_STATUS.SCHEDULED).toUpperCase().trim();
  const festivalEnabled = festival ? Boolean(Number(festival.is_enabled ?? festival.isEnabled ?? 1)) : true;
  const campaignEnabled = campaign ? Boolean(Number(campaign.is_enabled ?? campaign.isEnabled ?? 1)) : true;
  const assignmentEnabled = assignment ? Boolean(Number(assignment.is_enabled ?? assignment.isEnabled ?? 1)) : true;

  if (!festivalEnabled) {
    return {
      eligible: false,
      effectiveState: 'FESTIVAL_DISABLED',
      code: 'FESTIVAL_DISABLED',
      message: 'This festival is currently disabled.',
      adminStatus: rawStatus,
      dateResolution,
      window: windowInfo
    };
  }

  if (!campaignEnabled) {
    return {
      eligible: false,
      effectiveState: 'CAMPAIGN_DISABLED',
      code: 'FESTIVAL_CAMPAIGN_DISABLED',
      message: 'This festival campaign is currently disabled.',
      adminStatus: rawStatus,
      dateResolution,
      window: windowInfo
    };
  }

  if (!assignmentEnabled) {
    return {
      eligible: false,
      effectiveState: 'ASSIGNMENT_DISABLED',
      code: 'FESTIVAL_TEMPLATE_ASSIGNMENT_DISABLED',
      message: 'This template assignment is disabled for the festival campaign.',
      adminStatus: rawStatus,
      dateResolution,
      window: windowInfo
    };
  }

  if (rawStatus === CAMPAIGN_STATUS.CANCELLED) {
    return {
      eligible: false,
      effectiveState: 'CANCELLED',
      code: 'FESTIVAL_CAMPAIGN_CANCELLED',
      message: 'This festival campaign has been cancelled.',
      adminStatus: rawStatus,
      dateResolution,
      window: windowInfo
    };
  }

  if (rawStatus === CAMPAIGN_STATUS.DRAFT) {
    return {
      eligible: false,
      effectiveState: 'DRAFT',
      code: 'FESTIVAL_CAMPAIGN_DRAFT',
      message: 'This festival campaign is still in draft and is not publicly available.',
      adminStatus: rawStatus,
      dateResolution,
      window: windowInfo
    };
  }

  if (rawStatus === CAMPAIGN_STATUS.PAUSED) {
    return {
      eligible: false,
      effectiveState: 'PAUSED',
      code: 'FESTIVAL_CAMPAIGN_PAUSED',
      message: 'This festival campaign is temporarily paused and is not accepting new wishes.',
      adminStatus: rawStatus,
      dateResolution,
      window: windowInfo
    };
  }

  if (rawStatus === CAMPAIGN_STATUS.ENDED) {
    return {
      eligible: false,
      effectiveState: 'ENDED',
      code: 'FESTIVAL_CAMPAIGN_EXPIRED',
      message: 'This festival campaign has ended and is no longer accepting new wishes.',
      adminStatus: rawStatus,
      dateResolution,
      window: windowInfo
    };
  }

  if (!dateResolution.isConfirmed || !dateResolution.effectiveDate || !windowInfo.valid) {
    return {
      eligible: false,
      effectiveState: 'UNCONFIRMED_DATE',
      code: 'FESTIVAL_DATE_UNCONFIRMED',
      message: 'This festival campaign does not have a confirmed festival date yet.',
      adminStatus: rawStatus,
      dateResolution,
      window: windowInfo
    };
  }

  const windowCheck = isTimestampWithinPublicationWindow(windowInfo, nowMs);
  if (!windowCheck.inWindow) {
    const isExpired = windowCheck.phase === 'EXPIRED_WINDOW';
    return {
      eligible: false,
      effectiveState: isExpired ? 'EXPIRED' : 'SCHEDULED_UPCOMING',
      code: isExpired ? 'FESTIVAL_CAMPAIGN_EXPIRED' : 'FESTIVAL_CAMPAIGN_NOT_STARTED_YET',
      message: windowCheck.reason,
      adminStatus: rawStatus,
      dateResolution,
      window: windowInfo,
      windowCheck
    };
  }

  return {
    eligible: true,
    effectiveState: 'ACTIVE',
    code: 'ELIGIBLE',
    message: windowCheck.reason,
    adminStatus: rawStatus,
    dateResolution,
    window: windowInfo,
    windowCheck
  };
}

// ============================================================================
// EXTERNAL FESTIVAL CALENDAR PROVIDER SYNCHRONIZATION (SAFE, BOUNDED & CACHED)
// ============================================================================

/**
 * Synchronizes festival dates for a given year from an external calendar provider
 * (configured via `env.FESTIVAL_CALENDAR_PROVIDER_URL` and optional `env.FESTIVAL_CALENDAR_API_KEY`,
 * or an injected `options.fetchImpl` for deterministic testing).
 *
 * Security & Reliability Guarantees:
 * - Never called during public gallery requests.
 * - Enforces request timeout (default 5000ms) and bounded retries (default 2) with rate-limit (429) handling.
 * - Validates response schema and every date string strictly with `parseDateOnlyStrict`.
 * - Preserves the last valid resolved date in D1 if the provider fails, times out, or returns invalid data.
 * - Records detailed synchronization audit entries in `festival_sync_logs`.
 */
export async function syncFestivalDatesFromExternalProvider(db, env = {}, options = {}) {
  await ensureFestivalSchedulerSchema(db);
  const year = Number(options.year || new Date().getUTCFullYear());
  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    throw new Error(`Invalid sync year: ${options.year}`);
  }

  const providerUrl = String(options.providerUrl || env?.FESTIVAL_CALENDAR_PROVIDER_URL || '').trim();
  const apiKey = String(options.apiKey || env?.FESTIVAL_CALENDAR_API_KEY || '').trim();
  const fetchFn = typeof options.fetchImpl === 'function' ? options.fetchImpl : globalThis.fetch;
  const timeoutMs = Number(options.timeoutMs || 5000);
  const maxRetries = Number(options.maxRetries ?? 2);
  const actorId = String(options.actorId || 'system');
  const actorEmail = String(options.actorEmail || '');
  const nowIso = new Date().toISOString();

  if (!providerUrl) {
    await recordFestivalAuditLog(db, {
      applicableYear: year,
      actionType: 'PROVIDER_SYNC',
      providerName: 'unconfigured',
      status: 'SKIPPED',
      reason: 'External festival calendar provider URL is not configured; using maintained verified table & admin dates.',
      actorId,
      actorEmail
    });
    return {
      ok: false,
      skipped: true,
      code: 'PROVIDER_NOT_CONFIGURED',
      message: 'No external festival provider URL is configured in environment bindings. Using built-in verified calendar and administrator dates.',
      updatedCount: 0,
      preservedCount: 0
    };
  }

  let parsedEndpoint;
  try {
    parsedEndpoint = new URL(providerUrl);
    if (parsedEndpoint.protocol !== 'https:' && parsedEndpoint.hostname !== 'localhost' && parsedEndpoint.hostname !== '127.0.0.1') {
      throw new Error('External provider URL must use HTTPS.');
    }
    parsedEndpoint.searchParams.set('year', String(year));
  } catch (urlErr) {
    await recordFestivalAuditLog(db, {
      applicableYear: year,
      actionType: 'PROVIDER_SYNC',
      providerName: 'external_provider',
      status: 'FAILED',
      errorCode: 'INVALID_PROVIDER_URL',
      errorMessage: urlErr.message,
      actorId,
      actorEmail
    });
    return {
      ok: false,
      code: 'INVALID_PROVIDER_URL',
      message: 'Configured external festival provider URL is invalid.',
      updatedCount: 0,
      preservedCount: 0
    };
  }

  let lastError = null;
  let lastErrorCode = 'PROVIDER_FETCH_FAILED';
  let responseData = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const headers = { Accept: 'application/json' };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      const res = await fetchFn(parsedEndpoint.toString(), {
        method: 'GET',
        headers,
        signal: controller ? controller.signal : undefined
      });
      if (timer) clearTimeout(timer);

      if (res.status === 429) {
        lastErrorCode = 'PROVIDER_RATE_LIMITED';
        lastError = new Error('External festival calendar provider rate limit exceeded (HTTP 429).');
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
          continue;
        }
        break;
      }

      if (!res.ok) {
        lastErrorCode = `PROVIDER_HTTP_${res.status}`;
        lastError = new Error(`External provider returned HTTP ${res.status}.`);
        if (res.status >= 500 && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
          continue;
        }
        break;
      }

      responseData = await res.json();
      lastError = null;
      break;
    } catch (fetchErr) {
      if (timer) clearTimeout(timer);
      const isTimeout = fetchErr && (fetchErr.name === 'AbortError' || /abort|timeout/i.test(String(fetchErr.message)));
      lastErrorCode = isTimeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK_ERROR';
      lastError = isTimeout
        ? new Error(`External festival provider request timed out after ${timeoutMs}ms.`)
        : fetchErr;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
      }
    }
  }

  if (lastError || !responseData || typeof responseData !== 'object') {
    await recordFestivalAuditLog(db, {
      applicableYear: year,
      actionType: 'PROVIDER_SYNC',
      providerName: parsedEndpoint.hostname,
      status: lastErrorCode === 'PROVIDER_RATE_LIMITED' ? 'RATE_LIMITED' : (lastErrorCode === 'PROVIDER_TIMEOUT' ? 'TIMEOUT' : 'FAILED'),
      errorCode: lastErrorCode,
      errorMessage: lastError ? lastError.message : 'Malformed JSON payload from provider.',
      reason: 'Preserved existing valid festival dates without overwriting.',
      actorId,
      actorEmail
    });
    return {
      ok: false,
      code: lastErrorCode,
      message: lastError ? lastError.message : 'External provider returned malformed response; existing valid dates were preserved.',
      updatedCount: 0,
      preservedCount: 0
    };
  }

  const rawItems = Array.isArray(responseData.festivals)
    ? responseData.festivals
    : (Array.isArray(responseData.data) ? responseData.data : []);

  const festRows = await db.prepare('SELECT * FROM festival_definitions').all().catch(() => ({ results: [] }));
  const festByIdOrSlug = new Map();
  for (const f of (festRows.results || [])) {
    festByIdOrSlug.set(String(f.id).toLowerCase(), f);
    festByIdOrSlug.set(String(f.slug).toLowerCase(), f);
  }

  let updatedCount = 0;
  let preservedCount = 0;
  let rejectedCount = 0;

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') {
      rejectedCount++;
      continue;
    }
    const key = String(item.festivalId || item.id || item.slug || '').toLowerCase().trim();
    const fest = festByIdOrSlug.get(key);
    if (!fest) {
      rejectedCount++;
      continue;
    }

    const rawDate = String(item.date || item.resolvedDate || '').trim();
    const dateCheck = parseDateOnlyStrict(rawDate);
    if (!dateCheck.valid || dateCheck.year !== year) {
      // NEVER replace a valid date with an empty, malformed, or wrong-year result!
      preservedCount++;
      rejectedCount++;
      continue;
    }

    const providerVerified = Boolean(item.verified === true && !fest.requires_admin_approval);
    const newVerificationStatus = providerVerified
      ? FESTIVAL_VERIFICATION_STATUS.AUTO_VERIFIED
      : FESTIVAL_VERIFICATION_STATUS.IMPORTED_PENDING;

    const existingRow = await db.prepare(
      'SELECT * FROM festival_year_dates WHERE festival_id = ? AND applicable_year = ? LIMIT 1'
    ).bind(fest.id, year).first();

    // If existing row is already MANUALLY_CONFIRMED or AUTO_VERIFIED and incoming is unverified (IMPORTED_PENDING),
    // preserve the existing verified date rather than downgrading a confirmed production date!
    if (
      existingRow &&
      existingRow.resolved_date &&
      parseDateOnlyStrict(existingRow.resolved_date).valid &&
      (existingRow.verification_status === FESTIVAL_VERIFICATION_STATUS.MANUALLY_CONFIRMED ||
        (existingRow.verification_status === FESTIVAL_VERIFICATION_STATUS.AUTO_VERIFIED && !providerVerified))
    ) {
      preservedCount++;
      continue;
    }

    const fydId = existingRow?.id || `fyd_${fest.id}_${year}`;
    const tz = isValidIanaTimezone(item.timezone) ? item.timezone.trim() : (fest.default_timezone || DEFAULT_FESTIVAL_TIMEZONE);
    const sourceRef = String(item.source || responseData.source || parsedEndpoint.hostname).slice(0, 200);

    await db.prepare(`
      INSERT INTO festival_year_dates (
        id, festival_id, applicable_year, resolved_date, timezone,
        verification_status, resolution_source, source_reference,
        provider_payload_json, last_verified_at, verified_by,
        requires_approval, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(festival_id, applicable_year) DO UPDATE SET
        resolved_date = excluded.resolved_date,
        timezone = excluded.timezone,
        verification_status = excluded.verification_status,
        resolution_source = excluded.resolution_source,
        source_reference = excluded.source_reference,
        provider_payload_json = excluded.provider_payload_json,
        last_verified_at = excluded.last_verified_at,
        updated_at = excluded.updated_at
    `).bind(
      fydId,
      fest.id,
      year,
      dateCheck.dateStr,
      tz,
      newVerificationStatus,
      FESTIVAL_CALCULATION_METHODS.EXTERNAL_PROVIDER,
      sourceRef,
      JSON.stringify({ syncedFrom: parsedEndpoint.hostname, verified: providerVerified }),
      providerVerified ? nowIso : (existingRow?.last_verified_at || null),
      providerVerified ? 'external_provider' : (existingRow?.verified_by || null),
      fest.requires_admin_approval ? 1 : 0,
      String(item.notes || 'Synchronized from external festival calendar provider.').slice(0, 400),
      existingRow?.created_at || nowIso,
      nowIso
    ).run();

    await recalculateCampaignWindowsForFestivalYear(db, fest.id, year);
    updatedCount++;
  }

  invalidateFestivalSchedulerCache();

  await recordFestivalAuditLog(db, {
    applicableYear: year,
    actionType: 'PROVIDER_SYNC',
    providerName: parsedEndpoint.hostname,
    status: 'SUCCESS',
    newValue: { updatedCount, preservedCount, rejectedCount },
    reason: `Synchronized ${updatedCount} festival date(s) for ${year}.`,
    actorId,
    actorEmail
  });

  return {
    ok: true,
    code: 'SYNC_COMPLETED',
    year,
    updatedCount,
    preservedCount,
    rejectedCount
  };
}

// ============================================================================
// DATABASE BOOTSTRAP, SEEDING & AUDIT LOGGING
// ============================================================================

let _schemaEnsuredForDb = new WeakSet();

export async function ensureFestivalSchedulerSchema(db, options = {}) {
  if (!db || typeof db.prepare !== 'function') return;
  if (_schemaEnsuredForDb.has(db) && !options.force) return;

  const statements = [
    `CREATE TABLE IF NOT EXISTS festival_definitions (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      localized_names_json TEXT NOT NULL DEFAULT '{}',
      description TEXT DEFAULT '',
      category TEXT NOT NULL DEFAULT 'festival',
      calculation_method TEXT NOT NULL DEFAULT 'VERIFIED_CALENDAR_TABLE',
      fixed_month INTEGER DEFAULT NULL,
      fixed_day INTEGER DEFAULT NULL,
      calculation_rule_json TEXT NOT NULL DEFAULT '{}',
      default_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      default_days_before INTEGER NOT NULL DEFAULT 15,
      default_days_after INTEGER NOT NULL DEFAULT 3,
      requires_admin_approval INTEGER NOT NULL DEFAULT 0,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      source_attribution TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      lock_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT DEFAULT 'system'
    )`,
    `CREATE TABLE IF NOT EXISTS festival_year_dates (
      id TEXT PRIMARY KEY,
      festival_id TEXT NOT NULL,
      applicable_year INTEGER NOT NULL,
      resolved_date TEXT DEFAULT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      verification_status TEXT NOT NULL DEFAULT 'DATE_UNAVAILABLE',
      resolution_source TEXT NOT NULL DEFAULT 'system',
      source_reference TEXT DEFAULT '',
      provider_payload_json TEXT NOT NULL DEFAULT '{}',
      last_verified_at TEXT DEFAULT NULL,
      verified_by TEXT DEFAULT NULL,
      requires_approval INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (festival_id) REFERENCES festival_definitions(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS festival_date_overrides (
      id TEXT PRIMARY KEY,
      festival_id TEXT NOT NULL,
      applicable_year INTEGER NOT NULL,
      override_date TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      reason TEXT NOT NULL DEFAULT '',
      notes TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      previous_effective_date TEXT DEFAULT NULL,
      created_by TEXT NOT NULL DEFAULT 'admin',
      updated_by TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      removed_at TEXT DEFAULT NULL,
      removed_by TEXT DEFAULT NULL,
      FOREIGN KEY (festival_id) REFERENCES festival_definitions(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS festival_campaigns (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      festival_id TEXT NOT NULL,
      applicable_year INTEGER NOT NULL,
      title TEXT NOT NULL,
      badge_label TEXT DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'SCHEDULED',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      days_before INTEGER NOT NULL DEFAULT 15,
      days_after INTEGER NOT NULL DEFAULT 3,
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      effective_festival_date TEXT DEFAULT NULL,
      window_start_date TEXT DEFAULT NULL,
      window_end_date TEXT DEFAULT NULL,
      first_blocked_date TEXT DEFAULT NULL,
      display_priority INTEGER NOT NULL DEFAULT 10,
      lock_version INTEGER NOT NULL DEFAULT 1,
      created_by TEXT DEFAULT 'system',
      updated_by TEXT DEFAULT 'system',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (festival_id) REFERENCES festival_definitions(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS festival_campaign_templates (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      festival_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 1,
      allowed_variants_json TEXT NOT NULL DEFAULT '[]',
      custom_days_before INTEGER DEFAULT NULL,
      custom_days_after INTEGER DEFAULT NULL,
      badge_override TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      assigned_by TEXT DEFAULT 'admin',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES festival_campaigns(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS festival_sync_logs (
      id TEXT PRIMARY KEY,
      festival_id TEXT DEFAULT NULL,
      applicable_year INTEGER DEFAULT NULL,
      campaign_id TEXT DEFAULT NULL,
      action_type TEXT NOT NULL,
      provider_name TEXT DEFAULT 'internal',
      status TEXT NOT NULL DEFAULT 'SUCCESS',
      previous_value_json TEXT NOT NULL DEFAULT '{}',
      new_value_json TEXT NOT NULL DEFAULT '{}',
      reason TEXT DEFAULT '',
      error_code TEXT DEFAULT NULL,
      error_message TEXT DEFAULT NULL,
      actor_id TEXT NOT NULL DEFAULT 'system',
      actor_email TEXT DEFAULT '',
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_fd_enabled_category ON festival_definitions(is_enabled, category, slug)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_fyd_festival_year ON festival_year_dates(festival_id, applicable_year)`,
    `CREATE INDEX IF NOT EXISTS idx_fyd_year_status ON festival_year_dates(applicable_year, verification_status, resolved_date)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_fdo_active_festival_year ON festival_date_overrides(festival_id, applicable_year) WHERE is_active = 1`,
    `CREATE INDEX IF NOT EXISTS idx_fdo_lookup ON festival_date_overrides(festival_id, applicable_year, is_active)`,
    `CREATE INDEX IF NOT EXISTS idx_fc_festival_year ON festival_campaigns(festival_id, applicable_year, status)`,
    `CREATE INDEX IF NOT EXISTS idx_fc_active_window ON festival_campaigns(is_enabled, status, window_start_date, window_end_date)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_fct_campaign_template ON festival_campaign_templates(campaign_id, template_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fct_template_lookup ON festival_campaign_templates(template_id, is_enabled)`,
    `CREATE INDEX IF NOT EXISTS idx_fct_festival_lookup ON festival_campaign_templates(festival_id, is_enabled)`,
    `CREATE INDEX IF NOT EXISTS idx_fsl_festival_year ON festival_sync_logs(festival_id, applicable_year, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_fsl_action_created ON festival_sync_logs(action_type, created_at)`
  ];

  for (const stmt of statements) {
    try {
      await db.prepare(stmt).run();
    } catch (_) {}
  }

  // Ensure additive columns on templates, template_versions, and wishes if running on an unmigrated test DB
  try {
    await db.prepare(`ALTER TABLE templates ADD COLUMN festival_metadata_json TEXT DEFAULT '{}'`).run();
  } catch (_) {}
  try {
    await db.prepare(`ALTER TABLE template_versions ADD COLUMN festival_metadata_json TEXT DEFAULT '{}'`).run();
  } catch (_) {}
  try {
    await db.prepare(`ALTER TABLE wishes ADD COLUMN festival_campaign_id TEXT DEFAULT NULL`).run();
  } catch (_) {}

  _schemaEnsuredForDb.add(db);

  if (options.seedDefaults !== false) {
    await seedDefaultFestivalsIfEmpty(db, options.defaultYears || [2025, 2026, 2027]);
  }
}

/**
 * Seeds the canonical festival definitions and resolves their initial year dates if `festival_definitions` is empty.
 */
export async function seedDefaultFestivalsIfEmpty(db, years = [2025, 2026, 2027]) {
  if (!db || typeof db.prepare !== 'function') return;
  try {
    const existingCount = await db.prepare('SELECT COUNT(*) as cnt FROM festival_definitions').first();
    if (existingCount && Number(existingCount.cnt) > 0) return;

    const nowIso = new Date().toISOString();
    for (const def of CANONICAL_FESTIVAL_CATALOG) {
      const ruleJson = JSON.stringify({
        ...(def.calculationRule || {}),
        ...(def.verifiedDatesByYear ? { verifiedDatesByYear: def.verifiedDatesByYear } : {})
      });
      await db.prepare(`
        INSERT OR IGNORE INTO festival_definitions (
          id, slug, name, localized_names_json, description, category,
          calculation_method, fixed_month, fixed_day, calculation_rule_json,
          default_timezone, default_days_before, default_days_after,
          requires_admin_approval, is_enabled, source_attribution, notes,
          lock_version, created_at, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'system')
      `).bind(
        def.id,
        def.slug,
        def.name,
        JSON.stringify(def.localizedNames || {}),
        def.description || '',
        def.category || 'indian_festival',
        def.calculationMethod || FESTIVAL_CALCULATION_METHODS.VERIFIED_CALENDAR_TABLE,
        def.fixedMonth ?? null,
        def.fixedDay ?? null,
        ruleJson,
        def.defaultTimezone || DEFAULT_FESTIVAL_TIMEZONE,
        def.defaultDaysBefore ?? DEFAULT_DAYS_BEFORE_FESTIVAL,
        def.defaultDaysAfter ?? DEFAULT_DAYS_AFTER_FESTIVAL,
        def.requiresAdminApproval ? 1 : 0,
        1,
        def.sourceAttribution || '',
        '',
        nowIso,
        nowIso
      ).run();

      for (const yr of years) {
        const autoRes = resolveAutomaticFestivalDateForYear(def, yr);
        const fydId = `fyd_${def.id}_${yr}`;
        await db.prepare(`
          INSERT OR IGNORE INTO festival_year_dates (
            id, festival_id, applicable_year, resolved_date, timezone,
            verification_status, resolution_source, source_reference,
            provider_payload_json, last_verified_at, verified_by,
            requires_approval, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?)
        `).bind(
          fydId,
          def.id,
          yr,
          autoRes.resolvedDate,
          def.defaultTimezone || DEFAULT_FESTIVAL_TIMEZONE,
          autoRes.verificationStatus,
          autoRes.resolutionSource,
          autoRes.sourceReference || '',
          autoRes.verificationStatus === FESTIVAL_VERIFICATION_STATUS.AUTO_VERIFIED ? nowIso : null,
          autoRes.verificationStatus === FESTIVAL_VERIFICATION_STATUS.AUTO_VERIFIED ? 'system_resolver' : null,
          def.requiresAdminApproval ? 1 : 0,
          autoRes.notes || '',
          nowIso,
          nowIso
        ).run();
      }
    }
  } catch (_) {}
}

/**
 * Records an immutable audit event in `festival_sync_logs` and mirrors it to `admin_audit_logs` when available.
 */
export async function recordFestivalAuditLog(db, entry = {}) {
  if (!db || typeof db.prepare !== 'function') return null;
  const id = `fsl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const nowIso = new Date().toISOString();
  const prevJson = typeof entry.previousValue === 'string'
    ? entry.previousValue
    : JSON.stringify(entry.previousValue || {});
  const nextJson = typeof entry.newValue === 'string'
    ? entry.newValue
    : JSON.stringify(entry.newValue || {});

  try {
    await db.prepare(`
      INSERT INTO festival_sync_logs (
        id, festival_id, applicable_year, campaign_id, action_type,
        provider_name, status, previous_value_json, new_value_json,
        reason, error_code, error_message, actor_id, actor_email, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      entry.festivalId || null,
      entry.applicableYear !== undefined && entry.applicableYear !== null ? Number(entry.applicableYear) : null,
      entry.campaignId || null,
      String(entry.actionType || 'FESTIVAL_UPDATE'),
      String(entry.providerName || 'internal'),
      String(entry.status || 'SUCCESS'),
      prevJson,
      nextJson,
      String(entry.reason || '').slice(0, 500),
      entry.errorCode || null,
      entry.errorMessage || null,
      String(entry.actorId || 'system'),
      String(entry.actorEmail || ''),
      nowIso
    ).run();
  } catch (_) {}

  return id;
}

/**
 * Recalculates and persists the authoritative window boundaries (`effective_festival_date`,
 * `window_start_date`, `window_end_date`, `first_blocked_date`) on all campaigns for `(festivalId, year)`.
 * Ensures public availability never depends on a stale cached window when an admin updates or removes an override.
 */
export async function recalculateCampaignWindowsForFestivalYear(db, festivalId, applicableYear) {
  if (!db || typeof db.prepare !== 'function') return [];
  const yr = Number(applicableYear);
  const festival = await db.prepare('SELECT * FROM festival_definitions WHERE id = ? LIMIT 1').bind(festivalId).first();
  if (!festival) return [];

  const yearRecord = await db.prepare(
    'SELECT * FROM festival_year_dates WHERE festival_id = ? AND applicable_year = ? LIMIT 1'
  ).bind(festivalId, yr).first();

  const activeOverride = await db.prepare(
    'SELECT * FROM festival_date_overrides WHERE festival_id = ? AND applicable_year = ? AND is_active = 1 LIMIT 1'
  ).bind(festivalId, yr).first();

  const dateRes = resolveEffectiveFestivalDate({
    festival,
    yearRecord,
    activeOverride,
    applicableYear: yr
  });

  const campaignsRes = await db.prepare(
    'SELECT * FROM festival_campaigns WHERE festival_id = ? AND applicable_year = ?'
  ).bind(festivalId, yr).all().catch(() => ({ results: [] }));

  const updatedCampaigns = [];
  const nowIso = new Date().toISOString();

  for (const camp of (campaignsRes.results || [])) {
    const tz = isValidIanaTimezone(camp.timezone) ? camp.timezone : dateRes.timezone;
    const win = dateRes.effectiveDate
      ? calculatePublicationWindow(dateRes.effectiveDate, {
          daysBefore: Number(camp.days_before ?? DEFAULT_DAYS_BEFORE_FESTIVAL),
          daysAfter: Number(camp.days_after ?? DEFAULT_DAYS_AFTER_FESTIVAL),
          timezone: tz
        })
      : { valid: false, festivalDate: null, startDate: null, endDate: null, firstBlockedDate: null };

    await db.prepare(`
      UPDATE festival_campaigns
      SET effective_festival_date = ?,
          window_start_date = ?,
          window_end_date = ?,
          first_blocked_date = ?,
          timezone = ?,
          lock_version = lock_version + 1,
          updated_at = ?
      WHERE id = ?
    `).bind(
      win.valid ? win.festivalDate : null,
      win.valid ? win.startDate : null,
      win.valid ? win.endDate : null,
      win.valid ? win.firstBlockedDate : null,
      tz,
      nowIso,
      camp.id
    ).run();

    updatedCampaigns.push({
      campaignId: camp.id,
      effectiveFestivalDate: win.valid ? win.festivalDate : null,
      windowStartDate: win.valid ? win.startDate : null,
      windowEndDate: win.valid ? win.endDate : null,
      firstBlockedDate: win.valid ? win.firstBlockedDate : null,
      timezone: tz
    });
  }

  invalidateFestivalSchedulerCache();
  return updatedCampaigns;
}

/**
 * Sets or updates a manual administrator date override for `(festivalId, applicableYear)`.
 * Stores the override separately in `festival_date_overrides` without overwriting `festival_year_dates`.
 */
export async function setFestivalDateOverride(db, {
  festivalId,
  applicableYear,
  overrideDate,
  timezone = DEFAULT_FESTIVAL_TIMEZONE,
  reason = '',
  notes = '',
  actorId = 'admin',
  actorEmail = ''
}) {
  await ensureFestivalSchedulerSchema(db);
  const cleanFestId = String(festivalId || '').trim();
  const yr = Number(applicableYear);
  if (!cleanFestId) {
    return { ok: false, status: 400, code: 'MISSING_FESTIVAL_ID', message: 'festivalId is required.' };
  }
  if (!Number.isInteger(yr) || yr < 1970 || yr > 2100) {
    return { ok: false, status: 400, code: 'INVALID_YEAR', message: 'applicableYear must be a valid year (1970-2100).' };
  }

  const dateCheck = parseDateOnlyStrict(overrideDate);
  if (!dateCheck.valid) {
    return { ok: false, status: 400, code: 'INVALID_OVERRIDE_DATE', message: dateCheck.reason };
  }
  if (dateCheck.year !== yr) {
    return {
      ok: false,
      status: 400,
      code: 'OVERRIDE_YEAR_MISMATCH',
      message: `Override date "${overrideDate}" belongs to year ${dateCheck.year}, which does not match applicableYear ${yr}.`
    };
  }
  if (!isValidIanaTimezone(timezone)) {
    return { ok: false, status: 400, code: 'INVALID_TIMEZONE', message: `Unsupported IANA timezone "${timezone}".` };
  }
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) {
    return { ok: false, status: 400, code: 'MISSING_OVERRIDE_REASON', message: 'An override reason is required for audit compliance.' };
  }

  const festival = await db.prepare('SELECT * FROM festival_definitions WHERE id = ? OR slug = ? LIMIT 1')
    .bind(cleanFestId, cleanFestId).first();
  if (!festival) {
    return { ok: false, status: 404, code: 'FESTIVAL_NOT_FOUND', message: `Festival "${cleanFestId}" not found.` };
  }

  const yearRecord = await db.prepare(
    'SELECT * FROM festival_year_dates WHERE festival_id = ? AND applicable_year = ? LIMIT 1'
  ).bind(festival.id, yr).first();

  const existingActive = await db.prepare(
    'SELECT * FROM festival_date_overrides WHERE festival_id = ? AND applicable_year = ? AND is_active = 1 LIMIT 1'
  ).bind(festival.id, yr).first();

  const beforeResolution = resolveEffectiveFestivalDate({
    festival,
    yearRecord,
    activeOverride: existingActive,
    applicableYear: yr
  });

  const nowIso = new Date().toISOString();
  const ovId = existingActive?.id || `fdo_${festival.id}_${yr}_${Date.now().toString(36)}`;

  if (existingActive) {
    await db.prepare(`
      UPDATE festival_date_overrides
      SET override_date = ?,
          timezone = ?,
          reason = ?,
          notes = ?,
          previous_effective_date = ?,
          updated_by = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(
      dateCheck.dateStr,
      timezone.trim(),
      cleanReason.slice(0, 300),
      String(notes || '').slice(0, 500),
      beforeResolution.effectiveDate || yearRecord?.resolved_date || null,
      actorId,
      nowIso,
      existingActive.id
    ).run();
  } else {
    await db.prepare(`
      INSERT INTO festival_date_overrides (
        id, festival_id, applicable_year, override_date, timezone,
        reason, notes, is_active, previous_effective_date,
        created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).bind(
      ovId,
      festival.id,
      yr,
      dateCheck.dateStr,
      timezone.trim(),
      cleanReason.slice(0, 300),
      String(notes || '').slice(0, 500),
      beforeResolution.effectiveDate || yearRecord?.resolved_date || null,
      actorId,
      actorId,
      nowIso,
      nowIso
    ).run();
  }

  const updatedCampaignWindows = await recalculateCampaignWindowsForFestivalYear(db, festival.id, yr);
  const newActiveOverride = await db.prepare(
    'SELECT * FROM festival_date_overrides WHERE festival_id = ? AND applicable_year = ? AND is_active = 1 LIMIT 1'
  ).bind(festival.id, yr).first();

  const afterResolution = resolveEffectiveFestivalDate({
    festival,
    yearRecord,
    activeOverride: newActiveOverride,
    applicableYear: yr
  });

  const previewWindow = calculatePublicationWindow(afterResolution.effectiveDate, {
    daysBefore: Number(festival.default_days_before ?? DEFAULT_DAYS_BEFORE_FESTIVAL),
    daysAfter: Number(festival.default_days_after ?? DEFAULT_DAYS_AFTER_FESTIVAL),
    timezone: afterResolution.timezone
  });

  await recordFestivalAuditLog(db, {
    festivalId: festival.id,
    applicableYear: yr,
    actionType: 'DATE_OVERRIDE_SET',
    previousValue: {
      effectiveDate: beforeResolution.effectiveDate,
      sourceDate: beforeResolution.sourceDate,
      isOverridden: beforeResolution.isOverridden,
      timezone: beforeResolution.timezone
    },
    newValue: {
      effectiveDate: afterResolution.effectiveDate,
      sourceDate: afterResolution.sourceDate,
      isOverridden: afterResolution.isOverridden,
      timezone: afterResolution.timezone,
      windowStartDate: previewWindow.startDate,
      windowEndDate: previewWindow.endDate,
      firstBlockedDate: previewWindow.firstBlockedDate
    },
    reason: cleanReason,
    actorId,
    actorEmail
  });

  return {
    ok: true,
    status: 200,
    festivalId: festival.id,
    applicableYear: yr,
    override: newActiveOverride,
    dateResolution: afterResolution,
    publicationWindowPreview: previewWindow,
    updatedCampaignWindows
  };
}

/**
 * Removes an active manual date override for `(festivalId, applicableYear)` and restores
 * the underlying automatic/imported source date resolution without destroying source data.
 */
export async function removeFestivalDateOverride(db, {
  festivalId,
  applicableYear,
  reason = 'Manual override removed by administrator; restored automatic resolution.',
  actorId = 'admin',
  actorEmail = ''
}) {
  await ensureFestivalSchedulerSchema(db);
  const cleanFestId = String(festivalId || '').trim();
  const yr = Number(applicableYear);
  const festival = await db.prepare('SELECT * FROM festival_definitions WHERE id = ? OR slug = ? LIMIT 1')
    .bind(cleanFestId, cleanFestId).first();
  if (!festival) {
    return { ok: false, status: 404, code: 'FESTIVAL_NOT_FOUND', message: `Festival "${cleanFestId}" not found.` };
  }

  const existingActive = await db.prepare(
    'SELECT * FROM festival_date_overrides WHERE festival_id = ? AND applicable_year = ? AND is_active = 1 LIMIT 1'
  ).bind(festival.id, yr).first();

  if (!existingActive) {
    return {
      ok: false,
      status: 404,
      code: 'OVERRIDE_NOT_FOUND',
      message: `No active manual date override exists for ${festival.name} (${yr}).`
    };
  }

  const yearRecord = await db.prepare(
    'SELECT * FROM festival_year_dates WHERE festival_id = ? AND applicable_year = ? LIMIT 1'
  ).bind(festival.id, yr).first();

  const beforeResolution = resolveEffectiveFestivalDate({
    festival,
    yearRecord,
    activeOverride: existingActive,
    applicableYear: yr
  });

  const nowIso = new Date().toISOString();
  await db.prepare(`
    UPDATE festival_date_overrides
    SET is_active = 0,
        removed_at = ?,
        removed_by = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(nowIso, actorId, nowIso, existingActive.id).run();

  const updatedCampaignWindows = await recalculateCampaignWindowsForFestivalYear(db, festival.id, yr);
  const afterResolution = resolveEffectiveFestivalDate({
    festival,
    yearRecord,
    activeOverride: null,
    applicableYear: yr
  });

  const previewWindow = afterResolution.effectiveDate
    ? calculatePublicationWindow(afterResolution.effectiveDate, {
        daysBefore: Number(festival.default_days_before ?? DEFAULT_DAYS_BEFORE_FESTIVAL),
        daysAfter: Number(festival.default_days_after ?? DEFAULT_DAYS_AFTER_FESTIVAL),
        timezone: afterResolution.timezone
      })
    : null;

  await recordFestivalAuditLog(db, {
    festivalId: festival.id,
    applicableYear: yr,
    actionType: 'DATE_OVERRIDE_REMOVED',
    previousValue: {
      overrideDate: existingActive.override_date,
      effectiveDate: beforeResolution.effectiveDate,
      isOverridden: true
    },
    newValue: {
      effectiveDate: afterResolution.effectiveDate,
      sourceDate: afterResolution.sourceDate,
      isOverridden: false,
      verificationStatus: afterResolution.verificationStatus
    },
    reason: String(reason || 'Manual override removed'),
    actorId,
    actorEmail
  });

  return {
    ok: true,
    status: 200,
    festivalId: festival.id,
    applicableYear: yr,
    dateResolution: afterResolution,
    publicationWindowPreview: previewWindow,
    updatedCampaignWindows
  };
}

/**
 * Creates or updates a festival campaign for `(festivalId, applicableYear)`.
 */
export async function upsertFestivalCampaign(db, payload = {}, actor = {}) {
  await ensureFestivalSchedulerSchema(db);
  const actorId = String(actor.id || 'admin');
  const actorEmail = String(actor.email || '');

  const rawFestId = String(payload.festivalId || payload.festival_id || '').trim();
  const yr = Number(payload.applicableYear ?? payload.applicable_year ?? new Date().getUTCFullYear());
  if (!rawFestId) {
    return { ok: false, status: 400, code: 'MISSING_FESTIVAL_ID', message: 'festivalId is required.' };
  }
  if (!Number.isInteger(yr) || yr < 1970 || yr > 2100) {
    return { ok: false, status: 400, code: 'INVALID_YEAR', message: 'applicableYear must be between 1970 and 2100.' };
  }

  const festival = await db.prepare('SELECT * FROM festival_definitions WHERE id = ? OR slug = ? LIMIT 1')
    .bind(rawFestId, rawFestId).first();
  if (!festival) {
    return { ok: false, status: 404, code: 'FESTIVAL_NOT_FOUND', message: `Festival "${rawFestId}" does not exist.` };
  }

  // Ensure year date row exists or resolve automatically
  let yearRecord = await db.prepare(
    'SELECT * FROM festival_year_dates WHERE festival_id = ? AND applicable_year = ? LIMIT 1'
  ).bind(festival.id, yr).first();

  const nowIso = new Date().toISOString();
  if (!yearRecord) {
    const autoRes = resolveAutomaticFestivalDateForYear(festival, yr);
    const fydId = `fyd_${festival.id}_${yr}`;
    await db.prepare(`
      INSERT INTO festival_year_dates (
        id, festival_id, applicable_year, resolved_date, timezone,
        verification_status, resolution_source, source_reference,
        provider_payload_json, last_verified_at, verified_by,
        requires_approval, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?)
    `).bind(
      fydId,
      festival.id,
      yr,
      autoRes.resolvedDate,
      festival.default_timezone || DEFAULT_FESTIVAL_TIMEZONE,
      autoRes.verificationStatus,
      autoRes.resolutionSource,
      autoRes.sourceReference || '',
      autoRes.verificationStatus === FESTIVAL_VERIFICATION_STATUS.AUTO_VERIFIED ? nowIso : null,
      autoRes.verificationStatus === FESTIVAL_VERIFICATION_STATUS.AUTO_VERIFIED ? 'system_resolver' : null,
      festival.requires_admin_approval ? 1 : 0,
      autoRes.notes || '',
      nowIso,
      nowIso
    ).run();
    yearRecord = await db.prepare('SELECT * FROM festival_year_dates WHERE id = ? LIMIT 1').bind(fydId).first();
  }

  const activeOverride = await db.prepare(
    'SELECT * FROM festival_date_overrides WHERE festival_id = ? AND applicable_year = ? AND is_active = 1 LIMIT 1'
  ).bind(festival.id, yr).first();

  const dateRes = resolveEffectiveFestivalDate({
    festival,
    yearRecord,
    activeOverride,
    applicableYear: yr
  });

  const existingCampaign = payload.id
    ? await db.prepare('SELECT * FROM festival_campaigns WHERE id = ? LIMIT 1').bind(String(payload.id).trim()).first()
    : await db.prepare('SELECT * FROM festival_campaigns WHERE festival_id = ? AND applicable_year = ? LIMIT 1').bind(festival.id, yr).first();

  const daysBefore = payload.daysBefore !== undefined && payload.daysBefore !== null
    ? Number(payload.daysBefore)
    : (payload.days_before !== undefined && payload.days_before !== null
        ? Number(payload.days_before)
        : (existingCampaign ? Number(existingCampaign.days_before) : Number(festival.default_days_before ?? DEFAULT_DAYS_BEFORE_FESTIVAL)));

  const daysAfter = payload.daysAfter !== undefined && payload.daysAfter !== null
    ? Number(payload.daysAfter)
    : (payload.days_after !== undefined && payload.days_after !== null
        ? Number(payload.days_after)
        : (existingCampaign ? Number(existingCampaign.days_after) : Number(festival.default_days_after ?? DEFAULT_DAYS_AFTER_FESTIVAL)));

  if (!Number.isInteger(daysBefore) || daysBefore < 0 || daysBefore > 180) {
    return { ok: false, status: 400, code: 'INVALID_DAYS_BEFORE', message: 'daysBefore must be an integer between 0 and 180.' };
  }
  if (!Number.isInteger(daysAfter) || daysAfter < 0 || daysAfter > 60) {
    return { ok: false, status: 400, code: 'INVALID_DAYS_AFTER', message: 'daysAfter must be an integer between 0 and 60.' };
  }

  const tz = payload.timezone
    ? String(payload.timezone).trim()
    : (existingCampaign?.timezone || dateRes.timezone || DEFAULT_FESTIVAL_TIMEZONE);
  if (!isValidIanaTimezone(tz)) {
    return { ok: false, status: 400, code: 'INVALID_TIMEZONE', message: `Invalid IANA timezone "${tz}".` };
  }

  const requestedStatus = String(payload.status || existingCampaign?.status || CAMPAIGN_STATUS.SCHEDULED).toUpperCase().trim();
  if (!VALID_CAMPAIGN_STATUSES.has(requestedStatus)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_CAMPAIGN_STATUS',
      message: `Invalid campaign status "${requestedStatus}". Allowed: ${Array.from(VALID_CAMPAIGN_STATUSES).join(', ')}.`
    };
  }

  const win = dateRes.effectiveDate
    ? calculatePublicationWindow(dateRes.effectiveDate, { daysBefore, daysAfter, timezone: tz })
    : { valid: false, festivalDate: null, startDate: null, endDate: null, firstBlockedDate: null };

  const campId = existingCampaign?.id || String(payload.id || `camp_${festival.slug}_${yr}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  const campSlug = existingCampaign?.slug || String(payload.slug || `${festival.slug}-${yr}`).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const title = String(payload.title || existingCampaign?.title || `${festival.name} ${yr} Campaign`).trim().slice(0, 120);
  const badgeLabel = String(payload.badgeLabel ?? payload.badge_label ?? existingCampaign?.badge_label ?? `✨ ${festival.name} Special`).trim().slice(0, 80);
  const description = String(payload.description ?? existingCampaign?.description ?? festival.description ?? '').trim().slice(0, 500);
  const isEnabled = payload.isEnabled !== undefined
    ? (payload.isEnabled ? 1 : 0)
    : (payload.is_enabled !== undefined ? (payload.is_enabled ? 1 : 0) : (existingCampaign ? Number(existingCampaign.is_enabled) : 1));
  const displayPriority = Number.isInteger(Number(payload.displayPriority ?? payload.display_priority))
    ? Number(payload.displayPriority ?? payload.display_priority)
    : (existingCampaign ? Number(existingCampaign.display_priority) : 10);

  if (existingCampaign) {
    await db.prepare(`
      UPDATE festival_campaigns
      SET title = ?,
          badge_label = ?,
          description = ?,
          status = ?,
          is_enabled = ?,
          days_before = ?,
          days_after = ?,
          timezone = ?,
          effective_festival_date = ?,
          window_start_date = ?,
          window_end_date = ?,
          first_blocked_date = ?,
          display_priority = ?,
          lock_version = lock_version + 1,
          updated_by = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(
      title,
      badgeLabel,
      description,
      requestedStatus,
      isEnabled,
      daysBefore,
      daysAfter,
      tz,
      win.valid ? win.festivalDate : null,
      win.valid ? win.startDate : null,
      win.valid ? win.endDate : null,
      win.valid ? win.firstBlockedDate : null,
      displayPriority,
      actorId,
      nowIso,
      existingCampaign.id
    ).run();
  } else {
    await db.prepare(`
      INSERT INTO festival_campaigns (
        id, slug, festival_id, applicable_year, title, badge_label, description,
        status, is_enabled, days_before, days_after, timezone,
        effective_festival_date, window_start_date, window_end_date, first_blocked_date,
        display_priority, lock_version, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).bind(
      campId,
      campSlug,
      festival.id,
      yr,
      title,
      badgeLabel,
      description,
      requestedStatus,
      isEnabled,
      daysBefore,
      daysAfter,
      tz,
      win.valid ? win.festivalDate : null,
      win.valid ? win.startDate : null,
      win.valid ? win.endDate : null,
      win.valid ? win.firstBlockedDate : null,
      displayPriority,
      actorId,
      actorId,
      nowIso,
      nowIso
    ).run();
  }

  invalidateFestivalSchedulerCache();
  const savedCampaign = await db.prepare('SELECT * FROM festival_campaigns WHERE id = ? LIMIT 1').bind(campId).first();
  const eligibility = evaluateCampaignEligibility({
    campaign: savedCampaign,
    festival,
    yearRecord,
    activeOverride
  });

  await recordFestivalAuditLog(db, {
    festivalId: festival.id,
    applicableYear: yr,
    campaignId: campId,
    actionType: existingCampaign ? 'CAMPAIGN_UPDATED' : 'CAMPAIGN_CREATED',
    previousValue: existingCampaign || {},
    newValue: savedCampaign || {},
    reason: String(payload.reason || `${existingCampaign ? 'Updated' : 'Created'} campaign ${title}`),
    actorId,
    actorEmail
  });

  return {
    ok: true,
    status: existingCampaign ? 200 : 201,
    campaign: savedCampaign,
    eligibility
  };
}

/**
 * Assigns one or more existing WishMagic templates (and optional relation variant restrictions)
 * to a festival campaign without duplicating template files.
 */
export async function assignTemplatesToFestivalCampaign(db, {
  campaignId,
  assignments = [],
  seedTemplatesCatalog = [],
  actorId = 'admin',
  actorEmail = ''
}) {
  await ensureFestivalSchedulerSchema(db);
  const cleanCampId = String(campaignId || '').trim();
  if (!cleanCampId) {
    return { ok: false, status: 400, code: 'MISSING_CAMPAIGN_ID', message: 'campaignId is required.' };
  }

  const campaign = await db.prepare('SELECT * FROM festival_campaigns WHERE id = ? OR slug = ? LIMIT 1')
    .bind(cleanCampId, cleanCampId).first();
  if (!campaign) {
    return { ok: false, status: 404, code: 'CAMPAIGN_NOT_FOUND', message: `Campaign "${cleanCampId}" not found.` };
  }

  if (!Array.isArray(assignments) || assignments.length === 0) {
    return { ok: false, status: 400, code: 'EMPTY_ASSIGNMENTS', message: 'At least one template assignment is required.' };
  }

  const results = [];
  const nowIso = new Date().toISOString();

  for (let i = 0; i < assignments.length; i++) {
    const item = typeof assignments[i] === 'string' ? { templateId: assignments[i] } : (assignments[i] || {});
    const rawTplId = String(item.templateId || item.template_id || item.id || '').trim();
    if (!rawTplId) {
      return { ok: false, status: 400, code: 'MISSING_TEMPLATE_ID', message: `Assignment at index ${i} is missing templateId.` };
    }

    // Verify template exists in D1 `templates` or `seedTemplatesCatalog`
    let tplRecord = await db.prepare('SELECT * FROM templates WHERE id = ? OR slug = ? LIMIT 1')
      .bind(rawTplId, rawTplId).first();
    if (!tplRecord && Array.isArray(seedTemplatesCatalog)) {
      tplRecord = seedTemplatesCatalog.find(s => s.id === rawTplId || s.slug === rawTplId) || null;
    }
    if (!tplRecord) {
      return {
        ok: false,
        status: 404,
        code: 'TEMPLATE_NOT_FOUND',
        message: `Template "${rawTplId}" does not exist in WishMagic.`
      };
    }

    const canonicalTplId = tplRecord.id;

    // Validate optional allowedVariants against template's actual declared variants if specified
    const rawAllowedVars = Array.isArray(item.allowedVariants)
      ? item.allowedVariants
      : (Array.isArray(item.allowed_variants) ? item.allowed_variants : []);

    const normalizedAllowedVars = [];
    if (rawAllowedVars.length > 0) {
      const dbVars = await db.prepare(
        'SELECT * FROM template_relationship_variants WHERE template_id = ? AND is_latest = 1'
      ).bind(canonicalTplId).all().catch(() => ({ results: [] }));
      let parsedJsonVars = [];
      try {
        parsedJsonVars = typeof tplRecord.variants_json === 'string'
          ? JSON.parse(tplRecord.variants_json)
          : (Array.isArray(tplRecord.variants) ? tplRecord.variants : []);
      } catch (_) {}

      const knownVarRows = [...(dbVars.results || []), ...(Array.isArray(parsedJsonVars) ? parsedJsonVars : [])];

      for (const reqVar of rawAllowedVars) {
        const cleanReq = String(reqVar || '').trim();
        if (!cleanReq) continue;
        const normRel = normalizeRelationshipIdentifier(cleanReq);
        const relSlug = normRel ? normRel.slug : cleanReq.toLowerCase();

        if (knownVarRows.length > 0) {
          const matched = knownVarRows.find(vr => {
            const vId = String(vr.id || '').toLowerCase();
            const vSlug = String(vr.variant_slug || vr.slug || '').toLowerCase();
            const vRel = String(vr.relationship_slug || vr.relationshipSlug || vr.relationship || '').toLowerCase();
            return vId === cleanReq.toLowerCase() || vSlug === cleanReq.toLowerCase() || vRel === relSlug;
          });
          if (!matched) {
            return {
              ok: false,
              status: 422,
              code: 'UNKNOWN_TEMPLATE_VARIANT',
              message: `Variant or relationship "${cleanReq}" does not exist on template "${canonicalTplId}".`
            };
          }
          normalizedAllowedVars.push(String(matched.relationship_slug || matched.relationshipSlug || matched.relationship || matched.id || relSlug));
        } else {
          normalizedAllowedVars.push(relSlug);
        }
      }
    }

    const existingAssign = await db.prepare(
      'SELECT * FROM festival_campaign_templates WHERE campaign_id = ? AND template_id = ? LIMIT 1'
    ).bind(campaign.id, canonicalTplId).first();

    const assignId = existingAssign?.id || `fct_${campaign.id}_${canonicalTplId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const isEnabled = item.isEnabled !== undefined
      ? (item.isEnabled ? 1 : 0)
      : (item.is_enabled !== undefined ? (item.is_enabled ? 1 : 0) : (existingAssign ? Number(existingAssign.is_enabled) : 1));
    const displayOrder = Number.isInteger(Number(item.displayOrder ?? item.display_order))
      ? Number(item.displayOrder ?? item.display_order)
      : (existingAssign ? Number(existingAssign.display_order) : (i + 1));
    const customDaysBefore = (item.customDaysBefore !== undefined && item.customDaysBefore !== null && item.customDaysBefore !== '')
      ? Number(item.customDaysBefore)
      : ((item.custom_days_before !== undefined && item.custom_days_before !== null && item.custom_days_before !== '')
          ? Number(item.custom_days_before)
          : null);
    const customDaysAfter = (item.customDaysAfter !== undefined && item.customDaysAfter !== null && item.customDaysAfter !== '')
      ? Number(item.customDaysAfter)
      : ((item.custom_days_after !== undefined && item.custom_days_after !== null && item.custom_days_after !== '')
          ? Number(item.custom_days_after)
          : null);
    const badgeOverride = String(item.badgeOverride ?? item.badge_override ?? existingAssign?.badge_override ?? '').trim().slice(0, 80);
    const notes = String(item.notes ?? existingAssign?.notes ?? '').trim().slice(0, 400);

    await db.prepare(`
      INSERT INTO festival_campaign_templates (
        id, campaign_id, festival_id, template_id, is_enabled, display_order,
        allowed_variants_json, custom_days_before, custom_days_after,
        badge_override, notes, assigned_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id, template_id) DO UPDATE SET
        is_enabled = excluded.is_enabled,
        display_order = excluded.display_order,
        allowed_variants_json = excluded.allowed_variants_json,
        custom_days_before = excluded.custom_days_before,
        custom_days_after = excluded.custom_days_after,
        badge_override = excluded.badge_override,
        notes = excluded.notes,
        assigned_by = excluded.assigned_by,
        updated_at = excluded.updated_at
    `).bind(
      assignId,
      campaign.id,
      campaign.festival_id,
      canonicalTplId,
      isEnabled,
      displayOrder,
      JSON.stringify(Array.from(new Set(normalizedAllowedVars))),
      customDaysBefore,
      customDaysAfter,
      badgeOverride,
      notes,
      actorId,
      existingAssign?.created_at || nowIso,
      nowIso
    ).run();

    const savedRow = await db.prepare('SELECT * FROM festival_campaign_templates WHERE id = ? LIMIT 1').bind(assignId).first();
    results.push(savedRow);
  }

  invalidateFestivalSchedulerCache();

  await recordFestivalAuditLog(db, {
    festivalId: campaign.festival_id,
    applicableYear: campaign.applicable_year,
    campaignId: campaign.id,
    actionType: 'TEMPLATE_ASSIGNED',
    newValue: { assignedCount: results.length, templates: results.map(r => r.template_id) },
    reason: `Assigned ${results.length} template(s) to campaign ${campaign.title}.`,
    actorId,
    actorEmail
  });

  return {
    ok: true,
    status: 200,
    campaignId: campaign.id,
    assignments: results
  };
}

/**
 * Removes a template assignment from a campaign without deleting the underlying WishMagic template or existing wishes.
 */
export async function removeTemplateFromFestivalCampaign(db, {
  campaignId,
  templateId,
  actorId = 'admin',
  actorEmail = ''
}) {
  await ensureFestivalSchedulerSchema(db);
  const existing = await db.prepare(
    'SELECT * FROM festival_campaign_templates WHERE campaign_id = ? AND (template_id = ? OR id = ?) LIMIT 1'
  ).bind(String(campaignId || '').trim(), String(templateId || '').trim(), String(templateId || '').trim()).first();

  if (!existing) {
    return { ok: false, status: 404, code: 'ASSIGNMENT_NOT_FOUND', message: 'Template assignment not found on this campaign.' };
  }

  await db.prepare('DELETE FROM festival_campaign_templates WHERE id = ?').bind(existing.id).run();
  invalidateFestivalSchedulerCache();

  await recordFestivalAuditLog(db, {
    festivalId: existing.festival_id,
    campaignId: existing.campaign_id,
    actionType: 'TEMPLATE_UNASSIGNED',
    previousValue: existing,
    reason: `Removed template "${existing.template_id}" from campaign "${existing.campaign_id}" (underlying template & wishes preserved).`,
    actorId,
    actorEmail
  });

  return {
    ok: true,
    status: 200,
    removedAssignmentId: existing.id,
    templateId: existing.template_id,
    campaignId: existing.campaign_id
  };
}

/**
 * Loads the complete festival scheduler state (festivals, year dates, overrides, campaigns, assignments)
 * and evaluates live eligibility for every campaign and template assignment at `nowMs`.
 */
export async function loadFestivalSchedulerState(db, options = {}) {
  await ensureFestivalSchedulerSchema(db, { seedDefaults: options.seedDefaults !== false });
  const nowMs = options.nowMs !== undefined ? options.nowMs : Date.now();

  const [festRows, yearRows, overrideRows, campaignRows, assignRows] = await Promise.all([
    db.prepare('SELECT * FROM festival_definitions ORDER BY name ASC').all().catch(() => ({ results: [] })),
    db.prepare('SELECT * FROM festival_year_dates ORDER BY applicable_year ASC').all().catch(() => ({ results: [] })),
    db.prepare('SELECT * FROM festival_date_overrides WHERE is_active = 1').all().catch(() => ({ results: [] })),
    db.prepare('SELECT * FROM festival_campaigns ORDER BY applicable_year DESC, display_priority ASC').all().catch(() => ({ results: [] })),
    db.prepare('SELECT * FROM festival_campaign_templates ORDER BY display_order ASC').all().catch(() => ({ results: [] }))
  ]);

  const festivalsById = new Map();
  for (const f of (festRows.results || [])) {
    festivalsById.set(f.id, f);
  }

  const yearDatesByKey = new Map();
  for (const y of (yearRows.results || [])) {
    yearDatesByKey.set(`${y.festival_id}::${y.applicable_year}`, y);
  }

  const activeOverridesByKey = new Map();
  for (const ov of (overrideRows.results || [])) {
    if (Number(ov.is_active) === 1) {
      activeOverridesByKey.set(`${ov.festival_id}::${ov.applicable_year}`, ov);
    }
  }

  const assignmentsByCampaignId = new Map();
  const assignmentsByTemplateId = new Map();
  for (const a of (assignRows.results || [])) {
    let allowedVariants = [];
    try {
      allowedVariants = JSON.parse(a.allowed_variants_json || '[]');
    } catch (_) {}
    const enrichedAssign = {
      ...a,
      isEnabled: Boolean(Number(a.is_enabled)),
      allowedVariants: Array.isArray(allowedVariants) ? allowedVariants : []
    };
    if (!assignmentsByCampaignId.has(a.campaign_id)) assignmentsByCampaignId.set(a.campaign_id, []);
    assignmentsByCampaignId.get(a.campaign_id).push(enrichedAssign);

    if (!assignmentsByTemplateId.has(a.template_id)) assignmentsByTemplateId.set(a.template_id, []);
    assignmentsByTemplateId.get(a.template_id).push(enrichedAssign);
  }

  const evaluatedCampaigns = [];
  const evaluatedCampaignsById = new Map();

  for (const camp of (campaignRows.results || [])) {
    const fest = festivalsById.get(camp.festival_id) || null;
    const key = `${camp.festival_id}::${camp.applicable_year}`;
    const yearRecord = yearDatesByKey.get(key) || null;
    const activeOverride = activeOverridesByKey.get(key) || null;
    const campAssigns = assignmentsByCampaignId.get(camp.id) || [];

    const eligibility = evaluateCampaignEligibility({
      campaign: camp,
      festival: fest,
      yearRecord,
      activeOverride,
      nowMs
    });

    const enrichedCampaign = {
      id: camp.id,
      slug: camp.slug,
      festivalId: camp.festival_id,
      festivalSlug: fest?.slug || '',
      festivalName: fest?.name || camp.title,
      festivalCategory: fest?.category || 'festival',
      applicableYear: Number(camp.applicable_year),
      title: camp.title,
      badgeLabel: camp.badge_label || `✨ ${fest?.name || camp.title}`,
      description: camp.description || fest?.description || '',
      status: camp.status,
      isEnabled: Boolean(Number(camp.is_enabled)),
      daysBefore: Number(camp.days_before),
      daysAfter: Number(camp.days_after),
      timezone: eligibility.window?.timezone || camp.timezone || DEFAULT_FESTIVAL_TIMEZONE,
      effectiveFestivalDate: eligibility.dateResolution.effectiveDate,
      sourceFestivalDate: eligibility.dateResolution.sourceDate,
      isDateOverridden: eligibility.dateResolution.isOverridden,
      dateVerificationStatus: eligibility.dateResolution.verificationStatus,
      datePrecedenceTier: eligibility.dateResolution.precedenceTier,
      windowStartDate: eligibility.window?.startDate || null,
      windowEndDate: eligibility.window?.endDate || null,
      firstBlockedDate: eligibility.window?.firstBlockedDate || null,
      displayPriority: Number(camp.display_priority ?? 10),
      eligible: eligibility.eligible,
      effectiveState: eligibility.effectiveState,
      eligibilityCode: eligibility.code,
      eligibilityMessage: eligibility.message,
      assignedTemplatesCount: campAssigns.filter(a => a.isEnabled).length,
      assignments: campAssigns,
      lockVersion: Number(camp.lock_version ?? 1),
      updatedAt: camp.updated_at
    };

    evaluatedCampaigns.push(enrichedCampaign);
    evaluatedCampaignsById.set(camp.id, enrichedCampaign);
  }

  return {
    festivals: festRows.results || [],
    festivalsById,
    yearDates: yearRows.results || [],
    yearDatesByKey,
    activeOverrides: overrideRows.results || [],
    activeOverridesByKey,
    campaigns: evaluatedCampaigns,
    campaignsById: evaluatedCampaignsById,
    assignmentsByCampaignId,
    assignmentsByTemplateId
  };
}

/**
 * Authoritative Server-Side Wish Creation Eligibility Check for Festival Campaigns & Templates.
 *
 * Rules Enforced:
 * 1. If `requestedCampaignId` is explicitly supplied:
 *    - The campaign must exist, be currently ACTIVE within `[startOfDay(startDate, tz), startOfDay(endDate + 1 day, tz))`,
 *      and have an enabled assignment for `templateId`.
 *    - If the assignment restricts `allowedVariants`, the requested relationship/variant must be permitted.
 * 2. If `requestedCampaignId` is NOT supplied, but `templateId` has campaign assignments in `festival_campaign_templates`:
 *    - If at least one assigned campaign for `templateId` is currently eligible (ACTIVE in window) and permits the requested variant,
 *      the wish is linked to the primary active campaign and allowed.
 *    - If `templateId` is assigned ONLY to festival campaign(s) that are all expired, paused, draft, or outside their window,
 *      creation is rejected with the authoritative campaign error (`FESTIVAL_CAMPAIGN_EXPIRED` / `FESTIVAL_CAMPAIGN_PAUSED` / etc.)
 *      so a stale open customizer or direct API call cannot bypass campaign expiry!
 * 3. If `templateId` has NO festival campaign assignments at all (regular evergreen birthday/anniversary template),
 *    it is not restricted by festival campaign windows.
 */
export async function validateWishCreationAgainstFestivalSchedule(db, {
  template,
  templateId,
  requestedCampaignId = null,
  requestedRelationship = '',
  requestedVariantId = '',
  nowMs = Date.now()
}) {
  if (!db || typeof db.prepare !== 'function') {
    return { allowed: true, isFestivalCampaignWish: false, campaign: null };
  }

  await ensureFestivalSchedulerSchema(db, { seedDefaults: false });
  const state = await loadFestivalSchedulerState(db, { seedDefaults: false, nowMs });

  const resolvedTplId = String(template?.id || templateId || '').trim();
  const tplAssignments = state.assignmentsByTemplateId.get(resolvedTplId) || [];

  // Case 1: Explicit campaignId passed by Customizer or API caller
  if (requestedCampaignId) {
    const cleanCampId = String(requestedCampaignId).trim();
    const camp = state.campaignsById.get(cleanCampId) ||
      state.campaigns.find(c => c.slug === cleanCampId);

    if (!camp) {
      return {
        allowed: false,
        status: 404,
        code: 'FESTIVAL_CAMPAIGN_NOT_FOUND',
        message: `The specified festival campaign ("${cleanCampId}") does not exist.`
      };
    }

    const assign = (state.assignmentsByCampaignId.get(camp.id) || []).find(
      a => a.template_id === resolvedTplId || a.template_id === template?.slug
    );

    if (!assign) {
      return {
        allowed: false,
        status: 422,
        code: 'TEMPLATE_NOT_ASSIGNED_TO_CAMPAIGN',
        message: `Template "${resolvedTplId}" is not assigned to festival campaign "${camp.title}".`
      };
    }

    const fest = state.festivalsById.get(camp.festivalId);
    const key = `${camp.festivalId}::${camp.applicableYear}`;
    const assignEval = evaluateCampaignEligibility({
      campaign: camp,
      festival: fest,
      yearRecord: state.yearDatesByKey.get(key),
      activeOverride: state.activeOverridesByKey.get(key),
      assignment: assign,
      nowMs
    });

    if (!assignEval.eligible) {
      return {
        allowed: false,
        status: 422,
        code: assignEval.code,
        message: assignEval.message,
        effectiveState: assignEval.effectiveState,
        campaignId: camp.id,
        windowStartDate: assignEval.window?.startDate || null,
        windowEndDate: assignEval.window?.endDate || null,
        firstBlockedDate: assignEval.window?.firstBlockedDate || null
      };
    }

    // Check variant restriction on assignment if configured
    if (Array.isArray(assign.allowedVariants) && assign.allowedVariants.length > 0 && (requestedRelationship || requestedVariantId)) {
      const normReq = requestedRelationship ? normalizeRelationshipIdentifier(requestedRelationship) : null;
      const reqSlug = normReq ? normReq.slug : String(requestedRelationship || '').toLowerCase().trim();
      const reqVarLower = String(requestedVariantId || '').toLowerCase().trim();
      const allowedSet = new Set(assign.allowedVariants.map(v => String(v).toLowerCase().trim()));
      const isAllowed = (reqSlug && allowedSet.has(reqSlug)) || (reqVarLower && allowedSet.has(reqVarLower));
      if (!isAllowed) {
        return {
          allowed: false,
          status: 422,
          code: 'VARIANT_NOT_ENABLED_FOR_CAMPAIGN',
          message: `The selected relationship variant ("${requestedRelationship || requestedVariantId}") is not enabled for the "${camp.title}" festival campaign.`,
          allowedVariants: assign.allowedVariants
        };
      }
    }

    return {
      allowed: true,
      isFestivalCampaignWish: true,
      campaignId: camp.id,
      campaign: camp,
      assignment: assign,
      effectiveFestivalDate: assignEval.dateResolution.effectiveDate,
      window: assignEval.window
    };
  }

  // Case 2: No campaignId passed, but template has festival campaign assignments
  if (tplAssignments.length > 0) {
    const evaluatedForTemplate = [];
    for (const assign of tplAssignments) {
      const camp = state.campaignsById.get(assign.campaign_id);
      if (!camp) continue;
      const fest = state.festivalsById.get(camp.festivalId);
      const key = `${camp.festivalId}::${camp.applicableYear}`;
      const evalRes = evaluateCampaignEligibility({
        campaign: camp,
        festival: fest,
        yearRecord: state.yearDatesByKey.get(key),
        activeOverride: state.activeOverridesByKey.get(key),
        assignment: assign,
        nowMs
      });
      evaluatedForTemplate.push({ camp, assign, evalRes });
    }

    const activeMatches = evaluatedForTemplate
      .filter(x => x.evalRes.eligible)
      .sort((a, b) => {
        const dA = a.evalRes.dateResolution.effectiveDate || '9999-99-99';
        const dB = b.evalRes.dateResolution.effectiveDate || '9999-99-99';
        if (dA !== dB) return dA.localeCompare(dB);
        if (a.camp.displayPriority !== b.camp.displayPriority) return a.camp.displayPriority - b.camp.displayPriority;
        return a.camp.id.localeCompare(b.camp.id);
      });

    if (activeMatches.length > 0) {
      // Check variant restriction on the winning active campaign assignment
      const primary = activeMatches[0];
      if (
        Array.isArray(primary.assign.allowedVariants) &&
        primary.assign.allowedVariants.length > 0 &&
        (requestedRelationship || requestedVariantId)
      ) {
        const normReq = requestedRelationship ? normalizeRelationshipIdentifier(requestedRelationship) : null;
        const reqSlug = normReq ? normReq.slug : String(requestedRelationship || '').toLowerCase().trim();
        const reqVarLower = String(requestedVariantId || '').toLowerCase().trim();
        // Check if ANY active campaign assignment for this template permits this variant
        const matchingActiveForVariant = activeMatches.find(m => {
          if (!Array.isArray(m.assign.allowedVariants) || m.assign.allowedVariants.length === 0) return true;
          const s = new Set(m.assign.allowedVariants.map(v => String(v).toLowerCase().trim()));
          return (reqSlug && s.has(reqSlug)) || (reqVarLower && s.has(reqVarLower));
        });
        if (!matchingActiveForVariant) {
          return {
            allowed: false,
            status: 422,
            code: 'VARIANT_NOT_ENABLED_FOR_CAMPAIGN',
            message: `The selected relationship variant ("${requestedRelationship || requestedVariantId}") is not enabled for active festival campaign "${primary.camp.title}".`,
            allowedVariants: primary.assign.allowedVariants
          };
        }
        return {
          allowed: true,
          isFestivalCampaignWish: true,
          campaignId: matchingActiveForVariant.camp.id,
          campaign: matchingActiveForVariant.camp,
          assignment: matchingActiveForVariant.assign,
          effectiveFestivalDate: matchingActiveForVariant.evalRes.dateResolution.effectiveDate,
          window: matchingActiveForVariant.evalRes.window
        };
      }

      return {
        allowed: true,
        isFestivalCampaignWish: true,
        campaignId: primary.camp.id,
        campaign: primary.camp,
        assignment: primary.assign,
        effectiveFestivalDate: primary.evalRes.dateResolution.effectiveDate,
        window: primary.evalRes.window
      };
    }

    // None of the assigned campaigns for this template are active!
    // Block wish creation so expired/paused/draft festival campaigns cannot be bypassed via direct templateId submission.
    const mostRelevant = evaluatedForTemplate[0];
    if (mostRelevant) {
      return {
        allowed: false,
        status: 422,
        code: mostRelevant.evalRes.code || 'FESTIVAL_CAMPAIGN_INACTIVE',
        message: mostRelevant.evalRes.message || 'The festival campaign for this template is no longer active.',
        effectiveState: mostRelevant.evalRes.effectiveState,
        campaignId: mostRelevant.camp.id,
        windowStartDate: mostRelevant.evalRes.window?.startDate || null,
        windowEndDate: mostRelevant.evalRes.window?.endDate || null,
        firstBlockedDate: mostRelevant.evalRes.window?.firstBlockedDate || null
      };
    }
  }

  // Case 3: Regular template with no festival campaign assignments
  return {
    allowed: true,
    isFestivalCampaignWish: false,
    campaignId: null,
    campaign: null
  };
}

/**
 * Enriches and filters the public template gallery list with authoritative Festival Scheduler state.
 *
 * Responsibilities:
 * - Attaches active festival campaign metadata (`festivalCampaign`, `activeFestivalCampaigns`, `isFestivalTemplate`)
 *   to templates assigned to currently active campaigns.
 * - Enforces campaign-level `allowedVariants` restrictions when filtering `availableVariants` and `availableRelations`.
 * - Deduplicates when a reusable template is assigned to multiple active festival campaigns (deterministic primary campaign).
 * - Hides templates whose assigned festival campaign(s) are all expired/paused/draft/upcoming so an expired
 *   campaign is NEVER advertised as available for new wish creation in the public gallery!
 */
export async function applyFestivalScheduleToPublicGallery(db, templates = [], options = {}) {
  if (!db || typeof db.prepare !== 'function' || !Array.isArray(templates)) {
    return { templates: templates || [], activeCampaigns: [] };
  }

  await ensureFestivalSchedulerSchema(db, { seedDefaults: false });
  const nowMs = options.nowMs !== undefined ? options.nowMs : Date.now();
  const requestedFestivalFilter = String(options.festivalSlug || options.festivalId || '').toLowerCase().trim();
  const requestedCampaignFilter = String(options.campaignId || options.campaignSlug || '').toLowerCase().trim();

  const state = await loadFestivalSchedulerState(db, { seedDefaults: false, nowMs });
  const activeCampaigns = state.campaigns.filter(c => c.eligible);

  const outputTemplates = [];
  const seenTemplateIds = new Set();

  for (const tpl of templates) {
    if (!tpl || !tpl.id) continue;
    if (seenTemplateIds.has(tpl.id)) continue; // Prevent duplicate cards

    const tplAssignments = state.assignmentsByTemplateId.get(tpl.id) || [];
    if (tplAssignments.length === 0) {
      // Not assigned to any festival campaign
      if (requestedFestivalFilter || requestedCampaignFilter) {
        continue;
      }
      seenTemplateIds.add(tpl.id);
      outputTemplates.push({
        ...tpl,
        isFestivalTemplate: String(tpl.category || '').toLowerCase() === 'festival',
        festivalCampaign: null,
        activeFestivalCampaigns: []
      });
      continue;
    }

    // Evaluate all assignments for this template
    const activeAssignsForTemplate = [];
    for (const assign of tplAssignments) {
      const camp = state.campaignsById.get(assign.campaign_id);
      if (!camp) continue;
      if (requestedFestivalFilter && camp.festivalId.toLowerCase() !== requestedFestivalFilter && camp.festivalSlug.toLowerCase() !== requestedFestivalFilter) {
        continue;
      }
      if (requestedCampaignFilter && camp.id.toLowerCase() !== requestedCampaignFilter && camp.slug.toLowerCase() !== requestedCampaignFilter) {
        continue;
      }
      const fest = state.festivalsById.get(camp.festivalId);
      const key = `${camp.festivalId}::${camp.applicableYear}`;
      const evalRes = evaluateCampaignEligibility({
        campaign: camp,
        festival: fest,
        yearRecord: state.yearDatesByKey.get(key),
        activeOverride: state.activeOverridesByKey.get(key),
        assignment: assign,
        nowMs
      });
      if (evalRes.eligible) {
        activeAssignsForTemplate.push({
          camp,
          assign,
          evalRes
        });
      }
    }

    // If this template is governed by festival campaign(s) and NONE are currently active,
    // hide it from active gallery discovery so expired/paused/upcoming campaigns are never shown as available!
    if (activeAssignsForTemplate.length === 0) {
      continue;
    }

    // Deterministic policy when a reusable template is assigned to multiple active festivals:
    // Sort by soonest effective festival date -> campaign displayPriority -> assignment displayOrder -> campaignId
    activeAssignsForTemplate.sort((a, b) => {
      const dA = a.evalRes.dateResolution.effectiveDate || '9999-99-99';
      const dB = b.evalRes.dateResolution.effectiveDate || '9999-99-99';
      if (dA !== dB) return dA.localeCompare(dB);
      if (a.camp.displayPriority !== b.camp.displayPriority) return a.camp.displayPriority - b.camp.displayPriority;
      if (Number(a.assign.display_order) !== Number(b.assign.display_order)) {
        return Number(a.assign.display_order) - Number(b.assign.display_order);
      }
      return a.camp.id.localeCompare(b.camp.id);
    });

    const primary = activeAssignsForTemplate[0];
    let filteredAvailableVariants = Array.isArray(tpl.availableVariants) ? [...tpl.availableVariants] : [];
    let filteredAvailableRelations = Array.isArray(tpl.availableRelations) ? [...tpl.availableRelations] : [];

    if (Array.isArray(primary.assign.allowedVariants) && primary.assign.allowedVariants.length > 0) {
      const allowedSet = new Set(primary.assign.allowedVariants.map(v => String(v).toLowerCase().trim()));
      filteredAvailableVariants = filteredAvailableVariants.filter(av => {
        const idL = String(av.id || '').toLowerCase();
        const slugL = String(av.slug || '').toLowerCase();
        const relL = String(av.relationshipSlug || '').toLowerCase();
        return allowedSet.has(idL) || allowedSet.has(slugL) || allowedSet.has(relL);
      });
      filteredAvailableRelations = filteredAvailableRelations.filter(ar => {
        const idL = String(ar.variantId || ar.id || '').toLowerCase();
        const slugL = String(ar.slug || '').toLowerCase();
        return allowedSet.has(idL) || allowedSet.has(slugL);
      });
    }

    const campaignSummaries = activeAssignsForTemplate.map(x => ({
      campaignId: x.camp.id,
      campaignSlug: x.camp.slug,
      festivalId: x.camp.festivalId,
      festivalSlug: x.camp.festivalSlug,
      festivalName: x.camp.festivalName,
      applicableYear: x.camp.applicableYear,
      title: x.camp.title,
      badgeLabel: x.assign.badge_override || x.camp.badgeLabel,
      effectiveFestivalDate: x.evalRes.dateResolution.effectiveDate,
      windowStartDate: x.evalRes.window.startDate,
      windowEndDate: x.evalRes.window.endDate,
      firstBlockedDate: x.evalRes.window.firstBlockedDate,
      timezone: x.evalRes.window.timezone,
      displayOrder: Number(x.assign.display_order || 1),
      allowedVariants: x.assign.allowedVariants
    }));

    seenTemplateIds.add(tpl.id);
    outputTemplates.push({
      ...tpl,
      availableVariants: filteredAvailableVariants,
      availableRelations: filteredAvailableRelations,
      relationships: tpl.hasVariants
        ? filteredAvailableRelations.map(r => r.label)
        : (tpl.relationships || []),
      isFestivalTemplate: true,
      festivalCampaign: campaignSummaries[0],
      activeFestivalCampaigns: campaignSummaries
    });
  }

  return {
    templates: outputTemplates,
    activeCampaigns
  };
}
