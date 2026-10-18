/**
 * Part 49 — WishMagic UTP v1.2.0 Extension, Admin Section/Subsection Visibility
 * & Button Action/Link Configuration End-to-End Test Suite
 *
 * Tests all 24 mandatory acceptance criteria from Section 12 against the real
 * implementation modules (schema, validator, variant/effective-config engine,
 * upload ingest pipeline, Cloudflare Worker API endpoints, runtime DOM removal,
 * customizer & wish renderer integration, concurrency, and wish snapshot immutability).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import JSZip from '../src/vendor/jszip.js';

import {
  UTP_SCHEMA_VERSION,
  UTP_VARIANT_SCHEMA_VERSION,
  UTP_SECTIONS_ACTIONS_SCHEMA_VERSION,
  UTP_LATEST_SCHEMA_VERSION,
  UTP_SUPPORTED_SCHEMA_VERSIONS,
  UTP_MAX_SECTION_NESTING_DEPTH,
  UTP_SUPPORTED_ACTION_TYPES,
  UTP_ACTION_FALLBACK_BEHAVIORS,
  isValidInternalWishMagicRoute,
  validateActionDestinationUrl
} from '../src/template-protocol-schema.js';

import {
  validateUtpManifest,
  validateAdminTemplateConfiguration,
  flattenSectionsTree,
  extractHtmlDeclaredSectionsAndActions
} from '../src/template-protocol-validator.js';

import {
  resolveEffectiveTemplateConfiguration,
  sanitizeCustomerWishDataAgainstConfig,
  buildContextualInternalUrl,
  resolveVariantHierarchy,
  buildVariantRecordFromUtpDeclaration,
  escapeHtmlText
} from '../src/template-variant-engine.js';

import {
  executeB2TemplateIngestPipeline,
  createMockD1Database
} from '../src/template-ingest-pipeline.js';

import worker from '../src/worker.js';
import { after } from 'node:test';
import { DatabaseSync, cleanupSqliteBridge } from '../scripts/sqlite-compat.js';
import { D1MigrationRunner } from '../scripts/migration-runner.js';

// ----------------------------------------------------------------------------
// Sample UTP v1.2.0 HTML & Manifest Fixtures
// ----------------------------------------------------------------------------
const UTP_V12_HTML = `<!DOCTYPE html>
<html lang="en" data-wm-protocol="1.2">
<head>
  <meta charset="UTF-8" />
  <title>BRO CODE v1.2.0</title>
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <nav id="template-nav">
    <a href="#hero" data-wm-nav-target="hero">Hero</a>
    <a href="#countdown" data-wm-nav-target="countdown">Countdown</a>
    <a href="#gallery" data-wm-nav-target="gallery">Memories</a>
    <a href="#secret_message" data-wm-nav-target="secret_message">Secret Vault</a>
  </nav>

  <section id="hero" data-wm-section="hero">
    <div data-wm-subsection="hero_header">
      <h1 data-wm-field="hero_title" data-wm-type="text">THE UNBREAKABLE CODE</h1>
      <p data-wm-field="hero_subtitle" data-wm-type="text">Celebrating a bond</p>
      <span data-wm-field="recipient_name" data-wm-type="text">Aarav</span>
    </div>
    <div data-wm-subsection="hero_badge">
      <span data-wm-field="bond_badge" data-wm-type="text">100% Loyalty</span>
      <div data-wm-subsection="hero_badge_sparkle">
        <span class="sparkle-tag">VIP</span>
      </div>
    </div>
    <div data-wm-subsection="hero_cta_bar">
      <a data-wm-action="hero_cta" href="/customize.html">Create Your Wish</a>
      <button data-wm-action="explore_memories_btn" type="button">Explore Memories</button>
      <button data-wm-action="watch_surprise_btn" type="button">Watch Surprise</button>
      <a data-wm-action="back_to_templates_btn" href="/templates.html">Back to Templates</a>
      <a data-wm-action="gift_store_btn" href="https://wishmagic.example.com/gifts">Gift Guide</a>
    </div>
  </section>

  <section id="countdown" data-wm-section="countdown">
    <span data-wm-field="event_date" data-wm-type="date">2026-12-25</span>
  </section>

  <section id="message" data-wm-section="message">
    <p data-wm-field="custom_message" data-wm-type="textarea">Default tribute message</p>
    <span data-wm-field="sender_name" data-wm-type="text">— Kabir</span>
  </section>

  <section id="gallery" data-wm-section="gallery">
    <div data-wm-subsection="gallery_featured">
      <img data-wm-field="photo_1" data-wm-type="image" src="assets/images/cover.jpg" alt="Memory 1" />
    </div>
    <div data-wm-subsection="gallery_secondary">
      <img data-wm-field="photo_2" data-wm-type="image" src="assets/images/memory2.jpg" alt="Memory 2" />
    </div>
  </section>

  <section id="secret_message" data-wm-section="secret_message">
    <p data-wm-field="secret_note" data-wm-type="textarea">Top secret vault note</p>
    <audio id="secret-audio" src="assets/audio/secret.mp3"></audio>
  </section>

  <div id="surprise_modal" data-wm-modal="surprise_modal" aria-hidden="true" style="display:none;">
    <h2>Surprise Unlocked!</h2>
  </div>

  <script src="/js/wishmagic-template-protocol.js"></script>
  <script src="js/template.js"></script>
</body>
</html>`;

const UTP_V12_MANIFEST = {
  $schema: 'wishmagic-template',
  schemaVersion: '1.2.0',
  template: {
    id: 'bro-code-v12',
    slug: 'bro-code-v12',
    name: 'BRO CODE v1.2',
    description: 'UTP v1.2.0 interactive celebration template with nested subsections and actions',
    templateVersion: '1.2.0',
    category: 'birthday',
    tier: 'free',
    price: 0,
    author: 'WishMagic Studio',
    entry: 'index.html'
  },
  compatibility: {
    runtimeApi: '1.2',
    minimumRuntimeApi: '1.0'
  },
  files: {
    entry: 'index.html',
    styles: ['css/style.css'],
    scripts: ['js/template.js']
  },
  capabilities: ['photos', 'multiplePhotos', 'gallery', 'countdown', 'themes', 'animations', 'sections', 'secretMessage', 'finalSurprise'],
  relationships: ['best_friend', 'brother', 'boyfriend'],
  sections: [
    {
      id: 'hero',
      label: 'Hero Section',
      required: true,
      toggleable: false,
      defaultEnabled: true,
      order: 1,
      emptyParentPolicy: 'keep',
      fields: ['recipient_name', 'hero_title', 'hero_subtitle'],
      subsections: [
        {
          id: 'hero_header',
          label: 'Hero Header Copy',
          required: true,
          toggleable: false,
          defaultEnabled: true,
          order: 1,
          fields: ['recipient_name', 'hero_title', 'hero_subtitle']
        },
        {
          id: 'hero_badge',
          label: 'Bond Meter Badge',
          required: false,
          toggleable: true,
          defaultEnabled: true,
          order: 2,
          fields: ['bond_badge'],
          subsections: [
            {
              id: 'hero_badge_sparkle',
              label: 'Badge VIP Sparkle',
              required: false,
              toggleable: true,
              defaultEnabled: true,
              order: 1
            }
          ]
        },
        {
          id: 'hero_cta_bar',
          label: 'Hero Action Bar',
          required: false,
          toggleable: true,
          defaultEnabled: true,
          order: 3,
          actions: ['hero_cta', 'explore_memories_btn', 'watch_surprise_btn', 'back_to_templates_btn', 'gift_store_btn']
        }
      ]
    },
    {
      id: 'countdown',
      label: 'Celebration Countdown',
      required: false,
      toggleable: true,
      defaultEnabled: true,
      order: 2,
      fields: ['event_date']
    },
    {
      id: 'message',
      label: 'Tribute Letter',
      required: true,
      toggleable: false,
      defaultEnabled: true,
      order: 3,
      fields: ['custom_message', 'sender_name']
    },
    {
      id: 'gallery',
      label: 'Hall of Memories',
      required: false,
      toggleable: true,
      defaultEnabled: true,
      order: 4,
      emptyParentPolicy: 'collapse',
      fields: ['photo_1', 'photo_2'],
      subsections: [
        {
          id: 'gallery_featured',
          label: 'Featured Cover Memory',
          required: false,
          toggleable: true,
          defaultEnabled: true,
          order: 1,
          fields: ['photo_1']
        },
        {
          id: 'gallery_secondary',
          label: 'Secondary Polaroid Memory',
          required: false,
          toggleable: true,
          defaultEnabled: true,
          order: 2,
          fields: ['photo_2']
        }
      ]
    },
    {
      id: 'secret_message',
      label: 'Classified Vault Note',
      required: false,
      toggleable: true,
      defaultEnabled: true,
      order: 5,
      fields: ['secret_note']
    }
  ],
  actions: [
    {
      id: 'hero_cta',
      label: 'Create Your Wish',
      type: 'customizer',
      target: '/customize.html',
      sectionId: 'hero_cta_bar',
      editableLabel: true,
      configurable: true,
      relationshipSpecific: true,
      required: false,
      defaultEnabled: true,
      fallbackBehavior: 'hide'
    },
    {
      id: 'explore_memories_btn',
      label: 'Explore Memories',
      type: 'section',
      target: 'gallery',
      sectionId: 'hero_cta_bar',
      editableLabel: true,
      configurable: true,
      relationshipSpecific: true,
      required: false,
      defaultEnabled: true,
      fallbackBehavior: 'hide'
    },
    {
      id: 'watch_surprise_btn',
      label: 'Watch Surprise',
      type: 'modal',
      target: 'surprise_modal',
      sectionId: 'hero_cta_bar',
      editableLabel: true,
      configurable: true,
      relationshipSpecific: true,
      required: false,
      defaultEnabled: true,
      fallbackBehavior: 'hide'
    },
    {
      id: 'back_to_templates_btn',
      label: 'Back to Templates',
      type: 'internal_url',
      target: '/templates.html',
      sectionId: 'hero_cta_bar',
      editableLabel: false,
      configurable: false,
      relationshipSpecific: false,
      required: true,
      defaultEnabled: true,
      fallbackBehavior: 'hide'
    },
    {
      id: 'gift_store_btn',
      label: 'Gift Guide',
      type: 'external_url',
      target: 'https://wishmagic.example.com/gifts',
      sectionId: 'hero_cta_bar',
      editableLabel: true,
      configurable: true,
      relationshipSpecific: true,
      required: false,
      defaultEnabled: true,
      openInNewTab: true,
      fallbackBehavior: 'hide'
    }
  ],
  fields: [
    { id: 'recipient_name', type: 'text', label: 'Recipient Name', required: true, defaultValue: 'Aarav', section: 'hero', subsection: 'hero_header', binding: { target: 'text', selector: "[data-wm-field='recipient_name']" } },
    { id: 'hero_title', type: 'text', label: 'Hero Headline', required: false, defaultValue: 'THE UNBREAKABLE CODE', section: 'hero', subsection: 'hero_header', binding: { target: 'text', selector: "[data-wm-field='hero_title']" } },
    { id: 'hero_subtitle', type: 'text', label: 'Hero Subtitle', required: false, defaultValue: 'Celebrating a bond', section: 'hero', subsection: 'hero_header', binding: { target: 'text', selector: "[data-wm-field='hero_subtitle']" } },
    { id: 'bond_badge', type: 'text', label: 'Bond Badge Text', required: false, defaultValue: '100% Loyalty', section: 'hero', subsection: 'hero_badge', binding: { target: 'text', selector: "[data-wm-field='bond_badge']" } },
    { id: 'event_date', type: 'date', label: 'Celebration Date', required: true, defaultValue: '2026-12-25', section: 'countdown', binding: { target: 'text', selector: "[data-wm-field='event_date']" } },
    { id: 'custom_message', type: 'textarea', label: 'Personal Message', required: false, defaultValue: 'Default tribute message', section: 'message', binding: { target: 'text', selector: "[data-wm-field='custom_message']" } },
    { id: 'sender_name', type: 'text', label: 'Sender Name', required: false, defaultValue: '— Kabir', section: 'message', binding: { target: 'text', selector: "[data-wm-field='sender_name']" } },
    { id: 'photo_1', type: 'image', label: 'Featured Photo', required: false, defaultValue: 'assets/images/cover.jpg', section: 'gallery', subsection: 'gallery_featured', binding: { target: 'src', selector: "[data-wm-field='photo_1']" } },
    { id: 'photo_2', type: 'image', label: 'Secondary Photo', required: false, defaultValue: 'assets/images/memory2.jpg', section: 'gallery', subsection: 'gallery_secondary', binding: { target: 'src', selector: "[data-wm-field='photo_2']" } },
    { id: 'secret_note', type: 'textarea', label: 'Secret Vault Note', required: false, defaultValue: 'Top secret vault note', section: 'secret_message', binding: { target: 'text', selector: "[data-wm-field='secret_note']" } }
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
      },
      visibilityOverrides: {
        secret_message: true
      },
      actions: [
        { id: 'hero_cta', label: 'Create for Your Best Friend', type: 'customizer', target: '/customize.html' }
      ]
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
      visibilityOverrides: {
        gallery_secondary: false
      },
      actions: [
        { id: 'hero_cta', label: 'Create for Your Brother', type: 'customizer', target: '/customize.html' }
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
      },
      actions: [
        { id: 'hero_cta', label: 'Create for Your Boyfriend', type: 'customizer', target: '/customize.html' }
      ]
    }
  ]
};

async function buildZipBufferFromManifest(manifest, html = UTP_V12_HTML) {
  const zip = new JSZip();
  zip.file('wishmagic.json', JSON.stringify(manifest, null, 2));
  zip.file('index.html', html);
  zip.file('css/style.css', ':root { --wm-primary: #f59e0b; } body { margin: 0; }');
  zip.file('js/template.js', 'window.addEventListener("message", function(){});');
  // 1x1 transparent PNG
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  zip.file('assets/images/cover.jpg', pngBytes);
  zip.file('assets/images/memory2.jpg', pngBytes);
  zip.file('assets/audio/secret.mp3', Buffer.from('ID3-mock-audio-content'));
  return await zip.generateAsync({ type: 'uint8array' });
}

// ----------------------------------------------------------------------------
// Minimal DOM Harness for testing real public/js/wishmagic-template-protocol.js
// ----------------------------------------------------------------------------
function createInteractiveDomHarness() {
  const elementsById = new Map();
  const allElements = [];

  class MockElement {
    constructor(tagName, attrs = {}, parent = null) {
      this.tagName = String(tagName || 'DIV').toUpperCase();
      this.attributes = { ...attrs };
      this.dataset = {};
      this.style = {
        props: {},
        setProperty(k, v) { this.props[k] = v; },
        removeProperty(k) { delete this.props[k]; }
      };
      this.children = [];
      this.parentElement = parent;
      this.textContent = '';
      this.innerHTML = '';
      this.disabled = false;
      this.paused = false;
      this.src = attrs.src || '';
      this.href = attrs.href || '';
      this.listeners = {};
      if (attrs.id) elementsById.set(attrs.id, this);
      allElements.push(this);
      if (parent) parent.children.push(this);
    }

    get id() {
      return this.attributes.id || '';
    }

    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name);
    }

    get nextElementSibling() {
      if (!this.parentElement) return null;
      const idx = this.parentElement.children.indexOf(this);
      return idx !== -1 && idx + 1 < this.parentElement.children.length ? this.parentElement.children[idx + 1] : null;
    }

    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    }

    setAttribute(name, val) {
      this.attributes[name] = String(val);
      if (name === 'id') elementsById.set(String(val), this);
      if (name === 'href') this.href = String(val);
      if (name === 'src') this.src = String(val);
    }

    removeAttribute(name) {
      delete this.attributes[name];
      if (name === 'src') this.src = '';
      if (name === 'href') this.href = '';
    }

    pause() {
      this.paused = true;
    }

    load() {}

    scrollIntoView() {
      this.scrolledIntoView = true;
    }

    addEventListener(type, fn) {
      this.listeners[type] = fn;
    }

    remove() {
      this._removed = true;
      if (this.attributes.id) elementsById.delete(this.attributes.id);
      if (this.parentElement) {
        this.parentElement.children = this.parentElement.children.filter(c => c !== this);
      }
      const removeDescendants = (node) => {
        for (const child of node.children) {
          child._removed = true;
          if (child.attributes.id) elementsById.delete(child.attributes.id);
          removeDescendants(child);
        }
      };
      removeDescendants(this);
    }

    isActive() {
      let cur = this;
      while (cur) {
        if (cur._removed) return false;
        cur = cur.parentElement;
      }
      return true;
    }

    matchesSelector(sel) {
      if (!this.isActive()) return false;
      const trimmed = sel.trim();
      // Match tag names (audio, video, iframe)
      if (/^[a-zA-Z0-9]+$/.test(trimmed)) {
        return this.tagName === trimmed.toUpperCase();
      }
      // Match #id
      if (trimmed.startsWith('#') && !trimmed.includes('[') && !trimmed.includes(' ')) {
        return this.getAttribute('id') === trimmed.slice(1);
      }
      // Match [attr="val"] or [attr='val'] or [attr]
      const attrRegex = /\[([a-zA-Z0-9_-]+)(?:=['"]?([^'"\]]+)['"]?)?\]/g;
      let match;
      let matchedAny = false;
      while ((match = attrRegex.exec(trimmed)) !== null) {
        matchedAny = true;
        const attrName = match[1];
        const expectedVal = match[2];
        const actualVal = this.getAttribute(attrName);
        if (actualVal === null) return false;
        if (expectedVal !== undefined && actualVal !== expectedVal) return false;
      }
      if (matchedAny) {
        if (trimmed.startsWith('a[')) return this.tagName === 'A';
        return true;
      }
      return false;
    }

    querySelectorAll(selectorGroup) {
      const selectors = String(selectorGroup).split(',').map(s => s.trim()).filter(Boolean);
      const results = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (!child._removed) {
            if (selectors.some(sel => child.matchesSelector(sel))) {
              results.push(child);
            }
            visit(child);
          }
        }
      };
      visit(this);
      return results;
    }

    querySelector(selectorGroup) {
      const all = this.querySelectorAll(selectorGroup);
      return all[0] || null;
    }

    closest(selectorGroup) {
      const selectors = String(selectorGroup).split(',').map(s => s.trim()).filter(Boolean);
      let cur = this;
      while (cur) {
        if (selectors.some(sel => cur.matchesSelector(sel))) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
  }

  const documentElement = new MockElement('HTML');
  const body = new MockElement('BODY', {}, documentElement);

  // Build DOM mirroring UTP_V12_HTML
  const nav = new MockElement('NAV', { id: 'template-nav' }, body);
  new MockElement('A', { href: '#hero', 'data-wm-nav-target': 'hero' }, nav).textContent = 'Hero';
  new MockElement('A', { href: '#gallery', 'data-wm-nav-target': 'gallery' }, nav).textContent = 'Gallery';
  new MockElement('A', { href: '#secret_message', 'data-wm-nav-target': 'secret_message' }, nav).textContent = 'Secret';

  const hero = new MockElement('SECTION', { id: 'hero', 'data-wm-section': 'hero' }, body);
  const heroHeader = new MockElement('DIV', { 'data-wm-subsection': 'hero_header' }, hero);
  const heroTitle = new MockElement('H1', { 'data-wm-field': 'hero_title', 'data-wm-type': 'text' }, heroHeader);
  heroTitle.textContent = 'THE UNBREAKABLE CODE';
  const heroBadge = new MockElement('DIV', { 'data-wm-subsection': 'hero_badge' }, hero);
  const heroBadgeSparkle = new MockElement('DIV', { 'data-wm-subsection': 'hero_badge_sparkle' }, heroBadge);
  heroBadgeSparkle.textContent = 'VIP';

  const heroCtaBar = new MockElement('DIV', { 'data-wm-subsection': 'hero_cta_bar' }, hero);
  const ctaBtn = new MockElement('A', { 'data-wm-action': 'hero_cta', href: '/customize.html' }, heroCtaBar);
  ctaBtn.textContent = 'Create Your Wish';
  const exploreBtn = new MockElement('BUTTON', { 'data-wm-action': 'explore_memories_btn' }, heroCtaBar);
  exploreBtn.textContent = 'Explore Memories';
  const surpriseBtn = new MockElement('BUTTON', { 'data-wm-action': 'watch_surprise_btn' }, heroCtaBar);
  surpriseBtn.textContent = 'Watch Surprise';
  const backBtn = new MockElement('A', { 'data-wm-action': 'back_to_templates_btn', href: '/templates.html' }, heroCtaBar);
  backBtn.textContent = 'Back to Templates';
  const giftBtn = new MockElement('A', { 'data-wm-action': 'gift_store_btn', href: 'https://wishmagic.example.com/gifts' }, heroCtaBar);
  giftBtn.textContent = 'Gift Guide';

  const gallery = new MockElement('SECTION', { id: 'gallery', 'data-wm-section': 'gallery', 'data-wm-empty-parent-policy': 'collapse' }, body);
  const galleryFeatured = new MockElement('DIV', { 'data-wm-subsection': 'gallery_featured' }, gallery);
  new MockElement('IMG', { 'data-wm-field': 'photo_1', src: 'assets/images/cover.jpg' }, galleryFeatured);
  const gallerySecondary = new MockElement('DIV', { 'data-wm-subsection': 'gallery_secondary' }, gallery);
  new MockElement('IMG', { 'data-wm-field': 'photo_2', src: 'assets/images/memory2.jpg' }, gallerySecondary);

  const secretSection = new MockElement('SECTION', { id: 'secret_message', 'data-wm-section': 'secret_message' }, body);
  const secretNote = new MockElement('P', { 'data-wm-field': 'secret_note' }, secretSection);
  secretNote.textContent = 'Top secret vault note';
  const secretAudio = new MockElement('AUDIO', { id: 'secret-audio', src: 'assets/audio/secret.mp3' }, secretSection);

  const surpriseModal = new MockElement('DIV', { id: 'surprise_modal', 'data-wm-modal': 'surprise_modal', 'aria-hidden': 'true' }, body);
  surpriseModal.style.display = 'none';

  const document = {
    readyState: 'complete',
    documentElement,
    body,
    getElementById(id) {
      const el = elementsById.get(id);
      return el && el.isActive() ? el : null;
    },
    querySelectorAll(sel) {
      return documentElement.querySelectorAll(sel);
    },
    querySelector(sel) {
      return documentElement.querySelector(sel);
    },
    addEventListener() {}
  };

  const windowObj = {
    document,
    location: {
      origin: 'https://wishmagic.example.com',
      href: 'https://wishmagic.example.com/template-preview.html?template=bro-code-v12&variant=var_brother&rel=brother',
      search: '?template=bro-code-v12&variant=var_brother&rel=brother'
    },
    parent: null,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    dispatchEvent() {},
    addEventListener() {},
    open(url, target, features) {
      windowObj._lastOpenedWindow = { url, target, features };
    },
    clearInterval() {},
    clearTimeout() {}
  };
  windowObj.parent = windowObj;

  // Execute the real public/js/wishmagic-template-protocol.js inside the sandbox
  const protocolScript = fs.readFileSync(
    path.resolve('public/js/wishmagic-template-protocol.js'),
    'utf8'
  );
  const context = vm.createContext({
    window: windowObj,
    document,
    URL,
     URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  });
  vm.runInContext(protocolScript, context);

  return {
    window: windowObj,
    document,
    WishMagicTemplate: windowObj.WishMagicTemplate,
    elements: {
      nav,
      hero,
      heroHeader,
      heroBadge,
      heroBadgeSparkle,
      heroCtaBar,
      ctaBtn,
      exploreBtn,
      surpriseBtn,
      backBtn,
      giftBtn,
      gallery,
      galleryFeatured,
      gallerySecondary,
      secretSection,
      secretAudio,
      surpriseModal
    }
  };
}

// ============================================================================
// TEST SUITE
// ============================================================================
describe('Part 49 — WishMagic UTP v1.2.0 Sections, Subsections, Visibility & Action Registry', () => {
  after(() => cleanupSqliteBridge());

  describe('12.1 Backward Compatibility: UTP v1.0.0, v1.1.0 & v1.2.0 Packages', () => {
    it('supports UTP v1.0.0 legacy package with no variants, no subsections, and no actions', () => {
      const legacyV10 = {
        $schema: 'wishmagic-template',
        schemaVersion: '1.0.0',
        template: {
          id: 'legacy-v10-card',
          slug: 'legacy-v10-card',
          name: 'Legacy v1.0 Card',
          description: 'Classic single-variant UTP v1.0.0 celebration template',
          templateVersion: '1.0.0',
          category: 'birthday',
          tier: 'free',
          price: 0,
          entry: 'index.html'
        },
        files: { entry: 'index.html', styles: ['css/style.css'], scripts: ['js/template.js'] },
        capabilities: ['photos', 'sections'],
        sections: [
          { id: 'hero', label: 'Hero Banner', required: true, toggleable: false, defaultEnabled: true },
          { id: 'message', label: 'Message Section', required: false, toggleable: true, defaultEnabled: true }
        ],
        fields: [
          { id: 'recipient_name', type: 'text', label: 'Recipient Name', required: true, defaultValue: 'Aarav', binding: { target: 'text', selector: "[data-wm-field='recipient_name']" } },
          { id: 'custom_message', type: 'textarea', label: 'Custom Message', required: false, defaultValue: 'Happy Birthday!', binding: { target: 'text', selector: "[data-wm-field='custom_message']" } }
        ]
      };
      const report = validateUtpManifest(legacyV10, {
        htmlContent: UTP_V12_HTML,
        packageFiles: ['wishmagic.json', 'index.html', 'css/style.css', 'js/template.js']
      });
      assert.equal(report.valid, true);
      assert.equal(report.variants.hasVariants, false);
      assert.equal(report.normalizedManifest.sections.length, 2);
      assert.deepEqual(report.normalizedManifest.actions, []);
    });

    it('supports existing UTP v1.1.0 single-variant and multi-variant packages without modification', () => {
      const singleV11 = structuredClone(UTP_V12_MANIFEST);
      singleV11.schemaVersion = '1.1.0';
      delete singleV11.variants;
      delete singleV11.actions;
      singleV11.sections = singleV11.sections.map(s => ({
        id: s.id,
        label: s.label,
        required: s.required,
        toggleable: s.toggleable,
        defaultEnabled: s.defaultEnabled,
        order: s.order
      }));
      singleV11.fields = singleV11.fields.map(f => {
        const copy = { ...f };
        delete copy.subsection;
        delete copy.subsectionId;
        return copy;
      });

      const singleReport = validateUtpManifest(singleV11, {
        htmlContent: UTP_V12_HTML,
        packageFiles: ['wishmagic.json', 'index.html', 'css/style.css', 'js/template.js']
      });
      assert.equal(singleReport.valid, true);
      assert.equal(singleReport.variants.hasVariants, false);

      const multiV11 = structuredClone(UTP_V12_MANIFEST);
      multiV11.schemaVersion = '1.1.0';
      delete multiV11.actions;
      multiV11.variants.forEach(v => {
        delete v.actions;
        delete v.visibilityOverrides;
      });
      const multiReport = validateUtpManifest(multiV11, {
        htmlContent: UTP_V12_HTML,
        packageFiles: ['wishmagic.json', 'index.html', 'css/style.css', 'js/template.js']
      });
      assert.equal(multiReport.valid, true);
      assert.equal(multiReport.variants.hasVariants, true);
      assert.equal(multiReport.variants.validCount, 3);
    });

    it('discovers nested sections, subsections (up to depth 3), and actions during UTP v1.2.0 validation', () => {
      assert.ok(['1.2.0', '1.3.0'].includes(UTP_LATEST_SCHEMA_VERSION));
      assert.equal(UTP_MAX_SECTION_NESTING_DEPTH, 3);
      const report = validateUtpManifest(UTP_V12_MANIFEST, {
        htmlContent: UTP_V12_HTML,
        packageFiles: ['wishmagic.json', 'index.html', 'css/style.css', 'js/template.js']
      });
      assert.equal(report.valid, true);
      const flatNodes = flattenSectionsTree(report.normalizedManifest.sections);
      assert.equal(flatNodes.length, 11); // 5 top-level sections + 4 depth-2 subsections + 1 depth-3 subsection
      const depth3Node = flatNodes.find(n => n.id === 'hero_badge_sparkle');
      assert.ok(depth3Node);
      assert.equal(depth3Node.depth, 3);
      assert.equal(depth3Node.parentId, 'hero_badge');
      assert.equal(report.normalizedManifest.actions.length, 5);

      const htmlExtracted = extractHtmlDeclaredSectionsAndActions(UTP_V12_HTML);
      assert.ok(htmlExtracted.sections.includes('hero'));
      assert.ok(htmlExtracted.subsections.includes('hero_badge'));
      assert.ok(htmlExtracted.subsections.includes('hero_badge_sparkle'));
      assert.ok(htmlExtracted.actions.includes('hero_cta'));
      assert.ok(htmlExtracted.modals.includes('surprise_modal'));
    });
  });

  describe('12.2 Section, Subsection & Action Validation Rules (Invalid, Duplicate, Missing IDs & Unsafe URLs)', () => {
    it('rejects duplicate section/subsection IDs, nesting depth > 3, invalid defaultEnabled booleans, and missing HTML bindings', () => {
      const badManifest = structuredClone(UTP_V12_MANIFEST);
      // 1. Duplicate ID between a section and a subsection
      badManifest.sections[1].subsections = [
        { id: 'hero_badge', label: 'Duplicate ID Subsection', defaultEnabled: true, toggleable: true }
      ];
      // 2. Exceed max nesting depth (depth 4)
      badManifest.sections[0].subsections[1].subsections[0].subsections = [
        { id: 'depth_4_illegal', label: 'Too Deep', defaultEnabled: true, toggleable: true }
      ];
      // 3. Invalid non-boolean defaultEnabled
      badManifest.sections[4].defaultEnabled = 'yes_please';
      // 4. Required section with defaultEnabled: false
      badManifest.sections[2].defaultEnabled = false;
      // 5. Declared subsection missing from HTML
      badManifest.sections[3].subsections.push({
        id: 'ghost_subsection_not_in_html',
        label: 'Ghost Subsection',
        defaultEnabled: true,
        toggleable: true
      });

      const report = validateUtpManifest(badManifest, {
        htmlContent: UTP_V12_HTML,
        packageFiles: ['wishmagic.json', 'index.html', 'css/style.css', 'js/template.js']
      });
      assert.equal(report.valid, false);
      const codes = report.errors.map(e => e.code);
      assert.ok(codes.includes('DUPLICATE_SECTION_ID') || codes.includes('DUPLICATE_SUBSECTION_ID'));
      assert.ok(codes.includes('MAX_SECTION_NESTING_DEPTH_EXCEEDED') || codes.includes('MAX_SECTION_NESTING_EXCEEDED'));
      assert.ok(codes.includes('INVALID_SECTION_DEFAULT_VALUE') || codes.includes('INVALID_SECTION_DEFAULT_ENABLED'));
      assert.ok(codes.includes('REQUIRED_SECTION_CANNOT_BE_DISABLED') || codes.includes('REQUIRED_SECTION_DISABLED_BY_DEFAULT'));
      assert.ok(codes.includes('MISSING_HTML_SUBSECTION_BINDING'));
    });

    it('validates internal and external action destinations and strictly rejects unsafe URLs', () => {
      // Valid internal routes
      assert.equal(isValidInternalWishMagicRoute('/customize.html'), true);
      assert.equal(isValidInternalWishMagicRoute('/template-preview.html?template=bro-code&rel=brother'), true);
      assert.equal(isValidInternalWishMagicRoute('/templates.html#featured'), true);
      assert.equal(isValidInternalWishMagicRoute('/non-existent-admin-backdoor.php'), false);

      // Valid external HTTPS URL
      const safeExt = validateActionDestinationUrl('https://wishmagic.example.com/gifts', 'external_url');
      assert.equal(safeExt.valid, true);

      // Unsafe URL schemes rejected
      for (const unsafeUrl of [
        'javascript:alert(document.cookie)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
        'vbscript:msgbox(1)',
        '//evil.example.com/phish',
        'http://insecure.example.com/page'
      ]) {
        const check = validateActionDestinationUrl(unsafeUrl, 'external_url');
        assert.equal(check.valid, false, `Expected ${unsafeUrl} to be rejected`);
      }

      // Manifest validation rejects unsafe action URLs, missing target sections, and missing target modals
      const badActionsManifest = structuredClone(UTP_V12_MANIFEST);
      badActionsManifest.actions[0].type = 'external_url';
      badActionsManifest.actions[0].target = 'javascript:alert(1)';
      badActionsManifest.actions[1].type = 'section';
      badActionsManifest.actions[1].target = 'nonexistent_section_xyz';
      badActionsManifest.actions[2].type = 'modal';
      badActionsManifest.actions[2].target = 'nonexistent_modal_xyz';

      const report = validateUtpManifest(badActionsManifest, {
        htmlContent: UTP_V12_HTML,
        packageFiles: ['wishmagic.json', 'index.html', 'css/style.css', 'js/template.js']
      });
      assert.equal(report.valid, false);
      const codes = report.errors.map(e => e.code);
      assert.ok(codes.includes('UNSAFE_EXTERNAL_ACTION_URL') || codes.includes('UNSAFE_URL_SCHEME'));
      assert.ok(codes.includes('ACTION_TARGET_SECTION_NOT_FOUND'));
      assert.ok(codes.includes('ACTION_TARGET_MODAL_NOT_FOUND'));
    });

    it('rejects invalid admin configuration mutations (unknown IDs, disabling required sections, editing non-editable labels)', () => {
      const check = validateAdminTemplateConfiguration({
        manifestSections: UTP_V12_MANIFEST.sections,
        manifestActions: UTP_V12_MANIFEST.actions,
        visibilityConfig: {
          hero: false, // Required / non-toggleable!
          unknown_section_id: false
        },
        actionsConfig: {
          back_to_templates_btn: {
            label: 'Hacked Label', // editableLabel: false!
            enabled: false // required: true!
          }
        },
        variantOverrides: {
          brother: {
            actions: {
              back_to_templates_btn: {
                target: '/pricing.html' // relationshipSpecific: false & configurable: false!
              }
            }
          }
        }
      });

      assert.equal(check.valid, false);
      const codes = check.errors.map(e => e.code);
      assert.ok(codes.includes('REQUIRED_SECTION_CANNOT_BE_DISABLED') || codes.includes('NON_TOGGLEABLE_SECTION_CANNOT_BE_DISABLED'));
      assert.ok(codes.includes('UNKNOWN_SECTION_ID'));
      assert.ok(codes.includes('ACTION_LABEL_NOT_EDITABLE'));
      assert.ok(codes.includes('REQUIRED_ACTION_CANNOT_BE_DISABLED'));
      assert.ok(codes.includes('ACTION_NOT_RELATIONSHIP_SPECIFIC'));
    });
  });

  describe('12.3 Global vs Relationship-Specific Visibility & Parent-Child Precedence', () => {
    it('applies Global Section Disable across all relationships unless explicitly overridden for a relationship', () => {
      // Disable 'countdown' and 'secret_message' globally; override 'secret_message: true' only for best_friend
      const templateWideVisibility = {
        countdown: false,
        secret_message: false
      };

      const brotherVariant = UTP_V12_MANIFEST.variants[1]; // Brother has no secret_message override
      const brotherEffective = resolveEffectiveTemplateConfiguration({
        manifest: UTP_V12_MANIFEST,
        templateRecord: { visibility_config_json: templateWideVisibility },
        variantRecord: brotherVariant
      });

      assert.equal(brotherEffective.visibilityMap.countdown, false);
      assert.equal(brotherEffective.visibilityMap.secret_message, false);
      assert.ok(brotherEffective.disabledSectionIds.includes('countdown'));
      assert.ok(brotherEffective.disabledSectionIds.includes('secret_message'));

      const bestFriendVariant = UTP_V12_MANIFEST.variants[0]; // Best Friend has visibilityOverrides.secret_message = true
      const bestFriendEffective = resolveEffectiveTemplateConfiguration({
        manifest: UTP_V12_MANIFEST,
        templateRecord: { visibility_config_json: templateWideVisibility },
        variantRecord: bestFriendVariant
      });

      assert.equal(bestFriendEffective.visibilityMap.countdown, false);
      assert.equal(bestFriendEffective.visibilityMap.secret_message, true);
    });

    it('applies Relationship-Specific Section & Subsection Disable without affecting other relationships', () => {
      // Brother disables subsection 'gallery_secondary', while Best Friend keeps it enabled
      const brotherEffective = resolveEffectiveTemplateConfiguration({
        manifest: UTP_V12_MANIFEST,
        variantRecord: UTP_V12_MANIFEST.variants[1]
      });
      const bestFriendEffective = resolveEffectiveTemplateConfiguration({
        manifest: UTP_V12_MANIFEST,
        variantRecord: UTP_V12_MANIFEST.variants[0]
      });

      assert.equal(brotherEffective.visibilityMap.gallery, true);
      assert.equal(brotherEffective.visibilityMap.gallery_featured, true);
      assert.equal(brotherEffective.visibilityMap.gallery_secondary, false);
      assert.ok(brotherEffective.disabledSubsectionIds.includes('gallery_secondary'));
      assert.ok(!brotherEffective.enabledFieldIds.includes('photo_2'));
      assert.ok(brotherEffective.enabledFieldIds.includes('photo_1'));

      assert.equal(bestFriendEffective.visibilityMap.gallery_secondary, true);
      assert.ok(bestFriendEffective.enabledFieldIds.includes('photo_2'));
    });

    it('enforces strict Parent -> Child visibility precedence and protects required sections', () => {
      // Disable parent section 'gallery' globally, while variant attempts to set child 'gallery_featured: true'
      // Also attempt to disable required 'hero' section in variant override
      const effective = resolveEffectiveTemplateConfiguration({
        manifest: UTP_V12_MANIFEST,
        templateRecord: {
          visibility_config_json: {
            gallery: false,
            hero_badge: false
          }
        },
        variantRecord: {
          ...UTP_V12_MANIFEST.variants[1],
          visibilityOverrides: {
            hero: false, // Must be ignored because hero is required: true / toggleable: false
            gallery_featured: true, // Must remain false because parent 'gallery' is disabled
            hero_badge_sparkle: true // Must remain false because parent 'hero_badge' is disabled
          }
        }
      });

      // 1. Required section 'hero' stays enabled
      assert.equal(effective.visibilityMap.hero, true);
      // 2. Parent 'gallery' is disabled -> both 'gallery_featured' and 'gallery_secondary' are forced disabled
      assert.equal(effective.visibilityMap.gallery, false);
      assert.equal(effective.visibilityMap.gallery_featured, false);
      assert.equal(effective.visibilityMap.gallery_secondary, false);
      // 3. Parent subsection 'hero_badge' is disabled -> depth-3 child 'hero_badge_sparkle' is forced disabled
      assert.equal(effective.visibilityMap.hero_badge, false);
      assert.equal(effective.visibilityMap.hero_badge_sparkle, false);
      // 4. Fields belonging to disabled parent/child ('photo_1', 'photo_2', 'bond_badge') are excluded
      assert.ok(!effective.enabledFieldIds.includes('photo_1'));
      assert.ok(!effective.enabledFieldIds.includes('photo_2'));
      assert.ok(!effective.enabledFieldIds.includes('bond_badge'));
      // 5. Action 'explore_memories_btn' targeting disabled 'gallery' is marked targetAvailable: false and effectiveEnabled: false
      assert.equal(effective.actionsMap.explore_memories_btn.targetAvailable, false);
      assert.equal(effective.actionsMap.explore_memories_btn.effectiveEnabled, false);
    });
  });

  describe('12.4 Complete DOM Removal, Empty-Parent Collapse, Action Execution & Context Preservation', () => {
    it('physically removes disabled sections/subsections from the DOM (not just display:none), pauses media, removes nav links, and collapses empty parents', () => {
      const harness = createInteractiveDomHarness();
      const { WishMagicTemplate, document, elements } = harness;

      // Disable 'secret_message' section and BOTH subsections of 'gallery' ('gallery_featured' and 'gallery_secondary')
      const effective = resolveEffectiveTemplateConfiguration({
        manifest: UTP_V12_MANIFEST,
        templateRecord: {
          visibility_config_json: {
            secret_message: false,
            gallery_featured: false,
            gallery_secondary: false,
            hero_badge_sparkle: false
          }
        },
        variantRecord: UTP_V12_MANIFEST.variants[1]
      });

      WishMagicTemplate.applyData({
        recipient_name: 'Rohan',
        sections: effective.sections,
        visibilityMap: effective.visibilityMap,
        actionsMap: effective.actionsMap,
        templateSlug: 'bro-code-v12',
        variantId: 'var_brother',
        relationship: 'brother'
      });

      // 1. 'secret_message' is physically removed from DOM (.remove() called) and its audio is paused & src cleared
      assert.equal(elements.secretSection.isActive(), false);
      assert.equal(document.getElementById('secret_message'), null);
      assert.equal(elements.secretAudio.paused, true);
      assert.equal(elements.secretAudio.src, '');

      // 2. Nav link to '#secret_message' is physically removed from DOM
      const remainingNavLinks = elements.nav.querySelectorAll('a');
      assert.equal(remainingNavLinks.some(a => a.getAttribute('href') === '#secret_message'), false);

      // 3. Depth-3 subsection 'hero_badge_sparkle' is physically removed while parent 'hero_badge' remains intact
      assert.equal(elements.heroBadgeSparkle.isActive(), false);
      assert.equal(elements.heroBadge.isActive(), true);

      // 4. Both subsections of 'gallery' were removed, and gallery has emptyParentPolicy="collapse", so 'gallery' itself collapsed and was removed!
      assert.equal(elements.galleryFeatured.isActive(), false);
      assert.equal(elements.gallerySecondary.isActive(), false);
      assert.equal(elements.gallery.isActive(), false);
      assert.equal(document.getElementById('gallery'), null);

      // 5. 'explore_memories_btn' targets '#gallery' which is now removed -> fallbackBehavior='hide' removes the button from DOM!
      assert.equal(elements.exploreBtn.isActive(), false);
    });

    it('applies button label edits with HTML escaping, preserves relationship context on internal/customizer links, and handles modal/disabled-target fallbacks', () => {
      const harness = createInteractiveDomHarness();
      const { WishMagicTemplate, window: win, elements } = harness;

      // Test XSS label escaping and relationship context preservation
      const effective = resolveEffectiveTemplateConfiguration({
        manifest: UTP_V12_MANIFEST,
        templateRecord: {
          actions_config_json: {
            gift_store_btn: {
              label: 'Safe & Sound <script>alert(1)</script>',
              type: 'external_url',
              target: 'https://wishmagic.example.com/gifts?utm=brother'
            }
          }
        },
        variantRecord: UTP_V12_MANIFEST.variants[1] // Brother: hero_cta label = "Create for Your Brother"
      });

      assert.equal(
        escapeHtmlText('Safe & Sound <script>alert(1)</script>'),
        'Safe &amp; Sound &lt;script&gt;alert(1)&lt;/script&gt;'
      );

      WishMagicTemplate.applyData({
        sections: effective.sections,
        visibilityMap: effective.visibilityMap,
        actionsMap: effective.actionsMap,
        templateSlug: 'bro-code-v12',
        variantId: 'var_brother',
        relationship: 'brother'
      });

      // 1. Relationship-specific button label applied via textContent
      assert.equal(elements.ctaBtn.textContent, 'Create for Your Brother');

      // 2. Customizer link preserves template, variant, and rel query parameters
      const href = elements.ctaBtn.getAttribute('href');
      assert.ok(href.includes('template=bro-code-v12'));
      assert.ok(href.includes('variant=brother') || href.includes('variant=var_brother'));
      assert.ok(href.includes('rel=brother'));

      // 3. External URL has target="_blank" and rel="noopener noreferrer"
      assert.equal(elements.giftBtn.getAttribute('target'), '_blank');
      assert.equal(elements.giftBtn.getAttribute('rel'), 'noopener noreferrer');

      // 4. Clicking modal action opens #surprise_modal
      elements.surpriseBtn.listeners.click({ preventDefault() {} });
      assert.equal(elements.surpriseModal.getAttribute('data-wm-modal-open'), 'true');
      assert.equal(elements.surpriseModal.getAttribute('aria-hidden'), 'false');

      // 5. If a modal target is missing and fallbackBehavior is 'disable', button is disabled instead of throwing
      elements.surpriseModal.remove();
      const disableFallbackActions = {
        ...effective.actionsMap,
        watch_surprise_btn: {
          ...effective.actionsMap.watch_surprise_btn,
          fallbackBehavior: 'disable'
        }
      };
      WishMagicTemplate.applyActionsToDom(disableFallbackActions, effective.visibilityMap, {
        templateSlug: 'bro-code-v12',
        variantId: 'var_brother',
        relationship: 'brother'
      });
      assert.equal(elements.surpriseBtn.disabled, true);
      assert.equal(elements.surpriseBtn.getAttribute('aria-disabled'), 'true');
    });
  });

  describe('12.5 End-to-End Upload, Admin Config API, Auth, Optimistic Concurrency & Immutable Wish Snapshots', () => {
    it('executes full lifecycle: Upload ZIP -> Admin Auth Check -> Save Draft -> Reload Config -> Concurrency Check -> Publish -> Customer Sanitization -> Wish Snapshot Immutability', async () => {
      const rawSqlite = new DatabaseSync(':memory:');
      const mockDb = {
        prepare(sql) {
          return {
            bind(...params) {
              return {
                async run() {
                  const stmt = rawSqlite.prepare(sql);
                  const info = stmt.run(...params);
                  return { success: true, meta: { changes: info.changes } };
                },
                async first() {
                  const stmt = rawSqlite.prepare(sql);
                  return stmt.get(...params) || null;
                },
                async all() {
                  const stmt = rawSqlite.prepare(sql);
                  const results = stmt.all(...params);
                  return { success: true, results };
                }
              };
            },
            async run() {
              const stmt = rawSqlite.prepare(sql);
              const info = stmt.run();
              return { success: true, meta: { changes: info.changes } };
            },
            async first() {
              const stmt = rawSqlite.prepare(sql);
              return stmt.get() || null;
            },
            async all() {
              const stmt = rawSqlite.prepare(sql);
              const results = stmt.all();
              return { success: true, results };
            }
          };
        },
        async batch(statements) {
          const out = [];
          for (const st of statements) {
            if (st && typeof st.run === 'function') {
              out.push(await st.run());
            }
          }
          return out;
        }
      };
      const runner = new D1MigrationRunner(mockDb);
      await runner.runMigrations();
      const zipBytes = await buildZipBufferFromManifest(UTP_V12_MANIFEST, UTP_V12_HTML);

      // 1. Upload UTP v1.2.0 package with initial upload-time visibility & action overrides
      const fakeB2Provider = {
        bucketName: 'wishmagic-templates',
        putObject: async () => ({ fileId: 'b2_file_mock_v12' }),
        deleteObject: async () => ({ deleted: true })
      };
      const fakeImgbbProvider = {
        uploadImage: async (_bytes, name) => ({
          id: 'imgbb_' + name,
          displayUrl: 'https://i.ibb.co/mock/' + name,
          url: 'https://i.ibb.co/mock/' + name,
          deleteUrl: 'https://ibb.co/delete/mock'
        }),
        deleteImage: async () => true
      };
      const ingestResult = await executeB2TemplateIngestPipeline({
        zipBuffer: zipBytes,
        db: mockDb,
        storageProvider: fakeB2Provider,
        imgbbProvider: fakeImgbbProvider,
        templateMetadata: { id: 'bro-code-v12', name: 'BRO CODE v1.2', category: 'birthday' },
        actorId: 'usr_admin_1',
        shouldPublish: true,
        adminConfigOverrides: {
          visibilityConfig: {
            countdown: true,
            secret_message: false // Disable secret_message globally at upload time
          },
          actionsConfig: {
            explore_memories_btn: {
              label: 'View Brotherhood Memories'
            }
          },
          variantOverrides: {
            best_friend: {
              visibilityOverrides: {
                secret_message: true // Keep secret_message enabled for Best Friend
              }
            }
          }
        },
        env: { DB: mockDb }
      });

      assert.equal(ingestResult.success, true);
      const templateId = ingestResult.templateId;
      const initialVersionId = ingestResult.versionId;

      const env = {
        DB: mockDb,
        ENVIRONMENT: 'development'
      };
      const nowIso = new Date().toISOString();
      await mockDb.prepare("INSERT INTO users (id, email, display_name, role, plan, is_premium, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind('usr_admin_master', 'admin@wishmagic.live', 'Master Admin', 'admin', 'VIP', 1, 'active', nowIso, nowIso).run();
      await mockDb.prepare("INSERT INTO sessions (id, token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind('sess_1', 'sess_admin_test_token', 'usr_admin_master', Date.now() + 86400000, nowIso).run();
      const adminHeaders = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sess_admin_test_token'
      };

      // 2. Unauthorized / non-admin requests to Admin Config API must be rejected (401/403)
      const unauthRes = await worker.fetch(
        new Request(`https://wishmagic.example.com/api/templates/${templateId}/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visibilityConfig: { countdown: false } })
        }),
        env
      );
      assert.ok([401, 403].includes(unauthRes.status));

      // 3. Load saved configuration via GET /api/templates/:id/config (simulating Edit Template reload)
      const getConfigRes = await worker.fetch(
        new Request(`https://wishmagic.example.com/api/templates/${templateId}/config`, {
          method: 'GET',
          headers: adminHeaders
        }),
        env
      );
      assert.equal(getConfigRes.status, 200);
      const configPayload = await getConfigRes.json();
      assert.equal(configPayload.success, true);
      assert.equal(configPayload.publishedConfig.visibilityConfig.secret_message, false);
      assert.equal(configPayload.publishedConfig.actionsConfig.explore_memories_btn.label, 'View Brotherhood Memories');
      const initialLockVersion = configPayload.lockVersion;

      // 4. Create Wish #1 for 'brother' under Published Version 1
      // Attempt client-side injection of disabled field 'secret_note', disabled section toggle 'secret_message: true', and fake visibilityMap
      const createWish1Res = await worker.fetch(
        new Request('https://wishmagic.example.com/api/wishes', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({
            templateId: 'bro-code-v12',
            variantId: 'var_brother',
            relationship: 'brother',
            recipientName: 'Vikram',
            senderName: 'Kabir',
            customMessage: 'Brotherhood forever!',
            status: 'published',
            customData: {
              recipient_name: 'Vikram',
              custom_message: 'Brotherhood forever!',
              secret_note: 'CLIENT ATTEMPT TO BYPASS DISABLED SECTION',
              photo_2: 'https://i.ibb.co/bypass/photo2.jpg', // gallery_secondary is disabled for brother!
              sectionToggles: {
                secret_message: true,
                gallery_secondary: true
              },
              visibilityMap: { secret_message: true },
              actionsMap: { hero_cta: { target: 'javascript:alert(1)' } }
            }
          })
        }),
        env
      );
      assert.ok([200, 201].includes(createWish1Res.status));
      const wish1Data = await createWish1Res.json();
      assert.equal(wish1Data.success, true);
      const wish1Slug = wish1Data.slug;

      // Verify Wish #1 sanitized out disabled fields ('secret_note', 'photo_2') and stored an immutable snapshot
      const wish1PublicRes = await worker.fetch(
        new Request(`https://wishmagic.example.com/api/public/wishes/${wish1Slug}`, { method: 'GET' }),
        env
      );
      assert.equal(wish1PublicRes.status, 200);
      const wish1Public = await wish1PublicRes.json();
      assert.equal(wish1Public.wish.customData.secret_note, undefined);
      assert.equal(wish1Public.wish.customData.photo_2, undefined);
      assert.equal(wish1Public.wish.effectiveConfig.visibilityMap.secret_message, false);
      assert.equal(wish1Public.wish.effectiveConfig.visibilityMap.countdown, true);

      // 5. Save a Draft in Edit Template (`POST /api/templates/:id/config`) disabling 'countdown' globally
      const saveDraftRes = await worker.fetch(
        new Request(`https://wishmagic.example.com/api/templates/${templateId}/config`, {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({
            lockVersion: initialLockVersion,
            visibilityConfig: {
              countdown: false,
              secret_message: false
            },
            actionsConfig: {
              explore_memories_btn: { label: 'Explore Updated Memories' }
            },
            variantOverrides: {
              brother: {
                visibilityOverrides: { gallery_secondary: false },
                actions: {
                  hero_cta: { label: 'Customize Brother Tribute', type: 'customizer', target: '/customize.html' }
                }
              }
            }
          })
        }),
        env
      );
      assert.equal(saveDraftRes.status, 200);
      const savedDraft = await saveDraftRes.json();
      assert.equal(savedDraft.hasUnpublishedDraft, true);
      const secondLockVersion = savedDraft.lockVersion;
      assert.ok(secondLockVersion > initialLockVersion);

      // 6. Verify Optimistic Concurrency: submitting stale lockVersion returns 409 CONCURRENCY_CONFLICT
      const staleRes = await worker.fetch(
        new Request(`https://wishmagic.example.com/api/templates/${templateId}/config`, {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({
            lockVersion: initialLockVersion, // Stale!
            visibilityConfig: { countdown: true }
          })
        }),
        env
      );
      assert.equal(staleRes.status, 409);
      const staleBody = await staleRes.json();
      assert.equal(staleBody.code, 'CONCURRENCY_CONFLICT');

      // 7. Verify Failed Publication Recovery: attempting to publish invalid config returns 400 and does NOT corrupt published config
      const failedPubRes = await worker.fetch(
        new Request(`https://wishmagic.example.com/api/templates/${templateId}/config/publish`, {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({
            lockVersion: secondLockVersion,
            visibilityConfig: {
              hero: false // Invalid: hero is required and non-toggleable!
            }
          })
        }),
        env
      );
      assert.equal(failedPubRes.status, 400);
      const afterFailedPubRes = await worker.fetch(
        new Request(`https://wishmagic.example.com/api/templates/${templateId}/config`, {
          method: 'GET',
          headers: adminHeaders
        }),
        env
      );
      const afterFailedPub = await afterFailedPubRes.json();
      // Previous published config still has countdown: true
      assert.equal(afterFailedPub.publishedConfig.visibilityConfig.countdown, true);
      // Draft is preserved
      assert.equal(afterFailedPub.draftConfig.visibilityConfig.countdown, false);

      // 8. Now Publish the valid draft (`POST /api/templates/:id/config/publish`)
      const validPubRes = await worker.fetch(
        new Request(`https://wishmagic.example.com/api/templates/${templateId}/config/publish`, {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({
            lockVersion: afterFailedPub.lockVersion,
            visibilityConfig: afterFailedPub.draftConfig.visibilityConfig,
            actionsConfig: afterFailedPub.draftConfig.actionsConfig,
            variantOverrides: afterFailedPub.draftConfig.variantOverrides
          })
        }),
        env
      );
      assert.equal(validPubRes.status, 200);
      const validPubData = await validPubRes.json();
      assert.equal(validPubData.success, true);
      // Because Wish #1 was already published on initialVersionId, publishing creates a new immutable version!
      assert.notEqual(validPubData.publishedVersionId, initialVersionId);

      // 9. Verify Existing Wish #1 STILL retains its original published version & configuration (countdown: true)
      const wish1AfterPubRes = await worker.fetch(
        new Request(`https://wishmagic.example.com/api/public/wishes/${wish1Slug}`, { method: 'GET' }),
        env
      );
      const wish1AfterPub = await wish1AfterPubRes.json();
      assert.equal(wish1AfterPub.wish.templateVersionId, initialVersionId);
      assert.equal(wish1AfterPub.wish.effectiveConfig.visibilityMap.countdown, true);

      // 10. Verify New Wish #2 receives the latest published configuration (countdown: false, event_date stripped)
      const createWish2Res = await worker.fetch(
        new Request('https://wishmagic.example.com/api/wishes', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({
            templateId: 'bro-code-v12',
            variantId: 'var_brother',
            relationship: 'brother',
            recipientName: 'Arjun',
            senderName: 'Kabir',
            status: 'published',
            customData: {
              recipient_name: 'Arjun',
              event_date: '2026-12-31' // countdown is now disabled in latest published version!
            }
          })
        }),
        env
      );
      const wish2Data = await createWish2Res.json();
      assert.equal(wish2Data.success, true);

      const wish2PublicRes = await worker.fetch(
        new Request(`https://wishmagic.example.com/api/public/wishes/${wish2Data.slug}`, { method: 'GET' }),
        env
      );
      const wish2Public = await wish2PublicRes.json();
      assert.equal(wish2Public.wish.templateVersionId, validPubData.publishedVersionId);
      assert.equal(wish2Public.wish.effectiveConfig.visibilityMap.countdown, false);
      assert.equal(wish2Public.wish.customData.event_date, undefined);
      assert.equal(
        wish2Public.wish.effectiveConfig.actionsMap.hero_cta.label,
        'Customize Brother Tribute'
      );

      // 11. Test Reset to Manifest Defaults (`POST /api/templates/:id/config/reset`)
      const resetRes = await worker.fetch(
        new Request(`https://wishmagic.example.com/api/templates/${templateId}/config/reset`, {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({ scope: 'all', publishReset: true })
        }),
        env
      );
      assert.equal(resetRes.status, 200);
      const resetData = await resetRes.json();
      assert.equal(resetData.success, true);
      assert.deepEqual(resetData.publishedConfig.visibilityConfig, {});
    });
  });

  describe('12.6 Frontend Customizer, Preview, Wish Renderer & Admin Studio Wiring Verification', () => {
    it('verifies public/template-preview.html, public/js/customize-engine.js, public/js/wish-renderer.js, and public/js/admin-template-uploader.js share the same effective configuration contract', () => {
      const previewHtml = fs.readFileSync(path.resolve('public/template-preview.html'), 'utf8');
      const customizeJs = fs.readFileSync(path.resolve('public/js/customize-engine.js'), 'utf8');
      const rendererJs = fs.readFileSync(path.resolve('public/js/wish-renderer.js'), 'utf8');
      const adminHtml = fs.readFileSync(path.resolve('public/admin-templates.html'), 'utf8');
      const adminUploaderJs = fs.readFileSync(path.resolve('public/js/admin-template-uploader.js'), 'utf8');

      // 1. Preview passes visibilityMap, actionsMap, templateSlug, variantId, relationship in WISHMAGIC_INIT
      assert.ok(previewHtml.includes('visibilityMap'));
      assert.ok(previewHtml.includes('disabledIds'));
      assert.ok(previewHtml.includes('actions'));

      // 2. Customizer filters out disabled sections, subsections, and disabledFieldIds
      assert.ok(customizeJs.includes('disabledIds'));
      assert.ok(customizeJs.includes('excludedFieldIds'));
      assert.ok(customizeJs.includes('visibilityMap'));

      // 3. Final Wish Renderer injects effectiveConfig.visibilityMap and actionsMap into runtime payload
      assert.ok(rendererJs.includes('visibilityMap'));
      assert.ok(rendererJs.includes('disabledIds'));

      // 4. Admin Upload & Edit Template UI exposes the UTP v1.2.0 Visibility & Action Configuration Studio
      assert.ok(adminHtml.includes('upload-utp-v12-config-panel'));
      assert.ok(adminHtml.includes('edit-utp-v12-config-panel'));
      assert.ok(adminUploaderJs.includes('loadEditTemplateUtpV12Config'));
      assert.ok(adminUploaderJs.includes('resetEditTemplateUtpConfig'));
      assert.ok(adminUploaderJs.includes('renderUploadUtpV12ConfigPanel'));
      assert.ok(adminUploaderJs.includes('renderEditUtpV12ConfigPanel'));
      assert.ok(adminUploaderJs.includes('visibilityConfig'));
      assert.ok(adminUploaderJs.includes('actionsConfig'));
    });
  });
});
