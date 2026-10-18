/**
 * WishMagic Production Legal & Compliance Management System Tests (Part 38)
 * ==============================================================================
 * Comprehensive test suite validating:
 *   1. Migration 0023 DDL schema integrity & strict additive invariants
 *   2. Cryptographic SHA-256 checksumming & tamper-evidence
 *   3. Semantic versioning comparison & validation
 *   4. Safe Markdown rendering & XSS defense
 *   5. Publishing safeguards & immutability enforcement
 *   6. Version diff engine (line-by-line additions/deletions)
 *   7. User acceptance record generation & verification
 *   8. Material change re-consent detection rules
 *   9. Granular cookie & telemetry preference management
 *  10. Truthful data flows & grounded platform disclosures
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  POLICY_TYPES,
  POLICY_STATUS,
  REVIEW_STATUS,
  ACCEPTANCE_METHODS,
  CONSENT_CATEGORIES,
  POLICY_METADATA,
  COMPLIANCE_CONTACT_INFO,
  computeContentChecksum,
  hashClientIp,
  compareSemver,
  isValidSemver,
  renderPolicyMarkdown,
  extractTableOfContents,
  validatePolicyForPublishing,
  createPolicyDraft,
  updatePolicyDraft,
  publishPolicyVersion,
  retirePolicyVersion,
  checkUserReconsentRequirements,
  recordUserAcceptance,
  normalizeConsentPreferences,
  recordCookieConsent,
  generatePolicyDiff,
  buildDefaultLegalPolicies
} from '../src/legal-compliance-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('WishMagic Part 38: Production Legal & Compliance Suite', async (t) => {

  // --------------------------------------------------------------------------
  // TEST 1: Migration 0023 Schema & Additive D1 Invariants
  // --------------------------------------------------------------------------
  await t.test('TEST 1: Migration 0023 Schema & D1 Additive Invariants', () => {
    const migrationPath = path.join(ROOT_DIR, 'migrations', '0023_part38_legal_and_compliance_center.sql');
    assert.ok(fs.existsSync(migrationPath), 'Migration 0023 file must exist');

    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(sql.includes('c08b683b-eb07-4639-ab33-fb1139bfb295'), 'Preserves production database UUID');
    assert.ok(!/^\s*DROP\s+TABLE/mi.test(sql), 'Invariant: Strict additive schema, no DROP TABLE statements');
    assert.ok(!/^\s*TRUNCATE/mi.test(sql), 'Invariant: Strict additive schema, no TRUNCATE statements');
    assert.ok(sql.includes('mig_0023'), 'Must register mig_0023 in _migrations');

    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS legal_policies'), 'Creates legal_policies table');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS legal_active_policies'), 'Creates legal_active_policies table');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS policy_acceptances'), 'Creates policy_acceptances table');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS user_cookie_consents'), 'Creates user_cookie_consents table');

    assert.ok(sql.includes('content_checksum TEXT NOT NULL'), 'Requires content_checksum column');
    assert.ok(sql.includes('is_material_change INTEGER'), 'Requires is_material_change column');
    assert.ok(sql.includes('acceptance_method TEXT'), 'Requires acceptance_method column');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Cryptographic Checksumming & Tamper-Evidence
  // --------------------------------------------------------------------------
  await t.test('TEST 2: SHA-256 Checksumming & Privacy Hashing', () => {
    const textA = '# Terms of Service\n\nWelcome to WishMagic celebrations.';
    const textB = '# Terms of Service\n\nWelcome to WishMagic celebrations!'; // 1 char difference

    const hashA = computeContentChecksum(textA);
    const hashB = computeContentChecksum(textB);

    assert.equal(typeof hashA, 'string');
    assert.equal(hashA.length, 64, 'SHA-256 hex string must be 64 characters');
    assert.equal(computeContentChecksum(textA), hashA, 'Checksum computation must be strictly deterministic');
    assert.notEqual(hashA, hashB, 'A single character difference must produce completely different hash (avalanche effect)');

    // Client IP Hashing (Privacy-Preserving Audit)
    const ipHash1 = hashClientIp('203.0.113.195');
    const ipHash2 = hashClientIp('203.0.113.195');
    const ipHashOther = hashClientIp('198.51.100.22');

    assert.equal(ipHash1, ipHash2, 'Same IP must yield deterministic hash');
    assert.notEqual(ipHash1, ipHashOther, 'Different IPs must yield different hashes');
    assert.equal(ipHash1.length, 16, 'IP hash truncated to 16 chars for storage efficiency');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Semantic Versioning Validation & Ordering
  // --------------------------------------------------------------------------
  await t.test('TEST 3: Semantic Versioning Validation & Ordering', () => {
    assert.ok(isValidSemver('1.0.0'), '1.0.0 is valid semver');
    assert.ok(isValidSemver('2.1'), '2.1 is valid semver');
    assert.ok(isValidSemver('v3.0.1'), 'v3.0.1 is accepted with leading v stripped');
    assert.ok(!isValidSemver('abc'), 'Non-numeric string is invalid');
    assert.ok(!isValidSemver('1.x'), 'Wildcards are invalid');

    assert.equal(compareSemver('2.0.0', '1.9.9'), 1, '2.0.0 > 1.9.9');
    assert.equal(compareSemver('1.0.0', '1.0.1'), -1, '1.0.0 < 1.0.1');
    assert.equal(compareSemver('1.2.0', '1.2.0'), 0, '1.2.0 == 1.2.0');
    assert.equal(compareSemver('v1.5', '1.5.0'), 0, 'v1.5 == 1.5.0');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Safe Markdown Rendering & XSS Protection
  // --------------------------------------------------------------------------
  await t.test('TEST 4: Markdown-to-HTML Rendering & XSS Defenses', () => {
    const rawMalicious = `
# Dangerous Document <script>alert("xss")</script>
<img src="x" onerror="stealCookies()"/>

## Section Title

Here is a paragraph with **bold text** and [Safe Link](https://wishmagic.app/legal).
Here is an unsafe link [Unsafe Link](javascript:alert(1)).
`;

    const html = renderPolicyMarkdown(rawMalicious);
    assert.ok(!html.includes('<script>'), 'XSS script tags must be sanitized/escaped');
    assert.ok(html.includes('&lt;script&gt;'), 'Script tags should be safely escaped as text');
    assert.ok(!html.includes('onerror="stealCookies()"'), 'Onerror attributes must not execute');
    assert.ok(html.includes('<strong class="font-bold'), 'Bold text formatted');
    assert.ok(html.includes('href="https://wishmagic.app/legal"'), 'Safe https link preserved');
    assert.ok(!html.includes('href="javascript:'), 'Javascript: pseudo-protocol must NOT be rendered as active link');

    // Table of contents extraction
    const docWithHeadings = `
## 1. Description of Services
Text here
### 1.1 Digital Deliveries
Text here
## 2. Google Authentication
Text here
`;
    const toc = extractTableOfContents(docWithHeadings);
    assert.equal(toc.length, 3);
    assert.equal(toc[0].title, '1. Description of Services');
    assert.equal(toc[0].level, 2);
    assert.equal(toc[1].level, 3);
  });

  // --------------------------------------------------------------------------
  // TEST 5: Publishing Safeguards & Server-Side Validation
  // --------------------------------------------------------------------------
  await t.test('TEST 5: Publishing Safeguards & Validation Enforcements', () => {
    // 1. Invalid policy type
    const resBadType = validatePolicyForPublishing({
      policy_type: 'invalid_type',
      version: '1.0.0',
      title: 'Test Policy',
      content: 'A'.repeat(60)
    });
    assert.equal(resBadType.valid, false);
    assert.ok(resBadType.errors.some(e => e.includes('Invalid policy_type')));

    // 2. Short content (< 50 chars)
    const resShortContent = validatePolicyForPublishing({
      policy_type: POLICY_TYPES.TERMS_OF_SERVICE,
      version: '1.0.0',
      title: 'Terms of Service',
      content: 'Too short.'
    });
    assert.equal(resShortContent.valid, false);
    assert.ok(resShortContent.errors.some(e => e.includes('at least 50 characters')));

    // 3. Duplicate version in already published list
    const existing = [
      { id: 'pol_1', policy_type: POLICY_TYPES.TERMS_OF_SERVICE, version: '1.0.0', status: POLICY_STATUS.PUBLISHED }
    ];
    const resDuplicate = validatePolicyForPublishing({
      id: 'pol_2',
      policy_type: POLICY_TYPES.TERMS_OF_SERVICE,
      version: '1.0.0',
      title: 'Terms of Service v1.0.0',
      content: 'Valid legal content describing terms and services in great detail for tests.'
    }, existing);
    assert.equal(resDuplicate.valid, false);
    assert.ok(resDuplicate.errors.some(e => e.includes('already published and immutable')));

    // 4. Material change requires summary
    const resMissingSummary = validatePolicyForPublishing({
      policy_type: POLICY_TYPES.TERMS_OF_SERVICE,
      version: '2.0.0',
      title: 'Terms v2',
      content: 'Valid long legal content describing updated terms and services in great detail.',
      is_material_change: 1,
      change_summary: ''
    });
    assert.equal(resMissingSummary.valid, false);
    assert.ok(resMissingSummary.errors.some(e => e.includes('requires a concise change summary')));
  });

  // --------------------------------------------------------------------------
  // TEST 6: Policy Draft Creation & Immutability Enforcement
  // --------------------------------------------------------------------------
  await t.test('TEST 6: Draft Lifecycle & Immutability Guard', () => {
    const baseContent = '# Terms of Service\n\nInitial legal text for platform celebrations.';
    const draft = createPolicyDraft({
      policyType: POLICY_TYPES.TERMS_OF_SERVICE,
      title: 'Terms of Service Draft',
      version: '1.1.0',
      content: baseContent,
      createdBy: 'Legal Counsel'
    });

    assert.equal(draft.status, POLICY_STATUS.DRAFT);
    assert.equal(draft.version, '1.1.0');
    assert.ok(draft.id.startsWith('pol_terms_of_service_v1_1_0_'));

    // Editing a draft is allowed
    const updated = updatePolicyDraft(draft, {
      content: baseContent + '\n\nUpdated clause regarding ImgBB storage.'
    });
    assert.notEqual(updated.content_checksum, draft.content_checksum, 'Checksum updates with content changes');

    // Publishing the draft
    const { publishedPolicy, activePointer, checksum } = publishPolicyVersion({
      draft: updated,
      publishedBy: 'Chief Compliance Officer'
    });

    assert.equal(publishedPolicy.status, POLICY_STATUS.PUBLISHED);
    assert.equal(activePointer.current_policy_id, publishedPolicy.id);
    assert.equal(activePointer.current_version, '1.1.0');
    assert.equal(publishedPolicy.content_checksum, checksum);

    // INVARIANT: Attempting to edit an already published policy MUST fail!
    assert.throws(() => {
      updatePolicyDraft(publishedPolicy, { content: 'Illegal mutation of published text' });
    }, /Cannot edit policy in 'published' status/, 'Published policies must be strictly immutable');

    // Retiring a policy version
    const retired = retirePolicyVersion(publishedPolicy, 'Admin');
    assert.equal(retired.status, POLICY_STATUS.RETIRED);
    assert.ok(retired.retired_at);
  });

  // --------------------------------------------------------------------------
  // TEST 7: Version Comparison & Line Diff Engine
  // --------------------------------------------------------------------------
  await t.test('TEST 7: Version Diff Engine', () => {
    const v1Text = 'Line 1: Introduction\nLine 2: Account Rules\nLine 3: Pricing Terms';
    const v2Text = 'Line 1: Introduction\nLine 2: Account Rules (Updated for Google OAuth)\nLine 3: Pricing Terms\nLine 4: Referral Credit Rules';

    const diff = generatePolicyDiff(v1Text, v2Text);
    assert.ok(diff.additions >= 2, 'Should detect added lines');
    assert.ok(diff.deletions >= 1, 'Should detect removed/modified line');
    assert.equal(diff.unchanged, 2, 'Line 1 and Line 3 are unchanged');
    assert.equal(diff.totalLinesOld, 3);
    assert.equal(diff.totalLinesNew, 4);
  });

  // --------------------------------------------------------------------------
  // TEST 8: User Acceptance Recording & History
  // --------------------------------------------------------------------------
  await t.test('TEST 8: User Acceptance Recording & Immutability', () => {
    const record = recordUserAcceptance({
      userId: 'usr_celebration_creator_123',
      policyType: POLICY_TYPES.TERMS_OF_SERVICE,
      policyVersion: '1.0.0',
      policyId: 'pol_tos_v1_0',
      contentChecksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      acceptanceMethod: ACCEPTANCE_METHODS.REGISTRATION,
      clientIp: '192.0.2.1',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    });

    assert.ok(record.id.startsWith('uacc_term_'));
    assert.equal(record.user_id, 'usr_celebration_creator_123');
    assert.equal(record.policy_version, '1.0.0');
    assert.equal(record.acceptance_method, 'REGISTRATION');
    assert.ok(record.accepted_at);
    assert.equal(record.ip_hash.length, 16);
  });

  // --------------------------------------------------------------------------
  // TEST 9: Material Change Re-Consent Evaluation Workflow
  // --------------------------------------------------------------------------
  await t.test('TEST 9: Material Change Re-Consent Evaluation Workflow', () => {
    const activePolicies = {
      [POLICY_TYPES.TERMS_OF_SERVICE]: {
        policy_type: POLICY_TYPES.TERMS_OF_SERVICE,
        current_policy_id: 'pol_tos_v2_0',
        current_version: '2.0.0',
        effective_at: new Date().toISOString()
      },
      [POLICY_TYPES.PRIVACY_POLICY]: {
        policy_type: POLICY_TYPES.PRIVACY_POLICY,
        current_policy_id: 'pol_priv_v1_0',
        current_version: '1.0.0',
        effective_at: new Date().toISOString()
      }
    };

    const policiesList = [
      {
        id: 'pol_tos_v2_0',
        policy_type: POLICY_TYPES.TERMS_OF_SERVICE,
        version: '2.0.0',
        is_material_change: 1, // MATERIAL BUMP!
        change_summary: 'Major update to commercial tiering and liability.',
        status: POLICY_STATUS.PUBLISHED
      },
      {
        id: 'pol_priv_v1_0',
        policy_type: POLICY_TYPES.PRIVACY_POLICY,
        version: '1.0.0',
        is_material_change: 0,
        status: POLICY_STATUS.PUBLISHED
      }
    ];

    // Case A: User has only accepted v1.0.0 of TOS -> Must re-consent to v2.0.0!
    const userAccsOld = [
      { user_id: 'u1', policy_type: POLICY_TYPES.TERMS_OF_SERVICE, policy_version: '1.0.0', accepted_at: '2025-01-01' },
      { user_id: 'u1', policy_type: POLICY_TYPES.PRIVACY_POLICY, policy_version: '1.0.0', accepted_at: '2025-01-01' }
    ];

    const resultA = checkUserReconsentRequirements({
      userId: 'u1',
      userAcceptances: userAccsOld,
      activePolicies,
      policiesList
    });

    assert.equal(resultA.reconsentRequired, true, 'User must re-consent when material change is published');
    assert.equal(resultA.pendingPolicies.length, 1);
    assert.equal(resultA.pendingPolicies[0].policyType, POLICY_TYPES.TERMS_OF_SERVICE);
    assert.equal(resultA.pendingPolicies[0].requiredVersion, '2.0.0');
    assert.equal(resultA.pendingPolicies[0].reason, 'MATERIAL_RECONSENT_REQUIRED');

    // Case B: User has accepted up to v2.0.0 -> Compliant!
    const userAccsUpdated = [
      { user_id: 'u1', policy_type: POLICY_TYPES.TERMS_OF_SERVICE, policy_version: '2.0.0', accepted_at: '2025-02-01' },
      { user_id: 'u1', policy_type: POLICY_TYPES.PRIVACY_POLICY, policy_version: '1.0.0', accepted_at: '2025-01-01' }
    ];

    const resultB = checkUserReconsentRequirements({
      userId: 'u1',
      userAcceptances: userAccsUpdated,
      activePolicies,
      policiesList
    });

    assert.equal(resultB.reconsentRequired, false, 'User is compliant after accepting v2.0.0');
    assert.equal(resultB.pendingPolicies.length, 0);
  });

  // --------------------------------------------------------------------------
  // TEST 10: Granular Cookie Consent Invariants
  // --------------------------------------------------------------------------
  await t.test('TEST 10: Granular Cookie Consent Invariants', () => {
    // Attempting to turn off essential cookies MUST NOT work
    const norm1 = normalizeConsentPreferences({
      essential: 0, // Ignored
      functional: 1,
      analytics: 0,
      marketing: 0
    });
    assert.equal(norm1.essential, 1, 'Invariant: Essential cookies can NEVER be disabled');
    assert.equal(norm1.analytics, 0);

    const record = recordCookieConsent({
      userId: null,
      anonymousToken: 'anon_client_abc',
      preferences: { functional: true, analytics: true, marketing: false },
      clientIp: '198.51.100.4'
    });

    assert.ok(record.id.startsWith('ccons_'));
    assert.equal(record.anonymous_token, 'anon_client_abc');
    assert.equal(record.essential, 1);
    assert.equal(record.functional, 1);
    assert.equal(record.analytics, 1);
    assert.equal(record.marketing, 0);
  });

  // --------------------------------------------------------------------------
  // TEST 11: Grounded Policy Content & Architecture Truthfulness
  // --------------------------------------------------------------------------
  await t.test('TEST 11: Production Policies Grounded in Real Architecture', () => {
    const { policies, activePointers } = buildDefaultLegalPolicies();

    assert.equal(policies.length, 8, 'Must seed all 8 core platform policies');
    assert.equal(Object.keys(activePointers).length, 8);

    const tos = policies.find(p => p.policy_type === POLICY_TYPES.TERMS_OF_SERVICE);
    assert.ok(tos, 'Terms of Service exists');
    assert.ok(tos.content.includes('Google Firebase Authentication'), 'Discloses Google Firebase Auth');
    assert.ok(tos.content.includes('ImgBB'), 'Discloses ImgBB image storage');
    assert.ok(tos.content.includes('Backblaze B2'), 'Discloses Backblaze B2 audio storage');
    assert.ok(tos.content.includes('Razorpay') && tos.content.includes('Stripe'), 'Discloses Razorpay and Stripe gateways');
    assert.ok(tos.content.includes('14-day grace period'), 'Discloses 14-day deletion grace period (Part 37)');
    assert.ok(tos.content.includes('7 years'), 'Discloses 7-year statutory financial retention (Part 37)');

    const priv = policies.find(p => p.policy_type === POLICY_TYPES.PRIVACY_POLICY);
    assert.ok(priv, 'Privacy Policy exists');
    assert.ok(priv.content.includes('Cloudflare (D1 & Pages)'), 'Discloses Cloudflare edge persistence');
    assert.ok(priv.content.includes('GDPR & DPDP Portability'), 'Discloses Article 20 JSON data export (Part 37)');
    assert.ok(priv.content.includes('We do not sell your personal data'), 'Truthful commitment');

    const cookies = policies.find(p => p.policy_type === POLICY_TYPES.COOKIE_POLICY);
    assert.ok(cookies, 'Cookie Notice exists');
    assert.ok(cookies.content.includes('Strictly Necessary (Essential)'), 'Explains essential category');
    assert.ok(cookies.content.includes('Analytics & Performance Cookies (Opt-in)'), 'Identifies opt-in telemetry');
  });

});
