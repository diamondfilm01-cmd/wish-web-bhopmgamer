// WishMagic Creator Dashboard Engine
// Part 8: My Wishes Dashboard + Draft Management + Favorites + Real-Time Lifecycle Sync
// Timezone: Asia/Kolkata (IST = UTC+05:30) via WishLifecycle

(function(window) {
  'use strict';

  // State
  let allWishes = [];
  let currentFilter = 'all'; // 'all' | 'active' | 'upcoming' | 'expired' | 'drafts' | 'favorites'
  let currentSearch = '';
  let currentSort = 'recent'; // 'recent' | 'newest' | 'oldest' | 'date' | 'views'
  let favoriteIds = new Set();
  let selectedWishForAction = null;

  // Initialize
  document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await handleAuthSync();
    if (window.WishAuth) {
      window.WishAuth.onAuthStateChange(async () => {
        await handleAuthSync();
      });
    }
  });

  async function handleAuthSync() {
    const user = window.WishAuth ? window.WishAuth.getCurrentUser() : null;
    const barrier = document.getElementById('wishes-auth-barrier');
    const authView = document.getElementById('wishes-authenticated-view');

    if (!user) {
      if (barrier) barrier.classList.remove('hidden');
      if (authView) authView.classList.add('hidden');
      allWishes = [];
      return;
    }

    if (barrier) barrier.classList.add('hidden');
    if (authView) authView.classList.remove('hidden');

    loadFavorites(user.id);
    await fetchWishesAndDrafts(user.id);
    renderDashboard();
  }

  // Load favorites for specific user from repository
  function loadFavorites(userId) {
    if (!userId) {
      favoriteIds = new Set();
      return;
    }
    if (window.WishRepositories) {
      const list = WishRepositories.favoriteRepository.getByUser(userId);
      favoriteIds = new Set(list);
    } else {
      try {
        const stored = JSON.parse(localStorage.getItem(`wishmagic_favorites_${userId}`) || '[]');
        favoriteIds = new Set(Array.isArray(stored) ? stored : []);
      } catch (e) {
        favoriteIds = new Set();
      }
    }
  }

  function saveFavorites(userId) {
    if (!userId) return;
    try {
      localStorage.setItem(`wishmagic_favorites_${userId}`, JSON.stringify(Array.from(favoriteIds)));
    } catch (e) {
      console.warn('Error saving favorites:', e);
    }
  }

  // Fetch wishes and drafts owned by the current user
  async function fetchWishesAndDrafts(userId) {
    if (!userId) {
      allWishes = [];
      return;
    }

    const wishesMap = new Map();

    // 1. Fetch user-scoped published wishes via repository
    if (window.WishRepositories) {
      try {
        const userWishes = await WishRepositories.wishRepository.getByUser(userId);
        userWishes.forEach(w => {
          const status = window.WishLifecycle ? window.WishLifecycle.getWishStatus(w) : (w.lifecycleStatus || 'active');
          wishesMap.set(w.id, {
            ...w,
            status: status,
            isDraft: false,
            favorite: favoriteIds.has(w.id)
          });
        });
      } catch (e) {
        console.warn('[my-wishes] Error loading repository wishes:', e);
      }
    } else {
      // Fallback
      try {
        const res = await fetch('/api/wishes');
        const data = await res.json();
        if (data.success && Array.isArray(data.wishes)) {
          data.wishes.filter(w => w.userId === userId || (!w.userId && userId === 'usr_ankit_101')).forEach(w => {
            const status = window.WishLifecycle ? window.WishLifecycle.getWishStatus(w) : (w.lifecycleStatus || 'active');
            wishesMap.set(w.id, {
              ...w,
              status: status,
              isDraft: false,
              favorite: favoriteIds.has(w.id)
            });
          });
        }
      } catch (err) {}
    }

    // 2. Fetch user-scoped drafts via repository
    if (window.WishRepositories) {
      const userDrafts = WishRepositories.draftRepository.getByUser(userId);
      userDrafts.forEach(d => {
        wishesMap.set(d.id, {
          ...d,
          status: 'draft',
          isDraft: true,
          favorite: favoriteIds.has(d.id)
        });
      });
    } else {
      try {
        const drafts = JSON.parse(localStorage.getItem('wishmagic_drafts') || '[]');
        if (Array.isArray(drafts)) {
          drafts.filter(d => d.userId === userId || (!d.userId && userId === 'usr_ankit_101')).forEach(d => {
            wishesMap.set(d.id, {
              ...d,
              status: 'draft',
              isDraft: true,
              favorite: favoriteIds.has(d.id)
            });
          });
        }
      } catch (e) {}
    }

    // 3. Seed user-specific demo wishes if this user has none yet (ensures test isolation)
    if (wishesMap.size === 0) {
      seedUserSpecificSampleWishes(userId, wishesMap);
    }

    allWishes = Array.from(wishesMap.values());
  }

  // Seed sample wishes partitioned by user identity
  function seedUserSpecificSampleWishes(userId, wishesMap) {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const futureDate = new Date(today.getTime() + 12 * 24 * 60 * 60 * 1000);

    let userSamples = [];

    if (userId === 'usr_ankit_101') {
      userSamples = [
        {
          id: 'sample_ankit_kritika_bday',
          userId: 'usr_ankit_101',
          templateId: 'tpl_glitter_birthday',
          templateName: 'Glitter Birthday Surprise ✨',
          category: 'Birthday',
          tier: 'vip',
          price: 49,
          recipientName: 'Kritika Sharma',
          senderName: 'Ankit Verma',
          eventDate: futureDate.toISOString().split('T')[0],
          coverPhoto: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80',
          createdAt: new Date(today.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(today.getTime() - 15 * 60 * 1000).toISOString(),
          views: 18,
          isDraft: false,
          favorite: true,
          customData: {
            recipient_name: 'Kritika Sharma',
            sender_name: 'Ankit Verma',
            event_date: futureDate.toISOString().split('T')[0],
            custom_message: 'Happy Birthday Kritika! Wishing you an unforgettable day packed with joy and laughter.'
          }
        },
        {
          id: 'sample_ankit_rohit_anniversary',
          userId: 'usr_ankit_101',
          templateId: 'tpl_romantic_love',
          templateName: 'Eternal Love & Romance 💖',
          category: 'Anniversary',
          tier: 'vip',
          price: 49,
          recipientName: 'Rohit & Neha',
          senderName: 'Ankit Verma',
          eventDate: today.toISOString().split('T')[0],
          coverPhoto: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&auto=format&fit=crop&q=80',
          createdAt: new Date(today.getTime() - 10 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(today.getTime() - 30 * 60 * 1000).toISOString(),
          views: 84,
          isDraft: false,
          favorite: true,
          customData: {
            recipient_name: 'Rohit & Neha',
            sender_name: 'Ankit Verma',
            event_date: today.toISOString().split('T')[0],
            custom_message: 'Happy 5th Anniversary! May your love keep growing stronger every passing year.'
          }
        },
        {
          id: 'draft_ankit_parents_tribute',
          userId: 'usr_ankit_101',
          templateId: 'tpl_parents_tribute',
          templateName: 'Heartfelt Parents Tribute 🌸',
          category: 'Parents',
          tier: 'vip',
          price: 49,
          recipientName: 'Mom & Dad',
          senderName: 'Ankit Verma',
          eventDate: futureDate.toISOString().split('T')[0],
          coverPhoto: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=600&auto=format&fit=crop&q=80',
          createdAt: new Date(today.getTime() - 5 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(today.getTime() - 5 * 60 * 60 * 1000).toISOString(),
          views: 0,
          isDraft: true,
          status: 'draft',
          favorite: false,
          customData: {
            recipient_name: 'Mom & Dad',
            sender_name: 'Ankit Verma',
            event_date: futureDate.toISOString().split('T')[0],
            custom_message: 'Thank you for your infinite love and endless sacrifices.'
          }
        }
      ];
    } else if (userId === 'usr_priya_202') {
      userSamples = [
        {
          id: 'sample_priya_sneha_grad',
          userId: 'usr_priya_202',
          templateId: 'tpl_friendship_fun',
          templateName: 'Celebration Confetti Bash 🎊',
          category: 'Friendship',
          tier: 'free',
          price: 0,
          recipientName: 'Sneha Patel',
          senderName: 'Priya Sharma',
          eventDate: yesterday.toISOString().split('T')[0],
          coverPhoto: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop&q=80',
          createdAt: new Date(today.getTime() - 48 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString(),
          views: 142,
          isDraft: false,
          favorite: true,
          customData: {
            recipient_name: 'Sneha Patel',
            sender_name: 'Priya Sharma',
            event_date: yesterday.toISOString().split('T')[0],
            custom_message: 'Huge congratulations on your graduation Sneha! Proud of you always.'
          }
        },
        {
          id: 'draft_priya_romantic_surprise',
          userId: 'usr_priya_202',
          templateId: 'tpl_romantic_love',
          templateName: 'Eternal Love & Romance 💖',
          category: 'Anniversary',
          tier: 'vip',
          price: 49,
          recipientName: 'Kunal',
          senderName: 'Priya Sharma',
          eventDate: futureDate.toISOString().split('T')[0],
          coverPhoto: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&auto=format&fit=crop&q=80',
          createdAt: new Date(today.getTime() - 8 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(today.getTime() - 8 * 60 * 60 * 1000).toISOString(),
          views: 0,
          isDraft: true,
          status: 'draft',
          favorite: false,
          customData: {
            recipient_name: 'Kunal',
            sender_name: 'Priya Sharma',
            event_date: futureDate.toISOString().split('T')[0],
            custom_message: 'To the love of my life, celebrating every precious moment together.'
          }
        }
      ];
    }

    userSamples.forEach(s => {
      const status = s.isDraft ? 'draft' : (window.WishLifecycle ? window.WishLifecycle.getWishStatus(s) : 'active');
      wishesMap.set(s.id, {
        ...s,
        status: status
      });

      // Save to repository
      if (window.WishRepositories) {
        if (s.isDraft) {
          WishRepositories.draftRepository.save(s, userId);
        } else {
          WishRepositories.wishRepository.save(s, userId);
        }
        if (s.favorite) {
          WishRepositories.favoriteRepository.add(userId, s.id);
        }
      }
    });
  }

  // Setup DOM Event Listeners
  function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('search-wishes-input');
    const clearBtn = document.getElementById('search-clear-btn');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.trim().toLowerCase();
        if (clearBtn) {
          if (currentSearch.length > 0) clearBtn.classList.remove('hidden');
          else clearBtn.classList.add('hidden');
        }
        renderDashboard();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        currentSearch = '';
        clearBtn.classList.add('hidden');
        renderDashboard();
      });
    }

    // Sort selector
    const sortSelect = document.getElementById('sort-wishes-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderDashboard();
      });
    }
  }

  // Filter tab switch
  window.setDashboardFilter = function(filterName) {
    currentFilter = filterName;

    // Update active tab buttons
    document.querySelectorAll('.filter-tab-btn').forEach(btn => {
      const tab = btn.getAttribute('data-tab');
      if (tab === filterName) {
        btn.className = 'filter-tab-btn px-4 py-2 rounded-full font-bold text-xs sm:text-sm bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md shadow-pink-500/25 flex items-center gap-2 transition-all cursor-pointer';
      } else {
        btn.className = 'filter-tab-btn px-4 py-2 rounded-full font-semibold text-xs sm:text-sm glass-pill text-purple-900 dark:text-purple-200 hover:text-pink-600 dark:hover:text-pink-300 flex items-center gap-2 transition-all cursor-pointer';
      }
    });

    renderDashboard();
  };

  // Toggle favorite for a wish or draft
  window.toggleFavorite = function(wishId, e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    const user = window.WishAuth ? window.WishAuth.getCurrentUser() : null;
    if (!user) {
      if (window.WishAuth) {
        window.WishAuth.requireAuth({ message: 'Please sign in to favorite your celebrations.' });
      }
      return;
    }

    let isFav = false;
    if (window.WishRepositories) {
      isFav = WishRepositories.favoriteRepository.toggle(user.id, wishId);
    } else {
      if (favoriteIds.has(wishId)) {
        favoriteIds.delete(wishId);
        isFav = false;
      } else {
        favoriteIds.add(wishId);
        isFav = true;
      }
      saveFavorites(user.id);
    }

    if (isFav) {
      favoriteIds.add(wishId);
      showDashboardToast('Added to Favorites ❤️');
    } else {
      favoriteIds.delete(wishId);
      showDashboardToast('Removed from Favorites 💔');
    }

    // Update wish in array
    const target = allWishes.find(w => w.id === wishId);
    if (target) {
      target.favorite = isFav;
    }

    renderDashboard();
  };

  // Main Render Routine
  function renderDashboard() {
    // 1. Recompute lifecycle statuses using Part 7 engine
    allWishes.forEach(w => {
      if (w.isDraft || w.status === 'draft') {
        w.status = 'draft';
      } else if (window.WishLifecycle) {
        w.status = window.WishLifecycle.getWishStatus(w);
      }
      w.favorite = favoriteIds.has(w.id);
    });

    // 2. Compute metrics
    let totalCount = allWishes.length;
    let activeCount = allWishes.filter(w => w.status === 'active').length;
    let upcomingCount = allWishes.filter(w => w.status === 'upcoming').length;
    let expiredCount = allWishes.filter(w => w.status === 'expired').length;
    let draftsCount = allWishes.filter(w => w.status === 'draft').length;
    let favoritesCount = allWishes.filter(w => w.favorite).length;
    let totalViews = allWishes.reduce((sum, w) => sum + (w.views || 0), 0);

    // Update badge counts
    updateBadge('badge-count-all', totalCount);
    updateBadge('badge-count-active', activeCount);
    updateBadge('badge-count-upcoming', upcomingCount);
    updateBadge('badge-count-expired', expiredCount);
    updateBadge('badge-count-drafts', draftsCount);
    updateBadge('badge-count-favorites', favoritesCount);

    // Update hero stats
    updateStatText('stat-total-wishes', totalCount);
    updateStatText('stat-active-wishes', activeCount);
    updateStatText('stat-upcoming-wishes', upcomingCount);
    updateStatText('stat-expired-wishes', expiredCount);
    updateStatText('stat-draft-wishes', draftsCount);
    updateStatText('stat-total-views', totalViews);

    // 3. Filter wishes
    let filtered = allWishes.filter(w => {
      // Tab filter
      if (currentFilter === 'active' && w.status !== 'active') return false;
      if (currentFilter === 'upcoming' && w.status !== 'upcoming') return false;
      if (currentFilter === 'expired' && w.status !== 'expired') return false;
      if (currentFilter === 'drafts' && w.status !== 'draft') return false;
      if (currentFilter === 'favorites' && !w.favorite) return false;

      // Search filter
      if (currentSearch) {
        const query = currentSearch;
        const searchable = [
          w.recipientName || '',
          w.senderName || '',
          w.templateName || '',
          w.category || '',
          w.customData?.custom_message || '',
          w.customData?.recipient_name || '',
          w.customData?.sender_name || '',
          w.customData?.event_title || ''
        ].join(' ').toLowerCase();

        if (!searchable.includes(query)) return false;
      }

      return true;
    });

    // 4. Sort wishes
    filtered.sort((a, b) => {
      if (currentSort === 'newest') {
        const dateA = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const dateB = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return dateB - dateA;
      } else if (currentSort === 'oldest') {
        const dateA = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const dateB = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return dateA - dateB;
      } else if (currentSort === 'date') {
        const dateA = (a.eventDate || a.customData?.event_date || '9999-99-99');
        const dateB = (b.eventDate || b.customData?.event_date || '9999-99-99');
        return dateA.localeCompare(dateB);
      } else if (currentSort === 'views') {
        return (b.views || 0) - (a.views || 0);
      } else {
        // default: 'recent' (updatedAt or createdAt)
        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      }
    });

    // 5. Render Grid
    const container = document.getElementById('wishes-grid-container');
    const emptyState = document.getElementById('wishes-empty-state');
    const resultCountText = document.getElementById('search-results-summary');

    if (resultCountText) {
      if (currentSearch || currentFilter !== 'all') {
        resultCountText.textContent = `Showing ${filtered.length} of ${totalCount} celebration wishes`;
        resultCountText.classList.remove('hidden');
      } else {
        resultCountText.classList.add('hidden');
      }
    }

    if (!container) return;

    if (filtered.length === 0) {
      container.innerHTML = '';
      if (emptyState) {
        emptyState.classList.remove('hidden');
        customizeEmptyState(currentFilter, currentSearch);
      }
    } else {
      if (emptyState) emptyState.classList.add('hidden');
      container.innerHTML = filtered.map(w => buildWishCardHTML(w)).join('');
    }
  }

  function updateBadge(id, count) {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  }

  function updateStatText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // Customize empty state message according to filter
  function customizeEmptyState(filter, search) {
    const iconEl = document.getElementById('empty-state-icon');
    const titleEl = document.getElementById('empty-state-title');
    const descEl = document.getElementById('empty-state-desc');
    const ctaEl = document.getElementById('empty-state-cta');

    if (search) {
      if (iconEl) iconEl.textContent = 'search_off';
      if (titleEl) titleEl.textContent = 'No Matches Found';
      if (descEl) descEl.textContent = `No wishes found matching "${search}". Try checking for typos or searching a different name.`;
      if (ctaEl) {
        ctaEl.textContent = 'Clear Search';
        ctaEl.onclick = () => {
          const input = document.getElementById('search-wishes-input');
          if (input) input.value = '';
          currentSearch = '';
          renderDashboard();
        };
      }
      return;
    }

    if (filter === 'active') {
      if (iconEl) iconEl.textContent = 'celebration';
      if (titleEl) titleEl.textContent = 'No Active Wishes Today';
      if (descEl) descEl.textContent = 'Wishes automatically become ACTIVE on their special calendar date (IST).';
      if (ctaEl) {
        ctaEl.textContent = '+ Create a Wish for Today';
        ctaEl.onclick = () => window.location.href = '/customize.html';
      }
    } else if (filter === 'upcoming') {
      if (iconEl) iconEl.textContent = 'hourglass_top';
      if (titleEl) titleEl.textContent = 'No Upcoming Wishes';
      if (descEl) descEl.textContent = 'Schedule a celebration wish for future birthdays or anniversaries to surprise your loved ones with a live countdown!';
      if (ctaEl) {
        ctaEl.textContent = '+ Schedule Future Wish';
        ctaEl.onclick = () => window.location.href = '/customize.html';
      }
    } else if (filter === 'expired') {
      if (iconEl) iconEl.textContent = 'bedtime';
      if (titleEl) titleEl.textContent = 'No Expired Wishes';
      if (descEl) descEl.textContent = 'Wishes expire at midnight after their special date has ended to keep the moment private and special.';
      if (ctaEl) {
        ctaEl.textContent = '+ Create New Wish';
        ctaEl.onclick = () => window.location.href = '/customize.html';
      }
    } else if (filter === 'drafts') {
      if (iconEl) iconEl.textContent = 'edit_note';
      if (titleEl) titleEl.textContent = 'No Saved Drafts';
      if (descEl) descEl.textContent = 'Start personalizing any template. Your edits will be automatically autosaved right here.';
      if (ctaEl) {
        ctaEl.textContent = '+ Start a New Draft';
        ctaEl.onclick = () => window.location.href = '/customize.html';
      }
    } else if (filter === 'favorites') {
      if (iconEl) iconEl.textContent = 'favorite_border';
      if (titleEl) titleEl.textContent = 'No Favorites Yet';
      if (descEl) descEl.textContent = 'Tap the heart icon on any wish card to bookmark your most memorable celebrations.';
      if (ctaEl) {
        ctaEl.textContent = 'Explore All Wishes';
        ctaEl.onclick = () => window.setDashboardFilter('all');
      }
    } else {
      if (iconEl) iconEl.textContent = 'auto_awesome';
      if (titleEl) titleEl.textContent = 'No Wishes Created Yet';
      if (descEl) descEl.textContent = 'Create your very first personalized 3D celebration website in under 2 minutes!';
      if (ctaEl) {
        ctaEl.textContent = '+ Create Your First Wish ✨';
        ctaEl.onclick = () => window.location.href = '/customize.html';
      }
    }
  }

  // Build Individual Card HTML
  function buildWishCardHTML(w) {
    const isDraft = w.status === 'draft';
    const isUpcoming = w.status === 'upcoming';
    const isActive = w.status === 'active';
    const isExpired = w.status === 'expired';

    const isFav = w.favorite;
    const recipient = w.recipientName || w.customData?.recipient_name || 'Special Person';
    const sender = w.senderName || w.customData?.sender_name || 'Anonymous';
    const templateName = w.templateName || 'Magical Celebration';
    const category = w.category || 'Special Occasion';
    const eventDate = w.eventDate || w.customData?.event_date || '';
    const formattedDate = window.WishLifecycle ? window.WishLifecycle.formatISTDate(eventDate) : (eventDate || 'Special Day');
    const isVip = (window.WishEntitlement && typeof window.WishEntitlement.getWishPlan === 'function')
      ? (window.WishEntitlement.getWishPlan(w) === 'premium')
      : (w.tier === 'vip' || w.tier === 'premium' || (w.price && w.price > 0));
    const coverPhoto = w.coverPhoto || w.customData?.cover_photo || w.customData?.photos?.[0]?.src || 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80';
    const relativeTime = getRelativeTime(w.updatedAt || w.createdAt);
    const views = w.views || 0;

    // Status Badge Configuration
    let statusBadgeHTML = '';
    if (isActive) {
      statusBadgeHTML = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border border-emerald-500/40 shadow-sm">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span>● ACTIVE NOW</span>
        </span>
      `;
    } else if (isUpcoming) {
      statusBadgeHTML = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-indigo-500/20 text-indigo-900 dark:text-indigo-200 border border-indigo-500/40 shadow-sm">
          <span class="material-symbols-outlined text-[13px]">schedule</span>
          <span>UPCOMING</span>
        </span>
      `;
    } else if (isExpired) {
      statusBadgeHTML = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-slate-500/20 text-slate-700 dark:text-slate-300 border border-slate-500/30 shadow-sm">
          <span class="material-symbols-outlined text-[13px]">bedtime</span>
          <span>EXPIRED</span>
        </span>
      `;
    } else {
      // Draft
      statusBadgeHTML = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/40 shadow-sm">
          <span class="material-symbols-outlined text-[13px]">edit_document</span>
          <span>DRAFT</span>
        </span>
      `;
    }

    // Tier badge
    const tierBadgeHTML = isVip
      ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40">👑 VIP PASS</span>`
      : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">FREE TIER</span>`;

    // Action Buttons based on status
    let actionButtonsHTML = '';
    if (isDraft) {
      actionButtonsHTML = `
        <div class="grid grid-cols-2 gap-2 pt-3 border-t border-purple-200/50 dark:border-purple-800/40">
          <a href="/customize.html?draft=${encodeURIComponent(w.id)}&template=${encodeURIComponent(w.templateId || '')}" class="col-span-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:brightness-110 text-white font-bold text-xs shadow-md shadow-pink-500/20 flex items-center justify-center gap-1.5 transition active:scale-95">
            <span class="material-symbols-outlined text-[16px]">edit</span>
            <span>Continue Editing</span>
          </a>
          <button onclick="previewWishModal('${w.id}')" class="py-2 px-2.5 rounded-xl glass-pill hover:border-purple-400 text-purple-900 dark:text-purple-200 font-semibold text-xs flex items-center justify-center gap-1 transition">
            <span class="material-symbols-outlined text-[15px]">visibility</span>
            <span>Preview</span>
          </button>
          <button onclick="deleteWishPrompt('${w.id}')" class="py-2 px-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-semibold text-xs flex items-center justify-center gap-1 transition">
            <span class="material-symbols-outlined text-[15px]">delete</span>
            <span>Delete</span>
          </button>
        </div>
      `;
    } else if (isActive) {
      actionButtonsHTML = `
        <div class="flex flex-col gap-2 pt-3 border-t border-purple-200/50 dark:border-purple-800/40">
          <div class="grid grid-cols-2 gap-2">
            <a href="/w/${encodeURIComponent(w.id)}" target="_blank" class="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition active:scale-95">
              <span class="material-symbols-outlined text-[16px]">open_in_new</span>
              <span>Open Live</span>
            </a>
            <button onclick="openShareModal('${w.id}')" class="py-2.5 px-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:brightness-110 text-white font-bold text-xs shadow-md shadow-pink-500/20 flex items-center justify-center gap-1.5 transition active:scale-95">
              <span class="material-symbols-outlined text-[16px]">share</span>
              <span>Share Link</span>
            </button>
          </div>
          <div class="grid grid-cols-3 gap-1.5">
            <a href="/customize.html?edit=${encodeURIComponent(w.id)}" class="py-1.5 px-2 rounded-xl glass-pill hover:border-purple-400 text-purple-900 dark:text-purple-200 font-semibold text-[11px] flex items-center justify-center gap-1 transition">
              <span class="material-symbols-outlined text-[14px]">edit</span>
              <span>Edit</span>
            </a>
            <button onclick="duplicateWish('${w.id}')" class="py-1.5 px-2 rounded-xl glass-pill hover:border-purple-400 text-purple-900 dark:text-purple-200 font-semibold text-[11px] flex items-center justify-center gap-1 transition">
              <span class="material-symbols-outlined text-[14px]">content_copy</span>
              <span>Duplicate</span>
            </button>
            <button onclick="deleteWishPrompt('${w.id}')" class="py-1.5 px-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-semibold text-[11px] flex items-center justify-center gap-1 transition">
              <span class="material-symbols-outlined text-[14px]">delete</span>
              <span>Delete</span>
            </button>
          </div>
        </div>
      `;
    } else if (isUpcoming) {
      actionButtonsHTML = `
        <div class="flex flex-col gap-2 pt-3 border-t border-purple-200/50 dark:border-purple-800/40">
          <div class="grid grid-cols-2 gap-2">
            <a href="/w/${encodeURIComponent(w.id)}" target="_blank" class="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5 transition active:scale-95">
              <span class="material-symbols-outlined text-[16px]">hourglass_bottom</span>
              <span>Countdown</span>
            </a>
            <button onclick="openShareModal('${w.id}')" class="py-2.5 px-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:brightness-110 text-white font-bold text-xs shadow-md shadow-pink-500/20 flex items-center justify-center gap-1.5 transition active:scale-95">
              <span class="material-symbols-outlined text-[16px]">share</span>
              <span>Share Link</span>
            </button>
          </div>
          <div class="grid grid-cols-3 gap-1.5">
            <a href="/customize.html?edit=${encodeURIComponent(w.id)}" class="py-1.5 px-2 rounded-xl glass-pill hover:border-purple-400 text-purple-900 dark:text-purple-200 font-semibold text-[11px] flex items-center justify-center gap-1 transition">
              <span class="material-symbols-outlined text-[14px]">edit</span>
              <span>Edit</span>
            </a>
            <button onclick="duplicateWish('${w.id}')" class="py-1.5 px-2 rounded-xl glass-pill hover:border-purple-400 text-purple-900 dark:text-purple-200 font-semibold text-[11px] flex items-center justify-center gap-1 transition">
              <span class="material-symbols-outlined text-[14px]">content_copy</span>
              <span>Duplicate</span>
            </button>
            <button onclick="deleteWishPrompt('${w.id}')" class="py-1.5 px-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-semibold text-[11px] flex items-center justify-center gap-1 transition">
              <span class="material-symbols-outlined text-[14px]">delete</span>
              <span>Delete</span>
            </button>
          </div>
        </div>
      `;
    } else {
      // Expired: Show "Create Again" (brand new wish identity) + Duplicate + Delete
      actionButtonsHTML = `
        <div class="flex flex-col gap-2 pt-3 border-t border-purple-200/50 dark:border-purple-800/40">
          <div class="grid grid-cols-2 gap-2">
            <a href="/customize.html?clone=${encodeURIComponent(w.id)}" class="py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 hover:brightness-110 text-white font-bold text-xs shadow-md shadow-pink-500/20 flex items-center justify-center gap-1.5 transition active:scale-95">
              <span class="material-symbols-outlined text-[16px]">restart_alt</span>
              <span>Create Again ✨</span>
            </a>
            <a href="/w/${encodeURIComponent(w.id)}" target="_blank" class="py-2.5 px-3 rounded-xl glass-pill hover:border-purple-400 text-purple-900 dark:text-purple-200 font-semibold text-xs flex items-center justify-center gap-1 transition">
              <span class="material-symbols-outlined text-[16px]">visibility</span>
              <span>View Expiry</span>
            </a>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button onclick="duplicateWish('${w.id}')" class="py-1.5 px-2 rounded-xl glass-pill hover:border-purple-400 text-purple-900 dark:text-purple-200 font-semibold text-[11px] flex items-center justify-center gap-1 transition">
              <span class="material-symbols-outlined text-[14px]">content_copy</span>
              <span>Duplicate</span>
            </button>
            <button onclick="deleteWishPrompt('${w.id}')" class="py-1.5 px-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-semibold text-[11px] flex items-center justify-center gap-1 transition">
              <span class="material-symbols-outlined text-[14px]">delete</span>
              <span>Delete</span>
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="glass-card rounded-3xl overflow-hidden border border-purple-200/70 dark:border-purple-800/60 shadow-lg hover:shadow-2xl hover:border-pink-500/50 transition-all duration-300 flex flex-col group relative" data-wish-id="${w.id}">
        <!-- Top Cover Thumbnail Banner -->
        <div class="relative h-44 w-full overflow-hidden bg-purple-950/20">
          <img src="${coverPhoto}" alt="${recipient}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80'"/>
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>

          <!-- Top-Left Badges: Status + Tier -->
          <div class="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap z-10">
            ${statusBadgeHTML}
            ${tierBadgeHTML}
          </div>

          <!-- Top-Right Favorite Button -->
          <button onclick="toggleFavorite('${w.id}', event)" class="absolute top-3 right-3 p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white hover:scale-110 active:scale-95 transition z-10 cursor-pointer" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
            <span class="material-symbols-outlined text-[18px] ${isFav ? 'text-pink-500 font-fill' : 'text-white'}" style="${isFav ? 'font-variation-settings: \\'FILL\\' 1;' : ''}">
              ${isFav ? 'favorite' : 'favorite_border'}
            </span>
          </button>

          <!-- Bottom Image Overlay: Recipient Highlight -->
          <div class="absolute bottom-3 left-3 right-3 flex items-end justify-between text-white z-10">
            <div>
              <div class="text-[11px] font-semibold text-purple-200 uppercase tracking-wider">Celebration For</div>
              <h3 class="font-display font-extrabold text-lg sm:text-xl text-white truncate max-w-[200px] sm:max-w-[240px] drop-shadow-md">
                ${recipient}
              </h3>
            </div>
            ${!isDraft ? `
              <div class="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-[10px] font-bold text-purple-200">
                <span class="material-symbols-outlined text-[12px]">visibility</span>
                <span>${views} views</span>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Card Body Info -->
        <div class="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3.5">
          <div class="flex flex-col gap-2">
            <!-- Sender & Template Meta -->
            <div class="flex items-center justify-between text-xs text-purple-800 dark:text-purple-300 font-semibold">
              <span class="truncate">From: <strong class="text-purple-950 dark:text-purple-100">${sender}</strong></span>
              <span class="text-[11px] px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-300">${category}</span>
            </div>

            <!-- Template Name -->
            <div class="text-xs text-purple-900/80 dark:text-purple-300/80 truncate">
              Template: <span class="font-bold text-purple-950 dark:text-white">${templateName}</span>
            </div>

            <!-- Special Date Box -->
            <div class="flex items-center justify-between p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200/70 dark:border-purple-800/50 text-xs">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-pink-500 text-[18px]">event</span>
                <div>
                  <div class="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">Special Date</div>
                  <div class="font-extrabold text-purple-950 dark:text-white">${formattedDate}</div>
                </div>
              </div>
              <div class="text-[10px] text-right text-purple-600 dark:text-purple-400">
                ${relativeTime}
              </div>
            </div>
          </div>

          <!-- Card Actions Footer -->
          ${actionButtonsHTML}
        </div>
      </div>
    `;
  }

  // Relative Time Formatter
  function getRelativeTime(dateStr) {
    if (!dateStr) return '';
    try {
      const then = new Date(dateStr).getTime();
      const now = Date.now();
      const diffSec = Math.floor((now - then) / 1000);
      if (diffSec < 60) return 'Just now';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 30) return `${diffDays}d ago`;
      return `${Math.floor(diffDays / 30)}mo ago`;
    } catch (e) {
      return '';
    }
  }

  // Modal: Share Dialog
  window.openShareModal = function(wishId) {
    const wish = allWishes.find(w => w.id === wishId);
    if (!wish) return;

    selectedWishForAction = wish;
    const recipient = wish.recipientName || wish.customData?.recipient_name || 'Special Person';
    const fullLink = `${window.location.origin}/w/${wish.id}`;
    const whatsappText = encodeURIComponent(`✨ Hey ${recipient}! I crafted an immersive personalized celebration website for you. Open your surprise here: ${fullLink}`);

    let modal = document.getElementById('dashboard-share-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dashboard-share-modal';
      modal.className = 'fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 transition-all duration-300';
      document.body.appendChild(modal);
    }

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(fullLink)}&color=24113F`;

    modal.innerHTML = `
      <div class="w-full max-w-md bg-white dark:bg-purple-950 rounded-3xl border border-purple-200 dark:border-purple-800 shadow-2xl p-6 sm:p-7 flex flex-col gap-4 relative animate-scaleUp">
        <button onclick="document.getElementById('dashboard-share-modal').classList.add('hidden')" class="absolute top-4 right-4 p-2 text-purple-400 hover:text-purple-600 dark:hover:text-white rounded-full hover:bg-purple-100 dark:hover:bg-purple-900/60 transition cursor-pointer">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 text-white flex items-center justify-center text-2xl shadow-lg shadow-pink-500/25">
            🎁
          </div>
          <div>
            <h3 class="font-display text-xl font-extrabold text-purple-950 dark:text-white">Share Celebration Link</h3>
            <p class="text-xs text-purple-700 dark:text-purple-300">Personalized for <strong class="text-pink-500">${recipient}</strong></p>
          </div>
        </div>

        <!-- QR Code & Quick Scan -->
        <div class="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800">
          <div class="p-2 bg-white rounded-xl shadow-md border border-purple-200 flex-shrink-0">
            <img src="${qrUrl}" alt="QR Code" class="w-24 h-24 rounded-lg object-contain"/>
          </div>
          <div class="text-center sm:text-left flex-1">
            <div class="text-xs font-bold text-purple-950 dark:text-white">Instant QR Code</div>
            <p class="text-[11px] text-purple-700 dark:text-purple-300 mt-1">Scan directly from mobile or share image in gift cards!</p>
          </div>
        </div>

        <!-- Direct Link Box -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-bold text-purple-900 dark:text-purple-200">Public Short URL</label>
          <div class="flex items-center justify-between gap-2 p-1.5 pl-3.5 rounded-2xl bg-purple-100 dark:bg-purple-900/50 border border-purple-300 dark:border-purple-700">
            <input id="share-link-input-modal" type="text" readonly value="${fullLink}" class="w-full bg-transparent text-xs font-mono text-purple-950 dark:text-purple-200 focus:outline-none select-all truncate"/>
            <button onclick="copyShareModalLink()" id="btn-copy-share-modal" class="px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold shadow flex items-center gap-1 flex-shrink-0 transition cursor-pointer">
              <span class="material-symbols-outlined text-[15px]">content_copy</span>
              <span id="btn-copy-share-text">Copy</span>
            </button>
          </div>
        </div>

        <!-- Social Share CTAs -->
        <div class="grid grid-cols-2 gap-2 pt-2">
          <a href="https://api.whatsapp.com/send?text=${whatsappText}" target="_blank" class="py-3 px-3 rounded-2xl bg-[#25D366] hover:brightness-105 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition active:scale-95">
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.275.072.376-.044c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824z"/></svg>
            <span>WhatsApp</span>
          </a>
          <a href="${fullLink}" target="_blank" class="py-3 px-3 rounded-2xl bg-purple-100 dark:bg-purple-900/60 hover:bg-purple-200 dark:hover:bg-purple-800 text-purple-950 dark:text-white font-bold text-xs border border-purple-300 dark:border-purple-700 flex items-center justify-center gap-1.5 transition">
            <span class="material-symbols-outlined text-[16px]">open_in_new</span>
            <span>Open Link</span>
          </a>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  };

  window.copyShareModalLink = function() {
    const input = document.getElementById('share-link-input-modal');
    const btnText = document.getElementById('btn-copy-share-text');
    if (input) {
      input.select();
      navigator.clipboard.writeText(input.value);
      if (btnText) {
        btnText.textContent = 'Copied! ✨';
        setTimeout(() => btnText.textContent = 'Copy', 2500);
      }
      showDashboardToast('Link copied to clipboard! 📋');
    }
  };

  // Duplicate a Wish or Draft into a new customizer draft
  window.duplicateWish = function(wishId) {
    const wish = allWishes.find(w => w.id === wishId);
    if (!wish) return;
    window.location.href = `/customize.html?clone=${encodeURIComponent(wish.id)}`;
  };

  // Delete Confirmation Prompt
  window.deleteWishPrompt = function(wishId) {
    const wish = allWishes.find(w => w.id === wishId);
    if (!wish) return;

    selectedWishForAction = wish;
    const isDraft = wish.status === 'draft';
    const recipient = wish.recipientName || 'this recipient';

    let modal = document.getElementById('dashboard-delete-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dashboard-delete-modal';
      modal.className = 'fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 transition-all duration-300';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="w-full max-w-md bg-white dark:bg-purple-950 rounded-3xl border border-rose-200 dark:border-rose-900/50 shadow-2xl p-6 flex flex-col gap-4 text-center">
        <div class="w-14 h-14 rounded-full bg-rose-500/15 text-rose-500 mx-auto flex items-center justify-center text-3xl">
          <span class="material-symbols-outlined text-[32px]">delete_forever</span>
        </div>

        <div>
          <h3 class="font-display text-xl font-extrabold text-purple-950 dark:text-white">
            Delete ${isDraft ? 'Draft' : 'Wish'}?
          </h3>
          <p class="text-xs text-purple-700 dark:text-purple-300 mt-1">
            Are you sure you want to permanently delete the celebration for <strong class="text-purple-950 dark:text-white">${recipient}</strong>? This cannot be undone.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-2 pt-2">
          <button onclick="document.getElementById('dashboard-delete-modal').classList.add('hidden')" class="py-2.5 px-4 rounded-xl glass-pill text-purple-900 dark:text-purple-200 font-bold text-xs hover:border-purple-400 transition">
            Cancel
          </button>
          <button onclick="confirmDeleteWish('${wish.id}')" class="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/25 transition">
            Yes, Delete
          </button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  };

  // Confirm delete handler
  window.confirmDeleteWish = async function(wishId) {
    const modal = document.getElementById('dashboard-delete-modal');
    if (modal) modal.classList.add('hidden');

    const wish = allWishes.find(w => w.id === wishId);
    if (!wish) return;
    const user = window.WishAuth ? window.WishAuth.getCurrentUser() : null;
    const currentUserId = user ? user.id : 'usr_ankit_101';

    if (wish.isDraft || wish.status === 'draft') {
      if (window.WishRepositories) {
        WishRepositories.draftRepository.delete(wishId, currentUserId);
      } else {
        try {
          let drafts = JSON.parse(localStorage.getItem('wishmagic_drafts') || '[]');
          drafts = drafts.filter(d => d.id !== wishId);
          localStorage.setItem('wishmagic_drafts', JSON.stringify(drafts));
        } catch (e) {}
      }
      if (wish.templateId) {
        localStorage.removeItem(`wishmagic_draft_${wish.templateId}`);
      }
    } else {
      if (window.WishRepositories) {
        await WishRepositories.wishRepository.delete(wishId, currentUserId);
      } else {
        try {
          await fetch(`/api/wishes/${encodeURIComponent(wishId)}`, { method: 'DELETE' });
        } catch (e) {}
        try {
          let localUserWishes = JSON.parse(localStorage.getItem('wishmagic_user_wishes') || '[]');
          localUserWishes = localUserWishes.filter(w => (typeof w === 'string' ? w !== wishId : w.id !== wishId));
          localStorage.setItem('wishmagic_user_wishes', JSON.stringify(localUserWishes));
        } catch (e) {}
      }
    }

    if (window.WishRepositories) {
      WishRepositories.favoriteRepository.remove(currentUserId, wishId);
    }
    favoriteIds.delete(wishId);
    saveFavorites(currentUserId);

    allWishes = allWishes.filter(w => w.id !== wishId);
    showDashboardToast('Wish removed successfully 🗑️');
    renderDashboard();
  };

  // Preview Modal for fast creator inspection
  window.previewWishModal = function(wishId) {
    const wish = allWishes.find(w => w.id === wishId);
    if (!wish) return;

    let modal = document.getElementById('dashboard-preview-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dashboard-preview-modal';
      modal.className = 'fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 transition-all duration-300';
      document.body.appendChild(modal);
    }

    const previewSrc = wish.isDraft
      ? `/template-preview.html?template=${encodeURIComponent(wish.templateId || 'tpl_glitter_birthday')}&creatorPreview=1`
      : `/w/${encodeURIComponent(wish.id)}?creatorPreview=1`;

    modal.innerHTML = `
      <div class="w-full max-w-4xl h-[90vh] bg-surface-container-lowest dark:bg-purple-950 rounded-3xl border border-purple-200 dark:border-purple-800 shadow-2xl flex flex-col overflow-hidden relative">
        <div class="px-5 py-3.5 bg-white dark:bg-purple-900/60 border-b border-purple-200 dark:border-purple-800 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <span class="w-3 h-3 rounded-full bg-pink-500 animate-pulse"></span>
            <span class="font-display font-bold text-sm text-purple-950 dark:text-white">Creator Live Preview</span>
            <span class="text-xs text-purple-600 dark:text-purple-400">(${wish.recipientName || 'Celebration'})</span>
          </div>
          <div class="flex items-center gap-2">
            <a href="${previewSrc}" target="_blank" class="px-3 py-1.5 rounded-xl glass-pill text-xs font-bold text-purple-900 dark:text-purple-200 hover:border-purple-400 flex items-center gap-1 transition">
              <span class="material-symbols-outlined text-[14px]">open_in_new</span>
              <span>Full Screen</span>
            </a>
            <button onclick="document.getElementById('dashboard-preview-modal').classList.add('hidden')" class="p-1.5 text-purple-400 hover:text-purple-600 dark:hover:text-white rounded-full hover:bg-purple-100 dark:hover:bg-purple-800 transition cursor-pointer">
              <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>
        <div class="flex-1 w-full bg-black">
          <iframe src="${previewSrc}" class="w-full h-full border-none" title="Wish Preview"></iframe>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  };

  // Toast Helper
  function showDashboardToast(msg) {
    let toast = document.getElementById('dashboard-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'dashboard-toast';
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

})(window);
