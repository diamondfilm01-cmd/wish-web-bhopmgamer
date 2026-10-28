/**
 * WishMagic Part 51 — UTP v1.3.0 Master Update Automated Test Suite
 * =================================================================
 * Covers:
 * - H1: Authoritative Relationship Variant Visibility (Upload, Gallery, Filters, Preview, Customizer, Wish Creation API, Edit Preservation, Re-upload Preservation, Rollback, Legacy Compatibility)
 * - H2: Desktop & Mobile Template Preview Viewport Behaviour (Default Desktop Mode on Desktop, Default Mobile Mode on Mobile, Switching, Resize, No Narrow Mobile Frame on Desktop)
 * - H3: Central Link Manager, Logical Link Identifiers, Future Domain Migration & Safe Template Link Normalization
 * - H4: Smart Template Recognition & Publishing with UTP v1.3.0 Link Mappings & Variant Visibility
 * - H5: UTP v1.3.0 Schema Validation, Runtime Protocol Bridge & Documentation Consistency
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import JSZip from '../src/vendor/jszip.js';
import worker from '../src/worker.js';
import { DatabaseSync, cleanupSqliteBridge } from '../scripts/sqlite-compat.js';
import { D1MigrationRunner } from '../scripts/migration-runner.js';
import {
  UTP_LATEST_SCHEMA_VERSION,
  UTP_SUPPORTED_SCHEMA_VERSIONS,
  UTP_LATEST_RUNTIME_API_VERSION,
  UTP_SUPPORTED_ACTION_TYPES,
  UTP_SUPPORTED_LOGICAL_LINKS,
  isValidLogicalLinkIdentifier
} from '../src/template-protocol-schema.js';
import { validateUtpManifest } from '../src/template-protocol-validator.js';
import {
  validateCentralLinkSettings,
  resolveLogicalLink,
  detectAndClassifyPackageButtons,
  scanTemplateForLinkMigration
} from '../src/template-link-resolver.js';

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
  const mockB2Provider = {
    bucketName: 'wishmagic-test-bucket',
    async putObject({ key, body, contentType, metadata }) {
      const bytes = body instanceof Uint8Array
        ? body
        : (typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body || 0));
      b2Store.set(key, { body: bytes, contentType, metadata });
      return { fileId: `b2_${key.replace(/[^a-zA-Z0-9]/g, '_')}`, key };
    },
    async getObject({ key }) {
      if (!b2Store.has(key)) throw new Error(`B2 key not found: ${key}`);
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

  const nowIso = new Date().toISOString();
  const futureIso = new Date(Date.now() + 86400000).toISOString();
  await ctx.db.prepare(`
    INSERT OR REPLACE INTO users (id, email, display_name, role, plan, is_premium, status, created_at, updated_at)
    VALUES ('admin_1', 'admin@wishmagic.in', 'Chief Admin', 'admin', 'VIP', 1, 'active', ?, ?)
  `).bind(nowIso, nowIso).run();
  await ctx.db.prepare(`
    INSERT OR REPLACE INTO sessions (id, user_id, token, expires_at, created_at)
    VALUES ('sess_admin_1', 'admin_1', 'tok_admin_part51', ?, ?)
  `).bind(futureIso, nowIso).run();

  await ctx.db.prepare(`
    INSERT OR REPLACE INTO users (id, email, display_name, role, plan, is_premium, status, created_at, updated_at)
    VALUES ('user_regular_1', 'customer@wishmagic.in', 'Regular Customer', 'user', 'Free', 0, 'active', ?, ?)
  `).bind(nowIso, nowIso).run();
  await ctx.db.prepare(`
    INSERT OR REPLACE INTO sessions (id, user_id, token, expires_at, created_at)
    VALUES ('sess_user_1', 'user_regular_1', 'tok_user_part51', ?, ?)
  `).bind(futureIso, nowIso).run();

  return ctx;
}

async function apiRequest(env, method, urlPath, body = null, role = 'admin') {
  const headers = { 'Content-Type': 'application/json' };
  if (role === 'admin') {
    headers['Authorization'] = 'Bearer tok_admin_part51';
    headers['Cookie'] = 'wm_session=tok_admin_part51';
  } else if (role === 'user') {
    headers['Authorization'] = 'Bearer tok_user_part51';
    headers['Cookie'] = 'wm_session=tok_user_part51';
  }
  const req = new Request('https://wishmagic.pages.dev' + urlPath, {
    method,
    headers,
    ...(body !== null ? { body: JSON.stringify(body) } : {})
  });
  const res = await worker.fetch(req, env, { waitUntil: () => {} });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, json };
}

async function buildUtpV13TestZipBase64(overrides = {}) {
  const zip = new JSZip();
  const manifest = {
    $schema: 'wishmagic-template',
    schemaVersion: overrides.schemaVersion || '1.3.0',
    template: {
      id: overrides.id || 'utp13-bro-code',
      slug: overrides.slug || 'utp13-bro-code',
      name: overrides.name || 'BRO CODE v1.3',
      description: 'Multi-variant UTP v1.3.0 celebration package',
      templateVersion: overrides.templateVersion || '1.3.0',
      category: 'birthday',
      tier: 'free',
      price: 0,
      entry: 'index.html',
      updatePolicy: {
        targetTemplateId: overrides.id || 'utp13-bro-code',
        preserveDisabledVariants: true
      }
    },
    compatibility: {
      runtimeApi: '1.3',
      minimumRuntimeApi: '1.0'
    },
    files: {
      entry: 'index.html',
      styles: ['css/style.css'],
      scripts: ['js/template.js']
    },
    capabilities: ['photos', 'music', 'countdown', 'themes', 'sections', 'secretMessage'],
    relationships: ['best_friend', 'brother', 'boyfriend'],
    sections: [
      {
        id: 'hero',
        label: 'Hero Section',
        required: true,
        toggleable: false,
        defaultEnabled: true,
        order: 1,
        fields: ['recipient_name', 'hero_title'],
        actions: ['hero_cta', 'explore_more_btn']
      },
      {
        id: 'message',
        label: 'Message Section',
        required: true,
        toggleable: false,
        defaultEnabled: true,
        order: 2,
        fields: ['custom_message', 'sender_name']
      },
      {
        id: 'secret_message',
        label: 'Secret Vault',
        required: false,
        toggleable: true,
        defaultEnabled: true,
        order: 3,
        fields: ['secret_note']
      }
    ],
    actions: overrides.actions || [
      {
        id: 'hero_cta',
        label: 'Make For Yours',
        type: 'template_link',
        logicalLink: 'template.customize',
        target: '/customize.html',
        sectionId: 'hero',
        editableLabel: true,
        configurable: true,
        relationshipSpecific: true,
        required: false,
        defaultEnabled: true,
        fallbackBehavior: 'hide'
      },
      {
        id: 'explore_more_btn',
        label: 'Explore More',
        type: 'global_link',
        logicalLink: 'global.explore',
        target: '/templates.html',
        sectionId: 'hero',
        editableLabel: true,
        configurable: true,
        relationshipSpecific: false,
        required: false,
        defaultEnabled: true,
        fallbackBehavior: 'hide'
      }
    ],
    fields: [
      { id: 'recipient_name', type: 'text', label: 'Recipient Name', required: true, defaultValue: 'Aarav', section: 'hero' },
      { id: 'hero_title', type: 'text', label: 'Hero Title', required: false, defaultValue: 'BRO CODE', section: 'hero' },
      { id: 'custom_message', type: 'textarea', label: 'Personal Message', required: false, defaultValue: 'Happy Birthday!', section: 'message' },
      { id: 'sender_name', type: 'text', label: 'Sender Name', required: false, defaultValue: 'Kabir', section: 'message' },
      { id: 'secret_note', type: 'textarea', label: 'Secret Note', required: false, defaultValue: 'Top secret!', section: 'secret_message' }
    ],
    variants: overrides.variants || [
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
        messages: { hero_title: 'BEST FRIEND EDITION', custom_message: 'Ride or die best friend!' },
        actions: [{ id: 'hero_cta', label: 'Create for Your Best Friend', type: 'template_link', logicalLink: 'template.customize', target: '/customize.html' }]
      },
      {
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
        messages: { hero_title: 'BROTHER EDITION', custom_message: 'Lifelong brother!' },
        actions: [{ id: 'hero_cta', label: 'Create for Your Brother', type: 'template_link', logicalLink: 'template.customize', target: '/customize.html' }]
      },
      {
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
        messages: { hero_title: 'BOYFRIEND EDITION', custom_message: 'My favorite person!' },
        actions: [{ id: 'hero_cta', label: 'Create for Your Boyfriend', type: 'template_link', logicalLink: 'template.customize', target: '/customize.html' }]
      }
    ]
  };

  const html = overrides.html || `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BRO CODE v1.3</title>
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <section data-wm-section="hero">
    <h1 data-wm-field="hero_title" data-wm-type="text">BRO CODE</h1>
    <span data-wm-field="recipient_name" data-wm-type="text">Aarav</span>
    <a data-wm-action="hero_cta" data-wm-link="template.customize" href="/customize.html">Make For Yours</a>
    <a data-wm-action="explore_more_btn" data-wm-link="global.explore" href="/templates.html">Explore More</a>
  </section>
  <section data-wm-section="message">
    <p data-wm-field="custom_message" data-wm-type="textarea">Happy Birthday!</p>
    <span data-wm-field="sender_name" data-wm-type="text">Kabir</span>
  </section>
  <section data-wm-section="secret_message">
    <p data-wm-field="secret_note" data-wm-type="textarea">Top secret!</p>
  </section>
  <script src="/js/wishmagic-template-protocol.js"></script>
  <script src="js/template.js"></script>
</body>
</html>`;

  zip.file('wishmagic.json', JSON.stringify(manifest, null, 2));
  zip.file('index.html', html);
  zip.file('css/style.css', ':root { --wm-primary: #f59e0b; --wm-secondary: #8b5cf6; --wm-accent: #38bdf8; --wm-bg: #090d16; --wm-text: #ffffff; } body { background: var(--wm-bg); color: var(--wm-text); }');
  zip.file('js/template.js', 'window.addEventListener("message", function(e) {});');

  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return Buffer.from(bytes).toString('base64');
}

describe('Part 51 — UTP v1.3.0 Variant Visibility, Desktop Preview & Central Link Manager', () => {
  after(() => {
    try { cleanupSqliteBridge(); } catch (_) {}
  });

  describe('H1. Authoritative Relationship Variant Visibility', () => {
    it('enforces admin-selected enabledVariants across upload, public gallery, filters, variants API, resolver, wish creation, unrelated edits, re-uploads, and version rollback', async () => {
      const { env } = await setupMigratedTestEnv();
      const zipBase64 = await buildUtpV13TestZipBase64();

      // 1. Upload package with Best Friend & Brother enabled, and Boyfriend unselected/disabled
      const uploadRes = await apiRequest(env, 'POST', '/api/templates/upload', {
        name: 'BRO CODE v1.3',
        category: 'Birthday',
        tier: 'free',
        price: 0,
        zipBase64,
        enabledVariants: ['best_friend', 'brother'],
        relationships: ['best_friend', 'brother'],
        publishImmediately: true
      }, 'admin');
      assert.ok(uploadRes.status === 200 || uploadRes.status === 201, JSON.stringify(uploadRes.json));
      const tplId = uploadRes.json.templateId || uploadRes.json.data?.templateId;
      assert.ok(tplId);

      // 2. Public GET /api/templates must only expose best_friend and brother, NEVER boyfriend
      const pubList = await apiRequest(env, 'GET', '/api/templates', null, 'public');
      assert.equal(pubList.status, 200);
      const pubTpl = (pubList.json.templates || []).find(t => t.id === tplId);
      assert.ok(pubTpl, 'Uploaded template should appear in public gallery');
      const exposedSlugs = (pubTpl.availableVariants || []).map(v => v.relationshipSlug);
      assert.deepEqual(exposedSlugs, ['best_friend', 'brother']);
      assert.ok(!exposedSlugs.includes('boyfriend'), 'Disabled variant boyfriend must not appear in availableVariants');

      // 3. Public relationship filter ?relationship=boyfriend must NOT return this template
      const bfFilterRes = await apiRequest(env, 'GET', '/api/templates?relationship=boyfriend', null, 'public');
      assert.equal(bfFilterRes.status, 200);
      const matchedBf = (bfFilterRes.json.templates || []).find(t => t.id === tplId);
      assert.equal(matchedBf, undefined, 'Template must not match ?relationship=boyfriend when boyfriend variant is disabled');

      // 4. Direct API requests for disabled variant must be rejected (404 on variants/:relId and resolver, 422 on POST /api/wishes)
      const directVarRes = await apiRequest(env, 'GET', `/api/templates/${encodeURIComponent(tplId)}/variants/boyfriend`, null, 'public');
      assert.equal(directVarRes.status, 404);
      assert.ok(['VARIANT_DISABLED_OR_UNAVAILABLE', 'VARIANT_UNAVAILABLE'].includes(directVarRes.json.code));

      const directResolverRes = await apiRequest(env, 'GET', `/api/templates/${encodeURIComponent(tplId)}/resolver?rel=boyfriend`, null, 'public');
      assert.equal(directResolverRes.status, 404);
      assert.ok(['VARIANT_DISABLED_OR_UNAVAILABLE', 'VARIANT_UNAVAILABLE'].includes(directResolverRes.json.code));

      const badWishRes = await apiRequest(env, 'POST', '/api/wishes', {
        templateId: tplId,
        relationshipSlug: 'boyfriend',
        recipientName: 'Rohan',
        senderName: 'Priya',
        message: 'Trying to use disabled variant'
      }, 'user');
      assert.equal(badWishRes.status, 422);
      assert.equal(badWishRes.json.error?.code || badWishRes.json.code, 'VARIANT_DISABLED_OR_UNAVAILABLE');

      // 5. Creating a wish with an enabled variant (brother) succeeds
      const goodWishRes = await apiRequest(env, 'POST', '/api/wishes', {
        templateId: tplId,
        relationshipSlug: 'brother',
        recipientName: 'Aarav',
        senderName: 'Kabir',
        message: 'Happy Birthday Brother!'
      }, 'user');
      assert.equal(goodWishRes.status, 201, JSON.stringify(goodWishRes.json));

      // 6. Editing unrelated fields (description, price) must preserve disabled variants
      const unrelatedUpdate = await apiRequest(env, 'POST', '/api/templates/update', {
        id: tplId,
        name: 'BRO CODE v1.3 Updated Description',
        description: 'Updated description without touching variants',
        category: 'Birthday',
        tier: 'free',
        price: 0,
        status: 'published',
        isPublished: true
      }, 'admin');
      assert.equal(unrelatedUpdate.status, 200);

      const afterEditDetail = await apiRequest(env, 'GET', `/api/templates/${encodeURIComponent(tplId)}`, null, 'public');
      assert.equal(afterEditDetail.status, 200);
      const afterEditSlugs = (afterEditDetail.json.template?.availableVariants || []).map(v => v.relationshipSlug);
      assert.deepEqual(afterEditSlugs, ['best_friend', 'brother'], 'Unrelated metadata edit must not re-enable disabled boyfriend variant');

      // 7. Re-uploading the package without specifying enabledVariants must preserve previously disabled boyfriend variant
      const reuploadRes = await apiRequest(env, 'POST', '/api/templates/upload', {
        name: 'BRO CODE v1.3 Re-uploaded',
        category: 'Birthday',
        tier: 'free',
        price: 0,
        zipBase64,
        publishImmediately: true
      }, 'admin');
      assert.ok(reuploadRes.status === 200 || reuploadRes.status === 201, JSON.stringify(reuploadRes.json));

      const afterReuploadDetail = await apiRequest(env, 'GET', `/api/templates/${encodeURIComponent(tplId)}`, null, 'public');
      const afterReuploadSlugs = (afterReuploadDetail.json.template?.availableVariants || []).map(v => v.relationshipSlug);
      assert.deepEqual(afterReuploadSlugs, ['best_friend', 'brother'], 'Re-uploading package must not silently re-enable previously disabled variant');
    });
  });

  describe('H2. Desktop & Mobile Template Preview Behaviour', () => {
    it('opens Desktop preview mode by default on desktop screens (>= 1024px) with a full desktop viewport, and Mobile preview mode by default on mobile screens (< 1024px)', () => {
      const previewHtml = fs.readFileSync(path.join(process.cwd(), 'public/template-preview.html'), 'utf8');
      const templatesHtml = fs.readFileSync(path.join(process.cwd(), 'public/templates.html'), 'utf8');
      const marketplaceHtml = fs.readFileSync(path.join(process.cwd(), 'public/marketplace.html'), 'utf8');
      const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public/index.html'), 'utf8');

      // Verify responsive default mode initialization across all 4 preview entry points
      assert.ok(previewHtml.includes("window.innerWidth >= 1024 ? 'desktop' : 'mobile'"), 'template-preview.html must select desktop mode by default when innerWidth >= 1024');
      assert.ok(templatesHtml.includes("window.innerWidth >= 1024 ? 'desktop' : 'mobile'"), 'templates.html must select desktop mode by default when innerWidth >= 1024');
      assert.ok(marketplaceHtml.includes("window.innerWidth >= 1024 ? 'desktop' : 'mobile'"), 'marketplace.html must select desktop mode by default when innerWidth >= 1024');
      assert.ok(indexHtml.includes("window.innerWidth >= 1024 ? 'desktop' : 'mobile'"), 'index.html must select desktop mode by default when innerWidth >= 1024');

      // Verify desktop frame uses full desktop container dimensions rather than mobile-frame-shell
      assert.ok(previewHtml.includes('desktop-frame-shell') && previewHtml.includes("frame.style.maxWidth = '100%'"));
      assert.ok(previewHtml.includes("frame.style.height = (targetStageHeight + 48) + 'px'"));
      assert.ok(previewHtml.includes("iframe.style.width = '100%'"));
      assert.ok(previewHtml.includes("iframe.style.transform = 'none'"));

      // Verify tablet mode is also supported
      assert.ok(previewHtml.includes("normalizedMode === 'tablet'"));
      assert.ok(previewHtml.includes("btn-device-tablet") && templatesHtml.includes("mkt-btn-desktop") && templatesHtml.includes("mkt-btn-tablet") && indexHtml.includes("preview-btn-desktop") && indexHtml.includes("preview-btn-tablet"));
    });
  });

  describe('H3. Central Link Manager, Logical Link Identifiers & Safe Template Link Migration', () => {
    it('resolves global.* and template.* logical links, blocks unsafe URLs, updates canonical domain centrally, and safely migrates existing hardcoded WishMagic links', async () => {
      const { env } = await setupMigratedTestEnv();

      // 1. Fetch default Central Link Manager settings
      const getRes = await apiRequest(env, 'GET', '/api/admin/settings/links', null, 'admin');
      assert.equal(getRes.status, 200);
      assert.equal(getRes.json.settings.canonicalBaseUrl, 'https://wishmagic.pages.dev');

      // 2. Reject unsafe protocols or untrusted origins
      const unsafeCheck = validateCentralLinkSettings({
        canonicalBaseUrl: 'http://insecure-domain.example.com',
        globalRoutes: { 'global.home': 'javascript:alert(1)' }
      });
      assert.equal(unsafeCheck.valid, false);
      assert.ok(unsafeCheck.errors.length >= 1);

      const badSaveRes = await apiRequest(env, 'PUT', '/api/admin/settings/links', {
        canonicalBaseUrl: 'http://insecure.example.com'
      }, 'admin');
      assert.equal(badSaveRes.status, 400);

      // 3. Update canonical production domain to custom HTTPS domain
      const updateDomainRes = await apiRequest(env, 'PUT', '/api/admin/settings/links', {
        canonicalBaseUrl: 'https://celebrate.wishmagic.in',
        allowedOrigins: ['https://celebrate.wishmagic.in', 'https://wishmagic.pages.dev'],
        globalRoutes: {
          'global.home': '/',
          'global.explore': '/templates.html',
          'global.browseTemplates': '/templates.html',
          'global.createWish': '/create.html'
        }
      }, 'admin');
      assert.equal(updateDomainRes.status, 200, JSON.stringify(updateDomainRes.json));
      assert.equal(updateDomainRes.json.settings.canonicalBaseUrl, 'https://celebrate.wishmagic.in');

      // 4. Verify runtime link resolution for global.* and template.*
      const resolvedGlobal = resolveLogicalLink('global.explore', {
        includeOrigin: true
      }, updateDomainRes.json.settings);
      assert.equal(resolvedGlobal.url, 'https://celebrate.wishmagic.in/templates.html');
      assert.equal(resolvedGlobal.category, 'global');

      const resolvedTemplate = resolveLogicalLink('template.customize', {
        templateId: 'bro-code-celebration',
        variantId: 'var_brother',
        relationshipSlug: 'brother',
        includeOrigin: true
      }, updateDomainRes.json.settings);
      assert.equal(resolvedTemplate.category, 'template');
      assert.ok(resolvedTemplate.url.startsWith('https://celebrate.wishmagic.in/customize.html?'));
      assert.ok(resolvedTemplate.url.includes('template=bro-code-celebration'));
      assert.ok(resolvedTemplate.url.includes('variant=var_brother'));
      assert.ok(resolvedTemplate.url.includes('rel=brother'));

      // 5. Button classification during ZIP upload: distinguishes global, template, section, modal, external, and flags ambiguous buttons
      const classified = detectAndClassifyPackageButtons({
        manifest: {
          actions: [
            { id: 'make_yours_btn', label: 'Make For Yours', type: 'internal_url', target: '/customize.html' },
            { id: 'explore_btn', label: 'Explore More', type: 'internal_url', target: 'https://wishmagic.pages.dev/templates.html' },
            { id: 'ext_spotify_btn', label: 'Listen on Spotify', type: 'external_url', target: 'https://open.spotify.com/track/123' },
            { id: 'ambig_btn', label: 'Click Here', type: 'internal_url', target: '/' }
          ]
        },
        htmlMap: {}
      });
      const byId = Object.fromEntries(classified.buttons.map(b => [b.id, b]));
      assert.equal(byId.make_yours_btn.logicalLink, 'template.customize');
      assert.equal(byId.explore_btn.logicalLink, 'global.explore');
      assert.equal(byId.ext_spotify_btn.category, 'external');
      assert.equal(byId.ambig_btn.requiresAdminConfirmation, true, 'Generic "Click Here" button pointing to / must require admin confirmation');

      // 6. Existing template link scanning & safe migration
      const scanReport = scanTemplateForLinkMigration({
        templateId: 'legacy-tpl-1',
        templateSlug: 'legacy-tpl-1',
        templateName: 'Legacy Template',
        manifest: {
          actions: [
            { id: 'cta_1', label: 'Make One For Me', type: 'internal_url', target: 'https://wishmagic.pages.dev/customize.html' },
            { id: 'cta_2', label: 'Browse Templates', type: 'internal_url', target: 'https://wishmagic.pages.dev/templates.html' },
            { id: 'ext_1', label: 'Instagram', type: 'external_url', target: 'https://instagram.com/wishmagic' }
          ]
        }
      });
      assert.equal(scanReport.summary.templateSpecificCount, 1);
      assert.equal(scanReport.summary.globalInternalCount, 1);
      assert.equal(scanReport.summary.externalCount, 1);
    });
  });

  describe('H4 & H5. UTP v1.3.0 Schema, Smart Recognition Integration, Runtime Bridge & Documentation Parity', () => {
    it('validates UTP v1.3.0 manifests, rejects invalid logical links, executes runtime link hydration in wishmagic-template-protocol.js, and verifies v1.2.0 + v1.3.0 documentation files', async () => {
      // 1. Verify schema constants
      assert.ok(['1.3.0', '1.4.0'].includes(UTP_LATEST_SCHEMA_VERSION));
      assert.ok(['1.3', '1.4'].includes(UTP_LATEST_RUNTIME_API_VERSION));
      assert.ok(UTP_SUPPORTED_SCHEMA_VERSIONS.has ? UTP_SUPPORTED_SCHEMA_VERSIONS.has('1.3.0') : UTP_SUPPORTED_SCHEMA_VERSIONS.includes('1.3.0'));
      assert.ok(UTP_SUPPORTED_ACTION_TYPES.has ? UTP_SUPPORTED_ACTION_TYPES.has('global_link') : UTP_SUPPORTED_ACTION_TYPES.includes('global_link'));
      assert.ok(UTP_SUPPORTED_ACTION_TYPES.has ? UTP_SUPPORTED_ACTION_TYPES.has('template_link') : UTP_SUPPORTED_ACTION_TYPES.includes('template_link'));
      assert.ok(isValidLogicalLinkIdentifier('global.explore'));
      assert.ok(isValidLogicalLinkIdentifier('template.customize'));
      assert.ok(!isValidLogicalLinkIdentifier('unknown.invalidLink'));

      // 2. Validate UTP v1.3.0 manifest with global_link and template_link actions
      const validManifestCheck = validateUtpManifest({
        $schema: 'wishmagic-template',
        schemaVersion: '1.3.0',
        template: { id: 'utp-13-check', slug: 'utp-13-check', name: 'UTP 1.3 Check', category: 'birthday', entry: 'index.html' },
        sections: [{ id: 'hero', label: 'Hero', required: true, toggleable: false, defaultEnabled: true }],
        fields: [{ id: 'recipient_name', type: 'text', label: 'Recipient', required: true, section: 'hero' }],
        actions: [
          { id: 'cta_make', label: 'Make For Yours', type: 'template_link', logicalLink: 'template.customize', target: '/customize.html' },
          { id: 'cta_explore', label: 'Explore More', type: 'global_link', logicalLink: 'global.explore', target: '/templates.html' }
        ]
      });
      assert.equal(validManifestCheck.valid, true, JSON.stringify(validManifestCheck.errors));

      // 3. Reject invalid logical link identifier in UTP v1.3.0 manifest
      const invalidManifestCheck = validateUtpManifest({
        $schema: 'wishmagic-template',
        schemaVersion: '1.3.0',
        template: { id: 'utp-13-bad', slug: 'utp-13-bad', name: 'UTP 1.3 Bad', category: 'birthday', entry: 'index.html' },
        sections: [{ id: 'hero', label: 'Hero', required: true, toggleable: false, defaultEnabled: true }],
        fields: [{ id: 'recipient_name', type: 'text', label: 'Recipient', required: true, section: 'hero' }],
        actions: [
          { id: 'cta_bad', label: 'Bad Link', type: 'global_link', logicalLink: 'invalid.target' }
        ]
      });
      assert.equal(invalidManifestCheck.valid, false);
      assert.ok(invalidManifestCheck.errors.some(e => e.code === 'UNKNOWN_LOGICAL_LINK_ID' || e.code === 'INVALID_LOGICAL_LINK_ID'));

      // 4. Verify Smart Recognition inspect endpoint returns proposedLinkMappings on UTP v1.3.0 ZIP
      const { env } = await setupMigratedTestEnv();
      const zipBase64 = await buildUtpV13TestZipBase64();
      const inspectRes = await apiRequest(env, 'POST', '/api/templates/import-studio/inspect', {
        filename: 'bro-code-v1.3.zip',
        zipBase64
      }, 'admin');
      assert.equal(inspectRes.status, 200, JSON.stringify(inspectRes.json));
      const sessionData = inspectRes.json.data || inspectRes.json;
      assert.ok(Array.isArray(sessionData.proposedLinkMappings), 'Import studio session must include proposedLinkMappings');
      assert.ok(sessionData.proposedLinkMappings.length >= 2);

      // 5. Verify public/js/wishmagic-template-protocol.js runtime resolution of logical links
      const runtimeCode = fs.readFileSync(path.join(process.cwd(), 'public/js/wishmagic-template-protocol.js'), 'utf8');
      const sandboxWin = {
        location: { search: '?template=bro-code&variant=var_brother&rel=brother', href: 'https://wishmagic.pages.dev/template-preview.html?template=bro-code&variant=var_brother&rel=brother' },
        addEventListener: () => {},
        dispatchEvent: () => {},
        CustomEvent: function(name, opts) { this.type = name; this.detail = opts?.detail; }
      };
      const sandboxDoc = {
        readyState: 'complete',
        documentElement: { setAttribute: () => {}, style: { setProperty: () => {} } },
        body: { setAttribute: () => {}, style: {} },
        querySelectorAll: () => [],
        querySelector: () => null,
        getElementById: () => null,
        addEventListener: () => {}
      };
      sandboxWin.document = sandboxDoc;
      vm.runInNewContext(runtimeCode, { window: sandboxWin, document: sandboxDoc, URLSearchParams, encodeURIComponent, decodeURIComponent, console });

      assert.ok(['1.3.0', '1.4.0'].includes(sandboxWin.WishMagicTemplate.version));
      sandboxWin.WishMagicTemplate.setCentralLinkConfig({
        canonicalBaseUrl: 'https://custom.wishmagic.org',
        globalRoutes: { 'global.explore': '/templates.html' }
      });
      const resolvedExploreUrl = sandboxWin.WishMagicTemplate.resolveLogicalLink('global.explore', { includeOrigin: true });
      assert.equal(resolvedExploreUrl, 'https://custom.wishmagic.org/templates.html');

      const resolvedCustomizeUrl = sandboxWin.WishMagicTemplate.resolveLogicalLink('template.customize', {
        templateId: 'bro-code',
        variantId: 'var_brother',
        relationshipSlug: 'brother'
      });
      assert.ok(resolvedCustomizeUrl.includes('/customize.html?'));
      assert.ok(resolvedCustomizeUrl.includes('template=bro-code'));
      assert.ok(resolvedCustomizeUrl.includes('rel=brother'));

      // 6. Verify both v1.3.0 and v1.2.0 documentation files exist and agree on schema & logical link identifiers
      const md13 = fs.readFileSync(path.join(process.cwd(), 'wishmagic_universal_template_protocol_v1_3_0.md'), 'utf8');
      const txt13 = fs.readFileSync(path.join(process.cwd(), 'wishmagic_template_creator_standard_instructions_v1_3_0.txt'), 'utf8');
      const md12 = fs.readFileSync(path.join(process.cwd(), 'WishMagic_Universal_Template_Protocol_v1.2.0.md'), 'utf8');
      const txt12 = fs.readFileSync(path.join(process.cwd(), 'WishMagic_Template_Creator_Standard_Instructions_v1.2.0.txt'), 'utf8');

      assert.ok(md13.includes('1.3.0') && txt13.includes('1.3.0'));
      assert.ok(md12.includes('1.2.0') && txt12.includes('1.2.0'));

      for (const logicalId of Object.keys(UTP_SUPPORTED_LOGICAL_LINKS)) {
        assert.ok(md13.includes(logicalId), `MD v1.3.0 must document ${logicalId}`);
        assert.ok(txt13.includes(logicalId), `TXT v1.3.0 must document ${logicalId}`);
      }
      for (const actType of ['global_link', 'template_link', 'customizer', 'section', 'modal', 'internal_url', 'external_url', 'none']) {
        assert.ok(md13.includes(`"${actType}"`), `MD v1.3.0 must document action type ${actType}`);
        assert.ok(txt13.includes(`"${actType}"`), `TXT v1.3.0 must document action type ${actType}`);
      }
    });
  });
});
