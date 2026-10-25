/* i18n-ignore-file */
/* Unisce i dizionari di tutte le lingue (js/notes/lex/*.js) e il catalogo dei farmaci in espressioni regolari pronte all'uso.
 * Una nota puo' mescolare le lingue, quindi i termini di tutte le lingue valgono sempre insieme. */
import { alt, termsRe, termSource } from './util.js';
import { MED_CATALOG } from './meds.js';
import it from './lex/it.js';
import en from './lex/en.js';
import es from './lex/es.js';
import fr from './lex/fr.js';
import de from './lex/de.js';
import pt from './lex/pt.js';
import ro from './lex/ro.js';
import nl from './lex/nl.js';

export const LANG_MODULES = [it, en, es, fr, de, pt, ro, nl];

const flat = (pick) => LANG_MODULES.flatMap((l) => pick(l) || []);
const keysOf = (pick) => [...new Set(LANG_MODULES.flatMap((l) => Object.keys(pick(l) || {})))];
const mapTerms = (pick, key) => LANG_MODULES.flatMap((l) => ((pick(l) || {})[key]) || []);
const group = (pick) => keysOf(pick).map((name) => ({ name, re: termsRe(mapTerms(pick, name)) }));

const monthTerms = Array.from({ length: 12 }, (_, i) => flat((l) => (l.months || [])[i]));
const weekdayTerms = Array.from({ length: 7 }, (_, i) => flat((l) => (l.weekdays || [])[i]));

const monthMap = new Map();
monthTerms.forEach((list, i) => list.forEach((t) => monthMap.set(t, i + 1)));
const weekdayMap = new Map();
weekdayTerms.forEach((list, i) => list.forEach((t) => weekdayMap.set(t, i + 1)));

const plainList = (map) => [...map.keys()].sort((a, b) => b.length - a.length).map(termSource).join('|');

const medNames = new Map(MED_CATALOG.map((m) => [m.name, { ...m, terms: [...m.terms] }]));
LANG_MODULES.forEach((l) => {
  Object.entries(l.meds || {}).forEach(([name, terms]) => {
    if (medNames.has(name)) medNames.get(name).terms.push(...terms);
  });
});
const meds = [...medNames.values()].map((m) => ({
  name: m.name, cls: m.cls, generic: !!m.generic, terms: m.terms, re: termsRe(m.terms),
}));
const fuzzy = new Map();
meds.forEach((m, i) => m.terms.forEach((t) => {
  if (/^[a-z]{6,}$/.test(t) && !fuzzy.has(t)) fuzzy.set(t, i);
}));

const numWord = [1, 2, 3, 4].map((v) => {
  const terms = LANG_MODULES.flatMap((l) => (l.numWord || {})[v] || []);
  return { v, src: alt(terms) };
});
const severity = Array.from({ length: 10 }, (_, i) => ({ v: i + 1, terms: LANG_MODULES.flatMap((l) => (l.severity || {})[i + 1] || []) }))
  .filter((s) => s.terms.length).map((s) => ({ v: s.v, re: termsRe(s.terms) }));

export const LEX = {
  monthMap,
  weekdayMap,
  monthSrc: plainList(monthMap),
  weekdaySrc: plainList(weekdayMap),
  glueSrc: alt(flat((l) => l.glue)),
  rangeToSrc: alt(flat((l) => l.rangeTo)),
  rangeFromSrc: alt(flat((l) => l.rangeFrom)),
  datePrefixSrc: alt(flat((l) => l.datePrefix)),
  monthPrefixSrc: alt(flat((l) => l.monthPrefix)),
  yearWordSrc: alt(flat((l) => l.yearWord)),
  dittoRe: new RegExp(`^${alt(flat((l) => l.ditto))}$`),

  side: {
    sx: termsRe(flat((l) => (l.side || {}).sx)),
    dx: termsRe(flat((l) => (l.side || {}).dx)),
    bil: termsRe(flat((l) => (l.side || {}).bil)),
    not: termsRe(flat((l) => l.sideNot)),
  },
  area: group((l) => l.area),
  quality: group((l) => l.quality),
  aura: {
    any: termsRe(flat((l) => (l.aura || {}).any)),
    visual: termsRe(flat((l) => (l.aura || {}).visual)),
    sensory: termsRe(flat((l) => (l.aura || {}).sensory)),
    speech: termsRe(flat((l) => (l.aura || {}).speech)),
    motor: termsRe(flat((l) => (l.aura || {}).motor)),
  },
  type: {
    tension: termsRe(flat((l) => (l.type || {}).tension)),
    cluster: termsRe(flat((l) => (l.type || {}).cluster)),
    withAura: termsRe(flat((l) => (l.type || {}).withAura)),
    noAura: termsRe(flat((l) => (l.type || {}).noAura)),
  },
  symptom: group((l) => l.symptom),
  trigger: group((l) => l.trigger),
  menses: termsRe(flat((l) => l.menses)),
  mensesNot: termsRe(flat((l) => l.mensesNot)),
  mensesBefore: termsRe(flat((l) => l.mensesBefore)),

  severity,
  intensityKeyword: termsRe(flat((l) => l.intensityKeyword)),
  intensityKeywordSrc: alt(flat((l) => l.intensityKeyword)),
  outOfSrc: alt(flat((l) => l.outOf)),
  worse: termsRe(flat((l) => l.worse)),
  negator: termsRe(flat((l) => l.negator)),

  effect: {
    none: termsRe(flat((l) => (l.effect || {}).none)),
    partial: termsRe(flat((l) => (l.effect || {}).partial)),
    good: termsRe(flat((l) => (l.effect || {}).good)),
    resolved: termsRe(flat((l) => (l.effect || {}).resolved)),
  },
  tookRe: termsRe(flat((l) => l.took)),
  tookSrc: alt(flat((l) => l.took)),
  notMeds: new Set(flat((l) => l.notMeds)),
  numWord,
  meds,
  fuzzyMeds: fuzzy,

  er: termsRe(flat((l) => l.er)),
  hosp: termsRe(flat((l) => l.hosp)),
  other: termsRe(flat((l) => l.other)),
  noPain: termsRe(flat((l) => l.noPain)),
  pain: termsRe(flat((l) => l.pain)),
  allDay: termsRe(flat((l) => l.allDay)),
  fewHours: termsRe(flat((l) => l.fewHours)),
  durationCueSrc: alt(flat((l) => l.durationCue)),
  hoursWordSrc: alt(flat((l) => l.hoursWord)),
  daysWordSrc: alt(flat((l) => l.daysWord)),
};
