/**
 * Node 18 / Node 22 Compatible DatabaseSync Provider
 * Uses built-in `node:sqlite` on Node 22.5+ and falls back to Python 3's
 * built-in `sqlite3` engine on Node 18/20 via synchronous pipe communication.
 */

import fs from 'node:fs';
import { spawn, execSync } from 'node:child_process';

let ExportedDatabaseSync = null;
let ExportedCleanup = () => {};

try {
  const mod = await import('node:sqlite');
  ExportedDatabaseSync = mod.DatabaseSync;
} catch (_) {
  const uid = `${process.pid}_${Date.now()}`;
  const reqFifo = `/tmp/wm_sql_req_${uid}`;
  const resFifo = `/tmp/wm_sql_res_${uid}`;
  const pyScriptPath = `/tmp/wm_sql_daemon_${uid}.py`;

  execSync(`rm -f ${reqFifo} ${resFifo} && mkfifo ${reqFifo} ${resFifo}`);

  const pyCode = [
    'import sqlite3, json, os, sys',
    `req_path = "${reqFifo}"`,
    `res_path = "${resFifo}"`,
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
}

export const DatabaseSync = ExportedDatabaseSync;
export const cleanupSqliteBridge = ExportedCleanup;
