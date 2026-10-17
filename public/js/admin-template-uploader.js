// WishMagic Admin Studio - Universal Website & Code Folder Uploader Engine

let currentUploadedFiles = {}; // { [relativePath]: { content, isBase64 } }
let detectedDynamicFields = []; // Confirmed customizer fields
let suggestedDynamicFields = []; // Undeclared HTML/media fields awaiting admin confirmation
let currentParsedManifest = null;
let currentUtpValidationIssues = [];
let currentDetectedVariantsReport = null;
let customCoverThumbnail = null;
let customCoverThumbnailIsManual = false;
let firstFoundImageRelPath = "";
let currentPreviewBlobUrl = null;
let currentZipRawFile = null; // Part 20: Real B2 ZIP archive buffer tracker
let currentZipBase64 = null; // Cached base64 of the uploaded ZIP so deploy never hangs on FileReader

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
    const zipArrayBuffer = await zipFile.arrayBuffer();
    currentZipBase64 = encodeUint8ArrayToBase64(new Uint8Array(zipArrayBuffer));
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
      if (!relPath || relPath.startsWith('.DS_Store')) continue;

      const baseFileName = relPath.split('/').pop();

      if (isMediaFile(relPath)) {
        const base64 = await entry.async('base64');
        const mime = getMimeType(relPath);
        const dataUrl = 'data:' + mime + ';base64,' + base64;
        currentUploadedFiles[relPath] = {
          content: dataUrl,
          isBase64: true,
          sizeBytes: Math.round((base64.length * 3) / 4),
          originalName: baseFileName
        };
        if (!firstFoundImage && isImageFile(relPath)) {
          firstFoundImage = dataUrl;
          firstFoundImageName = baseFileName;
          firstFoundImageRelPath = relPath;
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

  // Render live sandbox preview in iframe
  renderLiveSandboxPreview();

  // Show Step 2 & 3 in the modal
  const stepConfig = document.getElementById('upload-step-config');
  const placeholderState = document.getElementById('upload-placeholder-state');
  if (stepConfig) stepConfig.classList.remove('hidden');
  if (placeholderState) placeholderState.classList.add('hidden');
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
    if (tierInput && tMeta.tier) tierInput.value = String(tMeta.tier).toLowerCase() === "vip" || Number(tMeta.price) > 0 ? "vip" : "free";
    if (priceInput && tMeta.price !== undefined) priceInput.value = Number(tMeta.price) || 0;
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
      } else if (tagLower === "img" && srcVal && !srcVal.startsWith("data:image/svg")) {
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
      } else if (tagLower === "audio" && srcVal) {
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
      } else if (tagLower === "video" && srcVal) {
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

    // Check <audio><source src="..."></audio> and <video><source src="..."></video>
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
        if (!caseMatch) {
          currentUtpValidationIssues.push({
            severity: "warning",
            code: "MISSING_REFERENCED_ASSET",
            message: "Referenced file \"" + cleanRef + "\" in index.html was not found in the ZIP archive."
          });
        }
      }
    }
  }

  // 3. Check bundled media files in the ZIP
  Object.keys(currentUploadedFiles).forEach((relPath) => {
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
        const exists = Boolean(currentUploadedFiles[normP] || Object.keys(currentUploadedFiles).some(k => k.toLowerCase() === normP.toLowerCase()));
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
        validVars.push({
          id: vId,
          slug: rv.slug || normRel,
          name: vName,
          relationship: normRel,
          label: vLabel || normRel,
          thumbnail: rv.thumbnail || "",
          entry: rv.entry || "index.html",
          status: rv.status || "published"
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
      detectedRelations: validVars.map(v => ({ slug: v.relationship, label: v.label, variantId: v.id, name: v.name })),
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

  inspectorEl.innerHTML =
    "<div class=\"flex flex-wrap items-center justify-between gap-2\">" +
      "<div class=\"flex items-center gap-2\">" +
        "<span class=\"material-symbols-outlined text-emerald-400 text-[18px]\">verified</span>" +
        "<span class=\"text-xs font-bold text-on-surface uppercase tracking-wider\">UTP v1.0.0 Code Check & Hybrid Cloud Routing</span>" +
      "</div>" +
      "<div class=\"flex flex-wrap items-center gap-1.5 text-[10px] font-bold\">" +
        "<span class=\"px-2 py-0.5 rounded-full " + (foundIndex ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-rose-500/20 text-rose-300 border border-rose-500/30") + "\">" +
          (foundIndex ? "✓ index.html Ready" : "✕ Missing index.html") +
        "</span>" +
        "<span class=\"px-2 py-0.5 rounded-full " + (hasManifest ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-amber-500/20 text-amber-200 border border-amber-500/30") + "\">" +
          (hasManifest ? "✓ wishmagic.json Standard" : "Auto-Schema Mode") +
        "</span>" +
        "<span class=\"px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-500/30\">" + cssCount + " CSS • " + jsCount + " JS</span>" +
        "<span class=\"px-2 py-0.5 rounded-full " + (unboundCount === 0 ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/30" : "bg-amber-500/20 text-amber-200 border border-amber-500/30") + "\">" +
          boundCount + "/" + detectedDynamicFields.length + " Fields Bound" +
        "</span>" +
      "</div>" +
    "</div>" +
    issuesHtml +
    "<div class=\"grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1\">" +
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
    "<div id=\"deployed-cloud-links-summary\" class=\"hidden pt-2 border-t border-outline-variant/20\"></div>";
}

function renderAdminVariantUploadReportHtml(vReport, isServerVerified = false) {
  if (!vReport) return "";
  const isReady = Boolean(vReport.readyForPublishing || (vReport.readyForReview && (vReport.invalidVariantsCount || 0) === 0));
  const statusBadge = isReady
    ? '<span class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">✓ Ready for Review & Publishing</span>'
    : '<span class="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold">✕ Validation Blocked — Action Required</span>';

  const relationsPills = Array.isArray(vReport.detectedRelations) && vReport.detectedRelations.length > 0
    ? vReport.detectedRelations.map(r =>
        '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/40 text-[11px] font-bold text-purple-200">' +
          '<span>[' + (r.label || r.slug) + ']</span>' +
          '<span class="text-[9px] font-mono opacity-80">(' + (r.variantId || r.id || r.slug) + ')</span>' +
        '</span>'
      ).join(" ")
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
function renderLiveSandboxPreview() {
  const iframe = document.getElementById("upload-preview-iframe");
  if (!iframe) return;

  let indexContent = "";
  for (const [pathKey, data] of Object.entries(currentUploadedFiles)) {
    if (pathKey.toLowerCase() === "index.html" || pathKey.toLowerCase().endsWith("/index.html")) {
      indexContent = typeof data === "string" ? data : data.content;
      break;
    }
  }

  if (!indexContent) {
    indexContent = "<h1 style=\"color:white;text-align:center;font-family:sans-serif;padding:40px;\">No index.html entry file detected</h1>";
  }

  // Inline CSS, JS, Images, Audio, and Video data URLs so preview works 100% offline/before deploy
  const sortedPaths = Object.keys(currentUploadedFiles).sort((a, b) => b.length - a.length);
  for (const p of sortedPaths) {
    const d = currentUploadedFiles[p];
    const rawContent = typeof d === "string" ? d : d.content;
    const escP = escapeRegex(p);
    if (p.toLowerCase().endsWith(".css")) {
      const cssDataUrl = "data:text/css;base64," + btoa(unescape(encodeURIComponent(rawContent)));
      indexContent = indexContent.replace(new RegExp("href=[\"'](?:\\.\\.?\\/|\\/)*" + escP + "[\"']", "gi"), "href=\"" + cssDataUrl + "\"");
    } else if (p.toLowerCase().endsWith(".js") && !p.toLowerCase().endsWith(".json")) {
      const jsDataUrl = "data:text/javascript;base64," + btoa(unescape(encodeURIComponent(rawContent)));
      indexContent = indexContent.replace(new RegExp("src=[\"'](?:\\.\\.?\\/|\\/)*" + escP + "[\"']", "gi"), "src=\"" + jsDataUrl + "\"");
    } else if (d && d.isBase64 && rawContent) {
      indexContent = indexContent.replace(new RegExp("([\"'(\s])(?:\\.\\.?\\/|\\/)*" + escP + "(?=[\"')?\\s#])", "gi"), "$1" + rawContent);
    }
  }

  // Populate sample values for dynamic placeholders in preview
  indexContent = indexContent.replace(/\{\{\s*recipient_name\s*\}\}/g, "Priya Sharma");
  indexContent = indexContent.replace(/\{\{\s*event_date\s*\}\}/g, "25 October 2026");
  indexContent = indexContent.replace(/\{\{\s*sender_name\s*\}\}/g, "Ankit Verma");
  indexContent = indexContent.replace(/\{\{\s*custom_message\s*\}\}/g, "May this special day bring you magical memories and endless joy!");

  iframe.srcdoc = indexContent;
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

function getMinimalStubBytesForImage(relPath) {
  const lower = String(relPath || "").toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return MINIMAL_VALID_JPEG_BYTES;
  if (lower.endsWith(".gif")) return MINIMAL_VALID_GIF_BYTES;
  if (lower.endsWith(".webp")) return MINIMAL_VALID_WEBP_BYTES;
  return MINIMAL_VALID_PNG_BYTES;
}

async function buildCompactTemplateZipBase64(filesMap, preUploadedImgbbMap) {
  if (typeof JSZip === "undefined") return null;
  const zip = new JSZip();
  for (const [relPath, entry] of Object.entries(filesMap)) {
    const rawContent = typeof entry === "string" ? entry : (entry && entry.content !== undefined ? entry.content : "");
    const isB64 = Boolean(entry && entry.isBase64) || (typeof rawContent === "string" && rawContent.startsWith("data:") && rawContent.includes(";base64,"));
    if (preUploadedImgbbMap && preUploadedImgbbMap[relPath] && isImageFile(relPath)) {
      zip.file(relPath, getMinimalStubBytesForImage(relPath));
    } else if (isB64 && typeof rawContent === "string") {
      const b64Part = rawContent.includes(";base64,") ? rawContent.split(";base64,")[1] : rawContent;
      zip.file(relPath, b64Part, { base64: true });
    } else {
      zip.file(relPath, String(rawContent || ""));
    }
  }
  const zipBytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 5 } });
  return encodeUint8ArrayToBase64(zipBytes);
}

async function deployUploadedTemplate(publishImmediately = true) {
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

    // Stage 2: Build compact ZIP archive (replacing already-uploaded ImgBB photos with tiny valid image stubs so upload payload is ~25KB instead of 10MB)
    setLiveButtonStatus("Packaging & Deploying Code/Media to Backblaze B2 & D1...");
    let resolvedZipBase64 = null;
    if (Object.keys(preUploadedImgbbMap).length > 0 && typeof JSZip !== "undefined") {
      try {
        resolvedZipBase64 = await buildCompactTemplateZipBase64(currentUploadedFiles, preUploadedImgbbMap);
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
      tier: tierInput ? tierInput.value : (currentParsedManifest?.template?.tier || "vip"),
      price: priceInput ? Number(priceInput.value) : Number(currentParsedManifest?.template?.price ?? 49),
      placement: orderInput ? Number(orderInput.value) : 1,
      featured: featuredInput ? featuredInput.checked : true,
      thumbnail: thumbnailPayloadValue,
      thumbnailName: customCoverThumbnailName || "cover-photo.png",
      detectedFields: detectedDynamicFields,
      confirmedFields: detectedDynamicFields,
      preUploadedImgbbMap,
      skipServerImgbbRetry: Boolean(imageRelPaths.length > 0 && Object.keys(preUploadedImgbbMap).length === 0),
      capabilities: currentParsedManifest?.capabilities || {},
      sections: currentParsedManifest?.sections || [],
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
        data = await res.json().catch(() => ({}));
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
      if (!resultObj?.rolledBack?.imgbb && Object.keys(preUploadedImgbbMap).length > 0) {
        setLiveButtonStatus("Rolling back uploaded cloud files after error...");
        try {
          await fetch("/api/templates/upload-rollback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ preUploadedImgbbMap })
          });
        } catch (_) {}
      }
      if (data && data.code === "UTP_VALIDATION_FAILED") {
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
      if (typeof preUploadedImgbbMap === "object" && Object.keys(preUploadedImgbbMap).length > 0) {
        await fetch("/api/templates/upload-rollback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preUploadedImgbbMap })
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
  if (!confirm(`Are you sure you want to delete template "${name}"?\n\nNote: Expired wish links will not block deletion, but active or upcoming future wish links are protected by the safeguard.`)) {
    return;
  }

  try {
    let result;
    const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    result = await res.json();

    const isReferenced = Boolean(result && (result.referenced || (result.data && result.data.referenced)));
    const isDeleted = Boolean(result && (result.deleted || (result.data && result.data.deleted) || (result.success && !isReferenced)));

    if (isDeleted) {
      if (typeof showToast === 'function') showToast(`Template "${name}" deleted successfully.`);
      allAdminTemplates = (allAdminTemplates || []).filter(t => t.id !== templateId);
      await loadDynamicTemplates();
      if (typeof renderQuickSetTemplatesList === 'function') {
        renderQuickSetTemplatesList(allAdminTemplates);
      }
    } else if (isReferenced) {
      const msg = (result.data && result.data.message) || result.message || 'Active or upcoming future recipient wishes are using this template.';
      alert(`⚠️ SAFEGUARD BLOCKED DELETION:\n\n${msg}\n\nAction: Please use the "Unpublish / Draft" button to safely hide this template from the store while active/future links remain live.`);
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
