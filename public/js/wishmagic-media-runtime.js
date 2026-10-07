/**
 * WishMagic Universal Media Runtime & Capability Abstraction (Part 8)
 * ===================================================================
 * Protocol-driven media runtime layer providing:
 * - Provider-independent Media Reference abstraction
 * - Local object URL tracking & safe cleanup (revokeObjectURL)
 * - Safe internal File/Blob storage isolation (WishMagicMediaRuntime)
 * - File validation: MIME, size bytes, dimensions (width/height), video/voice duration
 * - Audio ducking coordination (WishMagicAudioRuntime)
 * - Safe voice recorder management with MediaStream track release
 * - Full JSON serializability for WishMagicData.media
 */

(function (global) {
  'use strict';

  const PROTOCOL_VERSION = '1.0';

  // Standard Allowed Media Types
  const STANDARD_MEDIA_TYPES = new Set([
    'image',
    'image-multiple',
    'video',
    'video-multiple',
    'audio',
    'voice',
    'background-image',
    'background-video'
  ]);

  // Standard Roles
  const STANDARD_MEDIA_ROLES = new Set([
    'cover',
    'gallery',
    'hero',
    'background',
    'memory',
    'timeline',
    'voice',
    'music'
  ]);

  // Tracked Object URLs created by this application
  const activeObjectURLs = new Set();

  /**
   * Safe Object URL Generator with registration
   */
  function createTrackedObjectURL(blobOrFile) {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return `mock-blob:${Date.now()}`;
    }
    try {
      const url = URL.createObjectURL(blobOrFile);
      activeObjectURLs.add(url);
      return url;
    } catch (e) {
      console.warn('[WishMagicMedia] Failed to create object URL:', e);
      return '';
    }
  }

  /**
   * Safe Object URL Revoker
   */
  function revokeTrackedObjectURL(url) {
    if (!url || typeof url !== 'string') return;
    if (activeObjectURLs.has(url)) {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
      }
      activeObjectURLs.delete(url);
    }
  }

  /**
   * Revoke all tracked object URLs
   */
  function cleanupAllObjectURLs() {
    activeObjectURLs.forEach(url => {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
      }
    });
    activeObjectURLs.clear();
  }

  // ---------------------------------------------------------------------------
  // 1. ABSTRACT MEDIA PROVIDER INTERFACE
  // ---------------------------------------------------------------------------
  const TemporaryMediaProvider = {
    name: 'temporary',

    async upload(fileOrBlob, metadata = {}) {
      const id = metadata.id || `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const url = createTrackedObjectURL(fileOrBlob);

      return {
        id,
        provider: 'temporary',
        providerId: id,
        url,
        mimeType: metadata.mimeType || (fileOrBlob && fileOrBlob.type) || 'application/octet-stream',
        size: metadata.size || (fileOrBlob && fileOrBlob.size) || 0,
        width: metadata.width || null,
        height: metadata.height || null,
        duration: metadata.duration || null,
        name: metadata.name || (fileOrBlob && fileOrBlob.name) || 'media',
        alt: metadata.alt || ''
      };
    },

    async remove(mediaRef) {
      if (mediaRef && mediaRef.url) {
        revokeTrackedObjectURL(mediaRef.url);
      }
      return true;
    },

    getUrl(mediaRef) {
      return (mediaRef && mediaRef.url) || '';
    },

    getMetadata(mediaRef) {
      return mediaRef || null;
    }
  };

  let activeMediaProvider = TemporaryMediaProvider;

  // ---------------------------------------------------------------------------
  // 2. INTERNAL MEDIA RUNTIME CACHE LAYER (Holds raw Blobs/Files safely)
  // ---------------------------------------------------------------------------
  // Rule 49: Do NOT put File, Blob, MediaStream into WishMagicData.
  // Keep them here in internal cache.
  const rawMediaCache = new Map();

  const WishMagicMediaRuntime = {
    PROTOCOL_VERSION,

    setProvider(provider) {
      if (provider && typeof provider.upload === 'function') {
        activeMediaProvider = provider;
      }
    },

    getProvider() {
      return activeMediaProvider;
    },

    storeRaw(id, blobOrFile) {
      if (id && blobOrFile) {
        rawMediaCache.set(id, blobOrFile);
      }
    },

    getRaw(id) {
      return rawMediaCache.get(id) || null;
    },

    deleteRaw(id) {
      rawMediaCache.delete(id);
    },

    clearRawCache() {
      rawMediaCache.clear();
    },

    createTrackedURL(blob) {
      return createTrackedObjectURL(blob);
    },

    revokeTrackedURL(url) {
      revokeTrackedObjectURL(url);
    },

    cleanupObjectURLs() {
      cleanupAllObjectURLs();
    },

    /**
     * Create clean, serializable media reference
     */
    createReference(meta = {}) {
      return {
        id: String(meta.id || `media_${Date.now()}`),
        provider: meta.provider || 'temporary',
        providerId: meta.providerId || meta.id || '',
        url: meta.url || '',
        mimeType: meta.mimeType || 'image/jpeg',
        size: typeof meta.size === 'number' ? meta.size : 0,
        width: typeof meta.width === 'number' ? meta.width : null,
        height: typeof meta.height === 'number' ? meta.height : null,
        duration: typeof meta.duration === 'number' ? meta.duration : null,
        alt: meta.alt ? String(meta.alt).replace(/[<>]/g, '') : '',
        role: meta.role || null
      };
    },

    /**
     * Inspect file dimensions (width/height) async
     */
    async getImageDimensions(fileOrBlob) {
      if (typeof window === 'undefined' || typeof Image === 'undefined') {
        return { width: 1000, height: 1000 };
      }
      return new Promise((resolve) => {
        const url = URL.createObjectURL(fileOrBlob);
        const img = new Image();
        img.onload = () => {
          const dims = { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
          URL.revokeObjectURL(url);
          resolve(dims);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve({ width: null, height: null });
        };
        img.src = url;
      });
    },

    /**
     * Inspect video duration & dimensions async
     */
    async getVideoMetadata(fileOrBlob) {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        return { duration: 30, width: 1920, height: 1080 };
      }
      return new Promise((resolve) => {
        const url = URL.createObjectURL(fileOrBlob);
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
          const meta = {
            duration: Math.round(video.duration || 0),
            width: video.videoWidth || 0,
            height: video.videoHeight || 0
          };
          URL.revokeObjectURL(url);
          resolve(meta);
        };
        video.onerror = () => {
          URL.revokeObjectURL(url);
          resolve({ duration: null, width: null, height: null });
        };
        video.src = url;
      });
    },

    /**
     * Inspect audio duration async
     */
    async getAudioMetadata(fileOrBlob) {
      if (typeof window === 'undefined' || typeof Audio === 'undefined') {
        return { duration: 30 };
      }
      return new Promise((resolve) => {
        const url = URL.createObjectURL(fileOrBlob);
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => {
          const duration = Math.round(audio.duration || 0);
          URL.revokeObjectURL(url);
          resolve({ duration });
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          resolve({ duration: null });
        };
        audio.src = url;
      });
    }
  };

  // ---------------------------------------------------------------------------
  // 3. AUDIO DUCKING & SOUNDSCAPE RUNTIME (Rule 69 & 70)
  // ---------------------------------------------------------------------------
  class AudioRuntimeController {
    constructor() {
      this.bgMusicAudio = null;
      this.voiceAudio = null;
      this.duckingEnabled = true;
      this.normalMusicVolume = 0.8;
      this.duckedMusicVolume = 0.2;
      this.isVoicePlaying = false;
    }

    setMusicAudio(audioEl) {
      this.bgMusicAudio = audioEl;
      if (audioEl) audioEl.volume = this.isVoicePlaying ? this.duckedMusicVolume : this.normalMusicVolume;
    }

    setVoiceAudio(audioEl) {
      this.voiceAudio = audioEl;
    }

    onVoicePlay() {
      this.isVoicePlaying = true;
      if (this.duckingEnabled && this.bgMusicAudio) {
        this.bgMusicAudio.volume = this.duckedMusicVolume;
      }
    }

    onVoiceEnd() {
      this.isVoicePlaying = false;
      if (this.bgMusicAudio) {
        this.bgMusicAudio.volume = this.normalMusicVolume;
      }
    }

    stopAll() {
      if (this.bgMusicAudio) {
        try {
          this.bgMusicAudio.pause();
        } catch (e) {}
      }
      if (this.voiceAudio) {
        try {
          this.voiceAudio.pause();
        } catch (e) {}
      }
      this.isVoicePlaying = false;
    }
  }

  const WishMagicAudioRuntime = new AudioRuntimeController();

  // ---------------------------------------------------------------------------
  // 4. SAFE VOICE RECORDER MANAGER (Rule 37, 91, 92, 93)
  // ---------------------------------------------------------------------------
  class SafeVoiceRecorder {
    constructor() {
      this.mediaRecorder = null;
      this.stream = null;
      this.audioChunks = [];
      this.isRecording = false;
      this.timer = null;
      this.elapsedSeconds = 0;
    }

    async start(options = {}) {
      if (this.isRecording) {
        this.stop();
      }

      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('BROWSER_UNSUPPORTED: Microphone recording is not supported in this environment.');
      }

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        const error = new Error('Microphone access is needed to record a voice note.');
        error.code = 'PERMISSION_DENIED';
        throw error;
      }

      this.audioChunks = [];
      this.elapsedSeconds = 0;

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      try {
        this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
      } catch (e) {
        this.cleanupStream();
        throw new Error('MediaRecorder unavailable or unsupported codec.');
      }

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(250);
      this.isRecording = true;

      const maxDuration = options.maxDuration || 180;
      this.timer = setInterval(() => {
        this.elapsedSeconds++;
        if (typeof options.onTick === 'function') {
          options.onTick(this.elapsedSeconds);
        }
        if (this.elapsedSeconds >= maxDuration) {
          this.stop();
        }
      }, 1000);
    }

    stop() {
      return new Promise((resolve) => {
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }

        if (!this.mediaRecorder || !this.isRecording) {
          this.cleanupStream();
          resolve(null);
          return;
        }

        this.mediaRecorder.onstop = () => {
          const mimeType = this.mediaRecorder ? this.mediaRecorder.mimeType : 'audio/webm';
          const blob = new Blob(this.audioChunks, { type: mimeType });
          const duration = this.elapsedSeconds;
          this.cleanupStream();
          this.isRecording = false;

          resolve({
            blob,
            duration,
            mimeType
          });
        };

        try {
          this.mediaRecorder.stop();
        } catch (e) {
          this.cleanupStream();
          this.isRecording = false;
          resolve(null);
        }
      });
    }

    cancel() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      if (this.mediaRecorder && this.isRecording) {
        try {
          this.mediaRecorder.stop();
        } catch (e) {}
      }
      this.cleanupStream();
      this.audioChunks = [];
      this.isRecording = false;
    }

    cleanupStream() {
      if (this.stream) {
        try {
          this.stream.getTracks().forEach((track) => {
            if (typeof track.stop === 'function') track.stop();
          });
        } catch (e) {}
        this.stream = null;
      }
      this.mediaRecorder = null;
    }
  }

  // ---------------------------------------------------------------------------
  // 5. MEDIA STATE VALIDATOR (Rule 59)
  // ---------------------------------------------------------------------------
  function validateMediaState(mediaState, mediaCapabilities) {
    const errors = [];
    if (!mediaCapabilities || !Array.isArray(mediaCapabilities.slots)) {
      return { valid: true, errors: [] };
    }

    const state = mediaState || {};

    mediaCapabilities.slots.forEach(slot => {
      const slotId = slot.id;
      const val = state[slotId];

      if (slot.multiple) {
        const items = Array.isArray(val) ? val : [];

        // Required / Min items
        if (slot.required && items.length === 0) {
          errors.push({
            mediaId: slotId,
            code: 'REQUIRED',
            message: `${slot.label || slotId} is required.`
          });
          return;
        }

        if (typeof slot.minItems === 'number' && items.length < slot.minItems) {
          errors.push({
            mediaId: slotId,
            code: 'MIN_ITEMS',
            message: `${slot.label || slotId}: At least ${slot.minItems} items are required (currently ${items.length}).`
          });
        }

        if (typeof slot.maxItems === 'number' && items.length > slot.maxItems) {
          errors.push({
            mediaId: slotId,
            code: 'MAX_ITEMS',
            message: `${slot.label || slotId}: Maximum ${slot.maxItems} items allowed (currently ${items.length}).`
          });
        }

        // Validate each item
        items.forEach((item, idx) => {
          validateSingleMediaRef(item, slot, `${slotId}[${idx}]`, errors);
        });
      } else {
        // Single Slot
        if (slot.required && (!val || !val.url)) {
          errors.push({
            mediaId: slotId,
            code: 'REQUIRED',
            message: `${slot.label || slotId} is required.`
          });
          return;
        }

        if (val) {
          validateSingleMediaRef(val, slot, slotId, errors);
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  function validateSingleMediaRef(ref, slot, contextId, errors) {
    if (!ref || typeof ref !== 'object') {
      errors.push({
        mediaId: contextId,
        code: 'INVALID_FORMAT',
        message: `${slot.label || contextId} must be a valid media reference.`
      });
      return;
    }

    // MIME Validation
    if (slot.accept && Array.isArray(slot.accept) && slot.accept.length > 0) {
      const declaredAccept = slot.accept.map(a => a.toLowerCase().trim());
      const itemMime = (ref.mimeType || '').toLowerCase().trim();
      if (itemMime) {
        const matched = declaredAccept.some(acc => {
          if (acc.endsWith('/*')) {
            const prefix = acc.split('/')[0];
            return itemMime.startsWith(prefix + '/');
          }
          return acc === itemMime;
        });
        if (!matched) {
          errors.push({
            mediaId: contextId,
            code: 'INVALID_MIME',
            message: `${slot.label || contextId}: Unsupported file type "${itemMime}". Accepted: ${declaredAccept.join(', ')}.`
          });
        }
      }
    }

    // Size Limit Validation
    if (typeof slot.maxSizeBytes === 'number' && typeof ref.size === 'number' && ref.size > slot.maxSizeBytes) {
      const mbMax = (slot.maxSizeBytes / (1024 * 1024)).toFixed(1);
      const mbActual = (ref.size / (1024 * 1024)).toFixed(1);
      errors.push({
        mediaId: contextId,
        code: 'MAX_SIZE',
        message: `${slot.label || contextId}: File size (${mbActual} MB) exceeds maximum allowed size (${mbMax} MB).`
      });
    }

    // Dimensions validation (Images)
    if (typeof ref.width === 'number' && typeof ref.height === 'number') {
      if (typeof slot.minWidth === 'number' && ref.width < slot.minWidth) {
        errors.push({
          mediaId: contextId,
          code: 'MIN_WIDTH',
          message: `${slot.label || contextId}: Width (${ref.width}px) is less than minimum ${slot.minWidth}px.`
        });
      }
      if (typeof slot.minHeight === 'number' && ref.height < slot.minHeight) {
        errors.push({
          mediaId: contextId,
          code: 'MIN_HEIGHT',
          message: `${slot.label || contextId}: Height (${ref.height}px) is less than minimum ${slot.minHeight}px.`
        });
      }
      if (typeof slot.maxWidth === 'number' && ref.width > slot.maxWidth) {
        errors.push({
          mediaId: contextId,
          code: 'MAX_WIDTH',
          message: `${slot.label || contextId}: Width (${ref.width}px) exceeds maximum ${slot.maxWidth}px.`
        });
      }
      if (typeof slot.maxHeight === 'number' && ref.height > slot.maxHeight) {
        errors.push({
          mediaId: contextId,
          code: 'MAX_HEIGHT',
          message: `${slot.label || contextId}: Height (${ref.height}px) exceeds maximum ${slot.maxHeight}px.`
        });
      }
    }

    // Duration validation (Audio / Video / Voice)
    if (typeof ref.duration === 'number') {
      if (typeof slot.minDuration === 'number' && ref.duration < slot.minDuration) {
        errors.push({
          mediaId: contextId,
          code: 'MIN_DURATION',
          message: `${slot.label || contextId}: Duration (${ref.duration}s) is shorter than minimum ${slot.minDuration}s.`
        });
      }
      if (typeof slot.maxDuration === 'number' && ref.duration > slot.maxDuration) {
        errors.push({
          mediaId: contextId,
          code: 'MAX_DURATION',
          message: `${slot.label || contextId}: Duration (${ref.duration}s) exceeds maximum ${slot.maxDuration}s.`
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. MEDIA STATE NORMALIZER (Rule 81)
  // ---------------------------------------------------------------------------
  function normalizeMediaState(currentMedia, templateCapabilities) {
    if (!templateCapabilities || !Array.isArray(templateCapabilities.slots)) {
      return {};
    }

    const nextMedia = {};
    const slotsMap = new Map();
    templateCapabilities.slots.forEach(slot => slotsMap.set(slot.id, slot));

    const source = currentMedia || {};

    slotsMap.forEach((slot, slotId) => {
      const existing = source[slotId];
      if (existing === undefined || existing === null) return;

      if (slot.multiple) {
        if (Array.isArray(existing)) {
          // Keep only items matching slot maxItems
          let validItems = existing.filter(item => item && typeof item === 'object');
          if (typeof slot.maxItems === 'number' && validItems.length > slot.maxItems) {
            validItems = validItems.slice(0, slot.maxItems);
          }
          nextMedia[slotId] = validItems;
        }
      } else {
        if (typeof existing === 'object' && !Array.isArray(existing)) {
          nextMedia[slotId] = existing;
        }
      }
    });

    return nextMedia;
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------
  const exportsObj = {
    PROTOCOL_VERSION,
    STANDARD_MEDIA_TYPES,
    STANDARD_MEDIA_ROLES,
    TemporaryMediaProvider,
    WishMagicMediaRuntime,
    WishMagicAudioRuntime,
    SafeVoiceRecorder,
    validateMediaState,
    normalizeMediaState,
    createTrackedObjectURL,
    revokeTrackedObjectURL,
    cleanupAllObjectURLs
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
  global.WishMagicMediaRuntime = WishMagicMediaRuntime;
  global.WishMagicAudioRuntime = WishMagicAudioRuntime;
  global.SafeVoiceRecorder = SafeVoiceRecorder;
  global.validateMediaState = validateMediaState;
  global.normalizeMediaState = normalizeMediaState;
})(typeof window !== 'undefined' ? window : globalThis);
