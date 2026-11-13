'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');
const DIRS = ['Praćenje suđenja', 'Pracenje sudjenja'], EXES = ['Praćenje suđenja.exe', 'Pracenje sudjenja.exe'];

const cmp = (a, b) => { const x = String(a).replace(/^v/, '').split('.').map(Number), y = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; };

async function check(currentVersion, repo) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) return { available: false, error: 'Repozitorijum za ažuriranja nije podešen.' };
  let res;
  try { res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PracenjeSudjenja' }, signal: AbortSignal.timeout(20000) }); }
  catch { return { available: false, error: 'Nema veze sa GitHubom.' }; }
  if (res.status === 404) return { available: false, error: 'Nema objavljenih verzija (ili repozitorijum nije javan).' };
  if (!res.ok) return { available: false, error: `GitHub je odgovorio greškom ${res.status}.` };
  const r = await res.json(), version = String(r.tag_name || '').replace(/^v/, '');
  const asset = (r.assets || []).find(a => /^Pracenje-sudjenja.*\.zip$/i.test(a.name)) || (r.assets || []).find(a => /\.zip$/i.test(a.name));
  return { available: !!version && cmp(version, currentVersion) > 0, version, current: currentVersion, notes: r.body || '', page: r.html_url, url: asset ? asset.browser_download_url : null, size: asset ? asset.size : null };
}

const ps = (cmd) => new Promise((ok, fail) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { windowsHide: true, timeout: 300000 },
  (e, _o, err) => e ? fail(new Error(String(err || e.message).trim())) : ok()));

async function install(info, { appExe, onProgress, onQuit }) {
  if (process.platform !== 'win32') throw new Error('Automatsko ažuriranje radi samo na Windowsu.');
  if (!info || !info.url) throw new Error('Za ovu verziju nema ZIP fajla.');
  const installDir = path.dirname(appExe);
  try { fs.accessSync(installDir, fs.constants.W_OK); } catch { throw new Error(`Nema prava za upis u folder ${installDir}. Raspakujte novu verziju ručno.`); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-update-')), zip = path.join(tmp, 'update.zip'), out = path.join(tmp, 'novo');
  const res = await fetch(info.url, { headers: { 'User-Agent': 'PracenjeSudjenja' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`Preuzimanje nije uspjelo (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || info.size || 0, chunks = []; let got = 0;
  for await (const c of res.body) { chunks.push(c); got += c.length; if (onProgress && total) onProgress(Math.round(got / total * 100)); }
  fs.writeFileSync(zip, Buffer.concat(chunks.map(c => Buffer.from(c))));
  // raspakivanje preko powershell-a
  await ps(`Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${out.replace(/'/g, "''")}' -Force`);
  const src = DIRS.map(d => path.join(out, d)).find(d => fs.existsSync(d)) || out;
  const novi = EXES.find(e => fs.existsSync(path.join(src, e)));
  if (!novi) throw new Error('Preuzeti ZIP nema očekivani sadržaj.');
  // nova verzija sama ceka da se ova zatvori, kopira se preko nje i pokrece (bez powershell skripte)
  zapis(`pokrecem ${path.join(src, novi)} -> ${installDir}`);
  spawn(path.join(src, novi), ['--zamijeni', installDir, String(process.pid), appExe], { detached: true, stdio: 'ignore', cwd: src, windowsHide: false }).unref();
  onQuit();
}

const LOG = path.join(os.tmpdir(), 'pracenje-azuriranje.log');
const zapis = m => { try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`); } catch { } };
const pauza = ms => new Promise(r => setTimeout(r, ms));
const ziv = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// procesi koji rade iz starog foldera (glavni prozor, GPU i ostali pomocni procesi imaju isti exe)
function procesiIz(folder) {
  return new Promise(ok => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `@(Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith('${folder.replace(/'/g, "''")}\\', [StringComparison]::OrdinalIgnoreCase) }).Count`],
  { windowsHide: true, timeout: 20000 }, (e, out) => ok(e ? -1 : Number(String(out).trim()) || 0)));
}
const isti = (a, b) => { try { const x = fs.statSync(a), y = fs.statSync(b); return x.size === y.size && fs.readFileSync(a).equals(fs.readFileSync(b)); } catch { return false; } };
// kopira samo ono sto se razlikuje; zakljucan fajl se preimenuje (.staro) pa se upisuje novi
function kopiraj(src, dst, stat) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { kopiraj(s, d, stat); continue; }
    if (fs.existsSync(d) && isti(s, d)) { stat.isti++; continue; }
    try { fs.copyFileSync(s, d); }
    catch (err) {
      if (!fs.existsSync(d)) throw err;
      zapis(`zakljucan ${d}: ${err.code}, preimenujem`);
      fs.renameSync(d, `${d}.staro-${Date.now()}`); fs.copyFileSync(s, d);
    }
    stat.novi++;
  }
}

async function zamijeni([installDir, pid, staroExe], { app, dialog }) {
  const src = path.dirname(process.execPath), exe = path.basename(process.execPath);
  try {
    if (!installDir || !fs.existsSync(installDir)) throw new Error('Folder aplikacije nije pronađen.');
    zapis(`zamjena ${src} -> ${installDir}`);
    for (let i = 0; i < 240 && ziv(Number(pid)); i++) await pauza(500);
    for (let i = 0; i < 60; i++) { const n = await procesiIz(installDir); if (n <= 0) break; if (i % 10 === 0) zapis(`jos ${n} procesa iz starog foldera`); await pauza(1000); }
    await pauza(1000);
    let greska = null;
    for (let i = 0; i < 10; i++) {
      const stat = { isti: 0, novi: 0 };
      try { kopiraj(src, installDir, stat); greska = null; zapis(`kopirano: ${stat.novi} novih, ${stat.isti} istih`); break; }
      catch (e) { greska = e; zapis(`kopiranje, pokušaj ${i + 1}: ${e.message}`); await pauza(2000); }
    }
    if (greska) throw greska;
    const nova = path.join(installDir, exe);
    if (staroExe && path.resolve(staroExe).toLowerCase() !== path.resolve(nova).toLowerCase()) { try { fs.unlinkSync(staroExe); } catch { } }
    zapis('pokrecem ' + nova);
    spawn(nova, [], { detached: true, stdio: 'ignore', cwd: installDir }).unref();
  } catch (e) {
    zapis('GRESKA ' + (e.stack || e.message));
    await app.whenReady();
    dialog.showErrorBox('Ažuriranje nije uspjelo', `${e.message}\n\nNovu verziju preuzmite ručno sa stranice Releases. Detalji su u fajlu ${LOG}.`);
  }
  app.exit(0);
}

// brise ostatke prethodnih azuriranja (Temp folder i preimenovane .staro fajlove u folderu aplikacije)
function pocisti(installDir) {
  try { for (const d of fs.readdirSync(os.tmpdir())) if (d.startsWith('tm-update-')) fs.rmSync(path.join(os.tmpdir(), d), { recursive: true, force: true }); } catch { }
  const brisi = dir => { try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name);
    if (e.isDirectory()) brisi(p); else if (/\.staro-\d+$/.test(e.name)) try { fs.unlinkSync(p); } catch { } } } catch { } };
  if (installDir) brisi(installDir);
}

module.exports = { check, install, cmp, zamijeni, pocisti };
