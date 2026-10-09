/**
 * WishMagic Complete Account, Privacy, Security & Data Management Tests (Part 35)
 * ==============================================================================
 * Comprehensive test suite validating:
 * 1. Migration 0020 Schema & Additive D1 Database Integrity
 * 2. Device Parsing, User Agent Classification & IP Masking
 * 3. User Profile Validation & Sanitization (XSS Defense)
 * 4. Privacy Controls & Consent Normalization (GDPR/DPDP)
 * 5. Active Session Formatting & Multi-Device Security
 * 6. User Security Audit Event Recording & Device Telemetry
 * 7. Personal Data Portability & Archive Export (GDPR Article 20)
 * 8. Account Deletion Workflow & "DELETE MY ACCOUNT" Phrase Enforcement
 * 9. Statutory Financial Record Retention Invariant
 * 10. Published Wishes Preservation & Template Asset Safety
 * 11. Grace Period Reactivation & Cancellation Lifecycle
 * 12. Admin Security Controls & Emergency Session Killswitch
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRIVACY_VISIBILITY,
  DEFAULT_PRIVACY_SETTINGS,
  SECURITY_EVENT_TYPES,
  EXPORT_STATUS,
  DELETION_STATUS,
  DELETION_CONFIRMATION_PHRASE,
  DELETION_GRACE_PERIOD_DAYS,
  parseUserAgent,
  maskIpAddress,
  validateProfileUpdate,
  validatePrivacySettings,
  formatSessionForUser,
  createSecurityEventRecord,
  compileUserDataExport,
  processAccountDeletionRequest,
  restoreDeactivatedAccount
} from '../src/account-privacy-engine.js';

import {
  createAuditLogEntry,
  isAuthoritativeAdmin
} from '../src/admin-operations-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('WishMagic Part 35: User Account Center, Privacy & Session Security Suite', async (t) => {

  // --------------------------------------------------------------------------
  // TEST 1: Migration 0020 Schema & Additive D1 Integrity
  // --------------------------------------------------------------------------
  await t.test('TEST 1: Migration 0020 Schema & Additive D1 Integrity', () => {
    const migPath = path.join(ROOT_DIR, 'migrations', '0020_part35_account_privacy_security_management.sql');
    assert.equal(fs.existsSync(migPath), true, 'Migration 0020 file must exist');

    const sql = fs.readFileSync(migPath, 'utf8');
    assert.match(sql, /c08b683b-eb07-4639-ab33-fb1139bfb295/, 'Must reference authoritative production D1 UUID');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS user_privacy_settings/, 'Must create user_privacy_settings table');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS user_security_events/, 'Must create user_security_events table');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS user_data_exports/, 'Must create user_data_exports table');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS account_deletion_requests/, 'Must create account_deletion_requests table');
    assert.match(sql, /mig_0020/, 'Must register mig_0020 in _migrations');

    // D1 setup script must also contain Part 35 migration
    const d1Sql = fs.readFileSync(path.join(ROOT_DIR, 'd1_setup.sql'), 'utf8');
    assert.match(d1Sql, /0020_part35_account_privacy_security_management\.sql/, 'd1_setup.sql must be synchronized with Part 35');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Device Parsing, User Agent Classification & IP Masking
  // --------------------------------------------------------------------------
  await t.test('TEST 2: Device Parsing, User Agent Classification & IP Masking', () => {
    const desktopUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const parsedDesktop = parseUserAgent(desktopUa);
    assert.equal(parsedDesktop.browser, 'Google Chrome');
    assert.equal(parsedDesktop.os, 'Windows 10/11');
    assert.equal(parsedDesktop.device, 'Desktop');

    const mobileUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const parsedMobile = parseUserAgent(mobileUa);
    assert.equal(parsedMobile.browser, 'Apple Safari');
    assert.equal(parsedMobile.os, 'iOS (iPhone)');
    assert.equal(parsedMobile.device, 'Mobile');

    // Masking IPv4
    assert.equal(maskIpAddress('192.168.1.105'), '192.168.***.***');
    assert.equal(maskIpAddress('49.37.152.20'), '49.37.***.***');

    // Masking IPv6
    assert.equal(maskIpAddress('2405:201:6803:9021:1234:5678:9abc:def0'), '2405:201:****:****');

    // Fallbacks
    assert.equal(maskIpAddress(null), 'Protected IP');
    assert.equal(maskIpAddress(''), 'Protected IP');
  });

  // --------------------------------------------------------------------------
  // TEST 3: User Profile Validation & Sanitization (XSS Defense)
  // --------------------------------------------------------------------------
  await t.test('TEST 3: User Profile Validation & Sanitization (XSS Defense)', () => {
    // Valid update
    const validRes = validateProfileUpdate({
      displayName: 'Aarav Patel',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb',
      bio: 'Creating birthday magic for family!',
      phone: '+919876543210'
    });
    assert.equal(validRes.valid, true);
    assert.equal(validRes.cleaned.displayName, 'Aarav Patel');
    assert.equal(validRes.cleaned.phone, '+919876543210');

    // XSS injection sanitization
    const xssRes = validateProfileUpdate({
      displayName: '<script>alert("hacked")</script>Ankit',
      bio: '<b>Bold Note</b> <img src=x onerror=alert(1)>'
    });
    assert.equal(xssRes.valid, true);
    assert.ok(!xssRes.cleaned.displayName.includes('<script>'), 'Must escape script tags');
    assert.ok(xssRes.cleaned.displayName.includes('&lt;script&gt;'), 'Must HTML entity encode tags');

    // Too short name
    const shortRes = validateProfileUpdate({ displayName: 'A' });
    assert.equal(shortRes.valid, false);
    assert.ok(shortRes.errors.displayName);

    // Invalid avatar protocol (must be http/https)
    const badAvatar = validateProfileUpdate({ avatarUrl: 'javascript:alert(1)' });
    assert.equal(badAvatar.valid, false);
    assert.ok(badAvatar.errors.avatarUrl);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Privacy Controls & Consent Normalization (GDPR/DPDP)
  // --------------------------------------------------------------------------
  await t.test('TEST 4: Privacy Controls & Consent Normalization (GDPR/DPDP)', () => {
    // Defaults check
    assert.equal(DEFAULT_PRIVACY_SETTINGS.profileVisibility, 'public');
    assert.equal(DEFAULT_PRIVACY_SETTINGS.searchEngineIndexing, true);
    assert.equal(DEFAULT_PRIVACY_SETTINGS.analyticsTracking, true);
    assert.equal(DEFAULT_PRIVACY_SETTINGS.marketingEmails, false);

    // Normalization with custom settings
    const custom = validatePrivacySettings({
      profileVisibility: 'UNLISTED',
      searchEngineIndexing: false,
      analyticsTracking: false,
      marketingEmails: true
    });

    assert.equal(custom.profileVisibility, 'unlisted');
    assert.equal(custom.searchEngineIndexing, false);
    assert.equal(custom.analyticsTracking, false);
    assert.equal(custom.marketingEmails, true);

    // Invalid visibility defaults to public
    const badVis = validatePrivacySettings({ profileVisibility: 'forbidden_secret' });
    assert.equal(badVis.profileVisibility, 'public');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Active Session Formatting & Multi-Device Security
  // --------------------------------------------------------------------------
  await t.test('TEST 5: Active Session Formatting & Multi-Device Security', () => {
    const rawSession1 = {
      id: 'sess_123',
      token: 'tok_current_user_abc',
      user_id: 'usr_priya_202',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      ip_address: '103.21.244.2',
      created_at: '2026-10-09T00:00:00.000Z',
      expires_at: Date.now() + 1000000
    };

    const rawSession2 = {
      id: 'sess_456',
      token: 'tok_other_device_xyz',
      user_id: 'usr_priya_202',
      user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
      ip_address: '49.37.152.20',
      created_at: '2026-10-08T12:00:00.000Z',
      expires_at: Date.now() + 1000000
    };

    const currentToken = 'tok_current_user_abc';

    const fmt1 = formatSessionForUser(rawSession1, currentToken);
    assert.equal(fmt1.id, 'sess_123');
    assert.equal(fmt1.isCurrent, true, 'Session 1 must be flagged as current device');
    assert.equal(fmt1.device.browser, 'Google Chrome');
    assert.equal(fmt1.maskedIp, '103.21.***.***');

    const fmt2 = formatSessionForUser(rawSession2, currentToken);
    assert.equal(fmt2.id, 'sess_456');
    assert.equal(fmt2.isCurrent, false, 'Session 2 must NOT be flagged as current');
    assert.equal(fmt2.device.browser, 'Apple Safari');
    assert.equal(fmt2.maskedIp, '49.37.***.***');
  });

  // --------------------------------------------------------------------------
  // TEST 6: User Security Audit Event Recording & Device Telemetry
  // --------------------------------------------------------------------------
  await t.test('TEST 6: User Security Audit Event Recording & Device Telemetry', () => {
    const evt = createSecurityEventRecord({
      userId: 'usr_priya_202',
      eventType: SECURITY_EVENT_TYPES.PROFILE_UPDATED,
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      details: { fields: ['displayName'] }
    });

    assert.ok(evt.id.startsWith('secevt_'));
    assert.equal(evt.userId, 'usr_priya_202');
    assert.equal(evt.eventType, 'PROFILE_UPDATED');
    assert.ok(evt.deviceInfo.includes('macOS'));
    assert.match(evt.detailsJson, /displayName/);
    assert.ok(evt.createdAt);
  });

  // --------------------------------------------------------------------------
  // TEST 7: Personal Data Portability & Archive Export (GDPR Article 20)
  // --------------------------------------------------------------------------
  await t.test('TEST 7: Personal Data Portability & Archive Export (GDPR Article 20)', () => {
    const mockUser = {
      id: 'usr_export_test_1',
      email: 'creator@wishmagic.live',
      displayName: 'Celebration Creator',
      role: 'creator',
      plan: 'VIP',
      isPremium: 1,
      status: 'active'
    };

    const mockWishes = [
      { id: 'w_1', slug: 'priya-happy-birthday', title: 'Happy Birthday Priya', recipientName: 'Priya', occasion: 'Birthday', status: 'published' }
    ];

    const mockOrders = [
      { id: 'ord_101', productName: 'VIP Creator Pass', amountRupees: 49, status: 'PAID', transactionId: 'pay_rzp_123' }
    ];

    const mockTickets = [
      { ticketNumber: 'TKT-2610-1001', category: 'billing', subject: 'Invoice query', status: 'resolved' }
    ];

    const exportData = compileUserDataExport({
      user: mockUser,
      wishes: mockWishes,
      orders: mockOrders,
      supportTickets: mockTickets
    });

    assert.ok(exportData.exportId.startsWith('wm_export_'));
    assert.equal(exportData.summary.wishesCount, 1);
    assert.equal(exportData.summary.ordersCount, 1);
    assert.equal(exportData.summary.supportTicketsCount, 1);

    const parsed = exportData.payload;
    assert.equal(parsed._exportMetadata.application, 'WishMagic Celebration Platform');
    assert.ok(parsed._exportMetadata.complianceNotice.includes('GDPR Article 20'));
    assert.equal(parsed.userProfile.email, 'creator@wishmagic.live');
    assert.equal(parsed.celebrationWishes[0].slug, 'priya-happy-birthday');
    assert.equal(parsed.ordersAndReceipts[0].orderId, 'ord_101');
    assert.equal(parsed.supportTickets[0].ticketNumber, 'TKT-2610-1001');

    assert.ok(exportData.fileSizeBytes > 100, 'Payload size must be calculated');
    assert.ok(exportData.expiresAt, '7-day download availability must be set');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Account Deletion Workflow & "DELETE MY ACCOUNT" Phrase Enforcement
  // --------------------------------------------------------------------------
  await t.test('TEST 8: Account Deletion Workflow & "DELETE MY ACCOUNT" Phrase Enforcement', () => {
    const user = {
      id: 'usr_delete_test_99',
      email: 'delete.me@wishmagic.live',
      displayName: 'Temporary Creator',
      status: 'active'
    };

    // Rejection of invalid confirmation phrases
    assert.throws(() => {
      processAccountDeletionRequest({
        user,
        confirmationText: 'delete'
      });
    }, /Confirmation failed/);

    assert.throws(() => {
      processAccountDeletionRequest({
        user,
        confirmationText: 'YES DELETE'
      });
    }, /Confirmation failed/);

    // Exact phrase succeeds (case-insensitive with trimming)
    const result = processAccountDeletionRequest({
      user,
      confirmationText: '  DELETE MY ACCOUNT  ',
      reason: 'No longer needed',
      wishesHandling: 'retain_grace'
    });

    assert.ok(result.requestId.startsWith('delreq_'));
    assert.equal(result.deactivatedUser.status, 'deactivated');
    assert.equal(result.deactivatedUser.displayName, 'Deactivated Creator');
    assert.equal(result.deletionRecord.status, 'DEACTIVATED');
    assert.equal(result.deletionRecord.wishesHandling, 'retain_grace');
    assert.equal(result.auditLog.action, 'ACCOUNT_DELETION_REQUESTED');
  });

  // --------------------------------------------------------------------------
  // TEST 9: Statutory Financial Record Retention Invariant
  // --------------------------------------------------------------------------
  await t.test('TEST 9: Statutory Financial Record Retention Invariant', () => {
    const user = {
      id: 'usr_fin_test_1',
      email: 'taxpayer@wishmagic.live',
      displayName: 'Priya',
      status: 'active'
    };

    const result = processAccountDeletionRequest({
      user,
      confirmationText: DELETION_CONFIRMATION_PHRASE,
      reason: 'Privacy test'
    });

    // Statutory retention flag must ALWAYS be true (1)
    assert.equal(result.deletionRecord.financialRecordsRetained, 1, 'Financial records must be preserved under statutory retention laws');
    const parsedAuditDetails = typeof result.auditLog.details === 'string' ? JSON.parse(result.auditLog.details) : result.auditLog.details;
    assert.equal(parsedAuditDetails.financialRecordsRetained, true);
    assert.match(result.message, /statutory financial compliance, purchase records are preserved/);
  });

  // --------------------------------------------------------------------------
  // TEST 10: Published Wishes Preservation & Template Asset Safety
  // --------------------------------------------------------------------------
  await t.test('TEST 10: Published Wishes Preservation & Template Asset Safety', () => {
    const user = { id: 'usr_wish_preservation', displayName: 'Rohan' };

    // Mode A: retain_grace
    const resA = processAccountDeletionRequest({
      user,
      confirmationText: DELETION_CONFIRMATION_PHRASE,
      wishesHandling: 'retain_grace'
    });
    assert.equal(resA.deletionRecord.wishesHandling, 'retain_grace');

    // Mode B: unpublish_immediately
    const resB = processAccountDeletionRequest({
      user,
      confirmationText: DELETION_CONFIRMATION_PHRASE,
      wishesHandling: 'unpublish_immediately'
    });
    assert.equal(resB.deletionRecord.wishesHandling, 'unpublish_immediately');
  });

  // --------------------------------------------------------------------------
  // TEST 11: Grace Period Reactivation & Cancellation Lifecycle
  // --------------------------------------------------------------------------
  await t.test('TEST 11: Grace Period Reactivation & Cancellation Lifecycle', () => {
    const user = {
      id: 'usr_reactivate_test',
      status: 'deactivated',
      displayName: 'Deactivated Creator'
    };

    const deletionRequest = {
      id: 'delreq_123',
      userId: user.id,
      status: DELETION_STATUS.DEACTIVATED,
      gracePeriodEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
    };

    const restored = restoreDeactivatedAccount({
      user,
      deletionRequest,
      originalName: 'Restored Rohan'
    });

    assert.equal(restored.restoredUser.status, 'active');
    assert.equal(restored.restoredUser.displayName, 'Restored Rohan');
    assert.equal(restored.deletionRequest.status, 'CANCELLED');
    assert.ok(restored.deletionRequest.cancelledAt);
    assert.match(restored.message, /successfully reactivated/);

    // If already purged permanently, restore must reject
    const purgedReq = { id: 'delreq_999', status: DELETION_STATUS.COMPLETED };
    assert.throws(() => {
      restoreDeactivatedAccount({ user, deletionRequest: purgedReq });
    }, /permanently purged/);
  });

  // --------------------------------------------------------------------------
  // TEST 12: Admin Security Controls & Emergency Session Killswitch
  // --------------------------------------------------------------------------
  await t.test('TEST 12: Admin Security Controls & Emergency Session Killswitch', () => {
    const adminUser = {
      id: 'usr_master_admin',
      email: 'ankit.babusaini@gmail.com',
      role: 'admin',
      isAdmin: true
    };

    const regularUser = {
      id: 'usr_regular_creator',
      email: 'creator@example.com',
      role: 'creator'
    };

    assert.equal(isAuthoritativeAdmin(adminUser), true);
    assert.equal(isAuthoritativeAdmin(regularUser), false);

    const auditEntry = createAuditLogEntry({
      actorId: adminUser.id,
      actorName: 'Admin',
      actorRole: 'admin',
      action: 'ADMIN_TERMINATE_USER_SESSIONS',
      targetType: 'user_account',
      targetId: regularUser.id,
      details: { terminatedCount: 3 }
    });

    assert.equal(auditEntry.action, 'ADMIN_TERMINATE_USER_SESSIONS');
    assert.equal(auditEntry.targetId, regularUser.id);
  });

});
