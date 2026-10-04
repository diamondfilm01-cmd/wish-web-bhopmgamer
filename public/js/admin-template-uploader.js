// WishMagic Admin Studio - Universal Website & Code Folder Uploader Engine

let currentUploadedFiles = {}; // { [relativePath]: { content, isBase64 } }
let detectedDynamicFields = []; // [ { key, label, type, defaultValue } ]
let customCoverThumbnail = null;
let currentPreviewBlobUrl = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initDragAndDrop();
  loadDynamicTemplates();
});

function initDragAndDrop() {
  const dropZone = document.getElementById('code-drop-zone');
  if (!dropZone) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('border-primary', 'bg-primary-container/15');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('border-primary', 'bg-primary-container/15');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length === 1 && files[0].name.endsWith('.zip')) {
      handleZipFile(files[0]);
    } else if (files.length > 0) {
      handleMultipleFiles(files);
    }
  });
}

function handleCustomCoverThumb(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      customCoverThumbnail = e.target.result;
      const thumb = document.getElementById('thumbnail-preview-img');
      if (thumb) thumb.src = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

// 1. Handle Selection of a Full Directory/Folder
async function handleFolderSelection(fileList) {
  if (!fileList || fileList.length === 0) return;
  showUploadProgress('Reading folder files...');
  currentUploadedFiles = {};
  detectedDynamicFields = [];

  let htmlContent = '';
  let foundIndex = false;
  let firstFoundImage = null;

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    // webkitRelativePath gives the relative folder path e.g. "my-site/index.html"
    let relPath = file.webkitRelativePath || file.name;
    // Strip root folder name if present so index.html is at root
    const parts = relPath.split('/');
    if (parts.length > 1) {
      relPath = parts.slice(1).join('/');
    }

    if (isMediaFile(file.name)) {
      const dataUrl = await readFileAsDataURL(file);
      currentUploadedFiles[relPath] = { content: dataUrl, isBase64: true };
      if (!firstFoundImage && isImageFile(file.name)) {
        firstFoundImage = dataUrl;
      }
    } else {
      const text = await readFileAsText(file);
      currentUploadedFiles[relPath] = { content: text, isBase64: false };

      if (relPath.toLowerCase() === 'index.html' || file.name.toLowerCase() === 'index.html') {
        htmlContent = text;
        foundIndex = true;
      }
    }
  }

  finishProcessingFiles(foundIndex, htmlContent, firstFoundImage);
}

// 2. Handle Selection of a ZIP file using JSZip
async function handleZipFile(zipFile) {
  if (!zipFile) return;
  if (typeof JSZip === 'undefined') {
    alert('JSZip library is loading. Please try again in a second.');
    return;
  }

  showUploadProgress('Extracting ZIP archive in browser...');
  currentUploadedFiles = {};
  detectedDynamicFields = [];

  try {
    const zip = await JSZip.loadAsync(zipFile);
    let htmlContent = '';
    let foundIndex = false;
    let firstFoundImage = null;

    const entries = Object.keys(zip.files);
    for (const rawPath of entries) {
      const entry = zip.files[rawPath];
      if (entry.dir) continue;

      // Normalize path to strip any top-level folder
      let relPath = rawPath;
      const parts = relPath.split('/');
      if (parts.length > 1 && !entries.some(p => p === 'index.html')) {
        relPath = parts.slice(1).join('/');
      }
      if (!relPath) continue;

      if (isMediaFile(relPath)) {
        const base64 = await entry.async('base64');
        const mime = getMimeType(relPath);
        const dataUrl = `data:${mime};base64,${base64}`;
        currentUploadedFiles[relPath] = { content: dataUrl, isBase64: true };
        if (!firstFoundImage && isImageFile(relPath)) {
          firstFoundImage = dataUrl;
        }
      } else {
        const text = await entry.async('string');
        currentUploadedFiles[relPath] = { content: text, isBase64: false };

        if (relPath.toLowerCase() === 'index.html' || rawPath.toLowerCase().endsWith('/index.html')) {
          htmlContent = text;
          foundIndex = true;
        }
      }
    }

    finishProcessingFiles(foundIndex, htmlContent, firstFoundImage);
  } catch (err) {
    alert('Failed to read ZIP file: ' + err.message);
    hideUploadProgress();
  }
}

// 3. Scan & Analyze Uploaded Code
function finishProcessingFiles(foundIndex, htmlContent, firstFoundImage) {
  hideUploadProgress();

  const fileCount = Object.keys(currentUploadedFiles).length;
  if (fileCount === 0) {
    alert('No files found in upload.');
    return;
  }

  // Display uploaded files count and list
  const fileSummaryElem = document.getElementById('upload-files-summary');
  if (fileSummaryElem) {
    fileSummaryElem.textContent = `${fileCount} files successfully extracted (HTML, CSS, JS, Assets)`;
  }

  // Auto-scan HTML for dynamic fields: data-wm="..." and {{...}}
  scanDynamicFields(htmlContent);

  // Set default thumbnail if found
  if (firstFoundImage) {
    customCoverThumbnail = firstFoundImage;
    const thumbPreview = document.getElementById('thumbnail-preview-img');
    if (thumbPreview) thumbPreview.src = firstFoundImage;
  }

  // Render live sandbox preview in iframe
  renderLiveSandboxPreview();

  // Show Step 2 & 3 in the modal
  document.getElementById('upload-step-config').classList.remove('hidden');
  document.getElementById('upload-placeholder-state').classList.add('hidden');
}

function scanDynamicFields(html) {
  detectedDynamicFields = [];
  const fieldMap = new Map();

  if (html) {
    // 1. Scan for data-wm="field_name"
    const dataWmRegex = /data-wm=["']([^"']+)["']/gi;
    let match;
    while ((match = dataWmRegex.exec(html)) !== null) {
      const key = match[1].trim();
      if (key && !fieldMap.has(key)) {
        fieldMap.set(key, guessFieldMeta(key, html));
      }
    }

    // 2. Scan for {{field_name}}
    const curlyRegex = /\{\{\s*([a-zA-Z0-9_\-]+)\s*\}\}/g;
    while ((match = curlyRegex.exec(html)) !== null) {
      const key = match[1].trim();
      if (key && !fieldMap.has(key)) {
        fieldMap.set(key, guessFieldMeta(key, html));
      }
    }
  }

  // Defaults if none were found
  if (fieldMap.size === 0) {
    fieldMap.set('recipient_name', { key: 'recipient_name', label: 'Recipient Name', type: 'text' });
    fieldMap.set('event_date', { key: 'event_date', label: 'Celebration Date', type: 'date' });
    fieldMap.set('custom_message', { key: 'custom_message', label: 'Custom Message', type: 'textarea' });
    fieldMap.set('photo_1', { key: 'photo_1', label: 'Photo Slot', type: 'image' });
  }

  detectedDynamicFields = Array.from(fieldMap.values());
  renderDetectedFieldsBadges();
}

function guessFieldMeta(key, html) {
  const lKey = key.toLowerCase();
  let type = 'text';
  let label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  if (lKey.includes('date') || lKey.includes('time')) {
    type = 'date';
  } else if (lKey.includes('photo') || lKey.includes('img') || lKey.includes('picture') || lKey.includes('avatar')) {
    type = 'image';
  } else if (lKey.includes('video') || lKey.includes('clip') || lKey.includes('reel')) {
    type = 'video';
  } else if (lKey.includes('audio') || lKey.includes('music') || lKey.includes('song') || lKey.includes('bgm')) {
    type = 'audio';
  } else if (lKey.includes('message') || lKey.includes('letter') || lKey.includes('note') || lKey.includes('wishes')) {
    type = 'textarea';
  }

  return { key, label, type };
}

function renderDetectedFieldsBadges() {
  const container = document.getElementById('detected-fields-container');
  const countBadge = document.getElementById('detected-fields-count');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${detectedDynamicFields.length} Slots Detected`;
  }

  container.innerHTML = '';
  detectedDynamicFields.forEach(field => {
    let icon = 'badge';
    let colorClass = 'bg-primary-container/20 text-primary border-primary/30';
    if (field.type === 'image') { icon = 'image'; colorClass = 'bg-pink-500/20 text-pink-300 border-pink-500/30'; }
    if (field.type === 'video') { icon = 'videocam'; colorClass = 'bg-amber-500/20 text-amber-300 border-amber-500/30'; }
    if (field.type === 'audio') { icon = 'music_note'; colorClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'; }
    if (field.type === 'date') { icon = 'calendar_today'; colorClass = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'; }
    if (field.type === 'textarea') { icon = 'notes'; colorClass = 'bg-purple-500/20 text-purple-300 border-purple-500/30'; }

    const pill = document.createElement('div');
    pill.className = `flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${colorClass}`;
    pill.innerHTML = `
      <span class="material-symbols-outlined text-[15px]">${icon}</span>
      <span>${field.label}</span>
      <span class="text-[10px] opacity-75 font-mono">(${field.key})</span>
    `;
    container.appendChild(pill);
  });
}

// 4. Render In-Memory Live Sandbox Preview in iframe
function renderLiveSandboxPreview() {
  const iframe = document.getElementById('upload-preview-iframe');
  if (!iframe) return;

  let indexContent = '';
  for (const [path, data] of Object.entries(currentUploadedFiles)) {
    if (path.toLowerCase() === 'index.html' || path.toLowerCase().endsWith('/index.html')) {
      indexContent = typeof data === 'string' ? data : data.content;
      break;
    }
  }

  if (!indexContent) {
    indexContent = '<h1 style="color:white;text-align:center;font-family:sans-serif;padding:40px;">No index.html entry file detected</h1>';
  }

  // Inline CSS and Images for instant sandbox preview
  for (const [p, d] of Object.entries(currentUploadedFiles)) {
    if (p.endsWith('.css')) {
      const cssContent = typeof d === 'string' ? d : d.content;
      indexContent = indexContent.replace(new RegExp(`href=["'].*?${escapeRegex(p)}["']`, 'gi'), `href="data:text/css;base64,${btoa(unescape(encodeURIComponent(cssContent)))}"`);
    } else if (isImageFile(p)) {
      const imgDataUrl = typeof d === 'string' ? d : d.content;
      indexContent = indexContent.replace(new RegExp(`src=["'].*?${escapeRegex(p)}["']`, 'gi'), `src="${imgDataUrl}"`);
    }
  }

  // Populate sample values for dynamic placeholders in preview
  indexContent = indexContent.replace(/\{\{\s*recipient_name\s*\}\}/g, 'Priya Sharma');
  indexContent = indexContent.replace(/\{\{\s*event_date\s*\}\}/g, '25 October 2026');
  indexContent = indexContent.replace(/\{\{\s*sender_name\s*\}\}/g, 'Ankit Verma');
  indexContent = indexContent.replace(/\{\{\s*custom_message\s*\}\}/g, 'May this special day bring you magical memories and endless joy!');

  iframe.srcdoc = indexContent;
}

// 5. Deploy Template to Server API
async function deployUploadedTemplate() {
  const nameInput = document.getElementById('new-tpl-title');
  const catInput = document.getElementById('new-tpl-category');
  const descInput = document.getElementById('new-tpl-desc');
  const tierInput = document.getElementById('new-tpl-tier');
  const priceInput = document.getElementById('new-tpl-price');
  const orderInput = document.getElementById('new-tpl-placement');
  const featuredInput = document.getElementById('new-tpl-featured');

  const title = nameInput ? nameInput.value.trim() : '';
  if (!title) {
    alert('Please enter a Template Title.');
    if (nameInput) nameInput.focus();
    return;
  }

  if (Object.keys(currentUploadedFiles).length === 0) {
    alert('Please upload a website folder or ZIP file first.');
    return;
  }

  const deployBtn = document.getElementById('btn-deploy-template');
  if (deployBtn) {
    deployBtn.disabled = true;
    deployBtn.innerHTML = `
      <span class="material-symbols-outlined text-[18px] animate-spin">refresh</span>
      <span>Deploying Template...</span>
    `;
  }

  const payload = {
    name: title,
    category: catInput ? catInput.value : 'Birthday',
    description: descInput ? descInput.value.trim() : 'Custom handcrafted celebration experience.',
    tier: tierInput ? tierInput.value : 'vip',
    price: priceInput ? Number(priceInput.value) : 49,
    placement: orderInput ? Number(orderInput.value) : 1,
    featured: featuredInput ? featuredInput.checked : true,
    thumbnail: customCoverThumbnail || 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80',
    detectedFields: detectedDynamicFields,
    files: currentUploadedFiles
  };

  try {
    const res = await fetch('/api/templates/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      // Close modal
      toggleModal('upload-code-modal');
      // Show success notification
      showToast(`🎉 Template "${title}" successfully deployed and live!`);
      // Reload templates list
      loadDynamicTemplates();
    } else {
      alert('Error deploying template: ' + (data.message || 'Unknown error'));
    }
  } catch (err) {
    alert('Network error deploying template: ' + err.message);
  } finally {
    if (deployBtn) {
      deployBtn.disabled = false;
      deployBtn.innerHTML = `
        <span class="material-symbols-outlined text-[20px]" style="font-variation-settings: 'FILL' 1;">rocket_launch</span>
        <span>Deploy & Publish to Store</span>
      `;
    }
  }
}

// 6. Comprehensive Template Management Studio Engine (Part 10)
let allAdminTemplates = [];
let activeAdminFilter = 'all'; // 'all' | 'published' | 'draft' | 'free' | 'vip' | 'featured'
let activeAdminOccasion = 'all';
let activeAdminSearch = '';
let activeAdminSort = 'updated';
let activeAdminViewMode = 'grid'; // 'grid' | 'table'
let currentEditingTemplateId = null;

// Expose filter & sort functions to window for onclick handlers
window.filterTemplatesByTier = function(tier) {
  activeAdminFilter = tier;
  updateFilterButtonsUI();
  applyFiltersAndRender();
};

window.filterTemplatesByOccasion = function(occ) {
  activeAdminOccasion = occ;
  updateOccasionButtonsUI();
  applyFiltersAndRender();
};

window.handleSortChange = function(sortKey) {
  activeAdminSort = sortKey;
  applyFiltersAndRender();
};

window.handleAdminSearch = function(query) {
  activeAdminSearch = (query || '').toLowerCase().trim();
  applyFiltersAndRender();
};

window.setTemplateViewMode = function(mode) {
  activeAdminViewMode = mode;
  const gridSection = document.getElementById('master-templates-grid');
  const tableSection = document.getElementById('master-templates-table-container');
  const btnGrid = document.getElementById('btn-view-grid');
  const btnTable = document.getElementById('btn-view-table');

  if (mode === 'table') {
    if (gridSection) gridSection.classList.add('hidden');
    if (tableSection) tableSection.classList.remove('hidden');
    if (btnGrid) btnGrid.className = 'p-1.5 rounded text-outline hover:text-on-surface transition-colors flex items-center justify-center cursor-pointer';
    if (btnTable) btnTable.className = 'p-1.5 rounded bg-primary-container text-white shadow-sm flex items-center justify-center cursor-pointer';
  } else {
    if (gridSection) gridSection.classList.remove('hidden');
    if (tableSection) tableSection.classList.add('hidden');
    if (btnGrid) btnGrid.className = 'p-1.5 rounded bg-primary-container text-white shadow-sm flex items-center justify-center cursor-pointer';
    if (btnTable) btnTable.className = 'p-1.5 rounded text-outline hover:text-on-surface transition-colors flex items-center justify-center cursor-pointer';
  }
  applyFiltersAndRender();
};

function updateFilterButtonsUI() {
  const filterMap = {
    'all': 'btn-filter-all',
    'published': 'btn-filter-published',
    'draft': 'btn-filter-draft',
    'free': 'btn-filter-free',
    'vip': 'btn-filter-vip',
    'featured': 'btn-filter-featured'
  };

  Object.entries(filterMap).forEach(([key, btnId]) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (activeAdminFilter === key) {
      btn.className = 'px-space-sm py-1 rounded-full font-label-sm text-label-sm bg-primary-container text-white font-bold shadow-md cursor-pointer';
    } else {
      btn.className = 'px-space-sm py-1 rounded-full font-label-sm text-label-sm bg-surface-container-lowest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer';
    }
  });
}

function updateOccasionButtonsUI() {
  const occContainer = document.getElementById('filter-occasions-container');
  if (!occContainer) return;
  const buttons = occContainer.querySelectorAll('button');
  buttons.forEach(btn => {
    const dataOcc = btn.getAttribute('data-occ') || '';
    if (dataOcc.toLowerCase() === activeAdminOccasion.toLowerCase()) {
      btn.className = 'px-2.5 py-1 rounded-lg font-label-sm text-label-sm bg-secondary text-white font-bold flex items-center gap-1.5 shadow-sm cursor-pointer';
    } else {
      btn.className = 'px-2.5 py-1 rounded-lg font-label-sm text-label-sm bg-surface-container-lowest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high flex items-center gap-1.5 transition-colors cursor-pointer';
    }
  });
}

// Fetch & Load Templates in Admin Studio
async function loadDynamicTemplates() {
  try {
    let templates = [];
    if (window.templateRepository && typeof window.templateRepository.getAll === 'function') {
      templates = await window.templateRepository.getAll({ includeDrafts: true });
    } else {
      const res = await fetch('/api/templates?includeDrafts=true');
      const data = await res.json();
      templates = data.templates || [];
    }

    allAdminTemplates = templates;
    updateKpiMetrics(templates);
    renderOccasionsFilter(templates);
    applyFiltersAndRender();
  } catch (e) {
    console.error('Error loading admin templates:', e);
  }
}

function updateKpiMetrics(templates) {
  const total = templates.length;
  const published = templates.filter(t => t.status === 'published' || t.isPublished !== false).length;
  const drafts = templates.filter(t => t.status === 'draft' || t.isPublished === false).length;
  const vipCount = templates.filter(t => t.tier === 'vip' || t.isPremium === true || (t.price && Number(t.price) > 0)).length;
  const freeCount = total - vipCount;
  const featuredCount = templates.filter(t => Boolean(t.featured)).length;

  const countTotal = document.getElementById('count-total');
  const countPublished = document.getElementById('count-published');
  const countDrafts = document.getElementById('count-drafts');
  const countPremium = document.getElementById('count-premium');
  const countFree = document.getElementById('count-free');
  const countFooter = document.getElementById('count-footer-total');

  const filterAllCount = document.getElementById('filter-all-count');
  const filterPublishedCount = document.getElementById('filter-published-count');
  const filterDraftCount = document.getElementById('filter-draft-count');
  const filterFreeCount = document.getElementById('filter-free-count');
  const filterPremiumCount = document.getElementById('filter-premium-count');
  const filterFeaturedCount = document.getElementById('filter-featured-count');

  if (countTotal) countTotal.textContent = total;
  if (countPublished) countPublished.textContent = published;
  if (countDrafts) countDrafts.textContent = drafts;
  if (countPremium) countPremium.textContent = vipCount;
  if (countFree) countFree.textContent = freeCount;
  if (countFooter) countFooter.textContent = total;

  if (filterAllCount) filterAllCount.textContent = total;
  if (filterPublishedCount) filterPublishedCount.textContent = published;
  if (filterDraftCount) filterDraftCount.textContent = drafts;
  if (filterFreeCount) filterFreeCount.textContent = freeCount;
  if (filterPremiumCount) filterPremiumCount.textContent = vipCount;
  if (filterFeaturedCount) filterFeaturedCount.textContent = featuredCount;
}

function renderOccasionsFilter(templates) {
  const occContainer = document.getElementById('filter-occasions-container');
  if (!occContainer) return;

  const occMap = {};
  templates.forEach(t => {
    const cat = t.category || 'General';
    occMap[cat] = (occMap[cat] || 0) + 1;
  });

  const occEntries = Object.entries(occMap);
  let html = `
    <button data-occ="all" onclick="filterTemplatesByOccasion('all')" class="px-2.5 py-1 rounded-lg font-label-sm text-label-sm ${activeAdminOccasion === 'all' ? 'bg-secondary text-white font-bold' : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'} flex items-center gap-1.5 transition-colors cursor-pointer">
      <span>All Categories</span>
    </button>
  `;

  occEntries.forEach(([cat, count]) => {
    const isAct = activeAdminOccasion.toLowerCase() === cat.toLowerCase();
    html += `
      <button data-occ="${escapeQuotes(cat)}" onclick="filterTemplatesByOccasion('${escapeQuotes(cat)}')" class="px-2.5 py-1 rounded-lg font-label-sm text-label-sm ${isAct ? 'bg-secondary text-white font-bold' : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'} flex items-center gap-1.5 transition-colors cursor-pointer">
        <span>${cat}</span>
        <span class="font-mono text-outline font-bold">${count}</span>
      </button>
    `;
  });

  occContainer.innerHTML = html;
}

function applyFiltersAndRender() {
  let list = [...allAdminTemplates];

  // 1. Status / Tier Filter
  if (activeAdminFilter === 'published') {
    list = list.filter(t => t.status === 'published' || (t.isPublished !== false && t.status !== 'draft'));
  } else if (activeAdminFilter === 'draft') {
    list = list.filter(t => t.status === 'draft' || t.isPublished === false);
  } else if (activeAdminFilter === 'free') {
    list = list.filter(t => t.tier === 'free' && !t.isPremium && (!t.price || Number(t.price) === 0));
  } else if (activeAdminFilter === 'vip') {
    list = list.filter(t => t.tier === 'vip' || t.isPremium === true || (t.price && Number(t.price) > 0));
  } else if (activeAdminFilter === 'featured') {
    list = list.filter(t => Boolean(t.featured));
  }

  // 2. Occasion Filter
  if (activeAdminOccasion && activeAdminOccasion !== 'all') {
    const occLower = activeAdminOccasion.toLowerCase();
    list = list.filter(t => {
      const matchCat = (t.category || '').toLowerCase() === occLower;
      const matchRel = Array.isArray(t.relationships) && t.relationships.some(r => r.toLowerCase() === occLower);
      return matchCat || matchRel;
    });
  }

  // 3. Search Filter (by title, id, slug, category, relationships, tags)
  if (activeAdminSearch) {
    const q = activeAdminSearch;
    list = list.filter(t => {
      return (t.name && t.name.toLowerCase().includes(q)) ||
             (t.id && t.id.toLowerCase().includes(q)) ||
             (t.slug && t.slug.toLowerCase().includes(q)) ||
             (t.category && t.category.toLowerCase().includes(q)) ||
             (t.description && t.description.toLowerCase().includes(q)) ||
             (Array.isArray(t.relationships) && t.relationships.some(r => r.toLowerCase().includes(q))) ||
             (Array.isArray(t.tags) && t.tags.some(tag => tag.toLowerCase().includes(q)));
    });
  }

  // 4. Sort
  list.sort((a, b) => {
    if (activeAdminSort === 'name') return (a.name || '').localeCompare(b.name || '');
    if (activeAdminSort === 'category') return (a.category || '').localeCompare(b.category || '');
    if (activeAdminSort === 'newest') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    if (activeAdminSort === 'oldest') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    // default: recently updated
    return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
  });

  renderTemplatesGrid(list);
  renderTemplatesTable(list);
}

function formatDate(isoStr) {
  if (!isoStr) return 'Recently';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return 'Recently';
  }
}

// Render Master Grid
function renderTemplatesGrid(templates) {
  const container = document.getElementById('dynamic-templates-container');
  if (!container) return;

  container.innerHTML = '';

  if (templates.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-16 px-4 flex flex-col items-center justify-center text-center bg-surface-container-low rounded-2xl border border-dashed border-purple-500/30">
        <div class="w-16 h-16 rounded-2xl bg-primary-container/20 text-primary flex items-center justify-center mb-4">
          <span class="material-symbols-outlined text-[36px]">filter_alt_off</span>
        </div>
        <h3 class="font-headline-sm text-lg font-bold text-on-surface mb-1">No Matching Templates Found</h3>
        <p class="text-xs text-on-surface-variant max-w-sm mb-4">Try clearing filters or search terms.</p>
        <button onclick="filterTemplatesByTier('all'); document.getElementById('template-search-input').value=''; handleAdminSearch('');" class="px-4 py-2 rounded-xl bg-surface-container-high text-xs font-bold text-on-surface hover:bg-surface-container-highest transition">
          Clear All Filters
        </button>
      </div>
    `;
    return;
  }

  templates.forEach(tpl => {
    const card = document.createElement('article');
    card.className = "bg-surface-container-low rounded-2xl overflow-hidden flex flex-col justify-between shadow-xl hover:shadow-[0_12px_40px_-8px_rgba(124,58,237,0.35)] transition-all duration-300 group border border-purple-500/20";

    const isVip = tpl.tier === 'vip' || tpl.isPremium === true || Number(tpl.price) > 0;
    const isPub = tpl.status === 'published' || (tpl.isPublished !== false && tpl.status !== 'draft');
    const priceText = isVip ? `₹${tpl.price || 49}` : '₹0';
    const tierBadge = isVip ? 'VIP PASS' : 'FREE TIER';
    const tierClass = isVip ? 'bg-gradient-to-r from-amber-400 to-amber-600 text-purple-950 font-black' : 'bg-primary-container text-white';
    const relsText = Array.isArray(tpl.relationships) && tpl.relationships.length > 0 ? tpl.relationships.slice(0, 3).join(', ') : 'All Celebrants';

    card.innerHTML = `
      <div class="relative h-44 sm:h-52 w-full overflow-hidden bg-surface-container-lowest">
        <img src="${tpl.thumbnail || '/assets/file_ab2082.png'}" alt="${tpl.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.src='/assets/file_ab2082.png'"/>
        <div class="absolute inset-0 bg-gradient-to-t from-surface-container-low via-surface-container-low/30 to-transparent"></div>
        
        <div class="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <span class="px-2 py-0.5 rounded-full font-label-sm text-[10px] uppercase font-bold ${tierClass} shadow-md">${tierBadge}</span>
          ${isPub ? `
            <span class="px-2 py-0.5 rounded-full font-label-sm text-[10px] uppercase font-bold bg-emerald-500/90 text-white shadow-sm flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span> Published
            </span>
          ` : `
            <span class="px-2 py-0.5 rounded-full font-label-sm text-[10px] uppercase font-bold bg-amber-500/90 text-white shadow-sm flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-white"></span> Draft
            </span>
          `}
          ${tpl.featured ? `
            <span class="px-2 py-0.5 rounded-full font-label-sm text-[10px] uppercase font-bold bg-pink-500 text-white shadow-sm flex items-center gap-0.5">
              <span>★</span> Featured
            </span>
          ` : ''}
        </div>

        <div class="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-lowest/90 backdrop-blur-md text-amber-300 font-label-sm text-xs font-bold shadow-lg">
          <span>${tpl.category || 'Celebration'}</span>
        </div>

        <div class="absolute bottom-3 left-3 right-3 flex items-center justify-between text-on-surface">
          <div class="flex items-center gap-1 text-[11px] bg-surface-container-lowest/90 backdrop-blur-md px-2.5 py-1 rounded-lg shadow-sm text-on-surface-variant font-medium">
            <span class="material-symbols-outlined text-[14px] text-primary">group</span>
            <span class="truncate max-w-[150px]">${relsText}</span>
          </div>
          <div class="flex items-center gap-1 text-xs bg-surface-container-lowest/90 backdrop-blur-md px-2.5 py-1 rounded-lg text-emerald-400 font-bold">
            ${priceText}
          </div>
        </div>
      </div>

      <div class="p-4 flex flex-col gap-2.5 flex-1">
        <div>
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-headline-sm text-base font-bold text-on-surface group-hover:text-primary transition-colors">${tpl.name}</h3>
            <span class="text-[10px] font-mono text-outline shrink-0">${formatDate(tpl.updatedAt || tpl.createdAt)}</span>
          </div>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-[10px] font-mono text-primary font-semibold">${tpl.id}</span>
            <span class="text-[10px] text-outline">• slug: /${tpl.slug || ''}</span>
          </div>
        </div>

        <p class="font-body-sm text-xs text-on-surface-variant line-clamp-2">
          ${tpl.description || 'Interactive digital celebration experience.'}
        </p>

        <!-- Capabilities summary tags -->
        <div class="bg-surface-container-lowest p-2 rounded-xl flex flex-col gap-1.5 mt-auto">
          <div class="flex items-center justify-between text-[10px] text-outline uppercase tracking-wider font-bold">
            <span>Capabilities</span>
            <span class="text-primary font-mono">${Object.values(tpl.capabilities || {}).filter(Boolean).length} Active</span>
          </div>
          <div class="flex flex-wrap gap-1">
            ${tpl.capabilities?.voiceNote ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">Voice</span>' : ''}
            ${tpl.capabilities?.gallery ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 font-bold">Gallery</span>' : ''}
            ${tpl.capabilities?.music ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">Music</span>' : ''}
            ${tpl.capabilities?.countdown ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">Countdown</span>' : ''}
            ${tpl.capabilities?.themeSupport ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">Themes</span>' : ''}
            ${tpl.capabilities?.openWhen ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">OpenWhen</span>' : ''}
          </div>
        </div>
      </div>

      <!-- Action Buttons Row -->
      <div class="p-3 bg-surface-container/60 border-t border-purple-500/10 flex items-center justify-between gap-1.5">
        <a href="/template/${tpl.id}" target="_blank" class="p-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition flex items-center justify-center text-xs font-semibold" title="Preview Live Template">
          <span class="material-symbols-outlined text-[16px]">visibility</span>
        </a>
        <button onclick="openEditTemplateModal('${tpl.id}')" class="flex-1 py-1.5 px-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-semibold text-xs transition flex items-center justify-center gap-1 cursor-pointer">
          <span class="material-symbols-outlined text-[15px] text-primary">edit</span>
          <span>Edit</span>
        </button>
        <button onclick="duplicateTemplate('${tpl.id}')" class="py-1.5 px-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-semibold text-xs transition flex items-center justify-center gap-1 cursor-pointer" title="Duplicate as Draft">
          <span class="material-symbols-outlined text-[15px] text-secondary">content_copy</span>
          <span class="hidden sm:inline">Clone</span>
        </button>
        <button onclick="togglePublishTemplate('${tpl.id}', '${tpl.status || (tpl.isPublished ? 'published' : 'draft')}')" class="py-1.5 px-2 rounded-lg ${isPub ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-400' : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400'} font-semibold text-xs transition flex items-center justify-center gap-1 cursor-pointer" title="${isPub ? 'Unpublish to Draft' : 'Publish to Store'}">
          <span class="material-symbols-outlined text-[15px]">${isPub ? 'unpublished' : 'publish'}</span>
          <span>${isPub ? 'Draft' : 'Publish'}</span>
        </button>
        <button onclick="deleteTemplate('${tpl.id}', '${escapeQuotes(tpl.name)}')" class="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 transition cursor-pointer" title="Delete Template">
          <span class="material-symbols-outlined text-[16px]">delete</span>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Render Master Table
function renderTemplatesTable(templates) {
  const tableBody = document.getElementById('master-templates-table-body');
  if (!tableBody) return;

  if (templates.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-10 text-on-surface-variant text-xs">
          No templates match your filters.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = templates.map(tpl => {
    const isVip = tpl.tier === 'vip' || tpl.isPremium === true || Number(tpl.price) > 0;
    const isPub = tpl.status === 'published' || (tpl.isPublished !== false && tpl.status !== 'draft');
    const priceText = isVip ? `₹${tpl.price || 49}` : 'Free';
    const relsText = Array.isArray(tpl.relationships) ? tpl.relationships.slice(0, 2).join(', ') : 'All';

    return `
      <tr class="hover:bg-surface-container transition border-b border-purple-900/20 text-xs">
        <td class="py-3 px-4">
          <div class="flex items-center gap-3">
            <img src="${tpl.thumbnail || '/assets/file_ab2082.png'}" alt="${tpl.name}" class="w-12 h-9 rounded-lg object-cover bg-surface-container-lowest shrink-0" onerror="this.src='/assets/file_ab2082.png'"/>
            <div>
              <div class="font-bold text-on-surface text-sm flex items-center gap-1.5">
                <span>${tpl.name}</span>
                ${tpl.featured ? '<span class="text-amber-400 text-xs font-black">★</span>' : ''}
              </div>
              <span class="font-mono text-[10px] text-primary">${tpl.id}</span>
            </div>
          </div>
        </td>
        <td class="py-3 px-3">
          <span class="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 font-bold">${tpl.category || 'Birthday'}</span>
        </td>
        <td class="py-3 px-3 text-on-surface-variant font-medium">${relsText}</td>
        <td class="py-3 px-3">
          <button onclick="toggleTierTemplate('${tpl.id}', '${tpl.tier || (tpl.isPremium ? 'vip' : 'free')}', ${tpl.price || 0})" class="px-2 py-0.5 rounded-md ${isVip ? 'bg-amber-400/20 text-amber-300 font-bold hover:bg-amber-400/30' : 'bg-emerald-500/20 text-emerald-300 font-bold hover:bg-emerald-500/30'} cursor-pointer transition text-left" title="Click to toggle between VIP Pass & Free Tier">
            ${priceText} ${isVip ? '👑' : '✨'}
          </button>
        </td>
        <td class="py-3 px-3">
          <button onclick="togglePublishTemplate('${tpl.id}', '${tpl.status || (tpl.isPublished ? 'published' : 'draft')}')" class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isPub ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'} cursor-pointer">
            ${isPub ? '● Published' : '○ Draft'}
          </button>
        </td>
        <td class="py-3 px-3 text-on-surface-variant font-mono text-[11px]">${formatDate(tpl.updatedAt || tpl.createdAt)}</td>
        <td class="py-3 px-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <a href="/template/${tpl.id}" target="_blank" class="p-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface" title="Preview">
              <span class="material-symbols-outlined text-[15px]">visibility</span>
            </a>
            <button onclick="openEditTemplateModal('${tpl.id}')" class="p-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-primary" title="Edit">
              <span class="material-symbols-outlined text-[15px]">edit</span>
            </button>
            <button onclick="duplicateTemplate('${tpl.id}')" class="p-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-secondary" title="Duplicate">
              <span class="material-symbols-outlined text-[15px]">content_copy</span>
            </button>
            <button onclick="deleteTemplate('${tpl.id}', '${escapeQuotes(tpl.name)}')" class="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400" title="Delete">
              <span class="material-symbols-outlined text-[15px]">delete</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// 7. Duplicate Template Action
async function duplicateTemplate(templateId) {
  try {
    showToast('Duplicating template...');
    let resData;
    if (window.templateRepository && typeof window.templateRepository.duplicate === 'function') {
      resData = await window.templateRepository.duplicate(templateId);
    } else {
      const res = await fetch('/api/templates/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: templateId })
      });
      resData = await res.json();
    }

    showToast('🎉 Template duplicated as Draft!');
    await loadDynamicTemplates();
  } catch (err) {
    alert('Failed to duplicate template: ' + err.message);
  }
}

// 8. Publish / Unpublish Toggle Action
async function togglePublishTemplate(templateId, currentStatus) {
  try {
    const isCurrentlyPub = currentStatus === 'published';
    const newStatus = isCurrentlyPub ? 'draft' : 'published';
    const isPub = !isCurrentlyPub;

    if (window.templateRepository) {
      if (isCurrentlyPub) {
        await window.templateRepository.unpublish(templateId);
      } else {
        await window.templateRepository.publish(templateId);
      }
    } else {
      await fetch('/api/templates/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: templateId, status: newStatus, isPublished: isPub })
      });
    }

    showToast(isPub ? '🎉 Template published to live marketplace!' : '📁 Template moved to Drafts.');
    await loadDynamicTemplates();
  } catch (err) {
    alert('Error toggling publish state: ' + err.message);
  }
}

// 8b. Toggle Tier / Pricing Action (Part 11 Section 16)
async function toggleTierTemplate(templateId, currentTier, currentPrice) {
  try {
    const isVip = currentTier === 'vip' || currentTier === 'premium';
    const newTier = isVip ? 'free' : 'vip';
    const newPrice = isVip ? 0 : (currentPrice && currentPrice > 0 ? currentPrice : 49);
    const isPremium = newTier === 'vip';

    const payload = {
      id: templateId,
      tier: newTier,
      price: newPrice,
      isPremium
    };

    if (window.templateRepository && typeof window.templateRepository.update === 'function') {
      await window.templateRepository.update(payload);
    } else {
      await fetch('/api/templates/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    showToast(isPremium ? '👑 Switched to VIP Pass (₹' + newPrice + ')' : '✨ Switched to Free Tier (₹0)');
    await loadDynamicTemplates();
  } catch (err) {
    alert('Error toggling template tier: ' + err.message);
  }
}

// 9. Safe Template Delete Action (Part 10 Section 12)
async function deleteTemplate(templateId, name) {
  if (!confirm(`Are you sure you want to delete template "${name}"?\n\nIf active celebration wishes are using this template, you should Unpublish it instead.`)) {
    return;
  }

  try {
    let result;
    if (window.templateRepository && typeof window.templateRepository.delete === 'function') {
      result = await window.templateRepository.delete(templateId);
    } else {
      const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}`, { method: 'DELETE' });
      result = await res.json();
    }

    if (result.success) {
      showToast(`Template "${name}" deleted.`);
      await loadDynamicTemplates();
    } else if (result.referenced) {
      // Safety block active wishes
      alert(`⚠️ SAFEGUARD BLOCKED DELETION:\n\n${result.message}\n\nAction: Please use the "Unpublish / Draft" button to safely hide this template from the store without breaking existing recipient links.`);
    } else {
      alert('Error deleting template: ' + (result.message || 'Unknown error'));
    }
  } catch (err) {
    alert('Network error deleting template: ' + err.message);
  }
}

// 10. Open Edit Template Modal (Part 10 Section 6 & 11)
window.openEditTemplateModal = async function(templateId) {
  currentEditingTemplateId = templateId;
  const tpl = allAdminTemplates.find(t => t.id === templateId);
  if (!tpl) {
    alert('Template not found');
    return;
  }

  // Populate Categories Select from Category Repository
  const catSelect = document.getElementById('edit-tpl-category');
  if (catSelect && window.categoryRepository) {
    const cats = await window.categoryRepository.getAll();
    catSelect.innerHTML = cats.map(c => `
      <option value="${c.name}" ${c.name.toLowerCase() === (tpl.category || '').toLowerCase() ? 'selected' : ''}>
        ${c.icon || '✦'} ${c.name}
      </option>
    `).join('');
  }

  // Form fields
  const elId = document.getElementById('edit-tpl-id');
  const elName = document.getElementById('edit-tpl-name');
  const elSlug = document.getElementById('edit-tpl-slug');
  const elRels = document.getElementById('edit-tpl-relationships');
  const elTags = document.getElementById('edit-tpl-tags');
  const elDesc = document.getElementById('edit-tpl-desc');
  const elTier = document.getElementById('edit-tpl-tier');
  const elPrice = document.getElementById('edit-tpl-price');
  const elStatus = document.getElementById('edit-tpl-status');
  const elFeatured = document.getElementById('edit-tpl-featured');
  const elPlacement = document.getElementById('edit-tpl-placement');
  const elThumb = document.getElementById('edit-tpl-thumb');
  const elThumbImg = document.getElementById('edit-tpl-thumb-preview');

  if (elId) elId.value = tpl.id;
  if (elName) elName.value = tpl.name || '';
  if (elSlug) elSlug.value = tpl.slug || '';
  if (elRels) elRels.value = Array.isArray(tpl.relationships) ? tpl.relationships.join(', ') : '';
  if (elTags) elTags.value = Array.isArray(tpl.tags) ? tpl.tags.join(', ') : '';
  if (elDesc) elDesc.value = tpl.description || '';
  if (elTier) elTier.value = tpl.tier === 'vip' || tpl.isPremium ? 'vip' : 'free';
  if (elPrice) elPrice.value = tpl.price !== undefined ? tpl.price : 49;
  if (elStatus) elStatus.value = tpl.status || (tpl.isPublished ? 'published' : 'draft');
  if (elFeatured) elFeatured.checked = Boolean(tpl.featured);
  if (elPlacement) elPlacement.value = tpl.placement || 1;
  if (elThumb) elThumb.value = tpl.thumbnail || '';
  if (elThumbImg) elThumbImg.src = tpl.thumbnail || '/assets/file_ab2082.png';

  // Capabilities Matrix
  const caps = tpl.capabilities || {};
  const capKeys = [
    'hero', 'gallery', 'message', 'memories', 'timeline', 'music', 'voiceNote',
    'countdown', 'openWhen', 'secretMessage', 'finalSurprise', 'galleryLayouts',
    'themeSupport', 'animationSupport', 'backgroundSupport'
  ];

  capKeys.forEach(k => {
    const checkEl = document.getElementById(`cap-check-${k}`);
    if (checkEl) {
      checkEl.checked = caps[k] !== false;
    }
  });

  const modal = document.getElementById('edit-template-modal');
  if (modal) modal.classList.remove('hidden');
};

window.closeEditTemplateModal = function() {
  const modal = document.getElementById('edit-template-modal');
  if (modal) modal.classList.add('hidden');
  currentEditingTemplateId = null;
};

window.saveTemplateEdits = async function() {
  if (!currentEditingTemplateId) return;

  const btn = document.getElementById('btn-save-tpl-edits');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">refresh</span> Saving...';
  }

  try {
    const name = document.getElementById('edit-tpl-name').value.trim();
    const slug = document.getElementById('edit-tpl-slug').value.trim();
    const category = document.getElementById('edit-tpl-category').value;
    const relsRaw = document.getElementById('edit-tpl-relationships').value;
    const tagsRaw = document.getElementById('edit-tpl-tags').value;
    const description = document.getElementById('edit-tpl-desc').value.trim();
    const tier = document.getElementById('edit-tpl-tier').value;
    const price = Number(document.getElementById('edit-tpl-price').value) || 0;
    const status = document.getElementById('edit-tpl-status').value;
    const featured = document.getElementById('edit-tpl-featured').checked;
    const placement = Number(document.getElementById('edit-tpl-placement').value) || 1;
    const thumbnail = document.getElementById('edit-tpl-thumb').value.trim();

    const relationships = relsRaw.split(',').map(s => s.trim()).filter(Boolean);
    const tags = tagsRaw.split(',').map(s => s.trim()).filter(Boolean);

    const capabilities = {
      hero: document.getElementById('cap-check-hero')?.checked ?? true,
      gallery: document.getElementById('cap-check-gallery')?.checked ?? true,
      message: document.getElementById('cap-check-message')?.checked ?? true,
      memories: document.getElementById('cap-check-memories')?.checked ?? true,
      timeline: document.getElementById('cap-check-timeline')?.checked ?? false,
      music: document.getElementById('cap-check-music')?.checked ?? true,
      voiceNote: document.getElementById('cap-check-voiceNote')?.checked ?? true,
      countdown: document.getElementById('cap-check-countdown')?.checked ?? false,
      openWhen: document.getElementById('cap-check-openWhen')?.checked ?? false,
      secretMessage: document.getElementById('cap-check-secretMessage')?.checked ?? true,
      finalSurprise: document.getElementById('cap-check-finalSurprise')?.checked ?? true,
      galleryLayouts: document.getElementById('cap-check-galleryLayouts')?.checked ?? true,
      themeSupport: document.getElementById('cap-check-themeSupport')?.checked ?? true,
      animationSupport: document.getElementById('cap-check-animationSupport')?.checked ?? true,
      backgroundSupport: document.getElementById('cap-check-backgroundSupport')?.checked ?? true
    };

    const updatePayload = {
      id: currentEditingTemplateId,
      name,
      slug,
      category,
      relationships,
      tags,
      description,
      tier,
      price: tier === 'vip' ? price : 0,
      isPremium: tier === 'vip',
      status,
      isPublished: status === 'published',
      featured,
      placement,
      thumbnail: thumbnail || '/assets/file_ab2082.png',
      capabilities,
      templateVersion: 1
    };

    // Part 12: Admin Template Validation
    if (window.WishTemplateDefinitionService) {
      const val = window.WishTemplateDefinitionService.validateTemplate(updatePayload);
      if (!val.valid) {
        alert('⚠️ Template Validation Failed:\n\n' + val.errors.join('\n'));
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Save Changes';
        }
        return;
      }
    }

    if (window.templateRepository && typeof window.templateRepository.update === 'function') {
      await window.templateRepository.update(updatePayload);
    } else {
      const res = await fetch('/api/templates/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Update failed');
    }

    closeEditTemplateModal();
    showToast(`🎉 Template "${name}" updated successfully!`);
    await loadDynamicTemplates();
  } catch (err) {
    alert('Failed to save changes: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Save Changes';
    }
  }
};

// Helper Utilities
function isMediaFile(filename) {
  const l = filename.toLowerCase();
  return l.endsWith('.jpg') || l.endsWith('.jpeg') || l.endsWith('.png') || l.endsWith('.webp') ||
         l.endsWith('.gif') || l.endsWith('.svg') || l.endsWith('.mp3') || l.endsWith('.wav') ||
         l.endsWith('.mp4') || l.endsWith('.webm') || l.endsWith('.ogg');
}

function isImageFile(filename) {
  const l = filename.toLowerCase();
  return l.endsWith('.jpg') || l.endsWith('.jpeg') || l.endsWith('.png') || l.endsWith('.webp') || l.endsWith('.gif') || l.endsWith('.svg');
}

function getMimeType(filename) {
  const l = filename.toLowerCase();
  if (l.endsWith('.jpg') || l.endsWith('.jpeg')) return 'image/jpeg';
  if (l.endsWith('.png')) return 'image/png';
  if (l.endsWith('.webp')) return 'image/webp';
  if (l.endsWith('.gif')) return 'image/gif';
  if (l.endsWith('.svg')) return 'image/svg+xml';
  if (l.endsWith('.mp3')) return 'audio/mpeg';
  if (l.endsWith('.wav')) return 'audio/wav';
  if (l.endsWith('.mp4')) return 'video/mp4';
  if (l.endsWith('.webm')) return 'video/webm';
  return 'application/octet-stream';
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function showUploadProgress(msg) {
  const progElem = document.getElementById('upload-status-indicator');
  const progText = document.getElementById('upload-status-text');
  if (progElem && progText) {
    progText.textContent = msg;
    progElem.classList.remove('hidden');
  }
}

function hideUploadProgress() {
  const progElem = document.getElementById('upload-status-indicator');
  if (progElem) progElem.classList.add('hidden');
}

var showToast = function(msg) {
  let toast = document.getElementById('wm-admin-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'wm-admin-toast';
    toast.className = 'fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl bg-purple-900/90 text-white font-semibold shadow-2xl border border-purple-500/40 backdrop-blur-xl transition-all duration-300 transform translate-y-12 opacity-0 pointer-events-none';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.remove('translate-y-12', 'opacity-0', 'pointer-events-none');
  setTimeout(() => {
    toast.classList.add('translate-y-12', 'opacity-0', 'pointer-events-none');
  }, 4000);
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeQuotes(str) {
  return (str || '').replace(/'/g, "\\'");
}
