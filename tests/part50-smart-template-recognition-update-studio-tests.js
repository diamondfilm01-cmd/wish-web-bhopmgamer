/**
 * Part 50: Smart Template Recognition, Side-by-Side Comparison & Safe Update Studio Test Suite
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from '../scripts/sqlite-compat.js';
import { D1MigrationRunner } from '../scripts/migration-runner.js';
import JSZip from '../src/vendor/jszip.js';

import {
  RECOGNITION_OUTCOME,
  IMPORT_SESSION_STATE,
  IMPORT_DECISION_MODE,
  SANDBOXED_PREVIEW_CSP,
  deserializeStagedFilesBundle,
  buildSandboxedTemplatePreviewHtml,
  inspectAndValidateTemplateZip,
  recognizeTemplatePackage,
  compareExistingTemplateWithStagedPackage,
  stageAndRecognizeTemplateZip,
  compareImportSessionWithTarget,
  validateImportSessionDecision,
  publishImportSession,
  cancelImportSession,
  loadSingleTemplateComparisonContext
} from '../src/template-recognition-engine.js';

function createD1Adapter(sqliteDb) {
  return {
    raw: sqliteDb,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async run() {
              const stmt = sqliteDb.prepare(sql);
              const info = stmt.run(...params);
              return { success: true, meta: { changes: info.changes } };
            },
            async first() {
              const stmt = sqliteDb.prepare(sql);
              return stmt.get(...params) || null;
            },
            async all() {
              const stmt = sqliteDb.prepare(sql);
              const results = stmt.all(...params);
              return { success: true, results };
            }
          };
        },
        async run() {
          const stmt = sqliteDb.prepare(sql);
          const info = stmt.run();
          return { success: true, meta: { changes: info.changes } };
        },
        async first() {
          const stmt = sqliteDb.prepare(sql);
          return stmt.get() || null;
        },
        async all() {
          const stmt = sqliteDb.prepare(sql);
          const results = stmt.all();
          return { success: true, results };
        }
      };
    }
  };
}

async function createInMemoryTestDb() {
  const syncDb = new DatabaseSync(':memory:');
  const d1 = createD1Adapter(syncDb);
  const runner = new D1MigrationRunner(d1);
  await runner.runMigrations();
  return d1;
}

async function createTestTemplateZip(manifestObj = {}, extraFiles = {}) {
  const zip = new JSZip();
  const manifest = {
    schemaVersion: '1.2.0',
    template: {
      id: 'tpl_cosmic_birthday',
      slug: 'cosmic-birthday',
      name: 'Cosmic Birthday Experience',
      version: '1.0.0',
      category: 'Birthday',
      entry: 'index.html',
      ...(manifestObj.template || {})
    },
    sections: manifestObj.sections || [
      { id: 'hero', label: 'Hero Header' },
      { id: 'cake', label: 'Interactive Cake' }
    ],
    fields: manifestObj.fields || [
      { id: 'recipient_name', section: 'hero', type: 'text', defaultValue: 'Friend' },
      { id: 'wish_message', section: 'hero', type: 'textarea', defaultValue: 'Happy Birthday!' }
    ],
    actions: manifestObj.actions || [
      { id: 'blow_candles', label: 'Blow Candles', type: 'none' }
    ],
    variants: manifestObj.variants || [
      { relationship: 'best_friend', title: 'Best Friend Cosmic Cut' }
    ]
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('index.html', `<!DOCTYPE html><html><head><title>${manifest.template.name}</title></head><body><section data-wm-section="hero"><h1 data-wm-field="recipient_name">Friend</h1></section><section data-wm-section="cake"><button data-wm-action="blow_candles">Blow</button></section></body></html>`);
  zip.file('css/style.css', 'body { background: #0b021d; color: #fff; }');

  for (const [p, content] of Object.entries(extraFiles)) {
    zip.file(p, content);
  }

  return await zip.generateAsync({ type: 'uint8array' });
}

describe('Part 50: Smart Template Recognition & Update Studio', () => {
  it('1. Constants & Enums Integrity', () => {
    assert.equal(RECOGNITION_OUTCOME.EXACT_EXISTING_IDENTITY, 'EXACT_EXISTING_IDENTITY');
    assert.equal(RECOGNITION_OUTCOME.IDENTITY_CONFLICT, 'IDENTITY_CONFLICT');
    assert.equal(IMPORT_SESSION_STATE.RECOGNIZED, 'RECOGNIZED');
    assert.equal(IMPORT_SESSION_STATE.PUBLISHED, 'PUBLISHED');
    assert.equal(IMPORT_DECISION_MODE.UPDATE_EXISTING, 'update_existing');
    assert.equal(IMPORT_DECISION_MODE.CREATE_NEW, 'create_new');
    assert.ok(SANDBOXED_PREVIEW_CSP.includes("default-src 'self'"));
  });

  it('2. Deserializes staged files bundle accurately into memory map', () => {
    const rawContent = 'console.log("hello world");';
    const bundle = {
      files: [
        { path: 'index.html', text: '<h1>Hello</h1>', mimeType: 'text/html' },
        { path: 'app.js', contentBase64: Buffer.from(rawContent).toString('base64'), mimeType: 'application/javascript' }
      ]
    };

    const map = deserializeStagedFilesBundle(bundle);
    assert.equal(map.size, 2);
    assert.ok(map.has('index.html'));
    assert.ok(map.has('app.js'));
    assert.equal(map.get('app.js').text, rawContent);
  });

  it('3. Sandboxed preview HTML strips hidden sections and injects CSP', () => {
    const entryHtml = `<!DOCTYPE html><html><head><title>Test</title></head><body><section data-wm-section="hero">Hero Visible</section><section data-wm-section="secret_cake">Hidden Cake</section></body></html>`;
    const res = buildSandboxedTemplatePreviewHtml({
      entryHtml,
      visibilityConfig: { secret_cake: false, hero: true },
      previewBaseUrl: '/api/templates/import-studio/session_123/preview/staged'
    });

    assert.equal(res.ok, true);
    assert.ok(!res.html.includes('Hidden Cake'));
    assert.ok(res.html.includes('Hero Visible'));
    assert.ok(res.html.includes('Content-Security-Policy'));
    assert.ok(res.html.includes('<base href="/api/templates/import-studio/session_123/preview/staged/">'));
  });

  it('4. Ingests and inspects valid ZIP package computing deterministic hashes', async () => {
    const zipBytes = await createTestTemplateZip();
    const result = await inspectAndValidateTemplateZip(zipBytes, { filename: 'test-cosmic.zip' });

    assert.equal(result.valid, true);
    assert.equal(result.packageMetadata.detectedSlug, 'cosmic-birthday');
    assert.equal(result.packageMetadata.canonicalTemplateId, 'tpl_cosmic_birthday');
    assert.ok(result.packageFingerprint.length > 0);
    assert.ok(result.runtimeHash.length > 0);
    assert.ok(result.sourceZipSha256.length > 0);
  });

  it('5. Recognizes exact existing template match when template ID exists in DB', async () => {
    const db = await createInMemoryTestDb();

    // Insert an existing template
    await db.prepare(`
      INSERT INTO templates (id, slug, name, category, status, lock_version, thumbnail, folder, created_at, updated_at)
      VALUES ('tpl_cosmic_birthday', 'cosmic-birthday', 'Cosmic Birthday Experience', 'Birthday', 'published', 1, '/assets/file_ab2082.png', 'cosmic-birthday', datetime('now'), datetime('now'))
    `).run();

    const zipBytes = await createTestTemplateZip();
    const session = await stageAndRecognizeTemplateZip({
      db,
      zipBuffer: zipBytes,
      filename: 'cosmic-birthday-update.zip',
      adminUser: { id: 'admin_1', email: 'ankit.babusaini@gmail.com' }
    });

    assert.equal(session.recognitionOutcome, RECOGNITION_OUTCOME.EXACT_EXISTING_IDENTITY);
    assert.equal(session.selectedTargetTemplateId, 'tpl_cosmic_birthday');
    assert.equal(session.state, IMPORT_SESSION_STATE.RECOGNIZED);
    assert.ok(session.previewUrls.staged.includes(session.sessionId));
  });

  it('6. Detects cross-entity identity conflict when declared ID belongs to template A and slug belongs to template B', async () => {
    const db = await createInMemoryTestDb();

    await db.prepare(`
      INSERT INTO templates (id, slug, name, category, status, lock_version, thumbnail, folder, created_at, updated_at)
      VALUES ('tpl_alpha', 'alpha-slug', 'Alpha Template', 'Birthday', 'published', 1, '/assets/file_ab2082.png', 'alpha-slug', datetime('now'), datetime('now')),
             ('tpl_beta', 'beta-slug', 'Beta Template', 'Birthday', 'published', 1, '/assets/file_ab2082.png', 'beta-slug', datetime('now'), datetime('now'))
    `).run();

    // Create a zip with ID = tpl_alpha but slug = beta-slug
    const zipBytes = await createTestTemplateZip({
      template: {
        id: 'tpl_alpha',
        slug: 'beta-slug',
        name: 'Conflict Package'
      }
    });

    const session = await stageAndRecognizeTemplateZip({
      db,
      zipBuffer: zipBytes,
      filename: 'conflict-package.zip',
      adminUser: { id: 'admin_1', email: 'ankit.babusaini@gmail.com' }
    });

    assert.equal(session.recognitionOutcome, RECOGNITION_OUTCOME.IDENTITY_CONFLICT);
    assert.ok(session.conflicts.length > 0);
    assert.equal(session.conflicts[0].code, 'ID_SLUG_CROSS_COLLISION');
  });

  it('7. Detects destructive field removals in comparison diff', () => {
    const existingContext = {
      template: { id: 'tpl_test', name: 'Test Template' },
      version: {
        manifest_json: JSON.stringify({
          fields: [
            { id: 'recipient_name', type: 'text' },
            { id: 'special_secret_code', type: 'text' }
          ],
          sections: [{ id: 'hero' }, { id: 'music_player' }]
        })
      },
      files: [{ relative_path: 'index.html' }, { relative_path: 'old_asset.png' }]
    };

    const stagedPackage = {
      manifest: {
        fields: [{ id: 'recipient_name', type: 'text' }], // special_secret_code removed
        sections: [{ id: 'hero' }] // music_player removed
      },
      filesMap: new Map([
        ['index.html', { sizeBytes: 100 }],
        ['new_asset.png', { sizeBytes: 200 }]
      ])
    };

    const comparison = compareExistingTemplateWithStagedPackage({ existingContext, stagedPackage });
    assert.equal(comparison.files.summary.addedCount, 1); // new_asset.png
    assert.equal(comparison.files.summary.removedCount, 1); // old_asset.png
    assert.ok(comparison.destructiveWarnings.some(w => w.type === 'FIELD_REMOVED' && w.fieldId === 'special_secret_code'));
    assert.ok(comparison.destructiveWarnings.some(w => w.type === 'SECTION_REMOVED' && w.sectionId === 'music_player'));
  });

  it('8. Enforces unacknowledged destructive removal protection on decision validation', async () => {
    const db = await createInMemoryTestDb();

    await db.prepare(`
      INSERT INTO templates (id, slug, name, category, status, lock_version, thumbnail, folder, created_at, updated_at)
      VALUES ('tpl_test', 'test-slug', 'Test Template', 'Birthday', 'published', 1, '/assets/file_ab2082.png', 'test-slug', datetime('now'), datetime('now'))
    `).run();

    // Target template has 2 fields in version
    await db.prepare(`
      INSERT INTO template_versions (id, template_id, name, version_number, version_label, status, manifest_json, created_at)
      VALUES ('ver_v1', 'tpl_test', 'Test Template', 1, 'v1.0.0', 'published', '{"fields":[{"id":"field_1"},{"id":"field_2_critical"}],"sections":[{"id":"hero"}]}', datetime('now'))
    `).run();

    await db.prepare(`UPDATE templates SET current_version_id = 'ver_v1' WHERE id = 'tpl_test'`).run();

    // Upload ZIP that drops field_2_critical
    const zipBytes = await createTestTemplateZip({
      template: { id: 'tpl_test', slug: 'test-slug' },
      fields: [{ id: 'field_1' }]
    });

    const session = await stageAndRecognizeTemplateZip({
      db,
      zipBuffer: zipBytes,
      filename: 'destructive-update.zip',
      adminUser: { id: 'admin_1', email: 'ankit.babusaini@gmail.com' }
    });

    // Validating update_existing without acknowledging warnings must throw
    await assert.rejects(async () => {
      await validateImportSessionDecision({
        db,
        sessionId: session.sessionId,
        decisionMode: IMPORT_DECISION_MODE.UPDATE_EXISTING,
        warningsAcknowledged: false
      });
    }, (err) => {
      assert.equal(err.code, 'DESTRUCTIVE_CHANGES_UNACKNOWLEDGED');
      return true;
    });

    // Validating with warningsAcknowledged = true must succeed
    const validRes = await validateImportSessionDecision({
      db,
      sessionId: session.sessionId,
      decisionMode: IMPORT_DECISION_MODE.UPDATE_EXISTING,
      warningsAcknowledged: true
    });
    assert.equal(validRes.state, IMPORT_SESSION_STATE.VALIDATED);
  });

  it('9. Optimistic Concurrency Control: Rejects publication with 409 when lock_version mismatches', async () => {
    const db = await createInMemoryTestDb();

    await db.prepare(`
      INSERT INTO templates (id, slug, name, category, status, lock_version, thumbnail, folder, created_at, updated_at)
      VALUES ('tpl_target', 'target-slug', 'Target Template', 'Birthday', 'published', 2, '/assets/file_ab2082.png', 'target-slug', datetime('now'), datetime('now'))
    `).run();

    const zipBytes = await createTestTemplateZip({ template: { id: 'tpl_target', slug: 'target-slug' } });
    const session = await stageAndRecognizeTemplateZip({
      db,
      zipBuffer: zipBytes,
      filename: 'stale-lock.zip',
      adminUser: { id: 'admin_1', email: 'ankit.babusaini@gmail.com' }
    });

    await validateImportSessionDecision({
      db,
      sessionId: session.sessionId,
      decisionMode: IMPORT_DECISION_MODE.UPDATE_EXISTING,
      warningsAcknowledged: true
    });

    // Expect lockVersion = 1, but DB has lock_version = 2
    await assert.rejects(async () => {
      await publishImportSession({
        db,
        sessionId: session.sessionId,
        expectedLockVersion: 1,
        adminUser: { id: 'admin_1', email: 'ankit.babusaini@gmail.com' }
      });
    }, (err) => {
      assert.equal(err.code, 'CONCURRENCY_CONFLICT');
      assert.equal(err.status, 409);
      assert.equal(err.currentLockVersion, 2);
      return true;
    });
  });

  it('10. End-to-end Publish: Creates immutable new version, updates templates and marks session PUBLISHED', async () => {
    const db = await createInMemoryTestDb();

    await db.prepare(`
      INSERT INTO templates (id, slug, name, category, status, lock_version, thumbnail, folder, created_at, updated_at)
      VALUES ('tpl_main', 'main-slug', 'Main Template', 'Birthday', 'published', 1, '/assets/file_ab2082.png', 'main-slug', datetime('now'), datetime('now'))
    `).run();

    await db.prepare(`
      INSERT INTO template_versions (id, template_id, name, version_number, version_label, status, manifest_json, created_at)
      VALUES ('ver_100', 'tpl_main', 'Main Template', 1, 'v1.0.0', 'published', '{}', datetime('now'))
    `).run();
    await db.prepare(`UPDATE templates SET current_version_id = 'ver_100' WHERE id = 'tpl_main'`).run();

    const zipBytes = await createTestTemplateZip({ template: { id: 'tpl_main', slug: 'main-slug' } });
    const session = await stageAndRecognizeTemplateZip({
      db,
      zipBuffer: zipBytes,
      filename: 'valid-update.zip',
      adminUser: { id: 'admin_1', email: 'ankit.babusaini@gmail.com' }
    });

    await validateImportSessionDecision({
      db,
      sessionId: session.sessionId,
      decisionMode: IMPORT_DECISION_MODE.UPDATE_EXISTING,
      warningsAcknowledged: true
    });

    const pubRes = await publishImportSession({
      db,
      sessionId: session.sessionId,
      expectedLockVersion: 1,
      adminUser: { id: 'admin_1', email: 'ankit.babusaini@gmail.com' }
    });

    assert.equal(pubRes.success, true);
    assert.equal(pubRes.publishedTemplateId, 'tpl_main');
    assert.equal(pubRes.previousVersionId, 'ver_100');
    assert.ok(pubRes.publishedVersionId.startsWith('ver_'));

    // Check DB state
    const tplRow = await db.prepare('SELECT * FROM templates WHERE id = ?').bind('tpl_main').first();
    assert.equal(tplRow.current_version_id, pubRes.publishedVersionId);
    assert.equal(tplRow.rollback_version_id, 'ver_100');
    assert.equal(tplRow.lock_version, 2);

    const sessionRow = await db.prepare('SELECT * FROM template_import_sessions WHERE id = ?').bind(session.sessionId).first();
    assert.equal(sessionRow.state, IMPORT_SESSION_STATE.PUBLISHED);
  });

  it('11. Cancels session cleanly without modifying published templates', async () => {
    const db = await createInMemoryTestDb();
    const zipBytes = await createTestTemplateZip();
    const session = await stageAndRecognizeTemplateZip({
      db,
      zipBuffer: zipBytes,
      filename: 'cancel-test.zip',
      adminUser: { id: 'admin_1', email: 'ankit.babusaini@gmail.com' }
    });

    const cancelRes = await cancelImportSession({ db, sessionId: session.sessionId });
    assert.equal(cancelRes.success, true);

    const sessionRow = await db.prepare('SELECT state FROM template_import_sessions WHERE id = ?').bind(session.sessionId).first();
    assert.equal(sessionRow.state, IMPORT_SESSION_STATE.CANCELLED);
  });
});
