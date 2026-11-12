'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

const origLoad = Module._load;
Module._load = function (req, ...rest) { if (req === 'electron') return { shell: {}, safeStorage: { isEncryptionAvailable: () => false } }; return origLoad.call(this, req, ...rest); };

const S = require('../src/shared/schema.js');
const ST = require('../src/shared/stats.js');
const { Store } = require('../src/main/db.js');
const { Sync, fromServer, toServer } = require('../src/main/sync.js');
const { Auth, Firestore, enc, dec } = require('../src/main/firebase.js');
const Importer = require('../src/main/importer.js');

let passed = 0; const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const cell = (blocks, title, label) => { const b = blocks.find(x => x.title.startsWith(title)); assert(b, 'nema bloka ' + title); const r = b.rows.find(x => x[0] === label); assert(r, `nema reda "${label}" u "${title}"`); return r; };

test('validacija: redosljed datuma u osnovnim podacima', () => {
  const v = S.validate('predmeti', { Title: 'Ks 1/24', Vrstaoptu_x017e_nogakta: 'Optužnica', Datumpodizanjaoptu_x017e_nice: '2024-03-10', Datumprijemaoptu_x017e_niceusud: '2024-03-05' });
  assert.match(v.errors.Datumprijemaoptu_x017e_niceusud, /prije datuma podizanja/);
  const v2 = S.validate('predmeti', { Title: 'Ks 1/24', Datumnaredbezaodr_x017e_avanjegl: '2024-05-01', Datumzakazivanjaprvogro_x010d_i_: '2024-05-01' });
  assert.match(v2.errors.Datumzakazivanjaprvogro_x010d_i_, /nakon dana naredbe/, 'isti dan nije dozvoljen');
  assert.deepStrictEqual(S.validate('predmeti', { Title: 'Ks 1/24' }).errors, {});
  assert.strictEqual(S.validate('predmeti', {}).errors.Title, S.OBAVEZNA_POLJA ? 'Obavezno polje.' : undefined, 'obavezna polja isključena u probnoj fazi');
});
test('validacija: upozorenje za rok od 15 dana (ne blokira čuvanje)', () => {
  const v = S.validate('predmeti', { Title: 'Ks 1/24', Vrstaoptu_x017e_nogakta: 'Optužnica', Datumprijemaoptu_x017e_niceusud: '2024-01-01', Datumro_x010d_i_x0161_tazakontro: '2024-01-20' });
  assert.deepStrictEqual(v.errors, {}); assert.match(v.warnings.Datumro_x010d_i_x0161_tazakontro, /19 dana/);
});
test('validacija: kontrola optužnice se ne prikazuje za optužni predlog', () => {
  const f = S.fieldsOf('predmeti').find(x => x.name === 'Datumro_x010d_i_x0161_tazakontro');
  assert.strictEqual(S.isVisible(f, { Vrstaoptu_x017e_nogakta: 'Optužni predlog' }), false);
  assert.strictEqual(S.isVisible(f, { Vrstaoptu_x017e_nogakta: 'Optužni predlog', Datumro_x010d_i_x0161_tazakontro: '2024-01-01' }), true, 'polje sa vrijednošću ostaje vidljivo');
});
test('validacija: mjere po učesniku (čl. 119, 251, 321 ZKP)', () => {
  const m = S.fieldsOf('mjere').find(f => f.name === 'Mjera');
  const allowed = u => S.FALLBACK_CHOICES['mjere.Mjera'].filter(x => m.filter(x, { U_x010d_esnik: u }));
  assert(allowed('Optuženi').includes('Udaljenje iz sudnice'));
  assert(allowed('Branilac').includes('Udaljenje iz sudnice'), 'čl. 321 st. 1: i ostala lica mogu biti udaljena');
  assert(!allowed('Optuženi').includes('Novčana kazna'), 'optuženom se ne izriče novčana kazna');
  assert.deepStrictEqual(allowed('Tužilac'), ['Obavještenje višem državnom tužiocu', 'Drugo']);
  const kazna = { Predmet: 'a', U_x010d_esnik: 'Svjedok', Mjera: 'Novčana kazna', Nov_x010d_anakazna: 1500 };
  assert(S.validate('mjere', kazna, { noviZKP: true }).errors.Nov_x010d_anakazna, 'najviše 1.000 € po izmjenama ZKP-a');
  assert(!S.validate('mjere', kazna, { noviZKP: false }).errors.Nov_x010d_anakazna, 'stari predmeti: bez novog ograničenja');
  assert(!allowed('Branilac').includes('Prinudno dovođenje'));
  assert(allowed('Svjedok').includes('Prinudno dovođenje'));
  assert(!allowed('Svjedok').includes('Lokalna potjernica'));
});
test('izmjene ZKP-a 2026: važe samo za predmete započete nakon stupanja na snagu', () => {
  const novi = { Vrstaoptu_x017e_nogakta: 'Optužnica', Datumpodizanjaoptu_x017e_nice: '2026-10-01', Datumro_x010d_i_x0161_tazakontro: '2026-10-10', Datumrje_x0161_enjaopotvr_x0111_: '2026-10-30' };
  const stari = { ...novi, Datumpodizanjaoptu_x017e_nice: '2026-08-01' };
  assert.strictEqual(S.potvrdaRok(novi).rok, 8); assert.strictEqual(S.potvrdaRok(stari), null);
  const f = S.fieldsOf('predmeti').find(x => x.name === 'kontrolaNacin');
  assert(S.isVisible(f, novi) && !S.isVisible(f, stari), 'polje „Način kontrole” samo za nove predmete');
  assert(S.validate('predmeti', { Title: 'Ks 1/26', ...novi }).warnings.Datumrje_x0161_enjaopotvr_x0111_, 'upozorenje za potvrđivanje van roka');
  assert(!S.validate('predmeti', { Title: 'Ks 1/26', ...stari }).warnings.Datumrje_x0161_enjaopotvr_x0111_, 'bez upozorenja za stare predmete');
  const n = S.fieldsOf('nadzor').find(x => x.name === 'elektronski');
  assert(S.isVisible(n, {}, { noviZKP: true }) && !S.isVisible(n, {}, { noviZKP: false }));
});
test('hronologija datuma: predmet, odlaganja, presuda, žalba, ponovljeno suđenje, pritvor', () => {
  const c = { Title: 'K 1/24', Vrstaoptu_x017e_nogakta: 'Optužnica', Datumpodizanjaoptu_x017e_nice: '2024-01-10', Datumprijemaoptu_x017e_niceusud: '2024-01-12',
    Datumrje_x0161_enjaopotvr_x0111_: '2024-02-01', Datumnaredbezaodr_x017e_avanjegl: '2024-02-10' };
  const K = { odlaganja: [{ _id: 'o1', faza: 1, Odlo_x017e_enood: '2024-03-01', Odlo_x017e_enodo: '2024-03-20' }, { _id: 'o2', faza: 1, Odlo_x017e_enood: '2024-04-01', Odlo_x017e_enodo: '2024-04-20' }],
    presuda1: [{ _id: 'p1', faza: 1, Datumzavr_x0161_etkaglavnogpretr: '2024-05-01', Datumobjavljivanjapresude: '2024-05-03' }],
    zalba: [{ _id: 'z1', faza: 1, Datumpodno_x0161_enja_x017e_albe: '2024-06-01', Datumdono_x0161_enjadrugostepene: '2024-09-01', Odlukaudrugostepenompostupku: 'Presuda se ukida' }],
    faze: [{ _id: 'f2', faza: 2, Datumnaredbezaodr_x017e_avanjegl: '2024-10-01' }] };
  const ctx = (extra = {}) => ({ case: c, kids: k => K[k] || [], today: '2025-01-01', ...extra });
  const E = (list, rec, x) => S.validate(list, { Predmet: 'c', ...rec }, ctx(x)).errors;
  assert.match(E('predmeti', { ...c, Datumprijemaoptu_x017e_niceusud: '2024-01-05' }).Datumprijemaoptu_x017e_niceusud, /podizanja optužnog akta/);
  assert.match(E('predmeti', { ...c, Datumpodizanjaoptu_x017e_nice: '2024-03-15', Datumprijemaoptu_x017e_niceusud: null, Datumrje_x0161_enjaopotvr_x0111_: null, Datumnaredbezaodr_x017e_avanjegl: null }).Datumpodizanjaoptu_x017e_nice, /prvog odlaganja/);
  assert.match(E('predmeti', { ...c, Odlaganjero_x010d_i_x0161_ta: '2024-08-01' }).Odlaganjero_x010d_i_x0161_ta, /drugostepene odluke/);
  assert.match(E('predmeti', { ...c, Datumpodizanjaoptu_x017e_nice: '2026-01-01' }).Datumpodizanjaoptu_x017e_nice, /budućnosti/);
  assert.match(E('odlaganja', { faza: 1, Odlo_x017e_enood: '2024-01-05' }).Odlo_x017e_enood, /podizanja optužnog akta/);
  assert.match(E('odlaganja', { faza: 1, Odlo_x017e_enood: '2024-03-15' }).Odlo_x017e_enood, /prethodnog \(2\.\) odlaganja/);
  assert.match(E('odlaganja', { faza: 1, Odlo_x017e_enood: '2024-04-10' }, { editId: 'o1', orig: K.odlaganja[0] }).Odlo_x017e_enood, /sljedećeg \(2\.\) odlaganja/);
  assert.match(E('odlaganja', { faza: 1, Odlo_x017e_enood: '2024-05-10' }).Odlo_x017e_enood, /završetka glavnog pretresa/);
  assert(!E('odlaganja', { faza: 1, Odlo_x017e_enood: '2024-04-25', Odlo_x017e_enodo: '2024-04-28' }).Odlo_x017e_enood, 'ispravno odlaganje prolazi');
  assert.match(E('presuda1', { faza: 1, Datumzavr_x0161_etkaglavnogpretr: '2024-03-25', Datumobjavljivanjapresude: '2024-03-26' }, { editId: 'p1' }).Datumzavr_x0161_etkaglavnogpretr, /odlaganja/);
  assert.match(E('zalba', { faza: 1, Datumpodno_x0161_enja_x017e_albe: '2024-04-01' }, { editId: 'z1' }).Datumpodno_x0161_enja_x017e_albe, /prvostepene presude/);
  assert.match(E('faze', { faza: 2, Datumnaredbezaodr_x017e_avanjegl: '2024-08-01' }, { editId: 'f2' }).Datumnaredbezaodr_x017e_avanjegl, /ukinuta/);
  assert.match(E('odlaganja', { faza: 2, Odlo_x017e_enood: '2024-09-15' }).Odlo_x017e_enood, /naredbe za ponovljeno suđenje/);
  assert(E('pritvori', { Datumodre_x0111_ivanjapritvora: '2023-12-01', zadrzavanje: true, zadrzavanjeDatum: '2023-12-05' }).tok, 'greške starih polja pritvora prikazuju se uz tok');
  assert.match(E('pritvori', { Datumodre_x0111_ivanjapritvora: '2023-12-01', produzenIstraga: true, produzenIstragaDatum: '2024-01-20' }).tok, /podizanja optužnog akta/);
  assert.match(E('vpl', { datumPodnosenja: '2024-01-01' }, { case: { ...c, Odlaganjero_x010d_i_x0161_ta: '2024-10-01' } }).datumPodnosenja, /pravosnažnosti/);
});
test('broj predmeta: oznaka + broj/godina u jednoj koloni', () => {
  assert.strictEqual(S.normCaseNo('ks20/23', null, ['Ks']).value, 'Ks 20/23');
  assert.strictEqual(S.normCaseNo('K br. 64/22', null, ['K', 'Km']).value, 'K 64/22');
  assert.strictEqual(S.normCaseNo('20/2023', 'K', ['K']).value, 'K 20/23');
  assert(!S.normCaseNo('Kvo 3/24', null, S.oznakeFor('svi_predmeti')).ok, 'Kvo samo u praćenju ročišta');
  assert.strictEqual(S.normCaseNo('kvo3/24', null, S.oznakeFor('svir_predmeti')).value, 'Kvo 3/24');
  assert.strictEqual(S.normCaseNo('kvso 3/24', null, S.oznakeFor('roc_predmeti')).value, 'KvSo 3/24');
  assert.deepStrictEqual(S.oznakeFor('svir_predmeti', { sud: 'Osnovni sud Bar' }), ['K', 'Km', 'Kvo']);
  assert(!S.normCaseNo('Kv 3/24', null, S.oznakeFor('svir_predmeti')).ok, 'Kv (vijeće van glavnog pretresa) nije oznaka predmeta');
  assert.deepStrictEqual(S.oznakeFor('predmeti'), ['Ks']);
  assert.deepStrictEqual(S.oznakeFor('predmeti', null, 'akt'), ['KtS']);
  assert.deepStrictEqual(S.oznakeFor('svi_predmeti', { sud: 'Osnovni sud Bar' }, 'akt'), ['Kt']);
  assert.strictEqual(S.normCaseNo('kts118/18', null, ['KtS']).value, 'KtS 118/18');
  assert.match(S.validate('svi_predmeti', { sud: 'Osnovni sud Bar', Brojoptu_x017e_nice: 'KtS 1/24' }).errors.Brojoptu_x017e_nice, /nije predviđena/);
  assert.deepStrictEqual(S.oznakeFor('svi_predmeti', { sud: 'Osnovni sud Bar' }), ['K', 'Km']);
  assert.deepStrictEqual(S.oznakeFor('svi_predmeti', { sud: 'Viši sud Podgorica' }), ['K', 'Km', 'Ks']);
  assert.match(S.validate('svi_predmeti', { Title: 'Ks 1/24', sud: 'Viši sud Bijelo Polje' }).errors.Title, /nije predviđena/);
  assert.strictEqual(S.normCaseNo('K 29/22-21', null, ['K']).value, 'K 29/22-21', 'spojeni/ponovljeni predmet');
  assert.match(S.normCaseNo('K 220/1', null, ['K']).err, /dvije cifre/);
  assert(!S.normCaseNo('n Ks 41/23', null, ['Ks']).ok, '„n” nije dozvoljeno');
  assert.match(S.validate('predmeti', { Title: 'K 1/24' }).errors.Title, /nije predviđena/);
});
test('krivična djela: KZ katalog, tekst, stari upisi, statistika', () => {
  assert.strictEqual(S.kzClan('143').naziv, 'Ubistvo'); assert.strictEqual(S.kzClan('168a').naziv, 'Proganjanje'); assert.strictEqual(S.kzClan('999'), null);
  assert.strictEqual(S.djelaText([{ clan: '143', stav: 1, dodaci: ['pokusaj'] }]), 'čl. 143 st. 1 u vezi sa čl. 20 – Ubistvo (u pokušaju)');
  assert.deepStrictEqual(S.parseDjela('220/5', 'Nasilje u porodici').map(d => [d.clan, d.stav]), [['220', 5]]);
  assert.deepStrictEqual(S.parseDjela('krađa+falsifikovanje', '239+260/1 u vezi s 48').map(d => [d.clan, d.dodaci.join()]), [['239', 'sticaj'], ['260', 'sticaj']]);
  assert.match(S.validate('svi_predmeti', { sud: 'Osnovni sud Bar', djela: [{ clan: '999' }] }).errors.djela, /ne postoji/);
  assert.strictEqual(S.kzClan('220').stavova, 8); assert.strictEqual(S.kzClan('143').stavova, 1);
  assert.match(S.validate('svi_predmeti', { sud: 'Osnovni sud Bar', djela: [{ clan: '239', stav: 3 }] }).errors.djela, /ima 2 stava/);
  assert.strictEqual(S.parseDjela('143/2', '')[0].stav, null, 'nepostojeći stav se ne uvozi');
  assert.strictEqual(S.tackeU(S.kzClan('144'), null), 10, 'Teško ubistvo: jedan stav, 10 tačaka');
  assert.strictEqual(S.djelaText([{ clan: '144', tacka: 4 }]), 'čl. 144 tač. 4 – Teško ubistvo');
  assert.strictEqual(S.parseDjela('144/1', '')[0].tacka, 1, '„144/1” – član bez stavova: tačka 1');
  assert.match(S.validate('svi_predmeti', { sud: 'Osnovni sud Bar', djela: [{ clan: '144', tacka: 11 }] }).errors.djela, /tačka ne postoji/);
  const b = ST.compute('djela', { predmeti: [{ _id: 'a', djela: [{ clan: '143', dodaci: ['pokusaj'] }, { clan: '239' }] }, { _id: 'b', djela: [{ clan: '239' }] }] }, null, 'svi');
  assert.deepStrictEqual(b[0].rows[0], ['Krađa (čl. 239)', 2, '100%']);
  assert.strictEqual(b[2].rows.find(r => /pokušaju/.test(r[0]))[1], 1);
});
test('razlozi odlaganja ročišta: više odsutnih sa dostavom, stari unosi', () => {
  const n = S.rocRazlozi({ razlozi: { odsutni: [{ ucesnik: 'Optuženi', dostava: 'neuredna' }, { ucesnik: 'Svjedok', dostava: 'uredna' }], ostali: ['Zahtjev branioca'] } });
  assert.strictEqual(n.odsutni.length, 2); assert.deepStrictEqual(n.ostali, ['Zahtjev branioca']);
  const old = S.rocRazlozi({ odsOptuzeni: true, pozivOptuzeni: true, odsSvjedok: true, tehnicki: true });
  assert.deepStrictEqual(old.odsutni, [{ ucesnik: 'Optuženi', dostava: 'uredna' }, { ucesnik: 'Svjedok', dostava: 'neuredna' }]);
  assert.deepStrictEqual(old.ostali, ['Nedostatak tehničkih uslova']);
  assert.deepStrictEqual(S.rocRazlozi({ razlogOdlaganja: '301 - Optuženi nije pristupio. Iz spisa…' }).odsutni, [{ ucesnik: 'Optuženi', dostava: 'nepoznato' }]);
  assert.deepStrictEqual(S.rocRazlozi({ razlogOdlaganja: '703 - Viša sila (detaljnije u komentarima)' }).ostali, ['Viša sila']);
});
test('Predmeti OKK: vrsta predmeta umjesto liste krivičnih djela', () => {
  for (const k of ['predmeti', 'roc_predmeti']) {
    const names = S.fieldsOf(k).filter(f => !f.hidden).map(f => f.name);
    assert(!names.includes('djela') && names.includes('krivicnoDjelo') && names.includes('Vrstapredmeta'), k);
    assert.strictEqual(S.fieldsOf(k).find(f => f.name === 'krivicnoDjelo').type, 'longtext');
  }
  assert(S.fieldsOf('svi_predmeti').some(f => f.name === 'djela'), 'Praćenje suđenja zadržava listu djela');
});
test('pritvor, jemstvo, mjere nadzora: lica bez ličnih podataka, najviše koliko ima optuženih', () => {
  for (const k of ['pritvori', 'jemstva', 'nadzor']) assert(!S.fieldsOf(k).some(f => !f.hidden && /^(Okrivljeni_x002f_Optu_x017e_eni|Optu_x017e_eni|okrivljeni|pol|godinaRodjenja|drzavljanstvo|clanoviZKP)$/.test(f.name)), k);
  const ctx = (n, b) => ({ case: { Brojoptu_x017e_enihlica: b }, kids: () => Array.from({ length: n }, (_, i) => ({ _id: 'x' + i })) });
  assert.match(S.validate('jemstva', { Predmet: 'a', Odlukasuda: 'Usvojeno' }, ctx(2, 2)).errors.Odlukasuda, /3\. lice/);
  assert(!S.validate('jemstva', { Predmet: 'a', Odlukasuda: 'Usvojeno' }, ctx(1, 12)).errors.Odlukasuda);
  assert.match(S.validate('pritvori', { Predmet: 'a', Datumodre_x0111_ivanjapritvora: '2024-01-01' }, ctx(0, null)).warnings.tok, /broj optuženih/);
  assert(!S.isVisible(S.fieldsOf('jemstva').find(f => f.name === 'Vrijednostprihva_x0107_enogjemst'), { Odlukasuda: 'Odbijeno' }));
});
test('pritvor kao tok događaja: faze iz datuma, stara polja, provjere, prevođenje starih unosa', () => {
  const c = { Datumpodizanjaoptu_x017e_nice: '2025-06-02' }, P1 = '2025-11-14';
  const tok = [{ datum: '2025-03-12', dogadjaj: 'zadrzavanje' }, { datum: '2025-03-13', dogadjaj: 'odredjen', osnov: ['Opasnost od bjekstva', 'Iteracijska opasnost'] },
    { datum: '2025-04-10', dogadjaj: 'produzen' }, { datum: '2025-06-05', dogadjaj: 'produzen', promijenjen: true, osnov: ['Iteracijska opasnost'] },
    { datum: '2025-11-14', dogadjaj: 'produzen' }, { datum: '2025-12-20', dogadjaj: 'nadzor' }];
  const o = S.tokUStaro(tok, c, P1);
  assert.strictEqual(o.Datumodre_x0111_ivanjapritvora, '2025-03-13'); assert.deepStrictEqual(o.osnovOptuzni, ['Iteracijska opasnost']);
  assert(o.produzenIstraga && o.nakonOptuznog && o.nakonPresude && o.Pritvorjezamijenjenmjeromnadzora); assert.strictEqual(o.Fazapostupkaukojojjepritvorukinu, 'Nakon presude');
  const pg = S.tokPregled(tok, c, P1); assert.deepStrictEqual([pg.istraga, pg.gp, pg.presuda, pg.ukupno, pg.produzenja], [81, 165, 36, 282, 3]);
  assert.deepStrictEqual(S.tokProvjera(tok, c).errors, []);
  assert(S.tokProvjera([{ datum: '2025-03-13', dogadjaj: 'produzen' }], c).error, 'produženje prije određivanja');
  assert(/redom/.test(S.tokProvjera([{ datum: '2025-03-13', dogadjaj: 'odredjen', osnov: ['x'] }, { datum: '2025-03-01', dogadjaj: 'produzen' }], c).error));
  assert(/pravosnažnosti/.test(S.tokProvjera([{ datum: '2026-03-13', dogadjaj: 'odredjen', osnov: ['x'] }], { ...c, Odlaganjero_x010d_i_x0161_ta: '2026-01-01' }).error));
  assert(/već određen/.test(S.tokProvjera([{ datum: '2025-03-13', dogadjaj: 'odredjen', osnov: ['x'] }, { datum: '2025-03-14', dogadjaj: 'odredjen', osnov: ['x'] }], c).error));
  assert(!S.tokProvjera([{ datum: '2025-03-13', dogadjaj: 'odredjen', osnov: ['x'] }, { datum: '2025-04-01', dogadjaj: 'ukinut' }, { datum: '2025-07-01', dogadjaj: 'odredjen', osnov: ['x'] }], c).error, 'ponovno određivanje nakon ukidanja');
  assert.match(S.validate('pritvori', { Predmet: 'a', tok: [{ datum: '2025-03-13', dogadjaj: 'produzen' }] }, { case: c }).errors.tok, /ne može produžiti/);
  const old = { zadrzavanje: true, zadrzavanjeDatum: '2025-03-12', Datumodre_x0111_ivanjapritvora: '2025-03-13', Osnovodre_x0111_ivanjapritvora: ['Opasnost od bjekstva'], produzenIstraga: true, produzenIstragaDatum: '2025-04-10',
    nakonOptuznog: true, nakonOptuznogDatum: '2025-06-05', osnovOptuzni: ['Iteracijska opasnost'], Datumukidanjapritvora: '2025-12-20', Pritvorjezamijenjenmjeromnadzora: true };
  const t2 = S.tokIzStarog(old); assert.deepStrictEqual(t2.map(e => e.dogadjaj), ['zadrzavanje', 'odredjen', 'produzen', 'produzen', 'nadzor']);
  const back = S.tokUStaro(t2, c, P1); for (const k of Object.keys(old)) assert.deepStrictEqual(back[k], old[k], k);
  const d = { predmeti: [{ _id: 'c', ...c, Pritvorskipredmet: true }], presuda1: [{ Predmet: 'c', Datumobjavljivanjapresude: P1 }], pritvori: [{ Predmet: 'c', tok }] };
  const r = ST.report('okk', d, {}); const ist = r.find(x => x.title === 'Trajanje pritvora u fazi istrage');
  assert.strictEqual(ist.rows[ist.rows.length - 1][4], '81 dana');
  assert.strictEqual(S.FORMS.pritvori.filter(f => !f.hidden && f.name).map(f => f.name)[1], 'tok');
});
test('validacija: završetak pretresa poslije posljednjeg ročišta', () => {
  const v = S.validate('presuda1', { Predmet: 'a', Datumzavr_x0161_etkaglavnogpretr: '2024-02-01' }, { lastAdjournedTo: '2024-03-01' });
  assert.match(v.errors.Datumzavr_x0161_etkaglavnogpretr, /01\.03\.2024/);
});

test('Firestore: kodiranje vrijednosti i polja forme', () => {
  const v = { a: 'x', b: 3, c: 2.5, d: true, e: null, f: ['p', 'q'], g: { h: 1 } };
  for (const [k, x] of Object.entries(v)) assert.deepStrictEqual(dec(enc(x)), x, k);
  assert.deepStrictEqual(enc(3), { integerValue: '3' });
  const loc = fromServer('pritvori', { Predmet: 'case-7', Okrivljeni_x002f_Optu_x017e_eni: 'A.B.', Datumodre_x0111_ivanjapritvora: '2024-01-10', _modifiedBy: 'x', nepoznato: 1 });
  assert.strictEqual(loc.Predmet, 'case-7'); assert.strictEqual(loc.Datumukidanjapritvora, null); assert.strictEqual(loc.Su_x0111_enjeuodsustvu, false);
  assert.deepStrictEqual(loc.Osnovodre_x0111_ivanjapritvora, []); assert(!('nepoznato' in loc) && !('_modifiedBy' in loc));
  const back = toServer('pritvori', { ...loc, Okrivljeni_x002f_Optu_x017e_eni: '' });
  assert.strictEqual(back.Okrivljeni_x002f_Optu_x017e_eni, null);
});
test('validacija: datumi i dani', () => {
  assert.strictEqual(S.days('2024-02-28', '2024-03-01'), 2);
  assert.strictEqual(S.days('2025-03-29', '2025-03-31'), 2, 'promjena vremena ne utiče na broj dana');
});

function sample() {
  const P = (id, f) => ({ _id: id, Ponovljenipostupak: false, ...f });
  const d = {
    predmeti: [
      P('A', { Title: 'Ks 1/23', Vrstapredmeta: 'Organizovani kriminal', Vrstaoptu_x017e_nogakta: 'Optužnica', Pritvorskipredmet: true, Podnosilac: 'SDT',
        Datumpodizanjaoptu_x017e_nice: '2023-01-01', Datumprijemaoptu_x017e_niceusud: '2023-01-03', Datumro_x010d_i_x0161_tazakontro: '2023-01-23', Datumrje_x0161_enjaopotvr_x0111_: '2023-01-30',
        Datumnaredbezaodr_x017e_avanjegl: '2023-02-10', Datumzakazivanjaprvogro_x010d_i_: '2023-03-01', Odlaganjero_x010d_i_x0161_ta: '2024-01-01',
        Brojodr_x017e_anihro_x010d_i_x01: 6, Brojodlo_x017e_enihro_x010d_i_x0: 4, Predlo_x017e_enojemstvo: true }),
      P('B', { Title: 'Ks 2/23', Vrstapredmeta: 'Visoka korupcija', Vrstaoptu_x017e_nogakta: 'Optužnica', Pritvorskipredmet: false,
        Datumpodizanjaoptu_x017e_nice: '2023-02-01', Datumprijemaoptu_x017e_niceusud: '2023-02-02', Datumro_x010d_i_x0161_tazakontro: '2023-02-12', Datumrje_x0161_enjaopotvr_x0111_: '2023-02-14',
        Odlaganjero_x010d_i_x0161_ta: '2023-12-01', Brojodr_x017e_anihro_x010d_i_x01: 3, Brojodlo_x017e_enihro_x010d_i_x0: 1 }),
      P('C', { Title: 'K 5/23', Vrstapredmeta: 'Visoka korupcija', Vrstaoptu_x017e_nogakta: 'Optužni predlog', Pritvorskipredmet: true,
        Datumprijemaoptu_x017e_niceusud: '2023-03-01', Datumnaredbezaodr_x017e_avanjegl: '2023-03-21', Datumzakazivanjaprvogro_x010d_i_: '2023-04-15' }),
      P('D', { Title: 'Ks 1/23-p', Ponovljenipostupak: true, Vrstapredmeta: 'Organizovani kriminal', Vrstaoptu_x017e_nogakta: 'Optužnica' }),
    ],
    odlaganja: [
      { _id: 'o1', Predmet: 'A', Odlo_x017e_enood: '2023-03-01', Odlo_x017e_enodo: '2023-03-31', _razlog: '102 Odsustvo branioca' },
      { _id: 'o2', Predmet: 'A', Odlo_x017e_enood: '2023-04-01', Odlo_x017e_enodo: '2023-04-11', _razlog: '101 Nedolazak optuženog' },
      { _id: 'o3', Predmet: 'B', Odlo_x017e_enood: '2023-05-01', Odlo_x017e_enodo: '2023-05-21', _razlog: '101 Nedolazak optuženog' },
    ],
    mjere: [
      { _id: 'm1', Predmet: 'A', U_x010d_esnik: 'Optuženi', Mjera: 'Novčana kazna', Nov_x010d_anakazna: 500 },
      { _id: 'm2', Predmet: 'B', U_x010d_esnik: 'Svjedok', Mjera: 'Prinudno dovođenje', Upravapolicijenijepostupilaponar: true },
    ],
    presuda1: [
      { _id: 'p1', Predmet: 'A', Datumzavr_x0161_etkaglavnogpretr: '2023-10-01', Datumobjavljivanjapresude: '2023-10-01', Datumdostavljanjapisanogotpravka: '2023-11-15', Datumdostavljanjapisanogotpravka1: '2023-10-20' },
      { _id: 'p2', Predmet: 'B', Datumzavr_x0161_etkaglavnogpretr: '2023-09-01', Datumobjavljivanjapresude: '2023-09-06', Datumdostavljanjapisanogotpravka: '2023-11-30' },
    ],
    zalba: [{ _id: 'z1', Predmet: 'A', Datumpodno_x0161_enja_x017e_albe: '2023-11-20', Datumdono_x0161_enjadrugostepene: '2023-12-20', Odlukaudrugostepenompostupku: 'Žalba se odbija' }],
    presuda2: [], ishod: [], komentari: [],
    pritvori: [
      { _id: 't1', Predmet: 'A', Okrivljeni_x002f_Optu_x017e_eni: 'Petar P.', Datumodre_x0111_ivanjapritvora: '2022-11-01', Osnovodre_x0111_ivanjapritvora: ['Opasnost od bjekstva'] },
      { _id: 't2', Predmet: 'A', Okrivljeni_x002f_Optu_x017e_eni: 'Marko M.', Datumodre_x0111_ivanjapritvora: '2022-12-01', Datumukidanjapritvora: '2022-12-21', Fazapostupkaukojojjepritvorukinu: 'Faza istrage',
        Osnovodre_x0111_ivanjapritvora: ['Koluziona opasnost', 'Opasnost od bjekstva'], Su_x0111_enjeuodsustvu: false },
      { _id: 't3', Predmet: 'C', Okrivljeni_x002f_Optu_x017e_eni: 'Ivan I.', Datumodre_x0111_ivanjapritvora: '2023-03-10', Datumukidanjapritvora: '2023-05-10', Su_x0111_enjeuodsustvu: true,
        Osnovodre_x0111_ivanjapritvora: ['Iteracijska opasnost', 'Koluziona opasnost'] },
    ],
    jemstva: [{ _id: 'j1', Predmet: 'A', Optu_x017e_eni: 'Marko M.', Vrijednostponu_x0111_enogjemstva: 50000, Odlukasuda: 'Prihvaćeno', Vrijednostprihva_x0107_enogjemst: 40000 }],
  };
  return d;
}
test('statistika: osnovni podaci', () => {
  const b = ST.compute('osnovni', sample());
  assert.strictEqual(cell(b, 'Osnovni', 'Broj predmeta u kojima je izvršen uvid')[1], 3, 'stari zapis označen kao ponovljeni se ne broji dvaput');
  const d2 = sample(); d2.faze = [{ _id: 'f1', Predmet: 'A', faza: 2, brojPredmeta: 'K 9/24' }]; d2.presuda1.push({ _id: 'pp', Predmet: 'A', faza: 2, Datumobjavljivanjapresude: '2024-06-01' });
  const b2 = ST.compute('osnovni', d2);
  assert.strictEqual(cell(b2, 'Osnovni', 'Broj predmeta vraćenih na ponovno suđenje')[1], 1);
  assert.strictEqual(cell(b2, 'Osnovni', 'Ukupan broj ponovljenih suđenja')[1], 1);
  assert.strictEqual(cell(b, 'Osnovni', 'Broj optužnica')[1], 2);
  assert.strictEqual(cell(b, 'Osnovni', 'Prosječno trajanje svih predmeta')[1], '334 dana');
  assert.strictEqual(cell(b, 'Osnovni', 'Prosječno trajanje pritvorskih predmeta')[1], '365 dana');
});
test('statistika: optužnica i rok od 15 dana', () => {
  const b = ST.compute('optuznica', sample());
  assert.strictEqual(cell(b, 'Rokovi', 'Prosječan broj dana od dana prijema optužnice u sud do dana održavanja ročišta za kontrolu optužnice')[1], '15 dana');
  assert.strictEqual(cell(b, 'Rok od 15', 'Broj predmeta u kojima je rok od 15 dana od dana prijema optužnice u sud do ročišta za kontrolu optužnice probijen')[1], 1);
  assert.strictEqual(cell(b, 'Rok od 15', 'Broj pritvorskih predmeta u kojima je taj rok probijen, a pritvor je određen prije podizanja optužnice')[1], 1);
  const m = cell(b, 'Broj predmeta prema vrsti', 'Ukupno'); assert.deepStrictEqual(m.slice(1), [2, 1, 1, 1]);
  assert.strictEqual(cell(b, 'Broj dana od dana podizanja', 'Ks 1/23')[1], '2 dana');
});
test('statistika: optužni predlog', () => {
  const b = ST.compute('predlog', sample());
  assert.deepStrictEqual(b[0].rows[0], [1, 1, 0]);
  assert.deepStrictEqual(b[1].rows[0], ['20 dana', '20 dana', '-']);
});
test('statistika: odlaganja i razlozi (sortirano po šifri)', () => {
  const b = ST.compute('odlaganja', sample(), 'A');
  assert.strictEqual(cell(b, 'Prosječno trajanje odlaganja', 'Svi predmeti')[1], '20 dana');
  assert.strictEqual(cell(b, 'Prosječno trajanje odlaganja', 'Svi pritvorski predmeti')[1], '20 dana');
  assert.deepStrictEqual(cell(b, 'Održana i odložena', 'Svi predmeti'), ['Svi predmeti', 9, '64.29%', 5, '35.71%']);
  const r = b.find(x => x.title === 'Razlozi odlaganja – svi predmeti');
  assert.deepStrictEqual(r.rows.map(x => x[0]), ['101 Nedolazak optuženog', '102 Odsustvo branioca', 'Ukupno']);
  assert.deepStrictEqual(r.rows[0], ['101 Nedolazak optuženog', 2, '66.67%', '30 dana', '15 dana']);
  assert(b.some(x => x.perCase && x.title.includes('Ks 1/23')));
});
test('statistika: mjere procesne discipline', () => {
  const b = ST.compute('mjere', sample());
  assert.strictEqual(cell(b, 'Novčane kazne i prinudno dovođenje – analizirani', 'Iznos izrečenih novčanih kazni')[1], '€ 500');
  assert.strictEqual(cell(b, 'Novčane kazne i prinudno dovođenje – analizirani', 'Broj slučajeva u kojima Uprava policije nije postupila po naredbi za dovođenje')[1], 1);
  assert.strictEqual(cell(b, 'Novčane kazne i prinudno dovođenje – pritvorski', 'Broj slučajeva u kojima Uprava policije nije postupila po naredbi za dovođenje')[1], 0);
});
test('statistika: presude i dostavljanje', () => {
  const b = ST.compute('presuda1', sample());
  assert.strictEqual(cell(b, 'Prvostepeni postupak – svi', 'Broj predmeta u kojima je presuda objavljena istog dana kada je završen glavni pretres')[1], 1);
  assert.strictEqual(cell(b, 'Prvostepeni postupak – svi', 'Broj predmeta u kojima je presuda objavljena nakon više od tri dana od završetka glavnog pretresa')[1], 1);
  assert.strictEqual(cell(b, 'Prvostepeni postupak – svi', 'Prosječan broj dana potreban za objavljivanje presude nakon završetka glavnog pretresa')[1], '2.5 dana');
  assert.deepStrictEqual(cell(b, 'Dostavljanje', 'Optuženi'), ['Optuženi', 0, 1, 1]);
});
test('statistika: drugostepeni postupak i pritvor tokom žalbe', () => {
  const b = ST.compute('zalba', sample());
  assert.strictEqual(cell(b, 'Drugostepeni', 'Broj drugostepenih postupaka u predmetima u kojima je pritvor trajao u vrijeme podnošenja žalbe')[1], 1);
  assert.strictEqual(cell(b, 'Drugostepeni', 'Prosječno trajanje drugostepenih postupaka u analiziranim predmetima')[1], '30 dana');
  const t = b.find(x => x.title.startsWith('Predmeti u kojima je pritvor trajao'));
  assert.deepStrictEqual(t.rows[0], ['Ks 1/23', 'Žalba se odbija', '414 dana']);
});
test('statistika: pritvor (trajanje, osnovi, istraga, nakon presude)', () => {
  const b = ST.compute('pritvor', sample());
  assert.strictEqual(cell(b, 'Prosječno trajanje pritvora', 'Prosječno trajanje pritvora')[1], '169 dana');
  assert.strictEqual(cell(b, 'Prosječno trajanje pritvora', 'Prosječno trajanje pritvora bez lica kojima se sudi u odsustvu')[1], '223 dana');
  const os = b.find(x => x.title.startsWith('Pritvorski osnovi'));
  assert(os.title.includes('2)'));
  assert.deepStrictEqual(os.rows.find(r => r[0] === 'Opasnost od bjekstva'), ['Opasnost od bjekstva', 1, '33.33%']);
  assert.deepStrictEqual(os.rows.find(r => r[0].startsWith('Više')), ['Više pritvorskih osnova istovremeno', 2, '66.67%']);
  const combo = b.find(x => x.title.startsWith('Pregled pritvora prema kombinacijama'));
  assert.strictEqual(combo.rows[0][0], 'Iteracijska opasnost + Koluziona opasnost');
  assert.strictEqual(cell(b, 'Pritvor u fazi istrage', 'Br. analiziranih predmeta u kojima je određen pritvor u fazi istrage')[1], 1);
  assert.strictEqual(cell(b, 'Pritvor u fazi istrage', 'Br. analiziranih predmeta u kojima je ukinut pritvor u fazi istrage')[1], 1);
  assert.strictEqual(cell(b, 'Pritvor u fazi istrage', 'Prosječno trajanje pritvora u istrazi')[1], '40.5 dana');
  assert.deepStrictEqual(cell(b, 'Dužina trajanja pritvora u fazi istrage', 'Svi predmeti').slice(1), [0, 0, 1, 1]);
  assert.deepStrictEqual(cell(b, 'Dužina trajanja pritvora u fazi glavnog pretresa', 'Svi predmeti').slice(1), [0, 0, 0, 1, 1]);
  assert.deepStrictEqual(cell(b, 'Pritvor nakon izricanja presude', 'Pritvor trajao do pravosnažnosti presude'), ['Pritvor trajao do pravosnažnosti presude', 1, 1]);
  assert.strictEqual(cell(b, 'Prosječno trajanje pritvora nakon izricanja presude', 'Prosječno trajanje pritvora nakon izricanja presude')[1], '92 dana');
  assert.strictEqual(cell(b, 'Optuženi kojima je pritvor trajao nakon presude', 'Petar P.')[1], 'Ks 1/23');
});
test('statistika: jemstvo (prava statistika umjesto kopije žalbi)', () => {
  const b = ST.compute('jemstvo', sample());
  assert.strictEqual(cell(b, 'Jemstvo – pregled', 'Broj unesenih jemstava')[1], 1);
  assert.strictEqual(cell(b, 'Jemstvo – pregled', 'Ukupna vrijednost prihvaćenih jemstava')[1], '€ 40.000');
  assert.deepStrictEqual(cell(b, 'Odluke suda', 'Prihvaćeno'), ['Prihvaćeno', 1, '100%']);
});
test('statistika: prazna baza ne puca', () => {
  const empty = Object.fromEntries(S.LISTS.map(l => [l.key, []]));
  for (const t of ST.TOPICS) ST.compute(t.key, empty, 'nema');
});

const IMPORT_DIR = process.env.TM_IMPORT_DIR || path.join(__dirname, 'podaci', 'sharepoint');
const haveCsv = fs.existsSync(IMPORT_DIR);
test('uvoz: CSV parser (navodnici, novi redovi, BOM)', () => {
  const { head, rows } = Importer.parseCsv('﻿"A","B"\r\n"x, y","red 1\nred 2"\r\n,"""citat"""\r\n');
  assert.deepStrictEqual(head, ['A', 'B']); assert.strictEqual(rows[0].A, 'x, y'); assert.strictEqual(rows[0].B, 'red 1\nred 2'); assert.strictEqual(rows[1].B, '"citat"');
  assert.strictEqual(Importer.toDate('3/22/2021'), '2021-03-22'); assert.strictEqual(Importer.toDate('22.03.2021.'), '2021-03-22');
  assert.strictEqual(Importer.toNumber('1,000'), 1000); assert.strictEqual(Importer.toNumber('712.21'), 712.21);
  assert.deepStrictEqual(Importer.toMulti('["Opasnost od bjekstva","Iteracijska opasnost"]'), ['Opasnost od bjekstva', 'Iteracijska opasnost']);
});
if (haveCsv) test('uvoz: stvarni izvoz iz SharePointa', () => {
  const files = fs.readdirSync(IMPORT_DIR).map(f => path.join(IMPORT_DIR, f));
  const { recs, choices, report } = Importer.readExport(files);
  global.__IMPORT = { recs, choices, report };
  assert.strictEqual(report.unknownFiles.length, 0, report.unknownFiles.join());
  assert.deepStrictEqual(report.missingLists, []);
  assert.strictEqual(report.counts.predmeti, 40);
  assert.strictEqual(report.counts.faze, 10, 'ponovljeni postupci spojeni sa izvornim predmetom');
  assert.strictEqual(report.counts.odlaganja, 195);
  assert.strictEqual(report.counts.mjere, 87);
  assert.strictEqual(report.counts.pritvori, 44);
  const c = recs.predmeti.find(r => r.fields.Title === 'Ks 15/21').fields;
  assert.strictEqual(c.Datumpodizanjaoptu_x017e_nice, '2021-03-22'); assert.strictEqual(c.Brojodlo_x017e_enihro_x010d_i_x0, 14); assert.strictEqual(c.Pritvorskipredmet, true);
  assert.strictEqual(c.Odlaganjero_x010d_i_x0161_ta, '2025-10-15');
  assert(recs.predmeti.some(r => r.fields.Title === 'Ks 33/19'), '„n Ks 33/19 ” → „Ks 33/19” (bez „n” i razmaka)');
  const t = recs.pritvori.find(r => r.fields.Okrivljeni_x002f_Optu_x017e_eni === 'Crnković N. ' || r.fields.Okrivljeni_x002f_Optu_x017e_eni === 'Crnković N.').fields;
  assert.deepStrictEqual(t.Osnovodre_x0111_ivanjapritvora, ['Opasnost od bjekstva', 'Iteracijska opasnost']);
  assert.strictEqual(recs.mjere.filter(m => m.fields.Nov_x010d_anakazna === 1000).length, 3);
  assert.strictEqual(choices['odlaganja.Razlogodlaganja'].length, 40);
  assert.strictEqual(choices['mjere.Mjera'][0], 'Opomena');
  assert(choices['predmeti.Podnosilac'].includes('Oštećeni kao tužilac'));
  assert(report.skipped.some(x => x.startsWith('Ishod postupka')) && report.skipped.some(x => x.startsWith('Komentari')));
  assert(report.warnings.some(x => x.includes('Ks 14/17') && x.includes('ukinut prije')), 'nelogičan datum pritvora prijavljen');
});
if (haveCsv) test('uvoz: statistika nad stvarnim podacima radi i daje smislene brojeve', () => {
  const { recs } = global.__IMPORT;
  const d = {}; for (const [k, v] of Object.entries(recs)) d[k] = v.map(r => ({ _id: r.id, ...r.fields }));
  for (const o of d.odlaganja) o._razlog = o.Razlogodlaganja;
  for (const t of ST.TOPICS) ST.compute(t.key, d, d.predmeti[0]._id);
  const b = ST.compute('osnovni', d);
  assert.strictEqual(cell(b, 'Osnovni', 'Broj predmeta u kojima je izvršen uvid')[1], 40);
  assert.strictEqual(cell(b, 'Osnovni', 'Broj predmeta vraćenih na ponovno suđenje')[1], 10);
  const tok = ST.compute('tok', d, d.predmeti.find(c => c.Title === 'Ks 28/21')._id);
  assert.deepStrictEqual(tok[2].rows.map(r => r[3]), ['691 dana', '253 dana', '50 dana', '168 dana', '1162 dana'], 'tok postupka: prvo suđenje → drugostepeni → ponovljeno → drugostepeni');
  assert.strictEqual(tok[0].rows.find(r => r[0] === 'Prvostepeni postupak – ponovljeno suđenje 1')[1], 8);
  const r = ST.compute('odlaganja', d).find(x => x.title === 'Razlozi odlaganja – svi predmeti');
  assert.strictEqual(r.rows[r.rows.length - 1][1], 195);
  assert.strictEqual(r.rows[0][0].slice(0, 3), '101', 'sortirano po šifri');
});

if (haveCsv) test('tabele za izvještaj (OKK) – brojevi i period', () => {
  const { recs } = global.__IMPORT; const d = {};
  for (const [k, v] of Object.entries(recs)) if (!/^(svi|svir|vaw|roc)_/.test(k)) d[k] = v.map(x => ({ _id: x.id, ...x.fields }));
  const t = ST.report('okk', d, {});
  assert.strictEqual(t.length, 27); assert.strictEqual(t[2].no, 3);
  assert.deepStrictEqual(t[2].rows.find(r => r[0] === 'Neuredna dostava okrivljenom'), ['Neuredna dostava okrivljenom', 11, '5,64%', '570', '51,82'], 'OKK, Tabela 3 (kao u izvještaju: 11, 570, 51,82)');
  assert.strictEqual(t[2].rows[t[2].rows.length - 1][1], 195);
  assert.deepStrictEqual(t[14].rows.find(r => r[0].startsWith('Iteracijska opasnost + Koluziona')), ['Iteracijska opasnost + Koluziona opasnost + Opasnost od bjekstva', 14], 'OKK, Tabela 15');
  const p = ST.report('okk', d, { od: '2024-01-01', do: '2025-12-31' });
  const n = p[2].rows.length ? p[2].rows[p[2].rows.length - 1][1] : 0;
  assert(n > 0 && n < 195, 'period sužava odlaganja');
  const inP = d.odlaganja.filter(o => o.Odlo_x017e_enood >= '2024-01-01' && o.Odlo_x017e_enood <= '2025-12-31').length;
  assert(n <= inP, 'samo odlaganja iz perioda');
  assert(!/\b(19|20)\d{2}\b/.test(t.map(x => x.title).join(' ')), 'bez godina i datuma u naslovima tabela');
});
test('tabele za izvještaj – filtriranje po periodu (sintetički podaci)', () => {
  const d = { predmeti: [
    { _id: 'a', sud: 'Osnovni sud Bar', Vrstaoptu_x017e_nogakta: 'Optužni predlog', Datumprijemaoptu_x017e_niceusud: '2023-01-10', Odlaganjero_x010d_i_x0161_ta: '2023-12-01', Datumnaredbezaodr_x017e_avanjegl: '2023-03-01' },
    { _id: 'b', sud: 'Osnovni sud Bar', Vrstaoptu_x017e_nogakta: 'Optužni predlog', Datumprijemaoptu_x017e_niceusud: '2024-02-01', Datumnaredbezaodr_x017e_avanjegl: '2024-02-20' },
    { _id: 'c', sud: 'Viši sud Podgorica', Vrstaoptu_x017e_nogakta: 'Optužnica', Datumprijemaoptu_x017e_niceusud: '2026-02-01' }],
    odlaganja: [{ Predmet: 'b', Odlo_x017e_enood: '2024-03-01', Odlo_x017e_enodo: '2024-03-11', Razlogodlaganja: '401 - Odsustvo sudije' }, { Predmet: 'b', Odlo_x017e_enood: '2025-03-01', Odlo_x017e_enodo: '2025-03-21', Razlogodlaganja: '401 - Odsustvo sudije' }] };
  const all = ST.report('svi', d, {}), y24 = ST.report('svi', d, { od: '2024-01-01', do: '2024-12-31' });
  const svi = t => t.rows.find(r => r[0] === 'SVI SUDOVI');
  assert.strictEqual(svi(all[0])[1], 3); assert.strictEqual(svi(y24[0])[1], 1, '2024: samo predmet b (a je okončan 2023, c primljen 2026)');
  assert.strictEqual(svi(y24[10])[1], '10', 'prosječno trajanje odlaganja samo iz 2024');
  assert.strictEqual(svi(all[10])[1], '15');
  assert.deepStrictEqual(svi(y24[6]).slice(1), [1, '100%', 0, '0%']);
  assert.strictEqual(all[0].rows.length, 19, '16 sudova + 3 zbirna reda');
});

const AS_DIR = process.env.TM_APPSHEET_DIR || path.join(__dirname, 'podaci', 'appsheet');
const AS = [path.join(AS_DIR, 'form_uvid.xlsx'), path.join(AS_DIR, 'form_rocista.xlsx')];
if (fs.existsSync(AS[0])) test('AppSheet uvoz: brojevi se poklapaju sa izvještajima', async () => {
  const { readAppSheet } = require('../src/main/appsheet.js');
  const { recs, report } = await readAppSheet(AS);
  assert.strictEqual(recs.svi_predmeti.length, 466, 'Svi sudovi, Tabela 1: 466 predmeta');
  assert.strictEqual((recs.svi_faze || []).length, 12, 'ponovljena suđenja u AppSheet-u postala faze predmeta');
  const bar = recs.svi_predmeti.filter(r => r.fields.sud === 'Osnovni sud Bar').length; assert.strictEqual(bar, 31);
  assert.strictEqual(recs.vaw_predmeti.length, 155);
  const pack = pfx => { const o = {}; for (const [k, v] of Object.entries(recs)) if (k.startsWith(pfx)) o[S.baseKey(k)] = v.map(r => ({ _id: r.id, ...r.fields })); return o; };
  const vaw = ST.compute('vaw', pack('vaw_'), null, 'vaw');
  const san = vaw.find(b => b.title === 'Izrečene sankcije po vrsti');
  assert.deepStrictEqual(san.rows.find(r => r[0] === 'Kazna zatvora'), ['Kazna zatvora', 78, '50.32%'], 'Nasilje, Tabela 10');
  { const d = {}; for (const [k, v] of Object.entries(recs)) if (k.startsWith('svi_')) d[k.slice(4)] = v.map(x => ({ _id: x.id, ...x.fields }));
    const comb = ST.compute('pritvor', d, null, 'svi').find(b => b.title.startsWith('Struktura i učestalost određivanja pritvora po više'));
    assert.strictEqual(comb.rows[comb.rows.length - 1][1], 54, 'Svi sudovi, Tabela 30: kombinacije osnova');
    assert(ST.compute('nadzor', d, null, 'svi').some(b => b.title === 'Jemstvo'), 'Svi sudovi: tema mjere nadzora i jemstvo'); }
  const vp = recs.vaw_predmeti.map(x => x.fields);
  assert(vp.some(f => f.zatvorGodina === 1 && f.zatvorMjeseci === 6 && f.zatvorDana === 0), '"1 god. i 6 mjeseci" → 1 / 6 / 0');
  assert(vp.some(f => f.zatvorMjeseci === 4 && f.zatvorDana === 0) && !vp.some(f => f.zatvorDana > 31), '"120 dana" → 4 mjeseca');
  assert.deepStrictEqual(san.rows.find(r => /prostorijama/.test(r[0])).slice(1), [13, '8.39%']);
  const svi = pack('svi_'); svi.roc = pack('svir_');
  for (const t of ST.MODULE_TOPICS.svi) ST.compute(t.key, svi, null, 'svi');
  { const rt = ST.report('svi', svi, {}); assert.strictEqual(rt.length, 39);
    const T = (no, lbl) => rt[no - 1].rows.find(r => r[0] === lbl);
    assert.strictEqual(T(1, 'SVI SUDOVI')[1], 466, 'Tabela 1'); assert.deepStrictEqual(T(12, 'UKUPNO').slice(1, 3), [521, '100%'], 'Tabela 12: 521 odloženo ročište');
    assert.deepStrictEqual(T(12, 'Odsustvo optuženog').slice(1, 3), [170, '32,63%']); assert.deepStrictEqual(T(13, 'SVI SUDOVI').slice(1), [47, 101], 'Tabela 13');
    assert.deepStrictEqual(T(31, 'UKUPNO').slice(1, 3), [83, 66], 'Tabela 31');
    const vr = ST.report('vaw', pack('vaw_'), {}); assert.strictEqual(vr.length, 18);
    assert.deepStrictEqual(vr[9].rows.find(r => r[0] === 'Kazna zatvora'), ['Kazna zatvora', 78, '50,32%'], 'Nasilje, Tabela 10'); }
  const z = ST.compute('zalba', svi, null, 'svi')[0];
  assert.strictEqual(z.rows.find(r => r[0] === 'Broj odbijenih žalbi')[1], 106);
  assert(z.columns.includes('Osnovni sudovi') && z.columns.includes('Viši sudovi'));
  assert(recs.svi_odlaganja.length > 500);
  assert.strictEqual(recs.svir_rocista.length, 157);
  assert(report.skipped.every(x => x.startsWith('form_pritvor')), 'preskaču se samo lica bez predmeta u uvidu');
});

function fakeFirebase() {
  const docs = new Map(); let tick = 0; let online = true;
  const now = () => new Date(Date.UTC(2026, 0, 1) + (++tick) * 1000).toISOString();
  const users = { 'admin@x.me': { pw: 'tajna1', verified: true }, 'ana@x.me': { pw: 'tajna2', verified: true }, 'novi@x.me': { pw: 'tajna3', verified: false } };
  const tokEmail = t => t && t.startsWith('tok:') ? t.slice(4) : null;
  const json = (status, body) => ({ ok: status < 400, status, statusText: String(status), json: async () => body });
  const err = (status, st, msg) => json(status, { error: { status: st, message: msg || st } });
  const role = e => { const u = docs.get('users/' + e); return u ? (u.data.role || 'monitor') : null; };
  const ROOT = 'projects/p1/databases/(default)/documents/';
  const asDoc = (k, d) => ({ name: ROOT + k, updateTime: d.updateTime, fields: Object.fromEntries(Object.entries(d.data).map(([a, b]) => [a, enc(b)])) });
  global.fetch = async (url, opt = {}) => {
    if (!online) throw new TypeError('fetch failed');
    const u = new URL(url); const body = opt.body ? JSON.parse(opt.body) : null;
    if (u.host === 'identitytoolkit.googleapis.com') {
      const m = u.pathname.split(':')[1];
      if (m === 'signInWithPassword') { const x = users[body.email]; if (!x || x.pw !== body.password) return err(400, 'x', 'INVALID_LOGIN_CREDENTIALS'); return json(200, { idToken: 'tok:' + body.email, refreshToken: 'r:' + body.email, localId: 'uid-' + body.email, expiresIn: '3600' }); }
      if (m === 'lookup') { const e = tokEmail(body.idToken); return json(200, { users: [{ email: e, emailVerified: users[e].verified }] }); }
      if (m === 'signUp') { if (users[body.email]) return err(400, 'x', 'EMAIL_EXISTS'); users[body.email] = { pw: body.password, verified: false }; return json(200, { idToken: 'tok:' + body.email }); }
      if (m === 'sendOobCode') return json(200, {});
    }
    if (u.host === 'securetoken.googleapis.com') return json(200, { id_token: 'tok:' + body.refresh_token.slice(2), expires_in: '3600' });
    const email = tokEmail((opt.headers || {}).Authorization && opt.headers.Authorization.slice(7));
    const verified = email && users[email].verified, isUser = verified && !!role(email), isAdmin = isUser && role(email) === 'admin';
    const p = decodeURIComponent(u.pathname).replace('/v1/projects/p1/databases/(default)/documents', '');
    const LISTS = { includes: c => S.LISTS.some(l => l.key === c) || /^x_[a-z0-9_]{1,48}$/.test(c) };
    const canRead = (col, id) => LISTS.includes(col) ? isUser : col === 'users' ? isUser || (verified && id === email) : col === 'meta' ? isUser : false;
    if (p === ':commit') {
      const res = [];
      const staged = new Map(docs);
      for (const w of body.writes) {
        if (w.delete) { const k = w.delete.replace(ROOT, ''); if (!isAdmin) return err(403, 'PERMISSION_DENIED'); staged.delete(k); res.push({}); continue; }
        const k = w.update.name.replace(ROOT, ''); const [col, id] = k.split('/'); const cur = staged.get(k);
        const data = Object.fromEntries(Object.entries(w.update.fields).map(([a, b]) => [a, dec(b)]));
        const pre = w.currentDocument || {};
        if (pre.exists === false && cur) return err(400, 'FAILED_PRECONDITION');
        if (pre.updateTime && (!cur || cur.updateTime !== pre.updateTime)) return err(400, 'FAILED_PRECONDITION');
        let ok;
        const after = w.updateMask && cur ? { ...cur.data, ...data } : data, own = d => (d && d._owner) || '';
        if (LISTS.includes(col)) ok = isUser && (cur ? own(after) === own(cur.data) && (after._deleted !== true || isAdmin || own(cur.data) === email) && (cur.data._deleted !== true || isAdmin)
          : after._deleted !== true && (!own(after) || own(after) === email));
        else if (col === 'users') ok = isAdmin || (verified && id === email && data.role === 'admin' && !docs.has('meta/bootstrap') && body.writes.some(x => x.update && x.update.name.endsWith('meta/bootstrap')));
        else if (col === 'meta') ok = isAdmin || (id === 'bootstrap' && verified && data.by === email);
        if (!ok) return err(403, 'PERMISSION_DENIED');
        const t = now();
        const merged = w.updateMask && cur ? { ...cur.data, ...data } : data;
        for (const tr of w.updateTransforms || []) merged[tr.fieldPath] = t;
        if (w.updateMask && cur && cur.data._createdAt) merged._createdAt = cur.data._createdAt;
        staged.set(k, { data: merged, updateTime: t }); res.push({ updateTime: t });
      }
      for (const [k, v] of staged) docs.set(k, v); for (const k of [...docs.keys()]) if (!staged.has(k)) docs.delete(k);
      return json(200, { writeResults: res });
    }
    if (p === ':runQuery') {
      const col = body.structuredQuery.from[0].collectionId; if (!canRead(col)) return err(403, 'PERMISSION_DENIED');
      const ts = body.structuredQuery.where.fieldFilter.value.timestampValue;
      return json(200, [...docs].filter(([k, d]) => k.startsWith(col + '/') && d.data._modifiedAt > ts).sort((a, b) => a[1].data._modifiedAt.localeCompare(b[1].data._modifiedAt)).map(([k, d]) => ({ document: asDoc(k, d) })));
    }
    const parts = p.split('/').filter(Boolean);
    if (!canRead(parts[0], parts[1])) return err(403, 'PERMISSION_DENIED');
    if (parts.length === 1) return json(200, { documents: [...docs].filter(([k]) => k.startsWith(parts[0] + '/')).map(([k, d]) => asDoc(k, d)) });
    const d = docs.get(parts.join('/')); return d ? json(200, asDoc(parts.join('/'), d)) : err(404, 'NOT_FOUND');
  };
  return { docs, setOnline: v => { online = v; }, verify: e => { users[e].verified = true; } };
}
async function newClient(dir, name, email, pw) {
  const store = await Store.open(path.join(dir, name + '.sqlite'));
  const cfg = { projectId: 'p1', apiKey: 'AIzaTEST' };
  const auth = new Auth(cfg, path.join(dir, name + '.session'));
  const fsdb = new Firestore(cfg, auth);
  const me = () => { const u = auth.user(); if (!u) return null; const p = store.get('profile:' + u.email); return { email: u.email, name: (p && p.name) || u.email }; };
  const sync = new Sync({ store, fs: fsdb, me });
  return { store, auth, fsdb, sync, login: () => auth.login(email, pw) };
}
test('Firebase: prijava, prvi administrator, odobravanje korisnika', async () => {
  const fb = fakeFirebase(); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-'));
  const adm = await newClient(dir, 'adm', 'admin@x.me', 'tajna1');
  await assert.rejects(adm.auth.login('admin@x.me', 'pogresna'), /Pogrešan e-mail ili lozinka/);
  await adm.login();
  assert.strictEqual(await adm.sync.claimAdmin('admin@x.me', 'Admin'), true);
  assert.strictEqual(await adm.sync.claimAdmin('admin@x.me', 'Admin'), false, 'samo prvi put');
  await adm.sync.refreshMeta(); assert.strictEqual(adm.store.get('profile:admin@x.me').role, 'admin');
  const ana = await newClient(dir, 'ana', 'ana@x.me', 'tajna2'); await ana.login();
  assert.strictEqual(await ana.sync.claimAdmin('ana@x.me', 'Ana'), false, 'drugi korisnik ne može postati administrator');
  let s = await ana.sync.run(); assert.strictEqual(s.state, 'noaccess'); assert.strictEqual(ana.store.get('profile:ana@x.me'), null);
  await assert.rejects(ana.fsdb.get('meta', 'choices'), /odbio pristup/, 'neodobren ne vidi ni podešavanja');
  await assert.rejects(ana.fsdb.list('predmeti'), /odbio pristup/);
  const novi = await newClient(dir, 'novi', 'novi@x.me', 'tajna3');
  await assert.rejects(novi.login(), /nije potvrđena/);
  await adm.sync.setUser('ana@x.me', 'Ana Monitor', 'monitor');
  assert.deepStrictEqual((await adm.sync.listUsers()).map(u => u.email), ['admin@x.me', 'ana@x.me']);
  s = await ana.sync.run(); assert.strictEqual(s.state, 'ok', s.error);
  assert.strictEqual(ana.store.get('profile:ana@x.me').name, 'Ana Monitor');
  await assert.rejects(ana.sync.setUser('zloupotreba@x.me', 'X', 'admin'), /odbio pristup/);
  const ana2 = await newClient(dir, 'ana', 'ana@x.me', 'tajna2');
  assert.strictEqual(ana2.auth.user().email, 'ana@x.me'); assert.strictEqual((await ana2.sync.run()).state, 'ok');
  global.__FB = { fb, dir, adm, ana };
});
test('Firebase: rad van mreže, uvoz u paketima, drugi korisnik, konflikt, brisanje', async () => {
  const { fb, adm, ana } = global.__FB;
  const imp = global.__IMPORT || { recs: { ...Object.fromEntries(S.LISTS.map(l => [l.key, []])), predmeti: [{ id: 'c1', fields: { Title: 'Ks 1/26' } }] }, choices: {} };
  adm.store.batch(() => { for (const l of S.LISTS) for (const r of imp.recs[l.key] || []) adm.store.saveLocal(l.key, r.id, r.fields, 'Admin', { createdBy: 'Uvoz iz SharePointa' }); });
  await adm.sync.setChoices(imp.choices);
  let s = await adm.sync.run(); assert.strictEqual(s.state, 'ok', s.error); assert.strictEqual(s.pending, 0);
  const total = S.LISTS.reduce((a, l) => a + (imp.recs[l.key] || []).length, 0);
  assert.strictEqual([...fb.docs.keys()].filter(k => !k.startsWith('users/') && !k.startsWith('meta/')).length, total);
  s = await ana.sync.run(); assert.strictEqual(s.state, 'ok');
  assert.strictEqual(ana.store.count(), total);
  fb.setOnline(false);
  const c = ana.store.saveLocal('predmeti', null, { Title: 'Ks 99/26', Pritvorskipredmet: true }, 'Ana Monitor');
  const t = ana.store.saveLocal('pritvori', null, { Predmet: c.id, Okrivljeni_x002f_Optu_x017e_eni: 'X', Datumodre_x0111_ivanjapritvora: '2026-02-01', Osnovodre_x0111_ivanjapritvora: ['Koluziona opasnost'] }, 'Ana Monitor');
  s = await ana.sync.run(); assert.strictEqual(s.state, 'offline'); assert.strictEqual(s.pending, 2);
  fb.setOnline(true);
  s = await ana.sync.run(); assert.strictEqual(s.state, 'ok', s.error); assert.strictEqual(s.pending, 0);
  assert.strictEqual(fb.docs.get('pritvori/' + t.id).data.Predmet, c.id, 'veza na predmet ostaje ista');
  assert.strictEqual(fb.docs.get('pritvori/' + t.id).data._createdBy, 'Ana Monitor');
  await adm.sync.run();
  assert.deepStrictEqual(adm.store.byId(t.id).fields.Osnovodre_x0111_ivanjapritvora, ['Koluziona opasnost']);
  adm.store.saveLocal('pritvori', t.id, { ...adm.store.byId(t.id).fields, Okrivljeni_x002f_Optu_x017e_eni: 'X (admin)' }, 'Admin');
  await adm.sync.run();
  ana.store.saveLocal('pritvori', t.id, { ...ana.store.byId(t.id).fields, Okrivljeni_x002f_Optu_x017e_eni: 'X (Ana)' }, 'Ana Monitor');
  s = await ana.sync.run(); assert.strictEqual(s.conflicts, 1);
  assert.strictEqual(fb.docs.get('pritvori/' + t.id).data.Okrivljeni_x002f_Optu_x017e_eni, 'X (admin)', 'serverska verzija nije pregažena');
  const conf = ana.store.conflicts()[0]; assert.strictEqual(conf.conflict.serverFields.Okrivljeni_x002f_Optu_x017e_eni, 'X (admin)');
  ana.sync.resolve(conf.id, 'mine'); s = await ana.sync.run(); assert.strictEqual(s.conflicts, 0); assert.strictEqual(s.pending, 0);
  assert.strictEqual(fb.docs.get('pritvori/' + t.id).data.Okrivljeni_x002f_Optu_x017e_eni, 'X (Ana)');
  assert.strictEqual(fb.docs.get('pritvori/' + t.id).data._createdBy, 'Ana Monitor', 'autor ostaje sačuvan');
  assert.strictEqual(fb.docs.get('pritvori/' + t.id).data._owner, 'ana@x.me');
  await adm.sync.run(); assert.strictEqual(adm.store.byId(t.id).owner, 'ana@x.me');
  const tudji = ana.store.records('predmeti').find(r => r.id !== c.id);
  ana.store.markDeleted(tudji.id); s = await ana.sync.run(); assert.strictEqual(s.state, 'error');
  assert.notStrictEqual(fb.docs.get('predmeti/' + tudji.id).data._deleted, true);
  ana.store.update(tudji.id, { deleted: false, dirty: false }); ana.store.set('lastFull', null);
  await assert.rejects(ana.fsdb.commit([{ col: 'predmeti', id: 'lazni', data: { Title: 'X', _owner: 'admin@x.me' }, mustNotExist: true, create: true }]), /odbio pristup/);
  const svoj = ana.store.saveLocal('odlaganja', null, { Predmet: c.id }, 'Ana Monitor', { owner: 'ana@x.me' });
  await ana.sync.run(); ana.store.markDeleted(svoj.id);
  s = await ana.sync.run(); assert.strictEqual(s.state, 'ok', s.error);
  assert.strictEqual(fb.docs.get('odlaganja/' + svoj.id).data._deleted, true);
  await adm.sync.run();
  adm.store.markDeleted(t.id); adm.store.markDeleted(c.id);
  s = await adm.sync.run(); assert.strictEqual(s.state, 'ok', s.error);
  assert.strictEqual(fb.docs.get('predmeti/' + c.id).data._deleted, true);
  s = await ana.sync.run(); assert.strictEqual(s.state, 'ok', s.error);
  assert.strictEqual(ana.store.byId(c.id), null); assert.strictEqual(ana.store.byId(t.id), null);
  assert.strictEqual(ana.store.count(), total);
  if (global.__IMPORT) assert.strictEqual(ana.store.get('choices')['odlaganja.Razlogodlaganja'].length, 40);
  const vaw = S.LISTS.filter(l => l.module === 'vaw').map(l => l.key);
  const okkPrije = ana.store.records('predmeti').length;
  adm.store.batch(() => { for (let i = 0; i < 150; i++) adm.store.saveLocal('vaw_predmeti', 'v' + i, { Title: `K ${i}/26` }, 'Admin'); });
  await adm.sync.run(); await ana.sync.run(); assert.strictEqual(ana.store.records('vaw_predmeti').length, 150);
  const vawIds = vaw.flatMap(k => adm.store.records(k).map(r => r.id));
  adm.store.batch(() => vawIds.forEach(id => adm.store.markDeleted(id)));
  s = await adm.sync.run(); assert.strictEqual(s.state, 'ok', s.error); assert.strictEqual(s.pending, 0);
  assert.ok(vawIds.every(id => fb.docs.get('vaw_predmeti/' + id).data._deleted === true));
  s = await ana.sync.run(); assert.strictEqual(s.state, 'ok', s.error);
  assert.strictEqual(ana.store.records('vaw_predmeti').length, 0);
  assert.strictEqual(ana.store.records('predmeti').length, okkPrije, 'drugi moduli ostaju');
  await adm.sync.removeUser('ana@x.me');
  s = await ana.sync.run(); assert.strictEqual(s.state, 'noaccess');
  await adm.sync.setUser('ana@x.me', 'Ana Monitor', 'monitor');
  s = await ana.sync.run(); assert.strictEqual(s.state, 'ok', s.error);
});

test('forme administratora: nacrt, novi modul i polja, objava monitorima', async () => {
  const { fb, adm, ana } = global.__FB;
  const runA = () => { adm.sync.onForms(); return adm.sync.run(); }, runM = () => { ana.sync.onForms(); return ana.sync.run(); };
  await runA(); await runM();
  const cfg = { modules: [{ key: 'x_nm', title: 'Nasilje nad muškarcima', steps: [{ key: 'x_nm_presuda', title: 'Presuda', many: true }] }],
    fields: { predmeti: [{ name: 'c_ocjena', label: 'Ocjena monitora', type: 'choice', choices: ['Dobro', 'Loše'] }], x_nm_predmeti: [{ name: 'c_odnos', label: 'Odnos', type: 'text' }] },
    moduleTitles: { okk: 'OKK modul' }, overrides: { 'predmeti.sporazum': { hidden: true } } };
  await adm.sync.saveFormsDraft(cfg);
  assert(S.LIST_BY_KEY.x_nm_predmeti && S.MODULES.find(m => m.key === 'okk').title === 'OKK modul', 'administrator odmah vidi nacrt');
  assert(fb.docs.has('meta/forms_draft') && !fb.docs.has('meta/forms'));
  const c = adm.store.saveLocal('x_nm_predmeti', null, { Title: 'K 1/26', c_odnos: 'otac' }, 'Admin');
  adm.store.saveLocal('x_nm_presuda', null, { Predmet: c.id }, 'Admin');
  const p0 = adm.store.records('predmeti')[0];
  adm.store.saveLocal('predmeti', p0.id, { ...p0.fields, c_ocjena: 'Dobro' }, 'Admin');
  let s = await runA(); assert.strictEqual(s.state, 'ok', s.error); assert.strictEqual(s.pending, 0);
  assert.strictEqual(fb.docs.get('x_nm_predmeti/' + c.id).data.c_odnos, 'otac', 'nova kolekcija prolazi pravila');
  assert.strictEqual(fb.docs.get('predmeti/' + p0.id).data.c_ocjena, 'Dobro');
  s = await runM(); assert.strictEqual(s.state, 'ok', s.error);
  assert(!S.LIST_BY_KEY.x_nm_predmeti, 'monitor ne vidi neobjavljeni modul');
  const pa = ana.store.byId(p0.id); assert.strictEqual(pa.fields.c_ocjena, undefined);
  ana.store.saveLocal('predmeti', p0.id, { ...pa.fields, Title: pa.fields.Title + ' ' }, 'Ana Monitor');
  s = await runM(); assert.strictEqual(s.state, 'ok', s.error);
  assert.strictEqual(fb.docs.get('predmeti/' + p0.id).data.c_ocjena, 'Dobro', 'polje iz nacrta ostaje na serveru');
  await runA(); assert(await adm.sync.publishForms());
  assert(fb.docs.has('meta/forms') && !fb.docs.has('meta/forms_draft'));
  s = await runM(); assert.strictEqual(s.state, 'ok', s.error);
  assert(S.LIST_BY_KEY.x_nm_predmeti && S.LIST_BY_KEY.x_nm_presuda.many);
  assert.strictEqual(ana.store.records('x_nm_predmeti').length, 1, 'monitor preuzima zapise novog modula');
  assert.strictEqual(ana.store.byId(p0.id).fields.c_ocjena, 'Dobro', 'i vrijednosti novih polja');
  assert(S.fieldsOf('predmeti').find(f => f.name === 'sporazum').hidden);
  await assert.rejects(() => ana.sync.saveFormsDraft({}));
  await adm.sync.saveFormsDraft({ ...cfg, fields: { ...cfg.fields, predmeti: [{ ...cfg.fields.predmeti[0], archived: true }] } });
  await adm.sync.publishForms(); s = await runA(); assert.strictEqual(s.state, 'ok');
  assert.strictEqual(adm.store.byId(p0.id).fields.c_ocjena, 'Dobro'); assert(S.fieldsOf('predmeti').find(f => f.name === 'c_ocjena').hidden);
  await adm.sync.saveFormsDraft(null); await adm.sync.publishForms(); await runA();
});
test('graditelj tabela: filteri, redovi, kolone, nazivi i redoslijed', () => {
  const d = { predmeti: [{ _id: 'a', sud: 'Osnovni sud Bar', Pritvorskipredmet: true }, { _id: 'b', sud: 'Viši sud Podgorica' }, { _id: 'c', sud: 'Osnovni sud Bar' }],
    odlaganja: [{ Predmet: 'a', Razlogodlaganja: '401 - Odsustvo sudije', Odlo_x017e_enood: '2024-01-01', Odlo_x017e_enodo: '2024-01-11' }, { Predmet: 'b', Razlogodlaganja: '101 - Neuredna dostava okrivljenom', Odlo_x017e_enood: '2024-01-01', Odlo_x017e_enodo: '2024-01-21' }],
    roc: { predmeti: [{ _id: 'r', sud: 'Osnovni sud Bar' }], rocista: [{ Predmet: 'r', togaSudija: true, togaTuzilac: false }, { Predmet: 'r', togaSudija: true, togaTuzilac: true }, { Predmet: 'r', togaSudija: false }] } };
  const toga = ST.customTable({ title: 'Toge', unit: 'svir_rocista', rows: { field: 'c:sud', courtGroups: true, short: true },
    cols: [{ label: 'Ročišta', agg: 'count' }, { label: 'Sudija', agg: 'pct_row', filters: [{ field: 'f:togaSudija', op: 'yes' }] }, { label: 'Tužilac', agg: 'pct_row', filters: [{ field: 'f:togaTuzilac', op: 'yes' }] }] }, d);
  assert.deepStrictEqual(toga.rows.find(r => r[0] === 'OS Bar'), ['OS Bar', 3, '66,67%', '33,33%']);
  assert.deepStrictEqual(toga.rows[toga.rows.length - 1], ['SVI SUDOVI', 3, '66,67%', '33,33%']);
  const odl = ST.customTable({ unit: 'svi_odlaganja', filters: [{ field: 'c:Pritvorskipredmet', op: 'no' }], rows: { field: 'd:grupaRazloga' },
    cols: [{ agg: 'count' }, { agg: 'avg', field: 'd:trajanje', decimals: 0 }, { agg: 'dur_sum', field: 'f:Odlo_x017e_enood', field2: 'f:Odlo_x017e_enodo' }] }, { ...d, predmeti: d.predmeti });
  assert.deepStrictEqual(odl.rows, [['Neuredna dostava poziva', 1, '20', '20'], ['Ukupno', 1, '20', '20']]);
  const cs = ST.customTable({ unit: 'svi_predmeti', rows: { field: 'f:Pritvorskipredmet' }, cols: [{ agg: 'count' }, { agg: 'pct' }] }, d);
  assert.deepStrictEqual(cs.rows, [['Da', 1, '33,33%'], ['Ne', 2, '66,67%'], ['Ukupno', 3, '100%']]);
  const cfg = { titles: { 'vaw:1': { title: 'Uzorak' }, 'vaw:2': { hidden: true } }, custom: [{ id: 'x1', module: 'vaw', title: 'Moja', unit: 'vaw_predmeti', cols: [{ agg: 'count' }], ready: false }], order: { vaw: ['c:x1'] } };
  const mon = ST.reportTables('vaw', { predmeti: [] }, cfg, {}), adm = ST.reportTables('vaw', { predmeti: [] }, cfg, { admin: true, showHidden: true });
  assert.strictEqual(mon[0].title, 'Uzorak'); assert(!mon.some(t => t.custom), 'monitor ne vidi tabelu u izradi'); assert.strictEqual(mon.length, 17, 'sakrivena tabela');
  assert.strictEqual(adm[0].key, 'c:x1'); assert.strictEqual(adm[0].no, 1); assert.strictEqual(adm.find(t => t.key === 's:2').no, null);
  cfg.custom[0].ready = true; assert.strictEqual(ST.reportTables('vaw', { predmeti: [] }, cfg, {})[0].title, 'Moja');
});
test('ažuriranje: poređenje verzija', () => {
  const U = require('../src/main/updater.js');
  assert.strictEqual(U.cmp('3.16.0', '3.15.1'), 1); assert.strictEqual(U.cmp('v3.15.1', '3.15.1'), 0); assert.strictEqual(U.cmp('3.9.0', '3.15.0'), -1); assert.strictEqual(U.cmp('4.0', '3.99.9'), 1);
});
test('forme administratora: pravila u šemi', () => {
  S.applyCustom({ fields: { svi_predmeti: [{ name: 'c_broj', label: 'Broj', type: 'number', min: 1, max: 5, required: true }, { name: 'c_d1', label: 'D1', type: 'date' },
    { name: 'c_d2', label: 'D2', type: 'date', afterField: 'c_d1', showIf: { field: 'Pritvorskipredmet', value: '__da' } }, { name: 'c_sek', label: 'Nova sekcija', type: 'section', after: '§Osnovni podaci' }] } });
  try {
    assert.strictEqual(S.validate('svi_predmeti', {}).errors.c_broj, 'Obavezno polje.');
    assert(/najveća/i.test(S.validate('svi_predmeti', { c_broj: 9 }).errors.c_broj));
    const F = S.fieldsOf('svi_predmeti'), d2 = F.find(f => f.name === 'c_d2');
    assert(!S.isVisible(d2, {}) && S.isVisible(d2, { Pritvorskipredmet: true }));
    assert(/prije/.test(S.validate('svi_predmeti', { c_broj: 2, Pritvorskipredmet: true, c_d1: '2026-02-01', c_d2: '2026-01-01' }).errors.c_d2));
    const all = S.FORMS.svi_predmeti, i = all.findIndex(x => x.section === 'Osnovni podaci'); assert.strictEqual(all[i + 1].section, 'Nova sekcija');
    assert.strictEqual(S.newKey('c', 'Odnos žrtve i optuženog', new Set()), 'c_odnos_zrtve_i_optuzenog');
  } finally { S.applyCustom(null); }
  assert(!S.fieldsOf('svi_predmeti').some(f => f.name === 'c_broj'), 'osnovna šema se vraća');
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log('  ✓ ' + name); }
    catch (e) { console.log('  ✗ ' + name + '\n    ' + (e.stack || e).split('\n').slice(0, 4).join('\n    ')); process.exitCode = 1; }
  }
  console.log(`\n${passed}/${tests.length} testova prošlo.`);
})();
