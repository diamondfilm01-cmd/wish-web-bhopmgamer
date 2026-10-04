// WishMagic Data Repository Layer
// Part 22: Full Frontend <-> Worker <-> D1/R2 Integration & Production Architecture
// Isolates Component -> Repository -> API Client -> Cloudflare Worker / D1

(function(window) {
  'use strict';

  const STORAGE_KEY_USER_WISHES = 'wishmagic_user_wishes';
  const STORAGE_KEY_DRAFTS = 'wishmagic_drafts';
  const STORAGE_KEY_FAVORITES_MAP = 'wishmagic_user_favorites_map';

  /**
   * Helper to ensure safe parsing of JSON arrays from localStorage
   */
  function getStoredList(key) {
    try {
      const data = localStorage.getItem(key);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn(`[Repository] Error reading ${key}:`, e);
      return [];
    }
  }

  function setStoredList(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {
      console.warn(`[Repository] Error writing ${key}:`, e);
    }
  }

  // Helper: Call API Client with graceful fallback
  const api = {
    async get(endpoint, params) {
      if (window.WishApiClient) return await window.WishApiClient.get(endpoint, params);
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      const res = await fetch(endpoint + qs, { credentials: 'include' });
      return await res.json();
    },
    async post(endpoint, body) {
      if (window.WishApiClient) return await window.WishApiClient.post(endpoint, body);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      return await res.json();
    },
    async put(endpoint, body) {
      if (window.WishApiClient) return await window.WishApiClient.put(endpoint, body);
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      return await res.json();
    },
    async delete(endpoint) {
      if (window.WishApiClient) return await window.WishApiClient.delete(endpoint);
      const res = await fetch(endpoint, { method: 'DELETE', credentials: 'include' });
      return await res.json();
    }
  };

  // ---------------------------------------------------------------------------
  // 1. WISH REPOSITORY (User-Scoped Wishes)
  // ---------------------------------------------------------------------------
  const wishRepository = {
    /**
     * Get all wishes owned by specific user from API
     */
    async getByUser(userId) {
      if (!userId) return [];

      let serverWishes = [];
      try {
        const data = await api.get('/api/wishes', { userId });
        if (data && data.success && Array.isArray(data.wishes)) {
          serverWishes = data.wishes;
        }
      } catch (err) {
        console.warn('[wishRepository] Could not fetch server wishes:', err);
      }

      const localWishes = getStoredList(STORAGE_KEY_USER_WISHES);

      // Merge server + local with server authority
      const mergedMap = new Map();

      serverWishes.forEach(w => {
        if (w.userId === userId || (!w.userId && localWishes.some(lw => lw.id === w.id && lw.userId === userId))) {
          mergedMap.set(w.id, { ...w, userId });
        }
      });

      localWishes.forEach(w => {
        if (w.userId === userId) {
          if (!mergedMap.has(w.id)) {
            mergedMap.set(w.id, w);
          }
        }
      });

      return Array.from(mergedMap.values());
    },

    async getById(wishId) {
      if (!wishId) return null;
      try {
        const data = await api.get(`/api/wishes/${encodeURIComponent(wishId)}`);
        if (data && data.success && data.wish) {
          return data.wish;
        }
      } catch (e) {}

      const localWishes = getStoredList(STORAGE_KEY_USER_WISHES);
      return localWishes.find(w => w.id === wishId || w.slug === wishId) || null;
    },

    async save(wish, userId) {
      const wishRecord = {
        ...wish,
        userId: userId || 'guest',
        updatedAt: new Date().toISOString()
      };

      // 1. Try persisting via Worker API
      try {
        const data = await api.post('/api/wishes', wishRecord);
        if (data && data.success && data.wish) {
          return data.wish;
        }
      } catch (e) {
        console.warn('[wishRepository] Server save fallback to local:', e);
      }

      // 2. Local fallback
      const localWishes = getStoredList(STORAGE_KEY_USER_WISHES);
      const existingIdx = localWishes.findIndex(w => w.id === wishRecord.id);

      if (existingIdx >= 0) {
        localWishes[existingIdx] = { ...localWishes[existingIdx], ...wishRecord };
      } else {
        localWishes.unshift(wishRecord);
      }

      setStoredList(STORAGE_KEY_USER_WISHES, localWishes);
      return wishRecord;
    },

    async delete(wishId, userId) {
      // 1. Delete from server
      try {
        await api.delete(`/api/wishes/${encodeURIComponent(wishId)}`);
      } catch (e) {}

      // 2. Delete from local storage
      const localWishes = getStoredList(STORAGE_KEY_USER_WISHES);
      const filtered = localWishes.filter(w => w.id !== wishId || (userId && w.userId !== userId));
      setStoredList(STORAGE_KEY_USER_WISHES, filtered);
      return true;
    }
  };

  // ---------------------------------------------------------------------------
  // 2. DRAFT REPOSITORY (User-Scoped Drafts + Guest Draft Migration)
  // ---------------------------------------------------------------------------
  const draftRepository = {
    getByUser(userId) {
      if (!userId) return [];
      const drafts = getStoredList(STORAGE_KEY_DRAFTS);
      return drafts.filter(d => d.userId === userId || d.userId === 'guest');
    },

    getById(draftId, userId) {
      const drafts = getStoredList(STORAGE_KEY_DRAFTS);
      return drafts.find(d => d.id === draftId && (!userId || d.userId === userId || d.userId === 'guest')) || null;
    },

    save(draft, userId) {
      const draftRecord = {
        ...draft,
        userId: userId || 'guest',
        status: 'draft',
        isDraft: true,
        updatedAt: new Date().toISOString()
      };

      const drafts = getStoredList(STORAGE_KEY_DRAFTS);
      const existingIdx = drafts.findIndex(d => d.id === draftRecord.id);

      if (existingIdx >= 0) {
        drafts[existingIdx] = draftRecord;
      } else {
        drafts.unshift(draftRecord);
      }

      setStoredList(STORAGE_KEY_DRAFTS, drafts);
      return draftRecord;
    },

    delete(draftId, userId) {
      const drafts = getStoredList(STORAGE_KEY_DRAFTS);
      const filtered = drafts.filter(d => !(d.id === draftId && (!userId || d.userId === userId || d.userId === 'guest')));
      setStoredList(STORAGE_KEY_DRAFTS, filtered);
      return true;
    },

    /**
     * Migrates any guest-created drafts to the authenticated user account upon sign-in
     */
    migrateGuestDrafts(userId) {
      if (!userId) return 0;
      const drafts = getStoredList(STORAGE_KEY_DRAFTS);
      let migratedCount = 0;

      drafts.forEach(d => {
        if (!d.userId || d.userId === 'guest') {
          d.userId = userId;
          d.updatedAt = new Date().toISOString();
          migratedCount++;
        }
      });

      if (migratedCount > 0) {
        setStoredList(STORAGE_KEY_DRAFTS, drafts);
      }
      return migratedCount;
    }
  };

  // ---------------------------------------------------------------------------
  // 3. FAVORITE REPOSITORY (User-Scoped Favorites)
  // ---------------------------------------------------------------------------
  const favoriteRepository = {
    _getMap() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_FAVORITES_MAP);
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    },

    _saveMap(map) {
      try {
        localStorage.setItem(STORAGE_KEY_FAVORITES_MAP, JSON.stringify(map));
      } catch (e) {}
    },

    async fetchServerFavorites(userId) {
      try {
        const data = await api.get('/api/favorites', { userId: userId || '' });
        if (data && data.success && Array.isArray(data.favorites)) {
          const map = this._getMap();
          map[userId] = data.favorites;
          this._saveMap(map);
          return data.favorites;
        }
      } catch (e) {}
      return null;
    },

    getByUser(userId) {
      if (!userId) return [];
      const map = this._getMap();
      const list = map[userId];
      this.fetchServerFavorites(userId);
      return Array.isArray(list) ? [...list] : [];
    },

    has(userId, itemId) {
      if (!userId || !itemId) return false;
      const list = Array.isArray(this._getMap()[userId]) ? this._getMap()[userId] : [];
      return list.includes(itemId);
    },

    async toggle(userId, itemId, itemType = 'template') {
      if (!userId || !itemId) return false;
      const map = this._getMap();
      let list = Array.isArray(map[userId]) ? map[userId] : [];

      let isFavorited = false;
      if (list.includes(itemId)) {
        list = list.filter(id => id !== itemId);
        isFavorited = false;
        try {
          api.delete(`/api/favorites/${encodeURIComponent(itemId)}`).catch(() => {});
        } catch (e) {}
      } else {
        list.push(itemId);
        isFavorited = true;
        try {
          api.post('/api/favorites', { userId, itemId, itemType }).catch(() => {});
        } catch (e) {}
      }

      map[userId] = list;
      this._saveMap(map);
      return isFavorited;
    },

    async add(userId, itemId, itemType = 'template') {
      if (!userId || !itemId) return;
      const map = this._getMap();
      const list = Array.isArray(map[userId]) ? map[userId] : [];
      if (!list.includes(itemId)) {
        list.push(itemId);
        map[userId] = list;
        this._saveMap(map);
        try {
          api.post('/api/favorites', { userId, itemId, itemType }).catch(() => {});
        } catch (e) {}
      }
    },

    async remove(userId, itemId) {
      if (!userId || !itemId) return;
      const map = this._getMap();
      if (Array.isArray(map[userId])) {
        map[userId] = map[userId].filter(id => id !== itemId);
        this._saveMap(map);
        try {
          api.delete(`/api/favorites/${encodeURIComponent(itemId)}`).catch(() => {});
        } catch (e) {}
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 4. TEMPLATE REPOSITORY
  // ---------------------------------------------------------------------------
  const templateRepository = {
    async getAll(options = {}) {
      try {
        const queryParams = {};
        if (options.includeDrafts) queryParams.includeDrafts = 'true';
        if (options.category && options.category !== 'all') queryParams.category = options.category;
        if (options.search) queryParams.search = options.search;
        if (options.tier && options.tier !== 'all') queryParams.tier = options.tier;
        if (options.isFeatured) queryParams.featured = 'true';

        const data = await api.get('/api/templates', queryParams);

        if (data && data.success && Array.isArray(data.templates)) {
          let list = data.templates;

          if (options.status && options.status !== 'all') {
            list = list.filter(t => t.status === options.status);
          }

          if (options.sort) {
            list = [...list].sort((a, b) => {
              if (options.sort === 'name') return (a.name || '').localeCompare(b.name || '');
              if (options.sort === 'category') return (a.category || '').localeCompare(b.category || '');
              if (options.sort === 'newest') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
              if (options.sort === 'oldest') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
              return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
            });
          }

          return list;
        }
      } catch (err) {
        console.warn('[templateRepository] Error fetching templates:', err);
      }
      return [];
    },

    async getById(templateId) {
      if (!templateId) return null;
      try {
        const data = await api.get(`/api/templates/${encodeURIComponent(templateId)}`);
        if (data && data.success && data.template) {
          return data.template;
        }
      } catch (e) {}
      return null;
    },

    async create(templateData) {
      const validation = this.validate(templateData);
      if (!validation.valid) {
        throw new Error(validation.errors.join('; '));
      }

      const data = await api.post('/api/templates/create', templateData);
      if (!data || !data.success) {
        throw new Error((data && data.message) || 'Failed to create template');
      }
      return data.template;
    },

    async update(templateData) {
      if (!templateData.id) throw new Error('Template ID is required for update');
      const data = await api.post('/api/templates/update', templateData);
      if (!data || !data.success) {
        throw new Error((data && data.message) || 'Failed to update template');
      }
      return data.template;
    },

    async duplicate(templateId) {
      if (!templateId) throw new Error('Template ID is required to duplicate');
      const data = await api.post('/api/templates/duplicate', { id: templateId });
      if (!data || !data.success) {
        throw new Error((data && data.message) || 'Failed to duplicate template');
      }
      return data.template;
    },

    async publish(templateId) {
      return this.update({ id: templateId, status: 'published', isPublished: true });
    },

    async unpublish(templateId) {
      return this.update({ id: templateId, status: 'draft', isPublished: false });
    },

    async delete(templateId, force = false) {
      if (!templateId) throw new Error('Template ID is required');
      const url = `/api/templates/${encodeURIComponent(templateId)}${force ? '?force=true' : ''}`;
      return await api.delete(url);
    },

    validate(template) {
      const errors = [];
      if (!template) {
        return { valid: false, errors: ['Template data is required'] };
      }
      if (!template.name || !template.name.trim()) {
        errors.push('Template title/name is required');
      }
      if (!template.category || !template.category.trim()) {
        errors.push('Category is required');
      }
      if (template.tier === 'vip' && (!template.price || Number(template.price) <= 0)) {
        errors.push('VIP/Premium templates must have a valid price greater than ₹0');
      }
      return {
        valid: errors.length === 0,
        errors
      };
    }
  };

  // ---------------------------------------------------------------------------
  // 5. CATEGORY REPOSITORY
  // ---------------------------------------------------------------------------
  const categoryRepository = {
    async getAll(options = {}) {
      try {
        const data = await api.get('/api/categories');
        if (data && data.success && Array.isArray(data.categories)) {
          let list = data.categories;
          if (options.activeOnly) {
            list = list.filter(c => c.isActive !== false);
          }
          return list.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
        }
      } catch (err) {
        console.warn('[categoryRepository] Error fetching categories:', err);
      }
      return [];
    },

    async getById(id) {
      const all = await this.getAll();
      return all.find(c => c.id === id || c.slug === id) || null;
    },

    async create(categoryData) {
      if (!categoryData.name || !categoryData.name.trim()) {
        throw new Error('Category name is required');
      }
      const data = await api.post('/api/categories', categoryData);
      if (!data || !data.success) {
        throw new Error((data && data.message) || 'Failed to create category');
      }
      return data.category;
    },

    async update(id, updates) {
      const data = await api.put(`/api/categories/${encodeURIComponent(id)}`, updates);
      if (!data || !data.success) {
        throw new Error((data && data.message) || 'Failed to update category');
      }
      return data.category;
    },

    async reorder(orderedIds) {
      const data = await api.post('/api/categories/reorder', { orderedIds });
      if (!data || !data.success) {
        throw new Error((data && data.message) || 'Failed to reorder categories');
      }
      return data.categories;
    },

    async delete(id, force = false) {
      return await api.delete(`/api/categories/${encodeURIComponent(id)}${force ? '?force=true' : ''}`);
    }
  };

  // ---------------------------------------------------------------------------
  // 6. MEDIA REPOSITORY
  // ---------------------------------------------------------------------------
  const mediaRepository = {
    async getAll() {
      try {
        const data = await api.get('/api/media');
        if (data && data.success && Array.isArray(data.tracks)) {
          return data.tracks;
        }
      } catch (err) {
        console.warn('[mediaRepository] Error fetching media tracks:', err);
      }
      return [];
    },

    async upload(fileData, meta = {}) {
      const filename = meta.filename || 'asset.mp3';
      const ext = filename.split('.').pop().toLowerCase();
      const forbiddenExts = ['js', 'html', 'htm', 'php', 'sh', 'bat', 'exe', 'py', 'svg'];

      if (forbiddenExts.includes(ext)) {
        throw new Error(`File type .${ext} is rejected. Executable code or unparsed vectors cannot be uploaded as media.`);
      }

      const data = await api.post('/api/media/upload', {
        title: meta.title || filename,
        genre: meta.genre || 'Celebration',
        duration: meta.duration || '2:30',
        license: meta.license || 'Royalty-Free Commercial',
        fileData: fileData,
        filename: filename
      });

      if (!data || !data.success) {
        throw new Error((data && data.message) || 'Failed to upload media asset');
      }
      return data.track;
    },

    async setDefault(id) {
      const data = await api.post(`/api/media/${encodeURIComponent(id)}/default`, {});
      if (!data || !data.success) {
        throw new Error((data && data.message) || 'Failed to set default track');
      }
      return true;
    },

    async delete(id) {
      const data = await api.delete(`/api/media/${encodeURIComponent(id)}`);
      if (!data || !data.success) {
        throw new Error((data && data.message) || 'Failed to delete media track');
      }
      return true;
    }
  };

  // ---------------------------------------------------------------------------
  // 7. USER REPOSITORY
  // ---------------------------------------------------------------------------
  const userRepository = {
    async getAll() {
      try {
        const data = await api.get('/api/admin/users');
        if (data && data.success && Array.isArray(data.users)) {
          return data.users;
        }
      } catch (e) {
        console.warn('[userRepository] Error fetching users from server:', e);
      }

      if (window.WishAuth) {
        const list = window.WishAuth.getAllKnownUsers();
        return list.map(u => ({
          ...u,
          plan: u.isPremium ? 'VIP' : 'Free',
          wishesCount: 0,
          favoritesCount: 0
        }));
      }

      return [];
    },

    async getById(userId) {
      const all = await this.getAll();
      return all.find(u => u.id === userId) || null;
    },

    async getUserDetails(userId) {
      const user = await this.getById(userId);
      if (!user) return null;

      const userWishes = await wishRepository.getByUser(userId);
      const userDrafts = draftRepository.getByUser(userId);
      const userFavorites = favoriteRepository.getByUser(userId);

      return {
        user,
        wishes: userWishes,
        drafts: userDrafts,
        favorites: userFavorites
      };
    }
  };

  // ---------------------------------------------------------------------------
  // 8. ADMIN & ANALYTICS REPOSITORY
  // ---------------------------------------------------------------------------
  const adminRepository = {
    async getPlatformMetrics(dateRangeKey = 'all', customRange = null) {
      let templates = [];
      let wishes = [];
      let categories = [];
      let media = [];
      let users = [];
      let events = [];

      try {
        templates = await templateRepository.getAll({ includeDrafts: true });
        categories = await categoryRepository.getAll();
        media = await mediaRepository.getAll();
        users = await userRepository.getAll();

        const wData = await api.get('/api/wishes');
        if (wData && wData.success && Array.isArray(wData.wishes)) {
          wishes = wData.wishes;
        }

        if (window.WishAnalyticsService) {
          events = await window.WishAnalyticsService.getEvents();
        }
      } catch (err) {
        console.warn('[adminRepository] Error assembling datasets:', err);
      }

      const nowMs = Date.now();
      let startMs = 0;
      let endMs = Infinity;

      if (dateRangeKey === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        startMs = today.getTime();
      } else if (dateRangeKey === '7d') {
        startMs = nowMs - (7 * 24 * 60 * 60 * 1000);
      } else if (dateRangeKey === '30d') {
        startMs = nowMs - (30 * 24 * 60 * 60 * 1000);
      } else if (dateRangeKey === '90d') {
        startMs = nowMs - (90 * 24 * 60 * 60 * 1000);
      } else if (dateRangeKey === 'year') {
        const startOfYear = new Date(new Date().getFullYear(), 0, 1);
        startMs = startOfYear.getTime();
      } else if (dateRangeKey === 'custom' && customRange) {
        if (customRange.start) startMs = new Date(customRange.start).getTime();
        if (customRange.end) endMs = new Date(customRange.end).getTime() + (24 * 60 * 60 * 1000) - 1;
      }

      const filteredWishes = wishes.filter(w => {
        if (!w.createdAt) return true;
        const cMs = new Date(w.createdAt).getTime();
        return cMs >= startMs && cMs <= endMs;
      });

      const filteredEvents = events.filter(e => {
        if (!e.timestamp) return true;
        const eMs = new Date(e.timestamp).getTime();
        return eMs >= startMs && eMs <= endMs;
      });

      let activeCount = 0;
      let upcomingCount = 0;
      let expiredCount = 0;
      let draftsCount = 0;
      let vipWishesCount = 0;
      let freeWishesCount = 0;
      let totalViews = 0;
      let simulatedRevenue = 0;
      let simulatedPaidOrders = 0;

      const wishesByCategory = {};
      const wishesByTemplate = {};

      filteredWishes.forEach(w => {
        const status = window.WishLifecycle ? window.WishLifecycle.getWishStatus(w) : (w.lifecycleStatus || 'active');
        if (status === 'active' || status === 'live') activeCount++;
        else if (status === 'upcoming' || status === 'future') upcomingCount++;
        else if (status === 'expired') expiredCount++;
        else if (status === 'draft') draftsCount++;

        const isVip = w.tier === 'vip' || (w.price && Number(w.price) > 0) || (w.payment && w.payment.status === 'Completed');
        if (isVip) {
          vipWishesCount++;
          const price = Number(w.price) || 49;
          simulatedRevenue += price;
          simulatedPaidOrders++;
        } else {
          freeWishesCount++;
        }

        totalViews += (Number(w.views) || 0);

        const cat = (w.customData && w.customData.category) || (w.template && w.template.category) || 'Celebration';
        wishesByCategory[cat] = (wishesByCategory[cat] || 0) + 1;

        const tName = w.templateName || w.templateId || 'General Celebration';
        wishesByTemplate[tName] = (wishesByTemplate[tName] || 0) + 1;
      });

      const publishedTemplates = templates.filter(t => t.isPublished !== false && t.status !== 'draft').length;
      const draftTemplates = templates.filter(t => t.status === 'draft' || t.isPublished === false).length;
      const vipTemplates = templates.filter(t => t.tier === 'vip' || t.isPremium === true).length;
      const freeTemplates = templates.filter(t => t.tier !== 'vip' && !t.isPremium).length;

      const vipUsers = users.filter(u => u.isPremium || u.plan === 'VIP').length;
      const freeUsers = users.filter(u => !u.isPremium && u.plan !== 'VIP').length;

      const shareEventsCount = filteredEvents.filter(e => e.eventName === 'wish_shared' || e.eventName === 'share_link_copied').length;
      const qrEventsCount = filteredEvents.filter(e => e.eventName === 'qr_generated').length;
      const favoriteEventsCount = filteredEvents.filter(e => e.eventName === 'wish_favorited' || e.eventName === 'template_favorited').length;

      return {
        dateRangeKey,
        totalWishes: filteredWishes.length,
        activeWishes: activeCount,
        upcomingWishes: upcomingCount,
        expiredWishes: expiredCount,
        draftWishes: draftsCount,
        totalTemplates: templates.length,
        publishedTemplates,
        draftTemplates,
        vipTemplates,
        freeTemplates,
        totalUsers: users.length,
        vipUsers,
        freeUsers,
        totalFavorites: favoriteEventsCount,
        totalShares: shareEventsCount,
        qrGeneratedCount: qrEventsCount,
        totalViews,
        simulatedRevenue,
        simulatedPaidOrders,
        wishesByCategory,
        wishesByTemplate,
        wishes: filteredWishes,
        templates,
        events: filteredEvents,
        categories,
        users
      };
    },

    async validateHealth() {
      try {
        const data = await api.get('/api/admin/validation');
        if (data && data.success) {
          return data;
        }
      } catch (e) {}

      return {
        summary: { totalTemplates: 0, passCount: 0, warningCount: 0, errorCount: 0, overallStatus: 'HEALTHY' },
        templates: [],
        media: []
      };
    },

    async globalSearch(query) {
      if (!query || !query.trim()) return { templates: [], wishes: [], categories: [], users: [] };
      const q = query.trim().toLowerCase();

      const [templates, categories, users, wishesRes] = await Promise.all([
        templateRepository.getAll({ includeDrafts: true }),
        categoryRepository.getAll(),
        userRepository.getAll(),
        api.get('/api/wishes').catch(() => ({ wishes: [] }))
      ]);

      const wishes = (wishesRes && wishesRes.wishes) || [];

      return {
        templates: templates.filter(t => 
          (t.name && t.name.toLowerCase().includes(q)) || 
          (t.id && t.id.toLowerCase().includes(q)) ||
          (t.category && t.category.toLowerCase().includes(q))
        ).slice(0, 8),

        wishes: wishes.filter(w => 
          (w.recipientName && w.recipientName.toLowerCase().includes(q)) ||
          (w.buyerName && w.buyerName.toLowerCase().includes(q)) ||
          (w.id && w.id.toLowerCase().includes(q)) ||
          (w.slug && w.slug.toLowerCase().includes(q)) ||
          (w.templateName && w.templateName.toLowerCase().includes(q))
        ).slice(0, 8),

        categories: categories.filter(c => 
          (c.name && c.name.toLowerCase().includes(q)) || 
          (c.slug && c.slug.toLowerCase().includes(q))
        ).slice(0, 6),

        users: users.filter(u => 
          (u.displayName && u.displayName.toLowerCase().includes(q)) || 
          (u.email && u.email.toLowerCase().includes(q)) ||
          (u.id && u.id.toLowerCase().includes(q))
        ).slice(0, 6)
      };
    }
  };

  // ---------------------------------------------------------------------------
  // 9. AUTHORIZATION ABSTRACTION
  // ---------------------------------------------------------------------------
  const WishAuthorization = {
    isAdmin() {
      if (window.WishAuth && typeof window.WishAuth.isAdmin === 'function') {
        return window.WishAuth.isAdmin();
      }
      return true;
    },
    canManageTemplates() { return this.isAdmin(); },
    canManageUsers() { return this.isAdmin(); },
    canManageWishes() { return this.isAdmin(); },
    canViewAnalytics() { return this.isAdmin(); }
  };

  // Global namespace export
  window.WishRepositories = {
    wishRepository,
    draftRepository,
    favoriteRepository,
    templateRepository,
    categoryRepository,
    mediaRepository,
    userRepository,
    adminRepository,
    get notificationRepository() { return window.notificationRepository; },
    get notificationPreferencesRepository() { return window.notificationPreferencesRepository; }
  };

  window.WishAuthorization = WishAuthorization;

  // Also export directly on window for clean call sites
  window.wishRepository = wishRepository;
  window.draftRepository = draftRepository;
  window.favoriteRepository = favoriteRepository;
  window.templateRepository = templateRepository;
  window.categoryRepository = categoryRepository;
  window.mediaRepository = mediaRepository;
  window.userRepository = userRepository;
  window.adminRepository = adminRepository;
  window.authorizationService = WishAuthorization;

})(typeof window !== 'undefined' ? window : this);
