// Prova del lettore di note sui casi di tests/notes/<lingua>.cases.json (testi sintetici: niente dati reali).
// Uso:  node tests/notes_run.mjs [lingua ...] [--verbose]      senza argomenti: tutti i file *.cases.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const here = path.dirname(fileURLToPath(import.meta.url));
const { parseNotes } = await import('../js/notes/parse.js');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const langs = args.filter((a) => !a.startsWith('--'));
const dir = path.join(here, 'notes');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.cases.json') && (!langs.length || langs.includes(f.split('.')[0])));

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const hasAll = (have, want) => want.every((x) => have.includes(x));

function checkEntry(got, want) {
  const errs = [];
  const eq = (k, a, b) => { if (a !== b) errs.push(`${k}: atteso ${JSON.stringify(b)}, trovato ${JSON.stringify(a)}`); };
  ['date', 'endDate', 'intensity', 'side', 'type', 'kind', 'approxDur'].forEach((k) => { if (k in want) eq(k, got[k], want[k]); });
  ['menses', 'mensesToday', 'er', 'hosp'].forEach((k) => { if (k in want) eq(k, !!got[k], want[k]); });
  ['areas', 'quality', 'aura', 'symptoms', 'triggers'].forEach((k) => {
    if (k in want && !sameSet(got[k], want[k])) errs.push(`${k}: atteso ${JSON.stringify(want[k])}, trovato ${JSON.stringify(got[k])}`);
    if (`${k}Has` in want && !hasAll(got[k], want[`${k}Has`])) errs.push(`${k}: deve contenere ${JSON.stringify(want[`${k}Has`])}, trovato ${JSON.stringify(got[k])}`);
  });
  if ('meds' in want) {
    const names = got.meds.map((m) => m.name);
    if (!sameSet(names, want.meds.map((m) => m.name))) errs.push(`meds: attesi ${JSON.stringify(want.meds.map((m) => m.name))}, trovati ${JSON.stringify(names)}`);
    want.meds.forEach((wm) => {
      const gm = got.meds.find((m) => m.name === wm.name);
      if (!gm) return;
      ['count', 'dose', 'effect'].forEach((k) => { if (k in wm && gm[k] !== wm[k]) errs.push(`meds[${wm.name}].${k}: atteso ${JSON.stringify(wm[k])}, trovato ${JSON.stringify(gm[k])}`); });
    });
  }
  if ('flags' in want) Object.entries(want.flags).forEach(([k, v]) => { if (!!got.flags[k] !== v) errs.push(`flags.${k}: atteso ${v}`); });
  return errs;
}

let fail = 0;
let total = 0;
for (const file of files) {
  const cases = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  for (const c of cases) {
    total += 1;
    const { entries, meta } = parseNotes(c.text != null ? c.text : (c.lines || []).join('\n'), { today: c.today || '2026-10-25', order: c.parseOrder || 'auto', hintOrder: c.hintOrder || 'dmy' });
    const errs = [];
    if ('count' in c && entries.length !== c.count) errs.push(`numero di voci: atteso ${c.count}, trovato ${entries.length}`);
    if (c.order && meta.order !== c.order) errs.push(`ordine data: atteso ${c.order}, trovato ${meta.order}`);
    if (c.firstDate && meta.firstDate !== c.firstDate) errs.push(`prima data: attesa ${c.firstDate}, trovata ${meta.firstDate}`);
    if (c.lastDate && meta.lastDate !== c.lastDate) errs.push(`ultima data: attesa ${c.lastDate}, trovata ${meta.lastDate}`);
    (c.expect || []).forEach((want, i) => {
      const got = entries[i];
      if (!got) { errs.push(`voce ${i}: manca`); return; }
      checkEntry(got, want).forEach((e) => errs.push(`voce ${i} (${got.date || '?'} «${got.text.slice(0, 40)}»): ${e}`));
    });
    if (errs.length) {
      fail += 1;
      console.log(`FAIL ${file.split('.')[0]} / ${c.name}`);
      errs.forEach((e) => console.log(`     ${e}`));
      if (verbose) entries.forEach((e, i) => console.log(`     [${i}] ${e.date}${e.endDate ? `..${e.endDate}` : ''} I${e.intensity ?? '-'} ${e.side || '-'} ${e.areas.join('/')} | ${e.meds.map((m) => m.name).join(',')} | ${e.symptoms.join('/')} | ${e.triggers.join('/')} | ${e.text.slice(0, 50)}`));
    } else if (verbose) console.log(`ok   ${file.split('.')[0]} / ${c.name} (${entries.length} voci)`);
  }
}
console.log(`${total - fail}/${total} casi superati`);
process.exit(fail ? 1 : 0);
