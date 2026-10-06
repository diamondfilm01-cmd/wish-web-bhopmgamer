// WishMagic Universal Advanced Customizer & Real-Time Live Sandbox Engine
// Part 3: Advanced Wish Customizer

let activeTemplate = null;
let currentStep = 1;
const TOTAL_STEPS = 4;

let currentEditingWishId = null;
let currentEditingWishSlug = null;
let currentSlugSuggestions = [];
let isShowingAllSlugSuggestions = false;
let slugCheckDebounceTimer = null;
let lastCheckedSlug = '';
let lastSlugCheckResult = null;

// Centralized Customizer State Model
let currentCustomData = {
  recipient_name: '',
  sender_name: '',
  sender_contact: '',
  occasion: 'birthday',
  relationship: '',
  customSlug: '',
  slug: '',
  event_date: new Date().toISOString().split('T')[0],
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

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
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
      const rawDrafts = localStorage.getItem('wishmagic_drafts');
      const drafts = window.WishSecurity ? window.WishSecurity.safeJSONParse(rawDrafts, []) : JSON.parse(rawDrafts || '[]');
      const targetDraft = Array.isArray(drafts) ? drafts.find(d => d.id === draftId) : null;
      if (targetDraft) {
        templateId = targetDraft.templateId || templateId;
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
});

// Load template metadata & check for saved local draft
async function loadTemplateData(templateId) {
  try {
    const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}`);
    const data = await res.json();
    if (data.success && data.template) {
      activeTemplate = data.template;
    } else {
      // Fallback: try fetching all templates
      const allRes = await fetch('/api/templates');
      const allData = await allRes.json();
      if (allData.success && allData.templates && allData.templates.length > 0) {
        activeTemplate = allData.templates[0];
      }
    }

    if (!activeTemplate) return;

    // Apply template defaults
    applyTemplateDefaults(activeTemplate);

    // Check for existing local draft
    const draftKey = `wishmagic_draft_${activeTemplate.id}`;
    const rawSavedDraft = localStorage.getItem(draftKey);
    if (rawSavedDraft) {
      const parsed = window.WishSecurity ? window.WishSecurity.safeJSONParse(rawSavedDraft, null) : JSON.parse(rawSavedDraft);
      if (parsed && typeof parsed === 'object') {
        currentCustomData = { ...currentCustomData, ...parsed };
        showToast('Restored your saved local draft ✨');
      }
    }

    renderCustomizerHeader();
    populateFormValuesFromState();
    validateDraftEntitlements(currentCustomData);
    updateDevEntitlementUI();
    loadTemplateInSandbox();

  } catch (err) {
    console.error('Error loading template for customizer:', err);
  }
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

  // Default detected fields
  if (tpl.detectedFields && Array.isArray(tpl.detectedFields)) {
    tpl.detectedFields.forEach(f => {
      if (f.defaultValue && !currentCustomData[f.key]) {
        currentCustomData[f.key] = f.defaultValue;
      }
    });
  }

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
  if (titleEl) titleEl.textContent = activeTemplate.name;

  const badgeEl = document.getElementById('customizer-tier-badge');
  if (badgeEl) {
    badgeEl.textContent = isVip ? `VIP • ₹${activeTemplate.price || 49}` : 'FREE';
    badgeEl.className = isVip
      ? 'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400 text-purple-950 shadow-sm'
      : 'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-white shadow-sm';
  }

  const categoryEl = document.getElementById('customizer-category-name');
  if (categoryEl) categoryEl.textContent = `✦ ${activeTemplate.category || 'Celebration'}`;

  // Update button labels
  const btnFinal = document.getElementById('btn-header-continue');
  if (btnFinal) {
    btnFinal.innerHTML = isVip
      ? `<span>Proceed to Gift • ₹${activeTemplate.price || 49}</span><span class="material-symbols-outlined text-[16px]">arrow_forward</span>`
      : `<span>Finalize Free Wish</span><span class="material-symbols-outlined text-[16px]">arrow_forward</span>`;
  }

  // Update back to preview link
  const backLink = document.getElementById('btn-back-to-preview');
  if (backLink) {
    backLink.href = `/template/${activeTemplate.id}`;
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

  // Style inputs
  selectThemePreset(currentCustomData.theme || 'magical', false);
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
      if (i === currentStep) {
        stepTab.className = 'step-tab-btn flex items-center gap-1.5 py-1.5 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm bg-purple-700 text-white shadow-md transition-all';
      } else if (i < currentStep) {
        stepTab.className = 'step-tab-btn flex items-center gap-1.5 py-1.5 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm bg-purple-100/90 dark:bg-purple-900/60 text-purple-900 dark:text-purple-200 transition-all cursor-pointer';
      } else {
        stepTab.className = 'step-tab-btn flex items-center gap-1.5 py-1.5 px-3 sm:px-4 rounded-xl font-semibold text-xs sm:text-sm text-purple-800/60 dark:text-purple-300/60 hover:text-purple-950 dark:hover:text-white transition-all cursor-pointer';
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

  // 2. Show/Hide Step Content Panes
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const pane = document.getElementById(`step-content-${i}`);
    if (pane) {
      if (i === currentStep) {
        pane.classList.remove('hidden');
      } else {
        pane.classList.add('hidden');
      }
    }
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
  }
}

// Validation for Step 1
function validateStep1() {
  const errorBox = document.getElementById('step-1-validation-error');
  const recipientInput = document.getElementById('input-recipient');
  const senderInput = document.getElementById('input-sender');
  const dateInput = document.getElementById('input-date');

  let errors = [];

  if (!currentCustomData.recipient_name || currentCustomData.recipient_name.trim().length === 0) {
    errors.push("Recipient name is required");
    if (recipientInput) recipientInput.classList.add('border-red-500', 'ring-2', 'ring-red-400/40');
  } else {
    if (recipientInput) recipientInput.classList.remove('border-red-500', 'ring-2', 'ring-red-400/40');
  }

  if (!currentCustomData.sender_name || currentCustomData.sender_name.trim().length === 0) {
    errors.push("Sender name is required");
    if (senderInput) senderInput.classList.add('border-red-500', 'ring-2', 'ring-red-400/40');
  } else {
    if (senderInput) senderInput.classList.remove('border-red-500', 'ring-2', 'ring-red-400/40');
  }

  if (!currentCustomData.event_date || currentCustomData.event_date.trim().length === 0) {
    errors.push("Celebration date is required");
    if (dateInput) dateInput.classList.add('border-red-500', 'ring-2', 'ring-red-400/40');
  } else {
    if (dateInput) dateInput.classList.remove('border-red-500', 'ring-2', 'ring-red-400/40');
  }

  if (errors.length > 0) {
    if (errorBox) {
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

// Form Inputs Handlers
function initFormInputs() {
  window.handleRecipientInput = function(val) {
    currentCustomData.recipient_name = val;
    triggerAutosave();
    syncDataToIframe();
    if (typeof window.initSmartWishLinkUI === 'function' && currentStep === 4) {
      window.initSmartWishLinkUI();
    }
  };

  window.handleSenderInput = function(val) {
    currentCustomData.sender_name = val;
    triggerAutosave();
    syncDataToIframe();
    if (typeof window.initSmartWishLinkUI === 'function' && currentStep === 4) {
      window.initSmartWishLinkUI();
    }
  };

  window.handleDateInput = function(val) {
    currentCustomData.event_date = val;
    triggerAutosave();
    syncDataToIframe();
  };

  window.handleContactInput = function(val) {
    currentCustomData.sender_contact = val;
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
    triggerAutosave();
    if (typeof window.initSmartWishLinkUI === 'function') {
      window.initSmartWishLinkUI();
    }
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

  currentCustomData.media.music = {
    enabled: true,
    type: 'curated',
    name: track.title,
    trackId: track.id,
    src: '',
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
  if (engine.isPlayingSynth && engine.activeTrackId === trackId) {
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
    alert('Audio file is too large. Please upload an audio file under 15MB.');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    currentCustomData.media.music = {
      enabled: true,
      type: 'upload',
      name: file.name.replace(/\.[^/.]+$/, ''),
      trackId: 'custom_upload',
      src: e.target.result,
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
    price: 49,
    currency: 'INR',
    displayName: 'Personalized Link',
    description: 'Create a memorable link for your wish.'
  },
  random: {
    enabled: true,
    prefix: 'wish-',
    length: 6,
    allowedCharacters: 'abcdefghijklmnopqrstuvwxyz0123456789'
  }
};

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
    const res = await fetch('/api/settings/wish-links', { credentials: 'include' });
    const data = await res.json();
    if (data && data.success && data.settings) {
      currentWishLinkSettings = data.settings;
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

window.renderPersonalizedPaymentCallout = function(overrideState = null) {
  const container = document.getElementById('personalized-payment-callout');
  if (!container) return;

  const sym = getCurrencySymbol(currentWishLinkSettings.personalized.currency);
  const price = currentWishLinkSettings.personalized.price;
  const isVipUser = (window.WishEntitlement && window.WishEntitlement.isPremium()) || (window.WishAuth && window.WishAuth.getCurrentUser() && window.WishAuth.getCurrentUser().isPremium);

  if (overrideState && overrideState.notConfigured) {
    // REQUIREMENT 16: Payment not configured state
    container.className = 'p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-2';
    container.innerHTML = `
      <div class="flex items-start gap-2.5">
        <span class="material-symbols-outlined text-amber-500 text-lg shrink-0">info</span>
        <div>
          <span class="font-bold block">Payment Gateway Currently Unavailable (NOT_CONFIGURED)</span>
          <p class="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5 leading-relaxed">
            The platform payment processor is not currently connected in environment variables. Personalized link purchases (${sym}${price}) cannot be completed at this time.
          </p>
        </div>
      </div>
      <div class="pt-1 flex items-center justify-between">
        <span class="text-[10px] uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400">Alternative Available</span>
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
          <span class="font-bold block">VIP Pass Entitled</span>
          <span class="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">Personalized links included at no extra charge.</span>
        </div>
      </div>
      <button type="button" onclick="publishWishAndGetLink()" class="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-xs shadow-sm hover:brightness-110 transition cursor-pointer">
        Publish Personalized Link ✨
      </button>
    `;
    return;
  }

  container.className = 'p-4 rounded-2xl bg-gradient-to-br from-pink-500/10 via-purple-500/5 to-transparent border border-pink-500/30 text-purple-950 dark:text-purple-100 text-xs space-y-3';
  container.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-base">✨</span>
        <span class="font-bold text-sm text-purple-950 dark:text-white">Get Personalized Link Access</span>
      </div>
      <span class="font-black text-base text-pink-600 dark:text-pink-400">${sym}${price}</span>
    </div>
    <p class="text-[11px] text-purple-700/80 dark:text-purple-300/80 leading-relaxed">
      Unlock a unique, personalized address for your wish website. Securely processed via our authorized payment provider.
    </p>
    <button type="button" onclick="handlePersonalizedLinkCheckout()" class="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-xs shadow-md hover:brightness-110 transition flex items-center justify-center gap-2 cursor-pointer">
      <span class="material-symbols-outlined text-sm">lock</span>
      <span>Get Personalized Link (${sym}${price})</span>
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
    alert('Error publishing random link wish: ' + err.message);
  } finally {
    isPublishingInProgress = false;
  }
};

window.handlePersonalizedLinkCheckout = async function() {
  const chosenSlug = (currentCustomData.customSlug || currentCustomData.slug || '').toLowerCase().trim();
  if (!chosenSlug) {
    showToast('⚠️ Please choose or enter a personalized link first');
    const input = document.getElementById('wish-slug-input');
    if (input) input.focus();
    return;
  }

  const currentUser = window.WishAuth && window.WishAuth.getCurrentUser();
  if (!currentUser) {
    if (typeof window.openAuthModal === 'function') {
      window.openAuthModal('signin', 'Please sign in or create an account to get a personalized link.');
    } else {
      alert('Please sign in first.');
    }
    return;
  }

  if (lastSlugCheckResult && lastSlugCheckResult.available === false && !lastSlugCheckResult.isCurrent) {
    showToast('⚠️ Please choose an available link first');
    return;
  }

  try {
    const res = await fetch('/api/entitlements/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        planId: 'personalized_link',
        options: {
          planId: 'personalized_link',
          slug: chosenSlug
        }
      })
    });
    const data = await res.json();

    if (data.status === 'provider_not_configured' || data.configured === false) {
      renderPersonalizedPaymentCallout({
        notConfigured: true,
        message: data.message || 'Payment currently unavailable / NOT_CONFIGURED. Gateway is not configured in environment variables.',
        amount: data.amount || currentWishLinkSettings.personalized.price,
        currency: data.currency || currentWishLinkSettings.personalized.currency
      });
      showToast('⚠️ Payment currently unavailable. You can publish using Free Random Link.');
      return;
    }

    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
    } else if (data.success) {
      currentCustomData.linkType = 'personalized';
      currentCustomData.link_type = 'personalized';
      await window.publishWishAndGetLink();
    }
  } catch (err) {
    showToast('⚠️ Could not initiate checkout: ' + err.message);
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

  sec.enabled = enabled;

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

  // Normalize sections from customData
  let sections = currentCustomData.sections || [];
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
function loadTemplateInSandbox() {
  if (!activeTemplate) return;

  const container = document.getElementById('sandbox-iframe-container');
  if (!container) return;

  const templateEntryUrl = `/templates-store/${activeTemplate.folder || activeTemplate.id}/${activeTemplate.entryFile || 'index.html'}`;

  container.innerHTML = `
    <iframe id="live-custom-iframe" src="${templateEntryUrl}" class="w-full h-full border-0 rounded-2xl flex-grow bg-white" title="Live Template Sandbox" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
  `;

  const iframe = document.getElementById('live-custom-iframe');
  iframe.onload = () => {
    syncDataToIframe();
  };
}

function syncDataToIframe() {
  const iframe = document.getElementById('live-custom-iframe');
  if (!iframe) return;

  // 1. PostMessage Event Dispatch
  if (iframe.contentWindow) {
    iframe.contentWindow.postMessage({
      type: 'WISHMAGIC_LIVE_UPDATE',
      payload: currentCustomData
    }, '*');
    iframe.contentWindow.postMessage({
      type: 'WISHMAGIC_INIT',
      payload: currentCustomData
    }, '*');
  }

  // 2. Direct DOM Hydration & CSS Variable Injection
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc) return;

    // Recipient Name
    doc.querySelectorAll('[data-wm="recipient_name"]').forEach(el => {
      el.textContent = currentCustomData.recipient_name || 'Someone Special';
    });

    // Sender Name
    doc.querySelectorAll('[data-wm="sender_name"]').forEach(el => {
      el.textContent = currentCustomData.sender_name ? `— ${currentCustomData.sender_name}` : '— Someone Special';
    });

    // Event Date
    doc.querySelectorAll('[data-wm="event_date"]').forEach(el => {
      el.textContent = currentCustomData.event_date || 'Today';
    });

    // Custom Message
    doc.querySelectorAll('[data-wm="custom_message"]').forEach(el => {
      el.textContent = currentCustomData.custom_message || 'May your day be filled with warm magic, sparkling smiles, and infinite moments of joy!';
    });

    // Cover Photo & Photos
    const activeCover = currentCustomData.cover_photo || (currentCustomData.photos.length > 0 ? currentCustomData.photos[0].url : '');
    if (activeCover) {
      doc.querySelectorAll('[data-wm="photo_1"]').forEach(el => {
        el.src = activeCover;
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
window.setDeviceViewport = function(mode) {
  const frame = document.getElementById('sandbox-device-frame');
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
    frame.style.height = '680px';
    frame.style.borderRadius = '20px';
    if (btnD) {
      btnD.classList.add('bg-purple-700', 'text-white', 'font-bold');
      btnD.classList.remove('text-purple-700', 'dark:text-purple-300');
    }
    if (notch) notch.classList.add('hidden');
    if (browserBar) browserBar.classList.remove('hidden');
  } else if (mode === 'tablet') {
    frame.style.maxWidth = '580px';
    frame.style.height = '680px';
    frame.style.borderRadius = '28px';
    if (btnT) {
      btnT.classList.add('bg-purple-700', 'text-white', 'font-bold');
      btnT.classList.remove('text-purple-700', 'dark:text-purple-300');
    }
    if (notch) notch.classList.add('hidden');
    if (browserBar) browserBar.classList.remove('hidden');
  } else {
    // Mobile
    frame.style.maxWidth = '375px';
    frame.style.height = '680px';
    frame.style.borderRadius = '40px';
    if (btnM) {
      btnM.classList.add('bg-purple-700', 'text-white', 'font-bold');
      btnM.classList.remove('text-purple-700', 'dark:text-purple-300');
    }
    if (notch) notch.classList.remove('hidden');
    if (browserBar) browserBar.classList.add('hidden');
  }
};

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
// AUTOSAVE & DRAFT SYSTEM
// -----------------------------------------------------------------------------
function triggerAutosave() {
  const indicator = document.getElementById('autosave-indicator');
  if (indicator) {
    indicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span><span>Saving changes...</span>`;
  }

  if (autosaveTimeout) clearTimeout(autosaveTimeout);
  autosaveTimeout = setTimeout(() => {
    saveDraftLocally();
  }, 500);
}

window.saveDraftLocally = function() {
  if (!activeTemplate) return;
  const draftKey = `wishmagic_draft_${activeTemplate.id}`;
  try {
    localStorage.setItem(draftKey, JSON.stringify(currentCustomData));

    // Also update unified drafts collection for My Wishes Creator Dashboard
    let drafts = [];
    try {
      drafts = JSON.parse(localStorage.getItem('wishmagic_drafts') || '[]');
      if (!Array.isArray(drafts)) drafts = [];
    } catch (e) {
      drafts = [];
    }

    const draftId = 'draft_' + activeTemplate.id;
    const currentUserId = (window.WishAuth && window.WishAuth.getCurrentUser()?.id) || 'guest';
    const existingIdx = drafts.findIndex(d => (d.id === draftId || d.templateId === activeTemplate.id) && (d.userId === currentUserId || !d.userId));
    const draftRecord = {
      id: draftId,
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

    const indicator = document.getElementById('autosave-indicator');
    if (indicator) {
      indicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span><span>Draft saved locally</span>`;
    }
  } catch (e) {
    console.warn('Error saving local draft:', e);
  }
};

window.resetCustomizerChanges = function() {
  if (!confirm('Are you sure you want to reset all changes to template defaults?')) return;

  if (activeTemplate) {
    const draftKey = `wishmagic_draft_${activeTemplate.id}`;
    localStorage.removeItem(draftKey);

    currentCustomData.recipient_name = '';
    currentCustomData.sender_name = '';
    currentCustomData.sender_contact = '';
    currentCustomData.event_date = new Date().toISOString().split('T')[0];
    currentCustomData.custom_message = '';
    currentCustomData.photos = [];
    currentCustomData.cover_photo = '';
    currentCustomData.photo_1 = '';

    applyTemplateDefaults(activeTemplate);
    populateFormValuesFromState();
    renderPhotosUI();
    renderSectionsUI();
    syncDataToIframe();
    showToast('Reset to template defaults ↺');
  }
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

  // Ensure user is authenticated before publishing
  if (!window.WishAuth || !window.WishAuth.isAuthenticated()) {
    if (typeof window.openAuthModal === 'function') {
      window.openAuthModal('signin', '✨ Please sign in or create an account to publish and save your celebration website!');
    } else {
      showToast('⚠️ Please sign in to publish your celebration website.');
    }
    return;
  }

  isPublishingInProgress = true;
  try {
    const isVipEntitled = window.WishEntitlement ? window.WishEntitlement.isPremium() : false;
    const isVipTemplate = activeTemplate.tier === 'vip' || activeTemplate.isPremium === true || (activeTemplate.price && Number(activeTemplate.price) > 0);
    const isVip = isVipEntitled || isVipTemplate || Boolean(currentCustomData.lifetimePreservation) || Boolean(currentCustomData.watermarkRemoved);

    // Direct generation with verified entitlement
    await executeWishCreation({
      tier: isVip ? 'vip' : 'free',
      price: isVip ? (activeTemplate.price || 49) : 0,
      buyerDetails: {
        name: currentCustomData.sender_name || 'Creator',
        phone: currentCustomData.sender_contact || ''
      },
      payment: isVip ? {
        status: 'Completed',
        method: 'VIP Pass Entitlement',
        transactionId: 'ENT_' + Date.now().toString(36).toUpperCase()
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

    const payload = {
      templateId: activeTemplate.id,
      linkType,
      userId: currentUserId,
      customData: {
        ...currentCustomData,
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
      if (data && data.success) {
        data.wishId = currentEditingWishId;
      }
    } else {
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
      showToast('⚠️ ' + (data && data.message ? data.message : 'Could not generate wish link. Please try again.'));
      return null;
    }

    const createdWishId = data.wishId || (data.wish && data.wish.id) || currentEditingWishId;
    if (data.success && createdWishId) {
      const wishSlug = data.slug || (data.wish && data.wish.slug) || chosenSlug || createdWishId;
      const fullLink = `${window.location.origin}/w/${wishSlug}`;

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
      alert('Error generating wish: ' + (data.message || 'Unknown error'));
    }
  } catch (err) {
    alert('Network error generating wish link: ' + err.message);
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

function copyGeneratedLink() {
  const input = document.getElementById('generated-link-input');
  const btnText = document.getElementById('copy-btn-text');
  if (input) {
    input.select();
    navigator.clipboard.writeText(input.value);
    if (btnText) {
      btnText.textContent = 'Copied! ✨';
      setTimeout(() => btnText.textContent = 'Copy Link', 2500);
    }
  }
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
