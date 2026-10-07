/**
 * Automated Test Suite for WishMagic Sections + Layout Control System (Part 5)
 * ============================================================================
 * Tests all requirements from Part 5:
 * 1. Hero required (Required ✓, no OFF toggle)
 * 2. Optional section (toggleable = true -> toggle [ ON / OFF ])
 * 3. Non-toggleable section (toggleable = false -> [ Fixed ])
 * 4. Toggle ON/OFF (updates state and bridge message)
 * 5. Toggle restore (toggling off and on preserves state)
 * 6. Layout selection (only declared layouts appear, selecting updates layout)
 * 7. Invalid layout rejected (runtime rejects layout not in declared layouts)
 * 8. Default layout selection (if not specified, first declared layout is used)
 * 9. Invalid default layout reported (analyzer reports INVALID_DEFAULT_LAYOUT and safely falls back)
 * 10. Section reorder (reordering moves sections, updates sectionOrder)
 * 11. Fixed-start section (hero fixedPosition="start" cannot be moved down past non-fixed)
 * 12. Fixed-end section (final_surprise fixedPosition="end" cannot be moved up past non-fixed)
 * 13. Duplicate section ID detection (analyzer reports DUPLICATE_SECTION_ID without silent merge)
 * 14. Section instance support (data-wm-section-instance creates unique section instance)
 * 15. Missing label warning (SECTION_LABEL_MISSING reported)
 * 16. Nested section ambiguity (NESTED_SECTION_AMBIGUITY reported)
 * 17. Required + Toggleable conflict (REQUIRED_TOGGLEABLE_CONFLICT reported and required takes precedence)
 * 18. Different template capabilities (Spec 60 & 61: Full vs Minimal template tests)
 * 19. Runtime Bridge methods (updateSection, updateSectionLayout, updateSectionOrder)
 * 20. Template Runtime DOM updates (hidden, data-wm-enabled, layout, safe DOM reordering)
 * 21. Final serialization (WishMagicData.sections and sectionOrder are 100% JSON serializable)
 * 22. Accessibility controls (accessible reorder buttons, labels)
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
    this.hidden = false;
    this.style = {};
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
    if (name.startsWith('data-wm-layout')) {
      this.dataset.wmLayout = String(val);
    }
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  appendChild(child) {
    // If child is already in children, remove it first (standard DOM behavior)
    const existingIdx = this.children.indexOf(child);
    if (existingIdx !== -1) {
      this.children.splice(existingIdx, 1);
    }
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
    return this.documentElement.querySelectorAll(selector);
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }
}

// Load Scripts in Headless Context
const analyzerCode = fs.readFileSync(path.resolve('./public/js/wishmagic-template-analyzer.js'), 'utf-8');
const customizerCode = fs.readFileSync(path.resolve('./public/js/wishmagic-customizer-generator.js'), 'utf-8');
const bridgeCode = fs.readFileSync(path.resolve('./public/js/wishmagic-runtime-bridge.js'), 'utf-8');
const runtimeCode = fs.readFileSync(path.resolve('./public/js/wishmagic-template-runtime.js'), 'utf-8');

const globalScope = {
  console,
  document: null,
  window: null,
  Set,
  Map,
  Array,
  Object,
  String,
  Number,
  parseInt,
  JSON
};
globalScope.global = globalScope;
globalScope.window = globalScope;

// Execute analyzer, bridge, runtime, and customizer in mock global
new Function('window', 'document', analyzerCode)(globalScope, null);
const Analyzer = globalScope.WishMagicTemplateAnalyzer;

new Function('window', 'document', bridgeCode)(globalScope, null);
const Bridge = globalScope.WishMagicRuntimeBridge;

new Function('window', 'document', runtimeCode)(globalScope, null);
const Runtime = globalScope.WishMagicRuntime;

new Function('window', 'document', customizerCode)(globalScope, null);
const CustomizerSchema = globalScope.WishMagicCustomizerSchema;
const Customizer = globalScope.WishMagicCustomizer;

let passed = 0;
function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
  passed++;
}

console.log('================================================================');
console.log('🧪 RUNNING PART 5 WISHMAGIC SECTIONS & LAYOUT CONTROL TEST SUITE');
console.log('================================================================');

// TEST 1: Hero required section detection (Spec 4)
{
  const doc = new MockDocument();
  const hero = new MockElement('section', {
    'data-wm-section': 'hero',
    'data-wm-label': 'Main Hero',
    'data-wm-required': 'true',
    'data-wm-order': '1'
  });
  doc.body.appendChild(hero);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.sections.length === 1, 'TEST 1: Section is discovered');
  assert(res.sections[0].required === true, 'TEST 1: Hero required is boolean true');
  assert(res.sections[0].toggleable === false, 'TEST 1: Required section has toggleable = false');

  const schema = CustomizerSchema.fromAnalysis(res);
  assert(schema.sections[0].controls[0].type === 'required-badge', 'TEST 1: Customizer schema marks required section as required-badge (no toggle)');
}

// TEST 2: Optional toggleable section (Spec 5)
{
  const doc = new MockDocument();
  const gallery = new MockElement('section', {
    'data-wm-section': 'gallery',
    'data-wm-label': 'Photo Gallery',
    'data-wm-toggleable': 'true',
    'data-wm-order': '2'
  });
  doc.body.appendChild(gallery);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.sections[0].toggleable === true, 'TEST 2: Optional section detected as toggleable');

  const schema = CustomizerSchema.fromAnalysis(res);
  assert(schema.sections[0].controls[0].type === 'toggle', 'TEST 2: Customizer schema generates toggle control');
}

// TEST 3: Non-toggleable section (Spec 5)
{
  const doc = new MockDocument();
  const footer = new MockElement('section', {
    'data-wm-section': 'message',
    'data-wm-label': 'Dedication Note',
    'data-wm-toggleable': 'false',
    'data-wm-required': 'false',
    'data-wm-order': '2'
  });
  doc.body.appendChild(footer);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.sections[0].toggleable === false && res.sections[0].required === false, 'TEST 3: Non-toggleable section detected');

  const schema = CustomizerSchema.fromAnalysis(res);
  assert(schema.sections[0].controls[0].type === 'fixed-badge', 'TEST 3: Customizer schema generates fixed-badge (not a misleading toggle)');
}

// TEST 4 & 5: Toggle ON/OFF and State Preservation (Spec 12, 13, 35, 36)
{
  const analysis = {
    valid: true,
    sections: [
      {
        id: 'gallery',
        key: 'gallery',
        label: 'Photo Gallery',
        required: false,
        toggleable: true,
        reorderable: true,
        layouts: ['polaroid', 'grid', 'carousel'],
        defaultLayout: 'polaroid'
      }
    ],
    fields: []
  };

  Customizer.init({ analysis, initialData: {} });
  assert(Customizer.getData().sections.gallery.enabled === true, 'TEST 4: Gallery starts enabled by default');
  assert(Customizer.getData().sections.gallery.layout === 'polaroid', 'TEST 4: Gallery starts with polaroid layout');

  // Toggle OFF
  Customizer.handleSectionToggle('gallery', false);
  assert(Customizer.getData().sections.gallery.enabled === false, 'TEST 4: Gallery toggled to false');
  assert(Customizer.getData().sections.gallery.layout === 'polaroid', 'TEST 5: Polaroid layout preserved while gallery is OFF');

  // Toggle ON again
  Customizer.handleSectionToggle('gallery', true);
  assert(Customizer.getData().sections.gallery.enabled === true, 'TEST 5: Gallery toggled back to true');
  assert(Customizer.getData().sections.gallery.layout === 'polaroid', 'TEST 5: Preserved polaroid layout returns when re-enabled');
}

// TEST 6: Layout Selection (Spec 15, 16, 28)
{
  Customizer.handleSectionLayout('gallery', 'grid');
  assert(Customizer.getData().sections.gallery.layout === 'grid', 'TEST 6: Customizer updates layout to grid');
}

// TEST 7: Invalid Layout Rejection in Runtime (Spec 18)
{
  const secEl = new MockElement('section', {
    'data-wm-section': 'gallery',
    'data-wm-layouts': 'grid,polaroid,carousel',
    'data-wm-default-layout': 'grid'
  });
  const mockDoc = new MockDocument();
  mockDoc.body.appendChild(secEl);
  globalScope.document = mockDoc;

  const result = Runtime.updateSectionLayout('gallery', 'unsupported_layout');
  assert(result === false, 'TEST 7: Runtime rejects layout not declared in data-wm-layouts');
  assert(secEl.getAttribute('data-wm-layout') !== 'unsupported_layout', 'TEST 7: Arbitrary layout was not applied to DOM');
}

// TEST 8: Default Layout Selection (Spec 31)
{
  const doc = new MockDocument();
  const sec = new MockElement('section', {
    'data-wm-section': 'gallery',
    'data-wm-label': 'Gallery',
    'data-wm-layouts': 'polaroid,grid'
  });
  doc.body.appendChild(sec);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.sections[0].defaultLayout === 'polaroid', 'TEST 8: In absence of data-wm-default-layout, first valid declared layout is chosen');
}

// TEST 9: Invalid Default Layout Handling (Spec 32)
{
  const doc = new MockDocument();
  const sec = new MockElement('section', {
    'data-wm-section': 'gallery',
    'data-wm-label': 'Gallery',
    'data-wm-layouts': 'grid,carousel',
    'data-wm-default-layout': 'magic'
  });
  doc.body.appendChild(sec);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.warnings.some(w => w.code === 'INVALID_DEFAULT_LAYOUT'), 'TEST 9: Analyzer reports INVALID_DEFAULT_LAYOUT warning');
  assert(res.sections[0].defaultLayout === 'grid', 'TEST 9: Safely falls back to first valid declared layout (grid)');
}

// TEST 10: Section Reorder (Spec 9, 10, 43)
{
  const analysis = {
    valid: true,
    sections: [
      { id: 'hero', key: 'hero', label: 'Hero', required: true, toggleable: false, fixedPosition: 'start' },
      { id: 'message', key: 'message', label: 'Message', required: false, toggleable: true, reorderable: true },
      { id: 'gallery', key: 'gallery', label: 'Gallery', required: false, toggleable: true, reorderable: true },
      { id: 'timeline', key: 'timeline', label: 'Timeline', required: false, toggleable: true, reorderable: true }
    ],
    fields: []
  };

  Customizer.init({ analysis, initialData: {} });
  assert(JSON.stringify(Customizer.getData().sectionOrder) === JSON.stringify(['hero', 'message', 'gallery', 'timeline']), 'TEST 10: Initial section order correct');

  // Move gallery up (above message)
  Customizer.handleMoveSection('gallery', 'up');
  assert(JSON.stringify(Customizer.getData().sectionOrder) === JSON.stringify(['hero', 'gallery', 'message', 'timeline']), 'TEST 10: Gallery moved above message successfully');
}

// TEST 11: Fixed-Start Section Protection (Spec 37, 38)
{
  // Attempt to move hero (fixedPosition='start') down
  Customizer.handleMoveSection('hero', 'down');
  assert(Customizer.getData().sectionOrder[0] === 'hero', 'TEST 11: Fixed-start hero cannot be moved down');

  // Attempt to move gallery above hero
  Customizer.handleMoveSection('gallery', 'up');
  assert(Customizer.getData().sectionOrder[0] === 'hero', 'TEST 11: Gallery cannot be moved above fixed-start hero');
}

// TEST 12: Fixed-End Section Protection (Spec 37, 38)
{
  const analysis = {
    valid: true,
    sections: [
      { id: 'hero', key: 'hero', label: 'Hero', required: true, toggleable: false, fixedPosition: 'start' },
      { id: 'message', key: 'message', label: 'Message', required: false, toggleable: true, reorderable: true },
      { id: 'final_surprise', key: 'final_surprise', label: 'Finale', required: false, toggleable: true, fixedPosition: 'end' }
    ],
    fields: []
  };

  Customizer.init({ analysis, initialData: {} });
  // Attempt to move message below final_surprise
  Customizer.handleMoveSection('message', 'down');
  assert(Customizer.getData().sectionOrder[2] === 'final_surprise', 'TEST 12: Fixed-end final_surprise stays last and cannot be swapped');
}

// TEST 13: Duplicate Section ID Detection (Spec 11)
{
  const doc = new MockDocument();
  const sec1 = new MockElement('section', { 'data-wm-section': 'gallery', 'data-wm-label': 'Gallery 1' });
  const sec2 = new MockElement('section', { 'data-wm-section': 'gallery', 'data-wm-label': 'Gallery 2' });
  doc.body.appendChild(sec1);
  doc.body.appendChild(sec2);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.warnings.some(w => w.code === 'DUPLICATE_SECTION_ID'), 'TEST 13: Analyzer reports DUPLICATE_SECTION_ID without silent merge');
}

// TEST 14: Section Instance Support (Spec 11)
{
  const doc = new MockDocument();
  const sec1 = new MockElement('section', { 'data-wm-section': 'gallery', 'data-wm-section-instance': 'main', 'data-wm-label': 'Main Gallery' });
  const sec2 = new MockElement('section', { 'data-wm-section': 'gallery', 'data-wm-section-instance': 'memories', 'data-wm-label': 'Memories Gallery' });
  doc.body.appendChild(sec1);
  doc.body.appendChild(sec2);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.sections.length === 2, 'TEST 14: Two distinct instances of gallery preserved');
  assert(res.sections[0].instance === 'main' && res.sections[1].instance === 'memories', 'TEST 14: Instance attributes detected correctly');
}

// TEST 15: Missing Label Warning (Spec 56)
{
  const doc = new MockDocument();
  const sec = new MockElement('section', { 'data-wm-section': 'voice' });
  doc.body.appendChild(sec);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.warnings.some(w => w.code === 'SECTION_LABEL_MISSING'), 'TEST 15: Analyzer reports SECTION_LABEL_MISSING');
  assert(res.sections[0].label === 'Voice', 'TEST 15: Label gracefully inferred as "Voice"');
}

// TEST 16: Nested Section Ambiguity Warning (Spec 49, 50, 56)
{
  const doc = new MockDocument();
  const parentSec = new MockElement('section', { 'data-wm-section': 'hero', 'data-wm-label': 'Hero' });
  const childSec = new MockElement('section', { 'data-wm-section': 'gallery', 'data-wm-label': 'Nested Gallery' });
  parentSec.appendChild(childSec);
  doc.body.appendChild(parentSec);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.warnings.some(w => w.code === 'NESTED_SECTION_AMBIGUITY'), 'TEST 16: Analyzer reports NESTED_SECTION_AMBIGUITY');
}

// TEST 17: Required + Toggleable Conflict Warning (Spec 4, 56)
{
  const doc = new MockDocument();
  const sec = new MockElement('section', {
    'data-wm-section': 'hero',
    'data-wm-label': 'Hero',
    'data-wm-required': 'true',
    'data-wm-toggleable': 'true'
  });
  doc.body.appendChild(sec);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.warnings.some(w => w.code === 'REQUIRED_TOGGLEABLE_CONFLICT'), 'TEST 17: Analyzer reports REQUIRED_TOGGLEABLE_CONFLICT');
  assert(res.sections[0].toggleable === false, 'TEST 17: Required section overrides toggleable to false');
}

// TEST 18: Different Template Capabilities (Spec 60 & 61)
{
  // Test Template A: 5 declared sections with distinct layouts
  const docA = new MockDocument();
  docA.body.appendChild(new MockElement('section', { 'data-wm-section': 'hero', 'data-wm-required': 'true', 'data-wm-order': '1' }));
  docA.body.appendChild(new MockElement('section', { 'data-wm-section': 'message', 'data-wm-order': '2' }));
  docA.body.appendChild(new MockElement('section', { 'data-wm-section': 'gallery', 'data-wm-layouts': 'grid,polaroid', 'data-wm-order': '3' }));
  docA.body.appendChild(new MockElement('section', { 'data-wm-section': 'timeline', 'data-wm-layouts': 'vertical,alternating', 'data-wm-order': '4' }));
  docA.body.appendChild(new MockElement('section', { 'data-wm-section': 'final_surprise', 'data-wm-layouts': 'confetti,fireworks', 'data-wm-order': '5' }));

  const resA = Analyzer.analyze({ document: docA, force: true });
  assert(resA.sections.length === 5, 'TEST 18: Template A detects 5 declared sections');
  assert(resA.sections.find(s => s.id === 'gallery').layouts.length === 2, 'TEST 18: Gallery supports exactly 2 layouts');
  assert(resA.sections.find(s => s.id === 'timeline').layouts.length === 2, 'TEST 18: Timeline supports exactly 2 layouts');
  assert(resA.sections.find(s => s.id === 'final_surprise').layouts.length === 2, 'TEST 18: Final Surprise supports exactly 2 layouts');

  // Test Template B (Spec 61): ONLY Hero and Gallery (Gallery supports ONLY carousel)
  const docB = new MockDocument();
  docB.body.appendChild(new MockElement('section', { 'data-wm-section': 'hero', 'data-wm-required': 'true', 'data-wm-order': '1' }));
  docB.body.appendChild(new MockElement('section', { 'data-wm-section': 'gallery', 'data-wm-layouts': 'carousel', 'data-wm-order': '2' }));

  const resB = Analyzer.analyze({ document: docB, force: true });
  assert(resB.sections.length === 2, 'TEST 18: Template B detects ONLY 2 declared sections');
  const secIdsB = resB.sections.map(s => s.id);
  assert(!secIdsB.includes('timeline') && !secIdsB.includes('countdown') && !secIdsB.includes('voice') && !secIdsB.includes('final_surprise'), 'TEST 18: Undeclared sections (timeline, countdown, voice, finale) are NOT fabricated');
  assert(resB.sections.find(s => s.id === 'gallery').layouts.join(',') === 'carousel', 'TEST 18: Gallery supports ONLY carousel');
}

// TEST 19: Runtime Bridge Messages (Spec 41, 42, 43, 44)
{
  let dispatchedMessages = [];
  const mockIframe = {
    contentWindow: {
      postMessage: msg => {
        dispatchedMessages.push(msg);
      }
    }
  };

  Bridge.init({ previewElement: mockIframe });
  Bridge.updateSection('gallery', false);
  assert(dispatchedMessages.some(m => m.type === 'WISHMAGIC_SECTION' && m.payload.section === 'gallery' && m.payload.enabled === false), 'TEST 19: Bridge dispatches WISHMAGIC_SECTION');

  Bridge.updateSectionLayout('gallery', 'polaroid');
  assert(dispatchedMessages.some(m => m.type === 'WISHMAGIC_SECTION_LAYOUT' && m.payload.section === 'gallery' && m.payload.layout === 'polaroid'), 'TEST 19: Bridge dispatches WISHMAGIC_SECTION_LAYOUT');

  Bridge.updateSectionOrder(['hero', 'gallery', 'message']);
  assert(dispatchedMessages.some(m => m.type === 'WISHMAGIC_SECTION_ORDER' && Array.isArray(m.payload.order)), 'TEST 19: Bridge dispatches WISHMAGIC_SECTION_ORDER');
}

// TEST 20: Template Runtime DOM Updates (Spec 12, 13, 48, 52, 54)
{
  const secEl = new MockElement('section', {
    'data-wm-section': 'gallery',
    'data-wm-layouts': 'grid,polaroid,carousel'
  });
  const mockDoc = new MockDocument();
  mockDoc.body.appendChild(secEl);
  globalScope.document = mockDoc;

  // 1. Hide section
  Runtime.updateSection('gallery', false);
  assert(secEl.hidden === true && secEl.getAttribute('data-wm-enabled') === 'false', 'TEST 20: Disabled section sets hidden=true and data-wm-enabled="false"');

  // 2. Restore section
  Runtime.updateSection('gallery', true);
  assert(secEl.hidden === false && secEl.getAttribute('data-wm-enabled') === 'true', 'TEST 20: Enabled section restores hidden=false and data-wm-enabled="true"');

  // 3. Layout update
  Runtime.updateSectionLayout('gallery', 'polaroid');
  assert(secEl.getAttribute('data-wm-layout') === 'polaroid', 'TEST 20: Valid layout updates data-wm-layout');
}

// TEST 21: Full Serialization of WishMagicData (Spec 62, 67)
{
  const data = Customizer.getData();
  const serialized = JSON.stringify(data);
  const parsed = JSON.parse(serialized);

  assert(typeof parsed.sections === 'object', 'TEST 21: WishMagicData.sections is valid JSON object');
  assert(Array.isArray(parsed.sectionOrder), 'TEST 21: WishMagicData.sectionOrder is valid JSON array');
  assert(typeof serialized === 'string' && serialized.length > 20, 'TEST 21: Complete WishMagicData is 100% serializable');
}

// TEST 22: Accessible Reorder Buttons & Toggles (Spec 64, 65)
{
  const analysis = {
    valid: true,
    sections: [
      { id: 'hero', key: 'hero', label: 'Hero', required: true, toggleable: false, fixedPosition: 'start' },
      { id: 'gallery', key: 'gallery', label: 'Photo Gallery', required: false, toggleable: true, reorderable: true, layouts: ['polaroid', 'grid'] }
    ],
    fields: []
  };

  Customizer.init({ analysis, initialData: {} });
  const html = Customizer.renderSectionsManagerHTML();

  assert(html.includes('aria-label="Move Photo Gallery section up"'), 'TEST 22: Accessible Move Up button generated with aria-label');
  assert(html.includes('aria-label="Move Photo Gallery section down"'), 'TEST 22: Accessible Move Down button generated with aria-label');
  assert(html.includes('aria-label="Toggle Photo Gallery"'), 'TEST 22: Accessible toggle button generated with aria-label');
  assert(html.includes('aria-label="Select polaroid layout for Photo Gallery"'), 'TEST 22: Accessible layout button generated with aria-label');
}

console.log(`\n🎉 Part 5 Section & Layout Control Test Suite Completed: ${passed} / 22 test groups passed.\n`);
