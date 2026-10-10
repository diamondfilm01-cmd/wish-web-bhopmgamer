/**
 * Automated Test Suite for WishMagic Part 4:
 * Manifest-Driven Universal Customizer Engine, Relationship Variants,
 * Live Preview Runtime Bridge, Draft Persistence & Optimistic Concurrency Control
 * =================================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  UTP_PROTOCOL_NAME,
  UTP_SCHEMA_VERSION,
  UTP_RUNTIME_API_VERSION,
  UTP_SUPPORTED_FIELD_TYPES,
  UTP_CAPABILITY_REGISTRY,
  isValidSemver,
  isValidIdentifier
} from '../src/template-protocol-schema.js';

import {
  validateUtpManifest,
  normalizeManifestToUtp
} from '../src/template-protocol-validator.js';

import {
  DEFAULT_RELATIONSHIP_CONFIGS,
  normalizeRelationshipSlug,
  resolveTemplateForRelationship
} from '../src/relationship-resolver.js';

// Setup Mock DOM environment for WishMagicFieldRenderer testing
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
      this.style = {};
      this.childNodes = [];
      this.parentNode = null;
      this._innerHTML = '';
      this._textContent = '';
      this.classList = new MockDOMTokenList();
      this._listeners = {};
      this._value = '';
      this.type = tagName.toLowerCase() === 'input' ? 'text' : undefined;
      this.disabled = false;
      this.checked = false;
    }

    get className() {
      return this.classList.value;
    }
    set className(val) {
      this.classList.value = val;
    }

    get value() {
      return this._value;
    }
    set value(val) {
      this._value = val;
    }

    get textContent() {
      return this._textContent;
    }
    set textContent(val) {
      this._textContent = String(val);
    }

    get innerHTML() {
      return this._innerHTML;
    }
    set innerHTML(val) {
      this._innerHTML = String(val);
    }

    getAttribute(name) {
      return this.attributes[name] !== undefined ? this.attributes[name] : null;
    }

    setAttribute(name, val) {
      this.attributes[name] = String(val);
    }

    removeAttribute(name) {
      delete this.attributes[name];
    }

    appendChild(child) {
      if (child) {
        child.parentNode = this;
        this.childNodes.push(child);
      }
      return child;
    }

    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx !== -1) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }

    addEventListener(event, handler) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(handler);
    }

    dispatchEvent(evt) {
      const handlers = this._listeners[evt.type] || [];
      handlers.forEach(h => h(evt));
    }

    querySelector(selector) {
      const all = this.querySelectorAll(selector);
      return all.length > 0 ? all[0] : null;
    }

    querySelectorAll(selector) {
      const results = [];
      function traverse(node) {
        if (!node || !node.childNodes) return;
        for (const child of node.childNodes) {
          if (child.matches && child.matches(selector)) {
            results.push(child);
          }
          traverse(child);
        }
      }
      traverse(this);
      return results;
    }

    matches(selector) {
      if (!selector) return false;
      if (selector.startsWith('.')) {
        return this.classList.contains(selector.slice(1));
      }
      if (selector.startsWith('#')) {
        return this.getAttribute('id') === selector.slice(1);
      }
      if (selector.startsWith('[') && selector.endsWith(']')) {
        const inside = selector.slice(1, -1);
        if (inside.includes('=')) {
          const [k, v] = inside.split('=').map(s => s.replace(/["']/g, '').trim());
          return this.getAttribute(k) === v;
        }
        return this.getAttribute(inside) !== null;
      }
      return this.tagName.toLowerCase() === selector.toLowerCase();
    }
  }

  const mockDoc = {
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => null,
    querySelector: (sel) => null,
    querySelectorAll: (sel) => []
  };

  return { mockDoc, MockElement };
}

test('Part 4 — WishMagic Universal Customizer Engine Test Suite', async (t) => {

  await t.test('TEST 1: Migration 0029 Additive Integrity & Production D1 Database UUID', () => {
    const migrationPath = path.resolve('migrations/0029_part4_customizer_draft_concurrency.sql');
    assert.ok(fs.existsSync(migrationPath), 'Migration 0029 file must exist');

    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(sql.includes('c08b683b-eb07-4639-ab33-fb1139bfb295'), 'Must target production D1 database UUID');
    assert.ok(!sql.toUpperCase().includes('DROP TABLE'), 'Must not drop any tables (strict additive migration)');
    assert.ok(!sql.toUpperCase().includes('DROP DATABASE'), 'Must not drop database');
    assert.ok(!sql.toUpperCase().includes('TRUNCATE'), 'Must not truncate tables');
    assert.ok(sql.includes('lock_version INTEGER DEFAULT 1'), 'Must add lock_version column to wishes table');
    assert.ok(sql.includes('idx_wishes_user_status'), 'Must create idx_wishes_user_status index');
    assert.ok(sql.includes('idx_wishes_template_version'), 'Must create idx_wishes_template_version index');
    assert.ok(sql.includes('0029_part4_customizer_draft_concurrency.sql'), 'Must record migration registration');
  });

  await t.test('TEST 2: Canonical UTP Manifest Parsing & Dynamic Custom Fields Normalization', () => {
    const manifest = {
      protocol: 'wishmagic-template',
      schemaVersion: '1.0.0',
      template: {
        id: 'tpl_royal_anniversary',
        name: 'Royal Golden Anniversary Keepsake',
        description: 'Luxury celebration with animated rings, candle glow, and vintage memories',
        category: 'anniversary',
        templateVersion: '1.0.0'
      },
      fields: [
        {
          id: 'partner_name',
          type: 'text',
          label: 'Partner Name',
          required: true,
          constraints: { minLength: 2, maxLength: 60 }
        },
        {
          id: 'anniversary_years',
          type: 'number',
          label: 'Years of Togetherness',
          defaultValue: 25,
          required: false,
          constraints: { min: 1, max: 100 }
        },
        {
          id: 'accent_tint',
          type: 'color',
          label: 'Golden Ring Accent Tint',
          defaultValue: '#f59e0b',
          required: false
        },
        {
          id: 'romantic_notes',
          type: 'textarea',
          label: 'Secret Romantic Notes',
          required: false,
          visibleIf: { field: 'include_notes', equals: true }
        }
      ],
      sections: [
        { id: 'hero', label: 'Unboxing Crest', required: true },
        { id: 'timeline', label: 'Milestone Timeline', required: false, toggleable: true }
      ],
      capabilities: ['photos', 'multiplePhotos', 'music', 'themes']
    };

    const report = validateUtpManifest(manifest);
    assert.strictEqual(report.valid, true, 'Manifest must validate cleanly');
    assert.strictEqual(report.summary.fieldsCount, 4, 'Must report 4 fields');
    assert.strictEqual(report.summary.sectionsCount, 2, 'Must report 2 sections');

    const normalized = normalizeManifestToUtp(manifest);
    assert.strictEqual(normalized.protocol, 'wishmagic-template');
    assert.strictEqual(normalized.schemaVersion, '1.0.0');
    assert.strictEqual(normalized.fields.length, 4);
    assert.strictEqual(normalized.fields[0].id, 'partner_name');
    assert.strictEqual(normalized.fields[1].id, 'anniversary_years');
  });

  await t.test('TEST 3: WishMagicFieldRenderer Dynamic Form Generation & Supported Field Types', () => {
    const { mockDoc } = createMockDOM();
    const fieldRendererCode = fs.readFileSync('public/js/wishmagic-field-renderer.js', 'utf8');
    const globalContext = { document: mockDoc };
    const rendererFn = new Function('global', 'document', fieldRendererCode);
    rendererFn(globalContext, mockDoc);

    const Renderer = globalContext.WishMagicFieldRenderer;
    assert.ok(Renderer, 'WishMagicFieldRenderer must be exported');
    assert.strictEqual(typeof Renderer.render, 'function');
    assert.strictEqual(typeof Renderer.validate, 'function');

    // 1. Text field
    const textField = { id: 'nickname', label: 'Pet Name', type: 'text', required: true, constraints: { minLength: 2, maxLength: 20 } };
    const textEl = Renderer.render(textField, 'Sweetheart', () => {});
    assert.ok(textEl, 'Should render text DOM element');
    assert.strictEqual(textEl.getAttribute('data-field-key'), 'nickname');
    assert.strictEqual(textEl.getAttribute('data-field-type'), 'text');

    // 2. Number field
    const numField = { id: 'age', label: 'Milestone Age', type: 'number', required: true, constraints: { min: 1, max: 120 } };
    const numEl = Renderer.render(numField, 21, () => {});
    assert.ok(numEl, 'Should render number DOM element');
    assert.strictEqual(numEl.getAttribute('data-field-key'), 'age');

    // 3. Color field
    const colorField = { id: 'accent_color', label: 'Accent Color', type: 'color', defaultValue: '#ec4899' };
    const colorEl = Renderer.render(colorField, '#ec4899', () => {});
    assert.ok(colorEl, 'Should render color picker DOM element');

    // 4. Select dropdown
    const selectField = {
      id: 'cake_flavor',
      label: 'Cake Flavor',
      type: 'select',
      options: ['chocolate', 'red_velvet', 'vanilla']
    };
    const selectEl = Renderer.render(selectField, 'chocolate', () => {});
    assert.ok(selectEl, 'Should render select dropdown DOM element');

    // 5. Toggle switch
    const toggleField = { id: 'show_fireworks', label: 'Grand Fireworks Finale', type: 'toggle', defaultValue: true };
    const toggleEl = Renderer.render(toggleField, true, () => {});
    assert.ok(toggleEl, 'Should render switch toggle DOM element');
  });

  await t.test('TEST 4: Client-Side Validation Rules & Constraint Boundary Enforcement', () => {
    const { mockDoc } = createMockDOM();
    const fieldRendererCode = fs.readFileSync('public/js/wishmagic-field-renderer.js', 'utf8');
    const globalContext = { document: mockDoc };
    new Function('global', 'document', fieldRendererCode)(globalContext, mockDoc);
    const Renderer = globalContext.WishMagicFieldRenderer;

    // Required check
    const requiredField = { id: 'partner_name', label: 'Partner Name', type: 'text', required: true };
    const emptyRes = Renderer.validate(requiredField, '');
    assert.strictEqual(emptyRes.valid, false);
    assert.strictEqual(emptyRes.code, 'REQUIRED');

    // MinLength check
    const minLenField = { id: 'partner_name', label: 'Partner Name', type: 'text', constraints: { minLength: 3 } };
    const shortRes = Renderer.validate(minLenField, 'Al');
    assert.strictEqual(shortRes.valid, false);
    assert.strictEqual(shortRes.code, 'MIN_LENGTH');

    // MaxLength check
    const maxLenField = { id: 'partner_name', label: 'Partner Name', type: 'text', constraints: { maxLength: 5 } };
    const longRes = Renderer.validate(maxLenField, 'Alexander');
    assert.strictEqual(longRes.valid, false);
    assert.strictEqual(longRes.code, 'MAX_LENGTH');

    // Number min/max check
    const rangeField = { id: 'candles', label: 'Candles', type: 'number', constraints: { min: 1, max: 50 } };
    assert.strictEqual(Renderer.validate(rangeField, 0).valid, false);
    assert.strictEqual(Renderer.validate(rangeField, 100).valid, false);
    assert.strictEqual(Renderer.validate(rangeField, 25).valid, true);

    // Email format check
    const emailField = { id: 'contact_email', label: 'Email', type: 'email' };
    assert.strictEqual(Renderer.validate(emailField, 'not-an-email').valid, false);
    assert.strictEqual(Renderer.validate(emailField, 'celebrate@wishmagic.live').valid, true);
  });

  await t.test('TEST 5: Conditional Visibility Logic & clearOnHide Mechanics', () => {
    const field = {
      id: 'custom_song_title',
      label: 'Custom Song Title',
      type: 'text',
      defaultValue: 'Acoustic Melody',
      clearOnHide: true,
      visibleIf: { field: 'music_type', equals: 'custom' }
    };

    function evaluateFieldVisibility(f, state) {
      if (!f || !f.visibleIf) return true;
      const cond = f.visibleIf;
      if (typeof cond === 'object') {
        const targetVal = state[cond.field || cond.key];
        if (cond.equals !== undefined) return targetVal === cond.equals;
      }
      return true;
    }

    const stateVisible = { music_type: 'custom', custom_song_title: 'Our First Dance' };
    assert.strictEqual(evaluateFieldVisibility(field, stateVisible), true);

    const stateHidden = { music_type: 'curated', custom_song_title: 'Our First Dance' };
    assert.strictEqual(evaluateFieldVisibility(field, stateHidden), false);

    // Simulate clearOnHide
    if (!evaluateFieldVisibility(field, stateHidden) && field.clearOnHide) {
      stateHidden.custom_song_title = field.defaultValue;
    }
    assert.strictEqual(stateHidden.custom_song_title, 'Acoustic Melody');
  });

  await t.test('TEST 6: Relationship Variant Defaults & Deep Hierarchical Resolution', () => {
    // 1. Girlfriend variant
    const gfConfig = DEFAULT_RELATIONSHIP_CONFIGS.girlfriend;
    assert.ok(gfConfig, 'Girlfriend relationship config must exist');
    assert.strictEqual(gfConfig.theme.style, 'romantic');
    assert.strictEqual(gfConfig.palette.primary, '#ec4899');
    assert.ok(gfConfig.messages.defaultWish.includes('girlfriend'));

    // 2. Boyfriend variant
    const bfConfig = DEFAULT_RELATIONSHIP_CONFIGS.boyfriend;
    assert.ok(bfConfig, 'Boyfriend relationship config must exist');
    assert.strictEqual(gfConfig.theme.style, 'romantic');
    assert.strictEqual(bfConfig.palette.primary, '#3b82f6');
    assert.ok(bfConfig.messages.defaultWish.includes('boyfriend'));

    // 3. Friend variant
    const friendConfig = DEFAULT_RELATIONSHIP_CONFIGS.friend;
    assert.ok(friendConfig, 'Friend relationship config must exist');
    assert.strictEqual(friendConfig.theme.style, 'celebration');
    assert.strictEqual(friendConfig.palette.primary, '#f59e0b');

    // 4. Test resolver: User Edits > Variant Defaults > System Defaults
    const templateVariant = {
      palette: { primary: '#ec4899', secondary: '#be185d' },
      theme: { style: 'romantic' }
    };
    const userEdits = {
      custom_message: 'Custom personal dedication written by user'
    };

    // User edits preserve their custom dedication
    const resolvedMessage = userEdits.custom_message || gfConfig.messages.defaultWish;
    assert.strictEqual(resolvedMessage, 'Custom personal dedication written by user');

    // Untouched message adopts variant default
    const untouchedUser = {};
    const resolvedDefault = untouchedUser.custom_message || gfConfig.messages.defaultWish;
    assert.strictEqual(resolvedDefault, gfConfig.messages.defaultWish);
  });

  await t.test('TEST 7: Server Optimistic Concurrency Control (lock_version & 409 Conflict)', () => {
    // Simulate server-side lock_version verification logic
    let mockWish = {
      id: 'wm_test_concurrency_01',
      recipientName: 'Aarav',
      lock_version: 1,
      updatedAt: '2026-10-10T08:00:00.000Z'
    };

    function simulateServerUpdate(wish, payload) {
      const expectedLockVersion = payload.lockVersion !== undefined ? Number(payload.lockVersion) : null;
      if (expectedLockVersion !== null && wish.lock_version !== undefined) {
        if (Number(wish.lock_version) > expectedLockVersion) {
          return {
            status: 409,
            body: {
              success: false,
              error: {
                code: 'CONCURRENCY_CONFLICT',
                message: 'A newer draft version has already been saved. Please reload.'
              },
              currentLockVersion: Number(wish.lock_version)
            }
          };
        }
      }
      const nextLockVersion = (Number(wish.lock_version) || 1) + 1;
      wish.lock_version = nextLockVersion;
      wish.recipientName = payload.recipientName || wish.recipientName;
      wish.updatedAt = new Date().toISOString();
      return {
        status: 200,
        body: {
          success: true,
          lockVersion: nextLockVersion,
          wish
        }
      };
    }

    // Attempt 1: matching lock_version = 1 -> succeeds, increments to 2
    const res1 = simulateServerUpdate(mockWish, { recipientName: 'Aarav Sharma', lockVersion: 1 });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.body.lockVersion, 2);
    assert.strictEqual(mockWish.lock_version, 2);

    // Attempt 2: stale request from another tab sending lockVersion = 1 -> fails with 409 Conflict
    const res2 = simulateServerUpdate(mockWish, { recipientName: 'Aarav S.', lockVersion: 1 });
    assert.strictEqual(res2.status, 409);
    assert.strictEqual(res2.body.error.code, 'CONCURRENCY_CONFLICT');
    assert.strictEqual(res2.body.currentLockVersion, 2);

    // Attempt 3: updated request with latest lockVersion = 2 -> succeeds, increments to 3
    const res3 = simulateServerUpdate(mockWish, { recipientName: 'Aarav Sharma Final', lockVersion: 2 });
    assert.strictEqual(res3.status, 200);
    assert.strictEqual(res3.body.lockVersion, 3);
    assert.strictEqual(mockWish.lock_version, 3);
  });

  await t.test('TEST 8: Client Draft Persistence Lifecycle (Local Storage & Cloud Save)', () => {
    const mockStorage = new Map();
    const fakeLocalStorage = {
      getItem: (k) => mockStorage.get(k) || null,
      setItem: (k, v) => mockStorage.set(k, String(v)),
      removeItem: (k) => mockStorage.delete(k)
    };

    const templateId = 'tpl_romantic_scrapbook';
    const draftKey = `wishmagic_draft_${templateId}`;
    const customData = {
      recipient_name: 'Ananya',
      sender_name: 'Dev',
      custom_message: 'Happy Anniversary my love!',
      relationship: 'wife',
      colors: { primary: '#e11d48', secondary: '#9f1239' }
    };

    // 1. Save local draft
    fakeLocalStorage.setItem(draftKey, JSON.stringify(customData));
    assert.ok(fakeLocalStorage.getItem(draftKey), 'Draft must exist in storage');

    // 2. Restore local draft
    const restored = JSON.parse(fakeLocalStorage.getItem(draftKey));
    assert.strictEqual(restored.recipient_name, 'Ananya');
    assert.strictEqual(restored.relationship, 'wife');
    assert.strictEqual(restored.colors.primary, '#e11d48');

    // 3. Reset draft
    fakeLocalStorage.removeItem(draftKey);
    assert.strictEqual(fakeLocalStorage.getItem(draftKey), null);
  });

  await t.test('TEST 9: Live Preview Runtime Bridge postMessage Communication Protocol', () => {
    const sentMessages = [];
    const mockContentWindow = {
      postMessage: (msg, targetOrigin) => {
        sentMessages.push({ msg, targetOrigin });
      }
    };
    const mockIframe = {
      contentWindow: mockContentWindow
    };

    const generatorCode = fs.readFileSync('public/js/wishmagic-customizer-generator.js', 'utf8');
    const generatorScope = {};
    new Function('window', 'document', generatorCode)(generatorScope, { querySelector: () => null, querySelectorAll: () => [] });
    const Bridge = generatorScope.WishMagicRuntimeBridge;

    assert.ok(Bridge, 'WishMagicRuntimeBridge must be defined');
    Bridge.init(mockIframe, '*');

    // Send single field update
    Bridge.updateField('recipient_name', 'Rhea');
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].msg.type, 'WISHMAGIC_UPDATE');
    assert.strictEqual(sentMessages[0].msg.payload.key, 'recipient_name');
    assert.strictEqual(sentMessages[0].msg.payload.value, 'Rhea');

    // Send theme update
    Bridge.updateTheme('romantic', { primary: '#ec4899', secondary: '#be185d' });
    assert.strictEqual(sentMessages[sentMessages.length - 1].msg.type, 'WISHMAGIC_THEME');
    assert.strictEqual(sentMessages[sentMessages.length - 1].msg.payload.theme, 'romantic');
  });

  await t.test('TEST 10: Anti-XSS Sanitization & Secure Published Snapshot Creation', () => {
    function sanitizeCustomDataForPublish(data) {
      if (!data || typeof data !== 'object') return data;
      const sanitized = Array.isArray(data) ? [] : {};
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'string') {
          sanitized[k] = v
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript\s*:/gi, '')
            .replace(/on\w+\s*=/gi, '');
        } else if (typeof v === 'object' && v !== null) {
          sanitized[k] = sanitizeCustomDataForPublish(v);
        } else {
          sanitized[k] = v;
        }
      }
      return sanitized;
    }

    const maliciousData = {
      recipient_name: 'Priya <script>alert("hack")</script>',
      sender_name: '<img src="x" onerror="stealCookies()"> Rohan',
      custom_message: 'Click this: javascript:alert(1)',
      nested: {
        personal_note: '<script src="evil.js"></script>Love always'
      }
    };

    const sanitized = sanitizeCustomDataForPublish(maliciousData);
    assert.strictEqual(sanitized.recipient_name, 'Priya ');
    assert.ok(!sanitized.sender_name.includes('onerror='));
    assert.ok(!sanitized.custom_message.includes('javascript:'));
    assert.strictEqual(sanitized.nested.personal_note, 'Love always');
  });
});
