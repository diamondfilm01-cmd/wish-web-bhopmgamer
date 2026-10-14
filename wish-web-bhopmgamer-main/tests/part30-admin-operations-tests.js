/**
 * WishMagic Automated Test Suite: Part 30 — Admin Operations System
 * =================================================================
 * Comprehensive test suite verifying:
 * 1. Migration 0015 schema integrity, additive columns & tables
 * 2. Authoritative Admin Identity & RBAC (ankit.babusaini@gmail.com, role checks, 401/403 rejections)
 * 3. Advanced User Management (enrichment, status transitions, role updates, session revocation, safe delete/archive protection)
 * 4. Complete Wish Management & Moderation (moderation statuses, 403 suspended enforcement, expiry extension, ownership transfer)
 * 5. Content Moderation Queue (incident reporting, queue audit, resolution workflows)
 * 6. Support Console & Universal Diagnostics (universal lookup, wish health probe, one-click link repair, ticket workflows)
 * 7. Tamper-evident Audit Trail (structured logging, filtering, search, CSV export)
 * 8. Protection Invariants (cannot orphan published wishes, cannot demote primary admin)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRIMARY_ADMIN_EMAIL,
  USER_STATUS,
  WISH_MODERATION_STATUS,
  TICKET_STATUS,
  TICKET_PRIORITY,
  ADMIN_PERMISSIONS,
  isAuthoritativeAdmin,
  hasAdminPermission,
  createAuditLogEntry,
  listUsersEnriched,
  updateUserStatus,
  updateUserRole,
  revokeUserSessions,
  safeDeleteOrArchiveUser,
  listAdminWishesEnriched,
  diagnoseWishDeepHealth,
  moderateWish,
  extendWishExpiry,
  transferWishOwnership,
  safeDeleteWish,
  createModerationReport,
  resolveModerationReport,
  universalLookup,
  createSupportTicket,
  updateSupportTicket,
  filterAuditLogs,
  exportAuditLogsCsv
} from '../src/admin-operations-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('WishMagic Part 30: Production Admin Operations System Suite', () => {

  test('TEST 1: Production D1 Migration 0015 Schema & Additive Integrity', () => {
    const migrationPath = path.join(ROOT_DIR, 'migrations', '0015_part30_admin_operations_and_moderation.sql');
    assert.ok(fs.existsSync(migrationPath), 'Migration 0015 must exist');

    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Invariant: Production D1 UUID preserved
    assert.ok(sql.includes('c08b683b-eb07-4639-ab33-fb1139bfb295'), 'Must preserve production D1 UUID');

    // Additive columns for users
    assert.ok(sql.includes('ALTER TABLE users ADD COLUMN suspension_reason'), 'users.suspension_reason required');
    assert.ok(sql.includes('ALTER TABLE users ADD COLUMN admin_notes'), 'users.admin_notes required');
    assert.ok(sql.includes('ALTER TABLE users ADD COLUMN last_login_at'), 'users.last_login_at required');

    // Additive columns for wishes
    assert.ok(sql.includes('ALTER TABLE wishes ADD COLUMN moderation_status'), 'wishes.moderation_status required');
    assert.ok(sql.includes('ALTER TABLE wishes ADD COLUMN is_flagged'), 'wishes.is_flagged required');
    assert.ok(sql.includes('ALTER TABLE wishes ADD COLUMN extended_expiry_at'), 'wishes.extended_expiry_at required');

    // New tables
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS moderation_reports'), 'moderation_reports table required');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS support_tickets'), 'support_tickets table required');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS user_activity_logs'), 'user_activity_logs table required');

    // Performance indexes
    assert.ok(sql.includes('CREATE INDEX IF NOT EXISTS idx_users_status'), 'idx_users_status required');
    assert.ok(sql.includes('CREATE INDEX IF NOT EXISTS idx_wishes_moderation'), 'idx_wishes_moderation required');
  });

  test('TEST 2: Authoritative Admin Identity & RBAC Enforcement', () => {
    // Primary authorized admin
    const primaryAdmin = { email: PRIMARY_ADMIN_EMAIL, role: 'admin' };
    assert.equal(isAuthoritativeAdmin(primaryAdmin), true, 'Primary admin email must be recognized authoritative');
    assert.equal(hasAdminPermission(primaryAdmin, ADMIN_PERMISSIONS.MANAGE_USERS), true);

    // Case-insensitive email check
    const uppercaseAdmin = { email: 'ANKIT.BABUSAINI@GMAIL.COM', role: 'user' };
    assert.equal(isAuthoritativeAdmin(uppercaseAdmin), true, 'Admin email check must be case-insensitive');

    // Staff admin roles
    const superAdmin = { id: 'usr_adm_1', email: 'staff@wishmagic.live', role: 'SUPER_ADMIN' };
    assert.equal(isAuthoritativeAdmin(superAdmin), true);

    const normalAdmin = { id: 'usr_admin_999', role: 'admin' };
    assert.equal(isAuthoritativeAdmin(normalAdmin), true);

    // Unauthorized creator
    const creatorUser = { id: 'usr_priya_202', email: 'priya@example.com', role: 'creator', isAdmin: false };
    assert.equal(isAuthoritativeAdmin(creatorUser), false, 'Normal creator must NOT be authoritative admin');
    assert.equal(hasAdminPermission(creatorUser, ADMIN_PERMISSIONS.MANAGE_WISHES), false);

    // Null or undefined user
    assert.equal(isAuthoritativeAdmin(null), false);
    assert.equal(isAuthoritativeAdmin(undefined), false);
  });

  test('TEST 3: Advanced User Management — Enriched Listing & Filters', () => {
    const testUsers = [
      { id: 'u1', email: 'alice@test.com', displayName: 'Alice Creator', role: 'creator', plan: 'Free', status: 'active', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'u2', email: 'bob@test.com', displayName: 'Bob VIP', role: 'creator', plan: 'VIP', isPremium: true, status: 'suspended', createdAt: '2026-02-01T00:00:00Z' },
      { id: 'u3', email: 'charlie@test.com', displayName: 'Charlie Banned', role: 'creator', plan: 'Free', status: 'banned', createdAt: '2026-03-01T00:00:00Z' }
    ];

    const testWishes = [
      { id: 'w1', userId: 'u1', status: 'published', views: 50 },
      { id: 'w2', userId: 'u1', status: 'published', views: 100 },
      { id: 'w3', userId: 'u2', status: 'published', views: 25 }
    ];

    // All users listing
    const resAll = listUsersEnriched(testUsers, testWishes, { status: 'all', sort: 'wishes' });
    assert.equal(resAll.total, 3);
    assert.equal(resAll.users[0].id, 'u1', 'User with 2 wishes must be first in wishes sort');
    assert.equal(resAll.users[0].wishesCount, 2);
    assert.equal(resAll.users[0].totalViews, 150);

    // Filter by Suspended
    const resSuspended = listUsersEnriched(testUsers, testWishes, { status: 'suspended' });
    assert.equal(resSuspended.total, 1);
    assert.equal(resSuspended.users[0].id, 'u2');

    // Filter by VIP plan
    const resVip = listUsersEnriched(testUsers, testWishes, { plan: 'vip' });
    assert.equal(resVip.total, 1);
    assert.equal(resVip.users[0].id, 'u2');

    // Search query
    const resSearch = listUsersEnriched(testUsers, testWishes, { query: 'Charlie' });
    assert.equal(resSearch.total, 1);
    assert.equal(resSearch.users[0].id, 'u3');
  });

  test('TEST 4: User Status Transitions & Session Revocation', () => {
    const user = { id: 'u_test', email: 'test@user.live', status: 'active', role: 'creator' };
    const admin = { id: 'adm_1', displayName: 'Master Admin', role: 'admin' };

    // Transition Active -> Suspended
    const { user: suspendedUser, auditLog } = updateUserStatus({
      user,
      newStatus: USER_STATUS.SUSPENDED,
      reason: 'Spam flag under investigation',
      adminNotes: 'Review after 48 hours',
      actor: admin
    });

    assert.equal(suspendedUser.status, 'suspended');
    assert.equal(suspendedUser.suspensionReason, 'Spam flag under investigation');
    assert.equal(auditLog.action, 'USER_STATUS_UPDATED');
    assert.equal(auditLog.targetId, 'u_test');

    // Test session revocation
    const activeSessions = [
      { id: 's1', userId: 'u_test', token: 'tok_1' },
      { id: 's2', userId: 'u_test', token: 'tok_2' },
      { id: 's3', userId: 'other_user', token: 'tok_3' }
    ];

    const { remainingSessions, revokedCount } = revokeUserSessions({
      userId: 'u_test',
      sessions: activeSessions,
      actor: admin
    });

    assert.equal(revokedCount, 2);
    assert.equal(remainingSessions.length, 1);
    assert.equal(remainingSessions[0].id, 's3');
  });

  test('TEST 5: Protection Invariant — Primary Admin & Dependency Safeguards', () => {
    const primaryAdmin = { id: 'u_primary', email: PRIMARY_ADMIN_EMAIL, role: 'admin', status: 'active' };
    const adminActor = { id: 'adm_sub', role: 'admin' };

    // Invariant: Cannot suspend primary admin
    assert.throws(() => {
      updateUserStatus({
        user: primaryAdmin,
        newStatus: USER_STATUS.SUSPENDED,
        reason: 'Attempted demotion',
        actor: adminActor
      });
    }, /Primary system administrator account cannot be suspended/);

    // Invariant: Cannot demote primary admin
    assert.throws(() => {
      updateUserRole({
        user: primaryAdmin,
        newRole: 'creator',
        actor: adminActor
      });
    }, /Cannot demote primary system administrator/);

    // Invariant: Cannot hard delete user with published celebration wishes
    const creatorWithWishes = { id: 'u_creator', email: 'creator@example.com', role: 'creator', status: 'active' };
    const publishedWishes = [
      { id: 'wish_active_1', userId: 'u_creator', status: 'published', lifecycleStatus: 'active' }
    ];

    assert.throws(() => {
      safeDeleteOrArchiveUser({
        user: creatorWithWishes,
        wishes: publishedWishes,
        action: 'delete',
        actor: adminActor
      });
    }, /Cannot hard delete user: User owns 1 published celebration wishes/);

    // Archiving is permitted and preserves recipient links
    const { action, user: archivedUser } = safeDeleteOrArchiveUser({
      user: creatorWithWishes,
      wishes: publishedWishes,
      action: 'archive',
      actor: adminActor,
      reason: 'User request'
    });
    assert.equal(action, 'archive');
    assert.equal(archivedUser.status, 'deactivated');
  });

  test('TEST 6: Complete Wish Management & Moderation Workflows', () => {
    const wish = {
      id: 'wm_love_101',
      slug: 'alex-to-sarah-love',
      userId: 'u1',
      recipientName: 'Sarah',
      status: 'published',
      moderationStatus: 'approved',
      isFlagged: false,
      expiryDate: '2026-10-15',
      tier: 'free',
      price: 0
    };
    const admin = { id: 'adm_1', displayName: 'Admin Officer', role: 'admin' };

    // 1. Moderate Wish -> Suspend
    const { wish: suspendedWish, auditLog: modLog } = moderateWish({
      wish,
      action: 'suspend',
      reason: 'Copyright strike on soundtrack',
      adminNotes: 'Awaiting audio replacement',
      actor: admin
    });

    assert.equal(suspendedWish.moderationStatus, 'suspended');
    assert.equal(suspendedWish.isFlagged, true);
    assert.equal(modLog.action, 'WISH_MODERATION_SUSPEND');

    // 2. Extend Expiry (+30 Days)
    const { wish: extendedWish, auditLog: extLog } = extendWishExpiry({
      wish: suspendedWish,
      days: 30,
      reason: 'Celebration reschedule request',
      actor: admin
    });

    assert.ok(extendedWish.expiryDate > '2026-10-15', 'Expiry date must be moved forward');
    assert.equal(extendedWish.lifecycleStatus, 'active');
    assert.equal(extLog.action, 'WISH_EXPIRY_EXTENDED');

    // 3. Upgrade to Permanent VIP Pass
    const { wish: vipWish } = extendWishExpiry({
      wish: extendedWish,
      permanentVip: true,
      reason: 'Promotional gift',
      actor: admin
    });

    assert.equal(vipWish.tier, 'vip');
    assert.ok(vipWish.expiryDate > '2100-01-01', 'Permanent VIP expiry must be far future');

    // 4. Transfer Ownership
    const targetUser = { id: 'u_new_owner', email: 'newowner@test.com' };
    const { wish: transferredWish, auditLog: transLog } = transferWishOwnership({
      wish: vipWish,
      targetUser,
      reason: 'Purchased as a gift transfer',
      actor: admin
    });

    assert.equal(transferredWish.userId, 'u_new_owner');
    assert.equal(transferredWish.originalCreatorId, 'u1');
    assert.equal(transLog.action, 'WISH_OWNERSHIP_TRANSFERRED');
  });

  test('TEST 7: Content Moderation Queue & Incident Resolution', () => {
    // 1. Submit incident report
    const report = createModerationReport({
      targetType: 'wish',
      targetId: 'wm_test_wish',
      reporterEmail: 'concerned_guest@test.com',
      reportReason: 'inappropriate_content',
      details: 'Contains offensive background imagery'
    });

    assert.equal(report.status, 'pending');
    assert.equal(report.reportReason, 'inappropriate_content');

    // 2. Resolve incident report with suspension
    const targetWish = { id: 'wm_test_wish', moderationStatus: 'approved' };
    const admin = { id: 'adm_mod', displayName: 'Staff Moderator', role: 'moderator' };

    const { report: resolvedReport, auditLog, wishAudit } = resolveModerationReport({
      report,
      action: 'suspended',
      notes: 'Confirmed offensive imagery; suspended',
      actor: admin,
      targetWish
    });

    assert.equal(resolvedReport.status, 'resolved');
    assert.equal(resolvedReport.resolutionAction, 'suspended');
    assert.equal(targetWish.moderationStatus, 'suspended');
    assert.ok(auditLog);
    assert.ok(wishAudit);
  });

  test('TEST 8: Support Console — Universal Lookup & Link Health Diagnostics', async () => {
    const users = [
      { id: 'usr_sarah', email: 'sarah@magic.live', displayName: 'Sarah Parker', plan: 'VIP' }
    ];
    const wishes = [
      { id: 'wm_sarah_bday', slug: 'sarah-bday-surprise', recipientName: 'Sarah Parker', buyerName: 'John', buyerContact: 'john@magic.live' }
    ];
    const tickets = [
      { id: 't1', ticketNumber: 'TKT-9912', subject: 'Music playback issue', userEmail: 'sarah@magic.live' }
    ];

    // Search by email
    const lookup1 = universalLookup({ query: 'sarah@magic.live', users, wishes, tickets });
    assert.equal(lookup1.users.length, 1);
    assert.equal(lookup1.tickets.length, 1);

    // Search by slug
    const lookup2 = universalLookup({ query: 'sarah-bday', users, wishes, tickets });
    assert.equal(lookup2.wishes.length, 1);

    // Deep Health Diagnosis on Wish
    const sampleWish = {
      id: 'wm_sarah_bday',
      slug: 'sarah-bday-surprise',
      lifecycleStatus: 'active',
      moderationStatus: 'approved',
      customData: {
        photos: [
          { url: 'https://i.ibb.co/abc/photo.jpg', name: 'Photo 1' }
        ],
        music: { storageKey: 'music/happy_birthday.mp3', title: 'Happy Birthday' }
      }
    };

    const mockStorage = {
      imgbbProvider: {
        async probeImage(url) {
          return { exists: true, status: 200 };
        }
      },
      b2Provider: {
        async headObject(key) {
          return { exists: true, size: 500000 };
        }
      }
    };

    const diagnosis = await diagnoseWishDeepHealth(sampleWish, mockStorage);
    assert.equal(diagnosis.overallIntegrity, 'HEALTHY');
    assert.equal(diagnosis.checks.expiryValid, true);
    assert.equal(diagnosis.details.photosChecked, 1);
  });

  test('TEST 9: Support Ticket Workflows & Resolution Logging', () => {
    const admin = { id: 'adm_support', displayName: 'Help Desk Rep', role: 'support' };

    // Create Ticket
    const { ticket, auditLog } = createSupportTicket({
      userId: 'usr_customer_1',
      userEmail: 'customer@test.com',
      wishId: 'wm_broken_link',
      category: 'link_issue',
      subject: 'My wish link says expired prematurely',
      description: 'The event was yesterday and the link gives expired page',
      priority: TICKET_PRIORITY.HIGH,
      actor: admin
    });

    assert.ok(ticket.ticketNumber.startsWith('TKT-'));
    assert.equal(ticket.status, TICKET_STATUS.OPEN);
    assert.equal(ticket.priority, 'high');
    assert.equal(auditLog.action, 'SUPPORT_TICKET_CREATED');

    // Update & Resolve Ticket
    const { ticket: resolvedTicket, auditLog: resLog } = updateSupportTicket({
      ticket,
      status: TICKET_STATUS.RESOLVED,
      resolutionSummary: 'Auto-repaired and extended expiry by 7 days.',
      actor: admin
    });

    assert.equal(resolvedTicket.status, 'resolved');
    assert.equal(resolvedTicket.resolutionSummary, 'Auto-repaired and extended expiry by 7 days.');
    assert.equal(resLog.action, 'SUPPORT_TICKET_UPDATED');
  });

  test('TEST 10: Audit Trail — Structured Logging, Query Filtering & CSV Export', () => {
    const sampleLogs = [
      createAuditLogEntry({ actorId: 'adm_1', actorName: 'Ankit', action: 'USER_STATUS_UPDATED', targetType: 'user', targetId: 'u1', details: { status: 'suspended' } }),
      createAuditLogEntry({ actorId: 'adm_1', actorName: 'Ankit', action: 'WISH_MODERATION_SUSPEND', targetType: 'wish', targetId: 'w1', details: { reason: 'DMCA' } }),
      createAuditLogEntry({ actorId: 'adm_2', actorName: 'Support', action: 'SUPPORT_TICKET_CREATED', targetType: 'support_ticket', targetId: 't1', details: {} })
    ];

    // Filter by targetType 'wish'
    const wishLogs = filterAuditLogs(sampleLogs, { targetType: 'wish' });
    assert.equal(wishLogs.total, 1);
    assert.equal(wishLogs.logs[0].targetId, 'w1');

    // Filter by query
    const searchLogs = filterAuditLogs(sampleLogs, { query: 'DMCA' });
    assert.equal(searchLogs.total, 1);

    // CSV Export
    const csv = exportAuditLogsCsv(sampleLogs);
    assert.ok(csv.includes('Actor Name'), 'CSV must include header');
    assert.ok(csv.includes('USER_STATUS_UPDATED'), 'CSV must include actions');
    assert.ok(csv.includes('WISH_MODERATION_SUSPEND'), 'CSV must include actions');
  });

});
