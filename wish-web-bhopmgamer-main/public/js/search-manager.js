/**
 * WishMagic Production Search & Discovery Client (Part 39)
 * =========================================================
 * Fast debouncing, multi-attribute suggestions popover, recent searches,
 * keyboard accessibility (Arrows/Enter/Esc), safe highlighting, and click telemetry.
 */

(function (window, document) {
  'use strict';

  const RECENT_SEARCHES_KEY = 'wishmagic_recent_searches';
  const MAX_RECENTS = 5;

  class WishMagicSearchController {
    constructor(options = {}) {
      this.inputId = options.inputId || 'template-search-input';
      this.navInputId = options.navInputId || 'nav-search-input';
      this.clearBtnId = options.clearBtnId || null;
      this.suggestionsContainerId = options.suggestionsContainerId || 'search-suggestions-popover';
      this.debounceMs = options.debounceMs || 220;
      this.onSearchSubmit = options.onSearchSubmit || null;
      this.activeSuggestionIndex = -1;
      this.debounceTimer = null;
      this.abortController = null;
      this.lastQuery = '';
      this.isOpen = false;

      this.init();
    }

    init() {
      this.inputEl = document.getElementById(this.inputId);
      this.navInputEl = document.getElementById(this.navInputId);
      this.createSuggestionsPopover();
      this.bindEvents();
    }

    createSuggestionsPopover() {
      if (document.getElementById(this.suggestionsContainerId)) {
        this.popoverEl = document.getElementById(this.suggestionsContainerId);
        return;
      }

      this.popoverEl = document.createElement('div');
      this.popoverEl.id = this.suggestionsContainerId;
      this.popoverEl.className = 'search-suggestions-popover absolute z-50 left-0 right-0 top-full mt-2 bg-surface-container-high/95 backdrop-blur-2xl border border-purple-500/25 rounded-2xl shadow-2xl p-2 hidden transition-all duration-200 text-left';
      this.popoverEl.setAttribute('role', 'listbox');
      this.popoverEl.setAttribute('aria-label', 'Search suggestions');

      // Append relative to the search input's parent if possible
      if (this.inputEl && this.inputEl.parentElement) {
        if (!this.inputEl.parentElement.classList.contains('relative')) {
          this.inputEl.parentElement.classList.add('relative');
        }
        this.inputEl.parentElement.appendChild(this.popoverEl);
      } else {
        document.body.appendChild(this.popoverEl);
      }
    }

    bindEvents() {
      if (this.inputEl) {
        this.inputEl.addEventListener('input', (e) => this.handleInput(e.target.value));
        this.inputEl.addEventListener('focus', () => this.handleFocus());
        this.inputEl.addEventListener('keydown', (e) => this.handleKeydown(e));
      }

      if (this.navInputEl) {
        this.navInputEl.addEventListener('input', (e) => {
          if (this.inputEl && this.inputEl !== this.navInputEl) {
            this.inputEl.value = e.target.value;
          }
          this.handleInput(e.target.value);
        });
        this.navInputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const val = e.target.value.trim();
            if (val) {
              this.saveRecentSearch(val);
              if (window.location.pathname.includes('marketplace')) {
                if (typeof window.filterCatalog === 'function') window.filterCatalog();
              } else {
                window.location.href = `/marketplace.html?q=${encodeURIComponent(val)}`;
              }
            }
          }
        });
      }

      // Close popover when clicking outside
      document.addEventListener('click', (e) => {
        if (this.popoverEl && !this.popoverEl.contains(e.target) && e.target !== this.inputEl && e.target !== this.navInputEl) {
          this.closePopover();
        }
      });

      // Global keyboard shortcut: Cmd+K / Ctrl+K
      document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          if (this.inputEl) {
            this.inputEl.focus();
            this.inputEl.select();
          } else if (this.navInputEl) {
            this.navInputEl.focus();
            this.navInputEl.select();
          }
        }
      });
    }

    handleFocus() {
      const val = (this.inputEl ? this.inputEl.value : '').trim();
      if (!val) {
        this.showRecentSearches();
      } else {
        this.fetchSuggestions(val);
      }
    }

    handleInput(value) {
      const q = value.trim();
      clearTimeout(this.debounceTimer);

      if (!q) {
        this.showRecentSearches();
        if (typeof this.onSearchSubmit === 'function') {
          this.onSearchSubmit('');
        }
        return;
      }

      this.debounceTimer = setTimeout(() => {
        this.fetchSuggestions(q);
        if (typeof this.onSearchSubmit === 'function') {
          this.onSearchSubmit(q);
        }
      }, this.debounceMs);
    }

    handleKeydown(e) {
      if (!this.isOpen) return;

      const items = this.popoverEl.querySelectorAll('.suggestion-item');
      if (items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.activeSuggestionIndex = (this.activeSuggestionIndex + 1) % items.length;
        this.updateActiveItem(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.activeSuggestionIndex = (this.activeSuggestionIndex - 1 + items.length) % items.length;
        this.updateActiveItem(items);
      } else if (e.key === 'Enter') {
        if (this.activeSuggestionIndex >= 0 && items[this.activeSuggestionIndex]) {
          e.preventDefault();
          items[this.activeSuggestionIndex].click();
        } else {
          this.saveRecentSearch(this.inputEl.value.trim());
          this.closePopover();
          if (typeof this.onSearchSubmit === 'function') {
            this.onSearchSubmit(this.inputEl.value.trim());
          }
        }
      } else if (e.key === 'Escape') {
        this.closePopover();
      }
    }

    updateActiveItem(items) {
      items.forEach((item, idx) => {
        if (idx === this.activeSuggestionIndex) {
          item.classList.add('bg-primary/20', 'text-primary');
          item.scrollIntoView({ block: 'nearest' });
        } else {
          item.classList.remove('bg-primary/20', 'text-primary');
        }
      });
    }

    async fetchSuggestions(query) {
      if (this.abortController) {
        this.abortController.abort();
      }
      this.abortController = new AbortController();

      try {
        const res = await fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`, {
          signal: this.abortController.signal
        });
        const data = await res.json();
        if (data && data.suggestions) {
          this.renderSuggestions(data.suggestions, query);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          // Fallback to local match if offline or dev
          this.renderFallbackSuggestions(query);
        }
      }
    }

    renderSuggestions(suggestions, query) {
      if (!this.popoverEl) return;
      this.activeSuggestionIndex = -1;

      if (!suggestions || suggestions.length === 0) {
        this.popoverEl.innerHTML = `
          <div class="p-3 text-center text-xs text-on-surface-variant flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-sm">search_off</span>
            <span>Press Enter to search for &ldquo;<strong>${this.escape(query)}</strong>&rdquo;</span>
          </div>
        `;
        this.openPopover();
        return;
      }

      let html = '<div class="flex flex-col gap-1 py-1 max-h-72 overflow-y-auto no-scrollbar">';

      suggestions.forEach((item, index) => {
        let icon = item.icon || 'search';
        let badge = '';
        if (item.type === 'category') badge = '<span class="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 font-bold ml-auto">Occasion</span>';
        if (item.type === 'relationship') badge = '<span class="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-300 font-bold ml-auto">Relationship</span>';
        if (item.type === 'template') {
          const isVip = item.tier === 'vip';
          badge = `<span class="text-[10px] px-2 py-0.5 rounded-full font-black ml-auto ${isVip ? 'bg-amber-400 text-purple-950' : 'bg-emerald-500 text-white'}">${isVip ? 'VIP' : 'FREE'}</span>`;
        }
        if (item.type === 'music') badge = '<span class="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 font-bold ml-auto">Music Track</span>';

        html += `
          <div class="suggestion-item px-3 py-2 rounded-xl hover:bg-surface-container-highest cursor-pointer flex items-center gap-2.5 transition text-xs text-on-surface"
               data-type="${item.type}" data-value="${this.escape(item.text || item.label)}" data-id="${item.id || ''}">
            <span class="material-symbols-outlined text-sm text-outline flex-shrink-0">${icon}</span>
            <span class="font-medium truncate flex-1">${this.escape(item.label || item.text)}</span>
            ${badge}
          </div>
        `;
      });

      html += '</div>';

      // Footer hint
      html += `
        <div class="mt-1 pt-1.5 border-t border-purple-500/10 px-3 py-1 flex items-center justify-between text-[10px] text-outline">
          <span>Press <strong>Enter</strong> to explore all results</span>
          <span class="hidden sm:inline">Use ↑ ↓ to navigate</span>
        </div>
      `;

      this.popoverEl.innerHTML = html;
      this.bindSuggestionClicks();
      this.openPopover();
    }

    renderFallbackSuggestions(query) {
      // Local graceful fallback
      this.renderSuggestions([
        { type: 'query', text: query, label: `Search for "${query}"`, icon: 'search' }
      ], query);
    }

    showRecentSearches() {
      const recents = this.getRecentSearches();
      if (!this.popoverEl) return;

      if (recents.length === 0) {
        this.closePopover();
        return;
      }

      let html = `
        <div class="flex items-center justify-between px-3 py-1.5 text-[11px] font-bold text-outline uppercase tracking-wider">
          <span class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-xs">history</span> Recent Searches
          </span>
          <button class="clear-recents-btn hover:text-pink-400 text-[10px] lowercase transition" type="button">Clear</button>
        </div>
        <div class="flex flex-col gap-1 py-1">
      `;

      recents.forEach(r => {
        html += `
          <div class="suggestion-item px-3 py-1.5 rounded-xl hover:bg-surface-container-highest cursor-pointer flex items-center gap-2.5 transition text-xs text-on-surface"
               data-type="recent" data-value="${this.escape(r)}">
            <span class="material-symbols-outlined text-sm text-outline flex-shrink-0">history</span>
            <span class="truncate flex-1">${this.escape(r)}</span>
            <span class="material-symbols-outlined text-xs text-outline opacity-40">arrow_outward</span>
          </div>
        `;
      });

      html += '</div>';

      this.popoverEl.innerHTML = html;

      const clearBtn = this.popoverEl.querySelector('.clear-recents-btn');
      if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.clearRecentSearches();
          this.closePopover();
        });
      }

      this.bindSuggestionClicks();
      this.openPopover();
    }

    bindSuggestionClicks() {
      if (!this.popoverEl) return;
      const items = this.popoverEl.querySelectorAll('.suggestion-item');

      items.forEach(item => {
        item.addEventListener('click', () => {
          const type = item.getAttribute('data-type');
          const value = item.getAttribute('data-value');
          const id = item.getAttribute('data-id');

          if (this.inputEl) this.inputEl.value = value;
          if (this.navInputEl) this.navInputEl.value = value;

          this.saveRecentSearch(value);
          this.closePopover();

          // Report search click telemetry
          if (id) {
            this.trackSearchClick(id, type, value);
          }

          if (type === 'template' && id) {
            // Direct navigate to template details/customizer if preferred
            window.location.href = `/template/${id}`;
            return;
          }

          if (type === 'category' && typeof window.selectOccasion === 'function') {
            const btn = document.querySelector(`.occasion-chip[data-cat="${value.toLowerCase()}"]`);
            window.selectOccasion(value.toLowerCase(), btn || null);
            return;
          }

          if (type === 'relationship' && typeof window.selectOccasion === 'function') {
            window.selectOccasion(value.toLowerCase(), null);
            return;
          }

          if (typeof this.onSearchSubmit === 'function') {
            this.onSearchSubmit(value);
          } else if (typeof window.filterCatalog === 'function') {
            window.filterCatalog();
          } else {
            window.location.href = `/marketplace.html?q=${encodeURIComponent(value)}`;
          }
        });
      });
    }

    trackSearchClick(entityId, entityType, query) {
      try {
        fetch('/api/search/analytics/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityId,
            entityType,
            query
          })
        }).catch(() => {});
      } catch (e) {}
    }

    openPopover() {
      if (!this.popoverEl) return;
      this.popoverEl.classList.remove('hidden');
      this.isOpen = true;
    }

    closePopover() {
      if (!this.popoverEl) return;
      this.popoverEl.classList.add('hidden');
      this.isOpen = false;
      this.activeSuggestionIndex = -1;
    }

    getRecentSearches() {
      try {
        const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
        return stored ? JSON.parse(stored) : [];
      } catch (e) {
        return [];
      }
    }

    saveRecentSearch(q) {
      if (!q || q.length < 2) return;
      try {
        let recents = this.getRecentSearches();
        recents = recents.filter(item => item.toLowerCase() !== q.toLowerCase());
        recents.unshift(q);
        if (recents.length > MAX_RECENTS) recents = recents.slice(0, MAX_RECENTS);
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recents));
      } catch (e) {}
    }

    clearRecentSearches() {
      try {
        localStorage.removeItem(RECENT_SEARCHES_KEY);
      } catch (e) {}
    }

    escape(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  }

  window.WishMagicSearchController = WishMagicSearchController;

  // Auto-initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('template-search-input') || document.getElementById('nav-search-input')) {
      window.globalSearchInstance = new WishMagicSearchController({
        inputId: 'template-search-input',
        navInputId: 'nav-search-input',
        onSearchSubmit: function (q) {
          if (typeof window.filterCatalog === 'function') {
            window.filterCatalog();
          }
        }
      });
    }
  });

})(window, document);
