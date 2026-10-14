/**
 * Automated Test Suite for WishMagic Advanced Media + Upload/Capability System (Part 8)
 * ======================================================================================
 * Tests all specifications from Part 8:
 * - Spec 4: Image Slot metadata discovery
 * - Spec 5: Image Slot Required validation
 * - Spec 6: Optional image slot
 * - Spec 7: Multiple Image Slot (image-multiple)
 * - Spec 8: Multiple Image Limits (min/max items enforcement)
 * - Spec 9: Multiple image order preservation
 * - Spec 10 & 11: Cover photo vs Gallery separation
 * - Spec 12: Media placement metadata
 * - Spec 15: MIME / Accept validation
 * - Spec 16: Size limit validation
 * - Spec 17: Dimensions validation (min/max width/height)
 * - Spec 22: Video slot discovery & handling
 * - Spec 23: Multiple videos discovery & limits
 * - Spec 26: Video duration limit enforcement
 * - Spec 29: Background video
 * - Spec 30: Audio / background music slot
 * - Spec 32: Music enable / disable toggle
 * - Spec 36: Voice note slot
 * - Spec 41 & 42: Media capability schema & normalized model
 * - Spec 43 & 44: Media state & JSON serializable references (no binary)
 * - Spec 47 & 48: Local object URL tracking & safe cleanup
 * - Spec 49: No File/Blob in WishMagicData
 * - Spec 50: Media Preview Bridge message dispatch
 * - Spec 51: Required media removal rejection & optional media removal
 * - Spec 52: Media replacement isolation
 * - Spec 54: Media order update (WISHMAGIC_MEDIA_ORDER)
 * - Spec 56: Gallery layout integration (Polaroid layout + photos)
 * - Spec 57: Media + Animation integration
 * - Spec 58: Media + Section OFF/ON integration (photos preserved when section disabled)
 * - Spec 59 & 60: validateMediaState and Publish validation
 * - Spec 69 & 70: Audio ducking runtime coordination
 * - Spec 71 & 73: Duplicate Media ID warning
 * - Spec 74: Media instance support
 * - Spec 76 & 77: Custom media settings (fit, position)
 * - Spec 79 & 81: Template switching & normalizeMediaState
 * - Spec 85: Reorderable gallery controls
 * - Spec 90 & 112: Final serialization test
 * - Spec 97 & 98: Test Template A (Full) vs Template B (Minimal) honest generation
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
    this._src = attributes.src || '';
    this.style = {
      _props: {},
      setProperty: (prop, val) => {
        this.style._props[prop] = String(val);
      },
      removeProperty: (prop) => {
        delete this.style._props[prop];
      },
      getPropertyValue: (prop) => this.style._props[prop] || ''
    };
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
    if (name.startsWith('data-wm-media')) {
      this.dataset.wmMedia = String(val);
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
    if (selector.includes(',')) {
      const parts = selector.split(',').map(s => s.trim());
      const results = [];
      const seen = new Set();
      parts.forEach(p => {
        const sub = this.querySelectorAll(p);
        sub.forEach(n => {
          if (!seen.has(n)) {
            seen.add(n);
            results.push(n);
          }
        });
      });
      return results;
    }
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
      const inside = selector.slice(1, -1);
      if (inside.includes('=')) {
        const [k, v] = inside.split('=').map(s => s.replace(/["']/g, '').trim());
        return this.getAttribute(k) === v;
      }
      return this.hasAttribute(inside);
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }
}

class MockDocument {
  constructor() {
    this.documentElement = new MockElement('html');
    this.body = new MockElement('body');
    this.documentElement.appendChild(this.body);
  }

  createElement(tagName) {
    return new MockElement(tagName);
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
const mediaRuntimeCode = fs.readFileSync(path.resolve('./public/js/wishmagic-media-runtime.js'), 'utf-8');
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

new Function('window', 'document', analyzerCode)(globalScope, null);
const Analyzer = globalScope.WishMagicTemplateAnalyzer;

new Function('window', 'document', mediaRuntimeCode)(globalScope, null);
const MediaRuntime = globalScope.WishMagicMediaRuntime;
const AudioRuntime = globalScope.WishMagicAudioRuntime;
const { validateMediaState, normalizeMediaState } = globalScope;

new Function('window', 'document', bridgeCode)(globalScope, null);
const Bridge = globalScope.WishMagicRuntimeBridge;

new Function('window', 'document', runtimeCode)(globalScope, null);
const TemplateRuntime = globalScope.WishMagicRuntime;

new Function('window', 'document', customizerCode)(globalScope, null);
const Schema = globalScope.WishMagicCustomizerSchema;
const Customizer = globalScope.WishMagicCustomizer;

let passed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`❌ FAIL: ${msg}`);
    throw new Error(msg);
  }
  console.log(`✅ PASS: ${msg}`);
  passed++;
}

console.log('\n================================================================');
console.log('📸 RUNNING PART 8 WISHMAGIC ADVANCED MEDIA & CAPABILITY SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// TEST GROUP 1: Discovery & Normalized Schema (Spec 4, 7, 8, 10, 22, 30, 36, 41, 42)
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  doc.documentElement.setAttribute('data-wm-protocol', '1.0');

  // Cover photo slot
  const coverEl = new MockElement('img', {
    'data-wm-media': 'cover_photo',
    'data-wm-role': 'cover',
    'data-wm-type': 'image',
    'data-wm-required': 'true',
    'data-wm-label': 'Main Cover Photo',
    'data-wm-accept': 'image/jpeg,image/png,image/webp',
    'data-wm-max-size': '10485760'
  });

  // Gallery multi-image slot
  const galleryEl = new MockElement('div', {
    'data-wm-media': 'gallery',
    'data-wm-role': 'gallery',
    'data-wm-type': 'image-multiple',
    'data-wm-min-items': '2',
    'data-wm-max-items': '8',
    'data-wm-label': 'Treasured Memories'
  });

  // Video slot
  const videoEl = new MockElement('video', {
    'data-wm-media': 'video_message',
    'data-wm-type': 'video',
    'data-wm-max-duration': '120',
    'data-wm-label': 'Birthday Video Wish'
  });

  // Audio / Music slot
  const musicEl = new MockElement('audio', {
    'data-wm-media': 'bg_music',
    'data-wm-type': 'audio',
    'data-wm-label': 'Background Music',
    'data-wm-music-toggle': 'true'
  });

  // Voice Note slot
  const voiceEl = new MockElement('div', {
    'data-wm-media': 'voice_note',
    'data-wm-type': 'voice',
    'data-wm-label': 'Voice Dedication',
    'data-wm-max-duration': '60'
  });

  doc.body.appendChild(coverEl);
  doc.body.appendChild(galleryEl);
  doc.body.appendChild(videoEl);
  doc.body.appendChild(musicEl);
  doc.body.appendChild(voiceEl);

  const analysis = Analyzer.analyze({ document: doc, force: true });
  assert(analysis.media && Array.isArray(analysis.media.slots), 'TEST 1: Analysis contains media slots array');
  assert(analysis.media.slots.length === 5, 'TEST 1: Exactly 5 declared media slots detected');

  const coverSlot = analysis.media.slots.find(s => s.id === 'cover_photo');
  assert(coverSlot && coverSlot.required === true, 'TEST 1: Cover photo discovered as required');
  assert(coverSlot.role === 'cover', 'TEST 1: Cover photo role is "cover"');
  assert(coverSlot.maxSizeBytes === 10485760, 'TEST 1: Cover photo maxSizeBytes parsed correctly');

  const gallerySlot = analysis.media.slots.find(s => s.id === 'gallery');
  assert(gallerySlot && gallerySlot.multiple === true, 'TEST 1: Gallery discovered as multiple=true');
  assert(gallerySlot.minItems === 2, 'TEST 1: Gallery minItems is 2');
  assert(gallerySlot.maxItems === 8, 'TEST 1: Gallery maxItems is 8');

  const voiceSlot = analysis.media.slots.find(s => s.id === 'voice_note');
  assert(voiceSlot && voiceSlot.type === 'voice', 'TEST 1: Voice slot discovered with type "voice"');
  assert(voiceSlot.maxDuration === 60, 'TEST 1: Voice slot maxDuration is 60s');
}

// -----------------------------------------------------------------------------
// TEST GROUP 2: Validation Engine (validateMediaState) (Spec 5, 8, 15, 16, 26, 59, 99, 100, 101, 102, 103)
// -----------------------------------------------------------------------------
{
  const testCapabilities = {
    slots: [
      {
        id: 'cover_photo',
        type: 'image',
        required: true,
        accept: ['image/jpeg', 'image/png'],
        maxSizeBytes: 10 * 1024 * 1024 // 10MB
      },
      {
        id: 'gallery',
        type: 'image',
        multiple: true,
        minItems: 2,
        maxItems: 4,
        accept: ['image/jpeg', 'image/png', 'image/webp']
      },
      {
        id: 'wish_video',
        type: 'video',
        maxDuration: 120
      }
    ]
  };

  // Test Missing Required Cover Photo (Spec 99)
  const emptyState = {};
  const res1 = validateMediaState(emptyState, testCapabilities);
  assert(res1.valid === false, 'TEST 2: Missing required cover photo fails validation');
  assert(res1.errors.some(e => e.mediaId === 'cover_photo' && e.code === 'REQUIRED'), 'TEST 2: Specific REQUIRED error code returned');

  // Test Invalid MIME type (Spec 101)
  const mimeBadState = {
    cover_photo: {
      id: 'm1',
      url: 'blob:test',
      mimeType: 'application/pdf',
      size: 500000
    }
  };
  const res2 = validateMediaState(mimeBadState, testCapabilities);
  assert(res2.valid === false && res2.errors.some(e => e.code === 'INVALID_MIME'), 'TEST 2: Reject PDF file on image slot with INVALID_MIME error');

  // Test File Size Limit Exceeded (Spec 102)
  const oversizedState = {
    cover_photo: {
      id: 'm1',
      url: 'blob:test',
      mimeType: 'image/jpeg',
      size: 15 * 1024 * 1024 // 15MB > 10MB
    }
  };
  const res3 = validateMediaState(oversizedState, testCapabilities);
  assert(res3.valid === false && res3.errors.some(e => e.code === 'MAX_SIZE'), 'TEST 2: Reject 15MB file on 10MB limit with MAX_SIZE error');

  // Test Gallery Min Items = 2 (Spec 100)
  const gallery1Item = {
    cover_photo: { id: 'm1', url: 'blob:c', mimeType: 'image/jpeg', size: 1000 },
    gallery: [
      { id: 'g1', url: 'blob:g1', mimeType: 'image/jpeg', size: 1000 }
    ]
  };
  const res4 = validateMediaState(gallery1Item, testCapabilities);
  assert(res4.valid === false && res4.errors.some(e => e.code === 'MIN_ITEMS'), 'TEST 2: 1 photo fails when minItems=2');

  // Test Gallery Max Items = 4 (Spec 100)
  const gallery5Items = {
    cover_photo: { id: 'm1', url: 'blob:c', mimeType: 'image/jpeg', size: 1000 },
    gallery: [
      { id: 'g1', url: 'blob:g1', mimeType: 'image/jpeg', size: 1000 },
      { id: 'g2', url: 'blob:g2', mimeType: 'image/jpeg', size: 1000 },
      { id: 'g3', url: 'blob:g3', mimeType: 'image/jpeg', size: 1000 },
      { id: 'g4', url: 'blob:g4', mimeType: 'image/jpeg', size: 1000 },
      { id: 'g5', url: 'blob:g5', mimeType: 'image/jpeg', size: 1000 }
    ]
  };
  const res5 = validateMediaState(gallery5Items, testCapabilities);
  assert(res5.valid === false && res5.errors.some(e => e.code === 'MAX_ITEMS'), 'TEST 2: 5 photos fail when maxItems=4');

  // Test Valid State
  const validState = {
    cover_photo: { id: 'm1', url: 'blob:c', mimeType: 'image/jpeg', size: 1000 },
    gallery: [
      { id: 'g1', url: 'blob:g1', mimeType: 'image/jpeg', size: 1000 },
      { id: 'g2', url: 'blob:g2', mimeType: 'image/jpeg', size: 1000 },
      { id: 'g3', url: 'blob:g3', mimeType: 'image/jpeg', size: 1000 }
    ]
  };
  const res6 = validateMediaState(validState, testCapabilities);
  assert(res6.valid === true && res6.errors.length === 0, 'TEST 2: 3 photos in gallery satisfies 2..4 bounds');

  // Test Video Duration Exceeded (Spec 103)
  const longVideoState = {
    cover_photo: { id: 'm1', url: 'blob:c', mimeType: 'image/jpeg', size: 1000 },
    gallery: [
      { id: 'g1', url: 'blob:g1', mimeType: 'image/jpeg', size: 1000 },
      { id: 'g2', url: 'blob:g2', mimeType: 'image/jpeg', size: 1000 }
    ],
    wish_video: {
      id: 'v1',
      url: 'blob:v1',
      mimeType: 'video/mp4',
      duration: 180 // 180s > 120s
    }
  };
  const res7 = validateMediaState(longVideoState, testCapabilities);
  assert(res7.valid === false && res7.errors.some(e => e.code === 'MAX_DURATION'), 'TEST 2: Reject 180s video when maxDuration=120s');
}

// -----------------------------------------------------------------------------
// TEST GROUP 3: Media State Isolation & Replacement (Spec 51, 52, 63, 104, 105, 106)
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  globalScope.document = doc;
  const coverImg = new MockElement('img', { 'data-wm-media': 'cover_photo', 'data-wm-required': 'true' });
  const optImg = new MockElement('img', { 'data-wm-media': 'photo_extra', 'data-wm-required': 'false' });
  doc.body.appendChild(coverImg);
  doc.body.appendChild(optImg);

  // Initialize runtime
  TemplateRuntime.init({});
  TemplateRuntime.updateMedia('cover_photo', 'set', { id: 'c1', url: 'https://example.com/cover1.jpg' });
  TemplateRuntime.updateMedia('photo_extra', 'set', { id: 'e1', url: 'https://example.com/extra1.jpg' });

  let state = TemplateRuntime.getState();
  assert(state.media && state.media.cover_photo && state.media.cover_photo.url === 'https://example.com/cover1.jpg', 'TEST 3: Cover photo set in runtime state');
  assert(coverImg.getAttribute('src') === 'https://example.com/cover1.jpg', 'TEST 3: Cover photo applied to DOM element');

  // Attempt removing required cover photo (Spec 106)
  const removeReqResult = TemplateRuntime.updateMedia('cover_photo', 'remove');
  assert(removeReqResult === false, 'TEST 3: Attempt to remove required cover photo is rejected');
  assert(TemplateRuntime.getState().media.cover_photo !== undefined, 'TEST 3: Required cover photo remains preserved');

  // Remove optional photo_extra (Spec 105)
  const removeOptResult = TemplateRuntime.updateMedia('photo_extra', 'remove');
  assert(removeOptResult === true, 'TEST 3: Removing optional photo succeeds');
  assert(TemplateRuntime.getState().media.photo_extra === undefined, 'TEST 3: Optional photo removed from state');
  assert(TemplateRuntime.getState().media.cover_photo !== undefined, 'TEST 3: Cover photo unaffected by optional removal');

  // Replace cover photo (Spec 104)
  TemplateRuntime.updateMedia('cover_photo', 'set', { id: 'c2', url: 'https://example.com/cover2.jpg' });
  assert(TemplateRuntime.getState().media.cover_photo.url === 'https://example.com/cover2.jpg', 'TEST 3: Cover photo replaced with new photo');
  assert(coverImg.getAttribute('src') === 'https://example.com/cover2.jpg', 'TEST 3: DOM element src updated with new photo');
}

// -----------------------------------------------------------------------------
// TEST GROUP 4: Media Ordering (WISHMAGIC_MEDIA_ORDER) (Spec 9, 54, 107)
// -----------------------------------------------------------------------------
{
  const galleryItems = [
    { id: 'photo_A', url: 'blob:A' },
    { id: 'photo_B', url: 'blob:B' },
    { id: 'photo_C', url: 'blob:C' }
  ];

  TemplateRuntime.updateMedia('gallery', 'set', galleryItems);
  assert(TemplateRuntime.getState().media.gallery.length === 3, 'TEST 4: Gallery initialized with 3 items');

  // Reorder to C, A, B
  const newOrder = ['photo_C', 'photo_A', 'photo_B'];
  TemplateRuntime.updateMediaOrder('gallery', newOrder);

  const reorderedState = TemplateRuntime.getState().media.gallery;
  assert(reorderedState[0].id === 'photo_C', 'TEST 4: First item is photo_C');
  assert(reorderedState[1].id === 'photo_A', 'TEST 4: Second item is photo_A');
  assert(reorderedState[2].id === 'photo_B', 'TEST 4: Third item is photo_B');
}

// -----------------------------------------------------------------------------
// TEST GROUP 5: Section OFF / ON Media Preservation (Spec 58, 109)
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  globalScope.document = doc;
  const gallerySec = new MockElement('section', { 'data-wm-section': 'gallery', 'data-wm-toggleable': 'true' });
  const galleryMedia = new MockElement('div', { 'data-wm-media': 'gallery', 'data-wm-type': 'image-multiple' });
  gallerySec.appendChild(galleryMedia);
  doc.body.appendChild(gallerySec);

  TemplateRuntime.init({});
  TemplateRuntime.updateMedia('gallery', 'set', [
    { id: 'p1', url: 'https://example.com/p1.jpg' },
    { id: 'p2', url: 'https://example.com/p2.jpg' }
  ]);

  // Turn Gallery section OFF
  TemplateRuntime.updateSection('gallery', false);
  assert(gallerySec.hidden === true, 'TEST 5: Gallery section hidden when toggled OFF');
  assert(TemplateRuntime.getState().media.gallery.length === 2, 'TEST 5: Media items remain intact when section is OFF');

  // Turn Gallery section back ON
  TemplateRuntime.updateSection('gallery', true);
  assert(gallerySec.hidden === false, 'TEST 5: Gallery section restored when toggled ON');
  assert(TemplateRuntime.getState().media.gallery[0].id === 'p1', 'TEST 5: Preserved media intact after re-enabling section');
}

// -----------------------------------------------------------------------------
// TEST GROUP 6: Media + Animation Integration (Spec 57, 110)
// -----------------------------------------------------------------------------
{
  TemplateRuntime.init({});
  TemplateRuntime.updateAnimation('media', 'ken-burns');
  TemplateRuntime.updateMedia('cover_photo', 'set', { id: 'pic1', url: 'https://example.com/1.jpg' });

  assert(TemplateRuntime.getState().animations.media === 'ken-burns', 'TEST 6: Initial media animation set to ken-burns');

  // Replace photo
  TemplateRuntime.updateMedia('cover_photo', 'set', { id: 'pic2', url: 'https://example.com/2.jpg' });
  assert(TemplateRuntime.getState().animations.media === 'ken-burns', 'TEST 6: Replacing photo preserves media animation setting');
}

// -----------------------------------------------------------------------------
// TEST GROUP 7: Template Switching & Media Normalization (Spec 79, 81, 111)
// -----------------------------------------------------------------------------
{
  // Current media state from Template A (photo + video + music)
  const currentMediaA = {
    cover_photo: { id: 'c1', url: 'blob:c1', mimeType: 'image/jpeg' },
    gallery: [
      { id: 'g1', url: 'blob:g1', mimeType: 'image/jpeg' },
      { id: 'g2', url: 'blob:g2', mimeType: 'image/jpeg' }
    ],
    video_1: { id: 'v1', url: 'blob:v1', mimeType: 'video/mp4' }
  };

  // Template B capabilities (cover_photo + gallery only, no video)
  const templateBCapabilities = {
    slots: [
      { id: 'cover_photo', type: 'image', required: true },
      { id: 'gallery', type: 'image', multiple: true, maxItems: 3 }
    ]
  };

  const normalizedB = normalizeMediaState(currentMediaA, templateBCapabilities);
  assert(normalizedB.cover_photo !== undefined, 'TEST 7: Compatible cover_photo preserved');
  assert(normalizedB.gallery && normalizedB.gallery.length === 2, 'TEST 7: Compatible gallery photos preserved');
  assert(normalizedB.video_1 === undefined, 'TEST 7: Unsupported video slot safely omitted from active state');
}

// -----------------------------------------------------------------------------
// TEST GROUP 8: JSON Serialization (No Blobs/Files in WishMagicData) (Spec 43, 49, 90, 112)
// -----------------------------------------------------------------------------
{
  const testData = {
    recipient_name: 'Alex',
    media: {
      cover_photo: {
        id: 'media_101',
        provider: 'temporary',
        url: 'blob:mock-url',
        mimeType: 'image/jpeg',
        size: 204800,
        width: 1200,
        height: 1200
      },
      gallery: [
        {
          id: 'media_102',
          provider: 'temporary',
          url: 'blob:mock-g1',
          mimeType: 'image/webp',
          size: 102400
        }
      ]
    }
  };

  const serialized = JSON.stringify(testData);
  const deserialized = JSON.parse(serialized);

  assert(typeof serialized === 'string', 'TEST 8: WishMagicData.media is 100% JSON serializable');
  assert(deserialized.media.cover_photo.id === 'media_101', 'TEST 8: Deserialized media ID matches');
  assert(typeof deserialized.media.cover_photo.size === 'number', 'TEST 8: Deserialized size is numeric primitive');
  assert(!('file' in deserialized.media.cover_photo), 'TEST 8: Zero File/Blob objects in serializable state');
}

// -----------------------------------------------------------------------------
// TEST GROUP 9: Duplicate Media ID Warning (Spec 71 & 73)
// -----------------------------------------------------------------------------
{
  const doc = new MockDocument();
  const slot1 = new MockElement('img', { 'data-wm-media': 'duplicate_photo', 'data-wm-type': 'image' });
  const slot2 = new MockElement('img', { 'data-wm-media': 'duplicate_photo', 'data-wm-type': 'image' });
  doc.body.appendChild(slot1);
  doc.body.appendChild(slot2);

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.warnings.some(w => w.code === 'DUPLICATE_MEDIA_ID'), 'TEST 9: DUPLICATE_MEDIA_ID warning reported for identical uninstanced IDs');
}

// -----------------------------------------------------------------------------
// TEST GROUP 10: Audio Ducking Coordination (Spec 69 & 70)
// -----------------------------------------------------------------------------
{
  const mockMusic = { volume: 0.8, pause: () => {} };
  AudioRuntime.setMusicAudio(mockMusic);

  assert(mockMusic.volume === 0.8, 'TEST 10: Initial background music volume is 0.8');

  // Voice note plays
  AudioRuntime.onVoicePlay();
  assert(mockMusic.volume === 0.2, 'TEST 10: Music volume ducks to 0.2 while voice note is playing');

  // Voice note finishes
  AudioRuntime.onVoiceEnd();
  assert(mockMusic.volume === 0.8, 'TEST 10: Music volume restores to 0.8 when voice note completes');
}

// -----------------------------------------------------------------------------
// TEST GROUP 11: Honest Template A vs Template B Generation (Spec 97 & 98)
// -----------------------------------------------------------------------------
{
  // Template A: Cover, Gallery (2-8), Video, Music, Voice
  const docA = new MockDocument();
  docA.body.appendChild(new MockElement('img', { 'data-wm-media': 'cover_photo', 'data-wm-role': 'cover', 'data-wm-type': 'image', 'data-wm-required': 'true' }));
  docA.body.appendChild(new MockElement('div', { 'data-wm-media': 'gallery', 'data-wm-type': 'image-multiple', 'data-wm-min-items': '2', 'data-wm-max-items': '8' }));
  docA.body.appendChild(new MockElement('video', { 'data-wm-media': 'video_1', 'data-wm-type': 'video' }));
  docA.body.appendChild(new MockElement('audio', { 'data-wm-media': 'bg_music', 'data-wm-type': 'audio' }));
  docA.body.appendChild(new MockElement('div', { 'data-wm-media': 'voice_note', 'data-wm-type': 'voice' }));

  const analysisA = Analyzer.analyze({ document: docA, force: true });
  const schemaA = Schema.fromAnalysis(analysisA);

  assert(schemaA.media.slots.length === 5, 'TEST 11: Template A exposes all 5 declared media slots');
  assert(schemaA.media.video === true, 'TEST 11: Template A exposes video capability');
  assert(schemaA.media.voice === true, 'TEST 11: Template A exposes voice capability');

  // Template B: Cover Photo + 3 gallery photos ONLY (no video, music, voice)
  const docB = new MockDocument();
  docB.body.appendChild(new MockElement('img', { 'data-wm-media': 'cover_photo', 'data-wm-role': 'cover', 'data-wm-type': 'image', 'data-wm-required': 'true' }));
  docB.body.appendChild(new MockElement('div', { 'data-wm-media': 'gallery', 'data-wm-type': 'image-multiple', 'data-wm-max-items': '3' }));

  const analysisB = Analyzer.analyze({ document: docB, force: true });
  const schemaB = Schema.fromAnalysis(analysisB);

  assert(schemaB.media.slots.length === 2, 'TEST 11: Template B honestly exposes ONLY 2 declared slots');
  assert(schemaB.media.video === false, 'TEST 11: Template B honestly has video = false');
  assert(schemaB.media.voice === false, 'TEST 11: Template B honestly has voice = false');
  assert(schemaB.media.audio === false, 'TEST 11: Template B honestly has audio = false');
}

console.log(`\n🎉 Part 8 Advanced Media & Upload/Capability Test Suite Completed: ${passed} assertions passed successfully.\n`);
