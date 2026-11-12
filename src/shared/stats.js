(function (root) {
  'use strict';
  const S = (typeof module !== 'undefined' && module.exports) ? require('./schema.js') : root.Schema;
  const { days, isDate } = S;

  const OK = 'Organizovani kriminal', VK = 'Visoka korupcija';
  const DASH = '-';
  const r2 = x => Math.round(x * 100) / 100;
  const avg = xs => xs.length ? r2(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  const avgDays = xs => { const a = avg(xs); return a === null ? DASH : `${a} dana`; };
  const pct = (a, b) => b ? `${r2(a / b * 100)}%` : DASH;
  const sum = xs => xs.reduce((a, b) => a + (Number(b) || 0), 0);
  const blank = v => v === null || v === undefined || v === '';
  const distinct = xs => [...new Set(xs)];
  const by = (xs, key) => { const m = new Map(); for (const x of xs) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
  const minD = xs => xs.filter(isDate).sort()[0];
  const maxD = xs => xs.filter(isDate).sort().slice(-1)[0];
  const lt = (a, b) => days(b, a) < 0;
  const slozen = c => (c || {}).slozen === true;
  const objavaKasni = (p, c) => S.noviZKP(c) && isDate(p.Datumzavr_x0161_etkaglavnogpretr) && isDate(p.Datumobjavljivanjapresude) && days(p.Datumzavr_x0161_etkaglavnogpretr, p.Datumobjavljivanjapresude) > (slozen(c) ? 15 : 8);
  const lastDost = p => [p.dostavaStrankama, p.Datumdostavljanjapisanogotpravka, p.Datumdostavljanjapisanogotpravka0, p.Datumdostavljanjapisanogotpravka1].filter(isDate).sort().pop();
  const izradaKasni = (p, c) => S.noviZKP(c) && isDate(p.Datumobjavljivanjapresude) && isDate(lastDost(p)) && lastDost(p) > S.addMonths(p.Datumobjavljivanjapresude, slozen(c) ? 4 : 1);
  const gpKasni = c => isDate(c.Datumrje_x0161_enjaopotvr_x0111_) && isDate(c.Datumnaredbezaodr_x017e_avanjegl) && c.Datumnaredbezaodr_x017e_avanjegl > S.addMonths(c.Datumrje_x0161_enjaopotvr_x0111_, 2);
  const potvrdaKasni = c => { const r = S.potvrdaRok(c); return !!r && r.dana > r.rok; };
  const bezRocista = c => S.noviZKP(c) && /Bez ročišta/.test(c.kontrolaNacin || '');
  const NOVI = ' – predmeti po izmjenama ZKP-a iz 2026.';
  const le = (a, b) => days(a, b) >= 0;

  function ctxOf(data) {
    const P = new Map(data.predmeti.map(p => [p._id, p]));
    const caseOf = r => P.get(r.Predmet) || {};
    const pres1 = new Map(); for (const p of data.presuda1) if (!pres1.has(p.Predmet)) pres1.set(p.Predmet, p);
    return { P, caseOf, isPrit: r => caseOf(r).Pritvorskipredmet === true, vrsta: r => caseOf(r).Vrstapredmeta,
      presuda1Date: id => (pres1.get(id) || {}).Datumobjavljivanjapresude,
      pravosnaznost: id => (P.get(id) || {}).Odlaganjero_x010d_i_x0161_ta, name: id => (P.get(id) || {}).Title || '?' };
  }
  const table = (title, columns, rows, info, extra) => Object.assign({ title, columns, rows, info, empty: rows.length === 0 }, extra || {});
  const kv = (title, pairs, info) => table(title, ['Pokazatelj', 'Vrijednost'], pairs, info);

  function osnovni(d) {
    const P = d.predmeti, bez = P.filter(p => p.Ponovljenipostupak !== true);
    const traj = xs => avgDays(xs.filter(p => isDate(p.Datumpodizanjaoptu_x017e_nice) && isDate(p.Odlaganjero_x010d_i_x0161_ta))
      .map(p => days(p.Datumpodizanjaoptu_x017e_nice, p.Odlaganjero_x010d_i_x0161_ta)));
    return [kv('Osnovni podaci o analiziranim predmetima', [
      ['Broj predmeta u kojima je izvršen uvid', bez.length],
      ...retrialRows(d),
      ['Broj optužnica', bez.filter(p => p.Vrstaoptu_x017e_nogakta === 'Optužnica').length],
      ['Broj optužnih predloga', bez.filter(p => p.Vrstaoptu_x017e_nogakta === 'Optužni predlog').length],
      ['Broj predmeta organizovanog kriminala', bez.filter(p => p.Vrstapredmeta === OK).length],
      ['Broj predmeta visoke korupcije', bez.filter(p => p.Vrstapredmeta === VK).length],
      ['Prosječno trajanje svih predmeta', traj(bez)],
      ['Broj pritvorskih predmeta', P.filter(p => p.Pritvorskipredmet === true).length],
      ['Broj pritvorskih predmeta organizovanog kriminala', bez.filter(p => p.Pritvorskipredmet === true && p.Vrstapredmeta === OK).length],
      ['Broj pritvorskih predmeta visoke korupcije', bez.filter(p => p.Pritvorskipredmet === true && p.Vrstapredmeta === VK).length],
      ['Prosječno trajanje pritvorskih predmeta', traj(bez.filter(p => p.Pritvorskipredmet === true))],
      ['Broj predmeta u kojima je predloženo jemstvo', P.filter(p => p.Predlo_x017e_enojemstvo === true).length],
    ], 'Trajanje predmeta = od datuma podizanja optužnog akta do datuma pravosnažnosti; računa se samo za predmete u kojima su upisana oba datuma, bez ponovljenih postupaka.')];
  }

  function procSegments(d, c) {
    const Z1 = 'Datumdono_x0161_enjadrugostepene', PD = 'Datumobjavljivanjapresude';
    const of = (k, f) => (d[k] || []).filter(x => x.Predmet === c._id && (x.faza || 1) === f);
    const fazes = [1, ...(d.faze || []).filter(f => f.Predmet === c._id).map(f => f.faza || 2)].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
    const fname = f => f === 1 ? 'prvo suđenje' : `ponovljeno suđenje ${f - 1}`;
    const segs = []; let start = c.Datumpodizanjaoptu_x017e_nice;
    for (const f of fazes) {
      const p1 = maxD(of('presuda1', f).map(x => x[PD]));
      segs.push({ key: `1-${f}`, order: f * 10 + 1, label: `Prvostepeni postupak – ${fname(f)}`, short: f === 1 ? 'Prvo suđenje' : `Ponovljeno suđenje ${f - 1}`, from: start, to: p1,
        info: f === 1 ? 'od podizanja optužnog akta do prvostepene presude' : 'od drugostepene odluke o ukidanju do nove prvostepene presude' });
      if (!isDate(p1)) break;
      const z = maxD(of('zalba', f).map(x => x[Z1]));
      if (isDate(z)) segs.push({ key: `2-${f}`, order: f * 10 + 2, label: `Drugostepeni postupak – nakon ${f === 1 ? 'prvog suđenja' : 'ponovljenog suđenja ' + (f - 1)}`, short: 'Drugostepeni', from: p1, to: z,
        info: 'od prvostepene presude do drugostepene odluke' });
      const ukinuta = of('zalba', f).filter(x => /ukida/i.test(x.Odlukaudrugostepenompostupku || '') && isDate(x[Z1])).map(x => x[Z1]);
      start = maxD(ukinuta) || z;
    }
    for (const g of segs) { const n = isDate(g.from) && isDate(g.to) ? days(g.from, g.to) : null; g.bad = n !== null && n < 0; g.days = g.bad ? null : n; }
    const end = c.Odlaganjero_x010d_i_x0161_ta;
    return { segs, total: isDate(c.Datumpodizanjaoptu_x017e_nice) && isDate(end) ? days(c.Datumpodizanjaoptu_x017e_nice, end) : null, retrials: fazes.length - 1 };
  }
  function procTimeline(d, caseId, withCourt) {
    const all = d.predmeti.map(c => ({ c, ...procSegments(d, c) }));
    const stages = new Map();
    for (const x of all) for (const g of x.segs) if (g.days !== null) { if (!stages.has(g.key)) stages.set(g.key, { label: g.label, order: g.order, v: [] }); stages.get(g.key).v.push(g.days); }
    const rows = [...stages.values()].sort((a, b) => a.order - b.order).map(s => [s.label, s.v.length, avgDays(s.v), `${Math.min(...s.v)} dana`, `${Math.max(...s.v)} dana`]);
    const tot = all.map(x => x.total).filter(x => x !== null);
    if (tot.length) rows.push(['Ukupno – od podizanja optužnog akta do pravosnažnosti', tot.length, avgDays(tot), `${Math.min(...tot)} dana`, `${Math.max(...tot)} dana`]);
    const fmtD = x => x ? x.split('-').reverse().join('.') : '?';
    const multi = all.filter(x => x.segs.some(g => g.short === 'Drugostepeni'));
    const flow = x => x.segs.map(g => `${g.short}: ${g.bad ? 'neispravni datumi' : g.days === null ? 'u toku' : g.days + ' d'}`).join(' → ');
    const out = [
      table('Trajanje postupka po fazama', ['Faza postupka', 'Broj predmeta', 'Prosječno trajanje', 'Najkraće', 'Najduže'], rows,
        'Faze se nadovezuju, pa zbir faza daje ukupno trajanje: prvostepeni postupak traje od podizanja optužnog akta (kod ponovljenog suđenja od drugostepene odluke o ukidanju) do prvostepene presude; drugostepeni od prvostepene presude do drugostepene odluke. Računaju se samo faze sa oba ispravna datuma (kraj ne može biti prije početka).'),
      table('Tok postupka po predmetima (predmeti u kojima je odlučivao drugostepeni sud)', [...(withCourt ? ['Sud'] : []), 'Predmet', 'Ponovljena suđenja', 'Tok postupka', 'Ukupno do pravosnažnosti'],
        multi.sort((a, b) => b.retrials - a.retrials || String(a.c.Title).localeCompare(String(b.c.Title)))
          .map(x => [...(withCourt ? [x.c.sud || ''] : []), x.c.Title || '?', x.retrials, flow(x), x.total === null ? DASH : `${x.total} dana`])),
    ];
    const sel = caseId && all.find(x => x.c._id === caseId);
    if (sel) out.push(table(`Izabrani predmet: ${sel.c.Title || '?'}`, ['Faza postupka', 'Od', 'Do', 'Trajanje'],
      [...sel.segs.map(g => [g.label, fmtD(g.from), g.to ? fmtD(g.to) : 'u toku', g.bad ? 'neispravni datumi' : g.days === null ? DASH : `${g.days} dana`]),
       ['Ukupno do pravosnažnosti', fmtD(sel.c.Datumpodizanjaoptu_x017e_nice), fmtD(sel.c.Odlaganjero_x010d_i_x0161_ta), sel.total === null ? DASH : `${sel.total} dana`]], null, { perCase: true }));
    return out;
  }
  function retrialSpans(d) {
    const F = d.faze || [];
    return F.map(f => {
      const z = (d.zalba || []).filter(x => x.Predmet === f.Predmet && (x.faza || 1) === (f.faza || 2) - 1 && /ukida/i.test(x.Odlukaudrugostepenompostupku || '') && isDate(x.Datumdono_x0161_enjadrugostepene));
      const p = (d.presuda1 || []).filter(x => x.Predmet === f.Predmet && (x.faza || 1) === (f.faza || 2) && isDate(x.Datumobjavljivanjapresude));
      return z.length && p.length ? days(z[0].Datumdono_x0161_enjadrugostepene, p[0].Datumobjavljivanjapresude) : null;
    }).filter(x => x !== null);
  }
  function retrialRows(d) {
    const F = d.faze || [];
    return [['Broj predmeta vraćenih na ponovno suđenje', distinct(F.map(f => f.Predmet)).length], ['Ukupan broj ponovljenih suđenja', F.length],
      ['Prosječno trajanje ponovljenog suđenja (od odluke o ukidanju do nove prvostepene presude)', avgDays(retrialSpans(d))]];
  }
  function optuznica(d, c) {
    const base = d.predmeti.filter(p => p.Ponovljenipostupak !== true && p.Vrstaoptu_x017e_nogakta === 'Optužnica');
    const span = (a, b) => base.filter(p => isDate(p[a]) && isDate(p[b])).map(p => days(p[a], p[b]));
    const PR = 'Datumprijemaoptu_x017e_niceusud', KO = 'Datumro_x010d_i_x0161_tazakontro', PO = 'Datumrje_x0161_enjaopotvr_x0111_',
      ZR = 'Datumzakazivanjaprvogro_x010d_i_', NA = 'Datumnaredbezaodr_x017e_avanjegl', PD = 'Datumpodizanjaoptu_x017e_nice';
    const out = [];
    out.push(kv('Rokovi u postupku po optužnici', [
      ['Prosječan broj dana od dana prijema optužnice u sud do dana održavanja ročišta za kontrolu optužnice', avgDays(span(PR, KO))],
      ['Rok za potvrđivanje optužnice nakon ročišta za kontrolu optužnice (prosjek u danima)', avgDays(span(KO, PO))],
      ['Prosječan rok (u danima) u kojem je zakazan glavni pretres nakon potvrđivanja optužnice', avgDays(span(PO, ZR))],
    ]));
    out.push(kv('Zakonski rokovi u kontroli optužnice i zakazivanju glavnog pretresa', [
      ['Broj optužnica podignutih nakon stupanja na snagu izmjena ZKP-a (od 17.9.2026)', base.filter(S.noviZKP).length],
      ['Broj optužnica kontrolisanih bez ročišta (pisano izjašnjenje odbrane, čl. 293 st. 3)', base.filter(bezRocista).length],
      ['Broj optužnica potvrđenih nakon roka od 8 dana, odnosno 15 dana u složenim predmetima (čl. 296 st. 1)', base.filter(potvrdaKasni).length],
      ['Broj predmeta u kojima glavni pretres nije određen u roku od dva mjeseca od potvrđivanja optužnice (čl. 304 st. 2)', base.filter(gpKasni).length],
    ], 'Kontrola bez ročišta i rok za potvrđivanje (čl. 293 i 296) računaju se samo za optužnice podignute nakon stupanja na snagu izmjena ZKP-a (Sl. list CG 132/26). Rok od dva mjeseca (čl. 304) važi za sve predmete.'));
    const probijen = base.filter(p => isDate(p[PR]) && isDate(p[KO]) && days(p[PR], p[KO]) > 15);
    const probijenPrit = probijen.filter(p => isDate(p[PD]) && d.pritvori.some(t => t.Predmet === p._id && isDate(t.Datumodre_x0111_ivanjapritvora) && lt(t.Datumodre_x0111_ivanjapritvora, p[PD])));
    out.push(kv('Rok od 15 dana za ročište za kontrolu optužnice', [
      ['Broj predmeta u kojima je rok od 15 dana od dana prijema optužnice u sud do ročišta za kontrolu optužnice probijen', probijen.length],
      ['Broj pritvorskih predmeta u kojima je taj rok probijen, a pritvor je određen prije podizanja optužnice', probijenPrit.length],
    ]));
    const bez = d.predmeti.filter(p => p.Ponovljenipostupak !== true);
    const cnt = (v, akt, prit) => bez.filter(p => (v ? p.Vrstapredmeta === v : true) && p.Vrstaoptu_x017e_nogakta === akt && (!prit || p.Pritvorskipredmet === true)).length;
    const row = (lbl, v) => [lbl, cnt(v, 'Optužnica'), cnt(v, 'Optužnica', true), cnt(v, 'Optužni predlog'), cnt(v, 'Optužni predlog', true)];
    out.push(table('Broj predmeta prema vrsti optužnog akta i vrsti predmeta (bez ponovljenih postupaka)',
      ['Vrsta predmeta', 'Optužnica', 'Optužnica – pritvorski', 'Optužni predlog', 'Optužni predlog – pritvorski'],
      [row(OK, OK), row(VK, VK), row('Ukupno', null)]));
    const perCase = (title, a, b, label, withAvg) => {
      const xs = base.filter(p => isDate(p[a]) && isDate(p[b]));
      const rows = xs.map(p => [p.Title, p.Vrstapredmeta || '', p.Pritvorskipredmet ? 'Da' : 'Ne', `${days(p[a], p[b])} dana`]).sort((x, y) => String(x[0]).localeCompare(String(y[0])));
      if (withAvg && rows.length) rows.push(['Prosjek', '', '', avgDays(xs.map(p => days(p[a], p[b])))]);
      return table(title, ['Predmet', 'Vrsta predmeta', 'Pritvorski predmet', label], rows);
    };
    out.push(perCase('Broj dana od prijema optužnice do ročišta za kontrolu optužnice, po predmetu', PR, KO, 'Broj dana'));
    out.push(perCase('Rok za potvrđivanje optužnice nakon održanog ročišta za kontrolu optužnice, po predmetu', KO, PO, 'Broj dana'));
    const sdt = base.filter(p => p.Podnosilac === 'SDT');
    const sdtRows = sdt.map(p => [p.Title, isDate(p[PD]) && isDate(p[PR]) ? `${days(p[PD], p[PR])} dana` : DASH]);
    if (sdtRows.length) sdtRows.push(['Prosjek', avgDays(sdt.filter(p => isDate(p[PD]) && isDate(p[PR])).map(p => days(p[PD], p[PR])))]);
    out.push(table('Broj dana od dana podizanja optužnice do dana prijema optužnice u sud (podnosilac SDT)', ['Predmet', 'Broj dana'], sdtRows));
    out.push(perCase('Rok od potvrđivanja optužnice do naredbe za održavanje glavnog pretresa', PO, NA, 'Broj dana', true));
    return out;
  }

  function optuzniPredlog(d) {
    const op = d.predmeti.filter(p => p.Vrstaoptu_x017e_nogakta === 'Optužni predlog');
    const PR = 'Datumprijemaoptu_x017e_niceusud', ZR = 'Datumzakazivanjaprvogro_x010d_i_', NA = 'Datumnaredbezaodr_x017e_avanjegl';
    const grp = [['Svi predmeti', () => true], ['Pritvorski predmeti', p => p.Pritvorskipredmet === true], ['Nepritvorski predmeti', p => p.Pritvorskipredmet !== true]];
    const over30 = grp.map(([, f]) => op.filter(p => f(p) && isDate(p[PR]) && isDate(p[ZR]) && days(p[PR], p[ZR]) > 30).length);
    const avgN = grp.map(([, f]) => avgDays(op.filter(p => f(p) && isDate(p[PR]) && isDate(p[NA])).map(p => days(p[PR], p[NA]))));
    const n = op.length, a = op.filter(p => isDate(p[PR])).length, b = op.filter(p => isDate(p[NA])).length, ab = op.filter(p => isDate(p[PR]) && isDate(p[NA])).length;
    return [
      table('Broj predmeta sa optužnim predlogom u kojima je glavni pretres zakazan za više od 30 dana od dana prijema optužnog predloga', grp.map(g => g[0]), [over30]),
      table('Prosječan rok (u danima) za zakazivanje glavnog pretresa u predmetima sa optužnim predlogom', grp.map(g => g[0]), [avgN],
        'Od datuma prijema optužnog predloga u sud do datuma naredbe za održavanje glavnog pretresa.'),
      kv('Popunjenost podataka (optužni predlog)', [
        ['Broj analiziranih predmeta sa optužnim predlogom', n],
        ['Broj predmeta u kojima je upisan datum prijema optužnog akta u sud', `${a} (${pct(a, n)})`],
        ['Broj predmeta u kojima je upisan datum naredbe za održavanje glavnog pretresa', `${b} (${pct(b, n)})`],
        ['Broj predmeta u kojima su upisana oba datuma', `${ab} (${pct(ab, n)})`],
      ]),
    ];
  }

  function odlaganja(d, c, caseId) {
    const ctx = ctxOf(d);
    const O = d.odlaganja, withDates = O.filter(o => isDate(o.Odlo_x017e_enood) && isDate(o.Odlo_x017e_enodo));
    const dur = o => days(o.Odlo_x017e_enood, o.Odlo_x017e_enodo);
    const cats = [['Svi predmeti', () => true], [OK, o => ctx.vrsta(o) === OK], [VK, o => ctx.vrsta(o) === VK],
      ['Svi pritvorski predmeti', o => ctx.isPrit(o)], ['Pritvorski predmeti – organizovani kriminal', o => ctx.isPrit(o) && ctx.vrsta(o) === OK],
      ['Pritvorski predmeti – visoka korupcija', o => ctx.isPrit(o) && ctx.vrsta(o) === VK]];
    const out = [];
    out.push(table('Prosječno trajanje odlaganja u danima', ['Kategorija', 'Prosječno trajanje'], cats.map(([l, f]) => [l, avgDays(withDates.filter(f).map(dur))]),
      'Od datuma kada je ročište odloženo do datuma na koji je odloženo.'));
    const P = d.predmeti;
    const hr = (lbl, xs) => { const a = sum(xs.map(p => p.Brojodr_x017e_anihro_x010d_i_x01)), b = sum(xs.map(p => p.Brojodlo_x017e_enihro_x010d_i_x0)); return [lbl, a, pct(a, a + b), b, pct(b, a + b)]; };
    const HC = ['Kategorija', 'Broj održanih ročišta', 'Procenat održanih ročišta', 'Broj odloženih ročišta', 'Procenat odloženih ročišta'];
    const prit = p => p.Pritvorskipredmet === true;
    out.push(table('Održana i odložena ročišta', HC, [
      hr('Svi predmeti', P), hr('Pritvorski predmeti', P.filter(prit)),
      hr('Organizovani kriminal – svi predmeti', P.filter(p => p.Vrstapredmeta === OK)), hr('Organizovani kriminal – pritvorski predmeti', P.filter(p => p.Vrstapredmeta === OK && prit(p))),
      hr('Visoka korupcija – svi predmeti', P.filter(p => p.Vrstapredmeta === VK)), hr('Visoka korupcija – pritvorski predmeti', P.filter(p => p.Vrstapredmeta === VK && prit(p))),
    ], 'Na osnovu polja „Broj održanih ročišta” i „Broj odloženih ročišta” u osnovnim podacima predmeta.'));
    const reasons = (title, xs) => {
      const withR = xs.filter(o => !blank(o._razlog));
      const g = [...by(withR, o => o._razlog).entries()].sort(sortReason);
      const rows = g.map(([r, list]) => { const ds = list.filter(o => isDate(o.Odlo_x017e_enood) && isDate(o.Odlo_x017e_enodo)).map(dur);
        return [r, list.length, pct(list.length, withR.length), ds.length ? `${sum(ds)} dana` : DASH, avgDays(ds)]; });
      if (rows.length) { const ds = withR.filter(o => isDate(o.Odlo_x017e_enood) && isDate(o.Odlo_x017e_enodo)).map(dur); rows.push(['Ukupno', withR.length, '100%', ds.length ? `${sum(ds)} dana` : DASH, avgDays(ds)]); }
      return table(title, ['Razlog odlaganja', 'Broj odlaganja', 'Procenat', 'Ukupno trajanje odlaganja', 'Prosječno trajanje odlaganja'], rows);
    };
    out.push(reasons('Razlozi odlaganja – svi predmeti', O));
    out.push(reasons('Razlozi odlaganja u predmetima organizovanog kriminala', O.filter(o => ctx.vrsta(o) === OK)));
    out.push(reasons('Razlozi odlaganja u predmetima visoke korupcije', O.filter(o => ctx.vrsta(o) === VK)));
    out.push(reasons('Razlozi odlaganja u pritvorskim predmetima', O.filter(o => ctx.isPrit(o))));
    out.push(reasons('Razlozi odlaganja u pritvorskim predmetima organizovanog kriminala', O.filter(o => ctx.isPrit(o) && ctx.vrsta(o) === OK)));
    out.push(reasons('Razlozi odlaganja u pritvorskim predmetima visoke korupcije', O.filter(o => ctx.isPrit(o) && ctx.vrsta(o) === VK)));
    if (caseId) {
      const p = ctx.P.get(caseId) || {}, mine = O.filter(o => o.Predmet === caseId);
      out.push(Object.assign(kv(`Izabrani predmet: ${p.Title || ''}`, [
        ['Prosječno trajanje odlaganja', avgDays(mine.filter(o => isDate(o.Odlo_x017e_enood) && isDate(o.Odlo_x017e_enodo)).map(dur))],
        ...(() => { const r = hr('', [p]); return [['Broj održanih ročišta', `${r[1]} (${r[2]})`], ['Broj odloženih ročišta', `${r[3]} (${r[4]})`]]; })(),
      ]), { perCase: true }));
      out.push(Object.assign(reasons(`Razlozi odlaganja u predmetu ${p.Title || ''}`, mine), { perCase: true }));
    }
    return out;
  }
  function sortReason(a, b) { const na = parseInt(String(a[0]).slice(0, 3), 10), nb = parseInt(String(b[0]).slice(0, 3), 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb; return String(a[0]).localeCompare(String(b[0])); }

  const MJERE = ['Opomena', 'Novčana kazna', 'Udaljenje iz sudnice', 'Prinudno dovođenje', 'Lokalna potjernica', 'Nacionalna potjernica', 'Međunarodna potjernica', 'Drugo'];
  const UCESNICI = ['Optuženi', 'Branilac', 'Zakonski zastupnik', 'Punomoćnik', 'Oštećeni', 'Svjedok', 'Vještak', 'Tumač', 'Tužilac', 'Drugo lice'];
  function mjere(d, c, caseId) {
    const ctx = ctxOf(d);
    const matrix = (title, xs, all) => {
      const used = all ? UCESNICI : UCESNICI.filter(u => xs.some(m => m.U_x010d_esnik === u));
      const total = xs.length;
      const rows = MJERE.map(mj => { const r = [mj]; for (const u of used) { const n = xs.filter(m => m.Mjera === mj && m.U_x010d_esnik === u).length; r.push(n); }
        const n = xs.filter(m => m.Mjera === mj).length; r.push(`${n} (${pct(n, total)})`); return r; });
      const tr = ['Ukupno']; for (const u of used) { const n = xs.filter(m => m.U_x010d_esnik === u).length; tr.push(`${n} (${pct(n, total)})`); } tr.push(`${total} (${total ? '100%' : DASH})`);
      rows.push(tr);
      return table(title, ['Mjera', ...used, 'Ukupno'], total ? rows : []);
    };
    const facts = (title, xs) => kv(title, [
      ['Iznos izrečenih novčanih kazni', `€ ${sum(xs.filter(m => m.Mjera === 'Novčana kazna').map(m => m.Nov_x010d_anakazna))}`],
      ['Broj slučajeva u kojima Uprava policije nije postupila po naredbi za dovođenje', xs.filter(m => m.Mjera === 'Prinudno dovođenje' && m.Upravapolicijenijepostupilaponar === true).length],
      ['Broj slučajeva u kojima Uprava policije nije obavijestila sud o razlozima nepostupanja', xs.filter(m => m.Mjera === 'Prinudno dovođenje' && m.Upravapolicijenijeobavijestilasu === true).length],
    ]);
    const M = d.mjere, MP = M.filter(m => ctx.isPrit(m));
    const out = [matrix('Mjere procesne discipline prema učesnicima – analizirani predmeti', M), facts('Novčane kazne i prinudno dovođenje – analizirani predmeti', M),
      matrix('Mjere procesne discipline prema učesnicima – pritvorski predmeti', MP), facts('Novčane kazne i prinudno dovođenje – pritvorski predmeti', MP)];
    if (caseId) { const mine = M.filter(m => m.Predmet === caseId), t = ctx.name(caseId);
      out.push(Object.assign(matrix(`Mjere prema učesnicima u predmetu ${t}`, mine, true), { perCase: true }), Object.assign(facts(`Novčane kazne i prinudno dovođenje u predmetu ${t}`, mine), { perCase: true })); }
    return out;
  }

  function presuda(d, c, caseId, key, label) {
    const ctx = ctxOf(d), X = d[key];
    const Z = 'Datumzavr_x0161_etkaglavnogpretr', O = 'Datumobjavljivanjapresude';
    const parties = [['Optuženi', 'Datumdostavljanjapisanogotpravka'], ['Branilac', 'Datumdostavljanjapisanogotpravka0'], ['Tužilac', 'Datumdostavljanjapisanogotpravka1']];
    const pub = xs => { const both = xs.filter(p => isDate(p[Z]) && isDate(p[O])); return [
      ['Broj predmeta u kojima je presuda objavljena istog dana kada je završen glavni pretres', both.filter(p => days(p[Z], p[O]) === 0).length],
      ['Broj predmeta u kojima je presuda objavljena nakon više od tri dana od završetka glavnog pretresa', both.filter(p => days(p[Z], p[O]) > 3).length],
      ['Broj predmeta u kojima presuda nije objavljena u roku od 8 dana, odnosno 15 dana u složenim predmetima (čl. 375 st. 1)' + NOVI, both.filter(p => objavaKasni(p, ctx.P.get(p.Predmet))).length],
      ['Prosječan broj dana potreban za objavljivanje presude nakon završetka glavnog pretresa', avgDays(both.map(p => days(p[Z], p[O])))]]; };
    const out = [
      kv(`${label} – svi predmeti`, [['Broj predmeta u kojima je unesena presuda', X.length], ...pub(X)]),
      kv(`${label} – pritvorski predmeti`, pub(X.filter(p => ctx.isPrit(p)))),
      table('Prosječan broj dana od objavljivanja presude do dostavljanja presude strankama', parties.map(p => p[0]),
        [parties.map(([, f]) => avgDays(X.filter(p => isDate(p[O]) && isDate(p[f])).map(p => days(p[O], p[f]))))]),
      table('Dostavljanje pisanog otpravka presude – broj predmeta po roku', ['Stranka', 'Do mjesec dana', 'Od jednog do dva mjeseca', 'Više od dva mjeseca'],
        parties.map(([n, f]) => { const ds = X.filter(p => isDate(p[O]) && isDate(p[f])).map(p => days(p[O], p[f]));
          return [n, ds.filter(x => x <= 30).length, ds.filter(x => x > 30 && x <= 60).length, ds.filter(x => x > 60).length]; }),
        'Do mjesec dana = do 30 dana; od jednog do dva mjeseca = 31–60 dana; više od dva mjeseca = preko 60 dana.'),
      kv('Rok za izradu i otpremu presude (čl. 378 st. 1)', [
        ['Broj presuda dostavljenih nakon roka od mjesec dana, odnosno četiri mjeseca u složenim stvarima' + NOVI, X.filter(p => izradaKasni(p, ctx.P.get(p.Predmet))).length],
        ['Broj presuda po izmjenama ZKP-a sa upisanim datumom objavljivanja i dostavljanja', X.filter(p => S.noviZKP(ctx.P.get(p.Predmet)) && isDate(p[O]) && isDate(lastDost(p))).length]],
        'Mjeri se od objavljivanja do posljednjeg upisanog dostavljanja, pa pokazuje najkasnije kad je presuda izrađena i otpremljena.'),
      kv('Nedostajući podaci', [
        ['Broj predmeta u kojima nedostaje datum završetka glavnog pretresa', X.filter(p => !isDate(p[Z])).length],
        ['Broj predmeta u kojima nedostaje datum objavljivanja presude', X.filter(p => !isDate(p[O])).length],
        ['Broj predmeta u kojima nedostaju oba datuma', X.filter(p => !isDate(p[Z]) && !isDate(p[O])).length]]),
    ];
    if (caseId) { const p = X.find(x => x.Predmet === caseId);
      out.push(Object.assign(kv(`Izabrani predmet: ${ctx.name(caseId)}`, [['Broj dana potreban za objavljivanje presude nakon završetka glavnog pretresa',
        p && isDate(p[Z]) && isDate(p[O]) ? `${days(p[Z], p[O])} dana` : DASH]]), { perCase: true })); }
    return out;
  }

  function drugostepeni(d, c, caseId) {
    const ctx = ctxOf(d), Z = d.zalba, PZ = 'Datumpodno_x0161_enja_x017e_albe', DO = 'Datumdono_x0161_enjadrugostepene', T = d.pritvori;
    const dur = z => days(z[PZ], z[DO]);
    const done = Z.filter(z => isDate(z[PZ]) && isDate(z[DO]));
    const activeAt = (z, start, end) => T.filter(t => t.Predmet === z.Predmet && isDate(t.Datumodre_x0111_ivanjapritvora) && le(t.Datumodre_x0111_ivanjapritvora, end) && (!isDate(t.Datumukidanjapritvora) || le(start, t.Datumukidanjapritvora)));
    const out = [
      kv('Drugostepeni postupci', [
        ['Broj drugostepenih postupaka u analiziranim predmetima', Z.length],
        ['Broj drugostepenih postupaka u predmetima u kojima je pritvor trajao u vrijeme podnošenja žalbe', Z.filter(z => isDate(z[PZ]) && activeAt(z, z[PZ], z[PZ]).length > 0).length],
        ['Broj drugostepenih postupaka u pritvorskim predmetima', Z.filter(z => ctx.isPrit(z)).length],
        ['Broj predmeta u kojima je drugostepeni sud odlučivao više puta', distinct(Z.map(z => z.Predmet)).filter(id => Z.filter(z => z.Predmet === id).length > 1).length],
        ['Broj predmeta u kojima je presuda ukinuta više puta', distinct(Z.map(z => z.Predmet)).filter(id => Z.filter(z => z.Predmet === id && /ukida/i.test(z.Odlukaudrugostepenompostupku || '')).length > 1).length],
        ['Prosječno trajanje drugostepenih postupaka u analiziranim predmetima', avgDays(done.map(dur))],
        ['Prosječno trajanje drugostepenih postupaka u pritvorskim predmetima', avgDays(done.filter(z => ctx.isPrit(z)).map(dur))],
      ], 'Trajanje drugostepenog postupka = od podnošenja žalbe do donošenja drugostepene odluke.'),
    ];
    const withD = Z.filter(z => !blank(z.Odlukaudrugostepenompostupku));
    const vals = distinct([...(S.FALLBACK_CHOICES['zalba.Odlukaudrugostepenompostupku']), ...withD.map(z => z.Odlukaudrugostepenompostupku)]);
    const rows = vals.map(v => { const n = withD.filter(z => z.Odlukaudrugostepenompostupku === v).length; return [v, n, pct(n, withD.length)]; });
    rows.push(['Ukupno', withD.length, withD.length ? '100%' : DASH]);
    out.push(table('Vrste donesenih odluka u drugostepenim postupcima', ['Vrsta odluke', 'Broj', 'Procenat'], withD.length ? rows : []));
    const during = done.filter(z => activeAt(z, z[PZ], z[DO]).length > 0);
    out.push(table('Predmeti u kojima je pritvor trajao za vrijeme drugostepenog postupka', ['Predmet', 'Odluka u drugostepenom postupku', 'Trajanje pritvora'],
      during.map(z => { const a = activeAt(z, z[PZ], z[DO]); const start = minD(a.map(t => t.Datumodre_x0111_ivanjapritvora));
        const ended = a.filter(t => isDate(t.Datumukidanjapritvora)); const end = ended.length === 0 ? z[DO] : minD(ended.map(t => t.Datumukidanjapritvora));
        return [ctx.name(z.Predmet), z.Odlukaudrugostepenompostupku || '', `${days(start, end)} dana`]; })));
    if (caseId) out.push(Object.assign(kv(`Izabrani predmet: ${ctx.name(caseId)}`, [['Prosječno trajanje drugostepenog postupka', avgDays(done.filter(z => z.Predmet === caseId).map(dur))]]), { perCase: true }));
    return out;
  }

  const OSNOVI = ['Opasnost od bjekstva', 'Koluziona opasnost', 'Iteracijska opasnost', 'Posebno teške okolnosti slučaja i opasnost po red i mir', 'Nedolazak na glavni pretres'];
  function pritvor(d, c, caseId) {
    const ctx = ctxOf(d), T = d.pritvori;
    const odsustvo = t => t.Su_x0111_enjeuodsustvu === true;
    const osn = t => Array.isArray(t.Osnovodre_x0111_ivanjapritvora) ? t.Osnovodre_x0111_ivanjapritvora : [];
    const out = [];
    const endOf = t => isDate(t.Datumukidanjapritvora) ? t.Datumukidanjapritvora : ctx.pravosnaznost(t.Predmet);
    const durAll = xs => avgDays(xs.filter(t => isDate(t.Datumodre_x0111_ivanjapritvora) && isDate(endOf(t))).map(t => days(t.Datumodre_x0111_ivanjapritvora, endOf(t))));
    out.push(kv('Prosječno trajanje pritvora', [['Prosječno trajanje pritvora', durAll(T)], ['Prosječno trajanje pritvora bez lica kojima se sudi u odsustvu', durAll(T.filter(t => !odsustvo(t)))]],
      'Od određivanja do ukidanja pritvora; ako pritvor nije ukinut, do pravosnažnosti presude. Pritvori bez ta dva datuma se ne računaju.'));
    const single = OSNOVI.map(o => T.filter(t => osn(t).length === 1 && osn(t)[0] === o).length), multi = T.filter(t => osn(t).length > 1).length, tot = sum(single) + multi;
    const rows = OSNOVI.map((o, i) => [o, single[i], pct(single[i], tot)]); rows.push(['Više pritvorskih osnova istovremeno', multi, pct(multi, tot)], ['Ukupno', tot, tot ? '100%' : DASH]);
    out.push(table(`Pritvorski osnovi (broj analiziranih pritvorskih predmeta: ${distinct(T.filter(t => t.Predmet).map(t => t.Predmet)).length})`, ['Pritvorski osnov', 'Broj', 'Procenat'], tot ? rows : []));
    const M = T.filter(t => osn(t).length > 1);
    const combos = [...by(M, t => [...osn(t)].sort((a, b) => a.localeCompare(b)).join(' + ')).entries()].map(([k, v]) => [k, v.length, pct(v.length, M.length)]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (combos.length) combos.push(['Ukupno', M.length, '100%']);
    out.push(table('Pregled pritvora prema kombinacijama više pritvorskih osnova', ['Kombinacija pritvorskih osnova', 'Broj', 'Procenat'], combos));
    const ind = OSNOVI.map(o => { const n = M.filter(t => osn(t).includes(o)).length; return [o, n, pct(n, M.length)]; });
    out.push(table(`Pojedinačni pritvorski osnovi kada je pritvor određen prema više osnova (ukupno pritvora sa više osnova: ${M.length})`, ['Pritvorski osnov', 'Broj', 'Procenat'], M.length ? ind : []));
    const B = T.filter(t => t.Predmet && isDate(t.Datumodre_x0111_ivanjapritvora)).map(t => ({ t, P: t.Predmet, od: t.Datumodre_x0111_ivanjapritvora, uk: t.Datumukidanjapritvora,
      faza: t.Fazapostupkaukojojjepritvorukinu, ods: odsustvo(t), podiz: (ctx.P.get(t.Predmet) || {}).Datumpodizanjaoptu_x017e_nice, pres1: ctx.presuda1Date(t.Predmet), prav: ctx.pravosnaznost(t.Predmet) }));
    for (const b of B) { b.uIstrazi = isDate(b.podiz) && lt(b.od, b.podiz); b.krajIstrage = b.faza === 'Faza istrage' && isDate(b.uk) ? b.uk : b.podiz; }
    const ist = xs => { const od = xs.filter(b => b.uIstrazi), pro = od.filter(b => isDate(b.krajIstrage) && days(b.od, b.krajIstrage) > 30), uk = xs.filter(b => isDate(b.uk) && b.faza === 'Faza istrage'), tr = od.filter(b => isDate(b.krajIstrage));
      return [distinct(od.map(b => b.P)).length, distinct(pro.map(b => b.P)).length, distinct(uk.map(b => b.P)).length, avgDays(tr.map(b => days(b.od, b.krajIstrage)))]; };
    const i1 = ist(B), i2 = ist(B.filter(b => !b.ods));
    out.push(kv('Pritvor u fazi istrage', [
      ['Br. analiziranih predmeta u kojima je određen pritvor u fazi istrage', i1[0]], ['Br. analiziranih predmeta u kojima je produžen pritvor u fazi istrage', i1[1]],
      ['Br. analiziranih predmeta u kojima je ukinut pritvor u fazi istrage', i1[2]], ['Prosječno trajanje pritvora u istrazi', i1[3]],
      ['Br. predmeta u kojima je određen pritvor u fazi istrage, bez lica kojima se sudi u odsustvu', i2[0]], ['Br. predmeta u kojima je produžen pritvor u fazi istrage, bez lica kojima se sudi u odsustvu', i2[1]],
      ['Br. predmeta u kojima je ukinut pritvor u fazi istrage, bez lica kojima se sudi u odsustvu', i2[2]], ['Prosječno trajanje pritvora u istrazi, bez lica kojima se sudi u odsustvu', i2[3]],
    ], 'Pritvor je u istrazi ako je određen prije podizanja optužnog akta. Kraj = ukidanje u fazi istrage, inače datum podizanja optužnog akta. „Produžen” = trajao više od 30 dana.'));
    const perCaseDur = (xs, s, e) => [...by(xs, b => b.P).values()].map(g => days(minD(g.map(s)), maxD(g.map(e))));
    const buckets = (xs, edges) => { const r = []; let lo = null; for (const hi of edges) { r.push(xs.filter(x => (lo === null || x > lo) && x <= hi).length); lo = hi; } r.push(xs.filter(x => x > lo).length, xs.length); return r; };
    const istB = xs => perCaseDur(xs.filter(b => b.uIstrazi && isDate(b.krajIstrage)), b => b.od, b => b.krajIstrage);
    out.push(table('Dužina trajanja pritvora u fazi istrage (broj predmeta)', ['Kategorija', 'Do 30 dana', 'Od 30 do 60 dana', 'Preko 60 dana', 'Ukupno'],
      [['Svi predmeti', ...buckets(istB(B), [30, 60])], ['Bez lica kojima se sudi u odsustvu', ...buckets(istB(B.filter(b => !b.ods)), [30, 60])]]));
    for (const b of B) { b.uGP = isDate(b.podiz) && isDate(b.pres1) && le(b.od, b.pres1) && (!isDate(b.uk) || le(b.podiz, b.uk));
      b.gpStart = lt(b.od, b.podiz || '9999-12-31') ? b.podiz : b.od; b.gpEnd = isDate(b.uk) && lt(b.uk, b.pres1 || '0000-01-01') ? b.uk : b.pres1; }
    const gp = xs => perCaseDur(xs.filter(b => b.uGP && isDate(b.gpStart) && isDate(b.gpEnd) && le(b.gpStart, b.gpEnd)), b => b.gpStart, b => b.gpEnd);
    out.push(table('Dužina trajanja pritvora u fazi glavnog pretresa (broj predmeta)', ['Kategorija', 'Do 30 dana', 'Od 30 do 60 dana', 'Od 60 do 120 dana', 'Preko 120 dana', 'Ukupno'],
      [['Svi predmeti', ...buckets(gp(B), [30, 60, 120])], ['Bez lica kojima se sudi u odsustvu', ...buckets(gp(B.filter(b => !b.ods)), [30, 60, 120])]],
      'Od podizanja optužnog akta (ili kasnijeg određivanja pritvora) do prvostepene presude (ili ranijeg ukidanja).'));
    for (const b of B) { b.uNP = isDate(b.podiz) && (!isDate(b.uk) || le(b.podiz, b.uk)) && (!isDate(b.pres1) || le(b.od, b.pres1));
      b.npStart = isDate(b.podiz) && lt(b.od, b.podiz) ? b.podiz : b.od; b.npEnd = isDate(b.uk) ? (isDate(b.pres1) && lt(b.pres1, b.uk) ? b.pres1 : b.uk) : b.pres1; }
    const np = xs => { const dur = perCaseDur(xs.filter(b => b.uNP && isDate(b.npStart) && isDate(b.npEnd) && le(b.npStart, b.npEnd)), b => b.npStart, b => b.npEnd);
      const ukin = distinct(xs.filter(b => isDate(b.uk) && (b.faza === 'Nakon podizanja optužnice' || (isDate(b.podiz) && le(b.podiz, b.uk) && (!isDate(b.pres1) || le(b.uk, b.pres1))))).map(b => b.P)).length;
      return [dur.length, ukin, avgDays(dur)]; };
    const n1 = np(B), n2 = np(B.filter(b => !b.ods));
    out.push(kv('Pritvor nakon podizanja optužnog akta', [
      ['Broj analiziranih predmeta u kojima je pritvor određen/produžen nakon podizanja optužnog akta', n1[0]], ['Broj analiziranih predmeta u kojima je pritvor ukinut nakon podizanja optužnog akta (u fazi suđenja)', n1[1]],
      ['Prosječno trajanje pritvora nakon podizanja optužnog akta', n1[2]],
      ['Broj predmeta u kojima je pritvor određen/produžen nakon podizanja optužnog akta, bez lica kojima se sudi u odsustvu', n2[0]],
      ['Broj predmeta u kojima je pritvor ukinut nakon podizanja optužnog akta (u fazi suđenja), bez lica kojima se sudi u odsustvu', n2[1]],
      ['Prosječno trajanje pritvora nakon podizanja optužnog akta, bez lica kojima se sudi u odsustvu', n2[2]]]));
    const prod = B.filter(b => isDate(b.pres1) && lt(b.pres1, b.od));
    const doPrav = B.filter(b => isDate(b.pres1) && isDate(b.prav) && le(b.od, b.prav) && (!isDate(b.uk) || le(b.prav, b.uk)));
    out.push(table('Pritvor nakon izricanja presude', ['Pokazatelj', 'Broj predmeta', 'Broj pritvora'], [
      ['Pritvor produžen nakon izricanja presude', distinct(prod.map(b => b.P)).length, prod.length],
      ['Pritvor trajao do pravosnažnosti presude', distinct(doPrav.map(b => b.P)).length, doPrav.length]]));
    const perP = [...by(B, b => b.P).entries()].map(([id, g]) => { const a = g.filter(b => prod.includes(b)).length, z = g.filter(b => doPrav.includes(b)).length;
      return [ctx.name(id), a ? 'Da' : 'Ne', a, z ? 'Da' : 'Ne', z]; }).filter(r => r[2] || r[4]).sort((a, b) => a[0].localeCompare(b[0]));
    out.push(table('Predmeti u kojima je pritvor produžen nakon izricanja presude ili je trajao do pravosnažnosti presude',
      ['Predmet', 'Produžen nakon presude', 'Broj pritvora', 'Trajao do pravosnažnosti', 'Broj pritvora'], perP));
    const nakon = B.filter(b => isDate(b.pres1) && le(b.od, b.pres1) && ((isDate(b.uk) && le(b.pres1, b.uk)) || (!isDate(b.uk) && isDate(b.prav) && le(b.pres1, b.prav))));
    out.push(kv('Prosječno trajanje pritvora nakon izricanja presude', [['Broj pritvora koji su trajali nakon izricanja presude', nakon.length],
      ['Prosječno trajanje pritvora nakon izricanja presude', avgDays(nakon.map(b => days(b.pres1, isDate(b.uk) ? b.uk : b.prav)))]]));
    const people = (title, xs) => { const g = [...by(xs.filter(t => !blank(t.Okrivljeni_x002f_Optu_x017e_eni)), t => t.Okrivljeni_x002f_Optu_x017e_eni).entries()]
      .map(([o, l]) => [o, distinct(l.map(t => ctx.name(t.Predmet))).sort().join(', ')]).sort((a, b) => a[0].localeCompare(b[0]));
      if (g.length) g.push(['Ukupno jedinstvenih predmeta', distinct(xs.map(t => t.Predmet)).length]); return table(title, ['Optuženi', 'Predmeti'], g); };
    out.push(people('Optuženi kojima je pritvor trajao nakon presude', T.filter(t => { const p1 = ctx.presuda1Date(t.Predmet), e = endOf(t); return t.Predmet && isDate(p1) && isDate(e) && le(p1, e); })));
    out.push(people('Lica i predmeti u kojima je pritvor ukinut nakon izricanja presude', T.filter(t => t.Predmet && t.Fazapostupkaukojojjepritvorukinu === 'Nakon presude')));
    if (caseId) { const mine = T.filter(t => t.Predmet === caseId);
      out.push(Object.assign(table(`Pritvori u predmetu ${ctx.name(caseId)}`, ['Optuženi', 'Određen', 'Ukinut', 'Trajanje', 'Osnov'],
        mine.map(t => [t.Okrivljeni_x002f_Optu_x017e_eni || '', S.fmtDate(t.Datumodre_x0111_ivanjapritvora), S.fmtDate(t.Datumukidanjapritvora) || 'traje',
          isDate(endOf(t)) && isDate(t.Datumodre_x0111_ivanjapritvora) ? `${days(t.Datumodre_x0111_ivanjapritvora, endOf(t))} dana` : DASH, osn(t).join(', ')])), { perCase: true })); }
    return out;
  }

  function predlagaci(J) {
    const odl = distinct(['Usvojeno', 'Odbijeno', ...J.map(j => j.Odlukasuda).filter(Boolean)]);
    const g = [...by(J, j => j.predlagac || 'Nije navedeno').entries()].sort((a, b) => b[1].length - a[1].length);
    return table('Jemstvo prema predlagaču', ['Ko je predložio', 'Broj', ...odl], J.length ? [...g.map(([k, v]) => [k, v.length, ...odl.map(o => v.filter(j => j.Odlukasuda === o).length)]),
      ['Ukupno', J.length, ...odl.map(o => J.filter(j => j.Odlukasuda === o).length)]] : []);
  }
  function jemstvo(d, c, caseId) {
    const ctx = ctxOf(d), J = d.jemstva;
    const ponud = J.map(j => j.Vrijednostponu_x0111_enogjemstva).filter(v => typeof v === 'number');
    const prihv = J.map(j => j.Vrijednostprihva_x0107_enogjemst).filter(v => typeof v === 'number' && v > 0);
    const eur = v => v === null ? DASH : `€ ${v.toLocaleString('de-DE')}`;
    const out = [kv('Jemstvo – pregled', [
      ['Broj predmeta u kojima je predloženo jemstvo (osnovni podaci)', d.predmeti.filter(p => p.Predlo_x017e_enojemstvo === true).length],
      ['Broj unesenih jemstava', J.length], ['Broj predmeta sa unesenim jemstvom', distinct(J.map(j => j.Predmet)).length],
      ['Broj jemstava u pritvorskim predmetima', J.filter(j => ctx.isPrit(j)).length],
      ['Prosječna vrijednost ponuđenog jemstva', eur(avg(ponud))], ['Prosječna vrijednost prihvaćenog jemstva', eur(avg(prihv))],
      ['Ukupna vrijednost prihvaćenih jemstava', eur(prihv.length ? sum(prihv) : null)],
      ['Broj pritvora zamijenjenih jemstvom', d.pritvori.filter(t => t.Pritvorjezamijenjenjemstvom === true).length]])];
    const withD = J.filter(j => !blank(j.Odlukasuda));
    const rows = [...by(withD, j => j.Odlukasuda).entries()].map(([k, v]) => [k, v.length, pct(v.length, withD.length)]).sort((a, b) => b[1] - a[1]);
    if (rows.length) rows.push(['Ukupno', withD.length, '100%']);
    out.push(table('Odluke suda o jemstvu', ['Odluka suda', 'Broj', 'Procenat'], rows));
    out.push(predlagaci(J));
    const vrste = distinct(J.map(j => ctx.vrsta(j) || 'Nije navedeno')), odl = distinct(J.map(j => j.Odlukasuda).filter(Boolean));
    out.push(table('Struktura prihvaćenih i odbijenih jemstava prema vrsti predmeta', ['Vrsta predmeta', ...odl, 'Ukupno'],
      J.length ? [...vrste.map(v => { const g = J.filter(j => (ctx.vrsta(j) || 'Nije navedeno') === v); return [v, ...odl.map(o => g.filter(j => j.Odlukasuda === o).length), g.length]; }),
        ['Ukupno', ...odl.map(o => J.filter(j => j.Odlukasuda === o).length), J.length]] : []));
    if (caseId) out.push(Object.assign(table(`Jemstva u predmetu ${ctx.name(caseId)}`, ['Optuženi', 'Ponuđeno', 'Odluka suda', 'Prihvaćeno'],
      J.filter(j => j.Predmet === caseId).map(j => [j.Optu_x017e_eni || '', eur(j.Vrijednostponu_x0111_enogjemstva ?? null), j.Odlukasuda || '', eur(j.Vrijednostprihva_x0107_enogjemst ?? null)])), { perCase: true }));
    return out;
  }

  const TOPICS = [
    { key: 'osnovni', title: 'Osnovni podaci', fn: osnovni },
    { key: 'optuznica', title: 'Optužnica', fn: optuznica },
    { key: 'predlog', title: 'Optužni predlog', fn: optuzniPredlog },
    { key: 'odlaganja', title: 'Odlaganje ročišta', fn: odlaganja, perCase: true },
    { key: 'mjere', title: 'Mjere procesne discipline', fn: mjere, perCase: true },
    { key: 'presuda1', title: 'Pravo na javno izricanje presude', fn: (d, c, id) => presuda(d, c, id, 'presuda1', 'Prvostepeni postupak'), perCase: true },
    { key: 'zalba', title: 'Drugostepeni postupak', fn: drugostepeni, perCase: true },
    { key: 'presuda2', title: 'Pravo na javno izricanje presude u drugostepenom postupku', fn: (d, c, id) => presuda(d, c, id, 'presuda2', 'Drugostepeni postupak'), perCase: true },
    { key: 'pritvor', title: 'Pritvor', fn: pritvor, perCase: true },
    { key: 'jemstvo', title: 'Mjere nadzora i jemstvo', fn: (d, c, id) => [...supervision(d.predmeti, indexOf(d), 'vrsti predmeta', x => x.Vrstapredmeta), ...jemstvo(d, c, id)], perCase: true },
    { key: 'tok', title: 'Tok i trajanje postupka', fn: (d, c, id) => procTimeline(d, id, false), perCase: true },
  ];

  const cnt = (xs, f) => xs.filter(f).length;
  const pctN = (a, b) => b ? `${r2(a / b * 100)}%` : DASH;
  const avgD = xs => { const a = avg(xs.filter(x => x !== null && x !== undefined && isFinite(x))); return a === null ? DASH : a; };
  const sumD = xs => { const v = xs.filter(x => x !== null && x !== undefined && isFinite(x)); return v.length ? sum(v) : DASH; };
  function indexOf(d) {
    const ix = {};
    for (const [k, xs] of Object.entries(d)) {
      if (!Array.isArray(xs)) continue;
      const m = by(xs.filter(x => x.Predmet), x => x.Predmet);
      ix[k] = id => m.get(id) || [];
    }
    return ix;
  }
  function courtTable(title, cases, indicators, ix, info, courtOf) {
    courtOf = courtOf || (c => c.sud || 'Nepoznat sud');
    const courts = distinct(cases.map(courtOf)).sort((a, b) => a.localeCompare(b, 'sr'));
    const os = courts.filter(c => /^Osnovni/.test(c)), vs = courts.filter(c => /^Viši/.test(c));
    const agg = os.length && vs.length ? [['Osnovni sudovi', os], ['Viši sudovi', vs]] : [];
    const groups = [cases, ...agg.map(([, cs]) => cases.filter(c => cs.includes(courtOf(c)))), ...courts.map(ct => cases.filter(c => courtOf(c) === ct))];
    const rows = indicators.map(([label, fn]) => [label, ...groups.map(g => { const v = fn(g, ix); return v === null || v === undefined ? DASH : v; })]);
    return { title, columns: ['Pokazatelj', 'Ukupno', ...agg.map(a => a[0]), ...courts], rows, info, courtCols: courts.length + agg.length, empty: cases.length === 0 };
  }
  const P = c => c.Pritvorskipredmet === true || c.pritvorski === true;
  function activeCases(title, cases, refDate) {
    const ref = refDate || new Date().toISOString().slice(0, 10);
    const A = cases.filter(c => !isDate(c.Odlaganjero_x010d_i_x0161_ta) && isDate(c.Datumprijemaoptu_x017e_niceusud) && le(c.Datumprijemaoptu_x017e_niceusud, ref))
      .map(c => ({ c, y: c.Datumprijemaoptu_x017e_niceusud.slice(0, 4), d: days(c.Datumprijemaoptu_x017e_niceusud, ref) }));
    const row = (lbl, xs) => [lbl, xs.length, xs.length ? sum(xs.map(x => x.d)) : DASH, avgDays(xs.map(x => x.d)), xs.length ? `${Math.min(...xs.map(x => x.d))}–${Math.max(...xs.map(x => x.d))} dana` : DASH];
    const years = distinct(A.map(x => x.y)).sort();
    const rows = years.map(y => row(`Primljeni ${y}. godine`, A.filter(x => x.y === y)));
    if (A.length) rows.push(row('Ukupno aktivnih predmeta', A));
    for (const y of years.slice(0, -1)) rows.push(row(`Zaključno sa ${y}. godinom`, A.filter(x => x.y <= y)));
    rows.push(row('Stariji od 5 godina', A.filter(x => x.d > 5 * 365.25)), row('Stariji od 8 godina', A.filter(x => x.d > 8 * 365.25)));
    return table(`${title} (stanje na dan ${S.fmtDate(ref)})`, ['Kategorija', 'Broj predmeta', 'Zbir dana trajanja', 'Prosječno trajanje', 'Raspon'], A.length ? rows : [],
      'Aktivni predmet = nije upisan datum pravosnažnosti. Trajanje = od prijema optužnog akta u sud do izabranog datuma.');
  }
  function spanDist(title, cases, a, b, edges) {
    const v = cases.filter(c => isDate(c[a]) && isDate(c[b])).map(c => days(c[a], c[b]));
    const rows = []; let lo = null;
    for (const hi of edges) { const n = v.filter(x => (lo === null || x > lo) && x <= hi).length; rows.push([lo === null ? `Do ${hi} dana` : `Od ${lo + 1} do ${hi} dana`, n, pct(n, v.length)]); lo = hi; }
    const n = v.filter(x => x > lo).length; rows.push([`Više od ${lo} dana`, n, pct(n, v.length)], ['Ukupno', v.length, v.length ? '100%' : DASH], ['Prosjek', avgDays(v), '']);
    return table(title, ['Rok', 'Broj predmeta', 'Procenat'], v.length ? rows : []);
  }
  function firstPhase(title, cases, ix) {
    const rows = []; const C = { istraga: 0, gp: 0, presuda: 0 };
    for (const c of cases) {
      const ts = ix.pritvori(c._id).map(t => t.Datumodre_x0111_ivanjapritvora).filter(isDate).sort(); if (!ts.length) continue;
      const f = ts[0], pod = c.Datumpodizanjaoptu_x017e_nice, p1 = (ix.presuda1(c._id)[0] || {}).Datumobjavljivanjapresude;
      if (isDate(pod) && lt(f, pod)) C.istraga++; else if (!isDate(p1) || le(f, p1)) C.gp++; else C.presuda++;
    }
    const tot = C.istraga + C.gp + C.presuda;
    return table(title, ['Faza', 'Broj predmeta', 'Procenat'], tot ? [['Istraga', C.istraga, pct(C.istraga, tot)], ['Nakon podizanja optužnog akta (glavni pretres)', C.gp, pct(C.gp, tot)], ['Nakon izricanja presude', C.presuda, pct(C.presuda, tot)], ['Ukupno', tot, '100%']] : []);
  }
  function supervision(cases, ix, groupLbl, groupOf) {
    const N = (ix.nadzor ? cases.flatMap(c => ix.nadzor(c._id).map(n => ({ t: { mjereNadzora: n.mjere || [], osnov: n.osnov || [], umjesto: n.umjestoPritvora === true }, c }))) : [])
      .concat(cases.flatMap(c => ix.pritvori(c._id).filter(t => Array.isArray(t.mjereNadzora) && t.mjereNadzora.length).map(t => ({ t: { mjereNadzora: t.mjereNadzora, osnov: [], umjesto: t.Pritvorjezamijenjenmjeromnadzora === true }, c }))));
    const T = N.filter(x => x.t.mjereNadzora.length);
    const kinds = distinct(T.flatMap(x => x.t.mjereNadzora));
    const caseIds = distinct(T.map(x => x.c._id)), perCase = id => distinct(T.filter(x => x.c._id === id).flatMap(x => x.t.mjereNadzora));
    const osn = distinct(T.flatMap(x => x.t.osnov));
    const pregled = kv('Mjere nadzora – pregled', T.length ? [
      ['Broj predmeta u kojima je izrečena mjera nadzora', caseIds.length], ['Broj lica kojima je izrečena mjera nadzora', T.length],
      ['Broj predmeta u kojima su kombinovane dvije ili više mjera nadzora', caseIds.filter(id => perCase(id).length > 1).length],
      ['Broj lica kojima su mjere nadzora određene umjesto pritvora', T.filter(x => x.t.umjesto).length],
      ...kinds.map(k => [`Broj predmeta – ${k.toLowerCase()}`, caseIds.filter(id => perCase(id).includes(k)).length]),
      ...osn.map(o => [`Osnov mjere nadzora – ${o.toLowerCase()} (broj predmeta)`, distinct(T.filter(x => x.t.osnov.includes(o)).map(x => x.c._id)).length])] : []);
    const groups = distinct(T.map(x => groupOf(x.c) || 'Nije navedeno'));
    return [pregled, table('Struktura izrečenih mjera nadzora prema vrsti mjere', ['Mjera nadzora', 'Broj lica', 'Procenat'], kinds.map(k => { const n = T.filter(x => x.t.mjereNadzora.includes(k)).length; return [k, n, pct(n, T.length)]; }),
        'Lice kome je izrečeno više mjera broji se kod svake mjere; procenat je u odnosu na broj lica sa mjerom nadzora.'),
      table(`Struktura izrečenih mjera nadzora prema ${groupLbl}`, [groupLbl.charAt(0).toUpperCase() + groupLbl.slice(1), 'Broj lica sa mjerom nadzora', 'Procenat'],
        T.length ? [...groups.map(g => { const n = T.filter(x => (groupOf(x.c) || 'Nije navedeno') === g).length; return [g, n, pct(n, T.length)]; }), ['Ukupno', T.length, '100%']] : [])];
  }

  function osnoviCombos(T) {
    const o = t => Array.isArray(t.Osnovodre_x0111_ivanjapritvora) ? t.Osnovodre_x0111_ivanjapritvora : [];
    const M = T.filter(t => o(t).length > 1);
    const rows = [...by(M, t => [...o(t)].sort((a, b) => a.localeCompare(b)).join(' + ')).entries()].map(([k, v]) => [k, v.length, pct(v.length, M.length)]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (rows.length) rows.push(['Ukupno', M.length, '100%']);
    const each = distinct(M.flatMap(o)).map(x => { const n = M.filter(t => o(t).includes(x)).length; return [x, n, pct(n, M.length)]; });
    return [table('Struktura i učestalost određivanja pritvora po više pritvorskih osnova', ['Pritvorski osnovi', 'Broj rješenja', 'Procenat'], rows),
      table('Koliko se puta svaki osnov pojavljuje kada je pritvor određen po više osnova', ['Pritvorski osnov', 'Broj', 'Procenat'], each)];
  }
  function phases(t, c, pres1) {
    const od = t.Datumodre_x0111_ivanjapritvora, uk = t.Datumukidanjapritvora, podiz = c.Datumpodizanjaoptu_x017e_nice, prav = c.Odlaganjero_x010d_i_x0161_ta;
    const end = isDate(uk) ? uk : (isDate(prav) ? prav : null);
    const out = { ukupno: isDate(od) && end ? days(od, end) : null, zadrz: isDate(t.zadrzavanjeDatum) && isDate(od) ? days(t.zadrzavanjeDatum, od) : null };
    out.uIstrazi = isDate(od) && isDate(podiz) && lt(od, podiz);
    if (out.uIstrazi) { const e = t.Fazapostupkaukojojjepritvorukinu === 'Faza istrage' && isDate(uk) ? uk : podiz; out.istraga = days(od, e); }
    if (isDate(podiz) && isDate(od) && (!isDate(uk) || le(podiz, uk))) {
      const s = lt(od, podiz) ? podiz : od; const e = isDate(uk) ? (isDate(pres1) && lt(pres1, uk) ? pres1 : uk) : (pres1 || null);
      if (isDate(e) && le(s, e)) out.gp = days(s, e);
    }
    out.nakonPresude = isDate(pres1) && isDate(od) && (lt(pres1, od) || t.nakonPresude === true);
    return out;
  }
  function detentionIndicators(osnovi) {
    const T = (cs, ix) => cs.flatMap(c => ix.pritvori(c._id).map(t => ({ t, c, ph: phases(t, c, (ix.presuda1(c._id)[0] || {}).Datumobjavljivanjapresude) })));
    const cases = (cs, ix, f) => distinct(T(cs, ix).filter(f).map(x => x.c._id)).length;
    const kraj = x => { const t = new Date(x.t.Datumodre_x0111_ivanjapritvora + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + x.ph.istraga); return t.toISOString().slice(0, 10); };
    const o = x => Array.isArray(x.t.Osnovodre_x0111_ivanjapritvora) ? x.t.Osnovodre_x0111_ivanjapritvora : [];
    const bucket = (key, lo, hi) => (cs, ix) => cases(cs, ix, x => x.ph[key] !== undefined && x.ph[key] !== null && (lo === null || x.ph[key] > lo) && (hi === null || x.ph[key] <= hi));
    return [
      ['Broj analiziranih pritvorskih predmeta', (cs, ix) => cases(cs, ix, () => true)],
      ['Broj lica u pritvoru', (cs, ix) => T(cs, ix).length],
      ['Broj predmeta u kojima je određeno zadržavanje', (cs, ix) => cases(cs, ix, x => x.t.zadrzavanje === true)],
      ['Prosječno trajanje zadržavanja (dana)', (cs, ix) => avgD(T(cs, ix).map(x => x.ph.zadrz))],
      ['Broj pritvorskih predmeta u kojima je određen pritvor u istrazi', (cs, ix) => cases(cs, ix, x => x.ph.uIstrazi)],
      ['Broj predmeta u kojima je pritvor u istrazi produžen', (cs, ix) => cases(cs, ix, x => x.t.produzenIstraga === true)],
      ['Broj predmeta u kojima je ukinut pritvor u istrazi', (cs, ix) => cases(cs, ix, x => x.t.Fazapostupkaukojojjepritvorukinu === 'Faza istrage')],
      ['Ukupno trajanje pritvora u istrazi (dana)', (cs, ix) => sumD(T(cs, ix).map(x => x.ph.istraga))],
      ['Prosječno trajanje pritvora u istrazi (dana)', (cs, ix) => avgD(T(cs, ix).map(x => x.ph.istraga))],
      ['Br. predmeta u kojima je pritvor u istrazi trajao do 30 dana', bucket('istraga', null, 30)],
      ['Br. predmeta u kojima je pritvor u istrazi trajao od 30 do 60 dana', bucket('istraga', 30, 60)],
      ['Br. predmeta u kojima je pritvor u istrazi trajao preko 60 dana', bucket('istraga', 60, null)],
      ['Br. predmeta u kojima je pritvor u istrazi trajao duže od 3 mjeseca (najduže trajanje za djela do 5 godina zatvora, čl. 177 st. 1–2)' + NOVI, (cs, ix) => cases(cs, ix, x => S.noviZKP(x.c) && x.ph.uIstrazi && x.ph.istraga !== undefined && S.addMonths(x.t.Datumodre_x0111_ivanjapritvora, 3) < kraj(x))],
      ['Br. predmeta u kojima je pritvor u istrazi trajao duže od 6 mjeseci (apsolutni maksimum, čl. 177 st. 3)' + NOVI, (cs, ix) => cases(cs, ix, x => S.noviZKP(x.c) && x.ph.uIstrazi && x.ph.istraga !== undefined && S.addMonths(x.t.Datumodre_x0111_ivanjapritvora, 6) < kraj(x))],
      ['Br. predmeta sa optužnim predlogom u kojima je pritvor prije podnošenja optužnog predloga trajao duže od 30 dana (čl. 448 st. 2)' + NOVI, (cs, ix) => cases(cs, ix, x => S.noviZKP(x.c) && x.c.Vrstaoptu_x017e_nogakta === 'Optužni predlog' && x.ph.uIstrazi && x.ph.istraga > 30)],
      ['Broj predmeta u kojima je pritvor određen/produžen nakon podizanja optužnog akta', (cs, ix) => cases(cs, ix, x => x.t.nakonOptuznog === true || x.ph.gp !== undefined)],
      ['Br. predmeta u kojima je pritvor u toku glavnog pretresa trajao do 30 dana', bucket('gp', null, 30)],
      ['Br. predmeta u kojima je pritvor u toku glavnog pretresa trajao od 30 do 60 dana', bucket('gp', 30, 60)],
      ['Br. predmeta u kojima je pritvor u toku glavnog pretresa trajao od 60 do 120 dana', bucket('gp', 60, 120)],
      ['Br. predmeta u kojima je pritvor u toku glavnog pretresa trajao preko 120 dana', bucket('gp', 120, null)],
      ['Prosječno trajanje pritvora nakon podizanja optužnog akta (dana)', (cs, ix) => avgD(T(cs, ix).map(x => x.ph.gp))],
      ['Broj predmeta u kojima je pritvor ukinut nakon podizanja optužnog akta (u fazi suđenja)', (cs, ix) => cases(cs, ix, x => ['Faza suđenja', 'Nakon podizanja optužnice'].includes(x.t.Fazapostupkaukojojjepritvorukinu))],
      ['Broj predmeta u kojima je pritvor produžen nakon izricanja presude', (cs, ix) => cases(cs, ix, x => x.ph.nakonPresude)],
      ['Broj predmeta u kojima je pritvor ukinut nakon presude', (cs, ix) => cases(cs, ix, x => x.t.Fazapostupkaukojojjepritvorukinu === 'Nakon presude')],
      ['Broj predmeta u kojima je pritvor trajao do pravosnažnosti presude', (cs, ix) => cases(cs, ix, x => x.t.Pritvorjetrajaodopravosna_x017e_ === true || (!isDate(x.t.Datumukidanjapritvora) && isDate(x.c.Odlaganjero_x010d_i_x0161_ta)))],
      ['Broj predmeta u kojima je lice tražilo upućivanje na izdržavanje kazne prije pravosnažnosti', (cs, ix) => cases(cs, ix, x => x.t.trazioUpucivanje === true)],
      ['Broj predmeta u kojima je optuženi izdržao kaznu u pritvoru', (cs, ix) => cases(cs, ix, x => x.t.izdrzaoUPritvoru === true)],
      ['Ukupno trajanje pritvora (dana)', (cs, ix) => sumD(T(cs, ix).map(x => x.ph.ukupno))],
      ['Prosječno trajanje pritvora (dana)', (cs, ix) => avgD(T(cs, ix).map(x => x.ph.ukupno))],
      ...osnovi.map(os => [`Osnov pritvora: ${os.toLowerCase()} (jedini osnov)`, (cs, ix) => T(cs, ix).filter(x => o(x).length === 1 && o(x)[0] === os).length]),
      ['Osnov pritvora: više pritvorskih osnova', (cs, ix) => T(cs, ix).filter(x => o(x).length > 1).length],
      ['Br. obrazloženih rješenja o pritvoru', (cs, ix) => T(cs, ix).filter(x => x.t.obrazlozenost === 'Obrazložen').length],
      ['Br. djelimično obrazloženih rješenja o pritvoru', (cs, ix) => T(cs, ix).filter(x => x.t.obrazlozenost === 'Djelimično obrazložen').length],
      ['Br. neobrazloženih rješenja o pritvoru', (cs, ix) => T(cs, ix).filter(x => x.t.obrazlozenost === 'Neobrazložen').length],
      ...['Obrazložen', 'Djelimično obrazložen', 'Neobrazložen'].map(ob => [`Rješenja (${ob.toLowerCase()}) – opasnost od bjekstva`, (cs, ix) => T(cs, ix).filter(x => x.t.obrazlozenost === ob && o(x).includes('Opasnost od bjekstva')).length]),
      ['Broj slučajeva u kojima osnov koji je sud prihvatio nije isti kao predloženi', (cs, ix) => T(cs, ix).filter(x => Array.isArray(x.t.osnovDT) && x.t.osnovDT.length && JSON.stringify([...x.t.osnovDT].sort()) !== JSON.stringify([...o(x)].sort())).length],
    ];
  }
  function demographics(title, cs, ix) {
    const T = cs.flatMap(c => ix.pritvori(c._id));
    const rows = [];
    const dist = (lbl, f) => { const g = [...by(T.filter(t => !blank(f(t))), f).entries()].sort((a, b) => b[1].length - a[1].length); for (const [k, v] of g) rows.push([`${lbl}: ${k}`, v.length, pct(v.length, T.length)]); };
    dist('Pol', t => t.pol); dist('Obrazovanje', t => t.obrazovanje);
    rows.push(['Ranije osuđivani', T.filter(t => t.ranijaOsudjivanost === true).length, pct(T.filter(t => t.ranijaOsudjivanost === true).length, T.length)]);
    const age = T.filter(t => t.godinaRodjenja && isDate(t.Datumodre_x0111_ivanjapritvora)).map(t => Number(t.Datumodre_x0111_ivanjapritvora.slice(0, 4)) - t.godinaRodjenja);
    if (age.length) rows.push(['Prosječna starost u vrijeme određivanja pritvora (godina)', avg(age), '']);
    dist('Državljanstvo', t => (t.drzavljanstvo || '').trim().toUpperCase() === 'CG' ? 'CG' : t.drzavljanstvo);
    return table(title, ['Pokazatelj', 'Broj lica', 'Procenat'], T.length ? rows : []);
  }

  const PARTIES = [['optuženog', [101, 201, 301], 101], ['tužioca', [102, 202, 302], 102], ['oštećenog', [103, 203, 303], 103], ['svjedoka', [104, 204, 304], 104],
    ['vještaka', [105, 205, 305], 105], ['branioca', [107, 207, 307], 107], ['sudije', [401], null]];
  const OTHER = [['privremene duševne poremećenosti okrivljenog', [701]], ['pribavljanja novih dokaza', [501]], ['nedostatka tehničkih uslova', [402]], ['zahtjeva advokata', [601]],
    ['nedostavljanja nalaza drugih državnih organa', [502, 503]]];
  const code = o => parseInt(String(o.Razlogodlaganja || '').slice(0, 3), 10);
  const KNOWN = new Set([...PARTIES.flatMap(p => p[1]), ...OTHER.flatMap(o => o[1])]);
  const hist = (c, k) => Number((c._razloziAS || {})[k] || 0);
  function sviTopics() {
    const isOP = c => c.Vrstaoptu_x017e_nogakta === 'Optužni predlog', isOpt = c => c.Vrstaoptu_x017e_nogakta === 'Optužnica';
    const D = (a, b) => c => isDate(c[a]) && isDate(c[b]) ? days(c[a], c[b]) : null;
    const prij2kontr = D('Datumprijemaoptu_x017e_niceusud', 'Datumro_x010d_i_x0161_tazakontro'), kontr2potv = D('Datumro_x010d_i_x0161_tazakontro', 'Datumrje_x0161_enjaopotvr_x0111_');
    const potv2nar = D('Datumrje_x0161_enjaopotvr_x0111_', 'Datumnaredbezaodr_x017e_avanjegl'), podiz2nar = D('Datumpodizanjaoptu_x017e_nice', 'Datumnaredbezaodr_x017e_avanjegl');
    const trajanje = D('Datumpodizanjaoptu_x017e_nice', 'Odlaganjero_x010d_i_x0161_ta');
    const withBoth = (cs, f) => cs.map(f).filter(x => x !== null);
    const twice = (title, ind, cases, ix, info) => [courtTable(`${title} – svi predmeti`, cases, ind, ix, info), courtTable(`${title} – pritvorski predmeti`, cases.filter(P), ind, ix, info)];
    const odlDur = o => isDate(o.Odlo_x017e_enood) && isDate(o.Odlo_x017e_enodo) ? days(o.Odlo_x017e_enood, o.Odlo_x017e_enodo) : null;
    const dost = p => { const ds = [p.dostavaStrankama, p.Datumdostavljanjapisanogotpravka, p.Datumdostavljanjapisanogotpravka0, p.Datumdostavljanjapisanogotpravka1].filter(isDate).sort();
      return isDate(p.Datumobjavljivanjapresude) && ds.length ? days(p.Datumobjavljivanjapresude, ds[ds.length - 1]) : null; };
    return [
      { key: 'osnovni', title: 'Osnovni podaci', fn: (d, ix) => [courtTable('Analizirani predmeti', d.predmeti, [
        ['Broj analiziranih predmeta', cs => cs.length], ['Broj analiziranih pritvorskih predmeta', cs => cnt(cs, P)], ['% analiziranih pritvorskih predmeta', cs => pctN(cnt(cs, P), cs.length)],
        ['Broj optužnih predloga', cs => cnt(cs, isOP)], ['Broj optužnica', cs => cnt(cs, isOpt)], ['Broj predmeta sa zaključenim sporazumom o priznanju krivice', cs => cnt(cs, c => c.sporazum === true)],
        ['Prosječno trajanje postupka, od podizanja optužnog akta do pravosnažnosti presude', cs => avgD(withBoth(cs, trajanje))],
        ['… u nepritvorskim predmetima', cs => avgD(withBoth(cs.filter(c => !P(c)), trajanje))], ['… u pritvorskim predmetima', cs => avgD(withBoth(cs.filter(P), trajanje))],
        ['Broj predmeta u kojima je podnesen vanredni pravni lijek', (cs, ix) => cnt(cs, c => ix.vpl(c._id).length > 0)],
        ['Broj predmeta vraćenih na ponovno suđenje', (cs, ix) => cnt(cs, c => ix.faze(c._id).length > 0)], ['Ukupan broj ponovljenih suđenja', (cs, ix) => sum(cs.map(c => ix.faze(c._id).length))],
      ], ix, 'Trajanje u danima.'), activeCases('Aktivni predmeti prema godini prijema', d.predmeti, d._refDate)] },
      { key: 'kontrola', title: 'Kontrola optužnice', fn: (d, ix) => twice('Kontrola optužnice', [
        ['Broj optužnica', cs => cnt(cs, isOpt)],
        ['Prosječno vrijeme za zakazivanje ročišta za kontrolu optužnice (od prijema optužnice)', cs => avgD(withBoth(cs.filter(isOpt), prij2kontr))],
        ['Prosječno vrijeme za potvrđivanje optužnice (od ročišta za kontrolu)', cs => avgD(withBoth(cs.filter(isOpt), kontr2potv))],
        ['Broj ročišta za kontrolu optužnice na kojima je prisustvovao tužilac', cs => cnt(cs, c => isOpt(c) && c.koTuzilac === true)],
        ['Broj ročišta za kontrolu optužnice na kojima je prisustvovao okrivljeni', cs => cnt(cs, c => isOpt(c) && c.koOkrivljeni === true)],
        ['Broj ročišta za kontrolu optužnice na kojima je prisustvovao branilac', cs => cnt(cs, c => isOpt(c) && c.koBranilac === true)],
        ['Prosječno vrijeme za zakazivanje glavnog pretresa nakon potvrđivanja optužnice', cs => avgD(withBoth(cs.filter(isOpt), potv2nar))],
        ['Broj predmeta u kojima je to vrijeme iznosilo do dva mjeseca', cs => cs.filter(c => isOpt(c) && potv2nar(c) !== null && !gpKasni(c)).length],
        ['Procenat predmeta – do dva mjeseca', cs => { const v = cs.filter(c => isOpt(c) && potv2nar(c) !== null); return pctN(v.filter(c => !gpKasni(c)).length, v.length); }],
        ['Broj predmeta u kojima je to vrijeme iznosilo više od dva mjeseca (čl. 304 st. 2)', cs => cs.filter(c => isOpt(c) && gpKasni(c)).length],
        ['Procenat predmeta – više od dva mjeseca', cs => { const v = cs.filter(c => isOpt(c) && potv2nar(c) !== null); return pctN(v.filter(gpKasni).length, v.length); }],
        ['Broj optužnica kontrolisanih bez ročišta (pisano izjašnjenje, čl. 293 st. 3)' + NOVI, cs => cnt(cs, c => isOpt(c) && bezRocista(c))],
        ['Broj optužnica potvrđenih nakon roka od 8, odnosno 15 dana u složenim predmetima (čl. 296 st. 1)' + NOVI, cs => cnt(cs, c => isOpt(c) && potvrdaKasni(c))],
      ], d.predmeti, ix, 'Vrijeme u danima. Zakazivanje glavnog pretresa = od rješenja o potvrđivanju do naredbe za održavanje glavnog pretresa.').concat([
        spanDist('Optužnice prema roku u kojem je zakazana kontrola optužnice (od prijema)', d.predmeti.filter(isOpt), 'Datumprijemaoptu_x017e_niceusud', 'Datumro_x010d_i_x0161_tazakontro', [15, 30, 60]),
        spanDist('Optužnice prema roku u kojem je doneseno rješenje o potvrđivanju (od kontrole)', d.predmeti.filter(isOpt), 'Datumro_x010d_i_x0161_tazakontro', 'Datumrje_x0161_enjaopotvr_x0111_', [8, 15, 30]),
        spanDist('Optužnice prema roku u kojem je zakazan glavni pretres (od potvrđivanja)', d.predmeti.filter(isOpt), 'Datumrje_x0161_enjaopotvr_x0111_', 'Datumnaredbezaodr_x017e_avanjegl', [30, 60, 120])]) },
      { key: 'predlog', title: 'Optužni predlog', fn: (d, ix) => twice('Optužni predlog', [
        ['Broj optužnih predloga', cs => cnt(cs, isOP)],
        ['Broj predmeta u kojima je rok za određivanje glavnog pretresa iznosio do 30 dana', cs => withBoth(cs.filter(isOP), podiz2nar).filter(x => x <= 30).length],
        ['Procenat – do 30 dana', cs => { const v = withBoth(cs.filter(isOP), podiz2nar); return pctN(v.filter(x => x <= 30).length, v.length); }],
        ['Broj predmeta u kojima je rok za određivanje glavnog pretresa iznosio više od 30 dana', cs => withBoth(cs.filter(isOP), podiz2nar).filter(x => x > 30).length],
        ['Procenat – više od 30 dana', cs => { const v = withBoth(cs.filter(isOP), podiz2nar); return pctN(v.filter(x => x > 30).length, v.length); }],
        ['Broj nepritvorskih predmeta u kojima je rok iznosio više od 30 dana', cs => withBoth(cs.filter(c => isOP(c) && !P(c)), podiz2nar).filter(x => x > 30).length],
        ['Prosječno vrijeme za zakazivanje glavnog pretresa nakon podizanja optužnog predloga', cs => avgD(withBoth(cs.filter(isOP), podiz2nar))],
        ['… u nepritvorskim predmetima', cs => avgD(withBoth(cs.filter(c => isOP(c) && !P(c)), podiz2nar))],
      ], d.predmeti, ix, 'Rok = od podizanja optužnog predloga do naredbe za održavanje glavnog pretresa, u danima.') },
      { key: 'odlaganja', title: 'Odlaganje ročišta', fn: (d, ix) => {
        const ind = [
          ['Ukupan broj ročišta', cs => sum(cs.map(c => (c.Brojodr_x017e_anihro_x010d_i_x01 || 0) + (c.Brojodlo_x017e_enihro_x010d_i_x0 || 0)))],
          ['Broj održanih ročišta', cs => sum(cs.map(c => c.Brojodr_x017e_anihro_x010d_i_x01))], ['Broj odloženih ročišta', cs => sum(cs.map(c => c.Brojodlo_x017e_enihro_x010d_i_x0))],
          ['% održanih ročišta', cs => { const a = sum(cs.map(c => c.Brojodr_x017e_anihro_x010d_i_x01)), b = sum(cs.map(c => c.Brojodlo_x017e_enihro_x010d_i_x0)); return pctN(a, a + b); }],
          ['% odloženih ročišta', cs => { const a = sum(cs.map(c => c.Brojodr_x017e_anihro_x010d_i_x01)), b = sum(cs.map(c => c.Brojodlo_x017e_enihro_x010d_i_x0)); return pctN(b, a + b); }],
          ['Trajanje odlaganja u danima (ukupno)', (cs, ix) => sumD(cs.flatMap(c => ix.odlaganja(c._id).map(odlDur)))],
          ['Prosječno trajanje odlaganja u danima', (cs, ix) => avgD(cs.flatMap(c => ix.odlaganja(c._id).map(odlDur)))],
        ];
        const razl = [];
        for (const [who, codes, neur] of PARTIES) {
          const k = who;
          razl.push([`Broj predmeta u kojima je došlo do odlaganja zbog odsustva ${who}`, (cs, ix) => cnt(cs, c => ix.odlaganja(c._id).some(o => codes.includes(code(o))) || hist(c, 'ods:' + k) > 0)]);
          razl.push([`Broj odloženih ročišta zbog odsustva ${who}`, (cs, ix) => sum(cs.map(c => ix.odlaganja(c._id).filter(o => codes.includes(code(o))).length + hist(c, 'ods:' + k)))]);
          if (neur) razl.push([`Broj neuredno dostavljenih poziva (${who})`, (cs, ix) => sum(cs.map(c => ix.odlaganja(c._id).filter(o => code(o) === neur).length + hist(c, 'neur:' + k)))]);
        }
        for (const [what, codes] of OTHER) {
          razl.push([`Broj predmeta – odlaganje zbog ${what}`, (cs, ix) => cnt(cs, c => ix.odlaganja(c._id).some(o => codes.includes(code(o))) || hist(c, what) > 0)]);
          razl.push([`Broj odloženih ročišta zbog ${what}`, (cs, ix) => sum(cs.map(c => ix.odlaganja(c._id).filter(o => codes.includes(code(o))).length + hist(c, what)))]);
        }
        razl.push(['Broj predmeta – odlaganje zbog drugih smetnji', (cs, ix) => cnt(cs, c => ix.odlaganja(c._id).some(o => o.Razlogodlaganja && !KNOWN.has(code(o))) || hist(c, 'druge') > 0)]);
        razl.push(['Broj odloženih ročišta zbog drugih smetnji', (cs, ix) => sum(cs.map(c => ix.odlaganja(c._id).filter(o => o.Razlogodlaganja && !KNOWN.has(code(o))).length + hist(c, 'druge')))]);
        const reasons = distinct(d.odlaganja.map(o => o.Razlogodlaganja).filter(Boolean)).sort((a, b) => sortReason([a], [b]));
        const byReason = reasons.map(r => [r, (cs, ix) => sum(cs.map(c => ix.odlaganja(c._id).filter(o => o.Razlogodlaganja === r).length))]);
        return [...twice('Održana i odložena ročišta', ind, d.predmeti, ix, 'Broj ročišta prema podacima o predmetu; trajanje prema unesenim odlaganjima.'),
          ...twice('Razlozi odlaganja ročišta', razl, d.predmeti, ix, 'Za predmete uvezene iz AppSheeta uračunati su i zbirni razlozi upisani tamo.'),
          courtTable('Odlaganja prema šifarniku razloga', d.predmeti, byReason, ix)];
      } },
      { key: 'mjere', title: 'Procesne mjere discipline', fn: (d, ix) => {
        const M = (cs, ix) => cs.flatMap(c => ix.mjere(c._id));
        const dov = (u) => (cs, ix) => M(cs, ix).filter(m => m.Mjera === 'Prinudno dovođenje' && (!u || m.U_x010d_esnik === u)).length;
        return twice('Procesne mjere discipline', [
          ['Broj predmeta u kojima je sud preduzeo procesne mjere discipline', (cs, ix) => cnt(cs, c => ix.mjere(c._id).length > 0)],
          ['Broj predmeta u kojima je sud izrekao novčanu kaznu', (cs, ix) => cnt(cs, c => ix.mjere(c._id).some(m => m.Mjera === 'Novčana kazna'))],
          ['Vrijednost novčanih kazni (€)', (cs, ix) => sum(M(cs, ix).filter(m => m.Mjera === 'Novčana kazna').map(m => m.Nov_x010d_anakazna))],
          ['Broj predmeta u kojima je sud donio naredbu za prinudno dovođenje', (cs, ix) => cnt(cs, c => ix.mjere(c._id).some(m => m.Mjera === 'Prinudno dovođenje'))],
          ['Broj naredbi za prinudno dovođenje', dov()], ['… optuženog', dov('Optuženi')], ['… svjedoka', dov('Svjedok')], ['… vještaka', dov('Vještak')],
          ['Broj slučajeva u kojima Uprava policije nije postupila po naredbi', (cs, ix) => M(cs, ix).filter(m => m.Upravapolicijenijepostupilaponar === true).length],
          ['Broj slučajeva u kojima policija nije obavijestila sud o razlozima nepostupanja', (cs, ix) => M(cs, ix).filter(m => m.Upravapolicijenijeobavijestilasu === true).length],
          ['Broj predmeta u kojima je sud raspisao potjernicu', (cs, ix) => cnt(cs, c => ix.mjere(c._id).some(m => /potjernica/i.test(m.Mjera || '')))],
        ], d.predmeti, ix);
      } },
      { key: 'presuda', title: 'Pravo na javno izricanje presude', fn: (d, ix) => {
        const pr = (cs, ix) => cs.map(c => ix.presuda1(c._id)[0]).filter(Boolean);
        const zo = p => isDate(p.Datumzavr_x0161_etkaglavnogpretr) && isDate(p.Datumobjavljivanjapresude) ? days(p.Datumzavr_x0161_etkaglavnogpretr, p.Datumobjavljivanjapresude) : null;
        const b = (lo, hi) => (cs, ix) => pr(cs, ix).map(dost).filter(x => x !== null && (lo === null || x > lo) && (hi === null || x <= hi)).length;
        const bp = (lo, hi) => (cs, ix) => pctN(b(lo, hi)(cs, ix), pr(cs, ix).map(dost).filter(x => x !== null).length);
        const ind = [['Broj analiziranih predmeta (sa podacima o presudi)', (cs, ix) => pr(cs, ix).length],
          ['Broj predmeta u kojima je od objavljivanja presude do dostavljanja prošlo do mjesec dana', b(null, 30)], ['Procenat – do mjesec dana', bp(null, 30)],
          ['Broj predmeta – više od mjesec i manje od dva mjeseca', b(30, 60)], ['Procenat – od mjesec do dva mjeseca', bp(30, 60)],
          ['Broj predmeta – više od dva mjeseca', b(60, null)], ['Procenat – više od dva mjeseca', bp(60, null)],
          ['Prosječno vrijeme od završetka glavnog pretresa do objavljivanja presude (dana)', (cs, ix) => avgD(pr(cs, ix).map(zo))],
          ['Broj presuda koje nisu objavljene u roku od 8, odnosno 15 dana u složenim predmetima (čl. 375 st. 1)' + NOVI, (cs, ix) => cs.filter(c => ix.presuda1(c._id)[0] && objavaKasni(ix.presuda1(c._id)[0], c)).length],
          ['Broj presuda dostavljenih nakon roka od mjesec dana, odnosno 4 mjeseca u složenim stvarima (čl. 378 st. 1)' + NOVI, (cs, ix) => cs.filter(c => ix.presuda1(c._id)[0] && izradaKasni(ix.presuda1(c._id)[0], c)).length],
          ['Prosječno vrijeme od objavljivanja presude do dostavljanja strankama (dana)', (cs, ix) => avgD(pr(cs, ix).map(dost))]];
        const indP = [['Broj pritvorskih predmeta u kojima je pritvor produžen nakon presude', (cs, ix) => cnt(cs, c => ix.pritvori(c._id).some(t => t.nakonPresude === true))], ...ind,
          ['Prosječno vrijeme do dostavljanja u predmetima u kojima je pritvor određen/produžen nakon presude', (cs, ix) => avgD(pr(cs.filter(c => ix.pritvori(c._id).some(t => t.nakonPresude === true)), ix).map(dost))]];
        return [courtTable('Javno izricanje presude – svi predmeti', d.predmeti, ind, ix, 'Dostavljanje = posljednji upisani datum dostavljanja (strankama ili pojedinačno).'),
          courtTable('Javno izricanje presude – pritvorski predmeti', d.predmeti.filter(P), indP, ix)];
      } },
      { key: 'zalba', title: 'Drugostepeni postupak', fn: (d, ix) => {
        const Z = (cs, ix) => cs.flatMap(c => ix.zalba(c._id));
        const dur = z => isDate(z.Datumpodno_x0161_enja_x017e_albe) && isDate(z.Datumdono_x0161_enjadrugostepene) ? days(z.Datumpodno_x0161_enja_x017e_albe, z.Datumdono_x0161_enjadrugostepene) : null;
        const od = v => (cs, ix) => Z(cs, ix).filter(z => z.Odlukaudrugostepenompostupku === v).length;
        const ind = [['Broj analiziranih predmeta u kojima je podnesena žalba', (cs, ix) => cnt(cs, c => ix.zalba(c._id).length > 0)],
          ['Prosječan broj dana od podnošenja žalbe do odlučivanja po žalbi', (cs, ix) => avgD(Z(cs, ix).map(dur))],
          ['Broj odbačenih žalbi', od('Žalba se odbacuje')], ['Broj odbijenih žalbi', od('Žalba se odbija')], ['Broj ukinutih presuda', od('Presuda se ukida')], ['Broj predmeta u kojima je presuda ukinuta više puta', (cs, ix) => cnt(cs, c => ix.zalba(c._id).filter(z => /ukida/i.test(z.Odlukaudrugostepenompostupku || '')).length > 1)], ['Broj preinačenih presuda', od('Presuda se preinačuje')]];
        return [courtTable('Drugostepeni postupak – svi predmeti', d.predmeti, ind, ix),
          courtTable('Drugostepeni postupak – pritvorski predmeti u kojima je pritvor određen/produžen nakon presude', d.predmeti.filter(c => P(c) && ix.pritvori(c._id).some(t => t.nakonPresude === true)), ind, ix)];
      } },
      { key: 'pritvor', title: 'Pritvor', fn: (d, ix) => [courtTable('Pritvor', d.predmeti.filter(c => ix.pritvori(c._id).length), detentionIndicators(S.fallbackChoices('svi_pritvori', 'Osnovodre_x0111_ivanjapritvora')), ix,
        'Trajanje u istrazi: od određivanja do podizanja optužnog akta (ili ukidanja u istrazi). Glavni pretres: od podizanja optužnog akta do prvostepene presude (ili ukidanja). Ukupno: do ukidanja, odnosno do pravosnažnosti.'),
        ...osnoviCombos(d.predmeti.flatMap(c => ix.pritvori(c._id))),
        firstPhase('Broj predmeta prema fazi postupka u kojoj je pritvor prvi put određen', d.predmeti, ix)] },
      { key: 'nadzor', title: 'Mjere nadzora i jemstvo', fn: (d, ix) => {
        const J = (cs, ix) => cs.flatMap(c => ix.jemstva(c._id));
        const eurAvg = xs => { const a = avg(xs.filter(v => typeof v === 'number' && v > 0)); return a === null ? DASH : a; };
        const ind = [['Broj predmeta u kojima je predloženo jemstvo', (cs, ix) => cnt(cs, c => ix.jemstva(c._id).length > 0 || c.Predlo_x017e_enojemstvo === true)],
          ['Broj predmeta u kojima je jemstvo usvojeno', (cs, ix) => cnt(cs, c => ix.jemstva(c._id).some(j => j.Odlukasuda === 'Usvojeno'))],
          ['Broj predmeta u kojima je jemstvo odbijeno', (cs, ix) => cnt(cs, c => ix.jemstva(c._id).some(j => j.Odlukasuda === 'Odbijeno'))],
          ...S.fallbackChoices('svi_jemstva', 'predlagac').map(p => [`Jemstvo predložio: ${p.toLowerCase()}`, (cs, ix) => J(cs, ix).filter(j => j.predlagac === p).length]),
          ['Prosječna vrijednost prihvaćenog jemstva (€)', (cs, ix) => eurAvg(J(cs, ix).map(j => j.Vrijednostprihva_x0107_enogjemst))],
          ['Broj pritvora zamijenjenih jemstvom', (cs, ix) => cs.flatMap(c => ix.pritvori(c._id)).filter(t => t.Pritvorjezamijenjenjemstvom === true).length]];
        return [...supervision(d.predmeti, ix, 'sudu', c => c.sud), courtTable('Jemstvo', d.predmeti, ind, ix), predlagaci(d.jemstva || [])];
      } },
      { key: 'djela', title: 'Krivična djela', fn: d => krivicnaDjela(d.predmeti) },
      { key: 'tok', title: 'Tok i trajanje postupka', perCase: true, fn: (d, ix, id) => {
        const seg = new Map(d.predmeti.map(c => [c._id, procSegments(d, c)]));
        const pick = test => (cs) => avgD(cs.flatMap(c => seg.get(c._id).segs.filter(g => g.days !== null && test(g)).map(g => g.days)));
        const ind = [['Prosječno trajanje prvostepenog postupka – prvo suđenje', pick(g => g.key === '1-1')],
          ['Prosječno trajanje drugostepenog postupka – nakon prvog suđenja', pick(g => g.key === '2-1')],
          ['Broj predmeta vraćenih na ponovno suđenje', cs => cnt(cs, c => seg.get(c._id).retrials > 0)],
          ['Prosječno trajanje ponovljenog prvostepenog suđenja', pick(g => g.key.startsWith('1-') && g.key !== '1-1')],
          ['Prosječno trajanje drugostepenog postupka – nakon ponovljenog suđenja', pick(g => g.key.startsWith('2-') && g.key !== '2-1')],
          ['Prosječno ukupno trajanje – od podizanja optužnog akta do pravosnažnosti', cs => avgD(cs.map(c => seg.get(c._id).total).filter(x => x !== null))]];
        return [courtTable('Trajanje postupka po fazama – po sudovima', d.predmeti, ind, ix), ...procTimeline(d, id, true)];
      } },
    ];
  }

  function rocistaTopic() {
    return { key: 'rocista', title: 'Praćenje ročišta', fn: (d) => {
      const R = d.roc || { predmeti: [], rocista: [] };
      const ix = indexOf({ rocista: R.rocista });
      const H = (cs, ix) => cs.flatMap(c => ix.rocista(c._id));
      const odl = h => h.odrzano !== true;
      const dur = h => odl(h) && isDate(h.datum) && isDate(h.datumNarednog) ? days(h.datum, h.datumNarednog) : null;
      const half = (lbl, f) => [[lbl, f], [`${lbl} – pritvorski predmeti`, (cs, ix) => f(cs.filter(P), ix)]];
      const ind = [
        ['Broj praćenih predmeta', cs => cs.length], ['Broj pritvorskih predmeta', cs => cnt(cs, P)], ['% pritvorskih predmeta', cs => pctN(cnt(cs, P), cs.length)],
        ...half('Broj održanih ročišta', (cs, ix) => H(cs, ix).filter(h => h.odrzano === true).length),
        ...half('Broj odloženih ročišta', (cs, ix) => H(cs, ix).filter(odl).length),
        ...half('Ukupan broj ročišta', (cs, ix) => H(cs, ix).length),
        ...half('% odloženih ročišta', (cs, ix) => pctN(H(cs, ix).filter(odl).length, H(cs, ix).length)),
        ...half('Trajanje odlaganja u danima (ukupno)', (cs, ix) => sumD(H(cs, ix).map(dur))),
        ...half('Prosječno trajanje odlaganja (dana)', (cs, ix) => avgD(H(cs, ix).map(dur))),
        ['Koliko puta je sud preduzeo procesne mjere discipline', (cs, ix) => H(cs, ix).filter(h => h.mjere === true).length],
        ['Broj predmeta u kojima je sud izrekao novčanu kaznu', (cs, ix) => cnt(cs, c => ix.rocista(c._id).some(h => h.novcana === true))],
        ['Vrijednost novčanih kazni (€)', (cs, ix) => sum(H(cs, ix).map(h => h.novcana ? h.novcanaIznos : 0))],
        ...half('Broj predmeta u kojima je sud donio naredbu za prinudno dovođenje', (cs, ix) => cnt(cs, c => ix.rocista(c._id).some(h => h.dovodjenje === true))),
        ...['Optuženi', 'Oštećeni', 'Svjedok', 'Vještak'].flatMap(u => half(`Broj naredbi za prinudno dovođenje – ${u.toLowerCase()}`, (cs, ix) => sum(H(cs, ix).map(h => S.rocMjere(h).filter(m => m.vrsta === 'dovodjenje' && m.lice === u).length)))),
        ['Broj izrečenih opomena', (cs, ix) => sum(H(cs, ix).map(h => S.rocMjere(h).filter(m => m.vrsta === 'opomena').length))],
        ['Broj izrečenih novčanih kazni', (cs, ix) => sum(H(cs, ix).map(h => S.rocMjere(h).filter(m => m.vrsta === 'novcana').length))],
        ['Broj raspisanih potjernica', (cs, ix) => sum(H(cs, ix).map(h => S.rocMjere(h).filter(m => m.vrsta === 'potjernica').length))],
        ...half('Broj predmeta u kojima je sud raspisao potjernicu', (cs, ix) => cnt(cs, c => ix.rocista(c._id).some(h => h.potjernica === true))),
        ['Broj ročišta na kojima je došlo do prekida', (cs, ix) => H(cs, ix).filter(h => h.prekid === true).length],
        ['Broj ročišta na kojima sudija nosi togu', (cs, ix) => H(cs, ix).filter(h => h.togaSudija === true).length],
        ['Broj ročišta na kojima tužilac nosi togu', (cs, ix) => H(cs, ix).filter(h => h.togaTuzilac === true).length],
        ['Broj ročišta na kojima je izrečena kazna zbog odugovlačenja (čl. 251)', (cs, ix) => H(cs, ix).filter(h => h.kazna251 === true).length],
      ];
      const RR = (cs, ix) => H(cs, ix).filter(odl).map(S.rocRazlozi);
      const GEN = { 'Optuženi': 'optuženog', 'Branilac': 'branioca', 'Tužilac': 'tužioca', 'Oštećeni': 'oštećenog', 'Svjedok': 'svjedoka', 'Vještak': 'vještaka', 'Tumač': 'tumača' };
      const razl = [
        ...S.ODL_UCESNICI.flatMap(u => [[`Odloženo zbog odsustva ${GEN[u]}`, (cs, ix) => RR(cs, ix).filter(r => r.odsutni.some(o => o.ucesnik === u)).length],
          [`… od toga poziv ${GEN[u]} nije uredno dostavljen`, (cs, ix) => RR(cs, ix).filter(r => r.odsutni.some(o => o.ucesnik === u && o.dostava === 'neuredna')).length],
          [`… od toga ne može se utvrditi da li je poziv uredno dostavljen`, (cs, ix) => RR(cs, ix).filter(r => r.odsutni.some(o => o.ucesnik === u && o.dostava === 'nepoznato')).length]]),
        ['Odloženo zbog odsustva više lica', (cs, ix) => RR(cs, ix).filter(r => r.odsutni.length > 1).length],
        ...S.ODL_GRUPE.flatMap(([, rs]) => rs).map(r => [`Odloženo – ${r.charAt(0).toLowerCase() + r.slice(1)}`, (cs, ix) => RR(cs, ix).filter(x => x.ostali.includes(r)).length]),
        ['Odloženo bez upisanog razloga', (cs, ix) => RR(cs, ix).filter(x => !x.odsutni.length && !x.ostali.length).length]];
      const PRAVA = [['pravoNaOdbranu', 'Upoznavanje okrivljenog da ne mora iznositi odbranu'], ['jezikSuda', 'Pitanje o razumijevanju jezika suda'], ['neukaStranka', 'Pouka neuke stranke (čl. 14 ZKP)'],
        ['poukaOstecenog', 'Pouka oštećenog/privatnog tužioca'], ['upozorenjeSvjedoka', 'Upozorenje svjedoka o oslobođenju od dužnosti svjedočenja'], ['svjedociOdvojeno', 'Odvojeno saslušanje svjedoka'],
        ['branilacSiromasnom', 'Postavljanje branioca okrivljenom slabog imovnog stanja']];
      const prava = PRAVA.flatMap(([k, l]) => ['DA', 'NE'].map(v => [`${l}: ${v}`, (cs, ix) => H(cs, ix).filter(h => h[k] === v).length]));
      return [courtTable('Praćena ročišta', R.predmeti, ind, ix, 'Trajanje odlaganja = od datuma ročišta do datuma narednog ročišta.'),
        courtTable('Razlozi odlaganja (praćena ročišta)', R.predmeti, razl, ix), courtTable('Poštovanje procesnih prava (broj ročišta)', R.predmeti, prava, ix, 'Odgovori „N/A” se ne broje.')];
    } };
  }

  const zatvorMj = c => { const g = c.zatvorGodina, m = c.zatvorMjeseci, d = c.zatvorDana;
    if ([g, m, d].every(v => v === null || v === undefined || v === '')) return null;
    return (Number(g) || 0) * 12 + (Number(m) || 0) + (Number(d) || 0) / 30; };
  const zatvorKat = c => { const m = zatvorMj(c); if (m === null) return c.zatvorKategorija || null;
    return m <= 6 ? 'Do 6 mjeseci' : m <= 12 ? 'Od 6 mjeseci do 1 godine' : 'Preko 1 godine'; };
  const fmtTerm = mj => { const tot = Math.round(mj * 30), g = Math.floor(tot / 360), m = Math.floor((tot % 360) / 30), d = tot % 30;
    return [g ? `${g} god.` : '', m ? `${m} mj.` : '', d ? `${d} dana` : ''].filter(Boolean).join(' ') || '0 dana'; };
  function vawSanctions(cs) {
    const zat = c => /^Kazna zatvora/.test(c.glavnaSankcija || ''), kuc = c => /prostorijama za stanovanje/.test(c.glavnaSankcija || ''), uo = c => /^Uslovna osuda/.test(c.glavnaSankcija || '');
    const kat = k => c => zat(c) && zatvorKat(c) === k;
    const is = c => c.istovrsna === true, ol = c => c.olaksavajucaNepridruzivanje === true;
    const withSan = cs.filter(c => c.glavnaSankcija);
    const vrsta = [...by(withSan, c => c.glavnaSankcija).entries()].sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, v.length, pct(v.length, withSan.length)]);
    if (vrsta.length) vrsta.push(['Ukupno', withSan.length, '100%']);
    const trio = (lbl, f) => [[`Broj ${lbl}`, x => cnt(x, f)], [`Procenat ${lbl} (od svih presuda)`, x => pctN(cnt(x, f), cnt(x, c => c.glavnaSankcija))],
      [`… licima prethodno osuđivanim za istovrsna djela`, x => cnt(x, c => f(c) && is(c))], [`… u predmetima u kojima je nepridruživanje oštećene uzeto kao olakšavajuća okolnost`, x => cnt(x, c => f(c) && ol(c))]];
    return [table('Izrečene sankcije po vrsti', ['Glavna sankcija', 'Broj', 'Procenat'], vrsta),
      courtTable('Kazne zatvora i uslovne osude', cs, [
        ['Ukupno kazni zatvora', x => cnt(x, zat)], ['Kazne zatvora koje se izvršavaju u prostorijama za stanovanje', x => cnt(x, kuc)], ['Procenat kazni u prostorijama za stanovanje', x => pctN(cnt(x, kuc), cnt(x, zat))],
        ['Prosječno trajanje kazne zatvora', x => { const m = x.filter(zat).map(zatvorMj).filter(v => v !== null); return m.length ? fmtTerm(avg(m)) : DASH; }],
        ...trio('kazni zatvora do 6 mjeseci', kat('Do 6 mjeseci')), ...trio('kazni zatvora od 6 mjeseci do 1 godine', kat('Od 6 mjeseci do 1 godine')),
        ...trio('kazni zatvora dužih od 1 godine', kat('Preko 1 godine')), ...trio('uslovnih osuda', uo)], null, 'Kategorija se računa iz upisanog trajanja: do 6 mjeseci (uključujući tačno 6 mjeseci), od 6 mjeseci do 1 godine (uključujući tačno 1 godinu), duže od 1 godine.')];
  }
  function relation(cs) {
    const g = [...by(cs.filter(c => !blank(c.odnos)), c => c.odnos.trim().toLowerCase()).entries()].sort((a, b) => b[1].length - a[1].length);
    return table('Odnos oštećenih i okrivljenih', ['Odnos', 'Broj oštećenih', 'Ranije prijavljivale nasilje', 'Pridružile se krivičnom gonjenju'],
      g.map(([k, v]) => { const a = v.filter(c => c.prijavljivala === true).length, b = v.filter(c => c.pridruzila === true).length;
        return [k.charAt(0).toUpperCase() + k.slice(1), v.length, `${a} (${pct(a, v.length)})`, `${b} (${pct(b, v.length)})`]; }));
  }
  function krivicnaDjela(cs) {
    const dj = c => Array.isArray(c.djela) ? c.djela.filter(x => x && x.clan) : [];
    const names = c => { const l = dj(c); if (l.length) return [...new Set(l.map(x => { const k = S.kzClan(x.clan); return k ? `${k.naziv} (čl. ${k.clan})` : `čl. ${x.clan}`; }))];
      const t = String(c.krivicnoDjelo || '').replace(/\s*\(.*$/s, '').trim(); return t ? [t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()] : []; };
    const tally = f => { const m = new Map(); for (const c of cs) for (const k of f(c)) m.set(k, (m.get(k) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
    const withAny = cs.filter(c => names(c).length).length;
    const dod = id => cnt(cs, c => dj(c).some(x => (x.dodaci || []).includes(id)));
    return [
      table('Predmeti prema krivičnom djelu', ['Krivično djelo', 'Broj predmeta', 'Procenat'], tally(names).map(([k, n]) => [k, n, pct(n, withAny)]),
        'Predmet u kojem se sudi za više krivičnih djela broji se kod svakog djela, pa zbir može biti veći od broja predmeta. Procenat je od broja predmeta sa upisanim krivičnim djelom.'),
      table('Predmeti prema glavi Krivičnog zakonika', ['Glava KZ', 'Broj predmeta', 'Procenat'],
        tally(c => [...new Set(dj(c).map(x => (S.kzClan(x.clan) || {}).glava).filter(Boolean))]).map(([k, n]) => [k, n, pct(n, withAny)])),
      kv('Krivična djela – pregled', [
        ['Broj predmeta sa upisanim krivičnim djelom', withAny],
        ['Broj predmeta u kojima se sudi za više krivičnih djela', cnt(cs, c => dj(c).length > 1)],
        ['Broj predmeta – djelo u pokušaju (čl. 20)', dod('pokusaj')], ['Broj predmeta – saizvršilaštvo (čl. 23)', dod('saizvrsilastvo')],
        ['Broj predmeta – podstrekavanje (čl. 24)', dod('podstrekavanje')], ['Broj predmeta – pomaganje (čl. 25)', dod('pomaganje')],
        ['Broj predmeta – djela u sticaju (čl. 48)', dod('sticaj')], ['Broj predmeta – produženo krivično djelo (čl. 49)', dod('produzeno')]]),
    ];
  }
  function vawTopics() {
    const B = (lbl, f) => [[`Broj predmeta u kojima ${lbl}`, cs => cnt(cs, f)], [`Procenat predmeta u kojima ${lbl}`, cs => pctN(cnt(cs, f), cs.length)]];
    const pr = c => c.prijavljivala === true, pd = c => c.pridruzila === true, os = c => c.osudjivan === true, is = c => c.istovrsna === true, ol = c => c.olaksavajucaNepridruzivanje === true;
    return [{ key: 'vaw', title: 'Nasilje nad ženama', fn: d => {
      const cs = d.predmeti;
      const dist = (title, f) => { const g = [...by(cs.filter(c => !blank(f(c))), c => f(c).trim().toLowerCase()).entries()].sort((a, b) => b[1].length - a[1].length);
        return table(title, ['Vrijednost', 'Broj predmeta', 'Procenat'], g.map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), v.length, pct(v.length, cs.length)])); };
      return [courtTable('Predmeti nasilja nad ženama', cs, [
        ['Broj predmeta nasilja nad ženama u koje su monitori vršili uvid', x => x.length],
        ...B('je žrtva prethodno prijavljivala nasilje', pr), ...B('žrtva prethodno nije prijavljivala nasilje', c => !pr(c)),
        ...B('se žrtva pridružila krivičnom gonjenju', pd), ...B('se žrtva nije pridružila krivičnom gonjenju', c => !pd(c)),
        ...B('se žrtva koja je prethodno prijavljivala nasilje pridružila krivičnom gonjenju', c => pr(c) && pd(c)),
        ...B('se žrtva koja je prethodno prijavljivala nasilje nije pridružila krivičnom gonjenju', c => pr(c) && !pd(c)),
        ...B('se žrtva koja nije prethodno prijavljivala nasilje pridružila krivičnom gonjenju', c => !pr(c) && pd(c)),
        ...B('se žrtva koja nije prethodno prijavljivala nasilje nije pridružila krivičnom gonjenju', c => !pr(c) && !pd(c)),
        ...B('je kao olakšavajuća okolnost cijenjeno da se oštećena nije pridružila krivičnom gonjenju', ol),
        ...B('je optuženi prethodno osuđivan', os), ...B('je optuženi prethodno osuđivan za istovjetna ili istovrsna krivična djela', is),
        ...B('je kao olakšavajuća okolnost uzeto nepridruživanje oštećene, a optuženi je prethodno osuđivan za istovrsna djela', c => ol(c) && is(c)),
        ...B('je žrtva prethodno prijavljivala nasilje, a optuženi je prethodno osuđivan', c => pr(c) && os(c)),
        ...B('je žrtva prethodno prijavljivala nasilje, a optuženi je osuđivan za istovrsna djela', c => pr(c) && is(c)),
      ], null), ...vawSanctions(cs), relation(cs), ...krivicnaDjela(cs)];
    } }];
  }

  const OKK_EXTRA = { key: 'pritvor2', title: 'Pritvor – prošireni pokazatelji', fn: d => { const ix = indexOf(d);
    return [courtTable('Pritvor – prošireni pokazatelji', d.predmeti.filter(c => ix.pritvori(c._id).length), detentionIndicators(S.fallbackChoices('pritvori', 'Osnovodre_x0111_ivanjapritvora')), ix, null, () => 'OKK'),
      firstPhase('Broj predmeta prema fazi postupka u kojoj je pritvor prvi put određen', d.predmeti, ix)]; } };
  const OKK_ACTIVE = { key: 'aktivni', title: 'Aktivni predmeti', fn: d => [activeCases('Aktivni predmeti prema godini prijema', d.predmeti, d._refDate)], refDate: true };
  const rocTopics = () => { const t = rocistaTopic();
    return [['rocista', 'Praćena ročišta', 0], ['roc_razlozi', 'Razlozi odlaganja', 1], ['roc_prava', 'Poštovanje procesnih prava', 2]]
      .map(([key, title, i]) => ({ key, title, fn: (d, ix) => t.fn(d, ix).slice(i, i + 1) })); };
  const SPACE_TOPICS = { okk: [...TOPICS.slice(0, 1), OKK_ACTIVE, ...TOPICS.slice(1), OKK_EXTRA], okk_roc: rocTopics(),
    svi: sviTopics(), svi_roc: rocTopics(), vaw: vawTopics() };
  const MODULE_TOPICS = { okk: [...SPACE_TOPICS.okk, ...SPACE_TOPICS.okk_roc], svi: [...SPACE_TOPICS.svi, ...SPACE_TOPICS.svi_roc], vaw: SPACE_TOPICS.vaw };

  // pritvor iz toka -> stara polja, da statistika radi isto
  function prep(data) {
    if (!data || data._prepped) return data;
    const d = { ...data, _prepped: true };
    const F = data.faze || [];
    if (F.length && d.predmeti) {
      const m = by(F, f => f.Predmet);
      const A = 'Brojodr_x017e_anihro_x010d_i_x01', B = 'Brojodlo_x017e_enihro_x010d_i_x0';
      d.predmeti = d.predmeti.map(c => { const fs = m.get(c._id); if (!fs) return c;
        const add = k => (c[k] == null && fs.every(f => f[k] == null)) ? c[k] : (Number(c[k]) || 0) + sum(fs.map(f => f[k]));
        return { ...c, [A]: add(A), [B]: add(B) }; });
    }
    for (const k of ['odlaganja', 'mjere', 'presuda1', 'zalba', 'presuda2']) if (Array.isArray(d[k])) d[k] = [...d[k]].sort((a, b) => (a.faza || 1) - (b.faza || 1));
    if (Array.isArray(d.pritvori) && d.pritvori.some(t => Array.isArray(t.tok) && t.tok.length)) {
      const cs = new Map((d.predmeti || []).map(c => [c._id, c])), p1 = new Map();
      for (const p of d.presuda1 || []) if (!p1.has(p.Predmet) && (p.faza || 1) === 1) p1.set(p.Predmet, p.Datumobjavljivanjapresude);
      d.pritvori = d.pritvori.map(t => Array.isArray(t.tok) && t.tok.length ? { ...t, ...S.tokUStaro(t.tok, cs.get(t.Predmet), p1.get(t.Predmet)) } : t);
    }
    return d;
  }
  function compute(topicKey, data, caseId, moduleKey) {
    data = prep(data);
    const list = MODULE_TOPICS[moduleKey || 'okk'];
    const t = list.find(x => x.key === topicKey);
    if (!t) return [];
    if (TOPICS.includes(t)) return t.fn(data, null, caseId || null);
    return t.fn(data, indexOf(data), caseId || null);
  }

  const fmtNum = (x, dec) => { if (x === null || x === undefined || x === '' || !isFinite(x)) return DASH;
    const v = dec === 0 ? Math.round(Math.abs(x)) : Math.round(Math.abs(x) * 100) / 100;
    const [i, f] = String(v).split('.'); return (x < 0 && v ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? ',' + f : ''); };
  const pctR = (a, b) => b ? fmtNum(a / b * 100) + '%' : DASH;
  const vals = xs => xs.filter(x => x !== null && x !== undefined && isFinite(x));
  const avgR = (xs, mode) => { const v = vals(xs); if (!v.length) return DASH; const a = v.reduce((p, q) => p + q, 0) / v.length;
    if (mode === 'istog' && Math.round(a) === 0) return 'Istog dana'; return fmtNum(a, mode === 'int' || mode === 'istog' ? 0 : 2); };
  const sumR = xs => { const v = vals(xs); return v.length ? fmtNum(sum(v), 0) : DASH; };
  const eur = x => fmtNum(x) + ' €';
  const shortSud = s => String(s || '').replace(/^Osnovni sud /, 'OS ').replace(/^Viši sud /, 'VS ');
  const odlDurR = o => isDate(o.Odlo_x017e_enood) && isDate(o.Odlo_x017e_enodo) ? days(o.Odlo_x017e_enood, o.Odlo_x017e_enodo) : null;
  const dostR = p => { const ds = [p.dostavaStrankama, p.Datumdostavljanjapisanogotpravka, p.Datumdostavljanjapisanogotpravka0, p.Datumdostavljanjapisanogotpravka1].filter(isDate).sort();
    return isDate(p.Datumobjavljivanjapresude) && ds.length ? days(p.Datumobjavljivanjapresude, ds[ds.length - 1]) : null; };
  const reasonText = r => String(r || '').replace(/^\d{3}\s*-\s*/, '').replace(/\s*\(detaljnije u komentarima\)/i, '').trim();
  const RT = (title, columns, rows, info) => ({ title, columns, rows, info, empty: rows.length === 0 });

  function reportData(data, per) {
    data = prep(data); data = { ...data };
    for (const k of ['predmeti', 'odlaganja', 'mjere', 'presuda1', 'zalba', 'pritvori', 'jemstva', 'nadzor', 'ishod', 'faze', 'vpl']) if (!Array.isArray(data[k])) data[k] = [];
    const od = per && isDate(per.od) ? per.od : null, dok = per && isDate(per.do) ? per.do : null;
    const inP = d => (!od || le(od, d)) && (!dok || le(d, dok));
    const caseIn = c => { const s = isDate(c.Datumprijemaoptu_x017e_niceusud) ? c.Datumprijemaoptu_x017e_niceusud : c.Datumpodizanjaoptu_x017e_nice, e = c.Odlaganjero_x010d_i_x0161_ta;
      return (!isDate(s) || !dok || le(s, dok)) && (!isDate(e) || !od || le(od, e)); };
    const cs = (data.predmeti || []).filter(caseIn), ids = new Set(cs.map(c => c._id));
    const ev = (xs, dateOf) => (xs || []).filter(x => ids.has(x.Predmet) && (!dateOf || !isDate(dateOf(x)) || inP(dateOf(x))));
    const D = { ...data, predmeti: cs, all: data, od, do: dok, ref: dok || new Date().toISOString().slice(0, 10) };
    for (const [k, xs] of Object.entries(data)) if (Array.isArray(xs) && k !== 'predmeti') D[k] = ev(xs, null);
    D.odlaganja = ev(data.odlaganja, o => o.Odlo_x017e_enood);
    D.presuda1 = ev(data.presuda1, p => p.Datumobjavljivanjapresude);
    D.zalba = ev(data.zalba, z => z.Datumdono_x0161_enjadrugostepene || z.Datumpodno_x0161_enja_x017e_albe);
    D.pritvori = ev(data.pritvori, t => t.Datumodre_x0111_ivanjapritvora);
    D.nadzor = ev(data.nadzor, n => n.datum);
    const roc = data.roc || { predmeti: [], rocista: [] };
    const hs = (roc.rocista || []).filter(x => !isDate(x.datum) || inP(x.datum)), rIds = new Set(hs.map(x => x.Predmet));
    D.roc = { ...roc, rocista: hs, predmeti: (roc.predmeti || []).filter(c => rIds.has(c._id) || (!od && !dok)) };
    D.ix = indexOf(D); D.ixAll = indexOf(data);
    D.pres1 = c => (D.ixAll.presuda1(c._id)[0] || {}).Datumobjavljivanjapresude;
    return D;
  }
  // redovi po sudovima + zbirni redovi
  function courtRows(title, cases, cols, info, opt) {
    opt = opt || {};
    const extra = distinct(cases.map(c => c.sud).filter(s => s && !S.SUDOVI.includes(s)));
    const courts = [...S.SUDOVI.filter(s => /^Osnovni/.test(s)), ...extra.filter(s => /^Osnovni/.test(s)).sort((a, b) => a.localeCompare(b, 'sr')),
      ...S.SUDOVI.filter(s => !/^Osnovni/.test(s)), ...extra.filter(s => !/^Osnovni/.test(s)).sort((a, b) => a.localeCompare(b, 'sr'))];
    const row = (lbl, cs) => [lbl, ...cols.map(([, f]) => { const v = f(cs); return v === null || v === undefined ? DASH : v; })];
    const rows = opt.groupsOnly ? [] : courts.map(ct => row(opt.full ? ct : shortSud(ct), cases.filter(c => c.sud === ct)));
    rows.push(row('OSNOVNI SUDOVI', cases.filter(c => /^Osnovni/.test(c.sud || ''))), row('VIŠI SUDOVI', cases.filter(c => /^Viši/.test(c.sud || ''))), row('SVI SUDOVI', cases));
    return RT(title, ['Sud', ...cols.map(c => c[0])], cases.length ? rows : [], info);
  }
  const pair = (h, num, den) => [[`${h} – broj`, cs => num(cs)], [`${h} – %`, cs => pctR(num(cs), den(cs))]];
  const detRecs = (D, cs) => cs.flatMap(c => D.ix.pritvori(c._id).map(t => ({ t, c, ph: phases(t, c, D.pres1(c)) })));
  const osnoviOf = t => Array.isArray(t.Osnovodre_x0111_ivanjapritvora) ? t.Osnovodre_x0111_ivanjapritvora : [];
  const nadzorRecs = (D, cs) => cs.flatMap(c => D.ix.nadzor(c._id).filter(n => Array.isArray(n.mjere) && n.mjere.length).map(n => ({ c, mjere: n.mjere })))
    .concat(cs.flatMap(c => D.ix.pritvori(c._id).filter(t => Array.isArray(t.mjereNadzora) && t.mjereNadzora.length).map(t => ({ c, mjere: t.mjereNadzora }))));
  function osnovTable(title, T, osnovi, nCases) {
    const single = os => T.filter(t => osnoviOf(t).length === 1 && osnoviOf(t)[0] === os).length, multi = T.filter(t => osnoviOf(t).length > 1).length;
    const tot = sum(osnovi.map(single)) + multi;
    return RT(title, ['', ...osnovi, 'Više pritvorskih osnova istovremeno', 'Ukupno'], tot ? [['Broj rješenja', ...osnovi.map(single), multi, tot],
      ['Procenat', ...osnovi.map(o => pctR(single(o), tot)), pctR(multi, tot), '100%']] : [], `Broj analiziranih pritvorskih predmeta: ${nCases}. Jedinica brojanja je rješenje o određivanju pritvora.`);
  }
  function comboTable(title, T) {
    const M = T.filter(t => osnoviOf(t).length > 1);
    const rows = [...by(M, t => [...osnoviOf(t)].sort((a, b) => a.localeCompare(b, 'sr')).join(' + ')).entries()].map(([k, v]) => [k, v.length]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (rows.length) rows.push(['Ukupno', M.length]);
    const each = distinct(M.flatMap(osnoviOf)).map(x => `${x.toLowerCase()} ${T.filter(t => osnoviOf(t).length > 1 && osnoviOf(t).includes(x)).length} puta`);
    return RT(title, ['Pritvorski osnovi', 'Broj rješenja'], rows, each.length ? `U rješenjima sa više osnova navedeni su: ${each.join(', ')}.` : null);
  }
  function reasonTable(title, odl) {
    const g = [...by(odl, o => o.Razlogodlaganja || '').entries()].sort((a, b) => (parseInt(a[0], 10) || 999) - (parseInt(b[0], 10) || 999));
    const rows = g.map(([r, xs]) => [reasonText(r) || 'Razlog nije naveden', xs.length, pctR(xs.length, odl.length), sumR(xs.map(odlDurR)), avgR(xs.map(odlDurR))]);
    if (rows.length) rows.push(['Ukupno', odl.length, '100%', sumR(odl.map(odlDurR)), avgR(odl.map(odlDurR))]);
    return RT(title, ['Razlog odlaganja', 'Broj odloženih ročišta', 'Procenat', 'Ukupno trajanje odlaganja u danima', 'Prosječno trajanje odlaganja u danima'], rows);
  }
  function activeAt(cases, ref) {
    return cases.filter(c => isDate(c.Datumprijemaoptu_x017e_niceusud) && le(c.Datumprijemaoptu_x017e_niceusud, ref) && !(isDate(c.Odlaganjero_x010d_i_x0161_ta) && le(c.Odlaganjero_x010d_i_x0161_ta, ref)))
      .map(c => ({ c, y: c.Datumprijemaoptu_x017e_niceusud.slice(0, 4), d: days(c.Datumprijemaoptu_x017e_niceusud, ref) }));
  }

  function okkReport(D) {
    const cs = D.predmeti, ix = D.ix;
    const vrste = xs => { const v = distinct(xs.map(c => c.Vrstapredmeta || 'Nije navedeno')); return [OK, VK, ...v.filter(x => x !== OK && x !== VK).sort()].filter(x => v.includes(x)); };
    const vr = v => c => (c.Vrstapredmeta || 'Nije navedeno') === v;
    const out = [];
    const rc = D.roc.predmeti, hs = D.roc.rocista, hOf = id => hs.filter(x => x.Predmet === id);
    const r1 = vrste(rc).map(v => { const c1 = rc.filter(vr(v)); return [v, sum(c1.map(c => hOf(c._id).length)), c1.filter(c => hOf(c._id).length).length]; });
    if (r1.length) r1.push(['Ukupno', hs.filter(x => rc.some(c => c._id === x.Predmet)).length, rc.filter(c => hOf(c._id).length).length]);
    out.push(RT('Pregled uzorka predmeta praćenih putem prisustva ročištima', ['Vrsta predmeta', 'Broj praćenih ročišta', 'Broj predmeta'], r1));
    const r2 = vrste(cs).map(v => [v, cs.filter(vr(v)).length]); if (r2.length) r2.push(['Ukupno', cs.length]);
    out.push(RT('Pregled uzorka predmeta analiziranih putem uvida u spise', ['Vrsta predmeta', 'Broj analiziranih predmeta'], r2));
    const odl = f => cs.filter(f).flatMap(c => ix.odlaganja(c._id));
    out.push(reasonTable('Razlozi odlaganja ročišta u analiziranim predmetima', odl(() => true)),
      reasonTable('Razlozi odlaganja ročišta u analiziranim predmetima organizovanog kriminala', odl(vr(OK))),
      reasonTable('Razlozi odlaganja ročišta u analiziranim predmetima visoke korupcije', odl(vr(VK))),
      reasonTable('Razlozi odlaganja ročišta u analiziranim pritvorskim predmetima', odl(P)),
      reasonTable('Razlozi odlaganja ročišta u analiziranim pritvorskim predmetima organizovanog kriminala', odl(c => P(c) && vr(OK)(c))),
      reasonTable('Razlozi odlaganja ročišta u analiziranim pritvorskim predmetima visoke korupcije', odl(c => P(c) && vr(VK)(c))));
    const M = cs.flatMap(c => ix.mjere(c._id).map(m => ({ m, c })));
    const uc = UCESNICI.filter(u => M.some(x => x.m.U_x010d_esnik === u)).concat(distinct(M.map(x => x.m.U_x010d_esnik).filter(u => u && !UCESNICI.includes(u))));
    const mj = MJERE.filter(k => M.some(x => x.m.Mjera === k)).concat(distinct(M.map(x => x.m.Mjera).filter(k => k && !MJERE.includes(k))));
    const mrow = (lbl, xs) => [lbl, ...uc.flatMap(u => { const n = xs.filter(x => x.m.U_x010d_esnik === u).length; return [n, pctR(n, xs.length)]; }), xs.length];
    const fines = xs => sum(xs.filter(x => x.m.Mjera === 'Novčana kazna').map(x => x.m.Nov_x010d_anakazna));
    const dov = M.filter(x => x.m.Mjera === 'Prinudno dovođenje'), MP = M.filter(x => P(x.c));
    const nPost = dov.filter(x => x.m.Upravapolicijenijepostupilaponar === true).length, nObav = dov.filter(x => x.m.Upravapolicijenijeobavijestilasu === true).length;
    out.push(RT('Broj mjera procesne discipline izrečenih učesnicima u postupku', ['Mjera', ...uc.flatMap(u => [`${u} – broj`, `${u} – %`]), 'Ukupno'],
      M.length ? [...mj.map(k => mrow(k, M.filter(x => x.m.Mjera === k))), mrow('Ukupno', M)] : [],
      M.length ? `U pritvorskim predmetima izrečeno je ${MP.length} mjera (${mj.map(k => `${k.toLowerCase()}: ${MP.filter(x => x.m.Mjera === k).length}`).join(', ')}). ` +
        `Novčane kazne ukupno ${eur(fines(M))}, od čega ${eur(fines(MP))} u pritvorskim predmetima. ` +
        (dov.length ? `Uprava policije nije postupila po naredbi za dovođenje u ${nPost} (${pctR(nPost, dov.length)}) slučajeva, a sud nije obavijestila o razlozima nepostupanja u ${nObav} (${pctR(nObav, nPost)}) slučajeva.` : '') : null));
    const Z = cs.flatMap(c => ix.zalba(c._id)).filter(z => z.Odlukaudrugostepenompostupku);
    const odl2 = distinct([...S.fallbackChoices('zalba', 'Odlukaudrugostepenompostupku'), ...Z.map(z => z.Odlukaudrugostepenompostupku)]);
    const r10 = odl2.map(k => { const n = Z.filter(z => z.Odlukaudrugostepenompostupku === k).length; return [k, n, pctR(n, Z.length)]; }).filter(r => r[1] || !/djelimično/.test(r[0]));
    out.push(RT('Vrste donesenih odluka u drugostepenim postupcima u analiziranim predmetima', ['Vrsta odluke', 'Broj', 'Procenat'], Z.length ? [...r10, ['Ukupno', Z.length, '100%']] : []));
    const A = activeAt(D.all.predmeti || [], D.ref), y0 = String(Number(D.ref.slice(0, 4)) - 3);
    const yrs = distinct(A.map(x => x.y)).sort();
    const yrow = (lbl, xs) => [lbl, xs.length, sumR(xs.map(x => x.d)), avgR(xs.map(x => x.d))];
    out.push(RT('Aktivni predmeti prema godini prijema (broj predmeta, zbir dana trajanja i prosječno trajanje)', ['Godina prijema predmeta', 'Broj predmeta u radu', 'Zbir dana trajanja', 'Prosjek dana po predmetu'],
      A.length ? [...yrs.map(y => yrow(y, A.filter(x => x.y === y))), yrow('Ukupno', A)] : [], 'Aktivni predmet = primljen u sud i nije pravosnažno okončan. Trajanje se računa do današnjeg dana.'));
    const A3 = A.filter(x => x.y <= y0);
    out.push(RT('Predmeti u radu koji traju duže od tri godine (broj predmeta, zbir dana trajanja i prosječno trajanje)', ['Godina prijema predmeta', 'Broj predmeta u radu', 'Zbir dana trajanja', 'Prosjek dana po predmetu'],
      A3.length ? [...distinct(A3.map(x => x.y)).sort().map(y => yrow(y, A3.filter(x => x.y === y))), yrow('Ukupno', A3)] : [],
      'Obuhvaćeni su aktivni predmeti primljeni zaključno sa godinom koja je tri godine prije tekuće; godine se pomjeraju same, prema današnjem datumu.'));
    const Y = n => n * 365.25, krow = (lbl, xs) => [lbl, xs.length, avgR(xs.map(x => x.d)), xs.length ? `${fmtNum(Math.min(...xs.map(x => x.d)))} – ${fmtNum(Math.max(...xs.map(x => x.d)))}` : DASH];
    out.push(RT('Predmeti u radu stariji od pet, odnosno osam godina (broj predmeta, prosječno trajanje i raspon trajanja)', ['Kategorija predmeta', 'Broj predmeta', 'Prosječno trajanje u danima', 'Raspon trajanja u danima'],
      A.length ? [krow('Stariji od 5 godina', A.filter(x => x.d > Y(5) && x.d <= Y(8))), krow('Stariji od 8 godina', A.filter(x => x.d > Y(8)))] : [],
      'Kategorije su međusobno isključive: predmeti stariji od osam godina nijesu uključeni u kategoriju predmeta starijih od pet godina.'));
    const T = cs.flatMap(c => ix.pritvori(c._id));
    out.push(osnovTable('Struktura analiziranih predmeta prema pritvorskom osnovu', T, OSNOVI, distinct(T.map(t => t.Predmet)).length),
      comboTable('Struktura i učestalost određivanja pritvora po više pritvorskih osnova', T));
    const pc = cs.filter(c => ix.pritvori(c._id).length);
    out.push(...detentionTables(D, cs, vrste(pc).map(v => [v, vr(v)]), 'Ukupno', 'Vrsta predmeta'));
    out.push(RT('Broj predmeta u kojima je pritvoreno lice tražilo da bude upućeno na izvršenje kazne zatvora prije pravosnažnosti', ['Vrsta predmeta', 'Broj predmeta'],
      pc.length ? [...vrste(pc).map(v => [v, cnt(pc.filter(vr(v)), c => ix.pritvori(c._id).some(t => t.trazioUpucivanje === true))]), ['Ukupno', cnt(pc, c => ix.pritvori(c._id).some(t => t.trazioUpucivanje === true))]] : []));
    const N = nadzorRecs(D, cs), nm = N.flatMap(x => x.mjere.map(k => ({ k, c: x.c })));
    const r16 = vrste(N.map(x => x.c)).map(v => { const n = nm.filter(x => vr(v)(x.c)).length; return [v, n, pctR(n, nm.length)]; });
    out.push(RT('Struktura izrečenih mjera nadzora prema vrsti predmeta', ['Vrsta predmeta', 'Broj izrečenih mjera nadzora', 'Procenat'], nm.length ? [...r16, ['Ukupno', nm.length, '100%']] : [],
      N.length ? `Mjere nadzora određene su prema ${N.length} lica (${vrste(N.map(x => x.c)).map(v => `${v.toLowerCase()}: ${N.filter(x => vr(v)(x.c)).length}`).join(', ')}).` : null));
    const r17 = [...by(nm, x => x.k).entries()].map(([k, xs]) => [k, xs.length, pctR(xs.length, nm.length)]).sort((a, b) => b[1] - a[1]);
    out.push(RT('Struktura izrečenih mjera nadzora prema vrsti mjere', ['Mjera nadzora', 'Broj izrečenih mjera nadzora', 'Procenat'], nm.length ? [...r17, ['Ukupno', nm.length, '100%']] : []));
    const J = cs.flatMap(c => ix.jemstva(c._id).map(j => ({ j, c }))), Jd = J.filter(x => ['Usvojeno', 'Odbijeno'].includes(x.j.Odlukasuda));
    const jr = (lbl, xs) => { const a = xs.filter(x => x.j.Odlukasuda === 'Usvojeno').length, b = xs.length - a; return [lbl, xs.length, `${a} (${pctR(a, xs.length)})`, `${b} (${pctR(b, xs.length)})`]; };
    const val = (xs, k) => xs.map(x => Number(x.j[k])).filter(v => v > 0);
    const acc = val(Jd.filter(x => x.j.Odlukasuda === 'Usvojeno'), 'Vrijednostprihva_x0107_enogjemst'), rej = val(Jd.filter(x => x.j.Odlukasuda === 'Odbijeno'), 'Vrijednostponu_x0111_enogjemstva'),
      pend = val(J.filter(x => !Jd.includes(x)), 'Vrijednostponu_x0111_enogjemstva');
    const rng = v => v.length ? ` (najniži ${eur(Math.min(...v))}, najviši ${eur(Math.max(...v))})` : '';
    out.push(RT('Struktura prihvaćenih i odbijenih jemstava prema vrsti predmeta', ['Vrsta predmeta', 'Broj jemstava o kojima je odlučeno', 'Jemstvo prihvaćeno', 'Jemstvo odbijeno'],
      Jd.length ? [...vrste(Jd.map(x => x.c)).map(v => jr(v, Jd.filter(x => vr(v)(x.c)))), jr('Ukupno', Jd)] : [],
      J.length ? `Ukupna vrijednost prihvaćenih jemstava: ${acc.length ? eur(sum(acc)) + rng(acc) : 'nije upisana'}. Ukupna vrijednost odbijenih jemstava: ${rej.length ? eur(sum(rej)) + rng(rej) : 'nije upisana'}.` + (pend.length ? ` Predložena jemstva o kojima još nije odlučeno: ${eur(sum(pend))}.` : '') : null));
    return out;
  }

  // trajanje pritvora po fazama, isto za OKK i svi sudovi
  function detentionTables(D, cs, groups, totalLbl, groupHdr) {
    const ix = D.ix, T = x => x.flatMap(c => ix.pritvori(c._id)), out = [];
    const grp = (title, cols, info) => {
      const rows = [...groups.map(([l, f]) => [l, ...cols.map(([, fn]) => fn(cs.filter(f)))]), [totalLbl, ...cols.map(([, fn]) => fn(cs))]];
      return RT(title, [groupHdr, ...cols.map(c => c[0])], T(cs).length ? rows : [], info); };
    out.push(grp('Rješenja o određivanju pritvora, prema stepenu obrazloženja', ['Obrazložen', 'Djelimično obrazložen', 'Neobrazložen'].map(o => [o.replace('Obrazložen', 'Obrazložena rješenja').replace('Djelimično obrazložen', 'Djelimično obrazložena rješenja').replace('Neobrazložen', 'Neobrazložena rješenja'),
      x => T(x).filter(t => t.obrazlozenost === o).length])));
    const DR = x => detRecs(D, x);
    const perCase = (x, key) => { const m = new Map(); for (const r of DR(x)) { const v = r.ph[key]; if (v === undefined || v === null) continue; m.set(r.c._id, Math.max(m.get(r.c._id) ?? -1, v)); } return [...m.values()]; };
    const cc = (x, f) => distinct(DR(x).filter(f).map(r => r.c._id)).length;
    const first = (x, k) => { let n = 0; for (const c of x) { const ts = ix.pritvori(c._id).map(t => t.Datumodre_x0111_ivanjapritvora).filter(isDate).sort(); if (!ts.length) continue;
      const f = ts[0], pod = c.Datumpodizanjaoptu_x017e_nice, p1 = D.pres1(c); const ph = isDate(pod) && lt(f, pod) ? 0 : (!isDate(p1) || le(f, p1)) ? 1 : 2; if (ph === k) n++; } return n; };
    out.push(grp('Broj predmeta prema fazi postupka u kojoj je pritvor prvi put određen', [['Pritvor određen u fazi istrage', x => first(x, 0)], ['Pritvor određen nakon podizanja optužnog akta', x => first(x, 1)], ['Pritvor određen nakon izricanja odluke', x => first(x, 2)]]));
    out.push(grp('Trajanje pritvora u fazi istrage', [['Br. analiziranih predmeta u kojima je određen pritvor u fazi istrage', x => cc(x, r => r.ph.uIstrazi)],
      ['Br. analiziranih predmeta u kojima je produžen pritvor u fazi istrage', x => cc(x, r => r.t.produzenIstraga === true)],
      ['Br. analiziranih predmeta u kojima je ukinut pritvor u fazi istrage', x => cc(x, r => r.t.Fazapostupkaukojojjepritvorukinu === 'Faza istrage')],
      ['Prosječno trajanje pritvora u istrazi', x => { const a = avgR(perCase(x, 'istraga'), 'int'); return a === DASH ? a : `${a} dana`; }]]));
    const bucketCols = (key, edges) => { const out2 = []; let lo = null;
      for (const hi of [...edges, null]) { const a = lo, b = hi, lbl = a === null ? `Do ${b} dana` : b === null ? `Preko ${a} dana` : `Od ${a} do ${b} dana`;
        out2.push(...pair(lbl, x => perCase(x, key).filter(v => (a === null || v > a) && (b === null || v <= b)).length, x => perCase(x, key).length)); lo = hi; }
      return out2; };
    out.push(grp('Dužina trajanja pritvora u fazi istrage', bucketCols('istraga', [30, 60]), 'Za predmet sa više pritvorenih lica uzima se najduže trajanje.'),
      grp('Trajanje pritvora u fazi glavnog pretresa', bucketCols('gp', [30, 60, 120]), 'Od podizanja optužnog akta (ili kasnijeg određivanja pritvora) do prvostepene presude, odnosno ukidanja pritvora. Za predmet sa više pritvorenih lica uzima se najduže trajanje.'),
      grp('Prosječno trajanje pritvora u fazi glavnog pretresa', [['Br. analiziranih predmeta u kojima je pritvor određen/produžen nakon podizanja optužnog akta', x => cc(x, r => r.t.nakonOptuznog === true || r.ph.gp !== undefined)],
        ['Br. analiziranih predmeta u kojima je pritvor ukinut nakon podizanja optužnog akta (u fazi suđenja)', x => cc(x, r => ['Faza suđenja', 'Nakon podizanja optužnice'].includes(r.t.Fazapostupkaukojojjepritvorukinu))],
        ['Prosječno trajanje pritvora nakon podizanja optužnog akta', x => { const a = avgR(DR(x).map(r => r.ph.gp), 'int'); return a === DASH ? a : `${a} dana`; }]]),
      grp('Trajanje pritvora nakon izricanja presude', [['Br. analiziranih predmeta u kojima je pritvor produžen nakon izricanja presude', x => cc(x, r => r.ph.nakonPresude)],
        ['Br. analiziranih predmeta u kojima je pritvor trajao do pravosnažnosti presude', x => cc(x, r => r.t.Pritvorjetrajaodopravosna_x017e_ === true || (!isDate(r.t.Datumukidanjapritvora) && isDate(r.c.Odlaganjero_x010d_i_x0161_ta)))]]),
      grp('Prosječno trajanje pritvora u toku cijelog postupka', [['Prosječno trajanje pritvora', x => { const a = avgR(DR(x).map(r => r.ph.ukupno), 'int'); return a === DASH ? a : `${a} dana`; }]],
        'Od dana određivanja pritvora do ukidanja, odnosno do pravosnažnosti presude; računa se po pritvorenom licu.'));
    return out;
  }
  // tabele za izvjestaj - svi sudovi
  function sviReport(D) {
    const cs = D.predmeti, ix = D.ix;
    const isOP = c => c.Vrstaoptu_x017e_nogakta === 'Optužni predlog', isOpt = c => c.Vrstaoptu_x017e_nogakta === 'Optužnica';
    const isP = c => P(c) || D.ixAll.pritvori(c._id).length > 0;
    const dd = (a, b) => c => isDate(c[a]) && isDate(c[b]) ? days(c[a], c[b]) : null;
    const prij2kontr = dd('Datumprijemaoptu_x017e_niceusud', 'Datumro_x010d_i_x0161_tazakontro'), kontr2potv = dd('Datumro_x010d_i_x0161_tazakontro', 'Datumrje_x0161_enjaopotvr_x0111_');
    const potv2nar = dd('Datumrje_x0161_enjaopotvr_x0111_', 'Datumnaredbezaodr_x017e_avanjegl');
    const op2nar = c => isDate(c.Datumnaredbezaodr_x017e_avanjegl) ? (isDate(c.Datumprijemaoptu_x017e_niceusud) ? days(c.Datumprijemaoptu_x017e_niceusud, c.Datumnaredbezaodr_x017e_avanjegl)
      : isDate(c.Datumpodizanjaoptu_x017e_nice) ? days(c.Datumpodizanjaoptu_x017e_nice, c.Datumnaredbezaodr_x017e_avanjegl) : null) : null;
    const trajanje = dd('Datumpodizanjaoptu_x017e_nice', 'Odlaganjero_x010d_i_x0161_ta');
    const SPN = [['Svi predmeti', () => true], ['Nepritvorski predmeti', c => !isP(c)], ['Pritvorski predmeti', isP]];
    const SP = [SPN[0], SPN[2]];
    const out = [];
    const hasN = c => D.ixAll.nadzor(c._id).length > 0 || D.ixAll.pritvori(c._id).some(t => Array.isArray(t.mjereNadzora) && t.mjereNadzora.length);
    const hasJ = c => D.ixAll.jemstva(c._id).length > 0 || c.Predlo_x017e_nojemstvo === true || c.Predlo_x017e_enojemstvo === true;
    out.push(courtRows('Pregled broja predmeta u koje su monitori vršili uvid', cs, [['Broj predmeta u koje su monitori vršili uvid', x => x.length],
      ['Pritvor', x => cnt(x, isP)], ['Mjere nadzora', x => cnt(x, hasN)], ['Jemstvo', x => cnt(x, hasJ)]]));
    out.push(courtRows('Prikaz predmeta praćenih uvidom u spise prema broju optužnica i roku u kojem je zakazana kontrola optužnice', cs, [['Broj optužnica', x => cnt(x, isOpt)],
      ['Prosječan broj dana od dana prijema optužnice do dana održavanja ročišta za kontrolu optužnice', x => avgR(x.filter(isOpt).map(prij2kontr), 'istog')]]));
    out.push(courtRows('Prikaz predmeta praćenih uvidom u spise prema broju optužnica i roku u kojem je doneseno rješenje o potvrđivanju optužnice', cs, [['Broj optužnica', x => cnt(x, isOpt)],
      ['Rok za potvrđivanje optužnice nakon ročišta za kontrolu optužnice (prosjek u danima)', x => avgR(x.filter(isOpt).map(kontr2potv), 'istog')]]));
    out.push(courtRows('Prikaz predmeta sa optužnicom praćenih uvidom u spise prema roku (u danima) u kojem je zakazan glavni pretres', cs,
      SPN.map(([h, f]) => [`Prosječan rok nakon potvrđivanja optužnice – ${h.toLowerCase()}`, x => avgR(x.filter(c => isOpt(c) && f(c)).map(potv2nar), 'int')])));
    const opInfo = 'Rok se računa od prijema optužnog predloga u sud do naredbe za održavanje glavnog pretresa (ako datum prijema nije upisan – od podizanja).';
    out.push(courtRows('Broj analiziranih predmeta sa optužnim predlogom, u kojem je glavni pretres zakazan za više od 30 dana od dana prijema optužnog predloga', cs,
      SPN.map(([h, f]) => [h, x => x.filter(c => isOP(c) && f(c) && op2nar(c) > 30).length]), opInfo));
    out.push(courtRows('Analizirani predmeti sa optužnim predlogom, prema roku (u danima) u kojem je zakazan glavni pretres', cs,
      SPN.map(([h, f]) => [h, x => avgR(x.filter(c => isOP(c) && f(c)).map(op2nar), 'int')]), opInfo));
    const opRok = (title, base) => { const B = cs.filter(c => isOP(c) && base(c) && op2nar(c) !== null);
      return courtRows(title, cs, [...pair('Rok do 30 dana', x => x.filter(c => B.includes(c) && op2nar(c) <= 30).length, () => B.length),
        ...pair('Rok duži od 30 dana', x => x.filter(c => B.includes(c) && op2nar(c) > 30).length, () => B.length)], 'Procenat je u odnosu na ukupan broj predmeta sa optužnim predlogom (svi sudovi). ' + opInfo); };
    out.push(opRok('Broj i procenat predmeta u kojima je rok za određivanje glavnog pretresa poštovan, odnosno nije poštovan, u odnosu na ukupan broj predmeta sa optužnim predlogom', () => true),
      opRok('Broj i procenat pritvorskih predmeta u kojima je rok za određivanje glavnog pretresa poštovan, odnosno nije poštovan, u odnosu na ukupan broj predmeta sa optužnim predlogom', isP));
    const A = 'Brojodr_x017e_anihro_x010d_i_x01', B = 'Brojodlo_x017e_enihro_x010d_i_x0';
    const odr = x => sum(x.map(c => c[A])), odl = x => sum(x.map(c => c[B]));
    out.push(courtRows('Prikaz predmeta praćenih uvidom u spise prema broju i procentu održanih i odloženih ročišta', cs,
      [...pair('Održana ročišta', odr, x => odr(x) + odl(x)), ...pair('Odložena ročišta', odl, x => odr(x) + odl(x))], 'Broj ročišta prema podacima upisanim uz predmet.'));
    out.push(courtRows('Prikaz predmeta praćenih uvidom u spise u kojima je određena mjera pritvora, prema broju i procentu održanih i odloženih ročišta', cs.filter(isP),
      [...pair('Održana ročišta u pritvorskim predmetima', odr, x => odr(x) + odl(x)), ...pair('Odložena ročišta u pritvorskim predmetima', odl, x => odr(x) + odl(x))]));
    out.push(courtRows('Prikaz predmeta praćenih uvidom u spise prema prosječnom trajanju odlaganja u danima, po sudovima', cs,
      SP.map(([h, f]) => [h, x => avgR(x.filter(f).flatMap(c => ix.odlaganja(c._id)).map(odlDurR), 'int')])));
    const LBL = { 'privremene duševne poremećenosti okrivljenog': 'Privremena duševna poremećenost okrivljenog', 'pribavljanja novih dokaza': 'Pribavljanje novih dokaza',
      'nedostatka tehničkih uslova': 'Nedostatak tehničkih uslova', 'zahtjeva advokata': 'Zahtjev advokata',
      'nedostavljanja nalaza drugih državnih organa': 'Nalazi nijesu dostavljeni u predviđenom vremenskom roku od strane drugih državnih organa' };
    const PT = PARTIES.filter(p => p[0] !== 'oštećenog').map(([who, codes]) => who === 'svjedoka' ? [who, [...codes, 103, 203, 303], ['ods:svjedoka', 'ods:oštećenog']] : [who, codes, ['ods:' + who]]);
    const RZ = [...PT.map(([who, codes, hk]) => [`Odsustvo ${who}`, codes, hk]), ...OTHER.map(([what, codes]) => [LBL[what] || what, codes, [what]])];
    const withCode = o => Number.isFinite(code(o));
    const rzCount = (x, codes, hk) => sum(x.map(c => ix.odlaganja(c._id).filter(o => codes.includes(code(o))).length + sum(hk.map(k => hist(c, k)))));
    const druge = x => sum(x.map(c => ix.odlaganja(c._id).filter(o => withCode(o) && !KNOWN.has(code(o))).length + hist(c, 'druge')));
    const tot12 = x => sum(RZ.map(([, codes, hk]) => rzCount(x, codes, hk))) + druge(x);
    const c12 = SP.map(([, f]) => cs.filter(f)), t12 = c12.map(tot12);
    const r12 = [...RZ.map(([lbl, codes, hk]) => [lbl, ...c12.flatMap((x, i) => { const n = rzCount(x, codes, hk); return [n, pctR(n, t12[i])]; })]).filter(r => r[1] || r[3]),
      ['Druge smetnje', ...c12.flatMap((x, i) => [druge(x), pctR(druge(x), t12[i])])]];
    out.push(RT('Razlozi odlaganja ročišta u analiziranim predmetima', ['Razlog odlaganja', 'Svi predmeti – broj', 'Svi predmeti – %', 'Pritvorski predmeti – broj', 'Pritvorski predmeti – %'],
      t12[0] ? [...r12, ['UKUPNO', t12[0], '100%', t12[1], t12[1] ? '100%' : DASH]] : [], 'Odsustvo lica obuhvata i neurednu dostavu poziva tom licu; odsustvo svjedoka obuhvata i svjedoka oštećenog. Odlaganja bez upisanog razloga nijesu uračunata. Za predmete uvezene iz AppSheeta uračunati su zbirni razlozi upisani tamo.'));
    const dov = x => x.flatMap(c => ix.mjere(c._id).filter(m => m.Mjera === 'Prinudno dovođenje'));
    const dovT = (title, base) => courtRows(title, cs.filter(base), [['Broj predmeta u kojima je izrečena naredba za prinudno dovođenje', x => cnt(x, c => dov([c]).length > 0)], ['Broj izrečenih naredbi za prinudno dovođenje', x => dov(x).length]]);
    out.push(dovT('Broj izrečenih naredbi za prinudno dovođenje po sudovima', () => true), dovT('Broj izrečenih naredbi za prinudno dovođenje u pritvorskim predmetima', isP));
    const polT = (title, base) => courtRows(title, cs.filter(base), [['Broj slučajeva u kojima Uprava policije nije postupila po naredbi za prinudno dovođenje', x => dov(x).filter(m => m.Upravapolicijenijepostupilaponar === true).length],
      ['Broj slučajeva u kojima policija nije obavijestila sud o razlozima nepostupanja', x => dov(x).filter(m => m.Upravapolicijenijeobavijestilasu === true).length]]);
    out.push(polT('Broj slučajeva u kojima Uprava policije nije postupila po naredbi za prinudno dovođenje', () => true), polT('Broj slučajeva u kojima Uprava policije nije postupila po naredbi za prinudno dovođenje u pritvorskim predmetima', isP));
    const dovU = distinct(['Optuženi', 'Svjedok', 'Vještak', ...dov(cs).map(m => m.U_x010d_esnik).filter(Boolean)]);
    const gen = { 'Optuženi': 'Optuženog', 'Svjedok': 'Svjedoka', 'Vještak': 'Vještaka', 'Oštećeni': 'Oštećenog' };
    const ucT = (title, base) => courtRows(title, cs.filter(base), dovU.map(u => [gen[u] || u, x => dov(x).filter(m => m.U_x010d_esnik === u).length]));
    out.push(ucT('Broj naredbi za prinudno dovođenje prema učesniku u postupku', () => true), ucT('Broj naredbi za prinudno dovođenje prema učesniku u postupku u pritvorskim predmetima', isP));
    const pr = x => x.map(c => ix.presuda1(c._id)[0]).filter(Boolean);
    const zo = p => isDate(p.Datumzavr_x0161_etkaglavnogpretr) && isDate(p.Datumobjavljivanjapresude) ? days(p.Datumzavr_x0161_etkaglavnogpretr, p.Datumobjavljivanjapresude) : null;
    out.push(courtRows('Prosječan broj dana potreban za objavljivanje presude nakon završetka glavnog pretresa', cs, SP.map(([h, f]) => [h, x => avgR(pr(x.filter(f)).map(zo), 'istog')])));
    const bk = (lo, hi) => x => pr(x).map(dostR).filter(v => v !== null && (lo === null || v > lo) && (hi === null || v <= hi)).length;
    const nd = x => pr(x).map(dostR).filter(v => v !== null).length;
    const buckets = [...pair('Do mjesec dana', bk(null, 30), nd), ...pair('Od jednog do dva mjeseca', bk(30, 60), nd), ...pair('Više od dva mjeseca', bk(60, null), nd)];
    const dInfo = 'Dostavljanje = posljednji upisani datum dostavljanja presude strankama. Procenat je u odnosu na broj presuda sa upisanim datumom dostavljanja u tom sudu.';
    out.push(courtRows('Rok za dostavljanje presude od dana objavljivanja', cs, buckets, dInfo),
      courtRows('Prosječan broj dana od objavljivanja do dana dostavljanja presude stranama u postupku', cs, [['Prosječan broj dana od objavljivanja presude do dostavljanja strankama', x => avgR(pr(x).map(dostR), 'int')]]));
    const pNak = c => detRecs({ ...D, ix: D.ixAll }, [c]).some(x => x.t.nakonPresude === true || x.ph.nakonPresude);
    out.push(courtRows('Rok za dostavljanje presude od dana objavljivanja u pritvorskim predmetima u kojima je pritvor određen ili produžen nakon izricanja presude', cs.filter(pNak),
      [['Broj pritvorskih predmeta', x => x.length], ...buckets], dInfo),
      courtRows('Prosječan broj dana od objavljivanja do dana dostavljanja presude stranama u postupku u pritvorskim predmetima', cs.filter(pNak),
        [['Prosječan broj dana u predmetima u kojima je pritvor određen/produžen nakon izricanja presude', x => avgR(pr(x).map(dostR), 'int')]]));
    const Z = x => x.flatMap(c => ix.zalba(c._id));
    const zDur = z => isDate(z.Datumpodno_x0161_enja_x017e_albe) && isDate(z.Datumdono_x0161_enjadrugostepene) ? days(z.Datumpodno_x0161_enja_x017e_albe, z.Datumdono_x0161_enjadrugostepene) : null;
    out.push(courtRows('Prikaz predmeta praćenih uvidom u spise prema broju drugostepenih postupaka, po sudovima', cs, SP.map(([h, f]) => [h, x => Z(x.filter(f)).length])),
      courtRows('Prosječno trajanje drugostepenog postupka, u danima', cs, SP.map(([h, f]) => [h, x => avgR(Z(x.filter(f)).map(zDur), 'int')]), 'Od podnošenja žalbe do donošenja drugostepene odluke.'));
    const r26 = cs.filter(c => pNak(c) && ix.zalba(c._id).some(z => /preinačuje/.test(z.Odlukaudrugostepenompostupku || ''))).map(c => { const is = D.ixAll.ishod(c._id)[0] || {};
      const dur = vals(detRecs({ ...D, ix: D.ixAll }, [c]).map(x => x.ph.ukupno));
      return [S.caseTitle ? S.caseTitle(c) : c.Title, is.Prvostepenapresuda || is.sankcija || DASH, is.Pravosna_x017e_napresuda || DASH, dur.length ? `${fmtNum(sum(dur), 0)} dana` : DASH]; });
    out.push(RT('Pregled preinačenih presuda u predmetima u kojima je pritvor određen nakon izricanja presude', ['Predmet', 'Kazna u prvostepenoj presudi', 'Kazna u preinačenoj presudi', 'Trajanje pritvora'], r26,
      'Kazne se preuzimaju iz koraka „Ishod postupka”.'));
    out.push(courtRows('Prosječno trajanje postupka u analiziranim predmetima (u danima), od dana podizanja optužnog akta do dana pravosnažnosti presude', cs,
      SPN.map(([h, f]) => [h, x => avgR(x.filter(f).map(trajanje), 'int')])));
    out.push(courtRows('Učestalost određivanja mjere pritvora, mjere nadzora i jemstva u analiziranim predmetima', cs, [['Broj analiziranih predmeta', x => x.length],
      ...pair('Predmeti u kojima je određen pritvor', x => cnt(x, isP), x => x.length), ...pair('Predmeti u kojima je određena mjera nadzora', x => cnt(x, hasN), x => x.length),
      ...pair('Predmeti u kojima je određeno jemstvo', x => cnt(x, hasJ), x => x.length)],
      'U izvještaju se ova tabela računa u odnosu na broj primljenih krivičnih predmeta po podacima sudova; aplikacija nema te podatke, pa je procenat u odnosu na broj analiziranih predmeta.'));
    const T = x => x.flatMap(c => ix.pritvori(c._id));
    const os29 = S.fallbackChoices('svi_pritvori', 'Osnovodre_x0111_ivanjapritvora');
    out.push(courtRows('Struktura analiziranih predmeta prema pritvorskom osnovu', cs.filter(c => ix.pritvori(c._id).length), [['Broj analiziranih pritvorskih predmeta', x => x.length],
      ...os29.map(o => [o, x => T(x).filter(t => osnoviOf(t).length === 1 && osnoviOf(t)[0] === o).length]), ['Više pritvorskih osnova', x => T(x).filter(t => osnoviOf(t).length > 1).length]],
      'Osnovi se broje po rješenjima o određivanju pritvora; rješenje sa više osnova je u koloni „Više pritvorskih osnova”.'));
    out.push(comboTable('Struktura i učestalost određivanja pritvora po više pritvorskih osnova', T(cs)));
    out.push(...detentionTables(D, cs, [['Osnovni sudovi', c => /^Osnovni/.test(c.sud || '')], ['Viši sudovi', c => /^Viši/.test(c.sud || '')]], 'UKUPNO', 'Sud'));
    out.push(courtRows('Broj predmeta u kojima je pritvoreno lice tražilo da bude upućeno na izvršenje kazne zatvora prije pravosnažnosti', cs.filter(c => ix.pritvori(c._id).length),
      [['Broj predmeta', x => cnt(x, c => ix.pritvori(c._id).some(t => t.trazioUpucivanje === true))]]));
    return out;
  }

  // tabele za izvjestaj - nasilje nad zenama
  function vawReport(D) {
    const cs = D.predmeti;
    const pr = c => c.prijavljivala === true, pd = c => c.pridruzila === true, os = c => c.osudjivan === true, is = c => c.istovrsna === true, ol = c => c.olaksavajucaNepridruzivanje === true;
    const N = ['Br. predmeta nasilja nad ženama u koje su monitori vršili uvid', x => x.length];
    const P2 = (h, f) => pair(h, x => cnt(x, f), x => x.length);
    const T = (title, cols, info) => courtRows(title, cs, cols, info, { full: true });
    const zat = c => /^Kazna zatvora/.test(c.glavnaSankcija || ''), kuc = c => /prostorijama za stanovanje/.test(c.glavnaSankcija || ''), uo = c => /^Uslovna osuda/.test(c.glavnaSankcija || '');
    const kat = k => c => zat(c) && zatvorKat(c) === k;
    const out = [
      T('Broj predmeta nasilja nad ženama u koje su monitori vršili uvid', [N]),
      T('Predmeti prema tome da li je oštećena ranije prijavljivala nasilje', [N, ...P2('Oštećena ranije PRIJAVLJIVALA nasilje', pr), ...P2('Oštećena ranije NIJE PRIJAVLJIVALA nasilje', c => !pr(c))]),
      T('Predmeti prema tome da li se oštećena pridružila krivičnom gonjenju', [N, ...P2('Oštećena se PRIDRUŽILA krivičnom gonjenju', pd), ...P2('Oštećena se NIJE PRIDRUŽILA krivičnom gonjenju', c => !pd(c))]),
      T('Oštećene koje su ranije prijavljivale nasilje, prema pridruživanju krivičnom gonjenju', [N, ...P2('Ranije PRIJAVLJIVALA, PRIDRUŽILA se', c => pr(c) && pd(c)), ...P2('Ranije PRIJAVLJIVALA, NIJE se PRIDRUŽILA', c => pr(c) && !pd(c))]),
      T('Oštećene koje ranije nijesu prijavljivale nasilje, prema pridruživanju krivičnom gonjenju', [N, ...P2('Ranije NIJE PRIJAVLJIVALA, PRIDRUŽILA se', c => !pr(c) && pd(c)), ...P2('Ranije NIJE PRIJAVLJIVALA, NIJE se PRIDRUŽILA', c => !pr(c) && !pd(c))]),
      T('Nepridruživanje oštećene krivičnom gonjenju kao olakšavajuća okolnost', [N, ...P2('Kao olakšavajuća okolnost cijenjeno je da se oštećena nije pridružila krivičnom gonjenju', ol)]),
      T('Prethodna osuđivanost okrivljenih', [N, ...P2('Okrivljeni prethodno osuđivan', os), ...P2('Okrivljeni prethodno osuđivan za istovjetno ili istovrsno krivično djelo', is)]),
      T('Ranije prijavljivanje nasilja i prethodna osuđivanost okrivljenih', [N, ...P2('Oštećena ranije prijavljivala nasilje, optuženi prethodno osuđivan', c => pr(c) && os(c)),
        ...P2('Oštećena ranije prijavljivala nasilje, optuženi osuđivan za istovrsno ili istovjetno djelo', c => pr(c) && is(c))]),
      relation(cs),
    ];
    const withSan = cs.filter(c => c.glavnaSankcija);
    const r10 = [...by(withSan, c => c.glavnaSankcija).entries()].sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, v.length, pctR(v.length, withSan.length)]);
    out.push(RT('Izrečene sankcije po vrsti', ['Presuda', 'Broj izrečenih kazni', 'Procenat'], withSan.length ? [...r10, ['UKUPNO', withSan.length, '100%']] : []));
    out.push(T('Kazne zatvora i kazne zatvora koje se izvršavaju u prostorijama za stanovanje', [...P2('Kazna zatvora', c => zat(c) && !kuc(c)), ...P2('Kazna zatvora u prostorijama za stanovanje', kuc), ...P2('Ukupno', zat)],
      'Procenat je u odnosu na broj predmeta u koje je izvršen uvid u tom sudu.'));
    const katInfo = 'Kategorija se računa iz upisanog trajanja kazne (godine, mjeseci, dani) i obuhvata i kazne zatvora koje se izvršavaju u prostorijama za stanovanje. Procenat je u odnosu na broj predmeta u tom sudu.';
    for (const [lbl, k] of [['do šest mjeseci', 'Do 6 mjeseci'], ['od šest mjeseci do jedne godine', 'Od 6 mjeseci do 1 godine'], ['dužem od jedne godine', 'Preko 1 godine']]) {
      const f = kat(k);
      out.push(T(`Izrečene kazne zatvora u trajanju ${lbl}`, [...P2(`Kazne zatvora u trajanju ${lbl}`, f), ...P2('… prethodno osuđivanim licima', c => f(c) && os(c)),
        ...P2('… licima prethodno osuđivanim za istovrsno ili istovjetno djelo', c => f(c) && is(c))], katInfo));
      if (k !== 'Preko 1 godine') out.push(T(`Kazne zatvora u trajanju ${lbl} u predmetima u kojima je kao olakšavajuća okolnost uzeto nepridruživanje oštećene krivičnom gonjenju`,
        P2(`Kazne zatvora u trajanju ${lbl} – olakšavajuća okolnost nepridruživanja`, c => f(c) && ol(c)), katInfo));
    }
    out.push(T('Uslovne osude', [...P2('Uslovne osude', uo), ...P2('Uslovne osude prethodno osuđivanim licima', c => uo(c) && os(c)),
      ...P2('Uslovne osude u predmetima u kojima je kao olakšavajuća okolnost uzeto nepridruživanje oštećene', c => uo(c) && ol(c))]));
    const kd = krivicnaDjela(cs)[0];
    out.push(RT('Krivična djela u analiziranim predmetima', ['Krivično djelo', 'Broj predmeta', 'Procenat'], kd.rows.map(r => [r[0], r[1], pctR(r[1], cs.length)]),
      'Predmet u kojem se sudi za više krivičnih djela broji se kod svakog djela, pa zbir može biti veći od broja predmeta. Procenat je u odnosu na broj analiziranih predmeta.'));
    return out;
  }
  const REPORTS = { okk: okkReport, svi: sviReport, vaw: vawReport };
  function report(moduleKey, data, per) {
    if (!REPORTS[moduleKey]) return [];
    const D = reportData(data, moduleKey === 'vaw' ? null : per);
    const dec = x => typeof x === 'string' ? x.replace(/(\d)\.(\d{1,2}%)/g, '$1,$2') : x;
    return REPORTS[moduleKey](D).map((t, i) => ({ ...t, rows: t.rows.map(r => r.map(dec)), no: i + 1 }));
  }

  const ODL_GRUPE_R = { 1: 'Neuredna dostava poziva', 2: 'Nepristupanje uprkos urednom pozivu', 3: 'Nepristupanje – ne zna se da li je poziv uručen', 4: 'Razlozi na strani suda',
    5: 'Dokazi i vještačenja', 6: 'Zahtjevi i sporazumi stranaka', 7: 'Zdravstveni i objektivni razlozi', 8: 'Ostali razlozi' };
  // izracunata polja za graditelj tabela
  const DERIVED = {
    predmeti: [
      { key: 'trajanjePostupka', label: 'Trajanje postupka – od podizanja optužnog akta do pravosnažnosti (dana)', type: 'number', fn: r => isDate(r.Datumpodizanjaoptu_x017e_nice) && isDate(r.Odlaganjero_x010d_i_x0161_ta) ? days(r.Datumpodizanjaoptu_x017e_nice, r.Odlaganjero_x010d_i_x0161_ta) : null, when: F => F.some(f => f.name === 'Odlaganjero_x010d_i_x0161_ta') },
      { key: 'kategorijaKazne', label: 'Kategorija kazne zatvora (iz trajanja)', type: 'choice', choices: ['Do 6 mjeseci', 'Od 6 mjeseci do 1 godine', 'Preko 1 godine'], fn: r => /zatvor/i.test(r.glavnaSankcija || '') ? zatvorKat(r) : null, when: F => F.some(f => f.name === 'zatvorGodina') },
      { key: 'trajanjeKazne', label: 'Trajanje kazne zatvora (mjeseci)', type: 'number', fn: r => /zatvor/i.test(r.glavnaSankcija || '') ? zatvorMj(r) : null, when: F => F.some(f => f.name === 'zatvorGodina') },
      { key: 'brojDjela', label: 'Broj krivičnih djela', type: 'number', fn: r => Array.isArray(r.djela) ? r.djela.filter(x => x && x.clan).length || null : null, when: F => F.some(f => f.name === 'djela') },
      { key: 'krivicnoDjelo', label: 'Krivično djelo (svako djelo posebno)', type: 'multichoice', fn: r => { const l = Array.isArray(r.djela) ? r.djela.filter(x => x && x.clan) : [];
        return l.length ? [...new Set(l.map(x => { const k = S.kzClan(x.clan); return k ? `${k.naziv} (čl. ${k.clan})` : `čl. ${x.clan}`; }))] : []; }, when: F => F.some(f => f.name === 'djela') },
    ],
    odlaganja: [
      { key: 'trajanje', label: 'Trajanje odlaganja (dana)', type: 'number', fn: r => odlDurR(r) },
      { key: 'razlog', label: 'Razlog odlaganja (bez šifre)', type: 'text', fn: r => reasonText(r.Razlogodlaganja) || null },
      { key: 'grupaRazloga', label: 'Grupa razloga odlaganja', type: 'choice', choices: Object.values(ODL_GRUPE_R), fn: r => ODL_GRUPE_R[String(r.Razlogodlaganja || '').charAt(0)] || null },
    ],
    presuda1: [
      { key: 'zavrsetakObjava', label: 'Od završetka glavnog pretresa do objavljivanja presude (dana)', type: 'number', fn: p => isDate(p.Datumzavr_x0161_etkaglavnogpretr) && isDate(p.Datumobjavljivanjapresude) ? days(p.Datumzavr_x0161_etkaglavnogpretr, p.Datumobjavljivanjapresude) : null },
      { key: 'objavaDostava', label: 'Od objavljivanja do dostavljanja presude (dana)', type: 'number', fn: p => dostR(p) },
    ],
    zalba: [{ key: 'trajanje', label: 'Trajanje drugostepenog postupka – od žalbe do odluke (dana)', type: 'number', fn: z => isDate(z.Datumpodno_x0161_enja_x017e_albe) && isDate(z.Datumdono_x0161_enjadrugostepene) ? days(z.Datumpodno_x0161_enja_x017e_albe, z.Datumdono_x0161_enjadrugostepene) : null }],
    pritvori: [
      { key: 'ukupno', label: 'Trajanje pritvora ukupno (dana)', type: 'number', fn: (t, c, ctx) => phases(t, c || {}, ctx.pres1(c)).ukupno },
      { key: 'istraga', label: 'Trajanje pritvora u istrazi (dana)', type: 'number', fn: (t, c, ctx) => { const p = phases(t, c || {}, ctx.pres1(c)); return p.uIstrazi ? p.istraga ?? null : null; } },
      { key: 'gp', label: 'Trajanje pritvora nakon podizanja optužnog akta (dana)', type: 'number', fn: (t, c, ctx) => phases(t, c || {}, ctx.pres1(c)).gp ?? null },
      { key: 'zadrzavanje', label: 'Trajanje zadržavanja (dana)', type: 'number', fn: (t, c, ctx) => phases(t, c || {}, ctx.pres1(c)).zadrz },
      { key: 'faza', label: 'Faza u kojoj je pritvor određen', type: 'choice', choices: ['Istraga', 'Nakon podizanja optužnog akta', 'Nakon izricanja presude'], fn: (t, c, ctx) => {
        const f = t.Datumodre_x0111_ivanjapritvora; if (!isDate(f)) return null; const pod = (c || {}).Datumpodizanjaoptu_x017e_nice, p1 = ctx.pres1(c);
        return isDate(pod) && lt(f, pod) ? 'Istraga' : (!isDate(p1) || le(f, p1)) ? 'Nakon podizanja optužnog akta' : 'Nakon izricanja presude'; } },
      { key: 'brojProduzenja', label: 'Broj produženja pritvora', type: 'number', fn: t => Array.isArray(t.tok) && t.tok.length ? t.tok.filter(e => e && e.dogadjaj === 'produzen').length : [t.produzenIstraga, t.nakonOptuznog, t.nakonPresude].filter(x => x === true).length },
      { key: 'prestanak', label: 'Način prestanka pritvora', type: 'choice', choices: ['Pritvor ukinut', 'Zamijenjen jemstvom', 'Zamijenjen mjerom nadzora', 'Upućen na izdržavanje kazne', 'Trajao do pravosnažnosti'], fn: (t, c) => {
        const E = S.tokSort(t.tok), l = E[E.length - 1]; if (l && S.TOK_KRAJ.includes(l.dogadjaj)) return S.TOK_DOGADJAJI.find(x => x[0] === l.dogadjaj)[1];
        if (t.Pritvorjezamijenjenjemstvom) return 'Zamijenjen jemstvom'; if (t.Pritvorjezamijenjenmjeromnadzora) return 'Zamijenjen mjerom nadzora'; if (t.ukinut || isDate(t.Datumukidanjapritvora)) return 'Pritvor ukinut';
        return c && isDate(c.Odlaganjero_x010d_i_x0161_ta) ? 'Trajao do pravosnažnosti' : null; } },
      { key: 'brojOsnova', label: 'Jedan ili više pritvorskih osnova', type: 'choice', choices: ['Jedan osnov', 'Više osnova'], fn: t => { const n = osnoviOf(t).length; return n ? (n > 1 ? 'Više osnova' : 'Jedan osnov') : null; } },
    ],
    rocista: [{ key: 'odsutni', label: 'Odsutna lica (razlozi odlaganja)', type: 'multichoice', fn: h => S.rocRazlozi(h).odsutni.map(x => x.ucesnik) },
      { key: 'ostaliRazlozi', label: 'Ostali razlozi odlaganja', type: 'multichoice', fn: h => S.rocRazlozi(h).ostali }],
  };
  const SKIP_TYPES = new Set(['lookup', 'json', 'razlozi', 'mjereunosi']);
  function fieldCatalog(unitKey) {
    const l = S.LIST_BY_KEY[unitKey]; if (!l) return [];
    const own = F => F.filter(f => f.name && !SKIP_TYPES.has(f.type) && (!f.hidden || f.custom) && f.type !== 'djela');
    const typ = f => f.type === 'caseno' ? 'text' : f.type === 'longtext' ? 'text' : f.type;
    const out = own(S.fieldsOf(unitKey)).map(f => ({ id: 'f:' + f.name, name: f.name, label: f.label, type: typ(f), long: f.type === 'longtext', list: unitKey, group: l.isCase ? 'Predmet' : l.title }));
    const D = (k, F) => (DERIVED[S.baseKey(k)] || []).filter(d => !d.when || d.when(F)).map(d => ({ id: (k === unitKey ? 'd:' : 'cd:') + d.key, label: d.label, type: d.type, choices: d.choices, group: 'Izračunato' }));
    out.push(...D(unitKey, S.fieldsOf(unitKey)));
    if (!l.isCase) { const cF = S.fieldsOf(l.caseList); out.push(...own(cF).map(f => ({ id: 'c:' + f.name, name: f.name, label: f.label, type: typ(f), long: f.type === 'longtext', list: l.caseList, group: 'Predmet' })), ...D(l.caseList, cF)); }
    return out;
  }
  const BOOL_OPS = [['yes', 'je Da'], ['no', 'je Ne']];
  const FILTER_OPS = { bool: BOOL_OPS, choice: [['eq', 'je'], ['neq', 'nije'], ['filled', 'je upisano'], ['empty', 'nije upisano']], text: [['eq', 'je'], ['neq', 'nije'], ['contains', 'sadrži tekst'], ['filled', 'je upisano'], ['empty', 'nije upisano']],
    multichoice: [['has', 'sadrži'], ['nothas', 'ne sadrži'], ['filled', 'je upisano'], ['empty', 'nije upisano']],
    number: [['gt', 'veće od'], ['gte', 'najmanje'], ['lt', 'manje od'], ['lte', 'najviše'], ['eq', 'jednako'], ['filled', 'je upisano'], ['empty', 'nije upisano']],
    date: [['from', 'od datuma'], ['to', 'do datuma'], ['filled', 'je upisano'], ['empty', 'nije upisano']] };
  FILTER_OPS.money = FILTER_OPS.number;
  const AGGS = { count: 'Broj', cases: 'Broj različitih predmeta', pct: 'Procenat od ukupnog u koloni', pct_row: 'Procenat od broja u redu', sum: 'Zbir polja', avg: 'Prosjek polja',
    min: 'Najmanja vrijednost polja', max: 'Najveća vrijednost polja', dur_avg: 'Prosječno trajanje između dva datuma (dana)', dur_sum: 'Ukupno trajanje između dva datuma (dana)' };
  const blankV = v => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
  function makeGetter(unitKey, data) {
    const l = S.LIST_BY_KEY[unitKey], src = /_roc$/.test(l.space) ? (data.roc || {}) : data;
    const caseRecs = src[S.baseKey(l.caseList)] || [], caseById = new Map(caseRecs.map(c => [c._id, c]));
    const recs = l.isCase ? caseRecs : (src[S.baseKey(unitKey)] || []);
    const p1 = new Map(); for (const p of data.presuda1 || []) if (!p1.has(p.Predmet)) p1.set(p.Predmet, p);
    const ctx = { pres1: c => c ? (p1.get(c._id) || {}).Datumobjavljivanjapresude : null };
    const caseOf = r => l.isCase ? r : caseById.get(r.Predmet) || null;
    const der = (k, key) => (DERIVED[S.baseKey(k)] || []).find(d => d.key === key);
    const get = (r, id) => { if (!id) return null; const i = id.indexOf(':'), k = id.slice(0, i), n = id.slice(i + 1);
      if (k === 'f') return r[n]; if (k === 'c') return (caseOf(r) || {})[n];
      if (k === 'd') { const d = der(unitKey, n); return d ? d.fn(r, caseOf(r), ctx) : null; }
      if (k === 'cd') { const c = caseOf(r), d = der(l.caseList, n); return c && d ? d.fn(c, c, ctx) : null; } return null; };
    return { recs, get, caseOf };
  }
  function matches(get, r, f) {
    if (!f || !f.field || !f.op) return true; const v = get(r, f.field), x = f.value;
    switch (f.op) {
      case 'yes': return v === true; case 'no': return v !== true;
      case 'filled': return !blankV(v) && v !== false; case 'empty': return blankV(v) || v === false;
      case 'eq': return typeof v === 'number' ? v === Number(x) : String(v ?? '') === String(x ?? ''); case 'neq': return String(v ?? '') !== String(x ?? '');
      case 'contains': return String(v ?? '').toLowerCase().includes(String(x ?? '').toLowerCase());
      case 'has': return Array.isArray(v) ? v.includes(x) : v === x; case 'nothas': return Array.isArray(v) ? !v.includes(x) : v !== x;
      case 'gt': return typeof v === 'number' && v > Number(x); case 'gte': return typeof v === 'number' && v >= Number(x);
      case 'lt': return typeof v === 'number' && v < Number(x); case 'lte': return typeof v === 'number' && v <= Number(x);
      case 'from': return isDate(v) && isDate(x) && le(x, v); case 'to': return isDate(v) && isDate(x) && le(v, x);
      default: return true;
    }
  }
  function customTable(def, data, choicesOf) {
    data = prep(data);
    const empty = (cols, info) => ({ title: def.title || 'Nova tabela', columns: cols, rows: [], info, empty: true });
    if (!def.unit || !S.LIST_BY_KEY[def.unit]) return empty(['—'], 'Izaberite šta se broji.');
    const cat = fieldCatalog(def.unit), meta = id => cat.find(c => c.id === id);
    const { recs, get, caseOf } = makeGetter(def.unit, data);
    const base = recs.filter(r => (def.filters || []).every(f => matches(get, r, f)));
    const cols = (def.cols || []).length ? def.cols : [{ label: 'Broj', agg: 'count' }];
    const rf = def.rows && def.rows.field, rm = rf && meta(rf);
    let groups;
    const NU = 'Nije upisano';
    if (!rm) groups = [['Ukupno', base]];
    else {
      const t = rm.type, val = r => get(r, rf);
      const key = r => { const v = val(r);
        if (t === 'bool') return [v === true ? 'Da' : 'Ne'];
        if (t === 'multichoice') return blankV(v) ? [NU] : (Array.isArray(v) ? v : [v]);
        if (blankV(v)) return [NU];
        if (t === 'date') return [String(v).slice(0, 4)];
        if (t === 'number' || t === 'money') { const ed = String(def.rows.edges || '').split(/[,;\s]+/).map(Number).filter(x => isFinite(x) && x !== 0 || x === 0).filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b);
          if (!ed.length || !String(def.rows.edges || '').trim()) return [String(v)];
          let lo = null; for (const e of ed) { if (v <= e) return [lo === null ? `Do ${fmtNum(e)}` : `Od ${fmtNum(lo)} do ${fmtNum(e)}`]; lo = e; } return [`Preko ${fmtNum(lo)}`]; }
        return [typeof v === 'string' ? v.trim() : String(v)]; };
      const m = new Map(); for (const r of base) for (const k of key(r)) { if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
      let order;
      const isSud = rm.name === 'sud';
      if (t === 'bool') order = ['Da', 'Ne'];
      else if (t === 'choice' || t === 'multichoice') { const opts = rm.choices || (rm.name ? (choicesOf ? choicesOf(rm.list, rm.name) : S.fallbackChoices(rm.list, rm.name)) : []);
        order = [...opts, ...[...m.keys()].filter(k => !opts.includes(k) && k !== NU).sort((a, b) => a.localeCompare(b, 'sr'))]; if (!def.rows.all) order = order.filter(k => m.has(k)); }
      else if (t === 'number' || t === 'money') { order = [...m.keys()].filter(k => k !== NU); if (!String(def.rows.edges || '').trim()) order.sort((a, b) => Number(a) - Number(b));
        else { const lab = k => /^Do /.test(k) ? -Infinity : /^Preko /.test(k) ? Infinity : Number(String(k).replace(/^Od /, '').split(' do ')[0].replace(/\./g, '').replace(',', '.')); order.sort((a, b) => lab(a) - lab(b)); } }
      else order = [...m.keys()].filter(k => k !== NU).sort((a, b) => t === 'date' ? a.localeCompare(b) : (m.get(b).length - m.get(a).length) || a.localeCompare(b, 'sr'));
      if (def.rows.sort === 'count') order.sort((a, b) => (m.get(b) || []).length - (m.get(a) || []).length);
      if (m.has(NU)) order.push(NU);
      groups = order.map(k => [isSud && def.rows.short ? shortSud(k) : k, m.get(k) || []]);
      if (isSud && def.rows.courtGroups) { const sv = r => String(get(r, rf) || ''); groups.push(['OSNOVNI SUDOVI', base.filter(r => /^Osnovni/.test(sv(r)))], ['VIŠI SUDOVI', base.filter(r => /^Viši/.test(sv(r)))]); }
      if (def.rows.total !== false) groups.push([isSud && def.rows.courtGroups ? 'SVI SUDOVI' : 'Ukupno', base]);
    }
    const colRecs = (c, g) => g.filter(r => (c.filters || []).every(f => matches(get, r, f)));
    const num = (c, xs) => xs.map(r => { const v = get(r, c.field); return typeof v === 'number' && isFinite(v) ? v : null; }).filter(v => v !== null);
    const dur = (c, xs) => xs.map(r => { const a = get(r, c.field), b = get(r, c.field2); return isDate(a) && isDate(b) ? days(a, b) : null; }).filter(v => v !== null);
    const dec = c => c.decimals === 0 ? 0 : 2;
    const totals = cols.map(c => colRecs(c, base).length);
    const cell = (c, ci, g) => { const xs = colRecs(c, g);
      switch (c.agg) {
        case 'cases': return new Set(xs.map(r => (caseOf(r) || r)._id)).size;
        case 'pct': return pctR(xs.length, totals[ci]);
        case 'pct_row': return pctR(xs.length, g.length);
        case 'sum': { const v = num(c, xs); return v.length ? fmtNum(sum(v), dec(c)) : DASH; }
        case 'avg': { const v = num(c, xs); return v.length ? fmtNum(sum(v) / v.length, dec(c)) : DASH; }
        case 'min': { const v = num(c, xs); return v.length ? fmtNum(Math.min(...v), dec(c)) : DASH; }
        case 'max': { const v = num(c, xs); return v.length ? fmtNum(Math.max(...v), dec(c)) : DASH; }
        case 'dur_avg': { const v = dur(c, xs); return v.length ? fmtNum(sum(v) / v.length, dec(c)) : DASH; }
        case 'dur_sum': { const v = dur(c, xs); return v.length ? fmtNum(sum(v), 0) : DASH; }
        default: return xs.length;
      } };
    const rowHead = rm ? rm.label : '';
    const rows = groups.map(([k, g]) => [k, ...cols.map((c, ci) => cell(c, ci, g))]);
    return { title: def.title || 'Nova tabela', columns: [rowHead, ...cols.map((c, i) => c.label || AGGS[c.agg] || `Kolona ${i + 1}`)], rows: base.length || rm ? rows : [], info: def.info || null, empty: !base.length };
  }
  function reportTables(moduleKey, data, tcfg, opt) {
    opt = opt || {}; tcfg = tcfg || {};
    const std = report(moduleKey, data, null).map(t => { const k = `${moduleKey}:${t.no}`, o = (tcfg.titles || {})[k] || {};
      return { ...t, key: 's:' + t.no, origNo: t.no, origTitle: t.title, origInfo: t.info, title: o.title || t.title, info: o.info !== undefined ? o.info || null : t.info, hidden: !!o.hidden, renamed: !!(o.title || o.info !== undefined) }; });
    const cust = (tcfg.custom || []).filter(d => d.module === moduleKey && (d.ready || opt.admin)).map(d => {
      let t; try { t = customTable(d, data, opt.choicesOf); } catch (e) { t = { title: d.title, columns: ['Greška'], rows: [[String(e.message)]], info: null }; }
      return { ...t, key: 'c:' + d.id, custom: true, def: d, draft: !d.ready }; });
    const all = [...std, ...cust], ord = (tcfg.order || {})[moduleKey] || [];
    const pos = t => { const i = ord.indexOf(t.key); return i >= 0 ? i : ord.length + all.indexOf(t); };
    const sorted = all.map((t, i) => ({ t, i })).sort((a, b) => pos(a.t) - pos(b.t) || a.i - b.i).map(x => x.t).filter(t => !t.hidden || opt.showHidden);
    let n = 0; return sorted.map(t => ({ ...t, no: t.hidden ? null : ++n }));
  }

  const api = { TOPICS, MODULE_TOPICS, SPACE_TOPICS, compute, report, reportTables, customTable, fieldCatalog, FILTER_OPS, AGGS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Stats = api;
})(typeof self !== 'undefined' ? self : this);
