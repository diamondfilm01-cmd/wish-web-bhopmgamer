/**
 * WishMagic Automated Test Suite: Database Migration & Schema Integrity
 * Part 8 Fix: Migration Chain, Schema Reconciliation & Idempotent Runner
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { D1MigrationRunner } from '../scripts/migration-runner.js';

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

  it('5. d1_setup.sql: Complete standalone setup script executes cleanly and produces identical table set', async () => {
    const rawDb = new DatabaseSync(':memory:');
    const content = fs.readFileSync(path.resolve('./d1_setup.sql'), 'utf8');

    assert.doesNotThrow(() => {
      rawDb.exec(content);
    }, 'd1_setup.sql must execute cleanly on a fresh database');

    const dbMig = new DatabaseSync(':memory:');
    const d1Mig = createD1Adapter(dbMig);
    const runner = new D1MigrationRunner(d1Mig);
    await runner.runMigrations();

    const tablesSetup = rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name).sort();
    const tablesMig = dbMig.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name).sort();

    assert.equal(tablesSetup.length, tablesMig.length, `Table count mismatch: setup has ${tablesSetup.length}, migrations have ${tablesMig.length}`);
    assert.deepEqual(tablesSetup, tablesMig, 'Table list must be 100% identical');

    // Deep column parity check across all tables
    for (const tableName of tablesSetup) {
      const colsA = rawDb.prepare(`PRAGMA table_info(${tableName})`).all().map(c => c.name);
      const colsB = dbMig.prepare(`PRAGMA table_info(${tableName})`).all().map(c => c.name);
      assert.deepEqual(colsA, colsB, `Columns in table ${tableName} must be identical`);
    }

    // Index parity check
    const idxSetup = rawDb.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name).sort();
    const idxMig = dbMig.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name).sort();
    assert.equal(idxSetup.length, idxMig.length, `Index count mismatch: setup has ${idxSetup.length}, migrations have ${idxMig.length}`);
    assert.deepEqual(idxSetup, idxMig, 'Indexes must be 100% identical');
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
});
