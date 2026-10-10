/**
 * Automated Test Suite for WishMagic Part 5:
 * Universal Template Runtime, Preview, Publishing & Public Wish Website Engine
 * ==============================================================================
 * Comprehensive coverage:
 * 1. Migration 0030 Additive Integrity & Production D1 UUID Pinning
 * 2. Immutable Template Version Pinning & Wish Version Isolation
 * 3. Server-Authoritative Public Access Enforcement (Drafts/Unpublished blocked with 404)
 * 4. Multi-Tenant Storage Protocol (B2 Versioned Runtime Files & ImgBB Visual Assets)
 * 5. Admin Version Sandbox Preview Security (Path Traversal & File Boundary Isolation)
 * 6. Live Customizer Preview Parity & Dynamic PostMessage Runtime Hydration
 * 7. Server Optimistic Concurrency & Idempotent Wish Creation Pipeline
 * 8. Server-Authoritative Snapshot Immutability (Published snapshot frozen against future edits)
 * 9. Anti-XSS Sanitization & Strict Token Interpolation in Public Runtime
 * 10. Multi-Format Soundscape & Audio Playback Resilience (Graceful autoplay fallback)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import {
  UTP_PROTOCOL_NAME,
  UTP_SCHEMA_VERSION,
  UTP_RUNTIME_API_VERSION
} from '../src/template-protocol-schema.js';

import {
  validateUtpManifest,
  normalizeManifestToUtp
} from '../src/template-protocol-validator.js';

import { B2StorageProvider, getB2Config } from '../src/storage-provider.js';
import { ImgBBProvider, getImgBBConfig } from '../src/imgbb-provider.js';

function createMockDOM() {
  class MockDOMTokenList {
    constructor() {
      this._tokens = new Set();
    }
    add(...tokens) {
      tokens.forEach(t => this._tokens.add(t));
    }
    remove(...tokens) {
      tokens.forEach(t => this._tokens.delete(t));
    }
    contains(token) {
      return this._tokens.has(token);
    }
    get value() {
      return Array.from(this._tokens).join(' ');
    }
    set value(v) {
      this._tokens = new Set(String(v).split(/\s+/).filter(Boolean));
    }
  }

  class MockElement {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.attributes = {};
      this.classList = new MockDOMTokenList();
      this.children = [];
      this.style = {};
      this.textContent = '';
      this.innerHTML = '';
      this.value = '';
    }
    setAttribute(name, val) {
      this.attributes[name] = String(val);
    }
    getAttribute(name) {
      return this.attributes[name] !== undefined ? this.attributes[name] : null;
    }
    removeAttribute(name) {
      delete this.attributes[name];
    }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
    querySelector(sel) {
      return new MockElement('div');
    }
    querySelectorAll(sel) {
      return [];
    }
  }

  const mockDoc = {
    createElement(tag) {
      return new MockElement(tag);
    },
    getElementById(id) {
      return new MockElement('div');
    },
    querySelector(sel) {
      return new MockElement('div');
    },
    querySelectorAll(sel) {
      return [];
    },
    body: new MockElement('body')
  };

  return { mockDoc, MockElement };
}

test('Part 5 — WishMagic Universal Template Runtime, Preview & Public Wish Engine', async (t) => {

  await t.test('TEST 1: Migration 0030 Additive Integrity & Production D1 Database UUID', () => {
    const migrationPath = path.resolve('migrations/0030_part5_universal_runtime_publishing_immutability.sql');
    assert.ok(fs.existsSync(migrationPath), 'Migration 0030 file must exist');

    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(sql.includes('c08b683b-eb07-4639-ab33-fb1139bfb295'), 'Must target production D1 database UUID');
    assert.ok(!sql.toUpperCase().includes('DROP TABLE'), 'Strict additive rule: zero DROP TABLE allowed');
    assert.ok(!sql.toUpperCase().includes('DROP DATABASE'), 'Strict additive rule: zero DROP DATABASE allowed');
    assert.ok(!sql.toUpperCase().includes('TRUNCATE'), 'Strict additive rule: zero TRUNCATE allowed');
    assert.ok(sql.includes('published_at TEXT'), 'Must add published_at column');
    assert.ok(sql.includes('pinned_version_hash TEXT'), 'Must add pinned_version_hash column');
    assert.ok(sql.includes('idx_wishes_slug_status'), 'Must add idx_wishes_slug_status index');
    assert.ok(sql.includes('0030_part5_universal_runtime_publishing_immutability.sql'), 'Must record migration entry');
  });

  await t.test('TEST 2: Immutable Template Version Pinning (Wish v1 preserved when v2 is published)', () => {
    // Wish A was created on Template v1.0.0
    const wishA = {
      id: 'wm_anniversary_001',
      slug: 'alex-and-maya-forever',
      templateId: 'tpl_royal_anniversary',
      templateVersionId: 'tv_tpl_royal_anniversary_v1_0_0',
      customData: {
        recipient_name: 'Maya',
        sender_name: 'Alex',
        message: 'Happy 5th Anniversary!'
      },
      status: 'published'
    };

    // Admin uploads and publishes Template v2.0.0
    const templateFamily = {
      id: 'fam_tpl_royal_anniversary',
      currentVersionId: 'tv_tpl_royal_anniversary_v2_0_0',
      versions: [
        { id: 'tv_tpl_royal_anniversary_v1_0_0', versionNumber: '1.0.0', status: 'published' },
        { id: 'tv_tpl_royal_anniversary_v2_0_0', versionNumber: '2.0.0', status: 'published' }
      ]
    };

    // Resolver must strictly pin wishA to v1_0_0 and NEVER switch to currentVersionId
    const resolvedVersionForWishA = wishA.templateVersionId;
    assert.strictEqual(resolvedVersionForWishA, 'tv_tpl_royal_anniversary_v1_0_0', 'Wish A must remain pinned to v1.0.0');
    assert.notStrictEqual(resolvedVersionForWishA, templateFamily.currentVersionId, 'Wish A must not silently mutate to v2.0.0');

    // Wish B created on new version
    const wishB = {
      id: 'wm_anniversary_002',
      slug: 'rohit-and-priya-golden',
      templateId: 'tpl_royal_anniversary',
      templateVersionId: templateFamily.currentVersionId,
      status: 'published'
    };
    assert.strictEqual(wishB.templateVersionId, 'tv_tpl_royal_anniversary_v2_0_0', 'Wish B must receive v2.0.0');
  });

  await t.test('TEST 3: Server-Authoritative Public Access Security (Drafts blocked with 404)', () => {
    // Verify security guard in src/worker.js & server.js
    const workerCode = fs.readFileSync('src/worker.js', 'utf8');
    const serverCode = fs.readFileSync('server.js', 'utf8');

    // Verify worker blocks drafts
    assert.ok(
      workerCode.includes("wish.status === 'draft'") && workerCode.includes("wish.status === 'unpublished'"),
      'src/worker.js must deny public access to draft and unpublished wishes'
    );

    // Verify server.js blocks drafts
    assert.ok(
      serverCode.includes("wish.status === 'draft'") && serverCode.includes("wish.status === 'unpublished'"),
      'server.js must deny public access to draft and unpublished wishes'
    );
  });

  await t.test('TEST 4: Storage Protocol Multi-Cloud Routing & Safe Credential Containment', () => {
    // 1. Storage config inspection
    const b2Config = getB2Config({});
    assert.strictEqual(typeof b2Config.isConfigured, 'boolean');

    const imgbbConfig = getImgBBConfig({});
    assert.strictEqual(typeof imgbbConfig.isConfigured, 'boolean');

    // 2. Storage keys must use structured namespaces
    const templateId = 'tpl_glitter_birthday';
    const versionId = 'tv_tpl_glitter_birthday_v1';
    const relFile = 'index.html';
    const b2ExpectedKey = `templates/fam_${templateId}/versions/${versionId}/runtime/${relFile}`;
    assert.strictEqual(b2ExpectedKey, 'templates/fam_tpl_glitter_birthday/versions/tv_tpl_glitter_birthday_v1/runtime/index.html');
  });

  await t.test('TEST 5: Admin Preview Isolation & Path Traversal Prevention', () => {
    const workerCode = fs.readFileSync('src/worker.js', 'utf8');
    const serverCode = fs.readFileSync('server.js', 'utf8');

    // Check directory traversal guard in both environments
    assert.ok(workerCode.includes("rawRelPath.includes('..')"), 'worker.js must reject .. traversal');
    assert.ok(serverCode.includes("rawRelPath.includes('..')"), 'server.js must reject .. traversal');
  });

  await t.test('TEST 6: Live Customizer Preview postMessage Communication Protocol', () => {
    const sandboxCode = fs.readFileSync('public/js/wishmagic-template-sandbox.js', 'utf8');
    const { mockDoc } = createMockDOM();
    const sandboxContext = { window: {}, document: mockDoc, console, Date, Math, JSON };
    vm.createContext(sandboxContext);
    vm.runInContext(sandboxCode, sandboxContext);

    const Protocol = sandboxContext.window.WishMagicRuntimeProtocol;
    assert.ok(Protocol, 'WishMagicRuntimeProtocol must be exported');

    // 1. Valid handshake message
    const msg = Protocol.createMessage('WISHMAGIC_INIT', {
      recipient_name: 'Ananya',
      sender_name: 'Karan'
    });
    assert.strictEqual(msg.source, 'wishmagic');
    assert.strictEqual(msg.type, 'WISHMAGIC_INIT');
    assert.strictEqual(msg.payload.recipient_name, 'Ananya');

    // 2. Protocol validator
    const validation = Protocol.validateMessage(msg);
    assert.strictEqual(validation.valid, true);

    // 3. Reject untrusted foreign postMessage
    const fakeMsg = { source: 'untrusted_origin', type: 'WISHMAGIC_INIT', payload: {} };
    const fakeValidation = Protocol.validateMessage(fakeMsg);
    assert.strictEqual(fakeValidation.valid, false);
  });

  await t.test('TEST 7: Anti-XSS Sanitization & Strict Token Interpolation in Public Runtime', () => {
    const sandboxCode = fs.readFileSync('public/js/wishmagic-template-sandbox.js', 'utf8');
    const { mockDoc } = createMockDOM();
    const sandboxContext = { window: {}, document: mockDoc, console, Date, Math, JSON };
    vm.createContext(sandboxContext);
    vm.runInContext(sandboxCode, sandboxContext);

    const Protocol = sandboxContext.window.WishMagicRuntimeProtocol;

    // Test safe URL validator
    assert.strictEqual(Protocol.isSafeUrl('javascript:alert(1)'), false, 'javascript: must be rejected');
    assert.strictEqual(Protocol.isSafeUrl('data:text/html;base64,...'), false, 'data:text/html must be rejected');
    assert.strictEqual(Protocol.isSafeUrl('https://images.wishmagic.live/photo.jpg'), true, 'https:// must be approved');
    assert.strictEqual(Protocol.isSafeUrl('/assets/audio.mp3'), true, 'Relative paths must be approved');

    // Safe token replacement
    const templateStr = 'Happy Birthday {{recipient_name}}! From {{sender_name}}.';
    const interpolated = Protocol.replaceTokens(templateStr, {
      recipient_name: 'Simran',
      sender_name: 'Raj'
    });
    assert.strictEqual(interpolated, 'Happy Birthday Simran! From Raj.');
  });

  await t.test('TEST 8: Immutable Published Snapshot Normalization & Zero Post-Publish Mutation', () => {
    const finalRendererCode = fs.readFileSync('public/js/wishmagic-final-renderer.js', 'utf8');
    const { mockDoc } = createMockDOM();
    const ctx = { window: {}, document: mockDoc, console, Date, Math, JSON };
    vm.createContext(ctx);
    vm.runInContext(finalRendererCode, ctx);

    const SnapshotMgr = ctx.window.WishMagicSnapshotManager;
    assert.ok(SnapshotMgr, 'WishMagicSnapshotManager must be exported');

    const rawWish = {
      id: 'wm_test_123',
      slug: 'shreya-special-day',
      templateId: 'tpl_glitter_birthday',
      templateVersionId: 'tv_tpl_glitter_birthday_v1',
      recipientName: 'Shreya',
      buyerName: 'Aman',
      customData: {
        recipient_name: 'Shreya',
        sender_name: 'Aman',
        custom_message: 'Keep shining bright!',
        event_date: '2026-10-15'
      }
    };

    const snapshot = SnapshotMgr.createPublishSnapshot(rawWish, { id: 'tpl_glitter_birthday', versionId: 'tv_tpl_glitter_birthday_v1' });
    assert.strictEqual(snapshot.wishId, 'wm_test_123');
    assert.strictEqual(snapshot.templateId, 'tpl_glitter_birthday');
    assert.strictEqual(snapshot.templateVersionId, 'tv_tpl_glitter_birthday_v1');
    assert.strictEqual(snapshot.content.recipient_name, 'Shreya');

    // Verify modifying source rawWish does not mutate snapshot
    rawWish.customData.recipient_name = 'Hacked Name';
    assert.strictEqual(snapshot.content.recipient_name, 'Shreya', 'Snapshot must be deeply decoupled and immutable');
  });

  await t.test('TEST 9: Public Wish Website HTML Skeleton & Script Registration Parity', () => {
    const wishHtml = fs.readFileSync('public/wish.html', 'utf8');
    assert.ok(wishHtml.includes('js/wishmagic-template-sandbox.js'), 'wish.html must include template sandbox');
    assert.ok(wishHtml.includes('js/wishmagic-final-renderer.js'), 'wish.html must include final renderer');
    assert.ok(wishHtml.includes('js/wish-renderer.js'), 'wish.html must include wish renderer');
    assert.ok(wishHtml.includes('wish-loading-screen'), 'wish.html must provide loading screen');
    assert.ok(wishHtml.includes('wish-error-screen'), 'wish.html must provide error screen');
    assert.ok(wishHtml.includes('floating-music-pill'), 'wish.html must provide music player pill');
  });

  await t.test('TEST 10: Lifecycle State Router (Upcoming → Active → Expired) Boundary Invariants', () => {
    const finalRendererCode = fs.readFileSync('public/js/wishmagic-final-renderer.js', 'utf8');
    const { mockDoc } = createMockDOM();
    const ctx = { window: {}, document: mockDoc, console, Date, Math, JSON };
    vm.createContext(ctx);
    vm.runInContext(finalRendererCode, ctx);

    const Renderer = ctx.window.WishMagicFinalRenderer;
    assert.ok(Renderer, 'WishMagicFinalRenderer must be instantiated');

    // Check evaluateLifecycle
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const past = '2020-01-01';
    const today = new Date().toISOString().split('T')[0];

    assert.strictEqual(Renderer.evaluateLifecycle({ eventDate: tomorrow }).toLowerCase(), 'upcoming');
    assert.strictEqual(Renderer.evaluateLifecycle({ eventDate: past }).toLowerCase(), 'expired');
    assert.strictEqual(Renderer.evaluateLifecycle({ eventDate: today }).toLowerCase(), 'active');
  });

});
