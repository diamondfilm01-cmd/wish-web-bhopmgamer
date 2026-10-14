// WishMagic Creation Wizard Engine
// Stage 6: Complete Wish Creation Wizard, Relationship-Aware Template Discovery,
// Real-Time Live Preview, Autosave Recovery, and End-to-End Lifecycle Persistence.

(function(window) {
  'use strict';

  // ---------------------------------------------------------------------------
  // TAXONOMY & RELATIONSHIP CATEGORY REUSE CONFIGURATION
  // ---------------------------------------------------------------------------

  const OCCASIONS = [
    { id: 'birthday', label: 'Birthday', icon: 'cake', desc: 'Confetti, age countdowns & celebratory vibes' },
    { id: 'anniversary', label: 'Anniversary', icon: 'favorite', desc: 'Milestones, romantic journeys & love letters' },
    { id: 'love', label: 'Romantic Love', icon: 'heart_plus', desc: 'Proposals, dates, crushes & sweet keepsakes' },
    { id: 'congratulations', label: 'Congratulations', icon: 'trophy', desc: 'Promotions, graduations & personal triumphs' },
    { id: 'friendship', label: 'Friendship', icon: 'sentiment_very_satisfied', desc: 'Besties, inside jokes & unforgettable memories' },
    { id: 'festival', label: 'Festival & Holiday', icon: 'sparkles', desc: 'Diwali, New Year, Christmas & seasonal cheer' },
    { id: 'milestone', label: 'Milestone Event', icon: 'stars', desc: 'Retirements, new homes, babies & big moments' },
    { id: 'thank_you', label: 'Thank You', icon: 'volunteer_activism', desc: 'Warm gratitude, appreciation & tribute notes' }
  ];

  const RELATIONSHIPS = [
    // Romantic Category
    { id: 'girlfriend', label: 'Girlfriend', icon: '💖', category: 'romantic', displayName: 'Dearest Girlfriend' },
    { id: 'boyfriend', label: 'Boyfriend', icon: '💙', category: 'romantic', displayName: 'Handsome Boyfriend' },
    { id: 'crush', label: 'Secret Crush', icon: '✨', category: 'romantic', displayName: 'Secret Crush' },
    { id: 'wife', label: 'Beloved Wife', icon: '💍', category: 'romantic', displayName: 'Beloved Wife' },
    { id: 'husband', label: 'Loving Husband', icon: '👑', category: 'romantic', displayName: 'Loving Husband' },
    { id: 'partner', label: 'Life Partner', icon: '🌹', category: 'romantic', displayName: 'Cherished Partner' },

    // Friends Category
    { id: 'best_friend', label: 'Best Friend Forever', icon: '🎈', category: 'friends', displayName: 'BFF & Partner in Crime' },
    { id: 'friend', label: 'Close Friend', icon: '🎉', category: 'friends', displayName: 'Awesome Friend' },
    { id: 'colleague', label: 'Work Colleague', icon: '💼', category: 'friends', displayName: 'Valued Colleague' },

    // Family Category
    { id: 'mother', label: 'Mummy / Mother', icon: '🌸', category: 'family', displayName: 'Dearest Mom / Mother' },
    { id: 'father', label: 'Papa / Father', icon: '🌟', category: 'family', displayName: 'Respected Dad / Father' },
    { id: 'sister', label: 'Sweet Sister', icon: '🎀', category: 'family', displayName: 'Wonderful Sister' },
    { id: 'brother', label: 'Cherished Brother', icon: '🚀', category: 'family', displayName: 'Amazing Brother' },
    { id: 'parents', label: 'Parents Tribute', icon: '🌺', category: 'family', displayName: 'Mom & Dad Together' },

    // General Category
    { id: 'mentor', label: 'Mentor / Guide', icon: '🎓', category: 'general', displayName: 'Inspirational Mentor' },
    { id: 'special_someone', label: 'Someone Special', icon: '💫', category: 'general', displayName: 'Someone Truly Special' }
  ];

  // Fallback Templates Catalog
  const DEFAULT_CATALOG = [
    {
      id: 'tpl_glitter_birthday',
      name: 'Glitter Birthday Blast',
      category: 'Birthday',
      style: '3D Interactive',
      tier: 'free',
      isPremium: false,
      price: 0,
      thumbnail: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80',
      description: 'Vibrant celebratory birthday card with confetti burst, countdown, and music sync.',
      features: ['music', 'countdown', 'gallery'],
      relationships: ['Birthday', 'Best Friend', 'Friend', 'Sister', 'Brother', 'Girlfriend', 'Boyfriend'],
      folder: 'tpl_glitter_birthday',
      entryFile: 'index.html'
    },
    {
      id: 'tpl_golden_anniversary',
      name: 'Golden Elegance Anniversary',
      category: 'Anniversary',
      style: 'Luxury Foil',
      tier: 'vip',
      isPremium: true,
      price: 49,
      thumbnail: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&auto=format&fit=crop&q=80',
      description: 'Luxurious gold foil anniversary experience with interactive love timeline and photo gallery.',
      features: ['music', 'gallery', 'secretMessage'],
      relationships: ['Anniversary', 'Wife', 'Husband', 'Parents', 'Partner', 'Girlfriend'],
      folder: 'tpl_golden_anniversary',
      entryFile: 'index.html'
    },
    {
      id: 'tpl_romantic_scrapbook',
      name: 'Romantic Starlight Serenade',
      category: 'Romantic Love',
      style: 'Romantic Dream',
      tier: 'vip',
      isPremium: true,
      price: 49,
      thumbnail: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
      description: 'Dreamy starlit romantic message with floating glowing hearts and voice note keepsake.',
      features: ['music', 'gallery', 'secretMessage'],
      relationships: ['Romantic Love', 'Girlfriend', 'Boyfriend', 'Crush', 'Wife', 'Husband', 'Partner'],
      folder: 'tpl_romantic_scrapbook',
      entryFile: 'index.html'
    },
    {
      id: 'tpl_friendship_chronicles',
      name: 'Friendship Chronicles Neon Beats',
      category: 'Friendship',
      style: 'Neon Vibrant',
      tier: 'free',
      isPremium: false,
      price: 0,
      thumbnail: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&auto=format&fit=crop&q=80',
      description: 'High energy neon synthwave party wish with dynamic beats and glowing typography.',
      features: ['music', 'countdown', 'gallery'],
      relationships: ['Friendship', 'Best Friend', 'Friend', 'Brother', 'Colleague'],
      folder: 'tpl_friendship_chronicles',
      entryFile: 'index.html'
    },
    {
      id: 'tpl_parents_tribute',
      name: 'Parents Golden Tribute & Memories',
      category: 'Tribute',
      style: 'Minimalist Elegance',
      tier: 'free',
      isPremium: false,
      price: 0,
      thumbnail: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=600&auto=format&fit=crop&q=80',
      description: 'Emotional, heartfelt tribute for parents and elders with photo gallery and nostalgic audio.',
      features: ['music', 'gallery', 'secretMessage'],
      relationships: ['Parents', 'Mother', 'Father', 'Anniversary'],
      folder: 'tpl_parents_tribute',
      entryFile: 'index.html'
    },
    {
      id: 'tpl_midnight_countdown',
      name: 'Midnight Sparkler Celebration',
      category: 'Milestone',
      style: '3D Interactive',
      tier: 'vip',
      isPremium: true,
      price: 49,
      thumbnail: 'https://images.unsplash.com/photo-1498931299472-f7a63a5a1cfa?w=600&auto=format&fit=crop&q=80',
      description: 'Epic midnight unlock countdown with fireworks, personal letter reveal, and party effects.',
      features: ['countdown', 'music', 'secretMessage'],
      relationships: ['Birthday', 'New Year', 'Milestone', 'Best Friend', 'Partner'],
      folder: 'tpl_midnight_countdown',
      entryFile: 'index.html'
    }
  ];

  // ---------------------------------------------------------------------------
  // WIZARD STATE STORE
  // ---------------------------------------------------------------------------

  const state = {
    currentStep: 1, // 1 to 4
    selectedOccasion: 'birthday',
    selectedRelationship: 'best_friend',
    activeRelFilterCategory: 'all',
    selectedTemplateId: 'tpl_glitter_birthday',
    styleFilter: 'all',
    featureFilter: 'all',

    // Form Details
    recipientName: '',
    senderName: '',
    eventDate: new Date().toISOString().split('T')[0],
    wishMessage: '',
    customSlug: '',
    isSlugAvailable: true,

    // Persistence & Lifecycle
    currentDraftId: null,
    lockVersion: 1,
    isPublished: false,
    publishedSlug: '',
    activeSnapshotId: null,

    // Preview
    previewDevice: 'mobile', // 'mobile' | 'tablet' | 'desktop'
    templatesCatalog: [...DEFAULT_CATALOG],
    isCheckingSlug: false,
    isSaving: false
  };

  let slugDebounceTimer = null;
  let autosaveDebounceTimer = null;

  // ---------------------------------------------------------------------------
  // INITIALIZATION & URL HYDRATION
  // ---------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', async () => {
    initTaxonomyUI();
    await fetchTemplatesCatalog();
    hydrateStateFromUrlAndSession();
    renderAllWizardSteps();
    setupInputListeners();
  });

  // Hydrate state from query parameters or saved session
  function hydrateStateFromUrlAndSession() {
    const urlParams = new URLSearchParams(window.location.search);

    // 1. Check URL parameters
    const paramOccasion = urlParams.get('occasion');
    const paramRelationship = urlParams.get('relationship');
    const paramTemplate = urlParams.get('template') || urlParams.get('id');
    const paramDraft = urlParams.get('draft');
    const paramEdit = urlParams.get('edit');

    if (paramOccasion && OCCASIONS.some(o => o.id === paramOccasion.toLowerCase())) {
      state.selectedOccasion = paramOccasion.toLowerCase();
    }
    if (paramRelationship && RELATIONSHIPS.some(r => r.id === paramRelationship.toLowerCase())) {
      state.selectedRelationship = paramRelationship.toLowerCase();
    }
    if (paramTemplate) {
      state.selectedTemplateId = paramTemplate;
    }

    // 2. Draft recovery
    const activeDraftId = paramDraft || paramEdit;
    if (activeDraftId) {
      loadServerDraft(activeDraftId);
      return;
    }

    // 3. SessionStorage/LocalStorage recovery check
    try {
      const savedRaw = sessionStorage.getItem('wishmagic_wizard_session') || localStorage.getItem('wishmagic_wizard_draft');
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (saved && (saved.recipientName || saved.currentDraftId)) {
          showResumeBanner(saved);
        }
      }
    } catch (e) {}

    // Generate initial suggested message for the starting selection
    if (!state.wishMessage) {
      state.wishMessage = generateTailoredMessage(state.selectedOccasion, state.selectedRelationship, state.recipientName);
    }
  }

  function showResumeBanner(saved) {
    const banner = document.getElementById('wizard-resume-banner');
    if (banner) banner.classList.remove('hidden');

    // Pre-populate state
    Object.assign(state, {
      selectedOccasion: saved.selectedOccasion || state.selectedOccasion,
      selectedRelationship: saved.selectedRelationship || state.selectedRelationship,
      selectedTemplateId: saved.selectedTemplateId || state.selectedTemplateId,
      recipientName: saved.recipientName || state.recipientName,
      senderName: saved.senderName || state.senderName,
      eventDate: saved.eventDate || state.eventDate,
      wishMessage: saved.wishMessage || state.wishMessage,
      customSlug: saved.customSlug || state.customSlug,
      currentDraftId: saved.currentDraftId || state.currentDraftId
    });
  }

  // Load existing draft from server API
  async function loadServerDraft(draftId) {
    try {
      const res = await fetch(`/api/wishes/${encodeURIComponent(draftId)}`, { credentials: 'include' });
      const data = await res.json();
      if (data && data.success && data.wish) {
        const w = data.wish;
        state.currentDraftId = w.id;
        state.selectedTemplateId = w.templateId || state.selectedTemplateId;
        state.recipientName = w.recipientName || w.customData?.recipient_name || '';
        state.senderName = w.buyerName || w.senderName || w.customData?.sender_name || '';
        state.eventDate = w.eventDate || w.customData?.event_date || state.eventDate;
        state.wishMessage = w.customData?.custom_message || '';
        state.customSlug = w.slug || w.customData?.customSlug || '';
        state.selectedOccasion = (w.customData?.occasion || 'birthday').toLowerCase();
        state.selectedRelationship = (w.customData?.relationship || 'best_friend').toLowerCase();
        state.lockVersion = Number(w.lock_version || w.lockVersion || 1);

        showToast(`Draft for ${state.recipientName || 'Celebration'} restored ✏️`);
        renderAllWizardSteps();
        goToStep(3);
      }
    } catch (err) {
      console.warn('[wish-wizard] Error loading draft:', err);
    }
  }

  // Fetch live templates from server API
  async function fetchTemplatesCatalog() {
    try {
      const res = await fetch('/api/templates?includeDrafts=false', { credentials: 'include' });
      const data = await res.json();
      if (data && data.success && Array.isArray(data.templates) && data.templates.length > 0) {
        // Merge server templates into catalog
        const fetchedMap = new Map(data.templates.map(t => [t.id, t]));
        DEFAULT_CATALOG.forEach(def => {
          if (!fetchedMap.has(def.id)) {
            data.templates.push(def);
          }
        });
        state.templatesCatalog = data.templates;
      }
    } catch (e) {
      console.warn('[wish-wizard] Catalog fetch notice, using built-in catalog:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 1: OCCASION & RELATIONSHIP UI
  // ---------------------------------------------------------------------------

  function initTaxonomyUI() {
    // 1. Render Occasion Cards
    const occGrid = document.getElementById('occasions-grid');
    if (occGrid) {
      occGrid.innerHTML = OCCASIONS.map(occ => {
        const isSelected = state.selectedOccasion === occ.id;
        return `
          <button type="button" onclick="window.WishWizard.selectOccasion('${occ.id}')" class="occasion-card p-4 rounded-2xl glass-card text-left transition-all duration-200 flex flex-col gap-2 cursor-pointer border ${isSelected ? 'border-pink-500 ring-2 ring-pink-500/30 bg-pink-50/40 dark:bg-pink-950/30 shadow-md' : 'border-purple-200/70 dark:border-purple-800/60 hover:border-pink-300'}" data-occ="${occ.id}">
            <div class="flex items-center justify-between">
              <span class="material-symbols-outlined text-[24px] text-pink-500">${occ.icon}</span>
              ${isSelected ? '<span class="text-pink-500 font-bold text-xs">● Active</span>' : ''}
            </div>
            <div>
              <h4 class="font-display font-extrabold text-sm text-purple-950 dark:text-white">${occ.label}</h4>
              <p class="text-[10px] text-purple-800/70 dark:text-purple-300/70 mt-0.5 line-clamp-2">${occ.desc}</p>
            </div>
          </button>
        `;
      }).join('');
    }

    // 2. Render Relationship Cards
    renderRelationshipsGrid();
  }

  function renderRelationshipsGrid() {
    const relGrid = document.getElementById('relationships-grid');
    if (!relGrid) return;

    const filtered = RELATIONSHIPS.filter(rel => {
      if (state.activeRelFilterCategory === 'all') return true;
      return rel.category === state.activeRelFilterCategory;
    });

    relGrid.innerHTML = filtered.map(rel => {
      const isSelected = state.selectedRelationship === rel.id;
      return `
        <button type="button" onclick="window.WishWizard.selectRelationship('${rel.id}')" class="rel-card p-3 rounded-2xl glass-card text-left transition-all duration-200 flex items-center gap-2.5 cursor-pointer border ${isSelected ? 'border-pink-500 ring-2 ring-pink-500/30 bg-pink-50/40 dark:bg-pink-950/30 shadow-md' : 'border-purple-200/70 dark:border-purple-800/60 hover:border-pink-300'}" data-rel="${rel.id}">
          <span class="text-xl flex-shrink-0">${rel.icon}</span>
          <div class="truncate">
            <h4 class="font-bold text-xs text-purple-950 dark:text-white truncate">${rel.label}</h4>
            <span class="text-[9px] text-purple-600/70 dark:text-purple-400/70 capitalize">${rel.category}</span>
          </div>
        </button>
      `;
    }).join('');
  }

  window.WishWizard = window.WishWizard || {};

  window.WishWizard.selectOccasion = function(occId) {
    state.selectedOccasion = occId;
    const occ = OCCASIONS.find(o => o.id === occId);
    const label = document.getElementById('selected-occasion-label');
    if (label && occ) label.textContent = `${occ.label} Selected`;

    initTaxonomyUI();
    updateSuggestedMessage();
    persistWizardSession();
  };

  window.WishWizard.selectRelationship = function(relId) {
    state.selectedRelationship = relId;
    const rel = RELATIONSHIPS.find(r => r.id === relId);
    const label = document.getElementById('selected-relationship-label');
    if (label && rel) label.textContent = `${rel.label} Selected`;

    renderRelationshipsGrid();
    updateSuggestedMessage();
    persistWizardSession();
  };

  window.WishWizard.filterRelationshipCategory = function(cat) {
    state.activeRelFilterCategory = cat;
    document.querySelectorAll('.rel-cat-btn').forEach(btn => {
      const bCat = btn.getAttribute('data-cat');
      if (bCat === cat) {
        btn.className = 'rel-cat-btn px-3 py-1.5 rounded-full text-xs font-bold bg-pink-500 text-white shadow-sm cursor-pointer';
      } else {
        btn.className = 'rel-cat-btn px-3 py-1.5 rounded-full text-xs font-semibold glass-pill cursor-pointer';
      }
    });
    renderRelationshipsGrid();
  };

  // ---------------------------------------------------------------------------
  // STEP 2: RELATIONSHIP-AWARE TEMPLATE DISCOVERY & REUSE ENGINE
  // ---------------------------------------------------------------------------

  function renderTemplatesDiscovery() {
    const grid = document.getElementById('wizard-templates-grid');
    if (!grid) return;

    // Update Context Banner Text
    const occ = OCCASIONS.find(o => o.id === state.selectedOccasion);
    const rel = RELATIONSHIPS.find(r => r.id === state.selectedRelationship);
    const ctxText = document.getElementById('curated-context-text');
    if (ctxText && occ && rel) {
      ctxText.textContent = `Showing highest-rated designs for ${occ.label} celebration crafted for ${rel.displayName}.`;
    }

    // Smart Relationship-Aware Scoring & Cross-Category Reuse
    const scoredTemplates = state.templatesCatalog.map(tpl => {
      let score = 0;
      const tName = (tpl.name || '').toLowerCase();
      const tCat = (tpl.category || '').toLowerCase();
      const tDesc = (tpl.description || '').toLowerCase();
      const tRels = (tpl.relationships || []).map(r => String(r).toLowerCase());
      const selectedRelId = state.selectedRelationship.toLowerCase();
      const selectedOccId = state.selectedOccasion.toLowerCase();
      const relCat = rel ? rel.category : 'general';

      // 1. Direct Occasion Match
      if (tCat.includes(selectedOccId) || tName.includes(selectedOccId) || tDesc.includes(selectedOccId)) {
        score += 50;
      }

      // 2. Direct Relationship Match
      if (tRels.some(r => r.includes(selectedRelId))) {
        score += 40;
      }

      // 3. Cross-Category Reuse (Allows Romantic templates for girlfriend/boyfriend/crush/wife/husband, family for mom/dad/sibling)
      if (relCat === 'romantic' && (tCat.includes('anniversary') || tCat.includes('love') || tDesc.includes('love') || tDesc.includes('romantic'))) {
        score += 35;
      }
      if (relCat === 'family' && (tCat.includes('tribute') || tCat.includes('parents') || tDesc.includes('family') || tDesc.includes('parents'))) {
        score += 35;
      }
      if (relCat === 'friends' && (tCat.includes('friendship') || tCat.includes('party') || tDesc.includes('synthwave') || tDesc.includes('neon'))) {
        score += 35;
      }

      // Universal Birthday / Celebration templates can be adapted for any relationship
      if (tCat.includes('birthday') || tCat.includes('milestone')) {
        score += 20;
      }

      return { tpl, score };
    });

    // Sort by Score descending
    scoredTemplates.sort((a, b) => b.score - a.score);

    // Apply Active Style & Feature Filters
    const filtered = scoredTemplates.filter(({ tpl }) => {
      if (state.styleFilter !== 'all' && tpl.style && tpl.style !== state.styleFilter) {
        return false;
      }
      if (state.featureFilter !== 'all') {
        const feats = tpl.features || [];
        if (!feats.includes(state.featureFilter)) return false;
      }
      return true;
    });

    // Render Template Cards
    grid.innerHTML = filtered.map(({ tpl }) => {
      const isSelected = state.selectedTemplateId === tpl.id;
      const isVip = tpl.tier === 'vip' || tpl.isPremium;
      const thumb = tpl.thumbnail || tpl.previewImage || 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80';

      return `
        <div class="glass-card rounded-3xl overflow-hidden border ${isSelected ? 'border-pink-500 ring-2 ring-pink-500/40 shadow-xl' : 'border-purple-200/80 dark:border-purple-800/60'} flex flex-col group transition-all duration-300">
          <div class="relative aspect-video w-full overflow-hidden bg-purple-950/20">
            <img src="${thumb}" alt="${tpl.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy"/>
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20"></div>

            <div class="absolute top-3 left-3 flex items-center gap-1.5 z-10">
              <span class="px-2.5 py-1 rounded-full text-[9px] font-black ${isVip ? 'bg-amber-500/30 text-amber-200 border border-amber-500/50' : 'bg-black/50 text-white border border-white/20'} backdrop-blur-md">
                ${isVip ? '👑 VIP EXPERIENCE' : 'FREE ACCESS'}
              </span>
              ${tpl.style ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-white/20 text-white backdrop-blur-md">${tpl.style}</span>` : ''}
            </div>

            <div class="absolute bottom-3 left-3 right-3 text-white z-10">
              <h3 class="font-display font-extrabold text-base sm:text-lg drop-shadow-md truncate">${tpl.name}</h3>
              <span class="text-[10px] text-purple-200">${tpl.category || 'Celebration'} · Asia/Kolkata Ready</span>
            </div>
          </div>

          <div class="p-4 sm:p-5 flex flex-col flex-1 justify-between gap-4">
            <p class="text-xs text-purple-800/80 dark:text-purple-300/80 line-clamp-2">${tpl.description || 'Interactive personalized keepsake experience.'}</p>

            <div class="flex items-center gap-2 pt-2 border-t border-purple-200/50 dark:border-purple-800/40">
              <button type="button" onclick="window.WishWizard.selectTemplate('${tpl.id}')" class="flex-1 py-2.5 px-3 rounded-xl ${isSelected ? 'bg-emerald-600 text-white font-extrabold' : 'bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold'} text-xs shadow-md hover:brightness-110 active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer">
                <span class="material-symbols-outlined text-[16px]">${isSelected ? 'check_circle' : 'auto_fix_high'}</span>
                <span>${isSelected ? 'Selected Template' : 'Choose This Template'}</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  window.WishWizard.selectTemplate = function(tplId) {
    state.selectedTemplateId = tplId;
    renderTemplatesDiscovery();
    updateTemplateSummaryCard();
    persistWizardSession();
  };

  window.WishWizard.applyTemplateFilters = function() {
    const styleSel = document.getElementById('filter-template-style');
    const featSel = document.getElementById('filter-template-feature');
    if (styleSel) state.styleFilter = styleSel.value;
    if (featSel) state.featureFilter = featSel.value;
    renderTemplatesDiscovery();
  };

  // ---------------------------------------------------------------------------
  // STEP 3: DETAILS, TAILORED MESSAGES & SLUG ENGINE
  // ---------------------------------------------------------------------------

  function setupInputListeners() {
    // Slug input debouncing
    const slugInput = document.getElementById('input-wish-slug');
    if (slugInput) {
      slugInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
        e.target.value = val;
        state.customSlug = val;
        checkSlugAvailability(val);
      });
    }
  }

  function checkSlugAvailability(slug) {
    clearTimeout(slugDebounceTimer);
    const badge = document.getElementById('slug-availability-badge');
    const icon = document.getElementById('slug-status-icon');

    if (!slug || slug.length < 3) {
      if (badge) {
        badge.textContent = 'wishmagic.live/w/your-custom-link';
        badge.className = 'text-[11px] font-bold text-slate-400';
      }
      if (icon) icon.textContent = 'link';
      state.isSlugAvailable = true;
      return;
    }

    if (badge) {
      badge.textContent = 'Checking availability...';
      badge.className = 'text-[11px] font-bold text-purple-500 animate-pulse';
    }

    slugDebounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/wishes/slug-availability?slug=${encodeURIComponent(slug)}`, { credentials: 'include' });
        const data = await res.json();
        if (data && data.available) {
          state.isSlugAvailable = true;
          if (badge) {
            badge.textContent = `✓ Available: wishmagic.live/w/${slug}`;
            badge.className = 'text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400';
          }
          if (icon) {
            icon.textContent = 'check_circle';
            icon.className = 'material-symbols-outlined text-[20px] text-emerald-500 absolute right-3.5 top-3.5';
          }
        } else {
          state.isSlugAvailable = false;
          if (badge) {
            badge.textContent = `✕ That link is already taken. Try adding a number!`;
            badge.className = 'text-[11px] font-extrabold text-rose-500';
          }
          if (icon) {
            icon.textContent = 'cancel';
            icon.className = 'material-symbols-outlined text-[20px] text-rose-500 absolute right-3.5 top-3.5';
          }
        }
      } catch (err) {
        state.isSlugAvailable = true;
      }
    }, 400);
  }

  function generateTailoredMessage(occId, relId, recipientName) {
    const name = recipientName || 'Someone Special';

    const messages = {
      romantic: [
        `To my dearest ${name}, every single day with you feels like a celebration. May this special day bring you as much boundless joy, warmth, and magic as you bring into my entire universe!`,
        `Happy celebration to my dearest ${name}! Words will never be enough to describe how grateful I am to walk through life by your side. Here is to making infinite magical memories together!`,
        `My heart, my home, my everything — ${name}. Wishing you the happiest and most radiant celebration today. I love you to the moon and beyond! ✨`
      ],
      friends: [
        `Happy celebration to my favorite human, ${name}! Thank you for being the partner-in-crime, the voice of reason (sometimes!), and the best friend anyone could ever ask for. Let us celebrate in style! 🎉`,
        `To another year of crazy adventures, unforgettable laughs, and endless memories with ${name}! Have the most legendary day!`,
        `Cheers to you, ${name}! You light up every room you enter. Keep shining bright and never stop being your authentic, wonderful self! ✨`
      ],
      family: [
        `Dearest ${name}, your unconditional love, guidance, and warmth have shaped everything beautiful in our lives. Wishing you endless peace, radiant health, and boundless joy today! 🌸`,
        `Thank you ${name} for being our rock and greatest inspiration. Today is all about celebrating the wonderful, selfless person you are. Happy celebration, with all our love!`,
        `A heartfelt tribute to ${name}, who makes every day brighter. May your celebration be filled with warmth, smiles, and beautiful memories!`
      ],
      general: [
        `Wishing ${name} a joyful, magical celebration filled with laughter, love, and all the sweet moments you truly deserve! ✨`,
        `May this milestone bring ${name} new blessings, immense happiness, and unforgettable moments of triumph! Cheers to you!`
      ]
    };

    const rel = RELATIONSHIPS.find(r => r.id === relId);
    const category = (rel && rel.category) || 'general';
    const list = messages[category] || messages.general;
    return list[Math.floor(Math.random() * list.length)];
  }

  function updateSuggestedMessage() {
    const msg = generateTailoredMessage(state.selectedOccasion, state.selectedRelationship, state.recipientName);
    state.wishMessage = msg;
    const textarea = document.getElementById('input-wish-message');
    if (textarea) textarea.value = msg;
  }

  window.WishWizard.suggestNewMessage = function() {
    updateSuggestedMessage();
    showToast('New heartfelt message generated ✨');
    persistWizardSession();
  };

  window.WishWizard.handleRecipientNameInput = function(val) {
    state.recipientName = val;
    persistWizardSession();
    triggerPreviewSync();
  };

  window.WishWizard.handleSenderNameInput = function(val) {
    state.senderName = val;
    persistWizardSession();
    triggerPreviewSync();
  };

  window.WishWizard.handleEventDateInput = function(val) {
    state.eventDate = val;
    persistWizardSession();
    triggerPreviewSync();
  };

  window.WishWizard.handleMessageInput = function(val) {
    state.wishMessage = val;
    persistWizardSession();
    triggerPreviewSync();
  };

  window.WishWizard.handleSlugInput = function(val) {
    state.customSlug = val;
    persistWizardSession();
  };

  function updateTemplateSummaryCard() {
    const tpl = state.templatesCatalog.find(t => t.id === state.selectedTemplateId) || state.templatesCatalog[0];
    const occ = OCCASIONS.find(o => o.id === state.selectedOccasion);
    const rel = RELATIONSHIPS.find(r => r.id === state.selectedRelationship);

    const nameEl = document.getElementById('summary-template-name');
    const descEl = document.getElementById('summary-template-desc');
    const thumbEl = document.getElementById('summary-template-thumb');
    const tierEl = document.getElementById('summary-template-tier');
    const occEl = document.getElementById('summary-occasion');
    const relEl = document.getElementById('summary-relationship');
    const dateEl = document.getElementById('summary-date');

    if (nameEl && tpl) nameEl.textContent = tpl.name;
    if (descEl && tpl) descEl.textContent = tpl.description || '';
    if (thumbEl && tpl) thumbEl.src = tpl.thumbnail || tpl.previewImage || '';
    if (tierEl && tpl) tierEl.textContent = tpl.tier === 'vip' || tpl.isPremium ? '👑 VIP' : 'FREE';
    if (occEl && occ) occEl.textContent = occ.label;
    if (relEl && rel) relEl.textContent = rel.label;
    if (dateEl) {
      dateEl.textContent = window.WishLifecycle ? window.WishLifecycle.formatISTDate(state.eventDate) : state.eventDate;
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 4: LIVE PREVIEW & SANDBOX HYDRATION
  // ---------------------------------------------------------------------------

  function renderLivePreviewSandbox() {
    const iframe = document.getElementById('wizard-live-iframe');
    if (!iframe) return;

    const tpl = state.templatesCatalog.find(t => t.id === state.selectedTemplateId) || state.templatesCatalog[0];
    const entryUrl = `/templates-store/${tpl.folder || tpl.id}/${tpl.entryFile || 'index.html'}`;

    if (iframe.getAttribute('data-loaded-src') !== entryUrl) {
      iframe.setAttribute('data-loaded-src', entryUrl);
      iframe.src = entryUrl;
      iframe.onload = () => {
        triggerPreviewSync();
      };
    } else {
      triggerPreviewSync();
    }
  }

  function triggerPreviewSync() {
    const iframe = document.getElementById('wizard-live-iframe');
    if (!iframe) return;

    const payload = {
      recipient_name: state.recipientName || 'Someone Special',
      sender_name: state.senderName || 'A Cherished Friend',
      event_date: state.eventDate,
      custom_message: state.wishMessage || 'May your day be filled with warm magic, sparkling smiles, and infinite joy!',
      occasion: state.selectedOccasion,
      relationship: state.selectedRelationship
    };

    // 1. PostMessage dispatch
    if (iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'WISHMAGIC_LIVE_UPDATE', payload }, '*');
      iframe.contentWindow.postMessage({ type: 'WISHMAGIC_INIT', payload }, '*');
    }

    // 2. Direct DOM Hydration
    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) return;

      doc.querySelectorAll('[data-wm="recipient_name"]').forEach(el => {
        el.textContent = payload.recipient_name;
      });
      doc.querySelectorAll('[data-wm="sender_name"]').forEach(el => {
        el.textContent = payload.sender_name ? `— ${payload.sender_name}` : '';
      });
      doc.querySelectorAll('[data-wm="event_date"]').forEach(el => {
        el.textContent = window.WishLifecycle ? window.WishLifecycle.formatISTDate(payload.event_date) : payload.event_date;
      });
      doc.querySelectorAll('[data-wm="custom_message"]').forEach(el => {
        el.textContent = payload.custom_message;
      });
    } catch (e) {}
  }

  window.WishWizard.setPreviewDevice = function(device) {
    state.previewDevice = device;
    const container = document.getElementById('preview-viewport-container');
    const btnMob = document.getElementById('btn-device-mobile');
    const btnTab = document.getElementById('btn-device-tablet');
    const btnDsk = document.getElementById('btn-device-desktop');

    if (!container) return;

    if (device === 'mobile') {
      container.className = 'w-[375px] h-[660px] max-w-full rounded-2xl sm:rounded-3xl shadow-2xl border-4 border-purple-950/20 overflow-hidden bg-white relative transition-all duration-300';
    } else if (device === 'tablet') {
      container.className = 'w-[640px] h-[660px] max-w-full rounded-2xl sm:rounded-3xl shadow-2xl border-4 border-purple-950/20 overflow-hidden bg-white relative transition-all duration-300';
    } else {
      container.className = 'w-full h-[660px] max-w-full rounded-2xl sm:rounded-3xl shadow-2xl border-4 border-purple-950/20 overflow-hidden bg-white relative transition-all duration-300';
    }

    [btnMob, btnTab, btnDsk].forEach(btn => {
      if (btn) btn.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold text-purple-950 dark:text-purple-200 transition flex items-center gap-1 cursor-pointer';
    });

    const activeBtn = device === 'mobile' ? btnMob : (device === 'tablet' ? btnTab : btnDsk);
    if (activeBtn) {
      activeBtn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-pink-500 text-white transition flex items-center gap-1 cursor-pointer';
    }
  };

  // ---------------------------------------------------------------------------
  // STEP ROUTING & PROGRESS CONTROL
  // ---------------------------------------------------------------------------

  function renderAllWizardSteps() {
    // 1. Update form input values from state
    const nameInput = document.getElementById('input-recipient-name');
    const senderInput = document.getElementById('input-sender-name');
    const dateInput = document.getElementById('input-event-date');
    const msgInput = document.getElementById('input-wish-message');
    const slugInput = document.getElementById('input-wish-slug');

    if (nameInput) nameInput.value = state.recipientName;
    if (senderInput) senderInput.value = state.senderName;
    if (dateInput) dateInput.value = state.eventDate;
    if (msgInput) msgInput.value = state.wishMessage;
    if (slugInput) slugInput.value = state.customSlug;

    // 2. Render sub-views
    initTaxonomyUI();
    renderTemplatesDiscovery();
    updateTemplateSummaryCard();

    // 3. Show active step panel
    for (let i = 1; i <= 4; i++) {
      const panel = document.getElementById(`wizard-step-${i}`);
      if (panel) {
        if (i === state.currentStep) panel.classList.remove('hidden');
        else panel.classList.add('hidden');
      }

      // Update stepper node styling
      const stepNode = document.querySelector(`.wizard-step-node[data-step="${i}"]`);
      if (stepNode) {
        const badge = stepNode.querySelector('.step-badge');
        if (i < state.currentStep) {
          stepNode.classList.remove('opacity-60');
          if (badge) {
            badge.className = 'step-badge w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center';
            badge.innerHTML = '✓';
          }
        } else if (i === state.currentStep) {
          stepNode.classList.remove('opacity-60');
          if (badge) {
            badge.className = 'step-badge w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-xs sm:text-sm flex items-center justify-center shadow-md shadow-pink-500/25';
            badge.innerHTML = String(i);
          }
        } else {
          stepNode.classList.add('opacity-60');
          if (badge) {
            badge.className = 'step-badge w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-200 font-bold text-xs sm:text-sm flex items-center justify-center';
            badge.innerHTML = String(i);
          }
        }
      }
    }

    if (state.currentStep === 4) {
      renderLivePreviewSandbox();
    }
  }

  window.WishWizard.goToStep = function(stepNum) {
    if (stepNum < 1 || stepNum > 4) return;

    // Step validation
    if (stepNum > 2 && !state.selectedTemplateId) {
      showToast('Please select a template first');
      return;
    }

    state.currentStep = stepNum;
    renderAllWizardSteps();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    persistWizardSession();
  };

  // ---------------------------------------------------------------------------
  // LIFECYCLE PERSISTENCE (Draft, Deep Customizer & Instant Publish)
  // ---------------------------------------------------------------------------

  function getCustomDataPayload(isDraft = true) {
    const tpl = state.templatesCatalog.find(t => t.id === state.selectedTemplateId) || state.templatesCatalog[0];

    return {
      recipient_name: state.recipientName || 'Someone Special',
      recipientName: state.recipientName || 'Someone Special',
      sender_name: state.senderName || 'Creator',
      senderName: state.senderName || 'Creator',
      event_date: state.eventDate,
      eventDate: state.eventDate,
      custom_message: state.wishMessage || 'May your celebration be filled with sparkling memories and boundless joy!',
      occasion: state.selectedOccasion,
      relationship: state.selectedRelationship,
      templateId: state.selectedTemplateId,
      templateName: tpl.name,
      isDraft,
      status: isDraft ? 'draft' : 'published',
      customSlug: state.customSlug || undefined,
      slug: state.customSlug || undefined
    };
  }

  // Path A: Save as Draft only
  window.WishWizard.saveDraftOnly = async function() {
    state.isSaving = true;
    const btn = document.getElementById('btn-save-draft');
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span><span>Saving Draft...</span>';

    try {
      const payload = getCustomDataPayload(true);
      const res = await saveOrUpdateWishRecord(payload, true);

      if (res && res.success) {
        showToast('Draft successfully saved to your creator account! 💾');
        sessionStorage.removeItem('wishmagic_wizard_session');
      } else {
        showToast(res.message || 'Error saving draft to server');
      }
    } catch (err) {
      showToast('Offline notice: Draft saved locally in browser storage.');
    } finally {
      state.isSaving = false;
      if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">bookmark</span><span>Save as Draft</span>';
    }
  };

  // Path B: Continue Editing in Full Customizer
  window.WishWizard.continueInFullCustomizer = async function() {
    const btn = document.getElementById('btn-deep-customize');
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span><span>Preparing Studio...</span>';

    try {
      const payload = getCustomDataPayload(true);
      const res = await saveOrUpdateWishRecord(payload, true);

      const targetWishId = (res && res.wishId) || state.currentDraftId;
      sessionStorage.removeItem('wishmagic_wizard_session');

      if (targetWishId) {
        window.location.href = `/customize.html?draft=${encodeURIComponent(targetWishId)}&template=${encodeURIComponent(state.selectedTemplateId)}`;
      } else {
        window.location.href = `/customize.html?template=${encodeURIComponent(state.selectedTemplateId)}`;
      }
    } catch (e) {
      window.location.href = `/customize.html?template=${encodeURIComponent(state.selectedTemplateId)}`;
    }
  };

  // Path C: Instant Publish
  window.WishWizard.publishNow = async function() {
    if (!state.recipientName || !state.recipientName.trim()) {
      showToast('Recipient name is required before publishing');
      goToStep(3);
      const nameInput = document.getElementById('input-recipient-name');
      if (nameInput) nameInput.focus();
      return;
    }

    const btn = document.getElementById('btn-publish-now');
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span><span>Publishing...</span>';

    try {
      const payload = getCustomDataPayload(false);

      // 1. Create or update wish
      const res = await saveOrUpdateWishRecord(payload, false);
      if (!res || !res.success) {
        showToast(res.message || 'Failed to save wish record');
        return;
      }

      const wishId = res.wishId || state.currentDraftId;

      // 2. Trigger publication snapshot endpoint
      const pubRes = await fetch(`/api/wishes/${encodeURIComponent(wishId)}/publish`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const pubData = await pubRes.json();

      if (pubData && pubData.success) {
        state.isPublished = true;
        state.publishedSlug = pubData.slug || res.slug || state.customSlug || wishId;
        state.activeSnapshotId = pubData.activeSnapshotId;

        openPublishSuccessModal(state.publishedSlug);
        sessionStorage.removeItem('wishmagic_wizard_session');
        localStorage.removeItem('wishmagic_wizard_draft');
      } else {
        showToast(pubData.message || 'Publishing error. Retaining saved draft.');
      }
    } catch (err) {
      showToast('Network error while publishing. Your draft has been safely retained.');
    } finally {
      if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">rocket_launch</span><span>Publish Wish Now 🚀</span>';
    }
  };

  // Unified Server D1 Persistence Helper
  async function saveOrUpdateWishRecord(customData, isDraft) {
    const user = window.WishAuth ? window.WishAuth.getCurrentUser() : null;
    const headers = {
      ...getAuthHeaders(),
      'Content-Type': 'application/json'
    };

    if (state.currentDraftId) {
      // Update existing record
      const res = await fetch(`/api/wishes/${encodeURIComponent(state.currentDraftId)}`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          customData,
          slug: state.customSlug || undefined,
          lockVersion: state.lockVersion
        })
      });
      const data = await res.json();
      if (data && data.success) {
        state.lockVersion = Number(data.lockVersion || state.lockVersion + 1);
        return { success: true, wishId: state.currentDraftId, slug: data.slug };
      }
      return data;
    } else {
      // Create new record
      const res = await fetch('/api/wishes', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          templateId: state.selectedTemplateId,
          status: isDraft ? 'draft' : 'published',
          isDraft,
          slug: state.customSlug || undefined,
          customData
        })
      });
      const data = await res.json();
      if (data && data.success) {
        state.currentDraftId = data.wish?.id || data.wishId;
        return { success: true, wishId: state.currentDraftId, slug: data.wish?.slug || data.slug };
      }
      return data;
    }
  }

  function getAuthHeaders() {
    const headers = { 'Accept': 'application/json' };
    try {
      if (window.WishAuth) {
        const session = window.WishAuth.getSession();
        if (session && session.token) {
          headers['Authorization'] = `Bearer ${session.token}`;
        }
      }
    } catch (e) {}
    return headers;
  }

  // ---------------------------------------------------------------------------
  // PUBLISH SUCCESS MODAL & SHARING
  // ---------------------------------------------------------------------------

  function openPublishSuccessModal(slug) {
    const modal = document.getElementById('wizard-publish-modal');
    const input = document.getElementById('modal-public-url-input');
    const nameEl = document.getElementById('modal-recipient-highlight');
    const openLiveBtn = document.getElementById('modal-open-live-btn');
    const canvas = document.getElementById('wizard-qr-canvas');

    if (!modal) return;

    const publicUrl = `${window.location.origin}/w/${slug}`;
    if (input) input.value = publicUrl;
    if (nameEl) nameEl.textContent = state.recipientName || 'Your Loved One';
    if (openLiveBtn) openLiveBtn.href = `/w/${slug}`;

    // Render ISO/IEC 18004 QR Code
    if (canvas && typeof window !== 'undefined') {
      if (window.WishShareService && typeof window.WishShareService.renderQRCode === 'function') {
        window.WishShareService.renderQRCode({ slug }, canvas, 180);
      } else if (window.WishQRCodeService && typeof window.WishQRCodeService.drawQRCodeToCanvas === 'function') {
        window.WishQRCodeService.drawQRCodeToCanvas(canvas, publicUrl, 180);
      }
    }

    modal.classList.remove('hidden');
  }

  window.WishWizard.closePublishModal = function() {
    const modal = document.getElementById('wizard-publish-modal');
    if (modal) modal.classList.add('hidden');
  };

  window.WishWizard.copyPublicLink = async function() {
    const input = document.getElementById('modal-public-url-input');
    const copyText = document.getElementById('modal-copy-text');
    if (!input) return;

    try {
      await navigator.clipboard.writeText(input.value);
      if (copyText) copyText.textContent = 'Copied! ✓';
      showToast('Public wish link copied to clipboard ✨');
      setTimeout(() => { if (copyText) copyText.textContent = 'Copy'; }, 2500);
    } catch (e) {
      input.select();
      document.execCommand('copy');
      if (copyText) copyText.textContent = 'Copied! ✓';
      showToast('Link copied to clipboard ✨');
    }
  };

  window.WishWizard.shareSocial = function(network) {
    const input = document.getElementById('modal-public-url-input');
    const url = input ? input.value : `${window.location.origin}/w/${state.publishedSlug}`;
    const text = `✨ I created a magical celebration surprise for ${state.recipientName || 'you'} on WishMagic! Open here:`;

    if (network === 'whatsapp') {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
    } else if (network === 'telegram') {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
    } else if (network === 'native') {
      if (navigator.share) {
        navigator.share({ title: 'WishMagic Celebration', text, url }).catch(() => {});
      } else {
        window.WishWizard.copyPublicLink();
      }
    }
  };

  // ---------------------------------------------------------------------------
  // AUTOSAVE & RESILIENCE HELPERS
  // ---------------------------------------------------------------------------

  function persistWizardSession() {
    clearTimeout(autosaveDebounceTimer);
    autosaveDebounceTimer = setTimeout(() => {
      try {
        const payload = {
          currentStep: state.currentStep,
          selectedOccasion: state.selectedOccasion,
          selectedRelationship: state.selectedRelationship,
          selectedTemplateId: state.selectedTemplateId,
          recipientName: state.recipientName,
          senderName: state.senderName,
          eventDate: state.eventDate,
          wishMessage: state.wishMessage,
          customSlug: state.customSlug,
          currentDraftId: state.currentDraftId,
          updatedAt: Date.now()
        };
        sessionStorage.setItem('wishmagic_wizard_session', JSON.stringify(payload));
        localStorage.setItem('wishmagic_wizard_draft', JSON.stringify(payload));
      } catch (e) {}
    }, 300);
  }

  window.WishWizard.dismissResumeBanner = function() {
    const banner = document.getElementById('wizard-resume-banner');
    if (banner) banner.classList.add('hidden');
  };

  window.WishWizard.resetWizard = function(confirmed = false) {
    if (!confirmed && !confirm('Are you sure you want to clear your draft and start fresh?')) return;
    sessionStorage.removeItem('wishmagic_wizard_session');
    localStorage.removeItem('wishmagic_wizard_draft');
    state.currentDraftId = null;
    state.recipientName = '';
    state.senderName = '';
    state.wishMessage = '';
    state.customSlug = '';
    state.selectedOccasion = 'birthday';
    state.selectedRelationship = 'best_friend';
    state.currentStep = 1;

    window.WishWizard.dismissResumeBanner();
    renderAllWizardSteps();
    showToast('Wizard reset. Starting fresh! ✨');
  };

  function showToast(message) {
    const toast = document.getElementById('wizard-toast');
    const msgEl = document.getElementById('wizard-toast-message');
    if (!toast || !msgEl) return;

    msgEl.textContent = message;
    toast.classList.remove('translate-y-24', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
      toast.classList.remove('translate-y-0', 'opacity-100');
      toast.classList.add('translate-y-24', 'opacity-0');
    }, 3500);
  }

  // Export internal helpers for unit and E2E testing
  window.WishWizard._state = state;
  window.WishWizard._generateTailoredMessage = generateTailoredMessage;
  window.WishWizard._OCCASIONS = OCCASIONS;
  window.WishWizard._RELATIONSHIPS = RELATIONSHIPS;
  window.WishWizard._DEFAULT_CATALOG = DEFAULT_CATALOG;

})(typeof window !== 'undefined' ? window : global);
