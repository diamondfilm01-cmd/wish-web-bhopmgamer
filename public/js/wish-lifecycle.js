// WishMagic Universal Wish Lifecycle Engine
// Part 7: Upcoming → Active → Expired Lifecycle State Machine
// Timezone: Asia/Kolkata (IST = UTC+05:30)

(function(window) {
  'use strict';

  // Constants
  const IST_OFFSET_MINUTES = 330; // +05:30
  const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

  /**
   * Calculates the exact UTC timestamps for the start of the special date
   * and the start of the next day in the Asia/Kolkata (IST) timezone.
   *
   * @param {string} dateStr - Date string formatted as 'YYYY-MM-DD' (or ISO string)
   * @returns {{ startMs: number, endMs: number, dateStr: string, istNowMs: number, istDateFormatted: string }}
   */
  function getSpecialDateBoundaries(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
      // Fallback to today if invalid or missing
      const now = new Date();
      dateStr = now.toISOString().split('T')[0];
    }

    // Extract YYYY-MM-DD
    const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.trim();
    const parts = cleanDate.split('-').map(Number);

    let year = parts[0];
    let month = parts[1]; // 1-12
    let day = parts[2];

    if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
      const now = new Date();
      year = now.getUTCFullYear();
      month = now.getUTCMonth() + 1;
      day = now.getUTCDate();
    }

    // 00:00:00.000 in Asia/Kolkata on special date = (UTC Date at 00:00:00) minus 5 hours 30 minutes
    const startMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - IST_OFFSET_MS;

    // Start of the next day (00:00:00.000 IST on specialDate + 1)
    // Date.UTC handles overflow of days/months automatically
    const endMs = Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0) - IST_OFFSET_MS;

    // Current time in IST reference
    const nowUtcMs = Date.now();
    const istNowMs = nowUtcMs + IST_OFFSET_MS;

    return {
      startMs,
      endMs,
      dateStr: cleanDate,
      istNowMs,
      istDateFormatted: formatISTDate(cleanDate)
    };
  }

  /**
   * Centralized Lifecycle Status Evaluator.
   * Evaluates if a wish is 'upcoming', 'active', 'expired', or 'draft'.
   *
   * @param {Object} wish - Wish object or CustomData object containing event_date / eventDate
   * @param {number|null} nowOverrideMs - Optional timestamp for testing/simulation
   * @param {boolean} isDraft - Whether wish is currently unpublished/draft
   * @returns {'upcoming' | 'active' | 'expired' | 'draft'}
   */
  function getWishStatus(wish, nowOverrideMs = null, isDraft = false) {
    if (!wish) return 'expired';
    if (isDraft || wish.status === 'draft' || wish.isDraft) return 'draft';

    // 1. Extract special date
    const customData = wish.customData || wish;
    const dateStr = wish.eventDate || customData.event_date || customData.eventDate || customData.target_date || customData.targetDate;

    if (!dateStr) {
      // Fallback: if no date is set on a published wish, check creation time or default to active
      return 'active';
    }

    const { startMs, endMs } = getSpecialDateBoundaries(dateStr);
    const nowMs = typeof nowOverrideMs === 'number' ? nowOverrideMs : Date.now();

    // Strict Asia/Kolkata boundary logic
    if (nowMs < startMs) {
      return 'upcoming';
    } else if (nowMs >= startMs && nowMs < endMs) {
      return 'active';
    } else {
      return 'expired';
    }
  }

  /**
   * Computes human-readable countdown numbers to target timestamp.
   *
   * @param {number} targetMs - Target epoch timestamp in milliseconds
   * @param {number|null} nowMs - Optional current timestamp
   * @returns {{ days: string, hours: string, minutes: string, seconds: string, isDone: boolean, totalMs: number }}
   */
  function getCountdownTo(targetMs, nowMs = null) {
    const current = typeof nowMs === 'number' ? nowMs : Date.now();
    const diff = targetMs - current;

    if (diff <= 0) {
      return {
        days: '00',
        hours: '00',
        minutes: '00',
        seconds: '00',
        isDone: true,
        totalMs: 0
      };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return {
      days: String(days).padStart(2, '0'),
      hours: String(hours).padStart(2, '0'),
      minutes: String(minutes).padStart(2, '0'),
      seconds: String(seconds).padStart(2, '0'),
      isDone: false,
      totalMs: diff
    };
  }

  /**
   * Formats a 'YYYY-MM-DD' calendar date into an elegant English string.
   * e.g. '2026-10-15' -> '15 October 2026'
   */
  function formatISTDate(dateStr) {
    if (!dateStr) return 'Special Day';
    try {
      const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.trim();
      const [y, m, d] = clean.split('-').map(Number);
      if (!y || !m || !d) return dateStr;

      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      return `${d} ${months[m - 1]} ${y}`;
    } catch (e) {
      return dateStr;
    }
  }

  /**
   * Sanitizes wish data according to lifecycle status to prevent premature
   * data leaking in public upcoming or expired states.
   *
   * @param {Object} wishData - Full customData object
   * @param {'upcoming'|'active'|'expired'|'draft'} status - Current lifecycle status
   * @param {boolean} isCreatorPreview - If creator preview is active, keeps full data
   * @returns {Object} Safe sanitized data object
   */
  function sanitizeWishDataForStatus(wishData, status, isCreatorPreview = false) {
    if (!wishData) return {};
    // Always preserve full customData (recipient_name, sender_name, custom_message, photos, music, theme, etc.)
    const safe = JSON.parse(JSON.stringify(wishData));
    safe.recipient_name = safe.recipient_name || safe.recipientName || 'Someone Special';
    safe.recipientName = safe.recipient_name;
    safe.sender_name = safe.sender_name || safe.senderName || 'A Cherished Friend';
    safe.senderName = safe.sender_name;
    safe.event_date = safe.event_date || safe.eventDate || new Date().toISOString().split('T')[0];
    safe.eventDate = safe.event_date;
    safe.lifecycleStatus = status;
    return safe;
  }

  // Export to global window namespace
  window.WishLifecycle = {
    IST_OFFSET_MINUTES,
    IST_OFFSET_MS,
    getSpecialDateBoundaries,
    getWishStatus,
    getCountdownTo,
    formatISTDate,
    sanitizeWishDataForStatus
  };

  // Node.js module export compatibility for server.js
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      IST_OFFSET_MINUTES,
      IST_OFFSET_MS,
      getSpecialDateBoundaries,
      getWishStatus,
      getCountdownTo,
      formatISTDate,
      sanitizeWishDataForStatus
    };
  }

})(typeof window !== 'undefined' ? window : global);
