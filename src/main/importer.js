'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Schema = require('../shared/schema.js');
const { mergeRetrials } = require('./retrials');
const OKK = () => Schema.listsOf('okk');
function numberDetainees(recs, lists) {
  for (const k of lists) { const by = new Map();
    for (const r of recs[k] || []) { const p = r.fields.Predmet; if (!by.has(p)) by.set(p, []); by.get(p).push(r); }
    for (const l of by.values()) l.sort((a, b) => String(a.fields.Datumodre_x0111_ivanjapritvora || '9').localeCompare(String(b.fields.Datumodre_x0111_ivanjapritvora || '9'))).forEach((r, i) => { r.fields.liceBr = i + 1; });
  }
}
function parseOffences(recs, lists) {
  for (const k of lists) for (const r of recs[k] || []) {
    if (Array.isArray(r.fields.djela) && r.fields.djela.length) continue;
    const d = Schema.parseDjela(r.fields.clanKZ, r.fields.krivicnoDjelo); if (d.length) r.fields.djela = d;
  }
}
function normalizeTitles(recs, lists, def, warn) {
  for (const k of lists) for (const r of recs[k] || []) for (const f of ['Title', 'brojPredmeta']) {
    if (!r.fields[f]) continue;
    r.fields[f] = String(r.fields[f]).trim().replace(/^n\s+(?=K)/i, '');
    let n = Schema.normCaseNo(r.fields[f], def, Schema.oznakeFor(k));
    if (!n.ok && f === 'Title') {
      const m = String(r.fields[f]).match(/^(.*?\d+\s*\/\s*(?:\d{4}|\d{2}))(?!\d)\s*[,;:\-]?\s*(.+)$/);
      const n2 = m && Schema.normCaseNo(m[1], def, Schema.oznakeFor(k));
      if (n2 && n2.ok) { n = n2; r.fields.napomenaBroja = m[2].replace(/^\((.*)\)$/, '$1').trim(); }
    }
    if (n.ok) r.fields[f] = n.value; else warn(`Broj predmeta nije prepoznat i treba ga ispraviti ručno: „${r.fields[f]}”`);
  }
  for (const k of lists) for (const r of recs[k] || []) {
    const v = r.fields.Brojoptu_x017e_nice; if (!v || !Schema.LIST_BY_KEY[k].isCase) continue;
    const al = Schema.oznakeFor(k, null, 'akt'), dz = def === 'Ks' ? 'KtS' : 'Kt';
    let n = Schema.normCaseNo(v, dz, al);
    if (!n.ok) {
      const m = String(v).match(/^(.*?\d+\s*\/\s*(?:\d{4}|\d{2}))(?!\d)\s*[,;:\-]?\s*(.+)$/), n2 = m && Schema.normCaseNo(m[1], dz, al);
      if (n2 && n2.ok) { n = n2; r.fields.napomenaBroja = [r.fields.napomenaBroja, 'Optužni akt: ' + m[2].replace(/^\((.*)\)$/, '$1').trim()].filter(Boolean).join('; '); }
    }
    if (n.ok) r.fields.Brojoptu_x017e_nice = n.value; else if (v !== '-') warn(`Broj optužnog akta nije prepoznat i treba ga ispraviti ručno: „${v}” (${r.fields.Title})`);
  }
}

function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim());
  return { head, rows: rows.filter(r => r.some(x => x.trim() !== '')).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))) };
}

// nazivi kolona iz SharePoint-a -> nasa polja
const COLS = {
  predmeti: { 'Predmet': 'Title', 'Ponovljeni postupak': 'Ponovljenipostupak', 'Vrsta predmeta': 'Vrstapredmeta', 'Broj optuženih lica': 'Brojoptu_x017e_enihlica',
    'Pritvorski predmet': 'Pritvorskipredmet', 'Predloženo jemstvo': 'Predlo_x017e_enojemstvo', 'Broj optužnog akta': 'Brojoptu_x017e_nice',
    'Datum podizanja optužnog akta': 'Datumpodizanjaoptu_x017e_nice', 'Datum prijema optužnog akta u sud': 'Datumprijemaoptu_x017e_niceusud',
    'Vrsta optužnog akta': 'Vrstaoptu_x017e_nogakta', 'Podnosilac': 'Podnosilac', 'Datum ročišta za kontrolu optužnice': 'Datumro_x010d_i_x0161_tazakontro',
    'Optužnica vraćena tužilaštvu na dopunu': 'Optu_x017e_nicavra_x0107_enatu_x', 'Datum rješenja o potvrđivanju optužnice': 'Datumrje_x0161_enjaopotvr_x0111_',
    'Razlozi vraćanja optužnice na izmjenu i dopunu': 'Razlozivra_x0107_anjaoptu_x017e_', 'Primjedbe na optužnicu': 'Primjedbenaoptu_x017e_nicu',
    'Datum naredbe za održavanje glavnog pretresa': 'Datumnaredbezaodr_x017e_avanjegl', 'Datum zakazivanja prvog ročišta': 'Datumzakazivanjaprvogro_x010d_i_',
    'Datum pravosnažnosti': 'Odlaganjero_x010d_i_x0161_ta', 'Broj održanih ročišta': 'Brojodr_x017e_anihro_x010d_i_x01', 'Broj odloženih ročišta': 'Brojodlo_x017e_enihro_x010d_i_x0' },
  odlaganja: { 'Odloženo od': 'Odlo_x017e_enood', 'Odloženo do': 'Odlo_x017e_enodo', 'Razlog odlaganja': 'Razlogodlaganja', 'Detalji': 'Detalji' },
  mjere: { 'Učesnik': 'U_x010d_esnik', 'Mjera': 'Mjera', 'Iznos novčane kazne': 'Nov_x010d_anakazna', 'Uprava policije nije postupila po naredbi za dovođenje': 'Upravapolicijenijepostupilaponar',
    'Uprava policije nije obavijestila sud o razlozima nepostupanja': 'Upravapolicijenijeobavijestilasu', 'Detalji': 'Detalji' },
  presuda1: { 'Datum završetka glavnog pretresa': 'Datumzavr_x0161_etkaglavnogpretr', 'Datum objavljivanja prvostepene presude': 'Datumobjavljivanjapresude',
    'Datum dostavljanja pisanog otpravka presude optuženom': 'Datumdostavljanjapisanogotpravka', 'Datum dostavljanja pisanog otpravka presude braniocu': 'Datumdostavljanjapisanogotpravka0',
    'Datum dostavljanja pisanog otpravka presude tužiocu': 'Datumdostavljanjapisanogotpravka1' },
  zalba: { 'Datum podnošenja žalbe': 'Datumpodno_x0161_enja_x017e_albe', 'Datum donošenja drugostepene odluke': 'Datumdono_x0161_enjadrugostepene', 'Odluka u drugostepenom postupku': 'Odlukaudrugostepenompostupku' },
  ishod: { 'Prvostepena presuda': 'Prvostepenapresuda', 'Pravosnažna presuda': 'Pravosna_x017e_napresuda' },
  pritvori: { 'Optuženi': 'Okrivljeni_x002f_Optu_x017e_eni', 'Suđenje u odsustvu': 'Su_x0111_enjeuodsustvu', 'Datum određivanja pritvora': 'Datumodre_x0111_ivanjapritvora',
    'Osnov određivanja pritvora': 'Osnovodre_x0111_ivanjapritvora', 'Pritvor je zamijenjen jemstvom': 'Pritvorjezamijenjenjemstvom', 'Pritvor je zamijenjen mjerom nadzora': 'Pritvorjezamijenjenmjeromnadzora',
    'Datum ukidanja pritvora': 'Datumukidanjapritvora', 'Faza postupka u kojoj je pritvor ukinut': 'Fazapostupkaukojojjepritvorukinu',
    'Pritvor je trajao do pravosnažnosti': 'Pritvorjetrajaodopravosna_x017e_', 'Pritvor ukinut po sili zakona nakon tri godine': 'Pritvorukinutposilizakonanakontr' },
  jemstva: { 'Optuženi': 'Optu_x017e_eni', 'Vrijednost ponuđenog jemstva': 'Vrijednostponu_x0111_enogjemstva', 'Odluka suda': 'Odlukasuda',
    'Vrijednost prihvaćenog jemstva': 'Vrijednostprihva_x0107_enogjemst', 'Komentar suda': 'Komentarsuda' },
  komentari: { 'Komentar monitora': 'Komentarmonitora' },
};
const DETECT = [
  ['predmeti', 'Vrsta optužnog akta'], ['odlaganja', 'Odloženo od'], ['mjere', 'Iznos novčane kazne'], ['presuda1', 'Datum objavljivanja prvostepene presude'],
  ['zalba', 'Datum podnošenja žalbe'], ['presuda2', 'Datum objavljivanja presude'], ['ishod', 'Prvostepena presuda'], ['pritvori', 'Datum određivanja pritvora'],
  ['jemstva', 'Vrijednost ponuđenog jemstva'], ['komentari', 'Komentar monitora'], ['_razlozi', 'Naziv prikaza'], ['_mjere', 'Mjere'], ['_ucesnici', 'Učesnici'],
];
COLS.presuda2 = { ...COLS.presuda1, 'Datum objavljivanja presude': 'Datumobjavljivanjapresude' };
delete COLS.presuda2['Datum objavljivanja prvostepene presude'];

function toDate(s) {
  s = (s || '').trim(); if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}
function toNumber(s) { s = (s || '').trim(); if (!s) return null; const n = Number(s.replace(/,/g, '')); return isFinite(n) ? n : undefined; }
function toBool(s) { return /^(true|da|yes|1)$/i.test((s || '').trim()); }
function toMulti(s) {
  s = (s || '').trim(); if (!s) return [];
  if (s.startsWith('[')) { try { return JSON.parse(s).map(String); } catch { } }
  return s.split(/;#|;|\n/).map(x => x.trim()).filter(Boolean);
}
const norm = s => (s || '').trim().replace(/\s+/g, ' ');

function convert(listKey, row, warn) {
  const out = {};
  for (const f of Schema.fieldsOf(listKey)) out[f.name] = f.type === 'bool' ? false : f.type === 'multichoice' ? [] : null;
  for (const [col, name] of Object.entries(COLS[listKey])) {
    if (!(col in row)) continue;
    const f = Schema.fieldsOf(listKey).find(x => x.name === name); const raw = row[col];
    let v;
    switch (f.type) {
      case 'date': v = toDate(raw); break;
      case 'number': case 'money': v = toNumber(raw); break;
      case 'bool': v = toBool(raw); break;
      case 'multichoice': v = toMulti(raw); break;
      default: v = raw.trim() === '' ? null : (name === 'Title' ? norm(raw) : raw.replace(/\s+$/, ''));
    }
    if (v === undefined) { warn(`neispravna vrijednost „${raw}” u koloni „${col}” – izostavljena`); v = null; }
    out[name] = v;
  }
  return out;
}

function readExport(files) {
  const found = {}, report = { files: [], skipped: [], warnings: [], unknownFiles: [] };
  for (const file of files) {
    const { head, rows } = parseCsv(fs.readFileSync(file, 'utf8'));
    const hit = DETECT.find(([, col]) => head.includes(col));
    if (!hit) { report.unknownFiles.push(path.basename(file)); continue; }
    if (found[hit[0]]) report.warnings.push(`Dva fajla za istu listu (${path.basename(file)}) – koristi se prvi.`);
    else found[hit[0]] = { file: path.basename(file), rows };
  }
  const recs = Object.fromEntries(OKK().map(l => [l.key, []]));
  const byTitle = new Map();
  for (const [i, row] of (found.predmeti ? found.predmeti.rows : []).entries()) {
    const w = m => report.warnings.push(`KS Predmeti, red ${i + 2}: ${m}`);
    const f = convert('predmeti', row, w);
    if (!f.Title) { report.skipped.push(`KS Predmeti, red ${i + 2}: nema broja predmeta`); continue; }
    if (byTitle.has(f.Title.toLowerCase())) { report.skipped.push(`KS Predmeti, red ${i + 2}: predmet ${f.Title} se ponavlja`); continue; }
    const id = crypto.randomUUID(); byTitle.set(f.Title.toLowerCase(), id); recs.predmeti.push({ id, fields: f });
  }
  for (const l of OKK().slice(1)) {
    const src = found[l.key]; if (!src) continue;
    for (const [i, row] of src.rows.entries()) {
      const where = `${l.title}, red ${i + 2}`;
      const t = norm(row['Predmet']);
      const caseId = t && byTitle.get(t.toLowerCase());
      if (!caseId) { report.skipped.push(`${where}: ${t ? `predmet „${t}” ne postoji u osnovnim podacima` : 'nije navedeno kojem predmetu pripada'}`); continue; }
      const f = convert(l.key, row, m => report.warnings.push(`${where}: ${m}`));
      f.Predmet = caseId;
      recs[l.key].push({ id: crypto.randomUUID(), fields: f });
    }
  }
  const mr = mergeRetrials(recs, '');
  normalizeTitles(recs, ['predmeti', 'faze'], 'Ks', w => report.warnings.push(w));
  parseOffences(recs, ['predmeti']);
  numberDetainees(recs, ['pritvori', 'jemstva', 'nadzor']);
  report.merged = mr.merged;
  for (const t of mr.unmatched) report.warnings.push(`Ponovljeni postupak ${t}: izvorni predmet nije pronađen – uvezen kao poseban predmet`);
  const choices = {};
  const add = (key, vals) => { const cur = choices[key] || [...(Schema.FALLBACK_CHOICES[key] || [])]; for (const v of vals) if (v && !cur.includes(v)) cur.push(v); choices[key] = cur; };
  if (found._razlozi) choices['odlaganja.Razlogodlaganja'] = found._razlozi.rows.map(r => r['Naziv prikaza'].trim()).filter(Boolean);
  if (found._mjere) choices['mjere.Mjera'] = found._mjere.rows.slice().sort((a, b) => Number(a['Br.']) - Number(b['Br.'])).map(r => r['Mjere'].trim()).filter(Boolean);
  if (found._ucesnici) choices['mjere.U_x010d_esnik'] = found._ucesnici.rows.map(r => r['Učesnici'].trim()).filter(Boolean);
  for (const l of OKK()) for (const f of Schema.fieldsOf(l.key)) {
    if (f.type !== 'choice' && f.type !== 'multichoice') continue;
    const vals = recs[l.key].flatMap(r => f.type === 'multichoice' ? r.fields[f.name] : [r.fields[f.name]]).filter(Boolean);
    add(`${l.key}.${f.name}`, vals);
  }
  const titleOf = id => (recs.predmeti.find(p => p.id === id) || { fields: {} }).fields.Title;
  for (const l of OKK()) for (const r of recs[l.key]) {
    const ctx = {};
    if (l.key === 'presuda1' || l.key === 'presuda2') ctx.lastAdjournedTo = recs.odlaganja.filter(o => o.fields.Predmet === r.fields.Predmet).map(o => o.fields.Odlo_x017e_enodo).filter(Schema.isDate).sort().pop();
    const v = Schema.validate(l.key, r.fields, ctx);
    for (const [name, msg] of Object.entries(v.errors)) {
      if (msg === 'Obavezno polje.') continue;
      const lab = Schema.fieldsOf(l.key).find(x => x.name === name).label;
      report.warnings.push(`${l.title} – ${l.key === 'predmeti' ? r.fields.Title : titleOf(r.fields.Predmet)}: ${lab}: ${msg}`);
    }
  }
  report.files = Object.entries(found).map(([k, v]) => ({ list: k, file: v.file, rows: v.rows.length }));
  report.counts = Object.fromEntries(OKK().map(l => [l.key, recs[l.key].length]));
  report.missingLists = OKK().filter(l => COLS[l.key] && !found[l.key]).map(l => l.title);
  return { recs, choices, report };
}

module.exports = { numberDetainees, parseOffences, normalizeTitles, parseCsv, readExport, toDate, toNumber, toMulti };
