'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./db');
const { Auth, Firestore } = require('./firebase');
const { Sync } = require('./sync');
const { readExport } = require('./importer');
const { readAppSheet } = require('./appsheet');
const Schema = require('../shared/schema.js');

let win, store, auth, fsdb, sync, config, online = true, timer;
// pokrenuto iz preuzete nove verzije: samo zamijeni fajlove u folderu aplikacije i pokreni je
const ZAMJENA = process.argv.indexOf('--zamijeni');
if (ZAMJENA >= 0) require('./updater').zamijeni(process.argv.slice(ZAMJENA + 1), { app, dialog });
const SYNC_EVERY_MS = 5 * 60 * 1000;

// podaci iz starog foldera (prije promjene imena)
(function preseli() {
  if (ZAMJENA >= 0) return;
  const novo = app.getPath('userData'), staro = path.join(app.getPath('appData'), 'Trial Monitoring');
  try {
    if (!fs.existsSync(novo) && fs.existsSync(staro)) fs.renameSync(staro, novo);
    const sq = path.join(novo, 'trial-monitoring.sqlite'), nsq = path.join(novo, 'podaci.sqlite');
    if (fs.existsSync(sq) && !fs.existsSync(nsq)) fs.renameSync(sq, nsq);
  } catch { }
})();

const userCfgFile = () => path.join(app.getPath('userData'), 'config.json');
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
function loadConfig() {
  const base = app.isPackaged ? path.join(process.resourcesPath, 'config.json') : path.join(__dirname, '../../config.json');
  return { ...readJson(base), ...readJson(userCfgFile()) };
}
const isConfigured = c => /^[a-z0-9-]{4,40}$/.test(c.projectId || '') && /^AIza[\w-]{30,}$/.test(c.apiKey || '');
const crypt = { enc: s => safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s) : Buffer.from(s), dec: b => safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString('utf8') };

function send(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }

function initServices() {
  config = loadConfig();
  if (!isConfigured(config)) return;
  auth = new Auth(config, path.join(app.getPath('userData'), 'session.bin'), crypt);
  fsdb = new Firestore(config, auth);
  sync = new Sync({ store, fs: fsdb, me, onStatus: s => { send('sync:status', s); } });
}
function me() {
  const u = auth && auth.user(); if (!u) return null;
  const p = store.get('profile:' + u.email);
  return { email: u.email, name: (p && p.name) || u.email, role: p ? p.role : null };
}
function state() {
  const m = me();
  return { configured: isConfigured(config), projectId: config.projectId, me: m, isAdmin: !!(m && m.role === 'admin'), noAccess: !!(m && store.get('profile:' + m.email) === null),
    online, pending: store.pending().length, conflicts: store.conflicts().length, lastSync: store.get('lastSync'), records: store.count(), version: app.getVersion(), updates: !!updateRepo() };
}
function effectiveForms() { const m = me(); const admin = !!(m && m.role === 'admin'); return (admin && store.get('formsDraft')) || store.get('forms') || null; }
function requireAdmin() { if (!state().isAdmin) throw new Error('Ovo može samo administrator.'); }

async function syncNow() {
  if (!sync || !me()) return null;
  const s = await sync.run();
  send('app:state', state()); send('data:changed');
  return s;
}
function scheduleSync(delay = 2500) {
  clearTimeout(timer);
  timer = setTimeout(async () => { if (online) await syncNow(); scheduleSync(SYNC_EVERY_MS); }, delay);
}

function handlers() {
  ipcMain.handle('app:state', () => state());

  ipcMain.handle('config:save', (_e, c) => {
    fs.writeFileSync(userCfgFile(), JSON.stringify({ ...readJson(userCfgFile()), projectId: c.projectId.trim().toLowerCase(), apiKey: c.apiKey.trim() }, null, 2));
    initServices();
    return state();
  });

  ipcMain.handle('auth:register', (_e, { email, password }) => auth.register(email, password));
  ipcMain.handle('auth:reset', (_e, { email }) => auth.resetPassword(email));
  // ako je projekat prazan, prvi koji se prijavi postaje admin
  ipcMain.handle('auth:login', async (_e, { email, password }) => {
    await auth.login(email, password);
    const u = auth.user();
    try {
      const prof = await fsdb.get('users', u.email);
      if (!prof && await sync.claimAdmin(u.email, u.email)) store.log('info', `${u.email} je postavljen za administratora (prvi korisnik projekta).`);
      await sync.refreshMeta();
    } catch (e) { store.log('warn', 'Provjera korisnika: ' + e.message); }
    scheduleSync(100);
    return state();
  });
  ipcMain.handle('auth:logout', async () => {
    if (store.pending().length) {
      const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Odustani', 'Odjavi se svejedno'], defaultId: 0, cancelId: 0,
        message: `Imate ${store.pending().length} izmjena koje još nisu poslate na server.`, detail: 'Izmjene ostaju sačuvane na ovom računaru i biće poslate kada se ponovo prijavite.' });
      if (r.response !== 1) return state();
    }
    auth.logout();
    return state();
  });

  function migrateDostava() {
    const m = me(); if (!m || m.role !== 'admin') return;
    for (const list of ['presuda1', 'presuda2', 'svi_presuda1']) for (const r of store.records(list)) {
      if (!r.fields || !r.fields.dostavaStrankama) continue;
      const f = { ...r.fields }; if (!f.Datumdostavljanjapisanogotpravka) f.Datumdostavljanjapisanogotpravka = f.dostavaStrankama; delete f.dostavaStrankama;
      store.saveLocal(list, r.id, f, m.name);
    }
  }
  ipcMain.handle('data:get', () => {
    try { migrateDostava(); } catch (e) { store.log('warn', 'migracija dostave: ' + e.message); }
    const records = Object.fromEntries(Schema.LISTS.map(l => [l.key, []]));
    for (const r of store.allRecords()) if (records[r.list]) records[r.list].push(r);
    const server = store.get('choices', {}) || {};
    const choices = {};
    for (const l of Schema.LISTS) for (const f of Schema.fieldsOf(l.key)) {
      if (f.type !== 'choice' && f.type !== 'multichoice') continue;
      const k = `${l.key}.${f.name}`;
      choices[k] = (server[k] && server[k].length) ? server[k] : Schema.fallbackChoices(l.key, f.name);
    }
    return { records, choices, conflicts: store.conflicts(), tables: store.get('tables') || null, forms: effectiveForms(), formsDraft: !!(state().isAdmin && store.get('formsDraft')) };
  });

  ipcMain.handle('data:save', (_e, { list, id, fields }) => {
    if (!Schema.LIST_BY_KEY[list]) throw new Error('Nepoznata lista.');
    const rec = store.saveLocal(list, id, fields, me().name, { owner: me().email });
    store.flushNow(); scheduleSync();
    return rec;
  });
  // brise se samo cijeli predmet; monitor samo svoj
  ipcMain.handle('data:delete', (_e, { id }) => {
    const r = store.byId(id); if (!r) return true;
    if (!(Schema.LIST_BY_KEY[r.list] && Schema.LIST_BY_KEY[r.list].isCase)) throw new Error('Briše se samo cijeli predmet; ostali unosi se mijenjaju.');
    const children = store.allRecords().filter(x => x.fields.Predmet === id);
    if (!state().isAdmin) {
      const mine = x => !x.remote || x.owner === me().email;
      if (!mine(r)) throw new Error('Možete obrisati samo predmet koji ste sami unijeli. Ovaj predmet može obrisati administrator.');
      if (children.some(x => !mine(x))) throw new Error('Predmet ima unose drugih monitora. Obrisati ga može administrator.');
    }
    store.batch(() => { for (const x of children) store.markDeleted(x.id); store.markDeleted(id); });
    store.flushNow(); scheduleSync();
    return true;
  });

  // samo admin, npr. na kraju projekta
  ipcMain.handle('data:deleteModule', (_e, { module }) => {
    requireAdmin();
    const lists = Schema.LISTS.filter(l => l.module === module).map(l => l.key);
    if (!lists.length) throw new Error('Nepoznat modul.');
    let n = 0;
    store.batch(() => { for (const k of lists) for (const r of store.records(k)) { store.markDeleted(r.id); n++; } });
    store.log('info', `Obrisani svi unosi modula ${(Schema.MODULES.find(m => m.key === module) || {}).title || module} (${n}).`);
    store.flushNow(); scheduleSync();
    return n;
  });

  ipcMain.handle('sync:now', () => syncNow());
  ipcMain.handle('conflict:resolve', (_e, { id, choice }) => { sync.resolve(id, choice); store.flushNow(); scheduleSync(); return true; });
  ipcMain.handle('net:online', (_e, v) => { const was = online; online = !!v; if (online && !was) scheduleSync(500); return true; });
  ipcMain.handle('log:get', () => store.logs(200));

  ipcMain.handle('users:list', () => { requireAdmin(); return sync.listUsers(); });
  ipcMain.handle('users:set', async (_e, { email, name, role }) => {
    requireAdmin();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) throw new Error('Neispravna e-mail adresa.');
    if (email.toLowerCase() === me().email && role !== 'admin') throw new Error('Ne možete sebi oduzeti administratorska prava.');
    await sync.setUser(email, name, role); return sync.listUsers();
  });
  ipcMain.handle('users:remove', async (_e, { email }) => {
    requireAdmin(); if (email === me().email) throw new Error('Ne možete ukloniti sami sebe.');
    await sync.removeUser(email); return sync.listUsers();
  });
  ipcMain.handle('forms:get', () => { requireAdmin(); return { published: store.get('forms'), draft: store.get('formsDraft') }; });
  const formsDone = () => { store.flushNow(); send('data:changed'); send('app:state', state()); scheduleSync(300); return true; };
  ipcMain.handle('forms:saveDraft', async (_e, cfg) => { requireAdmin(); await sync.saveFormsDraft(cfg); return formsDone(); });
  ipcMain.handle('forms:publish', async () => { requireAdmin(); await sync.publishForms(); return formsDone(); });
  ipcMain.handle('forms:discard', async () => { requireAdmin(); await sync.discardFormsDraft(); return formsDone(); });
  ipcMain.handle('tables:save', async (_e, cfg) => { requireAdmin(); await sync.saveTables(cfg); send('data:changed'); return true; });
  ipcMain.handle('choices:save', async (_e, map) => { requireAdmin(); await sync.setChoices(map); send('data:changed'); return true; });

  const targetLists = kind => kind === 'sharepoint' ? Schema.listsOf('okk').map(l => l.key) : Schema.LISTS.filter(l => l.module !== 'okk').map(l => l.key);
  const existingCases = kind => targetLists(kind).filter(k => Schema.LIST_BY_KEY[k].isCase).reduce((a, k) => a + store.records(k).length, 0);
  ipcMain.handle('import:pick', async (_e, kind) => {
    requireAdmin();
    const sp = kind === 'sharepoint';
    const r = await dialog.showOpenDialog(win, { title: sp ? 'Izaberite CSV fajlove izvezene iz SharePointa' : 'Izaberite AppSheet Excel fajlove (form_uvid.xlsx, form_rocista.xlsx)',
      properties: ['openFile', 'multiSelections'], filters: [sp ? { name: 'CSV', extensions: ['csv'] } : { name: 'Excel', extensions: ['xlsx'] }] });
    if (r.canceled || !r.filePaths.length) return null;
    const res = sp ? readExport(r.filePaths) : await readAppSheet(r.filePaths);
    importCache = { kind, ...res };
    return { kind, report: res.report, existing: existingCases(kind) };
  });
  ipcMain.handle('import:run', async () => {
    requireAdmin();
    if (!importCache) throw new Error('Prvo izaberite fajlove.');
    const { kind, recs, choices } = importCache;
    if (existingCases(kind)) throw new Error('Ovaj modul već sadrži predmete – uvoz je moguć samo u prazan modul, da ne bi nastali duplikati.');
    const author = kind === 'sharepoint' ? 'Uvoz iz SharePointa' : 'Uvoz iz AppSheeta';
    store.batch(() => { for (const [list, rs] of Object.entries(recs)) for (const r of rs) store.saveLocal(list, r.id, r.fields, me().name, { createdBy: author }); });
    store.flushNow();
    await sync.setChoices({ ...(store.get('choices', {}) || {}), ...choices }).catch(e => store.log('warn', 'Izbori nisu sačuvani na serveru: ' + e.message));
    importCache = null;
    store.log('info', `${author}: ${Object.values(recs).reduce((a, x) => a + x.length, 0)} zapisa.`);
    return syncNow();
  });

  ipcMain.handle('export:xlsx', async (_e, { title, blocks }) => {
    const { filePath } = await dialog.showSaveDialog(win, { defaultPath: `${title.replace(/[\\/:*?"<>|]/g, '-')}.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
    if (!filePath) return false;
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(title.slice(0, 31));
    ws.addRow([title]).font = { bold: true, size: 14 };
    ws.addRow([`Izvezeno: ${new Date().toLocaleString('sr-Latn-ME')}`]).font = { italic: true, color: { argb: 'FF666666' } };
    for (const b of blocks) {
      ws.addRow([]); ws.addRow([b.title]).font = { bold: true, size: 12 };
      const h = ws.addRow(b.columns); h.font = { bold: true }; h.alignment = { wrapText: true, vertical: 'bottom' }; h.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8ECF4' } }; });
      if (!b.rows.length) ws.addRow(['Nema podataka']);
      for (const r of b.rows) { const row = ws.addRow(r); if (/^(Ukupno|UKUPNO|OSNOVNI SUDOVI|VIŠI SUDOVI|SVI SUDOVI)$/.test(String(r[0]))) row.font = { bold: true }; }
      if (b.info) ws.addRow([b.info]).font = { italic: true, color: { argb: 'FF666666' } };
    }
    ws.getColumn(1).width = 70; for (let i = 2; i <= 12; i++) ws.getColumn(i).width = 22;
    await wb.xlsx.writeFile(filePath); shell.showItemInFolder(filePath);
    return true;
  });
  ipcMain.handle('backup:export', async () => {
    requireAdmin();
    const { filePath } = await dialog.showSaveDialog(win, { defaultPath: `podaci-kopija-${new Date().toISOString().slice(0, 10)}.sqlite`, filters: [{ name: 'SQLite', extensions: ['sqlite'] }] });
    if (!filePath) return false;
    store.flushNow(); fs.copyFileSync(store.file, filePath); shell.showItemInFolder(filePath);
    return true;
  });
}
let importCache = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 980, minHeight: 640, title: 'Praćenje suđenja', icon: path.join(__dirname, '../renderer/icon.png'), backgroundColor: '#f4f5f7', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('close', e => {
    if (win._allowClose) return;
    e.preventDefault();
    win.webContents.executeJavaScript('window.__hasUnsaved && window.__hasUnsaved()').then(async unsaved => {
      if (unsaved) {
        const r = await dialog.showMessageBox(win, { type: 'question', buttons: ['Ostani', 'Zatvori bez čuvanja'], defaultId: 0, cancelId: 0, message: 'Forma ima nesačuvane izmjene.' });
        if (r.response !== 1) return;
      }
      win._allowClose = true; win.close();
    }).catch(() => { win._allowClose = true; win.close(); });
  });
}

const Updater = require('./updater');
let updateInfo = null;
const updateRepo = () => loadConfig().updateRepo || '';
async function checkUpdate() { updateInfo = await Updater.check(app.getVersion(), updateRepo()); if (updateInfo.available) send('update:available', updateInfo); return updateInfo; }
ipcMain.handle('update:check', () => checkUpdate());
ipcMain.handle('update:install', async () => {
  if (!updateInfo || !updateInfo.available) await checkUpdate();
  if (!updateInfo.available) throw new Error('Nema novije verzije.');
  if (!app.isPackaged) throw new Error('Ažuriranje radi samo u instaliranoj (portable) verziji.');
  if (store) store.flushNow();
  await Updater.install(updateInfo, { appExe: process.execPath, onProgress: p => send('update:progress', p), onQuit: () => setTimeout(() => app.quit(), 300) });
  return true;
});
app.whenReady().then(async () => {
  if (ZAMJENA >= 0) return;
  Updater.pocisti();
  Menu.setApplicationMenu(null);
  store = await Store.open(path.join(app.getPath('userData'), 'podaci.sqlite'));
  initServices();
  Schema.applyCustom(effectiveForms());
  handlers();
  createWindow();
  // provjera nove verzije malo nakon pokretanja
  if (app.isPackaged && updateRepo()) setTimeout(() => checkUpdate().catch(() => {}), 15000);
  scheduleSync(1500);
});
app.on('window-all-closed', () => { if (ZAMJENA >= 0) return; if (store) store.flushNow(); app.quit(); });
