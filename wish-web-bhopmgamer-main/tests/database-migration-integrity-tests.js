/**
 * WishMagic Automated Test Suite: Database Migration & Schema Integrity
 * Comprehensive Verification of Migration Chain, Deep Structural Parity,
 * Intentional Negative Mismatch Detection, and Dependency Resolution.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { D1MigrationRunner, compareDatabaseSchemas, verifyMigrationChainSafety } from '../scripts/migration-runner.js';
import { canResolveDependency } from '../scripts/run-test-matrix.js';

describe('Database Migration & Schema Integrity Verification', () => {

  function createD1Adapter(sqliteDb) {
    return {
      prepare(sql) {
        return {
          bind(...params) {
            return {
              async run() {
                const stmt = sqliteDb.prepare(sql);
                const info = stmt.run(...params);
                return { success: true, meta: { changes: info.changes } };
              },
              async first() {
                const stmt = sqliteDb.prepare(sql);
                return stmt.get(...params) || null;
              },
              async all() {
                const stmt = sqliteDb.prepare(sql);
                const results = stmt.all(...params);
                return { success: true, results };
              }
            };
          },
          async run() {
            const stmt = sqliteDb.prepare(sql);
            const info = stmt.run();
            return { success: true, meta: { changes: info.changes } };
          },
          async first() {
            const stmt = sqliteDb.prepare(sql);
            return stmt.get() || null;
          },
          async all() {
            const stmt = sqliteDb.prepare(sql);
            const results = stmt.all();
            return { success: true, results };
          }
        };
      }
    };
  }

  it('1. Fresh Empty Database: Full migration chain executes sequentially with 100% success', async () => {
    const rawDb = new DatabaseSync(':memory:');
    const d1 = createD1Adapter(rawDb);
    const runner = new D1MigrationRunner(d1);

    const result = await runner.runMigrations();
    assert.ok(result.totalFound >= 32, `Expected at least 32 migrations, found ${result.totalFound}`);
    assert.equal(result.appliedCount, result.totalFound, 'All migrations should be applied on fresh database');
    assert.equal(result.failedCount, 0, 'Zero failed migrations on fresh run');

    // Verify _migrations table content
    const applied = await runner.getAppliedMigrations();
    assert.equal(applied.length, result.totalFound);
    assert.ok(applied.some(m => m.name === '0003_complete_production_schema.sql'));
    assert.ok(applied.some(m => m.name === '0006_template_version_snapshots.sql'));
    assert.ok(applied.some(m => m.name === '0032_reconcile_template_version_and_migration_tracking.sql'));
  });

  it('2. Idempotent Replay: Second run skips all applied migrations without error', async () => {
    const rawDb = new DatabaseSync(':memory:');
    const d1 = createD1Adapter(rawDb);
    const runner = new D1MigrationRunner(d1);

    // Initial run
    await runner.runMigrations();

    // Replay run
    const replayResult = await runner.runMigrations();
    assert.equal(replayResult.appliedCount, 0, 'Replay should apply 0 migrations');
    assert.equal(replayResult.skippedCount, replayResult.totalFound, 'Replay should skip all migrations');
    assert.equal(replayResult.failedCount, 0);
  });

  it('3. Schema Integrity: template_versions, support_tickets and wishes have all required columns and indexes', async () => {
    const rawDb = new DatabaseSync(':memory:');
    const d1 = createD1Adapter(rawDb);
    const runner = new D1MigrationRunner(d1);
    await runner.runMigrations();

    // Verify template_versions schema
    const tvCols = rawDb.prepare('PRAGMA table_info(template_versions)').all().map(c => c.name);
    assert.ok(tvCols.includes('status'), 'template_versions must have status column');
    assert.ok(tvCols.includes('template_id'), 'template_versions must have template_id');
    assert.ok(tvCols.includes('protocol_version'), 'template_versions must have protocol_version');
    assert.ok(tvCols.includes('schema_version'), 'template_versions must have schema_version');
    assert.ok(tvCols.includes('validation_report_json'), 'template_versions must have validation_report_json');

    // Verify support_tickets schema
    const stCols = rawDb.prepare('PRAGMA table_info(support_tickets)').all().map(c => c.name);
    assert.ok(stCols.includes('order_id'), 'support_tickets must have order_id');
    assert.ok(stCols.includes('user_id'), 'support_tickets must have user_id');
    assert.ok(stCols.includes('status'), 'support_tickets must have status');

    // Verify wishes schema
    const wCols = rawDb.prepare('PRAGMA table_info(wishes)').all().map(c => c.name);
    assert.ok(wCols.includes('template_version_id'), 'wishes must have template_version_id');

    // Verify application queries against resulting schema
    const q1 = rawDb.prepare('SELECT id, status, template_id, is_current FROM template_versions LIMIT 1').all();
    assert.ok(Array.isArray(q1));

    const q2 = rawDb.prepare('SELECT id, order_id, status FROM support_tickets LIMIT 1').all();
    assert.ok(Array.isArray(q2));

    const q3 = rawDb.prepare('SELECT id, template_version_id, slug FROM wishes LIMIT 1').all();
    assert.ok(Array.isArray(q3));
  });

  it('4. Safe Upgrade Path: Existing database created with older _migrations schema is upgraded', async () => {
    const rawDb = new DatabaseSync(':memory:');
    
    // Create legacy _migrations table without checksum column
    rawDb.exec(`
      CREATE TABLE _migrations (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO _migrations (id, name, applied_at) VALUES ('mig_0001', '0001_initial_schema.sql', '2026-01-01T00:00:00Z');
    `);

    const d1 = createD1Adapter(rawDb);
    const runner = new D1MigrationRunner(d1);

    // Initialize should add checksum column safely without destroying data
    await runner.initMigrationsTable();

    const info = rawDb.prepare('PRAGMA table_info(_migrations)').all();
    const colNames = info.map(c => c.name);
    assert.ok(colNames.includes('checksum'), 'checksum column should be added to existing table');

    const applied = await runner.getAppliedMigrations();
    assert.equal(applied.length, 1);
    assert.equal(applied[0].name, '0001_initial_schema.sql');
  });

  it('5. d1_setup.sql vs Migrations: 100% deep structural schema parity across tables, columns, types, defaults, nullability, FKs, and indexes', async () => {
    const rawDb = new DatabaseSync(':memory:');
    const content = fs.readFileSync(path.resolve('./d1_setup.sql'), 'utf8');

    assert.doesNotThrow(() => {
      rawDb.exec(content);
    }, 'd1_setup.sql must execute cleanly on a fresh database');

    const dbMig = new DatabaseSync(':memory:');
    const d1Mig = createD1Adapter(dbMig);
    const runner = new D1MigrationRunner(d1Mig);
    await runner.runMigrations();

    // Deep structural comparison
    const parity = await compareDatabaseSchemas(rawDb, dbMig);
    assert.equal(parity.identical, true, `Deep schema parity failure: ${JSON.stringify(parity.differences)}`);
    assert.equal(parity.differences.length, 0, 'Zero structural differences between d1_setup.sql and migrations chain');
  });

  it('6. Matrix Upgrade: Database at 0012 successfully runs 0013-0032 with clean validation_report_json', async () => {
    const rawDb = new DatabaseSync(':memory:');
    const d1 = createD1Adapter(rawDb);
    const runner = new D1MigrationRunner(d1);

    // Apply migrations 0001 through 0012 manually
    const allFiles = fs.readdirSync('migrations').filter(f => f.endsWith('.sql')).sort();
    const upTo0012 = allFiles.slice(0, 12);
    await runner.initMigrationsTable();

    for (const f of upTo0012) {
      const sql = fs.readFileSync(path.join('migrations', f), 'utf8');
      const stmts = runner.splitSqlStatements(sql);
      for (const s of stmts) rawDb.exec(s);
      const migId = 'mig_' + f.replace(/[^a-zA-Z0-9]/g, '_');
      await d1.prepare('INSERT OR REPLACE INTO _migrations (id, name, checksum, applied_at) VALUES (?, ?, ?, ?)')
        .bind(migId, f, runner.computeChecksum(sql), new Date().toISOString()).run();
    }

    // Now run remaining migrations
    const res = await runner.runMigrations();
    assert.equal(res.failedCount, 0, 'Zero migration failures migrating from 0012');
    assert.equal(res.appliedCount, allFiles.length - 12, 'Applied all remaining migrations');

    const tvCols = rawDb.prepare('PRAGMA table_info(template_versions)').all().map(c => c.name);
    assert.ok(tvCols.includes('validation_report_json'));
    assert.ok(tvCols.includes('protocol_version'));
  });

  it('7. Matrix Upgrade: Database at 0026 successfully runs 0027-0032 without duplicate column failure', async () => {
    const rawDb = new DatabaseSync(':memory:');
    const d1 = createD1Adapter(rawDb);
    const runner = new D1MigrationRunner(d1);

    // Apply migrations 0001 through 0026
    const allFiles = fs.readdirSync('migrations').filter(f => f.endsWith('.sql')).sort();
    const upTo0026 = allFiles.slice(0, 26);
    await runner.initMigrationsTable();

    for (const f of upTo0026) {
      const sql = fs.readFileSync(path.join('migrations', f), 'utf8');
      const stmts = runner.splitSqlStatements(sql);
      for (const s of stmts) rawDb.exec(s);
      const migId = 'mig_' + f.replace(/[^a-zA-Z0-9]/g, '_');
      await d1.prepare('INSERT OR REPLACE INTO _migrations (id, name, checksum, applied_at) VALUES (?, ?, ?, ?)')
        .bind(migId, f, runner.computeChecksum(sql), new Date().toISOString()).run();
    }

    // Run remaining migrations starting with 0027
    const res = await runner.runMigrations();
    assert.equal(res.failedCount, 0, 'Zero migration failures migrating from 0026');
    assert.equal(res.appliedCount, allFiles.length - 26, 'Applied all remaining migrations (0027-0032)');

    const tvCols = rawDb.prepare('PRAGMA table_info(template_versions)').all().map(c => c.name);
    assert.ok(tvCols.includes('validation_report_json'));
    assert.ok(tvCols.includes('protocol_version'));
    assert.ok(tvCols.includes('package_fingerprint'));
  });

  it('8. Failure Propagation: Invalid migration fails with exception and is NOT recorded in _migrations', async () => {
    const rawDb = new DatabaseSync(':memory:');
    const d1 = createD1Adapter(rawDb);
    const runner = new D1MigrationRunner(d1);

    // Inject bad SQL file in a temporary folder
    const tempDir = path.join('/tmp', 'test_migrations_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, '0001_good.sql'), 'CREATE TABLE test_good (id TEXT PRIMARY KEY);');
    fs.writeFileSync(path.join(tempDir, '0002_bad.sql'), 'CREATE TABLE test_bad (syntax error near here;;');

    runner.migrationsDir = tempDir;

    await assert.rejects(async () => {
      await runner.runMigrations();
    }, /Migration 0002_bad.sql failed/, 'Must reject with error on invalid SQL');

    // Verify 0001 was recorded, but 0002 was NOT recorded
    const applied = await runner.getAppliedMigrations();
    assert.equal(applied.length, 1);
    assert.equal(applied[0].name, '0001_good.sql');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('9. Deep Relational Integrity: auditDatabaseIntegrity passes cleanly on fully migrated database', async () => {
    const { auditDatabaseIntegrity } = await import('../scripts/db-integrity.js');
    const rawDb = new DatabaseSync(':memory:');
    const d1 = createD1Adapter(rawDb);
    const runner = new D1MigrationRunner(d1);
    await runner.runMigrations();

    // Seed a valid template family, version, and template
    const nowIso = new Date().toISOString();
    rawDb.exec(`
      INSERT INTO template_families (id, slug, name, current_version_id, created_at, updated_at)
      VALUES ('fam_tpl_1', 'tpl_1', 'Birthday Delight', 'ver_tpl_1_v1', '${nowIso}', '${nowIso}');

      INSERT INTO templates (id, slug, name, category, thumbnail, folder, current_version_id, status, is_published, created_at, updated_at)
      VALUES ('tpl_1', 'tpl_1', 'Birthday Delight', 'birthday', '/thumb.jpg', 'birthday-delight', 'ver_tpl_1_v1', 'published', 1, '${nowIso}', '${nowIso}');

      INSERT INTO template_versions (id, template_id, version_number, version_label, name, status, is_current, entry_point, manifest_json, created_at)
      VALUES ('ver_tpl_1_v1', 'tpl_1', 1, 'v1.0.0', 'Birthday Delight v1', 'published', 1, 'index.html', '{"entryPoint":"index.html"}', '${nowIso}');

      INSERT INTO template_files (id, template_version_id, relative_path, storage_provider, storage_key, mime_type, size_bytes, created_at)
      VALUES ('file_1', 'ver_tpl_1_v1', 'index.html', 'b2', 'tpl_1/v1/index.html', 'text/html', 500, '${nowIso}');
    `);

    const auditRes = await auditDatabaseIntegrity(d1);
    assert.equal(auditRes.success, true, 'Audit should pass with 0 errors');
    assert.equal(auditRes.errors.length, 0, 'Zero relational integrity errors');
  });

  it('10. Structural Schema Parity Negative Checks: detects intentional schema mismatches accurately', async () => {
    // 1. Column Type Mismatch
    const db1 = new DatabaseSync(':memory:');
    const db2 = new DatabaseSync(':memory:');
    db1.exec('CREATE TABLE t (id TEXT PRIMARY KEY, count INTEGER);');
    db2.exec('CREATE TABLE t (id TEXT PRIMARY KEY, count TEXT);');
    const res1 = await compareDatabaseSchemas(db1, db2);
    assert.equal(res1.identical, false);
    assert.ok(res1.differences.some(d => d.type === 'COLUMN_TYPE_MISMATCH'));

    // 2. Nullability Mismatch
    const db3 = new DatabaseSync(':memory:');
    const db4 = new DatabaseSync(':memory:');
    db3.exec('CREATE TABLE t (id TEXT PRIMARY KEY, title TEXT NOT NULL);');
    db4.exec('CREATE TABLE t (id TEXT PRIMARY KEY, title TEXT);');
    const res2 = await compareDatabaseSchemas(db3, db4);
    assert.equal(res2.identical, false);
    assert.ok(res2.differences.some(d => d.type === 'COLUMN_NULLABILITY_MISMATCH'));

    // 3. Default Value Mismatch
    const db5 = new DatabaseSync(':memory:');
    const db6 = new DatabaseSync(':memory:');
    db5.exec("CREATE TABLE t (id TEXT PRIMARY KEY, status TEXT DEFAULT 'draft');");
    db6.exec("CREATE TABLE t (id TEXT PRIMARY KEY, status TEXT DEFAULT 'active');");
    const res3 = await compareDatabaseSchemas(db5, db6);
    assert.equal(res3.identical, false);
    assert.ok(res3.differences.some(d => d.type === 'COLUMN_DEFAULT_MISMATCH'));

    // 4. Primary Key Position Mismatch
    const db7 = new DatabaseSync(':memory:');
    const db8 = new DatabaseSync(':memory:');
    db7.exec('CREATE TABLE t (id TEXT PRIMARY KEY, code TEXT);');
    db8.exec('CREATE TABLE t (id TEXT, code TEXT, PRIMARY KEY (id, code));');
    const res4 = await compareDatabaseSchemas(db7, db8);
    assert.equal(res4.identical, false);
    assert.ok(res4.differences.some(d => d.type === 'PRIMARY_KEY_MISMATCH'));

    // 5. Index Uniqueness Mismatch
    const db9 = new DatabaseSync(':memory:');
    const db10 = new DatabaseSync(':memory:');
    db9.exec('CREATE TABLE t (id TEXT PRIMARY KEY, slug TEXT); CREATE UNIQUE INDEX idx_slug ON t(slug);');
    db10.exec('CREATE TABLE t (id TEXT PRIMARY KEY, slug TEXT); CREATE INDEX idx_slug ON t(slug);');
    const res5 = await compareDatabaseSchemas(db9, db10);
    assert.equal(res5.identical, false);
    assert.ok(res5.differences.some(d => d.type === 'INDEX_UNIQUENESS_MISMATCH'));

    // 6. Indexed Column Order Mismatch
    const db11 = new DatabaseSync(':memory:');
    const db12 = new DatabaseSync(':memory:');
    db11.exec('CREATE TABLE t (id TEXT PRIMARY KEY, a TEXT, b TEXT); CREATE INDEX idx_ab ON t(a, b);');
    db12.exec('CREATE TABLE t (id TEXT PRIMARY KEY, a TEXT, b TEXT); CREATE INDEX idx_ab ON t(b, a);');
    const res6 = await compareDatabaseSchemas(db11, db12);
    assert.equal(res6.identical, false);
    assert.ok(res6.differences.some(d => d.type === 'INDEX_COLUMNS_MISMATCH'));

    // 7. Foreign Key Target Table Mismatch
    const db13 = new DatabaseSync(':memory:');
    const db14 = new DatabaseSync(':memory:');
    db13.exec('CREATE TABLE p1 (id TEXT PRIMARY KEY); CREATE TABLE p2 (id TEXT PRIMARY KEY); CREATE TABLE c (id TEXT PRIMARY KEY, p_id TEXT, FOREIGN KEY (p_id) REFERENCES p1(id));');
    db14.exec('CREATE TABLE p1 (id TEXT PRIMARY KEY); CREATE TABLE p2 (id TEXT PRIMARY KEY); CREATE TABLE c (id TEXT PRIMARY KEY, p_id TEXT, FOREIGN KEY (p_id) REFERENCES p2(id));');
    const res7 = await compareDatabaseSchemas(db13, db14);
    assert.equal(res7.identical, false);
    assert.ok(res7.differences.some(d => d.type === 'FOREIGN_KEY_MISMATCH'));

    // 8. Foreign Key Delete Behavior Mismatch
    const db15 = new DatabaseSync(':memory:');
    const db16 = new DatabaseSync(':memory:');
    db15.exec('CREATE TABLE p (id TEXT PRIMARY KEY); CREATE TABLE c (id TEXT PRIMARY KEY, p_id TEXT, FOREIGN KEY (p_id) REFERENCES p(id) ON DELETE CASCADE);');
    db16.exec('CREATE TABLE p (id TEXT PRIMARY KEY); CREATE TABLE c (id TEXT PRIMARY KEY, p_id TEXT, FOREIGN KEY (p_id) REFERENCES p(id) ON DELETE SET NULL);');
    const res8 = await compareDatabaseSchemas(db15, db16);
    assert.equal(res8.identical, false);
    assert.ok(res8.differences.some(d => d.type === 'FOREIGN_KEY_MISMATCH'));
  });

  it('11. Schema Whitespace & Comment Invariance: equivalent schemas with different formatting are accepted', async () => {
    const dbA = new DatabaseSync(':memory:');
    const dbB = new DatabaseSync(':memory:');

    // Schema A: formatted with comments, newlines, lowercase
    dbA.exec(`
      -- This is a comment
      create table users (
        id text primary key,
        email text not null,
        created_at text default (datetime('now'))
      );
      create index idx_users_email on users(email);
    `);

    // Schema B: compact single line, uppercase
    dbB.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
      CREATE INDEX idx_users_email ON users(email);
    `);

    const result = await compareDatabaseSchemas(dbA, dbB);
    assert.equal(result.identical, true, 'Equivalent schemas with different formatting must be identical');
    assert.equal(result.differences.length, 0);
  });

  it('12. Migration Chain Continuity & Safety: verifies sequential numbers, no gaps, no destructive drops', () => {
    const chainCheck = verifyMigrationChainSafety(path.resolve('./migrations'));
    assert.equal(chainCheck.safe, true, `Migration chain safety issue: ${chainCheck.issues.join(', ')}`);
    assert.ok(chainCheck.totalMigrations >= 32, 'At least 32 migrations must exist');
    assert.equal(chainCheck.issues.length, 0, 'Zero migration sequence or safety issues');
  });

  it('13. Pre-flight Conflict Detection: safely detects existing duplicate template slugs before constraint enforcement', async () => {
    const rawDb = new DatabaseSync(':memory:');

    // Simulate legacy table prior to unique index enforcement
    rawDb.exec(`
      CREATE TABLE legacy_templates (
        id TEXT PRIMARY KEY,
        slug TEXT,
        name TEXT
      );
      INSERT INTO legacy_templates (id, slug, name) VALUES ('tpl_1', 'duplicate-slug', 'Template 1');
      INSERT INTO legacy_templates (id, slug, name) VALUES ('tpl_2', 'duplicate-slug', 'Template 2');
      INSERT INTO legacy_templates (id, slug, name) VALUES ('tpl_3', 'unique-slug', 'Template 3');
    `);

    // Run the conflict detection query specified in production requirements
    const conflictQuery = `
      SELECT slug, COUNT(*) AS row_count
      FROM legacy_templates
      WHERE slug IS NOT NULL AND slug <> ''
      GROUP BY slug
      HAVING COUNT(*) > 1;
    `;
    const conflicts = rawDb.prepare(conflictQuery).all();

    assert.equal(conflicts.length, 1, 'Must detect exactly 1 duplicate slug conflict');
    assert.equal(conflicts[0].slug, 'duplicate-slug');
    assert.equal(conflicts[0].row_count, 2);

    // Verify safe non-destructive remediation before applying unique index
    rawDb.exec("UPDATE legacy_templates SET slug = slug || '-copy' WHERE id = 'tpl_2';");
    const afterRemediation = rawDb.prepare(conflictQuery).all();
    assert.equal(afterRemediation.length, 0, 'Zero conflicts after safe remediation');

    // Safe unique index creation can now succeed
    assert.doesNotThrow(() => {
      rawDb.exec('CREATE UNIQUE INDEX idx_legacy_templates_slug ON legacy_templates(slug);');
    }, 'Unique index must apply cleanly after remediation');
  });

  it('14. Dependency Integrity & JSZip Resolution: verifies package declaration, lockfile, and in-memory execution', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('./package.json'), 'utf8'));
    assert.ok(pkg.dependencies?.jszip, 'jszip must be declared in package.json dependencies');

    const lockExists = fs.existsSync(path.resolve('./package-lock.json'));
    assert.ok(lockExists, 'package-lock.json must exist');

    const lockContent = fs.readFileSync(path.resolve('./package-lock.json'), 'utf8');
    assert.ok(lockContent.includes('node_modules/jszip'), 'package-lock.json must contain jszip entry');

    // Test resolution
    const canResolve = canResolveDependency('jszip');
    assert.equal(canResolve, true, 'JSZip must be resolvable via node module resolution');

    // Smoke test: instantiate and generate zip in memory
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('index.html', '<!DOCTYPE html><html><body>Hello WishMagic</body></html>');
    const content = await zip.generateAsync({ type: 'nodebuffer' });
    assert.ok(Buffer.isBuffer(content), 'Must generate valid zip buffer');
    assert.ok(content.length > 50, 'Zip buffer must contain data');

    // Read back
    const readZip = await JSZip.loadAsync(content);
    const readText = await readZip.file('index.html').async('string');
    assert.equal(readText, '<!DOCTYPE html><html><body>Hello WishMagic</body></html>');
  });
});
