// WishMagic Centralized Feature Access API
// Part 11: Premium Access & Monetization Architecture
//
// ⚠️ ARCHITECTURAL RULE:
// Components and views must NEVER directly inspect `user.isPremium` or `template.price`.
// All UI gating and capability authorization MUST pass through `WishFeatureAccess`.

(function(window) {
  'use strict';

  // Feature categorization
  const PREMIUM_THEMES = ['romantic', 'elegant', 'royal', 'dark'];
  const FREE_THEMES = ['magical', 'cute', 'celebration', 'pastel'];

  const PREMIUM_SECTIONS = ['countdown', 'timeline', 'voice', 'secret_message', 'open_when', 'final_surprise'];
  const FREE_SECTIONS = ['hero', 'message', 'gallery', 'memories', 'finale'];

  const PREMIUM_GALLERY_LAYOUTS = ['polaroid', 'carousel', 'masonry'];
  const FREE_GALLERY_LAYOUTS = ['grid'];

  function isUserPremium() {
    return Boolean(window.WishEntitlement && window.WishEntitlement.isPremium());
  }

  const WishFeatureAccess = {
    /**
     * Check if user is entitled to use or create a specific template
     * @param {Object|string} template
     */
    canUseTemplate(template) {
      if (!template) return { allowed: true };

      const isVip = (typeof template === 'object')
        ? (template.tier === 'vip' || template.isPremium === true || Number(template.price) > 0)
        : false;

      if (!isVip) {
        return { allowed: true, plan: 'free' };
      }

      if (isUserPremium()) {
        return { allowed: true, plan: 'premium' };
      }

      return {
        allowed: false,
        feature: 'premium_templates',
        title: 'VIP Celebration Blueprint',
        reason: 'This exclusive blueprint features cinematic 3D effects, unlimited memories, and an interactive finale.',
        requiredPlan: 'premium'
      };
    },

    /**
     * Check if a visual theme is allowed on the user's plan
     * @param {string} themeId
     */
    canUseTheme(themeId) {
      const cleanTheme = String(themeId || 'magical').toLowerCase();

      if (FREE_THEMES.includes(cleanTheme)) {
        return { allowed: true, plan: 'free' };
      }

      if (isUserPremium()) {
        return { allowed: true, plan: 'premium' };
      }

      const themeNames = {
        romantic: 'Romantic Rosé & Shimmering Hearts',
        elegant: 'Golden Champagne & Velvet Glow',
        royal: 'Royal Violet & Astral Chimes',
        dark: 'Midnight Neon & Cosmic Synth'
      };

      return {
        allowed: false,
        feature: 'advanced_themes',
        title: `${themeNames[cleanTheme] || 'Advanced Visual Theme'} Locked`,
        reason: 'Unlock luxury aesthetic color palettes, glowing gradients, and tailored typography.',
        requiredPlan: 'premium'
      };
    },

    /**
     * Check if a celebration section is allowed on the user's plan
     * @param {string} sectionId
     */
    canUseSection(sectionId) {
      const cleanId = String(sectionId || '').toLowerCase();

      if (FREE_SECTIONS.includes(cleanId)) {
        return { allowed: true, plan: 'free' };
      }

      if (isUserPremium()) {
        return { allowed: true, plan: 'premium' };
      }

      const sectionLabels = {
        countdown: 'Celebration Countdown Clock',
        timeline: 'Interactive Love & Friendship Timeline',
        voice: 'Spoken Voice Note Dedication',
        secret_message: 'Secret Scratch-to-Reveal Message',
        open_when: 'Open-When Time Capsules',
        final_surprise: 'Grand Confetti & Fireworks Finale'
      };

      return {
        allowed: false,
        feature: 'advanced_sections',
        title: `${sectionLabels[cleanId] || 'Special Story Section'} Locked`,
        reason: 'This interactive section requires a VIP Magic Pass to activate in the recipient experience.',
        requiredPlan: 'premium'
      };
    },

    /**
     * Check if gallery layout is allowed
     * @param {string} layout ('grid' | 'polaroid' | 'carousel' | 'masonry')
     */
    canUseGalleryLayout(layout) {
      const cleanLayout = String(layout || 'grid').toLowerCase();

      if (FREE_GALLERY_LAYOUTS.includes(cleanLayout)) {
        return { allowed: true, plan: 'free' };
      }

      if (isUserPremium()) {
        return { allowed: true, plan: 'premium' };
      }

      const layoutNames = {
        polaroid: 'Vintage Instant Polaroids',
        carousel: 'Cinematic Filmstrip Reel',
        masonry: 'Curated Mosaic Collage'
      };

      return {
        allowed: false,
        feature: 'unlimited_photos',
        title: `${layoutNames[cleanLayout] || 'Special Gallery Style'} Locked`,
        reason: 'Polaroid pinboards, sliding filmstrips, and mosaic collages are exclusive to the VIP Pass.',
        requiredPlan: 'premium'
      };
    },

    /**
     * Check if user can add another photo
     * @param {number} currentCount
     */
    canAddPhoto(currentCount = 0) {
      const isPrem = isUserPremium();
      const planLimits = (window.WishPlanService && window.WishPlanService.getPlanLimits(isPrem ? 'premium' : 'free')) || { maxPhotos: isPrem ? 16 : 3 };
      const maxAllowed = planLimits.maxPhotos || (isPrem ? 16 : 3);

      if (currentCount < maxAllowed) {
        return {
          allowed: true,
          current: currentCount,
          max: maxAllowed,
          remaining: maxAllowed - currentCount
        };
      }

      return {
        allowed: false,
        current: currentCount,
        max: maxAllowed,
        remaining: 0,
        feature: 'unlimited_photos',
        title: 'Photo Memory Limit Reached',
        reason: isPrem
          ? 'You have reached the maximum keepsake limit of 16 photos for this celebration.'
          : 'The Free plan supports up to 3 keepsake photos. Upgrade to VIP to attach up to 16 precious memories.',
        requiredPlan: 'premium'
      };
    },

    /**
     * Check if custom music upload is allowed
     * @param {string} type ('curated' | 'upload')
     */
    canUseMusic(type = 'curated') {
      if (type !== 'upload') {
        return { allowed: true, plan: 'free' };
      }

      if (isUserPremium()) {
        return { allowed: true, plan: 'premium' };
      }

      return {
        allowed: false,
        feature: 'premium_music',
        title: 'Custom Audio Upload Locked',
        reason: 'Upload your own MP3 soundtrack with VIP Pass. Free users can select from our curated acoustic chimes.',
        requiredPlan: 'premium'
      };
    },

    /**
     * Check if voice note recording/upload is allowed
     */
    canUploadVoiceNote() {
      if (isUserPremium()) {
        return { allowed: true, maxDurationSeconds: 120 };
      }

      return {
        allowed: false,
        feature: 'voice_note',
        title: 'Spoken Voice Note Locked',
        reason: 'Let them hear your authentic laughter and personal blessing with up to 2 minutes of studio voice recording.',
        requiredPlan: 'premium'
      };
    },

    /**
     * Watermark policy (Section 13)
     */
    canRemoveWatermark(user, wish) {
      if (isUserPremium()) return true;
      if (wish && (wish.tier === 'vip' || wish.price > 0 || (wish.payment && wish.payment.status === 'Completed'))) {
        return true;
      }
      return false;
    },

    shouldShowWatermark(wish, user) {
      // If user requested watermark removal and has entitlement or wish is VIP
      if (wish && wish.customData && wish.customData.watermarkRemoved) {
        if (this.canRemoveWatermark(user, wish)) {
          return false;
        }
      }
      if (wish && (wish.tier === 'vip' || (wish.payment && wish.payment.status === 'Completed'))) {
        return false;
      }
      return true;
    },

    /**
     * Lifetime preservation policy (Section 14)
     */
    canKeepMemoryForever(user, wish) {
      if (isUserPremium()) return true;
      if (wish && (wish.tier === 'vip' || (wish.payment && wish.payment.status === 'Completed'))) {
        return true;
      }
      return false;
    },

    /**
     * Check if wish contains any premium features and if creator has entitlement
     * @param {Object} template
     * @param {Object} customData
     */
    canPublishWish(template, customData = {}) {
      const isTplVip = template && (template.tier === 'vip' || template.isPremium === true || Number(template.price) > 0);
      const isThemeVip = customData.theme && PREMIUM_THEMES.includes(String(customData.theme).toLowerCase());
      const hasVoice = Boolean(customData.media && customData.media.voiceNote && customData.media.voiceNote.enabled);
      const hasCustomMusic = Boolean(customData.media && customData.media.music && customData.media.music.type === 'upload');
      const hasTooManyPhotos = Boolean(customData.media && customData.media.photos && customData.media.photos.length > 3);
      const hasPreservation = Boolean(customData.lifetimePreservation);

      const requiresPremium = isTplVip || isThemeVip || hasVoice || hasCustomMusic || hasTooManyPhotos || hasPreservation;

      if (!requiresPremium) {
        return { allowed: true, requiredTier: 'free', requiresUpgrade: false };
      }

      if (isUserPremium()) {
        return { allowed: true, requiredTier: 'vip', requiresUpgrade: false };
      }

      return {
        allowed: false,
        requiredTier: 'vip',
        requiresUpgrade: true,
        reasons: [
          isTplVip ? 'Exclusive VIP Blueprint' : null,
          isThemeVip ? 'Premium Visual Theme' : null,
          hasVoice ? 'Personal Voice Note' : null,
          hasCustomMusic ? 'Custom Uploaded Soundtrack' : null,
          hasTooManyPhotos ? 'Expanded Photo Gallery (4+ Photos)' : null,
          hasPreservation ? 'Lifetime Memory Preservation' : null
        ].filter(Boolean)
      };
    },

    /**
     * Metadata helper for contextual upgrade dialogs
     */
    explainLock(contextType, contextKey) {
      switch (contextType) {
        case 'template':
          return {
            title: 'Unlock This Magical Blueprint',
            badge: 'VIP BLUEPRINT',
            subtitle: 'Craft a showstopping 3D celebration with interactive storytelling.',
            bullets: [
              'Full cinematic transitions & 4K confetti particles',
              'Up to 16 high-resolution keepsake memories',
              'Personal voice dedication audio note (up to 2 mins)',
              '100% white-label with zero platform watermark',
              'Permanent link with lifetime anniversary preservation'
            ],
            cta: 'Unlock VIP Pass • ₹49'
          };

        case 'theme':
          return {
            title: 'Unlock Luxury Theme Atmosphere',
            badge: 'PREMIUM AESTHETIC',
            subtitle: 'Elevate your celebration website with rich colors and tailored typography.',
            bullets: [
              'Curated gradients & cosmic atmospheric particles',
              'High-contrast accessible typography pairings',
              'Frosted glass surfaces with luminous borders'
            ],
            cta: 'Unlock All Themes with VIP'
          };

        case 'section':
          return {
            title: 'Unlock Exclusive Story Section',
            badge: 'PREMIUM COMPONENT',
            subtitle: 'Create an emotional, memorable experience with interactive story elements.',
            bullets: [
              'Live countdown to recipient celebration date',
              'Surprise scratch-to-reveal secret letters',
              'Timed midnight fireworks and balloon explosions'
            ],
            cta: 'Unlock All Sections with VIP'
          };

        case 'media_limit':
          return {
            title: 'Expand Your Keepsake Photo Gallery',
            badge: '16 MEMORIES CAPACITY',
            subtitle: 'Free tier includes 3 photos. Unlock VIP to cherish up to 16 unforgettable moments.',
            bullets: [
              'Attach up to 16 high-resolution memories',
              'Choose from Polaroid, Filmstrip, and Mosaic layouts',
              'Full-screen high-definition lightbox viewer'
            ],
            cta: 'Unlock 16 Photos with VIP'
          };

        case 'voice':
          return {
            title: 'Add a Spoken Voice Dedication',
            badge: 'AUDIO BLESSING',
            subtitle: 'Nothing touches the heart like hearing someone you love speak directly to you.',
            bullets: [
              'Record directly in your browser or upload any audio file',
              'Up to 2 minutes of genuine laughter, songs, or blessings',
              'Interactive waveform player with custom soundboard controls'
            ],
            cta: 'Unlock Voice Notes with VIP'
          };

        case 'music_upload':
          return {
            title: 'Upload Your Favorite Song (MP3)',
            badge: 'CUSTOM SOUNDSCAPE',
            subtitle: 'Attach the exact song that defines your friendship or relationship.',
            bullets: [
              'Attach your personal song file (MP3, WAV, AAC)',
              'Auto-looping celebration background audio',
              'Independent volume and playback controls for the recipient'
            ],
            cta: 'Unlock Custom Music with VIP'
          };

        case 'watermark':
          return {
            title: 'Remove Platform Watermark',
            badge: '100% WHITE-LABEL',
            subtitle: 'Deliver a pure, bespoke experience that feels completely handcrafted by you.',
            bullets: [
              'Zero WishMagic tags, badges, or brand marks',
              'Pristine footer dedicated exclusively to your love and names',
              'Luxury custom link presentation'
            ],
            cta: 'Remove Watermark with VIP'
          };

        case 'preservation':
          return {
            title: 'Keep This Memory Forever',
            badge: 'LIFETIME PRESERVATION',
            subtitle: 'Standard free links expire after 7 days. Preserve this keepsake for every anniversary to come.',
            bullets: [
              'Permanent celebration link that never expires',
              'Safe for 50th anniversaries, weddings, and milestones',
              'Revisit joyful smiles anytime on any device'
            ],
            cta: 'Preserve Forever with VIP'
          };

        default:
          return {
            title: 'Unlock VIP Magic Pass',
            badge: 'VIP ACCESS',
            subtitle: 'Get unlimited access to all templates, advanced themes, audio, and lifetime memories.',
            bullets: [
              'All current and future VIP templates',
              '16 photos, voice notes, and custom MP3 music',
              'Permanent link & zero platform watermark'
            ],
            cta: 'Unlock VIP Pass • ₹49'
          };
      }
    }
  };

  window.WishFeatureAccess = WishFeatureAccess;

})(typeof window !== 'undefined' ? window : globalThis);
