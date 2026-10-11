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

import fs from 'node:fs';

const packageJson = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')
);

function parseConfiguredTestCommands() {
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
        const output = `${stdout}\n${stderr}`;
        const missingPackageMatch = output.match(
          /Cannot find package ['"]([^'"]+)['"] imported from/i
        );

        let status = 'FAIL';

        if (missingPackageMatch) {
          const packageName = missingPackageMatch[1];
          const declaredDependencies = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies
          };

          const packagePath = path.join(
            ROOT_DIR,
            'node_modules',
            packageName
          );

          if (
            Object.prototype.hasOwnProperty.call(
              declaredDependencies,
              packageName
            ) &&
            !fs.existsSync(packagePath)
          ) {
            status = 'BLOCKED';
          }
        }

        resolve({
          suite: suite.name,
          command: suite.originalCommand,
          status,
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
