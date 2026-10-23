// WishMagic Admin Studio - Universal Website & Code Folder Uploader Engine

let currentUploadedFiles = {}; // { [relativePath]: { content, isBase64 } }
let detectedDynamicFields = []; // Confirmed customizer fields
let suggestedDynamicFields = []; // Undeclared HTML/media fields awaiting admin confirmation
let currentParsedManifest = null;
let currentUtpValidationIssues = [];
let currentDetectedVariantsReport = null;
let uploadUtpConfigState = {
  activeScope: "all", // "all" or relationshipSlug
  sections: [],
  actions: [],
  visibilityConfig: {},
  actionsConfig: {},
  variantOverrides: {},
  validationErrors: []
};
let editUtpConfigState = {
  templateId: null,
  activeScope: "all", // "all" or relationshipSlug
  lockVersion: 1,
  manifestSections: [],
  manifestActions: [],
  visibilityConfig: {},
  actionsConfig: {},
  variantOverrides: {},
  variants: [],
  hasDraft: false,
  validationErrors: []
};
let customCoverThumbnail = null;
let customCoverThumbnailIsManual = false;
let firstFoundImageRelPath = "";
let currentPreviewBlobUrl = null;
let currentZipRawFile = null; // Part 20: Real B2 ZIP archive buffer tracker
let currentZipBase64 = null; // Cached base64 of the uploaded ZIP so deploy never hangs on FileReader
let _activeAssetObjectUrls = [];

function revokeActiveAssetObjectUrls() {
  if (!Array.isArray(_activeAssetObjectUrls) || _activeAssetObjectUrls.length === 0) return;
  for (const u of _activeAssetObjectUrls) {
    try {
      if (u && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(u);
      }
    } catch (_) {}
  }
  _activeAssetObjectUrls = [];
}

function createTrackedAssetObjectUrl(bytesOrBlob, mimeType) {
  try {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return null;
    }
    const blob = bytesOrBlob instanceof Blob
      ? bytesOrBlob
      : new Blob([bytesOrBlob], { type: mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    _activeAssetObjectUrls.push(url);
    return { blob, url };
  } catch (_) {
    return null;
  }
}

function isNonRuntimeDevOrTestPath(relPath) {
  const clean = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  return /^(?:tests?|__tests__|spec|cypress|playwright)\//i.test(clean) ||
         /(?:^|\/)test_[a-zA-Z0-9_.-]+\.(?:js|mjs|cjs|ts)$/i.test(clean) ||
         /\.(?:test|spec)\.(?:js|mjs|cjs|ts)$/i.test(clean);
}

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

let customCoverThumbnailName = '';

async function handleCustomCoverThumb(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    customCoverThumbnailName = file.name;
    customCoverThumbnailIsManual = true;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      customCoverThumbnail = dataUrl;
      const thumb = document.getElementById('thumbnail-preview-img');
      if (thumb) thumb.src = dataUrl;

      // Proactively upload cover thumbnail to ImgBB preserving exact filename & format
      try {
        const res = await fetch('/api/imgbb/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileData: dataUrl,
            filename: file.name,
            type: 'image',
            title: file.name.replace(/\.[^/.]+$/, '')
          })
        });
        const json = await res.json().catch(() => ({}));
        const uploadedUrl = json?.data?.displayUrl || json?.displayUrl || json?.data?.url || json?.url;
        if (res.ok && uploadedUrl) {
          customCoverThumbnail = uploadedUrl;
          if (thumb) thumb.src = uploadedUrl;
          if (typeof showToast === 'function') {
            showToast('🖼️ Cover thumbnail uploaded to ImgBB (' + file.name + ')');
          }
        }
      } catch (_) {}
    };
    reader.readAsDataURL(file);
  }
}

// 1. Handle Selection of a Full Directory/Folder or Multiple Dropped Files
function handleMultipleFiles(fileList) {
  return handleFolderSelection(fileList);
}

window.handleDeltaFilesSelection = async function(fileList) {
  if (!fileList || fileList.length === 0) return;
  if (typeof window.setUploadUpdatePackageMode === "function") {
    window.setUploadUpdatePackageMode("delta_changed_only");
  }
  if (fileList.length === 1 && /\.zip$/i.test(fileList[0].name)) {
    return handleZipFile(fileList[0]);
  }
  return handleFolderSelection(fileList);
};

function serializeUploadedFilesToArray(filesMap) {
  if (!filesMap) return [];
  if (Array.isArray(filesMap)) return filesMap;
  return Object.entries(filesMap).map(([relPath, entry]) => {
    if (typeof entry === "string") {
      return {
        path: relPath,
        content: entry,
        isBase64: entry.startsWith("data:") && entry.includes(";base64,")
      };
    }
    return {
      path: relPath,
      content: entry && entry.content !== undefined ? entry.content : "",
      isBase64: Boolean(entry && entry.isBase64)
    };
  });
}

function computeCommonFolderPrefix(pathsList) {
  if (!pathsList || pathsList.length === 0) return "";
  const normalized = pathsList
    .map(p => String(p).replace(/\\/g, "/").replace(/^\/+/, ""))
    .filter(p => p && !p.includes("__MACOSX/") && !p.endsWith(".DS_Store"));
  if (normalized.length === 0) return "";
  if (normalized.some(p => p.toLowerCase() === "index.html" || p.toLowerCase() === "wishmagic.json")) return "";

  const rootMarkers = normalized
    .filter(p => /(?:^|\/)index\.html$/i.test(p) || /(?:^|\/)wishmagic\.json$/i.test(p))
    .sort((a, b) => a.length - b.length);
  if (rootMarkers.length > 0 && rootMarkers[0].includes("/")) {
    const candidatePrefix = rootMarkers[0].slice(0, rootMarkers[0].lastIndexOf("/") + 1);
    if (normalized.every(p => p.startsWith(candidatePrefix))) {
      return candidatePrefix;
    }
  }

  const firstParts = normalized[0].split("/");
  if (firstParts.length > 1) {
    const candidate = firstParts[0] + "/";
    if (normalized.every(p => p.startsWith(candidate))) {
      return candidate;
    }
  }
  return "";
}

async function handleFolderSelection(fileList) {
  if (!fileList || fileList.length === 0) return;
  const fInput = document.getElementById("folder-input");
  currentZipRawFile = null;
  currentZipBase64 = null;
  firstFoundImageRelPath = "";
  if (!customCoverThumbnailIsManual) {
    customCoverThumbnail = null;
    customCoverThumbnailName = "";
  }
  showUploadProgress('Reading & verifying folder files...');
  currentUploadedFiles = {};
  detectedDynamicFields = [];

  let htmlContent = '';
  let foundIndex = false;
  let firstFoundImage = null;
  let firstFoundImageName = '';

  const rawPaths = Array.from(fileList).map(f => (f.webkitRelativePath || f.name).replace(/\\/g, '/'));
  const commonPrefix = computeCommonFolderPrefix(rawPaths);
  const folderHintName = commonPrefix ? commonPrefix.replace(/\/+$/, '') : '';

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    let relPath = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    if (commonPrefix && relPath.startsWith(commonPrefix)) {
      relPath = relPath.slice(commonPrefix.length);
    }
    relPath = relPath.replace(/^\/+/, '');
    if (!relPath) continue;

    if (isMediaFile(relPath)) {
      const dataUrl = await readFileAsDataURL(file);
      currentUploadedFiles[relPath] = { content: dataUrl, isBase64: true, sizeBytes: file.size, originalName: file.name };
      if (!firstFoundImage && isImageFile(relPath)) {
        firstFoundImage = dataUrl;
        firstFoundImageName = file.name;
      }
    } else {
      const text = await readFileAsText(file);
      currentUploadedFiles[relPath] = { content: text, isBase64: false, sizeBytes: file.size, originalName: file.name };

      if (relPath.toLowerCase() === 'index.html') {
        htmlContent = text;
        foundIndex = true;
      }
    }
  }

  finishProcessingFiles(foundIndex, htmlContent, firstFoundImage, folderHintName, firstFoundImageName);
  if (fInput) { try { fInput.value = ""; } catch (_) {} }
}

// 2. Handle Selection of a ZIP file using JSZip
function encodeUint8ArrayToBase64(bytes) {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function handleZipFile(zipFile) {
  if (!zipFile) return;
  currentZipRawFile = zipFile;
  currentZipBase64 = null;
  firstFoundImageRelPath = "";
  if (!customCoverThumbnailIsManual) {
    customCoverThumbnail = null;
    customCoverThumbnailName = "";
  }
  if (typeof JSZip === 'undefined') {
    alert('JSZip library is loading. Please try again in a second.');
    return;
  }

  showUploadProgress('Unzipping archive, checking code & extracting customizer slots...');
  currentUploadedFiles = {};
  detectedDynamicFields = [];

  try {
    revokeActiveAssetObjectUrls();
    await new Promise(resolve => setTimeout(resolve, 15));
    const zipArrayBuffer = await zipFile.arrayBuffer();
    // Only pre-encode raw ZIP to base64 if small (< 1.5 MB); larger ZIPs use compact binary/Blob streaming
    if (zipArrayBuffer.byteLength <= 1500 * 1024) {
      currentZipBase64 = encodeUint8ArrayToBase64(new Uint8Array(zipArrayBuffer));
    } else {
      currentZipBase64 = null;
    }
    const zip = await JSZip.loadAsync(zipArrayBuffer);
    let htmlContent = '';
    let foundIndex = false;
    let firstFoundImage = null;
    let firstFoundImageName = '';

    const entries = Object.keys(zip.files);
    const MAX_ZIP_FILES = 1000;
    if (entries.length > MAX_ZIP_FILES) {
      throw new Error('ZIP archive exceeds maximum file count limit of ' + MAX_ZIP_FILES + ' entries.');
    }

    const DANGEROUS_EXTENSIONS = /\.(exe|sh|bat|cmd|com|vbs|php|py|pl|cgi|jar|war|scr|msi)$/i;
    const fileEntriesOnly = entries.filter(p => !zip.files[p].dir);
    const commonPrefix = computeCommonFolderPrefix(fileEntriesOnly);
    const zipHintName = zipFile.name.replace(/\.zip$/i, '');

    for (const rawPath of entries) {
      const entry = zip.files[rawPath];
      if (entry.dir) continue;

      const normalizedRaw = String(rawPath).replace(/\\/g, '/');
      if (
        normalizedRaw.startsWith('/') ||
        normalizedRaw.includes('../') ||
        normalizedRaw.includes('/..') ||
        normalizedRaw === '..' ||
        normalizedRaw.startsWith('../') ||
        normalizedRaw.includes('__MACOSX/')
      ) {
        continue;
      }

      if (DANGEROUS_EXTENSIONS.test(normalizedRaw)) {
        console.warn('[ZIP Security] Skipping disallowed executable file in ZIP: ' + rawPath);
        continue;
      }

      let relPath = normalizedRaw;
      if (commonPrefix && relPath.startsWith(commonPrefix)) {
        relPath = relPath.slice(commonPrefix.length);
      }
      relPath = relPath.replace(/^\/+/, '');
      if (!relPath || relPath.startsWith('.DS_Store') || isNonRuntimeDevOrTestPath(relPath)) continue;

      const baseFileName = relPath.split('/').pop();

      if (isMediaFile(relPath)) {
        const mime = getMimeType(relPath);
        const bytes = await entry.async('uint8array');
        const tracked = createTrackedAssetObjectUrl(bytes, mime);
        const blobUrl = tracked ? tracked.url : null;
        const blobObj = tracked ? tracked.blob : null;

        if (isAudioOrVideoFile(relPath)) {
          // Never allocate multi-megabyte base64 strings for audio/video on the UI thread!
          currentUploadedFiles[relPath] = {
            content: blobUrl || '',
            blobUrl: blobUrl || '',
            bytes,
            blob: blobObj,
            isBase64: true,
            isBinaryBuffer: true,
            mimeType: mime,
            sizeBytes: bytes.byteLength,
            originalName: baseFileName
          };
        } else {
          const base64 = encodeUint8ArrayToBase64(bytes);
          const dataUrl = 'data:' + mime + ';base64,' + base64;
          currentUploadedFiles[relPath] = {
            content: dataUrl,
            blobUrl: blobUrl || dataUrl,
            bytes,
            blob: blobObj,
            isBase64: true,
            mimeType: mime,
            sizeBytes: bytes.byteLength,
            originalName: baseFileName
          };
          if (!firstFoundImage && isImageFile(relPath)) {
            firstFoundImage = blobUrl || dataUrl;
            firstFoundImageName = baseFileName;
            firstFoundImageRelPath = relPath;
          }
        }
      } else {
        const text = await entry.async('string');
        currentUploadedFiles[relPath] = {
          content: text,
          isBase64: false,
          sizeBytes: text.length,
          originalName: baseFileName
        };

        if (relPath.toLowerCase() === 'index.html' || (!foundIndex && rawPath.toLowerCase().endsWith('/index.html'))) {
          htmlContent = text;
          foundIndex = true;
        }
      }
    }

    finishProcessingFiles(foundIndex, htmlContent, firstFoundImage, zipHintName, firstFoundImageName);
  } catch (err) {
    alert('Failed to read ZIP file: ' + err.message);
    hideUploadProgress();
  } finally {
    const zInput = document.getElementById("zip-input");
    if (zInput) { try { zInput.value = ""; } catch (_) {} }
  }
}

// 3. Scan & Analyze Uploaded Code, Auto-Extract Customizer Slots & Cloud Routing Queue
function finishProcessingFiles(foundIndex, htmlContent, firstFoundImage, packageHintName = '', firstFoundImageName = '') {
  hideUploadProgress();

  const filePaths = Object.keys(currentUploadedFiles);
  const fileCount = filePaths.length;
  if (fileCount === 0) {
    alert('No valid files found in upload.');
    return;
  }

  // Auto-fill Title & Description if empty
  const nameInput = document.getElementById('new-tpl-title');
  const descInput = document.getElementById('new-tpl-desc');
  if (htmlContent) {
    const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
    const extractedTitle = titleMatch ? titleMatch[1].replace(/\|.*$/, '').trim() : '';
    if (nameInput && !nameInput.value.trim()) {
      nameInput.value = extractedTitle || packageHintName.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    const metaDescMatch = htmlContent.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    if (descInput && !descInput.value.trim() && metaDescMatch) {
      descInput.value = metaDescMatch[1].trim();
    }
  } else if (nameInput && !nameInput.value.trim() && packageHintName) {
    nameInput.value = packageHintName.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // Count images (ImgBB), audio/video (B2), and code files (B2)
  const imageFiles = filePaths.filter(p => isImageFile(p));
  const audioVideoFiles = filePaths.filter(p => /\.(mp3|wav|ogg|m4a|aac|mp4|webm|mov|m4v)$/i.test(p));
  const codeFiles = filePaths.filter(p => !isImageFile(p) && !/\.(mp3|wav|ogg|m4a|aac|mp4|webm|mov|m4v)$/i.test(p));

  const fileSummaryElem = document.getElementById('upload-files-summary');
  if (fileSummaryElem) {
    fileSummaryElem.textContent =
      fileCount + ' files checked • ' +
      imageFiles.length + ' Photo(s) → ImgBB • ' +
      audioVideoFiles.length + ' Audio/Video → B2 • ' +
      codeFiles.length + ' Code file(s) → B2';
  }

  // Auto-scan HTML + package files for all customizable fields
  scanDynamicFields(htmlContent);

  // Set default thumbnail from first image if admin hasn't picked one yet
  if (firstFoundImage && !customCoverThumbnail) {
    customCoverThumbnail = firstFoundImage;
    customCoverThumbnailName = firstFoundImageName || 'cover-photo.png';
    const thumbPreview = document.getElementById('thumbnail-preview-img');
    if (thumbPreview) thumbPreview.src = firstFoundImage;
  }

  // Render Cloud Storage Routing & Code Check panel
  renderCloudRoutingInspector(foundIndex, imageFiles, audioVideoFiles, codeFiles);

  // Show Step 2 & 3 in the modal first so layout dimensions are non-zero and UI paints immediately
  const stepConfig = document.getElementById('upload-step-config');
  const placeholderState = document.getElementById('upload-placeholder-state');
  if (stepConfig) stepConfig.classList.remove('hidden');
  if (placeholderState) placeholderState.classList.add('hidden');

  // Invalidate cached staged preview HTML when a new ZIP is loaded
  _stagedPreviewHtmlCache = { key: null, html: null };

  // Part 50: Start Smart Template Recognition & Side-by-Side Comparison Studio first,
  // and stagger the secondary bottom sandbox preview so 3 iframes never compete on the main thread!
  if (typeof runSmartTemplateRecognitionStudio === "function") {
    setTimeout(() => {
      try { runSmartTemplateRecognitionStudio(packageHintName); } catch (_) {}
    }, 15);
    setTimeout(() => {
      try { renderLiveSandboxPreview({ skipSideBySideSync: true }); } catch (_) {}
    }, 650);
  } else {
    renderLiveSandboxPreview();
  }
}

function checkClientFieldBinding(field, htmlContent, cssContent) {
  const fId = String(field.id || field.key || "").trim();
  if (!fId) return false;
  const fType = String(field.type || "text").toLowerCase();
  const bTarget = String((field.binding && field.binding.target) || "").toLowerCase();
  const bSel = String((field.binding && field.binding.selector) || "").trim();

  if (fType === "color" || bTarget === "css-variable" || bTarget === "style-property") {
    if ((cssContent && cssContent.includes("--wm-")) || (htmlContent && htmlContent.includes("--wm-"))) return true;
  }
  if (!htmlContent) return true;
  const esc = fId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp("data-wm(?:-field|-media)?\\s*=\\s*[\"']" + esc + "[\"']", "i").test(htmlContent)) return true;
  if (new RegExp("\\{\\{\\s*" + esc + "\\s*\\}\\}", "i").test(htmlContent)) return true;
  if (new RegExp("\\bid\\s*=\\s*[\"']" + esc + "[\"']", "i").test(htmlContent)) return true;
  if (fType === "image-multiple" && (/data-wm(?:-field)?\s*=\s*["']photo_\d+["']/i.test(htmlContent) || /data-wm-section\s*=\s*["']gallery["']/i.test(htmlContent))) return true;
  if (bSel) {
    const attrM = bSel.match(/\[\s*([a-zA-Z0-9_-]+)\s*=\s*["']?([^"'\]]+)["']?\s*\]/);
    if (attrM && new RegExp(attrM[1] + "\\s*=\\s*[\"']" + attrM[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\"']", "i").test(htmlContent)) {
      return true;
    }
  }
  return false;
}

function scanDynamicFields(html) {
  detectedDynamicFields = [];
  suggestedDynamicFields = [];
  currentParsedManifest = null;
  currentUtpValidationIssues = [];

  const confirmedMap = new Map();
  const suggestedMap = new Map();

  let cssText = "";
  let jsText = "";
  let rawManifestStr = null;

  Object.keys(currentUploadedFiles).forEach(p => {
    const entry = currentUploadedFiles[p];
    if (entry && !entry.isBase64) {
      const lower = p.toLowerCase();
      if (lower.endsWith(".css")) cssText += "\n" + entry.content;
      else if (lower.endsWith(".js") && !lower.endsWith(".json")) jsText += "\n" + entry.content;
      else if (lower === "wishmagic.json" || lower === "manifest.json" || lower.endsWith("/wishmagic.json")) {
        rawManifestStr = entry.content;
      }
    }
  });

  if (rawManifestStr) {
    try {
      currentParsedManifest = JSON.parse(rawManifestStr);
    } catch (jsonErr) {
      currentUtpValidationIssues.push({
        severity: "error",
        code: "INVALID_MANIFEST_JSON",
        message: "wishmagic.json contains invalid JSON: " + jsonErr.message
      });
    }
  }

  const hasExplicitManifestFields = Boolean(
    currentParsedManifest &&
    (Array.isArray(currentParsedManifest.fields) || (currentParsedManifest.template && Array.isArray(currentParsedManifest.template.fields)))
  );

  // Auto-populate template metadata inputs from wishmagic.json if present
  if (currentParsedManifest) {
    const tMeta = currentParsedManifest.template || currentParsedManifest;
    const nameInput = document.getElementById("new-tpl-title");
    const descInput = document.getElementById("new-tpl-desc");
    const catInput = document.getElementById("new-tpl-category");
    const tierInput = document.getElementById("new-tpl-tier");
    const priceInput = document.getElementById("new-tpl-price");
    if (nameInput && (tMeta.name || tMeta.title)) nameInput.value = tMeta.name || tMeta.title;
    if (descInput && tMeta.description) descInput.value = tMeta.description;
    if (catInput && tMeta.category) {
      const matchOpt = Array.from(catInput.options || []).find(o => o.value.toLowerCase() === String(tMeta.category).toLowerCase());
      if (matchOpt) catInput.value = matchOpt.value;
    }
    const manifestTierStr = String(tMeta.tier || "").toLowerCase().trim();
    const isManifestFree = manifestTierStr === "free" || (tMeta.price !== undefined && Number(tMeta.price) <= 0 && manifestTierStr !== "vip" && manifestTierStr !== "premium");
    if (tierInput && (tMeta.tier !== undefined || tMeta.price !== undefined)) {
      tierInput.value = isManifestFree ? "free" : ((manifestTierStr === "vip" || manifestTierStr === "premium" || Number(tMeta.price) > 0) ? "vip" : "free");
    }
    if (priceInput && (tMeta.tier !== undefined || tMeta.price !== undefined)) {
      priceInput.value = isManifestFree ? 0 : (Number(tMeta.price) > 0 ? Number(tMeta.price) : (tierInput && tierInput.value === "vip" ? 49 : 0));
    }
  }

  function addConfirmedSlot(slot) {
    if (!slot || !(slot.key || slot.id)) return;
    const cleanKey = String(slot.key || slot.id).trim();
    if (!cleanKey || confirmedMap.has(cleanKey)) return;
    const isBound = checkClientFieldBinding({ ...slot, id: cleanKey, key: cleanKey }, html, cssText);
    if (hasExplicitManifestFields && !isBound) {
      currentUtpValidationIssues.push({
        severity: "warning",
        code: "MANIFEST_FIELD_UNBOUND",
        field: cleanKey,
        message: "Field \"" + cleanKey + "\" is declared in wishmagic.json but no matching binding ([data-wm-field='" + cleanKey + "']) was found in index.html."
      });
    }
    const isNameOrDobSlot = ["recipient_name", "recipientname", "event_date", "eventdate", "dob", "birth_date", "celebration_date"].includes(cleanKey.toLowerCase());
    const hasDefSlot = slot.defaultValue !== undefined && slot.defaultValue !== null && String(slot.defaultValue).trim() !== "";
    confirmedMap.set(cleanKey, {
      id: cleanKey,
      key: cleanKey,
      label: slot.label || cleanKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      type: slot.type || "text",
      required: isNameOrDobSlot ? true : (hasDefSlot ? false : Boolean(slot.required || slot.isRequired)),
      defaultValue: slot.defaultValue !== undefined && slot.defaultValue !== null ? slot.defaultValue : "",
      originalSrc: slot.originalSrc || (typeof slot.defaultValue === "string" ? slot.defaultValue : ""),
      binding: slot.binding || { target: ["image", "audio", "video"].includes(slot.type) ? "src" : "text", selector: "[data-wm-field='" + cleanKey + "']" },
      options: slot.options || null,
      visibleIf: slot.visibleIf || null,
      boundInHtml: isBound,
      autoDetected: Boolean(slot.autoDetected),
      confirmed: true
    });
  }

  function addCandidateOrSuggestedSlot(slot) {
    if (!slot || !(slot.key || slot.id)) return;
    const cleanKey = String(slot.key || slot.id).trim();
    if (!cleanKey || confirmedMap.has(cleanKey) || suggestedMap.has(cleanKey)) return;
    if (hasExplicitManifestFields) {
      // When wishmagic.json is present, undeclared HTML/media slots go to suggestedDynamicFields for admin confirmation
      suggestedMap.set(cleanKey, {
        id: cleanKey,
        key: cleanKey,
        label: slot.label || cleanKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        type: slot.type || "text",
        required: Boolean(slot.required || slot.isRequired),
        defaultValue: slot.defaultValue || "",
        originalSrc: slot.originalSrc || slot.defaultValue || "",
        binding: slot.binding || { target: ["image", "audio", "video"].includes(slot.type) ? "src" : "text", selector: "[data-wm-field='" + cleanKey + "']" },
        boundInHtml: true,
        autoDetected: true,
        confirmed: false
      });
    } else {
      addConfirmedSlot(slot);
    }
  }

  // 1. First load explicit fields from wishmagic.json if present
  if (hasExplicitManifestFields) {
    const rawFields = Array.isArray(currentParsedManifest.fields)
      ? currentParsedManifest.fields
      : currentParsedManifest.template.fields;
    rawFields.forEach(mf => {
      if (mf && (mf.id || mf.key)) {
        addConfirmedSlot({
          id: mf.id || mf.key,
          key: mf.id || mf.key,
          label: mf.label,
          type: mf.type || "text",
          required: Boolean(mf.required),
          defaultValue: mf.defaultValue !== undefined ? mf.defaultValue : (mf.default || ""),
          binding: mf.binding,
          options: mf.options,
          visibleIf: mf.visibleIf,
          autoDetected: false
        });
      }
    });
  }

  // 2. Scan HTML for data-wm-field, data-wm, {{mustache}}, and media tags
  if (html) {
    const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
    let match;
    let unmarkedImgIdx = 0;
    let unmarkedAudioIdx = 0;
    let unmarkedVideoIdx = 0;

    while ((match = tagRegex.exec(html)) !== null) {
      const tagLower = match[1].toLowerCase();
      const attrs = match[2] || "";
      const wmMatch = attrs.match(/data-wm(?:-field)?=["']([^"']+)["']/i);
      const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
      const srcVal = srcMatch ? srcMatch[1].trim() : "";

      if (wmMatch) {
        const key = wmMatch[1].trim();
        const typeAttr = attrs.match(/data-wm-type=["']([^"']+)["']/i);
        const labelAttr = attrs.match(/data-wm-label=["']([^"']+)["']/i);
        const reqAttr = attrs.match(/data-wm-required=["']([^"']+)["']/i);
        const defAttr = attrs.match(/data-wm-default=["']([^"']+)["']/i);
        const inferredMeta = guessFieldMeta(key, html);
        const resolvedType = typeAttr
          ? typeAttr[1].toLowerCase()
          : (tagLower === "img" ? "image" : (tagLower === "audio" ? "audio" : (tagLower === "video" ? "video" : inferredMeta.type)));

        // If already in confirmedMap (from wishmagic.json), enrich originalSrc if needed
        if (confirmedMap.has(key)) {
          const existing = confirmedMap.get(key);
          if (!existing.originalSrc && srcVal) existing.originalSrc = srcVal;
          if (!existing.defaultValue && (defAttr ? defAttr[1] : srcVal)) {
            existing.defaultValue = defAttr ? defAttr[1] : srcVal;
          }
        } else {
          addCandidateOrSuggestedSlot({
            key,
            label: labelAttr ? labelAttr[1] : inferredMeta.label,
            type: resolvedType,
            required: reqAttr ? reqAttr[1] === "true" : false,
            defaultValue: defAttr ? defAttr[1] : srcVal,
            originalSrc: srcVal
          });
        }
      } else if (!hasExplicitManifestFields && tagLower === "img" && srcVal && !srcVal.startsWith("data:image/svg")) {
        unmarkedImgIdx++;
        const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
        const altMatch = attrs.match(/\balt=["']([^"']+)["']/i);
        const fileStem = srcVal.split("/").pop().split("?")[0].replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_]+/g, "_").toLowerCase();
        let key = (unmarkedImgIdx === 1 && !confirmedMap.has("photo_1") && !suggestedMap.has("photo_1"))
          ? "photo_1"
          : (idMatch ? idMatch[1].replace(/[^a-zA-Z0-9_]+/g, "_").toLowerCase() : (fileStem ? "photo_" + fileStem : "photo_" + unmarkedImgIdx));
        if (confirmedMap.has(key) || suggestedMap.has(key)) key = "photo_" + unmarkedImgIdx;
        addCandidateOrSuggestedSlot({
          key,
          label: (altMatch && altMatch[1].trim()) ? altMatch[1].trim() : ("Template Photo " + unmarkedImgIdx + " (" + srcVal.split("/").pop() + ")"),
          type: "image",
          defaultValue: srcVal,
          originalSrc: srcVal,
          autoDetected: true
        });
      } else if (!hasExplicitManifestFields && tagLower === "audio" && srcVal) {
        unmarkedAudioIdx++;
        const key = (unmarkedAudioIdx === 1 && !confirmedMap.has("background_music") && !suggestedMap.has("background_music")) ? "background_music" : ("audio_track_" + unmarkedAudioIdx);
        addCandidateOrSuggestedSlot({
          key,
          label: "Background Music (" + srcVal.split("/").pop() + ")",
          type: "audio",
          defaultValue: srcVal,
          originalSrc: srcVal,
          autoDetected: true
        });
      } else if (!hasExplicitManifestFields && tagLower === "video" && srcVal) {
        unmarkedVideoIdx++;
        const key = (unmarkedVideoIdx === 1 && !confirmedMap.has("celebration_video") && !suggestedMap.has("celebration_video")) ? "celebration_video" : ("video_clip_" + unmarkedVideoIdx);
        addCandidateOrSuggestedSlot({
          key,
          label: "Celebration Video (" + srcVal.split("/").pop() + ")",
          type: "video",
          defaultValue: srcVal,
          originalSrc: srcVal,
          autoDetected: true
        });
      }
    }

    // Check <audio><source src="..."></audio> and <video><source src="..."></video> when no explicit manifest fields are declared
    if (!hasExplicitManifestFields) {
      const audioBlockRegex = /<audio\b([^>]*)>([\s\S]*?)<\/audio>/gi;
      while ((match = audioBlockRegex.exec(html)) !== null) {
        if (!/data-wm(?:-field)?=/i.test(match[1]) && !/\bsrc=/i.test(match[1])) {
          const sMatch = match[2].match(/<source\b[^>]*\bsrc=["']([^"']+)["']/i);
          if (sMatch && sMatch[1]) {
            unmarkedAudioIdx++;
            const key = (!confirmedMap.has("background_music") && !suggestedMap.has("background_music")) ? "background_music" : ("audio_track_" + unmarkedAudioIdx);
            addCandidateOrSuggestedSlot({
              key,
              label: "Background Music (" + sMatch[1].split("/").pop() + ")",
              type: "audio",
              defaultValue: sMatch[1].trim(),
              originalSrc: sMatch[1].trim(),
              autoDetected: true
            });
          }
        }
      }

      const videoBlockRegex = /<video\b([^>]*)>([\s\S]*?)<\/video>/gi;
      while ((match = videoBlockRegex.exec(html)) !== null) {
        if (!/data-wm(?:-field)?=/i.test(match[1]) && !/\bsrc=/i.test(match[1])) {
          const sMatch = match[2].match(/<source\b[^>]*\bsrc=["']([^"']+)["']/i);
          if (sMatch && sMatch[1]) {
            unmarkedVideoIdx++;
            const key = (!confirmedMap.has("celebration_video") && !suggestedMap.has("celebration_video")) ? "celebration_video" : ("video_clip_" + unmarkedVideoIdx);
            addCandidateOrSuggestedSlot({
              key,
              label: "Celebration Video (" + sMatch[1].split("/").pop() + ")",
              type: "video",
              defaultValue: sMatch[1].trim(),
              originalSrc: sMatch[1].trim(),
              autoDetected: true
            });
          }
        }
      }
    }

    // Scan {{mustache}} tokens
    const curlyRegex = /\{\{\s*([a-zA-Z0-9_\-]+)\s*\}\}/g;
    while ((match = curlyRegex.exec(html)) !== null) {
      const key = match[1].trim();
      if (key && !key.startsWith("#") && !key.startsWith("/")) {
        addCandidateOrSuggestedSlot(guessFieldMeta(key, html));
      }
    }

    // Check referenced local files in index.html against currentUploadedFiles
    const refRegex = /<(?:link|script|img|audio|video|source)\b[^>]*?\b(?:src|href)=["']([^"']+)["'][^>]*>/gi;
    while ((match = refRegex.exec(html)) !== null) {
      const rawRef = match[1].trim();
      if (!rawRef || rawRef.startsWith("http") || rawRef.startsWith("//") || rawRef.startsWith("data:") || rawRef.startsWith("#") || rawRef.startsWith("{{") || rawRef.startsWith("/js/") || rawRef.startsWith("/css/") || rawRef.startsWith("/assets/")) {
        continue;
      }
      if (/^[a-zA-Z]:\\/.test(rawRef) || rawRef.startsWith("file://") || rawRef.includes("../")) {
        currentUtpValidationIssues.push({
          severity: "error",
          code: "UNSAFE_LOCAL_ASSET_PATH",
          message: "Unsafe local or parent-traversal path in HTML: \"" + rawRef + "\". Use relative paths inside the ZIP."
        });
        continue;
      }
      const cleanRef = rawRef.split("?")[0].split("#")[0].replace(/\\/g, "/").replace(/^\.?\/+/, "");
      if (cleanRef && !currentUploadedFiles[cleanRef]) {
        const caseMatch = Object.keys(currentUploadedFiles).some(k => k.toLowerCase() === cleanRef.toLowerCase());
        const isDeltaModeActive = Boolean(importStudioState && importStudioState.updatePackageMode === "delta_changed_only");
        if (!caseMatch && !isDeltaModeActive) {
          currentUtpValidationIssues.push({
            severity: "warning",
            code: "MISSING_REFERENCED_ASSET",
            message: "Referenced file \"" + cleanRef + "\" in index.html was not found in the ZIP archive."
          });
        }
      }
    }
  }

  // 3. Check bundled media files in the ZIP (only suggest unbound static assets when no explicit wishmagic.json fields are declared)
  if (!hasExplicitManifestFields) Object.keys(currentUploadedFiles).forEach((relPath) => {
    const fileName = relPath.split("/").pop();
    const allKnown = [...Array.from(confirmedMap.values()), ...Array.from(suggestedMap.values())];
    const alreadyMapped = allKnown.some(f => {
      const def = String(f.defaultValue || f.originalSrc || "").replace(/^\.?\/+/, "");
      return def === relPath || def.endsWith("/" + fileName) || def === fileName;
    });
    if (!alreadyMapped) {
      if (isImageFile(relPath)) {
        const stem = fileName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_]+/g, "_").toLowerCase();
        const key = (!confirmedMap.has("photo_1") && !suggestedMap.has("photo_1")) ? "photo_1" : ("photo_" + stem);
        addCandidateOrSuggestedSlot({
          key,
          label: "Photo (" + fileName + ")",
          type: "image",
          defaultValue: relPath,
          originalSrc: relPath,
          autoDetected: true
        });
      } else if (/\.(mp3|wav|ogg|m4a|aac)$/i.test(relPath)) {
        const stem = fileName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_]+/g, "_").toLowerCase();
        const key = (!confirmedMap.has("background_music") && !suggestedMap.has("background_music")) ? "background_music" : ("audio_" + stem);
        addCandidateOrSuggestedSlot({
          key,
          label: "Music Track (" + fileName + ")",
          type: "audio",
          defaultValue: relPath,
          originalSrc: relPath,
          autoDetected: true
        });
      } else if (/\.(mp4|webm|mov|m4v)$/i.test(relPath)) {
        const stem = fileName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_]+/g, "_").toLowerCase();
        const key = (!confirmedMap.has("celebration_video") && !suggestedMap.has("celebration_video")) ? "celebration_video" : ("video_" + stem);
        addCandidateOrSuggestedSlot({
          key,
          label: "Video Clip (" + fileName + ")",
          type: "video",
          defaultValue: relPath,
          originalSrc: relPath,
          autoDetected: true
        });
      }
    }
  });

  // 4. Only add fallback core fields when NO explicit wishmagic.json manifest and NO text fields were found
  if (!hasExplicitManifestFields) {
    const hasTextFields = Array.from(confirmedMap.values()).some(f => f.type === "text" || f.type === "textarea");
    if (!hasTextFields) {
      addConfirmedSlot({ key: "recipient_name", label: "Recipient Name", type: "text", required: true, autoDetected: true });
      addConfirmedSlot({ key: "event_date", label: "Date of Birth / Celebration Date", type: "date", required: true, autoDetected: true });
      addConfirmedSlot({ key: "sender_name", label: "Sender Name", type: "text", required: false, defaultValue: "Your Best Friend", autoDetected: true });
      addConfirmedSlot({ key: "custom_message", label: "Heartfelt Message", type: "textarea", required: false, defaultValue: "Wishing you endless joy, magical memories, and every happiness today!", autoDetected: true });
    }
  }

  // 5. Inspect UTP v1.1.0 Variant Family Declarations in wishmagic.json
  const rawVariants = currentParsedManifest
    ? (Array.isArray(currentParsedManifest.variants)
        ? currentParsedManifest.variants
        : (currentParsedManifest.template && Array.isArray(currentParsedManifest.template.variants) ? currentParsedManifest.template.variants : null))
    : null;

  if (Array.isArray(rawVariants) && rawVariants.length > 0) {
    const seenVarIds = new Set();
    const seenRels = new Set();
    const validVars = [];
    const invalidVars = [];
    const missingFiles = [];
    const duplicateRelIssues = [];
    const tMeta = (currentParsedManifest && currentParsedManifest.template) || currentParsedManifest || {};
    const familyName = tMeta.name || tMeta.title || (document.getElementById("new-tpl-title")?.value || "Template Family");

    rawVariants.forEach((rv, idx) => {
      const vErrs = [];
      if (!rv || typeof rv !== "object") {
        vErrs.push("Variant at index " + idx + " is not a valid object");
        invalidVars.push({ id: "variant_" + idx, relationship: "unknown", errors: vErrs });
        return;
      }
      const vId = String(rv.id || rv.variantId || rv.slug || "").trim();
      const vRel = String(rv.relationship || rv.relationshipId || rv.relation || rv.relationshipSlug || "").trim();
      const vLabel = String(rv.label || rv.relationshipLabel || vRel || "").trim();
      const vName = String(rv.name || rv.displayName || (familyName + " — " + (vLabel || "Variant"))).trim();

      if (!vId) {
        vErrs.push("Missing variant id/slug");
        currentUtpValidationIssues.push({ severity: "error", code: "MISSING_VARIANT_ID", message: "Variant at index " + idx + " is missing a stable id or slug." });
      } else if (seenVarIds.has(vId.toLowerCase())) {
        vErrs.push("Duplicate variant ID: " + vId);
        currentUtpValidationIssues.push({ severity: "error", code: "DUPLICATE_VARIANT_ID", message: "Duplicate variant ID '" + vId + "' declared in wishmagic.json." });
      } else {
        seenVarIds.add(vId.toLowerCase());
      }

      const normRel = vRel.toLowerCase().replace(/^rel_/, "").replace(/[\s-]+/g, "_");
      if (!normRel) {
        vErrs.push("Missing relationship declaration");
        currentUtpValidationIssues.push({ severity: "error", code: "MISSING_VARIANT_RELATIONSHIP", message: "Variant '" + (vId || idx) + "' is missing a relationship identifier." });
      } else if (seenRels.has(normRel)) {
        const dupMsg = "Duplicate relationship '" + (vLabel || normRel) + "' in variant '" + (vId || idx) + "'";
        vErrs.push(dupMsg);
        duplicateRelIssues.push(dupMsg);
        currentUtpValidationIssues.push({ severity: "error", code: "DUPLICATE_VARIANT_RELATIONSHIP", message: dupMsg });
      } else {
        seenRels.add(normRel);
      }

      // Check referenced variant assets (entry, thumbnail, assets/images)
      const checkPkgPath = (relP, labelDesc) => {
        if (!relP || typeof relP !== "string") return;
        const clean = relP.trim();
        if (!clean || clean.startsWith("http://") || clean.startsWith("https://") || clean.startsWith("data:") || clean.startsWith("/assets/")) return;
        const normP = clean.replace(/\\/g, "/").replace(/^\.?\/+/, "");
        const isDeltaModeActive = Boolean(importStudioState && importStudioState.updatePackageMode === "delta_changed_only");
        const exists = Boolean(isDeltaModeActive || currentUploadedFiles[normP] || Object.keys(currentUploadedFiles).some(k => k.toLowerCase() === normP.toLowerCase()));
        if (!exists) {
          const msg = "Missing " + labelDesc + " '" + normP + "' for variant '" + (vId || normRel) + "'";
          vErrs.push(msg);
          missingFiles.push(msg);
          currentUtpValidationIssues.push({ severity: "error", code: "VARIANT_ASSET_NOT_FOUND", message: msg });
        }
      };

      if (rv.entry) checkPkgPath(rv.entry, "entry file");
      if (rv.thumbnail) checkPkgPath(rv.thumbnail, "thumbnail");
      const vAssets = rv.assets || rv.images || {};
      if (vAssets && typeof vAssets === "object") {
        Object.entries(vAssets).forEach(([ak, av]) => {
          const pStr = typeof av === "string" ? av : (av && (av.path || av.url || av.src));
          if (pStr) checkPkgPath(pStr, "asset (" + ak + ")");
        });
      }

      if (vErrs.length > 0) {
        invalidVars.push({ id: vId || ("index_" + idx), name: vName, relationship: normRel, label: vLabel || normRel, errors: vErrs });
      } else {
        const isVarEnabled = rv.enabled !== false && String(rv.status || "published").toLowerCase() !== "disabled" && String(rv.status || "published").toLowerCase() !== "archived";
        validVars.push({
          id: vId,
          slug: rv.slug || normRel,
          name: vName,
          relationship: normRel,
          label: vLabel || normRel,
          thumbnail: rv.thumbnail || "",
          entry: rv.entry || "index.html",
          status: rv.status || "published",
          enabled: isVarEnabled
        });
      }
    });

    const hasBlockingErrors = currentUtpValidationIssues.some(i => i.severity === "error");
    currentDetectedVariantsReport = {
      familyName,
      validationStatus: hasBlockingErrors ? "failed" : (currentUtpValidationIssues.length > 0 ? "warnings" : "valid"),
      variantsDetected: true,
      detectedVariantCount: rawVariants.length,
      validVariantsCount: validVars.length,
      invalidVariantsCount: invalidVars.length,
      detectedRelations: validVars.map(v => ({ slug: v.relationship, label: v.label, variantId: v.id, name: v.name, enabled: v.enabled !== false })),
      variants: validVars,
      invalidVariants: invalidVars,
      missingFiles,
      duplicateRelations: duplicateRelIssues,
      warnings: currentUtpValidationIssues.filter(i => i.severity === "warning"),
      errors: currentUtpValidationIssues.filter(i => i.severity === "error"),
      readyForReview: !hasBlockingErrors,
      readyForPublishing: !hasBlockingErrors && invalidVars.length === 0
    };
  } else {
    const tMeta = (currentParsedManifest && currentParsedManifest.template) || currentParsedManifest || {};
    const hasBlockingErrors = currentUtpValidationIssues.some(i => i.severity === "error");
    currentDetectedVariantsReport = {
      familyName: tMeta.name || tMeta.title || (document.getElementById("new-tpl-title")?.value || "Single Template"),
      validationStatus: hasBlockingErrors ? "failed" : (currentUtpValidationIssues.length > 0 ? "warnings" : "valid"),
      variantsDetected: false,
      detectedVariantCount: 0,
      validVariantsCount: 0,
      invalidVariantsCount: 0,
      detectedRelations: [],
      variants: [],
      invalidVariants: [],
      missingFiles: [],
      duplicateRelations: [],
      warnings: currentUtpValidationIssues.filter(i => i.severity === "warning"),
      errors: currentUtpValidationIssues.filter(i => i.severity === "error"),
      readyForReview: !hasBlockingErrors,
      readyForPublishing: !hasBlockingErrors
    };
  }

  detectedDynamicFields = Array.from(confirmedMap.values());
  suggestedDynamicFields = Array.from(suggestedMap.values());
  renderDetectedFieldsBadges();
  discoverUploadUtpV12SectionsAndActions(html);
  renderUploadUtpV12ConfigPanel();
}

function guessFieldMeta(key, html) {
  const lKey = key.toLowerCase();
  let type = "text";
  let label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  if (lKey.includes("date") || lKey.includes("time")) {
    type = "date";
  } else if (lKey.includes("photo") || lKey.includes("img") || lKey.includes("image") || lKey.includes("picture") || lKey.includes("avatar") || lKey.includes("cover")) {
    type = "image";
  } else if (lKey.includes("video") || lKey.includes("clip") || lKey.includes("reel")) {
    type = "video";
  } else if (lKey.includes("voice")) {
    type = "voice";
  } else if (lKey.includes("audio") || lKey.includes("music") || lKey.includes("song") || lKey.includes("bgm")) {
    type = "audio";
  } else if (lKey.includes("color") || lKey.includes("theme_color")) {
    type = "color";
  } else if (lKey.includes("message") || lKey.includes("letter") || lKey.includes("note") || lKey.includes("wishes") || lKey.includes("quote")) {
    type = "textarea";
  }

  return { key, label, type };
}

function renderCloudRoutingInspector(foundIndex, imageFiles, audioVideoFiles, codeFiles) {
  const stepConfig = document.getElementById("upload-step-config");
  if (!stepConfig) return;

  let inspectorEl = document.getElementById("cloud-routing-inspector-box");
  if (!inspectorEl) {
    inspectorEl = document.createElement("div");
    inspectorEl.id = "cloud-routing-inspector-box";
    inspectorEl.className = "p-4 rounded-xl bg-surface-container-low border border-outline-variant/25 space-y-3";
    stepConfig.insertBefore(inspectorEl, stepConfig.firstChild);
  }

  const cssCount = codeFiles.filter(p => p.toLowerCase().endsWith(".css")).length;
  const jsCount = codeFiles.filter(p => p.toLowerCase().endsWith(".js") && !p.toLowerCase().endsWith(".json")).length;
  const hasManifest = codeFiles.some(p => p.toLowerCase().endsWith("wishmagic.json") || p.toLowerCase().endsWith("manifest.json"));
  const boundCount = detectedDynamicFields.filter(f => f.boundInHtml !== false).length;
  const unboundCount = detectedDynamicFields.length - boundCount;

  const imgListHtml = imageFiles.length > 0
    ? imageFiles.map(p => {
        const exactName = p.split("/").pop();
        return "<span class=\"inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-pink-500/15 border border-pink-500/30 text-[11px] font-mono text-pink-200\" title=\"" + p + "\">🖼️ " + exactName + " <b class=\"text-emerald-300\">→ ImgBB</b></span>";
      }).join(" ")
    : "<span class=\"text-[11px] text-outline\">No bundled images in ZIP (cover thumbnail & user photos still upload to ImgBB)</span>";

  const mediaListHtml = audioVideoFiles.length > 0
    ? audioVideoFiles.map(p => {
        const exactName = p.split("/").pop();
        const isVid = /\.(mp4|webm|mov|m4v)$/i.test(exactName);
        return "<span class=\"inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-mono text-emerald-200\" title=\"" + p + "\">" + (isVid ? "🎬 " : "🎵 ") + exactName + " <b class=\"text-cyan-300\">→ B2</b></span>";
      }).join(" ")
    : "<span class=\"text-[11px] text-outline\">No bundled audio/video files in ZIP</span>";

  const issuesHtml = currentUtpValidationIssues.length > 0
    ? "<div class=\"p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 space-y-1\">" +
        "<div class=\"font-bold uppercase tracking-wider text-[10px] text-amber-300\">⚠️ UTP Compatibility Diagnostics (" + currentUtpValidationIssues.length + ")</div>" +
        currentUtpValidationIssues.map(iss => "<div>• <b>[" + iss.code + "]</b> " + iss.message + "</div>").join("") +
      "</div>"
    : "";

  const isInspectorExpanded = Boolean(window._cloudRoutingInspectorExpanded);
  inspectorEl.innerHTML =
    "<div class=\"flex flex-wrap items-center justify-between gap-2\">" +
      "<div class=\"flex items-center gap-2\">" +
        "<span class=\"material-symbols-outlined text-emerald-400 text-[18px]\">verified</span>" +
        "<span class=\"text-xs font-bold text-on-surface uppercase tracking-wider\">Package Check & Cloud Routing Ready</span>" +
      "</div>" +
      "<div class=\"flex flex-wrap items-center gap-1.5 text-[10px] font-bold\">" +
        "<span class=\"px-2 py-0.5 rounded-full " + ((foundIndex || (importStudioState && importStudioState.updatePackageMode === "delta_changed_only")) ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-rose-500/20 text-rose-300 border border-rose-500/30") + "\">" +
          (foundIndex ? "✓ index.html" : ((importStudioState && importStudioState.updatePackageMode === "delta_changed_only") ? "⚡ Delta Patch" : "✕ Missing index.html")) +
        "</span>" +
        "<span class=\"px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-200 border border-pink-500/30\">🖼️ " + imageFiles.length + " ImgBB</span>" +
        "<span class=\"px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/30\">📦 " + (audioVideoFiles.length + codeFiles.length) + " B2</span>" +
        "<span class=\"px-2 py-0.5 rounded-full " + (unboundCount === 0 ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/30" : "bg-amber-500/20 text-amber-200 border border-amber-500/30") + "\">" +
          boundCount + "/" + detectedDynamicFields.length + " Fields" +
        "</span>" +
        "<button type=\"button\" onclick=\"toggleCloudRoutingInspectorDetails()\" class=\"px-2.5 py-0.5 rounded-lg bg-surface-container-highest hover:bg-primary/20 text-on-surface text-[10px] font-bold cursor-pointer\">" +
          (isInspectorExpanded ? "Hide Details ▴" : "View File Details ▾") +
        "</button>" +
      "</div>" +
    "</div>" +
    issuesHtml +
    "<div id=\"cloud-routing-collapsible-body\" class=\"" + (isInspectorExpanded ? "space-y-2.5 pt-1" : "hidden space-y-2.5 pt-1") + "\">" +
      "<div class=\"grid grid-cols-1 md:grid-cols-2 gap-2.5\">" +
        "<div class=\"p-2.5 rounded-lg bg-surface-container-lowest/80 border border-pink-500/20\">" +
          "<div class=\"text-[10px] font-bold uppercase tracking-wider text-pink-300 mb-1.5 flex items-center justify-between\">" +
            "<span>🖼️ Photos → ImgBB (Same Name & Format + Auto-Link)</span>" +
            "<span class=\"px-1.5 py-0.2 rounded bg-pink-500/20 text-pink-200\">" + imageFiles.length + "</span>" +
          "</div>" +
          "<div class=\"flex flex-wrap gap-1 max-h-20 overflow-y-auto\">" + imgListHtml + "</div>" +
        "</div>" +
        "<div class=\"p-2.5 rounded-lg bg-surface-container-lowest/80 border border-emerald-500/20\">" +
          "<div class=\"text-[10px] font-bold uppercase tracking-wider text-emerald-300 mb-1.5 flex items-center justify-between\">" +
            "<span>🎵🎬 Music/Video & Code → Backblaze B2 (Same Name & Format)</span>" +
            "<span class=\"px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-200\">" + (audioVideoFiles.length + codeFiles.length) + "</span>" +
          "</div>" +
          "<div class=\"flex flex-wrap gap-1 max-h-20 overflow-y-auto\">" + mediaListHtml + "</div>" +
        "</div>" +
      "</div>" +
      renderAdminVariantUploadReportHtml(currentDetectedVariantsReport) +
    "</div>" +
    "<div id=\"deployed-cloud-links-summary\" class=\"hidden pt-2 border-t border-outline-variant/20\"></div>";
}

function renderAdminVariantUploadReportHtml(vReport, isServerVerified = false) {
  if (!vReport) return "";
  const isReady = Boolean(vReport.readyForPublishing || (vReport.readyForReview && (vReport.invalidVariantsCount || 0) === 0));
  const statusBadge = isReady
    ? '<span class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">✓ Ready for Review & Publishing</span>'
    : '<span class="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold">✕ Validation Blocked — Action Required</span>';

  const enabledMap = (uploadUtpConfigState && uploadUtpConfigState.enabledVariants) || {};
  const relationsPills = Array.isArray(vReport.detectedRelations) && vReport.detectedRelations.length > 0
    ? vReport.detectedRelations.map(r => {
        const slugKey = String(r.slug || "").toLowerCase().trim();
        const isChecked = enabledMap[slugKey] !== undefined ? Boolean(enabledMap[slugKey]) : (r.enabled !== false);
        return (
          '<label class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold cursor-pointer transition ' +
            (isChecked ? 'bg-purple-500/20 border-purple-400/40 text-purple-200' : 'bg-surface-container border-outline-variant/30 text-outline line-through opacity-75') + '">' +
            '<input type="checkbox" class="rounded text-primary w-3.5 h-3.5 cursor-pointer" ' + (isChecked ? 'checked' : '') +
              ' onchange="handleUtpVariantInclusionToggle(\'upload\', \'' + escapeQuotes(slugKey) + '\', this.checked)"/>' +
            '<span>[' + (r.label || r.slug) + ']</span>' +
            '<span class="text-[9px] font-mono opacity-80">(' + (r.variantId || r.id || r.slug) + ')</span>' +
          '</label>'
        );
      }).join(" ")
    : '<span class="text-[11px] text-outline">No multi-relation variants declared (Standard single/legacy template flow)</span>';

  const invalidVarsHtml = Array.isArray(vReport.invalidVariants) && vReport.invalidVariants.length > 0
    ? '<div class="mt-2 p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-[11px] text-rose-200 space-y-1">' +
        '<div class="font-bold text-[10px] uppercase tracking-wider text-rose-300">✕ Unprocessed / Invalid Variants (' + vReport.invalidVariants.length + ')</div>' +
        vReport.invalidVariants.map(iv =>
          '<div>• <b>' + (iv.id || iv.name || 'Variant') + '</b> (' + (iv.relationship || 'missing relation') + '): ' + (Array.isArray(iv.errors) ? iv.errors.join('; ') : '') + '</div>'
        ).join("") +
      '</div>'
    : "";

  return (
    '<div id="admin-variant-discovery-report" class="p-3 rounded-xl bg-surface-container-lowest/90 border border-purple-500/30 space-y-2">' +
      '<div class="flex flex-wrap items-center justify-between gap-2">' +
        '<div class="flex items-center gap-2">' +
          '<span class="material-symbols-outlined text-purple-400 text-[17px]">family_restroom</span>' +
          '<span class="text-[11px] font-bold uppercase tracking-wider text-purple-200">' +
            (isServerVerified ? 'Server-Verified Variant Family Report' : 'UTP v1.1.0 Variant Discovery Report') +
          '</span>' +
        '</div>' +
        statusBadge +
      '</div>' +
      '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">' +
        '<div class="p-2 rounded-lg bg-surface-container-low border border-outline-variant/20">' +
          '<div class="text-[9px] uppercase text-outline font-bold">Template Family</div>' +
          '<div class="font-bold text-on-surface truncate">' + (vReport.familyName || 'Custom Family') + '</div>' +
        '</div>' +
        '<div class="p-2 rounded-lg bg-surface-container-low border border-outline-variant/20">' +
          '<div class="text-[9px] uppercase text-outline font-bold">Variants Detected</div>' +
          '<div class="font-bold ' + (vReport.variantsDetected ? 'text-emerald-300' : 'text-on-surface-variant') + '">' +
            (vReport.variantsDetected ? ('Yes (' + (vReport.detectedVariantCount || 0) + ' Declared)') : 'No (Legacy Mode)') +
          '</div>' +
        '</div>' +
        '<div class="p-2 rounded-lg bg-surface-container-low border border-outline-variant/20">' +
          '<div class="text-[9px] uppercase text-outline font-bold">Valid Registered</div>' +
          '<div class="font-bold text-emerald-400">' + (vReport.validVariantsCount || 0) + ' Variant(s)</div>' +
        '</div>' +
        '<div class="p-2 rounded-lg bg-surface-container-low border border-outline-variant/20">' +
          '<div class="text-[9px] uppercase text-outline font-bold">Invalid / Blocked</div>' +
          '<div class="font-bold ' + ((vReport.invalidVariantsCount || 0) > 0 ? 'text-rose-400' : 'text-outline') + '">' + (vReport.invalidVariantsCount || 0) + ' Variant(s)</div>' +
        '</div>' +
      '</div>' +
      '<div class="pt-1">' +
        '<div class="text-[10px] font-bold uppercase tracking-wider text-outline mb-1">Detected Relations & Stable Variant IDs:</div>' +
        '<div class="flex flex-wrap gap-1.5">' + relationsPills + '</div>' +
      '</div>' +
      invalidVarsHtml +
    '</div>'
  );
}

window.removeDetectedFieldSlot = function(idx) {
  if (idx >= 0 && idx < detectedDynamicFields.length) {
    const removed = detectedDynamicFields.splice(idx, 1)[0];
    if (removed) {
      suggestedDynamicFields.push({ ...removed, confirmed: false });
    }
    renderDetectedFieldsBadges();
  }
};

window.confirmSuggestedFieldSlot = function(idx) {
  if (idx >= 0 && idx < suggestedDynamicFields.length) {
    const item = suggestedDynamicFields.splice(idx, 1)[0];
    if (item && !detectedDynamicFields.some(f => f.key === item.key)) {
      detectedDynamicFields.push({ ...item, confirmed: true });
    }
    renderDetectedFieldsBadges();
  }
};

window.confirmAllSuggestedFieldSlots = function() {
  while (suggestedDynamicFields.length > 0) {
    const item = suggestedDynamicFields.shift();
    if (item && !detectedDynamicFields.some(f => f.key === item.key)) {
      detectedDynamicFields.push({ ...item, confirmed: true });
    }
  }
  renderDetectedFieldsBadges();
};

window.updateDetectedFieldType = function(idx, newType) {
  if (idx >= 0 && idx < detectedDynamicFields.length) {
    detectedDynamicFields[idx].type = newType;
    renderDetectedFieldsBadges();
  }
};

window.promptAddCustomFieldSlot = function() {
  const rawKey = prompt("Enter field key (e.g. partner_name, hero_photo, background_music):", "custom_field_" + (detectedDynamicFields.length + 1));
  if (!rawKey) return;
  const cleanKey = rawKey.trim().replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  if (!cleanKey) return;
  const meta = guessFieldMeta(cleanKey, "");
  detectedDynamicFields.push({
    id: cleanKey,
    key: cleanKey,
    label: meta.label,
    type: meta.type,
    required: false,
    defaultValue: "",
    boundInHtml: true,
    confirmed: true
  });
  renderDetectedFieldsBadges();
};

function renderDetectedFieldsBadges() {
  const container = document.getElementById("detected-fields-container");
  const countBadge = document.getElementById("detected-fields-count");
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = detectedDynamicFields.length + " Confirmed Slot(s)" + (suggestedDynamicFields.length > 0 ? " • " + suggestedDynamicFields.length + " Suggested" : "");
  }

  container.innerHTML = "";
  detectedDynamicFields.forEach((field, idx) => {
    let icon = "badge";
    let colorClass = "bg-primary-container/20 text-primary border-primary/30";
    let routeHint = "D1 Field";
    if (field.type === "image" || field.type === "image-multiple") {
      icon = "image";
      colorClass = "bg-pink-500/20 text-pink-300 border-pink-500/30";
      routeHint = "ImgBB Link";
    } else if (field.type === "video" || field.type === "video-multiple") {
      icon = "videocam";
      colorClass = "bg-amber-500/20 text-amber-300 border-amber-500/30";
      routeHint = "B2 Video";
    } else if (field.type === "audio" || field.type === "voice") {
      icon = "music_note";
      colorClass = "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
      routeHint = "B2 Audio";
    } else if (field.type === "date" || field.type === "datetime") {
      icon = "calendar_today";
      colorClass = "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
    } else if (field.type === "color") {
      icon = "palette";
      colorClass = "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";
      routeHint = "CSS Var";
    } else if (field.type === "textarea") {
      icon = "notes";
      colorClass = "bg-purple-500/20 text-purple-300 border-purple-500/30";
    }

    const unboundBadge = field.boundInHtml === false
      ? "<span class=\"px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-200 text-[9px] font-bold\" title=\"Declared in wishmagic.json but no matching HTML binding found\">⚠️ Unbound</span>"
      : "";

    const pill = document.createElement("div");
    pill.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-semibold " + colorClass;
    pill.innerHTML =
      "<span class=\"material-symbols-outlined text-[15px]\">" + icon + "</span>" +
      "<span>" + field.label + "</span>" +
      "<span class=\"text-[10px] opacity-75 font-mono\">(" + field.key + ")</span>" +
      "<span class=\"px-1.5 py-0.2 rounded bg-black/30 text-[9px] font-mono uppercase\">" + routeHint + "</span>" +
      unboundBadge +
      "<button type=\"button\" onclick=\"removeDetectedFieldSlot(" + idx + ")\" class=\"ml-1 text-white/60 hover:text-rose-300 text-[11px] font-bold cursor-pointer\" title=\"Move to unconfirmed suggestions\">✕</button>";
    container.appendChild(pill);
  });

  // Add "+ Add Slot" button
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.onclick = window.promptAddCustomFieldSlot;
  addBtn.className = "flex items-center gap-1 px-2.5 py-1 rounded-xl border border-dashed border-outline-variant/50 hover:border-primary text-xs font-bold text-on-surface-variant hover:text-primary transition cursor-pointer";
  addBtn.innerHTML = "<span class=\"material-symbols-outlined text-[14px]\">add</span><span>Add Slot</span>";
  container.appendChild(addBtn);

  // Render Suggested Undeclared HTML/Media Fields box (if any) so admin can explicitly confirm them
  let suggestionsBox = document.getElementById("suggested-fields-confirm-box");
  if (suggestedDynamicFields.length > 0) {
    if (!suggestionsBox) {
      suggestionsBox = document.createElement("div");
      suggestionsBox.id = "suggested-fields-confirm-box";
      suggestionsBox.className = "mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 w-full";
      container.parentNode.appendChild(suggestionsBox);
    }
    suggestionsBox.innerHTML =
      "<div class=\"flex flex-wrap items-center justify-between gap-2\">" +
        "<div class=\"text-[11px] font-bold text-amber-300\">💡 Suggested HTML/Media Slots Found Outside wishmagic.json (" + suggestedDynamicFields.length + ") — Confirm to enable in Customizer:</div>" +
        "<button type=\"button\" onclick=\"confirmAllSuggestedFieldSlots()\" class=\"px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-[10px] font-bold cursor-pointer\">✓ Confirm All Suggestions</button>" +
      "</div>" +
      "<div class=\"flex flex-wrap gap-1.5\">" +
        suggestedDynamicFields.map((sf, sIdx) =>
          "<button type=\"button\" onclick=\"confirmSuggestedFieldSlot(" + sIdx + ")\" class=\"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-lowest border border-amber-500/30 hover:border-emerald-400 text-[11px] text-amber-100 cursor-pointer transition\" title=\"Click to confirm and add to template manifest\">" +
            "<span class=\"text-emerald-400 font-bold\">+ Confirm</span>" +
            "<span>" + sf.label + "</span>" +
            "<span class=\"text-[10px] font-mono opacity-75\">(" + sf.key + " : " + sf.type + ")</span>" +
          "</button>"
        ).join("") +
      "</div>";
  } else if (suggestionsBox) {
    suggestionsBox.remove();
  }
}

// 4. Render In-Memory Live Sandbox Preview in iframe (with CSS, JS, Images, Audio, and Video wired)
let _stagedPreviewHtmlCache = { key: null, html: null };
let _uploadPreviewBlobUrl = null;

function getStagedPreviewCacheKey(relationshipSlug) {
  const fileKeys = Object.keys(currentUploadedFiles || {});
  const visJson = JSON.stringify((uploadUtpConfigState && uploadUtpConfigState.visibilityConfig) || {});
  const actJson = JSON.stringify((uploadUtpConfigState && uploadUtpConfigState.actionsConfig) || {});
  const varJson = JSON.stringify((uploadUtpConfigState && uploadUtpConfigState.variantOverrides) || {});
  const scope = (uploadUtpConfigState && uploadUtpConfigState.activeScope) || "all";
  return [fileKeys.length, fileKeys[0] || "", relationshipSlug || "default", scope, visJson, actJson, varJson].join("|");
}

function buildClientStagedPreviewHtml(relationshipSlug = null) {
  const cacheKey = getStagedPreviewCacheKey(relationshipSlug);
  if (_stagedPreviewHtmlCache.key === cacheKey && _stagedPreviewHtmlCache.html) {
    return _stagedPreviewHtmlCache.html;
  }
  let indexContent = "";
  for (const [pathKey, data] of Object.entries(currentUploadedFiles)) {
    if (pathKey.toLowerCase() === "index.html" || pathKey.toLowerCase().endsWith("/index.html")) {
      indexContent = typeof data === "string" ? data : data.content;
      break;
    }
  }

  if (!indexContent) {
    return "<h1 style=\"color:white;text-align:center;font-family:sans-serif;padding:40px;\">No index.html entry file detected</h1>";
  }

  // Strip external /js/wishmagic-template-protocol.js script tags because we inject the runtime bridge directly
  indexContent = indexContent.replace(
    /<script[^>]+src\s*=\s*["'][^"']*wishmagic-template-protocol\.js[^"']*["'][^>]*>\s*<\/script>/gi,
    ""
  );

  // Build O(1) lookup table for bundled media & code files using lightweight Blob URLs (69 bytes) whenever available
  // so multi-megabyte audio/image base64 strings are NEVER duplicated into a 200+ MB HTML string!
  const mediaLookup = {};
  const cssFiles = [];
  const jsFiles = [];

  for (const [p, d] of Object.entries(currentUploadedFiles)) {
    const cleanP = p.replace(/\\/g, "/").replace(/^\.?\/+/, "");
    if (isNonRuntimeDevOrTestPath(cleanP)) continue;
    const lowerP = cleanP.toLowerCase();
    if (d && d.isBase64) {
      let previewAssetUrl = d.blobUrl || "";
      if (!previewAssetUrl && d.bytes) {
        const tracked = createTrackedAssetObjectUrl(d.bytes, d.mimeType || getMimeType(cleanP));
        if (tracked) {
          d.blobUrl = tracked.url;
          d.blob = tracked.blob;
          previewAssetUrl = tracked.url;
        }
      }
      if (!previewAssetUrl && typeof d.content === "string" && !isAudioOrVideoFile(cleanP)) {
        previewAssetUrl = d.content;
      }
      if (previewAssetUrl) {
        mediaLookup[cleanP] = previewAssetUrl;
        mediaLookup[lowerP] = previewAssetUrl;
      }
    } else {
      const rawContent = typeof d === "string" ? d : (d && d.content);
      if (!rawContent) continue;
      if (lowerP.endsWith(".css")) {
        cssFiles.push([cleanP, String(rawContent)]);
      } else if ((lowerP.endsWith(".js") || lowerP.endsWith(".mjs")) && !lowerP.endsWith(".json")) {
        jsFiles.push([cleanP, String(rawContent)]);
      }
    }
  }

  // 1. Replace asset references in index.html markup FIRST (before inlining <script> tags so JS literals are not expanded!)
  indexContent = indexContent.replace(
    /(["'(\s])(?:\.\.?\/|\/)*(assets\/[a-zA-Z0-9_./-]+)(?=["')?\s#])/gi,
    (fullMatch, prefix, relAsset) => {
      const cleanRel = relAsset.replace(/^\.?\/+/, "");
      const found = mediaLookup[cleanRel] || mediaLookup[cleanRel.toLowerCase()];
      return found ? (prefix + found) : fullMatch;
    }
  );

  // 2. Inline CSS files with single-pass url(...) asset resolution
  for (const [cssPath, rawCss] of cssFiles) {
    const cssWithAssets = rawCss.replace(
      /url\(\s*["']?(?:\.\.?\/|\/)*(assets\/[a-zA-Z0-9_./-]+)["']?\s*\)/gi,
      (m, relAsset) => {
        const found = mediaLookup[relAsset] || mediaLookup[relAsset.toLowerCase()];
        return found ? ('url("' + found + '")') : m;
      }
    );
    const safeCss = cssWithAssets.replace(/<\/style>/gi, "<\\/style>");
    const escP = escapeRegex(cssPath);
    const linkRegex = new RegExp("<link[^>]+href\\s*=\\s*[\"'](?:\\.\\.?\\/|\\/)*" + escP + "[\"'][^>]*>", "gi");
    if (linkRegex.test(indexContent)) {
      indexContent = indexContent.replace(linkRegex, () => '<style data-wm-inlined="' + cssPath + '">\n' + safeCss + '\n</style>');
    } else {
      const cssDataUrl = "data:text/css;base64," + btoa(unescape(encodeURIComponent(cssWithAssets)));
      indexContent = indexContent.replace(new RegExp("href=[\"'](?:\\.\\.?\\/|\\/)*" + escP + "[\"']", "gi"), 'href="' + cssDataUrl + '"');
    }
  }

  // 3. Inline JS files (replacing assets/... only when mapped to compact blob/CDN URLs < 256 chars)
  for (const [jsPath, rawJs] of jsFiles) {
    const jsWithCompactAssets = rawJs.replace(
      /(["'])(?:\.\.?\/|\/)*(assets\/[a-zA-Z0-9_./-]+)\1/gi,
      (m, quote, relAsset) => {
        const cleanRel = relAsset.replace(/^\.?\/+/, "");
        const found = mediaLookup[cleanRel] || mediaLookup[cleanRel.toLowerCase()];
        return (found && found.length < 256) ? (quote + found + quote) : m;
      }
    );
    const safeJs = jsWithCompactAssets.replace(/<\/script>/gi, "<\\/script>");
    const escP = escapeRegex(jsPath);
    const scriptRegex = new RegExp("<script[^>]+src\\s*=\\s*[\"'](?:\\.\\.?\\/|\\/)*" + escP + "[\"'][^>]*>\\s*<\\/script>", "gi");
    if (scriptRegex.test(indexContent)) {
      indexContent = indexContent.replace(scriptRegex, () => '<script data-wm-inlined="' + jsPath + '">\n' + safeJs + '\n</script>');
    } else {
      const jsDataUrl = "data:text/javascript;base64," + btoa(unescape(encodeURIComponent(jsWithCompactAssets)));
      indexContent = indexContent.replace(new RegExp("src=[\"'](?:\\.\\.?\\/|\\/)*" + escP + "[\"']", "gi"), 'src="' + jsDataUrl + '"');
    }
  }

  // Determine active relationship variant & UTP v1.2.0 state
  const manifest = currentParsedManifest || (importStudioState.sessionData && importStudioState.sessionData.manifest) || {};
  const variants = Array.isArray(manifest.variants) ? manifest.variants : [];
  let targetRel = relationshipSlug;
  if (!targetRel || targetRel === "default" || targetRel === "all") {
    if (uploadUtpConfigState && uploadUtpConfigState.activeScope && uploadUtpConfigState.activeScope !== "all") {
      targetRel = uploadUtpConfigState.activeScope;
    }
  }

  let selectedVariant = null;
  if (targetRel && targetRel !== "default" && targetRel !== "all") {
    const normTarget = String(targetRel).toLowerCase().trim().replace(/[^a-z0-9]+/g, "_");
    selectedVariant = variants.find(v => {
      const vRel = String(v.relationship || v.relationshipSlug || v.slug || v.id || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_");
      return vRel === normTarget || String(v.slug || "").toLowerCase().trim() === String(targetRel).toLowerCase().trim();
    }) || null;
  }
  if (!selectedVariant && variants.length > 0) {
    selectedVariant = variants.find(v => v.isDefault) || variants[0];
  }

  const effectiveRelSlug = selectedVariant ? (selectedVariant.relationship || selectedVariant.slug) : null;
  const isSingle = Boolean(effectiveRelSlug);
  const varOvMap = (uploadUtpConfigState && uploadUtpConfigState.variantOverrides) || {};
  const activeVarOv = (effectiveRelSlug && varOvMap[effectiveRelSlug]) || {};
  const varVis = {
    ...((selectedVariant && (selectedVariant.visibilityOverrides || selectedVariant.visibility)) || {}),
    ...(activeVarOv.visibility || {})
  };
  const varActs = { ...(activeVarOv.actions || {}) };
  if (selectedVariant && Array.isArray(selectedVariant.actions)) {
    selectedVariant.actions.forEach(a => {
      if (a && a.id && !varActs[a.id]) varActs[a.id] = { ...a };
    });
  }

  const evalTree = evaluateClientSectionTree(
    (uploadUtpConfigState && uploadUtpConfigState.sections) || manifest.sections || [],
    (uploadUtpConfigState && uploadUtpConfigState.visibilityConfig) || {},
    varVis,
    isSingle,
    true
  );
  const disabledSectionIds = [];
  const visibilityMap = {};
  const walkTree = (nodes) => {
    (nodes || []).forEach(n => {
      visibilityMap[n.id] = Boolean(n.effectiveEnabled);
      if (!n.effectiveEnabled) disabledSectionIds.push(n.id);
      if (Array.isArray(n.subsections)) walkTree(n.subsections);
    });
  };
  walkTree(evalTree);

  const evalActs = evaluateClientActions(
    (uploadUtpConfigState && uploadUtpConfigState.actions) || manifest.actions || [],
    (uploadUtpConfigState && uploadUtpConfigState.actionsConfig) || {},
    varActs,
    isSingle,
    new Set(disabledSectionIds)
  );
  const actionsMap = {};
  evalActs.forEach(a => {
    actionsMap[a.id] = {
      id: a.id,
      label: a.effectiveLabel,
      type: a.effectiveType,
      target: a.effectiveTarget,
      logicalLink: a.effectiveLogicalLink || null,
      resolvedUrl: a.effectiveTarget || "",
      enabled: a.effectiveEnabled,
      effectiveEnabled: a.effectiveEnabled,
      fallbackBehavior: a.fallbackBehavior || "hide"
    };
  });

  // Only include text/non-binary field defaults in bootstrapPayload (since images are already inlined in HTML!)
  const fieldValues = {};
  (manifest.fields || []).forEach(f => {
    const k = f.id || f.key;
    const fType = String(f.type || "text").toLowerCase();
    if (k && f.defaultValue !== undefined && !["image", "audio", "video"].includes(fType)) {
      fieldValues[k] = f.defaultValue;
    }
  });
  const variantMsgs = (selectedVariant && selectedVariant.messages) || {};
  Object.entries(variantMsgs).forEach(([mk, mv]) => {
    fieldValues[mk] = mv;
  });
  const variantAssets = (selectedVariant && selectedVariant.assets) || {};
  Object.entries(variantAssets).forEach(([ak, av]) => {
    if (av) {
      const cleanAv = String(av).replace(/^\.?\/+/, "");
      fieldValues[ak] = mediaLookup[cleanAv] || mediaLookup[cleanAv.toLowerCase()] || av;
    }
  });
  const themeVars = (selectedVariant && selectedVariant.theme) || manifest.theme || {};

  const bootstrapPayload = {
    relationshipSlug: effectiveRelSlug,
    relationship: effectiveRelSlug,
    variantId: selectedVariant ? selectedVariant.id : null,
    theme: themeVars,
    fieldValues,
    messages: variantMsgs,
    visibilityMap,
    visibility: visibilityMap,
    disabledSectionIds,
    actionsMap,
    actions: actionsMap
  };

  const clientBootstrapScript = `<script>
(function() {
  var _wmHydrating = false;
  var wmPayload = ${JSON.stringify(bootstrapPayload)};
  wmPayload.fields = wmPayload.fieldValues;
  try {
    var rootEl = document.documentElement;
    if (wmPayload.relationshipSlug) rootEl.setAttribute('data-wm-relationship', wmPayload.relationshipSlug);
    if (wmPayload.variantId) rootEl.setAttribute('data-wm-variant', wmPayload.variantId);
    var t = wmPayload.theme || {};
    if (t.primary) rootEl.style.setProperty('--wm-primary', t.primary);
    if (t.secondary) rootEl.style.setProperty('--wm-secondary', t.secondary);
    if (t.accent) rootEl.style.setProperty('--wm-accent', t.accent);
    if (t.background) rootEl.style.setProperty('--wm-bg', t.background);
    if (t.text) rootEl.style.setProperty('--wm-text', t.text);
  } catch (_) {}

  function applyHydration(p) {
    if (_wmHydrating || !p) return;
    _wmHydrating = true;
    try {
      var root = document.documentElement;
      if (p.relationshipSlug) {
        root.setAttribute('data-wm-relationship', p.relationshipSlug);
        if (document.body) document.body.setAttribute('data-wm-relationship', p.relationshipSlug);
      }
      if (p.variantId) {
        root.setAttribute('data-wm-variant', p.variantId);
        if (document.body) document.body.setAttribute('data-wm-variant', p.variantId);
      }
      var t = p.theme || {};
      if (t.primary) root.style.setProperty('--wm-primary', t.primary);
      if (t.secondary) root.style.setProperty('--wm-secondary', t.secondary);
      if (t.accent) root.style.setProperty('--wm-accent', t.accent);
      if (t.background) root.style.setProperty('--wm-bg', t.background);
      if (t.text) root.style.setProperty('--wm-text', t.text);

      (p.disabledSectionIds || []).forEach(function(secId) {
        document.querySelectorAll('[data-wm-section="' + secId + '"], [data-wm-subsection="' + secId + '"]').forEach(function(el) { el.remove(); });
        document.querySelectorAll('a[href="#' + secId + '"], [data-wm-nav-target="' + secId + '"]').forEach(function(nav) { nav.remove(); });
      });

      var fields = Object.assign({}, p.fieldValues || {}, p.fields || {}, p.messages || {});
      Object.keys(fields).forEach(function(fKey) {
        var val = fields[fKey];
        if (val === undefined || val === null || val === '') return;
        document.querySelectorAll('[data-wm-field="' + fKey + '"], [data-wm="' + fKey + '"]').forEach(function(el) {
          var tag = el.tagName.toLowerCase();
          if (tag === 'img' || tag === 'audio' || tag === 'video' || tag === 'source') {
            if (typeof val === 'string' && !val.startsWith('assets/')) el.setAttribute('src', val);
          } else {
            el.textContent = String(val);
          }
        });
      });

      var acts = p.actionsMap || p.actions || {};
      Object.keys(acts).forEach(function(actId) {
        var act = acts[actId];
        document.querySelectorAll('[data-wm-action="' + actId + '"]').forEach(function(btn) {
          if (!act || act.effectiveEnabled === false || act.enabled === false) {
            if (!act || act.fallbackBehavior !== 'disable') btn.remove();
            else { btn.setAttribute('disabled', 'disabled'); btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none'; }
            return;
          }
          if (act.label) {
            var labelSpan = btn.querySelector('.cta-label, [data-wm-action-label]');
            if (labelSpan) labelSpan.textContent = String(act.label);
            else btn.textContent = String(act.label);
          }
          btn.setAttribute('data-wm-action-type', act.type || 'section');
          btn.setAttribute('data-wm-action-target', act.target || '');
        });
      });

      if (window.BroCodeTemplate && typeof window.BroCodeTemplate.applyData === 'function') {
        try {
          window.BroCodeTemplate.applyData({
            relationship: p.relationshipSlug,
            variantId: p.variantId,
            theme: p.theme,
            fields: fields,
            visibility: p.visibilityMap || p.visibility,
            actions: acts
          });
        } catch (_) {}
      }
    } finally {
      _wmHydrating = false;
    }
  }

  window.WishMagicTemplate = window.WishMagicTemplate || {
    version: '1.3.0',
    applyData: function(data) {
      if (_wmHydrating) return;
      applyHydration(Object.assign({}, wmPayload, data || {}));
    },
    removeDisabledContentFromDom: function() {
      if (_wmHydrating) return;
      applyHydration(wmPayload);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      applyHydration(wmPayload);
    });
  } else {
    setTimeout(function() { applyHydration(wmPayload); }, 0);
  }
})();
</script>`;

  if (/<head[^>]*>/i.test(indexContent)) {
    indexContent = indexContent.replace(/<head([^>]*)>/i, `<head$1>${clientBootstrapScript}`);
  } else {
    indexContent = clientBootstrapScript + "\n" + indexContent;
  }

  // Populate sample values for legacy {{mustache}} placeholders
  indexContent = indexContent.replace(/\{\{\s*recipient_name\s*\}\}/g, "Priya Sharma");
  indexContent = indexContent.replace(/\{\{\s*event_date\s*\}\}/g, "25 October 2026");
  indexContent = indexContent.replace(/\{\{\s*sender_name\s*\}\}/g, "Ankit Verma");
  indexContent = indexContent.replace(/\{\{\s*custom_message\s*\}\}/g, "May this special day bring you magical memories and endless joy!");

  _stagedPreviewHtmlCache = { key: cacheKey, html: indexContent };
  return indexContent;
}

function mountHtmlIntoPreviewIframe(iframe, html, options = {}) {
  if (!iframe || !html) return;
  const loaderEl = options.loaderId ? document.getElementById(options.loaderId) : null;
  if (loaderEl) loaderEl.style.opacity = "1";

  const handleLoadDone = () => {
    if (loaderEl) {
      loaderEl.style.opacity = "0";
      setTimeout(() => { try { loaderEl.classList.add("hidden"); } catch (_) {} }, 200);
    }
    if (typeof options.onLoaded === "function") {
      try { options.onLoaded(); } catch (_) {}
    }
  };
  iframe.onload = handleLoadDone;

  // Solution 2: Use Blob URL streaming when allowed (offloads HTML parsing from main thread),
  // with automatic srcdoc support for strict opaque sandboxed iframes and test environments
  const canUseBlobStream = Boolean(
    options.allowBlobUrl &&
    typeof Blob !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  );

  if (canUseBlobStream) {
    try {
      if (iframe._wmBlobUrl) {
        try { URL.revokeObjectURL(iframe._wmBlobUrl); } catch (_) {}
      }
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      iframe._wmBlobUrl = blobUrl;
      _uploadPreviewBlobUrl = blobUrl;
      iframe.removeAttribute("srcdoc");
      iframe.src = blobUrl;
      return;
    } catch (_) {}
  }

  iframe.removeAttribute("src");
  iframe.srcdoc = html;
}

function renderLiveSandboxPreview(opts = {}) {
  const activeScope = (uploadUtpConfigState && uploadUtpConfigState.activeScope) || "all";

  // Keep the Smart Import Studio Side-by-Side Right Panel in sync first when UTP v1.2.0 config changes
  const sbsStagedIframe = document.getElementById("sbs-staged-preview-iframe");
  if (!opts.skipSideBySideSync && sbsStagedIframe && Object.keys(currentUploadedFiles).length > 0) {
    const stagedRel = (activeScope && activeScope !== "all")
      ? activeScope
      : (importStudioState.syncControls ? importStudioState.selectedVariant : importStudioState.stagedVariant);
    mountHtmlIntoPreviewIframe(sbsStagedIframe, buildClientStagedPreviewHtml(stagedRel), {
      loaderId: "sbs-staged-loader",
      allowBlobUrl: false
    });
  }

  const iframe = document.getElementById("upload-preview-iframe");
  if (!iframe) return;
  const hasLocalIndex = Object.keys(currentUploadedFiles).some(k => k.toLowerCase() === "index.html" || k.toLowerCase().endsWith("/index.html"));
  if (!hasLocalIndex && importStudioState && importStudioState.sessionData && importStudioState.sessionData.previewUrls && importStudioState.sessionData.previewUrls.staged) {
    iframe.removeAttribute("srcdoc");
    iframe.src = importStudioState.sessionData.previewUrls.staged;
    return;
  }
  const html = buildClientStagedPreviewHtml(activeScope);
  mountHtmlIntoPreviewIframe(iframe, html, { allowBlobUrl: true });
  setTimeout(() => setSandboxViewport(currentSandboxViewportMode), 30);
}

// 5. Deploy Template to Server API (Supports both Staged Draft Preview and Direct Publish)
const MINIMAL_VALID_PNG_BYTES = new Uint8Array([
  0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,
  0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x1F,0x15,0xC4,
  0x89,0x00,0x00,0x00,0x0A,0x49,0x44,0x41,0x54,0x78,0x9C,0x63,0x00,0x01,0x00,0x00,
  0x05,0x00,0x01,0x0D,0x0A,0x2D,0xB4,0x00,0x00,0x00,0x00,0x49,0x45,0x4E,0x44,0xAE,
  0x42,0x60,0x82
]);
const MINIMAL_VALID_JPEG_BYTES = new Uint8Array([
  0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,0x01,0x01,0x00,0x48,
  0x00,0x48,0x00,0x00,0xFF,0xC0,0x00,0x11,0x08,0x00,0x01,0x00,0x01,0x03,0x01,0x11,
  0x00,0x02,0x11,0x01,0x03,0x11,0x01,0xFF,0xDA,0x00,0x0C,0x03,0x01,0x00,0x02,0x11,
  0x03,0x11,0x00,0x3F,0x00,0xBF,0x00,0xFF,0xD9
]);
const MINIMAL_VALID_GIF_BYTES = new Uint8Array([
  0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,0x00,0x00,0x00,
  0xFF,0xFF,0xFF,0x21,0xF9,0x04,0x01,0x00,0x00,0x00,0x00,0x2C,0x00,0x00,0x00,0x00,
  0x01,0x00,0x01,0x00,0x00,0x02,0x02,0x44,0x01,0x00,0x3B
]);
const MINIMAL_VALID_WEBP_BYTES = new Uint8Array([
  0x52,0x49,0x46,0x46,0x1A,0x00,0x00,0x00,0x57,0x45,0x42,0x50,0x56,0x50,0x38,0x4C,
  0x0D,0x00,0x00,0x00,0x2F,0x00,0x00,0x00,0x10,0x07,0x10,0x11,0x11,0x88,0x88,0xFE,
  0x07,0x00
]);

const MINIMAL_VALID_MP3_BYTES = new Uint8Array([
  0x49,0x44,0x33,0x04,0x00,0x00,0x00,0x00,0x00,0x0A,
  0x54,0x49,0x54,0x32,0x00,0x00,0x00,0x02,0x00,0x00,
  0xFF,0xFB,0x90,0x64,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00
]);
const MINIMAL_VALID_WAV_BYTES = new Uint8Array([
  0x52,0x49,0x46,0x46,0x24,0x00,0x00,0x00,0x57,0x41,0x56,0x45,
  0x66,0x6D,0x74,0x20,0x10,0x00,0x00,0x00,0x01,0x00,0x01,0x00,
  0x44,0xAC,0x00,0x00,0x88,0x58,0x01,0x00,0x02,0x00,0x10,0x00,
  0x64,0x61,0x74,0x61,0x00,0x00,0x00,0x00
]);
const MINIMAL_VALID_OGG_BYTES = new Uint8Array([
  0x4F,0x67,0x67,0x53,0x00,0x02,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x01,0x1E,0x01,0x76,0x6F,0x72,0x62,0x69,0x73
]);
const MINIMAL_VALID_MP4_BYTES = new Uint8Array([
  0x00,0x00,0x00,0x18,0x66,0x74,0x79,0x70,0x6D,0x70,0x34,0x32,
  0x00,0x00,0x00,0x00,0x6D,0x70,0x34,0x32,0x69,0x73,0x6F,0x6D
]);

function isAudioOrVideoFile(relPath) {
  return /\.(mp3|wav|ogg|m4a|aac|flac|mp4|webm|mov|m4v)$/i.test(String(relPath || ""));
}

function getMinimalStubBytesForImage(relPath) {
  const lower = String(relPath || "").toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return MINIMAL_VALID_JPEG_BYTES;
  if (lower.endsWith(".gif")) return MINIMAL_VALID_GIF_BYTES;
  if (lower.endsWith(".webp")) return MINIMAL_VALID_WEBP_BYTES;
  return MINIMAL_VALID_PNG_BYTES;
}

function getMinimalStubBytesForMedia(relPath) {
  const lower = String(relPath || "").toLowerCase();
  if (lower.endsWith(".wav")) return MINIMAL_VALID_WAV_BYTES;
  if (lower.endsWith(".ogg")) return MINIMAL_VALID_OGG_BYTES;
  if (lower.endsWith(".mp4") || lower.endsWith(".m4a") || lower.endsWith(".mov") || lower.endsWith(".m4v") || lower.endsWith(".webm")) return MINIMAL_VALID_MP4_BYTES;
  return MINIMAL_VALID_MP3_BYTES;
}

async function preUploadTemplateMediaToB2(filesMap, setStatusFn) {
  const preUploadedB2Map = {};
  if (!filesMap || typeof filesMap !== "object") return preUploadedB2Map;
  const mediaRelPaths = Object.keys(filesMap).filter(p => isAudioOrVideoFile(p));
  if (mediaRelPaths.length === 0) return preUploadedB2Map;

  let completedMedia = 0;
  let skipClientB2 = false;
  let consecutiveFailures = 0;
  const B2_CLIENT_BATCH_SIZE = 2;

  for (let i = 0; i < mediaRelPaths.length && !skipClientB2; i += B2_CLIENT_BATCH_SIZE) {
    let batchSuccessCount = 0;
    const batchPaths = mediaRelPaths.slice(i, i + B2_CLIENT_BATCH_SIZE);
    if (typeof setStatusFn === "function") {
      setStatusFn("Uploading Audio/Video to B2 (" + Math.min(i + 1, mediaRelPaths.length) + "/" + mediaRelPaths.length + ")...");
    }

    await Promise.all(batchPaths.map(async (relPath) => {
      if (skipClientB2) return;
      const fileEntry = filesMap[relPath];
      const dataUrl = typeof fileEntry === "string" ? fileEntry : (fileEntry && fileEntry.content);
      if (!dataUrl) return;
      const exactFileName = relPath.split("/").pop();
      const mimeType = getMimeType(relPath);
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timerId = controller ? setTimeout(() => { try { controller.abort(); } catch (_) {} }, 25000) : null;
      try {
        let fetchOpts;
        if (typeof FormData !== "undefined" && typeof Blob !== "undefined") {
          let blob = (fileEntry && fileEntry.blob instanceof Blob) ? fileEntry.blob : null;
          if (!blob && fileEntry && fileEntry.bytes instanceof Uint8Array) {
            blob = new Blob([fileEntry.bytes], { type: mimeType });
          }
          if (!blob) {
            const cleanB64 = String(dataUrl).includes(";base64,") ? String(dataUrl).split(";base64,")[1] : String(dataUrl);
            const binStr = atob(cleanB64.replace(/\s+/g, ""));
            const bytes = new Uint8Array(binStr.length);
            for (let j = 0; j < binStr.length; j++) bytes[j] = binStr.charCodeAt(j);
            blob = new Blob([bytes], { type: mimeType });
          }
          const fd = new FormData();
          fd.append("file", blob, exactFileName);
          fd.append("relativePath", relPath);
          fd.append("filename", exactFileName);
          fetchOpts = {
            method: "POST",
            credentials: "include",
            body: fd,
            ...(controller ? { signal: controller.signal } : {})
          };
        } else {
          fetchOpts = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              fileData: dataUrl,
              relativePath: relPath,
              filename: exactFileName,
              mimeType
            }),
            ...(controller ? { signal: controller.signal } : {})
          };
        }

        const b2Res = await fetch("/api/templates/preupload-b2", fetchOpts);
        if (timerId) clearTimeout(timerId);
        const b2Json = await b2Res.json().catch(() => ({}));
        if (b2Res.status === 503 && b2Json?.code === "B2_NOT_CONFIGURED") {
          skipClientB2 = true;
          return;
        }
        const resData = b2Json?.data || b2Json || {};
        if (b2Res.ok && resData.storageKey) {
          batchSuccessCount++;
          preUploadedB2Map[relPath] = {
            relativePath: relPath,
            filename: exactFileName,
            storageKey: resData.storageKey,
            fileId: resData.fileId || null,
            sha256: resData.sha256 || null,
            sizeBytes: Number(resData.sizeBytes) || (fileEntry && fileEntry.sizeBytes) || 0,
            mimeType: resData.mimeType || mimeType
          };
        }
      } catch (b2Err) {
        if (timerId) clearTimeout(timerId);
        console.warn("[Client B2 Media Pre-Upload Warning]:", relPath, b2Err && b2Err.message ? b2Err.message : b2Err);
      } finally {
        completedMedia++;
        if (typeof setStatusFn === "function") {
          setStatusFn("Uploading Audio/Video to B2 (" + completedMedia + "/" + mediaRelPaths.length + ")...");
        }
      }
    }));

    if (batchSuccessCount === 0) {
      consecutiveFailures++;
      if (consecutiveFailures >= 1) skipClientB2 = true;
    } else {
      consecutiveFailures = 0;
    }
  }

  return preUploadedB2Map;
}

async function buildCompactTemplateZipBase64(filesMap, preUploadedImgbbMap, preUploadedB2Map = null, options = {}) {
  if (typeof JSZip === "undefined") return null;
  const zip = new JSZip();
  const forInspection = Boolean(options && options.forInspection);
  for (const [relPath, entry] of Object.entries(filesMap)) {
    if (isNonRuntimeDevOrTestPath(relPath)) continue;
    const rawContent = typeof entry === "string" ? entry : (entry && entry.content !== undefined ? entry.content : "");
    const hasBytes = Boolean(entry && entry.bytes instanceof Uint8Array);
    const isB64 = Boolean(entry && entry.isBase64) || hasBytes || (typeof rawContent === "string" && rawContent.startsWith("data:") && rawContent.includes(";base64,"));
    const approxSize = Number((entry && entry.sizeBytes) || (hasBytes ? entry.bytes.byteLength : String(rawContent).length));
    if (isImageFile(relPath) && ((preUploadedImgbbMap && preUploadedImgbbMap[relPath]) || (forInspection && isB64 && approxSize > 32000))) {
      zip.file(relPath, getMinimalStubBytesForImage(relPath));
    } else if (isAudioOrVideoFile(relPath) && ((preUploadedB2Map && preUploadedB2Map[relPath]) || (forInspection && isB64))) {
      zip.file(relPath, getMinimalStubBytesForMedia(relPath));
    } else if (hasBytes) {
      zip.file(relPath, entry.bytes);
    } else if (isB64 && typeof rawContent === "string" && rawContent.includes(";base64,")) {
      const b64Part = rawContent.split(";base64,")[1];
      zip.file(relPath, b64Part, { base64: true });
    } else {
      zip.file(relPath, String(rawContent || ""));
    }
  }
  const zipBytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 5 } });
  if (options && options.returnUint8Array) return zipBytes;
  return encodeUint8ArrayToBase64(zipBytes);
}

async function deployUploadedTemplate(publishImmediately = true) {
  if (
    publishImmediately !== false &&
    importStudioState &&
    importStudioState.sessionId &&
    importStudioState.selectedTargetTemplateId &&
    importStudioState.sessionData &&
    importStudioState.sessionData.state !== "PUBLISHED" &&
    (importStudioState.sessionData.recognitionOutcome === "EXACT_EXISTING_IDENTITY" || importStudioState.intendedTargetTemplateId)
  ) {
    return window.promptImportStudioDecision("update_existing");
  }
  const nameInput = document.getElementById("new-tpl-title");
  const catInput = document.getElementById("new-tpl-category");
  const descInput = document.getElementById("new-tpl-desc");
  const tierInput = document.getElementById("new-tpl-tier");
  const priceInput = document.getElementById("new-tpl-price");
  const orderInput = document.getElementById("new-tpl-placement");
  const featuredInput = document.getElementById("new-tpl-featured");

  const title = nameInput ? nameInput.value.trim() : "";
  if (!title) {
    alert("Please enter a Template Title.");
    if (nameInput) nameInput.focus();
    return;
  }

  if (Object.keys(currentUploadedFiles).length === 0) {
    alert("Please upload a website folder or ZIP file first.");
    return;
  }

  const deployBtn = document.getElementById("btn-deploy-template");
  const stageBtn = document.getElementById("btn-stage-template-draft");
  const prevDeployHtml = deployBtn ? deployBtn.innerHTML : "";
  const prevStageHtml = stageBtn ? stageBtn.innerHTML : "";

  const setLiveButtonStatus = (statusMsg) => {
    if (deployBtn) {
      deployBtn.disabled = true;
      deployBtn.innerHTML =
        "<span class=\"material-symbols-outlined text-[18px] animate-spin\">refresh</span>" +
        "<span>" + statusMsg + "</span>";
    }
    if (stageBtn) {
      stageBtn.disabled = true;
    }
    showUploadProgress(statusMsg);
  };

  setLiveButtonStatus("Preparing template files for cloud upload...");

  try {
    const shouldPublish = publishImmediately !== false;
    const preUploadedImgbbMap = {};

    // Stage 1: Pre-upload template images to /api/imgbb/upload in small batches of 2
    // so each image gets its own fast Worker request and never hits Cloudflare subrequest/CPU limits!
    const imageRelPaths = Object.keys(currentUploadedFiles).filter(p => isImageFile(p) && !p.toLowerCase().endsWith(".svg"));
    if (imageRelPaths.length > 0) {
      let completedPhotos = 0;
      let skipClientImgbb = false;
      const CLIENT_BATCH_SIZE = 2;

      let consecutiveBatchFailures = 0;
      for (let i = 0; i < imageRelPaths.length && !skipClientImgbb; i += CLIENT_BATCH_SIZE) {
        let batchSuccessCount = 0;
        const batchPaths = imageRelPaths.slice(i, i + CLIENT_BATCH_SIZE);
        setLiveButtonStatus("Uploading Photos to ImgBB (" + Math.min(i + 1, imageRelPaths.length) + "/" + imageRelPaths.length + ")...");

        await Promise.all(batchPaths.map(async (relPath) => {
          if (skipClientImgbb) return;
          const fileEntry = currentUploadedFiles[relPath];
          const dataUrl = typeof fileEntry === "string" ? fileEntry : (fileEntry && fileEntry.content);
          if (!dataUrl) return;
          const exactFileName = relPath.split("/").pop();
          const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
          const timerId = controller ? setTimeout(() => { try { controller.abort(); } catch (_) {} }, 15000) : null;
          try {
            const imgRes = await fetch("/api/imgbb/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileData: dataUrl,
                filename: exactFileName,
                type: "image",
                isTemplateAsset: true,
                title: exactFileName.replace(/\.[^/.]+$/, "")
              }),
              ...(controller ? { signal: controller.signal } : {})
            });
            if (timerId) clearTimeout(timerId);
            const imgJson = await imgRes.json().catch(() => ({}));
            if (imgRes.status === 503 && imgJson?.code === "IMGBB_NOT_CONFIGURED") {
              skipClientImgbb = true;
              return;
            }
            const resData = imgJson?.data || imgJson || {};
            const liveUrl = resData.displayUrl || resData.originalUrl || resData.url;
            if (imgRes.ok && liveUrl) {
              batchSuccessCount++;
              preUploadedImgbbMap[relPath] = {
                mediaId: resData.mediaId || null,
                deleteUrl: resData.deleteUrl || null,
                displayUrl: liveUrl,
                originalUrl: resData.originalUrl || liveUrl,
                thumbnailUrl: resData.thumbnailUrl || resData.thumbUrl || liveUrl,
                providerAssetId: resData.providerAssetId || resData.imageId || null,
                mimeType: resData.mimeType || getMimeType(relPath),
                width: resData.width || null,
                height: resData.height || null,
                sizeBytes: (fileEntry && fileEntry.sizeBytes) || resData.sizeBytes || 0,
                filename: exactFileName
              };
            }
          } catch (photoErr) {
            if (timerId) clearTimeout(timerId);
            console.warn("[Client ImgBB Pre-Upload Warning]:", relPath, photoErr && photoErr.message ? photoErr.message : photoErr);
          } finally {
            completedPhotos++;
            setLiveButtonStatus("Uploading Photos to ImgBB (" + completedPhotos + "/" + imageRelPaths.length + ")...");
          }
        }));
        if (batchSuccessCount === 0) {
          consecutiveBatchFailures++;
          if (consecutiveBatchFailures >= 1) {
            skipClientImgbb = true;
          }
        } else {
          consecutiveBatchFailures = 0;
        }
      }
    }

    // Stage 1B: Pre-upload template audio/video files to Backblaze B2 in small batches of 2
    const preUploadedB2Map = await preUploadTemplateMediaToB2(currentUploadedFiles, setLiveButtonStatus);

    // Stage 2: Build compact ZIP archive (replacing already-uploaded ImgBB photos & B2 audio/video with tiny valid stubs so upload payload is ~80KB instead of 16MB)
    setLiveButtonStatus("Packaging & Deploying Code/Media to Backblaze B2 & D1...");
    let resolvedZipBase64 = null;
    if ((Object.keys(preUploadedImgbbMap).length > 0 || Object.keys(preUploadedB2Map).length > 0) && typeof JSZip !== "undefined") {
      try {
        resolvedZipBase64 = await buildCompactTemplateZipBase64(currentUploadedFiles, preUploadedImgbbMap, preUploadedB2Map);
      } catch (compactErr) {
        console.warn("Compact ZIP build fallback:", compactErr);
      }
    }

    if (!resolvedZipBase64) {
      resolvedZipBase64 = currentZipBase64;
    }
    if (!resolvedZipBase64 && currentZipRawFile) {
      try {
        const arrayBuffer = await currentZipRawFile.arrayBuffer();
        resolvedZipBase64 = encodeUint8ArrayToBase64(new Uint8Array(arrayBuffer));
        currentZipBase64 = resolvedZipBase64;
      } catch (zipReadErr) {
        console.warn("Could not read raw ZIP file buffer, falling back to extracted files bundle:", zipReadErr);
      }
    }

    // Resolve cover thumbnail URL (reuse pre-uploaded ImgBB URL if cover was auto-selected from ZIP)
    let thumbnailPayloadValue = customCoverThumbnail || "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80";
    if (!customCoverThumbnailIsManual && firstFoundImageRelPath && preUploadedImgbbMap[firstFoundImageRelPath]) {
      thumbnailPayloadValue = preUploadedImgbbMap[firstFoundImageRelPath].displayUrl;
    } else if (
      resolvedZipBase64 &&
      !customCoverThumbnailIsManual &&
      typeof thumbnailPayloadValue === "string" &&
      thumbnailPayloadValue.startsWith("data:image/") &&
      firstFoundImageRelPath
    ) {
      thumbnailPayloadValue = firstFoundImageRelPath;
    }

    const payload = {
      name: title,
      category: catInput ? catInput.value : (currentParsedManifest?.template?.category || "Birthday"),
      description: descInput ? descInput.value.trim() : (currentParsedManifest?.template?.description || "Custom handcrafted celebration experience."),
      tier: (() => {
        const rt = String(tierInput ? tierInput.value : (currentParsedManifest?.template?.tier || "vip")).toLowerCase().trim();
        const rp = priceInput ? Number(priceInput.value) : Number(currentParsedManifest?.template?.price ?? 49);
        return (rt === "free" || rp <= 0) ? "free" : "vip";
      })(),
      price: (() => {
        const rt = String(tierInput ? tierInput.value : (currentParsedManifest?.template?.tier || "vip")).toLowerCase().trim();
        const rp = priceInput ? Number(priceInput.value) : Number(currentParsedManifest?.template?.price ?? 49);
        return (rt === "free" || rp <= 0) ? 0 : (rp > 0 ? rp : 49);
      })(),
      isPremium: (() => {
        const rt = String(tierInput ? tierInput.value : (currentParsedManifest?.template?.tier || "vip")).toLowerCase().trim();
        const rp = priceInput ? Number(priceInput.value) : Number(currentParsedManifest?.template?.price ?? 49);
        return !(rt === "free" || rp <= 0);
      })(),
      placement: orderInput ? Number(orderInput.value) : 1,
      featured: featuredInput ? featuredInput.checked : true,
      thumbnail: thumbnailPayloadValue,
      thumbnailName: customCoverThumbnailName || "cover-photo.png",
      detectedFields: detectedDynamicFields,
      confirmedFields: detectedDynamicFields,
      preUploadedImgbbMap,
      preUploadedB2Map,
      skipServerImgbbRetry: Boolean(imageRelPaths.length > 0 && Object.keys(preUploadedImgbbMap).length === 0),
      capabilities: currentParsedManifest?.capabilities || {},
      sections: (uploadUtpConfigState.sections && uploadUtpConfigState.sections.length > 0) ? uploadUtpConfigState.sections : (currentParsedManifest?.sections || []),
      actions: (uploadUtpConfigState.actions && uploadUtpConfigState.actions.length > 0) ? uploadUtpConfigState.actions : (currentParsedManifest?.actions || []),
      visibilityConfig: uploadUtpConfigState.visibilityConfig || {},
      actionsConfig: uploadUtpConfigState.actionsConfig || {},
      variantOverrides: uploadUtpConfigState.variantOverrides || {},
      enabledVariants: getSelectedEnabledVariantSlugs(uploadUtpConfigState),
      relationships: getSelectedEnabledVariantSlugs(uploadUtpConfigState),
      publishImmediately: shouldPublish,
      autoPublish: shouldPublish,
      isPublished: shouldPublish
    };

    if (resolvedZipBase64) {
      payload.zipBase64 = resolvedZipBase64;
    } else {
      payload.files = serializeUploadedFilesToArray(currentUploadedFiles);
      payload.filesMap = currentUploadedFiles;
    }

    let res = null;
    let data = null;
    const maxAttempts = 2;
    const bodyJson = JSON.stringify(payload);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const idempotencyKey = "op_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 45000) : null;
      try {
        res = await fetch("/api/templates/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey
          },
          body: bodyJson,
          ...(controller ? { signal: controller.signal } : {})
        });
        if (timeoutId) clearTimeout(timeoutId);
        const rawResText = await res.text().catch(() => "");
        try {
          data = rawResText ? JSON.parse(rawResText) : {};
        } catch (_) {
          data = { message: "Server returned HTTP " + res.status + (rawResText ? (": " + rawResText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180)) : "") };
        }
        if ((res.status === 409 || (res.status >= 502 && res.status <= 504)) && attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 700 * attempt));
          continue;
        }
        break;
      } catch (netErr) {
        if (timeoutId) clearTimeout(timeoutId);
        if (attempt >= maxAttempts) {
          if (netErr && netErr.name === "AbortError") {
            throw new Error("Upload request timed out after 45 seconds. Please check your connection and try again.");
          }
          throw netErr;
        }
        await new Promise(r => setTimeout(r, 700 * attempt));
      }
    }

    const resultObj = data?.data || data || {};
    if (data && data.success) {
      const imgbbImages = resultObj.imgbbImages || data.imgbbImages || [];
      const b2MediaAssets = resultObj.b2MediaAssets || data.b2MediaAssets || [];
      const previewUrl = resultObj.previewUrl || data.previewUrl;
      const tplId = resultObj.templateId || data.templateId || (data.template && data.template.id);

      // Update live preview iframe to the real cloud-deployed preview URL if available
      if (previewUrl) {
        const iframe = document.getElementById("upload-preview-iframe");
        if (iframe) {
          iframe.removeAttribute("srcdoc");
          iframe.src = previewUrl;
        }
      }

      const serverVarReport = resultObj.variantReport || data.variantReport || currentDetectedVariantsReport;
      const reportEl = document.getElementById("admin-variant-discovery-report");
      if (reportEl && serverVarReport) {
        reportEl.outerHTML = renderAdminVariantUploadReportHtml(serverVarReport, true);
      }

      // Show deployed cloud links summary right inside the inspector box
      const linksBox = document.getElementById("deployed-cloud-links-summary");
      if (linksBox) {
        linksBox.classList.remove("hidden");
        linksBox.innerHTML =
          "<div class=\"text-xs font-bold text-emerald-400 mb-1.5\">✅ " +
            (shouldPublish ? "Deployed to Cloud (ImgBB + Backblaze B2 + Cloudflare D1) & Published to Main Website!" : "Staged as Draft in Cloud (ImgBB + Backblaze B2 + D1) — Ready for Preview!") +
          "</div>" +
          "<div class=\"flex flex-wrap gap-2 text-[11px]\">" +
            (previewUrl ? "<a href=\"" + previewUrl + "\" target=\"_blank\" class=\"px-2.5 py-1 rounded-lg bg-primary-container text-white font-bold hover:opacity-90\">🔗 Open Live B2 Runtime Preview</a>" : "") +
            (tplId ? "<a href=\"/customize.html?template=" + encodeURIComponent(tplId) + "\" target=\"_blank\" class=\"px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold hover:opacity-90\">✨ Open Auto-Generated Customizer</a>" : "") +
            imgbbImages.map(img => "<a href=\"" + (img.displayUrl || img.originalUrl) + "\" target=\"_blank\" class=\"px-2 py-1 rounded-lg bg-pink-500/20 border border-pink-500/40 text-pink-200 font-mono\">🖼️ " + (img.filename || img.assetKey) + " (ImgBB)</a>").join("") +
            b2MediaAssets.map(m => "<a href=\"" + m.streamUrl + "\" target=\"_blank\" class=\"px-2 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 font-mono\">🎵 " + m.filename + " (B2)</a>").join("") +
          "</div>";
      }

      const upEl = document.getElementById("upload-code-modal");
      if (upEl && upEl.dataset.inlinePage !== "true" && typeof toggleModal === "function") {
        toggleModal("upload-code-modal");
      }

      showToast(
        "🎉 Template \"" + title + "\" " + (shouldPublish ? "deployed & published" : "staged as draft") + "! (" +
        imgbbImages.length + " ImgBB photo(s), " +
        (resultObj.fileCount || Object.keys(currentUploadedFiles).length) + " B2 files saved in D1)"
      );

      loadDynamicTemplates();
    } else {
      if (!resultObj?.rolledBack?.imgbb && (Object.keys(preUploadedImgbbMap).length > 0 || Object.keys(preUploadedB2Map).length > 0)) {
        setLiveButtonStatus("Rolling back uploaded cloud files after error...");
        try {
          await fetch("/api/templates/upload-rollback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ preUploadedImgbbMap, preUploadedB2Map })
          });
        } catch (_) {}
      }
      if (data && (data.code === "UTP_VALIDATION_FAILED" || data.code === "UTP_CONFIG_VALIDATION_FAILED")) {
        if (Array.isArray(data.errors)) {
          uploadUtpConfigState.validationErrors = data.errors.map(e => e.message || String(e));
          renderUploadUtpV12ConfigPanel();
        }
        if (data.variantReport) {
          const reportEl = document.getElementById("admin-variant-discovery-report");
          if (reportEl) reportEl.outerHTML = renderAdminVariantUploadReportHtml(data.variantReport, true);
        }
        const issueDetails = Array.isArray(data.issues) ? data.issues.map(i => "• [" + i.severity.toUpperCase() + "] " + i.code + ": " + i.message).join("\n") : "";
        alert("⚠️ UNIVERSAL TEMPLATE PROTOCOL (UTP) VALIDATION FAILED:\n\n" + data.message + "\n\n" + issueDetails);
      } else if (data && data.code === "B2_NOT_CONFIGURED") {
        alert("⚠️ Backblaze B2 is not configured in environment secrets.\n\n" + data.message);
      } else {
        alert("Error deploying template: " + (data?.message || data?.error?.message || "Unknown error"));
      }
    }
  } catch (err) {
    try {
      if (
        (typeof preUploadedImgbbMap === "object" && Object.keys(preUploadedImgbbMap).length > 0) ||
        (typeof preUploadedB2Map === "object" && Object.keys(preUploadedB2Map).length > 0)
      ) {
        await fetch("/api/templates/upload-rollback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preUploadedImgbbMap, preUploadedB2Map })
        });
      }
    } catch (_) {}
    alert("Network error deploying template: " + (err && err.message ? err.message : String(err)));
  } finally {
    hideUploadProgress();
    if (deployBtn) {
      deployBtn.disabled = false;
      deployBtn.innerHTML = prevDeployHtml || (
        "<span class=\"material-symbols-outlined text-[20px]\" style=\"font-variation-settings: 'FILL' 1;\">rocket_launch</span>" +
        "<span>Deploy & Publish to Store</span>"
      );
    }
    if (stageBtn) {
      stageBtn.disabled = false;
      if (prevStageHtml) stageBtn.innerHTML = prevStageHtml;
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
    if (typeof renderQuickSetTemplatesList === 'function') renderQuickSetTemplatesList(templates);
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
    populateDeltaTargetTemplateDropdown(templates);
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
    card.className = "wm-card bg-surface-container-low rounded-2xl overflow-hidden flex flex-col justify-between shadow-xl hover:shadow-[0_12px_40px_-8px_rgba(124,58,237,0.25)] transition-all duration-300 group border border-purple-500/20";

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
      <div class="p-3 bg-surface-container/60 border-t border-purple-500/10 flex flex-wrap items-center justify-between gap-1.5">
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
        <button onclick="openUpdateTemplateStudio('${tpl.id}')" class="py-1.5 px-2 rounded-lg bg-pink-500/15 hover:bg-pink-500/25 text-pink-300 font-semibold text-xs transition flex items-center justify-center gap-1 cursor-pointer" title="Upload Updated Template ZIP & Compare Side-by-Side">
          <span class="material-symbols-outlined text-[15px]">upload_file</span>
          <span>Update</span>
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
            <button onclick="openUpdateTemplateStudio('${tpl.id}')" class="p-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-pink-400" title="Update Template with ZIP (Side-by-Side Compare)">
              <span class="material-symbols-outlined text-[15px]">upload_file</span>
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

    const res = await fetch('/api/templates/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: templateId, status: newStatus, isPublished: isPub })
    });
    const resData = await res.json().catch(() => ({}));
    if (!res.ok || resData.success === false) {
      throw new Error(resData.error?.message || resData.message || 'Failed to update publish status');
    }
    try { localStorage.removeItem('wishmagic_templates_v1'); } catch (_) {}

    showToast(isPub ? '🎉 Template published to live marketplace!' : '📁 Template moved to Drafts.');
    await loadDynamicTemplates();
    if (typeof renderQuickSetTemplatesList === 'function') {
      renderQuickSetTemplatesList(allAdminTemplates);
    }
  } catch (err) {
    alert('Error toggling publish state: ' + err.message);
  }
}

// 8b. Toggle Tier / Pricing Action (Part 11 Section 16)
async function toggleTierTemplate(templateId, currentTier, currentPrice) {
  try {
    const isVip = currentTier === 'vip' || currentTier === 'premium' || Number(currentPrice) > 0;
    const newTier = isVip ? 'free' : 'vip';
    const newPrice = isVip ? 0 : (currentPrice && Number(currentPrice) > 0 ? Number(currentPrice) : 49);
    const isPremium = newTier === 'vip';

    const payload = {
      id: templateId,
      tier: newTier,
      price: newPrice,
      isPremium,
      is_premium: isPremium ? 1 : 0
    };

    const res = await fetch('/api/templates/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const resData = await res.json().catch(() => ({}));
    if (!res.ok || resData.success === false) {
      throw new Error(resData.error?.message || resData.message || 'Failed to update template tier');
    }
    try { localStorage.removeItem('wishmagic_templates_v1'); } catch (_) {}

    showToast(isPremium ? '👑 Switched to VIP Pass (₹' + newPrice + ')' : '✨ Switched to Free Tier (₹0)');
    await loadDynamicTemplates();
    if (typeof renderQuickSetTemplatesList === 'function') {
      renderQuickSetTemplatesList(allAdminTemplates);
    }
  } catch (err) {
    alert('Error toggling template tier: ' + err.message);
  }
}

// 9. Safe Template Delete Action (Part 10 Section 12)
async function deleteTemplate(templateId, name) {
  if (!confirm(`Are you sure you want to permanently delete template "${name}"?`)) {
    return;
  }

  try {
    let res = await fetch(`/api/templates/${encodeURIComponent(templateId)}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    let result = await res.json();

    let isReferenced = Boolean(result && (result.referenced || (result.data && result.data.referenced)));
    let isDeleted = Boolean(result && (result.deleted || (result.data && result.data.deleted) || (result.success && !isReferenced)));

    if (isReferenced && !isDeleted) {
      const msg = (result.data && result.data.message) || result.message || 'Active or upcoming future recipient wishes are using this template.';
      const confirmForce = confirm(`⚠️ SAFEGUARD NOTICE:\n\n${msg}\n\nDo you want to FORCE DELETE "${name}" permanently anyway?`);
      if (!confirmForce) return;

      res = await fetch(`/api/templates/${encodeURIComponent(templateId)}?force=true`, {
        method: 'DELETE',
        credentials: 'include'
      });
      result = await res.json();
      isReferenced = false;
      isDeleted = Boolean(result && (result.deleted || (result.data && result.data.deleted) || result.success));
    }

    if (isDeleted) {
      try { localStorage.removeItem('wishmagic_templates_v1'); } catch (_) {}
      const rData = (result && result.data) ? result.data : (result || {});
      const extraCounts = [];
      if (rData.b2DeletedCount) extraCounts.push(`${rData.b2DeletedCount} B2 file(s)`);
      if (rData.versionsDeletedCount) extraCounts.push(`${rData.versionsDeletedCount} version(s)`);
      if (rData.variantsDeletedCount) extraCounts.push(`${rData.variantsDeletedCount} variant(s)`);
      const suffix = extraCounts.length > 0 ? ` (${extraCounts.join(', ')} purged)` : '';
      if (typeof showToast === 'function') showToast(`Template "${name}" deleted permanently${suffix}.`);
      allAdminTemplates = (allAdminTemplates || []).filter(t => t.id !== templateId && t.slug !== templateId);
      await loadDynamicTemplates();
      if (typeof renderQuickSetTemplatesList === 'function') {
        renderQuickSetTemplatesList(allAdminTemplates);
      }
    } else {
      alert('Error deleting template: ' + ((result && (result.error?.message || result.message)) || 'Unknown error'));
    }
  } catch (err) {
    alert('Network error deleting template: ' + err.message);
  }
}
window.deleteTemplate = deleteTemplate;

// 10. Open Edit Template Modal (Part 10 Section 6 & 11)
window.openEditTemplateModal = async function(templateId) {
  const tpl = (allAdminTemplates || []).find(t => t.id === templateId || t.slug === templateId);
  if (!tpl) {
    alert('Template not found');
    return;
  }
  currentEditingTemplateId = tpl.id;

  // Populate Categories Select from Category Repository with guaranteed fallback options
  const catSelect = document.getElementById('edit-tpl-category');
  if (catSelect) {
    let cats = [];
    if (window.categoryRepository && typeof window.categoryRepository.getAll === 'function') {
      try { cats = await window.categoryRepository.getAll(); } catch (_) {}
    }
    const defaultCats = [
      { name: 'Birthday', icon: '🎂' },
      { name: 'Romantic', icon: '💖' },
      { name: 'Love', icon: '💘' },
      { name: 'Anniversary', icon: '💍' },
      { name: 'Friendship', icon: '🤝' },
      { name: 'Thank You', icon: '🌸' },
      { name: 'Congratulations', icon: '🎉' },
      { name: 'Festivals', icon: '🪔' },
      { name: 'Celebration', icon: '✨' }
    ];
    const mergedCats = [...cats];
    defaultCats.forEach(dc => {
      if (!mergedCats.some(c => String(c.name || '').toLowerCase() === dc.name.toLowerCase())) {
        mergedCats.push(dc);
      }
    });
    const currentCat = String(tpl.category || 'Birthday').trim();
    if (currentCat && !mergedCats.some(c => String(c.name || '').toLowerCase() === currentCat.toLowerCase())) {
      mergedCats.unshift({ name: currentCat, icon: '✦' });
    }
    catSelect.innerHTML = mergedCats.map(c => `
      <option value="${c.name}" ${String(c.name).toLowerCase() === currentCat.toLowerCase() ? 'selected' : ''}>
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

  const isTplVip = tpl.tier === 'vip' || tpl.tier === 'premium' || tpl.isPremium === true || Number(tpl.price) > 0;
  if (elId) elId.value = tpl.id;
  if (elName) elName.value = tpl.name || '';
  if (elSlug) elSlug.value = tpl.slug || '';
  if (elRels) elRels.value = Array.isArray(tpl.relationships) ? tpl.relationships.join(', ') : '';
  if (elTags) elTags.value = Array.isArray(tpl.tags) ? tpl.tags.join(', ') : '';
  if (elDesc) elDesc.value = tpl.description || '';
  if (elTier) {
    elTier.value = isTplVip ? 'vip' : 'free';
    elTier.onchange = function() {
      if (elPrice) {
        if (this.value === 'free') {
          elPrice.value = '0';
        } else if (Number(elPrice.value) <= 0) {
          elPrice.value = '59';
        }
      }
    };
  }
  if (elPrice) {
    elPrice.value = isTplVip ? (Number(tpl.price) > 0 ? Number(tpl.price) : 49) : 0;
    elPrice.oninput = function() {
      const pVal = Number(this.value);
      if (elTier) {
        if (!isNaN(pVal) && pVal <= 0) {
          elTier.value = 'free';
        } else if (pVal > 0) {
          elTier.value = 'vip';
        }
      }
    };
  }
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

  await loadEditTemplateUtpV12Config(templateId, tpl);
  const modal = document.getElementById('edit-template-modal');
  if (modal) modal.classList.remove('hidden');
};

window.handleEditTemplateCoverUpload = async function(input) {
  if (!input || !input.files || !input.files[0]) return;
  const file = input.files[0];
  const btnLabel = document.getElementById('edit-tpl-thumb-upload-btn-label');
  const previewImg = document.getElementById('edit-tpl-thumb-preview');
  const urlInput = document.getElementById('edit-tpl-thumb');

  if (btnLabel) btnLabel.textContent = 'Uploading...';

  const reader = new FileReader();
  reader.onload = async (ev) => {
    const dataUrl = ev.target.result;
    if (previewImg) previewImg.src = dataUrl;
    if (urlInput) urlInput.value = dataUrl;

    try {
      const res = await fetch('/api/imgbb/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fileData: dataUrl,
          filename: file.name,
          type: 'image',
          title: file.name.replace(/\.[^/.]+$/, '')
        })
      });
      const json = await res.json().catch(() => ({}));
      let uploadedUrl = json?.data?.displayUrl || json?.displayUrl || json?.data?.url || json?.url;

      if (!uploadedUrl) {
        const fallbackRes = await fetch('/api/admin/media/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: file.name,
            title: file.name,
            type: 'image',
            mimeType: file.type || 'image/jpeg',
            fileData: dataUrl
          })
        });
        const fallbackJson = await fallbackRes.json().catch(() => ({}));
        uploadedUrl = fallbackJson?.data?.asset?.url || fallbackJson?.asset?.url || fallbackJson?.url;
      }

      if (uploadedUrl) {
        if (previewImg) previewImg.src = uploadedUrl;
        if (urlInput) urlInput.value = uploadedUrl;
        if (typeof showToast === 'function') {
          showToast('🖼️ New cover image uploaded! Click "Save & Publish Changes" to apply.');
        }
      } else if (typeof showToast === 'function') {
        showToast('🖼️ Cover image ready! Click "Save & Publish Changes" to apply.');
      }
    } catch (err) {
      console.warn('[Cover Upload Notice]:', err);
    } finally {
      if (btnLabel) btnLabel.textContent = 'Upload New Cover';
      try { input.value = ''; } catch (_) {}
    }
  };
  reader.readAsDataURL(file);
};

window.closeEditTemplateModal = function() {
  const modal = document.getElementById('edit-template-modal');
  if (modal) modal.classList.add('hidden');
  currentEditingTemplateId = null;
};

window.saveTemplateEdits = async function(publishChanges = true) {
  if (!currentEditingTemplateId) return;

  const btn = document.getElementById('btn-save-tpl-edits');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">refresh</span> Saving...';
  }

  try {
    const existingTplObj = (allAdminTemplates || []).find(t => t.id === currentEditingTemplateId || t.slug === currentEditingTemplateId) || {};
    const name = document.getElementById('edit-tpl-name').value.trim() || existingTplObj.name || 'Celebration Template';
    const slug = document.getElementById('edit-tpl-slug').value.trim() || existingTplObj.slug || currentEditingTemplateId;
    const category = document.getElementById('edit-tpl-category').value || existingTplObj.category || 'Birthday';
    const relsRaw = document.getElementById('edit-tpl-relationships').value;
    const tagsRaw = document.getElementById('edit-tpl-tags').value;
    const description = document.getElementById('edit-tpl-desc').value.trim();
    const rawTierInput = String(document.getElementById('edit-tpl-tier').value || 'free').toLowerCase().trim();
    const rawPriceInputStr = String(document.getElementById('edit-tpl-price').value ?? '').trim();
    const rawPriceNum = Number(rawPriceInputStr);
    // If admin selected Free Tier OR explicitly set price to 0, make it Free (tier='free', price=0, isPremium=false)
    const tier = (rawTierInput === 'free' || (rawPriceInputStr !== '' && !isNaN(rawPriceNum) && rawPriceNum <= 0)) ? 'free' : 'vip';
    const price = tier === 'free' ? 0 : ((!isNaN(rawPriceNum) && rawPriceNum > 0) ? rawPriceNum : 49);
    const status = document.getElementById('edit-tpl-status').value || 'published';
    const featured = document.getElementById('edit-tpl-featured').checked;
    const placement = Number(document.getElementById('edit-tpl-placement').value) || 1;
    const thumbnail = document.getElementById('edit-tpl-thumb').value.trim() || existingTplObj.thumbnail || '/assets/file_ab2082.png';

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
      price,
      isPremium: tier === 'vip',
      is_premium: tier === 'vip' ? 1 : 0,
      status,
      isPublished: status === 'published',
      featured,
      placement,
      thumbnail,
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

    // First save/publish UTP v1.2.0 Section Visibility & Button Action Configuration to /api/templates/:id/config
    const cfgEndpoint = publishChanges
      ? `/api/templates/${encodeURIComponent(currentEditingTemplateId)}/config/publish`
      : `/api/templates/${encodeURIComponent(currentEditingTemplateId)}/config`;
    const authoritativeEnabledSlugs = getSelectedEnabledVariantSlugs(editUtpConfigState, relationships);
    if (authoritativeEnabledSlugs.length > 0 || (editUtpConfigState.variants && editUtpConfigState.variants.length > 0)) {
      updatePayload.relationships = authoritativeEnabledSlugs;
      updatePayload.enabledVariants = authoritativeEnabledSlugs;
    }
    const buildCfgBody = (lockVer) => ({
      publish: Boolean(publishChanges),
      mode: publishChanges ? 'publish' : 'draft',
      ...(lockVer !== undefined && lockVer !== null ? { lockVersion: lockVer } : {}),
      sections: editUtpConfigState.manifestSections,
      actionsList: editUtpConfigState.manifestActions,
      visibilityConfig: editUtpConfigState.visibilityConfig,
      actionsConfig: editUtpConfigState.actionsConfig,
      variantOverrides: editUtpConfigState.variantOverrides,
      enabledVariants: authoritativeEnabledSlugs,
      relationships: authoritativeEnabledSlugs
    });

    let cfgRes = await fetch(cfgEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(buildCfgBody(editUtpConfigState.lockVersion))
    });
    let cfgData = await cfgRes.json().catch(() => ({}));
    if (cfgRes.status === 409) {
      // Auto-resolve stale lockVersion on single-admin edit modal save
      const latestLock = cfgData.details?.currentLockVersion || cfgData.error?.details?.currentLockVersion || undefined;
      cfgRes = await fetch(cfgEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(buildCfgBody(latestLock))
      });
      cfgData = await cfgRes.json().catch(() => ({}));
    }
    if (!cfgRes.ok || cfgData.success === false) {
      const errList = Array.isArray(cfgData.errors)
        ? cfgData.errors.map(e => e.message || String(e))
        : [cfgData.error?.message || cfgData.message || 'Configuration validation failed'];
      editUtpConfigState.validationErrors = errList;
      renderEditUtpV12ConfigPanel();
      throw new Error(errList.join('\n'));
    }
    if (cfgData.data?.lockVersion || cfgData.lockVersion) {
      editUtpConfigState.lockVersion = cfgData.data?.lockVersion || cfgData.lockVersion;
    }

    updatePayload.sections = editUtpConfigState.manifestSections;
    updatePayload.actions = editUtpConfigState.manifestActions;
    updatePayload.visibilityConfig = editUtpConfigState.visibilityConfig;
    updatePayload.actionsConfig = editUtpConfigState.actionsConfig;
    updatePayload.variantOverrides = editUtpConfigState.variantOverrides;
    if (!publishChanges) {
      updatePayload.status = 'draft';
      updatePayload.isPublished = false;
    }

    const res = await fetch('/api/templates/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updatePayload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error?.message || data.message || 'Update failed');
    }

    try { localStorage.removeItem('wishmagic_templates_v1'); } catch (_) {}

    if (publishChanges) {
      closeEditTemplateModal();
      showToast(`🎉 Template "${name}" updated (${tier === 'free' ? 'Free Tier • ₹0' : 'VIP Pass • ₹' + price})!`);
    } else {
      editUtpConfigState.hasDraft = true;
      editUtpConfigState.validationErrors = [];
      renderEditUtpV12ConfigPanel();
      showToast(`💾 Draft configuration saved for "${name}"!`);
    }
    await loadDynamicTemplates();
    if (typeof renderQuickSetTemplatesList === 'function') {
      renderQuickSetTemplatesList(allAdminTemplates);
    }
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

  try {
    showToast('Loading template family & variants...');
    const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}/family`);
    let data = await res.json().catch(() => ({}));
    if (!data || !data.success) {
      // Fallback: if template exists in allAdminTemplates, construct family data so modal still works cleanly
      const localTpl = (allAdminTemplates || []).find(t => t.id === templateId || t.slug === templateId);
      if (localTpl) {
        data = {
          success: true,
          template: localTpl,
          activeVersion: { id: localTpl.currentVersionId || `tv_${localTpl.id}_v1` },
          relationships: [],
          variants: Array.isArray(localTpl.variants) ? localTpl.variants : (Array.isArray(localTpl.availableVariants) ? localTpl.availableVariants : []),
          allMusic: [],
          usage: { publishedWishesCount: 0 }
        };
      } else {
        if (modal) modal.classList.add('hidden');
        alert('Failed to load variants: ' + ((data && (data.error?.message || data.message)) || 'Template not found'));
        return;
      }
    }

    currentFamilyData = data;
    // Reconcile any custom or UTP v1.1.0 variants into data.relationships so admin can inspect & manage every declared variant
    const relsList = Array.isArray(data.relationships) ? data.relationships : [];
    const varsList = Array.isArray(data.variants) ? data.variants : [];
    varsList.forEach(v => {
      const rId = v.relationship_id || v.relationshipId;
      const rSlug = v.relationship_slug || v.relationshipSlug || v.variant_slug;
      const existingRel = relsList.find(r => r.id === rId || (rSlug && r.slug === rSlug));
      if (existingRel) {
        if (v.enabled !== 0 && v.status !== 'archived' && v.status !== 'disabled') {
          existingRel.isSupported = true;
        }
      } else if (rId || rSlug) {
        relsList.push({
          id: rId || `rel_${rSlug}`,
          slug: rSlug || rId,
          name: v.relationship_label || v.relationship_name || v.name || rSlug,
          displayName: v.name || v.relationship_label || rSlug,
          icon: v.relationship_icon || '✨',
          category: 'celebration',
          isSupported: v.enabled !== 0 && v.status !== 'archived' && v.status !== 'disabled',
          sortOrder: v.sort_order || 99
        });
      }
    });
    data.relationships = relsList;

    document.getElementById('var-modal-title').textContent = `${data.template.name} — Relationship Variants (${varsList.length} Registered)`;
    document.getElementById('var-modal-ver-badge').textContent = `${data.activeVersion?.id || 'V1'} • ${data.usage?.publishedWishesCount || 0} Active Wishes`;

    // Filter data.relationships so ONLY relationships actually created for this template are shown in the sidebar
    const createdVarIds = new Set((data.variants || []).map(v => String(v.relationship_id || v.relationshipId || '').toLowerCase()).filter(Boolean));
    const createdVarSlugs = new Set((data.variants || []).map(v => String(v.relationship_slug || v.relationshipSlug || v.variant_slug || v.slug || '').toLowerCase()).filter(Boolean));
    data.relationships = (data.relationships || []).filter(r =>
      r.isSupported ||
      createdVarIds.has(String(r.id || '').toLowerCase()) ||
      createdVarSlugs.has(String(r.slug || '').toLowerCase())
    );
    renderVariantsRelationshipsList(data.relationships, data.variants);
    populateAddRelationshipDropdown(data.availableRelationshipCatalog || data.relationships);
    populateMusicDropdown(data.allMusic || []);

    // Select first supported relationship before showing modal so static placeholder is never visible
    const firstSupported = data.relationships.find(r => r.isSupported) || data.relationships[0];
    if (firstSupported) {
      await selectRelationshipVariant(firstSupported.id);
    }
    if (modal) modal.classList.remove('hidden');
  } catch (err) {
    if (modal) modal.classList.add('hidden');
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

  if (!relationships || relationships.length === 0) {
    listContainer.innerHTML = `
      <div class="p-4 rounded-xl bg-surface-container border border-purple-500/20 text-xs text-outline">
        No relationship variants created for this template yet. Use the dropdown below to create a variant if needed.
      </div>
    `;
    return;
  }

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
    const res = await fetch(`/api/templates/${encodeURIComponent(currentVariantsTemplateId)}/variants/${encodeURIComponent(relId)}`);
    const data = await res.json().catch(() => ({}));
    const localVar = (currentFamilyData?.variants || []).find(
      v => v.relationship_id === relId || v.relationshipId === relId || v.relationship_slug === rel.slug || v.relationshipSlug === rel.slug
    );
    const variant = (data && data.variant) || localVar || { status: 'draft', lock_version: 1, configuration: {} };
    currentVariantConfig = variant.configuration || {
      displayName: variant.name || `${rel.displayName || rel.name} Edition`,
      messages: variant.messages || {},
      theme: variant.theme || {}
    };
    currentLockVersion = variant.lock_version || 1;

    document.getElementById('var-active-status-badge').textContent = (variant.status === 'published' ? 'Published' : 'Draft');
    document.getElementById('var-active-status-badge').className = `px-2 py-0.5 rounded-full font-bold text-[10px] ${variant.status === 'published' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`;
    document.getElementById('var-active-lock-version').textContent = `Lock V${currentLockVersion}`;

    // Fill form fields (supports both UTP v1.1.0 keys and legacy keys)
    const msgs = currentVariantConfig.messages || {};
    const theme = currentVariantConfig.theme || {};
    const effects = currentVariantConfig.effects || {};
    const anim = currentVariantConfig.animations || {};
    const music = currentVariantConfig.music || {};

    document.getElementById('var-field-displayName').value = currentVariantConfig.displayName || variant.name || `${rel.displayName || rel.name} Edition`;
    document.getElementById('var-field-atmosphere').value = currentVariantConfig.atmosphere || currentVariantConfig.description || '';
    document.getElementById('var-field-hero_title').value = msgs.hero_title || `Happy Celebration, ${rel.name}! ✨`;
    document.getElementById('var-field-subtitle').value = msgs.hero_subtitle || msgs.subtitle || '';
    document.getElementById('var-field-main_message').value = msgs.custom_message || msgs.main_message || '';
    document.getElementById('var-field-gallery_heading').value = msgs.gallery_heading || '';
    document.getElementById('var-field-surprise_text').value = msgs.secret_note || msgs.surprise_text || '';

    // Style
    const accentColor = theme.primary || theme.accentColor || '#ec4899';
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
  const heroTitleVal = document.getElementById('var-field-hero_title').value.trim();
  const subtitleVal = document.getElementById('var-field-subtitle').value.trim();
  const mainMessageVal = document.getElementById('var-field-main_message').value.trim();
  const galleryHeadingVal = document.getElementById('var-field-gallery_heading').value.trim();
  const surpriseTextVal = document.getElementById('var-field-surprise_text').value.trim();
  const prevMsgs = (currentVariantConfig && currentVariantConfig.messages) || {};
  const prevTheme = (currentVariantConfig && currentVariantConfig.theme) || {};
  return {
    ...(currentVariantConfig || {}),
    displayName: document.getElementById('var-field-displayName').value.trim(),
    atmosphere: document.getElementById('var-field-atmosphere').value.trim(),
    messages: {
      ...prevMsgs,
      hero_title: heroTitleVal,
      subtitle: subtitleVal,
      hero_subtitle: subtitleVal,
      main_message: mainMessageVal,
      custom_message: mainMessageVal,
      gallery_heading: galleryHeadingVal,
      surprise_text: surpriseTextVal,
      secret_note: surpriseTextVal
    },
    theme: {
      ...prevTheme,
      primary: color,
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

    const tpl = (allAdminTemplates || window.allTemplatesCache || []).find(t => t.id === templateId || t.slug === templateId) || { id: templateId, name: templateId };
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
      <tr class="hover:bg-surface-container transition border-b border-purple-900/20 whitespace-nowrap">
        <td class="py-3 px-4 whitespace-nowrap">
          <div class="flex items-center gap-2">
            <span class="font-mono font-bold text-on-surface text-sm">${v.version_label || `v${v.version_number}.0.0`}</span>
            <span class="text-[10px] text-outline font-mono">(${v.id})</span>
          </div>
        </td>
        <td class="py-3 px-3 whitespace-nowrap">${statusPill}</td>
        <td class="py-3 px-3 text-on-surface-variant font-mono text-[11px] whitespace-nowrap">
          <div>${v.file_count || 5} files • ${sizeKb > 0 ? sizeKb + ' KB' : '—'}</div>
          <div class="text-[9px] text-purple-300 truncate max-w-[130px]" title="Package Checksum: ${v.package_fingerprint || v.runtime_hash || v.source_zip_hash || 'N/A'}">SHA: ${(v.package_fingerprint || v.runtime_hash || v.source_zip_hash || 'verified').slice(0, 12)}</div>
        </td>
        <td class="py-3 px-3 text-xs whitespace-nowrap">${integrityBadge}</td>
        <td class="py-3 px-3 text-on-surface-variant max-w-[220px] truncate" title="${escapeQuotes(v.release_notes || 'No release notes')}">
          <div>${v.release_notes || '<span class="text-outline italic">No release notes</span>'}</div>
          ${v.changeSummary && v.changeSummary.filesSummary ? `<div class="text-[10px] font-mono text-cyan-300">+${v.changeSummary.filesSummary.addedCount || 0} ~${v.changeSummary.filesSummary.modifiedCount || 0} -${v.changeSummary.filesSummary.removedCount || 0} files</div>` : ''}
        </td>
        <td class="py-3 px-3 text-on-surface-variant font-mono text-[11px] whitespace-nowrap">
          <div>${dateFormatted}</div>
          <div class="text-[9px] text-outline">by ${v.published_by || v.created_by || 'admin'}</div>
        </td>
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



// Render Live Storefront Quick-Set Templates List on Add Template Studio page
function renderQuickSetTemplatesList(templates) {
  const listEl = document.getElementById('quick-set-templates-list');
  if (!listEl) return;
  if (!Array.isArray(templates) || templates.length === 0) {
    listEl.innerHTML = '<div class="py-8 text-center text-xs text-on-surface-variant">No templates registered yet. Upload your first template on the left!</div>';
    return;
  }
  listEl.innerHTML = templates.slice(0, 12).map(tpl => {
    const isPub = tpl.status === 'published' || (tpl.isPublished !== false && tpl.status !== 'draft');
    const isVip = tpl.tier === 'vip' || tpl.isPremium === true || Number(tpl.price) > 0;
    const thumb = tpl.thumbnail || '/assets/admin-tpl-thumb-1.png';
    return `
      <div class="p-3 rounded-2xl bg-surface-container-low border border-purple-200/70 dark:border-purple-500/25 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <img src="${thumb}" alt="${tpl.name}" class="w-14 h-10 rounded-xl object-cover border border-purple-200/60 shrink-0" onerror="this.src='/assets/file_ab2082.png'"/>
          <div class="min-w-0">
            <div class="font-bold text-xs sm:text-sm text-on-surface truncate">${tpl.name}</div>
            <div class="flex items-center gap-1.5 text-[11px] text-on-surface-variant mt-0.5">
              <span>${tpl.category || 'General'}</span>
              <span>•</span>
              <span class="font-bold ${isVip ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}">${isVip ? '₹' + (tpl.price || 49) + ' VIP' : 'Free'}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button type="button" onclick="togglePublishTemplate('${tpl.id}', '${tpl.status || (tpl.isPublished ? 'published' : 'draft')}')" class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${isPub ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'}">
            ${isPub ? '● Live on Site' : 'Set Live'}
          </button>
          <a href="/template/${encodeURIComponent(tpl.id)}" target="_blank" class="wm-table-action-btn" title="Preview Template">
            <span class="material-symbols-outlined text-[16px]">visibility</span>
          </a>
          <button type="button" onclick="deleteTemplate('${tpl.id}', '${escapeQuotes(tpl.name)}')" class="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 transition cursor-pointer" title="Delete Template">
            <span class="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

let currentSandboxViewportMode = 'desktop';

function setSandboxViewport(mode) {
  currentSandboxViewportMode = mode === 'mobile' ? 'mobile' : 'desktop';
  const iframe = document.getElementById('upload-preview-iframe');
  const wrap = document.getElementById('sandbox-iframe-wrapper') || (iframe ? iframe.parentElement : null);
  const btnDesktop = document.getElementById('btn-vp-desktop');
  const btnMobile = document.getElementById('btn-vp-mobile');
  if (!wrap || !iframe) return;

  // Measure available width from parent container
  const parentEl = wrap.parentElement || wrap;
  const availWidth = Math.max(260, (parentEl.clientWidth || window.innerWidth || 360) - 4);

  // Ensure badge indicator exists inside wrapper
  let badgeEl = document.getElementById('sandbox-viewport-mode-badge');
  if (!badgeEl) {
    badgeEl = document.createElement('div');
    badgeEl.id = 'sandbox-viewport-mode-badge';
    badgeEl.style.cssText = 'position:absolute;top:8px;right:10px;z-index:20;padding:3px 9px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:0.03em;pointer-events:none;background:rgba(18,9,36,0.82);color:#f9a8d4;border:1px solid rgba(236,72,153,0.4);backdrop-filter:blur(6px);';
    wrap.appendChild(badgeEl);
  }

  if (currentSandboxViewportMode === 'mobile') {
    const mobileW = 375;
    const mobileH = 667;
    const targetFrameW = Math.min(availWidth, mobileW + 16);
    const innerAvailW = Math.max(240, targetFrameW - 16);
    const scale = Math.min(1, innerAvailW / mobileW);
    const scaledH = Math.round(mobileH * scale);

    wrap.style.width = targetFrameW + 'px';
    wrap.style.maxWidth = targetFrameW + 'px';
    wrap.style.height = (scaledH + 28) + 'px';
    wrap.style.margin = '0 auto';
    wrap.style.borderRadius = '28px';
    wrap.style.border = '6px solid #2e1a47';
    wrap.style.boxShadow = '0 14px 35px rgba(0,0,0,0.45)';
    wrap.style.paddingTop = '16px';
    wrap.style.background = '#0c0618';

    iframe.style.width = mobileW + 'px';
    iframe.style.height = mobileH + 'px';
    iframe.style.transform = scale < 1 ? (`scale(${scale.toFixed(4)})`) : 'none';
    iframe.style.transformOrigin = 'top left';
    iframe.style.display = 'block';

    badgeEl.textContent = '📱 Mobile View (375×667)';

    if (btnMobile) btnMobile.className = 'px-3 py-1 rounded-full bg-primary text-white text-xs font-bold cursor-pointer shadow-sm';
    if (btnDesktop) btnDesktop.className = 'px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant text-xs font-semibold cursor-pointer';
  } else {
    // True Desktop Widescreen Viewport (1280x800) scaled down cleanly to fit any container or mobile screen
    const desktopW = 1280;
    const desktopH = 800;
    wrap.style.width = '100%';
    wrap.style.maxWidth = '100%';
    wrap.style.margin = '0';
    wrap.style.borderRadius = '16px';
    wrap.style.border = '1px solid rgba(168,85,247,0.4)';
    wrap.style.boxShadow = 'inset 0 2px 10px rgba(0,0,0,0.35)';
    wrap.style.paddingTop = '0px';
    wrap.style.background = '#120924';

    const actualWrapW = Math.max(260, wrap.clientWidth || availWidth);
    const scale = Math.min(1, actualWrapW / desktopW);
    const scaledH = Math.max(220, Math.round(desktopH * scale));

    wrap.style.height = scaledH + 'px';
    iframe.style.width = desktopW + 'px';
    iframe.style.height = desktopH + 'px';
    iframe.style.transform = scale < 1 ? (`scale(${scale.toFixed(4)})`) : 'none';
    iframe.style.transformOrigin = 'top left';
    iframe.style.display = 'block';

    badgeEl.textContent = '🖥️ Desktop View (1280×800)';

    if (btnDesktop) btnDesktop.className = 'px-3 py-1 rounded-full bg-primary text-white text-xs font-bold cursor-pointer shadow-sm';
    if (btnMobile) btnMobile.className = 'px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant text-xs font-semibold cursor-pointer';
  }
}
window.setSandboxViewport = setSandboxViewport;
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('resize', () => {
    try { setSandboxViewport(currentSandboxViewportMode); } catch (_) {}
  });
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => { try { setSandboxViewport(currentSandboxViewportMode); } catch (_) {} }, 80);
    });
  }
}


// ============================================================================
// PART 49: UTP v1.2.0 Admin Section/Subsection Visibility & Button/Action Studio
// ============================================================================

function normalizeClientSectionNode(s, idx = 0, depth = 1, parentId = null) {
  if (typeof s === "string") {
    const id = s.trim();
    return {
      id,
      label: id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      defaultEnabled: true,
      toggleable: true,
      required: false,
      order: idx + 1,
      depth,
      parentId,
      subsections: []
    };
  }
  if (!s || typeof s !== "object") return null;
  const id = String(s.id || s.key || "").trim();
  const req = Boolean(s.required);
  const subs = Array.isArray(s.subsections)
    ? s.subsections.map((sub, subIdx) => normalizeClientSectionNode(sub, subIdx, depth + 1, id)).filter(Boolean)
    : [];
  return {
    id,
    label: String(s.label || s.name || id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())).trim(),
    defaultEnabled: req ? true : (s.defaultEnabled !== false && s.enabled !== false && s.isEnabled !== false),
    toggleable: req ? false : (s.toggleable !== false),
    required: req,
    order: s.order || (idx + 1),
    depth,
    parentId,
    emptyParentPolicy: s.emptyParentPolicy || "collapse",
    fields: Array.isArray(s.fields) ? s.fields : [],
    actions: Array.isArray(s.actions) ? s.actions : [],
    subsections: subs
  };
}

function normalizeClientActionNode(a, idx = 0) {
  if (!a || typeof a !== "object") return null;
  const id = String(a.id || a.key || a.actionId || "").trim();
  if (!id) return null;
  const type = String(a.type || a.actionType || "section").toLowerCase().trim();
  const label = String(a.label !== undefined ? a.label : (a.defaultLabel !== undefined ? a.defaultLabel : id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()))).trim();
  const logicalLink = String(a.logicalLink || a.logical_link || "").trim();
  const target = String(a.target !== undefined ? a.target : (a.destination !== undefined ? a.destination : (a.url !== undefined ? a.url : (a.defaultTarget || logicalLink || "")))).trim();
  return {
    id,
    label,
    defaultLabel: String(a.defaultLabel !== undefined ? a.defaultLabel : label).trim(),
    type,
    defaultType: a.defaultType || type,
    target,
    defaultTarget: String(a.defaultTarget !== undefined ? a.defaultTarget : target).trim(),
    logicalLink,
    defaultLogicalLink: logicalLink,
    sectionId: a.sectionId || a.section || null,
    editableLabel: a.editableLabel !== false,
    configurable: a.configurable !== false,
    relationshipSpecific: a.relationshipSpecific !== false,
    required: Boolean(a.required),
    defaultEnabled: a.defaultEnabled !== false && a.enabled !== false,
    openInNewTab: a.openInNewTab !== undefined ? Boolean(a.openInNewTab) : (type === "external_url"),
    fallbackBehavior: a.fallbackBehavior || "hide",
    order: a.order || (idx + 1)
  };
}

function discoverUploadUtpV12SectionsAndActions(html) {
  const manifest = currentParsedManifest || {};
  const rawSections = Array.isArray(manifest.sections)
    ? manifest.sections
    : (manifest.template && Array.isArray(manifest.template.sections) ? manifest.template.sections : []);
  const rawActions = Array.isArray(manifest.actions)
    ? manifest.actions
    : (manifest.template && Array.isArray(manifest.template.actions) ? manifest.template.actions : []);

  const normSections = rawSections.map((s, idx) => normalizeClientSectionNode(s, idx, 1, null)).filter(Boolean);
  const seenSecIds = new Set();
  const walkMarkSeen = (list) => {
    list.forEach(s => {
      seenSecIds.add(s.id);
      if (Array.isArray(s.subsections)) walkMarkSeen(s.subsections);
    });
  };
  walkMarkSeen(normSections);

  const normActions = rawActions.map((a, idx) => normalizeClientActionNode(a, idx)).filter(Boolean);
  const seenActIds = new Set(normActions.map(a => a.id));

  if (html && typeof html === "string") {
    const secRegex = /<([a-zA-Z0-9-]+)([^>]*?\bdata-wm-section\s*=\s*["']([^"']+)["'][^>]*)>/gi;
    let m;
    while ((m = secRegex.exec(html)) !== null) {
      const sId = m[3].trim();
      if (sId && !seenSecIds.has(sId)) {
        seenSecIds.add(sId);
        const lblMatch = m[2].match(/data-wm-label\s*=\s*["']([^"']+)["']/i);
        normSections.push(normalizeClientSectionNode({
          id: sId,
          label: lblMatch ? lblMatch[1].trim() : sId.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          defaultEnabled: true,
          toggleable: true
        }, normSections.length, 1, null));
      }
    }

    const actRegex = /<([a-zA-Z0-9-]+)([^>]*?\bdata-wm-(?:action|button)\s*=\s*["']([^"']+)["'][^>]*)>([\s\S]*?)<\/\1>/gi;
    while ((m = actRegex.exec(html)) !== null) {
      const aId = m[3].trim();
      if (aId && !seenActIds.has(aId)) {
        seenActIds.add(aId);
        const attrs = m[2] || "";
        const innerText = (m[4] || "").replace(/<[^>]+>/g, "").trim();
        const typeM = attrs.match(/data-wm-action-type\s*=\s*["']([^"']+)["']/i);
        const targetM = attrs.match(/data-wm-action-target\s*=\s*["']([^"']+)["']/i) || attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
        const rawTarget = targetM ? targetM[1].trim() : "";
        let inferredType = typeM ? typeM[1].toLowerCase().trim() : "section";
        if (!typeM) {
          if (rawTarget.startsWith("https://") || rawTarget.startsWith("http://")) inferredType = "external_url";
          else if (rawTarget.includes("customize")) inferredType = "customizer";
          else if (rawTarget.startsWith("/")) inferredType = "internal_url";
        }
        normActions.push(normalizeClientActionNode({
          id: aId,
          label: innerText || aId.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          type: inferredType,
          target: rawTarget.startsWith("#") && inferredType === "section" ? rawTarget.slice(1) : rawTarget
        }, normActions.length));
      }
    }
  }

  const varOverrides = {};
  const enabledVariantsMap = {};
  if (Array.isArray(manifest.variants)) {
    manifest.variants.forEach(rv => {
      if (!rv || typeof rv !== "object") return;
      const relSlug = String(rv.relationship || rv.slug || "").toLowerCase().trim().replace(/^rel_/, "").replace(/[\s-]+/g, "_");
      if (!relSlug) return;
      const isVarEnabled = rv.enabled !== false && String(rv.status || "published").toLowerCase() !== "disabled" && String(rv.status || "published").toLowerCase() !== "archived";
      enabledVariantsMap[relSlug] = isVarEnabled;
      const rawVisObj = (rv.visibilityOverrides && typeof rv.visibilityOverrides === "object")
        ? rv.visibilityOverrides
        : ((rv.visibility && typeof rv.visibility === "object") ? rv.visibility : {});
      const vis = { ...rawVisObj };
      const acts = {};
      if (Array.isArray(rv.actions)) {
        rv.actions.forEach(va => {
          if (va && va.id) acts[va.id] = { ...va };
        });
      } else if (rv.actions && typeof rv.actions === "object") {
        Object.assign(acts, rv.actions);
      }
      varOverrides[relSlug] = { enabled: isVarEnabled, visibility: vis, actions: acts };
    });
  }

  const prospectiveTplId = computeProspectiveUploadTemplateId(manifest);
  const autoTplUrl = prospectiveTplId ? `https://wishmagic.pages.dev/template/${prospectiveTplId}` : "";
  const genericTargets = new Set(["", "/customize.html", "/customize", "/template-preview.html", "/template-preview", "template.customize", "template.create", "template.preview"]);
  const initialActionsConfig = {};

  if (autoTplUrl) {
    normActions.forEach(act => {
      if (!act) return;
      const isTplSpecific = act.type === "template_link" || act.type === "customizer" || (act.logicalLink && String(act.logicalLink).startsWith("template."));
      if (isTplSpecific && genericTargets.has(String(act.target || "").trim())) {
        act.target = autoTplUrl;
        act.defaultTarget = autoTplUrl;
        initialActionsConfig[act.id] = {
          id: act.id,
          target: autoTplUrl,
          _autoGeneratedTemplateUrl: true
        };
      }
    });
  }

  uploadUtpConfigState = {
    activeScope: "all",
    sections: normSections,
    actions: normActions,
    visibilityConfig: {},
    actionsConfig: initialActionsConfig,
    variantOverrides: varOverrides,
    enabledVariants: enabledVariantsMap,
    validationErrors: []
  };

  bindUploadTitleTemplateLinkSync();
}

function computeProspectiveUploadTemplateId(manifestOverride = null) {
  const manifest = manifestOverride || currentParsedManifest || {};
  const titleEl = typeof document !== "undefined" ? document.getElementById("tpl-title") : null;
  const rawTitle = (titleEl && titleEl.value ? titleEl.value.trim() : "") ||
    (manifest.template && (manifest.template.id || manifest.template.slug || manifest.template.name)) ||
    manifest.id ||
    manifest.name ||
    "";
  if (!rawTitle) return "";
  const cleanSlug = String(rawTitle)
    .toLowerCase()
    .trim()
    .replace(/^tpl_/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleanSlug ? `tpl_${cleanSlug}` : "";
}

function bindUploadTitleTemplateLinkSync() {
  if (typeof document === "undefined") return;
  const titleEl = document.getElementById("tpl-title");
  if (!titleEl || titleEl.dataset.wmTplLinkBound === "true") return;
  titleEl.dataset.wmTplLinkBound = "true";
  titleEl.addEventListener("input", () => {
    const nextId = computeProspectiveUploadTemplateId();
    if (!nextId || !uploadUtpConfigState || !Array.isArray(uploadUtpConfigState.actions)) return;
    const nextUrl = `https://wishmagic.pages.dev/template/${nextId}`;
    let updated = false;
    uploadUtpConfigState.actions.forEach(act => {
      if (!act) return;
      const isTplSpecific = act.type === "template_link" || act.type === "customizer" || (act.logicalLink && String(act.logicalLink).startsWith("template."));
      if (!isTplSpecific) return;
      const curOv = uploadUtpConfigState.actionsConfig && uploadUtpConfigState.actionsConfig[act.id];
      if (!curOv || curOv._autoGeneratedTemplateUrl || /^https:\/\/wishmagic\.pages\.dev\/template\/tpl_/i.test(String(curOv.target || ""))) {
        act.target = nextUrl;
        act.defaultTarget = nextUrl;
        uploadUtpConfigState.actionsConfig = {
          ...(uploadUtpConfigState.actionsConfig || {}),
          [act.id]: {
            ...(curOv || {}),
            id: act.id,
            target: nextUrl,
            _autoGeneratedTemplateUrl: true
          }
        };
        updated = true;
      }
    });
    if (updated) {
      renderUploadUtpV12ConfigPanel();
    }
  });
}

function evaluateClientSectionTree(sections, tplVis, varVis, isSingleRelScope, parentEnabled = true) {
  return (sections || []).map(sec => {
    const isReq = Boolean(sec.required) || sec.toggleable === false;
    const defVal = isReq ? true : (sec.defaultEnabled !== false);
    const hasTpl = Object.prototype.hasOwnProperty.call(tplVis || {}, sec.id);
    const tplVal = hasTpl ? Boolean(tplVis[sec.id]) : undefined;
    const hasVar = isSingleRelScope && Object.prototype.hasOwnProperty.call(varVis || {}, sec.id);
    const varVal = hasVar ? Boolean(varVis[sec.id]) : undefined;

    let ownEnabled = defVal;
    let badgeText = "Manifest Default";
    let badgeClass = "bg-surface-container-high text-outline";

    if (isReq) {
      ownEnabled = true;
      badgeText = "Required (Locked)";
      badgeClass = "bg-purple-500/20 text-purple-300";
    } else if (hasVar) {
      ownEnabled = varVal;
      badgeText = "Relationship Override";
      badgeClass = "bg-pink-500/20 text-pink-300 border border-pink-500/30";
    } else if (hasTpl) {
      ownEnabled = tplVal;
      badgeText = isSingleRelScope ? "Inherited (All Relations)" : "Template-Wide Override";
      badgeClass = "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
    } else if (isSingleRelScope) {
      badgeText = "Inherited (Manifest Default)";
    }

    const parentDisabled = !parentEnabled;
    const effectiveEnabled = parentDisabled ? false : ownEnabled;
    if (parentDisabled) {
      badgeText = "Disabled by Parent Section";
      badgeClass = "bg-rose-500/20 text-rose-300";
    }

    const evaluatedSubs = evaluateClientSectionTree(sec.subsections || [], tplVis, varVis, isSingleRelScope, effectiveEnabled);
    return {
      ...sec,
      ownEnabled,
      effectiveEnabled,
      parentDisabled,
      badgeText,
      badgeClass,
      subsections: evaluatedSubs
    };
  });
}

function evaluateClientActions(actions, tplActs, varActs, isSingleRelScope, disabledSectionIdsSet) {
  return (actions || []).map(act => {
    const tplOv = (tplActs && tplActs[act.id]) || null;
    const varOv = (isSingleRelScope && act.relationshipSpecific !== false && varActs && varActs[act.id]) ? varActs[act.id] : null;

    const baseDefaultTarget = String(act.defaultTarget !== undefined ? act.defaultTarget : (act.target || "")).trim();
    const baseDefaultLogical = String(act.defaultLogicalLink || act.logicalLink || "").trim();

    let label = act.defaultLabel || act.label;
    let type = act.defaultType || act.type;
    let target = baseDefaultTarget;
    let logicalLink = baseDefaultLogical;
    let enabled = act.defaultEnabled !== false;
    let sourceLabel = "Manifest Default";
    let hasCustomTplTarget = false;

    if (tplOv) {
      if (act.editableLabel !== false && tplOv.label !== undefined) label = tplOv.label;
      if (act.configurable !== false) {
        if (tplOv.type !== undefined) type = tplOv.type;
        if (tplOv.logicalLink !== undefined) logicalLink = tplOv.logicalLink || "";
        if (tplOv.target !== undefined) {
          const nextT = String(tplOv.target).trim();
          target = nextT;
          if (nextT && (nextT.startsWith("global.") || nextT.startsWith("template."))) {
            logicalLink = nextT;
            hasCustomTplTarget = false;
          } else if (nextT && (!tplOv.logicalLink || nextT !== baseDefaultTarget)) {
            logicalLink = "";
            hasCustomTplTarget = true;
          }
        }
      }
      if (!act.required && tplOv.enabled !== undefined) enabled = Boolean(tplOv.enabled);
      sourceLabel = isSingleRelScope ? "Inherited (All Relations)" : "Template-Wide Override";
    }
    if (varOv) {
      if (act.editableLabel !== false && varOv.label !== undefined) label = varOv.label;
      if (act.configurable !== false) {
        const varTargetStr = varOv.target !== undefined ? String(varOv.target).trim() : undefined;
        const varLogicalStr = varOv.logicalLink !== undefined ? String(varOv.logicalLink || "").trim() : undefined;
        const isUntouchedVariantDefault = Boolean(
          hasCustomTplTarget &&
          !varOv._explicitVariantTarget &&
          (varTargetStr === undefined || varTargetStr === baseDefaultTarget || varTargetStr === "/customize.html" || varTargetStr === "/customize") &&
          (varLogicalStr === undefined || varLogicalStr === baseDefaultLogical || varLogicalStr === "template.customize" || varLogicalStr === "")
        );
        if (!isUntouchedVariantDefault) {
          if (varOv.type !== undefined) type = varOv.type;
          if (varLogicalStr !== undefined) logicalLink = varLogicalStr;
          if (varTargetStr !== undefined) {
            target = varTargetStr;
            if (varTargetStr && (varTargetStr.startsWith("global.") || varTargetStr.startsWith("template."))) {
              logicalLink = varTargetStr;
            } else if (varTargetStr && (!varLogicalStr || varTargetStr !== baseDefaultTarget)) {
              logicalLink = "";
            }
          }
        }
      }
      if (!act.required && varOv.enabled !== undefined) enabled = Boolean(varOv.enabled);
      sourceLabel = "Relationship Override";
    }

    const targetDisabled = type === "section" && target && disabledSectionIdsSet.has(String(target).replace(/^#/, ""));
    return {
      ...act,
      effectiveLabel: label,
      effectiveType: type,
      effectiveTarget: target,
      effectiveLogicalLink: logicalLink,
      effectiveEnabled: enabled && !targetDisabled,
      targetDisabled,
      sourceLabel
    };
  });
}

function escapeUtpHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderUtpV12EditorHtml(state, modePrefix) {
  const isSingleRel = state.activeScope !== "all";
  const relList = modePrefix === "upload"
    ? ((currentDetectedVariantsReport && currentDetectedVariantsReport.detectedRelations) || [])
    : ((state.variants || []).map(v => ({
        slug: String(v.relationshipSlug || v.relationship_slug || v.slug || "").toLowerCase().trim(),
        label: v.label || v.relationship_label || v.name || v.relationshipSlug || v.slug,
        enabled: v.enabled !== false && v.enabled !== 0 && v.status !== "disabled" && v.status !== "archived"
      })));
  const enabledVariantsMap = state.enabledVariants || {};
  const variantInclusionBarHtml = relList.length > 0
    ? `<div class="p-3 rounded-xl bg-surface-container border border-purple-500/25 space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-[11px] font-bold uppercase tracking-wider text-purple-200 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[15px] text-purple-400">family_restroom</span>
            <span>Included Relationship Variants on Public Website (${relList.filter(r => enabledVariantsMap[r.slug] !== undefined ? Boolean(enabledVariantsMap[r.slug]) : (r.enabled !== false)).length}/${relList.length} Enabled)</span>
          </span>
          <span class="text-[10px] text-outline">Unchecked variants are strictly hidden from gallery, filters, preview, customizer &amp; APIs</span>
        </div>
        <div class="flex flex-wrap gap-2">
          ${relList.map(r => {
            const sKey = String(r.slug || "").toLowerCase().trim();
            const isChecked = enabledVariantsMap[sKey] !== undefined ? Boolean(enabledVariantsMap[sKey]) : (r.enabled !== false);
            return `<label class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold cursor-pointer transition ${isChecked ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' : 'bg-rose-500/10 border-rose-500/30 text-rose-300 opacity-80'}">
              <input type="checkbox" ${isChecked ? "checked" : ""} onchange="handleUtpVariantInclusionToggle('${modePrefix}', '${escapeQuotes(sKey)}', this.checked)" class="rounded text-primary w-3.5 h-3.5 cursor-pointer"/>
              <span>${escapeUtpHtml(r.label || r.slug)}</span>
              <span class="text-[10px] font-mono opacity-75">(${isChecked ? "Included" : "Hidden"})</span>
            </label>`;
          }).join("")}
        </div>
      </div>`
    : `<div class="p-3 rounded-xl bg-surface-container border border-purple-500/20 text-xs text-outline">
        <span class="font-bold text-purple-200">Single-Edition Template:</span> No relationship variants created for this template (shows only variants built for this template).
      </div>`;

  const varVis = isSingleRel ? ((state.variantOverrides[state.activeScope] && state.variantOverrides[state.activeScope].visibility) || {}) : {};
  const varActs = isSingleRel ? ((state.variantOverrides[state.activeScope] && state.variantOverrides[state.activeScope].actions) || {}) : {};

  const evaluatedTree = evaluateClientSectionTree(state.sections || state.manifestSections || [], state.visibilityConfig, varVis, isSingleRel, true);
  const disabledSet = new Set();
  const collectDisabled = (nodes) => {
    nodes.forEach(n => {
      if (!n.effectiveEnabled) disabledSet.add(n.id);
      if (Array.isArray(n.subsections)) collectDisabled(n.subsections);
    });
  };
  collectDisabled(evaluatedTree);

  const evaluatedActions = evaluateClientActions(state.actions || state.manifestActions || [], state.actionsConfig, varActs, isSingleRel, disabledSet);

  const renderSectionRowRecursive = (sec, indentLevel = 0) => {
    const padClass = indentLevel === 0 ? "" : (indentLevel === 1 ? "ml-5 border-l-2 border-purple-500/30 pl-3" : "ml-10 border-l-2 border-pink-500/30 pl-3");
    const isLocked = sec.required || sec.toggleable === false || sec.parentDisabled;
    const subRows = (sec.subsections || []).map(sub => renderSectionRowRecursive(sub, indentLevel + 1)).join("");
    const visSubtext = sec.effectiveEnabled
      ? "🟢 Visible to Customer & Customizer"
      : "🔴 Completely Removed from Customer Experience (DOM & Form)";
    return `
      <div class="space-y-1.5 ${padClass}">
        <div class="p-2.5 rounded-xl bg-surface-container border border-purple-500/20 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="material-symbols-outlined text-[16px] ${sec.effectiveEnabled ? 'text-emerald-400' : 'text-rose-400'}">${indentLevel === 0 ? 'view_agenda' : 'subdirectory_arrow_right'}</span>
            <div>
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-bold text-xs text-on-surface">${escapeUtpHtml(sec.label)}</span>
                <span class="font-mono text-[10px] text-primary">(${escapeUtpHtml(sec.id)})</span>
                <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${sec.badgeClass}">${escapeUtpHtml(sec.badgeText)}</span>
              </div>
              <div class="text-[10px] text-outline">${visSubtext}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <label class="inline-flex items-center gap-1.5 ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}">
              <input type="checkbox" ${sec.effectiveEnabled ? 'checked' : ''} ${isLocked ? 'disabled' : ''} onchange="handleUtpV12SectionToggle('${modePrefix}', '${escapeQuotes(sec.id)}', this.checked)" class="rounded text-primary w-4 h-4"/>
              <span class="text-[11px] font-bold ${sec.effectiveEnabled ? 'text-emerald-300' : 'text-rose-300'}">${sec.effectiveEnabled ? 'Enabled' : 'Disabled'}</span>
            </label>
          </div>
        </div>
        ${subRows}
      </div>
    `;
  };

  const sectionsHtml = evaluatedTree.length > 0
    ? evaluatedTree.map(s => renderSectionRowRecursive(s, 0)).join("")
    : `<div class="p-3 rounded-xl bg-surface-container text-xs text-outline italic">No toggleable sections declared in wishmagic.json or HTML. Legacy template mode active.</div>`;

  const actionsHtml = evaluatedActions.length > 0
    ? evaluatedActions.map(act => `
      <div class="p-3 rounded-xl bg-surface-container border border-purple-500/20 space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px] text-amber-300">smart_button</span>
            <span class="font-bold text-xs text-on-surface">${escapeUtpHtml(act.effectiveLabel || act.id)}</span>
            <span class="font-mono text-[10px] text-primary">[data-wm-action="${escapeUtpHtml(act.id)}"]</span>
            <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-500/20 text-purple-200">${escapeUtpHtml(act.sourceLabel)}</span>
            ${act.targetDisabled ? '<span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300">Target Section Disabled → Auto-Hidden</span>' : ''}
          </div>
          <label class="inline-flex items-center gap-1.5 ${act.required ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}">
            <input type="checkbox" ${act.effectiveEnabled ? 'checked' : ''} ${act.required ? 'disabled' : ''} onchange="handleUtpV12ActionChange('${modePrefix}', '${escapeQuotes(act.id)}', 'enabled', this.checked)" class="rounded text-primary w-4 h-4"/>
            <span class="text-[11px] font-bold">${act.effectiveEnabled ? 'Active' : 'Hidden'}</span>
          </label>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div>
            <label class="block text-[10px] font-bold uppercase text-outline mb-1">Button Label</label>
            <input type="text" value="${escapeUtpHtml(act.effectiveLabel)}" ${act.editableLabel === false ? 'disabled' : ''} onchange="handleUtpV12ActionChange('${modePrefix}', '${escapeQuotes(act.id)}', 'label', this.value)" class="w-full bg-surface-container-lowest text-on-surface px-2.5 py-1.5 rounded-lg border border-purple-500/30 text-xs font-semibold"/>
          </div>
          <div>
            <label class="block text-[10px] font-bold uppercase text-outline mb-1">Action Type</label>
            <select ${act.configurable === false ? 'disabled' : ''} onchange="handleUtpV12ActionChange('${modePrefix}', '${escapeQuotes(act.id)}', 'type', this.value)" class="w-full bg-surface-container-lowest text-on-surface px-2.5 py-1.5 rounded-lg border border-purple-500/30 text-xs font-semibold">
              <option value="global_link" ${act.effectiveType === 'global_link' ? 'selected' : ''}>Central Global Link (global_link • UTP v1.3.0)</option>
              <option value="template_link" ${act.effectiveType === 'template_link' ? 'selected' : ''}>Template Creation Link (template_link • UTP v1.3.0)</option>
              <option value="section" ${act.effectiveType === 'section' ? 'selected' : ''}>Scroll to Section (section)</option>
              <option value="customizer" ${act.effectiveType === 'customizer' ? 'selected' : ''}>Open Customizer (customizer)</option>
              <option value="internal_url" ${act.effectiveType === 'internal_url' ? 'selected' : ''}>Internal WishMagic Route (internal_url)</option>
              <option value="external_url" ${act.effectiveType === 'external_url' ? 'selected' : ''}>Safe HTTPS External Link (external_url)</option>
              <option value="modal" ${act.effectiveType === 'modal' ? 'selected' : ''}>Open Template Modal (modal)</option>
              <option value="none" ${act.effectiveType === 'none' ? 'selected' : ''}>Display Only / No Action (none)</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-bold uppercase text-outline mb-1">Destination / Target ID</label>
            <input type="text" value="${escapeUtpHtml(act.effectiveTarget)}" ${act.configurable === false ? 'disabled' : ''} placeholder="e.g. gallery, /customize, https://..." onchange="handleUtpV12ActionChange('${modePrefix}', '${escapeQuotes(act.id)}', 'target', this.value)" class="w-full bg-surface-container-lowest text-on-surface font-mono px-2.5 py-1.5 rounded-lg border border-purple-500/30 text-xs"/>
          </div>
        </div>
      </div>
    `).join("")
    : `<div class="p-3 rounded-xl bg-surface-container text-xs text-outline italic">No configurable [data-wm-action] buttons declared in wishmagic.json or HTML.</div>`;

  const errorsBanner = Array.isArray(state.validationErrors) && state.validationErrors.length > 0
    ? `<div id="${modePrefix}-utp-v12-validation-banner" class="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs space-y-1">
        <div class="font-bold uppercase tracking-wider text-[10px] text-rose-300">✕ Configuration Validation Errors (Draft Preserved — Fix Before Publishing)</div>
        ${state.validationErrors.map(e => `<div>• ${escapeUtpHtml(e)}</div>`).join("")}
      </div>`
    : "";

  const isSecBtnExpanded = modePrefix !== 'upload' || Boolean(state.isExpandedInUpload) || (Array.isArray(state.validationErrors) && state.validationErrors.length > 0);
  return `
    <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-purple-500/20">
      <div>
        <h4 class="font-bold text-sm text-on-surface flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[18px] text-primary">visibility</span>
          <span>Relationship Variants, Section Toggles &amp; Button Links</span>
        </h4>
        <p class="text-[11px] text-on-surface-variant">Choose active relationships or customize sections (${evaluatedTree.length}) &amp; buttons (${evaluatedActions.length}).</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        ${modePrefix === 'upload' ? `
          <button type="button" onclick="toggleUploadUtpEditorBody()" class="px-3 py-1.5 rounded-lg bg-surface-container-highest hover:bg-primary/20 text-on-surface text-xs font-bold cursor-pointer">
            ${isSecBtnExpanded ? 'Hide Sections & Buttons ▴' : `🎛️ Customize Sections (${evaluatedTree.length}) & Buttons (${evaluatedActions.length}) ▾`}
          </button>
        ` : ''}
        <select onchange="handleUtpV12ScopeChange('${modePrefix}', this.value)" class="bg-surface-container text-on-surface px-3 py-1.5 rounded-lg border border-purple-500/40 text-xs font-bold">
          <option value="all" ${state.activeScope === 'all' ? 'selected' : ''}>🌐 ALL RELATIONSHIPS (Template-Wide Default)</option>
          ${relList.map(r => `<option value="${escapeUtpHtml(r.slug)}" ${state.activeScope === r.slug ? 'selected' : ''}>🎯 ONE RELATIONSHIP: ${escapeUtpHtml(r.label || r.slug)}</option>`).join("")}
        </select>
        <button type="button" onclick="previewUtpV12SelectedRelationship('${modePrefix}')" class="px-2.5 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 text-[11px] font-bold cursor-pointer">
          👁️ Preview Scope
        </button>
      </div>
    </div>
    ${errorsBanner}
    ${variantInclusionBarHtml}
    <div id="${modePrefix}-utp-sec-btn-collapsible" class="${isSecBtnExpanded ? 'space-y-3' : 'hidden space-y-3'}">
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-wider text-outline">Sections &amp; Nested Subsections (${evaluatedTree.length})</span>
          <span class="text-[10px] text-outline">Precedence: Platform Required → Single Relationship Override → All Relationships → Manifest Default</span>
        </div>
        <div class="space-y-2 max-h-64 overflow-y-auto pr-1">${sectionsHtml}</div>
      </div>
      <div class="space-y-2 pt-2 border-t border-purple-500/20">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-wider text-outline">Configurable Buttons &amp; Links (${evaluatedActions.length})</span>
          <span class="text-[10px] text-outline">Validated against internal routes, safe HTTPS URLs &amp; active sections</span>
        </div>
        <div class="space-y-2 max-h-64 overflow-y-auto pr-1">${actionsHtml}</div>
      </div>
    </div>
  `;
}

function renderUploadUtpV12ConfigPanel() {
  const panel = document.getElementById("upload-utp-v12-config-panel");
  if (!panel) return;
  panel.innerHTML = renderUtpV12EditorHtml(uploadUtpConfigState, "upload");
}

function renderEditUtpV12ConfigPanel() {
  const panel = document.getElementById("edit-utp-v12-config-panel");
  if (!panel) return;
  panel.innerHTML = renderUtpV12EditorHtml(editUtpConfigState, "edit");
}

window.handleUtpV12ScopeChange = function(modePrefix, newScope) {
  const state = modePrefix === "upload" ? uploadUtpConfigState : editUtpConfigState;
  state.activeScope = newScope || "all";
  if (modePrefix === "upload") {
    renderUploadUtpV12ConfigPanel();
    renderLiveSandboxPreview();
  } else {
    renderEditUtpV12ConfigPanel();
  }
};

window.handleUtpV12SectionToggle = function(modePrefix, sectionId, enabled) {
  const state = modePrefix === "upload" ? uploadUtpConfigState : editUtpConfigState;
  if (state.activeScope === "all") {
    state.visibilityConfig = { ...(state.visibilityConfig || {}), [sectionId]: Boolean(enabled) };
  } else {
    const curVar = (state.variantOverrides && state.variantOverrides[state.activeScope]) || { visibility: {}, actions: {} };
    curVar.visibility = { ...(curVar.visibility || {}), [sectionId]: Boolean(enabled) };
    state.variantOverrides = { ...(state.variantOverrides || {}), [state.activeScope]: curVar };
  }
  state.validationErrors = [];
  if (modePrefix === "upload") {
    renderUploadUtpV12ConfigPanel();
    renderLiveSandboxPreview();
  } else {
    renderEditUtpV12ConfigPanel();
  }
};

window.handleUtpV12ActionChange = function(modePrefix, actionId, prop, value) {
  const state = modePrefix === "upload" ? uploadUtpConfigState : editUtpConfigState;
  const applyActionPropMutation = (actObj, isSingleScope) => {
    actObj[prop] = value;
    if (prop === "target") {
      const trimmedVal = String(value || "").trim();
      actObj.target = trimmedVal;
      if (trimmedVal.startsWith("global.") || trimmedVal.startsWith("template.")) {
        actObj.logicalLink = trimmedVal;
      } else {
        // Clear any default logicalLink so custom admin destination takes priority
        actObj.logicalLink = "";
      }
      if (isSingleScope) {
        actObj._explicitVariantTarget = true;
      }
    } else if (prop === "type") {
      const nextType = String(value || "").toLowerCase().trim();
      const curTarget = String(actObj.target || "").trim();
      if (nextType !== "global_link" && nextType !== "template_link" && !curTarget.startsWith("global.") && !curTarget.startsWith("template.")) {
        actObj.logicalLink = "";
      }
      if (isSingleScope) {
        actObj._explicitVariantTarget = true;
      }
    }
  };

  if (state.activeScope === "all") {
    const curAct = { ...((state.actionsConfig && state.actionsConfig[actionId]) || { id: actionId }) };
    applyActionPropMutation(curAct, false);
    state.actionsConfig = { ...(state.actionsConfig || {}), [actionId]: curAct };
  } else {
    const curVar = (state.variantOverrides && state.variantOverrides[state.activeScope]) || { visibility: {}, actions: {} };
    const curAct = { ...((curVar.actions && curVar.actions[actionId]) || { id: actionId }) };
    applyActionPropMutation(curAct, true);
    curVar.actions = { ...(curVar.actions || {}), [actionId]: curAct };
    state.variantOverrides = { ...(state.variantOverrides || {}), [state.activeScope]: curVar };
  }
  state.validationErrors = [];
  if (modePrefix === "upload") {
    renderUploadUtpV12ConfigPanel();
    renderLiveSandboxPreview();
  } else {
    renderEditUtpV12ConfigPanel();
  }
};

function applyUtpV12StateToPreviewIframe(doc, state) {
  if (!doc) return;
  const isSingle = state.activeScope !== "all";
  const varVis = isSingle ? ((state.variantOverrides[state.activeScope] && state.variantOverrides[state.activeScope].visibility) || {}) : {};
  const varActs = isSingle ? ((state.variantOverrides[state.activeScope] && state.variantOverrides[state.activeScope].actions) || {}) : {};
  const evalTree = evaluateClientSectionTree(state.sections || state.manifestSections || [], state.visibilityConfig, varVis, isSingle, true);
  const disabledIds = [];
  const walk = (nodes) => {
    nodes.forEach(n => {
      if (!n.effectiveEnabled) disabledIds.push(n.id);
      if (Array.isArray(n.subsections)) walk(n.subsections);
    });
  };
  walk(evalTree);
  const evalActs = evaluateClientActions(state.actions || state.manifestActions || [], state.actionsConfig, varActs, isSingle, new Set(disabledIds));

  // Physical removal of disabled sections & subsections in preview
  disabledIds.forEach(secId => {
    doc.querySelectorAll(`[data-wm-section="${secId}"], [data-wm-subsection="${secId}"], #section-${secId}`).forEach(el => el.remove());
  });

  // Apply button labels & action states in preview
  evalActs.forEach(act => {
    doc.querySelectorAll(`[data-wm-action="${act.id}"], [data-wm-button="${act.id}"]`).forEach(el => {
      if (!act.effectiveEnabled) {
        if (act.fallbackBehavior === "disable") {
          el.setAttribute("disabled", "disabled");
          el.style.opacity = "0.5";
        } else {
          el.remove();
        }
        return;
      }
      if (act.effectiveLabel) el.textContent = act.effectiveLabel;
    });
  });
}

window.previewUtpV12SelectedRelationship = function(modePrefix) {
  if (modePrefix === "upload") {
    renderLiveSandboxPreview();
    if (typeof showToast === "function") showToast("👁️ Refreshed upload sandbox preview for scope: " + uploadUtpConfigState.activeScope);
  } else if (editUtpConfigState.templateId) {
    const scope = editUtpConfigState.activeScope;
    const url = scope && scope !== "all"
      ? `/template-preview.html?template=${encodeURIComponent(editUtpConfigState.templateId)}&rel=${encodeURIComponent(scope)}`
      : `/template-preview.html?template=${encodeURIComponent(editUtpConfigState.templateId)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }
};

function getSelectedEnabledVariantSlugs(state, fallbackRels = null) {
  if (!state) return Array.isArray(fallbackRels) ? fallbackRels : [];
  const enabledMap = state.enabledVariants || {};
  const mapKeys = Object.keys(enabledMap);
  if (mapKeys.length > 0) {
    return mapKeys.filter(k => Boolean(enabledMap[k]));
  }
  return Array.isArray(fallbackRels) ? fallbackRels : [];
}

window.handleUtpVariantInclusionToggle = function(modePrefix, relSlug, enabled) {
  const cleanSlug = String(relSlug || "").toLowerCase().trim().replace(/^rel_/, "").replace(/[\s-]+/g, "_");
  if (!cleanSlug) return;
  const state = modePrefix === "upload" ? uploadUtpConfigState : editUtpConfigState;
  state.enabledVariants = { ...(state.enabledVariants || {}), [cleanSlug]: Boolean(enabled) };
  const curVar = (state.variantOverrides && state.variantOverrides[cleanSlug]) || { visibility: {}, actions: {} };
  curVar.enabled = Boolean(enabled);
  state.variantOverrides = { ...(state.variantOverrides || {}), [cleanSlug]: curVar };

  if (modePrefix === "upload") {
    if (currentDetectedVariantsReport && Array.isArray(currentDetectedVariantsReport.detectedRelations)) {
      currentDetectedVariantsReport.detectedRelations.forEach(r => {
        if (String(r.slug || "").toLowerCase().trim() === cleanSlug) {
          r.enabled = Boolean(enabled);
        }
      });
      const reportEl = document.getElementById("admin-variant-discovery-report");
      if (reportEl) reportEl.outerHTML = renderAdminVariantUploadReportHtml(currentDetectedVariantsReport, false);
    }
    renderUploadUtpV12ConfigPanel();
    renderLiveSandboxPreview();
  } else {
    const elRels = document.getElementById("edit-tpl-relationships");
    if (elRels) {
      const enabledSlugs = getSelectedEnabledVariantSlugs(editUtpConfigState, []);
      const labels = (editUtpConfigState.variants || [])
        .filter(v => enabledSlugs.includes(String(v.relationshipSlug || v.slug || "").toLowerCase().trim()))
        .map(v => v.label || v.relationshipSlug || v.slug);
      elRels.value = (labels.length > 0 ? labels : enabledSlugs).join(", ");
    }
    renderEditUtpV12ConfigPanel();
  }
};

async function loadEditTemplateUtpV12Config(templateId, fallbackTpl) {
  const initialEnabledMap = {};
  (fallbackTpl?.variants || fallbackTpl?.availableVariants || []).forEach(v => {
    const s = String(v.relationshipSlug || v.relationship_slug || v.relationship || v.slug || "").toLowerCase().trim();
    if (s) initialEnabledMap[s] = v.enabled !== false && v.enabled !== 0 && v.status !== "disabled" && v.status !== "archived";
  });

  editUtpConfigState = {
    templateId,
    activeScope: "all",
    lockVersion: Number(fallbackTpl?.lockVersion || fallbackTpl?.lock_version || 1),
    manifestSections: (fallbackTpl?.sections || []).map((s, idx) => normalizeClientSectionNode(s, idx, 1, null)).filter(Boolean),
    manifestActions: (fallbackTpl?.actions || []).map((a, idx) => normalizeClientActionNode(a, idx)).filter(Boolean),
    visibilityConfig: fallbackTpl?.visibilityConfig || {},
    actionsConfig: fallbackTpl?.actionsConfig || {},
    variantOverrides: {},
    enabledVariants: initialEnabledMap,
    variants: fallbackTpl?.variants || fallbackTpl?.availableVariants || [],
    hasDraft: false,
    validationErrors: []
  };

  try {
    const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}/config`, { credentials: "include" });
    if (res.ok) {
      const json = await res.json();
      const data = json.data || json;
      if (data && data.templateId) {
        editUtpConfigState.lockVersion = Number(data.lockVersion || 1);
        editUtpConfigState.manifestSections = (data.manifestSections || []).map((s, idx) => normalizeClientSectionNode(s, idx, 1, null)).filter(Boolean);
        editUtpConfigState.manifestActions = (data.manifestActions || []).map((a, idx) => normalizeClientActionNode(a, idx)).filter(Boolean);
        const draft = data.draftConfig;
        editUtpConfigState.hasDraft = Boolean(draft);
        editUtpConfigState.visibilityConfig = (draft && draft.visibility) ? { ...(data.visibilityConfig || {}), ...draft.visibility } : (data.visibilityConfig || {});
        editUtpConfigState.actionsConfig = (draft && draft.actions) ? { ...(data.actionsConfig || {}), ...draft.actions } : (data.actionsConfig || {});
        editUtpConfigState.variantOverrides = (draft && draft.variants) ? { ...(data.variantOverrides || {}), ...draft.variants } : (data.variantOverrides || {});
        editUtpConfigState.variants = data.variants || editUtpConfigState.variants;

        const loadedEnabledMap = {};
        const authoritativeList = Array.isArray(data.enabledVariants) ? data.enabledVariants.map(x => String(x).toLowerCase().trim()) : null;
        (editUtpConfigState.variants || []).forEach(v => {
          const s = String(v.relationshipSlug || v.relationship_slug || v.relationship || v.slug || "").toLowerCase().trim();
          if (!s) return;
          if (authoritativeList && authoritativeList.length > 0) {
            loadedEnabledMap[s] = authoritativeList.includes(s);
          } else {
            loadedEnabledMap[s] = v.enabled !== false && v.enabled !== 0 && v.status !== "disabled" && v.status !== "archived";
          }
        });
        if (Object.keys(loadedEnabledMap).length > 0) {
          editUtpConfigState.enabledVariants = loadedEnabledMap;
          const elRels = document.getElementById("edit-tpl-relationships");
          if (elRels) {
            const enabledSlugs = Object.keys(loadedEnabledMap).filter(k => loadedEnabledMap[k]);
            const labels = (editUtpConfigState.variants || [])
              .filter(v => enabledSlugs.includes(String(v.relationshipSlug || v.slug || "").toLowerCase().trim()))
              .map(v => v.label || v.relationshipSlug || v.slug);
            elRels.value = (labels.length > 0 ? labels : enabledSlugs).join(", ");
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Edit Template Config Load Notice]:", err.message);
  }

  // Ensure Template-Specific Links (template_link / customizer / template.*) automatically have this template's link pre-populated for both existing & new templates
  if (templateId && Array.isArray(editUtpConfigState.manifestActions)) {
    const autoEditTplUrl = `https://wishmagic.pages.dev/template/${templateId}`;
    const genericEditTargets = new Set(["", "/customize.html", "/customize", "/template-preview.html", "/template-preview", "template.customize", "template.create", "template.preview"]);
    editUtpConfigState.manifestActions.forEach(act => {
      if (!act) return;
      const isTplSpecific = act.type === "template_link" || act.type === "customizer" || (act.logicalLink && String(act.logicalLink).startsWith("template."));
      if (!isTplSpecific) return;
      if (genericEditTargets.has(String(act.target || "").trim())) {
        act.target = autoEditTplUrl;
        act.defaultTarget = autoEditTplUrl;
      }
      const existingOv = editUtpConfigState.actionsConfig && editUtpConfigState.actionsConfig[act.id];
      const existingTarget = existingOv && existingOv.target !== undefined ? String(existingOv.target).trim() : "";
      if (!existingTarget || genericEditTargets.has(existingTarget)) {
        editUtpConfigState.actionsConfig = {
          ...(editUtpConfigState.actionsConfig || {}),
          [act.id]: {
            ...(existingOv || {}),
            id: act.id,
            target: autoEditTplUrl
          }
        };
      }
    });
  }

  renderEditUtpV12ConfigPanel();
}

window.resetEditTemplateUtpConfig = async function() {
  if (!editUtpConfigState.templateId) return;
  const scope = editUtpConfigState.activeScope || "all";
  const scopeLabel = scope === "all" ? "ALL relationships (template-wide)" : `relationship "${scope}"`;
  if (!confirm(`Reset section visibility and button configurations for ${scopeLabel} back to manifest defaults?`)) {
    return;
  }
  try {
    const res = await fetch(`/api/templates/${encodeURIComponent(editUtpConfigState.templateId)}/config/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ scope })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(json.error?.message || json.message || "Reset failed");
    }
    await loadEditTemplateUtpV12Config(editUtpConfigState.templateId, null);
    if (typeof showToast === "function") showToast(`↺ Reset ${scopeLabel} to manifest defaults!`);
  } catch (err) {
    alert("Error resetting configuration: " + err.message);
  }
};


// ============================================================================
// PART 50: SMART TEMPLATE RECOGNITION, SIDE-BY-SIDE PREVIEW & UPDATE STUDIO
// ============================================================================

let importStudioState = {
  sessionId: null,
  intendedTargetTemplateId: null,
  selectedTargetTemplateId: null,
  updatePackageMode: "full_package", // "full_package" | "delta_changed_only" 
  sessionData: null,
  loading: false,
  abortController: null,
  viewport: "desktop", // "desktop" | "tablet" | "mobile"
  mobilePanelMode: "both", // "both" | "existing" | "staged"
  syncControls: true,
  selectedVariant: "default",
  existingVariant: "default",
  stagedVariant: "default",
  activeFileDiffPath: null,
  warningsAcknowledged: false,
  resolveConflictConfirmed: false,
  newTemplateSlugOverride: "",
  newTemplateIdOverride: "",
  newTemplateNameOverride: "",
  runtimePreviewErrors: []
};

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("message", (event) => {
    if (!event.data || typeof event.data !== "object") return;
    if (event.data.type === "WM_PREVIEW_DIAGNOSTIC" && event.data.error) {
      importStudioState.runtimePreviewErrors.push(String(event.data.error));
    }
  });
}

function escapeHtmlSafe(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureSmartImportStudioDomContainers() {
  let workspace = document.getElementById("smart-import-studio-workspace");
  if (!workspace) {
    const stepConfig = document.getElementById("upload-step-config");
    if (stepConfig) {
      workspace = document.createElement("div");
      workspace.id = "smart-import-studio-workspace";
      workspace.className = "hidden wm-card bg-surface-container-lowest p-4 sm:p-5 rounded-2xl border border-purple-500/40 flex flex-col gap-5 shadow-xl";
      stepConfig.insertBefore(workspace, stepConfig.firstChild);
    }
  }
  let confirmModal = document.getElementById("import-publish-confirm-modal");
  if (!confirmModal && typeof document !== "undefined" && document.body) {
    confirmModal = document.createElement("div");
    confirmModal.id = "import-publish-confirm-modal";
    confirmModal.className = "fixed inset-0 z-50 hidden bg-black/90 backdrop-blur-xl flex items-center justify-center p-2 sm:p-4 md:p-6 transition-opacity overflow-y-auto";
    confirmModal.setAttribute("role", "dialog");
    confirmModal.setAttribute("aria-modal", "true");
    confirmModal.innerHTML =
      '<div class="w-full max-w-3xl max-h-[92vh] bg-surface-container-low border border-purple-500/40 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden my-auto">' +
        '<div class="p-4 sm:p-5 bg-surface-container flex items-center justify-between border-b border-purple-500/20">' +
          '<div class="flex items-center gap-3">' +
            '<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/25 to-purple-500/25 border border-emerald-400/40 text-emerald-300 flex items-center justify-center">' +
              '<span class="material-symbols-outlined text-[24px]">verified_user</span>' +
            '</div>' +
            '<div>' +
              '<h3 id="import-confirm-modal-title" class="font-headline-sm text-sm sm:text-base font-bold text-on-surface">Confirm Template Publication</h3>' +
              '<span id="import-confirm-modal-subtitle" class="text-[11px] text-outline">Review computed change summary, existing-wish protection, and rollback readiness before publishing</span>' +
            '</div>' +
          '</div>' +
          '<button type="button" onclick="closeImportPublishConfirmationModal()" class="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container-high transition cursor-pointer" aria-label="Close">' +
            '<span class="material-symbols-outlined text-[20px]">close</span>' +
          '</button>' +
        '</div>' +
        '<div id="import-confirm-modal-body" class="p-4 sm:p-6 overflow-y-auto flex flex-col gap-4 text-xs text-on-surface"></div>' +
      '</div>';
    document.body.appendChild(confirmModal);
  }
  return { workspace, confirmModal };
}

function populateDeltaTargetTemplateDropdown(templatesList) {
  const sel = document.getElementById("delta-target-template-select");
  if (!sel) return;
  const currentVal = sel.value || importStudioState.intendedTargetTemplateId || importStudioState.selectedTargetTemplateId || "";
  const list = Array.isArray(templatesList) ? templatesList : (allAdminTemplates || []);
  sel.innerHTML = '<option value="">Auto-Detect from wishmagic.json / Select Template...</option>' +
    list.map(t => `<option value="${escapeHtmlSafe(t.id)}" ${t.id === currentVal ? "selected" : ""}>${escapeHtmlSafe(t.name)} (${escapeHtmlSafe(t.id)})</option>`).join("");
}

function syncUploadModeCardsUI() {
  const mode = importStudioState.updatePackageMode === "delta_changed_only" ? "delta_changed_only" : "full_package";
  const isDelta = mode === "delta_changed_only";
  const cardFull = document.getElementById("upload-mode-card-full");
  const cardDelta = document.getElementById("upload-mode-card-delta");
  const badgeFull = document.getElementById("upload-mode-badge-full");
  const badgeDelta = document.getElementById("upload-mode-badge-delta");
  const targetBar = document.getElementById("delta-target-template-bar");
  const targetSel = document.getElementById("delta-target-template-select");

  if (cardFull) {
    cardFull.className = isDelta
      ? "p-3.5 rounded-xl border border-purple-500/30 bg-surface-container hover:bg-surface-container-high text-left flex items-start gap-3 transition cursor-pointer"
      : "p-3.5 rounded-xl border-2 border-primary bg-primary/15 text-left flex items-start gap-3 transition cursor-pointer shadow-md";
  }
  if (cardDelta) {
    cardDelta.className = isDelta
      ? "p-3.5 rounded-xl border-2 border-emerald-500 bg-emerald-500/15 text-left flex items-start gap-3 transition cursor-pointer shadow-md"
      : "p-3.5 rounded-xl border border-purple-500/30 bg-surface-container hover:bg-surface-container-high text-left flex items-start gap-3 transition cursor-pointer";
  }
  if (badgeFull) {
    badgeFull.textContent = isDelta ? "Option 1" : "✓ Active";
    badgeFull.className = isDelta
      ? "px-2 py-0.5 rounded-full bg-surface-container-highest text-outline text-[9px] font-bold uppercase"
      : "px-2 py-0.5 rounded-full bg-primary text-white text-[9px] font-bold uppercase";
  }
  if (badgeDelta) {
    badgeDelta.textContent = isDelta ? "✓ Active" : "Option 2";
    badgeDelta.className = isDelta
      ? "px-2 py-0.5 rounded-full bg-emerald-500 text-purple-950 text-[9px] font-black uppercase"
      : "px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-bold uppercase";
  }
  if (targetBar) {
    if (isDelta || importStudioState.intendedTargetTemplateId) {
      targetBar.classList.remove("hidden");
      populateDeltaTargetTemplateDropdown(allAdminTemplates);
      if (targetSel && (importStudioState.intendedTargetTemplateId || importStudioState.selectedTargetTemplateId)) {
        targetSel.value = importStudioState.intendedTargetTemplateId || importStudioState.selectedTargetTemplateId;
      }
    } else {
      targetBar.classList.add("hidden");
    }
  }
}

window.handleDeltaTargetTemplateSelect = function(templateId) {
  const cleanId = String(templateId || "").trim() || null;
  importStudioState.intendedTargetTemplateId = cleanId;
  importStudioState.selectedTargetTemplateId = cleanId;
  if (importStudioState.sessionId && cleanId) {
    window.selectImportCandidateTarget(cleanId);
  }
};

window.setUploadUpdatePackageMode = async function(mode, optionalTargetId = null) {
  const resolvedMode = mode === "delta_changed_only" ? "delta_changed_only" : "full_package";
  importStudioState.updatePackageMode = resolvedMode;
  if (optionalTargetId) {
    importStudioState.intendedTargetTemplateId = optionalTargetId;
    importStudioState.selectedTargetTemplateId = optionalTargetId;
  }
  syncUploadModeCardsUI();

  if (typeof showToast === "function") {
    showToast(
      resolvedMode === "delta_changed_only"
        ? "⚡ Mode 2 Selected: Only Changed & New Files will be updated (Unchanged files reused)!"
        : "📦 Mode 1 Selected: Full Template ZIP Package will be uploaded!",
      "info"
    );
  }

  // If a session is already active in Smart Import Studio, re-run server comparison with the new updatePackageMode!
  if (importStudioState.sessionId) {
    try {
      const res = await fetch("/api/templates/import-studio/" + encodeURIComponent(importStudioState.sessionId) + "/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          targetTemplateId: importStudioState.selectedTargetTemplateId || importStudioState.intendedTargetTemplateId || null,
          updatePackageMode: resolvedMode
        })
      });
      const json = await res.json().catch(() => ({}));
      const data = json.data || json;
      if (res.ok && data && data.sessionId) {
        importStudioState.sessionData = data;
        importStudioState.updatePackageMode = data.updatePackageMode || resolvedMode;
        renderSmartImportStudioWorkspace();
        const confirmModal = document.getElementById("import-publish-confirm-modal");
        if (confirmModal && !confirmModal.classList.contains("hidden")) {
          openImportPublishConfirmationModal(data);
        }
      }
    } catch (_) {}
  }
};

window.openSmartImportStudio = function(intendedTemplateId = null, initialMode = null) {
  importStudioState.intendedTargetTemplateId = intendedTemplateId || null;
  if (initialMode) {
    importStudioState.updatePackageMode = initialMode === "delta_changed_only" ? "delta_changed_only" : "full_package";
  }
  const uploadModal = document.getElementById("upload-code-modal");
  if (uploadModal) {
    uploadModal.classList.remove("hidden");
    uploadModal.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  syncUploadModeCardsUI();
  const { workspace } = ensureSmartImportStudioDomContainers();
  if (workspace && intendedTemplateId) {
    const targetTpl = (allAdminTemplates || []).find(t => t.id === intendedTemplateId || t.slug === intendedTemplateId);
    const isDelta = importStudioState.updatePackageMode === "delta_changed_only";
    workspace.classList.remove("hidden");
    workspace.innerHTML =
      '<div class="p-4 rounded-xl bg-pink-500/10 border border-pink-500/30 flex flex-col gap-3">' +
        '<div class="flex flex-wrap items-center justify-between gap-3">' +
          '<div class="flex items-center gap-3">' +
            '<span class="material-symbols-outlined text-pink-400 text-[24px]">system_update_alt</span>' +
            '<div>' +
              '<div class="text-xs sm:text-sm font-extrabold text-on-surface">Update Target Pre-Selected: ' + escapeHtmlSafe(targetTpl ? targetTpl.name : intendedTemplateId) + ' <span class="font-mono text-pink-300">(' + escapeHtmlSafe(intendedTemplateId) + ')</span></div>' +
              '<div class="text-[11px] text-on-surface-variant">Choose your preferred update method below — either upload the full template ZIP or update only changed/new files:</div>' +
            '</div>' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<button type="button" onclick="setUploadUpdatePackageMode(\'full_package\', \'' + escapeQuotes(intendedTemplateId) + '\'); document.getElementById(\'zip-input\').click()" class="px-3.5 py-2 rounded-xl ' + (!isDelta ? 'bg-pink-600 text-white' : 'bg-surface-container-highest text-on-surface') + ' hover:brightness-110 font-bold text-xs cursor-pointer flex items-center gap-1.5">' +
              '<span class="material-symbols-outlined text-[16px]">folder_zip</span>' +
              '<span>1. Upload Full Template .ZIP</span>' +
            '</button>' +
            '<button type="button" onclick="setUploadUpdatePackageMode(\'delta_changed_only\', \'' + escapeQuotes(intendedTemplateId) + '\'); document.getElementById(\'zip-input\').click()" class="px-3.5 py-2 rounded-xl ' + (isDelta ? 'bg-emerald-600 text-white' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40') + ' hover:brightness-110 font-bold text-xs cursor-pointer flex items-center gap-1.5">' +
              '<span class="material-symbols-outlined text-[16px]">bolt</span>' +
              '<span>2. Update Changed/New Files (.ZIP)</span>' +
            '</button>' +
            '<button type="button" onclick="setUploadUpdatePackageMode(\'delta_changed_only\', \'' + escapeQuotes(intendedTemplateId) + '\'); document.getElementById(\'delta-files-input\').click()" class="px-3 py-2 rounded-xl bg-surface-container-highest hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-xs cursor-pointer flex items-center gap-1">' +
              '<span class="material-symbols-outlined text-[15px]">upload_file</span>' +
              '<span>Pick Changed Files</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }
};

window.openUpdateTemplateStudio = function(templateId) {
  window.openSmartImportStudio(templateId);
};

window.cancelSmartRecognitionInFlight = function() {
  if (importStudioState.abortController) {
    try { importStudioState.abortController.abort(); } catch (_) {}
    importStudioState.abortController = null;
  }
  importStudioState.loading = false;
  const { workspace } = ensureSmartImportStudioDomContainers();
  if (workspace) {
    workspace.innerHTML =
      '<div class="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-200">' +
        '<span>⚠️ Package inspection was cancelled. Existing templates were not modified.</span>' +
        '<button type="button" onclick="runSmartTemplateRecognitionStudio()" class="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 font-bold cursor-pointer">Retry Inspection</button>' +
      '</div>';
  }
};

async function runSmartTemplateRecognitionStudio(packageHintName = "") {
  const { workspace } = ensureSmartImportStudioDomContainers();
  if (!workspace) return;
  if (importStudioState.loading) return;

  workspace.classList.remove("hidden");
  importStudioState.loading = true;
  importStudioState.runtimePreviewErrors = [];
  importStudioState.warningsAcknowledged = false;
  importStudioState.resolveConflictConfirmed = false;

  const filename = (currentZipRawFile && currentZipRawFile.name)
    ? currentZipRawFile.name
    : ((packageHintName || "template-package") + ".zip");
  const approxBytes = (currentZipRawFile && currentZipRawFile.size)
    ? currentZipRawFile.size
    : Object.values(currentUploadedFiles).reduce((sum, f) => sum + Number((f && f.sizeBytes) || 0), 0);
  const sizeKb = Math.max(1, Math.round(approxBytes / 1024));

  workspace.innerHTML =
    '<div class="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 flex flex-wrap items-center justify-between gap-3">' +
      '<div class="flex items-center gap-3">' +
        '<span class="material-symbols-outlined text-primary text-[24px] animate-spin">sync</span>' +
        '<div>' +
          '<div class="text-xs sm:text-sm font-extrabold text-on-surface">Inspecting "' + escapeHtmlSafe(filename) + '" (' + sizeKb + ' KB)...</div>' +
          '<div class="text-[11px] text-on-surface-variant">Verifying ZIP security, computing SHA-256 file fingerprints, and matching against registered templates...</div>' +
        '</div>' +
      '</div>' +
      '<button type="button" onclick="cancelSmartRecognitionInFlight()" class="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-bold text-xs cursor-pointer">Cancel</button>' +
    '</div>';

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  importStudioState.abortController = controller;

  try {
    let fetchOptions;
    if (currentZipRawFile && typeof FormData !== "undefined") {
      // For multi-megabyte media ZIPs (>1.5MB), send a compact ~45KB inspection ZIP so mobile inspection completes in <1s
      let fileToUpload = currentZipRawFile;
      if (approxBytes > 1500 * 1024 && Object.keys(currentUploadedFiles).length > 0 && typeof JSZip !== "undefined" && typeof Blob !== "undefined") {
        try {
          const compactBytes = await buildCompactTemplateZipBase64(currentUploadedFiles, null, null, {
            forInspection: true,
            returnUint8Array: true
          });
          if (compactBytes && compactBytes.byteLength > 0) {
            fileToUpload = new Blob([compactBytes], { type: "application/zip" });
          }
        } catch (_) {}
      }
      const formData = new FormData();
      formData.append("file", fileToUpload, filename);
      if (importStudioState.intendedTargetTemplateId) {
        formData.append("intendedTargetTemplateId", importStudioState.intendedTargetTemplateId);
      }
      formData.append("updatePackageMode", importStudioState.updatePackageMode || "full_package");
      fetchOptions = {
        method: "POST",
        credentials: "include",
        body: formData,
        ...(controller ? { signal: controller.signal } : {})
      };
    } else {
      const reqBody = {
        filename,
        intendedTargetTemplateId: importStudioState.intendedTargetTemplateId || null,
        updatePackageMode: importStudioState.updatePackageMode || "full_package"
      };
      if (currentZipBase64) {
        reqBody.zipBase64 = currentZipBase64;
      } else {
        reqBody.files = serializeUploadedFilesToArray(currentUploadedFiles);
        reqBody.filesMap = currentUploadedFiles;
      }
      fetchOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(reqBody),
        ...(controller ? { signal: controller.signal } : {})
      };
    }

    const res = await fetch("/api/templates/import-studio/inspect", fetchOptions);

    const json = await res.json().catch(() => ({}));
    const data = json.data || json;

    if (!data || (!data.sessionId && !res.ok)) {
      throw new Error(data?.error?.message || data?.message || "Failed to inspect template package.");
    }

    importStudioState.sessionId = data.sessionId;
    importStudioState.selectedTargetTemplateId = data.selectedTargetTemplateId || null;
    importStudioState.sessionData = data;
    if (data.updatePackageMode) {
      importStudioState.updatePackageMode = data.updatePackageMode;
      syncUploadModeCardsUI();
    }
    importStudioState.selectedVariant = "default";
    importStudioState.existingVariant = "default";
    importStudioState.stagedVariant = "default";
    importStudioState.newTemplateNameOverride = (data.packageMetadata?.detectedName || "") + " (New)";
    importStudioState.newTemplateSlugOverride = (data.packageMetadata?.detectedSlug || "custom-template") + "-v2";
    importStudioState.newTemplateIdOverride = "tpl_" + importStudioState.newTemplateSlugOverride.replace(/-/g, "_");

    renderSmartImportStudioWorkspace();
  } catch (err) {
    if (err && err.name === "AbortError") return;
    workspace.innerHTML =
      '<div class="p-4 rounded-xl bg-rose-500/15 border border-rose-500/40 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-200">' +
        '<div class="flex items-center gap-2.5">' +
          '<span class="material-symbols-outlined text-rose-400 text-[22px]">error</span>' +
          '<div>' +
            '<div class="font-bold text-rose-300">Package Recognition & Staging Failed</div>' +
            '<div>' + escapeHtmlSafe(err.message || String(err)) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-2">' +
          '<button type="button" onclick="runSmartTemplateRecognitionStudio()" class="px-3.5 py-1.5 rounded-lg bg-rose-500/25 hover:bg-rose-500/40 text-white font-bold cursor-pointer">Retry Inspection</button>' +
        '</div>' +
      '</div>';
  } finally {
    importStudioState.loading = false;
    importStudioState.abortController = null;
  }
}

function getOutcomeBadgePresentation(outcome) {
  switch (outcome) {
    case "EXACT_EXISTING_IDENTITY":
      return {
        icon: "verified",
        label: "EXACT EXISTING IDENTITY MATCH",
        badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
        bannerClass: "bg-emerald-500/10 border-emerald-500/35"
      };
    case "POSSIBLE_EXISTING_MATCH":
      return {
        icon: "find_replace",
        label: "POSSIBLE EXISTING MATCH",
        badgeClass: "bg-cyan-500/20 text-cyan-200 border-cyan-500/40",
        bannerClass: "bg-cyan-500/10 border-cyan-500/35"
      };
    case "MULTIPLE_POSSIBLE_MATCHES":
      return {
        icon: "call_split",
        label: "MULTIPLE POSSIBLE MATCHES — SELECT TARGET",
        badgeClass: "bg-amber-500/20 text-amber-200 border-amber-500/40",
        bannerClass: "bg-amber-500/10 border-amber-500/35"
      };
    case "IDENTITY_CONFLICT":
      return {
        icon: "warning",
        label: "IDENTITY CONFLICT DETECTED",
        badgeClass: "bg-rose-500/25 text-rose-200 border-rose-500/50",
        bannerClass: "bg-rose-500/15 border-rose-500/45"
      };
    case "INVALID_OR_UNSUPPORTED_PACKAGE":
      return {
        icon: "block",
        label: "INVALID OR UNSUPPORTED PACKAGE",
        badgeClass: "bg-rose-500/25 text-rose-200 border-rose-500/50",
        bannerClass: "bg-rose-500/15 border-rose-500/45"
      };
    default:
      return {
        icon: "new_releases",
        label: "NO EXISTING MATCH — NEW TEMPLATE",
        badgeClass: "bg-purple-500/20 text-purple-200 border-purple-500/40",
        bannerClass: "bg-purple-500/10 border-purple-500/35"
      };
  }
}

window.selectImportCandidateTarget = async function(templateId) {
  if (!importStudioState.sessionId) return;
  try {
    if (typeof showToast === "function") showToast("🔄 Loading side-by-side comparison for " + templateId + "...");
    const res = await fetch("/api/templates/import-studio/" + encodeURIComponent(importStudioState.sessionId) + "/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ targetTemplateId: templateId, updatePackageMode: importStudioState.updatePackageMode || "full_package" })
    });
    const json = await res.json().catch(() => ({}));
    const data = json.data || json;
    if (!res.ok || data.success === false) {
      throw new Error(data.error?.message || data.message || "Comparison failed");
    }
    importStudioState.selectedTargetTemplateId = data.selectedTargetTemplateId;
    importStudioState.sessionData = data;
    importStudioState.activeFileDiffPath = null;
    renderSmartImportStudioWorkspace();
  } catch (err) {
    alert("Failed to compare against selected template: " + err.message);
  }
};

window.setSideBySideViewport = function(vp) {
  importStudioState.viewport = vp;
  // Update viewport button active states in-place without destroying/reloading iframes!
  ["desktop", "tablet", "mobile"].forEach(mode => {
    const btn = document.getElementById("sbs-vp-btn-" + mode);
    if (btn) {
      btn.className = "px-2.5 py-1 rounded " + (vp === mode ? "bg-primary text-white" : "text-on-surface-variant") + " cursor-pointer";
    }
  });
  applySideBySideViewportScaling();
};

window.setSideBySideMobileTab = function(tabMode) {
  importStudioState.mobilePanelMode = tabMode;
  const leftCard = document.getElementById("sbs-left-panel-card");
  const rightCard = document.getElementById("sbs-right-panel-card");
  if (leftCard && rightCard) {
    leftCard.className = (tabMode !== "staged" ? "flex" : "hidden lg:flex") + " flex-col gap-2.5 p-3 rounded-xl bg-surface-container-lowest border border-purple-500/25";
    rightCard.className = (tabMode !== "existing" ? "flex" : "hidden lg:flex") + " flex-col gap-2.5 p-3 rounded-xl bg-surface-container-lowest border border-pink-500/30";
    ["both", "existing", "staged"].forEach(m => {
      const b = document.getElementById("sbs-mob-tab-" + m);
      if (b) b.className = "px-2 py-1 rounded " + (tabMode === m ? "bg-primary text-white" : "text-outline") + " cursor-pointer";
    });
    setTimeout(() => { try { applySideBySideViewportScaling(); } catch (_) {} }, 20);
  } else {
    renderSmartImportStudioWorkspace();
  }
};

window.toggleSideBySideSync = function(checked) {
  importStudioState.syncControls = Boolean(checked);
  if (importStudioState.syncControls) {
    importStudioState.existingVariant = importStudioState.selectedVariant;
    importStudioState.stagedVariant = importStudioState.selectedVariant;
  }
};

window.setSideBySideVariant = function(side, variantSlug) {
  if (importStudioState.syncControls || side === "both") {
    importStudioState.selectedVariant = variantSlug;
    importStudioState.existingVariant = variantSlug;
    importStudioState.stagedVariant = variantSlug;
  } else if (side === "existing") {
    importStudioState.existingVariant = variantSlug;
  } else if (side === "staged") {
    importStudioState.stagedVariant = variantSlug;
  }
  refreshSideBySidePreviews();
};

function appendPreviewQueryParams(baseUrl, paramsObj) {
  if (!baseUrl) return null;
  const sep = baseUrl.includes("?") ? "&" : "?";
  const query = Object.entries(paramsObj)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(String(v)))
    .join("&");
  return query ? (baseUrl + sep + query) : baseUrl;
}

function applySideBySideViewportScaling() {
  const vp = importStudioState.viewport || "desktop";
  const targetW = vp === "mobile" ? 375 : (vp === "tablet" ? 768 : 1280);
  const targetH = vp === "mobile" ? 667 : (vp === "tablet" ? 640 : 800);

  ["sbs-existing-preview-iframe", "sbs-staged-preview-iframe"].forEach((iframeId) => {
    const iframe = document.getElementById(iframeId);
    if (!iframe) return;
    const wrap = iframe.parentElement;
    if (!wrap) return;

    const parentEl = wrap.parentElement || wrap;
    const availWidth = Math.max(260, (parentEl.clientWidth || 480) - 8);
    const scale = Math.min(1, availWidth / targetW);
    const scaledW = Math.round(targetW * scale);
    const scaledH = Math.round(targetH * scale);

    wrap.style.display = "block";
    wrap.style.position = "relative";
    wrap.style.width = scaledW + "px";
    wrap.style.maxWidth = "100%";
    wrap.style.height = scaledH + "px";
    wrap.style.margin = "0 auto";
    wrap.style.overflow = "hidden";
    wrap.style.borderRadius = vp === "mobile" ? "24px" : "12px";
    wrap.style.border = vp === "mobile" ? "4px solid rgba(168,85,247,0.45)" : "1px solid rgba(168,85,247,0.3)";
    wrap.style.background = "#090612";

    iframe.style.width = targetW + "px";
    iframe.style.height = targetH + "px";
    iframe.style.transform = scale < 1 ? ("scale(" + scale.toFixed(4) + ")") : "none";
    iframe.style.transformOrigin = "top left";
    iframe.style.border = "0";
    iframe.style.display = "block";
  });
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("resize", () => {
    try { applySideBySideViewportScaling(); } catch (_) {}
  });
}

let _sbsStaggerTimer = null;

function runStaggeredSideBySideLoad(existingUrl, stagedUrl, stagedRel) {
  if (_sbsStaggerTimer) {
    clearTimeout(_sbsStaggerTimer);
    _sbsStaggerTimer = null;
  }

  const stIframe = document.getElementById("sbs-staged-preview-iframe");
  const exIframe = document.getElementById("sbs-existing-preview-iframe");
  const stLoader = document.getElementById("sbs-staged-loader");
  const exLoader = document.getElementById("sbs-existing-loader");

  if (stLoader) {
    stLoader.classList.remove("hidden");
    stLoader.style.opacity = "1";
  }
  if (exLoader && existingUrl) {
    exLoader.classList.remove("hidden");
    exLoader.style.opacity = "1";
  }

  let leftStarted = false;
  const startLeftExistingPreview = () => {
    if (leftStarted) return;
    leftStarted = true;
    if (_sbsStaggerTimer) {
      clearTimeout(_sbsStaggerTimer);
      _sbsStaggerTimer = null;
    }
    if (exIframe && existingUrl) {
      exIframe.onload = () => {
        if (exLoader) {
          exLoader.style.opacity = "0";
          setTimeout(() => { try { exLoader.classList.add("hidden"); } catch (_) {} }, 180);
        }
      };
      exIframe.removeAttribute("srcdoc");
      exIframe.src = existingUrl;
    }
  };

  const hasLocalIndexHtml = Object.keys(currentUploadedFiles).some(k => k.toLowerCase() === "index.html" || k.toLowerCase().endsWith("/index.html"));

  // Phase 1: Render Right (Staged Uploaded ZIP) immediately so admin sees new changes first
  if (stIframe) {
    if (hasLocalIndexHtml && Object.keys(currentUploadedFiles).length > 0) {
      const html = buildClientStagedPreviewHtml(stagedRel || "default");
      mountHtmlIntoPreviewIframe(stIframe, html, {
        loaderId: "sbs-staged-loader",
        allowBlobUrl: false,
        onLoaded: () => {
          // Trigger Left Panel 80ms after Right Panel finishes initial load
          setTimeout(startLeftExistingPreview, 80);
        }
      });
    } else if (stagedUrl) {
      stIframe.onload = () => {
        if (stLoader) {
          stLoader.style.opacity = "0";
          setTimeout(() => { try { stLoader.classList.add("hidden"); } catch (_) {} }, 180);
        }
        setTimeout(startLeftExistingPreview, 80);
      };
      stIframe.removeAttribute("srcdoc");
      stIframe.src = stagedUrl;
    } else {
      startLeftExistingPreview();
    }
  } else {
    startLeftExistingPreview();
  }

  // Fallback timer: ensure Left Panel starts within 180ms even if Right Panel has heavy assets
  _sbsStaggerTimer = setTimeout(startLeftExistingPreview, 180);
  setTimeout(() => { try { applySideBySideViewportScaling(); } catch (_) {} }, 20);
}

window.refreshSideBySidePreviews = function() {
  const sData = importStudioState.sessionData;
  if (!sData) return;
  const ts = Date.now();
  const existingRel = importStudioState.syncControls ? importStudioState.selectedVariant : importStudioState.existingVariant;
  const stagedRel = importStudioState.syncControls ? importStudioState.selectedVariant : importStudioState.stagedVariant;

  const existingUrl = sData.previewUrls?.existing
    ? appendPreviewQueryParams(sData.previewUrls.existing, { rel: existingRel || "default", ui: "1", t: ts })
    : null;
  const stagedUrl = sData.previewUrls?.staged
    ? appendPreviewQueryParams(sData.previewUrls.staged, { rel: stagedRel || "default", ui: "1", t: ts })
    : null;

  runStaggeredSideBySideLoad(existingUrl, stagedUrl, stagedRel || "default");
};

window.resetSideBySidePreviewState = function() {
  importStudioState.viewport = "desktop";
  importStudioState.syncControls = true;
  importStudioState.selectedVariant = "default";
  importStudioState.existingVariant = "default";
  importStudioState.stagedVariant = "default";
  renderSmartImportStudioWorkspace();
};

window.toggleFileDiffViewer = function(filePath) {
  if (importStudioState.activeFileDiffPath === filePath) {
    importStudioState.activeFileDiffPath = null;
  } else {
    importStudioState.activeFileDiffPath = filePath;
  }
  const diffBox = document.getElementById("sbs-active-diff-viewer-box");
  const sData = importStudioState.sessionData;
  if (diffBox && sData) {
    const comp = sData.comparison || {};
    const allDiffFiles = [
      ...(comp.files?.modified || []),
      ...(comp.files?.added || []),
      ...(comp.files?.renamed || []).map(f => ({ ...f, path: f.oldPath + " → " + f.newPath })),
      ...(comp.files?.removed || []),
      ...(comp.files?.unchanged || [])
    ];
    const activeObj = allDiffFiles.find(f => f.path === importStudioState.activeFileDiffPath && f.diff && f.diff.diffText);
    diffBox.innerHTML = activeObj
      ? ('<div class="p-3 rounded-xl bg-black/80 border border-purple-500/30">' +
          '<div class="flex items-center justify-between text-[10px] font-mono text-purple-300 mb-1.5">' +
            '<span>Unified Text Diff — ' + escapeHtmlSafe(activeObj.path) + ' (+' + activeObj.diff.addedLines + ' / -' + activeObj.diff.removedLines + ' lines)</span>' +
            '<button type="button" onclick="toggleFileDiffViewer(\'' + escapeQuotes(activeObj.path) + '\')" class="text-rose-300 hover:underline cursor-pointer">Close Diff</button>' +
          '</div>' +
          '<pre class="text-[10px] font-mono text-emerald-200 overflow-x-auto max-h-56 whitespace-pre">' + escapeHtmlSafe(activeObj.diff.diffText) + '</pre>' +
        '</div>')
      : "";
    return;
  }
  renderSmartImportStudioWorkspace();
};

function renderSmartImportStudioWorkspace() {
  const { workspace } = ensureSmartImportStudioDomContainers();
  const sData = importStudioState.sessionData;
  if (!workspace || !sData) return;

  workspace.classList.remove("hidden");

  const outcomePres = getOutcomeBadgePresentation(sData.recognitionOutcome);
  const pkgMeta = sData.packageMetadata || {};
  const valReport = sData.validation || {};
  const comp = sData.comparison || {};
  const exTpl = sData.existingTemplate || comp.existingTemplate || null;
  const candidates = Array.isArray(sData.candidates) ? sData.candidates : [];
  const conflicts = Array.isArray(sData.conflicts) ? sData.conflicts : [];
  const variantCatalog = Array.isArray(comp.variantCatalog) ? comp.variantCatalog : [];
  const destructiveWarnings = Array.isArray(comp.destructiveWarnings) ? comp.destructiveWarnings : [];
  const filesSummary = comp.files?.summary || { addedCount: 0, modifiedCount: 0, unchangedCount: 0, removedCount: 0, renamedCount: 0, invalidCount: 0 };
  const mDiff = comp.manifestDiff || {};

  // 1. Recognition Header & Package Summary Banner
  const validationPill = valReport.valid
    ? '<span class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">✓ Server Validation Passed</span>'
    : '<span class="px-2.5 py-0.5 rounded-full bg-rose-500/25 text-rose-200 border border-rose-500/50 text-[10px] font-bold">✕ Validation Failed (' + ((valReport.securityErrors?.length || 0) + (valReport.validationErrors?.length || 0)) + ' Error(s))</span>';

  const errorsListHtml = (!valReport.valid)
    ? '<div class="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-[11px] text-rose-200 space-y-1">' +
        '<div class="font-bold uppercase tracking-wider text-[10px] text-rose-300">Blocking Package & Security Errors</div>' +
        [...(valReport.securityErrors || []), ...(valReport.validationErrors || [])].map(e =>
          '<div>• <b>[' + escapeHtmlSafe(e.code || "ERROR") + ']</b> ' + escapeHtmlSafe(e.message) + '</div>'
        ).join("") +
      '</div>'
    : "";

  const conflictsHtml = conflicts.length > 0
    ? '<div class="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/45 text-xs text-rose-200 space-y-2">' +
        '<div class="font-extrabold text-rose-300 flex items-center gap-1.5">' +
          '<span class="material-symbols-outlined text-[18px]">gpp_maybe</span>' +
          '<span>Identity Conflict Detected — Explicit Resolution Required</span>' +
        '</div>' +
        conflicts.map(c => '<div>• <b>[' + escapeHtmlSafe(c.code) + ']</b> ' + escapeHtmlSafe(c.message) + '</div>').join("") +
        '<label class="flex items-center gap-2 pt-1 cursor-pointer font-semibold text-rose-100">' +
          '<input type="checkbox" ' + (importStudioState.resolveConflictConfirmed ? 'checked' : '') + ' onchange="importStudioState.resolveConflictConfirmed = this.checked" class="rounded text-rose-500"/>' +
          '<span>I understand this identity conflict and explicitly confirm preserving the selected target template\'s canonical database ID.</span>' +
        '</label>' +
      '</div>'
    : "";

  // 2. Candidate Selection Cards
  const candidatesHtml = candidates.length > 0
    ? '<div class="flex flex-col gap-2.5">' +
        '<div class="flex items-center justify-between">' +
          '<span class="text-xs font-extrabold uppercase tracking-wider text-on-surface flex items-center gap-1.5">' +
            '<span class="material-symbols-outlined text-primary text-[17px]">manage_search</span>' +
            '<span>Detected Matching Template Candidate(s) (' + candidates.length + ')</span>' +
          '</span>' +
          '<span class="text-[11px] text-outline">Select a candidate to compare side by side</span>' +
        '</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
          candidates.map(cand => {
            const isSelected = cand.templateId === importStudioState.selectedTargetTemplateId;
            return (
              '<div class="p-3 rounded-xl border transition flex items-start justify-between gap-3 ' +
                (isSelected ? 'border-primary bg-primary/10 shadow-md' : 'border-purple-500/25 bg-surface-container hover:bg-surface-container-high') + '">' +
                '<div class="flex items-start gap-3 min-w-0">' +
                  '<img src="' + escapeHtmlSafe(cand.thumbnail || '/assets/file_ab2082.png') + '" alt="' + escapeHtmlSafe(cand.name) + '" class="w-16 h-12 rounded-lg object-cover border border-purple-500/30 shrink-0" onerror="this.src=\'/assets/file_ab2082.png\'"/>' +
                  '<div class="min-w-0 space-y-1">' +
                    '<div class="flex flex-wrap items-center gap-1.5">' +
                      '<span class="font-bold text-xs sm:text-sm text-on-surface">' + escapeHtmlSafe(cand.name) + '</span>' +
                      '<span class="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ' + (cand.status === "published" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300") + '">' + escapeHtmlSafe(cand.status) + '</span>' +
                      '<span class="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 font-mono text-[9px] font-bold">' + escapeHtmlSafe(cand.currentVersionLabel || "v1.0.0") + '</span>' +
                    '</div>' +
                    '<div class="text-[10px] font-mono text-primary">ID: ' + escapeHtmlSafe(cand.templateId) + ' • Slug: /' + escapeHtmlSafe(cand.slug) + ' • Updated: ' + escapeHtmlSafe(formatDate(cand.updatedAt)) + '</div>' +
                    '<div class="flex flex-wrap gap-1 pt-0.5">' +
                      (cand.evidenceCategories || []).map(ev =>
                        '<span class="px-1.5 py-0.2 rounded bg-surface-container-highest text-cyan-300 font-mono text-[9px] font-bold">✓ ' + escapeHtmlSafe(ev) + '</span>'
                      ).join("") +
                    '</div>' +
                    '<div class="text-[10px] text-on-surface-variant space-y-0.5">' +
                      (cand.reasons || []).map(r => '<div>• ' + escapeHtmlSafe(r) + '</div>').join("") +
                    '</div>' +
                  '</div>' +
                '</div>' +
                '<button type="button" onclick="selectImportCandidateTarget(\'' + escapeQuotes(cand.templateId) + '\')" class="px-3 py-1.5 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer transition ' +
                  (isSelected ? 'bg-primary text-white shadow' : 'bg-surface-container-highest hover:bg-primary/20 text-on-surface') + '">' +
                  (isSelected ? '✓ Active Target' : 'Select & Compare') +
                '</button>' +
              '</div>'
            );
          }).join("") +
        '</div>' +
      '</div>'
    : "";

  // 3. Side-by-Side Preview Controls & Two-Column Workspace
  const vpHeightClass = importStudioState.viewport === "mobile"
    ? "w-[360px] max-w-full h-[560px] mx-auto rounded-[28px] border-4 border-purple-900/80"
    : (importStudioState.viewport === "tablet"
        ? "w-[680px] max-w-full h-[520px] mx-auto rounded-2xl border-2 border-purple-500/40"
        : "w-full h-[420px] rounded-xl border border-purple-500/35");

  const variantOptionsHtml = '<option value="default">Default / Primary Edition</option>' +
    variantCatalog.map(vc => {
      const badgeText = vc.statusBadge === "NEW_ONLY"
        ? " [NEW IN UPLOADED ZIP]"
        : (vc.statusBadge === "REMOVED_IN_NEW" ? " [MISSING IN UPLOADED ZIP]" : " [IN BOTH]");
      const isSel = importStudioState.selectedVariant === vc.slug;
      return '<option value="' + escapeHtmlSafe(vc.slug) + '" ' + (isSel ? 'selected' : '') + '>' +
        escapeHtmlSafe(vc.label) + ' (' + escapeHtmlSafe(vc.slug) + ')' + badgeText +
      '</option>';
    }).join("");

  const previewDiag = valReport.previewDiagnostics || {};
  const allDiagIssues = [
    ...(previewDiag.missingAssets || []).map(a => a.message),
    ...(previewDiag.brokenLinks || []).map(b => b.message),
    ...(previewDiag.invalidVariants || []).map(iv => "Invalid variant " + (iv.id || "") + ": " + (iv.errors || []).join("; ")),
    ...importStudioState.runtimePreviewErrors
  ];

  const previewDiagnosticsHtml = allDiagIssues.length > 0
    ? '<div class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 space-y-1">' +
        '<div class="flex items-center justify-between">' +
          '<span class="font-bold uppercase tracking-wider text-[10px] text-amber-300">⚠️ Sandboxed Preview Diagnostics (' + allDiagIssues.length + ')</span>' +
          '<button type="button" onclick="refreshSideBySidePreviews()" class="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 font-bold text-[10px] cursor-pointer">Retry Preview</button>' +
        '</div>' +
        allDiagIssues.map(msg => '<div>• ' + escapeHtmlSafe(msg) + '</div>').join("") +
      '</div>'
    : "";

  const ts = Date.now();
  const existingRel = importStudioState.syncControls ? importStudioState.selectedVariant : importStudioState.existingVariant;
  const stagedRel = importStudioState.syncControls ? importStudioState.selectedVariant : importStudioState.stagedVariant;
  const existingIframeUrl = sData.previewUrls?.existing
    ? appendPreviewQueryParams(sData.previewUrls.existing, { rel: existingRel || "default", ui: "1", t: ts })
    : null;
  const stagedIframeUrl = sData.previewUrls?.staged
    ? appendPreviewQueryParams(sData.previewUrls.staged, { rel: stagedRel || "default", ui: "1", t: ts })
    : null;

  const showLeftPanel = importStudioState.mobilePanelMode !== "staged";
  const showRightPanel = importStudioState.mobilePanelMode !== "existing";

  const sideBySidePreviewHtml =
    '<div id="side-by-side-preview-studio" class="flex flex-col gap-3 p-3.5 rounded-2xl bg-surface-container border border-purple-500/30">' +
      '<div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-purple-500/20">' +
        '<div class="flex items-center gap-2">' +
          '<span class="material-symbols-outlined text-primary text-[20px]">compare</span>' +
          '<div>' +
            '<h4 class="text-xs sm:text-sm font-extrabold text-on-surface">Side-by-Side Sandboxed Preview Studio</h4>' +
            '<span class="text-[10px] text-outline">Isolated iframe rendering (CSP enforced • zero admin token/DOM access)</span>' +
          '</div>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<!-- Mobile Panel Switcher -->' +
          '<div class="flex lg:hidden items-center bg-surface-container-lowest p-0.5 rounded-lg border border-purple-500/20 text-[10px] font-bold">' +
            '<button type="button" onclick="setSideBySideMobileTab(\'both\')" class="px-2 py-1 rounded ' + (importStudioState.mobilePanelMode === "both" ? "bg-primary text-white" : "text-outline") + ' cursor-pointer">Stacked</button>' +
            '<button type="button" onclick="setSideBySideMobileTab(\'existing\')" class="px-2 py-1 rounded ' + (importStudioState.mobilePanelMode === "existing" ? "bg-primary text-white" : "text-outline") + ' cursor-pointer">Existing</button>' +
            '<button type="button" onclick="setSideBySideMobileTab(\'staged\')" class="px-2 py-1 rounded ' + (importStudioState.mobilePanelMode === "staged" ? "bg-primary text-white" : "text-outline") + ' cursor-pointer">Uploaded</button>' +
          '</div>' +
          '<!-- Viewport Toggles -->' +
          '<div class="flex items-center bg-surface-container-lowest p-0.5 rounded-lg border border-purple-500/20 text-[11px] font-bold">' +
            '<button type="button" onclick="setSideBySideViewport(\'desktop\')" class="px-2.5 py-1 rounded ' + (importStudioState.viewport === "desktop" ? "bg-primary text-white" : "text-on-surface-variant") + ' cursor-pointer" title="Desktop Preview">🖥️ Desktop</button>' +
            '<button type="button" onclick="setSideBySideViewport(\'tablet\')" class="px-2.5 py-1 rounded ' + (importStudioState.viewport === "tablet" ? "bg-primary text-white" : "text-on-surface-variant") + ' cursor-pointer" title="Tablet Preview">📱 Tablet</button>' +
            '<button type="button" onclick="setSideBySideViewport(\'mobile\')" class="px-2.5 py-1 rounded ' + (importStudioState.viewport === "mobile" ? "bg-primary text-white" : "text-on-surface-variant") + ' cursor-pointer" title="Mobile Preview">📲 Mobile</button>' +
          '</div>' +
          '<!-- Variant Selector -->' +
          '<select id="sbs-variant-select" onchange="setSideBySideVariant(\'both\', this.value)" class="px-2.5 py-1 rounded-lg bg-surface-container-lowest border border-purple-500/30 text-[11px] text-on-surface font-semibold">' +
            variantOptionsHtml +
          '</select>' +
          '<label class="flex items-center gap-1 text-[11px] font-semibold text-on-surface-variant cursor-pointer">' +
            '<input type="checkbox" ' + (importStudioState.syncControls ? "checked" : "") + ' onchange="toggleSideBySideSync(this.checked)" class="rounded text-primary w-3.5 h-3.5"/>' +
            '<span>Sync</span>' +
          '</label>' +
          '<button type="button" onclick="refreshSideBySidePreviews()" class="px-2.5 py-1 rounded-lg bg-surface-container-highest hover:bg-primary/20 text-on-surface text-[11px] font-bold cursor-pointer flex items-center gap-1" title="Refresh Both Previews">' +
            '<span class="material-symbols-outlined text-[14px]">refresh</span><span>Refresh</span>' +
          '</button>' +
          '<button type="button" onclick="resetSideBySidePreviewState()" class="px-2 py-1 rounded-lg bg-surface-container-highest hover:bg-surface-container-high text-outline hover:text-on-surface text-[11px] font-semibold cursor-pointer" title="Reset Preview Controls">Reset</button>' +
        '</div>' +
      '</div>' +
      previewDiagnosticsHtml +
      '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">' +
        '<!-- LEFT PANEL: EXISTING PUBLISHED TEMPLATE -->' +
        '<div id="sbs-left-panel-card" class="' + (showLeftPanel ? "flex" : "hidden lg:flex") + ' flex-col gap-2.5 p-3 rounded-xl bg-surface-container-lowest border border-purple-500/25">' +
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
            '<div>' +
              '<div class="flex items-center gap-1.5">' +
                '<span class="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold text-[10px] uppercase">Left • Existing Published</span>' +
                '<span class="font-bold text-xs text-on-surface">' + escapeHtmlSafe(exTpl ? exTpl.name : "No Existing Template Matched") + '</span>' +
              '</div>' +
              '<div class="text-[10px] font-mono text-outline mt-0.5">' +
                (exTpl
                  ? ('ID: ' + escapeHtmlSafe(exTpl.id) + ' • Slug: /' + escapeHtmlSafe(exTpl.slug) + ' • Version: ' + escapeHtmlSafe(exTpl.currentVersionLabel || "v1.0.0"))
                  : 'Select an existing template above or proceed with Create New Template') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="w-full bg-[#0c0618] p-1 rounded-xl overflow-hidden flex items-center justify-center relative">' +
            (existingIframeUrl
              ? '<div class="relative w-full flex items-center justify-center">' +
                  '<div id="sbs-existing-loader" class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#090612]/90 backdrop-blur-sm transition-opacity duration-200 pointer-events-none">' +
                    '<span class="material-symbols-outlined text-indigo-400 text-[24px] animate-spin mb-1.5">sync</span>' +
                    '<span class="text-[11px] font-bold text-indigo-200">Loading Published Version...</span>' +
                  '</div>' +
                  '<iframe id="sbs-existing-preview-iframe" data-deferred-src="' + escapeHtmlSafe(existingIframeUrl) + '" class="' + vpHeightClass + ' bg-black" sandbox="allow-scripts" referrerpolicy="no-referrer" title="Existing Published Template Preview"></iframe>' +
                '</div>'
              : '<div class="h-[360px] flex flex-col items-center justify-center text-center p-6 text-outline text-xs">' +
                  '<span class="material-symbols-outlined text-[32px] mb-2 opacity-50">web_asset_off</span>' +
                  '<span>No existing published template selected for comparison.</span>' +
                '</div>') +
          '</div>' +
          (exTpl
            ? '<div class="grid grid-cols-4 gap-1.5 text-[10px] text-center pt-1">' +
                '<div class="p-1.5 rounded bg-surface-container"><div class="text-outline">Variants</div><div class="font-bold text-on-surface">' + ((exTpl.variants || []).length) + '</div></div>' +
                '<div class="p-1.5 rounded bg-surface-container"><div class="text-outline">Sections</div><div class="font-bold text-on-surface">' + ((exTpl.sections || []).length) + '</div></div>' +
                '<div class="p-1.5 rounded bg-surface-container"><div class="text-outline">Fields</div><div class="font-bold text-on-surface">' + ((exTpl.fields || []).length) + '</div></div>' +
                '<div class="p-1.5 rounded bg-surface-container"><div class="text-outline">Actions</div><div class="font-bold text-on-surface">' + ((exTpl.actions || []).length) + '</div></div>' +
              '</div>'
            : '') +
        '</div>' +
        '<!-- RIGHT PANEL: UPLOADED ZIP PACKAGE (STAGED) -->' +
        '<div id="sbs-right-panel-card" class="' + (showRightPanel ? "flex" : "hidden lg:flex") + ' flex-col gap-2.5 p-3 rounded-xl bg-surface-container-lowest border border-pink-500/30">' +
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
            '<div>' +
              '<div class="flex items-center gap-1.5">' +
                '<span class="px-2 py-0.5 rounded bg-pink-500/20 text-pink-300 font-bold text-[10px] uppercase">Right • Uploaded ZIP (Staged)</span>' +
                '<span class="font-bold text-xs text-on-surface">' + escapeHtmlSafe(pkgMeta.detectedName || pkgMeta.filename || "Uploaded Package") + '</span>' +
              '</div>' +
              '<div class="text-[10px] font-mono text-outline mt-0.5">' +
                'Detected ID: ' + escapeHtmlSafe(pkgMeta.detectedId || "none") +
                ' • Declared Ver: ' + escapeHtmlSafe(pkgMeta.declaredVersion || "auto") +
                ' • UTP Schema: v' + escapeHtmlSafe(pkgMeta.schemaVersion || "1.0.0") +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="w-full bg-[#0c0618] p-1 rounded-xl overflow-hidden flex items-center justify-center relative">' +
            ((stagedIframeUrl || Object.keys(currentUploadedFiles).length > 0)
              ? '<div class="relative w-full flex items-center justify-center">' +
                  '<div id="sbs-staged-loader" class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#090612]/90 backdrop-blur-sm transition-opacity duration-200 pointer-events-none">' +
                    '<span class="material-symbols-outlined text-pink-400 text-[24px] animate-spin mb-1.5">sync</span>' +
                    '<span class="text-[11px] font-bold text-pink-200">Rendering Uploaded ZIP...</span>' +
                  '</div>' +
                  '<iframe id="sbs-staged-preview-iframe" class="' + vpHeightClass + ' bg-black" sandbox="allow-scripts" referrerpolicy="no-referrer" title="Staged Uploaded Package Preview"></iframe>' +
                '</div>'
              : '<div class="h-[360px] flex flex-col items-center justify-center text-center p-6 text-rose-300 text-xs">' +
                  '<span class="material-symbols-outlined text-[32px] mb-2">error</span>' +
                  '<span>Uploaded package cannot be safely rendered: ' + escapeHtmlSafe(valReport.errorMessage || "Invalid package structure") + '</span>' +
                '</div>') +
          '</div>' +
          '<div class="grid grid-cols-4 gap-1.5 text-[10px] text-center pt-1">' +
            '<div class="p-1.5 rounded bg-surface-container"><div class="text-outline">Variants</div><div class="font-bold text-pink-300">' + ((sData.manifest?.variants || []).length) + '</div></div>' +
            '<div class="p-1.5 rounded bg-surface-container"><div class="text-outline">Sections</div><div class="font-bold text-pink-300">' + ((sData.manifest?.sections || []).length) + '</div></div>' +
            '<div class="p-1.5 rounded bg-surface-container"><div class="text-outline">Fields</div><div class="font-bold text-pink-300">' + ((sData.manifest?.fields || []).length) + '</div></div>' +
            '<div class="p-1.5 rounded bg-surface-container"><div class="text-outline">Actions</div><div class="font-bold text-pink-300">' + ((sData.manifest?.actions || []).length) + '</div></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // 4. Destructive-Change Warnings & File / Configuration Comparison Panel
  const destructiveWarningsHtml = destructiveWarnings.length > 0
    ? '<div class="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/45 text-xs text-amber-100 space-y-2">' +
        '<div class="flex items-center justify-between">' +
          '<span class="font-extrabold text-amber-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">' +
            '<span class="material-symbols-outlined text-[18px]">warning</span>' +
            '<span>Destructive / Removal Warnings (' + destructiveWarnings.length + ')</span>' +
          '</span>' +
          '<span class="text-[10px] font-mono text-emerald-300">Existing Published Wishes Remain Protected</span>' +
        '</div>' +
        '<div class="space-y-1.5 text-[11px]">' +
          destructiveWarnings.map(w =>
            '<div class="p-2 rounded-lg bg-black/30 border border-amber-500/30">' +
              '<div class="font-bold text-amber-200">• [' + escapeHtmlSafe(w.code) + '] ' + escapeHtmlSafe(w.message) + '</div>' +
              '<div class="text-[10px] text-amber-100/80 mt-0.5"><b>Future Wishes:</b> ' + escapeHtmlSafe(w.futureWishesImpact) + ' | <b>Existing Wishes:</b> ' + escapeHtmlSafe(w.existingWishesImpact) + '</div>' +
            '</div>'
          ).join("") +
        '</div>' +
        '<label class="flex items-center gap-2 pt-1 cursor-pointer font-bold text-amber-200">' +
          '<input type="checkbox" ' + (importStudioState.warningsAcknowledged ? 'checked' : '') + ' onchange="importStudioState.warningsAcknowledged = this.checked" class="rounded text-amber-500"/>' +
          '<span>I acknowledge these removals and confirm that only future wishes should use the updated configuration.</span>' +
        '</label>' +
      '</div>'
    : "";

  const isDeltaModeActive = (sData.updatePackageMode || importStudioState.updatePackageMode) === "delta_changed_only";
  const allDiffFiles = [
    ...(comp.files?.modified || []).map(f => ({ ...f, badge: isDeltaModeActive ? "MODIFIED • WILL UPDATE" : "MODIFIED", badgeClass: "bg-amber-500/20 text-amber-300" })),
    ...(comp.files?.added || []).map(f => ({ ...f, badge: isDeltaModeActive ? "NEW • WILL ADD" : "ADDED", badgeClass: "bg-emerald-500/20 text-emerald-300" })),
    ...(comp.files?.renamed || []).map(f => ({ ...f, path: f.oldPath + " → " + f.newPath, badge: "RENAMED", badgeClass: "bg-cyan-500/20 text-cyan-300" })),
    ...(comp.files?.removed || []).map(f => ({ ...f, badge: "REMOVED", badgeClass: "bg-rose-500/20 text-rose-300" })),
    ...(comp.files?.unchanged || []).map(f => ({
      ...f,
      badge: isDeltaModeActive ? "UNCHANGED • REUSED (SKIP UPLOAD)" : "UNCHANGED",
      badgeClass: isDeltaModeActive ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-surface-container-highest text-outline"
    }))
  ];

  const activeDiffFileObj = allDiffFiles.find(f => f.path === importStudioState.activeFileDiffPath && f.diff && f.diff.diffText);

  const comparisonPanelHtml =
    '<div class="p-3.5 rounded-2xl bg-surface-container border border-purple-500/25 flex flex-col gap-3">' +
      '<div class="flex flex-wrap items-center justify-between gap-2">' +
        '<span class="text-xs font-extrabold uppercase tracking-wider text-on-surface flex items-center gap-1.5">' +
          '<span class="material-symbols-outlined text-secondary text-[18px]">difference</span>' +
          '<span>Automatic File & UTP v1.2.0 Configuration Comparison</span>' +
        '</span>' +
        '<div class="flex flex-wrap gap-1.5 text-[10px] font-mono font-bold">' +
          '<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">+' + filesSummary.addedCount + ' Added</span>' +
          '<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">~' + filesSummary.modifiedCount + ' Modified</span>' +
          '<span class="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">⇄' + filesSummary.renamedCount + ' Renamed</span>' +
          '<span class="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">-' + filesSummary.removedCount + ' Removed</span>' +
          '<span class="px-2 py-0.5 rounded bg-surface-container-highest text-outline">=' + filesSummary.unchangedCount + ' Unchanged</span>' +
        '</div>' +
      '</div>' +
      '<!-- Structural Manifest Diff Summary Cards -->' +
      '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">' +
        '<div class="p-2.5 rounded-xl bg-surface-container-lowest border border-purple-500/20">' +
          '<div class="text-[10px] font-bold uppercase text-outline">Relationship Variants</div>' +
          '<div class="font-bold text-on-surface mt-0.5">' + (mDiff.variants?.existingCount ?? 0) + ' → ' + (mDiff.variants?.newCount ?? ((sData.manifest?.variants || []).length)) + '</div>' +
          '<div class="text-[10px] font-mono text-emerald-300">+' + ((mDiff.variants?.added || []).length) + ' ~' + ((mDiff.variants?.modified || []).length) + ' -' + ((mDiff.variants?.removed || []).length) + '</div>' +
        '</div>' +
        '<div class="p-2.5 rounded-xl bg-surface-container-lowest border border-purple-500/20">' +
          '<div class="text-[10px] font-bold uppercase text-outline">Sections & Subsections</div>' +
          '<div class="font-bold text-on-surface mt-0.5">' + (mDiff.sections?.existingCount ?? 0) + ' → ' + (mDiff.sections?.newCount ?? 0) + ' (' + (mDiff.sections?.newSubsectionCount ?? 0) + ' subs)</div>' +
          '<div class="text-[10px] font-mono text-cyan-300">+' + ((mDiff.sections?.added || []).length) + ' ~' + ((mDiff.sections?.modified || []).length) + ' -' + ((mDiff.sections?.removed || []).length) + '</div>' +
        '</div>' +
        '<div class="p-2.5 rounded-xl bg-surface-container-lowest border border-purple-500/20">' +
          '<div class="text-[10px] font-bold uppercase text-outline">Customizer Fields</div>' +
          '<div class="font-bold text-on-surface mt-0.5">' + (mDiff.fields?.existingCount ?? 0) + ' → ' + (mDiff.fields?.newCount ?? ((sData.manifest?.fields || []).length)) + '</div>' +
          '<div class="text-[10px] font-mono text-purple-300">+' + ((mDiff.fields?.added || []).length) + ' ~' + ((mDiff.fields?.modified || []).length) + ' -' + ((mDiff.fields?.removed || []).length) + '</div>' +
        '</div>' +
        '<div class="p-2.5 rounded-xl bg-surface-container-lowest border border-purple-500/20">' +
          '<div class="text-[10px] font-bold uppercase text-outline">Configurable Actions</div>' +
          '<div class="font-bold text-on-surface mt-0.5">' + (mDiff.actions?.existingCount ?? 0) + ' → ' + (mDiff.actions?.newCount ?? ((sData.manifest?.actions || []).length)) + '</div>' +
          '<div class="text-[10px] font-mono text-pink-300">+' + ((mDiff.actions?.added || []).length) + ' ~' + ((mDiff.actions?.modified || []).length) + ' -' + ((mDiff.actions?.removed || []).length) + '</div>' +
        '</div>' +
      '</div>' +
      '<!-- File List with Text Diff Button -->' +
      '<div class="max-h-44 overflow-y-auto border border-purple-500/20 rounded-xl divide-y divide-purple-900/20 bg-surface-container-lowest/70 text-[11px]">' +
        allDiffFiles.map(f =>
          '<div class="px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-surface-container">' +
            '<div class="flex items-center gap-2 min-w-0">' +
              '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold font-mono ' + f.badgeClass + '">' + f.badge + '</span>' +
              '<span class="font-mono text-on-surface truncate">' + escapeHtmlSafe(f.path) + '</span>' +
              '<span class="text-[10px] text-outline font-mono">' + Math.max(1, Math.round((f.newSizeBytes || f.sizeBytes || 0) / 1024)) + ' KB</span>' +
            '</div>' +
            (f.diff && f.diff.diffText
              ? '<button type="button" onclick="toggleFileDiffViewer(\'' + escapeQuotes(f.path) + '\')" class="px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/35 text-purple-200 font-mono text-[10px] font-bold cursor-pointer">' +
                  (importStudioState.activeFileDiffPath === f.path ? 'Hide Diff' : 'Inspect Diff') +
                '</button>'
              : '') +
          '</div>'
        ).join("") +
      '</div>' +
      '<div id="sbs-active-diff-viewer-box">' +
      (activeDiffFileObj
        ? '<div class="p-3 rounded-xl bg-black/80 border border-purple-500/30">' +
            '<div class="flex items-center justify-between text-[10px] font-mono text-purple-300 mb-1.5">' +
              '<span>Unified Text Diff — ' + escapeHtmlSafe(activeDiffFileObj.path) + ' (+' + activeDiffFileObj.diff.addedLines + ' / -' + activeDiffFileObj.diff.removedLines + ' lines)</span>' +
              '<button type="button" onclick="toggleFileDiffViewer(\'' + escapeQuotes(activeDiffFileObj.path) + '\')" class="text-rose-300 hover:underline cursor-pointer">Close Diff</button>' +
            '</div>' +
            '<pre class="text-[10px] font-mono text-emerald-200 overflow-x-auto max-h-56 whitespace-pre">' + escapeHtmlSafe(activeDiffFileObj.diff.diffText) + '</pre>' +
          '</div>'
        : '') +
      '</div>' +
      (Array.isArray(sData.proposedLinkMappings || comp.proposedLinkMappings) && (sData.proposedLinkMappings || comp.proposedLinkMappings).length > 0
        ? '<div class="pt-2 border-t border-purple-500/20 space-y-2">' +
            '<div class="flex flex-wrap items-center justify-between gap-2">' +
              '<span class="text-[11px] font-extrabold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">' +
                '<span class="material-symbols-outlined text-[16px]">link</span>' +
                '<span>UTP v1.3.0 Detected Buttons &amp; Proposed Central Link Mappings (' + (sData.proposedLinkMappings || comp.proposedLinkMappings).length + ')</span>' +
              '</span>' +
              '<span class="text-[10px] text-outline">Global buttons resolve via Central Link Manager • Template buttons open this template\'s creation flow</span>' +
            '</div>' +
            '<div class="overflow-x-auto rounded-xl border border-purple-500/20 bg-surface-container-lowest/80">' +
              '<table class="w-full text-left text-[11px]">' +
                '<thead class="bg-surface-container text-[10px] uppercase text-outline border-b border-purple-500/20">' +
                  '<tr>' +
                    '<th class="py-1.5 px-2.5">Button Label</th>' +
                    '<th class="py-1.5 px-2.5">Action / Element ID</th>' +
                    '<th class="py-1.5 px-2.5">Original Target</th>' +
                    '<th class="py-1.5 px-2.5">Detected Category</th>' +
                    '<th class="py-1.5 px-2.5">Proposed Destination</th>' +
                    '<th class="py-1.5 px-2.5">Status / Evidence</th>' +
                  '</tr>' +
                '</thead>' +
                '<tbody class="divide-y divide-purple-900/20">' +
                  (sData.proposedLinkMappings || comp.proposedLinkMappings).map(pm =>
                    '<tr>' +
                      '<td class="py-1.5 px-2.5 font-bold text-on-surface">' + escapeHtmlSafe(pm.label || "—") + '</td>' +
                      '<td class="py-1.5 px-2.5 font-mono text-primary">' + escapeHtmlSafe(pm.actionId || pm.elementId || "—") + '</td>' +
                      '<td class="py-1.5 px-2.5 font-mono text-outline">' + escapeHtmlSafe(pm.originalTarget || "—") + '</td>' +
                      '<td class="py-1.5 px-2.5"><span class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 font-mono text-[10px] font-bold">' + escapeHtmlSafe(pm.detectedActionType || pm.category || "—") + '</span></td>' +
                      '<td class="py-1.5 px-2.5 font-mono text-emerald-300 font-bold">' + escapeHtmlSafe(pm.logicalLink || pm.proposedTarget || "—") + '</td>' +
                      '<td class="py-1.5 px-2.5">' +
                        (pm.requiresAdminConfirmation
                          ? '<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 font-bold text-[10px]">⚠️ Review Needed: ' + escapeHtmlSafe(pm.evidence || "Ambiguous button intent") + '</span>'
                          : '<span class="text-emerald-300 text-[10px]">✓ ' + escapeHtmlSafe(pm.evidence || "Validated") + '</span>') +
                      '</td>' +
                    '</tr>'
                  ).join("") +
                '</tbody>' +
              '</table>' +
            '</div>' +
          '</div>'
        : '') +
    '</div>';

  // 5. Manual Decision Bar & 2-Option Update Mode Selector (Full Package vs Changed/New Files Only)
  const canUpdateExisting = Boolean(valReport.valid && importStudioState.selectedTargetTemplateId);
  const canCreateNew = Boolean(valReport.valid);
  const changedAndNewCount = Number(filesSummary.modifiedCount || 0) + Number(filesSummary.addedCount || 0) + Number(filesSummary.renamedCount || 0);
  const unchangedReusedCount = Number(filesSummary.unchangedCount || 0);
  const totalPackageFilesCount = changedAndNewCount + unchangedReusedCount;

  const updateModeSelectorCardHtml = exTpl
    ? '<div class="p-3.5 rounded-2xl bg-surface-container border border-purple-500/35 flex flex-col gap-2.5">' +
        '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<span class="text-xs font-extrabold uppercase tracking-wider text-on-surface flex items-center gap-1.5">' +
            '<span class="material-symbols-outlined text-primary text-[18px]">tune</span>' +
            '<span>Choose Update Method for "' + escapeHtmlSafe(exTpl.name) + '" (2 Options)</span>' +
          '</span>' +
          '<span class="text-[11px] font-bold ' + (isDeltaModeActive ? 'text-emerald-300' : 'text-purple-200') + '">' +
            (isDeltaModeActive
              ? ('⚡ Active: Updating ONLY ' + changedAndNewCount + ' changed/new file(s) • Reusing ' + unchangedReusedCount + ' unchanged file(s)')
              : ('📦 Active: Uploading full template package (' + totalPackageFilesCount + ' file(s))')) +
          '</span>' +
        '</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
          '<button type="button" onclick="setUploadUpdatePackageMode(\'full_package\')" class="p-3 rounded-xl border text-left transition cursor-pointer flex items-start gap-2.5 ' +
            (!isDeltaModeActive ? 'border-2 border-primary bg-primary/15 shadow-md' : 'border-purple-500/25 bg-surface-container-lowest hover:bg-surface-container-high') + '">' +
            '<span class="material-symbols-outlined text-primary text-[20px] mt-0.5">folder_zip</span>' +
            '<div class="flex-1 min-w-0">' +
              '<div class="flex items-center justify-between gap-2">' +
                '<span class="text-xs font-extrabold text-on-surface">Option 1: Full Template ZIP Upload</span>' +
                '<span class="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ' + (!isDeltaModeActive ? 'bg-primary text-white' : 'bg-surface-container-highest text-outline') + '">' + (!isDeltaModeActive ? '✓ Selected' : 'Select') + '</span>' +
              '</div>' +
              '<p class="text-[11px] text-on-surface-variant mt-0.5">Poora template ZIP upload karein (' + totalPackageFilesCount + ' files). Saari files naye version me fresh upload hongi.</p>' +
            '</div>' +
          '</button>' +
          '<button type="button" onclick="setUploadUpdatePackageMode(\'delta_changed_only\')" class="p-3 rounded-xl border text-left transition cursor-pointer flex items-start gap-2.5 ' +
            (isDeltaModeActive ? 'border-2 border-emerald-500 bg-emerald-500/15 shadow-md' : 'border-purple-500/25 bg-surface-container-lowest hover:bg-surface-container-high') + '">' +
            '<span class="material-symbols-outlined text-emerald-400 text-[20px] mt-0.5">bolt</span>' +
            '<div class="flex-1 min-w-0">' +
              '<div class="flex items-center justify-between gap-2">' +
                '<span class="text-xs font-extrabold text-on-surface">Option 2: Only Changed &amp; New Files Update</span>' +
                '<span class="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ' + (isDeltaModeActive ? 'bg-emerald-500 text-purple-950 font-black' : 'bg-emerald-500/20 text-emerald-300') + '">' + (isDeltaModeActive ? '✓ Selected' : 'Select') + '</span>' +
              '</div>' +
              '<p class="text-[11px] text-on-surface-variant mt-0.5">Sirf <b>' + changedAndNewCount + ' changed/new file(s)</b> (' + filesSummary.modifiedCount + ' modified, ' + filesSummary.addedCount + ' new) update hongi • <b>' + unchangedReusedCount + ' unchanged file(s)</b> reuse hongi!</p>' +
            '</div>' +
          '</button>' +
        '</div>' +
      '</div>'
    : '';

  const decisionBarHtml =
    updateModeSelectorCardHtml +
    '<div class="p-4 rounded-2xl bg-gradient-to-r from-surface-container via-purple-950/30 to-surface-container border border-purple-500/40 flex flex-col gap-3">' +
      '<div class="flex flex-wrap items-center justify-between gap-2">' +
        '<div>' +
          '<h4 class="text-xs sm:text-sm font-extrabold text-on-surface">Manual Administrator Decision Required</h4>' +
          '<p class="text-[11px] text-on-surface-variant">WishMagic never overwrites a live template automatically. Choose whether to update the selected template (Full ZIP or Changed/New Files Only), create a new template, or cancel.</p>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<button type="button" onclick="cancelActiveImportStudioSession()" class="px-4 py-2 rounded-xl bg-surface-container-highest hover:bg-rose-500/20 text-on-surface hover:text-rose-200 font-bold text-xs transition cursor-pointer flex items-center gap-1.5">' +
            '<span class="material-symbols-outlined text-[16px]">cancel</span>' +
            '<span>Cancel Import</span>' +
          '</button>' +
          '<button type="button" ' + (!canCreateNew ? 'disabled' : '') + ' onclick="promptImportStudioDecision(\'create_new\')" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center gap-1.5">' +
            '<span class="material-symbols-outlined text-[16px]">add_circle</span>' +
            '<span>Create New Template</span>' +
          '</button>' +
          '<button type="button" ' + (!canUpdateExisting ? 'disabled' : '') + ' onclick="promptImportStudioDecision(\'update_existing\', \'full_package\')" class="px-4 py-2 rounded-xl ' + (!isDeltaModeActive ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white font-extrabold shadow-lg' : 'bg-surface-container-highest hover:bg-purple-500/25 text-on-surface font-bold border border-purple-500/30') + ' disabled:opacity-40 disabled:cursor-not-allowed text-xs transition cursor-pointer flex items-center gap-1.5">' +
            '<span class="material-symbols-outlined text-[16px]">folder_zip</span>' +
            '<span>1. Update Full Template ZIP</span>' +
          '</button>' +
          '<button type="button" ' + (!canUpdateExisting ? 'disabled' : '') + ' onclick="promptImportStudioDecision(\'update_existing\', \'delta_changed_only\')" class="px-5 py-2 rounded-xl ' + (isDeltaModeActive ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-extrabold shadow-lg' : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-extrabold border border-emerald-500/40') + ' disabled:opacity-40 disabled:cursor-not-allowed text-xs transition cursor-pointer flex items-center gap-1.5">' +
            '<span class="material-symbols-outlined text-[16px]">bolt</span>' +
            '<span>2. Update Changed &amp; New Files Only (' + changedAndNewCount + ')</span>' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  const activeStudioTab = importStudioState.activeStudioTab || "quick";
  const studioTabsBarHtml =
    '<div class="p-1.5 rounded-2xl bg-surface-container border border-purple-500/30 flex flex-wrap items-center justify-between gap-1.5">' +
      '<div class="flex flex-wrap items-center gap-1.5">' +
        '<button type="button" onclick="setImportStudioWorkspaceTab(\'quick\')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ' +
          (activeStudioTab === "quick" ? "bg-primary text-white shadow-md" : "bg-surface-container-lowest text-on-surface hover:bg-surface-container-high") + '">' +
          '<span>🚀 1. Quick Review &amp; Publish</span>' +
        '</button>' +
        '<button type="button" onclick="setImportStudioWorkspaceTab(\'preview\')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ' +
          (activeStudioTab === "preview" ? "bg-primary text-white shadow-md" : "bg-surface-container-lowest text-on-surface hover:bg-surface-container-high") + '">' +
          '<span>👁️ 2. Side-by-Side Preview</span>' +
        '</button>' +
        '<button type="button" onclick="setImportStudioWorkspaceTab(\'diff\')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ' +
          (activeStudioTab === "diff" ? "bg-primary text-white shadow-md" : "bg-surface-container-lowest text-on-surface hover:bg-surface-container-high") + '">' +
          '<span>🔍 3. Changed Files &amp; Technical Diff (+' + filesSummary.addedCount + ' / ~' + filesSummary.modifiedCount + ')</span>' +
        '</button>' +
      '</div>' +
      '<button type="button" onclick="setImportStudioWorkspaceTab(\'all\')" class="px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ' +
        (activeStudioTab === "all" ? "bg-purple-600 text-white" : "bg-surface-container-highest text-outline hover:text-on-surface") + '">' +
        '📋 Show All Panels' +
      '</button>' +
    '</div>';

  workspace.innerHTML =
    '<!-- Clean Guided Tab Bar -->' +
    studioTabsBarHtml +
    '<!-- Compact Recognition Banner -->' +
    '<div class="p-3.5 rounded-2xl border ' + outcomePres.bannerClass + ' flex flex-col gap-2.5">' +
      '<div class="flex flex-wrap items-center justify-between gap-2">' +
        '<div class="flex items-center gap-2">' +
          '<span class="material-symbols-outlined text-[20px]">' + outcomePres.icon + '</span>' +
          '<span class="px-2.5 py-0.5 rounded-full border text-[10px] font-extrabold tracking-wider ' + outcomePres.badgeClass + '">' + outcomePres.label + '</span>' +
          validationPill +
          '<span class="text-xs font-bold text-on-surface">' + escapeHtmlSafe(pkgMeta.detectedName || pkgMeta.filename || "Uploaded Package") + '</span>' +
        '</div>' +
        '<span class="text-[10px] font-mono text-outline">' +
          (exTpl ? ('Updating: ' + escapeHtmlSafe(exTpl.name) + ' (' + escapeHtmlSafe(exTpl.currentVersionLabel || "v1.0.0") + ' → ' + escapeHtmlSafe(pkgMeta.declaredVersion || "Next") + ')') : 'New Template Package') +
        '</span>' +
      '</div>' +
      '<div class="text-xs text-on-surface-variant">' + escapeHtmlSafe(sData.recognitionSummary) + '</div>' +
      errorsListHtml +
      conflictsHtml +
    '</div>' +
    destructiveWarningsHtml +
    '<!-- Primary Action & 2-Option Update Selector right at the top for zero scrolling! -->' +
    decisionBarHtml +
    candidatesHtml +
    '<div id="import-studio-pane-preview" class="' + ((activeStudioTab === "quick" || activeStudioTab === "preview" || activeStudioTab === "all") ? "block" : "hidden") + '">' +
      sideBySidePreviewHtml +
    '</div>' +
    '<div id="import-studio-pane-diff" class="' + ((activeStudioTab === "diff" || activeStudioTab === "all") ? "block" : "hidden") + '">' +
      comparisonPanelHtml +
    '</div>';

  // Staggered Sequential Loading: Render Right (Uploaded ZIP) first, then Left (Existing Published) 80-180ms later
  runStaggeredSideBySideLoad(existingIframeUrl, stagedIframeUrl, stagedRel || "default");
}

window.promptImportStudioDecision = async function(decisionMode, explicitUpdatePackageMode = null) {
  const sData = importStudioState.sessionData;
  if (!sData || !importStudioState.sessionId) return;
  if (explicitUpdatePackageMode) {
    importStudioState.updatePackageMode = explicitUpdatePackageMode === "delta_changed_only" ? "delta_changed_only" : "full_package";
    syncUploadModeCardsUI();
  }
  const activeUpdatePackageMode = importStudioState.updatePackageMode || "full_package";

  let newTemplateId = null;
  let newTemplateSlug = null;
  let newTemplateName = document.getElementById("new-tpl-title")?.value?.trim() || sData.packageMetadata?.detectedName || "Custom Template";

  if (decisionMode === "create_new") {
    // If recognition found an existing template with the same stable ID or slug, ask the admin for a distinct slug/ID so we never overwrite or conflict!
    if (sData.recognitionOutcome === "EXACT_EXISTING_IDENTITY" || sData.recognitionOutcome === "POSSIBLE_EXISTING_MATCH" || sData.recognitionOutcome === "IDENTITY_CONFLICT") {
      const suggestedSlug = importStudioState.newTemplateSlugOverride || ((sData.packageMetadata?.detectedSlug || "template") + "-new");
      const enteredSlug = prompt(
        "To register this package as a separate NEW template without conflicting with the existing template's stable ID/slug, enter a unique URL slug:",
        suggestedSlug
      );
      if (!enteredSlug) return;
      newTemplateSlug = enteredSlug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
      newTemplateId = "tpl_" + newTemplateSlug.replace(/-/g, "_");
      importStudioState.newTemplateSlugOverride = newTemplateSlug;
      importStudioState.newTemplateIdOverride = newTemplateId;
    }
  }

  const rawStudioTier = String(document.getElementById("new-tpl-tier")?.value || sData.manifest?.template?.tier || "free").toLowerCase().trim();
  const rawStudioPrice = Number(document.getElementById("new-tpl-price")?.value ?? sData.manifest?.template?.price ?? 0);
  const resolvedStudioTier = (rawStudioTier === "free" || rawStudioPrice <= 0) ? "free" : "vip";
  const resolvedStudioPrice = resolvedStudioTier === "free" ? 0 : (rawStudioPrice > 0 ? rawStudioPrice : 49);

  const adminConfigOverrides = {
    name: newTemplateName,
    category: document.getElementById("new-tpl-category")?.value || sData.manifest?.template?.category || "Birthday",
    description: document.getElementById("new-tpl-desc")?.value?.trim() || sData.manifest?.template?.description || "",
    tier: resolvedStudioTier,
    price: resolvedStudioPrice,
    isPremium: resolvedStudioTier === "vip",
    placement: Number(document.getElementById("new-tpl-placement")?.value ?? 1),
    featured: Boolean(document.getElementById("new-tpl-featured")?.checked),
    visibilityConfig: uploadUtpConfigState.visibilityConfig || {},
    actionsConfig: uploadUtpConfigState.actionsConfig || {},
    variantOverrides: uploadUtpConfigState.variantOverrides || {},
    enabledVariants: getSelectedEnabledVariantSlugs(uploadUtpConfigState),
    relationships: getSelectedEnabledVariantSlugs(uploadUtpConfigState)
  };

  try {
    const res = await fetch("/api/templates/import-studio/" + encodeURIComponent(importStudioState.sessionId) + "/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        decisionMode,
        updatePackageMode: activeUpdatePackageMode,
        targetTemplateId: decisionMode === "update_existing" ? importStudioState.selectedTargetTemplateId : null,
        newTemplateId,
        newTemplateSlug,
        newTemplateName,
        adminConfigOverrides,
        warningsAcknowledged: importStudioState.warningsAcknowledged || !(sData.comparison && sData.comparison.hasDestructiveChanges),
        resolveConflictConfirmed: Boolean(
          importStudioState.resolveConflictConfirmed ||
          (decisionMode === "update_existing" && Array.isArray(sData.conflicts) && sData.conflicts.every(c => c.code === "INTENDED_TARGET_IDENTITY_MISMATCH" && !c.conflictingTemplate))
        )
      })
    });

    const json = await res.json().catch(() => ({}));
    const data = json.data || json;
    if (!res.ok || data.success === false) {
      const msg = data.error?.message || data.message || "Validation failed.";
      alert("⚠️ Cannot proceed to publish:\n\n" + msg);
      return;
    }

    importStudioState.sessionData = data;
    openImportPublishConfirmationModal(data);
  } catch (err) {
    alert("Error validating import decision: " + err.message);
  }
};

function openImportPublishConfirmationModal(validatedSession) {
  const { confirmModal } = ensureSmartImportStudioDomContainers();
  const bodyEl = document.getElementById("import-confirm-modal-body");
  if (!confirmModal || !bodyEl || !validatedSession) return;

  const isUpdate = validatedSession.decisionMode === "update_existing";
  const isDeltaUpdate = isUpdate && ((validatedSession.updatePackageMode || importStudioState.updatePackageMode) === "delta_changed_only");
  const exTpl = validatedSession.existingTemplate || validatedSession.comparison?.existingTemplate || null;
  const pkgMeta = validatedSession.packageMetadata || {};
  const comp = validatedSession.comparison || {};
  const fSum = comp.files?.summary || { addedCount: 0, modifiedCount: 0, removedCount: 0, renamedCount: 0, unchangedCount: 0 };
  const changedOrNewTotal = Number(fSum.modifiedCount || 0) + Number(fSum.addedCount || 0) + Number(fSum.renamedCount || 0);
  const mDiff = comp.manifestDiff || {};
  const warnings = comp.destructiveWarnings || [];

  const updateModeBannerInModal = isUpdate
    ? '<div class="p-3 rounded-xl bg-surface-container border border-purple-500/30 flex flex-col gap-2">' +
        '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<span class="text-[11px] font-extrabold uppercase tracking-wider text-on-surface">Selected Update Method:</span>' +
          '<div class="flex items-center gap-1.5">' +
            '<button type="button" onclick="promptImportStudioDecision(\'update_existing\', \'full_package\')" class="px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer ' + (!isDeltaUpdate ? 'bg-primary text-white' : 'bg-surface-container-highest text-outline') + '">📦 1. Full ZIP Upload</button>' +
            '<button type="button" onclick="promptImportStudioDecision(\'update_existing\', \'delta_changed_only\')" class="px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer ' + (isDeltaUpdate ? 'bg-emerald-500 text-purple-950 font-black' : 'bg-surface-container-highest text-outline') + '">⚡ 2. Changed &amp; New Files Only</button>' +
          '</div>' +
        '</div>' +
        '<div class="text-[11px] ' + (isDeltaUpdate ? 'text-emerald-300' : 'text-purple-200') + '">' +
          (isDeltaUpdate
            ? ('⚡ <b>Smart Delta Update Active:</b> Only <b>' + changedOrNewTotal + ' file(s)</b> (' + fSum.modifiedCount + ' modified, ' + fSum.addedCount + ' new) will be uploaded &amp; updated. All <b>' + fSum.unchangedCount + ' unchanged file(s)</b> will be automatically reused from the current version without re-uploading!')
            : ('📦 <b>Full Template ZIP Upload Active:</b> All <b>' + (changedOrNewTotal + fSum.unchangedCount) + ' file(s)</b> in the ZIP will be uploaded to create the new version.')) +
        '</div>' +
      '</div>'
    : '';

  bodyEl.innerHTML =
    '<div class="p-3.5 rounded-xl ' + (isUpdate ? 'bg-emerald-500/10 border border-emerald-500/35' : 'bg-indigo-500/10 border border-indigo-500/35') + ' flex items-center justify-between gap-3">' +
      '<div>' +
        '<div class="text-[10px] font-extrabold uppercase tracking-wider ' + (isUpdate ? 'text-emerald-300' : 'text-indigo-300') + '">' +
          (isUpdate
            ? (isDeltaUpdate ? 'Option 2 • Smart Delta Update (Only Changed & New Files)' : 'Option 1 • Full Template Package Update (Immutable New Version)')
            : 'Create Brand-New Template') +
        '</div>' +
        '<div class="text-sm font-extrabold text-on-surface mt-0.5">' +
          (isUpdate && exTpl
            ? (escapeHtmlSafe(exTpl.name) + ' (' + escapeHtmlSafe(exTpl.id) + ') — ' + escapeHtmlSafe(exTpl.currentVersionLabel || 'v1.0.0') + ' → ' + escapeHtmlSafe(pkgMeta.declaredVersion || 'Next Version'))
            : (escapeHtmlSafe(validatedSession.adminConfigOverrides?.newTemplateName || pkgMeta.detectedName || 'New Template') + ' (' + escapeHtmlSafe(validatedSession.adminConfigOverrides?.newTemplateId || pkgMeta.canonicalTemplateId || 'new') + ')')) +
        '</div>' +
      '</div>' +
      '<span class="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">✓ READY TO PUBLISH</span>' +
    '</div>' +

    updateModeBannerInModal +
    '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">' +
      '<div class="p-2.5 rounded-xl bg-surface-container border border-purple-500/20">' +
        '<div class="text-[10px] text-outline uppercase font-bold">Files Diff</div>' +
        '<div class="font-bold text-on-surface mt-0.5">+' + fSum.addedCount + ' / ~' + fSum.modifiedCount + ' / -' + fSum.removedCount + '</div>' +
      '</div>' +
      '<div class="p-2.5 rounded-xl bg-surface-container border border-purple-500/20">' +
        '<div class="text-[10px] text-outline uppercase font-bold">Variants Diff</div>' +
        '<div class="font-bold text-on-surface mt-0.5">+' + ((mDiff.variants?.added || []).length) + ' / ~' + ((mDiff.variants?.modified || []).length) + ' / -' + ((mDiff.variants?.removed || []).length) + '</div>' +
      '</div>' +
      '<div class="p-2.5 rounded-xl bg-surface-container border border-purple-500/20">' +
        '<div class="text-[10px] text-outline uppercase font-bold">Sections & Subs</div>' +
        '<div class="font-bold text-on-surface mt-0.5">+' + ((mDiff.sections?.added || []).length) + ' / ~' + ((mDiff.sections?.modified || []).length) + ' / -' + ((mDiff.sections?.removed || []).length) + '</div>' +
      '</div>' +
      '<div class="p-2.5 rounded-xl bg-surface-container border border-purple-500/20">' +
        '<div class="text-[10px] text-outline uppercase font-bold">Fields & Actions</div>' +
        '<div class="font-bold text-on-surface mt-0.5">F: +' + ((mDiff.fields?.added || []).length) + '/-' + ((mDiff.fields?.removed || []).length) + ' • A: +' + ((mDiff.actions?.added || []).length) + '/-' + ((mDiff.actions?.removed || []).length) + '</div>' +
      '</div>' +
    '</div>' +

    '<div class="p-3 rounded-xl bg-purple-500/10 border border-purple-500/25 space-y-1 text-[11px]">' +
      '<div class="font-bold text-purple-200">🛡️ Existing Customer Wishes & Rollback Guarantee:</div>' +
      '<div>• <b>Existing Wishes Impact:</b> Zero destructive impact. All previously created/published wishes retain their original template version and <code>published_config_snapshot_json</code>.</div>' +
      '<div>• <b>New Wishes Impact:</b> Future wishes created after publication will use this new version.</div>' +
      '<div>• <b>Rollback Availability:</b> ' + (isUpdate && exTpl ? ('Previous version (' + escapeHtmlSafe(exTpl.currentVersionLabel || exTpl.currentVersionId) + ') will remain preserved as an instant rollback candidate.') : 'Initial version v1.0.0 will be registered.') + '</div>' +
    '</div>' +

    (warnings.length > 0
      ? '<div class="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-[11px] text-amber-200 space-y-1">' +
          '<div class="font-bold text-amber-300">⚠️ Acknowledged Removal Warnings (' + warnings.length + '):</div>' +
          warnings.map(w => '<div>• ' + escapeHtmlSafe(w.message) + '</div>').join("") +
        '</div>'
      : '') +

    '<div class="flex flex-col gap-1.5">' +
      '<label class="text-[11px] font-bold uppercase text-outline">Release Notes (Optional)</label>' +
      '<input id="import-confirm-release-notes" type="text" placeholder="Describe what changed in this version..." class="w-full px-3 py-2 rounded-xl bg-surface-container border border-purple-500/30 text-xs text-on-surface"/>' +
    '</div>' +

    '<label class="p-3 rounded-xl bg-surface-container border border-purple-500/30 flex items-start gap-2.5 cursor-pointer">' +
      '<input type="checkbox" id="import-final-confirm-checkbox" onchange="const b=document.getElementById(\'import-final-publish-btn\'); if(b) b.disabled=!this.checked;" class="mt-0.5 rounded text-emerald-500"/>' +
      '<span class="text-xs text-on-surface font-semibold">I have reviewed the side-by-side preview and comparison report, and I explicitly confirm publishing this version.</span>' +
    '</label>' +

    '<div class="flex items-center justify-end gap-2.5 pt-2 border-t border-purple-500/20">' +
      '<button type="button" onclick="closeImportPublishConfirmationModal()" class="px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-xs cursor-pointer">Back to Review</button>' +
      '<button type="button" id="import-final-publish-btn" disabled onclick="executeImportStudioConfirmedPublish()" class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-xs shadow-lg cursor-pointer flex items-center gap-1.5">' +
        '<span class="material-symbols-outlined text-[16px]">rocket_launch</span>' +
        '<span>Confirm & Publish Now</span>' +
      '</button>' +
    '</div>';

  confirmModal.classList.remove("hidden");
}

window.closeImportPublishConfirmationModal = function() {
  const modal = document.getElementById("import-publish-confirm-modal");
  if (modal) modal.classList.add("hidden");
};

window.executeImportStudioConfirmedPublish = async function() {
  const sData = importStudioState.sessionData;
  if (!sData || !importStudioState.sessionId) return;

  const btn = document.getElementById("import-final-publish-btn");
  const releaseNotes = document.getElementById("import-confirm-release-notes")?.value?.trim() || "";
  const setPublishBtnStatus = (msg) => {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-outlined text-[16px] animate-spin">sync</span><span>' + escapeHtmlSafe(msg) + '</span>';
    }
  };
  setPublishBtnStatus("Preparing assets & publishing immutable version...");

  const isDeltaPublish = Boolean(
    sData.decisionMode === "update_existing" &&
    (sData.updatePackageMode || importStudioState.updatePackageMode) === "delta_changed_only"
  );
  const deltaChangedSet = isDeltaPublish
    ? new Set([
        ...((sData.comparison?.files?.modified || []).map(f => String(f.path || "").replace(/^\.?\/+/, ""))),
        ...((sData.comparison?.files?.added || []).map(f => String(f.path || "").replace(/^\.?\/+/, ""))),
        ...((sData.comparison?.files?.renamed || []).map(f => String(f.newPath || "").replace(/^\.?\/+/, "")))
      ].filter(Boolean))
    : null;

  try {
    const preUploadedImgbbMap = {};
    const imageRelPaths = Object.keys(currentUploadedFiles || {}).filter(p => {
      if (!isImageFile(p) || p.toLowerCase().endsWith(".svg")) return false;
      const cleanP = String(p).replace(/^\.?\/+/, "");
      if (isDeltaPublish && deltaChangedSet && !deltaChangedSet.has(cleanP)) {
        return false; // Skip unchanged photos in Delta Mode — reused from current version!
      }
      return true;
    });
    if (imageRelPaths.length > 0) {
      let completedPhotos = 0;
      let skipClientImgbb = false;
      const CLIENT_BATCH_SIZE = 2;
      let consecutiveBatchFailures = 0;

      for (let i = 0; i < imageRelPaths.length && !skipClientImgbb; i += CLIENT_BATCH_SIZE) {
        let batchSuccessCount = 0;
        const batchPaths = imageRelPaths.slice(i, i + CLIENT_BATCH_SIZE);
        setPublishBtnStatus("Uploading Photos to ImgBB (" + Math.min(i + 1, imageRelPaths.length) + "/" + imageRelPaths.length + ")...");

        await Promise.all(batchPaths.map(async (relPath) => {
          if (skipClientImgbb) return;
          const fileEntry = currentUploadedFiles[relPath];
          const dataUrl = typeof fileEntry === "string" ? fileEntry : (fileEntry && fileEntry.content);
          if (!dataUrl) return;
          const exactFileName = relPath.split("/").pop();
          const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
          const timerId = controller ? setTimeout(() => { try { controller.abort(); } catch (_) {} }, 15000) : null;
          try {
            const imgRes = await fetch("/api/imgbb/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                fileData: dataUrl,
                filename: exactFileName,
                type: "image",
                isTemplateAsset: true,
                title: exactFileName.replace(/\.[^/.]+$/, "")
              }),
              ...(controller ? { signal: controller.signal } : {})
            });
            if (timerId) clearTimeout(timerId);
            const imgJson = await imgRes.json().catch(() => ({}));
            if (imgRes.status === 503 && imgJson?.code === "IMGBB_NOT_CONFIGURED") {
              skipClientImgbb = true;
              return;
            }
            const resData = imgJson?.data || imgJson || {};
            const liveUrl = resData.displayUrl || resData.originalUrl || resData.url;
            if (imgRes.ok && liveUrl) {
              batchSuccessCount++;
              preUploadedImgbbMap[relPath] = {
                mediaId: resData.mediaId || null,
                deleteUrl: resData.deleteUrl || null,
                displayUrl: liveUrl,
                originalUrl: resData.originalUrl || liveUrl,
                thumbnailUrl: resData.thumbnailUrl || resData.thumbUrl || liveUrl,
                providerAssetId: resData.providerAssetId || resData.imageId || null,
                mimeType: resData.mimeType || getMimeType(relPath),
                width: resData.width || null,
                height: resData.height || null,
                sizeBytes: (fileEntry && fileEntry.sizeBytes) || resData.sizeBytes || 0,
                filename: exactFileName
              };
            }
          } catch (_) {
            if (timerId) clearTimeout(timerId);
          } finally {
            completedPhotos++;
            setPublishBtnStatus("Uploading Photos to ImgBB (" + completedPhotos + "/" + imageRelPaths.length + ")...");
          }
        }));

        if (batchSuccessCount === 0) {
          consecutiveBatchFailures++;
          if (consecutiveBatchFailures >= 1) skipClientImgbb = true;
        } else {
          consecutiveBatchFailures = 0;
        }
      }
    }

    const filesForB2PreUpload = isDeltaPublish && deltaChangedSet
      ? Object.fromEntries(Object.entries(currentUploadedFiles || {}).filter(([p]) => deltaChangedSet.has(String(p).replace(/^\.?\/+/, ""))))
      : currentUploadedFiles;
    const preUploadedB2Map = await preUploadTemplateMediaToB2(filesForB2PreUpload, setPublishBtnStatus);

    setPublishBtnStatus("Deploying code & media to Backblaze B2 & D1...");
    let resolvedZipBase64 = null;
    if ((Object.keys(preUploadedImgbbMap).length > 0 || Object.keys(preUploadedB2Map).length > 0) && typeof JSZip !== "undefined") {
      try {
        resolvedZipBase64 = await buildCompactTemplateZipBase64(currentUploadedFiles, preUploadedImgbbMap, preUploadedB2Map);
      } catch (_) {}
    }
    if (!resolvedZipBase64 && currentZipBase64) {
      resolvedZipBase64 = currentZipBase64;
    }

    const res = await fetch("/api/templates/import-studio/" + encodeURIComponent(importStudioState.sessionId) + "/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        updatePackageMode: isDeltaPublish ? "delta_changed_only" : "full_package",
        expectedLockVersion: sData.baseTemplateLockVersion,
        warningsAcknowledged: true,
        releaseNotes,
        zipBase64: resolvedZipBase64,
        preUploadedImgbbMap,
        preUploadedB2Map,
        skipServerImgbbRetry: Boolean(isDeltaPublish || (imageRelPaths.length > 0 && Object.keys(preUploadedImgbbMap).length === 0))
      })
    });

    const json = await res.json().catch(() => ({}));
    const data = json.data || json;

    if (res.status === 409) {
      alert("⚠️ CONCURRENCY / STALE VERSION CONFLICT:\n\n" + (data.error?.message || data.message) + "\n\nRefreshing comparison against the latest published version...");
      closeImportPublishConfirmationModal();
      if (importStudioState.selectedTargetTemplateId) {
        await window.selectImportCandidateTarget(importStudioState.selectedTargetTemplateId);
      }
      return;
    }

    if (!res.ok || data.success === false) {
      throw new Error(data.error?.message || data.message || "Publication failed");
    }

    importStudioState.sessionData = data;
    closeImportPublishConfirmationModal();
    if (typeof showToast === "function") {
      showToast("🚀 Published " + (data.publishedVersionLabel || data.publishedVersionId) + " for template " + data.publishedTemplateId + "!");
    }
    renderSmartImportStudioWorkspace();
    await loadDynamicTemplates();
  } catch (err) {
    alert("Error publishing template version: " + err.message);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">rocket_launch</span><span>Confirm & Publish Now</span>';
    }
  }
};

window.cancelActiveImportStudioSession = async function() {
  if (!importStudioState.sessionId) {
    const { workspace } = ensureSmartImportStudioDomContainers();
    if (workspace) workspace.classList.add("hidden");
    return;
  }

  if (!confirm("Cancel this template import session and discard staged preview files? Existing templates will remain unchanged.")) {
    return;
  }

  try {
    await fetch("/api/templates/import-studio/" + encodeURIComponent(importStudioState.sessionId) + "/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include"
    });
    importStudioState.sessionId = null;
    importStudioState.sessionData = null;
    const { workspace } = ensureSmartImportStudioDomContainers();
    if (workspace) {
      workspace.innerHTML =
        '<div class="p-3 rounded-xl bg-surface-container text-xs text-outline flex items-center justify-between">' +
          '<span>Import session cancelled and staged preview resources cleaned up.</span>' +
        '</div>';
    }
    if (typeof showToast === "function") showToast("Import session cancelled.");
  } catch (err) {
    alert("Failed to cancel import session: " + err.message);
  }
};


window.setImportStudioWorkspaceTab = function(tabName) {
  importStudioState.activeStudioTab = tabName || "quick";
  renderSmartImportStudioWorkspace();
};

window.toggleCloudRoutingInspectorDetails = function() {
  window._cloudRoutingInspectorExpanded = !window._cloudRoutingInspectorExpanded;
  const bodyEl = document.getElementById("cloud-routing-collapsible-body");
  if (bodyEl) {
    bodyEl.classList.toggle("hidden", !window._cloudRoutingInspectorExpanded);
  }
};

window.toggleUploadUtpEditorBody = function() {
  if (typeof uploadUtpConfigState === "object" && uploadUtpConfigState) {
    uploadUtpConfigState.isExpandedInUpload = !uploadUtpConfigState.isExpandedInUpload;
    renderUploadUtpV12ConfigPanel();
  }
};

window.toggleDetectedFieldsList = function() {
  const container = document.getElementById("detected-fields-container");
  const btn = document.getElementById("btn-toggle-detected-fields");
  if (!container) return;
  const isNowHidden = container.classList.toggle("hidden");
  if (btn) {
    btn.textContent = isNowHidden ? "Show Fields ▾" : "Hide Fields ▴";
  }
};
