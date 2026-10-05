// ============================================================================
// WishMagic Smart Wish Link / Custom Slug Suggestion Engine
// File: public/js/wish-link-suggestions.js
// Deterministic, offline-capable, i18n-ready slug generation and validation
// ============================================================================

(function(window) {
  'use strict';

  // Reserved platform slugs that can never be claimed by wishes
  const RESERVED_SLUGS = new Set([
    'admin', 'login', 'signup', 'register', 'dashboard', 'settings',
    'api', 'auth', 'templates', 'preview', 'create', 'edit',
    'my-wishes', 'favorites', 'pricing', 'about', 'contact', 'help',
    'privacy', 'terms', 'robots', 'sitemap', 'w', 'wish',
    'marketplace', 'checkout', 'premium', 'account', 'expired',
    'media', 'css', 'js', 'assets', 'fonts', 'static', 'health',
    'config', 'null', 'undefined', 'public', 'share', 'status',
    'test', 'undefined', 'null', 'feed', 'rss', 'search'
  ]);

  /**
   * Normalizes any input name into a clean, URL-safe slug fragment.
   * Handles Unicode diacritics, possessives, ampersands, whitespace, and special characters.
   */
  function normalizeNameForSlug(name) {
    if (!name || typeof name !== 'string') return '';
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Strip diacritics (e.g., Rādha -> Radha)
      .replace(/['’]s\b/gi, 's') // Radha's -> Radhas
      .replace(/&/g, ' ') // Riya & Rahul -> Riya Rahul
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Strip unsafe characters/punctuation/scripts
      .replace(/[\s_-]+/g, '-') // Collapse spaces & underscores to hyphens
      .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens
  }

  /**
   * Checks if a slug is a reserved system or platform route
   */
  function isReservedSlug(slug) {
    if (!slug || typeof slug !== 'string') return false;
    return RESERVED_SLUGS.has(slug.toLowerCase().trim());
  }

  /**
   * Validates if a slug complies with strict production requirements:
   * - Lowercase letters, numbers, and single hyphens
   * - Length 3-80 chars
   * - Starts and ends with alphanumeric
   * - No consecutive hyphens (--)
   * - Not a reserved route
   */
  function isValidSlug(slug) {
    if (!slug || typeof slug !== 'string') return false;
    const s = slug.toLowerCase().trim();
    if (s.length < 3 || s.length > 80) return false;
    if (!/^[a-z0-9](?:[a-z0-9]|-(?!-)){1,78}[a-z0-9]$/.test(s)) return false;
    if (isReservedSlug(s)) return false;
    return true;
  }

  // Canonical occasion mapping helper
  function canonicalizeOccasion(occ, category) {
    const raw = String(occ || category || '').toLowerCase().trim();
    if (raw.includes('birth')) return 'birthday';
    if (raw.includes('anniv')) return 'anniversary';
    if (raw.includes('valentin')) return 'valentines';
    if (raw.includes('mother') || raw.includes('mom')) return 'mothers_day';
    if (raw.includes('father') || raw.includes('dad')) return 'fathers_day';
    if (raw.includes('love') || raw.includes('romance')) return 'love';
    if (raw.includes('friend')) return 'friendship';
    if (raw.includes('congrat') || raw.includes('success')) return 'congratulations';
    if (raw.includes('thank')) return 'thank_you';
    if (raw.includes('wed') || raw.includes('marri')) return 'wedding';
    if (raw.includes('engage')) return 'engagement';
    if (raw.includes('christm') || raw.includes('xmas')) return 'christmas';
    if (raw.includes('new-year') || raw.includes('new year')) return 'new_year';
    if (raw.includes('farewell') || raw.includes('bye')) return 'farewell';
    if (raw.includes('baby')) return 'baby_shower';
    if (raw.includes('graduat')) return 'graduation';
    return raw || 'general';
  }

  // Canonical relationship mapping helper
  function canonicalizeRelationship(rel) {
    const raw = String(rel || '').toLowerCase().trim();
    if (raw.includes('crush')) return 'crush';
    if (raw.includes('girlfriend') || raw.includes('gf')) return 'girlfriend';
    if (raw.includes('boyfriend') || raw.includes('bf')) return 'boyfriend';
    if (raw.includes('wife')) return 'wife';
    if (raw.includes('husband')) return 'husband';
    if (raw.includes('mother') || raw.includes('mom')) return 'mother';
    if (raw.includes('father') || raw.includes('dad')) return 'father';
    if (raw.includes('brother') || raw.includes('bro')) return 'brother';
    if (raw.includes('sister') || raw.includes('sis')) return 'sister';
    if (raw.includes('best') && raw.includes('friend')) return 'best_friend';
    if (raw.includes('friend')) return 'friend';
    if (raw.includes('son')) return 'son';
    if (raw.includes('daughter')) return 'daughter';
    if (raw.includes('family')) return 'family';
    if (raw.includes('colleague') || raw.includes('coworker')) return 'colleague';
    if (raw.includes('teacher')) return 'teacher';
    return raw || 'general';
  }

  /**
   * Centralized deterministic suggestion catalog.
   * Structured for internationalization & locale expansion.
   */
  const SUGGESTION_PATTERNS = {
    birthday: {
      generic: (r) => r ? [
        `happy-birthday-${r}`,
        `birthday-wishes-${r}`,
        `birthday-surprise-${r}`,
        `special-birthday-for-${r}`,
        `just-for-you-${r}`,
        `dear-${r}`,
        `a-special-wish-for-${r}`,
        `made-for-${r}`,
        `birthday-love-${r}`,
        `celebrate-${r}`
      ] : [
        'happy-birthday',
        'birthday-wishes',
        'birthday-surprise',
        'special-birthday-wish',
        'just-for-you',
        'celebrate-today',
        'a-special-wish',
        'birthday-cheers'
      ],
      crush: (r) => r ? [
        `happy-birthday-${r}`,
        `just-for-you-${r}`,
        `birthday-surprise-${r}`,
        `a-special-wish-for-${r}`,
        `dear-${r}`,
        `something-special-for-${r}`,
        `made-just-for-${r}`,
        `birthday-wishes-${r}`
      ] : [
        'happy-birthday',
        'just-for-you',
        'birthday-surprise',
        'something-special',
        'a-special-wish'
      ],
      girlfriend: (r) => r ? [
        'happy-birthday-my-love',
        `happy-birthday-${r}`,
        `birthday-surprise-for-${r}`,
        'my-special-girl',
        'just-for-my-love',
        `birthday-love-${r}`,
        `dear-${r}`
      ] : [
        'happy-birthday-my-love',
        'my-special-girl',
        'just-for-my-love',
        'birthday-surprise-my-love',
        'happy-birthday-sweetheart'
      ],
      boyfriend: (r) => r ? [
        'happy-birthday-my-love',
        `happy-birthday-${r}`,
        `birthday-surprise-for-${r}`,
        'my-special-person',
        `just-for-you-${r}`,
        `birthday-love-${r}`
      ] : [
        'happy-birthday-my-love',
        'my-special-person',
        'just-for-you',
        'birthday-surprise-my-love'
      ],
      wife: (r) => r ? [
        'happy-birthday-my-wife',
        `happy-birthday-${r}`,
        `birthday-love-for-${r}`,
        'my-special-wife',
        `forever-with-${r}`,
        'happy-birthday-my-love'
      ] : [
        'happy-birthday-my-wife',
        'my-special-wife',
        'happy-birthday-my-love',
        'forever-my-love'
      ],
      husband: (r) => r ? [
        'happy-birthday-my-husband',
        `happy-birthday-${r}`,
        `birthday-love-for-${r}`,
        'my-special-husband',
        `forever-with-${r}`,
        'happy-birthday-my-love'
      ] : [
        'happy-birthday-my-husband',
        'my-special-husband',
        'happy-birthday-my-love',
        'forever-my-love'
      ],
      mother: (r) => r ? [
        'happy-birthday-mom',
        'birthday-wishes-for-mom',
        'special-wish-for-mom',
        'for-my-mom',
        'love-you-mom',
        'birthday-surprise-mom',
        `happy-birthday-${r}`,
        `special-wish-for-${r}`
      ] : [
        'happy-birthday-mom',
        'birthday-wishes-for-mom',
        'special-wish-for-mom',
        'for-my-mom',
        'love-you-mom',
        'birthday-surprise-mom'
      ],
      father: (r) => r ? [
        'happy-birthday-dad',
        'birthday-wishes-for-dad',
        'special-wish-for-dad',
        'for-my-dad',
        'best-dad-ever',
        'birthday-surprise-dad',
        `happy-birthday-${r}`
      ] : [
        'happy-birthday-dad',
        'birthday-wishes-for-dad',
        'special-wish-for-dad',
        'for-my-dad',
        'best-dad-ever',
        'birthday-surprise-dad'
      ],
      brother: (r) => r ? [
        'happy-birthday-brother',
        'birthday-wishes-brother',
        'birthday-surprise-brother',
        'for-my-brother',
        'best-brother',
        `happy-birthday-${r}`,
        `birthday-wishes-${r}`
      ] : [
        'happy-birthday-brother',
        'birthday-wishes-brother',
        'birthday-surprise-brother',
        'for-my-brother',
        'best-brother'
      ],
      sister: (r) => r ? [
        'happy-birthday-sister',
        'birthday-wishes-sister',
        'birthday-surprise-sister',
        'for-my-sister',
        'best-sister',
        `happy-birthday-${r}`,
        `birthday-wishes-${r}`
      ] : [
        'happy-birthday-sister',
        'birthday-wishes-sister',
        'birthday-surprise-sister',
        'for-my-sister',
        'best-sister'
      ],
      friend: (r) => r ? [
        'happy-birthday-friend',
        `birthday-wishes-${r}`,
        `birthday-surprise-${r}`,
        `just-for-you-${r}`,
        'best-friend-birthday',
        `happy-birthday-${r}`
      ] : [
        'happy-birthday-friend',
        'best-friend-birthday',
        'birthday-wishes-friend',
        'just-for-you'
      ],
      best_friend: (r) => r ? [
        'best-friend-birthday',
        `birthday-wishes-${r}`,
        `birthday-surprise-${r}`,
        `just-for-you-${r}`,
        `happy-birthday-${r}`
      ] : [
        'best-friend-birthday',
        'happy-birthday-friend',
        'birthday-surprise-bestie'
      ]
    },

    anniversary: {
      generic: (r) => r ? [
        'happy-anniversary',
        `happy-anniversary-${r}`,
        'our-special-day',
        'another-year-together',
        'forever-us',
        'our-love-story',
        'made-for-us',
        'to-us',
        'another-year-of-love',
        `anniversary-wishes-${r}`
      ] : [
        'happy-anniversary',
        'our-special-day',
        'another-year-together',
        'forever-us',
        'our-love-story',
        'made-for-us',
        'to-us',
        'another-year-of-love'
      ],
      romantic: (r) => r ? [
        'happy-anniversary-my-love',
        `happy-anniversary-${r}`,
        'our-special-day',
        `forever-with-${r}`,
        'our-love-story',
        'another-year-of-love',
        'forever-us'
      ] : [
        'happy-anniversary-my-love',
        'our-special-day',
        'our-love-story',
        'another-year-of-love',
        'forever-us'
      ]
    },

    love: {
      generic: (r) => r ? [
        `just-for-you-${r}`,
        `dear-${r}`,
        `something-special-for-${r}`,
        `only-for-${r}`,
        `made-for-${r}`,
        'our-little-story',
        `a-message-for-${r}`,
        'from-my-heart'
      ] : [
        'just-for-you',
        'from-my-heart',
        'our-little-story',
        'something-special',
        'made-with-love'
      ]
    },

    valentines: {
      generic: (r) => r ? [
        `happy-valentines-${r}`,
        `valentines-for-${r}`,
        'just-for-my-love',
        'be-my-valentine',
        'valentines-surprise',
        'from-my-heart',
        'for-you-with-love',
        `dear-${r}`
      ] : [
        'happy-valentines-day',
        'just-for-my-love',
        'be-my-valentine',
        'valentines-surprise',
        'from-my-heart',
        'for-you-with-love'
      ]
    },

    mothers_day: {
      generic: (r) => r ? [
        'happy-mothers-day',
        'happy-mothers-day-mom',
        'for-my-mom',
        'a-special-wish-for-mom',
        'love-you-mom',
        'to-the-best-mom',
        `happy-mothers-day-${r}`
      ] : [
        'happy-mothers-day',
        'happy-mothers-day-mom',
        'for-my-mom',
        'a-special-wish-for-mom',
        'love-you-mom',
        'to-the-best-mom'
      ]
    },

    fathers_day: {
      generic: (r) => r ? [
        'happy-fathers-day',
        'happy-fathers-day-dad',
        'for-my-dad',
        'a-special-wish-for-dad',
        'love-you-dad',
        'to-the-best-dad',
        `happy-fathers-day-${r}`
      ] : [
        'happy-fathers-day',
        'happy-fathers-day-dad',
        'for-my-dad',
        'a-special-wish-for-dad',
        'love-you-dad',
        'to-the-best-dad'
      ]
    },

    friendship: {
      generic: (r) => r ? [
        'best-friends-forever',
        `just-for-you-${r}`,
        'friendship-for-life',
        'our-friendship',
        'for-my-best-friend',
        `a-wish-for-my-friend`,
        `dear-${r}`
      ] : [
        'best-friends-forever',
        'friendship-for-life',
        'our-friendship',
        'for-my-best-friend',
        'a-wish-for-my-friend'
      ]
    },

    congratulations: {
      generic: (r) => r ? [
        `congratulations-${r}`,
        `proud-of-you-${r}`,
        `you-did-it-${r}`,
        'celebrating-you',
        'special-congratulations',
        `dear-${r}`
      ] : [
        'congratulations',
        'proud-of-you',
        'you-did-it',
        'celebrating-you',
        'special-congratulations'
      ]
    },

    thank_you: {
      generic: (r) => r ? [
        `thank-you-${r}`,
        `just-for-you-${r}`,
        'with-gratitude',
        'a-little-thank-you',
        'thank-you-for-everything',
        `dear-${r}`
      ] : [
        'thank-you',
        'with-gratitude',
        'a-little-thank-you',
        'thank-you-for-everything',
        'just-for-you'
      ]
    },

    wedding: {
      generic: (r) => r ? [
        `happy-wedding-${r}`,
        'celebrating-your-wedding',
        `happy-marriage-${r}`,
        'our-wedding-celebration',
        'happily-ever-after',
        `best-wishes-for-${r}`
      ] : [
        'happy-wedding',
        'celebrating-your-wedding',
        'happily-ever-after',
        'our-wedding-day'
      ]
    },

    engagement: {
      generic: (r) => r ? [
        `happy-engagement-${r}`,
        'congratulations-on-engagement',
        'celebrating-your-engagement',
        `special-wish-for-${r}`
      ] : [
        'happy-engagement',
        'congratulations-on-engagement',
        'celebrating-your-engagement'
      ]
    },

    christmas: {
      generic: (r) => r ? [
        'merry-christmas',
        `merry-christmas-${r}`,
        'warm-christmas-wishes',
        `christmas-love-${r}`,
        `just-for-you-${r}`
      ] : [
        'merry-christmas',
        'warm-christmas-wishes',
        'holiday-cheers',
        'season-greetings'
      ]
    },

    new_year: {
      generic: (r) => r ? [
        'happy-new-year',
        `happy-new-year-${r}`,
        'wishing-you-a-happy-new-year',
        'new-year-cheers',
        `celebrate-with-${r}`
      ] : [
        'happy-new-year',
        'wishing-you-a-happy-new-year',
        'new-year-cheers',
        'celebrate-new-year'
      ]
    },

    farewell: {
      generic: (r) => r ? [
        `farewell-${r}`,
        `wishing-you-the-best-${r}`,
        `farewell-wishes-${r}`,
        `we-will-miss-you-${r}`,
        `until-we-meet-again-${r}`
      ] : [
        'farewell-wishes',
        'wishing-you-the-best',
        'we-will-miss-you',
        'until-we-meet-again'
      ]
    },

    baby_shower: {
      generic: (r) => r ? [
        'happy-baby-shower',
        'celebrating-little-one',
        `welcome-baby-${r}`,
        `baby-shower-wishes-${r}`
      ] : [
        'happy-baby-shower',
        'celebrating-little-one',
        'welcome-little-one',
        'sweet-baby-wishes'
      ]
    },

    graduation: {
      generic: (r) => r ? [
        `happy-graduation-${r}`,
        `proud-of-you-${r}`,
        `congrats-graduate-${r}`,
        'class-celebration'
      ] : [
        'happy-graduation',
        'proud-of-you-graduate',
        'congrats-graduate',
        'celebrating-success'
      ]
    },

    general: {
      generic: (r) => r ? [
        `just-for-you-${r}`,
        `dear-${r}`,
        `a-special-wish-for-${r}`,
        `made-for-${r}`,
        `something-special-for-${r}`,
        `celebrate-${r}`
      ] : [
        'a-special-wish',
        'just-for-you',
        'something-special',
        'magical-celebration',
        'made-with-love'
      ]
    }
  };

  /**
   * Generates deterministic, ranked, unique, and safe slug suggestions.
   * Follows strict fallback priority:
   * 1. Occasion + relationship + recipient
   * 2. Occasion + recipient
   * 3. Relationship + recipient
   * 4. Occasion only
   * 5. Generic wish suggestions
   */
  function generateSuggestions({ occasion, relationship, recipientName, senderName, category } = {}) {
    const normRecipient = normalizeNameForSlug(recipientName);
    const normSender = normalizeNameForSlug(senderName);
    const occ = canonicalizeOccasion(occasion, category);
    const rel = canonicalizeRelationship(relationship);

    const pool = [];

    // 1. Occasion + Relationship specific suggestions
    const occBucket = SUGGESTION_PATTERNS[occ] || SUGGESTION_PATTERNS.general;
    if (occBucket && typeof occBucket[rel] === 'function') {
      pool.push(...occBucket[rel](normRecipient));
    } else if (occ === 'anniversary' && ['girlfriend', 'boyfriend', 'wife', 'husband', 'crush'].includes(rel)) {
      if (typeof occBucket.romantic === 'function') {
        pool.push(...occBucket.romantic(normRecipient));
      }
    }

    // 2. Occasion generic suggestions
    if (occBucket && typeof occBucket.generic === 'function') {
      pool.push(...occBucket.generic(normRecipient));
    }

    // 3. Sender combo suggestion if both recipient & sender are present
    if (normRecipient && normSender && normRecipient !== normSender) {
      pool.push(`${normSender}-to-${normRecipient}`);
      if (occ === 'birthday') pool.push(`birthday-from-${normSender}-to-${normRecipient}`);
    }

    // 4. General fallback suggestions
    if (typeof SUGGESTION_PATTERNS.general.generic === 'function') {
      pool.push(...SUGGESTION_PATTERNS.general.generic(normRecipient));
    }

    // 5. Deduplicate, filter, and validate
    const seen = new Set();
    const cleanList = [];

    for (const raw of pool) {
      if (!raw || typeof raw !== 'string') continue;
      // Double safe normalization
      const s = raw
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');

      if (s.length >= 3 && s.length <= 80 && !seen.has(s) && !isReservedSlug(s)) {
        seen.add(s);
        cleanList.push(s);
      }
    }

    // Guarantee at least 5 suggestions even with empty fields
    if (cleanList.length === 0) {
      cleanList.push('a-special-wish', 'just-for-you', 'celebration-today', 'magical-surprise', 'made-with-love');
    }

    return cleanList;
  }

  const WishLinkSuggestions = {
    normalizeNameForSlug,
    isReservedSlug,
    isValidSlug,
    generateSuggestions,
    RESERVED_SLUGS
  };

  if (typeof window !== 'undefined') {
    window.WishLinkSuggestions = WishLinkSuggestions;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.WishLinkSuggestions = WishLinkSuggestions;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WishLinkSuggestions;
  }

  return WishLinkSuggestions;
})(typeof window !== 'undefined' ? window : global);
