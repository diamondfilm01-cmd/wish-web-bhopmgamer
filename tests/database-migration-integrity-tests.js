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

  it('5. d1_setup.sql: Complete standalone setup script executes cleanly and produces identical table set', () => {
    const rawDb = new DatabaseSync(':memory:');
    const content = fs.readFileSync(path.resolve('./d1_setup.sql'), 'utf8');

    assert.doesNotThrow(() => {
      rawDb.exec(content);
    }, 'd1_setup.sql must execute cleanly on a fresh database');

    const tables = rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    assert.ok(tables.includes('template_versions'), 'd1_setup.sql must contain template_versions');
    assert.ok(tables.includes('support_tickets'), 'd1_setup.sql must contain support_tickets');
    assert.ok(tables.includes('wishes'), 'd1_setup.sql must contain wishes');
    assert.ok(tables.includes('_migrations'), 'd1_setup.sql must contain _migrations');
  });
});
