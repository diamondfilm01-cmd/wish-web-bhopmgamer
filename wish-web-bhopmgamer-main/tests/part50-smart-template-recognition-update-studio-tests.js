/**
 * WishMagic Automated Test Suite — Part 50:
 * Smart Template Recognition, Side-by-Side Preview & Safe Update Studio
 *
 * Covers all mandatory verification suites from Section 16:
 * 16.1 Recognition tests (Stable ID, Slug, Same Name Different ID, Shared Assets, Missing ID,
 *      Multiple Matches, Identity Conflict, Invalid Manifest, Unsupported Schema, New Template)
 * 16.2 ZIP security tests (Valid, Corrupt, Path Traversal, Absolute Paths, Duplicate/Case-Collision
 *      Paths, Malicious Filenames, Symlinks, Excessive File Count/Size, Zip Bomb Ratio,
 *      Executable Files, Invalid UTF-8 Encoding, Missing Entry HTML, Invalid JSON, Unsafe References)
 * 16.3 Side-by-Side Preview & Isolation tests (Existing vs Staged rendering, Non-destructive preview,
 *      Missing asset & broken link diagnostics, CSP & Parent-DOM/Cookie isolation, Variant switching)
 * 16.4 Automatic Change Comparison tests (Added/Modified/Unchanged/Removed/Renamed files, Text Diff
 *      with secret redaction, Manifest & UTP v1.2.0 Sections/Subsections/Variants/Fields/Actions diffs,
 *      Destructive-change warnings with exact counts)
 * 16.5 Publishing, Concurrency & Rollback tests (Update Existing, Create New + ID Conflict block,
 *      Cancel Import, State-Machine Bypass Rejection, Storage Failure Recovery, Idempotent Publish,
 *      Optimistic Concurrency / Stale-Version 409 Conflict, Rollback Verification, RBAC Auth Checks)
 * 16.6 Existing-Wish Regression tests (Wish on V1 -> Update to V2 -> Wish on V2 -> Rollback to V1)
 * 16.7 UTP v1.0.0 / v1.1.0 / v1.2.0 Backward & Forward Compatibility tests
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from '../src/vendor/jszip.js';
import worker from '../src/worker.js';
import { DatabaseSync, cleanupSqliteBridge } from '../scripts/sqlite-compat.js';
import { D1MigrationRunner } from '../scripts/migration-runner.js';
import {
  RECOGNITION_OUTCOME,
  IMPORT_SESSION_STATE,
  IMPORT_DECISION_MODE,
  inspectAndValidateTemplateZip,
  recognizeTemplatePackage,
  compareExistingTemplateWithStagedPackage,
  computeUnifiedTextDiff
} from '../src/template-recognition-engine.js';

function createTestD1Env() {
  const sqlite = new DatabaseSync(':memory:');
  const prepare = (sql) => {
    const runWithParams = (params) => {
      const stmt = sqlite.prepare(sql);
      const info = stmt.run(...params);
      return { success: true, meta: { changes: info.changes } };
    };
    const firstWithParams = (params) => {
      const stmt = sqlite.prepare(sql);
      return stmt.get(...params) || null;
    };
    const allWithParams = (params) => {
      const stmt = sqlite.prepare(sql);
      const rows = stmt.all(...params);
      return { success: true, results: rows };
    };
    return {
      bind(...params) {
        return {
          run: async () => runWithParams(params),
          first: async () => firstWithParams(params),
          all: async () => allWithParams(params)
        };
      },
      run: async () => runWithParams([]),
      first: async () => firstWithParams([]),
      all: async () => allWithParams([])
    };
  };

  const db = {
    prepare,
    async batch(statements) {
      const results = [];
      for (const s of statements) {
        results.push(await s.run());
      }
      return results;
    }
  };

  const b2Store = new Map();
  let b2ShouldFail = false;

  const mockB2Provider = {
    bucketName: 'wishmagic-test-bucket',
    setShouldFail(flag) {
      b2ShouldFail = Boolean(flag);
    },
    async putObject({ key, body, contentType, metadata }) {
      if (b2ShouldFail) {
        const err = new Error('Simulated Backblaze B2 storage outage during upload');
        err.code = 'B2_UPLOAD_ERROR';
        throw err;
      }
      const bytes = body instanceof Uint8Array
        ? body
        : (typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body || 0));
      b2Store.set(key, { body: bytes, contentType, metadata });
      return { fileId: `b2_${key.replace(/[^a-zA-Z0-9]/g, '_')}`, key };
    },
    async getObject({ key }) {
      if (!b2Store.has(key)) {
        throw new Error(`B2 key not found: ${key}`);
      }
      return b2Store.get(key);
    },
    async deleteObject({ key }) {
      b2Store.delete(key);
      return { deleted: true };
    }
  };

  const mockImgbbProvider = {
    async uploadImage({ filename }) {
      return {
        provider: 'imgbb',
        providerAssetId: `imgbb_${filename}`,
        displayUrl: `https://i.ibb.co/test/${filename}`,
        originalUrl: `https://i.ibb.co/test/${filename}`,
        thumbnailUrl: `https://i.ibb.co/test/thumb_${filename}`,
        deleteUrl: `https://ibb.co/delete/${filename}`,
        mimeType: 'image/png',
        width: 800,
        height: 600,
        sizeBytes: 1024,
        filename
      };
    },
    async deleteImage() {
      return true;
    }
  };

  const env = {
    DB: db,
    B2_STORAGE_PROVIDER: mockB2Provider,
    IMGBB_PROVIDER: mockImgbbProvider,
    ENVIRONMENT: 'test'
  };

  return { sqlite, db, env, b2Store, mockB2Provider };
}

async function setupMigratedTestEnv() {
  const ctx = createTestD1Env();
  const runner = new D1MigrationRunner(ctx.db);
  await runner.runMigrations();

  // Seed an authenticated admin user & session and a standard non-admin user & session
  const nowIso = new Date().toISOString();
  const futureIso = new Date(Date.now() + 86400000).toISOString();
  await ctx.db.prepare(`
    INSERT OR REPLACE INTO users (id, email, display_name, role, plan, is_premium, status, created_at, updated_at)
    VALUES ('admin_1', 'admin@wishmagic.in', 'Chief Admin', 'admin', 'VIP', 1, 'active', ?, ?)
  `).bind(nowIso, nowIso).run();
  await ctx.db.prepare(`
    INSERT OR REPLACE INTO sessions (id, user_id, token, expires_at, created_at)
    VALUES ('sess_admin_1', 'admin_1', 'tok_admin_part50', ?, ?)
  `).bind(futureIso, nowIso).run();

  await ctx.db.prepare(`
    INSERT OR REPLACE INTO users (id, email, display_name, role, plan, is_premium, status, created_at, updated_at)
    VALUES ('user_regular_1', 'customer@wishmagic.in', 'Regular Customer', 'user', 'Free', 0, 'active', ?, ?)
  `).bind(nowIso, nowIso).run();
  await ctx.db.prepare(`
    INSERT OR REPLACE INTO sessions (id, user_id, token, expires_at, created_at)
    VALUES ('sess_user_1', 'user_regular_1', 'tok_user_part50', ?, ?)
  `).bind(futureIso, nowIso).run();

  return ctx;
}

async function buildTemplateZipBytes({ manifest, indexHtml, css, js, extraFiles = {} }) {
  const zip = new JSZip();
  if (manifest !== null && manifest !== undefined) {
    zip.file('wishmagic.json', typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2));
  }
  if (indexHtml !== null && indexHtml !== undefined) {
    zip.file('index.html', indexHtml);
  }
  if (css !== null && css !== undefined) {
    zip.file('css/style.css', css);
  }
  if (js !== null && js !== undefined) {
    zip.file('js/template.js', js);
  }
  for (const [p, content] of Object.entries(extraFiles)) {
    zip.file(p, content);
  }
  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

function createSampleUtpV12PackageSpec(overrides = {}) {
  const id = overrides.id !== undefined ? overrides.id : 'bro-code-celebration';
  const slug = overrides.slug !== undefined ? overrides.slug : 'bro-code-celebration';
  const name = overrides.name !== undefined ? overrides.name : 'BRO CODE';
  const version = overrides.version || '1.2.0';
  const schemaVersion = overrides.schemaVersion || '1.2.0';
  const includeSecretSection = overrides.includeSecretSection !== false;
  const includeBrotherVariant = overrides.includeBrotherVariant !== false;
  const includeBoyfriendVariant = Boolean(overrides.includeBoyfriendVariant);

  const sections = [
    {
      id: 'hero',
      label: 'Hero Vault Unlock',
      required: true,
      toggleable: false,
      defaultEnabled: true,
      order: 1,
      fields: ['recipient_name', 'hero_title', 'hero_subtitle'],
      actions: ['hero_cta', 'explore_memories_btn'],
      subsections: [
        {
          id: 'hero_badge',
          label: 'Bond Meter Badge',
          required: false,
          toggleable: true,
          defaultEnabled: true,
          order: 1
        },
        {
          id: 'hero_cta_bar',
          label: 'Hero Action Buttons',
          required: false,
          toggleable: true,
          defaultEnabled: true,
          order: 2,
          actions: ['hero_cta', 'explore_memories_btn']
        }
      ]
    },
    {
      id: 'countdown',
      label: 'Celebration Countdown',
      required: false,
      toggleable: true,
      defaultEnabled: true,
      order: 2,
      fields: ['event_date']
    },
    {
      id: 'message',
      label: 'Tribute Letter',
      required: true,
      toggleable: false,
      defaultEnabled: true,
      order: 3,
      fields: ['custom_message', 'sender_name']
    },
    {
      id: 'gallery',
      label: 'Hall of Memories',
      required: false,
      toggleable: true,
      defaultEnabled: true,
      order: 4,
      fields: ['photo_1'],
      subsections: [
        {
          id: 'gallery_featured',
          label: 'Featured Cover Memory',
          required: false,
          toggleable: true,
          defaultEnabled: true,
          order: 1,
          fields: ['photo_1']
        }
      ]
    }
  ];

  if (includeSecretSection) {
    sections.push({
      id: 'secret_message',
      label: 'Classified Vault Note',
      required: false,
      toggleable: true,
      defaultEnabled: true,
      order: 5,
      fields: ['secret_note']
    });
  }

  const fields = [
    { id: 'recipient_name', type: 'text', label: 'Recipient Name', required: true, defaultValue: 'Aarav', section: 'hero' },
    { id: 'hero_title', type: 'text', label: 'Hero Headline', required: false, defaultValue: overrides.heroTitleDefault || 'THE UNBREAKABLE CODE', section: 'hero' },
    { id: 'hero_subtitle', type: 'text', label: 'Hero Subtitle', required: false, defaultValue: 'Legends by loyalty', section: 'hero' },
    { id: 'event_date', type: 'date', label: 'Celebration Date', required: true, defaultValue: '2026-12-25', section: 'countdown' },
    { id: 'custom_message', type: 'textarea', label: 'Personal Message', required: false, defaultValue: 'Here is to every crazy memory!', section: 'message' },
    { id: 'sender_name', type: 'text', label: 'From', required: false, defaultValue: '— Kabir', section: 'message' },
    { id: 'photo_1', type: 'image', label: 'Main Hero Photo', required: false, defaultValue: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600', section: 'gallery', subsection: 'gallery_featured' }
  ];

  if (includeSecretSection) {
    fields.push({ id: 'secret_note', type: 'textarea', label: 'Vault Secret Message', required: false, defaultValue: 'I always have your back 100%.', section: 'secret_message' });
  }

  const actions = [
    {
      id: 'hero_cta',
      label: overrides.ctaLabel || 'Create Your Wish',
      type: 'customizer',
      target: '/customize.html',
      sectionId: 'hero_cta_bar',
      editableLabel: true,
      configurable: true,
      relationshipSpecific: true,
      required: false,
      defaultEnabled: true,
      fallbackBehavior: 'hide'
    },
    {
      id: 'explore_memories_btn',
      label: 'Explore Memories',
      type: 'section',
      target: overrides.exploreTargetSection || 'gallery',
      sectionId: 'hero_cta_bar',
      editableLabel: true,
      configurable: true,
      relationshipSpecific: true,
      required: false,
      defaultEnabled: true,
      fallbackBehavior: 'hide'
    }
  ];

  const variants = [
    {
      id: 'var_best_friend',
      slug: 'best-friend',
      name: 'BRO CODE — Best Friend Edition',
      relationship: 'best_friend',
      relationshipLabel: 'Best Friend',
      entry: 'index.html',
      status: 'published',
      enabled: true,
      isDefault: true,
      order: 1,
      theme: { primary: '#f59e0b', secondary: '#8b5cf6', accent: '#38bdf8', background: '#090d16', text: '#ffffff' },
      messages: {
        hero_title: 'RIDE OR DIE: BEST FRIEND EDITION',
        custom_message: 'Friends by choice, legends by loyalty!'
      },
      visibilityOverrides: includeSecretSection ? { secret_message: true } : {},
      actions: [{ id: 'hero_cta', label: 'Create for Your Best Friend', type: 'customizer', target: '/customize.html' }]
    }
  ];

  if (includeBrotherVariant) {
    variants.push({
      id: 'var_brother',
      slug: 'brother',
      name: 'BRO CODE — Brother Edition',
      relationship: 'brother',
      relationshipLabel: 'Brother',
      entry: 'index.html',
      status: 'published',
      enabled: true,
      isDefault: false,
      order: 2,
      theme: { primary: '#06b6d4', secondary: '#3b82f6', accent: '#fbbf24', background: '#07111e', text: '#ffffff' },
      messages: {
        hero_title: 'BLOOD & LOYALTY: BROTHER EDITION',
        custom_message: 'Day-one teammate, lifelong brother!'
      },
      actions: [{ id: 'hero_cta', label: 'Create for Your Brother', type: 'customizer', target: '/customize.html' }]
    });
  }

  if (includeBoyfriendVariant) {
    variants.push({
      id: 'var_boyfriend',
      slug: 'boyfriend',
      name: 'BRO CODE — Boyfriend Edition',
      relationship: 'boyfriend',
      relationshipLabel: 'Boyfriend',
      entry: 'index.html',
      status: 'published',
      enabled: true,
      isDefault: false,
      order: 3,
      theme: { primary: '#ec4899', secondary: '#8b5cf6', accent: '#fde047', background: '#140824', text: '#ffffff' },
      messages: {
        hero_title: 'MY FAVORITE PERSON: BOYFRIEND EDITION',
        custom_message: 'My best friend and favorite adventure!'
      },
      actions: [{ id: 'hero_cta', label: 'Create for Your Boyfriend', type: 'customizer', target: '/customize.html' }]
    });
  }

  const templateObj = {
    name,
    description: 'High-energy interactive celebration experience.',
    templateVersion: version,
    category: 'birthday',
    tier: 'free',
    price: 0,
    entry: 'index.html'
  };
  if (id !== null) templateObj.id = id;
  if (slug !== null) templateObj.slug = slug;
  if (overrides.updateTarget) templateObj.updateTarget = overrides.updateTarget;

  const manifest = {
    $schema: 'wishmagic-template',
    schemaVersion,
    template: templateObj,
    compatibility: { runtimeApi: '1.2', minimumRuntimeApi: '1.0' },
    files: { entry: 'index.html', styles: ['css/style.css'], scripts: ['js/template.js'] },
    capabilities: ['photos', 'gallery', 'countdown', 'themes', 'sections', 'secretMessage'],
    relationships: variants.map(v => v.relationship),
    sections,
    actions,
    fields,
    variants
  };

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${name}</title>
  <link rel="stylesheet" href="css/style.css"/>
</head>
<body>
  <section data-wm-section="hero">
    <div data-wm-subsection="hero_badge"><span>VIP BOND</span></div>
    <h1 data-wm-field="hero_title" data-wm-type="text">${overrides.heroTitleDefault || 'THE UNBREAKABLE CODE'}</h1>
    <p data-wm-field="hero_subtitle" data-wm-type="text">Legends by loyalty</p>
    <span data-wm-field="recipient_name" data-wm-type="text">Aarav</span>
    <div data-wm-subsection="hero_cta_bar">
      <a data-wm-action="hero_cta" href="/customize.html">${overrides.ctaLabel || 'Create Your Wish'}</a>
      <button data-wm-action="explore_memories_btn" type="button">Explore Memories</button>
    </div>
  </section>
  <section data-wm-section="countdown">
    <span data-wm-field="event_date" data-wm-type="date">2026-12-25</span>
  </section>
  <section data-wm-section="message">
    <p data-wm-field="custom_message" data-wm-type="textarea">Here is to every crazy memory!</p>
    <span data-wm-field="sender_name" data-wm-type="text">— Kabir</span>
  </section>
  <section data-wm-section="gallery">
    <div data-wm-subsection="gallery_featured">
      <img data-wm-field="photo_1" data-wm-type="image" src="https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600" alt="Memory"/>
    </div>
  </section>
  ${includeSecretSection ? `
  <section data-wm-section="secret_message">
    <p data-wm-field="secret_note" data-wm-type="textarea">I always have your back 100%.</p>
  </section>` : ''}
  <script src="/js/wishmagic-template-protocol.js"></script>
  <script src="js/template.js"></script>
</body>
</html>`;

  const css = `:root { --wm-primary: #f59e0b; --wm-secondary: #8b5cf6; --wm-accent: #38bdf8; --wm-bg: #090d16; --wm-text: #ffffff; } body { background: var(--wm-bg); color: var(--wm-text); }`;
  const js = `window.addEventListener('DOMContentLoaded', function() { console.log('Template initialized v${version}'); });`;

  return { manifest, indexHtml, css, js };
}

function uint8ToBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

async function apiRequest(env, path, { method = 'GET', body = null, token = 'tok_admin_part50', headers = {} } = {}) {
  const reqHeaders = {
    Origin: 'https://wishmagic.in',
    Referer: 'https://wishmagic.in/admin-templates.html',
    ...headers
  };
  if (token) {
    reqHeaders.Authorization = `Bearer ${token}`;
    reqHeaders.Cookie = `wm_session=${token}; auth_token=${token}`;
  }
  if (body && typeof body === 'object' && !(body instanceof Uint8Array)) {
    reqHeaders['Content-Type'] = 'application/json';
  }
  const req = new Request(`https://wishmagic.in${path}`, {
    method,
    headers: reqHeaders,
    body: body ? (typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body)) : undefined
  });
  const res = await worker.fetch(req, env, { waitUntil: () => {} });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: res.status, headers: res.headers, text, json, data: json?.data || json };
}

describe('Part 50: Smart Template Recognition, Side-by-Side Preview & Safe Update Studio', () => {
  after(() => {
    try { cleanupSqliteBridge(); } catch (_) {}
  });

  // ==========================================================================
  // 16.1 RECOGNITION TESTS
  // ==========================================================================
  it('16.1 Recognition Engine: accurately classifies all 6 recognition outcomes and never auto-updates on display name or shared asset hashes alone', async () => {
    const { env } = await setupMigratedTestEnv();

    // First register an initial published template ("BRO CODE" / id: tpl_bro_code_celebration / slug: bro-code-celebration)
    const baseSpec = createSampleUtpV12PackageSpec({ version: '1.0.0' });
    const baseZip = await buildTemplateZipBytes({
      ...baseSpec,
      extraFiles: { 'assets/images/shared-star.svg': '<svg><circle r="10"/></svg>' }
    });

    const uploadRes = await apiRequest(env, '/api/templates/upload', {
      method: 'POST',
      body: {
        name: 'BRO CODE',
        slug: 'bro-code-celebration',
        category: 'Birthday',
        tier: 'free',
        price: 0,
        publishImmediately: true,
        zipBase64: uint8ToBase64(baseZip)
      }
    });
    assert.equal(uploadRes.status, 201, `Initial template upload failed: ${uploadRes.text}`);
    const existingTemplateId = uploadRes.data.templateId;
    assert.equal(existingTemplateId, 'tpl_bro-code-celebration');

    // Case 1: Same Stable ID with modified files -> EXACT_EXISTING_IDENTITY
    const modSpec = createSampleUtpV12PackageSpec({
      version: '1.1.0',
      heroTitleDefault: 'UPDATED BRO CODE HEADLINE V1.1',
      ctaLabel: 'Launch Customizer Now'
    });
    const modZip = await buildTemplateZipBytes(modSpec);
    const rec1 = await apiRequest(env, '/api/templates/import-studio/inspect', {
      method: 'POST',
      body: { filename: 'bro-code-v1.1.zip', zipBase64: uint8ToBase64(modZip) }
    });
    assert.equal(rec1.status, 200);
    assert.equal(rec1.data.recognitionOutcome, RECOGNITION_OUTCOME.EXACT_EXISTING_IDENTITY);
    assert.equal(rec1.data.selectedTargetTemplateId, existingTemplateId);
    assert.ok(rec1.data.candidates[0].evidenceCategories.includes('STABLE_TEMPLATE_ID'));

    // Verify no automatic destructive update happened on inspection!
    const liveAfterInspect = await ctxGetTemplateVersion(env, existingTemplateId);
    assert.equal(liveAfterInspect.version_number, 1, 'Inspection must NEVER automatically overwrite or publish a new version');

    // Case 2: Missing Stable ID, Same Slug with modified content -> POSSIBLE_EXISTING_MATCH
    const slugMatchSpec = createSampleUtpV12PackageSpec({
      id: null,
      slug: 'bro-code-celebration',
      version: '1.2.0',
      heroTitleDefault: 'SLUG MATCH UPDATE'
    });
    const slugMatchZip = await buildTemplateZipBytes(slugMatchSpec);
    const rec2 = await apiRequest(env, '/api/templates/import-studio/inspect', {
      method: 'POST',
      body: { filename: 'bro-code-slug-only.zip', zipBase64: uint8ToBase64(slugMatchZip) }
    });
    assert.equal(rec2.status, 200);
    assert.equal(rec2.data.recognitionOutcome, RECOGNITION_OUTCOME.POSSIBLE_EXISTING_MATCH);
    assert.ok(rec2.data.candidates[0].evidenceCategories.includes('EXISTING_SLUG'));

    // Case 3: Same Display Name ("BRO CODE") but DIFFERENT Stable ID and different slug -> NO_EXISTING_MATCH
    const sameNameDiffIdSpec = {
      manifest: {
        $schema: 'wishmagic-template',
        schemaVersion: '1.2.0',
        template: {
          id: 'royal-anniversary-gala',
          slug: 'royal-anniversary-gala',
          name: 'BRO CODE', // Identical display name, completely different stable ID & structure!
          category: 'anniversary',
          entry: 'index.html'
        },
        sections: [{ id: 'hero', label: 'Hero', required: true, toggleable: false, defaultEnabled: true }],
        fields: [{ id: 'recipient_name', type: 'text', label: 'Name', required: true, defaultValue: 'Maya', section: 'hero' }]
      },
      indexHtml: '<!DOCTYPE html><html><head><title>BRO CODE</title></head><body><section data-wm-section="hero"><span data-wm-field="recipient_name" data-wm-type="text">Maya</span></section></body></html>',
      css: ':root { --wm-primary: #fff; }',
      js: ''
    };
    const sameNameZip = await buildTemplateZipBytes(sameNameDiffIdSpec);
    const rec3 = await apiRequest(env, '/api/templates/import-studio/inspect', {
      method: 'POST',
      body: { filename: 'same-name-different-id.zip', zipBase64: uint8ToBase64(sameNameZip) }
    });
    assert.equal(rec3.status, 200);
    assert.equal(
      rec3.data.recognitionOutcome,
      RECOGNITION_OUTCOME.NO_EXISTING_MATCH,
      'Templates with the same display name but a different stable ID must NEVER match as an existing template update'
    );
    assert.equal(rec3.data.candidates.length, 0);

    // Case 4: Different templates sharing assets (identical SVG asset SHA-256 hash, different ID/slug/structure) -> NO_EXISTING_MATCH
    const sharedAssetZip = await buildTemplateZipBytes({
      manifest: {
        $schema: 'wishmagic-template',
        schemaVersion: '1.2.0',
        template: {
          id: 'diwali-lights-festival',
          slug: 'diwali-lights-festival',
          name: 'Diwali Lights Festival',
          category: 'festival',
          entry: 'index.html'
        },
        sections: [{ id: 'hero', label: 'Hero', required: true, toggleable: false, defaultEnabled: true }],
        fields: [{ id: 'recipient_name', type: 'text', label: 'Name', required: true, defaultValue: 'Rohan', section: 'hero' }]
      },
      indexHtml: '<!DOCTYPE html><html><head><title>Diwali Lights</title></head><body><section data-wm-section="hero"><span data-wm-field="recipient_name" data-wm-type="text">Rohan</span><img src="assets/images/shared-star.svg"/></section></body></html>',
      css: ':root { --wm-primary: gold; }',
      js: '',
      extraFiles: { 'assets/images/shared-star.svg': '<svg><circle r="10"/></svg>' }
    });
    const rec4 = await apiRequest(env, '/api/templates/import-studio/inspect', {
      method: 'POST',
      body: { filename: 'shared-asset-different-tpl.zip', zipBase64: uint8ToBase64(sharedAssetZip) }
    });
    assert.equal(rec4.status, 200);
    assert.equal(
      rec4.data.recognitionOutcome,
      RECOGNITION_OUTCOME.NO_EXISTING_MATCH,
      'Shared asset file hashes alone must NEVER cause two different templates to match'
    );

    // Case 5: Missing Stable ID & different slug, but high structural similarity (same sections, fields, variants) -> POSSIBLE_EXISTING_MATCH
    const structSimSpec = createSampleUtpV12PackageSpec({
      id: null,
      slug: 'repackaged-bro-edition',
      name: 'Repackaged Celebration'
    });
    const structSimZip = await buildTemplateZipBytes(structSimSpec);
    const rec5 = await apiRequest(env, '/api/templates/import-studio/inspect', {
      method: 'POST',
      body: { filename: 'structural-similarity.zip', zipBase64: uint8ToBase64(structSimZip) }
    });
    assert.equal(rec5.status, 200);
    assert.equal(rec5.data.recognitionOutcome, RECOGNITION_OUTCOME.POSSIBLE_EXISTING_MATCH);
    assert.ok(rec5.data.candidates[0].evidenceCategories.includes('STRUCTURAL_SIMILARITY'));

    // Case 6: Multiple possible matches -> MULTIPLE_POSSIBLE_MATCHES
    // Register a second structurally similar template under a different ID/slug
    const secondTplSpec = createSampleUtpV12PackageSpec({
      id: 'sister-code-celebration',
      slug: 'sister-code-celebration',
      name: 'SISTER CODE'
    });
    const secondTplZip = await buildTemplateZipBytes(secondTplSpec);
    await apiRequest(env, '/api/templates/upload', {
      method: 'POST',
      body: {
        name: 'SISTER CODE',
        slug: 'sister-code-celebration',
        category: 'Birthday',
        tier: 'free',
        price: 0,
        publishImmediately: true,
        zipBase64: uint8ToBase64(secondTplZip)
      }
    });

    const multiMatchRes = await apiRequest(env, '/api/templates/import-studio/inspect', {
      method: 'POST',
      body: { filename: 'ambiguous-structure.zip', zipBase64: uint8ToBase64(structSimZip) }
    });
    assert.equal(multiMatchRes.status, 200);
    assert.equal(multiMatchRes.data.recognitionOutcome, RECOGNITION_OUTCOME.MULTIPLE_POSSIBLE_MATCHES);
    assert.ok(multiMatchRes.data.candidates.length >= 2, 'Expected at least 2 matching candidates');

    // Case 7: Conflicting IDs (Stable ID belongs to BRO CODE, but slug belongs to SISTER CODE) -> IDENTITY_CONFLICT
    const conflictSpec = createSampleUtpV12PackageSpec({
      id: 'bro-code-celebration',
      slug: 'sister-code-celebration',
      name: 'Conflicting Package'
    });
    const conflictZip = await buildTemplateZipBytes(conflictSpec);
    const rec7 = await apiRequest(env, '/api/templates/import-studio/inspect', {
      method: 'POST',
      body: { filename: 'conflict-package.zip', zipBase64: uint8ToBase64(conflictZip) }
    });
    assert.equal(rec7.status, 200);
    assert.equal(rec7.data.recognitionOutcome, RECOGNITION_OUTCOME.IDENTITY_CONFLICT);
    assert.ok(rec7.data.conflicts.length >= 1);
  });

  // ==========================================================================
  // 16.2 ZIP SECURITY TESTS
  // ==========================================================================
  it('16.2 ZIP Security Pipeline: rejects corrupt archives, path traversal, absolute paths, duplicate/case-colliding paths, symlinks, zip bombs, executables, invalid UTF-8, missing HTML, malformed JSON, unsupported schemas, and unsafe script references', async () => {
    // 1. Corrupt ZIP
    const corruptBytes = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0xFF, 0x00, 0x11, 0x22, 0x33]);
    const resCorrupt = await inspectAndValidateTemplateZip(corruptBytes);
    assert.equal(resCorrupt.valid, false);
    assert.equal(resCorrupt.errorCode, 'ZIP_CORRUPTED');

    // 2. Non-ZIP magic bytes
    const nonZipBytes = new TextEncoder().encode('NOT_A_ZIP_FILE_CONTENT');
    const resNonZip = await inspectAndValidateTemplateZip(nonZipBytes);
    assert.equal(resNonZip.valid, false);
    assert.equal(resNonZip.errorCode, 'ZIP_INVALID_FORMAT');

    // 3. Path traversal (../)
    const zipTraversal = new JSZip();
    zipTraversal.file('index.html', '<html></html>');
    zipTraversal.file('../outside.txt', 'escape');
    const traversalBytes = await zipTraversal.generateAsync({ type: 'uint8array' });
    const resTraversal = await inspectAndValidateTemplateZip(traversalBytes);
    assert.equal(resTraversal.valid, false);
    assert.equal(resTraversal.errorCode, 'ZIP_PATH_TRAVERSAL');

    // 4. Absolute path
    const zipAbs = new JSZip();
    zipAbs.file('index.html', '<html></html>');
    zipAbs.file('C:/Windows/system32/cmd.txt', 'abs');
    const absBytes = await zipAbs.generateAsync({ type: 'uint8array' });
    const resAbs = await inspectAndValidateTemplateZip(absBytes);
    assert.equal(resAbs.valid, false);
    assert.equal(resAbs.errorCode, 'ZIP_ABSOLUTE_PATH');

    // 5. Case-collision / duplicate normalized paths
    const zipCaseCollision = new JSZip();
    zipCaseCollision.file('index.html', '<html><body><span data-wm-field="recipient_name">A</span></body></html>');
    zipCaseCollision.file('assets/Cover.png', new Uint8Array([1, 2, 3]));
    zipCaseCollision.file('assets/cover.png', new Uint8Array([4, 5, 6]));
    const caseBytes = await zipCaseCollision.generateAsync({ type: 'uint8array' });
    const resCase = await inspectAndValidateTemplateZip(caseBytes);
    assert.equal(resCase.valid, false);
    assert.equal(resCase.errorCode, 'ZIP_CASE_COLLISION_PATH');

    // 6. Malicious filename (Windows reserved CON.txt)
    const zipMaliciousName = new JSZip();
    zipMaliciousName.file('index.html', '<html></html>');
    zipMaliciousName.file('assets/CON.txt', 'reserved');
    const malNameBytes = await zipMaliciousName.generateAsync({ type: 'uint8array' });
    const resMalName = await inspectAndValidateTemplateZip(malNameBytes);
    assert.equal(resMalName.valid, false);
    assert.equal(resMalName.errorCode, 'ZIP_MALICIOUS_FILENAME');

    // 7. Symbolic link entry
    const zipSymlink = new JSZip();
    zipSymlink.file('index.html', '<html></html>');
    zipSymlink.file('assets/link.txt', '/etc/passwd', { unixPermissions: 0o120777 });
    const symlinkBytes = await zipSymlink.generateAsync({ type: 'uint8array', platform: 'UNIX' });
    const resSymlink = await inspectAndValidateTemplateZip(symlinkBytes);
    assert.equal(resSymlink.valid, false);
    assert.equal(resSymlink.errorCode, 'ZIP_SYMLINK_NOT_ALLOWED');

    // 8. Excessive file count
    const zipManyFiles = new JSZip();
    zipManyFiles.file('index.html', '<html></html>');
    for (let i = 0; i < 12; i++) {
      zipManyFiles.file(`assets/f_${i}.txt`, 'hi');
    }
    const manyBytes = await zipManyFiles.generateAsync({ type: 'uint8array' });
    const resMany = await inspectAndValidateTemplateZip(manyBytes, { maxFileCount: 5 });
    assert.equal(resMany.valid, false);
    assert.equal(resMany.errorCode, 'ZIP_FILE_COUNT_EXCEEDED');

    // 9. Excessive extracted size
    const zipLarge = new JSZip();
    zipLarge.file('index.html', '<html><body>' + 'A'.repeat(20000) + '</body></html>');
    const largeBytes = await zipLarge.generateAsync({ type: 'uint8array' });
    const resLarge = await inspectAndValidateTemplateZip(largeBytes, { maxUncompressedBytes: 4096 });
    assert.equal(resLarge.valid, false);
    assert.equal(resLarge.errorCode, 'ZIP_TOTAL_SIZE_EXCEEDED');

    // 10. Compression-ratio abuse (Zip bomb check)
    const zipBomb = new JSZip();
    zipBomb.file('index.html', '<html><body>' + '0'.repeat(600 * 1024) + '</body></html>');
    const bombBytes = await zipBomb.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    const resBomb = await inspectAndValidateTemplateZip(bombBytes, { maxCompressionRatio: 10 });
    assert.equal(resBomb.valid, false);
    assert.equal(resBomb.errorCode, 'ZIP_BOMB_DETECTED');

    // 11. Executable / unsupported file type (.php / .exe)
    const zipExec = new JSZip();
    zipExec.file('index.html', '<html></html>');
    zipExec.file('backdoor.php', '<?php system($_GET["cmd"]); ?>');
    const execBytes = await zipExec.generateAsync({ type: 'uint8array' });
    const resExec = await inspectAndValidateTemplateZip(execBytes);
    assert.equal(resExec.valid, false);
    assert.equal(resExec.errorCode, 'ZIP_UNSUPPORTED_FILE_TYPE');

    // 12. Invalid UTF-8 encoding in text file
    const zipBadUtf8 = new JSZip();
    zipBadUtf8.file('index.html', new Uint8Array([0xFF, 0xFE, 0xFD, 0x80, 0x81]));
    const badUtf8Bytes = await zipBadUtf8.generateAsync({ type: 'uint8array' });
    const resBadUtf8 = await inspectAndValidateTemplateZip(badUtf8Bytes);
    assert.equal(resBadUtf8.valid, false);
    assert.equal(resBadUtf8.errorCode, 'ZIP_INVALID_ENCODING');

    // 13. Missing entry HTML
    const zipNoHtml = new JSZip();
    zipNoHtml.file('wishmagic.json', JSON.stringify({ schemaVersion: '1.2.0', template: { id: 'no-html', name: 'No HTML' } }));
    zipNoHtml.file('css/style.css', 'body {}');
    const noHtmlBytes = await zipNoHtml.generateAsync({ type: 'uint8array' });
    const resNoHtml = await inspectAndValidateTemplateZip(noHtmlBytes);
    assert.equal(resNoHtml.valid, false);
    assert.equal(resNoHtml.errorCode, 'ENTRY_POINT_MISSING');

    // 14. Malformed JSON in wishmagic.json
    const zipBadJson = await buildTemplateZipBytes({
      manifest: '{ "schemaVersion": "1.2.0", broken json here ',
      indexHtml: '<!DOCTYPE html><html><body></body></html>'
    });
    const resBadJson = await inspectAndValidateTemplateZip(zipBadJson);
    assert.equal(resBadJson.valid, false);
    assert.equal(resBadJson.errorCode, 'INVALID_MANIFEST_JSON');

    // 15. Unsupported schemaVersion
    const zipUnsupportedSchema = await buildTemplateZipBytes({
      manifest: { schemaVersion: '9.9.0', template: { id: 'future-tpl', name: 'Future' } },
      indexHtml: '<!DOCTYPE html><html><body></body></html>'
    });
    const resUnsupported = await inspectAndValidateTemplateZip(zipUnsupportedSchema);
    assert.equal(resUnsupported.valid, false);
    assert.equal(resUnsupported.errorCode, 'UNSUPPORTED_SCHEMA_VERSION');

    // 16. Unsafe script attempting parent-window access
    const zipParentAccess = await buildTemplateZipBytes({
      manifest: createSampleUtpV12PackageSpec().manifest,
      indexHtml: createSampleUtpV12PackageSpec().indexHtml,
      css: ':root {}',
      js: 'const stolen = window.parent.document.cookie;'
    });
    const resParentAccess = await inspectAndValidateTemplateZip(zipParentAccess);
    assert.equal(resParentAccess.valid, false);
    assert.equal(resParentAccess.errorCode, 'PARENT_WINDOW_ACCESS_ATTEMPT');
  });

  // ==========================================================================
  // 16.3 SIDE-BY-SIDE PREVIEW & SECURITY ISOLATION TESTS
  // ==========================================================================
  it('16.3 Side-by-Side Preview & Isolation: renders existing and staged previews independently with strict CSP, variant switching, missing-asset diagnostics, and parent-state isolation', async () => {
    const { env } = await setupMigratedTestEnv();

    // Publish V1 of BRO CODE
    const v1Spec = createSampleUtpV12PackageSpec({
      version: '1.0.0',
      heroTitleDefault: 'LIVE V1 HERO TITLE'
    });
    const v1Zip = await buildTemplateZipBytes(v1Spec);
    const upRes = await apiRequest(env, '/api/templates/upload', {
      method: 'POST',
      body: {
        name: 'BRO CODE',
        slug: 'bro-code-celebration',
        category: 'Birthday',
        publishImmediately: true,
        zipBase64: uint8ToBase64(v1Zip)
      }
    });
    assert.equal(upRes.status, 201);

    // Stage V2 with a new variant (Boyfriend), modified hero title, a missing image warning, and a broken anchor warning
    const v2Spec = createSampleUtpV12PackageSpec({
      version: '1.2.0',
      heroTitleDefault: 'STAGED V2 HERO TITLE',
      includeBoyfriendVariant: true
    });
    const v2HtmlWithMissingAsset = v2Spec.indexHtml.replace(
      '</body>',
      '<img src="assets/images/nonexistent-preview-test.png" alt="Missing"/><a href="#missing_anchor_target">Broken Link</a></body>'
    );
    const v2Zip = await buildTemplateZipBytes({
      ...v2Spec,
      indexHtml: v2HtmlWithMissingAsset
    });

    const inspectRes = await apiRequest(env, '/api/templates/import-studio/inspect', {
      method: 'POST',
      body: { filename: 'bro-code-v1.2-preview.zip', zipBase64: uint8ToBase64(v2Zip) }
    });
    assert.equal(inspectRes.status, 200);
    const sessionId = inspectRes.data.sessionId;

    // Verify missing asset & broken link are reported in previewDiagnostics
    const diag = inspectRes.data.validation.previewDiagnostics;
    assert.ok(diag.missingAssets.some(a => a.path.includes('nonexistent-preview-test.png')), 'Missing media asset must be reported in preview diagnostics');
    assert.ok(diag.brokenLinks.some(b => b.target === '#missing_anchor_target'), 'Broken internal anchor must be reported in preview diagnostics');

    // Verify variantCatalog marks boyfriend as NEW_ONLY and brother/best-friend as SHARED
    const varCat = inspectRes.data.comparison.variantCatalog;
    const bfEntry = varCat.find(v => v.slug === 'boyfriend');
    const broEntry = varCat.find(v => v.slug === 'brother');
    assert.equal(bfEntry?.statusBadge, 'NEW_ONLY');
    assert.equal(broEntry?.statusBadge, 'SHARED');

    // Fetch Left Panel (Existing Published V1) preview
    const existingPreviewRes = await apiRequest(
      env,
      `/api/templates/import-studio/${sessionId}/preview/existing/index.html?rel=brother`
    );
    assert.equal(existingPreviewRes.status, 200);
    assert.ok(existingPreviewRes.text.includes('BLOOD & LOYALTY: BROTHER EDITION'));
    assert.ok(existingPreviewRes.headers.get('content-security-policy')?.includes("connect-src 'none'"));
    assert.equal(existingPreviewRes.headers.get('x-frame-options'), 'SAMEORIGIN');

    // Fetch Right Panel (Staged Uploaded V2) preview for the new Boyfriend variant
    const stagedPreviewRes = await apiRequest(
      env,
      `/api/templates/import-studio/${sessionId}/preview/staged/index.html?rel=boyfriend`
    );
    assert.equal(stagedPreviewRes.status, 200);
    assert.ok(stagedPreviewRes.text.includes('MY FAVORITE PERSON: BOYFRIEND EDITION'));
    assert.ok(stagedPreviewRes.text.includes('Security Isolation: Access to parent/top window state is prohibited'));

    // Requesting Boyfriend variant on Existing V1 (where it does not exist) returns 422 explanation
    const missingVarOnExisting = await apiRequest(
      env,
      `/api/templates/import-studio/${sessionId}/preview/existing/index.html?rel=boyfriend`
    );
    assert.equal(missingVarOnExisting.status, 422);
    assert.ok(missingVarOnExisting.text.includes('Variant Not Present in Existing Published Version'));

    // Verify unauthenticated / non-admin cannot read private staged preview
    const unauthPreview = await apiRequest(
      env,
      `/api/templates/import-studio/${sessionId}/preview/staged/index.html`,
      { token: null }
    );
    assert.equal(unauthPreview.status, 403);
  });

  // ==========================================================================
  // 16.4 AUTOMATIC CHANGE COMPARISON TESTS
  // ==========================================================================
  it('16.4 Change Comparison Engine: accurately detects added/modified/unchanged/removed/renamed files, redacts secrets in text diffs, and generates destructive-change warnings with exact counts', async () => {
    const v1Spec = createSampleUtpV12PackageSpec({
      version: '1.0.0',
      includeSecretSection: true,
      includeBrotherVariant: true
    });
    const v1Zip = await buildTemplateZipBytes({
      ...v1Spec,
      extraFiles: {
        'assets/images/old-name.svg': '<svg id="identical-content-for-rename"></svg>',
        'assets/images/deleted-banner.svg': '<svg id="to-be-removed"></svg>'
      }
    });
    const v1Inspection = await inspectAndValidateTemplateZip(v1Zip);

    // Build V2 where:
    // - secret_message section is removed (5 top sections -> 4 top sections)
    // - brother variant is removed
    // - explore_memories_btn points to removed section 'secret_message'
    // - old-name.svg is renamed to new-name.svg with identical SHA-256 content
    // - deleted-banner.svg is removed
    // - assets/images/brand-new.svg is added
    const v2Spec = createSampleUtpV12PackageSpec({
      version: '1.1.0',
      includeSecretSection: false,
      includeBrotherVariant: false,
      exploreTargetSection: 'secret_message',
      heroTitleDefault: 'MODIFIED HERO V2'
    });
    // Temporarily bypass blocking action target error on v2Inspection just to test comparison engine directly
    const v2Zip = await buildTemplateZipBytes({
      ...v2Spec,
      extraFiles: {
        'assets/images/new-name.svg': '<svg id="identical-content-for-rename"></svg>',
        'assets/images/brand-new.svg': '<svg id="added-file"></svg>'
      }
    });
    const v2Inspection = await inspectAndValidateTemplateZip(v2Zip);

    const existingContext = {
      template: {
        id: 'tpl_bro-code-celebration',
        name: 'BRO CODE',
        slug: 'bro-code-celebration',
        current_version_id: 'ver_v1',
        lock_version: 1,
        sections: JSON.stringify(v1Spec.manifest.sections),
        detected_fields: JSON.stringify(v1Spec.manifest.fields),
        actions_json: JSON.stringify(v1Spec.manifest.actions),
        variants_json: JSON.stringify(v1Spec.manifest.variants)
      },
      version: {
        id: 'ver_v1',
        version_number: 1,
        version_label: 'v1.0.0',
        manifest_json: JSON.stringify(v1Spec.manifest),
        sections: JSON.stringify(v1Spec.manifest.sections),
        fields_json: JSON.stringify(v1Spec.manifest.fields),
        actions_json: JSON.stringify(v1Spec.manifest.actions),
        variants_json: JSON.stringify(v1Spec.manifest.variants)
      },
      files: v1Inspection.fileRecords.map(fr => ({
        ...fr,
        text: v1Inspection.files.get(fr.relativePath)?.text || null
      })),
      variants: v1Spec.manifest.variants,
      fileContentsMap: new Map()
    };

    const comp = compareExistingTemplateWithStagedPackage(existingContext, v2Inspection);

    // Verify file classification counts
    assert.equal(comp.files.summary.renamedCount, 1, 'Exact SHA-256 match between old-name.svg and new-name.svg must be detected as 1 renamed file');
    assert.equal(comp.files.renamed[0].oldPath, 'assets/images/old-name.svg');
    assert.equal(comp.files.renamed[0].newPath, 'assets/images/new-name.svg');
    assert.equal(comp.files.summary.addedCount, 1, 'brand-new.svg should be counted as 1 added file');
    assert.equal(comp.files.summary.removedCount, 1, 'deleted-banner.svg should be counted as 1 removed file');
    assert.ok(comp.files.summary.modifiedCount >= 2, 'index.html and wishmagic.json should be counted as modified');
    assert.ok(comp.files.summary.unchangedCount >= 1, 'css/style.css should be counted as unchanged');

    // Verify section & variant diff counts and destructive warnings
    assert.equal(comp.manifestDiff.sections.existingCount, 5);
    assert.equal(comp.manifestDiff.sections.newCount, 4);
    assert.ok(comp.destructiveWarnings.some(w => w.code === 'SECTIONS_REMOVED' && w.message.includes('5 section(s); the new package declares 4')));
    assert.ok(comp.destructiveWarnings.some(w => w.code === 'VARIANT_REMOVED' && w.message.includes('brother')));
    assert.ok(comp.destructiveWarnings.some(w => w.code === 'ACTION_TARGET_MISSING' && w.message.includes('secret_message')));

    // Verify secret redaction in unified text diff
    const diffWithSecret = computeUnifiedTextDiff(
      'const apiKey = "sk_live_123456789";',
      'const apiKey = "sk_live_987654321";',
      'js/template.js'
    );
    assert.ok(!diffWithSecret.diffText.includes('sk_live_123456789'), 'Secrets must be redacted in diff output');
    assert.ok(diffWithSecret.diffText.includes('[REDACTED_SECRET]'));
  });

  // ==========================================================================
  // 16.5 PUBLISHING, CONCURRENCY, ROLLBACK & AUTHORIZATION TESTS
  // ==========================================================================
  it('16.5 Publishing, Concurrency, Rollback & Auth: enforces RBAC, state machine, ID conflict blocking, optimistic concurrency, storage failure rollback, and version rollback', async () => {
    const { env, mockB2Provider } = await setupMigratedTestEnv();

    // 1. Upload initial V1 template
    const v1Spec = createSampleUtpV12PackageSpec({ version: '1.0.0' });
    const v1Zip = await buildTemplateZipBytes(v1Spec);
    const initUp = await apiRequest(env, '/api/templates/upload', {
      method: 'POST',
      body: {
        name: 'BRO CODE',
        slug: 'bro-code-celebration',
        category: 'Birthday',
        tier: 'vip',
        price: 59,
        publishImmediately: true,
        zipBase64: uint8ToBase64(v1Zip)
      }
    });
    assert.equal(initUp.status, 201);
    const tplId = initUp.data.templateId;
    const v1VersionId = initUp.data.versionId;

    // 2. Unauthorized user (non-admin) cannot inspect, validate, publish, or rollback
    const nonAdminInspect = await apiRequest(env, '/api/templates/import-studio/inspect', {
      method: 'POST',
      token: 'tok_user_part50',
      body: { filename: 'unauth.zip', zipBase64: uint8ToBase64(v1Zip) }
    });
    assert.equal(nonAdminInspect.status, 403, 'Non-admin user must be blocked with 403');

    // 3. Stage V2 package
    const v2Spec = createSampleUtpV12PackageSpec({
      version: '1.1.0',
      heroTitleDefault: 'V2 UPDATED HEADLINE',
      includeBoyfriendVariant: true
    });
    const v2Zip = await buildTemplateZipBytes(v2Spec);
    const stageRes = await apiRequest(env, '/api/templates/import-studio/inspect', {
      method: 'POST',
      body: { filename: 'bro-code-v1.1.zip', zipBase64: uint8ToBase64(v2Zip) }
    });
    assert.equal(stageRes.status, 200);
    const sessionId = stageRes.data.sessionId;

    // 4. Attempting to call /publish BEFORE /validate (bypassing state machine) must be rejected!
    const prematurePub = await apiRequest(env, `/api/templates/import-studio/${sessionId}/publish`, {
      method: 'POST',
      body: {}
    });
    assert.equal(prematurePub.status, 400);
    assert.equal(prematurePub.json.error.code, 'INVALID_IMPORT_STATE_FOR_PUBLISH');

    // 5. Choosing "Create New Template" without changing the stable ID when the ID is already owned by BRO CODE must be blocked (409 STABLE_ID_ALREADY_OWNED)
    const conflictCreateNew = await apiRequest(env, `/api/templates/import-studio/${sessionId}/validate`, {
      method: 'POST',
      body: { decisionMode: 'create_new' }
    });
    assert.equal(conflictCreateNew.status, 409);
    assert.equal(conflictCreateNew.json.error.code, 'STABLE_ID_ALREADY_OWNED');

    // 6. Validate "Update Existing Template"
    const valUpdate = await apiRequest(env, `/api/templates/import-studio/${sessionId}/validate`, {
      method: 'POST',
      body: {
        decisionMode: 'update_existing',
        targetTemplateId: tplId
      }
    });
    assert.equal(valUpdate.status, 200);
    assert.equal(valUpdate.data.state, IMPORT_SESSION_STATE.READY_TO_PUBLISH);

    // 7. Test Stale-Version / Optimistic Concurrency Conflict (409) when wrong expectedLockVersion is supplied
    const staleLockPub = await apiRequest(env, `/api/templates/import-studio/${sessionId}/publish`, {
      method: 'POST',
      body: { expectedLockVersion: 999 }
    });
    assert.equal(staleLockPub.status, 409);
    assert.equal(staleLockPub.json.error.code, 'CONCURRENCY_CONFLICT');

    // 8. Test Storage Failure during publication preserves V1 as active!
    mockB2Provider.setShouldFail(true);
    const failedStoragePub = await apiRequest(env, `/api/templates/import-studio/${sessionId}/publish`, {
      method: 'POST',
      body: { expectedLockVersion: valUpdate.data.baseTemplateLockVersion }
    });
    assert.equal(failedStoragePub.status, 400);
    mockB2Provider.setShouldFail(false);

    const activeAfterFailure = await ctxGetTemplateVersion(env, tplId);
    assert.equal(activeAfterFailure.id, v1VersionId, 'Old published version V1 must remain active when B2 upload fails');

    // Re-validate session after failure and publish V2 cleanly
    await apiRequest(env, `/api/templates/import-studio/${sessionId}/validate`, {
      method: 'POST',
      body: { decisionMode: 'update_existing', targetTemplateId: tplId }
    });
    const pubV2 = await apiRequest(env, `/api/templates/import-studio/${sessionId}/publish`, {
      method: 'POST',
      body: {
        expectedLockVersion: valUpdate.data.baseTemplateLockVersion,
        releaseNotes: 'Added Boyfriend edition and updated hero headline'
      }
    });
    assert.equal(pubV2.status, 200, `Publish V2 failed: ${pubV2.text}`);
    assert.equal(pubV2.data.state, IMPORT_SESSION_STATE.PUBLISHED);
    const v2VersionId = pubV2.data.publishedVersionId;
    assert.notEqual(v2VersionId, v1VersionId);
    assert.equal(pubV2.data.previousVersionId, v1VersionId);
    assert.equal(pubV2.data.rollbackAvailable, true);

    // 9. Duplicate publish request is handled idempotently
    const dupPub = await apiRequest(env, `/api/templates/import-studio/${sessionId}/publish`, {
      method: 'POST',
      body: {}
    });
    assert.equal(dupPub.status, 200);
    assert.equal(dupPub.data.alreadyPublished, true);

    // 10. Test Cancel Import on a separate staged session
    const cancelStage = await apiRequest(env, '/api/templates/import-studio/inspect', {
      method: 'POST',
      body: { filename: 'to-cancel.zip', zipBase64: uint8ToBase64(v2Zip) }
    });
    const cancelRes = await apiRequest(env, `/api/templates/import-studio/${cancelStage.data.sessionId}/cancel`, {
      method: 'POST'
    });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.data.state, IMPORT_SESSION_STATE.CANCELLED);

    // 11. Test Create New Template with a unique ID & slug
    const createStage = await apiRequest(env, '/api/templates/import-studio/inspect', {
      method: 'POST',
      body: { filename: 'create-new-branch.zip', zipBase64: uint8ToBase64(v2Zip) }
    });
    const valCreate = await apiRequest(env, `/api/templates/import-studio/${createStage.data.sessionId}/validate`, {
      method: 'POST',
      body: {
        decisionMode: 'create_new',
        newTemplateId: 'tpl_bro_code_deluxe',
        newTemplateSlug: 'bro-code-deluxe',
        newTemplateName: 'BRO CODE DELUXE'
      }
    });
    assert.equal(valCreate.status, 200);
    const pubCreate = await apiRequest(env, `/api/templates/import-studio/${createStage.data.sessionId}/publish`, {
      method: 'POST',
      body: {}
    });
    assert.equal(pubCreate.status, 200);
    assert.equal(pubCreate.data.publishedTemplateId, 'tpl_bro_code_deluxe');
  });

  // ==========================================================================
  // 16.6 EXISTING-WISH REGRESSION & ROLLBACK TESTS
  // ==========================================================================
  it('16.6 Existing-Wish Immutability & Rollback Regression: existing wish on V1 stays intact when V2 is published and when rolled back to V1', async () => {
    const { env } = await setupMigratedTestEnv();

    // 1. Upload and publish V1 (which has `secret_message` section enabled)
    const v1Spec = createSampleUtpV12PackageSpec({
      id: 'eternal-bond-tribute',
      slug: 'eternal-bond-tribute',
      name: 'Eternal Bond Tribute',
      version: '1.0.0',
      includeSecretSection: true
    });
    const v1Zip = await buildTemplateZipBytes(v1Spec);
    const v1Up = await apiRequest(env, '/api/templates/upload', {
      method: 'POST',
      body: {
        name: 'Eternal Bond Tribute',
        slug: 'eternal-bond-tribute',
        category: 'Birthday',
        tier: 'free',
        price: 0,
        publishImmediately: true,
        zipBase64: uint8ToBase64(v1Zip)
      }
    });
    assert.equal(v1Up.status, 201);
    const tplId = v1Up.data.templateId;
    const v1Id = v1Up.data.versionId;

    // 2. Customer creates and publishes Wish #1 on V1
    const wish1Res = await apiRequest(env, '/api/wishes', {
      method: 'POST',
      token: 'tok_user_part50',
      body: {
        templateId: tplId,
        recipientName: 'Rohan V1',
        buyerName: 'Kabir',
        eventDate: '2026-10-17',
        status: 'published',
        customData: {
          recipient_name: 'Rohan V1',
          sender_name: 'Kabir',
          event_date: '2026-10-17',
          custom_message: 'Original V1 tribute message!',
          secret_note: 'Top secret V1 vault note!',
          relationship: 'best_friend'
        }
      }
    });
    assert.equal(wish1Res.status, 201, `Wish 1 creation failed: ${wish1Res.text}`);
    const wish1Slug = wish1Res.data.slug;
    assert.equal(wish1Res.data.templateVersionId, v1Id);

    // 3. Admin uploads and publishes V2 via Smart Import Studio (removing `secret_message` section)
    const v2Spec = createSampleUtpV12PackageSpec({
      id: 'eternal-bond-tribute',
      slug: 'eternal-bond-tribute',
      name: 'Eternal Bond Tribute',
      version: '1.1.0',
      includeSecretSection: false,
      heroTitleDefault: 'ETERNAL BOND V2'
    });
    const v2Zip = await buildTemplateZipBytes(v2Spec);
    const stageV2 = await apiRequest(env, '/api/templates/import-studio/inspect', {
      method: 'POST',
      body: { filename: 'eternal-bond-v1.1.zip', zipBase64: uint8ToBase64(v2Zip) }
    });
    assert.equal(stageV2.status, 200);
    const sId = stageV2.data.sessionId;

    // Because V2 removes `secret_message`, validation requires `warningsAcknowledged: true`
    const valWithoutAck = await apiRequest(env, `/api/templates/import-studio/${sId}/validate`, {
      method: 'POST',
      body: { decisionMode: 'update_existing', targetTemplateId: tplId, warningsAcknowledged: false }
    });
    assert.equal(valWithoutAck.status, 400);
    assert.equal(valWithoutAck.json.error.code, 'DESTRUCTIVE_WARNINGS_REQUIRE_ACKNOWLEDGMENT');

    const valWithAck = await apiRequest(env, `/api/templates/import-studio/${sId}/validate`, {
      method: 'POST',
      body: { decisionMode: 'update_existing', targetTemplateId: tplId, warningsAcknowledged: true }
    });
    assert.equal(valWithAck.status, 200);

    const pubV2 = await apiRequest(env, `/api/templates/import-studio/${sId}/publish`, {
      method: 'POST',
      body: { warningsAcknowledged: true, releaseNotes: 'Removed secret_message in V2' }
    });
    assert.equal(pubV2.status, 200);
    const v2Id = pubV2.data.publishedVersionId;
    assert.notEqual(v2Id, v1Id);

    // 4. Customer creates Wish #2 after V2 becomes active
    const wish2Res = await apiRequest(env, '/api/wishes', {
      method: 'POST',
      token: 'tok_user_part50',
      body: {
        templateId: tplId,
        recipientName: 'Aarav V2',
        buyerName: 'Kabir',
        eventDate: '2026-10-17',
        status: 'published',
        customData: {
          recipient_name: 'Aarav V2',
          sender_name: 'Kabir',
          event_date: '2026-10-17',
          custom_message: 'New V2 tribute message!',
          secret_note: 'Should be stripped in V2 because secret_message was removed',
          relationship: 'best_friend'
        }
      }
    });
    assert.equal(wish2Res.status, 201);
    const wish2Slug = wish2Res.data.slug;
    assert.equal(wish2Res.data.templateVersionId, v2Id, 'New Wish #2 must use V2');

    // 5. Verify Wish #1 (created on V1) still retains V1, its secret_note, and its original snapshot!
    const wish1Fetch = await apiRequest(env, `/api/public/wishes/${wish1Slug}`, { token: null });
    assert.equal(wish1Fetch.status, 200);
    const w1Obj = wish1Fetch.data.wish || wish1Fetch.data;
    assert.equal(w1Obj.templateVersionId, v1Id, 'Existing Wish #1 must retain V1');
    assert.equal(w1Obj.customData.recipient_name, 'Rohan V1');
    assert.equal(w1Obj.customData.secret_note, 'Top secret V1 vault note!', 'Wish #1 personalized secret_note must remain intact');
    const w1Snap = w1Obj.publishedConfigSnapshot || w1Obj.effectiveConfig;
    assert.equal(w1Snap.visibilityMap.secret_message, true, 'Wish #1 snapshot must still have secret_message enabled');

    // 6. Rollback template from V2 back to V1
    const versionsListRes = await apiRequest(env, `/api/templates/${tplId}/versions`);
    assert.equal(versionsListRes.status, 200);
    assert.equal(versionsListRes.data.versions.length, 2);
    const v1Entry = versionsListRes.data.versions.find(v => v.id === v1Id);
    assert.equal(v1Entry.rollbackAvailable, true);

    const rbRes = await apiRequest(env, `/api/templates/${tplId}/versions/${v1Id}/rollback`, {
      method: 'POST'
    });
    assert.equal(rbRes.status, 200);
    assert.equal(rbRes.data.targetVersionId, v1Id);
    assert.equal(rbRes.data.rolledBackFromVersionId, v2Id);

    // Verify V2 was NOT deleted on rollback
    const versionsAfterRb = await apiRequest(env, `/api/templates/${tplId}/versions`);
    assert.equal(versionsAfterRb.data.versions.length, 2, 'Newer version V2 must be preserved in version history after rollback');

    // 7. Create Wish #3 after rollback -> must use V1!
    const wish3Res = await apiRequest(env, '/api/wishes', {
      method: 'POST',
      token: 'tok_user_part50',
      body: {
        templateId: tplId,
        recipientName: 'Vikram Post-Rollback',
        buyerName: 'Kabir',
        eventDate: '2026-10-17',
        status: 'published',
        customData: {
          recipient_name: 'Vikram Post-Rollback',
          event_date: '2026-10-17',
          secret_note: 'Restored secret note on V1!'
        }
      }
    });
    assert.equal(wish3Res.status, 201);
    assert.equal(wish3Res.data.templateVersionId, v1Id, 'Future Wish #3 after rollback must use rolled-back version V1');

    // Verify both Wish #1 and Wish #2 are still uncorrupted
    const wish1AfterRb = await apiRequest(env, `/api/public/wishes/${wish1Slug}`, { token: null });
    const wish2AfterRb = await apiRequest(env, `/api/public/wishes/${wish2Slug}`, { token: null });
    assert.equal((wish1AfterRb.data.wish || wish1AfterRb.data).templateVersionId, v1Id);
    assert.equal((wish2AfterRb.data.wish || wish2AfterRb.data).templateVersionId, v2Id);
  });

  // ==========================================================================
  // 16.7 UTP v1.0.0 / v1.1.0 / v1.2.0 COMPATIBILITY TESTS
  // ==========================================================================
  it('16.7 UTP Compatibility: supports legacy v1.0.0 packages without variants/actions alongside UTP v1.1.0 and v1.2.0 packages', async () => {
    const { env } = await setupMigratedTestEnv();

    // 1. Legacy UTP v1.0.0 package (no variants, no actions, flat sections)
    const legacyZip = await buildTemplateZipBytes({
      manifest: {
        schemaVersion: '1.0.0',
        template: {
          id: 'classic-birthday-card',
          slug: 'classic-birthday-card',
          name: 'Classic Birthday Card',
          category: 'birthday',
          entry: 'index.html'
        },
        sections: ['hero', 'message'],
        fields: [
          { id: 'recipient_name', type: 'text', label: 'Recipient Name', required: true, defaultValue: 'Priya' },
          { id: 'custom_message', type: 'textarea', label: 'Message', required: false, defaultValue: 'Happy Birthday!' }
        ]
      },
      indexHtml: `<!DOCTYPE html><html><head><title>Classic Birthday</title><link rel="stylesheet" href="css/style.css"/></head><body>
        <section data-wm-section="hero"><h1 data-wm-field="recipient_name" data-wm-type="text">Priya</h1></section>
        <section data-wm-section="message"><p data-wm-field="custom_message" data-wm-type="textarea">Happy Birthday!</p></section>
        <script src="js/template.js"></script>
      </body></html>`,
      css: ':root { --wm-primary: #ec4899; }',
      js: 'console.log("legacy v1.0.0");'
    });

    const inspectLegacy = await apiRequest(env, '/api/templates/import-studio/inspect', {
      method: 'POST',
      body: { filename: 'classic-v1.0.zip', zipBase64: uint8ToBase64(legacyZip) }
    });
    assert.equal(inspectLegacy.status, 200);
    assert.equal(inspectLegacy.data.validation.valid, true);
    assert.equal(inspectLegacy.data.packageMetadata.schemaVersion, '1.0.0');
    assert.equal(inspectLegacy.data.packageMetadata.isLegacyPackage, true, 'Legacy v1.0.0 package must be accurately identified as legacy rather than falsely labeled v1.2.0');

    // Validate and publish legacy v1.0.0 template via studio
    await apiRequest(env, `/api/templates/import-studio/${inspectLegacy.data.sessionId}/validate`, {
      method: 'POST',
      body: {
        decisionMode: 'create_new',
        newTemplateId: 'tpl_classic_birthday_card',
        newTemplateSlug: 'classic-birthday-card',
        newTemplateName: 'Classic Birthday Card'
      }
    });
    const pubLegacy = await apiRequest(env, `/api/templates/import-studio/${inspectLegacy.data.sessionId}/publish`, {
      method: 'POST',
      body: {}
    });
    assert.equal(pubLegacy.status, 200);

    // 2. Upgrade the legacy v1.0.0 template to UTP v1.2.0 with nested subsections, variants, and configurable actions
    const upgradedSpec = createSampleUtpV12PackageSpec({
      id: 'classic-birthday-card',
      slug: 'classic-birthday-card',
      name: 'Classic Birthday Card (UTP v1.2 Upgrade)',
      version: '1.2.0',
      schemaVersion: '1.2.0'
    });
    const upgradedZip = await buildTemplateZipBytes(upgradedSpec);

    const inspectUpgrade = await apiRequest(env, '/api/templates/import-studio/inspect', {
      method: 'POST',
      body: { filename: 'classic-v1.2-upgrade.zip', zipBase64: uint8ToBase64(upgradedZip) }
    });
    assert.equal(inspectUpgrade.status, 200);
    assert.equal(inspectUpgrade.data.recognitionOutcome, RECOGNITION_OUTCOME.EXACT_EXISTING_IDENTITY);
    assert.equal(inspectUpgrade.data.packageMetadata.schemaVersion, '1.2.0');
    assert.ok(inspectUpgrade.data.comparison.manifestDiff.variants.added.length >= 2);
    assert.ok(inspectUpgrade.data.comparison.manifestDiff.actions.added.length >= 2);
  });

  // ==========================================================================
  // 16.8 MULTI-MB PACKAGE STAGING (<1MB D1 CAP), TOKEN PREVIEW & STUB DIFFS
  // ==========================================================================
  it('16.8 Multi-MB Package Staging (<1MB D1 Cap), Token-Authenticated Sandboxed Preview Without Cookies, and Stubbed-Image Diff Accuracy', async () => {
    const { env } = await setupMigratedTestEnv();

    // 1. Create a ~2 MB package with 13 binary JPEG images (~145 KB each) simulating bro-code-dost-hai-ya-namuna
    const largeImageFiles = {};
    let s1 = 0x12345678;
    for (let i = 1; i <= 13; i++) {
      const buf = new Uint8Array(145 * 1024);
      buf[0] = 0xFF; buf[1] = 0xD8; buf[2] = 0xFF; buf[3] = 0xE0;
      for (let j = 4; j < buf.length - 2; j++) {
        // xorshift32 for high entropy across all bits
        s1 ^= s1 << 13;
        s1 ^= s1 >>> 17;
        s1 ^= s1 << 5;
        buf[j] = (s1 >>> 0) & 0xFF;
      }
      buf[buf.length - 2] = 0xFF; buf[buf.length - 1] = 0xD9;
      largeImageFiles[`assets/images/photo-${i}.jpg`] = buf;
    }

    const v1Spec = createSampleUtpV12PackageSpec({
      id: 'bro-code-dost-hai-ya-namuna',
      slug: 'bro-code-dost-hai-ya-namuna',
      name: 'BRO CODE: Dost Hai Ya Namuna?',
      version: '1.0.0',
      schemaVersion: '1.0.0'
    });
    const v1Zip = await buildTemplateZipBytes({
      ...v1Spec,
      extraFiles: { ...(v1Spec.extraFiles || {}), ...largeImageFiles }
    });

    const upV1 = await apiRequest(env, '/api/templates/upload', {
      method: 'POST',
      body: {
        name: 'BRO CODE: Dost Hai Ya Namuna?',
        slug: 'bro-code-dost-hai-ya-namuna',
        category: 'Friendship',
        tier: 'free',
        price: 0,
        publishImmediately: true,
        zipBase64: uint8ToBase64(v1Zip)
      }
    });
    assert.equal(upV1.status, 201);

    // 2. Stage ~2 MB UTP v1.2.0 upgrade package
    const v2Spec = createSampleUtpV12PackageSpec({
      id: 'bro-code-dost-hai-ya-namuna',
      slug: 'bro-code-dost-hai-ya-namuna',
      name: 'BRO CODE: Dost Hai Ya Namuna?',
      version: '1.2.0',
      schemaVersion: '1.2.0',
      includeBoyfriendVariant: true
    });
    const v2Zip = await buildTemplateZipBytes({
      ...v2Spec,
      extraFiles: { ...(v2Spec.extraFiles || {}), ...largeImageFiles }
    });
    assert.ok(v2Zip.byteLength > 1800 * 1024, `Test ZIP should exceed 1.8 MB, got ${v2Zip.byteLength}`);

    const inspectRes = await apiRequest(env, '/api/templates/import-studio/inspect', {
      method: 'POST',
      body: {
        filename: 'bro-code-dost-hai-ya-namuna-utp-v1.2.0.zip',
        zipBase64: uint8ToBase64(v2Zip)
      }
    });
    assert.equal(inspectRes.status, 200);
    assert.equal(inspectRes.data.recognitionOutcome, RECOGNITION_OUTCOME.EXACT_EXISTING_IDENTITY);

    // Verify D1 staged_files_bundle_json stays strictly under 1 MB (Cloudflare D1 SQL statement limit)
    const sessionRow = await env.DB.prepare('SELECT staged_files_bundle_json, preview_token FROM template_import_sessions WHERE id = ?')
      .bind(inspectRes.data.sessionId).first();
    assert.ok(sessionRow.staged_files_bundle_json.length < 950 * 1024, `Expected staged_files_bundle_json < 950 KB, got ${sessionRow.staged_files_bundle_json.length} bytes`);
    assert.ok(inspectRes.data.previewUrls.existing.includes(`token=${sessionRow.preview_token}`), 'Existing preview URL must include preview token for sandboxed iframe access');
    assert.ok(inspectRes.data.previewUrls.staged.includes(`token=${sessionRow.preview_token}`), 'Staged preview URL must include preview token for sandboxed iframe access');

    // Verify unchanged 13 images are counted as unchanged (not false-positive modified)
    assert.ok(inspectRes.data.comparison.files.summary.unchangedCount >= 13, 'Unchanged binary images must be classified as unchanged');

    // Verify sandboxed iframe preview works WITHOUT session cookies using the preview token (opaque origin simulation)
    const noCookieExistingPreview = await apiRequest(
      env,
      `${inspectRes.data.previewUrls.existing}&rel=boyfriend&ui=1`,
      { token: null }
    );
    assert.equal(noCookieExistingPreview.status, 200, 'Existing preview with valid previewToken and ui=1 fallback must return 200 even without cookies');

    const noCookieStagedPreview = await apiRequest(
      env,
      `${inspectRes.data.previewUrls.staged}&rel=boyfriend&ui=1`,
      { token: null }
    );
    assert.equal(noCookieStagedPreview.status, 200, 'Staged preview with valid previewToken must return 200 even without cookies');
    assert.ok(noCookieStagedPreview.text.includes('data-wm-relationship'));
  });
});

async function ctxGetTemplateVersion(env, templateId) {
  const tpl = await env.DB.prepare('SELECT current_version_id FROM templates WHERE id = ?').bind(templateId).first();
  if (!tpl || !tpl.current_version_id) return null;
  return await env.DB.prepare('SELECT * FROM template_versions WHERE id = ?').bind(tpl.current_version_id).first();
}
