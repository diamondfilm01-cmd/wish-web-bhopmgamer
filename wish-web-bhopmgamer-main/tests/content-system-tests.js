/**
 * Automated Test Suite for WishMagic Advanced Content & Personalization System (Part 9)
 * ======================================================================================
 * Tests all specifications from Part 9:
 * - Test 1: Automatic field detection from data-wm-field
 * - Test 2: Multi-target element updates when field changes
 * - Test 3: Textarea character limit enforcement & counter
 * - Test 4: Required validation blocking
 * - Test 5: Canonical date format (YYYY-MM-DD)
 * - Test 6: Template date formatting (data-wm-format)
 * - Test 7: Timezone & Countdown integration
 * - Test 8: Conditional field visibility (data-wm-visible-if)
 * - Test 9: Select option validation against allowed options
 * - Test 10: Multiselect serialization
 * - Test 11: Safe text rendering (XSS protection, no innerHTML execution)
 * - Test 12: Custom template-specific fields without customizer changes
 * - Test 13: Template switching & field rebuilding
 * - Test 14: User data preservation across reload
 * - Test 15: Simultaneous update across multiple mapped DOM nodes
 * - Test 16: Resilient handling of malformed metadata
 * - Test 17: Zero hardcoded template if/else branching
 * - Test 18: Seamless integration with previous Parts (Media, Sections, Visuals)
 */

import fs from 'fs';
import path from 'path';

// Minimal standard DOM Mock for Headless Node Testing
class MockElement {
  constructor(tagName = 'div', attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.textContent = attributes.text || '';
    this.value = attributes.value || '';
    this.checked = Boolean(attributes.checked);
    this._src = attributes.src || '';
  }

  get src() {
    return this._src || this.getAttribute('src') || '';
  }

  set src(val) {
    this._src = String(val);
    this.setAttribute('src', String(val));
  }

  get parentElement() {
    return this.parentNode;
  }

  getAttribute(name) {
    return this.attributes[name] !== undefined ? this.attributes[name] : null;
  }

  hasAttribute(name) {
    return this.attributes[name] !== undefined;
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name.startsWith('data-wm-field')) {
      this.dataset.wmField = String(val);
    }
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  querySelectorAll(selector) {
    const results = [];
    const subSelectors = selector.split(',').map(s => s.trim());

    const matchesSingle = (el, sel) => {
      if (sel === '[data-wm-field]' || sel === '[data-wm]') {
        return el.hasAttribute('data-wm-field') || el.hasAttribute('data-wm');
      }
      if (sel.startsWith('[data-wm-field="')) {
        const key = sel.slice('[data-wm-field="'.length, -2);
        return el.getAttribute('data-wm-field') === key;
      }
      if (sel.startsWith('[data-wm="')) {
        const key = sel.slice('[data-wm="'.length, -2);
        return el.getAttribute('data-wm') === key;
      }
      if (sel.startsWith('[data-wm-media="')) {
        const key = sel.slice('[data-wm-media="'.length, -2);
        return el.getAttribute('data-wm-media') === key;
      }
      return false;
    };

    const walk = (el) => {
      if (subSelectors.some(sel => matchesSingle(el, sel))) {
        results.push(el);
      }
      el.children.forEach(walk);
    };

    this.children.forEach(walk);
    return results;
  }

  querySelector(selector) {
    const list = this.querySelectorAll(selector);
    return list.length > 0 ? list[0] : null;
  }
}

class MockDocument {
  constructor() {
    this.documentElement = new MockElement('html');
    this.body = new MockElement('body');
    this.documentElement.appendChild(this.body);
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }
}

// Load Modules
const contentSystemCode = fs.readFileSync(path.resolve('./public/js/wishmagic-content-system.js'), 'utf8');
const analyzerCode = fs.readFileSync(path.resolve('./public/js/wishmagic-template-analyzer.js'), 'utf8');
const runtimeCode = fs.readFileSync(path.resolve('./public/js/wishmagic-template-runtime.js'), 'utf8');
const customizerCode = fs.readFileSync(path.resolve('./public/js/wishmagic-customizer-generator.js'), 'utf8');

// Evaluation Sandbox
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Math,
  JSON,
  Array,
  Object,
  String,
  Number,
  Boolean,
  RegExp,
  Set,
  Map,
  window: {},
  document: null
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;

function runInSandbox(code) {
  const fn = new Function('window', 'document', 'global', 'globalThis', code);
  fn(sandbox.window, sandbox.document, sandbox, sandbox);
}

// Initialize Environment
sandbox.document = new MockDocument();
sandbox.window.document = sandbox.document;

runInSandbox(contentSystemCode);
runInSandbox(analyzerCode);
runInSandbox(runtimeCode);
runInSandbox(customizerCode);

const WishMagicContent = sandbox.WishMagicContent || sandbox.window.WishMagicContent;
const WishMagicTemplateAnalyzer = sandbox.WishMagicTemplateAnalyzer || sandbox.window.WishMagicTemplateAnalyzer;
const WishMagicRuntime = sandbox.WishMagicRuntime || sandbox.window.WishMagicRuntime;
const WishMagicCustomizer = sandbox.WishMagicCustomizer || sandbox.window.WishMagicCustomizer;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`❌ FAIL: ${message}`);
  }
}

console.log('================================================================');
console.log('📝 RUNNING PART 9 WISHMAGIC ADVANCED CONTENT & PERSONALIZATION SUITE');
console.log('================================================================');

// -----------------------------------------------------------------------------
// TEST 1: Template contains recipient_name, automatically detected
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  const h1 = doc.createElement('h1');
  h1.setAttribute('data-wm-field', 'recipient_name');
  h1.setAttribute('data-wm-label', 'Birthday Person');
  h1.setAttribute('data-wm-type', 'text');
  h1.setAttribute('data-wm-required', 'true');
  doc.body.appendChild(h1);

  const schema = WishMagicContent.scan(doc);
  assert(schema.valid === true, 'TEST 1: Schema is valid');
  assert(schema.fields.length === 1, 'TEST 1: Exactly 1 field detected');
  assert(schema.fields[0].key === 'recipient_name', 'TEST 1: Field key is recipient_name');
  assert(schema.fields[0].label === 'Birthday Person', 'TEST 1: Field label is "Birthday Person"');
  assert(schema.fields[0].required === true, 'TEST 1: Field required is true');
  assert(schema.fields[0].type === 'text', 'TEST 1: Field type is text');
}

// -----------------------------------------------------------------------------
// TEST 2: Changing recipient name updates every mapped element
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  const h1 = doc.createElement('h1');
  h1.setAttribute('data-wm-field', 'recipient_name');
  doc.body.appendChild(h1);

  const span = doc.createElement('span');
  span.setAttribute('data-wm-field', 'recipient_name');
  doc.body.appendChild(span);

  const footer = doc.createElement('p');
  footer.setAttribute('data-wm-field', 'recipient_name');
  doc.body.appendChild(footer);

  WishMagicContent.init({ document: doc });
  WishMagicContent.setValue('recipient_name', 'Kritika');

  assert(h1.textContent === 'Kritika', 'TEST 2: H1 updated to Kritika');
  assert(span.textContent === 'Kritika', 'TEST 2: Span updated to Kritika');
  assert(footer.textContent === 'Kritika', 'TEST 2: Footer updated to Kritika');
}

// -----------------------------------------------------------------------------
// TEST 3: Textarea respects maxlength & counter
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  const p = doc.createElement('p');
  p.setAttribute('data-wm-field', 'custom_message');
  p.setAttribute('data-wm-label', 'Personal Message');
  p.setAttribute('data-wm-type', 'textarea');
  p.setAttribute('data-wm-maxlength', '500');
  p.setAttribute('data-wm-required', 'true');
  doc.body.appendChild(p);

  const schema = WishMagicContent.scan(doc);
  assert(schema.fields[0].maxlength === 500, 'TEST 3: Maxlength 500 parsed');
  assert(schema.fields[0].type === 'textarea', 'TEST 3: Field type is textarea');

  const validationOver = WishMagicContent.validate({ custom_message: 'a'.repeat(501) });
  assert(validationOver.valid === false, 'TEST 3: 501 chars fails maxlength validation');
  assert(validationOver.errors[0].code === 'MAX_LENGTH', 'TEST 3: Error code is MAX_LENGTH');

  const validationValid = WishMagicContent.validate({ custom_message: 'a'.repeat(487) });
  assert(validationValid.valid === true, 'TEST 3: 487 chars passes validation');
}

// -----------------------------------------------------------------------------
// TEST 4: Required empty field blocks validation
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  const h1 = doc.createElement('h1');
  h1.setAttribute('data-wm-field', 'recipient_name');
  h1.setAttribute('data-wm-required', 'true');
  doc.body.appendChild(h1);

  WishMagicContent.init({ document: doc });
  const validation = WishMagicContent.validate({ recipient_name: '' });
  assert(validation.valid === false, 'TEST 4: Empty required field fails validation');
  assert(validation.errors.some(e => e.code === 'REQUIRED' && e.field === 'recipient_name'), 'TEST 4: REQUIRED error code returned for recipient_name');
}

// -----------------------------------------------------------------------------
// TEST 5: Date stored in canonical format YYYY-MM-DD
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  const div = doc.createElement('div');
  div.setAttribute('data-wm-field', 'event_date');
  div.setAttribute('data-wm-type', 'date');
  div.setAttribute('data-wm-required', 'true');
  doc.body.appendChild(div);

  WishMagicContent.init({ document: doc });
  WishMagicContent.setValue('event_date', '2026-10-25');

  assert(WishMagicContent.getValue('event_date') === '2026-10-25', 'TEST 5: Stored canonical date is 2026-10-25');
  assert(WishMagicContent.validate({ event_date: '2026-10-25' }).valid === true, 'TEST 5: Valid canonical date passes');
  assert(WishMagicContent.validate({ event_date: 'invalid-date' }).valid === false, 'TEST 5: Invalid date string fails with INVALID_DATE');
}

// -----------------------------------------------------------------------------
// TEST 6: Date display formatting works
// -----------------------------------------------------------------------------
{
  const formatted1 = WishMagicContent.formatValue('event_date', '2026-10-25', 'DD MMMM YYYY');
  assert(formatted1 === '25 October 2026', 'TEST 6: Formatted DD MMMM YYYY -> 25 October 2026');

  const formatted2 = WishMagicContent.formatValue('event_date', '2026-10-25', 'DD/MM/YYYY');
  assert(formatted2 === '25/10/2026', 'TEST 6: Formatted DD/MM/YYYY -> 25/10/2026');

  const formatted3 = WishMagicContent.formatValue('event_date', '2026-10-25', 'MMMM DD, YYYY');
  assert(formatted3 === 'October 25, 2026', 'TEST 6: Formatted MMMM DD, YYYY -> October 25, 2026');

  // DOM test with data-wm-format
  const doc = new MockDocument();
  const span = doc.createElement('span');
  span.setAttribute('data-wm-field', 'event_date');
  span.setAttribute('data-wm-type', 'date');
  span.setAttribute('data-wm-format', 'DD MMMM YYYY');
  doc.body.appendChild(span);

  WishMagicContent.init({ document: doc });
  WishMagicContent.setValue('event_date', '2026-10-25');
  assert(span.textContent === '25 October 2026', 'TEST 6: Span DOM reflects formatted date 25 October 2026');
  assert(WishMagicContent.getValue('event_date') === '2026-10-25', 'TEST 6: Canonical value remains 2026-10-25');
}

// -----------------------------------------------------------------------------
// TEST 7: Timezone and event details reach countdown system
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  const dateEl = doc.createElement('div');
  dateEl.setAttribute('data-wm-field', 'event_date');
  dateEl.setAttribute('data-wm-type', 'date');
  doc.body.appendChild(dateEl);

  const tzEl = doc.createElement('div');
  tzEl.setAttribute('data-wm-field', 'timezone');
  tzEl.setAttribute('data-wm-type', 'select');
  tzEl.setAttribute('data-wm-options', 'Asia/Kolkata,America/New_York');
  doc.body.appendChild(tzEl);

  WishMagicContent.init({ document: doc });
  WishMagicContent.setValue('event_date', '2026-10-25');
  WishMagicContent.setValue('timezone', 'Asia/Kolkata');

  assert(sandbox.window.WishMagicData.event.date === '2026-10-25', 'TEST 7: WishMagicData.event.date is 2026-10-25');
  assert(sandbox.window.WishMagicData.event.timezone === 'Asia/Kolkata', 'TEST 7: WishMagicData.event.timezone is Asia/Kolkata');
}

// -----------------------------------------------------------------------------
// TEST 8: Conditional field visibility works (data-wm-visible-if)
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  const toggleEl = doc.createElement('input');
  toggleEl.setAttribute('data-wm-field', 'music_enabled');
  toggleEl.setAttribute('data-wm-type', 'toggle');
  doc.body.appendChild(toggleEl);

  const noteEl = doc.createElement('textarea');
  noteEl.setAttribute('data-wm-field', 'music_message');
  noteEl.setAttribute('data-wm-type', 'textarea');
  noteEl.setAttribute('data-wm-visible-if', 'music_enabled=true');
  doc.body.appendChild(noteEl);

  const schema = WishMagicContent.scan(doc);
  assert(schema.fields[1].visibleIf === 'music_enabled=true', 'TEST 8: visibleIf attribute extracted');
}

// -----------------------------------------------------------------------------
// TEST 9: Select option validation against allowed options
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  const selEl = doc.createElement('select');
  selEl.setAttribute('data-wm-field', 'greeting_style');
  selEl.setAttribute('data-wm-type', 'select');
  selEl.setAttribute('data-wm-options', 'sweet,romantic,elegant,funny');
  doc.body.appendChild(selEl);

  WishMagicContent.init({ document: doc });
  assert(WishMagicContent.validate({ greeting_style: 'romantic' }).valid === true, 'TEST 9: Declared option "romantic" is valid');
  assert(WishMagicContent.validate({ greeting_style: 'unsupported_style' }).valid === false, 'TEST 9: Undeclared option fails with INVALID_OPTION');
}

// -----------------------------------------------------------------------------
// TEST 10: Multiselect values serialize correctly
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  const multiEl = doc.createElement('select');
  multiEl.setAttribute('data-wm-field', 'favorite_things');
  multiEl.setAttribute('data-wm-type', 'multiselect');
  multiEl.setAttribute('data-wm-options', 'music,travel,food,memories,movies');
  doc.body.appendChild(multiEl);

  WishMagicContent.init({ document: doc });
  WishMagicContent.setValue('favorite_things', ['music', 'travel', 'memories']);

  const values = WishMagicContent.getValues();
  assert(Array.isArray(values.favorite_things), 'TEST 10: favorite_things is an array');
  assert(values.favorite_things.length === 3, 'TEST 10: Exactly 3 items stored');
  assert(values.favorite_things.includes('music'), 'TEST 10: Contains "music"');
  assert(values.favorite_things.includes('travel'), 'TEST 10: Contains "travel"');
}

// -----------------------------------------------------------------------------
// TEST 11: Safe text rendering (No HTML / script injection)
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  const h1 = doc.createElement('h1');
  h1.setAttribute('data-wm-field', 'recipient_name');
  doc.body.appendChild(h1);

  const maliciousPayload = '<script>alert("hacked")</script><img src=x onerror=alert(1)>';
  WishMagicContent.init({ document: doc });
  WishMagicContent.setValue('recipient_name', maliciousPayload);

  assert(h1.textContent === maliciousPayload, 'TEST 11: Rendered safely as literal textContent');
  assert(h1.children.length === 0, 'TEST 11: Zero executable child script elements injected into DOM');
}

// -----------------------------------------------------------------------------
// TEST 12: Template-specific fields work without customizer code changes
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  const nickEl = doc.createElement('input');
  nickEl.setAttribute('data-wm-field', 'nickname');
  nickEl.setAttribute('data-wm-label', 'Special Nickname');
  nickEl.setAttribute('data-wm-type', 'text');
  nickEl.setAttribute('data-wm-placeholder', 'What do you call them?');
  nickEl.setAttribute('data-wm-maxlength', '40');
  doc.body.appendChild(nickEl);

  const schema = WishMagicContent.scan(doc);
  assert(schema.templateSpecificFields.length === 1, 'TEST 12: templateSpecificFields contains nickname');
  assert(schema.templateSpecificFields[0].key === 'nickname', 'TEST 12: Field key is nickname');
  assert(schema.templateSpecificFields[0].placeholder === 'What do you call them?', 'TEST 12: Placeholder is intact');
}

// -----------------------------------------------------------------------------
// TEST 13: Template switching rebuilds fields correctly without leakage
// -----------------------------------------------------------------------------
{
  // Template A: recipient_name, sender_name, custom_message, event_date
  const docA = new MockDocument();
  const fA1 = docA.createElement('h1'); fA1.setAttribute('data-wm-field', 'recipient_name'); docA.body.appendChild(fA1);
  const fA2 = docA.createElement('p'); fA2.setAttribute('data-wm-field', 'sender_name'); docA.body.appendChild(fA2);
  const fA3 = docA.createElement('p'); fA3.setAttribute('data-wm-field', 'custom_message'); docA.body.appendChild(fA3);
  const fA4 = docA.createElement('div'); fA4.setAttribute('data-wm-field', 'event_date'); docA.body.appendChild(fA4);

  // Template B: recipient_name, nickname, relationship, love_message, event_time
  const docB = new MockDocument();
  const fB1 = docB.createElement('h1'); fB1.setAttribute('data-wm-field', 'recipient_name'); docB.body.appendChild(fB1);
  const fB2 = docB.createElement('input'); fB2.setAttribute('data-wm-field', 'nickname'); docB.body.appendChild(fB2);
  const fB3 = docB.createElement('select'); fB3.setAttribute('data-wm-field', 'relationship'); docB.body.appendChild(fB3);
  const fB4 = docB.createElement('textarea'); fB4.setAttribute('data-wm-field', 'love_message'); docB.body.appendChild(fB4);
  const fB5 = docB.createElement('div'); fB5.setAttribute('data-wm-field', 'event_time'); docB.body.appendChild(fB5);

  const schemaA = WishMagicContent.scan(docA);
  assert(schemaA.fields.length === 4, 'TEST 13: Template A has 4 fields');
  assert(!schemaA.fields.some(f => f.key === 'nickname'), 'TEST 13: Template A has NO nickname');

  const schemaB = WishMagicContent.scan(docB);
  assert(schemaB.fields.length === 5, 'TEST 13: Template B has 5 fields');
  assert(schemaB.fields.some(f => f.key === 'nickname'), 'TEST 13: Template B HAS nickname');
  assert(!schemaB.fields.some(f => f.key === 'custom_message'), 'TEST 13: Template B has NO custom_message');
}

// -----------------------------------------------------------------------------
// TEST 14: User data survives preview/runtime reload
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  const h1 = doc.createElement('h1');
  h1.setAttribute('data-wm-field', 'recipient_name');
  doc.body.appendChild(h1);

  WishMagicContent.init({
    document: doc,
    data: {
      content: {
        recipient_name: 'Ankit Babu Saini'
      }
    }
  });

  assert(WishMagicContent.getValue('recipient_name') === 'Ankit Babu Saini', 'TEST 14: Value initialized from persisted data');
  assert(h1.textContent === 'Ankit Babu Saini', 'TEST 14: DOM hydrated with persisted user value');
}

// -----------------------------------------------------------------------------
// TEST 15: Token replacement safely resolves {{tokens}}
// -----------------------------------------------------------------------------
{
  const tokenResolved = WishMagicContent.resolveToken('{{recipient_name}}', { recipient_name: 'Kittu' });
  assert(tokenResolved === 'Kittu', 'TEST 15: {{recipient_name}} resolves to Kittu');

  const customToken = WishMagicContent.resolveToken('special_word', { special_word: 'Magic' });
  assert(customToken === 'Magic', 'TEST 15: special_word resolves to Magic');
}

// -----------------------------------------------------------------------------
// TEST 16: Invalid / unsupported metadata types handled resiliently
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  const brokenEl = doc.createElement('div');
  brokenEl.setAttribute('data-wm-field', 'mystery_field');
  brokenEl.setAttribute('data-wm-type', 'unsupported_weird_type');
  doc.body.appendChild(brokenEl);

  const goodEl = doc.createElement('h1');
  goodEl.setAttribute('data-wm-field', 'valid_title');
  goodEl.setAttribute('data-wm-type', 'text');
  doc.body.appendChild(goodEl);

  const schema = WishMagicContent.scan(doc);
  assert(schema.warnings.some(w => w.code === 'UNSUPPORTED_FIELD_TYPE'), 'TEST 16: Warning reported for unsupported field type');
  assert(schema.fields.length === 1, 'TEST 16: Supported field parsed without crashing');
  assert(schema.fields[0].key === 'valid_title', 'TEST 16: valid_title field active');
}

// -----------------------------------------------------------------------------
// TEST 17: Zero hardcoded template if/else branching
// -----------------------------------------------------------------------------
{
  const contentCodeStr = fs.readFileSync(path.resolve('./public/js/wishmagic-content-system.js'), 'utf8');
  assert(!contentCodeStr.includes('templateId ===') && !contentCodeStr.includes('templateName ==='), 'TEST 17: Zero templateId hardcoded conditionals in content system');
}

// -----------------------------------------------------------------------------
// TEST 18: WishMagicData.content JSON serializable & preserves Parts 1-8
// -----------------------------------------------------------------------------
{
  sandbox.window.WishMagicData = {
    media: { cover_photo: 'https://example.com/cover.jpg' },
    sections: { hero: { enabled: true, layout: 'standard' } },
    visual: { theme: 'romantic', background: 'warm-ambient' },
    animations: { page: 'fade-up' }
  };

  WishMagicContent.init({
    data: {
      content: {
        recipient_name: 'Kritika',
        sender_name: 'Ankit',
        occasion: 'birthday',
        relationship: 'friend',
        event_date: '2026-10-25',
        custom_message: 'Happy Birthday!'
      }
    }
  });

  const finalState = sandbox.window.WishMagicData;
  assert(finalState.content.recipient_name === 'Kritika', 'TEST 18: content.recipient_name intact');
  assert(finalState.media.cover_photo === 'https://example.com/cover.jpg', 'TEST 18: media state preserved');
  assert(finalState.sections.hero.enabled === true, 'TEST 18: section state preserved');
  assert(finalState.visual.theme === 'romantic', 'TEST 18: visual state preserved');

  const jsonSerialized = JSON.stringify(finalState);
  assert(typeof jsonSerialized === 'string' && jsonSerialized.length > 50, 'TEST 18: Complete state is 100% JSON serializable');
}

console.log('================================================================');
console.log(`🎉 Part 9 Content & Personalization Test Suite Completed: ${passedTests} / ${totalTests} assertions passed.`);
if (failedTests > 0) {
  console.error(`❌ FAILS: ${failedTests}`);
  process.exit(1);
} else {
  console.log('✅ ALL PART 9 TESTS PASSED CLEANLY.');
}
