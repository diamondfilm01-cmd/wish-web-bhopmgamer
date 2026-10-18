// Universal Real-Time Visitor & Analytics Tracker for WishMagic
(function() {
  // Generate or retrieve persistent browser session ID
  let sessionId = sessionStorage.getItem('wm_visitor_session');
  if (!sessionId) {
    sessionId = 'vis_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    sessionStorage.setItem('wm_visitor_session', sessionId);
  }

  function getCleanPageUrl() {
    return window.location.pathname + (window.location.search || '');
  }

  function sendHeartbeat() {
    try {
      const currentPage = getCleanPageUrl();
      // Only track public-facing website visitors (exclude admin management console)
      if (currentPage.includes('/admin/')) {
        return;
      }

      const payload = {
        sessionId: sessionId,
        page: currentPage,
        title: document.title || 'WishMagic Experience',
        referrer: document.referrer || ''
      };

      fetch('/api/analytics/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {});
    } catch (e) {}
  }

  // Ping immediately upon loading
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    sendHeartbeat();
  } else {
    document.addEventListener('DOMContentLoaded', sendHeartbeat);
  }

  // Ping every 10 seconds while visitor is browsing
  setInterval(sendHeartbeat, 10000);

  // When tab is closed or navigated away, inform server immediately
  function notifyLeave() {
    try {
      const data = JSON.stringify({ sessionId: sessionId });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/analytics/leave', data);
      } else {
        fetch('/api/analytics/leave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: data,
          keepalive: true
        }).catch(() => {});
      }
    } catch(e) {}
  }

  window.addEventListener('beforeunload', notifyLeave);
  window.addEventListener('pagehide', notifyLeave);

  // Re-ping when tab becomes visible or gains focus again
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      sendHeartbeat();
    }
  });

  window.addEventListener('focus', sendHeartbeat);
})();
