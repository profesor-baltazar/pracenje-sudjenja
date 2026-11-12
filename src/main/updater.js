'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');
const DIR = 'Pracenje sudjenja', EXE = 'Pracenje sudjenja.exe';

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
  const src = fs.existsSync(path.join(out, DIR)) ? path.join(out, DIR) : out;
  if (!fs.existsSync(path.join(src, EXE))) throw new Error('Preuzeti ZIP nema očekivani sadržaj.');
  // ceka da se aplikacija zatvori, kopira novu verziju i pokrece je
  const bat = path.join(tmp, 'azuriraj.cmd'), pid = process.pid, exe = path.join(installDir, EXE);
  fs.writeFileSync(bat, [
    '@echo off', 'chcp 65001 >nul',
    ':cekaj', `tasklist /FI "PID eq ${pid}" | find "${pid}" >nul && (timeout /t 1 /nobreak >nul & goto cekaj)`,
    `robocopy "${src}" "${installDir}" /E /R:5 /W:1 /NFL /NDL /NJH /NJS /NP >nul`,
    `start "" "${exe}"`,
    `rmdir /S /Q "${tmp}" >nul 2>&1`, ''].join('\r\n'), 'utf8');
  spawn('cmd.exe', ['/c', bat], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  onQuit();
}

module.exports = { check, install, cmp };
