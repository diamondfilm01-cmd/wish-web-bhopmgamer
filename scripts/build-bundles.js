/**
 * WishMagic Frontend JS Bundle Builder
 * Concatenates & minifies multi-script page dependencies into single HTTP bundles
 * using esbuild while preserving exact global execution order and symbols.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT_DIR, 'public/js');
const OUT_DIR = path.join(JS_DIR, 'bundles');

const BUNDLES = {
  'storefront.min.js': [
    'site-theme.js',
    'WishMagicCore.js',
    'api-client.js',
    'firebase-auth.js',
    'auth-service.js',
    'site-tracker.js'
  ],
  'marketplace.min.js': [
    'site-theme.js',
    'WishMagicCore.js',
    'api-client.js',
    'firebase-auth.js',
    'auth-service.js',
    'plan-service.js',
    'entitlement-service.js',
    'feature-access-service.js',
    'payment-service.js',
    'premium-lock-modal.js',
    'search-manager.js'
  ],
  'pricing.min.js': [
    'site-theme.js',
    'WishMagicCore.js',
    'api-client.js',
    'firebase-auth.js',
    'auth-service.js',
    'plan-service.js',
    'entitlement-service.js',
    'feature-access-service.js',
    'payment-service.js',
    'premium-lock-modal.js'
  ],
  'preview.min.js': [
    'WishMagicCore.js',
    'api-client.js',
    'firebase-auth.js',
    'auth-service.js',
    'feature-access-service.js',
    'premium-lock-modal.js',
    'wishmagic-template-protocol.js'
  ],
  'customizer-core.min.js': [
    'site-theme.js',
    'WishMagicCore.js',
    'api-client.js',
    'firebase-auth.js',
    'auth-service.js',
    'wish-link-suggestions.js',
    'repositories.js'
  ],
  'customizer-commerce.min.js': [
    'plan-service.js',
    'entitlement-service.js',
    'feature-access-service.js',
    'payment-service.js',
    'premium-lock-modal.js',
    'template-section-system.js'
  ],
  'customizer-utp-pre.min.js': [
    'wishmagic-template-protocol.js',
    'wishmagic-dependencies.js',
    'wishmagic-content-system.js'
  ],
  'customizer-utp-post.min.js': [
    'wishmagic-template-sandbox.js',
    'wishmagic-runtime-bridge.js'
  ],
  'wish-core.min.js': [
    'site-theme.js',
    'api-client.js',
    'firebase-auth.js',
    'auth-service.js',
    'WishMagicCore.js',
    'theme-engine.js',
    'media-system.js',
    'wish-lifecycle.js',
    'plan-service.js',
    'entitlement-service.js',
    'feature-access-service.js',
    'template-section-system.js',
    'animation-effects-engine.js',
    'public-interaction-engine.js'
  ],
  'admin-uploader.min.js': [
    'admin-template-uploader.js'
  ],
  'admin-extras.min.js': [
    'wish-lifecycle.js',
    'repositories.js',
    'analytics-service.js'
  ]
};

async function buildBundles() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [bundleName, files] of Object.entries(BUNDLES)) {
    let rawBytes = 0;
    const parts = [];
    for (const f of files) {
      const p = path.join(JS_DIR, f);
      const code = fs.readFileSync(p, 'utf8');
      rawBytes += Buffer.byteLength(code);
      parts.push(`;\n${code}\n;`);
    }
    const combined = parts.join('\n');
    const result = await esbuild.transform(combined, {
      loader: 'js',
      legalComments: 'none',
      minifyWhitespace: true,
      minifySyntax: true,
      minifyIdentifiers: false
    });
    const outPath = path.join(OUT_DIR, bundleName);
    fs.writeFileSync(outPath, result.code, 'utf8');
    execSync(`node --check "${outPath}"`, { stdio: 'pipe' });
    const outBytes = Buffer.byteLength(result.code);
    const gzBytes = zlib.gzipSync(result.code).length;
    console.log(
      `  ✅ ${bundleName.padEnd(28)} (${files.length} files): ${Math.round(rawBytes / 1024)}KB -> ${Math.round(outBytes / 1024)}KB raw (${Math.round(gzBytes / 1024)}KB gzip)`
    );
  }
}

buildBundles().catch((err) => {
  console.error('❌ Bundle build failed:', err);
  process.exit(1);
});
