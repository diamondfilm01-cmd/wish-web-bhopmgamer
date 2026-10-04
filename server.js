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
const WISHES_FILE = path.join(DATA_DIR, 'wishes.json');
const MEDIA_FILE = path.join(DATA_DIR, 'media.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const STORE_DIR = path.join(__dirname, 'public', 'templates-store');
const MEDIA_DIR = path.join(__dirname, 'public', 'media');

// Ensure base directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

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
function slugifyText(text) {
  if (!text) return '';
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
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

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html', 'htm']
}));

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
    res.json({ success: true, template: templates[idx], message: 'Template updated successfully' });
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
    const generatedSlug = (customData.customSlug ? slugifyText(customData.customSlug) : '') || generateUniqueWishSlug(customData, template, wishes);

    const isPrivate = Boolean(customData.isPrivate || customData.unlisted || req.body.isPrivate);

    const newWish = {
      id: wishId,
      slug: generatedSlug,
      userId,
      orderId: 'ORD-' + Math.random().toString(36).substring(2, 7).toUpperCase() + '-' + Date.now().toString().slice(-4),
      templateId,
      templateName: template ? template.name : (customData.templateName || 'Magical Celebration Experience'),
      tier: isVip ? 'vip' : 'free',
      price: wishPrice,
      isPrivate,
      buyerName,
      buyerContact,
      recipientName: customData.recipient_name || customData.recipientName || 'Special Person',
      eventDate,
      expiryDate: new Date(new Date(eventDate).getTime() + (7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
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

// API: Delete a wish
app.delete('/api/wishes/:id', (req, res) => {
  try {
    let wishes = getWishes();
    const exists = wishes.find(w => w.id === req.params.id);
    if (!exists) {
      return res.status(404).json({ success: false, message: 'Wish not found' });
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

  const templates = getTemplates();
  const template = templates.find(t => t.id === wish.templateId);

  res.json({
    success: true,
    wish,
    template: template || null,
    publicUrl: `/w/${wish.slug || wish.id}`
  });
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
    const templates = getTemplates();
    const template = templates.find(t => t.id === wish.templateId);
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
  ADMIN_BASE,
  `${ADMIN_BASE}/`,
  `${ADMIN_BASE}/overview`,
  `${ADMIN_BASE}/overview.html`
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
  `${ADMIN_BASE}/settings`,
  `${ADMIN_BASE}/settings.html`
], (req, res) => {
  sendAdminPage('admin-settings.html', res);
});

// Any unmatched route fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`WishMagic server listening on http://${HOST}:${PORT}`);
  console.log(`Secret Admin Portal available at: http://${HOST}:${PORT}${ADMIN_BASE}`);
});
