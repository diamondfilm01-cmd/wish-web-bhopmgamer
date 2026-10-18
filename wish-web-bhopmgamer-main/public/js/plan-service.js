// WishMagic Monetization Architecture - Plan & Feature Models
// Part 11: Premium Access & Monetization Architecture

(function(window) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. NORMALIZED FEATURE CATALOG
  // ---------------------------------------------------------------------------
  const FEATURE_CATALOG = {
    premium_templates: {
      key: 'premium_templates',
      name: 'Premium 3D Templates',
      description: 'Access exclusive high-fidelity 3D templates with cinematic shaders and immersive animations.',
      icon: 'style',
      category: 'templates'
    },
    advanced_themes: {
      key: 'advanced_themes',
      name: 'Advanced Visual Themes',
      description: 'Unlock luxury themes including Royal Violet, Celestial Gold, Dark Synthwave, and custom color accents.',
      icon: 'palette',
      category: 'styling'
    },
    advanced_sections: {
      key: 'advanced_sections',
      name: 'Exclusive Story Sections',
      description: 'Engage recipients with Countdown Clock, Interactive Timeline, Secret Message, and Grand Finale.',
      icon: 'view_agenda',
      category: 'layout'
    },
    unlimited_photos: {
      key: 'unlimited_photos',
      name: 'Expanded Keepsake Gallery',
      description: 'Attach up to 16 high-resolution memories with Polaroid, Filmstrip, and Mosaic presentation layouts.',
      icon: 'photo_library',
      category: 'media'
    },
    voice_note: {
      key: 'voice_note',
      name: 'Spoken Voice Dedication',
      description: 'Record or upload up to 2 minutes of authentic voice notes, laughter, and personalized blessings.',
      icon: 'mic',
      category: 'media'
    },
    premium_music: {
      key: 'premium_music',
      name: 'Custom BGM Soundtrack Upload',
      description: 'Attach any personal MP3 celebration audio or choose from our full studio acoustic soundscape catalog.',
      icon: 'music_note',
      category: 'media'
    },
    remove_watermark: {
      key: 'remove_watermark',
      name: '100% Zero Watermark',
      description: 'Deliver a completely white-label, pristine gift link with zero WishMagic branding or badges.',
      icon: 'branding_watermark',
      category: 'branding'
    },
    premium_effects: {
      key: 'premium_effects',
      name: '4K Interactive FX',
      description: 'Trigger 4K gold confetti showers, realistic interactive wax seal breaks, and midnight fireworks.',
      icon: 'auto_awesome',
      category: 'effects'
    },
    keep_memory_forever: {
      key: 'keep_memory_forever',
      name: 'Lifetime Memory Preservation',
      description: 'Preserve celebration websites indefinitely with no 7-day expiration date, safe for lifetime anniversaries.',
      icon: 'all_inclusive',
      category: 'preservation'
    }
  };

  // ---------------------------------------------------------------------------
  // 2. NORMALIZED PLAN MODELS
  // ---------------------------------------------------------------------------
  const PLANS = {
    free: {
      id: 'free',
      name: 'Free Forever',
      badge: 'FREE TIER',
      tagline: 'Delightful celebration websites for friends and loved ones',
      description: 'Full access to standard templates, heartfelt letters, basic photo gallery, and 7-day celebration link.',
      price: 0,
      currency: 'INR',
      currencySymbol: '₹',
      billingType: 'free',
      isActive: true,
      features: [
        'beautiful_templates',
        'basic_customization',
        'recipient_sender_names',
        'personal_letter',
        'standard_themes',
        'standard_music',
        'standard_confetti',
        '7_day_link'
      ],
      limits: {
        maxPhotos: 3,
        maxVoiceDurationSeconds: 0,
        allowMusicUpload: false,
        allowCustomSections: false,
        watermarkRequired: true,
        lifetimePreservation: false,
        allowedGalleryLayouts: ['grid'],
        allowedThemes: ['magical', 'cute', 'celebration', 'pastel']
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-10-04T00:00:00.000Z'
    },

    premium: {
      id: 'premium',
      name: 'VIP Magic Pass',
      badge: 'VIP PASS',
      tagline: 'The ultimate, unforgettable celebration experience',
      description: 'Lifetime permanent link, zero watermark, voice dedications, custom audio, 16 memories, and all VIP blueprints.',
      price: 49,
      currency: 'INR',
      currencySymbol: '₹',
      billingType: 'one_time_or_pass',
      isActive: true,
      features: [
        'premium_templates',
        'advanced_themes',
        'advanced_sections',
        'unlimited_photos',
        'voice_note',
        'premium_music',
        'remove_watermark',
        'premium_effects',
        'keep_memory_forever'
      ],
      limits: {
        maxPhotos: 16,
        maxVoiceDurationSeconds: 120,
        allowMusicUpload: true,
        allowCustomSections: true,
        watermarkRequired: false,
        lifetimePreservation: true,
        allowedGalleryLayouts: ['grid', 'polaroid', 'carousel', 'masonry'],
        allowedThemes: ['magical', 'romantic', 'cute', 'elegant', 'royal', 'dark', 'pastel', 'celebration']
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-10-04T00:00:00.000Z'
    }
  };

  // ---------------------------------------------------------------------------
  // 3. PLAN SERVICE API
  // ---------------------------------------------------------------------------
  const WishPlanService = {
    getPlan(planId = 'free') {
      const id = String(planId || 'free').toLowerCase();
      return PLANS[id] || PLANS.free;
    },

    getAllPlans() {
      return Object.values(PLANS);
    },

    getFeature(featureKey) {
      return FEATURE_CATALOG[featureKey] || null;
    },

    getAllFeatures() {
      return Object.values(FEATURE_CATALOG);
    },

    getPlanFeatures(planId = 'free') {
      const plan = this.getPlan(planId);
      return plan.features.map(k => FEATURE_CATALOG[k] || { key: k, name: k });
    },

    getPlanLimits(planId = 'free') {
      const plan = this.getPlan(planId);
      return { ...plan.limits };
    }
  };

  window.WishPlanService = WishPlanService;
  window.WishPlans = PLANS;
  window.WishFeatures = FEATURE_CATALOG;

})(typeof window !== 'undefined' ? window : globalThis);
