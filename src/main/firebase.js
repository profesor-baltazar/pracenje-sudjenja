'use strict';
const fs = require('fs');

const ERR_SR = {
  EMAIL_EXISTS: 'Nalog sa ovim e-mailom već postoji – prijavite se.',
  EMAIL_NOT_FOUND: 'Pogrešan e-mail ili lozinka.',
  INVALID_PASSWORD: 'Pogrešan e-mail ili lozinka.',
  INVALID_LOGIN_CREDENTIALS: 'Pogrešan e-mail ili lozinka.',
  USER_DISABLED: 'Nalog je onemogućen.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Previše pokušaja. Pokušajte ponovo za nekoliko minuta.',
  'WEAK_PASSWORD : Password should be at least 6 characters': 'Lozinka mora imati najmanje 6 znakova.',
  INVALID_EMAIL: 'Neispravna e-mail adresa.',
  OPERATION_NOT_ALLOWED: 'Prijava e-mailom nije uključena u Firebase projektu (Authentication → Sign-in method → Email/Password).',
  TOKEN_EXPIRED: 'Sesija je istekla – prijavite se ponovo.',
  INVALID_REFRESH_TOKEN: 'Sesija je istekla – prijavite se ponovo.',
};

async function post(url, body, headers = {}) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  } catch (e) { throw Object.assign(new Error('Nema veze sa serverom.'), { code: 'offline' }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = data.error && (data.error.message || data.error.status) || res.statusText;
    const err = new Error(ERR_SR[raw] || raw);
    err.status = res.status; err.raw = raw; err.fsStatus = data.error && data.error.status;
    if (['TOKEN_EXPIRED', 'INVALID_REFRESH_TOKEN', 'USER_NOT_FOUND', 'USER_DISABLED'].includes(raw)) err.code = 'login_required';
    throw err;
  }
  return data;
}

class Auth {
  constructor(config, file, crypt) {
    this.cfg = config; this.file = file;
    this.crypt = crypt || { enc: s => s, dec: b => b.toString('utf8') };
    this.session = null; this.idToken = null; this.expires = 0;
    try { if (fs.existsSync(file) && (!this.crypt.ok || this.crypt.ok())) this.session = JSON.parse(this.crypt.dec(fs.readFileSync(file))); } catch { this.session = null; }
  }
  url(m) { return `https://identitytoolkit.googleapis.com/v1/accounts:${m}?key=${this.cfg.apiKey}`; }
  persist() {
    if (this.session && (!this.crypt.ok || this.crypt.ok())) fs.writeFileSync(this.file, this.crypt.enc(JSON.stringify(this.session)));
    else if (fs.existsSync(this.file)) fs.unlinkSync(this.file);
  }
  user() { return this.session ? { email: this.session.email, uid: this.session.uid } : null; }

  async register(email, password) {
    const r = await post(this.url('signUp'), { email: email.trim(), password, returnSecureToken: true });
    await post(this.url('sendOobCode'), { requestType: 'VERIFY_EMAIL', idToken: r.idToken });
    return true;
  }
  async login(email, password) {
    const r = await post(this.url('signInWithPassword'), { email: email.trim(), password, returnSecureToken: true });
    const look = await post(this.url('lookup'), { idToken: r.idToken });
    const u = look.users && look.users[0];
    if (!u || !u.emailVerified) {
      await post(this.url('sendOobCode'), { requestType: 'VERIFY_EMAIL', idToken: r.idToken }).catch(() => {});
      throw Object.assign(new Error('E-mail adresa još nije potvrđena. Poslali smo vam ponovo link za potvrdu – otvorite ga pa se prijavite.'), { code: 'not_verified' });
    }
    this.session = { email: u.email.toLowerCase(), uid: r.localId, refreshToken: r.refreshToken };
    this.idToken = r.idToken; this.expires = Date.now() + (Number(r.expiresIn) - 120) * 1000;
    this.persist();
    return this.user();
  }
  async resetPassword(email) { await post(this.url('sendOobCode'), { requestType: 'PASSWORD_RESET', email: email.trim() }); }
  logout() { this.session = null; this.idToken = null; this.persist(); }

  async token() {
    if (!this.session) throw Object.assign(new Error('Potrebna je prijava.'), { code: 'login_required' });
    if (this.idToken && Date.now() < this.expires) return this.idToken;
    const r = await post(`https://securetoken.googleapis.com/v1/token?key=${this.cfg.apiKey}`, { grant_type: 'refresh_token', refresh_token: this.session.refreshToken });
    this.idToken = r.id_token; this.expires = Date.now() + (Number(r.expires_in) - 120) * 1000;
    if (r.refresh_token && r.refresh_token !== this.session.refreshToken) { this.session.refreshToken = r.refresh_token; this.persist(); }
    return this.idToken;
  }
}

function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  return { stringValue: String(v) };
}
function dec(v) {
  if (!v || 'nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return decFields(v.mapValue.fields || {});
  return null;
}
const decFields = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, dec(v)]));

class Firestore {
  constructor(config, auth) {
    this.cfg = config; this.auth = auth;
    this.root = `projects/${config.projectId}/databases/(default)/documents`;
    this.base = `https://firestore.googleapis.com/v1/${this.root}`;
  }
  name(col, id) { return `${this.root}/${col}/${id}`; }
  static doc(d) { const p = d.name.split('/'); return { col: p[p.length - 2], id: p[p.length - 1], updateTime: d.updateTime, data: decFields(d.fields) }; }

  async req(method, url, body, pokusaj = 0) {
    const token = await this.auth.token();
    let res;
    try {
      res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
    } catch { throw Object.assign(new Error('Nema veze sa serverom.'), { code: 'offline' }); }
    const data = await res.json().catch(() => ({}));
    // 429 = potrosen dnevni limit ili je server preopterecen
    if (res.status === 429 || res.status === 503) {
      const kvota = /quota|RESOURCE_EXHAUSTED/i.test(JSON.stringify(data));
      if (kvota || pokusaj >= 3) throw Object.assign(new Error(kvota
        ? 'Dnevni besplatni limit Firebasea je potrošen. Sinhronizacija nastavlja automatski kad se limit obnovi (oko 9 h ujutru). Unosi su sačuvani na ovom računaru.'
        : 'Server je trenutno preopterećen. Pokušaću ponovo.'), { code: 'offline', quota: kvota });
      await new Promise(r => setTimeout(r, 4000)); return this.req(method, url, body, pokusaj + 1);
    }
    if (!res.ok) {
      const st = data.error && data.error.status;
      let msg = data.error && data.error.message || res.statusText;
      if (st === 'PERMISSION_DENIED') {
        const names = [url, ...((body && body.writes) || []).map(w => (w.update && w.update.name) || w.delete || '')].join(' ');
        const cols = [...new Set([...names.matchAll(/\/documents\/([^/?\s]+)/g)].map(m => m[1]))].filter(c => c !== '');
        msg = `Server je odbio pristup${cols.length ? ' (' + cols.join(', ') + ')' : ''}. Provjerite da su u Firebase konzoli objavljena najnovija pravila (firestore.rules) i da je vaša e-mail adresa u listi korisnika.`;
      }
      if (st === 'NOT_FOUND' && /database/i.test(msg)) msg = 'Firestore baza nije napravljena u Firebase projektu.';
      throw Object.assign(new Error(msg), { status: res.status, fsStatus: st, code: st === 'UNAUTHENTICATED' ? 'login_required' : undefined });
    }
    return data;
  }

  async get(col, id) {
    try { return Firestore.doc(await this.req('GET', `${this.base}/${col}/${encodeURIComponent(id)}`)); }
    catch (e) { if (e.fsStatus === 'NOT_FOUND') return null; throw e; }
  }
  async list(col) {
    const out = []; let token = '';
    do {
      const r = await this.req('GET', `${this.base}/${col}?pageSize=300${token ? '&pageToken=' + encodeURIComponent(token) : ''}`);
      for (const d of r.documents || []) out.push(Firestore.doc(d));
      token = r.nextPageToken;
    } while (token);
    return out;
  }
  async changedSince(col, ts) {
    const r = await this.req('POST', `${this.base}:runQuery`, { structuredQuery: {
      from: [{ collectionId: col }],
      where: { fieldFilter: { field: { fieldPath: '_modifiedAt' }, op: 'GREATER_THAN', value: { timestampValue: ts } } },
      orderBy: [{ field: { fieldPath: '_modifiedAt' }, direction: 'ASCENDING' }] } });
    return (Array.isArray(r) ? r : []).filter(x => x.document).map(x => Firestore.doc(x.document));
  }
  async commit(writes) {
    const r = await this.req('POST', `${this.base}:commit`, { writes: writes.map(w => {
      const t = [{ fieldPath: '_modifiedAt', setToServerValue: 'REQUEST_TIME' }];
      if (w.create) t.push({ fieldPath: '_createdAt', setToServerValue: 'REQUEST_TIME' });
      const out = { update: { name: this.name(w.col, w.id), fields: Object.fromEntries(Object.entries(w.data).map(([k, v]) => [k, enc(v)])) }, updateTransforms: t };
      if (!w.create) out.updateMask = { fieldPaths: Object.keys(w.data) };
      if (w.updateTime) out.currentDocument = { updateTime: w.updateTime };
      else if (w.mustNotExist) out.currentDocument = { exists: false };
      return out;
    }) });
    return (r.writeResults || []).map(x => x.updateTime);
  }
  async remove(col, id) { await this.req('POST', `${this.base}:commit`, { writes: [{ delete: this.name(col, id) }] }); }
}

module.exports = { Auth, Firestore, enc, dec, post };
