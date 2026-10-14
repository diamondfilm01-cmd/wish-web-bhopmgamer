/**
 * WishMagic Centralized Analytics & Event Intelligence Service
 * Part 16: Event Tracking Abstraction, Time Series Aggregation, Real Metrics & CSV Export
 */

(function(window) {
  'use strict';

  const STORAGE_KEY_EVENTS = 'wishmagic_analytics_events';
  const MAX_LOCAL_EVENTS = 2000;

  /**
   * Helper: Read stored events list safely
   */
  function getStoredEvents() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_EVENTS);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[AnalyticsService] Error reading stored events:', e);
      return [];
    }
  }

  function setStoredEvents(events) {
    try {
      const trimmed = events.slice(0, MAX_LOCAL_EVENTS);
      localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('[AnalyticsService] Error writing stored events:', e);
    }
  }

  const WishAnalyticsService = {
    _subscribers: new Set(),

    /**
     * Track a platform event
     * @param {string} eventName - e.g. 'wish_created', 'template_viewed', 'wish_shared'
     * @param {Object} payload - { wishId, templateId, category, userId, metadata }
     */
    trackEvent(eventName, payload = {}) {
      if (!eventName) return null;

      const currentUserId = payload.userId || 
        (window.WishAuth && window.WishAuth.getCurrentUser()?.id) || 
        'guest';

      // Safe metadata filter (zero PII, zero private message text or audio blobs)
      const safeMetadata = {};
      if (payload.metadata && typeof payload.metadata === 'object') {
        ['planId', 'productId', 'price', 'currency', 'step', 'referrer', 'deviceType', 'browser', 'source'].forEach(k => {
          if (payload.metadata[k] !== undefined) safeMetadata[k] = payload.metadata[k];
        });
      }

      const event = {
        id: 'evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
        eventName: String(eventName).trim(),
        timestamp: new Date().toISOString(),
        userId: currentUserId,
        sessionId: payload.sessionId || null,
        wishId: payload.wishId || null,
        slug: payload.slug || null,
        templateId: payload.templateId || null,
        templateName: payload.templateName || null,
        templateFamilyId: payload.templateFamilyId || null,
        category: payload.category || null,
        recipientName: payload.recipientName || null,
        orderId: payload.orderId || null,
        source: payload.source || 'direct',
        metadata: safeMetadata
      };

      // 1. Save to local storage
      const events = getStoredEvents();
      events.unshift(event);
      setStoredEvents(events);

      // 2. Asynchronously sync to server endpoint if online
      try {
        fetch('/api/analytics/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
          keepalive: true
        }).catch(() => {});
      } catch (e) {}

      // 3. Notify local subscribers
      this._subscribers.forEach(fn => {
        try { fn(event); } catch (err) {}
      });

      return event;
    },

    /**
     * Subscribe to real-time events
     */
    onEvent(callback) {
      if (typeof callback === 'function') {
        this._subscribers.add(callback);
        return () => this._subscribers.delete(callback);
      }
      return () => {};
    },

    /**
     * Get filtered events list
     * @param {Object} filter - { startDate, endDate, eventName, userId, templateId, category, limit }
     */
    async getEvents(filter = {}) {
      let all = [];

      // Try server endpoint first for persistent cross-client events
      try {
        const queryParams = new URLSearchParams();
        if (filter.startDate) queryParams.set('startDate', filter.startDate);
        if (filter.endDate) queryParams.set('endDate', filter.endDate);
        if (filter.eventName) queryParams.set('eventName', filter.eventName);
        if (filter.templateId) queryParams.set('templateId', filter.templateId);

        const res = await fetch(`/api/analytics/events?${queryParams.toString()}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.events)) {
          all = data.events;
        }
      } catch (e) {
        all = getStoredEvents();
      }

      if (all.length === 0) {
        all = getStoredEvents();
      }

      // Merge local storage events to ensure instant zero-latency view
      const localEvents = getStoredEvents();
      const mergedMap = new Map();
      all.forEach(e => mergedMap.set(e.id, e));
      localEvents.forEach(e => {
        if (!mergedMap.has(e.id)) mergedMap.set(e.id, e);
      });

      let list = Array.from(mergedMap.values());

      // Filter by Date
      if (filter.startDate) {
        const startMs = new Date(filter.startDate).getTime();
        list = list.filter(e => new Date(e.timestamp).getTime() >= startMs);
      }
      if (filter.endDate) {
        const endMs = new Date(filter.endDate).getTime();
        list = list.filter(e => new Date(e.timestamp).getTime() <= endMs);
      }

      // Filter by Event Name
      if (filter.eventName && filter.eventName !== 'all') {
        list = list.filter(e => e.eventName === filter.eventName);
      }

      // Filter by User
      if (filter.userId && filter.userId !== 'all') {
        list = list.filter(e => e.userId === filter.userId);
      }

      // Filter by Template
      if (filter.templateId && filter.templateId !== 'all') {
        list = list.filter(e => e.templateId === filter.templateId);
      }

      // Filter by Category
      if (filter.category && filter.category !== 'all') {
        list = list.filter(e => (e.category || '').toLowerCase() === filter.category.toLowerCase());
      }

      // Sort newest first
      list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      if (filter.limit && Number(filter.limit) > 0) {
        return list.slice(0, Number(filter.limit));
      }

      return list;
    },

    /**
     * Get aggregate event counts
     */
    async getEventCounts(filter = {}) {
      const events = await this.getEvents(filter);
      const counts = {};
      events.forEach(e => {
        counts[e.eventName] = (counts[e.eventName] || 0) + 1;
      });
      return counts;
    },

    /**
     * Calculate Time Series data points for charts
     * @param {string} dateRangeKey - 'today' | '7d' | '30d' | '90d' | 'year' | 'all'
     * @param {Array} wishes - List of wishes to aggregate
     * @param {Array} events - List of events to aggregate
     */
    getTimeSeriesData(dateRangeKey = '30d', wishes = [], events = []) {
      const now = new Date();
      let days = 30;

      if (dateRangeKey === 'today') days = 1;
      else if (dateRangeKey === '7d') days = 7;
      else if (dateRangeKey === '30d') days = 30;
      else if (dateRangeKey === '90d') days = 90;
      else if (dateRangeKey === 'year') days = 365;
      else if (dateRangeKey === 'all') days = 365;

      const buckets = [];
      const bucketMap = new Map();

      // Generate date labels
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
        const key = d.toISOString().split('T')[0];
        const label = days <= 7 
          ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        const bucket = { dateKey: key, label, wishesCreated: 0, eventsTotal: 0, shares: 0, views: 0 };
        buckets.push(bucket);
        bucketMap.set(key, bucket);
      }

      // Aggregate wishes creations by date
      wishes.forEach(w => {
        if (w.createdAt) {
          const dateKey = w.createdAt.split('T')[0];
          const bucket = bucketMap.get(dateKey);
          if (bucket) {
            bucket.wishesCreated++;
            bucket.views += (w.views || 0);
          }
        }
      });

      // Aggregate events by date
      events.forEach(e => {
        if (e.timestamp) {
          const dateKey = e.timestamp.split('T')[0];
          const bucket = bucketMap.get(dateKey);
          if (bucket) {
            bucket.eventsTotal++;
            if (e.eventName === 'wish_shared' || e.eventName === 'share_link_copied') {
              bucket.shares++;
            }
          }
        }
      });

      return buckets;
    },

    /**
     * Clear development-only analytics events
     */
    async clearDevelopmentAnalytics() {
      try {
        localStorage.removeItem(STORAGE_KEY_EVENTS);
        await fetch('/api/analytics/events/reset', { method: 'POST' });
        return true;
      } catch (e) {
        console.warn('Error resetting analytics:', e);
        return false;
      }
    },

    /**
     * Export data to clean, privacy-conscious CSV format
     * @param {string} type - 'wishes' | 'templates' | 'users' | 'events'
     * @param {Array} data - Items to export
     */
    exportToCSV(type = 'wishes', data = []) {
      if (!Array.isArray(data) || data.length === 0) {
        alert('No data available to export.');
        return;
      }

      let headers = [];
      let rows = [];

      if (type === 'wishes') {
        headers = ['Wish ID', 'Public Slug', 'Recipient', 'Sender', 'Template Name', 'Event Date', 'Lifecycle Status', 'Plan/Tier', 'Views', 'Created At'];
        rows = data.map(w => [
          w.id || '',
          w.slug || '',
          (w.recipientName || w.customData?.recipient_name || '').replace(/"/g, '""'),
          (w.buyerName || w.customData?.sender_name || '').replace(/"/g, '""'),
          (w.templateName || '').replace(/"/g, '""'),
          w.eventDate || '',
          w.lifecycleStatus || w.status || 'active',
          w.tier || 'free',
          w.views || 0,
          w.createdAt || ''
        ]);
      } else if (type === 'templates') {
        headers = ['Template ID', 'Title', 'Slug', 'Category', 'Tier', 'Price (INR)', 'Status', 'Wishes Created', 'Favorites', 'Featured', 'Created At'];
        rows = data.map(t => [
          t.id || '',
          (t.name || '').replace(/"/g, '""'),
          t.slug || '',
          (t.category || '').replace(/"/g, '""'),
          t.tier || 'free',
          t.price || 0,
          t.status || 'published',
          t.wishesCount || 0,
          t.favoritesCount || 0,
          t.featured ? 'Yes' : 'No',
          t.createdAt || ''
        ]);
      } else if (type === 'users') {
        headers = ['User ID', 'Name', 'Email', 'Role', 'Plan', 'Wishes Created', 'Favorites Count', 'Joined At'];
        rows = data.map(u => [
          u.id || '',
          (u.displayName || u.name || '').replace(/"/g, '""'),
          (u.email || '').replace(/"/g, '""'),
          u.role || 'creator',
          u.plan || (u.isPremium ? 'VIP' : 'Free'),
          u.wishesCount || 0,
          u.favoritesCount || 0,
          u.createdAt || ''
        ]);
      } else if (type === 'events') {
        headers = ['Event ID', 'Event Name', 'Timestamp', 'User ID', 'Wish ID', 'Template ID', 'Category'];
        rows = data.map(e => [
          e.id || '',
          e.eventName || '',
          e.timestamp || '',
          e.userId || '',
          e.wishId || '',
          e.templateId || '',
          (e.category || '').replace(/"/g, '""')
        ]);
      }

      // Build CSV String
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(val => `"${String(val !== undefined && val !== null ? val : '')}"`).join(','))
      ].join('\n');

      // Trigger Download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `WishMagic-${type}-export-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  // Expose to window
  window.WishAnalyticsService = WishAnalyticsService;
  window.analyticsService = WishAnalyticsService;

})(typeof window !== 'undefined' ? window : this);
