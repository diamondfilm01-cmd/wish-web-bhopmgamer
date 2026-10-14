/**
 * WishMagic Automated Test Suite (Part 31)
 * =========================================================================
 * Enterprise-Grade Notification & Communication System
 * Tests: In-App Center + Transactional Email + Delivery Queue + Retry Policy
 * + Scheduled Reminders + User Preferences + Announcements + Security Invariants
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  JOB_STATUS,
  ANNOUNCEMENT_STATUS,
  ANNOUNCEMENT_AUDIENCE,
  DEFAULT_NOTIFICATION_PREFERENCES,
  ERROR_CODES,
  escapeHtml,
  isValidEmail,
  getNowIST,
  formatISTDate,
  sanitizeNotificationPreferences,
  evaluateNotificationEligibility,
  renderWishPublishedEmail,
  renderUpcomingWishReminderEmail,
  renderWishExpiringEmail,
  renderAccountSecurityEmail,
  renderAnnouncementEmail,
  BaseEmailProvider,
  ResendEmailProvider,
  MockEmailProvider,
  UnconfiguredEmailProvider,
  resolveEmailProvider,
  createInAppNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  calculateUnreadCount,
  createDeliveryJob,
  calculateBackoffRetryMs,
  claimEligibleJobs,
  recoverStaleClaimedJobs,
  executeDeliveryJob,
  handleWishPublishedEvent,
  evaluateScheduledRemindersForWish,
  createAnnouncementDraft,
  publishAnnouncement
} from '../src/notification-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('WishMagic Part 31: Enterprise Notification & Communication System Suite', async (t) => {

  // --------------------------------------------------------------------------
  // TEST 1: Migration 0016 Schema & Additive D1 Integrity
  // --------------------------------------------------------------------------
  await t.test('TEST 1: Migration 0016 Schema & Additive D1 Integrity', () => {
    const migPath = path.join(ROOT_DIR, 'migrations', '0016_part31_enterprise_notifications.sql');
    assert.ok(fs.existsSync(migPath), '0016_part31_enterprise_notifications.sql must exist');

    const sql = fs.readFileSync(migPath, 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS notification_delivery_jobs/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS notification_delivery_attempts/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS notification_scheduled_reminders/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS enterprise_announcements/i);
    assert.match(sql, /c08b683b-eb07-4639-ab33-fb1139bfb295/, 'Must reference authoritative production D1 database UUID');
    assert.match(sql, /idempotency_key TEXT UNIQUE/i);
    assert.match(sql, /dedup_key TEXT UNIQUE/i);
  });

  // --------------------------------------------------------------------------
  // TEST 2: In-App Notifications — Creation, User Isolation & Unread Counts
  // --------------------------------------------------------------------------
  await t.test('TEST 2: In-App Notifications — Creation, User Isolation & Unread Counts', () => {
    const notif1 = createInAppNotification({
      userId: 'usr_alice_1',
      title: 'Celebration Published',
      message: 'Your wish is live',
      type: NOTIFICATION_TYPES.WISH_PUBLISHED
    });

    const notif2 = createInAppNotification({
      userId: 'usr_bob_2',
      title: 'Upcoming Reminder',
      message: 'Event is tomorrow',
      type: NOTIFICATION_TYPES.UPCOMING_WISH_REMINDER
    });

    assert.equal(notif1.userId, 'usr_alice_1');
    assert.equal(notif1.readAt, null);
    assert.equal(notif2.userId, 'usr_bob_2');

    const list = [notif1, notif2];
    assert.equal(calculateUnreadCount({ notifications: list, userId: 'usr_alice_1' }), 1);
    assert.equal(calculateUnreadCount({ notifications: list, userId: 'usr_bob_2' }), 1);
    assert.equal(calculateUnreadCount({ notifications: list, userId: 'usr_unknown' }), 0);
  });

  // --------------------------------------------------------------------------
  // TEST 3: In-App Notifications — Idempotent Read State & IDOR Ownership Protection
  // --------------------------------------------------------------------------
  await t.test('TEST 3: In-App Notifications — Idempotent Read State & IDOR Ownership Protection', () => {
    const notif = createInAppNotification({
      userId: 'usr_alice_1',
      title: 'System Notice',
      message: 'Welcome'
    });

    // Valid owner marks as read
    markNotificationAsRead({ notification: notif, actorId: 'usr_alice_1' });
    assert.ok(notif.readAt !== null, 'readAt must be set');
    const firstReadAt = notif.readAt;

    // Repeated read operation is idempotent
    markNotificationAsRead({ notification: notif, actorId: 'usr_alice_1' });
    assert.ok(notif.readAt !== null);

    // Another user tries to mark Alice's notification as read -> IDOR Protection throws
    assert.throws(() => {
      markNotificationAsRead({ notification: notif, actorId: 'usr_hacker_evil' });
    }, /Cannot modify another user notification/);
  });

  // --------------------------------------------------------------------------
  // TEST 4: User Notification Preferences & Mandatory Security Invariant
  // --------------------------------------------------------------------------
  await t.test('TEST 4: User Notification Preferences & Mandatory Security Invariant', () => {
    // User who disabled all optional emails
    const customPrefs = {
      inApp: false,
      transactionalEmail: false,
      upcomingWishReminders: false,
      expiryReminders: false,
      adminAnnouncements: false
    };

    // Optional wish reminder email -> Blocked
    const reminderCheck = evaluateNotificationEligibility({
      preferences: customPrefs,
      channel: NOTIFICATION_CHANNELS.EMAIL,
      notificationType: NOTIFICATION_TYPES.UPCOMING_WISH_REMINDER
    });
    assert.equal(reminderCheck.eligible, false);

    // CRITICAL INVARIANT: Mandatory security alert CANNOT be disabled by user preferences
    const securityCheck = evaluateNotificationEligibility({
      preferences: customPrefs,
      channel: NOTIFICATION_CHANNELS.EMAIL,
      notificationType: NOTIFICATION_TYPES.ACCOUNT_SECURITY
    });
    assert.equal(securityCheck.eligible, true, 'Security notices must NEVER be opted out of');
    assert.equal(securityCheck.reason, 'MANDATORY_SECURITY_NOTICE');

    const inAppSecurityCheck = evaluateNotificationEligibility({
      preferences: customPrefs,
      channel: NOTIFICATION_CHANNELS.IN_APP,
      notificationType: NOTIFICATION_TYPES.ACCOUNT_SECURITY
    });
    assert.equal(inAppSecurityCheck.eligible, true);
  });

  // --------------------------------------------------------------------------
  // TEST 5: Business Event Integration — Wish Publication Workflow
  // --------------------------------------------------------------------------
  await t.test('TEST 5: Business Event Integration — Wish Publication Workflow', () => {
    const publishedWish = {
      id: 'w_pub_123',
      slug: 'happy-birthday-sam',
      recipientName: 'Sam',
      status: 'published'
    };
    const creator = { id: 'usr_creator_1', displayName: 'Jane', email: 'jane@example.com' };

    const { inAppNotification, emailJob, emailContent } = handleWishPublishedEvent({
      wish: publishedWish,
      ownerUser: creator,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES
    });

    assert.ok(inAppNotification, 'In-app notification must be generated');
    assert.equal(inAppNotification.userId, 'usr_creator_1');
    assert.match(inAppNotification.title, /Sam/);

    assert.ok(emailJob, 'Email delivery job must be enqueued');
    assert.equal(emailJob.recipientEmail, 'jane@example.com');
    assert.equal(emailJob.status, JOB_STATUS.PENDING);
    assert.equal(emailJob.idempotencyKey, 'publish_w_pub_123_usr_creator_1');

    assert.ok(emailContent, 'Email template must be rendered');
    assert.match(emailContent.html, /happy-birthday-sam/);

    // Invariant: Draft / Unpublished wish MUST NOT generate publication notification
    const draftWish = { id: 'w_draft_999', status: 'draft' };
    assert.throws(() => {
      handleWishPublishedEvent({ wish: draftWish, ownerUser: creator, preferences: DEFAULT_NOTIFICATION_PREFERENCES });
    }, /Cannot send publication notification for unpublished wish/);
  });

  // --------------------------------------------------------------------------
  // TEST 6: Scheduled Reminders Engine — IST Boundaries & Deduplication
  // --------------------------------------------------------------------------
  await t.test('TEST 6: Scheduled Reminders Engine — IST Boundaries & Deduplication', () => {
    const nowIST = getNowIST();
    const todayIST = formatISTDate(nowIST);

    // Wish scheduled for today in IST
    const wishToday = {
      id: 'w_remind_today',
      status: 'published',
      recipientName: 'Aarav',
      eventDate: todayIST,
      slug: 'aarav-birthday'
    };
    const owner = { id: 'usr_owner_10', email: 'owner@example.com' };

    const existingKeys = new Set();
    const reminders = evaluateScheduledRemindersForWish({
      wish: wishToday,
      ownerUser: owner,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      existingReminderKeys: existingKeys,
      nowIST
    });

    assert.equal(reminders.length, 1);
    assert.equal(reminders[0].type, NOTIFICATION_TYPES.UPCOMING_WISH_REMINDER);
    assert.match(reminders[0].dedupKey, /remind_w_remind_today_upcoming_24h/);

    // If key already registered, deduplication ensures 0 duplicate reminders
    existingKeys.add(reminders[0].dedupKey);
    const repeated = evaluateScheduledRemindersForWish({
      wish: wishToday,
      ownerUser: owner,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      existingReminderKeys: existingKeys,
      nowIST
    });
    assert.equal(repeated.length, 0, 'Must not generate duplicate reminder');
  });

  // --------------------------------------------------------------------------
  // TEST 7: Email Provider Abstraction & Error Classification
  // --------------------------------------------------------------------------
  await t.test('TEST 7: Email Provider Abstraction & Error Classification', async () => {
    // 1. Unconfigured provider behavior
    const unconfProvider = new UnconfiguredEmailProvider();
    const unconfRes = await unconfProvider.sendEmail({ to: 'user@example.com', subject: 'Test' });
    assert.equal(unconfRes.success, false);
    assert.equal(unconfRes.errorCode, ERROR_CODES.EMAIL_PROVIDER_NOT_CONFIGURED);
    assert.equal(unconfRes.retryable, false);

    // 2. Mock provider valid send
    const mockProvider = new MockEmailProvider();
    const mockRes = await mockProvider.sendEmail({ to: 'valid@example.com', subject: 'Hello' });
    assert.equal(mockRes.success, true);
    assert.equal(mockRes.status, 'ACCEPTED');
    assert.ok(mockRes.providerMessageId);

    // 3. Invalid recipient error
    const invalidRes = await mockProvider.sendEmail({ to: 'not-an-email', subject: 'Hello' });
    assert.equal(invalidRes.success, false);
    assert.equal(invalidRes.errorCode, ERROR_CODES.INVALID_RECIPIENT);
    assert.equal(invalidRes.retryable, false);

    // 4. Rate-limit simulation
    const rateLimitedProvider = new MockEmailProvider({ simulateRateLimit: true });
    const rlRes = await rateLimitedProvider.sendEmail({ to: 'valid@example.com', subject: 'Hello' });
    assert.equal(rlRes.success, false);
    assert.equal(rlRes.errorCode, 'RATE_LIMITED');
    assert.equal(rlRes.retryable, true, 'Rate limit errors must be retryable');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Delivery Queue — Atomic Claim Leases & Stale Job Recovery
  // --------------------------------------------------------------------------
  await t.test('TEST 8: Delivery Queue — Atomic Claim Leases & Stale Job Recovery', () => {
    const job1 = createDeliveryJob({ recipientUserId: 'u1', recipientEmail: 'u1@test.com', notificationType: 'TEST' });
    const job2 = createDeliveryJob({ recipientUserId: 'u2', recipientEmail: 'u2@test.com', notificationType: 'TEST' });

    const queue = [job1, job2];

    // Worker A claims 1 job
    const claimed = claimEligibleJobs({ jobs: queue, limit: 1, workerId: 'worker_A', leaseDurationMs: 60000 });
    assert.equal(claimed.length, 1);
    assert.equal(job1.status, JOB_STATUS.CLAIMED);
    assert.equal(job1.claimedBy, 'worker_A');
    assert.equal(job2.status, JOB_STATUS.PENDING);

    // Worker B tries to claim -> gets only remaining job2
    const claimedB = claimEligibleJobs({ jobs: queue, limit: 2, workerId: 'worker_B', leaseDurationMs: 60000 });
    assert.equal(claimedB.length, 1);
    assert.equal(claimedB[0].id, job2.id);

    // Simulate Worker A crash & lease expiry
    job1.claimExpiresAt = new Date(Date.now() - 1000).toISOString(); // expired 1s ago
    const recoveredCount = recoverStaleClaimedJobs({ jobs: queue });
    assert.equal(recoveredCount, 1);
    assert.equal(job1.status, JOB_STATUS.RETRY_PENDING);
    assert.equal(job1.claimedBy, null);
  });

  // --------------------------------------------------------------------------
  // TEST 9: Delivery Queue — Execution, Exponential Backoff & Terminal Failures
  // --------------------------------------------------------------------------
  await t.test('TEST 9: Delivery Queue — Execution, Exponential Backoff & Terminal Failures', async () => {
    const mockSuccess = new MockEmailProvider();
    const jobSuccess = createDeliveryJob({ recipientUserId: 'u1', recipientEmail: 'u1@test.com', notificationType: 'TEST' });

    const { job: completedJob, attempt: successAttempt } = await executeDeliveryJob({
      job: jobSuccess,
      emailProvider: mockSuccess
    });
    assert.equal(completedJob.status, JOB_STATUS.SENT);
    assert.equal(completedJob.attemptCount, 1);
    assert.equal(successAttempt.status, 'ACCEPTED');

    // Transient failure with retry backoff
    const mockTransient = new MockEmailProvider({ simulateTransient: true });
    const jobRetry = createDeliveryJob({ recipientUserId: 'u2', recipientEmail: 'u2@test.com', notificationType: 'TEST', maxAttempts: 3 });

    const { job: retriedJob, attempt: retryAttempt } = await executeDeliveryJob({
      job: jobRetry,
      emailProvider: mockTransient
    });
    assert.equal(retriedJob.status, JOB_STATUS.RETRY_PENDING);
    assert.equal(retriedJob.attemptCount, 1);
    assert.ok(retriedJob.nextEligibleRetryAt);
    assert.equal(retryAttempt.status, 'FAILED');

    // Exponential backoff check
    assert.equal(calculateBackoffRetryMs(1), 1 * 60 * 1000);
    assert.equal(calculateBackoffRetryMs(2), 5 * 60 * 1000);
    assert.equal(calculateBackoffRetryMs(3), 30 * 60 * 1000);

    // Reaching max attempts causes terminal failure
    retriedJob.attemptCount = 2; // will become 3
    const { job: finalJob } = await executeDeliveryJob({
      job: retriedJob,
      emailProvider: mockTransient
    });
    assert.equal(finalJob.status, JOB_STATUS.FAILED);
  });

  // --------------------------------------------------------------------------
  // TEST 10: Enterprise Announcements — Draft, Audience Targeting & Fanout
  // --------------------------------------------------------------------------
  await t.test('TEST 10: Enterprise Announcements — Draft, Audience Targeting & Fanout', () => {
    const adminUser = { id: 'usr_admin_1', displayName: 'Admin' };
    const draft = createAnnouncementDraft({
      internalTitle: 'Diwali Special Launch',
      title: '✨ Diwali Celebrations Live!',
      message: 'New interactive animated themes ready',
      channels: [NOTIFICATION_CHANNELS.IN_APP, NOTIFICATION_CHANNELS.EMAIL],
      targetAudience: ANNOUNCEMENT_AUDIENCE.VIP_ONLY,
      creatorUser: adminUser
    });

    assert.equal(draft.status, ANNOUNCEMENT_STATUS.DRAFT);
    assert.equal(draft.totalRecipients, 0);

    const mockUsers = [
      { id: 'u_vip_1', displayName: 'VIP User', email: 'vip@test.com', plan: 'VIP', status: 'active' },
      { id: 'u_free_2', displayName: 'Free User', email: 'free@test.com', plan: 'Free', status: 'active' },
      { id: 'u_banned_3', displayName: 'Banned', email: 'banned@test.com', plan: 'VIP', status: 'banned' }
    ];

    const { announcement, generatedInApp, generatedJobs, auditLog } = publishAnnouncement({
      announcement: draft,
      allUsers: mockUsers,
      actorUser: adminUser
    });

    assert.equal(announcement.status, ANNOUNCEMENT_STATUS.PUBLISHED);
    assert.equal(announcement.totalRecipients, 1, 'Only active VIP user should be targeted');
    assert.equal(generatedInApp.length, 1);
    assert.equal(generatedJobs.length, 1);
    assert.equal(generatedJobs[0].recipientEmail, 'vip@test.com');
    assert.ok(auditLog, 'Structured audit log must be emitted');

    // Repeated publication is blocked
    assert.throws(() => {
      publishAnnouncement({ announcement, allUsers: mockUsers, actorUser: adminUser });
    }, /Announcement is already published/);
  });

  // --------------------------------------------------------------------------
  // TEST 11: Security & HTML Injection Protection
  // --------------------------------------------------------------------------
  await t.test('TEST 11: Security & HTML Injection Protection', () => {
    const maliciousInput = '<script>alert("pwned")</script>&"\'';
    const escaped = escapeHtml(maliciousInput);
    assert.doesNotMatch(escaped, /<script>/);
    assert.match(escaped, /&lt;script&gt;/);
    assert.match(escaped, /&amp;/);
    assert.match(escaped, /&quot;/);

    // Email templates escape dynamic values
    const emailTpl = renderWishPublishedEmail({
      recipientName: '<img src=x onerror=alert(1)>',
      buyerName: '<b>Attacker</b>',
      slug: 'safe-slug'
    });
    assert.doesNotMatch(emailTpl.html, /<img src=x/);
    assert.match(emailTpl.html, /&lt;img src=x/);
    assert.doesNotMatch(emailTpl.html, /<b>Attacker<\/b>/);
  });

});
