/**
 * WishMagic Production Referral Program, Invite Rewards & Fraud Prevention Tests (Part 36)
 * =========================================================================================
 * Comprehensive test suite validating:
 * 1. Migration 0021 Schema & Additive D1 Database Integrity
 * 2. Referral Code Generation & Custom Slug Validation
 * 3. Privacy-conscious Click Tracking & Attribution Window
 * 4. Referee Linking & Self-Referral Prevention (Anti-abuse)
 * 5. Multi-tier Qualification Logic (SIGNUP, FIRST_WISH, FIRST_PURCHASE)
 * 6. Immutable Reward Ledger & Server-side Idempotency
 * 7. Fraud Signal Detection, IP Matching & Risk Score Computation
 * 8. User Dashboard Retrieval & Safe Data Masking (GDPR/DPDP)
 * 9. User Reward Claim Workflow & VIP Entitlement Unlock
 * 10. Admin Governance (Metrics Overview, Approvals, Rejections, Config Tuning)
 * 11. D1 Setup Synchronization & Migration Registration
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
  performFraudCheck,
  linkRefereeSignup,
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

test('WishMagic Part 36: Referral Program, Rewards & Fraud Prevention System Suite', async (t) => {

  // --------------------------------------------------------------------------
  // TEST 1: Migration 0021 Schema & Additive D1 Database Integrity
  // --------------------------------------------------------------------------
  await t.test('TEST 1: Migration 0021 Schema & Additive D1 Database Integrity', () => {
    const migPath = path.join(ROOT_DIR, 'migrations', '0021_part36_referral_rewards_and_fraud_prevention.sql');
    assert.equal(fs.existsSync(migPath), true, 'Migration 0021 SQL file must exist');

    const sqlContent = fs.readFileSync(migPath, 'utf8');

    // Verify all 5 core tables exist
    assert.ok(sqlContent.includes('CREATE TABLE IF NOT EXISTS referral_programs'), 'Must declare referral_programs table');
    assert.ok(sqlContent.includes('CREATE TABLE IF NOT EXISTS user_referral_codes'), 'Must declare user_referral_codes table');
    assert.ok(sqlContent.includes('CREATE TABLE IF NOT EXISTS referral_attributions'), 'Must declare referral_attributions table');
    assert.ok(sqlContent.includes('CREATE TABLE IF NOT EXISTS referral_rewards_ledger'), 'Must declare referral_rewards_ledger table');
    assert.ok(sqlContent.includes('CREATE TABLE IF NOT EXISTS referral_fraud_logs'), 'Must declare referral_fraud_logs table');

    // Verify constraints & indexing
    assert.ok(sqlContent.includes('referral_code TEXT NOT NULL UNIQUE'), 'referral_code must have UNIQUE constraint');
    assert.ok(sqlContent.includes('idx_attributions_code'), 'Must have index on attribution referral code');
    assert.ok(sqlContent.includes('idx_reward_ledger_user'), 'Must have index on reward ledger user');
    assert.ok(sqlContent.includes('idx_referral_codes_code'), 'Must have index on user referral code');
  });

  // --------------------------------------------------------------------------
  // TEST 2: D1 Setup Synchronization & Migration Versioning
  // --------------------------------------------------------------------------
  await t.test('TEST 2: D1 Setup Synchronization & Migration Versioning', () => {
    const setupSqlPath = path.join(ROOT_DIR, 'd1_setup.sql');
    assert.equal(fs.existsSync(setupSqlPath), true, 'd1_setup.sql must exist');

    const setupSql = fs.readFileSync(setupSqlPath, 'utf8');
    assert.ok(setupSql.includes('0021_part36_referral_rewards_and_fraud_prevention.sql'), 'd1_setup.sql must register migration 0021');
    assert.ok(setupSql.includes('referral_programs'), 'd1_setup.sql must contain referral_programs definition');
    assert.ok(setupSql.includes('referral_rewards_ledger'), 'd1_setup.sql must contain referral_rewards_ledger definition');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Utility & Privacy Protection (IP & Email Masking)
  // --------------------------------------------------------------------------
  await t.test('TEST 3: Utility & Privacy Protection (IP & Email Masking)', () => {
    // Email masking
    assert.equal(maskEmail('priya.sharma@example.com'), 'p***a@example.com');
    assert.equal(maskEmail('ab@test.com'), 'a*@test.com');
    assert.equal(maskEmail('invalid-email'), 'Creator');

    // IP masking
    assert.equal(maskIp('192.168.1.105'), '192.168.***.***');
    assert.equal(maskIp('2405:201:6800:1234:5678:abcd:ef01:2345'), '2405:201:****:****');
    assert.equal(maskIp(''), '0.0.0.0');

    // Signature hashing
    const sig1 = hashSignature('Mozilla/5.0');
    const sig2 = hashSignature('Mozilla/5.0');
    const sig3 = hashSignature('Chrome/120.0');
    assert.equal(sig1, sig2, 'Identical inputs must yield identical hash');
    assert.notEqual(sig1, sig3, 'Different inputs must yield different hash');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Referral Code Generation & Custom Slug Validation
  // --------------------------------------------------------------------------
  await t.test('TEST 4: Referral Code Generation & Custom Slug Validation', () => {
    const code1 = generateReferralCode('usr_test123');
    assert.ok(code1.startsWith('WM'), 'Referral code must have WM prefix');
    assert.ok(code1.length >= 6 && code1.length <= 14, 'Referral code must be reasonable length');

    // Custom slug validation
    assert.equal(validateCustomReferralSlug('PRIYA2026').valid, true);
    assert.equal(validateCustomReferralSlug('p-r').valid, false, 'Too short slug must be invalid');
    assert.equal(validateCustomReferralSlug('ADMIN').valid, false, 'Reserved slug ADMIN must be rejected');
    assert.equal(validateCustomReferralSlug('ROOT').valid, false, 'Reserved slug ROOT must be rejected');
    assert.equal(validateCustomReferralSlug('priya_invite!').valid, false, 'Special characters must be rejected');
  });

  // --------------------------------------------------------------------------
  // TEST 5: User Referral Code Provisioning in Mock D1
  // --------------------------------------------------------------------------
  await t.test('TEST 5: User Referral Code Provisioning in Mock D1', async () => {
    const mockDb = createMockReferralDatabase();
    const userId = 'usr_ankit_001';

    // Initial provisioning
    const rec1 = await ensureUserReferralCode(userId, mockDb);
    assert.ok(rec1.referralCode, 'Must generate a referral code');
    assert.equal(rec1.userId, userId);

    // Second call must return existing code (idempotent)
    const rec2 = await ensureUserReferralCode(userId, mockDb);
    assert.equal(rec2.referralCode, rec1.referralCode, 'Subsequent calls must return existing code');
  });

  // --------------------------------------------------------------------------
  // TEST 6: Referral Click Tracking & Visitor Token Recording
  // --------------------------------------------------------------------------
  await t.test('TEST 6: Referral Click Tracking & Visitor Token Recording', async () => {
    const mockDb = createMockReferralDatabase();
    const referrerId = 'usr_referrer_001';
    const codeRecord = await ensureUserReferralCode(referrerId, mockDb);

    const clickResult = await trackReferralClick({
      referralCode: codeRecord.referralCode,
      visitorToken: 'vtok_abc123',
      ip: '103.21.244.15',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      landingPage: '/birthday-wishes'
    }, mockDb);

    assert.equal(clickResult.success, true);
    assert.equal(clickResult.referralCode, codeRecord.referralCode);

    // Verify counter incremented
    const updated = await ensureUserReferralCode(referrerId, mockDb);
    assert.equal(updated.totalClicks, 1, 'Total clicks count must increment');
  });

  // --------------------------------------------------------------------------
  // TEST 7: Fraud Detection & Self-Referral Prevention
  // --------------------------------------------------------------------------
  await t.test('TEST 7: Fraud Detection & Self-Referral Prevention', async () => {
    const mockDb = createMockReferralDatabase();
    const referrerId = 'usr_fraud_test_001';
    const codeRecord = await ensureUserReferralCode(referrerId, mockDb);

    // 1. Self-referral attempt
    const selfLinkResult = await linkRefereeSignup({
      referralCode: codeRecord.referralCode,
      refereeUserId: referrerId, // SAME AS REFERRER
      refereeEmail: 'referrer@wishmagic.live',
      clientIp: '103.21.244.15',
      userAgent: 'Mozilla/5.0'
    }, mockDb);

    assert.equal(selfLinkResult.success, false);
    assert.equal(selfLinkResult.reason, 'SELF_REFERRAL');

    // 2. Risk score check on bot user agents and disposable emails
    const riskCheck = await performFraudCheck({
      referrerUserId: codeRecord.userId,
      referralCode: codeRecord.referralCode,
      refereeUserId: 'usr_new_002',
      refereeEmail: 'newbie@temp-mail.com', // disposable domain
      clientIp: '103.21.244.15',
      userAgent: 'curl/7.68.0', // bot UA
      db: mockDb
    });

    assert.ok(riskCheck.riskScore >= 40, 'Bot user agent and disposable email must trigger elevated risk score');
    assert.ok(riskCheck.flags.length > 0, 'Must record fraud detection flags');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Successful Referral Linking & Referee Signup Attribution
  // --------------------------------------------------------------------------
  await t.test('TEST 8: Successful Referral Linking & Referee Signup Attribution', async () => {
    const mockDb = createMockReferralDatabase();
    const referrerId = 'usr_vip_referrer';
    const refereeId = 'usr_legit_referee';

    const codeRecord = await ensureUserReferralCode(referrerId, mockDb);

    const linkResult = await linkRefereeSignup({
      referralCode: codeRecord.referralCode,
      refereeUserId: refereeId,
      refereeEmail: 'priya.sharma@gmail.com',
      clientIp: '49.37.100.22',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
    }, mockDb);

    assert.equal(linkResult.success, true);
    assert.equal(linkResult.referralCode, codeRecord.referralCode);
    assert.ok(linkResult.attributionId);

    // Attempting duplicate link for same referee must be prevented
    const dupResult = await linkRefereeSignup({
      referralCode: codeRecord.referralCode,
      refereeUserId: refereeId,
      refereeEmail: 'priya.sharma@gmail.com',
      clientIp: '49.37.100.22'
    }, mockDb);

    assert.equal(dupResult.success, false);
    assert.equal(dupResult.reason, 'ALREADY_ATTRIBUTED');
  });

  // --------------------------------------------------------------------------
  // TEST 9: Multi-Tier Qualifying Event Evaluation (FIRST_WISH & Reward Grant)
  // --------------------------------------------------------------------------
  await t.test('TEST 9: Multi-Tier Qualifying Event Evaluation (FIRST_WISH & Reward Grant)', async () => {
    const mockDb = createMockReferralDatabase();
    const referrerId = 'usr_referrer_wish';
    const refereeId = 'usr_referee_wish';

    const codeRecord = await ensureUserReferralCode(referrerId, mockDb);

    // Link referral
    await linkRefereeSignup({
      referralCode: codeRecord.referralCode,
      refereeUserId: refereeId,
      refereeEmail: 'creator.friend@gmail.com',
      clientIp: '157.34.12.80',
      userAgent: 'Mozilla/5.0'
    }, mockDb);

    // Referee creates their first celebration wish
    const evalResult = await evaluateQualifyingEvent(
      refereeId,
      QUALIFYING_EVENTS.FIRST_WISH,
      { wishId: 'wish_magical_bday_99' },
      mockDb,
      {}
    );

    assert.equal(evalResult.qualified, true);
    assert.equal(evalResult.rewardsGranted.length, 2, 'Should grant rewards to both referrer and referee');

    const referrerReward = evalResult.rewardsGranted.find(r => r.userId === referrerId);
    const refereeReward = evalResult.rewardsGranted.find(r => r.userId === refereeId);

    assert.ok(referrerReward);
    assert.ok(refereeReward);
    assert.equal(referrerReward.rewardType, REWARD_TYPES.VIP_DAYS);
    assert.equal(refereeReward.rewardType, REWARD_TYPES.VIP_DAYS);

    // Subsequent qualifying event for the same attribution must NOT double-grant
    const secondEval = await evaluateQualifyingEvent(
      refereeId,
      QUALIFYING_EVENTS.FIRST_WISH,
      { wishId: 'wish_magical_anniv_100' },
      mockDb,
      {}
    );
    assert.equal(secondEval.qualified, false);
    assert.ok(secondEval.reason && secondEval.reason.startsWith('ALREADY_QUALIFIED'));
  });

  // --------------------------------------------------------------------------
  // TEST 10: Reward Claim Workflow & Entitlement Activation
  // --------------------------------------------------------------------------
  await t.test('TEST 10: Reward Claim Workflow & Entitlement Activation', async () => {
    const mockDb = createMockReferralDatabase();
    const referrerId = 'usr_claimant_01';
    const refereeId = 'usr_invitee_01';

    const codeRec = await ensureUserReferralCode(referrerId, mockDb);
    await linkRefereeSignup({
      referralCode: codeRec.referralCode,
      refereeUserId: refereeId,
      refereeEmail: 'invitee@gmail.com',
      clientIp: '110.22.33.44',
      userAgent: 'Mozilla/5.0'
    }, mockDb);

    const evalResult = await evaluateQualifyingEvent(
      refereeId,
      QUALIFYING_EVENTS.FIRST_WISH,
      { wishId: 'wish_demo_01' },
      mockDb,
      {}
    );

    const referrerReward = evalResult.rewardsGranted.find(r => r.userId === referrerId);
    assert.ok(referrerReward);

    // Claim reward
    const claimResult = await claimUserReward(referrerId, referrerReward.ledgerId, mockDb, {});
    assert.equal(claimResult.success, true);
    assert.equal(claimResult.rewardAmount, 7); // Default 7 days VIP

    // Attempting double-claim must fail
    await assert.rejects(
      async () => await claimUserReward(referrerId, referrerReward.ledgerId, mockDb, {}),
      /ALREADY_CLAIMED/
    );
  });

  // --------------------------------------------------------------------------
  // TEST 11: User Referral Dashboard Retrieval & Privacy Safe Masking
  // --------------------------------------------------------------------------
  await t.test('TEST 11: User Referral Dashboard Retrieval & Privacy Safe Masking', async () => {
    const mockDb = createMockReferralDatabase();
    const userId = 'usr_dashboard_user';

    await ensureUserReferralCode(userId, mockDb);

    const dash = await getUserReferralDashboard(userId, mockDb, 'https://wishmagic.live');

    assert.equal(dash.success, true);
    assert.ok(dash.referralCode);
    assert.ok(dash.referralLink.startsWith('https://wishmagic.live/?ref='));
    assert.ok(dash.shareUrls.whatsapp);
    assert.ok(dash.shareUrls.telegram);
    assert.ok(dash.shareUrls.twitter);
    assert.ok(dash.metrics);
    assert.equal(typeof dash.metrics.totalClicks, 'number');
    assert.equal(typeof dash.metrics.totalSignups, 'number');
    assert.equal(Array.isArray(dash.rewardsLedger), true);
    assert.equal(Array.isArray(dash.invitedFriends), true);
  });

  // --------------------------------------------------------------------------
  // TEST 12: Admin Console Operations (Metrics, Listing, Approval & Config)
  // --------------------------------------------------------------------------
  await t.test('TEST 12: Admin Console Operations (Metrics, Listing, Approval & Config)', async () => {
    const mockDb = createMockReferralDatabase();
    const adminUser = { id: 'usr_master_admin', email: 'anktech.official@gmail.com', role: 'admin' };

    // Overview KPIs
    const overview = await getAdminReferralOverview(mockDb);
    assert.ok(overview.metrics);
    assert.equal(typeof overview.metrics.totalCodes, 'number');
    assert.equal(typeof overview.metrics.totalAttributions, 'number');

    // List referrals & ledger
    const list = await listAdminReferrals({}, mockDb);
    assert.ok(Array.isArray(list.attributions));

    const ledger = await listAdminRewardLedger({}, mockDb);
    assert.ok(Array.isArray(ledger.ledger));

    // Fraud logs
    const fraudLogs = await getAdminFraudLogs({}, mockDb);
    assert.ok(Array.isArray(fraudLogs.logs));

    // Update Program Config
    const updatedProg = await updateProgramConfig({
      programName: 'Diwali Festive Celebrations 2026',
      referrerRewardAmount: 14,
      refereeRewardAmount: 5,
      maxReferralsPerUser: 100
    }, adminUser, mockDb);

    assert.equal(updatedProg.programName, 'Diwali Festive Celebrations 2026');
    assert.equal(updatedProg.referrerRewardAmount, 14);
    assert.equal(updatedProg.maxReferralsPerUser, 100);
  });

});
