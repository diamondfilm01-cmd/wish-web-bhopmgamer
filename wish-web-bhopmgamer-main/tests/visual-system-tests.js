/**
 * Automated Test Suite for WishMagic Theme + Visual Customization Engine (Part 6)
 * ==============================================================================
 * Tests all requirements from Part 6:
 * 1. Theme presets: Template declares supported themes; analyzer extracts them; undeclared themes are not fabricated (Spec 3, 4, 5)
 * 2. Theme default fallback: Invalid default theme falls back safely to first valid theme (Spec 5, 67)
 * 3. Theme conflict detection: Multiple conflicting declarations detected and reported with warning (Spec 4)
 * 4. Runtime theme validation: WishMagicRuntime rejects unsupported themes and applies supported ones to data-wm-theme (Spec 7, 8, 45)
 * 5. Color metadata & defaults: Extracts declared colors and their default hex/rgb values (Spec 11, 12)
 * 6. Color safety & sanitization: Rejects script injection, javascript:, expression() and allows safe colors (Spec 13, 56)
 * 7. Color reset: Resetting a color override restores theme default (Spec 30, 31)
 * 8. Background system: Declared backgrounds normalized, runtime validates and updates data-wm-background (Spec 14, 15, 16)
 * 9. Surface style: Declared surfaces normalized, runtime updates data-wm-surface (Spec 18, 19)
 * 10. Button style: Declared button styles normalized, runtime updates data-wm-button-style (Spec 20, 21)
 * 11. Typography: Declared fonts and weights normalized without arbitrary font injection (Spec 22, 23, 24, 26)
 * 12. Visual intensity & radius: Declared options extracted and applied safely (Spec 27, 28, 29)
 * 13. Template-specific custom controls: Range/custom visual controls detected and applied to CSS variables (Spec 49, 50, 51)
 * 14. Complete visual reset: WishMagicRuntime.resetVisualState restores all visuals without touching user text/photos (Spec 34, 35, 64)
 * 15. Customizer generation: Honest controls generated; only declared visual capabilities appear (Spec 41, 42, 65, 66)
 * 16. State isolation: Modifying visuals does NOT touch recipient, sender, message, or photos (Spec 37, 58)
 * 17. Final serialization: Complete WishMagicData.visual is 100% JSON serializable (Spec 32, 59)
 * 18. Accessibility & attributes: aria-pressed on theme buttons, accessible color pickers (Spec 71)
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
    if (name.startsWith('data-wm-theme')) {
      this.dataset.wmTheme = String(val);
    }
    if (name.startsWith('data-wm-background')) {
      this.dataset.wmBackground = String(val);
    }
    if (name.startsWith('data-wm-surface')) {
      this.dataset.wmSurface = String(val);
    }
    if (name.startsWith('data-wm-button-style')) {
      this.dataset.wmButtonStyle = String(val);
    }
    if (name.startsWith('data-wm-intensity')) {
      this.dataset.wmIntensity = String(val);
    }
    if (name.startsWith('data-wm-radius')) {
      this.dataset.wmRadius = String(val);
    }
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'data-wm-theme') delete this.dataset.wmTheme;
    if (name === 'data-wm-background') delete this.dataset.wmBackground;
    if (name === 'data-wm-surface') delete this.dataset.wmSurface;
    if (name === 'data-wm-button-style') delete this.dataset.wmButtonStyle;
    if (name === 'data-wm-intensity') delete this.dataset.wmIntensity;
    if (name === 'data-wm-radius') delete this.dataset.wmRadius;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  querySelectorAll(selector) {
    const results = [];
    function traverse(node) {
      if (node.matches && node.matches(selector)) {
        results.push(node);
      }
      for (const child of node.children) {
        traverse(child);
      }
    }
    for (const child of this.children) {
      traverse(child);
    }
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
        const [attr, val] = inside.split('=');
        const cleanVal = val.replace(/['"]/g, '');
        return this.getAttribute(attr) === cleanVal;
      }
      return this.hasAttribute(inside);
    }
    return false;
  }
}

class MockDocument {
  constructor() {
    this.documentElement = new MockElement('html', { 'data-wm-protocol': '1.0' });
    this.body = new MockElement('body');
    this.documentElement.appendChild(this.body);
  }

  querySelectorAll(selector) {
    const results = [];
    if (this.documentElement.matches && this.documentElement.matches(selector)) {
      results.push(this.documentElement);
    }
    results.push(...this.documentElement.querySelectorAll(selector));
    return results;
  }

  querySelector(selector) {
    const list = this.querySelectorAll(selector);
    return list.length > 0 ? list[0] : null;
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
  parseFloat,
  JSON
};
globalScope.global = globalScope;
globalScope.window = globalScope;

// Execute modules in headless sandbox
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
console.log('🎨 RUNNING PART 6 WISHMAGIC THEME & VISUAL CUSTOMIZATION SUITE');
console.log('================================================================');

// TEST 1: Theme Presets & Schema Normalization (Spec 3, 4, 5)
{
  const doc = new MockDocument();
  doc.body.setAttribute('data-wm-themes', 'magical,romantic,elegant');
  doc.body.setAttribute('data-wm-default-theme', 'romantic');

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.visual.themes.supported.length === 3, 'TEST 1: Exactly 3 themes detected');
  assert(res.visual.themes.supported.includes('romantic'), 'TEST 1: Romantic theme detected');
  assert(res.visual.themes.default === 'romantic', 'TEST 1: Default theme set to romantic');
  assert(!res.visual.themes.supported.includes('royal'), 'TEST 1: Undeclared royal theme is NOT fabricated');
}

// TEST 2: Invalid Default Theme Fallback (Spec 5, 67)
{
  const doc = new MockDocument();
  doc.body.setAttribute('data-wm-themes', 'magical,romantic');
  doc.body.setAttribute('data-wm-default-theme', 'unknown_theme');

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.visual.themes.default === 'magical', 'TEST 2: Invalid default falls back to first supported theme (magical)');
  assert(res.warnings.some(w => w.code === 'INVALID_DEFAULT_THEME'), 'TEST 2: Warning reported for invalid default theme');
}

// TEST 3: Theme Metadata Conflict Detection (Spec 4)
{
  const doc = new MockDocument();
  doc.documentElement.setAttribute('data-wm-themes', 'magical,cute');
  doc.body.setAttribute('data-wm-themes', 'romantic,elegant');

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.warnings.some(w => w.code === 'THEME_METADATA_CONFLICT'), 'TEST 3: Detected theme conflict between html and body');
  assert(res.visual.themes.supported.includes('romantic'), 'TEST 3: Preferring body theme declaration');
}

// TEST 4: Runtime Theme Application & Validation (Spec 7, 8, 45)
{
  const doc = new MockDocument();
  doc.body.setAttribute('data-wm-themes', 'magical,romantic,elegant');
  globalScope.document = doc;

  // Attempt unsupported theme
  const invalidResult = Runtime.updateTheme('cyberpunk');
  assert(invalidResult === false, 'TEST 4: Runtime rejects undeclared cyberpunk theme');
  assert(doc.documentElement.dataset.wmTheme !== 'cyberpunk', 'TEST 4: Undeclared theme not written to DOM');

  // Apply supported theme
  const validResult = Runtime.updateTheme('romantic');
  assert(validResult === true, 'TEST 4: Runtime approves declared romantic theme');
  assert(doc.documentElement.dataset.wmTheme === 'romantic', 'TEST 4: DOM updated with data-wm-theme="romantic"');
}

// TEST 5: Colors Metadata & Defaults Extraction (Spec 11, 12)
{
  const doc = new MockDocument();
  doc.body.setAttribute('data-wm-colors', 'primary,secondary,accent,glow');
  doc.body.setAttribute('data-wm-default-primary', '#7C3AED');
  doc.body.setAttribute('data-wm-default-secondary', '#EC4899');
  doc.body.setAttribute('data-wm-default-accent', '#F59E0B');

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.visual.colors.supported.length === 4, 'TEST 5: Exactly 4 colors supported');
  assert(res.visual.colors.defaults.primary === '#7C3AED', 'TEST 5: Default primary color extracted');
  assert(res.visual.colors.defaults.accent === '#F59E0B', 'TEST 5: Default accent color extracted');
}

// TEST 6: Color Safety & Sanitization (Spec 13, 56)
{
  assert(Runtime.sanitizeColor('#7C3AED') === '#7C3AED', 'TEST 6: Valid hex color approved');
  assert(Runtime.sanitizeColor('rgb(236, 72, 153)') === 'rgb(236, 72, 153)', 'TEST 6: Valid rgb color approved');
  assert(Runtime.sanitizeColor('javascript:alert(1)') === null, 'TEST 6: javascript: injection rejected');
  assert(Runtime.sanitizeColor('url(bad.css)') === null, 'TEST 6: url() injection rejected');
  assert(Runtime.sanitizeColor('expression(document.write(1))') === null, 'TEST 6: expression() rejected');
  assert(Runtime.sanitizeColor('<script>alert(1)</script>') === null, 'TEST 6: HTML tag injection rejected');
}

// TEST 7: Color Application & CSS Variables (Spec 9, 10, 47)
{
  const doc = new MockDocument();
  globalScope.document = doc;

  Runtime.updateColors({ primary: '#8B5CF6', accent: '#EC4899' });
  assert(doc.documentElement.style.getPropertyValue('--wm-primary') === '#8B5CF6', 'TEST 7: Namespaced --wm-primary variable updated');
  assert(doc.documentElement.style.getPropertyValue('--wm-accent') === '#EC4899', 'TEST 7: Namespaced --wm-accent variable updated');
  assert(!doc.documentElement.style.getPropertyValue('--primary'), 'TEST 7: Unnamespaced --primary is NOT modified');
}

// TEST 8: Color Reset Restores Baseline (Spec 30, 31)
{
  const doc = new MockDocument();
  globalScope.document = doc;

  Runtime.updateColors({ accent: '#10B981' });
  assert(doc.documentElement.style.getPropertyValue('--wm-accent') === '#10B981', 'TEST 8: Accent color set to custom');

  // Reset accent by sending null
  Runtime.updateColors({ accent: null });
  assert(!doc.documentElement.style.getPropertyValue('--wm-accent'), 'TEST 8: Resetting accent removes CSS variable override');
}

// TEST 9: Background System Validation (Spec 14, 15, 16)
{
  const doc = new MockDocument();
  doc.body.setAttribute('data-wm-backgrounds', 'radial-glow,warm-ambient,deep-cosmic');
  doc.body.setAttribute('data-wm-default-background', 'warm-ambient');
  globalScope.document = doc;

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.visual.backgrounds.supported.length === 3, 'TEST 9: 3 backgrounds detected');
  assert(res.visual.backgrounds.default === 'warm-ambient', 'TEST 9: Default background is warm-ambient');

  // Runtime test
  assert(Runtime.setBackground('unsupported_bg') === false, 'TEST 9: Unsupported background rejected');
  assert(Runtime.setBackground('deep-cosmic') === true, 'TEST 9: Supported deep-cosmic background accepted');
  assert(doc.documentElement.dataset.wmBackground === 'deep-cosmic', 'TEST 9: DOM updated with data-wm-background="deep-cosmic"');
}

// TEST 10: Surface Style Validation (Spec 18, 19)
{
  const doc = new MockDocument();
  doc.body.setAttribute('data-wm-surfaces', 'glass-frosted,clean-minimal,elevated-glow');
  globalScope.document = doc;

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.visual.surfaces.supported.length === 3, 'TEST 10: 3 surfaces detected');

  assert(Runtime.setSurface('glass-frosted') === true, 'TEST 10: Supported surface applied');
  assert(doc.documentElement.dataset.wmSurface === 'glass-frosted', 'TEST 10: DOM updated with data-wm-surface="glass-frosted"');
}

// TEST 11: Button Style Validation (Spec 20, 21)
{
  const doc = new MockDocument();
  doc.body.setAttribute('data-wm-button-styles', 'gradient-pill,outline-glow,glassmorphic');
  globalScope.document = doc;

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.visual.buttons.supported.length === 3, 'TEST 11: 3 button styles detected');

  assert(Runtime.setButtonStyle('glassmorphic') === true, 'TEST 11: Supported button style applied');
  assert(doc.documentElement.dataset.wmButtonStyle === 'glassmorphic', 'TEST 11: DOM updated with data-wm-button-style="glassmorphic"');
}

// TEST 12: Typography Controls & Safety (Spec 22, 23, 24, 26)
{
  const doc = new MockDocument();
  doc.body.setAttribute('data-wm-typography', 'heading-font,body-font');
  doc.body.setAttribute('data-wm-fonts', 'playfair,inter,montserrat');
  doc.body.setAttribute('data-wm-font-weights', '400,600,700');
  globalScope.document = doc;

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.visual.typography.fonts.length === 3, 'TEST 12: Exactly 3 declared fonts detected');
  assert(res.visual.typography.fonts.includes('playfair'), 'TEST 12: Playfair font detected');

  assert(Runtime.setTypography('headingFont', 'playfair') === true, 'TEST 12: Heading font updated in runtime');
  assert(doc.documentElement.style.getPropertyValue('--wm-heading-font') === 'playfair', 'TEST 12: CSS variable --wm-heading-font set');
  assert(Runtime.setTypography('headingFont', '<script>alert(1)</script>') === false, 'TEST 12: Injection in font rejected');
}

// TEST 13: Border Radius & Visual Intensity (Spec 27, 28, 29)
{
  const doc = new MockDocument();
  doc.body.setAttribute('data-wm-radius', 'small,medium,pill');
  doc.body.setAttribute('data-wm-intensity', 'minimal,soft,expressive');
  doc.body.setAttribute('data-wm-default-intensity', 'soft');
  globalScope.document = doc;

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.visual.radius.supported.length === 3, 'TEST 13: Radius options detected');
  assert(res.visual.intensity.default === 'soft', 'TEST 13: Default intensity is soft');

  Runtime.setIntensity('expressive');
  assert(doc.documentElement.dataset.wmIntensity === 'expressive', 'TEST 13: Runtime updates data-wm-intensity="expressive"');

  Runtime.setRadius('pill');
  assert(doc.documentElement.dataset.wmRadius === 'pill', 'TEST 13: Runtime updates data-wm-radius="pill"');
}

// TEST 14: Template-Specific Custom Visual Control (Spec 49, 50, 51)
{
  const doc = new MockDocument();
  const ctrl = new MockElement('div', {
    'data-wm-visual-control': 'star-density',
    'data-wm-type': 'range',
    'data-wm-min': '10',
    'data-wm-max': '200',
    'data-wm-default': '50',
    'data-wm-variable': '--wm-star-density'
  });
  doc.body.appendChild(ctrl);
  globalScope.document = doc;

  const res = Analyzer.analyze({ document: doc, force: true });
  assert(res.visual.customControls.length === 1, 'TEST 14: Custom visual control detected');
  assert(res.visual.customControls[0].id === 'star-density', 'TEST 14: Custom control id is star-density');
  assert(res.visual.customControls[0].default === 50, 'TEST 14: Custom control default is 50');

  Runtime.setCustomVisual('star-density', 120);
  assert(doc.documentElement.style.getPropertyValue('--wm-star-density') === '120', 'TEST 14: Custom control updates declared CSS variable');
}

// TEST 15: Complete Visual Reset (Spec 34, 35, 64)
{
  const doc = new MockDocument();
  doc.body.setAttribute('data-wm-default-theme', 'romantic');
  globalScope.document = doc;

  // Apply various customizations
  Runtime.updateTheme('royal');
  Runtime.updateColors({ primary: '#123456', accent: '#654321' });
  Runtime.setBackground('deep-cosmic');
  Runtime.setSurface('glass-frosted');
  Runtime.setButtonStyle('glassmorphic');

  // Reset visual state
  Runtime.resetVisualState();
  assert(doc.documentElement.dataset.wmTheme === 'romantic', 'TEST 15: Reset restores template default theme (romantic)');
  assert(!doc.documentElement.style.getPropertyValue('--wm-primary'), 'TEST 15: Primary color variable cleared');
  assert(!doc.documentElement.dataset.wmBackground, 'TEST 15: Background attribute cleared');
  assert(!doc.documentElement.dataset.wmSurface, 'TEST 15: Surface attribute cleared');
}

// TEST 16: Customizer Schema & Honest Control Generation (Spec 41, 42, 65, 66)
{
  // Template A: Rich declared visual capabilities
  const analysisA = {
    valid: true,
    protocol: { version: '1.0' },
    fields: [{ key: 'recipient_name', type: 'text', required: true, group: 'personal' }],
    sections: [{ key: 'hero', toggleable: false }],
    capabilities: {},
    visual: {
      themes: { supported: ['magical', 'romantic', 'elegant'], default: 'magical' },
      colors: { supported: ['primary', 'accent'], defaults: { primary: '#ec4899', accent: '#f59e0b' } },
      backgrounds: { supported: ['radial-glow', 'deep-cosmic'], default: 'radial-glow' },
      surfaces: { supported: ['glass-frosted'], default: 'glass-frosted' },
      buttons: { supported: ['gradient-pill', 'glassmorphic'], default: 'gradient-pill' },
      typography: { supported: ['heading-font'], fonts: ['playfair', 'inter'] },
      intensity: { supported: ['minimal', 'soft', 'expressive'], default: 'soft' }
    }
  };

  const schemaA = CustomizerSchema.fromAnalysis(analysisA);
  assert(schemaA.visual.themes.supported.length === 3, 'TEST 16: Template A has 3 themes');
  assert(schemaA.visual.colors.supported.length === 2, 'TEST 16: Template A has 2 colors');
  assert(schemaA.visual.backgrounds.supported.length === 2, 'TEST 16: Template A has 2 backgrounds');
  assert(schemaA.visual.surfaces.supported.length === 1, 'TEST 16: Template A has 1 surface');
  assert(schemaA.visual.buttons.supported.length === 2, 'TEST 16: Template A has 2 button styles');

  // Template B: Minimal declared visual capabilities
  const analysisB = {
    valid: true,
    protocol: { version: '1.0' },
    fields: [{ key: 'recipient_name', type: 'text', required: true, group: 'personal' }],
    sections: [{ key: 'hero', toggleable: false }],
    capabilities: {},
    visual: {
      themes: { supported: ['dark'], default: 'dark' },
      colors: { supported: ['accent'], defaults: {} },
      backgrounds: { supported: ['obsidian'], default: 'obsidian' },
      surfaces: { supported: [] },
      buttons: { supported: [] },
      typography: { supported: [] },
      intensity: { supported: [] }
    }
  };

  const schemaB = CustomizerSchema.fromAnalysis(analysisB);
  assert(schemaB.visual.themes.supported.length === 1, 'TEST 16: Template B has only 1 theme');
  assert(schemaB.visual.surfaces.supported.length === 0, 'TEST 16: Template B honestly has 0 surfaces');
  assert(schemaB.visual.buttons.supported.length === 0, 'TEST 16: Template B honestly has 0 button styles');
}

// TEST 17: State Isolation (Spec 37, 58)
{
  const analysis = {
    valid: true,
    protocol: { version: '1.0' },
    fields: [{ key: 'recipient_name', type: 'text', required: true, group: 'personal' }],
    sections: [{ key: 'hero', toggleable: false }],
    capabilities: {},
    visual: {
      themes: { supported: ['magical', 'romantic'], default: 'magical' },
      colors: { supported: ['primary'], defaults: { primary: '#ec4899' } }
    }
  };

  Customizer.init({
    analysis,
    initialData: {
      recipient_name: 'Priya Sharma',
      custom_message: 'Happy Birthday to my dearest friend!',
      photos: ['photo1.jpg']
    }
  });

  // Switch Theme & Color
  Customizer.handleThemeSelect('romantic');
  Customizer.handleColorChange('primary', '#8B5CF6');

  const finalData = Customizer.getData();
  assert(finalData.recipient_name === 'Priya Sharma', 'TEST 17: Recipient name intact after theme change');
  assert(finalData.custom_message === 'Happy Birthday to my dearest friend!', 'TEST 17: Message intact after theme change');
  assert(finalData.photos[0] === 'photo1.jpg', 'TEST 17: Photos intact after theme change');
  assert(finalData.visual.theme === 'romantic', 'TEST 17: Visual theme updated to romantic');
  assert(finalData.visual.colors.primary === '#8B5CF6', 'TEST 17: Visual primary color updated');
}

// TEST 18: Final WishMagicData.visual JSON Serialization (Spec 32, 59)
{
  const data = Customizer.getData();
  const serialized = JSON.stringify(data);
  const parsed = JSON.parse(serialized);

  assert(typeof parsed.visual === 'object' && parsed.visual !== null, 'TEST 18: WishMagicData.visual is valid JSON object');
  assert(parsed.visual.theme === 'romantic', 'TEST 18: Deserialized theme matches');
  assert(parsed.visual.colors.primary === '#8B5CF6', 'TEST 18: Deserialized color override matches');
}

// TEST 19: Accessibility Attributes in Generated HTML (Spec 71)
{
  const html = Customizer.renderVisualManagerHTML();
  assert(html.includes('aria-pressed="'), 'TEST 19: Theme selection button includes aria-pressed attribute');
  assert(html.includes('aria-label="'), 'TEST 19: Visual controls include aria-label for screen readers');
  assert(html.includes('type="color"'), 'TEST 19: Accessible color picker included');
}

console.log(`🎉 Part 6 Theme & Visual Customization Test Suite Completed: ${passed} assertions passed.`);
