'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const clean = ps => ps.map(v => v === undefined ? null : v);

class Store {
  static async open(file) {
    const SQL = await initSqlJs({ locateFile: f => path.join(path.dirname(require.resolve('sql.js')), f) });
    const s = new Store();
    s.file = file;
    s.db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
    s.db.run(`
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY, list TEXT NOT NULL, remote INTEGER DEFAULT 0, etag TEXT,
        fields TEXT NOT NULL, dirty INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0,
        created_by TEXT, modified_by TEXT, modified_at TEXT, conflict TEXT);
      CREATE INDEX IF NOT EXISTS ix_rec_list ON records(list);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS log (ts TEXT, level TEXT, msg TEXT);`);
    // kolona owner je dodata kasnije
    if (!s.all('PRAGMA table_info(records)').some(c => c.name === 'owner')) s.db.run('ALTER TABLE records ADD COLUMN owner TEXT');
    s.flushNow();
    return s;
  }

  flush() { clearTimeout(this._t); this._t = setTimeout(() => this.flushNow(), 300); }
  flushNow() {
    clearTimeout(this._t);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(this.db.export()));
    fs.renameSync(tmp, this.file);
  }
  all(sql, params = []) {
    const st = this.db.prepare(sql); st.bind(clean(params));
    const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out;
  }
  one(sql, params = []) { return this.all(sql, params)[0] || null; }
  run(sql, params = []) { this.db.run(sql, clean(params)); this.flush(); }
  batch(fn) { this.db.run('BEGIN'); try { fn(); this.db.run('COMMIT'); } catch (e) { this.db.run('ROLLBACK'); throw e; } this.flush(); }

  get(key, def = null) { const r = this.one('SELECT value FROM meta WHERE key=?', [key]); return r ? JSON.parse(r.value) : def; }
  set(key, val) { this.run('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)', [key, JSON.stringify(val)]); }

  static row(r) {
    return r && { id: r.id, list: r.list, remote: !!r.remote, etag: r.etag, fields: JSON.parse(r.fields), dirty: !!r.dirty, deleted: !!r.deleted,
      createdBy: r.created_by, owner: r.owner || null, modifiedBy: r.modified_by, modifiedAt: r.modified_at, conflict: r.conflict ? JSON.parse(r.conflict) : null };
  }
  records(list) { return this.all('SELECT * FROM records WHERE list=? AND deleted=0', [list]).map(Store.row); }
  allRecords() { return this.all('SELECT * FROM records WHERE deleted=0').map(Store.row); }
  count() { return this.one('SELECT COUNT(*) n FROM records WHERE deleted=0').n; }
  byId(id) { return Store.row(this.one('SELECT * FROM records WHERE id=?', [id])); }
  pending() { return this.all('SELECT * FROM records WHERE dirty=1').map(Store.row); }
  conflicts() { return this.all('SELECT * FROM records WHERE conflict IS NOT NULL').map(Store.row); }

  saveLocal(list, id, fields, user, opts = {}) {
    const now = new Date().toISOString();
    if (id && this.byId(id)) {
      this.run('UPDATE records SET fields=?, dirty=1, modified_by=?, modified_at=? WHERE id=?', [JSON.stringify(fields), user, now, id]);
      return this.byId(id);
    }
    const nid = id || crypto.randomUUID();
    this.run('INSERT INTO records(id,list,fields,dirty,created_by,modified_by,modified_at,owner) VALUES(?,?,?,1,?,?,?,?)', [nid, list, JSON.stringify(fields), opts.createdBy || user, user, now, opts.owner || null]);
    return this.byId(nid);
  }
  markDeleted(id) {
    const r = this.byId(id); if (!r) return;
    if (!r.remote) this.run('DELETE FROM records WHERE id=?', [id]);
    else this.run('UPDATE records SET deleted=1, dirty=1 WHERE id=?', [id]);
  }

  upsertFromServer(list, id, etag, fields, info, deleted) {
    const cur = this.byId(id);
    if (cur && cur.dirty) {
      if (deleted && !cur.deleted) this.db.run('UPDATE records SET conflict=? WHERE id=?', [JSON.stringify({ type: 'deleted', serverBy: info.modifiedBy }), id]);
      return;
    }
    if (deleted) { if (cur) this.db.run('DELETE FROM records WHERE id=?', [id]); return; }
    if (cur) this.db.run('UPDATE records SET remote=1, etag=?, fields=?, created_by=?, modified_by=?, modified_at=?, owner=?, conflict=NULL WHERE id=?',
      clean([etag, JSON.stringify(fields), info.createdBy, info.modifiedBy, info.modifiedAt, info.owner || null, id]));
    else this.db.run('INSERT INTO records(id,list,remote,etag,fields,dirty,created_by,modified_by,modified_at,owner) VALUES(?,?,1,?,?,0,?,?,?,?)',
      clean([id, list, etag, JSON.stringify(fields), info.createdBy, info.modifiedBy, info.modifiedAt, info.owner || null]));
  }
  removeMissing(list, keepIds) {
    const keep = new Set(keepIds);
    for (const r of this.all('SELECT id, dirty FROM records WHERE list=? AND remote=1', [list]).filter(r => !keep.has(r.id))) {
      if (r.dirty) this.db.run('UPDATE records SET conflict=? WHERE id=?', [JSON.stringify({ type: 'deleted' }), r.id]);
      else this.db.run('DELETE FROM records WHERE id=?', [r.id]);
    }
  }
  markSynced(id, etag) { this.run('UPDATE records SET remote=1, etag=?, dirty=0, conflict=NULL WHERE id=?', [etag, id]); }
  setOwner(id, owner) { this.run('UPDATE records SET owner=? WHERE id=? AND owner IS NULL', [owner, id]); }
  setConflict(id, conflict) { this.run('UPDATE records SET conflict=? WHERE id=?', [conflict ? JSON.stringify(conflict) : null, id]); }
  update(id, patch) {
    const map = { remote: 'remote', etag: 'etag', dirty: 'dirty', fields: 'fields', deleted: 'deleted' };
    const cols = Object.keys(patch); if (!cols.length) return;
    this.run(`UPDATE records SET ${cols.map(c => map[c] + '=?').join(',')} WHERE id=?`,
      [...cols.map(c => c === 'fields' ? JSON.stringify(patch[c]) : (typeof patch[c] === 'boolean' ? +patch[c] : patch[c])), id]);
  }
  purge(id) { this.run('DELETE FROM records WHERE id=?', [id]); }

  log(level, msg) {
    this.db.run('INSERT INTO log VALUES(?,?,?)', [new Date().toISOString(), level, String(msg).slice(0, 2000)]);
    this.db.run('DELETE FROM log WHERE rowid NOT IN (SELECT rowid FROM log ORDER BY ts DESC LIMIT 500)');
    this.flush();
  }
  logs(n = 100) { return this.all('SELECT * FROM log ORDER BY ts DESC LIMIT ?', [n]); }
}

module.exports = { Store };
