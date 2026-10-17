/**
 * Universal Template Protocol (UTP v1.0 / v1.1) — Authoritative Server & Client Validator
 * ---------------------------------------------------------------------------------------
 * Validates template manifests (`wishmagic.json`), HTML/CSS/JS bindings,
 * field schemas, section definitions, relationship declarations, capability
 * requests, UTP v1.1.0 multi-relationship variant declarations, and package asset
 * integrity against the canonical UTP specification.
 */

import {
  UTP_PROTOCOL_NAME,
  UTP_SCHEMA_VERSION,
  UTP_LATEST_SCHEMA_VERSION,
  UTP_SUPPORTED_SCHEMA_VERSIONS,
  UTP_RUNTIME_API_VERSION,
  UTP_SUPPORTED_FIELD_TYPES,
  UTP_SUPPORTED_BINDING_TARGETS,
  UTP_CANONICAL_RELATIONSHIPS,
  UTP_CAPABILITY_REGISTRY,
  normalizeRelationshipIdentifier,
  isValidSemver,
  isValidIdentifier
} from './template-protocol-schema.js';

const UTP_CATEGORIES = new Set([
  'birthday',
  'anniversary',
  'love',
  'romantic',
  'friendship',
  'wedding',
  'engagement',
  'congratulations',
  'thank_you',
  'thank-you',
  'apology',
  'sorry',
  'festival',
  'festivals',
  'graduation',
  'baby_shower',
  'new-baby',
  'farewell',
  'mothers_day',
  'fathers_day',
  'valentines',
  'christmas',
  'new_year',
  'proposal',
  'celebration',
  'general',
  'custom'
]);

const UTP_TIERS = new Set(['free', 'vip', 'premium']);

function normalizeFieldEntry(f) {
  if (typeof f === 'string') {
    return {
      id: f,
      key: f,
      type: 'text',
      label: f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      required: false,
      defaultValue: '',
      binding: { target: 'text', selector: `[data-wm-field='${f}']` }
    };
  }
  if (!f || typeof f !== 'object') return null;
  const id = String(f.id || f.key || f.name || '').trim();
  const type = String(f.type || 'text').toLowerCase().trim();
  return {
    ...f,
    id,
    key: id,
    type,
    label: f.label || (id ? id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''),
    required: Boolean(f.required || f.isRequired),
    defaultValue: f.defaultValue !== undefined ? f.defaultValue : (f.default !== undefined ? f.default : ''),
    binding: f.binding || {
      target: ['image', 'audio', 'video'].includes(type) ? 'src' : 'text',
      selector: `[data-wm-field='${id}']`
    }
  };
}

function normalizeSectionEntry(s, idx = 0) {
  if (typeof s === 'string') {
    return {
      id: s,
      key: s,
      label: s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      required: false,
      toggleable: true,
      defaultEnabled: true,
      order: idx + 1
    };
  }
  if (!s || typeof s !== 'object') return null;
  const sId = String(s.id || s.key || '').trim();
  const req = Boolean(s.required);
  return {
    ...s,
    id: sId,
    key: sId,
    label: s.label || s.name || sId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    required: req,
    toggleable: s.toggleable !== undefined ? Boolean(s.toggleable) : !req,
    defaultEnabled: s.defaultEnabled !== undefined ? Boolean(s.defaultEnabled) : true,
    order: s.order !== undefined ? Number(s.order) : (idx + 1)
  };
}

/**
 * Normalizes a single variant declaration into canonical UTP v1.1.0 structure
 */
export function normalizeVariantDeclaration(rawVar, familyMeta = {}, idx = 0) {
  if (!rawVar || typeof rawVar !== 'object' || Array.isArray(rawVar)) return null;

  const rawRel = rawVar.relationship || rawVar.relationshipId || rawVar.relation || rawVar.relationshipSlug || rawVar.slug || '';
  const rawLabel = rawVar.label || rawVar.relationshipLabel || rawVar.relationLabel || null;
  const relMeta = normalizeRelationshipIdentifier(rawRel, rawLabel);

  const familyId = String(familyMeta.id || 'template').trim();
  const fallbackSlug = relMeta ? relMeta.slug : `variant_${idx + 1}`;
  const rawId = String(rawVar.id || rawVar.variantId || rawVar.key || '').trim();
  const rawSlug = String(rawVar.slug || (relMeta ? relMeta.slug : '') || rawId || fallbackSlug)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-');

  const id = rawId || `${familyId}-${rawSlug}`;
  const label = rawLabel ? String(rawLabel).trim() : (relMeta ? relMeta.label : rawSlug);
  const name = String(
    rawVar.name ||
    rawVar.displayName ||
    rawVar.title ||
    (familyMeta.name ? `${familyMeta.name} — ${label}` : `${label} Variant`)
  ).trim();

  const entry = String(rawVar.entry || rawVar.entryFile || familyMeta.entry || 'index.html').trim();
  const status = String(rawVar.status || 'published').toLowerCase().trim();
  const enabled = rawVar.enabled !== false && rawVar.disabled !== true && status !== 'disabled' && status !== 'archived';

  const varFields = Array.isArray(rawVar.fields)
    ? rawVar.fields.map(normalizeFieldEntry).filter(Boolean)
    : [];
  const varSections = Array.isArray(rawVar.sections)
    ? rawVar.sections.map((s, sIdx) => normalizeSectionEntry(s, sIdx)).filter(Boolean)
    : [];

  const rawAssets = (rawVar.assets && typeof rawVar.assets === 'object' && !Array.isArray(rawVar.assets))
    ? rawVar.assets
    : ((rawVar.images && typeof rawVar.images === 'object' && !Array.isArray(rawVar.images)) ? rawVar.images : {});

  const rawTheme = (rawVar.theme && typeof rawVar.theme === 'object') ? rawVar.theme : {};
  const rawPalette = (rawVar.palette && typeof rawVar.palette === 'object')
    ? rawVar.palette
    : ((rawTheme.palette && typeof rawTheme.palette === 'object') ? rawTheme.palette : {});

  return {
    id,
    slug: rawSlug,
    relationship: relMeta ? relMeta.slug : String(rawRel).toLowerCase().trim(),
    relationshipId: relMeta ? relMeta.id : (rawRel ? `rel_${String(rawRel).toLowerCase().trim()}` : ''),
    relationshipSlug: relMeta ? relMeta.slug : String(rawRel).toLowerCase().trim(),
    label,
    relationshipLabel: label,
    icon: rawVar.icon || (relMeta ? relMeta.icon : '✨'),
    name,
    displayName: name,
    description: String(rawVar.description || familyMeta.description || '').trim(),
    category: String(rawVar.category || rawVar.occasion || familyMeta.category || 'celebration').toLowerCase().trim(),
    thumbnail: String(rawVar.thumbnail || rawVar.previewImage || '').trim(),
    entry,
    default: Boolean(rawVar.default || rawVar.isDefault),
    status: ['published', 'draft', 'ready', 'disabled', 'archived'].includes(status) ? status : 'published',
    enabled,
    sortOrder: rawVar.sortOrder !== undefined ? Number(rawVar.sortOrder) : (rawVar.order !== undefined ? Number(rawVar.order) : (idx + 1)),
    theme: {
      ...rawTheme,
      accentColor: rawTheme.accentColor || rawPalette.primary || rawTheme.primary || '#ec4899',
      primary: rawPalette.primary || rawTheme.primary || rawTheme.accentColor || '#ec4899',
      secondary: rawPalette.secondary || rawTheme.secondary || '#8b5cf6',
      accent: rawPalette.accent || rawTheme.accent || '#fbbf24'
    },
    palette: {
      primary: rawPalette.primary || rawTheme.primary || rawTheme.accentColor || '#ec4899',
      secondary: rawPalette.secondary || rawTheme.secondary || '#8b5cf6',
      accent: rawPalette.accent || rawTheme.accent || '#fbbf24',
      ...(rawPalette || {})
    },
    messages: (rawVar.messages && typeof rawVar.messages === 'object') ? { ...rawVar.messages } : {},
    assets: { ...rawAssets },
    images: { ...rawAssets, ...((rawVar.images && typeof rawVar.images === 'object' && !Array.isArray(rawVar.images)) ? rawVar.images : {}) },
    music: (rawVar.music && typeof rawVar.music === 'object') ? { ...rawVar.music } : (typeof rawVar.music === 'string' ? { url: rawVar.music } : {}),
    effects: (rawVar.effects && typeof rawVar.effects === 'object') ? { ...rawVar.effects } : {},
    animations: (rawVar.animations && typeof rawVar.animations === 'object') ? { ...rawVar.animations } : {},
    fields: varFields,
    sections: varSections
  };
}

/**
 * Normalizes a raw or legacy manifest into the canonical UTP v1.0.0 / v1.1.0 schema object.
 */
export function normalizeManifestToUtp(raw = {}) {
  if (!raw || typeof raw !== 'object') raw = {};
  const tObj = (raw.template && typeof raw.template === 'object') ? raw.template : raw;

  const rawCaps = raw.capabilities !== undefined ? raw.capabilities : tObj.capabilities;
  let normalizedCaps = [];
  if (Array.isArray(rawCaps)) {
    normalizedCaps = rawCaps.map(c => String(c).trim()).filter(Boolean);
  } else if (rawCaps && typeof rawCaps === 'object') {
    normalizedCaps = Object.keys(rawCaps).filter(k => Boolean(rawCaps[k]));
  }

  const rawFields = Array.isArray(raw.fields)
    ? raw.fields
    : (Array.isArray(tObj.fields) ? tObj.fields : []);

  const normalizedFields = rawFields.map(normalizeFieldEntry).filter(Boolean);

  const rawSections = Array.isArray(raw.sections)
    ? raw.sections
    : (Array.isArray(tObj.sections) ? tObj.sections : []);

  const normalizedSections = rawSections.map((s, idx) => normalizeSectionEntry(s, idx)).filter(Boolean);

  const entry = String(tObj.entry || raw.entry || raw.files?.entry || 'index.html').trim();
  const templateMeta = {
    id: String(tObj.id || tObj.templateId || tObj.slug || '').trim(),
    name: String(tObj.name || tObj.title || '').trim(),
    description: String(tObj.description || raw.description || '').trim(),
    templateVersion: String(tObj.templateVersion || tObj.version || raw.version || '1.0.0').trim(),
    category: String(tObj.category || raw.category || 'celebration').toLowerCase().trim(),
    tier: String(tObj.tier || raw.tier || 'free').toLowerCase().trim(),
    price: Number(tObj.price ?? raw.price ?? 0),
    author: tObj.author || raw.author || 'WishMagic',
    entry
  };

  const rawVariants = Array.isArray(raw.variants)
    ? raw.variants
    : (Array.isArray(tObj.variants) ? tObj.variants : []);

  const normalizedVariants = rawVariants
    .map((v, idx) => normalizeVariantDeclaration(v, templateMeta, idx))
    .filter(Boolean);

  const rawRelationships = Array.isArray(raw.relationships)
    ? raw.relationships
    : (Array.isArray(tObj.relationships) ? tObj.relationships : []);

  // Derive relationships from explicit list or declared variants
  const finalRelationships = rawRelationships.length > 0
    ? rawRelationships
    : normalizedVariants.map(v => v.relationship).filter(Boolean);

  const declaredSchemaVersion = raw.schemaVersion
    ? String(raw.schemaVersion).trim()
    : (normalizedVariants.length > 0 ? UTP_LATEST_SCHEMA_VERSION : UTP_SCHEMA_VERSION);

  return {
    $schema: UTP_PROTOCOL_NAME,
    protocol: UTP_PROTOCOL_NAME,
    schemaVersion: declaredSchemaVersion,
    template: templateMeta,
    entry,
    compatibility: {
      runtimeApi: String(raw.compatibility?.runtimeApi || UTP_RUNTIME_API_VERSION),
      minimumRuntimeApi: String(raw.compatibility?.minimumRuntimeApi || raw.compatibility?.runtimeApi || UTP_RUNTIME_API_VERSION)
    },
    files: {
      entry,
      styles: Array.isArray(raw.files?.styles) ? raw.files.styles : [],
      scripts: Array.isArray(raw.files?.scripts) ? raw.files.scripts : []
    },
    fields: normalizedFields,
    sections: normalizedSections,
    relationships: finalRelationships,
    variants: normalizedVariants,
    hasVariants: normalizedVariants.length > 0,
    capabilities: normalizedCaps,
    assets: Array.isArray(raw.assets) ? raw.assets : (Array.isArray(tObj.assets) ? tObj.assets : [])
  };
}

export const normalizeUtpManifest = normalizeManifestToUtp;

/**
 * Helper to decode a file entry from filesMap into UTF-8 text
 */
function readFileTextFromMap(filesMap, relPath) {
  if (!filesMap || !relPath) return '';
  let entry = filesMap.get(relPath) || filesMap.get(relPath.replace(/^\.\//, ''));
  if (!entry) {
    const targetLower = relPath.replace(/^\.\//, '').toLowerCase();
    for (const [k, v] of filesMap.entries()) {
      if (k.toLowerCase() === targetLower) {
        entry = v;
        break;
      }
    }
  }
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  if (typeof entry.text === 'string') return entry.text;
  if (typeof entry.content === 'string') return entry.content;
  if (entry.content instanceof Uint8Array || ArrayBuffer.isView(entry.content)) {
    try {
      return new TextDecoder('utf-8').decode(entry.content);
    } catch (_) {
      return '';
    }
  }
  return '';
}

function hasFileInMap(filesMap, relPath) {
  if (!filesMap || !relPath) return false;
  const clean = String(relPath).replace(/\\/g, '/').replace(/^\.?\/+/, '');
  if (filesMap.has(clean) || filesMap.has(`./${clean}`)) return true;
  const lower = clean.toLowerCase();
  for (const k of filesMap.keys()) {
    if (k.toLowerCase() === lower) return true;
  }
  return false;
}

function isUnsafeRelativePath(pathStr) {
  if (!pathStr || typeof pathStr !== 'string') return false;
  const trimmed = pathStr.trim();
  return (
    trimmed.startsWith('/') ||
    trimmed.includes('../') ||
    trimmed.includes('..\\') ||
    trimmed === '..' ||
    /^[a-zA-Z]:/.test(trimmed) ||
    trimmed.startsWith('file://') ||
    trimmed.includes('\0')
  );
}

/**
 * Checks whether a given field binding exists in the template's HTML or CSS
 */
export function checkFieldBindingInCode(field, htmlContent = '', cssContent = '') {
  const fId = String(field.id || field.key || '').trim();
  if (!fId) return { bound: false, reason: 'missing_id' };

  const fType = String(field.type || 'text').toLowerCase();
  const bTarget = String(field.binding?.target || '').toLowerCase();
  const bSelector = String(field.binding?.selector || '').trim();

  // 1. Check CSS variable binding for color/theme fields
  if (fType === 'color' || bTarget === 'css-variable' || bTarget === 'style-property') {
    const cssVarMatch = bSelector.startsWith('--')
      ? bSelector
      : (field.binding?.attribute?.startsWith('--') ? field.binding.attribute : '');
    if (cssVarMatch && (cssContent.includes(cssVarMatch) || htmlContent.includes(cssVarMatch))) {
      return { bound: true, via: `css-variable:${cssVarMatch}` };
    }
    if (cssContent.includes('--wm-') || htmlContent.includes('--wm-') || htmlContent.includes(`data-wm-field="${fId}"`) || htmlContent.includes(`data-wm-field='${fId}'`)) {
      return { bound: true, via: 'css-custom-properties' };
    }
  }

  if (!htmlContent) {
    return { bound: true, via: 'no-html-context' };
  }

  // 2. Standard data-wm-field or legacy data-wm attribute match
  const escapedId = fId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const dataWmRegex = new RegExp(`data-wm(?:-field|-media)?\\s*=\\s*["']${escapedId}["']`, 'i');
  if (dataWmRegex.test(htmlContent)) {
    return { bound: true, via: `data-wm-field="${fId}"` };
  }

  // 3. Mustache {{field_id}} placeholder match
  const mustacheRegex = new RegExp(`\\{\\{\\s*${escapedId}\\s*\\}\\}`, 'i');
  if (mustacheRegex.test(htmlContent)) {
    return { bound: true, via: `{{${fId}}}` };
  }

  // 4. Custom selector match from field.binding.selector
  if (bSelector) {
    const attrSelMatch = bSelector.match(/\[\s*([a-zA-Z0-9_-]+)\s*=\s*["']?([^"'\]]+)["']?\s*\]/);
    if (attrSelMatch) {
      const attrName = attrSelMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const attrVal = attrSelMatch[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`${attrName}\\s*=\\s*["']${attrVal}["']`, 'i').test(htmlContent)) {
        return { bound: true, via: bSelector };
      }
    }
    const idSelMatch = bSelector.match(/^#([a-zA-Z0-9_-]+)$/);
    if (idSelMatch) {
      const targetId = idSelMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\bid\\s*=\\s*["']${targetId}["']`, 'i').test(htmlContent)) {
        return { bound: true, via: bSelector };
      }
    }
    const classSelMatch = bSelector.match(/^\.([a-zA-Z0-9_-]+)$/);
    if (classSelMatch) {
      const targetClass = classSelMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\bclass\\s*=\\s*["'][^"']*\\b${targetClass}\\b[^"']*["']`, 'i').test(htmlContent)) {
        return { bound: true, via: bSelector };
      }
    }
  }

  // 5. Fallback: element with id="<field_id>"
  if (new RegExp(`\\bid\\s*=\\s*["']${escapedId}["']`, 'i').test(htmlContent)) {
    return { bound: true, via: `#${fId}` };
  }

  // 6. Gallery / multi-photo slot convention
  if (fType === 'image-multiple' && (/data-wm(?:-field)?\s*=\s*["']photo_\d+["']/i.test(htmlContent) || /data-wm-section\s*=\s*["']gallery["']/i.test(htmlContent))) {
    return { bound: true, via: 'gallery-photo-slots' };
  }

  return { bound: false, reason: `No matching HTML element found for field "${fId}" (expected [data-wm-field="${fId}"] or ${bSelector || `{{${fId}}}`})` };
}

/**
 * Extracts editable fields declared in HTML (`data-wm-field`, `data-wm`, `{{...}}`)
 */
export function extractHtmlDeclaredFields(htmlContent = '') {
  const discovered = [];
  const seen = new Set();
  if (!htmlContent || typeof htmlContent !== 'string') return discovered;

  const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
  let match;
  while ((match = tagRegex.exec(htmlContent)) !== null) {
    const tagLower = match[1].toLowerCase();
    const attrs = match[2] || '';
    const wmMatch = attrs.match(/data-wm(?:-field)?\s*=\s*["']([^"']+)["']/i);
    if (!wmMatch) continue;
    const key = wmMatch[1].trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const typeMatch = attrs.match(/data-wm-type\s*=\s*["']([^"']+)["']/i);
    const labelMatch = attrs.match(/data-wm-label\s*=\s*["']([^"']+)["']/i);
    const reqMatch = attrs.match(/data-wm-required\s*=\s*["']([^"']+)["']/i);
    const defMatch = attrs.match(/data-wm-default\s*=\s*["']([^"']+)["']/i);
    const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);

    const inferredType = typeMatch
      ? typeMatch[1].toLowerCase().trim()
      : (tagLower === 'img' ? 'image' : (tagLower === 'audio' ? 'audio' : (tagLower === 'video' ? 'video' : (tagLower === 'textarea' ? 'textarea' : 'text'))));

    discovered.push({
      id: key,
      key,
      type: inferredType,
      label: labelMatch ? labelMatch[1].trim() : key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      required: reqMatch ? reqMatch[1].toLowerCase() === 'true' : false,
      defaultValue: defMatch ? defMatch[1] : (srcMatch ? srcMatch[1].trim() : ''),
      binding: {
        target: tagLower === 'img' || tagLower === 'audio' || tagLower === 'video' ? 'src' : 'text',
        selector: `[data-wm-field='${key}']`
      },
      source: 'html-attribute'
    });
  }

  const mustacheRegex = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;
  while ((match = mustacheRegex.exec(htmlContent)) !== null) {
    const key = match[1].trim();
    if (!key || key.startsWith('#') || key.startsWith('/') || key.startsWith('^') || seen.has(key)) continue;
    seen.add(key);
    const lKey = key.toLowerCase();
    const type = (lKey.includes('photo') || lKey.includes('image') || lKey.includes('cover'))
      ? 'image'
      : ((lKey.includes('music') || lKey.includes('audio') || lKey.includes('song'))
        ? 'audio'
        : (lKey.includes('video') ? 'video' : (lKey.includes('date') ? 'date' : (lKey.includes('message') || lKey.includes('letter') ? 'textarea' : 'text'))));
    discovered.push({
      id: key,
      key,
      type,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      required: false,
      defaultValue: '',
      binding: {
        target: type === 'image' || type === 'audio' || type === 'video' ? 'src' : 'text',
        selector: `{{${key}}}`
      },
      source: 'html-placeholder'
    });
  }

  return discovered;
}

/**
 * Validates a raw manifest object and optional extracted files Map.
 */
export function validateUtpManifest(rawManifest, options = {}) {
  const issues = [];
  const filesMap = options.filesMap instanceof Map ? new Map(options.filesMap) : new Map();
  if (Array.isArray(options.packageFiles)) {
    for (const pf of options.packageFiles) {
      if (typeof pf === 'string' && pf.trim()) {
        filesMap.set(pf.trim().replace(/^\/+/, ''), { content: '' });
      }
    }
  }

  if (!rawManifest || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
    issues.push({
      code: 'MANIFEST_INVALID_ROOT',
      severity: 'error',
      message: 'Manifest root must be a valid JSON object.',
      blocking: true
    });
    return buildReport(false, issues, null);
  }

  // 1. Check Schema Version, Protocol Identifier & Runtime API Compatibility
  if (rawManifest.$schema && rawManifest.$schema !== 'wishmagic-template' && !String(rawManifest.$schema).includes('wishmagic')) {
    issues.push({
      code: 'UNSUPPORTED_SCHEMA_IDENTIFIER',
      severity: 'error',
      message: `Unsupported $schema identifier: "${rawManifest.$schema}". Expected "wishmagic-template".`,
      blocking: true
    });
  }

  if (rawManifest.schemaVersion && !isValidSemver(String(rawManifest.schemaVersion))) {
    issues.push({
      code: 'INVALID_SCHEMA_VERSION',
      severity: 'error',
      message: `Invalid schemaVersion "${rawManifest.schemaVersion}". Must follow semantic versioning (e.g., "1.0.0" or "1.1.0").`,
      blocking: true
    });
  } else if (rawManifest.schemaVersion) {
    const cleanVer = String(rawManifest.schemaVersion).replace(/^v/, '');
    const [majorStr, minorStr] = cleanVer.split('.');
    if (majorStr !== '1') {
      issues.push({
        code: 'INCOMPATIBLE_SCHEMA_MAJOR_VERSION',
        severity: 'error',
        message: `Schema major version "${rawManifest.schemaVersion}" is not compatible with UTP validator v${UTP_LATEST_SCHEMA_VERSION}.`,
        blocking: true
      });
    } else if (Number(minorStr) > 1 && !UTP_SUPPORTED_SCHEMA_VERSIONS.includes(cleanVer)) {
      issues.push({
        code: 'UNSUPPORTED_SCHEMA_VERSION',
        severity: 'error',
        message: `Unsupported schemaVersion "${rawManifest.schemaVersion}". Supported UTP versions are: ${UTP_SUPPORTED_SCHEMA_VERSIONS.join(', ')}.`,
        blocking: true
      });
    }
  }

  const minRuntimeApi = rawManifest.compatibility?.minimumRuntimeApi || rawManifest.compatibility?.runtimeApi;
  if (minRuntimeApi && parseFloat(String(minRuntimeApi)) > parseFloat(UTP_RUNTIME_API_VERSION)) {
    issues.push({
      code: 'INCOMPATIBLE_RUNTIME_API',
      severity: 'error',
      message: `Template requires minimumRuntimeApi "${minRuntimeApi}", which exceeds platform runtime API "${UTP_RUNTIME_API_VERSION}".`,
      blocking: true
    });
  }

  // 2. Check Template Identity Metadata
  const tMeta = rawManifest.template && typeof rawManifest.template === 'object'
    ? rawManifest.template
    : rawManifest;

  const tplId = tMeta.id || tMeta.templateId || tMeta.slug;
  if (!tplId || typeof tplId !== 'string' || !tplId.trim()) {
    issues.push({
      code: 'MISSING_TEMPLATE_ID',
      severity: 'error',
      message: 'Template manifest is missing required "template.id" (or "id") property.',
      blocking: true
    });
  } else if (!isValidIdentifier(tplId.trim())) {
    issues.push({
      code: 'TEMPLATE_ID_INVALID_FORMAT',
      severity: 'error',
      message: `Template ID "${tplId}" contains invalid characters. Use alphanumeric characters, hyphens, or underscores.`,
      blocking: true
    });
  }

  const tplName = tMeta.name || tMeta.title;
  if (!tplName || typeof tplName !== 'string' || !tplName.trim()) {
    issues.push({
      code: 'MISSING_TEMPLATE_NAME',
      severity: 'error',
      message: 'Template manifest is missing required "template.name" (or "name") property.',
      blocking: true
    });
  }

  const tplVersion = tMeta.templateVersion || tMeta.version || rawManifest.version;
  if (tplVersion && !isValidSemver(String(tplVersion))) {
    issues.push({
      code: 'INVALID_TEMPLATE_VERSION',
      severity: 'error',
      message: `Template version "${tplVersion}" is not valid SemVer (expected e.g. "1.0.0").`,
      blocking: true
    });
  }

  const category = (tMeta.category || rawManifest.category || 'celebration').toLowerCase().trim();
  if (!UTP_CATEGORIES.has(category)) {
    issues.push({
      code: 'UNRECOGNIZED_CATEGORY',
      severity: 'warning',
      message: `Category "${category}" is not in the standard catalog. It will default to general celebration routing.`,
      blocking: false
    });
  }

  const tier = (tMeta.tier || rawManifest.tier || 'free').toLowerCase().trim();
  if (!UTP_TIERS.has(tier)) {
    issues.push({
      code: 'INVALID_TEMPLATE_TIER',
      severity: 'error',
      message: `Invalid template tier "${tier}". Must be one of: free, vip, premium.`,
      blocking: true
    });
  }

  const norm = normalizeManifestToUtp(rawManifest);

  // 3. Entry Point Verification
  const declaredEntry = norm.entry || 'index.html';
  if (isUnsafeRelativePath(declaredEntry)) {
    issues.push({
      code: 'UNSAFE_ENTRY_PATH',
      severity: 'error',
      message: `Entry file path "${declaredEntry}" is unsafe. Must be a relative path inside the package root.`,
      blocking: true
    });
  }

  let resolvedEntryPath = declaredEntry.replace(/^\/+/, '');
  if (filesMap.size > 0) {
    let entryFound = filesMap.has(resolvedEntryPath);
    if (!entryFound) {
      for (const k of filesMap.keys()) {
        if (k.toLowerCase() === resolvedEntryPath.toLowerCase()) {
          entryFound = true;
          resolvedEntryPath = k;
          break;
        }
      }
    }
    if (!entryFound) {
      issues.push({
        code: 'ENTRY_FILE_NOT_FOUND',
        severity: 'error',
        path: declaredEntry,
        message: `Declared entry file "${declaredEntry}" was not found in the uploaded package archive.`,
        blocking: true
      });
    }
  }

  // Extract HTML, CSS, and JS content for 3-way agreement verification
  let htmlContent = options.htmlContent || '';
  let cssContent = options.cssContent || '';
  let jsContent = options.jsContent || '';

  if (filesMap.size > 0) {
    if (!htmlContent) {
      htmlContent = readFileTextFromMap(filesMap, resolvedEntryPath);
    }
    for (const [k] of filesMap.entries()) {
      const lower = k.toLowerCase();
      if (lower.endsWith('.css')) {
        cssContent += '\n' + readFileTextFromMap(filesMap, k);
      } else if (lower.endsWith('.js') && !lower.endsWith('.json')) {
        jsContent += '\n' + readFileTextFromMap(filesMap, k);
      }
    }
  }

  // 4. Fields Validation, Uniqueness & HTML/CSS Binding Verification
  const seenFieldIds = new Set();
  const fields = Array.isArray(norm.fields) ? norm.fields : [];
  const boundFields = [];
  const unboundFields = [];

  for (const field of fields) {
    const fId = field.id || field.key;
    if (!fId) {
      issues.push({
        code: 'FIELD_ID_MISSING',
        severity: 'error',
        message: 'Customization field declaration must have a valid id or key.',
        blocking: true
      });
      continue;
    }

    if (seenFieldIds.has(fId)) {
      issues.push({
        code: 'DUPLICATE_FIELD_ID',
        severity: 'error',
        field: fId,
        message: `Duplicate field ID detected: "${fId}". Field IDs must be unique within a template.`,
        blocking: true
      });
    }
    seenFieldIds.add(fId);

    const fType = field.type || 'text';
    if (!UTP_SUPPORTED_FIELD_TYPES.has(fType)) {
      issues.push({
        code: 'UNSUPPORTED_FIELD_TYPE',
        severity: 'error',
        field: fId,
        message: `Field "${fId}" specifies unsupported type "${fType}".`,
        blocking: true
      });
    }

    if (field.binding) {
      const bTarget = field.binding.target || 'text';
      if (!UTP_SUPPORTED_BINDING_TARGETS.has(bTarget)) {
        issues.push({
          code: 'UNSUPPORTED_BINDING_TARGET',
          severity: 'error',
          field: fId,
          message: `Field "${fId}" declared unsupported binding target: "${bTarget}".`,
          blocking: true
        });
      }
    }

    if (field.constraints) {
      const c = field.constraints;
      if (c.minLength !== undefined && c.maxLength !== undefined && c.minLength > c.maxLength) {
        issues.push({
          code: 'IMPOSSIBLE_FIELD_CONSTRAINTS',
          severity: 'error',
          field: fId,
          message: `Field "${fId}" has minLength (${c.minLength}) greater than maxLength (${c.maxLength}).`,
          blocking: true
        });
      }
      if (c.min !== undefined && c.max !== undefined && c.min > c.max) {
        issues.push({
          code: 'IMPOSSIBLE_FIELD_CONSTRAINTS',
          severity: 'error',
          field: fId,
          message: `Field "${fId}" has min (${c.min}) greater than max (${c.max}).`,
          blocking: true
        });
      }
    }

    if (filesMap.size > 0 && ['image', 'audio', 'video'].includes(fType) && typeof field.defaultValue === 'string' && field.defaultValue.trim()) {
      const defPath = field.defaultValue.trim();
      if (!defPath.startsWith('http://') && !defPath.startsWith('https://') && !defPath.startsWith('data:') && !defPath.startsWith('/assets/')) {
        if (isUnsafeRelativePath(defPath)) {
          issues.push({
            code: 'UNSAFE_LOCAL_ASSET_PATH',
            severity: 'error',
            field: fId,
            path: defPath,
            message: `Field "${fId}" defaultValue "${defPath}" uses an unsafe or local machine path. Use relative package paths like "assets/images/photo.jpg".`,
            blocking: true
          });
        } else {
          const cleanDef = defPath.replace(/\\/g, '/').replace(/^\.?\/+/, '');
          if (!hasFileInMap(filesMap, cleanDef)) {
            issues.push({
              code: 'FIELD_DEFAULT_ASSET_MISSING',
              severity: 'warning',
              field: fId,
              path: cleanDef,
              message: `Field "${fId}" references default media "${cleanDef}" which was not found in the ZIP archive.`,
              blocking: false
            });
          }
        }
      }
    }

    if (htmlContent) {
      const bindingCheck = checkFieldBindingInCode(field, htmlContent, cssContent);
      if (bindingCheck.bound) {
        boundFields.push({ id: fId, type: fType, via: bindingCheck.via });
      } else {
        unboundFields.push({ id: fId, type: fType, reason: bindingCheck.reason });
        issues.push({
          code: 'MANIFEST_FIELD_UNBOUND',
          severity: options.strictBindings ? 'error' : 'warning',
          field: fId,
          message: bindingCheck.reason,
          blocking: Boolean(options.strictBindings)
        });
      }
    }
  }

  // 4b. Detect HTML fields that are NOT declared in wishmagic.json -> surface as suggestedFields
  const suggestedFields = [];
  const hasExplicitManifestFields = Array.isArray(rawManifest.fields) || (rawManifest.template && Array.isArray(rawManifest.template.fields));

  // Collect all variant field IDs so variant-specific HTML bindings aren't falsely flagged as undeclared
  const variantFieldIds = new Set();
  if (Array.isArray(norm.variants)) {
    for (const v of norm.variants) {
      if (Array.isArray(v.fields)) {
        for (const vf of v.fields) {
          if (vf.id || vf.key) variantFieldIds.add(vf.id || vf.key);
        }
      }
    }
  }

  if (htmlContent) {
    const htmlFields = extractHtmlDeclaredFields(htmlContent);
    for (const hf of htmlFields) {
      if (!seenFieldIds.has(hf.id) && !variantFieldIds.has(hf.id)) {
        suggestedFields.push(hf);
        if (hasExplicitManifestFields) {
          issues.push({
            code: 'UNDECLARED_HTML_FIELD',
            severity: 'warning',
            field: hf.id,
            message: `HTML element binding "${hf.id}" (${hf.type}) was found in index.html but is not declared in wishmagic.json. Available as a Suggested Field for admin confirmation.`,
            blocking: false
          });
        }
      }
    }
  }

  // 5. Sections Validation, Uniqueness & HTML Binding Check
  const seenSectionIds = new Set();
  const sections = Array.isArray(norm.sections) ? norm.sections : [];
  for (const section of sections) {
    const sId = typeof section === 'string' ? section : (section.id || section.key);
    if (!sId) continue;
    if (seenSectionIds.has(sId)) {
      issues.push({
        code: 'DUPLICATE_SECTION_ID',
        severity: 'error',
        section: sId,
        message: `Duplicate section ID detected: "${sId}". Section IDs must be unique.`,
        blocking: true
      });
    }
    seenSectionIds.add(sId);

    if (typeof section === 'object' && section !== null) {
      if (section.required && section.toggleable) {
        issues.push({
          code: 'REQUIRED_TOGGLEABLE_CONFLICT',
          severity: 'warning',
          section: sId,
          message: `Section "${sId}" is marked required=true but toggleable=true. Required sections cannot be disabled by users.`,
          blocking: false
        });
      }
    }

    if (htmlContent) {
      const escSec = sId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const secRegex = new RegExp(`data-wm-section\\s*=\\s*["']${escSec}["']`, 'i');
      if (!secRegex.test(htmlContent)) {
        issues.push({
          code: 'SECTION_BINDING_NOT_FOUND',
          severity: 'warning',
          section: sId,
          message: `Declared section "${sId}" in wishmagic.json has no matching [data-wm-section="${sId}"] element in index.html.`,
          blocking: false
        });
      }
    }
  }

  // 6. Relationships Validation
  const relationships = Array.isArray(norm.relationships) ? norm.relationships : [];
  const seenRelIds = new Set();
  for (const rel of relationships) {
    const rId = typeof rel === 'string' ? rel : (rel.id || rel.slug);
    if (!rId) continue;
    if (seenRelIds.has(rId)) {
      issues.push({
        code: 'DUPLICATE_RELATIONSHIP_ID',
        severity: 'error',
        message: `Duplicate relationship ID declared: "${rId}".`,
        blocking: true
      });
    }
    seenRelIds.add(rId);

    const normRel = rId.toLowerCase().trim();
    if (!UTP_CANONICAL_RELATIONSHIPS.has(normRel)) {
      issues.push({
        code: 'NON_CANONICAL_RELATIONSHIP',
        severity: 'warning',
        message: `Relationship "${rId}" is not part of the standard platform catalog. It will be treated as custom.`,
        blocking: false
      });
    }
  }

  // 6b. UTP v1.1.0 Multi-Variant Family Declaration Validation
  const rawVariantsProp = rawManifest.variants !== undefined
    ? rawManifest.variants
    : (rawManifest.template && rawManifest.template.variants !== undefined ? rawManifest.template.variants : undefined);

  const validVariants = [];
  const invalidVariants = [];
  const detectedRelations = [];

  if (rawVariantsProp !== undefined && !Array.isArray(rawVariantsProp)) {
    issues.push({
      code: 'INVALID_VARIANTS_DECLARATION',
      severity: 'error',
      message: '"variants" property in wishmagic.json must be an array of variant objects.',
      blocking: true
    });
  } else if (Array.isArray(rawVariantsProp)) {
    const seenVariantIds = new Set();
    const seenVariantSlugs = new Set();
    const seenVariantRelations = new Set();

    rawVariantsProp.forEach((rawVar, vIdx) => {
      const varIssues = [];

      if (!rawVar || typeof rawVar !== 'object' || Array.isArray(rawVar)) {
        const errObj = {
          code: 'INVALID_VARIANT_OBJECT',
          severity: 'error',
          variantIndex: vIdx,
          message: `Variant at index ${vIdx} must be a valid JSON object.`,
          blocking: true
        };
        varIssues.push(errObj);
        issues.push(errObj);
        invalidVariants.push({ index: vIdx, id: null, relationship: null, errors: [errObj.message], issues: varIssues });
        return;
      }

      const rawId = String(rawVar.id || rawVar.variantId || rawVar.slug || rawVar.key || '').trim();
      if (!rawId) {
        varIssues.push({
          code: 'MISSING_VARIANT_ID',
          severity: 'error',
          variantIndex: vIdx,
          message: `Variant at index ${vIdx} is missing a required "id" or "slug" identifier.`,
          blocking: true
        });
      } else if (!isValidIdentifier(rawId)) {
        varIssues.push({
          code: 'INVALID_VARIANT_ID_FORMAT',
          severity: 'error',
          variant: rawId,
          message: `Variant ID "${rawId}" has an invalid format. Use alphanumeric characters, hyphens, or underscores.`,
          blocking: true
        });
      } else {
        const lowerId = rawId.toLowerCase();
        if (seenVariantIds.has(lowerId)) {
          varIssues.push({
            code: 'DUPLICATE_VARIANT_ID',
            severity: 'error',
            variant: rawId,
            message: `Duplicate variant ID "${rawId}" declared in wishmagic.json.`,
            blocking: true
          });
        }
        seenVariantIds.add(lowerId);
      }

      const rawRel = rawVar.relationship || rawVar.relationshipId || rawVar.relation || rawVar.relationshipSlug;
      if (!rawRel || (typeof rawRel === 'string' && !rawRel.trim())) {
        varIssues.push({
          code: 'MISSING_VARIANT_RELATIONSHIP',
          severity: 'error',
          variant: rawId || `index_${vIdx}`,
          message: `Variant "${rawId || vIdx}" is missing a required "relationship" (or "relationshipId") declaration.`,
          blocking: true
        });
      }

      const normVar = normalizeVariantDeclaration(rawVar, norm.template, vIdx);
      const relMeta = rawRel ? normalizeRelationshipIdentifier(rawRel, rawVar.label || rawVar.relationshipLabel) : null;

      if (relMeta) {
        if (seenVariantRelations.has(relMeta.slug) && !options.allowDuplicateVariantRelations) {
          varIssues.push({
            code: 'DUPLICATE_VARIANT_RELATIONSHIP',
            severity: 'error',
            variant: normVar.id,
            relationship: relMeta.slug,
            message: `Duplicate relationship "${relMeta.slug}" (${relMeta.label}) declared across multiple variants in the same template family.`,
            blocking: true
          });
        }
        seenVariantRelations.add(relMeta.slug);

        if (!relMeta.isCanonical) {
          issues.push({
            code: 'NON_CANONICAL_VARIANT_RELATIONSHIP',
            severity: 'warning',
            variant: normVar.id,
            relationship: relMeta.slug,
            message: `Variant "${normVar.id}" declares custom relationship "${relMeta.slug}".`,
            blocking: false
          });
        }
      }

      if (normVar && normVar.slug) {
        const lowerSlug = normVar.slug.toLowerCase();
        if (seenVariantSlugs.has(lowerSlug) && rawVar.slug) {
          varIssues.push({
            code: 'DUPLICATE_VARIANT_SLUG',
            severity: 'error',
            variant: normVar.id,
            slug: normVar.slug,
            message: `Duplicate variant slug "${normVar.slug}" declared in wishmagic.json.`,
            blocking: true
          });
        }
        seenVariantSlugs.add(lowerSlug);
      }

      // Check variant entry file
      let variantHtmlContent = htmlContent;
      if (rawVar.entry || rawVar.entryFile) {
        const vEntry = String(rawVar.entry || rawVar.entryFile).trim();
        if (isUnsafeRelativePath(vEntry)) {
          varIssues.push({
            code: 'UNSAFE_VARIANT_ENTRY_PATH',
            severity: 'error',
            variant: normVar.id,
            path: vEntry,
            message: `Variant "${normVar.id}" entry path "${vEntry}" is unsafe.`,
            blocking: true
          });
        } else if (filesMap.size > 0 && !hasFileInMap(filesMap, vEntry)) {
          varIssues.push({
            code: 'VARIANT_ENTRY_FILE_NOT_FOUND',
            severity: 'error',
            variant: normVar.id,
            path: vEntry,
            message: `Variant "${normVar.id}" entry file "${vEntry}" was not found in the package archive.`,
            blocking: true
          });
        } else if (filesMap.size > 0) {
          variantHtmlContent = readFileTextFromMap(filesMap, vEntry) || htmlContent;
        }
      }

      // Check variant thumbnail path
      if (normVar.thumbnail && !normVar.thumbnail.startsWith('http://') && !normVar.thumbnail.startsWith('https://') && !normVar.thumbnail.startsWith('data:') && !normVar.thumbnail.startsWith('/assets/')) {
        if (isUnsafeRelativePath(normVar.thumbnail)) {
          varIssues.push({
            code: 'UNSAFE_LOCAL_ASSET_PATH',
            severity: 'error',
            variant: normVar.id,
            path: normVar.thumbnail,
            message: `Variant "${normVar.id}" thumbnail "${normVar.thumbnail}" uses an unsafe or local path.`,
            blocking: true
          });
        } else if (filesMap.size > 0 && !hasFileInMap(filesMap, normVar.thumbnail)) {
          varIssues.push({
            code: 'VARIANT_ASSET_NOT_FOUND',
            severity: 'error',
            variant: normVar.id,
            path: normVar.thumbnail,
            message: `Variant "${normVar.id}" references thumbnail "${normVar.thumbnail}" which is missing from the package archive.`,
            blocking: true
          });
        }
      }

      // Check variant assets / images
      const varAssetEntries = Object.entries(normVar.assets || {});
      for (const [assetKey, assetVal] of varAssetEntries) {
        const refPath = typeof assetVal === 'string' ? assetVal.trim() : String(assetVal?.path || assetVal?.url || assetVal?.src || '').trim();
        if (!refPath || refPath.startsWith('http://') || refPath.startsWith('https://') || refPath.startsWith('data:') || refPath.startsWith('/assets/')) {
          continue;
        }
        if (isUnsafeRelativePath(refPath)) {
          varIssues.push({
            code: 'UNSAFE_LOCAL_ASSET_PATH',
            severity: 'error',
            variant: normVar.id,
            assetKey,
            path: refPath,
            message: `Variant "${normVar.id}" asset "${assetKey}" uses unsafe path "${refPath}".`,
            blocking: true
          });
        } else if (filesMap.size > 0 && !hasFileInMap(filesMap, refPath)) {
          varIssues.push({
            code: 'VARIANT_ASSET_NOT_FOUND',
            severity: 'error',
            variant: normVar.id,
            assetKey,
            path: refPath,
            message: `Variant "${normVar.id}" references asset "${refPath}" (for "${assetKey}") which is missing from the package archive.`,
            blocking: true
          });
        }
      }

      // Check variant-specific fields
      if (Array.isArray(rawVar.fields)) {
        const seenVarFieldIds = new Set();
        for (const vf of rawVar.fields) {
          const vfId = vf && (vf.id || vf.key);
          if (!vfId || typeof vfId !== 'string' || !vfId.trim()) {
            varIssues.push({
              code: 'VARIANT_FIELD_ID_MISSING',
              severity: 'error',
              variant: normVar.id,
              message: `Variant "${normVar.id}" contains a field declaration without a valid "id".`,
              blocking: true
            });
            continue;
          }
          if (seenVarFieldIds.has(vfId)) {
            varIssues.push({
              code: 'DUPLICATE_VARIANT_FIELD_ID',
              severity: 'error',
              variant: normVar.id,
              field: vfId,
              message: `Variant "${normVar.id}" declares duplicate field ID "${vfId}".`,
              blocking: true
            });
          }
          seenVarFieldIds.add(vfId);

          const vfType = String(vf.type || 'text').toLowerCase().trim();
          if (!UTP_SUPPORTED_FIELD_TYPES.has(vfType)) {
            varIssues.push({
              code: 'UNSUPPORTED_FIELD_TYPE',
              severity: 'error',
              variant: normVar.id,
              field: vfId,
              message: `Variant "${normVar.id}" field "${vfId}" specifies unsupported type "${vfType}".`,
              blocking: true
            });
          }

          if (vf.binding && vf.binding.target && !UTP_SUPPORTED_BINDING_TARGETS.has(vf.binding.target)) {
            varIssues.push({
              code: 'UNSUPPORTED_BINDING_TARGET',
              severity: 'error',
              variant: normVar.id,
              field: vfId,
              message: `Variant "${normVar.id}" field "${vfId}" specifies unsupported binding target "${vf.binding.target}".`,
              blocking: true
            });
          }

          if (filesMap.size > 0 && ['image', 'audio', 'video'].includes(vfType) && typeof vf.defaultValue === 'string' && vf.defaultValue.trim()) {
            const defP = vf.defaultValue.trim();
            if (!defP.startsWith('http://') && !defP.startsWith('https://') && !defP.startsWith('data:') && !defP.startsWith('/assets/')) {
              if (isUnsafeRelativePath(defP)) {
                varIssues.push({
                  code: 'UNSAFE_LOCAL_ASSET_PATH',
                  severity: 'error',
                  variant: normVar.id,
                  field: vfId,
                  path: defP,
                  message: `Variant "${normVar.id}" field "${vfId}" defaultValue "${defP}" uses an unsafe path.`,
                  blocking: true
                });
              } else if (!hasFileInMap(filesMap, defP)) {
                varIssues.push({
                  code: 'VARIANT_ASSET_NOT_FOUND',
                  severity: 'error',
                  variant: normVar.id,
                  field: vfId,
                  path: defP,
                  message: `Variant "${normVar.id}" field "${vfId}" default asset "${defP}" was not found in the archive.`,
                  blocking: true
                });
              }
            }
          }

          if (variantHtmlContent) {
            const vBind = checkFieldBindingInCode({ ...vf, id: vfId, type: vfType }, variantHtmlContent, cssContent);
            if (!vBind.bound) {
              const unboundErr = {
                code: 'UNBOUND_VARIANT_FIELD',
                severity: 'error',
                variant: normVar.id,
                field: vfId,
                message: `Variant "${normVar.id}": ${vBind.reason}`,
                blocking: true
              };
              varIssues.push(unboundErr);
            }
          }
        }
      }

      if (varIssues.length > 0) {
        for (const vi of varIssues) issues.push(vi);
        invalidVariants.push({
          index: vIdx,
          id: normVar?.id || rawId || null,
          slug: normVar?.slug || null,
          relationship: normVar?.relationship || rawRel || null,
          label: normVar?.label || null,
          errors: varIssues.map(i => i.message),
          issues: varIssues
        });
      } else if (normVar) {
        validVariants.push(normVar);
        detectedRelations.push({
          id: normVar.relationshipId,
          slug: normVar.relationship,
          label: normVar.label,
          displayName: normVar.name,
          icon: normVar.icon,
          variantId: normVar.id,
          variantSlug: normVar.slug,
          thumbnail: normVar.thumbnail,
          status: normVar.status,
          enabled: normVar.enabled
        });
      }
    });
  }

  // 7. Capabilities Registry & Implementation Cross-Verification
  const declaredCaps = Array.isArray(norm.capabilities) ? norm.capabilities : [];
  for (const capKey of declaredCaps) {
    const reg = UTP_CAPABILITY_REGISTRY[capKey];
    if (!reg) {
      issues.push({
        code: 'UNKNOWN_CAPABILITY_REQUEST',
        severity: 'warning',
        message: `Capability "${capKey}" is not recognized by the server capability registry.`,
        blocking: false
      });
      continue;
    }

    if (htmlContent) {
      if ((capKey === 'music' || capKey === 'audio') && !fields.some(f => f.type === 'audio') && !/<audio\b/i.test(htmlContent) && !/Audio\s*\(/i.test(jsContent)) {
        issues.push({
          code: 'CAPABILITY_IMPLEMENTATION_MISMATCH',
          severity: 'warning',
          capability: capKey,
          message: `Capability "${capKey}" is declared in wishmagic.json, but no audio field, <audio> element, or Audio player logic was found in the template.`,
          blocking: false
        });
      } else if (capKey === 'video' && !fields.some(f => f.type === 'video' || f.type === 'video-multiple') && !/<video\b/i.test(htmlContent)) {
        issues.push({
          code: 'CAPABILITY_IMPLEMENTATION_MISMATCH',
          severity: 'warning',
          capability: capKey,
          message: `Capability "video" is declared in wishmagic.json, but no video field or <video> element was found in index.html.`,
          blocking: false
        });
      } else if (capKey === 'countdown' && !fields.some(f => f.type === 'date' || f.type === 'datetime') && !/countdown/i.test(htmlContent) && !/countdown|setInterval/i.test(jsContent)) {
        issues.push({
          code: 'CAPABILITY_IMPLEMENTATION_MISMATCH',
          severity: 'warning',
          capability: capKey,
          message: `Capability "countdown" is declared in wishmagic.json, but no date/datetime field or countdown timer implementation was detected.`,
          blocking: false
        });
      }
    }
  }

  // 8. Package Asset & HTML Referenced Path Cross-Validation (if filesMap provided)
  if (filesMap.size > 0) {
    const declaredStyles = Array.isArray(norm.files?.styles) ? norm.files.styles : [];
    const declaredScripts = Array.isArray(norm.files?.scripts) ? norm.files.scripts : [];
    for (const stylePath of declaredStyles) {
      const clean = String(stylePath || '').replace(/\\/g, '/').replace(/^\.?\/+/, '');
      if (clean && !hasFileInMap(filesMap, clean)) {
        issues.push({
          code: 'STYLESHEET_NOT_FOUND',
          severity: 'error',
          path: clean,
          message: `Declared stylesheet "${clean}" in wishmagic.json was not found in the ZIP archive.`,
          blocking: true
        });
      }
    }
    for (const scriptPath of declaredScripts) {
      const clean = String(scriptPath || '').replace(/\\/g, '/').replace(/^\.?\/+/, '');
      if (clean && !hasFileInMap(filesMap, clean)) {
        issues.push({
          code: 'SCRIPT_NOT_FOUND',
          severity: 'error',
          path: clean,
          message: `Declared script "${clean}" in wishmagic.json was not found in the ZIP archive.`,
          blocking: true
        });
      }
    }

    if (Array.isArray(norm.assets)) {
      for (const asset of norm.assets) {
        const assetPath = typeof asset === 'string' ? asset : (asset.path || asset.file);
        if (!assetPath) continue;
        const clean = assetPath.replace(/\\/g, '/').replace(/^\/+/, '');
        if (!hasFileInMap(filesMap, clean)) {
          const isRequired = typeof asset === 'object' ? Boolean(asset.required) : true;
          issues.push({
            code: 'ASSET_NOT_FOUND',
            severity: isRequired ? 'error' : 'warning',
            path: clean,
            message: `Declared template asset "${clean}" was not found in the archive.`,
            blocking: isRequired
          });
        }
      }
    }

    if (htmlContent) {
      const refRegex = /<(?:link|script|img|audio|video|source)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi;
      let refMatch;
      while ((refMatch = refRegex.exec(htmlContent)) !== null) {
        const rawRef = refMatch[1].trim();
        if (
          !rawRef ||
          rawRef.startsWith('http://') ||
          rawRef.startsWith('https://') ||
          rawRef.startsWith('//') ||
          rawRef.startsWith('data:') ||
          rawRef.startsWith('blob:') ||
          rawRef.startsWith('#') ||
          rawRef.startsWith('mailto:') ||
          rawRef.startsWith('tel:') ||
          rawRef.startsWith('{{') ||
          rawRef.startsWith('/js/') ||
          rawRef.startsWith('/css/') ||
          rawRef.startsWith('/assets/')
        ) {
          continue;
        }

        if (isUnsafeRelativePath(rawRef)) {
          issues.push({
            code: 'UNSAFE_LOCAL_ASSET_PATH',
            severity: 'error',
            path: rawRef,
            message: `HTML references illegal local or traversal path "${rawRef}". Use relative package paths such as "assets/images/cover.jpg".`,
            blocking: true
          });
          continue;
        }

        const cleanRef = rawRef.split('?')[0].split('#')[0].replace(/\\/g, '/').replace(/^\.?\/+/, '');
        if (cleanRef && !hasFileInMap(filesMap, cleanRef)) {
          issues.push({
            code: 'MISSING_REFERENCED_ASSET',
            severity: 'warning',
            path: cleanRef,
            message: `File "${cleanRef}" is referenced in index.html but missing from the ZIP package.`,
            blocking: false
          });
        }
      }
    }
  }

  const hasBlockingErrors = issues.some(i => i.severity === 'error' && i.blocking !== false);
  const isValid = issues.filter(i => i.severity === 'error').length === 0;
  const isPublishable = !hasBlockingErrors;

  const variantsReport = {
    hasVariants: Array.isArray(rawVariantsProp) && rawVariantsProp.length > 0,
    detectedCount: Array.isArray(rawVariantsProp) ? rawVariantsProp.length : 0,
    validCount: validVariants.length,
    invalidCount: invalidVariants.length,
    validVariants,
    invalidVariants,
    detectedRelations
  };

  return buildReport(isValid, issues, norm, isPublishable, {
    confirmedFields: fields,
    suggestedFields,
    boundFields,
    unboundFields,
    variantsReport
  });
}

/**
 * Builds standard structured validation report
 */
function buildReport(valid, issues, normalized, publishable = false, extra = {}) {
  const errorsCount = issues.filter(i => i.severity === 'error').length;
  const warningsCount = issues.filter(i => i.severity === 'warning').length;
  const confirmedFields = Array.isArray(extra.confirmedFields) ? extra.confirmedFields : (Array.isArray(normalized?.fields) ? normalized.fields : []);
  const suggestedFields = Array.isArray(extra.suggestedFields) ? extra.suggestedFields : [];
  const boundFields = Array.isArray(extra.boundFields) ? extra.boundFields : [];
  const unboundFields = Array.isArray(extra.unboundFields) ? extra.unboundFields : [];
  const variantsReport = extra.variantsReport || {
    hasVariants: Boolean(normalized?.hasVariants),
    detectedCount: Array.isArray(normalized?.variants) ? normalized.variants.length : 0,
    validCount: Array.isArray(normalized?.variants) ? normalized.variants.length : 0,
    invalidCount: 0,
    validVariants: Array.isArray(normalized?.variants) ? normalized.variants : [],
    invalidVariants: [],
    detectedRelations: []
  };

  return {
    valid: Boolean(valid),
    publishable: Boolean(publishable),
    protocol: {
      schemaVersion: normalized?.schemaVersion || UTP_SCHEMA_VERSION,
      runtimeApi: normalized?.compatibility?.runtimeApi || UTP_RUNTIME_API_VERSION
    },
    template: normalized ? {
      id: normalized.template.id,
      name: normalized.template.name,
      templateVersion: normalized.template.templateVersion,
      category: normalized.template.category,
      tier: normalized.template.tier,
      price: normalized.template.price
    } : null,
    summary: {
      errors: errorsCount,
      warnings: warningsCount,
      totalIssues: issues.length,
      passedChecks: Math.max(0, 15 - errorsCount),
      fieldsCount: confirmedFields.length,
      boundFieldsCount: boundFields.length,
      unboundFieldsCount: unboundFields.length,
      suggestedFieldsCount: suggestedFields.length,
      sectionsCount: Array.isArray(normalized?.sections) ? normalized.sections.length : 0,
      capabilitiesCount: Array.isArray(normalized?.capabilities) ? normalized.capabilities.length : 0,
      variantsDetected: variantsReport.hasVariants,
      variantsCount: variantsReport.detectedCount,
      validVariantsCount: variantsReport.validCount,
      invalidVariantsCount: variantsReport.invalidCount
    },
    variants: variantsReport,
    confirmedFields,
    suggestedFields,
    boundFields,
    unboundFields,
    issues,
    errors: issues.filter(i => i.severity === 'error'),
    warnings: issues.filter(i => i.severity === 'warning'),
    normalized
  };
}
