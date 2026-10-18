/**
 * WishMagic Template Regression Testing & Integrity Engine (Part 6)
 * =================================================================
 * Automated verification system that ensures historical wishes remain functional
 * across template updates, runtime changes, and schema evolutions.
 */

import { evaluateTemplateCompatibility } from './template-compatibility-engine.js';
import { verifyVersionIntegrity } from './template-version-engine.js';
import { B2StorageProvider } from './storage-provider.js';

export const TEST_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  PASSED: 'passed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

/**
 * Executes a full regression test for a specific wish or set of wishes.
 * 
 * @param {Object} params - { db, env, wishIds, templateId, versionId }
 * @returns {Promise<Object>} Test report
 */
export async function executeRegressionTest(params) {
  const { db, env, wishIds = [], templateId = null, versionId = null } = params;
  const results = [];
  const now = new Date().toISOString();

  // 1. Resolve target wishes for testing
  let targetWishes = [];
  if (wishIds.length > 0) {
    const placeholders = wishIds.map(() => '?').join(',');
    const rows = await db.prepare(`SELECT * FROM wishes WHERE id IN (${placeholders})`).bind(...wishIds).all();
    targetWishes = rows.results || [];
  } else if (versionId) {
    const rows = await db.prepare(`SELECT * FROM wishes WHERE template_version_id = ? LIMIT 50`).bind(versionId).all();
    targetWishes = rows.results || [];
  } else if (templateId) {
    const rows = await db.prepare(`SELECT * FROM wishes WHERE template_id = ? LIMIT 50`).bind(templateId).all();
    targetWishes = rows.results || [];
  }

  const b2 = B2StorageProvider.fromEnv(env);

  for (const wish of targetWishes) {
    const wishResult = {
      wishId: wish.id,
      slug: wish.slug,
      status: TEST_STATUS.RUNNING,
      checks: [],
      errors: []
    };

    try {
      // Check 1: Template Version Pinning
      const vId = wish.template_version_id;
      if (!vId) {
        wishResult.errors.push('Wish is not pinned to a specific template version.');
      } else {
        wishResult.checks.push({ name: 'version_pinning', passed: true, details: `Pinned to ${vId}` });
      }

      // Check 2: Version Metadata Integrity
      const versionRow = await db.prepare('SELECT * FROM template_versions WHERE id = ?').bind(vId).first();
      if (!versionRow) {
        wishResult.errors.push(`Pinned template version ${vId} not found in database.`);
      } else {
        wishResult.checks.push({ name: 'version_metadata', passed: true });

        // Check 3: Storage Integrity (existence of critical files)
        try {
          const files = await db.prepare('SELECT * FROM template_files WHERE template_version_id = ?').bind(vId).all();
          const fileList = files.results || [];
          
          if (fileList.length === 0) {
            wishResult.errors.push('No runtime files registered for this version.');
          } else {
            // Sample check for index.html existence in B2
            const entry = fileList.find(f => f.is_entry_file === 1) || fileList[0];
            const head = await b2.headObject({ key: entry.storage_key });
            if (!head.exists) {
              wishResult.errors.push(`Critical runtime file missing from storage: ${entry.relative_path}`);
            } else {
              wishResult.checks.push({ name: 'storage_head', passed: true, details: `${fileList.length} files registered` });
            }
          }
        } catch (e) {
          wishResult.errors.push(`Storage check failed: ${e.message}`);
        }

        // Check 4: Compatibility Check
        const comp = evaluateTemplateCompatibility(versionRow);
        if (!comp.compatible) {
          wishResult.errors.push(`Compatibility failure: ${comp.outcome}`);
        } else {
          wishResult.checks.push({ name: 'compatibility', passed: true });
        }
      }

      wishResult.status = wishResult.errors.length === 0 ? TEST_STATUS.PASSED : TEST_STATUS.FAILED;

    } catch (err) {
      wishResult.status = TEST_STATUS.FAILED;
      wishResult.errors.push(`Unexpected error during regression test: ${err.message}`);
    }

    results.push(wishResult);
  }

  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === TEST_STATUS.PASSED).length,
    failed: results.filter(r => r.status === TEST_STATUS.FAILED).length,
    timestamp: now
  };

  return {
    success: summary.failed === 0,
    summary,
    results
  };
}
