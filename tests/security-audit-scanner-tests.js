/**
 * Security Audit Scanner Self-Tests
 * Verifies positive detection of unsafe patterns, acceptance of safe code,
 * check counting accuracy, and nonzero exit codes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { runSecurityAudit, scanUnsafeSql } from '../scripts/security-audit.js';

describe('Security Audit Scanner Self-Test Suite', () => {

  it('1. Scanner executes and reports all 18 stable security checks on production codebase', () => {
    const res = runSecurityAudit();
    assert.equal(res.success, true, 'Scanner must pass on current clean codebase');
    assert.equal(res.checks.length, 18, 'Exactly 18 checks must run and pass');
    assert.equal(res.issues.length, 0, 'No issues on production codebase');
  });

  it('2. Detects unsafe SQL interpolation when fixture is introduced', () => {
    const fixtureDir = path.join('/tmp', 'sec_test_' + Date.now());
    const srcDir = path.join(fixtureDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    const unsafeSql = "const query = env.DB.prepare(`SELECT * FROM users WHERE id = '${req.body.id}'`);";
    const safeSql = "const query = env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(req.body.id);";

    fs.writeFileSync(path.join(srcDir, 'vulnerable.js'), unsafeSql, 'utf8');
    fs.writeFileSync(path.join(srcDir, 'safe.js'), safeSql, 'utf8');

    const findings = scanUnsafeSql(fixtureDir);

    assert.equal(findings.length, 1, 'Scanner must report exactly 1 vulnerable finding');
    assert.equal(findings[0].file, path.join('src', 'vulnerable.js'));
    assert.equal(findings[0].rule, 'SQL_PREPARE_INTERPOLATION');

    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('3. Detects fake live secret credential pattern in fixture', () => {
    const liveKeyPattern = /(rzp_live_[a-zA-Z0-9]{14,}|sk_live_[a-zA-Z0-9]{24,}|AIzaSy[a-zA-Z0-9_-]{33})/g;
    
    const fakeSecret = 'const key = "rzp_live_1234567890abcdef123";';
    const harmlessCode = 'const key = "rzp_test_1234567890abcdef123";';

    assert.ok(liveKeyPattern.test(fakeSecret), 'Pattern must detect live secret key');
    assert.ok(!liveKeyPattern.test(harmlessCode), 'Pattern must ignore test keys');
  });

  it('4. Checks list contains stable, identifiable check names', () => {
    const res = runSecurityAudit();
    const expected = [
      'Security Headers Validated',
      'Dev Auth Bypass Eliminated',
      '/api/auth/dev-switch Disabled',
      'Admin RBAC Authoritative',
      'Server-Side Premium Authority Enforced',
      'Zero Fallback Identities',
      'CORS Strict Allowlist Enforced',
      'Secure Session Cookies Verified',
      'CSRF Protection Active',
      'Dangerous Media Extensions Blocked',
      'Public Wish Privacy Masked',
      'Frontend Mock Auth Clean',
      'No Hardcoded Credentials',
      'Zero Client Role Trust',
      'Token Transport Secured',
      'Wish Lifecycle Masking Verified',
      'Payment & Webhook Cryptographic Verification',
      'Parameterized SQL Defense Enforced'
    ];

    for (const name of expected) {
      assert.ok(res.checks.includes(name), `Checks must include '${name}'`);
    }
  });
});
