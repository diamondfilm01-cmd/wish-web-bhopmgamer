/**
 * WishMagic Production Legal & Compliance Management Engine (Part 38)
 * ==============================================================================
 * Centralized, versioned legal document lifecycle, cryptographic checksumming,
 * immutable user acceptance audit trails, granular cookie consent management,
 * and automated material change re-consent enforcement.
 *
 * Compatible with Cloudflare Workers (D1) and local Express dev runtime.
 */

import crypto from 'node:crypto';
import { createAuditLogEntry, isAuthoritativeAdmin } from './admin-operations-engine.js';

// ============================================================================
// 1. ENUMS & CONSTANTS
// ============================================================================

export const POLICY_TYPES = {
  TERMS_OF_SERVICE: 'terms_of_service',
  PRIVACY_POLICY: 'privacy_policy',
  COOKIE_POLICY: 'cookie_policy',
  REFUND_POLICY: 'refund_policy',
  PREMIUM_TERMS: 'premium_terms',
  CONTENT_POLICY: 'content_policy',
  REFERRAL_TERMS: 'referral_terms',
  COMMUNITY_GUIDELINES: 'community_guidelines'
};

export const POLICY_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  RETIRED: 'retired'
};

export const REVIEW_STATUS = {
  DRAFT: 'draft',
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

export const ACCEPTANCE_METHODS = {
  REGISTRATION: 'REGISTRATION',
  RECONSENT_MODAL: 'RECONSENT_MODAL',
  BANNER: 'BANNER',
  SETTINGS: 'SETTINGS',
  CHECKOUT: 'CHECKOUT',
  EXPLICIT_ACCEPT: 'EXPLICIT_ACCEPT'
};

export const CONSENT_CATEGORIES = {
  ESSENTIAL: 'essential',
  FUNCTIONAL: 'functional',
  ANALYTICS: 'analytics',
  MARKETING: 'marketing'
};

export const POLICY_METADATA = {
  [POLICY_TYPES.TERMS_OF_SERVICE]: {
    name: 'Terms of Service',
    slug: 'terms-of-service',
    shortTitle: 'Terms',
    icon: 'gavel',
    isMandatory: true,
    requiresReconsentOnMaterialChange: true,
    description: 'Core legal agreement governing platform use, accounts, customizations, and digital greetings.'
  },
  [POLICY_TYPES.PRIVACY_POLICY]: {
    name: 'Privacy Policy',
    slug: 'privacy-policy',
    shortTitle: 'Privacy',
    icon: 'verified_user',
    isMandatory: true,
    requiresReconsentOnMaterialChange: true,
    description: 'Detailed disclosures on Google Auth, media storage, transactions, cookies, data export, and 14-day deletion grace period.'
  },
  [POLICY_TYPES.COOKIE_POLICY]: {
    name: 'Cookie & Tracking Notice',
    slug: 'cookie-policy',
    shortTitle: 'Cookies',
    icon: 'cookie',
    isMandatory: false,
    requiresReconsentOnMaterialChange: false,
    description: 'Technical breakdown of essential session tokens, functional theme keys, and opt-in analytics cookies.'
  },
  [POLICY_TYPES.REFUND_POLICY]: {
    name: 'Refund & Cancellation Policy',
    slug: 'refund-policy',
    shortTitle: 'Refunds',
    icon: 'currency_exchange',
    isMandatory: false,
    requiresReconsentOnMaterialChange: false,
    description: 'Commercial terms regarding digital asset deliveries, premium celebration access, and refund eligibility.'
  },
  [POLICY_TYPES.PREMIUM_TERMS]: {
    name: 'Premium Purchase Terms',
    slug: 'premium-terms',
    shortTitle: 'Premium Terms',
    icon: 'diamond',
    isMandatory: false,
    requiresReconsentOnMaterialChange: false,
    description: 'Specific terms for VIP template unlocking, celebration credit packs, and lifetime passes.'
  },
  [POLICY_TYPES.CONTENT_POLICY]: {
    name: 'User Content & Media Policy',
    slug: 'content-policy',
    shortTitle: 'Content & Media',
    icon: 'perm_media',
    isMandatory: false,
    requiresReconsentOnMaterialChange: false,
    description: 'Guidelines on uploaded photos, custom audio recordings, file formats, and intellectual property.'
  },
  [POLICY_TYPES.REFERRAL_TERMS]: {
    name: 'Referral & Rewards Terms',
    slug: 'referral-terms',
    shortTitle: 'Referrals',
    icon: 'loyalty',
    isMandatory: false,
    requiresReconsentOnMaterialChange: false,
    description: 'Program rules for sharing invite codes, earning VIP rewards, anti-fraud enforcement, and credit caps.'
  },
  [POLICY_TYPES.COMMUNITY_GUIDELINES]: {
    name: 'Community & Review Guidelines',
    slug: 'community-guidelines',
    shortTitle: 'Community Standards',
    icon: 'rate_review',
    isMandatory: false,
    requiresReconsentOnMaterialChange: false,
    description: 'Standards for celebratory user reviews, respectful messaging, and moderation protocols.'
  }
};

// Official product contact points
export const COMPLIANCE_CONTACT_INFO = {
  legalEmail: 'legal@wishmagic.app',
  privacyEmail: 'privacy@wishmagic.app',
  supportEmail: 'support@wishmagic.app',
  grievanceOfficer: 'WishMagic Legal & Grievance Team',
  address: 'WishMagic Inc., Cosmic Digital Greeting Studio'
};

// ============================================================================
// 2. CRYPTOGRAPHIC CHECKSUM & VERSION UTILITIES
// ============================================================================

/**
 * Computes deterministic SHA-256 hex checksum of raw policy content
 */
export function computeContentChecksum(content) {
  if (typeof content !== 'string') {
    throw new TypeError('Content must be a string for checksum computation');
  }
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Anonymizes/hashes client IP for privacy preservation in audit trails
 */
export function hashClientIp(ip) {
  if (!ip || ip === 'unknown') return '0000000000000000';
  return crypto.createHash('sha256').update(String(ip).trim() + '_wm_salt', 'utf8').digest('hex').slice(0, 16);
}

/**
 * Semantic version comparison helper
 * Returns:
 *   1 if v1 > v2
 *   -1 if v1 < v2
 *   0 if v1 === v2
 */
export function compareSemver(v1, v2) {
  if (!v1 || !v2) return 0;
  const p1 = String(v1).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const p2 = String(v2).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);

  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

/**
 * Validates semantic version syntax (e.g. "1.0.0" or "2.1")
 */
export function isValidSemver(v) {
  if (!v || typeof v !== 'string') return false;
  return /^\d+\.\d+(\.\d+)?$/.test(v.trim().replace(/^v/i, ''));
}

// ============================================================================
// 3. SAFE MARKDOWN-TO-HTML RENDERER & SANITIZER
// ============================================================================

/**
 * Safely renders markdown into HTML without external arbitrary scripting.
 * Protects against XSS by escaping HTML entities before applying markdown transforms.
 */
export function renderPolicyMarkdown(markdown) {
  if (!markdown) return '';

  // 1. HTML entity escaping
  let text = String(markdown)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // 2. Headers
  text = text.replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold text-purple-950 dark:text-purple-100 mt-6 mb-2">$1</h3>');
  text = text.replace(/^## (.*$)/gim, '<h2 class="text-xl font-black text-purple-950 dark:text-white mt-8 mb-3 pb-2 border-b border-purple-200/40 dark:border-purple-800/40">$1</h2>');
  text = text.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-black text-purple-950 dark:text-white mt-6 mb-4">$1</h1>');

  // 3. Blockquotes
  text = text.replace(/^\> (.*$)/gim, '<blockquote class="border-l-4 border-purple-500 pl-4 py-1 my-3 bg-purple-500/10 dark:bg-purple-900/20 rounded-r-lg text-purple-900 dark:text-purple-200 text-sm italic">$1</blockquote>');

  // 4. Bold and Italic
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-purple-950 dark:text-white">$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');

  // 5. Monospace code
  text = text.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/60 font-mono text-xs text-purple-900 dark:text-purple-200">$1</code>');

  // 6. Safe links [text](url) - only http, https, mailto allowed
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+|mailto:[^\s\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-purple-600 dark:text-purple-400 font-semibold underline hover:text-pink-600 transition-colors">$1</a>');

  // 7. Unordered lists
  text = text.replace(/^\s*[\-\*]\s+(.*)$/gim, '<li class="ml-4 list-disc text-purple-900/90 dark:text-purple-200/90 text-sm my-1 leading-relaxed">$1</li>');

  // 8. Ordered lists
  text = text.replace(/^\s*(\d+)\.\s+(.*)$/gim, '<li class="ml-4 list-decimal text-purple-900/90 dark:text-purple-200/90 text-sm my-1 leading-relaxed">$2</li>');

  // 9. Paragraph breaks (double line breaks)
  const paragraphs = text.split(/\n\n+/);
  const formatted = paragraphs.map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<h1') || p.startsWith('<h2') || p.startsWith('<h3') || p.startsWith('<blockquote') || p.startsWith('<li')) {
      return p;
    }
    return `<p class="text-purple-900/80 dark:text-purple-200/80 text-sm sm:text-base leading-relaxed my-3 font-normal">${p.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  return formatted;
}

/**
 * Extracts auto Table of Contents from markdown headings
 */
export function extractTableOfContents(markdown) {
  if (!markdown) return [];
  const lines = String(markdown).split('\n');
  const toc = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const h2Match = trimmed.match(/^##\s+(.+)$/);
    if (h2Match) {
      const title = h2Match[1].replace(/\*\*/g, '').trim();
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      toc.push({ level: 2, title, id });
      continue;
    }
    const h3Match = trimmed.match(/^###\s+(.+)$/);
    if (h3Match) {
      const title = h3Match[1].replace(/\*\*/g, '').trim();
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      toc.push({ level: 3, title, id });
    }
  }

  return toc;
}

// ============================================================================
// 4. PUBLISHING SAFEGUARDS & VALIDATION
// ============================================================================

/**
 * Thorough server-side validation for legal policies prior to publication
 */
export function validatePolicyForPublishing(policy, existingVersions = []) {
  const errors = [];

  if (!policy) {
    return { valid: false, errors: ['Policy object is required'] };
  }

  // 1. Policy Type
  const validTypes = Object.values(POLICY_TYPES);
  if (!policy.policy_type || !validTypes.includes(policy.policy_type)) {
    errors.push(`Invalid policy_type. Must be one of: ${validTypes.join(', ')}`);
  }

  // 2. Title
  if (!policy.title || typeof policy.title !== 'string' || policy.title.trim().length < 3) {
    errors.push('Policy title must be at least 3 characters');
  }

  // 3. Version string
  if (!policy.version || !isValidSemver(policy.version)) {
    errors.push('Version must follow semantic format (e.g. 1.0.0 or 1.1)');
  }

  // 4. Content length & quality
  if (!policy.content || typeof policy.content !== 'string' || policy.content.trim().length < 50) {
    errors.push('Policy content must be at least 50 characters of valid legal text');
  }

  // 5. Version uniqueness among published versions of this policy type
  const normVersion = policy.version ? policy.version.trim().replace(/^v/i, '') : '';
  const duplicate = (existingVersions || []).find(v =>
    v.policy_type === policy.policy_type &&
    v.version && v.version.trim().replace(/^v/i, '') === normVersion &&
    v.id !== policy.id &&
    v.status === POLICY_STATUS.PUBLISHED
  );
  if (duplicate) {
    errors.push(`Version ${normVersion} for policy type '${policy.policy_type}' is already published and immutable (ID: ${duplicate.id}). Please increment version.`);
  }

  // 6. Effective Date
  if (policy.effective_at) {
    const d = new Date(policy.effective_at);
    if (isNaN(d.getTime())) {
      errors.push('effective_at must be a valid ISO-8601 date timestamp');
    }
  }

  // 7. Material change configuration check
  if (policy.is_material_change && (!policy.change_summary || policy.change_summary.trim().length < 5)) {
    errors.push('A material change requires a concise change summary explaining what was modified');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// 5. POLICY DRAFT, PUBLISHING & LIFECYCLE OPERATIONS
// ============================================================================

/**
 * Creates a new policy draft (or forks from an existing published version)
 */
export function createPolicyDraft({
  policyType,
  title,
  version,
  content,
  contentFormat = 'markdown',
  isMaterialChange = 0,
  changeSummary = '',
  createdBy = 'admin',
  forkFromPolicy = null
}) {
  const meta = POLICY_METADATA[policyType] || {};
  const effectiveTitle = title || meta.name || 'Legal Policy';
  const effectiveContent = content || (forkFromPolicy ? forkFromPolicy.content : '');

  // Calculate next version suggestion if not provided
  let effectiveVersion = version;
  if (!effectiveVersion && forkFromPolicy && forkFromPolicy.version) {
    const parts = forkFromPolicy.version.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    if (isMaterialChange) {
      parts[0] = (parts[0] || 1) + 1;
      parts[1] = 0;
      parts[2] = 0;
    } else {
      parts[1] = (parts[1] || 0) + 1;
      parts[2] = 0;
    }
    effectiveVersion = parts.slice(0, 3).join('.');
  } else if (!effectiveVersion) {
    effectiveVersion = '1.0.0';
  }

  const now = new Date().toISOString();
  const id = `pol_${policyType}_v${effectiveVersion.replace(/\./g, '_')}_${Date.now().toString(36)}`;
  const checksum = computeContentChecksum(effectiveContent);

  return {
    id,
    policy_type: policyType,
    version: effectiveVersion,
    title: effectiveTitle,
    content_format: contentFormat,
    content: effectiveContent,
    content_checksum: checksum,
    status: POLICY_STATUS.DRAFT,
    is_material_change: isMaterialChange ? 1 : 0,
    change_summary: changeSummary || (forkFromPolicy ? `Draft revision based on v${forkFromPolicy.version}` : 'Initial draft creation'),
    review_status: REVIEW_STATUS.DRAFT,
    created_by: createdBy,
    reviewer_id: null,
    reviewed_at: null,
    published_at: null,
    effective_at: now,
    retired_at: null,
    created_at: now,
    updated_at: now
  };
}

/**
 * Updates a draft policy. Enforces immutability: published or retired policies CANNOT be edited.
 */
export function updatePolicyDraft(draft, updates = {}) {
  if (!draft) throw new Error('Policy draft is required');
  if (draft.status !== POLICY_STATUS.DRAFT) {
    throw new Error(`Cannot edit policy in '${draft.status}' status. Published versions are immutable. Please create a new draft.`);
  }

  const now = new Date().toISOString();
  const nextContent = updates.content !== undefined ? updates.content : draft.content;
  const checksum = computeContentChecksum(nextContent);

  return {
    ...draft,
    title: updates.title !== undefined ? updates.title : draft.title,
    version: updates.version !== undefined ? updates.version : draft.version,
    content_format: updates.content_format !== undefined ? updates.content_format : draft.content_format,
    content: nextContent,
    content_checksum: checksum,
    is_material_change: updates.is_material_change !== undefined ? (updates.is_material_change ? 1 : 0) : draft.is_material_change,
    change_summary: updates.change_summary !== undefined ? updates.change_summary : draft.change_summary,
    review_status: updates.review_status !== undefined ? updates.review_status : draft.review_status,
    reviewer_id: updates.reviewer_id !== undefined ? updates.reviewer_id : draft.reviewer_id,
    reviewed_at: updates.reviewed_at !== undefined ? updates.reviewed_at : draft.reviewed_at,
    effective_at: updates.effective_at !== undefined ? updates.effective_at : draft.effective_at,
    updated_at: now
  };
}

/**
 * Publishes a draft policy version.
 * - Enforces validations.
 * - Computes immutable checksum.
 * - Transitions status to 'published'.
 * - Returns published version and active policy pointer update.
 */
export function publishPolicyVersion({
  draft,
  existingVersions = [],
  publishedBy = 'admin',
  effectiveAt = null
}) {
  const validation = validatePolicyForPublishing(draft, existingVersions);
  if (!validation.valid) {
    const err = new Error(`Cannot publish policy: ${validation.errors.join('; ')}`);
    err.validationErrors = validation.errors;
    throw err;
  }

  const now = new Date().toISOString();
  const effectiveDate = effectiveAt || draft.effective_at || now;
  const checksum = computeContentChecksum(draft.content);

  const publishedRecord = {
    ...draft,
    content_checksum: checksum,
    status: POLICY_STATUS.PUBLISHED,
    review_status: REVIEW_STATUS.APPROVED,
    reviewer_id: publishedBy,
    reviewed_at: now,
    published_at: now,
    effective_at: effectiveDate,
    updated_at: now
  };

  const activePointer = {
    policy_type: draft.policy_type,
    current_policy_id: publishedRecord.id,
    current_version: publishedRecord.version,
    effective_at: effectiveDate,
    updated_at: now
  };

  return {
    publishedPolicy: publishedRecord,
    activePointer,
    checksum
  };
}

/**
 * Retires a policy version explicitly
 */
export function retirePolicyVersion(policy, retiredBy = 'admin') {
  if (!policy) throw new Error('Policy is required');
  const now = new Date().toISOString();
  return {
    ...policy,
    status: POLICY_STATUS.RETIRED,
    retired_at: now,
    updated_at: now,
    retired_by: retiredBy
  };
}

// ============================================================================
// 6. USER ACCEPTANCE AUDIT & RE-CONSENT ENFORCEMENT
// ============================================================================

/**
 * Evaluates whether a user must re-consent to any mandatory published policies.
 * Triggers re-consent if:
 *   1. User has never accepted the policy, OR
 *   2. The currently active policy version is higher than user's accepted version AND
 *      the active policy was marked as a MATERIAL change.
 */
export function checkUserReconsentRequirements({
  userId,
  userAcceptances = [],
  activePolicies = {},
  policiesList = []
}) {
  const pendingPolicies = [];
  const acceptedPolicies = [];

  const mandatoryTypes = [
    POLICY_TYPES.TERMS_OF_SERVICE,
    POLICY_TYPES.PRIVACY_POLICY
  ];

  for (const policyType of mandatoryTypes) {
    const activeInfo = activePolicies[policyType];
    if (!activeInfo) continue;

    // Find full published document to check is_material_change and change_summary
    const publishedDoc = (policiesList || []).find(p => p.id === activeInfo.current_policy_id || (p.policy_type === policyType && p.version === activeInfo.current_version && p.status === POLICY_STATUS.PUBLISHED));
    const activeVersion = activeInfo.current_version;

    // Find latest acceptance by this user for this policy type
    const userAccs = (userAcceptances || [])
      .filter(a => (a.user_id === userId || a.userId === userId) && (a.policy_type === policyType || a.policyType === policyType))
      .sort((a, b) => new Date(b.accepted_at || b.acceptedAt).getTime() - new Date(a.accepted_at || a.acceptedAt).getTime());

    const latestAcc = userAccs[0] || null;

    if (!latestAcc) {
      // Never accepted
      pendingPolicies.push({
        policyType,
        policyName: POLICY_METADATA[policyType]?.name || policyType,
        requiredVersion: activeVersion,
        currentPolicyId: activeInfo.current_policy_id,
        isMaterialChange: publishedDoc ? Boolean(publishedDoc.is_material_change) : true,
        changeSummary: publishedDoc?.change_summary || 'Initial terms acceptance required',
        effectiveAt: activeInfo.effective_at,
        reason: 'FIRST_ACCEPTANCE'
      });
    } else {
      const semverDiff = compareSemver(activeVersion, latestAcc.policy_version || latestAcc.policyVersion);
      if (semverDiff > 0) {
        // Active version is higher. Check if material change requires re-consent
        const isMaterial = publishedDoc ? Boolean(publishedDoc.is_material_change) : false;
        if (isMaterial) {
          pendingPolicies.push({
            policyType,
            policyName: POLICY_METADATA[policyType]?.name || policyType,
            requiredVersion: activeVersion,
            acceptedVersion: latestAcc.policy_version || latestAcc.policyVersion,
            currentPolicyId: activeInfo.current_policy_id,
            isMaterialChange: true,
            changeSummary: publishedDoc?.change_summary || 'Policy has been updated with material changes',
            effectiveAt: activeInfo.effective_at,
            reason: 'MATERIAL_RECONSENT_REQUIRED'
          });
        } else {
          acceptedPolicies.push({
            policyType,
            activeVersion,
            acceptedVersion: latestAcc.policy_version || latestAcc.policyVersion,
            status: 'ACCEPTED_UP_TO_DATE'
          });
        }
      } else {
        acceptedPolicies.push({
          policyType,
          activeVersion,
          acceptedVersion: latestAcc.policy_version || latestAcc.policyVersion,
          status: 'ACCEPTED'
        });
      }
    }
  }

  return {
    userId,
    reconsentRequired: pendingPolicies.length > 0,
    pendingPolicies,
    acceptedPolicies
  };
}

/**
 * Creates an immutable acceptance record
 */
export function recordUserAcceptance({
  userId,
  policyType,
  policyVersion,
  policyId,
  contentChecksum,
  acceptanceMethod = ACCEPTANCE_METHODS.EXPLICIT_ACCEPT,
  clientIp = '',
  userAgent = ''
}) {
  if (!userId) throw new Error('User ID is required to record policy acceptance');
  if (!policyType) throw new Error('Policy type is required');
  if (!policyVersion) throw new Error('Policy version is required');
  if (!contentChecksum) throw new Error('Content checksum is required');

  const now = new Date().toISOString();
  const id = `uacc_${policyType.slice(0, 4)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const ipHash = hashClientIp(clientIp);

  return {
    id,
    user_id: userId,
    userId: userId,
    policy_type: policyType,
    policyType: policyType,
    policy_version: policyVersion,
    policyVersion: policyVersion,
    policy_id: policyId || '',
    policyId: policyId || '',
    content_checksum: contentChecksum,
    contentChecksum: contentChecksum,
    acceptance_method: acceptanceMethod,
    acceptanceMethod: acceptanceMethod,
    ip_hash: ipHash,
    ipHash: ipHash,
    user_agent: (userAgent || '').slice(0, 255),
    userAgent: (userAgent || '').slice(0, 255),
    accepted_at: now,
    acceptedAt: now,
    created_at: now,
    createdAt: now
  };
}

// ============================================================================
// 7. COOKIE & CONSENT PREFERENCE ENGINE
// ============================================================================

/**
 * Normalizes granular consent preferences
 * Essential is ALWAYS true (strictly necessary for authentication & security)
 */
export function normalizeConsentPreferences(input = {}) {
  return {
    essential: 1, // Invariant: Cannot be disabled
    functional: input.functional === false || input.functional === 0 ? 0 : 1,
    analytics: input.analytics === true || input.analytics === 1 ? 1 : 0,
    marketing: input.marketing === true || input.marketing === 1 ? 1 : 0,
    consentVersion: input.consentVersion || '1.0.0'
  };
}

/**
 * Creates or updates cookie consent record
 */
export function recordCookieConsent({
  userId = null,
  anonymousToken = null,
  preferences = {},
  clientIp = '',
  userAgent = ''
}) {
  const norm = normalizeConsentPreferences(preferences);
  const now = new Date().toISOString();
  const id = `ccons_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const ipHash = hashClientIp(clientIp);

  return {
    id,
    user_id: userId,
    userId: userId,
    anonymous_token: anonymousToken,
    anonymousToken: anonymousToken,
    essential: norm.essential,
    functional: norm.functional,
    analytics: norm.analytics,
    marketing: norm.marketing,
    consent_version: norm.consentVersion,
    consentVersion: norm.consentVersion,
    ip_hash: ipHash,
    ipHash: ipHash,
    user_agent: (userAgent || '').slice(0, 255),
    userAgent: (userAgent || '').slice(0, 255),
    updated_at: now,
    updatedAt: now,
    created_at: now,
    createdAt: now
  };
}

// ============================================================================
// 8. TEXT DIFF GENERATION (VERSION COMPARISON)
// ============================================================================

/**
 * Computes line-by-line diff comparison between two text versions
 */
export function generatePolicyDiff(oldText, newText) {
  const linesOld = String(oldText || '').split('\n');
  const linesNew = String(newText || '').split('\n');

  const diff = [];
  const maxLines = Math.max(linesOld.length, linesNew.length);

  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  for (let i = 0; i < maxLines; i++) {
    const o = linesOld[i];
    const n = linesNew[i];

    if (o === undefined) {
      diff.push({ type: 'added', line: n, lineNumNew: i + 1 });
      additions++;
    } else if (n === undefined) {
      diff.push({ type: 'removed', line: o, lineNumOld: i + 1 });
      deletions++;
    } else if (o === n) {
      diff.push({ type: 'same', line: o, lineNumOld: i + 1, lineNumNew: i + 1 });
      unchanged++;
    } else {
      diff.push({ type: 'removed', line: o, lineNumOld: i + 1 });
      diff.push({ type: 'added', line: n, lineNumNew: i + 1 });
      additions++;
      deletions++;
    }
  }

  return {
    additions,
    deletions,
    unchanged,
    totalLinesOld: linesOld.length,
    totalLinesNew: linesNew.length,
    diff
  };
}

// ============================================================================
// 9. PRODUCTION LEGAL POLICIES (AUTHENTIC GROUNDED TEMPLATES)
// ============================================================================

/**
 * Builds the initial comprehensive production legal policies.
 * Strictly reflects actual WishMagic platform architecture:
 * - Google Firebase OAuth authentication
 * - ImgBB and Backblaze B2 multimedia storage
 * - Cloudflare edge hosting & D1 database
 * - Part 32 Commerce Engine (Razorpay & Stripe; no raw card storage)
 * - Part 34 Customer Support
 * - Part 35 Moderation & Community Guidelines
 * - Part 36 Referral Engine & anti-fraud rules
 * - Part 37 Account deletion with 14-day grace period & 7-year statutory accounting retention
 */
export function buildDefaultLegalPolicies() {
  const now = new Date().toISOString();

  const policies = [
    // 1. TERMS OF SERVICE
    {
      id: 'pol_tos_v1_0',
      policy_type: POLICY_TYPES.TERMS_OF_SERVICE,
      version: '1.0.0',
      title: 'WishMagic Terms of Service',
      content_format: 'markdown',
      status: POLICY_STATUS.PUBLISHED,
      is_material_change: 0,
      change_summary: 'Initial production publication of WishMagic platform terms.',
      review_status: REVIEW_STATUS.APPROVED,
      created_by: 'WishMagic Legal Team',
      reviewer_id: 'chief_compliance_officer',
      reviewed_at: now,
      published_at: now,
      effective_at: now,
      content: `# WishMagic Terms of Service

**Effective Date:** October 2025  
**Last Updated:** October 2025  
**Version:** 1.0.0

Welcome to **WishMagic** ("WishMagic", "Platform", "we", "our", or "us"). By accessing, registering for, or using the WishMagic website, greeting customizers, personalized celebration links, or related services (collectively, the "Services"), you agree to be bound by these Terms of Service ("Terms").

If you do not agree to these Terms, please do not use our Services.

---

## 1. Description of Services
WishMagic is an interactive digital celebration and luxury greeting platform. We empower creators and loved ones to design, customize, preview, and share personalized digital web greetings, celebrations, cosmic animations, audio soundscapes, and multimedia keepsakes.

The Services include:
- Browsing handcrafted and seasonal celebration templates.
- Personalizing recipient names, custom heartfelt messages, occasion details, and photos.
- Sharing interactive web links via unique URLs and QR codes.
- Premium celebration passes and one-time template unlocks (Part 32 Commerce Engine).
- Referral rewards and community review participation (Part 35 & 36 Engines).

---

## 2. Eligibility & Google Authentication
- **Age Requirement:** You must be at least 13 years of age (or the minimum legal age required in your jurisdiction) to use WishMagic.
- **Account Creation:** WishMagic utilizes verified **Google Firebase Authentication**. When you sign in with your Google Account, you must provide accurate, current information.
- **Account Security:** You are solely responsible for all activity that occurs under your account. If you believe your account has been compromised, notify us immediately at \`${COMPLIANCE_CONTACT_INFO.supportEmail}\`.

---

## 3. User-Generated Content & Media License
- **Your Content:** When creating wishes, you may submit text messages, greetings, photos, and voice notes ("User Content"). You retain all copyright and ownership rights to your User Content.
- **License to WishMagic:** By uploading User Content, you grant WishMagic a non-exclusive, worldwide, royalty-free license to store, process, transcode, and display your User Content solely to deliver, render, and share the interactive celebrations you create.
- **Storage Providers:** Images and audio files may be hosted through secure third-party storage partners including **ImgBB** and **Backblaze B2**, in compliance with our Privacy Policy.
- **Content Responsibility:** You represent that you own or have obtained all necessary licenses, permissions, and rights to upload and share any photos or music included in your celebrations.

---

## 4. Prohibited Content & Platform Conduct
You agree not to upload, transmit, or share any User Content that:
1. Is unlawful, defamatory, obscene, pornographic, harassing, threatening, or abusive.
2. Infringes any patent, trademark, trade secret, copyright, or other proprietary rights.
3. Contains viruses, malware, trojans, or malicious code designed to disrupt the Platform.
4. Involves non-consensual imagery or personal information of minors without verified parental consent.
5. Employs automated scrapers, bots, or excessive load tools that compromise server performance.

WishMagic reserves the right to moderate, unpublish, or permanently remove any content that violates these guidelines pursuant to our **Review Moderation Engine (Part 35)**.

---

## 5. Published Wish URLs & Sharing Responsibilities
- **Link Types:** When you publish a celebration, it is assigned a dedicated web slug (\`/w/:slug\`). Depending on your configuration, this page may be public, unlisted, or protected.
- **Recipient Sharing:** You are responsible for ensuring that anyone with whom you share a link is comfortable receiving your greeting.
- **Link Expiration:** In accordance with our storage health and lifecycle rules, inactive or temporary preview links may be subject to automated archiving or expiration.

---

## 6. Premium Purchases, Billing & Taxes
- **Commerce Engine:** Purchases of VIP templates, unlimited celebration credits, or premium passes are processed via certified payment gateways (such as **Razorpay** and **Stripe**).
- **Payment Security:** WishMagic never stores your full credit card number, debit card number, or CVV. Payment data is processed directly by the certified payment gateway.
- **Invoices:** Invoices and digital receipts are generated and permanently accessible in your Account Orders dashboard.
- **Taxes:** Stated prices may include or exclude applicable goods and services taxes (GST) depending on your billing region.

---

## 7. Refund & Cancellation Policy
- **Instant Digital Delivery:** Because WishMagic delivers customized digital interactive experiences instantly upon creation, completed and shared celebrations are generally non-refundable.
- **Unused Credits:** If you purchase a premium credit bundle or pass and encounter technical difficulties preventing customization within 7 days of purchase, you may request a refund via \`${COMPLIANCE_CONTACT_INFO.supportEmail}\`.
- Full details are set forth in our separate **Refund & Cancellation Policy**.

---

## 8. Referral Program & Credits
- **Earning Rewards:** Eligible users can generate personal referral invite links (Part 36 Engine). Referrers receive platform reward credits upon qualified sign-ups and first orders.
- **Fair Play:** Self-referrals, fake accounts, script automation, and credit churning are strictly prohibited and will result in referral disqualification and credit forfeiture.
- Referral credits have no cash value and cannot be redeemed for legal tender.

---

## 9. Account Deletion & Data Retention
- **Self-Service Deletion:** You may request account deletion at any time in your Account Privacy Settings.
- **14-Day Grace Period:** To prevent accidental loss of cherished memories, account deletion enters a **14-day grace period** during which you may log in and cancel deletion.
- **Statutory Retention:** Following finalization, your personal profile data and drafts are permanently purged. Historical financial transaction logs are retained for 7 years as required by statutory tax and accounting laws.

---

## 10. Intellectual Property Complaints (DMCA)
If you believe that content on WishMagic infringes your copyright, please submit a written notice to:
**Copyright Agent:** \`${COMPLIANCE_CONTACT_INFO.legalEmail}\`  
Include a description of the copyrighted work, URL location on WishMagic, and your statement of ownership under penalty of perjury.

---

## 11. Disclaimers & Limitation of Liability
The Services are provided on an "as is" and "as available" basis without warranties of any kind. WishMagic disclaims all warranties, express or implied, including fitness for a particular purpose and non-infringement. In no event shall WishMagic be liable for indirect, incidental, or consequential damages.

---

## 12. Contact Information
For questions concerning these Terms of Service, contact our Legal Department:
- **Email:** \`${COMPLIANCE_CONTACT_INFO.legalEmail}\`
- **Support Desk:** \`${COMPLIANCE_CONTACT_INFO.supportEmail}\`
- **Mailing Address:** ${COMPLIANCE_CONTACT_INFO.address}`
    },

    // 2. PRIVACY POLICY
    {
      id: 'pol_priv_v1_0',
      policy_type: POLICY_TYPES.PRIVACY_POLICY,
      version: '1.0.0',
      title: 'WishMagic Privacy Policy',
      content_format: 'markdown',
      status: POLICY_STATUS.PUBLISHED,
      is_material_change: 0,
      change_summary: 'Initial production publication of WishMagic platform privacy disclosures.',
      review_status: REVIEW_STATUS.APPROVED,
      created_by: 'WishMagic Privacy Team',
      reviewer_id: 'data_protection_officer',
      reviewed_at: now,
      published_at: now,
      effective_at: now,
      content: `# WishMagic Privacy Policy

**Effective Date:** October 2025  
**Last Updated:** October 2025  
**Version:** 1.0.0

At **WishMagic**, your trust and privacy are fundamental to everything we build. This Privacy Policy details how we collect, process, store, and safeguard your personal information when you use our digital celebration platform.

We do not sell your personal data to third parties.

---

## 1. Information We Collect
We collect only the information necessary to provide, personalize, and maintain our Services:

### A. Account Information
When you sign in using **Google Firebase Authentication**, we receive:
- Your Google display name and email address.
- Your Google profile picture (avatar URL).
- Account preferences such as preferred language and timezone (Part 37 Settings).

### B. Celebration & Wish Data
When you build greetings, we store:
- Recipient names, sender signatures, occasions, and personalized text messages.
- Template configurations, selected animations, color palettes, and music selections.
- Uploaded media attachments (photos, voice recordings, background clips).

### C. Commercial & Order Records
When you make a payment for premium templates or passes:
- Order reference IDs, selected package tier, transaction currency, and payment timestamps.
- Payment gateway reference IDs (e.g. Razorpay / Stripe transaction IDs).
- *Important:* We **never** collect, transmit, or store raw credit card numbers or CVV codes.

### D. Support & Referral Data
- Customer support tickets, messages, and inquiry history (Part 34 Support Engine).
- Referral codes, referral click attributions, and reward ledger balances (Part 36 Engine).

### E. Technical Telemetry & Device Information
- IP address (anonymized/hashed for security audit logs).
- User agent string, browser type, and operating system.
- Session tokens and cookie preferences.

---

## 2. How We Use Your Information
We process your information under the following lawful bases:
1. **Performance of Contract:** To authenticate your account, render celebrations, generate sharing links, and process orders.
2. **Legitimate Interests:** To prevent fraud, detect malicious scraping, enforce community standards, and optimize application performance.
3. **Legal Compliance:** To maintain statutory accounting records and invoices for tax compliance.
4. **Consent:** To send non-essential communications and measure optional analytics telemetry.

---

## 3. Third-Party Service Providers
To deliver our cloud-scale experience, we partner with trusted technology providers:
- **Cloudflare (D1 & Pages):** Global content delivery, DDoS mitigation, and edge database persistence.
- **Google Firebase:** Secure OAuth identity verification and session tokens.
- **ImgBB & Backblaze B2:** High-speed cloud storage for user-uploaded celebration photos and audio notes.
- **Razorpay & Stripe:** PCI-DSS Level 1 certified payment processing.

Each provider operates under strict confidentiality obligations and processes data solely as instructed by WishMagic.

---

## 4. Cookies & Consent Management
We use cookies and browser storage technologies:
- **Essential Cookies:** Strictly necessary for session management, CSRF protection, and account authentication. Always active.
- **Functional Preferences:** Storing your dark/light theme, audio volume, and language preferences.
- **Analytics & Telemetry (Opt-in):** Measuring template popularity and page load performance.
- **Marketing (Opt-in):** Referral attribution and promotional celebration reminders.

You can view and modify your cookie preferences at any time via our **Cookie Preferences Drawer** in the page footer.

---

## 5. Data Retention & Account Deletion
- **Active Accounts:** Celebration data and media remain accessible as long as your account is active.
- **14-Day Deletion Grace Period:** If you submit an account deletion request, your account enters a **14-day grace window**. You may cancel deletion by logging back in.
- **Post-Grace Purge:** Once the grace period expires, personal profile data, draft wishes, and orphan media files are queued and permanently purged.
- **Statutory Financial Retention:** Payment transaction records, order IDs, and invoices are retained for 7 years under statutory financial accounting laws.

---

## 6. Your Privacy Rights (GDPR & DPDP Portability)
Depending on your jurisdiction, you have the right to:
1. **Access & Portability:** Download a complete, machine-readable JSON copy of your personal data at any time via your Account Privacy Settings (**GDPR/DPDP Article 20**).
2. **Rectification:** Update your display name, language, timezone, and avatar anytime.
3. **Erasure:** Request complete erasure of your personal data.
4. **Withdraw Consent:** Opt out of non-essential analytics and marketing communications with immediate effect.

---

## 7. Data Security Safeguards
We maintain rigorous administrative, technical, and physical safeguards:
- Encryption in transit (TLS 1.3 / HTTPS) for all web traffic.
- Encryption at rest (AES-256) for cloud databases and media storage.
- Multi-factor authenticated administrative portals protected by secret route obscuration and role-based access control.
- Automated session invalidation and killswitch capabilities.

---

## 8. Children's Privacy
WishMagic is not intended for unsupervised children under the age of 13. We do not knowingly collect personal information directly from children under 13 without verified parental consent. If you believe a child has provided us with personal data, please contact us immediately.

---

## 9. Contact Our Data Protection Officer
For privacy inquiries, rights requests, or concerns:
- **Data Protection Office:** \`${COMPLIANCE_CONTACT_INFO.privacyEmail}\`
- **General Support:** \`${COMPLIANCE_CONTACT_INFO.supportEmail}\`
- **Postal Address:** ${COMPLIANCE_CONTACT_INFO.address}`
    },

    // 3. COOKIE & TRACKING NOTICE
    {
      id: 'pol_cookie_v1_0',
      policy_type: POLICY_TYPES.COOKIE_POLICY,
      version: '1.0.0',
      title: 'WishMagic Cookie & Tracking Notice',
      content_format: 'markdown',
      status: POLICY_STATUS.PUBLISHED,
      is_material_change: 0,
      change_summary: 'Initial production publication of Cookie and Tracking Notice.',
      review_status: REVIEW_STATUS.APPROVED,
      created_by: 'WishMagic Privacy Team',
      reviewer_id: 'data_protection_officer',
      reviewed_at: now,
      published_at: now,
      effective_at: now,
      content: `# WishMagic Cookie & Tracking Notice

**Effective Date:** October 2025  
**Version:** 1.0.0

This Cookie Notice explains how **WishMagic** uses cookies, local storage, and similar technologies to recognize you, improve your celebration experience, and secure our Services.

---

## 1. What are Cookies?
Cookies and browser storage objects (\`localStorage\` and \`sessionStorage\`) are small data files placed on your device when you browse websites. They enable the platform to remember your sign-in status, keep track of your unfinished customizations, and load preferences.

---

## 2. Categories of Cookies We Use

### A. Strictly Necessary (Essential) Cookies
- **Purpose:** Core authentication, user sessions, CSRF tokens, and security defense.
- **Can it be disabled?** No. The Platform cannot function without these cookies.
- **Examples:** \`wishmagic_session\`, \`firebase:authUser\`, \`csrf_token\`.

### B. Functional & Preference Cookies
- **Purpose:** Remembering your personalized preferences such as Dark/Light theme, chosen language (\`en\`, \`hi\`, \`gu\`), ambient particle effects toggle, and background music mute status.
- **Duration:** Persistent (up to 12 months) or until browser storage is cleared.

### C. Analytics & Performance Cookies (Opt-in)
- **Purpose:** Collecting anonymous metrics about which greeting templates are most popular, page rendering latency, and error diagnostics.
- **Can it be disabled?** Yes. You may opt out anytime via our Cookie Preferences Drawer.

### D. Marketing & Referral Cookies (Opt-in)
- **Purpose:** Attributing friend referral codes (Part 36 Referral Engine) and promotional discount banners.
- **Can it be disabled?** Yes.

---

## 3. Managing Your Cookie Preferences
You can update your preferences at any time:
1. Click the **"Cookie Preferences"** link in our footer.
2. Adjust your choices for Functional, Analytics, and Marketing categories.
3. Click **"Save Preferences"**.

Your choice is immediately recorded on your device and synchronized to your account profile.`
    },

    // 4. REFUND & CANCELLATION POLICY
    {
      id: 'pol_ref_v1_0',
      policy_type: POLICY_TYPES.REFUND_POLICY,
      version: '1.0.0',
      title: 'WishMagic Refund & Cancellation Policy',
      content_format: 'markdown',
      status: POLICY_STATUS.PUBLISHED,
      is_material_change: 0,
      change_summary: 'Initial publication of digital celebration refund terms.',
      review_status: REVIEW_STATUS.APPROVED,
      created_by: 'WishMagic Commerce Team',
      reviewer_id: 'finance_controller',
      reviewed_at: now,
      published_at: now,
      effective_at: now,
      content: `# WishMagic Refund & Cancellation Policy

**Effective Date:** October 2025  
**Version:** 1.0.0

Thank you for choosing **WishMagic** for your celebrations. We strive to provide magical digital experiences. This policy outlines when refunds and cancellations are available.

---

## 1. Digital Services Nature
WishMagic delivers customized, digital celebrations, audio greetings, and web keepsakes that are generated immediately upon completion. 

## 2. Refund Eligibility
- **Unused Passes / Credit Bundles:** If you purchase a VIP Celebration Pass or credit pack and do not use it to publish a celebration, you may request a 100% full refund within **7 calendar days** of the transaction date.
- **Service Outage / Delivery Failure:** If a verified server outage or technical bug on our end permanently prevents your published celebration from being accessed by the recipient on their special day, you are entitled to a full refund or an equivalent credit replacement.
- **Completed Wishes:** Once a celebration has been personalized, published, and shared with the recipient, the digital delivery is deemed fulfilled and non-refundable.

## 3. How to Request a Refund
To request a refund, email \`${COMPLIANCE_CONTACT_INFO.supportEmail}\` with:
- Your Order ID (visible in your Account Orders dashboard).
- The email address associated with your account.
- A brief explanation of the issue encountered.

Refunds are processed through the original payment method (Razorpay or Stripe) within 5–7 business days.`
    },

    // 5. PREMIUM PURCHASE TERMS
    {
      id: 'pol_prem_v1_0',
      policy_type: POLICY_TYPES.PREMIUM_TERMS,
      version: '1.0.0',
      title: 'WishMagic Premium Purchase Terms',
      content_format: 'markdown',
      status: POLICY_STATUS.PUBLISHED,
      is_material_change: 0,
      change_summary: 'Initial publication of VIP template and Studio tiering purchase terms.',
      review_status: REVIEW_STATUS.APPROVED,
      created_by: 'WishMagic Commerce Team',
      reviewer_id: 'chief_commercial_officer',
      reviewed_at: now,
      published_at: now,
      effective_at: now,
      content: `# WishMagic Premium Purchase Terms

**Effective Date:** October 2025  
**Version:** 1.0.0

These Premium Purchase Terms supplement the WishMagic Terms of Service and apply to all purchases of VIP celebration templates, premium audio tracks, high-capacity image slots, and studio tiering passes.

---

## 1. Studio Tiering & Entitlements
- **Free Templates:** Free celebration templates may be created and shared at zero cost, subject to standard media limits.
- **VIP Templates:** Unlocked upon one-off payment or credit redemption. VIP templates include exclusive 3D particle animations, cinematic music libraries, and custom domain slug options.
- **Lifetime Access:** Unless explicitly stated otherwise, a published premium wish remains live for the lifetime of the Platform, subject to our fair use guidelines.

---

## 2. Price Changes & Promotions
WishMagic reserves the right to adjust pricing or offer promotional discount codes. Price changes do not affect previously purchased passes or already published celebrations.`
    },

    // 6. CONTENT & MEDIA POLICY
    {
      id: 'pol_cont_v1_0',
      policy_type: POLICY_TYPES.CONTENT_POLICY,
      version: '1.0.0',
      title: 'WishMagic User Content & Media Policy',
      content_format: 'markdown',
      status: POLICY_STATUS.PUBLISHED,
      is_material_change: 0,
      change_summary: 'Initial publication of media upload and intellectual property guidelines.',
      review_status: REVIEW_STATUS.APPROVED,
      created_by: 'WishMagic Moderation Team',
      reviewer_id: 'head_of_trust_and_safety',
      reviewed_at: now,
      published_at: now,
      effective_at: now,
      content: `# WishMagic User Content & Media Policy

**Effective Date:** October 2025  
**Version:** 1.0.0

WishMagic is committed to maintaining a heartwarming, respectful, and safe celebration ecosystem.

---

## 1. Supported Media Formats & Limits
- **Images:** JPEG, PNG, WebP, GIF (up to 5MB per upload).
- **Audio:** MP3, AAC, M4A (up to 10MB per upload).
- **Prohibited Files:** Executable files (\`.exe\`, \`.sh\`), scripts, or encrypted archives.

## 2. Copyright & Intellectual Property
You must own the rights to, or have obtained permission from the copyright owner for, any images, audio tracks, or videos you attach to a celebration. Do not upload commercial copyrighted music without proper licensing.

## 3. Zero Tolerance for Harmful Material
We immediately remove and report content involving hate speech, non-consensual sexual material, violence, or exploitation.`
    },

    // 7. REFERRAL & REWARDS TERMS
    {
      id: 'pol_ref_terms_v1_0',
      policy_type: POLICY_TYPES.REFERRAL_TERMS,
      version: '1.0.0',
      title: 'WishMagic Referral & Rewards Terms',
      content_format: 'markdown',
      status: POLICY_STATUS.PUBLISHED,
      is_material_change: 0,
      change_summary: 'Initial publication of referral program rules and anti-fraud criteria.',
      review_status: REVIEW_STATUS.APPROVED,
      created_by: 'WishMagic Growth Team',
      reviewer_id: 'growth_lead',
      reviewed_at: now,
      published_at: now,
      effective_at: now,
      content: `# WishMagic Referral & Rewards Terms

**Effective Date:** October 2025  
**Version:** 1.0.0

These terms govern your participation in the **WishMagic Referral & Rewards Program** (Part 36 Referral Engine).

---

## 1. Program Mechanics
- Every registered user is assigned a unique referral code and shareable invite link.
- When an invited friend signs up and completes their first qualified action, both the referrer and the friend earn platform celebration credits.

## 2. Fraud Prevention & Disqualification
- Self-referrals (creating alternate accounts using the same IP, device, or credit card) are strictly prohibited.
- Automated bots, spam invites in public forums, or paid search bidding on "WishMagic" keywords will result in immediate referral account disqualification and credit cancellation.

## 3. Rewards Value
Referral credits are non-transferable, possess no monetary value outside of WishMagic, and cannot be exchanged for cash.`
    },

    // 8. COMMUNITY & REVIEW GUIDELINES
    {
      id: 'pol_comm_v1_0',
      policy_type: POLICY_TYPES.COMMUNITY_GUIDELINES,
      version: '1.0.0',
      title: 'WishMagic Community & Review Guidelines',
      content_format: 'markdown',
      status: POLICY_STATUS.PUBLISHED,
      is_material_change: 0,
      change_summary: 'Initial publication of user review standards and moderation practices.',
      review_status: REVIEW_STATUS.APPROVED,
      created_by: 'WishMagic Community Team',
      reviewer_id: 'community_manager',
      reviewed_at: now,
      published_at: now,
      effective_at: now,
      content: `# WishMagic Community & Review Guidelines

**Effective Date:** October 2025  
**Version:** 1.0.0

WishMagic encourages genuine, celebratory reviews of our templates and creator experiences.

---

## 1. Review Authenticity
- Reviews must be based on genuine user experiences with our templates or celebrations.
- Fabricated reviews, competitor disparagement, or compensated reviews are not permitted.

## 2. Respectful Discourse
- Reviews containing profanity, harassment, personal contact details, or defamatory remarks will be rejected by our **Review Moderation Engine (Part 35)**.
- Feedback on template designs should remain constructive and celebratory.`
    }
  ];

  // Compute checksums and build active pointers
  const activePointers = {};
  for (const pol of policies) {
    pol.content_checksum = computeContentChecksum(pol.content);
    activePointers[pol.policy_type] = {
      policy_type: pol.policy_type,
      current_policy_id: pol.id,
      current_version: pol.version,
      effective_at: pol.effective_at,
      updated_at: pol.updated_at
    };
  }

  return {
    policies,
    activePointers
  };
}
