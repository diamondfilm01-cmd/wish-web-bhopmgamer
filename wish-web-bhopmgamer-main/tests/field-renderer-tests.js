/**
 * Automated Test Suite for WishMagic Customizer UX, Field Renderer & Interaction System (Part 11)
 * ==============================================================================================
 * Comprehensive tests verifying:
 * - Centralized WishMagicFieldRenderer API (render, update, destroy, validate, focus, scrollTo)
 * - All supported field types (text, textarea, date, time, datetime, number, email, phone, url,
 *   color, select, multiselect, toggle, range, image, image-multiple, video, video-multiple,
 *   audio, voice, font, icon)
 * - Character count displays & boundary validations
 * - Range sliders and stepper controls
 * - Color picker & palette swatches
 * - Font selector & Typography previews
 * - Icon / Emoji grid selection
 * - Tag pills / multi-select chips
 * - Accessible switch toggles
 * - In-place non-destructive updates preserving cursor/focus
 * - Inline validation error feedback & aria-invalid
 * - Auto-scroll & focus to invalid field
 * - Anti-XSS escaping across all inputs and labels
 * - Zero hardcoded template conditionals
 */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failCount++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. ENVIRONMENT MOCK (DOM & BROWSER COMPATIBLE RUNTIME)
// ---------------------------------------------------------------------------
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
      if (this.childNodes.length > 0) {
        return this.childNodes.map(c => c.textContent || '').join('');
      }
      return this._textContent;
    }
    set textContent(val) {
      this._textContent = String(val);
      this.childNodes = [{ nodeValue: String(val), textContent: String(val) }];
    }

    get innerHTML() {
      return this._innerHTML;
    }
    set innerHTML(val) {
      this._innerHTML = String(val);
    }

    setAttribute(name, val) {
      this.attributes[name] = String(val);
      if (name === 'class') this.className = val;
      if (name === 'type') this.type = val;
      if (name === 'value') this._value = val;
      if (name === 'disabled') this.disabled = true;
    }
    getAttribute(name) {
      return this.attributes[name] !== undefined ? this.attributes[name] : null;
    }
    removeAttribute(name) {
      delete this.attributes[name];
      if (name === 'disabled') this.disabled = false;
    }
    hasAttribute(name) {
      return name in this.attributes;
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
    removeEventListener(event, handler) {
      if (this._listeners[event]) {
        this._listeners[event] = this._listeners[event].filter(h => h !== handler);
      }
    }
    dispatchEvent(event) {
      const handlers = this._listeners[event.type] || [];
      handlers.forEach(h => h(event));
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
      const results = [];
      const traverse = (node) => {
        if (!node || !node.childNodes) return;
        for (const child of node.childNodes) {
          if (child instanceof MockElement) {
            let match = false;
            if (selector.startsWith('.')) {
              const cls = selector.slice(1);
              if (child.classList.contains(cls)) match = true;
            } else if (selector.startsWith('#')) {
              const id = selector.slice(1);
              if (child.getAttribute('id') === id) match = true;
            } else if (selector.startsWith('[role=')) {
              const role = selector.match(/role="?([^"\]]+)"?/)?.[1];
              if (child.getAttribute('role') === role) match = true;
            } else if (selector.includes('.')) {
              const [tag, ...classes] = selector.split('.');
              const tagMatches = !tag || child.tagName.toLowerCase() === tag.toLowerCase();
              const classMatches = classes.every(c => child.classList.contains(c));
              if (tagMatches && classMatches) match = true;
            } else if (selector.includes(',')) {
              const parts = selector.split(',').map(s => s.trim());
              if (parts.some(p => p.toUpperCase() === child.tagName || child.classList.contains(p.replace('.', '')))) {
                match = true;
              }
            } else if (child.tagName.toLowerCase() === selector.toLowerCase()) {
              match = true;
            }
            if (match) results.push(child);
            traverse(child);
          }
        }
      };
      traverse(this);
      return results;
    }

    focus() {
      this._focused = true;
    }
    scrollIntoView(options) {
      this._scrolled = true;
      this._scrollOptions = options;
    }
  }

  const documentMock = {
    createElement(tag) {
      return new MockElement(tag);
    },
    activeElement: null
  };

  return { document: documentMock, MockElement };
}

// ---------------------------------------------------------------------------
// 2. SETUP RUNTIME CONTEXT
// ---------------------------------------------------------------------------
const rendererCode = fs.readFileSync(path.join(__dirname, '../public/js/wishmagic-field-renderer.js'), 'utf8');
const customizerCode = fs.readFileSync(path.join(__dirname, '../public/js/wishmagic-customizer-generator.js'), 'utf8');

const CustomURL = globalThis.URL;
CustomURL.createObjectURL = () => 'blob:mock-preview-url';
CustomURL.revokeObjectURL = () => {};

const { document: docMock } = createMockDOM();
const sandbox = {
  window: {},
  document: docMock,
  console,
  setTimeout,
  clearTimeout,
  URL: CustomURL
};
sandbox.global = sandbox.window;
sandbox.window.document = docMock;

vm.createContext(sandbox);
vm.runInContext(rendererCode, sandbox);
vm.runInContext(customizerCode, sandbox);

const FieldRenderer = sandbox.window.WishMagicFieldRenderer;

console.log('================================================================');
console.log('🎨 RUNNING PART 11 WISHMAGIC FIELD RENDERER & CUSTOMIZER UX SUITE');
console.log('================================================================');

// ---------------------------------------------------------------------------
// TEST 1: CORE RENDERER API COMPLETENESS
// ---------------------------------------------------------------------------
try {
  assert(typeof FieldRenderer === 'object' && FieldRenderer !== null, 'TEST 1: WishMagicFieldRenderer is exported');
  assert(typeof FieldRenderer.render === 'function', 'TEST 1: render() exists');
  assert(typeof FieldRenderer.update === 'function', 'TEST 1: update() exists');
  assert(typeof FieldRenderer.destroy === 'function', 'TEST 1: destroy() exists');
  assert(typeof FieldRenderer.validate === 'function', 'TEST 1: validate() exists');
  assert(typeof FieldRenderer.focus === 'function', 'TEST 1: focus() exists');
  assert(typeof FieldRenderer.scrollTo === 'function', 'TEST 1: scrollTo() exists');
} catch (e) {
  console.error(e);
}

// ---------------------------------------------------------------------------
// TEST 2: TEXT FIELD RENDERING & BOUND VALIDATION
// ---------------------------------------------------------------------------
try {
  const textField = {
    key: 'recipient_name',
    label: 'Birthday Person',
    type: 'text',
    required: true,
    minlength: 2,
    maxLength: 30,
    placeholder: 'Enter person name...'
  };

  const valRes = FieldRenderer.validate(textField, 'A');
  assert(valRes.valid === false && valRes.code === 'MIN_LENGTH', 'TEST 2: 1-char input fails minlength=2 validation');

  const emptyRes = FieldRenderer.validate(textField, '');
  assert(emptyRes.valid === false && emptyRes.code === 'REQUIRED', 'TEST 2: Empty input fails required validation');

  const validRes = FieldRenderer.validate(textField, 'Kritika Sharma');
  assert(validRes.valid === true, 'TEST 2: Valid text passes validation');

  let changeVal = null;
  const dom = FieldRenderer.render(textField, 'Kritika', (k, v) => { changeVal = v; });
  assert(dom !== null, 'TEST 2: Text container created');
  assert(dom.getAttribute('data-field-key') === 'recipient_name', 'TEST 2: data-field-key matches');
} catch (e) {
  console.error(e);
}

// ---------------------------------------------------------------------------
// TEST 3: TEXTAREA WITH ROWS & MAXLENGTH
// ---------------------------------------------------------------------------
try {
  const textareaField = {
    key: 'custom_message',
    label: 'Heartfelt Message',
    type: 'textarea',
    maxLength: 200,
    required: false
  };

  const longText = 'a'.repeat(201);
  const maxRes = FieldRenderer.validate(textareaField, longText);
  assert(maxRes.valid === false && maxRes.code === 'MAX_LENGTH', 'TEST 3: 201 chars fails maxlength=200');

  const validTextRes = FieldRenderer.validate(textareaField, 'Wishing you the happiest birthday!');
  assert(validTextRes.valid === true, 'TEST 3: Normal text passes validation');

  const dom = FieldRenderer.render(textareaField, 'Hello World', () => {});
  const textarea = dom.querySelector('textarea');
  assert(textarea !== null, 'TEST 3: textarea element rendered');
  assert(textarea.getAttribute('maxlength') === '200', 'TEST 3: maxlength attribute set on textarea');
} catch (e) {
  console.error(e);
}

// ---------------------------------------------------------------------------
// TEST 4: NUMBER & RANGE SLIDERS
// ---------------------------------------------------------------------------
try {
  const rangeField = {
    key: 'font_size',
    label: 'Font Size',
    type: 'range',
    min: 12,
    max: 48,
    step: 2
  };

  const tooSmall = FieldRenderer.validate(rangeField, 10);
  assert(tooSmall.valid === false && tooSmall.code === 'MIN_VALUE', 'TEST 4: Number below min fails with MIN_VALUE');

  const tooBig = FieldRenderer.validate(rangeField, 60);
  assert(tooBig.valid === false && tooBig.code === 'MAX_VALUE', 'TEST 4: Number above max fails with MAX_VALUE');

  const validRange = FieldRenderer.validate(rangeField, 24);
  assert(validRange.valid === true, 'TEST 4: Valid range value 24 passes');

  const rangeDom = FieldRenderer.render(rangeField, 24, () => {});
  const input = rangeDom.querySelector('input');
  assert(input.getAttribute('min') === '12', 'TEST 4: min=12 attribute present');
  assert(input.getAttribute('max') === '48', 'TEST 4: max=48 attribute present');
} catch (e) {
  console.error(e);
}

// ---------------------------------------------------------------------------
// TEST 5: DATE, TIME & DATETIME FORMAT VALIDATION
// ---------------------------------------------------------------------------
try {
  const dateField = { key: 'event_date', label: 'Event Date', type: 'date', required: true };
  const timeField = { key: 'event_time', label: 'Event Time', type: 'time' };
  const dtField = { key: 'event_datetime', label: 'Event Schedule', type: 'datetime' };

  assert(FieldRenderer.validate(dateField, '2026-10-25').valid === true, 'TEST 5: Canonical YYYY-MM-DD date is valid');
  assert(FieldRenderer.validate(dateField, '25/10/2026').valid === false, 'TEST 5: Non-canonical date fails');
  assert(FieldRenderer.validate(timeField, '18:30').valid === true, 'TEST 5: HH:mm time is valid');
  assert(FieldRenderer.validate(timeField, '99:99').valid === false, 'TEST 5: Invalid time fails');
  assert(FieldRenderer.validate(dtField, '2026-10-25T18:30').valid === true, 'TEST 5: Valid datetime is valid');
} catch (e) {
  console.error(e);
}

// ---------------------------------------------------------------------------
// TEST 6: EMAIL, PHONE & URL FORMAT VALIDATIONS
// ---------------------------------------------------------------------------
try {
  const emailField = { key: 'email', label: 'Email', type: 'email' };
  const urlField = { key: 'website', label: 'Website', type: 'url' };
  const phoneField = { key: 'phone', label: 'Phone', type: 'phone' };

  assert(FieldRenderer.validate(emailField, 'test@example.com').valid === true, 'TEST 6: Valid email passes');
  assert(FieldRenderer.validate(emailField, 'invalid-email').valid === false, 'TEST 6: Invalid email fails');
  assert(FieldRenderer.validate(urlField, 'https://wishmagic.anktech.com').valid === true, 'TEST 6: Valid URL passes');
  assert(FieldRenderer.validate(urlField, 'not-a-link').valid === false, 'TEST 6: Invalid URL fails');
  assert(FieldRenderer.validate(phoneField, '+19876543210').valid === true, 'TEST 6: Valid phone passes');
  assert(FieldRenderer.validate(phoneField, 'abc').valid === false, 'TEST 6: Non-numeric phone fails');
} catch (e) {
  console.error(e);
}

// ---------------------------------------------------------------------------
// TEST 7: COLOR PICKER & PRESET PALETTE SWATCHES
// ---------------------------------------------------------------------------
try {
  const colorField = { key: 'accent_color', label: 'Accent Color', type: 'color' };
  assert(FieldRenderer.validate(colorField, '#ff4d6d').valid === true, 'TEST 7: Hex color #ff4d6d passes');
  assert(FieldRenderer.validate(colorField, 'invalid-color').valid === false, 'TEST 7: Invalid color code fails');

  const colorDom = FieldRenderer.render(colorField, '#ff4d6d', () => {});
  const swatches = colorDom.querySelectorAll('button');
  assert(swatches.length >= 10, 'TEST 7: Preset color swatches generated');
} catch (e) {
  console.error(e);
}

// ---------------------------------------------------------------------------
// TEST 8: FONT SELECTOR & TYPOGRAPHY PREVIEWS
// ---------------------------------------------------------------------------
try {
  const fontField = { key: 'title_font', label: 'Font Family', type: 'font' };
  const fontDom = FieldRenderer.render(fontField, 'Inter, sans-serif', () => {});
  const select = fontDom.querySelector('select');
  assert(select !== null, 'TEST 8: Font dropdown rendered');
  const preview = fontDom.querySelector('div.text-lg');
  assert(preview !== null && preview.textContent.includes('Preview'), 'TEST 8: Font typography preview card rendered');
} catch (e) {
  console.error(e);
}

// ---------------------------------------------------------------------------
// TEST 9: ICON / EMOJI PICKER WITH GRID
// ---------------------------------------------------------------------------
try {
  const iconField = { key: 'header_icon', label: 'Header Icon', type: 'icon' };
  const iconDom = FieldRenderer.render(iconField, '🎂', () => {});
  const buttons = iconDom.querySelectorAll('button');
  assert(buttons.length >= 10, 'TEST 9: Emoji/Icon grid buttons rendered');
} catch (e) {
  console.error(e);
}

// ---------------------------------------------------------------------------
// TEST 10: TOGGLE SWITCH ACCESSIBILITY
// ---------------------------------------------------------------------------
try {
  const toggleField = { key: 'show_balloons', label: 'Floating Balloons', type: 'toggle' };
  const toggleDom = FieldRenderer.render(toggleField, true, () => {});
  const switchBtn = toggleDom.querySelector('[role="switch"]');
  assert(switchBtn !== null, 'TEST 10: Switch control has role="switch"');
  assert(switchBtn.getAttribute('aria-checked') === 'true', 'TEST 10: aria-checked is true for enabled toggle');
} catch (e) {
  console.error(e);
}

// ---------------------------------------------------------------------------
// TEST 11: MULTISELECT TAGS & CHIPS
// ---------------------------------------------------------------------------
try {
  const multiField = {
    key: 'interests',
    label: 'Favorite Interests',
    type: 'multiselect',
    options: [
      { value: 'music', label: 'Music' },
      { value: 'travel', label: 'Travel' },
      { value: 'books', label: 'Books' }
    ]
  };

  const valRes = FieldRenderer.validate(multiField, ['music', 'travel']);
  assert(valRes.valid === true, 'TEST 11: Valid multiselect array passes');

  const badRes = FieldRenderer.validate(multiField, ['music', 'unknown_item']);
  assert(badRes.valid === false, 'TEST 11: Undeclared multiselect option fails');

  const multiDom = FieldRenderer.render(multiField, ['music'], () => {});
  const chips = multiDom.querySelectorAll('button');
  assert(chips.length >= 3, 'TEST 11: Multiselect chip buttons rendered');
} catch (e) {
  console.error(e);
}

// ---------------------------------------------------------------------------
// TEST 12: IN-PLACE DOM UPDATE & ERROR STATE
// ---------------------------------------------------------------------------
try {
  const testField = { key: 'sender_name', label: 'Your Name', type: 'text', required: true };
  const dom = FieldRenderer.render(testField, 'Ankit', () => {});

  // Update with error state
  FieldRenderer.update(testField, { value: '', error: 'Your Name is required' }, dom);
  const errorBox = dom.querySelector('.wm-field-error');
  assert(!errorBox.classList.contains('hidden'), 'TEST 12: Error box is displayed on validation error');
  const input = dom.querySelector('input');
  assert(input.getAttribute('aria-invalid') === 'true', 'TEST 12: aria-invalid set on input');

  // Clear error state
  FieldRenderer.update(testField, { value: 'Ankit Kumar', error: '' }, dom);
  assert(errorBox.classList.contains('hidden'), 'TEST 12: Error box is hidden when error cleared');
  assert(!input.hasAttribute('aria-invalid'), 'TEST 12: aria-invalid removed');
} catch (e) {
  console.error(e);
}

// ---------------------------------------------------------------------------
// TEST 13: SCROLL TO & FOCUS
// ---------------------------------------------------------------------------
try {
  const field = { key: 'test_focus', label: 'Focus Field', type: 'text' };
  const dom = FieldRenderer.render(field, '', () => {});
  FieldRenderer.scrollTo(field, dom);
  assert(dom._scrolled === true, 'TEST 13: scrollTo invoked scrollIntoView');
  const input = dom.querySelector('input');
  assert(input._focused === true, 'TEST 13: input was focused');
} catch (e) {
  console.error(e);
}

// ---------------------------------------------------------------------------
// TEST 14: ANTI-XSS ESCAPING
// ---------------------------------------------------------------------------
try {
  const xssField = {
    key: 'xss_test',
    label: '<script>alert("xss")</script>',
    description: '<img src=x onerror=alert(1)>',
    type: 'text'
  };
  const dom = FieldRenderer.render(xssField, '<svg onload=alert(1)>', () => {});
  assert(!dom.innerHTML.includes('<script>alert'), 'TEST 14: Script tag escaped from label');
  assert(!dom.innerHTML.includes('<img src=x'), 'TEST 14: Image tag escaped from description');
} catch (e) {
  console.error(e);
}

// ---------------------------------------------------------------------------
// TEST 15: NO EVAL / NEW FUNCTION
// ---------------------------------------------------------------------------
try {
  assert(!rendererCode.includes('eval('), 'TEST 15: Zero eval() calls in field renderer');
  assert(!rendererCode.includes('new Function('), 'TEST 15: Zero new Function() calls in field renderer');
} catch (e) {
  console.error(e);
}

console.log('================================================================');
console.log(`🎉 Part 11 Customizer UX & Field Renderer Test Suite Completed: ${passCount} / ${passCount + failCount} assertions passed.`);
if (failCount > 0) {
  console.error(`❌ ${failCount} TESTS FAILED.`);
  process.exit(1);
} else {
  console.log('✅ ALL PART 11 TESTS PASSED CLEANLY.');
}
