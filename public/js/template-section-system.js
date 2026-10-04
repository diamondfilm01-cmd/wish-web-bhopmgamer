/**
 * WishMagic Advanced Template Section & Content System
 * Part 12: Capability-driven Section Registry, Normalizer, Validation, and Dynamic Content Engine
 */

(function(window) {
  'use strict';

  // =========================================================================
  // 1. STANDARD SECTION REGISTRY & DEFINITIONS
  // =========================================================================

  const STANDARD_SECTIONS = [
    {
      id: 'hero',
      type: 'hero',
      label: 'Hero Greeting & Unboxing',
      description: 'The showstopping entry point with 3D unboxing, candle blowing, or wax seal unsealing.',
      icon: 'celebration',
      required: true,
      enabledByDefault: true,
      order: 1,
      isPremium: false,
      capabilities: ['interactive-3d', 'envelope-seal', 'midnight-clock', 'cinematic-photo', 'split-card'],
      supportedLayouts: ['centered', 'split', 'fullscreen', 'floating-card'],
      defaultLayout: 'centered',
      fields: ['recipient_name', 'sender_name', 'cover_photo', 'event_date']
    },
    {
      id: 'message',
      type: 'special_message',
      label: 'Heartfelt Dedication Letter',
      description: 'Personal heartfelt letter presented on luxury textured parchment or luminous frosted glass.',
      icon: 'mail',
      required: true,
      enabledByDefault: true,
      order: 2,
      isPremium: false,
      capabilities: ['rich-typography', 'handwritten-signoff', 'wax-seal-badge'],
      supportedLayouts: ['letter-card', 'parchment', 'minimal-glow', 'quote-banner'],
      defaultLayout: 'letter-card',
      fields: ['custom_message', 'sender_name']
    },
    {
      id: 'gallery',
      type: 'photo_gallery',
      label: 'Keepsake Photo Gallery',
      description: 'Treasured memories displayed in high-resolution photo frames with lightbox zooming.',
      icon: 'photo_library',
      required: false,
      enabledByDefault: true,
      order: 3,
      isPremium: false,
      capabilities: ['grid', 'polaroid', 'masonry', 'filmstrip', 'carousel', 'lightbox'],
      supportedLayouts: ['grid', 'polaroid', 'masonry', 'filmstrip', 'carousel'],
      defaultLayout: 'polaroid',
      fields: ['photos']
    },
    {
      id: 'memories',
      type: 'memories',
      label: 'Cherished Memories Reel',
      description: 'Story cards highlighting unforgettable second-by-second moments with captions.',
      icon: 'auto_stories',
      required: false,
      enabledByDefault: true,
      order: 4,
      isPremium: false,
      capabilities: ['captioned-cards', 'date-badges'],
      supportedLayouts: ['card-stack', 'horizontal-reel', 'compact-list'],
      defaultLayout: 'card-stack',
      fields: ['photos']
    },
    {
      id: 'timeline',
      type: 'timeline',
      label: 'Our Story Timeline',
      description: 'Interactive chronological journey through special milestones, dates, and milestones.',
      icon: 'timeline',
      required: false,
      enabledByDefault: false,
      order: 5,
      isPremium: false,
      capabilities: ['milestone-nodes', 'glowing-line', 'date-tags'],
      supportedLayouts: ['vertical-stepper', 'alternating-cards'],
      defaultLayout: 'vertical-stepper',
      fields: ['timeline']
    },
    {
      id: 'countdown',
      type: 'countdown',
      label: 'Occasion Day Pulse & Countdown',
      description: 'Live countdown timer leading up to the exact celebration day in Asia/Kolkata timezone.',
      icon: 'timer',
      required: false,
      enabledByDefault: true,
      order: 6,
      isPremium: false,
      capabilities: ['live-seconds', 'ist-timezone', 'midnight-transition'],
      supportedLayouts: ['pill-grid', 'compact-badge', 'circular-dials'],
      defaultLayout: 'pill-grid',
      fields: ['event_date']
    },
    {
      id: 'voice',
      type: 'voice_note',
      label: 'Personal Voice Dedication',
      description: 'Recorded or uploaded voice dedication note with live pulsing audio equalizer waveform.',
      icon: 'mic',
      required: false,
      enabledByDefault: false,
      order: 7,
      isPremium: false,
      capabilities: ['waveform-equalizer', 'audio-recorder', 'play-controls'],
      supportedLayouts: ['wave-card', 'compact-player', 'floating-bubble'],
      defaultLayout: 'wave-card',
      fields: ['voice_note']
    },
    {
      id: 'open_when',
      type: 'open_when',
      label: 'Surprise "Open When" Envelopes',
      description: 'Interactive sealed envelopes that recipient taps to open (e.g. "Open when you miss me").',
      icon: 'mark_email_unread',
      required: false,
      enabledByDefault: false,
      order: 8,
      isPremium: true,
      capabilities: ['interactive-flip', 'letter-reveal', 'multi-cards'],
      supportedLayouts: ['envelope-grid', 'fan-deck'],
      defaultLayout: 'envelope-grid',
      fields: ['open_when_cards']
    },
    {
      id: 'secret_message',
      type: 'secret_message',
      label: 'Hidden Secret Message',
      description: 'A confidential surprise note hidden behind an interactive scratch-off layer or tap-to-reveal seal.',
      icon: 'lock',
      required: false,
      enabledByDefault: false,
      order: 9,
      isPremium: true,
      capabilities: ['scratch-canvas', 'tap-unseal', 'passcode-unlock'],
      supportedLayouts: ['scratch-card', 'wax-seal-vault', 'shimmer-box'],
      defaultLayout: 'scratch-card',
      fields: ['secret_title', 'secret_text', 'secret_hint', 'secret_reveal_type']
    },
    {
      id: 'finale',
      type: 'final_surprise',
      label: 'Grand Celebration Finale',
      description: 'Explosive confetti physics, floating celebration balloons, and a joyful closing cheer.',
      icon: 'party_mode',
      required: false,
      enabledByDefault: true,
      order: 10,
      isPremium: false,
      capabilities: ['canvas-confetti', 'fireworks', 'replay-trigger'],
      supportedLayouts: ['festive-banner', 'floating-card', 'cinematic-full'],
      defaultLayout: 'festive-banner',
      fields: ['finale_title', 'finale_message', 'finale_btn_text']
    }
  ];

  // =========================================================================
  // 2. TEMPLATE DEFINITION SERVICE
  // =========================================================================

  const WishTemplateDefinitionService = {
    /**
     * Normalize a template definition into standard capability & section schema
     * Supports both modern definitions and legacy templates
     */
    normalizeTemplateDefinition(rawTemplate) {
      if (!rawTemplate) return null;

      const tpl = { ...rawTemplate };
      const templateId = tpl.id || 'tpl_glitter_birthday';
      const templateName = tpl.name || 'Personalized Celebration';
      const category = tpl.category || 'Birthday';
      const isVip = tpl.tier === 'vip' || tpl.isPremium === true || (Number(tpl.price) > 0);

      // 1. Capabilities Matrix Normalization
      const caps = {
        hero: true,
        gallery: true,
        message: true,
        memories: true,
        timeline: Boolean(tpl.capabilities?.timeline || tpl.supportsTimeline || templateId.includes('chronicles') || templateId.includes('tribute')),
        music: tpl.capabilities?.music !== false,
        voiceNote: tpl.capabilities?.voiceNote !== false && tpl.supportsVoice !== false,
        countdown: tpl.capabilities?.countdown !== false && (templateId.includes('countdown') || templateName.toLowerCase().includes('countdown') || category.toLowerCase().includes('birthday') || category.toLowerCase().includes('anniversary')),
        openWhen: Boolean(tpl.capabilities?.openWhen || tpl.supportsOpenWhen || templateId.includes('romantic') || templateId.includes('scrapbook')),
        secretMessage: tpl.capabilities?.secretMessage !== false,
        finalSurprise: tpl.capabilities?.finalSurprise !== false,
        galleryLayouts: tpl.capabilities?.galleryLayouts !== false,
        themeSupport: tpl.capabilities?.themeSupport !== false,
        animationSupport: tpl.capabilities?.animationSupport !== false,
        backgroundSupport: tpl.capabilities?.backgroundSupport !== false,
        ...(tpl.capabilities || {})
      };

      // 2. Derive Supported Sections for this template
      const supportedSections = [];

      STANDARD_SECTIONS.forEach(std => {
        let isSupported = false;

        if (std.id === 'hero' || std.id === 'message') {
          isSupported = true;
        } else if (std.id === 'gallery') {
          isSupported = caps.gallery !== false;
        } else if (std.id === 'memories') {
          isSupported = caps.memories !== false;
        } else if (std.id === 'timeline') {
          isSupported = caps.timeline === true;
        } else if (std.id === 'countdown') {
          isSupported = caps.countdown !== false;
        } else if (std.id === 'voice') {
          isSupported = caps.voiceNote !== false;
        } else if (std.id === 'open_when') {
          isSupported = caps.openWhen === true;
        } else if (std.id === 'secret_message') {
          isSupported = caps.secretMessage !== false;
        } else if (std.id === 'finale') {
          isSupported = caps.finalSurprise !== false;
        }

        if (isSupported) {
          // Check if template overrides section configuration
          const override = Array.isArray(tpl.sectionDefinitions)
            ? tpl.sectionDefinitions.find(s => s.id === std.id || s.type === std.type)
            : null;

          supportedSections.push({
            ...std,
            ...(override || {}),
            enabledByDefault: override?.enabledByDefault !== undefined ? override.enabledByDefault : std.enabledByDefault,
            required: std.required || Boolean(override?.required),
            isPremium: std.isPremium || Boolean(override?.isPremium)
          });
        }
      });

      // 3. Supported Layouts per section
      const layouts = {
        gallery: ['grid', 'polaroid', 'masonry', 'filmstrip', 'carousel'],
        hero: ['centered', 'split', 'fullscreen'],
        timeline: ['vertical-stepper', 'alternating-cards'],
        open_when: ['envelope-grid', 'fan-deck'],
        secret_message: ['scratch-card', 'wax-seal-vault', 'shimmer-box'],
        ...(tpl.layouts || {})
      };

      // 4. Detected & Standard Fields
      const standardFields = [
        { key: 'recipient_name', label: 'Recipient Name', type: 'text', required: true, defaultValue: 'Someone Special' },
        { key: 'sender_name', label: 'Sender Name', type: 'text', required: true, defaultValue: 'A Special Friend' },
        { key: 'custom_message', label: 'Heartfelt Message', type: 'textarea', required: false, defaultValue: 'May your day sparkle with joy and boundless happiness!' },
        { key: 'event_date', label: 'Special Date', type: 'date', required: true, defaultValue: new Date().toISOString().split('T')[0] },
        { key: 'cover_photo', label: 'Cover Photo', type: 'image', required: false, defaultValue: tpl.thumbnail || '/assets/file_ab2082.png' }
      ];

      return {
        ...tpl,
        templateVersion: tpl.templateVersion || 1,
        tier: isVip ? 'vip' : 'free',
        isPremium: isVip,
        price: isVip ? (Number(tpl.price) || 49) : 0,
        capabilities: caps,
        supportedSections: supportedSections,
        layouts: layouts,
        detectedFields: Array.isArray(tpl.detectedFields) && tpl.detectedFields.length > 0 ? tpl.detectedFields : standardFields
      };
    },

    /**
     * Get all supported sections for a given template
     */
    getTemplateSections(template) {
      const normalized = this.normalizeTemplateDefinition(template);
      return normalized ? normalized.supportedSections : STANDARD_SECTIONS;
    },

    /**
     * Check if a template supports a specific section type or ID
     */
    isSectionSupported(template, sectionIdOrType) {
      const sections = this.getTemplateSections(template);
      return sections.some(s => s.id === sectionIdOrType || s.type === sectionIdOrType);
    },

    /**
     * Validate template configuration before save / publish (Admin)
     */
    validateTemplate(template) {
      const errors = [];
      const warnings = [];

      if (!template) {
        return { valid: false, errors: ['Template object is required'], warnings: [] };
      }

      if (!template.name || !template.name.trim()) {
        errors.push('Template name / title is required.');
      }

      if (!template.category || !template.category.trim()) {
        errors.push('Occasion category is required.');
      }

      if (template.tier === 'vip' && (!template.price || Number(template.price) <= 0)) {
        errors.push('VIP Pass templates must have a valid price greater than ₹0 (e.g. ₹49).');
      }

      if (template.capabilities) {
        if (template.capabilities.timeline && (!template.supportedSections?.some(s => s.id === 'timeline') && !STANDARD_SECTIONS.some(s => s.id === 'timeline'))) {
          warnings.push('Timeline capability is active but timeline section renderer is unmapped.');
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };
    }
  };

  // =========================================================================
  // 3. CONTENT & SECTION NORMALIZER (Backward Compatible Engine)
  // =========================================================================

  const WishContentNormalizer = {
    /**
     * Normalizes a wish customData or wish record into unified structured section model
     * Fully preserves backward compatibility with older wishes
     */
    normalizeWishContent(wishOrCustomData, template) {
      if (!wishOrCustomData) return this.getDefaultCustomData(template);

      const customData = wishOrCustomData.customData || wishOrCustomData;
      const normalizedTpl = WishTemplateDefinitionService.normalizeTemplateDefinition(template);
      const supportedSections = normalizedTpl ? normalizedTpl.supportedSections : STANDARD_SECTIONS;

      // 1. Recipient & Core Details
      const recipientName = customData.recipient_name || customData.recipientName || 'Someone Special';
      const senderName = customData.sender_name || customData.senderName || 'A Special Friend';
      const senderContact = customData.sender_contact || customData.senderContact || '';
      const eventDate = customData.event_date || customData.eventDate || new Date().toISOString().split('T')[0];
      const customMessage = customData.custom_message || customData.customMessage || 'May your day sparkle with joy and boundless happiness!';
      const coverPhoto = customData.cover_photo || customData.coverPhoto || customData.photo_1 || (customData.photos && customData.photos[0] ? (customData.photos[0].src || customData.photos[0].url) : '') || '/assets/file_ab2082.png';

      // 2. Photos & Media Normalization
      let photos = [];
      if (Array.isArray(customData.photos) && customData.photos.length > 0) {
        photos = customData.photos.map((p, i) => {
          if (typeof p === 'string') {
            return { id: `photo_${i + 1}`, url: p, src: p, name: `Memory #${i + 1}`, isCover: i === 0 };
          }
          return {
            id: p.id || `photo_${i + 1}`,
            url: p.url || p.src || '',
            src: p.src || p.url || '',
            name: p.name || `Memory #${i + 1}`,
            caption: p.caption || '',
            isCover: Boolean(p.isCover || i === 0)
          };
        });
      } else if (coverPhoto) {
        photos = [{ id: 'photo_1', url: coverPhoto, src: coverPhoto, name: 'Cover Memory Photo', isCover: true }];
      }

      // 3. Audio & Music
      const music = {
        enabled: customData.music?.enabled !== false && (customData.media?.music?.enabled !== false),
        type: customData.media?.music?.type || customData.music?.type || 'curated',
        trackId: customData.media?.music?.trackId || customData.music?.trackId || 'celebration-strings',
        name: customData.media?.music?.name || customData.music?.name || customData.music?.title || 'Celebration Acoustic Strings',
        src: customData.media?.music?.src || customData.music?.src || '',
        duration: customData.media?.music?.duration || customData.music?.duration || '2:40'
      };

      // 4. Voice Note
      const voiceNote = {
        enabled: Boolean(customData.voice_note?.enabled || customData.media?.voiceNote?.enabled),
        src: customData.voice_note?.src || customData.voice_note?.url || customData.media?.voiceNote?.src || customData.media?.voiceNote?.url || '',
        url: customData.voice_note?.src || customData.voice_note?.url || customData.media?.voiceNote?.src || customData.media?.voiceNote?.url || '',
        duration: customData.voice_note?.duration || customData.media?.voiceNote?.duration || 'Spoken Note'
      };

      // 5. Timeline Milestones
      const defaultTimeline = [
        { id: 'm1', date: 'The Beginning', title: 'When Our Paths Crossed', description: 'The unforgettable start of our beautiful journey and friendship.' },
        { id: 'm2', date: 'Milestone Moment', title: 'Laughter & Adventures', description: 'Countless memories, late-night talks, and endless smiles shared together.' },
        { id: 'm3', date: 'Today & Beyond', title: 'Celebrating You', description: 'Wishing you the happiest celebration today and wonderful memories ahead.' }
      ];
      const timeline = Array.isArray(customData.timeline) && customData.timeline.length > 0
        ? customData.timeline
        : (customData.sectionData?.timeline?.items || defaultTimeline);

      // 6. Open When Surprise Envelopes
      const defaultOpenWhen = [
        { id: 'ow1', title: 'Open when you need a smile 😊', icon: 'sentiment_very_satisfied', color: '#ec4899', message: 'Remember that you bring so much sunshine into everyone’s life! Never forget how truly wonderful and appreciated you are.' },
        { id: 'ow2', title: 'Open when you miss me 💖', icon: 'favorite', color: '#8b5cf6', message: 'Distance means so little when friendship and love mean so much. I am always just a phone call or a heartbeat away.' },
        { id: 'ow3', title: 'Open on your actual special day 🎂', icon: 'cake', color: '#f59e0b', message: 'Happy, happy special day! May all your biggest dreams and wishes take flight this year.' }
      ];
      const openWhenCards = Array.isArray(customData.open_when_cards) && customData.open_when_cards.length > 0
        ? customData.open_when_cards
        : (customData.sectionData?.open_when?.cards || defaultOpenWhen);

      // 7. Secret Message
      const secretMessage = {
        title: customData.secret_message?.title || customData.sectionData?.secret_message?.title || 'A Secret Surprise Just For You 🤫',
        secretText: customData.secret_message?.secretText || customData.sectionData?.secret_message?.secretText || customData.secretMessage || 'You are one of the most incredible people in my world, and today is all about celebrating your magic!',
        hint: customData.secret_message?.hint || customData.sectionData?.secret_message?.hint || 'Scratch the card or tap the seal to unwrap!',
        revealType: customData.secret_message?.revealType || customData.sectionData?.secret_message?.revealType || 'scratch'
      };

      // 8. Finale Surprise
      const finaleSurprise = {
        title: customData.finale?.title || customData.sectionData?.finale?.title || 'May All Your Wishes Come True! 🌟',
        message: customData.finale?.message || customData.sectionData?.finale?.message || `Sent with boundless affection from ${senderName} for ${recipientName}.`,
        buttonText: customData.finale?.buttonText || customData.sectionData?.finale?.buttonText || 'Celebrate Again 🎊',
        explosionType: customData.finale?.explosionType || customData.sectionData?.finale?.explosionType || 'confetti'
      };

      // 9. Structured Section Instances Normalization
      const existingSections = Array.isArray(customData.sections) ? customData.sections : [];
      const normalizedSections = [];

      supportedSections.forEach((def, index) => {
        const existing = existingSections.find(s => s.id === def.id || s.type === def.type);

        const isEnabled = existing
          ? (def.required ? true : Boolean(existing.enabled))
          : (def.required ? true : Boolean(def.enabledByDefault));

        const order = existing && typeof existing.order === 'number'
          ? existing.order
          : (index + 1);

        const layout = existing?.layout || def.defaultLayout || 'default';

        let sectionData = existing?.data || {};
        if (def.id === 'timeline') sectionData = { items: timeline, ...sectionData };
        if (def.id === 'open_when') sectionData = { cards: openWhenCards, ...sectionData };
        if (def.id === 'secret_message') sectionData = { ...secretMessage, ...sectionData };
        if (def.id === 'finale') sectionData = { ...finaleSurprise, ...sectionData };
        if (def.id === 'gallery') sectionData = { layout: customData.gallery_layout || layout, ...sectionData };

        normalizedSections.push({
          id: def.id,
          type: def.type,
          name: def.label,
          label: def.label,
          description: def.description,
          icon: def.icon,
          required: Boolean(def.required),
          enabled: isEnabled,
          order: order,
          isPremium: Boolean(def.isPremium),
          layout: layout,
          supportedLayouts: def.supportedLayouts || [],
          data: sectionData
        });
      });

      // Sort sections by user configured order
      normalizedSections.sort((a, b) => a.order - b.order);

      // 10. Theme Configuration
      const themeKey = customData.theme || 'magical';
      const colors = {
        primary: customData.colors?.primary || '#ec4899',
        secondary: customData.colors?.secondary || '#8b5cf6',
        accent: customData.colors?.accent || '#fbbf24',
        text: customData.colors?.text || '#ffffff'
      };

      return {
        recipient_name: recipientName,
        recipientName: recipientName,
        sender_name: senderName,
        senderName: senderName,
        sender_contact: senderContact,
        event_date: eventDate,
        eventDate: eventDate,
        custom_message: customMessage,
        customMessage: customMessage,
        cover_photo: coverPhoto,
        photo_1: coverPhoto,
        photos: photos,
        music: music,
        voice_note: voiceNote,
        timeline: timeline,
        open_when_cards: openWhenCards,
        secret_message: secretMessage,
        finale: finaleSurprise,
        theme: themeKey,
        font: customData.font || 'modern',
        background: customData.background || 'gradient',
        colors: colors,
        surfaces: customData.surfaces || { style: 'glass', blur: '18px', radiusPx: '22px' },
        buttons: customData.buttons || { style: 'gradient', radiusPx: '9999px' },
        effects: customData.effects || { master: true, glow: true, confetti: true, particles: true, particleType: 'sparkles' },
        media: {
          coverPhoto: coverPhoto,
          photos: photos,
          music: music,
          voiceNote: voiceNote,
          galleryLayout: customData.media?.galleryLayout || customData.gallery_layout || 'polaroid'
        },
        sections: normalizedSections,
        sectionData: {
          timeline: { items: timeline },
          open_when: { cards: openWhenCards },
          secret_message: secretMessage,
          finale: finaleSurprise
        },
        lifetimePreservation: Boolean(customData.lifetimePreservation),
        watermarkRemoved: Boolean(customData.watermarkRemoved)
      };
    },

    /**
     * Get pristine default customData for a new template
     */
    getDefaultCustomData(template) {
      const normalizedTpl = WishTemplateDefinitionService.normalizeTemplateDefinition(template);
      const supported = normalizedTpl ? normalizedTpl.supportedSections : STANDARD_SECTIONS;

      const sections = supported.map((def, idx) => ({
        id: def.id,
        type: def.type,
        name: def.label,
        label: def.label,
        description: def.description,
        icon: def.icon,
        required: Boolean(def.required),
        enabled: def.required ? true : Boolean(def.enabledByDefault),
        order: idx + 1,
        isPremium: Boolean(def.isPremium),
        layout: def.defaultLayout || 'default',
        supportedLayouts: def.supportedLayouts || [],
        data: {}
      }));

      return {
        recipient_name: 'Priya Sharma',
        sender_name: 'Rohan & Friends',
        sender_contact: '',
        event_date: new Date().toISOString().split('T')[0],
        custom_message: 'May your day sparkle with joy and boundless happiness!',
        cover_photo: (template && template.thumbnail) || '/assets/file_ab2082.png',
        photo_1: (template && template.thumbnail) || '/assets/file_ab2082.png',
        photos: [
          { id: 'p1', url: '/assets/file_ab2082.png', src: '/assets/file_ab2082.png', name: 'Celebration Memories', isCover: true }
        ],
        music: {
          enabled: true,
          type: 'curated',
          trackId: 'celebration-strings',
          name: 'Celebration Acoustic Strings',
          src: '',
          duration: '2:40'
        },
        voice_note: { enabled: false, src: '', url: '', duration: '0:00' },
        timeline: [
          { id: 'm1', date: 'The Beginning', title: 'When Our Paths Crossed', description: 'The unforgettable start of our beautiful journey and friendship.' },
          { id: 'm2', date: 'Milestone Moment', title: 'Laughter & Adventures', description: 'Countless memories, late-night talks, and endless smiles shared together.' },
          { id: 'm3', date: 'Today & Beyond', title: 'Celebrating You', description: 'Wishing you the happiest celebration today and wonderful memories ahead.' }
        ],
        open_when_cards: [
          { id: 'ow1', title: 'Open when you need a smile 😊', icon: 'sentiment_very_satisfied', color: '#ec4899', message: 'Remember that you bring so much sunshine into everyone’s life! Never forget how truly wonderful and appreciated you are.' },
          { id: 'ow2', title: 'Open when you miss me 💖', icon: 'favorite', color: '#8b5cf6', message: 'Distance means so little when friendship and love mean so much. I am always just a phone call or a heartbeat away.' },
          { id: 'ow3', title: 'Open on your actual special day 🎂', icon: 'cake', color: '#f59e0b', message: 'Happy, happy special day! May all your biggest dreams and wishes take flight this year.' }
        ],
        secret_message: {
          title: 'A Secret Surprise Just For You 🤫',
          secretText: 'You are one of the most incredible people in my world, and today is all about celebrating your magic!',
          hint: 'Scratch the card or tap the seal to unwrap!',
          revealType: 'scratch'
        },
        finale: {
          title: 'May All Your Wishes Come True! 🌟',
          message: 'Sent with boundless affection for someone extraordinary.',
          buttonText: 'Celebrate Again 🎊',
          explosionType: 'confetti'
        },
        theme: 'magical',
        font: 'modern',
        background: 'gradient',
        colors: { primary: '#ec4899', secondary: '#8b5cf6', accent: '#fbbf24', text: '#ffffff' },
        surfaces: { style: 'glass', blur: '18px', radiusPx: '22px' },
        buttons: { style: 'gradient', radiusPx: '9999px' },
        effects: { master: true, glow: true, confetti: true, particles: true, particleType: 'sparkles' },
        media: {
          coverPhoto: (template && template.thumbnail) || '/assets/file_ab2082.png',
          photos: [{ id: 'p1', url: '/assets/file_ab2082.png', src: '/assets/file_ab2082.png', name: 'Celebration Memories', isCover: true }],
          music: { enabled: true, type: 'curated', trackId: 'celebration-strings', name: 'Celebration Acoustic Strings' },
          voiceNote: { enabled: false, src: '' },
          galleryLayout: 'polaroid'
        },
        sections: sections,
        lifetimePreservation: false,
        watermarkRemoved: false
      };
    }
  };

  // =========================================================================
  // 4. FIELD VALIDATOR & REQ ENGINE
  // =========================================================================

  const WishFieldValidator = {
    validateWishState(customData, template) {
      const errors = [];
      const warnings = [];

      if (!customData) {
        return { valid: false, errors: ['Custom data is required'], warnings: [] };
      }

      // 1. Recipient Name
      if (!customData.recipient_name || !customData.recipient_name.trim()) {
        errors.push({ field: 'recipient_name', message: 'Recipient name is required' });
      }

      // 2. Special Date
      if (!customData.event_date) {
        errors.push({ field: 'event_date', message: 'Celebration date is required' });
      }

      // 3. Photos
      const photos = customData.photos || [];
      if (template && template.requiresPhotos && photos.length === 0) {
        errors.push({ field: 'photos', message: 'This template requires at least 1 memory photo' });
      }

      // 4. Timeline
      const timelineSec = (customData.sections || []).find(s => s.id === 'timeline');
      if (timelineSec && timelineSec.enabled) {
        const timeline = customData.timeline || [];
        if (timeline.length === 0) {
          warnings.push({ field: 'timeline', message: 'Timeline section is active but contains 0 milestones' });
        }
      }

      // 5. Open When
      const openWhenSec = (customData.sections || []).find(s => s.id === 'open_when');
      if (openWhenSec && openWhenSec.enabled) {
        const cards = customData.open_when_cards || [];
        if (cards.length === 0) {
          warnings.push({ field: 'open_when', message: 'Open When section is active but has no envelopes' });
        }
      }

      // 6. Secret Message
      const secretSec = (customData.sections || []).find(s => s.id === 'secret_message');
      if (secretSec && secretSec.enabled) {
        if (!customData.secret_message?.secretText || !customData.secret_message.secretText.trim()) {
          warnings.push({ field: 'secret_message', message: 'Secret message text is empty' });
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };
    }
  };

  // Export to Global Namespace
  window.WishSectionRegistry = {
    STANDARD_SECTIONS,
    getById(id) {
      return STANDARD_SECTIONS.find(s => s.id === id || s.type === id) || null;
    }
  };

  window.WishTemplateDefinitionService = WishTemplateDefinitionService;
  window.WishContentNormalizer = WishContentNormalizer;
  window.WishFieldValidator = WishFieldValidator;

})(window);
