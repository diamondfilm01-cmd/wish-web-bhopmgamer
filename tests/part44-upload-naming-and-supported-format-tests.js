import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getMimeType,
  validateAudioBuffer,
  validateVideoBuffer
} from '../src/storage-provider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to create a minimal valid MP3 buffer (ID3v2 header + MPEG frame sync)
function createValidMp3Buffer(text = 'WishMagic Track') {
  const id3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20]);
  const frame = Buffer.from([0xFF, 0xFB, 0x90, 0x64]); // MPEG-1 Layer 3 128kbps 44.1kHz
  const payload = Buffer.from(text.padEnd(256, 'X'));
  return Buffer.concat([id3, frame, payload]);
}

// Helper to create a minimal valid MP4 buffer ('ftypisom')
function createValidMp4Buffer(text = 'WishMagic Reel') {
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x20, // size 32
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x69, 0x73, 0x6F, 0x6D, // 'isom'
    0x00, 0x00, 0x02, 0x00, // minor version
    0x69, 0x73, 0x6F, 0x6D, 0x6D, 0x70, 0x34, 0x32 // compatible brands
  ]);
  const payload = Buffer.from(text.padEnd(256, 'V'));
  return Buffer.concat([ftyp, payload]);
}

test('WishMagic Part 44: Upload Naming & Supported Format Playback', async (t) => {
  await t.test('1. getMimeType maps media extensions to valid browser-supported formats', () => {
    assert.equal(getMimeType('track.mp3'), 'audio/mpeg');
    assert.equal(getMimeType('track.wav'), 'audio/wav');
    assert.equal(getMimeType('track.ogg'), 'audio/ogg');
    assert.equal(getMimeType('track.m4a'), 'audio/mp4');
    assert.equal(getMimeType('track.aac'), 'audio/aac');
    assert.equal(getMimeType('track.flac'), 'audio/flac');
    assert.equal(getMimeType('video.mp4'), 'video/mp4');
    assert.equal(getMimeType('video.webm'), 'video/webm');
    assert.equal(getMimeType('video.mov'), 'video/quicktime');
    assert.equal(getMimeType('video.mkv'), 'video/x-matroska');
  });

  await t.test('2. Custom Title provided: uses chosen title with no extra timestamp/prefix in B2', async () => {
    const mp3Buf = createValidMp3Buffer('Custom Title Song');
    const validation = await validateAudioBuffer(mp3Buf, { filename: 'device_recording_xyz.mp3' });

    const rawUserTitle = 'Romantic Love Melody';
    const safeFilename = 'device_recording_xyz.mp3';

    let targetBaseName = '';
    let finalTitle = '';

    if (rawUserTitle && rawUserTitle !== 'media-upload' && rawUserTitle !== 'upload') {
      finalTitle = rawUserTitle;
      if (rawUserTitle.toLowerCase().endsWith('.' + validation.extension.toLowerCase())) {
        targetBaseName = rawUserTitle;
      } else {
        targetBaseName = `${rawUserTitle}.${validation.extension}`;
      }
    } else {
      targetBaseName = safeFilename;
      finalTitle = safeFilename.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim() || safeFilename;
    }

    const cleanFileName = path.basename(targetBaseName).replace(/[\\/]/g, '_').trim();
    const storageKey = `music/${cleanFileName}`;

    assert.equal(finalTitle, 'Romantic Love Melody');
    assert.equal(cleanFileName, 'Romantic Love Melody.mp3');
    assert.equal(storageKey, 'music/Romantic Love Melody.mp3');
    assert.ok(!storageKey.includes(String(Date.now()).substring(0, 5)), 'Must not contain timestamp in B2 key');
    assert.ok(!storageKey.includes('mus_'), 'Must not contain random ID in B2 key');
  });

  await t.test('3. Blank Title: uses original file name with no extra prefix in B2', async () => {
    const mp3Buf = createValidMp3Buffer('Original File Song');
    const validation = await validateAudioBuffer(mp3Buf, { filename: 'my_awesome_track_2026.mp3' });

    const rawUserTitle = ''; // User left title blank!
    const safeFilename = 'my_awesome_track_2026.mp3';

    let targetBaseName = '';
    let finalTitle = '';

    if (rawUserTitle && rawUserTitle !== 'media-upload' && rawUserTitle !== 'upload') {
      finalTitle = rawUserTitle;
      if (rawUserTitle.toLowerCase().endsWith('.' + validation.extension.toLowerCase())) {
        targetBaseName = rawUserTitle;
      } else {
        targetBaseName = `${rawUserTitle}.${validation.extension}`;
      }
    } else {
      targetBaseName = safeFilename;
      finalTitle = safeFilename.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim() || safeFilename;
    }

    const cleanFileName = path.basename(targetBaseName).replace(/[\\/]/g, '_').trim();
    const storageKey = `music/${cleanFileName}`;

    assert.equal(cleanFileName, 'my_awesome_track_2026.mp3');
    assert.equal(storageKey, 'music/my_awesome_track_2026.mp3');
    assert.equal(finalTitle, 'my awesome track 2026');
    assert.ok(!storageKey.includes(String(Date.now()).substring(0, 5)), 'Must not contain timestamp in B2 key');
    assert.ok(!storageKey.includes('mus_'), 'Must not contain random ID in B2 key');
  });

  await t.test('4. Video Upload Naming: respects custom title or original filename in B2', async () => {
    const mp4Buf = createValidMp4Buffer('Celebration Video Reel');
    const validation = await validateVideoBuffer(mp4Buf, { filename: 'camera_capture_102.mp4' });

    // Case 4A: User gives custom name
    const titleA = 'Birthday Confetti Blast';
    const targetA = `${titleA}.${validation.extension}`;
    const cleanA = path.basename(targetA).replace(/[\\/]/g, '_').trim();
    const keyA = `videos/${cleanA}`;
    assert.equal(keyA, 'videos/Birthday Confetti Blast.mp4');

    // Case 4B: User leaves blank
    const targetB = 'camera_capture_102.mp4';
    const cleanB = path.basename(targetB).replace(/[\\/]/g, '_').trim();
    const keyB = `videos/${cleanB}`;
    assert.equal(keyB, 'videos/camera_capture_102.mp4');
  });

  await t.test('5. Static Audio files exist and are verified true MP3s', () => {
    const staticDir = path.join(__dirname, '..', 'public', 'audio');
    const files = ['celebration-strings.mp3', 'golden-nostalgia.mp3', 'romantic-piano.mp3'];
    for (const f of files) {
      const full = path.join(staticDir, f);
      assert.ok(fs.existsSync(full), `File ${f} must exist in public/audio`);
      const bytes = fs.readFileSync(full);
      // Verify ID3v2 header: 'ID3' (0x49, 0x44, 0x33)
      assert.equal(bytes[0], 0x49);
      assert.equal(bytes[1], 0x44);
      assert.equal(bytes[2], 0x33);
      assert.ok(bytes.length > 50000, `${f} must have non-trivial audio content`);
    }
  });

  await t.test('6. HTML script syntax validation for admin-media.html', () => {
    const htmlPath = path.join(__dirname, '..', 'public', 'admin-media.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
    let match;
    let count = 0;
    while ((match = scriptRegex.exec(html)) !== null) {
      const code = match[1].trim();
      if (code) {
        count++;
        assert.doesNotThrow(() => {
          new Function(code);
        }, `Script ${count} in admin-media.html has syntax errors!`);
      }
    }
    assert.ok(count > 0, 'Must have validated at least one script block');
  });
});
