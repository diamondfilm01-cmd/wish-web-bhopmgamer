// WishMagic Universal Advanced Customizer & Real-Time Live Sandbox Engine
// Part 3: Advanced Wish Customizer

let activeTemplate = null;
let currentStep = 1;
const TOTAL_STEPS = 4;

let currentEditingWishId = null;
let currentEditingWishSlug = null;
let currentLockVersion = 1;
let currentSlugSuggestions = [];
let isShowingAllSlugSuggestions = false;
let slugCheckDebounceTimer = null;
let lastCheckedSlug = '';
let lastSlugCheckResult = null;

// Stage 5 State Management & Concurrency Tracking
let currentCustomizerRevision = 0;
let lastSavedRevision = 0;
let isSaveInProgress = false;
let pendingSaveAfterInFlight = false;
let customizerTemplateLoadGeneration = 0;

// Map of template default values so uncustomized messages/texts always stay as normal template text
let templateDefaultValues = {};
window._userModifiedFields = new Set();
window._activeCustomizationLevel = 'quick'; // 'quick' (Level A) | 'personal' (Level B) | 'advanced' (Level C)
window._showAllPhotoSlots = false;
window._customizerCapabilities = {
  supportsAnyPhoto: true,
  supportsMultiGallery: true,
  supportsVoice: true,
  supportsMusic: true,
  supportsDate: true,
  hasDynamicFields: false
};

function templateRequiresEventDate(tpl = activeTemplate) {
  if (!tpl) return true;
  const manifest = (tpl.manifest && typeof tpl.manifest === 'object') ? tpl.manifest : null;
  const rawFields = (manifest && Array.isArray(manifest.fields) && manifest.fields.length > 0)
    ? manifest.fields
    : (Array.isArray(tpl.detectedFields) && tpl.detectedFields.length > 0
      ? tpl.detectedFields
      : (Array.isArray(tpl.fields) ? tpl.fields : []));
  const hasExplicitUtpSchema = Boolean(
    (manifest && Array.isArray(manifest.fields) && manifest.fields.length > 0) ||
    (Array.isArray(tpl.detectedFields) && tpl.detectedFields.length > 0)
  );
  if (!hasExplicitUtpSchema) return true;

  const capsList = Array.isArray(manifest?.capabilities)
    ? manifest.capabilities
    : (Array.isArray(tpl.capabilities) ? tpl.capabilities : []);
  const capsObj = (!Array.isArray(manifest?.capabilities) && typeof manifest?.capabilities === 'object' && manifest?.capabilities)
    ? manifest.capabilities
    : ((!Array.isArray(tpl.capabilities) && typeof tpl.capabilities === 'object' && tpl.capabilities) ? tpl.capabilities : {});
  const hasCountdownCap = capsList.includes('countdown') || Boolean(capsObj.countdown);

  const dateKeys = new Set(['event_date', 'eventdate', 'dob', 'birth_date', 'celebration_date']);
  const hasDateField = rawFields.some(f => {
    if (!f || f.disabled === true || f.enabled === false) return false;
    const k = String(f.id || f.key || '').trim().toLowerCase();
    const t = String(f.type || '').trim().toLowerCase();
    return dateKeys.has(k) || t === 'date' || t === 'datetime';
  });
  return hasDateField || hasCountdownCap;
}

function isMandatoryIdentityField(key, tpl = activeTemplate) {
  const k = String(key || '').trim().toLowerCase();
  if (k === 'recipient_name' || k === 'recipientname') return true;
  if (k === 'event_date' || k === 'eventdate' || k === 'dob' || k === 'birth_date' || k === 'celebration_date') {
    return templateRequiresEventDate(tpl);
  }
  return false;
}

function getLocalDraftStorageKey(tpl = activeTemplate, variantOverride = null) {
  const tplId = (tpl && tpl.id) ? tpl.id : (typeof tpl === 'string' ? tpl : 'default');
  const activeVar = variantOverride || (tpl && tpl.selectedVariant) || null;
  const varId = (activeVar && activeVar.id) ? activeVar.id : (currentCustomData && currentCustomData.variantId ? currentCustomData.variantId : '');
  return varId ? `wishmagic_draft_${tplId}_${varId}` : `wishmagic_draft_${tplId}`;
}

window.getLocalDraftStorageKey = getLocalDraftStorageKey;
window.templateRequiresEventDate = templateRequiresEventDate;
window.isMandatoryIdentityField = isMandatoryIdentityField;

function ensureDefaultMessagesPreserved() {
  Object.entries(templateDefaultValues).forEach(([k, defVal]) => {
    if (!isMandatoryIdentityField(k) && defVal !== undefined && defVal !== null && String(defVal) !== '') {
      const cur = currentCustomData[k];
      if (cur === undefined || cur === null || (typeof cur === 'string' && cur.trim() === '')) {
        currentCustomData[k] = defVal;
      }
    }
  });
  if (!templateRequiresEventDate(activeTemplate) && (!currentCustomData.event_date || !String(currentCustomData.event_date).trim())) {
    currentCustomData.event_date = new Date().toISOString().split('T')[0];
  }
}

// Centralized Customizer State Model
let currentCustomData = {
  recipient_name: '',
  sender_name: '',
  sender_contact: '',
  occasion: 'birthday',
  relationship: '',
  customSlug: '',
  slug: '',
  event_date: '',
  custom_message: '',
  cover_photo: '',
  photos: [], // Array of { id, url, name, isCover, order }
  photo_1: '', // for backward compatibility with [data-wm="photo_1"]
  galleryLayout: 'grid', // 'grid' | 'polaroid' | 'carousel' | 'masonry'
  voice_note: { enabled: false, url: '', duration: '', recordingBlob: null },
  music: { enabled: true, trackId: 'celebration-strings', title: 'Celebration Acoustic Strings', url: '' },
  
  // Media System Centralized State Model (Part 5)
  media: {
    coverPhoto: null,
    photos: [], // Array of { id, name, src, order }
    music: {
      enabled: true,
      type: 'curated',
      name: 'Celebration Acoustic Strings',
      trackId: 'celebration-strings',
      src: '',
      genre: 'Indie Celebration',
      duration: '2:40'
    },
    voiceNote: {
      enabled: false,
      type: 'none',
      name: '',
      src: '',
      duration: 0
    },
    galleryLayout: 'grid'
  },
  
  // Theme Engine Centralized Configuration
  theme: 'magical', // magical, romantic, cute, elegant, royal, dark, pastel, celebration
  themeConfig: null, // hydrated dynamic config
  activePalette: 'rose-gold',
  colors: {
    primary: '#ec4899',
    secondary: '#8b5cf6',
    accent: '#fbbf24',
    background: 'radial-gradient(circle at 50% 15%, #2a0845 0%, #17042b 55%, #0d0118 100%)',
    surface: 'rgba(255, 255, 255, 0.12)',
    text: '#ffffff',
    mutedText: '#e9d5ff'
  },
  typography: {
    headingFont: 'Outfit, sans-serif',
    bodyFont: 'Plus Jakarta Sans, sans-serif',
    headingWeight: '800',
    fontStyle: 'normal',
    pairingId: 'modern'
  },
  font: 'modern', // modern, elegant, romantic, playful
  background: 'gradient', // gradient, glow, cosmic, solid
  surfaces: {
    style: 'glass',
    radius: 'rounded',
    radiusPx: '20px',
    blur: '20px',
    shadow: '0 20px 40px -10px rgba(139, 92, 246, 0.25)'
  },
  buttons: {
    style: 'gradient',
    radius: 'pill',
    radiusPx: '9999px',
    shadow: '0 10px 25px -5px rgba(236, 72, 153, 0.4)'
  },
  effects: {
    master: true,
    particles: true,
    particleType: 'sparkles',
    intensity: 'soft',
    glow: true,
    confetti: true,
    hearts: false
  },
  sections: [
    { id: 'hero', name: 'Hero Unboxing & Cake', enabled: true, order: 1, selector: '#cake-interactive, #sealed-state, .hero-section, #clock-hours' },
    { id: 'message', name: 'Heartfelt Dedication Letter', enabled: true, order: 2, selector: '[data-wm="custom_message"], .message-card, #revealed-state' },
    { id: 'gallery', name: 'Time-Capsule Photo Keepsake', enabled: true, order: 3, selector: '[data-wm="photo_1"], .memory-card, .photo-box' },
    { id: 'music', name: 'Background Soundscape', enabled: true, order: 4, selector: '#audio-player, .audio-widget' },
    { id: 'voice', name: 'Voice Dedication Note', enabled: false, order: 5, selector: '#voice-note-player, .voice-widget' },
    { id: 'countdown', name: 'Midnight Countdown Unlock', enabled: true, order: 6, selector: '#clock-hours, .countdown-wrapper' },
    { id: 'finale', name: 'Celebration Fireworks & Confetti', enabled: true, order: 7, selector: '#screen-confetti-layer, #confetti-layer' }
  ]
};

// Available Curated BGM Tracks
const CURATED_MUSIC_TRACKS = [
  { id: 'celebration-strings', title: 'Celebration Acoustic Strings', genre: 'Acoustic / Celebration', duration: '2:40' },
  { id: 'celestial-waltz', title: 'Celestial Waltz Violin & Strings', genre: 'Romantic / Classical', duration: '3:15' },
  { id: 'midnight-stardust', title: 'Midnight Stardust Chimes', genre: 'Cosmic / Electronic', duration: '2:10' },
  { id: 'acoustic-harmony', title: 'Acoustic Harmony Guitar', genre: 'Gentle / Melodic', duration: '2:50' },
  { id: 'upbeat-ukulele', title: 'Upbeat Indie Ukulele Party', genre: 'Playful / Cheerful', duration: '2:20' }
];

// Curated Theme Presets
const THEME_PRESETS = {
  magical: {
    name: 'Magical',
    primary: '#ec4899',
    secondary: '#8b5cf6',
    background: 'gradient',
    font: 'modern',
    effects: { master: true, particles: true, confetti: true, sparkles: true, hearts: false }
  },
  romantic: {
    name: 'Romantic',
    primary: '#f43f5e',
    secondary: '#fb7185',
    background: 'glow',
    font: 'romantic',
    effects: { master: true, particles: true, confetti: true, sparkles: true, hearts: true }
  },
  cute: {
    name: 'Cute',
    primary: '#f472b6',
    secondary: '#fbcfe8',
    background: 'gradient',
    font: 'playful',
    effects: { master: true, particles: true, confetti: true, sparkles: true, hearts: true }
  },
  elegant: {
    name: 'Elegant',
    primary: '#f59e0b',
    secondary: '#fbbf24',
    background: 'glow',
    font: 'elegant',
    effects: { master: true, particles: false, confetti: true, sparkles: true, hearts: false }
  },
  royal: {
    name: 'Royal',
    primary: '#7c3aed',
    secondary: '#f59e0b',
    background: 'cosmic',
    font: 'elegant',
    effects: { master: true, particles: true, confetti: true, sparkles: true, hearts: false }
  },
  dark: {
    name: 'Dark',
    primary: '#06b6d4',
    secondary: '#6366f1',
    background: 'cosmic',
    font: 'modern',
    effects: { master: true, particles: true, confetti: true, sparkles: true, hearts: false }
  },
  pastel: {
    name: 'Pastel',
    primary: '#a78bfa',
    secondary: '#f472b6',
    background: 'gradient',
    font: 'playful',
    effects: { master: true, particles: true, confetti: false, sparkles: true, hearts: false }
  },
  celebration: {
    name: 'Celebration',
    primary: '#e11d48',
    secondary: '#f59e0b',
    background: 'gradient',
    font: 'modern',
    effects: { master: true, particles: true, confetti: true, sparkles: true, hearts: false }
  }
};

// Audio Recorder State
let mediaRecorder = null;
let recordedAudioChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
let isRecordingAudio = false;

// Audio Preview Synthesizer State
let studioAudioCtx = null;
let isPlayingStudioMusic = false;

// Debounce helper for autosave
let autosaveTimeout = null;

function ensureCustomizerGoogleAuthGate() {
  if (!window.WishAuth) return;
  const checkAndRenderGate = () => {
    const isLogged = typeof window.WishAuth.isGoogleLoggedIn === 'function'
      ? window.WishAuth.isGoogleLoggedIn()
      : window.WishAuth.isAuthenticated();
    const existingGate = document.getElementById('wm-customizer-google-gate');
    if (isLogged) {
      if (existingGate) existingGate.remove();
      return true;
    }
    if (!existingGate) {
      const gate = document.createElement('div');
      gate.id = 'wm-customizer-google-gate';
      gate.className = 'fixed inset-0 z-[140] bg-black/80 backdrop-blur-lg flex items-center justify-center p-4';
      gate.innerHTML = `
        <div class="bg-white dark:bg-[#1f123e] rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border-2 border-purple-300 dark:border-purple-500/40 text-center flex flex-col items-center">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#a855f7] via-[#ec4899] to-[#f59e0b] text-white flex items-center justify-center mb-4 shadow-lg text-2xl">🔒</div>
          <span class="px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 text-[11px] font-extrabold mb-2">✨ Google Account Required</span>
          <h3 class="font-display font-extrabold text-xl sm:text-2xl text-purple-950 dark:text-white">Sign In to Customize Template</h3>
          <p class="text-xs sm:text-sm text-purple-800/80 dark:text-purple-200/80 mt-2 mb-6 leading-relaxed">
            Template customize karne aur apna personalized wish link banane ke liye pehle Google Account se login karna zaroori hai.
          </p>
          <button type="button" id="wm-gate-google-btn" class="w-full py-3.5 px-5 rounded-full bg-gradient-to-r from-[#ff2a85] via-[#ec4899] to-[#a855f7] hover:brightness-105 text-white font-extrabold text-sm shadow-xl flex items-center justify-center gap-3 transition active:scale-95 cursor-pointer">
            <span class="w-7 h-7 rounded-full bg-white flex items-center justify-center shrink-0">
              <svg class="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
            </span>
            <span>Continue with Google</span>
          </button>
          <a href="/templates.html" class="mt-4 text-xs font-bold text-purple-700 dark:text-purple-300 hover:underline">← Back to Templates Preview</a>
        </div>
      `;
      document.body.appendChild(gate);
      const btn = gate.querySelector('#wm-gate-google-btn');
      if (btn) {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.classList.add('opacity-75');
          try {
            const u = await window.WishAuth.signInWithGoogle();
            if (u) {
              gate.remove();
            }
          } catch (_) {}
          btn.disabled = false;
          btn.classList.remove('opacity-75');
        });
      }
    }
    return false;
  };

  if (typeof window.WishAuth.onAuthStateChange === 'function') {
    window.WishAuth.onAuthStateChange((user) => {
      if (user && user.id) {
        const g = document.getElementById('wm-customizer-google-gate');
        if (g) g.remove();
      }
    });
  }

  if (typeof window.WishAuth.isGoogleLoggedIn === 'function' && window.WishAuth.isGoogleLoggedIn()) {
    return;
  }
  if (typeof window.WishAuth.waitForAuthReady === 'function') {
    window.WishAuth.waitForAuthReady(1500).then(() => {
      checkAndRenderGate();
    });
  } else {
    checkAndRenderGate();
  }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  ensureCustomizerGoogleAuthGate();
  setupStepNavigation();
  initFormInputs();
  window._customizerViewportMode = window.innerWidth >= 1024 ? 'desktop' : 'mobile';

  const urlParams = new URLSearchParams(window.location.search);
  const cloneWishId = urlParams.get('clone') || urlParams.get('duplicate');
  const editWishId = urlParams.get('edit');
  const draftId = urlParams.get('draft');
  let templateId = urlParams.get('template') || urlParams.get('id') || 'tpl_glitter_birthday';

  if (cloneWishId) {
    try {
      const wishRes = await fetch(`/api/wishes/${encodeURIComponent(cloneWishId)}`, { credentials: 'include' });
      const wishResult = await wishRes.json();
      if (wishResult.success && wishResult.wish) {
        const clonedWish = wishResult.wish;
        templateId = clonedWish.templateId || templateId;
        await loadTemplateData(templateId);

        if (clonedWish.customData) {
          currentCustomData = {
            ...currentCustomData,
            ...clonedWish.customData,
            // Reset to a new target date for the new wish
            event_date: new Date().toISOString().split('T')[0]
          };
          populateFormValuesFromState();
          syncDataToIframe();
          showToast('Cloned into a new celebration wish ✨ (Old link remains expired)');
        }
      } else {
        await loadTemplateData(templateId);
      }
    } catch (e) {
      console.warn('Error cloning wish:', e);
      await loadTemplateData(templateId);
    }
  } else if (editWishId) {
    try {
      currentEditingWishId = editWishId;
      const wishRes = await fetch(`/api/wishes/${encodeURIComponent(editWishId)}`, { credentials: 'include' });
      const wishResult = await wishRes.json();
      if (wishResult.success && wishResult.wish) {
        const editWish = wishResult.wish;
        currentEditingWishId = editWish.id;
        currentLockVersion = Number(editWish.lock_version || editWish.lockVersion || 1);
        if (editWish.slug) {
          currentEditingWishSlug = editWish.slug;
          currentCustomData.customSlug = editWish.slug;
          currentCustomData.slug = editWish.slug;
        }
        templateId = editWish.templateId || templateId;
        await loadTemplateData(templateId);

        if (editWish.customData) {
          currentCustomData = {
            ...currentCustomData,
            ...editWish.customData,
            customSlug: editWish.slug || (editWish.customData && editWish.customData.customSlug) || currentCustomData.customSlug
          };
          populateFormValuesFromState();
          syncDataToIframe();
          showToast(`Editing wish for ${currentCustomData.recipient_name || 'Recipient'} ✏️`);
        }
      } else {
        await loadTemplateData(templateId);
      }
    } catch (e) {
      console.warn('Error loading wish for edit:', e);
      await loadTemplateData(templateId);
    }
  } else if (draftId) {
    try {
      currentEditingWishId = draftId;
      let targetDraft = null;

      // 1. First attempt to load real server draft
      try {
        const dRes = await fetch(`/api/wishes/${encodeURIComponent(draftId)}`, { credentials: 'include' });
        const dJson = await dRes.json();
        if (dJson && dJson.success && dJson.wish) {
          targetDraft = dJson.wish;
        }
      } catch (err) {}

      // 2. Fallback to local storage if offline or guest
      if (!targetDraft) {
        const rawDrafts = localStorage.getItem('wishmagic_drafts');
        const drafts = window.WishSecurity ? window.WishSecurity.safeJSONParse(rawDrafts, []) : JSON.parse(rawDrafts || '[]');
        targetDraft = Array.isArray(drafts) ? drafts.find(d => d.id === draftId) : null;
      }

      if (targetDraft) {
        templateId = targetDraft.templateId || templateId;
        currentLockVersion = Number(targetDraft.lock_version || targetDraft.lockVersion || 1);
        await loadTemplateData(templateId);
        if (targetDraft.customData) {
          currentCustomData = {
            ...currentCustomData,
            ...targetDraft.customData
          };
          populateFormValuesFromState();
          syncDataToIframe();
          showToast(`Restored draft for ${currentCustomData.recipient_name || 'Recipient'} 📝`);
        }
      } else {
        await loadTemplateData(templateId);
      }
    } catch (e) {
      console.warn('Error loading draft by id:', e);
      await loadTemplateData(templateId);
    }
  } else {
    await loadTemplateData(templateId);
  }

  setupStepNavigation();
  initFormInputs();
  renderPhotosUI();
  renderSectionsUI();

  // Stage 5: Warn before leaving with unsaved changes
  window.addEventListener('beforeunload', (e) => {
    if (currentCustomizerRevision > lastSavedRevision && !isPublishingInProgress) {
      e.preventDefault();
      e.returnValue = 'You have unsaved celebration edits. Are you sure you want to leave?';
      return e.returnValue;
    }
  });
});

function applySelectedVariantToCustomizer(variant, isInitialLoad = false) {
  if (!activeTemplate || !variant) return;
  activeTemplate.selectedVariant = variant;
  activeTemplate.entryFile = variant.entryFile || activeTemplate.entryFile || 'index.html';

  currentCustomData.variantId = variant.id;
  currentCustomData.variantSlug = variant.slug || variant.id;
  currentCustomData.relationship = variant.relationshipSlug || currentCustomData.relationship;
  currentCustomData.relationshipLabel = variant.relationshipLabel || variant.relationshipSlug;

  // Preserve selected variant and relation in URL for refresh & back navigation (Rule E)
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('template', activeTemplate.id);
    url.searchParams.set('variant', variant.id);
    url.searchParams.set('rel', variant.relationshipSlug);
    window.history.replaceState({}, '', url.toString());
  } catch (_) {}

  // Merge variant-specific fields and sections onto activeTemplate
  if (Array.isArray(variant.fields) && variant.fields.length > 0) {
    const baseFields = Array.isArray(activeTemplate._baseFields)
      ? activeTemplate._baseFields
      : (Array.isArray(activeTemplate.fields) ? [...activeTemplate.fields] : []);
    activeTemplate._baseFields = baseFields;
    const mergedMap = new Map();
    baseFields.forEach(f => {
      const k = String(f.id || f.key || '').trim();
      if (k) mergedMap.set(k, { ...f });
    });
    variant.fields.forEach(vf => {
      const k = String(vf.id || vf.key || '').trim();
      if (!k) return;
      if (vf.disabled === true || vf.enabled === false) {
        mergedMap.delete(k);
      } else if (mergedMap.has(k)) {
        mergedMap.set(k, { ...mergedMap.get(k), ...vf });
      } else {
        mergedMap.set(k, { ...vf });
      }
    });
    const mergedList = Array.from(mergedMap.values());
    activeTemplate.fields = mergedList;
    if (activeTemplate.manifest && typeof activeTemplate.manifest === 'object') {
      activeTemplate.manifest.fields = mergedList;
    }
  }

  if (Array.isArray(variant.sections) && variant.sections.length > 0) {
    activeTemplate.sections = variant.sections;
    if (activeTemplate.manifest && typeof activeTemplate.manifest === 'object') {
      activeTemplate.manifest.sections = variant.sections;
    }
  }

  // Apply variant messages, assets, and theme palette into defaults (preserving user-edited values)
  const userEditedSet = window._userModifiedFields instanceof Set ? window._userModifiedFields : new Set();
  if (variant.messages && typeof variant.messages === 'object') {
    Object.entries(variant.messages).forEach(([k, val]) => {
      if (val !== undefined && val !== null && String(val) !== '') {
        const prevDefault = templateDefaultValues[k];
        templateDefaultValues[k] = val;
        const curVal = currentCustomData[k];
        const isUnchangedFromDefault = !curVal || curVal === prevDefault || !userEditedSet.has(k);
        if (!isMandatoryIdentityField(k) && isUnchangedFromDefault) {
          currentCustomData[k] = val;
        }
      }
    });
    const varWish = variant.messages.custom_message || variant.messages.defaultWish || variant.messages.main_message;
    if (varWish) {
      const prevWishDef = templateDefaultValues.custom_message;
      templateDefaultValues.custom_message = varWish;
      if (!currentCustomData.custom_message || currentCustomData.custom_message === prevWishDef || !userEditedSet.has('custom_message')) {
        currentCustomData.custom_message = varWish;
      }
    }
  }

  if (variant.assets && typeof variant.assets === 'object') {
    Object.entries(variant.assets).forEach(([k, val]) => {
      if (val && typeof val === 'string') {
        templateDefaultValues[k] = val;
        if (!currentCustomData[k]) currentCustomData[k] = val;
      }
    });
  }

  const applyVariantPalette = () => {
    if (variant.theme && typeof variant.theme === 'object' && !currentCustomData._userOverrodePalette) {
      const pal = variant.theme.palette || variant.theme;
      if (pal.primary) currentCustomData.colors.primary = pal.primary;
      if (pal.secondary) currentCustomData.colors.secondary = pal.secondary;
      if (pal.accent) currentCustomData.colors.accent = pal.accent;
      if (pal.background) currentCustomData.colors.background = pal.background;
    }
  };
  applyVariantPalette();

  if (!isInitialLoad) {
    renderCustomizerHeader();
    applyUtpTemplateCapabilityGating(activeTemplate);
    renderDynamicTemplateFields(activeTemplate);
    populateFormValuesFromState();
    applyVariantPalette();
    loadTemplateInSandbox();
  }
}

// Load template metadata & check for saved local draft (UTP v1.1.0 Variant-Aware + Rule D / E / Flow J)
async function loadTemplateData(templateId) {
  const currentGen = ++customizerTemplateLoadGeneration;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const variantParam = urlParams.get('variant') || '';
    const relParam = urlParams.get('rel') || urlParams.get('relationship') || '';
    const qs = new URLSearchParams();
    if (variantParam) qs.set('variant', variantParam);
    if (relParam) qs.set('rel', relParam);
    const qsStr = qs.toString() ? `?${qs.toString()}` : '';

    const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}${qsStr}`);
    const data = await res.json();
    if (currentGen !== customizerTemplateLoadGeneration) return; // Stale request dropped

    if (data.success && data.template) {
      activeTemplate = data.template;
    } else {
      // Fallback: try fetching all templates
      const allRes = await fetch('/api/templates');
      const allData = await allRes.json();
      if (currentGen !== customizerTemplateLoadGeneration) return;
      if (allData.success && allData.templates && allData.templates.length > 0) {
        activeTemplate = allData.templates[0];
      }
    }

    if (!activeTemplate) {
      renderTemplateLoadErrorState(templateId, 'Could not load the selected template metadata.');
      return;
    }
    if (currentGen !== customizerTemplateLoadGeneration) return;

    // Flow J: Block invalid or unpublished variant IDs from bypassing availability checks
    if (activeTemplate.selectedVariantError === 'VARIANT_UNAVAILABLE') {
      if (window.WishMagicVariantFlow) {
        window.WishMagicVariantFlow.showUnavailableVariantNotice(activeTemplate, variantParam || relParam);
      }
      return;
    }

    let resolvedInitialVariant = activeTemplate.selectedVariant || null;
    let shouldPromptForVariant = false;
    let availVariantsForPrompt = [];

    if (window.WishMagicVariantFlow && window.WishMagicVariantFlow.isVariantFamily(activeTemplate) && !currentEditingWishId) {
      availVariantsForPrompt = window.WishMagicVariantFlow.getAvailablePublishedVariants(activeTemplate);
      const explicitRelOrVar = variantParam || relParam || window.WishMagicVariantFlow.getActiveRelationFilter();
      if (explicitRelOrVar) {
        const matched = window.WishMagicVariantFlow.resolveVariantForRelation(activeTemplate, explicitRelOrVar);
        if (!matched) {
          window.WishMagicVariantFlow.showUnavailableVariantNotice(activeTemplate, explicitRelOrVar);
          return;
        }
        resolvedInitialVariant = matched;
      } else if (availVariantsForPrompt.length === 1) {
        resolvedInitialVariant = availVariantsForPrompt[0];
      } else if (availVariantsForPrompt.length > 1) {
        shouldPromptForVariant = true;
      }
    }

    // Apply template defaults
    applyTemplateDefaults(activeTemplate);
    if (resolvedInitialVariant) {
      applySelectedVariantToCustomizer(resolvedInitialVariant, true);
    }

    // Check for existing local draft (scoped by variant via unified getLocalDraftStorageKey, with legacy fallback)
    const draftKey = getLocalDraftStorageKey(activeTemplate, resolvedInitialVariant);
    const legacyDraftKey = `wishmagic_draft_${activeTemplate.id}`;
    const rawSavedDraft = localStorage.getItem(draftKey) || (!resolvedInitialVariant ? localStorage.getItem(legacyDraftKey) : null);
    if (rawSavedDraft) {
      const parsed = window.WishSecurity ? window.WishSecurity.safeJSONParse(rawSavedDraft, null) : JSON.parse(rawSavedDraft);
      if (parsed && typeof parsed === 'object') {
        currentCustomData = { ...currentCustomData, ...parsed };
        if (resolvedInitialVariant) {
          currentCustomData.variantId = resolvedInitialVariant.id;
          currentCustomData.variantSlug = resolvedInitialVariant.slug || resolvedInitialVariant.id;
          currentCustomData.relationship = resolvedInitialVariant.relationshipSlug || currentCustomData.relationship;
          currentCustomData.relationshipLabel = resolvedInitialVariant.relationshipLabel || resolvedInitialVariant.relationshipSlug;
        }
        showToast('Restored your saved local draft ✨');
      }
    }

    if (currentGen !== customizerTemplateLoadGeneration) return;

    renderCustomizerHeader();
    await loadTemplateManifestIfNeeded(activeTemplate);
    if (currentGen !== customizerTemplateLoadGeneration) return;
    if (resolvedInitialVariant) {
      applySelectedVariantToCustomizer(resolvedInitialVariant, true);
    }

    applyUtpTemplateCapabilityGating(activeTemplate);
    renderDynamicTemplateFields(activeTemplate);
    populateFormValuesFromState();
    validateDraftEntitlements(currentCustomData);
    updateDevEntitlementUI();
    loadTemplateInSandbox();

    // Rule D: If multi-variant template opened in Customizer without a chosen relation, prompt immediately
    if (shouldPromptForVariant && availVariantsForPrompt.length > 1 && window.WishMagicVariantFlow) {
      window.WishMagicVariantFlow.showRelationSelectionModal(activeTemplate, availVariantsForPrompt, 'customize', {
        onSelectVariant: (chosen) => {
          applySelectedVariantToCustomizer(chosen, false);
        }
      });
    }

    if (typeof window.updateCustomizationProgressUI === 'function') {
      window.updateCustomizationProgressUI();
    }
  } catch (err) {
    console.error('Error loading template for customizer:', err);
    renderTemplateLoadErrorState(templateId, err && err.message ? err.message : 'Network error while loading template.');
  }
}

function renderTemplateLoadErrorState(templateId, errorMsg) {
  const titleEl = document.getElementById('customizer-template-name');
  if (titleEl) titleEl.textContent = 'Template Load Error';
  const errBox = document.getElementById('step-1-validation-error');
  if (errBox) {
    errBox.setAttribute('role', 'alert');
    errBox.setAttribute('aria-live', 'assertive');
    errBox.innerHTML = `
      <div class="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-800 dark:text-rose-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div class="flex items-start gap-2.5">
          <span class="material-symbols-outlined text-[20px] text-rose-500 shrink-0">error</span>
          <div>
            <p class="font-extrabold text-sm">Unable to load template "${escapeHtml(String(templateId || ''))}"</p>
            <p class="mt-0.5 opacity-90">${escapeHtml(String(errorMsg || 'Please check your connection and try again.'))}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" onclick="window.retryLoadTemplateData('${escapeHtml(String(templateId || ''))}')" class="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition cursor-pointer">
            Retry Load
          </button>
          <a href="/templates.html" class="px-3.5 py-2 rounded-xl bg-white/80 dark:bg-purple-900/60 text-purple-900 dark:text-purple-100 font-bold text-xs border border-purple-300/60 transition">
            Browse Templates
          </a>
        </div>
      </div>
    `;
    errBox.classList.remove('hidden');
  }
}

window.retryLoadTemplateData = function(tplId) {
  const errBox = document.getElementById('step-1-validation-error');
  if (errBox) errBox.classList.add('hidden');
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = tplId || urlParams.get('template') || urlParams.get('id') || 'tpl_glitter_birthday';
  loadTemplateData(targetId);
};

// -----------------------------------------------------------------------------
// PART 4: MANIFEST-DRIVEN UNIVERSAL CUSTOMIZER & DYNAMIC FIELDS ENGINE
// -----------------------------------------------------------------------------

async function loadTemplateManifestIfNeeded(template) {
  if (!template) return null;
  if (template.manifest && typeof template.manifest === 'object') {
    return template.manifest;
  }
  if (template.manifest_json) {
    try {
      template.manifest = typeof template.manifest_json === 'string' ? JSON.parse(template.manifest_json) : template.manifest_json;
      return template.manifest;
    } catch (e) {}
  }
  // Try fetching wishmagic.json from templates-store
  try {
    const folder = resolveCanonicalCustomizeFolder(template);
    const res = await fetch(`/templates-store/${folder}/wishmagic.json`);
    if (res.ok) {
      const manifest = await res.json();
      if (manifest && typeof manifest === 'object') {
        template.manifest = manifest;
        if (manifest.fields && Array.isArray(manifest.fields) && (!template.fields || template.fields.length === 0)) {
          template.fields = manifest.fields;
        }
        return manifest;
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Enforces strict UTP v1.0.0 capability & field gating so custom uploaded templates
 * ONLY display customization controls, media uploaders, and sections that they genuinely support.
 */
function applyUtpTemplateCapabilityGating(template) {
  if (!template) return;
  const manifest = (template.manifest && typeof template.manifest === "object")
    ? template.manifest
    : (typeof template.theme === "object" && template.theme && template.theme.fields ? template.theme : null);

  const rawFields = (manifest && Array.isArray(manifest.fields) && manifest.fields.length > 0)
    ? manifest.fields
    : (Array.isArray(template.detectedFields) && template.detectedFields.length > 0
      ? template.detectedFields
      : (Array.isArray(template.fields) ? template.fields : []));

  const hasExplicitUtpSchema = Boolean(
    (manifest && Array.isArray(manifest.fields) && manifest.fields.length > 0) ||
    (Array.isArray(template.detectedFields) && template.detectedFields.length > 0)
  );

  if (!hasExplicitUtpSchema) return;

  const fieldByKey = new Map();
  rawFields.forEach(f => {
    const k = String(f.id || f.key || "").trim();
    if (k) fieldByKey.set(k, f);
  });

  const capsList = Array.isArray(manifest?.capabilities)
    ? manifest.capabilities
    : (Array.isArray(template.capabilities) ? template.capabilities : []);
  const capsObj = (!Array.isArray(manifest?.capabilities) && typeof manifest?.capabilities === "object" && manifest?.capabilities)
    ? manifest.capabilities
    : ((!Array.isArray(template.capabilities) && typeof template.capabilities === "object" && template.capabilities) ? template.capabilities : {});

  const hasCap = (name) => capsList.includes(name) || Boolean(capsObj[name]);

  // 1. Sync Core Personal Info Fields (recipient_name, sender_name, event_date, custom_message)
  const coreFieldInputs = [
    { key: "recipient_name", inputId: "input-recipient" },
    { key: "sender_name", inputId: "input-sender" },
    { key: "event_date", inputId: "input-date" },
    { key: "custom_message", inputId: "input-message" }
  ];

  rawFields.forEach(f => {
    const fKey = String(f.id || f.key || "").trim();
    if (fKey && f.defaultValue !== undefined && f.defaultValue !== null && String(f.defaultValue) !== "") {
      templateDefaultValues[fKey] = f.defaultValue;
    }
  });

  coreFieldInputs.forEach(({ key, inputId }) => {
    const inputEl = document.getElementById(inputId);
    if (!inputEl) return;
    const wrapper = inputEl.closest("div");
    const declared = fieldByKey.get(key) || (key === "event_date" ? (fieldByKey.get("dob") || fieldByKey.get("birth_date") || fieldByKey.get("celebration_date")) : null);

    const dateIsSupported = templateRequiresEventDate(template);
    if (key === "recipient_name" || (key === "event_date" && dateIsSupported)) {
      if (wrapper) wrapper.classList.remove("hidden");
      inputEl.setAttribute("aria-required", "true");
      const labelEl = wrapper ? wrapper.querySelector("label") : null;
      if (labelEl) {
        const baseLabel = (declared && declared.label)
          ? declared.label
          : (key === "recipient_name" ? "Recipient's Name" : "Date of Birth / Celebration Date");
        labelEl.innerHTML = baseLabel + " <span class=\"text-pink-500\" aria-hidden=\"true\">*</span>";
      }
      if (declared && declared.defaultValue) {
        templateDefaultValues[key] = declared.defaultValue;
        if (key === "recipient_name" && !declared.placeholder) {
          inputEl.placeholder = "e.g. " + declared.defaultValue;
        }
      }
      if (declared && declared.placeholder) {
        inputEl.placeholder = declared.placeholder;
      }
      return;
    }
    if (key === "event_date" && !dateIsSupported) {
      if (wrapper) wrapper.classList.add("hidden");
      inputEl.removeAttribute("aria-required");
      if (!currentCustomData.event_date) {
        currentCustomData.event_date = new Date().toISOString().split("T")[0];
      }
      return;
    }

    if (declared) {
      if (wrapper) wrapper.classList.remove("hidden");
      const labelEl = wrapper ? wrapper.querySelector("label") : null;
      if (labelEl && declared.label) {
        labelEl.innerHTML = declared.label + " <span class=\"text-purple-500 font-normal\">(Optional)</span>";
      }
      if (declared.placeholder) inputEl.placeholder = declared.placeholder;
      if (declared.defaultValue) {
        templateDefaultValues[key] = declared.defaultValue;
        if (!currentCustomData[key]) {
          currentCustomData[key] = declared.defaultValue;
        }
      }
    } else if (manifest && Array.isArray(manifest.fields) && manifest.fields.length > 0) {
      if (key === "sender_name") {
        if (wrapper) wrapper.classList.add("hidden");
      } else if (key === "custom_message" && rawFields.some(f => f.type === "textarea")) {
        if (wrapper) wrapper.classList.add("hidden");
      }
    }
  });

  // 2. Gate Photo / Gallery Section
  const imageFields = rawFields.filter(f => f.type === "image" || f.type === "image-multiple");
  const supportsMultiGallery = rawFields.some(f => f.type === "image-multiple") || imageFields.length > 1 || hasCap("gallery") || hasCap("multiplePhotos");
  const supportsAnyPhoto = imageFields.length > 0 || hasCap("photos") || supportsMultiGallery;

  const photoDropzone = document.getElementById("photo-dropzone");
  const photoCard = photoDropzone ? photoDropzone.closest(".glass-surface") : null;
  const galleryLayoutBox = document.getElementById("gallery-layout-selector")?.parentElement;

  if (photoCard) {
    if (!supportsAnyPhoto) {
      photoCard.classList.add("hidden");
    } else {
      photoCard.classList.remove("hidden");
      if (galleryLayoutBox) {
        if (!supportsMultiGallery) galleryLayoutBox.classList.add("hidden");
        else galleryLayoutBox.classList.remove("hidden");
      }
    }
  }

  // 3. Gate Voice Note Section
  const supportsVoice = rawFields.some(f => f.type === "voice" || f.id === "voice_note" || f.key === "voice_note") || hasCap("voice") || hasCap("voiceNote");
  const voiceWrapper = document.getElementById("voice-note-section-wrapper");
  if (voiceWrapper) {
    if (!supportsVoice) voiceWrapper.classList.add("hidden");
    else voiceWrapper.classList.remove("hidden");
  }

  // 4. Gate Background Music Section
  const supportsMusic = rawFields.some(f => f.type === "audio" || f.id === "background_music" || f.key === "background_music") || hasCap("music") || hasCap("audio");
  const musicWrapper = document.getElementById("music-section-wrapper");
  if (musicWrapper) {
    if (!supportsMusic) musicWrapper.classList.add("hidden");
    else musicWrapper.classList.remove("hidden");
  }

  // 5. Sync Declared Sections for Step 3 (excluding any admin-disabled sections/subsections per UTP v1.2.0)
  const adminDisabledSet = new Set(Array.isArray(template.disabledIds) ? template.disabledIds : []);
  if (template.visibilityMap && typeof template.visibilityMap === "object") {
    Object.entries(template.visibilityMap).forEach(([k, v]) => {
      if (v === false) adminDisabledSet.add(k);
    });
  }
  if (adminDisabledSet.has("voice") || adminDisabledSet.has("voice_note")) {
    if (voiceWrapper) voiceWrapper.classList.add("hidden");
  }
  if (adminDisabledSet.has("music") || adminDisabledSet.has("background_music")) {
    if (musicWrapper) musicWrapper.classList.add("hidden");
  }

  const effectiveVoiceSupported = Boolean(supportsVoice && !adminDisabledSet.has("voice") && !adminDisabledSet.has("voice_note"));
  const effectiveMusicSupported = Boolean(supportsMusic && !adminDisabledSet.has("music") && !adminDisabledSet.has("background_music"));
  window._customizerCapabilities = {
    ...(window._customizerCapabilities || {}),
    supportsAnyPhoto: Boolean(supportsAnyPhoto && !adminDisabledSet.has("gallery") && !adminDisabledSet.has("photos")),
    supportsMultiGallery: Boolean(supportsMultiGallery && !adminDisabledSet.has("gallery")),
    supportsVoice: effectiveVoiceSupported,
    supportsMusic: effectiveMusicSupported,
    supportsDate: templateRequiresEventDate(template)
  };

  const declaredSections = (Array.isArray(template.sections) && template.sections.length > 0)
    ? template.sections
    : ((manifest && Array.isArray(manifest.sections) && manifest.sections.length > 0) ? manifest.sections : []);

  if (declaredSections.length > 0) {
    const prevEnabledMap = new Map();
    if (Array.isArray(currentCustomData.sections)) {
      currentCustomData.sections.forEach(s => {
        if (s && s.id) prevEnabledMap.set(s.id, s.enabled !== false);
      });
    }
    const hiddenSecSet = new Set(Array.isArray(currentCustomData._hiddenSections) ? currentCustomData._hiddenSections : []);
    const flattenedCustomerSecs = [];
    const walkDeclaredSecs = (secList, parentId = null, depth = 0) => {
      if (!Array.isArray(secList)) return;
      secList.forEach((sec) => {
        if (!sec) return;
        const sId = typeof sec === "string" ? sec : (sec.id || sec.key);
        if (!sId || adminDisabledSet.has(sId)) return;
        if (typeof sec === "object" && (sec.enabled === false || sec.isEnabled === false || sec.effectiveEnabled === false)) return;
        const isReq = Boolean(sec.required || sId === "hero");
        const defaultOn = sec.defaultEnabled !== false && sec.enabled !== false && sec.isEnabled !== false;
        const isEnabled = isReq
          ? true
          : (hiddenSecSet.has(sId) ? false : (prevEnabledMap.has(sId) ? prevEnabledMap.get(sId) : defaultOn));
        flattenedCustomerSecs.push({
          id: sId,
          name: sec.label || sec.name || sId.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          description: sec.description || (depth > 0 ? ("Sub-part of " + parentId.replace(/_/g, " ")) : ""),
          required: isReq,
          toggleable: isReq ? false : (sec.toggleable !== false),
          enabled: isEnabled,
          isSubsection: depth > 0,
          parentSectionId: parentId,
          depth,
          order: flattenedCustomerSecs.length + 1,
          selector: depth > 0 ? ("[data-wm-subsection=\"" + sId + "\"]") : ("[data-wm-section=\"" + sId + "\"]")
        });
        if (Array.isArray(sec.subsections) && sec.subsections.length > 0 && depth < 3) {
          walkDeclaredSecs(sec.subsections, sId, depth + 1);
        }
      });
    };
    walkDeclaredSecs(declaredSections, null, 0);
    currentCustomData.sections = flattenedCustomerSecs;
    renderSectionsUI();
    if (typeof updateGallerySectionQuickButtonUI === "function") updateGallerySectionQuickButtonUI();
  }
}

function renderDynamicTemplateFields(template) {
  const container = document.getElementById('template-dynamic-fields-container');
  const card = document.getElementById('dynamic-template-fields-card');
  const countBadge = document.getElementById('dynamic-fields-count-badge');
  if (!container || !card) return;

  const manifest = template ? template.manifest : null;
  let rawFields = (manifest && manifest.fields) || (template && template.fields) || (template && template.detectedFields) || [];
  if (!Array.isArray(rawFields)) rawFields = [];

  const STANDARD_BUILTIN_KEYS = new Set([
    'recipient_name', 'sender_name', 'sender_contact', 'event_date',
    'occasion', 'relationship', 'custom_message', 'photos', 'music',
    'voice_note', 'cover_photo', 'photo_1', 'customSlug', 'slug', 'buyerName'
  ]);

  const disabledIdsSet = new Set(Array.isArray(template?.disabledIds) ? template.disabledIds : []);
  if (template?.visibilityMap && typeof template.visibilityMap === 'object') {
    Object.entries(template.visibilityMap).forEach(([k, v]) => { if (v === false) disabledIdsSet.add(k); });
  }
  const excludedFieldIdsSet = new Set(Array.isArray(template?.excludedFieldIds) ? template.excludedFieldIds : []);

  const dynamicFields = rawFields.filter(f => {
    if (!f || f.disabled === true || f.enabled === false) return false;
    const k = (f.id || f.key || '').trim();
    if (!k || STANDARD_BUILTIN_KEYS.has(k) || excludedFieldIdsSet.has(k)) return false;
    if ((f.sectionId && disabledIdsSet.has(f.sectionId)) || (f.subsectionId && disabledIdsSet.has(f.subsectionId)) || (f.section && disabledIdsSet.has(f.section))) {
      return false;
    }
    return true;
  });

  window._customizerCapabilities = {
    ...(window._customizerCapabilities || {}),
    hasDynamicFields: dynamicFields.length > 0 || ((currentCustomData.sections || []).length > 0)
  };

  if (dynamicFields.length === 0) {
    if (countBadge) countBadge.textContent = `${(currentCustomData.sections || []).length} Sections`;
    const navBoxEmpty = document.getElementById('dynamic-fields-section-navigator');
    const hiddenSecsEmpty = new Set(Array.isArray(currentCustomData._hiddenSections) ? currentCustomData._hiddenSections : []);
    if (navBoxEmpty && Array.isArray(currentCustomData.sections) && currentCustomData.sections.length > 0) {
      navBoxEmpty.innerHTML = `
        <div class="space-y-2">
          <p class="text-[11px] text-purple-700 dark:text-purple-300 font-medium">Toggle any optional template section ON or OFF below:</p>
          ${currentCustomData.sections.map(sec => {
            const isReq = sec.id === 'hero' || sec.required === true || sec.isRequired === true || sec.toggleable === false;
            const isOff = !isReq && (hiddenSecsEmpty.has(sec.id) || sec.enabled === false);
            return `
              <div class="p-2.5 rounded-2xl bg-white/80 dark:bg-purple-950/50 border border-purple-200/70 dark:border-purple-800/50 flex items-center justify-between gap-2 text-xs">
                <div class="flex items-center gap-2 min-w-0">
                  <span>${escapeHtml(sec.icon || '✨')}</span>
                  <span class="font-bold text-purple-950 dark:text-white truncate">${escapeHtml(sec.name || sec.label || sec.id)}</span>
                </div>
                ${isReq
                  ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-200/70 dark:bg-purple-800/60 text-purple-800 dark:text-purple-200">Required</span>'
                  : `<button type="button" onclick="toggleCustomerSectionQuick('${sec.id}')" class="px-2.5 py-1 rounded-full text-[10px] font-bold transition cursor-pointer ${
                      isOff
                        ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
                    }">${isOff ? '🙈 Hidden (Tap to Show)' : '👁️ Visible (Tap to Hide)'}</button>`
                }
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
    container.innerHTML = '';
    if (window._activeStep1SubTab === 'template' || window._activeStep1SubTab === 'all') {
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
    return;
  }

  if (window._activeStep1SubTab === 'template' || window._activeStep1SubTab === 'all') {
    card.classList.remove('hidden');
  } else {
    card.classList.add('hidden');
  }
  if (countBadge) {
    countBadge.textContent = `${dynamicFields.length} Field${dynamicFields.length === 1 ? '' : 's'}`;
  }
  container.innerHTML = '';

  // Build section groups for dynamic fields so the user never has to scroll a giant wall of fields
  const secLabelMap = new Map();
  if (Array.isArray(currentCustomData.sections)) {
    currentCustomData.sections.forEach(s => {
      if (s && s.id) secLabelMap.set(s.id, s.name || s.label || s.id);
    });
  }
  const sectionGroupsOrder = [];
  const sectionGroupsMap = new Map();
  dynamicFields.forEach(field => {
    const fieldKey = field.id || field.key;
    field.key = fieldKey;
    field.id = fieldKey;
    const secKey = String(field.section || field.sectionId || field.group || 'general').trim() || 'general';
    if (!sectionGroupsMap.has(secKey)) {
      const friendlyLabel = secLabelMap.get(secKey) || secKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      sectionGroupsMap.set(secKey, { id: secKey, label: friendlyLabel, fields: [] });
      sectionGroupsOrder.push(secKey);
    }
    sectionGroupsMap.get(secKey).fields.push(field);
  });

  if (!window._activeDynamicFieldSection || (window._activeDynamicFieldSection !== 'all' && !sectionGroupsMap.has(window._activeDynamicFieldSection))) {
    window._activeDynamicFieldSection = (dynamicFields.length > 4 && sectionGroupsOrder.length > 1)
      ? sectionGroupsOrder[0]
      : 'all';
  }

  const navBox = document.getElementById('dynamic-fields-section-navigator');
  const hiddenSecsSet = new Set(Array.isArray(currentCustomData._hiddenSections) ? currentCustomData._hiddenSections : []);
  const hiddenFieldsSet = new Set(Array.isArray(currentCustomData._hiddenFields) ? currentCustomData._hiddenFields : []);

  if (navBox) {
    if (sectionGroupsOrder.length > 1) {
      const activeSecId = window._activeDynamicFieldSection;
      const activeIdx = sectionGroupsOrder.indexOf(activeSecId);
      const activeSecObj = activeSecId !== 'all' ? (currentCustomData.sections || []).find(s => s.id === activeSecId) : null;
      const isActiveSecHidden = activeSecId !== 'all' && (hiddenSecsSet.has(activeSecId) || (activeSecObj && activeSecObj.enabled === false));
      const canToggleActiveSec = activeSecId !== 'all' && activeSecId !== 'hero' && (!activeSecObj || !activeSecObj.required);

      navBox.innerHTML = `
        <div class="flex flex-wrap items-center gap-1.5 pb-1">
          ${sectionGroupsOrder.map((sId, idx) => {
            const grp = sectionGroupsMap.get(sId);
            const isSel = activeSecId === sId;
            const secObj = (currentCustomData.sections || []).find(s => s.id === sId);
            const isSecOff = hiddenSecsSet.has(sId) || (secObj && secObj.enabled === false);
            return `<button type="button" onclick="selectDynamicFieldSection('${sId}')" class="px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
              isSel
                ? 'bg-purple-700 text-white shadow-sm'
                : 'bg-purple-100/80 dark:bg-purple-900/50 text-purple-900 dark:text-purple-200 hover:bg-purple-200'
            } ${isSecOff ? 'opacity-60 line-through' : ''}">
              <span>${idx + 1}. ${escapeHtml(grp.label)}</span>
              <span class="px-1.5 py-0.2 rounded-full text-[9px] ${isSel ? 'bg-white/20 text-white' : 'bg-purple-200/80 dark:bg-purple-800 text-purple-800 dark:text-purple-200'}">${grp.fields.length}</span>
              ${isSecOff ? '<span title="Hidden on website">🙈</span>' : ''}
            </button>`;
          }).join('')}
          <button type="button" onclick="selectDynamicFieldSection('all')" class="px-2.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeSecId === 'all'
              ? 'bg-pink-600 text-white shadow-sm'
              : 'bg-white/70 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60'
          }">
            📋 All (${dynamicFields.length})
          </button>
        </div>
        ${activeSecId !== 'all' ? `
          <div class="p-2.5 rounded-2xl bg-purple-100/70 dark:bg-purple-900/40 border border-purple-200/70 dark:border-purple-800/50 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div class="flex items-center gap-2">
              <span class="font-extrabold text-purple-950 dark:text-white">Section: ${escapeHtml(sectionGroupsMap.get(activeSecId)?.label || activeSecId)}</span>
              ${canToggleActiveSec ? `
                <button type="button" onclick="toggleCustomerSectionQuick('${activeSecId}')" class="px-2.5 py-1 rounded-full text-[10px] font-bold transition cursor-pointer ${
                  isActiveSecHidden
                    ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40'
                    : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
                }">
                  ${isActiveSecHidden ? '🙈 Hidden on Site (Tap to Show)' : '👁️ Showing on Site (Tap to Hide Section)'}
                </button>
              ` : '<span class="px-2 py-0.5 rounded text-[9px] font-bold bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200">Core Section</span>'}
            </div>
            <div class="flex items-center gap-1.5">
              <button type="button" onclick="stepDynamicFieldSection(-1)" ${activeIdx <= 0 ? 'disabled class="opacity-30 pointer-events-none px-2 py-1 rounded-lg bg-white/60 text-[10px] font-bold"' : 'class="px-2.5 py-1 rounded-lg bg-white dark:bg-purple-950 text-purple-900 dark:text-purple-200 text-[10px] font-bold shadow-xs cursor-pointer"'}>← Prev</button>
              <button type="button" onclick="stepDynamicFieldSection(1)" ${activeIdx >= sectionGroupsOrder.length - 1 ? 'disabled class="opacity-30 pointer-events-none px-2 py-1 rounded-lg bg-white/60 text-[10px] font-bold"' : 'class="px-2.5 py-1 rounded-lg bg-pink-600 text-white text-[10px] font-bold shadow-xs cursor-pointer"'}>Next Section →</button>
            </div>
          </div>
        ` : ''}
      `;
    } else {
      navBox.innerHTML = '';
    }
  }

  dynamicFields.forEach(field => {
    const fieldKey = field.id || field.key;
    field.key = fieldKey;
    field.id = fieldKey;
    const secKey = String(field.section || field.sectionId || field.group || 'general').trim() || 'general';

    // Only Name and DOB are mandatory; all other template messages/texts are optional and keep their normal default text
    if (!isMandatoryIdentityField(fieldKey)) {
      field.required = false;
      field.isRequired = false;
    }
    if (field.defaultValue !== undefined && field.defaultValue !== null && String(field.defaultValue) !== '') {
      templateDefaultValues[fieldKey] = field.defaultValue;
    }

    // Initialize state with template default value if not present or empty
    if (currentCustomData[fieldKey] === undefined || currentCustomData[fieldKey] === '') {
      currentCustomData[fieldKey] = (field.defaultValue !== undefined && field.defaultValue !== null) ? field.defaultValue : '';
    }

    const isVisibleByRule = evaluateFieldVisibility(field, currentCustomData);
    const isMatchedSectionTab = window._activeDynamicFieldSection === 'all' || window._activeDynamicFieldSection === secKey;
    const isFieldHiddenByCustomer = hiddenFieldsSet.has(fieldKey);
    const fieldState = {
      value: currentCustomData[fieldKey],
      visible: isVisibleByRule && isMatchedSectionTab,
      disabled: isFieldHiddenByCustomer
    };

    if (window.WishMagicFieldRenderer && typeof window.WishMagicFieldRenderer.render === 'function') {
      const renderedNode = window.WishMagicFieldRenderer.render(
        field,
        fieldState,
        (key, newVal) => {
          handleDynamicFieldChange(key, newVal, field);
        }
      );
      let elNode = null;
      if (typeof renderedNode === 'string') {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = renderedNode;
        elNode = wrapper.firstElementChild || wrapper;
      } else if (renderedNode instanceof HTMLElement) {
        elNode = renderedNode;
      }
      if (elNode) {
        elNode.setAttribute('data-field-section', secKey);
        if (!isMatchedSectionTab) {
          elNode.style.display = 'none';
        }
        // Add a "Show / Hide this item on website" toggle pill for optional fields/photos
        if (!isMandatoryIdentityField(fieldKey)) {
          const ctrlBar = document.createElement('div');
          ctrlBar.className = 'flex items-center justify-between pt-1.5 mt-1.5 border-t border-purple-200/40 dark:border-purple-800/40 text-[10px]';
          ctrlBar.innerHTML = `
            <span class="text-purple-600/80 dark:text-purple-300/80 font-medium">${isFieldHiddenByCustomer ? '🙈 Hidden on your customized website' : '👁️ Visible on your customized website'}</span>
            <button type="button" onclick="toggleCustomerFieldVisibility('${fieldKey}')" class="px-2 py-0.5 rounded-full font-bold transition cursor-pointer ${
              isFieldHiddenByCustomer
                ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40'
                : 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 hover:bg-pink-500/20'
            }">
              ${isFieldHiddenByCustomer ? '👁️ Show Again' : '🙈 Hide This Item'}
            </button>
          `;
          if (isFieldHiddenByCustomer) {
            elNode.classList.add('opacity-60');
          }
          elNode.appendChild(ctrlBar);
        }
        container.appendChild(elNode);
      }
    }
  });
  if (typeof renderTemplatePhotoSlotsManager === 'function') {
    renderTemplatePhotoSlotsManager();
  }
  if (typeof window.syncStep1SubTabCapabilitiesUI === 'function') {
    window.syncStep1SubTabCapabilitiesUI();
  }
  if (typeof window.updateCustomizationProgressUI === 'function') {
    window.updateCustomizationProgressUI();
  }
}

function evaluateFieldVisibility(field, state) {
  if (!field || !field.visibleIf) return true;
  const cond = field.visibleIf;
  if (typeof cond === 'function') {
    try { return Boolean(cond(state)); } catch (e) { return true; }
  }
  if (typeof cond === 'object') {
    const targetKey = cond.field || cond.key;
    const currentVal = state[targetKey];
    if (cond.equals !== undefined) {
      return currentVal === cond.equals;
    }
    if (cond.notEquals !== undefined) {
      return currentVal !== cond.notEquals;
    }
    if (cond.in && Array.isArray(cond.in)) {
      return cond.in.includes(currentVal);
    }
    if (cond.notIn && Array.isArray(cond.notIn)) {
      return !cond.notIn.includes(currentVal);
    }
    if (cond.truthy) {
      return Boolean(currentVal);
    }
  }
  return true;
}

function handleDynamicFieldChange(key, newVal, field) {
  currentCustomData[key] = newVal;
  if (window._userModifiedFields instanceof Set) window._userModifiedFields.add(key);

  // Re-evaluate visibility for all fields in container
  const container = document.getElementById('template-dynamic-fields-container');
  if (container && activeTemplate) {
    const manifest = activeTemplate.manifest;
    const rawFields = (manifest && manifest.fields) || activeTemplate.fields || [];
    rawFields.forEach(f => {
      const fKey = f.id || f.key;
      const el = container.querySelector(`[data-field-key="${fKey}"]`);
      if (el) {
        const visible = evaluateFieldVisibility(f, currentCustomData);
        if (visible) {
          el.style.display = 'block';
          el.classList.remove('wm-field-hidden');
        } else {
          el.style.display = 'none';
          el.classList.add('wm-field-hidden');
          if (f.clearOnHide) {
            currentCustomData[fKey] = (f.defaultValue !== undefined && f.defaultValue !== null) ? f.defaultValue : '';
          }
        }
      }
    });
  }

  // Live preview update via Runtime Bridge
  if (window.WishMagicRuntimeBridge) {
    window.WishMagicRuntimeBridge.updateField(key, newVal);
    window.WishMagicRuntimeBridge.updateState(currentCustomData);
  }
  syncDataToIframe();
  triggerAutosave();
}

// Part 11: Validate loaded draft against entitlement without corrupting data
function validateDraftEntitlements(data) {
  if (!window.WishFeatureAccess || !data) return;
  const isPrem = window.WishEntitlement ? window.WishEntitlement.isPremium() : false;
  if (isPrem) return; // User has full entitlement

  const issues = [];

  if (activeTemplate && (activeTemplate.tier === 'vip' || activeTemplate.isPremium || activeTemplate.price > 0)) {
    issues.push('VIP Blueprint');
  }

  if (data.theme && ['romantic', 'elegant', 'royal', 'dark'].includes(String(data.theme).toLowerCase())) {
    issues.push(`VIP Theme (${data.theme})`);
  }

  if (data.media) {
    if (data.media.photos && data.media.photos.length > 3) {
      issues.push(`Expanded Keepsakes (${data.media.photos.length} photos)`);
    }
    if (data.media.voiceNote && data.media.voiceNote.enabled) {
      issues.push('Spoken Voice Dedication Note');
    }
    if (data.media.music && data.media.music.type === 'upload') {
      issues.push('Custom Audio Upload');
    }
    if (data.media.galleryLayout && ['polaroid', 'carousel', 'masonry'].includes(data.media.galleryLayout)) {
      issues.push(`VIP Gallery Layout (${data.media.galleryLayout})`);
    }
  }

  if (data.sections && Array.isArray(data.sections)) {
    data.sections.forEach(s => {
      if (s.enabled && ['countdown', 'timeline', 'voice', 'secret_message', 'open_when', 'final_surprise'].includes(s.id)) {
        issues.push(`VIP Section (${s.name})`);
      }
    });
  }

  if (data.lifetimePreservation) {
    issues.push('Lifetime Link Preservation');
  }
  if (data.watermarkRemoved) {
    issues.push('Zero Platform Watermark');
  }

  if (issues.length > 0) {
    console.info('[WishEntitlement] Detected draft contains premium capabilities without active entitlement:', issues);
    showToast(`⚠️ This draft includes VIP features (${issues.length}) locked on Free Tier. Upgrade to VIP to keep them active in the gift link.`, 5000);
  }
}

// Development Entitlement Switcher (Section 17)
window.toggleDevelopmentEntitlement = function() {
  if (!window.WishEntitlement) return;
  const currentIsPrem = window.WishEntitlement.isPremium();
  const nextPlan = currentIsPrem ? 'free' : 'premium';
  window.WishEntitlement.setDevelopmentPlan(nextPlan);

  updateDevEntitlementUI();
  updateMediaCapabilitiesUI();
  renderPhotosUI();
  renderSectionsUI();
  renderStep4Summary();
  renderCustomizerHeader();
  syncDataToIframe();

  showToast(`🧪 Switched to ${nextPlan.toUpperCase()} Entitlement (Dev Mode)`);
};

function updateDevEntitlementUI() {
  const btn = document.getElementById('dev-toggle-entitlement-btn');
  if (!btn) return;
  const isPrem = window.WishEntitlement ? window.WishEntitlement.isPremium() : false;
  if (isPrem) {
    btn.textContent = '👑 VIP PASS (ACTIVE)';
    btn.className = 'px-2 py-0.5 rounded-full font-extrabold text-[10px] bg-amber-400 text-purple-950 shadow-sm transition cursor-pointer';
  } else {
    btn.textContent = 'FREE TIER';
    btn.className = 'px-2 py-0.5 rounded-full font-extrabold text-[10px] bg-emerald-500/30 text-emerald-300 hover:bg-emerald-500 hover:text-white transition cursor-pointer';
  }
}

// Apply sensible template-specific defaults
function applyTemplateDefaults(tpl) {
  const isVip = tpl.tier === 'vip' || (tpl.price && Number(tpl.price) > 0);

  // Default detected fields (store all defaults; pre-fill optional messages/texts while keeping Name & DOB for user input)
  templateDefaultValues = {};
  const allTplFields = [
    ...((tpl.manifest && Array.isArray(tpl.manifest.fields)) ? tpl.manifest.fields : []),
    ...(Array.isArray(tpl.fields) ? tpl.fields : []),
    ...(Array.isArray(tpl.detectedFields) ? tpl.detectedFields : [])
  ];
  allTplFields.forEach(f => {
    const fKey = f && (f.key || f.id);
    if (!fKey) return;
    if (f.defaultValue !== undefined && f.defaultValue !== null && String(f.defaultValue) !== '') {
      templateDefaultValues[fKey] = f.defaultValue;
      if (!isMandatoryIdentityField(fKey) && !currentCustomData[fKey]) {
        currentCustomData[fKey] = f.defaultValue;
      }
    }
  });

  // Cover photo default
  if (!currentCustomData.cover_photo) {
    currentCustomData.cover_photo = tpl.thumbnail || tpl.previewImage || '/assets/file_ab2082.png';
    currentCustomData.photo_1 = currentCustomData.cover_photo;
    if (currentCustomData.photos.length === 0) {
      currentCustomData.photos.push({
        id: 'photo_default_1',
        url: currentCustomData.cover_photo,
        name: 'Cover Memory Photo',
        isCover: true
      });
    }
  }

  // Match theme to category / mood
  const cat = (tpl.category || '').toLowerCase();
  if (cat.includes('love') || cat.includes('romance') || cat.includes('crush')) {
    currentCustomData.theme = 'romantic';
    currentCustomData.colors.primary = '#f43f5e';
    currentCustomData.colors.secondary = '#fb7185';
    currentCustomData.font = 'romantic';
  } else if (cat.includes('anniversary')) {
    currentCustomData.theme = 'elegant';
    currentCustomData.colors.primary = '#f59e0b';
    currentCustomData.colors.secondary = '#fbbf24';
    currentCustomData.font = 'elegant';
  } else if (cat.includes('friendship')) {
    currentCustomData.theme = 'celebration';
    currentCustomData.colors.primary = '#a855f7';
    currentCustomData.colors.secondary = '#ec4899';
    currentCustomData.font = 'playful';
  } else {
    currentCustomData.theme = 'magical';
    currentCustomData.colors.primary = '#ec4899';
    currentCustomData.colors.secondary = '#8b5cf6';
    currentCustomData.font = 'modern';
  }

  // Set music title
  if (tpl.supportsMusic) {
    currentCustomData.music.title = typeof tpl.supportsMusic === 'string' ? tpl.supportsMusic : 'Celebration Acoustic Strings';
    currentCustomData.music.enabled = true;
  }

  // Set voice note support
  if (tpl.supportsVoice) {
    const voiceSection = currentCustomData.sections.find(s => s.id === 'voice');
    if (voiceSection) voiceSection.enabled = true;
  }

  // Adapt sections to template
  if (tpl.sections && Array.isArray(tpl.sections)) {
    // Keep customizer sections aligned
    currentCustomData.sections.forEach(s => {
      if (s.id === 'countdown' && !tpl.id.includes('countdown') && !tpl.name.toLowerCase().includes('countdown')) {
        s.enabled = false;
      }
    });
  }
}

// Render Top Header Ribbon
function renderCustomizerHeader() {
  if (!activeTemplate) return;
  const isVip = activeTemplate.tier === 'vip' || (activeTemplate.price && Number(activeTemplate.price) > 0);

  const titleEl = document.getElementById('customizer-template-name');
  if (titleEl) {
    titleEl.textContent = (activeTemplate.selectedVariant && activeTemplate.selectedVariant.relationshipLabel)
      ? `${activeTemplate.name} — ${activeTemplate.selectedVariant.relationshipLabel}`
      : activeTemplate.name;
  }

  const badgeEl = document.getElementById('customizer-tier-badge');
  if (badgeEl) {
    badgeEl.textContent = isVip ? `VIP • ₹${activeTemplate.price || 49}` : 'FREE';
    badgeEl.className = isVip
      ? 'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400 text-purple-950 shadow-sm'
      : 'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-white shadow-sm';
  }

  const categoryEl = document.getElementById('customizer-category-name');
  if (categoryEl) categoryEl.textContent = `✦ ${activeTemplate.category || 'Celebration'}`;

  // Update button labels (Compact on mobile so template title is never crushed)
  const btnFinal = document.getElementById('btn-header-continue');
  if (btnFinal) {
    btnFinal.innerHTML = isVip
      ? `<span class="hidden sm:inline">Proceed to Gift • ₹${activeTemplate.price || 49}</span><span class="sm:hidden">Gift • ₹${activeTemplate.price || 49}</span><span class="material-symbols-outlined text-[14px] sm:text-[16px]">arrow_forward</span>`
      : `<span class="hidden sm:inline">Finalize Free Wish</span><span class="sm:hidden">Finalize</span><span class="material-symbols-outlined text-[14px] sm:text-[16px]">arrow_forward</span>`;
  }

  // Update back to preview link (Rule E: preserve selected variant & relation on back navigation)
  const backLink = document.getElementById('btn-back-to-preview');
  if (backLink) {
    backLink.href = (activeTemplate.selectedVariant && activeTemplate.selectedVariant.id)
      ? `/template-preview.html?template=${encodeURIComponent(activeTemplate.id)}&variant=${encodeURIComponent(activeTemplate.selectedVariant.id)}&rel=${encodeURIComponent(activeTemplate.selectedVariant.relationshipSlug || '')}`
      : `/template/${activeTemplate.id}`;
  }
}

// Populate input elements with current state values
function populateFormValuesFromState() {
  const recipientInput = document.getElementById('input-recipient');
  if (recipientInput) recipientInput.value = currentCustomData.recipient_name || '';

  const senderInput = document.getElementById('input-sender');
  if (senderInput) senderInput.value = currentCustomData.sender_name || '';

  const dateInput = document.getElementById('input-date');
  if (dateInput) dateInput.value = currentCustomData.event_date || '';

  const contactInput = document.getElementById('input-contact');
  if (contactInput) contactInput.value = currentCustomData.sender_contact || '';

  const occasionInput = document.getElementById('input-occasion');
  if (occasionInput && currentCustomData.occasion) occasionInput.value = currentCustomData.occasion;

  const relationshipInput = document.getElementById('input-relationship');
  if (relationshipInput && currentCustomData.relationship) relationshipInput.value = currentCustomData.relationship;

  const slugInput = document.getElementById('wish-slug-input') || document.getElementById('custom-slug-input');
  if (slugInput && (currentCustomData.customSlug || currentCustomData.slug)) {
    slugInput.value = currentCustomData.customSlug || currentCustomData.slug;
  }

  const messageInput = document.getElementById('input-message');
  if (messageInput) {
    messageInput.value = currentCustomData.custom_message || '';
    const counter = document.getElementById('message-char-count');
    if (counter) counter.textContent = `${(currentCustomData.custom_message || '').length} / 500`;
  }

  // Style inputs (preserve any custom or variant-assigned colors across theme preset UI sync)
  const savedColorsBeforePreset = currentCustomData.colors ? { ...currentCustomData.colors } : null;
  selectThemePreset(currentCustomData.theme || 'magical', false);
  if (savedColorsBeforePreset && (currentCustomData._userOverrodePalette || (activeTemplate && activeTemplate.selectedVariant && activeTemplate.selectedVariant.theme))) {
    currentCustomData.colors = { ...currentCustomData.colors, ...savedColorsBeforePreset };
  }
  selectFont(currentCustomData.font || 'modern', false);
  selectBackgroundStyle(currentCustomData.background || 'gradient', false);

  if (currentCustomData.surfaces && currentCustomData.surfaces.style) {
    selectCardStyle(currentCustomData.surfaces.style, false);
  }
  if (currentCustomData.buttons && currentCustomData.buttons.style) {
    selectButtonStyle(currentCustomData.buttons.style, false);
  }
  if (currentCustomData.effects && currentCustomData.effects.particleType) {
    selectParticleType(currentCustomData.effects.particleType, false);
  }
  if (currentCustomData.effects && currentCustomData.effects.intensity) {
    const intensitySel = document.getElementById('select-particle-intensity');
    if (intensitySel) intensitySel.value = currentCustomData.effects.intensity;
  }
  const glowCheck = document.getElementById('check-glow-fx');
  if (glowCheck) glowCheck.checked = currentCustomData.effects ? currentCustomData.effects.glow !== false : true;

  const confettiCheck = document.getElementById('check-confetti-fx');
  if (confettiCheck) confettiCheck.checked = currentCustomData.effects ? currentCustomData.effects.confetti !== false : true;

  const masterFxSwitch = document.getElementById('switch-master-fx');
  if (masterFxSwitch) masterFxSwitch.checked = currentCustomData.effects ? currentCustomData.effects.master !== false : true;

  const colPrimary = document.getElementById('color-primary-input');
  if (colPrimary) colPrimary.value = currentCustomData.colors.primary || '#ec4899';
  const hexPrimary = document.getElementById('hex-primary-label');
  if (hexPrimary) hexPrimary.textContent = currentCustomData.colors.primary || '#ec4899';

  const colSecondary = document.getElementById('color-secondary-input');
  if (colSecondary) colSecondary.value = currentCustomData.colors.secondary || '#8b5cf6';
  const hexSecondary = document.getElementById('hex-secondary-label');
  if (hexSecondary) hexSecondary.textContent = currentCustomData.colors.secondary || '#8b5cf6';

  const colAccent = document.getElementById('color-accent-input');
  if (colAccent) colAccent.value = currentCustomData.colors.accent || '#fbbf24';
  const hexAccent = document.getElementById('hex-accent-label');
  if (hexAccent) hexAccent.textContent = currentCustomData.colors.accent || '#fbbf24';

  updateContrastBadge();

  // Sync dynamic manifest fields if rendered
  const dynContainer = document.getElementById('template-dynamic-fields-container');
  if (dynContainer) {
    const fieldGroups = dynContainer.querySelectorAll('[data-field-key]');
    fieldGroups.forEach(grp => {
      const fKey = grp.getAttribute('data-field-key');
      if (fKey && currentCustomData[fKey] !== undefined) {
        const input = grp.querySelector('input:not([type="file"]), textarea, select');
        if (input) {
          if (input.type === 'file') {
            // Never programmatically set a non-empty value on <input type="file">
          } else if (input.type === 'checkbox') {
            input.checked = Boolean(currentCustomData[fKey]);
          } else {
            try {
              input.value = currentCustomData[fKey] || '';
            } catch (_) {}
          }
        }
      }
    });
  }

  // Update variant reset button visibility
  const resetBtn = document.getElementById('btn-reset-variant-defaults');
  if (resetBtn) {
    if (currentCustomData.relationship && findRelationshipVariantConfig(currentCustomData.relationship)) {
      resetBtn.classList.remove('hidden');
    } else {
      resetBtn.classList.add('hidden');
    }
  }

  // Part 5 Advanced Media System Initialization
  initMediaSystemUI();
}

// Step Navigation Controller
function setupStepNavigation() {
  window.goToStep = function(stepNum) {
    if (stepNum < 1 || stepNum > TOTAL_STEPS) return;

    // Validate if moving forward from Step 1
    if (stepNum > 1 && currentStep === 1) {
      if (!validateStep1()) return;
    }

    currentStep = stepNum;
    updateStepVisibility();
  };

  window.handleNextStep = function() {
    if (currentStep < TOTAL_STEPS) {
      window.goToStep(currentStep + 1);
    } else {
      // Step 4 final action
      publishWishAndGetLink();
    }
  };

  window.handlePrevStep = function() {
    if (currentStep > 1) {
      window.goToStep(currentStep - 1);
    }
  };
}

function updateStepVisibility() {
  // 1. Update Stepper Header Pills
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const stepTab = document.getElementById(`step-tab-${i}`);
    const checkIcon = document.getElementById(`step-check-${i}`);
    const numIcon = document.getElementById(`step-num-${i}`);

    if (stepTab) {
      stepTab.setAttribute('role', 'tab');
      stepTab.setAttribute('aria-selected', i === currentStep ? 'true' : 'false');
      stepTab.setAttribute('aria-controls', `step-content-${i}`);
      stepTab.tabIndex = i === currentStep ? 0 : -1;
      if (i === currentStep) {
        stepTab.className = 'step-tab-btn flex-1 min-w-0 flex items-center justify-center gap-1 sm:gap-1.5 py-1.5 px-1.5 sm:px-4 rounded-xl font-bold text-[11px] sm:text-sm bg-purple-700 text-white shadow-md transition-all';
      } else if (i < currentStep) {
        stepTab.className = 'step-tab-btn flex-1 min-w-0 flex items-center justify-center gap-1 sm:gap-1.5 py-1.5 px-1.5 sm:px-4 rounded-xl font-bold text-[11px] sm:text-sm bg-purple-100/90 dark:bg-purple-900/60 text-purple-900 dark:text-purple-200 transition-all cursor-pointer';
      } else {
        stepTab.className = 'step-tab-btn flex-1 min-w-0 flex items-center justify-center gap-1 sm:gap-1.5 py-1.5 px-1.5 sm:px-4 rounded-xl font-semibold text-[11px] sm:text-sm text-purple-800/70 dark:text-purple-300/70 hover:text-purple-950 dark:hover:text-white transition-all cursor-pointer';
      }
    }

    if (checkIcon && numIcon) {
      if (i < currentStep) {
        checkIcon.classList.remove('hidden');
        numIcon.classList.add('hidden');
      } else {
        checkIcon.classList.add('hidden');
        numIcon.classList.remove('hidden');
      }
    }
  }

  // 2. Show/Hide Step Content Panes with ARIA tabpanel semantics
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const pane = document.getElementById(`step-content-${i}`);
    if (pane) {
      pane.setAttribute('role', 'tabpanel');
      pane.setAttribute('aria-labelledby', `step-tab-${i}`);
      if (i === currentStep) {
        pane.classList.remove('hidden');
        pane.setAttribute('aria-hidden', 'false');
      } else {
        pane.classList.add('hidden');
        pane.setAttribute('aria-hidden', 'true');
      }
    }
  }
  if (typeof window.syncCustomizationLevelButtonsUI === 'function') {
    window.syncCustomizationLevelButtonsUI();
  }

  // 3. Update Footer Navigation Bar
  const btnPrev = document.getElementById('btn-step-prev');
  if (btnPrev) {
    if (currentStep === 1) {
      btnPrev.classList.add('invisible');
    } else {
      btnPrev.classList.remove('invisible');
    }
  }

  const stepStatusText = document.getElementById('step-indicator-text');
  if (stepStatusText) {
    const stepNames = ['Personal Details', 'Visual Styling & Theme', 'Sections & Layout', 'Preview & Finalize'];
    stepStatusText.textContent = `Step ${currentStep} of ${TOTAL_STEPS}: ${stepNames[currentStep - 1]}`;
  }

  const btnNext = document.getElementById('btn-step-next');
  if (btnNext) {
    if (currentStep === TOTAL_STEPS) {
      const isVip = activeTemplate && (activeTemplate.tier === 'vip' || (activeTemplate.price && Number(activeTemplate.price) > 0));
      btnNext.innerHTML = isVip
        ? `<span>Proceed to Gift (₹${activeTemplate.price || 49})</span><span class="text-amber-300">✨</span>`
        : `<span>Create Free Wish Link</span><span class="text-amber-300">✨</span>`;
      btnNext.className = 'py-2.5 sm:py-3 px-6 sm:px-8 rounded-full bg-gradient-to-r from-emerald-500 via-teal-600 to-purple-600 hover:brightness-110 active:scale-95 text-white font-extrabold text-xs sm:text-sm shadow-xl flex items-center gap-2 transition-all cursor-pointer';
    } else {
      btnNext.innerHTML = `<span>Continue to Step ${currentStep + 1}</span><span class="material-symbols-outlined text-[16px]">arrow_forward</span>`;
      btnNext.className = 'py-2.5 sm:py-3 px-6 sm:px-8 rounded-full bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 hover:brightness-110 active:scale-95 text-white font-extrabold text-xs sm:text-sm shadow-xl shadow-pink-500/20 flex items-center gap-2 transition-all cursor-pointer';
    }
  }

  // If entering Step 4 Preview, update the summary card
  if (currentStep === 4) {
    renderStep4Summary();
    if (typeof window.setMobileActiveView === 'function' && window.innerWidth < 1024) {
      window.setMobileActiveView('preview');
    }
  } else {
    if (typeof window.setMobileActiveView === 'function' && window.innerWidth < 1024) {
      window.setMobileActiveView('customize');
    }
  }
}

// Validation for Step 1
function setInlineFieldError(inputEl, errorId, message) {
  if (!inputEl) return;
  let errEl = document.getElementById(errorId);
  if (!errEl && inputEl.parentElement) {
    errEl = document.createElement('p');
    errEl.id = errorId;
    errEl.className = 'mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hidden';
    inputEl.parentElement.appendChild(errEl);
  }
  if (message) {
    inputEl.classList.add('border-red-500', 'ring-2', 'ring-red-400/40');
    inputEl.setAttribute('aria-invalid', 'true');
    inputEl.setAttribute('aria-describedby', errorId);
    if (errEl) {
      errEl.textContent = message;
      errEl.classList.remove('hidden');
    }
  } else {
    inputEl.classList.remove('border-red-500', 'ring-2', 'ring-red-400/40');
    inputEl.setAttribute('aria-invalid', 'false');
    if (errEl) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }
  }
}

function validateStep1() {
  ensureDefaultMessagesPreserved();

  const errorBox = document.getElementById('step-1-validation-error');
  const recipientInput = document.getElementById('input-recipient');
  const senderInput = document.getElementById('input-sender');
  const dateInput = document.getElementById('input-date');

  if (senderInput) senderInput.classList.remove('border-red-500', 'ring-2', 'ring-red-400/40');

  let errors = [];

  if (!currentCustomData.recipient_name || currentCustomData.recipient_name.trim().length === 0) {
    const msg = "Please enter the recipient's name (e.g., Aarav).";
    errors.push("Recipient Name is required");
    setInlineFieldError(recipientInput, 'input-recipient-error', msg);
  } else {
    setInlineFieldError(recipientInput, 'input-recipient-error', '');
  }

  const requiresDate = templateRequiresEventDate(activeTemplate);
  if (requiresDate && (!currentCustomData.event_date || currentCustomData.event_date.trim().length === 0)) {
    const msg = "Please choose the celebration or birthday date.";
    errors.push("Date of Birth / Celebration Date is required");
    setInlineFieldError(dateInput, 'input-date-error', msg);
  } else {
    setInlineFieldError(dateInput, 'input-date-error', '');
  }

  // Validate dynamic manifest fields (only Name/DOB are required; uncustomized messages/texts keep their template defaults)
  const dynContainer = document.getElementById('template-dynamic-fields-container');
  if (dynContainer && activeTemplate) {
    const manifest = activeTemplate.manifest;
    const rawFields = (manifest && manifest.fields) || activeTemplate.fields || [];
    rawFields.forEach(f => {
      const fKey = f.id || f.key;
      const el = dynContainer.querySelector(`[data-field-key="${fKey}"]`);
      if (el && el.style.display !== 'none' && !el.classList.contains('wm-field-hidden')) {
        const fieldForVal = { ...f, required: isMandatoryIdentityField(fKey) };
        if (window.WishMagicFieldRenderer) {
          const valResult = window.WishMagicFieldRenderer.validate(fieldForVal, currentCustomData[fKey]);
          if (!valResult.valid) {
            errors.push(valResult.errors[0] || `${f.label || fKey} is invalid`);
            el.classList.add('wm-field-invalid');
            const inputCtrl = el.querySelector('input, textarea, select');
            if (inputCtrl) inputCtrl.classList.add('border-red-500', 'ring-2', 'ring-red-400/40');
          } else {
            el.classList.remove('wm-field-invalid');
            const inputCtrl = el.querySelector('input, textarea, select');
            if (inputCtrl) inputCtrl.classList.remove('border-red-500', 'ring-2', 'ring-red-400/40');
          }
        }
      }
    });
  }

  if (errors.length > 0) {
    if (window._activeStep1SubTab && window._activeStep1SubTab !== 'basic' && window._activeStep1SubTab !== 'all') {
      window.switchStep1SubTab('basic');
    }
    if (errorBox) {
      errorBox.setAttribute('role', 'alert');
      errorBox.setAttribute('aria-live', 'assertive');
      errorBox.innerHTML = `
        <div class="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2 mb-3">
          <span class="material-symbols-outlined text-[18px]">error</span>
          <span>Please complete the required fields: ${errors.join(', ')}</span>
        </div>
      `;
      errorBox.classList.remove('hidden');
    }
    showToast('⚠️ Please fill in all required fields');
    return false;
  }

  if (errorBox) errorBox.classList.add('hidden');
  return true;
}

const DEFAULT_RELATIONSHIP_CONFIGS = {
  girlfriend: {
    theme: { style: 'romantic', mood: 'intimate' },
    palette: { primary: '#ec4899', secondary: '#be185d', accent: '#f43f5e', background: '#fff1f2' },
    messages: {
      defaultWish: 'To my dearest girlfriend, you are the magic in every single day of my life. Happy Birthday my love!',
      heading: 'Forever Yours ❤️',
      subheading: 'A celebration crafted with all my heart'
    },
    atmosphere: { particles: 'floating_hearts', intensity: 'vibrant', glow: 'rose_gold' },
    musicCategory: 'romantic'
  },
  boyfriend: {
    theme: { style: 'romantic', mood: 'warm' },
    palette: { primary: '#3b82f6', secondary: '#1d4ed8', accent: '#60a5fa', background: '#eff6ff' },
    messages: {
      defaultWish: 'To my handsome boyfriend, thank you for being my rock, my greatest laugh, and my favorite adventure. Happy Birthday!',
      heading: 'My Best Friend & Love 💙',
      subheading: 'Celebrating the incredible person you are'
    },
    atmosphere: { particles: 'sparkling_stars', intensity: 'warm', glow: 'sapphire' },
    musicCategory: 'romantic'
  },
  crush: {
    theme: { style: 'romantic', mood: 'playful_shy' },
    palette: { primary: '#a855f7', secondary: '#7e22ce', accent: '#c084fc', background: '#faf5ff' },
    messages: {
      defaultWish: 'Hey there! Just wanted to make sure your special day is as wonderfully captivating as your smile. Happy Birthday ✨',
      heading: 'A Little Secret Magic ✨',
      subheading: 'Sent with a quiet smile just for you'
    },
    atmosphere: { particles: 'stardust_chimes', intensity: 'subtle', glow: 'lavender_dream' },
    musicCategory: 'romantic'
  },
  friend: {
    theme: { style: 'celebration', mood: 'energetic' },
    palette: { primary: '#f59e0b', secondary: '#d97706', accent: '#fbbf24', background: '#fffbeb' },
    messages: {
      defaultWish: 'Happy Birthday to my absolute favorite human! Here is to countless more wild memories and unstoppable laughter.',
      heading: 'Best Friends Forever 🎈',
      subheading: 'Cheers to another year of legendary times!'
    },
    atmosphere: { particles: 'confetti_burst', intensity: 'high', glow: 'golden_sunshine' },
    musicCategory: 'celebration'
  },
  best_friend: {
    theme: { style: 'celebration', mood: 'energetic' },
    palette: { primary: '#f59e0b', secondary: '#d97706', accent: '#fbbf24', background: '#fffbeb' },
    messages: {
      defaultWish: 'Happy Birthday to my absolute best friend and ride-or-die! May your special year be legendary and filled with adventures.',
      heading: 'Ride or Die Bestie 🌟',
      subheading: 'To the one who knows all my stories'
    },
    atmosphere: { particles: 'confetti_burst', intensity: 'high', glow: 'golden_sunshine' },
    musicCategory: 'celebration'
  },
  wife: {
    theme: { style: 'romantic', mood: 'deep_love' },
    palette: { primary: '#e11d48', secondary: '#9f1239', accent: '#fb7185', background: '#fff1f2' },
    messages: {
      defaultWish: 'To my beloved wife, thank you for filling our world with grace, boundless love, and gentle warmth. Happy Birthday my queen.',
      heading: 'My Wife, My Everything 💍',
      subheading: 'Honoring our beautiful journey together'
    },
    atmosphere: { particles: 'golden_ribbons', intensity: 'graceful', glow: 'champagne_rose' },
    musicCategory: 'romantic'
  },
  husband: {
    theme: { style: 'romantic', mood: 'deep_love' },
    palette: { primary: '#2563eb', secondary: '#1e40af', accent: '#38bdf8', background: '#f0f9ff' },
    messages: {
      defaultWish: 'Happy Birthday to my loving husband. Thank you for your strength, your kindness, and the countless smiles you bring to my heart.',
      heading: 'My King & Partner 👑',
      subheading: 'Celebrating our everlasting bond'
    },
    atmosphere: { particles: 'celestial_glow', intensity: 'steady', glow: 'royal_gold' },
    musicCategory: 'romantic'
  },
  mother: {
    theme: { style: 'peaceful', mood: 'reverent' },
    palette: { primary: '#d97706', secondary: '#b45309', accent: '#f59e0b', background: '#fffbeb' },
    messages: {
      defaultWish: 'Dearest Mom, thank you for your unconditional love, endless sacrifices, and warm embrace. Happy Birthday to the heart of our family.',
      heading: 'To the World\'s Best Mom 🌸',
      subheading: 'With infinite love and eternal gratitude'
    },
    atmosphere: { particles: 'golden_dust', intensity: 'gentle', glow: 'amber_warmth' },
    musicCategory: 'acoustic'
  },
  father: {
    theme: { style: 'peaceful', mood: 'reverent' },
    palette: { primary: '#0284c7', secondary: '#0369a1', accent: '#38bdf8', background: '#f0f9ff' },
    messages: {
      defaultWish: 'Happy Birthday Dad! Thank you for being my constant guide, my protector, and the greatest inspiration in my life.',
      heading: 'To My Hero, Dad 👔',
      subheading: 'With respect, pride, and boundless love'
    },
    atmosphere: { particles: 'starlight_chimes', intensity: 'gentle', glow: 'sapphire' },
    musicCategory: 'acoustic'
  },
  family: {
    theme: { style: 'celebration', mood: 'warm' },
    palette: { primary: '#8b5cf6', secondary: '#6d28d9', accent: '#fbbf24', background: '#faf5ff' },
    messages: {
      defaultWish: 'Wishing our wonderful family member the happiest celebration! May joy, laughter, and blessings surround you always.',
      heading: 'Family Forever 🏡',
      subheading: 'Celebrating someone truly special to us all'
    },
    atmosphere: { particles: 'confetti_burst', intensity: 'high', glow: 'golden_sunshine' },
    musicCategory: 'celebration'
  }
};

function findRelationshipVariantConfig(rel) {
  if (!rel) return null;
  const relNorm = String(rel).toLowerCase().trim().replace(/\s+/g, '_');
  if (activeTemplate && window.WishMagicVariantFlow) {
    const resolved = window.WishMagicVariantFlow.resolveVariantForRelation(activeTemplate, relNorm);
    if (resolved) {
      return {
        ...resolved,
        palette: (resolved.theme && (resolved.theme.palette || resolved.theme)) || null,
        messages: resolved.messages || {}
      };
    }
  }
  if (activeTemplate && Array.isArray(activeTemplate.variants)) {
    const match = activeTemplate.variants.find(v =>
      (v.relationshipSlug && v.relationshipSlug.toLowerCase() === relNorm) ||
      (v.relationship_slug && v.relationship_slug.toLowerCase() === relNorm) ||
      (v.relationship && v.relationship.toLowerCase() === relNorm)
    );
    if (match) {
      const cfg = typeof match.configuration_json === 'string' ? JSON.parse(match.configuration_json) : (match.configuration || match);
      return cfg;
    }
  }
  return DEFAULT_RELATIONSHIP_CONFIGS[relNorm] || null;
}

// Form Inputs Handlers
function initFormInputs() {
  window.handleRecipientInput = function(val) {
    currentCustomData.recipient_name = val;
    if (window._userModifiedFields instanceof Set) window._userModifiedFields.add('recipient_name');
    if (val && String(val).trim()) {
      setInlineFieldError(document.getElementById('input-recipient'), 'input-recipient-error', '');
    }
    triggerAutosave();
    syncDataToIframe();
    if (typeof window.updateCustomizationProgressUI === 'function') window.updateCustomizationProgressUI();
    if (typeof window.initSmartWishLinkUI === 'function' && currentStep === 4) {
      window.initSmartWishLinkUI();
    }
  };

  window.handleSenderInput = function(val) {
    currentCustomData.sender_name = val;
    if (window._userModifiedFields instanceof Set) window._userModifiedFields.add('sender_name');
    triggerAutosave();
    syncDataToIframe();
    if (typeof window.updateCustomizationProgressUI === 'function') window.updateCustomizationProgressUI();
    if (typeof window.initSmartWishLinkUI === 'function' && currentStep === 4) {
      window.initSmartWishLinkUI();
    }
  };

  window.handleDateInput = function(val) {
    currentCustomData.event_date = val;
    if (window._userModifiedFields instanceof Set) window._userModifiedFields.add('event_date');
    if (val && String(val).trim()) {
      setInlineFieldError(document.getElementById('input-date'), 'input-date-error', '');
    }
    triggerAutosave();
    syncDataToIframe();
    if (typeof window.updateCustomizationProgressUI === 'function') window.updateCustomizationProgressUI();
  };

  window.handleContactInput = function(val) {
    currentCustomData.sender_contact = val;
    if (window._userModifiedFields instanceof Set) window._userModifiedFields.add('sender_contact');
    triggerAutosave();
  };

  window.handleOccasionInput = function(val) {
    currentCustomData.occasion = val;
    triggerAutosave();
    if (typeof window.initSmartWishLinkUI === 'function') {
      window.initSmartWishLinkUI();
    }
  };

  window.handleRelationshipInput = function(val) {
    currentCustomData.relationship = val;
    const resetBtn = document.getElementById('btn-reset-variant-defaults');

    // If activeTemplate is a multi-variant template family, resolve and apply the full relationship variant safely
    if (activeTemplate && window.WishMagicVariantFlow && window.WishMagicVariantFlow.isVariantFamily(activeTemplate)) {
      const matchedVariant = window.WishMagicVariantFlow.resolveVariantForRelation(activeTemplate, val);
      if (matchedVariant && (!activeTemplate.selectedVariant || activeTemplate.selectedVariant.id !== matchedVariant.id)) {
        applySelectedVariantToCustomizer(matchedVariant, false);
      }
    } else if (activeTemplate && Array.isArray(activeTemplate.variants) && activeTemplate.variants.length > 0) {
      const relNorm = String(val || '').toLowerCase().trim().replace(/\s+/g, '_');
      const matchedVariant = activeTemplate.variants.find(v =>
        v && v.enabled !== false && v.status !== 'disabled' && (
          String(v.relationship || v.relationshipSlug || v.slug || '').toLowerCase().replace(/-/g, '_') === relNorm
        )
      );
      if (matchedVariant && (!activeTemplate.selectedVariant || activeTemplate.selectedVariant.id !== matchedVariant.id)) {
        applySelectedVariantToCustomizer(matchedVariant, false);
      }
    }

    const variantConfig = findRelationshipVariantConfig(val);
    if (variantConfig) {
      if (resetBtn) resetBtn.classList.remove('hidden');

      // Auto-apply message if empty or unchanged from prior default
      const messageInput = document.getElementById('input-message');
      const curMsg = (currentCustomData.custom_message || '').trim();
      const variantWish = variantConfig.messages?.defaultWish || variantConfig.messages?.main_message;

      if (!curMsg && variantWish) {
        currentCustomData.custom_message = variantWish;
        if (messageInput) {
          messageInput.value = variantWish;
          const counter = document.getElementById('message-char-count');
          if (counter) counter.textContent = `${variantWish.length} / 500`;
        }
      }

      // Apply theme palette if provided and not explicitly overridden
      if (variantConfig.palette && variantConfig.palette.primary) {
        if (!currentCustomData._userOverrodePalette) {
          currentCustomData.colors = {
            ...currentCustomData.colors,
            primary: variantConfig.palette.primary,
            secondary: variantConfig.palette.secondary || currentCustomData.colors.secondary,
            accent: variantConfig.palette.accent || currentCustomData.colors.accent,
            background: variantConfig.palette.background || currentCustomData.colors.background
          };
          if (variantConfig.theme?.style) {
            currentCustomData.theme = variantConfig.theme.style;
          }
          const colPrimary = document.getElementById('color-primary-input');
          if (colPrimary) colPrimary.value = currentCustomData.colors.primary;
          const hexPrimary = document.getElementById('hex-primary-label');
          if (hexPrimary) hexPrimary.textContent = currentCustomData.colors.primary;
          const colSecondary = document.getElementById('color-secondary-input');
          if (colSecondary) colSecondary.value = currentCustomData.colors.secondary;
        }
      }
    } else {
      if (resetBtn) resetBtn.classList.add('hidden');
    }

    triggerAutosave();
    syncDataToIframe();
    if (window.WishMagicRuntimeBridge) {
      window.WishMagicRuntimeBridge.updateState(currentCustomData);
    }
    if (typeof window.initSmartWishLinkUI === 'function') {
      window.initSmartWishLinkUI();
    }
  };

  window.resetToVariantDefaults = function() {
    const rel = currentCustomData.relationship;
    const variantConfig = findRelationshipVariantConfig(rel);
    if (!variantConfig) {
      showToast('No variant defaults configured for this relationship');
      return;
    }

    const variantWish = variantConfig.messages?.defaultWish || variantConfig.messages?.main_message;
    if (variantWish) {
      currentCustomData.custom_message = variantWish;
      const messageInput = document.getElementById('input-message');
      if (messageInput) messageInput.value = variantWish;
      const counter = document.getElementById('message-char-count');
      if (counter) counter.textContent = `${variantWish.length} / 500`;
    }

    if (variantConfig.palette) {
      currentCustomData.colors = {
        ...currentCustomData.colors,
        primary: variantConfig.palette.primary || currentCustomData.colors.primary,
        secondary: variantConfig.palette.secondary || currentCustomData.colors.secondary,
        accent: variantConfig.palette.accent || currentCustomData.colors.accent
      };
      if (variantConfig.theme?.style) {
        currentCustomData.theme = variantConfig.theme.style;
      }
      currentCustomData._userOverrodePalette = false;

      const colPrimary = document.getElementById('color-primary-input');
      if (colPrimary) colPrimary.value = currentCustomData.colors.primary;
      const hexPrimary = document.getElementById('hex-primary-label');
      if (hexPrimary) hexPrimary.textContent = currentCustomData.colors.primary;
      const colSecondary = document.getElementById('color-secondary-input');
      if (colSecondary) colSecondary.value = currentCustomData.colors.secondary;
    }

    showToast(`Reset to ${rel || 'relationship'} crafted defaults ↺`);
    syncDataToIframe();
    if (window.WishMagicRuntimeBridge) {
      window.WishMagicRuntimeBridge.updateState(currentCustomData);
    }
    triggerAutosave();
  };

  window.handleMessageInput = function(val) {
    currentCustomData.custom_message = val;
    const counter = document.getElementById('message-char-count');
    if (counter) counter.textContent = `${val.length} / 500`;
    triggerAutosave();
    syncDataToIframe();
  };
}

// -----------------------------------------------------------------------------
// PART 5: ADVANCED MEDIA SYSTEM CONTROLLERS (PHOTOS, GALLERY, VOICE, MUSIC)
// -----------------------------------------------------------------------------

let replacePhotoTargetId = null;
let isAudioSeeking = false;

// Initialize Media System UI from State & Template Capabilities
function initMediaSystemUI() {
  if (!window.WishMediaSystem) return;

  // 1. Normalize media state
  currentCustomData.media = window.WishMediaSystem.normalizeMediaState(currentCustomData);
  window.WishMediaSystem.syncMediaToCustomData(currentCustomData.media, currentCustomData);

  // 2. Setup Drag & Drop Zone for Photos
  setupPhotoDropzone();

  // 3. Render Template Capabilities Notice & Enforce Limits
  updateMediaCapabilitiesUI();

  // 4. Render Gallery Layout Selector State
  updateGalleryLayoutButtons(currentCustomData.media.galleryLayout || 'grid');

  // 5. Render Photos List & Thumbnails
  renderPhotosUI();

  // 6. Render Voice Note Player / Recorder
  renderVoiceNotePlayer();

  // 7. Render Curated Music Soundscapes List & Live Player Bar
  renderCuratedMusicLibrary();
  updateStudioPlayerUI();
}

function updateMediaCapabilitiesUI() {
  const tpl = activeTemplate || {};
  const caps = tpl.capabilities || {};

  // 1. Gallery / Photos capability
  const gallerySupported = caps.gallery !== false;
  const maxPhotos = typeof tpl.supportsGallery === 'number' 
    ? tpl.supportsGallery 
    : (caps.galleryMax || CONFIG_MAX_PHOTOS());

  const countBadge = document.getElementById('photo-count-badge');
  if (countBadge) {
    const curCount = (currentCustomData.media && currentCustomData.media.photos) ? currentCustomData.media.photos.length : 0;
    countBadge.textContent = `${curCount} / ${maxPhotos} Photos`;
  }

  const galNotice = document.getElementById('gallery-capability-notice');
  const galText = document.getElementById('gallery-capability-text');
  const photoDropzone = document.getElementById('photo-dropzone');
  const galleryLayoutSelector = document.getElementById('gallery-layout-selector');

  if (!gallerySupported) {
    if (galText) galText.textContent = 'Photo gallery & memories are disabled by this template design.';
    if (galNotice) galNotice.classList.remove('hidden');
    if (photoDropzone) photoDropzone.classList.add('opacity-40', 'pointer-events-none');
    if (galleryLayoutSelector) galleryLayoutSelector.classList.add('opacity-40', 'pointer-events-none');
  } else if (galNotice && galText) {
    if (typeof tpl.supportsGallery === 'number' || caps.galleryMax) {
      galText.textContent = `This template layout is optimized for up to ${maxPhotos} celebration photos.`;
      galNotice.classList.remove('hidden');
    } else {
      galNotice.classList.add('hidden');
    }
    if (photoDropzone) photoDropzone.classList.remove('opacity-40', 'pointer-events-none');
    if (galleryLayoutSelector) galleryLayoutSelector.classList.remove('opacity-40', 'pointer-events-none');
  }

  // 2. Voice note capability check (Part 10 Section 11)
  const voiceNotice = document.getElementById('voice-capability-notice');
  const voiceBtns = document.getElementById('voice-action-buttons-group');
  const voiceSupported = caps.voiceNote !== false && tpl.supportsVoice !== false;

  if (!voiceSupported) {
    if (voiceNotice) {
      voiceNotice.textContent = 'Voice dedications are not supported by this template.';
      voiceNotice.classList.remove('hidden');
    }
    if (voiceBtns) voiceBtns.classList.add('opacity-40', 'pointer-events-none');
  } else {
    if (voiceNotice) voiceNotice.classList.add('hidden');
    if (voiceBtns) voiceBtns.classList.remove('opacity-40', 'pointer-events-none');
  }

  // 3. Music capability check (Part 10 Section 11)
  const musicNotice = document.getElementById('music-capability-notice');
  const musicSupported = caps.music !== false && tpl.supportsMusic !== false;
  const musicSection = document.getElementById('music-section-wrapper');

  if (!musicSupported) {
    if (musicNotice) {
      musicNotice.textContent = 'This template emphasizes ambient silence and does not feature audio playback.';
      musicNotice.classList.remove('hidden');
    }
    const musicSwitch = document.getElementById('switch-enable-music');
    if (musicSwitch) {
      musicSwitch.checked = false;
      musicSwitch.disabled = true;
    }
  } else if (musicNotice) {
    musicNotice.classList.add('hidden');
    const musicSwitch = document.getElementById('switch-enable-music');
    if (musicSwitch) musicSwitch.disabled = false;
  }
}

function CONFIG_MAX_PHOTOS() {
  const isPrem = (window.WishEntitlement && typeof window.WishEntitlement.isPremium === 'function')
    ? window.WishEntitlement.isPremium()
    : false;
  const planLimits = (window.WishPlanService && typeof window.WishPlanService.getPlanLimits === 'function')
    ? window.WishPlanService.getPlanLimits(isPrem ? 'premium' : 'free')
    : { maxPhotos: isPrem ? 16 : 3 };
  const planMax = planLimits.maxPhotos || (isPrem ? 16 : 3);
  if (activeTemplate && typeof activeTemplate.supportsGallery === 'number') {
    return Math.min(activeTemplate.supportsGallery, planMax);
  }
  return planMax;
}

// -----------------------------------------------------------------------------
// PHOTO MANAGER (MULTIPLE UPLOAD, VALIDATION, REORDER, COVER, REPLACE, LIGHTBOX)
// -----------------------------------------------------------------------------
function setupPhotoDropzone() {
  const dropzone = document.getElementById('photo-dropzone');
  if (!dropzone || dropzone._dragSetupDone) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('border-pink-500', 'bg-pink-500/10', 'scale-[1.01]');
    }, false);
  });

  ['dragleave', 'dragend', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('border-pink-500', 'bg-pink-500/10', 'scale-[1.01]');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      processMultiplePhotoFiles(Array.from(dt.files));
    }
  }, false);

  dropzone.addEventListener('click', (e) => {
    // If not clicking input itself
    if (e.target.tagName !== 'INPUT') {
      const picker = document.getElementById('photo-file-picker');
      if (picker) picker.click();
    }
  });

  dropzone._dragSetupDone = true;
}

window.handlePhotoFileInput = function(input) {
  if (!input.files || input.files.length === 0) return;
  processMultiplePhotoFiles(Array.from(input.files));
  input.value = '';
};

async function processMultiplePhotoFiles(files) {
  const maxPhotos = CONFIG_MAX_PHOTOS();
  const media = currentCustomData.media;
  let added = 0;

  showPhotoError(null); // Clear errors

  // Check limit before processing files
  if (media.photos.length >= maxPhotos) {
    if (window.WishPremiumLock && (!window.WishEntitlement || !window.WishEntitlement.isPremium())) {
      window.WishPremiumLock.open({
        context: 'media_limit',
        onUnlocked: () => {
          updateMediaCapabilitiesUI();
          renderPhotosUI();
        }
      });
    }
    showPhotoError(`You've reached the photo limit of ${maxPhotos} photos for your plan.`);
    showToast(`Photo limit reached (${maxPhotos} photos max). Unlock VIP for up to 16 photos!`);
    return;
  }

  for (const file of files) {
    if (media.photos.length >= maxPhotos) {
      if (window.WishPremiumLock && (!window.WishEntitlement || !window.WishEntitlement.isPremium())) {
        window.WishPremiumLock.open({
          context: 'media_limit',
          onUnlocked: () => {
            updateMediaCapabilitiesUI();
            renderPhotosUI();
          }
        });
      }
      showPhotoError(`Maximum limit of ${maxPhotos} photos reached for your plan.`);
      break;
    }

    try {
      // Validate & optimize via WishMediaSystem
      const optimized = await window.WishMediaSystem.ImageProcessor.processImageFile(file, 1600, 0.88);
      const photoId = 'photo_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4);
      const isFirst = media.photos.length === 0;

      const newPhoto = {
        id: photoId,
        name: file.name.replace(/\.[^/.]+$/, ''),
        src: optimized.src,
        url: optimized.src,
        order: media.photos.length,
        isCover: isFirst || !media.coverPhoto
      };

      media.photos.push(newPhoto);

      if (isFirst || !media.coverPhoto) {
        media.coverPhoto = optimized.src;
      }

      added++;
    } catch (err) {
      console.warn('Photo processing error:', err);
      showPhotoError(err.message || 'Image is too large or could not be decoded. Please choose a smaller image.');
    }
  }

  if (added > 0) {
    window.WishMediaSystem.syncMediaToCustomData(media, currentCustomData);
    renderPhotosUI();
    updateMediaCapabilitiesUI();
    triggerAutosave();
    syncDataToIframe();
    showToast(`📸 Added ${added} photo memory${added > 1 ? 'ies' : ''}!`);
  }
}

function showPhotoError(msg) {
  const errorEl = document.getElementById('photo-upload-error');
  const errorText = document.getElementById('photo-upload-error-text');
  if (!errorEl) return;

  if (msg) {
    if (errorText) errorText.textContent = msg;
    errorEl.classList.remove('hidden');
    setTimeout(() => { errorEl.classList.add('hidden'); }, 6000);
  } else {
    errorEl.classList.add('hidden');
  }
}

// In-place Photo Replacement (Section 34)
window.replacePhoto = function(photoId) {
  replacePhotoTargetId = photoId;
  const picker = document.getElementById('photo-replace-picker');
  if (picker) {
    picker.value = '';
    picker.click();
  }
};

window.handleReplacePhotoFile = async function(input) {
  if (!input.files || input.files.length === 0 || !replacePhotoTargetId) return;
  const file = input.files[0];
  const targetId = replacePhotoTargetId;
  replacePhotoTargetId = null;

  try {
    const optimized = await window.WishMediaSystem.ImageProcessor.processImageFile(file, 1600, 0.88);
    const media = currentCustomData.media;
    const idx = media.photos.findIndex(p => p.id === targetId);

    if (idx !== -1) {
      const wasCover = media.photos[idx].isCover || media.coverPhoto === media.photos[idx].src;
      media.photos[idx].src = optimized.src;
      media.photos[idx].url = optimized.src;
      media.photos[idx].name = file.name.replace(/\.[^/.]+$/, '');

      if (wasCover) {
        media.coverPhoto = optimized.src;
      }

      window.WishMediaSystem.syncMediaToCustomData(media, currentCustomData);
      renderPhotosUI();
      triggerAutosave();
      syncDataToIframe();
      showToast('🔄 Photo replaced in-place!');
    }
  } catch (err) {
    showPhotoError(err.message || 'Image is too large or could not be decoded. Please choose a smaller image.');
  }

  input.value = '';
};

// Photo Removal (Section 11)
window.removePhoto = function(photoId) {
  const media = currentCustomData.media;
  const idx = media.photos.findIndex(p => p.id === photoId);
  if (idx === -1) return;

  const wasCover = media.photos[idx].isCover || media.coverPhoto === media.photos[idx].src;
  media.photos.splice(idx, 1);

  // Update order indices
  media.photos.forEach((p, i) => { p.order = i; });

  if (wasCover) {
    if (media.photos.length > 0) {
      media.photos[0].isCover = true;
      media.coverPhoto = media.photos[0].src;
    } else {
      media.coverPhoto = activeTemplate ? (activeTemplate.thumbnail || '/assets/file_ab2082.png') : null;
    }
  }

  window.WishMediaSystem.syncMediaToCustomData(media, currentCustomData);
  renderPhotosUI();
  updateMediaCapabilitiesUI();
  triggerAutosave();
  syncDataToIframe();
  showToast('Photo removed');
};

// Set as Cover Photo (Section 9)
window.setCoverPhoto = function(photoId) {
  const media = currentCustomData.media;
  media.photos.forEach(p => {
    p.isCover = (p.id === photoId);
    if (p.isCover) {
      media.coverPhoto = p.src;
    }
  });

  window.WishMediaSystem.syncMediaToCustomData(media, currentCustomData);
  renderPhotosUI();
  triggerAutosave();
  syncDataToIframe();
  showToast('⭐️ Set as primary cover photo');
};

window.removeCoverPhoto = function() {
  const media = currentCustomData.media;
  if (media.photos.length > 0) {
    media.photos.forEach((p, i) => { p.isCover = (i === 0); });
    media.coverPhoto = media.photos[0].src;
  } else {
    media.coverPhoto = null;
  }

  window.WishMediaSystem.syncMediaToCustomData(media, currentCustomData);
  renderPhotosUI();
  triggerAutosave();
  syncDataToIframe();
  showToast('Cover photo reset to default');
};

// Reorder Photos (Section 10)
window.movePhoto = function(photoId, direction) {
  const media = currentCustomData.media;
  const idx = media.photos.findIndex(p => p.id === photoId);
  if (idx === -1) return;

  const newIdx = direction === 'left' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= media.photos.length) return;

  const temp = media.photos[idx];
  media.photos[idx] = media.photos[newIdx];
  media.photos[newIdx] = temp;

  media.photos.forEach((p, i) => { p.order = i; });

  window.WishMediaSystem.syncMediaToCustomData(media, currentCustomData);
  renderPhotosUI();
  triggerAutosave();
  syncDataToIframe();
};

// Desktop Drag-and-Drop Reordering
let draggedPhotoId = null;

window.handlePhotoDragStart = function(e, photoId) {
  draggedPhotoId = photoId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', photoId);
};

window.handlePhotoDragOver = function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
};

window.handlePhotoDrop = function(e, targetPhotoId) {
  e.preventDefault();
  if (!draggedPhotoId || draggedPhotoId === targetPhotoId) return;

  const media = currentCustomData.media;
  const fromIdx = media.photos.findIndex(p => p.id === draggedPhotoId);
  const toIdx = media.photos.findIndex(p => p.id === targetPhotoId);

  if (fromIdx === -1 || toIdx === -1) return;

  const [movedItem] = media.photos.splice(fromIdx, 1);
  media.photos.splice(toIdx, 0, movedItem);

  media.photos.forEach((p, i) => { p.order = i; });
  draggedPhotoId = null;

  window.WishMediaSystem.syncMediaToCustomData(media, currentCustomData);
  renderPhotosUI();
  triggerAutosave();
  syncDataToIframe();
  showToast('Photo order updated');
};

// Lightbox modal opener (Section 33)
window.openPhotoLightbox = function(photoId) {
  if (!window.WishMediaSystem || !window.WishMediaSystem.lightbox) return;
  const photos = currentCustomData.media.photos || [];
  const idx = photos.findIndex(p => p.id === photoId);
  window.WishMediaSystem.lightbox.open(photos, Math.max(0, idx));
};

// Gallery Layout Switcher (Section 15)
window.selectGalleryLayout = function(layout) {
  // Part 11: Feature Access Check
  if (window.WishFeatureAccess) {
    const access = window.WishFeatureAccess.canUseGalleryLayout(layout);
    if (!access.allowed) {
      if (window.WishPremiumLock) {
        window.WishPremiumLock.open({
          context: 'media_limit',
          key: layout,
          onUnlocked: () => {
            window.selectGalleryLayout(layout);
          }
        });
      }
      return;
    }
  }

  if (!currentCustomData.media) currentCustomData.media = {};
  currentCustomData.media.galleryLayout = layout;
  currentCustomData.galleryLayout = layout;

  updateGalleryLayoutButtons(layout);
  triggerAutosave();
  syncDataToIframe();
  showToast(`Gallery layout set to ${layout.charAt(0).toUpperCase() + layout.slice(1)}`);
};

function updateGalleryLayoutButtons(activeLayout) {
  const container = document.getElementById('gallery-layout-selector');
  if (!container) return;

  container.querySelectorAll('.gallery-layout-btn').forEach(btn => {
    const lay = btn.getAttribute('data-layout');
    if (lay === activeLayout) {
      btn.className = 'gallery-layout-btn py-2 px-3 rounded-xl border border-pink-500 bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs';
    } else {
      btn.className = 'gallery-layout-btn py-2 px-3 rounded-xl border border-purple-200/70 dark:border-purple-800/60 bg-white/70 dark:bg-purple-950/40 text-purple-950 dark:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer';
    }
  });
}

// Render Thumbnails UI
function renderPhotosUI() {
  const container = document.getElementById('photo-thumbnails-list');
  const emptyState = document.getElementById('photos-empty-state');
  if (!container) return;

  container.innerHTML = '';
  const photos = (currentCustomData.media && currentCustomData.media.photos) ? currentCustomData.media.photos : [];

  if (emptyState) {
    if (photos.length === 0) {
      emptyState.classList.remove('hidden');
    } else {
      emptyState.classList.add('hidden');
    }
  }

  photos.forEach((photo, idx) => {
    const isCover = photo.isCover || (currentCustomData.media && currentCustomData.media.coverPhoto === photo.src);
    const card = document.createElement('div');
    card.draggable = true;
    card.ondragstart = (e) => handlePhotoDragStart(e, photo.id);
    card.ondragover = (e) => handlePhotoDragOver(e);
    card.ondrop = (e) => handlePhotoDrop(e, photo.id);

    card.className = `group relative aspect-square rounded-2xl overflow-hidden border-2 transition-all cursor-grab active:cursor-grabbing ${
      isCover ? 'border-amber-400 shadow-md shadow-amber-400/25 ring-2 ring-amber-400/30' : 'border-purple-200/80 dark:border-purple-800/60'
    } bg-purple-950/20 flex flex-col justify-between`;

    card.innerHTML = `
      <img src="${photo.src || photo.url}" alt="${photo.name}" class="w-full h-full object-cover select-none" onclick="openPhotoLightbox('${photo.id}')" title="Click to open full preview"/>
      
      <!-- Ambient Gradient Overlay -->
      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity pointer-events-none"></div>

      <!-- Top Badges / Remove -->
      <div class="absolute top-1.5 inset-x-1.5 flex items-center justify-between z-10">
        ${isCover 
          ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-400 text-purple-950 shadow-sm flex items-center gap-1">⭐ Cover</span>`
          : `<span class="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold bg-black/60 text-white/80">#0${idx + 1}</span>`
        }
        <button type="button" onclick="removePhoto('${photo.id}')" class="w-6 h-6 rounded-full bg-black/70 hover:bg-red-500 text-white flex items-center justify-center text-xs transition cursor-pointer" title="Remove photo">✕</button>
      </div>

      <!-- Bottom Actions (Reorder, Replace, Set Cover) -->
      <div class="absolute bottom-1.5 inset-x-1.5 flex items-center justify-between gap-1 z-10">
        <div class="flex items-center gap-1">
          <button type="button" onclick="movePhoto('${photo.id}', 'left')" ${idx === 0 ? 'disabled class="opacity-25 pointer-events-none"' : ''} class="w-6 h-6 rounded-lg bg-black/70 hover:bg-black text-white text-[10px] flex items-center justify-center font-bold cursor-pointer" title="Move Left">◀</button>
          <button type="button" onclick="movePhoto('${photo.id}', 'right')" ${idx === photos.length - 1 ? 'disabled class="opacity-25 pointer-events-none"' : ''} class="w-6 h-6 rounded-lg bg-black/70 hover:bg-black text-white text-[10px] flex items-center justify-center font-bold cursor-pointer" title="Move Right">▶</button>
        </div>

        <div class="flex items-center gap-1">
          <button type="button" onclick="replacePhoto('${photo.id}')" class="px-1.5 py-0.5 rounded-md bg-black/70 hover:bg-purple-600 text-white text-[9px] font-bold transition cursor-pointer" title="Replace with another image">Replace</button>
          ${!isCover ? `
            <button type="button" onclick="setCoverPhoto('${photo.id}')" class="px-1.5 py-0.5 rounded-md bg-black/70 hover:bg-amber-400 hover:text-black text-white text-[9px] font-bold transition cursor-pointer">Set Cover</button>
          ` : `
            <button type="button" onclick="removeCoverPhoto()" class="px-1.5 py-0.5 rounded-md bg-amber-400/90 text-black text-[9px] font-bold transition cursor-pointer" title="Reset Cover">Cover ✓</button>
          `}
        </div>
      </div>
    `;

    container.appendChild(card);
  });
  if (typeof renderTemplatePhotoSlotsManager === 'function') {
    renderTemplatePhotoSlotsManager();
  }
}

// -----------------------------------------------------------------------------
// VOICE NOTE SYSTEM (RECORDING, PERMISSIONS, PLAYBACK, RECORD AGAIN)
// -----------------------------------------------------------------------------
window.startVoiceRecording = function() {
  // Part 11: Feature Access Check
  if (window.WishFeatureAccess) {
    const access = window.WishFeatureAccess.canUploadVoiceNote();
    if (!access.allowed) {
      if (window.WishPremiumLock) {
        window.WishPremiumLock.open({
          context: 'voice',
          onUnlocked: () => {
            window.startVoiceRecording();
          }
        });
      }
      return;
    }
  }

  const voiceRecorder = window.WishMediaSystem.voiceRecorder;
  const errorEl = document.getElementById('voice-recorder-error');
  const banner = document.getElementById('voice-recording-banner');
  const timerText = document.getElementById('voice-live-timer');
  const btnGroup = document.getElementById('voice-action-buttons-group');

  if (errorEl) errorEl.classList.add('hidden');

  voiceRecorder.startRecording(
    // onTick
    (seconds) => {
      if (banner) banner.classList.remove('hidden');
      if (btnGroup) btnGroup.classList.add('hidden');
      if (timerText) {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        timerText.textContent = `${mins}:${secs} (Max 02:00)`;
      }
    },
    // onComplete
    (result) => {
      if (banner) banner.classList.add('hidden');
      if (btnGroup) btnGroup.classList.remove('hidden');

      // Update voice state (replaces previous recording now that new one is done)
      currentCustomData.media.voiceNote = {
        enabled: true,
        type: 'record',
        name: 'Spoken Voice Dedication',
        src: result.url,
        duration: result.duration,
        blob: result.blob
      };

      window.WishMediaSystem.syncMediaToCustomData(currentCustomData.media, currentCustomData);
      renderVoiceNotePlayer();
      triggerAutosave();
      syncDataToIframe();
      showToast('🎙️ Voice dedication note recorded successfully!');
    },
    // onError
    (err) => {
      if (banner) banner.classList.add('hidden');
      if (btnGroup) btnGroup.classList.remove('hidden');
      if (errorEl) {
        errorEl.textContent = err.message || 'Microphone permission was denied. You can upload an audio file instead.';
        errorEl.classList.remove('hidden');
      }
    }
  );
};

window.stopVoiceRecording = function() {
  window.WishMediaSystem.voiceRecorder.stopRecording();
};

window.cancelVoiceRecording = function() {
  window.WishMediaSystem.voiceRecorder.cancelRecording();
  const banner = document.getElementById('voice-recording-banner');
  const btnGroup = document.getElementById('voice-action-buttons-group');
  if (banner) banner.classList.add('hidden');
  if (btnGroup) btnGroup.classList.remove('hidden');
  showToast('Recording cancelled');
};

window.handleVoiceFileUpload = function(input) {
  if (!input.files || input.files.length === 0) return;

  // Part 11: Feature Access Check
  if (window.WishFeatureAccess) {
    const access = window.WishFeatureAccess.canUploadVoiceNote();
    if (!access.allowed) {
      if (window.WishPremiumLock) {
        window.WishPremiumLock.open({
          context: 'voice'
        });
      }
      input.value = '';
      return;
    }
  }

  const file = input.files[0];
  const errorEl = document.getElementById('voice-recorder-error');
  if (errorEl) errorEl.classList.add('hidden');

  if (file.size > 15 * 1024 * 1024) {
    if (errorEl) {
      errorEl.textContent = 'Audio file exceeds 15MB. Please choose a smaller audio file.';
      errorEl.classList.remove('hidden');
    }
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    currentCustomData.media.voiceNote = {
      enabled: true,
      type: 'upload',
      name: file.name,
      src: e.target.result,
      duration: 'Attached Audio'
    };

    window.WishMediaSystem.syncMediaToCustomData(currentCustomData.media, currentCustomData);
    renderVoiceNotePlayer();
    triggerAutosave();
    syncDataToIframe();
    showToast('🎙️ Audio note attached!');
  };

  reader.readAsDataURL(file);
  input.value = '';
};

window.removeVoiceNote = function() {
  currentCustomData.media.voiceNote = {
    enabled: false,
    type: 'none',
    name: '',
    src: '',
    duration: 0
  };

  window.WishMediaSystem.syncMediaToCustomData(currentCustomData.media, currentCustomData);
  renderVoiceNotePlayer();
  triggerAutosave();
  syncDataToIframe();
  showToast('Voice note removed');
};

function renderVoiceNotePlayer() {
  const container = document.getElementById('voice-player-container');
  const statusPill = document.getElementById('voice-status-pill');
  if (!container) return;

  const vn = currentCustomData.media ? currentCustomData.media.voiceNote : null;

  if (vn && vn.enabled && vn.src) {
    container.classList.remove('hidden');
    if (statusPill) {
      statusPill.textContent = 'Active ✓';
      statusPill.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300';
    }

    const durLabel = typeof vn.duration === 'number' ? `${vn.duration}s recording` : (vn.duration || 'Ready to play');

    container.innerHTML = `
      <div class="p-3.5 rounded-2xl bg-purple-100/90 dark:bg-purple-900/50 border border-purple-200 dark:border-purple-800 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
        <div class="flex items-center gap-3 w-full sm:w-auto truncate">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-500 to-purple-600 text-white flex items-center justify-center text-lg flex-shrink-0 shadow-md">
            🎙️
          </div>
          <div class="truncate">
            <h5 class="text-xs font-bold text-purple-950 dark:text-white truncate">${vn.name || 'Personal Spoken Note'}</h5>
            <p class="text-[11px] text-pink-600 dark:text-pink-300 font-mono">${durLabel}</p>
          </div>
        </div>

        <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
          <audio controls src="${vn.src}" class="h-8 max-w-[200px]"></audio>
          
          <button type="button" onclick="startVoiceRecording()" class="px-2 py-1 rounded-xl bg-purple-200 dark:bg-purple-800 hover:bg-purple-300 text-purple-950 dark:text-white text-[11px] font-bold transition cursor-pointer" title="Record Again (replaces when new recording finishes)">
            Re-Record
          </button>

          <button type="button" onclick="removeVoiceNote()" class="p-1.5 rounded-xl text-purple-700 hover:text-red-500 transition text-xs cursor-pointer" title="Remove voice note">
            ✕
          </button>
        </div>
      </div>
    `;
  } else {
    container.classList.add('hidden');
    container.innerHTML = '';
    if (statusPill) {
      statusPill.textContent = 'Optional';
      statusPill.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-pink-100 dark:bg-pink-950/70 text-pink-700 dark:text-pink-300';
    }
  }
}

// -----------------------------------------------------------------------------
// BACKGROUND MUSIC SOUNDSCAPE SYSTEM
// -----------------------------------------------------------------------------
window.handleMusicToggle = function(enabled) {
  if (!currentCustomData.media) currentCustomData.media = {};
  currentCustomData.media.music.enabled = enabled;
  currentCustomData.music.enabled = enabled;

  const controls = document.getElementById('music-controls-container');
  if (controls) {
    if (enabled) {
      controls.classList.remove('opacity-40', 'pointer-events-none');
    } else {
      controls.classList.add('opacity-40', 'pointer-events-none');
      if (window.WishMediaSystem && window.WishMediaSystem.audioEngine) {
        window.WishMediaSystem.audioEngine.stopAll();
      }
      updateStudioPlayerUI();
    }
  }

  triggerAutosave();
  syncDataToIframe();
  showToast(enabled ? '🎵 Background music enabled' : 'Music soundscape muted');
};

window.switchMusicMode = function(mode) {
  // Part 11: Feature Access Check
  if (mode === 'upload' && window.WishFeatureAccess) {
    const access = window.WishFeatureAccess.canUseMusic('upload');
    if (!access.allowed) {
      if (window.WishPremiumLock) {
        window.WishPremiumLock.open({
          context: 'music_upload',
          onUnlocked: () => {
            window.switchMusicMode('upload');
          }
        });
      }
      return;
    }
  }

  const tabCurated = document.getElementById('tab-music-curated');
  const tabUpload = document.getElementById('tab-music-upload');
  const viewCurated = document.getElementById('music-view-curated');
  const viewUpload = document.getElementById('music-view-upload');

  if (mode === 'curated') {
    if (tabCurated) tabCurated.className = 'flex-1 py-1.5 px-3 rounded-xl bg-white dark:bg-purple-900 text-purple-950 dark:text-white font-bold text-xs shadow-xs transition cursor-pointer';
    if (tabUpload) tabUpload.className = 'flex-1 py-1.5 px-3 rounded-xl text-purple-700 dark:text-purple-300 hover:text-purple-950 dark:hover:text-white font-bold text-xs transition cursor-pointer';
    if (viewCurated) viewCurated.classList.remove('hidden');
    if (viewUpload) viewUpload.classList.add('hidden');
  } else {
    if (tabCurated) tabCurated.className = 'flex-1 py-1.5 px-3 rounded-xl text-purple-700 dark:text-purple-300 hover:text-purple-950 dark:hover:text-white font-bold text-xs transition cursor-pointer';
    if (tabUpload) tabUpload.className = 'flex-1 py-1.5 px-3 rounded-xl bg-white dark:bg-purple-900 text-purple-950 dark:text-white font-bold text-xs shadow-xs transition cursor-pointer';
    if (viewCurated) viewCurated.classList.add('hidden');
    if (viewUpload) viewUpload.classList.remove('hidden');
  }
};

function renderCuratedMusicLibrary() {
  const container = document.getElementById('curated-tracks-list');
  if (!container || !window.WishMediaSystem) return;

  const tracks = window.WishMediaSystem.CURATED_TRACKS;
  const currentMusic = currentCustomData.media ? currentCustomData.media.music : {};
  container.innerHTML = '';

  tracks.forEach(track => {
    const isSelected = currentMusic.trackId === track.id && currentMusic.type !== 'upload';
    const isPlayingThis = window.WishMediaSystem.audioEngine.activeTrackId === track.id;

    const row = document.createElement('div');
    row.className = `p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
      isSelected 
        ? 'border-pink-500 bg-pink-500/10 shadow-sm' 
        : 'border-purple-200/70 dark:border-purple-800/60 bg-white/70 dark:bg-purple-950/40 hover:border-purple-400'
    }`;

    row.innerHTML = `
      <div class="flex items-center gap-2.5 truncate">
        <button type="button" onclick="toggleTrackPreview('${track.id}')" class="w-8 h-8 rounded-full ${
          isPlayingThis ? 'bg-pink-600 text-white' : 'bg-purple-100 dark:bg-purple-900 text-purple-950 dark:text-purple-200'
        } flex items-center justify-center text-xs flex-shrink-0 hover:scale-105 transition cursor-pointer" title="Preview track audio">
          ${isPlayingThis ? '■' : '▶'}
        </button>
        <div class="truncate">
          <h5 class="text-xs font-bold text-purple-950 dark:text-white truncate">${track.title}</h5>
          <p class="text-[10px] text-purple-700 dark:text-purple-300">${track.genre} • ${track.duration}</p>
        </div>
      </div>

      <div>
        <button type="button" onclick="selectCuratedTrack('${track.id}')" class="py-1 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
          isSelected 
            ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-xs' 
            : 'bg-purple-100 dark:bg-purple-900 hover:bg-purple-200 text-purple-950 dark:text-purple-200'
        }">
          ${isSelected ? 'Selected ✓' : 'Select'}
        </button>
      </div>
    `;

    container.appendChild(row);
  });
}

window.selectCuratedTrack = function(trackId) {
  const track = window.WishMediaSystem.CURATED_TRACKS.find(t => t.id === trackId) || window.WishMediaSystem.CURATED_TRACKS[0];

  const audioSrc = track.src || `/audio/${track.id}.mp3`;
  currentCustomData.media.music = {
    enabled: true,
    type: 'curated',
    name: track.title,
    trackId: track.id,
    src: audioSrc,
    url: audioSrc,
    genre: track.genre,
    duration: track.duration
  };

  const musicSwitch = document.getElementById('switch-enable-music');
  if (musicSwitch) musicSwitch.checked = true;

  window.WishMediaSystem.syncMediaToCustomData(currentCustomData.media, currentCustomData);
  renderCuratedMusicLibrary();
  updateStudioPlayerUI();
  triggerAutosave();
  syncDataToIframe();
  showToast(`🎵 Selected: ${track.title}`);
};

window.toggleTrackPreview = function(trackId) {
  const engine = window.WishMediaSystem.audioEngine;
  if ((engine.isPlayingSynth || engine.htmlAudio) && engine.activeTrackId === trackId) {
    engine.stopAll();
    renderCuratedMusicLibrary();
    updateStudioPlayerUI();
    return;
  }

  engine.playCuratedTrack(
    trackId,
    // onTimeUpdate
    (cur, total) => {
      updatePlayerProgressUI(cur, total);
    },
    // onStateChange
    (isPlaying, track) => {
      renderCuratedMusicLibrary();
      updateStudioPlayerUI();
    }
  );
};

window.handleCustomMusicUpload = function(input) {
  if (!input.files || input.files.length === 0) return;

  // Part 11: Feature Access Check
  if (window.WishFeatureAccess) {
    const access = window.WishFeatureAccess.canUseMusic('upload');
    if (!access.allowed) {
      if (window.WishPremiumLock) {
        window.WishPremiumLock.open({
          context: 'music_upload'
        });
      }
      input.value = '';
      return;
    }
  }

  const file = input.files[0];

  if (file.size > 15 * 1024 * 1024) {
    showToast('⚠️ Audio file is too large. Please upload an audio file under 15MB.');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    let audioUrl = e.target.result;
    try {
      const upRes = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData: audioUrl,
          filename: file.name,
          type: 'audio',
          title: file.name.replace(/\.[^/.]+$/, '')
        })
      });
      const upJson = await upRes.json().catch(() => ({}));
      const payload = upJson?.data || upJson || {};
      const b2Url = payload.track?.playbackUrl || payload.track?.url || payload.url;
      if (upRes.ok && b2Url) {
        audioUrl = b2Url;
      }
    } catch (_) {}

    currentCustomData.media.music = {
      enabled: true,
      type: 'upload',
      name: file.name.replace(/\.[^/.]+$/, ''),
      filename: file.name,
      trackId: 'custom_upload',
      src: audioUrl,
      url: audioUrl,
      genre: 'Custom Audio',
      duration: 'Attached'
    };

    window.WishMediaSystem.syncMediaToCustomData(currentCustomData.media, currentCustomData);

    const infoBox = document.getElementById('custom-music-file-info');
    const nameEl = document.getElementById('custom-music-file-name');
    if (infoBox && nameEl) {
      nameEl.textContent = file.name;
      infoBox.classList.remove('hidden');
    }

    renderCuratedMusicLibrary();
    updateStudioPlayerUI();
    triggerAutosave();
    syncDataToIframe();
    showToast('🎵 Custom background music attached!');
  };

  reader.readAsDataURL(file);
  input.value = '';
};

window.toggleStudioMusicPreview = function() {
  const engine = window.WishMediaSystem.audioEngine;
  const music = currentCustomData.media ? currentCustomData.media.music : {};

  if (engine.isPlayingSynth || engine.htmlAudio) {
    engine.stopAll();
    updateStudioPlayerUI();
    renderCuratedMusicLibrary();
    return;
  }

  if (music.type === 'upload' && music.src) {
    engine.playCustomAudio(
      music.src,
      (cur, total) => updatePlayerProgressUI(cur, total),
      () => {
        updateStudioPlayerUI();
        renderCuratedMusicLibrary();
      }
    );
  } else {
    const trackId = music.trackId || 'celebration-strings';
    engine.playCuratedTrack(
      trackId,
      (cur, total) => updatePlayerProgressUI(cur, total),
      () => {
        updateStudioPlayerUI();
        renderCuratedMusicLibrary();
      }
    );
  }
};

window.handlePlayerSeek = function(val) {
  const fraction = parseFloat(val) / 100;
  window.WishMediaSystem.audioEngine.seek(fraction);
};

window.handlePlayerVolume = function(val) {
  window.WishMediaSystem.audioEngine.setVolume(val);
};

window.removeMusicTrack = function() {
  window.WishMediaSystem.audioEngine.stopAll();
  currentCustomData.media.music = {
    enabled: false,
    type: 'none',
    name: 'Music Disabled',
    trackId: 'none',
    src: '',
    genre: '',
    duration: ''
  };

  const musicSwitch = document.getElementById('switch-enable-music');
  if (musicSwitch) musicSwitch.checked = false;

  window.WishMediaSystem.syncMediaToCustomData(currentCustomData.media, currentCustomData);
  renderCuratedMusicLibrary();
  updateStudioPlayerUI();
  triggerAutosave();
  syncDataToIframe();
  showToast('Music disabled');
};

function updateStudioPlayerUI() {
  const engine = window.WishMediaSystem ? window.WishMediaSystem.audioEngine : null;
  const isPlaying = engine ? (engine.isPlayingSynth || (engine.htmlAudio && !engine.htmlAudio.paused)) : false;

  const btnPlay = document.getElementById('btn-studio-play-pause');
  if (btnPlay) {
    btnPlay.textContent = isPlaying ? '⏸️' : '▶';
    btnPlay.title = isPlaying ? 'Pause Audio Preview' : 'Play Audio Preview';
  }

  const music = (currentCustomData.media && currentCustomData.media.music) ? currentCustomData.media.music : {};
  const titleEl = document.getElementById('player-track-title');
  const genreEl = document.getElementById('player-track-genre');
  const totalTimeEl = document.getElementById('player-total-time');

  if (titleEl) titleEl.textContent = music.name || 'Celebration Acoustic Strings';
  if (genreEl) genreEl.textContent = music.genre || (music.type === 'upload' ? 'Custom Upload' : 'Indie Celebration');
  if (totalTimeEl) totalTimeEl.textContent = music.duration || '2:40';
}

function updatePlayerProgressUI(curSeconds, totalSeconds) {
  const curTimeEl = document.getElementById('player-current-time');
  const slider = document.getElementById('player-seek-slider');

  if (curTimeEl) {
    const m = Math.floor(curSeconds / 60);
    const s = Math.floor(curSeconds % 60).toString().padStart(2, '0');
    curTimeEl.textContent = `${m}:${s}`;
  }

  if (slider && totalSeconds > 0) {
    slider.value = Math.min(100, (curSeconds / totalSeconds) * 100);
  }
}

// -----------------------------------------------------------------------------
// STEP 2: ADVANCED THEME ENGINE CONTROLLERS
// -----------------------------------------------------------------------------

// Active Theme Config Builder
function getActiveThemeConfig() {
  const engine = window.WishThemeEngine;
  const basePreset = (engine && engine.presets && engine.presets[currentCustomData.theme])
    ? engine.presets[currentCustomData.theme]
    : (THEME_PRESETS[currentCustomData.theme] || THEME_PRESETS.magical);

  const themeConfig = {
    preset: currentCustomData.theme || 'magical',
    name: basePreset.name || 'Magical',
    colors: {
      primary: currentCustomData.colors.primary || basePreset.colors.primary || '#ec4899',
      secondary: currentCustomData.colors.secondary || basePreset.colors.secondary || '#8b5cf6',
      accent: currentCustomData.colors.accent || (basePreset.colors && basePreset.colors.accent) || '#fbbf24',
      background: (currentCustomData.backgroundObj && currentCustomData.backgroundObj.value) || (basePreset.colors && basePreset.colors.background) || 'radial-gradient(circle at 50% 15%, #2a0845 0%, #17042b 55%, #0d0118 100%)',
      surface: (currentCustomData.colors && currentCustomData.colors.surface) || (basePreset.colors && basePreset.colors.surface) || 'rgba(255, 255, 255, 0.12)',
      text: (currentCustomData.colors && currentCustomData.colors.text) || (basePreset.colors && basePreset.colors.text) || '#ffffff',
      mutedText: (currentCustomData.colors && currentCustomData.colors.mutedText) || (basePreset.colors && basePreset.colors.mutedText) || '#e9d5ff',
      border: (basePreset.colors && basePreset.colors.border) || 'rgba(236, 72, 153, 0.35)',
      glow: (basePreset.colors && basePreset.colors.glow) || 'rgba(236, 72, 153, 0.45)'
    },
    typography: {
      headingFont: (currentCustomData.typography && currentCustomData.typography.headingFont) || (basePreset.typography && basePreset.typography.headingFont) || 'Outfit, sans-serif',
      bodyFont: (currentCustomData.typography && currentCustomData.typography.bodyFont) || (basePreset.typography && basePreset.typography.bodyFont) || 'Plus Jakarta Sans, sans-serif',
      headingWeight: (currentCustomData.typography && currentCustomData.typography.headingWeight) || (basePreset.typography && basePreset.typography.headingWeight) || '800',
      fontStyle: (currentCustomData.typography && currentCustomData.typography.fontStyle) || (basePreset.typography && basePreset.typography.fontStyle) || 'normal'
    },
    background: {
      type: currentCustomData.background || 'gradient',
      value: (currentCustomData.backgroundObj && currentCustomData.backgroundObj.value) || (basePreset.background && basePreset.background.value) || 'radial-gradient(circle at 50% 15%, #2a0845 0%, #17042b 55%, #0d0118 100%)',
      overlay: (basePreset.background && basePreset.background.overlay) || 'none'
    },
    surfaces: currentCustomData.surfaces || (basePreset.surfaces ? { ...basePreset.surfaces } : { style: 'glass', radius: 'rounded', radiusPx: '20px', blur: '20px' }),
    buttons: currentCustomData.buttons || (basePreset.buttons ? { ...basePreset.buttons } : { style: 'gradient', radius: 'pill', radiusPx: '9999px' }),
    effects: currentCustomData.effects || (basePreset.effects ? { ...basePreset.effects } : { master: true, particles: true, particleType: 'sparkles', intensity: 'soft', glow: true, confetti: true })
  };

  currentCustomData.themeConfig = themeConfig;
  return themeConfig;
}

window.selectThemePreset = function(themeKey, sync = true) {
  // Part 11: Feature Access Entitlement Check
  if (window.WishFeatureAccess) {
    const access = window.WishFeatureAccess.canUseTheme(themeKey);
    if (!access.allowed) {
      if (window.WishPremiumLock) {
        window.WishPremiumLock.open({
          context: 'theme',
          key: themeKey,
          onUnlocked: () => {
            window.selectThemePreset(themeKey, true);
          }
        });
      }
      return;
    }
  }

  const engine = window.WishThemeEngine;
  const preset = (engine && engine.presets && engine.presets[themeKey])
    ? engine.presets[themeKey]
    : THEME_PRESETS[themeKey];

  if (!preset) return;

  currentCustomData.theme = themeKey;

  // Hydrate all preset visual parameters
  if (preset.colors) {
    currentCustomData.colors.primary = preset.colors.primary;
    currentCustomData.colors.secondary = preset.colors.secondary;
    currentCustomData.colors.accent = preset.colors.accent || '#fbbf24';
    if (preset.colors.text) currentCustomData.colors.text = preset.colors.text;
    if (preset.colors.mutedText) currentCustomData.colors.mutedText = preset.colors.mutedText;
    if (preset.colors.surface) currentCustomData.colors.surface = preset.colors.surface;
  } else {
    currentCustomData.colors.primary = preset.primary;
    currentCustomData.colors.secondary = preset.secondary;
    currentCustomData.colors.accent = '#fbbf24';
  }

  if (preset.typography) {
    currentCustomData.typography = { ...preset.typography };
    currentCustomData.font = preset.id === 'romantic' ? 'romantic' : (preset.id === 'elegant' || preset.id === 'royal' ? 'elegant' : (preset.id === 'cute' || preset.id === 'pastel' ? 'playful' : 'modern'));
  } else {
    currentCustomData.font = preset.font || 'modern';
  }

  if (preset.background) {
    currentCustomData.background = preset.background.type || 'gradient';
    currentCustomData.backgroundObj = { ...preset.background };
  } else {
    currentCustomData.background = preset.background || 'gradient';
  }

  if (preset.surfaces) {
    currentCustomData.surfaces = { ...preset.surfaces };
  }

  if (preset.buttons) {
    currentCustomData.buttons = { ...preset.buttons };
  }

  if (preset.effects) {
    currentCustomData.effects = { ...preset.effects };
  }

  // Update Theme Preset UI Cards
  document.querySelectorAll('.theme-preset-card').forEach(card => {
    const isSelected = card.getAttribute('data-theme') === themeKey;
    const checkBadge = card.querySelector('.theme-check-badge');
    if (isSelected) {
      card.className = 'theme-preset-card p-3 rounded-2xl ring-2 ring-purple-600 bg-purple-100/90 dark:bg-purple-900/60 shadow-lg text-left transition flex flex-col justify-between h-28 relative group cursor-pointer';
      if (checkBadge) checkBadge.classList.remove('hidden');
    } else {
      card.className = 'theme-preset-card p-3 rounded-2xl border border-purple-200/60 bg-white/70 dark:bg-purple-950/40 text-left transition hover:scale-102 flex flex-col justify-between h-28 relative group cursor-pointer';
      if (checkBadge) checkBadge.classList.add('hidden');
    }
  });

  // Update Color Pickers and Hex Labels
  const colPrimary = document.getElementById('color-primary-input');
  if (colPrimary) colPrimary.value = currentCustomData.colors.primary;
  const hexPrimary = document.getElementById('hex-primary-label');
  if (hexPrimary) hexPrimary.textContent = currentCustomData.colors.primary;

  const colSecondary = document.getElementById('color-secondary-input');
  if (colSecondary) colSecondary.value = currentCustomData.colors.secondary;
  const hexSecondary = document.getElementById('hex-secondary-label');
  if (hexSecondary) hexSecondary.textContent = currentCustomData.colors.secondary;

  const colAccent = document.getElementById('color-accent-input');
  if (colAccent) colAccent.value = currentCustomData.colors.accent;
  const hexAccent = document.getElementById('hex-accent-label');
  if (hexAccent) hexAccent.textContent = currentCustomData.colors.accent;

  // Update Typography & Background buttons
  selectFont(currentCustomData.font, false);
  selectBackgroundStyle(currentCustomData.background, false);

  if (currentCustomData.surfaces && currentCustomData.surfaces.style) {
    selectCardStyle(currentCustomData.surfaces.style, false);
  }
  if (currentCustomData.buttons && currentCustomData.buttons.style) {
    selectButtonStyle(currentCustomData.buttons.style, false);
  }
  if (currentCustomData.effects && currentCustomData.effects.particleType) {
    selectParticleType(currentCustomData.effects.particleType, false);
  }

  // Update Particle Density Selector
  const intensitySel = document.getElementById('select-particle-intensity');
  if (intensitySel && currentCustomData.effects) {
    intensitySel.value = currentCustomData.effects.intensity || 'soft';
  }

  // Update Checkboxes
  const masterSwitch = document.getElementById('switch-master-fx');
  if (masterSwitch && currentCustomData.effects) {
    masterSwitch.checked = currentCustomData.effects.master !== false;
  }
  const glowCheck = document.getElementById('check-glow-fx');
  if (glowCheck && currentCustomData.effects) {
    glowCheck.checked = currentCustomData.effects.glow !== false;
  }
  const confettiCheck = document.getElementById('check-confetti-fx');
  if (confettiCheck && currentCustomData.effects) {
    confettiCheck.checked = currentCustomData.effects.confetti !== false;
  }

  // Update Contrast Protection Badge
  updateContrastBadge();

  if (sync) {
    triggerAutosave();
    syncDataToIframe();
    showToast(`✨ Switched to ${preset.name || themeKey} Theme`);
  }
};

window.resetThemeToDefaults = function() {
  const currentKey = currentCustomData.theme || 'magical';
  selectThemePreset(currentKey, true);
  showToast(`↺ Restored default settings for ${currentKey}`);
};

window.selectColorPalette = function(paletteId) {
  const engine = window.WishThemeEngine;
  if (!engine || !engine.palettes) return;

  const found = engine.palettes.find(p => p.id === paletteId);
  if (!found) return;

  currentCustomData.activePalette = paletteId;
  currentCustomData.colors.primary = found.primary;
  currentCustomData.colors.secondary = found.secondary;
  currentCustomData.colors.accent = found.accent || '#fbbf24';

  // Highlight active palette chip
  document.querySelectorAll('.palette-choice-chip').forEach(chip => {
    if (chip.getAttribute('data-palette') === paletteId) {
      chip.className = 'palette-choice-chip p-2.5 rounded-2xl border-2 border-purple-600 bg-purple-100/90 dark:bg-purple-900/60 shadow-sm flex items-center gap-2 text-left cursor-pointer';
    } else {
      chip.className = 'palette-choice-chip p-2.5 rounded-2xl border border-purple-200/70 dark:border-purple-800/60 bg-white/70 dark:bg-purple-950/40 hover:border-pink-500 transition flex items-center gap-2 text-left cursor-pointer';
    }
  });

  // Update input pickers
  const colPrimary = document.getElementById('color-primary-input');
  if (colPrimary) colPrimary.value = found.primary;
  const hexPrimary = document.getElementById('hex-primary-label');
  if (hexPrimary) hexPrimary.textContent = found.primary;

  const colSecondary = document.getElementById('color-secondary-input');
  if (colSecondary) colSecondary.value = found.secondary;
  const hexSecondary = document.getElementById('hex-secondary-label');
  if (hexSecondary) hexSecondary.textContent = found.secondary;

  const colAccent = document.getElementById('color-accent-input');
  if (colAccent) colAccent.value = found.accent || '#fbbf24';
  const hexAccent = document.getElementById('hex-accent-label');
  if (hexAccent) hexAccent.textContent = found.accent || '#fbbf24';

  updateContrastBadge();
  triggerAutosave();
  syncDataToIframe();
  showToast(`🎨 Applied ${found.name} Palette`);
};

window.handlePrimaryColorChange = function(color) {
  currentCustomData.colors.primary = color;
  const hexLabel = document.getElementById('hex-primary-label');
  if (hexLabel) hexLabel.textContent = color;

  updateContrastBadge();
  triggerAutosave();
  syncDataToIframe();
};

window.handleSecondaryColorChange = function(color) {
  currentCustomData.colors.secondary = color;
  const hexLabel = document.getElementById('hex-secondary-label');
  if (hexLabel) hexLabel.textContent = color;

  updateContrastBadge();
  triggerAutosave();
  syncDataToIframe();
};

window.handleAccentColorChange = function(color) {
  currentCustomData.colors.accent = color;
  const hexLabel = document.getElementById('hex-accent-label');
  if (hexLabel) hexLabel.textContent = color;

  triggerAutosave();
  syncDataToIframe();
};

window.selectFont = function(fontKey, sync = true) {
  currentCustomData.font = fontKey;
  const engine = window.WishThemeEngine;
  if (engine && engine.typography && engine.typography[fontKey]) {
    currentCustomData.typography = { ...engine.typography[fontKey] };
  }

  document.querySelectorAll('.font-choice-btn').forEach(btn => {
    if (btn.getAttribute('data-font') === fontKey) {
      btn.className = 'font-choice-btn flex-1 p-3 rounded-2xl border-2 border-purple-600 bg-purple-100/90 dark:bg-purple-900/60 text-purple-950 dark:text-white font-bold text-xs text-center transition-all shadow-sm cursor-pointer';
    } else {
      btn.className = 'font-choice-btn flex-1 p-3 rounded-2xl border border-purple-200/70 dark:border-purple-800/60 bg-white/70 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 text-xs text-center transition-all hover:border-purple-400 cursor-pointer';
    }
  });

  if (sync) {
    triggerAutosave();
    syncDataToIframe();
  }
};

window.selectBackgroundStyle = function(bgKey, sync = true) {
  currentCustomData.background = bgKey;

  // Compute atmosphere value according to primary and secondary
  const p = currentCustomData.colors.primary || '#ec4899';
  const s = currentCustomData.colors.secondary || '#8b5cf6';

  let bgVal = '';
  if (bgKey === 'glow') {
    bgVal = `radial-gradient(circle at 50% 20%, rgba(244, 63, 94, 0.4) 0%, #1a0410 50%, #070104 100%)`;
  } else if (bgKey === 'cosmic') {
    bgVal = `radial-gradient(circle at 50% 15%, #081e36 0%, #030a14 55%, #010307 100%)`;
  } else if (bgKey === 'solid') {
    bgVal = `#0c0214`;
  } else {
    // Default gradient
    bgVal = `radial-gradient(circle at 50% 15%, #2a0845 0%, #17042b 55%, #0d0118 100%)`;
  }

  currentCustomData.backgroundObj = {
    type: bgKey,
    value: bgVal,
    overlay: 'none'
  };

  document.querySelectorAll('.bg-style-btn').forEach(btn => {
    if (btn.getAttribute('data-bg') === bgKey) {
      btn.className = 'bg-style-btn p-2.5 rounded-2xl border-2 border-purple-600 bg-purple-100/90 dark:bg-purple-900/60 text-purple-950 dark:text-white font-bold text-xs text-center transition-all shadow-sm cursor-pointer';
    } else {
      btn.className = 'bg-style-btn p-2.5 rounded-2xl border border-purple-200/70 bg-white/70 text-xs font-semibold text-center transition cursor-pointer hover:border-purple-400';
    }
  });

  if (sync) {
    triggerAutosave();
    syncDataToIframe();
  }
};

window.selectCardStyle = function(surfaceStyle, sync = true) {
  if (!currentCustomData.surfaces) currentCustomData.surfaces = {};
  currentCustomData.surfaces.style = surfaceStyle;

  if (surfaceStyle === 'clean') {
    currentCustomData.surfaces.blur = '0px';
    currentCustomData.surfaces.radiusPx = '14px';
    currentCustomData.surfaces.shadow = 'none';
  } else if (surfaceStyle === 'frosted') {
    currentCustomData.surfaces.blur = '28px';
    currentCustomData.surfaces.radiusPx = '24px';
    currentCustomData.surfaces.shadow = '0 20px 40px -10px rgba(0,0,0,0.4)';
  } else if (surfaceStyle === 'elevated') {
    currentCustomData.surfaces.blur = '24px';
    currentCustomData.surfaces.radiusPx = '22px';
    currentCustomData.surfaces.shadow = '0 25px 50px -12px rgba(124, 58, 237, 0.35)';
  } else {
    currentCustomData.surfaces.blur = '18px';
    currentCustomData.surfaces.radiusPx = '22px';
    currentCustomData.surfaces.shadow = '0 16px 36px -8px rgba(0,0,0,0.25)';
  }

  document.querySelectorAll('.surface-choice-btn').forEach(btn => {
    if (btn.getAttribute('data-surface') === surfaceStyle) {
      btn.className = 'surface-choice-btn p-2.5 rounded-2xl border-2 border-purple-600 bg-purple-100/90 dark:bg-purple-900/60 text-purple-950 dark:text-white font-bold text-xs text-center transition-all shadow-sm cursor-pointer';
    } else {
      btn.className = 'surface-choice-btn p-2.5 rounded-2xl border border-purple-200/70 bg-white/70 text-xs font-semibold text-center transition cursor-pointer hover:border-purple-400';
    }
  });

  if (sync) {
    triggerAutosave();
    syncDataToIframe();
  }
};

window.selectButtonStyle = function(btnStyle, sync = true) {
  if (!currentCustomData.buttons) currentCustomData.buttons = {};
  currentCustomData.buttons.style = btnStyle;

  if (btnStyle === 'outline') {
    currentCustomData.buttons.radiusPx = '9999px';
    currentCustomData.buttons.shadow = 'none';
  } else if (btnStyle === 'glass') {
    currentCustomData.buttons.radiusPx = '16px';
    currentCustomData.buttons.shadow = '0 8px 20px rgba(0,0,0,0.2)';
  } else if (btnStyle === 'filled') {
    currentCustomData.buttons.radiusPx = '14px';
    currentCustomData.buttons.shadow = '0 10px 25px -5px rgba(0,0,0,0.3)';
  } else {
    currentCustomData.buttons.radiusPx = '9999px';
    currentCustomData.buttons.shadow = '0 10px 25px -5px rgba(236, 72, 153, 0.4)';
  }

  document.querySelectorAll('.btn-style-choice').forEach(btn => {
    if (btn.getAttribute('data-btn-style') === btnStyle) {
      btn.className = 'btn-style-choice p-2.5 rounded-2xl border-2 border-purple-600 bg-purple-100/90 dark:bg-purple-900/60 text-purple-950 dark:text-white font-bold text-xs text-center transition-all shadow-sm cursor-pointer';
    } else {
      btn.className = 'btn-style-choice p-2.5 rounded-2xl border border-purple-200/70 bg-white/70 text-xs font-semibold text-center transition cursor-pointer hover:border-purple-400';
    }
  });

  if (sync) {
    triggerAutosave();
    syncDataToIframe();
  }
};

window.selectParticleType = function(particleType, sync = true) {
  if (!currentCustomData.effects) currentCustomData.effects = {};
  currentCustomData.effects.particleType = particleType;

  document.querySelectorAll('.ptype-choice-btn').forEach(btn => {
    if (btn.getAttribute('data-ptype') === particleType) {
      btn.className = 'ptype-choice-btn p-2.5 rounded-2xl border-2 border-purple-600 bg-purple-100/90 dark:bg-purple-900/60 text-purple-950 dark:text-white font-bold text-xs text-center transition-all shadow-sm cursor-pointer';
    } else {
      btn.className = 'ptype-choice-btn p-2.5 rounded-2xl border border-purple-200/70 bg-white/70 text-xs font-semibold text-center transition cursor-pointer hover:border-purple-400';
    }
  });

  if (sync) {
    triggerAutosave();
    syncDataToIframe();
  }
};

window.handleParticleIntensity = function(level) {
  if (!currentCustomData.effects) currentCustomData.effects = {};
  currentCustomData.effects.intensity = level;
  if (level === 'off') {
    currentCustomData.effects.particles = false;
  } else {
    currentCustomData.effects.particles = true;
  }

  triggerAutosave();
  syncDataToIframe();
};

window.handleEffectToggle = function(effectName, checked) {
  if (!currentCustomData.effects) currentCustomData.effects = {};

  if (effectName === 'master') {
    currentCustomData.effects.master = checked;
  } else {
    currentCustomData.effects[effectName] = checked;
  }

  triggerAutosave();
  syncDataToIframe();
};

window.handleEntranceAnimation = function(val) {
  currentCustomData.entranceAnimation = val;
  triggerAutosave();
  syncDataToIframe();
};

window.handleSectionTransition = function(val) {
  currentCustomData.sectionTransition = val;
  triggerAutosave();
  syncDataToIframe();
};

window.handleTextReveal = function(val) {
  currentCustomData.textReveal = val;
  triggerAutosave();
  syncDataToIframe();
};

window.handleImageReveal = function(val) {
  currentCustomData.imageReveal = val;
  triggerAutosave();
  syncDataToIframe();
};

window.handleInteractiveBurstsToggle = function(checked) {
  currentCustomData.interactiveBursts = checked;
  triggerAutosave();
  syncDataToIframe();
};

// =============================================================================
// SMART WISH LINK & CUSTOM SLUG SUGGESTIONS SYSTEM
// =============================================================================

let currentLinkStyle = 'magical';
let currentPersonalizeWithName = true;
let isChangeLinkModeActive = false;
let isPersonalizedStudioOpen = false;
let currentWishLinkSettings = {
  personalized: {
    enabled: true,
    price: 59,
    currency: 'INR',
    displayName: 'Custom Link Only',
    description: 'Create a memorable custom link (/w/your-name) for your wish.'
  },
  addons: {
    customLinkPrice: 59,
    hdImageStylePrice: 59,
    freeTemplateComboPrice: 99,
    premiumComboAddonPrice: 70
  },
  referral: {
    requiredReferrals: 7
  },
  random: {
    enabled: true,
    prefix: 'wish-',
    length: 6,
    allowedCharacters: 'abcdefghijklmnopqrstuvwxyz0123456789'
  }
};
let userAvailableReferralCredits = Number(localStorage.getItem('wm_free_custom_link_credits') || 0) || 0;
let selectedCustomizerPack = 'combo'; // 'custom_link' | 'hd_style' | 'combo'

function getCurrencySymbol(curr) {
  switch (String(curr || 'INR').toUpperCase()) {
    case 'INR': return '₹';
    case 'USD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    case 'CAD': return 'CA$';
    case 'AUD': return 'AU$';
    default: return curr + ' ';
  }
}

window.loadWishLinkStudioSettings = async function() {
  try {
    const [res, refRes] = await Promise.all([
      fetch('/api/settings/wish-links', { credentials: 'include', cache: 'no-store' }).catch(() => null),
      fetch('/api/referrals/dashboard', { credentials: 'include' }).catch(() => null)
    ]);
    if (res) {
      const data = await res.json().catch(() => ({}));
      const s = (data && data.data && data.data.settings) || (data && data.settings);
      if (data && data.success && s) {
        currentWishLinkSettings = {
          ...currentWishLinkSettings,
          ...s,
          addons: { ...(currentWishLinkSettings.addons || {}), ...(s.addons || {}) },
          referral: { ...(currentWishLinkSettings.referral || {}), ...(s.referral || {}) }
        };
      }
    }
    if (refRes && refRes.ok) {
      const refData = await refRes.json().catch(() => ({}));
      if (refData && refData.success && refData.metrics) {
        userAvailableReferralCredits = Number(refData.metrics.freeCustomLinkCreditsAvailable || 0) || 0;
        try { localStorage.setItem('wm_free_custom_link_credits', String(userAvailableReferralCredits)); } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('[Customizer] Using default wish link settings:', e);
  }

  // Update Card 1: Personalized Link UI
  const cardPersonalized = document.getElementById('card-personalized-option');
  const priceLabel = document.getElementById('card-personalized-price');
  const nameLabel = document.getElementById('card-personalized-name');
  const descLabel = document.getElementById('card-personalized-desc');
  const sym = getCurrencySymbol(currentWishLinkSettings.personalized.currency);

  if (priceLabel) {
    priceLabel.textContent = `${sym}${currentWishLinkSettings.personalized.price}`;
  }
  if (nameLabel && currentWishLinkSettings.personalized.displayName) {
    nameLabel.textContent = currentWishLinkSettings.personalized.displayName;
  }
  if (descLabel && currentWishLinkSettings.personalized.description) {
    descLabel.textContent = currentWishLinkSettings.personalized.description;
  }
  if (cardPersonalized) {
    if (!currentWishLinkSettings.personalized.enabled) {
      cardPersonalized.classList.add('opacity-40', 'pointer-events-none');
    } else {
      cardPersonalized.classList.remove('opacity-40', 'pointer-events-none');
    }
  }

  // Update Card 2: Free Random Link UI
  const cardRandom = document.getElementById('card-random-option');
  const randomSample = document.getElementById('card-random-sample');
  if (randomSample && currentWishLinkSettings.random) {
    const sample = currentWishLinkSettings.random.sampleSlug || `${currentWishLinkSettings.random.prefix}7k4m9x`;
    randomSample.textContent = sample;
  }
  if (cardRandom) {
    if (!currentWishLinkSettings.random.enabled) {
      cardRandom.classList.add('opacity-40', 'pointer-events-none');
    } else {
      cardRandom.classList.remove('opacity-40', 'pointer-events-none');
    }
  }

  window.renderPersonalizedPaymentCallout();
};

window.selectCustomizerPack = function(packType) {
  selectedCustomizerPack = packType || 'combo';
  window.renderPersonalizedPaymentCallout();
};

window.redeemReferralCreditAndPublish = async function() {
  const chosenSlug = (currentCustomData.customSlug || currentCustomData.slug || document.getElementById('wish-slug-input')?.value || '').toLowerCase().trim();
  if (!chosenSlug) {
    showToast('⚠️ Please choose or type your Custom Link name first');
    const input = document.getElementById('wish-slug-input');
    if (input) input.focus();
    return;
  }
  currentCustomData.customSlug = chosenSlug;
  currentCustomData.slug = chosenSlug;
  currentCustomData.linkType = 'personalized';
  currentCustomData.link_type = 'personalized';
  currentCustomData.useReferralCredit = true;

  await executeWishCreation({
    slug: chosenSlug,
    linkType: 'personalized',
    useReferralCredit: true,
    tier: 'free',
    price: 0,
    customData: {
      ...currentCustomData,
      customSlug: chosenSlug,
      slug: chosenSlug,
      linkType: 'personalized',
      link_type: 'personalized',
      useReferralCredit: true
    }
  });
};

window.renderPersonalizedPaymentCallout = function(overrideState = null) {
  const container = document.getElementById('personalized-payment-callout');
  if (!container) return;

  const toNonNeg = (val, fallback) => {
    if (val === undefined || val === null || val === '' || typeof val === 'boolean') return fallback;
    const n = Number(val);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const sym = getCurrencySymbol(currentWishLinkSettings.personalized.currency);
  const a = currentWishLinkSettings.addons || {};
  const clPrice = toNonNeg(a.customLinkPrice ?? currentWishLinkSettings.personalized.price, 59);
  const hdPrice = toNonNeg(a.hdImageStylePrice, 59);
  const freeComboPrice = toNonNeg(a.freeTemplateComboPrice, 99);
  const premComboAddon = toNonNeg(a.premiumComboAddonPrice, 70);
  const tplPrice = Math.max(0, Number((activeTemplate && activeTemplate.price) || 0));
  const isPremTpl = tplPrice > 0;
  const premComboTotal = tplPrice + premComboAddon;

  const priceBadgeEl = document.getElementById('card-personalized-price');
  if (priceBadgeEl) {
    priceBadgeEl.textContent = isPremTpl ? `₹${clPrice} / +₹${premComboAddon} Combo` : `₹${clPrice} / ₹${freeComboPrice} Combo`;
  }

  const chosenSlugForCallout = (currentCustomData.customSlug || currentCustomData.slug || document.getElementById('wish-slug-input')?.value || '').toLowerCase().trim();
  const hasVipPass = Boolean((window.WishEntitlement && window.WishEntitlement.isPremium()) || (window.WishAuth && window.WishAuth.getCurrentUser() && window.WishAuth.getCurrentUser().isPremium));
  const hasTplEnt = !isPremTpl || hasVipPass || Boolean(window.WishEntitlement && typeof window.WishEntitlement.hasTemplateEntitlement === 'function' && window.WishEntitlement.hasTemplateEntitlement(activeTemplate && activeTemplate.id));
  const hasLinkEnt = hasVipPass || Boolean(window.WishEntitlement && typeof window.WishEntitlement.hasCustomLinkAccess === 'function' && window.WishEntitlement.hasCustomLinkAccess(chosenSlugForCallout, activeTemplate && activeTemplate.id));
  const isVipUser = hasTplEnt && hasLinkEnt;

  if (overrideState && overrideState.notConfigured) {
    container.className = 'p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-2';
    container.innerHTML = `
      <div class="flex items-start gap-2.5">
        <span class="material-symbols-outlined text-amber-500 text-lg shrink-0">info</span>
        <div>
          <span class="font-bold block">Payment Gateway Currently Unavailable (NOT_CONFIGURED)</span>
          <p class="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5 leading-relaxed">
            Live payment checkout (${sym}${overrideState.amount || clPrice}) is not configured in environment variables yet. You can continue with a Free Random Link or earn a Free Custom Link by referring 7 friends!
          </p>
        </div>
      </div>
      <div class="pt-1 flex flex-wrap items-center justify-between gap-2">
        <a href="/referrals.html" class="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-900 dark:text-amber-200 font-bold text-xs">🎁 Refer 7 Friends for Free Custom Link</a>
        <button type="button" onclick="publishFreeRandomWish()" class="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs transition cursor-pointer">
          Continue with Free Random Link 🎲
        </button>
      </div>
    `;
    return;
  }

  if (isVipUser) {
    container.className = 'p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 dark:text-emerald-200 text-xs flex items-center justify-between gap-3';
    container.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-emerald-500 text-lg">verified</span>
        <div>
          <span class="font-bold block">VIP Creator Entitled</span>
          <span class="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">Custom Link, HD Images &amp; Style included at no extra charge.</span>
        </div>
      </div>
      <button type="button" onclick="publishWishAndGetLink()" class="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-xs shadow-sm hover:brightness-110 transition cursor-pointer">
        Publish Custom Link ✨
      </button>
    `;
    return;
  }

  const referralBannerHtml = (!isPremTpl && userAvailableReferralCredits > 0) ? `
    <div class="p-3.5 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500 text-emerald-950 dark:text-emerald-100 space-y-2 mb-3">
      <div class="flex items-center justify-between">
        <span class="font-extrabold text-xs flex items-center gap-1.5">🎁 7-Friends Referral Credit Unlocked (${userAvailableReferralCredits} Available)</span>
        <span class="px-2 py-0.5 rounded-full bg-emerald-500 text-white font-black text-[10px]">₹0 FREE</span>
      </div>
      <p class="text-[11px] opacity-90">You referred 7 friends who created templates! Redeem 1 credit to publish your Custom Link on this Free template for ₹0.</p>
      <button type="button" onclick="redeemReferralCreditAndPublish()" class="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-extrabold text-xs shadow-md hover:brightness-110 transition cursor-pointer">
        ✨ Redeem 1 Free Custom Link Credit &amp; Publish Now (₹0)
      </button>
    </div>
  ` : `
    <div class="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2 mb-2 text-[11px]">
      <span class="text-emerald-800 dark:text-emerald-200 font-semibold">🎁 Share with 7 friends &amp; get 1 Custom Link FREE on any Free template!</span>
      <a href="/referrals.html" class="font-extrabold text-emerald-600 dark:text-emerald-400 underline whitespace-nowrap">Refer 7 Friends →</a>
    </div>
  `;

  const opt1Price = isPremTpl ? (tplPrice + clPrice) : clPrice;
  const opt2Price = isPremTpl ? (tplPrice + hdPrice) : hdPrice;
  const optComboPrice = isPremTpl ? premComboTotal : freeComboPrice;
  const optComboSavings = isPremTpl ? (clPrice + hdPrice - premComboAddon) : (clPrice + hdPrice - freeComboPrice);

  let selectedAmount = optComboPrice;
  let selectedLabel = isPremTpl
    ? `Template (₹${tplPrice}) + Full Combo (+₹${premComboAddon}) = ₹${optComboPrice}`
    : `All-in-One Combo (Custom Link + HD Images & Style) = ₹${optComboPrice}`;

  const matchedCustomVipPlan = (Array.isArray(currentWishLinkSettings.vipPlans) ? currentWishLinkSettings.vipPlans : [])
    .find(p => p && p.id === selectedCustomizerPack);
  if (matchedCustomVipPlan) {
    selectedAmount = Number(matchedCustomVipPlan.price ?? 49);
    selectedLabel = `${matchedCustomVipPlan.name} = ₹${selectedAmount}`;
  } else if (selectedCustomizerPack === 'custom_link') {
    selectedAmount = opt1Price;
    selectedLabel = isPremTpl ? `Template (₹${tplPrice}) + Custom Link (₹${clPrice}) = ₹${opt1Price}` : `Custom Link Only = ₹${opt1Price}`;
  } else if (selectedCustomizerPack === 'hd_style') {
    selectedAmount = opt2Price;
    selectedLabel = isPremTpl ? `Template (₹${tplPrice}) + HD Images & Style (₹${hdPrice}) = ₹${opt2Price}` : `HD Images & Custom Style Only = ₹${opt2Price}`;
  }

  container.className = 'p-4 rounded-2xl bg-gradient-to-br from-pink-500/10 via-purple-500/5 to-transparent border border-pink-500/30 text-purple-950 dark:text-purple-100 text-xs space-y-3';
  container.innerHTML = `
    ${referralBannerHtml}
    <div class="font-extrabold text-xs uppercase tracking-wider text-purple-800 dark:text-purple-200">
      Select Your Upgrade / Combo Pack ${isPremTpl ? `(Template Base Price: ₹${tplPrice})` : '(Free Template: ₹0)'}:
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
      <!-- Option 1: Custom Link Only (₹59) -->
      <div onclick="selectCustomizerPack('custom_link')" class="p-3 rounded-xl border-2 cursor-pointer transition ${selectedCustomizerPack === 'custom_link' ? 'border-pink-500 bg-pink-500/15' : 'border-purple-200 dark:border-purple-800 bg-white/70 dark:bg-purple-950/50'}">
        <div class="flex items-center justify-between font-extrabold text-xs">
          <span>🔗 Custom Link</span>
          <span class="text-pink-600 dark:text-pink-400">${sym}${opt1Price}</span>
        </div>
        <div class="text-[10px] opacity-80 mt-1">${isPremTpl ? `₹${tplPrice} Template + ₹${clPrice} Link` : `Only Custom Link (₹${clPrice})`}</div>
      </div>

      <!-- Option 2: HD Images + Style (₹59) -->
      <div onclick="selectCustomizerPack('hd_style')" class="p-3 rounded-xl border-2 cursor-pointer transition ${selectedCustomizerPack === 'hd_style' ? 'border-pink-500 bg-pink-500/15' : 'border-purple-200 dark:border-purple-800 bg-white/70 dark:bg-purple-950/50'}">
        <div class="flex items-center justify-between font-extrabold text-xs">
          <span>🖼️ HD + Style</span>
          <span class="text-purple-600 dark:text-purple-300">${sym}${opt2Price}</span>
        </div>
        <div class="text-[10px] opacity-80 mt-1">${isPremTpl ? `₹${tplPrice} Template + ₹${hdPrice} HD/Style` : `HD Images & Style (₹${hdPrice})`}</div>
      </div>

      <!-- Option 3: Best Value Combo (₹99 on Free / Template + ₹70 on Premium) -->
      <div onclick="selectCustomizerPack('combo')" class="p-3 rounded-xl border-2 cursor-pointer transition relative ${selectedCustomizerPack === 'combo' ? 'border-amber-400 bg-amber-400/15 shadow-md' : 'border-purple-200 dark:border-purple-800 bg-white/70 dark:bg-purple-950/50'}">
        <span class="absolute -top-2 right-2 px-1.5 py-0.2 rounded bg-gradient-to-r from-pink-500 to-amber-500 text-white font-black text-[9px]">SAVE ₹${optComboSavings}</span>
        <div class="flex items-center justify-between font-extrabold text-xs">
          <span>🔥 Full Combo</span>
          <span class="text-amber-600 dark:text-amber-300">${sym}${optComboPrice}</span>
        </div>
        <div class="text-[10px] opacity-85 mt-1">${isPremTpl ? `₹${tplPrice} Template + ₹${premComboAddon} Combo` : `Custom Link + HD + Style (₹${freeComboPrice})`}</div>
      </div>
    </div>

    ${(() => {
      const extraPlans = (Array.isArray(currentWishLinkSettings.vipPlans) ? currentWishLinkSettings.vipPlans : [])
        .filter(p => p && p.isActive !== false && !["personalized_link", "hd_image_style_pack", "free_template_combo", "premium_template_combo"].includes(p.id));
      if (extraPlans.length === 0) return "";
      return `
        <div class="pt-2 border-t border-purple-200/50 dark:border-purple-800/50 space-y-2">
          <div class="text-[10px] font-extrabold uppercase tracking-wider text-pink-600 dark:text-pink-400">👑 Special VIP Passes &amp; Custom Plans:</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${extraPlans.map(vp => {
              const isSel = selectedCustomizerPack === vp.id;
              const pk = vp.perks || {};
              const tags = [];
              if (pk.unlockVipTemplates) tags.push("VIP Templates");
              if (pk.freeCustomLink) tags.push("Free Link");
              if (pk.freeHdPhotos) tags.push("HD Photos");
              if (pk.freeCustomStyle) tags.push("Custom Style");
              return `
                <div onclick="selectCustomizerPack('${vp.id}')" class="p-2.5 rounded-xl border-2 cursor-pointer transition ${isSel ? "border-pink-500 bg-pink-500/15 shadow-md" : "border-purple-200 dark:border-purple-800 bg-white/70 dark:bg-purple-950/50"}">
                  <div class="flex items-center justify-between font-extrabold text-xs">
                    <span>👑 ${vp.name}</span>
                    <span class="text-pink-600 dark:text-pink-400">${Number(vp.price) === 0 ? "FREE" : (sym + vp.price)}</span>
                  </div>
                  <div class="text-[10px] opacity-85 mt-0.5 truncate">${tags.length > 0 ? ("Includes: " + tags.join(" + ")) : (vp.description || "")}</div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;
    })()}

    <button type="button" onclick="handlePersonalizedLinkCheckout('${selectedCustomizerPack}', ${selectedAmount})" class="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#ff2a85] via-[#ec4899] to-[#a855f7] text-white font-extrabold text-xs shadow-lg hover:brightness-110 transition flex items-center justify-center gap-2 cursor-pointer">
      <span class="material-symbols-outlined text-sm">lock_open</span>
      <span>Unlock ${selectedLabel} ✨</span>
    </button>
  `;
};

window.selectPersonalizedOption = function() {
  const panel = document.getElementById('personalized-selection-panel');
  if (panel) {
    panel.classList.remove('hidden');
    isPersonalizedStudioOpen = true;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  const input = document.getElementById('wish-slug-input');
  if (input) input.focus();
  window.initSmartWishLinkUI();
};

window.closePersonalizedStudio = function() {
  const panel = document.getElementById('personalized-selection-panel');
  if (panel) {
    panel.classList.add('hidden');
    isPersonalizedStudioOpen = false;
  }
};

window.setLinkStyle = function(style) {
  currentLinkStyle = style || 'magical';
  
  // Update style pills UI
  const pills = document.querySelectorAll('#style-selector-pills .style-pill');
  pills.forEach(pill => {
    const pStyle = pill.getAttribute('data-style');
    if (pStyle === currentLinkStyle) {
      pill.className = 'style-pill active-style px-3 py-1.5 rounded-full text-xs font-bold border-2 border-pink-500 bg-pink-100/90 dark:bg-pink-950/80 text-pink-700 dark:text-pink-300 transition cursor-pointer ring-2 ring-pink-500/20';
    } else {
      pill.className = 'style-pill px-3 py-1.5 rounded-full text-xs font-semibold border border-purple-200 dark:border-purple-800 bg-white/80 dark:bg-purple-950/60 text-purple-900 dark:text-purple-200 hover:border-pink-400 transition cursor-pointer';
    }
  });

  const styleLabel = document.getElementById('active-style-label');
  if (styleLabel) {
    const styleNames = {
      romantic: '💖 Romantic',
      magical: '✨ Magical',
      cute: '🌸 Cute',
      celebration: '🎉 Celebration',
      simple: '🤍 Simple',
      elegant: '👑 Elegant'
    };
    styleLabel.textContent = styleNames[currentLinkStyle] || '✨ Magical';
  }

  // Regenerate suggestions ranked by the new style
  window.initSmartWishLinkUI();
};

window.handlePersonalizeNameToggle = function(checked) {
  currentPersonalizeWithName = Boolean(checked);
  window.initSmartWishLinkUI();
};

window.toggleChangeLinkMode = function() {
  isChangeLinkModeActive = !isChangeLinkModeActive;
  const btn = document.getElementById('btn-change-link-toggle');
  const panel = document.getElementById('personalized-selection-panel');
  const cards = document.getElementById('link-options-cards-container');

  if (isChangeLinkModeActive) {
    if (btn) btn.textContent = 'Keep Current Link';
    if (panel) panel.classList.remove('hidden');
    if (cards) cards.classList.remove('hidden');
  } else {
    if (btn) btn.textContent = 'Change Link';
    if (panel) panel.classList.add('hidden');
    if (currentEditingWishSlug) {
      currentCustomData.customSlug = currentEditingWishSlug;
      currentCustomData.slug = currentEditingWishSlug;
      const input = document.getElementById('wish-slug-input');
      if (input) input.value = currentEditingWishSlug;
    }
  }
};

window.publishFreeRandomWish = async function() {
  if (isPublishingInProgress) return;
  if (!validateStep1()) {
    window.goToStep(1);
    return;
  }
  if (!activeTemplate) {
    showToast('Please select a template');
    return;
  }
  if (window.WishFeatureAccess) {
    const tplAccess = window.WishFeatureAccess.canUseTemplate(activeTemplate);
    if (!tplAccess.allowed) {
      if (window.WishPremiumLock) {
        window.WishPremiumLock.open({
          context: 'template',
          template: activeTemplate,
          onUnlocked: async () => {
            await window.publishFreeRandomWish();
          }
        });
      } else {
        showToast('⚠️ Please unlock this premium template before publishing.');
      }
      return;
    }
  }
  const currentUser = window.WishAuth && window.WishAuth.getCurrentUser();
  if (!currentUser) {
    if (typeof window.openAuthModal === 'function') {
      window.openAuthModal('signin', 'Please sign in or create an account to publish your wish website.');
    } else {
      alert('Please sign in to publish your wish.');
    }
    return;
  }

  isPublishingInProgress = true;
  try {
    showToast('🎲 Generating unique free random link...');
    let randomSlug = '';
    try {
      const res = await fetch('/api/wishes/generate-random-slug', { credentials: 'include' });
      const data = await res.json();
      if (data && data.success && data.slug) {
        randomSlug = data.slug;
      }
    } catch (e) {
      console.warn('Random slug API call failed:', e);
    }

    if (!randomSlug) {
      const prefix = (currentWishLinkSettings && currentWishLinkSettings.random && currentWishLinkSettings.random.prefix) || 'wish-';
      randomSlug = `${prefix}${Math.random().toString(36).substring(2, 8)}`;
    }

    currentCustomData.customSlug = randomSlug;
    currentCustomData.slug = randomSlug;
    currentCustomData.linkType = 'random';
    currentCustomData.link_type = 'random';

    await executeWishCreation({
      slug: randomSlug,
      linkType: 'random',
      tier: 'free',
      price: 0,
      customData: {
        ...currentCustomData,
        customSlug: randomSlug,
        slug: randomSlug,
        linkType: 'random',
        link_type: 'random'
      }
    });
  } catch (err) {
    showToast('⚠️ Error publishing random link wish: ' + err.message);
  } finally {
    isPublishingInProgress = false;
  }
};

window.handlePersonalizedLinkCheckout = async function(packType = null, amountOverride = null) {
  const activePack = packType || selectedCustomizerPack || 'combo';
  const chosenSlug = (currentCustomData.customSlug || currentCustomData.slug || document.getElementById('wish-slug-input')?.value || '').toLowerCase().trim();
  if (activePack !== 'hd_style' && !chosenSlug) {
    showToast('⚠️ Please choose or enter a personalized link first');
    const input = document.getElementById('wish-slug-input');
    if (input) input.focus();
    return;
  }

  const currentUser = window.WishAuth && window.WishAuth.getCurrentUser();
  if (!currentUser) {
    if (typeof window.openAuthModal === 'function') {
      window.openAuthModal('signin', 'Please sign in or create an account to unlock this feature.');
    } else {
      showToast('⚠️ Please sign in first.');
    }
    return;
  }

  if (activePack !== 'hd_style' && lastSlugCheckResult && lastSlugCheckResult.available === false && !lastSlugCheckResult.isCurrent) {
    showToast('⚠️ Please choose an available link first');
    return;
  }

  try {
    const tplPrice = Math.max(0, Number((activeTemplate && activeTemplate.price) || 0));
    const isCustomVipPlan = (Array.isArray(currentWishLinkSettings.vipPlans) ? currentWishLinkSettings.vipPlans : [])
      .some(p => p && p.id === activePack);
    const resolvedPlanId = isCustomVipPlan
      ? activePack
      : (activePack === 'combo'
        ? (tplPrice > 0 ? 'premium_template_combo' : 'free_template_combo')
        : (activePack === 'hd_style' ? 'hd_image_style_pack' : 'personalized_link'));

    try {
      localStorage.setItem('wm_checkout_cart', JSON.stringify({
        planId: resolvedPlanId,
        packType: activePack,
        templateId: activeTemplate ? activeTemplate.id : null,
        templateName: activeTemplate ? activeTemplate.name : 'Celebration Template',
        templatePrice: tplPrice,
        slug: chosenSlug,
        wishId: currentEditingWishId || null,
        amount: amountOverride || 99
      }));
    } catch (_) {}

    if (!window.WishPaymentService || typeof window.WishPaymentService.createCheckout !== 'function') {
      showToast('⚠️ Payment service is still loading. Please try again in a moment.');
      return;
    }

    const result = await window.WishPaymentService.createCheckout(resolvedPlanId, {
      planId: resolvedPlanId,
      templateId: activeTemplate ? activeTemplate.id : null,
      templatePrice: tplPrice,
      slug: chosenSlug || null,
      requestedSlug: chosenSlug || null,
      wishId: currentEditingWishId || null
    });

    if (result && result.status === 'provider_not_configured') {
      renderPersonalizedPaymentCallout({
        notConfigured: true,
        message: result.message || 'Payment currently unavailable / NOT_CONFIGURED. Gateway is not configured in environment variables.',
        amount: result.amount || amountOverride || currentWishLinkSettings.personalized.price,
        currency: result.currency || currentWishLinkSettings.personalized.currency
      });
      showToast('⚠️ Payment currently unavailable. You can publish using Free Random Link.');
      return;
    }

    // Strict Payment Guard: Never grant access or publish if payment was cancelled, failed, or unverified
    if (!result || !result.success || result.verified !== true) {
      if (result && result.status === 'cancelled') {
        showToast('⚠️ Payment was cancelled. Your feature was not unlocked.');
      } else {
        showToast('⚠️ ' + ((result && result.error) || 'Payment was not completed. Access was not granted.'));
      }
      return;
    }

    // Payment is cryptographically verified on the server and saved with user_id
    currentCustomData.verifiedOrderId = result.orderId || (result.order && result.order.id) || null;
    currentCustomData.verifiedTransactionId = (result.order && result.order.transactionId) || null;

    if (window.WishEntitlement && typeof window.WishEntitlement.refresh === 'function') {
      try {
        await window.WishEntitlement.refresh();
      } catch (_) {}
    }

    window.renderPersonalizedPaymentCallout();

    if (activePack === 'hd_style' && !chosenSlug) {
      showToast('✅ HD Images & Custom Style unlocked for your account!');
      return;
    }

    if (activePack !== 'hd_style') {
      currentCustomData.linkType = 'personalized';
      currentCustomData.link_type = 'personalized';
    }
    await window.publishWishAndGetLink();
  } catch (err) {
    showToast('⚠️ Could not complete checkout: ' + err.message);
  }
};

window.initSmartWishLinkUI = function() {
  const originLabel = document.getElementById('slug-origin-label');
  const domainPrefix = document.getElementById('slug-domain-prefix');
  const hostDomain = (window.location && window.location.host) || 'wishmagic.live';
  
  if (originLabel) originLabel.textContent = `${hostDomain}/w/`;
  if (domainPrefix) domainPrefix.textContent = `/w/`;

  // Check if editing an existing published wish
  const editingBanner = document.getElementById('editing-wish-link-banner');
  const currentSlugLabel = document.getElementById('current-published-slug-label');
  if (currentEditingWishSlug) {
    if (editingBanner) editingBanner.classList.remove('hidden');
    if (currentSlugLabel) currentSlugLabel.textContent = `/w/${currentEditingWishSlug}`;
    if (!isChangeLinkModeActive) {
      currentCustomData.customSlug = currentEditingWishSlug;
      currentCustomData.slug = currentEditingWishSlug;
    }
  } else {
    if (editingBanner) editingBanner.classList.add('hidden');
  }

  // Load and apply server settings
  window.loadWishLinkStudioSettings();

  // 1. Generate Contextual Suggestions using selected Style and Personalize Name toggle
  const occasion = currentCustomData.occasion || (activeTemplate && activeTemplate.category) || 'birthday';
  const relationship = currentCustomData.relationship || '';
  const recipientName = currentCustomData.recipient_name || '';
  const senderName = currentCustomData.sender_name || '';
  const category = (activeTemplate && activeTemplate.category) || '';

  if (window.WishLinkSuggestions && typeof window.WishLinkSuggestions.generateSuggestions === 'function') {
    currentSlugSuggestions = window.WishLinkSuggestions.generateSuggestions({
      occasion,
      relationship,
      recipientName,
      senderName,
      category,
      style: currentLinkStyle,
      personalizeWithName: currentPersonalizeWithName
    });
  } else {
    const norm = currentPersonalizeWithName ? (recipientName || 'celebration').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') : 'celebration';
    currentSlugSuggestions = [`happy-birthday-${norm}`, `just-for-you-${norm}`, `special-wish-${norm}`, `celebrate-${norm}`, 'a-special-wish'];
  }

  // Update sample personalized slug on Card 1
  const cardPersonalizedSample = document.getElementById('card-personalized-sample');
  if (cardPersonalizedSample && currentSlugSuggestions.length > 0) {
    cardPersonalizedSample.textContent = currentSlugSuggestions[0];
  }

  // Update context label
  const contextPill = document.getElementById('suggestions-context-pill');
  if (contextPill) {
    const parts = [];
    if (recipientName && currentPersonalizeWithName) parts.push(recipientName);
    if (occasion) parts.push(occasion.replace(/_/g, ' '));
    if (relationship) parts.push(relationship.replace(/_/g, ' '));
    contextPill.textContent = parts.length > 0 ? `Ranked by ${currentLinkStyle} • ${parts.join(' • ')}` : `Ranked by ${currentLinkStyle} style`;
  }

  // 2. Select initial slug if not set or if using empty state
  const input = document.getElementById('wish-slug-input') || document.getElementById('custom-slug-input');
  
  if (currentEditingWishSlug && !isChangeLinkModeActive) {
    currentCustomData.customSlug = currentEditingWishSlug;
  } else if (!currentCustomData.customSlug && currentSlugSuggestions.length > 0) {
    currentCustomData.customSlug = currentSlugSuggestions[0];
  }

  if (input && currentCustomData.customSlug) {
    input.value = currentCustomData.customSlug;
  }

  // 3. Render suggestions
  window.renderSlugSuggestionChips();

  // 4. Initial live availability check
  if (currentCustomData.customSlug) {
    window.checkSlugAvailability(currentCustomData.customSlug, true);
  }
};

window.renderSlugSuggestionChips = function() {
  const container = document.getElementById('slug-suggestions-chips');
  const showMoreContainer = document.getElementById('slug-show-more-container');
  const showMoreText = document.getElementById('show-more-slugs-text');
  const showMoreIcon = document.getElementById('show-more-slugs-icon');
  if (!container) return;

  container.innerHTML = '';

  const total = currentSlugSuggestions.length;
  const initialLimit = 6;
  const visibleSuggestions = isShowingAllSlugSuggestions ? currentSlugSuggestions : currentSlugSuggestions.slice(0, initialLimit);

  visibleSuggestions.forEach(slug => {
    const isSelected = currentCustomData.customSlug === slug;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-slug', slug);
    btn.className = isSelected
      ? 'px-3 py-1.5 rounded-full text-xs font-bold border-2 border-pink-500 bg-pink-100/90 dark:bg-pink-950/80 text-pink-700 dark:text-pink-300 shadow-xs flex items-center gap-1.5 transition-all cursor-pointer ring-2 ring-pink-500/20'
      : 'px-3 py-1.5 rounded-full text-xs font-semibold border border-purple-200/90 dark:border-purple-800/60 bg-white/80 dark:bg-purple-950/50 text-purple-950 dark:text-purple-200 hover:border-pink-400 hover:bg-pink-50/70 dark:hover:bg-purple-900/40 transition-all cursor-pointer';

    btn.innerHTML = `
      ${isSelected ? '<span class="text-pink-600 dark:text-pink-400 text-[12px] font-black">✓</span>' : '<span class="text-purple-400 dark:text-purple-500 text-[11px]">✦</span>'}
      <span class="font-mono">${escapeHtml(slug)}</span>
    `;

    btn.onclick = () => window.selectSuggestedSlug(slug);
    container.appendChild(btn);
  });

  if (showMoreContainer) {
    if (total > initialLimit) {
      showMoreContainer.classList.remove('hidden');
      if (showMoreText) {
        showMoreText.textContent = isShowingAllSlugSuggestions ? 'Show Fewer Suggestions' : `Show More (${total - initialLimit} more)`;
      }
      if (showMoreIcon) {
        showMoreIcon.textContent = isShowingAllSlugSuggestions ? 'expand_less' : 'expand_more';
      }
    } else {
      showMoreContainer.classList.add('hidden');
    }
  }
};

window.toggleShowMoreSuggestions = function() {
  isShowingAllSlugSuggestions = !isShowingAllSlugSuggestions;
  window.renderSlugSuggestionChips();
};

window.selectSuggestedSlug = function(slug) {
  currentCustomData.customSlug = slug;
  currentCustomData.slug = slug;
  const input = document.getElementById('wish-slug-input') || document.getElementById('custom-slug-input');
  if (input) {
    input.value = slug;
  }

  // Re-render chips to update active highlight
  window.renderSlugSuggestionChips();

  // Hide collision alternatives when picking a suggestion
  const altContainer = document.getElementById('slug-collision-alternatives');
  if (altContainer) altContainer.classList.add('hidden');

  // Trigger immediate availability check
  window.checkSlugAvailability(slug, true);
  triggerAutosave();
};

window.handleSlugInputChange = function(val) {
  // Normalize while typing: only safe chars
  const raw = String(val || '').toLowerCase();
  const clean = raw.replace(/[^a-z0-9-]/g, '');
  currentCustomData.customSlug = clean;
  currentCustomData.slug = clean;

  const input = document.getElementById('wish-slug-input') || document.getElementById('custom-slug-input');
  if (input && input.value !== clean) {
    input.value = clean;
  }

  // Update chip active states
  window.renderSlugSuggestionChips();

  // Hide collision alternatives while user types
  const altContainer = document.getElementById('slug-collision-alternatives');
  if (altContainer) altContainer.classList.add('hidden');

  // Debounced check (350ms)
  if (slugCheckDebounceTimer) {
    clearTimeout(slugCheckDebounceTimer);
  }

  // Show spinner immediately
  const spinner = document.getElementById('slug-input-spinner');
  if (spinner) spinner.classList.remove('hidden');

  slugCheckDebounceTimer = setTimeout(() => {
    window.checkSlugAvailability(clean, false);
  }, 350);

  triggerAutosave();
};

// Legacy compatibility
window.handleCustomSlugInput = function(val) {
  window.handleSlugInputChange(val);
};

window.checkSlugAvailability = async function(slug, immediate = false) {
  const badge = document.getElementById('slug-availability-badge');
  const spinner = document.getElementById('slug-input-spinner');
  const inputWrapper = document.getElementById('slug-input-wrapper');
  const altContainer = document.getElementById('slug-collision-alternatives');
  const altList = document.getElementById('slug-alternatives-list');

  const normalized = (slug || '').toLowerCase().trim().replace(/^-+|-+$/g, '');

  if (spinner) spinner.classList.remove('hidden');

  function setWrapperState(state) {
    if (!inputWrapper) return;
    inputWrapper.classList.remove('border-emerald-500', 'border-rose-500', 'border-amber-500', 'ring-2', 'ring-emerald-500/20', 'ring-rose-500/20');
    if (state === 'valid') {
      inputWrapper.classList.add('border-emerald-500', 'ring-2', 'ring-emerald-500/20');
    } else if (state === 'error') {
      inputWrapper.classList.add('border-rose-500', 'ring-2', 'ring-rose-500/20');
    } else if (state === 'warning') {
      inputWrapper.classList.add('border-amber-500');
    }
  }

  if (!normalized) {
    if (spinner) spinner.classList.add('hidden');
    if (badge) {
      badge.innerHTML = '<span class="text-purple-600/80 dark:text-purple-400/80 font-normal">Choose a link above or type your own custom link</span>';
    }
    setWrapperState('normal');
    lastSlugCheckResult = { available: false, reason: 'empty' };
    return;
  }

  // Local client check first
  const isValid = window.WishLinkSuggestions
    ? window.WishLinkSuggestions.isValidSlug(normalized)
    : /^[a-z0-9](?:[a-z0-9]|-(?!-)){1,78}[a-z0-9]$/.test(normalized);

  const isReserved = window.WishLinkSuggestions
    ? window.WishLinkSuggestions.isReservedSlug(normalized)
    : false;

  if (isReserved) {
    if (spinner) spinner.classList.add('hidden');
    if (badge) {
      badge.innerHTML = '<span class="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1.5"><span class="material-symbols-outlined text-[15px]">block</span> This link is reserved for system use. Please choose another.</span>';
    }
    setWrapperState('error');
    lastSlugCheckResult = { available: false, reason: 'reserved' };
    return;
  }

  if (!isValid) {
    if (spinner) spinner.classList.add('hidden');
    if (badge) {
      badge.innerHTML = '<span class="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[15px]">info</span> Use only lowercase letters, numbers, and single hyphens (3–80 characters).</span>';
    }
    setWrapperState('warning');
    lastSlugCheckResult = { available: false, reason: 'invalid' };
    return;
  }

  if (badge) {
    badge.innerHTML = '<span class="text-purple-500 font-normal flex items-center gap-1.5"><span class="w-2.5 h-2.5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></span> Checking availability...</span>';
  }

  lastCheckedSlug = normalized;

  try {
    const excludeParam = currentEditingWishId ? `&wishId=${encodeURIComponent(currentEditingWishId)}` : '';
    const res = await fetch(`/api/wishes/slug-availability?slug=${encodeURIComponent(normalized)}${excludeParam}`, {
      credentials: 'include'
    });
    const data = await res.json();

    if (spinner) spinner.classList.add('hidden');

    if (lastCheckedSlug !== normalized) return;

    lastSlugCheckResult = data;

    if (data.success && data.available) {
      setWrapperState('valid');
      if (altContainer) altContainer.classList.add('hidden');
      if (badge) {
        if (data.isCurrent) {
          badge.innerHTML = '<span class="text-purple-700 dark:text-purple-300 font-bold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px] text-purple-600">check_circle</span> This is your wish\'s current link (preserved)</span>';
        } else {
          badge.innerHTML = '<span class="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px] text-emerald-500">check_circle</span> ✓ Available! Your celebration will live here.</span>';
        }
      }
    } else {
      setWrapperState('error');
      const reason = data.reason || 'taken';
      if (badge) {
        if (reason === 'taken') {
          badge.innerHTML = '<span class="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px] text-rose-500">cancel</span> That link is already taken. Try another or pick a variation below:</span>';
        } else if (reason === 'reserved') {
          badge.innerHTML = '<span class="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px] text-rose-500">block</span> Reserved platform route. Please pick another.</span>';
        } else {
          badge.innerHTML = `<span class="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">info</span> ${escapeHtml(data.message || 'Link is unavailable')}</span>`;
        }
      }

      if (data.alternatives && data.alternatives.length > 0 && altContainer && altList) {
        altList.innerHTML = '';
        data.alternatives.forEach(alt => {
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = 'px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-amber-200/60 dark:bg-amber-900/60 text-amber-900 dark:text-amber-100 hover:bg-amber-300 dark:hover:bg-amber-800 transition cursor-pointer flex items-center gap-1';
          pill.innerHTML = `<span>+ ${escapeHtml(alt)}</span>`;
          pill.onclick = () => window.selectSuggestedSlug(alt);
          altList.appendChild(pill);
        });
        altContainer.classList.remove('hidden');
      } else if (altContainer) {
        altContainer.classList.add('hidden');
      }
    }
  } catch (err) {
    if (spinner) spinner.classList.add('hidden');
    if (badge) {
      badge.innerHTML = '<span class="text-purple-600/70 text-[11px]">Could not verify link right now; server will validate at publish time.</span>';
    }
  }
};

window.handleUnlistedToggle = function(checked) {
  currentCustomData.isPrivate = checked;
  currentCustomData.unlisted = checked;
  triggerAutosave();
  if (checked) {
    showToast('🔒 Link marked as unlisted (noindex)');
  } else {
    showToast('🌐 Link discoverability enabled');
  }
};

window.updateContrastBadge = function() {
  const badge = document.getElementById('theme-contrast-badge');
  const badgeText = document.getElementById('contrast-badge-text');
  if (!badge || !badgeText) return;

  const bgHex = (currentCustomData.colors && currentCustomData.colors.primary) || '#2a0845';
  const textHex = (currentCustomData.colors && currentCustomData.colors.text) || '#ffffff';

  const engine = window.WishThemeEngine;
  let evalResult = { ratio: 12.5, status: 'pass', label: 'Optimal Contrast (AAA)', isAccessible: true };

  if (engine && typeof engine.evaluateColorContrast === 'function') {
    evalResult = engine.evaluateColorContrast(bgHex, textHex);
  }

  badgeText.textContent = evalResult.label;

  if (evalResult.status === 'pass') {
    badge.className = 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5';
  } else if (evalResult.status === 'warning') {
    badge.className = 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 flex items-center gap-1.5';
  } else {
    badge.className = 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/15 border border-rose-500/30 text-rose-700 dark:text-rose-300 flex items-center gap-1.5';
  }
};

// -----------------------------------------------------------------------------
// STEP 3: SECTIONS & MODULAR LAYOUT (Part 12 Dynamic Section & Content System)
// -----------------------------------------------------------------------------
let activeExpandedSectionId = null;

window.toggleSection = function(sectionId, enabled) {
  const sec = (currentCustomData.sections || []).find(s => s.id === sectionId);
  if (!sec) return;

  if (sec.required && !enabled) {
    showToast('⚠️ This core section is required by the template and cannot be disabled.');
    renderSectionsUI();
    return;
  }

  // Part 11: Feature Access Entitlement Check
  if (enabled && window.WishFeatureAccess) {
    const access = window.WishFeatureAccess.canUseSection(sectionId);
    if (!access.allowed) {
      if (window.WishPremiumLock) {
        window.WishPremiumLock.open({
          context: 'section',
          key: sectionId,
          onUnlocked: () => {
            window.toggleSection(sectionId, true);
          }
        });
      }
      renderSectionsUI();
      return;
    }
  }

  if (sec.required && !enabled) return;

  sec.enabled = enabled;

  if (!currentCustomData.sectionsMap) currentCustomData.sectionsMap = {};
  currentCustomData.sectionsMap[sectionId] = {
    enabled: Boolean(enabled),
    layout: sec.layout || null
  };
  if (!Array.isArray(currentCustomData._hiddenSections)) currentCustomData._hiddenSections = [];
  if (!enabled) {
    if (!currentCustomData._hiddenSections.includes(sectionId)) currentCustomData._hiddenSections.push(sectionId);
  } else {
    currentCustomData._hiddenSections = currentCustomData._hiddenSections.filter(id => id !== sectionId);
  }
  currentCustomData.hiddenSections = [...currentCustomData._hiddenSections];
  if (typeof updateGallerySectionQuickButtonUI === "function") updateGallerySectionQuickButtonUI();

  if (window.WishMagicRuntimeBridge && typeof window.WishMagicRuntimeBridge.updateSection === 'function') {
    window.WishMagicRuntimeBridge.updateSection(sectionId, enabled);
  }

  renderSectionsUI();
  triggerAutosave();
  syncDataToIframe();
  showToast(`${sec.name || sec.label || sectionId} ${enabled ? 'Enabled 🟢' : 'Disabled ⚪'}`);
};

window.moveSectionUp = function(sectionId) {
  const sections = currentCustomData.sections || [];
  const idx = sections.findIndex(s => s.id === sectionId);
  if (idx <= 0) return;

  const temp = sections[idx];
  sections[idx] = sections[idx - 1];
  sections[idx - 1] = temp;

  // re-assign orders
  sections.forEach((s, i) => s.order = i + 1);
  currentCustomData.sectionOrder = sections.map(s => s.id);

  if (window.WishMagicRuntimeBridge && typeof window.WishMagicRuntimeBridge.updateSectionOrder === 'function') {
    window.WishMagicRuntimeBridge.updateSectionOrder(currentCustomData.sectionOrder);
  }

  renderSectionsUI();
  triggerAutosave();
  syncDataToIframe();
};

window.moveSectionDown = function(sectionId) {
  const sections = currentCustomData.sections || [];
  const idx = sections.findIndex(s => s.id === sectionId);
  if (idx === -1 || idx >= sections.length - 1) return;

  const temp = sections[idx];
  sections[idx] = sections[idx + 1];
  sections[idx + 1] = temp;

  // re-assign orders
  sections.forEach((s, i) => s.order = i + 1);
  currentCustomData.sectionOrder = sections.map(s => s.id);

  if (window.WishMagicRuntimeBridge && typeof window.WishMagicRuntimeBridge.updateSectionOrder === 'function') {
    window.WishMagicRuntimeBridge.updateSectionOrder(currentCustomData.sectionOrder);
  }

  renderSectionsUI();
  triggerAutosave();
  syncDataToIframe();
};

window.toggleSectionAccordion = function(sectionId) {
  activeExpandedSectionId = activeExpandedSectionId === sectionId ? null : sectionId;
  renderSectionsUI();
};

// Section Sub-Editors: Gallery Layout
window.setSectionGalleryLayout = function(layout) {
  currentCustomData.gallery_layout = layout;
  if (!currentCustomData.media) currentCustomData.media = {};
  currentCustomData.media.galleryLayout = layout;

  const sec = (currentCustomData.sections || []).find(s => s.id === 'gallery' || s.type === 'photo_gallery');
  if (sec) sec.layout = layout;

  if (window.WishMagicRuntimeBridge && typeof window.WishMagicRuntimeBridge.updateSectionLayout === 'function') {
    window.WishMagicRuntimeBridge.updateSectionLayout('gallery', layout);
  }

  renderSectionsUI();
  triggerAutosave();
  syncDataToIframe();
  showToast(`🖼️ Gallery layout switched to ${layout.toUpperCase()}`);
};

// Section Sub-Editors: Timeline Milestones
window.addTimelineMilestone = function() {
  if (!currentCustomData.timeline) currentCustomData.timeline = [];
  const newId = 'm_' + Date.now().toString(36);
  currentCustomData.timeline.push({
    id: newId,
    date: 'New Milestone',
    title: 'A Treasured Moment',
    description: 'Describe this meaningful second shared together.'
  });

  renderSectionsUI();
  triggerAutosave();
  syncDataToIframe();
};

window.updateTimelineMilestone = function(idx, field, value) {
  if (currentCustomData.timeline && currentCustomData.timeline[idx]) {
    currentCustomData.timeline[idx][field] = value;
    triggerAutosave();
    syncDataToIframe();
  }
};

window.removeTimelineMilestone = function(idx) {
  if (currentCustomData.timeline && currentCustomData.timeline.length > 1) {
    currentCustomData.timeline.splice(idx, 1);
    renderSectionsUI();
    triggerAutosave();
    syncDataToIframe();
  } else {
    showToast('Timeline must have at least 1 milestone');
  }
};

// Section Sub-Editors: Open When Surprise Envelopes
window.addOpenWhenCard = function() {
  if (!currentCustomData.open_when_cards) currentCustomData.open_when_cards = [];
  const count = currentCustomData.open_when_cards.length + 1;
  const colors = ['#ec4899', '#8b5cf6', '#f59e0b', '#06b6d4', '#10b981'];
  currentCustomData.open_when_cards.push({
    id: 'ow_' + Date.now().toString(36),
    title: `Open when you need love #${count} 💖`,
    icon: 'favorite',
    color: colors[count % colors.length],
    message: 'A warm surprise letter written with love for you!'
  });

  renderSectionsUI();
  triggerAutosave();
  syncDataToIframe();
};

window.updateOpenWhenCard = function(idx, field, value) {
  if (currentCustomData.open_when_cards && currentCustomData.open_when_cards[idx]) {
    currentCustomData.open_when_cards[idx][field] = value;
    triggerAutosave();
    syncDataToIframe();
  }
};

window.removeOpenWhenCard = function(idx) {
  if (currentCustomData.open_when_cards && currentCustomData.open_when_cards.length > 1) {
    currentCustomData.open_when_cards.splice(idx, 1);
    renderSectionsUI();
    triggerAutosave();
    syncDataToIframe();
  } else {
    showToast('Keep at least 1 Open When envelope');
  }
};

// Section Sub-Editors: Secret Message
window.updateSecretMessageConfig = function(field, value) {
  if (!currentCustomData.secret_message) {
    currentCustomData.secret_message = {
      title: 'A Secret Surprise Just For You 🤫',
      secretText: '',
      hint: 'Tap the wax seal to reveal!',
      revealType: 'scratch'
    };
  }
  currentCustomData.secret_message[field] = value;
  triggerAutosave();
  syncDataToIframe();
};

// Section Sub-Editors: Grand Finale
window.updateFinaleConfig = function(field, value) {
  if (!currentCustomData.finale) {
    currentCustomData.finale = {
      title: 'May All Your Wishes Come True! 🌟',
      message: '',
      buttonText: 'Celebrate Again 🎊',
      explosionType: 'confetti'
    };
  }
  currentCustomData.finale[field] = value;
  triggerAutosave();
  syncDataToIframe();
};

function renderSectionsUI() {
  const container = document.getElementById('sections-manager-list');
  if (!container) return;

  container.innerHTML = '';

  // Get template-specific supported sections (Part 12 Section 8)
  let supportedDefs = [];
  if (window.WishTemplateDefinitionService && activeTemplate) {
    supportedDefs = window.WishTemplateDefinitionService.getTemplateSections(activeTemplate);
  }

  // Normalize sections from customData & strictly exclude admin-disabled sections (UTP v1.2.0)
  const adminDisabledIds = new Set(Array.isArray(activeTemplate?.disabledIds) ? activeTemplate.disabledIds : []);
  if (activeTemplate?.visibilityMap && typeof activeTemplate.visibilityMap === 'object') {
    Object.entries(activeTemplate.visibilityMap).forEach(([k, v]) => { if (v === false) adminDisabledIds.add(k); });
  }
  let sections = (currentCustomData.sections || []).filter(s => s && !adminDisabledIds.has(s.id) && !adminDisabledIds.has(s.type));
  if (supportedDefs.length > 0) {
    // Only display sections supported by this template!
    const supportedIds = new Set(supportedDefs.map(d => d.id));
    sections = sections.filter(s => supportedIds.has(s.id) || supportedIds.has(s.type));
  }

  const isPrem = window.WishEntitlement ? window.WishEntitlement.isPremium() : false;

  sections.forEach((sec, idx) => {
    const isVipSec = ['countdown', 'timeline', 'voice', 'secret_message', 'open_when'].includes(sec.id) || Boolean(sec.isPremium);
    const isLocked = isVipSec && !isPrem;
    const isExpanded = activeExpandedSectionId === sec.id;
    const isRequired = Boolean(sec.required || sec.id === 'hero' || sec.id === 'message');

    const card = document.createElement('div');
    card.className = `rounded-2xl border transition-all overflow-hidden ${
      sec.enabled
        ? 'bg-white/85 dark:bg-purple-950/60 border-purple-200/90 dark:border-purple-800/70 shadow-sm'
        : 'bg-purple-50/40 dark:bg-purple-950/20 border-purple-100 dark:border-purple-900/40 opacity-70'
    }`;

    // Header Row
    const headerRow = `
      <div class="p-3.5 sm:p-4 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
          <!-- Accessible Reorder Buttons -->
          <div class="flex flex-col gap-0.5 shrink-0">
            <button onclick="moveSectionUp('${sec.id}')" ${idx === 0 ? 'disabled class="opacity-25"' : ''} class="w-5 h-5 rounded hover:bg-purple-200 dark:hover:bg-purple-800 text-[10px] flex items-center justify-center font-bold text-purple-800 dark:text-purple-200 cursor-pointer" title="Move Section Up">▲</button>
            <button onclick="moveSectionDown('${sec.id}')" ${idx === sections.length - 1 ? 'disabled class="opacity-25"' : ''} class="w-5 h-5 rounded hover:bg-purple-200 dark:hover:bg-purple-800 text-[10px] flex items-center justify-center font-bold text-purple-800 dark:text-purple-200 cursor-pointer" title="Move Section Down">▼</button>
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-xs font-mono font-bold text-purple-500">0${idx + 1}.</span>
              <h5 class="text-xs sm:text-sm font-bold text-purple-950 dark:text-white truncate">${sec.name || sec.label || sec.id}</h5>
              ${isRequired ? `<span class="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100">Required</span>` : ''}
              ${isVipSec ? `<span class="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-amber-400 text-purple-950 shadow-xs">VIP</span>` : ''}
              ${isLocked ? `<span class="text-xs" title="Requires VIP Pass">🔒</span>` : ''}
            </div>
            <p class="text-[10px] text-purple-700/80 dark:text-purple-300/80 font-medium truncate mt-0.5">
              ${sec.description || (sec.enabled ? '🟢 Active in celebration' : '⚪ Hidden from recipient')}
            </p>
          </div>
        </div>

        <!-- Controls: Config Accordion Trigger + Toggle Switch -->
        <div class="flex items-center gap-2 shrink-0">
          ${['gallery', 'timeline', 'open_when', 'secret_message', 'finale'].includes(sec.id) ? `
            <button type="button" onclick="toggleSectionAccordion('${sec.id}')" class="p-1.5 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-800/60 text-purple-700 dark:text-purple-300 text-xs font-bold transition flex items-center gap-1 cursor-pointer" title="Configure section details">
              <span class="material-symbols-outlined text-[16px]">${isExpanded ? 'expand_less' : 'tune'}</span>
              <span class="text-[10px] hidden sm:inline">${isExpanded ? 'Hide' : 'Edit'}</span>
            </button>
          ` : ''}

          <label class="relative inline-flex items-center ${isRequired ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}">
            <input type="checkbox" ${sec.enabled ? 'checked' : ''} ${isRequired ? 'disabled' : ''} onchange="toggleSection('${sec.id}', this.checked)" class="sr-only peer"/>
            <div class="w-11 h-6 bg-purple-200 peer-focus:outline-none rounded-full peer dark:bg-purple-900 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-pink-500 peer-checked:to-purple-600"></div>
          </label>
        </div>
      </div>
    `;

    // Dynamic Section Sub-Editors (Accordion Body)
    let bodyContent = '';
    if (isExpanded && sec.enabled) {
      if (sec.id === 'gallery') {
        const curLayout = currentCustomData.gallery_layout || currentCustomData.media?.galleryLayout || 'polaroid';
        bodyContent = `
          <div class="p-4 pt-0 border-t border-purple-200/50 dark:border-purple-800/40 bg-purple-50/50 dark:bg-purple-950/30 text-xs space-y-3">
            <label class="block font-bold text-purple-950 dark:text-white">Photo Keepsakes Display Layout</label>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button type="button" onclick="setSectionGalleryLayout('polaroid')" class="p-2.5 rounded-xl border ${curLayout === 'polaroid' ? 'border-pink-500 bg-pink-500/15 font-bold text-pink-600 dark:text-pink-300' : 'border-purple-200/60 bg-white/70 dark:bg-purple-900/40 text-purple-900 dark:text-purple-200'} text-xs text-center transition cursor-pointer">
                📷 Polaroid
              </button>
              <button type="button" onclick="setSectionGalleryLayout('masonry')" class="p-2.5 rounded-xl border ${curLayout === 'masonry' ? 'border-pink-500 bg-pink-500/15 font-bold text-pink-600 dark:text-pink-300' : 'border-purple-200/60 bg-white/70 dark:bg-purple-900/40 text-purple-900 dark:text-purple-200'} text-xs text-center transition cursor-pointer">
                🧱 Masonry
              </button>
              <button type="button" onclick="setSectionGalleryLayout('grid')" class="p-2.5 rounded-xl border ${curLayout === 'grid' ? 'border-pink-500 bg-pink-500/15 font-bold text-pink-600 dark:text-pink-300' : 'border-purple-200/60 bg-white/70 dark:bg-purple-900/40 text-purple-900 dark:text-purple-200'} text-xs text-center transition cursor-pointer">
                ▦ Grid
              </button>
              <button type="button" onclick="setSectionGalleryLayout('filmstrip')" class="p-2.5 rounded-xl border ${curLayout === 'filmstrip' ? 'border-pink-500 bg-pink-500/15 font-bold text-pink-600 dark:text-pink-300' : 'border-purple-200/60 bg-white/70 dark:bg-purple-900/40 text-purple-900 dark:text-purple-200'} text-xs text-center transition cursor-pointer">
                🎞️ Filmstrip
              </button>
              <button type="button" onclick="setSectionGalleryLayout('carousel')" class="p-2.5 rounded-xl border ${curLayout === 'carousel' ? 'border-pink-500 bg-pink-500/15 font-bold text-pink-600 dark:text-pink-300' : 'border-purple-200/60 bg-white/70 dark:bg-purple-900/40 text-purple-900 dark:text-purple-200'} text-xs text-center transition cursor-pointer">
                🎠 3D Carousel
              </button>
            </div>
          </div>
        `;
      } else if (sec.id === 'timeline') {
        const milestones = currentCustomData.timeline || [];
        bodyContent = `
          <div class="p-4 pt-0 border-t border-purple-200/50 dark:border-purple-800/40 bg-purple-50/50 dark:bg-purple-950/30 text-xs space-y-3">
            <div class="flex items-center justify-between">
              <label class="font-bold text-purple-950 dark:text-white">Milestone Story Moments (${milestones.length})</label>
              <button type="button" onclick="addTimelineMilestone()" class="px-2.5 py-1 rounded-lg bg-pink-600 text-white font-bold text-[11px] shadow-sm hover:brightness-110 active:scale-95 transition cursor-pointer">
                + Add Milestone
              </button>
            </div>
            <div class="space-y-2.5">
              ${milestones.map((m, mIdx) => `
                <div class="p-3 rounded-xl bg-white dark:bg-purple-900/40 border border-purple-200/60 dark:border-purple-800/40 space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <input type="text" value="${escapeHtml(m.date || '')}" oninput="updateTimelineMilestone(${mIdx}, 'date', this.value)" placeholder="e.g. June 2024 / First Road Trip" class="w-1/2 p-1.5 rounded-lg border border-purple-200/60 text-xs font-bold text-purple-900 dark:text-white bg-transparent"/>
                    <button type="button" onclick="removeTimelineMilestone(${mIdx})" class="text-rose-500 hover:text-rose-700 font-bold text-xs p-1" title="Delete Milestone">✕</button>
                  </div>
                  <input type="text" value="${escapeHtml(m.title || '')}" oninput="updateTimelineMilestone(${mIdx}, 'title', this.value)" placeholder="Milestone Title" class="w-full p-1.5 rounded-lg border border-purple-200/60 text-xs font-semibold text-purple-900 dark:text-white bg-transparent"/>
                  <textarea oninput="updateTimelineMilestone(${mIdx}, 'description', this.value)" placeholder="Memorable details..." rows="2" class="w-full p-1.5 rounded-lg border border-purple-200/60 text-xs text-purple-900 dark:text-white bg-transparent">${escapeHtml(m.description || '')}</textarea>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      } else if (sec.id === 'open_when') {
        const cards = currentCustomData.open_when_cards || [];
        bodyContent = `
          <div class="p-4 pt-0 border-t border-purple-200/50 dark:border-purple-800/40 bg-purple-50/50 dark:bg-purple-950/30 text-xs space-y-3">
            <div class="flex items-center justify-between">
              <label class="font-bold text-purple-950 dark:text-white">"Open When..." Surprise Envelopes (${cards.length})</label>
              <button type="button" onclick="addOpenWhenCard()" class="px-2.5 py-1 rounded-lg bg-pink-600 text-white font-bold text-[11px] shadow-sm hover:brightness-110 active:scale-95 transition cursor-pointer">
                + Add Envelope
              </button>
            </div>
            <div class="space-y-2.5">
              ${cards.map((c, cIdx) => `
                <div class="p-3 rounded-xl bg-white dark:bg-purple-900/40 border border-purple-200/60 dark:border-purple-800/40 space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <input type="text" value="${escapeHtml(c.title || '')}" oninput="updateOpenWhenCard(${cIdx}, 'title', this.value)" placeholder="e.g. Open when you need a smile 😊" class="flex-1 p-1.5 rounded-lg border border-purple-200/60 text-xs font-bold text-purple-900 dark:text-white bg-transparent"/>
                    <input type="color" value="${c.color || '#ec4899'}" onchange="updateOpenWhenCard(${cIdx}, 'color', this.value)" class="w-7 h-7 rounded-lg border-0 cursor-pointer shrink-0" title="Envelope Accent Color"/>
                    <button type="button" onclick="removeOpenWhenCard(${cIdx})" class="text-rose-500 hover:text-rose-700 font-bold text-xs p-1" title="Delete Envelope">✕</button>
                  </div>
                  <textarea oninput="updateOpenWhenCard(${cIdx}, 'message', this.value)" placeholder="Secret letter inside this envelope..." rows="2" class="w-full p-1.5 rounded-lg border border-purple-200/60 text-xs text-purple-900 dark:text-white bg-transparent">${escapeHtml(c.message || '')}</textarea>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      } else if (sec.id === 'secret_message') {
        const secMsg = currentCustomData.secret_message || {};
        bodyContent = `
          <div class="p-4 pt-0 border-t border-purple-200/50 dark:border-purple-800/40 bg-purple-50/50 dark:bg-purple-950/30 text-xs space-y-3">
            <label class="block font-bold text-purple-950 dark:text-white">Secret Message Configuration</label>
            <div class="space-y-2">
              <input type="text" value="${escapeHtml(secMsg.title || 'A Secret Surprise Just For You 🤫')}" oninput="updateSecretMessageConfig('title', this.value)" placeholder="Secret Card Title" class="w-full p-2 rounded-xl border border-purple-200/60 text-xs font-semibold text-purple-900 dark:text-white bg-white/80 dark:bg-purple-900/40"/>
              <textarea oninput="updateSecretMessageConfig('secretText', this.value)" placeholder="Write your hidden confidential message here..." rows="3" class="w-full p-2 rounded-xl border border-purple-200/60 text-xs text-purple-900 dark:text-white bg-white/80 dark:bg-purple-900/40 font-serif italic">${escapeHtml(secMsg.secretText || '')}</textarea>
              <input type="text" value="${escapeHtml(secMsg.hint || 'Tap the glowing wax seal to break and reveal ✨')}" oninput="updateSecretMessageConfig('hint', this.value)" placeholder="Unlock instruction / hint" class="w-full p-2 rounded-xl border border-purple-200/60 text-xs text-purple-700 dark:text-purple-300 bg-white/80 dark:bg-purple-900/40"/>
            </div>
          </div>
        `;
      } else if (sec.id === 'finale') {
        const finale = currentCustomData.finale || {};
        bodyContent = `
          <div class="p-4 pt-0 border-t border-purple-200/50 dark:border-purple-800/40 bg-purple-50/50 dark:bg-purple-950/30 text-xs space-y-3">
            <label class="block font-bold text-purple-950 dark:text-white">Celebration Finale Customization</label>
            <div class="space-y-2">
              <input type="text" value="${escapeHtml(finale.title || 'May All Your Wishes Come True! 🌟')}" oninput="updateFinaleConfig('title', this.value)" placeholder="Finale Headline" class="w-full p-2 rounded-xl border border-purple-200/60 text-xs font-bold text-purple-950 dark:text-white bg-white/80 dark:bg-purple-900/40"/>
              <textarea oninput="updateFinaleConfig('message', this.value)" placeholder="Closing heartfelt celebration cheer..." rows="2" class="w-full p-2 rounded-xl border border-purple-200/60 text-xs text-purple-900 dark:text-white bg-white/80 dark:bg-purple-900/40">${escapeHtml(finale.message || '')}</textarea>
              <input type="text" value="${escapeHtml(finale.buttonText || 'Celebrate Again 🎊')}" oninput="updateFinaleConfig('buttonText', this.value)" placeholder="Replay Celebration Button Text" class="w-full p-2 rounded-xl border border-purple-200/60 text-xs text-purple-900 dark:text-white bg-white/80 dark:bg-purple-900/40"/>
            </div>
          </div>
        `;
      }
    }

    card.innerHTML = headerRow + bodyContent;
    container.appendChild(card);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// -----------------------------------------------------------------------------
// STEP 4: PREVIEW & REVIEW SUMMARY
// -----------------------------------------------------------------------------
function renderStep4Summary() {
  const nameEl = document.getElementById('summary-recipient-name');
  if (nameEl) nameEl.textContent = currentCustomData.recipient_name || 'Someone Special';

  const senderEl = document.getElementById('summary-sender-name');
  if (senderEl) senderEl.textContent = currentCustomData.sender_name || 'From Someone Who Cares';

  const dateEl = document.getElementById('summary-event-date');
  if (dateEl) dateEl.textContent = currentCustomData.event_date || 'Special Occasion';

  const photoCountEl = document.getElementById('summary-photos-count');
  if (photoCountEl) photoCountEl.textContent = `${(currentCustomData.photos || []).length} photos attached`;

  const voiceEl = document.getElementById('summary-voice-status');
  if (voiceEl) {
    if (currentCustomData.voice_note && currentCustomData.voice_note.enabled && currentCustomData.voice_note.url) {
      voiceEl.textContent = `Attached (${currentCustomData.voice_note.duration || 'Audio Note'})`;
      voiceEl.className = 'font-bold text-pink-600 dark:text-pink-400';
    } else {
      voiceEl.textContent = 'None attached (Optional)';
      voiceEl.className = 'font-bold text-purple-950 dark:text-white';
    }
  }

  const themeIcon = document.getElementById('summary-theme-icon');
  const themeName = document.getElementById('summary-theme-name');
  const engine = window.WishThemeEngine;
  const preset = (engine && engine.presets && engine.presets[currentCustomData.theme])
    ? engine.presets[currentCustomData.theme]
    : (THEME_PRESETS[currentCustomData.theme] || { name: 'Magical', icon: '🪄' });

  if (themeIcon) themeIcon.textContent = preset.icon || '🪄';
  if (themeName) themeName.textContent = `${preset.name} Theme`;

  const musicEl = document.getElementById('summary-music-status');
  if (musicEl) musicEl.textContent = currentCustomData.music.enabled !== false ? currentCustomData.music.title : 'No background music';

  const activeSecCount = (currentCustomData.sections || []).filter(s => s.enabled).length;
  const sectionsEl = document.getElementById('summary-sections-count');
  if (sectionsEl) sectionsEl.textContent = `${activeSecCount} interactive sections active`;

  // Update VIP Perks status in Step 4
  const vipPill = document.getElementById('vip-pass-status-pill');
  const isPrem = window.WishEntitlement ? window.WishEntitlement.isPremium() : false;
  if (vipPill) {
    if (isPrem) {
      vipPill.textContent = '👑 VIP PASS ACTIVE';
      vipPill.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400 text-purple-950 shadow-sm';
    } else {
      vipPill.textContent = 'FREE PLAN';
      vipPill.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 dark:bg-purple-900/70 text-purple-800 dark:text-purple-200';
    }
  }

  const preserveToggle = document.getElementById('toggle-lifetime-preservation');
  if (preserveToggle) {
    preserveToggle.checked = Boolean(currentCustomData.lifetimePreservation);
  }

  const watermarkToggle = document.getElementById('toggle-remove-watermark');
  if (watermarkToggle) {
    watermarkToggle.checked = Boolean(currentCustomData.watermarkRemoved);
  }

  // Initialize Smart Wish Link & Custom Slug Suggestions in Step 4
  if (typeof window.initSmartWishLinkUI === 'function') {
    window.initSmartWishLinkUI();
  }
}

// -----------------------------------------------------------------------------
// PART 11: PRESERVATION & WATERMARK CONTROLLERS
// -----------------------------------------------------------------------------
window.handlePreservationToggle = function(checked) {
  const toggle = document.getElementById('toggle-lifetime-preservation');
  if (checked) {
    if (window.WishFeatureAccess) {
      const allowed = window.WishFeatureAccess.canKeepMemoryForever();
      if (!allowed) {
        if (toggle) toggle.checked = false;
        currentCustomData.lifetimePreservation = false;
        if (window.WishPremiumLock) {
          window.WishPremiumLock.open({
            context: 'preservation',
            onUnlocked: () => {
              if (toggle) toggle.checked = true;
              currentCustomData.lifetimePreservation = true;
              renderStep4Summary();
              triggerAutosave();
              showToast('♾️ Lifetime preservation enabled!');
            }
          });
        }
        return;
      }
    }
    currentCustomData.lifetimePreservation = true;
    showToast('♾️ Lifetime preservation enabled!');
  } else {
    currentCustomData.lifetimePreservation = false;
    showToast('Lifetime preservation disabled');
  }
  triggerAutosave();
};

window.handleWatermarkRemovalToggle = function(checked) {
  const toggle = document.getElementById('toggle-remove-watermark');
  if (checked) {
    if (window.WishFeatureAccess) {
      const allowed = window.WishFeatureAccess.canRemoveWatermark();
      if (!allowed) {
        if (toggle) toggle.checked = false;
        currentCustomData.watermarkRemoved = false;
        if (window.WishPremiumLock) {
          window.WishPremiumLock.open({
            context: 'watermark',
            onUnlocked: () => {
              if (toggle) toggle.checked = true;
              currentCustomData.watermarkRemoved = true;
              renderStep4Summary();
              triggerAutosave();
              showToast('✨ White-label enabled (Watermark removed)!');
            }
          });
        }
        return;
      }
    }
    currentCustomData.watermarkRemoved = true;
    showToast('✨ White-label enabled (Watermark removed)!');
  } else {
    currentCustomData.watermarkRemoved = false;
    showToast('Platform watermark restored');
  }
  triggerAutosave();
};

// -----------------------------------------------------------------------------
// REAL-TIME SANDBOX HYDRATION & DOM INJECTION
// -----------------------------------------------------------------------------
const CUSTOMIZE_TEMPLATE_FOLDER_MAP = {
  'tpl_glitter_birthday': 'tpl_glitter_birthday',
  'glitter-birthday-blast': 'tpl_glitter_birthday',
  'glitter-birthday-bash-3d': 'tpl_glitter_birthday',
  'tpl_romantic_starlight': 'tpl_romantic_scrapbook',
  'romantic-starlight': 'tpl_romantic_scrapbook',
  'romantic-starlight-serenade': 'tpl_romantic_scrapbook',
  'tpl_romantic_scrapbook': 'tpl_romantic_scrapbook',
  'starlit-romance-love-letter': 'tpl_romantic_scrapbook',
  'tpl_golden_elegance': 'tpl_golden_anniversary',
  'golden-elegance-anniversary': 'tpl_golden_anniversary',
  'tpl_golden_anniversary': 'tpl_golden_anniversary',
  'golden-memories-keepsake': 'tpl_golden_anniversary',
  'tpl_neon_party': 'tpl_cosmic_aurora',
  'neon-night-celebration': 'tpl_cosmic_aurora',
  'tpl_cosmic_aurora': 'tpl_cosmic_aurora',
  'tpl_parents_tribute': 'tpl_parents_tribute',
  'dearest-parents-tribute': 'tpl_parents_tribute',
  'tpl_midnight_countdown': 'tpl_midnight_countdown',
  'midnight-celebration-countdown': 'tpl_midnight_countdown',
  'tpl_friendship_chronicles': 'tpl_friendship_chronicles',
  'forever-friends-funhouse': 'tpl_friendship_chronicles',
  'tpl_festive_lights': 'tpl_golden_anniversary',
  'royal-festival-celebration': 'tpl_golden_anniversary',
  'tpl_test_full_sections': 'tpl_test_full_sections',
  'tpl_test_minimal_sections': 'tpl_test_minimal_sections'
};

function resolveCanonicalCustomizeFolder(tpl) {
  if (!tpl) return 'tpl_glitter_birthday';
  const candidates = [tpl.id, tpl.slug, tpl.folder]
    .map(v => String(v || '').trim().replace(/^\/+/, '').replace(/^(?:templates-store|templates)\/+/, '').replace(/\/+$/, ''))
    .filter(Boolean);
  for (const c of candidates) {
    const low = c.toLowerCase();
    if (CUSTOMIZE_TEMPLATE_FOLDER_MAP[low]) return CUSTOMIZE_TEMPLATE_FOLDER_MAP[low];
    const prefixed = 'tpl_' + low.replace(/-/g, '_');
    if (CUSTOMIZE_TEMPLATE_FOLDER_MAP[prefixed]) return CUSTOMIZE_TEMPLATE_FOLDER_MAP[prefixed];
  }
  return candidates[0] || 'tpl_glitter_birthday';
}

function loadTemplateInSandbox() {
  if (!activeTemplate) return;

  const container = document.getElementById('sandbox-iframe-container');
  if (!container) return;

  const cleanFolder = resolveCanonicalCustomizeFolder(activeTemplate);
  const entryFile = activeTemplate.entryFile || activeTemplate.entry_file || 'index.html';
  const templateEntryUrl = (activeTemplate.previewUrl && String(activeTemplate.previewUrl).includes('/versions/ver_'))
    ? activeTemplate.previewUrl
    : `/templates-store/${cleanFolder}/${entryFile}`;

  container.innerHTML = `
    <div id="sandbox-loading-overlay" class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-purple-950/80 backdrop-blur-sm text-white rounded-2xl transition-opacity duration-200 pointer-events-none" aria-live="polite">
      <div class="w-8 h-8 rounded-full border-2 border-pink-400 border-t-transparent animate-spin mb-2"></div>
      <span class="text-xs font-bold text-purple-100">Loading Live Preview...</span>
    </div>
    <div id="sandbox-error-overlay" class="hidden absolute inset-0 z-30 flex flex-col items-center justify-center bg-purple-950/95 text-white p-6 text-center rounded-2xl" role="alert">
      <span class="material-symbols-outlined text-3xl text-rose-400 mb-2">broken_image</span>
      <p class="text-sm font-extrabold">Preview failed to load</p>
      <p class="text-xs text-purple-200/80 mt-1 max-w-xs">Your customization data is safe. You can retry loading the preview below.</p>
      <button type="button" onclick="window.reloadSandboxIframe()" class="mt-3 px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold transition cursor-pointer">
        Retry Preview
      </button>
    </div>
    <iframe id="live-custom-iframe" src="${templateEntryUrl}" class="w-full h-full border-0 rounded-2xl flex-grow bg-white" title="Live Template Sandbox" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
  `;

  const iframe = document.getElementById('live-custom-iframe');
  const loadingOverlay = document.getElementById('sandbox-loading-overlay');
  const errorOverlay = document.getElementById('sandbox-error-overlay');

  if (typeof window.setDeviceViewport === 'function') {
    window.setDeviceViewport(window._customizerViewportMode || (window.innerWidth >= 1024 ? 'desktop' : 'mobile'));
  }

  let loadResolved = false;
  const fallbackTimer = setTimeout(() => {
    if (!loadResolved && loadingOverlay) {
      loadingOverlay.classList.add('opacity-0', 'hidden');
    }
  }, 6000);

  if (iframe) {
    iframe.onload = () => {
      loadResolved = true;
      clearTimeout(fallbackTimer);
      if (loadingOverlay) loadingOverlay.classList.add('opacity-0', 'hidden');
      if (errorOverlay) errorOverlay.classList.add('hidden');
      syncDataToIframe();
    };
    iframe.onerror = () => {
      loadResolved = true;
      clearTimeout(fallbackTimer);
      if (loadingOverlay) loadingOverlay.classList.add('opacity-0', 'hidden');
      if (errorOverlay) errorOverlay.classList.remove('hidden');
    };
  }
}

function syncDataToIframe() {
  const iframe = document.getElementById('live-custom-iframe');
  if (!iframe) return;

  // 1. PostMessage Event Dispatch (including UTP v1.2.0 visibilityMap, disabledIds, and actions)
  const explicitHiddenSecs = Array.isArray(currentCustomData._hiddenSections) ? currentCustomData._hiddenSections : [];
  currentCustomData._hiddenSections = explicitHiddenSecs;
  currentCustomData.hiddenSections = explicitHiddenSecs;
  const customerHiddenSecsList = Array.from(new Set([
    ...explicitHiddenSecs,
    ...((currentCustomData.sections || []).filter(s => s && s.id && s.enabled === false && s.id !== 'voice').map(s => s.id))
  ]));
  const customerHiddenFieldsList = Array.isArray(currentCustomData._hiddenFields) ? currentCustomData._hiddenFields : [];
  currentCustomData._hiddenFields = customerHiddenFieldsList;
  currentCustomData.hiddenFields = customerHiddenFieldsList;

  const livePayload = {
    ...currentCustomData,
    _isLiveCustomizerPreview: true,
    _hiddenSections: customerHiddenSecsList,
    hiddenSections: customerHiddenSecsList,
    _hiddenFields: customerHiddenFieldsList,
    hiddenFields: customerHiddenFieldsList,
    templateId: activeTemplate ? activeTemplate.id : currentCustomData.templateId,
    templateSlug: activeTemplate ? (activeTemplate.slug || activeTemplate.id) : currentCustomData.templateId,
    visibilityMap: (activeTemplate && activeTemplate.visibilityMap) || {},
    disabledIds: (activeTemplate && Array.isArray(activeTemplate.disabledIds)) ? activeTemplate.disabledIds : [],
    actions: (activeTemplate && activeTemplate.selectedVariant && Array.isArray(activeTemplate.selectedVariant.actions))
      ? activeTemplate.selectedVariant.actions
      : ((activeTemplate && Array.isArray(activeTemplate.actions)) ? activeTemplate.actions : [])
  };
  if (iframe.contentWindow) {
    iframe.contentWindow.postMessage({
      type: 'WISHMAGIC_LIVE_UPDATE',
      payload: livePayload
    }, '*');
    iframe.contentWindow.postMessage({
      type: 'WISHMAGIC_INIT',
      payload: livePayload
    }, '*');
  }

  // 2. Direct DOM Hydration & CSS Variable Injection
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc) return;

    const captureAndGetOrigText = (el, key) => {
      if (!el.hasAttribute('data-wm-original-text')) {
        el.setAttribute('data-wm-original-text', el.textContent || '');
      }
      return templateDefaultValues[key] || el.getAttribute('data-wm-default') || el.getAttribute('data-wm-original-text') || '';
    };

    // Recipient Name
    doc.querySelectorAll('[data-wm="recipient_name"], [data-wm-field="recipient_name"]').forEach(el => {
      const defText = captureAndGetOrigText(el, 'recipient_name');
      const recVal = (currentCustomData.recipient_name || '').trim();
      el.textContent = recVal || defText || 'Someone Special';
    });

    // Sender Name
    doc.querySelectorAll('[data-wm="sender_name"], [data-wm-field="sender_name"]').forEach(el => {
      const defText = captureAndGetOrigText(el, 'sender_name');
      const sndVal = (currentCustomData.sender_name || '').trim();
      if (sndVal) {
        const origHasDash = (el.getAttribute('data-wm-original-text') || '').trim().startsWith('—');
        el.textContent = origHasDash && !sndVal.startsWith('—') ? `— ${sndVal}` : sndVal;
      } else {
        el.textContent = defText || '— Someone Special';
      }
    });

    // Event Date / DOB
    doc.querySelectorAll('[data-wm="event_date"], [data-wm-field="event_date"], [data-wm="dob"], [data-wm-field="dob"], [data-wm="birth_date"], [data-wm-field="birth_date"]').forEach(el => {
      const defText = captureAndGetOrigText(el, 'event_date');
      const dtVal = (currentCustomData.event_date || '').trim();
      el.textContent = dtVal || defText || 'Today';
    });

    // Custom Message
    doc.querySelectorAll('[data-wm="custom_message"], [data-wm-field="custom_message"]').forEach(el => {
      const defText = captureAndGetOrigText(el, 'custom_message');
      const msgVal = (currentCustomData.custom_message || '').trim();
      el.textContent = msgVal || defText || 'May your day be filled with warm magic, sparkling smiles, and infinite moments of joy!';
    });

    // Cover Photo & Photos (ImgBB links)
    const photos = currentCustomData.photos || [];
    const activeCover = currentCustomData.cover_photo || (photos.length > 0 ? (photos[0].displayUrl || photos[0].url || photos[0].src) : '');
    if (activeCover) {
      doc.querySelectorAll('[data-wm="photo_1"], [data-wm-field="photo_1"], [data-wm="cover_photo"], [data-wm-field="cover_photo"]').forEach(el => {
        if (el.tagName === 'IMG') el.src = activeCover;
        else el.style.backgroundImage = `url("${activeCover}")`;
      });
    }
    photos.forEach((ph, idx) => {
      const photoUrl = ph && (ph.displayUrl || ph.url || ph.src);
      if (photoUrl) {
        doc.querySelectorAll(`[data-wm="photo_${idx + 1}"], [data-wm-field="photo_${idx + 1}"]`).forEach(el => {
          if (el.tagName === 'IMG') el.src = photoUrl;
          else el.style.backgroundImage = `url("${photoUrl}")`;
        });
      }
    });

    // Sync custom music / audio if updated
    const activeMusicSrc = currentCustomData.background_music || (currentCustomData.media && currentCustomData.media.music && currentCustomData.media.music.src);
    if (activeMusicSrc) {
      doc.querySelectorAll('[data-wm="background_music"], [data-wm-field="background_music"]').forEach(el => {
        if (el.tagName === 'AUDIO' && el.src !== activeMusicSrc) {
          el.src = activeMusicSrc;
        }
      });
    }

    // Detected & manifest custom fields sync (supports IMG, AUDIO, VIDEO, CSS variables, custom selectors, and text)
    const allTemplateFields = [
      ...((activeTemplate && activeTemplate.manifest && Array.isArray(activeTemplate.manifest.fields)) ? activeTemplate.manifest.fields : []),
      ...((activeTemplate && Array.isArray(activeTemplate.detectedFields)) ? activeTemplate.detectedFields : [])
    ];
    if (allTemplateFields.length > 0) {
      allTemplateFields.forEach(f => {
        const fKey = f.key || f.id;
        if (!fKey) return;
        f.key = fKey;
        const val = currentCustomData[f.key];
        const fallbackDef = (f.defaultValue !== undefined && f.defaultValue !== null && String(f.defaultValue) !== '')
          ? f.defaultValue
          : (templateDefaultValues[f.key] || '');
        const effectiveVal = (val !== undefined && val !== null && String(val).trim() !== '') ? val : fallbackDef;
        if (effectiveVal !== undefined && effectiveVal !== null && String(effectiveVal) !== '') {
          doc.querySelectorAll(`[data-wm="${f.key}"], [data-wm-field="${f.key}"]`).forEach(el => {
            if (!el.hasAttribute('data-wm-original-text') && !['IMG', 'AUDIO', 'VIDEO'].includes(el.tagName)) {
              el.setAttribute('data-wm-original-text', el.textContent || '');
            }
            if (el.tagName === 'IMG') {
              el.src = effectiveVal;
            } else if (el.tagName === 'AUDIO' || el.tagName === 'VIDEO') {
              if (el.src !== effectiveVal) {
                el.src = effectiveVal;
                const srcChild = el.querySelector('source');
                if (srcChild) srcChild.src = effectiveVal;
                try { el.load(); } catch (_) {}
              }
            } else if (f.key === 'sender_name') {
              const origHasDash = (el.getAttribute('data-wm-original-text') || '').trim().startsWith('—');
              el.textContent = origHasDash && !String(effectiveVal).startsWith('—') ? `— ${effectiveVal}` : effectiveVal;
            } else {
              el.textContent = effectiveVal;
            }
          });
        }
      });
    }

    // Hydrate Part 5 Media System (Gallery Layout, Voice Note Dedication widget, Music Indicator)
    if (window.WishMediaSystem) {
      const normalizedMedia = window.WishMediaSystem.normalizeMediaState(currentCustomData);
      window.WishMediaSystem.hydrateTemplateMedia(doc, normalizedMedia);
    }

    // Inject Theme Engine CSS Tokens, Typography, Buttons, Cards, Atmosphere & Particles
    if (window.WishThemeEngine) {
      const activeTheme = getActiveThemeConfig();
      window.WishThemeEngine.applyThemeToDocument(doc, activeTheme);
    }

    // Physically remove admin-disabled sections/subsections and apply actions in iframe DOM (UTP v1.2.0)
    if (window.WishMagicTemplate && typeof window.WishMagicTemplate.removeDisabledContentFromDom === 'function') {
      window.WishMagicTemplate.removeDisabledContentFromDom(doc, livePayload);
    }
    if (window.WishMagicTemplate && typeof window.WishMagicTemplate.applyActionsToDom === 'function') {
      window.WishMagicTemplate.applyActionsToDom(doc, livePayload.actions, livePayload);
    }

    // Customer-toggled sections, subsections, and photo slots are handled with full restore support by WishMagicTemplate.removeDisabledContentFromDom above

    // Dispatch wishmagic:data-updated custom event inside iframe so countdowns/galleries react live
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.WishMagicData = currentCustomData;
        const liveEvt = new CustomEvent("wishmagic:data-updated", { detail: currentCustomData });
        iframe.contentWindow.dispatchEvent(liveEvt);
        doc.dispatchEvent(liveEvt);
      }
    } catch (_) {}

    // Inject Dynamic Styles for Themes, Colors, Fonts, & Section Visibility
    injectCustomStylesToIframe(doc);

    // Part 13: Live Animation & Particle Engine Sync inside Preview Document
    if (window.WishAnimationEngine && typeof window.WishAnimationEngine.init === 'function') {
      const activeTheme = getActiveThemeConfig();
      const animConfig = {
        entrance: currentCustomData.entranceAnimation || (activeTheme.effects && activeTheme.effects.entrance) || 'fade-up',
        sectionTransition: currentCustomData.sectionTransition || (activeTheme.effects && activeTheme.effects.sectionTransition) || 'slide',
        textReveal: currentCustomData.textReveal || (activeTheme.effects && activeTheme.effects.textReveal) || 'fade',
        imageReveal: currentCustomData.imageReveal || (activeTheme.effects && activeTheme.effects.imageReveal) || 'fade',
        particleType: (currentCustomData.effects && currentCustomData.effects.particleType) || 'sparkles',
        intensity: (currentCustomData.effects && currentCustomData.effects.intensity) || 'soft',
        primaryColor: currentCustomData.colors.primary || '#ec4899',
        accentColor: currentCustomData.colors.accent || '#fbbf24',
        secondaryColor: currentCustomData.colors.secondary || '#8b5cf6',
        interactiveBursts: currentCustomData.interactiveBursts !== false
      };
      window.WishAnimationEngine.init(doc, animConfig);
    }

  } catch (e) {
    // Cross-origin fallback handled by postMessage
  }
}

function injectCustomStylesToIframe(doc) {
  let styleEl = doc.getElementById('wishmagic-injected-style');
  if (!styleEl) {
    styleEl = doc.createElement('style');
    styleEl.id = 'wishmagic-injected-style';
    doc.head.appendChild(styleEl);
  }

  const primaryCol = currentCustomData.colors.primary || '#ec4899';
  const secondaryCol = currentCustomData.colors.secondary || '#8b5cf6';

  let fontCSS = '';
  if (currentCustomData.font === 'elegant') {
    fontCSS = `font-family: 'Playfair Display', serif !important;`;
  } else if (currentCustomData.font === 'romantic') {
    fontCSS = `font-family: 'Playfair Display', serif !important; font-style: italic !important;`;
  } else if (currentCustomData.font === 'playful') {
    fontCSS = `font-family: 'Plus Jakarta Sans', sans-serif !important;`;
  } else {
    fontCSS = `font-family: 'Outfit', sans-serif !important;`;
  }

  // Section Hide / Show Rules
  let sectionCSS = '';
  (currentCustomData.sections || []).forEach(sec => {
    if (!sec.enabled) {
      if (sec.id === 'hero') {
        sectionCSS += `#cake-interactive, #sealed-state, .hero-section, #clock-hours { display: none !important; }\n`;
      } else if (sec.id === 'message') {
        sectionCSS += `[data-wm="custom_message"], .message-card, #revealed-state { display: none !important; }\n`;
      } else if (sec.id === 'gallery') {
        sectionCSS += `[data-wm="photo_1"], .memory-card, .photo-box { display: none !important; }\n`;
      } else if (sec.id === 'countdown') {
        sectionCSS += `#clock-hours, .countdown-wrapper { display: none !important; }\n`;
      } else if (sec.id === 'finale') {
        sectionCSS += `#screen-confetti-layer, #confetti-layer { display: none !important; }\n`;
      }
    }
  });

  styleEl.textContent = `
    :root {
      --wm-primary: ${primaryCol};
      --wm-secondary: ${secondaryCol};
    }
    h1, h2, h3 {
      ${fontCSS}
    }
    button.bg-gradient-to-r, a.bg-gradient-to-r {
      background: linear-gradient(135deg, ${primaryCol} 0%, ${secondaryCol} 100%) !important;
    }
    .text-pink-400, .text-rose-400, .text-amber-400 {
      color: ${primaryCol} !important;
    }
    ${sectionCSS}
  `;
}

// -----------------------------------------------------------------------------
// RESPONSIVE VIEWPORT CONTROLS
// -----------------------------------------------------------------------------
window._customizerViewportMode = 'desktop';
window.setDeviceViewport = function(mode) {
  window._customizerViewportMode = mode;
  const frame = document.getElementById('sandbox-device-frame');
  const iframeContainer = document.getElementById('sandbox-iframe-container');
  const iframe = document.getElementById('live-custom-iframe');
  const btnD = document.getElementById('btn-view-desktop');
  const btnT = document.getElementById('btn-view-tablet');
  const btnM = document.getElementById('btn-view-mobile');
  const notch = document.getElementById('device-frame-notch');
  const browserBar = document.getElementById('device-frame-browserbar');

  [btnD, btnT, btnM].forEach(b => {
    if (b) {
      b.classList.remove('bg-purple-700', 'text-white', 'font-bold');
      b.classList.add('text-purple-700', 'dark:text-purple-300');
    }
  });

  if (!frame) return;

  if (mode === 'desktop') {
    frame.style.maxWidth = '100%';
    frame.style.borderRadius = '20px';
    if (btnD) {
      btnD.classList.add('bg-purple-700', 'text-white', 'font-bold');
      btnD.classList.remove('text-purple-700', 'dark:text-purple-300');
    }
    if (notch) notch.classList.add('hidden');
    if (browserBar) browserBar.classList.remove('hidden');
    requestAnimationFrame(() => {
      const availW = Math.max(260, (iframeContainer ? iframeContainer.clientWidth : (frame.clientWidth - 16)));
      const DESKTOP_W = 1280;
      const DESKTOP_H = 800;
      const scale = Math.min(1, availW / DESKTOP_W);
      const scaledH = Math.round(DESKTOP_H * scale);
      frame.style.height = (scaledH + 52) + 'px';
      if (iframe) {
        iframe.style.width = DESKTOP_W + 'px';
        iframe.style.height = DESKTOP_H + 'px';
        iframe.style.transform = `scale(${scale.toFixed(4)})`;
        iframe.style.transformOrigin = 'top left';
      }
    });
  } else if (mode === 'tablet') {
    frame.style.maxWidth = '580px';
    frame.style.borderRadius = '28px';
    if (btnT) {
      btnT.classList.add('bg-purple-700', 'text-white', 'font-bold');
      btnT.classList.remove('text-purple-700', 'dark:text-purple-300');
    }
    if (notch) notch.classList.add('hidden');
    if (browserBar) browserBar.classList.remove('hidden');
    requestAnimationFrame(() => {
      const availW = Math.max(260, (iframeContainer ? iframeContainer.clientWidth : (frame.clientWidth - 16)));
      const TABLET_W = 768;
      const TABLET_H = 900;
      const scale = Math.min(1, availW / TABLET_W);
      const scaledH = Math.round(TABLET_H * scale);
      frame.style.height = (scaledH + 52) + 'px';
      if (iframe) {
        iframe.style.width = TABLET_W + 'px';
        iframe.style.height = TABLET_H + 'px';
        iframe.style.transform = `scale(${scale.toFixed(4)})`;
        iframe.style.transformOrigin = 'top left';
      }
    });
  } else {
    // Mobile
    const isSmallScreen = window.innerWidth < 640;
    frame.style.maxWidth = '375px';
    frame.style.height = isSmallScreen ? '580px' : '660px';
    frame.style.borderRadius = '32px';
    if (btnM) {
      btnM.classList.add('bg-purple-700', 'text-white', 'font-bold');
      btnM.classList.remove('text-purple-700', 'dark:text-purple-300');
    }
    if (notch) notch.classList.remove('hidden');
    if (browserBar) browserBar.classList.add('hidden');
    if (iframe) {
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.transform = 'none';
      iframe.style.transformOrigin = 'top left';
    }
  }
};
window.addEventListener('resize', () => {
  if (window._customizerViewportMode === 'desktop' || window._customizerViewportMode === 'tablet') {
    window.setDeviceViewport(window._customizerViewportMode);
  }
});

window.reloadSandboxIframe = function() {
  const iframe = document.getElementById('live-custom-iframe');
  if (iframe) {
    const src = iframe.src;
    iframe.src = 'about:blank';
    setTimeout(() => {
      iframe.src = src;
      showToast('Sandbox refreshed ✨');
    }, 150);
  }
};

// -----------------------------------------------------------------------------
// AUTOSAVE & DRAFT SYSTEM (Stage 5 Concurrency & Truthful Status Tracking)
// -----------------------------------------------------------------------------
function triggerAutosave() {
  currentCustomizerRevision++;
  updateSaveIndicatorStatus('unsaved');

  if (autosaveTimeout) clearTimeout(autosaveTimeout);
  autosaveTimeout = setTimeout(() => {
    saveDraftLocally();
  }, 400);
}

function updateSaveIndicatorStatus(state, extraInfo = '') {
  const indicator = document.getElementById('autosave-indicator');
  if (!indicator) return;

  switch (state) {
    case 'saving':
      indicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span><span class="text-xs text-amber-300">Saving changes...</span>`;
      break;
    case 'saved':
      indicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span class="text-xs text-emerald-300">All changes saved ✨</span>`;
      break;
    case 'saved_local':
      indicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span class="text-xs text-emerald-300">Draft saved locally</span>`;
      break;
    case 'unsaved':
      indicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-pink-400 animate-pulse"></span><span class="text-xs text-pink-300">Unsaved edits</span>`;
      break;
    case 'conflict':
      indicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span><span class="text-xs text-amber-200 font-bold">Conflict detected</span>`;
      break;
    case 'error':
      indicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500"></span><span class="text-xs text-rose-300">${extraInfo || 'Save error (retained locally)'}</span>`;
      break;
    default:
      indicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-purple-400/50"></span><span class="text-xs text-purple-200/70">Ready</span>`;
  }
}

window.saveDraftLocally = async function(isManualSave = false) {
  if (!activeTemplate) return false;

  const targetRevision = currentCustomizerRevision;
  const draftKey = getLocalDraftStorageKey(activeTemplate);

  try {
    // 1. Immediately ensure reliable local fallback preservation (variant-scoped + base fallback)
    localStorage.setItem(draftKey, JSON.stringify(currentCustomData));
    if (!activeTemplate.selectedVariant) {
      localStorage.setItem(`wishmagic_draft_${activeTemplate.id}`, JSON.stringify(currentCustomData));
    }

    // Also update unified drafts collection for My Wishes Creator Dashboard
    let drafts = [];
    try {
      drafts = JSON.parse(localStorage.getItem('wishmagic_drafts') || '[]');
      if (!Array.isArray(drafts)) drafts = [];
    } catch (e) {
      drafts = [];
    }

    const draftId = currentEditingWishId ? ('draft_' + currentEditingWishId) : ('draft_' + activeTemplate.id);
    const currentUserId = (window.WishAuth && window.WishAuth.getCurrentUser()?.id) || 'guest';
    const existingIdx = drafts.findIndex(d => (d.id === draftId || d.templateId === activeTemplate.id) && (d.userId === currentUserId || !d.userId));
    const draftRecord = {
      id: draftId,
      wishId: currentEditingWishId || null,
      userId: currentUserId,
      templateId: activeTemplate.id,
      templateName: activeTemplate.name || 'Personalized Celebration',
      category: activeTemplate.category || 'Birthday',
      tier: activeTemplate.tier || 'free',
      price: activeTemplate.price || 0,
      recipientName: currentCustomData.recipient_name || 'Special Person',
      senderName: currentCustomData.sender_name || 'Creator',
      eventDate: currentCustomData.event_date || new Date().toISOString().split('T')[0],
      coverPhoto: currentCustomData.cover_photo || (currentCustomData.photos && currentCustomData.photos[0] && currentCustomData.photos[0].src) || activeTemplate.thumbnail || '',
      customData: JSON.parse(JSON.stringify(currentCustomData)),
      updatedAt: new Date().toISOString(),
      status: 'draft',
      isDraft: true
    };

    if (existingIdx >= 0) {
      drafts[existingIdx] = draftRecord;
    } else {
      drafts.unshift(draftRecord);
    }
    localStorage.setItem('wishmagic_drafts', JSON.stringify(drafts));

    // 2. Prevent overlapping network requests
    if (isSaveInProgress) {
      pendingSaveAfterInFlight = true;
      return true;
    }

    // 3. Persist draft to Server D1 when authenticated (Part 26 & Stage 5)
    let serverSaveFailed = false;
    const authUser = window.WishAuth && window.WishAuth.getCurrentUser();
    if (authUser && authUser.id && authUser.id !== 'guest') {
      isSaveInProgress = true;
      updateSaveIndicatorStatus('saving');

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      const session = window.WishAuth.getSession();
      if (session && session.token) {
        headers['Authorization'] = `Bearer ${session.token}`;
      }

      try {
        if (currentEditingWishId) {
          const res = await fetch(`/api/wishes/${encodeURIComponent(currentEditingWishId)}`, {
            method: 'PUT',
            headers,
            credentials: 'include',
            body: JSON.stringify({
              status: 'draft',
              isDraft: true,
              lockVersion: currentLockVersion,
              recipientName: currentCustomData.recipient_name || 'Special Person',
              eventDate: currentCustomData.event_date || new Date().toISOString().split('T')[0],
              customData: currentCustomData
            })
          });

          const data = await res.json().catch(() => ({}));
          if (res.status === 409 || (data && data.error && data.error.code === 'CONCURRENCY_CONFLICT')) {
            updateSaveIndicatorStatus('conflict');
            handleDraftConcurrencyConflict(data);
            return false;
          }

          if (data && data.success) {
            if (data.lockVersion) currentLockVersion = Number(data.lockVersion);
            else currentLockVersion = (currentLockVersion || 1) + 1;

            if (targetRevision >= currentCustomizerRevision) {
              lastSavedRevision = targetRevision;
              updateSaveIndicatorStatus('saved');
            } else {
              updateSaveIndicatorStatus('unsaved');
            }
          } else {
            serverSaveFailed = true;
            updateSaveIndicatorStatus('error', (data && data.message) || 'Save failed');
          }
        } else {
          const res = await fetch('/api/wishes', {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({
              templateId: activeTemplate.id,
              status: 'draft',
              isDraft: true,
              customData: {
                ...currentCustomData,
                isDraft: true
              }
            })
          });

          const data = await res.json().catch(() => ({}));
          if (data && data.success && data.wishId) {
            currentEditingWishId = data.wishId;
            if (data.lockVersion) currentLockVersion = Number(data.lockVersion);

            if (targetRevision >= currentCustomizerRevision) {
              lastSavedRevision = targetRevision;
              updateSaveIndicatorStatus('saved');
            } else {
              updateSaveIndicatorStatus('unsaved');
            }
          } else {
            serverSaveFailed = true;
            updateSaveIndicatorStatus('error', (data && data.message) || 'Draft creation failed');
          }
        }
      } catch (netErr) {
        console.warn('[Autosave Network Error]', netErr);
        updateSaveIndicatorStatus('error', 'Network error (retained locally)');
        if (isManualSave) {
          showToast('⚠️ Saved on this device, but cloud sync failed. Will retry automatically.');
        }
        return false;
      } finally {
        isSaveInProgress = false;
        if (pendingSaveAfterInFlight) {
          pendingSaveAfterInFlight = false;
          setTimeout(() => saveDraftLocally(), 100);
        }
      }
    } else {
      // Guest mode
      lastSavedRevision = targetRevision;
      updateSaveIndicatorStatus('saved_local');
    }

    if (isManualSave) {
      if (serverSaveFailed) {
        showToast('⚠️ Saved locally on this device, but cloud sync failed.');
        return false;
      }
      showToast('💾 Draft saved successfully!');
    }
    return !serverSaveFailed;
  } catch (e) {
    console.warn('Error saving local draft:', e);
    updateSaveIndicatorStatus('error', 'Local storage error');
    return false;
  }
};

function handleDraftConcurrencyConflict(conflictData) {
  const indicator = document.getElementById('autosave-indicator');
  if (indicator) {
    indicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span><span class="text-amber-700 dark:text-amber-300 font-bold">Draft Conflict Detected</span>`;
  }

  let conflictBanner = document.getElementById('draft-concurrency-conflict-banner');
  if (!conflictBanner) {
    conflictBanner = document.createElement('div');
    conflictBanner.id = 'draft-concurrency-conflict-banner';
    conflictBanner.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%] p-4 rounded-2xl bg-amber-600/95 text-white shadow-2xl backdrop-blur-xl border border-amber-300 flex flex-col gap-2 transition-all';
    document.body.appendChild(conflictBanner);
  }

  const remoteVer = (conflictData && conflictData.currentLockVersion) || 'newer';
  conflictBanner.innerHTML = `
    <div class="flex items-start gap-2.5">
      <span class="text-xl">⚠️</span>
      <div class="flex-1 text-xs leading-relaxed">
        <p class="font-bold text-sm">Draft Updated Elsewhere (v${remoteVer})</p>
        <p class="text-amber-100 mt-0.5">A newer version of this draft was saved from another browser tab or device. Choose how to keep your changes:</p>
      </div>
    </div>
    <div class="flex items-center justify-end gap-2 mt-1">
      <button type="button" id="btn-conflict-reload" class="px-3 py-1.5 rounded-xl bg-black/30 hover:bg-black/50 text-white font-bold text-xs transition cursor-pointer">
        Reload Remote Draft
      </button>
      <button type="button" id="btn-conflict-overwrite" class="px-3 py-1.5 rounded-xl bg-white text-amber-900 hover:bg-amber-100 font-extrabold text-xs transition cursor-pointer">
        Keep Local & Overwrite
      </button>
    </div>
  `;
  conflictBanner.classList.remove('hidden');

  document.getElementById('btn-conflict-overwrite')?.addEventListener('click', () => {
    currentLockVersion = Number(conflictData?.currentLockVersion || currentLockVersion);
    conflictBanner.remove();
    saveDraftLocally();
    showToast('Saved your current local changes ✨');
  });

  document.getElementById('btn-conflict-reload')?.addEventListener('click', async () => {
    conflictBanner.remove();
    if (currentEditingWishId) {
      try {
        const res = await fetch(`/api/wishes/${encodeURIComponent(currentEditingWishId)}`, { credentials: 'include' });
        const json = await res.json();
        if (json.success && json.wish && json.wish.customData) {
          currentCustomData = { ...currentCustomData, ...json.wish.customData };
          currentLockVersion = Number(json.wish.lock_version || json.wish.lockVersion || currentLockVersion);
          populateFormValuesFromState();
          syncDataToIframe();
          showToast('Loaded newest remote draft 🔄');
        }
      } catch (e) {
        showToast('Error reloading remote draft');
      }
    }
  });
}

function sanitizeCustomDataForPublish(data) {
  if (!data || typeof data !== 'object') return data;
  const sanitized = Array.isArray(data) ? [] : {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') {
      sanitized[k] = v
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript\s*:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    } else if (typeof v === 'object' && v !== null) {
      sanitized[k] = sanitizeCustomDataForPublish(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

window.resetCustomizerChanges = function(skipConfirm = false) {
  if (!skipConfirm && typeof confirm === 'function' && !confirm('Are you sure you want to reset all changes to template defaults?')) return false;

  if (activeTemplate) {
    const variantDraftKey = getLocalDraftStorageKey(activeTemplate);
    localStorage.removeItem(variantDraftKey);
    localStorage.removeItem(`wishmagic_draft_${activeTemplate.id}`);

    window._userModifiedFields = new Set();
    currentCustomData.recipient_name = '';
    currentCustomData.sender_name = '';
    currentCustomData.sender_contact = '';
    currentCustomData.event_date = '';
    currentCustomData.custom_message = '';
    currentCustomData.photos = [];
    currentCustomData.cover_photo = '';
    currentCustomData.photo_1 = '';
    currentCustomData._hiddenSections = [];
    currentCustomData.hiddenSections = [];
    currentCustomData._hiddenFields = [];
    currentCustomData.hiddenFields = [];
    if (Array.isArray(currentCustomData.sections)) {
      currentCustomData.sections.forEach(s => {
        if (s && s.id !== 'voice') s.enabled = true;
      });
    }
    currentCustomData._userOverrodePalette = false;

    if (currentCustomData.media) {
      currentCustomData.media.coverPhoto = null;
      currentCustomData.media.photos = [];
      if (currentCustomData.media.voiceNote) {
        currentCustomData.media.voiceNote = { enabled: false, type: 'none', name: '', src: '', duration: 0 };
      }
    }

    // Reset all dynamic manifest field keys back to templateDefaultValues
    Object.keys(templateDefaultValues).forEach(k => {
      if (!isMandatoryIdentityField(k)) {
        currentCustomData[k] = templateDefaultValues[k];
      }
    });

    applyTemplateDefaults(activeTemplate);
    if (activeTemplate.selectedVariant) {
      applySelectedVariantToCustomizer(activeTemplate.selectedVariant, true);
    }
    applyUtpTemplateCapabilityGating(activeTemplate);
    renderDynamicTemplateFields(activeTemplate);
    populateFormValuesFromState();
    renderPhotosUI();
    renderSectionsUI();
    if (typeof window.renderTemplatePhotoSlotsManager === 'function') {
      window.renderTemplatePhotoSlotsManager();
    }
    if (typeof window.updateCustomizationProgressUI === 'function') {
      window.updateCustomizationProgressUI();
    }
    syncDataToIframe();
    showToast('Reset to template defaults ↺');
    return true;
  }
  return false;
};

// -----------------------------------------------------------------------------
// PUBLISHING & LINK GENERATION FLOW
// -----------------------------------------------------------------------------
let isPublishingInProgress = false;

window.publishWishAndGetLink = async function() {
  if (isPublishingInProgress) {
    console.warn('[Customizer] Publish already in progress. Ignoring duplicate click.');
    return;
  }

  if (!validateStep1()) {
    window.goToStep(1);
    return;
  }

  // Navigate to Step 4 if user clicked from earlier steps
  if (currentStep < 4) {
    window.goToStep(4);
    showToast('✨ Review your personalization and choose your link below');
    return;
  }

  if (!activeTemplate) {
    showToast('Please select a template');
    return;
  }

  // Validate chosen slug before publishing
  const chosenSlug = (currentCustomData.customSlug || currentCustomData.slug || '').toLowerCase().trim();
  if (chosenSlug) {
    const isValid = window.WishLinkSuggestions ? window.WishLinkSuggestions.isValidSlug(chosenSlug) : true;
    const isReserved = window.WishLinkSuggestions ? window.WishLinkSuggestions.isReservedSlug(chosenSlug) : false;
    if (isReserved) {
      showToast('🚫 This link is reserved for platform use. Please pick another.');
      const slugInput = document.getElementById('wish-slug-input');
      if (slugInput) slugInput.focus();
      return;
    }
    if (!isValid) {
      showToast('⚠️ Please enter a valid link name (3–80 letters, numbers, and hyphens).');
      const slugInput = document.getElementById('wish-slug-input');
      if (slugInput) slugInput.focus();
      return;
    }
    if (lastSlugCheckResult && lastSlugCheckResult.available === false && lastSlugCheckResult.reason === 'taken') {
      showToast('⚠️ That link is already taken. Please choose an available link.');
      const slugInput = document.getElementById('wish-slug-input');
      if (slugInput) slugInput.focus();
      return;
    }
  }

  // Part 12: Field & Template Content Validation Check
  if (window.WishFieldValidator) {
    const valResult = window.WishFieldValidator.validateWishState(currentCustomData, activeTemplate);
    if (!valResult.valid && valResult.errors.length > 0) {
      showToast('⚠️ ' + valResult.errors[0].message);
      return;
    }
  }

  ensureDefaultMessagesPreserved();

  // Part 4: Validate manifest dynamic fields before publishing (only Name/DOB are required; uncustomized messages keep template defaults)
  if (activeTemplate) {
    const rawFields = (activeTemplate.manifest && activeTemplate.manifest.fields) || activeTemplate.fields || [];
    for (const f of rawFields) {
      const fKey = f.id || f.key;
      const isVisible = evaluateFieldVisibility(f, currentCustomData);
      if (isVisible && window.WishMagicFieldRenderer) {
        const fieldForVal = { ...f, required: isMandatoryIdentityField(fKey) };
        const valRes = window.WishMagicFieldRenderer.validate(fieldForVal, currentCustomData[fKey]);
        if (!valRes.valid) {
          showToast(`⚠️ ${valRes.errors[0] || ((f.label || fKey) + ' is required')}`);
          window.goToStep(1);
          const el = document.querySelector(`[data-field-key="${fKey}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('wm-field-invalid');
            const inputCtrl = el.querySelector('input, textarea, select');
            if (inputCtrl) inputCtrl.focus();
          }
          return;
        }
      }
    }
  }

  // Part 11: Centralized Entitlement Check
  if (window.WishFeatureAccess) {
    const publishCheck = window.WishFeatureAccess.canPublishWish(activeTemplate, currentCustomData);
    if (!publishCheck.allowed) {
      if (window.WishPremiumLock) {
        window.WishPremiumLock.open({
          context: 'template',
          template: activeTemplate,
          onUnlocked: async () => {
            await window.publishWishAndGetLink();
          }
        });
      }
      return;
    }
  }

  // Ensure auth check has resolved
  if (window.WishAuth && typeof window.WishAuth.waitForAuthReady === 'function') {
    await window.WishAuth.waitForAuthReady(2500);
  }

  // Ensure user is authenticated before publishing
  if (!window.WishAuth || !window.WishAuth.isAuthenticated()) {
    if (typeof window.openAuthModal === 'function') {
      window.openAuthModal('signin', '✨ Please sign in with your Google account to publish and save your celebration website!');
    } else {
      showToast('⚠️ Please sign in to publish your celebration website.');
    }
    return;
  }

  // Verify Custom Link entitlement if user is publishing a personalized slug
  const randomPrefix = (currentWishLinkSettings && currentWishLinkSettings.random && currentWishLinkSettings.random.prefix) || 'wish-';
  const isRandomSlug = Boolean(chosenSlug && chosenSlug.startsWith(randomPrefix) && (currentCustomData.linkType === 'random' || currentCustomData.link_type === 'random'));
  const wantsPersonalizedLink = Boolean(chosenSlug && !isRandomSlug && !currentCustomData.useReferralCredit);

  if (wantsPersonalizedLink) {
    const hasCustomLinkEnt = (window.WishEntitlement && typeof window.WishEntitlement.hasCustomLinkAccess === 'function')
      ? window.WishEntitlement.hasCustomLinkAccess(chosenSlug, activeTemplate && activeTemplate.id)
      : (window.WishEntitlement ? window.WishEntitlement.isPremium() : false);

    if (!hasCustomLinkEnt && !currentCustomData.verifiedOrderId) {
      await window.handlePersonalizedLinkCheckout(selectedCustomizerPack === 'hd_style' ? 'custom_link' : (selectedCustomizerPack || 'combo'));
      return;
    }
  }

  isPublishingInProgress = true;
  try {
    const isVipEntitled = window.WishEntitlement ? window.WishEntitlement.isPremium() : false;
    const hasTplEnt = window.WishEntitlement && typeof window.WishEntitlement.hasTemplateEntitlement === 'function'
      ? window.WishEntitlement.hasTemplateEntitlement(activeTemplate && activeTemplate.id)
      : isVipEntitled;
    const isVipTemplate = activeTemplate.tier === 'vip' || activeTemplate.isPremium === true || (activeTemplate.price && Number(activeTemplate.price) > 0);
    const isVip = isVipEntitled || hasTplEnt || isVipTemplate || Boolean(currentCustomData.lifetimePreservation) || Boolean(currentCustomData.watermarkRemoved);

    await executeWishCreation({
      tier: isVip ? 'vip' : 'free',
      price: isVip ? (activeTemplate.price || 49) : 0,
      orderId: currentCustomData.verifiedOrderId || null,
      buyerDetails: {
        name: currentCustomData.sender_name || 'Creator',
        phone: currentCustomData.sender_contact || ''
      },
      payment: (isVip || wantsPersonalizedLink || currentCustomData.verifiedOrderId) ? {
        status: 'Completed',
        orderId: currentCustomData.verifiedOrderId || null,
        method: currentCustomData.verifiedOrderId ? 'Razorpay Verified' : 'Verified Entitlement',
        transactionId: currentCustomData.verifiedTransactionId || ('ENT_' + Date.now().toString(36).toUpperCase())
      } : null
    });
  } finally {
    isPublishingInProgress = false;
  }
};

async function executeWishCreation(extraPayload = {}) {
  try {
    const currentUser = (window.WishAuth && window.WishAuth.getCurrentUser()) || null;
    const currentUserId = currentUser ? currentUser.id : (localStorage.getItem('wishmagic_guest_user_id') || ('usr_guest_' + Date.now().toString(36)));
    try {
      if (!localStorage.getItem('wishmagic_guest_user_id')) {
        localStorage.setItem('wishmagic_guest_user_id', currentUserId);
      }
    } catch (e) {}

    const chosenSlug = (extraPayload.slug || currentCustomData.customSlug || currentCustomData.slug || '').toLowerCase().trim();
    const linkType = extraPayload.linkType || currentCustomData.linkType || (chosenSlug ? 'personalized' : 'random');
    const sanitizedData = sanitizeCustomDataForPublish(currentCustomData);

    const urlParamsForCamp = new URLSearchParams(window.location.search || '');
    const activeFestivalCampaignId = window._activeFestivalCampaignId || currentCustomData.festivalCampaignId || urlParamsForCamp.get('campaign') || urlParamsForCamp.get('campaignId') || (activeTemplate && activeTemplate.festivalCampaign && activeTemplate.festivalCampaign.campaignId) || null;
    const payload = {
      templateId: activeTemplate.id,
      ...(activeFestivalCampaignId ? { campaignId: activeFestivalCampaignId, festivalCampaignId: activeFestivalCampaignId } : {}),
      templateVersionId: activeTemplate.activeVersionId || activeTemplate.versionId || activeTemplate.templateVersionId || null,
      linkType,
      userId: currentUserId,
      lockVersion: currentLockVersion,
      customData: {
        ...sanitizedData,
        userId: currentUserId,
        customSlug: chosenSlug,
        slug: chosenSlug,
        linkType,
        link_type: linkType
      },
      slug: chosenSlug,
      ...extraPayload
    };

    let data = null;
    if (currentEditingWishId) {
      // 1. Ensure latest customizations are updated
      payload.status = 'published';
      payload.isDraft = false;

      if (window.WishApiClient && typeof window.WishApiClient.put === 'function') {
        data = await window.WishApiClient.put(`/api/wishes/${encodeURIComponent(currentEditingWishId)}`, payload);
      } else {
        const res = await fetch(`/api/wishes/${encodeURIComponent(currentEditingWishId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        data = await res.json();
      }

      // 2. Trigger server-authoritative publish snapshot generation
      if (data && data.success) {
        try {
          const pubRes = await fetch(`/api/wishes/${encodeURIComponent(currentEditingWishId)}/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id: currentEditingWishId })
          });
          const pubData = await pubRes.json().catch(() => ({}));
          if (pubData && pubData.success) {
            data.activeSnapshotId = pubData.activeSnapshotId;
            data.snapshotVersion = pubData.snapshotVersion;
          }
        } catch (_) {}

        data.wishId = currentEditingWishId;
        if (data.lockVersion) currentLockVersion = Number(data.lockVersion);
      }
    } else {
      payload.status = 'published';
      payload.isDraft = false;

      if (window.WishApiClient && typeof window.WishApiClient.post === 'function') {
        data = await window.WishApiClient.post('/api/wishes', payload);
      } else {
        const res = await fetch('/api/wishes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        data = await res.json();
      }
    }

    if (!data || !data.success) {
      if (data && (data.error === 'SLUG_TAKEN' || (data.message && data.message.includes('already taken')))) {
        showToast('⚠️ That link is already taken. Please choose another variation below!');
        const slugInput = document.getElementById('wish-slug-input');
        if (slugInput) slugInput.focus();
        if (typeof window.checkSlugAvailability === 'function') {
          window.checkSlugAvailability(chosenSlug, true);
        }
        return null;
      }
      const errCode = (data && (data.code || data.error)) || '';
      if (String(errCode).startsWith('FESTIVAL_') || errCode === 'VARIANT_NOT_ENABLED_FOR_CAMPAIGN') {
        if (typeof window.showFestivalCampaignExpiredNotice === 'function') {
          window.showFestivalCampaignExpiredNotice(data.message || 'This festival campaign is no longer accepting new wishes.', data);
        }
      }
      showToast('⚠️ ' + (data && data.message ? data.message : 'Could not generate wish link. Please try again.'));
      return null;
    }

    const createdWishId = data.wishId || (data.wish && data.wish.id) || currentEditingWishId;
    if (data.success && createdWishId) {
      const wishSlug = data.slug || (data.wish && data.wish.slug) || chosenSlug || createdWishId;
      const fullLink = data.canonicalUrl || data.url || (typeof window.getPublicWishUrl === 'function' ? window.getPublicWishUrl(wishSlug) : `${window.location.origin}/wish/${wishSlug}`);

      // Save to local user wishes collection for creator dashboard with repository
      try {
        const wishRecord = data.wish || {
          id: data.wishId,
          slug: wishSlug,
          userId: currentUserId,
          templateId: activeTemplate.id,
          customData: currentCustomData,
          createdAt: new Date().toISOString()
        };

        if (window.WishRepositories) {
          await WishRepositories.wishRepository.save(wishRecord, currentUserId);
          WishRepositories.draftRepository.delete('draft_' + activeTemplate.id, currentUserId);
        } else {
          let userWishes = JSON.parse(localStorage.getItem('wishmagic_user_wishes') || '[]');
          if (!Array.isArray(userWishes)) userWishes = [];
          userWishes.unshift(wishRecord);
          localStorage.setItem('wishmagic_user_wishes', JSON.stringify(userWishes));
        }

        // Clean up draft for this template if successfully published
        let drafts = JSON.parse(localStorage.getItem('wishmagic_drafts') || '[]');
        if (Array.isArray(drafts)) {
          drafts = drafts.filter(d => !(d.templateId === activeTemplate.id && (d.userId === currentUserId || !d.userId)));
          localStorage.setItem('wishmagic_drafts', JSON.stringify(drafts));
        }
      } catch (e) {
        console.warn('Error saving to creator storage:', e);
      }

      // Stage 5: Sync saved revision state on successful publish
      lastSavedRevision = currentCustomizerRevision;
      updateSaveIndicatorStatus('saved');

      // Trigger Confetti Celebration
      if (typeof confetti === 'function') {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      }

      // Part 16: Track Event
      if (window.WishAnalyticsService) {
        window.WishAnalyticsService.trackEvent('wish_created', {
          wishId: data.wishId,
          slug: wishSlug,
          templateId: activeTemplate.id,
          templateName: activeTemplate.name,
          category: activeTemplate.category,
          recipientName: currentCustomData.recipient_name,
          userId: currentUserId,
          metadata: { isVip: Boolean(currentCustomData.lifetimePreservation || currentCustomData.watermarkRemoved || activeTemplate.isPremium) }
        });
      }

      // Part 17: Notification Dispatch & Floating Toast
      if (window.WishNotificationService) {
        window.WishNotificationService.notify(window.WishNotificationService.TYPES.WISH_PUBLISHED, {
          userId: currentUserId,
          wishId: data.wishId,
          slug: wishSlug,
          recipientName: currentCustomData.recipient_name,
          templateName: activeTemplate.name,
          actionUrl: `/w/${wishSlug}`
        });
        if (window.WishToast) {
          window.WishToast.show({
            title: 'Celebration Published! ✨',
            message: `Your wish for ${currentCustomData.recipient_name || 'your loved one'} is now live and ready to share!`,
            type: 'success'
          });
        }
      }

      if (window.WishShareSystem) {
        WishShareSystem.openShareModal(data.wish || {
          id: data.wishId,
          slug: wishSlug,
          recipientName: currentCustomData.recipient_name,
          buyerName: currentCustomData.sender_name,
          customData: currentCustomData
        }, { template: activeTemplate });
      } else {
        showGeneratedLinkModal(data.wishId, fullLink, data.wish);
      }
    } else {
      showToast('⚠️ Error generating wish: ' + (data.message || 'Unknown error'));
    }
  } catch (err) {
    showToast('⚠️ Network error generating wish link: ' + err.message);
  }
}

function showGeneratedLinkModal(wishId, fullLink, wish = null) {
  let modal = document.getElementById('generated-link-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'generated-link-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 transition-all duration-300';
    document.body.appendChild(modal);
  }

  const recipient = currentCustomData.recipient_name || 'Friend';
  const whatsappMsg = encodeURIComponent(`✨ Hey ${recipient}! I created a magical interactive celebration surprise website for you. Tap the link to open it: ${fullLink}`);

  const isFuture = wish && wish.lifecycleStatus === 'future';
  const eventDate = wish && (wish.eventDate || (wish.customData && wish.customData.event_date));
  const statusPill = isFuture 
    ? `<div class="mb-3 px-3.5 py-1.5 rounded-full bg-purple-500/20 text-purple-300 text-xs font-semibold border border-purple-500/30 inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-purple-400"></span> 🟣 Future Scheduled: ${eventDate || 'Upcoming Date'}</div>`
    : `<div class="mb-3 px-3.5 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30 inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> 🟢 Live &amp; Shareable Right Now</div>`;

  modal.innerHTML = `
    <div class="w-full max-w-lg bg-surface-container-low rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col items-center text-center border border-purple-500/30 relative overflow-hidden">
      <!-- Glow background -->
      <div class="absolute -top-20 -left-20 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-20 -right-20 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>

      <!-- Close button -->
      <button onclick="document.getElementById('generated-link-modal').classList.add('hidden')" class="absolute top-4 right-4 p-2 text-on-surface-variant hover:text-on-surface rounded-full hover:bg-surface-container-high transition cursor-pointer">
        <span class="material-symbols-outlined text-[20px]">close</span>
      </button>

      <!-- Celebration Icon -->
      <div class="w-16 h-16 rounded-full bg-gradient-to-tr from-pink-500 via-purple-600 to-amber-300 flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(236,72,153,0.5)] mb-3 animate-bounce">
        🎊
      </div>

      <h3 class="font-display text-2xl sm:text-3xl font-extrabold text-on-surface mb-2">
        Your Magical Link is Ready!
      </h3>

      ${statusPill}

      <p class="font-body-sm text-body-sm text-on-surface-variant mb-5 max-w-md">
        Personalized for <strong class="text-pink-400 font-bold">${recipient}</strong>. Anyone with this link will experience this exact celebration website!
      </p>

      <!-- Link Copy Box -->
      <div class="w-full bg-surface-container-lowest p-2 rounded-2xl border border-purple-500/30 flex items-center justify-between gap-2 shadow-inner mb-5">
        <input id="generated-link-input" type="text" readonly value="${fullLink}" class="w-full bg-transparent text-xs sm:text-sm font-mono text-purple-200 px-3 py-2 focus:outline-none truncate select-all"/>
        <button onclick="copyGeneratedLink()" id="btn-copy-link" class="px-4 py-2 rounded-xl bg-gradient-to-r from-primary-container to-purple-600 text-white font-bold text-xs shadow hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer">
          <span class="material-symbols-outlined text-[16px]">content_copy</span>
          <span id="copy-btn-text">Copy Link</span>
        </button>
      </div>

      <!-- Action Buttons -->
      <div class="w-full flex flex-col sm:flex-row gap-3">
        <!-- WhatsApp Share -->
        <a href="https://api.whatsapp.com/send?text=${whatsappMsg}" target="_blank" class="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#25D366] text-white font-bold text-sm shadow-lg hover:brightness-105 active:scale-95 transition-all">
          <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.275.072.376-.044c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824z"/></svg>
          <span>Share on WhatsApp</span>
        </a>

        <!-- Open Experience Live -->
        <a href="${fullLink}" target="_blank" class="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-sm border border-purple-500/30 transition-all">
          <span class="material-symbols-outlined text-[18px]">open_in_new</span>
          <span>Open Live Wish</span>
        </a>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');

  // Trigger confetti
  if (typeof confetti === 'function') {
    confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
  }
}

async function copyGeneratedLink() {
  const input = document.getElementById('generated-link-input');
  const btnText = document.getElementById('copy-btn-text');
  const btn = document.getElementById('btn-copy-link');

  if (!input || !input.value.trim()) {
    showToast('⚠️ No celebration link available to copy.');
    return;
  }

  const url = input.value.trim();
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Copying...';

  let copied = false;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch (_) {
      copied = false;
    }
  }

  if (!copied) {
    try {
      input.focus();
      input.select();
      input.setSelectionRange(0, 99999);
      copied = document.execCommand('copy');
    } catch (_) {
      copied = false;
    }
  }

  if (copied) {
    if (btnText) btnText.textContent = 'Copied! ✨';
    showToast('🔗 Celebration link copied to clipboard!');
  } else {
    if (btnText) btnText.textContent = 'Copy Failed';
    showToast('⚠️ Could not copy automatically. Please select and copy manually.');
    input.focus();
    input.select();
  }

  setTimeout(() => {
    if (btnText) btnText.textContent = 'Copy Link';
    if (btn) btn.disabled = false;
  }, 2500);
}

// Toast notification helper
var showToast = function(msg) {
  let toast = document.getElementById('customizer-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'customizer-toast';
    toast.className = 'fixed top-6 right-6 z-50 transform translate-y-[-150%] opacity-0 transition-all duration-300 pointer-events-none px-4 py-2.5 rounded-2xl bg-purple-950/95 text-white text-xs font-bold shadow-2xl border border-purple-700/60 flex items-center gap-2';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.remove('translate-y-[-150%]', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');
  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-[-150%]', 'opacity-0');
  }, 2800);
}



// =============================================================================
// QUICK SUB-TAB NAVIGATION, LEVEL A/B/C PROGRESSIVE DISCLOSURE & PHOTO SLOTS MANAGER
// =============================================================================
window._activeStep1SubTab = 'basic';
window._activeStep2SubTab = 'colors';
window._pendingSlotPhotoFieldKey = null;

window.getAvailableStep1SubTabs = function() {
  const caps = window._customizerCapabilities || {};
  const hasDynFields = Boolean(
    caps.hasDynamicFields ||
    (document.getElementById('template-dynamic-fields-container')?.children.length || 0) > 0 ||
    ((currentCustomData.sections || []).length > 0)
  );
  const supportsPhotos = caps.supportsAnyPhoto !== false;
  const supportsAudio = (caps.supportsVoice !== false) || (caps.supportsMusic !== false);

  const available = ['basic'];
  if (hasDynFields) available.push('template');
  if (supportsPhotos) available.push('photos');
  if (supportsAudio) available.push('audio');
  return available;
};

window.syncStep1SubTabCapabilitiesUI = function() {
  const available = new Set(window.getAvailableStep1SubTabs());
  const tabMeta = [
    { key: 'basic', btnId: 'step1-subtab-btn-basic' },
    { key: 'template', btnId: 'step1-subtab-btn-template' },
    { key: 'photos', btnId: 'step1-subtab-btn-photos' },
    { key: 'audio', btnId: 'step1-subtab-btn-audio' }
  ];
  tabMeta.forEach(({ key, btnId }) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (available.has(key)) {
      btn.classList.remove('hidden');
      btn.removeAttribute('aria-hidden');
      btn.disabled = false;
    } else {
      btn.classList.add('hidden');
      btn.setAttribute('aria-hidden', 'true');
      btn.disabled = true;
    }
  });
  if (window._activeStep1SubTab !== 'all' && !available.has(window._activeStep1SubTab)) {
    window._activeStep1SubTab = 'basic';
  }
};

window.switchCustomizationLevel = function(levelKey) {
  const validLevels = ['quick', 'personal', 'advanced'];
  const targetLevel = validLevels.includes(levelKey) ? levelKey : 'quick';
  window._activeCustomizationLevel = targetLevel;

  if (targetLevel === 'quick') {
    if (currentStep !== 1) window.goToStep(1);
    window.switchStep1SubTab('basic');
  } else if (targetLevel === 'personal') {
    if (currentStep !== 1) window.goToStep(1);
    const avail = window.getAvailableStep1SubTabs().filter(k => k !== 'basic');
    window.switchStep1SubTab(avail[0] || 'all');
  } else if (targetLevel === 'advanced') {
    window.goToStep(2);
    window.switchStep2SubTab('colors');
  }

  window.syncCustomizationLevelButtonsUI();
  window.updateCustomizationProgressUI();
};

window.syncCustomizationLevelButtonsUI = function() {
  let effectiveLevel = window._activeCustomizationLevel || 'quick';
  if (currentStep === 2 || currentStep === 3) {
    effectiveLevel = 'advanced';
  } else if (currentStep === 1) {
    effectiveLevel = (window._activeStep1SubTab === 'basic') ? 'quick' : 'personal';
  }
  window._activeCustomizationLevel = effectiveLevel;

  ['quick', 'personal', 'advanced'].forEach(lvl => {
    const btn = document.getElementById('level-tab-btn-' + lvl);
    if (!btn) return;
    const isSel = lvl === effectiveLevel;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', isSel ? 'true' : 'false');
    btn.tabIndex = isSel ? 0 : -1;
    if (isSel) {
      btn.className = 'level-tab-btn flex-1 min-w-0 py-2 px-3 rounded-xl font-extrabold text-xs bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer';
    } else {
      btn.className = 'level-tab-btn flex-1 min-w-0 py-2 px-3 rounded-xl font-bold text-xs bg-white/80 dark:bg-purple-950/60 text-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200/70 dark:border-purple-800/60 flex items-center justify-center gap-1.5 transition cursor-pointer';
    }
  });
};

window.updateCustomizationProgressUI = function() {
  const requiresDate = templateRequiresEventDate(activeTemplate);
  const hasName = Boolean(currentCustomData.recipient_name && String(currentCustomData.recipient_name).trim().length > 0);
  const hasDate = !requiresDate || Boolean(currentCustomData.event_date && String(currentCustomData.event_date).trim().length > 0);
  const hasSender = Boolean(currentCustomData.sender_name && String(currentCustomData.sender_name).trim().length > 0);
  const hasMessage = Boolean(currentCustomData.custom_message && String(currentCustomData.custom_message).trim().length > 0);

  const reqTotal = requiresDate ? 2 : 1;
  const reqDone = (hasName ? 1 : 0) + (requiresDate ? (hasDate ? 1 : 0) : 0);

  const uploadedPhotos = (currentCustomData.media && Array.isArray(currentCustomData.media.photos))
    ? currentCustomData.media.photos
    : (Array.isArray(currentCustomData.photos) ? currentCustomData.photos : []);
  const customPhotosCount = uploadedPhotos.filter(p => p && (p.src || p.url) && p.id !== 'photo_default_1').length;
  const hasVoice = Boolean((currentCustomData.voice_note && currentCustomData.voice_note.enabled) || (currentCustomData.media && currentCustomData.media.voiceNote && currentCustomData.media.voiceNote.enabled));
  const hasMusic = Boolean((currentCustomData.music && currentCustomData.music.enabled !== false) || (currentCustomData.media && currentCustomData.media.music && currentCustomData.media.music.enabled !== false));

  const pct = Math.min(100, Math.round((reqDone / reqTotal) * 70 + (hasSender ? 10 : 0) + (hasMessage ? 10 : 0) + (customPhotosCount > 0 ? 10 : 0)));

  const progBar = document.getElementById('customizer-progress-bar');
  if (progBar) {
    progBar.style.width = `${pct}%`;
    progBar.setAttribute('aria-valuenow', String(pct));
  }
  const progText = document.getElementById('customizer-progress-text');
  if (progText) {
    progText.textContent = reqDone >= reqTotal
      ? `Ready to publish (${pct}% personalized)`
      : `Required: ${reqDone}/${reqTotal} complete`;
  }

  // Update Level B state badges
  const photosBadge = document.getElementById('subtab-state-badge-photos');
  if (photosBadge) {
    photosBadge.textContent = customPhotosCount > 0 ? `${customPhotosCount} added` : 'Default';
  }
  const audioBadge = document.getElementById('subtab-state-badge-audio');
  if (audioBadge) {
    audioBadge.textContent = hasVoice ? 'Voice + Music' : (hasMusic ? 'Music On' : 'Muted');
  }
};

window.switchStep1SubTab = function(tabKey) {
  window.syncStep1SubTabCapabilitiesUI();
  const tabsOrder = window.getAvailableStep1SubTabs();
  const requested = tabKey || 'basic';
  window._activeStep1SubTab = (requested === 'all' || tabsOrder.includes(requested)) ? requested : 'basic';

  const labelsMap = {
    basic: 'Level A: Quick Customize (Essential Info)',
    template: 'Level B: Template Text & Sections',
    photos: 'Level B: Photos & Album Slots',
    audio: 'Level B: Music & Voice Note',
    all: 'Showing All Supported Sections'
  };

  const nameMap = {
    basic: 'Basic Info',
    template: 'Text & Sections',
    photos: 'Photos & Slots',
    audio: 'Music & Voice'
  };

  ['basic', 'template', 'photos', 'audio', 'all'].forEach(k => {
    const btn = document.getElementById('step1-subtab-btn-' + k);
    if (!btn) return;
    const isSel = k === window._activeStep1SubTab;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', isSel ? 'true' : 'false');
    btn.tabIndex = isSel ? 0 : -1;
    const isHidden = btn.classList.contains('hidden');
    if (k === 'all') {
      btn.className = (isSel
        ? 'step1-subtab-btn py-1.5 px-3 rounded-lg font-bold text-[11px] bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-xs flex items-center gap-1 transition cursor-pointer'
        : 'step1-subtab-btn py-1.5 px-3 rounded-lg font-bold text-[11px] bg-purple-100/80 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 hover:bg-purple-200 flex items-center gap-1 transition cursor-pointer') + (isHidden ? ' hidden' : '');
      return;
    }
    if (isSel) {
      btn.className = 'step1-subtab-btn min-h-[42px] py-2 px-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer' + (isHidden ? ' hidden' : '');
    } else {
      btn.className = 'step1-subtab-btn min-h-[42px] py-2 px-2.5 rounded-xl font-bold text-xs bg-white/80 dark:bg-purple-950/60 text-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200/70 dark:border-purple-800/60 flex items-center justify-center gap-1.5 transition cursor-pointer' + (isHidden ? ' hidden' : '');
    }
  });

  const caps = window._customizerCapabilities || {};
  const step1Container = document.getElementById('step-content-1');
  if (step1Container) {
    step1Container.querySelectorAll('[data-step1-tab]').forEach(cardEl => {
      const cardTab = cardEl.getAttribute('data-step1-tab');

      // Respect capability gating strictly: never un-hide unsupported cards!
      if (cardEl.id === 'dynamic-template-fields-card') {
        const hasDynFields = (document.getElementById('template-dynamic-fields-container')?.children.length || 0) > 0 || ((currentCustomData.sections || []).length > 0);
        if (!hasDynFields) {
          cardEl.classList.add('hidden');
          cardEl.setAttribute('aria-hidden', 'true');
          return;
        }
      }
      if (cardEl.id === 'step1-card-photos' && caps.supportsAnyPhoto === false) {
        cardEl.classList.add('hidden');
        cardEl.setAttribute('aria-hidden', 'true');
        return;
      }
      if (cardEl.id === 'voice-note-section-wrapper' && caps.supportsVoice === false) {
        cardEl.classList.add('hidden');
        cardEl.setAttribute('aria-hidden', 'true');
        return;
      }
      if (cardEl.id === 'music-section-wrapper' && caps.supportsMusic === false) {
        cardEl.classList.add('hidden');
        cardEl.setAttribute('aria-hidden', 'true');
        return;
      }

      if (window._activeStep1SubTab === 'all' || cardTab === window._activeStep1SubTab) {
        cardEl.classList.remove('hidden');
        cardEl.setAttribute('aria-hidden', 'false');
      } else {
        cardEl.classList.add('hidden');
        cardEl.setAttribute('aria-hidden', 'true');
      }
    });
  }

  const progPill = document.getElementById('step1-progress-pill');
  const footerLabel = document.getElementById('step1-footer-card-label');
  const prevBtn = document.getElementById('btn-step1-prev-card');
  const nextBtn = document.getElementById('btn-step1-next-card');
  const idx = tabsOrder.indexOf(window._activeStep1SubTab);

  if (progPill) {
    progPill.textContent = idx !== -1 ? `Section ${idx + 1} of ${tabsOrder.length}` : `All ${tabsOrder.length} Sections`;
  }
  if (footerLabel) {
    footerLabel.textContent = labelsMap[window._activeStep1SubTab] || '';
  }
  if (prevBtn) {
    prevBtn.disabled = idx <= 0;
    prevBtn.className = idx <= 0
      ? 'min-h-[40px] py-2 px-3.5 rounded-xl bg-purple-100/40 dark:bg-purple-900/20 text-purple-400 text-xs font-bold opacity-40 pointer-events-none'
      : 'min-h-[40px] py-2 px-3.5 rounded-xl bg-purple-100/80 dark:bg-purple-900/50 hover:bg-purple-200 text-purple-900 dark:text-purple-200 font-bold text-xs transition cursor-pointer';
  }
  if (nextBtn) {
    if (idx !== -1 && idx < tabsOrder.length - 1) {
      const nextKey = tabsOrder[idx + 1];
      nextBtn.textContent = `Next: ${nameMap[nextKey] || nextKey} →`;
      nextBtn.onclick = () => window.step1NavigateCard(1);
    } else {
      nextBtn.textContent = 'Next: Step 2 (Theme & Style) →';
      nextBtn.onclick = () => window.goToStep(2);
    }
  }

  window.syncCustomizationLevelButtonsUI();
  window.updateCustomizationProgressUI();

  if (window._activeStep1SubTab === 'photos') {
    window.renderTemplatePhotoSlotsManager();
    window.scrollIframeToSection('gallery');
  } else if (window._activeStep1SubTab === 'basic') {
    window.scrollIframeToSection('hero');
  }
};

window.step1NavigateCard = function(direction) {
  const tabsOrder = window.getAvailableStep1SubTabs();
  const curIdx = Math.max(0, tabsOrder.indexOf(window._activeStep1SubTab));
  const nextIdx = curIdx + (direction >= 0 ? 1 : -1);
  if (nextIdx >= 0 && nextIdx < tabsOrder.length) {
    window.switchStep1SubTab(tabsOrder[nextIdx]);
  } else if (nextIdx >= tabsOrder.length) {
    window.goToStep(2);
  }
};

window.switchStep2SubTab = function(tabKey) {
  window._activeStep2SubTab = tabKey || 'colors';
  ['colors', 'fonts', 'fx', 'all'].forEach(k => {
    const btn = document.getElementById('step2-subtab-btn-' + k);
    if (!btn) return;
    const isSel = k === window._activeStep2SubTab;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', isSel ? 'true' : 'false');
    btn.tabIndex = isSel ? 0 : -1;
    if (isSel) {
      btn.className = 'step2-subtab-btn min-h-[40px] py-2 px-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer';
    } else {
      btn.className = 'step2-subtab-btn min-h-[40px] py-2 px-2.5 rounded-xl font-bold text-xs bg-white/80 dark:bg-purple-950/60 text-purple-900 dark:text-purple-200 border border-purple-200/70 dark:border-purple-800/60 flex items-center justify-center gap-1.5 transition cursor-pointer';
    }
  });
  const step2Container = document.getElementById('step-content-2');
  if (step2Container) {
    step2Container.querySelectorAll('[data-step2-tab]').forEach(cardEl => {
      const cardTab = cardEl.getAttribute('data-step2-tab');
      if (window._activeStep2SubTab === 'all' || cardTab === window._activeStep2SubTab) {
        cardEl.classList.remove('hidden');
        cardEl.setAttribute('aria-hidden', 'false');
      } else {
        cardEl.classList.add('hidden');
        cardEl.setAttribute('aria-hidden', 'true');
      }
    });
  }
};

window.selectDynamicFieldSection = function(secId) {
  window._activeDynamicFieldSection = secId || 'all';
  if (activeTemplate) {
    renderDynamicTemplateFields(activeTemplate);
  }
  if (secId && secId !== 'all') {
    window.scrollIframeToSection(secId);
  }
};

window.stepDynamicFieldSection = function(dir) {
  const container = document.getElementById('template-dynamic-fields-container');
  if (!container) return;
  const secSet = new Set();
  container.querySelectorAll('[data-field-section]').forEach(el => {
    const s = el.getAttribute('data-field-section');
    if (s) secSet.add(s);
  });
  const order = Array.from(secSet);
  if (order.length === 0) return;
  const curIdx = Math.max(0, order.indexOf(window._activeDynamicFieldSection));
  const nextIdx = Math.min(order.length - 1, Math.max(0, curIdx + dir));
  window.selectDynamicFieldSection(order[nextIdx]);
};

window.scrollIframeToSection = function(sectionId) {
  if (!sectionId) return;
  try {
    const iframe = document.getElementById('live-custom-iframe');
    const doc = iframe && (iframe.contentDocument || iframe.contentWindow?.document);
    if (!doc) return;
    const target = doc.querySelector(`[data-wm-section="${sectionId}"], [data-wm-subsection="${sectionId}"], #${sectionId}, #section-${sectionId}`);
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } catch (_) {}
};

window.toggleCustomerSectionQuick = function(sectionId) {
  if (!sectionId || sectionId === 'hero') return;
  if (!Array.isArray(currentCustomData._hiddenSections)) currentCustomData._hiddenSections = [];
  const secObj = (currentCustomData.sections || []).find(s => s.id === sectionId);
  const currentlyHidden = currentCustomData._hiddenSections.includes(sectionId) || (secObj && secObj.enabled === false);
  const nextEnabled = currentlyHidden;

  if (secObj) {
    window.toggleSection(sectionId, nextEnabled);
  } else {
    if (!nextEnabled) {
      if (!currentCustomData._hiddenSections.includes(sectionId)) currentCustomData._hiddenSections.push(sectionId);
    } else {
      currentCustomData._hiddenSections = currentCustomData._hiddenSections.filter(id => id !== sectionId);
    }
    currentCustomData.hiddenSections = [...currentCustomData._hiddenSections];
    if (!currentCustomData.sectionsMap) currentCustomData.sectionsMap = {};
    currentCustomData.sectionsMap[sectionId] = { enabled: nextEnabled };
    triggerAutosave();
    syncDataToIframe();
    showToast(`Section "${sectionId.replace(/_/g, ' ')}" ${nextEnabled ? 'Shown 👁️' : 'Hidden 🙈'}`);
  }
  if (activeTemplate) renderDynamicTemplateFields(activeTemplate);
  updateGallerySectionQuickButtonUI();
};

window.toggleGallerySectionQuick = function() {
  const galSec = (currentCustomData.sections || []).find(s => ['gallery', 'photos', 'album', 'memories'].includes(String(s.id || '').toLowerCase()));
  const secId = galSec ? galSec.id : 'gallery';
  window.toggleCustomerSectionQuick(secId);
};

function updateGallerySectionQuickButtonUI() {
  const btn = document.getElementById('btn-toggle-entire-gallery-section');
  if (!btn) return;
  const galSec = (currentCustomData.sections || []).find(s => ['gallery', 'photos', 'album', 'memories'].includes(String(s.id || '').toLowerCase()));
  const secId = galSec ? galSec.id : 'gallery';
  const hiddenSet = new Set(Array.isArray(currentCustomData._hiddenSections) ? currentCustomData._hiddenSections : []);
  const isOff = hiddenSet.has(secId) || (galSec && galSec.enabled === false);
  if (isOff) {
    btn.textContent = '🙈 Gallery Section: HIDDEN (Tap to Show)';
    btn.className = 'min-h-[34px] px-3 py-1.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition cursor-pointer';
  } else {
    btn.textContent = '👁️ Gallery Section: ON (Tap to Hide)';
    btn.className = 'min-h-[34px] px-3 py-1.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition cursor-pointer';
  }
}

window.toggleCustomerFieldVisibility = function(fieldKey, forceState = null) {
  const cleanKey = String(fieldKey || '').trim();
  if (!cleanKey || isMandatoryIdentityField(cleanKey)) return;
  if (!Array.isArray(currentCustomData._hiddenFields)) {
    currentCustomData._hiddenFields = [];
  }
  const isCurrentlyHidden = currentCustomData._hiddenFields.includes(cleanKey);
  const shouldHide = forceState !== null ? !forceState : !isCurrentlyHidden;

  if (shouldHide) {
    if (!currentCustomData._hiddenFields.includes(cleanKey)) {
      currentCustomData._hiddenFields.push(cleanKey);
    }
    const numMatch = cleanKey.match(/^photo_(\d+)$/i);
    if (numMatch) {
      const n = numMatch[1];
      [`photo_${n}_caption`, `caption_${n}`, `memory_${n}_caption`, `photo_caption_${n}`].forEach(capKey => {
        if (!currentCustomData._hiddenFields.includes(capKey)) {
          currentCustomData._hiddenFields.push(capKey);
        }
      });
    }
  } else {
    const numMatch = cleanKey.match(/^photo_(\d+)$/i);
    const pairedKeys = new Set([cleanKey]);
    if (numMatch) {
      const n = numMatch[1];
      [`photo_${n}_caption`, `caption_${n}`, `memory_${n}_caption`, `photo_caption_${n}`].forEach(k => pairedKeys.add(k));
    }
    currentCustomData._hiddenFields = currentCustomData._hiddenFields.filter(k => !pairedKeys.has(k));
  }
  currentCustomData.hiddenFields = [...currentCustomData._hiddenFields];

  if (activeTemplate) renderDynamicTemplateFields(activeTemplate);
  renderTemplatePhotoSlotsManager();
  triggerAutosave();
  syncDataToIframe();
  showToast(`${cleanKey.replace(/_/g, ' ').toUpperCase()} ${shouldHide ? 'hidden from your website 🙈' : 'restored on your website 👁️'}`);
};

function getTemplateDeclaredPhotoSlots() {
  const slotMap = new Map();
  const addSlot = (key, label, defaultSrc) => {
    const k = String(key || '').trim();
    if (!k) return;
    if (!slotMap.has(k)) {
      slotMap.set(k, {
        key: k,
        label: label || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        defaultSrc: defaultSrc || ''
      });
    }
  };

  const manifestFields = (activeTemplate && activeTemplate.manifest && Array.isArray(activeTemplate.manifest.fields))
    ? activeTemplate.manifest.fields
    : [];
  const tplFields = (activeTemplate && Array.isArray(activeTemplate.fields)) ? activeTemplate.fields : [];
  const detFields = (activeTemplate && Array.isArray(activeTemplate.detectedFields)) ? activeTemplate.detectedFields : [];

  [...manifestFields, ...tplFields, ...detFields].forEach(f => {
    if (!f) return;
    const fKey = String(f.id || f.key || '').trim();
    const fType = String(f.type || '').toLowerCase();
    if (fType === 'image' || /^photo_\d+$/i.test(fKey) || fKey === 'cover_photo' || fKey.includes('photo') || fKey.includes('image')) {
      if (fType !== 'text' && fType !== 'textarea') {
        addSlot(fKey, f.label, f.defaultValue || f.originalSrc || '');
      }
    }
  });

  try {
    const iframe = document.getElementById('live-custom-iframe');
    const doc = iframe && (iframe.contentDocument || iframe.contentWindow?.document);
    if (doc) {
      doc.querySelectorAll('img[data-wm-field], img[data-wm], [data-wm-type="image"], [data-wm-photo-slot]').forEach(el => {
        const k = el.getAttribute('data-wm-photo-slot') || el.getAttribute('data-wm-field') || el.getAttribute('data-wm');
        if (k) {
          addSlot(k, el.getAttribute('data-wm-label') || null, el.getAttribute('src') || '');
        }
      });
    }
  } catch (_) {}

  return Array.from(slotMap.values());
}

window.toggleExpandExtraPhotoSlots = function() {
  window._showAllPhotoSlots = !window._showAllPhotoSlots;
  window.renderTemplatePhotoSlotsManager();
};

window.renderTemplatePhotoSlotsManager = function() {
  const managerEl = document.getElementById('template-photo-slots-manager');
  if (!managerEl) return;

  const slots = getTemplateDeclaredPhotoSlots();
  if (slots.length === 0) {
    managerEl.innerHTML = '';
    return;
  }

  const uploadedPhotos = (currentCustomData.media && Array.isArray(currentCustomData.media.photos))
    ? currentCustomData.media.photos
    : (Array.isArray(currentCustomData.photos) ? currentCustomData.photos : []);
  const hiddenFieldsSet = new Set(Array.isArray(currentCustomData._hiddenFields) ? currentCustomData._hiddenFields : []);

  let unuploadedVisibleSlotsCount = 0;
  let hiddenSlotsCount = 0;

  // Stage 3 Level B Requirement: Show primary photo slot(s) first and keep additional slots accessible via "Add more photos" when collection > 2
  const primaryVisibleLimit = 2;
  const hasMoreSlots = slots.length > primaryVisibleLimit;
  const visibleSlotsList = (hasMoreSlots && !window._showAllPhotoSlots)
    ? slots.slice(0, primaryVisibleLimit)
    : slots;

  slots.forEach((slot, idx) => {
    const photoNumMatch = slot.key.match(/^photo_(\d+)$/i);
    const slotNum = photoNumMatch ? Number(photoNumMatch[1]) : (idx + 1);
    const uploadedForOrder = uploadedPhotos[slotNum - 1];
    const directVal = currentCustomData[slot.key];
    const hasCustomUpload = Boolean(
      (uploadedForOrder && (uploadedForOrder.src || uploadedForOrder.url || uploadedForOrder.displayUrl) && uploadedForOrder.id !== 'photo_default_1') ||
      (directVal && directVal !== slot.defaultSrc && directVal !== templateDefaultValues[slot.key])
    );
    const isHidden = hiddenFieldsSet.has(slot.key);
    if (isHidden) {
      hiddenSlotsCount++;
    } else if (!hasCustomUpload) {
      unuploadedVisibleSlotsCount++;
    }
  });

  const slotCardsHtml = visibleSlotsList.map((slot, idx) => {
    const photoNumMatch = slot.key.match(/^photo_(\d+)$/i);
    const slotNum = photoNumMatch ? Number(photoNumMatch[1]) : (idx + 1);
    const uploadedForOrder = uploadedPhotos[slotNum - 1];
    const directVal = currentCustomData[slot.key];
    const hasCustomUpload = Boolean(
      (uploadedForOrder && (uploadedForOrder.src || uploadedForOrder.url || uploadedForOrder.displayUrl) && uploadedForOrder.id !== 'photo_default_1') ||
      (directVal && directVal !== slot.defaultSrc && directVal !== templateDefaultValues[slot.key])
    );
    const previewSrc = (uploadedForOrder && (uploadedForOrder.src || uploadedForOrder.url || uploadedForOrder.displayUrl)) ||
      directVal ||
      slot.defaultSrc ||
      templateDefaultValues[slot.key] ||
      '/assets/file_ab2082.png';
    const isHidden = hiddenFieldsSet.has(slot.key);
    const isPrimary = idx === 0;

    return `
      <div class="p-3 rounded-2xl border transition flex items-center justify-between gap-2.5 ${
        isHidden
          ? 'bg-rose-500/10 border-rose-500/30 opacity-70'
          : (hasCustomUpload
              ? 'bg-emerald-500/10 border-emerald-500/35'
              : 'bg-white/80 dark:bg-purple-950/50 border-purple-200/70 dark:border-purple-800/60')
      }">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-12 h-12 rounded-xl overflow-hidden border border-purple-300/50 shrink-0 bg-purple-950/30 relative">
            <img src="${escapeHtml(previewSrc)}" alt="${escapeHtml(slot.label)}" class="w-full h-full object-cover ${isHidden ? 'grayscale opacity-40' : ''}" onerror="this.src='/assets/file_ab2082.png'"/>
            <span class="absolute bottom-0 right-0 px-1 bg-black/75 text-white font-mono text-[8px] font-bold">#${slotNum}</span>
          </div>
          <div class="min-w-0">
            <div class="text-xs font-extrabold text-purple-950 dark:text-white truncate flex items-center gap-1">
              <span>${escapeHtml(slot.label)}</span>
              ${isPrimary ? '<span class="px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-600 dark:text-pink-300 text-[9px] font-bold">Main</span>' : ''}
            </div>
            <div class="text-[10px] font-semibold ${
              isHidden ? 'text-rose-600 dark:text-rose-300' : (hasCustomUpload ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300')
            }">
              ${isHidden ? '🙈 Hidden on Website' : (hasCustomUpload ? '🟢 Custom Photo Configured' : '⚪ Template Default Photo')}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button type="button" onclick="triggerSlotSpecificPhotoUpload('${slot.key}')" class="min-h-[36px] px-3 py-1.5 rounded-xl bg-purple-100 dark:bg-purple-900/70 hover:bg-purple-200 text-purple-950 dark:text-purple-100 text-[11px] font-bold transition cursor-pointer" title="Upload photo for this slot">
            📁 Upload
          </button>
          <button type="button" onclick="toggleCustomerFieldVisibility('${slot.key}')" class="min-h-[36px] px-3 py-1.5 rounded-xl text-[11px] font-extrabold transition cursor-pointer ${
            isHidden
              ? 'bg-emerald-500 text-white shadow-xs'
              : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-500/30'
          }" title="${isHidden ? 'Show this photo slot on website' : 'Hide this photo slot from website'}">
            ${isHidden ? '👁️ Show' : '🙈 Hide'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  managerEl.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h4 class="text-xs font-extrabold text-purple-950 dark:text-white flex items-center gap-1.5">
          <span>🖼️ Template Photo Slots (${slots.length - hiddenSlotsCount} of ${slots.length} Active)</span>
        </h4>
        <p class="text-[11px] text-purple-700/80 dark:text-purple-300/80">
          Supports JPG, PNG, WebP (up to 10MB). Tap <strong>🙈 Hide</strong> on any unused slot so it won't appear on your site.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        ${unuploadedVisibleSlotsCount > 0 ? `
          <button type="button" onclick="autoHideUnusedPhotoSlots()" class="min-h-[36px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white text-[11px] font-extrabold shadow-sm hover:brightness-110 transition cursor-pointer">
            ✨ Hide ${unuploadedVisibleSlotsCount} Unused Default Slot${unuploadedVisibleSlotsCount === 1 ? '' : 's'}
          </button>
        ` : ''}
        ${hiddenSlotsCount > 0 ? `
          <button type="button" onclick="restoreAllHiddenPhotoSlots()" class="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-bold hover:bg-emerald-500/30 transition cursor-pointer">
            👁️ Show All (${slots.length})
          </button>
        ` : ''}
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      ${slotCardsHtml}
    </div>
    ${hasMoreSlots ? `
      <div class="pt-1 flex justify-center">
        <button type="button" id="btn-toggle-more-photo-slots" onclick="window.toggleExpandExtraPhotoSlots()" class="min-h-[38px] px-4 py-2 rounded-xl bg-purple-100/80 dark:bg-purple-900/50 hover:bg-purple-200 dark:hover:bg-purple-800/70 text-purple-900 dark:text-purple-100 text-xs font-extrabold border border-purple-300/60 dark:border-purple-700/60 transition cursor-pointer">
          ${window._showAllPhotoSlots ? '🔼 Show Fewer Photo Slots' : `➕ Add More Photos (${slots.length - primaryVisibleLimit} More Slot${slots.length - primaryVisibleLimit === 1 ? '' : 's'})`}
        </button>
      </div>
    ` : ''}
  `;
};

window.autoHideUnusedPhotoSlots = function() {
  const slots = getTemplateDeclaredPhotoSlots();
  const uploadedPhotos = (currentCustomData.media && Array.isArray(currentCustomData.media.photos))
    ? currentCustomData.media.photos
    : (Array.isArray(currentCustomData.photos) ? currentCustomData.photos : []);
  if (!Array.isArray(currentCustomData._hiddenFields)) currentCustomData._hiddenFields = [];

  let hiddenNow = 0;
  slots.forEach((slot, idx) => {
    const photoNumMatch = slot.key.match(/^photo_(\d+)$/i);
    const slotNum = photoNumMatch ? Number(photoNumMatch[1]) : (idx + 1);
    const uploadedForOrder = uploadedPhotos[slotNum - 1];
    const directVal = currentCustomData[slot.key];
    const hasCustomUpload = Boolean(
      (uploadedForOrder && (uploadedForOrder.src || uploadedForOrder.url || uploadedForOrder.displayUrl) && uploadedForOrder.id !== 'photo_default_1') ||
      (directVal && directVal !== slot.defaultSrc && directVal !== templateDefaultValues[slot.key])
    );
    if (!hasCustomUpload && !currentCustomData._hiddenFields.includes(slot.key)) {
      currentCustomData._hiddenFields.push(slot.key);
      if (photoNumMatch) {
        const n = photoNumMatch[1];
        [`photo_${n}_caption`, `caption_${n}`, `memory_${n}_caption`, `photo_caption_${n}`].forEach(capKey => {
          if (!currentCustomData._hiddenFields.includes(capKey)) currentCustomData._hiddenFields.push(capKey);
        });
      }
      hiddenNow++;
    }
  });
  currentCustomData.hiddenFields = [...currentCustomData._hiddenFields];
  if (activeTemplate) renderDynamicTemplateFields(activeTemplate);
  renderTemplatePhotoSlotsManager();
  triggerAutosave();
  syncDataToIframe();
  showToast(`🙈 Hid ${hiddenNow} unused photo slot${hiddenNow === 1 ? '' : 's'} from your website!`);
};

window.restoreAllHiddenPhotoSlots = function() {
  if (!Array.isArray(currentCustomData._hiddenFields)) return;
  const slots = new Set(getTemplateDeclaredPhotoSlots().map(s => s.key));
  currentCustomData._hiddenFields = currentCustomData._hiddenFields.filter(k => {
    if (slots.has(k) || /^photo_\d+/i.test(k) || /^caption_\d+/i.test(k) || /^memory_\d+_caption/i.test(k)) return false;
    return true;
  });
  currentCustomData.hiddenFields = [...currentCustomData._hiddenFields];
  if (activeTemplate) renderDynamicTemplateFields(activeTemplate);
  renderTemplatePhotoSlotsManager();
  triggerAutosave();
  syncDataToIframe();
  showToast('👁️ Restored all photo slots on your website!');
};

window.triggerSlotSpecificPhotoUpload = function(slotKey) {
  window._pendingSlotPhotoFieldKey = slotKey;
  const picker = document.getElementById('slot-specific-photo-picker');
  if (picker) picker.click();
};

window.handleSlotSpecificPhotoFile = async function(input) {
  if (!input.files || input.files.length === 0 || !window._pendingSlotPhotoFieldKey) return;
  const file = input.files[0];
  const slotKey = window._pendingSlotPhotoFieldKey;
  window._pendingSlotPhotoFieldKey = null;

  try {
    const optimized = await window.WishMediaSystem.ImageProcessor.processImageFile(file, 1600, 0.88);
    currentCustomData[slotKey] = optimized.src;
    if (window._userModifiedFields instanceof Set) window._userModifiedFields.add(slotKey);
    const photoNumMatch = slotKey.match(/^photo_(\d+)$/i);
    if (photoNumMatch && currentCustomData.media && Array.isArray(currentCustomData.media.photos)) {
      const slotIdx = Number(photoNumMatch[1]) - 1;
      if (slotIdx >= 0 && slotIdx < currentCustomData.media.photos.length) {
        currentCustomData.media.photos[slotIdx].src = optimized.src;
        currentCustomData.media.photos[slotIdx].url = optimized.src;
      } else {
        currentCustomData.media.photos.push({
          id: 'photo_' + Date.now().toString(36),
          name: file.name.replace(/\.[^/.]+$/, ''),
          src: optimized.src,
          url: optimized.src,
          isCover: currentCustomData.media.photos.length === 0,
          order: currentCustomData.media.photos.length
        });
      }
      window.WishMediaSystem.syncMediaToCustomData(currentCustomData.media, currentCustomData);
    }
    if (Array.isArray(currentCustomData._hiddenFields) && currentCustomData._hiddenFields.includes(slotKey)) {
      window.toggleCustomerFieldVisibility(slotKey, true);
    } else {
      renderPhotosUI();
      if (activeTemplate) renderDynamicTemplateFields(activeTemplate);
      renderTemplatePhotoSlotsManager();
      triggerAutosave();
      syncDataToIframe();
      showToast(`📸 Uploaded photo to ${slotKey.replace(/_/g, ' ').toUpperCase()}!`);
    }
  } catch (err) {
    showPhotoError(err.message || 'Could not process image.');
  }
  input.value = '';
};

// Accessible Keyboard Navigation for Stepper, Level Switcher & Subtabs
function initAccessibleTabKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const target = e.target;
    if (!target || target.getAttribute('role') !== 'tab') return;
    const tablist = target.closest('[role="tablist"]');
    if (!tablist) return;
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]:not(.hidden):not([disabled])'));
    if (tabs.length <= 1) return;
    const idx = tabs.indexOf(target);
    if (idx === -1) return;

    e.preventDefault();
    let nextIdx = idx;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = tabs.length - 1;

    const nextTab = tabs[nextIdx];
    if (nextTab) {
      nextTab.focus();
      nextTab.click();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initAccessibleTabKeyboardNavigation();
  if (typeof window.switchStep1SubTab === 'function') window.switchStep1SubTab(window._activeStep1SubTab || 'basic');
  if (typeof window.switchStep2SubTab === 'function') window.switchStep2SubTab(window._activeStep2SubTab || 'colors');
  if (typeof window.renderTemplatePhotoSlotsManager === 'function') window.renderTemplatePhotoSlotsManager();
  if (typeof window.updateCustomizationProgressUI === 'function') window.updateCustomizationProgressUI();
});


window.showFestivalCampaignExpiredNotice = function(message, details = {}) {
  let banner = document.getElementById('wm-festival-campaign-expired-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'wm-festival-campaign-expired-banner';
    banner.setAttribute('role', 'alert');
    banner.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:99999;max-width:560px;width:calc(100% - 32px);background:#2e1065;border:2px solid #f43f5e;border-radius:16px;padding:16px 20px;color:#fff;box-shadow:0 20px 50px rgba(0,0,0,0.65);font-family:Plus Jakarta Sans,sans-serif;';
    document.body.appendChild(banner);
  }
  const safeMsg = String(message || 'This festival campaign has ended and is no longer accepting new wish creations.').replace(/[<>&"]/g, '');
  banner.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div>
        <div style="font-weight:800;font-size:0.95rem;color:#fda4af;margin-bottom:4px;">Festival Campaign Unavailable for New Wishes</div>
        <div style="font-size:0.84rem;color:#e2e8f0;line-height:1.45;">${safeMsg}</div>
      </div>
      <button type="button" onclick="this.closest('#wm-festival-campaign-expired-banner').remove()" style="background:rgba(255,255,255,0.12);border:none;color:#fff;border-radius:8px;padding:4px 10px;cursor:pointer;font-weight:700;font-size:0.75rem;">Dismiss</button>
    </div>
  `;
};
