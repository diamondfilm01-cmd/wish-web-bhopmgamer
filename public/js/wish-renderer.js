// WishMagic Universal Recipient Wish Experience Renderer
// Part 6 & Part 7: Final Recipient Wish Website + Immersive Story Experience + Full Lifecycle State Machine (Upcoming → Active → Expired)
// Timezone: Asia/Kolkata (IST = UTC+05:30)

(function(window) {
  'use strict';

  let currentWishData = null;
  let currentRawWish = null;
  let currentTemplate = null;
  let isSoundtrackPlaying = false;
  let activeAudioElement = null;
  let webAudioSynth = null;
  let countdownTimerInterval = null;
  let midnightTransitionTimeout = null;
  let simulatedStatusOverride = null; // Used for Creator Preview / Dev Test Mode
  let candleBlown = false;
  let envelopeOpened = false;

  // ---------------------------------------------------------------------------
  // 1. INITIALIZATION & DATA EXTRACTION
  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', async () => {
    // 1. Extract wish ID from either pathname (/w/:id) or query parameter (?id=:id)
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    let wishId = null;

    if (pathParts[0] === 'w' && pathParts[1]) {
      wishId = decodeURIComponent(pathParts[1]);
    } else {
      const urlParams = new URLSearchParams(window.location.search);
      wishId = urlParams.get('id');
    }

    // 2. Check for live preview postMessage mode (inside Customizer Preview iframe)
    if (window.location.search.includes('preview=true') || window.name === 'wish-preview-frame') {
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'WISHMAGIC_INIT') {
          const payload = event.data.payload || {};
          currentWishData = payload;
          renderWishLifecycleRouter(payload, null);
        }
      });
    }

    // 3. Tab visibility listener (re-evaluates lifecycle status immediately upon tab resume)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && currentWishData) {
        console.log('[WishLifecycle] Tab resumed, re-evaluating lifecycle boundary status...');
        renderWishLifecycleRouter(currentWishData, currentTemplate);
      }
    });

    // Fast-path: Check for pre-injected SSR data
    if (window.__SSR_WISH_DATA__ && window.__SSR_WISH_DATA__.wish) {
      currentRawWish = window.__SSR_WISH_DATA__.wish;
      currentTemplate = window.__SSR_WISH_DATA__.template || null;
      currentWishData = currentRawWish.customData || {};
      renderWishLifecycleRouter(currentWishData, currentTemplate);
      return;
    }

    if (!wishId) {
      console.log('No wish ID specified, displaying fallback celebration demo');
      loadDemoCelebrationWish();
      return;
    }

    try {
      let res = await fetch(`/api/public/wishes/${encodeURIComponent(wishId)}`);
      if (!res.ok) {
        res = await fetch(`/api/wishes/${encodeURIComponent(wishId)}`);
      }
      const result = await res.json();

      if (!result.success || !result.wish) {
        showErrorScreen();
        return;
      }

      currentRawWish = result.wish;
      const wish = result.wish;
      const template = result.template;
      const customData = wish.customData || {};

      // If template not bundled in response, fetch it
      if (!template && wish.templateId) {
        try {
          const tRes = await fetch(`/api/templates/${encodeURIComponent(wish.templateId)}`);
          const tResult = await tRes.json();
          if (tResult.success && tResult.template) {
            currentTemplate = tResult.template;
          }
        } catch (e) {}
      } else {
        currentTemplate = template;
      }

      renderWishLifecycleRouter(customData, currentTemplate);

    } catch (err) {
      console.error('Error loading wish experience:', err);
      showErrorScreen();
    }
  });

  function showErrorScreen() {
    const loadingScreen = document.getElementById('wish-loading-screen');
    const errorScreen = document.getElementById('wish-error-screen');
    if (loadingScreen) loadingScreen.classList.add('hidden');
    if (errorScreen) errorScreen.classList.remove('hidden');
  }

  function isCreatorPreviewMode() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('preview') === 'true' || 
           urlParams.get('preview') === '1' ||
           urlParams.get('creatorPreview') === '1' ||
           urlParams.get('creatorPreview') === 'true' ||
           urlParams.get('creator_preview') === '1' ||
           urlParams.get('creator_preview') === 'true' ||
           urlParams.get('mode') === 'creator-preview' || 
           window.name === 'wish-preview-frame' ||
           window.WISHMAGIC_PREVIEW_MODE === true;
  }

  function loadDemoCelebrationWish() {
    const demoData = {
      recipient_name: 'Kritika',
      sender_name: 'Ankit',
      custom_message: 'May this year bring you boundless happiness, thrilling adventures, and every dream you whisper to the stars! You make every day brighter and more joyful.',
      event_date: new Date().toISOString().split('T')[0],
      cover_photo: '/assets/file_ab2082.png',
      photos: [
        { id: 'p1', url: '/assets/file_ab2082.png', name: 'Golden Hour Laughs', caption: 'Sunsets & Unstoppable Smiles' },
        { id: 'p2', url: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=800&auto=format&fit=crop&q=80', name: 'Celebration Sparks', caption: 'Midnight Confetti Magic' }
      ],
      music: {
        enabled: true,
        name: 'Celebration Acoustic Strings',
        trackId: 'celebration-strings'
      },
      voice_note: {
        enabled: false
      },
      themeConfig: {
        preset: 'magical',
        colors: {
          primary: '#ec4899',
          secondary: '#a855f7',
          accent: '#fbbf24',
          background: '#0d0417',
          surface: '#1e0b36',
          text: '#ffffff'
        }
      },
      sections: [
        { id: 'hero', name: 'Hero Surprise', enabled: true, order: 0 },
        { id: 'message', name: 'Heartfelt Letter', enabled: true, order: 1 },
        { id: 'gallery', name: 'Photo Keepsakes', enabled: true, order: 2 },
        { id: 'memories', name: 'Memories Reel', enabled: true, order: 3 },
        { id: 'countdown', name: 'Countdown', enabled: true, order: 4 },
        { id: 'finale', name: 'Celebration Finale', enabled: true, order: 5 }
      ]
    };

    renderWishLifecycleRouter(demoData, {
      id: 'tpl_glitter_birthday',
      name: 'Glitter Birthday Bash 3D'
    });
  }

  // ---------------------------------------------------------------------------
  // 2. LIFECYCLE ROUTER (UPCOMING / ACTIVE / EXPIRED)
  // ---------------------------------------------------------------------------
  function renderWishLifecycleRouter(customData, template) {
    currentWishData = customData;
    currentTemplate = template;

    const eventDate = customData.event_date || customData.eventDate || '';
    const isCreatorPreview = isCreatorPreviewMode();

    // Determine lifecycle status
    let status = 'active';
    if (window.WishLifecycle && typeof window.WishLifecycle.getWishStatus === 'function') {
      status = window.WishLifecycle.getWishStatus(customData);
    }

    // Apply simulation override if testing in Creator Preview mode
    if (simulatedStatusOverride && isCreatorPreview) {
      status = simulatedStatusOverride;
    }

    // Clear existing timers
    if (countdownTimerInterval) {
      clearInterval(countdownTimerInterval);
      countdownTimerInterval = null;
    }
    if (midnightTransitionTimeout) {
      clearTimeout(midnightTransitionTimeout);
      midnightTransitionTimeout = null;
    }

    // Apply Theme Engine
    applyRecipientTheme(customData);

    // Render Creator Preview Toolbar if in preview mode
    renderCreatorPreviewToolbar(status, isCreatorPreview);

    // Sanitize data according to lifecycle status (unless creator preview)
    const sanitizedData = window.WishLifecycle 
      ? window.WishLifecycle.sanitizeWishDataForStatus(customData, status, isCreatorPreview)
      : customData;

    if (status === 'upcoming' && !isCreatorPreview) {
      renderUpcomingExperience(sanitizedData, template, eventDate);
    } else if (status === 'expired' && !isCreatorPreview) {
      renderExpiredExperience(sanitizedData, template, eventDate);
    } else {
      // ACTIVE state (or creator preview)
      renderActiveWishStoryExperience(sanitizedData, template, eventDate, isCreatorPreview);
    }

    // Part 11: Centralized Watermark Decision
    const wishObj = currentRawWish || { customData: sanitizedData, tier: sanitizedData.tier || 'free' };
    updateWatermarkPolicy(wishObj);

    // Smooth transition from Loading Screen
    revealExperienceContainer();
  }

  function applyRecipientTheme(customData) {
    if (!customData) return;

    // 1. Theme Configuration resolution
    const themeConfig = customData.themeConfig || {};
    const themeKey = customData.theme || themeConfig.preset || 'magical';

    let resolvedConfig = themeConfig;
    if (window.WishThemeEngine && typeof window.WishThemeEngine.createThemeConfig === 'function') {
      resolvedConfig = window.WishThemeEngine.createThemeConfig(themeKey, themeConfig);
    }

    // 2. Inject Theme CSS variables into Document
    if (window.WishThemeEngine && typeof window.WishThemeEngine.generateThemeCSS === 'function') {
      let themeStyleTag = document.getElementById('wishmagic-theme-styles');
      if (!themeStyleTag) {
        themeStyleTag = document.createElement('style');
        themeStyleTag.id = 'wishmagic-theme-styles';
        document.head.appendChild(themeStyleTag);
      }
      themeStyleTag.textContent = window.WishThemeEngine.generateThemeCSS(resolvedConfig);
    }

    // 3. Part 13: Initialize Animation & Magical Effects Engine
    if (window.WishAnimationEngine && typeof window.WishAnimationEngine.init === 'function') {
      const animConfig = {
        entrance: customData.entranceAnimation || customData.pageEntrance || (resolvedConfig.effects && resolvedConfig.effects.entrance) || 'fade-up',
        sectionTransition: customData.sectionTransition || customData.sectionReveal || (resolvedConfig.effects && resolvedConfig.effects.sectionTransition) || 'slide',
        textReveal: customData.textReveal || (resolvedConfig.effects && resolvedConfig.effects.textReveal) || 'fade',
        imageReveal: customData.imageReveal || (resolvedConfig.effects && resolvedConfig.effects.imageReveal) || 'fade',
        particleType: (customData.effects && customData.effects.particleType) || (resolvedConfig.effects && resolvedConfig.effects.particleType) || 'sparkles',
        intensity: (customData.effects && customData.effects.intensity) || (resolvedConfig.effects && resolvedConfig.effects.intensity) || 'soft',
        primaryColor: (customData.colors && customData.colors.primary) || (resolvedConfig.colors && resolvedConfig.colors.primary) || '#ec4899',
        accentColor: (customData.colors && customData.colors.accent) || (resolvedConfig.colors && resolvedConfig.colors.accent) || '#fbbf24',
        secondaryColor: (customData.colors && customData.colors.secondary) || (resolvedConfig.colors && resolvedConfig.colors.secondary) || '#8b5cf6',
        interactiveBursts: customData.interactiveBursts !== false
      };
      window.WishAnimationEngine.init(document, animConfig);
    }
  }

  function updateWatermarkPolicy(wish) {
    const footer = document.getElementById('wish-recipient-footer');
    if (!footer) return;

    let showWatermark = true;
    if (window.WishFeatureAccess && typeof window.WishFeatureAccess.shouldShowWatermark === 'function') {
      showWatermark = window.WishFeatureAccess.shouldShowWatermark(wish, window.WishAuth && typeof window.WishAuth.getCurrentUser === 'function' ? window.WishAuth.getCurrentUser() : null);
    } else {
      showWatermark = !(wish && (wish.tier === 'vip' || wish.price > 0 || (wish.customData && wish.customData.watermarkRemoved)));
    }

    if (!showWatermark) {
      footer.style.display = 'none';
      footer.classList.add('hidden');
    } else {
      footer.style.display = 'block';
      footer.classList.remove('hidden');
    }
  }

  function revealExperienceContainer() {
    const loadingScreen = document.getElementById('wish-loading-screen');
    const container = document.getElementById('wish-experience-container');

    setTimeout(() => {
      if (loadingScreen) {
        loadingScreen.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => loadingScreen.classList.add('hidden'), 700);
      }
      if (container) {
        container.classList.remove('opacity-0');
        container.classList.add('opacity-100');
      }
    }, 350);
  }

  // ---------------------------------------------------------------------------
  // 3. CREATOR PREVIEW & SIMULATION TOOLBAR
  // ---------------------------------------------------------------------------
  function renderCreatorPreviewToolbar(currentStatus, isCreatorPreview) {
    let bar = document.getElementById('creator-preview-lifecycle-bar');
    if (!isCreatorPreview) {
      if (bar) bar.remove();
      return;
    }

    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'creator-preview-lifecycle-bar';
      bar.className = 'fixed top-3 left-3 sm:left-6 z-50 flex items-center gap-2 pointer-events-auto';
      document.body.appendChild(bar);
    }

    const statusColors = {
      upcoming: 'bg-purple-600 text-white',
      active: 'bg-emerald-600 text-white',
      expired: 'bg-rose-600 text-white'
    };

    bar.innerHTML = `
      <div class="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-full bg-black/80 backdrop-blur-xl border border-white/25 shadow-2xl text-xs text-white">
        <span class="text-xs">👁️</span>
        <span class="font-bold hidden md:inline">Creator Preview</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${statusColors[currentStatus] || 'bg-purple-600'}">
          ${currentStatus}
        </span>
        
        <div class="h-3 w-[1px] bg-white/20 mx-0.5 hidden sm:block"></div>

        <!-- Simulation Switcher for Testing Part 7 -->
        <div class="flex items-center gap-1">
          <button onclick="WishRenderer.simulateLifecycleStatus('upcoming')" class="px-2 py-0.5 rounded-full text-[10px] font-bold ${currentStatus === 'upcoming' ? 'bg-purple-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'}" title="Test Upcoming State">
            Upcoming
          </button>
          <button onclick="WishRenderer.simulateLifecycleStatus('active')" class="px-2 py-0.5 rounded-full text-[10px] font-bold ${currentStatus === 'active' ? 'bg-emerald-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'}" title="Test Active State">
            Active
          </button>
          <button onclick="WishRenderer.simulateLifecycleStatus('expired')" class="px-2 py-0.5 rounded-full text-[10px] font-bold ${currentStatus === 'expired' ? 'bg-rose-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'}" title="Test Expired State">
            Expired
          </button>
          ${simulatedStatusOverride ? `
            <button onclick="WishRenderer.simulateLifecycleStatus(null)" class="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-black hover:bg-amber-300" title="Reset to Real Clock Time">
              ↺ Real
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // 4. UPCOMING WAITING EXPERIENCE (Part 7)
  // ---------------------------------------------------------------------------
  function renderUpcomingExperience(customData, template, eventDate) {
    const recipient = customData.recipient_name || customData.recipientName || 'Someone Special';
    const formattedDate = window.WishLifecycle ? window.WishLifecycle.formatISTDate(eventDate) : eventDate;

    // Hide soundtrack pill during upcoming state
    const musicPill = document.getElementById('floating-music-pill');
    if (musicPill) musicPill.classList.add('hidden');

    document.title = `✨ Something Special Is Waiting For ${recipient} | WishMagic`;

    const storyFlow = document.getElementById('wish-story-flow');
    if (!storyFlow) return;

    storyFlow.innerHTML = `
      <section class="w-full max-w-xl px-4 sm:px-6 py-12 flex flex-col items-center text-center my-auto">
        <!-- Occasion Pill -->
        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-900/60 border border-purple-400/40 text-xs font-semibold text-purple-200 mb-6 backdrop-blur-xl shadow-xl animate-bounce-soft">
          <span>✨ Upcoming Celebration</span>
          <span class="text-amber-300">✦</span>
          <span>Unlocks ${escapeHTML(formattedDate)}</span>
        </div>

        <!-- Centerpiece Lock Icon / Envelope -->
        <div class="relative w-28 h-28 sm:w-32 sm:h-32 mb-6 flex items-center justify-center">
          <div class="absolute inset-0 rounded-full bg-gradient-to-tr from-purple-500/30 via-pink-500/30 to-amber-400/20 blur-2xl animate-pulse"></div>
          <div class="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/25 shadow-2xl flex items-center justify-center text-5xl">
            🎁
          </div>
        </div>

        <!-- Headline -->
        <h1 class="text-3xl sm:text-4xl md:text-5xl font-black font-display tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-200 via-pink-200 to-amber-200 mb-3">
          Something Special Is Waiting For <span class="text-pink-400 font-serifAccent italic">${escapeHTML(recipient)}</span>
        </h1>

        <p class="text-xs sm:text-sm text-purple-200/80 max-w-md mx-auto mb-8 font-medium leading-relaxed">
          A personalized celebration surprise has been prepared with immense love. It will automatically unlock when the celebration date begins (00:00 IST)!
        </p>

        <!-- Live Digital Countdown Card -->
        <div class="w-full rounded-3xl bg-white/10 backdrop-blur-2xl p-6 sm:p-8 border border-white/20 shadow-2xl mb-8">
          <span class="text-xs uppercase font-extrabold tracking-widest text-amber-300 block mb-4">Unlocking In</span>
          
          <div class="grid grid-cols-4 gap-2 sm:gap-4 max-w-sm mx-auto mb-2">
            <div class="p-3 rounded-2xl bg-black/40 border border-white/15">
              <span id="upcoming-clock-days" class="text-2xl sm:text-3xl font-black font-display text-pink-300 block">00</span>
              <span class="text-[9px] uppercase font-bold text-white/60 tracking-wider">Days</span>
            </div>
            <div class="p-3 rounded-2xl bg-black/40 border border-white/15">
              <span id="upcoming-clock-hours" class="text-2xl sm:text-3xl font-black font-display text-purple-300 block">00</span>
              <span class="text-[9px] uppercase font-bold text-white/60 tracking-wider">Hours</span>
            </div>
            <div class="p-3 rounded-2xl bg-black/40 border border-white/15">
              <span id="upcoming-clock-mins" class="text-2xl sm:text-3xl font-black font-display text-cyan-300 block">00</span>
              <span class="text-[9px] uppercase font-bold text-white/60 tracking-wider">Mins</span>
            </div>
            <div class="p-3 rounded-2xl bg-black/40 border border-white/15">
              <span id="upcoming-clock-secs" class="text-2xl sm:text-3xl font-black font-display text-amber-300 block">00</span>
              <span class="text-[9px] uppercase font-bold text-white/60 tracking-wider">Secs</span>
            </div>
          </div>

          <p class="text-[11px] text-white/50 font-mono mt-3">Target Date: ${escapeHTML(formattedDate)} • Asia/Kolkata (IST)</p>
        </div>

        <div class="p-4 rounded-2xl bg-white/5 border border-white/10 max-w-sm text-xs text-white/70">
          💡 Keep this link saved! When midnight strikes, this page will open your complete surprise experience automatically without needing a refresh.
        </div>
      </section>
    `;

    // Initialize upcoming countdown timer
    setupUpcomingCountdown(eventDate);
  }

  function setupUpcomingCountdown(eventDate) {
    if (!window.WishLifecycle) return;
    const { startMs } = window.WishLifecycle.getSpecialDateBoundaries(eventDate);

    function tick() {
      const { days, hours, minutes, seconds, isDone } = window.WishLifecycle.getCountdownTo(startMs);

      const dEl = document.getElementById('upcoming-clock-days');
      const hEl = document.getElementById('upcoming-clock-hours');
      const mEl = document.getElementById('upcoming-clock-mins');
      const sEl = document.getElementById('upcoming-clock-secs');

      if (dEl) dEl.textContent = days;
      if (hEl) hEl.textContent = hours;
      if (mEl) mEl.textContent = minutes;
      if (sEl) sEl.textContent = seconds;

      if (isDone) {
        // Countdown reached 00:00:00:00! Automatically transition to ACTIVE in real time!
        if (countdownTimerInterval) clearInterval(countdownTimerInterval);
        triggerConfettiBurst(120);
        setTimeout(() => {
          renderWishLifecycleRouter(currentWishData, currentTemplate);
        }, 1000);
      }
    }

    tick();
    countdownTimerInterval = setInterval(tick, 1000);
  }

  // ---------------------------------------------------------------------------
  // 5. EXPIRED EXPERIENCE (Part 7)
  // ---------------------------------------------------------------------------
  function renderExpiredExperience(customData, template, eventDate) {
    const recipient = customData.recipient_name || customData.recipientName || 'Someone Special';
    const formattedDate = window.WishLifecycle ? window.WishLifecycle.formatISTDate(eventDate) : eventDate;

    // Hide soundtrack pill during expired state
    const musicPill = document.getElementById('floating-music-pill');
    if (musicPill) musicPill.classList.add('hidden');

    document.title = `🌙 Wish Ended for ${recipient} | WishMagic`;

    const storyFlow = document.getElementById('wish-story-flow');
    if (!storyFlow) return;

    storyFlow.innerHTML = `
      <section class="w-full max-w-xl px-4 sm:px-6 py-16 flex flex-col items-center text-center my-auto">
        <!-- Occasion Pill -->
        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-950/60 border border-rose-500/40 text-xs font-semibold text-rose-300 mb-6 backdrop-blur-xl shadow-xl">
          <span>🌙 Celebration Concluded</span>
          <span class="text-rose-400">✦</span>
          <span>Celebrated on ${escapeHTML(formattedDate)}</span>
        </div>

        <!-- Centerpiece Starlight Icon -->
        <div class="relative w-28 h-28 mb-6 flex items-center justify-center">
          <div class="absolute inset-0 rounded-full bg-rose-600/20 blur-2xl"></div>
          <div class="relative w-24 h-24 rounded-full bg-white/10 backdrop-blur-2xl border border-white/20 shadow-2xl flex items-center justify-center text-5xl">
            ✨
          </div>
        </div>

        <!-- Headline -->
        <h1 class="text-3xl sm:text-4xl md:text-5xl font-black font-display tracking-tight text-white mb-3">
          This Wish Has Ended
        </h1>

        <p class="text-sm sm:text-base text-purple-200/85 max-w-md mx-auto mb-6 font-medium leading-relaxed">
          Some moments are meant to be remembered forever. This special wish was available for <strong class="text-pink-300">${escapeHTML(recipient)}</strong> on <strong class="text-white">${escapeHTML(formattedDate)}</strong> and has completed its celebration period.
        </p>

        <div class="p-6 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/15 max-w-md text-xs text-white/70 space-y-2 mb-8">
          <p class="font-serifAccent italic text-sm text-pink-200">"Memories made with love shine brightest in the heart."</p>
          <p class="text-[11px] text-white/50">Private media and greetings are safely locked to preserve intimacy and privacy.</p>
        </div>

        <a href="/" class="px-6 py-3 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-bold transition shadow-lg">
          Create a New Wish For Someone Special ✨
        </a>
      </section>
    `;
  }

  // ---------------------------------------------------------------------------
  // 6. ACTIVE IMMERSIVE EXPERIENCE (Part 6 & 7)
  // ---------------------------------------------------------------------------
  function renderActiveWishStoryExperience(customData, template, eventDate, isCreatorPreview) {
    // Part 12 & 13: Content & Section Normalization Layer
    let normalized = customData;
    if (window.WishContentNormalizer && typeof window.WishContentNormalizer.normalizeWishContent === 'function') {
      normalized = window.WishContentNormalizer.normalizeWishContent(customData, template);
    }

    let mediaState = null;
    if (window.WishMediaSystem && typeof window.WishMediaSystem.normalizeMediaState === 'function') {
      mediaState = window.WishMediaSystem.normalizeMediaState(normalized);
    } else {
      mediaState = {
        coverPhoto: normalized.cover_photo || (normalized.photos && normalized.photos[0] ? normalized.photos[0].url : null),
        photos: normalized.photos || [],
        music: normalized.music || { enabled: true, name: 'Celebration Soundtrack' },
        voiceNote: normalized.voice_note || { enabled: false },
        galleryLayout: normalized.galleryLayout || 'grid'
      };
    }

    const recipientName = normalized.recipient_name || normalized.recipientName || 'Someone Special';
    const senderName = normalized.sender_name || normalized.senderName || 'A Cherished Friend';
    const message = normalized.custom_message || normalized.customMessage || 'May your day sparkle with joy!';

    // Update dynamic title
    document.title = `${recipientName}'s Celebration ✨ A Special Gift from ${senderName}`;

    // Background soundtrack initialization
    setupSoundtrackAudio(mediaState.music);

    const storyFlow = document.getElementById('wish-story-flow');
    if (!storyFlow) return;
    storyFlow.innerHTML = '';

    // Determine section list & order
    const orderedSections = getOrderedSections(normalized, template);

    orderedSections.forEach((sec) => {
      if (!sec.enabled) return;

      const secWrapper = document.createElement('section');
      secWrapper.id = `section-${sec.id}`;
      secWrapper.className = 'w-full max-w-2xl px-4 sm:px-6 py-6 sm:py-8 flex flex-col items-center transition-all duration-500';

      switch (sec.id) {
        case 'hero':
          secWrapper.innerHTML = buildHeroSectionHTML(normalized, template, mediaState);
          break;
        case 'message':
        case 'special_message':
          secWrapper.innerHTML = buildMessageSectionHTML(normalized, recipientName, senderName, message);
          break;
        case 'gallery':
        case 'photo_gallery':
          secWrapper.innerHTML = buildGallerySectionHTML(mediaState, sec.layout || normalized.gallery_layout || 'polaroid');
          break;
        case 'memories':
          if (mediaState.photos && mediaState.photos.length > 0) {
            secWrapper.innerHTML = buildMemoriesSectionHTML(mediaState);
          } else {
            return;
          }
          break;
        case 'voice':
        case 'voice_note':
          if (mediaState.voiceNote && mediaState.voiceNote.enabled && (mediaState.voiceNote.src || mediaState.voiceNote.url)) {
            secWrapper.innerHTML = buildVoiceNoteSectionHTML(mediaState.voiceNote, senderName);
          } else {
            return;
          }
          break;
        case 'countdown':
          if (eventDate) {
            secWrapper.innerHTML = buildCountdownSectionHTML(eventDate, recipientName);
          } else {
            return;
          }
          break;
        case 'timeline':
          if (normalized.timeline && Array.isArray(normalized.timeline) && normalized.timeline.length > 0) {
            secWrapper.innerHTML = buildTimelineSectionHTML(normalized.timeline);
          } else {
            return;
          }
          break;
        case 'open_when':
          if (normalized.open_when_cards && Array.isArray(normalized.open_when_cards) && normalized.open_when_cards.length > 0) {
            secWrapper.innerHTML = buildOpenWhenSectionHTML(normalized.open_when_cards, senderName);
          } else {
            return;
          }
          break;
        case 'secret_message':
          if (normalized.secret_message && (normalized.secret_message.secretText || normalized.secret_message.title)) {
            secWrapper.innerHTML = buildSecretMessageSectionHTML(normalized.secret_message, recipientName);
          } else {
            return;
          }
          break;
        case 'finale':
        case 'final_surprise':
          secWrapper.innerHTML = buildFinaleSectionHTML(recipientName, senderName, normalized.finale);
          break;
        default:
          // Part 12: Safe Unknown Section Handling
          if (isCreatorPreview) {
            console.info(`[WishRenderer] Note: Custom section "${sec.id}" rendered using default wrapper`);
          }
          break;
      }

      if (secWrapper.innerHTML && secWrapper.innerHTML.trim().length > 0) {
        storyFlow.appendChild(secWrapper);
      }
    });

    // Initialize Interactive Components
    initInteractiveComponents(customData, eventDate);

    // Initial gentle celebration confetti
    triggerConfettiBurst(60);

    // Schedule Midnight Expiry Transition (Asia/Kolkata boundary)
    if (!isCreatorPreview && eventDate && window.WishLifecycle) {
      const { endMs } = window.WishLifecycle.getSpecialDateBoundaries(eventDate);
      const nowMs = Date.now();
      const msUntilExpiry = endMs - nowMs;

      if (msUntilExpiry > 0) {
        midnightTransitionTimeout = setTimeout(() => {
          console.log('[WishLifecycle] Midnight crossed in Asia/Kolkata! Transitioning wish to EXPIRED state in real time.');
          renderWishLifecycleRouter(currentWishData, currentTemplate);
        }, msUntilExpiry);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 7. THEME ENGINE BRIDGE
  // ---------------------------------------------------------------------------
  function applyRecipientTheme(customData) {
    if (window.WishThemeEngine) {
      let themeConfig = customData.themeConfig || customData.theme || 'magical';
      if (typeof themeConfig === 'string' && window.WishThemeEngine.presets[themeConfig]) {
        themeConfig = JSON.parse(JSON.stringify(window.WishThemeEngine.presets[themeConfig]));
      } else if (typeof themeConfig === 'object') {
        themeConfig = JSON.parse(JSON.stringify(themeConfig));
      } else {
        themeConfig = JSON.parse(JSON.stringify(window.WishThemeEngine.presets.magical));
      }

      if (customData.colors) themeConfig.colors = { ...themeConfig.colors, ...customData.colors };
      if (customData.typography) themeConfig.typography = { ...themeConfig.typography, ...customData.typography };
      if (customData.surfaces) themeConfig.surfaces = { ...themeConfig.surfaces, ...customData.surfaces };
      if (customData.buttons) themeConfig.buttons = { ...themeConfig.buttons, ...customData.buttons };
      if (customData.effects) themeConfig.effects = { ...themeConfig.effects, ...customData.effects };

      window.WishThemeEngine.applyThemeToDocument(document, themeConfig);
    }
  }

  function getOrderedSections(customData) {
    const defaultSections = [
      { id: 'hero', name: 'Hero Surprise', enabled: true, order: 0 },
      { id: 'message', name: 'Personal Letter', enabled: true, order: 1 },
      { id: 'gallery', name: 'Photo Gallery', enabled: true, order: 2 },
      { id: 'memories', name: 'Cherished Memories', enabled: true, order: 3 },
      { id: 'voice', name: 'Voice Dedication', enabled: true, order: 4 },
      { id: 'countdown', name: 'Celebration Countdown', enabled: true, order: 5 },
      { id: 'finale', name: 'Celebration Finale', enabled: true, order: 6 }
    ];

    if (!customData.sections || !Array.isArray(customData.sections) || customData.sections.length === 0) {
      return defaultSections;
    }

    const map = new Map();
    defaultSections.forEach(s => map.set(s.id, { ...s }));

    customData.sections.forEach(s => {
      if (map.has(s.id)) {
        map.set(s.id, {
          ...map.get(s.id),
          enabled: s.enabled !== false,
          order: typeof s.order === 'number' ? s.order : map.get(s.id).order
        });
      } else {
        map.set(s.id, {
          id: s.id,
          name: s.name || s.id,
          enabled: s.enabled !== false,
          order: typeof s.order === 'number' ? s.order : 99
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }

  // ---------------------------------------------------------------------------
  // 8. SECTION BUILDERS (HERO, MESSAGE, GALLERY, MEMORIES, VOICE, COUNTDOWN, FINALE)
  // ---------------------------------------------------------------------------

  function buildHeroSectionHTML(customData, template, mediaState) {
    const templateId = (template && template.id) || customData.templateId || 'tpl_glitter_birthday';
    const recipient = customData.recipient_name || customData.recipientName || 'Special Person';
    const eventDate = customData.event_date || customData.eventDate || 'Today';
    const formattedDate = window.WishLifecycle ? window.WishLifecycle.formatISTDate(eventDate) : eventDate;
    const coverPhoto = mediaState.coverPhoto || '/assets/file_ab2082.png';

    // A: Glitter Birthday Bash (3D Interactive Floating Cake & Candle Blow)
    if (templateId === 'tpl_glitter_birthday' || templateId.includes('birthday')) {
      return `
        <div class="w-full flex flex-col items-center text-center pt-4 sm:pt-8">
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-xs font-semibold text-pink-300 mb-6 shadow-xl animate-bounce-soft">
            <span>🎂 Birthday Celebration</span>
            <span class="text-amber-300">✦</span>
            <span>${escapeHTML(formattedDate)}</span>
          </div>

          <h1 class="text-4xl sm:text-5xl md:text-6xl font-black font-display tracking-tight leading-tight text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-purple-200 to-amber-200 mb-3">
            Happy Birthday,<br/>
            <span class="text-pink-400 font-serifAccent italic">${escapeHTML(recipient)}</span>! ✨
          </h1>

          <p class="text-sm sm:text-base text-purple-200/90 max-w-md mx-auto mb-6 font-medium leading-relaxed">
            A universe of wishes, joy, and sparkling dreams unfolds specially for you today.
          </p>

          <div class="relative w-64 h-64 sm:w-72 sm:h-72 my-4 flex items-center justify-center cursor-pointer group" id="cake-interactive-box" onclick="WishRenderer.blowCandle()">
            <div class="absolute inset-0 rounded-full bg-gradient-to-tr from-pink-500/25 to-amber-400/25 blur-3xl group-hover:scale-110 transition duration-500"></div>

            <div class="relative z-10 p-6 rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/20 shadow-2xl flex flex-col items-center animate-float-cake group-hover:scale-105 transition-transform duration-300">
              <div class="relative mb-2" id="candle-flame-box">
                <div class="w-4 h-7 rounded-full bg-gradient-to-t from-amber-500 via-yellow-300 to-white candle-flame shadow-lg"></div>
                <div class="w-1 h-3 bg-neutral-300 mx-auto rounded-b"></div>
              </div>

              <div class="text-6xl sm:text-7xl mb-2 filter drop-shadow-[0_12px_24px_rgba(236,72,153,0.5)]">
                🎂
              </div>

              <span class="text-xs font-bold uppercase tracking-wider text-pink-300 text-center" id="candle-hint-text">
                Tap Cake to Blow Candle & Make a Wish ✨
              </span>
            </div>
          </div>

          <button onclick="WishRenderer.scrollToNextSection('hero')" class="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 text-white text-xs sm:text-sm font-extrabold shadow-xl hover:scale-105 active:scale-95 transition-all">
            <span>Open Your Surprise</span>
            <span>💖</span>
          </button>
        </div>
      `;
    }

    // B: Romantic Scrapbook & Love Letter (Sealed Wax Envelope Unboxing)
    if (templateId === 'tpl_romantic_scrapbook' || templateId.includes('romance') || templateId.includes('love')) {
      return `
        <div class="w-full flex flex-col items-center text-center pt-4 sm:pt-8">
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-950/60 border border-rose-500/30 text-xs font-semibold text-rose-300 mb-6 shadow-xl backdrop-blur-md">
            <span>🌹 Sealed With Everlasting Love</span>
            <span class="text-amber-400">✦</span>
            <span>${escapeHTML(formattedDate)}</span>
          </div>

          <div id="sealed-envelope-block" class="w-full flex flex-col items-center transition-all duration-500">
            <div class="relative w-44 h-44 my-4 cursor-pointer group" onclick="WishRenderer.openEnvelope()">
              <div class="w-44 h-44 rounded-full bg-rose-500/15 border-2 border-rose-400/40 flex items-center justify-center text-7xl shadow-2xl group-hover:scale-105 transition-transform duration-300">
                💌
              </div>
              <div class="absolute bottom-2 right-4 w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-amber-950 flex items-center justify-center text-lg font-black shadow-xl border-2 border-rose-950 animate-bounce">
                ✨
              </div>
            </div>

            <h1 class="text-3xl sm:text-4xl md:text-5xl font-serifAccent font-bold italic text-rose-200 mb-2">
              A Letter For <span class="text-rose-400">${escapeHTML(recipient)}</span>
            </h1>
            <p class="text-xs sm:text-sm text-rose-300/80 max-w-sm mb-6 leading-relaxed">
              Every heartbeat carries a quiet song meant only for you.
            </p>

            <button onclick="WishRenderer.openEnvelope()" class="px-8 py-3.5 rounded-full bg-gradient-to-r from-rose-500 via-pink-600 to-amber-500 text-white text-xs sm:text-sm font-bold shadow-xl shadow-rose-900/40 hover:scale-105 active:scale-95 transition-all">
              Break The Wax Seal & Read Letter 💖
            </button>
          </div>
        </div>
      `;
    }

    // C: Midnight Celebration Countdown (Fireworks Launcher)
    if (templateId === 'tpl_midnight_countdown' || templateId.includes('countdown')) {
      return `
        <div class="w-full flex flex-col items-center text-center pt-4 sm:pt-8">
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-950/70 border border-cyan-400/30 text-xs font-semibold text-cyan-300 mb-6 backdrop-blur-md">
            <span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span>Celebration Sky</span>
            <span class="text-cyan-400">✦</span>
            <span>${escapeHTML(formattedDate)}</span>
          </div>

          <h1 class="text-4xl sm:text-5xl font-black font-display text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-indigo-200 to-pink-300 mb-3 tracking-tight">
            Celebrate With <span class="text-cyan-400">${escapeHTML(recipient)}</span>! 🎆
          </h1>

          <p class="text-xs sm:text-sm text-cyan-200/80 max-w-sm mx-auto mb-8 font-medium">
            A universe of heartfelt wishes and fireworks sparks specially for you today.
          </p>

          <div class="flex items-center gap-3 mb-6">
            <button onclick="WishRenderer.launchFireworks()" class="px-6 py-3 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white text-xs sm:text-sm font-extrabold shadow-xl hover:scale-105 active:scale-95 transition flex items-center gap-2">
              <span class="text-lg">🎆</span>
              <span>Launch Celebration Fireworks</span>
            </button>
          </div>

          <button onclick="WishRenderer.scrollToNextSection('hero')" class="inline-flex items-center gap-2 text-xs font-bold text-cyan-300/80 hover:text-cyan-200">
            <span>Read Special Dedication</span>
            <span>↓</span>
          </button>
        </div>
      `;
    }

    // D: Forever Friends Funhouse
    if (templateId === 'tpl_friendship_chronicles' || templateId.includes('friend')) {
      return `
        <div class="w-full flex flex-col items-center text-center pt-4 sm:pt-8">
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-900/60 border border-purple-400/30 text-xs font-semibold text-purple-200 mb-6 backdrop-blur-md">
            <span>🎈 Certified Bestie Celebration</span>
            <span class="text-pink-400">✦</span>
            <span>${escapeHTML(formattedDate)}</span>
          </div>

          <h1 class="text-4xl sm:text-5xl font-black font-display text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-purple-200 to-amber-200 mb-3 tracking-tight">
            Cheers to <span class="text-pink-400">${escapeHTML(recipient)}</span>! 🍕
          </h1>

          <p class="text-xs sm:text-sm text-purple-200/90 max-w-md mx-auto mb-6 font-medium">
            From late-night banter to unforgettable adventures — here's celebrating the realest friend in the universe!
          </p>

          <div class="relative w-64 h-64 sm:w-72 sm:h-72 mx-auto my-4 cursor-pointer group" onclick="WishRenderer.triggerConfettiBurst(80)">
            <div class="absolute inset-0 bg-white/10 rounded-3xl border border-white/20 transform rotate-6 shadow-xl"></div>
            <div class="relative z-10 w-full h-full bg-white text-purple-950 p-4 rounded-3xl shadow-2xl flex flex-col justify-between transform -rotate-2 group-hover:rotate-0 transition duration-300">
              <div class="w-full h-44 rounded-2xl overflow-hidden bg-purple-100">
                <img src="${coverPhoto}" alt="${escapeHTML(recipient)}" class="w-full h-full object-cover"/>
              </div>
              <div class="text-center font-display font-bold text-xs text-purple-800 tracking-wide mt-2">
                Partner in Crime Forever ✨ (Tap for Confetti!)
              </div>
            </div>
          </div>

          <button onclick="WishRenderer.scrollToNextSection('hero')" class="mt-4 px-6 py-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition">
            See Your Surprises ↓
          </button>
        </div>
      `;
    }

    // E: Golden Jubilee & Milestone
    if (templateId === 'tpl_golden_anniversary' || templateId.includes('anniversary') || templateId.includes('gold')) {
      return `
        <div class="w-full flex flex-col items-center text-center pt-4 sm:pt-8">
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-950/60 border border-amber-400/30 text-xs font-semibold text-amber-300 mb-6 shadow-xl backdrop-blur-md">
            <span>👑 Golden Jubilee Keepsake</span>
            <span class="text-amber-400">✦</span>
            <span>${escapeHTML(formattedDate)}</span>
          </div>

          <h1 class="text-3xl sm:text-4xl md:text-5xl font-serifAccent font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 mb-3 tracking-tight">
            Honoring <span class="text-amber-400">${escapeHTML(recipient)}</span> 👑
          </h1>

          <p class="text-xs sm:text-sm text-amber-200/80 max-w-md mx-auto mb-6 font-medium leading-relaxed">
            A celebration of endless devotion, gentle wisdom, and beautiful memories that blossom across years.
          </p>

          <div class="p-4 rounded-3xl bg-amber-950/40 backdrop-blur-xl border-2 border-amber-400/40 shadow-2xl max-w-sm mx-auto mb-6">
            <div class="aspect-[4/3] rounded-2xl overflow-hidden bg-black/50 mb-3 border border-amber-500/30">
              <img src="${coverPhoto}" alt="${escapeHTML(recipient)}" class="w-full h-full object-cover"/>
            </div>
            <div class="text-xs font-serifAccent italic text-amber-200 text-center">
              ✦ A Lifetime of Beautiful Moments ✦
            </div>
          </div>

          <button onclick="WishRenderer.scrollToNextSection('hero')" class="px-6 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-amber-950 text-xs font-bold shadow-lg hover:scale-105 active:scale-95 transition">
            Read Golden Tribute ↓
          </button>
        </div>
      `;
    }

    // F: Dearest Parents Tribute
    if (templateId === 'tpl_parents_tribute' || templateId.includes('parent') || templateId.includes('tribute')) {
      return `
        <div class="w-full flex flex-col items-center text-center pt-4 sm:pt-8">
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-950/60 border border-rose-400/30 text-xs font-semibold text-rose-300 mb-6 shadow-xl backdrop-blur-md">
            <span>🌸 Heartfelt Tribute & Blessing</span>
            <span class="text-amber-400">✦</span>
            <span>${escapeHTML(formattedDate)}</span>
          </div>

          <h1 class="text-3xl sm:text-4xl md:text-5xl font-serifAccent font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-200 via-pink-100 to-amber-200 mb-3 tracking-tight">
            Dearest <span class="text-rose-400">${escapeHTML(recipient)}</span> 🌸
          </h1>

          <p class="text-xs sm:text-sm text-rose-200/80 max-w-md mx-auto mb-6 font-medium leading-relaxed">
            For all the quiet sacrifices, unconditional warmth, and love that sheltered us through every storm.
          </p>

          <div class="p-4 rounded-3xl bg-white/10 backdrop-blur-xl border border-rose-300/30 shadow-2xl max-w-sm mx-auto mb-6">
            <div class="aspect-[4/3] rounded-2xl overflow-hidden bg-black/40 mb-3 border border-rose-400/20">
              <img src="${coverPhoto}" alt="${escapeHTML(recipient)}" class="w-full h-full object-cover"/>
            </div>
            <div class="text-xs font-serifAccent italic text-rose-200 text-center">
              ✦ Wrapped In Gratitude & Everlasting Love ✦
            </div>
          </div>

          <button onclick="WishRenderer.scrollToNextSection('hero')" class="px-6 py-2.5 rounded-full bg-gradient-to-r from-rose-500 to-pink-600 text-white text-xs font-bold shadow-lg hover:scale-105 active:scale-95 transition">
            Read Loving Tribute ↓
          </button>
        </div>
      `;
    }

    // G: Universal Default Hero
    return `
      <div class="w-full flex flex-col items-center text-center pt-4 sm:pt-8">
        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-xs font-semibold text-pink-300 mb-6 shadow-xl">
          <span>✨ Special Celebration</span>
          <span class="text-amber-400">✦</span>
          <span>${escapeHTML(formattedDate)}</span>
        </div>

        <h1 class="text-4xl sm:text-5xl font-black font-display tracking-tight text-white mb-3">
          For Someone Special: <span class="text-pink-400">${escapeHTML(recipient)}</span>
        </h1>

        <div class="w-48 h-48 sm:w-56 sm:h-56 rounded-3xl overflow-hidden border-2 border-white/20 shadow-2xl my-4">
          <img src="${coverPhoto}" alt="${escapeHTML(recipient)}" class="w-full h-full object-cover"/>
        </div>

        <button onclick="WishRenderer.scrollToNextSection('hero')" class="mt-4 px-6 py-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs sm:text-sm font-extrabold shadow-xl hover:scale-105 active:scale-95 transition">
          Open Your Surprise 💖
        </button>
      </div>
    `;
  }

  function buildMessageSectionHTML(customData, recipient, sender, message) {
    const formattedMessage = message || 'Wishing you the happiest celebration filled with laughter, boundless joy, and unforgettable moments!';

    return `
      <div class="w-full rounded-3xl bg-white/10 dark:bg-neutral-900/60 backdrop-blur-2xl p-6 sm:p-8 border border-white/20 shadow-2xl text-left relative overflow-hidden">
        <div class="absolute -right-10 -bottom-10 w-40 h-40 rounded-full bg-pink-500/20 blur-2xl pointer-events-none"></div>

        <div class="flex items-center justify-between border-b border-white/15 pb-3 mb-5">
          <div class="flex items-center gap-2">
            <span class="text-pink-400 text-lg">💌</span>
            <span class="text-xs font-bold uppercase tracking-wider text-pink-300">Personal Dedication</span>
          </div>
          <span class="text-[11px] text-white/50 font-mono">Special Message</span>
        </div>

        <h3 class="text-xl sm:text-2xl font-serifAccent font-bold italic text-white mb-4">
          Dear <span class="text-pink-300">${escapeHTML(recipient)}</span>,
        </h3>

        <div class="text-sm sm:text-base text-white/90 leading-relaxed font-sans font-normal whitespace-pre-line mb-6 pl-1">
          ${escapeHTML(formattedMessage)}
        </div>

        <div class="pt-4 border-t border-white/15 flex items-center justify-between text-xs sm:text-sm">
          <span class="text-purple-300/80 font-serifAccent italic">Always with warm affection,</span>
          <span class="font-extrabold text-white tracking-wide">— ${escapeHTML(sender)}</span>
        </div>
      </div>
    `;
  }

  function buildGallerySectionHTML(mediaState) {
    const photos = mediaState.photos || [];
    if (photos.length === 0) return '';

    const layout = mediaState.galleryLayout || 'grid';

    return `
      <div class="w-full flex flex-col items-center">
        <div class="flex items-center justify-between w-full mb-4 px-2">
          <div class="flex items-center gap-2">
            <span class="text-xl">📸</span>
            <div>
              <h3 class="text-base font-bold text-white">Time-Capsule Keepsake Gallery</h3>
              <p class="text-[11px] text-purple-300">${photos.length} Cherished Photos • Tap to View Fullscreen</p>
            </div>
          </div>
        </div>

        <div class="w-full">
          ${renderGalleryLayoutContent(photos, layout)}
        </div>
      </div>
    `;
  }

  function renderGalleryLayoutContent(photos, layout) {
    if (layout === 'polaroid') {
      return `
        <div class="flex flex-wrap items-center justify-center gap-4 py-2">
          ${photos.map((p, idx) => {
            const tilt = (idx % 2 === 0 ? -1 : 1) * ((idx % 3) + 2);
            return `
              <div onclick="WishRenderer.openLightbox(${idx})" class="relative p-2.5 pb-6 bg-white rounded-sm shadow-2xl transition-all duration-300 hover:scale-105 hover:z-20 cursor-pointer text-neutral-900 group" style="transform: rotate(${tilt}deg); width: 140px;">
                <div class="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-3 bg-amber-200/80 border border-amber-300/50 shadow-xs" style="transform: rotate(${-tilt * 1.5}deg);"></div>
                <div class="aspect-square w-full overflow-hidden bg-neutral-900 rounded-xs mb-1.5">
                  <img src="${p.src || p.url}" alt="${escapeHTML(p.name || 'Memory')}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"/>
                </div>
                <p class="text-[9px] font-mono text-center truncate px-1 font-bold text-neutral-800">${escapeHTML(p.name || `#0${idx + 1}`)}</p>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    if (layout === 'carousel') {
      return `
        <div class="relative overflow-hidden rounded-3xl bg-black/40 backdrop-blur-xl border border-white/20 p-3 shadow-2xl">
          <div class="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin snap-x snap-mandatory">
            ${photos.map((p, idx) => `
              <div onclick="WishRenderer.openLightbox(${idx})" class="snap-center flex-shrink-0 w-44 sm:w-52 aspect-[3/4] rounded-2xl overflow-hidden relative group border border-white/10 cursor-pointer">
                <img src="${p.src || p.url}" alt="${escapeHTML(p.name || 'Memory')}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"/>
                <div class="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/80 to-transparent">
                  <span class="text-[10px] text-white font-bold block truncate">${escapeHTML(p.name || `Memory #${idx + 1}`)}</span>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="text-center mt-1">
            <span class="text-[10px] text-white/50">Swipe horizontally ↔ to browse memories</span>
          </div>
        </div>
      `;
    }

    if (layout === 'masonry') {
      return `
        <div class="columns-2 sm:columns-3 gap-3 space-y-3">
          ${photos.map((p, idx) => {
            const aspectClass = idx % 3 === 0 ? 'aspect-[3/4]' : (idx % 2 === 0 ? 'aspect-square' : 'aspect-[4/5]');
            return `
              <div onclick="WishRenderer.openLightbox(${idx})" class="break-inside-avoid relative rounded-2xl overflow-hidden border border-white/20 group cursor-pointer shadow-xl ${aspectClass}">
                <img src="${p.src || p.url}" alt="${escapeHTML(p.name || 'Memory')}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"/>
                <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5">
                  <span class="text-[10px] font-bold text-white truncate">${escapeHTML(p.name || `Memory #${idx + 1}`)}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // Default: Responsive Grid
    return `
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        ${photos.map((p, idx) => `
          <div onclick="WishRenderer.openLightbox(${idx})" class="group relative aspect-square rounded-2xl overflow-hidden border border-white/20 bg-neutral-950 cursor-pointer shadow-xl" title="Click to view full photo">
            <img src="${p.src || p.url}" alt="${escapeHTML(p.name || 'Memory')}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"/>
            <div class="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between">
              <span class="text-[10px] text-white/80 font-mono font-bold">#0${idx + 1}</span>
              ${p.isCover ? `<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-400 text-black">Cover</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function buildMemoriesSectionHTML(mediaState) {
    const photos = mediaState.photos || [];
    if (photos.length === 0) return '';

    return `
      <div class="w-full flex flex-col items-center">
        <div class="text-center mb-6">
          <span class="text-xs uppercase font-extrabold tracking-widest text-amber-300">Golden Keepsakes</span>
          <h3 class="text-xl sm:text-2xl font-bold font-display text-white mt-1">Cherished Moments</h3>
        </div>

        <div class="w-full space-y-4">
          ${photos.slice(0, 4).map((p, idx) => `
            <div class="flex items-center gap-4 p-3.5 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/15 shadow-xl hover:bg-white/15 transition">
              <div onclick="WishRenderer.openLightbox(${idx})" class="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden flex-shrink-0 border border-white/20 cursor-pointer">
                <img src="${p.src || p.url}" alt="${escapeHTML(p.name || 'Memory')}" class="w-full h-full object-cover"/>
              </div>
              <div class="flex-1 min-w-0 text-left">
                <span class="text-[10px] font-mono uppercase text-pink-300 font-bold">Memory #0${idx + 1}</span>
                <h4 class="text-sm sm:text-base font-bold text-white truncate mt-0.5">${escapeHTML(p.name || `Special Moment ${idx + 1}`)}</h4>
                <p class="text-xs text-white/70 line-clamp-2 mt-1">${escapeHTML(p.caption || 'A treasured second frozen forever in warmth and joy.')}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function buildVoiceNoteSectionHTML(voiceNote, sender) {
    const audioUrl = voiceNote.src || voiceNote.url || '';

    return `
      <div class="w-full rounded-3xl bg-gradient-to-br from-pink-950/40 via-purple-950/40 to-neutral-900/60 backdrop-blur-2xl p-6 border border-pink-500/30 shadow-2xl relative overflow-hidden">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="flex items-center gap-4 w-full sm:w-auto">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-2xl shadow-lg shadow-pink-500/30 flex-shrink-0">
              🎙️
            </div>
            <div class="text-left min-w-0">
              <span class="text-[10px] font-bold uppercase tracking-wider text-pink-300">Spoken Heartfelt Message</span>
              <h4 class="text-base font-bold text-white truncate">Voice Note From ${escapeHTML(sender)}</h4>
              <p class="text-xs text-white/60">Turn up your device volume for best listening 🎧</p>
            </div>
          </div>

          <div class="flex items-center gap-3 w-full sm:w-auto justify-end">
            <div id="voice-waveform" class="flex items-end gap-0.5 h-6 w-20">
              <span class="w-1 bg-pink-400 rounded-full h-2"></span>
              <span class="w-1 bg-purple-400 rounded-full h-4"></span>
              <span class="w-1 bg-pink-300 rounded-full h-5"></span>
              <span class="w-1 bg-purple-300 rounded-full h-3"></span>
              <span class="w-1 bg-amber-300 rounded-full h-6"></span>
              <span class="w-1 bg-pink-400 rounded-full h-4"></span>
              <span class="w-1 bg-purple-400 rounded-full h-2"></span>
            </div>

            <button id="btn-play-voice-note" onclick="WishRenderer.toggleVoiceNotePlayback('${escapeHTML(audioUrl)}')" class="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-xl hover:scale-105 active:scale-95 transition-all">
              <span id="voice-play-icon" class="material-symbols-outlined text-xl">play_arrow</span>
            </button>
          </div>
        </div>

        <audio id="wish-voice-audio-element" src="${escapeHTML(audioUrl)}" preload="metadata" class="hidden"></audio>
      </div>
    `;
  }

  function buildCountdownSectionHTML(eventDate, recipient) {
    const formattedDate = window.WishLifecycle ? window.WishLifecycle.formatISTDate(eventDate) : eventDate;

    return `
      <div class="w-full rounded-3xl bg-white/10 backdrop-blur-2xl p-6 sm:p-8 border border-white/20 shadow-2xl text-center">
        <span class="text-xs font-bold uppercase tracking-widest text-amber-300">Celebration Day Pulse</span>
        <h3 class="text-xl sm:text-2xl font-bold font-display text-white mt-1 mb-6">
          Special Day Tracker ✨
        </h3>

        <div id="wish-countdown-grid" class="grid grid-cols-4 gap-2 sm:gap-4 max-w-sm mx-auto mb-4">
          <div class="p-3 rounded-2xl bg-black/40 border border-white/15">
            <span id="countdown-days" class="text-2xl sm:text-3xl font-black font-display text-pink-300 block">00</span>
            <span class="text-[9px] uppercase font-bold text-white/60 tracking-wider">Days</span>
          </div>
          <div class="p-3 rounded-2xl bg-black/40 border border-white/15">
            <span id="countdown-hours" class="text-2xl sm:text-3xl font-black font-display text-purple-300 block">00</span>
            <span class="text-[9px] uppercase font-bold text-white/60 tracking-wider">Hours</span>
          </div>
          <div class="p-3 rounded-2xl bg-black/40 border border-white/15">
            <span id="countdown-mins" class="text-2xl sm:text-3xl font-black font-display text-cyan-300 block">00</span>
            <span class="text-[9px] uppercase font-bold text-white/60 tracking-wider">Mins</span>
          </div>
          <div class="p-3 rounded-2xl bg-black/40 border border-white/15">
            <span id="countdown-secs" class="text-2xl sm:text-3xl font-black font-display text-amber-300 block">00</span>
            <span class="text-[9px] uppercase font-bold text-white/60 tracking-wider">Secs</span>
          </div>
        </div>

        <p id="countdown-status-note" class="text-xs text-white/60 font-medium">
          Celebrating on ${escapeHTML(formattedDate)} (Asia/Kolkata)
        </p>
      </div>
    `;
  }

  function buildTimelineSectionHTML(timeline) {
    return `
      <div class="w-full text-center">
        <span class="text-xs uppercase font-extrabold tracking-widest text-pink-300">The Journey Together</span>
        <h3 class="text-xl sm:text-2xl font-bold font-display text-white mt-1 mb-6">Our Story Timeline</h3>

        <div class="relative border-l-2 border-pink-500/40 ml-4 sm:ml-8 space-y-4 text-left pl-6">
          ${timeline.map((item, idx) => `
            <div class="relative group p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition cursor-pointer wm-accordion-item" onclick="WishInteractionEngine.toggleTimelineItem(this)">
              <span class="absolute -left-[31px] top-4 w-4 h-4 rounded-full bg-pink-500 border-2 border-white shadow"></span>
              <div class="flex items-center justify-between gap-2">
                <div>
                  <span class="text-[10px] font-mono uppercase text-amber-300 font-bold">${escapeHTML(item.date || `Milestone ${idx + 1}`)}</span>
                  <h4 class="text-sm sm:text-base font-bold text-white mt-0.5">${escapeHTML(item.title || 'Special Milestone')}</h4>
                </div>
                <button type="button" aria-expanded="false" class="text-xs text-pink-300 group-hover:text-white font-bold px-2 py-1 rounded-lg bg-white/10" aria-label="Toggle details">
                  <span>▼</span>
                </button>
              </div>
              <div class="wm-accordion-content pt-2">
                <p class="text-xs text-white/80 leading-relaxed">${escapeHTML(item.description || '')}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function buildOpenWhenSectionHTML(cards, sender) {
    return `
      <div class="w-full text-center">
        <span class="text-xs uppercase font-extrabold tracking-widest text-amber-300">Surprise Envelopes</span>
        <h3 class="text-xl sm:text-2xl font-bold font-display text-white mt-1 mb-2">"Open When..." Letters</h3>
        <p class="text-xs text-white/70 max-w-md mx-auto mb-6">Tap any envelope below to unseal a handwritten surprise message from ${escapeHTML(sender)}.</p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-left">
          ${cards.map((c, idx) => `
            <div onclick="WishRenderer.openEnvelopeCard('${escapeHTML(c.id || idx)}', '${escapeHTML(c.title)}', '${escapeHTML(c.message)}', '${escapeHTML(c.color || '#ec4899')}', '${escapeHTML(c.image || '')}')" class="group relative p-5 rounded-3xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 hover:border-pink-400/80 shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden" role="button" tabindex="0" aria-label="Open letter: ${escapeHTML(c.title)}">
              <div class="absolute -right-4 -bottom-4 w-16 h-16 rounded-full opacity-20 group-hover:opacity-40 transition-opacity blur-lg" style="background-color: ${escapeHTML(c.color || '#ec4899')};"></div>
              <div class="flex items-center gap-3 mb-2">
                <div class="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shadow-md border border-white/20" style="background: linear-gradient(135deg, ${escapeHTML(c.color || '#ec4899')} 0%, #3b0764 100%);">
                  💌
                </div>
                <span class="text-[10px] font-mono uppercase tracking-wider text-pink-300 font-bold">Envelope #${idx + 1}</span>
              </div>
              <h4 class="text-sm font-bold text-white group-hover:text-pink-200 transition-colors leading-snug">
                ${escapeHTML(c.title || 'Open When You Need Love')}
              </h4>
              <div class="mt-3 flex items-center gap-1 text-[11px] text-amber-300 font-semibold group-hover:translate-x-1 transition-transform">
                <span>Tap to Unseal Letter</span>
                <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function buildSecretMessageSectionHTML(secretConfig, recipient) {
    const title = secretConfig.title || 'A Secret Surprise Just For You 🤫';
    const text = secretConfig.secretText || 'May every wish in your heart come true!';
    const hint = secretConfig.hint || 'Tap the glowing wax seal to reveal!';
    const hasPassword = Boolean(secretConfig.password && secretConfig.password.trim());

    // Configure in-memory secret vault so text is never leaked in plaintext DOM before unlock
    if (window.WishInteractionEngine && typeof window.WishInteractionEngine.configureSecretVault === 'function') {
      window.WishInteractionEngine.configureSecretVault({
        password: secretConfig.password || '',
        secretText: text,
        hint: hint
      });
    }

    return `
      <div class="w-full rounded-3xl bg-gradient-to-br from-purple-950/70 via-indigo-950/60 to-black/80 backdrop-blur-2xl p-6 sm:p-8 border border-purple-500/40 shadow-2xl text-center relative overflow-hidden">
        <div class="relative z-10">
          <span class="text-xs uppercase font-extrabold tracking-widest text-pink-300">Confidential Dedication</span>
          <h3 class="text-xl sm:text-2xl font-bold font-display text-white mt-1 mb-2">${escapeHTML(title)}</h3>
          ${hint ? `<p class="text-xs text-purple-200/70 mb-4 font-medium italic">Hint: "${escapeHTML(hint)}"</p>` : ''}

          <!-- Interactive Vault Area -->
          <div id="wm-secret-vault-box" class="relative max-w-md mx-auto min-h-[140px] rounded-2xl p-6 bg-white/5 border border-purple-400/30 flex items-center justify-center transition-all duration-500">
            <!-- Sealed State -->
            <div id="wm-vault-sealed-state" class="flex flex-col items-center gap-3 w-full py-2">
              <div class="w-16 h-16 rounded-full bg-gradient-to-tr from-rose-500 via-purple-600 to-amber-400 flex items-center justify-center text-3xl shadow-[0_0_25px_rgba(244,63,94,0.6)] animate-pulse">
                🔐
              </div>

              ${hasPassword ? `
                <div class="w-full max-w-xs space-y-2">
                  <div class="flex items-center gap-2">
                    <input type="password" id="wm-vault-pass-input" placeholder="Enter key code..." class="flex-1 px-3 py-2 rounded-xl bg-white/10 border border-purple-300/40 text-xs text-white placeholder-white/40 focus:outline-none focus:border-pink-400 text-center font-mono tracking-widest"/>
                    <button onclick="WishRenderer.attemptVaultPasswordUnlock(document.getElementById('wm-vault-pass-input').value)" class="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition cursor-pointer">
                      Unlock
                    </button>
                  </div>
                  <p id="wm-vault-error-msg" class="text-[11px] text-rose-300 font-bold hidden"></p>
                </div>
              ` : `
                <button onclick="WishRenderer.unlockSecretVaultDirectly()" class="px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition active:scale-95 cursor-pointer shadow-md">
                  Tap to Break Wax Seal & Reveal ✨
                </button>
              `}
            </div>

            <!-- Revealed State -->
            <div id="wm-vault-revealed-state" class="hidden flex flex-col items-center text-center animate-fade-in py-2">
              <span class="text-2xl mb-2">💌</span>
              <p id="wm-vault-secret-content" class="text-sm sm:text-base font-serif font-medium text-pink-100 leading-relaxed italic">
                "${escapeHTML(text)}"
              </p>
              <span class="text-[10px] text-amber-300 uppercase font-mono font-bold mt-3 tracking-wider">
                ✦ Unlocked for ${escapeHTML(recipient)} ✦
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function buildFinaleSectionHTML(recipient, sender, finaleConfig = {}) {
    const title = finaleConfig.title || 'May All Your Wishes Come True!';
    const msg = finaleConfig.message || `Sent with boundless affection from ${sender} for ${recipient}.`;
    const btnText = finaleConfig.buttonText || 'Celebrate Again 🎊';

    return `
      <div class="w-full rounded-3xl bg-gradient-to-tr from-pink-900/40 via-purple-900/40 to-indigo-950/40 backdrop-blur-2xl p-6 sm:p-8 border border-white/20 shadow-2xl text-center flex flex-col items-center">
        <!-- Step 1: One Last Thing... -->
        <div id="wm-finale-step-1" class="flex flex-col items-center w-full">
          <div class="text-4xl sm:text-5xl mb-3 animate-bounce-soft">🎁</div>
          <span class="text-xs uppercase font-extrabold tracking-widest text-amber-300">Before You Go</span>
          <h3 class="text-2xl sm:text-3xl font-black font-display text-white mt-1 mb-3">
            One Last Surprise...
          </h3>
          <p class="text-xs sm:text-sm text-purple-200/80 max-w-md mb-6 leading-relaxed">
            There is one final blessing prepared with love from ${escapeHTML(sender)}.
          </p>
          <button onclick="WishRenderer.advanceFinalSurpriseStep(2)" class="px-8 py-3 rounded-full bg-gradient-to-r from-pink-500 via-purple-600 to-amber-400 text-white text-xs sm:text-sm font-extrabold shadow-xl hover:scale-105 active:scale-95 transition cursor-pointer flex items-center gap-2">
            <span>Unwrap Finale</span>
            <span>✨</span>
          </button>
        </div>

        <!-- Step 2: Emotional Message & Photo Spotlight -->
        <div id="wm-finale-step-2" class="hidden flex flex-col items-center w-full animate-fade-in">
          <div class="text-4xl sm:text-5xl mb-3">💖</div>
          <h3 class="text-2xl sm:text-3xl font-black font-display text-white mb-2">
            ${escapeHTML(title)}
          </h3>
          <p class="text-xs sm:text-sm text-purple-200/90 max-w-md mb-6 leading-relaxed font-serif italic text-base">
            "${escapeHTML(msg)}"
          </p>
          <button onclick="WishRenderer.advanceFinalSurpriseStep(3)" class="px-8 py-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs sm:text-sm font-extrabold shadow-xl hover:scale-105 active:scale-95 transition cursor-pointer flex items-center gap-2">
            <span>Celebrate All Together!</span>
            <span>🎉</span>
          </button>
        </div>

        <!-- Step 3: Full Celebration Climax -->
        <div id="wm-finale-step-3" class="hidden flex flex-col items-center w-full animate-fade-in">
          <div class="text-5xl sm:text-6xl mb-3 animate-bounce">🎊</div>
          <h3 class="text-2xl sm:text-3xl font-black font-display text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-amber-200 to-white mb-2">
            Wishes Showered With Love!
          </h3>
          <p class="text-xs sm:text-sm text-purple-200/80 max-w-md mb-6 leading-relaxed">
            May joy follow you at every step and warmth surround your journey today and always.
          </p>
          <div class="flex items-center gap-3">
            <button onclick="WishRenderer.triggerConfettiBurst(120)" class="px-6 py-3 rounded-full bg-gradient-to-r from-pink-500 via-purple-600 to-amber-400 text-white text-xs sm:text-sm font-extrabold shadow-xl hover:scale-105 active:scale-95 transition flex items-center gap-2 cursor-pointer">
              <span>${escapeHTML(btnText)}</span>
            </button>
            <button onclick="WishRenderer.replaySurprise()" class="px-4 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer" title="Replay from Beginning">
              <span class="material-symbols-outlined text-sm">replay</span>
              <span>Replay</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // 9. INTERACTIVE COMPONENTS & ACTIONS
  // ---------------------------------------------------------------------------
  function initInteractiveComponents(customData, eventDate) {
    if (eventDate) {
      updateActiveCountdownClock(eventDate);
      if (countdownTimerInterval) clearInterval(countdownTimerInterval);
      countdownTimerInterval = setInterval(() => updateActiveCountdownClock(eventDate), 1000);
    }

    const voiceAudio = document.getElementById('wish-voice-audio-element');
    if (voiceAudio) {
      voiceAudio.addEventListener('ended', () => {
        const icon = document.getElementById('voice-play-icon');
        const waveform = document.getElementById('voice-waveform');
        if (icon) icon.textContent = 'play_arrow';
        if (waveform) {
          waveform.querySelectorAll('span').forEach(s => s.classList.remove('animate-pulse'));
        }
      });
    }

    const startAudioOnFirstInteraction = () => {
      if (!isSoundtrackPlaying && currentWishData && currentWishData.music && currentWishData.music.enabled !== false) {
        startSoundtrackPlayback();
      }
      document.removeEventListener('click', startAudioOnFirstInteraction);
      document.removeEventListener('touchstart', startAudioOnFirstInteraction);
    };
    document.addEventListener('click', startAudioOnFirstInteraction, { once: true });
    document.addEventListener('touchstart', startAudioOnFirstInteraction, { once: true });
  }

  function updateActiveCountdownClock(eventDateStr) {
    const daysEl = document.getElementById('countdown-days');
    const hoursEl = document.getElementById('countdown-hours');
    const minsEl = document.getElementById('countdown-mins');
    const secsEl = document.getElementById('countdown-secs');
    const noteEl = document.getElementById('countdown-status-note');

    if (!daysEl || !hoursEl || !minsEl || !secsEl) return;

    if (!window.WishLifecycle) return;
    const { endMs } = window.WishLifecycle.getSpecialDateBoundaries(eventDateStr);
    const { hours, minutes, seconds, isDone } = window.WishLifecycle.getCountdownTo(endMs);

    daysEl.textContent = '00';
    hoursEl.textContent = hours;
    minsEl.textContent = minutes;
    secsEl.textContent = seconds;

    if (noteEl) {
      noteEl.innerHTML = '<span class="text-amber-300 font-bold">🎉 Celebration Active Today! Time left in celebration day (IST):</span>';
    }
  }

  // ---------------------------------------------------------------------------
  // 10. SOUNDTRACK & AUDIO ENGINE
  // ---------------------------------------------------------------------------
  function setupSoundtrackAudio(musicConfig) {
    const pill = document.getElementById('floating-music-pill');
    const label = document.getElementById('soundtrack-label');

    if (!musicConfig || musicConfig.enabled === false) {
      if (pill) pill.classList.add('hidden');
      return;
    }

    if (pill) pill.classList.remove('hidden');
    if (label && musicConfig.name) {
      label.textContent = musicConfig.name;
    }

    attemptAutoplay();
  }

  function attemptAutoplay() {
    startSoundtrackPlayback().catch(() => {
      const label = document.getElementById('soundtrack-label');
      if (label) label.textContent = 'Tap to Play Music 🎵';
    });
  }

  async function startSoundtrackPlayback() {
    const music = currentWishData && (currentWishData.music || (currentWishData.media && currentWishData.media.music));
    const icon = document.getElementById('soundtrack-icon');
    const label = document.getElementById('soundtrack-label');
    const bars = document.getElementById('soundtrack-bars');

    const audioUrl = music && (music.src || music.url);

    if (audioUrl) {
      if (!activeAudioElement) {
        activeAudioElement = new Audio(audioUrl);
        activeAudioElement.loop = true;
        activeAudioElement.volume = 0.5;
      }
      await activeAudioElement.play();
      isSoundtrackPlaying = true;
    } else {
      playSynthMelody();
      isSoundtrackPlaying = true;
    }

    if (icon) icon.textContent = '⏸️';
    if (label) label.textContent = (music && music.name) ? music.name : 'Soundtrack';
    if (bars) {
      bars.classList.remove('hidden');
      bars.classList.add('flex');
    }
  }

  function stopSoundtrackPlayback() {
    if (activeAudioElement) {
      try { activeAudioElement.pause(); } catch (e) {}
    }
    if (webAudioSynth) {
      try { webAudioSynth.close(); } catch (e) {}
      webAudioSynth = null;
    }

    isSoundtrackPlaying = false;
    const icon = document.getElementById('soundtrack-icon');
    const label = document.getElementById('soundtrack-label');
    const bars = document.getElementById('soundtrack-bars');

    if (icon) icon.textContent = '🎵';
    if (label) label.textContent = 'Play Soundtrack';
    if (bars) {
      bars.classList.remove('flex');
      bars.classList.add('hidden');
    }
  }

  function toggleSoundtrackPlayback() {
    if (isSoundtrackPlaying) {
      stopSoundtrackPlayback();
    } else {
      startSoundtrackPlayback().catch(err => console.warn('Playback error:', err));
    }
  }

  function playSynthMelody() {
    if (webAudioSynth) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      webAudioSynth = new AudioCtx();

      const melody = [523.25, 659.25, 783.99, 1046.50, 783.99, 659.25];
      let noteIdx = 0;

      function playNextNote() {
        if (!isSoundtrackPlaying || !webAudioSynth) return;
        const osc = webAudioSynth.createOscillator();
        const gain = webAudioSynth.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(melody[noteIdx % melody.length], webAudioSynth.currentTime);

        gain.gain.setValueAtTime(0.08, webAudioSynth.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, webAudioSynth.currentTime + 0.65);

        osc.connect(gain);
        gain.connect(webAudioSynth.destination);

        osc.start();
        osc.stop(webAudioSynth.currentTime + 0.7);

        noteIdx++;
        setTimeout(playNextNote, 420);
      }

      playNextNote();
    } catch (e) {
      console.warn('Web Audio not allowed:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // 11. INTERACTIVE ACTIONS (BLOW CANDLE, OPEN ENVELOPE, CONFETTI)
  // ---------------------------------------------------------------------------
  function blowCandle() {
    if (candleBlown) return;
    candleBlown = true;

    triggerConfettiBurst(90);

    const flameBox = document.getElementById('candle-flame-box');
    const hintText = document.getElementById('candle-hint-text');

    if (flameBox) flameBox.innerHTML = '<span class="text-xs text-purple-200">💨✨</span>';
    if (hintText) {
      hintText.innerHTML = '🎉 Your Wish Is Granted! May All Dreams Come True!';
      hintText.className = 'text-xs font-black uppercase tracking-wider text-amber-300 text-center animate-pulse';
    }

    if (!isSoundtrackPlaying) {
      startSoundtrackPlayback().catch(() => {});
    }

    setTimeout(() => scrollToNextSection('hero'), 1500);
  }

  function openEnvelope() {
    if (envelopeOpened) return;
    envelopeOpened = true;

    triggerConfettiBurst(100, ['#f43f5e', '#fb7185', '#fde047', '#ffffff']);

    const block = document.getElementById('sealed-envelope-block');
    if (block) {
      block.innerHTML = `
        <div class="p-6 rounded-3xl bg-white/10 backdrop-blur-2xl border border-rose-300/30 shadow-2xl text-center animate-bounce-soft">
          <span class="text-4xl">💌✨</span>
          <h3 class="text-xl font-serifAccent font-bold italic text-rose-200 mt-2 mb-1">Wax Seal Broken & Letter Unfolded</h3>
          <p class="text-xs text-rose-300">Scroll down to read your heartfelt letter below 💖</p>
        </div>
      `;
    }

    if (!isSoundtrackPlaying) {
      startSoundtrackPlayback().catch(() => {});
    }

    setTimeout(() => scrollToNextSection('hero'), 800);
  }

  function launchFireworks() {
    if (typeof confetti === 'function') {
      const end = Date.now() + 2500;
      const colors = ['#06b6d4', '#6366f1', '#ec4899', '#fde047'];

      (function frame() {
        confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0 }, colors });
        confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1 }, colors });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
    }
  }

  function triggerConfettiBurst(particleCount = 80, colors = null) {
    if (typeof confetti === 'function') {
      const config = { particleCount, spread: 75, origin: { y: 0.6 } };
      if (colors) config.colors = colors;
      confetti(config);
    }
  }

  function scrollToNextSection(currentSectionId) {
    const current = document.getElementById(`section-${currentSectionId}`);
    if (current && current.nextElementSibling) {
      current.nextElementSibling.scrollIntoView({ behavior: 'smooth' });
    } else {
      const msgSec = document.getElementById('section-message');
      if (msgSec) msgSec.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function replaySurprise() {
    candleBlown = false;
    envelopeOpened = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    triggerConfettiBurst(60);
  }

  function toggleVoiceNotePlayback(audioUrl) {
    const audio = document.getElementById('wish-voice-audio-element');
    const icon = document.getElementById('voice-play-icon');
    const waveform = document.getElementById('voice-waveform');

    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      if (icon) icon.textContent = 'play_arrow';
      if (waveform) waveform.querySelectorAll('span').forEach(s => s.classList.remove('animate-pulse'));
    } else {
      audio.play().then(() => {
        if (icon) icon.textContent = 'pause';
        if (waveform) waveform.querySelectorAll('span').forEach(s => s.classList.add('animate-pulse'));
      }).catch(err => console.warn('Voice play blocked:', err));
    }
  }

  function openLightbox(photoIndex) {
    const photos = currentWishData.photos || (currentWishData.media && currentWishData.media.photos) || [];
    if (window.WishInteractionEngine && typeof window.WishInteractionEngine.openLightbox === 'function') {
      window.WishInteractionEngine.openLightbox(photos, photoIndex);
    } else if (window.WishMediaSystem && window.WishMediaSystem.lightbox) {
      window.WishMediaSystem.lightbox.open(photos, photoIndex);
    }
  }

  function simulateLifecycleStatus(statusOverride) {
    simulatedStatusOverride = statusOverride;
    renderWishLifecycleRouter(currentWishData, currentTemplate);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function openEnvelopeCard(cardId, title, message, color, image = '') {
    if (window.WishInteractionEngine && typeof window.WishInteractionEngine.openEnvelopeCard === 'function') {
      window.WishInteractionEngine.openEnvelopeCard({ id: cardId, title, message, color, image });
      return;
    }

    let modal = document.getElementById('open-when-letter-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'open-when-letter-modal';
      modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fade-in';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="relative w-full max-w-lg rounded-3xl bg-[#14052b] border border-white/20 p-6 sm:p-8 text-white shadow-2xl overflow-hidden animate-scale-up">
        <div class="absolute -top-16 -right-16 w-36 h-36 rounded-full blur-3xl opacity-40" style="background-color: ${escapeHTML(color || '#ec4899')};"></div>

        <button onclick="WishRenderer.closeEnvelopeModal()" class="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition">
          ✕
        </button>

        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-lg border border-white/20" style="background: linear-gradient(135deg, ${escapeHTML(color || '#ec4899')} 0%, #3b0764 100%);">
            ✉️
          </div>
          <div>
            <span class="text-[10px] uppercase font-mono tracking-widest text-pink-300 font-bold">Unsealed Letter</span>
            <h3 class="text-base sm:text-lg font-bold text-white leading-tight">${escapeHTML(title)}</h3>
          </div>
        </div>

        <div class="p-5 rounded-2xl bg-white/5 border border-white/10 my-4">
          <p class="text-sm sm:text-base font-serif italic text-purple-100 leading-relaxed">
            "${escapeHTML(message)}"
          </p>
        </div>

        <div class="flex justify-end pt-2">
          <button onclick="WishRenderer.closeEnvelopeModal()" class="px-5 py-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition">
            Close Letter 💖
          </button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    triggerConfettiBurst(40);
  }

  function closeEnvelopeModal() {
    const modal = document.getElementById('open-when-letter-modal');
    if (modal) modal.classList.add('hidden');
    if (window.WishInteractionEngine && typeof window.WishInteractionEngine.closeActiveModal === 'function') {
      window.WishInteractionEngine.closeActiveModal();
    }
  }

  function unlockSecretVaultDirectly() {
    if (window.WishInteractionEngine && typeof window.WishInteractionEngine.unlockSecretVaultDirectly === 'function') {
      window.WishInteractionEngine.unlockSecretVaultDirectly();
    } else {
      revealSecretMessage();
    }
  }

  function attemptVaultPasswordUnlock(pwd) {
    if (window.WishInteractionEngine && typeof window.WishInteractionEngine.attemptVaultPasswordUnlock === 'function') {
      window.WishInteractionEngine.attemptVaultPasswordUnlock(pwd);
    }
  }

  function advanceFinalSurpriseStep(step) {
    if (window.WishInteractionEngine && typeof window.WishInteractionEngine.advanceFinalSurpriseStep === 'function') {
      window.WishInteractionEngine.advanceFinalSurpriseStep(step);
    }
  }

  function revealSecretMessage() {
    const sealed = document.getElementById('wm-vault-sealed-state') || document.getElementById('secret-sealed-state');
    const revealed = document.getElementById('wm-vault-revealed-state') || document.getElementById('secret-revealed-state');
    const box = document.getElementById('wm-secret-vault-box') || document.getElementById('secret-message-box');

    if (sealed) sealed.classList.add('hidden');
    if (revealed) revealed.classList.remove('hidden');
    if (box) {
      box.classList.add('border-pink-500', 'bg-pink-950/20', 'shadow-[0_0_30px_rgba(236,72,153,0.3)]');
    }

    triggerConfettiBurst(50);
  }

  // Export to window namespace
  window.WishRenderer = {
    blowCandle,
    openEnvelope,
    openEnvelopeCard,
    closeEnvelopeModal,
    revealSecretMessage,
    unlockSecretVaultDirectly,
    attemptVaultPasswordUnlock,
    advanceFinalSurpriseStep,
    launchFireworks,
    triggerConfettiBurst,
    scrollToNextSection,
    replaySurprise,
    toggleVoiceNotePlayback,
    openLightbox,
    simulateLifecycleStatus
  };

  window.toggleSoundtrackPlayback = toggleSoundtrackPlayback;

})(window);
