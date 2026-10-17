/**
 * WishMagic D1 Migration Runner & Verification Engine
 * Part 29: Production Release Candidate, Data Migration, Backup & Recovery
 * 
 * Capabilities:
 * - Bootstraps fresh database from empty state
 * - Executes migrations sequentially in deterministic order
 * - Tracks applied migrations in `_migrations` table
 * - Idempotent replay: skips already applied migrations without error
 * - Detects migration failure and reports exact failure points
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'migrations');
const CANONICAL_MIGRATION_FILES = ["0001_initial_schema.sql","0002_seed_templates.sql","0003_complete_production_schema.sql","0004_admin_staff_and_audit_logs.sql","0005_site_settings.sql","0006_template_version_snapshots.sql","0007_part19_final_d1_schema_and_mappings.sql","0008_part20_b2_template_storage.sql","0009_part21_imgbb_image_storage.sql","0010_part25_published_wish_snapshots.sql","0011_part26_wish_lifecycle_and_favorites.sql","0012_part27_template_family_variants.sql","0013_part28_template_version_management.sql","0014_part29_storage_health_and_orphan_cleanup.sql","0015_part30_admin_operations_and_moderation.sql","0016_part31_enterprise_notifications.sql","0017_part32_payment_commerce_engine.sql","0018_part33_analytics_bi_engine.sql","0019_part34_customer_support_and_help_center.sql","0020_part35_account_privacy_security_management.sql","0021_part36_referral_rewards_and_fraud_prevention.sql","0022_part37_account_lifecycle_and_retention.sql","0023_part38_legal_and_compliance_center.sql","0024_part39_global_search_and_discovery_analytics.sql","0025_part41_b2_music_and_audio_storage.sql","0026_part42_media_storage_inventory_reconciliation.sql","0027_part2_universal_template_protocol.sql","0028_part3_template_ingestion_operations.sql","0029_part4_customizer_draft_concurrency.sql","0030_part5_universal_runtime_publishing_immutability.sql","0031_part9_admin_control_center.sql","0032_reconcile_template_version_and_migration_tracking.sql","0033_part8_unique_slug_and_lifecycle_indexes.sql","0034_part9_template_discovery_and_relationship_indexes.sql","0035_part47_content_moderation_system.sql","0036_part48_utp_v1_1_variant_system.sql","0037_part49_utp_v1_2_sections_actions_visibility.sql","0038_part50_smart_template_recognition_and_update_studio.sql"];
export function listMigrationSqlFiles(dir) {
  const set = new Set((fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter(f => f.endsWith('.sql')));
  if (path.resolve(dir) === path.resolve(MIGRATIONS_DIR)) {
    for (const f of CANONICAL_MIGRATION_FILES) {
      if (fs.existsSync(path.join(dir, f))) set.add(f);
    }
  }
  return Array.from(set).sort();
}


export class D1MigrationRunner {
  constructor(db) {
    this.db = db;
    this.migrationsDir = MIGRATIONS_DIR;
  }

  /**
   * Initialize the _migrations table if it doesn't exist
   */
  async initMigrationsTable() {
    if (!this.db || typeof this.db.prepare !== 'function') {
      throw new Error('Invalid D1 database binding');
    }

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        checksum TEXT,
        applied_at TEXT NOT NULL
      )
    `).run();

    // Check if checksum column exists on older installations, add if missing
    try {
      const info = await this.db.prepare('PRAGMA table_info(_migrations)').all();
      const cols = new Set((info?.results || []).map(c => c.name));
      if (!cols.has('checksum')) {
        await this.db.prepare('ALTER TABLE _migrations ADD COLUMN checksum TEXT').run();
      }
    } catch (_) {}
  }

  /**
   * Get all applied migrations from the database
   */
  async getAppliedMigrations() {
    if (!this.db || typeof this.db.prepare !== 'function') {
      throw new Error('Invalid D1 database binding');
    }
    const rows = await this.db.prepare('SELECT name, checksum, applied_at FROM _migrations').all();
    return rows.results || [];
  }

  /**
   * Compute SHA-256 checksum of SQL content
   */
  computeChecksum(content) {
    return crypto.createHash('sha256').update(content.trim()).digest('hex');
  }

  /**
   * Robust SQL Statement Parser: strips comments and splits on semicolons safely
   */
  splitSqlStatements(sqlContent) {
    const statements = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let inLineComment = false;
    let inBlockComment = false;
    const len = sqlContent.length;

    for (let i = 0; i < len; i++) {
      const char = sqlContent[i];
      const nextChar = i + 1 < len ? sqlContent[i + 1] : '';

      if (inLineComment) {
        if (char === '\n' || char === '\r') {
          inLineComment = false;
        }
        continue;
      }

      if (inBlockComment) {
        if (char === '*' && nextChar === '/') {
          inBlockComment = false;
          i++;
        }
        continue;
      }

      if (!inString && char === '-' && nextChar === '-') {
        inLineComment = true;
        i++;
        continue;
      }

      if (!inString && char === '/' && nextChar === '*') {
        inBlockComment = true;
        i++;
        continue;
      }

      if ((char === "'" || char === '"' || char === '`') && !inLineComment && !inBlockComment) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          if (nextChar === stringChar) {
            current += char + nextChar;
            i++;
            continue;
          }
          inString = false;
        }
      }

      if (char === ';' && !inString) {
        const stmt = current.trim();
        if (stmt.length > 0) {
          statements.push(stmt);
        }
        current = '';
        continue;
      }

      current += char;
    }

    const remaining = current.trim();
    if (remaining.length > 0) {
      statements.push(remaining);
    }

    return statements;
  }

  /**
   * Run pending migrations
   */
  async runMigrations(options = {}) {
    await this.initMigrationsTable();
    const appliedRows = await this.getAppliedMigrations();
    const appliedMap = new Map(appliedRows.map(r => [r.name, r]));

    const allFiles = listMigrationSqlFiles(this.migrationsDir);

    const results = {
      totalFound: allFiles.length,
      appliedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      executed: [],
      errors: []
    };

    for (const file of allFiles) {
      const filePath = path.join(this.migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');
      const checksum = this.computeChecksum(sqlContent);

      if (appliedMap.has(file)) {
        const existing = appliedMap.get(file);
        if (existing.checksum && existing.checksum !== checksum) {
          console.warn(`[Migration Warning] Checksum mismatch for previously applied migration "${file}".`);
        }
        results.skippedCount++;
        continue;
      }

      try {
        if (options.dryRun) {
          results.executed.push({ file, status: 'DRY_RUN_SUCCESS', checksum });
          results.appliedCount++;
          continue;
        }

        const statements = this.splitSqlStatements(sqlContent);
        for (const statement of statements) {
          try {
            await this.db.prepare(statement).run();
          } catch (stmtErr) {
            // Strict verified schema exception: only allow duplicate column error if and only if
            // the column was verified to actually exist in the target table schema.
            const alterMatch = statement.match(/ALTER\s+TABLE\s+([a-zA-Z0-9_]+)\s+ADD\s+COLUMN\s+([a-zA-Z0-9_]+)/i);
            if (alterMatch && /duplicate column name/i.test(stmtErr.message)) {
              const tableName = alterMatch[1];
              const colName = alterMatch[2];
              try {
                const info = await this.db.prepare(`PRAGMA table_info(${tableName})`).all();
                const existingCols = new Set((info?.results || []).map(c => c.name.toLowerCase()));
                if (existingCols.has(colName.toLowerCase())) {
                  console.warn(`[Migration Notice] Verified column "${colName}" already exists on table "${tableName}" - safe verified idempotent schema state in ${file}.`);
                  continue;
                }
              } catch (_) {}
            }
            // Strict: Do NOT suppress other errors indiscriminately.
            throw stmtErr;
          }
        }

        const nowIso = new Date().toISOString();
        const migId = 'mig_' + file.replace(/[^a-zA-Z0-9]/g, '_');
        await this.db.prepare(
          'INSERT OR REPLACE INTO _migrations (id, name, checksum, applied_at) VALUES (?, ?, ?, ?)'
        ).bind(migId, file, checksum, nowIso).run();

        results.appliedCount++;
        results.executed.push({ file, status: 'APPLIED', checksum, appliedAt: nowIso });
      } catch (err) {
        results.failedCount++;
        results.errors.push({ file, error: err.message });
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }

    return results;
  }
}

async function executeAll(db, sql) {
  if (typeof db.prepare === 'function') {
    const stmt = db.prepare(sql);
    let res = typeof stmt.all === 'function' ? stmt.all() : null;
    if (res && typeof res.then === 'function') {
      res = await res;
    }
    if (res && Array.isArray(res.results)) return res.results;
    if (Array.isArray(res)) return res;
  }
  return [];
}

/**
 * Structural Database Schema Parity Verifier
 * Deeply compares two SQLite/D1 database schemas:
 * - Table presence
 * - Column names, types, nullability, defaults, primary key indices
 * - Foreign key relationships and cascade/update rules
 * - Indexes, uniqueness flags, and indexed column sequences
 */
export async function compareDatabaseSchemas(dbA, dbB) {
  const differences = [];

  const rawTablesA = await executeAll(dbA, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'");
  const rawTablesB = await executeAll(dbB, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'");

  const tablesA = rawTablesA.map(t => t.name).sort();
  const tablesB = rawTablesB.map(t => t.name).sort();

  const onlyInA = tablesA.filter(t => !tablesB.includes(t));
  const onlyInB = tablesB.filter(t => !tablesA.includes(t));

  for (const t of onlyInA) {
    differences.push({ type: 'MISSING_TABLE', table: t, message: `Table "${t}" exists in DB A but missing in DB B` });
  }
  for (const t of onlyInB) {
    differences.push({ type: 'EXTRA_TABLE', table: t, message: `Table "${t}" exists in DB B but missing in DB A` });
  }

  const commonTables = tablesA.filter(t => tablesB.includes(t));

  for (const tableName of commonTables) {
    // 1. Column details: PRAGMA table_info
    const colsA = await executeAll(dbA, `PRAGMA table_info(${tableName})`);
    const colsB = await executeAll(dbB, `PRAGMA table_info(${tableName})`);

    const colMapA = new Map(colsA.map(c => [c.name, c]));
    const colMapB = new Map(colsB.map(c => [c.name, c]));

    for (const [colName, colA] of colMapA.entries()) {
      if (!colMapB.has(colName)) {
        differences.push({ type: 'MISSING_COLUMN', table: tableName, column: colName, message: `Column "${colName}" missing in DB B` });
      } else {
        const colB = colMapB.get(colName);
        if ((colA.type || '').toUpperCase() !== (colB.type || '').toUpperCase()) {
          differences.push({
            type: 'COLUMN_TYPE_MISMATCH',
            table: tableName,
            column: colName,
            expected: (colA.type || '').toUpperCase(),
            actual: (colB.type || '').toUpperCase(),
            message: `Column "${colName}" type mismatch: ${colA.type} vs ${colB.type}`
          });
        }
        if (Boolean(colA.notnull) !== Boolean(colB.notnull)) {
          differences.push({
            type: 'COLUMN_NULLABILITY_MISMATCH',
            table: tableName,
            column: colName,
            expected: colA.notnull,
            actual: colB.notnull,
            message: `Column "${colName}" notnull mismatch: ${colA.notnull} vs ${colB.notnull}`
          });
        }
        if (colA.dflt_value !== colB.dflt_value) {
          differences.push({
            type: 'COLUMN_DEFAULT_MISMATCH',
            table: tableName,
            column: colName,
            expected: colA.dflt_value,
            actual: colB.dflt_value,
            message: `Column "${colName}" default mismatch: ${colA.dflt_value} vs ${colB.dflt_value}`
          });
        }
        if (colA.pk !== colB.pk) {
          differences.push({
            type: 'PRIMARY_KEY_MISMATCH',
            table: tableName,
            column: colName,
            expected: colA.pk,
            actual: colB.pk,
            message: `Column "${colName}" pk mismatch: ${colA.pk} vs ${colB.pk}`
          });
        }
      }
    }

    for (const colName of colMapB.keys()) {
      if (!colMapA.has(colName)) {
        differences.push({ type: 'EXTRA_COLUMN', table: tableName, column: colName, message: `Extra column "${colName}" in DB B` });
      }
    }

    // 2. Foreign keys: PRAGMA foreign_key_list
    const fkA = await executeAll(dbA, `PRAGMA foreign_key_list(${tableName})`);
    const fkB = await executeAll(dbB, `PRAGMA foreign_key_list(${tableName})`);

    const fkNormA = fkA.map(f => ({ table: f.table, from: f.from, to: f.to, on_update: f.on_update, on_delete: f.on_delete })).sort((a,b) => (a.from||'').localeCompare(b.from||''));
    const fkNormB = fkB.map(f => ({ table: f.table, from: f.from, to: f.to, on_update: f.on_update, on_delete: f.on_delete })).sort((a,b) => (a.from||'').localeCompare(b.from||''));

    if (JSON.stringify(fkNormA) !== JSON.stringify(fkNormB)) {
      differences.push({
        type: 'FOREIGN_KEY_MISMATCH',
        table: tableName,
        expected: fkNormA,
        actual: fkNormB,
        message: `Foreign key constraint mismatch on table "${tableName}"`
      });
    }

    // 3. Indexes & uniqueness: PRAGMA index_list
    const idxListA = (await executeAll(dbA, `PRAGMA index_list(${tableName})`)).filter(i => !i.name.startsWith('sqlite_autoindex'));
    const idxListB = (await executeAll(dbB, `PRAGMA index_list(${tableName})`)).filter(i => !i.name.startsWith('sqlite_autoindex'));

    const idxMapA = new Map(idxListA.map(i => [i.name, i]));
    const idxMapB = new Map(idxListB.map(i => [i.name, i]));

    for (const [idxName, idxA] of idxMapA.entries()) {
      if (!idxMapB.has(idxName)) {
        differences.push({ type: 'MISSING_INDEX', table: tableName, index: idxName, message: `Index "${idxName}" missing in DB B` });
      } else {
        const idxB = idxMapB.get(idxName);
        if (Boolean(idxA.unique) !== Boolean(idxB.unique)) {
          differences.push({
            type: 'INDEX_UNIQUENESS_MISMATCH',
            table: tableName,
            index: idxName,
            expected: idxA.unique,
            actual: idxB.unique,
            message: `Index "${idxName}" uniqueness mismatch: ${idxA.unique} vs ${idxB.unique}`
          });
        }

        const colsInfoA = (await executeAll(dbA, `PRAGMA index_info(${idxName})`)).map(c => ({ seqno: c.seqno, name: c.name }));
        const colsInfoB = (await executeAll(dbB, `PRAGMA index_info(${idxName})`)).map(c => ({ seqno: c.seqno, name: c.name }));

        if (JSON.stringify(colsInfoA) !== JSON.stringify(colsInfoB)) {
          differences.push({
            type: 'INDEX_COLUMNS_MISMATCH',
            table: tableName,
            index: idxName,
            expected: colsInfoA,
            actual: colsInfoB,
            message: `Index "${idxName}" column sequence mismatch`
          });
        }
      }
    }

    for (const idxName of idxMapB.keys()) {
      if (!idxMapA.has(idxName)) {
        differences.push({ type: 'EXTRA_INDEX', table: tableName, index: idxName, message: `Extra index "${idxName}" in DB B` });
      }
    }
  }

  return {
    identical: differences.length === 0,
    differences
  };
}

/**
 * Migration Chain Continuity & Safety Inspector
 */
export function verifyMigrationChainSafety(migrationsDir = MIGRATIONS_DIR) {
  const issues = [];
  const files = listMigrationSqlFiles(migrationsDir);

  const seqNumbers = [];
  const namesSet = new Set();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (namesSet.has(file)) {
      issues.push(`Duplicate migration filename: ${file}`);
    }
    namesSet.add(file);

    const match = file.match(/^(\d{4})_/);
    if (!match) {
      issues.push(`Migration filename does not follow 4-digit sequence format: ${file}`);
    } else {
      const num = parseInt(match[1], 10);
      seqNumbers.push(num);
    }

    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    // Strip SQL comments (-- and /* */) before checking for executable destructive statements
    const uncommented = content
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    if (/\bDROP\s+TABLE\b/i.test(uncommented) && !uncommented.includes('IF EXISTS _temp_')) {
      issues.push(`Unexpected destructive DROP TABLE operation in ${file}`);
    }
    if (/\bDROP\s+COLUMN\b/i.test(uncommented)) {
      issues.push(`Unexpected destructive DROP COLUMN operation in ${file}`);
    }
  }

  for (let expected = 1; expected <= files.length; expected++) {
    if (!seqNumbers.includes(expected)) {
      issues.push(`Missing sequence entry: ${String(expected).padStart(4, '0')}`);
    }
  }

  return {
    safe: issues.length === 0,
    totalMigrations: files.length,
    issues
  };
}

export function runMigrationCheck(db) {
  console.log('================================================================');
  console.log('🚀 WISHMAGIC D1 MIGRATION RUNNER & VERIFIER');
  console.log('================================================================\n');

  const runner = new D1MigrationRunner(db);
  console.log('  ✅ Migration runner initialized.');
  return runner;
}

if (process.argv[1] && process.argv[1].endsWith('migration-runner.js')) {
  (async () => {
    try {
      const { DatabaseSync, cleanupSqliteBridge } = await import('./sqlite-compat.js');
      const dbFile = process.argv[2] || ':memory:';
      console.log(`Running D1 migrations on SQLite (${dbFile})...`);
      const rawDb = new DatabaseSync(dbFile);
      const adapter = {
        prepare(sql) {
          return {
            bind(...params) {
              return {
                async run() {
                  const stmt = rawDb.prepare(sql);
                  const info = stmt.run(...params);
                  return { success: true, meta: { changes: info.changes } };
                },
                async first() {
                  const stmt = rawDb.prepare(sql);
                  return stmt.get(...params) || null;
                },
                async all() {
                  const stmt = rawDb.prepare(sql);
                  return { success: true, results: stmt.all(...params) };
                }
              };
            },
            async run() {
              const stmt = rawDb.prepare(sql);
              const info = stmt.run();
              return { success: true, meta: { changes: info.changes } };
            },
            async first() {
              const stmt = rawDb.prepare(sql);
              return stmt.get() || null;
            },
            async all() {
              const stmt = rawDb.prepare(sql);
              return { success: true, results: stmt.all() };
            }
          };
        }
      };

      const runner = new D1MigrationRunner(adapter);
      const res = await runner.runMigrations();
      console.log(`✅ Migrations completed successfully: ${res.appliedCount} applied, ${res.skippedCount} skipped, 0 failed.`);
      cleanupSqliteBridge();
      process.exit(0);
    } catch (err) {
      console.error(`❌ Migration runner failed: ${err.message}`);
      process.exit(1);
    }
  })();
}
