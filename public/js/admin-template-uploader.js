// WishMagic Admin Studio - Universal Website & Code Folder Uploader Engine

let currentUploadedFiles = {}; // { [relativePath]: { content, isBase64 } }
let detectedDynamicFields = []; // [ { key, label, type, defaultValue } ]
let customCoverThumbnail = null;
let currentPreviewBlobUrl = null;
let currentZipRawFile = null; // Part 20: Real B2 ZIP archive buffer tracker

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
  currentZipRawFile = null;
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
  currentZipRawFile = zipFile;
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

    // ZIP Security Limits (Requirement 20)
    const MAX_ZIP_FILES = 1000;
    const MAX_ENTRY_UNCOMPRESSED_BYTES = 25 * 1024 * 1024; // 25 MB max per entry
    if (entries.length > MAX_ZIP_FILES) {
      throw new Error(`ZIP archive exceeds maximum file count limit of ${MAX_ZIP_FILES} entries.`);
    }

    const DANGEROUS_EXTENSIONS = /\.(exe|sh|bat|cmd|com|vbs|php|py|pl|cgi|jar|war|scr|msi)$/i;

    for (const rawPath of entries) {
      const entry = zip.files[rawPath];
      if (entry.dir) continue;

      // Anti-Path Traversal Verification: reject absolute paths, .., \
      const normalizedRaw = String(rawPath).replace(/\\/g, '/');
      if (
        normalizedRaw.startsWith('/') ||
        normalizedRaw.includes('../') ||
        normalizedRaw.includes('/..') ||
        normalizedRaw === '..' ||
        normalizedRaw.startsWith('../')
      ) {
        console.warn(`[ZIP Security] Skipping malicious traversal path in ZIP: ${rawPath}`);
        continue;
      }

      // Reject dangerous executable extensions
      if (DANGEROUS_EXTENSIONS.test(normalizedRaw)) {
        console.warn(`[ZIP Security] Skipping disallowed executable file in ZIP: ${rawPath}`);
        continue;
      }

      // Normalize path to strip any top-level folder
      let relPath = normalizedRaw;
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
  
  if (typeof WishMagicTemplateAnalyzer !== 'undefined' && typeof WishMagicTemplateAnalyzer.analyze === 'function') {
    // Collect package resources
    let cssText = '';
    let jsText = '';
    let jsonManifest = null;

    Object.keys(currentUploadedFiles).forEach(p => {
      const entry = currentUploadedFiles[p];
      if (!entry.isBase64) {
        if (p.endsWith('.css')) cssText += '\n' + entry.content;
        else if (p.endsWith('.js')) jsText += '\n' + entry.content;
        else if (p.endsWith('wishmagic.json') || p.endsWith('manifest.json')) jsonManifest = entry.content;
      }
    });

    const analysis = WishMagicTemplateAnalyzer.analyze({
      html,
      css: cssText,
      js: jsText,
      json: jsonManifest,
      files: currentUploadedFiles
    }, { force: true });

    if (analysis && Array.isArray(analysis.fields) && analysis.fields.length > 0) {
      detectedDynamicFields = analysis.fields.map(f => ({
        key: f.key,
        label: f.label || f.key,
        type: f.type || 'text',
        required: Boolean(f.required),
        defaultValue: f.defaultValue || ''
      }));
      renderDetectedFieldsBadges();
      return;
    }
  }

  const fieldMap = new Map();
  if (html) {
    // 1. Scan for data-wm="field_name" or data-wm-field="field_name"
    const dataWmRegex = /data-wm(?:-field)?=["']([^"']+)["']/gi;
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

  if (currentZipRawFile) {
    try {
      const base64Promise = new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result;
          resolve(typeof res === 'string' ? res.split(',')[1] : null);
        };
        reader.onerror = reject;
        reader.readAsDataURL(currentZipRawFile);
      });
      payload.zipBase64 = await base64Promise;
    } catch (e) {
      console.warn('FileReader encoding failed, attempting chunked array buffer encoding:', e);
      try {
        const arrayBuffer = await currentZipRawFile.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        payload.zipBase64 = btoa(binary);
      } catch (err2) {
        console.warn('Could not encode raw ZIP file, falling back to extracted files bundle:', err2);
      }
    }
  }

  try {
    const idempotencyKey = 'op_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const res = await fetch('/api/templates/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      // Close modal
      toggleModal('upload-code-modal');
      // Show success notification
      if (data.versionId) {
        if (data.duplicateDetected) {
          showToast(`ℹ️ Duplicate package detected: Reusing existing staged version ${data.versionLabel || data.versionId}.`);
        } else {
          showToast(`🎉 Version ${data.versionLabel || data.versionId} (UTP ${data.protocol?.schemaVersion || '1.0.0'}) staged in Backblaze B2! Ready for preview.`);
        }
        
        // If preview modal or versions modal is available, offer quick action
        if (typeof window.openTemplateVersionsModal === 'function' && data.templateId) {
          setTimeout(() => {
            if (confirm(`Template version ${data.versionLabel || data.versionId} is staged in Backblaze B2!\n\nWould you like to open the Version Control & Publishing dialog to inspect and publish it?`)) {
              window.openTemplateVersionsModal(data.templateId);
            }
          }, 400);
        }
      } else {
        showToast(`🎉 Template "${title}" successfully deployed!`);
      }
      // Reload templates list
      loadDynamicTemplates();
    } else if (data.code === 'UTP_VALIDATION_FAILED') {
      const issueDetails = Array.isArray(data.issues) ? data.issues.map(i => `• [${i.severity.toUpperCase()}] ${i.code}: ${i.message}`).join('\n') : '';
      alert(`⚠️ UNIVERSAL TEMPLATE PROTOCOL (UTP) VALIDATION FAILED:\n\n${data.message}\n\n${issueDetails}\n\nPlease check wishmagic.json manifest and required files.`);
    } else if (data.code === 'B2_NOT_CONFIGURED') {
      alert(`⚠️ Notice: Backblaze B2 is not configured in environment secrets.\n\n${data.message}\n\nPlease configure B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, and B2_BUCKET_NAME to ingest production templates into Backblaze B2.`);
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

async function runRegressionTest(templateId) {
  if (!confirm(`Run full regression and backward-compatibility test suite for template "${templateId}"?\n\nThis will verify storage integrity, version snapshots, and rendering logic for existing wishes.`)) {
    return;
  }

  if (typeof showToast === 'function') {
    showToast(`🧪 Initializing regression suite for ${templateId}...`);
  }

  try {
    const res = await fetch('/api/admin/regression-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId })
    });

    const data = await res.json();
    if (data.success) {
      const s = data.summary;
      if (s.failed === 0) {
        alert(`✅ REGRESSION TEST PASSED\n\nTemplate: ${templateId}\nTotal wishes tested: ${s.total}\nStatus: ALL OK\n\nHistorical wishes are 100% compatible with the current runtime and storage assets.`);
        if (typeof showToast === 'function') showToast(`✅ Regression passed for ${templateId}`);
      } else {
        alert(`❌ REGRESSION TEST FAILED\n\nTemplate: ${templateId}\nTotal: ${s.total}\nPassed: ${s.passed}\nFailed: ${s.failed}\n\nSome historical wishes may have broken dependencies. Check Audit Trail for details.`);
        if (typeof showToast === 'function') showToast(`❌ Regression failed for ${templateId}`);
      }
    } else {
      alert(`⚠️ Test Engine Error: ${data.message || 'Unknown error'}`);
    }
  } catch (err) {
    alert(`Error running regression test: ${err.message}`);
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
        <button onclick="openTemplateVariantsModal('${tpl.id}')" class="py-1.5 px-2 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 font-semibold text-xs transition flex items-center justify-center gap-1 cursor-pointer" title="Manage Relationship Variants">
          <span class="material-symbols-outlined text-[15px]">family_restroom</span>
          <span>Variants</span>
        </button>
        <button onclick="openTemplateVersionsModal('${tpl.id}')" class="py-1.5 px-2 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 font-semibold text-xs transition flex items-center justify-center gap-1 cursor-pointer" title="Version Control & Release Pipeline">
          <span class="material-symbols-outlined text-[15px]">account_tree</span>
          <span>Versions</span>
        </button>
        <button onclick="runRegressionTest('${tpl.id}')" class="py-1.5 px-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-semibold text-xs transition flex items-center justify-center gap-1 cursor-pointer" title="Run Backward Compatibility & Regression Tests">
          <span class="material-symbols-outlined text-[15px]">fact_check</span>
          <span>Test</span>
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
            <button onclick="openTemplateVariantsModal('${tpl.id}')" class="p-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-purple-400" title="Relationship Variants">
              <span class="material-symbols-outlined text-[15px]">family_restroom</span>
            </button>
            <button onclick="openTemplateVersionsModal('${tpl.id}')" class="p-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-indigo-400" title="Version Control & Release Pipeline">
              <span class="material-symbols-outlined text-[15px]">account_tree</span>
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

// 7. Duplicate Template Modal Dialog & Action
function openDuplicateModal(templateId) {
  const tpl = allAdminTemplates.find(t => t.id === templateId);
  const sourceName = tpl ? (tpl.name || 'Untitled Template') : templateId;
  const sourceSlug = tpl ? (tpl.slug || 'template') : 'template';
  const cleanBaseSlug = sourceSlug.replace(/-copy(-\w+)?$/, '');
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  const proposedSlug = `${cleanBaseSlug}-copy-${randomSuffix}`;
  const proposedName = `${sourceName} (Copy)`;

  const sourceIdInput = document.getElementById('duplicate-source-id');
  const sourceNameDisplay = document.getElementById('duplicate-source-name-display');
  const sourceIdDisplay = document.getElementById('duplicate-source-id-display');
  const sourceVersionBadge = document.getElementById('duplicate-source-version-badge');
  const nameInput = document.getElementById('duplicate-input-name');
  const slugInput = document.getElementById('duplicate-input-slug');
  const errorBox = document.getElementById('duplicate-modal-error');
  const submitBtn = document.getElementById('duplicate-submit-btn');

  if (sourceIdInput) sourceIdInput.value = templateId;
  if (sourceNameDisplay) sourceNameDisplay.textContent = sourceName;
  if (sourceIdDisplay) sourceIdDisplay.textContent = templateId;
  if (sourceVersionBadge) {
    sourceVersionBadge.textContent = tpl?.currentVersionId ? `Version: ${tpl.currentVersionId}` : 'Latest Version';
  }
  if (nameInput) nameInput.value = proposedName;
  if (slugInput) slugInput.value = proposedSlug;
  if (errorBox) errorBox.classList.add('hidden');
  if (submitBtn) submitBtn.disabled = false;

  const modal = document.getElementById('duplicate-template-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeDuplicateModal() {
  const modal = document.getElementById('duplicate-template-modal');
  if (modal) modal.classList.add('hidden');
  const errorBox = document.getElementById('duplicate-modal-error');
  if (errorBox) errorBox.classList.add('hidden');
}

async function submitDuplicateTemplate(event) {
  if (event) event.preventDefault();

  const sourceIdInput = document.getElementById('duplicate-source-id');
  const nameInput = document.getElementById('duplicate-input-name');
  const slugInput = document.getElementById('duplicate-input-slug');
  const errorBox = document.getElementById('duplicate-modal-error');
  const errorText = document.getElementById('duplicate-modal-error-text');
  const submitBtn = document.getElementById('duplicate-submit-btn');
  const submitBtnText = document.getElementById('duplicate-submit-btn-text');

  const sourceId = sourceIdInput ? sourceIdInput.value.trim() : '';
  const name = nameInput ? nameInput.value.trim() : '';
  const slug = slugInput ? slugInput.value.trim().toLowerCase() : '';

  if (!sourceId) {
    if (errorBox && errorText) {
      errorText.textContent = 'Source template ID is missing.';
      errorBox.classList.remove('hidden');
    }
    return;
  }

  if (!name) {
    if (errorBox && errorText) {
      errorText.textContent = 'Please enter a name for the duplicated template.';
      errorBox.classList.remove('hidden');
    }
    return;
  }

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    if (errorBox && errorText) {
      errorText.textContent = 'Invalid slug format. Use lowercase letters, numbers, and single hyphens.';
      errorBox.classList.remove('hidden');
    }
    return;
  }

  if (errorBox) errorBox.classList.add('hidden');
  if (submitBtn) submitBtn.disabled = true;
  if (submitBtnText) submitBtnText.textContent = 'Duplicating Assets...';

  try {
    showToast('Duplicating template assets and database records...');

    let resData;
    if (window.templateRepository && typeof window.templateRepository.duplicate === 'function') {
      resData = await window.templateRepository.duplicate(sourceId, { name, slug });
    } else {
      const res = await fetch('/api/templates/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sourceId, name, slug })
      });
      resData = await res.json();
    }

    if (resData && resData.success === false) {
      throw new Error(resData.error?.message || resData.message || 'Duplication rejected');
    }

    closeDuplicateModal();
    showToast('🎉 Template duplicated as Draft!');
    await loadDynamicTemplates();
  } catch (err) {
    console.error('Duplication error:', err);
    if (errorBox && errorText) {
      errorText.textContent = err.message || 'Failed to duplicate template.';
      errorBox.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (submitBtnText) submitBtnText.textContent = 'Create Duplicate';
  }
}

async function duplicateTemplate(templateId) {
  openDuplicateModal(templateId);
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

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeQuotes(str) {
  return (str || '').replace(/'/g, "\\'");
}

// ============================================================================
// PART 27: Template Family & Relationship Variants Manager Logic
// ============================================================================

let currentVariantsTemplateId = null;
let currentFamilyData = null;
let currentActiveRelId = null;
let currentVariantConfig = null;
let currentLockVersion = 1;
let currentValidationState = { valid: true, errors: [], warnings: [] };

async function openTemplateVariantsModal(templateId) {
  currentVariantsTemplateId = templateId;
  const modal = document.getElementById('template-variants-modal');
  if (modal) modal.classList.remove('hidden');

  try {
    showToast('Loading template family & variants...');
    const res = await fetch(`/api/templates/${templateId}/family`);
    const data = await res.json();
    if (!data.success) {
      alert('Failed to load variants: ' + (data.message || 'Unknown error'));
      return;
    }

    currentFamilyData = data;
    document.getElementById('var-modal-title').textContent = `${data.template.name} — Relationship Variants`;
    document.getElementById('var-modal-ver-badge').textContent = `${data.activeVersion?.id || 'V1'} Active`;

    renderVariantsRelationshipsList(data.relationships, data.variants);
    populateAddRelationshipDropdown(data.relationships);
    populateMusicDropdown(data.allMusic || []);

    // Select first supported relationship
    const firstSupported = data.relationships.find(r => r.isSupported) || data.relationships[0];
    if (firstSupported) {
      await selectRelationshipVariant(firstSupported.id);
    }
  } catch (err) {
    alert('Error loading template variants: ' + err.message);
  }
}

function closeTemplateVariantsModal() {
  const modal = document.getElementById('template-variants-modal');
  if (modal) modal.classList.add('hidden');
  currentVariantsTemplateId = null;
  currentActiveRelId = null;
}

function renderVariantsRelationshipsList(relationships, variants) {
  const listContainer = document.getElementById('var-relationships-list');
  const countBadge = document.getElementById('var-supported-count');
  if (!listContainer) return;

  const supportedCount = relationships.filter(r => r.isSupported).length;
  if (countBadge) countBadge.textContent = `${supportedCount} Active`;

  const varMap = new Map((variants || []).map(v => [v.relationship_id, v]));

  listContainer.innerHTML = relationships.map(r => {
    const isSelected = r.id === currentActiveRelId;
    const v = varMap.get(r.id);
    let statusLabel = 'Unconfigured';
    let statusClass = 'bg-surface-container-high text-outline';
    if (v) {
      if (v.status === 'published') {
        statusLabel = `Published (V${v.version_number || 1})`;
        statusClass = 'bg-emerald-500/20 text-emerald-400';
      } else {
        statusLabel = 'Draft';
        statusClass = 'bg-amber-500/20 text-amber-300';
      }
    }

    return `
      <div onclick="selectRelationshipVariant('${r.id}')" class="p-3 rounded-xl border ${isSelected ? 'border-primary bg-primary/10 shadow-md' : 'border-purple-500/15 bg-surface-container hover:bg-surface-container-high'} flex items-center justify-between gap-2 cursor-pointer transition">
        <div class="flex items-center gap-2.5">
          <input type="checkbox" ${r.isSupported ? 'checked' : ''} onclick="event.stopPropagation(); toggleRelationshipSupport('${r.id}', this.checked)" class="rounded text-primary w-4 h-4 cursor-pointer" title="Enable/disable support for this relationship"/>
          <span class="text-xl">${r.icon || '❤️'}</span>
          <div class="flex flex-col">
            <span class="text-xs font-bold text-on-surface">${r.displayName || r.name}</span>
            <span class="text-[10px] text-outline capitalize">${r.category || 'celebration'}</span>
          </div>
        </div>
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${statusClass}">
          ${statusLabel}
        </span>
      </div>
    `;
  }).join('');
}

function populateAddRelationshipDropdown(relationships) {
  const select = document.getElementById('var-add-rel-select');
  if (!select) return;
  const unsupported = relationships.filter(r => !r.isSupported);
  select.innerHTML = '<option value="">Select relationship to activate...</option>' + unsupported.map(r => `
    <option value="${r.id}">${r.icon || '❤️'} ${r.name} (${r.category})</option>
  `).join('');
}

function populateMusicDropdown(musicList) {
  const select = document.getElementById('var-music-select');
  if (!select) return;
  select.innerHTML = '<option value="">Default Celebration Strings</option>' + musicList.map(m => `
    <option value="${m.id}">${m.title} — ${m.artist} [${m.category}]</option>
  `).join('');

  select.onchange = () => {
    const mId = select.value;
    const song = musicList.find(item => item.id === mId);
    const player = document.getElementById('var-music-player-preview');
    const audioElem = document.getElementById('var-audio-element');
    if (song && song.playbackUrl) {
      document.getElementById('var-preview-music-title').textContent = song.title;
      document.getElementById('var-preview-music-artist').textContent = song.artist || '';
      audioElem.src = song.playbackUrl;
      player.classList.remove('hidden');
    } else {
      player.classList.add('hidden');
    }
  };
}

async function selectRelationshipVariant(relId) {
  currentActiveRelId = relId;
  const rel = (currentFamilyData?.relationships || []).find(r => r.id === relId);
  if (!rel) return;

  // Highlight selected card
  renderVariantsRelationshipsList(currentFamilyData.relationships, currentFamilyData.variants);

  document.getElementById('var-active-rel-icon').textContent = rel.icon || '❤️';
  document.getElementById('var-active-rel-title').textContent = `${rel.displayName || rel.name} Edition`;
  document.getElementById('var-active-rel-category').textContent = `${rel.category || 'General'} Relationship Category`;

  try {
    const res = await fetch(`/api/templates/${currentVariantsTemplateId}/variants/${relId}`);
    const data = await res.json();
    if (!data.success) {
      alert('Error fetching variant: ' + data.message);
      return;
    }

    const variant = data.variant;
    currentVariantConfig = variant.configuration || {};
    currentLockVersion = variant.lock_version || 1;

    document.getElementById('var-active-status-badge').textContent = (variant.status === 'published' ? 'Published' : 'Draft');
    document.getElementById('var-active-status-badge').className = `px-2 py-0.5 rounded-full font-bold text-[10px] ${variant.status === 'published' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`;
    document.getElementById('var-active-lock-version').textContent = `Lock V${currentLockVersion}`;

    // Fill form fields
    const msgs = currentVariantConfig.messages || {};
    const theme = currentVariantConfig.theme || {};
    const effects = currentVariantConfig.effects || {};
    const anim = currentVariantConfig.animations || {};
    const music = currentVariantConfig.music || {};

    document.getElementById('var-field-displayName').value = currentVariantConfig.displayName || `${rel.displayName || rel.name} Edition`;
    document.getElementById('var-field-atmosphere').value = currentVariantConfig.atmosphere || '';
    document.getElementById('var-field-hero_title').value = msgs.hero_title || `Happy Celebration, ${rel.name}! ✨`;
    document.getElementById('var-field-subtitle').value = msgs.subtitle || '';
    document.getElementById('var-field-main_message').value = msgs.main_message || '';
    document.getElementById('var-field-gallery_heading').value = msgs.gallery_heading || '';
    document.getElementById('var-field-surprise_text').value = msgs.surprise_text || '';

    // Style
    const accentColor = theme.accentColor || '#ec4899';
    document.getElementById('var-theme-color').value = accentColor;
    document.getElementById('var-theme-color-hex').value = accentColor;
    document.getElementById('var-theme-cardStyle').value = theme.cardStyle || 'glass-glow';
    document.getElementById('var-theme-mood').value = theme.mood || '';
    document.getElementById('var-effects-particles').value = effects.particles || 'floating-hearts';
    document.getElementById('var-anim-intensity').value = anim.intensity || 'smooth';

    // Music
    const musicSelect = document.getElementById('var-music-select');
    if (musicSelect && music.defaultMusicId) {
      musicSelect.value = music.defaultMusicId;
      musicSelect.dispatchEvent(new Event('change'));
    }

    // Reset validation UI
    document.getElementById('var-validation-results').innerHTML = '<span class="text-xs text-outline italic">Click "Run Health Check" to inspect all message keys and assets.</span>';
    document.getElementById('var-save-status-msg').textContent = '';

  } catch (err) {
    alert('Error loading relationship variant: ' + err.message);
  }
}

function switchVariantTab(tabKey) {
  const tabs = ['messages', 'style', 'music', 'validation'];
  tabs.forEach(t => {
    const pane = document.getElementById(`var-tab-${t}`);
    const btn = document.getElementById(`var-tab-btn-${t}`);
    if (pane) pane.classList.toggle('hidden', t !== tabKey);
    if (btn) {
      if (t === tabKey) {
        btn.className = 'pb-2 border-b-2 border-primary text-primary flex items-center gap-1.5 cursor-pointer';
      } else {
        btn.className = 'pb-2 border-b-2 border-transparent text-outline hover:text-on-surface flex items-center gap-1.5 cursor-pointer';
      }
    }
  });
}

function collectVariantConfigFromForm() {
  const color = document.getElementById('var-theme-color').value;
  return {
    displayName: document.getElementById('var-field-displayName').value.trim(),
    atmosphere: document.getElementById('var-field-atmosphere').value.trim(),
    messages: {
      hero_title: document.getElementById('var-field-hero_title').value.trim(),
      subtitle: document.getElementById('var-field-subtitle').value.trim(),
      main_message: document.getElementById('var-field-main_message').value.trim(),
      gallery_heading: document.getElementById('var-field-gallery_heading').value.trim(),
      surprise_text: document.getElementById('var-field-surprise_text').value.trim()
    },
    theme: {
      accentColor: color,
      cardStyle: document.getElementById('var-theme-cardStyle').value,
      mood: document.getElementById('var-theme-mood').value.trim()
    },
    effects: {
      particles: document.getElementById('var-effects-particles').value
    },
    animations: {
      intensity: document.getElementById('var-anim-intensity').value
    },
    music: {
      defaultMusicId: document.getElementById('var-music-select').value || null
    }
  };
}

async function saveVariantDraft() {
  if (!currentVariantsTemplateId || !currentActiveRelId) return;
  const statusMsg = document.getElementById('var-save-status-msg');
  if (statusMsg) statusMsg.textContent = 'Saving draft...';

  const config = collectVariantConfigFromForm();
  try {
    const res = await fetch(`/api/templates/${currentVariantsTemplateId}/variants/${currentActiveRelId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'draft',
        lockVersion: currentLockVersion,
        configuration: config
      })
    });

    const data = await res.json();
    if (res.status === 409) {
      alert(`⚠️ CONCURRENCY CONFLICT: ${data.message}`);
      await selectRelationshipVariant(currentActiveRelId);
      return;
    }
    if (!data.success) {
      alert('Save failed: ' + data.message);
      return;
    }

    currentLockVersion = data.variant.lock_version;
    document.getElementById('var-active-lock-version').textContent = `Lock V${currentLockVersion}`;
    if (statusMsg) statusMsg.textContent = '✅ Draft saved';
    showToast('Variant draft saved successfully!');

    // Update in family data list
    const vIdx = currentFamilyData.variants.findIndex(v => v.relationship_id === currentActiveRelId);
    if (vIdx >= 0) currentFamilyData.variants[vIdx] = data.variant;
    else currentFamilyData.variants.push(data.variant);
    renderVariantsRelationshipsList(currentFamilyData.relationships, currentFamilyData.variants);
  } catch (err) {
    alert('Error saving draft: ' + err.message);
  }
}

async function publishCurrentVariant() {
  if (!currentVariantsTemplateId || !currentActiveRelId) return;

  const config = collectVariantConfigFromForm();
  try {
    showToast('Publishing variant...');
    const res = await fetch(`/api/templates/${currentVariantsTemplateId}/variants/${currentActiveRelId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configuration: config
      })
    });

    const data = await res.json();
    if (res.status === 400 && data.errors) {
      switchVariantTab('validation');
      renderValidationResults(data);
      alert('Cannot publish variant: Validation errors detected. Check the Validation tab.');
      return;
    }
    if (!data.success) {
      alert('Publish failed: ' + data.message);
      return;
    }

    currentLockVersion = data.variant.lock_version;
    document.getElementById('var-active-lock-version').textContent = `Lock V${currentLockVersion}`;
    document.getElementById('var-active-status-badge').textContent = 'Published';
    document.getElementById('var-active-status-badge').className = 'px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-500/20 text-emerald-300';

    showToast(`🎉 Published V${data.versionNumber} successfully!`);

    // Refresh list
    const vIdx = currentFamilyData.variants.findIndex(v => v.relationship_id === currentActiveRelId);
    if (vIdx >= 0) currentFamilyData.variants[vIdx] = data.variant;
    else currentFamilyData.variants.push(data.variant);
    renderVariantsRelationshipsList(currentFamilyData.relationships, currentFamilyData.variants);
  } catch (err) {
    alert('Error publishing variant: ' + err.message);
  }
}

async function runVariantValidation() {
  if (!currentVariantsTemplateId || !currentActiveRelId) return;
  const config = collectVariantConfigFromForm();

  try {
    const res = await fetch(`/api/templates/${currentVariantsTemplateId}/variants/${currentActiveRelId}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configuration: config
      })
    });
    const data = await res.json();
    renderValidationResults(data);
  } catch (err) {
    alert('Validation call failed: ' + err.message);
  }
}

function renderValidationResults(data) {
  const container = document.getElementById('var-validation-results');
  if (!container) return;

  if (data.valid) {
    container.innerHTML = `
      <div class="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
        <span class="material-symbols-outlined text-lg">check_circle</span>
        <span class="font-bold">Configuration is 100% Valid & Ready for Production!</span>
      </div>
      ${(data.warnings || []).map(w => `
        <div class="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-1.5">
          <span class="material-symbols-outlined text-sm">warning</span>
          <span>${w}</span>
        </div>
      `).join('')}
    `;
  } else {
    container.innerHTML = `
      <div class="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
        <span class="material-symbols-outlined text-lg">error</span>
        <span class="font-bold">Validation Failed (${data.errors.length} Errors Found)</span>
      </div>
      <div class="flex flex-col gap-1 mt-1">
        ${(data.errors || []).map(e => `
          <div class="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] flex items-center gap-1.5">
            <span class="material-symbols-outlined text-sm">close</span>
            <span>${e}</span>
          </div>
        `).join('')}
      </div>
    `;
  }
}

async function toggleRelationshipSupport(relId, enabled) {
  if (!currentVariantsTemplateId) return;

  try {
    const res = await fetch(`/api/templates/${currentVariantsTemplateId}/relationships`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        relationshipId: relId,
        enabled
      })
    });

    const data = await res.json();
    if (res.status === 409 && data.code === 'DEPENDENCY_PROTECTED') {
      const confirmForce = confirm(`⚠️ DEPENDENCY PROTECTION:\n\n${data.message}\n\nDo you want to override and force disable?`);
      if (confirmForce) {
        await fetch(`/api/templates/${currentVariantsTemplateId}/relationships`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ relationshipId: relId, enabled: false, force: true })
        });
      } else {
        // Re-check box
        renderVariantsRelationshipsList(currentFamilyData.relationships, currentFamilyData.variants);
        return;
      }
    }

    showToast(enabled ? 'Relationship support activated' : 'Relationship support deactivated');
    // Refresh
    const relObj = currentFamilyData.relationships.find(r => r.id === relId);
    if (relObj) relObj.isSupported = enabled;
    renderVariantsRelationshipsList(currentFamilyData.relationships, currentFamilyData.variants);
    populateAddRelationshipDropdown(currentFamilyData.relationships);
  } catch (err) {
    alert('Failed to update relationship: ' + err.message);
  }
}

async function addSelectedRelationshipSupport() {
  const select = document.getElementById('var-add-rel-select');
  const relId = select.value;
  if (!relId) return;
  await toggleRelationshipSupport(relId, true);
  await selectRelationshipVariant(relId);
}

function showCloneVariantDropdown() {
  const container = document.getElementById('var-clone-container');
  const select = document.getElementById('var-clone-source-select');
  if (!container || !select) return;

  const others = (currentFamilyData?.relationships || []).filter(r => r.id !== currentActiveRelId);
  select.innerHTML = others.map(r => `
    <option value="${r.id}">${r.icon || '❤️'} ${r.name}</option>
  `).join('');

  container.classList.remove('hidden');
}

async function executeCloneVariant() {
  const sourceRelId = document.getElementById('var-clone-source-select').value;
  if (!sourceRelId || !currentActiveRelId) return;

  try {
    showToast('Cloning variant...');
    const res = await fetch(`/api/templates/${currentVariantsTemplateId}/variants/${sourceRelId}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetRelationshipId: currentActiveRelId
      })
    });

    const data = await res.json();
    if (!data.success) {
      alert('Cloning failed: ' + data.message);
      return;
    }

    document.getElementById('var-clone-container').classList.add('hidden');
    showToast('🎉 Variant cloned into current relationship draft!');
    await selectRelationshipVariant(currentActiveRelId);
  } catch (err) {
    alert('Error cloning variant: ' + err.message);
  }
}

async function archiveCurrentVariant() {
  if (!currentVariantsTemplateId || !currentActiveRelId) return;
  const ok = confirm('Are you sure you want to archive this variant? It will safely preserve all existing wishes.');
  if (!ok) return;

  try {
    const res = await fetch(`/api/templates/${currentVariantsTemplateId}/variants/${currentActiveRelId}/archive`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!data.success) {
      alert('Archive failed: ' + data.message);
      return;
    }
    showToast('Variant safely archived.');
    await selectRelationshipVariant(currentActiveRelId);
  } catch (err) {
    alert('Error archiving variant: ' + err.message);
  }
}

function openResolverLivePreview() {
  if (!currentVariantsTemplateId) return;
  const modal = document.getElementById('resolver-preview-modal');
  const iframe = document.getElementById('resolver-preview-iframe');
  const title = document.getElementById('resolver-preview-title');

  const rel = (currentFamilyData?.relationships || []).find(r => r.id === currentActiveRelId);
  const relSlug = rel?.slug || 'friend';

  if (title) title.textContent = `Live Resolver Sandbox — ${currentFamilyData?.template?.name || 'Template'} (${rel?.name || 'Variant'})`;
  if (iframe) iframe.src = `/template-preview.html?template=${currentVariantsTemplateId}&rel=${relSlug}&preview=true`;
  if (modal) modal.classList.remove('hidden');
}

// ============================================================================
// PART 28: TEMPLATE VERSION CONTROL & RELEASE PIPELINE CONTROLLER
// ============================================================================

let currentVersionsTemplateId = null;
let currentVersionsList = [];
let currentDetailedVersion = null;
let currentPublishCandidateVersionId = null;

async function openTemplateVersionsModal(templateId) {
  currentVersionsTemplateId = templateId;
  const modal = document.getElementById('template-versions-modal');
  if (modal) modal.classList.remove('hidden');
  await loadTemplateVersions(templateId);
}

function closeTemplateVersionsModal() {
  const modal = document.getElementById('template-versions-modal');
  if (modal) modal.classList.add('hidden');
  currentVersionsTemplateId = null;
  currentVersionsList = [];
}

async function loadTemplateVersions(templateId) {
  try {
    const titleEl = document.getElementById('versions-modal-title');
    const subtitleEl = document.getElementById('versions-modal-subtitle');
    const badgeEl = document.getElementById('versions-current-badge');
    const tbody = document.getElementById('versions-table-body');
    const countEl = document.getElementById('versions-count-summary');

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-8 text-center text-outline">
            <span class="material-symbols-outlined text-[24px] animate-spin mb-1">sync</span>
            <p>Loading template versions and verification status...</p>
          </td>
        </tr>
      `;
    }

    const tpl = (window.allTemplatesCache || []).find(t => t.id === templateId) || { id: templateId, name: 'Template' };
    if (titleEl) titleEl.textContent = `${tpl.name} — Version Control`;
    if (subtitleEl) subtitleEl.textContent = `Template Family: fam_${templateId} • Storage: Backblaze B2 / Cloudflare`;

    const res = await fetch(`/api/templates/${templateId}/versions`);
    const data = await res.json();
    currentVersionsList = data.versions || [];

    const currentVer = currentVersionsList.find(v => v.is_current === 1) || currentVersionsList[0];
    if (badgeEl) {
      if (currentVer) {
        badgeEl.textContent = `Current Live: ${currentVer.version_label || currentVer.id}`;
        badgeEl.className = 'px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30';
      } else {
        badgeEl.textContent = 'No Published Version';
        badgeEl.className = 'px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30';
      }
    }

    if (countEl) countEl.textContent = `Showing ${currentVersionsList.length} immutable version(s)`;
    renderVersionsTable(currentVersionsList, tpl);
  } catch (err) {
    console.error('Error loading template versions:', err);
    showToast('Failed to load versions: ' + err.message);
  }
}

function renderVersionsTable(versions, template) {
  const tbody = document.getElementById('versions-table-body');
  if (!tbody) return;

  if (versions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-10 text-center text-outline">
          <span class="material-symbols-outlined text-[28px] mb-1">history</span>
          <p>No versions recorded yet for this template family.</p>
          <button onclick="openCreateVersionModal()" class="mt-3 px-3.5 py-1.5 rounded-xl bg-primary text-on-primary font-bold text-xs inline-flex items-center gap-1">
            <span class="material-symbols-outlined text-[15px]">add</span>
            <span>Create V1.0.0</span>
          </button>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = versions.map(v => {
    const isCurrent = v.is_current === 1;
    const status = (v.status || 'draft').toLowerCase();

    let statusPill = '';
    if (isCurrent) {
      statusPill = `<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1 w-fit"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>CURRENT</span>`;
    } else if (status === 'published') {
      statusPill = `<span class="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold w-fit">PUBLISHED</span>`;
    } else if (status === 'ready') {
      statusPill = `<span class="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold w-fit">READY</span>`;
    } else if (status === 'rollback_candidate') {
      statusPill = `<span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold w-fit">ROLLBACK CANDIDATE</span>`;
    } else if (status === 'failed') {
      statusPill = `<span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold w-fit">FAILED</span>`;
    } else if (status === 'archived') {
      statusPill = `<span class="px-2 py-0.5 rounded-full bg-surface-container-high text-outline font-medium w-fit">ARCHIVED</span>`;
    } else {
      statusPill = `<span class="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-semibold w-fit">DRAFT</span>`;
    }

    const sizeKb = Math.round((v.total_size_bytes || 0) / 1024);
    const dateFormatted = v.published_at ? formatDate(v.published_at) : (v.created_at ? formatDate(v.created_at) : '—');
    const integrityBadge = v.integrity_status === 'INTEGRITY_OK' || v.integrity_status === 'verified'
      ? `<span class="text-emerald-400 font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">check_circle</span>OK</span>`
      : `<span class="text-amber-400 flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">help</span>Unverified</span>`;

    return `
      <tr class="hover:bg-surface-container transition border-b border-purple-900/20">
        <td class="py-3 px-4">
          <div class="flex items-center gap-2">
            <span class="font-mono font-bold text-on-surface text-sm">${v.version_label || `v${v.version_number}.0.0`}</span>
            <span class="text-[10px] text-outline font-mono">(${v.id})</span>
          </div>
        </td>
        <td class="py-3 px-3">${statusPill}</td>
        <td class="py-3 px-3 text-on-surface-variant font-mono text-[11px]">
          ${v.file_count || 5} files • ${sizeKb > 0 ? sizeKb + ' KB' : '—'}
        </td>
        <td class="py-3 px-3 text-xs">${integrityBadge}</td>
        <td class="py-3 px-3 text-on-surface-variant max-w-xs truncate" title="${escapeQuotes(v.release_notes || 'No release notes')}">
          ${v.release_notes || '<span class="text-outline italic">No release notes</span>'}
        </td>
        <td class="py-3 px-3 text-on-surface-variant font-mono text-[11px]">${dateFormatted}</td>
        <td class="py-3 px-4 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <!-- View Details / File Inventory -->
            <button onclick="viewVersionDetailsModal('${v.id}')" class="p-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition" title="Inspect Files & Manifest">
              <span class="material-symbols-outlined text-[15px]">inventory_2</span>
            </button>
            <!-- Preview Exact Version Sandbox -->
            <button onclick="previewVersionSandbox('${v.id}')" class="p-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-primary transition" title="Preview Exact Version">
              <span class="material-symbols-outlined text-[15px]">visibility</span>
            </button>
            <!-- Run Validation Pipeline -->
            <button onclick="validateVersionForRelease('${v.id}')" class="p-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 transition" title="Run 17-Point Server Validation">
              <span class="material-symbols-outlined text-[15px]">rule</span>
            </button>
            <!-- Publish / Make Current -->
            ${!isCurrent ? `
              <button onclick="promptPublishVersion('${v.id}')" class="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold transition flex items-center gap-1" title="Publish & Set as Current Live Version">
                <span class="material-symbols-outlined text-[14px]">rocket_launch</span>
                <span>Publish</span>
              </button>
            ` : ''}
            <!-- Safe Rollback (if previously published and not currently active) -->
            ${!isCurrent && (status === 'published' || status === 'rollback_candidate' || status === 'ready') ? `
              <button onclick="promptRollbackVersion('${v.id}')" class="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold transition flex items-center gap-1" title="Rollback Current Live to this Version">
                <span class="material-symbols-outlined text-[14px]">history</span>
                <span>Rollback</span>
              </button>
            ` : ''}
            <!-- Verify File Integrity Checksum -->
            <button onclick="verifyVersionFiles('${v.id}')" class="p-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-outline hover:text-on-surface transition" title="Verify File Checksums">
              <span class="material-symbols-outlined text-[15px]">verified</span>
            </button>
            <!-- Delete (if not current) -->
            ${!isCurrent ? `
              <button onclick="deleteVersion('${v.id}')" class="p-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-outline hover:text-rose-400 transition" title="Delete Version">
                <span class="material-symbols-outlined text-[15px]">delete</span>
              </button>
            ` : ''}
            <!-- Archive (if not current) -->
            ${!isCurrent && status !== 'archived' ? `
              <button onclick="archiveVersion('${v.id}')" class="p-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-outline hover:text-rose-400 transition" title="Archive Version">
                <span class="material-symbols-outlined text-[15px]">archive</span>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Open Create Version Modal
function openCreateVersionModal() {
  if (!currentVersionsTemplateId) return;
  const modal = document.getElementById('create-version-modal');
  const sourceSelect = document.getElementById('create-version-source-select');

  if (sourceSelect) {
    sourceSelect.innerHTML = currentVersionsList.map(v => `
      <option value="${v.id}" ${v.is_current ? 'selected' : ''}>
        ${v.version_label || v.id} (${v.status}${v.is_current ? ' - Current' : ''})
      </option>
    `).join('');
  }

  updateVersionLabelPreview();
  if (modal) modal.classList.remove('hidden');
}

function closeCreateVersionModal() {
  const modal = document.getElementById('create-version-modal');
  if (modal) modal.classList.add('hidden');
}

function updateVersionLabelPreview() {
  const bumpRadio = document.querySelector('input[name="bumpType"]:checked');
  const bumpType = bumpRadio ? bumpRadio.value : 'minor';
  const labelInput = document.getElementById('new-version-label-input');
  if (!labelInput) return;

  let maxMajor = 1, maxMinor = 0, maxPatch = 0;
  currentVersionsList.forEach(v => {
    const label = v.version_label || '';
    const m = label.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
    if (m) {
      const maj = parseInt(m[1], 10), min = parseInt(m[2], 10), pat = parseInt(m[3], 10);
      if (maj > maxMajor || (maj === maxMajor && min > maxMinor) || (maj === maxMajor && min === maxMinor && pat > maxPatch)) {
        maxMajor = maj; maxMinor = min; maxPatch = pat;
      }
    }
  });

  let nextMajor = maxMajor, nextMinor = maxMinor, nextPatch = maxPatch;
  if (bumpType === 'major') {
    nextMajor = maxMajor + 1; nextMinor = 0; nextPatch = 0;
  } else if (bumpType === 'patch') {
    nextPatch = maxPatch + 1;
  } else {
    nextMinor = maxMinor + 1; nextPatch = 0;
  }

  labelInput.value = `v${nextMajor}.${nextMinor}.${nextPatch}`;
}

async function submitCreateVersion(e) {
  e.preventDefault();
  if (!currentVersionsTemplateId) return;

  const bumpRadio = document.querySelector('input[name="bumpType"]:checked');
  const bumpType = bumpRadio ? bumpRadio.value : 'minor';
  const versionLabel = document.getElementById('new-version-label-input').value.trim();
  const sourceVerSelect = document.getElementById('create-version-source-select');
  const sourceVersionId = sourceVerSelect ? sourceVerSelect.value : null;
  const releaseNotes = document.getElementById('new-version-release-notes').value.trim();

  try {
    showToast('Creating new version draft...');
    const res = await fetch(`/api/templates/${currentVersionsTemplateId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bumpType,
        versionLabel,
        sourceVersionId,
        releaseNotes
      })
    });

    const data = await res.json();
    if (!data.success) {
      alert('Error creating version: ' + data.message);
      return;
    }

    showToast(`🎉 Version ${versionLabel} created successfully!`);
    closeCreateVersionModal();
    await loadTemplateVersions(currentVersionsTemplateId);
  } catch (err) {
    alert('Failed to create version: ' + err.message);
  }
}

// Version Detail View
async function viewVersionDetailsModal(versionId) {
  if (!currentVersionsTemplateId) return;
  const modal = document.getElementById('version-detail-modal');
  if (modal) modal.classList.remove('hidden');

  try {
    const res = await fetch(`/api/templates/${currentVersionsTemplateId}/versions/${versionId}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    currentDetailedVersion = data.version;
    const files = data.files || [];

    const titleEl = document.getElementById('version-detail-title');
    const badgeEl = document.getElementById('version-detail-status-badge');
    const idEl = document.getElementById('version-detail-id-text');
    const fileCountEl = document.getElementById('detail-file-count');
    const totalSizeEl = document.getElementById('detail-total-size');
    const entryEl = document.getElementById('detail-entry-point');
    const integrityEl = document.getElementById('detail-integrity');
    const notesEl = document.getElementById('detail-release-notes');
    const filesSubtotalEl = document.getElementById('detail-files-subtotal');
    const filesTbody = document.getElementById('detail-files-tbody');
    const manifestEl = document.getElementById('detail-manifest-json');

    if (titleEl) titleEl.textContent = `Version Details: ${data.version.version_label || data.version.id}`;
    if (idEl) idEl.textContent = `${data.version.id} • Lock: v${data.version.lock_version || 1}`;

    const isCurrent = data.version.is_current === 1;
    if (badgeEl) {
      badgeEl.textContent = isCurrent ? 'CURRENT LIVE' : (data.version.status || 'draft').toUpperCase();
      badgeEl.className = isCurrent
        ? 'px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
        : 'px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold';
    }

    if (fileCountEl) fileCountEl.textContent = `${files.length || data.version.file_count || 0} files`;
    const kb = Math.round((data.version.total_size_bytes || 0) / 1024);
    if (totalSizeEl) totalSizeEl.textContent = `${kb} KB`;
    if (entryEl) entryEl.textContent = data.version.entry_point || 'index.html';
    if (integrityEl) integrityEl.textContent = data.version.integrity_status || 'Verified';
    if (notesEl) notesEl.value = data.version.release_notes || '';
    if (filesSubtotalEl) filesSubtotalEl.textContent = `${files.length} verified runtime files`;

    if (filesTbody) {
      if (files.length === 0) {
        filesTbody.innerHTML = `
          <tr>
            <td colspan="4" class="py-4 text-center text-outline text-xs">
              No individual file rows registered. Runtime uses B2 storage bundle.
            </td>
          </tr>
        `;
      } else {
        filesTbody.innerHTML = files.map(f => `
          <tr class="hover:bg-surface-container font-mono text-[11px]">
            <td class="py-2 px-3 text-on-surface font-semibold">${f.relative_path || f.path || f.fileName}</td>
            <td class="py-2 px-3 text-outline">${f.mime_type || 'application/octet-stream'}</td>
            <td class="py-2 px-3 text-on-surface-variant">${f.size_bytes ? Math.round(f.size_bytes / 1024) + ' KB' : '—'}</td>
            <td class="py-2 px-3 text-purple-300 truncate max-w-xs" title="${f.sha256 || ''}">${(f.sha256 || '—').substring(0, 20)}...</td>
          </tr>
        `).join('');
      }
    }

    if (manifestEl) {
      let manifestObj = {};
      try { manifestObj = JSON.parse(data.version.manifest_json || '{}'); } catch (e) {}
      if (Object.keys(manifestObj).length === 0) {
        manifestObj = {
          versionId: data.version.id,
          versionLabel: data.version.version_label,
          entryPoint: data.version.entry_point || 'index.html',
          capabilities: data.version.capabilities,
          sections: data.version.sections,
          theme: data.version.theme,
          filesCount: files.length
        };
      }
      manifestEl.textContent = JSON.stringify(manifestObj, null, 2);
    }
  } catch (err) {
    alert('Error loading version details: ' + err.message);
  }
}

function closeVersionDetailModal() {
  const modal = document.getElementById('version-detail-modal');
  if (modal) modal.classList.add('hidden');
  currentDetailedVersion = null;
}

async function saveVersionReleaseNotes() {
  if (!currentVersionsTemplateId || !currentDetailedVersion) return;
  const notes = document.getElementById('detail-release-notes').value;

  try {
    const res = await fetch(`/api/templates/${currentVersionsTemplateId}/versions/${currentDetailedVersion.id}/release-notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ releaseNotes: notes })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    showToast('Release notes saved successfully!');
    currentDetailedVersion.release_notes = notes;
    await loadTemplateVersions(currentVersionsTemplateId);
  } catch (err) {
    alert('Failed to save release notes: ' + err.message);
  }
}

// 17-Point Server Validation Pipeline
async function validateVersionForRelease(versionId) {
  if (!currentVersionsTemplateId) return;
  showToast('Running 17-point server release validation...');

  try {
    const res = await fetch(`/api/templates/${currentVersionsTemplateId}/versions/${versionId}/validate`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    openVersionChecklistModal(versionId, data);
    await loadTemplateVersions(currentVersionsTemplateId);
  } catch (err) {
    alert('Validation error: ' + err.message);
  }
}

function openVersionChecklistModal(versionId, validationData) {
  currentPublishCandidateVersionId = versionId;
  const modal = document.getElementById('version-checklist-modal');
  const titleEl = document.getElementById('checklist-modal-title');
  const bannerEl = document.getElementById('checklist-summary-banner');
  const container = document.getElementById('checklist-items-container');
  const confirmBox = document.getElementById('publish-confirm-checkbox');
  const pubBtn = document.getElementById('publish-confirm-button');

  if (titleEl) titleEl.textContent = `Release Checklist: ${versionId}`;
  if (confirmBox) confirmBox.checked = false;
  if (pubBtn) pubBtn.disabled = true;

  if (bannerEl) {
    if (validationData.valid) {
      bannerEl.className = 'p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold';
      bannerEl.textContent = '✅ All 17 verification checks PASSED! Version is verified and ready for production release.';
    } else {
      bannerEl.className = 'p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold';
      bannerEl.textContent = `❌ Validation Failed with ${validationData.errors?.length || 1} error(s). Review issues below before releasing.`;
    }
  }

  if (container) {
    const checklist = validationData.checklist || [];
    container.innerHTML = checklist.map(item => `
      <div class="p-2.5 rounded-xl ${item.passed ? 'bg-surface-container' : 'bg-rose-500/10 border border-rose-500/30'} flex items-start justify-between gap-3">
        <div class="flex items-start gap-2">
          <span class="material-symbols-outlined text-[18px] ${item.passed ? 'text-emerald-400' : 'text-rose-400'} mt-0.5">
            ${item.passed ? 'check_circle' : 'cancel'}
          </span>
          <div class="flex flex-col">
            <span class="font-bold text-on-surface text-xs">${item.name}</span>
            <span class="text-[11px] text-on-surface-variant">${item.description}</span>
            ${item.error ? `<span class="text-[10px] text-rose-400 mt-0.5 font-mono">${item.error}</span>` : ''}
          </div>
        </div>
        <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${item.passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}">
          ${item.passed ? 'PASS' : 'FAIL'}
        </span>
      </div>
    `).join('');
  }

  if (modal) modal.classList.remove('hidden');
}

function closeVersionChecklistModal() {
  const modal = document.getElementById('version-checklist-modal');
  if (modal) modal.classList.add('hidden');
  currentPublishCandidateVersionId = null;
}

function togglePublishButtonState() {
  const confirmBox = document.getElementById('publish-confirm-checkbox');
  const pubBtn = document.getElementById('publish-confirm-button');
  if (pubBtn) {
    pubBtn.disabled = !confirmBox?.checked;
  }
}

function promptPublishVersion(versionId) {
  validateVersionForRelease(versionId);
}

async function executeConfirmedPublish() {
  if (!currentVersionsTemplateId || !currentPublishCandidateVersionId) return;

  try {
    showToast('Executing server-side atomic release...');
    const res = await fetch(`/api/templates/${currentVersionsTemplateId}/versions/${currentPublishCandidateVersionId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await res.json();
    if (!data.success) {
      alert('Publish rejected: ' + data.message + (data.errors ? '\n' + data.errors.join('\n') : ''));
      return;
    }

    showToast(`🚀 Version ${currentPublishCandidateVersionId} is now LIVE and set as current default!`);
    closeVersionChecklistModal();
    await loadTemplateVersions(currentVersionsTemplateId);
    if (typeof loadDynamicTemplates === 'function') {
      loadDynamicTemplates();
    }
  } catch (err) {
    alert('Publishing error: ' + err.message);
  }
}

// Safe Version Rollback
async function promptRollbackVersion(versionId) {
  if (!currentVersionsTemplateId) return;

  const ok = confirm(`⚠️ Are you sure you want to rollback to ${versionId}?\n\nThis will safely make ${versionId} the active default for NEW wishes.\nAll previously published wishes will remain permanently unchanged and locked to their historical versions.`);
  if (!ok) return;

  try {
    showToast('Validating target version & executing safe rollback...');
    const res = await fetch(`/api/templates/${currentVersionsTemplateId}/versions/${versionId}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await res.json();
    if (!data.success) {
      alert('Rollback failed: ' + data.message);
      return;
    }

    showToast(`✅ Successfully rolled back active version to ${versionId}!`);
    await loadTemplateVersions(currentVersionsTemplateId);
    if (typeof loadDynamicTemplates === 'function') {
      loadDynamicTemplates();
    }
  } catch (err) {
    alert('Rollback error: ' + err.message);
  }
}

// Verify Version File Integrity Checksums
async function verifyVersionFiles(versionId) {
  if (!currentVersionsTemplateId) return;
  showToast('Verifying SHA-256 checksums across storage objects...');

  try {
    const res = await fetch(`/api/templates/${currentVersionsTemplateId}/versions/${versionId}/verify`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    if (data.status === 'INTEGRITY_OK') {
      showToast(`✅ Integrity Verified: All ${data.verifiedFilesCount} files match their cryptographic SHA-256 checksums.`);
    } else {
      alert(`⚠️ Integrity Warning: Found ${data.mismatchesCount} file checksum mismatch(es)!`);
    }
    await loadTemplateVersions(currentVersionsTemplateId);
  } catch (err) {
    alert('Integrity check error: ' + err.message);
  }
}

// Archive Version
async function archiveVersion(versionId) {
  if (!currentVersionsTemplateId) return;
  const ok = confirm(`Archive version ${versionId}? It will no longer appear as a release candidate.`);
  if (!ok) return;

  try {
    const res = await fetch(`/api/templates/${currentVersionsTemplateId}/versions/${versionId}/archive`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    showToast(`Version ${versionId} archived safely.`);
    await loadTemplateVersions(currentVersionsTemplateId);
  } catch (err) {
    alert('Archive error: ' + err.message);
  }
}

async function deleteVersion(versionId) {
  if (!currentVersionsTemplateId) return;
  
  if (!confirm(`Are you sure you want to PERMANENTLY delete version ${versionId}?\n\nThis is a destructive action. The system will check for active wishes pinned to this version before proceeding.`)) {
    return;
  }

  try {
    let res = await fetch(`/api/templates/${currentVersionsTemplateId}/versions/${versionId}`, {
      method: 'DELETE'
    });
    let data = await res.json();

    if (data.referenced) {
      const force = confirm(`⚠️ SAFETY WARNING: This version is referenced by ${data.activeReferencesCount} active wishes.\n\nDeleting it will BREAK these wishes (404 / Missing Assets).\n\nAre you ABSOLUTELY sure you want to force deletion?`);
      if (force) {
        res = await fetch(`/api/templates/${currentVersionsTemplateId}/versions/${versionId}?force=true`, {
          method: 'DELETE'
        });
        data = await res.json();
      } else {
        return;
      }
    }

    if (data.deleted) {
      if (typeof showToast === 'function') showToast(`Version ${versionId} deleted successfully.`);
      await loadTemplateVersions(currentVersionsTemplateId);
    } else {
      throw new Error(data.message || 'Deletion failed');
    }
  } catch (err) {
    alert('Deletion error: ' + err.message);
  }
}

// Preview Exact Version Sandbox
function previewVersionSandbox(versionId) {
  if (!currentVersionsTemplateId) return;
  const modal = document.getElementById('resolver-preview-modal');
  const iframe = document.getElementById('resolver-preview-iframe');
  const title = document.getElementById('resolver-preview-title');

  if (title) title.textContent = `Exact Version Sandbox — ${currentVersionsTemplateId} (${versionId})`;
  if (iframe) iframe.src = `/api/templates/${currentVersionsTemplateId}/versions/${versionId}/preview/index.html`;
  if (modal) modal.classList.remove('hidden');
}

// Version Comparison Tool
function openVersionCompareModal() {
  if (!currentVersionsTemplateId || currentVersionsList.length < 2) {
    alert('At least two versions are needed to perform a comparison.');
    return;
  }

  const modal = document.getElementById('version-compare-modal');
  const v1Select = document.getElementById('compare-v1-select');
  const v2Select = document.getElementById('compare-v2-select');

  if (v1Select && v2Select) {
    const options = currentVersionsList.map(v => `
      <option value="${v.id}">${v.version_label || v.id} (${v.status}${v.is_current ? ' - Current' : ''})</option>
    `).join('');

    v1Select.innerHTML = options;
    v2Select.innerHTML = options;

    if (currentVersionsList.length >= 2) {
      v1Select.selectedIndex = 1;
      v2Select.selectedIndex = 0;
    }
  }

  if (modal) modal.classList.remove('hidden');
  runVersionComparison();
}

function closeVersionCompareModal() {
  const modal = document.getElementById('version-compare-modal');
  if (modal) modal.classList.add('hidden');
}

async function runVersionComparison() {
  if (!currentVersionsTemplateId) return;
  const v1 = document.getElementById('compare-v1-select').value;
  const v2 = document.getElementById('compare-v2-select').value;
  const container = document.getElementById('compare-results-container');

  if (v1 === v2) {
    if (container) {
      container.innerHTML = `
        <div class="p-6 text-center text-outline bg-surface-container rounded-2xl">
          <p>Select two different versions to compute structural diff.</p>
        </div>
      `;
    }
    return;
  }

  try {
    if (container) {
      container.innerHTML = `<div class="p-4 text-center text-outline">Computing structural difference...</div>`;
    }

    const res = await fetch(`/api/templates/${currentVersionsTemplateId}/versions/compare?v1=${v1}&v2=${v2}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const comp = data.comparison;
    container.innerHTML = `
      <!-- Files Summary Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="p-3 rounded-xl bg-surface-container border border-purple-500/20 flex flex-col">
          <span class="text-[10px] text-emerald-400 font-bold uppercase">Files Added</span>
          <span class="text-lg font-bold text-on-surface">${comp.filesSummary.addedCount}</span>
        </div>
        <div class="p-3 rounded-xl bg-surface-container border border-purple-500/20 flex flex-col">
          <span class="text-[10px] text-rose-400 font-bold uppercase">Files Removed</span>
          <span class="text-lg font-bold text-on-surface">${comp.filesSummary.removedCount}</span>
        </div>
        <div class="p-3 rounded-xl bg-surface-container border border-purple-500/20 flex flex-col">
          <span class="text-[10px] text-amber-400 font-bold uppercase">Files Modified</span>
          <span class="text-lg font-bold text-on-surface">${comp.filesSummary.modifiedCount}</span>
        </div>
        <div class="p-3 rounded-xl bg-surface-container border border-purple-500/20 flex flex-col">
          <span class="text-[10px] text-outline font-bold uppercase">Unchanged</span>
          <span class="text-lg font-bold text-on-surface">${comp.filesSummary.unchangedCount}</span>
        </div>
      </div>

      <!-- Modified / Added Files Breakdown -->
      ${comp.filesAdded.length > 0 ? `
        <div class="flex flex-col gap-1.5">
          <span class="font-bold text-emerald-400 text-xs">Added Files:</span>
          <div class="flex flex-wrap gap-1.5">
            ${comp.filesAdded.map(f => `<span class="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-300 font-mono text-[11px]">${f.path}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      ${comp.filesModified.length > 0 ? `
        <div class="flex flex-col gap-1.5">
          <span class="font-bold text-amber-400 text-xs">Modified Files (Checksum Changed):</span>
          <div class="flex flex-wrap gap-1.5">
            ${comp.filesModified.map(f => `<span class="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 font-mono text-[11px]">${f.path}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      ${comp.filesRemoved.length > 0 ? `
        <div class="flex flex-col gap-1.5">
          <span class="font-bold text-rose-400 text-xs">Removed Files:</span>
          <div class="flex flex-wrap gap-1.5">
            ${comp.filesRemoved.map(f => `<span class="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-300 font-mono text-[11px]">${f.path}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Capabilities Diff -->
      <div class="p-3 rounded-xl bg-surface-container border border-purple-500/20 flex flex-col gap-2">
        <span class="font-bold text-on-surface text-xs uppercase tracking-wider">Capabilities Difference</span>
        ${Object.keys(comp.capabilitiesDiff || {}).length === 0 ? `
          <span class="text-xs text-outline italic">No capability configuration changes between these versions.</span>
        ` : `
          <div class="flex flex-col gap-1">
            ${Object.entries(comp.capabilitiesDiff).map(([k, d]) => `
              <div class="flex items-center justify-between text-xs py-1 border-b border-purple-900/20">
                <span class="font-mono text-primary">${k}</span>
                <span class="text-on-surface-variant font-mono">${String(d.oldVal)} → <strong class="text-emerald-400">${String(d.newVal)}</strong></span>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="p-4 text-center text-rose-400 text-xs">Failed to compare versions: ${err.message}</div>`;
  }
}

