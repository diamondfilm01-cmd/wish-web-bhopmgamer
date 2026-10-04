/**
 * WishMagic Centralized Data Normalization & Migration Engine
 * Part 23: D1 Database Finalization, Migrations & Data Integrity
 * 
 * Provides unified normalizers to ensure consistent data structures
 * across D1 queries, API client responses, local drafts, and legacy formats.
 */

(function(window) {
  'use strict';

  const WishDataMigrator = {
    /**
     * Normalizes a Wish record into the production schema model
     */
    normalizeWish(rawWish) {
      if (!rawWish) return null;
      const customData = rawWish.customData || (typeof rawWish.custom_data === 'string' ? JSON.parse(rawWish.custom_data || '{}') : (rawWish.custom_data || {}));

      const id = rawWish.id || ('wm_' + Date.now().toString(36));
      const slug = rawWish.slug || rawWish.public_slug || ('wish-' + id);
      const userId = rawWish.userId || rawWish.user_id || customData.userId || 'guest';
      const templateId = rawWish.templateId || rawWish.template_id || customData.templateId || 'tpl_glitter_birthday';
      const templateName = rawWish.templateName || rawWish.template_name || customData.templateName || 'Celebration Experience';
      const tier = rawWish.tier || (rawWish.is_premium || customData.isPremium ? 'vip' : 'free');
      const price = Number(rawWish.price) || (tier === 'vip' ? 49 : 0);
      const isPrivate = Boolean(rawWish.isPrivate !== undefined ? rawWish.isPrivate : (rawWish.is_private !== undefined ? rawWish.is_private : customData.isPrivate));
      const buyerName = rawWish.buyerName || rawWish.buyer_name || customData.sender_name || customData.senderName || 'A Loved One';
      const recipientName = rawWish.recipientName || rawWish.recipient_name || customData.recipient_name || customData.recipientName || 'Someone Special';

      // Standardize event date (YYYY-MM-DD)
      const rawDate = rawWish.eventDate || rawWish.event_date || rawWish.target_date || customData.event_date || customData.eventDate || customData.target_date || new Date().toISOString().split('T')[0];
      const cleanEventDate = String(rawDate).includes('T') ? String(rawDate).split('T')[0] : String(rawDate).trim();

      // Extract normalized sections if present in customData
      const sections = Array.isArray(customData.sections) ? customData.sections : [
        { id: 'hero', name: 'Celebration Hero', enabled: true, order: 0 },
        { id: 'letter', name: 'Heartfelt Letter', enabled: true, order: 1 },
        { id: 'photos', name: 'Photo Memories', enabled: true, order: 2 }
      ];

      return {
        id,
        slug,
        userId,
        templateId,
        templateName,
        tier,
        price,
        isPrivate,
        buyerName,
        recipientName,
        eventDate: cleanEventDate,
        expiryDate: rawWish.expiryDate || rawWish.expiry_date || cleanEventDate,
        views: Number(rawWish.views || rawWish.views_count || 0),
        sections,
        customData,
        createdAt: rawWish.createdAt || rawWish.created_at || new Date().toISOString(),
        updatedAt: rawWish.updatedAt || rawWish.updated_at || new Date().toISOString()
      };
    },

    /**
     * Normalizes a Template record
     */
    normalizeTemplate(raw) {
      if (!raw) return null;
      return {
        id: raw.id,
        slug: raw.slug || raw.id,
        name: raw.name || 'Celebration Template',
        category: raw.category || 'Celebration',
        tier: raw.tier || (raw.is_premium || raw.isPremium ? 'vip' : 'free'),
        price: Number(raw.price) || 0,
        isPremium: Boolean(raw.isPremium !== undefined ? raw.isPremium : raw.is_premium),
        isPublished: Boolean(raw.isPublished !== undefined ? raw.isPublished : (raw.is_published !== undefined ? raw.is_published : true)),
        status: raw.status || 'published',
        featured: Number(raw.featured) || 0,
        placement: Number(raw.placement) || 99,
        thumbnail: raw.thumbnail || '',
        description: raw.description || '',
        folder: raw.folder || raw.id,
        entryFile: raw.entryFile || raw.entry_file || 'index.html',
        capabilities: typeof raw.capabilities === 'string' ? JSON.parse(raw.capabilities) : (raw.capabilities || {}),
        sections: typeof raw.sections === 'string' ? JSON.parse(raw.sections) : (raw.sections || [])
      };
    },

    /**
     * Normalizes a User record
     */
    normalizeUser(raw) {
      if (!raw) return null;
      return {
        id: raw.id,
        email: (raw.email || '').trim().toLowerCase(),
        displayName: raw.displayName || raw.display_name || 'Creator',
        avatarUrl: raw.avatarUrl || raw.avatar_url || '',
        role: raw.role || 'creator',
        plan: raw.plan || (raw.isPremium || raw.is_premium ? 'VIP' : 'Free'),
        isPremium: Boolean(raw.isPremium !== undefined ? raw.isPremium : raw.is_premium),
        status: raw.status || 'active',
        createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
        updatedAt: raw.updatedAt || raw.updated_at || new Date().toISOString()
      };
    }
  };

  // Expose to window and module
  if (typeof window !== 'undefined') {
    window.WishDataMigrator = WishDataMigrator;
  }
  if (typeof global !== 'undefined') {
    global.WishDataMigrator = WishDataMigrator;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WishDataMigrator;
  }

})(typeof window !== 'undefined' ? window : global);
