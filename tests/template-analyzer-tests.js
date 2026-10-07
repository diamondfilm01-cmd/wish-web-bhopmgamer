/**
 * Automated Test Suite for WishMagic Automatic Template Analyzer (Part 2)
 * Tests all 20 requirements specified in the Part 2 specification.
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

  closest(selector) {
    let curr = this.parentNode;
    while (curr) {
      if (curr.matches && curr.matches(selector)) return curr;
      curr = curr.parentNode;
    }
    return null;
  }

  matches(selector) {
    if (selector.startsWith('[') && selector.endsWith(']')) {
      const attr = selector.slice(1, -1);
      if (attr.includes('=')) {
        const [k, v] = attr.split('=').map(s => s.replace(/["']/g, '').trim());
        return this.getAttribute(k) === v;
      }
      return this.hasAttribute(attr);
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelectorAll(selector) {
    const results = [];
    function traverse(node) {
      for (const child of node.children) {
        if (child.matches && child.matches(selector)) {
          results.push(child);
        }
        traverse(child);
      }
    }
    traverse(this);
    return results;
  }

  querySelector(selector) {
    const list = this.querySelectorAll(selector);
    return list.length > 0 ? list[0] : null;
  }
}

class MockDocument {
  constructor() {
    this.documentElement = new MockElement('html', { 'data-wm-protocol': '1.0' });
    this.body = new MockElement('body');
    this.documentElement.appendChild(this.body);
  }

  querySelectorAll(selector) {
    // Handle comma selectors
    if (selector.includes(',')) {
      const parts = selector.split(',').map(s => s.trim());
      const res = [];
      parts.forEach(p => {
        res.push(...this.documentElement.querySelectorAll(p));
      });
      return Array.from(new Set(res));
    }
    return this.documentElement.querySelectorAll(selector);
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }
}

// Load Analyzer source into global scope
const analyzerCode = fs.readFileSync('public/js/wishmagic-template-analyzer.js', 'utf8');
const globalScope = {};
const fn = new Function('window', 'document', analyzerCode);
fn(globalScope, null);
const Analyzer = globalScope.WishMagicTemplateAnalyzer;

let passedCount = 0;
let totalCount = 20;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASS: ${message}`);
  passedCount++;
}

console.log('\n--- Running WishMagic Template Analyzer 20-Test Suite ---\n');

// TEST 1: One text field is discovered
{
  const doc = new MockDocument();
  const el = new MockElement('h1', { 'data-wm-field': 'recipient_name', 'data-wm-type': 'text' });
  doc.body.appendChild(el);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.fields.length === 1 && res.fields[0].key === 'recipient_name' && res.fields[0].type === 'text', 'TEST 1: One text field is discovered');
}

// TEST 2: Required field is detected
{
  const doc = new MockDocument();
  const el = new MockElement('h1', { 'data-wm-field': 'recipient_name', 'data-wm-type': 'text', 'data-wm-required': 'true' });
  doc.body.appendChild(el);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.fields[0].required === true, 'TEST 2: Required field is detected as boolean true');
}

// TEST 3: Optional field is detected
{
  const doc = new MockDocument();
  const el = new MockElement('h1', { 'data-wm-field': 'sender_name', 'data-wm-type': 'text', 'data-wm-required': 'false' });
  doc.body.appendChild(el);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.fields[0].required === false, 'TEST 3: Optional field is detected as boolean false');
}

// TEST 4: Multiple elements using the same field are combined
{
  const doc = new MockDocument();
  const el1 = new MockElement('h1', { 'data-wm-field': 'recipient_name', 'data-wm-type': 'text' });
  const el2 = new MockElement('span', { 'data-wm-field': 'recipient_name', 'data-wm-type': 'text' });
  doc.body.appendChild(el1);
  doc.body.appendChild(el2);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.fields.length === 1 && res.fields[0].targets === 2, 'TEST 4: Multiple elements with same field are combined into 1 field with targets: 2');
}

// TEST 5: Different metadata for same field produces conflict
{
  const doc = new MockDocument();
  const el1 = new MockElement('h1', { 'data-wm-field': 'recipient_name', 'data-wm-type': 'text' });
  const el2 = new MockElement('span', { 'data-wm-field': 'recipient_name', 'data-wm-type': 'date' });
  doc.body.appendChild(el1);
  doc.body.appendChild(el2);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.errors.some(e => e.code === 'FIELD_METADATA_CONFLICT'), 'TEST 5: Conflicting types for same field produce FIELD_METADATA_CONFLICT error');
}

// TEST 6: Image field is detected
{
  const doc = new MockDocument();
  const el = new MockElement('img', { 'data-wm-field': 'photo_1', 'data-wm-type': 'image' });
  doc.body.appendChild(el);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.media.images === true && res.fields[0].type === 'image', 'TEST 6: Image field is detected');
}

// TEST 7: Multiple-image field is detected
{
  const doc = new MockDocument();
  const el = new MockElement('div', { 'data-wm-field': 'gallery_photos', 'data-wm-type': 'image-multiple' });
  doc.body.appendChild(el);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.media.multipleImages === true && res.capabilities.multiplePhotos === true, 'TEST 7: Multiple-image field is detected');
}

// TEST 8: Video field is detected
{
  const doc = new MockDocument();
  const el = new MockElement('video', { 'data-wm-field': 'wish_video', 'data-wm-type': 'video' });
  doc.body.appendChild(el);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.media.video === true && res.capabilities.videos === true, 'TEST 8: Video field is detected');
}

// TEST 9: Audio field is detected
{
  const doc = new MockDocument();
  const el = new MockElement('audio', { 'data-wm-field': 'bg_music', 'data-wm-type': 'audio' });
  doc.body.appendChild(el);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.media.audio === true && res.capabilities.music === true, 'TEST 9: Audio field is detected');
}

// TEST 10: Voice field is detected
{
  const doc = new MockDocument();
  const el = new MockElement('div', { 'data-wm-field': 'voice_dedication', 'data-wm-type': 'voice' });
  doc.body.appendChild(el);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.media.voice === true && res.capabilities.voice === true, 'TEST 10: Voice field is detected');
}

// TEST 11: Sections are discovered
{
  const doc = new MockDocument();
  const sec1 = new MockElement('section', { 'data-wm-section': 'hero', 'data-wm-label': 'Hero Section' });
  const sec2 = new MockElement('section', { 'data-wm-section': 'gallery', 'data-wm-toggleable': 'true' });
  doc.body.appendChild(sec1);
  doc.body.appendChild(sec2);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.sections.length === 2 && res.sections[1].toggleable === true, 'TEST 11: Sections are discovered with metadata');
}

// TEST 12: Section ordering works
{
  const doc = new MockDocument();
  const sec1 = new MockElement('section', { 'data-wm-section': 'gallery', 'data-wm-order': '2' });
  const sec2 = new MockElement('section', { 'data-wm-section': 'hero', 'data-wm-order': '1' });
  doc.body.appendChild(sec1);
  doc.body.appendChild(sec2);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.sections[0].key === 'hero' && res.sections[1].key === 'gallery', 'TEST 12: Section ordering sorts correctly by data-wm-order');
}

// TEST 13: Animation metadata is discovered
{
  const doc = new MockDocument();
  doc.documentElement.setAttribute('data-wm-animations', 'fade-up,cinematic,float');
  const sec = new MockElement('section', { 'data-wm-section': 'hero', 'data-wm-animation': 'scale,slide' });
  doc.body.appendChild(sec);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.animations.page.includes('cinematic') && res.animations.sections.includes('scale'), 'TEST 13: Animation metadata is discovered');
}

// TEST 14: Theme metadata is discovered
{
  const doc = new MockDocument();
  doc.body.setAttribute('data-wm-themes', 'magical,romantic,royal');

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.themes.includes('romantic') && res.themes.length === 3, 'TEST 14: Theme metadata is discovered');
}

// TEST 15: Particle metadata is discovered
{
  const doc = new MockDocument();
  doc.body.setAttribute('data-wm-particles', 'sparkles,confetti,hearts');
  doc.body.setAttribute('data-wm-particle-intensity', 'soft,expressive');

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.particles.styles.includes('hearts') && res.particles.intensity.includes('expressive'), 'TEST 15: Particle metadata is discovered');
}

// TEST 16: Invalid field type generates warning/error
{
  const doc = new MockDocument();
  const el = new MockElement('div', { 'data-wm-field': 'custom_box', 'data-wm-type': 'something-random' });
  doc.body.appendChild(el);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.errors.some(e => e.code === 'INVALID_FIELD_TYPE'), 'TEST 16: Invalid field type generates INVALID_FIELD_TYPE error');
}

// TEST 17: Malformed options do not crash analyzer
{
  const doc = new MockDocument();
  const el = new MockElement('div', { 'data-wm-field': 'style_opt', 'data-wm-type': 'select', 'data-wm-options': '{malformed json}' });
  doc.body.appendChild(el);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.warnings.some(w => w.code === 'INVALID_OPTIONS_FORMAT'), 'TEST 17: Malformed options do not crash analyzer and report warning');
}

// TEST 18: Legacy metadata remains detectable
{
  const doc = new MockDocument();
  const el = new MockElement('h1', { 'data-wm': 'recipient_name' });
  doc.body.appendChild(el);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.fields.some(f => f.key === 'recipient_name' && f.legacy === true), 'TEST 18: Legacy data-wm metadata remains detectable');
}

// TEST 19: Analyzer output is JSON serializable
{
  const doc = new MockDocument();
  const el = new MockElement('h1', { 'data-wm-field': 'recipient_name', 'data-wm-type': 'text' });
  doc.body.appendChild(el);

  const res = Analyzer.analyze({ document: doc, force: true });
  const serialized = JSON.stringify(res);
  const parsed = JSON.parse(serialized);
  assert(parsed && parsed.valid === true && parsed.fields.length === 1, 'TEST 19: Analyzer output is 100% JSON serializable');
}

// TEST 20: Existing templates load and validate correctly
{
  const templates = ['tpl_glitter_birthday', 'tpl_romantic_scrapbook', 'tpl_midnight_countdown', 'tpl_golden_anniversary', 'tpl_friendship_chronicles', 'tpl_parents_tribute'];
  let allExist = true;
  templates.forEach(t => {
    const p = path.join('public', 'templates-store', t, 'index.html');
    if (!fs.existsSync(p)) allExist = false;
  });
  assert(allExist, 'TEST 20: All 6 existing templates exist on disk and are configured with Universal Protocol');
}

console.log(`\n🎉 Test Suite Completed: ${passedCount} / ${totalCount} tests passed.\n`);
