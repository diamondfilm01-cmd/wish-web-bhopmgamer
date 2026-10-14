/**
 * WishMagic Centralized Notification & Communication Architecture
 * Part 17: In-App Notification Center, Toast Feedback System, Email/WhatsApp Provider Abstractions,
 * Draft & Lifecycle Expiry Reminders, User Notification Preferences, and Admin Announcements
 */

(function(window) {
  'use strict';

  const STORAGE_KEY_NOTIFICATIONS = 'wishmagic_notifications';
  const STORAGE_KEY_PREFERENCES_PREFIX = 'wishmagic_notification_prefs_';
  const STORAGE_KEY_ANNOUNCEMENTS = 'wishmagic_system_announcements';

  // Default User Preferences Model
  const DEFAULT_NOTIFICATION_PREFERENCES = {
    inApp: true,
    email: true,
    whatsapp: false,
    marketing: false,
    wishReminders: true,
    draftReminders: true,
    expiryReminders: true,
    productUpdates: true
  };

  // Notification Type Constants
  const NOTIFICATION_TYPES = {
    WISH_CREATED: 'WISH_CREATED',
    WISH_UPDATED: 'WISH_UPDATED',
    WISH_PUBLISHED: 'WISH_PUBLISHED',
    WISH_EXPIRING: 'WISH_EXPIRING',
    WISH_EXPIRED: 'WISH_EXPIRED',
    WISH_SHARED: 'WISH_SHARED',
    DRAFT_REMINDER: 'DRAFT_REMINDER',
    PREMIUM_FEATURE_LOCKED: 'PREMIUM_FEATURE_LOCKED',
    PREMIUM_UPGRADE: 'PREMIUM_UPGRADE',
    TEMPLATE_PUBLISHED: 'TEMPLATE_PUBLISHED',
    TEMPLATE_UPDATED: 'TEMPLATE_UPDATED',
    SYSTEM_NOTICE: 'SYSTEM_NOTICE',
    ADMIN_ALERT: 'ADMIN_ALERT'
  };

  // Notification Message Templates (Variable Interpolation)
  const notificationTemplates = {
    [NOTIFICATION_TYPES.WISH_CREATED]: (vars) => ({
      title: 'Wish Created ✨',
      message: `Your wish for ${vars.recipientName || 'someone special'} has been saved.`,
      icon: 'celebration',
      severity: 'success',
      actionUrl: vars.actionUrl || `/my-wishes`
    }),
    [NOTIFICATION_TYPES.WISH_PUBLISHED]: (vars) => ({
      title: 'Wish Published Live 🚀',
      message: `Your celebration for ${vars.recipientName || 'someone special'} is live! Public link is ready to share.`,
      icon: 'public',
      severity: 'success',
      actionUrl: vars.actionUrl || `/w/${vars.slug || vars.wishId}`
    }),
    [NOTIFICATION_TYPES.WISH_EXPIRING]: (vars) => ({
      title: 'Wish Expiring Soon ⏳',
      message: `Celebration for ${vars.recipientName || 'your friend'} enters grace period soon (${vars.daysLeft || 2} days remaining).`,
      icon: 'hourglass_bottom',
      severity: 'warning',
      actionUrl: vars.actionUrl || `/my-wishes`
    }),
    [NOTIFICATION_TYPES.WISH_EXPIRED]: (vars) => ({
      title: 'Celebration Expired 📅',
      message: `The 7-day celebration period for ${vars.recipientName || 'your friend'} has concluded.`,
      icon: 'event_busy',
      severity: 'info',
      actionUrl: vars.actionUrl || `/my-wishes`
    }),
    [NOTIFICATION_TYPES.WISH_SHARED]: (vars) => ({
      title: 'Wish Link Shared 💌',
      message: `You shared ${vars.recipientName ? `${vars.recipientName}'s wish` : 'your wish'} via ${vars.channel || 'social link'}.`,
      icon: 'share',
      severity: 'info',
      actionUrl: vars.actionUrl || `/my-wishes`
    }),
    [NOTIFICATION_TYPES.DRAFT_REMINDER]: (vars) => ({
      title: 'Unfinished Celebration Draft 📝',
      message: `You have an unfinished wish draft for ${vars.recipientName || 'a loved one'}. Complete it before the special date!`,
      icon: 'edit_note',
      severity: 'warning',
      actionUrl: vars.actionUrl || (vars.draftId ? `/customize?draft=${vars.draftId}` : `/my-wishes?tab=drafts`)
    }),
    [NOTIFICATION_TYPES.PREMIUM_FEATURE_LOCKED]: (vars) => ({
      title: 'VIP Feature Access 👑',
      message: `Unlock VIP themes, remove watermarks, and upload custom music with WishMagic VIP Pass.`,
      icon: 'lock_open',
      severity: 'warning',
      actionUrl: '/premium'
    }),
    [NOTIFICATION_TYPES.PREMIUM_UPGRADE]: (vars) => ({
      title: 'VIP Pass Activated! 🎉',
      message: `Welcome to VIP Creator! All premium 3D templates and unlisted sharing features are now unlocked.`,
      icon: 'workspace_premium',
      severity: 'success',
      actionUrl: '/account'
    }),
    [NOTIFICATION_TYPES.TEMPLATE_PUBLISHED]: (vars) => ({
      title: 'New Template Released 🎨',
      message: `Explore the new "${vars.templateName || 'Celebration'}" theme now in Marketplace.`,
      icon: 'style',
      severity: 'info',
      actionUrl: vars.actionUrl || (vars.templateId ? `/template/${vars.templateId}` : `/marketplace.html`)
    }),
    [NOTIFICATION_TYPES.SYSTEM_NOTICE]: (vars) => ({
      title: vars.title || 'System Announcement 📢',
      message: vars.message || 'Important update regarding WishMagic platform features.',
      icon: 'campaign',
      severity: vars.severity || 'info',
      actionUrl: vars.actionUrl || null
    }),
    [NOTIFICATION_TYPES.ADMIN_ALERT]: (vars) => ({
      title: vars.title || 'Admin Alert 🛡️',
      message: vars.message || 'System administrative update.',
      icon: 'shield',
      severity: vars.severity || 'warning',
      actionUrl: vars.actionUrl || '/admin/overview'
    })
  };

  /**
   * Helper: Get stored notifications array safely
   */
  function getStoredNotifications() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_NOTIFICATIONS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
      return [];
    } catch (e) {
      console.warn('[NotificationService] Error reading stored notifications:', e);
      return [];
    }
  }

  function setStoredNotifications(list) {
    try {
      const trimmed = (list || []).slice(0, 500);
      localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('[NotificationService] Error writing stored notifications:', e);
    }
  }

  function getCurrentUserId() {
    if (window.WishAuth && typeof window.WishAuth.getCurrentUser === 'function') {
      const u = window.WishAuth.getCurrentUser();
      if (u && u.id) return u.id;
    }
    return 'guest';
  }

  // ---------------------------------------------------------------------------
  // 1. NOTIFICATION REPOSITORY (User-Scoped Isolation)
  // ---------------------------------------------------------------------------
  const notificationRepository = {
    /**
     * Get user-scoped notifications list
     */
    async getByUser(userId, filter = {}) {
      const targetUserId = userId || getCurrentUserId();
      let all = getStoredNotifications();

      // Try syncing from server endpoint for cross-tab / server persistence
      try {
        const query = new URLSearchParams();
        if (targetUserId) query.set('userId', targetUserId);
        if (filter.type) query.set('type', filter.type);
        if (filter.unreadOnly) query.set('unreadOnly', 'true');

        const res = await fetch(`/api/notifications?${query.toString()}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.notifications)) {
          // Merge local and remote
          const remoteMap = new Map(data.notifications.map(n => [n.id, n]));
          all.forEach(n => {
            if (!remoteMap.has(n.id) && (n.userId === targetUserId || n.userId === 'all')) {
              remoteMap.set(n.id, n);
            }
          });
          all = Array.from(remoteMap.values());
        }
      } catch (e) {
        // Fallback to local
      }

      // Filter strictly by target user isolation
      let userList = all.filter(n => n.userId === targetUserId || n.userId === 'all');

      if (filter.unreadOnly) {
        userList = userList.filter(n => !n.readAt);
      }

      if (filter.type && filter.type !== 'all') {
        userList = userList.filter(n => n.type === filter.type);
      }

      // Sort newest first
      userList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return userList;
    },

    async add(notification) {
      const item = {
        id: notification.id || ('ntf_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5)),
        userId: notification.userId || getCurrentUserId(),
        type: notification.type || NOTIFICATION_TYPES.SYSTEM_NOTICE,
        title: notification.title || 'Notification',
        message: notification.message || '',
        createdAt: notification.createdAt || new Date().toISOString(),
        readAt: notification.readAt || null,
        relatedType: notification.relatedType || null, // 'wish' | 'draft' | 'template' | 'order'
        relatedId: notification.relatedId || null,
        actionUrl: notification.actionUrl || null,
        icon: notification.icon || 'notifications',
        severity: notification.severity || 'info', // 'info' | 'success' | 'warning' | 'error'
        isGrouped: Boolean(notification.isGrouped),
        groupCount: Number(notification.groupCount) || 1,
        metadata: notification.metadata || {}
      };

      // 1. Save to local storage
      const all = getStoredNotifications();
      all.unshift(item);
      setStoredNotifications(all);

      // 2. Sync to server API asynchronously
      try {
        fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
          keepalive: true
        }).catch(() => {});
      } catch (e) {}

      // 3. Track in analytics
      if (window.WishAnalyticsService && typeof window.WishAnalyticsService.trackEvent === 'function') {
        window.WishAnalyticsService.trackEvent('notification_created', {
          userId: item.userId,
          notificationId: item.id,
          notificationType: item.type
        });
      }

      return item;
    },

    async markAsRead(notificationId, userId) {
      const targetUserId = userId || getCurrentUserId();
      const all = getStoredNotifications();
      let found = null;

      all.forEach(n => {
        if (n.id === notificationId && (n.userId === targetUserId || n.userId === 'all')) {
          n.readAt = new Date().toISOString();
          found = n;
        }
      });

      setStoredNotifications(all);

      try {
        fetch(`/api/notifications/${notificationId}/read`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: targetUserId })
        }).catch(() => {});
      } catch (e) {}

      if (window.WishAnalyticsService) {
        window.WishAnalyticsService.trackEvent('notification_marked_read', {
          userId: targetUserId,
          notificationId
        });
      }

      return found;
    },

    async markAllAsRead(userId) {
      const targetUserId = userId || getCurrentUserId();
      const all = getStoredNotifications();
      const now = new Date().toISOString();

      all.forEach(n => {
        if ((n.userId === targetUserId || n.userId === 'all') && !n.readAt) {
          n.readAt = now;
        }
      });

      setStoredNotifications(all);

      try {
        fetch('/api/notifications/mark-all-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: targetUserId })
        }).catch(() => {});
      } catch (e) {}

      return true;
    },

    async delete(notificationId, userId) {
      const targetUserId = userId || getCurrentUserId();
      let all = getStoredNotifications();
      all = all.filter(n => !(n.id === notificationId && (n.userId === targetUserId || n.userId === 'all')));
      setStoredNotifications(all);

      try {
        fetch(`/api/notifications/${notificationId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: targetUserId })
        }).catch(() => {});
      } catch (e) {}

      if (window.WishAnalyticsService) {
        window.WishAnalyticsService.trackEvent('notification_deleted', {
          userId: targetUserId,
          notificationId
        });
      }

      return true;
    },

    async clear(userId) {
      const targetUserId = userId || getCurrentUserId();
      let all = getStoredNotifications();
      all = all.filter(n => n.userId !== targetUserId && n.userId !== 'all');
      setStoredNotifications(all);

      try {
        fetch(`/api/notifications?userId=${encodeURIComponent(targetUserId)}`, {
          method: 'DELETE'
        }).catch(() => {});
      } catch (e) {}

      return true;
    }
  };

  // ---------------------------------------------------------------------------
  // 2. NOTIFICATION PREFERENCES REPOSITORY
  // ---------------------------------------------------------------------------
  const notificationPreferencesRepository = {
    get(userId) {
      const targetUserId = userId || getCurrentUserId();
      try {
        const raw = localStorage.getItem(STORAGE_KEY_PREFERENCES_PREFIX + targetUserId);
        if (raw) {
          return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...JSON.parse(raw) };
        }
      } catch (e) {}
      return { ...DEFAULT_NOTIFICATION_PREFERENCES };
    },

    save(userId, prefs) {
      const targetUserId = userId || getCurrentUserId();
      const merged = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(prefs || {}) };
      try {
        localStorage.setItem(STORAGE_KEY_PREFERENCES_PREFIX + targetUserId, JSON.stringify(merged));
        fetch('/api/notifications/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: targetUserId, preferences: merged })
        }).catch(() => {});

        if (window.WishAnalyticsService) {
          window.WishAnalyticsService.trackEvent('notification_preference_changed', {
            userId: targetUserId
          });
        }
      } catch (e) {}
      return merged;
    }
  };

  // ---------------------------------------------------------------------------
  // 3. SAFE DEVELOPMENT PROVIDER ABSTRACTIONS (No Fake Deliveries)
  // ---------------------------------------------------------------------------
  const DevEmailProvider = {
    name: 'DevEmailProvider',
    isAvailable() {
      // Explicitly false for development environment until Part 20 cloud backend
      return false;
    },
    async send(payload = {}) {
      console.log('[DevEmailProvider] Email dispatch simulation:', {
        to: payload.to,
        subject: payload.subject,
        templateId: payload.templateId,
        variables: payload.variables,
        timestamp: new Date().toISOString()
      });

      return {
        status: 'not_configured',
        provider: 'dev_mock',
        delivered: false,
        message: 'Email delivery provider is not configured in local environment. Cloud email adapter will connect in Part 20.'
      };
    }
  };

  const DevWhatsAppProvider = {
    name: 'DevWhatsAppProvider',
    isAvailable() {
      // Explicitly false for backend automated sending
      return false;
    },
    async send(payload = {}) {
      console.log('[DevWhatsAppProvider] WhatsApp dispatch simulation:', {
        recipient: payload.recipient,
        message: payload.message,
        timestamp: new Date().toISOString()
      });

      return {
        status: 'not_configured',
        provider: 'dev_mock',
        delivered: false,
        message: 'WhatsApp Business API is not configured in local development. User-initiated client sharing is available via Web Share & direct link.'
      };
    },
    generateShareMessage(wishData, publicUrl) {
      const recipient = wishData.recipientName || wishData.customData?.recipient_name || 'you';
      return `🎉 Special celebration wish created for ${recipient}!\n✨ View full experience here: ${publicUrl}`;
    }
  };

  // ---------------------------------------------------------------------------
  // 4. COMMUNICATION SERVICE (Unified Dispatch Router)
  // ---------------------------------------------------------------------------
  const WishCommunicationService = {
    emailProvider: DevEmailProvider,
    whatsappProvider: DevWhatsAppProvider,

    /**
     * Send communication across designated channel
     * @param {Object} options - { channel: 'inApp'|'email'|'whatsapp', recipient, type, payload }
     */
    async send(options = {}) {
      const channel = options.channel || 'inApp';
      const type = options.type || NOTIFICATION_TYPES.SYSTEM_NOTICE;
      const payload = options.payload || {};

      // Check User Preferences
      const userId = options.userId || getCurrentUserId();
      const prefs = notificationPreferencesRepository.get(userId);

      if (channel === 'inApp') {
        if (!prefs.inApp) return { status: 'skipped_by_preference' };

        // Build template content
        const templateFn = notificationTemplates[type] || notificationTemplates[NOTIFICATION_TYPES.SYSTEM_NOTICE];
        const templateData = templateFn(payload);

        return await notificationRepository.add({
          userId,
          type,
          title: payload.title || templateData.title,
          message: payload.message || templateData.message,
          icon: payload.icon || templateData.icon,
          severity: payload.severity || templateData.severity,
          actionUrl: payload.actionUrl || templateData.actionUrl,
          relatedType: payload.relatedType || null,
          relatedId: payload.relatedId || null,
          metadata: payload
        });
      }

      if (channel === 'email') {
        if (!prefs.email) return { status: 'skipped_by_preference' };
        return await this.emailProvider.send({
          to: options.recipient || 'creator@example.com',
          subject: payload.title || 'WishMagic Notification',
          templateId: type,
          variables: payload
        });
      }

      if (channel === 'whatsapp') {
        if (!prefs.whatsapp) return { status: 'skipped_by_preference' };
        return await this.whatsappProvider.send({
          recipient: options.recipient,
          message: payload.message
        });
      }

      return { status: 'unknown_channel' };
    }
  };

  // ---------------------------------------------------------------------------
  // 5. REMINDER ELIGIBILITY ENGINE (Drafts, Upcoming & Expiry Reminders)
  // ---------------------------------------------------------------------------
  const WishReminderEngine = {
    /**
     * Identify unfinished creator drafts eligible for reminders
     */
    async getEligibleDraftReminders(userId) {
      const targetUserId = userId || getCurrentUserId();
      if (!window.WishRepositories || !window.WishRepositories.draftRepository) return [];

      const drafts = window.WishRepositories.draftRepository.getByUser(targetUserId);
      const eligible = [];
      const now = Date.now();

      drafts.forEach(draft => {
        const lastUpdated = new Date(draft.updatedAt || draft.createdAt || 0).getTime();
        const ageHours = (now - lastUpdated) / (1000 * 60 * 60);

        // Eligible if draft is older than 2 hours and has recipient name
        const recipientName = draft.customData?.recipient_name || draft.recipientName;
        if (recipientName && ageHours >= 2) {
          eligible.push({
            draftId: draft.id,
            recipientName,
            templateId: draft.templateId,
            ageHours: Math.round(ageHours),
            targetDate: draft.customData?.event_date || draft.targetDate || null
          });
        }
      });

      return eligible;
    },

    /**
     * Identify published wishes with upcoming special dates (tomorrow or today)
     * Uses centralized WishLifecycle and Asia/Kolkata rules
     */
    async getUpcomingWishReminders(userId) {
      const targetUserId = userId || getCurrentUserId();
      if (!window.WishRepositories || !window.WishRepositories.wishRepository) return [];

      const wishes = await window.WishRepositories.wishRepository.getByUser(targetUserId);
      const eligible = [];

      wishes.forEach(wish => {
        const eventDate = wish.eventDate || wish.customData?.event_date || wish.customData?.target_date;
        if (!eventDate) return;

        // Use centralized lifecycle status if available
        let status = 'upcoming';
        if (window.WishLifecycle && typeof window.WishLifecycle.getWishStatus === 'function') {
          status = window.WishLifecycle.getWishStatus(wish);
        }

        if (status === 'upcoming' || status === 'active') {
          const eventTime = new Date(eventDate).getTime();
          const now = Date.now();
          const diffDays = Math.ceil((eventTime - now) / (1000 * 60 * 60 * 24));

          if (diffDays >= 0 && diffDays <= 2) {
            eligible.push({
              wishId: wish.id,
              slug: wish.slug,
              recipientName: wish.recipientName || wish.customData?.recipient_name || 'Loved One',
              eventDate,
              daysRemaining: diffDays,
              status
            });
          }
        }
      });

      return eligible;
    },

    /**
     * Identify published wishes in the 7-day grace period or expiring
     */
    async getExpiringWishReminders(userId) {
      const targetUserId = userId || getCurrentUserId();
      if (!window.WishRepositories || !window.WishRepositories.wishRepository) return [];

      const wishes = await window.WishRepositories.wishRepository.getByUser(targetUserId);
      const eligible = [];

      wishes.forEach(wish => {
        let status = 'active';
        if (window.WishLifecycle && typeof window.WishLifecycle.getWishStatus === 'function') {
          status = window.WishLifecycle.getWishStatus(wish);
        }

        if (status === 'grace_period' || status === 'expired') {
          eligible.push({
            wishId: wish.id,
            slug: wish.slug,
            recipientName: wish.recipientName || wish.customData?.recipient_name || 'Friend',
            status
          });
        }
      });

      return eligible;
    }
  };

  // ---------------------------------------------------------------------------
  // 6. TRANSIENT UI TOAST SYSTEM (Floating, Auto-Dismissing, Accessible)
  // ---------------------------------------------------------------------------
  const WishToast = {
    _container: null,

    _getContainer() {
      if (!this._container || !document.body.contains(this._container)) {
        this._container = document.createElement('div');
        this._container.id = 'wishmagic-toast-region';
        this._container.setAttribute('role', 'region');
        this._container.setAttribute('aria-label', 'Notifications');
        this._container.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0';
        document.body.appendChild(this._container);
      }
      return this._container;
    },

    /**
     * Show lightweight transient toast
     * @param {Object} options - { title, message, type: 'success'|'info'|'warning'|'error', duration: 3500 }
     */
    show(options = {}) {
      if (typeof options === 'string') {
        options = { message: options };
      }

      const container = this._getContainer();
      const type = options.type || 'info';
      const title = options.title || '';
      const message = options.message || '';
      const duration = options.duration || 3500;

      let icon = 'info';
      let borderClass = 'border-purple-300 dark:border-purple-700';
      let iconColor = 'text-primary';

      if (type === 'success') {
        icon = 'check_circle';
        borderClass = 'border-emerald-500/40 bg-emerald-950/90 text-emerald-100';
        iconColor = 'text-emerald-400';
      } else if (type === 'warning') {
        icon = 'warning';
        borderClass = 'border-amber-500/40 bg-amber-950/90 text-amber-100';
        iconColor = 'text-amber-400';
      } else if (type === 'error') {
        icon = 'error';
        borderClass = 'border-rose-500/40 bg-rose-950/90 text-rose-100';
        iconColor = 'text-rose-400';
      } else {
        borderClass = 'border-purple-500/40 bg-purple-950/90 text-purple-100';
      }

      const toast = document.createElement('div');
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.className = `pointer-events-auto p-3.5 rounded-2xl backdrop-blur-xl shadow-2xl border ${borderClass} flex items-start justify-between gap-3 transform translate-y-4 opacity-0 transition-all duration-300 ease-out`;

      toast.innerHTML = `
        <div class="flex items-start gap-2.5 min-w-0">
          <span class="material-symbols-outlined text-[20px] ${iconColor} shrink-0 mt-0.5">${icon}</span>
          <div class="min-w-0">
            ${title ? `<div class="text-xs font-bold font-display truncate">${title}</div>` : ''}
            <div class="text-xs opacity-90 leading-snug">${message}</div>
          </div>
        </div>
        <button class="p-1 rounded-lg hover:bg-white/10 opacity-70 hover:opacity-100 transition cursor-pointer shrink-0" aria-label="Dismiss toast">
          <span class="material-symbols-outlined text-[16px]">close</span>
        </button>
      `;

      const closeBtn = toast.querySelector('button');
      const dismiss = () => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
      };

      closeBtn.addEventListener('click', dismiss);
      container.appendChild(toast);

      // Trigger entrance transition
      requestAnimationFrame(() => {
        toast.classList.remove('translate-y-4', 'opacity-0');
      });

      // Auto dismiss
      if (duration > 0) {
        setTimeout(dismiss, duration);
      }

      return { dismiss };
    }
  };

  // ---------------------------------------------------------------------------
  // 7. IN-APP NOTIFICATION CENTER & BELL UI COMPONENT
  // ---------------------------------------------------------------------------
  const WishNotificationCenter = {
    _initialized: false,
    _isOpen: false,
    _subscribers: new Set(),

    init() {
      if (this._initialized) return;

      // DO NOT inject notification UI into the final public recipient page (/w/:slug) or admin pages
      const path = (window.location.pathname || '').toLowerCase();
      const isPublicWish = path.startsWith('/w/') || 
                           path.endsWith('wish.html') ||
                           path.includes('admin') ||
                           document.body.dataset.page === 'public-wish';

      if (isPublicWish) {
        return; // Strict recipient privacy and admin isolation boundary
      }

      this._initialized = true;
      this._renderNotificationCenter();
      this.refreshBadgeCount();

      // Listen for auth state changes to reload user-scoped notifications
      if (window.WishAuth && typeof window.WishAuth.onAuthStateChange === 'function') {
        window.WishAuth.onAuthStateChange(() => {
          this.refreshBadgeCount();
          if (this._isOpen) this.renderList();
        });
      }

      // Close on outside click or Escape
      document.addEventListener('click', (e) => {
        const popover = document.getElementById('wishmagic-notification-popover');
        const bellBtn = document.getElementById('wishmagic-notification-bell-btn');
        if (this._isOpen && popover && !popover.contains(e.target) && bellBtn && !bellBtn.contains(e.target)) {
          this.close();
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._isOpen) {
          this.close();
        }
      });
    },

    _renderNotificationCenter() {
      // Do not auto-inject storefront notification bell on admin studio or standalone /w/ viewer
      const path = (window.location.pathname || '').toLowerCase();
      if (path.includes('admin') || path.startsWith('/w/')) {
        return;
      }

      // Find suitable navbar host or create floating badge
      let bellHost = document.querySelector('[data-purpose="navbar-notifications"]');
      
      if (!bellHost) {
        // Find navbar auth container on public storefront pages
        const authContainer = document.querySelector('.navbar-auth-container');
        if (authContainer) {
          bellHost = document.createElement('div');
          bellHost.setAttribute('data-purpose', 'navbar-notifications');
          bellHost.className = 'relative inline-flex items-center';
          authContainer.parentNode.insertBefore(bellHost, authContainer);
        }
      }

      if (!bellHost) return;

      bellHost.innerHTML = `
        <button id="wishmagic-notification-bell-btn" onclick="WishNotificationCenter.toggle()" class="p-2 rounded-full glass-pill hover:text-pink-600 transition flex items-center justify-center relative cursor-pointer" title="Notifications" aria-label="Open Notifications" aria-expanded="false" aria-haspopup="true">
          <span class="material-symbols-outlined text-[20px]">notifications</span>
          <span id="wishmagic-notification-badge" class="hidden absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-pink-500 text-white font-black text-[10px] flex items-center justify-center shadow-md animate-pulse">0</span>
        </button>

        <!-- Notification Popover Drawer -->
        <div id="wishmagic-notification-popover" class="hidden absolute right-0 top-12 w-[340px] sm:w-[400px] max-w-[90vw] bg-white/95 dark:bg-[#1A0B2E]/95 backdrop-blur-2xl rounded-3xl border border-purple-200 dark:border-purple-800 shadow-2xl z-50 overflow-hidden flex flex-col max-h-[520px] transition-all duration-200">
          
          <!-- Header -->
          <div class="p-4 border-b border-purple-100 dark:border-purple-900/60 flex items-center justify-between bg-purple-50/50 dark:bg-purple-950/40">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-[20px]">notifications_active</span>
              <span class="font-display font-extrabold text-sm text-purple-950 dark:text-white">Notifications</span>
              <span id="popover-unread-count-tag" class="px-2 py-0.5 rounded-full text-[10px] font-black bg-pink-500/20 text-pink-600 dark:text-pink-400">0 Unread</span>
            </div>
            <div class="flex items-center gap-1">
              <button onclick="WishNotificationCenter.markAllRead()" class="p-1.5 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900 text-purple-700 dark:text-purple-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer" title="Mark all as read">
                <span class="material-symbols-outlined text-[15px]">done_all</span>
                <span class="hidden sm:inline">Mark read</span>
              </button>
              <button onclick="WishNotificationCenter.close()" class="p-1 rounded-lg text-purple-400 hover:text-purple-900 dark:hover:text-white transition cursor-pointer" aria-label="Close notifications">
                <span class="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>

          <!-- Notification Tabs Filter -->
          <div class="flex items-center gap-1 px-4 py-2 border-b border-purple-100 dark:border-purple-900/40 text-xs font-bold">
            <button onclick="WishNotificationCenter.setFilter('all')" id="notif-tab-all" class="px-2.5 py-1 rounded-xl bg-pink-500 text-white cursor-pointer transition">All</button>
            <button onclick="WishNotificationCenter.setFilter('unread')" id="notif-tab-unread" class="px-2.5 py-1 rounded-xl text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900 cursor-pointer transition">Unread</button>
            <button onclick="WishNotificationCenter.setFilter('celebrations')" id="notif-tab-celebrations" class="px-2.5 py-1 rounded-xl text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900 cursor-pointer transition">Celebrations</button>
          </div>

          <!-- Notifications List Container -->
          <div id="wishmagic-notification-list" class="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar min-h-[160px] max-h-[360px]">
            <div class="py-8 text-center text-xs text-purple-400">Loading notifications...</div>
          </div>

          <!-- Footer -->
          <div class="p-3 border-t border-purple-100 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/30 flex items-center justify-between text-[11px]">
            <a href="/account" class="font-bold text-primary hover:underline flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px]">tune</span>
              <span>Preferences</span>
            </a>
            <button onclick="WishNotificationCenter.clearAll()" class="text-rose-500 hover:text-rose-600 font-semibold cursor-pointer">
              Clear All
            </button>
          </div>
        </div>
      `;
    },

    _currentFilter: 'all',

    setFilter(filter) {
      this._currentFilter = filter;
      ['all', 'unread', 'celebrations'].forEach(f => {
        const btn = document.getElementById(`notif-tab-${f}`);
        if (btn) {
          if (f === filter) {
            btn.className = 'px-2.5 py-1 rounded-xl bg-pink-500 text-white cursor-pointer transition';
          } else {
            btn.className = 'px-2.5 py-1 rounded-xl text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900 cursor-pointer transition';
          }
        }
      });
      this.renderList();
    },

    async toggle() {
      if (this._isOpen) this.close();
      else this.open();
    },

    async open() {
      this._isOpen = true;
      const popover = document.getElementById('wishmagic-notification-popover');
      const bellBtn = document.getElementById('wishmagic-notification-bell-btn');
      if (popover) {
        popover.classList.remove('hidden');
        if (bellBtn) bellBtn.setAttribute('aria-expanded', 'true');
        await this.renderList();
      }
    },

    close() {
      this._isOpen = false;
      const popover = document.getElementById('wishmagic-notification-popover');
      const bellBtn = document.getElementById('wishmagic-notification-bell-btn');
      if (popover) {
        popover.classList.add('hidden');
        if (bellBtn) bellBtn.setAttribute('aria-expanded', 'false');
      }
    },

    async refreshBadgeCount() {
      const badge = document.getElementById('wishmagic-notification-badge');
      const countTag = document.getElementById('popover-unread-count-tag');
      const userId = getCurrentUserId();
      const list = await notificationRepository.getByUser(userId);
      const unreadCount = list.filter(n => !n.readAt).length;

      if (badge) {
        if (unreadCount > 0) {
          badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }

      if (countTag) {
        countTag.textContent = `${unreadCount} Unread`;
      }
    },

    async renderList() {
      const container = document.getElementById('wishmagic-notification-list');
      if (!container) return;

      const userId = getCurrentUserId();
      let list = await notificationRepository.getByUser(userId);

      if (this._currentFilter === 'unread') {
        list = list.filter(n => !n.readAt);
      } else if (this._currentFilter === 'celebrations') {
        list = list.filter(n => [
          NOTIFICATION_TYPES.WISH_CREATED,
          NOTIFICATION_TYPES.WISH_PUBLISHED,
          NOTIFICATION_TYPES.WISH_EXPIRING,
          NOTIFICATION_TYPES.WISH_EXPIRED,
          NOTIFICATION_TYPES.WISH_SHARED,
          NOTIFICATION_TYPES.DRAFT_REMINDER
        ].includes(n.type));
      }

      if (list.length === 0) {
        container.innerHTML = `
          <div class="py-10 text-center flex flex-col items-center justify-center gap-2">
            <span class="material-symbols-outlined text-[36px] text-purple-300 dark:text-purple-700">notifications_paused</span>
            <div class="text-xs font-bold text-purple-900 dark:text-purple-200">No Notifications</div>
            <div class="text-[11px] text-purple-500 dark:text-purple-400 max-w-[200px]">You're all caught up! Platform alerts and wish updates will appear here.</div>
          </div>
        `;
        return;
      }

      container.innerHTML = list.map(item => {
        const isUnread = !item.readAt;
        const timeAgo = this._formatTimeAgo(item.createdAt);

        let iconColor = 'text-primary';
        if (item.severity === 'success') iconColor = 'text-emerald-500';
        else if (item.severity === 'warning') iconColor = 'text-amber-500';
        else if (item.severity === 'error') iconColor = 'text-rose-500';

        return `
          <div onclick="WishNotificationCenter.handleItemClick('${item.id}', '${item.actionUrl || ''}')" class="p-3 rounded-2xl border ${isUnread ? 'bg-pink-50/70 dark:bg-pink-950/20 border-pink-300/60 dark:border-pink-800/60' : 'bg-white/60 dark:bg-purple-950/30 border-purple-200/50 dark:border-purple-800/40'} hover:border-pink-500 transition cursor-pointer flex items-start justify-between gap-2.5 group">
            <div class="flex items-start gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-900/60 flex items-center justify-center shrink-0 mt-0.5">
                <span class="material-symbols-outlined text-[18px] ${iconColor}">${item.icon || 'notifications'}</span>
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-xs font-bold text-purple-950 dark:text-white truncate">${item.title}</span>
                  ${isUnread ? '<span class="w-2 h-2 rounded-full bg-pink-500 shrink-0"></span>' : ''}
                </div>
                <div class="text-[11px] text-purple-800/80 dark:text-purple-300/80 leading-snug mt-0.5 line-clamp-2">${item.message}</div>
                <div class="text-[10px] text-purple-400 dark:text-purple-500 font-mono mt-1">${timeAgo}</div>
              </div>
            </div>

            <!-- Item Actions -->
            <div class="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100" onclick="event.stopPropagation()">
              <button onclick="WishNotificationCenter.deleteItem('${item.id}')" class="p-1 rounded text-purple-400 hover:text-rose-500 transition cursor-pointer" title="Delete notification">
                <span class="material-symbols-outlined text-[15px]">delete</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    },

    async handleItemClick(id, actionUrl) {
      await notificationRepository.markAsRead(id);
      this.refreshBadgeCount();

      if (window.WishAnalyticsService) {
        window.WishAnalyticsService.trackEvent('notification_opened', {
          notificationId: id,
          actionUrl
        });
      }

      this.close();

      if (actionUrl) {
        window.location.href = actionUrl;
      } else {
        this.renderList();
      }
    },

    async markAllRead() {
      const userId = getCurrentUserId();
      await notificationRepository.markAllAsRead(userId);
      this.refreshBadgeCount();
      this.renderList();
      WishToast.show({ title: 'Notifications', message: 'All notifications marked as read', type: 'info' });
    },

    async deleteItem(id) {
      const userId = getCurrentUserId();
      await notificationRepository.delete(id, userId);
      this.refreshBadgeCount();
      this.renderList();
    },

    async clearAll() {
      if (!confirm('Clear all notifications?')) return;
      const userId = getCurrentUserId();
      await notificationRepository.clear(userId);
      this.refreshBadgeCount();
      this.renderList();
      WishToast.show({ title: 'Notifications', message: 'All notifications cleared', type: 'info' });
    },

    _formatTimeAgo(dateStr) {
      if (!dateStr) return '';
      const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
      if (diff < 60) return 'Just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    }
  };

  // ---------------------------------------------------------------------------
  // 8. CENTRAL NOTIFICATION SERVICE FACADE
  // ---------------------------------------------------------------------------
  const WishNotificationService = {
    TYPES: NOTIFICATION_TYPES,
    TEMPLATES: notificationTemplates,

    /**
     * Primary dispatch method
     */
    async notify(typeOrPayload, payload = {}) {
      let config = {};
      if (typeof typeOrPayload === 'string') {
        config = { type: typeOrPayload, ...payload };
      } else {
        config = { ...(typeOrPayload || {}) };
      }

      return await WishCommunicationService.send({
        channel: config.channel || 'inApp',
        userId: config.userId || getCurrentUserId(),
        type: config.type || NOTIFICATION_TYPES.SYSTEM_NOTICE,
        payload: config
      });
    },

    async getNotifications(filter = {}) {
      return await notificationRepository.getByUser(filter.userId || getCurrentUserId(), filter);
    },

    async markAsRead(notificationId, userId) {
      const res = await notificationRepository.markAsRead(notificationId, userId);
      WishNotificationCenter.refreshBadgeCount();
      return res;
    },

    async markAllAsRead(userId) {
      const res = await notificationRepository.markAllAsRead(userId);
      WishNotificationCenter.refreshBadgeCount();
      return res;
    },

    async deleteNotification(notificationId, userId) {
      const res = await notificationRepository.delete(notificationId, userId);
      WishNotificationCenter.refreshBadgeCount();
      return res;
    },

    async clearNotifications(userId) {
      const res = await notificationRepository.clear(userId);
      WishNotificationCenter.refreshBadgeCount();
      return res;
    },

    async getUnreadCount(userId) {
      const list = await notificationRepository.getByUser(userId || getCurrentUserId(), { unreadOnly: true });
      return list.length;
    },

    getNotificationPreferences(userId) {
      return notificationPreferencesRepository.get(userId);
    },

    updateNotificationPreferences(userId, prefs) {
      return notificationPreferencesRepository.save(userId, prefs);
    },

    getEligibleDraftReminders(userId) {
      return WishReminderEngine.getEligibleDraftReminders(userId);
    },

    getUpcomingWishReminders(userId) {
      return WishReminderEngine.getUpcomingWishReminders(userId);
    },

    getExpiringWishReminders(userId) {
      return WishReminderEngine.getExpiringWishReminders(userId);
    },

    showToast(opts) {
      return WishToast.show(opts);
    }
  };

  // Auto-initialize notification center on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    WishNotificationCenter.init();
  });

  // Expose to window
  window.WishNotificationService = WishNotificationService;
  window.notificationService = WishNotificationService;
  window.WishNotificationCenter = WishNotificationCenter;
  window.WishCommunicationService = WishCommunicationService;
  window.communicationService = WishCommunicationService;
  window.WishToast = WishToast;
  window.notificationRepository = notificationRepository;
  window.notificationPreferencesRepository = notificationPreferencesRepository;

})(typeof window !== 'undefined' ? window : this);
