/**
 * WishMagic Template Family & Relationship Variant Management Engine
 * Part 27 & Part 48: Production-Grade Relationship Variant Resolver,
 * UTP v1.1.0 Multi-Variant Package Discovery, & Visual Configuration
 * 
 * Capabilities:
 * 1. Template Family & Version reconciliation
 * 2. Many-to-Many Template <-> Relationship bindings
 * 3. Variant Lifecycle States (DRAFT, READY, PUBLISHED, DISABLED, ARCHIVED)
 * 4. Comprehensive Variant Validation (Fields, Sections, Images, Music, Theme, Effects, Animations)
 * 5. Hierarchical Value & Asset Resolvers (Customer Wish CustomData -> Variant Override -> Template Default -> Fallback)
 * 6. Immutable Versioning & Optimistic Concurrency Protection (lock_version)
 * 7. Safe Variant Cloning, Public Tag Filtering, & Archival with Dependency Verification
 */

import { normalizeRelationshipIdentifier } from './template-protocol-schema.js';

export const VARIANT_STATUS = {
  DRAFT: 'draft',
  READY: 'ready',
  PUBLISHED: 'published',
  DISABLED: 'disabled',
  ARCHIVED: 'archived'
};

export const STANDARD_IMAGE_SLOTS = [
  'hero_photo',
  'cover_photo',
  'photo_1',
  'photo_2',
  'photo_3',
  'photo_4',
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
  'hero_subtitle',
  'subtitle',
  'main_message',
  'custom_message',
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
    variant.relationship_slug || variant.relationshipSlug ||
    variant.relationship
  );
  if (options.requireRelationship && !hasRel) {
    errors.push('Relationship reference is required for variant.');
  }

  const rawConfig = typeof variant.configuration_json === 'string'
    ? safeJsonParse(variant.configuration_json, {})
    : (variant.configuration || variant.configuration_json || variant);

  // 1b. Validate Required Message Fields when messages object is explicitly provided
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
    ? templateSections.map(s => (typeof s === 'string' ? s.toLowerCase() : (s.key || s.type || s.id || '').toLowerCase()))
    : [];

  // 2. Sections Compatibility Validation (Cannot enable sections not supported by template)
  if (rawConfig.sections && Array.isArray(rawConfig.sections)) {
    for (const sec of rawConfig.sections) {
      const secKey = (typeof sec === 'string' ? sec : (sec.key || sec.type || sec.id || '')).toLowerCase();
      if (secKey === 'voicenote' || secKey === 'voice_note' || secKey === 'voice') {
        if (!templateCapabilities.voiceNote && !templateCapabilities.supportsVoice && !templateCapabilities.voice) {
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
  const images = { ...(rawConfig.assets || {}), ...(rawConfig.images || {}) };
  for (const [slotKey, imgData] of Object.entries(images)) {
    if (slotKey.endsWith('_fallback') || slotKey === 'fallbackToDefault') continue;
    const url = typeof imgData === 'string' ? imgData : (imgData && (imgData.url || imgData.displayUrl || imgData.display_url || imgData.path));
    if (url) {
      const isRelativeAsset = !url.includes(':') && !url.startsWith('//') && !url.includes('..');
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/') && !url.startsWith('data:image/') && !isRelativeAsset) {
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
 * Deterministically merges base template fields with variant-specific field overrides,
 * message overrides, and asset URLs.
 * Precedence: Variant Field Override / Variant Message / Variant Asset > Base Template Field Default
 */
export function mergeTemplateAndVariantFields(baseFields = [], variantFields = [], variantMessages = {}, variantAssets = {}) {
  const mergedMap = new Map();

  if (Array.isArray(baseFields)) {
    for (const bf of baseFields) {
      if (!bf || typeof bf !== 'object') continue;
      const key = String(bf.id || bf.key || bf.field_key || '').trim();
      if (!key) continue;
      mergedMap.set(key, {
        ...bf,
        id: key,
        key,
        type: bf.type || bf.field_type || 'text',
        label: bf.label || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        defaultValue: bf.defaultValue !== undefined ? bf.defaultValue : (bf.default_value !== undefined ? bf.default_value : '')
      });
    }
  }

  // Apply variant message overrides to matching text/textarea fields
  if (variantMessages && typeof variantMessages === 'object') {
    for (const [mKey, mVal] of Object.entries(variantMessages)) {
      if (mVal === undefined || mVal === null) continue;
      const targetKey = mKey === 'main_message' && !mergedMap.has('main_message') && mergedMap.has('custom_message')
        ? 'custom_message'
        : mKey;
      if (mergedMap.has(targetKey)) {
        const existing = mergedMap.get(targetKey);
        mergedMap.set(targetKey, {
          ...existing,
          defaultValue: mVal
        });
      }
    }
  }

  // Apply variant asset overrides to matching media fields
  if (variantAssets && typeof variantAssets === 'object') {
    for (const [aKey, aVal] of Object.entries(variantAssets)) {
      if (!aVal || aKey.endsWith('_fallback') || aKey === 'fallbackToDefault') continue;
      const urlVal = typeof aVal === 'string' ? aVal : (aVal.url || aVal.displayUrl || aVal.display_url || aVal.src || '');
      if (!urlVal) continue;
      const targetKey = (aKey === 'hero_photo' || aKey === 'cover_photo') && !mergedMap.has(aKey) && mergedMap.has('photo_1')
        ? 'photo_1'
        : aKey;
      if (mergedMap.has(targetKey)) {
        const existing = mergedMap.get(targetKey);
        mergedMap.set(targetKey, {
          ...existing,
          defaultValue: urlVal
        });
      }
    }
  }

  // Apply explicit variant field definitions / overrides
  if (Array.isArray(variantFields)) {
    for (const vf of variantFields) {
      if (!vf || typeof vf !== 'object') continue;
      const key = String(vf.id || vf.key || vf.field_key || '').trim();
      if (!key) continue;
      const existing = mergedMap.get(key) || {};
      const resolvedType = vf.type || vf.field_type || existing.type || 'text';
      mergedMap.set(key, {
        ...existing,
        ...vf,
        id: key,
        key,
        type: resolvedType,
        label: vf.label || existing.label || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        placeholder: vf.placeholder !== undefined ? vf.placeholder : (existing.placeholder || ''),
        required: vf.required !== undefined ? Boolean(vf.required) : Boolean(existing.required || existing.isRequired),
        isRequired: vf.required !== undefined ? Boolean(vf.required) : Boolean(existing.isRequired || existing.required),
        defaultValue: vf.defaultValue !== undefined ? vf.defaultValue : (vf.default_value !== undefined ? vf.default_value : (existing.defaultValue || '')),
        binding: vf.binding || existing.binding || {
          target: ['image', 'audio', 'video'].includes(resolvedType) ? 'src' : 'text',
          selector: `[data-wm-field='${key}']`
        },
        variantSpecific: !existing.id
      });
    }
  }

  return Array.from(mergedMap.values());
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
  variantOverride = null,
  relationships = [],
  templateImages = [],
  musicLibrary = [],
  customData = {},
  wishCustomData = null
}) {
  if (!variant && variantOverride) variant = variantOverride;
  if ((!customData || Object.keys(customData).length === 0) && wishCustomData && typeof wishCustomData === 'object') {
    customData = wishCustomData;
  }
  const versionCapabilities = typeof templateVersion.capabilities === 'string'
    ? safeJsonParse(templateVersion.capabilities, {})
    : (templateVersion.capabilities || (typeof template.capabilities === 'string' ? safeJsonParse(template.capabilities, {}) : template.capabilities) || {});
  const versionSections = typeof templateVersion.sections === 'string'
    ? safeJsonParse(templateVersion.sections, [])
    : (templateVersion.sections || (typeof template.sections === 'string' ? safeJsonParse(template.sections, []) : template.sections) || []);
  const versionTheme = typeof templateVersion.theme === 'string'
    ? safeJsonParse(templateVersion.theme, {})
    : (templateVersion.theme || (typeof template.theme === 'string' ? safeJsonParse(template.theme, {}) : template.theme) || {});

  // Extract variant configuration JSON
  const variantConfig = variant
    ? (typeof variant.configuration_json === 'string'
      ? safeJsonParse(variant.configuration_json, {})
      : (variant.configuration || variant.configuration_json || {}))
    : {};

  // 1. Resolve General Configuration
  const relationshipSlug = (variant && (variant.relationship_slug || variant.relationshipSlug || variant.relationship)) ||
    variantConfig.relationshipSlug ||
    variantConfig.relationship ||
    (variant && (variant.relationship_id || variant.relationshipId)) ||
    'general';

  const relMeta = normalizeRelationshipIdentifier(
    relationshipSlug,
    (variant && (variant.relationship_label || variant.relationshipLabel || variant.relationship_name)) || variantConfig.relationshipLabel || variantConfig.label
  );

  const relationshipLabel = (variant && (variant.relationship_label || variant.relationshipLabel || variant.relationship_name)) ||
    variantConfig.relationshipLabel ||
    variantConfig.label ||
    (relMeta ? relMeta.label : relationshipSlug);

  const variantSlug = (variant && (variant.variant_slug || variant.slug)) ||
    variantConfig.slug ||
    relationshipSlug;

  const entryFile = (variant && (variant.entry_file || variant.entryFile || variant.entry)) ||
    variantConfig.entry ||
    templateVersion.entry_point ||
    template.entry_file ||
    template.entryFile ||
    'index.html';

  const thumbnail = (variant && variant.thumbnail) ||
    variantConfig.thumbnail ||
    templateVersion.thumbnail ||
    template.thumbnail ||
    template.previewImage ||
    '';

  const general = {
    displayName: variantConfig.displayName || variantConfig.name || (variant && variant.name) || template.name || 'Magical Greeting',
    description: (variant && variant.description) || variantConfig.description || template.description || '',
    suitableFor: variantConfig.suitableFor || variantConfig.suitable_for || relationshipLabel || '',
    atmosphere: variantConfig.atmosphere || variantConfig.mood || versionTheme.mood || 'Romantic & Magical',
    tags: Array.isArray(variantConfig.tags) ? variantConfig.tags : (template.tags || []),
    thumbnail,
    entryFile
  };

  // 2. Resolve Messages & Field Defaults
  const rawBaseFields = templateVersion.fields_json
    ? (typeof templateVersion.fields_json === 'string' ? safeJsonParse(templateVersion.fields_json, []) : templateVersion.fields_json)
    : (template.detectedFields || template.fields || template.defaultConfig || []);
  const baseFieldsList = Array.isArray(rawBaseFields)
    ? rawBaseFields
    : (typeof rawBaseFields === 'string' ? safeJsonParse(rawBaseFields, []) : []);

  const tplMsgMap = {};
  if (Array.isArray(baseFieldsList)) {
    baseFieldsList.forEach(f => {
      const fKey = f && (f.key || f.id || f.field_key);
      const fDef = f && (f.defaultValue !== undefined ? f.defaultValue : f.default_value);
      if (fKey && fDef) tplMsgMap[fKey] = fDef;
    });
  } else if (typeof rawBaseFields === 'object' && rawBaseFields !== null) {
    Object.assign(tplMsgMap, rawBaseFields);
  }

  const variantMessages = variantConfig.messages || {};
  const messages = {
    ...tplMsgMap,
    ...variantMessages,
    recipient_name: customData.recipient_name || customData.recipientName || variantMessages.recipient_name || variantMessages.recipient_placeholder || tplMsgMap.recipient_name || 'Special Person',
    sender_name: customData.sender_name || customData.senderName || variantMessages.sender_name || variantMessages.sender_placeholder || tplMsgMap.sender_name || 'With Love',
    custom_message: customData.custom_message || customData.message || variantMessages.custom_message || variantMessages.main_message || tplMsgMap.custom_message || template.description || 'Wishing you infinite joy, magic, and smiles!',
    hero_title: customData.hero_title || variantMessages.hero_title || tplMsgMap.hero_title || `Happy Celebration ✨`,
    hero_subtitle: customData.hero_subtitle || variantMessages.hero_subtitle || variantMessages.subtitle || tplMsgMap.hero_subtitle || tplMsgMap.subtitle || 'A magical surprise crafted just for you',
    subtitle: customData.subtitle || variantMessages.subtitle || variantMessages.hero_subtitle || tplMsgMap.subtitle || 'A magical surprise crafted just for you',
    gallery_heading: customData.gallery_heading || variantMessages.gallery_heading || 'Treasured Memories',
    memory_heading: customData.memory_heading || variantMessages.memory_heading || 'Moments We Cherish',
    final_message: customData.final_message || variantMessages.final_message || 'Forever & Always',
    surprise_text: customData.surprise_text || variantMessages.surprise_text || 'Tap to unbox your magical surprise! 🎁'
  };

  // 3. Resolve Image Slots with Strict Fallback
  // Rule: Relationship specific -> Template Default -> null (NEVER silently use an unrelated relationship's photo!)
  const variantAssetsRaw = (variant && typeof variant.assets_json === 'string')
    ? safeJsonParse(variant.assets_json, {})
    : {};
  const variantImages = {
    ...variantAssetsRaw,
    ...(variantConfig.assets || {}),
    ...(variantConfig.images || {})
  };
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
      } else if (slotKey === 'hero_photo' || slotKey === 'cover_photo' || slotKey === 'photo_1') {
        chosenUrl = thumbnail || template.thumbnail || template.previewImage || null;
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
  } else if (variantMusic.url || variantImages.background_music) {
    defaultMusic = {
      id: `mus_var_${variantSlug}`,
      title: variantMusic.title || `${relationshipLabel} Theme Track`,
      artist: variantMusic.artist || 'WishMagic Studio',
      playbackUrl: variantMusic.url || variantImages.background_music,
      category: 'custom',
      isSuited: true
    };
  }
  if (!defaultMusic && availableMusic.length > 0) {
    defaultMusic = availableMusic.find(m => m.isSuited) || availableMusic[0];
  }

  // 5. Resolve Theme & Visual Palette
  const variantTheme = variantConfig.theme || {};
  const variantPalette = variantConfig.palette || variantTheme.palette || {};
  const primaryColor = customData.accentColor || customData.accent_color || variantPalette.primary || variantTheme.primary || variantTheme.accentColor || versionTheme.accentColor || '#ec4899';
  const secondaryColor = variantPalette.secondary || variantTheme.secondary || versionTheme.secondaryColor || '#8b5cf6';
  const accentHighlight = variantPalette.accent || variantTheme.accent || '#fbbf24';

  const theme = {
    mood: customData.mood || variantTheme.mood || versionTheme.mood || 'Magical & Celebratory',
    accentColor: primaryColor,
    primary: primaryColor,
    secondary: secondaryColor,
    accent: accentHighlight,
    backgroundStyle: variantTheme.backgroundStyle || versionTheme.backgroundStyle || 'cosmic-purple',
    gradient: variantTheme.gradient || versionTheme.gradient || 'from-pink-500 via-purple-600 to-amber-400',
    cardStyle: variantTheme.cardStyle || 'glass-glow',
    textColor: variantTheme.textColor || '#ffffff',
    fontFamily: variantTheme.fontFamily || 'Plus Jakarta Sans',
    particles: variantConfig.effects?.particles || 'magic-sparkles'
  };

  // 6. Resolve Sections Ordering & Overrides
  const variantSectionsRaw = (variant && typeof variant.sections_json === 'string')
    ? safeJsonParse(variant.sections_json, [])
    : (Array.isArray(variantConfig.sections) ? variantConfig.sections : []);

  let sections = [];
  if (Array.isArray(variantSectionsRaw) && variantSectionsRaw.length > 0) {
    sections = variantSectionsRaw;
  } else if (Array.isArray(versionSections) && versionSections.length > 0) {
    sections = versionSections.map((s, idx) => {
      const name = typeof s === 'string' ? s : (s.label || s.name || s.title || s.type || `Section ${idx + 1}`);
      const type = typeof s === 'string' ? s.toLowerCase().replace(/\s+/g, '_') : (s.id || s.type || s.key);
      return {
        id: (typeof s === 'object' && (s.id || s.key)) ? (s.id || s.key) : `sec_${idx + 1}`,
        type,
        name,
        label: name,
        required: Boolean(s && s.required),
        toggleable: s && s.toggleable !== undefined ? Boolean(s.toggleable) : !Boolean(s && s.required),
        isEnabled: s && s.defaultEnabled !== undefined ? Boolean(s.defaultEnabled) : true,
        sortOrder: (s && s.order) || idx + 1
      };
    });
  }

  // 7. Resolve Variant-Specific Fields
  const variantFieldsRaw = (variant && typeof variant.fields_json === 'string')
    ? safeJsonParse(variant.fields_json, [])
    : (Array.isArray(variantConfig.fields) ? variantConfig.fields : []);
  const resolvedFields = mergeTemplateAndVariantFields(baseFieldsList, variantFieldsRaw, variantMessages, variantImages);

  // 8. Resolve Effects & Animations
  const effects = {
    particles: variantConfig.effects?.particles || 'confetti-and-stars',
    floatingElements: variantConfig.effects?.floatingElements ?? true,
    glowIntensity: variantConfig.effects?.glowIntensity || 'medium',
    confettiColors: variantConfig.effects?.confettiColors || [primaryColor, secondaryColor, accentHighlight, '#38bdf8']
  };

  const animations = {
    intensity: variantConfig.animations?.intensity || 'smooth',
    duration: variantConfig.animations?.duration || 1.2,
    entrance: variantConfig.animations?.entrance || 'fade-slide-up',
    sectionTransition: variantConfig.animations?.sectionTransition || 'smooth-stagger'
  };

  return {
    templateId: template.id,
    templateFamilyId: (variant && variant.template_family_id) || templateVersion.template_family_id || `fam_${template.id}`,
    templateVersionId: templateVersion.id || `tv_${template.id}_v1`,
    relationship: {
      id: variant ? (variant.relationship_id || variant.relationshipId) : (relMeta ? relMeta.id : null),
      slug: relationshipSlug,
      label: relationshipLabel
    },
    relationshipId: variant ? (variant.relationship_id || variant.relationshipId) : (relMeta ? relMeta.id : null),
    relationshipSlug,
    relationshipLabel,
    variantId: variant ? variant.id : null,
    variantSlug,
    variantStatus: variant ? (variant.status || VARIANT_STATUS.PUBLISHED) : VARIANT_STATUS.PUBLISHED,
    versionNumber: variant ? (variant.version_number || 1) : 1,
    entryFile,
    thumbnail,
    general,
    messages,
    fields: resolvedFields,
    images: resolvedImages,
    music: {
      defaultMusic,
      availableTracks: availableMusic
    },
    theme,
    palette: {
      primary: primaryColor,
      secondary: secondaryColor,
      accent: accentHighlight
    },
    sections,
    effects,
    animations,
    capabilities: versionCapabilities
  };
}

/**
 * Builds a deterministic D1 `template_relationship_variants` record from a normalized UTP v1.1.0 variant object
 */
export function buildVariantRecordFromUtpDeclaration(normVar, context = {}) {
  const ctxObj = (context && typeof context === 'object') ? context : {};
  const templateId = ctxObj.templateId || ctxObj.id || 'tpl_custom';
  const templateFamilyId = ctxObj.templateFamilyId || `fam_${templateId}`;
  const versionId = ctxObj.versionId || `ver_${templateId}_v1`;
  const versionNumber = ctxObj.versionNumber || 1;
  const shouldPublish = ctxObj.shouldPublish !== undefined
    ? Boolean(ctxObj.shouldPublish)
    : (String(normVar?.status || 'published').toLowerCase() === 'published');
  const imgbbUrlByRelPath = ctxObj.imgbbUrlByRelPath instanceof Map ? ctxObj.imgbbUrlByRelPath : new Map();
  const b2MediaUrlByRelPath = ctxObj.b2MediaUrlByRelPath instanceof Map ? ctxObj.b2MediaUrlByRelPath : new Map();
  const fallbackThumbnail = ctxObj.fallbackThumbnail || '';
  const nowIso = ctxObj.nowIso || new Date().toISOString();

  const resolveAssetPath = (rawPath) => {
    if (!rawPath || typeof rawPath !== 'string') return '';
    const trimmed = rawPath.trim();
    if (!trimmed || trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
      return trimmed;
    }
    const cleanRel = trimmed.replace(/\\/g, '/').replace(/^\.?\/+/, '');
    if (imgbbUrlByRelPath instanceof Map && imgbbUrlByRelPath.has(cleanRel)) {
      return imgbbUrlByRelPath.get(cleanRel);
    }
    if (b2MediaUrlByRelPath instanceof Map && b2MediaUrlByRelPath.has(cleanRel)) {
      return b2MediaUrlByRelPath.get(cleanRel);
    }
    if (imgbbUrlByRelPath instanceof Map) {
      for (const [k, v] of imgbbUrlByRelPath.entries()) {
        if (k.toLowerCase() === cleanRel.toLowerCase() || k.split('/').pop() === cleanRel.split('/').pop()) {
          return v;
        }
      }
    }
    if (b2MediaUrlByRelPath instanceof Map) {
      for (const [k, v] of b2MediaUrlByRelPath.entries()) {
        if (k.toLowerCase() === cleanRel.toLowerCase() || k.split('/').pop() === cleanRel.split('/').pop()) {
          return v;
        }
      }
    }
    return `/api/templates/${templateId}/versions/${versionId}/preview/${cleanRel}`;
  };

  const relMeta = normalizeRelationshipIdentifier(normVar.relationship || normVar.relationshipId || normVar.slug, normVar.label || normVar.relationshipLabel);
  const relSlug = relMeta ? relMeta.slug : (normVar.relationship || normVar.slug || 'friend');
  const relId = relMeta ? relMeta.id : `rel_${relSlug}`;
  const relLabel = normVar.label || normVar.relationshipLabel || (relMeta ? relMeta.label : relSlug);
  const variantSlug = String(normVar.slug || relSlug).toLowerCase().replace(/[^a-z0-9_-]/g, '-');

  // Stable deterministic ID per (templateId, variantSlug) so re-uploading updates cleanly without duplicating
  const stableId = `trv_${templateId}_${variantSlug}`;

  const resolvedAssets = {};
  for (const [aKey, aVal] of Object.entries(normVar.assets || normVar.images || {})) {
    const rawStr = typeof aVal === 'string' ? aVal : (aVal?.url || aVal?.path || aVal?.src || '');
    resolvedAssets[aKey] = rawStr ? resolveAssetPath(rawStr) : aVal;
  }

  const resolvedFields = Array.isArray(normVar.fields)
    ? normVar.fields.map(f => {
        if (['image', 'audio', 'video'].includes(f.type) && typeof f.defaultValue === 'string' && f.defaultValue.trim()) {
          return { ...f, defaultValue: resolveAssetPath(f.defaultValue) };
        }
        return { ...f };
      })
    : [];

  const resolvedThumbnail = normVar.thumbnail
    ? resolveAssetPath(normVar.thumbnail)
    : (resolvedAssets.photo_1 || resolvedAssets.hero_photo || resolvedAssets.cover_photo || fallbackThumbnail || '');

  const declaredStatus = String(normVar.status || '').toLowerCase();
  let effectiveStatus = shouldPublish ? VARIANT_STATUS.PUBLISHED : VARIANT_STATUS.READY;
  if (declaredStatus === 'draft' || declaredStatus === 'disabled' || declaredStatus === 'archived') {
    effectiveStatus = declaredStatus;
  } else if (declaredStatus === 'published' && shouldPublish) {
    effectiveStatus = VARIANT_STATUS.PUBLISHED;
  }

  const enabled = normVar.enabled !== false && effectiveStatus !== 'disabled' && effectiveStatus !== 'archived';

  const preset = getDefaultRelationshipVariantConfig(templateId, {
    id: relId,
    slug: relSlug,
    name: relLabel,
    displayName: normVar.name || `${relLabel} Edition`
  });

  const mergedMessages = {
    ...preset.messages,
    ...(normVar.messages || {})
  };
  if (mergedMessages.custom_message && !mergedMessages.main_message) {
    mergedMessages.main_message = mergedMessages.custom_message;
  } else if (mergedMessages.main_message && !mergedMessages.custom_message) {
    mergedMessages.custom_message = mergedMessages.main_message;
  }

  const mergedTheme = {
    ...preset.theme,
    ...(normVar.theme || {}),
    accentColor: normVar.theme?.accentColor || normVar.palette?.primary || normVar.theme?.primary || preset.theme.accentColor || '#ec4899',
    primary: normVar.palette?.primary || normVar.theme?.primary || normVar.theme?.accentColor || preset.theme.accentColor || '#ec4899',
    secondary: normVar.palette?.secondary || normVar.theme?.secondary || '#8b5cf6',
    accent: normVar.palette?.accent || normVar.theme?.accent || '#fbbf24'
  };

  const configObj = {
    id: stableId,
    declaredVariantId: normVar.id,
    slug: variantSlug,
    relationshipId: relId,
    relationshipSlug: relSlug,
    relationshipLabel: relLabel,
    label: relLabel,
    icon: normVar.icon || (relMeta ? relMeta.icon : '✨'),
    displayName: normVar.name || `${relLabel} Edition`,
    description: normVar.description || '',
    category: normVar.category || 'celebration',
    thumbnail: resolvedThumbnail,
    entry: normVar.entry || 'index.html',
    default: Boolean(normVar.default),
    atmosphere: normVar.theme?.mood || preset.atmosphere || 'Joyful & Celebratory',
    messages: mergedMessages,
    theme: mergedTheme,
    palette: {
      primary: mergedTheme.primary,
      secondary: mergedTheme.secondary,
      accent: mergedTheme.accent
    },
    assets: resolvedAssets,
    images: {
      ...preset.images,
      ...resolvedAssets
    },
    music: {
      ...preset.music,
      ...(normVar.music || {}),
      ...(resolvedAssets.background_music ? { url: resolvedAssets.background_music } : {})
    },
    fields: resolvedFields,
    sections: Array.isArray(normVar.sections) && normVar.sections.length > 0 ? normVar.sections : preset.sections,
    effects: {
      ...preset.effects,
      ...(normVar.effects || {})
    },
    animations: {
      ...preset.animations,
      ...(normVar.animations || {})
    }
  };

  return {
    id: stableId,
    declaredId: normVar.id,
    variant_slug: variantSlug,
    template_id: templateId,
    template_family_id: templateFamilyId,
    template_version_id: versionId,
    relationship_id: relId,
    relationship_slug: relSlug,
    relationship_label: relLabel,
    relationship_icon: normVar.icon || (relMeta ? relMeta.icon : '✨'),
    name: normVar.name || `${relLabel} Variant`,
    description: normVar.description || '',
    thumbnail: resolvedThumbnail,
    entry_file: normVar.entry || 'index.html',
    configuration: configObj,
    configuration_json: JSON.stringify(configObj),
    fields_json: JSON.stringify(resolvedFields),
    sections_json: JSON.stringify(Array.isArray(normVar.sections) ? normVar.sections : []),
    assets_json: JSON.stringify(resolvedAssets),
    status: effectiveStatus,
    enabled: enabled ? 1 : 0,
    sort_order: Number(normVar.sortOrder) || 1,
    is_default: normVar.default ? 1 : 0,
    version_number: versionNumber,
    lock_version: 1,
    is_latest: 1,
    published_at: effectiveStatus === VARIANT_STATUS.PUBLISHED ? nowIso : null,
    created_at: nowIso,
    updated_at: nowIso
  };
}

/**
 * Filters a list of raw variant records down to ONLY public, valid, published, enabled variants
 * and strips any internal storage paths or admin-only metadata.
 */
export function filterPublicAvailableVariants(rawVariants = []) {
  if (!Array.isArray(rawVariants) || rawVariants.length === 0) return [];

  const seenRels = new Set();
  const publicList = [];

  for (const v of rawVariants) {
    if (!v || typeof v !== 'object') continue;
    const status = String(v.status || 'published').toLowerCase().trim();
    const isEnabled = v.enabled === undefined ? true : Boolean(Number(v.enabled) !== 0 && v.enabled !== false);
    const isLatest = v.is_latest === undefined ? true : Boolean(Number(v.is_latest) !== 0 && v.is_latest !== false);

    // Public users must ONLY see valid, published/active, enabled variants
    if ((status !== 'published' && status !== 'active') || !isEnabled || !isLatest) {
      continue;
    }

    const cfg = typeof v.configuration_json === 'string'
      ? safeJsonParse(v.configuration_json, {})
      : (v.configuration || {});

    const rawRel = v.relationship_slug || v.relationshipSlug || v.relationship || cfg.relationshipSlug || cfg.relationship || v.relationship_id || '';
    const rawLabel = v.relationship_label || v.relationshipLabel || v.relationship_name || cfg.relationshipLabel || cfg.label || null;
    const relMeta = normalizeRelationshipIdentifier(rawRel, rawLabel);
    if (!relMeta || !relMeta.slug) continue;

    if (seenRels.has(relMeta.slug)) continue;
    seenRels.add(relMeta.slug);

    publicList.push({
      id: v.id || `trv_${relMeta.slug}`,
      slug: v.variant_slug || v.slug || cfg.slug || relMeta.slug,
      relationshipId: v.relationship_id || relMeta.id,
      relationshipSlug: relMeta.slug,
      relationship: relMeta.slug,
      label: rawLabel || relMeta.label,
      relationshipLabel: rawLabel || relMeta.label,
      name: v.name || cfg.displayName || `${relMeta.label} Edition`,
      displayName: cfg.displayName || v.name || `${relMeta.label} Edition`,
      description: v.description || cfg.description || '',
      icon: v.relationship_icon || cfg.icon || relMeta.icon || '✨',
      thumbnail: v.thumbnail || cfg.thumbnail || '',
      entryFile: v.entry_file || cfg.entry || 'index.html',
      sortOrder: Number(v.sort_order ?? cfg.sortOrder ?? relMeta.sortOrder ?? 99),
      isDefault: Boolean(v.is_default || cfg.default),
      theme: cfg.theme ? {
        accentColor: cfg.theme.accentColor || cfg.theme.primary || '#ec4899',
        primary: cfg.theme.primary || cfg.theme.accentColor || '#ec4899',
        secondary: cfg.theme.secondary || '#8b5cf6',
        accent: cfg.theme.accent || '#fbbf24',
        mood: cfg.theme.mood || ''
      } : null,
      messages: cfg.messages || null,
      assets: cfg.assets || cfg.images || null,
      fields: Array.isArray(cfg.fields) ? cfg.fields : (typeof v.fields_json === 'string' ? safeJsonParse(v.fields_json, []) : [])
    });
  }

  return publicList.sort((a, b) => (a.sortOrder - b.sortOrder) || a.label.localeCompare(b.label));
}

export const RELATIONSHIP_PRESETS = Object.freeze({
  crush: {
    displayName: 'Secret Crush Edition',
    atmosphere: 'Playful, Sweet & Enchanting',
    messages: {
      hero_title: 'To Someone Who Makes Every Day A Little Brighter ✨',
      subtitle: 'A magical surprise from someone who admires you',
      main_message: 'There is something truly magical about your smile that brightens up everything around you. Wishing you a day as extraordinary as you are!',
      gallery_heading: 'Favorite Moments',
      memory_heading: 'Reasons You Are Special',
      final_message: 'From a Secret Admirer 💕',
      surprise_text: 'Tap to uncover your secret note 💌',
      sender_placeholder: 'Your Secret Admirer',
      recipient_placeholder: 'My Crush'
    },
    theme: {
      mood: 'Sweet Admiration',
      accentColor: '#f43f5e',
      backgroundStyle: 'cosmic-rose',
      cardStyle: 'glass-glow'
    },
    music: { defaultMusicId: 'mus_romantic_piano' },
    effects: { particles: 'floating-hearts' }
  },
  girlfriend: {
    displayName: 'Dearest Girlfriend Edition',
    atmosphere: 'Romantic, Dreamy & Intimate',
    messages: {
      hero_title: 'Happy Celebration to the Love of My Life 💕',
      subtitle: 'Every moment with you is pure magic',
      main_message: 'You bring so much warmth, laughter, and beauty into my world. Thank you for being my favorite story and my sweetest adventure.',
      gallery_heading: 'Our Love Story',
      memory_heading: 'Unforgettable Days Together',
      final_message: 'Forever & Always With All My Heart ❤️',
      surprise_text: 'Unbox my heart for you 🎁',
      sender_placeholder: 'With All My Love',
      recipient_placeholder: 'My Beautiful Girlfriend'
    },
    theme: {
      mood: 'Deep Romance',
      accentColor: '#ec4899',
      backgroundStyle: 'cosmic-pink',
      cardStyle: 'glass-glow'
    },
    music: { defaultMusicId: 'mus_romantic_piano' },
    effects: { particles: 'floating-hearts' }
  },
  boyfriend: {
    displayName: 'Handsome Boyfriend Edition',
    atmosphere: 'Warm, Loving & Playful',
    messages: {
      hero_title: 'Happy Celebration to My Favorite Person 💙',
      subtitle: 'A special surprise crafted just for you',
      main_message: 'Thank you for being my constant rock, my greatest laugh, and my favorite adventure. Wishing you the most incredible celebration ahead!',
      gallery_heading: 'Our Adventures',
      memory_heading: 'Every Memory With You',
      final_message: 'With all my love and hugs 💫',
      surprise_text: 'Tap for your special gift 🎁',
      sender_placeholder: 'Your Biggest Fan',
      recipient_placeholder: 'My Handsome Boyfriend'
    },
    theme: {
      mood: 'Warm Affection',
      accentColor: '#3b82f6',
      backgroundStyle: 'cosmic-blue',
      cardStyle: 'glass-glow'
    },
    music: { defaultMusicId: 'mus_romantic_piano' },
    effects: { particles: 'stars-and-sparks' }
  },
  brother: {
    displayName: 'Brotherhood Edition',
    atmosphere: 'Bold, Energetic & Loyal',
    messages: {
      hero_title: 'Happy Celebration to My Brother From Day One 👊',
      subtitle: 'Built on loyalty, laughs, and legendary memories',
      main_message: 'Growing up and sharing life with you is the greatest privilege. Thank you for always having my back through thick and thin!',
      gallery_heading: 'Hall of Brotherhood',
      memory_heading: 'Legendary Moments',
      final_message: 'Brothers for life, no matter what! 🚀',
      surprise_text: 'Tap to unlock the brotherhood vault! 🏆',
      sender_placeholder: 'Your Brother / Sibling',
      recipient_placeholder: 'My Brother'
    },
    theme: {
      mood: 'Bold Brotherhood',
      accentColor: '#2563eb',
      backgroundStyle: 'cosmic-blue',
      cardStyle: 'glass-glow'
    },
    music: { defaultMusicId: 'mus_celebration_strings' },
    effects: { particles: 'confetti-and-stars' }
  },
  sister: {
    displayName: 'Beloved Sister Edition',
    atmosphere: 'Sparkling, Warm & Heartfelt',
    messages: {
      hero_title: 'Happy Celebration to the Best Sister Ever 🦋',
      subtitle: 'My forever friend and brightest sunshine',
      main_message: 'Thank you for filling life with endless giggles, fierce support, and the warmest hugs. Wishing you a year as radiant as your heart!',
      gallery_heading: 'Sisterhood Memories',
      memory_heading: 'Our Sweetest Moments',
      final_message: 'Love you to the moon and back 💖',
      surprise_text: 'Tap to open your special surprise! 🎀',
      sender_placeholder: 'With All My Love',
      recipient_placeholder: 'My Dearest Sister'
    },
    theme: {
      mood: 'Radiant Sisterhood',
      accentColor: '#ec4899',
      backgroundStyle: 'cosmic-pink',
      cardStyle: 'glass-glow'
    },
    music: { defaultMusicId: 'mus_celebration_strings' },
    effects: { particles: 'confetti-and-stars' }
  },
  mother: {
    displayName: 'Dearest Mother Edition',
    atmosphere: 'Graceful, Warm & Reverent',
    messages: {
      hero_title: 'To the Heart & Soul of Our Family, Mom 🌸',
      subtitle: 'With boundless gratitude and unconditional love',
      main_message: 'Thank you for every prayer, every sacrifice, and the gentle warmth that makes our world complete. May your day be filled with peace and joy!',
      gallery_heading: 'Cherished Family Moments',
      memory_heading: 'Lessons of Love',
      final_message: 'Forever grateful to be yours 💐',
      surprise_text: 'Tap to open your heartfelt tribute 🌺',
      sender_placeholder: 'Your Loving Child',
      recipient_placeholder: 'Dearest Mom'
    },
    theme: {
      mood: 'Warm Reverence',
      accentColor: '#f59e0b',
      backgroundStyle: 'golden-warmth',
      cardStyle: 'glass-glow'
    },
    music: { defaultMusicId: 'mus_golden_elegance' },
    effects: { particles: 'golden-glitter' }
  },
  father: {
    displayName: 'Loving Father Edition',
    atmosphere: 'Noble, Warm & Appreciative',
    messages: {
      hero_title: 'To My Hero & Guiding Light, Dad 👔',
      subtitle: 'Honoring your strength, wisdom, and kindness',
      main_message: 'Thank you for always standing tall for us, guiding us with patience, and inspiring us every single day. Wishing you the happiest celebration!',
      gallery_heading: 'Moments of Pride',
      memory_heading: 'Milestones Together',
      final_message: 'With deepest respect and love 🌟',
      surprise_text: 'Tap to reveal your tribute 🎁',
      sender_placeholder: 'With Pride & Love',
      recipient_placeholder: 'Dearest Dad'
    },
    theme: {
      mood: 'Noble Warmth',
      accentColor: '#0284c7',
      backgroundStyle: 'cosmic-blue',
      cardStyle: 'glass-glow'
    },
    music: { defaultMusicId: 'mus_golden_elegance' },
    effects: { particles: 'stars-and-sparks' }
  },
  wife: {
    displayName: 'Beloved Wife Edition',
    atmosphere: 'Elegant, Deep Devotion & Warmth',
    messages: {
      hero_title: 'Happy Celebration to My Beautiful Wife 💍',
      subtitle: 'Honoring the heart and soul of our home',
      main_message: 'Thank you for filling every day of our life with grace, devotion, and boundless love. You make every milestone meaningful and every tomorrow worth dreaming of.',
      gallery_heading: 'Our Journey of Love',
      memory_heading: 'Cherished Milestones',
      final_message: 'Forever Grateful & Devoted to You 💖',
      surprise_text: 'A gift of endless love for you 💐',
      sender_placeholder: 'Your Loving Husband',
      recipient_placeholder: 'My Dearest Wife'
    },
    theme: {
      mood: 'Timeless Devotion',
      accentColor: '#d946ef',
      backgroundStyle: 'purple-gold',
      cardStyle: 'glass-glow'
    },
    music: { defaultMusicId: 'mus_golden_elegance' },
    effects: { particles: 'golden-glitter' }
  },
  husband: {
    displayName: 'Loving Husband Edition',
    atmosphere: 'Regal, Warm & Loving',
    messages: {
      hero_title: 'To My Amazing Husband & Best Friend 👑',
      subtitle: 'Celebrating the anchor of my world',
      main_message: 'Here is to celebrating the wonderful man you are. Your strength, kindness, and love make our life so rich, joyful, and complete.',
      gallery_heading: 'Moments by Your Side',
      memory_heading: 'Memories We Built Together',
      final_message: 'With endless love and pride 🌟',
      surprise_text: 'Unbox your royal surprise 🎁',
      sender_placeholder: 'Your Loving Wife',
      recipient_placeholder: 'My Wonderful Husband'
    },
    theme: {
      mood: 'Regal Warmth',
      accentColor: '#8b5cf6',
      backgroundStyle: 'midnight-gold',
      cardStyle: 'glass-glow'
    },
    music: { defaultMusicId: 'mus_golden_elegance' },
    effects: { particles: 'stars-and-sparks' }
  },
  best_friend: {
    displayName: 'Best Friend Forever Edition',
    atmosphere: 'Joyful, Energetic & Celebratory',
    messages: {
      hero_title: 'Happy Celebration to My Ride-or-Die Bestie 🌟',
      subtitle: 'Cheers to another year of crazy memories!',
      main_message: 'From all the uncontrollable laughing fits to late-night talks, life is a thousand times better with you as my best friend. May your year be packed with massive wins and wild adventures!',
      gallery_heading: 'Hall of Chaos & Laughs',
      memory_heading: 'Legendary Memories',
      final_message: 'Best friends for life, no matter what! 🚀',
      surprise_text: 'Tap to detonate the party confetti! 💥',
      sender_placeholder: 'Your Ride-or-Die',
      recipient_placeholder: 'My Best Friend'
    },
    theme: {
      mood: 'High Energy',
      accentColor: '#eab308',
      backgroundStyle: 'vibrant-sunshine',
      cardStyle: 'glass-glow'
    },
    music: { defaultMusicId: 'mus_celebration_strings' },
    effects: { particles: 'confetti-and-stars' }
  },
  friend: {
    displayName: 'Best Friend Forever Edition',
    atmosphere: 'Joyful, Energetic & Celebratory',
    messages: {
      hero_title: 'Happy Celebration to My Partner-In-Crime 🎈',
      subtitle: 'Cheers to another year of crazy memories!',
      main_message: 'From all the uncontrollable laughing fits to late-night talks, life is a thousand times better with you as my best friend. May your year be packed with massive wins and wild adventures!',
      gallery_heading: 'Hall of Chaos & Laughs',
      memory_heading: 'Legendary Memories',
      final_message: 'Friends for life, no matter what! 🚀',
      surprise_text: 'Tap to detonate the party confetti! 💥',
      sender_placeholder: 'Your Partner-In-Crime',
      recipient_placeholder: 'My Best Friend'
    },
    theme: {
      mood: 'High Energy',
      accentColor: '#eab308',
      backgroundStyle: 'vibrant-sunshine',
      cardStyle: 'glass-glow'
    },
    music: { defaultMusicId: 'mus_celebration_strings' },
    effects: { particles: 'confetti-and-stars' }
  },
  parents: {
    displayName: 'Family Tribute Edition',
    atmosphere: 'Peaceful, Nostalgic & Sacred',
    messages: {
      hero_title: 'With Utmost Gratitude & Love 🌸',
      subtitle: 'A heartfelt tribute to the guiding light of our family',
      main_message: 'Thank you for your tireless sacrifices, your unconditional blessings, and your warm embrace that makes our house a true home.',
      gallery_heading: 'Generations of Love',
      memory_heading: 'Moments of Gratitude',
      final_message: 'Forever grateful for your love and wisdom 🙏',
      surprise_text: 'A tribute wrapped with blessings 🌺',
      sender_placeholder: 'With Love & Respect',
      recipient_placeholder: 'Mom & Dad'
    },
    theme: {
      mood: 'Warm Reverence',
      accentColor: '#f59e0b',
      backgroundStyle: 'golden-warmth',
      cardStyle: 'glass-glow'
    },
    music: { defaultMusicId: 'mus_golden_elegance' },
    effects: { particles: 'golden-glitter' }
  }
});

/**
 * Generates an authoritative default configuration for a given relationship variant
 */
export function getDefaultRelationshipVariantConfig(templateId, relInput) {
  const relKey = typeof relInput === 'string'
    ? relInput.toLowerCase().replace(/^rel_/, '')
    : ((relInput?.slug || relInput?.id || '').toLowerCase().replace(/^rel_/, ''));
  
  const relName = (typeof relInput === 'object' && (relInput.displayName || relInput.name)) || (relKey.charAt(0).toUpperCase() + relKey.slice(1));
  const preset = RELATIONSHIP_PRESETS[relKey] || {
    displayName: `${relName} Edition`,
    atmosphere: 'Joyful & Celebratory',
    messages: {
      hero_title: `Happy Celebration, ${relName}! ✨`,
      subtitle: 'A magical gift created especially for you',
      main_message: `Wishing you a day filled with laughter, love, and extraordinary moments.`,
      gallery_heading: 'Treasured Memories',
      memory_heading: 'Special Moments',
      final_message: 'Always in our hearts 💕',
      surprise_text: 'Tap to unbox your surprise 🎁'
    },
    theme: {
      mood: 'Vibrant Celebration',
      accentColor: '#a855f7',
      backgroundStyle: 'cosmic-purple',
      cardStyle: 'glass-glow'
    },
    music: { defaultMusicId: 'mus_celebration_strings' },
    effects: { particles: 'confetti-and-stars' }
  };

  return {
    displayName: preset.displayName,
    atmosphere: preset.atmosphere,
    messages: { ...preset.messages },
    theme: { ...preset.theme },
    images: {
      hero_photo: null,
      hero_photo_fallback: 'template_default'
    },
    music: { ...preset.music },
    sections: [
      { id: 'sec_1', type: 'hero', name: 'Hero Unboxing', isEnabled: true, sortOrder: 1 },
      { id: 'sec_2', type: 'letter', name: 'Dedication Note', isEnabled: true, sortOrder: 2 },
      { id: 'sec_3', type: 'photos', name: 'Photo Highlights', isEnabled: true, sortOrder: 3 },
      { id: 'sec_4', type: 'surprise', name: 'Finale Celebration', isEnabled: true, sortOrder: 4 }
    ],
    effects: { ...preset.effects },
    animations: {
      intensity: 'smooth',
      duration: 1.2
    }
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
    relationship_label: targetRelationship.name || targetRelationship.displayName || targetRelationship.slug,
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
