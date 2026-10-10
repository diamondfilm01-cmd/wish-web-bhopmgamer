/**
 * WishMagic Universal Template Protocol (UTP) v1.0
 * Canonical Schema Definition, Capability Registry & Validation Standards
 * 
 * Target: Google AI Studio Template Generation, Ingestion Pipeline & Cloudflare Runtime
 */

export const UTP_PROTOCOL_NAME = 'wishmagic-template';
export const UTP_SCHEMA_VERSION = '1.0.0';
export const UTP_RUNTIME_API_VERSION = '1.0';

/**
 * Standard Supported Field Types in UTP v1.0
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
 * Standard Supported Binding Targets for DOM rendering
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
 * Supported Media Roles
 */
export const UTP_SUPPORTED_MEDIA_ROLES = new Set([
  'cover',
  'gallery',
  'background',
  'audio',
  'video',
  'avatar',
  'stamp',
  'icon',
  'font',
  'general'
]);

/**
 * Canonical Capabilities Registry
 * Every capability declared by a manifest is checked against this server registry.
 */
export const UTP_CAPABILITY_REGISTRY = {
  photos: {
    id: 'photos',
    name: 'Single & Cover Photos',
    description: 'Renders personalized uploaded photos or cover pictures',
    requiredFieldTypes: ['image'],
    allowsEmpty: true
  },
  multiplePhotos: {
    id: 'multiplePhotos',
    name: 'Multi-Photo Gallery',
    description: 'Renders multiple personalized photos or memory cards',
    requiredFieldTypes: ['image-multiple', 'image'],
    allowsEmpty: true
  },
  music: {
    id: 'music',
    name: 'Background Music & Soundtrack',
    description: 'Background audio playback via B2 music library or template audio',
    requiredFieldTypes: ['audio'],
    allowsEmpty: true
  },
  voice: {
    id: 'voice',
    name: 'Voice Note & Recording',
    description: 'Audio message or voice note keepsake playback',
    requiredFieldTypes: ['voice', 'audio'],
    allowsEmpty: true
  },
  video: {
    id: 'video',
    name: 'Video Greeting / Keepsake',
    description: 'Video player integration for user-provided celebration video',
    requiredFieldTypes: ['video', 'video-multiple'],
    allowsEmpty: true
  },
  countdown: {
    id: 'countdown',
    name: 'Interactive Countdown Timer',
    description: 'Live countdown timer to midnight or celebration event date',
    requiredFieldTypes: ['date', 'datetime', 'time'],
    allowsEmpty: true
  },
  timeline: {
    id: 'timeline',
    name: 'Memory Timeline',
    description: 'Chronological memory or milestone timeline',
    allowsEmpty: true
  },
  themes: {
    id: 'themes',
    name: 'Color & Theme Variations',
    description: 'Dynamic palette switching via CSS custom properties (--wm-*)',
    allowsEmpty: true
  },
  animations: {
    id: 'animations',
    name: 'Interactive Animations',
    description: 'CSS keyframe animations, reveals, transitions',
    allowsEmpty: true
  },
  particles: {
    id: 'particles',
    name: 'Particle Effects (Confetti/Sparkles/Hearts)',
    description: 'Floating particle visual canvas or DOM atmosphere',
    allowsEmpty: true
  },
  sections: {
    id: 'sections',
    name: 'Modular Sections',
    description: 'Toggleable and orderable template sections',
    allowsEmpty: true
  },
  gallery: {
    id: 'gallery',
    name: 'Interactive Photo Gallery',
    description: 'Lightbox or carousel multi-photo gallery',
    allowsEmpty: true
  },
  secretMessage: {
    id: 'secretMessage',
    name: 'Secret Message / Open When',
    description: 'Hidden interactive letter revealed on click or passkey',
    allowsEmpty: true
  },
  finalSurprise: {
    id: 'finalSurprise',
    name: 'Grand Finale / Final Surprise',
    description: 'Confetti pop, gift unboxing, or fireworks grand finale',
    allowsEmpty: true
  }
};

/**
 * Valid canonical relationships supported across the WishMagic platform
 */
export const UTP_CANONICAL_RELATIONSHIPS = new Set([
  'friend',
  'best_friend',
  'girlfriend',
  'boyfriend',
  'crush',
  'wife',
  'husband',
  'mother',
  'father',
  'parents',
  'sister',
  'brother',
  'daughter',
  'son',
  'colleague',
  'mentor',
  'general'
]);

/**
 * Checks semantic version format (e.g. 1.0.0, 2.1.0, 1.0.0-beta)
 */
export function isValidSemver(v) {
  if (!v || typeof v !== 'string') return false;
  return /^v?\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(v.trim());
}

/**
 * Checks identifier slug format (lowercase letters, numbers, underscores, hyphens)
 */
export function isValidIdentifier(id) {
  if (!id || typeof id !== 'string') return false;
  return /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(id.trim());
}
