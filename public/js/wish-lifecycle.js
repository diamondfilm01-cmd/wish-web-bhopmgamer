(function(window2) {
  "use strict";
  const IST_OFFSET_MINUTES = 330;
  const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1e3;
  function getSpecialDateBoundaries(dateStr) {
    if (!dateStr || typeof dateStr !== "string") {
      const now = /* @__PURE__ */ new Date();
      dateStr = now.toISOString().split("T")[0];
    }
    const cleanDate = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr.trim();
    const parts = cleanDate.split("-").map(Number);
    let year = parts[0];
    let month = parts[1];
    let day = parts[2];
    if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
      const now = /* @__PURE__ */ new Date();
      year = now.getUTCFullYear();
      month = now.getUTCMonth() + 1;
      day = now.getUTCDate();
    }
    const startMs = Date.UTC(year, month - 1, day - 2, 0, 0, 0, 0) - IST_OFFSET_MS;
    const endMs = Date.UTC(year, month - 1, day + 3, 0, 0, 0, 0) - IST_OFFSET_MS;
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
  function getWishStatus(wish, nowOverrideMs = null, isDraft = false) {
    if (!wish) return "expired";
    if (isDraft || wish.status === "draft" || wish.isDraft) return "draft";
    const customData = wish.customData || wish;
    const dateStr = wish.eventDate || wish.event_date || wish.content && (wish.content.event_date || wish.content.eventDate) || customData.event_date || customData.eventDate || customData.target_date || customData.targetDate || customData.content && (customData.content.event_date || customData.content.eventDate);
    if (!dateStr) {
      return "active";
    }
    const { startMs, endMs } = getSpecialDateBoundaries(dateStr);
    const nowMs = typeof nowOverrideMs === "number" ? nowOverrideMs : Date.now();
    if (nowMs < startMs) {
      return "upcoming";
    } else if (nowMs >= startMs && nowMs < endMs) {
      return "active";
    } else {
      return "expired";
    }
  }
  function getCountdownTo(targetMs, nowMs = null) {
    const current = typeof nowMs === "number" ? nowMs : Date.now();
    const diff = targetMs - current;
    if (diff <= 0) {
      return {
        days: "00",
        hours: "00",
        minutes: "00",
        seconds: "00",
        isDone: true,
        totalMs: 0
      };
    }
    const days = Math.floor(diff / (1e3 * 60 * 60 * 24));
    const hours = Math.floor(diff % (1e3 * 60 * 60 * 24) / (1e3 * 60 * 60));
    const minutes = Math.floor(diff % (1e3 * 60 * 60) / (1e3 * 60));
    const seconds = Math.floor(diff % (1e3 * 60) / 1e3);
    return {
      days: String(days).padStart(2, "0"),
      hours: String(hours).padStart(2, "0"),
      minutes: String(minutes).padStart(2, "0"),
      seconds: String(seconds).padStart(2, "0"),
      isDone: false,
      totalMs: diff
    };
  }
  function formatISTDate(dateStr) {
    if (!dateStr) return "Special Day";
    try {
      const clean = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr.trim();
      const [y, m, d] = clean.split("-").map(Number);
      if (!y || !m || !d) return dateStr;
      const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
      ];
      return `${d} ${months[m - 1]} ${y}`;
    } catch (e) {
      return dateStr;
    }
  }
  function sanitizeWishDataForStatus(wishData, status, isCreatorPreview = false) {
    if (!wishData) return {};
    const safe = JSON.parse(JSON.stringify(wishData));
    safe.recipient_name = safe.recipient_name || safe.recipientName || "Someone Special";
    safe.recipientName = safe.recipient_name;
    safe.sender_name = safe.sender_name || safe.senderName || "A Cherished Friend";
    safe.senderName = safe.sender_name;
    safe.event_date = safe.event_date || safe.eventDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    safe.eventDate = safe.event_date;
    safe.lifecycleStatus = status;
    return safe;
  }
  window2.WishLifecycle = {
    IST_OFFSET_MINUTES,
    IST_OFFSET_MS,
    getSpecialDateBoundaries,
    getWishStatus,
    getCountdownTo,
    formatISTDate,
    sanitizeWishDataForStatus
  };
  if (typeof module !== "undefined" && module.exports) {
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
})(typeof window !== "undefined" ? window : global);
