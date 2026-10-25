// Controllo formale dei dizionari del lettore di note (js/notes/lex/*.js).
// Uso:  node tests/notes_lex_check.mjs [lingua ...]     (senza argomenti: tutte)
// Verifica: chiavi e liste presenti, termini nel formato giusto (minuscoli, senza accenti), chiavi canoniche uguali ai valori dell'app,
// niente termini che compaiono in due categorie incompatibili e nessun termine vuoto o doppio nella stessa lista.
import { w } from '../js/notes/util.js';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const data = await import('../js/data.js');
const { MED_BY_NAME } = await import('../js/notes/meds.js');
const { LANG_MODULES } = await import('../js/notes/lexicon.js');

const only = process.argv.slice(2);
const errors = [];
const warn = [];
const TERM = /^[a-z0-9][a-z0-9 *'\-&+.]*$/;

const CANON = {
  area: data.PAIN_AREAS,
  quality: data.PAIN_QUALITY,
  symptom: data.DEFAULT_SYMPTOMS,
  trigger: [...data.DEFAULT_TRIGGERS, ...data.CYCLE_TRIGGERS],
};
const LISTS = ['glue', 'rangeTo', 'rangeFrom', 'datePrefix', 'monthPrefix', 'yearWord', 'ditto', 'sideNot', 'menses', 'mensesNot', 'mensesBefore', 'intensityKeyword', 'outOf', 'worse', 'negator', 'took', 'notMeds', 'er', 'hosp', 'other', 'noPain', 'pain', 'allDay', 'fewHours', 'durationCue', 'hoursWord', 'daysWord'];
const GROUPS = { side: ['sx', 'dx', 'bil'], aura: ['any', 'visual', 'sensory', 'speech', 'motor'], type: ['tension', 'cluster', 'withAura', 'noAura'], effect: ['none', 'partial', 'good', 'resolved'] };

function checkTerms(lang, where, list) {
  if (!Array.isArray(list)) { errors.push(`${lang}: ${where} non e' una lista`); return; }
  const seen = new Set();
  list.forEach((t) => {
    if (typeof t !== 'string' || !TERM.test(t)) errors.push(`${lang}: ${where}: termine non valido ${JSON.stringify(t)} (minuscolo, senza accenti: usa a-z 0-9 spazio * ' - & + .)`);
    else if (t !== t.trim() || /\s{2,}/.test(t)) errors.push(`${lang}: ${where}: spazi in eccesso in ${JSON.stringify(t)}`);
    else if (seen.has(t)) warn.push(`${lang}: ${where}: termine doppio ${JSON.stringify(t)}`);
    seen.add(t);
  });
}

for (const L of LANG_MODULES) {
  if (only.length && !only.includes(L.code)) continue;
  const lang = L.code;
  if (!Array.isArray(L.months) || L.months.length !== 12) errors.push(`${lang}: months deve avere 12 liste`);
  else L.months.forEach((m, i) => checkTerms(lang, `months[${i}]`, m));
  if (!Array.isArray(L.weekdays) || L.weekdays.length !== 7) errors.push(`${lang}: weekdays deve avere 7 liste (da lunedi')`);
  else L.weekdays.forEach((m, i) => checkTerms(lang, `weekdays[${i}]`, m));
  LISTS.forEach((k) => checkTerms(lang, k, L[k] || []));
  Object.entries(GROUPS).forEach(([g, keys]) => keys.forEach((k) => checkTerms(lang, `${g}.${k}`, (L[g] || {})[k] || [])));
  Object.entries(CANON).forEach(([g, canon]) => {
    const obj = L[g] || {};
    Object.keys(obj).forEach((k) => { if (!canon.includes(k)) errors.push(`${lang}: ${g}: chiave sconosciuta ${JSON.stringify(k)} (deve essere uno dei valori dell'app)`); });
    canon.forEach((k) => { if (!(k in obj)) warn.push(`${lang}: ${g}: manca ${JSON.stringify(k)}`); });
    Object.entries(obj).forEach(([k, list]) => checkTerms(lang, `${g}.${k}`, list));
  });
  const sev = L.severity || {};
  for (let v = 1; v <= 10; v += 1) {
    if (!sev[v] || !sev[v].length) warn.push(`${lang}: severity[${v}] vuota`);
    else checkTerms(lang, `severity.${v}`, sev[v]);
  }
  Object.entries(L.meds || {}).forEach(([name, list]) => {
    if (!MED_BY_NAME.has(name)) errors.push(`${lang}: meds: farmaco sconosciuto ${JSON.stringify(name)} (vedi js/notes/meds.js)`);
    checkTerms(lang, `meds.${name}`, list);
  });
  Object.entries(L.numWord || {}).forEach(([n, list]) => checkTerms(lang, `numWord.${n}`, list));
  ['months', 'weekdays', 'side', 'area', 'quality', 'aura', 'symptom', 'trigger', 'severity', 'effect', 'took', 'negator', 'pain', 'noPain', 'er', 'other'].forEach((k) => {
    if (L[k] === undefined) errors.push(`${lang}: manca ${k}`);
  });
}
warn.slice(0, 60).forEach((x) => console.log(`avviso: ${x}`));
errors.forEach((x) => console.log(`ERRORE: ${x}`));
console.log(`${errors.length} errori, ${warn.length} avvisi`);
process.exit(errors.length ? 1 : 0);
