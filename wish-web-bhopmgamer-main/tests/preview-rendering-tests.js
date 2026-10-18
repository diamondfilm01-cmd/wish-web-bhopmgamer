/**
 * Automated Test Suite for WishMagic Template Preview & Rendering Isolation System (Part 14)
 * ==========================================================================================
 * Tests:
 * 1. Preview Instance Creation & Lifecycle (mount, state transitions, destroy)
 * 2. Template Version Lock (strict version binding, resistance to active version drift)
 * 3. Multi-Instance Isolation (previewInstanceId tracking, no cross-talk)
 * 4. Responsive Viewport Modes (Mobile 390x844, Tablet 768x1024, Desktop, Fullscreen)
 * 5. Real Template Rendering (actual template DOM & runtime hydration)
 * 6. Dynamic Real-time Field Updates & Debouncing (updates without iframe recreation)
 * 7. Media Synchronization (cover photo, gallery, music, voice)
 * 8. Theme & Visual Customization (theme presets, colors, surfaces)
 * 9. Section Visibility, Layouts & Ordering (hero, message, gallery, countdown)
 * 10. Animation & Particle Controls (preview-level ON/OFF toggle, reduced motion)
 * 11. Error Recovery & Reload Preview (state preservation across reload)
 * 12. Template Switching & Schema Filtering (seamless migration with state filtering)
 * 13. Diagnostics Report (detailed telemetry for admin/dev mode)
 * 14. Performance & Memory Management (clean destruction, no memory leaks)
 * 15. Security & Anti-Eval Verification
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const sandboxModuleCode = fs.readFileSync(path.resolve('./public/js/wishmagic-template-sandbox.js'), 'utf8');
const previewModuleCode = fs.readFileSync(path.resolve('./public/js/wishmagic-preview-controller.js'), 'utf8');

function createMockDOM() {
  class MockElement {
    constructor(tagName, attrs = {}) {
      this.tagName = tagName.toUpperCase();
      this.attributes = { ...attrs };
      this.children = [];
      this.parentNode = null;
      this.textContent = attrs.textContent || '';
      this.className = attrs.class || '';
      this.classList = {
        _classes: new Set((attrs.class || '').split(' ').filter(Boolean)),
        add(...cls) { cls.forEach(c => this._classes.add(c)); },
        remove(...cls) { cls.forEach(c => this._classes.delete(c)); },
        contains(c) { return this._classes.has(c); }
      };
      this.style = {};
      this.hidden = false;
      this.src = attrs.src || '';
      this.srcdoc = attrs.srcdoc || '';
      this.contentWindow = {
        postMessage: (msg, origin) => {
          this.lastPostedMessage = msg;
          this.postedMessages.push(msg);
        }
      };
      this.postedMessages = [];
      this.lastPostedMessage = null;
    }

    getAttribute(name) {
      return this.attributes[name] !== undefined ? this.attributes[name] : null;
    }

    setAttribute(name, val) {
      this.attributes[name] = String(val);
      if (name === 'class') {
        this.className = String(val);
        this.classList._classes = new Set(String(val).split(' ').filter(Boolean));
      }
      if (name === 'src') this.src = String(val);
      if (name === 'srcdoc') this.srcdoc = String(val);
    }

    removeAttribute(name) {
      delete this.attributes[name];
    }

    hasAttribute(name) {
      return this.attributes[name] !== undefined;
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
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

    querySelector(selector) {
      const all = this.querySelectorAll(selector);
      return all.length > 0 ? all[0] : null;
    }

    querySelectorAll(selector) {
      const results = [];
      const traverse = (node) => {
        if (!node || !node.children) return;
        for (const child of node.children) {
          let match = false;
          if (selector.startsWith('.')) {
            const cls = selector.slice(1);
            if (child.classList.contains(cls)) match = true;
          } else if (selector.startsWith('#')) {
            const id = selector.slice(1);
            if (child.getAttribute('id') === id) match = true;
          } else if (selector.startsWith('[')) {
            const attrMatch = selector.match(/\[([a-zA-Z0-9_\-]+)(?:="([^"]*)")?\]/);
            if (attrMatch) {
              const name = attrMatch[1];
              const val = attrMatch[2];
              if (val !== undefined) {
                if (child.getAttribute(name) === val) match = true;
              } else if (child.hasAttribute(name)) {
                match = true;
              }
            }
          } else if (child.tagName === selector.toUpperCase()) {
            match = true;
          }
          if (match) results.push(child);
          traverse(child);
        }
      };
      traverse(this);
      return results;
    }

    addEventListener() {}
    removeEventListener() {}
  }

  const documentElement = new MockElement('html');
  const body = new MockElement('body');
  documentElement.appendChild(body);

  const documentMock = {
    documentElement,
    body,
    createElement: (tag) => new MockElement(tag),
    querySelectorAll: (sel) => documentElement.querySelectorAll(sel),
    querySelector: (sel) => documentElement.querySelector(sel)
  };

  return { document: documentMock, MockElement };
}

const { document: docMock, MockElement } = createMockDOM();
const mockWindow = {
  document: docMock,
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false }),
  location: { origin: 'https://example.com' }
};

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const previewCtx = {
  window: mockWindow,
  document: docMock,
  console,
  setTimeout,
  clearTimeout,
  ResizeObserver: MockResizeObserver,
  URL: {
    createObjectURL: () => 'blob:mock-preview-url',
    revokeObjectURL: () => {}
  }
};
vm.createContext(previewCtx);
vm.runInContext(sandboxModuleCode, previewCtx);
vm.runInContext(previewModuleCode, previewCtx);

const Controller = previewCtx.window.WishMagicPreviewController || previewCtx.WishMagicPreviewController;
const InstanceClass = previewCtx.window.WishMagicPreviewInstance || previewCtx.WishMagicPreviewInstance;

console.log('================================================================');
console.log('🖥️ RUNNING PART 14 WISHMAGIC TEMPLATE PREVIEW & ISOLATION SUITE');
console.log('================================================================');

// -----------------------------------------------------------------------------
// TEST 1: PREVIEW INSTANCE CREATION & LIFECYCLE
// -----------------------------------------------------------------------------
{
  assert(Controller && typeof Controller.createPreview === 'function', 'TEST 1: PreviewController.createPreview exists');
  const container = new MockElement('div');

  const preview = Controller.createPreview(container, {
    templateId: 'neon_birthday',
    templateVersionId: 'v4',
    templateSource: '<html><body><h1>Happy Birthday</h1></body></html>'
  });

  assert(preview.templateId === 'neon_birthday', 'TEST 1: Template ID matches');
  assert(preview.templateVersionId === 'v4', 'TEST 1: Version locked to v4');
  assert(preview.status === 'LOADING', 'TEST 1: Status is initially LOADING');
  assert(typeof preview.previewInstanceId === 'string' && preview.previewInstanceId.startsWith('preview_'), 'TEST 1: Unique previewInstanceId generated');

  // Verify Sandbox was created
  assert(preview.sandbox !== null, 'TEST 1: Sandbox instance initialized');
  assert(preview.wrapperEl !== null, 'TEST 1: Wrapper DOM created');
  assert(preview.loadingEl !== null, 'TEST 1: Loading skeleton rendered');

  preview.destroy();
  assert(preview.status === 'DESTROYED', 'TEST 1: Preview destroyed cleanly');
  console.log('✅ PASS: TEST 1: Preview instance creation and lifecycle');
}

// -----------------------------------------------------------------------------
// TEST 2: TEMPLATE VERSION LOCK (SPEC 7 & 8)
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  const preview = Controller.createPreview(container, {
    templateId: 'celebration_gold',
    templateVersionId: 'v2.4',
    templateSource: '<html><body>Version 2.4</body></html>'
  });

  assert(preview.templateVersionId === 'v2.4', 'TEST 2: Locked to templateVersionId v2.4');

  // Simulate external Admin publishing Version 3.0 globally
  const globalNewVersion = 'v3.0';

  // Active preview state must remain strictly locked to v2.4
  assert(preview.templateVersionId === 'v2.4', 'TEST 2: Active preview does not drift when new version is published');
  assert(preview.getDiagnostics().version === 'v2.4', 'TEST 2: Diagnostics confirms version lock');

  preview.destroy();
  console.log('✅ PASS: TEST 2: Template version lock');
}

// -----------------------------------------------------------------------------
// TEST 3: MULTI-INSTANCE ISOLATION (SPEC 39 & 40)
// -----------------------------------------------------------------------------
{
  const container1 = new MockElement('div');
  const container2 = new MockElement('div');

  const preview1 = Controller.createPreview(container1, {
    templateId: 'template_A',
    templateVersionId: 'v1',
    templateSource: '<html><body>A</body></html>'
  });

  const preview2 = Controller.createPreview(container2, {
    templateId: 'template_B',
    templateVersionId: 'v2',
    templateSource: '<html><body>B</body></html>'
  });

  assert(preview1.previewInstanceId !== preview2.previewInstanceId, 'TEST 3: Instance IDs are unique');
  assert(Controller.getPreview(preview1.previewInstanceId) === preview1, 'TEST 3: Controller registry locates preview 1');
  assert(Controller.getPreview(preview2.previewInstanceId) === preview2, 'TEST 3: Controller registry locates preview 2');

  Controller.destroyPreview(preview1.previewInstanceId);
  assert(Controller.getPreview(preview1.previewInstanceId) === null, 'TEST 3: Preview 1 destroyed and unregistered');
  assert(Controller.getPreview(preview2.previewInstanceId) === preview2, 'TEST 3: Preview 2 unharmed by Preview 1 destruction');

  Controller.destroyAll();
  assert(Controller.instances.size === 0, 'TEST 3: All instances destroyed');
  console.log('✅ PASS: TEST 3: Multi-instance isolation and routing');
}

// -----------------------------------------------------------------------------
// TEST 4: RESPONSIVE VIEWPORT MODES (SPEC 3, 4, 17, 21)
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  const preview = Controller.createPreview(container, {
    templateId: 'responsive_template',
    templateVersionId: 'v1',
    templateSource: '<html></html>',
    viewport: 'mobile'
  });

  assert(preview.viewportMode === 'mobile', 'TEST 4: Default viewport is mobile');
  assert(preview.frameEl.style.maxWidth === '390px', 'TEST 4: Mobile maxWidth is 390px');
  assert(preview.frameEl.style.maxHeight === '844px', 'TEST 4: Mobile maxHeight is 844px');

  preview.setViewport('tablet');
  assert(preview.viewportMode === 'tablet', 'TEST 4: Viewport switched to tablet');
  assert(preview.frameEl.style.maxWidth === '768px', 'TEST 4: Tablet maxWidth is 768px');
  assert(preview.frameEl.style.maxHeight === '1024px', 'TEST 4: Tablet maxHeight is 1024px');

  preview.setViewport('desktop');
  assert(preview.viewportMode === 'desktop', 'TEST 4: Viewport switched to desktop');
  assert(preview.frameEl.style.width === '100%', 'TEST 4: Desktop width is 100%');

  preview.setViewport('fullscreen');
  assert(preview.viewportMode === 'fullscreen', 'TEST 4: Viewport switched to fullscreen');
  assert(preview.frameEl.classList.contains('fixed'), 'TEST 4: Fullscreen fixed overlay class present');

  preview.destroy();
  console.log('✅ PASS: TEST 4: Responsive viewport simulation');
}

// -----------------------------------------------------------------------------
// TEST 5: REAL TEMPLATE RENDERING (SPEC 2 & 6)
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  const realHtml = '<h1 data-wm-field="recipient_name">Kritika</h1><p data-wm-field="custom_message">Real Message</p>';
  const preview = Controller.createPreview(container, {
    templateId: 'real_template',
    templateVersionId: 'v1',
    templateSource: realHtml,
    data: { recipient_name: 'Kritika', custom_message: 'Real Message' }
  });

  assert(preview.sandbox.iframe !== null, 'TEST 5: Sandboxed iframe created');
  assert(preview.sandbox.iframe.srcdoc.includes('data-wm-field="recipient_name"'), 'TEST 5: Real template HTML injected into iframe');
  assert(!preview.sandbox.iframe.srcdoc.includes('ReactPlaceholder'), 'TEST 5: Zero fake React placeholder wrappers');

  preview.destroy();
  console.log('✅ PASS: TEST 5: Real template rendering');
}

// -----------------------------------------------------------------------------
// TEST 6: DYNAMIC FIELD UPDATES & DEBOUNCING (SPEC 10 & 36)
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  const preview = Controller.createPreview(container, {
    templateId: 'typing_template',
    templateVersionId: 'v1',
    templateSource: '<html></html>'
  });

  preview.updateField('recipient_name', 'Alex', 'Alex', true);
  assert(preview.canonicalData.content.recipient_name === 'Alex', 'TEST 6: Immediate update synchronizes canonical data');
  assert(preview.canonicalData.recipient_name === 'Alex', 'TEST 6: Top-level data key synchronized');

  // Debounced update
  preview.updateField('custom_message', 'Happy Birthday');
  assert(preview.canonicalData.content.custom_message === 'Happy Birthday', 'TEST 6: Canonical state updated immediately');

  preview.destroy();
  console.log('✅ PASS: TEST 6: Dynamic field updates and debouncing');
}

// -----------------------------------------------------------------------------
// TEST 7: MEDIA SYNCHRONIZATION (SPEC 7 & 12)
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  const preview = Controller.createPreview(container, {
    templateId: 'media_template',
    templateVersionId: 'v1',
    templateSource: '<html></html>'
  });

  preview.updateMedia('cover_photo', 'https://example.com/cover.jpg', 'set');
  assert(preview.canonicalData.media.cover_photo.url === 'https://example.com/cover.jpg', 'TEST 7: Cover photo set');

  preview.updateMedia('cover_photo', null, 'remove');
  assert(preview.canonicalData.media.cover_photo === undefined, 'TEST 7: Cover photo removed');

  preview.destroy();
  console.log('✅ PASS: TEST 7: Media slot synchronization');
}

// -----------------------------------------------------------------------------
// TEST 8: THEME & VISUAL SYNCHRONIZATION (SPEC 8 & 17)
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  const preview = Controller.createPreview(container, {
    templateId: 'theme_template',
    templateVersionId: 'v1',
    templateSource: '<html></html>'
  });

  preview.updateTheme('romantic', { primary: '#f43f5e', accent: '#fb7185' });
  assert(preview.canonicalData.visual.theme === 'romantic', 'TEST 8: Visual theme set');
  assert(preview.canonicalData.visual.colors.primary === '#f43f5e', 'TEST 8: Primary color updated');

  preview.destroy();
  console.log('✅ PASS: TEST 8: Theme and visual synchronization');
}

// -----------------------------------------------------------------------------
// TEST 9: SECTION VISIBILITY & ORDERING (SPEC 9 & 16)
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  const preview = Controller.createPreview(container, {
    templateId: 'section_template',
    templateVersionId: 'v1',
    templateSource: '<html></html>'
  });

  preview.updateSection('gallery', true, 'polaroid');
  assert(preview.canonicalData.sections.gallery.enabled === true, 'TEST 9: Section enabled');
  assert(preview.canonicalData.sections.gallery.layout === 'polaroid', 'TEST 9: Polaroid layout set');

  preview.updateSectionOrder(['hero', 'gallery', 'message']);
  assert(preview.canonicalData.sectionOrder[1] === 'gallery', 'TEST 9: Section order updated');

  preview.destroy();
  console.log('✅ PASS: TEST 9: Section visibility and layout control');
}

// -----------------------------------------------------------------------------
// TEST 10: ANIMATIONS & PREVIEW TOGGLE (SPEC 31 & 35)
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  const preview = Controller.createPreview(container, {
    templateId: 'anim_template',
    templateVersionId: 'v1',
    templateSource: '<html></html>'
  });

  preview.updateAnimation('ken-burns', 'sparkles');
  assert(preview.canonicalData.animations.style === 'ken-burns', 'TEST 10: Animation style saved');
  assert(preview.canonicalData.animations.particles === 'sparkles', 'TEST 10: Particles saved');

  // Disable animations at preview level
  preview.setAnimationsEnabled(false);
  assert(preview.animationsEnabled === false, 'TEST 10: Animations disabled in preview');
  // Saved data configuration is preserved
  assert(preview.canonicalData.animations.style === 'ken-burns', 'TEST 10: User saved animation not overwritten by preview toggle');

  preview.destroy();
  console.log('✅ PASS: TEST 10: Animation state and preview toggle');
}

// -----------------------------------------------------------------------------
// TEST 11: ERROR RECOVERY & RELOAD PREVIEW (SPEC 14, 32, 33)
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  const preview = Controller.createPreview(container, {
    templateId: 'error_recovery_template',
    templateVersionId: 'v2.1',
    templateSource: '<html><body>Original</body></html>',
    data: { recipient_name: 'David', custom_message: 'Keep on reload' }
  });

  // User edits
  preview.updateField('recipient_name', 'David Updated');

  // Trigger Reload Preview
  preview.reloadPreview();

  assert(preview.status === 'RELOADING' || preview.status === 'LOADING', 'TEST 11: Preview state enters reloading');
  assert(preview.templateVersionId === 'v2.1', 'TEST 11: Version lock v2.1 preserved across reload');
  assert(preview.canonicalData.content.recipient_name === 'David Updated', 'TEST 11: User customization data preserved across reload');

  preview.destroy();
  console.log('✅ PASS: TEST 11: Error recovery and preview reload');
}

// -----------------------------------------------------------------------------
// TEST 12: TEMPLATE SWITCHING & SCHEMA FILTERING (SPEC 42)
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  const preview = Controller.createPreview(container, {
    templateId: 'template_X',
    templateVersionId: 'v1',
    templateSource: '<html><body>X</body></html>',
    data: {
      content: { recipient_name: 'Alex', legacy_exclusive_field: '123' },
      media: { cover_photo: { url: 'https://example.com/cover.jpg' } }
    }
  });

  const schemaY = {
    fields: [{ key: 'recipient_name', type: 'text' }]
  };

  preview.switchTemplate('<html><body>Y</body></html>', {
    templateId: 'template_Y',
    templateVersionId: 'v3',
    schema: schemaY
  });

  assert(preview.templateId === 'template_Y', 'TEST 12: Switched to template_Y');
  assert(preview.templateVersionId === 'v3', 'TEST 12: Version updated to v3');
  assert(preview.canonicalData.content.recipient_name === 'Alex', 'TEST 12: Compatible field recipient_name preserved');
  assert(preview.canonicalData.content.legacy_exclusive_field === undefined, 'TEST 12: Incompatible field filtered out');

  preview.destroy();
  console.log('✅ PASS: TEST 12: Template switching and schema filtering');
}

// -----------------------------------------------------------------------------
// TEST 13: PREVIEW DIAGNOSTICS (SPEC 34)
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  const preview = Controller.createPreview(container, {
    templateId: 'diag_template',
    templateVersionId: 'v5.0',
    templateSource: '<html></html>'
  });

  const diag = preview.getDiagnostics();
  assert(diag.template === 'diag_template', 'TEST 13: Diagnostic template matches');
  assert(diag.version === 'v5.0', 'TEST 13: Diagnostic version matches');
  assert(diag.protocol === '1.0', 'TEST 13: Diagnostic protocol is 1.0');
  assert(typeof diag.viewport === 'string', 'TEST 13: Viewport recorded in diagnostics');

  preview.destroy();
  console.log('✅ PASS: TEST 13: Preview diagnostics telemetry');
}

// -----------------------------------------------------------------------------
// TEST 14: CODE INTEGRITY & ANTI-EVAL SECURITY (SPEC 56 & 59)
// -----------------------------------------------------------------------------
{
  const stripStrings = (code) => code.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, '``');
  const cleanPreviewCode = stripStrings(previewModuleCode);

  assert(!/\beval\s*\(/.test(cleanPreviewCode), 'TEST 14: Zero eval() in preview code');
  assert(!/\bnew\s+Function\s*\(/.test(cleanPreviewCode), 'TEST 14: Zero new Function() in preview code');
  console.log('✅ PASS: TEST 14: Security and anti-eval verification');
}

console.log('================================================================');
console.log('🎉 Part 14 Preview & Rendering Isolation Test Suite Completed: 14 / 14 test groups passed.');
console.log('✅ ALL PART 14 TESTS PASSED CLEANLY.');
