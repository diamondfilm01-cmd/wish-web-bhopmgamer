/**
 * WishMagic Enterprise Customizer UX, State, Variants, Navigation, Preview & Accessibility Test Suite
 * Covers Stages 2–10 of the Enterprise Customizer Overhaul
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const customizeHtml = fs.readFileSync(path.join(ROOT_DIR, 'public/customize.html'), 'utf8');
const customizeEngineCode = fs.readFileSync(path.join(ROOT_DIR, 'public/js/customize-engine.js'), 'utf8');
const fieldRendererCode = fs.readFileSync(path.join(ROOT_DIR, 'public/js/wishmagic-field-renderer.js'), 'utf8');

/**
 * Lightweight DOM + Browser Sandbox Harness for testing customize-engine.js behavior deterministically
 */
function createCustomizerSandbox(options = {}) {
  const elementsById = new Map();
  const storageMap = new Map();
  const toasts = [];
  const postMessages = [];

  function makeEl(id = '', tagName = 'DIV') {
    const classSet = new Set();
    const attrs = new Map();
    const children = [];
    const listeners = new Map();
    let _id = id;
    const el = {
      get id() { return _id; },
      set id(val) {
        _id = String(val || '');
        if (_id) elementsById.set(_id, el);
      },
      tagName: tagName.toUpperCase(),
      value: '',
      checked: false,
      disabled: false,
      tabIndex: 0,
      textContent: '',
      _innerHTML: '',
      get innerHTML() {
        return this._innerHTML;
      },
      set innerHTML(val) {
        this._innerHTML = String(val || '');
      },
      style: { display: 'block', width: '', height: '', maxWidth: '', borderRadius: '', transform: '', transformOrigin: '' },
      parentElement: null,
      children,
      classList: {
        add(...cls) { cls.forEach(c => c && classSet.add(c)); },
        remove(...cls) { cls.forEach(c => classSet.delete(c)); },
        contains(c) { return classSet.has(c); },
        toggle(c, force) {
          if (force === true) classSet.add(c);
          else if (force === false) classSet.delete(c);
          else if (classSet.has(c)) classSet.delete(c);
          else classSet.add(c);
        }
      },
      get className() {
        return Array.from(classSet).join(' ');
      },
      set className(str) {
        classSet.clear();
        String(str || '').split(/\s+/).filter(Boolean).forEach(c => classSet.add(c));
      },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      hasAttribute(k) { return attrs.has(k); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(child) {
        if (child && typeof child === 'object') {
          child.parentElement = el;
          children.push(child);
        }
        return child;
      },
      remove() {},
      focus() { sandbox.document.activeElement = el; },
      select() {},
      click() {
        if (typeof el.onclick === 'function') el.onclick({ target: el, preventDefault() {} });
        const list = listeners.get('click') || [];
        list.forEach(fn => fn({ target: el, preventDefault() {} }));
      },
      addEventListener(evt, fn) {
        if (!listeners.has(evt)) listeners.set(evt, []);
        listeners.get(evt).push(fn);
      },
      closest(sel) {
        if (sel === 'div') return el.parentElement || makeEl('', 'DIV');
        if (sel === '.glass-surface') return el.parentElement || el;
        return el.parentElement;
      },
      querySelector(sel) {
        if (sel === 'label') {
          if (!el._labelEl) el._labelEl = makeEl(id + '-label', 'LABEL');
          return el._labelEl;
        }
        if (sel.startsWith('[data-field-key=')) {
          const m = sel.match(/\[data-field-key="([^"]+)"\]/);
          if (m) return children.find(c => c.getAttribute && c.getAttribute('data-field-key') === m[1]) || null;
        }
        return null;
      },
      querySelectorAll(sel) {
        if (sel === '[data-step1-tab]') return step1Cards;
        if (sel === '[data-step2-tab]') return step2Cards;
        if (sel === '[data-field-key]') return children.filter(c => c.getAttribute && c.getAttribute('data-field-key'));
        if (sel === '[data-field-section]') return children.filter(c => c.getAttribute && c.getAttribute('data-field-section'));
        return [];
      }
    };
    if (id) elementsById.set(id, el);
    return el;
  }

  // Register standard Customizer DOM elements
  const baseIds = [
    'customizer-template-name', 'customizer-tier-badge', 'customizer-category-name',
    'btn-header-continue', 'btn-back-to-preview', 'autosave-indicator',
    'step-tab-1', 'step-tab-2', 'step-tab-3', 'step-tab-4',
    'step-check-1', 'step-check-2', 'step-check-3', 'step-check-4',
    'step-num-1', 'step-num-2', 'step-num-3', 'step-num-4',
    'step-content-1', 'step-content-2', 'step-content-3', 'step-content-4',
    'btn-step-prev', 'btn-step-next', 'step-indicator-text',
    'step-1-validation-error',
    'level-tab-btn-quick', 'level-tab-btn-personal', 'level-tab-btn-advanced',
    'customizer-progress-bar', 'customizer-progress-text',
    'step1-subtab-btn-basic', 'step1-subtab-btn-template', 'step1-subtab-btn-photos', 'step1-subtab-btn-audio', 'step1-subtab-btn-all',
    'step1-progress-pill', 'step1-footer-card-label', 'btn-step1-prev-card', 'btn-step1-next-card',
    'subtab-state-badge-photos', 'subtab-state-badge-audio',
    'step2-subtab-btn-colors', 'step2-subtab-btn-fonts', 'step2-subtab-btn-fx', 'step2-subtab-btn-all',
    'input-recipient', 'input-sender', 'input-date', 'input-contact', 'input-occasion', 'input-relationship', 'input-message',
    'input-recipient-error', 'input-date-error', 'message-char-count',
    'btn-reset-variant-defaults',
    'template-dynamic-fields-container', 'dynamic-template-fields-card', 'dynamic-fields-count-badge', 'dynamic-fields-section-navigator',
    'photo-dropzone', 'step1-card-photos', 'gallery-layout-selector', 'template-photo-slots-manager',
    'voice-note-section-wrapper', 'music-section-wrapper',
    'sandbox-device-frame', 'sandbox-iframe-container', 'live-custom-iframe',
    'btn-view-desktop', 'btn-view-tablet', 'btn-view-mobile', 'device-frame-notch', 'device-frame-browserbar',
    'color-primary-input', 'hex-primary-label', 'color-secondary-input', 'hex-secondary-label', 'color-accent-input', 'hex-accent-label'
  ];
  baseIds.forEach(id => {
    const el = makeEl(id, id.startsWith('input-') ? 'INPUT' : 'DIV');
    const wrap = makeEl(id + '-wrapper', 'DIV');
    wrap.appendChild(el);
  });

  // Configure step1 cards with [data-step1-tab]
  const cardBasic = makeEl('step1-card-basic', 'DIV');
  cardBasic.setAttribute('data-step1-tab', 'basic');
  const cardTemplate = elementsById.get('dynamic-template-fields-card');
  cardTemplate.setAttribute('data-step1-tab', 'template');
  const cardPhotos = elementsById.get('step1-card-photos');
  cardPhotos.setAttribute('data-step1-tab', 'photos');
  const photoDropzone = elementsById.get('photo-dropzone');
  photoDropzone.parentElement = cardPhotos;
  const cardVoice = elementsById.get('voice-note-section-wrapper');
  cardVoice.setAttribute('data-step1-tab', 'audio');
  const cardMusic = elementsById.get('music-section-wrapper');
  cardMusic.setAttribute('data-step1-tab', 'audio');
  const step1Cards = [cardBasic, cardTemplate, cardPhotos, cardVoice, cardMusic];

  const step2ColorCard = makeEl('step2-card-colors', 'DIV');
  step2ColorCard.setAttribute('data-step2-tab', 'colors');
  const step2FontCard = makeEl('step2-card-fonts', 'DIV');
  step2FontCard.setAttribute('data-step2-tab', 'fonts');
  const step2FxCard = makeEl('step2-card-fx', 'DIV');
  step2FxCard.setAttribute('data-step2-tab', 'fx');
  const step2Cards = [step2ColorCard, step2FontCard, step2FxCard];

  const iframeEl = elementsById.get('live-custom-iframe');
  iframeEl.contentWindow = {
    postMessage(msg) { postMessages.push(msg); },
    dispatchEvent() {}
  };
  iframeEl.contentDocument = {
    head: makeEl('iframe-head', 'HEAD'),
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(t) { return makeEl('', t); },
    dispatchEvent() {}
  };

  const sandbox = {
    console,
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { fn(); return 1; },
    confirm: () => true,
    URL,
    URLSearchParams,
    CustomEvent: class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } },
    HTMLElement: Object,
    localStorage: {
      getItem(k) { return storageMap.has(k) ? storageMap.get(k) : null; },
      setItem(k, v) { storageMap.set(k, String(v)); },
      removeItem(k) { storageMap.delete(k); }
    },
    fetch: options.fetch || (async () => ({
      ok: true,
      status: 200,
      async json() { return { success: true }; }
    })),
    document: {
      activeElement: null,
      body: makeEl('body', 'BODY'),
      getElementById(id) {
        return elementsById.get(id) || null;
      },
      createElement(tag) {
        return makeEl('', tag);
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {}
    },
    window: null
  };

  sandbox.window = sandbox;
  sandbox.window.innerWidth = options.innerWidth || 1280;
  sandbox.window.location = {
    href: options.url || 'https://wishmagic.live/customize.html?template=tpl_bro_code',
    search: new URL(options.url || 'https://wishmagic.live/customize.html?template=tpl_bro_code').search
  };
  sandbox.window.history = {
    replaceState() {}
  };
  sandbox.window.addEventListener = () => {};
  sandbox.window.WishAuth = options.WishAuth || {
    getCurrentUser: () => ({ id: 'guest' }),
    getSession: () => null
  };
  sandbox.window.WishMediaSystem = {
    ImageProcessor: {
      async processImageFile(file) { return { src: 'https://i.ibb.co/custom/' + (file?.name || 'photo.jpg') }; }
    },
    syncMediaToCustomData() {},
    normalizeMediaState: (d) => d.media || {},
    hydrateTemplateMedia() {}
  };

  vm.createContext(sandbox);
  vm.runInContext(fieldRendererCode, sandbox);
  vm.runInContext(customizeEngineCode, sandbox);

  // Override showToast to capture toast messages for assertions while preserving original behavior
  const origShowToast = sandbox.showToast;
  sandbox.showToast = function(msg) {
    toasts.push(msg);
    if (typeof origShowToast === 'function') origShowToast(msg);
  };
  sandbox.window.showToast = sandbox.showToast;

  // Run setup hooks
  vm.runInContext('setupStepNavigation(); initFormInputs();', sandbox);

  return {
    sandbox,
    elementsById,
    storageMap,
    toasts,
    postMessages,
    getState: () => vm.runInContext('currentCustomData', sandbox),
    setState: (patch) => vm.runInContext(`Object.assign(currentCustomData, ${JSON.stringify(patch)})`, sandbox),
    setActiveTemplate: (tpl) => vm.runInContext(`activeTemplate = ${JSON.stringify(tpl)}`, sandbox),
    getActiveTemplate: () => vm.runInContext('activeTemplate', sandbox)
  };
}

describe('Enterprise Customizer Overhaul — Stages 2 through 10 Verification Suite', () => {

  it('Stage 2: defines semantic design tokens (--cm-*), visible keyboard focus rings, and prefers-reduced-motion in customize.html', () => {
    const requiredTokens = [
      '--cm-primary:', '--cm-secondary:', '--cm-accent:',
      '--cm-bg:', '--cm-surface:', '--cm-border:',
      '--cm-text:', '--cm-text-muted:',
      '--cm-success:', '--cm-warning:', '--cm-error:',
      '--cm-focus-ring:'
    ];
    for (const token of requiredTokens) {
      assert.ok(customizeHtml.includes(token), `Expected customize.html to define design token ${token}`);
    }
    assert.ok(customizeHtml.includes(':focus-visible'), 'Expected visible keyboard focus ring rules');
    assert.ok(customizeHtml.includes('@media (prefers-reduced-motion: reduce)'), 'Expected reduced-motion media query');
  });

  it('Stage 3: provides Level A (Quick Customize), Level B (Personal Touch), and Level C (Advanced Style) over a single unified state without losing user input', () => {
    assert.ok(customizeHtml.includes('id="customization-levels-card"'), 'Expected 3-level progressive customization card');
    assert.ok(customizeHtml.includes('id="level-tab-btn-quick"'), 'Expected Level A Quick Customize tab button');
    assert.ok(customizeHtml.includes('id="level-tab-btn-personal"'), 'Expected Level B Personal Touch tab button');
    assert.ok(customizeHtml.includes('id="level-tab-btn-advanced"'), 'Expected Level C Advanced Style tab button');
    assert.ok(customizeHtml.includes('Applies to Recipient\'s Wish Page'), 'Expected clear distinction between Wish Website Theme and Editor Theme');

    const { sandbox, getState } = createCustomizerSandbox();
    sandbox.setActiveTemplate = {
      id: 'tpl_bro_code',
      name: 'BRO CODE',
      manifest: {
        fields: [
          { id: 'recipient_name', type: 'text', required: true },
          { id: 'event_date', type: 'date', required: true },
          { id: 'hero_title', type: 'text', defaultValue: 'THE UNBREAKABLE CODE' },
          { id: 'photo_1', type: 'image', defaultValue: 'assets/cover.jpg' }
        ],
        capabilities: ['photos', 'music', 'countdown']
      }
    };
    vm.runInContext(`activeTemplate = ${JSON.stringify(sandbox.setActiveTemplate)}; applyUtpTemplateCapabilityGating(activeTemplate); renderDynamicTemplateFields(activeTemplate);`, sandbox);

    // Enter data in Level A (Quick Customize)
    sandbox.window.switchCustomizationLevel('quick');
    sandbox.window.handleRecipientInput('Aarav');
    sandbox.window.handleSenderInput('Kabir');
    sandbox.window.handleDateInput('2026-12-25');

    // Switch to Level B (Personal Touch) and Level C (Advanced Style) and back to Level A
    sandbox.window.switchCustomizationLevel('personal');
    assert.equal(sandbox.window._activeCustomizationLevel, 'personal');
    sandbox.window.switchCustomizationLevel('advanced');
    assert.equal(sandbox.window._activeCustomizationLevel, 'advanced');
    sandbox.window.switchCustomizationLevel('quick');
    assert.equal(sandbox.window._activeCustomizationLevel, 'quick');

    // Verify zero data loss across level switches
    const state = getState();
    assert.equal(state.recipient_name, 'Aarav');
    assert.equal(state.sender_name, 'Kabir');
    assert.equal(state.event_date, '2026-12-25');
  });

  it('Stage 3 (Level B Photos): progressively discloses extra photo slots via "Add More Photos" when template has > 2 slots', () => {
    const { sandbox, elementsById } = createCustomizerSandbox();
    const tplWith4Photos = {
      id: 'tpl_album_4',
      name: 'Memory Album',
      manifest: {
        fields: [
          { id: 'recipient_name', type: 'text', required: true },
          { id: 'photo_1', type: 'image', label: 'Main Hero Photo', defaultValue: 'p1.jpg' },
          { id: 'photo_2', type: 'image', label: 'Memory Photo 2', defaultValue: 'p2.jpg' },
          { id: 'photo_3', type: 'image', label: 'Memory Photo 3', defaultValue: 'p3.jpg' },
          { id: 'photo_4', type: 'image', label: 'Memory Photo 4', defaultValue: 'p4.jpg' }
        ],
        capabilities: ['photos', 'multiplePhotos', 'gallery']
      }
    };
    vm.runInContext(`activeTemplate = ${JSON.stringify(tplWith4Photos)}; window._showAllPhotoSlots = false; renderTemplatePhotoSlotsManager();`, sandbox);

    const managerHtmlCollapsed = elementsById.get('template-photo-slots-manager').innerHTML;
    assert.ok(managerHtmlCollapsed.includes('Main Hero Photo'), 'Primary photo slot is shown immediately');
    assert.ok(managerHtmlCollapsed.includes('Memory Photo 2'), 'Second photo slot is shown immediately');
    assert.ok(!managerHtmlCollapsed.includes('Memory Photo 4'), 'Slot 4 is progressively disclosed behind Add More Photos');
    assert.ok(managerHtmlCollapsed.includes('Add More Photos (2 More Slots)'), 'Shows Add More Photos button with accurate count');

    // Expand extra slots
    sandbox.window.toggleExpandExtraPhotoSlots();
    const managerHtmlExpanded = elementsById.get('template-photo-slots-manager').innerHTML;
    assert.ok(managerHtmlExpanded.includes('Memory Photo 3'), 'Slot 3 is visible after expanding');
    assert.ok(managerHtmlExpanded.includes('Memory Photo 4'), 'Slot 4 is visible after expanding');
  });

  it('Stage 4 (Defect B3): changing Relationship selector switches active variant on multi-variant templates while preserving user-modified fields', () => {
    const { sandbox, getState } = createCustomizerSandbox();
    const multiVariantTemplate = {
      id: 'bro-code-celebration',
      name: 'BRO CODE',
      manifest: {
        fields: [
          { id: 'recipient_name', type: 'text', required: true },
          { id: 'event_date', type: 'date', required: true },
          { id: 'hero_title', type: 'text', defaultValue: 'THE UNBREAKABLE CODE' },
          { id: 'custom_message', type: 'textarea', defaultValue: 'Default base wish' },
          { id: 'secret_note', type: 'textarea', defaultValue: 'Default secret' }
        ],
        capabilities: ['photos', 'music', 'countdown']
      },
      variants: [
        {
          id: 'var_best_friend',
          slug: 'best-friend',
          relationship: 'best_friend',
          relationshipSlug: 'best_friend',
          relationshipLabel: 'Best Friend',
          enabled: true,
          status: 'published',
          theme: { primary: '#f59e0b', secondary: '#8b5cf6' },
          messages: {
            hero_title: 'RIDE OR DIE: BEST FRIEND EDITION',
            custom_message: 'Best friend default message!',
            secret_note: 'Best friend secret rule #1'
          }
        },
        {
          id: 'var_brother',
          slug: 'brother',
          relationship: 'brother',
          relationshipSlug: 'brother',
          relationshipLabel: 'Brother',
          enabled: true,
          status: 'published',
          theme: { primary: '#06b6d4', secondary: '#3b82f6' },
          messages: {
            hero_title: 'BLOOD & LOYALTY: BROTHER EDITION',
            custom_message: 'Brother default message!',
            secret_note: 'Brother vault note'
          }
        }
      ]
    };

    vm.runInContext(`
      activeTemplate = ${JSON.stringify(multiVariantTemplate)};
      applyTemplateDefaults(activeTemplate);
      applySelectedVariantToCustomizer(activeTemplate.variants[0], true);
    `, sandbox);

    // User customizes recipient_name and secret_note, but leaves hero_title and custom_message at Best Friend defaults
    sandbox.window.handleRecipientInput('Vikram');
    vm.runInContext(`handleDynamicFieldChange('secret_note', 'My custom secret for Vikram', { id: 'secret_note' });`, sandbox);

    // Now user switches Relationship dropdown to 'brother'
    sandbox.window.handleRelationshipInput('brother');

    const state = getState();
    assert.equal(state.variantId, 'var_brother', 'Active variantId updated to var_brother');
    assert.equal(state.relationship, 'brother', 'Relationship updated to brother');
    assert.equal(state.recipient_name, 'Vikram', 'User-entered recipient_name preserved across variant switch');
    assert.equal(state.secret_note, 'My custom secret for Vikram', 'User-modified dynamic field preserved across variant switch');
    assert.equal(state.hero_title, 'BLOOD & LOYALTY: BROTHER EDITION', 'Unmodified hero_title updated to Brother variant default');
    assert.equal(state.colors.primary, '#06b6d4', 'Theme primary color updated to Brother variant palette');
  });

  it('Stage 4 (Defect B5): conditionally requires event_date only when the template supports date/countdown fields', () => {
    const { sandbox, elementsById } = createCustomizerSandbox();

    // Template WITHOUT date or countdown capability
    const datelessTemplate = {
      id: 'tpl_dateless_note',
      name: 'Simple Appreciation Note',
      manifest: {
        fields: [
          { id: 'recipient_name', type: 'text', required: true },
          { id: 'custom_message', type: 'textarea', required: false }
        ],
        capabilities: ['themes']
      }
    };

    vm.runInContext(`
      activeTemplate = ${JSON.stringify(datelessTemplate)};
      currentCustomData.recipient_name = 'Ananya';
      currentCustomData.event_date = '';
      applyUtpTemplateCapabilityGating(activeTemplate);
    `, sandbox);

    assert.equal(sandbox.window.templateRequiresEventDate(datelessTemplate), false, 'Dateless template does not require event_date');
    const dateInput = elementsById.get('input-date');
    assert.ok(dateInput.parentElement.classList.contains('hidden'), 'Date input wrapper is hidden for dateless template');

    const validWithoutDate = vm.runInContext('validateStep1()', sandbox);
    assert.equal(validWithoutDate, true, 'validateStep1 passes without user-entered date on dateless template');
    assert.ok(vm.runInContext('currentCustomData.event_date', sandbox).length > 0, 'Fallback ISO date is prefilled for backend compatibility');
  });

  it('Stage 5 (Defect B2): capability-aware subtab navigation hides unsupported subtabs and never un-hides unsupported photo/audio cards', () => {
    const { sandbox, elementsById } = createCustomizerSandbox();

    // Template with NO photos, NO voice, NO music, and NO extra dynamic fields
    const minimalTemplate = {
      id: 'tpl_text_only',
      name: 'Minimalist Text Card',
      manifest: {
        fields: [
          { id: 'recipient_name', type: 'text', required: true },
          { id: 'event_date', type: 'date', required: true },
          { id: 'custom_message', type: 'textarea', required: false }
        ],
        capabilities: ['countdown']
      }
    };

    vm.runInContext(`
      activeTemplate = ${JSON.stringify(minimalTemplate)};
      currentCustomData.sections = [];
      applyUtpTemplateCapabilityGating(activeTemplate);
      renderDynamicTemplateFields(activeTemplate);
      window.switchStep1SubTab('photos');
    `, sandbox);

    const availTabs = sandbox.window.getAvailableStep1SubTabs();
    assert.deepEqual(Array.from(availTabs), ['basic'], 'Only basic subtab is available for minimal text-only template');
    assert.equal(sandbox.window._activeStep1SubTab, 'basic', 'Requesting unavailable photos subtab safely falls back to basic');
    assert.ok(elementsById.get('step1-subtab-btn-photos').classList.contains('hidden'), 'Photos subtab button is hidden');
    assert.ok(elementsById.get('step1-subtab-btn-audio').classList.contains('hidden'), 'Audio subtab button is hidden');
    assert.ok(elementsById.get('step1-card-photos').classList.contains('hidden'), 'Photos card stays hidden');
    assert.ok(elementsById.get('voice-note-section-wrapper').classList.contains('hidden'), 'Voice card stays hidden');
    assert.ok(elementsById.get('music-section-wrapper').classList.contains('hidden'), 'Music card stays hidden');

    // Even when switching to 'all', unsupported cards remain hidden!
    sandbox.window.switchStep1SubTab('all');
    assert.ok(elementsById.get('step1-card-photos').classList.contains('hidden'), 'Photos card stays hidden even in Show All mode');
    assert.ok(elementsById.get('voice-note-section-wrapper').classList.contains('hidden'), 'Voice card stays hidden even in Show All mode');
    assert.ok(elementsById.get('music-section-wrapper').classList.contains('hidden'), 'Music card stays hidden even in Show All mode');
  });

  it('Stage 7 (Defects B1, B4, B6): scopes local draft keys by variant, prevents false manual save toasts on server error, and resets all state cleanly', async () => {
    // Configure fetch to simulate server 500 error for authenticated user
    const { sandbox, storageMap, toasts, getState } = createCustomizerSandbox({
      WishAuth: {
        getCurrentUser: () => ({ id: 'usr_123', email: 'test@example.com' }),
        getSession: () => ({ token: 'tok_abc' })
      },
      fetch: async () => ({
        ok: false,
        status: 500,
        async json() { return { success: false, message: 'Server database error' }; }
      })
    });

    const variantTpl = {
      id: 'bro-code-celebration',
      name: 'BRO CODE',
      selectedVariant: { id: 'var_brother', slug: 'brother', relationshipSlug: 'brother', relationshipLabel: 'Brother' },
      manifest: {
        fields: [
          { id: 'recipient_name', type: 'text', required: true },
          { id: 'hero_title', type: 'text', defaultValue: 'BROTHER EDITION' }
        ],
        capabilities: ['photos']
      }
    };

    vm.runInContext(`
      activeTemplate = ${JSON.stringify(variantTpl)};
      applyTemplateDefaults(activeTemplate);
      applySelectedVariantToCustomizer(activeTemplate.selectedVariant, true);
      currentCustomData.recipient_name = 'Rohan';
      currentCustomData._hiddenSections = ['gallery'];
      currentCustomData._hiddenFields = ['photo_2'];
      currentCustomData.media.photos = [{ id: 'p_custom', src: 'https://i.ibb.co/123/custom.jpg' }];
    `, sandbox);

    // 1. Verify variant-scoped storage key (Defect B1)
    const expectedKey = sandbox.window.getLocalDraftStorageKey();
    assert.equal(expectedKey, 'wishmagic_draft_bro-code-celebration_var_brother');

    // 2. Manual save when server fails must NOT show false success toast (Defect B4)
    toasts.length = 0;
    const saveResult = await sandbox.window.saveDraftLocally(true);
    assert.equal(saveResult, false, 'saveDraftLocally returns false when server save fails');
    assert.ok(storageMap.has(expectedKey), 'Draft is still preserved locally under the variant-scoped key');
    assert.ok(!toasts.some(t => t.includes('Draft saved successfully')), 'Did NOT emit false success toast on server failure');
    assert.ok(toasts.some(t => t.includes('cloud sync failed')), 'Emitted accurate local-only warning toast');

    // 3. Reset all changes clears variant draft key, media.photos, _hiddenSections, and _hiddenFields (Defect B6)
    sandbox.window.resetCustomizerChanges(true);
    const resetState = getState();
    assert.equal(storageMap.has(expectedKey), false, 'Variant-scoped draft key removed from localStorage on reset');
    assert.equal(resetState.recipient_name, '', 'Recipient name cleared on reset');
    assert.deepEqual(Array.from(resetState._hiddenSections), [], '_hiddenSections cleared on reset');
    assert.deepEqual(Array.from(resetState._hiddenFields), [], '_hiddenFields cleared on reset');
    assert.deepEqual(Array.from(resetState.media.photos), [], 'media.photos cleared on reset');
    assert.equal(resetState.hero_title, 'BROTHER EDITION', 'Dynamic field restored to variant default value');
  });

  it('Stage 6 & 8: provides sandbox preview loading/error recovery and sets ARIA attributes on validation errors', () => {
    const { sandbox, elementsById } = createCustomizerSandbox();
    vm.runInContext(`
      activeTemplate = { id: 'tpl_glitter_birthday', name: 'Glitter Birthday', entryFile: 'index.html' };
      currentCustomData.recipient_name = '';
      currentCustomData.event_date = '';
      loadTemplateInSandbox();
    `, sandbox);

    const sandboxHtml = elementsById.get('sandbox-iframe-container').innerHTML;
    assert.ok(sandboxHtml.includes('id="sandbox-loading-overlay"'), 'Preview container renders loading indicator overlay');
    assert.ok(sandboxHtml.includes('id="sandbox-error-overlay"'), 'Preview container includes recoverable error overlay with Retry button');

    // Trigger Step 1 validation failure and check ARIA attributes
    const isValid = vm.runInContext('validateStep1()', sandbox);
    assert.equal(isValid, false);
    const recInput = elementsById.get('input-recipient');
    const errBox = elementsById.get('step-1-validation-error');
    assert.equal(recInput.getAttribute('aria-invalid'), 'true', 'Invalid input marked with aria-invalid="true"');
    assert.equal(recInput.getAttribute('aria-describedby'), 'input-recipient-error', 'Invalid input linked via aria-describedby');
    assert.equal(errBox.getAttribute('role'), 'alert', 'Validation summary banner has role="alert"');

    // Fixing recipient_name clears aria-invalid on #input-recipient
    sandbox.window.handleRecipientInput('Priya');
    assert.equal(recInput.getAttribute('aria-invalid'), 'false', 'Entering recipient name clears aria-invalid');
  });


  it('Stage 4 Edge Cases: handles empty schemas, malformed metadata, disabled fields, and disabled parent sections gracefully', () => {
    const { sandbox, elementsById } = createCustomizerSandbox();

    // 1. Malformed metadata (fields is not an array, null entries, disabled parent section)
    const malformedTpl = {
      id: 'tpl_malformed',
      name: 'Malformed Test',
      disabledIds: ['secret_vault'],
      manifest: {
        fields: [
          null,
          { id: '', type: 'text' },
          { id: 'disabled_field', type: 'text', disabled: true, defaultValue: 'Hidden' },
          { id: 'vault_code', type: 'text', section: 'secret_vault', defaultValue: '1234' },
          { id: 'valid_quote', type: 'text', section: 'hero', label: 'Hero Quote', defaultValue: 'Shine bright' }
        ]
      }
    };

    vm.runInContext(`
      activeTemplate = ${JSON.stringify(malformedTpl)};
      renderDynamicTemplateFields(activeTemplate);
    `, sandbox);

    const badgeText = elementsById.get('dynamic-fields-count-badge').textContent;
    assert.equal(badgeText, '1 Field', 'Only the single valid, non-disabled field in an enabled section is rendered');

    // 2. Completely empty schema
    const emptyTpl = {
      id: 'tpl_empty_schema',
      name: 'Empty Schema Test',
      manifest: { fields: 'not-an-array' }
    };
    vm.runInContext(`
      activeTemplate = ${JSON.stringify(emptyTpl)};
      currentCustomData.sections = [{ id: 'hero', name: 'Hero', required: true, enabled: true }];
      renderDynamicTemplateFields(activeTemplate);
    `, sandbox);
    assert.equal(elementsById.get('dynamic-fields-count-badge').textContent, '1 Sections', 'Empty schema falls back to section toggles without throwing');
  });

  it('Stage 5 Navigation: step1NavigateCard steps only through available sections and advances to Step 2 on the last section without trapping the user', () => {
    const { sandbox } = createCustomizerSandbox();
    const photoOnlyTemplate = {
      id: 'tpl_photo_only',
      name: 'Photo Card',
      manifest: {
        fields: [
          { id: 'recipient_name', type: 'text', required: true },
          { id: 'event_date', type: 'date', required: true },
          { id: 'photo_1', type: 'image', defaultValue: 'cover.jpg' }
        ],
        capabilities: ['photos', 'countdown']
      }
    };

    vm.runInContext(`
      activeTemplate = ${JSON.stringify(photoOnlyTemplate)};
      currentCustomData.sections = [];
      currentCustomData.recipient_name = 'Kabir';
      currentCustomData.event_date = '2026-12-25';
      applyUtpTemplateCapabilityGating(activeTemplate);
      renderDynamicTemplateFields(activeTemplate);
      window.goToStep(1);
      window.switchStep1SubTab('basic');
    `, sandbox);

    const avail = Array.from(sandbox.window.getAvailableStep1SubTabs());
    assert.deepEqual(avail, ['basic', 'photos'], 'Available subtabs are basic and photos (template and audio skipped)');

    // Step forward from basic -> photos
    sandbox.window.step1NavigateCard(1);
    assert.equal(sandbox.window._activeStep1SubTab, 'photos', 'Advanced from basic to photos');

    // Step forward from last available subtab (photos) -> advances to Step 2 without trapping user
    sandbox.window.step1NavigateCard(1);
    assert.equal(vm.runInContext('currentStep', sandbox), 2, 'Advancing past the last available subtab moves to Step 2');
  });

  it('Stage 6 Live Preview: syncDataToIframe dispatches WISHMAGIC_LIVE_UPDATE with complete state, visibility, and actions payload', () => {
    const { sandbox, postMessages } = createCustomizerSandbox();
    const tpl = {
      id: 'bro-code-celebration',
      slug: 'bro-code-celebration',
      name: 'BRO CODE',
      visibilityMap: { hero: true, secret_message: false },
      disabledIds: ['secret_message'],
      actions: [{ id: 'hero_cta', label: 'Make For Yours', type: 'template_link', logicalLink: 'template.customize' }]
    };

    vm.runInContext(`
      activeTemplate = ${JSON.stringify(tpl)};
      currentCustomData.recipient_name = 'Dev';
      currentCustomData.sender_name = 'Arjun';
      currentCustomData._hiddenSections = ['gallery'];
      currentCustomData._hiddenFields = ['photo_3'];
    `, sandbox);

    postMessages.length = 0;
    vm.runInContext('syncDataToIframe()', sandbox);

    const liveMsg = postMessages.find(m => m && m.type === 'WISHMAGIC_LIVE_UPDATE');
    assert.ok(liveMsg, 'Dispatched WISHMAGIC_LIVE_UPDATE postMessage to preview iframe');
    assert.equal(liveMsg.payload.recipient_name, 'Dev');
    assert.equal(liveMsg.payload.sender_name, 'Arjun');
    assert.deepEqual(Array.from(liveMsg.payload._hiddenSections), ['gallery']);
    assert.deepEqual(Array.from(liveMsg.payload._hiddenFields), ['photo_3']);
    assert.equal(liveMsg.payload.actions[0].id, 'hero_cta');
  });

  it('Stage 7 Concurrency Recovery: detects HTTP 409 CONCURRENCY_CONFLICT during saveDraftLocally and renders conflict resolution banner', async () => {
    const { sandbox, elementsById } = createCustomizerSandbox({
      WishAuth: {
        getCurrentUser: () => ({ id: 'usr_999', email: 'creator@example.com' }),
        getSession: () => ({ token: 'tok_999' })
      },
      fetch: async () => ({
        ok: false,
        status: 409,
        async json() {
          return {
            success: false,
            currentLockVersion: 5,
            error: { code: 'CONCURRENCY_CONFLICT', message: 'Draft modified in another tab' }
          };
        }
      })
    });

    vm.runInContext(`
      activeTemplate = { id: 'tpl_glitter_birthday', name: 'Glitter Birthday' };
      currentEditingWishId = 'wish_conflict_1';
      currentLockVersion = 2;
      currentCustomData.recipient_name = 'Meera';
    `, sandbox);

    const ok = await sandbox.window.saveDraftLocally(false);
    assert.equal(ok, false, 'saveDraftLocally returns false on HTTP 409 conflict');
    const banner = elementsById.get('draft-concurrency-conflict-banner');
    assert.ok(banner, 'Rendered #draft-concurrency-conflict-banner for user recovery');
    assert.ok(banner.innerHTML.includes('Reload Remote Draft'), 'Conflict banner offers Reload Remote Draft action');
    assert.ok(banner.innerHTML.includes('Keep Local & Overwrite'), 'Conflict banner offers Keep Local & Overwrite action');
  });

});
