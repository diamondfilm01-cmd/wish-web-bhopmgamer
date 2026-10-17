/**
 * WishMagic Universal Template Protocol (UTP v1.0.0 / v1.1.0)
 * ============================================================
 * Formal machine-readable specification for self-contained celebration templates,
 * including UTP v1.1.0 multi-relationship variant families.
 * Defines the canonical manifest schema (`wishmagic.json`), supported field types,
 * binding targets, section contracts, variant declarations, and capability registry.
 */

export const UTP_SCHEMA_VERSION = '1.0.0';
export const UTP_LATEST_SCHEMA_VERSION = '1.1.0';
export const UTP_VARIANT_SCHEMA_VERSION = '1.1.0';
export const UTP_SUPPORTED_SCHEMA_VERSIONS = Object.freeze(['1.0.0', '1.1.0']);
export const UTP_RUNTIME_API_VERSION = '1.0';
export const UTP_PROTOCOL_NAME = 'wishmagic-template';

/**
 * Supported customization field types in `wishmagic.json`
 */
export const UTP_SUPPORTED_FIELD_TYPES = new Set([
  'text',
  'textarea',
  'date',
  'time',
  'datetime',
  'number',
  'email',
  'url',
  'phone',
  'color',
  'select',
  'multiselect',
  'toggle',
  'range',
  'image',
  'image-multiple',
  'video',
  'video-multiple',
  'audio',
  'voice',
  'font',
  'icon'
]);

/**
 * Supported DOM / CSS / JS binding targets for fields
 */
export const UTP_SUPPORTED_BINDING_TARGETS = new Set([
  'text',
  'src',
  'background-image',
  'href',
  'style-property',
  'css-variable',
  'visibility',
  'toggle',
  'collection',
  'value'
]);

/**
 * Canonical relationship identifiers supported across the platform
 */
export const UTP_CANONICAL_RELATIONSHIPS = new Set([
  'friend',
  'best_friend',
  'boyfriend',
  'girlfriend',
  'husband',
  'wife',
  'partner',
  'fiance',
  'mother',
  'father',
  'parents',
  'sister',
  'brother',
  'sibling',
  'son',
  'daughter',
  'child',
  'grandparents',
  'colleague',
  'boss',
  'mentor',
  'teacher',
  'crush',
  'family',
  'custom',
  'any'
]);

/**
 * Canonical metadata catalog for relationships (IDs, slugs, display labels, icons, categories)
 */
export const UTP_RELATIONSHIP_CATALOG = Object.freeze({
  best_friend: { id: 'rel_best_friend', slug: 'best_friend', label: 'Best Friend', displayName: 'Best Friend Forever', icon: '🌟', category: 'friendship', sortOrder: 1 },
  brother: { id: 'rel_brother', slug: 'brother', label: 'Brother', displayName: 'Brother Edition', icon: '👊', category: 'family', sortOrder: 2 },
  sister: { id: 'rel_sister', slug: 'sister', label: 'Sister', displayName: 'Beloved Sister', icon: '🦋', category: 'family', sortOrder: 3 },
  boyfriend: { id: 'rel_boyfriend', slug: 'boyfriend', label: 'Boyfriend', displayName: 'Handsome Boyfriend', icon: '💙', category: 'romantic', sortOrder: 4 },
  girlfriend: { id: 'rel_girlfriend', slug: 'girlfriend', label: 'Girlfriend', displayName: 'Dearest Girlfriend', icon: '💖', category: 'romantic', sortOrder: 5 },
  mother: { id: 'rel_mother', slug: 'mother', label: 'Mother', displayName: 'Dearest Mother', icon: '🌸', category: 'family', sortOrder: 6 },
  father: { id: 'rel_father', slug: 'father', label: 'Father', displayName: 'Loving Father', icon: '👔', category: 'family', sortOrder: 7 },
  parents: { id: 'rel_parents', slug: 'parents', label: 'Parents', displayName: 'Mom & Dad Together', icon: '🌺', category: 'family', sortOrder: 8 },
  wife: { id: 'rel_wife', slug: 'wife', label: 'Wife', displayName: 'Beloved Wife', icon: '💍', category: 'romantic', sortOrder: 9 },
  husband: { id: 'rel_husband', slug: 'husband', label: 'Husband', displayName: 'Loving Husband', icon: '👑', category: 'romantic', sortOrder: 10 },
  crush: { id: 'rel_crush', slug: 'crush', label: 'Crush', displayName: 'Secret Crush', icon: '✨', category: 'romantic', sortOrder: 11 },
  friend: { id: 'rel_friend', slug: 'friend', label: 'Friend', displayName: 'Dear Friend', icon: '🎈', category: 'friendship', sortOrder: 12 },
  partner: { id: 'rel_partner', slug: 'partner', label: 'Partner', displayName: 'Beloved Partner', icon: '💫', category: 'romantic', sortOrder: 13 },
  fiance: { id: 'rel_fiance', slug: 'fiance', label: 'Fiance', displayName: 'Beloved Fiance', icon: '💎', category: 'romantic', sortOrder: 14 },
  sibling: { id: 'rel_sibling', slug: 'sibling', label: 'Sibling', displayName: 'Sibling Edition', icon: '🤝', category: 'family', sortOrder: 15 },
  son: { id: 'rel_son', slug: 'son', label: 'Son', displayName: 'Dearest Son', icon: '🚀', category: 'family', sortOrder: 16 },
  daughter: { id: 'rel_daughter', slug: 'daughter', label: 'Daughter', displayName: 'Dearest Daughter', icon: '🌷', category: 'family', sortOrder: 17 },
  grandparents: { id: 'rel_grandparents', slug: 'grandparents', label: 'Grandparents', displayName: 'Beloved Grandparents', icon: '🕊️', category: 'family', sortOrder: 18 },
  family: { id: 'rel_family', slug: 'family', label: 'Family', displayName: 'Family Edition', icon: '🏡', category: 'family', sortOrder: 19 },
  colleague: { id: 'rel_colleague', slug: 'colleague', label: 'Colleague', displayName: 'Valued Colleague', icon: '🎉', category: 'professional', sortOrder: 20 },
  teacher: { id: 'rel_teacher', slug: 'teacher', label: 'Teacher', displayName: 'Inspiring Teacher', icon: '📚', category: 'professional', sortOrder: 21 },
  mentor: { id: 'rel_mentor', slug: 'mentor', label: 'Mentor', displayName: 'Trusted Mentor', icon: '🧭', category: 'professional', sortOrder: 22 }
});

/**
 * Normalizes any relationship string or object into canonical relationship metadata
 */
export function normalizeRelationshipIdentifier(relInput, customLabel = null) {
  if (!relInput) return null;
  let rawSlug = '';
  let explicitLabel = customLabel;
  let explicitIcon = null;

  if (typeof relInput === 'object') {
    rawSlug = String(relInput.slug || relInput.relationship || relInput.relationshipId || relInput.id || relInput.name || '').trim();
    explicitLabel = explicitLabel || relInput.label || relInput.relationshipLabel || relInput.name || relInput.displayName || null;
    explicitIcon = relInput.icon || null;
  } else {
    rawSlug = String(relInput).trim();
  }

  if (!rawSlug) return null;

  let cleanSlug = rawSlug
    .toLowerCase()
    .replace(/^rel_/, '')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '');

  // Common synonyms normalization
  const synonymMap = {
    bestfriend: 'best_friend',
    bestie: 'best_friend',
    bff: 'best_friend',
    bro: 'brother',
    sis: 'sister',
    bf: 'boyfriend',
    gf: 'girlfriend',
    mom: 'mother',
    mum: 'mother',
    dad: 'father',
    papa: 'father'
  };
  if (synonymMap[cleanSlug]) {
    cleanSlug = synonymMap[cleanSlug];
  }

  if (!cleanSlug) return null;

  const catalogEntry = UTP_RELATIONSHIP_CATALOG[cleanSlug];
  const fallbackLabel = cleanSlug
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const resolvedLabel = (explicitLabel && String(explicitLabel).trim())
    ? String(explicitLabel).trim()
    : (catalogEntry ? catalogEntry.label : fallbackLabel);

  return {
    id: catalogEntry ? catalogEntry.id : `rel_${cleanSlug}`,
    slug: cleanSlug,
    label: resolvedLabel,
    name: resolvedLabel,
    displayName: catalogEntry ? catalogEntry.displayName : `${resolvedLabel} Edition`,
    icon: explicitIcon || (catalogEntry ? catalogEntry.icon : '✨'),
    category: catalogEntry ? catalogEntry.category : 'celebration',
    sortOrder: catalogEntry ? catalogEntry.sortOrder : 99,
    isCanonical: UTP_CANONICAL_RELATIONSHIPS.has(cleanSlug)
  };
}

/**
 * Canonical template categories
 */
export const UTP_CATEGORIES = new Set([
  'birthday',
  'anniversary',
  'love',
  'romantic',
  'friendship',
  'thank-you',
  'congratulations',
  'festival',
  'festivals',
  'apology',
  'proposal',
  'wedding',
  'graduation',
  'new-baby',
  'farewell',
  'celebration',
  'general'
]);

/**
 * Canonical template pricing tiers
 */
export const UTP_TIERS = new Set(['free', 'vip', 'premium']);

/**
 * Capability Registry: maps capability keys to customizer controls and runtime requirements
 */
export const UTP_CAPABILITY_REGISTRY = Object.freeze({
  photos: {
    key: 'photos',
    label: 'Single or Cover Photo',
    customizerGroup: 'media',
    requiresFieldTypes: ['image', 'image-multiple']
  },
  multiplePhotos: {
    key: 'multiplePhotos',
    label: 'Multiple Photo Slots',
    customizerGroup: 'media',
    requiresFieldTypes: ['image', 'image-multiple']
  },
  gallery: {
    key: 'gallery',
    label: 'Photo Gallery Layout',
    customizerGroup: 'media',
    requiresFieldTypes: ['image', 'image-multiple']
  },
  music: {
    key: 'music',
    label: 'Background Music Track',
    customizerGroup: 'audio',
    requiresFieldTypes: ['audio']
  },
  audio: {
    key: 'audio',
    label: 'Background Audio',
    customizerGroup: 'audio',
    requiresFieldTypes: ['audio']
  },
  voice: {
    key: 'voice',
    label: 'Spoken Voice Note',
    customizerGroup: 'audio',
    requiresFieldTypes: ['voice']
  },
  voiceNote: {
    key: 'voiceNote',
    label: 'Spoken Voice Note',
    customizerGroup: 'audio',
    requiresFieldTypes: ['voice']
  },
  video: {
    key: 'video',
    label: 'Video Clip',
    customizerGroup: 'media',
    requiresFieldTypes: ['video', 'video-multiple']
  },
  multipleVideos: {
    key: 'multipleVideos',
    label: 'Multiple Video Clips',
    customizerGroup: 'media',
    requiresFieldTypes: ['video-multiple', 'video']
  },
  countdown: {
    key: 'countdown',
    label: 'Live Event Countdown',
    customizerGroup: 'sections',
    requiresFieldTypes: ['date', 'datetime']
  },
  timeline: {
    key: 'timeline',
    label: 'Memory Timeline',
    customizerGroup: 'sections',
    requiresFieldTypes: []
  },
  themes: {
    key: 'themes',
    label: 'Theme & Color Palette Support',
    customizerGroup: 'style',
    requiresFieldTypes: ['color']
  },
  themeSupport: {
    key: 'themeSupport',
    label: 'Theme Support',
    customizerGroup: 'style',
    requiresFieldTypes: []
  },
  animations: {
    key: 'animations',
    label: 'Interactive Animations',
    customizerGroup: 'style',
    requiresFieldTypes: []
  },
  animationSupport: {
    key: 'animationSupport',
    label: 'Animation Support',
    customizerGroup: 'style',
    requiresFieldTypes: []
  },
  particles: {
    key: 'particles',
    label: 'Ambient Particles & Confetti',
    customizerGroup: 'effects',
    requiresFieldTypes: []
  },
  sections: {
    key: 'sections',
    label: 'Toggleable Template Sections',
    customizerGroup: 'sections',
    requiresFieldTypes: []
  },
  secretMessage: {
    key: 'secretMessage',
    label: 'Locked / Secret Message Reveal',
    customizerGroup: 'sections',
    requiresFieldTypes: []
  },
  openWhen: {
    key: 'openWhen',
    label: 'Open When Envelopes',
    customizerGroup: 'sections',
    requiresFieldTypes: []
  },
  finalSurprise: {
    key: 'finalSurprise',
    label: 'Grand Finale Celebration',
    customizerGroup: 'sections',
    requiresFieldTypes: []
  },
  variants: {
    key: 'variants',
    label: 'Multi-Relationship Template Variants',
    customizerGroup: 'personal',
    requiresFieldTypes: []
  }
});

/**
 * Checks if a version string is valid SemVer (X.Y.Z)
 */
export function isValidSemver(version) {
  if (!version || typeof version !== 'string') return false;
  return /^[vV]?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version.trim());
}

/**
 * Checks identifier slug format (lowercase letters, numbers, underscores, hyphens)
 */
export function isValidIdentifier(id) {
  if (!id || typeof id !== 'string') return false;
  return /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(id.trim());
}
