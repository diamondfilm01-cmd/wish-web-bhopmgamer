/**
 * Universal Template Protocol (UTP v1.0) — Authoritative Server & Client Validator
 * --------------------------------------------------------------------------------
 * Validates template manifests (`wishmagic.json`), HTML/CSS/JS bindings,
 * field schemas, section definitions, relationship declarations, capability
 * requests, and package asset integrity against the canonical UTP specification.
 */

import {
  UTP_PROTOCOL_NAME,
  UTP_SCHEMA_VERSION,
  UTP_RUNTIME_API_VERSION,
  UTP_SUPPORTED_FIELD_TYPES,
  UTP_SUPPORTED_BINDING_TARGETS,
  UTP_CANONICAL_RELATIONSHIPS,
  UTP_CAPABILITY_REGISTRY,
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
  'apology',
  'sorry',
  'festival',
  'graduation',
  'baby_shower',
  'farewell',
  'mothers_day',
  'fathers_day',
  'valentines',
  'christmas',
  'new_year',
  'celebration',
  'general',
  'custom'
]);

const UTP_TIERS = new Set(['free', 'vip', 'premium']);

/**
 * Normalizes a raw or legacy manifest into the canonical UTP v1.0.0 schema object.
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

  const normalizedFields = rawFields.map(f => {
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
  });

  const rawSections = Array.isArray(raw.sections)
    ? raw.sections
    : (Array.isArray(tObj.sections) ? tObj.sections : []);

  const normalizedSections = rawSections.map((s, idx) => {
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
  });

  const entry = String(tObj.entry || raw.entry || raw.files?.entry || 'index.html').trim();

  return {
    $schema: UTP_PROTOCOL_NAME,
    protocol: UTP_PROTOCOL_NAME,
    schemaVersion: String(raw.schemaVersion || UTP_SCHEMA_VERSION).trim(),
    template: {
      id: String(tObj.id || tObj.templateId || tObj.slug || '').trim(),
      name: String(tObj.name || tObj.title || '').trim(),
      description: String(tObj.description || raw.description || '').trim(),
      templateVersion: String(tObj.templateVersion || tObj.version || raw.version || '1.0.0').trim(),
      category: String(tObj.category || raw.category || 'celebration').toLowerCase().trim(),
      tier: String(tObj.tier || raw.tier || 'free').toLowerCase().trim(),
      price: Number(tObj.price ?? raw.price ?? 0),
      author: tObj.author || raw.author || 'WishMagic',
      entry
    },
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
    relationships: Array.isArray(raw.relationships) ? raw.relationships : (Array.isArray(tObj.relationships) ? tObj.relationships : []),
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
  const entry = filesMap.get(relPath) || filesMap.get(relPath.replace(/^\.\//, ''));
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
  const filesMap = options.filesMap instanceof Map ? options.filesMap : new Map();

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
      message: `Invalid schemaVersion "${rawManifest.schemaVersion}". Must follow semantic versioning (e.g., "1.0.0").`,
      blocking: true
    });
  }

  if (rawManifest.schemaVersion && String(rawManifest.schemaVersion).replace(/^v/, '').split('.')[0] !== '1') {
    issues.push({
      code: 'INCOMPATIBLE_SCHEMA_MAJOR_VERSION',
      severity: 'error',
      message: `Schema major version "${rawManifest.schemaVersion}" is not compatible with UTP validator v${UTP_SCHEMA_VERSION}.`,
      blocking: true
    });
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
  if (
    declaredEntry.startsWith('/') ||
    declaredEntry.includes('..') ||
    /^[a-zA-Z]:/.test(declaredEntry)
  ) {
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

    // Validate binding if declared
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

    // Constraints validation
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

    // Check default media asset path existence when filesMap is provided
    if (filesMap.size > 0 && ['image', 'audio', 'video'].includes(fType) && typeof field.defaultValue === 'string' && field.defaultValue.trim()) {
      const defPath = field.defaultValue.trim();
      if (!defPath.startsWith('http://') && !defPath.startsWith('https://') && !defPath.startsWith('data:') && !defPath.startsWith('/assets/')) {
        if (/^[a-zA-Z]:\\/.test(defPath) || defPath.startsWith('file://') || defPath.includes('../')) {
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
          if (!filesMap.has(cleanDef) && !filesMap.has(`./${cleanDef}`)) {
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

    // Check 3-way agreement: Manifest Field <-> HTML/CSS Binding
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
  if (htmlContent) {
    const htmlFields = extractHtmlDeclaredFields(htmlContent);
    for (const hf of htmlFields) {
      if (!seenFieldIds.has(hf.id)) {
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
      if (clean && !filesMap.has(clean)) {
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
      if (clean && !filesMap.has(clean)) {
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
        if (!filesMap.has(clean) && !filesMap.has(`./${clean}`)) {
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

        if (/^[a-zA-Z]:\\/.test(rawRef) || rawRef.startsWith('file://') || rawRef.includes('../')) {
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
        if (cleanRef && !filesMap.has(cleanRef)) {
          let foundCaseInsensitive = false;
          for (const k of filesMap.keys()) {
            if (k.toLowerCase() === cleanRef.toLowerCase()) {
              foundCaseInsensitive = true;
              break;
            }
          }
          if (!foundCaseInsensitive) {
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
  }

  const hasBlockingErrors = issues.some(i => i.severity === 'error' && i.blocking !== false);
  const isValid = issues.filter(i => i.severity === 'error').length === 0;
  const isPublishable = !hasBlockingErrors;

  return buildReport(isValid, issues, norm, isPublishable, {
    confirmedFields: fields,
    suggestedFields,
    boundFields,
    unboundFields
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
      capabilitiesCount: Array.isArray(normalized?.capabilities) ? normalized.capabilities.length : 0
    },
    confirmedFields,
    suggestedFields,
    boundFields,
    unboundFields,
    issues,
    normalized
  };
}
