// WishMagic Data Repository Layer
// Part 9: Strict User Ownership & Data Isolation Boundary
// Isolates Component -> Repository -> Current User -> Storage

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

  // ---------------------------------------------------------------------------
  // 1. WISH REPOSITORY (User-Scoped Wishes)
  // ---------------------------------------------------------------------------
  const wishRepository = {
    /**
     * Get all wishes owned by specific user
     */
    async getByUser(userId) {
      if (!userId) return [];

      let serverWishes = [];
      try {
        const res = await fetch('/api/wishes');
        const data = await res.json();
        if (data.success && Array.isArray(data.wishes)) {
          serverWishes = data.wishes;
        }
      } catch (err) {
        console.warn('[wishRepository] Could not fetch server wishes:', err);
      }

      const localWishes = getStoredList(STORAGE_KEY_USER_WISHES);

      // Merge server + local
      const mergedMap = new Map();

      // Filter and associate server wishes
      serverWishes.forEach(w => {
        // If server wish has matching userId or was created by this user
        if (w.userId === userId || (!w.userId && localWishes.some(lw => lw.id === w.id && lw.userId === userId))) {
          mergedMap.set(w.id, { ...w, userId });
        }
      });

      // Filter local wishes
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
      try {
        const res = await fetch(`/api/wishes/${encodeURIComponent(wishId)}`);
        const data = await res.json();
        if (data.success && data.wish) {
          return data.wish;
        }
      } catch (e) {}

      const localWishes = getStoredList(STORAGE_KEY_USER_WISHES);
      return localWishes.find(w => w.id === wishId) || null;
    },

    async save(wish, userId) {
      const wishRecord = {
        ...wish,
        userId: userId || 'guest',
        updatedAt: new Date().toISOString()
      };

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
        await fetch(`/api/wishes/${encodeURIComponent(wishId)}`, { method: 'DELETE' });
      } catch (e) {}

      // 2. Delete from local storage
      const localWishes = getStoredList(STORAGE_KEY_USER_WISHES);
      const filtered = localWishes.filter(w => w.id !== wishId || (userId && w.userId !== userId));
      setStoredList(STORAGE_KEY_USER_WISHES, filtered);
      return true;
    }
  };

  // ---------------------------------------------------------------------------
  // 2. DRAFT REPOSITORY (User-Scoped Drafts)
  // ---------------------------------------------------------------------------
  const draftRepository = {
    getByUser(userId) {
      if (!userId) return [];
      const drafts = getStoredList(STORAGE_KEY_DRAFTS);
      return drafts.filter(d => d.userId === userId);
    },

    getById(draftId, userId) {
      const drafts = getStoredList(STORAGE_KEY_DRAFTS);
      return drafts.find(d => d.id === draftId && (!userId || d.userId === userId)) || null;
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
      const existingIdx = drafts.findIndex(d => d.id === draftRecord.id && d.userId === draftRecord.userId);

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
      const filtered = drafts.filter(d => !(d.id === draftId && (!userId || d.userId === userId)));
      setStoredList(STORAGE_KEY_DRAFTS, filtered);
      return true;
    }
  };

  // ---------------------------------------------------------------------------
  // 3. FAVORITE REPOSITORY (User-Scoped Favorites)
  // ---------------------------------------------------------------------------
  const favoriteRepository = {
    /**
     * Map of { [userId]: string[] } (template or wish IDs)
     */
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

    getByUser(userId) {
      if (!userId) return [];
      const map = this._getMap();
      const list = map[userId];
      return Array.isArray(list) ? [...list] : [];
    },

    has(userId, itemId) {
      if (!userId || !itemId) return false;
      const list = this.getByUser(userId);
      return list.includes(itemId);
    },

    toggle(userId, itemId) {
      if (!userId || !itemId) return false;
      const map = this._getMap();
      let list = Array.isArray(map[userId]) ? map[userId] : [];

      let isFavorited = false;
      if (list.includes(itemId)) {
        list = list.filter(id => id !== itemId);
        isFavorited = false;
      } else {
        list.push(itemId);
        isFavorited = true;
      }

      map[userId] = list;
      this._saveMap(map);
      return isFavorited;
    },

    add(userId, itemId) {
      if (!userId || !itemId) return;
      const map = this._getMap();
      const list = Array.isArray(map[userId]) ? map[userId] : [];
      if (!list.includes(itemId)) {
        list.push(itemId);
        map[userId] = list;
        this._saveMap(map);
      }
    },

    remove(userId, itemId) {
      if (!userId || !itemId) return;
      const map = this._getMap();
      if (Array.isArray(map[userId])) {
        map[userId] = map[userId].filter(id => id !== itemId);
        this._saveMap(map);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 4. TEMPLATE REPOSITORY (Part 10 Template Management System)
  // ---------------------------------------------------------------------------
  const templateRepository = {
    /**
     * Get templates with optional filters
     * @param {Object} options { includeDrafts, category, search, tier, status, isFeatured, sort }
     */
    async getAll(options = {}) {
      try {
        const queryParams = new URLSearchParams();
        if (options.includeDrafts) queryParams.set('includeDrafts', 'true');
        if (options.category && options.category !== 'all') queryParams.set('category', options.category);
        if (options.search) queryParams.set('search', options.search);
        if (options.tier && options.tier !== 'all') queryParams.set('tier', options.tier);
        if (options.isFeatured) queryParams.set('featured', 'true');

        const url = `/api/templates${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.success && Array.isArray(data.templates)) {
          let list = data.templates;

          // Client-side filtering if needed
          if (options.status && options.status !== 'all') {
            list = list.filter(t => t.status === options.status);
          }

          // Client-side sorting
          if (options.sort) {
            list = [...list].sort((a, b) => {
              if (options.sort === 'name') return (a.name || '').localeCompare(b.name || '');
              if (options.sort === 'category') return (a.category || '').localeCompare(b.category || '');
              if (options.sort === 'newest') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
              if (options.sort === 'oldest') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
              // default: recent update
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
        const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}`);
        const data = await res.json();
        if (data.success && data.template) {
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

      const res = await fetch('/api/templates/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateData)
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to create template');
      }
      return data.template;
    },

    async update(templateData) {
      if (!templateData.id) throw new Error('Template ID is required for update');
      const res = await fetch('/api/templates/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateData)
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to update template');
      }
      return data.template;
    },

    async duplicate(templateId) {
      if (!templateId) throw new Error('Template ID is required to duplicate');
      const res = await fetch('/api/templates/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: templateId })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to duplicate template');
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
      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();
      return data;
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
  // 5. CATEGORY REPOSITORY (Part 10 Categories Taxonomy)
  // ---------------------------------------------------------------------------
  const categoryRepository = {
    async getAll(options = {}) {
      try {
        const res = await fetch('/api/categories');
        const data = await res.json();
        if (data.success && Array.isArray(data.categories)) {
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
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryData)
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to create category');
      }
      return data.category;
    },

    async update(id, updates) {
      const res = await fetch(`/api/categories/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to update category');
      }
      return data.category;
    },

    async reorder(orderedIds) {
      const res = await fetch('/api/categories/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to reorder categories');
      }
      return data.categories;
    },

    async delete(id, force = false) {
      const res = await fetch(`/api/categories/${encodeURIComponent(id)}${force ? '?force=true' : ''}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      return data;
    }
  };

  // ---------------------------------------------------------------------------
  // 6. MEDIA REPOSITORY (Part 10 Template Assets & Audio Library)
  // ---------------------------------------------------------------------------
  const mediaRepository = {
    async getAll() {
      try {
        const res = await fetch('/api/media');
        const data = await res.json();
        if (data.success && Array.isArray(data.tracks)) {
          return data.tracks;
        }
      } catch (err) {
        console.warn('[mediaRepository] Error fetching media tracks:', err);
      }
      return [];
    },

    async upload(fileData, meta = {}) {
      // Validate file safety
      const filename = meta.filename || 'asset.mp3';
      const ext = filename.split('.').pop().toLowerCase();
      const forbiddenExts = ['js', 'html', 'htm', 'php', 'sh', 'bat', 'exe', 'py'];

      if (forbiddenExts.includes(ext)) {
        throw new Error(`File type .${ext} is rejected. Executable code cannot be uploaded as media.`);
      }

      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: meta.title || filename,
          genre: meta.genre || 'Celebration',
          duration: meta.duration || '2:30',
          license: meta.license || 'Royalty-Free Commercial',
          fileData: fileData,
          filename: filename
        })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to upload media asset');
      }
      return data.track;
    },

    async setDefault(id) {
      const res = await fetch(`/api/media/${encodeURIComponent(id)}/default`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to set default track');
      }
      return true;
    },

    async delete(id) {
      const res = await fetch(`/api/media/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to delete media track');
      }
      return true;
    }
  };

  // Global namespace export
  window.WishRepositories = {
    wishRepository,
    draftRepository,
    favoriteRepository,
    templateRepository,
    categoryRepository,
    mediaRepository
  };

  // Also export directly on window for clean call sites
  window.wishRepository = wishRepository;
  window.draftRepository = draftRepository;
  window.favoriteRepository = favoriteRepository;
  window.templateRepository = templateRepository;
  window.categoryRepository = categoryRepository;
  window.mediaRepository = mediaRepository;

})(window);
