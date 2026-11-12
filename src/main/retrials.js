'use strict';
const crypto = require('crypto');

const PHASED = ['odlaganja', 'mjere', 'presuda1', 'zalba', 'presuda2'];
const SHARED = ['pritvori', 'jemstva', 'nadzor', 'vpl', 'komentari'];
const norm = s => String(s || '').toLowerCase().replace(/^n\s+/, '').replace(/\s+/g, ' ').trim();
const isRetrial = c => /ponovljen/i.test(c.fields.Title || '') || c.fields.Ponovljenipostupak === true;
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const empty = v => v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && !v.length);

// ponovljeni postupak ide kao faza originalnog predmeta
function mergeRetrials(recs, prefix) {
  const L = k => recs[prefix + k] || [];
  const cases = L('predmeti');
  const report = { merged: [], unmatched: [] };
  const kids = (k, id) => L(k).filter(r => r.fields.Predmet === id);
  const originals = cases.filter(c => !isRetrial(c));
  const sameCourt = (a, b) => (a.fields.sud || '') === (b.fields.sud || '');
  const ukinuta = c => kids('zalba', c.id).some(z => /ukida/i.test(z.fields.Odlukaudrugostepenompostupku || ''));

  const plan = new Map();
  for (const r of cases.filter(isRetrial)) {
    const t = r.fields.Title || '';
    let o = null;
    const ref = t.match(/ponovljen\w*\s+(?:postup\w*\s+)?\(?\s*((?:n\s+)?K\w*\s*\d+\/\d+)/i);
    if (ref) o = originals.find(c => sameCourt(c, r) && norm(c.fields.Title) === norm(ref[1]));
    if (!o) { const base = norm(t.replace(/\(?\s*ponovljen[^)]*\)?/i, '')); o = originals.find(c => sameCourt(c, r) && norm(c.fields.Title) === base); }
    if (!o) {
      const akt = norm(r.fields.Brojoptu_x017e_nice);
      if (akt && akt !== '-') {
        let cand = originals.filter(c => sameCourt(c, r) && norm(c.fields.Brojoptu_x017e_nice) === akt);
        if (cand.length > 1) cand = cand.filter(ukinuta);
        if (cand.length === 1) o = cand[0];
      }
    }
    if (!o) { report.unmatched.push(t); continue; }
    if (!plan.has(o.id)) plan.set(o.id, []);
    plan.get(o.id).push(r);
  }

  const remove = new Set();
  for (const [oid, list] of plan) {
    const o = cases.find(c => c.id === oid);
    const when = r => [r.fields.Datumnaredbezaodr_x017e_avanjegl, r.fields.Datumzakazivanjaprvogro_x010d_i_, ...kids('presuda1', r.id).map(p => p.fields.Datumobjavljivanjapresude)].filter(isDate).sort()[0] || '9999';
    list.sort((a, b) => when(a).localeCompare(when(b)));
    list.forEach((r, i) => {
      const faza = i + 2;
      (recs[prefix + 'faze'] = recs[prefix + 'faze'] || []).push({ id: crypto.randomUUID(), fields: {
        Predmet: o.id, faza, brojPredmeta: String(r.fields.Title || '').replace(/\s*\(?\s*ponovljen.*$/i, '').trim() || null, Datumnaredbezaodr_x017e_avanjegl: r.fields.Datumnaredbezaodr_x017e_avanjegl || null,
        Datumzakazivanjaprvogro_x010d_i_: r.fields.Datumzakazivanjaprvogro_x010d_i_ || null, Brojodr_x017e_anihro_x010d_i_x01: r.fields.Brojodr_x017e_anihro_x010d_i_x01 ?? null,
        Brojodlo_x017e_enihro_x010d_i_x0: r.fields.Brojodlo_x017e_enihro_x010d_i_x0 ?? null, napomena: null } });
      for (const k of PHASED) for (const x of kids(k, r.id)) { x.fields.Predmet = o.id; x.fields.faza = faza; }
      for (const k of SHARED) for (const x of kids(k, r.id)) x.fields.Predmet = o.id;
      const io = kids('ishod', o.id)[0], ir = kids('ishod', r.id)[0];
      if (ir) {
        if (!io) ir.fields.Predmet = o.id;
        else {
          for (const f of ['Prvostepenapresuda', 'Pravosna_x017e_napresuda', 'sankcija']) if (ir.fields[f]) io.fields[f] = [io.fields[f], `Ponovljeno suđenje ${faza - 1} (${r.fields.Title}): ${ir.fields[f]}`].filter(Boolean).join('\n\n');
          recs[prefix + 'ishod'].splice(recs[prefix + 'ishod'].indexOf(ir), 1);
        }
      }
      for (const [k, v] of Object.entries(r.fields)) if (empty(o.fields[k]) && !empty(v) && !['Title', 'Ponovljenipostupak'].includes(k)) o.fields[k] = v;
      const pr = r.fields.Odlaganjero_x010d_i_x0161_ta;
      if (isDate(pr) && (!isDate(o.fields.Odlaganjero_x010d_i_x0161_ta) || pr > o.fields.Odlaganjero_x010d_i_x0161_ta)) o.fields.Odlaganjero_x010d_i_x0161_ta = pr;
      if (r.fields._razloziAS) { const h = { ...(o.fields._razloziAS || {}) }; for (const [k, v] of Object.entries(r.fields._razloziAS)) h[k] = (h[k] || 0) + v; o.fields._razloziAS = h; }
      remove.add(r.id);
      report.merged.push(`${r.fields.Title}${r.fields.sud ? ' (' + r.fields.sud + ')' : ''} → ${o.fields.Title}, ponovljeno suđenje ${faza - 1}`);
    });
    o.fields.Ponovljenipostupak = false;
  }
  recs[prefix + 'predmeti'] = cases.filter(c => !remove.has(c.id));
  for (const c of recs[prefix + 'predmeti']) if (c.fields.Ponovljenipostupak) c.fields.Ponovljenipostupak = false;
  return report;
}

module.exports = { mergeRetrials, PHASED };
