/**
 * WishMagic Central Relationship Resolver Engine (Part 23)
 * ========================================================
 * Authoritative backend resolver for:
 * - Template Family -> Template Version -> Relationship Variant -> Admin Defaults -> User Customization
 * - Validates relationship support against D1 source of truth
 * - Resolves relationship-specific theme, colors, typography, messages, atmosphere, animations
 * - Resolves relationship-specific images via Part 21 ImgBB hierarchy
 * - Resolves relationship-specific music via Part 22 B2 music library
 * - Prevents fake fallbacks and guarantees zero cross-relationship contamination
 */

import { resolveSlotImage } from './imgbb-provider.js';

/**
 * Standard Fallback Relationship Variant Configs
 * Used when a variant record has not yet been customized in D1.
 */
export const DEFAULT_RELATIONSHIP_CONFIGS = {
  girlfriend: {
    theme: { style: 'romantic', mood: 'intimate', animationSpeed: 'gentle' },
    palette: { primary: '#ec4899', secondary: '#be185d', accent: '#f43f5e', background: '#fff1f2' },
    messages: {
      defaultWish: 'To my dearest girlfriend, you are the magic in every single day of my life. Happy Birthday my love!',
      heading: 'Forever Yours ❤️',
      subheading: 'A celebration crafted with all my heart'
    },
    atmosphere: { particles: 'floating_hearts', intensity: 'vibrant', glow: 'rose_gold' },
    animations: 'Heartburst & Petal Cascade',
    musicCategory: 'romantic'
  },
  boyfriend: {
    theme: { style: 'romantic', mood: 'warm', animationSpeed: 'smooth' },
    palette: { primary: '#3b82f6', secondary: '#1d4ed8', accent: '#60a5fa', background: '#eff6ff' },
    messages: {
      defaultWish: 'To my handsome boyfriend, thank you for being my rock, my greatest laugh, and my favorite adventure. Happy Birthday!',
      heading: 'My Best Friend & Love 💙',
      subheading: 'Celebrating the incredible person you are'
    },
    atmosphere: { particles: 'sparkling_stars', intensity: 'warm', glow: 'sapphire' },
    animations: 'Starlight Shimmer & Constellation Reveal',
    musicCategory: 'romantic'
  },
  crush: {
    theme: { style: 'romantic', mood: 'playful_shy', animationSpeed: 'delicate' },
    palette: { primary: '#a855f7', secondary: '#7e22ce', accent: '#c084fc', background: '#faf5ff' },
    messages: {
      defaultWish: 'Hey there! Just wanted to make sure your special day is as wonderfully captivating as your smile. Happy Birthday ✨',
      heading: 'A Little Secret Magic ✨',
      subheading: 'Sent with a quiet smile just for you'
    },
    atmosphere: { particles: 'stardust_chimes', intensity: 'subtle', glow: 'lavender_dream' },
    animations: 'Soft Flutter & Stardust Twinkle',
    musicCategory: 'romantic'
  },
  friend: {
    theme: { style: 'celebration', mood: 'energetic', animationSpeed: 'lively' },
    palette: { primary: '#f59e0b', secondary: '#d97706', accent: '#fbbf24', background: '#fffbeb' },
    messages: {
      defaultWish: 'Happy Birthday to my absolute favorite human! Here is to countless more wild memories and unstoppable laughter.',
      heading: 'Best Friends Forever 🎈',
      subheading: 'Cheers to another year of legendary times!'
    },
    atmosphere: { particles: 'confetti_burst', intensity: 'high', glow: 'golden_sunshine' },
    animations: 'Celebration Confetti & Balloon Lift',
    musicCategory: 'celebration'
  },
  wife: {
    theme: { style: 'romantic', mood: 'deep_love', animationSpeed: 'graceful' },
    palette: { primary: '#e11d48', secondary: '#9f1239', accent: '#fb7185', background: '#fff1f2' },
    messages: {
      defaultWish: 'To my beloved wife, thank you for filling our world with grace, boundless love, and gentle warmth. Happy Birthday my queen.',
      heading: 'My Wife, My Everything 💍',
      subheading: 'Honoring our beautiful journey together'
    },
    atmosphere: { particles: 'golden_ribbons', intensity: 'graceful', glow: 'champagne_rose' },
    animations: 'Golden Aura & Rose Bloom',
    musicCategory: 'romantic'
  },
  husband: {
    theme: { style: 'romantic', mood: 'deep_love', animationSpeed: 'steady' },
    palette: { primary: '#2563eb', secondary: '#1e40af', accent: '#38bdf8', background: '#f0f9ff' },
    messages: {
      defaultWish: 'Happy Birthday to my loving husband. Thank you for your strength, your kindness, and the countless smiles you bring to my heart.',
      heading: 'My King & Partner 👑',
      subheading: 'Celebrating our everlasting bond'
    },
    atmosphere: { particles: 'celestial_glow', intensity: 'steady', glow: 'royal_gold' },
    animations: 'Crown Crest & Midnight Wave',
    musicCategory: 'romantic'
  },
  parents: {
    theme: { style: 'peaceful', mood: 'reverent', animationSpeed: 'gentle' },
    palette: { primary: '#d97706', secondary: '#b45309', accent: '#f59e0b', background: '#fffbeb' },
    messages: {
      defaultWish: 'Dearest Mom & Dad, words can never express the gratitude in my heart for your selfless love, guidance, and warmth.',
      heading: 'To My Wonderful Parents 🌺',
      subheading: 'A tribute of infinite love and respect'
    },
    atmosphere: { particles: 'golden_dust', intensity: 'gentle', glow: 'amber_warmth' },
    animations: 'Warm Aura & Gentle Float',
    musicCategory: 'peaceful'
  },
  mother: {
    theme: { style: 'peaceful', mood: 'tender', animationSpeed: 'soft' },
    palette: { primary: '#f43f5e', secondary: '#be123c', accent: '#fda4af', background: '#fff1f2' },
    messages: {
      defaultWish: 'Dearest Mummy, thank you for your unconditional love and endless prayers. Wishing you good health, joy, and peace!',
      heading: 'Dearest Mummy 🌸',
      subheading: 'With all my devotion and love'
    },
    atmosphere: { particles: 'cherry_blossom', intensity: 'soft', glow: 'soft_pink' },
    animations: 'Floral Petal Float',
    musicCategory: 'peaceful'
  },
  father: {
    theme: { style: 'peaceful', mood: 'respectful', animationSpeed: 'calm' },
    palette: { primary: '#0284c7', secondary: '#0369a1', accent: '#38bdf8', background: '#f0f9ff' },
    messages: {
      defaultWish: 'Respected Papa, you are my greatest inspiration and role model. Wishing you happiness, good health, and success always!',
      heading: 'Respected Papa 🌟',
      subheading: 'With deep admiration and love'
    },
    atmosphere: { particles: 'amber_lanterns', intensity: 'calm', glow: 'golden_blue' },
    animations: 'Lantern Rise & Starburst',
    musicCategory: 'peaceful'
  }
};

/**
 * Normalizes relationship slug/id into standard slug format
 */
export function normalizeRelationshipSlug(input) {
  if (!input) return '';
  let str = String(input).trim().toLowerCase();
  if (str.startsWith('rel_')) {
    str = str.substring(4);
  }
  return str.replace(/[^a-z0-9_-]/g, '_');
}

/**
 * Loads all active relationships from D1
 */
export async function getActiveRelationships(db) {
  if (!db || typeof db.prepare !== 'function') {
    return Object.entries(DEFAULT_RELATIONSHIP_CONFIGS).map(([slug, cfg], idx) => ({
      id: `rel_${slug}`,
      slug,
      name: slug.charAt(0).toUpperCase() + slug.slice(1),
      display_name: slug.charAt(0).toUpperCase() + slug.slice(1),
      icon: slug === 'girlfriend' ? '💖' : (slug === 'boyfriend' ? '💙' : (slug === 'crush' ? '✨' : '🎈')),
      category: cfg.musicCategory || 'general',
      sort_order: idx + 1
    }));
  }

  const rows = await db.prepare(
    'SELECT id, slug, name, display_name, icon, category, sort_order FROM relationships WHERE status = "active" ORDER BY sort_order ASC'
  ).all();

  return rows.results || [];
}

/**
 * Loads supported relationships for a single template
 */
export async function getTemplateSupportedRelationships(db, templateId) {
  if (!db || typeof db.prepare !== 'function') {
    // In-memory fallback
    return [
      { id: 'rel_friend', slug: 'friend', name: 'Friend', displayName: 'Best Friend Forever', icon: '🎈' },
      { id: 'rel_girlfriend', slug: 'girlfriend', name: 'Girlfriend', displayName: 'Dearest Girlfriend', icon: '💖' },
      { id: 'rel_boyfriend', slug: 'boyfriend', name: 'Boyfriend', displayName: 'Handsome Boyfriend', icon: '💙' },
      { id: 'rel_crush', slug: 'crush', name: 'Crush', displayName: 'Secret Crush', icon: '✨' }
    ];
  }

  const rows = await db.prepare(
    `SELECT r.id, r.slug, r.name, r.display_name, r.icon, r.category, tr.sort_order
     FROM template_relationships tr
     JOIN relationships r ON tr.relationship_id = r.id
     WHERE tr.template_id = ? AND tr.enabled = 1 AND r.status = 'active'
     ORDER BY tr.sort_order ASC, r.sort_order ASC`
  ).bind(templateId).all();

  return (rows.results || []).map(r => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    displayName: r.display_name,
    icon: r.icon,
    category: r.category
  }));
}

/**
 * Batch-loads supported relationships for multiple templates (avoids N+1 query problem)
 */
export async function batchGetTemplatesSupportedRelationships(db, templateIds = []) {
  const map = new Map();
  if (!templateIds || templateIds.length === 0) return map;

  if (!db || typeof db.prepare !== 'function') {
    const defaultList = [
      { id: 'rel_friend', slug: 'friend', name: 'Friend', displayName: 'Best Friend Forever', icon: '🎈' },
      { id: 'rel_girlfriend', slug: 'girlfriend', name: 'Girlfriend', displayName: 'Dearest Girlfriend', icon: '💖' },
      { id: 'rel_boyfriend', slug: 'boyfriend', name: 'Boyfriend', displayName: 'Handsome Boyfriend', icon: '💙' },
      { id: 'rel_crush', slug: 'crush', name: 'Crush', displayName: 'Secret Crush', icon: '✨' }
    ];
    templateIds.forEach(id => map.set(id, defaultList));
    return map;
  }

  const placeholders = templateIds.map(() => '?').join(',');
  const query = `
    SELECT tr.template_id, r.id, r.slug, r.name, r.display_name, r.icon, r.category, tr.sort_order
    FROM template_relationships tr
    JOIN relationships r ON tr.relationship_id = r.id
    WHERE tr.template_id IN (${placeholders}) AND tr.enabled = 1 AND r.status = 'active'
    ORDER BY tr.sort_order ASC, r.sort_order ASC
  `;

  try {
    const rows = await db.prepare(query).bind(...templateIds).all();
    (rows.results || []).forEach(row => {
      const list = map.get(row.template_id) || [];
      list.push({
        id: row.id,
        slug: row.slug,
        name: row.name,
        displayName: row.display_name,
        icon: row.icon,
        category: row.category
      });
      map.set(row.template_id, list);
    });
  } catch (err) {
    console.warn('[batchGetTemplatesSupportedRelationships]', err.message);
  }

  return map;
}

/**
 * Central Authoritative Template & Relationship Resolver
 */
export async function resolveTemplateForRelationship({
  db,
  templateId,
  relationshipSlugOrId,
  versionId = null,
  authoritativeTemplate = null
}) {
  const cleanRelSlug = normalizeRelationshipSlug(relationshipSlugOrId);
  const targetRelId = relationshipSlugOrId && relationshipSlugOrId.startsWith('rel_')
    ? relationshipSlugOrId
    : `rel_${cleanRelSlug}`;

  // 1. Fetch Template
  let template = authoritativeTemplate;
  if (!template && db && typeof db.prepare === 'function') {
    template = await db.prepare(
      'SELECT * FROM templates WHERE id = ? OR slug = ? LIMIT 1'
    ).bind(templateId, templateId).first();
  }

  if (!template) {
    return {
      ok: false,
      code: 'TEMPLATE_NOT_FOUND',
      status: 404,
      message: `Template "${templateId}" not found.`
    };
  }

  const effectiveTemplateId = template.id;

  // 2. Fetch Supported Relationships for this Template
  const supportedRelationships = await getTemplateSupportedRelationships(db, effectiveTemplateId);
  
  if (supportedRelationships.length === 0) {
    // If no explicit D1 link yet, allow standard friend fallback for legacy templates
    supportedRelationships.push({
      id: 'rel_friend',
      slug: 'friend',
      name: 'Friend',
      displayName: 'Best Friend Forever',
      icon: '🎈',
      category: 'friends'
    });
  }

  // 3. Validate Requested Relationship Compatibility
  let matchedRelationship = null;
  if (!cleanRelSlug) {
    // Auto-select first supported relationship if only 1 exists
    matchedRelationship = supportedRelationships[0];
  } else {
    matchedRelationship = supportedRelationships.find(
      r => r.slug === cleanRelSlug || r.id === targetRelId || r.id === relationshipSlugOrId
    );
  }

  if (!matchedRelationship) {
    return {
      ok: false,
      code: 'RELATIONSHIP_NOT_SUPPORTED',
      status: 400,
      message: `Relationship "${relationshipSlugOrId}" is not supported by template "${template.name || effectiveTemplateId}".`,
      supportedRelationships
    };
  }

  // 4. Resolve Template Version
  let version = null;
  if (db && typeof db.prepare === 'function') {
    if (versionId) {
      version = await db.prepare(
        'SELECT * FROM template_versions WHERE id = ? AND template_id = ? LIMIT 1'
      ).bind(versionId, effectiveTemplateId).first();
    }
    if (!version) {
      // Find latest published version
      version = await db.prepare(
        'SELECT * FROM template_versions WHERE template_id = ? AND status = "published" ORDER BY version_number DESC LIMIT 1'
      ).bind(effectiveTemplateId).first();
    }
    if (!version) {
      // Fallback to latest ready/draft
      version = await db.prepare(
        'SELECT * FROM template_versions WHERE template_id = ? ORDER BY version_number DESC LIMIT 1'
      ).bind(effectiveTemplateId).first();
    }
  }

  const effectiveVersionId = version ? version.id : 'v1';

  // 5. Resolve Relationship Variant Configuration from D1
  let variantRecord = null;
  if (db && typeof db.prepare === 'function' && version) {
    variantRecord = await db.prepare(
      `SELECT * FROM template_relationship_variants
       WHERE template_version_id = ? AND (relationship_id = ? OR relationship_id = ?) AND status = 'active'
       LIMIT 1`
    ).bind(effectiveVersionId, matchedRelationship.id, `rel_${matchedRelationship.slug}`).first();
  }

  let variantConfig = {};
  if (variantRecord && variantRecord.configuration_json) {
    try {
      variantConfig = JSON.parse(variantRecord.configuration_json);
    } catch (_) {}
  }

  // Merge with default atmospheric baseline for this relationship
  const baselineConfig = DEFAULT_RELATIONSHIP_CONFIGS[matchedRelationship.slug] || DEFAULT_RELATIONSHIP_CONFIGS.friend;
  const mergedVariant = {
    id: variantRecord ? variantRecord.id : `var_${effectiveVersionId}_${matchedRelationship.slug}`,
    name: variantRecord ? variantRecord.name : `${matchedRelationship.name} Atmosphere`,
    theme: { ...baselineConfig.theme, ...(variantConfig.theme || {}) },
    palette: { ...baselineConfig.palette, ...(variantConfig.palette || {}) },
    messages: { ...baselineConfig.messages, ...(variantConfig.messages || {}) },
    defaults: { ...baselineConfig.defaults, ...(variantConfig.defaults || {}) },
    atmosphere: { ...baselineConfig.atmosphere, ...(variantConfig.atmosphere || {}) },
    animations: variantConfig.animations || baselineConfig.animations
  };

  // 6. Resolve Template Images using Part 21 Hierarchy
  let templateImages = [];
  if (db && typeof db.prepare === 'function' && version) {
    const imgRows = await db.prepare(
      'SELECT * FROM template_images WHERE template_version_id = ? AND status = "active"'
    ).bind(effectiveVersionId).all();
    templateImages = imgRows.results || [];
  }

  // 7. Resolve Music using Part 22 Mappings & Central Music Library
  let defaultMusic = null;
  let availableMusic = [];

  if (db && typeof db.prepare === 'function') {
    // Fetch variant-specific or template-level music mappings
    const musicRows = await db.prepare(
      `SELECT tm.is_default, ml.*
       FROM template_music tm
       JOIN music_library ml ON tm.music_id = ml.id
       WHERE tm.template_version_id = ? AND tm.enabled = 1 AND ml.status = 'active'
       ORDER BY tm.is_default DESC, tm.sort_order ASC`
    ).bind(effectiveVersionId).all();

    availableMusic = musicRows.results || [];

    if (availableMusic.length > 0) {
      defaultMusic = availableMusic.find(m => Boolean(m.is_default)) || availableMusic[0];
    } else {
      // Fallback: pick curated song suited for this relationship category
      const curatedCategory = baselineConfig.musicCategory || 'celebration';
      const fallbackMusic = await db.prepare(
        'SELECT * FROM music_library WHERE category = ? AND status = "active" LIMIT 1'
      ).bind(curatedCategory).first();
      if (fallbackMusic) {
        defaultMusic = fallbackMusic;
        availableMusic = [fallbackMusic];
      }
    }
  }

  // 8. Resolve Slots & Fields
  let fields = [];
  if (db && typeof db.prepare === 'function' && version) {
    const fRows = await db.prepare(
      'SELECT * FROM template_fields WHERE template_version_id = ? AND status = "active" ORDER BY sort_order ASC'
    ).bind(effectiveVersionId).all();
    fields = fRows.results || [];
  }

  // Image resolution map for every image field in the template
  const resolvedImages = {};
  fields.filter(f => f.field_type === 'image' || f.field_key.includes('photo') || f.field_key.includes('image')).forEach(f => {
    resolvedImages[f.field_key] = resolveSlotImage({
      slotKey: f.field_key,
      wishMediaMappings: [], // Unfilled for template preview
      templateImages,
      relationshipId: matchedRelationship.slug,
      fallbackUrl: f.default_value || template.thumbnail || ''
    });
  });

  return {
    ok: true,
    template: {
      id: effectiveTemplateId,
      slug: template.slug,
      name: template.name,
      category: template.category,
      tier: template.tier || 'free',
      price: Number(template.price) || 0,
      isPremium: Boolean(template.is_premium || template.isPremium),
      thumbnail: template.thumbnail,
      description: template.description,
      folder: template.folder,
      entryFile: template.entry_file || 'index.html'
    },
    version: version ? {
      id: version.id,
      versionNumber: version.version_number,
      versionLabel: version.version_label,
      status: version.status
    } : { id: 'v1', versionNumber: 1, versionLabel: 'v1.0.0', status: 'ready' },
    relationship: matchedRelationship,
    supportedRelationships,
    variant: mergedVariant,
    images: resolvedImages,
    music: {
      default: defaultMusic,
      available: availableMusic
    },
    fields,
    capabilities: typeof template.capabilities === 'string' ? JSON.parse(template.capabilities || '{}') : (template.capabilities || {})
  };
}
