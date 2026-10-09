// WishMagic Universal Advanced Media System
// Part 5: Photos, Multi-Image Gallery, Music Soundscape & Voice Notes

(function(window) {
  'use strict';

  // Configurable limits
  const CONFIG = {
    MAX_PHOTO_SIZE_BYTES: 8 * 1024 * 1024, // 8MB
    MAX_AUDIO_SIZE_BYTES: 15 * 1024 * 1024, // 15MB
    MAX_RECORDING_SECONDS: 120, // 2 minutes max
    DEFAULT_MAX_PHOTOS: 8,
    ACCEPTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
    ACCEPTED_AUDIO_TYPES: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/aac', 'audio/x-m4a', 'audio/m4a']
  };

  // Curated soundscape tracks with authentic melodic synthesis & high-quality audio files
  const CURATED_TRACKS = [
    {
      id: 'celebration-strings',
      title: 'Celebration Acoustic Strings',
      genre: 'Indie Celebration',
      duration: '2:40',
      src: '/audio/celebration-strings.mp3',
      melody: [523.25, 659.25, 783.99, 1046.50, 783.99, 659.25, 880.00, 698.46],
      tempo: 420,
      wave: 'triangle'
    },
    {
      id: 'celestial-waltz',
      title: 'Celestial Waltz Violin & Strings',
      genre: 'Romantic Classic',
      duration: '3:15',
      src: '/audio/romantic-piano.mp3',
      melody: [440.00, 554.37, 659.25, 880.00, 830.61, 659.25, 554.37],
      tempo: 500,
      wave: 'sine'
    },
    {
      id: 'midnight-stardust',
      title: 'Midnight Stardust Chimes',
      genre: 'Ambient Synth',
      duration: '2:10',
      src: '/audio/golden-nostalgia.mp3',
      melody: [587.33, 739.99, 880.00, 1174.66, 880.00, 739.99],
      tempo: 360,
      wave: 'sine'
    },
    {
      id: 'acoustic-harmony',
      title: 'Acoustic Harmony Guitar',
      genre: 'Warm & Timeless',
      duration: '2:50',
      src: '/audio/celebration-strings.mp3',
      melody: [329.63, 392.00, 493.88, 587.33, 493.88, 392.00],
      tempo: 460,
      wave: 'triangle'
    },
    {
      id: 'upbeat-ukulele',
      title: 'Upbeat Indie Ukulele Party',
      genre: 'Playful & Cheerful',
      duration: '2:20',
      src: '/audio/celebration-strings.mp3',
      melody: [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 1046.50],
      tempo: 280,
      wave: 'triangle'
    },
    {
      id: 'peaceful-piano',
      title: 'Peaceful Piano & Acoustic Cello',
      genre: 'Reverent & Gentle',
      duration: '2:35',
      src: '/audio/golden-nostalgia.mp3',
      melody: [349.23, 440.00, 523.25, 698.46, 523.25, 440.00],
      tempo: 540,
      wave: 'sine'
    }
  ];

  // ---------------------------------------------------------------------------
  // IMAGE PROCESSING & VALIDATION ENGINE
  // ---------------------------------------------------------------------------
  const ImageProcessor = {
    validateFile(file) {
      if (!file) {
        return { valid: false, error: 'No file selected.' };
      }
      const type = (file.type || '').toLowerCase();
      const validTypes = CONFIG.ACCEPTED_IMAGE_TYPES;
      const isTypeOk = validTypes.includes(type) || /\.(jpe?g|png|webp)$/i.test(file.name);

      if (!isTypeOk) {
        return {
          valid: false,
          error: `Unsupported image format (${file.type || 'unknown'}). Please upload JPG, PNG, or WEBP.`
        };
      }

      if (file.size > CONFIG.MAX_PHOTO_SIZE_BYTES) {
        return {
          valid: false,
          error: 'Image is too large. Please choose a smaller image (under 8MB).'
        };
      }

      return { valid: true };
    },

    // Decodes, tests for corruption, and optionally downscales oversized images
    processImageFile(file, maxDimension = 1600, quality = 0.88) {
      return new Promise((resolve, reject) => {
        const validation = this.validateFile(file);
        if (!validation.valid) {
          return reject(new Error(validation.error));
        }

        const reader = new FileReader();
        reader.onerror = () => {
          reject(new Error('Unable to read the image file. Please choose another image.'));
        };

        reader.onload = (e) => {
          const rawDataUrl = e.target.result;
          const img = new Image();

          img.onerror = () => {
            reject(new Error('Unable to decode image. The file may be corrupted or unreadable.'));
          };

          img.onload = () => {
            try {
              let width = img.naturalWidth || img.width;
              let height = img.naturalHeight || img.height;

              if (!width || !height) {
                return reject(new Error('Image dimensions could not be read. File may be corrupted.'));
              }

              // Downscale if oversized to preserve memory and keep preview responsive
              let targetWidth = width;
              let targetHeight = height;

              if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                  targetWidth = maxDimension;
                  targetHeight = Math.round((height * maxDimension) / width);
                } else {
                  targetHeight = maxDimension;
                  targetWidth = Math.round((width * maxDimension) / height);
                }
              }

              const canvas = document.createElement('canvas');
              canvas.width = targetWidth;
              canvas.height = targetHeight;
              const ctx = canvas.getContext('2d');
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';

              ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

              // Use jpeg for photos if large, webp if supported, or preserve png if small
              let outputType = 'image/jpeg';
              if (file.type === 'image/png' && file.size < 500 * 1024) {
                outputType = 'image/png';
              }

              const optimizedDataUrl = canvas.toDataURL(outputType, quality);
              resolve({
                src: optimizedDataUrl,
                width: targetWidth,
                height: targetHeight,
                name: file.name,
                originalSize: file.size
              });
            } catch (err) {
              console.warn('Canvas optimization fallback to raw DataURL:', err);
              resolve({
                src: rawDataUrl,
                width: img.width,
                height: img.height,
                name: file.name,
                originalSize: file.size
              });
            }
          };

          img.src = rawDataUrl;
        };

        reader.readAsDataURL(file);
      });
    }
  };

  // ---------------------------------------------------------------------------
  // AUDIO & SYNTHESIZER ENGINE (Web Audio API + HTML5 Audio)
  // ---------------------------------------------------------------------------
  class AudioEngine {
    constructor() {
      this.synthCtx = null;
      this.isPlayingSynth = false;
      this.activeTrackId = null;
      this.synthLoopTimer = null;
      this.htmlAudio = null;
      this.volume = 0.8;
      this.currentTime = 0;
      this.duration = 0;
      this.onTimeUpdateCallback = null;
      this.onStateChangeCallback = null;
    }

    getTracks() {
      return CURATED_TRACKS;
    }

    setVolume(val) {
      this.volume = Math.max(0, Math.min(1, parseFloat(val) || 0.8));
      if (this.htmlAudio) {
        this.htmlAudio.volume = this.volume;
      }
    }

    stopAll() {
      // 1. Stop synth
      this.isPlayingSynth = false;
      if (this.synthLoopTimer) {
        clearTimeout(this.synthLoopTimer);
        this.synthLoopTimer = null;
      }
      if (this.synthCtx) {
        try {
          this.synthCtx.close();
        } catch (e) {}
        this.synthCtx = null;
      }

      // 2. Stop HTML audio
      if (this.htmlAudio) {
        try {
          this.htmlAudio.pause();
          this.htmlAudio.currentTime = 0;
        } catch (e) {}
        this.htmlAudio = null;
      }

      this.activeTrackId = null;
      if (typeof this.onStateChangeCallback === 'function') {
        this.onStateChangeCallback(false, null);
      }
    }

    playCuratedTrack(trackId, onTimeUpdate, onStateChange) {
      this.stopAll();

      const track = CURATED_TRACKS.find(t => t.id === trackId) || CURATED_TRACKS[0];
      this.activeTrackId = track.id;
      this.onTimeUpdateCallback = onTimeUpdate;
      this.onStateChangeCallback = onStateChange;

      // Prefer high-fidelity real audio file when available
      if (track && track.src) {
        try {
          this.htmlAudio = new Audio(track.src);
          this.htmlAudio.volume = this.volume;
          this.htmlAudio.ontimeupdate = () => {
            if (typeof this.onTimeUpdateCallback === 'function' && this.htmlAudio) {
              this.onTimeUpdateCallback(this.htmlAudio.currentTime, this.htmlAudio.duration || 160);
            }
          };
          this.htmlAudio.onended = () => {
            this.stopAll();
          };
          this.htmlAudio.onerror = () => {
            console.warn('[AudioEngine] HTML audio error, fallback to synth');
            this.playMelodicSynth(track);
          };
          const playPromise = this.htmlAudio.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              if (typeof this.onStateChangeCallback === 'function') {
                this.onStateChangeCallback(true, track);
              }
            }).catch(err => {
              console.warn('[AudioEngine] Autoplay restriction or format error, fallback to synth:', err);
              this.playMelodicSynth(track);
            });
          }
          return;
        } catch (err) {
          console.warn('[AudioEngine] Failed to init HTML audio, fallback to synth:', err);
        }
      }

      this.playMelodicSynth(track);
    }

    playMelodicSynth(track) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) throw new Error('Web Audio not supported');

        this.synthCtx = new AudioCtx();
        if (this.synthCtx.state === 'suspended') {
          this.synthCtx.resume();
        }

        this.isPlayingSynth = true;
        let noteIndex = 0;
        let elapsedSeconds = 0;
        const totalDurationSeconds = 160; // 2:40 nominal

        if (typeof this.onStateChangeCallback === 'function') {
          this.onStateChangeCallback(true, track);
        }

        const self = this;
        function playStep() {
          if (!self.isPlayingSynth || !self.synthCtx) return;

          const freq = track.melody[noteIndex % track.melody.length];
          const osc = self.synthCtx.createOscillator();
          const gain = self.synthCtx.createGain();

          osc.type = track.wave || 'triangle';
          osc.frequency.setValueAtTime(freq, self.synthCtx.currentTime);

          // Soft ambient volume curve
          const peakGain = 0.14 * self.volume;
          gain.gain.setValueAtTime(0.001, self.synthCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(peakGain, self.synthCtx.currentTime + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, self.synthCtx.currentTime + 0.65);

          osc.connect(gain);
          gain.connect(self.synthCtx.destination);

          osc.start();
          osc.stop(self.synthCtx.currentTime + 0.7);

          noteIndex++;
          elapsedSeconds += (track.tempo / 1000);

          if (typeof self.onTimeUpdateCallback === 'function') {
            const curSec = Math.floor(elapsedSeconds) % totalDurationSeconds;
            self.onTimeUpdateCallback(curSec, totalDurationSeconds);
          }

          self.synthLoopTimer = setTimeout(playStep, track.tempo);
        }

        playStep();
      } catch (err) {
        console.warn('Audio synthesis restricted:', err);
        if (typeof this.onStateChangeCallback === 'function') {
          this.onStateChangeCallback(false, track);
        }
      }
    }

    playCustomAudio(src, onTimeUpdate, onStateChange) {
      this.stopAll();
      this.onTimeUpdateCallback = onTimeUpdate;
      this.onStateChangeCallback = onStateChange;

      this.htmlAudio = new Audio(src);
      this.htmlAudio.volume = this.volume;

      this.htmlAudio.ontimeupdate = () => {
        if (typeof this.onTimeUpdateCallback === 'function' && this.htmlAudio) {
          this.onTimeUpdateCallback(this.htmlAudio.currentTime, this.htmlAudio.duration || 0);
        }
      };

      this.htmlAudio.onended = () => {
        this.stopAll();
      };

      this.htmlAudio.onerror = () => {
        console.warn('Custom audio playback error');
        this.stopAll();
      };

      this.htmlAudio.play()
        .then(() => {
          if (typeof this.onStateChangeCallback === 'function') {
            this.onStateChangeCallback(true, { title: 'Custom Audio' });
          }
        })
        .catch(err => {
          console.warn('Audio play restricted by browser:', err);
          this.stopAll();
        });
    }

    seek(fraction) {
      if (this.htmlAudio && this.htmlAudio.duration) {
        this.htmlAudio.currentTime = Math.max(0, Math.min(this.htmlAudio.duration, fraction * this.htmlAudio.duration));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // VOICE NOTE RECORDER (MediaRecorder API)
  // ---------------------------------------------------------------------------
  class VoiceRecorder {
    constructor() {
      this.mediaRecorder = null;
      this.audioChunks = [];
      this.isRecording = false;
      this.recordingSeconds = 0;
      this.timerInterval = null;
      this.stream = null;
    }

    isSupported() {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    }

    async startRecording(onTick, onComplete, onError) {
      if (!this.isSupported()) {
        if (typeof onError === 'function') {
          onError(new Error("Voice recording isn't supported here. You can upload an audio file instead."));
        }
        return;
      }

      if (this.isRecording) {
        this.stopRecording();
        return;
      }

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.audioChunks = [];
        this.recordingSeconds = 0;

        // Choose appropriate MIME format supported by browser
        let mimeType = 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }

        this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            this.audioChunks.push(e.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          const audioUrl = URL.createObjectURL(audioBlob);
          const finalDuration = this.recordingSeconds;

          // Release mic stream
          if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
          }

          if (typeof onComplete === 'function') {
            onComplete({
              blob: audioBlob,
              url: audioUrl,
              duration: finalDuration,
              mimeType
            });
          }
        };

        this.mediaRecorder.start(250); // Slice chunks every 250ms
        this.isRecording = true;

        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
          this.recordingSeconds++;
          if (typeof onTick === 'function') {
            onTick(this.recordingSeconds);
          }

          if (this.recordingSeconds >= CONFIG.MAX_RECORDING_SECONDS) {
            this.stopRecording();
          }
        }, 1000);

        if (typeof onTick === 'function') {
          onTick(0);
        }

      } catch (err) {
        console.error('Mic access error:', err);
        if (typeof onError === 'function') {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            onError(new Error('Microphone permission was denied. You can upload an audio file instead.'));
          } else {
            onError(new Error(`Could not access microphone: ${err.message || 'Permission or hardware issue'}`));
          }
        }
      }
    }

    stopRecording() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      this.isRecording = false;

      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try {
          this.mediaRecorder.stop();
        } catch (e) {}
      }
    }

    cancelRecording() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      this.isRecording = false;
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
      }
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try {
          this.mediaRecorder.stop();
        } catch (e) {}
      }
      this.audioChunks = [];
    }
  }

  // ---------------------------------------------------------------------------
  // LIGHTBOX PREVIEW MODAL
  // ---------------------------------------------------------------------------
  class LightboxModal {
    constructor() {
      this.modalEl = null;
      this.photos = [];
      this.currentIndex = 0;
      this.boundKeyHandler = this.handleKeyDown.bind(this);
    }

    createDOM() {
      if (this.modalEl) return;

      this.modalEl = document.createElement('div');
      this.modalEl.id = 'wishmagic-media-lightbox';
      this.modalEl.className = 'fixed inset-0 z-[100] bg-black/92 backdrop-blur-2xl flex flex-col justify-between p-4 sm:p-6 transition-opacity duration-300 opacity-0 pointer-events-none';

      this.modalEl.innerHTML = `
        <!-- Top Toolbar -->
        <div class="flex items-center justify-between text-white z-10">
          <div class="flex items-center gap-3">
            <span class="text-xl">📸</span>
            <div>
              <h4 id="lightbox-title" class="text-xs sm:text-sm font-bold truncate max-w-[200px] sm:max-w-xs text-white">Photo Preview</h4>
              <p id="lightbox-counter" class="text-[11px] text-purple-300 font-mono">1 / 1</p>
            </div>
          </div>
          <button id="lightbox-btn-close" class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center text-sm transition" title="Close (Esc)">
            ✕
          </button>
        </div>

        <!-- Center Image Stage with Arrows -->
        <div class="relative flex-1 flex items-center justify-center my-4 overflow-hidden select-none">
          <button id="lightbox-btn-prev" class="absolute left-2 sm:left-4 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-lg active:scale-95 transition" title="Previous (Left Arrow)">
            ◀
          </button>
          
          <div class="max-w-4xl max-h-[75vh] flex items-center justify-center p-2">
            <img id="lightbox-main-img" src="" alt="Full Preview" class="max-w-full max-h-[72vh] object-contain rounded-2xl shadow-2xl transition-transform duration-200"/>
          </div>

          <button id="lightbox-btn-next" class="absolute right-2 sm:right-4 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-lg active:scale-95 transition" title="Next (Right Arrow)">
            ▶
          </button>
        </div>

        <!-- Bottom Controls & Thumbnails Strip -->
        <div class="flex flex-col items-center gap-2 z-10 pb-2">
          <div id="lightbox-thumbs-strip" class="flex items-center gap-2 max-w-full overflow-x-auto p-1.5 scrollbar-thin"></div>
          <p class="text-[10px] text-white/50">Tip: Use Arrow keys ◀ ▶ to navigate • Esc to close</p>
        </div>
      `;

      document.body.appendChild(this.modalEl);

      // Event handlers
      this.modalEl.querySelector('#lightbox-btn-close').addEventListener('click', () => this.close());
      this.modalEl.querySelector('#lightbox-btn-prev').addEventListener('click', () => this.prev());
      this.modalEl.querySelector('#lightbox-btn-next').addEventListener('click', () => this.next());

      // Backdrop click closes
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) this.close();
      });
    }

    open(photos, initialIndex = 0) {
      if (!photos || photos.length === 0) return;
      this.createDOM();
      this.photos = photos;
      this.currentIndex = Math.max(0, Math.min(photos.length - 1, initialIndex));

      this.updateView();

      this.modalEl.classList.remove('opacity-0', 'pointer-events-none');
      this.modalEl.classList.add('opacity-100');
      document.addEventListener('keydown', this.boundKeyHandler);
    }

    close() {
      if (!this.modalEl) return;
      this.modalEl.classList.add('opacity-0', 'pointer-events-none');
      this.modalEl.classList.remove('opacity-100');
      document.removeEventListener('keydown', this.boundKeyHandler);
    }

    prev() {
      if (this.photos.length <= 1) return;
      this.currentIndex = (this.currentIndex - 1 + this.photos.length) % this.photos.length;
      this.updateView();
    }

    next() {
      if (this.photos.length <= 1) return;
      this.currentIndex = (this.currentIndex + 1) % this.photos.length;
      this.updateView();
    }

    handleKeyDown(e) {
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowLeft') this.prev();
      else if (e.key === 'ArrowRight') this.next();
    }

    updateView() {
      const photo = this.photos[this.currentIndex];
      if (!photo) return;

      const mainImg = this.modalEl.querySelector('#lightbox-main-img');
      const title = this.modalEl.querySelector('#lightbox-title');
      const counter = this.modalEl.querySelector('#lightbox-counter');
      const thumbsStrip = this.modalEl.querySelector('#lightbox-thumbs-strip');

      mainImg.src = photo.src || photo.url;
      mainImg.alt = photo.name || `Photo ${this.currentIndex + 1}`;
      title.textContent = photo.name || `Cherished Memory #${this.currentIndex + 1}`;
      counter.textContent = `${this.currentIndex + 1} / ${this.photos.length}`;

      // Populate thumb strip
      thumbsStrip.innerHTML = '';
      this.photos.forEach((p, idx) => {
        const thumbBtn = document.createElement('button');
        thumbBtn.className = `w-12 h-12 rounded-xl overflow-hidden border-2 transition-all flex-shrink-0 cursor-pointer ${
          idx === this.currentIndex ? 'border-pink-500 scale-105' : 'border-white/20 opacity-60 hover:opacity-100'
        }`;
        thumbBtn.innerHTML = `<img src="${p.src || p.url}" class="w-full h-full object-cover"/>`;
        thumbBtn.onclick = () => {
          this.currentIndex = idx;
          this.updateView();
        };
        thumbsStrip.appendChild(thumbBtn);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // CENTRALIZED MEDIA STATE NORMALIZER & MODEL
  // ---------------------------------------------------------------------------
  function normalizeMediaState(customData) {
    if (!customData) return getInitialMediaState();

    const media = customData.media || {};
    const photosArray = Array.isArray(customData.photos) ? customData.photos : (Array.isArray(media.photos) ? media.photos : []);

    // Standardize photos list
    const standardizedPhotos = photosArray.map((p, idx) => {
      const src = p.src || p.url || '';
      return {
        id: p.id || ('photo_' + idx + '_' + Math.random().toString(36).substr(2, 4)),
        name: p.name || `Memory ${idx + 1}`,
        src: src,
        url: src,
        order: typeof p.order === 'number' ? p.order : idx,
        isCover: !!(p.isCover || customData.cover_photo === src || (idx === 0 && !customData.cover_photo))
      };
    });

    // Determine cover photo
    let cover = media.coverPhoto || customData.cover_photo;
    if (!cover && standardizedPhotos.length > 0) {
      const foundCover = standardizedPhotos.find(p => p.isCover);
      cover = foundCover ? foundCover.src : standardizedPhotos[0].src;
    }
    if (!cover && customData.photo_1) {
      cover = customData.photo_1;
    }

    // Standardize music
    const musicRaw = customData.music || media.music || {};
    const musicState = {
      enabled: musicRaw.enabled !== false,
      type: musicRaw.type || (musicRaw.trackId === 'custom_upload' || musicRaw.url ? 'upload' : 'curated'),
      name: musicRaw.name || musicRaw.title || 'Celebration Acoustic Strings',
      trackId: musicRaw.trackId || 'celebration-strings',
      src: musicRaw.src || musicRaw.url || '',
      genre: musicRaw.genre || 'Indie Celebration',
      duration: musicRaw.duration || '2:40'
    };

    // Standardize voice note
    const voiceRaw = customData.voice_note || media.voiceNote || {};
    const voiceState = {
      enabled: !!voiceRaw.enabled,
      type: voiceRaw.type || (voiceRaw.duration === 'Attached Audio' ? 'upload' : 'record'),
      name: voiceRaw.name || voiceRaw.fileName || 'Voice Dedication',
      src: voiceRaw.src || voiceRaw.url || '',
      duration: voiceRaw.duration || 0
    };

    return {
      coverPhoto: cover || null,
      photos: standardizedPhotos,
      music: musicState,
      voiceNote: voiceState,
      galleryLayout: media.galleryLayout || customData.galleryLayout || 'grid'
    };
  }

  function syncMediaToCustomData(mediaState, customData) {
    if (!mediaState || !customData) return;

    // 1. Maintain media state container
    customData.media = {
      coverPhoto: mediaState.coverPhoto,
      photos: mediaState.photos.map(p => ({
        id: p.id,
        name: p.name,
        src: p.src || p.url,
        order: p.order
      })),
      music: {
        enabled: mediaState.music.enabled,
        type: mediaState.music.type,
        name: mediaState.music.name,
        src: mediaState.music.src,
        trackId: mediaState.music.trackId,
        genre: mediaState.music.genre,
        duration: mediaState.music.duration
      },
      voiceNote: {
        enabled: mediaState.voiceNote.enabled,
        type: mediaState.voiceNote.type,
        name: mediaState.voiceNote.name,
        src: mediaState.voiceNote.src,
        duration: mediaState.voiceNote.duration
      },
      galleryLayout: mediaState.galleryLayout || 'grid'
    };

    // 2. Synchronize legacy fields for backward compatibility
    customData.cover_photo = mediaState.coverPhoto || '';
    customData.photo_1 = mediaState.coverPhoto || '';
    customData.galleryLayout = mediaState.galleryLayout || 'grid';

    customData.photos = mediaState.photos.map(p => ({
      id: p.id,
      url: p.src || p.url,
      name: p.name,
      isCover: (p.src || p.url) === mediaState.coverPhoto,
      order: p.order
    }));

    customData.music = {
      enabled: mediaState.music.enabled,
      trackId: mediaState.music.trackId || 'celebration-strings',
      title: mediaState.music.name || 'Celebration Acoustic Strings',
      url: mediaState.music.src || ''
    };

    customData.voice_note = {
      enabled: mediaState.voiceNote.enabled,
      url: mediaState.voiceNote.src || '',
      duration: typeof mediaState.voiceNote.duration === 'number' 
        ? `${mediaState.voiceNote.duration}s` 
        : (mediaState.voiceNote.duration || 'Attached Audio'),
      fileName: mediaState.voiceNote.name || 'Voice Note'
    };
  }

  function getInitialMediaState() {
    return {
      coverPhoto: null,
      photos: [],
      music: {
        enabled: true,
        type: 'curated',
        name: 'Celebration Acoustic Strings',
        trackId: 'celebration-strings',
        src: '',
        genre: 'Indie Celebration',
        duration: '2:40'
      },
      voiceNote: {
        enabled: false,
        type: 'none',
        name: '',
        src: '',
        duration: 0
      },
      galleryLayout: 'grid'
    };
  }

  // ---------------------------------------------------------------------------
  // TEMPLATE LIVE PREVIEW HYDRATOR & INJECTOR
  // Renders real interactive photos, gallery layouts, voice notes & music inside iframe
  // ---------------------------------------------------------------------------
  function hydrateTemplateMedia(doc, mediaState) {
    if (!doc || !mediaState) return;

    // 1. Update Cover Photo on all single photo slots
    const cover = mediaState.coverPhoto || (mediaState.photos.length > 0 ? (mediaState.photos[0].src || mediaState.photos[0].url) : null);
    if (cover) {
      doc.querySelectorAll('[data-wm="photo_1"], .cover-photo, .hero-photo, .celebrant-photo').forEach(img => {
        if (img.tagName === 'IMG') {
          img.src = cover;
        } else {
          img.style.backgroundImage = `url("${cover}")`;
        }
      });
    }

    // 2. Render or Update Dedicated Photo Gallery Container in Template
    let galleryHost = doc.getElementById('wishmagic-live-gallery-container');
    const existingPhotoBoxes = doc.querySelectorAll('.photo-box, .memory-card, [data-wm="photo_1"]');

    if (mediaState.photos && mediaState.photos.length > 1) {
      if (!galleryHost) {
        // Find suitable anchor point (after message card or memory card)
        const anchor = doc.querySelector('.memory-card, .photo-box, [data-wm="custom_message"], main') || doc.body;
        galleryHost = doc.createElement('div');
        galleryHost.id = 'wishmagic-live-gallery-container';
        galleryHost.className = 'w-full max-w-xl mx-auto my-6 px-4';

        if (anchor && anchor.parentNode && anchor !== doc.body) {
          anchor.parentNode.insertBefore(galleryHost, anchor.nextSibling);
        } else {
          doc.body.appendChild(galleryHost);
        }
      }

      galleryHost.style.display = 'block';
      const layout = mediaState.galleryLayout || 'grid';
      const photos = mediaState.photos;

      let layoutHTML = '';

      if (layout === 'polaroid') {
        // Nostalgic tilted polaroid frames with washi tape
        layoutHTML = `
          <div class="text-center mb-3">
            <span class="inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-white/20 backdrop-blur-md text-white/90 shadow-sm border border-white/20">
              📸 Polaroid Scrapbook Memories (${photos.length})
            </span>
          </div>
          <div class="flex flex-wrap items-center justify-center gap-4 py-2">
            ${photos.map((p, idx) => {
              const tilt = (idx % 2 === 0 ? -1 : 1) * ((idx % 3) + 2);
              return `
                <div class="polaroid-frame relative p-2.5 pb-6 bg-white dark:bg-neutral-900 rounded-sm shadow-2xl transition-transform duration-300 hover:scale-105 hover:z-20 cursor-pointer" style="transform: rotate(${tilt}deg); width: 140px;" data-lightbox-idx="${idx}">
                  <!-- Simulated tape -->
                  <div class="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-3 bg-amber-100/70 border border-amber-200/50 shadow-xs" style="transform: rotate(${-tilt * 1.5}deg);"></div>
                  <div class="aspect-square w-full overflow-hidden bg-neutral-800 rounded-xs mb-1.5">
                    <img src="${p.src || p.url}" alt="${p.name}" class="w-full h-full object-cover"/>
                  </div>
                  <p class="text-[9px] font-mono text-center text-neutral-700 dark:text-neutral-300 truncate px-1">${p.name || `#0${idx + 1}`}</p>
                </div>
              `;
            }).join('')}
          </div>
        `;
      } else if (layout === 'carousel') {
        // Horizontal scrollable filmstrip / carousel with indicators
        layoutHTML = `
          <div class="text-center mb-3">
            <span class="inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-white/20 backdrop-blur-md text-white/90 shadow-sm border border-white/20">
              🎞️ Memory Filmstrip Reel (${photos.length})
            </span>
          </div>
          <div class="relative overflow-hidden rounded-3xl bg-black/30 backdrop-blur-xl border border-white/20 p-3 shadow-2xl">
            <div class="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin snap-x snap-mandatory">
              ${photos.map((p, idx) => `
                <div class="flex-shrink-0 w-44 sm:w-52 aspect-[4/3] rounded-2xl overflow-hidden border border-white/20 shadow-lg snap-center relative group cursor-pointer" data-lightbox-idx="${idx}">
                  <img src="${p.src || p.url}" alt="${p.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"/>
                  <div class="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between text-white">
                    <span class="text-[10px] font-bold truncate">${p.name || `Memory #${idx + 1}`}</span>
                    ${p.isCover ? '<span class="px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-400 text-black">Cover</span>' : ''}
                  </div>
                </div>
              `).join('')}
            </div>
            <div class="flex items-center justify-center gap-1.5 pt-2">
              ${photos.map((_, i) => `<span class="w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-pink-400 w-3' : 'bg-white/40'}"></span>`).join('')}
            </div>
          </div>
        `;
      } else if (layout === 'masonry') {
        // Staggered columns
        layoutHTML = `
          <div class="text-center mb-3">
            <span class="inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-white/20 backdrop-blur-md text-white/90 shadow-sm border border-white/20">
              ✨ Organic Keepsake Mosaic (${photos.length})
            </span>
          </div>
          <div class="columns-2 sm:columns-3 gap-3 space-y-3">
            ${photos.map((p, idx) => {
              const heights = ['aspect-square', 'aspect-[3/4]', 'aspect-[4/3]'];
              const hClass = heights[idx % heights.length];
              return `
                <div class="break-inside-avoid rounded-2xl overflow-hidden border border-white/20 shadow-xl bg-black/40 group relative cursor-pointer ${hClass}" data-lightbox-idx="${idx}">
                  <img src="${p.src || p.url}" alt="${p.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"/>
                  <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                    <span>🔍 View</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      } else {
        // Default clean grid
        layoutHTML = `
          <div class="text-center mb-3">
            <span class="inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-white/20 backdrop-blur-md text-white/90 shadow-sm border border-white/20">
              📸 Cherished Memories Gallery (${photos.length})
            </span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            ${photos.map((p, idx) => `
              <div class="group relative aspect-square rounded-2xl overflow-hidden border border-white/20 shadow-xl bg-black/30 cursor-pointer" data-lightbox-idx="${idx}">
                <img src="${p.src || p.url}" alt="${p.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"/>
                <div class="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between text-white">
                  <span class="text-[10px] font-mono font-bold">#0${idx + 1}</span>
                  ${p.isCover ? '<span class="px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-400 text-black">Cover</span>' : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }

      galleryHost.innerHTML = layoutHTML;

      // Add click listeners to trigger lightbox in parent window
      galleryHost.querySelectorAll('[data-lightbox-idx]').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.getAttribute('data-lightbox-idx') || '0', 10);
          if (window.WishMediaSystem && window.WishMediaSystem.lightbox) {
            window.WishMediaSystem.lightbox.open(photos, idx);
          }
        });
      });
    } else if (galleryHost) {
      galleryHost.style.display = 'none';
      galleryHost.innerHTML = '';
    }

    // 3. Render or Update Voice Dedication Pill in Template
    let voiceHost = doc.getElementById('wishmagic-live-voice-widget');
    if (mediaState.voiceNote && mediaState.voiceNote.enabled && mediaState.voiceNote.src) {
      if (!voiceHost) {
        voiceHost = doc.createElement('div');
        voiceHost.id = 'wishmagic-live-voice-widget';
        voiceHost.className = 'w-full max-w-sm mx-auto my-4 px-4';
        const msgAnchor = doc.querySelector('[data-wm="custom_message"], .message-card, main') || doc.body;
        if (msgAnchor && msgAnchor.parentNode) {
          msgAnchor.parentNode.insertBefore(voiceHost, msgAnchor.nextSibling);
        } else {
          doc.body.appendChild(voiceHost);
        }
      }

      voiceHost.style.display = 'block';
      const durText = typeof mediaState.voiceNote.duration === 'number'
        ? `${mediaState.voiceNote.duration}s`
        : (mediaState.voiceNote.duration || 'Ready to play');

      voiceHost.innerHTML = `
        <div class="p-3 rounded-2xl bg-black/60 backdrop-blur-xl border border-pink-500/40 text-white shadow-2xl flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-base shadow-md">
              🎙️
            </div>
            <div>
              <h5 class="text-xs font-bold text-white">Voice Dedication Note</h5>
              <p class="text-[10px] text-pink-300 font-mono">${durText}</p>
            </div>
          </div>
          <audio controls src="${mediaState.voiceNote.src}" class="h-8 max-w-[170px]"></audio>
        </div>
      `;
    } else if (voiceHost) {
      voiceHost.style.display = 'none';
      voiceHost.innerHTML = '';
    }

    // 4. Render or Update Background Music Indicator in Template
    let musicHost = doc.getElementById('wishmagic-live-music-widget');
    if (mediaState.music && mediaState.music.enabled) {
      if (!musicHost) {
        musicHost = doc.createElement('div');
        musicHost.id = 'wishmagic-live-music-widget';
        musicHost.className = 'fixed bottom-4 right-4 z-40';
        doc.body.appendChild(musicHost);
      }

      musicHost.style.display = 'block';
      const title = mediaState.music.name || 'Celebration Acoustic Strings';

      musicHost.innerHTML = `
        <div class="px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-xl border border-white/20 text-white text-[11px] font-bold shadow-2xl flex items-center gap-1.5 cursor-pointer hover:bg-black/90 transition">
          <span class="animate-bounce">🎵</span>
          <span class="max-w-[120px] sm:max-w-[160px] truncate">${title}</span>
        </div>
      `;
    } else if (musicHost) {
      musicHost.style.display = 'none';
      musicHost.innerHTML = '';
    }
  }

  // ---------------------------------------------------------------------------
  // PUBLIC EXPORT API
  // ---------------------------------------------------------------------------
  window.WishMediaSystem = {
    CONFIG,
    CURATED_TRACKS,
    ImageProcessor,
    audioEngine: new AudioEngine(),
    voiceRecorder: new VoiceRecorder(),
    lightbox: new LightboxModal(),
    normalizeMediaState,
    syncMediaToCustomData,
    getInitialMediaState,
    hydrateTemplateMedia
  };

})(window);
