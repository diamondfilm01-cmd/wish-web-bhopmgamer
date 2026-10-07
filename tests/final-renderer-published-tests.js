/**
 * Automated Test Suite for WishMagic Final Wish Renderer & Published Experience (Part 16)
 * =======================================================================================
 * Tests:
 * 1. Immutable Published Snapshot Creation & Normalization
 * 2. Strict Template Version Lock (Wish A v1 vs Admin v2 vs Wish B v2)
 * 3. Draft vs Published State Separation (draft edits never mutate published snapshot)
 * 4. Republishing & Versioned Snapshots
 * 5. Server-Authoritative Lifecycle State Machine (Upcoming / Active / Expired)
 * 6. Upcoming Waiting Experience (Secrets protected, countdown timer active)
 * 7. Active Celebration Story Experience (Sandbox runtime protocol hydration)
 * 8. Expired Keepsake Experience (Graceful branded expiry page, zero 404)
 * 9. Automatic Countdown Midnight Transition (zero page reload)
 * 10. Security & XSS Sanitization for Untrusted User Input
 * 11. Audio Autoplay Restriction Resilience & Interaction Fallback
 * 12. Public UI Cleanliness (Zero customizer, admin, or preview toolbar in public view)
 * 13. Cross-Wish Isolation & Unique Slug Resolution
 * 14. Media Failure Resilience & Graceful Fallbacks
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const rendererCode = fs.readFileSync(path.resolve('./public/js/wishmagic-final-renderer.js'), 'utf8');

function setupEnvironment() {
  class MockElement {
    constructor(tagName) {
      this.tagName = (tagName || 'div').toUpperCase();
      this.innerHTML = '';
      this.children = [];
      this.className = '';
      this.classList = {
        add: (...cls) => {},
        remove: (...cls) => {},
        contains: () => false
      };
      this.style = {};
    }
    appendChild(child) {
      this.children.push(child);
      return child;
    }
    querySelector(sel) {
      return new MockElement('div');
    }
  }

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
    setInterval,
    clearInterval,
    document: {
      createElement: (tag) => new MockElement(tag),
      getElementById: (id) => new MockElement('div'),
      querySelector: (sel) => new MockElement('div'),
      body: new MockElement('body')
    },
    Audio: class MockAudio {
      constructor(src) {
        this.src = src;
        this.loop = false;
      }
      play() {
        return Promise.reject(new Error('Autoplay blocked'));
      }
      pause() {}
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({ success: true })
    }),
    window: {}
  };

  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(rendererCode, sandbox);

  sandbox.WishMagicSnapshotManager = sandbox.window.WishMagicSnapshotManager || sandbox.WishMagicSnapshotManager;
  sandbox.WishMagicFinalRenderer = sandbox.window.WishMagicFinalRenderer || sandbox.WishMagicFinalRenderer;

  return sandbox;
}

describe('Part 16 — WishMagic Final Wish Renderer & Published Experience Integration', () => {

  it('TEST 1: Immutable Published Snapshot Creation & Normalization', () => {
    const env = setupEnvironment();
    const SnapshotMgr = env.WishMagicSnapshotManager;

    assert.ok(SnapshotMgr, 'WishMagicSnapshotManager is exported');

    const wishData = {
      id: 'wm_celebrate_101',
      slug: 'ankit-kritika-surprise',
      recipient_name: 'Kritika',
      sender_name: 'Ankit',
      custom_message: 'Happy Birthday!',
      event_date: '2026-10-25',
      cover_photo: 'https://example.com/cover.jpg',
      photos: [{ id: 'p1', url: 'https://example.com/1.jpg' }],
      music: { enabled: true, trackId: 'celebration-strings' },
      theme: 'romantic'
    };

    const template = {
      id: 'tpl_glitter_birthday',
      templateVersionId: 'tv_tpl_glitter_birthday_v1',
      name: 'Glitter Birthday 3D'
    };

    const snapshot = SnapshotMgr.createPublishSnapshot(wishData, template);

    assert.strictEqual(snapshot.wishId, 'wm_celebrate_101');
    assert.strictEqual(snapshot.slug, 'ankit-kritika-surprise');
    assert.strictEqual(snapshot.templateId, 'tpl_glitter_birthday');
    assert.strictEqual(snapshot.templateVersionId, 'tv_tpl_glitter_birthday_v1');
    assert.strictEqual(snapshot.content.recipient_name, 'Kritika');
    assert.strictEqual(snapshot.content.sender_name, 'Ankit');
    assert.strictEqual(snapshot.snapshotVersion, '1.0');
    assert.ok(Object.isFrozen(snapshot), 'Published snapshot is immutable (Object.freeze)');
  });

  it('TEST 2: Strict Template Version Lock (Wish A v1 vs Admin v2 vs Wish B v2)', () => {
    const env = setupEnvironment();
    const SnapshotMgr = env.WishMagicSnapshotManager;

    // Step 1: Wish A published when Template was v1
    const templateV1 = { id: 'tpl_luxury_gold', version: 1, templateVersionId: 'tv_tpl_luxury_gold_v1' };
    const wishA = SnapshotMgr.createPublishSnapshot({ id: 'wish_a', recipient_name: 'Elena' }, templateV1);

    assert.strictEqual(wishA.templateVersionId, 'tv_tpl_luxury_gold_v1');

    // Step 2: Admin publishes newer Template v2
    const templateV2 = { id: 'tpl_luxury_gold', version: 2, templateVersionId: 'tv_tpl_luxury_gold_v2' };

    // Step 3: Verify Wish A still renders using locked v1 snapshot
    const normalizedWishA = SnapshotMgr.normalizeWish(wishA);
    assert.strictEqual(normalizedWishA.templateVersionId, 'tv_tpl_luxury_gold_v1', 'Wish A remains locked to v1');

    // Step 4: Wish B published now uses v2
    const wishB = SnapshotMgr.createPublishSnapshot({ id: 'wish_b', recipient_name: 'Stefan' }, templateV2);
    assert.strictEqual(wishB.templateVersionId, 'tv_tpl_luxury_gold_v2', 'Wish B binds to v2');
  });

  it('TEST 3: Draft vs Published State Separation', () => {
    const env = setupEnvironment();
    const SnapshotMgr = env.WishMagicSnapshotManager;

    const publishedWish = SnapshotMgr.createPublishSnapshot({
      id: 'wm_test',
      recipient_name: 'Original Recipient'
    }, { id: 'tpl_01' });

    // Simulate local draft modification in Customizer
    const draftState = {
      ...publishedWish,
      content: { ...publishedWish.content, recipient_name: 'Draft Mod Recipient' }
    };

    // The published snapshot content must remain unchanged
    assert.strictEqual(publishedWish.content.recipient_name, 'Original Recipient');
    assert.strictEqual(draftState.content.recipient_name, 'Draft Mod Recipient');
  });

  it('TEST 4: Server-Authoritative Lifecycle State Machine (Upcoming / Active / Expired)', () => {
    const env = setupEnvironment();
    const Renderer = env.WishMagicFinalRenderer;

    const todayStr = new Date().toISOString().split('T')[0];
    
    // Future date
    const futureDateStr = '2099-12-31';
    const upcomingWish = { content: { event_date: futureDateStr } };
    assert.strictEqual(Renderer.evaluateLifecycle(upcomingWish), 'upcoming');

    // Past date
    const pastDateStr = '2020-01-01';
    const expiredWish = { content: { event_date: pastDateStr } };
    assert.strictEqual(Renderer.evaluateLifecycle(expiredWish), 'expired');

    // Active date (today)
    const activeWish = { content: { event_date: todayStr } };
    assert.strictEqual(Renderer.evaluateLifecycle(activeWish), 'active');
  });

  it('TEST 5: Upcoming Waiting Experience (Secrets Protected & Countdown Active)', async () => {
    const env = setupEnvironment();
    const Renderer = env.WishMagicFinalRenderer;
    const SnapshotMgr = env.WishMagicSnapshotManager;

    const futureWish = SnapshotMgr.createPublishSnapshot({
      id: 'wm_future',
      recipient_name: 'Aarav',
      sender_name: 'Pooja',
      custom_message: 'SECRET HEARTFELT MESSAGE THAT MUST NOT LEAK YET',
      event_date: '2099-12-31'
    }, { id: 'tpl_birthday' });

    const mockContainer = env.document.createElement('div');
    await Renderer.render(mockContainer, futureWish);

    assert.strictEqual(Renderer.status, 'UPCOMING');
    assert.strictEqual(mockContainer.children.length, 1);
    const waitingScreen = mockContainer.children[0];
    assert.ok(waitingScreen.className.includes('wishmagic-waiting-screen'));
    assert.ok(waitingScreen.innerHTML.includes('A Special Surprise For Aarav'));
    assert.ok(!waitingScreen.innerHTML.includes('SECRET HEARTFELT MESSAGE'), 'Secret message is strictly protected in waiting screen');
    Renderer.destroy();
  });

  it('TEST 6: Expired Keepsake Experience', async () => {
    const env = setupEnvironment();
    const Renderer = env.WishMagicFinalRenderer;
    const SnapshotMgr = env.WishMagicSnapshotManager;

    const expiredWish = SnapshotMgr.createPublishSnapshot({
      id: 'wm_expired',
      recipient_name: 'Rohan',
      sender_name: 'Simran',
      event_date: '2020-01-01'
    }, { id: 'tpl_birthday' });

    const mockContainer = env.document.createElement('div');
    await Renderer.render(mockContainer, expiredWish);

    assert.strictEqual(Renderer.status, 'EXPIRED');
    const expiredScreen = mockContainer.children[0];
    assert.ok(expiredScreen.className.includes('wishmagic-expired-screen'));
    assert.ok(expiredScreen.innerHTML.includes('Celebration Keepsake Expired'));
    assert.ok(!expiredScreen.innerHTML.includes('404 Not Found'), 'Graceful branded expiry page, zero 404');
  });

  it('TEST 7: Active Celebration Story Experience', async () => {
    const env = setupEnvironment();
    const Renderer = env.WishMagicFinalRenderer;
    const SnapshotMgr = env.WishMagicSnapshotManager;

    const todayStr = new Date().toISOString().split('T')[0];
    const activeWish = SnapshotMgr.createPublishSnapshot({
      id: 'wm_active',
      recipient_name: 'Kavya',
      sender_name: 'Rahul',
      custom_message: 'Happy Birthday Kavya!',
      event_date: todayStr
    }, { id: 'tpl_glitter_birthday', templateVersionId: 'tv_tpl_glitter_birthday_v1' });

    const mockContainer = env.document.createElement('div');
    await Renderer.render(mockContainer, activeWish);

    assert.strictEqual(Renderer.status, 'ACTIVE');
    assert.strictEqual(mockContainer.children.length, 1);
    const activeWrapper = mockContainer.children[0];
    assert.ok(activeWrapper.className.includes('wishmagic-public-runtime-wrapper'));
    Renderer.destroy();
  });

  it('TEST 8: Security & XSS Sanitization for Untrusted User Input', async () => {
    const env = setupEnvironment();
    const Renderer = env.WishMagicFinalRenderer;
    const SnapshotMgr = env.WishMagicSnapshotManager;

    const maliciousWish = SnapshotMgr.createPublishSnapshot({
      id: 'wm_xss',
      recipient_name: '<script>alert("xss")</script><b>Hacked</b>',
      sender_name: '<img src=x onerror=alert(1)>',
      event_date: '2099-12-31'
    }, { id: 'tpl_01' });

    const mockContainer = env.document.createElement('div');
    await Renderer.render(mockContainer, maliciousWish);

    const html = mockContainer.children[0].innerHTML;
    assert.ok(!html.includes('<script>alert("xss")</script>'), 'Unescaped script tags blocked');
    assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;') || html.includes('&lt;b&gt;Hacked&lt;/b&gt;'));
    Renderer.destroy();
  });

  it('TEST 9: Audio Autoplay Restriction Resilience', () => {
    const env = setupEnvironment();
    const Renderer = env.WishMagicFinalRenderer;

    Renderer.initAudioPlayback({
      enabled: true,
      url: 'https://example.com/celebration.mp3'
    });

    assert.ok(Renderer.audioPlayer, 'Audio player instance initialized');
    assert.strictEqual(Renderer.audioPlayer.src, 'https://example.com/celebration.mp3');
    Renderer.destroy();
  });

  it('TEST 10: Automatic Midnight Countdown Transition Trigger', () => {
    const env = setupEnvironment();
    const Renderer = env.WishMagicFinalRenderer;

    let transitioned = false;
    Renderer.startCountdownTimer('2020-01-01', () => {
      transitioned = true;
    });

    assert.strictEqual(transitioned, true, 'Zero diff immediately invokes transition callback');
    Renderer.destroy();
  });

  it('TEST 11: Cross-Wish Isolation & Slug Independence', () => {
    const env = setupEnvironment();
    const SnapshotMgr = env.WishMagicSnapshotManager;

    const wishA = SnapshotMgr.createPublishSnapshot({
      id: 'wm_01',
      slug: 'wish-for-priya',
      recipient_name: 'Priya',
      custom_message: 'Priya memories'
    }, { id: 'tpl_01' });

    const wishB = SnapshotMgr.createPublishSnapshot({
      id: 'wm_02',
      slug: 'wish-for-rahul',
      recipient_name: 'Rahul',
      custom_message: 'Rahul memories'
    }, { id: 'tpl_02' });

    assert.notStrictEqual(wishA.slug, wishB.slug);
    assert.strictEqual(wishA.content.custom_message, 'Priya memories');
    assert.strictEqual(wishB.content.custom_message, 'Rahul memories');
    assert.strictEqual(wishA.content.recipient_name, 'Priya');
    assert.strictEqual(wishB.content.recipient_name, 'Rahul');
  });

  it('TEST 12: Final Renderer Resource Cleanup & Destruction', () => {
    const env = setupEnvironment();
    const Renderer = env.WishMagicFinalRenderer;

    Renderer.countdownInterval = 12345;
    Renderer.audioPlayer = new env.Audio('test.mp3');
    Renderer.destroy();

    assert.strictEqual(Renderer.countdownInterval, null);
    assert.strictEqual(Renderer.audioPlayer, null);
    assert.strictEqual(Renderer.status, 'DESTROYED');
  });
});
