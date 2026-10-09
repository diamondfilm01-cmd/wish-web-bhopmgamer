/**
 * WishMagic Production Referral Program, Invite Rewards & Fraud Prevention Tests (Part 36)
 * ========================================================================================
 * Comprehensive test suite validating:
 * 1. Migration 0021 Schema & Additive D1 Database Integrity
 * 2. Referral Code Format, Entropy & Uniqueness Invariants
 * 3. Privacy-Conscious Attribution Tracking & Masking (Email & IP)
 * 4. Self-Referral Prevention (Same User ID & Email Aliases)
 * 5. Circular Referral Loop Prevention (A -> B, B -> A)
 * 6. High Velocity Limit & Abuse Swarm Detection
 * 7. Max Referrals Per User Invariant Enforcement
 * 8. Authoritative Milestone Qualification Engine (FIRST_WISH & FIRST_PURCHASE)
 * 9. Server-Side Ledger Idempotency (Zero Double-Granting Invariant)
 * 10. Reward Claiming & Platform Entitlement Extension
 * 11. Admin Program Configuration & Dynamic Rules
 * 12. Admin Operations Workflow (Approval, Rejection & Fraud Logs Audit)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  QUALIFYING_EVENTS,
  REWARD_TYPES,
  LEDGER_STATUS,
  ATTRIBUTION_STATUS,
  DEFAULT_PROGRAM,
  maskEmail,
  maskIp,
  hashSignature,
  generateReferralCode,
  validateCustomReferralSlug,
  calculateRiskScore,
  getProgramConfig,
  ensureUserReferralCode,
  trackReferralClick,
  linkRefereeSignup,
  performFraudCheck,
  evaluateQualifyingEvent,
  claimUserReward,
  getUserReferralDashboard,
  getAdminReferralOverview,
  listAdminReferrals,
  listAdminRewardLedger,
  adminApproveReferral,
  adminRejectReferral,
  updateProgramConfig,
  getAdminFraudLogs,
  createMockReferralDatabase
} from '../src/referral-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('WishMagic Part 36: Production Referral Program, Rewards & Fraud Prevention Suite', async (t) => {

  // --------------------------------------------------------------------------
  // TEST 1: Migration 0021 Schema & Additive D1 Integrity
  // --------------------------------------------------------------------------
  await t.test('TEST 1: Migration 0021 Schema & Additive D1 Integrity', () => {
    const migPath = path.join(ROOT_DIR, 'migrations', '0021_part36_referral_rewards_and_fraud_prevention.sql');
    assert.equal(fs.existsSync(migPath), true, 'Migration 0021 file must exist');

    const sql = fs.readFileSync(migPath, 'utf8');
    assert.match(sql, /c08b683b-eb07-4639-ab33-fb1139bfb295/, 'Must reference authoritative production D1 UUID');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS referral_programs/, 'Must create referral_programs table');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS user_referral_codes/, 'Must create user_referral_codes table');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS referral_attributions/, 'Must create referral_attributions table');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS referral_rewards_ledger/, 'Must create referral_rewards_ledger table');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS referral_fraud_logs/, 'Must create referral_fraud_logs table');
    assert.match(sql, /mig_0021/, 'Must register mig_0021 in _migrations');

    // D1 setup script must also contain Part 36 tables
    const d1Sql = fs.readFileSync(path.join(ROOT_DIR, 'd1_setup.sql'), 'utf8');
    assert.match(d1Sql, /0021_part36_referral_rewards_and_fraud_prevention\.sql/, 'd1_setup.sql must be synchronized with Part 36');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Referral Code Format, Entropy & Uniqueness Invariants
  // --------------------------------------------------------------------------
  await t.test('TEST 2: Referral Code Format, Entropy & Uniqueness Invariants', () => {
    const code1 = generateReferralCode('usr_user1');
    const code2 = generateReferralCode('usr_user2');

    assert.equal(code1.startsWith('WM-'), true, 'Code must start with WM- prefix');
    assert.equal(code1.length, 9, 'Code must be 9 characters long (WM- + 6 alphanumeric)');
    assert.equal(code2.startsWith('WM-'), true);
    assert.notEqual(code1, code2, 'Different user IDs should produce distinct codes');

    // Unambiguous characters only (no 0, 1, I, O)
    const suffix1 = code1.replace('WM-', '');
    assert.match(suffix1, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/, 'Suffix must only use unambiguous uppercase characters');

    // Custom vanity slug validation
    const validSlug = validateCustomReferralSlug('ankit-vip');
    assert.equal(validSlug.valid, true);
    assert.equal(validSlug.slug, 'ANKIT-VIP');

    const invalidShort = validateCustomReferralSlug('hi');
    assert.equal(invalidShort.valid, false, 'Slugs shorter than 3 chars must fail');

    const invalidChars = validateCustomReferralSlug('ankit@vip!');
    assert.equal(invalidChars.valid, false, 'Slugs with special characters must fail');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Privacy-Conscious Attribution Tracking & Masking
  // --------------------------------------------------------------------------
  await t.test('TEST 3: Privacy-Conscious Attribution Tracking & Masking', () => {
    // Email Masking
    assert.equal(maskEmail('ankitsaini941413@gmail.com'), 'a***3@gmail.com');
    assert.equal(maskEmail('john.doe@wishmagic.app'), 'j***e@wishmagic.app');
    assert.equal(maskEmail('ab@test.com'), 'a*@test.com');
    assert.equal(maskEmail(null), 'Anonymous Creator');

    // IP Masking (IPv4 & IPv6)
    assert.equal(maskIp('192.168.1.100'), '192.168.***.***');
    assert.equal(maskIp('103.21.244.15'), '103.21.***.***');
    assert.equal(maskIp('2405:201:6803:9021:1234:5678:9abc:def0'), '2405:201:****:****');
    assert.equal(maskIp(''), '0.0.0.0');

    // Hash Signature
    const hash1 = hashSignature('192.168.1.100');
    const hash2 = hashSignature('192.168.1.100');
    const hash3 = hashSignature('192.168.1.101');
    assert.equal(hash1, hash2, 'Identical input must produce identical hash');
    assert.notEqual(hash1, hash3, 'Different inputs must produce different hashes');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Self-Referral Prevention (Same User ID & Email Aliases)
  // --------------------------------------------------------------------------
  await t.test('TEST 4: Self-Referral Prevention (Same User ID & Email Aliases)', () => {
    // 1. Same User ID
    const resSameId = calculateRiskScore({
      referrerUserId: 'usr_alpha',
      refereeUserId: 'usr_alpha'
    });
    assert.equal(resSameId.isClean, false, 'Self-referral with same user ID must fail');
    assert.equal(resSameId.action, 'BLOCKED');
    assert.equal(resSameId.flags.includes('SELF_REFERRAL_SAME_USER_ID'), true);

    // 2. Same Email
    const resSameEmail = calculateRiskScore({
      referrerUserId: 'usr_alpha',
      refereeUserId: 'usr_beta',
      referrerEmail: 'creator@gmail.com',
      refereeEmail: 'creator@gmail.com'
    });
    assert.equal(resSameEmail.isClean, false);
    assert.equal(resSameEmail.action, 'BLOCKED');
    assert.equal(resSameEmail.flags.includes('SELF_REFERRAL_IDENTICAL_EMAIL'), true);

    // 3. Plus-addressed alias email (creator+1@gmail.com vs creator@gmail.com)
    const resAlias = calculateRiskScore({
      referrerUserId: 'usr_alpha',
      refereeUserId: 'usr_beta',
      referrerEmail: 'creator@gmail.com',
      refereeEmail: 'creator+alias@gmail.com'
    });
    assert.equal(resAlias.isClean, false);
    assert.equal(resAlias.flags.includes('SUSPICIOUS_ALIAS_EMAIL'), true);
  });

  // --------------------------------------------------------------------------
  // TEST 5: Circular Referral Loop Prevention (A -> B, B -> A)
  // --------------------------------------------------------------------------
  await t.test('TEST 5: Circular Referral Loop Prevention (A -> B, B -> A)', () => {
    const resCircular = calculateRiskScore({
      referrerUserId: 'usr_userB',
      refereeUserId: 'usr_userA',
      isCircular: true
    });
    assert.equal(resCircular.isClean, false);
    assert.equal(resCircular.action, 'BLOCKED');
    assert.equal(resCircular.flags.includes('CIRCULAR_REFERRAL_LOOP'), true);
  });

  // --------------------------------------------------------------------------
  // TEST 6: High Velocity Limit & Abuse Swarm Detection
  // --------------------------------------------------------------------------
  await t.test('TEST 6: High Velocity Limit & Abuse Swarm Detection', () => {
    const resNormal = calculateRiskScore({
      referrerUserId: 'usr_alpha',
      refereeUserId: 'usr_beta',
      recentReferralsCount: 3
    });
    assert.equal(resNormal.isClean, true);

    const resVelocity = calculateRiskScore({
      referrerUserId: 'usr_alpha',
      refereeUserId: 'usr_beta',
      recentReferralsCount: 20
    });
    assert.equal(resVelocity.isClean, false);
    assert.equal(resVelocity.flags.includes('HIGH_VELOCITY_INVITES'), true);
  });

  // --------------------------------------------------------------------------
  // TEST 7: Max Referrals Per User Invariant Enforcement
  // --------------------------------------------------------------------------
  await t.test('TEST 7: Max Referrals Per User Invariant Enforcement', () => {
    const resMaxLimit = calculateRiskScore({
      referrerUserId: 'usr_popular',
      refereeUserId: 'usr_newfriend',
      isMaxLimitExceeded: true
    });
    assert.equal(resMaxLimit.isClean, false);
    assert.equal(resMaxLimit.flags.includes('MAX_REFERRALS_LIMIT_EXCEEDED'), true);
  });

  // --------------------------------------------------------------------------
  // TEST 8: Authoritative Milestone Qualification Engine (FIRST_WISH & FIRST_PURCHASE)
  // --------------------------------------------------------------------------
  await t.test('TEST 8: Authoritative Milestone Qualification Engine (FIRST_WISH & FIRST_PURCHASE)', async () => {
    const mockDb = createMockReferralDatabase({
      users: [
        { id: 'usr_inviter', email: 'inviter@wishmagic.app', display_name: 'Ankit' },
        { id: 'usr_invitee', email: 'invitee@wishmagic.app', display_name: 'Rahul' }
      ]
    });

    // 1. Ensure referral code for inviter
    const codeData = await ensureUserReferralCode('usr_inviter', mockDb);
    assert.equal(codeData.userId, 'usr_inviter');
    assert.equal(codeData.referralCode.startsWith('WM-'), true);

    // 2. Track click
    const clickRes = await trackReferralClick({
      referralCode: codeData.referralCode,
      visitorToken: 'vtok_rahul_1',
      ip: '49.37.152.20',
      userAgent: 'Mozilla/5.0'
    }, mockDb);
    assert.equal(clickRes.success, true);
    assert.equal(clickRes.attributionId.startsWith('attr_'), true);

    // 3. Link signup
    const linkRes = await linkRefereeSignup({
      refereeUserId: 'usr_invitee',
      visitorToken: 'vtok_rahul_1',
      clientIp: '49.37.152.20',
      userAgent: 'Mozilla/5.0'
    }, mockDb);
    assert.equal(linkRes.success, true);

    // 4. Milestone trigger: FIRST_WISH
    const qualRes = await evaluateQualifyingEvent('usr_invitee', QUALIFYING_EVENTS.FIRST_WISH, {
      wishId: 'wish_rahul_first_celebration'
    }, mockDb);

    assert.equal(qualRes.qualified, true);
    assert.equal(qualRes.status, LEDGER_STATUS.GRANTED);
    assert.equal(qualRes.referrerReward.type, 'PREMIUM_DAYS');
    assert.equal(qualRes.referrerReward.amount, 7);
    assert.equal(qualRes.refereeReward.amount, 3);

    // Verify entitlements were automatically granted
    assert.equal(mockDb._state.entitlements.length, 2, 'Both inviter and invitee must have received entitlements');
    const inviterEnt = mockDb._state.entitlements.find(e => e.user_id === 'usr_inviter');
    assert.equal(inviterEnt.plan, 'VIP');
  });

  // --------------------------------------------------------------------------
  // TEST 9: Server-Side Ledger Idempotency (Zero Double-Granting Invariant)
  // --------------------------------------------------------------------------
  await t.test('TEST 9: Server-Side Ledger Idempotency (Zero Double-Granting Invariant)', async () => {
    const mockDb = createMockReferralDatabase({
      users: [
        { id: 'usr_alice', email: 'alice@test.com' },
        { id: 'usr_bob', email: 'bob@test.com' }
      ]
    });

    const code = await ensureUserReferralCode('usr_alice', mockDb);
    await trackReferralClick({ referralCode: code.referralCode, visitorToken: 'vtok_bob' }, mockDb);
    await linkRefereeSignup({ refereeUserId: 'usr_bob', visitorToken: 'vtok_bob' }, mockDb);

    // First qualification
    const firstEval = await evaluateQualifyingEvent('usr_bob', QUALIFYING_EVENTS.FIRST_WISH, {}, mockDb);
    assert.equal(firstEval.qualified, true);
    const ledgerCountFirst = mockDb._state.referral_rewards_ledger.length;
    assert.equal(ledgerCountFirst, 2, 'Must create exactly 2 ledger records (1 for referrer, 1 for referee)');

    // Second qualification attempt (e.g. user publishes a 2nd wish or clicks button repeatedly)
    const secondEval = await evaluateQualifyingEvent('usr_bob', QUALIFYING_EVENTS.FIRST_WISH, {}, mockDb);
    assert.equal(secondEval.qualified, false, 'Second event must be safely ignored');
    assert.equal(secondEval.reason, 'ALREADY_QUALIFIED_IDEMPOTENT');
    assert.equal(mockDb._state.referral_rewards_ledger.length, ledgerCountFirst, 'No duplicate ledger entries allowed');
  });

  // --------------------------------------------------------------------------
  // TEST 10: Reward Claiming & Platform Entitlement Extension
  // --------------------------------------------------------------------------
  await t.test('TEST 10: Reward Claiming & Platform Entitlement Extension', async () => {
    const mockDb = createMockReferralDatabase();
    const ledgerId = 'rw_claim_test_1';
    mockDb._state.referral_rewards_ledger.push({
      id: ledgerId,
      user_id: 'usr_sam',
      counterpart_user_id: 'usr_friend',
      role: 'REFERRER',
      reward_type: 'PREMIUM_DAYS',
      reward_amount: 14,
      status: 'GRANTED',
      idempotency_key: 'idem_test_sam',
      created_at: new Date().toISOString()
    });

    const claimRes = await claimUserReward('usr_sam', ledgerId, mockDb);
    assert.equal(claimRes.success, true);
    assert.equal(claimRes.rewardAmount, 14);

    const updatedLedger = mockDb._state.referral_rewards_ledger.find(l => l.id === ledgerId);
    assert.equal(updatedLedger.status, 'CLAIMED');
    assert.ok(updatedLedger.claimed_at);

    // Repeated claim must throw error
    await assert.rejects(
      async () => await claimUserReward('usr_sam', ledgerId, mockDb),
      /already been claimed/
    );
  });

  // --------------------------------------------------------------------------
  // TEST 11: Admin Program Configuration & Dynamic Rules
  // --------------------------------------------------------------------------
  await t.test('TEST 11: Admin Program Configuration & Dynamic Rules', async () => {
    const mockDb = createMockReferralDatabase();
    const adminUser = { email: 'admin@wishmagic.live', role: 'admin' };

    const updateRes = await updateProgramConfig({
      name: 'Diwali Special Referral Bonanza',
      qualifyingEvent: 'FIRST_PURCHASE',
      referrerRewardAmount: 14,
      refereeRewardAmount: 7,
      maxReferralsPerUser: 100
    }, adminUser, mockDb);

    assert.equal(updateRes.success, true);
    assert.equal(updateRes.config.name, 'Diwali Special Referral Bonanza');
    assert.equal(updateRes.config.qualifyingEvent, 'FIRST_PURCHASE');
    assert.equal(updateRes.config.referrerRewardAmount, 14);
    assert.equal(updateRes.config.maxReferralsPerUser, 100);

    // Verify persisted config
    const currentConfig = await getProgramConfig(mockDb);
    assert.equal(currentConfig.qualifyingEvent, 'FIRST_PURCHASE');
  });

  // --------------------------------------------------------------------------
  // TEST 12: Admin Operations Workflow (Approval, Rejection & Fraud Logs Audit)
  // --------------------------------------------------------------------------
  await t.test('TEST 12: Admin Operations Workflow (Approval, Rejection & Fraud Logs Audit)', async () => {
    const mockDb = createMockReferralDatabase();
    const adminUser = { email: 'admin@wishmagic.live', role: 'admin' };

    // Set up attribution in PENDING status
    const attrId = 'attr_review_1';
    mockDb._state.referral_attributions.push({
      id: attrId,
      referral_code: 'WM-TEST',
      referrer_user_id: 'usr_ref',
      referee_user_id: 'usr_ee',
      status: 'QUALIFIED'
    });
    mockDb._state.referral_rewards_ledger.push({
      id: 'rw_rev_1',
      attribution_id: attrId,
      user_id: 'usr_ref',
      status: 'PENDING',
      reward_type: 'PREMIUM_DAYS',
      reward_amount: 7
    });

    // 1. Admin Approve
    const approveRes = await adminApproveReferral(attrId, adminUser, mockDb);
    assert.equal(approveRes.success, true);
    assert.equal(approveRes.status, 'REWARDED');
    const ledgerItem = mockDb._state.referral_rewards_ledger.find(l => l.id === 'rw_rev_1');
    assert.equal(ledgerItem.status, 'GRANTED');

    // 2. Admin Reject another attribution
    const rejectAttrId = 'attr_fraud_fake';
    mockDb._state.referral_attributions.push({
      id: rejectAttrId,
      status: 'PENDING'
    });
    mockDb._state.referral_rewards_ledger.push({
      id: 'rw_fake_1',
      attribution_id: rejectAttrId,
      user_id: 'usr_bot',
      status: 'PENDING'
    });

    const rejectRes = await adminRejectReferral(rejectAttrId, 'Detected bot swarm', adminUser, mockDb);
    assert.equal(rejectRes.success, true);
    assert.equal(rejectRes.status, 'REJECTED');

    // 3. Admin Fraud logs list
    mockDb._state.referral_fraud_logs.push({
      id: 'frd_1',
      risk_score: 95,
      flag_reasons: '["SELF_REFERRAL_SAME_USER_ID"]',
      action_taken: 'BLOCKED',
      created_at: new Date().toISOString()
    });

    const fraudLogs = await getAdminFraudLogs({}, mockDb);
    assert.equal(fraudLogs.items.length, 1);
    assert.equal(fraudLogs.items[0].risk_score, 95);
  });

});
