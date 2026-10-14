#!/usr/bin/env node
/**
 * WishMagic Matrix Test Runner
 * Executes independent test suites individually and records each outcome without stopping on early failures.
 * Accurately distinguishes missing dependencies (BLOCKED) from assertion failures (FAIL).
 * Reports passed, failed, blocked, and not run suites with verified reconciliation.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const packageJson = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')
);

const requireFromRoot = createRequire(path.join(ROOT_DIR, 'package.json'));

/**
 * Validates whether a dependency package or module can actually be resolved.
 * Checks both CommonJS require resolution and ESM package.json entry points.
 */
export function canResolveDependency(packageName) {
  if (!packageName || typeof packageName !== 'string') return false;

  // Internal relative modules are handled by path check
  if (packageName.startsWith('.') || packageName.startsWith('/')) {
    const absPath = path.resolve(ROOT_DIR, packageName);
    return fs.existsSync(absPath) || fs.existsSync(absPath + '.js');
  }

  try {
    requireFromRoot.resolve(packageName);
    return true;
  } catch {
    try {
      const pkgPath = path.join(ROOT_DIR, 'node_modules', packageName, 'package.json');
      if (fs.existsSync(pkgPath)) return true;
    } catch {}
    return false;
  }
}

export function parseConfiguredTestCommands() {
  const testScript = packageJson.scripts?.test;

  if (!testScript || typeof testScript !== 'string') {
    throw new Error('package.json does not define a test script');
  }

  return testScript
    .split('&&')
    .map(command => command.trim())
    .filter(Boolean)
    .map((command, index) => {
      const tokens = command.split(/\s+/);
      const executable = tokens.shift();

      if (executable !== 'node') {
        throw new Error(
          `Unsupported test command at position ${index + 1}: ${command}`
        );
      }

      const scriptPath = tokens[tokens.length - 1] || 'test';
      const baseName = path.basename(scriptPath, '.js').replace(/^part/, 'Part ');
      const cleanName = baseName
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());

      return {
        name: cleanName,
        cmd: executable,
        args: tokens,
        originalCommand: command
      };
    });
}

const SUITES = parseConfiguredTestCommands();

export async function runSuite(suite) {
  const startTime = Date.now();
  return new Promise((resolve) => {
    let settled = false;

    const child = spawn(suite.cmd, suite.args, {
      cwd: ROOT_DIR,
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      resolve({
        suite: suite.name,
        status: 'BLOCKED',
        reason: `Process launch failure: ${err.message}`,
        duration: Date.now() - startTime
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      const duration = Date.now() - startTime;

      if (code === 0) {
        resolve({ suite: suite.name, status: 'PASS', duration });
      } else {
        const output = `${stdout}\n${stderr}`;
        // Accurately detect missing module and dependency failures
        const missingPkgMatch = output.match(/Cannot find package ['"]([^'"]+)['"]/i) ||
                               output.match(/Cannot find module ['"]([^'"]+)['"]/i) ||
                               output.match(/ERR_MODULE_NOT_FOUND.*['"]([^'"]+)['"]/i);

        let status = 'FAIL';
        let blockReason = null;

        if (missingPkgMatch) {
          const packageName = missingPkgMatch[1];
          const isDeclared = Object.prototype.hasOwnProperty.call(packageJson.dependencies || {}, packageName) ||
                             Object.prototype.hasOwnProperty.call(packageJson.devDependencies || {}, packageName);

          if (!canResolveDependency(packageName)) {
            status = 'BLOCKED';
            blockReason = `Missing unresolvable dependency "${packageName}" (declared: ${isDeclared})`;
          }
        }

        resolve({
          suite: suite.name,
          command: suite.originalCommand,
          status,
          reason: blockReason,
          code,
          stderr: stderr.slice(-300),
          output: output.slice(-2000),
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
      console.log(`⚠️ BLOCKED: ${res.reason || res.error || 'Prerequisite missing'}`);
    } else {
      console.log(`❌ FAIL (code ${res.code})`);
      if (res.stderr) console.log(`   ${res.stderr.trim()}`);
    }
  }

  const discoveredCount = SUITES.length;
  const executedCount = results.filter(r => r.status !== 'NOT RUN').length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const blocked = results.filter(r => r.status === 'BLOCKED').length;
  const notRun = results.filter(r => r.status === 'NOT RUN').length;

  // Strict reconciliation verification: total discovered must equal sum of outcomes
  if (discoveredCount !== passed + failed + blocked + notRun) {
    console.error(`TALLY RECONCILIATION ERROR: Discovered (${discoveredCount}) != Sum (${passed + failed + blocked + notRun})`);
    process.exit(1);
  }

  console.log('\n================================================================');
  console.log(`MATRIX SUMMARY:`);
  console.log(`  Discovered Suites: ${discoveredCount}`);
  console.log(`  Executed Suites:   ${executedCount}`);
  console.log(`  Passed:            ${passed}`);
  console.log(`  Failed:            ${failed}`);
  console.log(`  Blocked:           ${blocked}`);
  console.log(`  Not Run:           ${notRun}`);
  console.log('================================================================\n');

  if (failed > 0) {
    console.log('❌ Failed Suites:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.suite} (exit code ${r.code})`);
      if (r.stderr) console.log(`      ${r.stderr.trim()}`);
    });
    console.log('');
  }

  if (blocked > 0) {
    console.log('⚠️ Blocked Suites:');
    results.filter(r => r.status === 'BLOCKED').forEach(r => {
      console.log(`  - ${r.suite}: ${r.reason || 'Missing dependency'}`);
    });
    console.log('');
  }

  if (failed > 0 || blocked > 0) {
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('run-test-matrix.js')) {
  main().catch(err => {
    console.error('Fatal Test Matrix Error:', err);
    process.exit(1);
  });
}
