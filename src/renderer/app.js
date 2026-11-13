(() => {
'use strict';
const S = window.Schema, ST = window.Stats, api = window.api;

const st = {
  app: null, data: null, sync: { state: 'idle' },
  view: 'cases', space: 'svi', caseId: null, step: 'predmeti', faza: 1,
  edit: null,
  search: '', filter: 'svi',
  statTopic: 'osnovni', statCase: '', statModule: 'svi', statSpace: 'svi', statCourt: '', refDate: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
  repModule: 'svi', repOpen: {}, repEdit: false,
  modal: null, busy: false,
};

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}
function toast(msg, kind) {
  const t = h('div', { class: 'toast ' + (kind || '') }, msg);
  document.getElementById('toasts').append(t); setTimeout(() => t.remove(), kind === 'err' ? 7000 : 3500);
}
function confirmBox(title, text, okLabel, danger) {
  return new Promise(res => {
    st.modal = { title, text, okLabel, danger, done: v => { st.modal = null; render(); res(v); } }; render();
  });
}
const recs = list => (st.data ? st.data.records[list] : []) || [];
const caseList = () => S.SPACE_BY_KEY[st.space].lists[0][0];
const caseRec = id => recs(caseList()).find(r => r.id === id);
const caseOfRec = r => S.LIST_BY_KEY[r.list].isCase ? r : recs(S.LIST_BY_KEY[r.list].caseList).find(c => c.id === r.fields.Predmet);
const stepList = base => S.listsOf(st.space).find(l => S.baseKey(l.key) === base);
const moduleOf = space => S.SPACE_BY_KEY[space].module;
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
try { const sp = localStorage.getItem('tm.space'); if (sp && S.SPACE_BY_KEY[sp]) { st.space = sp; st.statModule = S.SPACE_BY_KEY[sp].module; st.statSpace = sp; } } catch { }
const allChildRecs = (list, caseId) => recs(list).filter(r => r.fields.Predmet === caseId);
const childRecs = (list, caseId) => allChildRecs(list, caseId).filter(r => !S.isPhased(list) || (r.fields.faza || 1) === st.faza);
const phasesOf = caseId => { const fl = stepList('faze'); return fl ? [1, ...allChildRecs(fl.key, caseId).map(f => f.fields.faza || 2)].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b) : [1]; };
const choicesOf = (list, name) => (st.data && st.data.choices[`${list}.${name}`]) || S.fallbackChoices(list, name);
const ago = iso => { if (!iso) return 'nikad'; const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'upravo' : m < 60 ? `prije ${m} min` : m < 1440 ? `prije ${Math.round(m / 60)} h` : new Date(iso).toLocaleDateString('sr-Latn-ME'); };

function statData(module) {
  const mod = S.MODULES.find(m => m.key === module);
  const pack = space => { const o = {}; for (const l of S.listsOf(space)) o[S.baseKey(l.key)] = recs(l.key).map(r => ({ _id: r.id, ...r.fields })); return o; };
  const d = pack(mod.spaces[0]);
  d.roc = mod.spaces[1] ? pack(mod.spaces[1]) : { predmeti: [], rocista: [] };
  for (const o of d.odlaganja || []) o._razlog = o.Razlogodlaganja || null;
  d._refDate = st.refDate;
  return d;
}
const zatvorIzrecen = x => /zatvor/i.test(x.glavnaSankcija || '');
const optNaslov = (x, i) => `Optuženi ${i + 1}${x.oznaka ? ' – ' + x.oznaka : ''}`;
const PRAZAN_OPT = { oznaka: null, osudjivan: false, istovrsna: false, detaljiPresuda: null, glavnaSankcija: null, zatvorGodina: null, zatvorMjeseci: null, zatvorDana: null, mjeraBezbjednosti: null, sankcija: null };
const GRUPE = {
  zrtve: { of: c => S.zrtveOf(c), naslov: (x, i) => `Žrtva ${i + 1}`, dodaj: '+ Dodaj žrtvu', prazno: { odnos: null, prijavljivala: false, pridruzila: false },
    polja: [['odnos', 'text', 'Odnos žrtve sa optuženim', { hint: 'npr. supruga, bivša vanbračna supruga, majka', cls: 'pola' }],
      ['prijavljivala', 'bool', 'Žrtva je prethodno prijavljivala nasilje'], ['pridruzila', 'bool', 'Žrtva se pridružila krivičnom gonjenju']] },
  optuzeni: { of: c => S.optuzeniOf(c), naslov: optNaslov, dodaj: '+ Dodaj optuženog', prazno: PRAZAN_OPT,
    polja: [['oznaka', 'text', 'Oznaka optuženog (nije obavezno)', { hint: 'npr. 1. optuženi ili inicijali', cls: 'pola' }],
      ['osudjivan', 'bool', 'Optuženi je prethodno osuđivan'],
      ['istovrsna', 'bool', 'Prethodno osuđivan za istovjetna ili istovrsna krivična djela', { show: x => x.osudjivan === true }],
      ['detaljiPresuda', 'longtext', 'Detalji prethodnih presuda (kada, vrsta i visina sankcije)', { show: x => x.osudjivan === true }]] },
  sankcije: { polje: 'optuzeni', of: c => S.optuzeniOf(c), naslov: optNaslov, dodaj: null, prazno: PRAZAN_OPT,
    polja: [['glavnaSankcija', 'choice', 'Glavna sankcija', { izbori: 'glavnaSankcija' }],
      ['zatvorGodina', 'number', 'Godine', { max: 40, show: zatvorIzrecen, cls: 'trecina' }], ['zatvorMjeseci', 'number', 'Mjeseci', { max: 12, show: zatvorIzrecen, cls: 'trecina' }],
      ['zatvorDana', 'number', 'Dani', { max: 31, show: zatvorIzrecen, cls: 'trecina' }],
      ['mjeraBezbjednosti', 'text', 'Mjera bezbjednosti, visina novčane kazne i sl.'],
      ['sankcija', 'text', 'Sankcija – opis', { hint: 'Ako je oslobođen optužbi, upisati najvažnije razloge' }]] },
};
const NIJE_BILO = { zalba: 'Nije bilo žalbe', mjere: 'Sud nije izricao mjere procesne discipline', vpl: 'Nije bilo vanrednih pravnih ljekova', komentari: 'Monitor nema komentara' };
const nijeKey = list => S.isPhased(list) ? `${S.baseKey(list)}:${st.faza}` : S.baseKey(list);
async function setNijeBilo(c, list, on) {
  const nb = { ...(c.fields.nijeBilo || {}) }; if (on) nb[nijeKey(list)] = true; else delete nb[nijeKey(list)];
  await api.save({ list: caseList(), id: c.id, fields: { ...c.fields, nijeBilo: Object.keys(nb).length ? nb : null } });
  st.data = await getData(); render();
}
function stepsFor(c) {
  const f = c ? c.fields : {};
  return S.listsOf(st.space).filter(l => !l.archived).filter(l => S.baseKey(l.key) !== 'faze' || st.faza > 1 || (!c && previewMode())).map((l, i) => {
    const n = l.isCase ? (c ? 1 : 0) : childRecs(l.key, c && c.id).length;
    let na = null;
    const b = S.baseKey(l.key);
    if (b === 'pritvori' && f.Pritvorskipredmet !== true) na = 'Predmet nije označen kao pritvorski.';
    if (b === 'jemstva' && f.Predlo_x017e_enojemstvo !== true) na = 'U predmetu nije označeno da je predloženo jemstvo.';
    if (b === 'odlaganja' && !n) {
      const fl = stepList('faze'), fz = st.faza > 1 && fl && c ? (allChildRecs(fl.key, c.id).find(x => (x.fields.faza || 2) === st.faza) || { fields: {} }).fields : f;
      if (!(Number(fz.Brojodlo_x017e_enihro_x010d_i_x0) > 0)) na = st.faza > 1 ? 'Za ovo ponovljeno suđenje nije upisan broj odloženih ročišta.' : 'U osnovnim podacima nije upisano nijedno odloženo ročište.';
    }
    const none = !!(c && !n && NIJE_BILO[b] && (f.nijeBilo || {})[nijeKey(l.key)]);
    return { ...l, idx: i + 1, count: n, na: none ? null : na, none };
  });
}
async function getData() { const d = await api.getData(); if (!(fb.dirty && st.view === 'forms')) S.applyCustom(d.forms || null); return d; }
async function load() {
  st.app = await api.state();
  if (st.app.configured && st.app.me) st.data = await getData();
  render();
}
api.on('sync:status', s => { st.sync = s; if (st.app) { st.app.pending = s.pending; st.app.conflicts = s.conflicts; st.app.lastSync = s.lastSync; }
  if (s.state === 'login') toast('Sesija je istekla – prijavite se ponovo da bi se podaci sinhronizovali.', 'err');
  if (st.app && st.app.me && (s.state === 'noaccess') !== !!st.app.noAccess) { api.state().then(a => { st.app = a; render(); }); return; }
  renderTop(); });
api.on('data:changed', async () => { if (!st.app || !st.app.me) return; st.data = await getData(); if (!st.edit || !st.edit.dirty) render(); else renderTop(); });
api.on('app:state', s => { st.app = s; render(); });
const upd = { info: null, busy: false, pct: null, msg: '' };
api.on('update:available', i => { upd.info = i; render(); });
api.on('update:progress', p => { upd.pct = p; render(); });
async function installUpdate() {
  if (!(await confirmBox(`Instalirati verziju ${upd.info.version}?`, 'Aplikacija će preuzeti novu verziju, zatvoriti se i ponovo pokrenuti. Podaci i prijava ostaju sačuvani. Nesinhronizovane izmjene ostaju na ovom računaru i šalju se poslije pokretanja.', 'Instaliraj'))) return;
  upd.busy = true; upd.pct = 0; render();
  try { await api.updateInstall(); upd.msg = 'Nova verzija je spremna – aplikacija se ponovo pokreće…'; }
  catch (e) { upd.busy = false; toast('Ažuriranje nije uspjelo: ' + cleanErr(e) + (upd.info.page ? ' Novu verziju možete preuzeti i ručno sa GitHuba.' : ''), 'err'); }
  render();
}
function updateBanner() {
  if (!upd.info || !upd.info.available) return null;
  return h('div', { class: 'updbar' }, h('div', {}, h('b', {}, `Nova verzija ${upd.info.version}`), h('div', { class: 'small' }, upd.busy ? (upd.msg || `Preuzimam… ${upd.pct || 0}%`) : `Sada imate ${upd.info.current}.`)),
    upd.busy ? null : h('button', { class: 'btn small primary', onclick: installUpdate }, 'Instaliraj'));
}
window.addEventListener('online', () => api.setOnline(true));
window.addEventListener('offline', () => { api.setOnline(false); st.sync = { ...st.sync, state: 'offline' }; renderTop(); });
window.__hasUnsaved = () => !!(st.edit && st.edit.dirty);
document.addEventListener('keydown', ev => {
  const k = ev.key.toLowerCase();
  if (st.modal) { if (k === 'escape') st.modal.done(false); if (k === 'enter') st.modal.done(true); return; }
  if (picker && k === 'escape') { picker = null; render(); return; }
  if ((ev.ctrlKey || ev.metaKey) && k === 's' && st.edit) { ev.preventDefault(); save(); }
  else if (k === 'escape' && st.edit && st.view === 'case') { ev.preventDefault(); cancelEdit(); }
  else if ((ev.ctrlKey || ev.metaKey) && k === 'f' && st.view === 'cases') { ev.preventDefault(); const s = document.querySelector('.search'); if (s) s.focus(); }
});

const previewMode = () => st.view === 'case' && !st.caseId && st.app && st.app.isAdmin;
async function leaveEdit(stepSwitch) {
  if (st.view === 'forms' && fb.dirty && !stepSwitch) {
    if (!(await confirmBox('Nesačuvane izmjene formi', 'Izmjene formi nisu sačuvane kao nacrt. Da li želite da ih odbacite?', 'Odbaci izmjene', true))) return false;
    fb.dirty = false; fb.cfg = null; fb.edit = null; S.applyCustom(st.data && st.data.forms || null);
  } else if (st.view === 'forms') { fb.cfg = null; fb.edit = null; }
  const before = st.edit;
  if (stepSwitch && previewMode() && st.edit && S.LIST_BY_KEY[st.edit.list].isCase) { st.pendingCase = st.edit; st.edit = null; return true; }
  if (st.edit && st.edit.preview) {
    if (stepSwitch) { st.edit = null; return true; }
    const p = st.pendingCase; st.edit = p && JSON.stringify(p.draft) !== p.base ? { ...p, dirty: true } : null;
  }
  if (st.edit && st.edit.dirty) {
    const ok = await confirmBox('Nesačuvane izmjene', 'Forma ima izmjene koje nisu sačuvane. Da li želite da ih odbacite?', 'Odbaci izmjene', true);
    if (!ok) { st.edit = before; return false; }
  }
  st.edit = null; st.pendingCase = null; return true;
}
async function go(view, extra) { if (!(await leaveEdit())) return; if (view === 'sync') logs = null; Object.assign(st, { view }, extra || {}); render(); document.querySelector('.main') && (document.querySelector('.main').scrollTop = 0); }
async function addHearing(id) {
  const rl = stepList('rocista'); await openCase(id, rl.key);
  st.edit = newEdit(rl.key);
  const prev = childRecs(rl.key, id).map(x => x.fields.datumNarednog).filter(S.isDate).sort().pop();
  if (prev) { st.edit.draft.datum = prev; st.edit.base = JSON.stringify(st.edit.draft); }
  render();
}
async function openCase(id, step) {
  if (!(await leaveEdit())) return;
  st.view = 'case'; st.caseId = id; st.faza = 1; st.step = step || caseList(); startStep(); render();
}
function startStep() {
  const l = S.LIST_BY_KEY[st.step];
  if (!st.caseId && previewMode() && !l.isCase) { st.edit = { ...newEdit(st.step), preview: true }; return; }
  if (l.isCase) { const c = caseRec(st.caseId); st.edit = c ? editOf(l.key, c) : (st.pendingCase && st.pendingCase.list === l.key ? st.pendingCase : newEdit(l.key)); st.pendingCase = null; }
  else if (!l.many) { const r = childRecs(st.step, st.caseId)[0]; st.edit = r ? editOf(st.step, r) : newEdit(st.step); }
  else st.edit = null;
}
const editOf = (list, r) => { const draft = { ...r.fields };
  if (S.baseKey(list) === 'pritvori') {
    if (!(Array.isArray(draft.tok) && draft.tok.length)) { const t = S.tokIzStarog(draft); if (t.length) draft.tok = t; }
    if (Array.isArray(draft.tok) && draft.tok.length) { const k = tokKontekst(draft.Predmet); Object.assign(draft, S.tokUStaro(draft.tok, k.cf, k.pres1)); }
  }
  return { list, id: r.id, draft, base: JSON.stringify(draft), dirty: false }; };
function tokKontekst(caseId) {
  const cf = (caseRec(caseId) || { fields: {} }).fields, pl = stepList('presuda1');
  const p1r = pl ? allChildRecs(pl.key, caseId).filter(r => (r.fields.faza || 1) === 1)[0] : null;
  return { cf, pres1: p1r ? p1r.fields.Datumobjavljivanjapresude : null };
}
function newEdit(list) {
  const draft = {}; for (const f of S.fieldsOf(list)) draft[f.name] = f.type === 'bool' ? false : f.type === 'multichoice' ? [] : null;
  if (!S.LIST_BY_KEY[list].isCase) draft.Predmet = st.caseId;
  if (S.isPhased(list)) draft.faza = st.faza;
  if (['pritvori', 'jemstva', 'nadzor'].includes(S.baseKey(list))) draft.liceBr = Math.max(0, ...allChildRecs(list, st.caseId).map(r => r.fields.liceBr || 0)) + 1;
  else if ('monitor' in draft) draft.monitor = st.app.me.name;
  return { list, id: null, draft, base: JSON.stringify(draft), dirty: false, isNew: true };
}
let lastFocus = null;
function render() {
  const a = document.activeElement;
  lastFocus = a && a.dataset && a.dataset.key ? { key: a.dataset.key, s: a.selectionStart, e: a.selectionEnd } : null;
  const sc = document.querySelector('.main'), scrollKey = `${st.view}|${st.space}|${st.caseId}|${st.step}|${st.faza}|${st.statSpace}`;
  // da se ekran ne vraca na vrh poslije svakog klika
  const keep = sc && scrollKey === lastScrollKey ? sc.scrollTop : null; lastScrollKey = scrollKey;
  const root = document.getElementById('app'); rendering = true; root.innerHTML = ''; rendering = false;
  if (!st.app) return;
  if (!st.app.configured) root.append(viewSetup());
  else if (!st.app.me) root.append(viewLogin());
  else root.append(viewShell());
  if (st.modal) root.append(viewModal());
  const sc2 = document.querySelector('.main'); if (sc2 && keep !== null) sc2.scrollTop = keep;
  if (lastFocus) { const el = root.querySelector(`[data-key="${CSS.escape(lastFocus.key)}"]`); if (el) { el.focus({ preventScroll: true }); try { if (lastFocus.s != null) el.setSelectionRange(lastFocus.s, lastFocus.e); } catch { } } }
}
let lastScrollKey = null;
let curV = null;
const WIDE_SEG = f => !!f.wide;
let rendering = false;
const caseRaw = {};
function renderTop() { const t = document.querySelector('.top-sync'); if (t) t.replaceWith(syncPill()); const n = document.querySelector('.nav-sync .badge'); if (n) { const b = (st.app.pending || 0) + (st.app.conflicts || 0); n.textContent = b; n.style.display = b ? '' : 'none'; } }

function viewModal() {
  const m = st.modal;
  return h('div', { class: 'modal-bg', onclick: e => { if (e.target.classList.contains('modal-bg')) m.done(false); } },
    h('div', { class: 'modal card', role: 'dialog' }, h('h2', {}, m.title), h('p', {}, m.text),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => m.done(false) }, 'Otkaži'),
        h('button', { class: 'btn ' + (m.danger ? 'danger' : 'primary'), onclick: () => m.done(true) }, m.okLabel || 'U redu'))));
}

function viewSetup() {
  const v = { projectId: '', apiKey: '' };
  return h('div', { class: 'center' }, h('div', { class: 'card login' },
    h('h1', {}, 'Pristupni podaci'),
    h('p', {}, 'Upišite podatke koje ste dobili od administratora. Ovo se radi samo jednom na ovom računaru.'),
    field('Project ID', h('input', { type: 'text', oninput: e => v.projectId = e.target.value.trim() })),
    field('Ključ', h('input', { type: 'text', oninput: e => v.apiKey = e.target.value.trim() })),
    h('div', { class: 'formbar' }, h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: async () => {
      st.app = await api.saveConfig(v); if (!st.app.configured) toast('Provjerite unesene podatke.', 'err'); render(); } }, 'Sačuvaj'))));
}
function field(label, input, hint) { return h('div', { class: 'field' }, h('label', {}, label), input, hint ? h('div', { class: 'hint' }, hint) : null); }
const login = { mode: 'login', email: '', password: '', password2: '' };
function viewLogin() {
  const m = login.mode;
  const submit = async () => {
    if (!login.email.includes('@')) return toast('Unesite e-mail adresu.', 'err');
    st.busy = true; render();
    try {
      if (m === 'login') { st.app = await api.login({ email: login.email, password: login.password }); st.data = await getData(); login.password = ''; toast('Dobrodošli! Preuzimam podatke…', 'ok'); }
      else if (m === 'register') {
        if (login.password.length < 6) throw new Error('Lozinka mora imati najmanje 6 znakova.');
        if (login.password !== login.password2) throw new Error('Lozinke se ne poklapaju.');
        await api.register({ email: login.email, password: login.password });
        login.mode = 'login'; login.password2 = '';
        st.modal = { title: 'Potvrdite e-mail', text: `Poslali smo link za potvrdu na ${login.email}. Otvorite ga (provjerite i neželjenu poštu), pa se prijavite. Pristup podacima dobijate kada vas administrator doda u listu korisnika.`, okLabel: 'U redu', done: () => { st.modal = null; render(); } };
      } else { await api.resetPassword({ email: login.email }); login.mode = 'login'; toast('Poslali smo link za novu lozinku na ' + login.email, 'ok'); }
    } catch (e) { toast(cleanErr(e), 'err'); }
    st.busy = false; render();
  };
  const key = ev => { if (ev.key === 'Enter') submit(); };
  return h('div', { class: 'center' }, h('div', { class: 'card login' },
    h('img', { src: 'logo.png', alt: 'CeMI', class: 'loginlogo' }), h('h1', {}, 'Praćenje suđenja'), h('p', {}, m === 'register' ? 'Registracija novog korisnika' : m === 'reset' ? 'Nova lozinka' : 'Prijava'),
    field('E-mail', h('input', { type: 'text', value: login.email, 'data-key': 'login.email', autocomplete: 'username', oninput: e => login.email = e.target.value, onkeydown: key })),
    m !== 'reset' ? field('Lozinka', h('input', { type: 'password', value: login.password, 'data-key': 'login.pw', autocomplete: m === 'register' ? 'new-password' : 'current-password', oninput: e => login.password = e.target.value, onkeydown: key }),
      m === 'register' ? 'Najmanje 6 znakova.' : null) : null,
    m === 'register' ? field('Ponovite lozinku', h('input', { type: 'password', value: login.password2, 'data-key': 'login.pw2', oninput: e => login.password2 = e.target.value, onkeydown: key })) : null,
    h('div', { class: 'formbar' },
      h('span', { class: 'small' }, m === 'login' ? [h('a', { onclick: () => { login.mode = 'register'; render(); } }, 'Novi korisnik? Registrujte se'), h('br'), h('a', { onclick: () => { login.mode = 'reset'; render(); } }, 'Zaboravljena lozinka')]
        : h('a', { onclick: () => { login.mode = 'login'; render(); } }, '← Nazad na prijavu')),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', disabled: st.busy, onclick: submit }, st.busy ? 'Sačekajte…' : m === 'login' ? 'Prijavi se' : m === 'register' ? 'Registruj se' : 'Pošalji link')),
    h('p', { class: 'small muted' }, 'Nakon prve prijave aplikacija radi i bez interneta; izmjene se šalju automatski kada se veza vrati.')));
}
function viewNoAccess() {
  return h('div', {}, topbar(h('h1', {}, 'Čeka se odobrenje')), h('div', { class: 'page' }, h('div', { class: 'card pane' },
    h('h2', {}, 'Vaš nalog još nema pristup podacima'),
    h('p', {}, `Prijavljeni ste kao ${st.app.me.email}. Zamolite administratora da vas doda u listu korisnika (Administracija → Korisnici). Nakon toga kliknite „Provjeri ponovo”.`),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', onclick: async () => { await api.syncNow(); st.app = await api.state(); st.data = await getData(); render(); } }, 'Provjeri ponovo'),
      h('button', { class: 'btn', onclick: async () => { st.app = await api.logout(); render(); } }, 'Odjava')))));
}
const cleanErr = e => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

function viewShell() {
  const badge = (st.app.pending || 0) + (st.app.conflicts || 0);
  const nav = (on, label, onclick, extra, cls) => h('button', { class: 'nav' + (on ? ' on' : '') + (cls ? ' ' + cls : ''), onclick }, label, extra);
  const goSpace = async sp => { if (!(await leaveEdit())) return; st.space = sp; st.statModule = moduleOf(sp); st.search = ''; st.filter = 'svi'; st.sud = '';
    try { localStorage.setItem('tm.space', sp); } catch { } st.view = 'cases'; render(); };
  const goStats = async sp => { if (!(await leaveEdit())) return; if (st.statSpace !== sp) { st.statSpace = sp; st.statModule = moduleOf(sp); st.statTopic = ST.SPACE_TOPICS[sp][0].key; st.statCase = ''; st.statCourt = ''; } st.view = 'stats'; render(); };
  const inSpace = sp => (st.view === 'cases' || st.view === 'case') && st.space === sp;
  return h('div', { class: 'shell' },
    h('aside', { class: 'side' },
      h('div', { class: 'brand' }, h('img', { src: 'logo.png', alt: 'CeMI', class: 'brandlogo' }), h('div', {}, h('b', {}, 'Praćenje suđenja'), h('span', {}, 'CeMI'))),
      updateBanner(),
      S.MODULES.filter(m => !m.archived).map(m => h('div', { class: 'modgroup' + (moduleOf(st.space) === m.key || st.statModule === m.key && (st.view === 'stats' || st.view === 'report') ? ' open' : '') },
        h('div', { class: 'modtitle' }, m.title),
        m.spaces.map(sp => [nav(inSpace(sp), S.SPACE_BY_KEY[sp].title, () => goSpace(sp), null, 'sub'),
          !ST.SPACE_TOPICS[sp] ? null : nav(st.view === 'stats' && st.statSpace === sp, m.spaces.length > 1 ? (sp.endsWith('_roc') ? 'Statistika ročišta' : 'Statistika uvida') : 'Statistika', () => goStats(sp), null, 'sub stat')]),
        h('div', { class: 'modreport' }, nav(st.view === 'report' && st.repModule === m.key, h('span', { class: 'rep-label' }, h('span', {}, '▤ Tabele za izvještaj'),
          h('small', {}, m.spaces.length > 1 ? 'cijeli modul – uvid i ročišta' : 'cijeli modul')),
          async () => { if (!(await leaveEdit())) return; st.repModule = m.key; st.statModule = m.key; st.view = 'report'; render(); }, null, 'sub report')))),
      h('div', { class: 'sep' }),
      nav(st.view === 'sync', 'Sinhronizacija', () => go('sync'), badge ? h('span', { class: 'badge' }, badge) : null, 'nav-sync'),
      st.app.isAdmin ? nav(st.view === 'admin', 'Administracija', () => { adm.users = null; go('admin'); }) : null,
      st.app.isAdmin ? nav(st.view === 'forms', 'Uređivanje formi', () => go('forms'), st.data && st.data.formsDraft ? h('span', { class: 'badge orange', title: 'Nacrt nije objavljen' }, 'nacrt') : null) : null,
      h('div', { class: 'grow' }),
      h('div', { class: 'me' }, h('b', {}, st.app.me.name), st.app.isAdmin ? h('span', { class: 'badge blue' }, 'Administrator') : h('span', {}, 'Monitor'), h('br'),
        h('a', { onclick: async () => { if (!(await leaveEdit())) return; st.app = await api.logout(); render(); } }, 'Odjava'))),
    h('main', { class: 'main' }, st.app.noAccess ? viewNoAccess() : st.view === 'case' ? viewCase() : st.view === 'stats' ? viewStats() : st.view === 'report' ? viewReport() : st.view === 'sync' ? viewSync()
      : st.view === 'admin' && st.app.isAdmin ? viewAdmin() : st.view === 'forms' && st.app.isAdmin ? viewForms() : viewCases()));
}
function syncPill() {
  const s = st.sync.state, p = st.app.pending || 0, c = st.app.conflicts || 0;
  let cls = 'ok', text = `Sinhronizovano ${ago(st.app.lastSync)}`;
  if (s === 'syncing') { cls = 'syncing'; text = st.sync.detail || 'Sinhronizacija…'; }
  else if (s === 'quota') { cls = 'offline'; text = 'Dnevni limit Firebasea potrošen' + (p ? ` · ${p} izmjena čeka slanje` : ''); }
  else if (s === 'offline' || !navigator.onLine) { cls = 'offline'; text = p ? `Van mreže · ${p} izmjena čeka slanje` : 'Van mreže · podaci su sačuvani lokalno'; }
  else if (s === 'error') { cls = 'error'; text = 'Greška pri sinhronizaciji – kliknite za detalje'; }
  else if (s === 'login') { cls = 'error'; text = 'Potrebna ponovna prijava'; }
  else if (s === 'noaccess') { cls = 'error'; text = 'Nalog čeka odobrenje'; }
  else if (c) { cls = 'error'; text = `${c} konflikt(a) – potrebna odluka`; }
  else if (p) { cls = 'syncing'; text = `${p} izmjena čeka slanje`; }
  return h('button', { class: 'pill top-sync ' + cls, title: 'Otvori sinhronizaciju', onclick: () => go('sync') }, h('i'), text);
}
function topbar(...left) { return h('div', { class: 'top' }, ...left, h('span', { class: 'grow' }), syncPill()); }

function viewCases() {
  const sp = S.SPACE_BY_KEY[st.space], mod = moduleOf(st.space), list = caseList(), roc = st.space.endsWith('_roc');
  const rocL = roc ? S.listsOf(st.space)[1].key : null;
  const q = st.search.trim().toLowerCase();
  const prit = c => c.fields.Pritvorskipredmet === true || c.fields.pritvorski === true;
  const F = { svi: () => true, prit, ok: c => c.fields.Vrstapredmeta === 'Organizovani kriminal', vk: c => c.fields.Vrstapredmeta === 'Visoka korupcija',
    otvoreni: c => !S.isDate(c.fields.Odlaganjero_x010d_i_x0161_ta), moji: c => c.createdBy === st.app.me.name || c.fields.monitor === st.app.me.name };
  const all = recs(list);
  const courts = [...new Set(all.map(c => c.fields.sud).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sr'));
  const rows = all.filter(F[st.filter] || F.svi).filter(c => !st.sud || c.fields.sud === st.sud)
    .filter(c => !q || [c.fields.Title, c.fields.Brojoptu_x017e_nice, c.fields.krivicnoDjelo, c.fields.sud].some(x => (x || '').toLowerCase().includes(q)))
    .sort((a, b) => String(b.modifiedAt || '').localeCompare(String(a.modifiedAt || '')));
  const chip = (k, l) => h('button', { class: 'chip' + (st.filter === k ? ' on' : ''), onclick: () => { st.filter = k; render(); } }, l);
  const cust = !!sp.custom;
  const chips = cust ? [chip('svi', 'Svi'), chip('moji', 'Moji unosi')] : [chip('svi', 'Svi'), mod !== 'vaw' ? chip('prit', 'Pritvorski') : null, !roc && mod !== 'vaw' ? chip('otvoreni', 'Bez pravosnažnosti') : null,
    st.space === 'okk' ? [chip('ok', 'Org. kriminal'), chip('vk', 'Visoka korupcija')] : null, chip('moji', 'Moji unosi')];
  const hasSud = mod !== 'okk';
  const cols = cust ? ['Predmet', 'Sud', 'Popunjenost', 'Posljednja izmjena'] : roc ? ['Predmet', hasSud ? 'Sud' : null, 'Krivično djelo', 'Ročišta', 'Posljednje ročište', 'Posljednja izmjena', ' ']
    : mod === 'vaw' ? ['Predmet', 'Sud', 'Krivično djelo', 'Glavna sankcija', 'Oznake', 'Posljednja izmjena']
    : ['Predmet', hasSud ? 'Sud' : 'Vrsta', 'Optužni akt', 'Oznake', 'Popunjenost', 'Posljednja izmjena'];
  const newLabel = roc ? '+ Novi praćeni predmet' : '+ Novi predmet';
  const fl = stepList('faze'), nPh = c => fl ? allChildRecs(fl.key, c.id).length : 0;
  const tags = c => [prit(c) ? h('span', { class: 'badge blue' }, 'pritvor') : null, ' ', nPh(c) ? h('span', { class: 'badge orange' }, nPh(c) === 1 ? 'ponovljeno suđenje' : `${nPh(c)} ponovljena suđenja`) : null, ' ',
    S.isDate(c.fields.Odlaganjero_x010d_i_x0161_ta) ? h('span', { class: 'badge ok' }, 'pravosnažno') : null,
    mod === 'vaw' && c.fields.prijavljivala ? h('span', { class: 'badge warn' }, 'ranije prijavljivala') : null];
  const cell = (c, col) => {
    const f = c.fields, steps = col === 'Popunjenost' ? stepsFor(c).filter(s => !s.na) : null, H = rocL ? childRecs(rocL, c.id) : [];
    switch (col) {
      case 'Predmet': return h('td', {}, h('b', {}, f.Title || '(bez broja)'), c.dirty ? [' ', h('span', { class: 'badge warn', title: 'Čeka slanje na server' }, 'nije poslato')] : null);
      case 'Sud': return h('td', {}, f.sud || h('span', { class: 'muted' }, '—'));
      case 'Vrsta': return h('td', {}, f.Vrstapredmeta || h('span', { class: 'muted' }, '—'));
      case 'Optužni akt': return h('td', {}, f.Vrstaoptu_x017e_nogakta || h('span', { class: 'muted' }, '—'));
      case 'Krivično djelo': return h('td', { class: 'small' }, f.krivicnoDjelo || h('span', { class: 'muted' }, '—'));
      case 'Glavna sankcija': return h('td', { class: 'small' }, f.glavnaSankcija || h('span', { class: 'muted' }, '—'));
      case 'Oznake': return h('td', {}, tags(c));
      case 'Ročišta': return h('td', {}, `${H.length}`, H.length ? h('span', { class: 'small muted' }, ` (${H.filter(x => !x.fields.odrzano).length} odloženo)`) : null);
      case ' ': return h('td', { style: 'text-align:right' }, h('button', { class: 'btn small', title: 'Dodaj novo ročište u ovaj predmet', onclick: ev => { ev.stopPropagation(); addHearing(c.id); } }, '+ Ročište'));
      case 'Posljednje ročište': return h('td', {}, S.fmtDate(H.map(x => x.fields.datum).filter(S.isDate).sort().pop()) || h('span', { class: 'muted' }, '—'));
      case 'Popunjenost': return h('td', { title: steps.filter(s => s.count || s.none).map(s => s.title).join(', ') }, h('div', { class: 'progress' }, steps.map(s => h('i', { class: s.count || s.none ? 'done' : '' })),
        h('span', { class: 'small muted', style: 'margin-left:6px' }, `${steps.filter(s => s.count || s.none).length}/${steps.length}`)));
      case 'Posljednja izmjena': return h('td', { class: 'small muted' }, c.modifiedBy || '', h('br'), ago(c.modifiedAt));
    }
  };
  return h('div', {}, topbar(h('div', {}, h('div', { class: 'small muted' }, S.MODULES.find(m => m.key === mod).title), h('h1', {}, sp.title)), h('span', { class: 'muted' }, `${all.length} predmeta`)),
    h('div', { class: 'page' },
      h('div', { class: 'toolbar' },
        h('input', { type: 'search', class: 'search', placeholder: 'Traži po broju predmeta, optužnog akta ili krivičnom djelu…', value: st.search, 'data-key': 'search', oninput: e => { st.search = e.target.value; render(); } }),
        hasSud && courts.length ? h('select', { style: 'width:220px', onchange: e => { st.sud = e.target.value; render(); } }, h('option', { value: '' }, 'Svi sudovi'), courts.map(ct => h('option', { value: ct, selected: st.sud === ct }, ct))) : null,
        h('div', { class: 'chips' }, chips),
        h('span', { style: 'flex:1' }),
        h('button', { class: 'btn primary', onclick: () => { st.view = 'case'; st.caseId = null; st.pendingCase = null; st.step = list; st.edit = newEdit(list); if (st.sud && 'sud' in st.edit.draft) { st.edit.draft.sud = st.sud; st.edit.base = JSON.stringify(st.edit.draft); } render(); } }, newLabel)),
      h('div', { class: 'card' }, rows.length ? h('table', { class: 'grid' },
        h('thead', {}, h('tr', {}, cols.filter(Boolean).map(c => h('th', {}, c)))),
        h('tbody', {}, rows.slice(0, 500).map(c => h('tr', { class: 'click', onclick: () => openCase(c.id) }, cols.filter(Boolean).map(col => cell(c, col))))))
        : h('div', { class: 'empty' }, all.length ? 'Nijedan predmet ne odgovara pretrazi.' : `Još nema predmeta. Kliknite „${newLabel.slice(2)}” da unesete prvi${st.app.isAdmin ? ', ili uvezite postojeće podatke u Administraciji' : ''}.`)),
      rows.length > 500 ? h('p', { class: 'small muted' }, `Prikazano prvih 500 od ${rows.length} – suzite pretragu.`) : null));
}
// --- predmet ---
function viewCase() {
  const c = caseRec(st.caseId), steps = stepsFor(c);
  const cur = steps.find(s => s.key === st.step), i = steps.indexOf(cur);
  const roc = st.space.endsWith('_roc');
  const title = c ? S.caseTitle(c.fields) : (roc ? 'Novi praćeni predmet' : 'Novi predmet');
  const single = steps.length === 1;
  return h('div', {}, topbar(h('button', { class: 'btn ghost', onclick: () => go('cases') }, '← ' + S.SPACE_BY_KEY[st.space].title),
    h('div', { class: 'casehead' }, h('h1', {}, title), c ? h('div', { class: 'tags' },
      c.fields.Vrstapredmeta ? h('span', { class: 'badge' }, c.fields.Vrstapredmeta) : null,
      c.fields.krivicnoDjelo ? h('span', { class: 'badge' }, c.fields.krivicnoDjelo.slice(0, 40)) : null,
      c.fields.Pritvorskipredmet || c.fields.pritvorski ? h('span', { class: 'badge blue' }, 'pritvorski') : null,
      S.isDate(c.fields.Odlaganjero_x010d_i_x0161_ta) ? h('span', { class: 'badge ok' }, 'pravosnažno ' + S.fmtDate(c.fields.Odlaganjero_x010d_i_x0161_ta)) : null) : null)),
    h('div', { class: 'page' }, c && stepList('faze') ? phaseBar(c) : null, h('div', { class: single ? '' : 'workspace' },
      single ? null : h('nav', { class: 'card steps' }, steps.map(s => h('button', {
        class: 'step' + (s.key === st.step ? ' on' : '') + (s.count || s.none ? ' done' : '') + (s.na ? ' na' : ''), disabled: !c && !s.isCase && !previewMode(),
        title: s.na || (!c && !s.isCase ? (previewMode() ? 'Pregled forme (administrator) – unos se može sačuvati tek kad sačuvate osnovne podatke.' : 'Prvo sačuvajte osnovne podatke predmeta.') : ''),
        onclick: async () => { if (!(await leaveEdit(true))) return; st.step = s.key; startStep(); render(); } },
        h('span', { class: 'n' }, s.count || s.none ? '✓' : s.idx), s.title, s.count > 1 ? h('span', { class: 'badge' }, s.count) : s.none ? h('span', { class: 'badge' }, 'nije bilo') : null))),
      h('section', { class: 'card pane' },
        h('div', { class: 'pane-head' }, h('h2', {}, single ? cur.title : `${cur.idx}. ${cur.title}`), h('span', { class: 'grow' }),
          cur.many && c && !st.edit ? h('button', { class: 'btn primary', onclick: () => { st.edit = newEdit(st.step); if (S.baseKey(st.step) === 'rocista') { const prev = childRecs(st.step, st.caseId).map(x => x.fields.datumNarednog).filter(S.isDate).sort().pop(); if (prev) { st.edit.draft.datum = prev; st.edit.base = ''; st.edit.dirty = true; } } render(); } }, '+ Dodaj') : null),
        st.edit && st.edit.preview ? h('div', { class: 'note' }, 'Pregled forme: predmet još nije sačuvan, pa se ovaj unos ne može sačuvati. Upisano služi samo da vidite kako forma radi i nestaje kad pređete na drugi korak.') : null,
        c && !cur.na && S.baseKey(cur.key) === 'odlaganja' ? (() => { const vc = validationCtx(), b = Number(vc.brojOdlozenih) || 0, n = childRecs(cur.key, c.id).length;
          return b ? h('div', { class: 'note ' + (n === b ? 'ok' : 'warn') }, n === b ? `Uneseno je svih ${b} odloženih ročišta.` : `Uneseno ${n} od ${b} odloženih ročišta${n > b ? ' – više nego što piše u ' + (st.faza > 1 ? 'podacima o ponovljenom suđenju' : 'osnovnim podacima') : ''}.`,
            n !== b ? [' ', h('a', { onclick: () => stepTo(st.faza > 1 ? stepList('faze').key : caseList()) }, st.faza > 1 ? '← Podaci o ponovljenom suđenju' : '← Osnovni podaci')] : null) : null; })() : null,
        c && NIJE_BILO[S.baseKey(cur.key)] && !childRecs(cur.key, c.id).length && !st.edit ? h('label', { class: 'nijebilo' + (cur.none ? ' on' : '') },
          h('input', { type: 'checkbox', checked: !!cur.none, onchange: e => setNijeBilo(c, cur.key, e.target.checked) }), NIJE_BILO[S.baseKey(cur.key)] + (st.faza > 1 && S.isPhased(cur.key) ? ` (ponovljeno suđenje ${st.faza - 1})` : '')) : null,
        cur.na && c ? h('div', { class: 'note warn' }, cur.na + ' Podatke i dalje možete unijeti ako je potrebno.',
          S.baseKey(cur.key) === 'odlaganja' ? [' ', h('a', { onclick: () => stepTo(st.faza > 1 ? stepList('faze').key : caseList()) }, st.faza > 1 ? '← Podaci o ponovljenom suđenju' : '← Osnovni podaci')] : null) : null,
        S.baseKey(cur.key) === 'odlaganja' && c && c.fields._razloziAS ? h('div', { class: 'note' }, 'Zbirni razlozi odlaganja iz AppSheeta: ',
          Object.entries(c.fields._razloziAS).map(([k, v]) => `${k.replace('ods:', 'odsustvo ').replace('neur:', 'neuredna dostava – ')}: ${v}`).join(' · '), '. Uračunati su u statistiku.') : null,
        cur.many && !(st.edit && st.edit.preview) ? viewEntries(cur) : null,
        st.edit ? viewForm() : (cur.many && !childRecs(st.step, st.caseId).length ? h('div', { class: 'empty' }, 'Još nema unosa. Kliknite „+ Dodaj”.') : null),
        (c || previewMode()) && !single ? h('div', { class: 'stepnav' },
          i > 0 ? h('button', { class: 'btn ghost', onclick: () => stepTo(steps[i - 1].key) }, `← ${steps[i - 1].title}`) : h('span'),
          i < steps.length - 1 ? h('button', { class: 'btn', onclick: () => stepTo(steps[i + 1].key) }, `${steps[i + 1].title} →`) : h('button', { class: 'btn', onclick: () => go('cases') }, 'Završi i vrati se na listu')) : null))));
}
async function stepTo(key) { if (!(await leaveEdit(true))) return; st.step = key; startStep(); render(); document.querySelector('.main').scrollTop = 0; }

function viewEntries(cur) {
  const df = (S.fieldsOf(cur.key).find(f => f.type === 'date') || {}).name;
  const list = childRecs(cur.key, st.caseId).sort((a, b) => String(df && a.fields[df] || '9999').localeCompare(String(df && b.fields[df] || '9999')) || String(a.modifiedAt).localeCompare(String(b.modifiedAt)));
  if (!list.length) return null;
  return h('div', { class: 'entries' }, list.map(r => h('div', { class: 'entry' + (st.edit && st.edit.id === r.id ? ' on' : ''),
    onclick: async () => { if (st.edit && st.edit.id === r.id) return; if (!(await leaveEdit())) return; st.edit = editOf(cur.key, r); render(); } },
    h('div', { class: 'grow' }, h('div', {}, S.summarize(cur.key, r.fields)),
      h('div', { class: 'meta' }, r.createdBy ? `Unio/la: ${r.createdBy}` : '', r.modifiedAt ? ` · ${ago(r.modifiedAt)}` : '')),
    r.conflict ? h('span', { class: 'badge err' }, 'konflikt') : r.dirty ? h('span', { class: 'badge warn' }, 'nije poslato') : null)));
}

function phaseBar(c) {
  const ph = phasesOf(c.id), fl = stepList('faze'), zl = stepList('zalba');
  const last = Math.max(...ph), ukinutaU = n => zl && allChildRecs(zl.key, c.id).some(z => (z.fields.faza || 1) === n && /ukida/i.test(z.fields.Odlukaudrugostepenompostupku || ''));
  const mozeNovo = ukinutaU(last);
  if (ph.length === 1 && !mozeNovo) return null;
  const label = n => n === 1 ? 'Prvo suđenje' : `Ponovljeno suđenje ${n - 1}`;
  const numOf = n => n === 1 ? c.fields.Title : ((allChildRecs(fl.key, c.id).find(f => (f.fields.faza || 2) === n) || { fields: {} }).fields.brojPredmeta || '');
  const ukinuta = zl && allChildRecs(zl.key, c.id).some(z => (z.fields.faza || 1) === st.faza && /ukida/i.test(z.fields.Odlukaudrugostepenompostupku || ''));
  const next = Math.max(...ph) + 1;
  const switchTo = async n => { if (!(await leaveEdit())) return; st.faza = n;
    if (S.baseKey(st.step) === 'faze' && n === 1) st.step = caseList();
    startStep(); render(); };
  const add = async () => { if (!(await leaveEdit())) return;
    const f = {}; for (const x of S.fieldsOf(fl.key)) f[x.name] = x.type === 'bool' ? false : null; f.Predmet = c.id; f.faza = next;
    await api.save({ list: fl.key, id: null, fields: f }); st.data = await getData();
    st.faza = next; st.step = fl.key; startStep(); render(); toast(`Dodato: ${label(next)}. Upišite broj predmeta i datume, pa unosite odlaganja, presudu i žalbu za ovo suđenje.`, 'ok'); };
  return h('div', { class: 'phasebar' },
    h('span', { class: 'small muted' }, 'Suđenje:'),
    h('div', { class: 'chips' }, ph.map(n => h('button', { class: 'chip' + (st.faza === n ? ' on' : ''), onclick: () => switchTo(n) }, label(n), numOf(n) && n > 1 ? h('span', { class: 'chipsub' }, ' · ' + numOf(n)) : null))),
    mozeNovo ? h('button', { class: 'btn accent', onclick: add }, `+ Ponovljeno suđenje ${last}`) : null,
    mozeNovo ? h('span', { class: 'small', style: 'color:var(--orange-ink)' }, `Drugostepeni sud je ukinuo presudu ${last === 1 ? 'iz prvog suđenja' : 'iz ponovljenog suđenja ' + (last - 1)} – predmet je vraćen na ponovno suđenje.`) : null,
    st.faza > 1 ? h('span', { class: 'small muted' }, 'Pritvor, jemstvo, ishod, vanredni pravni ljekovi i komentari važe za cijeli predmet.') : null);
}
function validationCtx() {
  const ctx = {}, ol = stepList('odlaganja');
  const c = st.caseId && caseRec(st.caseId), e = st.edit;
  ctx.noviZKP = S.noviZKP(e && S.LIST_BY_KEY[e.list] && S.LIST_BY_KEY[e.list].isCase ? e.draft : c ? c.fields : st.pendingCase && st.pendingCase.draft);
  ctx.case = e && S.LIST_BY_KEY[e.list] && S.LIST_BY_KEY[e.list].isCase ? e.draft : c ? c.fields : (st.pendingCase ? st.pendingCase.draft : {});
  ctx.kids = base => { const l = stepList(base); return l && st.caseId ? allChildRecs(l.key, st.caseId).map(r => ({ ...r.fields, _id: r.id })) : []; };
  ctx.editId = e && e.id; ctx.faza = st.faza;
  if (c) { const fl = stepList('faze'); const src = st.faza > 1 && fl ? (allChildRecs(fl.key, c.id).find(x => (x.fields.faza || 2) === st.faza) || { fields: {} }).fields : c.fields; ctx.brojOdlozenih = src.Brojodlo_x017e_enihro_x010d_i_x0 ?? null; }
  ctx.orig = e && e.id ? (recs(e.list).find(r => r.id === e.id) || {}).fields || null : null;
  if (st.caseId && ol) {
    const od = childRecs(ol.key, st.caseId);
    ctx.odlaganjaCount = od.length;
    ctx.lastAdjournedTo = od.map(o => o.fields.Odlo_x017e_enodo).filter(S.isDate).sort().pop();
  }
  return ctx;
}
function dupOf(list, d, id) {
  if (!S.LIST_BY_KEY[list].isCase || list === 'vaw_predmeti' || !d.Title) return null;
  const t = d.Title.trim().toLowerCase(), sud = (d.sud || '').trim();
  const nb = (d.napomenaBroja || '').trim().toLowerCase();
  return recs(list).find(r => r.id !== id && (r.fields.Title || '').trim().toLowerCase() === t && (r.fields.sud || '').trim() === sud && (r.fields.napomenaBroja || '').trim().toLowerCase() === nb);
}
function viewForm() {
  const e = st.edit, list = e.list, d = e.draft;
  const v = S.validate(list, d, validationCtx());
  const dup = dupOf(list, d, e.id);
  if (dup) v.errors.Title = 'Predmet sa ovim brojem već postoji' + (d.sud ? ' u ovom sudu.' : '.');
  const showAll = e.touched;
  const rec = e.id ? recs(list).find(r => r.id === e.id) : null;
  const els = [];
  let secVisible = true;
  const vctx = validationCtx(); curV = v;
  const WIDE = ['longtext', 'multichoice', 'djela', 'razlozi', 'mjereunosi', 'pritvortok', 'zrtve', 'optuzeni', 'sankcije'];
  const shown = f => !f.section && !f.break && f.name && f.name !== 'Predmet' && !f.hidden && (st.showAllFields || S.isVisible(f, d, vctx));
  const FL = S.FORMS[list]; let col = 0, thirds = 0, rowStart = false;
  if (['pritvori', 'jemstva', 'nadzor'].includes(S.baseKey(list)) && d.liceBr) els.push(h('div', { class: 'section lice' }, `Lice ${d.liceBr}`));
  for (const [fi, f] of FL.entries()) {
    if (f.section) { secVisible = st.showAllFields || S.sectionVisible(f, d, vctx); if (secVisible) { els.push(h('div', { class: 'section' }, f.section)); col = 0; } continue; }
    if (f.break) { if (col) rowStart = true; col = 0; continue; }
    if (!shown(f)) continue;
    const qrow = isQRow(f, list, d);
    const isWide = qrow || (WIDE.includes(f.type) && !f.half) || f.wide;
    if (f.rowStart && col) { rowStart = true; col = 0; }
    if (f.third) { if (col && !thirds) rowStart = true; col = 0; thirds++; }
    else if (thirds) { if (thirds % 3) rowStart = true; thirds = 0; col = 0; }
    if (f.third) {  }
    else if (isWide) col = 0;
    else {
      const next = FL.slice(fi + 1).find(x => x.section || x.break || shown(x));
      const dependsOnF = x => x && x.show && new RegExp(`\\br(?:\\.${f.name}\\b|\\[['"]${f.name}['"]\\])`).test(x.show.toString());
      const pairStart = f.type === 'bool' && next && !next.section && !next.break && dependsOnF(next) && !WIDE.includes(next.type) && !next.wide;
      if (pairStart && col === 1) { rowStart = true; col = 0; }
      col = (col + 1) % 2;
    }
    const err = v.errors[f.name], warn = v.warnings[f.name];
    const touched = showAll || (e.touchedFields && e.touchedFields[f.name]);
    const rs = rowStart && !isWide; rowStart = false;
    els.push(h('div', { class: 'field' + (isWide ? ' wide' : '') + (qrow ? ' qrow' : '') + (f.third ? ' third' : '') + (rs ? ' rowstart' : '') + (err && touched ? ' has-err' : '') },
      f.label && !GRUPE[f.type] ? h('label', {}, f.label, f.required && S.OBAVEZNA_POLJA ? h('span', { class: 'req' }, '*') : null) : null,
      input(f, list, d),
      f.hint ? h('div', { class: 'hint' }, f.hint) : null,
      err && (touched || (f.name === 'Title' && dup)) ? h('div', { class: 'msg err' }, err,
        f.name === 'Title' && dup ? [' ', h('a', { onclick: async () => { st.edit = null; if (stepList('rocista')) await addHearing(dup.id); else await openCase(dup.id); } }, stepList('rocista') ? 'Otvori taj predmet i dodaj ročište →' : 'Otvori taj predmet →')] : null)
        : warn ? h('div', { class: 'msg warn' }, '⚠ ' + warn) : null));
  }
  const nErr = Object.keys(v.errors).length;
  return h('div', {},
    rec && rec.conflict ? h('div', { class: 'note warn' }, 'Ovaj zapis ima konflikt sa verzijom na serveru. ', h('a', { onclick: () => go('sync') }, 'Riješi konflikt →')) : null,
    h('div', { class: 'form' }, els),
    h('div', { class: 'formbar' },
      e.preview ? h('span', { class: 'small muted' }, 'Pregled – čuvanje nije moguće') : h('button', { class: 'btn primary', onclick: save, disabled: !e.dirty && !e.isNew }, e.isNew ? 'Sačuvaj' : 'Sačuvaj izmjene'),
      !e.preview && (S.LIST_BY_KEY[list].many || e.dirty) ? h('button', { class: 'btn', onclick: cancelEdit }, 'Otkaži') : null,
      h('span', { class: 'kbd' }, 'Ctrl+S čuva · Esc otkazuje'),
      h('span', { class: 'grow' }),
      st.app.isAdmin ? h('label', { class: 'small muted showall', title: 'Za probnu fazu: prikazuje i polja koja se inače pojavljuju tek nakon određenog odgovora.' },
        h('input', { type: 'checkbox', checked: !!st.showAllFields, onchange: ev => { st.showAllFields = ev.target.checked; render(); } }), ' Prikaži sva polja') : null,
      showAll && nErr ? h('span', { class: 'small', style: 'color:var(--err)' }, `Ispravite ${nErr} polje(a) označeno crveno.`) : null,
      rec ? h('span', { class: 'recmeta' }, rec.createdBy ? `Unio/la ${rec.createdBy}` : '', rec.modifiedBy && rec.modifiedBy !== rec.createdBy ? ` · izmijenio/la ${rec.modifiedBy}` : '') : null,
      rec && canDelete(rec) ? h('button', { class: 'btn danger', onclick: () => del(rec) }, 'Obriši predmet') : null));
}
function setDjela(name, list) {
  const e = st.edit; e.draft.krivicnoDjelo = [...new Set(list.map(x => (S.kzClan(x.clan) || {}).naziv).filter(Boolean))].join('; ') || (list.length ? null : e.draft.krivicnoDjelo);
  e.draft.clanKZ = list.map(x => x.clan ? `${x.clan}${x.stav ? '/' + x.stav : ''}` : '').filter(Boolean).join(', ') || (list.length ? null : e.draft.clanKZ);
  setVal(name, list.length ? list : null);
}
function kzDatalist(list, caseRec) {
  const okk = S.isOkk(list), rz = okk ? S.sdtRezim(caseRec) : null;
  const ok401a = okk && st.edit && (st.edit.draft.djela || []).some(x => x.clan === '401a');
  const ent = Object.entries(S.KZ.CLANOVI);
  return h('datalist', { id: 'kz-clanovi' }, ent.map(([c, v]) => h('option', { value: `${c} – ${v[0]}` })));
}
function setVal(name, val) {
  const e = st.edit; e.draft[name] = val; e.touchedFields = { ...(e.touchedFields || {}), [name]: true };
  for (const f of S.fieldsOf(e.list)) if (f.dependsOn === name && f.filter && e.draft[f.name] && !f.filter(e.draft[f.name], e.draft)) e.draft[f.name] = null;
  e.dirty = JSON.stringify(e.draft) !== e.base;
  render();
}
function isQRow(f, list, d) {
  if (f.type === 'bool') return true;
  if (f.type !== 'choice' || f.allowNew || f.dependsOn) return false;
  let opts = choicesOf(list, f.name); if (f.filter) opts = opts.filter(o => f.filter(o, d));
  return opts.length > 0 && opts.length <= 4 && opts.join('').length <= 32;
}
function input(f, list, d) {
  const key = `${list}.${f.name}`, v = d[f.name];
  switch (f.type) {
    case 'mjereunosi': {
      const list0 = S.rocMjere(d).map(m => ({ ...m }));
      const put = n => { const e = st.edit; Object.assign(e.draft, S.rocMjereZbir(n)); setVal(f.name, n.length ? n : null); };
      return h('div', { class: 'rz-lista' }, S.ROC_MJERE.map(M => { const mine = list0.map((m, i) => [m, i]).filter(([m]) => m.vrsta === M.vrsta);
        const add = () => put([...list0, { vrsta: M.vrsta, lice: M.lica.length === 1 ? M.lica[0] : null, ime: null, iznos: null, opis: null }]);
        return h('div', { class: 'rz-red col' + (mine.length ? ' on' : '') },
          h('div', { class: 'rz-top' },
            h('label', { class: 'rz-check' }, h('input', { type: 'checkbox', checked: mine.length > 0, 'data-key': `${key}.${M.vrsta}`, onchange: () => mine.length ? put(list0.filter(m => m.vrsta !== M.vrsta)) : add() }), M.label),
            mine.length ? h('button', { class: 'btn ghost small', onclick: add }, '+ Dodaj još') : null),
          mine.map(([m, i], k) => h('div', { class: 'rz-unos' },
            h('span', { class: 'small muted' }, `${k + 1}.`),
            M.lica.length > 1 ? h('select', { class: 'rz-det', 'data-key': `${key}.${i}.lice`, onchange: e => { list0[i].lice = e.target.value || null; put(list0); } },
              h('option', { value: '' }, 'Kome…'), M.lica.map(o => h('option', { value: o, selected: m.lice === o }, o))) : h('span', { class: 'rz-fix' }, M.lica[0]),
            M.iznos ? h('input', { type: 'number', min: 0, step: '0.01', class: 'rz-det small-in', placeholder: 'Iznos (€)', value: m.iznos ?? '', 'data-key': `${key}.${i}.iznos`, oninput: e => { list0[i].iznos = e.target.value === '' ? null : Number(e.target.value); put(list0); } }) : null,
            M.opis ? h('input', { type: 'text', class: 'rz-det', placeholder: 'Opis mjere', value: m.opis || '', 'data-key': `${key}.${i}.opis`, oninput: e => { list0[i].opis = e.target.value || null; put(list0); } }) : null,
            h('button', { class: 'btn ghost small', title: 'Ukloni', onclick: () => put(list0.filter((_, j2) => j2 !== i)) }, '✕')))); }));
    }
    case 'razlozi': {
      const r = S.rocRazlozi(d), save = patch => { const n = { ...r, ...patch }; setVal(f.name, n.odsutni.length || n.ostali.length || n.opis ? n : null); };
      const ods = u => r.odsutni.find(o => o.ucesnik === u);
      const toggleU = u => save({ odsutni: ods(u) ? r.odsutni.filter(o => o.ucesnik !== u) : [...r.odsutni, { ucesnik: u, dostava: null }] });
      const setDost = (u, v) => save({ odsutni: r.odsutni.map(o => o.ucesnik === u ? { ...o, dostava: o.dostava === v ? null : v } : o) });
      const MULTI = 'Zahtjevi stranaka';
      const setOne = (rs, v) => save({ ostali: [...r.ostali.filter(x => !rs.includes(x)), ...(v ? [v] : [])] });
      const toggleR = x => save({ ostali: r.ostali.includes(x) ? r.ostali.filter(y => y !== x) : [...r.ostali, x] });
      return h('div', { class: 'razlozi' },
        h('div', { class: 'rz-grupa' }, h('div', { class: 'rz-naslov' }, 'Odsustvo lica'),
          h('div', { class: 'rz-lista' }, S.ODL_UCESNICI.map(u => { const o = ods(u);
            return h('div', { class: 'rz-red col' + (o ? ' on' : '') },
              h('label', { class: 'rz-check' }, h('input', { type: 'checkbox', checked: !!o, 'data-key': `${key}.u.${u}`, onchange: () => toggleU(u) }), u),
              o ? h('div', { class: 'rz-sub' }, S.ODL_DOSTAVA.map(([v, l]) => h('label', { class: 'rz-check sub' }, h('input', { type: 'radio', name: `${key}.d.${u}`, checked: o.dostava === v, 'data-key': `${key}.d.${u}.${v}`,
                onclick: () => setDost(u, v) }), l))) : null); }))),
        S.ODL_GRUPE.map(([g, rs]) => h('div', { class: 'rz-grupa' }, h('div', { class: 'rz-naslov' }, g),
          g === MULTI
            ? h('div', { class: 'rz-lista' }, rs.map(x => h('div', { class: 'rz-red' + (r.ostali.includes(x) ? ' on' : '') },
                h('label', { class: 'rz-check' }, h('input', { type: 'checkbox', checked: r.ostali.includes(x), 'data-key': `${key}.r.${x}`, onchange: () => toggleR(x) }), x))))
            : h('select', { 'data-key': `${key}.g.${g}`, onchange: e => setOne(rs, e.target.value) }, h('option', { value: '' }, '— nije razlog —'),
                rs.map(x => h('option', { value: x, selected: r.ostali.includes(x) }, x))))),
        r.ostali.some(x => S.ODL_OPIS.includes(x)) || r.opis ? h('div', { class: 'rz-grupa' }, h('div', { class: 'rz-naslov' }, 'Opis razloga'),
          h('input', { type: 'text', placeholder: 'Opišite razlog (viša sila, drugi razlozi…)', value: r.opis || '', 'data-key': `${key}.opis`, oninput: e => save({ opis: e.target.value || null }) })) : null);
    }
    case 'zrtve': case 'optuzeni': case 'sankcije': {
      const G = GRUPE[f.type], polje = G.polje || f.name, saved = G.of(d);
      const list0 = saved.length ? saved.map(x => ({ ...x })) : [{ ...G.prazno }];
      const put = n => setVal(polje, n.length ? n : null);
      const upd = (i, patch) => put(list0.map((x, j) => j === i ? { ...x, ...patch } : x));
      const pk = (i, n) => `${key}.${i}.${n}`;
      const unos = (x, i, [n, tip, lbl, opt]) => {
        opt = opt || {};
        if (opt.show && !opt.show(x)) return null;
        if (tip === 'bool') return h('div', { class: 'zrtva-q' }, h('span', {}, lbl), h('div', { class: 'seg' },
          h('button', { class: x[n] === true ? 'on' : '', 'data-key': pk(i, n) + '.da', onclick: () => upd(i, { [n]: true }) }, 'Da'),
          h('button', { class: x[n] !== true ? 'on' : '', 'data-key': pk(i, n) + '.ne', onclick: () => upd(i, { [n]: false }) }, 'Ne')));
        const inp = tip === 'longtext' ? h('textarea', { 'data-key': pk(i, n), oninput: e => upd(i, { [n]: e.target.value || null }) }, x[n] || '')
          : tip === 'choice' ? h('select', { 'data-key': pk(i, n), onchange: e => upd(i, { [n]: e.target.value || null }) }, h('option', { value: '' }, '— izaberite —'),
              [...new Set([...choicesOf(list, opt.izbori), ...(x[n] ? [x[n]] : [])])].map(o => h('option', { value: o, selected: x[n] === o }, o)))
          : tip === 'number' ? h('input', { type: 'number', min: 0, max: opt.max ?? null, step: 1, value: x[n] ?? '', 'data-key': pk(i, n), oninput: e => upd(i, { [n]: e.target.value === '' ? null : Number(e.target.value) }) })
          : h('input', { type: 'text', value: x[n] || '', 'data-key': pk(i, n), oninput: e => upd(i, { [n]: e.target.value || null }) });
        return h('div', { class: 'field grupa-polje' + (opt.cls ? ' ' + opt.cls : '') }, h('label', {}, lbl), inp, opt.hint ? h('div', { class: 'hint' }, opt.hint) : null);
      };
      return h('div', { class: 'djela' },
        list0.map((x, i) => h('div', { class: 'djelo' },
          h('div', { class: 'djelo-row' }, h('div', { class: 'naziv' }, G.naslov(x, i)),
            G.dodaj && list0.length > 1 ? h('button', { class: 'btn ghost small', title: 'Ukloni', onclick: () => put(list0.filter((_, j) => j !== i)) }, '✕') : null),
          h('div', { class: 'grupa-polja' }, G.polja.map(p => unos(x, i, p))))),
        G.dodaj ? h('button', { class: 'btn', onclick: () => put([...list0, { ...G.prazno }]) }, G.dodaj) : null);
    }
    case 'djela': {
      const list0 = Array.isArray(v) ? v : [];
      const upd = (i, patch) => { const n = list0.map((x, j) => j === i ? { ...x, ...patch } : x); setDjela(f.name, n); };
      const legacy = !list0.length && (d.krivicnoDjelo || d.clanKZ) ? h('div', { class: 'note' }, 'Ranije upisano (tekst): ', [d.clanKZ, d.krivicnoDjelo].filter(Boolean).join(' – '), '. Unesite djelo ispod da bi ušlo u statistiku.') : null;
      return h('div', { class: 'djela' }, legacy,
        list0.map((x, i) => { const k = S.kzClan(x.clan);
          return h('div', { class: 'djelo' },
            h('div', { class: 'djelo-row' },
              h('label', { class: 'mini' }, 'Član', h('input', { type: 'text', class: 'clan', list: 'kz-clanovi', placeholder: '143', value: x.clan || '', 'data-key': `${key}.${i}.clan`,
                oninput: e => { const t = e.target.value; const m = t.match(/^\s*(\d{3}[a-z]?)\b/i); const nc = m ? m[1].toLowerCase() : t, nk = S.kzClan(nc); const ns = x.stav && nk && x.stav <= nk.stavova && nk.stavova > 1 ? x.stav : null; upd(i, { clan: nc, stav: ns, tacka: x.tacka && nk && x.tacka <= S.tackeU(nk, ns) ? x.tacka : null }); } })),
              h('label', { class: 'mini' }, 'Stav', h('select', { class: 'stav', 'data-key': `${key}.${i}.stav`, disabled: !k || k.stavova < 2, title: k && k.stavova < 2 ? 'Ovaj član nema stavove' : '',
                onchange: e => { const sv = e.target.value === '' ? null : Number(e.target.value); upd(i, { stav: sv, tacka: x.tacka && x.tacka <= S.tackeU(k, sv) ? x.tacka : null }); } },
                h('option', { value: '' }, '—'), k && k.stavova > 1 ? Array.from({ length: k.stavova }, (_, n) => h('option', { value: n + 1, selected: x.stav === n + 1 }, String(n + 1))) : null,
                x.stav && (!k || x.stav > k.stavova) ? h('option', { value: x.stav, selected: true }, `${x.stav} (ne postoji)`) : null)),
              S.tackeU(k, x.stav) || x.tacka ? h('label', { class: 'mini' }, 'Tačka', h('select', { class: 'stav', 'data-key': `${key}.${i}.tacka`, onchange: e => upd(i, { tacka: e.target.value === '' ? null : Number(e.target.value) }) },
                h('option', { value: '' }, '—'), Array.from({ length: S.tackeU(k, x.stav) }, (_, n) => h('option', { value: n + 1, selected: x.tacka === n + 1 }, String(n + 1))),
                x.tacka && x.tacka > S.tackeU(k, x.stav) ? h('option', { value: x.tacka, selected: true }, `${x.tacka} (ne postoji)`) : null)) : null,
              h('div', { class: 'naziv' + (x.clan && !k ? ' bad' : '') }, k ? k.naziv : x.clan ? 'Nepoznat član' : 'Naziv se popunjava sam', k ? h('span', { class: 'small muted' }, ' · ' + k.glava) : null),
              h('button', { class: 'btn ghost small', title: 'Ukloni djelo', onclick: () => setDjela(f.name, list0.filter((_, j) => j !== i)) }, '✕')),
            h('div', { class: 'djelo-row' },
              h('div', { class: 'chips' }, S.DODACI.map(([id, lbl, cl]) => h('button', { class: 'chip' + ((x.dodaci || []).includes(id) ? ' on' : ''), title: `čl. ${cl} KZ`, 'data-key': `${key}.${i}.${id}`,
                onclick: () => upd(i, { dodaci: (x.dodaci || []).includes(id) ? x.dodaci.filter(y => y !== id) : [...(x.dodaci || []), id] }) }, lbl))),
              h('input', { type: 'text', class: 'optuzeni', placeholder: 'Optuženi (prazno = svi)', value: x.optuzeni || '', 'data-key': `${key}.${i}.opt`, oninput: e => upd(i, { optuzeni: e.target.value || null }) })),
            k || x.clan ? h('div', { class: 'small muted' }, S.djeloText(x)) : null); }),
        h('button', { class: 'btn', onclick: () => { setDjela(f.name, [...list0, { clan: null, stav: null, dodaci: [], optuzeni: null }]);
          setTimeout(() => { const el = document.querySelector(`[data-key="${CSS.escape(key + '.' + list0.length + '.clan')}"]`); el && el.focus(); }); } }, '+ Dodaj krivično djelo'),
        kzDatalist(list, S.LIST_BY_KEY[list].isCase ? d : validationCtx().case));
    }
    case 'caseno': {
      const allowed = S.oznakeFor(list, S.LIST_BY_KEY[list].isCase ? d : (validationCtx().case || {}), f.kind), p = S.splitCaseNo(v), raw = caseRaw[key];
      const memKey = 'tm.oznaka.' + st.space + (f.kind ? '.' + f.kind : '');
      const remembered = (() => { try { return localStorage.getItem(memKey); } catch { return null; } })();
      const oz = p.oz && v ? p.oz : (allowed.includes(remembered) ? remembered : allowed[0]);
      const remember = o => { try { localStorage.setItem(memKey, o); } catch { } };
      const commit = () => { const cur = st.edit && st.edit.draft[f.name]; delete caseRaw[key];
        const n = S.normCaseNo(cur, oz, allowed); if (n.ok) { remember(S.splitCaseNo(n.value).oz); setVal(f.name, n.value); } else render(); };
      return h('div', { class: 'caseno' },
        allowed.length > 1 ? h('div', { class: 'seg' }, allowed.map(o => h('button', { class: o === oz ? 'on' : '', 'data-key': key + '.oz.' + o, tabindex: -1,
          onclick: () => { remember(o); setVal(f.name, p.rest ? `${o} ${p.rest}` : null); setTimeout(() => { const el = document.querySelector(`[data-key="${CSS.escape(key)}"]`); el && el.focus(); }); } }, o)))
          : h('span', { class: 'ozfix' }, oz),
        h('input', { type: 'text', inputmode: 'text', placeholder: '20/23', value: raw !== undefined ? raw : (v ? (p.oz ? p.rest : v) : ''), 'data-key': key,
          oninput: e => { const t = e.target.value; caseRaw[key] = t; setVal(f.name, !t ? null : /^\s*[A-Za-zČčŠšŽž]/.test(t) ? t : `${oz} ${t.trim()}`); },
          onblur: () => { if (!rendering) commit(); }, onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } } }));
    }
    case 'text': return h('input', { type: 'text', value: v || '', placeholder: f.hint && f.required ? '' : null, 'data-key': key, oninput: e => setVal(f.name, e.target.value || null) });
    case 'longtext': return h('textarea', { 'data-key': key, oninput: e => setVal(f.name, e.target.value || null) }, v || '');
    case 'number': case 'money': return h('input', { type: 'number', min: 0, max: f.max ?? null, step: f.type === 'money' ? '0.01' : '1', value: v ?? '', 'data-key': key,
      oninput: e => setVal(f.name, e.target.value === '' ? null : Number(e.target.value)) });
    case 'date': return dateField(key, v, val => setVal(f.name, val));
    case 'bool': return h('div', { class: 'seg' }, h('button', { class: v === true ? 'on' : '', 'data-key': key + '.da', onclick: () => setVal(f.name, true) }, 'Da'),
      h('button', { class: v !== true ? 'on' : '', 'data-key': key + '.ne', onclick: () => setVal(f.name, false) }, 'Ne'));
    case 'choice': {
      let opts = choicesOf(list, f.name);
      if (f.allowNew) { const id = 'dl-' + key.replace(/\W/g, '_');
        return h('div', {}, h('input', { type: 'text', list: id, value: v || '', 'data-key': key, placeholder: 'izaberite ili upišite', oninput: e => setVal(f.name, e.target.value || null) }),
          h('datalist', { id }, opts.map(o => h('option', { value: o })))); }
      if (f.filter) opts = opts.filter(o => f.filter(o, d));
      if (f.dependsOn && !d[f.dependsOn]) return h('div', { class: 'hint' }, 'Prvo izaberite: ' + S.fieldsOf(list).find(x => x.name === f.dependsOn).label.toLowerCase() + '.');
      if (opts.length && opts.length <= 4 && opts.join('').length <= (WIDE_SEG(f) ? 70 : 32))
        return h('div', { class: 'seg' }, opts.map(o => h('button', { class: v === o ? 'on' : '', 'data-key': key + '.' + o, onclick: () => setVal(f.name, v === o ? null : o) }, o)));
      return h('select', { 'data-key': key, onchange: e => setVal(f.name, e.target.value || null) }, h('option', { value: '' }, '— izaberite —'),
        opts.map(o => h('option', { value: o, selected: v === o }, o)), v && !opts.includes(v) ? h('option', { value: v, selected: true }, v) : null);
    }
    case 'pritvortok': {
      const { cf, pres1 } = tokKontekst(st.caseId);
      const list0 = (Array.isArray(v) ? v : []).map(x => ({ ...x }));
      const put = n => { Object.assign(st.edit.draft, S.tokUStaro(n, cf, pres1)); setVal(f.name, n); };
      const osnovi = choicesOf(list, 'Osnovodre_x0111_ivanjapritvora');
      const pg = S.tokPregled(list0, cf, pres1, today()), chk = S.tokProvjera(list0, cf);
      const osnovBox = (e, i) => h('div', { class: 'tok-osn' }, h('div', { class: 'small muted' }, 'Osnov (može više):'),
        osnovi.map(o => h('label', { class: 'tok-chk' }, h('input', { type: 'checkbox', checked: (e.osnov || []).includes(o), 'data-key': `${key}.${i}.o.${o}`,
          onchange: ev => { const cur = e.osnov || []; list0[i].osnov = ev.target.checked ? [...cur, o] : cur.filter(x => x !== o); put(list0); } }), o)));
      const bar = pg.ukupno ? (() => { const parts = [['zadrž.', pg.zadrz, 'z'], ['istraga', pg.istraga, 'i'], ['gl. pretres', pg.gp, 'g'], ['po presudi', pg.presuda, 'p']].filter(x => x[1] > 0), tot = parts.reduce((a, x) => a + x[1], 0) || 1;
        return h('div', { class: 'tok-top' }, h('div', { class: 'tok-bar' }, parts.map(([l, d, c]) => h('div', { class: 'tok-seg ' + c, style: `flex:${Math.max(d / tot, 0.13)}`, title: `${l}: ${d} dana` }, `${l} · ${d}`))),
          h('div', { class: 'tok-sum' }, `Ukupno u pritvoru ${pg.ukupno} dana${pg.uToku ? ' (do danas – pritvor traje)' : ''}`, pg.produzenja ? ` · produžen ${pg.produzenja} ${pg.produzenja === 1 ? 'put' : 'puta'}` : '',
            pg.prestanak ? ` · ${pg.prestanak.charAt(0).toLowerCase() + pg.prestanak.slice(1)}` : '')); })() : null;
      const noPod = !S.isDate(cf.Datumpodizanjaoptu_x017e_nice);
      return h('div', { class: 'tok' }, bar,
        list0.length ? null : h('div', { class: 'muted small', style: 'margin:4px 0 10px' }, 'Upišite događaje redom kako su se desili: zadržavanje, određivanje pritvora, produženja i prestanak.'),
        list0.map((e, i) => { const fz = S.tokFaza(e.datum, cf, pres1);
          return h('div', { class: 'tok-red' },
            h('div', { class: 'tok-main' }, h('span', { class: 'tok-n' }, i + 1),
              h('div', { class: 'tok-d' }, dateField(`${key}.${i}.d`, e.datum, val => { list0[i].datum = val; put(list0); }, { noToday: true })),
              h('select', { class: 'tok-e', 'data-key': `${key}.${i}.e`, onchange: ev => { const d0 = ev.target.value || null; list0[i] = { datum: e.datum, dogadjaj: d0, ...(d0 === 'odredjen' ? { osnov: e.osnov || [] } : {}) }; put(list0); } },
                h('option', { value: '' }, '— izaberite događaj —'), S.TOK_DOGADJAJI.map(([k, l]) => h('option', { value: k, selected: e.dogadjaj === k }, l))),
              h('span', { class: 'tok-f ' + (fz || 'x'), title: fz ? '' : (noPod ? 'Faza se određuje kad se u osnovnim podacima upiše datum podizanja optužnog akta.' : '') }, fz ? S.TOK_FAZE[fz] : (S.isDate(e.datum) ? 'faza ?' : '')),
              h('button', { class: 'btn ghost small', title: 'Ukloni red', onclick: () => put(list0.filter((_, j) => j !== i)) }, '✕')),
            e.dogadjaj === 'odredjen' ? osnovBox(e, i) : null,
            e.dogadjaj === 'produzen' ? h('div', { class: 'tok-osn' + (e.promijenjen ? '' : ' slim') },
              h('label', { class: 'tok-chk' }, h('input', { type: 'checkbox', checked: !!e.promijenjen, 'data-key': `${key}.${i}.pr`, onchange: ev => { list0[i].promijenjen = ev.target.checked; if (!ev.target.checked) delete list0[i].osnov; put(list0); } }), h('b', {}, 'Osnov se promijenio')),
              e.promijenjen ? osnovi.map(o => h('label', { class: 'tok-chk' }, h('input', { type: 'checkbox', checked: (e.osnov || []).includes(o), 'data-key': `${key}.${i}.o.${o}`,
                onchange: ev => { const cur = e.osnov || []; list0[i].osnov = ev.target.checked ? [...cur, o] : cur.filter(x => x !== o); put(list0); } }), o)) : null) : null); }),
        h('div', { class: 'toolbar', style: 'margin-top:10px' }, h('button', { class: 'btn small', onclick: () => { const last = list0[list0.length - 1];
          const next = !last ? null : last.dogadjaj === 'zadrzavanje' ? 'odredjen' : ['odredjen', 'produzen'].includes(last.dogadjaj) ? 'produzen' : null;
          put([...list0, { datum: null, dogadjaj: next }]); } }, '+ Dodaj događaj'),
          noPod && list0.length ? h('span', { class: 'small muted' }, 'Faze se određuju kad se u osnovnim podacima upiše datum podizanja optužnog akta.') : null),
        (chk.errors || []).length > 1 ? h('ul', { class: 'tok-err' }, chk.errors.slice(1).map(x => h('li', {}, x))) : null,
        (chk.warnings || []).length > 1 ? h('ul', { class: 'tok-warn' }, chk.warnings.slice(1).map(x => h('li', {}, x))) : null);
    }
    case 'multichoice': {
      const cur = Array.isArray(v) ? v : [];
      return h('div', { class: 'checks' + (f.vertical ? ' vertical' : '') }, choicesOf(list, f.name).map(o => h('label', {}, h('input', { type: 'checkbox', checked: cur.includes(o), 'data-key': key + '.' + o,
        onchange: e => setVal(f.name, e.target.checked ? [...cur, o] : cur.filter(x => x !== o)) }), o)));
    }
  }
}
async function save() {
  const e = st.edit; if (!e || e.preview) return;
  e.touched = true;
  const v = S.validate(e.list, e.draft, validationCtx());
  if (dupOf(e.list, e.draft, e.id)) v.errors.Title = 'dup';
  if (Object.keys(v.errors).length) { render(); toast('Forma ima greške – pogledajte polja označena crveno.', 'err'); return; }
  const out = { ...e.draft };
  for (const f of S.fieldsOf(e.list)) if (f.show && !f.show(out)) out[f.name] = f.type === 'bool' ? false : f.type === 'multichoice' ? [] : null;
  try {
    const rec = await api.save({ list: e.list, id: e.id, fields: out });
    st.data = await getData();
    toast(navigator.onLine ? 'Sačuvano.' : 'Sačuvano na ovom računaru – biće poslato kada se veza vrati.', 'ok');
    if (S.LIST_BY_KEY[e.list].isCase) { st.caseId = rec.id; st.edit = editOf(e.list, rec); }
    else if (S.LIST_BY_KEY[e.list].many) st.edit = null;
    else st.edit = editOf(e.list, rec);
    render();
  } catch (err) { toast('Čuvanje nije uspjelo: ' + cleanErr(err), 'err'); }
}
async function cancelEdit() {
  const e = st.edit; if (!e) return;
  if (e.dirty && !(await confirmBox('Odbaciti izmjene?', 'Izmjene u formi neće biti sačuvane.', 'Odbaci', true))) return;
  if (S.LIST_BY_KEY[e.list].isCase && !e.id) { st.edit = null; go('cases'); return; }
  st.edit = null; startStepIfSingle(); render();
}
function startStepIfSingle() { if (!S.LIST_BY_KEY[st.step].many) startStep(); }
const isMine = r => !r.remote || (!!r.owner && r.owner === st.app.me.email);
// admin brise sve, monitor samo predmet koji je sam unio
function canDelete(rec) {
  if (!S.LIST_BY_KEY[rec.list].isCase) return false;
  if (st.app.isAdmin) return true;
  return isMine(rec) && S.listsOf(S.LIST_BY_KEY[rec.list].space).slice(1).every(l => allChildRecs(l.key, rec.id).every(isMine));
}
async function del(rec) {
  const isCase = S.LIST_BY_KEY[rec.list].isCase;
  const n = isCase ? S.listsOf(S.LIST_BY_KEY[rec.list].space).slice(1).reduce((a, l) => a + allChildRecs(l.key, rec.id).length, 0) : 0;
  const ok = await confirmBox(isCase ? 'Obrisati cijeli predmet?' : 'Obrisati unos?',
    isCase ? `Biće obrisan predmet ${S.caseTitle(rec.fields)} i svih ${n} povezanih unosa (odlaganja, pritvori, presude…). Brisanje se ne može poništiti.` : 'Unos će biti trajno obrisan i sa servera.', 'Obriši', true);
  if (!ok) return;
  try { await api.remove({ id: rec.id }); st.data = await getData(); st.edit = null; toast('Obrisano.', 'ok'); if (isCase) go('cases'); else { startStepIfSingle(); render(); } }
  catch (err) { toast(cleanErr(err), 'err'); }
}

function viewStats() {
  const topics = ST.SPACE_TOPICS[st.statSpace], mod = S.MODULES.find(m => m.key === st.statModule);
  const spaceTitle = mod.spaces.length > 1 ? (st.statSpace.endsWith('_roc') ? 'Statistika – praćenje ročišta' : 'Statistika – uvid u spise') : 'Statistika';
  const topic = topics.find(t => t.key === st.statTopic) || topics[0]; st.statTopic = topic.key;
  let blocks = [];
  try { blocks = ST.compute(topic.key, statData(st.statModule), st.statCase || null, st.statModule); } catch (e) { console.error(e); toast('Greška u računanju: ' + e.message, 'err'); }
  const caseL = S.SPACE_BY_KEY[mod.spaces[0]].lists[0][0];
  const cases = recs(caseL).map(c => ({ id: c.id, t: S.caseTitle(c.fields) })).sort((a, b) => a.t.localeCompare(b.t, 'sr', { numeric: true }));
  const courtBlocks = blocks.filter(b => b.courtCols);
  const courts = [...new Set(courtBlocks.flatMap(b => b.columns.slice(2)))].filter(x => !/sudovi$/.test(x)).sort((a, b) => a.localeCompare(b, 'sr'));
  const showCol = (b, i) => { if (!b.courtCols || i < 2) return true; const name = b.columns[i];
    return st.statCourt === '*' || /sudovi$/.test(name) || name === st.statCourt; };
  const usesRef = topic.refDate || blocks.some(b => /stanje na dan/.test(b.title));
  return h('div', {}, topbar(h('div', {}, h('div', { class: 'small muted' }, mod.title), h('h1', {}, spaceTitle)), h('span', { class: 'muted small' }, 'Računa se iz podataka na ovom računaru – radi i bez interneta.')),
    h('div', { class: 'page' }, h('div', { class: 'statwrap' },
      h('nav', { class: 'card steps' }, topics.map(t => h('button', { class: 'step' + (t.key === topic.key ? ' on' : ''), onclick: () => { st.statTopic = t.key; render(); } }, t.title))),
      h('div', {},
        h('div', { class: 'toolbar' },
          topic.perCase ? [h('span', { class: 'small muted' }, 'Pokazatelji za predmet:'), h('select', { style: 'width:240px', onchange: e => { st.statCase = e.target.value; render(); } },
            h('option', { value: '' }, '— svi predmeti —'), cases.map(c => h('option', { value: c.id, selected: st.statCase === c.id }, c.t)))] : null,
          courts.length ? [h('span', { class: 'small muted' }, 'Prikaz po sudu:'), h('select', { style: 'width:240px', onchange: e => { st.statCourt = e.target.value; render(); } },
            h('option', { value: '' }, 'Samo ukupno'), h('option', { value: '*', selected: st.statCourt === '*' }, 'Svi sudovi (sve kolone)'), courts.map(c => h('option', { value: c, selected: st.statCourt === c }, c)))] : null,
          usesRef ? [h('span', { class: 'small muted' }, 'Stanje na dan:'), h('div', { style: 'width:230px' }, dateField('stat.ref', st.refDate, v => { st.refDate = v || today(); render(); }, { noClear: true }))] : null,
          h('span', { style: 'flex:1' }),
          h('button', { class: 'btn', title: 'Izvoz sadrži sve sudove kao posebne kolone', onclick: () => api.exportXlsx({ title: `${mod.short} – ${topic.title}`, blocks }) }, 'Izvezi u Excel'),
          h('button', { class: 'btn', title: 'Sve teme ove statistike u jednom Excel fajlu', onclick: () => { const d = statData(st.statModule);
            const all = topics.flatMap(t => ST.compute(t.key, d, null, st.statModule).map(b => ({ ...b, title: `${t.title}: ${b.title}` })));
            api.exportXlsx({ title: `${mod.short} – ${spaceTitle}`, blocks: all }); } }, 'Izvezi sve teme')),
        blocks.map(b => h('div', { class: 'card stat-block' + (b.perCase ? ' percase' : '') },
          h('h3', {}, b.title),
          b.rows.length && !b.empty ? h('div', { style: 'overflow-x:auto' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, b.columns.map((c, i) => showCol(b, i) ? h('th', { class: i ? 'num' : '' }, c) : null))),
            h('tbody', {}, b.rows.map(r => h('tr', { style: /^(Ukupno|Prosjek)/.test(r[0]) ? 'font-weight:600' : '' }, r.map((x, i) => showCol(b, i) ? h('td', { class: i ? 'num' : '' }, x) : null))))))
            : h('div', { class: 'info' }, 'Nema podataka za ovaj pokazatelj.'),
          b.info ? h('div', { class: 'info' }, 'ⓘ ', b.info) : null))))));
}
const AGG_ROW = /^(Ukupno|UKUPNO|Prosjek|OSNOVNI SUDOVI|VIŠI SUDOVI|SVI SUDOVI)$/;
function viewReport() {
  const mod = S.MODULES.find(m => m.key === st.repModule) || S.MODULES[0], admin = st.app.isAdmin, edit = admin && st.repEdit;
  let tables = [];
  try { tables = ST.reportTables(mod.key, statData(mod.key), st.data && st.data.tables, { admin, showHidden: edit, choicesOf }); } catch (e) { console.error(e); toast('Greška u računanju: ' + e.message, 'err'); }
  const title = t => t.no ? `Tabela ${t.no}: ${t.title}` : t.title;
  const visible = tables.filter(t => !t.hidden);
  const exp = () => api.exportXlsx({ title: `${mod.short} – Tabele za izvještaj`, blocks: visible.map(t => ({ ...t, title: title(t) })) });
  return h('div', {}, topbar(h('div', {}, h('div', { class: 'small muted' }, mod.title), h('h1', {}, 'Tabele za izvještaj')),
    h('button', { class: 'btn primary', disabled: !visible.length, onclick: exp, title: 'Sve tabele u jednom Excel fajlu' }, 'Izvezi sve tabele u Excel'),
    admin ? h('button', { class: 'btn' + (edit ? ' primary' : ''), onclick: () => { st.repEdit = !edit; tb.def = null; render(); } }, edit ? 'Završi uređivanje' : 'Uredi tabele') : null),
    h('div', { class: 'page' },
      h('div', { class: 'card pane reportbar' },
        h('div', { class: 'small muted' }, mod.spaces.length > 1 ? 'Tabele obuhvataju sve unesene podatke ovog modula – i uvid u spise i praćenje ročišta.' : 'Tabele obuhvataju sve unesene podatke ovog modula.',
          admin && !edit ? ' Kao administrator možete mijenjati nazive, redoslijed i praviti nove tabele (dugme „Uredi tabele”).' : ''),
        edit ? h('div', { class: 'note', style: 'margin:10px 0 0' }, 'Tabele „u izradi” vidite samo vi. Monitori ih vide kada ih označite kao gotove. Sakrivene standardne tabele monitori ne vide.') : null,
        h('div', { class: 'toolbar', style: 'margin-top:10px' }, h('span', { class: 'small muted' }, `${visible.length} tabela`),
          edit ? h('button', { class: 'btn primary small', onclick: () => { tb.def = newTableDef(mod); tb.isNew = true; render(); } }, '+ Nova tabela') : null,
          h('span', { style: 'flex:1' }),
          h('button', { class: 'btn ghost small', onclick: () => { st.repOpen = Object.fromEntries(tables.map(t => [t.key, false])); render(); } }, 'Skupi sve'),
          h('button', { class: 'btn ghost small', onclick: () => { st.repOpen = {}; render(); } }, 'Raširi sve'))),
      edit && tb.def && tb.isNew ? viewTableBuilder(mod) : null,
      !tables.length ? h('div', { class: 'card pane' }, h('p', { class: 'muted' }, admin ? 'Još nema tabela. Kliknite „Uredi tabele”, pa „+ Nova tabela”.' : 'Još nema tabela za ovaj modul.')) : null,
      tables.map((t, i) => {
        if (edit && tb.def && !tb.isNew && t.custom && t.def.id === tb.def.id) return viewTableBuilder(mod);
        const open = st.repOpen[t.key] !== false;
        return h('div', { class: 'card stat-block report-table' + (t.hidden ? ' hiddentbl' : '') + (t.draft ? ' drafttbl' : '') },
          h('h3', {}, h('span', { class: 'muted', style: 'cursor:pointer', onclick: () => { st.repOpen = { ...st.repOpen, [t.key]: !open }; render(); } }, open ? '▾' : '▸'),
            h('span', { style: 'cursor:pointer;flex:1', onclick: () => { st.repOpen = { ...st.repOpen, [t.key]: !open }; render(); } }, title(t)),
            t.draft ? h('span', { class: 'badge orange' }, 'u izradi') : null, t.hidden ? h('span', { class: 'badge' }, 'sakrivena') : null,
            t.custom && !edit ? h('span', { class: 'badge blue' }, 'nova') : null,
            edit ? tableTools(mod, tables, t, i) : null),
          edit && tb.ren === t.key ? renameBox(mod, t) : null,
          !open ? null : t.rows.length && !t.empty ? h('div', { style: 'overflow-x:auto' }, h('table', { class: 'grid' },
            h('thead', {}, h('tr', {}, t.columns.map((c, i) => h('th', { class: i ? 'num' : '' }, c)))),
            h('tbody', {}, t.rows.map(r => h('tr', { class: AGG_ROW.test(String(r[0])) ? 'aggrow' : '' }, r.map((x, i) => h('td', { class: i ? 'num' : '' }, x)))))))
            : h('div', { class: 'info' }, 'Nema unesenih podataka za ovu tabelu.'),
          open && t.info ? h('div', { class: 'info' }, 'ⓘ ', t.info) : null); })));
}
const tb = { def: null, isNew: false, ren: null, renT: '', renI: '' };
const tcfgClone = () => { const c = (st.data && st.data.tables) ? JSON.parse(JSON.stringify(st.data.tables)) : {}; return { titles: {}, custom: [], order: {}, ...c }; };
async function saveTcfg(c, msg) { try { await api.tablesSave(c); st.data = await getData(); if (msg) toast(msg, 'ok'); render(); return true; } catch (e) { toast('Čuvanje nije uspjelo: ' + cleanErr(e), 'err'); return false; } }
function newTableDef(mod) {
  const l = mod.spaces.flatMap(sp => S.listsOf(sp)).find(x => !x.archived);
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), module: mod.key, title: '', info: '', unit: l.key, filters: [], rows: { field: '', total: true }, cols: [{ label: 'Broj', agg: 'count' }], ready: false };
}
function tableTools(mod, tables, t, i) {
  const move = d => { const c = tcfgClone(), keys = tables.map(x => x.key), j = i + d; if (j < 0 || j >= keys.length) return; [keys[i], keys[j]] = [keys[j], keys[i]]; c.order[mod.key] = keys; saveTcfg(c); };
  const tk = `${mod.key}:${t.origNo}`;
  return h('span', { class: 'tbltools', onclick: e => e.stopPropagation() },
    h('button', { class: 'btn ghost small', title: 'Pomjeri gore', onclick: () => move(-1) }, '↑'), h('button', { class: 'btn ghost small', title: 'Pomjeri dolje', onclick: () => move(1) }, '↓'),
    t.custom ? [h('button', { class: 'btn small', onclick: () => { tb.def = JSON.parse(JSON.stringify(t.def)); tb.isNew = false; render(); } }, 'Uredi tabelu'),
      h('button', { class: 'btn small', onclick: () => { const c = tcfgClone(), d = c.custom.find(x => x.id === t.def.id); d.ready = !d.ready; saveTcfg(c, d.ready ? 'Tabela je gotova – monitori je sada vide.' : 'Tabela je vraćena u izradu.'); } }, t.draft ? 'Označi kao gotovu' : 'Vrati u izradu'),
      h('button', { class: 'btn ghost small', onclick: async () => { if (!(await confirmBox('Obrisati tabelu?', `Tabela „${t.title}” biće obrisana. Podaci se ne brišu – samo definicija tabele.`, 'Obriši', true))) return;
        const c = tcfgClone(); c.custom = c.custom.filter(x => x.id !== t.def.id); saveTcfg(c, 'Tabela obrisana.'); } }, 'Obriši')]
      : [h('button', { class: 'btn small', onclick: () => { tb.ren = t.key; tb.renT = t.title; tb.renI = t.info || ''; render(); } }, 'Naziv i napomena'),
        h('button', { class: 'btn ghost small', onclick: () => { const c = tcfgClone(), o = { ...(c.titles[tk] || {}) }; if (t.hidden) delete o.hidden; else o.hidden = true;
          if (Object.keys(o).length) c.titles[tk] = o; else delete c.titles[tk]; saveTcfg(c); } }, t.hidden ? 'Prikaži' : 'Sakrij')]);
}
function renameBox(mod, t) {
  const tk = `${mod.key}:${t.origNo}`;
  return h('div', { class: 'fbedit', style: 'margin:0;border-radius:0;border-width:0 0 1px' },
    h('div', { class: 'fbrow' }, h('label', {}, 'Naziv tabele'), h('input', { type: 'text', value: tb.renT, oninput: e => { tb.renT = e.target.value; } })),
    h('div', { class: 'fbrow' }, h('label', {}, 'Napomena ispod tabele'), h('textarea', { rows: 2, oninput: e => { tb.renI = e.target.value; } }, tb.renI)),
    h('div', { class: 'small muted' }, `Izvorni naziv: ${t.origTitle}`),
    h('div', { class: 'toolbar', style: 'margin-top:8px' },
      h('button', { class: 'btn primary small', onclick: () => { const c = tcfgClone(), o = { ...(c.titles[tk] || {}) };
        if (tb.renT.trim() && tb.renT.trim() !== t.origTitle) o.title = tb.renT.trim(); else delete o.title;
        if ((tb.renI.trim() || null) !== (t.origInfo || null)) o.info = tb.renI.trim(); else delete o.info;
        if (Object.keys(o).length) c.titles[tk] = o; else delete c.titles[tk]; tb.ren = null; saveTcfg(c, 'Sačuvano.'); } }, 'Sačuvaj'),
      h('button', { class: 'btn small', onclick: () => { const c = tcfgClone(), o = { ...(c.titles[tk] || {}) }; delete o.title; delete o.info;
        if (Object.keys(o).length) c.titles[tk] = o; else delete c.titles[tk]; tb.ren = null; saveTcfg(c, 'Vraćen izvorni naziv.'); } }, 'Vrati izvorno'),
      h('button', { class: 'btn ghost small', onclick: () => { tb.ren = null; render(); } }, 'Otkaži')));
}
function fieldSelect(cat, value, onchange, opts) {
  opts = opts || {}; const list = opts.types ? cat.filter(c => opts.types.includes(c.type)) : cat;
  const groups = [...new Set(list.map(c => c.group))];
  return h('select', { onchange: e => onchange(e.target.value) }, h('option', { value: '', selected: !value }, opts.none || '— izaberite polje —'),
    groups.map(g => h('optgroup', { label: g }, list.filter(c => c.group === g).map(c => h('option', { value: c.id, selected: value === c.id }, c.label)))));
}
const metaChoices = m => m ? (m.choices || (m.name ? choicesOf(m.list, m.name) : [])) : [];
function filterEditor(arr, cat, label) {
  return h('div', { class: 'tbfilters' }, arr.map((f, i) => { const m = cat.find(c => c.id === f.field), ops = m ? ST.FILTER_OPS[m.type] || ST.FILTER_OPS.text : [];
    const needV = f.op && !['yes', 'no', 'filled', 'empty'].includes(f.op);
    return h('div', { class: 'tbfilter' }, fieldSelect(cat, f.field, v => { f.field = v; const mm = cat.find(c => c.id === v); f.op = mm ? (ST.FILTER_OPS[mm.type] || ST.FILTER_OPS.text)[0][0] : ''; f.value = ''; render(); }),
      m ? h('select', { onchange: e => { f.op = e.target.value; render(); } }, ops.map(([k, t]) => h('option', { value: k, selected: f.op === k }, t))) : null,
      m && needV ? (['choice', 'multichoice'].includes(m.type) ? h('select', { onchange: e => { f.value = e.target.value; render(); } }, h('option', { value: '' }, '— vrijednost —'), metaChoices(m).map(o => h('option', { value: o, selected: f.value === o }, o)))
        : h('input', { type: m.type === 'date' ? 'date' : (m.type === 'number' || m.type === 'money') ? 'number' : 'text', value: f.value ?? '', style: 'max-width:200px', onchange: e => { f.value = e.target.value; render(); } })) : null,
      h('button', { class: 'btn ghost small', title: 'Ukloni uslov', onclick: () => { arr.splice(i, 1); render(); } }, '✕')); }),
    h('button', { class: 'btn ghost small', onclick: () => { arr.push({ field: '', op: '', value: '' }); render(); } }, label || '+ Uslov'));
}
// --- graditelj tabela ---
function viewTableBuilder(mod) {
  const d = tb.def, units = mod.spaces.flatMap(sp => S.listsOf(sp).filter(l => !l.archived).map(l => ({ l, sp: S.SPACE_BY_KEY[sp] })));
  const cat = ST.fieldCatalog(d.unit), rm = cat.find(c => c.id === d.rows.field);
  let prev = null; try { prev = ST.customTable(d, statData(mod.key), choicesOf); } catch (e) { prev = { columns: ['Greška'], rows: [[e.message]] }; }
  const row = (label, ...c) => h('div', { class: 'fbrow' }, h('label', {}, label), ...c);
  const chk = (lbl, on, set) => h('label', { class: 'chk', style: 'margin-right:14px' }, h('input', { type: 'checkbox', checked: !!on, onchange: e => { set(e.target.checked); render(); } }), ' ' + lbl);
  const numF = cat.filter(c => c.type === 'number' || c.type === 'money');
  const save = async ready => {
    if (!d.title.trim()) return toast('Upišite naziv tabele.', 'err');
    const c = tcfgClone(), i = c.custom.findIndex(x => x.id === d.id), out = { ...d, title: d.title.trim(), ready: ready === undefined ? !!d.ready : ready };
    if (i >= 0) c.custom[i] = out; else c.custom.push(out);
    if (await saveTcfg(c, out.ready ? 'Tabela sačuvana – monitori je vide.' : 'Tabela sačuvana kao „u izradi” – vidite je samo vi.')) { tb.def = null; render(); } };
  return h('div', { class: 'card pane tbuilder' }, h('h2', {}, tb.isNew ? 'Nova tabela' : 'Uređivanje tabele'),
    row('Naziv tabele', h('input', { type: 'text', value: d.title, placeholder: 'npr. Nošenje toga na ročištima', onchange: e => { d.title = e.target.value; render(); } })),
    row('Napomena ispod tabele', h('input', { type: 'text', value: d.info || '', placeholder: 'nije obavezno', onchange: e => { d.info = e.target.value; render(); } })),
    h('h3', {}, '1. Šta se broji'),
    row('Jedan red podataka je', h('select', { onchange: e => { d.unit = e.target.value; d.filters = []; d.rows = { field: '', total: true }; d.cols = [{ label: 'Broj', agg: 'count' }]; render(); } },
      units.map(({ l, sp }) => h('option', { value: l.key, selected: d.unit === l.key }, (mod.spaces.length > 1 ? sp.title + ' – ' : '') + (l.isCase ? `predmet (${l.title})` : l.title))))),
    row('Uzmi samo zapise u kojima', filterEditor(d.filters, cat, '+ Uslov (npr. pritvorski predmet je Da)')),
    h('h3', {}, '2. Redovi tabele'),
    row('Redovi prema polju', fieldSelect(cat.filter(c => !c.long), d.rows.field, v => { d.rows = { field: v, total: d.rows.total !== false, courtGroups: /:sud$/.test(v), short: /:sud$/.test(v) }; render(); }, { none: '— bez redova (jedan red „Ukupno”) —' })),
    rm ? row('', rm.name === 'sud' ? [chk('skraćeni nazivi (OS / VS)', d.rows.short, v => { d.rows.short = v; }), chk('zbirni redovi osnovni / viši / svi sudovi', d.rows.courtGroups, v => { d.rows.courtGroups = v; })] : null,
      ['choice', 'multichoice'].includes(rm.type) ? chk('prikaži i opcije bez podataka', d.rows.all, v => { d.rows.all = v; }) : null,
      !(rm.name === 'sud' && d.rows.courtGroups) ? chk('red „Ukupno”', d.rows.total !== false, v => { d.rows.total = v; }) : null,
      h('select', { onchange: e => { d.rows.sort = e.target.value; render(); } }, h('option', { value: '', selected: !d.rows.sort }, 'redoslijed opcija'), h('option', { value: 'count', selected: d.rows.sort === 'count' }, 'najviše zapisa prvo'))) : null,
    rm && (rm.type === 'number' || rm.type === 'money') ? row('Razredi (granice)', h('input', { type: 'text', value: d.rows.edges || '', placeholder: 'npr. 30, 60, 120 → do 30, od 30 do 60, …, preko 120', onchange: e => { d.rows.edges = e.target.value; render(); } })) : null,
    rm && rm.type === 'date' ? row('', h('span', { class: 'small muted' }, 'Redovi po godini datuma.')) : null,
    h('h3', {}, '3. Kolone'),
    d.cols.map((c, i) => h('div', { class: 'tbcol' },
      h('div', { class: 'fbrow' }, h('label', {}, `Kolona ${i + 1}`), h('input', { type: 'text', value: c.label || '', placeholder: 'naziv kolone', onchange: e => { c.label = e.target.value; render(); } }),
        h('select', { onchange: e => { c.agg = e.target.value; render(); } }, Object.entries(ST.AGGS).map(([k, t]) => h('option', { value: k, selected: (c.agg || 'count') === k }, t))),
        h('button', { class: 'btn ghost small', title: 'Lijevo', onclick: () => { if (i) { d.cols.splice(i - 1, 0, d.cols.splice(i, 1)[0]); render(); } } }, '←'),
        h('button', { class: 'btn ghost small', title: 'Desno', onclick: () => { if (i < d.cols.length - 1) { d.cols.splice(i + 1, 0, d.cols.splice(i, 1)[0]); render(); } } }, '→'),
        h('button', { class: 'btn ghost small', title: 'Ukloni kolonu', onclick: () => { d.cols.splice(i, 1); render(); } }, '✕')),
      ['sum', 'avg', 'min', 'max'].includes(c.agg) ? row('Polje', fieldSelect(numF, c.field, v => { c.field = v; render(); }), h('select', { onchange: e => { c.decimals = Number(e.target.value); render(); } }, h('option', { value: 2, selected: c.decimals !== 0 }, '2 decimale'), h('option', { value: 0, selected: c.decimals === 0 }, 'cijeli broj'))) : null,
      ['dur_avg', 'dur_sum'].includes(c.agg) ? row('Od datuma … do datuma', fieldSelect(cat, c.field, v => { c.field = v; render(); }, { types: ['date'] }), fieldSelect(cat, c.field2, v => { c.field2 = v; render(); }, { types: ['date'] })) : null,
      row('Računaj samo zapise u kojima', filterEditor(c.filters || (c.filters = []), cat, '+ Uslov za ovu kolonu')))),
    h('button', { class: 'btn small', onclick: () => { d.cols.push({ label: '', agg: 'count', filters: [] }); render(); } }, '+ Kolona'),
    h('h3', {}, 'Pregled'),
    prev && prev.rows.length ? h('div', { style: 'overflow-x:auto' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, prev.columns.map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
      h('tbody', {}, prev.rows.map(r => h('tr', { class: AGG_ROW.test(String(r[0])) ? 'aggrow' : '' }, r.map((x, i) => h('td', { class: i ? 'num' : '' }, x)))))))
      : h('p', { class: 'muted' }, 'Nema zapisa koji odgovaraju uslovima.'),
    h('div', { class: 'toolbar', style: 'margin-top:14px' },
      h('button', { class: 'btn primary', onclick: () => save(false) }, 'Sačuvaj (u izradi)'),
      h('button', { class: 'btn', onclick: () => save(true) }, 'Sačuvaj kao gotovu'),
      h('button', { class: 'btn ghost', onclick: () => { tb.def = null; render(); } }, 'Otkaži')));
}
let logs = null;
// --- sinhronizacija ---
function viewSync() {
  const pend = S.LISTS.flatMap(l => recs(l.key).filter(r => r.dirty && !r.conflict).map(r => ({ l, r })));
  const conf = (st.data && st.data.conflicts) || [];
  if (logs === null) api.logs().then(x => { logs = x; render(); });
  return h('div', {}, topbar(h('h1', {}, 'Sinhronizacija')),
    h('div', { class: 'page' },
      h('div', { class: 'card pane' },
        h('div', { class: 'pane-head' }, h('div', {}, h('h2', {}, 'Stanje'),
          h('div', { class: 'muted small' }, `Posljednja uspješna sinhronizacija: ${ago(st.app.lastSync)} · automatski svakih 5 minuta i nakon svakog čuvanja`)),
          h('span', { class: 'grow' }),
          h('button', { class: 'btn primary', disabled: st.sync.state === 'syncing', onclick: async () => { const s = await api.syncNow(); logs = null;
            if (s && s.state === 'ok') toast('Sinhronizacija završena.', 'ok'); else if (s) toast(s.state === 'offline' ? 'Nema interneta – pokušaću ponovo automatski.' : (s.error || 'Greška'), 'err'); } }, 'Sinhronizuj sada')),
        st.sync.error && st.sync.state === 'error' ? h('div', { class: 'note warn' }, st.sync.error) : null,
        st.sync.state === 'login' ? h('div', { class: 'note warn' }, 'Sesija je istekla. ', h('a', { onclick: async () => { try { st.app = await api.login(); toast('Prijavljeni ste.', 'ok'); } catch (e) { toast(cleanErr(e), 'err'); } render(); } }, 'Prijavi se ponovo')) : null,
        h('p', {}, pend.length ? `${pend.length} izmjena čeka slanje na server:` : 'Sve izmjene su poslate na server.'),
        pend.length ? h('ul', {}, pend.slice(0, 30).map(({ l, r }) => h('li', {}, `${l.title}: `, r.deleted ? h('i', {}, 'brisanje') : S.summarize(l.key, r.fields)))) : null),
      conf.length ? h('div', { class: 'card pane', style: 'margin-top:16px' }, h('h2', {}, `Konflikti (${conf.length})`),
        h('p', { class: 'muted' }, 'Isti zapis je izmijenjen i na ovom računaru i na serveru. Izaberite koju verziju zadržavate.'),
        conf.map(r => viewConflict(r))) : null,
      h('div', { class: 'card pane', style: 'margin-top:16px' }, h('h2', {}, 'Alati'),
        h('div', { class: 'toolbar', style: 'margin-top:12px' },
          st.app.isAdmin ? h('button', { class: 'btn', onclick: () => api.backup().catch(e => toast(cleanErr(e), 'err')) }, 'Napravi rezervnu kopiju baze') : null),
        h('p', { class: 'small muted' }, `Verzija ${st.app.version} · Firebase projekat ${st.app.projectId}`),
        !st.app.updates ? null : h('div', { class: 'toolbar' }, h('button', { class: 'btn small', onclick: async () => { const r = await api.updateCheck().catch(e => ({ error: cleanErr(e) }));
          if (r.available) { upd.info = r; toast(`Dostupna je verzija ${r.version}.`, 'ok'); } else toast(r.error || `Imate najnoviju verziju (${st.app.version}).`, r.error ? 'err' : 'ok'); render(); } }, 'Provjeri da li postoji nova verzija'))),
      h('div', { class: 'card pane', style: 'margin-top:16px' }, h('h2', {}, 'Dnevnik'),
        logs && logs.length ? h('table', { class: 'grid', style: 'margin-top:10px' }, h('tbody', {}, logs.slice(0, 50).map(l => h('tr', {},
          h('td', { class: 'small muted', style: 'white-space:nowrap' }, new Date(l.ts).toLocaleString('sr-Latn-ME')), h('td', {}, h('span', { class: 'badge ' + (l.level === 'error' ? 'err' : l.level === 'warn' ? 'warn' : '') }, l.level)), h('td', {}, l.msg)))))
          : h('p', { class: 'muted' }, 'Nema zapisa.'))));
}
function viewConflict(r) {
  const l = S.LIST_BY_KEY[r.list], c = r.conflict;
  const fields = S.fieldsOf(r.list).filter(f => f.name !== 'Predmet');
  const show = (f, val) => f.type === 'bool' ? (val ? 'Da' : 'Ne') : f.type === 'date' ? S.fmtDate(val) || '—' : Array.isArray(val) ? val.join(', ') || '—'
    : (val ?? '—');
  const caseT = S.caseTitle((caseOfRec(r) || { fields: {} }).fields);
  return h('div', { style: 'border-top:1px solid var(--line);padding-top:14px;margin-top:14px' },
    h('b', {}, `${S.MODULES.find(m => m.key === l.module).short} · ${l.title} · ${caseT}`),
    c.type === 'deleted' ? h('p', {}, 'Zapis je obrisan na serveru, a vi ste ga u međuvremenu mijenjali.') :
      h('div', { class: 'compare' }, [['Moja verzija', r.fields], [`Verzija na serveru (${c.serverBy || 'drugi korisnik'})`, c.serverFields]].map(([t, vals]) =>
        h('div', { class: 'card' }, h('h3', {}, t), h('dl', {}, fields.map(f => { const diff = JSON.stringify(r.fields[f.name] ?? null) !== JSON.stringify((c.serverFields || {})[f.name] ?? null);
          return [h('dt', {}, f.label), h('dd', { class: diff ? 'diff' : '' }, show(f, vals[f.name]))]; }))))),
    h('div', { class: 'toolbar', style: 'margin-top:10px' },
      c.type === 'deleted' && !st.app.isAdmin ? null : h('button', { class: 'btn primary', onclick: async () => { await api.resolve({ id: r.id, choice: 'mine' }); st.data = await getData(); toast('Zadržana vaša verzija – šalje se na server.', 'ok'); render(); } },
        c.type === 'deleted' ? 'Vrati zapis (ponovo ga kreiraj)' : 'Zadrži moju verziju'),
      h('button', { class: 'btn', onclick: async () => { await api.resolve({ id: r.id, choice: 'server' }); st.data = await getData(); toast('Prihvaćena verzija sa servera.', 'ok'); render(); } },
        c.type === 'deleted' ? 'Prihvati brisanje' : 'Prihvati verziju sa servera')));
}

const fb = { cfg: null, loading: false, dirty: false, mod: null, list: null, edit: null, newMod: '', newStep: '', newStepMany: true, published: null };
const clone = x => JSON.parse(JSON.stringify(x));
const normCfg = c => ({ modules: [], moduleTitles: {}, spaceTitles: {}, listTitles: {}, overrides: {}, fields: {}, ...(c ? clone(c) : {}) });
function fbChanged() { fb.dirty = true; S.applyCustom(fb.cfg); render(); }
const fbMod = key => fb.cfg.modules.find(m => m.key === key);
const itemRef = x => x.name || (x.custom ? x.id : '§' + x.section);
const hasData = (list, name) => recs(list).some(r => { const v = r.fields[name]; return !S.isEmpty(v) && v !== false; });
async function fbLoad() {
  fb.loading = true;
  try { const r = await api.formsGet(); fb.published = r.published || null; fb.cfg = normCfg(r.draft || r.published); fb.dirty = false; S.applyCustom(fb.cfg); }
  catch (e) { toast(cleanErr(e), 'err'); fb.cfg = normCfg(st.data && st.data.forms); }
  fb.loading = false; render();
}
async function fbSave(quiet) {
  for (const [lk, defs] of Object.entries(fb.cfg.fields)) for (const d of defs) if ((d.type === 'choice' || d.type === 'multichoice') && !d.archived && !(d.choices || []).length) {
    toast(`Polje „${d.label}” (${(S.LIST_BY_KEY[lk] || {}).title}) nema nijednu opciju.`, 'err'); return false; }
  try { await api.formsSaveDraft(fb.cfg); fb.dirty = false; st.data = await getData(); if (!quiet) toast('Nacrt sačuvan. Vidite ga samo vi dok ga ne objavite.', 'ok'); render(); return true; }
  catch (e) { toast('Čuvanje nije uspjelo: ' + cleanErr(e), 'err'); return false; }
}
function viewForms() {
  if (!fb.cfg) { if (!fb.loading) fbLoad(); return h('div', {}, topbar(h('h1', {}, 'Uređivanje formi')), h('div', { class: 'page' }, h('p', { class: 'muted' }, 'Učitavam…'))); }
  const mods = S.MODULES; if (!fb.mod || !mods.find(m => m.key === fb.mod)) fb.mod = mods[0].key;
  const mod = mods.find(m => m.key === fb.mod), cm = fbMod(mod.key);
  const lists = mod.spaces.flatMap(sp => S.listsOf(sp)); if (!fb.list || !lists.find(l => l.key === fb.list)) fb.list = lists[0].key;
  const draft = st.data && st.data.formsDraft;
  const status = fb.dirty ? h('span', { class: 'badge warn' }, 'nesačuvane izmjene') : draft ? h('span', { class: 'badge orange' }, 'nacrt – nije objavljen') : h('span', { class: 'badge ok' }, 'objavljeno');
  const publish = async () => {
    if (fb.dirty && !(await fbSave(true))) return;
    if (!(await confirmBox('Objaviti forme?', 'Svi monitori će poslije sljedeće sinhronizacije raditi sa ovim formama: novi moduli, koraci i polja postaju vidljivi, a sakrivena polja nestaju iz formi (podaci u njima ostaju sačuvani).', 'Objavi'))) return;
    try { await api.formsPublish(); st.data = await getData(); toast('Forme su objavljene.', 'ok'); render(); } catch (e) { toast(cleanErr(e), 'err'); } };
  const discard = async () => {
    if (!(await confirmBox('Odbaciti nacrt?', 'Sve neobjavljene izmjene formi biće odbačene i vraća se posljednja objavljena verzija.', 'Odbaci nacrt', true))) return;
    try { if (draft) await api.formsDiscard(); fb.cfg = null; fb.dirty = false; st.data = await getData(); render(); } catch (e) { toast(cleanErr(e), 'err'); } };
  return h('div', {}, topbar(h('div', {}, h('div', { class: 'small muted' }, 'Administracija'), h('h1', {}, 'Uređivanje formi')), status,
      h('button', { class: 'btn', disabled: !fb.dirty, onclick: () => fbSave() }, 'Sačuvaj nacrt'),
      h('button', { class: 'btn primary', disabled: !fb.dirty && !draft, onclick: publish }, 'Objavi monitorima'),
      h('button', { class: 'btn ghost', disabled: !fb.dirty && !draft, onclick: discard }, 'Odbaci nacrt')),
    h('div', { class: 'page' },
      h('div', { class: 'note' }, 'Izmjene prvo čuvate kao nacrt – tada ih vidite samo vi (možete otvoriti modul i probati formu). Monitori ih dobijaju tek kada kliknete „Objavi monitorima”. ',
        'Ništa se ne briše: sakrivena i arhivirana polja, koraci i moduli zadržavaju unesene podatke.'),
      h('div', { class: 'fbwrap' },
        h('div', { class: 'card fbmods' }, h('h3', {}, 'Moduli'),
          mods.map(m => h('button', { class: 'step' + (m.key === fb.mod ? ' on' : '') + (m.archived ? ' muted' : ''), onclick: () => { fb.mod = m.key; fb.list = null; fb.edit = null; render(); } },
            m.title, m.custom ? h('span', { class: 'badge blue', style: 'margin-left:6px' }, m.archived ? 'arhiviran' : 'novi') : null)),
          h('div', { class: 'fbnew' }, h('input', { type: 'text', placeholder: 'Naziv novog modula', value: fb.newMod, oninput: e => { fb.newMod = e.target.value; } }),
            h('button', { class: 'btn small', onclick: () => {
              const t = fb.newMod.trim(); if (!t) return toast('Upišite naziv modula.', 'err');
              const taken = new Set([...S.MODULES.map(x => x.key), ...S.LISTS.map(x => x.key)]); const key = S.newKey('x', t, taken);
              fb.cfg.modules.push({ key, title: t, caseTitle: 'Osnovni podaci', spaceTitle: 'Predmeti', steps: [] }); fb.newMod = ''; fb.mod = key; fb.list = null; fbChanged(); } }, '+ Novi modul'))),
        h('div', {}, viewFbModule(mod, cm), viewFbFields(fb.list)))));
}
function viewFbModule(mod, cm) {
  const setModTitle = v => { v = v.trim(); if (cm) cm.title = v || cm.title; else if (v && v !== baseTitle('module', mod.key)) fb.cfg.moduleTitles[mod.key] = v; else delete fb.cfg.moduleTitles[mod.key]; fbChanged(); };
  return h('div', { class: 'card pane', style: 'margin-bottom:16px' },
    h('div', { class: 'fbrow' }, h('label', {}, 'Naziv modula'), h('input', { type: 'text', value: mod.title, onchange: e => setModTitle(e.target.value) }),
      cm ? h('button', { class: 'btn ghost small', onclick: () => { cm.archived = !cm.archived; fbChanged(); } }, cm.archived ? 'Vrati modul' : 'Arhiviraj modul') : null),
    mod.spaces.map(spk => { const sp = S.SPACE_BY_KEY[spk];
      return h('div', { class: 'fbspace' },
        h('div', { class: 'fbrow' }, h('label', {}, 'Sekcija'), h('input', { type: 'text', value: sp.title, onchange: e => { const v = e.target.value.trim();
          if (cm) cm.spaceTitle = v || cm.spaceTitle; else if (v && v !== baseTitle('space', spk)) fb.cfg.spaceTitles[spk] = v; else delete fb.cfg.spaceTitles[spk]; fbChanged(); } })),
        h('table', { class: 'grid fbsteps' }, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Korak (naziv u formi)'), h('th', {}, 'Unosi'), h('th', {}, 'Polja'), h('th', {}))),
          h('tbody', {}, S.listsOf(spk).map((l, i) => { const stp = cm && cm.steps.find(x => x.key === l.key), n = S.fieldsOf(l.key).filter(f => f.type !== 'lookup' && !f.hidden).length;
            return h('tr', { class: (fb.list === l.key ? 'on' : '') + (l.archived ? ' archived' : '') },
              h('td', {}, i + 1),
              h('td', {}, h('input', { type: 'text', value: l.title, onchange: e => { const v = e.target.value.trim();
                if (cm && l.isCase) cm.caseTitle = v || cm.caseTitle; else if (stp) stp.title = v || stp.title;
                else if (v && v !== baseTitle('list', l.key)) fb.cfg.listTitles[l.key] = v; else delete fb.cfg.listTitles[l.key]; fbChanged(); } })),
              h('td', {}, stp ? h('select', { onchange: e => { stp.many = e.target.value === '1'; fbChanged(); } }, h('option', { value: '0', selected: !stp.many }, 'Jedan unos'), h('option', { value: '1', selected: !!stp.many }, 'Više unosa'))
                : h('span', { class: 'muted small' }, l.isCase ? 'predmet' : l.many ? 'više unosa' : 'jedan unos')),
              h('td', {}, h('button', { class: 'btn small' + (fb.list === l.key ? ' primary' : ''), onclick: () => { fb.list = l.key; fb.edit = null; render(); } }, `Polja (${n})`)),
              h('td', {}, stp ? h('button', { class: 'btn ghost small', onclick: () => { stp.archived = !stp.archived; fbChanged(); } }, stp.archived ? 'Vrati' : 'Arhiviraj') : null)); }))),
        cm ? h('div', { class: 'fbnew', style: 'margin-top:10px' }, h('input', { type: 'text', placeholder: 'Naziv novog koraka (npr. Presuda)', value: fb.newStep, oninput: e => { fb.newStep = e.target.value; } }),
          h('select', { onchange: e => { fb.newStepMany = e.target.value === '1'; } }, h('option', { value: '1', selected: fb.newStepMany }, 'Više unosa po predmetu'), h('option', { value: '0', selected: !fb.newStepMany }, 'Jedan unos po predmetu')),
          h('button', { class: 'btn small', onclick: () => { const t = fb.newStep.trim(); if (!t) return toast('Upišite naziv koraka.', 'err');
            const taken = new Set([...S.MODULES.map(x => x.key), ...S.LISTS.map(x => x.key), ...fb.cfg.modules.flatMap(m => m.steps.map(s => s.key))]);
            const key = S.newKey('x', `${cm.key.slice(2, 12)} ${t}`, taken); cm.steps.push({ key, title: t, many: fb.newStepMany }); fb.newStep = ''; fb.list = key; fbChanged(); } }, '+ Novi korak')) : null); }));
}
const BASE_TITLES = {};
function baseTitle(kind, key) {
  if (!BASE_TITLES.done) { const cur = S.customConfig(); S.applyCustom(null);
    for (const m of S.MODULES) BASE_TITLES['module:' + m.key] = m.title; for (const sp of S.SPACES) BASE_TITLES['space:' + sp.key] = sp.title;
    for (const l of S.LISTS) BASE_TITLES['list:' + l.key] = l.title; for (const [k, F] of Object.entries(S.FORMS)) for (const f of F) if (f.name) BASE_TITLES[`field:${k}.${f.name}`] = { label: f.label, hint: f.hint || '', hidden: !!f.hidden };
    S.applyCustom(cur); BASE_TITLES.done = true; }
  return BASE_TITLES[kind + ':' + key];
}
function fbMove(listKey, ref, dir) {
  const F = S.FORMS[listKey].filter(x => x.type !== 'lookup'), i = F.findIndex(x => itemRef(x) === ref), j = i + dir;
  if (i < 0 || j < 0 || j >= F.length) return;
  [F[i], F[j]] = [F[j], F[i]];
  const defs = fb.cfg.fields[listKey] || [], order = [];
  F.forEach((x, k) => { if (!x.custom) return; const d = defs.find(dd => dd.name === itemRef(x)); if (!d) return;
    let p = k - 1; while (p >= 0 && F[p].hidden && !F[p].custom) p--;
    d.after = p < 0 ? '__start' : itemRef(F[p]); order.push(d); });
  for (const d of defs) if (!order.includes(d)) order.push(d);
  fb.cfg.fields[listKey] = order; fbChanged();
}
function viewFbFields(listKey) {
  const l = S.LIST_BY_KEY[listKey]; if (!l) return null;
  const F = S.FORMS[listKey].filter(x => x.type !== 'lookup' && !(x.name && x.hidden && !x.custom && !(fb.cfg.overrides[`${listKey}.${x.name}`] || {}).hidden));
  const defs = fb.cfg.fields[listKey] || (fb.cfg.fields[listKey] = []);
  const ov = name => fb.cfg.overrides[`${listKey}.${name}`] || {};
  const setOv = (name, o) => { const k = `${listKey}.${name}`, cur = { ...(fb.cfg.overrides[k] || {}), ...o };
    for (const x of Object.keys(cur)) if (cur[x] === undefined || cur[x] === false || cur[x] === null) delete cur[x];
    if (Object.keys(cur).length) fb.cfg.overrides[k] = cur; else delete fb.cfg.overrides[k]; fbChanged(); };
  const typeName = x => x.section ? 'Naslov sekcije' : S.CUSTOM_TYPES[x.type] || { caseno: 'Broj predmeta', djela: 'Krivična djela', razlozi: 'Razlozi odlaganja', mjereunosi: 'Mjere (unosi)', json: 'Interno' }[x.type] || x.type;
  return h('div', { class: 'card pane' },
    h('div', { class: 'pane-head' }, h('h2', {}, `Polja: ${l.title}`), h('span', { class: 'grow' }),
      h('button', { class: 'btn primary small', onclick: () => { fb.edit = { isNew: true, d: { name: '', label: '', type: 'text', after: '', choices: [] } }; render(); } }, '+ Dodaj polje')),
    fb.edit ? viewFbEditor(listKey) : null,
    h('table', { class: 'grid fbfields' }, h('thead', {}, h('tr', {}, h('th', {}, 'Naziv'), h('th', {}, 'Vrsta'), h('th', {}, ''), h('th', {}))),
      h('tbody', {}, F.map((x, idx) => {
        const ref = itemRef(x), d = x.custom ? defs.find(dd => dd.name === ref) : null, hiddenOv = x.name && !x.custom && ov(x.name).hidden;
        const tags = [x.custom ? h('span', { class: 'badge blue' }, 'novo') : null, d && d.archived ? h('span', { class: 'badge' }, 'arhivirano') : null, hiddenOv ? h('span', { class: 'badge' }, 'sakriveno') : null,
          x.show ? h('span', { class: 'badge', title: 'Prikazuje se samo pod određenim uslovom' }, 'uslovno') : null, (x.userRequired || (x.required && x.custom)) ? h('span', { class: 'badge warn' }, 'obavezno') : null,
          !x.custom && x.name && (ov(x.name).label || ov(x.name).hint !== undefined) ? h('span', { class: 'badge orange' }, 'izmijenjeno') : null];
        return h('tr', { class: (x.section ? 'secrow' : '') + (hiddenOv || (d && d.archived) ? ' archived' : '') },
          h('td', {}, x.section ? h('b', {}, x.section) : x.label || h('i', { class: 'muted' }, '(bez naziva)'), x.hint ? h('div', { class: 'small muted' }, x.hint) : null),
          h('td', { class: 'small' }, typeName(x)), h('td', {}, tags),
          h('td', { class: 'fbact' },
            x.custom && d ? [
              h('button', { class: 'btn ghost small', title: 'Gore', onclick: () => fbMove(listKey, ref, -1) }, '↑'), h('button', { class: 'btn ghost small', title: 'Dolje', onclick: () => fbMove(listKey, ref, 1) }, '↓'),
              h('button', { class: 'btn small', onclick: () => { fb.edit = { isNew: false, d: clone(d) }; render(); } }, 'Uredi'),
              d.type !== 'section' && hasData(listKey, d.name) ? h('button', { class: 'btn ghost small', onclick: () => { d.archived = !d.archived; fbChanged(); } }, d.archived ? 'Vrati' : 'Arhiviraj')
                : h('button', { class: 'btn ghost small', onclick: async () => { if (await confirmBox('Ukloniti polje?', `Polje „${d.label}” nema unesenih podataka i biće uklonjeno iz forme.`, 'Ukloni', true)) {
                  fb.cfg.fields[listKey] = defs.filter(dd => dd !== d); for (const dd of fb.cfg.fields[listKey]) if (dd.after === d.name) dd.after = d.after; fbChanged(); } } }, 'Ukloni')]
            : x.name ? [h('button', { class: 'btn small', onclick: () => { fb.edit = { builtin: true, d: { name: x.name, label: x.label, hint: x.hint || '' } }; render(); } }, 'Uredi'),
              h('button', { class: 'btn ghost small', onclick: () => setOv(x.name, { hidden: !hiddenOv }) }, hiddenOv ? 'Prikaži' : 'Sakrij')] : null)); }))),
    h('p', { class: 'small muted', style: 'margin-top:10px' }, 'Postojeća polja ne mogu se brisati niti im se može mijenjati vrsta, jer na njima počivaju statistika, tabele i provjere rokova – možete ih preimenovati ili sakriti. ',
      'Nova polja mogu se ukloniti dok u njima nema podataka; kad podaci postoje, polje se arhivira (sakrije), a podaci ostaju.'));
}
function viewFbEditor(listKey) {
  const e = fb.edit, d = e.d;
  const close = () => { fb.edit = null; render(); };
  if (e.builtin) {
    const base = baseTitle('field', `${listKey}.${d.name}`) || {};
    return h('div', { class: 'card fbedit' }, h('h3', {}, 'Postojeće polje'),
      h('div', { class: 'fbrow' }, h('label', {}, 'Naziv'), h('input', { type: 'text', value: d.label, oninput: ev => { d.label = ev.target.value; } })),
      h('div', { class: 'fbrow' }, h('label', {}, 'Pomoćni tekst'), h('input', { type: 'text', value: d.hint, oninput: ev => { d.hint = ev.target.value; } })),
      h('div', { class: 'small muted' }, `Izvorni naziv: ${base.label || '—'}`),
      h('div', { class: 'toolbar', style: 'margin-top:10px' },
        h('button', { class: 'btn primary small', onclick: () => { const k = `${listKey}.${d.name}`, o = { ...(fb.cfg.overrides[k] || {}) };
          if (d.label.trim() && d.label.trim() !== base.label) o.label = d.label.trim(); else delete o.label;
          if (d.hint.trim() !== (base.hint || '')) o.hint = d.hint.trim(); else delete o.hint;
          if (Object.keys(o).length) fb.cfg.overrides[k] = o; else delete fb.cfg.overrides[k]; fb.edit = null; fbChanged(); } }, 'Primijeni'),
        h('button', { class: 'btn small', onclick: () => { const k = `${listKey}.${d.name}`, o = { ...(fb.cfg.overrides[k] || {}) }; delete o.label; delete o.hint;
          if (Object.keys(o).length) fb.cfg.overrides[k] = o; else delete fb.cfg.overrides[k]; fb.edit = null; fbChanged(); } }, 'Vrati izvorno'),
        h('button', { class: 'btn ghost small', onclick: close }, 'Otkaži')));
  }
  const F = S.FORMS[listKey].filter(x => x.type !== 'lookup' && itemRef(x) !== d.name);
  const locked = !e.isNew && hasData(listKey, d.name);
  const condFields = F.filter(x => x.name && !x.hidden && ['bool', 'choice', 'multichoice'].includes(x.type));
  const cf = d.showIf && condFields.find(x => x.name === d.showIf.field);
  const condVals = cf ? (cf.type === 'bool' ? [['__da', 'Da (označeno)'], ['__ne', 'Ne (nije označeno)']] : choicesOf(listKey, cf.name).map(o => [o, o])) : [];
  const set = (k, v, re) => { d[k] = v; if (re) render(); };
  const row = (label, ...c) => h('div', { class: 'fbrow' }, h('label', {}, label), ...c);
  const save = () => {
    if (!d.label.trim()) return toast('Upišite naziv polja.', 'err');
    if ((d.type === 'choice' || d.type === 'multichoice') && !(d.choices || []).filter(Boolean).length) return toast('Upišite bar jednu opciju (jedna po redu).', 'err');
    const defs = fb.cfg.fields[listKey] || (fb.cfg.fields[listKey] = []);
    const clean = { ...d, label: d.label.trim(), choices: (d.choices || []).map(x => x.trim()).filter(Boolean) };
    for (const k of ['hint', 'min', 'max', 'afterField']) if (clean[k] === '' || clean[k] === null || clean[k] === undefined) delete clean[k];
    if (!clean.showIf || !clean.showIf.field || !clean.showIf.value) delete clean.showIf;
    if (!['choice', 'multichoice'].includes(clean.type)) delete clean.choices;
    if (e.isNew) { const taken = new Set(S.FORMS[listKey].map(itemRef)); clean.name = S.newKey('c', clean.label, taken); defs.push(clean); }
    else { const i = defs.findIndex(x => x.name === d.name); if (i >= 0) defs[i] = clean; }
    fb.edit = null; fbChanged();
  };
  return h('div', { class: 'card fbedit' }, h('h3', {}, e.isNew ? 'Novo polje' : 'Uređivanje polja'),
    row('Naziv', h('input', { type: 'text', value: d.label, placeholder: 'npr. Odnos žrtve sa optuženim', oninput: ev => set('label', ev.target.value) })),
    row('Vrsta', h('select', { disabled: locked, title: locked ? 'Vrsta se ne može mijenjati jer polje već ima podatke.' : '', onchange: ev => set('type', ev.target.value, true) },
      Object.entries(S.CUSTOM_TYPES).map(([k, v]) => h('option', { value: k, selected: d.type === k }, v)))),
    d.type === 'section' ? null : row('Pomoćni tekst', h('input', { type: 'text', value: d.hint || '', placeholder: 'kratko uputstvo ispod polja (nije obavezno)', oninput: ev => set('hint', ev.target.value) })),
    row('Mjesto u formi', h('select', { onchange: ev => set('after', ev.target.value) }, h('option', { value: '', selected: !d.after }, 'Na kraju forme'), h('option', { value: '__start', selected: d.after === '__start' }, 'Na početku forme'),
      F.map(x => h('option', { value: itemRef(x), selected: d.after === itemRef(x) }, 'Poslije: ' + (x.section ? `[${x.section}]` : x.label))))),
    ['choice', 'multichoice'].includes(d.type) ? row('Opcije (jedna po redu)', h('textarea', { rows: 5, oninput: ev => set('choices', ev.target.value.split('\n')) }, (d.choices || []).join('\n'))) : null,
    d.type === 'multichoice' ? row('', h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!d.vertical, onchange: ev => set('vertical', ev.target.checked) }), ' opcije jedna ispod druge')) : null,
    ['number', 'money'].includes(d.type) ? row('Dozvoljeni raspon', h('input', { type: 'number', style: 'width:110px', placeholder: 'najmanje', value: d.min ?? '', oninput: ev => set('min', ev.target.value === '' ? '' : Number(ev.target.value)) }),
      h('input', { type: 'number', style: 'width:110px', placeholder: 'najviše', value: d.max ?? '', oninput: ev => set('max', ev.target.value === '' ? '' : Number(ev.target.value)) })) : null,
    d.type === 'date' ? row('Ne može biti prije datuma', h('select', { onchange: ev => set('afterField', ev.target.value) }, h('option', { value: '' }, '— bez provjere —'),
      F.filter(x => x.type === 'date' && !x.hidden).map(x => h('option', { value: x.name, selected: d.afterField === x.name }, x.label)))) : null,
    row('Prikaži samo ako', h('select', { onchange: ev => { d.showIf = ev.target.value ? { field: ev.target.value, value: '' } : null; render(); } }, h('option', { value: '' }, '— uvijek prikaži —'),
      condFields.map(x => h('option', { value: x.name, selected: d.showIf && d.showIf.field === x.name }, x.label))),
      cf ? h('select', { onchange: ev => { d.showIf.value = ev.target.value; } }, h('option', { value: '' }, '— izaberite vrijednost —'), condVals.map(([v, t]) => h('option', { value: v, selected: d.showIf.value === v }, t))) : null),
    d.type === 'section' ? null : row('', h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!d.wide, onchange: ev => set('wide', ev.target.checked) }), ' zauzima cijeli red'),
      h('label', { class: 'chk', style: 'margin-left:16px' }, h('input', { type: 'checkbox', checked: !!d.required, onchange: ev => set('required', ev.target.checked) }), ' obavezno polje')),
    h('div', { class: 'toolbar', style: 'margin-top:12px' }, h('button', { class: 'btn primary small', onclick: save }, e.isNew ? 'Dodaj polje' : 'Primijeni'), h('button', { class: 'btn ghost small', onclick: close }, 'Otkaži')));
}

const adm = { users: null, newEmail: '', newName: '', newRole: 'monitor', choiceKey: 'odlaganja.Razlogodlaganja', choiceText: null, imp: null, delMod: '', delText: '' };
function viewAdmin() {
  if (adm.users === null) { adm.users = []; api.listUsers().then(u => { adm.users = u; render(); }).catch(e => toast(cleanErr(e), 'err')); }
  const choiceFields = S.LISTS.flatMap(l => S.fieldsOf(l.key).filter(f => f.type === 'choice' || f.type === 'multichoice')
    .map(f => ({ key: `${l.key}.${f.name}`, label: `${S.MODULES.find(m => m.key === l.module).short} · ${S.SPACE_BY_KEY[l.space].title} · ${l.title} – ${f.label}` })));
  if (adm.choiceText === null) adm.choiceText = choicesOf(...(([a, ...b]) => [a, b.join('.')])(adm.choiceKey.split('.'))).join('\n');
  const setUser = async (email, name, role) => { try { adm.users = await api.setUser({ email, name, role }); toast('Sačuvano.', 'ok'); render(); } catch (e) { toast(cleanErr(e), 'err'); } };
  const rep = adm.imp && adm.imp.report;
  const total = rep ? Object.values(rep.counts).reduce((a, b) => a + b, 0) : 0;
  const pick = async kind => { try { adm.imp = await api.importPick(kind); render(); } catch (e) { toast(cleanErr(e), 'err'); } };
  return h('div', {}, topbar(h('h1', {}, 'Administracija')), h('div', { class: 'page' },
    h('div', { class: 'card pane' }, h('h2', {}, 'Korisnici'),
      h('p', { class: 'muted small' }, 'Samo e-mail adrese sa ove liste imaju pristup podacima (svim modulima). Korisnik se registruje u aplikaciji istom adresom i potvrdi e-mail. Monitor može da obriše predmet koji je sam unio. Administrator briše bilo koji predmet ili sve unose modula, uvozi podatke i uređuje ovu stranicu.'),
      h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'E-mail'), h('th', {}, 'Ime (prikazuje se uz unose)'), h('th', {}, 'Uloga'), h('th', {}))),
        h('tbody', {}, adm.users.map(u => h('tr', {}, h('td', {}, u.email),
          h('td', {}, h('input', { type: 'text', value: u.name, onchange: e => setUser(u.email, e.target.value, u.role) })),
          h('td', {}, h('select', { onchange: e => setUser(u.email, u.name, e.target.value), disabled: u.email === st.app.me.email }, h('option', { value: 'monitor', selected: u.role !== 'admin' }, 'Monitor'), h('option', { value: 'admin', selected: u.role === 'admin' }, 'Administrator'))),
          h('td', {}, u.email === st.app.me.email ? h('span', { class: 'muted small' }, 'vi') : h('button', { class: 'btn danger', onclick: async () => {
            if (!(await confirmBox('Ukloniti korisnika?', `${u.email} više neće imati pristup podacima. Njegovi unosi ostaju.`, 'Ukloni', true))) return;
            try { adm.users = await api.removeUser({ email: u.email }); render(); } catch (e) { toast(cleanErr(e), 'err'); } } }, 'Ukloni')))),
          h('tr', {}, h('td', {}, h('input', { type: 'text', placeholder: 'e-mail novog korisnika', value: adm.newEmail, 'data-key': 'adm.email', oninput: e => adm.newEmail = e.target.value })),
            h('td', {}, h('input', { type: 'text', placeholder: 'ime i prezime', value: adm.newName, 'data-key': 'adm.name', oninput: e => adm.newName = e.target.value })),
            h('td', {}, h('select', { onchange: e => adm.newRole = e.target.value }, h('option', { value: 'monitor' }, 'Monitor'), h('option', { value: 'admin', selected: adm.newRole === 'admin' }, 'Administrator'))),
            h('td', {}, h('button', { class: 'btn primary', onclick: async () => { await setUser(adm.newEmail.trim().toLowerCase(), adm.newName.trim(), adm.newRole); adm.newEmail = adm.newName = ''; render(); } }, 'Dodaj')))))),
    h('div', { class: 'card pane', style: 'margin-top:16px' }, h('h2', {}, 'Liste izbora'),
      h('p', { class: 'muted small' }, 'Vrijednosti koje monitori biraju u formama (jedna vrijednost po redu). Promjena važi za sve korisnike nakon sinhronizacije. Postojeći unosi se ne mijenjaju.'),
      h('div', { class: 'toolbar' }, h('select', { style: 'width:640px', onchange: e => { adm.choiceKey = e.target.value; adm.choiceText = null; render(); } },
        choiceFields.map(c => h('option', { value: c.key, selected: c.key === adm.choiceKey }, c.label)))),
      h('textarea', { style: 'min-height:220px;font-family:Consolas,monospace;font-size:13px', 'data-key': 'adm.choices', oninput: e => adm.choiceText = e.target.value }, adm.choiceText),
      h('div', { class: 'formbar' }, h('button', { class: 'btn primary', onclick: async () => {
        const all = { ...st.data.choices, [adm.choiceKey]: adm.choiceText.split('\n').map(x => x.trim()).filter(Boolean) };
        try { await api.saveChoices(all); st.data = await getData(); toast('Lista izbora sačuvana.', 'ok'); render(); } catch (e) { toast(cleanErr(e), 'err'); } } }, 'Sačuvaj listu'))),
    h('div', { class: 'card pane', style: 'margin-top:16px' }, h('h2', {}, 'Uvoz postojećih podataka'),
      h('p', { class: 'muted small' }, 'Uvoz je moguć samo u prazan modul, da ne bi nastali duplikati. Fajlovi se prepoznaju po sadržaju, ne po imenu.'),
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn', onclick: () => pick('sharepoint') }, 'Predmeti OKK: CSV fajlovi iz SharePointa…'),
        h('button', { class: 'btn', onclick: () => pick('appsheet') }, 'Praćenje suđenja i Nasilje nad ženama: Excel iz AppSheeta…'),
        rep && !adm.imp.existing ? h('button', { class: 'btn primary', disabled: st.busy, onclick: async () => {
          st.busy = true; render();
          try { const s = await api.importRun(); st.data = await getData(); adm.imp = null; toast(s && s.state === 'ok' ? 'Uvoz završen i poslat na server.' : 'Uvezeno lokalno – šalje se na server čim veza bude dostupna.', 'ok'); }
          catch (e) { toast(cleanErr(e), 'err'); }
          st.busy = false; render(); } }, st.busy ? 'Uvozim…' : `Uvezi ${total} zapisa`) : null),
      rep ? h('div', {},
        adm.imp.existing ? h('div', { class: 'note warn' }, `Ciljni modul već ima ${adm.imp.existing} predmeta – uvoz je moguć samo u prazan modul.`) : null,
        h('table', { class: 'grid', style: 'margin:10px 0' }, h('thead', {}, h('tr', {}, h('th', {}, 'Modul · sekcija · lista'), h('th', { class: 'num' }, 'Za uvoz'))),
          h('tbody', {}, Object.entries(rep.counts).filter(([, n]) => n).map(([k, n]) => { const l = S.LIST_BY_KEY[k];
            return h('tr', {}, h('td', {}, `${S.MODULES.find(m => m.key === l.module).short} · ${S.SPACE_BY_KEY[l.space].title} · ${l.title}`), h('td', { class: 'num' }, n)); }))),
        rep.files ? h('p', { class: 'small muted' }, 'Fajlovi: ' + rep.files.map(f => `${f.file} (${f.rows})`).join(', ')) : null,
        rep.sheets ? h('p', { class: 'small muted' }, 'Listovi: ' + rep.sheets.map(f => `${f.sheet} (${f.rows} redova)`).join(', ')) : null,
        rep.skipped.length ? h('details', {}, h('summary', {}, `Preskočeno: ${rep.skipped.length}`), h('ul', { class: 'small' }, rep.skipped.map(x => h('li', {}, x)))) : null,
        rep.warnings.length ? h('details', {}, h('summary', {}, `Upozorenja o podacima: ${rep.warnings.length} (uvoze se kakvi jesu – možete ih ispraviti kasnije)`), h('ul', { class: 'small' }, rep.warnings.map(x => h('li', {}, x)))) : null,
        rep.unknownFiles && rep.unknownFiles.length ? h('p', { class: 'small muted' }, 'Nepoznati fajlovi (preskočeni): ' + rep.unknownFiles.join(', ')) : null) : null),
    delModuleCard()));
}
function delModuleCard() {
  const mods = S.MODULES.filter(m => !m.archived);
  if (!mods.some(m => m.key === adm.delMod)) adm.delMod = mods.length ? mods[0].key : '';
  const mod = mods.find(m => m.key === adm.delMod);
  const lists = S.LISTS.filter(l => l.module === adm.delMod);
  const cases = lists.filter(l => l.isCase).reduce((a, l) => a + ((st.data && st.data.records[l.key]) || []).length, 0);
  const all = lists.reduce((a, l) => a + ((st.data && st.data.records[l.key]) || []).length, 0);
  const ok = mod && all > 0 && adm.delText.trim().toLowerCase() === mod.title.trim().toLowerCase();
  return h('div', { class: 'card pane', style: 'margin-top:16px' }, h('h2', {}, 'Brisanje svih unosa modula'),
    h('p', { class: 'muted small' }, 'Briše sve predmete i sve njihove unose u izabranom modulu, za sve korisnike. Forme, tabele i liste izbora ostaju.'),
    h('div', { class: 'toolbar' }, h('select', { style: 'width:420px', onchange: e => { adm.delMod = e.target.value; adm.delText = ''; render(); } },
      mods.map(m => h('option', { value: m.key, selected: m.key === adm.delMod }, m.title)))),
    mod ? h('p', {}, all ? `Biće obrisano: ${cases} predmeta i ukupno ${all} unosa.` : 'Ovaj modul nema unosa.') : null,
    mod && all ? h('div', {},
      h('p', { class: 'small' }, `Za potvrdu upišite naziv modula: `, h('b', {}, mod.title)),
      h('div', { class: 'toolbar' },
        h('input', { type: 'text', style: 'width:420px', value: adm.delText, 'data-key': 'adm.del', oninput: e => { adm.delText = e.target.value; render(); } }),
        h('button', { class: 'btn danger', disabled: !ok || st.busy, onclick: async () => {
          if (!(await confirmBox('Obrisati sve unose?', `Modul „${mod.title}”: ${cases} predmeta i ukupno ${all} unosa biće obrisani za sve korisnike.`, 'Obriši sve', true))) return;
          st.busy = true; render();
          try { const n = await api.removeModule({ module: mod.key }); adm.delText = ''; st.data = await getData(); toast(`Obrisano ${n} unosa.`, 'ok'); }
          catch (e) { toast(cleanErr(e), 'err'); }
          st.busy = false; render(); } }, 'Obriši sve unose'))) : null);
}

const MJESECI = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];
const DANI = ['Po', 'Ut', 'Sr', 'Če', 'Pe', 'Su', 'Ne'];
let picker = null;
function parseDate(s) {
  s = String(s || '').trim(); if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y, mo, d;
  if (m) [, y, mo, d] = m.map(Number);
  else {
    m = s.match(/^(\d{1,2})[.\/\-\s]+(\d{1,2})[.\/\-\s]+(\d{2}|\d{4})\.?$/) || s.match(/^(\d{2})(\d{2})(\d{2}|\d{4})$/);
    if (!m) return undefined;
    [, d, mo, y] = m.map(Number); if (y < 100) y += y > 50 ? 1900 : 2000;
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 1950 || y > 2100) return undefined;
  return dt.toISOString().slice(0, 10);
}
function dateField(key, v, onChange, opts) {
  opts = opts || {};
  const commit = el => { const p = parseDate(el.value); if (p === undefined) { el.classList.add('bad'); toast('Neispravan datum. Upišite npr. 5.3.2025.', 'err'); return; } el.classList.remove('bad'); if (p !== (v || null)) onChange(p); else el.value = S.fmtDate(v); };
  const open = picker && picker.key === key;
  const base = S.isDate(v) ? v : today();
  return h('div', { class: 'datefield' },
    h('div', { class: 'datewrap' },
      h('input', { type: 'text', value: S.fmtDate(v), placeholder: 'dd.mm.gggg.', 'data-key': key, inputmode: 'numeric',
        onblur: e => commit(e.target), onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); commit(e.target); } } }),
      h('button', { class: 'calbtn', title: 'Kalendar', tabindex: '-1', onclick: () => { picker = open ? null : { key, y: +base.slice(0, 4), m: +base.slice(5, 7) - 1 }; render(); } }, '📅')),
    opts.noToday ? null : h('button', { class: 'btn ghost small', title: 'Današnji datum', onclick: () => { picker = null; onChange(today()); } }, 'danas'),
    v && !opts.noClear ? h('button', { class: 'btn ghost small', title: 'Obriši datum', onclick: () => { picker = null; onChange(null); } }, '✕') : null,
    open ? calendar(v, d => { picker = null; onChange(d); }) : null);
}
function calendar(v, pick) {
  const { y, m } = picker;
  const first = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const n = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells = []; for (let i = 0; i < first; i++) cells.push(null); for (let d = 1; d <= n; d++) cells.push(d);
  const iso = d => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const move = k => { const t = new Date(Date.UTC(y, m + k, 1)); picker = { ...picker, y: t.getUTCFullYear(), m: t.getUTCMonth() }; render(); };
  const years = []; for (let k = 2100; k >= 1990; k--) years.push(k);
  return h('div', { class: 'calendar card', onclick: e => e.stopPropagation() },
    h('div', { class: 'calhead' }, h('button', { class: 'btn ghost small', onclick: () => move(-1), title: 'Prethodni mjesec' }, '‹'),
      h('select', { onchange: e => { picker = { ...picker, m: +e.target.value }; render(); } }, MJESECI.map((name, i) => h('option', { value: i, selected: i === m }, name))),
      h('select', { onchange: e => { picker = { ...picker, y: +e.target.value }; render(); } }, years.map(k => h('option', { value: k, selected: k === y }, k))),
      h('button', { class: 'btn ghost small', onclick: () => move(1), title: 'Sljedeći mjesec' }, '›')),
    h('div', { class: 'calgrid' }, DANI.map(d => h('span', { class: 'dow' }, d)),
      cells.map(d => d ? h('button', { class: 'day' + (iso(d) === v ? ' sel' : '') + (iso(d) === today() ? ' today' : ''), onclick: () => pick(iso(d)) }, d) : h('span'))));
}
document.addEventListener('click', e => { if (picker && !e.target.closest('.datefield')) { picker = null; render(); } });

load();
})();
