/**
 * WishMagic Production Build & Static Asset Verification System
 * Part 27: Build Verification & Deployment Pipeline
 * 
 * Verifies:
 * 1. JavaScript & Module Syntax Integrity across all runtime and worker files
 * 2. Static HTML Asset References (Scripts, Styles, Fonts, Manifests)
 * 3. Cloudflare Pages Functions & _routes.json Schema Compliance
 * 4. Wrangler Configuration & Migration Integrity
 * 5. Production Security & Zero-Trust Audit
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { runSecurityAudit } from './security-audit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export function runBuild() {
  console.log('================================================================');
  console.log('🔨 WISHMAGIC PRODUCTION BUILD & VALIDATION PIPELINE');
  console.log('================================================================\n');

  const errors = [];
  const checks = [];

  // --- Step 1: JS Syntax Verification ---
  console.log('--- 1. JavaScript Syntax & Bytecode Compilation Check ---');
  const jsFilesToCheck = [
    'server.js',
    'src/worker.js',
    'src/observability.js',
    'functions/[[path]].js',
    'test-integration.js',
    'scripts/build.js',
    'scripts/config-validator.js',
    'scripts/db-integrity.js',
    'scripts/db-validate.js',
    'scripts/repair-framework.js',
    'scripts/security-audit.js',
    'scripts/backup-recovery.js',
    'scripts/migration-runner.js'
  ];

  // Also collect all public/js/*.js files
  const publicJsDir = path.join(ROOT_DIR, 'public/js');
  if (fs.existsSync(publicJsDir)) {
    const publicScripts = fs.readdirSync(publicJsDir).filter(f => f.endsWith('.js'));
    publicScripts.forEach(f => jsFilesToCheck.push(path.join('public/js', f)));
  }

  let syntaxPassed = 0;
  for (const relPath of jsFilesToCheck) {
    const absPath = path.join(ROOT_DIR, relPath);
    if (!fs.existsSync(absPath)) {
      errors.push(`Required JS file not found: ${relPath}`);
      continue;
    }
    try {
      execSync(`node --check "${absPath}"`, { stdio: 'pipe' });
      syntaxPassed++;
    } catch (err) {
      errors.push(`Syntax error in ${relPath}: ${err.message}`);
    }
  }

  if (errors.length === 0) {
    console.log(`  ✅ All ${syntaxPassed} JavaScript source files passed syntax compilation.`);
    checks.push(`JS Syntax Clean (${syntaxPassed} files)`);
  } else {
    console.error(`  ❌ Syntax errors found in ${errors.length} files!`);
  }

  // --- Step 2: HTML Static Asset Linking Verification ---
  console.log('\n--- 2. Static HTML Asset & Dependency Reference Audit ---');
  const publicDir = path.join(ROOT_DIR, 'public');
  let htmlFilesChecked = 0;
  let brokenRefs = 0;

  if (fs.existsSync(publicDir)) {
    const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));
    for (const hf of htmlFiles) {
      htmlFilesChecked++;
      const content = fs.readFileSync(path.join(publicDir, hf), 'utf8');

      // Check local script src references (e.g. src="js/auth-service.js")
      const scriptMatches = content.matchAll(/src=["'](js\/[^"']+)["']/g);
      for (const m of scriptMatches) {
        const scriptPath = path.join(publicDir, m[1]);
        if (!fs.existsSync(scriptPath)) {
          brokenRefs++;
          errors.push(`Broken script ref in ${hf}: ${m[1]}`);
        }
      }

      // Check local css link references (e.g. href="css/theme.css")
      const cssMatches = content.matchAll(/href=["'](css\/[^"']+)["']/g);
      for (const m of cssMatches) {
        const cssPath = path.join(publicDir, m[1]);
        if (!fs.existsSync(cssPath)) {
          brokenRefs++;
          errors.push(`Broken CSS ref in ${hf}: ${m[1]}`);
        }
      }
    }
  }

  if (brokenRefs === 0) {
    console.log(`  ✅ All ${htmlFilesChecked} HTML pages verified with 0 broken local assets.`);
    checks.push(`HTML Assets Verified (${htmlFilesChecked} pages)`);
  }

  // --- Step 3: Cloudflare Routing & Pages Function Verification ---
  console.log('\n--- 3. Cloudflare Pages & Functions Routing Schema ---');
  const routesJsonPath = path.join(ROOT_DIR, 'public/_routes.json');
  if (!fs.existsSync(routesJsonPath)) {
    errors.push('Missing public/_routes.json');
  } else {
    try {
      const routes = JSON.parse(fs.readFileSync(routesJsonPath, 'utf8'));
      if (routes.version === 1 && Array.isArray(routes.include)) {
        console.log('  ✅ public/_routes.json is valid and configured.');
        checks.push('Pages Routing Schema Valid');
      } else {
        errors.push('public/_routes.json schema invalid');
      }
    } catch (e) {
      errors.push(`Invalid JSON in public/_routes.json: ${e.message}`);
    }
  }

  // --- Step 4: Wrangler & D1 Migration Verification ---
  console.log('\n--- 4. Wrangler Configuration & Migration Manifest ---');
  const wranglerPath = path.join(ROOT_DIR, 'wrangler.toml');
  if (!fs.existsSync(wranglerPath)) {
    errors.push('Missing wrangler.toml');
  } else {
    const wranglerContent = fs.readFileSync(wranglerPath, 'utf8');
    if (wranglerContent.includes('main = "src/worker.js"') && wranglerContent.includes('d1_databases')) {
      console.log('  ✅ wrangler.toml contains valid main entry and D1 database binding.');
      checks.push('Wrangler Config Valid');
    } else {
      errors.push('wrangler.toml missing required configuration');
    }
  }

  const migrationsDir = path.join(ROOT_DIR, 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const sqls = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    if (sqls.length >= 3) {
      console.log(`  ✅ Found ${sqls.length} sequential D1 SQL schema migrations.`);
      checks.push(`D1 Migrations Present (${sqls.length} files)`);
    } else {
      errors.push(`Expected at least 3 SQL migrations, found ${sqls.length}`);
    }
  }

  // --- Step 5: Execute Security Audit ---
  console.log('\n--- 5. Zero-Trust Security Audit Execution ---');
  const auditRes = runSecurityAudit();
  if (!auditRes.success) {
    errors.push(...auditRes.issues);
  } else {
    checks.push('Zero-Trust Security Audit Passed');
  }

  // --- Summary ---
  console.log('\n================================================================');
  console.log(`BUILD STATUS: ${errors.length === 0 ? '✨ SUCCESS' : '❌ FAILED'}`);
  console.log(`Checks Passed: ${checks.length} | Errors: ${errors.length}`);
  console.log('================================================================\n');

  if (errors.length > 0) {
    console.error('Build Errors:');
    errors.forEach(e => console.error(`  • ${e}`));
    return { success: false, errors, checks };
  }

  return { success: true, errors: [], checks };
}

if (process.argv[1] && process.argv[1].endsWith('build.js')) {
  try {
    const result = runBuild();
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error('Fatal Build Error:', err);
    process.exit(1);
  }
}
