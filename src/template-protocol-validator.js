/**
 * Universal Template Protocol (UTP v1.0 / v1.1 / v1.2) — Authoritative Server & Client Validator
 * ----------------------------------------------------------------------------------------------
 * Validates template manifests (`wishmagic.json`), HTML/CSS/JS bindings,
 * field schemas, nested section/subsection definitions, relationship declarations,
 * action/button registries, capability requests, UTP v1.1.0/v1.2.0 multi-relationship
 * variant declarations, admin visibility/action configurations, and package asset
 * integrity against the canonical UTP specification.
 */

import {
  UTP_PROTOCOL_NAME,
  UTP_SCHEMA_VERSION,
  UTP_LATEST_SCHEMA_VERSION,
  UTP_SUPPORTED_SCHEMA_VERSIONS,
  UTP_RUNTIME_API_VERSION,
  UTP_LATEST_RUNTIME_API_VERSION,
  UTP_SUPPORTED_FIELD_TYPES,
  UTP_SUPPORTED_BINDING_TARGETS,
  UTP_CANONICAL_RELATIONSHIPS,
  UTP_CAPABILITY_REGISTRY,
  UTP_MAX_SECTION_NESTING_DEPTH,
  UTP_EMPTY_PARENT_POLICIES,
  UTP_SUPPORTED_ACTION_TYPES,
  UTP_ACTION_FALLBACK_BEHAVIORS,
  UTP_SUPPORTED_LOGICAL_LINKS,
  isValidLogicalLinkIdentifier,
  normalizeRelationshipIdentifier,
  isValidSemver,
  isValidIdentifier,
  validateActionDestinationUrl
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

export function normalizeFieldEntry(f) {
  if (typeof f === 'string') {
    return {
      id: f,
      key: f,
      type: 'text',
      label: f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      required: false,
      defaultValue: '',
      sectionId: null,
      subsectionId: null,
      binding: { target: 'text', selector: `[data-wm-field='${f}']` }
    };
  }
  if (!f || typeof f !== 'object') return null;
  const id = String(f.id || f.key || f.name || '').trim();
  const type = String(f.type || 'text').toLowerCase().trim();
  const sectionId = f.sectionId || f.section || null;
  const subsectionId = f.subsectionId || f.subsection || null;
  return {
    ...f,
    id,
    key: id,
    type,
    label: f.label || (id ? id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''),
    required: Boolean(f.required || f.isRequired),
    defaultValue: f.defaultValue !== undefined ? f.defaultValue : (f.default !== undefined ? f.default : ''),
    sectionId: sectionId ? String(sectionId).trim() : null,
    subsectionId: subsectionId ? String(subsectionId).trim() : null,
    binding: f.binding || {
      target: ['image', 'audio', 'video'].includes(type) ? 'src' : 'text',
      selector: `[data-wm-field='${id}']`
    }
  };
}

/**
 * Normalizes a section or nested subsection declaration into canonical UTP v1.2.0 format.
 * Supports recursive `subsections` up to `UTP_MAX_SECTION_NESTING_DEPTH`.
 */
export function normalizeSectionEntry(s, idx = 0, depth = 1, parentId = null) {
  if (typeof s === 'string') {
    const cleanId = s.trim();
    return {
      id: cleanId,
      key: cleanId,
      label: cleanId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      required: false,
      toggleable: true,
      defaultEnabled: true,
      order: idx + 1,
      depth,
      parentId,
      emptyParentPolicy: 'collapse',
      fields: [],
      actions: [],
      subsections: []
    };
  }
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const sId = String(s.id || s.key || '').trim();
  const req = Boolean(s.required);
  const rawToggleable = s.toggleable !== undefined ? Boolean(s.toggleable) : !req;
  const rawDefaultEnabled = req
    ? true
    : (s.defaultEnabled !== undefined
      ? Boolean(s.defaultEnabled)
      : (s.enabled !== undefined ? Boolean(s.enabled) : (s.isEnabled !== undefined ? Boolean(s.isEnabled) : true)));
  const emptyParentPolicy = String(s.emptyParentPolicy || 'collapse').toLowerCase().trim();

  const rawSubsections = Array.isArray(s.subsections)
    ? s.subsections
    : (Array.isArray(s.children) ? s.children : []);

  const normalizedSubsections = rawSubsections
    .map((sub, subIdx) => normalizeSectionEntry(sub, subIdx, depth + 1, sId || null))
    .filter(Boolean);

  const fields = Array.isArray(s.fields)
    ? s.fields.map(f => (typeof f === 'string' ? f.trim() : String(f?.id || f?.key || '').trim())).filter(Boolean)
    : [];

  const actions = Array.isArray(s.actions)
    ? s.actions.map(a => (typeof a === 'string' ? a.trim() : String(a?.id || a?.key || '').trim())).filter(Boolean)
    : [];

  return {
    ...s,
    id: sId,
    key: sId,
    label: String(s.label || s.name || s.title || (sId ? sId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : `Section ${idx + 1}`)).trim(),
    required: req,
    toggleable: req ? false : rawToggleable,
    defaultEnabled: rawDefaultEnabled,
    order: s.order !== undefined ? Number(s.order) : (s.sortOrder !== undefined ? Number(s.sortOrder) : (idx + 1)),
    depth,
    parentId,
    emptyParentPolicy: UTP_EMPTY_PARENT_POLICIES.has(emptyParentPolicy) ? emptyParentPolicy : 'collapse',
    fields,
    actions,
    subsections: normalizedSubsections,
    binding: s.binding || {
      selector: depth === 1 ? `[data-wm-section='${sId}']` : `[data-wm-subsection='${sId}'], [data-wm-section='${sId}']`
    }
  };
}

/**
 * Flattens a hierarchical `sections[]` tree into an ordered array of nodes with parent metadata.
 */
export function flattenSectionsTree(sections = [], parentChain = []) {
  const flat = [];
  if (!Array.isArray(sections)) return flat;
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (!sec || typeof sec !== 'object') continue;
    const node = {
      ...sec,
      parentId: parentChain.length > 0 ? parentChain[parentChain.length - 1] : (sec.parentId || null),
      ancestorIds: [...parentChain],
      depth: parentChain.length + 1
    };
    flat.push(node);
    if (Array.isArray(sec.subsections) && sec.subsections.length > 0) {
      flat.push(...flattenSectionsTree(sec.subsections, [...parentChain, sec.id]));
    }
  }
  return flat;
}

/**
 * Normalizes an action/button declaration into canonical UTP v1.2.0 format.
 */
export function normalizeActionEntry(a, idx = 0) {
  if (typeof a === 'string') {
    const cleanId = a.trim();
    return {
      id: cleanId,
      key: cleanId,
      label: cleanId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      defaultLabel: cleanId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      type: 'none',
      target: '',
      defaultTarget: '',
      sectionId: null,
      editableLabel: true,
      configurable: true,
      relationshipSpecific: true,
      required: false,
      enabled: true,
      defaultEnabled: true,
      openInNewTab: false,
      preserveRelationshipContext: true,
      fallbackBehavior: 'hide',
      order: idx + 1,
      binding: { selector: `[data-wm-action='${cleanId}']` }
    };
  }
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  const id = String(a.id || a.key || a.actionId || '').trim();
  const type = String(a.type || a.actionType || 'section').toLowerCase().trim();
  const rawLabel = a.label !== undefined
    ? String(a.label)
    : (a.defaultLabel !== undefined ? String(a.defaultLabel) : (id ? id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''));
  const rawLogicalLink = a.logicalLink !== undefined
    ? String(a.logicalLink || '').trim()
    : (a.linkId !== undefined ? String(a.linkId || '').trim() : '');
  let rawTarget = a.target !== undefined
    ? String(a.target).trim()
    : (a.destination !== undefined
      ? String(a.destination).trim()
      : (a.url !== undefined
        ? String(a.url).trim()
        : (a.targetId !== undefined ? String(a.targetId).trim() : (a.defaultTarget !== undefined ? String(a.defaultTarget).trim() : ''))));
  const logicalLink = rawLogicalLink || ((rawTarget.startsWith('global.') || rawTarget.startsWith('template.')) ? rawTarget : null);
  if (!rawTarget && logicalLink && UTP_SUPPORTED_LOGICAL_LINKS[logicalLink]) {
    rawTarget = UTP_SUPPORTED_LOGICAL_LINKS[logicalLink];
  }

  const fallback = String(a.fallbackBehavior || a.fallback || 'hide').toLowerCase().trim();
  const sectionId = a.sectionId || a.section || a.parentSectionId || null;
  const req = Boolean(a.required);
  const defEnabled = req
    ? true
    : (a.defaultEnabled !== undefined ? Boolean(a.defaultEnabled) : (a.enabled !== undefined ? Boolean(a.enabled) : true));

  return {
    ...a,
    id,
    key: id,
    label: rawLabel.trim(),
    defaultLabel: String(a.defaultLabel !== undefined ? a.defaultLabel : rawLabel).trim(),
    type,
    logicalLink: logicalLink || null,
    target: rawTarget,
    defaultTarget: String(a.defaultTarget !== undefined ? a.defaultTarget : rawTarget).trim(),
    sectionId: sectionId ? String(sectionId).trim() : null,
    editableLabel: a.editableLabel !== undefined ? Boolean(a.editableLabel) : (a.labelEditable !== undefined ? Boolean(a.labelEditable) : true),
    configurable: a.configurable !== undefined ? Boolean(a.configurable) : true,
    relationshipSpecific: a.relationshipSpecific !== undefined ? Boolean(a.relationshipSpecific) : true,
    required: req,
    enabled: defEnabled,
    defaultEnabled: defEnabled,
    openInNewTab: a.openInNewTab !== undefined ? Boolean(a.openInNewTab) : (type === 'external_url'),
    preserveRelationshipContext: a.preserveRelationshipContext !== undefined
      ? Boolean(a.preserveRelationshipContext)
      : (type === 'internal_url' || type === 'customizer'),
    fallbackBehavior: UTP_ACTION_FALLBACK_BEHAVIORS.has(fallback) ? fallback : 'hide',
    order: a.order !== undefined ? Number(a.order) : (idx + 1),
    binding: a.binding || { selector: `[data-wm-action='${id}']` }
  };
}

/**
 * Normalizes a variant-level visibility map from `rawVar.visibility`, `rawVar.sectionVisibility`,
 * or `rawVar.sections` declarations.
 */
function normalizeVariantVisibilityMap(rawVar = {}) {
  const map = {};
  const visObj = (rawVar.visibility && typeof rawVar.visibility === 'object' && !Array.isArray(rawVar.visibility))
    ? rawVar.visibility
    : ((rawVar.visibilityOverrides && typeof rawVar.visibilityOverrides === 'object' && !Array.isArray(rawVar.visibilityOverrides))
      ? rawVar.visibilityOverrides
      : ((rawVar.sectionVisibility && typeof rawVar.sectionVisibility === 'object' && !Array.isArray(rawVar.sectionVisibility))
        ? rawVar.sectionVisibility
        : null));

  if (visObj) {
    for (const [k, v] of Object.entries(visObj)) {
      const cleanKey = String(k || '').trim();
      if (!cleanKey) continue;
      if (typeof v === 'boolean') {
        map[cleanKey] = v;
      } else if (v && typeof v === 'object' && v.enabled !== undefined) {
        map[cleanKey] = Boolean(v.enabled);
      }
    }
  }

  const walkVarSections = (secList) => {
    if (!Array.isArray(secList)) return;
    for (const s of secList) {
      if (!s || typeof s !== 'object') continue;
      const sId = String(s.id || s.key || '').trim();
      if (sId) {
        if (typeof s.enabled === 'boolean') map[sId] = s.enabled;
        else if (typeof s.defaultEnabled === 'boolean') map[sId] = s.defaultEnabled;
        else if (typeof s.isEnabled === 'boolean') map[sId] = s.isEnabled;
        else if (s.disabled === true) map[sId] = false;
      }
      if (Array.isArray(s.subsections)) {
        walkVarSections(s.subsections);
      }
    }
  };
  walkVarSections(rawVar.sections);

  return map;
}

/**
 * Normalizes variant-level action overrides into a structured array and map.
 */
function normalizeVariantActionOverrides(rawVar = {}) {
  const rawActions = rawVar.actions !== undefined
    ? rawVar.actions
    : (rawVar.buttonActions !== undefined ? rawVar.buttonActions : rawVar.actionOverrides);

  const list = [];
  if (Array.isArray(rawActions)) {
    rawActions.forEach((a, idx) => {
      if (!a || typeof a !== 'object') return;
      const id = String(a.id || a.key || a.actionId || '').trim();
      if (!id) return;
      const entry = { id };
      if (a.label !== undefined) entry.label = String(a.label).trim();
      if (a.type !== undefined || a.actionType !== undefined) entry.type = String(a.type || a.actionType).toLowerCase().trim();
      if (a.target !== undefined || a.destination !== undefined || a.url !== undefined || a.targetId !== undefined) {
        entry.target = String(a.target ?? a.destination ?? a.url ?? a.targetId).trim();
      }
      if (a.enabled !== undefined) entry.enabled = Boolean(a.enabled);
      if (a.disabled === true) entry.enabled = false;
      if (a.openInNewTab !== undefined) entry.openInNewTab = Boolean(a.openInNewTab);
      if (a.fallbackBehavior !== undefined) entry.fallbackBehavior = String(a.fallbackBehavior).toLowerCase().trim();
      entry.order = a.order !== undefined ? Number(a.order) : (idx + 1);
      list.push(entry);
    });
  } else if (rawActions && typeof rawActions === 'object') {
    Object.entries(rawActions).forEach(([k, a], idx) => {
      const id = String(k || '').trim();
      if (!id) return;
      if (typeof a === 'string') {
        list.push({ id, label: a.trim(), order: idx + 1 });
      } else if (a && typeof a === 'object') {
        const entry = { id };
        if (a.label !== undefined) entry.label = String(a.label).trim();
        if (a.type !== undefined || a.actionType !== undefined) entry.type = String(a.type || a.actionType).toLowerCase().trim();
        if (a.target !== undefined || a.destination !== undefined || a.url !== undefined || a.targetId !== undefined) {
          entry.target = String(a.target ?? a.destination ?? a.url ?? a.targetId).trim();
        }
        if (a.enabled !== undefined) entry.enabled = Boolean(a.enabled);
        if (a.disabled === true) entry.enabled = false;
        if (a.openInNewTab !== undefined) entry.openInNewTab = Boolean(a.openInNewTab);
        if (a.fallbackBehavior !== undefined) entry.fallbackBehavior = String(a.fallbackBehavior).toLowerCase().trim();
        entry.order = a.order !== undefined ? Number(a.order) : (idx + 1);
        list.push(entry);
      }
    });
  }
  return list;
}

/**
 * Normalizes a single variant declaration into canonical UTP v1.1.0 / v1.2.0 structure
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
  const visibility = normalizeVariantVisibilityMap(rawVar);
  const actions = normalizeVariantActionOverrides(rawVar);

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
    sections: varSections,
    visibility,
    actions
  };
}

/**
 * Normalizes a raw or legacy manifest into the canonical UTP v1.0.0 / v1.1.0 / v1.2.0 schema object.
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

  const normalizedSections = rawSections.map((s, idx) => normalizeSectionEntry(s, idx, 1, null)).filter(Boolean);

  const rawActions = Array.isArray(raw.actions)
    ? raw.actions
    : (Array.isArray(tObj.actions) ? tObj.actions : (Array.isArray(raw.buttons) ? raw.buttons : []));

  const normalizedActions = rawActions.map((a, idx) => normalizeActionEntry(a, idx)).filter(Boolean);

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

  const hasSubsectionsOrActions = normalizedActions.length > 0 ||
    normalizedSections.some(s => Array.isArray(s.subsections) && s.subsections.length > 0) ||
    normalizedVariants.some(v => (v.actions && v.actions.length > 0) || (v.visibility && Object.keys(v.visibility).length > 0));

  const declaredSchemaVersion = raw.schemaVersion
    ? String(raw.schemaVersion).trim()
    : (hasSubsectionsOrActions ? UTP_LATEST_SCHEMA_VERSION : (normalizedVariants.length > 0 ? '1.1.0' : UTP_SCHEMA_VERSION));

  return {
    $schema: UTP_PROTOCOL_NAME,
    protocol: UTP_PROTOCOL_NAME,
    schemaVersion: declaredSchemaVersion,
    template: templateMeta,
    entry,
    compatibility: {
      runtimeApi: String(raw.compatibility?.runtimeApi || UTP_RUNTIME_API_VERSION),
      minimumRuntimeApi: String(raw.compatibility?.minimumRuntimeApi || raw.compatibility?.runtimeApi || '1.0')
    },
    files: {
      entry,
      styles: Array.isArray(raw.files?.styles) ? raw.files.styles : [],
      scripts: Array.isArray(raw.files?.scripts) ? raw.files.scripts : []
    },
    fields: normalizedFields,
    sections: normalizedSections,
    actions: normalizedActions,
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
 * Extracts sections (`data-wm-section`), subsections (`data-wm-subsection`),
 * actions (`data-wm-action` / `data-wm-button`), and modals (`data-wm-modal`) from HTML,
 * including parent-child relationships between sections, subsections, fields, and actions.
 */
export function extractHtmlDeclaredSectionsAndActions(htmlContent = '') {
  const sections = [];
  const subsections = [];
  const actions = [];
  const modals = [];
  const fieldToContainerMap = {};
  const actionToContainerMap = {};

  if (!htmlContent || typeof htmlContent !== 'string') {
    return { sections, subsections, actions, modals, fieldToContainerMap, actionToContainerMap };
  }

  const seenSections = new Set();
  const seenSubsections = new Set();
  const seenActions = new Set();
  const seenModals = new Set();

  // Lightweight tag stack tracker to map nested subsections, fields, and actions to their enclosing section/subsection
  const tokenRegex = /<\/?([a-zA-Z0-9-]+)([^>]*)>/g;
  const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const stack = [];
  let match;

  while ((match = tokenRegex.exec(htmlContent)) !== null) {
    const fullMatch = match[0];
    const tagLower = match[1].toLowerCase();
    const attrs = match[2] || '';
    const isClosing = fullMatch.startsWith('</');
    const isSelfClosing = fullMatch.endsWith('/>') || VOID_TAGS.has(tagLower);

    if (isClosing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tagLower) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const secMatch = attrs.match(/\bdata-wm-section\s*=\s*["']([^"']+)["']/i);
    const subMatch = attrs.match(/\bdata-wm-subsection\s*=\s*["']([^"']+)["']/i);
    const actMatch = attrs.match(/\bdata-wm-(?:action|button)\s*=\s*["']([^"']+)["']/i);
    const modMatch = attrs.match(/\bdata-wm-modal\s*=\s*["']([^"']+)["']/i);
    const fieldMatch = attrs.match(/\bdata-wm(?:-field)?\s*=\s*["']([^"']+)["']/i);
    const labelAttr = attrs.match(/\bdata-wm-label\s*=\s*["']([^"']+)["']/i);
    const parentAttr = attrs.match(/\bdata-wm-parent\s*=\s*["']([^"']+)["']/i);

    // Find current enclosing section/subsection from stack
    let enclosingSectionId = null;
    let enclosingSubsectionId = null;
    const containerAncestors = [];
    for (let i = 0; i < stack.length; i++) {
      if (stack[i].sectionId) {
        enclosingSectionId = stack[i].sectionId;
        containerAncestors.push(stack[i].sectionId);
      }
      if (stack[i].subsectionId) {
        enclosingSubsectionId = stack[i].subsectionId;
        containerAncestors.push(stack[i].subsectionId);
      }
    }

    const immediateContainerId = parentAttr
      ? parentAttr[1].trim()
      : (enclosingSubsectionId || enclosingSectionId || null);

    if (secMatch) {
      const sId = secMatch[1].trim();
      if (sId && !seenSections.has(sId)) {
        seenSections.add(sId);
        sections.push({
          id: sId,
          key: sId,
          label: labelAttr ? labelAttr[1].trim() : sId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          defaultEnabled: true,
          toggleable: true,
          required: false,
          order: sections.length + 1,
          parentId: immediateContainerId,
          depth: containerAncestors.length + 1,
          source: 'html-attribute'
        });
      }
    }

    if (subMatch) {
      const subId = subMatch[1].trim();
      if (subId && !seenSubsections.has(subId)) {
        seenSubsections.add(subId);
        subsections.push({
          id: subId,
          key: subId,
          label: labelAttr ? labelAttr[1].trim() : subId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          defaultEnabled: true,
          toggleable: true,
          required: false,
          order: subsections.length + 1,
          parentId: immediateContainerId,
          sectionId: enclosingSectionId,
          depth: containerAncestors.length + 1,
          source: 'html-attribute'
        });
      }
    }

    if (fieldMatch) {
      const fId = fieldMatch[1].trim();
      if (fId && (enclosingSubsectionId || enclosingSectionId)) {
        fieldToContainerMap[fId] = {
          sectionId: enclosingSectionId,
          subsectionId: enclosingSubsectionId,
          containerId: enclosingSubsectionId || enclosingSectionId
        };
      }
    }

    if (actMatch) {
      const aId = actMatch[1].trim();
      if (aId) {
        if (enclosingSubsectionId || enclosingSectionId) {
          actionToContainerMap[aId] = {
            sectionId: enclosingSectionId,
            subsectionId: enclosingSubsectionId,
            containerId: enclosingSubsectionId || enclosingSectionId
          };
        }
        if (!seenActions.has(aId)) {
          seenActions.add(aId);
          const typeAttr = attrs.match(/\bdata-wm-action-type\s*=\s*["']([^"']+)["']/i);
          const targetAttr = attrs.match(/\bdata-wm-action-target\s*=\s*["']([^"']+)["']/i) || attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
          // Extract inner text if simple tag
          let innerText = '';
          const afterPos = tokenRegex.lastIndex;
          const closeIdx = htmlContent.indexOf(`</${match[1]}`, afterPos);
          if (closeIdx !== -1 && closeIdx - afterPos < 240) {
            innerText = htmlContent.slice(afterPos, closeIdx).replace(/<[^>]+>/g, '').trim();
          }
          const rawTarget = targetAttr ? targetAttr[1].trim() : '';
          let inferredType = typeAttr ? typeAttr[1].toLowerCase().trim() : 'section';
          if (!typeAttr) {
            if (rawTarget.startsWith('https://') || rawTarget.startsWith('http://')) inferredType = 'external_url';
            else if (rawTarget.startsWith('/customize') || rawTarget.includes('customize')) inferredType = 'customizer';
            else if (rawTarget.startsWith('/')) inferredType = 'internal_url';
            else if (rawTarget.startsWith('#')) inferredType = 'section';
          }
          actions.push({
            id: aId,
            key: aId,
            label: labelAttr ? labelAttr[1].trim() : (innerText || aId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())),
            type: inferredType,
            target: rawTarget.startsWith('#') && inferredType === 'section' ? rawTarget.slice(1) : rawTarget,
            sectionId: enclosingSubsectionId || enclosingSectionId || null,
            editableLabel: true,
            configurable: true,
            relationshipSpecific: true,
            required: false,
            defaultEnabled: true,
            fallbackBehavior: 'hide',
            order: actions.length + 1,
            source: 'html-attribute'
          });
        }
      }
    }

    if (modMatch) {
      const mId = modMatch[1].trim();
      if (mId && !seenModals.has(mId)) {
        seenModals.add(mId);
        modals.push({ id: mId, source: 'data-wm-modal' });
      }
    }

    if (!isSelfClosing) {
      stack.push({
        tag: tagLower,
        sectionId: secMatch ? secMatch[1].trim() : null,
        subsectionId: subMatch ? subMatch[1].trim() : null
      });
    }
  }

  const attachIdIncludes = (arr) => {
    const origIncludes = Array.prototype.includes.bind(arr);
    Object.defineProperty(arr, "includes", {
      value(searchElement, fromIndex) {
        if (typeof searchElement === "string") {
          return arr.some((item, idx) => idx >= (fromIndex || 0) && (item === searchElement || item?.id === searchElement || item?.key === searchElement));
        }
        return origIncludes(searchElement, fromIndex);
      },
      configurable: true
    });
    return arr;
  };
  return {
    sections: attachIdIncludes(sections),
    subsections: attachIdIncludes(subsections),
    actions: attachIdIncludes(actions),
    modals: attachIdIncludes(modals),
    sectionIds: sections.map(s => s.id),
    subsectionIds: subsections.map(s => s.id),
    actionIds: actions.map(a => a.id),
    modalIds: modals.map(m => m.id),
    fieldToContainerMap,
    actionToContainerMap
  };
}

/**
 * Checks whether an action's HTML binding (`[data-wm-action="<id>"]` or `[data-wm-button="<id>"]` or custom selector) exists in HTML
 */
export function checkActionBindingInCode(action, htmlContent = '') {
  const aId = String(action?.id || action?.key || '').trim();
  if (!aId) return { bound: false, reason: 'missing_action_id' };
  if (!htmlContent) return { bound: true, via: 'no-html-context' };

  const escapedId = aId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const attrRegex = new RegExp(`data-wm-(?:action|button)\\s*=\\s*["']${escapedId}["']`, 'i');
  if (attrRegex.test(htmlContent)) {
    return { bound: true, via: `data-wm-action="${aId}"` };
  }

  const bSelector = String(action?.binding?.selector || '').trim();
  if (bSelector) {
    const idSelMatch = bSelector.match(/^#([a-zA-Z0-9_-]+)$/);
    if (idSelMatch) {
      const targetId = idSelMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\bid\\s*=\\s*["']${targetId}["']`, 'i').test(htmlContent)) {
        return { bound: true, via: bSelector };
      }
    }
  }

  if (new RegExp(`\\bid\\s*=\\s*["']${escapedId}["']`, 'i').test(htmlContent)) {
    return { bound: true, via: `#${aId}` };
  }

  return {
    bound: false,
    reason: `No matching HTML element found for action "${aId}" (expected [data-wm-action="${aId}"])`
  };
}

/**
 * Checks whether a modal target exists in the HTML (`data-wm-modal="<id>"` or `id="<id>"`)
 */
export function checkModalExistsInHtml(modalId, htmlContent = '') {
  const cleanId = String(modalId || '').trim().replace(/^#/, '');
  if (!cleanId) return false;
  if (!htmlContent) return true;
  const esc = cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const modalAttrRegex = new RegExp(`data-wm-modal\\s*=\\s*["']${esc}["']`, 'i');
  const idAttrRegex = new RegExp(`\\bid\\s*=\\s*["']${esc}["']`, 'i');
  return modalAttrRegex.test(htmlContent) || idAttrRegex.test(htmlContent);
}

/**
 * Validates raw section/subsection declarations recursively and populates `issues`
 */
function validateRawSectionsRecursive(rawSections, issues, seenIds, depth = 1, parentId = null) {
  if (!Array.isArray(rawSections)) return;
  rawSections.forEach((rawSec, idx) => {
    const itemKind = depth === 1 ? 'section' : 'subsection';
    if (typeof rawSec === 'string') {
      const sId = rawSec.trim();
      if (!sId) {
        issues.push({
          code: depth === 1 ? 'SECTION_ID_MISSING' : 'SUBSECTION_ID_MISSING',
          severity: 'error',
          message: `Declared ${itemKind} at index ${idx} is missing a valid ID.`,
          blocking: true
        });
        return;
      }
      if (!isValidIdentifier(sId)) {
        issues.push({
          code: depth === 1 ? 'INVALID_SECTION_ID_FORMAT' : 'INVALID_SUBSECTION_ID_FORMAT',
          severity: 'error',
          section: sId,
          message: `${itemKind === 'section' ? 'Section' : 'Subsection'} ID "${sId}" has an invalid format. Use alphanumeric characters, hyphens, or underscores.`,
          blocking: true
        });
      }
      if (seenIds.has(sId)) {
        issues.push({
          code: depth === 1 ? 'DUPLICATE_SECTION_ID' : 'DUPLICATE_SUBSECTION_ID',
          severity: 'error',
          section: sId,
          message: `Duplicate ${itemKind} ID detected: "${sId}". Section and subsection IDs must be globally unique across the template.`,
          blocking: true
        });
      }
      seenIds.set(sId, { id: sId, depth, parentId, required: false, toggleable: true, defaultEnabled: true });
      return;
    }

    if (!rawSec || typeof rawSec !== 'object' || Array.isArray(rawSec)) {
      issues.push({
        code: 'INVALID_SECTION_DECLARATION',
        severity: 'error',
        message: `${itemKind === 'section' ? 'Section' : 'Subsection'} declaration at index ${idx} must be a valid object.`,
        blocking: true
      });
      return;
    }

    const sId = String(rawSec.id || rawSec.key || '').trim();
    if (!sId) {
      issues.push({
        code: depth === 1 ? 'SECTION_ID_MISSING' : 'SUBSECTION_ID_MISSING',
        severity: 'error',
        message: `${itemKind === 'section' ? 'Section' : 'Subsection'} declaration at index ${idx} is missing a required "id" property.`,
        blocking: true
      });
      return;
    }

    if (!isValidIdentifier(sId)) {
      issues.push({
        code: depth === 1 ? 'INVALID_SECTION_ID_FORMAT' : 'INVALID_SUBSECTION_ID_FORMAT',
        severity: 'error',
        section: sId,
        message: `${itemKind === 'section' ? 'Section' : 'Subsection'} ID "${sId}" contains invalid characters. Use alphanumeric characters, hyphens, or underscores.`,
        blocking: true
      });
    }

    if (depth > UTP_MAX_SECTION_NESTING_DEPTH) {
      issues.push({
        code: 'MAX_SECTION_NESTING_DEPTH_EXCEEDED',
        severity: 'error',
        section: sId,
        message: `Subsection "${sId}" is nested at depth ${depth}, exceeding maximum supported nesting depth of ${UTP_MAX_SECTION_NESTING_DEPTH}.`,
        blocking: true
      });
    }

    if (seenIds.has(sId)) {
      issues.push({
        code: depth === 1 ? 'DUPLICATE_SECTION_ID' : 'DUPLICATE_SUBSECTION_ID',
        severity: 'error',
        section: sId,
        message: `Duplicate ${itemKind} ID detected: "${sId}". Section and subsection IDs must be unique across the template.`,
        blocking: true
      });
    }

    // Validate boolean types for defaultEnabled, toggleable, required
    if (rawSec.defaultEnabled !== undefined && typeof rawSec.defaultEnabled !== 'boolean') {
      issues.push({
        code: 'INVALID_SECTION_DEFAULT_VALUE',
        severity: 'error',
        section: sId,
        message: `${itemKind === 'section' ? 'Section' : 'Subsection'} "${sId}" has invalid "defaultEnabled" value (${JSON.stringify(rawSec.defaultEnabled)}). Expected a boolean (true or false).`,
        blocking: true
      });
    }
    if (rawSec.toggleable !== undefined && typeof rawSec.toggleable !== 'boolean') {
      issues.push({
        code: 'INVALID_SECTION_DEFAULT_VALUE',
        severity: 'error',
        section: sId,
        message: `${itemKind === 'section' ? 'Section' : 'Subsection'} "${sId}" has invalid "toggleable" value (${JSON.stringify(rawSec.toggleable)}). Expected a boolean (true or false).`,
        blocking: true
      });
    }
    if (rawSec.required !== undefined && typeof rawSec.required !== 'boolean') {
      issues.push({
        code: 'INVALID_SECTION_DEFAULT_VALUE',
        severity: 'error',
        section: sId,
        message: `${itemKind === 'section' ? 'Section' : 'Subsection'} "${sId}" has invalid "required" value (${JSON.stringify(rawSec.required)}). Expected a boolean (true or false).`,
        blocking: true
      });
    }
    if (rawSec.emptyParentPolicy !== undefined && !UTP_EMPTY_PARENT_POLICIES.has(String(rawSec.emptyParentPolicy).toLowerCase().trim())) {
      issues.push({
        code: 'INVALID_EMPTY_PARENT_POLICY',
        severity: 'error',
        section: sId,
        message: `${itemKind === 'section' ? 'Section' : 'Subsection'} "${sId}" specifies invalid emptyParentPolicy "${rawSec.emptyParentPolicy}". Allowed values: collapse, keep.`,
        blocking: true
      });
    }

    const isReq = rawSec.required === true;
    const isToggleable = rawSec.toggleable !== undefined ? rawSec.toggleable === true : !isReq;
    const defEnabled = rawSec.defaultEnabled !== undefined ? rawSec.defaultEnabled === true : true;

    if (isReq && rawSec.toggleable === true) {
      issues.push({
        code: 'REQUIRED_TOGGLEABLE_CONFLICT',
        severity: 'warning',
        section: sId,
        message: `${itemKind === 'section' ? 'Section' : 'Subsection'} "${sId}" is marked required=true and toggleable=true. Required sections cannot be disabled and will be enforced as non-toggleable.`,
        blocking: false
      });
    }

    if (isReq && rawSec.defaultEnabled === false) {
      issues.push({
        code: 'REQUIRED_SECTION_CANNOT_BE_DISABLED',
        severity: 'error',
        section: sId,
        message: `Required ${itemKind} "${sId}" cannot have defaultEnabled=false.`,
        blocking: true
      });
    } else if (!isToggleable && rawSec.defaultEnabled === false) {
      issues.push({
        code: 'NON_TOGGLEABLE_SECTION_CANNOT_BE_DISABLED',
        severity: 'error',
        section: sId,
        message: `Non-toggleable ${itemKind} "${sId}" (toggleable=false) cannot have defaultEnabled=false.`,
        blocking: true
      });
    }

    // Check parent disabled vs child state diagnostic
    if (parentId && seenIds.has(parentId)) {
      const parentMeta = seenIds.get(parentId);
      if (parentMeta && parentMeta.defaultEnabled === false && defEnabled === false) {
        issues.push({
          code: 'SUBSECTION_DISABLED_UNDER_DISABLED_PARENT',
          severity: 'warning',
          section: sId,
          parentSection: parentId,
          message: `Subsection "${sId}" is explicitly disabled while its parent "${parentId}" is also disabled. Effective visibility will remain disabled while the parent is disabled.`,
          blocking: false
        });
      }
    }

    seenIds.set(sId, {
      id: sId,
      depth,
      parentId,
      required: isReq,
      toggleable: isReq ? false : isToggleable,
      defaultEnabled: isReq ? true : defEnabled
    });

    const childSubs = Array.isArray(rawSec.subsections)
      ? rawSec.subsections
      : (Array.isArray(rawSec.children) ? rawSec.children : null);

    if (rawSec.subsections !== undefined && !Array.isArray(rawSec.subsections)) {
      issues.push({
        code: 'INVALID_SUBSECTIONS_ARRAY',
        severity: 'error',
        section: sId,
        message: `Section "${sId}" property "subsections" must be an array.`,
        blocking: true
      });
    } else if (childSubs && childSubs.length > 0) {
      validateRawSectionsRecursive(childSubs, issues, seenIds, depth + 1, sId);
    }
  });
}

/**
 * Validates raw action declarations and populates `issues`
 */
function validateRawActionsList(rawActions, issues, seenSectionIdsMap, htmlContent = '', options = {}) {
  const seenActionIds = new Map();
  if (!Array.isArray(rawActions)) return seenActionIds;

  rawActions.forEach((rawAct, idx) => {
    if (!rawAct || typeof rawAct !== 'object' || Array.isArray(rawAct)) {
      issues.push({
        code: 'INVALID_ACTION_DECLARATION',
        severity: 'error',
        message: `Action declaration at index ${idx} must be a valid JSON object.`,
        blocking: true
      });
      return;
    }

    const aId = String(rawAct.id || rawAct.key || rawAct.actionId || '').trim();
    if (!aId) {
      issues.push({
        code: 'ACTION_ID_MISSING',
        severity: 'error',
        message: `Action declaration at index ${idx} is missing a required "id" property.`,
        blocking: true
      });
      return;
    }

    if (!isValidIdentifier(aId)) {
      issues.push({
        code: 'INVALID_ACTION_ID_FORMAT',
        severity: 'error',
        action: aId,
        message: `Action ID "${aId}" contains invalid characters. Use alphanumeric characters, hyphens, or underscores.`,
        blocking: true
      });
    }

    if (seenActionIds.has(aId)) {
      issues.push({
        code: 'DUPLICATE_ACTION_ID',
        severity: 'error',
        action: aId,
        message: `Duplicate action ID detected: "${aId}". Action IDs must be unique within a template.`,
        blocking: true
      });
    }

    const normAct = normalizeActionEntry(rawAct, idx);
    seenActionIds.set(aId, normAct);

    if (!UTP_SUPPORTED_ACTION_TYPES.has(normAct.type)) {
      issues.push({
        code: 'UNSUPPORTED_ACTION_TYPE',
        severity: 'error',
        action: aId,
        message: `Action "${aId}" specifies unsupported type "${normAct.type}". Supported types: ${Array.from(UTP_SUPPORTED_ACTION_TYPES).join(', ')}.`,
        blocking: true
      });
      return;
    }

    if (normAct.type !== 'none' && (!normAct.label || !normAct.label.trim())) {
      issues.push({
        code: 'ACTION_LABEL_MISSING',
        severity: 'error',
        action: aId,
        message: `Action "${aId}" is missing a valid default button "label".`,
        blocking: true
      });
    }

    if (rawAct.fallbackBehavior !== undefined && !UTP_ACTION_FALLBACK_BEHAVIORS.has(String(rawAct.fallbackBehavior).toLowerCase().trim())) {
      issues.push({
        code: 'INVALID_ACTION_FALLBACK',
        severity: 'error',
        action: aId,
        message: `Action "${aId}" specifies invalid fallbackBehavior "${rawAct.fallbackBehavior}". Allowed values: hide, disable, none.`,
        blocking: true
      });
    }

    if (normAct.sectionId && seenSectionIdsMap.size > 0 && !seenSectionIdsMap.has(normAct.sectionId)) {
      issues.push({
        code: 'UNKNOWN_SECTION_ID',
        severity: 'error',
        action: aId,
        section: normAct.sectionId,
        message: `Action "${aId}" references unknown parent section/subsection ID "${normAct.sectionId}".`,
        blocking: true
      });
    }

    if (normAct.logicalLink && !isValidLogicalLinkIdentifier(normAct.logicalLink)) {
      issues.push({
        code: 'UNKNOWN_LOGICAL_LINK_ID',
        severity: 'error',
        action: aId,
        logicalLink: normAct.logicalLink,
        message: `Action "${aId}" declares unknown UTP v1.3.0 logical link identifier "${normAct.logicalLink}".`,
        blocking: true
      });
    }

    // Validate destination/target by action type
    if (normAct.type === 'internal_url' || normAct.type === 'customizer' || normAct.type === 'external_url' || normAct.type === 'global_link' || normAct.type === 'template_link') {
      const targetToValidate = normAct.logicalLink || normAct.target;
      const destCheck = validateActionDestinationUrl(normAct.type, targetToValidate, {
        allowHttp: Boolean(options.allowHttpExternalUrls)
      });
      if (!destCheck.valid) {
        issues.push({
          code: normAct.type === 'external_url' ? 'UNSAFE_EXTERNAL_ACTION_URL' : 'INVALID_INTERNAL_ACTION_URL',
          severity: 'error',
          action: aId,
          target: normAct.target,
          message: `Action "${aId}": ${destCheck.reason}`,
          blocking: true
        });
      }
    } else if (normAct.type === 'section') {
      const targetSecId = String(normAct.target || '').replace(/^#/, '').trim();
      if (!targetSecId) {
        issues.push({
          code: 'ACTION_TARGET_SECTION_MISSING',
          severity: 'error',
          action: aId,
          message: `Action "${aId}" of type "section" must specify a target section or subsection ID.`,
          blocking: true
        });
      } else {
        const knownInManifest = seenSectionIdsMap.has(targetSecId);
        const knownInHtml = htmlContent
          ? (new RegExp(`data-wm-(?:section|subsection)\\s*=\\s*["']${targetSecId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(htmlContent) ||
             new RegExp(`\\bid\\s*=\\s*["']${targetSecId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(htmlContent))
          : false;
        if (!knownInManifest && !knownInHtml && (seenSectionIdsMap.size > 0 || htmlContent)) {
          issues.push({
            code: 'ACTION_TARGET_SECTION_NOT_FOUND',
            severity: 'error',
            action: aId,
            target: targetSecId,
            message: `Action "${aId}" targets section "${targetSecId}", which does not exist in wishmagic.json or index.html.`,
            blocking: true
          });
        } else if (knownInManifest) {
          const secMeta = seenSectionIdsMap.get(targetSecId);
          if (secMeta && secMeta.defaultEnabled === false) {
            issues.push({
              code: 'ACTION_TARGETS_DISABLED_SECTION',
              severity: normAct.required && normAct.fallbackBehavior === 'none' ? 'error' : 'warning',
              action: aId,
              target: targetSecId,
              message: `Action "${aId}" targets section "${targetSecId}" which is disabled by default. Runtime will apply fallbackBehavior="${normAct.fallbackBehavior}".`,
              blocking: Boolean(normAct.required && normAct.fallbackBehavior === 'none')
            });
          }
        }
      }
    } else if (normAct.type === 'modal') {
      const targetModalId = String(normAct.target || '').replace(/^#/, '').trim();
      if (!targetModalId) {
        issues.push({
          code: 'ACTION_TARGET_MODAL_MISSING',
          severity: 'error',
          action: aId,
          message: `Action "${aId}" of type "modal" must specify a target modal ID.`,
          blocking: true
        });
      } else if (htmlContent && !checkModalExistsInHtml(targetModalId, htmlContent)) {
        issues.push({
          code: 'ACTION_TARGET_MODAL_NOT_FOUND',
          severity: 'error',
          action: aId,
          target: targetModalId,
          message: `Action "${aId}" targets modal "${targetModalId}", which was not found in HTML (expected [data-wm-modal="${targetModalId}"] or id="${targetModalId}").`,
          blocking: true
        });
      }
    }

    if (htmlContent) {
      const actBind = checkActionBindingInCode(normAct, htmlContent);
      if (!actBind.bound) {
        issues.push({
          code: 'ACTION_BINDING_NOT_FOUND',
          severity: options.strictBindings ? 'error' : 'warning',
          action: aId,
          message: actBind.reason,
          blocking: Boolean(options.strictBindings)
        });
      }
    }
  });

  return seenActionIds;
}

/**
 * Validates admin-supplied visibility and action overrides (both template-wide and relationship-specific)
 * against a template's normalized manifest and HTML.
 * Used during Upload configuration and Edit Template configuration saves/publishes.
 */
export function validateAdminTemplateConfiguration({
  manifest = {},
  manifestSections = null,
  manifestActions = null,
  visibilityConfig = {},
  actionsConfig = {},
  variantOverrides = {},
  htmlContent = '',
  allowHttpExternalUrls = false
} = {}) {
  const issues = [];
  const effectiveRawManifest = {
    ...(manifest || {}),
    ...(Array.isArray(manifestSections) ? { sections: manifestSections } : {}),
    ...(Array.isArray(manifestActions) ? { actions: manifestActions } : {})
  };
  const norm = effectiveRawManifest && effectiveRawManifest.$schema === UTP_PROTOCOL_NAME
    ? effectiveRawManifest
    : normalizeManifestToUtp(effectiveRawManifest);
  const flatSections = flattenSectionsTree(norm.sections || []);
  const sectionMap = new Map();
  for (const s of flatSections) {
    sectionMap.set(s.id, s);
  }

  const actionMap = new Map();
  if (Array.isArray(norm.actions)) {
    for (const a of norm.actions) {
      actionMap.set(a.id, a);
    }
  }

  // Helper to validate a visibility map (either global or per-variant)
  const checkVisibilityMap = (visMap, scopeLabel = 'template', variantSlug = null) => {
    if (!visMap || typeof visMap !== 'object' || Array.isArray(visMap)) return;
    for (const [secId, enabledVal] of Object.entries(visMap)) {
      if (typeof enabledVal !== 'boolean') {
        issues.push({
          code: 'INVALID_SECTION_VISIBILITY_VALUE',
          severity: 'error',
          section: secId,
          variant: variantSlug,
          message: `Visibility value for "${secId}" in ${scopeLabel} must be a boolean (true or false).`,
          blocking: true
        });
        continue;
      }
      if (sectionMap.size > 0 && !sectionMap.has(secId)) {
        issues.push({
          code: 'UNKNOWN_SECTION_ID',
          severity: 'error',
          section: secId,
          variant: variantSlug,
          message: `Cannot configure visibility for unknown section or subsection ID "${secId}" in ${scopeLabel}.`,
          blocking: true
        });
        continue;
      }
      const secMeta = sectionMap.get(secId);
      if (secMeta && enabledVal === false) {
        if (secMeta.required) {
          issues.push({
            code: 'REQUIRED_SECTION_CANNOT_BE_DISABLED',
            severity: 'error',
            section: secId,
            variant: variantSlug,
            message: `Required section "${secMeta.label || secId}" (${secId}) cannot be disabled in ${scopeLabel}.`,
            blocking: true
          });
        } else if (secMeta.toggleable === false) {
          issues.push({
            code: 'NON_TOGGLEABLE_SECTION_CANNOT_BE_DISABLED',
            severity: 'error',
            section: secId,
            variant: variantSlug,
            message: `Non-toggleable section "${secMeta.label || secId}" (${secId}) cannot be disabled in ${scopeLabel}.`,
            blocking: true
          });
        }
      }
    }
  };

  // Helper to validate an actions override map or array
  const checkActionsConfig = (actConfig, isVariantScope = false, scopeLabel = 'template', variantSlug = null) => {
    if (!actConfig) return;
    const entries = Array.isArray(actConfig)
      ? actConfig.map(a => [a?.id || a?.key, a])
      : Object.entries(actConfig);

    for (const [rawId, override] of entries) {
      const actId = String(rawId || override?.id || '').trim();
      if (!actId || !override || typeof override !== 'object') continue;

      if (actionMap.size > 0 && !actionMap.has(actId)) {
        issues.push({
          code: isVariantScope ? 'UNKNOWN_VARIANT_ACTION_ID' : 'UNKNOWN_ACTION_ID',
          severity: 'error',
          action: actId,
          variant: variantSlug,
          message: `Unknown action ID "${actId}" in ${scopeLabel}.`,
          blocking: true
        });
        continue;
      }

      const baseAct = actionMap.get(actId) || normalizeActionEntry({ id: actId, ...override });

      if (baseAct.configurable === false) {
        const hasTypeChange = override.type !== undefined && override.type !== baseAct.type;
        const hasTargetChange = override.target !== undefined && override.target !== baseAct.target;
        if (hasTypeChange || hasTargetChange) {
          issues.push({
            code: 'ACTION_NOT_CONFIGURABLE',
            severity: 'error',
            action: actId,
            variant: variantSlug,
            message: `Action "${actId}" is marked configurable=false and its action type or destination cannot be modified.`,
            blocking: true
          });
        }
      }

      if (baseAct.editableLabel === false && override.label !== undefined && String(override.label).trim() !== baseAct.defaultLabel) {
        issues.push({
          code: 'ACTION_LABEL_NOT_EDITABLE',
          severity: 'error',
          action: actId,
          variant: variantSlug,
          message: `Action "${actId}" is marked editableLabel=false and its button label cannot be modified.`,
          blocking: true
        });
      }

      if (isVariantScope && baseAct.relationshipSpecific === false) {
        issues.push({
          code: 'ACTION_NOT_RELATIONSHIP_SPECIFIC',
          severity: 'error',
          action: actId,
          variant: variantSlug,
          message: `Action "${actId}" is marked relationshipSpecific=false and cannot be overridden per relationship variant.`,
          blocking: true
        });
      }

      if (baseAct.required && override.enabled === false) {
        issues.push({
          code: 'REQUIRED_ACTION_CANNOT_BE_DISABLED',
          severity: 'error',
          action: actId,
          variant: variantSlug,
          message: `Required action "${actId}" cannot be disabled.`,
          blocking: true
        });
      }

      const effectiveLabel = override.label !== undefined ? String(override.label).trim() : baseAct.label;
      let effectiveType = override.type !== undefined ? String(override.type).toLowerCase().trim() : baseAct.type;
      const rawOverrideTarget = override.target !== undefined ? String(override.target).trim() : undefined;
      const isCustomTargetProvided = Boolean(
        rawOverrideTarget &&
        !rawOverrideTarget.startsWith('global.') &&
        !rawOverrideTarget.startsWith('template.') &&
        (override.logicalLink === undefined || !override.logicalLink || rawOverrideTarget !== (baseAct.defaultTarget || baseAct.target))
      );
      const effectiveLogicalLink = isCustomTargetProvided
        ? ''
        : (override.logicalLink !== undefined ? String(override.logicalLink || '').trim() : (baseAct.logicalLink || ''));
      const effectiveTarget = rawOverrideTarget !== undefined
        ? rawOverrideTarget
        : (effectiveLogicalLink && UTP_SUPPORTED_LOGICAL_LINKS[effectiveLogicalLink] ? UTP_SUPPORTED_LOGICAL_LINKS[effectiveLogicalLink] : baseAct.target);
      if ((effectiveType === 'section' || effectiveType === 'modal') && rawOverrideTarget && (/^https?:\/\//i.test(rawOverrideTarget) || rawOverrideTarget.startsWith('/'))) {
        effectiveType = /^https?:\/\//i.test(rawOverrideTarget) ? 'external_url' : 'internal_url';
      }
      if (effectiveLogicalLink && !isValidLogicalLinkIdentifier(effectiveLogicalLink)) {
        issues.push({
          code: 'UNKNOWN_LOGICAL_LINK_ID',
          severity: 'error',
          action: actId,
          variant: variantSlug,
          logicalLink: effectiveLogicalLink,
          message: `Action "${actId}" in ${scopeLabel} specifies unknown logicalLink "${effectiveLogicalLink}".`,
          blocking: true
        });
      }

      if (!UTP_SUPPORTED_ACTION_TYPES.has(effectiveType)) {
        issues.push({
          code: 'UNSUPPORTED_ACTION_TYPE',
          severity: 'error',
          action: actId,
          variant: variantSlug,
          message: `Action "${actId}" in ${scopeLabel} specifies unsupported action type "${effectiveType}".`,
          blocking: true
        });
        continue;
      }

      if (effectiveType !== 'none' && !effectiveLabel) {
        issues.push({
          code: 'ACTION_LABEL_MISSING',
          severity: 'error',
          action: actId,
          variant: variantSlug,
          message: `Action "${actId}" in ${scopeLabel} cannot have an empty button label.`,
          blocking: true
        });
      }

      if (effectiveType === 'internal_url' || effectiveType === 'customizer' || effectiveType === 'external_url' || effectiveType === 'global_link' || effectiveType === 'template_link') {
        const urlCheck = validateActionDestinationUrl(effectiveType, effectiveTarget, { allowHttp: allowHttpExternalUrls, allowCustomAdminTarget: true });
        if (!urlCheck.valid) {
          issues.push({
            code: effectiveType === 'external_url' ? 'UNSAFE_EXTERNAL_ACTION_URL' : 'INVALID_INTERNAL_ACTION_URL',
            severity: 'error',
            action: actId,
            variant: variantSlug,
            target: effectiveTarget,
            message: `Action "${actId}" in ${scopeLabel}: ${urlCheck.reason}`,
            blocking: true
          });
        }
      } else if (effectiveType === 'section') {
        const cleanSec = String(effectiveTarget || '').replace(/^#/, '').trim();
        if (!cleanSec) {
          issues.push({
            code: 'ACTION_TARGET_SECTION_MISSING',
            severity: 'error',
            action: actId,
            variant: variantSlug,
            message: `Action "${actId}" in ${scopeLabel} of type "section" requires a target section ID.`,
            blocking: true
          });
        } else if (sectionMap.size > 0 && !sectionMap.has(cleanSec)) {
          issues.push({
            code: 'ACTION_TARGET_SECTION_NOT_FOUND',
            severity: 'error',
            action: actId,
            variant: variantSlug,
            target: cleanSec,
            message: `Action "${actId}" in ${scopeLabel} targets nonexistent section "${cleanSec}".`,
            blocking: true
          });
        }
      } else if (effectiveType === 'modal') {
        const cleanModal = String(effectiveTarget || '').replace(/^#/, '').trim();
        if (!cleanModal) {
          issues.push({
            code: 'ACTION_TARGET_MODAL_MISSING',
            severity: 'error',
            action: actId,
            variant: variantSlug,
            message: `Action "${actId}" in ${scopeLabel} of type "modal" requires a target modal ID.`,
            blocking: true
          });
        } else if (htmlContent && !checkModalExistsInHtml(cleanModal, htmlContent)) {
          issues.push({
            code: 'ACTION_TARGET_MODAL_NOT_FOUND',
            severity: 'error',
            action: actId,
            variant: variantSlug,
            target: cleanModal,
            message: `Action "${actId}" in ${scopeLabel} targets modal "${cleanModal}" which does not exist in the template HTML.`,
            blocking: true
          });
        }
      }
    }
  };

  checkVisibilityMap(visibilityConfig, 'template-wide configuration', null);
  checkActionsConfig(actionsConfig, false, 'template-wide configuration', null);

  if (variantOverrides && typeof variantOverrides === 'object') {
    for (const [varKey, varCfg] of Object.entries(variantOverrides)) {
      if (!varCfg || typeof varCfg !== 'object') continue;
      const varVisMap = varCfg.visibility || varCfg.visibilityOverrides;
      if (varVisMap) {
        checkVisibilityMap(varVisMap, `relationship "${varKey}"`, varKey);
      }
      if (varCfg.actions) {
        checkActionsConfig(varCfg.actions, true, `relationship "${varKey}"`, varKey);
      }
    }
  }

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  return {
    valid: errors.length === 0,
    publishable: !errors.some(e => e.blocking !== false),
    issues,
    errors,
    warnings
  };
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
      message: `Invalid schemaVersion "${rawManifest.schemaVersion}". Must follow semantic versioning (e.g., "1.0.0", "1.1.0", "1.2.0", or "1.3.0").`,
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
    } else if (Number(minorStr) > 3 && !UTP_SUPPORTED_SCHEMA_VERSIONS.includes(cleanVer)) {
      issues.push({
        code: 'UNSUPPORTED_SCHEMA_VERSION',
        severity: 'error',
        message: `Unsupported schemaVersion "${rawManifest.schemaVersion}". Supported UTP versions are: ${UTP_SUPPORTED_SCHEMA_VERSIONS.join(', ')}.`,
        blocking: true
      });
    }
  }

  const minRuntimeApi = rawManifest.compatibility?.minimumRuntimeApi || rawManifest.compatibility?.runtimeApi;
  if (minRuntimeApi && parseFloat(String(minRuntimeApi)) > parseFloat(UTP_LATEST_RUNTIME_API_VERSION || UTP_RUNTIME_API_VERSION)) {
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

  // Discover HTML sections, subsections, actions, and field/action container mappings
  const htmlDiscovery = extractHtmlDeclaredSectionsAndActions(htmlContent);

  // 4. Sections & Subsections Validation (run before fields/actions so field/action section references can be verified)
  const rawSectionsProp = rawManifest.sections !== undefined
    ? rawManifest.sections
    : (rawManifest.template && rawManifest.template.sections !== undefined ? rawManifest.template.sections : undefined);

  const seenSectionIdsMap = new Map();
  if (rawSectionsProp !== undefined && !Array.isArray(rawSectionsProp)) {
    issues.push({
      code: 'INVALID_SECTIONS_DECLARATION',
      severity: 'error',
      message: '"sections" property in wishmagic.json must be an array.',
      blocking: true
    });
  } else if (Array.isArray(rawSectionsProp)) {
    validateRawSectionsRecursive(rawSectionsProp, issues, seenSectionIdsMap, 1, null);
  }

  // Enrich normalized sections with HTML-discovered field/action memberships and check HTML bindings
  const flatSections = flattenSectionsTree(norm.sections || []);
  for (const secNode of flatSections) {
    const sId = secNode.id;
    if (!sId) continue;
    if (htmlContent) {
      const escSec = sId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const secRegex = new RegExp(`data-wm-(?:section|subsection)\\s*=\\s*["']${escSec}["']`, 'i');
      const idRegex = new RegExp(`\\bid\\s*=\\s*["']${escSec}["']`, 'i');
      if (!secRegex.test(htmlContent) && !idRegex.test(htmlContent)) {
        const isBlockingSubBind = Boolean(options.strictBindings || secNode.depth > 1);
        issues.push({
          code: secNode.depth > 1 ? 'MISSING_HTML_SUBSECTION_BINDING' : 'SECTION_BINDING_NOT_FOUND',
          severity: isBlockingSubBind ? 'error' : 'warning',
          section: sId,
          message: `Declared ${secNode.depth > 1 ? 'subsection' : 'section'} "${sId}" in wishmagic.json has no matching [data-wm-${secNode.depth > 1 ? 'subsection' : 'section'}="${sId}"] element in index.html.`,
          blocking: isBlockingSubBind
        });
      }
    }
  }

  // Detect undeclared HTML sections and subsections
  const suggestedSections = [];
  const hasExplicitManifestSections = Array.isArray(rawSectionsProp) && rawSectionsProp.length > 0;
  for (const hSec of htmlDiscovery.sections) {
    if (!seenSectionIdsMap.has(hSec.id)) {
      suggestedSections.push(hSec);
      if (hasExplicitManifestSections) {
        issues.push({
          code: 'UNDECLARED_HTML_SECTION',
          severity: options.strictSections ? 'error' : 'warning',
          section: hSec.id,
          message: `HTML section [data-wm-section="${hSec.id}"] was found in index.html but is not declared in wishmagic.json.`,
          blocking: Boolean(options.strictSections)
        });
      }
    }
  }
  for (const hSub of htmlDiscovery.subsections) {
    if (!seenSectionIdsMap.has(hSub.id)) {
      suggestedSections.push(hSub);
      if (hasExplicitManifestSections) {
        issues.push({
          code: 'UNDECLARED_HTML_SUBSECTION',
          severity: options.strictSections ? 'error' : 'warning',
          section: hSub.id,
          message: `HTML subsection [data-wm-subsection="${hSub.id}"] was found in index.html but is not declared in wishmagic.json.`,
          blocking: Boolean(options.strictSections)
        });
      }
    }
  }

  // Map sections to fields from manifest `section.fields`
  const sectionFieldOwnerMap = {};
  for (const secNode of flatSections) {
    if (Array.isArray(secNode.fields)) {
      for (const fId of secNode.fields) {
        sectionFieldOwnerMap[fId] = secNode.id;
      }
    }
  }

  // 5. Fields Validation, Uniqueness & HTML/CSS Binding Verification
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

    // Verify explicit sectionId / subsectionId declared on field in manifest first
    if (field.sectionId && seenSectionIdsMap.size > 0 && !seenSectionIdsMap.has(field.sectionId)) {
      issues.push({
        code: 'UNKNOWN_SECTION_ID',
        severity: 'error',
        field: fId,
        section: field.sectionId,
        message: `Field "${fId}" references unknown section ID "${field.sectionId}".`,
        blocking: true
      });
    }
    if (field.subsectionId && seenSectionIdsMap.size > 0 && !seenSectionIdsMap.has(field.subsectionId)) {
      issues.push({
        code: 'UNKNOWN_SUBSECTION_ID',
        severity: 'error',
        field: fId,
        section: field.subsectionId,
        message: `Field "${fId}" references unknown subsection ID "${field.subsectionId}".`,
        blocking: true
      });
    }

    // Attach discovered or declared container section/subsection
    if (!field.sectionId && !field.subsectionId) {
      if (sectionFieldOwnerMap[fId]) {
        const ownerMeta = seenSectionIdsMap.get(sectionFieldOwnerMap[fId]);
        if (ownerMeta && ownerMeta.depth > 1) {
          field.subsectionId = sectionFieldOwnerMap[fId];
          field.sectionId = ownerMeta.parentId || sectionFieldOwnerMap[fId];
        } else {
          field.sectionId = sectionFieldOwnerMap[fId];
        }
      } else if (htmlDiscovery.fieldToContainerMap[fId]) {
        const htmlSecId = htmlDiscovery.fieldToContainerMap[fId].sectionId || null;
        const htmlSubId = htmlDiscovery.fieldToContainerMap[fId].subsectionId || null;
        if (htmlSecId && (seenSectionIdsMap.size === 0 || seenSectionIdsMap.has(htmlSecId))) {
          field.sectionId = htmlSecId;
        }
        if (htmlSubId && (seenSectionIdsMap.size === 0 || seenSectionIdsMap.has(htmlSubId))) {
          field.subsectionId = htmlSubId;
        }
      }
    }

    // Warn if a required field is inside a default-disabled section/subsection
    const targetContainerId = field.subsectionId || field.sectionId;
    if (targetContainerId && seenSectionIdsMap.has(targetContainerId)) {
      const containerMeta = seenSectionIdsMap.get(targetContainerId);
      if (containerMeta && containerMeta.defaultEnabled === false && field.required) {
        issues.push({
          code: 'REQUIRED_FIELD_IN_DISABLED_SECTION',
          severity: 'warning',
          field: fId,
          section: targetContainerId,
          message: `Required field "${fId}" belongs to section/subsection "${targetContainerId}" which has defaultEnabled=false. It will be automatically excluded when the section is disabled.`,
          blocking: false
        });
      }
    }

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

  // Verify section.fields references point to real declared or HTML fields
  for (const secNode of flatSections) {
    if (Array.isArray(secNode.fields)) {
      for (const fRef of secNode.fields) {
        if (!seenFieldIds.has(fRef) && !htmlDiscovery.fieldToContainerMap[fRef]) {
          issues.push({
            code: 'SECTION_REFERENCES_UNKNOWN_FIELD',
            severity: 'warning',
            section: secNode.id,
            field: fRef,
            message: `Section "${secNode.id}" lists field "${fRef}" in its fields array, which is not declared in top-level "fields".`,
            blocking: false
          });
        }
      }
    }
  }

  // 5b. Detect HTML fields that are NOT declared in wishmagic.json -> surface as suggestedFields
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
      if (htmlDiscovery.fieldToContainerMap[hf.id]) {
        hf.sectionId = htmlDiscovery.fieldToContainerMap[hf.id].sectionId || null;
        hf.subsectionId = htmlDiscovery.fieldToContainerMap[hf.id].subsectionId || null;
      }
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

  // 5c. Actions / Buttons Validation & HTML Discovery
  const rawActionsProp = rawManifest.actions !== undefined
    ? rawManifest.actions
    : (rawManifest.template && rawManifest.template.actions !== undefined
      ? rawManifest.template.actions
      : rawManifest.buttons);

  let seenActionIdsMap = new Map();
  if (rawActionsProp !== undefined && !Array.isArray(rawActionsProp)) {
    issues.push({
      code: 'INVALID_ACTIONS_DECLARATION',
      severity: 'error',
      message: '"actions" property in wishmagic.json must be an array of action objects.',
      blocking: true
    });
  } else if (Array.isArray(rawActionsProp)) {
    seenActionIdsMap = validateRawActionsList(rawActionsProp, issues, seenSectionIdsMap, htmlContent, options);
  }

  // Attach HTML-discovered container sectionId to normalized actions if not explicitly declared
  if (Array.isArray(norm.actions)) {
    for (const act of norm.actions) {
      if (!act.sectionId && htmlDiscovery.actionToContainerMap[act.id]) {
        act.sectionId = htmlDiscovery.actionToContainerMap[act.id].containerId || null;
      }
    }
  }

  const suggestedActions = [];
  const hasExplicitManifestActions = Array.isArray(rawActionsProp) && rawActionsProp.length > 0;
  for (const hAct of htmlDiscovery.actions) {
    if (!seenActionIdsMap.has(hAct.id)) {
      suggestedActions.push(hAct);
      if (hasExplicitManifestActions) {
        issues.push({
          code: 'UNDECLARED_HTML_ACTION',
          severity: options.strictActions ? 'error' : 'warning',
          action: hAct.id,
          message: `HTML action element [data-wm-action="${hAct.id}"] was found in index.html but is not declared in wishmagic.json.`,
          blocking: Boolean(options.strictActions)
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

  // 6b. UTP v1.1.0 / v1.2.0 Multi-Variant Family Declaration Validation
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

          if (variantHtmlContent && vf.disabled !== true) {
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

      // Check variant-specific section/subsection visibility overrides (UTP v1.2.0)
      if (rawVar.visibility && typeof rawVar.visibility === 'object' && !Array.isArray(rawVar.visibility)) {
        for (const [secKey, visVal] of Object.entries(rawVar.visibility)) {
          if (typeof visVal !== 'boolean') {
            varIssues.push({
              code: 'INVALID_SECTION_VISIBILITY_VALUE',
              severity: 'error',
              variant: normVar.id,
              section: secKey,
              message: `Variant "${normVar.id}" visibility override for "${secKey}" must be a boolean (true or false).`,
              blocking: true
            });
          } else if (seenSectionIdsMap.size > 0 && !seenSectionIdsMap.has(secKey)) {
            varIssues.push({
              code: 'UNKNOWN_VARIANT_SECTION_ID',
              severity: 'error',
              variant: normVar.id,
              section: secKey,
              message: `Variant "${normVar.id}" visibility override references unknown section/subsection ID "${secKey}".`,
              blocking: true
            });
          } else if (visVal === false && seenSectionIdsMap.has(secKey)) {
            const secMeta = seenSectionIdsMap.get(secKey);
            if (secMeta.required) {
              varIssues.push({
                code: 'REQUIRED_SECTION_CANNOT_BE_DISABLED',
                severity: 'error',
                variant: normVar.id,
                section: secKey,
                message: `Variant "${normVar.id}" cannot disable required section/subsection "${secKey}".`,
                blocking: true
              });
            } else if (secMeta.toggleable === false) {
              varIssues.push({
                code: 'NON_TOGGLEABLE_SECTION_CANNOT_BE_DISABLED',
                severity: 'error',
                variant: normVar.id,
                section: secKey,
                message: `Variant "${normVar.id}" cannot disable non-toggleable section/subsection "${secKey}".`,
                blocking: true
              });
            }
          }
        }
      }

      if (Array.isArray(rawVar.sections)) {
        for (const vs of rawVar.sections) {
          if (!vs || typeof vs !== 'object') continue;
          const vsId = String(vs.id || vs.key || '').trim();
          if (!vsId) continue;
          if (seenSectionIdsMap.size > 0 && !seenSectionIdsMap.has(vsId)) {
            varIssues.push({
              code: 'UNKNOWN_VARIANT_SECTION_ID',
              severity: 'error',
              variant: normVar.id,
              section: vsId,
              message: `Variant "${normVar.id}" sections override references unknown section/subsection ID "${vsId}".`,
              blocking: true
            });
          } else if ((vs.enabled === false || vs.defaultEnabled === false || vs.disabled === true) && seenSectionIdsMap.has(vsId)) {
            const secMeta = seenSectionIdsMap.get(vsId);
            if (secMeta.required) {
              varIssues.push({
                code: 'REQUIRED_SECTION_CANNOT_BE_DISABLED',
                severity: 'error',
                variant: normVar.id,
                section: vsId,
                message: `Variant "${normVar.id}" cannot disable required section/subsection "${vsId}".`,
                blocking: true
              });
            } else if (secMeta.toggleable === false) {
              varIssues.push({
                code: 'NON_TOGGLEABLE_SECTION_CANNOT_BE_DISABLED',
                severity: 'error',
                variant: normVar.id,
                section: vsId,
                message: `Variant "${normVar.id}" cannot disable non-toggleable section/subsection "${vsId}".`,
                blocking: true
              });
            }
          }
        }
      }

      // Check variant-specific action overrides (UTP v1.2.0)
      if (Array.isArray(normVar.actions) && normVar.actions.length > 0) {
        const seenVarActIds = new Set();
        for (const va of normVar.actions) {
          if (seenVarActIds.has(va.id)) {
            varIssues.push({
              code: 'DUPLICATE_VARIANT_ACTION_ID',
              severity: 'error',
              variant: normVar.id,
              action: va.id,
              message: `Variant "${normVar.id}" declares duplicate action override for "${va.id}".`,
              blocking: true
            });
          }
          seenVarActIds.add(va.id);

          const baseAct = seenActionIdsMap.get(va.id);
          if (seenActionIdsMap.size > 0 && !baseAct) {
            varIssues.push({
              code: 'UNKNOWN_VARIANT_ACTION_ID',
              severity: 'error',
              variant: normVar.id,
              action: va.id,
              message: `Variant "${normVar.id}" overrides unknown action ID "${va.id}" not declared in template "actions".`,
              blocking: true
            });
            continue;
          }

          if (baseAct) {
            if (baseAct.relationshipSpecific === false) {
              varIssues.push({
                code: 'ACTION_NOT_RELATIONSHIP_SPECIFIC',
                severity: 'error',
                variant: normVar.id,
                action: va.id,
                message: `Variant "${normVar.id}" cannot override action "${va.id}" because relationshipSpecific=false.`,
                blocking: true
              });
            }
            if (baseAct.editableLabel === false && va.label !== undefined && va.label !== baseAct.defaultLabel) {
              varIssues.push({
                code: 'ACTION_LABEL_NOT_EDITABLE',
                severity: 'error',
                variant: normVar.id,
                action: va.id,
                message: `Variant "${normVar.id}" cannot change label for action "${va.id}" because editableLabel=false.`,
                blocking: true
              });
            }
            if (baseAct.configurable === false && ((va.type !== undefined && va.type !== baseAct.type) || (va.target !== undefined && va.target !== baseAct.target))) {
              varIssues.push({
                code: 'ACTION_NOT_CONFIGURABLE',
                severity: 'error',
                variant: normVar.id,
                action: va.id,
                message: `Variant "${normVar.id}" cannot change type or destination for action "${va.id}" because configurable=false.`,
                blocking: true
              });
            }
          }

          const effType = va.type || baseAct?.type || 'section';
          const effTarget = va.target !== undefined ? va.target : (baseAct?.target || '');
          if (!UTP_SUPPORTED_ACTION_TYPES.has(effType)) {
            varIssues.push({
              code: 'UNSUPPORTED_ACTION_TYPE',
              severity: 'error',
              variant: normVar.id,
              action: va.id,
              message: `Variant "${normVar.id}" action "${va.id}" specifies unsupported action type "${effType}".`,
              blocking: true
            });
          } else if (effType === 'internal_url' || effType === 'customizer' || effType === 'external_url') {
            const urlCheck = validateActionDestinationUrl(effType, effTarget, { allowHttp: Boolean(options.allowHttpExternalUrls) });
            if (!urlCheck.valid) {
              varIssues.push({
                code: effType === 'external_url' ? 'UNSAFE_EXTERNAL_ACTION_URL' : 'INVALID_INTERNAL_ACTION_URL',
                severity: 'error',
                variant: normVar.id,
                action: va.id,
                target: effTarget,
                message: `Variant "${normVar.id}" action "${va.id}": ${urlCheck.reason}`,
                blocking: true
              });
            }
          } else if (effType === 'section') {
            const cleanSec = String(effTarget || '').replace(/^#/, '').trim();
            if (!cleanSec || (seenSectionIdsMap.size > 0 && !seenSectionIdsMap.has(cleanSec))) {
              varIssues.push({
                code: 'ACTION_TARGET_SECTION_NOT_FOUND',
                severity: 'error',
                variant: normVar.id,
                action: va.id,
                target: cleanSec,
                message: `Variant "${normVar.id}" action "${va.id}" targets nonexistent section "${cleanSec}".`,
                blocking: true
              });
            }
          } else if (effType === 'modal') {
            const cleanMod = String(effTarget || '').replace(/^#/, '').trim();
            if (!cleanMod || (variantHtmlContent && !checkModalExistsInHtml(cleanMod, variantHtmlContent))) {
              varIssues.push({
                code: 'ACTION_TARGET_MODAL_NOT_FOUND',
                severity: 'error',
                variant: normVar.id,
                action: va.id,
                target: cleanMod,
                message: `Variant "${normVar.id}" action "${va.id}" targets nonexistent modal "${cleanMod}".`,
                blocking: true
              });
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
    confirmedSections: norm.sections || [],
    flatSections,
    suggestedSections,
    confirmedActions: norm.actions || [],
    suggestedActions,
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
  const confirmedSections = Array.isArray(extra.confirmedSections) ? extra.confirmedSections : (Array.isArray(normalized?.sections) ? normalized.sections : []);
  const flatSections = Array.isArray(extra.flatSections) ? extra.flatSections : flattenSectionsTree(confirmedSections);
  const suggestedSections = Array.isArray(extra.suggestedSections) ? extra.suggestedSections : [];
  const confirmedActions = Array.isArray(extra.confirmedActions) ? extra.confirmedActions : (Array.isArray(normalized?.actions) ? normalized.actions : []);
  const suggestedActions = Array.isArray(extra.suggestedActions) ? extra.suggestedActions : [];
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
      passedChecks: Math.max(0, 18 - errorsCount),
      fieldsCount: confirmedFields.length,
      boundFieldsCount: boundFields.length,
      unboundFieldsCount: unboundFields.length,
      suggestedFieldsCount: suggestedFields.length,
      sectionsCount: confirmedSections.length,
      totalSectionNodesCount: flatSections.length,
      suggestedSectionsCount: suggestedSections.length,
      actionsCount: confirmedActions.length,
      suggestedActionsCount: suggestedActions.length,
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
    confirmedSections,
    flatSections,
    suggestedSections,
    confirmedActions,
    suggestedActions,
    issues,
    errors: issues.filter(i => i.severity === 'error'),
    warnings: issues.filter(i => i.severity === 'warning'),
    normalized,
    normalizedManifest: normalized
  };
}
