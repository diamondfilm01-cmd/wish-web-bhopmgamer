/**
 * Cross-Platform Node 18 / 20 / 22+ Compatible DatabaseSync Provider
 * - Uses built-in `node:sqlite` on Node 22.5+
 * - Uses persistent Python `sqlite3` FIFO bridge on Linux/macOS (Node 18/20)
 * - Uses cross-platform Python `sqlite3` temp-DB bridge on Windows (Node 18/20)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, execSync } from 'node:child_process';

let ExportedDatabaseSync = null;
let ExportedCleanup = () => {};

try {
  const mod = await import('node:sqlite');
  ExportedDatabaseSync = mod.DatabaseSync;
} catch (_) {
  const isWindows = process.platform === 'win32';
  const tmpDir = os.tmpdir();
  const uid = `${process.pid}_${Date.now()}`;

  if (!isWindows) {
    const reqFifo = path.join(tmpDir, `wm_sql_req_${uid}`);
    const resFifo = path.join(tmpDir, `wm_sql_res_${uid}`);
    const pyScriptPath = path.join(tmpDir, `wm_sql_daemon_${uid}.py`);

    execSync(`rm -f "${reqFifo}" "${resFifo}" && mkfifo "${reqFifo}" "${resFifo}"`);

    const pyCode = [
      'import sqlite3, json, os, sys',
      `req_path = ${JSON.stringify(reqFifo)}`,
      `res_path = ${JSON.stringify(resFifo)}`,
      'dbs = {}',
      'req_fd = os.open(req_path, os.O_RDWR)',
      'res_fd = os.open(res_path, os.O_RDWR)',
      'req_f = os.fdopen(req_fd, "r", encoding="utf-8")',
      'while True:',
      '    line = req_f.readline()',
      '    if not line:',
      '        break',
      '    line = line.strip()',
      '    if not line:',
      '        continue',
      '    msg = json.loads(line)',
      '    op = msg.get("op")',
      '    if op == "shutdown":',
      '        os.write(res_fd, (json.dumps({"ok": True}) + "\\n").encode("utf-8"))',
      '        break',
      '    db_id = msg.get("dbId")',
      '    try:',
      '        if op == "open":',
      '            conn = sqlite3.connect(msg.get("path", ":memory:"))',
      '            conn.row_factory = sqlite3.Row',
      '            dbs[db_id] = conn',
      '            out = {"ok": True}',
      '        elif op == "exec":',
      '            dbs[db_id].executescript(msg["sql"])',
      '            out = {"ok": True}',
      '        elif op == "run":',
      '            cur = dbs[db_id].execute(msg["sql"], msg.get("params", []))',
      '            dbs[db_id].commit()',
      '            out = {"ok": True, "changes": cur.rowcount if cur.rowcount >= 0 else 0}',
      '        elif op == "get":',
      '            cur = dbs[db_id].execute(msg["sql"], msg.get("params", []))',
      '            row = cur.fetchone()',
      '            out = {"ok": True, "row": dict(row) if row is not None else None}',
      '        elif op == "all":',
      '            cur = dbs[db_id].execute(msg["sql"], msg.get("params", []))',
      '            rows = [dict(r) for r in cur.fetchall()]',
      '            out = {"ok": True, "rows": rows}',
      '        elif op == "close":',
      '            if db_id in dbs:',
      '                dbs[db_id].close()',
      '                del dbs[db_id]',
      '            out = {"ok": True}',
      '    except Exception as e:',
      '        out = {"ok": False, "error": str(e)}',
      '    os.write(res_fd, (json.dumps(out) + "\\n").encode("utf-8"))'
    ].join('\n');

    fs.writeFileSync(pyScriptPath, pyCode, 'utf8');

    const pyProc = spawn('python3', ['-u', pyScriptPath], {
      stdio: 'ignore',
      detached: true
    });
    pyProc.unref();

    const reqFd = fs.openSync(reqFifo, 'r+');
    const resFd = fs.openSync(resFifo, 'r+');
    const readBuf = Buffer.alloc(1024 * 256);
    let closed = false;

    function rpc(payload) {
      if (closed) throw new Error('SQLite bridge is closed');
      fs.writeSync(reqFd, JSON.stringify(payload) + '\n');
      let str = '';
      while (!str.includes('\n')) {
        const n = fs.readSync(resFd, readBuf, 0, readBuf.length, null);
        if (n <= 0) break;
        str += readBuf.subarray(0, n).toString('utf8');
      }
      const parsed = JSON.parse(str.trim());
      if (!parsed.ok) {
        throw new Error(parsed.error || 'SQLite execution failed');
      }
      return parsed;
    }

    ExportedCleanup = () => {
      if (closed) return;
      closed = true;
      try { rpc({ op: 'shutdown' }); } catch (_) {}
      try { fs.closeSync(reqFd); } catch (_) {}
      try { fs.closeSync(resFd); } catch (_) {}
      try { process.kill(pyProc.pid); } catch (_) {}
      try { fs.unlinkSync(reqFifo); } catch (_) {}
      try { fs.unlinkSync(resFifo); } catch (_) {}
      try { fs.unlinkSync(pyScriptPath); } catch (_) {}
    };

    process.on('exit', ExportedCleanup);

    let nextDbId = 1;
    ExportedDatabaseSync = class DatabaseSyncCompat {
      constructor(dbPath = ':memory:') {
        this._dbId = nextDbId++;
        rpc({ op: 'open', dbId: this._dbId, path: dbPath });
      }
      exec(sql) {
        rpc({ op: 'exec', dbId: this._dbId, sql: String(sql) });
      }
      prepare(sql) {
        const dbId = this._dbId;
        const sqlStr = String(sql);
        return {
          run(...params) {
            const res = rpc({ op: 'run', dbId, sql: sqlStr, params });
            return { changes: res.changes || 0 };
          },
          get(...params) {
            const res = rpc({ op: 'get', dbId, sql: sqlStr, params });
            return res.row ?? undefined;
          },
          all(...params) {
            const res = rpc({ op: 'all', dbId, sql: sqlStr, params });
            return res.rows || [];
          }
        };
      }
      close() {
        rpc({ op: 'close', dbId: this._dbId });
      }
    };
  } else {
    // Windows fallback using temp SQLite files & python/python3
    const pyBin = (() => {
      for (const candidate of ['python', 'python3']) {
        const r = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
        if (r.status === 0) return candidate;
      }
      return 'python';
    })();

    const tempFiles = [];
    ExportedCleanup = () => {
      for (const f of tempFiles) {
        try { fs.unlinkSync(f); } catch (_) {}
      }
    };
    process.on('exit', ExportedCleanup);

    let nextWinId = 1;
    ExportedDatabaseSync = class DatabaseSyncWinCompat {
      constructor(dbPath = ':memory:') {
        if (!dbPath || dbPath === ':memory:') {
          this._file = path.join(tmpDir, `wm_win_sqlite_${uid}_${nextWinId++}.db`);
          tempFiles.push(this._file);
        } else {
          this._file = dbPath;
        }
      }
      _callPy(op, sql, params = []) {
        const script = [
          'import sqlite3, json, sys',
          'payload = json.loads(sys.stdin.read())',
          'conn = sqlite3.connect(payload["file"])',
          'conn.row_factory = sqlite3.Row',
          'op = payload["op"]',
          'try:',
          '    if op == "exec":',
          '        conn.executescript(payload["sql"])',
          '        out = {"ok": True}',
          '    elif op == "run":',
          '        cur = conn.execute(payload["sql"], payload["params"])',
          '        conn.commit()',
          '        out = {"ok": True, "changes": cur.rowcount if cur.rowcount >= 0 else 0}',
          '    elif op == "get":',
          '        cur = conn.execute(payload["sql"], payload["params"])',
          '        r = cur.fetchone()',
          '        out = {"ok": True, "row": dict(r) if r is not None else None}',
          '    elif op == "all":',
          '        cur = conn.execute(payload["sql"], payload["params"])',
          '        out = {"ok": True, "rows": [dict(r) for r in cur.fetchall()]}',
          'except Exception as e:',
          '    out = {"ok": False, "error": str(e)}',
          'finally:',
          '    conn.close()',
          'print(json.dumps(out))'
        ].join('\n');
        const res = spawnSync(pyBin, ['-c', script], {
          input: JSON.stringify({ file: this._file, op, sql: String(sql), params }),
          encoding: 'utf8'
        });
        const parsed = JSON.parse((res.stdout || '').trim() || '{"ok":false,"error":"SQLite bridge error"}');
        if (!parsed.ok) throw new Error(parsed.error || 'SQLite error');
        return parsed;
      }
      exec(sql) {
        this._callPy('exec', sql);
      }
      prepare(sql) {
        const self = this;
        return {
          run(...params) {
            const r = self._callPy('run', sql, params);
            return { changes: r.changes || 0 };
          },
          get(...params) {
            const r = self._callPy('get', sql, params);
            return r.row ?? undefined;
          },
          all(...params) {
            const r = self._callPy('all', sql, params);
            return r.rows || [];
          }
        };
      }
      close() {}
    };
  }
}

export const DatabaseSync = ExportedDatabaseSync;
export const cleanupSqliteBridge = ExportedCleanup;
