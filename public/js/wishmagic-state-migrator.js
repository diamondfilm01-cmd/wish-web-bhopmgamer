/**
 * WishMagic Template Switching & State Migration System (Part 15)
 * =============================================================
 * Standardized, schema-driven state migration and template switching engine.
 *
 * Ensures seamless transitions between templates without data loss,
 * preserving compatible user input in the active projection while safely
 * holding unsupported capabilities in the Canonical Wish Data store.
 *
 * Architecture:
 * Canonical Wish Data (Universal Store)
 *          │
 *          ├───> [Target Schema Analyzer / Capabilities]
 *          │              │
 *          │              ▼
 *          ├───> [State Migration Engine]
 *          │              │
 *          ▼              ▼
 * Active Template Projection (Bound State) ───> Template Sandbox / Preview / Customizer
 */

(function (global) {
  'use strict';

  // Semantic Standard Key Groups for Intelligent Mapping
  const SEMANTIC_KEY_GROUPS = {
    recipient: [
      'recipient_name', 'recipientName', 'recipient', 'to_name', 'toName',
      'receiver_name', 'receiverName', 'for', 'celebrant', 'celebrant_name', 'celebrantName', 'target_name'
    ],
    sender: [
      'sender_name', 'senderName', 'sender', 'from_name', 'fromName',
      'buyer_name', 'buyerName', 'creator_name', 'creatorName', 'author', 'giver'
    ],
    senderContact: [
      'sender_contact', 'senderContact', 'contact_number', 'contactNumber', 'phone', 'email'
    ],
    message: [
      'custom_message', 'customMessage', 'message', 'letter_body', 'letterBody',
      'wish_message', 'wishMessage', 'dedication', 'body', 'content', 'note', 'greeting'
    ],
    date: [
      'event_date', 'eventDate', 'target_date', 'targetDate', 'date',
      'celebration_date', 'celebrationDate', 'birthday_date', 'birthdayDate'
    ],
    time: [
      'event_time', 'eventTime', 'time', 'target_time', 'targetTime', 'clock_time'
    ],
    occasion: [
      'occasion', 'event_type', 'eventType', 'category', 'celebration_type', 'celebrationType'
    ],
    relationship: [
      'relationship', 'relation', 'connection', 'bond'
    ],
    coverPhoto: [
      'cover_photo', 'coverPhoto', 'photo_1', 'photo1', 'main_photo', 'mainPhoto',
      'hero_image', 'heroImage', 'avatar', 'featured_image'
    ]
  };

  /**
   * Helper: Find matching semantic key group
   */
  function findSemanticGroup(key) {
    if (!key || typeof key !== 'string') return null;
    const cleanKey = key.trim().toLowerCase();
    for (const [groupName, aliases] of Object.entries(SEMANTIC_KEY_GROUPS)) {
      if (aliases.some(alias => alias.toLowerCase() === cleanKey)) {
        return groupName;
      }
    }
    return null;
  }

  /**
   * Helper: Deep clone JSON-compatible structure
   */
  function deepClone(obj) {
    if (obj === undefined || obj === null) return obj;
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      if (Array.isArray(obj)) return obj.slice();
      if (typeof obj === 'object') return { ...obj };
      return obj;
    }
  }

  /**
   * Main WishMagic State Migrator Engine
   */
  const WishMagicStateMigrator = {
    version: '1.0.0',

    /**
     * Creates a fresh Canonical Wish Data container
     */
    createCanonicalData(initial = {}) {
      const src = (initial && typeof initial === 'object') ? initial : {};

      const canonical = {
        meta: {
          version: '1.0',
          createdAt: src.meta?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastTemplateId: src.meta?.lastTemplateId || src.templateId || null,
          wishId: src.meta?.wishId || src.id || src.wishId || null,
          slug: src.meta?.slug || src.slug || src.customSlug || null
        },
        content: {},
        media: {
          coverPhoto: null,
          photos: [],
          music: {
            enabled: true,
            type: 'curated',
            name: 'Celebration Acoustic Strings',
            trackId: 'celebration-strings',
            src: '',
            genre: 'Indie Celebration',
            duration: '2:40'
          },
          voiceNote: {
            enabled: false,
            type: 'none',
            name: '',
            src: '',
            duration: 0,
            blob: null
          },
          video: {
            enabled: false,
            src: '',
            poster: '',
            name: ''
          },
          galleryLayout: 'grid'
        },
        sections: {},
        visual: {
          theme: 'magical',
          palette: 'rose-gold',
          colors: {
            primary: '#ec4899',
            secondary: '#8b5cf6',
            accent: '#fbbf24',
            background: 'radial-gradient(circle at 50% 15%, #2a0845 0%, #17042b 55%, #0d0118 100%)',
            surface: 'rgba(255, 255, 255, 0.12)',
            text: '#ffffff',
            mutedText: '#e9d5ff'
          },
          typography: {
            headingFont: 'Outfit, sans-serif',
            bodyFont: 'Plus Jakarta Sans, sans-serif',
            headingWeight: '800',
            pairingId: 'modern'
          },
          surfaces: {
            style: 'glass',
            radius: 'rounded',
            radiusPx: '20px',
            blur: '20px'
          },
          buttons: {
            style: 'gradient',
            radius: 'pill',
            radiusPx: '9999px'
          }
        },
        animations: {
          master: true,
          particles: true,
          particleType: 'sparkles',
          intensity: 'soft',
          speed: 'normal',
          glow: true,
          confetti: true,
          hearts: false,
          fireworks: false
        },
        unsupportedHoldings: {},
        customAttributes: {}
      };

      // Ingest initial properties if supplied
      this.updateCanonical(canonical, src, null);
      return canonical;
    },

    /**
     * Updates canonical store from current editing state and active schema
     */
    updateCanonical(canonicalStore, activeData, schema = null) {
      if (!canonicalStore || typeof canonicalStore !== 'object') return canonicalStore;
      if (!activeData || typeof activeData !== 'object') return canonicalStore;

      canonicalStore.meta = canonicalStore.meta || {};
      canonicalStore.meta.updatedAt = new Date().toISOString();

      // Ingest top-level / flat data attributes or content object
      const flatData = activeData;
      const content = canonicalStore.content || (canonicalStore.content = {});

      // Ingest known standard top-level fields
      const standardKeys = [
        'recipient_name', 'recipientName', 'sender_name', 'senderName',
        'sender_contact', 'senderContact', 'occasion', 'relationship',
        'custom_message', 'customMessage', 'event_date', 'eventDate',
        'event_time', 'eventTime', 'customSlug', 'slug', 'buyerName', 'buyer_name'
      ];

      standardKeys.forEach(k => {
        if (flatData[k] !== undefined && flatData[k] !== null && flatData[k] !== '') {
          content[k] = flatData[k];
          // Mirror canonical semantic aliases for cross-template compatibility
          const group = findSemanticGroup(k);
          if (group) {
            if (group === 'recipient') content.recipient_name = flatData[k];
            if (group === 'sender') content.sender_name = flatData[k];
            if (group === 'message') content.custom_message = flatData[k];
            if (group === 'date') content.event_date = flatData[k];
            if (group === 'time') content.event_time = flatData[k];
            if (group === 'occasion') content.occasion = flatData[k];
            if (group === 'relationship') content.relationship = flatData[k];
          }
        }
      });

      // Ingest flat fields from activeData.content or raw fields
      if (flatData.content && typeof flatData.content === 'object') {
        Object.entries(flatData.content).forEach(([k, v]) => {
          if (v !== undefined && v !== null) {
            content[k] = v;
            const group = findSemanticGroup(k);
            if (group === 'recipient') content.recipient_name = v;
            if (group === 'sender') content.sender_name = v;
            if (group === 'message') content.custom_message = v;
            if (group === 'date') content.event_date = v;
          }
        });
      }

      // Ingest any arbitrary custom key-value pairs
      Object.entries(flatData).forEach(([k, v]) => {
        if (
          !['media', 'sections', 'visual', 'theme', 'themeConfig', 'colors', 'typography',
            'surfaces', 'buttons', 'effects', 'animations', 'meta', 'unsupportedHoldings',
            'customAttributes', 'content'].includes(k) &&
          v !== undefined && v !== null && typeof v !== 'function'
        ) {
          content[k] = v;
        }
      });

      // Ingest Media
      const media = canonicalStore.media || (canonicalStore.media = {});

      // Cover photo
      if (flatData.cover_photo || flatData.coverPhoto || flatData.photo_1) {
        media.coverPhoto = flatData.cover_photo || flatData.coverPhoto || flatData.photo_1;
      }
      if (flatData.media?.coverPhoto) {
        media.coverPhoto = flatData.media.coverPhoto;
      }

      // Photos / Gallery
      if (Array.isArray(flatData.photos) && flatData.photos.length > 0) {
        media.photos = deepClone(flatData.photos);
      } else if (Array.isArray(flatData.media?.photos) && flatData.media.photos.length > 0) {
        media.photos = deepClone(flatData.media.photos);
      }

      // Music
      if (flatData.music && typeof flatData.music === 'object') {
        media.music = { ...media.music, ...flatData.music };
      } else if (flatData.media?.music && typeof flatData.media.music === 'object') {
        media.music = { ...media.music, ...flatData.media.music };
      }

      // Voice Note
      const incomingVoice = flatData.voiceNote || flatData.voice_note;
      if (incomingVoice && typeof incomingVoice === 'object') {
        media.voiceNote = { ...media.voiceNote, ...incomingVoice };
      } else if (flatData.media?.voiceNote && typeof flatData.media.voiceNote === 'object') {
        media.voiceNote = { ...media.voiceNote, ...flatData.media.voiceNote };
      }

      // Video
      if (flatData.video && typeof flatData.video === 'object') {
        media.video = { ...media.video, ...flatData.video };
      } else if (flatData.media?.video && typeof flatData.media.video === 'object') {
        media.video = { ...media.video, ...flatData.media.video };
      }

      // Gallery Layout
      if (flatData.galleryLayout) {
        media.galleryLayout = flatData.galleryLayout;
      } else if (flatData.media?.galleryLayout) {
        media.galleryLayout = flatData.media.galleryLayout;
      }

      // Ingest Sections
      const sections = canonicalStore.sections || (canonicalStore.sections = {});
      if (Array.isArray(flatData.sections)) {
        flatData.sections.forEach((sec, idx) => {
          if (sec && sec.id) {
            sections[sec.id] = {
              ...sec,
              id: sec.id,
              name: sec.name || sec.title || sec.id,
              enabled: sec.enabled !== false,
              order: sec.order !== undefined ? sec.order : idx,
              customConfig: sec.customConfig || sec.config || {}
            };
          }
        });
      } else if (flatData.sections && typeof flatData.sections === 'object') {
        Object.entries(flatData.sections).forEach(([id, sec]) => {
          if (typeof sec === 'boolean') {
            sections[id] = { id, enabled: sec, order: Object.keys(sections).length };
          } else if (sec && typeof sec === 'object') {
            sections[id] = {
              ...sec,
              id: sec.id || id,
              name: sec.name || sec.title || id,
              enabled: sec.enabled !== false,
              order: sec.order !== undefined ? sec.order : Object.keys(sections).length,
              customConfig: sec.customConfig || sec.config || {}
            };
          }
        });
      }

      // Ingest Visual / Theme
      const visual = canonicalStore.visual || (canonicalStore.visual = {});
      if (flatData.theme) visual.theme = flatData.theme;
      if (flatData.visual?.theme) visual.theme = flatData.visual.theme;
      if (flatData.activePalette || flatData.palette) visual.palette = flatData.activePalette || flatData.palette;
      if (flatData.visual?.palette) visual.palette = flatData.visual.palette;
      if (flatData.colors && typeof flatData.colors === 'object') {
        visual.colors = { ...visual.colors, ...flatData.colors };
      }
      if (flatData.visual?.colors && typeof flatData.visual.colors === 'object') {
        visual.colors = { ...visual.colors, ...flatData.visual.colors };
      }
      if (flatData.typography && typeof flatData.typography === 'object') {
        visual.typography = { ...visual.typography, ...flatData.typography };
      }
      if (flatData.visual?.typography && typeof flatData.visual.typography === 'object') {
        visual.typography = { ...visual.typography, ...flatData.visual.typography };
      }
      if (flatData.surfaces && typeof flatData.surfaces === 'object') {
        visual.surfaces = { ...visual.surfaces, ...flatData.surfaces };
      }
      if (flatData.visual?.surfaces && typeof flatData.visual.surfaces === 'object') {
        visual.surfaces = { ...visual.surfaces, ...flatData.visual.surfaces };
      }
      if (flatData.buttons && typeof flatData.buttons === 'object') {
        visual.buttons = { ...visual.buttons, ...flatData.buttons };
      }
      if (flatData.visual?.buttons && typeof flatData.visual.buttons === 'object') {
        visual.buttons = { ...visual.buttons, ...flatData.visual.buttons };
      }

      // Ingest Animations / Effects
      const animations = canonicalStore.animations || (canonicalStore.animations = {});
      if (flatData.effects && typeof flatData.effects === 'object') {
        Object.assign(animations, flatData.effects);
      }
      if (flatData.animations && typeof flatData.animations === 'object') {
        Object.assign(animations, flatData.animations);
      }

      return canonicalStore;
    },

    /**
     * Performs a state migration from canonical store / source data into target schema
     */
    migrate({ canonicalData, canonicalStore, currentData = null, sourceSchema = null, targetSchema = null, options = {} }) {
      // 1. Ensure canonical data store is up-to-date
      let canonical = (canonicalData || canonicalStore) ? deepClone(canonicalData || canonicalStore) : null;
      if (!canonical) {
        canonical = this.createCanonicalData(currentData || {});
      } else if (currentData) {
        this.updateCanonical(canonical, currentData, sourceSchema);
      }

      const normalizedTarget = this.normalizeSchema(targetSchema);

      const preserved = [];
      const adapted = [];
      const unsupported = [];
      const initialized = [];
      const warnings = [];

      // 2. Project & Map Content Fields
      const projectedContent = {};
      const targetFields = normalizedTarget.fields || [];

      // Group available canonical keys
      const availableContentKeys = Object.keys(canonical.content || {});
      const mappedCanonicalKeys = new Set();

      targetFields.forEach(targetField => {
        const fieldKey = targetField.key || targetField.id;
        const fieldType = targetField.type || 'text';
        const defaultValue = targetField.defaultValue !== undefined ? targetField.defaultValue : '';

        // Match Strategy A: Exact field key match
        let foundValue = undefined;
        let matchedKey = null;

        if (canonical.content[fieldKey] !== undefined && canonical.content[fieldKey] !== null) {
          foundValue = canonical.content[fieldKey];
          matchedKey = fieldKey;
        }

        // Match Strategy B: Semantic group match
        if (foundValue === undefined) {
          const targetGroup = findSemanticGroup(fieldKey);
          if (targetGroup) {
            const aliases = SEMANTIC_KEY_GROUPS[targetGroup];
            for (const alias of aliases) {
              if (canonical.content[alias] !== undefined && canonical.content[alias] !== null && canonical.content[alias] !== '') {
                foundValue = canonical.content[alias];
                matchedKey = alias;
                break;
              }
            }
          }
        }

        // Match Strategy C: Fuzzy prefix / suffix matching (e.g. 'recipient' vs 'recipient_name')
        if (foundValue === undefined) {
          const cleanTargetKey = fieldKey.toLowerCase().replace(/[^a-z0-9]/g, '');
          for (const key of availableContentKeys) {
            const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanKey === cleanTargetKey || cleanTargetKey.includes(cleanKey) || cleanKey.includes(cleanTargetKey)) {
              foundValue = canonical.content[key];
              matchedKey = key;
              break;
            }
          }
        }

        // Apply Value or Default
        if (foundValue !== undefined && foundValue !== null && foundValue !== '') {
          // Type adaptation
          const adaptedValue = this.adaptFieldValue(foundValue, fieldType, targetField);
          projectedContent[fieldKey] = adaptedValue;
          mappedCanonicalKeys.add(matchedKey);

          if (matchedKey === fieldKey && adaptedValue === foundValue) {
            preserved.push({
              key: fieldKey,
              type: fieldType,
              section: targetField.sectionId || 'general',
              value: adaptedValue,
              status: 'preserved'
            });
          } else {
            adapted.push({
              key: fieldKey,
              type: fieldType,
              section: targetField.sectionId || 'general',
              fromKey: matchedKey,
              fromValue: foundValue,
              toValue: adaptedValue,
              reason: matchedKey !== fieldKey ? `Mapped from "${matchedKey}"` : `Type adapted for ${fieldType}`,
              status: 'adapted'
            });
          }
        } else {
          // Initialized with target default
          projectedContent[fieldKey] = defaultValue;
          initialized.push({
            key: fieldKey,
            type: fieldType,
            section: targetField.sectionId || 'general',
            defaultValue: defaultValue,
            status: 'initialized'
          });
        }
      });

      // Track unmapped canonical content fields as unsupported holdings for this template
      availableContentKeys.forEach(k => {
        if (!mappedCanonicalKeys.has(k)) {
          const val = canonical.content[k];
          if (val !== undefined && val !== null && val !== '') {
            unsupported.push({
              key: k,
              type: typeof val,
              section: 'content',
              value: val,
              reason: 'Not present or referenced in target template schema',
              status: 'unsupported'
            });
          }
        }
      });

      // 3. Project & Map Media Capabilities
      const projectedMedia = {
        coverPhoto: canonical.media?.coverPhoto || null,
        photos: [],
        music: deepClone(canonical.media?.music) || { enabled: false },
        voiceNote: deepClone(canonical.media?.voiceNote) || { enabled: false },
        video: deepClone(canonical.media?.video) || { enabled: false },
        galleryLayout: canonical.media?.galleryLayout || 'grid'
      };

      const targetMediaCaps = normalizedTarget.media?.capabilities || normalizedTarget.capabilities?.media || normalizedTarget.media || {};
      const targetMaxPhotos = targetMediaCaps.maxPhotos !== undefined
        ? Number(targetMediaCaps.maxPhotos)
        : (targetMediaCaps.images?.maxCount !== undefined
            ? Number(targetMediaCaps.images.maxCount)
            : (typeof targetMediaCaps.images === 'number'
                ? targetMediaCaps.images
                : (targetMediaCaps.images === false ? 0 : 10)));
      const canonicalPhotos = Array.isArray(canonical.media?.photos) ? canonical.media.photos : [];

      // Map Photos
      if (targetMediaCaps.images !== false && targetMaxPhotos > 0) {
        if (canonicalPhotos.length > 0) {
          projectedMedia.photos = canonicalPhotos.slice(0, targetMaxPhotos);
          if (canonicalPhotos.length > targetMaxPhotos) {
            adapted.push({
              key: 'photos',
              type: 'gallery',
              section: 'media',
              fromValue: `${canonicalPhotos.length} photos`,
              toValue: `${targetMaxPhotos} photos`,
              reason: `Target template supports a maximum of ${targetMaxPhotos} photo${targetMaxPhotos === 1 ? '' : 's'}. Remaining photos saved in your draft.`,
              status: 'adapted'
            });
          } else {
            preserved.push({
              key: 'photos',
              type: 'gallery',
              section: 'media',
              value: `${canonicalPhotos.length} photos`,
              status: 'preserved'
            });
          }
        } else if (canonical.media?.coverPhoto) {
          projectedMedia.photos = [{
            id: 'photo_cover',
            url: canonical.media.coverPhoto,
            src: canonical.media.coverPhoto,
            name: 'Cover Photo',
            isCover: true,
            order: 0
          }];
          preserved.push({
            key: 'coverPhoto',
            type: 'image',
            section: 'media',
            value: canonical.media.coverPhoto,
            status: 'preserved'
          });
        }
      } else {
        if (canonicalPhotos.length > 0 || canonical.media?.coverPhoto) {
          unsupported.push({
            key: 'photos',
            type: 'image',
            section: 'media',
            value: canonicalPhotos.length ? `${canonicalPhotos.length} photos` : 'Cover photo',
            reason: 'Target template does not feature photo keepsakes',
            status: 'unsupported'
          });
        }
      }

      // Map Music
      if (targetMediaCaps.audio === false || targetMediaCaps.music === false) {
        projectedMedia.music.enabled = false;
        if (canonical.media?.music?.enabled) {
          unsupported.push({
            key: 'music',
            type: 'audio',
            section: 'media',
            value: canonical.media.music.name || canonical.media.music.title || 'Soundtrack',
            reason: 'Target template does not support background music',
            status: 'unsupported'
          });
        }
      } else {
        if (canonical.media?.music?.enabled) {
          preserved.push({
            key: 'music',
            type: 'audio',
            section: 'media',
            value: canonical.media.music.name || canonical.media.music.title || 'Soundtrack',
            status: 'preserved'
          });
        }
      }

      // Map Voice Note
      if (targetMediaCaps.voice === false && !normalizedTarget.capabilities?.voice) {
        projectedMedia.voiceNote.enabled = false;
        if (canonical.media?.voiceNote?.enabled || canonical.media?.voiceNote?.src || canonical.media?.voiceNote?.url || canonical.media?.voiceNote?.recordingBlob) {
          unsupported.push({
            key: 'voiceNote',
            type: 'voice',
            section: 'media',
            value: 'Spoken voice dedication note',
            reason: 'Target template does not have a voice player module. Your recording is safely retained in your draft.',
            status: 'unsupported'
          });
        }
      } else {
        if (canonical.media?.voiceNote?.enabled || canonical.media?.voiceNote?.src || canonical.media?.voiceNote?.url) {
          projectedMedia.voiceNote.enabled = true;
          preserved.push({
            key: 'voiceNote',
            type: 'voice',
            section: 'media',
            value: 'Voice dedication note',
            status: 'preserved'
          });
        }
      }

      // 4. Project & Map Sections
      const projectedSections = [];
      const targetSections = normalizedTarget.sections || [];
      const canonicalSections = canonical.sections || {};

      if (targetSections.length > 0) {
        targetSections.forEach((tSec, idx) => {
          const secId = tSec.id || tSec.key;
          const matchCanonical = canonicalSections[secId];

          if (matchCanonical) {
            projectedSections.push({
              id: secId,
              name: tSec.name || tSec.title || matchCanonical.name || secId,
              enabled: matchCanonical.enabled !== false,
              order: tSec.order !== undefined ? tSec.order : idx,
              selector: tSec.selector || ''
            });
            preserved.push({
              key: secId,
              type: 'section',
              section: 'layout',
              value: matchCanonical.enabled ? 'Enabled' : 'Disabled',
              status: 'preserved'
            });
          } else {
            const defaultEnabled = tSec.enabled !== undefined ? tSec.enabled : (tSec.defaultEnabled !== false);
            projectedSections.push({
              id: secId,
              name: tSec.name || tSec.title || secId,
              enabled: defaultEnabled,
              order: tSec.order !== undefined ? tSec.order : idx,
              selector: tSec.selector || ''
            });
            initialized.push({
              key: secId,
              type: 'section',
              section: 'layout',
              defaultValue: defaultEnabled ? 'Enabled (Default)' : 'Disabled',
              status: 'initialized'
            });
          }
        });

        // Identify canonical sections not supported in target
        Object.keys(canonicalSections).forEach(secKey => {
          const inTarget = targetSections.some(s => (s.id || s.key) === secKey);
          if (!inTarget && canonicalSections[secKey]?.enabled) {
            unsupported.push({
              key: secKey,
              type: 'section',
              section: 'layout',
              value: canonicalSections[secKey].name || secKey,
              reason: 'Section not part of target template blueprint',
              status: 'unsupported'
            });
          }
        });
      }

      // 5. Project & Map Visual Themes
      const projectedVisual = deepClone(canonical.visual) || {};
      const targetThemeCaps = normalizedTarget.theme || normalizedTarget.capabilities?.visual || {};

      // If target provides specific supported palettes, verify compatibility
      if (Array.isArray(targetThemeCaps.supportedPalettes) && targetThemeCaps.supportedPalettes.length > 0) {
        const supportedPalettes = targetThemeCaps.supportedPalettes.map(p => typeof p === 'string' ? p : p.id);
        if (!supportedPalettes.includes(projectedVisual.palette)) {
          const fallbackPalette = supportedPalettes[0];
          adapted.push({
            key: 'palette',
            type: 'visual',
            section: 'theme',
            fromValue: projectedVisual.palette,
            toValue: fallbackPalette,
            reason: `Palette "${projectedVisual.palette}" adapted to target template palette "${fallbackPalette}"`,
            status: 'adapted'
          });
          projectedVisual.palette = fallbackPalette;
        } else {
          preserved.push({
            key: 'palette',
            type: 'visual',
            section: 'theme',
            value: projectedVisual.palette,
            status: 'preserved'
          });
        }
      }

      // 6. Project & Map Animations & Effects
      const projectedAnimations = deepClone(canonical.animations) || { master: true };
      const targetAnimCaps = normalizedTarget.animations || normalizedTarget.capabilities?.animations || {};

      if (targetAnimCaps.supported === false) {
        projectedAnimations.master = false;
        if (canonical.animations?.master) {
          unsupported.push({
            key: 'animations',
            type: 'effects',
            section: 'visual',
            value: 'Special FX / Particle Animations',
            reason: 'Target template does not include dynamic particle/animation layers',
            status: 'unsupported'
          });
        }
      } else {
        preserved.push({
          key: 'animations',
          type: 'effects',
          section: 'visual',
          value: projectedAnimations.particleType || 'Particles enabled',
          status: 'preserved'
        });
      }

      // 7. Construct Complete Active Template Projection
      const projectedState = {
        ...projectedContent,
        content: projectedContent,
        media: projectedMedia,
        sections: projectedSections,
        visual: projectedVisual,
        animations: projectedAnimations,
        // Top-level aliases for backward compatibility with existing renderers
        photos: projectedMedia.photos,
        cover_photo: projectedMedia.coverPhoto || (projectedMedia.photos[0]?.url || ''),
        photo_1: projectedMedia.coverPhoto || (projectedMedia.photos[0]?.url || ''),
        music: projectedMedia.music,
        voice_note: projectedMedia.voiceNote,
        galleryLayout: projectedMedia.galleryLayout,
        theme: projectedVisual.theme,
        activePalette: projectedVisual.palette,
        colors: projectedVisual.colors,
        typography: projectedVisual.typography,
        surfaces: projectedVisual.surfaces,
        buttons: projectedVisual.buttons,
        effects: projectedAnimations
      };

      const migrationResult = {
        success: true,
        migratedAt: new Date().toISOString(),
        canonicalData: canonical,
        canonicalStore: canonical,
        projectedData: projectedState,
        diff: {
          preserved,
          adapted,
          unsupported,
          initialized,
          warnings
        },
        counts: {
          preserved: preserved.length,
          adapted: adapted.length,
          unsupported: unsupported.length,
          initialized: initialized.length,
          warnings: warnings.length
        },
        summary: this.getMigrationSummary({ preserved, adapted, unsupported, initialized })
      };

      return migrationResult;
    },

    /**
     * Adapts a field value according to target field type
     */
    adaptFieldValue(value, targetType, fieldSpec = {}) {
      if (value === undefined || value === null) return '';

      switch (targetType) {
        case 'number':
        case 'range': {
          const num = Number(value);
          if (isNaN(num)) return fieldSpec.defaultValue !== undefined ? fieldSpec.defaultValue : (fieldSpec.min || 0);
          if (fieldSpec.min !== undefined && num < fieldSpec.min) return fieldSpec.min;
          if (fieldSpec.max !== undefined && num > fieldSpec.max) return fieldSpec.max;
          return num;
        }

        case 'toggle':
        case 'checkbox':
        case 'boolean': {
          if (typeof value === 'boolean') return value;
          const s = String(value).toLowerCase().trim();
          return ['true', '1', 'yes', 'on', 'enabled'].includes(s);
        }

        case 'select': {
          const sVal = String(value);
          if (Array.isArray(fieldSpec.options) && fieldSpec.options.length > 0) {
            const valid = fieldSpec.options.some(opt => {
              const optVal = typeof opt === 'object' ? (opt.value || opt.id || opt.key) : String(opt);
              return String(optVal).toLowerCase() === sVal.toLowerCase();
            });
            if (valid) return sVal;
            const firstOpt = fieldSpec.options[0];
            return typeof firstOpt === 'object' ? (firstOpt.value || firstOpt.id || '') : String(firstOpt);
          }
          return sVal;
        }

        case 'multiselect': {
          if (Array.isArray(value)) return value;
          if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean);
          return [String(value)];
        }

        case 'date': {
          const str = String(value).trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
          try {
            const d = new Date(str);
            if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
          } catch (e) {}
          return str;
        }

        case 'color': {
          const str = String(value).trim();
          if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(str)) return str;
          if (str.startsWith('rgb')) return str;
          return fieldSpec.defaultValue || '#ec4899';
        }

        case 'text':
        case 'textarea':
        default:
          return String(value);
      }
    },

    /**
     * Projects canonical data for a target template schema without modifying canonical data
     */
    projectForTemplate(canonicalData, targetSchema, options = {}) {
      return this.migrate({
        canonicalData,
        targetSchema,
        options
      }).projectedData;
    },

    /**
     * Compares two schemas to determine capability diff
     */
    compareCapabilities(sourceSchema, targetSchema) {
      const srcNorm = this.normalizeSchema(sourceSchema);
      const tgtNorm = this.normalizeSchema(targetSchema);

      const srcFields = new Set((srcNorm.fields || []).map(f => f.key || f.id));
      const tgtFields = new Set((tgtNorm.fields || []).map(f => f.key || f.id));

      const sharedFields = [...srcFields].filter(k => tgtFields.has(k));
      const droppedFields = [...srcFields].filter(k => !tgtFields.has(k));
      const addedFields = [...tgtFields].filter(k => !srcFields.has(k));

      const srcMedia = srcNorm.media?.capabilities || srcNorm.capabilities?.media || {};
      const tgtMedia = tgtNorm.media?.capabilities || tgtNorm.capabilities?.media || {};

      const mediaDiff = {
        photos: {
          from: srcMedia.maxPhotos || (srcMedia.images !== false ? 'unlimited' : 0),
          to: tgtMedia.maxPhotos || (tgtMedia.images !== false ? 'unlimited' : 0)
        },
        voice: {
          from: srcMedia.voice !== false,
          to: tgtMedia.voice !== false
        },
        music: {
          from: srcMedia.audio !== false && srcMedia.music !== false,
          to: tgtMedia.audio !== false && tgtMedia.music !== false
        }
      };

      return {
        sharedFields,
        droppedFields,
        addedFields,
        mediaDiff,
        isFullyCompatible: droppedFields.length === 0 && (mediaDiff.photos.to >= mediaDiff.photos.from || mediaDiff.photos.to === 'unlimited')
      };
    },

    /**
     * Normalizes a raw schema or template capability representation
     */
    normalizeSchema(raw) {
      if (!raw || typeof raw !== 'object') {
        return { fields: [], sections: [], media: { capabilities: {} }, theme: {}, animations: {}, capabilities: {} };
      }

      // If already normalized WishMagicTemplateAnalyzer schema
      if (raw.schema && typeof raw.schema === 'object') return raw.schema;

      const fields = Array.isArray(raw.fields) ? raw.fields : (Array.isArray(raw.detectedFields) ? raw.detectedFields : []);
      const sections = Array.isArray(raw.sections) ? raw.sections : (Array.isArray(raw.detectedSections) ? raw.detectedSections : []);
      const media = raw.media && typeof raw.media === 'object' ? raw.media : { capabilities: raw.capabilities?.media || {} };
      const theme = raw.theme && typeof raw.theme === 'object' ? raw.theme : (raw.capabilities?.visual || {});
      const animations = raw.animations && typeof raw.animations === 'object' ? raw.animations : (raw.capabilities?.animations || {});
      const capabilities = raw.capabilities && typeof raw.capabilities === 'object' ? raw.capabilities : {};

      return {
        fields,
        sections,
        media,
        theme,
        animations,
        capabilities
      };
    },

    /**
     * Generates human-friendly migration summary
     */
    getMigrationSummary(diff) {
      const { preserved = [], adapted = [], unsupported = [], initialized = [] } = diff;

      const messages = [];

      if (preserved.length > 0) {
        messages.push(`Restored ${preserved.length} compatible field${preserved.length === 1 ? '' : 's'} and settings.`);
      }

      if (adapted.length > 0) {
        const sampleAdapted = adapted.slice(0, 2).map(a => a.reason).join('; ');
        messages.push(`Adapted ${adapted.length} element${adapted.length === 1 ? '' : 's'} (${sampleAdapted}).`);
      }

      if (unsupported.length > 0) {
        const itemNames = unsupported.slice(0, 3).map(u => u.key).join(', ');
        messages.push(`${unsupported.length} feature${unsupported.length === 1 ? '' : 's'} (${itemNames}) not supported by this template, but safely saved in your draft.`);
      }

      if (initialized.length > 0) {
        messages.push(`${initialized.length} template-specific default${initialized.length === 1 ? '' : 's'} initialized.`);
      }

      return {
        title: 'Template Switched Successfully ✨',
        text: messages.join(' '),
        preservedCount: preserved.length,
        adaptedCount: adapted.length,
        unsupportedCount: unsupported.length,
        initializedCount: initialized.length
      };
    }
  };

  /**
   * Template Switcher Orchestrator
   */
  const WishMagicTemplateSwitcher = {
    _history: [],
    _maxHistory: 20,

    /**
     * Orchestrates complete template switch:
     * 1. Updates canonical store from current data
     * 2. Migrates data to target template schema
     * 3. Loads new template in preview controller / sandbox
     * 4. Updates customizer UI & form fields
     * 5. Emits migration event and returns result
     */
    async switchTemplate(params = {}) {
      const {
        fromTemplateId,
        toTemplateId,
        toTemplate = null,
        toSchema = null,
        fromSchema = null,
        canonicalData = null,
        currentData = null,
        previewController = null,
        customizer = null,
        onProgress = null,
        onComplete = null
      } = params;

      if (typeof onProgress === 'function') onProgress({ stage: 'initiating', progress: 10 });

      // 1. Resolve Target Schema
      let resolvedSchema = toSchema;
      if (!resolvedSchema && toTemplate) {
        if (toTemplate.schema) resolvedSchema = toTemplate.schema;
        else if (toTemplate.capabilities) resolvedSchema = WishMagicStateMigrator.normalizeSchema(toTemplate);
        else if (global.WishMagicTemplateAnalyzer) {
          try {
            const analysis = await global.WishMagicTemplateAnalyzer.analyze(toTemplate);
            resolvedSchema = analysis.schema;
          } catch (e) {
            console.warn('[WishMagicTemplateSwitcher] Analyzer error:', e);
          }
        }
      }

      // 2. Perform State Migration
      if (typeof onProgress === 'function') onProgress({ stage: 'migrating_state', progress: 30 });

      const migrationResult = WishMagicStateMigrator.migrate({
        canonicalData,
        currentData,
        sourceSchema: fromSchema,
        targetSchema: resolvedSchema
      });

      // 3. Record History for Undo
      this._history.push({
        fromTemplateId: fromTemplateId || null,
        toTemplateId: toTemplateId || toTemplate?.id || 'target_template',
        canonicalSnapshot: deepClone(migrationResult.canonicalData),
        timestamp: Date.now()
      });
      if (this._history.length > this._maxHistory) {
        this._history.shift();
      }

      // 4. Update Preview Controller Sandbox if present
      if (previewController) {
        if (typeof onProgress === 'function') onProgress({ stage: 'updating_preview', progress: 60 });
        try {
          if (typeof previewController.switchTemplate === 'function') {
            await previewController.switchTemplate(
              toTemplateId || toTemplate?.id,
              migrationResult.projectedData,
              resolvedSchema,
              { version: toTemplate?.version || 'v1.0' }
            );
          } else if (typeof previewController.loadTemplate === 'function') {
            await previewController.loadTemplate(
              toTemplateId || toTemplate?.id,
              toTemplate?.version || 'v1.0'
            );
            previewController.updateData(migrationResult.projectedData);
          }
        } catch (e) {
          console.error('[WishMagicTemplateSwitcher] Preview controller update failed:', e);
        }
      }

      // 5. Update Customizer Engine UI if present
      if (customizer && typeof customizer.hydrateState === 'function') {
        if (typeof onProgress === 'function') onProgress({ stage: 'updating_ui', progress: 85 });
        try {
          customizer.hydrateState(migrationResult.projectedData, resolvedSchema);
        } catch (e) {
          console.warn('[WishMagicTemplateSwitcher] Customizer hydrate error:', e);
        }
      }

      if (typeof onProgress === 'function') onProgress({ stage: 'complete', progress: 100 });

      const switchResult = {
        success: true,
        fromTemplateId,
        toTemplateId: toTemplateId || toTemplate?.id,
        toTemplate,
        migrationResult,
        canonicalData: migrationResult.canonicalData,
        projectedData: migrationResult.projectedData
      };

      if (typeof onComplete === 'function') {
        try {
          onComplete(switchResult);
        } catch (e) {
          console.warn('[WishMagicTemplateSwitcher] onComplete callback error:', e);
        }
      }

      // Dispatch global event for listeners
      if (typeof window !== 'undefined' && window.dispatchEvent && typeof CustomEvent === 'function') {
        try {
          window.dispatchEvent(new CustomEvent('wishmagic:template-switched', { detail: switchResult }));
        } catch (e) {}
      }

      return switchResult;
    },

    getSwitchHistory() {
      return this._history.slice();
    },

    clearHistory() {
      this._history = [];
    }
  };

  // Export to global scope
  global.WishMagicStateMigrator = WishMagicStateMigrator;
  global.WishMagicTemplateSwitcher = WishMagicTemplateSwitcher;

})(typeof window !== 'undefined' ? window : globalThis);
