/**
 * Automated Test Suite for WishMagic Template Switching + State Migration System (Part 15)
 * =========================================================================================
 * Tests:
 * 1. Canonical Data Ingestion & Store Creation (Universal Store integrity)
 * 2. Semantic Standard Key Mapping (recipient, sender, message, date cross-field aliases)
 * 3. Field Type Adaptation & Conversion (number clamping, boolean casting, select options)
 * 4. Media Migration & Graceful Clamping (multi-photo to single photo, cover photo extraction)
 * 5. Media Capability Filtering (voice note & BGM retained in canonical, disabled in projection)
 * 6. Section State Migration & Default Initialization (matching sections, new sections, unsupported sections)
 * 7. Visual / Theme Palette Adaptation (supported palette matching, fallback palette adaptation)
 * 8. Animation & Effects Projection (particles/confetti support filtering)
 * 9. Round-Trip Integrity (Switch Template A -> Template B -> Template A with zero data loss)
 * 10. Generic Architecture Verification (zero templateId hardcoded conditionals)
 * 11. Migration Diff & User-Facing Summary Generation (preserved, adapted, unsupported, initialized)
 * 12. Template Switcher Orchestration & History Tracking (undo capability, lifecycle events)
 * 13. Preview Controller Integration (preview controller instance switchTemplate with migrator)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const migratorCode = fs.readFileSync(path.resolve('./public/js/wishmagic-state-migrator.js'), 'utf8');
const previewCode = fs.readFileSync(path.resolve('./public/js/wishmagic-preview-controller.js'), 'utf8');

function setupEnvironment() {
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Set,
    Map,
    setTimeout,
    clearTimeout,
    CustomEvent: class CustomEvent {
      constructor(type, detail) {
        this.type = type;
        this.detail = detail;
      }
    },
    window: {
      dispatchEvent: () => {}
    }
  };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(migratorCode, sandbox);
  sandbox.WishMagicStateMigrator = sandbox.window?.WishMagicStateMigrator || sandbox.WishMagicStateMigrator;
  sandbox.WishMagicTemplateSwitcher = sandbox.window?.WishMagicTemplateSwitcher || sandbox.WishMagicTemplateSwitcher;
  return sandbox;
}

describe('Part 15 — WishMagic Template Switching & State Migration System', () => {

  it('TEST 1: Canonical Data Ingestion & Store Creation', () => {
    const env = setupEnvironment();
    const Migrator = env.WishMagicStateMigrator;

    assert.ok(Migrator, 'WishMagicStateMigrator is exported');
    assert.strictEqual(typeof Migrator.createCanonicalData, 'function');

    const canonical = Migrator.createCanonicalData({
      recipient_name: 'Kritika Sharma',
      sender_name: 'Ankit Patel',
      custom_message: 'Happy 25th Birthday!',
      event_date: '2026-10-25',
      cover_photo: 'https://example.com/cover.jpg',
      photos: [
        { id: 'p1', url: 'https://example.com/1.jpg', name: 'Photo 1' },
        { id: 'p2', url: 'https://example.com/2.jpg', name: 'Photo 2' }
      ],
      customAttribute: 'SpecialKeepsake'
    });

    assert.strictEqual(canonical.content.recipient_name, 'Kritika Sharma');
    assert.strictEqual(canonical.content.sender_name, 'Ankit Patel');
    assert.strictEqual(canonical.content.custom_message, 'Happy 25th Birthday!');
    assert.strictEqual(canonical.media.coverPhoto, 'https://example.com/cover.jpg');
    assert.strictEqual(canonical.media.photos.length, 2);
    assert.strictEqual(canonical.content.customAttribute, 'SpecialKeepsake');
  });

  it('TEST 2: Semantic Standard Key Mapping across different schema aliases', () => {
    const env = setupEnvironment();
    const Migrator = env.WishMagicStateMigrator;

    const canonical = Migrator.createCanonicalData({
      recipient_name: 'Aarav',
      sender_name: 'Pooja',
      custom_message: 'May your year be filled with joy!',
      event_date: '2026-11-15'
    });

    // Target Template with alternative schema keys
    const targetSchema = {
      fields: [
        { key: 'to_name', type: 'text', label: 'Celebrant' },
        { key: 'from_name', type: 'text', label: 'From' },
        { key: 'letter_body', type: 'textarea', label: 'Letter' },
        { key: 'target_date', type: 'date', label: 'Date' }
      ]
    };

    const result = Migrator.migrate({
      canonicalData: canonical,
      targetSchema
    });

    assert.strictEqual(result.projectedData.to_name, 'Aarav', 'recipient_name mapped to to_name');
    assert.strictEqual(result.projectedData.from_name, 'Pooja', 'sender_name mapped to from_name');
    assert.strictEqual(result.projectedData.letter_body, 'May your year be filled with joy!', 'custom_message mapped to letter_body');
    assert.strictEqual(result.projectedData.target_date, '2026-11-15', 'event_date mapped to target_date');
  });

  it('TEST 3: Field Type Adaptation & Conversion (Numbers, Booleans, Selects)', () => {
    const env = setupEnvironment();
    const Migrator = env.WishMagicStateMigrator;

    const canonical = Migrator.createCanonicalData({
      age_number: '28',
      speed_val: 150,
      enable_confetti: 'yes',
      theme_choice: 'royal'
    });

    const targetSchema = {
      fields: [
        { key: 'age_number', type: 'number', min: 1, max: 100 },
        { key: 'speed_val', type: 'range', min: 10, max: 100 }, // should clamp to 100
        { key: 'enable_confetti', type: 'toggle' },
        { key: 'theme_choice', type: 'select', options: ['romantic', 'royal', 'playful'] },
        { key: 'unmatched_select', type: 'select', options: ['gold', 'silver'], defaultValue: 'gold' }
      ]
    };

    const result = Migrator.migrate({
      canonicalData: canonical,
      targetSchema
    });

    assert.strictEqual(result.projectedData.age_number, 28, 'Number converted from string');
    assert.strictEqual(result.projectedData.speed_val, 100, 'Range clamped to max 100');
    assert.strictEqual(result.projectedData.enable_confetti, true, 'String "yes" converted to boolean true');
    assert.strictEqual(result.projectedData.theme_choice, 'royal', 'Valid select option preserved');
    assert.strictEqual(result.projectedData.unmatched_select, 'gold', 'Default option used for uninitialized select');
  });

  it('TEST 4: Media Migration & Graceful Clamping (Multi-photo to Single Photo)', () => {
    const env = setupEnvironment();
    const Migrator = env.WishMagicStateMigrator;

    const canonical = Migrator.createCanonicalData({
      photos: [
        { id: '1', url: 'https://example.com/p1.jpg' },
        { id: '2', url: 'https://example.com/p2.jpg' },
        { id: '3', url: 'https://example.com/p3.jpg' },
        { id: '4', url: 'https://example.com/p4.jpg' },
        { id: '5', url: 'https://example.com/p5.jpg' }
      ]
    });

    // Target Template with single photo capability
    const targetSchemaSingle = {
      fields: [{ key: 'cover_photo', type: 'image' }],
      media: {
        capabilities: { images: true, maxPhotos: 1 }
      }
    };

    const result = Migrator.migrate({
      canonicalData: canonical,
      targetSchema: targetSchemaSingle
    });

    assert.strictEqual(result.projectedData.media.photos.length, 1, 'Projected photos clamped to 1');
    assert.strictEqual(result.projectedData.media.photos[0].url, 'https://example.com/p1.jpg');
    assert.strictEqual(canonical.media.photos.length, 5, 'Canonical store preserved all 5 photos intact');
    assert.ok(result.diff.adapted.some(a => a.key === 'photos'), 'Adapted notice recorded for photo clamping');
  });

  it('TEST 5: Unsupported Capabilities Handling (Voice note retained in draft, disabled in projection)', () => {
    const env = setupEnvironment();
    const Migrator = env.WishMagicStateMigrator;

    const canonical = Migrator.createCanonicalData({
      media: {
        voiceNote: {
          enabled: true,
          src: 'https://example.com/voice.mp3',
          duration: 45
        },
        music: {
          enabled: true,
          trackId: 'celebration-strings'
        }
      }
    });

    // Target Template with NO voice support and NO music support
    const targetSchemaNoVoice = {
      fields: [],
      media: {
        capabilities: { images: true, voice: false, audio: false }
      }
    };

    const result = Migrator.migrate({
      canonicalData: canonical,
      targetSchema: targetSchemaNoVoice
    });

    assert.strictEqual(result.projectedData.media.voiceNote.enabled, false, 'Voice note disabled in projected state');
    assert.strictEqual(result.projectedData.media.music.enabled, false, 'Music disabled in projected state');
    assert.strictEqual(canonical.media.voiceNote.enabled, true, 'Voice note remains enabled in canonical store');
    assert.strictEqual(canonical.media.voiceNote.src, 'https://example.com/voice.mp3', 'Voice src preserved in canonical store');
    assert.ok(result.diff.unsupported.some(u => u.key === 'voiceNote'), 'Voice note recorded in unsupported diff');
  });

  it('TEST 6: Section State Migration & Default Initialization', () => {
    const env = setupEnvironment();
    const Migrator = env.WishMagicStateMigrator;

    const canonical = Migrator.createCanonicalData({
      sections: [
        { id: 'hero', name: 'Hero Banner', enabled: true, order: 0 },
        { id: 'letter', name: 'Love Letter', enabled: false, order: 1 },
        { id: 'timeline', name: 'Story Timeline', enabled: true, order: 2 }
      ]
    });

    // Target Template with 'hero', 'letter', and a new section 'gift_box', but NO 'timeline'
    const targetSchema = {
      sections: [
        { id: 'hero', name: 'Welcome Hero', defaultEnabled: true },
        { id: 'letter', name: 'Dedication Note', defaultEnabled: true },
        { id: 'gift_box', name: 'Interactive Gift Box', defaultEnabled: true }
      ]
    };

    const result = Migrator.migrate({
      canonicalData: canonical,
      targetSchema
    });

    const projHero = result.projectedData.sections.find(s => s.id === 'hero');
    const projLetter = result.projectedData.sections.find(s => s.id === 'letter');
    const projGiftBox = result.projectedData.sections.find(s => s.id === 'gift_box');
    const projTimeline = result.projectedData.sections.find(s => s.id === 'timeline');

    assert.strictEqual(projHero.enabled, true, 'Hero preserved enabled');
    assert.strictEqual(projLetter.enabled, false, 'Letter preserved disabled from user state');
    assert.strictEqual(projGiftBox.enabled, true, 'New section gift_box initialized with defaultEnabled true');
    assert.strictEqual(projTimeline, undefined, 'Unsupported timeline excluded from projected template sections');
    assert.strictEqual(canonical.sections.timeline.enabled, true, 'Timeline preserved in canonical store');
  });

  it('TEST 7: Visual & Theme Palette Adaptation', () => {
    const env = setupEnvironment();
    const Migrator = env.WishMagicStateMigrator;

    const canonical = Migrator.createCanonicalData({
      visual: {
        theme: 'royal',
        palette: 'custom-neon-violet'
      }
    });

    // Target Template only supports ['gold-luxury', 'midnight-blue', 'rose-gold']
    const targetSchema = {
      theme: {
        supportedPalettes: ['gold-luxury', 'midnight-blue', 'rose-gold']
      }
    };

    const result = Migrator.migrate({
      canonicalData: canonical,
      targetSchema
    });

    assert.strictEqual(result.projectedData.visual.palette, 'gold-luxury', 'Palette adapted to target fallback');
    assert.strictEqual(canonical.visual.palette, 'custom-neon-violet', 'Canonical palette preserved');
    assert.ok(result.diff.adapted.some(a => a.key === 'palette'), 'Palette adaptation recorded in diff');
  });

  it('TEST 8: Animations & Effects Projection', () => {
    const env = setupEnvironment();
    const Migrator = env.WishMagicStateMigrator;

    const canonical = Migrator.createCanonicalData({
      animations: {
        master: true,
        particleType: 'fireworks',
        confetti: true
      }
    });

    // Target with animations disabled / unsupported
    const targetSchemaNoAnim = {
      animations: {
        supported: false
      }
    };

    const result = Migrator.migrate({
      canonicalData: canonical,
      targetSchema: targetSchemaNoAnim
    });

    assert.strictEqual(result.projectedData.animations.master, false, 'Animations master disabled for target');
    assert.strictEqual(canonical.animations.master, true, 'Canonical store preserves animation settings');
  });

  it('TEST 9: Round-Trip Integrity (Switch A -> B -> A with zero data loss)', () => {
    const env = setupEnvironment();
    const Migrator = env.WishMagicStateMigrator;

    // Template A Schema (Rich features)
    const schemaA = {
      fields: [
        { key: 'recipient_name', type: 'text' },
        { key: 'sender_name', type: 'text' },
        { key: 'custom_message', type: 'textarea' }
      ],
      media: { capabilities: { images: true, maxPhotos: 6, voice: true, audio: true } },
      sections: [{ id: 'hero' }, { id: 'letter' }, { id: 'gallery' }, { id: 'timeline' }]
    };

    // Template B Schema (Minimal features)
    const schemaB = {
      fields: [
        { key: 'to_name', type: 'text' },
        { key: 'from_name', type: 'text' },
        { key: 'letter_body', type: 'textarea' }
      ],
      media: { capabilities: { images: true, maxPhotos: 1, voice: false, audio: false } },
      sections: [{ id: 'hero' }, { id: 'letter' }]
    };

    // User edits in Template A
    let canonical = Migrator.createCanonicalData({
      recipient_name: 'Samantha',
      sender_name: 'David',
      custom_message: 'Happy Anniversary my love!',
      photos: [
        { id: '1', url: 'https://example.com/p1.jpg' },
        { id: '2', url: 'https://example.com/p2.jpg' },
        { id: '3', url: 'https://example.com/p3.jpg' },
        { id: '4', url: 'https://example.com/p4.jpg' },
        { id: '5', url: 'https://example.com/p5.jpg' },
        { id: '6', url: 'https://example.com/p6.jpg' }
      ],
      voice_note: { enabled: true, src: 'https://example.com/audio.mp3', duration: 30 },
      sections: [
        { id: 'hero', enabled: true },
        { id: 'letter', enabled: true },
        { id: 'gallery', enabled: true },
        { id: 'timeline', enabled: true }
      ]
    });

    // Step 1: Switch to Template B
    const step1 = Migrator.migrate({
      canonicalData: canonical,
      sourceSchema: schemaA,
      targetSchema: schemaB
    });

    // Verify Template B projection is properly constrained
    assert.strictEqual(step1.projectedData.to_name, 'Samantha');
    assert.strictEqual(step1.projectedData.from_name, 'David');
    assert.strictEqual(step1.projectedData.media.photos.length, 1);
    assert.strictEqual(step1.projectedData.media.voiceNote.enabled, false);

    // Step 2: Switch back to Template A
    const step2 = Migrator.migrate({
      canonicalData: step1.canonicalData,
      sourceSchema: schemaB,
      targetSchema: schemaA
    });

    // Verify Template A has restored 100% of the original data!
    assert.strictEqual(step2.projectedData.recipient_name, 'Samantha');
    assert.strictEqual(step2.projectedData.sender_name, 'David');
    assert.strictEqual(step2.projectedData.custom_message, 'Happy Anniversary my love!');
    assert.strictEqual(step2.projectedData.media.photos.length, 6, 'All 6 photos restored');
    assert.strictEqual(step2.projectedData.media.voiceNote.enabled, true, 'Voice note re-enabled');
    assert.strictEqual(step2.projectedData.media.voiceNote.src, 'https://example.com/audio.mp3', 'Voice src restored');
    const restoredTimeline = step2.projectedData.sections.find(s => s.id === 'timeline');
    assert.ok(restoredTimeline, 'Timeline section restored');
    assert.strictEqual(restoredTimeline.enabled, true);
  });

  it('TEST 10: Generic Architecture Verification (No hardcoded template IDs)', () => {
    const code = fs.readFileSync(path.resolve('./public/js/wishmagic-state-migrator.js'), 'utf8');

    // Ensure no hardcoded specific template IDs in state migrator
    const bannedPatterns = [
      /templateId\s*===/i,
      /template\s*===\s*["']birthday/i,
      /tpl_glitter_birthday/i,
      /romantic-template/i,
      /birthday-01/i
    ];

    bannedPatterns.forEach(pattern => {
      assert.ok(!pattern.test(code), `Banned hardcoded pattern found in state migrator: ${pattern}`);
    });
  });

  it('TEST 11: Migration Diff & User Summary Generation', () => {
    const env = setupEnvironment();
    const Migrator = env.WishMagicStateMigrator;

    const diff = {
      preserved: [{ key: 'recipient_name' }, { key: 'sender_name' }],
      adapted: [{ key: 'photos', reason: 'Clamped to 1 photo' }],
      unsupported: [{ key: 'voiceNote' }],
      initialized: [{ key: 'badge_color' }]
    };

    const summary = Migrator.getMigrationSummary(diff);

    assert.strictEqual(summary.preservedCount, 2);
    assert.strictEqual(summary.adaptedCount, 1);
    assert.strictEqual(summary.unsupportedCount, 1);
    assert.strictEqual(summary.initializedCount, 1);
    assert.ok(summary.text.includes('Restored 2 compatible fields'));
    assert.ok(summary.text.includes('Clamped to 1 photo'));
    assert.ok(summary.text.includes('voiceNote'));
  });

  it('TEST 12: Template Switcher Orchestrator Lifecycle & History Tracking', async () => {
    const env = setupEnvironment();
    const Switcher = env.WishMagicTemplateSwitcher;

    assert.ok(Switcher, 'WishMagicTemplateSwitcher is exported');
    assert.strictEqual(typeof Switcher.switchTemplate, 'function');

    const progressSteps = [];

    const result = await Switcher.switchTemplate({
      fromTemplateId: 'template_alpha',
      toTemplateId: 'template_beta',
      toSchema: {
        fields: [{ key: 'celebrant', type: 'text' }]
      },
      currentData: {
        recipient_name: 'Elena',
        sender_name: 'Stefan'
      },
      onProgress: (p) => progressSteps.push(p.stage)
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.toTemplateId, 'template_beta');
    assert.strictEqual(result.projectedData.celebrant, 'Elena');
    assert.ok(progressSteps.includes('migrating_state'));
    assert.ok(progressSteps.includes('complete'));

    const history = Switcher.getSwitchHistory();
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].fromTemplateId, 'template_alpha');
    assert.strictEqual(history[0].toTemplateId, 'template_beta');
  });

  it('TEST 13: Capability Comparison Utility', () => {
    const env = setupEnvironment();
    const Migrator = env.WishMagicStateMigrator;

    const schemaA = {
      fields: [{ key: 'name' }, { key: 'message' }],
      media: { capabilities: { images: true, maxPhotos: 5, voice: true } }
    };

    const schemaB = {
      fields: [{ key: 'name' }, { key: 'extra_info' }],
      media: { capabilities: { images: true, maxPhotos: 1, voice: false } }
    };

    const comparison = Migrator.compareCapabilities(schemaA, schemaB);

    assert.deepStrictEqual([...comparison.sharedFields], ['name']);
    assert.deepStrictEqual([...comparison.droppedFields], ['message']);
    assert.deepStrictEqual([...comparison.addedFields], ['extra_info']);
    assert.strictEqual(comparison.mediaDiff.photos.from, 5);
    assert.strictEqual(comparison.mediaDiff.photos.to, 1);
    assert.strictEqual(comparison.mediaDiff.voice.from, true);
    assert.strictEqual(comparison.mediaDiff.voice.to, false);
    assert.strictEqual(comparison.isFullyCompatible, false);
  });
});
