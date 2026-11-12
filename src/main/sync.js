'use strict';
const Schema = require('../shared/schema.js');

const FULL_EVERY_MS = 24 * 3600 * 1000;
const BATCH = 100;

function fromServer(listKey, data) {
  const out = {};
  for (const f of Schema.fieldsOf(listKey)) {
    let v = data[f.name];
    if (f.type === 'bool') v = v === true;
    else if (f.type === 'multichoice') v = Array.isArray(v) ? v : [];
    else if (v === undefined) v = null;
    out[f.name] = v;
  }
  return out;
}
function toServer(listKey, fields) {
  const out = {};
  for (const f of Schema.fieldsOf(listKey)) {
    const v = fields[f.name];
    out[f.name] = f.type === 'bool' ? v === true : f.type === 'multichoice' ? (Array.isArray(v) ? v : []) : (Schema.isEmpty(v) ? null : v);
  }
  return out;
}
const minus = (ts, ms) => new Date(Date.parse(ts) - ms).toISOString();

class Sync {
  constructor({ store, fs, me, onStatus }) {
    this.store = store; this.fs = fs; this.me = me || (() => ({ email: '', name: '' })); this.onStatus = onStatus || (() => {});
    this.running = null;
  }
  status(extra) {
    const s = { pending: this.store.pending().length, conflicts: this.store.conflicts().length, lastSync: this.store.get('lastSync'), ...extra };
    this.onStatus(s); return s;
  }
  run() { if (!this.running) this.running = this._run().finally(() => { this.running = null; }); return this.running; }
  async _run() {
    this.status({ state: 'syncing' });
    try {
      if (!(await this.checkAccess())) return this.status({ state: 'noaccess' });
      await this.push();
      await this.pull();
      this.formsChanged = false;
      await this.refreshMeta();
      if (this.formsChanged) await this.pull();
      this.store.set('lastSync', new Date().toISOString());
      this.store.flushNow();
      return this.status({ state: 'ok' });
    } catch (e) {
      this.store.flushNow();
      const state = e.quota ? 'quota' : e.code === 'offline' ? 'offline' : e.code === 'login_required' ? 'login' : 'error';
      if (state === 'quota') this.store.log('warn', e.message);
      if (state === 'error') this.store.log('error', e && e.message || String(e));
      return this.status({ state, error: e && e.message || String(e) });
    }
  }

  payload(r, extra) {
    const me = this.me();
    return { ...toServer(r.list, r.fields), _createdBy: r.createdBy || me.name, _modifiedBy: me.name, _deleted: false, ...(extra || {}) };
  }

  async push() {
    const order = Schema.LISTS.map(l => l.key);
    const pend = this.store.pending().filter(r => !r.conflict && Schema.LIST_BY_KEY[r.list]).sort((a, b) => order.indexOf(a.list) - order.indexOf(b.list));
    const creates = pend.filter(r => !r.remote && !r.deleted), others = pend.filter(r => r.remote);
    let done = 0; const total = pend.length;
    for (let i = 0; i < creates.length; i += BATCH) {
      const chunk = creates.slice(i, i + BATCH);
      this.status({ state: 'syncing', detail: `Šaljem nove zapise (${done + chunk.length}/${total})` });
      try {
        const owner = this.me().email;
        const times = await this.fs.commit(chunk.map(r => ({ col: r.list, id: r.id, data: this.payload(r, { _owner: r.owner || owner }), mustNotExist: true, create: true })));
        this.store.batch(() => chunk.forEach((r, k) => this.store.db.run('UPDATE records SET remote=1, etag=?, dirty=0, owner=COALESCE(owner, ?) WHERE id=?', [times[k], r.owner || owner, r.id])));
      } catch (e) {
        if (e.code === 'offline' || e.code === 'login_required' || e.fsStatus === 'PERMISSION_DENIED') throw e;
        for (const r of chunk) await this.pushOne(r, true);
      }
      done += chunk.length;
    }
    // brisanja saljemo u paketima, kao i nove zapise
    const dels = others.filter(r => r.deleted), edits = others.filter(r => !r.deleted);
    for (let i = 0; i < dels.length; i += BATCH) {
      const chunk = dels.slice(i, i + BATCH);
      this.status({ state: 'syncing', detail: `Šaljem brisanja (${done + chunk.length}/${total})` });
      try {
        await this.fs.commit(chunk.map(r => ({ col: r.list, id: r.id, data: { _deleted: true, _modifiedBy: this.me().name }, updateTime: r.etag })));
        this.store.batch(() => chunk.forEach(r => this.store.purge(r.id)));
      } catch (e) {
        if (e.code === 'offline' || e.code === 'login_required' || e.fsStatus === 'PERMISSION_DENIED') throw e;
        for (const r of chunk) await this.pushOne(r, false);
      }
      done += chunk.length;
    }
    for (const r of edits) { this.status({ state: 'syncing', detail: `Šaljem izmjene (${++done}/${total})` }); await this.pushOne(r, false); }
  }

  async pushOne(r, isNew) {
    const l = Schema.LIST_BY_KEY[r.list];
    try {
      if (isNew) {
        const existing = await this.fs.get(r.list, r.id);
        if (existing) { this.store.update(r.id, { remote: true, etag: existing.updateTime }); return this.pushOne({ ...r, remote: true, etag: existing.updateTime }, false); }
        const owner = r.owner || this.me().email;
        const [t] = await this.fs.commit([{ col: r.list, id: r.id, data: this.payload(r, { _owner: owner }), mustNotExist: true, create: true }]);
        this.store.setOwner(r.id, owner);
        return this.store.markSynced(r.id, t);
      }
      const data = r.deleted ? { _deleted: true, _modifiedBy: this.me().name } : this.payload(r);
      const [t] = await this.fs.commit([{ col: r.list, id: r.id, data, updateTime: r.etag }]);
      if (r.deleted) { this.store.purge(r.id); this.store.log('info', `Obrisan zapis (${l.title}).`); }
      else this.store.markSynced(r.id, t);
    } catch (e) {
      if (e.fsStatus === 'FAILED_PRECONDITION' || e.fsStatus === 'NOT_FOUND') {
        const srv = await this.fs.get(r.list, r.id);
        if (!srv || srv.data._deleted) this.store.setConflict(r.id, { type: 'deleted', serverBy: srv ? srv.data._modifiedBy : '' });
        else this.store.setConflict(r.id, { type: 'changed', serverEtag: srv.updateTime, serverFields: fromServer(r.list, srv.data), serverBy: srv.data._modifiedBy || '', serverAt: srv.data._modifiedAt });
        this.store.log('warn', `Konflikt: ${l.title} – zapis je u međuvremenu izmijenio ${srv && srv.data._modifiedBy || 'drugi korisnik'}.`);
      } else if (e.code === 'offline' || e.code === 'login_required' || e.fsStatus === 'PERMISSION_DENIED') throw e;
      else this.store.log('error', `${l.title}: ${e.message}`);
    }
  }

  async pull() {
    const full = !this.store.get('lastFull') || Date.now() - Date.parse(this.store.get('lastFull')) > FULL_EVERY_MS;
    let n = 0;
    for (const l of Schema.LISTS) {
      this.status({ state: 'syncing', detail: `Preuzimam: ${l.title} (${++n}/${Schema.LISTS.length})` });
      const cur = this.store.get('cursor:' + l.key);
      const docs = full || !cur ? await this.fs.list(l.key) : await this.fs.changedSince(l.key, minus(cur, 2000));
      let max = cur;
      this.store.batch(() => {
        for (const d of docs) {
          this.store.upsertFromServer(l.key, d.id, d.updateTime, fromServer(l.key, d.data),
            { createdBy: d.data._createdBy, owner: d.data._owner, modifiedBy: d.data._modifiedBy, modifiedAt: d.data._modifiedAt || d.updateTime }, d.data._deleted === true);
          if (d.data._modifiedAt && (!max || d.data._modifiedAt > max)) max = d.data._modifiedAt;
        }
        if (full || !cur) this.store.removeMissing(l.key, docs.map(d => d.id));
      });
      if (max) this.store.set('cursor:' + l.key, max);
    }
    if (full) this.store.set('lastFull', new Date().toISOString());
  }

  // ako korisnik nije na listi, dalje ne citamo nista
  async checkAccess() {
    const me = this.me();
    if (!me.email) return false;
    const u = await this.fs.get('users', me.email);
    this.store.set('profile:' + me.email, u ? { role: u.data.role || 'monitor', name: u.data.name || me.email } : null);
    return !!u;
  }
  async refreshMeta() {
    if (!(await this.checkAccess())) return;
    const me = this.me();
    const ch = await this.fs.get('meta', 'choices');
    this.store.set('choices', ch ? ch.data : {});
    const parse = d => { try { return d && d.data.json ? JSON.parse(d.data.json) : null; } catch { return null; } };
    this.store.set('forms', parse(await this.fs.get('meta', 'forms')));
    const admin = me.email && (this.store.get('profile:' + me.email) || {}).role === 'admin';
    this.store.set('formsDraft', admin ? parse(await this.fs.get('meta', 'forms_draft')) : null);
    this.store.set('tables', parse(await this.fs.get('meta', 'tables')));
    this.onForms();
  }
  formsConfig() { return this.store.get('formsDraft') || this.store.get('forms') || null; }
  onForms() {
    const cfg = this.formsConfig(), sig = JSON.stringify(cfg || null);
    Schema.applyCustom(cfg);
    if (this.store.get('formsSig') !== sig) { this.store.set('formsSig', sig); this.store.set('lastFull', null); this.formsChanged = true; }
  }
  async saveFormsDraft(cfg) {
    const me = this.me();
    await this.fs.commit([{ col: 'meta', id: 'forms_draft', data: { json: JSON.stringify(cfg), by: me.name || me.email, at: new Date().toISOString() } }]);
    this.store.set('formsDraft', cfg); this.onForms();
  }
  async publishForms() {
    const cfg = this.store.get('formsDraft'); if (!cfg) return false; const me = this.me();
    await this.fs.commit([{ col: 'meta', id: 'forms', data: { json: JSON.stringify(cfg), by: me.name || me.email, at: new Date().toISOString() } }]);
    await this.fs.remove('meta', 'forms_draft');
    this.store.set('forms', cfg); this.store.set('formsDraft', null); this.onForms(); return true;
  }
  async saveTables(cfg) { const me = this.me();
    await this.fs.commit([{ col: 'meta', id: 'tables', data: { json: JSON.stringify(cfg), by: me.name || me.email, at: new Date().toISOString() } }]);
    this.store.set('tables', cfg); }
  async discardFormsDraft() { await this.fs.remove('meta', 'forms_draft'); this.store.set('formsDraft', null); this.onForms(); }
  async listUsers() { return (await this.fs.list('users')).map(u => ({ email: u.id, name: u.data.name || '', role: u.data.role || 'monitor' })).sort((a, b) => a.email.localeCompare(b.email)); }
  async setUser(email, name, role) { await this.fs.commit([{ col: 'users', id: email.trim().toLowerCase(), data: { name: name || '', role: role === 'admin' ? 'admin' : 'monitor' } }]); }
  async removeUser(email) { await this.fs.remove('users', email); }
  async setChoices(map) { await this.fs.commit([{ col: 'meta', id: 'choices', data: map }]); this.store.set('choices', map); }
  // bootstrap ne mozemo procitati prije odobrenja, zato samo probamo upis
  async claimAdmin(email, name) {
    try {
      await this.fs.commit([
        { col: 'users', id: email, data: { name, role: 'admin' } },
        { col: 'meta', id: 'bootstrap', data: { by: email }, mustNotExist: true },
      ]);
      return true;
    } catch (e) { if (e.code === 'offline' || e.code === 'login_required') throw e; return false; }
  }

  resolve(id, choice) {
    const r = this.store.byId(id); if (!r || !r.conflict) return;
    if (r.conflict.type === 'deleted') {
      if (choice === 'mine') this.store.update(r.id, { remote: false, etag: null, dirty: true, deleted: false });
      else this.store.purge(r.id);
    } else if (choice === 'mine') this.store.update(r.id, { etag: r.conflict.serverEtag, dirty: true });
    else this.store.update(r.id, { fields: r.conflict.serverFields, etag: r.conflict.serverEtag, dirty: false, deleted: false });
    this.store.setConflict(r.id, null);
  }
}

module.exports = { Sync, fromServer, toServer };
