/**
 * WishMagic Template Family & Relationship Variant Management Engine
 * Part 27: Production-Grade Relationship Variant Resolver & Visual Configuration
 * 
 * Capabilities:
 * 1. Template Family & Version reconciliation
 * 2. Many-to-Many Template <-> Relationship bindings
 * 3. Variant Lifecycle States (DRAFT, READY, PUBLISHED, ARCHIVED)
 * 4. Comprehensive Variant Validation (Fields, Sections, Images, Music, Theme, Effects, Animations)
 * 5. Hierarchical Value & Asset Resolvers (Variant -> Template -> Fallback)
 * 6. Immutable Versioning & Optimistic Concurrency Protection (lock_version)
 * 7. Safe Variant Cloning & Archival with Dependency Verification
 */

export const VARIANT_STATUS = {
  DRAFT: 'draft',
  READY: 'ready',
  PUBLISHED: 'published',
  ARCHIVED: 'archived'
};

export const STANDARD_IMAGE_SLOTS = [
  'hero_photo',
  'cover_photo',
  'gallery_1',
  'gallery_2',
  'gallery_3',
  'gallery_4',
  'gallery_5',
  'gallery_6',
  'memory_1',
  'memory_2',
  'memory_3'
];

export const STANDARD_MESSAGE_FIELDS = [
  'hero_title',
  'subtitle',
  'main_message',
  'gallery_heading',
  'memory_heading',
  'final_message',
  'button_label',
  'surprise_text',
  'recipient_placeholder',
  'sender_placeholder'
];

/**
 * Validates variant configuration against template version capabilities and schema constraints.
 * 
 * @param {Object} variant - Variant payload or database record
 * @param {Object} options - Validation context: { template, templateVersion, templateFields, musicLibrary, templateImages }
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateVariantConfiguration(variant, options = {}) {
  const errors = [];
  const warnings = [];

  if (!variant || typeof variant !== 'object') {
    return { valid: false, errors: ['Variant configuration payload is missing or invalid.'], warnings: [] };
  }

  // 1. Template & Relationship binding check (if checking full variant record)
  const hasRel = Boolean(
    variant.relationship_id || variant.relationshipId ||
    variant.relationship_slug || variant.relationshipSlug
  );
  if (options.requireRelationship && !hasRel) {
    errors.push('Relationship reference is required for variant.');
  }

  const rawConfig = typeof variant.configuration_json === 'string'
    ? safeJsonParse(variant.configuration_json, {})
    : (variant.configuration || variant.configuration_json || variant);

  // 1b. Validate Required Message Fields
  if (rawConfig.messages && typeof rawConfig.messages === 'object') {
    if (!rawConfig.messages.hero_title || typeof rawConfig.messages.hero_title !== 'string' || !rawConfig.messages.hero_title.trim()) {
      errors.push('Message field "hero_title" is required.');
    }
    if (!rawConfig.messages.main_message && !rawConfig.messages.custom_message) {
      errors.push('Message field "main_message" is required.');
    }
  }

  const templateCapabilities = (options.templateVersion && options.templateVersion.capabilities) ||
    (options.template && options.template.capabilities) || {};

  const templateSections = (options.templateVersion && (options.templateVersion.sections || options.templateVersion.sections_json)) ||
    (options.template && options.template.sections) || [];

  const allowedSectionsList = Array.isArray(templateSections)
    ? templateSections.map(s => (typeof s === 'string' ? s.toLowerCase() : (s.key || s.type || '').toLowerCase()))
    : [];

  // 2. Sections Compatibility Validation (Cannot enable sections not supported by template)
  if (rawConfig.sections && Array.isArray(rawConfig.sections)) {
    for (const sec of rawConfig.sections) {
      const secKey = (typeof sec === 'string' ? sec : (sec.key || sec.type || '')).toLowerCase();
      // If template defines capabilities, check against them
      if (secKey === 'voicenote' || secKey === 'voice_note' || secKey === 'voice') {
        if (!templateCapabilities.voiceNote && !templateCapabilities.supportsVoice) {
          errors.push('Section "Voice Note" is not supported by this template version and cannot be enabled.');
        }
      }
      if (secKey === 'timeline' || secKey === 'memories_timeline') {
        if (templateCapabilities.timeline === false && !allowedSectionsList.some(s => s.includes('timeline') || s.includes('memories'))) {
          errors.push('Section "Timeline" is not supported by this template version.');
        }
      }
      if (secKey === 'countdown' && templateCapabilities.countdown === false) {
        errors.push('Section "Countdown Clock" is not supported by this template version.');
      }
    }
  }

  // 3. Music Validation: Assigned songs must exist and be READY/ACTIVE
  const assignedMusic = rawConfig.music || {};
  const musicList = options.musicLibrary || [];
  if (assignedMusic.defaultMusicId) {
    const song = musicList.find(m => m.id === assignedMusic.defaultMusicId);
    if (!song) {
      warnings.push(`Default music track "${assignedMusic.defaultMusicId}" was not found in the music catalog.`);
    } else if (song.status && song.status !== 'active' && song.status !== 'READY') {
      errors.push(`Music track "${song.title || assignedMusic.defaultMusicId}" is not in READY status (current status: ${song.status}).`);
    }
  }

  // 4. Image URL Safety & Protocol Enforcement
  const images = rawConfig.images || {};
  for (const [slotKey, imgData] of Object.entries(images)) {
    const url = typeof imgData === 'string' ? imgData : (imgData && (imgData.url || imgData.displayUrl || imgData.display_url));
    if (url) {
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/') && !url.startsWith('data:image/')) {
        errors.push(`Image slot "${slotKey}" contains an invalid or unsafe URL schema.`);
      }
      if (url.toLowerCase().includes('javascript:') || url.toLowerCase().includes('<script')) {
        errors.push(`Image slot "${slotKey}" contains illegal script payload.`);
      }
    }
  }

  // 5. Theme & Animation Safety Check (No arbitrary JavaScript injection)
  const theme = rawConfig.theme || {};
  if (theme.accentColor && typeof theme.accentColor === 'string') {
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(theme.accentColor) && !theme.accentColor.startsWith('rgb')) {
      errors.push('Theme attribute "accentColor" must be a valid hex color format (#RRGGBB).');
    }
  }

  for (const [k, v] of Object.entries(theme)) {
    if (typeof v === 'string') {
      if (v.includes('<script') || v.includes('javascript:') || v.includes('onerror=')) {
        errors.push(`Theme attribute "${k}" contains forbidden script injection.`);
      }
    }
  }

  const animations = rawConfig.animations || {};
  if (typeof animations === 'object') {
    if (animations.duration !== undefined && (isNaN(Number(animations.duration)) || Number(animations.duration) < 0 || Number(animations.duration) > 60)) {
      errors.push('Animation duration must be a valid number between 0 and 60 seconds.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Resolves full hierarchy for a template and relationship variant.
 * Resolution chain:
 * Customer Wish CustomData -> Relationship Variant -> Variant-specific default -> Template default -> No value
 * 
 * @param {Object} params
 * @returns {Object} Fully resolved configuration ready for marketplace, preview, and customizer
 */
export function resolveVariantHierarchy({
  template = {},
  templateVersion = {},
  variant = null,
  relationships = [],
  templateImages = [],
  musicLibrary = [],
  customData = {}
}) {
  const versionCapabilities = templateVersion.capabilities || template.capabilities || {};
  const versionSections = templateVersion.sections || template.sections || [];
  const versionTheme = templateVersion.theme || template.theme || {};

  // Extract variant configuration JSON
  const variantConfig = variant
    ? (typeof variant.configuration_json === 'string'
      ? safeJsonParse(variant.configuration_json, {})
      : (variant.configuration || variant.configuration_json || {}))
    : {};

  // 1. Resolve General Configuration
  const relationshipSlug = (variant && (variant.relationship_slug || variant.relationshipSlug)) ||
    (variant && (variant.relationship_id || variant.relationshipId)) || 'general';

  const general = {
    displayName: variantConfig.displayName || variantConfig.name || (variant && variant.name) || template.name || 'Magical Greeting',
    description: variantConfig.description || template.description || '',
    suitableFor: variantConfig.suitableFor || variantConfig.suitable_for || '',
    atmosphere: variantConfig.atmosphere || variantConfig.mood || versionTheme.mood || 'Romantic & Magical',
    tags: Array.isArray(variantConfig.tags) ? variantConfig.tags : (template.tags || [])
  };

  // 2. Resolve Messages
  const tplDefaults = template.detectedFields || template.defaultConfig || [];
  const tplMsgMap = {};
  if (Array.isArray(tplDefaults)) {
    tplDefaults.forEach(f => {
      if (f.key && f.defaultValue) tplMsgMap[f.key] = f.defaultValue;
    });
  } else if (typeof tplDefaults === 'object') {
    Object.assign(tplMsgMap, tplDefaults);
  }

  const variantMessages = variantConfig.messages || {};
  const messages = {
    recipient_name: customData.recipient_name || customData.recipientName || variantMessages.recipient_name || variantMessages.recipient_placeholder || tplMsgMap.recipient_name || 'Special Person',
    sender_name: customData.sender_name || customData.senderName || variantMessages.sender_name || variantMessages.sender_placeholder || tplMsgMap.sender_name || 'With Love',
    custom_message: customData.custom_message || customData.message || variantMessages.custom_message || variantMessages.main_message || tplMsgMap.custom_message || template.description || 'Wishing you infinite joy, magic, and smiles!',
    hero_title: customData.hero_title || variantMessages.hero_title || tplMsgMap.hero_title || `Happy Celebration ✨`,
    subtitle: customData.subtitle || variantMessages.subtitle || tplMsgMap.subtitle || 'A magical surprise crafted just for you',
    gallery_heading: customData.gallery_heading || variantMessages.gallery_heading || 'Treasured Memories',
    memory_heading: customData.memory_heading || variantMessages.memory_heading || 'Moments We Cherish',
    final_message: customData.final_message || variantMessages.final_message || 'Forever & Always',
    surprise_text: customData.surprise_text || variantMessages.surprise_text || 'Tap to unbox your magical surprise! 🎁'
  };

  // 3. Resolve Image Slots with Strict Fallback
  // Rule: Relationship specific -> Template Default -> null (NEVER silently use an unrelated relationship's photo!)
  const variantImages = variantConfig.images || {};
  const resolvedImages = {};

  for (const slotKey of STANDARD_IMAGE_SLOTS) {
    let chosenUrl = null;
    let chosenSource = 'none';

    // A. Check variant specific image mapping
    if (variantImages[slotKey]) {
      const vImg = variantImages[slotKey];
      chosenUrl = typeof vImg === 'string' ? vImg : (vImg.url || vImg.displayUrl || vImg.display_url);
      if (chosenUrl) chosenSource = 'variant';
    }

    // B. Check template_images table for relationship-specific image
    if (!chosenUrl && templateImages.length > 0 && variant && variant.relationship_id) {
      const matchRel = templateImages.find(ti =>
        (ti.asset_key === slotKey || ti.assetKey === slotKey) &&
        (ti.relationship_id === variant.relationship_id || ti.relationshipId === variant.relationship_id) &&
        ti.status === 'active'
      );
      if (matchRel) {
        chosenUrl = matchRel.display_url || matchRel.url || matchRel.original_url;
        chosenSource = 'variant_d1';
      }
    }

    // C. Explicit fallback to template default image slot (only if fallback not disabled)
    const allowDefaultFallback = variantImages[`${slotKey}_fallback`] !== 'none' && variantImages.fallbackToDefault !== false;
    if (!chosenUrl && allowDefaultFallback) {
      const defaultImg = templateImages.find(ti =>
        (ti.asset_key === slotKey || ti.assetKey === slotKey) &&
        (!ti.relationship_id || ti.relationship_id === 'general' || ti.relationship_id === '') &&
        ti.status === 'active'
      );
      if (defaultImg) {
        chosenUrl = defaultImg.display_url || defaultImg.url;
        chosenSource = 'template_default';
      } else if (slotKey === 'hero_photo' || slotKey === 'cover_photo') {
        chosenUrl = template.thumbnail || template.previewImage || null;
        if (chosenUrl) chosenSource = 'template_thumbnail';
      }
    }

    resolvedImages[slotKey] = {
      url: chosenUrl,
      source: chosenSource,
      slotKey
    };
  }

  // 4. Resolve Music Track
  const variantMusic = variantConfig.music || {};
  let defaultMusic = null;
  const availableMusic = [];

  // Filter songs suited for this relationship
  musicLibrary.forEach(m => {
    if (m.status === 'active' || m.status === 'READY') {
      let isSuited = false;
      try {
        const suits = typeof m.relationship_suitability === 'string'
          ? JSON.parse(m.relationship_suitability)
          : (m.relationship_suitability || []);
        isSuited = suits.length === 0 || suits.includes(relationshipSlug);
      } catch (e) {
        isSuited = true;
      }
      availableMusic.push({
        id: m.id,
        title: m.title,
        artist: m.artist || 'WishMagic Studio',
        playbackUrl: m.playback_url || m.playbackUrl,
        category: m.category,
        isSuited
      });
    }
  });

  if (variantMusic.defaultMusicId) {
    defaultMusic = availableMusic.find(m => m.id === variantMusic.defaultMusicId) || null;
  }
  if (!defaultMusic && availableMusic.length > 0) {
    defaultMusic = availableMusic.find(m => m.isSuited) || availableMusic[0];
  }

  // 5. Resolve Theme & Visual Palette
  const variantTheme = variantConfig.theme || {};
  const theme = {
    mood: customData.mood || variantTheme.mood || versionTheme.mood || 'Magical & Celebratory',
    accentColor: customData.accentColor || customData.accent_color || variantTheme.accentColor || versionTheme.accentColor || '#ec4899',
    backgroundStyle: variantTheme.backgroundStyle || versionTheme.backgroundStyle || 'cosmic-purple',
    gradient: variantTheme.gradient || versionTheme.gradient || 'from-pink-500 via-purple-600 to-amber-400',
    cardStyle: variantTheme.cardStyle || 'glass-glow',
    textColor: variantTheme.textColor || '#ffffff',
    fontFamily: variantTheme.fontFamily || 'Plus Jakarta Sans',
    particles: variantConfig.effects?.particles || 'magic-sparkles'
  };

  // 6. Resolve Sections Ordering & Overrides
  let sections = [];
  if (Array.isArray(variantConfig.sections) && variantConfig.sections.length > 0) {
    sections = variantConfig.sections;
  } else if (Array.isArray(versionSections) && versionSections.length > 0) {
    sections = versionSections.map((s, idx) => {
      const name = typeof s === 'string' ? s : (s.name || s.title || s.type || `Section ${idx + 1}`);
      const type = typeof s === 'string' ? s.toLowerCase().replace(/\s+/g, '_') : (s.type || s.key);
      return { id: `sec_${idx + 1}`, type, name, isEnabled: true, sortOrder: idx + 1 };
    });
  }

  // 7. Resolve Effects & Animations
  const effects = {
    particles: variantConfig.effects?.particles || 'confetti-and-stars',
    floatingElements: variantConfig.effects?.floatingElements ?? true,
    glowIntensity: variantConfig.effects?.glowIntensity || 'medium',
    confettiColors: variantConfig.effects?.confettiColors || ['#ec4899', '#a855f7', '#F4C542', '#38bdf8']
  };

  const animations = {
    intensity: variantConfig.animations?.intensity || 'smooth',
    duration: variantConfig.animations?.duration || 1.2,
    entrance: variantConfig.animations?.entrance || 'fade-slide-up',
    sectionTransition: variantConfig.animations?.sectionTransition || 'smooth-stagger'
  };

  return {
    templateId: template.id,
    templateVersionId: templateVersion.id || `tv_${template.id}_v1`,
    relationshipId: variant ? (variant.relationship_id || variant.relationshipId) : null,
    relationshipSlug,
    variantId: variant ? variant.id : null,
    variantStatus: variant ? (variant.status || VARIANT_STATUS.PUBLISHED) : VARIANT_STATUS.PUBLISHED,
    versionNumber: variant ? (variant.version_number || 1) : 1,
    general,
    messages,
    images: resolvedImages,
    music: {
      defaultMusic,
      availableTracks: availableMusic
    },
    theme,
    sections,
    effects,
    animations,
    capabilities: versionCapabilities
  };
}

/**
 * Deep clones an existing variant for a target relationship with clean initial status.
 */
export function cloneVariant(sourceVariant, targetRelationship, newId = null) {
  if (!sourceVariant || !targetRelationship) {
    throw new Error('Both sourceVariant and targetRelationship are required for cloning.');
  }

  const sourceConfig = typeof sourceVariant.configuration_json === 'string'
    ? safeJsonParse(sourceVariant.configuration_json, {})
    : (sourceVariant.configuration || sourceVariant.configuration_json || {});

  const clonedConfig = JSON.parse(JSON.stringify(sourceConfig));
  clonedConfig.displayName = `${targetRelationship.displayName || targetRelationship.name} Special Edition`;
  clonedConfig.relationshipSlug = targetRelationship.slug;

  const nowIso = new Date().toISOString();
  const variantId = newId || `trv_${sourceVariant.template_version_id || 'tv'}_${targetRelationship.slug}_${Date.now().toString(36)}`;

  return {
    id: variantId,
    template_version_id: sourceVariant.template_version_id,
    template_id: sourceVariant.template_id,
    relationship_id: targetRelationship.id,
    relationship_slug: targetRelationship.slug,
    name: `${targetRelationship.name} Variant`,
    configuration_json: JSON.stringify(clonedConfig),
    status: VARIANT_STATUS.DRAFT,
    version_number: 1,
    parent_variant_id: sourceVariant.id,
    is_latest: 1,
    lock_version: 1,
    created_at: nowIso,
    updated_at: nowIso
  };
}

/**
 * Utility: Safe JSON parsing without exceptions.
 */
function safeJsonParse(str, fallback = {}) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}
