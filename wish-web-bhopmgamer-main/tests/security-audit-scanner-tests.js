/**
 * Security Audit Scanner Self-Tests
 * Verifies positive detection of unsafe patterns, acceptance of safe code,
 * check counting accuracy, stateless secret detection, deterministic results,
 * and honest reporting behaviour.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { runSecurityAudit, scanUnsafeSql, scanSecrets } from '../scripts/security-audit.js';

describe('Security Audit Scanner Comprehensive Test Suite', () => {

  it('1. Scanner executes and reports all 18 stable security checks on production codebase', () => {
    const res = runSecurityAudit();
    assert.equal(res.success, true, 'Scanner must pass on current clean codebase');
    assert.equal(res.checks.length, 18, 'Exactly 18 checks must run and pass');
    assert.equal(res.issues.length, 0, 'No issues on production codebase');
    assert.equal(res.checksPassed, 18, 'checksPassed must be 18');
    assert.equal(res.findingsDetected, 0, 'findingsDetected must be 0');
    assert.equal(res.checksSkipped, 0, 'checksSkipped must be 0');
    assert.equal(res.scanErrors, 0, 'scanErrors must be 0');
    assert.ok(res.checksRequiringManualReview.length >= 1, 'Manual review note must be reported');
    assert.ok(typeof res.sqlScanLimitations === 'string', 'SQL limitations must be documented');
  });

  it('2. Checks list contains stable, identifiable check names', () => {
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

  it('3. Recognizes safe parameterized SQL without false positives', () => {
    const fixtureDir = path.join('/tmp', 'sec_sql_safe_' + Date.now());
    const srcDir = path.join(fixtureDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    try {
      const safeCode = `
        export async function getTemplateBySlug(db, slug) {
          return await db.prepare("SELECT id, name, status FROM templates WHERE slug = ?").bind(slug).first();
        }
        export async function updateTemplateViews(db, id) {
          return await db.prepare("UPDATE templates SET views = views + 1 WHERE id = ?").bind(id).run();
        }
      `;
      fs.writeFileSync(path.join(srcDir, 'safe.js'), safeCode, 'utf8');

      const findings = scanUnsafeSql(fixtureDir);
      assert.equal(findings.length, 0, 'Safe parameterized SQL must produce 0 findings');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('4. Detects unsafe SQL interpolation in template literals (.prepare and variables)', () => {
    const fixtureDir = path.join('/tmp', 'sec_sql_interp_' + Date.now());
    const srcDir = path.join(fixtureDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    try {
      const unsafeCode = `
        export async function findUser(db, req) {
          const query = \`SELECT * FROM users WHERE id = '\${req.body.id}'\`;
          return await db.prepare(query).first();
        }
        export async function findByEmail(db, email) {
          return await db.prepare(\`SELECT * FROM users WHERE email = '\${email}'\`).first();
        }
      `;
      fs.writeFileSync(path.join(srcDir, 'vulnerable.js'), unsafeCode, 'utf8');

      const findings = scanUnsafeSql(fixtureDir);
      assert.ok(findings.length >= 2, 'Must detect both template literal SQL interpolations');
      assert.ok(findings.some(f => f.rule === 'SQL_TEMPLATE_INTERPOLATION' || f.rule === 'SQL_PREPARE_INTERPOLATION'));
      assert.equal(findings[0].file, 'src/vulnerable.js');
      assert.equal(findings[0].severity, 'CRITICAL');
      assert.ok(findings[0].remediation.length > 0);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('5. Detects unsafe string-concatenated SQL queries', () => {
    const fixtureDir = path.join('/tmp', 'sec_sql_concat_' + Date.now());
    const srcDir = path.join(fixtureDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    try {
      const unsafeConcat = `
        export async function searchTemplates(db, req) {
          const sql = "SELECT * FROM templates WHERE category = '" + req.query.category + "'";
          return await db.prepare(sql).all();
        }
      `;
      fs.writeFileSync(path.join(srcDir, 'concat.js'), unsafeConcat, 'utf8');

      const findings = scanUnsafeSql(fixtureDir);
      assert.equal(findings.length, 1, 'Must detect string-concatenated query');
      assert.equal(findings[0].rule, 'SQL_STRING_CONCATENATION');
      assert.equal(findings[0].file, 'src/concat.js');
      assert.equal(findings[0].line, 3);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('6. Distinguishes unsafe dynamic identifiers from safe allowlisted dynamic identifiers', () => {
    const fixtureDir = path.join('/tmp', 'sec_sql_dyn_' + Date.now());
    const srcDir = path.join(fixtureDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    try {
      // Unsafe file: directly interpolates request query into ORDER BY
      const unsafeCode = `
        export async function getSorted(db, req) {
          const sql = \`SELECT id, name FROM templates ORDER BY \${req.query.sort}\`;
          return await db.prepare(sql).all();
        }
      `;
      fs.writeFileSync(path.join(srcDir, 'unsafe_order.js'), unsafeCode, 'utf8');

      // Safe file: validates dynamic identifier against strict allowlist Set
      const safeCode = `
        const allowedSortColumns = new Set(['name', 'created_at', 'updated_at']);
        export async function getSortedSafe(db, sortColumn) {
          if (!allowedSortColumns.has(sortColumn)) {
            throw new Error('INVALID_SORT_COLUMN');
          }
          const sql = \`SELECT id, name FROM templates ORDER BY \${sortColumn}\`;
          return await db.prepare(sql).all();
        }
      `;
      fs.writeFileSync(path.join(srcDir, 'safe_order.js'), safeCode, 'utf8');

      const findings = scanUnsafeSql(fixtureDir);
      assert.equal(findings.length, 1, 'Only the unsafe dynamic identifier must be flagged');
      assert.equal(findings[0].file, 'src/unsafe_order.js');
      assert.equal(findings[0].rule, 'SQL_UNSAFE_DYNAMIC_IDENTIFIER');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('7. Accurately reports multiple findings with correct line numbers', () => {
    const fixtureDir = path.join('/tmp', 'sec_sql_multi_' + Date.now());
    const srcDir = path.join(fixtureDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    try {
      const multiFindingCode = [
        '// Line 1: Header',
        'const q1 = "SELECT * FROM users WHERE id = " + req.params.id;', // Line 2
        '// Line 3: Comment',
        '// Line 4: Comment',
        'const q2 = env.DB.prepare(`SELECT * FROM wishes WHERE slug = \'${req.query.slug}\'`);' // Line 5
      ].join('\n');

      fs.writeFileSync(path.join(srcDir, 'multi.js'), multiFindingCode, 'utf8');

      const findings = scanUnsafeSql(fixtureDir);
      assert.equal(findings.length, 2, 'Must detect both findings in file');
      assert.equal(findings[0].line, 2);
      assert.equal(findings[1].line, 5);
      assert.equal(findings[0].file, 'src/multi.js');
      assert.equal(findings[1].file, 'src/multi.js');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('8. Respects excluded directories and produces deterministic results across runs', () => {
    const fixtureDir = path.join('/tmp', 'sec_sql_exclude_' + Date.now());
    const nodeModulesDir = path.join(fixtureDir, 'node_modules', 'some-pkg');
    const srcDir = path.join(fixtureDir, 'src');
    fs.mkdirSync(nodeModulesDir, { recursive: true });
    fs.mkdirSync(srcDir, { recursive: true });

    try {
      // Put vulnerable file in node_modules (should be excluded)
      fs.writeFileSync(
        path.join(nodeModulesDir, 'ignored.js'),
        'const q = `SELECT * FROM table WHERE id = ${req.body.id}`;',
        'utf8'
      );

      // Put vulnerable file in src (should be found)
      fs.writeFileSync(
        path.join(srcDir, 'active.js'),
        'const q = `SELECT * FROM table WHERE id = ${req.body.id}`;',
        'utf8'
      );

      const run1 = scanUnsafeSql(fixtureDir);
      const run2 = scanUnsafeSql(fixtureDir);

      assert.equal(run1.length, 1, 'Only active.js should be scanned, node_modules excluded');
      assert.equal(run1[0].file, 'src/active.js');
      assert.deepEqual(run1, run2, 'Scanner runs must be 100% deterministic');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('9. Secret Scanner: detects live credential patterns calling actual scanSecrets implementation', () => {
    const fixtureDir = path.join('/tmp', 'sec_secret_' + Date.now());
    const srcDir = path.join(fixtureDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    try {
      const codeWithSecret = 'const razorpayLiveKey = "rzp_live_1234567890abcdef123";';
      fs.writeFileSync(path.join(srcDir, 'payment.js'), codeWithSecret, 'utf8');

      const findings = scanSecrets(fixtureDir);
      assert.equal(findings.length, 1, 'Must detect 1 live credential');
      assert.equal(findings[0].file, 'src/payment.js');
      assert.equal(findings[0].rule, 'RAZORPAY_LIVE_KEY');
      assert.equal(findings[0].severity, 'CRITICAL');
      // NEVER leak the actual secret token in finding messages
      assert.ok(!findings[0].message.includes('rzp_live_1234567890abcdef123'), 'Secret token must not be printed in findings');
      assert.ok(findings[0].message.includes('[REDACTED]'), 'Secret must be masked with [REDACTED]');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('10. Secret Scanner: STATE REGRESSION FIX - detects consecutive secrets without skipping due to lastIndex state', () => {
    const fixtureDir = path.join('/tmp', 'sec_secret_state_' + Date.now());
    const srcDir = path.join(fixtureDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    try {
      // Multiple consecutive lines with secrets - verifies that regex.lastIndex does not cause line 2 or 3 to be missed
      const codeWithMultipleSecrets = [
        'const keyA = "rzp_live_11111111111111aaaa";',
        'const keyB = "rzp_live_22222222222222bbbb";',
        'const keyC = "rzp_live_33333333333333cccc";'
      ].join('\n');

      fs.writeFileSync(path.join(srcDir, 'keys.js'), codeWithMultipleSecrets, 'utf8');

      const findings = scanSecrets(fixtureDir);
      assert.equal(findings.length, 3, 'Must detect ALL 3 consecutive live secrets without skipping');
      assert.equal(findings[0].line, 1);
      assert.equal(findings[1].line, 2);
      assert.equal(findings[2].line, 3);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('11. Secret Scanner: ignores safe test keys and public configs', () => {
    const fixtureDir = path.join('/tmp', 'sec_secret_safe_' + Date.now());
    const srcDir = path.join(fixtureDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    try {
      const harmlessCode = `
        const testKey = "rzp_test_1234567890abcdef123";
        const stripeTestKey = "sk_test_1234567890abcdef123";
        const dummyToken = "TEST_TOKEN_12345";
      `;
      fs.writeFileSync(path.join(srcDir, 'test-config.js'), harmlessCode, 'utf8');

      const findings = scanSecrets(fixtureDir);
      assert.equal(findings.length, 0, 'Harmless test keys must produce 0 findings');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
