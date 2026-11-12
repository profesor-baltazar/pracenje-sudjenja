(function (root) {
  'use strict';
  const KZ = (typeof module !== 'undefined' && module.exports) ? require('./kz.js') : root.KZ;

  function isDate(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }
  function dayNum(v) { if (!isDate(v)) return null; const [y, m, d] = v.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; }
  function days(a, b) { const x = dayNum(a), y = dayNum(b); return x === null || y === null ? null : y - x; }
  function fmtDate(v) { if (!isDate(v)) return ''; const [y, m, d] = v.split('-'); return `${d}.${m}.${y}.`; }

  const RAZLOZI = ["101 - Neuredna dostava okrivljenom", "102 - Neuredna dostava tužiocu", "103 - Neuredna dostava svjedoku oštećenom", "104 - Neuredna dostava svjedoku", "105 - Neuredna dostava vještaku", "106 - Neuredna dostava tumaču", "107 - Neuredna dostava braniocu", "201 - Optuženi nije pristupio ročištu iako mu je poziv uredno uručen", "202 - Tužilac nije pristupio ročištu iako mu je poziv uredno uručen", "203 - Svjedok oštećeni nije pristupio ročištu iako mu je poziv uredno uručen", "204 - Svjedok nije pristupio ročištu iako mu je poziv uredno uručen", "205 - Vještak nije pristupio ročištu iako mu je poziv uredno uručen", "206 - Tumač nije pristupio ročištu iako mu je poziv uredno uručen", "207 - Branilac nije pristupio ročištu iako mu je poziv uredno uručen", "301 - Optuženi nije pristupio. Iz spisa predmeta se ne može utvrditi da li mu je poziv uredno uručen.", "302 - Tužilac nije pristupio. Iz spisa predmeta se ne može utvrditi da li mu je poziv uredno uručen.", "303 - Svjedok oštećeni nije pristupio. Iz spisa predmeta se ne može utvrditi da li mu je poziv uredno uručen.", "304 - Svjedok nije pristupio. Iz spisa predmeta se ne može utvrditi da li mu je poziv uredno uručen.", "305 - Vještak nije pristupio. Iz spisa predmeta se ne može utvrditi da li mu je poziv uredno uručen.", "306 - Tumač nije pristupio. Iz spisa predmeta se ne može utvrditi da li mu je poziv uredno uručen.", "307 - Branilac nije pristupio. Iz spisa predmeta se ne može utvrditi da li mu je poziv uredno uručen.", "401 - Odsustvo sudije", "402 - Nedostatak tehničkih uslova", "403 - Organizacijski razlozi na strani suda", "501 - Radi pribavljanja novih dokaza", "502 - Nalaz ili mišljenje vještaka nije dostavljeno na vrijeme", "503 - Dokazi nijesu dostavljeni od strane drugih organa", "504 - Potrebno dodatno vještačenje ili dopuna nalaza", "601 - Zahtjev branioca", "602 - Zahtjev tužioca", "603 - Zahtjev optuženog", "604 - Zahtjev za izuzeće", "605 - Sporazum stranaka", "701 - Privremena duševna poremećenost", "702 - Drugi zdravstveni razlozi", "703 - Viša sila (detaljnije u komentarima)", "704 - Drugi objektivni razlozi (detaljnije u komentarima)", "801 - Odsustvo više lica", "802 - Otkazivanje punomoćja braniocu", "803 - Drugi razlozi (detaljnije u komentarima)"];
  const OSNOVI_OKK = ['Opasnost od bjekstva', 'Koluziona opasnost', 'Iteracijska opasnost', 'Posebno teške okolnosti slučaja i opasnost po red i mir', 'Nedolazak na glavni pretres'];
  const OSNOVI_SVI = ['Opasnost od bjekstva', 'Koluziona opasnost', 'Iteracijska opasnost', 'Očuvanje javnog reda i mira', 'Izbjegavanje dolaska na glavni pretres'];
  const SUDOVI = ['Osnovni sud Bar', 'Osnovni sud Berane', 'Osnovni sud Bijelo Polje', 'Osnovni sud Cetinje', 'Osnovni sud Danilovgrad', 'Osnovni sud Herceg Novi', 'Osnovni sud Kolašin', 'Osnovni sud Kotor',
    'Osnovni sud Nikšić', 'Osnovni sud Plav', 'Osnovni sud Pljevlja', 'Osnovni sud Podgorica', 'Osnovni sud Rožaje', 'Osnovni sud Ulcinj', 'Viši sud Bijelo Polje', 'Viši sud Podgorica'];
  const DA_NE_NA = ['DA', 'NE', 'N/A'];

  const MODULES = [
    { key: 'svi', title: 'Praćenje suđenja', short: 'Praćenje suđenja', spaces: ['svi', 'svi_roc'] },
    { key: 'okk', title: 'Predmeti organizovanog kriminala i korupcije', short: 'Predmeti OKK', spaces: ['okk', 'okk_roc'] },
    { key: 'vaw', title: 'Nasilje nad ženama', short: 'Nasilje nad ženama', spaces: ['vaw'] },
  ];
  const SPACES = [
    { key: 'okk', module: 'okk', title: 'Uvid u spise', lists: [['predmeti', 'Osnovni podaci'], ['faze', 'Podaci o ponovljenom suđenju'], ['odlaganja', 'Odlaganje ročišta', 1], ['mjere', 'Mjere procesne discipline', 1],
      ['presuda1', 'Pravo na javno izricanje presude'], ['zalba', 'Drugostepeni postupak', 1], ['presuda2', 'Pravo na javno izricanje presude u drugostepenom postupku'], ['ishod', 'Ishod postupka'],
      ['pritvori', 'Pritvor', 1], ['jemstva', 'Jemstvo', 1], ['nadzor', 'Mjere nadzora', 1], ['vpl', 'Vanredni pravni ljekovi', 1], ['komentari', 'Komentari monitora', 1]] },
    { key: 'okk_roc', module: 'okk', title: 'Praćenje ročišta', lists: [['roc_predmeti', 'Praćeni predmet'], ['roc_rocista', 'Ročišta', 1]] },
    { key: 'svi', module: 'svi', title: 'Uvid u spise', lists: [['svi_predmeti', 'Osnovni podaci'], ['svi_faze', 'Podaci o ponovljenom suđenju'], ['svi_odlaganja', 'Odlaganje ročišta', 1], ['svi_mjere', 'Mjere procesne discipline', 1],
      ['svi_presuda1', 'Pravo na javno izricanje presude'], ['svi_zalba', 'Drugostepeni postupak', 1], ['svi_ishod', 'Ishod postupka'],
      ['svi_pritvori', 'Pritvor', 1], ['svi_jemstva', 'Jemstvo', 1], ['svi_nadzor', 'Mjere nadzora', 1], ['svi_vpl', 'Vanredni pravni ljekovi', 1], ['svi_komentari', 'Komentari monitora', 1]] },
    { key: 'svi_roc', module: 'svi', title: 'Praćenje ročišta', lists: [['svir_predmeti', 'Praćeni predmet'], ['svir_rocista', 'Ročišta', 1]] },
    { key: 'vaw', module: 'vaw', title: 'Predmeti', lists: [['vaw_predmeti', 'Podaci o predmetu']] },
  ];
  const LISTS = [];
  for (const sp of SPACES) sp.lists.forEach(([key, title, many], i) => LISTS.push({ key, title, many: !!many, space: sp.key, module: sp.module, isCase: i === 0, caseList: sp.lists[0][0] }));
  const LIST_BY_KEY = Object.fromEntries(LISTS.map(l => [l.key, l]));
  const SPACE_BY_KEY = Object.fromEntries(SPACES.map(s => [s.key, s]));
  const listsOf = spaceKey => LISTS.filter(l => l.space === spaceKey);
  const baseKey = k => k.replace(/^(svi_|svir_|roc_|vaw_)/, '');

  const FALLBACK_CHOICES = {
    'predmeti.Vrstapredmeta': ['Organizovani kriminal', 'Visoka korupcija'], 'roc_predmeti.Vrstapredmeta': ['Organizovani kriminal', 'Visoka korupcija'],
    'predmeti.Vrstaoptu_x017e_nogakta': ['Optužnica', 'Optužni predlog'],
    'predmeti.Podnosilac': ['SDT', 'Oštećeni kao tužilac'],
    'svi_predmeti.sud': SUDOVI, 'svir_predmeti.sud': SUDOVI, 'vaw_predmeti.sud': SUDOVI,
    'svi_predmeti.Vrstaoptu_x017e_nogakta': ['Optužni predlog', 'Optužnica', 'Privatna tužba', 'Drugo'],
    'svir_predmeti.optuzniAkt': ['Optužni predlog', 'Optužnica', 'Privatna tužba'], 'roc_predmeti.optuzniAkt': ['Optužnica', 'Optužni predlog'], 'svir_predmeti.manjina': ['Rom', 'Albanac', 'Stranac', 'Drugo'],
    'svi_predmeti.monitor': [], 'svir_predmeti.monitor': [], 'roc_predmeti.monitor': [], 'predmeti.monitor': [],
    'mjere.U_x010d_esnik': ['Optuženi', 'Branilac', 'Zakonski zastupnik', 'Punomoćnik', 'Oštećeni', 'Svjedok', 'Vještak', 'Tumač', 'Tužilac', 'Drugo lice'],
    'mjere.Mjera': ['Opomena', 'Novčana kazna', 'Udaljenje iz sudnice', 'Uskraćivanje dalje odbrane, odnosno zastupanja', 'Obavještenje višem državnom tužiocu', 'Prinudno dovođenje', 'Lokalna potjernica', 'Nacionalna potjernica', 'Međunarodna potjernica', 'Drugo'],
    'svi_mjere.Mjera': ['Opomena', 'Novčana kazna', 'Udaljenje iz sudnice', 'Prinudno dovođenje', 'Lokalna potjernica', 'Nacionalna potjernica', 'Međunarodna potjernica', 'Potjernica', 'Drugo'],
    'zalba.Odlukaudrugostepenompostupku': ['Žalba se odbacuje', 'Žalba se odbija', 'Presuda se ukida', 'Presuda se djelimično ukida', 'Presuda se preinačuje', 'Presuda se djelimično preinačuje'],
    'zalba.odlucivanje': ['Sjednica vijeća', 'Pretres pred drugostepenim sudom'],
    'pritvori.Osnovodre_x0111_ivanjapritvora': OSNOVI_OKK, 'pritvori.osnovDT': OSNOVI_OKK, 'pritvori.osnovOptuzni': OSNOVI_OKK, 'pritvori.osnovPresuda': OSNOVI_OKK,
    'svi_pritvori.Osnovodre_x0111_ivanjapritvora': OSNOVI_SVI, 'svi_pritvori.osnovDT': OSNOVI_SVI, 'svi_pritvori.osnovOptuzni': OSNOVI_SVI, 'svi_pritvori.osnovPresuda': OSNOVI_SVI,
    'pritvori.Fazapostupkaukojojjepritvorukinu': ['Faza istrage', 'Nakon podizanja optužnice', 'Nakon presude'],
    'svi_pritvori.Fazapostupkaukojojjepritvorukinu': ['Faza istrage', 'Faza suđenja', 'Nakon presude'],
    'pritvori.pol': ['M', 'Ž'], 'pritvori.obrazovanje': ['Nezavršena osnovna škola', 'Osnovna škola', 'Srednja stručna sprema', 'Viša škola', 'Visoka stručna sprema'],
    'pritvori.obrazlozenost': ['Obrazložen', 'Djelimično obrazložen', 'Neobrazložen'],
    'jemstva.Odlukasuda': ['Usvojeno', 'Odbijeno'],
    'jemstva.predlagac': ['Okrivljeni', 'Branilac', 'Drugo lice za okrivljenog'],
    'nadzor.mjere': ['Zabrana napuštanja stana', 'Zabrana napuštanja boravišta', 'Zabrana posjećivanja određenog mjesta ili područja', 'Obaveza povremenog javljanja državnom organu',
      'Zabrana pristupa ili sastajanja sa određenim licima', 'Privremeno oduzimanje putne isprave', 'Privremeno oduzimanje vozačke dozvole'],
    'nadzor.osnov': ['Opasnost od bjekstva', 'Ometanje vođenja krivičnog postupka', 'Iteracijska opasnost', 'Drugo'],
    'nadzor.predlagac': ['Sud po službenoj dužnosti', 'Državni tužilac', 'Oštećeni'],
    'predmeti.kontrolaNacin': ['Ročište za kontrolu optužnice', 'Bez ročišta – pisano izjašnjenje odbrane'],
    'pritvori.mjereNadzora': ['Zabrana napuštanja stana', 'Zabrana napuštanja boravišta', 'Obaveza javljanja državnom organu', 'Privremeno oduzimanje putne isprave',
      'Privremeno oduzimanje vozačke dozvole', 'Zabrana posjećivanja određenih mjesta', 'Zabrana približavanja i komunikacije sa određenim licima', 'Elektronski nadzor', 'Drugo'],
    'vaw_predmeti.glavnaSankcija': ['Kazna zatvora', 'Kazna zatvora koja se izvršava u prostorijama za stanovanje', 'Uslovna osuda', 'Uslovna osuda sa zaštitnim nadzorom',
      'Kazna rada u javnom interesu', 'Novčana kazna', 'Mjera bezbjednosti', 'Oslobađajuća presuda', 'Odbijajuća presuda'],
    'vpl.vrsta': ['Zahtjev za zaštitu zakonitosti', 'Zahtjev za vanredno ublažavanje kazne', 'Zahtjev za ponavljanje postupka'],
    'odlaganja.Razlogodlaganja': RAZLOZI,
    'rocista.objasnio': ['Objasnio', 'Pročitao'], 'rocista.prekidRazlog': ['Radi pripremanja odbrane', 'Radi odmora', 'Drugo'],
    'rocista.dovodjenjeLice': ['Optuženi', 'Svjedok', 'Vještak', 'Oštećeni'],
    'vaw_predmeti.krivicnoDjelo': ['Nasilje u porodici ili u porodičnoj zajednici', 'Proganjanje', 'Nedozvoljene polne radnje', 'Seksualno uznemiravanje', 'Silovanje', 'Ugrožavanje sigurnosti'],
  };
  function choiceKeys(listKey, name) { return [`${listKey}.${name}`, `${baseKey(listKey)}.${name}`]; }
  function fallbackChoices(listKey, name) { for (const k of choiceKeys(listKey, name)) if (FALLBACK_CHOICES[k]) return FALLBACK_CHOICES[k]; return []; }

  // oznake upisnika po modulima
  const OZNAKE = { okk: ['Ks'], okk_roc: ['Ks', 'KvSo'], svi: ['K', 'Km', 'Ks'], svi_roc: ['K', 'Km', 'Kvo', 'Ks', 'KvSo'], vaw: ['K', 'Km'] };
  const SPECIJALNE = ['Ks', 'KvSo', 'KtS'];
  const OZNAKE_AKT = { okk: ['KtS'], svi: ['Kt', 'KtS'], vaw: ['Kt'] };
  const oznakeFor = (listKey, rec, kind) => { const sp = (LIST_BY_KEY[listKey] || {}).space, all = kind === 'akt' ? (OZNAKE_AKT[sp] || ['Kt', 'KtS']) : (OZNAKE[sp] || ['K', 'Ks']);
    return (sp === 'svi' || sp === 'svi_roc') && rec && rec.sud !== 'Viši sud Podgorica' ? all.filter(o => !SPECIJALNE.includes(o)) : all; };
  const POZNATE = ['K', 'Km', 'Ks', 'Kvo', 'KvSo', 'Kt', 'KtS'];
  const ozCase = o => o ? (POZNATE.find(x => x.toLowerCase() === o.toLowerCase()) || o[0].toUpperCase() + o.slice(1).toLowerCase()) : null;
  function splitCaseNo(v) { const m = String(v || '').match(/^\s*([A-Za-zČčŠšŽž]{1,4})\.?\s*(?:br\.?\s*)?(.*)$/); return m ? { oz: ozCase(m[1]), rest: m[2].trim() } : { oz: null, rest: String(v || '').trim() }; }
  function normCaseNo(v, defOz, allowed) {
    const p = splitCaseNo(v), oz = p.oz || defOz;
    const m = p.rest.match(/^(\d{1,6})\s*[\/\-\s.]\s*(\d{4}|\d{2})(?!\d)(?:\s*-\s*(\d{1,6}))?$/);
    if (!m) return { ok: false, err: /^\d{1,6}\s*[\/\-\s.]\s*\d(?!\d)/.test(p.rest) ? 'Godina mora imati dvije cifre (npr. 20/23).' : 'Upišite broj u obliku 20/23.' };
    if (!oz) return { ok: false, err: 'Izaberite oznaku predmeta.' };
    if (allowed && !allowed.includes(oz)) return { ok: false, err: `Oznaka ${oz} ovdje nije predviđena (dozvoljeno: ${allowed.join(', ')}).` };
    return { ok: true, value: `${oz} ${Number(m[1])}/${m[2].slice(-2)}${m[3] ? '-' + m[3] : ''}` };
  }
  const caseNoField = (name, label, extra = {}) => ({ name, label, type: 'caseno', hint: 'Izaberite oznaku i upišite broj i godinu, npr. 20/23 (može i „ks20/23”).', ...extra,
    check: (r, ctx) => { const v = r[name]; if (!v) return null;
      const al = ctx && ctx.listKey ? oznakeFor(ctx.listKey, LIST_BY_KEY[ctx.listKey].isCase ? r : ctx.case || null, extra.kind) : ctx && ctx.oznake;
      const n = normCaseNo(v, null, al);
      return !n.ok ? n.err : n.value !== v ? `Broj predmeta treba da glasi „${n.value}”.` : null; } });
  const DODACI = [['pokusaj', 'u pokušaju', 20], ['saizvrsilastvo', 'u saizvršilaštvu', 23], ['podstrekavanje', 'podstrekavanje', 24],
    ['pomaganje', 'pomaganje', 25], ['sticaj', 'u sticaju', 48], ['produzeno', 'produženo krivično djelo', 49]];
  const normClan = v => String(v || '').trim().toLowerCase().replace(/^čl\.?\s*/, '').replace(/\s+/g, '');
  const kzClan = c => { const v = KZ && KZ.CLANOVI[normClan(c)]; return v ? { clan: normClan(c), naziv: v[0], glava: KZ.GLAVE[v[1]], stavova: v[2] || 1, tacke: v[3] || {} } : null; };
  const tackeU = (k, stav) => k ? (k.stavova > 1 ? (stav ? k.tacke[String(stav)] || 0 : 0) : k.tacke['0'] || 0) : 0;
  function djeloText(d) {
    if (!d) return ''; const k = kzClan(d.clan), dd = DODACI.filter(x => (d.dodaci || []).includes(x[0]));
    const ref = d.clan ? `čl. ${normClan(d.clan)}${d.stav ? ' st. ' + d.stav : ''}${d.tacka ? ' tač. ' + d.tacka : ''}${dd.length ? ' u vezi sa čl. ' + dd.map(x => x[2]).join(', ') : ''}` : '';
    const naziv = k ? k.naziv : (d.naziv || '');
    return `${d.optuzeni ? d.optuzeni + ': ' : ''}${[ref, naziv].filter(Boolean).join(' – ')}${dd.length ? ' (' + dd.map(x => x[1]).join(', ') + ')' : ''}`;
  }
  const djelaText = list => (Array.isArray(list) ? list : []).map(djeloText).filter(Boolean).join('; ');
  // stari zapis tipa "220/5", "239/1, 240"
  function parseDjela(clanTxt, nazivTxt) {
    const out = [], all = `${clanTxt || ''} ${nazivTxt || ''}`;
    for (const m of all.matchAll(/(?:čl\.?\s*)?(?<![\d/])(\d{3}[a-z]?)(?:\s*\/\s*(\d+))?/gi))
      if (kzClan(m[1]) && !out.some(x => x.clan === normClan(m[1]))) { const st = m[2] ? Number(m[2]) : null, k = kzClan(m[1]);
        const stav = st && k.stavova > 1 && st <= k.stavova ? st : null, tacka = st && k.stavova === 1 && st <= tackeU(k, null) ? st : null;
        out.push({ clan: normClan(m[1]), stav, tacka, dodaci: [], optuzeni: null }); }
    if (!out.length) for (const part of String(nazivTxt || clanTxt || '').split(/[+,;]| i (?=[a-zčšž])/i)) {
      const n = part.toLowerCase().replace(/\s*\(.*$/, '').replace(/[?!.]+$/, '').trim();
      const hit = n && Object.entries(KZ ? KZ.CLANOVI : {}).find(([, v]) => v[0].toLowerCase() === n);
      if (hit && !out.some(x => x.clan === hit[0])) out.push({ clan: hit[0], stav: null, dodaci: [], optuzeni: null });
    }
    const veze = [...all.matchAll(/u\s+vezi\s+(?:sa?\s+)?(?:čl\.?\s*)?((?:\d{2}(?!\d)[\s,i]*)+)/gi)].flatMap(m => m[1].match(/\d{2}/g) || []).map(Number);
    const dod = DODACI.filter(([id, , cl]) => veze.includes(cl) || ({ pokusaj: /pokuša/i, saizvrsilastvo: /saizvrš/i, podstrekavanje: /podstrek/i, pomaganje: /pomagan/i, sticaj: /sticaj/i, produzeno: /produžen/i })[id].test(all)).map(x => x[0]);
    if (dod.length) for (const d of out) d.dodaci = [...dod];
    return out;
  }
  const SDT_IZMJENE = '2024-06-19';
  const rng = (a, b) => Object.keys(KZ ? KZ.CLANOVI : {}).filter(c => { const n = parseInt(c, 10); return n >= a && n <= b; });
  // nadleznost SDT (Zakon o SDT, cl. 3)
  const SDT_GRUPE = {
    organizovani: { naziv: 'organizovani kriminal', clanovi: ['401a'] },
    korupcija: { naziv: 'korupcija', clanovi: ['416', '419', '422', '422a', '423', '424'] },
    privreda: { naziv: 'visoka korupcija – imovinska korist preko 40.000 €', clanovi: ['272', '276'], samoStaro: true },
    pranje: { naziv: 'pranje novca', clanovi: ['268'] },
    terorizam: { naziv: 'terorizam', clanovi: ['447', '447a', '447b', '447c', '447d', '449', '449a', '449b'] },
    ratni: { naziv: 'ratni zločini', clanovi: rng(426, 442) },
    izborna: { naziv: 'povreda izbornih prava (Glava 16 KZ)', clanovi: rng(184, 194), samoStaro: true },
  };
  const sdtRezim = c => c && isDate(c.Datumpodizanjaoptu_x017e_nice) ? (c.Datumpodizanjaoptu_x017e_nice < SDT_IZMJENE ? 'staro' : 'novo') : null;
  const sdtDozvoljen = (clan, rezim) => Object.values(SDT_GRUPE).some(g => g.clanovi.includes(normClan(clan)) && !(g.samoStaro && rezim === 'novo'));
  const isOkk = listKey => /^(okk|okk_roc)$/.test((LIST_BY_KEY[listKey] || {}).space || '');
  function sdtProvjera(djela, c) {
    const l = (djela || []).filter(d => d.clan && kzClan(d.clan)); if (!l.length) return {};
    if (l.some(d => normClan(d.clan) === '401a')) return {};
    const rz = sdtRezim(c), zak = rz === 'novo' ? 'Zakonu o SDT (izmjene od 19.6.2024)' : rz === 'staro' ? 'Zakonu o SDT iz 2015/2016 (optužni akt podnijet prije 19.6.2024)' : 'Zakonu o SDT';
    const van = l.filter(d => !sdtDozvoljen(d.clan, rz)).map(d => `čl. ${normClan(d.clan)} (${kzClan(d.clan).naziv})`);
    if (van.length) return { err: `Nije u nadležnosti SDT-a po ${zak}: ${van.join(', ')}. Ako je djelo učinjeno u okviru kriminalne organizacije, dodajte i čl. 401a.` };
    if (rz === 'novo') { const p = l.find(d => normClan(d.clan) === '268');
      if (p && p.stav && ![3, 4].includes(Number(p.stav))) return { err: 'Po izmjenama Zakona o SDT (od 19.6.2024) u nadležnosti SDT-a je samo pranje novca iz čl. 268 st. 3 i 4.' };
      if (p && !p.stav) return { warn: 'Pranje novca: po izmjenama Zakona o SDT nadležnost postoji samo za čl. 268 st. 3 i 4 – upišite stav.' }; }
    return {};
  }
  const djelaField = { name: 'djela', label: 'Krivična djela', type: 'djela', wide: true,
    hint: 'Upišite član KZ (npr. 143 ili 168a) – naziv se popunjava sam. Stav nije obavezan. Dodatke označite po potrebi.',
    check: (r, ctx) => { const bad = (r.djela || []).filter(d => d.clan && !kzClan(d.clan)).map(d => d.clan);
      if (bad.length) return `Član ${bad.join(', ')} ne postoji u posebnom dijelu KZ-a.`;
      const st = (r.djela || []).filter(d => d.stav && kzClan(d.clan) && d.stav > kzClan(d.clan).stavova).map(d => { const n = kzClan(d.clan).stavova; return `čl. ${d.clan} ima ${n === 1 ? 'samo jedan stav' : n + (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? ' stava' : ' stavova')}`; });
      if (st.length) return `Takav stav ne postoji: ${st.join('; ')}.`;
      const tk = (r.djela || []).filter(d => d.tacka && kzClan(d.clan) && d.tacka > tackeU(kzClan(d.clan), d.stav)).map(d => `čl. ${d.clan}${d.stav ? ' st. ' + d.stav : ''}`);
      if (tk.length) return `Takva tačka ne postoji: ${tk.join('; ')}.`;
      return null; } };
  const isOptuznica = r => r.Vrstaoptu_x017e_nogakta === 'Optužnica';
  // izmjene ZKP-a, primjenjuju se samo na nove predmete
  const ZKP_IZMJENE_2026 = '2026-09-17';
  const noviZKP = c => !!c && isDate(c.Datumpodizanjaoptu_x017e_nice) && c.Datumpodizanjaoptu_x017e_nice >= ZKP_IZMJENE_2026;
  const noviCtx = (r, ctx) => !!(ctx && ctx.noviZKP);
  function addMonths(d, n) { const [y, m, day] = d.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    t.setUTCDate(Math.min(day, last)); return t.toISOString().slice(0, 10); }
  function potvrdaRok(r) {
    const P = r.Datumrje_x0161_enjaopotvr_x0111_; if (!isDate(P) || !noviZKP(r)) return null;
    const rok = r.slozen === true ? 15 : 8;
    if (/Bez ročišta/.test(r.kontrolaNacin || '')) {
      let od = isDate(r.datumIzjasnjenja) ? r.datumIzjasnjenja : null, opis = 'od izjašnjenja odbrane';
      if (!od && isDate(r.datumDostaveOptuznice)) { const t = new Date(r.datumDostaveOptuznice + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 15); od = t.toISOString().slice(0, 10); opis = 'od isteka roka za izjašnjenje'; }
      return od ? { dana: days(od, P), rok, od: opis } : null;
    }
    return isDate(r.Datumro_x010d_i_x0161_tazakontro) ? { dana: days(r.Datumro_x010d_i_x0161_tazakontro, P), rok, od: 'od ročišta za kontrolu' } : null;
  }
  const P = target => ({ name: 'Predmet', label: 'Predmet', type: 'lookup', target, required: true });

  function predmetiForm(mod) {
    const svi = mod === 'svi';
    return [
      { section: 'Osnovni podaci' },
      svi ? { name: 'sud', label: 'Sud', type: 'choice', required: true } : null,
      caseNoField('Title', 'Broj predmeta', { required: true }), { name: 'napomenaBroja', label: 'Napomena uz broj predmeta', type: 'text', hint: 'Npr. saizvršilaštvo – 1. okrivljeni, preuzet iz OS Herceg Novi' },
      svi ? null : { name: 'Vrstapredmeta', label: 'Vrsta predmeta', type: 'choice' },
      { name: 'monitor', label: 'Monitor', type: 'choice', allowNew: true, hidden: true },
      ...(svi ? [djelaField, { name: 'krivicnoDjelo', label: 'Krivično djelo', type: 'text', hidden: true }] : [{ name: 'krivicnoDjelo', label: 'Krivična djela iz optužnice', type: 'longtext', hint: 'Nije obavezno – za vaše potrebe, npr. za opis predmeta u izvještaju.' }]),
      { name: 'clanKZ', label: 'Član KZCG', type: 'text', hidden: true },
      { name: 'Ponovljenipostupak', label: 'Ponovljeni postupak', type: 'bool', hidden: true },
      { name: 'Pritvorskipredmet', label: 'Pritvorski predmet', type: 'bool', hint: 'Uključuje korak „Pritvor”.' },
      { name: 'Predlo_x017e_enojemstvo', label: 'Predloženo jemstvo', type: 'bool', hint: 'Uključuje korak „Jemstvo”.' },
      { name: 'kontrolniZahtjev', label: 'Kontrolni zahtjev (zahtjev za ubrzanje postupka)', type: 'bool' },
      { name: 'sporazum', label: 'Zaključen sporazum o priznanju krivice', type: 'bool' },
      { name: 'Brojoptu_x017e_enihlica', label: 'Broj optuženih lica', type: 'number' },
      svi ? { name: '_razloziAS', label: 'Zbirni razlozi odlaganja iz AppSheeta', type: 'json', hidden: true } : null,
      { name: 'nijeBilo', label: 'Koraci u kojima nije bilo događaja', type: 'json', hidden: true },
      { section: 'Optužni akt' },
      caseNoField('Brojoptu_x017e_nice', 'Broj optužnog akta', { kind: 'akt', hint: 'Izaberite oznaku (Kt / KtS) i upišite broj i godinu, npr. 118/18.' }),
      { name: 'Vrstaoptu_x017e_nogakta', label: 'Vrsta optužnog akta', type: 'choice' },
      svi ? null : { name: 'Podnosilac', label: 'Podnosilac', type: 'choice' },
      { name: 'Datumpodizanjaoptu_x017e_nice', label: 'Datum podizanja optužnog akta', type: 'date' },
      { name: 'Datumprijemaoptu_x017e_niceusud', label: 'Datum prijema optužnog akta u sud', type: 'date',
        check: r => days(r.Datumpodizanjaoptu_x017e_nice, r.Datumprijemaoptu_x017e_niceusud) < 0 ? 'Datum prijema ne može biti prije datuma podizanja optužnog akta.' : null },
      { section: 'Kontrola optužnice', show: isOptuznica },
      { name: 'kontrolaNacin', label: 'Način kontrole optužnice', type: 'choice', show: r => isOptuznica(r) && noviZKP(r),
        hint: 'Po izmjenama ZKP-a iz 2026. (čl. 293) ročište je izuzetak za složene predmete; inače se optužnica dostavlja odbrani na izjašnjenje u roku od 15 dana.' },
      { name: 'slozen', label: 'Sud je predmet ocijenio kao složen', type: 'bool', show: noviZKP, hint: 'Duži zakonski rokovi: potvrđivanje 15 dana, objavljivanje presude 15 dana, izrada presude 4 mjeseca.' },
      { name: 'datumDostaveOptuznice', label: 'Datum dostavljanja optužnice okrivljenom i braniocu', type: 'date', show: r => isOptuznica(r) && noviZKP(r) && /Bez ročišta/.test(r.kontrolaNacin || '') },
      { name: 'datumIzjasnjenja', label: 'Datum izjašnjenja odbrane na optužnicu', type: 'date', show: r => isOptuznica(r) && noviZKP(r) && /Bez ročišta/.test(r.kontrolaNacin || ''),
        check: r => { const d = days(r.datumDostaveOptuznice, r.datumIzjasnjenja); return d !== null && d > 15 ? { warn: `Izjašnjenje je podneseno ${d} dana od dostavljanja (rok je 15 dana – čl. 293 st. 3).` } : null; } },
      { name: 'Datumro_x010d_i_x0161_tazakontro', label: 'Datum ročišta za kontrolu optužnice', type: 'date', show: r => isOptuznica(r) && !(noviZKP(r) && /Bez ročišta/.test(r.kontrolaNacin || '')),
        check: r => { const d = days(r.Datumprijemaoptu_x017e_niceusud, r.Datumro_x010d_i_x0161_tazakontro);
          if (d !== null && d < 0) return 'Ročište za kontrolu ne može biti prije prijema optužnice u sud.';
          if (d !== null && d > 15) return { warn: noviZKP(r) ? `Ročište je održano ${d} dana nakon prijema optužnice (ročište se zakazuje u roku od 15 dana – čl. 293 st. 4).` : `Ročište je održano ${d} dana nakon prijema optužnice (zakonski rok je 15 dana).` };
          return null; } },
      { name: 'koTuzilac', label: 'Ročištu prisustvovao tužilac', type: 'bool', show: isOptuznica },
      { name: 'koOkrivljeni', label: 'Ročištu prisustvovao okrivljeni', type: 'bool', show: isOptuznica },
      { name: 'koBranilac', label: 'Ročištu prisustvovao branilac', type: 'bool', show: isOptuznica },
      { name: 'Optu_x017e_nicavra_x0107_enatu_x', label: 'Optužni akt vraćen tužiocu na izmjenu i dopunu', type: 'bool' },
      { name: 'Razlozivra_x0107_anjaoptu_x017e_', label: 'Razlozi vraćanja optužnog akta', type: 'longtext', show: r => r.Optu_x017e_nicavra_x0107_enatu_x === true },
      { name: 'primjedbePodnesene', label: 'Podnesene primjedbe na optužnicu', type: 'bool', show: isOptuznica },
      { name: 'Primjedbenaoptu_x017e_nicu', label: 'Primjedbe na optužnicu', type: 'longtext', show: r => isOptuznica(r) && r.primjedbePodnesene === true },
      { name: 'Datumrje_x0161_enjaopotvr_x0111_', label: 'Datum rješenja o potvrđivanju optužnice', type: 'date', show: isOptuznica,
        check: r => { if (days(r.Datumro_x010d_i_x0161_tazakontro, r.Datumrje_x0161_enjaopotvr_x0111_) < 0) return 'Potvrđivanje ne može biti prije ročišta za kontrolu optužnice.';
          const p = potvrdaRok(r); return p && p.dana > p.rok ? { warn: `Optužnica je potvrđena ${p.dana} dana ${p.od} (rok je ${p.rok} dana – čl. 296 st. 1).` } : null; } },
      { section: 'Glavni pretres' },
      { name: 'Datumnaredbezaodr_x017e_avanjegl', label: 'Datum naredbe za održavanje glavnog pretresa', type: 'date',
        check: r => { if (days(r.Datumrje_x0161_enjaopotvr_x0111_, r.Datumnaredbezaodr_x017e_avanjegl) < 0) return 'Naredba ne može biti prije rješenja o potvrđivanju optužnice.';
          return isDate(r.Datumrje_x0161_enjaopotvr_x0111_) && isDate(r.Datumnaredbezaodr_x017e_avanjegl) && r.Datumnaredbezaodr_x017e_avanjegl > addMonths(r.Datumrje_x0161_enjaopotvr_x0111_, 2)
            ? { warn: 'Glavni pretres nije određen u roku od dva mjeseca od potvrđivanja optužnice (čl. 304 st. 2).' } : null; } },
      { name: 'Datumzakazivanjaprvogro_x010d_i_', label: 'Datum zakazivanja prvog ročišta', type: 'date',
        check: r => days(r.Datumnaredbezaodr_x017e_avanjegl, r.Datumzakazivanjaprvogro_x010d_i_) <= 0 ? 'Prvo ročište mora biti nakon dana naredbe za održavanje glavnog pretresa.' : null },
      { name: 'Brojodr_x017e_anihro_x010d_i_x01', label: 'Broj održanih ročišta', type: 'number' },
      { name: 'Brojodlo_x017e_enihro_x010d_i_x0', label: 'Broj odloženih ročišta', type: 'number',
        check: (r, ctx) => { const n = ctx && ctx.odlaganjaCount;
          return n && r.Brojodlo_x017e_enihro_x010d_i_x0 != null && r.Brojodlo_x017e_enihro_x010d_i_x0 < n ? { warn: `U koraku „Odlaganje ročišta” je uneseno ${n} odlaganja.` } : null; } },
      { name: 'Odlaganjero_x010d_i_x0161_ta', label: 'Datum pravosnažnosti', type: 'date',
        check: r => { if (days(r.Datumpodizanjaoptu_x017e_nice, r.Odlaganjero_x010d_i_x0161_ta) < 0) return 'Pravosnažnost ne može biti prije podizanja optužnog akta.';
          if (days(r.Datumzakazivanjaprvogro_x010d_i_, r.Odlaganjero_x010d_i_x0161_ta) < 0) return 'Pravosnažnost ne može biti prije prvog ročišta.'; return null; } },
    ].filter(Boolean);
  }
  function presudaForm(target, objLabel) {
    const afterPub = f => r => days(r.Datumobjavljivanjapresude, r[f]) < 0 ? 'Dostavljanje ne može biti prije objavljivanja presude.' : null;
    return [P(target),
      { name: 'Datumzavr_x0161_etkaglavnogpretr', label: 'Datum završetka glavnog pretresa', type: 'date',
        check: (r, ctx) => { const last = ctx && ctx.lastAdjournedTo;
          return last && days(last, r.Datumzavr_x0161_etkaglavnogpretr) < 0 ? `Glavni pretres ne može biti završen prije posljednjeg ročišta (${fmtDate(last)}).` : null; } },
      { name: 'Datumobjavljivanjapresude', label: objLabel, type: 'date',
        check: r => days(r.Datumzavr_x0161_etkaglavnogpretr, r.Datumobjavljivanjapresude) < 0 ? 'Presuda ne može biti objavljena prije završetka glavnog pretresa.' : null },
      { section: 'Dostavljanje pisanog otpravka presude' },
      { name: 'Datumdostavljanjapisanogotpravka', label: 'Optuženom', type: 'date', check: afterPub('Datumdostavljanjapisanogotpravka') },
      { name: 'Datumdostavljanjapisanogotpravka0', label: 'Braniocu', type: 'date', check: afterPub('Datumdostavljanjapisanogotpravka0') },
      { name: 'Datumdostavljanjapisanogotpravka1', label: 'Tužiocu', type: 'date', check: afterPub('Datumdostavljanjapisanogotpravka1') }];
  }
  const odlaganjaForm = t => [P(t),
    { name: 'Odlo_x017e_enood', label: 'Ročište odloženo dana', type: 'date', required: true,
      check: (r, ctx) => { if (!ctx || ctx.brojOdlozenih === undefined) return null;
        const n = (ctx.odlaganjaCount || 0) + (ctx.editId ? 0 : 1), b = Number(ctx.brojOdlozenih) || 0, gdje = (r.faza || 1) > 1 ? '„Podaci o ponovljenom suđenju”' : '„Osnovni podaci”';
        if (!b) return { warn: `U koraku ${gdje} nije upisan broj odloženih ročišta. Vratite se na taj korak i upišite ga.` };
        return n > b ? { warn: `U koraku ${gdje} je upisano ${b} odloženih ročišta, a ovo je ${n}. odlaganje. Vratite se na taj korak i ispravite broj.` } : null; } },
    { name: 'Odlo_x017e_enodo', label: 'Odloženo do (novi datum ročišta)', type: 'date', check: r => days(r.Odlo_x017e_enood, r.Odlo_x017e_enodo) <= 0 ? 'Novi datum mora biti nakon datuma odlaganja.' : null },
    { name: 'Razlogodlaganja', label: 'Razlog odlaganja', type: 'choice' },
    { name: 'Detalji', label: 'Detalji', type: 'longtext' }];
  const mjereForm = t => [P(t),
    { name: 'U_x010d_esnik', label: 'Učesnik', type: 'choice', required: true },
    { name: 'Mjera', label: 'Mjera', type: 'choice', required: true, dependsOn: 'U_x010d_esnik',
      filter: (value, r) => { const u = r.U_x010d_esnik;
        if (u === 'Tužilac') return ['Obavještenje višem državnom tužiocu', 'Drugo'].includes(value);
        if (value === 'Obavještenje višem državnom tužiocu') return false;
        if (value === 'Novčana kazna' && u === 'Optuženi') return false;
        if (value === 'Uskraćivanje dalje odbrane, odnosno zastupanja' && !['Branilac', 'Punomoćnik'].includes(u)) return false;
        if (['Lokalna potjernica', 'Nacionalna potjernica', 'Međunarodna potjernica'].includes(value) && u !== 'Optuženi') return false;
        if (value === 'Prinudno dovođenje' && !['Optuženi', 'Oštećeni', 'Svjedok', 'Vještak'].includes(u)) return false;
        return true; } },
    { name: 'Nov_x010d_anakazna', label: 'Iznos novčane kazne (€)', type: 'money', max: 1000, maxIf: noviCtx, maxMsg: 'Novčana kazna može iznositi najviše 1.000 € (čl. 119, 251 i 321 ZKP).', show: r => r.Mjera === 'Novčana kazna' },
    { name: 'Upravapolicijenijepostupilaponar', label: 'Uprava policije nije postupila po naredbi za dovođenje', type: 'bool', show: r => r.Mjera === 'Prinudno dovođenje' },
    { name: 'Upravapolicijenijeobavijestilasu', label: 'Uprava policije nije obavijestila sud o razlozima nepostupanja', type: 'bool', show: r => r.Mjera === 'Prinudno dovođenje' },
    { name: 'Detalji', label: 'Detalji', type: 'longtext' }];
  const zalbaForm = t => [P(t),
    { name: 'Datumpodno_x0161_enja_x017e_albe', label: 'Datum podnošenja žalbe', type: 'date' },
    { name: 'Datumdono_x0161_enjadrugostepene', label: 'Datum donošenja drugostepene odluke', type: 'date',
      check: r => days(r.Datumpodno_x0161_enja_x017e_albe, r.Datumdono_x0161_enjadrugostepene) < 0 ? 'Odluka ne može biti donesena prije podnošenja žalbe.' : null },
    { name: 'odlucivanje', label: 'Odlučivanje po žalbi', type: 'choice' },
    { name: 'Odlukaudrugostepenompostupku', label: 'Odluka u drugostepenom postupku', type: 'choice' }];
  const ishodForm = t => [P(t),
    { name: 'sankcija', label: 'Sankcija koju je sud izrekao (ukratko)', type: 'text' },
    { name: 'Prvostepenapresuda', label: 'Prvostepena presuda', type: 'longtext' },
    { name: 'Pravosna_x017e_napresuda', label: 'Pravosnažna presuda', type: 'longtext' }];
  const datOd = r => r.Datumodre_x0111_ivanjapritvora;
  let pritvoriForm = function (t) {
    const after = (f, base, msg) => r => days(r[base], r[f]) < 0 ? msg : null;
    return [P(t),
      { name: 'liceBr', label: 'Lice', type: 'number', hidden: true },
      ...['Okrivljeni_x002f_Optu_x017e_eni', 'pol', 'godinaRodjenja', 'drzavljanstvo', 'porodicniStatus', 'obrazovanje', 'ranijaOsudjivanost', 'Su_x0111_enjeuodsustvu']
        .map(name => ({ name, label: name, type: /^(ranijaOsudjivanost|Su_x0111_enjeuodsustvu)$/.test(name) ? 'bool' : name === 'godinaRodjenja' ? 'number' : 'text', hidden: true })),
      { section: 'Zadržavanje' },
      { name: 'zadrzavanje', label: 'Licu je određeno zadržavanje', type: 'bool' },
      { name: 'zadrzavanjeDatum', label: 'Datum rješenja o zadržavanju', type: 'date', show: r => r.zadrzavanje === true },
      { section: 'Određivanje pritvora' },
      { name: 'Datumodre_x0111_ivanjapritvora', label: 'Datum određivanja pritvora', type: 'date', required: true,
        check: r => { const z = days(r.zadrzavanjeDatum, datOd(r)); if (z !== null && z < 0) return 'Pritvor ne može biti određen prije zadržavanja.';
          if (z !== null && z > 3) return { warn: `Između zadržavanja i pritvora je ${z} dana – zadržavanje traje najduže 72 časa (čl. 267 st. 1).` }; return null; } },
      { name: 'osnovDT', label: 'Osnov koji je tužilac naveo u predlogu', type: 'multichoice', half: true, vertical: true, rowStart: true },
      { name: 'Osnovodre_x0111_ivanjapritvora', label: 'Osnov koji je sud prihvatio', type: 'multichoice', half: true, vertical: true },
      { name: 'clanoviZKP', label: 'Pravni osnov (članovi ZKP)', type: 'text', hidden: true },
      { name: 'obrazlozenost', label: 'Obrazloženost rješenja o pritvoru', type: 'choice' },
      { name: 'obrazlozenostPojasnjenje', label: 'Pojašnjenje', type: 'longtext', show: r => !!r.obrazlozenost && r.obrazlozenost !== 'Obrazložen' },
      { name: 'produzenIstraga', label: 'Pritvor u istrazi produžen', type: 'bool' },
      { name: 'produzenIstragaDatum', label: 'Datum rješenja o produženju u istrazi', type: 'date', show: r => r.produzenIstraga === true, check: after('produzenIstragaDatum', 'Datumodre_x0111_ivanjapritvora', 'Produženje ne može biti prije određivanja pritvora.') },
      { name: 'razlogNeokoncanja', label: 'Razlog zbog kojeg istraga nije bila okončana', type: 'text', show: r => r.produzenIstraga === true },
      { section: 'Pritvor nakon podizanja optužnog akta' },
      { name: 'nakonOptuznog', label: 'Pritvor određen/produžen nakon podizanja optužnog akta', type: 'bool' },
      { name: 'nakonOptuznogDatum', label: 'Datum rješenja', type: 'date', show: r => r.nakonOptuznog === true },
      { name: 'osnovOptuzni', label: 'Osnov', type: 'multichoice', vertical: true, show: r => r.nakonOptuznog === true },
      { section: 'Pritvor nakon izricanja presude' },
      { name: 'nakonPresude', label: 'Pritvor određen/produžen nakon izricanja presude', type: 'bool' },
      { name: 'nakonPresudeDatum', label: 'Datum rješenja', type: 'date', show: r => r.nakonPresude === true },
      { name: 'osnovPresuda', label: 'Osnov', type: 'multichoice', vertical: true, show: r => r.nakonPresude === true },
      { section: 'Prestanak pritvora' },
      { name: 'ukinut', label: 'Pritvor je ukinut', type: 'bool' },
      { name: 'Pritvorjezamijenjenjemstvom', label: 'Pritvor je zamijenjen jemstvom', type: 'bool' },
      { name: 'Pritvorjezamijenjenmjeromnadzora', label: 'Pritvor je zamijenjen mjerom nadzora', type: 'bool' },
      { name: 'mjereNadzora', label: 'Izrečene mjere nadzora', type: 'multichoice', hidden: true },
      { name: 'Datumukidanjapritvora', label: 'Datum ukidanja pritvora', type: 'date', rowStart: true,
        show: r => r.ukinut === true || r.Pritvorjezamijenjenjemstvom === true || r.Pritvorjezamijenjenmjeromnadzora === true,
        check: r => days(datOd(r), r.Datumukidanjapritvora) < 0 ? 'Pritvor ne može biti ukinut prije nego što je određen.' : null },
      { name: 'Fazapostupkaukojojjepritvorukinu', label: 'Faza postupka u kojoj je pritvor ukinut', type: 'choice', show: r => isDate(r.Datumukidanjapritvora) },
      { name: 'obrazlozenjeUkidanja', label: 'Obrazloženje/osnov ukidanja', type: 'text', show: r => isDate(r.Datumukidanjapritvora) },
      { name: 'Pritvorukinutposilizakonanakontr', label: 'Pritvor ukinut po sili zakona nakon tri godine', type: 'bool', show: r => isDate(r.Datumukidanjapritvora) },
      { name: 'Pritvorjetrajaodopravosna_x017e_', label: 'Pritvor je trajao do pravosnažnosti', type: 'bool' },
      { name: 'trazioUpucivanje', label: 'Optuženi tražio upućivanje na izdržavanje kazne prije pravosnažnosti', type: 'bool' },
      { name: 'trazioZasto', label: 'Zašto?', type: 'text', show: r => r.trazioUpucivanje === true },
      { name: 'izdrzaoUPritvoru', label: 'Optuženi je izdržao kaznu u pritvoru', type: 'bool' },
      { name: 'Detalji', label: 'Drugi važni detalji', type: 'longtext' }];
  }

  // pritvor - tok dogadjaja
  const TOK_DOGADJAJI = [['zadrzavanje', 'Zadržavanje'], ['odredjen', 'Pritvor određen'], ['produzen', 'Pritvor produžen'], ['ukinut', 'Pritvor ukinut'],
    ['jemstvo', 'Zamijenjen jemstvom'], ['nadzor', 'Zamijenjen mjerom nadzora'], ['izdrzavanje', 'Upućen na izdržavanje kazne']];
  const TOK_KRAJ = ['ukinut', 'jemstvo', 'nadzor', 'izdrzavanje'];
  const TOK_STARA = ['zadrzavanje', 'zadrzavanjeDatum', 'Datumodre_x0111_ivanjapritvora', 'Osnovodre_x0111_ivanjapritvora', 'produzenIstraga', 'produzenIstragaDatum', 'razlogNeokoncanja',
    'nakonOptuznog', 'nakonOptuznogDatum', 'osnovOptuzni', 'nakonPresude', 'nakonPresudeDatum', 'osnovPresuda', 'ukinut', 'Pritvorjezamijenjenjemstvom', 'Pritvorjezamijenjenmjeromnadzora',
    'Datumukidanjapritvora', 'Fazapostupkaukojojjepritvorukinu', 'Pritvorjetrajaodopravosna_x017e_'];
  const TOK_IZVEDENA = TOK_STARA.filter(k => k !== 'razlogNeokoncanja');
  const tokSort = tok => (Array.isArray(tok) ? tok : []).filter(e => e && e.dogadjaj).map((e, i) => ({ ...e, _i: i }))
    .sort((a, b) => (isDate(a.datum) && isDate(b.datum) ? a.datum.localeCompare(b.datum) : 0) || a._i - b._i);
  function tokFaza(datum, c, pres1) {
    if (!isDate(datum)) return null; const pod = c && c.Datumpodizanjaoptu_x017e_nice;
    if (isDate(pres1) && datum >= pres1) return 'presuda';
    if (isDate(pod)) return datum < pod ? 'istraga' : 'gp';
    return null;
  }
  const TOK_FAZE = { istraga: 'istraga', gp: 'glavni pretres', presuda: 'nakon presude' };
  function tokIzStarog(r) {
    const ev = [], osn = r.Osnovodre_x0111_ivanjapritvora || [], same = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
    if (r.zadrzavanje === true || isDate(r.zadrzavanjeDatum)) ev.push({ datum: r.zadrzavanjeDatum || null, dogadjaj: 'zadrzavanje' });
    if (isDate(r.Datumodre_x0111_ivanjapritvora) || osn.length) ev.push({ datum: r.Datumodre_x0111_ivanjapritvora || null, dogadjaj: 'odredjen', osnov: osn });
    let last = osn;
    if (r.produzenIstraga === true || isDate(r.produzenIstragaDatum)) ev.push({ datum: r.produzenIstragaDatum || null, dogadjaj: 'produzen' });
    for (const [b, d, o] of [['nakonOptuznog', 'nakonOptuznogDatum', 'osnovOptuzni'], ['nakonPresude', 'nakonPresudeDatum', 'osnovPresuda']]) {
      if (r[b] !== true && !isDate(r[d])) continue; const no = r[o] || [], ch = no.length && !same(no, last);
      const isOd = ev.some(e => e.dogadjaj === 'odredjen');
      ev.push(isOd ? { datum: r[d] || null, dogadjaj: 'produzen', ...(ch ? { promijenjen: true, osnov: no } : {}) } : { datum: r[d] || null, dogadjaj: 'odredjen', osnov: no });
      if (ch || !isOd) last = no;
    }
    if (isDate(r.Datumukidanjapritvora) || r.ukinut === true || r.Pritvorjezamijenjenjemstvom === true || r.Pritvorjezamijenjenmjeromnadzora === true)
      ev.push({ datum: r.Datumukidanjapritvora || null, dogadjaj: r.Pritvorjezamijenjenjemstvom === true ? 'jemstvo' : r.Pritvorjezamijenjenmjeromnadzora === true ? 'nadzor' : 'ukinut' });
    return tokSort(ev).map(({ _i, ...e }) => e);
  }
  function tokUStaro(tok, c, pres1) {
    const E = tokSort(tok), o = { zadrzavanje: false, zadrzavanjeDatum: null, Datumodre_x0111_ivanjapritvora: null, Osnovodre_x0111_ivanjapritvora: [], produzenIstraga: false, produzenIstragaDatum: null,
      nakonOptuznog: false, nakonOptuznogDatum: null, osnovOptuzni: [], nakonPresude: false, nakonPresudeDatum: null, osnovPresuda: [], ukinut: false, Pritvorjezamijenjenjemstvom: false,
      Pritvorjezamijenjenmjeromnadzora: false, Datumukidanjapritvora: null, Fazapostupkaukojojjepritvorukinu: null, Pritvorjetrajaodopravosna_x017e_: false };
    let osn = [];
    for (const e of E) {
      if (e.dogadjaj === 'zadrzavanje') { o.zadrzavanje = true; if (!o.zadrzavanjeDatum) o.zadrzavanjeDatum = e.datum || null; continue; }
      if (e.dogadjaj === 'odredjen' || e.dogadjaj === 'produzen') {
        if (e.dogadjaj === 'odredjen' || e.promijenjen) osn = Array.isArray(e.osnov) ? e.osnov : osn;
        const first = e.dogadjaj === 'odredjen' && !o.Datumodre_x0111_ivanjapritvora;
        if (first) { o.Datumodre_x0111_ivanjapritvora = e.datum || null; o.Osnovodre_x0111_ivanjapritvora = osn; }
        const f = tokFaza(e.datum, c, pres1);
        if (e.dogadjaj === 'produzen' && (f === 'istraga' || f === null)) { o.produzenIstraga = true; if (!o.produzenIstragaDatum) o.produzenIstragaDatum = e.datum || null; }
        if (f === 'gp') { if (!o.nakonOptuznog) { o.nakonOptuznogDatum = e.datum; o.osnovOptuzni = osn; } o.nakonOptuznog = true; }
        if (f === 'presuda') { if (!o.nakonPresude) { o.nakonPresudeDatum = e.datum; o.osnovPresuda = osn; } o.nakonPresude = true; }
        o.Datumukidanjapritvora = null; o.ukinut = o.Pritvorjezamijenjenjemstvom = o.Pritvorjezamijenjenmjeromnadzora = false; o.Fazapostupkaukojojjepritvorukinu = null;
        continue;
      }
      if (TOK_KRAJ.includes(e.dogadjaj)) {
        o.Datumukidanjapritvora = e.datum || null; o.ukinut = e.dogadjaj === 'ukinut';
        o.Pritvorjezamijenjenjemstvom = e.dogadjaj === 'jemstvo'; o.Pritvorjezamijenjenmjeromnadzora = e.dogadjaj === 'nadzor';
        const f = tokFaza(e.datum, c, pres1); o.Fazapostupkaukojojjepritvorukinu = f === 'istraga' ? 'Faza istrage' : f === 'gp' ? 'Nakon podizanja optužnice' : f === 'presuda' ? 'Nakon presude' : null;
        if (e.dogadjaj === 'izdrzavanje') o.Pritvorjetrajaodopravosna_x017e_ = true;
      }
    }
    const kraj = E.length && TOK_KRAJ.includes(E[E.length - 1].dogadjaj);
    if (!kraj && c && isDate(c.Odlaganjero_x010d_i_x0161_ta) && o.Datumodre_x0111_ivanjapritvora) o.Pritvorjetrajaodopravosna_x017e_ = true;
    return o;
  }
  function tokProvjera(tok, c) {
    const E = Array.isArray(tok) ? tok.filter(e => e && (e.dogadjaj || e.datum)) : [];
    if (!E.length) return {};
    const errs = [], warns = [], prav = c && c.Odlaganjero_x010d_i_x0161_ta;
    E.forEach((e, i) => { const n = `${i + 1}. red`;
      if (!e.dogadjaj) errs.push(`${n}: izaberite događaj.`);
      if (!isDate(e.datum)) errs.push(`${n}: upišite datum.`);
      else if (isDate(prav) && e.datum > prav) errs.push(`${n}: datum je poslije pravosnažnosti presude (${fmtDate(prav)}).`);
      if (i && isDate(e.datum) && isDate(E[i - 1].datum) && e.datum < E[i - 1].datum) errs.push(`${n}: datum je prije prethodnog događaja – događaji moraju ići redom.`);
      if (e.dogadjaj === 'odredjen' && !(e.osnov || []).length) warns.push(`${n}: nije označen osnov određivanja pritvora.`);
      if (e.dogadjaj === 'produzen' && e.promijenjen && !(e.osnov || []).length) warns.push(`${n}: označeno je da se osnov promijenio, ali novi osnov nije izabran.`);
    });
    let u = false;
    E.forEach((e, i) => { const n = `${i + 1}. red`;
      if (e.dogadjaj === 'zadrzavanje') { if (u || E.slice(0, i).some(x => x.dogadjaj === 'odredjen')) errs.push(`${n}: zadržavanje može biti samo prije određivanja pritvora.`); }
      else if (e.dogadjaj === 'odredjen') { if (u) errs.push(`${n}: pritvor je već određen – za nastavak izaberite „Pritvor produžen”.`); u = true; }
      else if (e.dogadjaj === 'produzen') { if (!u) errs.push(`${n}: pritvor se ne može produžiti prije nego što je određen (ili nakon što je prestao).`); }
      else if (TOK_KRAJ.includes(e.dogadjaj)) { if (!u) errs.push(`${n}: pritvor nije bio određen, pa ne može prestati.`); u = false; }
    });
    const zi = E.findIndex(e => e.dogadjaj === 'zadrzavanje'), oi = E.findIndex(e => e.dogadjaj === 'odredjen');
    if (zi >= 0 && oi > zi && isDate(E[zi].datum) && isDate(E[oi].datum)) { const d = days(E[zi].datum, E[oi].datum); if (d > 3) warns.push(`Između zadržavanja i pritvora je ${d} dana – zadržavanje traje najduže 72 časa (čl. 267 st. 1).`); }
    return { error: errs[0] || null, errors: errs, warn: warns[0] || null, warnings: warns };
  }
  function tokPregled(tok, c, pres1, danas) {
    const E = tokSort(tok), od = (E.find(e => e.dogadjaj === 'odredjen') || {}).datum, zd = (E.find(e => e.dogadjaj === 'zadrzavanje') || {}).datum;
    const last = E[E.length - 1], kraj = last && TOK_KRAJ.includes(last.dogadjaj) ? last : null;
    const prav = c && isDate(c.Odlaganjero_x010d_i_x0161_ta) ? c.Odlaganjero_x010d_i_x0161_ta : null;
    const end = kraj && isDate(kraj.datum) ? kraj.datum : prav || null, until = end || (isDate(danas) ? danas : null);
    const pod = c && c.Datumpodizanjaoptu_x017e_nice;
    const seg = (a, b) => isDate(a) && isDate(b) && b > a ? days(a, b) : 0;
    const mn = (...x) => x.filter(isDate).sort()[0], mx = (...x) => x.filter(isDate).sort().pop();
    const out = { od, end, uToku: !end, zadrz: isDate(zd) && isDate(od) ? Math.max(0, days(zd, od)) : 0, produzenja: E.filter(e => e.dogadjaj === 'produzen').length,
      prestanak: kraj ? (TOK_DOGADJAJI.find(x => x[0] === kraj.dogadjaj) || [])[1] : prav ? 'trajao do pravosnažnosti' : null, pod: isDate(pod) ? pod : null, pres1: isDate(pres1) ? pres1 : null };
    if (!isDate(od) || !until) return out;
    out.istraga = isDate(pod) ? seg(od, mn(pod, until)) : seg(od, until);
    out.gp = isDate(pod) ? seg(mx(od, pod), mn(pres1, until)) : 0;
    out.presuda = isDate(pres1) ? seg(mx(od, pres1), until) : 0;
    out.ukupno = days(od, until);
    return out;
  }
  const pritvoriFormBase = pritvoriForm;
  pritvoriForm = function (t) {
    const F = pritvoriFormBase(t).filter(f => !f.section);
    const legacy = F.filter(f => TOK_STARA.includes(f.name)).map(f => ({ ...f, hidden: true, required: false, errorTo: 'tok', show: undefined }));
    const head = F.filter(f => f.type === 'lookup' || (f.hidden && !TOK_STARA.includes(f.name)));
    const rest = F.filter(f => !head.includes(f) && !TOK_STARA.includes(f.name)).map(f => f.name === 'osnovDT' ? { ...f, half: false, rowStart: false } : f);
    const krajE = r => { const E = tokSort(r.tok); return E.length && TOK_KRAJ.includes(E[E.length - 1].dogadjaj) ? E[E.length - 1] : null; };
    const adj = rest.map(f => f.name === 'obrazlozenjeUkidanja' ? { ...f, label: 'Obrazloženje prestanka pritvora', show: r => !!krajE(r) }
      : f.name === 'Pritvorukinutposilizakonanakontr' ? { ...f, show: r => (krajE(r) || {}).dogadjaj === 'ukinut' } : f);
    return [...head,
      { section: 'Tok pritvora' },
      { name: 'tok', label: '', type: 'pritvortok', wide: true, check: (r, ctx) => { const p = tokProvjera(r.tok, ctx && ctx.case); return p.error || (p.warn ? { warn: p.warn } : null); } },
      { section: 'Ostali podaci o pritvoru' }, ...adj, ...legacy];
  };
  const jemstvaForm = t => [P(t),
    { name: 'liceBr', label: 'Lice', type: 'number', hidden: true }, { name: 'Optu_x017e_eni', label: 'Optuženi', type: 'text', hidden: true },
    { name: 'Vrijednostponu_x0111_enogjemstva', label: 'Vrijednost ponuđenog jemstva (€)', type: 'money' },
    { name: 'predlagac', label: 'Ko je predložio jemstvo', type: 'choice' },
    { name: 'Odlukasuda', label: 'Odluka suda', type: 'choice' },
    { name: 'Vrijednostprihva_x0107_enogjemst', label: 'Vrijednost prihvaćenog jemstva (€)', type: 'money', show: r => r.Odlukasuda === 'Usvojeno' },
    { name: 'Komentarsuda', label: 'Komentar suda', type: 'longtext' }];
  const nadzorForm = t => [P(t),
    { name: 'liceBr', label: 'Lice', type: 'number', hidden: true }, { name: 'okrivljeni', label: 'Okrivljeni', type: 'text', hidden: true },
    { name: 'datum', label: 'Datum rješenja o određivanju', type: 'date' },
    { name: 'mjere', label: 'Izrečene mjere nadzora', type: 'multichoice', required: true },
    { name: 'predlagac', label: 'Mjeru predložio / odredio', type: 'choice', show: noviCtx, hint: 'Čl. 166 st. 1: po službenoj dužnosti, na predlog tužioca ili oštećenog' },
    { name: 'osnov', label: 'Osnov koji je sud naveo', type: 'multichoice', hint: 'Čl. 166 st. 1 predviđa opasnost od bjekstva i ometanje postupka – upišite ono što stoji u rješenju' },
    { name: 'elektronski', label: 'Kontrola elektronskim nadzorom (čl. 166 st. 3)', type: 'bool', show: noviCtx },
    { name: 'umjestoPritvora', label: 'Određene umjesto pritvora (pritvor ukinut ili nije određen)', type: 'bool' },
    { name: 'datumUkidanja', label: 'Datum ukidanja', type: 'date', check: r => days(r.datum, r.datumUkidanja) < 0 ? 'Ukidanje ne može biti prije određivanja.' : null },
    { name: 'napomena', label: 'Napomena', type: 'longtext' }];
  const vplForm = t => [P(t),
    { name: 'vrsta', label: 'Vrsta vanrednog pravnog lijeka', type: 'choice', required: true },
    { name: 'datumPodnosenja', label: 'Datum podnošenja', type: 'date' },
    { name: 'datumOdluke', label: 'Datum odluke', type: 'date', check: r => days(r.datumPodnosenja, r.datumOdluke) < 0 ? 'Odluka ne može biti prije podnošenja.' : null },
    { name: 'odluka', label: 'Odluka', type: 'longtext' }];
  const komentariForm = t => [P(t), { name: 'Komentarmonitora', label: 'Komentar monitora', type: 'longtext', required: true }];

  function rocPredmetiForm(mod) {
    const svi = mod === 'svi';
    return [
      svi ? { name: 'sud', label: 'Sud', type: 'choice', required: true } : null,
      caseNoField('Title', 'Broj predmeta', { required: true }), { name: 'napomenaBroja', label: 'Napomena uz broj predmeta', type: 'text', hint: 'Npr. saizvršilaštvo – 1. okrivljeni, preuzet iz OS Herceg Novi' },
      svi ? null : { name: 'Vrstapredmeta', label: 'Vrsta predmeta', type: 'choice' },
      { name: 'monitor', label: 'Monitor', type: 'choice', allowNew: true, hidden: true },
      ...(svi ? [djelaField, { name: 'krivicnoDjelo', label: 'Krivično djelo', type: 'text', hidden: true }] : [{ name: 'krivicnoDjelo', label: 'Krivična djela iz optužnice', type: 'longtext', hint: 'Nije obavezno – za vaše potrebe, npr. za opis predmeta u izvještaju.' }]),
      { name: 'clanKZ', label: 'Član KZCG', type: 'text', hidden: true },
      { name: 'pritvorski', label: 'Pritvorski predmet', type: 'bool' },
      { name: 'optuzniAkt', label: 'Optužni akt', type: 'choice' },
      { name: 'Datumpodizanjaoptu_x017e_nice', label: 'Datum podizanja optužnog akta', type: 'date', hint: 'Određuje da li se primjenjuju izmjene ZKP-a iz septembra 2026.' },
      { name: 'sporazum', label: 'Predložen/zaključen sporazum o priznanju krivice', type: 'bool' },
    ].filter(Boolean);
  }
  const nije = r => r.odrzano !== true;
  const R = (name, label, type, show, extra) => Object.assign({ name, label, type, show }, extra || {});
  const ODL_UCESNICI = ['Optuženi', 'Branilac', 'Tužilac', 'Oštećeni', 'Svjedok', 'Vještak', 'Tumač'];
  const ODL_DOSTAVA = [['uredna', 'Poziv uredno dostavljen'], ['neuredna', 'Poziv nije uredno dostavljen'], ['nepoznato', 'Ne može se utvrditi']];
  const ODL_GRUPE = [
    ['Razlozi na strani suda', ['Odsustvo sudije', 'Nedostatak tehničkih uslova', 'Organizacijski razlozi na strani suda']],
    ['Dokazni postupak', ['Radi pribavljanja novih dokaza', 'Nalaz ili mišljenje vještaka nije dostavljen na vrijeme', 'Dokazi nijesu dostavljeni od strane drugih organa', 'Potrebno dodatno vještačenje ili dopuna nalaza']],
    ['Zahtjevi stranaka', ['Zahtjev branioca', 'Zahtjev tužioca', 'Zahtjev optuženog', 'Zahtjev za izuzeće', 'Sporazum stranaka']],
    ['Zdravstveni i drugi objektivni razlozi / viša sila', ['Privremena duševna poremećenost', 'Drugi zdravstveni razlozi', 'Viša sila', 'Drugi objektivni razlozi']],
    ['Ostalo', ['Otkazivanje punomoćja braniocu', 'Drugi razlozi']],
  ];
  const ODL_OPIS = ['Viša sila', 'Drugi objektivni razlozi', 'Drugi razlozi'];
  function rocRazlozi(h) {
    if (h && h.razlozi && typeof h.razlozi === 'object') return { odsutni: h.razlozi.odsutni || [], ostali: h.razlozi.ostali || [], opis: h.razlozi.opis || null };
    const out = { odsutni: [], ostali: [], opis: null }; if (!h) return out;
    for (const [k, u] of [['Optuzeni', 'Optuženi'], ['Branilac', 'Branilac'], ['Tuzilac', 'Tužilac'], ['Svjedok', 'Svjedok'], ['Vjestak', 'Vještak']])
      if (h['ods' + k] === true) out.odsutni.push({ ucesnik: u, dostava: h['poziv' + k] === true ? 'uredna' : 'neuredna' });
    for (const [k, r] of [['odsSudija', 'Odsustvo sudije'], ['noviDokazi', 'Radi pribavljanja novih dokaza'], ['nalaziOrgana', 'Dokazi nijesu dostavljeni od strane drugih organa'],
      ['tehnicki', 'Nedostatak tehničkih uslova'], ['zahtjevAdvokata', 'Zahtjev branioca'], ['dusevna', 'Privremena duševna poremećenost'], ['drugeSmetnje', 'Drugi razlozi']]) if (h[k] === true) out.ostali.push(r);
    if (h.drugeSmetnjeOpis) out.opis = h.drugeSmetnjeOpis;
    const m = String(h.razlogOdlaganja || '').match(/^(\d)(\d\d)\s*-\s*(.*)$/);
    if (m) { const u = { '01': 'Optuženi', '02': 'Tužilac', '03': 'Oštećeni', '04': 'Svjedok', '05': 'Vještak', '06': 'Tumač', '07': 'Branilac' }[m[2]];
      if (['1', '2', '3'].includes(m[1]) && u) { if (!out.odsutni.some(x => x.ucesnik === u)) out.odsutni.push({ ucesnik: u, dostava: { 1: 'neuredna', 2: 'uredna', 3: 'nepoznato' }[m[1]] }); }
      else { const r = m[3].replace(/\s*\(detaljnije u komentarima\)/i, '').replace('mišljenje vještaka nije dostavljeno', 'mišljenje vještaka nije dostavljen').trim();
        if (r !== 'Odsustvo više lica' && !out.ostali.includes(r)) out.ostali.push(r); } }
    return out;
  }
  const ROC_LICA = ['Optuženi', 'Branilac', 'Oštećeni', 'Svjedok', 'Vještak', 'Tumač', 'Punomoćnik', 'Drugo lice'];
  const ROC_MJERE = [
    { vrsta: 'opomena', label: 'Opomena', lica: ROC_LICA },
    { vrsta: 'novcana', label: 'Novčana kazna', lica: ROC_LICA.filter(l => l !== 'Optuženi'), iznos: true },
    { vrsta: 'dovodjenje', label: 'Naredba za prinudno dovođenje', lica: ['Optuženi', 'Oštećeni', 'Svjedok', 'Vještak'] },
    { vrsta: 'potjernica', label: 'Potjernica', lica: ['Optuženi'] },
    { vrsta: 'druga', label: 'Druga mjera', lica: ROC_LICA, opis: true },
  ];
  function rocMjere(h) {
    if (!h) return [];
    if (Array.isArray(h.mjereUnosi)) return h.mjereUnosi;
    const out = [];
    if (h.opomena) out.push({ vrsta: 'opomena', lice: null, ime: h.opomenaLice || null });
    if (h.novcana) out.push({ vrsta: 'novcana', lice: null, ime: h.novcanaLice || null, iznos: h.novcanaIznos ?? null });
    if (h.dovodjenje) out.push({ vrsta: 'dovodjenje', lice: h.dovodjenjeLice || null });
    if (h.potjernica) out.push({ vrsta: 'potjernica', lice: 'Optuženi' });
    if (h.drugaMjera) out.push({ vrsta: 'druga', lice: null, opis: h.drugaMjeraOpis || null });
    return out;
  }
  function rocMjereZbir(list) {
    const of = v => list.filter(m => m.vrsta === v), names = xs => xs.map(m => [m.lice, m.ime].filter(Boolean).join(' – ')).filter(Boolean).join('; ') || null;
    return { opomena: of('opomena').length > 0, opomenaLice: names(of('opomena')), novcana: of('novcana').length > 0, novcanaLice: names(of('novcana')),
      novcanaIznos: of('novcana').some(m => m.iznos != null) ? of('novcana').reduce((a, m) => a + (Number(m.iznos) || 0), 0) : null,
      dovodjenje: of('dovodjenje').length > 0, dovodjenjeLice: (of('dovodjenje')[0] || {}).lice || null, potjernica: of('potjernica').length > 0,
      drugaMjera: of('druga').length > 0, drugaMjeraOpis: of('druga').map(m => m.opis).filter(Boolean).join('; ') || null };
  }
  function rocistaForm(t) {
    const ods = (k, who) => [R('ods' + k, `Odsustvo ${who}`, 'bool', nije), R('poziv' + k, `Poziv ${who.replace(/a$/, 'u').replace(/ca$/, 'cu')} uredno dostavljen`, 'bool', r => nije(r) && r['ods' + k] === true)];
    return [P(t),
      { section: 'Ročište' },
      R('datum', 'Datum održavanja ročišta', 'date', null, { required: true }),
      R('odrzano', 'Ročište je održano', 'bool'),
      R('datumNarednog', 'Datum narednog ročišta', 'date', null, { check: r => days(r.datum, r.datumNarednog) <= 0 ? 'Naredno ročište mora biti nakon ovog.' : null }),
      { break: true },
      R('togaSudija', 'Sudija nosi togu', 'bool'), R('togaTuzilac', 'Tužilac nosi togu', 'bool'),
      { section: 'Poštovanje procesnih prava' },
      R('pravoNaOdbranu', 'Sud je upoznao okrivljenog na prvom saslušanju da ne mora da iznese odbranu ni odgovara na pitanja (čl. 100 st. 2)', 'choice'),
      R('jezikSuda', 'Sud je pitao učesnika da li razumije jezik suda i da li mu je potreban tumač (čl. 8 st. 2)', 'choice'),
      R('neukaStranka', 'Sud je poučio neuku stranku o njenim pravima (čl. 14 ZKP)', 'choice'),
      R('objasnio', 'Prava i posljedice propuštanja radnji', 'choice', null, { hint: 'Da li je sudija objasnio ili samo pročitao' }),
      R('poukaOstecenog', 'Sud je poučio privatnog tužioca, oštećenog i oštećenog kao tužioca o pravima', 'choice'),
      R('upozorenjeSvjedoka', 'Sud je upozorio svjedoke, nakon saznanja za odnos sa okrivljenim, da ne moraju svjedočiti (čl. 109 st. 3)', 'choice'),
      R('svjedociOdvojeno', 'Sud je saslušao svjedoke odvojeno, bez prisustva ostalih svjedoka (čl. 113 st. 1)', 'choice'),
      R('branilacSiromasnom', 'Okrivljenom slabog imovnog stanja postavljen branilac na njegov zahtjev (čl. 70)', 'choice'),
      { section: 'Razlozi odlaganja', show: nije },
      R('razlozi', '', 'razlozi', nije, { wide: true, hint: 'Označite ko nije pristupio i da li mu je poziv uredno dostavljen, i/ili druge razloge. Može više razloga.' }),
      ...['razlogOdlaganja', 'odsOptuzeni', 'pozivOptuzeni', 'odsBranilac', 'pozivBranilac', 'odsTuzilac', 'pozivTuzilac', 'odsSvjedok', 'pozivSvjedok', 'odsVjestak', 'pozivVjestak',
        'odsSudija', 'noviDokazi', 'nalaziOrgana', 'tehnicki', 'zahtjevAdvokata', 'dusevna', 'drugeSmetnje', 'drugeSmetnjeOpis'].map(n => R(n, n, /^(razlogOdlaganja|drugeSmetnjeOpis)$/.test(n) ? 'text' : 'bool', null, { hidden: true })),
      { section: 'Prekid ročišta' },
      R('prekid', 'Došlo je do prekida ročišta', 'bool'),
      R('prekidRazlog', 'Razlog prekida', 'choice', r => r.prekid === true), R('prekidOpis', 'Opis', 'text', r => r.prekid === true), R('prekidTrajanje', 'Trajanje prekida', 'text', r => r.prekid === true), R('prekidDuzi8', 'Prekid je trajao duže od osam dana (glavni pretres počinje iznova – čl. 330 st. 3)', 'bool', r => r.prekid === true),
      { section: 'Kažnjavanje zbog odugovlačenja postupka (čl. 251)' },
      R('kazna251', 'Sud je izrekao novčanu kaznu zbog odugovlačenja', 'bool'),
      R('kazna251Kome', 'Kome', 'text', r => r.kazna251 === true), R('kazna251Iznos', 'Iznos (€)', 'money', r => r.kazna251 === true, { max: 1000, maxIf: noviCtx, maxMsg: 'Kazna iz čl. 251 iznosi najviše 1.000 €.' }),
      { section: 'Procesne mjere discipline' },
      R('mjere', 'Sud je preduzeo mjere discipline i nesmetanog vođenja postupka', 'bool'),
      R('mjereUnosi', 'Koje mjere', 'mjereunosi', r => r.mjere === true, { wide: true, hint: 'Za svaku mjeru kliknite „+ Dodaj” onoliko puta koliko je puta izrečena (npr. dvije opomene različitim licima).',
        check: (r, ctx) => { const big = rocMjere(r).filter(m => m.vrsta === 'novcana' && Number(m.iznos) > 1000);
          return big.length && ctx && ctx.noviZKP ? 'Novčana kazna iznosi najviše 1.000 € (čl. 119 i 321).' : null; } }),
      R('opomena', 'Opomena', 'bool', r => r.mjere === true, { hidden: true }), R('opomenaLice', 'Lice kome je izrečena opomena', 'text', r => r.opomena === true, { hidden: true }),
      R('novcana', 'Novčana kazna', 'bool', r => r.mjere === true, { hidden: true }), R('novcanaLice', 'Lice kome je izrečena', 'text', r => r.novcana === true, { hidden: true }), R('novcanaIznos', 'Iznos (€)', 'money', r => r.novcana === true, { hidden: true, max: 1000, maxIf: noviCtx, maxMsg: 'Novčana kazna iznosi najviše 1.000 € (čl. 119 i 321).' }),
      R('dovodjenje', 'Naredba za prinudno dovođenje', 'bool', r => r.mjere === true, { hidden: true }), R('dovodjenjeLice', 'Lice čije je dovođenje naređeno', 'choice', r => r.dovodjenje === true, { hidden: true }),
      R('potjernica', 'Potjernica', 'bool', r => r.mjere === true, { hidden: true }),
      R('drugaMjera', 'Druga mjera', 'bool', r => r.mjere === true, { hidden: true }), R('drugaMjeraOpis', 'Opis druge mjere', 'text', r => r.drugaMjera === true, { hidden: true }),
      { section: 'Ostalo' },
      R('kontrolniZahtjev', 'Okrivljeni/oštećeni koristio zahtjev za ubrzanje postupka (kontrolni zahtjev)', 'bool'),
      R('komentar', 'Završni komentar', 'longtext')];
  }

  const vawForm = [
    { section: 'Predmet' },
    { name: 'sud', label: 'Sud', type: 'choice', required: true },
    caseNoField('Title', 'Broj predmeta', { required: true }), { name: 'napomenaBroja', label: 'Napomena uz broj predmeta', type: 'text', hint: 'Npr. saizvršilaštvo – 1. okrivljeni, preuzet iz OS Herceg Novi' },
    djelaField,
    { name: 'krivicnoDjelo', label: 'Krivično djelo', type: 'text', hidden: true },
    { name: 'clanKZ', label: 'Član KZCG', type: 'text', hidden: true },
    { section: 'Podaci o žrtvi' },
    { name: 'odnos', label: 'Odnos žrtve sa optuženim', type: 'text', hint: 'npr. supruga, bivša vanbračna supruga, majka' },
    { name: 'prijavljivala', label: 'Žrtva je prethodno prijavljivala nasilje', type: 'bool' },
    { name: 'pridruzila', label: 'Žrtva se pridružila krivičnom gonjenju', type: 'bool' },
    { section: 'Podaci o optuženom' },
    { name: 'osudjivan', label: 'Optuženi je prethodno osuđivan', type: 'bool' },
    { name: 'istovrsna', label: 'Prethodno osuđivan za istovjetna ili istovrsna krivična djela', type: 'bool', show: r => r.osudjivan === true },
    { name: 'detaljiPresuda', label: 'Detalji prethodnih presuda (kada, vrsta i visina sankcije)', type: 'longtext', show: r => r.osudjivan === true },
    { section: 'Presuda' },
    { name: 'glavnaSankcija', label: 'Glavna sankcija', type: 'choice' },
    { name: 'zatvorGodina', label: 'Kazna zatvora – godine', type: 'number', max: 40, third: true, hint: '0–40', show: r => /zatvor/i.test(r.glavnaSankcija || '') },
    { name: 'zatvorMjeseci', label: 'Kazna zatvora – mjeseci', type: 'number', max: 12, third: true, hint: '0–12', show: r => /zatvor/i.test(r.glavnaSankcija || '') },
    { name: 'zatvorDana', label: 'Kazna zatvora – dani', type: 'number', max: 31, third: true, hint: '0–31', show: r => /zatvor/i.test(r.glavnaSankcija || '') },
    { name: 'mjeraBezbjednosti', label: 'Mjera bezbjednosti, visina novčane kazne i sl.', type: 'text' },
    { name: 'sankcija', label: 'Sankcija – opis', type: 'text', hint: 'Ako je oslobođen optužbi, upisati najvažnije razloge' },
    { name: 'olaksavajucaNepridruzivanje', label: 'Jedna od olakšavajućih okolnosti je da se oštećena nije pridružila krivičnom gonjenju', type: 'bool' },
    { name: 'olaksavajuce', label: 'Sve olakšavajuće okolnosti', type: 'longtext' },
    { name: 'otezavajuce', label: 'Otežavajuće okolnosti', type: 'longtext' },
    { name: 'komentar', label: 'Završni komentari', type: 'longtext' },
  ];

  const PHASED = ['faze', 'odlaganja', 'mjere', 'presuda1', 'zalba', 'presuda2'];
  const FAZA = { name: 'faza', label: 'Suđenje', type: 'number', hidden: true };
  const fazeForm = t => [P(t), FAZA,
    caseNoField('brojPredmeta', 'Broj predmeta u ponovljenom postupku'),
    { name: 'Datumnaredbezaodr_x017e_avanjegl', label: 'Datum naredbe za održavanje glavnog pretresa', type: 'date' },
    { name: 'Datumzakazivanjaprvogro_x010d_i_', label: 'Datum zakazivanja prvog ročišta', type: 'date',
      check: r => days(r.Datumnaredbezaodr_x017e_avanjegl, r.Datumzakazivanjaprvogro_x010d_i_) <= 0 ? 'Prvo ročište mora biti nakon dana naredbe za održavanje glavnog pretresa.' : null },
    { name: 'Brojodr_x017e_anihro_x010d_i_x01', label: 'Broj održanih ročišta u ponovljenom suđenju', type: 'number' },
    { name: 'Brojodlo_x017e_enihro_x010d_i_x0', label: 'Broj odloženih ročišta u ponovljenom suđenju', type: 'number' },
    { name: 'napomena', label: 'Napomena', type: 'longtext' }];
  const FORMS = {
    predmeti: predmetiForm('okk'), faze: fazeForm('predmeti'), odlaganja: odlaganjaForm('predmeti'), mjere: mjereForm('predmeti'),
    presuda1: presudaForm('predmeti', 'Datum objavljivanja prvostepene presude'), zalba: zalbaForm('predmeti'),
    presuda2: presudaForm('predmeti', 'Datum objavljivanja presude'), ishod: ishodForm('predmeti'), pritvori: pritvoriForm('predmeti'),
    jemstva: jemstvaForm('predmeti'), nadzor: nadzorForm('predmeti'), vpl: vplForm('predmeti'), komentari: komentariForm('predmeti'),
    roc_predmeti: rocPredmetiForm('okk'), roc_rocista: rocistaForm('roc_predmeti'),
    svi_predmeti: predmetiForm('svi'), svi_faze: fazeForm('svi_predmeti'), svi_odlaganja: odlaganjaForm('svi_predmeti'), svi_mjere: mjereForm('svi_predmeti'),
    svi_presuda1: presudaForm('svi_predmeti', 'Datum objavljivanja presude'), svi_zalba: zalbaForm('svi_predmeti'), svi_ishod: ishodForm('svi_predmeti'),
    svi_pritvori: pritvoriForm('svi_predmeti'), svi_jemstva: jemstvaForm('svi_predmeti'), svi_nadzor: nadzorForm('svi_predmeti'), svi_vpl: vplForm('svi_predmeti'), svi_komentari: komentariForm('svi_predmeti'),
    svir_predmeti: rocPredmetiForm('svi'), svir_rocista: rocistaForm('svir_predmeti'),
    vaw_predmeti: vawForm,
  };
  for (const [k, f] of Object.entries(FORMS)) if (PHASED.includes(baseKey(k)) && baseKey(k) !== 'faze') f.splice(1, 0, FAZA);
  for (const f of FORMS.roc_rocista) if (f.type === 'choice' && !fallbackChoices('roc_rocista', f.name).length) FALLBACK_CHOICES[`rocista.${f.name}`] = DA_NE_NA;

  const fieldsOf = listKey => FORMS[listKey].filter(f => f.name);
  function isEmpty(v) { return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0); }
  function hasValue(field, v) { return field.type === 'bool' ? v === true : !isEmpty(v); }
  function isVisible(field, rec, ctx) { return !field.show || hasValue(field, rec[field.name]) || field.show(rec, ctx || {}); }
  function sectionVisible(sec, rec, ctx) { return !sec.show || sec.show(rec, ctx || {}); }

  const FUTURE_OK = new Set(['Odlo_x017e_enodo', 'Datumzakazivanjaprvogro_x010d_i_', 'datumNarednog']);
  const C = {
    podiz: ['Datumpodizanjaoptu_x017e_nice', 'podizanja optužnog akta'], prijem: ['Datumprijemaoptu_x017e_niceusud', 'prijema optužnog akta u sud'],
    dostava: ['datumDostaveOptuznice', 'dostavljanja optužnice odbrani'], izjasn: ['datumIzjasnjenja', 'izjašnjenja odbrane'],
    kontrola: ['Datumro_x010d_i_x0161_tazakontro', 'ročišta za kontrolu optužnice'], potvrda: ['Datumrje_x0161_enjaopotvr_x0111_', 'potvrđivanja optužnice'],
    naredba: ['Datumnaredbezaodr_x017e_avanjegl', 'naredbe za održavanje glavnog pretresa'], prvo: ['Datumzakazivanjaprvogro_x010d_i_', 'prvog ročišta'],
    prav: ['Odlaganjero_x010d_i_x0161_ta', 'pravosnažnosti'],
  };
  const CASE_LOWER = { prijem: ['podiz'], dostava: ['podiz', 'prijem'], izjasn: ['podiz', 'prijem', 'dostava'], kontrola: ['podiz', 'prijem'],
    potvrda: ['podiz', 'prijem', 'dostava', 'kontrola'], naredba: ['podiz', 'prijem', 'potvrda', 'kontrola'], prvo: ['podiz', 'prijem', 'potvrda', 'naredba'],
    prav: ['podiz', 'prijem', 'potvrda', 'naredba', 'kontrola', 'izjasn'] };
  const PD = 'Datumobjavljivanjapresude', ZG = 'Datumzavr_x0161_etkaglavnogpretr', ZP = 'Datumpodno_x0161_enja_x017e_albe', ZO = 'Datumdono_x0161_enjadrugostepene';
  const OD = 'Odlo_x017e_enood', DO = 'Odlo_x017e_enodo';
  const dmax = xs => xs.filter(x => x && isDate(x.v)).sort((a, b) => b.v.localeCompare(a.v))[0] || null;
  const dmin = xs => xs.filter(x => x && isDate(x.v)).sort((a, b) => a.v.localeCompare(b.v))[0] || null;
  const todayIso = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

  // hronologija datuma
  function dateRules(listKey, rec, ctx) {
    const b = baseKey(listKey), c = ctx.case || {}, kids = k => (ctx.kids ? ctx.kids(k) : []).filter(x => !ctx.editId || x._id !== ctx.editId);
    const faza = rec.faza || 1, ph = k => kids(k).filter(x => (x.faza || 1) === faza);
    const cv = key => ({ v: (b === 'predmeti' ? rec : c)[C[key][0]], l: 'datuma ' + C[key][1] });
    const phaseStart = () => {
      if (faza === 1) return [cv('podiz'), cv('prijem'), cv('potvrda'), cv('naredba')];
      const prev = (ctx.kids ? ctx.kids('zalba') : []).filter(z => (z.faza || 1) === faza - 1);
      const uk = dmax(prev.filter(z => /ukida/i.test(z.Odlukaudrugostepenompostupku || '')).map(z => ({ v: z[ZO], l: 'drugostepene odluke kojom je presuda ukinuta' })));
      const fz = (ctx.kids ? ctx.kids('faze') : []).find(f => (f.faza || 2) === faza) || {};
      return [uk, { v: fz.Datumnaredbezaodr_x017e_avanjegl, l: 'naredbe za ponovljeno suđenje' }];
    };
    const p1 = () => (ctx.kids ? ctx.kids('presuda1') : []).filter(x => (x.faza || 1) === faza)[0] || {};
    const R = {};
    const lo = (f, ...xs) => { (R[f] = R[f] || { lo: [], hi: [] }).lo.push(...xs.filter(Boolean)); };
    const hi = (f, ...xs) => { (R[f] = R[f] || { lo: [], hi: [] }).hi.push(...xs.filter(Boolean)); };
    const own = (f, l) => ({ v: rec[f], l });

    switch (b) {
      case 'predmeti': {
        for (const [k, deps] of Object.entries(CASE_LOWER)) lo(C[k][0], ...deps.map(cv));
        const all = k => (ctx.kids ? ctx.kids(k) : []);
        lo(C.prav[0], dmax(all('presuda1').map(x => ({ v: x[PD], l: 'objavljivanja prvostepene presude' }))),
          dmax(all('zalba').map(x => ({ v: x[ZO], l: 'drugostepene odluke' }))), dmax(all('presuda2').map(x => ({ v: x[PD], l: 'javnog izricanja presude u drugostepenom postupku' }))));
        const first = dmin([...all('odlaganja').filter(x => (x.faza || 1) === 1).map(x => ({ v: x[OD], l: 'prvog odlaganja ročišta' })),
          ...all('presuda1').filter(x => (x.faza || 1) === 1).map(x => ({ v: x[ZG] || x[PD], l: 'završetka glavnog pretresa' }))]);
        for (const k of ['podiz', 'prijem', 'potvrda', 'naredba']) hi(C[k][0], first);
        hi(C.podiz[0], dmin(all('rocista').map(x => ({ v: x.datum, l: 'prvog praćenog ročišta' }))));
        hi(C.prav[0], dmin(all('vpl').map(x => ({ v: x.datumPodnosenja, l: 'podnošenja vanrednog pravnog lijeka' }))));
        break;
      }
      case 'faze':
        lo('Datumnaredbezaodr_x017e_avanjegl', ...phaseStart().slice(0, 1));
        lo('Datumzakazivanjaprvogro_x010d_i_', ...phaseStart().slice(0, 1), own('Datumnaredbezaodr_x017e_avanjegl', 'datuma naredbe'));
        break;
      case 'odlaganja': {
        lo(OD, ...phaseStart());
        const pr = p1(); hi(OD, { v: pr[ZG], l: 'datuma završetka glavnog pretresa' }, { v: pr[PD], l: 'datuma objavljivanja presude' });
        lo(DO, { ...own(OD, 'datuma odlaganja'), strict: true });
        const others = ph('odlaganja').filter(x => isDate(x[OD])).sort((a, b) => a[OD].localeCompare(b[OD]));
        const d0 = ctx.orig && isDate(ctx.orig[OD]) ? ctx.orig[OD] : null;
        const prev = d0 ? others.filter(x => x[OD] <= d0).pop() : others[others.length - 1];
        const next = d0 ? others.find(x => x[OD] > d0) : null;
        const n = d0 ? others.filter(x => x[OD] <= d0).length : others.length;
        if (prev) {
          lo(OD, { v: prev[OD], l: `prethodnog (${n}.) odlaganja` });
          lo(OD, { v: prev[DO], l: `ročišta na koje je prethodno odlaganje pomjerilo pretres`, warn: 'Ako je ročište odloženo unaprijed (naredbom), ovo je u redu.' });
        }
        if (next) { hi(OD, { v: next[OD], l: `sljedećeg (${n + 2}.) odlaganja` }); hi(DO, { v: next[OD], l: `sljedećeg (${n + 2}.) odlaganja`, warn: 'Provjerite datume.' }); }
        break;
      }
      case 'presuda1': case 'presuda2': {
        const start = phaseStart();
        if (b === 'presuda1') { lo(ZG, ...start); lo(PD, ...start); }
        else { const pr = p1(), z = ph('zalba')[0] || {};
          for (const f of [ZG, PD]) lo(f, { v: pr[PD], l: 'objavljivanja prvostepene presude' }, { v: z[ZP], l: 'podnošenja žalbe' }); }
        if (b === 'presuda1') {
          const odl = dmax(ph('odlaganja').map(x => ({ v: x[OD], l: 'posljednjeg odlaganja ročišta' }))); lo(ZG, odl); lo(PD, odl);
          const z = dmin(ph('zalba').map(x => ({ v: x[ZP], l: 'podnošenja žalbe' }))); hi(PD, z); hi(ZG, z);
        }
        hi(PD, { v: c[C.prav[0]], l: 'datuma pravosnažnosti' });
        for (const f of ['dostavaStrankama', 'Datumdostavljanjapisanogotpravka', 'Datumdostavljanjapisanogotpravka0', 'Datumdostavljanjapisanogotpravka1']) lo(f, own(PD, 'datuma objavljivanja presude'), own(ZG, 'završetka glavnog pretresa'));
        break;
      }
      case 'zalba': {
        const pr = p1();
        lo(ZP, { v: pr[PD], l: 'objavljivanja prvostepene presude' }, { v: pr[ZG], l: 'završetka glavnog pretresa' });
        lo(ZO, { v: pr[PD], l: 'objavljivanja prvostepene presude' }, own(ZP, 'podnošenja žalbe'));
        { const nf = (ctx.kids ? ctx.kids('faze') : []).find(f => (f.faza || 2) === faza + 1);
          if (nf && /ukida/i.test(rec.Odlukaudrugostepenompostupku || '')) hi(ZO, { v: nf.Datumnaredbezaodr_x017e_avanjegl, l: 'naredbe za ponovljeno suđenje' }); }
        hi(ZO, { v: c[C.prav[0]], l: 'datuma pravosnažnosti', warn: 'Drugostepena odluka obično prethodi pravosnažnosti ili je istog dana.' });
        break;
      }
      case 'pritvori': {
        const T = 'Datumodre_x0111_ivanjapritvora', U = 'Datumukidanjapritvora';
        hi('zadrzavanjeDatum', own(T, 'datuma određivanja pritvora'));
        lo('produzenIstragaDatum', own(T, 'datuma određivanja pritvora')); hi('produzenIstragaDatum', cv('podiz'));
        lo('nakonOptuznogDatum', own(T, 'datuma određivanja pritvora'), cv('podiz'));
        lo('nakonPresudeDatum', own(T, 'datuma određivanja pritvora'), dmin((ctx.kids ? ctx.kids('presuda1') : []).map(x => ({ v: x[PD], l: 'objavljivanja prvostepene presude' }))));
        lo(U, own(T, 'datuma određivanja pritvora'), own('produzenIstragaDatum', 'produženja u istrazi'), own('nakonOptuznogDatum', 'rješenja nakon optužnog akta'), own('nakonPresudeDatum', 'rješenja nakon presude'));
        break;
      }
      case 'nadzor': lo('datumUkidanja', own('datum', 'datuma određivanja')); break;
      case 'vpl': lo('datumPodnosenja', cv('prav')); lo('datumOdluke', own('datumPodnosenja', 'podnošenja')); break;
      case 'rocista': {
        lo('datum', cv('podiz')); lo('datumNarednog', { ...own('datum', 'datuma ročišta'), strict: true });
        const others = kids('rocista').filter(x => isDate(x.datum)).sort((a, b) => a.datum.localeCompare(b.datum));
        const d0 = ctx.orig && isDate(ctx.orig.datum) ? ctx.orig.datum : null;
        const prev = d0 ? others.filter(x => x.datum < d0).pop() : others[others.length - 1], next = d0 ? others.find(x => x.datum > d0) : null;
        const n = d0 ? others.filter(x => x.datum < d0).length : others.length;
        if (prev) { lo('datum', { v: prev.datum, l: `prethodnog (${n}.) ročišta`, strict: true }); lo('datum', { v: prev.datumNarednog, l: 'narednog ročišta zakazanog na prethodnom ročištu', warn: 'Ako je ročište pomjereno ranije, ovo je u redu.' }); }
        if (next) hi('datum', { v: next.datum, l: `sljedećeg (${n + 2}.) ročišta`, strict: true });
        break;
      }
    }
    const errors = {}, warnings = {}, today = ctx.today || todayIso();
    for (const f of fieldsOf(listKey)) {
      if (f.type !== 'date') continue;
      const v = rec[f.name]; if (!isDate(v)) continue;
      if (!FUTURE_OK.has(f.name) && v > today) { errors[f.name] = 'Datum ne može biti u budućnosti.'; continue; }
      const r = R[f.name]; if (!r) continue;
      for (const x of r.lo) if (x && isDate(x.v) && (x.strict ? v <= x.v : v < x.v)) {
        const msg = `Datum ne može biti ${x.strict ? 'isti ili raniji od' : 'prije'} ${x.l} (${fmtDate(x.v)}).`;
        if (x.warn) { warnings[f.name] = warnings[f.name] || `${msg} ${x.warn}`; continue; }
        errors[f.name] = errors[f.name] || msg;
      }
      for (const x of r.hi) if (x && isDate(x.v) && (x.strict ? v >= x.v : v > x.v)) {
        const msg = `Datum ne može biti ${x.strict ? 'isti ili kasniji od' : 'poslije'} ${x.l} (${fmtDate(x.v)}).`;
        if (x.warn) { warnings[f.name] = warnings[f.name] || `${msg} ${x.warn}`; continue; }
        errors[f.name] = errors[f.name] || msg;
      }
    }
    return { errors, warnings };
  }
  // TODO: ukljuciti kad zavrsi testiranje
  const OBAVEZNA_POLJA = false;
  function validate(listKey, rec, ctx) {
    const errors = {}, warnings = {};
    ctx = { listKey, oznake: oznakeFor(listKey, LIST_BY_KEY[listKey] && LIST_BY_KEY[listKey].isCase ? rec : (ctx && ctx.case) || null), ...(ctx || {}) };
    for (const f of fieldsOf(listKey)) {
      if (!isVisible(f, rec, ctx)) continue;
      const v = rec[f.name];
      if ((f.required && OBAVEZNA_POLJA || f.userRequired) && isEmpty(v)) { errors[f.name] = 'Obavezno polje.'; continue; }
      if ((f.type === 'number' || f.type === 'money') && !isEmpty(v) && (typeof v !== 'number' || !isFinite(v) || v < 0)) { errors[f.name] = 'Unesite pozitivan broj.'; continue; }
      if (f.type === 'number' && f.max !== undefined && !isEmpty(v) && (v > f.max || !Number.isInteger(v))) { errors[f.name] = `Unesite cijeli broj od 0 do ${f.max}.`; continue; }
      if (f.type === 'money' && f.max !== undefined && !isEmpty(v) && v > f.max && (!f.maxIf || f.maxIf(rec, ctx))) { errors[f.name] = f.maxMsg || `Najviše ${f.max} €.`; continue; }
      if (f.type === 'date' && !isEmpty(v) && !isDate(v)) { errors[f.name] = 'Neispravan datum.'; continue; }
      if (f.check && !isEmpty(v)) { const res = f.check(rec, ctx || {}); if (typeof res === 'string') errors[f.name] = res; else if (res && res.warn) warnings[f.name] = res.warn; }
    }
    const LF = { pritvori: ['Datumodre_x0111_ivanjapritvora', 'u pritvoru'], jemstva: ['Odlukasuda', 'za koje je predloženo jemstvo'], nadzor: ['mjere', 'kojem su izrečene mjere nadzora'] }[baseKey(listKey)];
    if (LF && ctx && ctx.case && ctx.kids) {
      const n = ctx.kids(baseKey(listKey)).filter(x => x._id !== ctx.editId).length + 1, b = Number(ctx.case.Brojoptu_x017e_enihlica) || 0;
      if (!b) warnings[LF[0]] = warnings[LF[0]] || 'U osnovnim podacima nije upisan broj optuženih lica.';
      else if (n > b) errors[LF[0]] = `Broj optuženih u osnovnim podacima je ${b}, a ovo bi bilo ${n}. lice ${LF[1]}. Ispravite broj optuženih u osnovnim podacima.`;
    }
    const dr = dateRules(listKey, rec, ctx || {});
    for (const f of fieldsOf(listKey)) {
      if (!isVisible(f, rec, ctx)) continue;
      if (dr.errors[f.name] && !errors[f.name]) { errors[f.name] = dr.errors[f.name]; delete warnings[f.name]; }
      else if (dr.warnings[f.name] && !errors[f.name] && !warnings[f.name]) warnings[f.name] = dr.warnings[f.name];
    }
    for (const f of fieldsOf(listKey)) if (f.errorTo && f.hidden) {
      if (errors[f.name]) { errors[f.errorTo] = errors[f.errorTo] || errors[f.name]; delete errors[f.name]; }
      if (warnings[f.name]) { if (!errors[f.errorTo]) warnings[f.errorTo] = warnings[f.errorTo] || warnings[f.name]; delete warnings[f.name]; }
    }
    return { errors, warnings };
  }

  const CUSTOM_TYPES = { text: 'Kratki tekst', longtext: 'Duži tekst', number: 'Broj', money: 'Iznos (€)', date: 'Datum', bool: 'Da/Ne (kvačica)',
    choice: 'Silazni niz (jedan izbor)', multichoice: 'Višestruki izbor (kvačice)', section: 'Naslov sekcije' };
  const isCustomKey = k => /^x_[a-z0-9_]{1,48}$/.test(String(k || ''));
  const isCustomField = n => /^c_[a-z0-9_]{1,48}$/.test(String(n || ''));
  const BASE = { modules: MODULES.map(m => ({ ...m, spaces: [...m.spaces] })), spaces: SPACES.map(sp => ({ ...sp, lists: sp.lists.map(l => [...l]) })),
    forms: Object.fromEntries(Object.entries(FORMS).map(([k, v]) => [k, v.slice()])), fallback: { ...FALLBACK_CHOICES } };
  let CUSTOM = null;
  const condOk = (c, r) => { if (!c || !c.field) return true; const v = r[c.field];
    if (c.value === '__da') return v === true; if (c.value === '__ne') return v !== true; if (c.value === '__popunjeno') return !isEmpty(v);
    return Array.isArray(v) ? v.includes(c.value) : v === c.value; };
  function customField(listKey, d) {
    if (d.type === 'section') return { section: d.label || 'Sekcija', show: d.showIf && d.showIf.field ? r => condOk(d.showIf, r) : undefined, custom: true, id: d.name };
    const f = { name: d.name, label: d.label || 'Novo polje', type: CUSTOM_TYPES[d.type] ? d.type : 'text', custom: true };
    if (d.hint) f.hint = d.hint;
    if (d.wide || d.type === 'longtext' || d.type === 'multichoice') f.wide = true;
    if (d.vertical) f.vertical = true;
    if (d.archived) f.hidden = true;
    if (d.required) f.userRequired = true;
    if (d.showIf && d.showIf.field) f.show = r => condOk(d.showIf, r);
    const lo = d.min === 0 || d.min ? Number(d.min) : null, hi = d.max === 0 || d.max ? Number(d.max) : null;
    if ((f.type === 'number' || f.type === 'money') && (lo !== null || hi !== null))
      f.check = r => { const v = r[f.name]; if (typeof v !== 'number') return null;
        if (lo !== null && v < lo) return `Najmanja dozvoljena vrijednost je ${lo}.`; if (hi !== null && v > hi) return `Najveća dozvoljena vrijednost je ${hi}.`; return null; };
    if (f.type === 'date' && d.afterField) f.check = r => { const a = r[d.afterField], b = r[f.name];
      if (!isDate(a) || !isDate(b) || days(a, b) >= 0) return null; const af = (FORMS[listKey] || []).find(x => x.name === d.afterField);
      return `Datum ne može biti prije polja „${af ? af.label : d.afterField}”.`; };
    if (f.type === 'choice' || f.type === 'multichoice') FALLBACK_CHOICES[`${listKey}.${d.name}`] = (d.choices || []).filter(Boolean);
    return f;
  }
  // forme koje uredjuje admin (meta/forms)
  function applyCustom(cfg) {
    MODULES.splice(0, MODULES.length, ...BASE.modules.map(m => ({ ...m, spaces: [...m.spaces] })));
    SPACES.splice(0, SPACES.length, ...BASE.spaces.map(sp => ({ ...sp, lists: sp.lists.map(l => [...l]) })));
    for (const k of Object.keys(FORMS)) if (!BASE.forms[k]) delete FORMS[k];
    for (const [k, v] of Object.entries(BASE.forms)) FORMS[k] = v.slice();
    for (const k of Object.keys(FALLBACK_CHOICES)) if (!(k in BASE.fallback)) delete FALLBACK_CHOICES[k];
    Object.assign(FALLBACK_CHOICES, BASE.fallback);
    CUSTOM = cfg || null;
    if (cfg) {
      for (const cm of cfg.modules || []) {
        if (!isCustomKey(cm.key)) continue;
        const caseKey = cm.key + '_predmeti';
        const steps = (cm.steps || []).filter(st => isCustomKey(st.key) && st.key !== caseKey);
        MODULES.push({ key: cm.key, title: cm.title || 'Novi modul', short: cm.title || 'Novi modul', spaces: [cm.key], custom: true, archived: !!cm.archived });
        SPACES.push({ key: cm.key, module: cm.key, title: cm.spaceTitle || 'Predmeti', custom: true,
          lists: [[caseKey, cm.caseTitle || 'Osnovni podaci'], ...steps.map(st => [st.key, st.title || 'Novi korak', st.many ? 1 : 0, st.archived ? 1 : 0])] });
        FORMS[caseKey] = [{ name: 'Title', label: 'Broj predmeta', type: 'text', required: true }, { name: 'sud', label: 'Sud', type: 'choice' }, { name: 'monitor', label: 'Monitor', type: 'choice', hidden: true }];
        FALLBACK_CHOICES[`${caseKey}.sud`] = SUDOVI; FALLBACK_CHOICES[`${caseKey}.monitor`] = [];
        for (const st of steps) FORMS[st.key] = [P(caseKey)];
      }
      for (const [k, t] of Object.entries(cfg.moduleTitles || {})) { const m = MODULES.find(x => x.key === k); if (m && t) { m.title = t; m.short = t; } }
      for (const [k, t] of Object.entries(cfg.spaceTitles || {})) { const sp = SPACES.find(x => x.key === k); if (sp && t) sp.title = t; }
      for (const [k, t] of Object.entries(cfg.listTitles || {})) for (const sp of SPACES) for (const l of sp.lists) if (l[0] === k && t) l[1] = t;
      for (const [key, o] of Object.entries(cfg.overrides || {})) {
        const i = key.indexOf('.'), F = FORMS[key.slice(0, i)], name = key.slice(i + 1); if (!F || !o) continue;
        const j = F.findIndex(f => f.name === name); if (j < 0 || F[j].type === 'lookup') continue;
        F[j] = { ...F[j], ...(o.label ? { label: o.label } : {}), ...(typeof o.hint === 'string' ? { hint: o.hint || undefined } : {}), ...(o.hidden ? { hidden: true, required: false } : {}) };
      }
      for (const [lk, defs] of Object.entries(cfg.fields || {})) {
        const F = FORMS[lk]; if (!F) continue;
        for (const d of defs || []) {
          if (d.type !== 'section' && !isCustomField(d.name)) continue;
          const f = customField(lk, d);
          let at = F.length;
          if (d.after === '__start') at = Math.min(F.length, F[0] && F[0].type === 'lookup' ? 1 : 0);
          else if (d.after) { const j = F.findIndex(x => x.name === d.after || (x.custom && x.id === d.after) || (x.section && !x.custom && '§' + x.section === d.after)); if (j >= 0) at = j + 1; }
          F.splice(at, 0, f);
        }
      }
    }
    LISTS.splice(0, LISTS.length);
    for (const sp of SPACES) sp.lists.forEach(([key, title, many, archived], i) => LISTS.push({ key, title, many: !!many, space: sp.key, module: sp.module, isCase: i === 0, caseList: sp.lists[0][0], archived: !!archived }));
    for (const k of Object.keys(LIST_BY_KEY)) delete LIST_BY_KEY[k]; for (const l of LISTS) LIST_BY_KEY[l.key] = l;
    for (const k of Object.keys(SPACE_BY_KEY)) delete SPACE_BY_KEY[k]; for (const sp of SPACES) SPACE_BY_KEY[sp.key] = sp;
  }
  const customConfig = () => CUSTOM;
  function newKey(prefix, label, taken) {
    const base = String(label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'dj').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'novo';
    let k = `${prefix}_${base}`, n = 2; while (taken.has(k)) k = `${prefix}_${base}_${n++}`; return k;
  }

  function caseTitle(r) { return r ? (r.sud ? `${r.Title || '(bez broja)'} · ${r.sud.replace(/^Osnovni sud /, 'OS ').replace(/^Viši sud /, 'VS ')}` : (r.Title || '(bez broja)')) : '?'; }

  function summarize(listKey, r) {
    switch (baseKey(listKey)) {
      case 'predmeti': return caseTitle(r);
      case 'odlaganja': return `${fmtDate(r.Odlo_x017e_enood) || '?'} → ${fmtDate(r.Odlo_x017e_enodo) || '?'}${r.Razlogodlaganja ? ' · ' + r.Razlogodlaganja : ''}`;
      case 'mjere': return `${r.Mjera || 'Mjera'} · ${r.U_x010d_esnik || ''}${r.Nov_x010d_anakazna ? ' · €' + r.Nov_x010d_anakazna : ''}`;
      case 'presuda1': case 'presuda2': return `Objavljena ${fmtDate(r.Datumobjavljivanjapresude) || '—'}`;
      case 'zalba': return `Žalba ${fmtDate(r.Datumpodno_x0161_enja_x017e_albe) || '—'}${r.Odlukaudrugostepenompostupku ? ' · ' + r.Odlukaudrugostepenompostupku : ''}`;
      case 'ishod': return (r.sankcija || r.Pravosna_x017e_napresuda || r.Prvostepenapresuda || 'Ishod').slice(0, 80);
      case 'pritvori': return `${r.liceBr ? 'Lice ' + r.liceBr : r.Okrivljeni_x002f_Optu_x017e_eni || 'Lice'} · od ${fmtDate(r.Datumodre_x0111_ivanjapritvora) || '?'}${r.Datumukidanjapritvora ? ' do ' + fmtDate(r.Datumukidanjapritvora) : ''}`;
      case 'nadzor': return `${r.liceBr ? 'Lice ' + r.liceBr : r.okrivljeni || 'Lice'} · ${(r.mjere || []).join(', ') || 'mjere nisu upisane'}`;
      case 'jemstva': return `${r.liceBr ? 'Lice ' + r.liceBr : r.Optu_x017e_eni || 'Lice'}${r.Odlukasuda ? ' · ' + r.Odlukasuda : ''}`;
      case 'vpl': return `${r.vrsta || 'Vanredni pravni lijek'}${r.datumPodnosenja ? ' · ' + fmtDate(r.datumPodnosenja) : ''}`;
      case 'komentari': return (r.Komentarmonitora || '').slice(0, 90);
      case 'faze': return `Ponovljeno suđenje ${(r.faza || 2) - 1}${r.brojPredmeta ? ' · ' + r.brojPredmeta : ''}`;
      case 'rocista': return `${fmtDate(r.datum) || '?'} · ${r.odrzano ? 'održano' : 'odloženo'}${r.razlogOdlaganja ? ' · ' + r.razlogOdlaganja : ''}`;
      default: {
        const F = (FORMS[listKey] || []).filter(f => f.name && f.type !== 'lookup' && !f.hidden && !isEmpty(r[f.name]));
        return F.slice(0, 3).map(f => f.type === 'date' ? fmtDate(r[f.name]) : f.type === 'bool' ? f.label : Array.isArray(r[f.name]) ? r[f.name].join(', ') : String(r[f.name])).join(' · ').slice(0, 120) || 'Unos';
      }
    }
  }

  const isPhased = listKey => PHASED.includes(baseKey(listKey));
  const api = { TOK_DOGADJAJI, TOK_KRAJ, TOK_FAZE, TOK_STARA, TOK_IZVEDENA, tokFaza, tokIzStarog, tokUStaro, tokProvjera, tokPregled, tokSort, CUSTOM_TYPES, isCustomKey, isCustomField, applyCustom, customConfig, newKey, SDT_IZMJENE, SDT_GRUPE, sdtRezim, sdtDozvoljen, sdtProvjera, isOkk, ROC_MJERE, rocMjere, rocMjereZbir, ODL_UCESNICI, ODL_DOSTAVA, ODL_GRUPE, ODL_OPIS, rocRazlozi, KZ, DODACI, kzClan, tackeU, djeloText, djelaText, parseDjela, OBAVEZNA_POLJA, OZNAKE, oznakeFor, splitCaseNo, normCaseNo, dateRules, ZKP_IZMJENE_2026, noviZKP, addMonths, potvrdaRok, PHASED, isPhased, MODULES, SPACES, SPACE_BY_KEY, LISTS, LIST_BY_KEY, FORMS, FALLBACK_CHOICES, SUDOVI, listsOf, baseKey, choiceKeys, fallbackChoices,
    fieldsOf, isVisible, sectionVisible, validate, summarize, caseTitle, isEmpty, isDate, days, dayNum, fmtDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Schema = api;
})(typeof self !== 'undefined' ? self : this);
