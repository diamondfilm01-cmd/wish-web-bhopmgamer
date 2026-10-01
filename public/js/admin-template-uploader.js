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

// 6. Fetch & Load Templates in Admin Grid
async function loadDynamicTemplates() {
  const container = document.getElementById('dynamic-templates-container');
  if (!container) return;

  try {
    const res = await fetch('/api/templates');
    const data = await res.json();
    if (!data.success || !data.templates) return;

    container.innerHTML = '';
    const templates = data.templates;

    // Update metrics with real dynamic counts
    const countTotal = document.getElementById('count-total');
    const countPublished = document.getElementById('count-published');
    const countDrafts = document.getElementById('count-drafts');
    const countPremium = document.getElementById('count-premium');
    const countFree = document.getElementById('count-free');
    const countFooter = document.getElementById('count-footer-total');

    const vipCount = templates.filter(t => t.tier === 'vip' || (t.price && Number(t.price) > 0)).length;
    const freeCount = templates.length - vipCount;

    if (countTotal) countTotal.textContent = templates.length;
    if (countPublished) countPublished.textContent = templates.length;
    if (countDrafts) countDrafts.textContent = 0;
    if (countPremium) countPremium.textContent = vipCount;
    if (countFree) countFree.textContent = freeCount;
    if (countFooter) countFooter.textContent = templates.length;

    if (templates.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-16 px-4 flex flex-col items-center justify-center text-center bg-surface-container-low rounded-2xl border border-dashed border-purple-500/30">
          <div class="w-16 h-16 rounded-2xl bg-primary-container/20 text-primary flex items-center justify-center mb-4 shadow-lg shadow-purple-600/20">
            <span class="material-symbols-outlined text-[36px]">folder_open</span>
          </div>
          <h3 class="font-headline-sm text-lg sm:text-xl font-bold text-on-surface mb-2">No Templates Uploaded Yet</h3>
          <p class="text-sm text-on-surface-variant max-w-md mb-6 leading-relaxed">
            Sabhi mock / fake templates hata diye gaye hain. Aap upar diye gaye <strong class="text-primary">"Upload Website / Code Folder"</strong> button se apna poora code folder ya ZIP upload kar sakte hain!
          </p>
          <button onclick="toggleModal('upload-code-modal')" class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-bold text-sm shadow-lg shadow-purple-600/30 hover:brightness-110 active:scale-95 transition">
            <span class="material-symbols-outlined text-[18px]">cloud_upload</span>
            <span>Upload Website Code (Folder ya ZIP)</span>
          </button>
        </div>
      `;
      return;
    }

    templates.forEach(tpl => {
      const card = document.createElement('article');
      card.className = "bg-surface-container-low rounded-2xl overflow-hidden flex flex-col justify-between shadow-xl hover:shadow-[0_12px_40px_-8px_rgba(124,58,237,0.35)] transition-all duration-300 group border border-purple-500/20";
      
      const priceText = tpl.tier === 'vip' ? `₹${tpl.price || 49}` : '₹0';
      const tierBadge = tpl.tier === 'vip' ? 'VIP MAGIC PASS' : 'FREE TIER';
      const tierClass = tpl.tier === 'vip' ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white' : 'bg-primary-container text-on-primary-container';
      const fieldsCount = tpl.detectedFields ? tpl.detectedFields.length : 4;

      card.innerHTML = `
        <div class="relative h-36 sm:h-48 md:h-56 w-full overflow-hidden bg-surface-container-lowest">
          <img src="${tpl.thumbnail}" alt="${tpl.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"/>
          <div class="absolute inset-0 bg-gradient-to-t from-surface-container-low via-surface-container-low/40 to-transparent"></div>
          
          <div class="absolute top-3 left-3 flex flex-wrap gap-1.5">
            <span class="px-2 py-0.5 rounded-full font-label-sm text-label-sm uppercase font-bold ${tierClass} shadow-md">${tierBadge}</span>
            <span class="px-2 py-0.5 rounded-full font-label-sm text-label-sm uppercase font-bold bg-emerald-500/20 text-emerald-300">LIVE</span>
          </div>

          <div class="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-lowest/80 backdrop-blur-md text-amber-300 font-label-sm text-label-sm font-bold shadow-lg">
            <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">star</span>
            <span>${tpl.category}</span>
          </div>

          <div class="absolute bottom-3 left-3 right-3 flex items-center justify-between text-on-surface">
            <div class="flex items-center gap-1 font-label-md text-label-md bg-surface-container-lowest/90 backdrop-blur-md px-2.5 py-1 rounded-lg shadow-sm">
              <span class="material-symbols-outlined text-[16px] text-primary">auto_awesome</span>
              <span class="font-bold">${fieldsCount} Custom Slots</span>
            </div>
            <div class="flex items-center gap-1 font-label-md text-label-md bg-surface-container-lowest/90 backdrop-blur-md px-2.5 py-1 rounded-lg text-emerald-400 font-bold">
              ${priceText}
            </div>
          </div>
        </div>

        <div class="p-3 sm:p-space-md flex flex-col gap-2 flex-1">
          <div class="flex items-start justify-between gap-2">
            <div class="flex flex-col">
              <h3 class="font-headline-sm text-headline-sm font-bold text-on-surface">${tpl.name}</h3>
              <span class="font-label-sm text-label-sm text-primary font-mono mt-0.5">${tpl.id}</span>
            </div>
          </div>

          <p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">
            ${tpl.description}
          </p>

          <div class="bg-surface-container-lowest p-2 rounded-xl flex flex-col gap-1.5 mt-auto">
            <div class="flex items-center justify-between px-1">
              <span class="font-label-sm text-label-sm text-outline uppercase tracking-wider">Dynamic Slots</span>
              <span class="font-label-sm text-label-sm text-primary font-bold">Live Synced</span>
            </div>
            <div class="flex flex-wrap gap-1">
              ${(tpl.detectedFields || []).slice(0, 4).map(f => `
                <span class="font-label-sm text-label-sm px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">${f.label}</span>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="p-3 sm:p-space-md pt-0 flex flex-wrap items-center justify-between gap-2">
          <a href="/templates-store/${tpl.folder || tpl.id}/${tpl.entryFile || 'index.html'}" target="_blank" class="flex-1 flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md transition-colors">
            <span class="material-symbols-outlined text-[16px]">visibility</span>
            <span>Preview</span>
          </a>
          <a href="/customize.html?template=${tpl.id}" target="_blank" class="flex-1 flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg bg-primary-container text-white font-label-md text-label-md font-bold shadow-md hover:brightness-110 transition-all">
            <span class="material-symbols-outlined text-[16px]">auto_fix_high</span>
            <span>Customize</span>
          </a>
          <button onclick="deleteCustomTemplate('${tpl.id}', '${escapeQuotes(tpl.name)}')" class="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition" title="Delete Template">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (e) {
    console.error('Error loading dynamic templates:', e);
  }
}

async function deleteCustomTemplate(id, name) {
  if (!confirm(`Are you sure you want to delete template "${name}"? This action cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(`Template "${name}" deleted.`);
      loadDynamicTemplates();
    } else {
      alert('Error deleting template: ' + data.message);
    }
  } catch (err) {
    alert('Network error deleting template: ' + err.message);
  }
}

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

function showToast(msg) {
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
