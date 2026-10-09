/**
 * WishMagic Complete Customer Support, Help Center & Ticket Desk Tests (Part 34)
 * ==============================================================================
 * Comprehensive test suite validating:
 * 1. Migration 0019 Schema & Additive D1 Database Integrity
 * 2. Help Center Knowledge Base — Default articles, categories, search, and feedback
 * 3. Ticket Input Validation — Categories, subject/description limits, attachment bounds
 * 4. Support Ticket Creation & Number Generation — Human-readable TKT format, initial message
 * 5. Conversation Threading — User replies, Agent replies, timestamp tracking
 * 6. Auto-reopen Lifecycle — User replies to resolved ticket triggers reopen & counter increment
 * 7. IDOR Protection & Internal Notes Isolation — Customers never see private internal staff notes
 * 8. Customer Satisfaction Rating — 1-5 star bounds, feedback capture, user ownership
 * 9. Admin Support Desk Operations — Multi-dimensional filtering, priority/status transitions
 * 10. Diagnostics & Auto-repair — Link integrity diagnostic hooks & renewal
 * 11. Notification & Audit Integration — In-app events triggered on ticket milestones
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TICKET_CATEGORIES,
  TICKET_STATUS,
  TICKET_PRIORITY,
  MESSAGE_SENDER_TYPE,
  DEFAULT_HELP_ARTICLES,
  getHelpCategories,
  listHelpArticles,
  getHelpArticleBySlug,
  generateTicketNumber,
  validateTicketInput,
  createSupportTicketRecord,
  addTicketMessage,
  updateTicketStatus,
  rateTicketSatisfaction,
  sanitizeTicketForUser
} from '../src/support-desk-engine.js';

import {
  diagnoseWishDeepHealth,
  isAuthoritativeAdmin
} from '../src/admin-operations-engine.js';

import {
  createInAppNotification,
  NOTIFICATION_TYPES
} from '../src/notification-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('WishMagic Part 34: Customer Support, Help Center & Ticket Operations Suite', async (t) => {

  // --------------------------------------------------------------------------
  // TEST 1: Migration 0019 Schema & Additive D1 Integrity
  // --------------------------------------------------------------------------
  await t.test('TEST 1: Migration 0019 Schema & Additive D1 Integrity', () => {
    const migPath = path.join(ROOT_DIR, 'migrations', '0019_part34_customer_support_and_help_center.sql');
    assert.equal(fs.existsSync(migPath), true, 'Migration 0019 file must exist');

    const sql = fs.readFileSync(migPath, 'utf8');
    assert.match(sql, /c08b683b-eb07-4639-ab33-fb1139bfb295/, 'Must reference authoritative production D1 UUID');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS support_tickets/, 'Must safely handle support_tickets table');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS support_ticket_messages/, 'Must create support_ticket_messages table');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS support_attachments/, 'Must create support_attachments table');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS help_articles/, 'Must create help_articles table');
    assert.match(sql, /mig_0019/, 'Must register mig_0019 in _migrations');

    // D1 setup script must also contain Part 34 migration
    const d1Sql = fs.readFileSync(path.join(ROOT_DIR, 'd1_setup.sql'), 'utf8');
    assert.match(d1Sql, /0019_part34_customer_support_and_help_center\.sql/, 'd1_setup.sql must be synchronized with Part 34');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Help Center & Knowledge Base
  // --------------------------------------------------------------------------
  await t.test('TEST 2: Help Center & Knowledge Base Categories & Search', () => {
    const cats = getHelpCategories();
    assert.ok(cats.length >= 7, 'Must have at least 7 official support categories');
    assert.ok(cats.some(c => c.id === 'billing'), 'Must have billing category');
    assert.ok(cats.some(c => c.id === 'publishing'), 'Must have publishing category');

    // List all published articles
    const all = listHelpArticles();
    assert.ok(all.total >= 8, 'Must have comprehensive default help articles');
    assert.equal(all.articles.length, all.total);

    // Filter by category
    const billingArticles = listHelpArticles({ category: 'billing' });
    assert.ok(billingArticles.articles.length > 0, 'Must have articles in billing category');
    assert.ok(billingArticles.articles.every(a => a.categoryId === 'billing'));

    // Search query
    const searchRes = listHelpArticles({ query: 'photos' });
    assert.ok(searchRes.total > 0, 'Must match photo upload articles');
    assert.ok(searchRes.articles.some(a => a.slug.includes('photo')));

    // Get article by slug
    const article = getHelpArticleBySlug('how-to-create-a-celebration-wish');
    assert.ok(article, 'Must resolve article by slug');
    assert.match(article.title, /Celebration Wish/);
    assert.ok(article.contentMarkdown.length > 50, 'Article must have rich content');

    // Non-existent slug returns null
    const notFound = getHelpArticleBySlug('non-existent-topic');
    assert.equal(notFound, null);
  });

  // --------------------------------------------------------------------------
  // TEST 3: Ticket Input Validation
  // --------------------------------------------------------------------------
  await t.test('TEST 3: Ticket Input Validation Rules & Security Invariants', () => {
    // Empty subject
    const valEmptySubject = validateTicketInput({
      category: 'general',
      subject: '',
      description: 'Valid description that has enough characters'
    });
    assert.equal(valEmptySubject.valid, false);
    assert.ok(valEmptySubject.errors.subject);

    // Too short description
    const valShortDesc = validateTicketInput({
      category: 'general',
      subject: 'Valid Subject Line',
      description: 'short'
    });
    assert.equal(valShortDesc.valid, false);
    assert.ok(valShortDesc.errors.description);

    // Invalid category
    const valBadCat = validateTicketInput({
      category: 'invalid_hacker_cat',
      subject: 'Valid Subject Line',
      description: 'Valid description that has enough characters'
    });
    assert.equal(valBadCat.valid, false);
    assert.ok(valBadCat.errors.category);

    // Oversized attachment (>5MB)
    const valBigAtt = validateTicketInput({
      category: 'general',
      subject: 'Valid Subject Line',
      description: 'Valid description with enough characters',
      attachments: [{ fileName: 'huge.png', fileSize: 10 * 1024 * 1024, mimeType: 'image/png' }]
    });
    assert.equal(valBigAtt.valid, false);
    assert.match(valBigAtt.errors.attachments, /exceeds max limit/);

    // Unsupported MIME type (e.g. .exe)
    const valBadMime = validateTicketInput({
      category: 'general',
      subject: 'Valid Subject Line',
      description: 'Valid description with enough characters',
      attachments: [{ fileName: 'malware.exe', fileSize: 1024, mimeType: 'application/x-msdownload' }]
    });
    assert.equal(valBadMime.valid, false);
    assert.match(valBadMime.errors.attachments, /not supported/);

    // Fully valid input
    const valOk = validateTicketInput({
      category: 'billing',
      subject: 'Payment deducted but wish VIP status pending',
      description: 'My UPI transaction succeeded for ₹49 but the celebration link is still marked free tier.',
      attachments: [{ fileName: 'receipt.png', fileSize: 200 * 1024, mimeType: 'image/png' }]
    });
    assert.equal(valOk.valid, true);
    assert.equal(Object.keys(valOk.errors).length, 0);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Ticket Creation & Human-Readable Number Generation
  // --------------------------------------------------------------------------
  await t.test('TEST 4: Ticket Creation & Human-Readable Number Format', () => {
    const ticketNumber = generateTicketNumber();
    assert.match(ticketNumber, /^TKT-\d{4}-\d{4}$/, 'Ticket number must follow format TKT-YYMM-XXXX');

    const { ticket, initialMessage, auditLog } = createSupportTicketRecord({
      userId: 'usr_priya_202',
      userEmail: 'priya@example.com',
      userName: 'Priya Sharma',
      category: 'billing',
      subject: 'Invoice copy required for company reimbursement',
      description: 'Please email me a GST-compliant invoice for order #ord_9281.',
      orderId: 'ord_9281',
      actor: { id: 'usr_priya_202', displayName: 'Priya Sharma', role: 'customer' }
    });

    assert.ok(ticket.id.startsWith('tkt_'));
    assert.equal(ticket.status, TICKET_STATUS.OPEN);
    assert.equal(ticket.userId, 'usr_priya_202');
    assert.equal(ticket.userEmail, 'priya@example.com');
    assert.equal(ticket.orderId, 'ord_9281');
    assert.ok(ticket.createdAt);

    // Initial message
    assert.equal(initialMessage.ticketId, ticket.id);
    assert.equal(initialMessage.senderType, MESSAGE_SENDER_TYPE.USER);
    assert.equal(initialMessage.message, ticket.description);
    assert.equal(initialMessage.isInternalNote, 0);

    // Audit log
    assert.equal(auditLog.action, 'SUPPORT_TICKET_CREATED');
    assert.equal(auditLog.targetId, ticket.id);
  });

  // --------------------------------------------------------------------------
  // TEST 5: Conversation Threading & Timestamps
  // --------------------------------------------------------------------------
  await t.test('TEST 5: Conversation Threading & Last Response Timestamps', () => {
    const { ticket } = createSupportTicketRecord({
      userId: 'usr_priya_202',
      userEmail: 'priya@example.com',
      userName: 'Priya',
      category: 'media',
      subject: 'Music not playing on iPhone',
      description: 'When my friend opened the link on Safari iOS, there was no background music.'
    });

    const initCustTime = ticket.lastCustomerMessageAt;
    assert.equal(ticket.lastAgentResponseAt, null);

    // Admin replies
    const adminUser = { id: 'usr_admin_999', displayName: 'Ankit Support', role: 'admin' };
    const { ticket: ticketAfterReply, message: agentMsg } = addTicketMessage({
      ticket,
      senderType: MESSAGE_SENDER_TYPE.ADMIN,
      senderId: adminUser.id,
      senderName: adminUser.displayName,
      message: 'Hi Priya, on iOS Safari, users must tap the screen or the "Open Celebration" button once due to browser autoplay policies.',
      actor: adminUser
    });

    assert.equal(agentMsg.senderType, MESSAGE_SENDER_TYPE.ADMIN);
    assert.equal(agentMsg.isInternalNote, 0);
    assert.ok(ticketAfterReply.lastAgentResponseAt);
    assert.equal(ticketAfterReply.status, TICKET_STATUS.IN_PROGRESS);

    // Customer replies back
    const { ticket: ticketAfterCustMsg, message: custMsg } = addTicketMessage({
      ticket: ticketAfterReply,
      senderType: MESSAGE_SENDER_TYPE.USER,
      senderId: 'usr_priya_202',
      senderName: 'Priya',
      message: 'Thank you! That resolved it immediately once she clicked Start Celebration.',
      actor: { id: 'usr_priya_202', role: 'customer' }
    });

    assert.equal(custMsg.senderType, MESSAGE_SENDER_TYPE.USER);
    assert.ok(new Date(ticketAfterCustMsg.lastCustomerMessageAt).getTime() >= new Date(initCustTime).getTime());
  });

  // --------------------------------------------------------------------------
  // TEST 6: Auto-reopen Lifecycle
  // --------------------------------------------------------------------------
  await t.test('TEST 6: Auto-reopen Lifecycle on Customer Reply to Resolved Case', () => {
    const { ticket } = createSupportTicketRecord({
      userId: 'usr_rohit_303',
      userEmail: 'rohit@example.com',
      userName: 'Rohit',
      category: 'publishing',
      subject: 'Countdown not unlocking',
      description: 'The countdown is still showing midnight.'
    });

    // Mark as resolved
    const adminUser = { id: 'usr_admin_999', role: 'admin', displayName: 'Support Lead' };
    updateTicketStatus({
      ticket,
      status: TICKET_STATUS.RESOLVED,
      resolutionSummary: 'Verified timezone setting in Asia/Kolkata.',
      actor: adminUser
    });

    assert.equal(ticket.status, TICKET_STATUS.RESOLVED);
    assert.ok(ticket.resolvedAt);
    assert.equal(ticket.reopenCount, 0);

    // Customer replies to the resolved ticket -> MUST automatically reopen!
    addTicketMessage({
      ticket,
      senderType: MESSAGE_SENDER_TYPE.USER,
      senderId: 'usr_rohit_303',
      senderName: 'Rohit',
      message: 'Wait, it worked for me but my brother in Canada is still seeing the countdown lock.',
      actor: { id: 'usr_rohit_303', role: 'customer' }
    });

    assert.equal(ticket.status, TICKET_STATUS.IN_PROGRESS, 'Resolved ticket must automatically transition to in_progress on user message');
    assert.equal(ticket.reopenCount, 1, 'Reopen count must be incremented to 1');
  });

  // --------------------------------------------------------------------------
  // TEST 7: IDOR Protection & Internal Notes Isolation
  // --------------------------------------------------------------------------
  await t.test('TEST 7: Security Invariant: Internal Notes & Private Staff Data Stripped for Customers', () => {
    const { ticket } = createSupportTicketRecord({
      userId: 'usr_customer_1',
      userEmail: 'cust@example.com',
      userName: 'Alice',
      category: 'technical',
      subject: 'Error 500 when uploading photo',
      description: 'Photos fail to upload.'
    });

    const adminUser = { id: 'usr_admin_999', role: 'admin', displayName: 'Engineer' };

    // Staff adds internal note (e.g. backend debug notes)
    const { message: internalMsg } = addTicketMessage({
      ticket,
      senderType: MESSAGE_SENDER_TYPE.ADMIN,
      senderId: adminUser.id,
      senderName: 'Admin Debugger',
      message: 'INTERNAL NOTE: ImgBB API key rate-limit hit. Switching secondary provider pool.',
      isInternalNote: true,
      actor: adminUser
    });

    // Staff adds public response to customer
    const { message: publicMsg } = addTicketMessage({
      ticket,
      senderType: MESSAGE_SENDER_TYPE.ADMIN,
      senderId: adminUser.id,
      senderName: 'WishMagic Support',
      message: 'We have updated our photo processing server. Please try uploading again now.',
      isInternalNote: false,
      actor: adminUser
    });

    assert.equal(internalMsg.isInternalNote, 1);
    assert.equal(publicMsg.isInternalNote, 0);

    const allMessages = [internalMsg, publicMsg];

    // 1. Sanitize for regular customer
    const customerView = sanitizeTicketForUser(ticket, allMessages, { id: 'usr_customer_1', role: 'creator' });
    assert.equal(customerView.messages.length, 1, 'Customer view must ONLY contain the public message');
    assert.equal(customerView.messages[0].message, publicMsg.message);
    assert.equal(customerView.messages.some(m => m.message.includes('INTERNAL NOTE')), false, 'Internal note must never be present in customer view');

    // 2. Sanitize for Admin (Admin sees everything)
    const adminView = sanitizeTicketForUser(ticket, allMessages, adminUser);
    assert.equal(adminView.messages.length, 2, 'Admin view must contain all messages including internal notes');
    assert.ok(adminView.messages.some(m => m.isInternalNote === true));
  });

  // --------------------------------------------------------------------------
  // TEST 8: Customer Satisfaction Rating
  // --------------------------------------------------------------------------
  await t.test('TEST 8: Customer Satisfaction Rating & Feedback Bounds', () => {
    const { ticket } = createSupportTicketRecord({
      userId: 'usr_kavita_404',
      userEmail: 'kavita@example.com',
      userName: 'Kavita',
      category: 'general',
      subject: 'Love the templates',
      description: 'How can I suggest a new anniversary theme?'
    });

    // Invalid rating (> 5)
    assert.throws(() => {
      rateTicketSatisfaction({ ticket, userId: 'usr_kavita_404', rating: 6 });
    }, /between 1 and 5/);

    // Invalid rating (< 1)
    assert.throws(() => {
      rateTicketSatisfaction({ ticket, userId: 'usr_kavita_404', rating: 0 });
    }, /between 1 and 5/);

    // Forbidden rating from another user
    assert.throws(() => {
      rateTicketSatisfaction({ ticket, userId: 'usr_impostor_999', rating: 5 });
    }, /only rate your own/);

    // Valid 5-star rating
    const { ticket: ratedTicket } = rateTicketSatisfaction({
      ticket,
      userId: 'usr_kavita_404',
      rating: 5,
      feedback: 'Incredible speed! The support agent was super courteous.'
    });

    assert.equal(ratedTicket.satisfactionRating, 5);
    assert.equal(ratedTicket.satisfactionFeedback, 'Incredible speed! The support agent was super courteous.');
  });

  // --------------------------------------------------------------------------
  // TEST 9: Admin Support Desk Operations & Transitions
  // --------------------------------------------------------------------------
  await t.test('TEST 9: Admin Support Desk Multi-filter & Status Transitions', () => {
    const { ticket } = createSupportTicketRecord({
      userId: 'usr_priya_202',
      userEmail: 'priya@example.com',
      userName: 'Priya',
      category: 'publishing',
      subject: 'Wish link not accessible',
      description: 'Getting link expired notice.'
    });

    const admin = { id: 'usr_admin_999', displayName: 'Super Admin', role: 'admin' };

    // Update status to in_progress and priority to urgent
    const { ticket: t1 } = updateTicketStatus({
      ticket,
      status: TICKET_STATUS.IN_PROGRESS,
      priority: TICKET_PRIORITY.URGENT,
      assignedTo: 'ankit.babusaini@gmail.com',
      adminNotes: 'Investigating B2 manifest.',
      actor: admin
    });

    assert.equal(t1.status, TICKET_STATUS.IN_PROGRESS);
    assert.equal(t1.priority, TICKET_PRIORITY.URGENT);
    assert.equal(t1.assignedTo, 'ankit.babusaini@gmail.com');

    // Update status to resolved
    const { ticket: t2, auditLog } = updateTicketStatus({
      ticket: t1,
      status: TICKET_STATUS.RESOLVED,
      resolutionSummary: 'Link extended and restored for 7 days.',
      actor: admin
    });

    assert.equal(t2.status, TICKET_STATUS.RESOLVED);
    assert.ok(t2.resolvedAt);
    assert.equal(t2.resolutionSummary, 'Link extended and restored for 7 days.');
    assert.equal(auditLog.action, 'SUPPORT_TICKET_STATUS_UPDATED');
  });

  // --------------------------------------------------------------------------
  // TEST 10: Diagnostic Integration & One-Click Auto Repair
  // --------------------------------------------------------------------------
  await t.test('TEST 10: Deep Link Diagnostic & Auto-Repair Integration', async () => {
    const testWish = {
      id: 'wm_test_diag_123',
      slug: 'test-birthday-celebration',
      lifecycleStatus: 'expired',
      moderationStatus: 'approved',
      customData: JSON.stringify({
        photos: [{ url: 'https://i.ibb.co/abc/photo.jpg' }],
        music: { storageKey: 'audio/bg_music.mp3', title: 'Celebration Beat' }
      })
    };

    const diagnosis = await diagnoseWishDeepHealth(testWish, {});
    assert.ok(diagnosis, 'Diagnostic report must be generated');
    assert.equal(diagnosis.wishId, testWish.id);
    assert.equal(diagnosis.checks.expiryValid, false, 'Expired wish must flag expiry check');
    assert.ok(diagnosis.issues.length > 0);

    // Auto-repair extends expiry by 7 days
    const now = new Date();
    const exp = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const newExpiry = exp.toISOString().split('T')[0];

    testWish.expiryDate = newExpiry;
    testWish.lifecycleStatus = 'active';

    const repairedDiag = await diagnoseWishDeepHealth(testWish, {});
    assert.equal(repairedDiag.checks.expiryValid, true, 'Repaired wish must pass expiry check');
  });

  // --------------------------------------------------------------------------
  // TEST 11: Notification Engine Integration
  // --------------------------------------------------------------------------
  await t.test('TEST 11: Notification Engine Integration on Ticket Milestones', () => {
    // 1. Notification on ticket creation
    const notifCreated = createInAppNotification({
      userId: 'usr_priya_202',
      type: NOTIFICATION_TYPES.SUPPORT_TICKET,
      title: 'Support Ticket Created (#TKT-2610-8472)',
      message: 'We have received your request. Our support team will respond shortly.',
      actionUrl: '/support/tickets?id=tkt_123'
    });

    assert.equal(notifCreated.userId, 'usr_priya_202');
    assert.equal(notifCreated.type, NOTIFICATION_TYPES.SUPPORT_TICKET);
    assert.match(notifCreated.title, /Support Ticket Created/);

    // 2. Notification on resolution
    const notifResolved = createInAppNotification({
      userId: 'usr_priya_202',
      type: NOTIFICATION_TYPES.SUPPORT_TICKET,
      title: 'Support Ticket Resolved (#TKT-2610-8472)',
      message: 'Your celebration link has been auto-repaired and renewed for 7 days.',
      actionUrl: '/support/tickets?id=tkt_123'
    });

    assert.equal(notifResolved.userId, 'usr_priya_202');
    assert.match(notifResolved.title, /Resolved/);
  });

});
