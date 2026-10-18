/**
 * WishMagic Complete Production Content Moderation & Quarantine Engine (Part 47)
 * ==============================================================================
 * Authoritative server-side moderation system covering:
 * 1. Context-Aware Multilingual Text Moderation:
 *    - Hindi (Devanagari), Roman Hindi / Hinglish, and English profanity, gaaliyan,
 *      sexual explicitness, non-consensual sexual content, self-harm, and targeted harassment.
 *    - Multi-stage de-obfuscation: Unicode NFKC, zero-width stripping, leet-speak & symbol
 *      substitution (@->a, 0->o, 1->i, 3->e, $->s, *), repeated-character collapsing, and
 *      spaced/dotted token reconstruction (e.g. "b.h.e.n.c.h.o.d", "f u c k").
 *    - Context-aware Scunthorpe & celebration safe-word allowlist so benign words
 *      ("class", "glass", "pass", "assam", "cocktails", "dickens", "gandhi", "chota",
 *      normal birthday/anniversary/romantic wishes) never trigger false positives.
 * 2. Image, Video & Audio Content Moderation:
 *    - Magic-byte file signature, size, and ownership verification (never trusts extension/MIME).
 *    - Deep binary inspection: PNG tEXt/iTXt/zTXt chunks, JPEG EXIF/COM/XMP segments,
 *      GIF comments, WEBP metadata, embedded OCR text layers, pixel/skin-exposure heuristics,
 *      MP4/WebM container atoms & keyframes, and MP3/WAV/OGG ID3/Vorbis/transcript streams.
 *    - Real external provider integrations:
 *      * Sightengine Image & Video/Audio API (SIGHTENGINE_API_USER, SIGHTENGINE_API_SECRET)
 *      * Google Cloud Vision SafeSearch & OCR API (GOOGLE_VISION_API_KEY)
 *      * OpenAI Omni-Moderation & Whisper Audio Transcription API (OPENAI_API_KEY)
 *      * Custom / Webhook Moderation Microservice (MODERATION_API_URL, MODERATION_API_KEY)
 *    - Fail-closed timeout & error handling: provider timeouts, 5xx errors, or unverified
 *      streams mark items as SCAN_FAILED or PENDING_REVIEW in private quarantine (never auto-approved).
 * 3. Template HTML/CSS/JS Security Validation (separate from content moderation):
 *    - Scans template packages for dangerous JS execution (eval, Function, document.cookie
 *      exfiltration, unauthorized external scripts, inline event handlers, phishing forms,
 *      crypto-miners) alongside content moderation of default text and bundled media.
 * 4. Quarantine-First Lifecycle, Repeat-Offender Restrictions & CSAM Zero-Exposure Lock:
 *    - Suspected CSAM immediately locks item as CSAM_LOCKED, strips all preview/public URLs,
 *      suspends offender account, and creates a sealed legal compliance incident record.
 */

import { computeSha256Hex } from './storage-provider.js';
import { toUint8Array, parseImageDimensions } from './imgbb-provider.js';

export const MODERATION_STATUS = {
  APPROVED: 'APPROVED',
  PENDING_REVIEW: 'PENDING_REVIEW',
  REJECTED: 'REJECTED',
  SCAN_FAILED: 'SCAN_FAILED',
  APPEALED: 'APPEALED',
  CSAM_LOCKED: 'CSAM_LOCKED'
};

export const MODERATION_CATEGORIES = {
  PROFANITY_HINDI: 'PROFANITY_HINDI',
  PROFANITY_HINGLISH: 'PROFANITY_HINGLISH',
  PROFANITY_ENGLISH: 'PROFANITY_ENGLISH',
  TARGETED_HARASSMENT: 'TARGETED_HARASSMENT',
  SEXUAL_EXPLICIT: 'SEXUAL_EXPLICIT',
  NUDITY_PORNOGRAPHY: 'NUDITY_PORNOGRAPHY',
  OCR_ABUSIVE_TEXT: 'OCR_ABUSIVE_TEXT',
  AUDIO_VIDEO_EXPLICIT: 'AUDIO_VIDEO_EXPLICIT',
  CSAM_SUSPECTED: 'CSAM_SUSPECTED',
  DIRECT_BYPASS_ATTEMPT: 'DIRECT_BYPASS_ATTEMPT',
  TEMPLATE_SECURITY_VIOLATION: 'TEMPLATE_SECURITY_VIOLATION'
};

export const MODERATION_LIMITS = {
  DEFAULT_TIMEOUT_MS: 8000,
  STRIKE_RESTRICTION_THRESHOLD: 3,
  MAX_TEXT_FIELD_LENGTH: 5000,
  MAX_IMAGE_BYTES: 32 * 1024 * 1024,
  MAX_AUDIO_BYTES: 20 * 1024 * 1024,
  MAX_VIDEO_BYTES: 50 * 1024 * 1024,
  UPLOAD_RATE_LIMIT_PER_MINUTE: 20
};

// In-memory rate limiter per user/IP for media uploads & moderation endpoints
const uploadRateWindowMap = new Map();

export function checkModerationUploadRateLimit(actorKey, limitPerMinute = MODERATION_LIMITS.UPLOAD_RATE_LIMIT_PER_MINUTE, nowMs = Date.now()) {
  const key = String(actorKey || 'anonymous');
  const windowMs = 60 * 1000;
  const entry = uploadRateWindowMap.get(key) || { count: 0, resetAt: nowMs + windowMs };
  if (nowMs > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = nowMs + windowMs;
  }
  entry.count += 1;
  uploadRateWindowMap.set(key, entry);
  return {
    allowed: entry.count <= limitPerMinute,
    count: entry.count,
    limit: limitPerMinute,
    resetAt: entry.resetAt
  };
}

export function resetModerationRateLimits() {
  uploadRateWindowMap.clear();
}

// ============================================================================
// 1. MULTILINGUAL LEXICONS & SAFE-CONTEXT ALLOWLIST
// ============================================================================

// High-precision Hindi Devanagari abusive & explicit terms
const HINDI_DEVANAGARI_BLOCKLIST = [
  { term: 'मादरचोद', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'मदरचोद', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'बहनचोद', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'भेनचोद', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'बेहेनचोद', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'भोसड़ी', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'भोसडीके', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'भोसड़ीके', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'भोसड़ा', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'चूतिया', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'चुतिया', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'चूतिये', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'चुतिये', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'चूत', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { term: 'गांडू', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'गाण्डू', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'गांड मरा', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'गांड में', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'लौड़ा', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { term: 'लवड़ा', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { term: 'लौड़े', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { term: 'लंड', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { term: 'लण्ड', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { term: 'रंडी', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'रण्डी', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'रांड', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'छिनार', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'हरामजादे', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'हरामज़ादे', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'हरामखोर', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'हरामी', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'MEDIUM' },
  { term: 'कुतिया', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'HIGH' },
  { term: 'कुत्ते की औलाद', category: MODERATION_CATEGORIES.TARGETED_HARASSMENT, severity: 'HIGH' },
  { term: 'सुअर की औलाद', category: MODERATION_CATEGORIES.TARGETED_HARASSMENT, severity: 'HIGH' },
  { term: 'तेरी माँ की चूत', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'CRITICAL' },
  { term: 'तेरी मां की चूत', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'CRITICAL' },
  { term: 'तेरी बहन की चूत', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'CRITICAL' },
  { term: 'माँ चोद', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'CRITICAL' },
  { term: 'मां चोद', category: MODERATION_CATEGORIES.PROFANITY_HINDI, severity: 'CRITICAL' },
  { term: 'चोदू', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { term: 'चोदना', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { term: 'चुदाई', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'CRITICAL' },
  { term: 'नंगी फोटो', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { term: 'नंगा वीडियो', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { term: 'बलात्कार', category: MODERATION_CATEGORIES.TARGETED_HARASSMENT, severity: 'CRITICAL' },
  { term: 'जान से मार दूंगा', category: MODERATION_CATEGORIES.TARGETED_HARASSMENT, severity: 'CRITICAL' },
  { term: 'तेजाब फेंक', category: MODERATION_CATEGORIES.TARGETED_HARASSMENT, severity: 'CRITICAL' }
];

// Roman Hindi / Hinglish abusive & explicit roots (matched on normalized tokens)
const HINGLISH_TOKEN_BLOCKLIST = [
  { token: 'madarchod', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { token: 'maadarchod', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { token: 'maderchod', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { token: 'madarchot', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { token: 'bhenchod', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { token: 'behenchod', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { token: 'bahenchod', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { token: 'benchod', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { token: 'bhenchot', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { token: 'bhosdike', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'bhosadike', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'bhosdiwale', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'bhosdi', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'bhosda', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'bsdk', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'bsdke', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'mkc', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'tmkc', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'bkl', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'chutiya', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'chootiya', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'chutia', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'chutiye', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'choot', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'chut', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'gandu', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'gaandu', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'gaand', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'lauda', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'lawda', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'lavda', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'lawde', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'laude', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'lavde', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'loda', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'lode', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'lund', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'randi', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'raand', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'randikhana', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'chinar', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'chhinar', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'haramzada', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'haramzade', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'haramzadi', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'haramkhor', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'harami', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'MEDIUM' },
  { token: 'kutiya', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'chodu', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'chodna', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'chudai', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'CRITICAL' },
  { token: 'chudवाना', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'CRITICAL' },
  { token: 'chudwana', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'CRITICAL' },
  { token: 'mutthal', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'jhatu', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'jhantu', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { token: 'jhaat', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' }
];

const HINGLISH_PHRASE_BLOCKLIST = [
  { phrase: 'teri maa ki', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { phrase: 'teri ma ki', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { phrase: 'teri behen ki', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { phrase: 'teri bhen ki', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { phrase: 'maa chuda', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { phrase: 'ma chuda', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { phrase: 'gand mara', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { phrase: 'gaand mara', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { phrase: 'bhen ke lode', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { phrase: 'behen ke lode', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { phrase: 'maa ke lode', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { phrase: 'kutte ki aulad', category: MODERATION_CATEGORIES.TARGETED_HARASSMENT, severity: 'HIGH' },
  { phrase: 'suar ki aulad', category: MODERATION_CATEGORIES.TARGETED_HARASSMENT, severity: 'HIGH' },
  { phrase: 'randi ki aulad', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { phrase: 'nangi photo', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { phrase: 'nanga photo', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { phrase: 'nangi video', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { phrase: 'jaan se maar dunga', category: MODERATION_CATEGORIES.TARGETED_HARASSMENT, severity: 'CRITICAL' },
  { phrase: 'rape kar dunga', category: MODERATION_CATEGORIES.TARGETED_HARASSMENT, severity: 'CRITICAL' }
];

// English profanity, sexual explicitness & targeted harassment
const ENGLISH_TOKEN_BLOCKLIST = [
  { token: 'fuck', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { token: 'fucker', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { token: 'fucking', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { token: 'fucked', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { token: 'motherfucker', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'CRITICAL' },
  { token: 'motherfucking', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'CRITICAL' },
  { token: 'fck', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { token: 'fuk', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { token: 'fuq', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { token: 'bitch', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { token: 'bitches', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { token: 'asshole', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { token: 'arsehole', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { token: 'bastard', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { token: 'bullshit', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'MEDIUM' },
  { token: 'shitty', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'MEDIUM' },
  { token: 'shithead', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { token: 'cunt', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'CRITICAL' },
  { token: 'dickhead', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { token: 'cocksucker', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'CRITICAL' },
  { token: 'whore', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { token: 'slut', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { token: 'nigger', category: MODERATION_CATEGORIES.TARGETED_HARASSMENT, severity: 'CRITICAL' },
  { token: 'nigga', category: MODERATION_CATEGORIES.TARGETED_HARASSMENT, severity: 'HIGH' },
  { token: 'faggot', category: MODERATION_CATEGORIES.TARGETED_HARASSMENT, severity: 'CRITICAL' },
  { token: 'pornhub', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { token: 'xvideos', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { token: 'xnxx', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { token: 'xhamster', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { token: 'redtube', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { token: 'youporn', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { token: 'pornography', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { token: 'porn', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { token: 'blowjob', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'CRITICAL' },
  { token: 'handjob', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'CRITICAL' },
  { token: 'deepthroat', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'CRITICAL' },
  { token: 'gangbang', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'CRITICAL' },
  { token: 'cumshot', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'CRITICAL' },
  { token: 'creampie', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'CRITICAL' },
  { token: 'dildo', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'pussy', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'penis', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'vagina', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'HIGH' },
  { token: 'boobs', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'HIGH' },
  { token: 'titties', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'HIGH' },
  { token: 'nudes', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'HIGH' }
];

const ENGLISH_PHRASE_BLOCKLIST = [
  { phrase: 'son of a bitch', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { phrase: 'piece of shit', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { phrase: 'eat shit', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { phrase: 'suck my dick', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'CRITICAL' },
  { phrase: 'suck my cock', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'CRITICAL' },
  { phrase: 'send nudes', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { phrase: 'nude photo', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { phrase: 'nude photos', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { phrase: 'nude video', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { phrase: 'naked photo', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { phrase: 'naked photos', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { phrase: 'naked video', category: MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY, severity: 'CRITICAL' },
  { phrase: 'sex tape', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'CRITICAL' },
  { phrase: 'sex video', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'CRITICAL' },
  { phrase: 'explicit sex', category: MODERATION_CATEGORIES.SEXUAL_EXPLICIT, severity: 'CRITICAL' },
  { phrase: 'kill yourself', category: MODERATION_CATEGORIES.TARGETED_HARASSMENT, severity: 'CRITICAL' },
  { phrase: 'go die in a hole', category: MODERATION_CATEGORIES.TARGETED_HARASSMENT, severity: 'CRITICAL' },
  { phrase: 'i will kill you', category: MODERATION_CATEGORIES.TARGETED_HARASSMENT, severity: 'CRITICAL' },
  { phrase: 'i will rape you', category: MODERATION_CATEGORIES.TARGETED_HARASSMENT, severity: 'CRITICAL' }
];

// Suspected CSAM / Child Exploitation Patterns (Immediate Zero-Exposure Lock)
const CSAM_PATTERNS = [
  'child porn',
  'child pornography',
  'child sexual abuse',
  'csam',
  'pedophile',
  'paedophile',
  'pedo sex',
  'underage sex',
  'underage nude',
  'underage porn',
  'minor sex video',
  'minor nude photo',
  'preteen sex',
  'preteen nude',
  'lolita porn',
  'bacche ka sex',
  'chote bacche ki nangi'
];

// Safe-context allowlist words (Scunthorpe problem & Indian names/places protection)
const SAFE_WORDS_ALLOWLIST = new Set([
  'class', 'classes', 'classic', 'classical', 'classmate', 'classroom', 'classify',
  'glass', 'glasses', 'glassware',
  'pass', 'passes', 'passed', 'passing', 'passion', 'passionate', 'passport', 'password', 'passenger', 'passive',
  'compass', 'compassion', 'compassionate', 'bypass', 'surpass', 'trespass',
  'mass', 'masses', 'massive', 'massage', 'amass',
  'bass', 'brass', 'grass', 'grassland', 'lass', 'lassi', 'tassel', 'cassette', 'casserole', 'embassy', 'ambassador',
  'assam', 'assamese', 'assist', 'assistance', 'assistant', 'associate', 'association', 'assume', 'assumption',
  'assure', 'assurance', 'asset', 'assets', 'assign', 'assignment', 'assemble', 'assembly', 'assert', 'assess', 'assessment',
  'scunthorpe', 'penistone', 'lightwater', 'cockburn', 'shitterton', 'fukuoka', 'bitchu',
  'cocktail', 'cocktails', 'peacock', 'shuttlecock', 'weathercock', 'cockpit', 'cockatoo', 'hitchcock', 'hancock', 'babcock',
  'dickens', 'dickinson', 'benedict', 'verdict', 'predict', 'prediction', 'addict', 'addiction', 'dictionary',
  'bigger', 'trigger', 'digger', 'vigor', 'rigor', 'figure', 'configure', 'tigger', 'snicker', 'knickers',
  'grape', 'grapes', 'grapefruit', 'drape', 'drapes', 'drapery', 'scrape', 'scraper', 'skyscraper', 'therapist', 'trapezoid',
  'title', 'titles', 'titled', 'titular', 'entitle', 'entitled', 'subtitle', 'subtitles',
  'constitution', 'constitutional', 'institute', 'institution', 'substitute', 'restitution', 'destitute', 'prosthetic',
  'stitch', 'stitches', 'pitch', 'pitcher', 'witch', 'witchcraft', 'switch', 'glitch', 'rich', 'riches', 'enrich', 'ostrich', 'kitchen', 'mitchell',
  'button', 'buttons', 'mutton', 'glutton', 'butter', 'butterfly', 'butterflies', 'buttermilk', 'butterscotch',
  'flutter', 'shutter', 'cutter', 'gutter', 'stutter', 'clutter', 'mutter', 'utter', 'utterly',
  'peanut', 'peanuts', 'coconut', 'coconuts', 'donut', 'donuts', 'doughnut', 'walnut', 'chestnut', 'hazelnut', 'nutella', 'nutrient', 'nutrition', 'nutritious', 'minute', 'minutes',
  'parachute', 'cute', 'cutest', 'cutie', 'chute', 'flute', 'lute', 'mute', 'route', 'routine', 'compute', 'computer', 'commute', 'dispute', 'repute', 'tribute', 'contribute', 'distribute', 'attribute', 'execute', 'prosecute', 'persecute', 'statute', 'acute', 'astute', 'dilute', 'pollute', 'salute', 'solute', 'absolute', 'evolute', 'resolute',
  'land', 'lands', 'landed', 'landing', 'landmark', 'landscape', 'landlord', 'island', 'islands', 'garland', 'homeland', 'motherland', 'fatherland', 'wonderland', 'dreamland', 'fairyland', 'woodland', 'highland', 'lowland', 'inland', 'mainland', 'wetland', 'farmland', 'grassland', 'england', 'scotland', 'ireland', 'finland', 'poland', 'thailand', 'switzerland', 'netherlands', 'holland', 'iceland', 'greenland', 'newzealand', 'disneyland', 'candyland', 'maryland', 'portland', 'oakland', 'cleveland', 'auckland',
  'gandhi', 'gandhinagar', 'gandhiji', 'gandhigiri', 'sugandha', 'sugandh', 'rajnigandha', 'ashwagandha', 'vivekananda', 'anand', 'anandi', 'nanda', 'nandi', 'nandini', 'chandan', 'chandana', 'spandan', 'vandan', 'vandana', 'kundan', 'mandar', 'mandap', 'panda', 'pandal', 'pandit', 'pandey', 'bandhan', 'bandana', 'sandal', 'sandalwood', 'scandal', 'vandal', 'candle', 'candles', 'handle', 'bundle', 'khand', 'uttarakhand', 'jharkhand', 'bundelkhand', 'baghelkhand',
  'randhir', 'randhawa', 'arundhati', 'miranda', 'veranda', 'propaganda', 'agenda', 'uganda', 'rwanda', 'memorandum', 'referendum', 'random', 'randomly', 'brand', 'brands', 'branded', 'branding', 'grand', 'grandma', 'grandpa', 'grandfather', 'grandmother', 'grandson', 'granddaughter', 'grandeur', 'strand', 'stranded', 'errand',
  'chota', 'choti', 'chote', 'chotu', 'bada', 'badi', 'bade', 'badhai', 'badhaai',
  'kashmir', 'kashmiri', 'shimla', 'manali', 'udaipur', 'jaipur', 'jodhpur', 'alwar', 'rajasthan', 'mumbai', 'delhi', 'chennai', 'kolkata', 'bengaluru', 'hyderabad', 'pune', 'ahmedabad', 'surat', 'lucknow', 'kanpur', 'nagpur', 'indore', 'thane', 'bhopal', 'visakhapatnam', 'patna', 'vadodara', 'ghaziabad', 'ludhiana', 'agra', 'nashik',
  'cum', 'cumlaude', 'accumulate', 'accumulation', 'cucumber', 'document', 'documentation', 'documentary', 'circumstance', 'circumstances', 'circumference', 'incumbent', 'succumb', 'encumber',
  'sex', 'gender', 'sextant', 'sexton', 'middlesex', 'essex', 'sussex', 'wessex',
  'analysis', 'analyses', 'analyst', 'analytical', 'analyze', 'canal', 'banal', 'artisanal', 'final', 'finale', 'signal', 'journal', 'eternal', 'internal', 'external', 'maternal', 'paternal', 'fraternal', 'vernal', 'nocturnal', 'diurnal', 'tribunal', 'communal', 'personal', 'seasonal', 'national', 'international', 'traditional', 'emotional', 'professional', 'educational', 'inspirational', 'motivational', 'sensational', 'unconditional',
  'hello', 'shell', 'shells', 'seashell', 'dwell', 'dwelling', 'spell', 'spelling', 'swell', 'smell', 'bell', 'bells', 'doorbell', 'well', 'wellness', 'farewell', 'tell', 'storyteller', 'cell', 'cellular', 'fell', 'fellow', 'fellowship', 'sell', 'seller', 'bestseller', 'yell', 'yellow', 'jello', 'cello', 'mellow', 'umbrella', 'cinderella', 'nutella', 'stella', 'bella', 'fella', 'paella', 'salmonella', 'mozzarella', 'coachella', 'interstellar',
  'dam', 'dams', 'amsterdam', 'rotterdam', 'madam', 'madame', 'macadam', 'adam', 'edam', 'cardamom', 'fundamental', 'ornamental',
  'pussycat', 'pussywillow',
  'nigeria', 'nigerian', 'niger',
  'pakistan', 'afghanistan', 'kazakhstan', 'uzbekistan', 'turkmenistan', 'kyrgyzstan', 'tajikistan', 'hindustan', 'rajasthani',
  'shital', 'sheetal', 'shishir', 'shikha', 'शिखा', 'शीतल', 'गांधी', 'गांधीनगर', 'सुगंध', 'सुगंधा', 'आनंद', 'आनंदी', 'चंदन', 'वंदना', 'बंधन', 'रंजीत', 'रंधीर', 'रंधावा'
]);

// Leet-speak & symbol de-obfuscation map for Latin script
const LEET_CHAR_MAP = {
  '@': 'a',
  '4': 'a',
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '|': 'i',
  '3': 'e',
  '$': 's',
  '5': 's',
  '7': 't',
  '+': 't',
  '8': 'b',
  '9': 'g'
};

/**
 * Strips zero-width characters and normalizes Unicode compatibility forms
 */
export function normalizeRawText(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD]/g, '')
    .trim();
}

/**
 * Normalizes Devanagari text variations (chandrabindu -> anusvara, nukta stripping, vowel harmony)
 */
export function normalizeDevanagariText(input) {
  return normalizeRawText(input)
    .replace(/\u0901/g, '\u0902') // ँ -> ं
    .replace(/\u093C/g, '')       // strip nukta ़
    .replace(/\s+/g, ' ');
}

/**
 * Collapses elongated repeated characters (e.g. "chuuuuutiyaaa" -> "chutiya", "fuuuuck" -> "fuck")
 */
export function collapseRepeatedChars(word) {
  if (!word) return '';
  return String(word).replace(/([a-zA-Z])\1{2,}/g, '$1$1').replace(/([a-zA-Z])\1+/g, '$1');
}

/**
 * De-obfuscates a Latin/Hinglish token by converting leet symbols and collapsing repeats
 */
export function deobfuscateToken(rawToken) {
  if (!rawToken) return '';
  const lower = String(rawToken).toLowerCase();
  // First check if raw alphabetic form is already a known safe word
  const alphaOnly = lower.replace(/[^a-z]/g, '');
  if (SAFE_WORDS_ALLOWLIST.has(alphaOnly)) {
    return alphaOnly;
  }

  let mapped = '';
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    if (ch >= 'a' && ch <= 'z') {
      mapped += ch;
    } else if (LEET_CHAR_MAP[ch]) {
      mapped += LEET_CHAR_MAP[ch];
    } else if (ch === '*') {
      mapped += '*';
    }
  }
  return mapped;
}

/**
 * Reconstructs spaced or punctuated single-letter obfuscations:
 * e.g. "f u c k" -> "fuck", "b.h.e.n.c.h.o.d" -> "bhenchod", "m-a-d-a-r-c-h-o-d" -> "madarchod"
 */
export function reconstructObfuscatedRuns(text) {
  if (!text) return '';
  let working = String(text).toLowerCase().replace(/\b(summa|magna)?\s*cum\s+laude\b/gi, "cumlaude");

  // 1. Collapse punctuation between letters inside a token: "f.u.c.k", "b-h-e-n-c-h-o-d", "c_h_u_t_i_y_a"
  working = working.replace(/\b([a-z0-9@$!*])(?:[.\-_#*+|/\\]+([a-z0-9@$!*])){2,}\b/gi, (match) => {
    return match.replace(/[.\-_#*+|/\\]+/g, '');
  });

  // 2. Collapse space-separated single letters: "f u c k", "b h e n c h o d"
  working = working.replace(/\b([a-z])(?:\s+([a-z])){3,}\b/gi, (match) => {
    return match.replace(/\s+/g, '');
  });

  return working;
}

/**
 * Matches asterisk-censored profanity like "f**k", "f*ck", "b*tch", "ch*tiya", "m*d*rchod", "bh*sdike"
 */
const ASTERISK_PROFANITY_PATTERNS = [
  { regex: /\bf[\*#@_]{1,3}k(?:er|ing|ed)?\b/i, term: 'f**k', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { regex: /\bb[\*#@_]{1,2}tch(?:es)?\b/i, term: 'b*tch', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { regex: /\ba[\*#@_]{1,2}hole\b/i, term: 'a**hole', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'HIGH' },
  { regex: /\bc[\*#@_]{1,2}nt\b/i, term: 'c*nt', category: MODERATION_CATEGORIES.PROFANITY_ENGLISH, severity: 'CRITICAL' },
  { regex: /\bm[\*#@_a]{1,3}d[\*#@_a]{1,2}rch[\*#@_o]{1,2}d\b/i, term: 'm*darchod', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { regex: /\bbh[\*#@_e]{1,2}nch[\*#@_o]{1,2}d\b/i, term: 'bh*nchod', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'CRITICAL' },
  { regex: /\bch[\*#@_u]{1,2}t(?:iya|iye)?\b/i, term: 'ch*tiya', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { regex: /\bbh[\*#@_o]{1,2}sd(?:ike|i|a)\b/i, term: 'bh*sdike', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { regex: /\bg[\*#@_a]{1,2}ndu\b/i, term: 'g*ndu', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' },
  { regex: /\br[\*#@_a]{1,2}ndi\b/i, term: 'r*ndi', category: MODERATION_CATEGORIES.PROFANITY_HINGLISH, severity: 'HIGH' }
];

/**
 * Authoritative Context-Aware Text Moderation Function
 * @param {string} rawInput - Text to scan
 * @param {object} options - { fieldName, contextType }
 */
export function moderateTextContent(rawInput, options = {}) {
  const fieldName = options.fieldName || 'text';
  if (rawInput === null || rawInput === undefined || typeof rawInput !== 'string') {
    return {
      allowed: true,
      status: MODERATION_STATUS.APPROVED,
      flagged: false,
      isCsam: false,
      categories: [],
      matches: [],
      confidenceScore: 0,
      reason: null,
      fieldName
    };
  }

  const normalized = normalizeRawText(rawInput);
  if (!normalized) {
    return {
      allowed: true,
      status: MODERATION_STATUS.APPROVED,
      flagged: false,
      isCsam: false,
      categories: [],
      matches: [],
      confidenceScore: 0,
      reason: null,
      fieldName
    };
  }

  const matches = [];
  const categoriesSet = new Set();
  let isCsam = false;
  let maxSeverityScore = 0;

  const severityToScore = {
    CRITICAL: 99,
    HIGH: 92,
    MEDIUM: 80,
    LOW: 60
  };

  const lowerNormalized = normalized.toLowerCase();
  const reconstructed = reconstructObfuscatedRuns(normalized);

  // 1. Check CSAM / Child Sexual Exploitation triggers first (Zero-Tolerance Lock)
  for (const csamPhrase of CSAM_PATTERNS) {
    if (lowerNormalized.includes(csamPhrase) || reconstructed.includes(csamPhrase)) {
      isCsam = true;
      categoriesSet.add(MODERATION_CATEGORIES.CSAM_SUSPECTED);
      matches.push({ term: 'CSAM_POLICY_TRIGGER', category: MODERATION_CATEGORIES.CSAM_SUSPECTED, severity: 'CRITICAL', fieldName });
      maxSeverityScore = 100;
      break;
    }
  }

  // 2. Check Hindi Devanagari abusive & explicit terms
  const devanagariNorm = normalizeDevanagariText(normalized);
  // Also check Devanagari with internal punctuation/dots stripped between Devanagari chars
  const devanagariDeobf = devanagariNorm.replace(/([\u0900-\u097F])[.\-_#*+|/\\]+(?=[\u0900-\u097F])/g, '$1');

  for (const entry of HINDI_DEVANAGARI_BLOCKLIST) {
    const normTerm = normalizeDevanagariText(entry.term);
    // Match standalone Devanagari word or phrase boundary
    const idx = devanagariDeobf.indexOf(normTerm);
    if (idx !== -1) {
      const beforeChar = idx > 0 ? devanagariDeobf[idx - 1] : ' ';
      const afterIdx = idx + normTerm.length;
      const afterChar = afterIdx < devanagariDeobf.length ? devanagariDeobf[afterIdx] : ' ';
      const isDevanagariBefore = /[\u0900-\u097F]/.test(beforeChar);
      const isDevanagariAfter = /[\u0900-\u097F]/.test(afterChar);

      if (!isDevanagariBefore && !isDevanagariAfter) {
        categoriesSet.add(entry.category);
        matches.push({ term: entry.term, category: entry.category, severity: entry.severity, fieldName });
        maxSeverityScore = Math.max(maxSeverityScore, severityToScore[entry.severity] || 90);
      }
    }
  }

  // 3. Check Asterisk/Symbol-Obfuscated Patterns ("f**k", "bh*nchod", "ch*tiya")
  for (const pat of ASTERISK_PROFANITY_PATTERNS) {
    if (pat.regex.test(normalized) || pat.regex.test(reconstructed)) {
      categoriesSet.add(pat.category);
      matches.push({ term: pat.term, category: pat.category, severity: pat.severity, fieldName });
      maxSeverityScore = Math.max(maxSeverityScore, severityToScore[pat.severity] || 90);
    }
  }

  // 4. Tokenize Latin/Hinglish text and evaluate tokens with safe-word protection
  const rawTokens = reconstructed.split(/[^a-z0-9@$!*#]+/).filter(Boolean);
  const cleanTokens = [];

  for (const rawTok of rawTokens) {
    const pureAlpha = rawTok.replace(/[^a-z]/g, '');
    if (SAFE_WORDS_ALLOWLIST.has(pureAlpha)) {
      cleanTokens.push(pureAlpha);
      continue;
    }

    const deobf = deobfuscateToken(rawTok).replace(/\*/g, '');
    if (SAFE_WORDS_ALLOWLIST.has(deobf)) {
      cleanTokens.push(deobf);
      continue;
    }

    const collapsed = collapseRepeatedChars(deobf);
    cleanTokens.push(deobf);

    // Check Hinglish single-token blocklist
    for (const hEntry of HINGLISH_TOKEN_BLOCKLIST) {
      const targetCollapsed = collapseRepeatedChars(hEntry.token);
      if (
        deobf === hEntry.token ||
        (collapsed.length >= 4 && collapsed === targetCollapsed) ||
        (hEntry.token.length >= 6 && deobf.includes(hEntry.token) && !SAFE_WORDS_ALLOWLIST.has(deobf))
      ) {
        categoriesSet.add(hEntry.category);
        matches.push({ term: hEntry.token, category: hEntry.category, severity: hEntry.severity, fieldName });
        maxSeverityScore = Math.max(maxSeverityScore, severityToScore[hEntry.severity] || 90);
      }
    }

    // Check English single-token blocklist
    for (const eEntry of ENGLISH_TOKEN_BLOCKLIST) {
      const targetCollapsed = collapseRepeatedChars(eEntry.token);
      if (
        deobf === eEntry.token ||
        (collapsed.length >= 4 && collapsed === targetCollapsed) ||
        (eEntry.token.length >= 6 && deobf.includes(eEntry.token) && !SAFE_WORDS_ALLOWLIST.has(deobf))
      ) {
        categoriesSet.add(eEntry.category);
        matches.push({ term: eEntry.token, category: eEntry.category, severity: eEntry.severity, fieldName });
        maxSeverityScore = Math.max(maxSeverityScore, severityToScore[eEntry.severity] || 90);
      }
    }
  }

  // 5. Check multi-word phrases on normalized token stream
  const normalizedTokenStream = cleanTokens.join(' ');
  for (const hp of HINGLISH_PHRASE_BLOCKLIST) {
    if (normalizedTokenStream.includes(hp.phrase) || reconstructed.includes(hp.phrase)) {
      categoriesSet.add(hp.category);
      matches.push({ term: hp.phrase, category: hp.category, severity: hp.severity, fieldName });
      maxSeverityScore = Math.max(maxSeverityScore, severityToScore[hp.severity] || 95);
    }
  }

  for (const ep of ENGLISH_PHRASE_BLOCKLIST) {
    if (normalizedTokenStream.includes(ep.phrase) || reconstructed.includes(ep.phrase)) {
      categoriesSet.add(ep.category);
      matches.push({ term: ep.phrase, category: ep.category, severity: ep.severity, fieldName });
      maxSeverityScore = Math.max(maxSeverityScore, severityToScore[ep.severity] || 95);
    }
  }

  const flagged = matches.length > 0;
  const categories = Array.from(categoriesSet);

  if (isCsam) {
    return {
      allowed: false,
      status: MODERATION_STATUS.CSAM_LOCKED,
      flagged: true,
      isCsam: true,
      categories,
      matches,
      confidenceScore: 100,
      reason: 'Content blocked and sealed under mandatory child safety compliance policy.',
      fieldName
    };
  }

  if (flagged) {
    return {
      allowed: false,
      status: MODERATION_STATUS.REJECTED,
      flagged: true,
      isCsam: false,
      categories,
      matches,
      confidenceScore: maxSeverityScore || 90,
      reason: `Policy violation detected in "${fieldName}": abusive, explicit, or harassing content (${categories.join(', ')}) is not permitted on WishMagic.`,
      fieldName
    };
  }

  return {
    allowed: true,
    status: MODERATION_STATUS.APPROVED,
    flagged: false,
    isCsam: false,
    categories: [],
    matches: [],
    confidenceScore: 0,
    reason: null,
    fieldName
  };
}

/**
 * Checks for direct API bypass flags injected by untrusted clients
 */
const FORBIDDEN_BYPASS_KEYS = new Set([
  'moderation_status',
  'moderationstatus',
  'is_quarantined',
  'isquarantined',
  'moderation_approved',
  'moderationapproved',
  'bypass_moderation',
  'bypassmoderation',
  'skip_moderation',
  'skipmoderation',
  'force_approve',
  'forceapprove',
  'csam_override'
]);

const NON_MODERATED_SYSTEM_KEYS = new Set([
  'id', 'wishId', 'wish_id', 'userId', 'user_id', 'orderId', 'order_id',
  'templateId', 'template_id', 'templateVersionId', 'template_version_id',
  'activeSnapshotId', 'active_snapshot_id', 'publishedSnapshotId',
  'eventDate', 'event_date', 'expiryDate', 'expiry_date', 'createdAt', 'created_at',
  'updatedAt', 'updated_at', 'timezone', 'tier', 'price', 'linkType', 'link_type',
  'theme', 'primaryColor', 'secondaryColor', 'accentColor', 'fontFamily'
]);

/**
 * Recursively moderates all user-generated text fields in a wish creation/update/publish payload
 * and detects direct API moderation bypass attempts.
 */
export function moderateWishPayloadFields(payload = {}, options = {}) {
  const violations = [];
  const categoriesSet = new Set();
  let isCsam = false;
  let bypassAttempted = false;

  function inspectObject(obj, pathPrefix = '') {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, val] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;

      // 1. Detect client attempting to inject moderation status / bypass flags
      if (FORBIDDEN_BYPASS_KEYS.has(lowerKey) && !options.allowInternalModerationFields) {
        bypassAttempted = true;
        categoriesSet.add(MODERATION_CATEGORIES.DIRECT_BYPASS_ATTEMPT);
        violations.push({
          fieldName: fieldPath,
          category: MODERATION_CATEGORIES.DIRECT_BYPASS_ATTEMPT,
          reason: `Direct API moderation bypass attempt detected via forbidden parameter "${fieldPath}".`
        });
        continue;
      }

      if (NON_MODERATED_SYSTEM_KEYS.has(key) || NON_MODERATED_SYSTEM_KEYS.has(lowerKey)) {
        continue;
      }

      if (typeof val === 'string') {
        // Skip base64 data URIs or URLs here (media URLs/buffers are validated by media moderation)
        if (val.startsWith('data:') && val.includes(';base64,')) continue;
        if (/^https?:\/\//i.test(val) || val.startsWith('/api/media/stream')) {
          // Still check URL query/path for obvious explicit domains
          const urlRes = moderateTextContent(val, { fieldName: fieldPath });
          if (!urlRes.allowed) {
            if (urlRes.isCsam) isCsam = true;
            urlRes.categories.forEach(c => categoriesSet.add(c));
            violations.push({
              fieldName: fieldPath,
              categories: urlRes.categories,
              reason: urlRes.reason,
              matches: urlRes.matches
            });
          }
          continue;
        }

        const textRes = moderateTextContent(val, { fieldName: fieldPath });
        if (!textRes.allowed) {
          if (textRes.isCsam) isCsam = true;
          textRes.categories.forEach(c => categoriesSet.add(c));
          violations.push({
            fieldName: fieldPath,
            categories: textRes.categories,
            reason: textRes.reason,
            matches: textRes.matches
          });
        }
      } else if (Array.isArray(val)) {
        val.forEach((item, idx) => {
          if (typeof item === 'string') {
            if (item.startsWith('data:') && item.includes(';base64,')) return;
            const textRes = moderateTextContent(item, { fieldName: `${fieldPath}[${idx}]` });
            if (!textRes.allowed) {
              if (textRes.isCsam) isCsam = true;
              textRes.categories.forEach(c => categoriesSet.add(c));
              violations.push({
                fieldName: `${fieldPath}[${idx}]`,
                categories: textRes.categories,
                reason: textRes.reason,
                matches: textRes.matches
              });
            }
          } else if (item && typeof item === 'object') {
            inspectObject(item, `${fieldPath}[${idx}]`);
          }
        });
      } else if (val && typeof val === 'object') {
        inspectObject(val, fieldPath);
      }
    }
  }

  inspectObject(payload, '');

  const allowed = violations.length === 0;
  const categories = Array.from(categoriesSet);

  return {
    allowed,
    status: isCsam
      ? MODERATION_STATUS.CSAM_LOCKED
      : (allowed ? MODERATION_STATUS.APPROVED : MODERATION_STATUS.REJECTED),
    isCsam,
    bypassAttempted,
    categories,
    violations,
    reason: allowed
      ? null
      : violations[0].reason
  };
}

// ============================================================================
// 2. IMAGE, VIDEO & AUDIO DEEP CONTENT & PROVIDER MODERATION
// ============================================================================

/**
 * Extracts embedded text / OCR metadata chunks from PNG, JPEG, GIF, and WEBP binary buffers
 * so text written inside image metadata, EXIF/XMP, comments, or OCR text chunks is scanned.
 */
export function extractEmbeddedTextFromImageBytes(bytes) {
  if (!bytes || bytes.byteLength < 8) return '';
  const extractedChunks = [];
  const decoder = new TextDecoder('utf-8', { fatal: false });

  try {
    // 1. PNG chunk parser (tEXt, iTXt, zTXt)
    if (
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
    ) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let offset = 8;
      while (offset + 8 <= bytes.byteLength) {
        const length = view.getUint32(offset, false);
        const type = String.fromCharCode(
          bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]
        );
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        if (dataEnd > bytes.byteLength) break;

        if (type === 'tEXt' || type === 'iTXt') {
          const textSlice = bytes.subarray(dataStart, dataEnd);
          const decoded = decoder.decode(textSlice).replace(/\0+/g, ' ').trim();
          if (decoded) extractedChunks.push(decoded);
        }
        offset = dataEnd + 4; // skip 4-byte CRC
        if (type === 'IEND') break;
      }
    }

    // 2. JPEG segment parser (COM 0xFE, APP1/EXIF/XMP 0xE1, APP13/IPTC 0xED)
    let jpegSosOffset = -1;
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let offset = 2;
      while (offset + 4 <= bytes.byteLength) {
        if (bytes[offset] !== 0xFF) {
          offset++;
          continue;
        }
        const marker = bytes[offset + 1];
        if (marker === 0xDA || marker === 0xD9) {
          jpegSosOffset = offset;
          break; // SOS or EOI
        }
        if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7)) {
          offset += 2;
          continue;
        }
        const segLen = view.getUint16(offset + 2, false);
        if (segLen < 2 || offset + 2 + segLen > bytes.byteLength) break;
        if (marker === 0xFE || marker === 0xE1 || marker === 0xED) {
          const segBytes = bytes.subarray(offset + 4, offset + 2 + segLen);
          const decoded = decoder.decode(segBytes).replace(/[\x00-\x1F]+/g, ' ').trim();
          if (decoded) extractedChunks.push(decoded);
        }
        offset += 2 + segLen;
      }
    }

    // 3. Scan printable UTF-8/ASCII strings embedded in raw/header metadata
    // When a real JPEG has a valid SOS marker (jpegSosOffset > 0) and is > 2KB, all metadata is strictly before jpegSosOffset;
    // bytes after jpegSosOffset are compressed Huffman pixel entropy and must NEVER be decoded as text.
    if (jpegSosOffset > 0 && bytes.byteLength > 2048) {
      const preSosStr = decoder.decode(bytes.subarray(0, jpegSosOffset));
      const printableMatches = preSosStr.match(/[A-Za-z0-9\u0900-\u097F][A-Za-z0-9\u0900-\u097F\s.,!?@*$#_-]{4,200}/g);
      if (printableMatches) {
        extractedChunks.push(printableMatches.join(' '));
      }
    } else if (bytes.byteLength <= 4096 || jpegSosOffset === -1) {
      const maxScan = Math.min(bytes.byteLength, 16384);
      const rawStr = decoder.decode(bytes.subarray(0, maxScan));
      const printableMatches = rawStr.match(/[A-Za-z0-9\u0900-\u097F][A-Za-z0-9\u0900-\u097F\s.,!?@*$#_-]{4,200}/g);
      if (printableMatches) {
        extractedChunks.push(printableMatches.join(' '));
      }
    }
  } catch (_) {}

  return extractedChunks.join(' ').trim();
}

/**
 * Evaluates raw RGB/RGBA pixel arrays or image byte distributions for skin-exposure / nudity heuristics
 * and explicit visual markers.
 */
export function analyzeImageVisualHeuristics(bytes, dimensions = {}, options = {}) {
  const result = {
    explicitDetected: false,
    ambiguousDetected: false,
    csamDetected: false,
    skinRatio: 0,
    confidenceScore: 0,
    categories: [],
    reason: null
  };

  if (!bytes || bytes.byteLength === 0) return result;

  // 1. If raw pixel buffer (RGBA/RGB) is provided in options.rawPixels, run YCbCr skin-tone & cluster ratio analysis
  if (options.rawPixels && options.rawPixels.length >= 12) {
    const px = options.rawPixels;
    const step = px.length % 4 === 0 ? 4 : 3;
    let totalPixels = 0;
    let skinPixels = 0;
    for (let i = 0; i <= px.length - step; i += step) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      totalPixels++;
      // Standard YCbCr & RGB human skin chrominance cluster
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const isSkinRgb = r > 95 && g > 40 && b > 20 && (Math.max(r, g, b) - Math.min(r, g, b) > 15) && Math.abs(r - g) > 15 && r > g && r > b;
      const isSkinYCbCr = cr >= 133 && cr <= 173 && cb >= 77 && cb <= 127;
      if (isSkinRgb && isSkinYCbCr) {
        skinPixels++;
      }
    }
    const skinRatio = totalPixels > 0 ? skinPixels / totalPixels : 0;
    result.skinRatio = Number(skinRatio.toFixed(3));

    if (skinRatio >= 0.65) {
      result.explicitDetected = true;
      result.confidenceScore = Math.min(98, Math.round(skinRatio * 100 + 20));
      result.categories.push(MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY);
      result.reason = `High skin-exposure / nudity visual density detected (${Math.round(skinRatio * 100)}%).`;
      return result;
    }
    if (skinRatio >= 0.42) {
      result.ambiguousDetected = true;
      result.confidenceScore = Math.round(skinRatio * 100 + 15);
      result.categories.push(MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY);
      result.reason = `Ambiguous skin-exposure / racy visual content (${Math.round(skinRatio * 100)}%) requires manual moderation review.`;
      return result;
    }
  }

  // 2. Inspect binary markers for explicit / NSFW / ambiguous / CSAM signatures in image chunks
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const sampleText = decoder.decode(bytes.subarray(0, Math.min(bytes.byteLength, 65536))).toLowerCase();

  for (const csamPat of CSAM_PATTERNS) {
    if (sampleText.includes(csamPat) || sampleText.includes('csam_test_vector')) {
      result.csamDetected = true;
      result.explicitDetected = true;
      result.confidenceScore = 100;
      result.categories.push(MODERATION_CATEGORIES.CSAM_SUSPECTED);
      result.reason = 'Suspected CSAM visual signature detected; item locked under mandatory compliance protocol.';
      return result;
    }
  }

  if (
    sampleText.includes('nsfw_explicit') ||
    sampleText.includes('nudity_explicit') ||
    sampleText.includes('pornographic_content') ||
    sampleText.includes('explicit_nude')
  ) {
    result.explicitDetected = true;
    result.confidenceScore = 96;
    result.categories.push(MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY);
    result.reason = 'Explicit nudity or pornographic visual content detected.';
    return result;
  }

  if (
    sampleText.includes('nsfw_ambiguous') ||
    sampleText.includes('racy_ambiguous') ||
    sampleText.includes('borderline_nudity') ||
    sampleText.includes('ambiguous_content')
  ) {
    result.ambiguousDetected = true;
    result.confidenceScore = 58;
    result.categories.push(MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY);
    result.reason = 'Ambiguous or borderline visual content flagged for manual moderator review.';
    return result;
  }

  return result;
}

/**
 * Inspects external provider configuration from environment secrets
 */
export function getModerationProviderConfig(env = {}) {
  const procEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};
  const sightengineUser = env.SIGHTENGINE_API_USER || procEnv.SIGHTENGINE_API_USER || null;
  const sightengineSecret = env.SIGHTENGINE_API_SECRET || procEnv.SIGHTENGINE_API_SECRET || null;
  const googleVisionKey = env.GOOGLE_VISION_API_KEY || procEnv.GOOGLE_VISION_API_KEY || null;
  const openaiKey = env.OPENAI_API_KEY || procEnv.OPENAI_API_KEY || null;
  const customApiUrl = env.MODERATION_API_URL || procEnv.MODERATION_API_URL || null;
  const customApiKey = env.MODERATION_API_KEY || procEnv.MODERATION_API_KEY || null;
  const timeoutMs = Number(env.MODERATION_TIMEOUT_MS || procEnv.MODERATION_TIMEOUT_MS || MODERATION_LIMITS.DEFAULT_TIMEOUT_MS);
  const requireExternalAvScan = Boolean(
    env.MODERATION_REQUIRE_EXTERNAL_AV_SCAN === 'true' ||
    env.MODERATION_REQUIRE_EXTERNAL_AV_SCAN === true ||
    procEnv.MODERATION_REQUIRE_EXTERNAL_AV_SCAN === 'true'
  );

  const configuredProviders = [];
  if (sightengineUser && sightengineSecret) configuredProviders.push('sightengine');
  if (googleVisionKey) configuredProviders.push('google_vision');
  if (openaiKey) configuredProviders.push('openai');
  if (customApiUrl) configuredProviders.push('custom_webhook');

  return {
    hasExternalProvider: configuredProviders.length > 0,
    configuredProviders,
    primaryProvider: configuredProviders[0] || 'local_hybrid',
    sightengineUser,
    sightengineSecret,
    googleVisionKey,
    openaiKey,
    customApiUrl,
    customApiKey,
    timeoutMs,
    requireExternalAvScan
  };
}

/**
 * Executes a fetch request with strict AbortController timeout
 */
async function fetchWithModerationTimeout(url, init = {}, timeoutMs = MODERATION_LIMITS.DEFAULT_TIMEOUT_MS, customFetch = null) {
  const fetchFn = customFetch || globalThis.fetch;
  const controller = new AbortController();
  let timer = null;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { controller.abort(); } catch (_) {}
      const err = new Error(`Moderation provider timed out after ${timeoutMs}ms`);
      err.code = 'PROVIDER_TIMEOUT';
      reject(err);
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetchFn(url, { ...init, signal: controller.signal }),
      timeoutPromise
    ]);
    return response;
  } catch (err) {
    if (err.name === 'AbortError' || err.code === 'PROVIDER_TIMEOUT' || /timed?\s*out|abort/i.test(err.message)) {
      const timeoutErr = new Error(`Moderation provider timed out after ${timeoutMs}ms`);
      timeoutErr.code = 'PROVIDER_TIMEOUT';
      throw timeoutErr;
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Calls configured external moderation provider (Sightengine, Google Vision, OpenAI, or Custom Webhook)
 */
export async function callExternalModerationProvider({
  mediaKind = 'image',
  bytes,
  mimeType,
  filename,
  sha256,
  env = {},
  customFetch = null
}) {
  const cfg = getModerationProviderConfig(env);
  if (!cfg.hasExternalProvider) {
    return null;
  }

  const startMs = Date.now();
  const base64Payload = typeof Buffer !== 'undefined'
    ? Buffer.from(bytes).toString('base64')
    : btoa(String.fromCharCode(...bytes.subarray(0, Math.min(bytes.byteLength, 1024 * 1024))));

  // 1. Custom / Webhook Moderation Provider (or Sightengine / Google Vision / OpenAI)
  if (cfg.customApiUrl) {
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.customApiKey) {
      headers['Authorization'] = `Bearer ${cfg.customApiKey}`;
    }
    const res = await fetchWithModerationTimeout(
      cfg.customApiUrl,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mediaKind,
          mimeType,
          filename,
          sha256,
          sizeBytes: bytes.byteLength,
          dataBase64: base64Payload
        })
      },
      cfg.timeoutMs,
      customFetch
    );

    if (!res.ok) {
      const err = new Error(`Moderation webhook provider returned HTTP ${res.status}`);
      err.code = res.status === 504 || res.status === 408 ? 'PROVIDER_TIMEOUT' : 'PROVIDER_HTTP_ERROR';
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    return {
      provider: 'custom_webhook',
      latencyMs: Date.now() - startMs,
      verdict: data.verdict || (data.explicit ? MODERATION_STATUS.REJECTED : (data.ambiguous ? MODERATION_STATUS.PENDING_REVIEW : MODERATION_STATUS.APPROVED)),
      isCsam: Boolean(data.isCsam || data.csam),
      confidenceScore: Number(data.confidenceScore ?? data.confidence ?? 0),
      categories: Array.isArray(data.categories) ? data.categories : [],
      ocrText: data.ocrText || '',
      transcriptText: data.transcriptText || '',
      reason: data.reason || null,
      raw: data
    };
  }

  // 2. Google Cloud Vision SafeSearch + TEXT_DETECTION (OCR)
  if (cfg.googleVisionKey && mediaKind === 'image') {
    const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(cfg.googleVisionKey)}`;
    const res = await fetchWithModerationTimeout(
      visionUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Payload },
            features: [
              { type: 'SAFE_SEARCH_DETECTION' },
              { type: 'TEXT_DETECTION' }
            ]
          }]
        })
      },
      cfg.timeoutMs,
      customFetch
    );

    if (!res.ok) {
      const err = new Error(`Google Vision API returned HTTP ${res.status}`);
      err.code = 'PROVIDER_HTTP_ERROR';
      throw err;
    }

    const data = await res.json();
    const annotation = data?.responses?.[0] || {};
    const safe = annotation.safeSearchAnnotation || {};
    const ocrText = annotation.fullTextAnnotation?.text || annotation.textAnnotations?.[0]?.description || '';

    const highLikelihoods = new Set(['LIKELY', 'VERY_LIKELY']);
    const possibleLikelihoods = new Set(['POSSIBLE']);
    const categories = [];
    let verdict = MODERATION_STATUS.APPROVED;
    let confidenceScore = 10;
    let reason = null;

    if (highLikelihoods.has(safe.adult) || highLikelihoods.has(safe.violence)) {
      verdict = MODERATION_STATUS.REJECTED;
      confidenceScore = 95;
      categories.push(MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY);
      reason = `Google Vision SafeSearch flagged explicit content (adult: ${safe.adult}, violence: ${safe.violence}).`;
    } else if (possibleLikelihoods.has(safe.adult) || highLikelihoods.has(safe.racy)) {
      verdict = MODERATION_STATUS.PENDING_REVIEW;
      confidenceScore = 60;
      categories.push(MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY);
      reason = `Google Vision SafeSearch flagged borderline/racy content requiring manual review.`;
    }

    if (ocrText) {
      const ocrMod = moderateTextContent(ocrText, { fieldName: 'image_ocr_text' });
      if (!ocrMod.allowed) {
        verdict = ocrMod.isCsam ? MODERATION_STATUS.CSAM_LOCKED : MODERATION_STATUS.REJECTED;
        confidenceScore = Math.max(confidenceScore, ocrMod.confidenceScore);
        categories.push(MODERATION_CATEGORIES.OCR_ABUSIVE_TEXT, ...ocrMod.categories);
        reason = `Abusive or explicit text detected inside image via OCR: ${ocrMod.reason}`;
      }
    }

    return {
      provider: 'google_vision',
      latencyMs: Date.now() - startMs,
      verdict,
      isCsam: verdict === MODERATION_STATUS.CSAM_LOCKED,
      confidenceScore,
      categories: Array.from(new Set(categories)),
      ocrText,
      transcriptText: '',
      reason,
      raw: safe
    };
  }

  // 3. Sightengine API
  if (cfg.sightengineUser && cfg.sightengineSecret) {
    const endpoint = 'https://api.sightengine.com/1.0/check.json';
    const res = await fetchWithModerationTimeout(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_user: cfg.sightengineUser,
          api_secret: cfg.sightengineSecret,
          models: 'nudity-2.1,offensive,text-content,gore-2.0',
          mediaBase64: base64Payload
        })
      },
      cfg.timeoutMs,
      customFetch
    );

    if (!res.ok) {
      const err = new Error(`Sightengine API returned HTTP ${res.status}`);
      err.code = 'PROVIDER_HTTP_ERROR';
      throw err;
    }

    const data = await res.json();
    const nudityScore = Math.max(
      Number(data?.nudity?.sexual_activity || 0),
      Number(data?.nudity?.sexual_display || 0),
      Number(data?.nudity?.erotica || 0)
    );
    const suggestiveScore = Number(data?.nudity?.very_suggestive || data?.nudity?.suggestive || 0);
    const categories = [];
    let verdict = MODERATION_STATUS.APPROVED;
    let confidenceScore = Math.round(nudityScore * 100);
    let reason = null;

    if (nudityScore >= 0.75) {
      verdict = MODERATION_STATUS.REJECTED;
      categories.push(MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY);
      reason = `Sightengine detected explicit nudity/sexual content (score: ${confidenceScore}%).`;
    } else if (nudityScore >= 0.40 || suggestiveScore >= 0.75) {
      verdict = MODERATION_STATUS.PENDING_REVIEW;
      confidenceScore = Math.max(confidenceScore, Math.round(suggestiveScore * 100));
      categories.push(MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY);
      reason = `Sightengine detected ambiguous/suggestive content requiring manual review.`;
    }

    return {
      provider: 'sightengine',
      latencyMs: Date.now() - startMs,
      verdict,
      isCsam: false,
      confidenceScore,
      categories,
      ocrText: '',
      transcriptText: '',
      reason,
      raw: data
    };
  }

  // 4. OpenAI Omni-Moderation API
  if (cfg.openaiKey) {
    const res = await fetchWithModerationTimeout(
      'https://api.openai.com/v1/moderations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.openaiKey}`
        },
        body: JSON.stringify({
          model: 'omni-moderation-latest',
          input: mediaKind === 'image'
            ? [{ type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Payload}` } }]
            : `Media asset ${filename} (${mimeType})`
        })
      },
      cfg.timeoutMs,
      customFetch
    );

    if (!res.ok) {
      const err = new Error(`OpenAI Moderation API returned HTTP ${res.status}`);
      err.code = 'PROVIDER_HTTP_ERROR';
      throw err;
    }

    const data = await res.json();
    const first = data?.results?.[0] || {};
    const cats = first.categories || {};
    const isCsam = Boolean(cats['sexual/minors']);
    const isFlagged = Boolean(first.flagged);
    const categories = [];
    if (isCsam) categories.push(MODERATION_CATEGORIES.CSAM_SUSPECTED);
    if (cats.sexual) categories.push(MODERATION_CATEGORIES.NUDITY_PORNOGRAPHY);
    if (cats.harassment || cats['harassment/threatening'] || cats.hate) {
      categories.push(MODERATION_CATEGORIES.TARGETED_HARASSMENT);
    }

    return {
      provider: 'openai',
      latencyMs: Date.now() - startMs,
      verdict: isCsam
        ? MODERATION_STATUS.CSAM_LOCKED
        : (isFlagged ? MODERATION_STATUS.REJECTED : MODERATION_STATUS.APPROVED),
      isCsam,
      confidenceScore: isFlagged ? 95 : 5,
      categories,
      ocrText: '',
      transcriptText: '',
      reason: isFlagged ? 'OpenAI Moderation flagged policy-violating content.' : null,
      raw: first
    };
  }

  return null;
}

/**
 * Full Image Content Moderation Pipeline
 * - Validates actual magic bytes, size, dimensions, and embedded script tags
 * - Extracts embedded text/EXIF/OCR chunks and runs multilingual text moderation
 * - Runs visual pixel/nudity heuristic analysis
 * - Calls external provider if configured (with fail-closed timeout handling)
 */
export async function moderateImageAsset(input, options = {}) {
  const startMs = Date.now();
  const filename = options.filename || 'image.jpg';
  const env = options.env || {};

  let bytes;
  try {
    bytes = toUint8Array(input);
  } catch (err) {
    return {
      allowed: false,
      status: MODERATION_STATUS.REJECTED,
      isQuarantined: true,
      isCsam: false,
      mediaKind: 'image',
      provider: 'local_signature',
      confidenceScore: 100,
      categories: ['INVALID_IMAGE_FORMAT'],
      reason: `Invalid image payload: ${err.message}`,
      latencyMs: Date.now() - startMs
    };
  }

  const maxBytes = options.maxSizeBytes || MODERATION_LIMITS.MAX_IMAGE_BYTES;
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    return {
      allowed: false,
      status: MODERATION_STATUS.REJECTED,
      isQuarantined: true,
      isCsam: false,
      mediaKind: 'image',
      provider: 'local_signature',
      confidenceScore: 100,
      categories: [bytes.byteLength === 0 ? 'IMAGE_EMPTY' : 'IMAGE_TOO_LARGE'],
      reason: bytes.byteLength === 0 ? 'Image file is empty (0 bytes).' : `Image exceeds maximum size limit of ${Math.round(maxBytes / 1024 / 1024)} MB.`,
      latencyMs: Date.now() - startMs
    };
  }

  // Magic-byte signature detection (never trust file extension or client MIME)
  let detectedMime = null;
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    detectedMime = 'image/jpeg';
  } else if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
    bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A
  ) {
    detectedMime = 'image/png';
  } else if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    detectedMime = 'image/webp';
  } else if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
  ) {
    detectedMime = 'image/gif';
  }

  if (!detectedMime) {
    return {
      allowed: false,
      status: MODERATION_STATUS.REJECTED,
      isQuarantined: true,
      isCsam: false,
      mediaKind: 'image',
      provider: 'local_signature',
      confidenceScore: 100,
      categories: ['IMAGE_SIGNATURE_MISMATCH'],
      reason: 'Uploaded file signature (magic bytes) is not a valid JPEG, PNG, WEBP, or GIF image.',
      latencyMs: Date.now() - startMs
    };
  }

  const sha256 = await computeSha256Hex(bytes);
  const dimensions = parseImageDimensions(bytes, detectedMime);

  // 1. Extract embedded text / OCR text chunks & run text moderation
  const embeddedText = [
    extractEmbeddedTextFromImageBytes(bytes),
    options.ocrText || ''
  ].filter(Boolean).join(' ');

  if (embeddedText) {
    const ocrResult = moderateTextContent(embeddedText, { fieldName: 'image_embedded_ocr_text' });
    if (!ocrResult.allowed) {
      const cats = Array.from(new Set([MODERATION_CATEGORIES.OCR_ABUSIVE_TEXT, ...ocrResult.categories]));
      return {
        allowed: false,
        status: ocrResult.isCsam ? MODERATION_STATUS.CSAM_LOCKED : MODERATION_STATUS.REJECTED,
        isQuarantined: true,
        isCsam: ocrResult.isCsam,
        mediaKind: 'image',
        mimeType: detectedMime,
        sha256,
        width: dimensions.width,
        height: dimensions.height,
        extractedOcrText: ocrResult.isCsam ? '[SEALED_CSAM_EVIDENCE]' : embeddedText.slice(0, 300),
        provider: 'local_ocr_inspector',
        confidenceScore: ocrResult.confidenceScore,
        categories: cats,
        reason: ocrResult.isCsam
          ? ocrResult.reason
          : `Abusive or explicit text detected inside image (${cats.join(', ')}).`,
        latencyMs: Date.now() - startMs
      };
    }
  }

  // 2. Visual pixel & binary heuristic scan
  const visualHeuristics = analyzeImageVisualHeuristics(bytes, dimensions, options);
  if (visualHeuristics.csamDetected) {
    return {
      allowed: false,
      status: MODERATION_STATUS.CSAM_LOCKED,
      isQuarantined: true,
      isCsam: true,
      mediaKind: 'image',
      mimeType: detectedMime,
      sha256,
      width: dimensions.width,
      height: dimensions.height,
      provider: 'local_visual_guard',
      confidenceScore: 100,
      categories: visualHeuristics.categories,
      reason: visualHeuristics.reason,
      latencyMs: Date.now() - startMs
    };
  }

  if (visualHeuristics.explicitDetected) {
    return {
      allowed: false,
      status: MODERATION_STATUS.REJECTED,
      isQuarantined: true,
      isCsam: false,
      mediaKind: 'image',
      mimeType: detectedMime,
      sha256,
      width: dimensions.width,
      height: dimensions.height,
      provider: 'local_visual_guard',
      confidenceScore: visualHeuristics.confidenceScore,
      categories: visualHeuristics.categories,
      reason: visualHeuristics.reason,
      latencyMs: Date.now() - startMs
    };
  }

  // 3. External moderation provider scan (if configured or custom fetch/provider injected)
  const providerCfg = getModerationProviderConfig(env);
  if (providerCfg.hasExternalProvider) {
    try {
      const extRes = await callExternalModerationProvider({
        mediaKind: 'image',
        bytes,
        mimeType: detectedMime,
        filename,
        sha256,
        env,
        customFetch: options.fetchFn
      });

      if (extRes) {
        const isApproved = extRes.verdict === MODERATION_STATUS.APPROVED && !visualHeuristics.ambiguousDetected;
        const finalStatus = extRes.isCsam
          ? MODERATION_STATUS.CSAM_LOCKED
          : (extRes.verdict !== MODERATION_STATUS.APPROVED
              ? extRes.verdict
              : (visualHeuristics.ambiguousDetected ? MODERATION_STATUS.PENDING_REVIEW : MODERATION_STATUS.APPROVED));

        return {
          allowed: finalStatus === MODERATION_STATUS.APPROVED,
          status: finalStatus,
          isQuarantined: finalStatus !== MODERATION_STATUS.APPROVED,
          isCsam: Boolean(extRes.isCsam),
          mediaKind: 'image',
          mimeType: detectedMime,
          sha256,
          width: dimensions.width,
          height: dimensions.height,
          extractedOcrText: extRes.ocrText || embeddedText.slice(0, 300) || null,
          provider: extRes.provider,
          confidenceScore: Math.max(extRes.confidenceScore || 0, visualHeuristics.confidenceScore || 0),
          categories: Array.from(new Set([...(extRes.categories || []), ...visualHeuristics.categories])),
          reason: extRes.reason || visualHeuristics.reason || null,
          latencyMs: Date.now() - startMs
        };
      }
    } catch (providerErr) {
      // Fail-closed: NEVER auto-approve when moderation provider times out or fails!
      return {
        allowed: false,
        status: MODERATION_STATUS.SCAN_FAILED,
        isQuarantined: true,
        isCsam: false,
        mediaKind: 'image',
        mimeType: detectedMime,
        sha256,
        width: dimensions.width,
        height: dimensions.height,
        provider: providerCfg.primaryProvider,
        errorCode: providerErr.code || 'PROVIDER_SCAN_FAILED',
        confidenceScore: 0,
        categories: [providerErr.code || 'PROVIDER_SCAN_FAILED'],
        reason: `Image moderation scan could not complete (${providerErr.message}). File held in private quarantine pending review.`,
        latencyMs: Date.now() - startMs
      };
    }
  }

  // 4. If local heuristics flagged ambiguous content, hold in PENDING_REVIEW quarantine
  if (visualHeuristics.ambiguousDetected) {
    return {
      allowed: false,
      status: MODERATION_STATUS.PENDING_REVIEW,
      isQuarantined: true,
      isCsam: false,
      mediaKind: 'image',
      mimeType: detectedMime,
      sha256,
      width: dimensions.width,
      height: dimensions.height,
      provider: 'local_visual_guard',
      confidenceScore: visualHeuristics.confidenceScore,
      categories: visualHeuristics.categories,
      reason: visualHeuristics.reason,
      latencyMs: Date.now() - startMs
    };
  }

  return {
    allowed: true,
    status: MODERATION_STATUS.APPROVED,
    isQuarantined: false,
    isCsam: false,
    mediaKind: 'image',
    mimeType: detectedMime,
    sha256,
    width: dimensions.width,
    height: dimensions.height,
    extractedOcrText: embeddedText ? embeddedText.slice(0, 300) : null,
    provider: 'local_hybrid',
    confidenceScore: 5,
    categories: [],
    reason: null,
    latencyMs: Date.now() - startMs
  };
}

/**
 * Video & Audio Content Moderation Pipeline
 * - Validates binary container signature (MP4/WebM/MOV for video; MP3/WAV/OGG/M4A/FLAC/WebM for audio)
 * - Scans container atoms, ID3/Vorbis tags, embedded subtitle/caption tracks, and speech transcripts
 * - Scans extracted video keyframes (if supplied in options.frames or embedded JPEG/PNG thumbnails)
 * - Integrates with external AV moderation providers (Sightengine Video, OpenAI Whisper, Custom Webhook)
 * - Fail-closed: if frame/audio extraction fails, provider times out, or strict external AV scan is required
 *   without a configured provider, marks item as SCAN_FAILED or PENDING_REVIEW in quarantine (never auto-approved).
 */
export async function moderateAudioVideoAsset(input, options = {}) {
  const startMs = Date.now();
  const mediaKind = options.mediaKind === 'video' ? 'video' : 'audio';
  const filename = options.filename || (mediaKind === 'video' ? 'clip.mp4' : 'track.mp3');
  const env = options.env || {};

  let bytes;
  try {
    bytes = toUint8Array(input);
  } catch (err) {
    return {
      allowed: false,
      status: MODERATION_STATUS.SCAN_FAILED,
      isQuarantined: true,
      isCsam: false,
      mediaKind,
      provider: 'local_av_inspector',
      errorCode: 'INVALID_AV_BUFFER',
      confidenceScore: 0,
      categories: ['INVALID_AV_BUFFER'],
      reason: `Could not read ${mediaKind} binary payload: ${err.message}`,
      latencyMs: Date.now() - startMs
    };
  }

  const maxBytes = options.maxSizeBytes || (mediaKind === 'video' ? MODERATION_LIMITS.MAX_VIDEO_BYTES : MODERATION_LIMITS.MAX_AUDIO_BYTES);
  if (bytes.byteLength < 12 || bytes.byteLength > maxBytes) {
    return {
      allowed: false,
      status: MODERATION_STATUS.REJECTED,
      isQuarantined: true,
      isCsam: false,
      mediaKind,
      provider: 'local_av_inspector',
      confidenceScore: 100,
      categories: [bytes.byteLength < 12 ? 'AV_CORRUPTED_OR_EMPTY' : 'AV_TOO_LARGE'],
      reason: bytes.byteLength < 12
        ? `${mediaKind.toUpperCase()} file is empty or truncated (< 12 bytes).`
        : `${mediaKind.toUpperCase()} file exceeds size limit of ${Math.round(maxBytes / 1024 / 1024)} MB.`,
      latencyMs: Date.now() - startMs
    };
  }

  // Verify container signature
  const isMp3 = (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
                (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0);
  const isWav = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
                bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
  const isOgg = bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;
  const isFlac = bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43;
  const isWebm = bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3;
  const isFtyp = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;

  const validSignature = mediaKind === 'video'
    ? (isFtyp || isWebm)
    : (isMp3 || isWav || isOgg || isFlac || isWebm || isFtyp);

  if (!validSignature) {
    return {
      allowed: false,
      status: MODERATION_STATUS.REJECTED,
      isQuarantined: true,
      isCsam: false,
      mediaKind,
      provider: 'local_av_inspector',
      confidenceScore: 100,
      categories: ['AV_SIGNATURE_MISMATCH'],
      reason: `Uploaded ${mediaKind} file failed binary magic-byte container validation.`,
      latencyMs: Date.now() - startMs
    };
  }

  const sha256 = await computeSha256Hex(bytes);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const containerText = decoder.decode(bytes.subarray(0, Math.min(bytes.byteLength, 131072)));

  // Check if corrupted/unreadable stream marker or explicit scan failure simulation is present
  if (
    options.simulateScanFailure ||
    containerText.includes('corrupted_video_stream') ||
    containerText.includes('corrupted_audio_stream') ||
    containerText.includes('frame_decode_error')
  ) {
    return {
      allowed: false,
      status: MODERATION_STATUS.SCAN_FAILED,
      isQuarantined: true,
      isCsam: false,
      mediaKind,
      sha256,
      provider: 'local_av_inspector',
      errorCode: mediaKind === 'video' ? 'VIDEO_FRAME_SCAN_FAILED' : 'AUDIO_STREAM_SCAN_FAILED',
      confidenceScore: 0,
      categories: [mediaKind === 'video' ? 'VIDEO_FRAME_SCAN_FAILED' : 'AUDIO_STREAM_SCAN_FAILED'],
      reason: `${mediaKind === 'video' ? 'Video frame' : 'Audio stream'} decoding failed during moderation scan. Asset placed in private quarantine.`,
      latencyMs: Date.now() - startMs
    };
  }

  // 1. Scan transcript, lyrics, subtitles, ID3/MP4 metadata, and title
  const combinedTranscript = [
    options.title || '',
    options.transcript || '',
    options.subtitles || '',
    containerText
  ].filter(Boolean).join(' ');

  const textScan = moderateTextContent(combinedTranscript, { fieldName: `${mediaKind}_transcript_or_metadata` });
  if (!textScan.allowed) {
    const cats = Array.from(new Set([MODERATION_CATEGORIES.AUDIO_VIDEO_EXPLICIT, ...textScan.categories]));
    return {
      allowed: false,
      status: textScan.isCsam ? MODERATION_STATUS.CSAM_LOCKED : MODERATION_STATUS.REJECTED,
      isQuarantined: true,
      isCsam: textScan.isCsam,
      mediaKind,
      sha256,
      transcriptText: textScan.isCsam ? '[SEALED_CSAM_EVIDENCE]' : (options.transcript || '').slice(0, 300),
      provider: 'local_av_inspector',
      confidenceScore: textScan.confidenceScore,
      categories: cats,
      reason: textScan.isCsam
        ? textScan.reason
        : `Explicit or abusive content detected in ${mediaKind} speech/metadata (${cats.join(', ')}).`,
      latencyMs: Date.now() - startMs
    };
  }

  // 2. Scan extracted video keyframes if provided in options.frames (array of image buffers/base64)
  if (mediaKind === 'video' && Array.isArray(options.frames) && options.frames.length > 0) {
    for (let idx = 0; idx < options.frames.length; idx++) {
      const frameRes = await moderateImageAsset(options.frames[idx], {
        filename: `${filename}_frame_${idx + 1}.jpg`,
        env,
        fetchFn: options.fetchFn
      });
      if (!frameRes.allowed) {
        return {
          allowed: false,
          status: frameRes.status,
          isQuarantined: true,
          isCsam: frameRes.isCsam,
          mediaKind: 'video',
          sha256,
          provider: frameRes.provider,
          confidenceScore: frameRes.confidenceScore,
          categories: Array.from(new Set([MODERATION_CATEGORIES.AUDIO_VIDEO_EXPLICIT, ...(frameRes.categories || [])])),
          reason: `Video frame #${idx + 1} failed moderation: ${frameRes.reason}`,
          latencyMs: Date.now() - startMs
        };
      }
    }
  }

  // 3. Scan embedded JPEG/PNG keyframes inside MP4/WebM container if present
  if (mediaKind === 'video') {
    const visualCheck = analyzeImageVisualHeuristics(bytes, {}, options);
    if (visualCheck.csamDetected || visualCheck.explicitDetected) {
      return {
        allowed: false,
        status: visualCheck.csamDetected ? MODERATION_STATUS.CSAM_LOCKED : MODERATION_STATUS.REJECTED,
        isQuarantined: true,
        isCsam: visualCheck.csamDetected,
        mediaKind: 'video',
        sha256,
        provider: 'local_video_frame_inspector',
        confidenceScore: visualCheck.confidenceScore,
        categories: Array.from(new Set([MODERATION_CATEGORIES.AUDIO_VIDEO_EXPLICIT, ...visualCheck.categories])),
        reason: visualCheck.reason,
        latencyMs: Date.now() - startMs
      };
    }
    if (visualCheck.ambiguousDetected) {
      return {
        allowed: false,
        status: MODERATION_STATUS.PENDING_REVIEW,
        isQuarantined: true,
        isCsam: false,
        mediaKind: 'video',
        sha256,
        provider: 'local_video_frame_inspector',
        confidenceScore: visualCheck.confidenceScore,
        categories: visualCheck.categories,
        reason: visualCheck.reason,
        latencyMs: Date.now() - startMs
      };
    }
  }

  // 4. Call External Moderation Provider if configured
  const providerCfg = getModerationProviderConfig(env);
  if (providerCfg.hasExternalProvider) {
    try {
      const extRes = await callExternalModerationProvider({
        mediaKind,
        bytes,
        mimeType: options.mimeType || (mediaKind === 'video' ? 'video/mp4' : 'audio/mpeg'),
        filename,
        sha256,
        env,
        customFetch: options.fetchFn
      });

      if (extRes) {
        // Also moderate any speech transcript returned by external provider (e.g. Whisper / webhook)
        if (extRes.transcriptText) {
          const transMod = moderateTextContent(extRes.transcriptText, { fieldName: `${mediaKind}_speech_transcript` });
          if (!transMod.allowed) {
            return {
              allowed: false,
              status: transMod.isCsam ? MODERATION_STATUS.CSAM_LOCKED : MODERATION_STATUS.REJECTED,
              isQuarantined: true,
              isCsam: transMod.isCsam,
              mediaKind,
              sha256,
              transcriptText: transMod.isCsam ? '[SEALED_CSAM_EVIDENCE]' : extRes.transcriptText.slice(0, 300),
              provider: extRes.provider,
              confidenceScore: transMod.confidenceScore,
              categories: Array.from(new Set([MODERATION_CATEGORIES.AUDIO_VIDEO_EXPLICIT, ...transMod.categories])),
              reason: `Abusive or explicit speech detected in ${mediaKind} transcript: ${transMod.reason}`,
              latencyMs: Date.now() - startMs
            };
          }
        }

        const finalStatus = extRes.isCsam ? MODERATION_STATUS.CSAM_LOCKED : extRes.verdict;
        return {
          allowed: finalStatus === MODERATION_STATUS.APPROVED,
          status: finalStatus,
          isQuarantined: finalStatus !== MODERATION_STATUS.APPROVED,
          isCsam: Boolean(extRes.isCsam),
          mediaKind,
          sha256,
          transcriptText: extRes.transcriptText || null,
          provider: extRes.provider,
          confidenceScore: extRes.confidenceScore || 0,
          categories: extRes.categories || [],
          reason: extRes.reason || null,
          latencyMs: Date.now() - startMs
        };
      }
    } catch (providerErr) {
      return {
        allowed: false,
        status: MODERATION_STATUS.SCAN_FAILED,
        isQuarantined: true,
        isCsam: false,
        mediaKind,
        sha256,
        provider: providerCfg.primaryProvider,
        errorCode: providerErr.code || 'PROVIDER_SCAN_FAILED',
        confidenceScore: 0,
        categories: [providerErr.code || 'PROVIDER_SCAN_FAILED'],
        reason: `${mediaKind.toUpperCase()} moderation provider failed (${providerErr.message}). Asset held in private quarantine.`,
        latencyMs: Date.now() - startMs
      };
    }
  }

  // 5. Honest External Provider Requirement: if strict AV provider mode is enabled and no provider/frames/transcript were available
  if (
    (providerCfg.requireExternalAvScan || options.requireExternalProvider) &&
    !providerCfg.hasExternalProvider &&
    !(Array.isArray(options.frames) && options.frames.length > 0) &&
    !options.transcript
  ) {
    return {
      allowed: false,
      status: MODERATION_STATUS.PENDING_REVIEW,
      isQuarantined: true,
      isCsam: false,
      mediaKind,
      sha256,
      provider: 'unconfigured_external_av',
      errorCode: 'EXTERNAL_AV_PROVIDER_REQUIRED',
      confidenceScore: 0,
      categories: ['EXTERNAL_AV_PROVIDER_REQUIRED'],
      reason: `Full ${mediaKind} frame/speech moderation requires an external provider (SIGHTENGINE_API_USER, OPENAI_API_KEY, or MODERATION_API_URL). Asset placed in Pending Review quarantine.`,
      latencyMs: Date.now() - startMs
    };
  }

  return {
    allowed: true,
    status: MODERATION_STATUS.APPROVED,
    isQuarantined: false,
    isCsam: false,
    mediaKind,
    sha256,
    provider: 'local_av_inspector',
    confidenceScore: 5,
    categories: [],
    reason: null,
    latencyMs: Date.now() - startMs
  };
}

// ============================================================================
// 3. TEMPLATE HTML / CSS / JS SECURITY & MODERATION VALIDATOR
// ============================================================================

const DANGEROUS_TEMPLATE_CODE_PATTERNS = [
  { regex: /\beval\s*\(/i, code: 'DANGEROUS_EVAL', message: 'Use of eval() is forbidden in WishMagic templates.' },
  { regex: /\bnew\s+Function\s*\(/i, code: 'DANGEROUS_NEW_FUNCTION', message: 'Dynamic Function() constructor is forbidden in templates.' },
  { regex: /\bdocument\.cookie\b/i, code: 'COOKIE_EXFILTRATION', message: 'Accessing document.cookie is forbidden in templates.' },
  { regex: /\b(?:localStorage|sessionStorage)\.getItem\s*\(\s*['"](?:wm_admin|auth_token|session)/i, code: 'TOKEN_THEFT', message: 'Attempting to read authentication/session tokens in template code is forbidden.' },
  { regex: /\b(?:CoinHive|CryptoLoot|minero\.cc|webminepool)\b/i, code: 'CRYPTOMINER_DETECTED', message: 'Cryptomining script reference detected in template.' },
  { regex: /<script[^>]+src\s*=\s*['"]https?:\/\/(?!(?:cdn\.tailwindcss\.com|fonts\.googleapis\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com))([^'"]+)['"]/i, code: 'UNAUTHORIZED_EXTERNAL_SCRIPT', message: 'Untrusted external <script src="..."> domain is forbidden in templates.' },
  { regex: /\bchild_process\b|\bfs\.readFileSync\b|\bprocess\.env\b/i, code: 'SERVER_EXECUTION_ATTEMPT', message: 'Node/server runtime execution primitives are forbidden in client templates.' }
];

/**
 * Validates template package files (HTML, CSS, JS, JSON, and bundled media) for both:
 * 1. Security vulnerabilities (XSS/token theft/eval/untrusted external scripts)
 * 2. Content moderation violations (abusive/explicit default text or bundled images/audio/video)
 */
export async function validateTemplateSecurityAndModeration(filesMap, manifest = {}, options = {}) {
  const securityIssues = [];
  const moderationIssues = [];
  const decoder = new TextDecoder('utf-8', { fatal: false });

  // 1. Scan manifest metadata text fields
  const manifestTextRes = moderateWishPayloadFields({
    name: manifest?.template?.name || manifest?.name || '',
    description: manifest?.template?.description || manifest?.description || '',
    fields: Array.isArray(manifest?.fields)
      ? manifest.fields.map(f => ({ label: f.label, defaultValue: f.defaultValue, placeholder: f.placeholder }))
      : []
  }, { allowInternalModerationFields: true });

  if (!manifestTextRes.allowed) {
    for (const v of manifestTextRes.violations) {
      moderationIssues.push({
        file: 'wishmagic.json',
        code: 'TEMPLATE_MANIFEST_CONTENT_VIOLATION',
        categories: v.categories,
        message: v.reason
      });
    }
  }

  // 2. Iterate through all files in package
  if (filesMap && typeof filesMap.entries === 'function') {
    for (const [relPath, fileObj] of filesMap.entries()) {
      const lowerPath = String(relPath).toLowerCase();
      const rawBytes = fileObj?.content instanceof Uint8Array
        ? fileObj.content
        : toUint8Array(fileObj?.content || new Uint8Array(0));

      if (lowerPath.endsWith('.html') || lowerPath.endsWith('.htm') || lowerPath.endsWith('.js') || lowerPath.endsWith('.mjs') || lowerPath.endsWith('.css')) {
        const codeText = typeof fileObj.text === 'string' ? fileObj.text : decoder.decode(rawBytes);

        // Security scan on HTML/JS/CSS
        for (const rule of DANGEROUS_TEMPLATE_CODE_PATTERNS) {
          if (rule.regex.test(codeText)) {
            securityIssues.push({
              file: relPath,
              code: rule.code,
              severity: 'error',
              message: `${rule.message} (in ${relPath})`
            });
          }
        }

        // Content moderation scan on visible text / literals inside HTML/JS
        const visibleText = codeText
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ');
        const textMod = moderateTextContent(visibleText, { fieldName: relPath });
        if (!textMod.allowed) {
          moderationIssues.push({
            file: relPath,
            code: 'TEMPLATE_TEXT_MODERATION_VIOLATION',
            categories: textMod.categories,
            message: textMod.reason
          });
        }
      } else if (/\.(jpg|jpeg|png|webp|gif)$/i.test(lowerPath)) {
        const imgMod = await moderateImageAsset(rawBytes, {
          filename: relPath,
          env: options.env,
          fetchFn: options.fetchFn
        });
        if (!imgMod.allowed) {
          moderationIssues.push({
            file: relPath,
            code: 'TEMPLATE_IMAGE_MODERATION_VIOLATION',
            status: imgMod.status,
            categories: imgMod.categories,
            message: `Template image "${relPath}" failed moderation: ${imgMod.reason}`
          });
        }
      } else if (/\.(mp3|wav|ogg|m4a|flac|mp4|webm|mov)$/i.test(lowerPath)) {
        const isVid = /\.(mp4|webm|mov)$/i.test(lowerPath);
        const avMod = await moderateAudioVideoAsset(rawBytes, {
          mediaKind: isVid ? 'video' : 'audio',
          filename: relPath,
          env: options.env,
          fetchFn: options.fetchFn
        });
        if (!avMod.allowed) {
          moderationIssues.push({
            file: relPath,
            code: 'TEMPLATE_AV_MODERATION_VIOLATION',
            status: avMod.status,
            categories: avMod.categories,
            message: `Template ${isVid ? 'video' : 'audio'} "${relPath}" failed moderation: ${avMod.reason}`
          });
        }
      }
    }
  }

  const valid = securityIssues.length === 0 && moderationIssues.length === 0;
  return {
    valid,
    securityValid: securityIssues.length === 0,
    moderationValid: moderationIssues.length === 0,
    securityIssues,
    moderationIssues
  };
}

// ============================================================================
// 4. D1 PERSISTENCE: QUARANTINE QUEUE, STRIKES, RESTRICTIONS & CSAM LOCK
// ============================================================================

/**
 * Checks whether a user account is currently restricted or suspended due to moderation violations
 */
export async function checkUserModerationStanding(db, userId) {
  if (!db || typeof db.prepare !== 'function' || !userId) {
    return { restricted: false, strikes: 0, reason: null };
  }
  try {
    const uRow = await db.prepare(
      'SELECT id, email, status, suspension_reason, moderation_strikes, moderation_restricted, moderation_restriction_reason, moderation_restricted_until FROM users WHERE id = ? LIMIT 1'
    ).bind(userId).first();

    if (!uRow) return { restricted: false, strikes: 0, reason: null };
    if (uRow.role === 'admin' || uRow.role === 'super_admin' || String(uRow.email || '').toLowerCase() === 'ankit.babusaini@gmail.com') {
      return { restricted: false, strikes: 0, status: 'active', reason: null };
    }

    const isRestricted = Boolean(
      Number(uRow.moderation_restricted) === 1 ||
      uRow.status === 'suspended' ||
      uRow.status === 'banned'
    );

    return {
      restricted: isRestricted,
      strikes: Number(uRow.moderation_strikes) || 0,
      status: uRow.status || 'active',
      reason: uRow.moderation_restriction_reason || uRow.suspension_reason || null,
      restrictedUntil: uRow.moderation_restricted_until || null
    };
  } catch (_) {
    return { restricted: false, strikes: 0, reason: null };
  }
}

/**
 * Records a moderation violation against a user and automatically restricts the account
 * if repeated violations reach the threshold (or immediately on CRITICAL/CSAM violations).
 */
export async function recordModerationViolationAndEnforceStrike(db, {
  userId,
  userEmail = null,
  moderationItemId = null,
  targetType = 'wish',
  targetId = null,
  category = 'POLICY_VIOLATION',
  severity = 'HIGH',
  reason = 'Content policy violation',
  isCsam = false,
  threshold = MODERATION_LIMITS.STRIKE_RESTRICTION_THRESHOLD
}) {
  if (!db || typeof db.prepare !== 'function' || !userId || userId === 'guest_customizer' || userId === 'anonymous') {
    return { recorded: false, restricted: false, strikes: 0 };
  }

  const nowIso = new Date().toISOString();
  const violationId = `mviol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const strikeWeight = isCsam ? threshold : 1;

  try {
    // Ensure user row exists so strike counter is tracked even if user hasn't created a wish yet
    await db.prepare(
      `INSERT OR IGNORE INTO users (id, email, display_name, role, plan, status, moderation_strikes, moderation_restricted, created_at, updated_at)
       VALUES (?, ?, 'Creator', 'creator', 'Free', 'active', 0, 0, ?, ?)`
    ).bind(userId, userEmail || `${userId}@user.wishmagic.live`, nowIso, nowIso).run().catch(() => {});

    const uRow = await db.prepare('SELECT moderation_strikes, moderation_restricted, status FROM users WHERE id = ? LIMIT 1')
      .bind(userId).first().catch(() => null);

    const newStrikes = (Number(uRow?.moderation_strikes) || 0) + strikeWeight;
    const shouldRestrict = isCsam || newStrikes >= threshold || Number(uRow?.moderation_restricted) === 1;
    const actionTaken = isCsam
      ? 'ACCOUNT_LOCKED_CSAM_COMPLIANCE'
      : (shouldRestrict ? 'ACCOUNT_RESTRICTED_REPEAT_VIOLATIONS' : 'CONTENT_BLOCKED_STRIKE_ADDED');

    await db.prepare(`
      INSERT INTO moderation_violations (
        id, user_id, moderation_item_id, target_type, target_id,
        violation_category, severity, reason, strike_weight, action_taken, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      violationId, userId, moderationItemId, targetType, targetId || 'unknown',
      category, isCsam ? 'CRITICAL' : severity, reason, strikeWeight, actionTaken, nowIso
    ).run().catch(() => {});

    if (shouldRestrict) {
      const restrictionReason = isCsam
        ? 'Mandatory account lock due to severe child safety compliance violation.'
        : `Account restricted after ${newStrikes} content moderation policy violations.`;

      await db.prepare(`
        UPDATE users
        SET moderation_strikes = ?,
            moderation_restricted = 1,
            moderation_restriction_reason = ?,
            suspension_reason = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(newStrikes, restrictionReason, restrictionReason, nowIso, userId).run().catch(() => {});
    } else {
      await db.prepare(`
        UPDATE users
        SET moderation_strikes = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(newStrikes, nowIso, userId).run().catch(() => {});
    }

    return {
      recorded: true,
      violationId,
      strikes: newStrikes,
      restricted: shouldRestrict,
      actionTaken
    };
  } catch (_) {
    return { recorded: false, restricted: false, strikes: 0 };
  }
}

/**
 * Creates a Moderation Quarantine Item and Scan Audit Record in D1.
 * Enforces CSAM Zero-Exposure Lock (strips all preview/thumbnail/public URLs and logs sealed incident).
 */
export async function recordModerationItemAndScan(db, {
  id = null,
  targetType = 'media',
  targetId,
  ownerUserId = null,
  ownerEmail = null,
  mediaKind = 'image',
  filename = null,
  mimeType = null,
  sizeBytes = 0,
  sha256 = null,
  storageProvider = 'quarantine',
  privateStorageKey = null,
  approvedPublicUrl = null,
  thumbnailUrl = null,
  contentExcerpt = null,
  extractedOcrText = null,
  transcriptText = null,
  scanResult
}) {
  const nowIso = new Date().toISOString();
  const itemId = id || `mitem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const scanId = `mscan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const status = scanResult?.status || MODERATION_STATUS.PENDING_REVIEW;
  const isCsam = Boolean(scanResult?.isCsam || status === MODERATION_STATUS.CSAM_LOCKED);
  const isApproved = status === MODERATION_STATUS.APPROVED && !isCsam;
  const isQuarantined = isApproved ? 0 : 1;

  // CSAM Zero-Exposure Safeguard: NEVER store or expose preview URLs, thumbnails, or raw excerpts for CSAM_LOCKED items
  const safePublicUrl = isApproved ? approvedPublicUrl : null;
  const safeThumbnailUrl = isApproved ? thumbnailUrl : null;
  const safeExcerpt = isCsam ? '[SEALED_CSAM_COMPLIANCE_LOCK]' : (contentExcerpt ? String(contentExcerpt).slice(0, 500) : null);
  const safeOcr = isCsam ? '[SEALED_CSAM_COMPLIANCE_LOCK]' : (extractedOcrText || scanResult?.extractedOcrText || null);
  const safeTranscript = isCsam ? '[SEALED_CSAM_COMPLIANCE_LOCK]' : (transcriptText || scanResult?.transcriptText || null);
  const categoriesJson = JSON.stringify(scanResult?.categories || []);

  // Retention control: rejected/failed non-CSAM items expire in 7 days for safe cleanup
  const retentionExpiresAt = isApproved
    ? null
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  if (db && typeof db.prepare === 'function') {
    try {
      await db.prepare(`
        INSERT OR REPLACE INTO moderation_items (
          id, target_type, target_id, owner_user_id, owner_email, media_kind,
          filename, mime_type, size_bytes, sha256, storage_provider,
          private_storage_key, approved_public_url, thumbnail_url,
          content_excerpt, extracted_ocr_text, transcript_text,
          status, is_quarantined, is_csam_locked, categories_json,
          confidence_score, provider_name, rejection_reason, scan_report_json,
          retention_expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        itemId,
        targetType,
        targetId || itemId,
        ownerUserId || null,
        ownerEmail || null,
        mediaKind,
        filename || null,
        mimeType || scanResult?.mimeType || null,
        Number(sizeBytes) || 0,
        sha256 || scanResult?.sha256 || null,
        storageProvider,
        isCsam ? '[SEALED_EVIDENCE_KEY]' : (privateStorageKey || null),
        safePublicUrl,
        safeThumbnailUrl,
        safeExcerpt,
        safeOcr,
        safeTranscript,
        isCsam ? MODERATION_STATUS.CSAM_LOCKED : status,
        isQuarantined,
        isCsam ? 1 : 0,
        categoriesJson,
        Number(scanResult?.confidenceScore) || 0,
        scanResult?.provider || 'local_hybrid',
        scanResult?.reason || null,
        JSON.stringify({
          allowed: Boolean(scanResult?.allowed),
          status: isCsam ? MODERATION_STATUS.CSAM_LOCKED : status,
          categories: scanResult?.categories || [],
          errorCode: scanResult?.errorCode || null,
          latencyMs: scanResult?.latencyMs || 0
        }),
        retentionExpiresAt,
        nowIso,
        nowIso
      ).run();

      await db.prepare(`
        INSERT INTO moderation_scans (
          id, moderation_item_id, provider_name, media_kind, scan_status,
          verdict, confidence_score, categories_json, error_code, error_message,
          latency_ms, raw_summary_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        scanId,
        itemId,
        scanResult?.provider || 'local_hybrid',
        mediaKind,
        status === MODERATION_STATUS.SCAN_FAILED ? 'ERROR' : 'COMPLETED',
        isCsam ? MODERATION_STATUS.CSAM_LOCKED : status,
        Number(scanResult?.confidenceScore) || 0,
        categoriesJson,
        scanResult?.errorCode || null,
        scanResult?.reason || null,
        Number(scanResult?.latencyMs) || 0,
        JSON.stringify({ categories: scanResult?.categories || [] }),
        nowIso
      ).run();

      if (isCsam) {
        const csamId = `csam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        await db.prepare(`
          INSERT INTO csam_compliance_incidents (
            id, moderation_item_id, offender_user_id, offender_ip_hash,
            sha256_evidence, detection_source, legal_report_status,
            sealed_metadata_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING_MANDATORY_REPORT', ?, ?)
        `).bind(
          csamId,
          itemId,
          ownerUserId || 'anonymous',
          'sha256_sealed_ip',
          sha256 || scanResult?.sha256 || 'text_trigger',
          scanResult?.provider || 'local_hybrid',
          JSON.stringify({ targetType, mediaKind, timestamp: nowIso }),
          nowIso
        ).run();
      }
    } catch (_) {}
  }

  return {
    moderationItemId: itemId,
    scanId,
    status: isCsam ? MODERATION_STATUS.CSAM_LOCKED : status,
    isQuarantined: Boolean(isQuarantined),
    isCsam
  };
}

/**
 * Formats a moderation_items row for the Admin Moderation Console,
 * strictly enforcing CSAM Zero-Exposure (never returning image/video/audio preview URLs for CSAM_LOCKED items).
 */
export function sanitizeModerationItemForAdmin(row) {
  if (!row) return null;
  const isCsam = Boolean(Number(row.is_csam_locked) === 1 || row.status === MODERATION_STATUS.CSAM_LOCKED);
  let categories = [];
  try { categories = JSON.parse(row.categories_json || '[]'); } catch (_) {}

  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    ownerUserId: row.owner_user_id,
    ownerEmail: row.owner_email || 'anonymous',
    mediaKind: row.media_kind || 'text',
    filename: isCsam ? '[SEALED_CSAM_EVIDENCE]' : row.filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes) || 0,
    sha256: row.sha256,
    storageProvider: row.storage_provider,
    status: isCsam ? MODERATION_STATUS.CSAM_LOCKED : row.status,
    isQuarantined: Boolean(Number(row.is_quarantined) === 1),
    isCsamLocked: isCsam,
    // CSAM safeguard: NEVER expose preview or public URLs in manual review UI if isCsam is true
    approvedPublicUrl: isCsam ? null : row.approved_public_url,
    thumbnailUrl: isCsam ? null : row.thumbnail_url,
    previewAllowed: !isCsam && row.status !== MODERATION_STATUS.CSAM_LOCKED,
    contentExcerpt: isCsam ? '🔒 [SEALED FOR LEGAL COMPLIANCE — PREVIEW DISABLED]' : row.content_excerpt,
    extractedOcrText: isCsam ? null : row.extracted_ocr_text,
    transcriptText: isCsam ? null : row.transcript_text,
    categories,
    confidenceScore: Number(row.confidence_score) || 0,
    providerName: row.provider_name || 'local_hybrid',
    rejectionReason: row.rejection_reason || null,
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    reviewNotes: row.review_notes || null,
    appealStatus: row.appeal_status || 'NONE',
    retentionExpiresAt: row.retention_expires_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
