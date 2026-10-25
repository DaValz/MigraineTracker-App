// Cerca i termini che compaiono, in lingue diverse, con significati incompatibili (es. "testa" = testa in italiano e fronte in portoghese).
// Le liste di tutte le lingue vengono unite: una parola ambigua puo' dare un risultato sbagliato anche in una nota scritta in un'altra lingua.
// Uso:  node tests/notes_collide.mjs [--all] [lingua ...]     (senza lingue: tutte le coppie; con lingue: solo i termini di quelle lingue contro tutte le altre)
// Esce con codice 1 se trova conflitti "gravi" (categorie di contenuto diverse); --all mostra anche quelli lievi (stessa categoria, valori diversi).
import { termSource } from '../js/notes/util.js';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { LANG_MODULES } = await import('../js/notes/lexicon.js');

const args = process.argv.slice(2);
const showAll = args.includes('--all');
const only = args.filter((a) => !a.startsWith('--'));

const LISTS = ['menses', 'er', 'hosp', 'other', 'noPain', 'pain', 'allDay', 'fewHours', 'negator', 'worse', 'sideNot', 'mensesNot'];
const GROUPS = ['side', 'aura', 'type', 'effect', 'area', 'quality', 'symptom', 'trigger'];

const entries = []; // { lang, term, cat, key }
LANG_MODULES.forEach((L) => {
  const add = (list, cat, key = '') => (list || []).forEach((term) => entries.push({ lang: L.code, term, cat, key: String(key) }));
  (L.months || []).forEach((l, i) => add(l, 'month', i + 1));
  (L.weekdays || []).forEach((l, i) => add(l, 'weekday', i + 1));
  LISTS.forEach((k) => add(L[k], k));
  GROUPS.forEach((g) => Object.entries(L[g] || {}).forEach(([k, list]) => add(list, g, k)));
  Object.entries(L.severity || {}).forEach(([v, list]) => add(list, 'severity', v));
  Object.entries(L.meds || {}).forEach(([n, list]) => add(list, 'med', n));
});

const byTerm = new Map();
entries.forEach((e) => {
  if (!byTerm.has(e.term)) byTerm.set(e.term, []);
  byTerm.get(e.term).push(e);
});

const label = (e) => `${e.lang}:${e.cat}${e.key ? `.${e.key}` : ''}`;
// Il fattore "Ciclo mestruale" e l'elenco `menses` dicono la stessa cosa: non sono in conflitto.
const sig = (e) => (e.cat === 'trigger' && e.key === 'Ciclo mestruale' ? 'menses|' : `${e.cat}|${e.key}`);
// Coppie di categorie diverse che possono convivere sulla stessa parola senza danni (si possono sommare).
const BENIGN = [['pain', 'severity'], ['other', 'trigger'], ['other', 'symptom'], ['month', 'weekday'], ['month', 'negator'], ['severity', 'quality'], ['severity', 'worse'], ['effect', 'worse'], ['other', 'noPain'], ['hosp', 'er']];
const benignPair = (a, b) => BENIGN.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
const problems = [];
const seen = new Set();
// Conflitti esaminati a mano e innocui: nel punto in cui la parola viene cercata ha un solo significato possibile.
const AUDITED = new Set([
  // "mrt": olandese = marzo (conta solo nelle date a inizio riga: "3 mrt"), tedesco "MRT" = risonanza (letta nel testo dopo la data).
  // A inizio riga, "MRT 15.7.2024" e "MRT 15 Uhr" non vengono prese per una data (tests/notes/de.cases.json).
  'mrt',
]);
byTerm.forEach((list, term) => {
  if (AUDITED.has(term)) return;
  const sigs = new Set(list.map(sig));
  if (sigs.size < 2) return;
  const langs = new Set(list.map((e) => e.lang));
  if (langs.size < 2 && !showAll) return; // stessa lingua: lo vede notes_lex_check
  if (only.length && !list.some((e) => only.includes(e.lang))) return;
  const cats = [...new Set(list.map((e) => e.cat))];
  const mild = cats.length === 2 && benignPair(cats[0], cats[1]);
  const k = `${term}|${[...sigs].sort().join('+')}`;
  if (seen.has(k)) return;
  seen.add(k);
  problems.push({ term, labels: list.map(label), severe: !mild });
});

// I termini con asterisco (jolly) possono coprire parole di altre categorie.
const wild = entries.filter((e) => e.term.includes('*'));
const exact = entries.filter((e) => !e.term.includes('*'));
wild.forEach((w) => {
  const re = new RegExp(`^${termSource(w.term)}$`);
  exact.forEach((e) => {
    if (e.lang === w.lang || sig(e) === sig(w) || !re.test(e.term)) return;
    if (only.length && !only.includes(w.lang) && !only.includes(e.lang)) return;
    if (w.cat !== e.cat && benignPair(w.cat, e.cat)) return;
    const k = `${w.term}~${e.term}|${sig(w)}|${sig(e)}`;
    if (seen.has(k)) return;
    seen.add(k);
    problems.push({ term: `${w.term}  ~  ${e.term}`, labels: [label(w), label(e)], severe: true });
  });
});

problems.sort((a, b) => Number(b.severe) - Number(a.severe) || a.term.localeCompare(b.term));
let nSevere = 0;
problems.forEach((p) => {
  if (!p.severe && !showAll) return;
  if (p.severe) nSevere += 1;
  console.log(`${p.severe ? 'CONFLITTO' : 'lieve    '}  ${JSON.stringify(p.term)}  ->  ${p.labels.join('  |  ')}`);
});
console.log(`${nSevere} conflitti, ${problems.length - nSevere} lievi${showAll ? '' : ' (non mostrati: usa --all)'}`);
process.exit(nSevere ? 1 : 0);
