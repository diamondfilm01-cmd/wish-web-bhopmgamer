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
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `).run();
  }

  /**
   * Get all applied migrations from the database
   */
  async getAppliedMigrations() {
    try {
      const rows = await this.db.prepare('SELECT name, checksum, applied_at FROM _migrations ORDER BY id ASC').all();
      return (rows.results || []).map(r => r.name);
    } catch (e) {
      return [];
    }
  }

  /**
   * Compute SHA-256 checksum of SQL content
   */
  computeChecksum(content) {
    return crypto.createHash('sha256').update(content.trim()).digest('hex');
  }

  /**
   * Run pending migrations
   */
  async runMigrations(options = {}) {
    await this.initMigrationsTable();
    const applied = await this.getAppliedMigrations();

    const allFiles = fs.readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const results = {
      totalFound: allFiles.length,
      appliedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      executed: [],
      errors: []
    };

    for (const file of allFiles) {
      if (applied.includes(file)) {
        results.skippedCount++;
        continue;
      }

      const filePath = path.join(this.migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');
      const checksum = this.computeChecksum(sqlContent);

      try {
        if (options.dryRun) {
          results.executed.push({ file, status: 'DRY_RUN_SUCCESS', checksum });
          results.appliedCount++;
          continue;
        }

        // Split SQL statements by semicolon
        const statements = sqlContent
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
          await this.db.prepare(statement).run();
        }

        const nowIso = new Date().toISOString();
        await this.db.prepare(
          'INSERT INTO _migrations (name, checksum, applied_at) VALUES (?, ?, ?)'
        ).bind(file, checksum, nowIso).run();

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

export function runMigrationCheck(db) {
  console.log('================================================================');
  console.log('🚀 WISHMAGIC D1 MIGRATION RUNNER & VERIFIER');
  console.log('================================================================\n');

  const runner = new D1MigrationRunner(db);
  console.log('  ✅ Migration runner initialized.');
  return runner;
}

if (process.argv[1] && process.argv[1].endsWith('migration-runner.js')) {
  console.log('Migration runner loaded as module.');
}
