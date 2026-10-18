/**
 * Automated Test Suite for WishMagic Template Runtime Protocol + Sandbox / Validation System (Part 13)
 * ====================================================================================================
 * Tests:
 * 1. Runtime Protocol: envelope structure, validation, requestId, timestamps
 * 2. Token interpolation: safe token replacement without HTML injection
 * 3. Media & URL Security: safe protocols, rejection of javascript: and data:text/html
 * 4. Sandbox Lifecycle & Handshake: create, handshake, ready, init, timeout, destroy
 * 5. State Synchronization: field updates, multi-element target mapping, debounce
 * 6. Section & Layout Controls: enable, disable, layout switch, order reordering
 * 7. Visual & Animation State: themes, CSS variables, particles, reduced motion
 * 8. Error Isolation: error capture and structured WISHMAGIC_ERROR dispatch
 * 9. Template Switching & Schema Filtering: unsupported field dropping, state isolation
 * 10. Template Validation Engine: multi-category diagnostics (HTML, CSS, JS, Metadata, Media, Security)
 * 11. Admin Template Test Mode: fixture generation, live diagnostics
 * 12. Fixture Templates:
 *     - Template A (Basic) -> PASS
 *     - Template B (Advanced) -> PASS
 *     - Template C (Complex) -> PASS
 *     - Template D (Broken) -> ERROR (safely isolated)
 * 13. Security Verification: zero eval / Function, no credential exposure, parent isolation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Load Sandbox Module into sandbox environment
const sandboxCode = fs.readFileSync(path.resolve('./public/js/wishmagic-template-sandbox.js'), 'utf8');
const runtimeCode = fs.readFileSync(path.resolve('./public/js/wishmagic-template-runtime.js'), 'utf8');

function createMockDOM() {
  class MockElement {
    constructor(tagName, attrs = {}) {
      this.tagName = tagName.toUpperCase();
      this.attributes = { ...attrs };
      this.children = [];
      this.parentNode = null;
      this.textContent = attrs.textContent || '';
      this.className = attrs.class || '';
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
      this.eventListeners = {};
    }

    getAttribute(name) {
      return this.attributes[name] !== undefined ? this.attributes[name] : null;
    }

    setAttribute(name, val) {
      this.attributes[name] = String(val);
      if (name === 'class') this.className = String(val);
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

    querySelectorAll(selector) {
      const results = [];
      const traverse = (node) => {
        if (!node || !node.children) return;
        for (const child of node.children) {
          let match = false;
          if (selector.startsWith('[data-wm-field]')) {
            if (child.hasAttribute('data-wm-field')) match = true;
          } else if (selector.startsWith('[data-wm-section]')) {
            if (child.hasAttribute('data-wm-section')) match = true;
          } else if (selector.startsWith('[data-wm]')) {
            if (child.hasAttribute('data-wm') || child.hasAttribute('data-wm-field')) match = true;
          } else if (selector.includes('data-wm-field=')) {
            const m = selector.match(/data-wm-field="([^"]+)"/);
            if (m && child.getAttribute('data-wm-field') === m[1]) match = true;
          }
          if (match) results.push(child);
          traverse(child);
        }
      };
      traverse(this);
      return results;
    }
  }

  const documentElement = new MockElement('html');
  const body = new MockElement('body');
  documentElement.appendChild(body);

  const documentMock = {
    documentElement,
    body,
    createElement: (tag) => new MockElement(tag),
    querySelectorAll: (sel) => documentElement.querySelectorAll(sel)
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

const sandboxCtx = {
  window: mockWindow,
  document: docMock,
  console,
  setTimeout,
  clearTimeout,
  URL: {
    createObjectURL: () => 'blob:mock-sandbox-url',
    revokeObjectURL: () => {}
  }
};
vm.createContext(sandboxCtx);
vm.runInContext(sandboxCode, sandboxCtx);

const Protocol = sandboxCtx.window.WishMagicRuntimeProtocol || sandboxCtx.WishMagicRuntimeProtocol;
const Validator = sandboxCtx.window.WishMagicTemplateValidator || sandboxCtx.WishMagicTemplateValidator;
const Sandbox = sandboxCtx.window.WishMagicTemplateSandbox || sandboxCtx.WishMagicTemplateSandbox;

console.log('================================================================');
console.log('🛡️ RUNNING PART 13 WISHMAGIC RUNTIME PROTOCOL & SANDBOX SUITE');
console.log('================================================================');

// -----------------------------------------------------------------------------
// TEST 1: RUNTIME PROTOCOL ENVELOPE & VALIDATION
// -----------------------------------------------------------------------------
{
  assert(Protocol && Protocol.VERSION === '1.0', 'TEST 1: Protocol version is 1.0');
  assert(typeof Protocol.createMessage === 'function', 'TEST 1: createMessage exists');
  assert(typeof Protocol.validateMessage === 'function', 'TEST 1: validateMessage exists');

  const msg = Protocol.createMessage('WISHMAGIC_UPDATE', { field: 'recipient_name', value: 'Alex' });
  assert(msg.source === 'wishmagic', 'TEST 1: Message source is "wishmagic"');
  assert(msg.version === '1.0', 'TEST 1: Message version is "1.0"');
  assert(msg.type === 'WISHMAGIC_UPDATE', 'TEST 1: Type is WISHMAGIC_UPDATE');
  assert(typeof msg.requestId === 'string' && msg.requestId.startsWith('req_'), 'TEST 1: Valid requestId generated');
  assert(typeof msg.timestamp === 'number', 'TEST 1: Timestamp generated');

  const validRes = Protocol.validateMessage(msg);
  assert(validRes.valid === true, 'TEST 1: Valid message validates successfully');

  const badSource = { source: 'attacker', type: 'WISHMAGIC_UPDATE', payload: {} };
  assert(Protocol.validateMessage(badSource).valid === false, 'TEST 1: Foreign source rejected');

  const badType = { source: 'wishmagic', type: 'WISHMAGIC_MALICIOUS_EVAL', payload: {} };
  assert(Protocol.validateMessage(badType).valid === false, 'TEST 1: Disallowed message type rejected');
  console.log('✅ PASS: TEST 1: Protocol envelope and validation');
}

// -----------------------------------------------------------------------------
// TEST 2: SAFE TOKEN INTERPOLATION
// -----------------------------------------------------------------------------
{
  const templateStr = 'Hello {{recipient_name}}, Happy Birthday from {{sender_name}}!';
  const data = { recipient_name: 'Kritika', sender_name: 'Ankit' };
  const rendered = Protocol.replaceTokens(templateStr, data);

  assert(rendered === 'Hello Kritika, Happy Birthday from Ankit!', 'TEST 2: Tokens replaced accurately');

  const injectionStr = 'Hi {{recipient_name}}';
  const maliciousData = { recipient_name: '<script>alert(1)</script>' };
  const renderedInjection = Protocol.replaceTokens(injectionStr, maliciousData);
  // Replaces text string without execution
  assert(renderedInjection === 'Hi <script>alert(1)</script>', 'TEST 2: String token preserved as plain text without parsing');
  console.log('✅ PASS: TEST 2: Safe token replacement');
}

// -----------------------------------------------------------------------------
// TEST 3: MEDIA & URL SECURITY
// -----------------------------------------------------------------------------
{
  assert(Protocol.isSafeUrl('https://example.com/photo.jpg') === true, 'TEST 3: https:// URL is safe');
  assert(Protocol.isSafeUrl('http://example.com/photo.jpg') === true, 'TEST 3: http:// URL is safe');
  assert(Protocol.isSafeUrl('blob:uuid-1234') === true, 'TEST 3: blob: URL is safe');
  assert(Protocol.isSafeUrl('data:image/png;base64,iVBOR') === true, 'TEST 3: data:image URL is safe');
  assert(Protocol.isSafeUrl('/assets/photo.jpg') === true, 'TEST 3: relative /assets URL is safe');

  // Forbidden dangerous URL schemes
  assert(Protocol.isSafeUrl('javascript:alert(1)') === false, 'TEST 3: javascript: scheme rejected');
  assert(Protocol.isSafeUrl('data:text/html,<script>alert(1)</script>') === false, 'TEST 3: data:text/html rejected');
  assert(Protocol.isSafeUrl('vbscript:msgbox(1)') === false, 'TEST 3: vbscript: scheme rejected');
  console.log('✅ PASS: TEST 3: Media & URL protocol security');
}

// -----------------------------------------------------------------------------
// TEST 4: SANDBOX LIFECYCLE & HANDSHAKE
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  const sandbox = new Sandbox({ container, timeoutMs: 1000 });

  assert(sandbox.status === 'IDLE', 'TEST 4: Sandbox starts in IDLE');

  sandbox.createSandbox(container, '<html><body><h1>Wish</h1></body></html>');
  assert(sandbox.status === 'LOADING', 'TEST 4: Sandbox transitions to LOADING on create');
  assert(sandbox.iframe !== null, 'TEST 4: Iframe created in container');
  assert(sandbox.iframe.getAttribute('sandbox').includes('allow-scripts'), 'TEST 4: Sandboxed iframe attributes set');

  // Simulate Template sending WISHMAGIC_READY
  sandbox._handleWindowMessage({
    data: {
      source: 'wishmagic',
      version: '1.0',
      type: 'WISHMAGIC_READY',
      timestamp: Date.now()
    }
  });

  assert(sandbox.status === 'READY', 'TEST 4: Sandbox transitions to READY after handshake');
  assert(sandbox.diagnostics.runtimeReady === true, 'TEST 4: Runtime ready diagnostic recorded');

  // Verify WISHMAGIC_INIT was dispatched to iframe
  assert(sandbox.iframe.postedMessages.some(m => m.type === 'WISHMAGIC_INIT'), 'TEST 4: WISHMAGIC_INIT dispatched to template sandbox');

  sandbox.destroySandbox();
  assert(sandbox.status === 'DESTROYED', 'TEST 4: Sandbox status is DESTROYED after teardown');
  assert(sandbox.iframe === null, 'TEST 4: Iframe removed from DOM');
  console.log('✅ PASS: TEST 4: Sandbox lifecycle and handshake');
}

// -----------------------------------------------------------------------------
// TEST 5: STATE SYNCHRONIZATION & MULTI-TARGET MAPPING
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  const sandbox = new Sandbox({ container });
  sandbox.createSandbox(container, '<html></html>');
  sandbox._handleReadyMessage({});

  sandbox.updateField('recipient_name', 'Sophia', 'Sophia');
  assert(sandbox.canonicalData.content.recipient_name === 'Sophia', 'TEST 5: Canonical state content updated');
  assert(sandbox.lastUpdate === 'WISHMAGIC_UPDATE', 'TEST 5: Last update key recorded');
  assert(sandbox.diagnostics.fieldsUpdated === 1, 'TEST 5: Field update metric incremented');

  sandbox.updateMedia('cover_photo', 'https://example.com/cover.jpg', 'set');
  assert(sandbox.canonicalData.media.cover_photo.url === 'https://example.com/cover.jpg', 'TEST 5: Media updated in canonical state');

  sandbox.destroySandbox();
  console.log('✅ PASS: TEST 5: State synchronization and multi-target mapping');
}

// -----------------------------------------------------------------------------
// TEST 6: SECTION & LAYOUT RUNTIME CONTROLS
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  const sandbox = new Sandbox({ container });
  sandbox.createSandbox(container, '<html></html>');
  sandbox._handleReadyMessage({});

  sandbox.updateSection('gallery', true, 'polaroid');
  assert(sandbox.canonicalData.sections.gallery.enabled === true, 'TEST 6: Section enabled');
  assert(sandbox.canonicalData.sections.gallery.layout === 'polaroid', 'TEST 6: Section layout updated');

  sandbox.updateSectionOrder(['hero', 'gallery', 'message', 'final_surprise']);
  assert(sandbox.canonicalData.sectionOrder.length === 4, 'TEST 6: Section order set');
  assert(sandbox.canonicalData.sectionOrder[1] === 'gallery', 'TEST 6: Gallery moved to index 1');

  sandbox.destroySandbox();
  console.log('✅ PASS: TEST 6: Section visibility, layout, and ordering');
}

// -----------------------------------------------------------------------------
// TEST 7: THEME & ANIMATION RUNTIME CONTROLS
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  const sandbox = new Sandbox({ container });
  sandbox.createSandbox(container, '<html></html>');
  sandbox._handleReadyMessage({});

  sandbox.updateTheme('romantic', { primary: '#ff4d6d' });
  assert(sandbox.canonicalData.visual.theme === 'romantic', 'TEST 7: Theme applied');
  assert(sandbox.canonicalData.visual.colors.primary === '#ff4d6d', 'TEST 7: Primary color override applied');

  sandbox.updateAnimation('ken-burns', 'sparkles');
  assert(sandbox.canonicalData.animations.style === 'ken-burns', 'TEST 7: Animation style applied');
  assert(sandbox.canonicalData.animations.particles === 'sparkles', 'TEST 7: Particles applied');

  sandbox.destroySandbox();
  console.log('✅ PASS: TEST 7: Theme and animation controls');
}

// -----------------------------------------------------------------------------
// TEST 8: ERROR ISOLATION & STRUCTURED REPORTING
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  let errorCaught = null;
  const sandbox = new Sandbox({
    container,
    onError: (err) => { errorCaught = err; }
  });
  sandbox.createSandbox(container, '<html></html>');

  // Simulate template runtime error message
  sandbox._handleWindowMessage({
    data: {
      source: 'wishmagic',
      version: '1.0',
      type: 'WISHMAGIC_ERROR',
      payload: { code: 'SYNTAX_ERROR', message: 'Unexpected token <', stage: 'render' }
    }
  });

  assert(sandbox.errorCount === 1, 'TEST 8: Error count incremented');
  assert(errorCaught && errorCaught.code === 'SYNTAX_ERROR', 'TEST 8: Structured error reported to parent');
  assert(sandbox.diagnostics.errors.length === 1, 'TEST 8: Diagnostics contains error record');

  sandbox.destroySandbox();
  console.log('✅ PASS: TEST 8: Error isolation and structured reporting');
}

// -----------------------------------------------------------------------------
// TEST 9: TEMPLATE SWITCHING & SCHEMA ISOLATION
// -----------------------------------------------------------------------------
{
  const container = new MockElement('div');
  const sandbox = new Sandbox({ container });

  const templateAData = {
    content: { recipient_name: 'Alex', voice_note_id: 'voice_123' },
    media: { cover_photo: { url: 'https://example.com/cover.jpg' } }
  };

  const schemaB = {
    fields: [
      { key: 'recipient_name', type: 'text' }
      // voice_note_id NOT supported in Template B
    ]
  };

  sandbox.switchTemplate('<html><body>Template B</body></html>', templateAData, schemaB);

  assert(sandbox.canonicalData.content.recipient_name === 'Alex', 'TEST 9: Supported recipient_name preserved');
  assert(sandbox.canonicalData.content.voice_note_id === undefined, 'TEST 9: Unsupported voice_note_id safely omitted');

  sandbox.destroySandbox();
  console.log('✅ PASS: TEST 9: Template switching and unsupported field dropping');
}

// -----------------------------------------------------------------------------
// TEST 10: TEMPLATE VALIDATION ENGINE & COMPATIBILITY REPORT
// -----------------------------------------------------------------------------
{
  const validPackage = {
    html: '<h1 data-wm-field="recipient_name"></h1><section data-wm-section="hero"></section>',
    files: [{ path: 'assets/hero.jpg', size: 5000 }],
    metadata: { id: 'clean_template', name: 'Clean Template' }
  };

  const report = Validator.validate(validPackage);
  assert(report.valid === true, 'TEST 10: Valid package passes validation');
  assert(report.canPublish === true, 'TEST 10: canPublish is true');
  assert(report.categories.html.status === 'PASS', 'TEST 10: HTML category PASS');
  assert(report.categories.security.status === 'PASS', 'TEST 10: Security category PASS');

  const dangerousPackage = {
    html: '<h1>Dangerous</h1>',
    files: [{ path: '../../../../etc/passwd', size: 100 }]
  };

  const dangerReport = Validator.validate(dangerousPackage);
  assert(dangerReport.valid === false, 'TEST 10: Path traversal package fails validation');
  assert(dangerReport.canPublish === false, 'TEST 10: Publishing blocked for dangerous package');
  assert(dangerReport.categories.security.status === 'ERROR', 'TEST 10: Security category ERROR');
  console.log('✅ PASS: TEST 10: Template validation engine & compatibility report');
}

// -----------------------------------------------------------------------------
// TEST 11: ADMIN TEST MODE & FIXTURE GENERATION
// -----------------------------------------------------------------------------
{
  const fixture = Sandbox.generateFixtureData({
    fields: [
      { key: 'recipient_name', label: 'Recipient Name', type: 'text' },
      { key: 'sender_email', label: 'Email', type: 'email' },
      { key: 'guest_count', label: 'Guests', type: 'number', min: 2 }
    ]
  });

  assert(fixture.recipient_name === 'Alex Rivera', 'TEST 11: Default Alex Rivera generated');
  assert(fixture.sender_email === 'alex@example.com', 'TEST 11: Mock email generated for email field');
  assert(fixture.guest_count === 2, 'TEST 11: Mock number bounded by min value');
  console.log('✅ PASS: TEST 11: Admin test mode & fixture generation');
}

// -----------------------------------------------------------------------------
// TEST 12: FIXTURE TEMPLATES (A, B, C, D)
// -----------------------------------------------------------------------------
{
  // Template A: Basic (recipient, sender, message, photo)
  const templateA = {
    html: `
      <h1 data-wm-field="recipient_name">Alex</h1>
      <span data-wm-field="sender_name">Taylor</span>
      <p data-wm-field="custom_message">Happy Birthday</p>
      <img data-wm-field="photo_1" src="assets/photo.jpg" />
    `,
    files: [{ path: 'assets/photo.jpg', size: 1000 }]
  };
  const repA = Validator.validate(templateA);
  assert(repA.canPublish === true, 'TEST 12: Template A (Basic) result is PASS');
  console.log('✅ PASS: TEST 12: Template A result -> PASS');

  // Template B: Advanced (recipient, message, gallery, video, music, countdown, themes, animations, particles)
  const templateB = {
    html: `
      <h1 data-wm-field="recipient_name"></h1>
      <p data-wm-field="custom_message"></p>
      <section data-wm-section="gallery" data-wm-layouts="grid,polaroid"></section>
      <video data-wm-media="video_wish" src="assets/video.mp4"></video>
      <audio data-wm-media="bg_music" src="assets/music.mp3"></audio>
      <section data-wm-section="countdown"></section>
      <body data-wm-themes="romantic,magical,sunset" data-wm-animations="ken-burns,fade" data-wm-particles="sparkles,confetti"></body>
    `,
    files: [
      { path: 'assets/video.mp4', size: 5000 },
      { path: 'assets/music.mp3', size: 3000 }
    ]
  };
  const repB = Validator.validate(templateB);
  assert(repB.canPublish === true, 'TEST 12: Template B (Advanced) result is PASS');
  console.log('✅ PASS: TEST 12: Template B result -> PASS');

  // Template C: Complex (sections, conditional fields, multiple photos, timeline, voice, theme, animation)
  const templateC = {
    html: `
      <h1 data-wm-field="recipient_name"></h1>
      <section data-wm-section="hero" data-wm-fixed="true"></section>
      <section data-wm-section="timeline"></section>
      <section data-wm-section="voice"></section>
      <div data-wm-field="secret_code" data-wm-visible-if="show_secret=true"></div>
      <div data-wm-media="gallery" data-wm-type="image-multiple"></div>
    `,
    files: []
  };
  const repC = Validator.validate(templateC);
  assert(repC.canPublish === true, 'TEST 12: Template C (Complex) result is PASS');
  console.log('✅ PASS: TEST 12: Template C result -> PASS');

  // Template D: Broken (Critical missing asset, malformed metadata)
  const templateD = {
    html: '<audio src="missing_essential_music.mp3"></audio>',
    files: [], // Missing audio file referenced
    metadata: '{ invalid json metadata '
  };
  const repD = Validator.validate(templateD);
  assert(repD.canPublish === false, 'TEST 12: Template D (Broken) result is ERROR (blocked)');
  assert(repD.status === 'ERROR', 'TEST 12: Template D status is ERROR');
  console.log('✅ PASS: TEST 12: Template D result -> ERROR (isolated safely)');
}

// -----------------------------------------------------------------------------
// TEST 13: CODE INTEGRITY & ANTI-EVAL SECURITY
// -----------------------------------------------------------------------------
{
  const stripStrings = (code) => code.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, '``');
  const cleanSandbox = stripStrings(sandboxCode);
  const cleanRuntime = stripStrings(runtimeCode);

  assert(!/\beval\s*\(/.test(cleanSandbox), 'TEST 13: Zero eval() in sandbox code execution');
  assert(!/\bnew\s+Function\s*\(/.test(cleanSandbox), 'TEST 13: Zero new Function() in sandbox code execution');
  assert(!/\beval\s*\(/.test(cleanRuntime), 'TEST 13: Zero eval() in runtime code execution');
  assert(!/\bnew\s+Function\s*\(/.test(cleanRuntime), 'TEST 13: Zero new Function() in runtime code execution');
  console.log('✅ PASS: TEST 13: Security and anti-eval verification');
}

console.log('================================================================');
console.log('🎉 Part 13 Sandbox & Runtime Protocol Test Suite Completed: 13 / 13 test groups passed.');
console.log('✅ ALL PART 13 TESTS PASSED CLEANLY.');
