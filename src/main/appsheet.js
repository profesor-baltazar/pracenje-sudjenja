'use strict';
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const Schema = require('../shared/schema.js');
const { toDate } = require('./importer');
const { mergeRetrials } = require('./retrials');

const uid = () => crypto.randomUUID();
const norm = s => String(s ?? '').trim().replace(/\s+/g, ' ');

function cellValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if (v.richText) return v.richText.map(x => x.text).join('');
    if ('text' in v) return v.text;
    if (v.error) return null;
  }
  return v;
}
async function readSheets(files, names) {
  const out = {};
  for (const f of files) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f);
    wb.eachSheet(ws => {
      if (!names.includes(ws.name) || out[ws.name]) return;
      const head = []; ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { head[i] = norm(cellValue(c.value)); });
      const rows = [];
      ws.eachRow((row, n) => { if (n === 1) return; const o = { _row: n }; row.eachCell({ includeEmpty: false }, (c, i) => { if (head[i]) o[head[i]] = cellValue(c.value); }); rows.push(o); });
      out[ws.name] = { head: head.filter(Boolean), rows };
    });
  }
  return out;
}

const B = v => v === true || /^(true|da|yes|y)$/i.test(String(v ?? '').trim());
const D = v => { if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10); const d = toDate(String(v ?? '')); return d || null; };
const N = v => { if (v === null || v === undefined || v === '') return null; const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '.').replace(/[^\d.-]/g, '')); return isFinite(n) ? n : null; };
const T = v => { const s = v instanceof Date ? D(v) : String(v ?? '').trim(); return s && s !== '-' ? s : null; };
const L = v => { const s = T(v); return s ? s.split(/\s*,\s*/).map(x => x.trim()).filter(Boolean) : []; };
function col(row, name) {
  if (name in row) return row[name];
  const k = Object.keys(row).find(h => h.startsWith(name)); return k ? row[k] : null;
}
const key = (sud, br) => `${norm(sud).toLowerCase()}|${norm(br).toLowerCase()}`;

// uvoz iz AppSheet excel fajlova (uvid, rocista, nasilje nad zenama)
async function readAppSheet(files) {
  const S = await readSheets(files, ['form_uvid', 'form_pritvor', 'form_rocista', 'info', 'form_nasilje_nad_ženama']);
  const recs = Object.fromEntries(Schema.LISTS.filter(l => l.module !== 'okk').map(l => [l.key, []]));
  const report = { sheets: Object.entries(S).map(([k, v]) => ({ sheet: k, rows: v.rows.length })), skipped: [], warnings: [], counts: {} };
  const add = (list, fields) => { const r = { id: uid(), fields }; recs[list].push(r); return r; };
  const caseIx = new Map();

  for (const row of (S.form_uvid ? S.form_uvid.rows : []).filter(r => T(col(r, 'UvidPredmetID')))) {
    const br = norm(col(row, 'Br. predmeta')), sud = norm(col(row, 'Sud'));
    if (!br) { report.skipped.push(`form_uvid, red ${row._row}: nema broja predmeta`); continue; }
    const hist = {};
    const H = (k, prefix) => { const n = N(col(row, prefix)); if (n) hist[k] = n; };
    H('ods:optuženog', 'Koliko puta je ročište odloženo zbog odsustva optuženog'); H('neur:optuženog', 'Koliko puta je optuženom poziv neuredno');
    H('ods:tužioca', 'Koliko puta je ročište odloženo zbog odsustva tužioca'); H('neur:tužioca', 'Koliko puta je tužiocu poziv neuredno');
    H('ods:oštećenog', 'Koliko puta je ročište odloženo zbog odsustva oštećenog'); H('neur:oštećenog', 'Koliko puta je oštećenom poziv neuredno');
    H('ods:svjedoka', 'Koliko puta je ročište odloženo zbog odsustva svjedoka'); H('neur:svjedoka', 'Koliko puta je poziv svjedoku neuredno');
    H('ods:vještaka', 'Koliko puta je ročište odloženo zbog odsustva vještaka'); H('neur:vještaka', 'Koliko puta je poziv vještaku neuredno');
    H('ods:branioca', 'Koliko puta je ročište odloženo zbog odsustva branioca'); H('neur:branioca', 'Koliko puta je poziv braniocu neuredno');
    H('ods:sudije', 'Koliko puta je ročište odloženo zbog odsustva sudije');
    H('privremene duševne poremećenosti okrivljenog', 'Koliko puta je ročište odloženo zbog privremene'); H('pribavljanja novih dokaza', 'Koliko puta je ročište odloženo radi pribavljanja');
    H('nedostatka tehničkih uslova', 'Koliko puta je ročište odloženo zbog nedostatka'); H('zahtjeva advokata', 'Koliko puta je ročište odloženo na zahtjev advokata');
    H('nedostavljanja nalaza drugih državnih organa', 'Koliko puta je ročište odloženo jer državni organ'); H('druge', 'Koliko puta je ročište odloženo zbog drugih smetnji');
    const c = add('svi_predmeti', {
      sud, Title: br, monitor: T(col(row, 'Monitor')), krivicnoDjelo: T(col(row, 'Krivično djelo')), clanKZ: T(col(row, 'Član KZCG')),
      Ponovljenipostupak: /ponovljen/i.test(String(col(row, 'Novi predmet ili ponovljeni') || '')), Pritvorskipredmet: B(col(row, 'Pritvorski predmet')),
      kontrolniZahtjev: B(col(row, 'Kontrolni zahtjev')), sporazum: B(col(row, 'Zaključen sporazum')),
      Vrstaoptu_x017e_nogakta: T(col(row, 'Optužni akt')), Brojoptu_x017e_nice: T(col(row, 'Br. optužnog akta')),
      Datumpodizanjaoptu_x017e_nice: D(col(row, 'Datum podizanja optužnog akta')), Datumprijemaoptu_x017e_niceusud: D(col(row, 'Datum prijema optužnog akta u sud')),
      Optu_x017e_nicavra_x0107_enatu_x: B(col(row, 'Da li je optužni akt vraćen')),
      Datumro_x010d_i_x0161_tazakontro: D(col(row, 'Datum održavanja ročišta za kontrolu')), Datumrje_x0161_enjaopotvr_x0111_: D(col(row, 'Datum rješenja o potvrđivanju')),
      koTuzilac: B(col(row, 'Da li je ročištu prisustvovao tužilac')), koOkrivljeni: B(col(row, 'Da li je ročištu prisustvovao okrivljeni')), koBranilac: B(col(row, 'Da li je ročištu prisustvovao branilac')),
      primjedbePodnesene: B(col(row, 'Primjedbe na optužnicu')),
      Datumnaredbezaodr_x017e_avanjegl: D(col(row, 'Datum naredbe za održavanje glavnog pretresa')), Datumzakazivanjaprvogro_x010d_i_: D(col(row, 'Datum za kad je zakazan prvi pretres')),
      Brojodr_x017e_anihro_x010d_i_x01: N(col(row, 'Broj održanih ročišta')), Brojodlo_x017e_enihro_x010d_i_x0: N(col(row, 'Broj odloženih ročišta')),
      Odlaganjero_x010d_i_x0161_ta: D(col(row, 'Datum pravosnažnosti presude')), _razloziAS: Object.keys(hist).length ? hist : null,
    });
    caseIx.set(key(sud, br), c);
    const P = { Predmet: c.id };
    for (let i = 1; i <= 30; i++) {
      const od = D(row[`${i}. Odloženo od`]), dd = D(row[`${i}. Odloženo do`]);
      if (od || dd) add('svi_odlaganja', { ...P, Odlo_x017e_enood: od, Odlo_x017e_enodo: dd, Razlogodlaganja: null, Detalji: null });
    }
    const M = (u, m, extra) => add('svi_mjere', { ...P, U_x010d_esnik: u, Mjera: m, Nov_x010d_anakazna: null, Upravapolicijenijepostupilaponar: false, Upravapolicijenijeobavijestilasu: false, Detalji: null, ...(extra || {}) });
    for (const [dat, u] of [['optuženom', 'Optuženi'], ['braniocu', 'Branilac'], ['oštećenom', 'Oštećeni'], ['zakonskom zastupniku', 'Zakonski zastupnik'], ['punomoćniku', 'Punomoćnik'], ['vještaku', 'Vještak'], ['tumaču', 'Tumač'], ['drugom licu', 'Drugo lice']]) {
      const yes = B(col(row, `Da li je izrekao novčanu kaznu ${dat}`)); const n = N(col(row, `Koliko puta je sud izrekao novčanu kaznu ${dat}`)) || (yes ? 1 : 0);
      const iznos = N(col(row, `Iznos novčane kazne ${dat}`));
      for (let k = 0; k < Math.max(n, iznos ? 1 : 0); k++) M(u, 'Novčana kazna', { Nov_x010d_anakazna: k === 0 ? iznos : null });
    }
    const dov = [];
    for (const [g, u] of [['optuženog', 'Optuženi'], ['svjedoka', 'Svjedok'], ['vještaka', 'Vještak']]) for (let k = 0; k < (N(col(row, `Koliko puta je sud izdao naredbu za prinudno dovođenje ${g}`)) || 0); k++) dov.push(M(u, 'Prinudno dovođenje'));
    const totalDov = N(col(row, 'Koliko puta je sud izdao naredbu za prinudno dovođenje?')) || 0;
    for (let k = dov.length; k < totalDov; k++) dov.push(M('Drugo lice', 'Prinudno dovođenje', { Detalji: 'Učesnik nije naveden (uvezeno iz AppSheeta)' }));
    let np = N(col(row, 'Koliko puta Uprava policije nije postupila')) || 0, no = N(col(row, 'Koliko puta Uprava policije nije obavijestila')) || 0;
    for (const m of dov) { if (np > 0) { m.fields.Upravapolicijenijepostupilaponar = true; np--; } if (no > 0) { m.fields.Upravapolicijenijeobavijestilasu = true; no--; } }
    if (np > 0 || no > 0) report.warnings.push(`${br} (${sud}): broj nepostupanja policije veći od broja naredbi za dovođenje`);
    for (let k = 0; k < (N(col(row, 'Broj raspisanih potjernica')) || (B(col(row, 'Da li je sud raspisao potjernicu')) ? 1 : 0)); k++) M('Optuženi', 'Potjernica');
    const druge = T(col(row, 'Koje su to mjere'));
    for (let k = 0; k < (N(col(row, 'Koliko puta je sud preduzeo neke druge mjere')) || (druge ? 1 : 0)); k++) M('Drugo lice', 'Drugo', { Detalji: druge });
    const zav = D(col(row, 'Datum završetka glavnog pretresa')), obj = D(col(row, 'Datum objavljivanja presude')), dost = D(col(row, 'Datum dostavljanja pisane presude'));
    if (zav || obj || dost) add('svi_presuda1', { ...P, Datumzavr_x0161_etkaglavnogpretr: zav, Datumobjavljivanjapresude: obj, Datumdostavljanjapisanogotpravka: dost });
    const zp = D(col(row, 'Datum podnošenja žalbe')), zo = D(col(row, 'Datum odluke po žalbi'));
    if (B(col(row, 'Da li je podnesena žalba')) || zp || zo) add('svi_zalba', { ...P, Datumpodno_x0161_enja_x017e_albe: zp, Datumdono_x0161_enjadrugostepene: zo,
      odlucivanje: T(col(row, 'Odlučivanje po žalbi')), Odlukaudrugostepenompostupku: T(col(row, 'Odluka u drugostepenom postupku')) });
    const ish = T(col(row, 'Ishod postupka'));
    if (ish) add('svi_ishod', { ...P, sankcija: ish, Prvostepenapresuda: null, Pravosna_x017e_napresuda: null });
    const dIstr = D(col(row, 'Datum rješenja o određivanju pritvora u istrazi')), dOpt = D(col(row, 'Datum rješenja o određivanju/produženju pritvora nakon podizanja'));
    const dPres = D(col(row, 'Datum određivanja/produženja pritvora nakon izricanja'));
    const zadr = B(col(row, 'Da li je određeno zadržavanje'));
    if (c.fields.Pritvorskipredmet || dIstr || dOpt || dPres) {
      const ukinut = B(col(row, 'Da li je pritvor ukinut'));
      const osDT = L(col(row, 'Pravni osnov koji je DT naveo u predlogu za određivanje pritvora u ist'));
      const det = [col(row, 'Drugi važni detalji pritvora u istrazi'), col(row, 'Drugi važni detalji pritvora nakon podizanja'), col(row, 'Detalji pritvora nakon izricanja')].map(T).filter(Boolean).join('\n');
      add('svi_pritvori', { ...P, _izUvida: true, Okrivljeni_x002f_Optu_x017e_eni: 'Okrivljeni (iz uvida u spise)', ranijaOsudjivanost: B(col(row, 'Da li je optuženi ranije osuđivan')),
        zadrzavanje: zadr, zadrzavanjeDatum: D(col(row, 'Datum rješenja o određivanju zadržavanja')),
        Datumodre_x0111_ivanjapritvora: dIstr || dOpt || dPres, osnovDT: osDT, Osnovodre_x0111_ivanjapritvora: osDT.length ? osDT : L(col(row, 'Pravni osnov koji je DT naveo u predlogu za određivanje/produženje')),
        produzenIstraga: B(col(row, 'Da li je pritvor u istrazi produžen')), produzenIstragaDatum: D(col(row, 'Datum rješenja o produženju pritvora u istrazi')),
        razlogNeokoncanja: T(col(row, 'Razlog zbog kojeg istraga nije bila okončana')),
        nakonOptuznog: B(col(row, 'Da li je pritvor određen/produžen nakon podizanja')), nakonOptuznogDatum: dOpt, osnovOptuzni: L(col(row, 'Pravni osnov koji je DT naveo u predlogu za određivanje/produženje')),
        nakonPresude: B(col(row, 'Da li je pritvor određen/produžen nakon izricanja')), nakonPresudeDatum: dPres, osnovPresuda: L(col(row, 'Pravni osnov koji je sud naveo')),
        Datumukidanjapritvora: ukinut ? D(col(row, 'Datum rješenja o ukidanju pritvora')) : null, Fazapostupkaukojojjepritvorukinu: ukinut ? T(col(row, 'U kojoj fazi postupka je pritvor ukinut')) : null,
        obrazlozenjeUkidanja: ukinut ? T(col(row, 'Obrazloženje/osnovi za ukidanje')) : null, Pritvorjetrajaodopravosna_x017e_: !ukinut && (dIstr || dOpt) ? true : false,
        trazioUpucivanje: B(col(row, 'Da li je optuženi tražio')), trazioZasto: T(col(row, 'Zašto?')), izdrzaoUPritvoru: B(col(row, 'Da li je optuženi izdržao')),
        obrazlozenost: T(col(row, 'Obrazloženje pritvora')), obrazlozenostPojasnjenje: T(col(row, 'Pojašnjenje')), Detalji: det || null });
    } else if (zadr) report.warnings.push(`${br} (${sud}): zadržavanje bez pritvora – upisano u komentar`);
    if (B(col(row, 'Da li je podnesen vanredni pravni lijek'))) add('svi_vpl', { ...P, vrsta: T(col(row, 'Vrsta vanrednog pravnog lijeka')) || 'Nije navedeno',
      datumPodnosenja: D(col(row, 'Datum podnošenja vanrednog pravnog lijeka')), datumOdluke: D(col(row, 'Datum odluke po vanrednom pravnom lijeku')), odluka: T(col(row, 'Odluka u postupku po vanrednom pravnom lijeku')) });
    const kom = [T(col(row, 'Završni komentar')), T(col(row, 'Opis drugih smetnji')) && `Druge smetnje (odlaganje): ${T(col(row, 'Opis drugih smetnji'))}`,
      !c.fields.Pritvorskipredmet && zadr ? `Zadržavanje od ${T(col(row, 'Datum rješenja o određivanju zadržavanja')) || '?'}` : null].filter(Boolean);
    if (kom.length) add('svi_komentari', { ...P, Komentarmonitora: kom.join('\n\n') });
  }

  for (const row of (S.form_pritvor ? S.form_pritvor.rows : []).filter(r => T(col(r, 'PritvorID')))) {
    const brFull = norm(col(row, 'Br. predmeta')), sud = norm(col(row, 'Sud'));
    const oznaka = (brFull.match(/\(([^)]*)\)/) || [])[1] || '';
    const br = /okr/i.test(oznaka) ? norm(brFull.replace(/\([^)]*\)/g, '')) : brFull;
    let c = caseIx.get(key(sud, br));
    if (!c) { report.skipped.push(`form_pritvor: ${brFull} (${sud}) – predmet ne postoji u uvidu u spise; lice nije uvezeno (dodajte ga ručno ako je potrebno)`); continue; }
    const clan = [['Istraga – tužilac', 'Pravni osnov koji je tužilac naveo u predlogu za određivanje pritvora'], ['Istraga – sud', 'Pravni osnov koji je sud prihvatio za određivanje pritvora u istrazi'],
      ['Produženje u istrazi – sud', 'Pravni osnov koji je sud prihvatio za produženje'], ['Nakon optužnog akta – tužilac', 'Pravni osnov koji je tužilac naveo u predlogu za određivanje/produženj'],
      ['Nakon optužnog akta – sud', 'Pravni osnov koji je sud prihvatio u predlogu'], ['Nakon presude – sud', 'Pravni osnov koji je sud prihvatio za određivanje/produženje pritvora ']]
      .map(([l, h]) => { const v = T(col(row, h)); return v ? `${l}: ${v}` : null; }).filter(Boolean).join('; ');
    const ukinut = B(col(row, 'Da li je sud ukinuo pritvor'));
    const f = { Okrivljeni_x002f_Optu_x017e_eni: `${/okr/i.test(oznaka) ? oznaka : 'Okrivljeni'}${N(col(row, 'Godina rođenja')) ? ' (' + N(col(row, 'Godina rođenja')) + ')' : ''}`,
      pol: T(col(row, 'Pol')), godinaRodjenja: N(col(row, 'Godina rođenja')), drzavljanstvo: T(col(row, 'Državljanstvo')), porodicniStatus: T(col(row, 'Porodični status')),
      obrazovanje: T(col(row, 'Obrazovanje')), ranijaOsudjivanost: B(col(row, 'Ranija osuđivanost')),
      zadrzavanje: B(col(row, 'Da li je licu određeno zadržavanje')), zadrzavanjeDatum: D(col(row, 'Datum rješenja o zadržavanju')),
      Datumodre_x0111_ivanjapritvora: D(col(row, 'Datum rješenja o određivanju pritvora u istrazi')) || D(col(row, 'Datum rješenja o određivanju/produženju pritvora nakon podizanja')) || D(col(row, 'Datum rješenja o određivanju/produženju pritvora nakon izricanja')),
      clanoviZKP: clan || null, produzenIstraga: B(col(row, 'Da li je pritvor u istrazi produžen')), produzenIstragaDatum: D(col(row, 'Datum rješenja o produženju pritvora u istrazi')),
      nakonOptuznog: B(col(row, 'Da li je određen/produžen pritvor nakon podizanja')), nakonOptuznogDatum: D(col(row, 'Datum rješenja o određivanju/produženju pritvora nakon podizanja')),
      nakonPresude: B(col(row, 'Da li je pritvor određen/produžen nakon izricanja')), nakonPresudeDatum: D(col(row, 'Datum rješenja o određivanju/produženju pritvora nakon izricanja')),
      trazioUpucivanje: B(col(row, 'Da li je optuženi tražio')), trazioZasto: T(col(row, 'Zašto?')), izdrzaoUPritvoru: B(col(row, 'Da li je optuženi izdržao')),
      Datumukidanjapritvora: ukinut || D(col(row, 'Datum ukidanja pritvora')) ? D(col(row, 'Datum ukidanja pritvora')) : null,
      Fazapostupkaukojojjepritvorukinu: T(col(row, 'U kojoj fazi postupka je pritvor ukinut')), obrazlozenjeUkidanja: T(col(row, 'Obrazloženje/osnovi za ukidanje')),
      Detalji: [T(col(row, 'Generalni utisak')), T(col(row, 'Sankcija koju je sud izrekao')) && `Sankcija: ${T(col(row, 'Sankcija koju je sud izrekao'))}`].filter(Boolean).join('\n') || null };
    const fromUvid = recs.svi_pritvori.find(t => t.fields.Predmet === c.id && t.fields._izUvida);
    const uvidBase = recs.svi_pritvori.find(t => t.fields.Predmet === c.id && t.fields._uvidCopy);
    if (!fromUvid && uvidBase) { for (const k of ['osnovDT', 'Osnovodre_x0111_ivanjapritvora', 'obrazlozenost', 'obrazlozenostPojasnjenje']) if (f[k] === undefined || f[k] === null) f[k] = uvidBase.fields._uvidCopy[k]; }
    if (fromUvid) { fromUvid.fields._uvidCopy = { ...fromUvid.fields };
      for (const [k, v] of Object.entries(f)) if (v !== null && v !== false && !(Array.isArray(v) && !v.length)) fromUvid.fields[k] = v;
      fromUvid.fields._izUvida = false;
    } else add('svi_pritvori', { Predmet: c.id, ...f });
  }
  for (const t of recs.svi_pritvori) { delete t.fields._izUvida; delete t.fields._uvidCopy; }

  const rocIx = new Map();
  for (const row of (S.form_rocista ? S.form_rocista.rows : []).filter(r => T(col(r, 'PredmetID')))) {
    const br = norm(col(row, 'Br. predmeta')), sud = norm(col(row, 'Sud')) || 'Nepoznat sud';
    if (!br) { report.skipped.push(`form_rocista, red ${row._row}: nema broja predmeta`); continue; }
    let c = rocIx.get(key(sud, br));
    if (!c) {
      c = add('svir_predmeti', { sud, Title: br, monitor: T(col(row, 'Monitor')), krivicnoDjelo: T(col(row, 'Krivično djelo')), clanKZ: T(col(row, 'Član KZCG')),
        pritvorski: B(col(row, 'Pritvorski predmet')), optuzniAkt: T(col(row, 'Optužni akt')), sporazum: B(col(row, 'Predložen/zaključen sporazum')) });
      rocIx.set(key(sud, br), c);
    }
    const Q = p => { const v = T(col(row, p)); return v ? v.toUpperCase() === 'N/A' ? 'N/A' : v.toUpperCase() === 'DA' ? 'DA' : v.toUpperCase() === 'NE' ? 'NE' : v : null; };
    add('svir_rocista', { Predmet: c.id, datum: D(row['Datum održavanja ročišta']), odrzano: B(col(row, 'Da li je ročište održano')), datumNarednog: D(col(row, 'Datum održavanja narednog ročišta')),
      togaSudija: B(col(row, 'Da li sudija nosi togu')), togaTuzilac: B(col(row, 'Da li tužilac nosi togu')),
      pravoNaOdbranu: Q('Da li je sud upoznao okrivljenog'), jezikSuda: Q('Da li je sud pitao učesnika'), neukaStranka: Q('Da li je sud poučio neuku stranku'),
      objasnio: T(col(row, 'Da li je objasnio prava')), poukaOstecenog: Q('Da li je sud poučio privatnog tužioca'), upozorenjeSvjedoka: Q('Da li je sud upozorio svjedoke'),
      svjedociOdvojeno: Q('Da li je sud saslušao svjedoke odvojeno'), branilacSiromasnom: Q('Da li je okrivljeni koji je slabog'),
      odsOptuzeni: B(col(row, 'Odsustvo optuženog')), pozivOptuzeni: B(col(row, 'Poziv optuženom')), odsBranilac: B(col(row, 'Odsustvo branioca')), pozivBranilac: B(col(row, 'Poziv braniocu')),
      odsTuzilac: B(col(row, 'Odsustvo tužioca')), pozivTuzilac: B(col(row, 'Poziv tužiocu')), odsSvjedok: B(col(row, 'Odsustvo svjedoka')), pozivSvjedok: B(col(row, 'Poziv svjedoku')),
      odsVjestak: B(col(row, 'Odsustvo vještaka')), pozivVjestak: B(col(row, 'Poziv vještaku')), odsSudija: B(col(row, 'Odsustvo sudije')), noviDokazi: B(col(row, 'Radi pribavljanja novih dokaza')),
      nalaziOrgana: B(col(row, 'Nalazi nisu dostavljeni')), tehnicki: B(col(row, 'Nedostatak tehničkih uslova')), zahtjevAdvokata: B(col(row, 'Zahtjev advokata')),
      dusevna: B(col(row, 'Privremena duševna poremećenost')), drugeSmetnje: B(col(row, 'Druge smetnje')), drugeSmetnjeOpis: T(col(row, 'Opis drugih smetnji')),
      prekid: B(col(row, 'Da li je došlo do prekida')), prekidRazlog: T(col(row, 'Razlog prekida')), prekidOpis: T(col(row, 'Opis drugog razloga')), prekidTrajanje: T(col(row, 'Trajanje prekida')),
      kazna251: B(col(row, 'Da li je sud izrekao novčanu kaznu zbog')), kazna251Kome: T(col(row, 'Ako jeste, kome')), kazna251Iznos: N(col(row, 'Iznos novčane kazne')),
      mjere: B(col(row, 'Da li je sud preduzeo određene procesne mjere')), opomena: B(col(row, 'Da li je sud izrekao opomenu')), opomenaLice: T(col(row, 'Lice kome je sud izrekao opomenu')),
      novcana: B(col(row, 'Da li je sud izrekao novčanu kaznu?')), novcanaLice: T(col(row, 'Lice kojem je sud izrekao novčanu')), novcanaIznos: N(col(row, 'Visina novčane kazne')),
      dovodjenje: B(col(row, 'Da li je sud izdao naredbu za prinudno')), dovodjenjeLice: T(col(row, 'Lice čije dovođenje')), potjernica: B(col(row, 'Da li je sud izdao potjernicu')),
      drugaMjera: B(col(row, 'Da li je sud preduzeo neku drugu mjeru')), drugaMjeraOpis: T(col(row, 'Opis druge mjere')),
      kontrolniZahtjev: B(col(row, 'Da li je okrivljeni oštećeni koristio')), komentar: T(col(row, 'Završni komentar')), razlogOdlaganja: null });
      { const h = recs.svir_rocista[recs.svir_rocista.length - 1].fields; const r = Schema.rocRazlozi(h); if (r.odsutni.length || r.ostali.length || r.opis) h.razlozi = r; }
  }

  const vawSheet = S.info ? 'info' : S['form_nasilje_nad_ženama'] ? 'form_nasilje_nad_ženama' : null;
  const SANK = { 'kazna kućnog zatvora': 'Kazna zatvora koja se izvršava u prostorijama za stanovanje', 'oslobođen optužbe': 'Oslobađajuća presuda' };
  const KAT = { 1: 'Do 6 mjeseci', 2: 'Od 6 mjeseci do 1 godine', 3: 'Preko 1 godine' };
  const zatvorTrajanje = (gs, txt, kat) => {
    const out = { zatvorGodina: null, zatvorMjeseci: null, zatvorDana: null };
    if (!/zatvor/i.test(gs || '') || !txt || /\d+\s*h\b/i.test(txt)) return kat ? { ...out, zatvorKategorija: kat } : out;
    const num = re => { const m = txt.match(re); return m ? Number(m[1]) : 0; };
    let g = num(/(\d+)\s*god/i), m = num(/(\d+)\s*mjesec/i), d = num(/(\d+)\s*dan/i);
    if (!g && !m && !d) return kat ? { ...out, zatvorKategorija: kat } : out;
    if (d > 31) { m += Math.floor(d / 30); d %= 30; }
    if (m > 12) { g += Math.floor(m / 12); m %= 12; }
    return { zatvorGodina: g, zatvorMjeseci: m, zatvorDana: d };
  };
  for (const row of (vawSheet ? S[vawSheet].rows : []).filter(r => T(col(r, 'rr_id')) || T(col(r, 'Br. predmeta')))) {
    const gs = T(col(row, 'Glavna sankcija'));
    add('vaw_predmeti', { sud: norm(col(row, 'Sud')), Title: norm(col(row, 'Br. predmeta')), krivicnoDjelo: T(col(row, 'Krivično djelo')), clanKZ: T(col(row, 'Član KZCG')),
      odnos: T(col(row, 'Odnos žrtve sa optuženim')), prijavljivala: B(col(row, 'Da li je žrtva prethodno prijavljivala')), pridruzila: B(col(row, 'Da li se žrtva pridružila')),
      osudjivan: B(col(row, 'Da li je optuženi prethodno osuđivan')), istovrsna: B(col(row, 'Da li je prethodno osuđivan za istovjetna')), detaljiPresuda: T(col(row, 'Detalji prethodnih presuda')),
      glavnaSankcija: gs ? (SANK[gs.toLowerCase()] || gs) : null, ...zatvorTrajanje(gs, T(col(row, 'Trajanje kazne zatvora')), KAT[N(col(row, 'Zatvor do pola godine'))] || null),
      mjeraBezbjednosti: T(col(row, 'Mjera bezbjednosti')), sankcija: T(col(row, 'Sankcija u novoj presudi')),
      olaksavajucaNepridruzivanje: B(col(row, 'Da li je jedna od olakšavajućih')), olaksavajuce: T(col(row, 'Sve olakšavajuće okolnosti')), otezavajuce: T(col(row, 'Otežavajuće okolnosti')),
      komentar: T(col(row, 'Završni komentari')) });
  }

  recs.svi_faze = recs.svi_faze || [];
  for (const c of recs.svi_predmeti) {
    const m = String(c.fields.Title || '').match(/^(.*?)\s*\(([^)]*(?:u ponovljenom|bio (?:je )?ponovljen)[^)]*)\)\s*$/i);
    if (!m) continue;
    const broj = (m[2].match(/K\s*\d+\/\d+(?:-\d+)?/i) || [])[0] || null;
    report.merged = report.merged || [];
    c.fields.Title = norm(m[1]); c.fields.Ponovljenipostupak = false;
    recs.svi_faze.push({ id: uid(), fields: { Predmet: c.id, faza: 2, brojPredmeta: broj, Datumnaredbezaodr_x017e_avanjegl: null, Datumzakazivanjaprvogro_x010d_i_: null,
      Brojodr_x017e_anihro_x010d_i_x01: null, Brojodlo_x017e_enihro_x010d_i_x0: null, napomena: 'Iz AppSheeta: podaci prvog i ponovljenog suđenja vođeni su u jednom redu.' } });
    c._inline = `${m[0]} → ${c.fields.Title}, ponovljeno suđenje 1${broj ? ' (' + broj + ')' : ''}`;
  }
  const mr = mergeRetrials(recs, 'svi_');
  require('./importer.js').normalizeTitles(recs, ['svi_predmeti', 'svi_faze', 'vaw_predmeti'], 'K', w => report.warnings.push(w));
  require('./importer.js').normalizeTitles(recs, ['svir_predmeti'], 'K', w => report.warnings.push(w));
  require('./importer.js').parseOffences(recs, ['svi_predmeti', 'svir_predmeti', 'vaw_predmeti']);
  require('./importer.js').numberDetainees(recs, ['svi_pritvori', 'svi_jemstva', 'svi_nadzor']);
  // nasilje nad zenama: zrtve i optuzeni idu u liste u predmetu. Isti sud i broj:
  // druga zrtva -> ista presuda, dodaje se zrtva; ista zrtva -> drugi optuzeni (npr. saizvrsilastvo)
  const vawIdx = new Map(), prazno = v => v === null || v === undefined || v === '' || v === false;
  const spoji = (cilj, izvor, polja) => { for (const k of polja) { const v = izvor[k]; if (prazno(v)) continue;
    if (prazno(cilj[k])) cilj[k] = v; else if (typeof v === 'string' && typeof cilj[k] === 'string' && cilj[k] !== v)
      cilj[k] = `${cilj[k]}${['detaljiPresuda', 'olaksavajuce', 'otezavajuce', 'komentar'].includes(k) ? '\n' : ' / '}${v}`; } };
  for (const c of [...recs.vaw_predmeti]) {
    const f = c.fields, key = `${f.sud}|${f.Title}`, prva = vawIdx.get(key);
    const zs = razdvojiZrtve(f.odnos).map(x => ({ ...x, prijavljivala: !!f.prijavljivala, pridruzila: !!f.pridruzila }));
    const z = zs[0];
    const o = { oznaka: null, ...Object.fromEntries(Schema.OPT_POLJA.map(k => [k, f[k] ?? null])) };
    o.osudjivan = !!o.osudjivan; o.istovrsna = !!o.istovrsna;
    for (const k of ['odnos', 'prijavljivala', 'pridruzila', ...Schema.OPT_POLJA]) delete f[k];
    if (!prva) { vawIdx.set(key, c); f.zrtve = zs; f.optuzeni = [o]; continue; }
    const pf = prva.fields;
    const ista = zs.every(n => pf.zrtve.some(x => String(x.odnos || '').trim().toLowerCase() === String(n.odnos || '').trim().toLowerCase()));
    if (ista) { pf.optuzeni.push(o); report.merged = report.merged || []; report.merged.push(`${f.Title} (${f.sud}): dva reda spojena u jedan predmet sa više optuženih`); }
    else { pf.zrtve.push(...zs); spoji(pf.optuzeni[0], o, Schema.OPT_POLJA); report.merged = report.merged || []; report.merged.push(`${f.Title} (${f.sud}): dva reda spojena u jedan predmet sa više žrtava`); }
    for (const [k, v] of Object.entries(f)) if (Array.isArray(v) && v.length) { const seen = new Set((pf[k] || []).map(x => JSON.stringify(x))); pf[k] = [...(pf[k] || []), ...v.filter(x => !seen.has(JSON.stringify(x)))]; }
    spoji(pf, f, Object.keys(f).filter(k => !['Title', 'sud'].includes(k) && !Array.isArray(f[k])));
    recs.vaw_predmeti.splice(recs.vaw_predmeti.indexOf(c), 1);
  }
  report.merged = [...recs.svi_predmeti.filter(c => c._inline).map(c => c._inline), ...mr.merged, ...(report.merged || [])];
  for (const c of recs.svi_predmeti) delete c._inline;
  for (const t of mr.unmatched) report.warnings.push(`Ponovljeni postupak ${t}: izvorni predmet nije pronađen – uvezen kao poseban predmet, označen kao ponovljeni`);
  for (const [list, rs] of Object.entries(recs)) {
    for (const r of rs) for (const f of Schema.fieldsOf(list)) if (!f.virtual && !(f.name in r.fields)) r.fields[f.name] = f.type === 'bool' ? false : f.type === 'multichoice' ? [] : null;
  }
  const choices = {};
  for (const l of Schema.LISTS.filter(x => recs[x.key])) for (const f of Schema.fieldsOf(l.key)) {
    if (f.type !== 'choice' && f.type !== 'multichoice') continue;
    const cur = [...Schema.fallbackChoices(l.key, f.name)];
    for (const r of recs[l.key]) for (const v of (f.type === 'multichoice' ? r.fields[f.name] : [r.fields[f.name]])) if (v && !cur.includes(v)) cur.push(v);
    choices[`${l.key}.${f.name}`] = cur;
  }
  if (!choices['svi_mjere.Mjera'].includes('Potjernica')) choices['svi_mjere.Mjera'].push('Potjernica');
  for (const k of Object.keys(choices)) if (k.endsWith('.sud')) choices[k] = [...Schema.SUDOVI];
  for (const [list, rs] of Object.entries(recs)) for (const r of rs) {
    const v = Schema.validate(list, r.fields, {});
    for (const [name, msg] of Object.entries(v.errors)) {
      if (msg === 'Obavezno polje.' && Schema.LIST_BY_KEY[list].isCase) continue;
      const c = Schema.LIST_BY_KEY[list].isCase ? r.fields : (recs[Schema.LIST_BY_KEY[list].caseList].find(x => x.id === r.fields.Predmet) || {}).fields || {};
      report.warnings.push(`${Schema.LIST_BY_KEY[list].title} – ${Schema.caseTitle(c)}: ${(Schema.fieldsOf(list).find(x => x.name === name) || {}).label}: ${msg}`);
    }
  }
  report.counts = Object.fromEntries(Object.entries(recs).map(([k, v]) => [k, v.length]));
  return { recs, choices, report };
}

const SINONIMI = { 'emotivna veza': 'Emotivna partnerka', 'partnerka': 'Emotivna partnerka', 'partnerka u emotivnoj vezi': 'Emotivna partnerka', 'partnerka u intimnoj vezi': 'Emotivna partnerka',
  'bivša emotivna veza': 'Bivša emotivna partnerka', 'bivša partnerka': 'Bivša emotivna partnerka', 'bivša partnerka u intimnoj vezi': 'Bivša emotivna partnerka',
  'ne poznaju se': 'Nepoznati', 'nisu se poznavali': 'Nepoznati', 'bez poznanstva': 'Nepoznati' };
// "supruga (1967.) i ćerka (1990.)" -> dvije zrtve; odnos sa liste kad se prepozna, ostatak ide u opis
function razdvojiZrtve(tekst) {
  const lista = Schema.fallbackChoices('vaw_predmeti', 'odnos');
  const djelovi = String(tekst || '').split(/\s*,\s*|\s+i\s+/).map(x => x.trim()).filter(Boolean);
  if (!djelovi.length) return [{ odnos: null, opisOdnosa: null }];
  return djelovi.map(d => {
    const cist = d.replace(/\([^)]*\)/g, ' ').replace(/^(maloljetn[aeiou]|njen[aeiou]?|njegov[aeiou]?)\s+/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const sa = lista.find(x => x.toLowerCase() === (SINONIMI[cist] || cist).toLowerCase());
    const opis = djelovi.length > 1 || (sa && sa.toLowerCase() !== d.toLowerCase()) ? d : null;
    return sa ? { odnos: sa, opisOdnosa: (opis || (SINONIMI[cist] ? d : null)) && (opis || d).toLowerCase() !== sa.toLowerCase() ? (opis || d) : null }
      : { odnos: d.charAt(0).toUpperCase() + d.slice(1), opisOdnosa: null };
  });
}

module.exports = { readAppSheet };
