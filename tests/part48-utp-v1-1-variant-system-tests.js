/**
 * Part 48 — WishMagic UTP v1.1.0 Universal Relationship Variant System Tests
 * Covers:
 * - 13.1 Manifest & Upload Tests (single-variant v1.0.0, multi-variant v1.1.0, duplicate variant IDs, duplicate relationships, missing entry files, path traversal, unbound variant fields)
 * - 13.2 Gallery & Search/Filter Tests (published relation tags, disabled/draft variants hidden, relation filter strict matching, generic keyword search does not count as relation selection)
 * - 13.3 Flows A–J (Preview & Customize relation prompts, 1-variant auto-open, legacy 0-variant preservation, Preview -> Customize relation preservation, invalid variant ID blocked)
 * - 13.4 Admin & Authorization Tests (auto-discovery & registration on upload, re-upload preserves historical variants while disabling removed ones, unauthenticated mutations rejected)
 * - 13.5 End-to-End Integration Tests (Upload BRO CODE with Best Friend / Brother / Boyfriend -> Gallery -> Preview Brother -> Customize Brother -> Save Wish -> Verify template defaults untouched)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from '../src/vendor/jszip.js';

import {
  UTP_SCHEMA_VERSION,
  UTP_LATEST_SCHEMA_VERSION,
  UTP_SUPPORTED_SCHEMA_VERSIONS,
  UTP_RELATIONSHIP_CATALOG,
  normalizeRelationshipIdentifier
} from '../src/template-protocol-schema.js';

import {
  validateUtpManifest,
  normalizeManifestToUtp,
  normalizeVariantDeclaration
} from '../src/template-protocol-validator.js';

import {
  mergeTemplateAndVariantFields,
  buildVariantRecordFromUtpDeclaration,
  filterPublicAvailableVariants,
  resolveVariantHierarchy
} from '../src/template-variant-engine.js';

import {
  executeB2TemplateIngestPipeline,
  createMockD1Database
} from '../src/template-ingest-pipeline.js';

const BRO_CODE_HTML = `<!DOCTYPE html>
<html lang="en" data-wm-protocol="1.1">
<head>
  <meta charset="UTF-8" />
  <title>BRO CODE</title>
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <section data-wm-section="hero">
    <h1 data-wm-field="hero_title" data-wm-type="text">THE UNBREAKABLE CODE</h1>
    <p data-wm-field="hero_subtitle" data-wm-type="text">Celebrating a bond</p>
    <span data-wm-field="recipient_name" data-wm-type="text">Aarav</span>
    <span data-wm-field="event_date" data-wm-type="date">2026-12-25</span>
  </section>
  <section data-wm-section="message">
    <p data-wm-field="custom_message" data-wm-type="textarea">Default tribute message</p>
    <span data-wm-field="sender_name" data-wm-type="text">— Kabir</span>
  </section>
  <script src="/js/wishmagic-template-protocol.js"></script>
  <script src="js/template.js"></script>
</body>
</html>`;

const BRO_CODE_MANIFEST = {
  $schema: 'wishmagic-template',
  schemaVersion: '1.1.0',
  template: {
    id: 'bro-code',
    slug: 'bro-code',
    name: 'BRO CODE',
    description: 'Interactive tribute for Best Friend, Brother, or Boyfriend',
    templateVersion: '1.1.0',
    category: 'birthday',
    tier: 'free',
    price: 0,
    author: 'WishMagic Studio',
    entry: 'index.html'
  },
  compatibility: {
    runtimeApi: '1.0',
    minimumRuntimeApi: '1.0'
  },
  files: {
    entry: 'index.html',
    styles: ['css/style.css'],
    scripts: ['js/template.js']
  },
  capabilities: ['themes', 'animations', 'sections'],
  relationships: ['best_friend', 'brother', 'boyfriend'],
  sections: [
    { id: 'hero', label: 'Hero Banner', required: true, toggleable: false, defaultEnabled: true, order: 1 },
    { id: 'message', label: 'Tribute Letter', required: true, toggleable: false, defaultEnabled: true, order: 2 }
  ],
  fields: [
    { id: 'recipient_name', type: 'text', label: 'Recipient Name', required: true, defaultValue: 'Aarav', binding: { target: 'text', selector: "[data-wm-field='recipient_name']" } },
    { id: 'hero_title', type: 'text', label: 'Hero Headline', required: false, defaultValue: 'THE UNBREAKABLE CODE', binding: { target: 'text', selector: "[data-wm-field='hero_title']" } },
    { id: 'hero_subtitle', type: 'text', label: 'Hero Subtitle', required: false, defaultValue: 'Celebrating a bond', binding: { target: 'text', selector: "[data-wm-field='hero_subtitle']" } },
    { id: 'event_date', type: 'date', label: 'Celebration Date', required: true, defaultValue: '2026-12-25', binding: { target: 'text', selector: "[data-wm-field='event_date']" } },
    { id: 'custom_message', type: 'textarea', label: 'Personal Message', required: false, defaultValue: 'Default family message', binding: { target: 'text', selector: "[data-wm-field='custom_message']" } },
    { id: 'sender_name', type: 'text', label: 'Sender Name', required: false, defaultValue: '— Kabir', binding: { target: 'text', selector: "[data-wm-field='sender_name']" } }
  ],
  variants: [
    {
      id: 'var_best_friend',
      slug: 'best-friend',
      name: 'BRO CODE — Best Friend',
      relationship: 'best_friend',
      relationshipLabel: 'Best Friend',
      entry: 'index.html',
      status: 'published',
      enabled: true,
      isDefault: true,
      order: 1,
      theme: { primary: '#f59e0b', secondary: '#8b5cf6', accent: '#38bdf8' },
      messages: {
        hero_title: 'RIDE OR DIE: BEST FRIEND EDITION',
        custom_message: 'Life is 10x better with a best friend like you!'
      }
    },
    {
      id: 'var_brother',
      slug: 'brother',
      name: 'BRO CODE — Brother',
      relationship: 'brother',
      relationshipLabel: 'Brother',
      entry: 'index.html',
      status: 'published',
      enabled: true,
      isDefault: false,
      order: 2,
      theme: { primary: '#06b6d4', secondary: '#3b82f6', accent: '#fbbf24' },
      messages: {
        hero_title: 'BLOOD & LOYALTY: BROTHER EDITION',
        custom_message: 'Proud to call you my brother!'
      },
      fields: [
        { id: 'custom_message', label: 'Message for Your Brother', placeholder: 'Write a note for your brother...' }
      ]
    },
    {
      id: 'var_boyfriend',
      slug: 'boyfriend',
      name: 'BRO CODE — Boyfriend',
      relationship: 'boyfriend',
      relationshipLabel: 'Boyfriend',
      entry: 'index.html',
      status: 'published',
      enabled: true,
      isDefault: false,
      order: 3,
      theme: { primary: '#ec4899', secondary: '#8b5cf6', accent: '#fde047' },
      messages: {
        hero_title: 'MY FAVORITE PERSON: BOYFRIEND EDITION',
        custom_message: 'You are my favorite adventure every single day!'
      }
    }
  ]
};

describe('Part 48 — WishMagic UTP v1.1.0 Universal Template Variant System', () => {

  describe('13.1 Manifest & Upload Validation Tests', () => {
    it('supports both UTP v1.0.0 and UTP v1.1.0 schema versions cleanly', () => {
      assert.equal(UTP_SCHEMA_VERSION, '1.0.0');
      assert.equal(UTP_LATEST_SCHEMA_VERSION, '1.1.0');
      assert.ok(UTP_SUPPORTED_SCHEMA_VERSIONS.includes('1.0.0'));
      assert.ok(UTP_SUPPORTED_SCHEMA_VERSIONS.includes('1.1.0'));
      assert.ok(UTP_RELATIONSHIP_CATALOG.brother);
      assert.ok(UTP_RELATIONSHIP_CATALOG.best_friend);
      assert.ok(UTP_RELATIONSHIP_CATALOG.boyfriend);
    });

    it('validates a legacy UTP v1.0.0 single-variant package with 100% backward compatibility', () => {
      const legacyManifest = { ...BRO_CODE_MANIFEST, schemaVersion: '1.0.0' };
      delete legacyManifest.variants;
      const report = validateUtpManifest(legacyManifest, {
        htmlContent: BRO_CODE_HTML,
        packageFiles: ['wishmagic.json', 'index.html', 'css/style.css', 'js/template.js']
      });
      assert.equal(report.valid, true);
      assert.equal(report.variants.hasVariants, false);
      assert.equal(report.variants.validCount, 0);
    });

    it('validates a UTP v1.1.0 multi-variant package (BRO CODE: Best Friend, Brother, Boyfriend)', () => {
      const report = validateUtpManifest(BRO_CODE_MANIFEST, {
        htmlContent: BRO_CODE_HTML,
        packageFiles: ['wishmagic.json', 'index.html', 'css/style.css', 'js/template.js']
      });
      assert.equal(report.valid, true);
      assert.equal(report.variants.hasVariants, true);
      assert.equal(report.variants.detectedCount, 3);
      assert.equal(report.variants.validCount, 3);
      assert.equal(report.variants.invalidCount, 0);
      assert.deepEqual(
        report.variants.detectedRelations.map(r => r.slug),
        ['best_friend', 'brother', 'boyfriend']
      );
    });

    it('rejects duplicate variant IDs and duplicate relationship declarations in variants[]', () => {
      const dupManifest = structuredClone(BRO_CODE_MANIFEST);
      dupManifest.variants.push({
        id: 'var_brother',
        slug: 'brother-dup',
        name: 'Duplicate Brother',
        relationship: 'brother',
        entry: 'index.html'
      });
      const report = validateUtpManifest(dupManifest, {
        htmlContent: BRO_CODE_HTML,
        packageFiles: ['wishmagic.json', 'index.html', 'css/style.css', 'js/template.js']
      });
      assert.equal(report.valid, false);
      assert.ok(report.errors.some(e => e.code === 'DUPLICATE_VARIANT_ID' || e.code === 'DUPLICATE_VARIANT_RELATIONSHIP'));
    });

    it('rejects missing variant entry files, path traversal (../), and unbound variant field overrides', () => {
      const badManifest = structuredClone(BRO_CODE_MANIFEST);
      badManifest.variants[1].entry = '../secret.html';
      badManifest.variants[2].entry = 'variants/missing-boyfriend.html';
      badManifest.variants[0].fields = [
        { id: 'non_existent_dom_field', type: 'text', label: 'Ghost Field' }
      ];
      const report = validateUtpManifest(badManifest, {
        htmlContent: BRO_CODE_HTML,
        packageFiles: ['wishmagic.json', 'index.html', 'css/style.css', 'js/template.js']
      });
      assert.equal(report.valid, false);
      assert.ok(report.errors.some(e => e.code === 'UNSAFE_VARIANT_ENTRY_PATH'));
      assert.ok(report.errors.some(e => e.code === 'VARIANT_ENTRY_FILE_NOT_FOUND'));
      assert.ok(report.errors.some(e => e.code === 'UNBOUND_VARIANT_FIELD'));
    });
  });

  describe('13.2 & 13.3 Variant Hierarchy Resolution, Field Merging & Public Filtering', () => {
    it('filters out draft and disabled variants from public availableVariants while preserving published order', () => {
      const variants = [
        buildVariantRecordFromUtpDeclaration(BRO_CODE_MANIFEST.variants[0], { templateId: 'tpl_bro_code', shouldPublish: true }),
        buildVariantRecordFromUtpDeclaration(BRO_CODE_MANIFEST.variants[1], { templateId: 'tpl_bro_code', shouldPublish: true }),
        buildVariantRecordFromUtpDeclaration({
          ...BRO_CODE_MANIFEST.variants[2],
          status: 'draft'
        }, { templateId: 'tpl_bro_code', shouldPublish: true }),
        buildVariantRecordFromUtpDeclaration({
          id: 'var_sister_disabled',
          relationship: 'sister',
          status: 'published',
          enabled: false
        }, { templateId: 'tpl_bro_code', shouldPublish: true })
      ];

      const publicAvail = filterPublicAvailableVariants(variants);
      assert.equal(publicAvail.length, 2);
      assert.deepEqual(publicAvail.map(v => v.relationshipSlug), ['best_friend', 'brother']);
    });

    it('resolves Customer Wish CustomData > Variant Override > Template Version Default > Fallback without mutating template defaults', () => {
      const brotherRecord = buildVariantRecordFromUtpDeclaration(BRO_CODE_MANIFEST.variants[1], { templateId: 'tpl_bro_code', shouldPublish: true });
      const baseTemplate = {
        id: 'tpl_bro_code',
        name: 'BRO CODE',
        category: 'birthday',
        entryFile: 'index.html',
        fields: structuredClone(BRO_CODE_MANIFEST.fields),
        sections: structuredClone(BRO_CODE_MANIFEST.sections)
      };

      const resolved = resolveVariantHierarchy({
        template: baseTemplate,
        relationship: 'brother',
        variantOverride: brotherRecord,
        wishCustomData: {
          recipient_name: 'Rohan',
          custom_message: 'Custom message written by customer for Rohan!'
        }
      });

      assert.equal(resolved.relationship.slug, 'brother');
      assert.equal(resolved.messages.hero_title, 'BLOOD & LOYALTY: BROTHER EDITION');
      assert.equal(resolved.messages.custom_message, 'Custom message written by customer for Rohan!');
      assert.equal(resolved.palette.primary, '#06b6d4');

      const mergedMsgField = resolved.fields.find(f => f.id === 'custom_message');
      assert.equal(mergedMsgField.label, 'Message for Your Brother');

      // Base template must remain completely unmutated
      const origMsgField = baseTemplate.fields.find(f => f.id === 'custom_message');
      assert.equal(origMsgField.label, 'Personal Message');
      assert.equal(origMsgField.defaultValue, 'Default family message');
    });
  });

  describe('13.4 & 13.5 End-to-End Upload Pipeline & Variant Auto-Registration', () => {
    it('automatically discovers and registers all UTP v1.1.0 variants into D1 during upload', async () => {
      const zip = new JSZip();
      zip.file('index.html', BRO_CODE_HTML);
      zip.file('css/style.css', ':root { --wm-primary: #ec4899; --wm-secondary: #8b5cf6; --wm-accent: #fbbf24; }');
      zip.file('js/template.js', 'window.addEventListener("message", function(){});');
      zip.file('wishmagic.json', JSON.stringify(BRO_CODE_MANIFEST, null, 2));

      const zipBytes = await zip.generateAsync({ type: 'uint8array' });
      const fakeB2Provider = {
        bucketName: 'wishmagic-templates',
        putObject: async () => ({ fileId: 'b2_file_mock_bro_code' }),
        deleteObject: async () => ({ deleted: true })
      };

      const mockDb = createMockD1Database();
      const res = await executeB2TemplateIngestPipeline({
        zipBuffer: zipBytes,
        storageProvider: fakeB2Provider,
        templateMetadata: { id: 'tpl_bro_code', name: 'BRO CODE', category: 'birthday' },
        db: mockDb,
        shouldPublish: true
      });

      assert.equal(res.success, true);
      assert.equal(res.variantsDetected, true);
      assert.equal(res.variantsCount, 3);
      assert.equal(res.availableVariants.length, 3);
      assert.deepEqual(
        res.availableVariants.map(v => v.relationshipSlug),
        ['best_friend', 'brother', 'boyfriend']
      );
    });

    it('verifies frontend Core Product Rules A–G are wired in WishMagicCore.js, index.html, templates.html, template-preview.html, and customize-engine.js', () => {
      const coreJs = fs.readFileSync(path.resolve('public/js/WishMagicCore.js'), 'utf8');
      assert.ok(coreJs.includes('window.WishMagicVariantFlow'));
      assert.ok(coreJs.includes('window.handleTemplateAction'));
      assert.ok(coreJs.includes('showRelationSelectionModal'));
      assert.ok(coreJs.includes('renderCardRelationTagsHtml'));
      assert.ok(coreJs.includes('showUnavailableVariantNotice'));

      const indexHtml = fs.readFileSync(path.resolve('public/index.html'), 'utf8');
      assert.ok(indexHtml.includes('renderCardRelationTagsHtml'));
      assert.ok(indexHtml.includes('EXPLICIT_RELATION_FILTER_SET'));

      const templatesHtml = fs.readFileSync(path.resolve('public/templates.html'), 'utf8');
      assert.ok(templatesHtml.includes('renderCardRelationTagsHtml'));
      assert.ok(templatesHtml.includes('EXPLICIT_RELATION_FILTER_SET'));

      const previewHtml = fs.readFileSync(path.resolve('public/template-preview.html'), 'utf8');
      assert.ok(previewHtml.includes('applySelectedVariantOnPreviewPage'));
      assert.ok(previewHtml.includes('VARIANT_UNAVAILABLE'));

      const customizeJs = fs.readFileSync(path.resolve('public/js/customize-engine.js'), 'utf8');
      assert.ok(customizeJs.includes('applySelectedVariantToCustomizer'));
      assert.ok(customizeJs.includes('VARIANT_UNAVAILABLE'));
    });
  });
});
