#!/usr/bin/env node
/**
 * WishMagic Matrix Test Runner
 * Executes independent test suites individually and records each outcome without stopping on early failures.
 * Reports passed, failed, skipped, and blocked suites separately.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SUITES = [
  { name: 'Integration Core Tests', cmd: 'node', args: ['test-integration.js'] },
  { name: 'Template Generation Tests', cmd: 'node', args: ['test-template-gen.js'] },
  { name: 'Template Analyzer Tests', cmd: 'node', args: ['tests/template-analyzer-tests.js'] },
  { name: 'Customizer Generator Tests', cmd: 'node', args: ['tests/customizer-generator-tests.js'] },
  { name: 'Section System Tests', cmd: 'node', args: ['tests/section-system-tests.js'] },
  { name: 'Visual System Tests', cmd: 'node', args: ['tests/visual-system-tests.js'] },
  { name: 'Media System Tests', cmd: 'node', args: ['tests/media-system-tests.js'] },
  { name: 'Part 8 E2E Media Verification', cmd: 'node', args: ['--test', 'tests/part8-e2e-media-verification-tests.js'] },
  { name: 'Part 9 Admin Control Center', cmd: 'node', args: ['--test', 'tests/part9-admin-control-center-tests.js'] },
  { name: 'Part 2 Universal Template Protocol', cmd: 'node', args: ['--test', 'tests/part2-universal-template-protocol-tests.js'] },
  { name: 'Part 3 Automatic Template Ingest', cmd: 'node', args: ['--test', 'tests/part3-automatic-template-ingest-tests.js'] },
  { name: 'Part 17 Compatibility E2E', cmd: 'node', args: ['--test', 'tests/wishmagic-part17-compatibility-e2e-tests.js'] },
  { name: 'Part 19 D1 Architecture', cmd: 'node', args: ['--test', 'tests/part19-d1-architecture-tests.js'] },
  { name: 'Part 20 B2 Storage', cmd: 'node', args: ['--test', 'tests/part20-b2-storage-tests.js'] },
  { name: 'Part 21 ImgBB Storage', cmd: 'node', args: ['--test', 'tests/part21-imgbb-storage-tests.js'] },
  { name: 'Part 26 Wish Lifecycle', cmd: 'node', args: ['--test', 'tests/part26-wish-lifecycle-tests.js'] },
  { name: 'Part 27 Template Variants', cmd: 'node', args: ['--test', 'tests/part27-template-variants-tests.js'] },
  { name: 'Part 28 Version Control', cmd: 'node', args: ['--test', 'tests/part28-template-version-control-tests.js'] },
  { name: 'Part 29 Storage Health', cmd: 'node', args: ['--test', 'tests/part29-storage-health-tests.js'] },
  { name: 'Part 30 Admin Operations', cmd: 'node', args: ['--test', 'tests/part30-admin-operations-tests.js'] },
  { name: 'Part 31 Notification System', cmd: 'node', args: ['--test', 'tests/part31-notification-system-tests.js'] },
  { name: 'Part 32 Commerce Engine', cmd: 'node', args: ['--test', 'tests/part32-commerce-engine-tests.js'] },
  { name: 'Part 33 Analytics BI', cmd: 'node', args: ['--test', 'tests/part33-analytics-bi-tests.js'] },
  { name: 'Part 34 Customer Support', cmd: 'node', args: ['--test', 'tests/part34-customer-support-tests.js'] },
  { name: 'Part 35 Account Privacy', cmd: 'node', args: ['--test', 'tests/part35-account-privacy-tests.js'] },
  { name: 'Part 36 Referral Rewards', cmd: 'node', args: ['--test', 'tests/part36-referral-rewards-tests.js'] },
  { name: 'Part 37 Account Lifecycle', cmd: 'node', args: ['--test', 'tests/part37-account-lifecycle-tests.js'] },
  { name: 'Part 38 Legal Compliance', cmd: 'node', args: ['--test', 'tests/part38-legal-compliance-tests.js'] },
  { name: 'Part 39 Search Discovery', cmd: 'node', args: ['--test', 'tests/part39-search-discovery-tests.js'] },
  { name: 'Part 40 Admin Navigation', cmd: 'node', args: ['--test', 'tests/part40-admin-navigation-tests.js'] },
  { name: 'Part 41 B2 Music Upload', cmd: 'node', args: ['--test', 'tests/part41-b2-music-upload-tests.js'] },
  { name: 'Part 42 Media Inventory', cmd: 'node', args: ['--test', 'tests/part42-media-storage-inventory-tests.js'] },
  { name: 'Part 43 Audio Video Playback', cmd: 'node', args: ['--test', 'tests/part43-audio-video-playback-tests.js'] },
  { name: 'Part 44 Bulk Upload Preservation', cmd: 'node', args: ['--test', 'tests/part44-bulk-upload-format-preservation-tests.js'] },
  { name: 'Database Migration Integrity', cmd: 'node', args: ['--test', 'tests/database-migration-integrity-tests.js'] },
  { name: 'Security Audit Scanner Self-Tests', cmd: 'node', args: ['--test', 'tests/security-audit-scanner-tests.js'] },
  { name: 'Stage 4 Public Link Sharing E2E', cmd: 'node', args: ['--test', 'tests/stage4-public-link-sharing-e2e-tests.js'] },
  { name: 'Stage 5 Customizer Engine E2E', cmd: 'node', args: ['--test', 'tests/stage5-customizer-engine-e2e-tests.js'] },
  { name: 'Stage 6 Wish Creation Wizard E2E', cmd: 'node', args: ['--test', 'tests/stage6-wish-creation-wizard-e2e-tests.js'] },
  { name: 'Master Audit Production Readiness', cmd: 'node', args: ['--test', 'tests/master-audit-production-readiness-tests.js'] }
];

async function runSuite(suite) {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const child = spawn(suite.cmd, suite.args, {
      cwd: ROOT_DIR,
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      resolve({
        suite: suite.name,
        status: 'BLOCKED',
        error: err.message,
        duration: Date.now() - startTime
      });
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      if (code === 0) {
        resolve({ suite: suite.name, status: 'PASS', duration });
      } else {
        resolve({
          suite: suite.name,
          status: 'FAIL',
          code,
          stderr: stderr.slice(-300),
          duration
        });
      }
    });
  });
}

async function main() {
  console.log('================================================================');
  console.log('🧪 WISHMAGIC COMPREHENSIVE TEST MATRIX EXECUTION');
  console.log('================================================================\n');

  const results = [];
  for (const s of SUITES) {
    process.stdout.write(`Running: ${s.name.padEnd(42)} ... `);
    const res = await runSuite(s);
    results.push(res);
    if (res.status === 'PASS') {
      console.log(`✅ PASS (${res.duration}ms)`);
    } else if (res.status === 'BLOCKED') {
      console.log(`⚠️ BLOCKED: ${res.error}`);
    } else {
      console.log(`❌ FAIL (code ${res.code})`);
      if (res.stderr) console.log(`   ${res.stderr.trim()}`);
    }
  }

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const blocked = results.filter(r => r.status === 'BLOCKED').length;

  console.log('\n================================================================');
  console.log(`MATRIX SUMMARY: Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Blocked: ${blocked}`);
  console.log('================================================================\n');

  if (failed > 0 || blocked > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal Test Matrix Error:', err);
  process.exit(1);
});
