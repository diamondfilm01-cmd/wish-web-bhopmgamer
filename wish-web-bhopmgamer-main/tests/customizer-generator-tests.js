/**
 * Automated Test Suite for WishMagic Automatic Customizer Generator (Part 3)
 */

import fs from 'fs';

// Minimal DOM and Window mock
class MockElement {
  constructor(tagName = 'div', attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.children = [];
    this.parentNode = null;
    this.innerHTML = '';
    this.value = '';
    this.type = attributes.type || 'text';
    this.checked = false;
    this.classList = new Set();
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
    child.parentNode = this;
    this.children.push(child);
    return child;
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

  matches(selector) {
    if (selector.startsWith('[') && selector.endsWith(']')) {
      const attr = selector.slice(1, -1);
      if (attr.includes('=')) {
        const [k, v] = attr.split('=').map(s => s.replace(/["']/g, '').trim());
        return this.getAttribute(k) === v;
      }
      return this.attributes[attr] !== undefined;
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }
}

// Load Generator source
const generatorCode = fs.readFileSync('public/js/wishmagic-customizer-generator.js', 'utf8');
const globalScope = {};
const fn = new Function('window', 'document', generatorCode);
fn(globalScope, {
  querySelector: () => new MockElement(),
  querySelectorAll: () => []
});

const Schema = globalScope.WishMagicCustomizerSchema;
const Customizer = globalScope.WishMagicCustomizer;
const Bridge = globalScope.WishMagicRuntimeBridge;

let passed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`❌ FAIL: ${msg}`);
    throw new Error(msg);
  }
  console.log(`✅ PASS: ${msg}`);
  passed++;
}

console.log('\n--- Running WishMagic Customizer Generator Tests (Part 3) ---\n');

// TEST 1: Template A (Personal + Photo) schema generation
{
  const analysisA = {
    valid: true,
    protocol: { version: '1.0' },
    fields: [
      { key: 'recipient_name', type: 'text', required: true, group: 'personal' },
      { key: 'sender_name', type: 'text', required: false, group: 'personal' },
      { key: 'custom_message', type: 'textarea', maxlength: 500, required: true, group: 'personal' },
      { key: 'event_date', type: 'date', required: true, group: 'personal' },
      { key: 'photo_1', type: 'image', required: false, group: 'media' }
    ],
    sections: [{ key: 'hero', toggleable: false }, { key: 'message', toggleable: true }],
    capabilities: { recipientName: true, senderName: true, message: true, eventDate: true, photos: true }
  };

  const schemaA = Schema.fromAnalysis(analysisA);
  assert(schemaA.fields.length === 5, 'Template A has 5 normalized fields');
  assert(schemaA.groups.length === 2, 'Template A has 2 groups (personal, media)');
  assert(!schemaA.capabilities.videos, 'Template A honestly declares no video support');
}

// TEST 2: Template B (Photos + Voice + Music + Gallery Style + Theme) schema generation
{
  const analysisB = {
    valid: true,
    protocol: { version: '1.0' },
    fields: [
      { key: 'recipient_name', type: 'text', required: true, group: 'personal' },
      { key: 'photos', type: 'image-multiple', required: false, group: 'media' },
      { key: 'voice_note', type: 'voice', required: false, group: 'audio' },
      { key: 'bg_music', type: 'audio', required: false, group: 'audio' },
      { key: 'gallery_layout', type: 'select', options: [{ value: 'grid', label: 'Grid' }, { value: 'polaroid', label: 'Polaroid' }], group: 'media' }
    ],
    themes: ['magical', 'romantic'],
    capabilities: { recipientName: true, multiplePhotos: true, voice: true, music: true, themes: true }
  };

  const schemaB = Schema.fromAnalysis(analysisB);
  assert(schemaB.fields.length === 5, 'Template B has 5 normalized fields');
  assert(schemaB.themes.length === 2, 'Template B includes 2 themes');
  assert(schemaB.fields.find(f => f.key === 'gallery_layout').options.length === 2, 'Template B select options match exactly 2 declared options');
}

// TEST 3: Template C (Recipient + Message + Video only)
{
  const analysisC = {
    valid: true,
    protocol: { version: '1.0' },
    fields: [
      { key: 'recipient_name', type: 'text', required: true, group: 'personal' },
      { key: 'custom_message', type: 'textarea', required: true, group: 'message' },
      { key: 'video_1', type: 'video', required: false, group: 'media' }
    ],
    capabilities: { recipientName: true, message: true, videos: true, photos: false, music: false }
  };

  const schemaC = Schema.fromAnalysis(analysisC);
  assert(schemaC.fields.length === 3, 'Template C has 3 fields');
  assert(!schemaC.capabilities.music, 'Template C has no music');
}

// TEST 4: Customizer Initialization and Data State
{
  const analysis = {
    valid: true,
    fields: [
      { key: 'recipient_name', type: 'text', required: true, defaultValue: 'Priya' },
      { key: 'event_date', type: 'date', required: true, defaultValue: '2026-10-25' }
    ]
  };

  Customizer.init({
    analysis,
    initialData: { custom_message: 'Happy Birthday' }
  });

  assert(Customizer.getValue('recipient_name') === 'Priya', 'Customizer initializes with default value');
  assert(Customizer.getValue('custom_message') === 'Happy Birthday', 'Customizer merges initialData');
  assert(!Customizer.isDirty(), 'Customizer starts in clean non-dirty state');
}

// TEST 5: Set Value and Change Event Dispatch
{
  let changeRecorded = null;
  Customizer.onChange(change => {
    changeRecorded = change;
  });

  Customizer.setValue('recipient_name', 'Rohan');
  assert(Customizer.getValue('recipient_name') === 'Rohan', 'Customizer setValue updates internal data');
  assert(Customizer.isDirty(), 'Customizer marks state as dirty on user change');
  assert(changeRecorded && changeRecorded.key === 'recipient_name' && changeRecorded.newValue === 'Rohan', 'Change event emitted with key and new value');
}

// TEST 6: Validation (Required Field Check)
{
  const analysis = {
    valid: true,
    fields: [
      { key: 'recipient_name', label: 'Recipient Name', type: 'text', required: true },
      { key: 'optional_note', label: 'Optional Note', type: 'text', required: false }
    ]
  };

  Customizer.init({ analysis, initialData: { recipient_name: '' } });
  const valResult = Customizer.validate();
  assert(!valResult.valid, 'Validation fails when required field is empty');
  assert(valResult.errors[0].field === 'recipient_name', 'Validation error specifies missing recipient_name');

  Customizer.setValue('recipient_name', 'Aarav');
  const valResult2 = Customizer.validate();
  assert(valResult2.valid, 'Validation passes when required field is populated');
}

// TEST 7: Validation (Max Length Check)
{
  const analysis = {
    valid: true,
    fields: [
      { key: 'custom_message', label: 'Message', type: 'textarea', maxLength: 10, required: false }
    ]
  };

  Customizer.init({ analysis, initialData: { custom_message: '123456789012345' } });
  const valResult = Customizer.validate();
  assert(!valResult.valid && valResult.errors.some(e => e.field === 'custom_message'), 'Validation detects max length overflow');
}

// TEST 8: Validation (Select Option Whitelist Check)
{
  const analysis = {
    valid: true,
    fields: [
      { key: 'layout', label: 'Layout', type: 'select', options: [{ value: 'grid', label: 'Grid' }], required: false }
    ]
  };

  Customizer.init({ analysis, initialData: { layout: 'unsupported_layout' } });
  const valResult = Customizer.validate();
  assert(!valResult.valid && valResult.errors.some(e => e.field === 'layout'), 'Validation rejects options not declared in template schema');
}

// TEST 9: Runtime Bridge Message Dispatch
{
  let lastMessage = null;
  const mockIframe = {
    contentWindow: {
      postMessage: msg => {
        lastMessage = msg;
      }
    }
  };

  Bridge.init(mockIframe);
  Bridge.updateField('recipient_name', 'Ananya');
  assert(lastMessage && lastMessage.type === 'WISHMAGIC_UPDATE' && lastMessage.payload.value === 'Ananya', 'RuntimeBridge correctly formats and dispatches WISHMAGIC_UPDATE message');
}

// TEST 10: Clean State Serialization
{
  Customizer.setValue('recipient_name', 'Tanvi');
  const state = Customizer.getData();
  const json = JSON.stringify(state);
  const parsed = JSON.parse(json);
  assert(parsed && parsed.recipient_name === 'Tanvi', 'Customizer state is 100% JSON serializable');
}

console.log(`\n🎉 Customizer Generator Test Suite Completed: ${passed} / 10 test groups passed successfully.\n`);
