/**
 * WishMagic Universal Template Protocol (UTP) Validator & Normalizer
 * Server-authoritative validation for manifests, bindings, capabilities, assets, and runtime compatibility.
 */

import {
  UTP_PROTOCOL_NAME,
  UTP_SCHEMA_VERSION,
  UTP_RUNTIME_API_VERSION,
  UTP_SUPPORTED_FIELD_TYPES,
  UTP_SUPPORTED_BINDING_TARGETS,
  UTP_CAPABILITY_REGISTRY,
  UTP_CANONICAL_RELATIONSHIPS,
  isValidSemver,
  isValidIdentifier
} from './template-protocol-schema.js';

export class UtpValidationError extends Error {
  constructor(issues = []) {
    super(`Universal Template Protocol Validation Failed with ${issues.length} issue(s)`);
    this.name = 'UtpValidationError';
    this.issues = issues;
    this.code = 'UTP_VALIDATION_FAILED';
  }
}

/**
 * Normalizes legacy v1.0 manifests to canonical UTP structure
 */
export function normalizeManifestToUtp(rawJson) {
  if (!rawJson || typeof rawJson !== 'object') {
    return null;
  }

  // If already canonical UTP manifest
  if (rawJson.protocol === UTP_PROTOCOL_NAME || rawJson.schemaVersion) {
    return {
      protocol: UTP_PROTOCOL_NAME,
      schemaVersion: rawJson.schemaVersion || UTP_SCHEMA_VERSION,
      template: {
        id: rawJson.template?.id || rawJson.id || '',
        name: rawJson.template?.name || rawJson.template?.title || rawJson.title || rawJson.name || '',
        description: rawJson.template?.description || rawJson.description || '',
        templateVersion: rawJson.template?.templateVersion || rawJson.template?.version || rawJson.version || '1.0.0',
        category: rawJson.template?.category || rawJson.category || 'celebration',
        tier: rawJson.template?.tier || rawJson.tier || 'free',
        price: Number(rawJson.template?.price ?? rawJson.price ?? 0),
        entry: rawJson.template?.entry || rawJson.entryFile || rawJson.entry || 'index.html',
        author: rawJson.template?.author || rawJson.author || 'WishMagic Creator'
      },
      compatibility: {
        runtimeApi: rawJson.compatibility?.runtimeApi || rawJson.runtimeApi || UTP_RUNTIME_API_VERSION,
        minimumRuntimeApi: rawJson.compatibility?.minimumRuntimeApi || '1.0',
        maximumRuntimeApi: rawJson.compatibility?.maximumRuntimeApi || null
      },
      files: {
        styles: Array.isArray(rawJson.files?.styles) ? rawJson.files.styles : [],
        scripts: Array.isArray(rawJson.files?.scripts) ? rawJson.files.scripts : []
      },
      fields: Array.isArray(rawJson.fields) ? rawJson.fields : [],
      sections: Array.isArray(rawJson.sections) ? rawJson.sections : [],
      relationships: Array.isArray(rawJson.relationships) ? rawJson.relationships : [],
      capabilities: Array.isArray(rawJson.capabilities) ? rawJson.capabilities : (
        rawJson.capabilities && typeof rawJson.capabilities === 'object'
          ? Object.keys(rawJson.capabilities).filter(k => Boolean(rawJson.capabilities[k]))
          : []
      ),
      assets: Array.isArray(rawJson.assets) ? rawJson.assets : [],
      theme: rawJson.theme || {},
      raw: rawJson
    };
  }

  // Legacy format adaptation (e.g. { protocol: "1.0", type: "wish-template", template: { ... }, capabilities: { ... } })
  const tObj = (typeof rawJson.template === 'object' && rawJson.template) ? rawJson.template : rawJson;
  const legacyCaps = rawJson.capabilities || tObj.capabilities || {};
  const activeCaps = [];
  if (typeof legacyCaps === 'object') {
    for (const [k, v] of Object.entries(legacyCaps)) {
      if (Boolean(v)) activeCaps.push(k);
    }
  }

  return {
    protocol: UTP_PROTOCOL_NAME,
    schemaVersion: UTP_SCHEMA_VERSION,
    legacyProtocol: rawJson.protocol || '1.0',
    template: {
      id: tObj.id || rawJson.id || '',
      name: tObj.title || tObj.name || rawJson.title || rawJson.name || 'Wish Template',
      description: tObj.description || rawJson.description || '',
      templateVersion: tObj.version || rawJson.version || '1.0.0',
      category: tObj.category || rawJson.category || 'celebration',
      tier: tObj.tier || rawJson.tier || 'free',
      price: Number(tObj.price ?? rawJson.price ?? 0),
      entry: tObj.entry || rawJson.entryFile || 'index.html',
      author: tObj.author || rawJson.author || 'WishMagic'
    },
    compatibility: {
      runtimeApi: '1.0',
      minimumRuntimeApi: '1.0',
      maximumRuntimeApi: null
    },
    files: {
      styles: [],
      scripts: []
    },
    fields: Array.isArray(rawJson.fields) ? rawJson.fields : (Array.isArray(tObj.fields) ? tObj.fields : []),
    sections: Array.isArray(rawJson.sections) ? rawJson.sections : (Array.isArray(tObj.sections) ? tObj.sections : []),
    relationships: Array.isArray(rawJson.relationships) ? rawJson.relationships : [],
    capabilities: activeCaps,
    assets: [],
    theme: rawJson.theme || {},
    raw: rawJson
  };
}

/**
 * Validates manifest against the Universal Template Protocol specification
 * 
 * @param {Object} manifest - Normalized or raw manifest object
 * @param {Object} options - Context: { filesMap, entryFile, detectedFields }
 * @returns {Object} Structured report { valid, publishable, summary, issues, normalized }
 */
export function validateUtpManifest(manifest, options = {}) {
  const issues = [];
  const filesMap = options.filesMap || new Map();
  const entryFile = options.entryFile || 'index.html';

  if (!manifest || typeof manifest !== 'object') {
    issues.push({
      code: 'MANIFEST_EMPTY_OR_INVALID',
      severity: 'error',
      message: 'Manifest payload must be a non-empty JSON object.',
      blocking: true
    });
    return buildReport(false, issues, null);
  }

  const norm = normalizeManifestToUtp(manifest);

  // 1. Template Identity & Metadata
  if (!norm.template.id) {
    issues.push({
      code: 'MISSING_TEMPLATE_ID',
      severity: 'error',
      message: 'Template manifest requires a non-empty template.id string.',
      blocking: true
    });
  } else if (!isValidIdentifier(norm.template.id)) {
    issues.push({
      code: 'INVALID_TEMPLATE_ID',
      severity: 'error',
      message: `Template ID "${norm.template.id}" contains invalid characters. Use alphanumeric, hyphens, and underscores.`,
      blocking: true
    });
  }

  if (!norm.template.name || typeof norm.template.name !== 'string' || !norm.template.name.trim()) {
    issues.push({
      code: 'MISSING_TEMPLATE_NAME',
      severity: 'error',
      message: 'Template manifest requires a human-readable display name.',
      blocking: true
    });
  }

  if (!isValidSemver(norm.template.templateVersion)) {
    issues.push({
      code: 'INVALID_TEMPLATE_VERSION',
      severity: 'error',
      message: `Template release version "${norm.template.templateVersion}" is not valid semantic versioning (e.g. 1.0.0).`,
      blocking: true
    });
  }

  // 2. Runtime API Compatibility Check
  const reqApi = norm.compatibility?.minimumRuntimeApi || norm.compatibility?.runtimeApi || '1.0';
  const supportedApiFloat = parseFloat(UTP_RUNTIME_API_VERSION);
  const requestedApiFloat = parseFloat(reqApi);
  if (isNaN(requestedApiFloat) || requestedApiFloat > supportedApiFloat) {
    issues.push({
      code: 'INCOMPATIBLE_RUNTIME_API',
      severity: 'error',
      message: `Template requires Runtime API ${reqApi}, but platform supports up to ${UTP_RUNTIME_API_VERSION}.`,
      blocking: true
    });
  }

  // 3. Entry point check
  const declaredEntry = norm.template.entry || 'index.html';
  if (filesMap.size > 0) {
    let entryFound = false;
    for (const p of filesMap.keys()) {
      if (p.toLowerCase() === declaredEntry.toLowerCase()) {
        entryFound = true;
        break;
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

  // 4. Fields Validation & Uniqueness
  const seenFieldIds = new Set();
  const fields = Array.isArray(norm.fields) ? norm.fields : [];
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
  }

  // 5. Sections Validation & Uniqueness
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
      // Check required & toggleable conflict
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

  // 7. Capabilities Registry Cross-Verification
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
    }
  }

  // 8. Package Asset Cross-Validation (if filesMap provided)
  if (filesMap.size > 0 && Array.isArray(norm.assets)) {
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

  const hasBlockingErrors = issues.some(i => i.severity === 'error' && i.blocking !== false);
  const isValid = issues.filter(i => i.severity === 'error').length === 0;
  const isPublishable = !hasBlockingErrors;

  return buildReport(isValid, issues, norm, isPublishable);
}

/**
 * Builds standard structured validation report
 */
function buildReport(valid, issues, normalized, publishable = false) {
  const errorsCount = issues.filter(i => i.severity === 'error').length;
  const warningsCount = issues.filter(i => i.severity === 'warning').length;

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
      passedChecks: Math.max(0, 15 - errorsCount)
    },
    issues,
    normalized
  };
}
