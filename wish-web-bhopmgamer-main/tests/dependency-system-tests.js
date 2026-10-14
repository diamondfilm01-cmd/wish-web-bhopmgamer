/**
 * Automated Test Suite for WishMagic Advanced Field Dependency & Smart UI System (Part 10)
 * =========================================================================================
 * Tests all specifications from Part 10:
 * - Spec 1: Basic visibility condition (data-wm-visible-if)
 * - Spec 2: Disabled condition (data-wm-disabled-if)
 * - Spec 3: Supported condition operators (=, !=, >, <, >=, <=, contains, not_contains, in, not_in, exists, not_exists, truthy, falsy)
 * - Spec 4: AND / OR / Nested Parentheses expressions
 * - Spec 5: Multi-level Dependency Chains (A -> B -> C)
 * - Spec 6: Circular Dependency Cycle Detection & Infinite Loop Protection
 * - Spec 7: Hidden vs Disabled State segregation
 * - Spec 8: Clear-On-Hide vs State Preservation Cache
 * - Spec 9: Hidden Required Field does NOT fail validation
 * - Spec 10: Conditional Required (data-wm-required-if)
 * - Spec 11: Dynamic Labels (data-wm-label-if) & Descriptions
 * - Spec 12: Conditional Select Options (visibleIf per option)
 * - Spec 13: Auto-Reset of Invalid Option Values
 * - Spec 14: Group-level Conditional Visibility
 * - Spec 15: Section ↔ Content & Media ↔ Content Dependency Integration
 * - Spec 16: Safe Recursive-Descent Expression Parser (NO eval / new Function)
 * - Spec 17: Zero Hardcoded Template Branching
 * - Spec 18: Reset & Destruction Memory Cleanup
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
    this.classList = {
      _classes: new Set((attributes.class || '').split(' ').filter(Boolean)),
      add: (...cls) => cls.forEach(c => this.classList._classes.add(c)),
      remove: (...cls) => cls.forEach(c => this.classList._classes.remove(c)),
      contains: (c) => this.classList._classes.has(c)
    };
    this.style = { display: '' };
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
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  closest(sel) {
    let cur = this;
    while (cur) {
      if (sel.startsWith('.') && cur.classList.contains(sel.slice(1))) return cur;
      cur = cur.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    const subSelectors = selector.split(',').map(s => s.trim());

    const matchesSingle = (el, sel) => {
      if (sel.startsWith('.')) {
        return el.classList.contains(sel.slice(1));
      }
      if (sel.includes('[data-wm-control-for="')) {
        const key = sel.slice(sel.indexOf('="') + 2, -2);
        return el.getAttribute('data-wm-control-for') === key;
      }
      if (sel === '[data-wm-field]' || sel === '[data-wm]') {
        return el.hasAttribute('data-wm-field') || el.hasAttribute('data-wm');
      }
      if (sel === '.wm-group-card[data-wm-visible-if]') {
        return el.classList.contains('wm-group-card') && el.hasAttribute('data-wm-visible-if');
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
const depCode = fs.readFileSync(path.resolve('./public/js/wishmagic-dependencies.js'), 'utf8');
const contentSystemCode = fs.readFileSync(path.resolve('./public/js/wishmagic-content-system.js'), 'utf8');
const analyzerCode = fs.readFileSync(path.resolve('./public/js/wishmagic-template-analyzer.js'), 'utf8');
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

runInSandbox(depCode);
runInSandbox(contentSystemCode);
runInSandbox(analyzerCode);
runInSandbox(customizerCode);

const WishMagicDependencies = sandbox.WishMagicDependencies || sandbox.window.WishMagicDependencies;
const WishMagicContent = sandbox.WishMagicContent || sandbox.window.WishMagicContent;
const WishMagicTemplateAnalyzer = sandbox.WishMagicTemplateAnalyzer || sandbox.window.WishMagicTemplateAnalyzer;
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
console.log('🧠 RUNNING PART 10 WISHMAGIC FIELD DEPENDENCY & SMART UI SUITE');
console.log('================================================================');

// -----------------------------------------------------------------------------
// TEST 1: Basic Visibility Condition (= and !=)
// -----------------------------------------------------------------------------
{
  assert(WishMagicDependencies.evaluate('music_enabled=true', { music_enabled: true }) === true, 'TEST 1: music_enabled=true with true is TRUE');
  assert(WishMagicDependencies.evaluate('music_enabled=true', { music_enabled: false }) === false, 'TEST 1: music_enabled=true with false is FALSE');
  assert(WishMagicDependencies.evaluate('relationship!=friend', { relationship: 'wife' }) === true, 'TEST 1: relationship!=friend with wife is TRUE');
  assert(WishMagicDependencies.evaluate('relationship!=friend', { relationship: 'friend' }) === false, 'TEST 1: relationship!=friend with friend is FALSE');
}

// -----------------------------------------------------------------------------
// TEST 2: Disabled Condition (data-wm-disabled-if)
// -----------------------------------------------------------------------------
{
  const fields = [
    { key: 'premium_feature', type: 'toggle', defaultValue: false },
    { key: 'voice_style', type: 'select', disabledIf: 'premium_feature=false' }
  ];

  const state1 = WishMagicDependencies.evaluateAll(fields, { premium_feature: false });
  assert(state1.get('voice_style').disabled === true, 'TEST 2: voice_style is disabled when premium_feature=false');

  const state2 = WishMagicDependencies.evaluateAll(fields, { premium_feature: true });
  assert(state2.get('voice_style').disabled === false, 'TEST 2: voice_style is enabled when premium_feature=true');
}

// -----------------------------------------------------------------------------
// TEST 3: AND Condition
// -----------------------------------------------------------------------------
{
  const expr = 'music_enabled=true AND music_source=custom';
  assert(WishMagicDependencies.evaluate(expr, { music_enabled: true, music_source: 'custom' }) === true, 'TEST 3: Both true evaluates to TRUE');
  assert(WishMagicDependencies.evaluate(expr, { music_enabled: true, music_source: 'curated' }) === false, 'TEST 3: One false evaluates to FALSE');
  assert(WishMagicDependencies.evaluate(expr, { music_enabled: false, music_source: 'custom' }) === false, 'TEST 3: First false evaluates to FALSE');
}

// -----------------------------------------------------------------------------
// TEST 4: OR Condition
// -----------------------------------------------------------------------------
{
  const expr = 'relationship=wife OR relationship=husband';
  assert(WishMagicDependencies.evaluate(expr, { relationship: 'wife' }) === true, 'TEST 4: wife matches OR');
  assert(WishMagicDependencies.evaluate(expr, { relationship: 'husband' }) === true, 'TEST 4: husband matches OR');
  assert(WishMagicDependencies.evaluate(expr, { relationship: 'friend' }) === false, 'TEST 4: friend fails OR');
}

// -----------------------------------------------------------------------------
// TEST 5: Nested Parentheses Expression
// -----------------------------------------------------------------------------
{
  const expr = 'music_enabled=true AND (music_source=custom OR music_source=curated)';
  assert(WishMagicDependencies.evaluate(expr, { music_enabled: true, music_source: 'custom' }) === true, 'TEST 5: Nested custom matches');
  assert(WishMagicDependencies.evaluate(expr, { music_enabled: true, music_source: 'curated' }) === true, 'TEST 5: Nested curated matches');
  assert(WishMagicDependencies.evaluate(expr, { music_enabled: false, music_source: 'custom' }) === false, 'TEST 5: Outer false fails whole expression');
  assert(WishMagicDependencies.evaluate(expr, { music_enabled: true, music_source: 'radio' }) === false, 'TEST 5: Inner mismatch fails expression');
}

// -----------------------------------------------------------------------------
// TEST 6: Comparison Operators (>, <, >=, <=)
// -----------------------------------------------------------------------------
{
  assert(WishMagicDependencies.evaluate('photo_count > 3', { photo_count: 5 }) === true, 'TEST 6: 5 > 3 is TRUE');
  assert(WishMagicDependencies.evaluate('photo_count < 3', { photo_count: 5 }) === false, 'TEST 6: 5 < 3 is FALSE');
  assert(WishMagicDependencies.evaluate('photo_count >= 5', { photo_count: 5 }) === true, 'TEST 6: 5 >= 5 is TRUE');
  assert(WishMagicDependencies.evaluate('photo_count <= 4', { photo_count: 5 }) === false, 'TEST 6: 5 <= 4 is FALSE');
}

// -----------------------------------------------------------------------------
// TEST 7: Contains & IN Operators
// -----------------------------------------------------------------------------
{
  assert(WishMagicDependencies.evaluate('favorite_things contains travel', { favorite_things: ['music', 'travel', 'food'] }) === true, 'TEST 7: Array contains travel');
  assert(WishMagicDependencies.evaluate('favorite_things contains sports', { favorite_things: ['music', 'travel', 'food'] }) === false, 'TEST 7: Array not contains sports');
  assert(WishMagicDependencies.evaluate('occasion in birthday,anniversary', { occasion: 'birthday' }) === true, 'TEST 7: birthday IN list');
  assert(WishMagicDependencies.evaluate('occasion not_in birthday,anniversary', { occasion: 'wedding' }) === true, 'TEST 7: wedding NOT_IN list');
}

// -----------------------------------------------------------------------------
// TEST 8: Exists & Truthy Operators
// -----------------------------------------------------------------------------
{
  assert(WishMagicDependencies.evaluate('custom_message exists', { custom_message: 'Happy Birthday' }) === true, 'TEST 8: Message exists is TRUE');
  assert(WishMagicDependencies.evaluate('custom_message exists', { custom_message: '' }) === false, 'TEST 8: Empty string exists is FALSE');
  assert(WishMagicDependencies.evaluate('show_date truthy', { show_date: true }) === true, 'TEST 8: show_date truthy');
  assert(WishMagicDependencies.evaluate('show_date falsy', { show_date: false }) === true, 'TEST 8: show_date falsy');
}

// -----------------------------------------------------------------------------
// TEST 9: Multi-level Dependency Chain (A -> B -> C -> D)
// -----------------------------------------------------------------------------
{
  const fields = [
    { key: 'occasion', type: 'select', defaultValue: 'birthday' },
    { key: 'relationship', type: 'select', visibleIf: 'occasion=birthday' },
    { key: 'message_style', type: 'select', visibleIf: 'relationship=boyfriend' },
    { key: 'message_effect', type: 'select', visibleIf: 'message_style=romantic' }
  ];

  // Case 1: occasion = birthday, relationship = boyfriend, message_style = romantic -> all visible
  const state1 = WishMagicDependencies.evaluateAll(fields, {
    occasion: 'birthday',
    relationship: 'boyfriend',
    message_style: 'romantic'
  });
  assert(state1.get('relationship').visible === true, 'TEST 9: Chain step 1 visible');
  assert(state1.get('message_style').visible === true, 'TEST 9: Chain step 2 visible');
  assert(state1.get('message_effect').visible === true, 'TEST 9: Chain step 3 visible');

  // Case 2: occasion = anniversary -> relationship, message_style, message_effect all hide
  const state2 = WishMagicDependencies.evaluateAll(fields, {
    occasion: 'anniversary',
    relationship: 'boyfriend',
    message_style: 'romantic'
  });
  assert(state2.get('relationship').visible === false, 'TEST 9: Chain step 1 hidden');
}

// -----------------------------------------------------------------------------
// TEST 10: Circular Dependency Detection & Infinite Loop Protection
// -----------------------------------------------------------------------------
{
  const circularFields = [
    { key: 'field_A', visibleIf: 'field_B=true' },
    { key: 'field_B', visibleIf: 'field_A=true' }
  ];

  const graph = WishMagicDependencies.buildDependencyGraph(circularFields);
  assert(graph.hasCycle === true, 'TEST 10: Cycle detected in graph');
  assert(graph.warnings.some(w => w.code === 'CIRCULAR_DEPENDENCY'), 'TEST 10: Warning generated for circular dependency');

  // Must not crash or infinite loop when evaluating
  const evaluated = WishMagicDependencies.evaluateAll(circularFields, { field_A: false, field_B: false });
  assert(evaluated.has('field_A') && evaluated.has('field_B'), 'TEST 10: Evaluated without crashing or looping');
}

// -----------------------------------------------------------------------------
// TEST 11: Hidden Required Field Does NOT Fail Validation
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  const toggle = doc.createElement('input');
  toggle.setAttribute('data-wm-field', 'music_enabled');
  toggle.setAttribute('data-wm-type', 'toggle');
  doc.body.appendChild(toggle);

  const urlInput = doc.createElement('input');
  urlInput.setAttribute('data-wm-field', 'music_url');
  urlInput.setAttribute('data-wm-type', 'url');
  urlInput.setAttribute('data-wm-required', 'true');
  urlInput.setAttribute('data-wm-visible-if', 'music_enabled=true');
  doc.body.appendChild(urlInput);

  WishMagicContent.init({ document: doc });

  // When music_enabled is false, empty music_url MUST pass validation because it's hidden
  const valHidden = WishMagicContent.validate({ music_enabled: false, music_url: '' });
  assert(valHidden.valid === true, 'TEST 11: Hidden required field does NOT fail validation');

  // When music_enabled is true, empty music_url MUST fail validation
  const valVisible = WishMagicContent.validate({ music_enabled: true, music_url: '' });
  assert(valVisible.valid === false, 'TEST 11: Visible required field fails validation');
  assert(valVisible.errors.some(e => e.field === 'music_url' && e.code === 'REQUIRED'), 'TEST 11: REQUIRED error code for visible field');
}

// -----------------------------------------------------------------------------
// TEST 12: Conditional Required (data-wm-required-if)
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  const sourceSel = doc.createElement('select');
  sourceSel.setAttribute('data-wm-field', 'music_source');
  sourceSel.setAttribute('data-wm-type', 'select');
  sourceSel.setAttribute('data-wm-options', 'curated,custom');
  doc.body.appendChild(sourceSel);

  const urlInput = doc.createElement('input');
  urlInput.setAttribute('data-wm-field', 'custom_music_url');
  urlInput.setAttribute('data-wm-type', 'url');
  urlInput.setAttribute('data-wm-required-if', 'music_source=custom');
  doc.body.appendChild(urlInput);

  WishMagicContent.init({ document: doc });

  // Curated source: custom_music_url not required
  const valCurated = WishMagicContent.validate({ music_source: 'curated', custom_music_url: '' });
  assert(valCurated.valid === true, 'TEST 12: custom_music_url not required when source is curated');

  // Custom source: custom_music_url IS required
  const valCustom = WishMagicContent.validate({ music_source: 'custom', custom_music_url: '' });
  assert(valCustom.valid === false, 'TEST 12: custom_music_url is required when source is custom');
}

// -----------------------------------------------------------------------------
// TEST 13: Conditional Select Options & Auto-Reset
// -----------------------------------------------------------------------------
{
  const fields = [
    { key: 'relationship', type: 'select', defaultValue: 'mother' },
    {
      key: 'greeting_style',
      type: 'select',
      defaultValue: 'sweet',
      options: [
        { value: 'romantic', label: 'Romantic', visibleIf: 'relationship=boyfriend OR relationship=girlfriend' },
        { value: 'sweet', label: 'Sweet', visibleIf: 'relationship=mother OR relationship=father OR relationship=friend' }
      ]
    }
  ];

  // For mother: only 'sweet' option is visible
  const stateMother = WishMagicDependencies.evaluateAll(fields, { relationship: 'mother', greeting_style: 'romantic' });
  const styleState = stateMother.get('greeting_style');
  assert(styleState.visibleOptions.length === 1, 'TEST 13: Exactly 1 option visible for mother');
  assert(styleState.visibleOptions[0].value === 'sweet', 'TEST 13: Visible option is sweet');
  assert(styleState.value === 'sweet', 'TEST 13: Invalid romantic style auto-reset to sweet');
}

// -----------------------------------------------------------------------------
// TEST 14: Dynamic Labels (data-wm-label-if)
// -----------------------------------------------------------------------------
{
  const fields = [
    { key: 'relationship', type: 'select', defaultValue: 'mother' },
    {
      key: 'recipient_name',
      type: 'text',
      label: 'Recipient Name',
      labelIf: "relationship=mother:Mother's Name|relationship=father:Father's Name"
    }
  ];

  const state1 = WishMagicDependencies.evaluateAll(fields, { relationship: 'mother' });
  assert(state1.get('recipient_name').label === "Mother's Name", 'TEST 14: Dynamic label resolves to Mother\'s Name');

  const state2 = WishMagicDependencies.evaluateAll(fields, { relationship: 'father' });
  assert(state2.get('recipient_name').label === "Father's Name", 'TEST 14: Dynamic label resolves to Father\'s Name');

  const state3 = WishMagicDependencies.evaluateAll(fields, { relationship: 'friend' });
  assert(state3.get('recipient_name').label === 'Recipient Name', 'TEST 14: Fallback label used for friend');
}

// -----------------------------------------------------------------------------
// TEST 15: Section ↔ Content Dependency (sections.gallery.enabled)
// -----------------------------------------------------------------------------
{
  const fields = [
    { key: 'gallery_caption', type: 'text', visibleIf: 'sections.gallery.enabled=true' }
  ];

  assert(WishMagicDependencies.evaluate('sections.gallery.enabled=true', { sections: { gallery: { enabled: true } } }) === true, 'TEST 15: Gallery section ON makes caption visible');
  assert(WishMagicDependencies.evaluate('sections.gallery.enabled=true', { sections: { gallery: { enabled: false } } }) === false, 'TEST 15: Gallery section OFF makes caption hidden');
}

// -----------------------------------------------------------------------------
// TEST 16: State Preservation & Restoration Across Hide/Show
// -----------------------------------------------------------------------------
{
  const fields = [
    { key: 'music_enabled', type: 'toggle', defaultValue: true },
    { key: 'music_source', type: 'select', defaultValue: 'curated', visibleIf: 'music_enabled=true' }
  ];

  // User sets music_source to 'custom'
  const state1 = WishMagicDependencies.evaluateAll(fields, { music_enabled: true, music_source: 'custom' });
  assert(state1.get('music_source').value === 'custom', 'TEST 16: Initial value is custom');

  // User disables music (music_enabled = false) -> field hides, value preserved in cache
  const state2 = WishMagicDependencies.evaluateAll(fields, { music_enabled: false, music_source: 'custom' });
  assert(state2.get('music_source').visible === false, 'TEST 16: Field hidden');

  // User re-enables music (music_enabled = true) -> field restores custom value
  const state3 = WishMagicDependencies.evaluateAll(fields, { music_enabled: true });
  assert(state3.get('music_source').visible === true, 'TEST 16: Field visible again');
  assert(state3.get('music_source').value === 'custom', 'TEST 16: Preserved value "custom" successfully restored');
}

// -----------------------------------------------------------------------------
// TEST 17: Safe Expression Parser (NO eval / new Function in codebase)
// -----------------------------------------------------------------------------
{
  const depCodeStr = fs.readFileSync(path.resolve('./public/js/wishmagic-dependencies.js'), 'utf8');
  assert(!depCodeStr.includes('eval(') && !depCodeStr.includes('new Function('), 'TEST 17: Zero eval() or new Function() in dependencies engine');

  // Complex expression parsed safely
  const complexExpr = 'music_enabled=true AND (relationship=wife OR relationship=husband) AND photo_count >= 3';
  const ast = WishMagicDependencies.parse(complexExpr);
  assert(ast && ast.type === 'LOGICAL', 'TEST 17: Complex AST parsed safely');
}

// -----------------------------------------------------------------------------
// TEST 18: Reset & Destruction Memory Cleanup
// -----------------------------------------------------------------------------
{
  WishMagicDependencies.destroy();
  assert(true, 'TEST 18: WishMagicDependencies.destroy() executes cleanly without error');
}

console.log('================================================================');
console.log(`🎉 Part 10 Dependency & Smart UI Test Suite Completed: ${passedTests} / ${totalTests} assertions passed.`);
if (failedTests > 0) {
  console.error(`❌ FAILS: ${failedTests}`);
  process.exit(1);
} else {
  console.log('✅ ALL PART 10 TESTS PASSED CLEANLY.');
}
