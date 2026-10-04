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
const STORE_DIR = path.join(__dirname, 'public', 'templates-store');
const MEDIA_DIR = path.join(__dirname, 'public', 'media');

// Ensure base directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

function getTemplates() {
  try {
    if (fs.existsSync(TEMPLATES_FILE)) {
      const data = fs.readFileSync(TEMPLATES_FILE, 'utf8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    return [];
  } catch (e) {
    return [];
  }
}

function saveWishes(wishes) {
  fs.writeFileSync(WISHES_FILE, JSON.stringify(wishes, null, 2), 'utf8');
}

// Serve templates-store files directly
app.use('/templates-store', express.static(STORE_DIR));
app.use('/media', express.static(MEDIA_DIR));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html', 'htm']
}));

// API: Get all templates (for marketplace and admin)
app.get('/api/templates', (req, res) => {
  const templates = getTemplates();
  res.json({ success: true, templates });
});

// API: Get single template by ID
app.get('/api/templates/:id', (req, res) => {
  const templates = getTemplates();
  const template = templates.find(t => t.id === req.params.id);
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

// API: Update template metadata (edit title, price, category, etc.)
app.post('/api/templates/update', (req, res) => {
  try {
    const { id, name, category, description, thumbnail, tier, price, featured, placement, detectedFields } = req.body;
    const templates = getTemplates();
    const idx = templates.findIndex(t => t.id === id);

    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    templates[idx] = {
      ...templates[idx],
      name: name !== undefined ? name : templates[idx].name,
      category: category !== undefined ? category : templates[idx].category,
      description: description !== undefined ? description : templates[idx].description,
      thumbnail: thumbnail !== undefined ? thumbnail : templates[idx].thumbnail,
      tier: tier !== undefined ? tier : templates[idx].tier,
      price: price !== undefined ? Number(price) : templates[idx].price,
      featured: featured !== undefined ? Boolean(featured) : templates[idx].featured,
      placement: placement !== undefined ? Number(placement) : templates[idx].placement,
      detectedFields: detectedFields !== undefined ? detectedFields : templates[idx].detectedFields,
      updatedAt: new Date().toISOString()
    };

    saveTemplates(templates);
    res.json({ success: true, template: templates[idx] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Delete a custom template
app.delete('/api/templates/:id', (req, res) => {
  try {
    const id = req.params.id;
    let templates = getTemplates();
    const target = templates.find(t => t.id === id);

    if (!target) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    templates = templates.filter(t => t.id !== id);
    saveTemplates(templates);

    // Remove folder
    const targetFolder = path.join(STORE_DIR, target.folder || id);
    if (fs.existsSync(targetFolder)) {
      fs.rmSync(targetFolder, { recursive: true, force: true });
    }

    res.json({ success: true, message: 'Template deleted' });
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

// API: Live Active Visitors Details for Admin
app.get('/api/admin/live-visitors', (req, res) => {
  try {
    cleanStaleVisitors();
    const now = Date.now();
    const visitorsList = [];
    for (const [id, data] of activeVisitors.entries()) {
      visitorsList.push({
        sessionId: id,
        page: data.page || '/',
        title: data.title || 'Page',
        ip: data.ip || '127.0.0.1',
        activeSeconds: Math.max(1, Math.round((now - data.enteredAt) / 1000)),
        lastSeenSecondsAgo: Math.max(0, Math.round((now - data.lastSeen) / 1000))
      });
    }
    res.json({
      success: true,
      count: activeVisitors.size,
      visitors: visitorsList
    });
  } catch (err) {
    res.status(500).json({ success: false, count: 0, visitors: [] });
  }
});

// Helper: Compute Wish Link Lifecycle Status ('live', 'future', 'expired')
function computeWishStatus(wish) {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // 1. Check explicit expiry date if provided
  const explicitExpiry = wish.expiryDate || (wish.customData && (wish.customData.expiry_date || wish.customData.expiryDate));
  if (explicitExpiry) {
    const expTime = new Date(explicitExpiry).getTime();
    if (!isNaN(expTime) && expTime < now.getTime()) {
      return 'expired';
    }
  }

  // 2. Extract celebration / event date
  const eventDateStr = wish.eventDate || (wish.customData && (wish.customData.event_date || wish.customData.eventDate || wish.customData.target_date || wish.customData.targetDate));

  if (eventDateStr) {
    const parsedDate = new Date(eventDateStr);
    if (!isNaN(parsedDate.getTime())) {
      const eventMidnight = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate()).getTime();
      if (eventMidnight > todayMidnight) {
        return 'future'; // Scheduled for future celebration
      }
      // If event was today or within past 7 days -> still live
      const daysSinceEvent = (todayMidnight - eventMidnight) / (1000 * 60 * 60 * 24);
      if (daysSinceEvent <= 7) {
        return 'live';
      }
      return 'expired'; // Event was more than 7 days ago
    }
  }

  // 3. Fallback: If no event date specified, active for 30 days from creation
  const createdTime = new Date(wish.createdAt).getTime();
  const daysOld = (now.getTime() - createdTime) / (1000 * 60 * 60 * 24);
  if (daysOld <= 30) {
    return 'live';
  }
  return 'expired';
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

    const newWish = {
      id: wishId,
      orderId: 'ORD-' + Math.random().toString(36).substring(2, 7).toUpperCase() + '-' + Date.now().toString().slice(-4),
      templateId,
      templateName: template ? template.name : (customData.templateName || 'Magical Celebration Experience'),
      tier: isVip ? 'vip' : 'free',
      price: wishPrice,
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

    const wishes = getWishes();
    wishes.unshift(newWish);
    saveWishes(wishes);

    res.json({
      success: true,
      wishId: wishId,
      url: `/wish.html?id=${wishId}`,
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

      if (status === 'live') liveLinks++;
      else if (status === 'future') futureLinks++;
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

// API: Get customized wish data by ID
app.get('/api/wishes/:id', (req, res) => {
  const wishes = getWishes();
  const wish = wishes.find(w => w.id === req.params.id);

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
    template: template || null
  });
});

// Short URL Route: /w/:id redirects to /wish.html?id=:id
app.get('/w/:id', (req, res) => {
  res.redirect(`/wish.html?id=${encodeURIComponent(req.params.id)}`);
});

// Secret Admin Entry Routes: /admin/anktech/anktech/admin
const ADMIN_BASE = '/admin/anktech/anktech/admin';

function sendAdminPage(file, res) {
  res.sendFile(path.join(__dirname, 'public', file));
}

// Secret Admin Portal routes
app.get([ADMIN_BASE, `${ADMIN_BASE}/`, `${ADMIN_BASE}/overview`, `${ADMIN_BASE}/overview.html`], (req, res) => {
  sendAdminPage('admin-overview.html', res);
});

app.get([`${ADMIN_BASE}/templates`, `${ADMIN_BASE}/templates.html`], (req, res) => {
  sendAdminPage('admin-templates.html', res);
});

app.get([`${ADMIN_BASE}/occasions`, `${ADMIN_BASE}/occasions.html`], (req, res) => {
  sendAdminPage('admin-occasions.html', res);
});

app.get([`${ADMIN_BASE}/orders`, `${ADMIN_BASE}/orders.html`], (req, res) => {
  sendAdminPage('admin-orders.html', res);
});

app.get([`${ADMIN_BASE}/media`, `${ADMIN_BASE}/media.html`], (req, res) => {
  sendAdminPage('admin-media.html', res);
});

app.get([`${ADMIN_BASE}/pricing`, `${ADMIN_BASE}/pricing.html`], (req, res) => {
  sendAdminPage('admin-pricing.html', res);
});

app.get([`${ADMIN_BASE}/settings`, `${ADMIN_BASE}/settings.html`], (req, res) => {
  sendAdminPage('admin-settings.html', res);
});

// Protect generic unauthorized /admin path attempts
app.get(['/admin', '/admin/'], (req, res) => {
  res.redirect('/');
});

// Any unmatched route fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`WishMagic server listening on http://${HOST}:${PORT}`);
  console.log(`Secret Admin Portal available at: http://${HOST}:${PORT}${ADMIN_BASE}`);
});
