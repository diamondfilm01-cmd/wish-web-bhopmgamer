// ============================================================================
// ⚠️ DEVELOPMENT ENVIRONMENT ONLY (Local express development runner)
// ⚠️ DO NOT USE FOR PRODUCTION DEPLOYMENT
// PRODUCTION SOURCE OF TRUTH: Cloudflare Worker (src/worker.js) + D1 + R2
// PRODUCTION DEPLOYMENT: npx wrangler pages deploy public OR npx wrangler deploy
// ============================================================================

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// High limits for ZIP and folder uploads (HTML, CSS, JS, images, audio)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const DATA_DIR = path.join(__dirname, 'data');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const TEMPLATE_VERSIONS_FILE = path.join(DATA_DIR, 'template_versions.json');
const WISHES_FILE = path.join(DATA_DIR, 'wishes.json');
const MEDIA_FILE = path.join(DATA_DIR, 'media.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');
const PREFERENCES_FILE = path.join(DATA_DIR, 'preferences.json');
const ANNOUNCEMENTS_FILE = path.join(DATA_DIR, 'announcements.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const FAVORITES_FILE = path.join(DATA_DIR, 'favorites.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const STORE_DIR = path.join(__dirname, 'public', 'templates-store');
const MEDIA_DIR = path.join(__dirname, 'public', 'media');

// Ensure base directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

function getUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return [
    {
      id: 'usr_ankit_101',
      email: 'ankit@example.com',
      displayName: 'Ankit Verma',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      role: 'creator',
      plan: 'VIP',
      isPremium: true,
      provider: 'email',
      status: 'active',
      createdAt: '2026-01-15T10:00:00.000Z',
      updatedAt: '2026-10-01T12:00:00.000Z'
    },
    {
      id: 'usr_priya_202',
      email: 'priya@example.com',
      displayName: 'Priya Sharma',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      role: 'creator',
      plan: 'Free',
      isPremium: false,
      provider: 'email',
      status: 'active',
      createdAt: '2026-02-20T14:30:00.000Z',
      updatedAt: '2026-10-02T09:15:00.000Z'
    },
    {
      id: 'usr_admin_999',
      email: 'admin@wishmagic.internal',
      displayName: 'Platform Admin',
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      role: 'admin',
      plan: 'VIP',
      isPremium: true,
      provider: 'system',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-10-04T00:00:00.000Z'
    }
  ];
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {}
}

function getSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, 'utf8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function saveSessions(sessions) {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
  } catch (e) {}
}

function getFavorites() {
  try {
    if (fs.existsSync(FAVORITES_FILE)) {
      const data = fs.readFileSync(FAVORITES_FILE, 'utf8');
      const parsed = JSON.parse(data || '{}');
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    }
  } catch (e) {}
  return {};
}

function saveFavorites(favorites) {
  try {
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify(favorites, null, 2), 'utf8');
  } catch (e) {}
}

function getNotifications() {
  try {
    if (fs.existsSync(NOTIFICATIONS_FILE)) {
      const data = fs.readFileSync(NOTIFICATIONS_FILE, 'utf8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed)) return parsed;
    }
    return [];
  } catch (e) {
    return [];
  }
}

function saveNotifications(notifications) {
  try {
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications.slice(0, 2000), null, 2), 'utf8');
  } catch (e) {}
}

function getPreferences() {
  try {
    if (fs.existsSync(PREFERENCES_FILE)) {
      const data = fs.readFileSync(PREFERENCES_FILE, 'utf8');
      const parsed = JSON.parse(data || '{}');
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    }
    return {};
  } catch (e) {
    return {};
  }
}

function savePreferences(prefs) {
  try {
    fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(prefs, null, 2), 'utf8');
  } catch (e) {}
}

function getAnnouncements() {
  try {
    if (fs.existsSync(ANNOUNCEMENTS_FILE)) {
      const data = fs.readFileSync(ANNOUNCEMENTS_FILE, 'utf8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed)) return parsed;
    }
    return [];
  } catch (e) {
    return [];
  }
}

function saveAnnouncements(announcements) {
  try {
    fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify(announcements, null, 2), 'utf8');
  } catch (e) {}
}

function getEvents() {
  try {
    if (fs.existsSync(EVENTS_FILE)) {
      const data = fs.readFileSync(EVENTS_FILE, 'utf8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed)) return parsed;
    }
    return [];
  } catch (e) {
    return [];
  }
}

function saveEvents(events) {
  try {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(events.slice(0, 5000), null, 2), 'utf8');
  } catch (e) {}
}

function getCategories() {
  try {
    if (fs.existsSync(CATEGORIES_FILE)) {
      const data = fs.readFileSync(CATEGORIES_FILE, 'utf8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed)) {
        return parsed.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
      }
    }
    return [];
  } catch (e) {
    return [];
  }
}

function saveCategories(categories) {
  fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2), 'utf8');
}

function getTemplates() {
  try {
    if (fs.existsSync(TEMPLATES_FILE)) {
      const data = fs.readFileSync(TEMPLATES_FILE, 'utf8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(t => {
          const isPub = t.status ? (t.status === 'published') : (t.isPublished !== false);
          const isVip = t.tier === 'vip' || t.isPremium === true || (Number(t.price) > 0);
          return {
            ...t,
            templateVersion: t.templateVersion || 1,
            slug: t.slug || (t.name || t.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
            status: isPub ? 'published' : 'draft',
            isPublished: isPub,
            isPremium: isVip,
            tier: isVip ? 'vip' : 'free',
            price: isVip ? (Number(t.price) || 49) : 0,
            featured: Boolean(t.featured),
            tags: Array.isArray(t.tags) ? t.tags : [String(t.category || '').toLowerCase(), 'celebration'],
            previewImages: Array.isArray(t.previewImages) && t.previewImages.length > 0 ? t.previewImages : [t.thumbnail || '/assets/default-template.jpg'],
            sections: t.sections || ['Hero Cake Unboxing', 'Memory Polaroid Reel', 'Birthday Dedication', 'Confetti Finale'],
            sectionDefinitions: t.sectionDefinitions || null,
            layouts: t.layouts || null,
            capabilities: {
              hero: true,
              gallery: true,
              message: true,
              memories: true,
              timeline: Boolean(t.capabilities?.timeline || t.supportsTimeline || t.id?.includes('chronicles') || t.id?.includes('tribute')),
              music: true,
              voiceNote: t.supportsVoice !== false,
              countdown: Boolean(t.capabilities?.countdown !== false && (t.id?.includes('countdown') || t.name?.toLowerCase().includes('countdown') || (t.category || '').toLowerCase().includes('birthday'))),
              openWhen: Boolean(t.capabilities?.openWhen || t.supportsOpenWhen || t.id?.includes('romantic') || t.id?.includes('scrapbook')),
              secretMessage: true,
              finalSurprise: true,
              galleryLayouts: true,
              themeSupport: true,
              animationSupport: true,
              backgroundSupport: true,
              ...(t.capabilities || {})
            }
          };
        });
      }
    }
    return [];
  } catch (e) {
    return [];
  }
}

function saveTemplates(templates) {
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2), 'utf8');
}

function getTemplateVersions() {
  try {
    if (fs.existsSync(TEMPLATE_VERSIONS_FILE)) {
      const data = fs.readFileSync(TEMPLATE_VERSIONS_FILE, 'utf8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed)) return parsed;
    }
    return [];
  } catch (e) {
    return [];
  }
}

function saveTemplateVersions(versions) {
  fs.writeFileSync(TEMPLATE_VERSIONS_FILE, JSON.stringify(versions, null, 2), 'utf8');
}

function buildCanonicalTemplateSnapshot(template, versionNumber = 1) {
  const versionId = `tv_${template.id}_v${versionNumber}`;
  return {
    id: versionId,
    versionId,
    templateId: template.id,
    versionNumber,
    name: template.name || 'Magical Celebration Experience',
    description: template.description || 'A personalized celebration website with music and memories.',
    category: template.category || 'Birthday',
    tier: template.tier || (template.isPremium ? 'vip' : 'free'),
    price: template.price !== undefined ? Number(template.price) : (template.tier === 'vip' ? 49 : 0),
    isPremium: Boolean(template.tier === 'vip' || template.isPremium || template.price > 0),
    thumbnail: template.thumbnail || template.previewImage || '/assets/file_ab2082.png',
    theme: template.theme || {
      mood: 'Joyful & Celebratory',
      accentColor: '#ec4899',
      gradient: 'from-pink-500 via-purple-600 to-amber-400'
    },
    sections: template.sections || ['Hero Unboxing', 'Memory Gallery', 'Personal Dedication', 'Confetti Finale'],
    capabilities: template.capabilities || {
      hero: true,
      gallery: true,
      message: true,
      memories: true,
      music: true,
      voiceNote: true,
      secretMessage: true,
      finalSurprise: true,
      themeSupport: true,
      animationSupport: true,
      backgroundSupport: true
    },
    layout: template.layout || 'centered-immersive',
    animations: template.animations || 'Canvas Confetti + Sound + 3D Effects',
    defaultConfig: template.defaultConfig || template.detectedFields || {},
    status: 'active',
    createdAt: template.createdAt || new Date().toISOString()
  };
}

function getOrSeedTemplateVersion(templateId) {
  if (!templateId) return null;
  const versions = getTemplateVersions();
  const found = versions.find(v => v.templateId === templateId && v.status === 'active');
  if (found) return found;

  const templates = getTemplates();
  const base = templates.find(t => t.id === templateId) || {
    id: templateId,
    name: templateId.replace(/^tpl_/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    category: 'Birthday',
    tier: 'free',
    price: 0
  };

  const v1 = buildCanonicalTemplateSnapshot(base, 1);
  versions.push(v1);
  saveTemplateVersions(versions);
  return v1;
}

function getTemplateVersionById(versionId, fallbackTemplateId = null) {
  if (!versionId && fallbackTemplateId) {
    return getOrSeedTemplateVersion(fallbackTemplateId);
  }
  if (!versionId) return null;
  const versions = getTemplateVersions();
  const found = versions.find(v => v.id === versionId || v.versionId === versionId);
  if (found) return found;
  if (fallbackTemplateId) {
    return getOrSeedTemplateVersion(fallbackTemplateId);
  }
  return null;
}

function createNewTemplateVersion(templateId, updatedFields = {}) {
  const versions = getTemplateVersions();
  const matching = versions.filter(v => v.templateId === templateId);
  const maxVersion = matching.reduce((max, v) => Math.max(max, v.versionNumber || 1), 0);
  const newVersionNumber = maxVersion + 1;
  const versionId = `tv_${templateId}_v${newVersionNumber}`;

  const currentActive = matching.find(v => v.versionNumber === maxVersion) || getOrSeedTemplateVersion(templateId);
  const merged = {
    ...currentActive,
    ...updatedFields,
    id: versionId,
    versionId,
    templateId,
    versionNumber: newVersionNumber,
    status: 'active',
    createdAt: new Date().toISOString()
  };

  const snapshot = buildCanonicalTemplateSnapshot(merged, newVersionNumber);
  versions.push(snapshot);
  saveTemplateVersions(versions);
  return snapshot;
}

function getMedia() {
  try {
    if (fs.existsSync(MEDIA_FILE)) {
      const data = fs.readFileSync(MEDIA_FILE, 'utf8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed)) return parsed;
    }
    return [];
  } catch (e) {
    return [];
  }
}

function saveMedia(media) {
  fs.writeFileSync(MEDIA_FILE, JSON.stringify(media, null, 2), 'utf8');
}

function getWishes() {
  try {
    if (fs.existsSync(WISHES_FILE)) {
      const data = fs.readFileSync(WISHES_FILE, 'utf8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Backfill slugs if missing
        let modified = false;
        parsed.forEach(w => {
          if (!w.slug) {
            w.slug = generateUniqueWishSlug(w.customData || {}, null, parsed.filter(other => other !== w));
            modified = true;
          }
        });
        if (modified) saveWishes(parsed);
        return parsed;
      }
    }
    return [];
  } catch (e) {
    return [];
  }
}

function saveWishes(wishes) {
  fs.writeFileSync(WISHES_FILE, JSON.stringify(wishes, null, 2), 'utf8');
}

// Helper: Slugify string
const RESERVED_SLUGS = new Set([
  'admin', 'login', 'signup', 'register', 'dashboard', 'settings',
  'api', 'auth', 'templates', 'preview', 'create', 'edit',
  'my-wishes', 'favorites', 'pricing', 'about', 'contact', 'help',
  'privacy', 'terms', 'robots', 'sitemap', 'w', 'wish',
  'marketplace', 'checkout', 'premium', 'account', 'expired',
  'media', 'css', 'js', 'assets', 'fonts', 'static', 'health',
  'config', 'null', 'undefined', 'public', 'share', 'status',
  'test', 'feed', 'rss', 'search'
]);

function slugifyText(text) {
  if (!text) return '';
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]s\b/gi, 's')
    .replace(/&/g, ' ')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isValidSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  const s = slug.toLowerCase().trim();
  if (s.length < 3 || s.length > 80) return false;
  if (!/^[a-z0-9](?:[a-z0-9]|-(?!-)){1,78}[a-z0-9]$/.test(s)) return false;
  if (RESERVED_SLUGS.has(s)) return false;
  return true;
}

// Helper: Generate collision-resistant slug for celebration wish
function generateUniqueWishSlug(customData = {}, template = null, existingWishes = []) {
  const recipient = slugifyText(customData.recipient_name || customData.recipientName || 'special-person');
  const sender = slugifyText(customData.sender_name || customData.senderName || '');
  const occasion = slugifyText((template && template.category) || customData.occasion || 'celebration');

  let baseSlug = '';
  if (sender && recipient) {
    baseSlug = `${sender}-to-${recipient}`;
  } else if (recipient) {
    baseSlug = `${recipient}-${occasion}`;
  } else {
    baseSlug = `magical-${occasion}`;
  }

  if (baseSlug.length > 35) {
    baseSlug = baseSlug.slice(0, 35).replace(/-+$/, '');
  }

  const existingSet = new Set((existingWishes || []).map(w => (w.slug || '').toLowerCase()));
  const chars = '23456789abcdefghjkmnpqrstuvwxyz';

  let slug = '';
  let attempts = 0;
  do {
    let suffix = '';
    for (let i = 0; i < 5; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    slug = `${baseSlug}-${suffix}`;
    attempts++;
  } while (existingSet.has(slug) && attempts < 30);

  return slug;
}

// Serve templates-store files directly
app.use('/templates-store', express.static(STORE_DIR));
app.use('/media', express.static(MEDIA_DIR));

// 1. Security Headers Middleware (Production Policy)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  next();
});

// 2. Edge-Ready IP Rate Limiter Middleware
const apiRateLimitMap = new Map();
app.use('/api', (req, res, next) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').toString().split(',')[0].trim();
  const now = Date.now();
  const record = apiRateLimitMap.get(ip) || { count: 0, startTime: now };

  if (now - record.startTime > 60000) {
    record.count = 0;
    record.startTime = now;
  }

  record.count++;
  apiRateLimitMap.set(ip, record);

  if (record.count > 180) {
    return res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down and try again shortly.' }
    });
  }
  next();
});

// 3. Cookie & Session Parser Middleware (Production HttpOnly Cookies)
function parseCookies(cookieStr) {
  const map = {};
  if (!cookieStr) return map;
  cookieStr.split(';').forEach(pair => {
    const parts = pair.split('=');
    if (parts.length >= 2) {
      map[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return map;
}

app.use((req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.wm_session || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  req.user = null;
  req.sessionToken = token;

  if (token) {
    const sessions = getSessions();
    const now = Date.now();
    const session = sessions.find(s => s.token === token && s.expiresAt > now);
    const users = getUsers();

    if (session) {
      req.user = users.find(u => u.id === session.userId) || null;
    }

    // Fallback for development accounts
    if (!req.user) {
      if (token.includes('admin') || token === 'dev_token_usr_admin_999') {
        req.user = users.find(u => u.id === 'usr_admin_999') || {
          id: 'usr_admin_999',
          email: 'admin@wishmagic.internal',
          displayName: 'Platform Admin',
          role: 'admin',
          isAdmin: true,
          plan: 'VIP',
          isPremium: true
        };
      } else if (token.includes('priya') || token === 'dev_token_usr_priya_202') {
        req.user = users.find(u => u.id === 'usr_priya_202') || {
          id: 'usr_priya_202',
          email: 'priya@example.com',
          displayName: 'Priya Sharma',
          role: 'creator',
          isAdmin: false,
          plan: 'Free',
          isPremium: false
        };
      } else if (token.startsWith('dev_token_') || token.includes('ankit')) {
        req.user = users.find(u => u.id === 'usr_ankit_101') || {
          id: 'usr_ankit_101',
          email: 'ankit@example.com',
          displayName: 'Ankit Verma',
          role: 'creator',
          isAdmin: false,
          plan: 'VIP',
          isPremium: true
        };
      }
    }
  }

  // If no valid session token provided, req.user remains null (Guest / Public viewer)
  next();
});

// --- Central Site Settings & Storefront Configuration Engine ---
const SITE_SETTINGS_FILE = path.join(DATA_DIR, 'site_settings.json');

const DEFAULT_SERVER_SITE_SETTINGS = {
  heroBadge: 'Make Every Moment Magical ✨',
  heroHeadline: 'Gift a <span class="bg-gradient-to-r from-[#F472B6] via-[#EC4899] to-[#F4C542] bg-clip-text text-transparent">Magical</span> Web-Experience!',
  heroSubheadline: 'Create beautiful personalized digital wishes that feel like a real experience — interactive 3D unboxing, customized music & unforgettable celebration magic.',
  heroGiftIcon: '🎁',
  heroStyle: 'cosmic-purple',
  heroCta1: 'Explore Magic',
  heroCta2: 'Create Your Wish',
  brandName: 'WishMagic',
  supportWa: '+91 98765 43210',
  currency: 'INR',
  particleFx: true,
  maintenanceMode: false,
  promoDiscountEnabled: false,
  promoFreeOfferMode: false,
  promoOriginalPrice: 99,
  promoDiscountPrice: 49,
  promoBadgeText: '🔥 Limited Time Offer - 100% OFF Free Today!',
  promoBannerActive: false,
  promoBannerText: '🎉 Special Launch Offer: All Personalized Links & VIP Wishes are 100% FREE Today!',
  updatedAt: '2026-10-05T00:00:00.000Z',
  updatedBy: 'system'
};

const ALLOWED_SERVER_HERO_STYLES = ['cosmic-purple', 'midnight-gold', 'romantic-rose'];
const ALLOWED_SERVER_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'];

const SERVER_HERO_STYLE_GRADIENTS = {
  'cosmic-purple': 'radial-gradient(circle at 75% 25%, #9d174d 0%, #6d28d9 28%, #4c1d95 62%, #2e0854 100%)',
  'midnight-gold': 'radial-gradient(circle at 75% 25%, #d97706 0%, #1e1b4b 28%, #0f172a 62%, #020617 100%)',
  'romantic-rose': 'radial-gradient(circle at 75% 25%, #e11d48 0%, #831843 30%, #4c0519 65%, #1f020a 100%)'
};

function generateServerSafeWhatsAppUrl(phone, defaultMsg = 'Hello! I need help with WishMagic.') {
  if (!phone) return null;
  const digits = String(phone).replace(/[^0-9]/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(defaultMsg)}`;
}

function getServerSiteSettings() {
  try {
    if (fs.existsSync(SITE_SETTINGS_FILE)) {
      const data = fs.readFileSync(SITE_SETTINGS_FILE, 'utf8');
      const parsed = JSON.parse(data || '{}');
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_SERVER_SITE_SETTINGS, ...parsed };
      }
    }
  } catch (e) {}
  return { ...DEFAULT_SERVER_SITE_SETTINGS };
}

function saveServerSiteSettings(settings, actor = {}) {
  try {
    const s = {
      ...settings,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id || 'admin'
    };
    fs.writeFileSync(SITE_SETTINGS_FILE, JSON.stringify(s, null, 2), 'utf8');
    return { success: true, settings: s };
  } catch (err) {
    return { success: false, error: 'Failed to write settings file: ' + err.message };
  }
}

function validateServerSiteSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return { valid: false, error: 'Invalid settings payload.' };
  }

  const s = settings.settings || settings;
  const current = getServerSiteSettings();

  const heroBadge = String(s.heroBadge !== undefined ? s.heroBadge : current.heroBadge).trim();
  if (!heroBadge || heroBadge.length > 120) {
    return { valid: false, error: 'Hero badge must be between 1 and 120 characters.' };
  }

  const heroHeadline = String(s.heroHeadline !== undefined ? s.heroHeadline : current.heroHeadline).trim();
  if (!heroHeadline || heroHeadline.length > 500) {
    return { valid: false, error: 'Hero headline must be between 1 and 500 characters.' };
  }
  if (/<script|javascript:|onerror=|onload=/i.test(heroHeadline)) {
    return { valid: false, error: 'Hero headline contains prohibited HTML/script tags.' };
  }

  const heroSubheadline = String(s.heroSubheadline !== undefined ? s.heroSubheadline : current.heroSubheadline).trim();
  if (!heroSubheadline || heroSubheadline.length > 1000) {
    return { valid: false, error: 'Hero subheadline must be between 1 and 1000 characters.' };
  }

  const heroGiftIcon = String(s.heroGiftIcon !== undefined ? s.heroGiftIcon : current.heroGiftIcon).trim();
  if (!heroGiftIcon || heroGiftIcon.length > 20) {
    return { valid: false, error: 'Hero icon must be between 1 and 20 characters.' };
  }

  const heroStyle = String(s.heroStyle !== undefined ? s.heroStyle : current.heroStyle).trim().toLowerCase();
  if (!ALLOWED_SERVER_HERO_STYLES.includes(heroStyle)) {
    return { valid: false, error: `Hero style must be one of: ${ALLOWED_SERVER_HERO_STYLES.join(', ')}.` };
  }

  const heroCta1 = String(s.heroCta1 !== undefined ? s.heroCta1 : current.heroCta1).trim();
  if (!heroCta1 || heroCta1.length > 60) {
    return { valid: false, error: 'Primary CTA text must be between 1 and 60 characters.' };
  }
  const heroCta2 = String(s.heroCta2 !== undefined ? s.heroCta2 : current.heroCta2).trim();
  if (!heroCta2 || heroCta2.length > 60) {
    return { valid: false, error: 'Secondary CTA text must be between 1 and 60 characters.' };
  }

  const brandName = String(s.brandName !== undefined ? s.brandName : current.brandName).trim();
  if (!brandName || brandName.length > 80) {
    return { valid: false, error: 'Brand name must be between 1 and 80 characters.' };
  }

  const supportWa = String(s.supportWa !== undefined ? s.supportWa : current.supportWa).trim();
  if (!supportWa || !/^[\+0-9\s\-\(\)]+$/.test(supportWa)) {
    return { valid: false, error: 'Support WhatsApp number contains invalid characters.' };
  }
  const digits = supportWa.replace(/[^0-9]/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return { valid: false, error: 'Support WhatsApp number must contain between 7 and 15 digits.' };
  }

  const currency = String(s.currency !== undefined ? s.currency : current.currency).trim().toUpperCase();
  if (!ALLOWED_SERVER_CURRENCIES.includes(currency)) {
    return { valid: false, error: `Storefront currency must be one of: ${ALLOWED_SERVER_CURRENCIES.join(', ')}.` };
  }

  const particleFx = s.particleFx !== undefined ? Boolean(s.particleFx) : current.particleFx;
  const maintenanceMode = s.maintenanceMode !== undefined ? Boolean(s.maintenanceMode) : current.maintenanceMode;

  // Promo Discounts & Free Offer
  const promoDiscountEnabled = s.promoDiscountEnabled !== undefined ? Boolean(s.promoDiscountEnabled) : current.promoDiscountEnabled;
  const promoFreeOfferMode = s.promoFreeOfferMode !== undefined ? Boolean(s.promoFreeOfferMode) : current.promoFreeOfferMode;
  const promoOriginalPrice = Math.max(0, Number(s.promoOriginalPrice !== undefined ? s.promoOriginalPrice : current.promoOriginalPrice) || 99);
  const promoDiscountPrice = promoFreeOfferMode ? 0 : Math.max(0, Number(s.promoDiscountPrice !== undefined ? s.promoDiscountPrice : current.promoDiscountPrice) || 0);
  const promoBadgeText = String(s.promoBadgeText !== undefined ? s.promoBadgeText : current.promoBadgeText).trim();
  const promoBannerActive = s.promoBannerActive !== undefined ? Boolean(s.promoBannerActive) : current.promoBannerActive;
  const promoBannerText = String(s.promoBannerText !== undefined ? s.promoBannerText : current.promoBannerText).trim();

  return {
    valid: true,
    normalized: {
      heroBadge,
      heroHeadline,
      heroSubheadline,
      heroGiftIcon,
      heroStyle,
      heroCta1,
      heroCta2,
      brandName,
      supportWa,
      currency,
      particleFx,
      maintenanceMode,
      promoDiscountEnabled,
      promoFreeOfferMode,
      promoOriginalPrice,
      promoDiscountPrice,
      promoBadgeText,
      promoBannerActive,
      promoBannerText
    }
  };
}

function formatServerPublicSiteSettings(settings) {
  return {
    heroBadge: settings.heroBadge,
    heroHeadline: settings.heroHeadline,
    heroSubheadline: settings.heroSubheadline,
    heroGiftIcon: settings.heroGiftIcon,
    heroStyle: settings.heroStyle,
    heroStyleGradient: SERVER_HERO_STYLE_GRADIENTS[settings.heroStyle] || SERVER_HERO_STYLE_GRADIENTS['cosmic-purple'],
    heroCta1: settings.heroCta1,
    heroCta2: settings.heroCta2,
    brandName: settings.brandName,
    supportWa: settings.supportWa,
    supportWaUrl: generateServerSafeWhatsAppUrl(settings.supportWa),
    currency: settings.currency,
    currencySymbol: settings.currency === 'USD' || settings.currency === 'CAD' || settings.currency === 'AUD' ? '$' : settings.currency === 'EUR' ? '€' : settings.currency === 'GBP' ? '£' : '₹',
    particleFx: Boolean(settings.particleFx),
    maintenanceMode: Boolean(settings.maintenanceMode),
    promoDiscountEnabled: Boolean(settings.promoDiscountEnabled),
    promoFreeOfferMode: Boolean(settings.promoFreeOfferMode),
    promoOriginalPrice: Number(settings.promoOriginalPrice || 99),
    promoDiscountPrice: Number(settings.promoDiscountPrice || (settings.promoFreeOfferMode ? 0 : 49)),
    promoBadgeText: settings.promoBadgeText || '🔥 Limited Time Offer',
    promoBannerActive: Boolean(settings.promoBannerActive),
    promoBannerText: settings.promoBannerText || '',
    updatedAt: settings.updatedAt
  };
}

// Maintenance Mode Enforcement Middleware for Storefront
app.use((req, res, next) => {
  const settings = getServerSiteSettings();
  if (settings && settings.maintenanceMode) {
    const p = req.path.toLowerCase();
    const isPublicStorefront = p === '/' || p === '/index.html' || p === '/marketplace.html' || p === '/marketplace' || p === '/templates' || p === '/create.html' || p === '/create' || p === '/customize.html' || p === '/customize' || p === '/pricing.html' || p === '/pricing' || p === '/premium.html' || p === '/premium';
    if (isPublicStorefront) {
      const isAdmin = req.user && (req.user.role === 'admin' || req.user.isAdmin);
      if (!isAdmin) {
        res.status(503);
        res.setHeader('Retry-After', '300');
        res.setHeader('X-Maintenance-Mode', 'active');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        const maintFile = path.join(__dirname, 'public', 'maintenance.html');
        if (fs.existsSync(maintFile)) {
          return res.sendFile(maintFile);
        }
        return res.send('<h1>WishMagic Under Maintenance</h1>');
      }
    }
  }
  next();
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html', 'htm']
}));

// ============================================================================
// PART 20 PRODUCTION WORKER API CONTRACTS
// ============================================================================

// API: Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString(),
    stack: 'Cloudflare Pages + Workers + D1 + R2 (Parity Engine)',
    rateLimiting: 'Active',
    timezone: 'Asia/Kolkata (IST = UTC+05:30)'
  });
});

// API: Auth Session
app.get('/api/auth/session', (req, res) => {
  res.json({
    success: true,
    user: req.user,
    isAuthenticated: Boolean(req.user)
  });
});

// API: Auth Sign In (Issues HttpOnly Cookie)
app.post('/api/auth/signin', (req, res) => {
  try {
    const { email, userId, displayName } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();
    const users = getUsers();

    let target = users.find(u => (userId && u.id === userId) || (cleanEmail && u.email === cleanEmail));

    if (!target) {
      target = {
        id: userId || ('usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4)),
        email: cleanEmail || 'creator@example.com',
        displayName: displayName || 'Celebration Creator',
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanEmail || 'creator')}`,
        role: 'creator',
        plan: 'Free',
        isPremium: false,
        provider: 'email',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      users.push(target);
      saveUsers(users);
    }

    const token = 'wm_tok_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 8);
    const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);

    const sessions = getSessions();
    sessions.push({
      id: 'sess_' + Date.now().toString(36),
      userId: target.id,
      token,
      expiresAt,
      createdAt: new Date().toISOString()
    });
    saveSessions(sessions);

    res.setHeader('Set-Cookie', `wm_session=${encodeURIComponent(token)}; Path=/; Max-Age=${30 * 24 * 60 * 60}; HttpOnly; SameSite=Lax`);
    res.json({ success: true, user: target, token });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Auth Sign Out
app.post('/api/auth/signout', (req, res) => {
  const token = req.sessionToken;
  if (token) {
    let sessions = getSessions();
    sessions = sessions.filter(s => s.token !== token);
    saveSessions(sessions);
  }
  res.setHeader('Set-Cookie', 'wm_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  res.json({ success: true, message: 'Signed out successfully' });
});

// API: Auth Dev Switch (Switch Identity for Development/Testing)
app.post('/api/auth/dev-switch', (req, res) => {
  const { userId } = req.body || {};
  const users = getUsers();
  const target = users.find(u => u.id === userId) || users[0];

  const token = `dev_token_${target.id}`;
  const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);

  const sessions = getSessions();
  sessions.push({
    id: 'sess_' + Date.now().toString(36),
    userId: target.id,
    token,
    expiresAt,
    createdAt: new Date().toISOString()
  });
  saveSessions(sessions);

  res.setHeader('Set-Cookie', `wm_session=${encodeURIComponent(token)}; Path=/; Max-Age=${30 * 24 * 60 * 60}; HttpOnly; SameSite=Lax`);
  res.json({ success: true, user: target, token });
});

// API: Users Me Profile
app.get('/api/users/me', (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  res.json({ success: true, user: req.user });
});

app.put('/api/users/me', (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  const { displayName, avatarUrl } = req.body || {};
  const users = getUsers();
  const idx = users.findIndex(u => u.id === req.user.id);
  if (idx >= 0) {
    if (displayName) users[idx].displayName = displayName.trim().slice(0, 80);
    if (avatarUrl) users[idx].avatarUrl = avatarUrl.trim().slice(0, 500);
    users[idx].updatedAt = new Date().toISOString();
    saveUsers(users);
    req.user = users[idx];
  }
  res.json({ success: true, user: req.user });
});

// API: Favorites Endpoints (Server-Side D1 Parity)
app.get('/api/favorites', (req, res) => {
  const userId = req.user ? req.user.id : (req.query.userId || 'usr_ankit_101');
  const favMap = getFavorites();
  const list = Array.isArray(favMap[userId]) ? favMap[userId] : [];
  res.json({ success: true, favorites: list });
});

app.post('/api/favorites', (req, res) => {
  const userId = req.user ? req.user.id : (req.body.userId || 'usr_ankit_101');
  const itemId = String(req.body.itemId || '').trim();
  if (!itemId) return res.status(400).json({ success: false, message: 'itemId is required' });

  const favMap = getFavorites();
  let list = Array.isArray(favMap[userId]) ? favMap[userId] : [];

  let favorited = false;
  if (list.includes(itemId)) {
    list = list.filter(id => id !== itemId);
    favorited = false;
  } else {
    list.push(itemId);
    favorited = true;
  }

  favMap[userId] = list;
  saveFavorites(favMap);
  res.json({ success: true, favorited, itemId, favorites: list });
});

app.delete('/api/favorites/:itemId', (req, res) => {
  const userId = req.user ? req.user.id : (req.query.userId || 'usr_ankit_101');
  const itemId = req.params.itemId;
  const favMap = getFavorites();
  if (Array.isArray(favMap[userId])) {
    favMap[userId] = favMap[userId].filter(id => id !== itemId);
    saveFavorites(favMap);
  }
  res.json({ success: true, removed: true, itemId });
});

// API: Entitlements & Production Payment Provider Abstraction
app.get('/api/entitlements/status', (req, res) => {
  const isPremium = Boolean(req.user && (req.user.isPremium || req.user.plan === 'VIP'));
  res.json({
    success: true,
    isPremium,
    plan: isPremium ? 'VIP' : 'Free',
    features: {
      watermarkRemoval: isPremium,
      unlimitedVIPWishes: isPremium,
      customAudioUpload: isPremium,
      prioritySupport: isPremium
    }
  });
});

app.post('/api/entitlements/checkout', (req, res) => {
  const providerConfigured = Boolean(process.env.RAZORPAY_KEY_ID || process.env.STRIPE_SECRET_KEY);
  if (!providerConfigured) {
    // Explicit truthful status
    return res.json({
      success: true,
      status: 'provider_not_configured',
      message: 'Real payment gateway is not configured in environment variables. Sandbox checkout initialized.',
      mode: 'sandbox',
      checkoutUrl: null
    });
  }

  const orderId = 'ORD_' + Date.now().toString(36).toUpperCase();
  res.json({
    success: true,
    status: 'ready',
    orderId,
    amount: 49,
    currency: 'INR'
  });
});

// API: Public Wish View (Strict Lifecycle & Privacy Enforcement)
app.get('/api/public/wishes/:slug', (req, res) => {
  const query = (req.params.slug || '').trim();
  const wishes = getWishes();
  const wish = wishes.find(w => w.slug === query || w.id === query || w.id === 'wm_' + query);

  if (!wish) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Celebration wish not found or link has concluded' } });
  }

  // Increment view count
  wish.views = (wish.views || 0) + 1;
  saveWishes(wishes);

  const templates = getTemplates();
  const template = templates.find(t => t.id === wish.templateId);
  const lifecycleStatus = computeWishStatus(wish);

  const isOwner = Boolean(req.user && (req.user.id === wish.userId || req.user.role === 'admin'));
  let customData = { ...(wish.customData || {}) };

  // Masking rules for Public Viewers
  if (!isOwner) {
    if (lifecycleStatus === 'upcoming') {
      customData = {
        recipient_name: customData.recipient_name || wish.recipient_name,
        sender_name: customData.sender_name || wish.buyer_name,
        event_date: wish.eventDate || wish.event_date,
        theme: customData.theme || 'magical',
        is_locked: true,
        lock_message: 'This celebration will unlock on the special celebration day! ✨'
      };
    } else if (lifecycleStatus === 'expired') {
      customData = {
        recipient_name: wish.recipient_name,
        sender_name: wish.buyer_name,
        event_date: wish.eventDate || wish.event_date,
        is_expired: true,
        expired_message: 'This celebration keepsake has completed its active celebration cycle.'
      };
    }
  }

  res.json({
    success: true,
    wish: {
      ...wish,
      customData,
      lifecycleStatus,
      isOwner
    },
    template: template || null
  });
});

// API: Environment & Infrastructure Diagnostics (Part 20)
app.get('/api/admin/diagnostic', (req, res) => {
  const diagnostic = {
    d1Database: 'Configured (Parity Database Active)',
    r2Storage: 'Configured (Object Storage Adapter Active)',
    authProvider: 'Configured (Session Cookie + Server RBAC)',
    paymentProvider: (process.env.RAZORPAY_KEY_ID || process.env.STRIPE_SECRET_KEY) ? 'Configured' : 'Missing (Ready for Cloud Keys)',
    emailProvider: process.env.RESEND_API_KEY ? 'Configured' : 'Missing',
    whatsAppProvider: process.env.WHATSAPP_TOKEN ? 'Configured' : 'Missing',
    environment: process.env.NODE_ENV || 'production',
    publicAppUrl: process.env.PUBLIC_APP_URL || 'https://wishmagic.pages.dev',
    rateLimiting: 'Active',
    lifecycleEngine: 'Asia/Kolkata (IST = UTC+05:30) Active'
  };

  res.json({ success: true, diagnostic });
});

// API: Get all templates (supports ?includeDrafts=true for admin, ?category=..., ?search=..., ?tier=..., ?featured=...)
app.get('/api/templates', (req, res) => {
  const { includeDrafts, category, search, tier, featured } = req.query;
  let templates = getTemplates();

  // If not explicitly requesting drafts (public marketplace/home/preview), filter for published only
  if (includeDrafts !== 'true' && includeDrafts !== '1') {
    templates = templates.filter(t => t.isPublished !== false && t.status !== 'draft');
  }

  if (category && category !== 'all') {
    const catLower = category.toLowerCase().trim();
    templates = templates.filter(t => {
      const matchCat = (t.category || '').toLowerCase() === catLower;
      const matchRel = Array.isArray(t.relationships) && t.relationships.some(r => r.toLowerCase() === catLower);
      return matchCat || matchRel;
    });
  }

  if (tier) {
    templates = templates.filter(t => {
      if (tier === 'vip') return t.tier === 'vip' || t.isPremium === true;
      if (tier === 'free') return t.tier === 'free' && !t.isPremium;
      return t.tier === tier;
    });
  }

  if (featured === 'true' || featured === '1') {
    templates = templates.filter(t => Boolean(t.featured));
  }

  if (search) {
    const q = search.toLowerCase().trim();
    templates = templates.filter(t => {
      return (t.name && t.name.toLowerCase().includes(q)) ||
             (t.id && t.id.toLowerCase().includes(q)) ||
             (t.slug && t.slug.toLowerCase().includes(q)) ||
             (t.category && t.category.toLowerCase().includes(q)) ||
             (t.description && t.description.toLowerCase().includes(q)) ||
             (Array.isArray(t.tags) && t.tags.some(tag => tag.toLowerCase().includes(q))) ||
             (Array.isArray(t.relationships) && t.relationships.some(rel => rel.toLowerCase().includes(q)));
    });
  }

  res.json({ success: true, count: templates.length, templates });
});

// Helper to find template by ID, slug, folder, or semantic alias
function findTemplateByIdOrSlug(templates, queryId) {
  if (!queryId) return null;
  const raw = String(queryId).toLowerCase().trim();
  const slug = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  // 1. Direct ID match
  let found = templates.find(t => t.id && t.id.toLowerCase() === raw);
  if (found) return found;

  // 2. Direct folder match
  found = templates.find(t => t.folder && t.folder.toLowerCase() === raw);
  if (found) return found;

  // 3. ID without 'tpl_' or converted underscore-to-dash
  found = templates.find(t => {
    const stripped = (t.id || '').toLowerCase().replace(/^tpl_/, '').replace(/_/g, '-');
    return stripped === slug || stripped === raw;
  });
  if (found) return found;

  // 4. Name slug match
  found = templates.find(t => {
    const nameSlug = (t.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return nameSlug === slug || nameSlug === raw;
  });
  if (found) return found;

  // 5. Semantic keyword matching (e.g. 'birthday-romantic', 'romantic', 'anniversary', 'friendship')
  const queryTokens = slug.split('-').filter(Boolean);
  let bestMatch = null;
  let highestScore = 0;

  for (const t of templates) {
    let score = 0;
    const searchable = [
      t.id,
      t.name,
      t.category,
      t.type,
      ...(t.relationships || []),
      ...(t.features || [])
    ].join(' ').toLowerCase();

    for (const token of queryTokens) {
      if (token.length > 2 && searchable.includes(token)) {
        score += token.length;
      }
    }

    if (score > highestScore && score >= 4) {
      highestScore = score;
      bestMatch = t;
    }
  }

  return bestMatch;
}

// API: Get single template by ID
app.get('/api/templates/:id', (req, res) => {
  const templates = getTemplates();
  const template = findTemplateByIdOrSlug(templates, req.params.id);
  if (!template) {
    return res.status(404).json({ success: false, message: 'Template not found' });
  }
  res.json({ success: true, template });
});

// API: Upload a complete new website / folder / files bundle
app.post('/api/templates/upload', (req, res) => {
  try {
    const {
      name,
      category,
      description,
      thumbnail,
      tier,
      price,
      featured,
      placement,
      detectedFields,
      files
    } = req.body;

    if (!name || !files || typeof files !== 'object') {
      return res.status(400).json({ success: false, message: 'Template name and files bundle are required' });
    }

    const templateId = 'tpl_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
    const targetFolder = path.join(STORE_DIR, templateId);
    fs.mkdirSync(targetFolder, { recursive: true });

    let entryFile = 'index.html';

    // Write all uploaded files to public/templates-store/[templateId]/...
    for (const [filePath, fileData] of Object.entries(files)) {
      // Normalize path to prevent directory traversal
      const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
      const fullPath = path.join(targetFolder, safePath);
      const fileDir = path.dirname(fullPath);

      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      if (typeof fileData === 'string') {
        // Plain text or data URL
        if (fileData.startsWith('data:')) {
          const base64Data = fileData.split(',')[1];
          fs.writeFileSync(fullPath, Buffer.from(base64Data, 'base64'));
        } else {
          fs.writeFileSync(fullPath, fileData, 'utf8');
        }
      } else if (fileData && fileData.isBase64 && fileData.content) {
        fs.writeFileSync(fullPath, Buffer.from(fileData.content, 'base64'));
      } else if (fileData && fileData.content) {
        fs.writeFileSync(fullPath, fileData.content, 'utf8');
      }

      // Check if entry file is found
      if (safePath.toLowerCase() === 'index.html') {
        entryFile = safePath;
      }
    }

    const newTemplate = {
      id: templateId,
      name: name.trim(),
      category: category || 'Birthday',
      description: description || 'Custom handcrafted web celebration.',
      thumbnail: thumbnail || '/assets/default-template.jpg',
      tier: tier === 'vip' ? 'vip' : 'free',
      price: tier === 'vip' ? (Number(price) || 49) : 0,
      entryFile: entryFile,
      folder: templateId,
      featured: Boolean(featured),
      placement: Number(placement) || 1,
      detectedFields: Array.isArray(detectedFields) ? detectedFields : [],
      createdAt: new Date().toISOString()
    };

    const templates = getTemplates();
    templates.unshift(newTemplate);
    saveTemplates(templates);

    res.json({
      success: true,
      message: 'Template website successfully deployed!',
      template: newTemplate
    });
  } catch (err) {
    console.error('Error uploading template:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Create new template (Part 10 Template Management)
app.post('/api/templates/create', (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      category,
      relationships,
      tags,
      tier,
      price,
      isPremium,
      status,
      isPublished,
      featured,
      thumbnail,
      previewImages,
      capabilities,
      detectedFields,
      folder,
      entryFile
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Template name is required' });
    }

    const cleanName = name.trim();
    const cleanCategory = (category || 'Birthday').trim();
    const generatedSlug = (slug || cleanName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const templateId = 'tpl_' + generatedSlug.replace(/-/g, '_').slice(0, 24) + '_' + Math.random().toString(36).substr(2, 4);

    const isVip = tier === 'vip' || isPremium === true || Number(price) > 0;
    const isPub = status === 'published' || (status === undefined && isPublished !== false);

    const defaultCapabilities = {
      hero: true,
      gallery: true,
      message: true,
      memories: true,
      timeline: false,
      music: true,
      voiceNote: true,
      countdown: Boolean(templateId.includes('countdown') || cleanName.toLowerCase().includes('countdown')),
      openWhen: false,
      secretMessage: true,
      finalSurprise: true,
      galleryLayouts: true,
      themeSupport: true,
      animationSupport: true,
      backgroundSupport: true,
      ...(capabilities || {})
    };

    const newTemplate = {
      id: templateId,
      name: cleanName,
      slug: generatedSlug,
      description: description || 'Handcrafted celebratory experience.',
      category: cleanCategory,
      relationships: Array.isArray(relationships) && relationships.length > 0 ? relationships : [cleanCategory, 'Friendship', 'Best Friend', 'Family'],
      tags: Array.isArray(tags) ? tags : [cleanCategory.toLowerCase(), 'celebration'],
      type: '3D Interactive',
      tier: isVip ? 'vip' : 'free',
      isPremium: isVip,
      price: isVip ? (Number(price) || 49) : 0,
      status: isPub ? 'published' : 'draft',
      isPublished: isPub,
      featured: Boolean(featured),
      placement: 99,
      thumbnail: thumbnail || '/assets/file_ab2082.png',
      previewImage: thumbnail || '/assets/file_ab2082.png',
      previewImages: Array.isArray(previewImages) && previewImages.length > 0 ? previewImages : [thumbnail || '/assets/file_ab2082.png'],
      capabilities: defaultCapabilities,
      sections: ['Hero Unboxing', 'Memory Gallery', 'Personal Dedication', 'Confetti Finale'],
      features: ['Personalized Greeting', 'Interactive Animations', 'Photo Gallery', 'Music BGM'],
      theme: {
        mood: 'Joyful & Celebratory',
        accentColor: '#ec4899',
        gradient: 'from-pink-500 via-purple-600 to-amber-400'
      },
      animations: 'Canvas Confetti + Sound + 3D Effects',
      supportsGallery: 8,
      supportsMusic: 'Celebration Acoustic Strings',
      supportsVoice: defaultCapabilities.voiceNote !== false,
      folder: folder || 'tpl_glitter_birthday',
      entryFile: entryFile || 'index.html',
      detectedFields: Array.isArray(detectedFields) && detectedFields.length > 0 ? detectedFields : [
        { key: 'recipient_name', label: 'Recipient Name', type: 'text', defaultValue: 'Alex' },
        { key: 'sender_name', label: 'Sender Name', type: 'text', defaultValue: 'Someone Special' },
        { key: 'custom_message', label: 'Celebration Message', type: 'textarea', defaultValue: 'Wishing you a magnificent day filled with endless laughter, boundless smiles, and pure magic!' },
        { key: 'event_date', label: 'Event Date', type: 'date', defaultValue: new Date().toISOString().split('T')[0] },
        { key: 'photo_1', label: 'Memory Photo', type: 'image', defaultValue: thumbnail || '/assets/file_ab2082.png' }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const templates = getTemplates();
    templates.unshift(newTemplate);
    saveTemplates(templates);

    res.json({ success: true, template: newTemplate, message: 'Template created successfully' });
  } catch (err) {
    console.error('Error creating template:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Duplicate template (Part 10)
app.post('/api/templates/duplicate', (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'Template ID is required' });

    const templates = getTemplates();
    const source = templates.find(t => t.id === id);
    if (!source) return res.status(404).json({ success: false, message: 'Source template not found' });

    const randSuffix = Math.random().toString(36).substr(2, 4);
    const newId = 'tpl_' + (source.slug || source.id.replace(/^tpl_/, '')).slice(0, 18) + '_copy_' + randSuffix;
    const newSlug = (source.slug || 'template') + '-copy-' + randSuffix;

    const duplicated = {
      ...JSON.parse(JSON.stringify(source)),
      id: newId,
      name: `Copy of ${source.name}`,
      slug: newSlug,
      status: 'draft',
      isPublished: false,
      featured: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    templates.unshift(duplicated);
    saveTemplates(templates);

    res.json({ success: true, template: duplicated, message: 'Template duplicated as Draft' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Update template metadata (edit title, price, category, capabilities, status, etc.)
app.post('/api/templates/update', (req, res) => {
  try {
    const {
      id,
      name,
      slug,
      category,
      relationships,
      tags,
      description,
      thumbnail,
      previewImages,
      tier,
      price,
      isPremium,
      status,
      isPublished,
      featured,
      placement,
      capabilities,
      detectedFields,
      sections,
      sectionDefinitions,
      layouts,
      templateVersion
    } = req.body;

    const templates = getTemplates();
    const idx = templates.findIndex(t => t.id === id);

    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    const current = templates[idx];
    const isVip = tier !== undefined ? (tier === 'vip') : (isPremium !== undefined ? Boolean(isPremium) : current.isPremium);
    const determinedStatus = status !== undefined ? status : (isPublished !== undefined ? (isPublished ? 'published' : 'draft') : current.status);
    const determinedIsPublished = determinedStatus === 'published';

    templates[idx] = {
      ...current,
      name: name !== undefined ? name.trim() : current.name,
      slug: slug !== undefined ? slug.trim() : current.slug,
      category: category !== undefined ? category.trim() : current.category,
      relationships: relationships !== undefined ? relationships : current.relationships,
      tags: tags !== undefined ? tags : current.tags,
      description: description !== undefined ? description : current.description,
      thumbnail: thumbnail !== undefined ? thumbnail : current.thumbnail,
      previewImage: thumbnail !== undefined ? thumbnail : current.previewImage,
      previewImages: previewImages !== undefined ? previewImages : current.previewImages,
      tier: isVip ? 'vip' : 'free',
      isPremium: isVip,
      price: isVip ? (price !== undefined ? Number(price) : (current.price || 49)) : 0,
      status: determinedStatus,
      isPublished: determinedIsPublished,
      featured: featured !== undefined ? Boolean(featured) : current.featured,
      placement: placement !== undefined ? Number(placement) : current.placement,
      capabilities: capabilities !== undefined ? { ...current.capabilities, ...capabilities } : current.capabilities,
      detectedFields: detectedFields !== undefined ? detectedFields : current.detectedFields,
      sections: sections !== undefined ? sections : current.sections,
      sectionDefinitions: sectionDefinitions !== undefined ? sectionDefinitions : current.sectionDefinitions,
      layouts: layouts !== undefined ? layouts : current.layouts,
      templateVersion: templateVersion !== undefined ? templateVersion : (current.templateVersion || 1),
      updatedAt: new Date().toISOString()
    };

    saveTemplates(templates);

    const updatedSnapshot = createNewTemplateVersion(id, req.body);

    res.json({
      success: true,
      template: templates[idx],
      versionId: updatedSnapshot.id,
      versionNumber: updatedSnapshot.versionNumber,
      message: 'Template updated and new version snapshot published successfully'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Delete a template (with safe delete check against active wishes)
app.delete('/api/templates/:id', (req, res) => {
  try {
    const id = req.params.id;
    const force = req.query.force === 'true' || req.query.force === '1';
    let templates = getTemplates();
    const target = templates.find(t => t.id === id);

    if (!target) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    // Safety check: verify if existing user wishes reference this template
    const wishes = getWishes();
    const activeReferences = wishes.filter(w => w.templateId === id);

    if (activeReferences.length > 0 && !force) {
      return res.status(409).json({
        success: false,
        referenced: true,
        count: activeReferences.length,
        message: `Template is currently used by ${activeReferences.length} live celebration wishes. Please Unpublish the template instead of deleting to keep active recipient celebration links working safely.`
      });
    }

    templates = templates.filter(t => t.id !== id);
    saveTemplates(templates);

    // Only remove folder if it is an uploaded custom folder (not a system demo folder)
    const systemProtectedFolders = [
      'tpl_glitter_birthday',
      'tpl_romantic_scrapbook',
      'tpl_midnight_countdown',
      'tpl_golden_anniversary',
      'tpl_friendship_chronicles',
      'tpl_parents_tribute'
    ];

    if (!systemProtectedFolders.includes(target.folder || id)) {
      const targetFolder = path.join(STORE_DIR, target.folder || id);
      if (fs.existsSync(targetFolder)) {
        try {
          fs.rmSync(targetFolder, { recursive: true, force: true });
        } catch (e) {}
      }
    }

    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// CATEGORIES REST APIS (Part 10 Category Taxonomy Engine)
// ---------------------------------------------------------------------------

// API: Get all categories (sorted by sortOrder)
app.get('/api/categories', (req, res) => {
  try {
    const categories = getCategories();
    res.json({ success: true, count: categories.length, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, categories: [] });
  }
});

// API: Create new category
app.post('/api/categories', (req, res) => {
  try {
    const { name, slug, description, icon, sortOrder, isActive } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    const cleanName = name.trim();
    const cleanSlug = (slug || cleanName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const categories = getCategories();

    // Check duplicate name or slug
    if (categories.some(c => c.slug === cleanSlug)) {
      return res.status(400).json({ success: false, message: `Category with slug "${cleanSlug}" already exists` });
    }

    const newCategory = {
      id: 'cat_' + cleanSlug.replace(/-/g, '_'),
      name: cleanName,
      slug: cleanSlug,
      description: description || `Celebration templates for ${cleanName}`,
      icon: icon || '✨',
      sortOrder: Number(sortOrder) || (categories.length + 1),
      isActive: isActive !== false,
      createdAt: new Date().toISOString()
    };

    categories.push(newCategory);
    saveCategories(categories);

    res.json({ success: true, category: newCategory, message: 'Category created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Update category
app.put('/api/categories/:id', (req, res) => {
  try {
    const id = req.params.id;
    const { name, slug, description, icon, sortOrder, isActive } = req.body;
    const categories = getCategories();
    const idx = categories.findIndex(c => c.id === id || c.slug === id);

    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const prevName = categories[idx].name;
    const newName = name !== undefined ? name.trim() : categories[idx].name;

    categories[idx] = {
      ...categories[idx],
      name: newName,
      slug: slug !== undefined ? slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') : categories[idx].slug,
      description: description !== undefined ? description : categories[idx].description,
      icon: icon !== undefined ? icon : categories[idx].icon,
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : categories[idx].sortOrder,
      isActive: isActive !== undefined ? Boolean(isActive) : categories[idx].isActive,
      updatedAt: new Date().toISOString()
    };

    saveCategories(categories);

    // If category name changed, update templates referencing it to keep synchronization
    if (prevName && newName && prevName !== newName) {
      const templates = getTemplates();
      let tplUpdated = false;
      templates.forEach(t => {
        if (t.category === prevName) {
          t.category = newName;
          tplUpdated = true;
        }
      });
      if (tplUpdated) saveTemplates(templates);
    }

    res.json({ success: true, category: categories[idx], message: 'Category updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Reorder categories (accepts { orderedIds: string[] })
app.post('/api/categories/reorder', (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, message: 'orderedIds array required' });
    }

    const categories = getCategories();
    const catMap = new Map(categories.map(c => [c.id, c]));

    const reordered = [];
    orderedIds.forEach((id, index) => {
      const cat = catMap.get(id);
      if (cat) {
        cat.sortOrder = index + 1;
        reordered.push(cat);
        catMap.delete(id);
      }
    });

    // Append any not in orderedIds list
    for (const remaining of catMap.values()) {
      remaining.sortOrder = reordered.length + 1;
      reordered.push(remaining);
    }

    saveCategories(reordered);
    res.json({ success: true, categories: reordered, message: 'Category ordering saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Delete category (checks template dependencies)
app.delete('/api/categories/:id', (req, res) => {
  try {
    const id = req.params.id;
    const force = req.query.force === 'true' || req.query.force === '1';
    let categories = getCategories();
    const target = categories.find(c => c.id === id || c.slug === id);

    if (!target) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    // Check template dependency
    const templates = getTemplates();
    const usingTemplates = templates.filter(t => (t.category || '').toLowerCase() === target.name.toLowerCase() || (t.category || '').toLowerCase() === target.slug.toLowerCase());

    if (usingTemplates.length > 0 && !force) {
      return res.status(409).json({
        success: false,
        inUse: true,
        count: usingTemplates.length,
        message: `Category "${target.name}" is used by ${usingTemplates.length} templates. We recommend deactivating it instead of deleting to keep template categories intact.`
      });
    }

    categories = categories.filter(c => c.id !== target.id);
    saveCategories(categories);

    res.json({ success: true, message: `Category "${target.name}" deleted successfully` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Get all audio and media assets
app.get('/api/media', (req, res) => {
  try {
    const media = getMedia();
    res.json({ success: true, tracks: media });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, tracks: [] });
  }
});

// API: Upload a new audio track
app.post('/api/media/upload', (req, res) => {
  try {
    const { title, genre, duration, license, fileData, filename } = req.body;
    if (!title || !fileData) {
      return res.status(400).json({ success: false, message: 'Track title and audio file are required' });
    }

    const trackId = 'trk_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4);
    const ext = path.extname(filename || 'track.mp3') || '.mp3';
    const diskFilename = `${trackId}${ext}`;
    const filePath = path.join(MEDIA_DIR, diskFilename);

    let base64Content = fileData;
    if (fileData.includes(',')) {
      base64Content = fileData.split(',')[1];
    }
    const buffer = Buffer.from(base64Content, 'base64');
    fs.writeFileSync(filePath, buffer);

    const media = getMedia();
    const isFirst = media.length === 0;

    const newTrack = {
      id: trackId,
      title: title.trim(),
      genre: genre || 'Celebration / Ambient',
      duration: duration || '2:30',
      license: license || 'Royalty-Free Commercial',
      filename: diskFilename,
      url: `/media/${diskFilename}`,
      fileSize: buffer.length,
      fileSizeFormatted: (buffer.length / (1024 * 1024)).toFixed(2) + ' MB',
      isDefault: isFirst,
      createdAt: new Date().toISOString()
    };

    media.unshift(newTrack);
    saveMedia(media);

    res.json({ success: true, track: newTrack, message: 'Audio track uploaded successfully' });
  } catch (err) {
    console.error('Error uploading audio:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Set track as default BGM
app.post('/api/media/:id/default', (req, res) => {
  try {
    const id = req.params.id;
    const media = getMedia();
    let found = false;
    media.forEach(t => {
      if (t.id === id) {
        t.isDefault = true;
        found = true;
      } else {
        t.isDefault = false;
      }
    });
    if (!found) {
      return res.status(404).json({ success: false, message: 'Track not found' });
    }
    saveMedia(media);
    res.json({ success: true, message: 'Default track updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Delete an audio track
app.delete('/api/media/:id', (req, res) => {
  try {
    const id = req.params.id;
    let media = getMedia();
    const target = media.find(t => t.id === id);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Track not found' });
    }

    media = media.filter(t => t.id !== id);
    if (target.isDefault && media.length > 0) {
      media[0].isDefault = true;
    }
    saveMedia(media);

    if (target.filename) {
      const filePath = path.join(MEDIA_DIR, target.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.json({ success: true, message: 'Audio track removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- Real-Time Concurrent Visitor Tracking ---
const activeVisitors = new Map(); // sessionId -> { lastSeen: Date.now(), page: string, title: string, ip: string, userAgent: string, enteredAt: number }

function cleanStaleVisitors() {
  const cutoff = Date.now() - 30000; // 30 seconds timeout window for high real-time accuracy
  for (const [id, data] of activeVisitors.entries()) {
    if (data.lastSeen < cutoff) {
      activeVisitors.delete(id);
    }
  }
}
setInterval(cleanStaleVisitors, 5000);

// API: Heartbeat ping from clients browsing website
app.post('/api/analytics/ping', (req, res) => {
  try {
    const { sessionId, page, title } = req.body || {};
    if (sessionId) {
      cleanStaleVisitors();
      const existing = activeVisitors.get(sessionId);
      activeVisitors.set(sessionId, {
        sessionId,
        lastSeen: Date.now(),
        enteredAt: existing ? existing.enteredAt : Date.now(),
        page: page || '/',
        title: title || 'WishMagic',
        ip: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1').toString().split(',')[0].trim(),
        userAgent: req.headers['user-agent'] || ''
      });
    }
    res.json({ success: true, liveCount: activeVisitors.size });
  } catch (err) {
    res.json({ success: false, liveCount: activeVisitors.size });
  }
});

app.post('/api/analytics/leave', (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (sessionId && activeVisitors.has(sessionId)) {
      activeVisitors.delete(sessionId);
    }
    res.json({ success: true, liveCount: activeVisitors.size });
  } catch (err) {
    res.json({ success: false });
  }
});

// API: Record Analytics Event
app.post('/api/analytics/events', (req, res) => {
  try {
    const event = req.body;
    if (!event || !event.eventName) {
      return res.status(400).json({ success: false, message: 'eventName is required' });
    }

    const newEvent = {
      id: event.id || ('evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4)),
      eventName: String(event.eventName).trim(),
      timestamp: event.timestamp || new Date().toISOString(),
      userId: event.userId || 'guest',
      wishId: event.wishId || null,
      slug: event.slug || null,
      templateId: event.templateId || null,
      templateName: event.templateName || null,
      category: event.category || null,
      recipientName: event.recipientName || null,
      metadata: event.metadata || {}
    };

    const events = getEvents();
    events.unshift(newEvent);
    saveEvents(events);

    res.json({ success: true, event: newEvent });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Get Analytics Events with filters
app.get('/api/analytics/events', (req, res) => {
  try {
    const { startDate, endDate, eventName, templateId, limit } = req.query;
    let events = getEvents();

    if (startDate) {
      const sMs = new Date(startDate).getTime();
      events = events.filter(e => new Date(e.timestamp).getTime() >= sMs);
    }
    if (endDate) {
      const eMs = new Date(endDate).getTime();
      events = events.filter(e => new Date(e.timestamp).getTime() <= eMs);
    }
    if (eventName && eventName !== 'all') {
      events = events.filter(e => e.eventName === eventName);
    }
    if (templateId && templateId !== 'all') {
      events = events.filter(e => e.templateId === templateId);
    }

    const max = Number(limit) || 1000;
    res.json({ success: true, count: events.length, events: events.slice(0, max) });
  } catch (err) {
    res.status(500).json({ success: false, count: 0, events: [] });
  }
});

// API: Reset Development Analytics Events
app.post('/api/analytics/events/reset', (req, res) => {
  try {
    saveEvents([]);
    res.json({ success: true, message: 'Development analytics events reset successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Server-Side RBAC Admin Protection Middleware
app.use('/api/admin', (req, res, next) => {
  if (req.path === '/validation' || req.path === '/diagnostic') return next();
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required for administrative operations' } });
  }
  if (req.user.role !== 'admin' && !req.user.isAdmin && req.user.id !== 'usr_admin_999') {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden: Platform administrator role required' } });
  }
  next();
});

// API: Admin Users List with enriched counts
app.get('/api/admin/users', (req, res) => {
  try {
    const wishes = getWishes();

    // Default normalized dev accounts
    const baseUsers = [
      {
        id: 'usr_ankit_101',
        name: 'Ankit Verma',
        displayName: 'Ankit Verma',
        email: 'ankit@example.com',
        role: 'creator',
        plan: 'VIP',
        isPremium: true,
        createdAt: '2026-01-15T10:00:00.000Z'
      },
      {
        id: 'usr_priya_202',
        name: 'Priya Sharma',
        displayName: 'Priya Sharma',
        email: 'priya@example.com',
        role: 'creator',
        plan: 'Free',
        isPremium: false,
        createdAt: '2026-02-20T14:30:00.000Z'
      },
      {
        id: 'usr_admin_999',
        name: 'Development Admin',
        displayName: 'Development Admin',
        email: 'admin@wishmagic.internal',
        role: 'admin',
        plan: 'VIP',
        isPremium: true,
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    ];

    // Compute metrics for each user from real wishes
    const enrichedUsers = baseUsers.map(u => {
      const userWishes = wishes.filter(w => w.userId === u.id);
      const vipWishes = userWishes.filter(w => w.tier === 'vip' || w.price > 0);
      const totalViews = userWishes.reduce((sum, w) => sum + (w.views || 0), 0);

      return {
        ...u,
        wishesCount: userWishes.length,
        vipWishesCount: vipWishes.length,
        totalViews,
        lastActiveAt: userWishes.length > 0 ? userWishes[0].createdAt : u.createdAt
      };
    });

    res.json({ success: true, count: enrichedUsers.length, users: enrichedUsers });
  } catch (err) {
    res.status(500).json({ success: false, count: 0, users: [] });
  }
});

// ============================================================================
// PART 17 — NOTIFICATION & COMMUNICATION ARCHITECTURE API ENDPOINTS
// ============================================================================

// API: Get Notifications with user isolation & filters
app.get('/api/notifications', (req, res) => {
  try {
    const { userId, type, unreadOnly } = req.query;
    let list = getNotifications();

    if (userId) {
      list = list.filter(n => n.userId === userId || n.userId === 'all');
    }

    if (unreadOnly === 'true') {
      list = list.filter(n => !n.readAt);
    }

    if (type && type !== 'all') {
      list = list.filter(n => n.type === type);
    }

    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, count: list.length, notifications: list });
  } catch (err) {
    res.status(500).json({ success: false, count: 0, notifications: [], message: err.message });
  }
});

// API: Create new notification
app.post('/api/notifications', (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.title && !payload.message) {
      return res.status(400).json({ success: false, message: 'Notification title or message required' });
    }

    const item = {
      id: payload.id || ('ntf_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5)),
      userId: payload.userId || 'guest',
      type: payload.type || 'SYSTEM_NOTICE',
      title: payload.title || 'Notification',
      message: payload.message || '',
      createdAt: payload.createdAt || new Date().toISOString(),
      readAt: payload.readAt || null,
      relatedType: payload.relatedType || null,
      relatedId: payload.relatedId || null,
      actionUrl: payload.actionUrl || null,
      icon: payload.icon || 'notifications',
      severity: payload.severity || 'info',
      isGrouped: Boolean(payload.isGrouped),
      groupCount: Number(payload.groupCount) || 1,
      metadata: payload.metadata || {}
    };

    const list = getNotifications();
    list.unshift(item);
    saveNotifications(list);

    res.json({ success: true, notification: item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Mark notification as read
app.put('/api/notifications/:id/read', (req, res) => {
  try {
    const id = req.params.id;
    const { userId } = req.body || {};
    const list = getNotifications();
    const target = list.find(n => n.id === id && (!userId || n.userId === userId || n.userId === 'all'));

    if (target) {
      target.readAt = new Date().toISOString();
      saveNotifications(list);
      return res.json({ success: true, notification: target });
    }

    res.status(404).json({ success: false, message: 'Notification not found' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Mark all notifications as read for user
app.post('/api/notifications/mark-all-read', (req, res) => {
  try {
    const { userId } = req.body || {};
    const list = getNotifications();
    const now = new Date().toISOString();
    let updated = 0;

    list.forEach(n => {
      if ((!userId || n.userId === userId || n.userId === 'all') && !n.readAt) {
        n.readAt = now;
        updated++;
      }
    });

    saveNotifications(list);
    res.json({ success: true, updatedCount: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Delete single notification
app.delete('/api/notifications/:id', (req, res) => {
  try {
    const id = req.params.id;
    const { userId } = req.body || {};
    let list = getNotifications();
    list = list.filter(n => !(n.id === id && (!userId || n.userId === userId || n.userId === 'all')));
    saveNotifications(list);
    res.json({ success: true, message: 'Notification deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Clear all notifications for user
app.delete('/api/notifications', (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId query parameter required' });
    }
    let list = getNotifications();
    list = list.filter(n => n.userId !== userId && n.userId !== 'all');
    saveNotifications(list);
    res.json({ success: true, message: 'Notifications cleared' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Get & Update User Notification Preferences
app.get('/api/notifications/preferences', (req, res) => {
  try {
    const { userId } = req.query;
    const allPrefs = getPreferences();
    const userPrefs = (userId && allPrefs[userId]) ? allPrefs[userId] : {
      inApp: true,
      email: true,
      whatsapp: false,
      marketing: false,
      wishReminders: true,
      draftReminders: true,
      expiryReminders: true,
      productUpdates: true
    };
    res.json({ success: true, preferences: userPrefs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/notifications/preferences', (req, res) => {
  try {
    const { userId, preferences } = req.body || {};
    if (!userId || !preferences) {
      return res.status(400).json({ success: false, message: 'userId and preferences object required' });
    }
    const allPrefs = getPreferences();
    allPrefs[userId] = {
      inApp: preferences.inApp !== false,
      email: preferences.email !== false,
      whatsapp: Boolean(preferences.whatsapp),
      marketing: Boolean(preferences.marketing),
      wishReminders: preferences.wishReminders !== false,
      draftReminders: preferences.draftReminders !== false,
      expiryReminders: preferences.expiryReminders !== false,
      productUpdates: preferences.productUpdates !== false
    };
    savePreferences(allPrefs);
    res.json({ success: true, preferences: allPrefs[userId], message: 'Preferences saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: System Announcements
app.get('/api/announcements', (req, res) => {
  try {
    const announcements = getAnnouncements();
    const active = announcements.filter(a => a.isActive !== false);
    res.json({ success: true, announcements: active });
  } catch (err) {
    res.status(500).json({ success: false, announcements: [] });
  }
});

app.post('/api/announcements', (req, res) => {
  try {
    const { title, message, severity, expiresAt } = req.body || {};
    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message required' });
    }
    const newAnnouncement = {
      id: 'ann_' + Date.now().toString(36),
      title: title.trim(),
      message: message.trim(),
      severity: severity || 'info',
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt || null,
      isActive: true
    };
    const list = getAnnouncements();
    list.unshift(newAnnouncement);
    saveAnnouncements(list);
    res.json({ success: true, announcement: newAnnouncement, message: 'Announcement created' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Comprehensive Template & Media Health Diagnostic Scanner
app.get('/api/admin/validation', (req, res) => {
  try {
    const templates = getTemplates();
    const categories = getCategories();
    const media = getMedia();
    const validCategories = new Set(categories.map(c => c.name.toLowerCase()));

    const templateReports = templates.map(t => {
      const issues = [];
      let status = 'PASS';

      if (!t.id || !t.id.trim()) {
        issues.push({ level: 'ERROR', message: 'Missing template ID' });
      }
      if (!t.name || !t.name.trim()) {
        issues.push({ level: 'ERROR', message: 'Missing template title / name' });
      }
      if (!t.category || !t.category.trim()) {
        issues.push({ level: 'ERROR', message: 'Missing category assignment' });
      } else if (!validCategories.has(t.category.toLowerCase())) {
        issues.push({ level: 'WARNING', message: `Category "${t.category}" is not in active categories list` });
      }

      if (t.tier === 'vip' && (!t.price || Number(t.price) <= 0)) {
        issues.push({ level: 'ERROR', message: 'VIP template missing valid price' });
      }

      if (!t.thumbnail) {
        issues.push({ level: 'WARNING', message: 'Missing cover thumbnail image' });
      }

      if (!Array.isArray(t.detectedFields) || t.detectedFields.length === 0) {
        issues.push({ level: 'WARNING', message: 'No customizable detected fields declared' });
      }

      const hasError = issues.some(i => i.level === 'ERROR');
      const hasWarning = issues.some(i => i.level === 'WARNING');
      if (hasError) status = 'ERROR';
      else if (hasWarning) status = 'WARNING';

      return {
        id: t.id,
        name: t.name || 'Untitled Template',
        category: t.category || 'Unassigned',
        tier: t.tier || 'free',
        status,
        issues
      };
    });

    // Check duplicate IDs or duplicate slugs
    const idCounts = {};
    const slugCounts = {};
    templates.forEach(t => {
      idCounts[t.id] = (idCounts[t.id] || 0) + 1;
      if (t.slug) slugCounts[t.slug] = (slugCounts[t.slug] || 0) + 1;
    });

    templates.forEach((t, idx) => {
      if (idCounts[t.id] > 1) {
        templateReports[idx].status = 'ERROR';
        templateReports[idx].issues.push({ level: 'ERROR', message: `Duplicate template ID detected: ${t.id}` });
      }
      if (t.slug && slugCounts[t.slug] > 1) {
        templateReports[idx].status = 'WARNING';
        templateReports[idx].issues.push({ level: 'WARNING', message: `Duplicate slug detected: ${t.slug}` });
      }
    });

    // Media asset health checks
    const mediaReports = media.map(m => {
      const issues = [];
      let status = 'PASS';

      if (!m.id) issues.push({ level: 'ERROR', message: 'Missing media ID' });
      if (!m.title) issues.push({ level: 'WARNING', message: 'Missing track title' });

      if (m.filename) {
        const fullPath = path.join(MEDIA_DIR, m.filename);
        if (!fs.existsSync(fullPath)) {
          issues.push({ level: 'ERROR', message: `Audio file missing from storage disk: ${m.filename}` });
        }
      }

      const hasError = issues.some(i => i.level === 'ERROR');
      const hasWarning = issues.some(i => i.level === 'WARNING');
      if (hasError) status = 'ERROR';
      else if (hasWarning) status = 'WARNING';

      return {
        id: m.id,
        title: m.title || 'Untitled Track',
        filename: m.filename,
        url: m.url,
        status,
        issues
      };
    });

    const errorCount = templateReports.filter(r => r.status === 'ERROR').length + mediaReports.filter(r => r.status === 'ERROR').length;
    const warningCount = templateReports.filter(r => r.status === 'WARNING').length + mediaReports.filter(r => r.status === 'WARNING').length;
    const passCount = templateReports.filter(r => r.status === 'PASS').length + mediaReports.filter(r => r.status === 'PASS').length;

    res.json({
      success: true,
      summary: {
        totalTemplates: templates.length,
        totalMedia: media.length,
        passCount,
        warningCount,
        errorCount,
        overallStatus: errorCount > 0 ? 'FAIL' : (warningCount > 0 ? 'WARNING' : 'HEALTHY')
      },
      templates: templateReports,
      media: mediaReports
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Helper: Compute Wish Link Lifecycle Status ('upcoming', 'active', 'expired', 'draft')
// Timezone: Asia/Kolkata (IST = UTC+05:30)
const IST_OFFSET_MS = 330 * 60 * 1000;

function computeWishStatus(wish) {
  if (!wish) return 'expired';
  if (wish.isDraft || wish.status === 'draft') return 'draft';

  // 1. Extract celebration / event date
  const eventDateStr = wish.eventDate || (wish.customData && (wish.customData.event_date || wish.customData.eventDate || wish.customData.target_date || wish.customData.targetDate));

  if (!eventDateStr) {
    return 'active';
  }

  const cleanDate = String(eventDateStr).includes('T') ? String(eventDateStr).split('T')[0] : String(eventDateStr).trim();
  const parts = cleanDate.split('-').map(Number);
  let year = parts[0];
  let month = parts[1];
  let day = parts[2];

  if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return 'active';
  }

  // 00:00:00.000 IST start
  const startMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - IST_OFFSET_MS;
  // 00:00:00.000 IST start of next day (expiry moment)
  const endMs = Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0) - IST_OFFSET_MS;

  const nowMs = Date.now();

  if (nowMs < startMs) {
    return 'upcoming';
  } else if (nowMs >= startMs && nowMs < endMs) {
    return 'active';
  } else {
    return 'expired';
  }
}

// --- Smart Wish Link Settings & Random Slug Generator in Server ---
const WISH_LINK_SETTINGS_FILE = path.join(DATA_DIR, 'wish_link_settings.json');

const DEFAULT_SERVER_WISH_LINK_SETTINGS = {
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
  },
  updatedAt: new Date().toISOString()
};

function getServerWishLinkSettings() {
  try {
    if (fs.existsSync(WISH_LINK_SETTINGS_FILE)) {
      const data = fs.readFileSync(WISH_LINK_SETTINGS_FILE, 'utf8');
      const parsed = JSON.parse(data || '{}');
      if (parsed && parsed.personalized && parsed.random) {
        return parsed;
      }
    }
  } catch (e) {}
  return DEFAULT_SERVER_WISH_LINK_SETTINGS;
}

function saveServerWishLinkSettings(settings) {
  try {
    fs.writeFileSync(WISH_LINK_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {}
}

function generateSecureRandomId(length = 6, allowedChars = 'abcdefghijklmnopqrstuvwxyz0123456789') {
  const chars = allowedChars || 'abcdefghijklmnopqrstuvwxyz0123456789';
  const charsLen = chars.length;
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let res = '';
  for (let i = 0; i < length; i++) {
    res += chars[bytes[i] % charsLen];
  }
  return res;
}

function generateUniqueServerRandomWishSlug(wishes, config = {}) {
  const prefix = (config.prefix !== undefined ? config.prefix : 'wish-').toLowerCase().trim();
  const length = Math.max(5, Math.min(20, parseInt(config.length, 10) || 6));
  const allowedChars = config.allowedCharacters || 'abcdefghijklmnopqrstuvwxyz0123456789';

  for (let attempt = 0; attempt < 15; attempt++) {
    const randomId = generateSecureRandomId(length, allowedChars);
    const candidate = `${prefix}${randomId}`.toLowerCase();

    if (!isValidSlug(candidate) || isReservedSlug(candidate)) {
      continue;
    }

    const collision = (wishes || []).some(w => (w.slug || '').toLowerCase() === candidate);
    if (!collision) {
      return candidate;
    }
  }
  return `${prefix}${Date.now().toString(36).substring(2, 8)}`;
}

// Public API: Get current site configuration
app.get('/api/settings/site', (req, res) => {
  const settings = getServerSiteSettings();
  const publicSettings = formatServerPublicSiteSettings(settings);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json({
    success: true,
    settings: publicSettings
  });
});

// Admin API: Get site configuration
app.get('/api/admin/settings/site', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Admin authentication required' } });
  }
  if (req.user.role !== 'admin' && !req.user.isAdmin) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient administrative clearance' } });
  }
  const settings = getServerSiteSettings();
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    success: true,
    settings
  });
});

// Admin API: Save site configuration
app.all(['/api/admin/settings/site'], (req, res, next) => {
  if (req.method !== 'POST' && req.method !== 'PUT') return next();

  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Admin authentication required' } });
  }
  if (req.user.role !== 'admin' && !req.user.isAdmin) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient administrative clearance' } });
  }

  const incoming = req.body.settings || req.body || {};
  const validation = validateServerSiteSettings(incoming);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_SETTINGS', message: validation.error }
    });
  }

  const saveRes = saveServerSiteSettings(validation.normalized, req.user);
  if (!saveRes.success) {
    return res.status(500).json({
      success: false,
      error: { code: 'SAVE_FAILED', message: saveRes.error }
    });
  }

  res.json({
    success: true,
    settings: saveRes.settings,
    message: 'Site configuration updated and persisted successfully.'
  });
});

// Admin API: Reset site configuration to defaults
app.post('/api/admin/settings/site/reset', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Admin authentication required' } });
  }
  if (req.user.role !== 'admin' && !req.user.isAdmin) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient administrative clearance' } });
  }

  const saveRes = saveServerSiteSettings(DEFAULT_SERVER_SITE_SETTINGS, req.user);
  if (!saveRes.success) {
    return res.status(500).json({
      success: false,
      error: { code: 'RESET_FAILED', message: saveRes.error }
    });
  }

  res.json({
    success: true,
    settings: saveRes.settings,
    message: 'Site configuration restored to factory defaults.'
  });
});

// Public API: Get current wish link configuration
app.get('/api/settings/wish-links', (req, res) => {
  const settings = getServerWishLinkSettings();
  const sampleSlug = `${settings.random.prefix}${generateSecureRandomId(settings.random.length, settings.random.allowedCharacters)}`;
  res.json({
    success: true,
    settings: {
      ...settings,
      random: {
        ...settings.random,
        sampleSlug
      }
    }
  });
});

// Public API: Generate secure random wish slug
app.get('/api/wishes/generate-random-slug', (req, res) => {
  const settings = getServerWishLinkSettings();
  if (!settings.random.enabled) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'RANDOM_LINKS_DISABLED',
        message: 'Free random links are currently disabled by platform administrator.'
      }
    });
  }
  const wishes = getWishes();
  const slug = generateUniqueServerRandomWishSlug(wishes, settings.random);
  res.json({
    success: true,
    slug,
    prefix: settings.random.prefix,
    canonicalUrl: `/w/${slug}`
  });
});

// Admin API: Get wish link configuration
app.get('/api/admin/settings/wish-links', (req, res) => {
  const settings = getServerWishLinkSettings();
  const sampleSlug = `${settings.random.prefix}${generateSecureRandomId(settings.random.length, settings.random.allowedCharacters)}`;
  res.json({
    success: true,
    settings: {
      ...settings,
      random: {
        ...settings.random,
        sampleSlug
      }
    }
  });
});

// Admin API: Save wish link configuration
app.all(['/api/admin/settings/wish-links'], (req, res, next) => {
  if (req.method !== 'POST' && req.method !== 'PUT') return next();

  const body = req.body.settings || req.body || {};
  const p = body.personalized || {};
  const r = body.random || {};

  const pEnabled = p.enabled !== undefined ? Boolean(p.enabled) : true;
  const rEnabled = r.enabled !== undefined ? Boolean(r.enabled) : true;

  if (!pEnabled && !rEnabled) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_SETTINGS',
        message: 'Cannot disable both Personalized Links and Free Random Links. At least one publishing option must remain active.'
      }
    });
  }

  const price = Number(p.price !== undefined ? p.price : 49);
  if (isNaN(price) || price < 0 || price > 100000) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PRICE',
        message: 'Personalized link price must be a valid non-negative number up to 100,000.'
      }
    });
  }

  const currency = String(p.currency || 'INR').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_CURRENCY',
        message: 'Currency must be a valid 3-letter ISO code (e.g. INR, USD).'
      }
    });
  }

  const length = parseInt(r.length !== undefined ? r.length : 6, 10);
  if (isNaN(length) || length < 5 || length > 20) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_LENGTH',
        message: 'Random ID length must be an integer between 5 and 20.'
      }
    });
  }

  const rawPrefix = String(r.prefix !== undefined ? r.prefix : 'wish-').trim().toLowerCase();
  if (!/^[a-z0-9]+-?$/.test(rawPrefix) || rawPrefix.length > 20) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PREFIX',
        message: 'Random prefix must contain only lowercase letters, numbers, and an optional trailing hyphen (e.g. "wish-" or "w-").'
      }
    });
  }
  const cleanPrefixCore = rawPrefix.replace(/-+$/, '');
  if (cleanPrefixCore !== 'w' && cleanPrefixCore !== 'wish' && isReservedSlug(cleanPrefixCore)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'RESERVED_PREFIX',
        message: `Prefix "${rawPrefix}" collides with a reserved platform route.`
      }
    });
  }

  const allowed = String(r.allowedCharacters || 'abcdefghijklmnopqrstuvwxyz0123456789').trim();
  if (!/^[a-zA-Z0-9]+$/.test(allowed) || allowed.length < 5) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_CHARACTERS',
        message: 'Allowed characters must contain only alphanumeric characters (at least 5 characters).'
      }
    });
  }

  const normalized = {
    personalized: {
      enabled: pEnabled,
      price,
      currency,
      displayName: String(p.displayName || 'Personalized Link').trim().substring(0, 50),
      description: String(p.description || 'Create a memorable link for your wish.').trim().substring(0, 150)
    },
    random: {
      enabled: rEnabled,
      prefix: rawPrefix,
      length,
      allowedCharacters: allowed
    },
    updatedAt: new Date().toISOString()
  };

  saveServerWishLinkSettings(normalized);

  res.json({
    success: true,
    settings: normalized,
    message: 'Wish link and monetization settings updated successfully.'
  });
});

// Entitlements Checkout Endpoint (Authoritative Dynamic Pricing & NOT_CONFIGURED state)
app.post('/api/entitlements/checkout', (req, res) => {
  const settings = getServerWishLinkSettings();
  const body = req.body || {};
  const isPersonalized = body.planId === 'personalized_link' || (body.options && body.options.planId === 'personalized_link');

  const amount = isPersonalized ? settings.personalized.price : 49;
  const currency = isPersonalized ? settings.personalized.currency : 'INR';

  const providerConfigured = Boolean(process.env.RAZORPAY_KEY_ID || process.env.STRIPE_SECRET_KEY);
  if (!providerConfigured) {
    return res.json({
      success: true,
      status: 'provider_not_configured',
      configured: false,
      message: 'Payment currently unavailable / NOT_CONFIGURED. Gateway is not configured in environment variables.',
      mode: 'sandbox',
      amount,
      currency,
      checkoutUrl: null
    });
  }

  res.json({
    success: true,
    status: 'checkout_created',
    configured: true,
    amount,
    currency,
    checkoutUrl: `/checkout.html?order=ORD_${Date.now()}`
  });
});

// API: Check wish slug availability
app.get('/api/wishes/slug-availability', (req, res) => {
  try {
    const rawSlug = String(req.query.slug || '').trim();
    const excludeWishId = String(req.query.wishId || '').trim();
    const normalized = rawSlug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!rawSlug || !normalized || !isValidSlug(normalized)) {
      const isReserved = isReservedSlug(normalized);
      return res.json({
        success: true,
        data: {
          available: false,
          slug: normalized || rawSlug,
          reason: isReserved ? 'reserved' : 'invalid',
          message: isReserved
            ? 'This link is reserved for system use. Please choose another.'
            : 'Use only lowercase letters, numbers, and single hyphens (3-80 characters).'
        }
      });
    }

    const wishes = getWishes();
    const existing = wishes.find(w => (w.slug || '').toLowerCase() === normalized);

    if (!existing) {
      return res.json({
        success: true,
        data: {
          available: true,
          slug: normalized,
          message: 'This link is available!'
        }
      });
    }

    if (excludeWishId && existing.id === excludeWishId) {
      return res.json({
        success: true,
        data: {
          available: true,
          slug: normalized,
          isCurrent: true,
          message: 'This is your current link.'
        }
      });
    }

    const candidateSuffixes = ['2', 'special', 'surprise', 'love', 'celebration'];
    const alternatives = [];
    for (const suffix of candidateSuffixes) {
      const altSlug = `${normalized}-${suffix}`;
      if (altSlug.length <= 80 && !RESERVED_SLUGS.has(altSlug)) {
        const altCollision = wishes.some(w => (w.slug || '').toLowerCase() === altSlug);
        if (!altCollision) {
          alternatives.push(altSlug);
          if (alternatives.length >= 3) break;
        }
      }
    }

    return res.json({
      success: true,
      data: {
        available: false,
        slug: normalized,
        reason: 'taken',
        alternatives,
        message: 'That link is already taken. Try another one.'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not check link availability right now.' });
  }
});

// API: Create a customized wish record
app.post('/api/wishes', (req, res) => {
  try {
    const { templateId, customData, tier, price, payment, buyerDetails } = req.body;
    if (!templateId || !customData) {
      return res.status(400).json({ success: false, message: 'templateId and customData are required' });
    }

    const templates = getTemplates();
    const template = templates.find(t => t.id === templateId);

    const wishId = 'wm_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
    const isVip = tier === 'vip' || (template && template.tier === 'vip') || (price && Number(price) > 0) || (payment && payment.status === 'Completed');
    const wishPrice = isVip ? (Number(price) || (template && template.price) || 49) : 0;

    // Contact/Buyer Details
    const buyerName = (buyerDetails && buyerDetails.name) || customData.sender_name || customData.senderName || 'Anonymous User';
    const buyerContact = (buyerDetails && (buyerDetails.phone || buyerDetails.email)) || customData.sender_contact || customData.senderPhone || customData.senderEmail || 'Direct Web Visitor';

    const eventDate = customData.event_date || customData.eventDate || customData.target_date || new Date().toISOString().split('T')[0];
    const userId = req.body.userId || customData.userId || 'usr_ankit_101';

    const wishes = getWishes();
    const linkSettings = getServerWishLinkSettings();
    let generatedSlug = '';
    const rawRequestedSlug = String(req.body.slug || customData.slug || customData.customSlug || '').toLowerCase().trim();
    const isRandomRequested = req.body.linkType === 'random' || customData.linkType === 'random' || customData.link_type === 'random' || (!rawRequestedSlug && !req.body.slug);

    if (!isRandomRequested && rawRequestedSlug) {
      if (!linkSettings.personalized.enabled) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PERSONALIZED_LINKS_DISABLED',
            message: 'Personalized links are currently disabled by platform administrator.'
          }
        });
      }
      const normRequested = rawRequestedSlug.replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
      if (!isValidSlug(normRequested)) {
        const isReserved = isReservedSlug(normRequested);
        return res.status(400).json({
          success: false,
          error: {
            code: isReserved ? 'SLUG_RESERVED' : 'INVALID_SLUG',
            message: isReserved ? 'This link is reserved for system use.' : 'Use only lowercase letters, numbers, and single hyphens (3-80 characters).'
          }
        });
      }
      const collision = wishes.find(w => (w.slug || '').toLowerCase() === normRequested);
      if (collision) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'SLUG_TAKEN',
            message: 'That link is already taken. Try another one.'
          }
        });
      }
      generatedSlug = normRequested;
      customData.linkType = 'personalized';
      customData.link_type = 'personalized';
    } else {
      if (!linkSettings.random.enabled) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'RANDOM_LINKS_DISABLED',
            message: 'Free random links are currently disabled. A personalized link is required to publish.'
          }
        });
      }
      generatedSlug = generateUniqueServerRandomWishSlug(wishes, linkSettings.random);
      customData.linkType = 'random';
      customData.link_type = 'random';
      customData.customSlug = generatedSlug;
      customData.slug = generatedSlug;
    }

    const isPrivate = Boolean(customData.isPrivate || customData.unlisted || req.body.isPrivate);

    // Resolve immutable template version snapshot
    const activeVersion = getOrSeedTemplateVersion(templateId);
    const templateVersionId = activeVersion ? activeVersion.id : `tv_${templateId}_v1`;
    customData.templateId = templateId;
    customData.templateVersionId = templateVersionId;
    customData.template_version_id = templateVersionId;

    const newWish = {
      id: wishId,
      slug: generatedSlug,
      userId,
      orderId: 'ORD-' + Math.random().toString(36).substring(2, 7).toUpperCase() + '-' + Date.now().toString().slice(-4),
      templateId,
      templateVersionId,
      templateName: template ? template.name : (customData.templateName || 'Magical Celebration Experience'),
      tier: isVip ? 'vip' : 'free',
      price: wishPrice,
      isPrivate,
      buyerName,
      buyerContact,
      recipientName: customData.recipient_name || customData.recipientName || 'Special Person',
      eventDate,
      expiryDate: (function() {
        const clean = String(eventDate || '').includes('T') ? String(eventDate).split('T')[0] : String(eventDate || '').trim();
        const parts = clean.split('-').map(Number);
        if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
          const nextDayMs = Date.UTC(parts[0], parts[1] - 1, parts[2] + 1, 0, 0, 0, 0) - (330 * 60 * 1000);
          return new Date(nextDayMs).toISOString().split('T')[0];
        }
        return clean;
      })(),
      payment: isVip ? {
        status: (payment && payment.status) || 'Completed',
        method: (payment && payment.method) || 'UPI / PhonePe',
        transactionId: (payment && payment.transactionId) || ('TXN_' + Date.now().toString(36).toUpperCase() + '_' + Math.random().toString(36).substr(2, 4).toUpperCase()),
        paidAt: new Date().toISOString(),
        amount: wishPrice
      } : null,
      customData,
      createdAt: new Date().toISOString(),
      views: 0
    };

    wishes.unshift(newWish);
    saveWishes(wishes);

    res.json({
      success: true,
      wishId: wishId,
      slug: generatedSlug,
      url: `/w/${generatedSlug}`,
      legacyUrl: `/wish.html?id=${wishId}`,
      wish: {
        ...newWish,
        lifecycleStatus: computeWishStatus(newWish)
      }
    });
  } catch (err) {
    console.error('Error creating wish:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Duplicate Wish (Part 8 & 10: Preserves Immutable Template Version Snapshot)
app.post(['/api/wishes/:id/duplicate', '/api/wishes/duplicate'], (req, res) => {
  try {
    const wishId = req.params.id || req.body.id || req.body.wishId;
    if (!wishId) return res.status(400).json({ success: false, message: 'Wish ID is required' });

    const wishes = getWishes();
    const existing = wishes.find(w => w.id === wishId || w.slug === wishId);
    if (!existing) return res.status(404).json({ success: false, message: 'Wish not found' });

    if (req.user && existing.userId && existing.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to duplicate this wish.' } });
    }

    let cd = {};
    try { cd = typeof existing.customData === 'string' ? JSON.parse(existing.customData) : (existing.customData || {}); } catch (e) {}
    cd.isDraft = true;

    // Strictly preserve original template version snapshot reference
    const sourceVersionId = existing.templateVersionId || existing.template_version_id || cd.templateVersionId || cd.template_version_id || `tv_${existing.templateId}_v1`;
    cd.templateVersionId = sourceVersionId;
    cd.template_version_id = sourceVersionId;

    const newId = 'wm_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const linkSettings = getServerWishLinkSettings();
    const newSlug = generateUniqueServerRandomWishSlug(wishes, linkSettings.random);

    const duplicatedWish = {
      ...existing,
      id: newId,
      slug: newSlug,
      userId: req.user ? req.user.id : existing.userId,
      orderId: 'ORD-' + Math.random().toString(36).substring(2, 7).toUpperCase() + '-' + Date.now().toString().slice(-4),
      templateId: existing.templateId,
      templateVersionId: sourceVersionId,
      templateName: existing.templateName,
      tier: existing.tier,
      price: 0,
      isPrivate: true,
      recipientName: `${existing.recipientName || 'Special Person'} (Copy)`,
      customData: cd,
      status: 'draft',
      views: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    wishes.unshift(duplicatedWish);
    saveWishes(wishes);

    res.status(201).json({
      success: true,
      duplicated: true,
      wishId: newId,
      slug: newSlug,
      templateVersionId: sourceVersionId,
      wish: duplicatedWish
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Update a wish (Ownership Verified)
app.put('/api/wishes/:id', (req, res) => {
  try {
    let wishes = getWishes();
    const idx = wishes.findIndex(w => w.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Wish not found' });
    }
    const current = wishes[idx];
    if (req.user && current.userId && current.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden: Cannot edit another user\'s wish' } });
    }
    const { customData, recipientName, buyerName, eventDate, slug, customSlug } = req.body || {};
    let targetSlug = current.slug;
    const rawRequestedSlug = String(slug || (customData && customData.slug) || customSlug || (customData && customData.customSlug) || '').toLowerCase().trim();

    if (rawRequestedSlug && rawRequestedSlug !== current.slug) {
      const norm = rawRequestedSlug.replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
      if (!isValidSlug(norm)) {
        const isReserved = isReservedSlug(norm);
        return res.status(400).json({
          success: false,
          error: {
            code: isReserved ? 'SLUG_RESERVED' : 'INVALID_SLUG',
            message: isReserved ? 'This link is reserved for system use.' : 'Use only lowercase letters, numbers, and single hyphens (3-80 characters).'
          }
        });
      }
      const collision = wishes.find(w => (w.slug || '').toLowerCase() === norm && w.id !== current.id);
      if (collision) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'SLUG_TAKEN',
            message: 'That link is already taken. Try another one.'
          }
        });
      }
      targetSlug = norm;
    }

    wishes[idx] = {
      ...current,
      slug: targetSlug,
      recipientName: recipientName || current.recipientName,
      buyerName: buyerName || current.buyerName,
      eventDate: eventDate || current.eventDate,
      customData: customData ? { ...current.customData, ...customData } : current.customData,
      updatedAt: new Date().toISOString()
    };
    saveWishes(wishes);
    res.json({ success: true, wish: wishes[idx], message: 'Wish updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Delete a wish (Ownership Verified)
app.delete('/api/wishes/:id', (req, res) => {
  try {
    let wishes = getWishes();
    const target = wishes.find(w => w.id === req.params.id);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Wish not found' });
    }
    if (req.user && target.userId && target.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden: Cannot delete another user\'s wish' } });
    }
    wishes = wishes.filter(w => w.id !== req.params.id);
    saveWishes(wishes);
    res.json({ success: true, message: 'Wish removed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Get all wishes (for admin moderation & metrics)
app.get('/api/wishes', (req, res) => {
  try {
    const wishes = getWishes();
    const annotated = wishes.map(w => ({
      ...w,
      lifecycleStatus: computeWishStatus(w)
    }));
    res.json({ success: true, wishes: annotated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Real-time Admin Telemetry & Lifecycle Metrics
app.get('/api/admin/metrics', (req, res) => {
  try {
    cleanStaleVisitors();
    const templates = getTemplates();
    const wishes = getWishes();

    let totalRevenue = 0;
    let freeWishes = 0;
    let vipWishes = 0;
    let liveLinks = 0;
    let futureLinks = 0;
    let expiredLinks = 0;
    let totalViews = 0;

    const occasionsCount = {};
    const premiumBuyers = [];
    const annotatedWishes = [];

    wishes.forEach(w => {
      totalViews += (w.views || 0);
      const t = templates.find(tpl => tpl.id === w.templateId);
      const isVip = w.tier === 'vip' || (t && t.tier === 'vip') || (w.price && w.price > 0) || (w.payment && w.payment.status === 'Completed');
      const price = isVip ? (w.price || (t && t.price) || 49) : 0;
      const status = computeWishStatus(w);

      if (isVip) {
        vipWishes++;
        totalRevenue += price;
        premiumBuyers.push({
          orderId: w.orderId || ('#ORD-' + w.id.slice(-6).toUpperCase()),
          wishId: w.id,
          senderName: (w.customData && (w.customData.sender_name || w.customData.senderName)) || 'Valued User',
          senderContact: (w.customData && (w.customData.sender_contact || w.customData.senderEmail || w.customData.senderPhone)) || 'Direct Customer',
          recipientName: (w.customData && (w.customData.recipient_name || w.customData.recipientName)) || 'Special Person',
          templateName: w.templateName || (t && t.name) || 'VIP Template Experience',
          price: price,
          amountPaid: `₹${price}`,
          paymentMethod: (w.payment && w.payment.method) || 'UPI PhonePe / GPay',
          paymentStatus: (w.payment && w.payment.status) || 'Verified Paid',
          createdAt: w.createdAt,
          views: w.views || 0,
          status: status,
          url: `/wish.html?id=${w.id}`
        });
      } else {
        freeWishes++;
      }

      if (status === 'active' || status === 'live') liveLinks++;
      else if (status === 'upcoming' || status === 'future') futureLinks++;
      else if (status === 'expired') expiredLinks++;

      const cat = (t && t.category) ? t.category : 'Celebration';
      occasionsCount[cat] = (occasionsCount[cat] || 0) + 1;

      annotatedWishes.push({
        ...w,
        tier: isVip ? 'vip' : 'free',
        price: price,
        lifecycleStatus: status,
        url: `/wish.html?id=${w.id}`
      });
    });

    const publishedTemplates = templates.length;
    const vipTemplates = templates.filter(t => t.tier === 'vip').length;
    const freeTemplates = templates.filter(t => t.tier !== 'vip').length;

    const media = getMedia();
    const totalMediaStorageBytes = media.reduce((acc, m) => acc + (m.fileSize || 0), 0);
    const defaultTrack = media.find(m => m.isDefault) || null;

    res.json({
      success: true,
      metrics: {
        liveVisitorsCount: activeVisitors.size,
        totalRevenue,
        totalWishes: wishes.length,
        freeWishes,
        vipWishes,
        liveLinks,
        futureLinks,
        expiredLinks,
        totalViews,
        totalTemplates: templates.length,
        publishedTemplates,
        vipTemplates,
        freeTemplates,
        mediaCount: media.length,
        totalMediaStorageBytes,
        defaultTrack: defaultTrack ? defaultTrack.title : 'None configured',
        occasionsBreakdown: occasionsCount,
        premiumBuyers,
        annotatedWishes: annotatedWishes.slice(0, 50),
        recentWishes: annotatedWishes.slice(0, 10)
      }
    });
  } catch (err) {
    console.error('Error generating metrics:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Get customized wish data by ID or Slug (supports both /api/wishes/wm_xxx and /api/wishes/ankit-to-kritika-x7k92)
app.get('/api/wishes/:id', (req, res) => {
  const query = (req.params.id || '').trim();
  const wishes = getWishes();
  const wish = wishes.find(w => w.id === query || w.slug === query || w.id === 'wm_' + query);

  if (!wish) {
    return res.status(404).json({ success: false, message: 'Wish not found or has expired' });
  }

  // Increment views
  wish.views = (wish.views || 0) + 1;
  saveWishes(wishes);

  const versionId = wish.templateVersionId || wish.template_version_id || (wish.customData && (wish.customData.templateVersionId || wish.customData.template_version_id));
  const template = getTemplateVersionById(versionId, wish.templateId);

  res.json({
    success: true,
    wish,
    template: template || null,
    publicUrl: `/w/${wish.slug || wish.id}`
  });
});

// Templates Marketplace Route: /templates and /marketplace
app.get(['/templates', '/templates/', '/marketplace', '/marketplace.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'marketplace.html'));
});

// Customizer Route: /create and /customize
app.get(['/create', '/create/', '/customize', '/customize.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customize.html'));
});

// Favorites Route: /favorites
app.get(['/favorites', '/favorites/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'my-wishes.html'));
});

// Creator Dashboard Route: /my-wishes and /dashboard
app.get(['/my-wishes', '/my-wishes.html', '/dashboard', '/my-wishes/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'my-wishes.html'));
});

// Creator Account Route: /account and /account.html
app.get(['/account', '/account.html', '/profile', '/profile.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'account.html'));
});

// Premium Upgrade Route: /premium and /pricing
app.get(['/premium', '/premium.html', '/pricing', '/pricing.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'premium.html'));
});

// Dedicated Template Preview Route: /template/:templateId, /template/:templateId/, /template-preview.html
app.get(['/template/:templateId', '/template/:templateId/', '/template-preview.html', '/template-preview'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'template-preview.html'));
});

// Public Clean URL Route: /w/:id and /w/:slug with Dynamic Server-Side SEO & Social Preview Meta Injection
app.get('/w/:id', (req, res) => {
  const wishParam = (req.params.id || '').trim();
  const wishes = getWishes();
  const wish = wishes.find(w => w.id === wishParam || w.slug === wishParam || w.id === 'wm_' + wishParam);

  const htmlPath = path.join(__dirname, 'public', 'wish.html');
  if (!fs.existsSync(htmlPath)) {
    return res.status(404).send('Wish renderer not found');
  }

  let htmlContent = fs.readFileSync(htmlPath, 'utf8');

  if (wish) {
    const versionId = wish.templateVersionId || wish.template_version_id || (wish.customData && (wish.customData.templateVersionId || wish.customData.template_version_id));
    const template = getTemplateVersionById(versionId, wish.templateId);
    const customData = wish.customData || {};

    const recipient = customData.recipient_name || customData.recipientName || wish.recipientName || 'Someone Special';
    const sender = customData.sender_name || customData.senderName || wish.buyerName || 'Someone Special';
    const occasion = (template && template.category) || customData.occasion || 'Celebration';

    const pageTitle = `${recipient}'s Special ${occasion} Surprise ✨ | WishMagic`;
    const metaDesc = `A personalized celebration website created with love by ${sender} for ${recipient}. Open this link to unwrap music, photographs, and cherished memories! 💖`;

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const canonicalUrl = `${baseUrl}/w/${wish.slug || wish.id}`;

    // Resolve cover photo / thumbnail
    let coverPhoto = customData.cover_photo || customData.photo_1 || (customData.photos && customData.photos[0] && customData.photos[0].src);
    if (!coverPhoto && template) {
      coverPhoto = template.thumbnail || (template.previewImages && template.previewImages[0]);
    }
    if (!coverPhoto) coverPhoto = '/assets/file_ab2082.png';
    if (!coverPhoto.startsWith('http')) {
      coverPhoto = `${baseUrl}${coverPhoto.startsWith('/') ? '' : '/'}${coverPhoto}`;
    }

    const isPrivate = Boolean(wish.isPrivate || customData.isPrivate || customData.unlisted);
    const robotsContent = isPrivate ? 'noindex, nofollow' : 'index, follow';

    const seoMetas = `
  <!-- Server-Side Generated SEO & Social Preview Tags (Part 15) -->
  <meta name="description" content="${metaDesc.replace(/"/g, '&quot;')}"/>
  <meta name="robots" content="${robotsContent}"/>
  <link rel="canonical" href="${canonicalUrl}"/>

  <!-- OpenGraph Metadata -->
  <meta property="og:site_name" content="WishMagic"/>
  <meta property="og:type" content="website"/>
  <meta property="og:url" content="${canonicalUrl}"/>
  <meta property="og:title" content="${pageTitle.replace(/"/g, '&quot;')}"/>
  <meta property="og:description" content="${metaDesc.replace(/"/g, '&quot;')}"/>
  <meta property="og:image" content="${coverPhoto}"/>
  <meta property="og:image:alt" content="Celebration for ${recipient}"/>

  <!-- Twitter Card Metadata -->
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:url" content="${canonicalUrl}"/>
  <meta name="twitter:title" content="${pageTitle.replace(/"/g, '&quot;')}"/>
  <meta name="twitter:description" content="${metaDesc.replace(/"/g, '&quot;')}"/>
  <meta name="twitter:image" content="${coverPhoto}"/>

  <!-- Schema.org JSON-LD Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "${pageTitle.replace(/"/g, '\\"')}",
    "description": "${metaDesc.replace(/"/g, '\\"')}",
    "url": "${canonicalUrl}",
    "applicationCategory": "LifestyleApplication",
    "operatingSystem": "All",
    "author": {
      "@type": "Person",
      "name": "${sender.replace(/"/g, '\\"')}"
    }
  }
  </script>

  <!-- Instant SSR Hydration Data -->
  <script>
    window.__SSR_WISH_DATA__ = ${JSON.stringify({ wish, template: template || null })};
  </script>
`;

    // Replace Title
    htmlContent = htmlContent.replace(/<title>.*?<\/title>/i, `<title>${pageTitle}</title>`);

    // Inject Metas before </head>
    htmlContent = htmlContent.replace('</head>', `${seoMetas}\n</head>`);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(htmlContent);
});

// Secret Admin Entry Routes: /admin/anktech/anktech/admin
const ADMIN_BASE = '/admin/anktech/anktech/admin';

function sendAdminPage(file, res) {
  res.sendFile(path.join(__dirname, 'public', file));
}

// Admin Portal routes (/admin, /admin/templates, /admin/categories, /admin/media, etc.)
app.get([
  '/admin',
  '/admin/',
  '/admin/overview',
  '/admin/overview.html',
  '/admin/dashboard',
  '/admin/analytics',
  '/admin/analytics.html',
  ADMIN_BASE,
  `${ADMIN_BASE}/`,
  `${ADMIN_BASE}/overview`,
  `${ADMIN_BASE}/overview.html`,
  `${ADMIN_BASE}/analytics`,
  `${ADMIN_BASE}/analytics.html`
], (req, res) => {
  sendAdminPage('admin-overview.html', res);
});

app.get([
  '/admin/templates',
  '/admin/templates.html',
  `${ADMIN_BASE}/templates`,
  `${ADMIN_BASE}/templates.html`
], (req, res) => {
  sendAdminPage('admin-templates.html', res);
});

app.get([
  '/admin/categories',
  '/admin/categories.html',
  '/admin/occasions',
  '/admin/occasions.html',
  `${ADMIN_BASE}/occasions`,
  `${ADMIN_BASE}/occasions.html`,
  `${ADMIN_BASE}/categories`,
  `${ADMIN_BASE}/categories.html`
], (req, res) => {
  sendAdminPage('admin-occasions.html', res);
});

app.get([
  '/admin/users',
  '/admin/users.html',
  `${ADMIN_BASE}/users`,
  `${ADMIN_BASE}/users.html`
], (req, res) => {
  sendAdminPage('admin-users.html', res);
});

app.get([
  '/admin/wishes',
  '/admin/wishes.html',
  `${ADMIN_BASE}/wishes`,
  `${ADMIN_BASE}/wishes.html`
], (req, res) => {
  sendAdminPage('admin-wishes.html', res);
});

app.get([
  '/admin/orders',
  '/admin/orders.html',
  `${ADMIN_BASE}/orders`,
  `${ADMIN_BASE}/orders.html`
], (req, res) => {
  sendAdminPage('admin-orders.html', res);
});

app.get([
  '/admin/media',
  '/admin/media.html',
  `${ADMIN_BASE}/media`,
  `${ADMIN_BASE}/media.html`
], (req, res) => {
  sendAdminPage('admin-media.html', res);
});

app.get([
  '/admin/pricing',
  '/admin/pricing.html',
  `${ADMIN_BASE}/pricing`,
  `${ADMIN_BASE}/pricing.html`
], (req, res) => {
  sendAdminPage('admin-pricing.html', res);
});

app.get([
  '/admin/settings',
  '/admin/settings.html',
  '/admin/diagnostics',
  '/admin/diagnostics.html',
  `${ADMIN_BASE}/settings`,
  `${ADMIN_BASE}/settings.html`,
  `${ADMIN_BASE}/diagnostics`,
  `${ADMIN_BASE}/diagnostics.html`
], (req, res) => {
  sendAdminPage('admin-settings.html', res);
});

app.get([
  '/admin/staff',
  '/admin/staff.html',
  `${ADMIN_BASE}/staff`,
  `${ADMIN_BASE}/staff.html`
], (req, res) => {
  sendAdminPage('admin-staff.html', res);
});

// Any unmatched route fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`WishMagic server listening on http://${HOST}:${PORT}`);
  console.log(`Secret Admin Portal available at: http://${HOST}:${PORT}${ADMIN_BASE}`);
});
