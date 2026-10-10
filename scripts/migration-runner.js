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
      const { DatabaseSync } = await import('node:sqlite');
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
      process.exit(0);
    } catch (err) {
      console.error(`❌ Migration runner failed: ${err.message}`);
      process.exit(1);
    }
  })();
}
