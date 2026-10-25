// Prova di robustezza del lettore di note: testi inventati a caso (date strane, parole di tutte le lingue, simboli, righe enormi)
// non devono mai dare errori o voci non valide, e tutto cio' che esce deve poter essere salvato nel diario.
// Uso:  node tests/notes_fuzz.mjs [numero di note (default 300)] [seme (default 1)] [--stats]
// Esce con codice 1 alla prima violazione e stampa il testo che l'ha causata (sono solo testi inventati).
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { parseNotes } = await import('../js/notes/parse.js');
const { annotate, buildImport } = await import('../js/notes/build.js');
const { LANG_MODULES } = await import('../js/notes/lexicon.js');
const { MED_BY_NAME } = await import('../js/notes/meds.js');
const D = await import('../js/data.js');
const store = await import('../js/store.js');

const argv = process.argv.slice(2);
const STATS = argv.includes('--stats');
const nums = argv.filter((a) => !a.startsWith('--'));
const COUNT = Number(nums[0]) || 300;
const SEED = Number(nums[1]) || 1;
const TODAY = '2026-10-25';
const stat = { notes: 0, entries: 0, dated: 0, ranges: 0, intensity: 0, meds: 0, unknownMeds: 0, symptoms: 0, triggers: 0, areas: 0, episodes: 0, attack: 0, free: 0, menses: 0, other: 0 };

function mulberry32(a) {
  let s = a >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const pad = (n) => String(n).padStart(2, '0');

// ---- materiale: tutte le parole di tutti i dizionari ----
const strings = (v, out = []) => {
  if (Array.isArray(v)) v.forEach((x) => (typeof x === 'string' ? out.push(x) : strings(x, out)));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
};
const MONTHS = LANG_MODULES.flatMap((L) => strings(L.months));
const WEEKDAYS = LANG_MODULES.flatMap((L) => strings(L.weekdays));
const TERMS = LANG_MODULES.flatMap((L) => strings({ ...L, months: null, weekdays: null }));
const MEDS = LANG_MODULES.flatMap((L) => strings(L.meds));
const TOOK = LANG_MODULES.flatMap((L) => strings(L.took));
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const termText = (t) => t.replace(/\*/g, () => pick(['', 'a', 'o', 'e', 'ing', 'zzz']));

const JUNK = ['^^', '"', '\u201c', '\u201d', '...', '\u2026', '\u2014', '\u2013', '-', '/', '|', ':', ';', ',', '.', '(', ')', '[', ']', '!', '?', '*', '#', '\u2022', '\u25aa', '\u2192',
  '\ud83d\ude00', '\ud83e\udd15', '\ud83d\udc8a', '\u0645\u0631\u062d\u0628\u0627', '\u05e9\u05dc\u05d5\u05dd', '\u5934\u75db', '\u0451', '\u00df', '\u0130', '\u200b', '\u0301', '\ufeff', '\u00a0', '\t', '\u0000', '\u001b', '\ud800'];
const NUMS = () => pick([String(int(0, 12)), `${int(0, 12)}/10`, `${int(1, 10)} su 10`, `${int(1, 10)} out of 10`, `${pick([25, 50, 100, 400, 500, 600, 1000])} mg`,
  `${int(1, 4)} cpr`, `x${int(1, 6)}`, `${int(0, 23)}:${pad(int(0, 99))}`, `${int(0, 23)}.${int(0, 59)}`, String(int(0, 99999)), `${int(1, 30)}.${int(1, 12)}`]);
const randomWord = () => Array.from({ length: int(1, 14) }, () => String.fromCharCode(pick([int(97, 122), int(97, 122), int(0xe0, 0xff), int(0x100, 0x17f)]))).join('');

function dateStr() {
  const d = int(0, 33);
  const m = int(0, 13);
  const y = pick([null, null, int(0, 99), int(1895, 2230)]);
  switch (int(0, 15)) {
    case 0: return `${d}.${m}`;
    case 1: return `${d}/${m}`;
    case 2: return `${d}-${m}`;
    case 3: return `${pad(d)}.${pad(m)}.${y == null ? int(20, 26) : y}`;
    case 4: return `${d}/${m}/${y == null ? 2025 : y}`;
    case 5: return `${y == null ? 2025 : y}-${pad(m)}-${pad(d)}`;
    case 6: return `${d} ${pick(MONTHS)}`;
    case 7: return `${pick(MONTHS)} ${d}`;
    case 8: return `${pick(WEEKDAYS)} ${d} ${pick(MONTHS)} ${y == null ? 2024 : y}`;
    case 9: return `${d}-${int(0, 33)}.${m}`;
    case 10: return `${d}.${m}, ${int(0, 33)}.${int(0, 13)}`;
    case 11: return `${d}.${m}-${int(0, 33)}.${int(0, 13)}`;
    case 12: return String(d);
    case 13: return `${d}.${m}.`;
    case 14: return `${d}.${m} - ${int(0, 33)}.${int(0, 13)}.${int(2000, 2030)}`;
    default: return `${pick(['il', 'dal', 'del', 'on', 'am', 'le', 'el', 'op', 'den'])} ${d}.${m}`;
  }
}

function bodyText() {
  const parts = [];
  for (let i = int(0, 14); i > 0; i -= 1) {
    const r = rnd();
    if (r < 0.4) parts.push(termText(pick(TERMS)));
    else if (r < 0.48) parts.push(termText(pick(MEDS)));
    else if (r < 0.56) parts.push(`${termText(pick(TOOK))} ${pick(['', '', '1 ', '2 ', 'un ', 'the '])}${capital(randomWord())}${pick(['', ' 20 mg', ' 100', ' x2'])}`);
    else if (r < 0.7) parts.push(NUMS());
    else if (r < 0.9) parts.push(pick(JUNK));
    else parts.push(randomWord());
  }
  return parts.join(pick([' ', ' ', ' ', ', ', '; ', '']));
}

function noteText() {
  const lines = [];
  for (let i = int(1, 60); i > 0; i -= 1) {
    const r = rnd();
    if (r < 0.06) lines.push(String(int(1890, 2230)));
    else if (r < 0.12) lines.push(`${pick(MONTHS)}${rnd() < 0.5 ? ` ${int(1900, 2200)}` : ''}`);
    else if (r < 0.16) lines.push('');
    else if (r < 0.2) lines.push(bodyText());
    else lines.push(`${pick(['', '', '', '- ', '\u2022 ', '* ', '1. ', '(', '> ', '#'])}${dateStr()}${pick([' ', ': ', ' - ', ' ', '\t', ''])}${bodyText()}`);
  }
  return lines.join(pick(['\n', '\n', '\r\n', '\r']));
}

// ---- controlli ----
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validIso = (s) => typeof s === 'string' && ISO.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s && s >= '1900-01-01' && s <= '2200-12-31';
const KINDS = new Set(['attack', 'free', 'menses', 'other']);
const SIDES = new Set(['', 'sx', 'dx', 'bil', 'alt']);
const TYPES = new Set(['', 'senza_aura', 'con_aura', 'tensiva', 'grappolo', 'altro']);
const APPROX = new Set(['', 'lt4', '4to12', '12to24', 'days']);
const NAMES = {
  areas: new Set(D.PAIN_AREAS),
  quality: new Set(D.PAIN_QUALITY),
  aura: new Set(D.AURA_TYPES),
  symptoms: new Set(D.DEFAULT_SYMPTOMS),
  triggers: new Set([...D.DEFAULT_TRIGGERS, ...D.CYCLE_TRIGGERS]),
};

function check(text, idx) {
  const errs = [];
  const bad = (m) => errs.push(m);
  const t0 = performance.now();
  let res;
  try {
    res = parseNotes(text, { today: TODAY });
  } catch (e) {
    return [`ECCEZIONE in parseNotes: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`];
  }
  const ms = performance.now() - t0;
  if (ms > 5000) bad(`troppo lento: ${Math.round(ms)} ms`);
  const { entries, meta } = res;
  if (!Array.isArray(entries) || !meta) return ['risultato senza voci o meta'];
  const keys = new Set();
  stat.notes += 1;
  entries.forEach((e, i) => {
    const at = `voce ${i}`;
    stat.entries += 1;
    if (e.date) stat.dated += 1;
    if (e.endDate) stat.ranges += 1;
    if (e.intensity != null) stat.intensity += 1;
    stat.meds += e.meds.length;
    stat.unknownMeds += e.meds.filter((m) => m.unknown).length;
    stat.symptoms += e.symptoms.length;
    stat.triggers += e.triggers.length;
    stat.areas += e.areas.length;
    if (stat[e.kind] != null) stat[e.kind] += 1;
    if (keys.has(e.key)) bad(`${at}: chiave doppia ${e.key}`);
    keys.add(e.key);
    if (e.date != null && !validIso(e.date)) bad(`${at}: data non valida ${JSON.stringify(e.date)}`);
    if (e.endDate && (!validIso(e.endDate) || !e.date || e.endDate < e.date)) bad(`${at}: fine non valida ${JSON.stringify(e.endDate)} (inizio ${e.date})`);
    if (e.intensity != null && !(Number.isInteger(e.intensity) && e.intensity >= 1 && e.intensity <= 10)) bad(`${at}: intensita' ${e.intensity}`);
    if (!KINDS.has(e.kind)) bad(`${at}: tipo di riga ${e.kind}`);
    if (!SIDES.has(e.side || '')) bad(`${at}: lato ${e.side}`);
    if (!TYPES.has(e.type || '')) bad(`${at}: tipo ${e.type}`);
    if (!APPROX.has(e.approxDur || '')) bad(`${at}: durata ${e.approxDur}`);
    if (typeof e.text !== 'string') bad(`${at}: testo non stringa`);
    Object.entries(NAMES).forEach(([k, set]) => {
      if (!Array.isArray(e[k])) bad(`${at}: ${k} non e' un elenco`);
      else e[k].forEach((n) => { if (!set.has(n)) bad(`${at}: ${k} contiene un valore sconosciuto ${JSON.stringify(n)}`); });
    });
    if (!Array.isArray(e.meds)) bad(`${at}: meds non e' un elenco`);
    else {
      e.meds.forEach((m) => {
        if (typeof m.name !== 'string' || !m.name) bad(`${at}: farmaco senza nome`);
        else if (!m.unknown && !MED_BY_NAME.has(m.name)) bad(`${at}: farmaco fuori catalogo ${m.name}`);
        if (!Number.isInteger(m.count) || m.count < 1 || m.count > 99) bad(`${at}: quantita' ${m.name} = ${m.count}`);
        if (m.effect != null && ![0, 1, 2, 3].includes(m.effect)) bad(`${at}: effetto ${m.name} = ${m.effect}`);
      });
    }
  });

  // dall'anteprima al diario
  try {
    const rows = annotate(entries, { today: TODAY, existingDays: new Set() });
    const plan = buildImport(rows, { defaultIntensity: 5, mergeConsecutive: idx % 2 === 0 });
    stat.episodes += plan.episodes.length;
    plan.episodes.forEach((ep, i) => {
      const clean = store.sanitizeEpisode({ ...ep, id: undefined });
      if (!clean) bad(`episodio ${i}: scartato dalla validazione (${ep.start})`);
    });
    Object.keys(plan.days).forEach((d) => { if (!validIso(d)) bad(`giorno non valido ${d}`); });
    plan.events.forEach((ev) => { if (!validIso(ev.date)) bad(`evento con data non valida ${ev.date}`); });
    if (idx % 25 === 0 && plan.episodes.length) {
      store.wipeAll();
      store.load();
      const r = store.addImportedEpisodes({ ...plan, imp: '' });
      if (r.added > plan.episodes.length) bad('aggiunti piu\' attacchi di quelli preparati');
      store.removeImportedBatch(r.imp);
    }
  } catch (e) {
    bad(`ECCEZIONE nell'anteprima/importazione: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
  }
  return errs;
}

const fixed = [
  '', ' ', '\n\n\n', '12.03', '12.03\n', '\u0000\u0000', 'a'.repeat(100000), `12.03 ${'forte, '.repeat(8000)}`, '1.1.1 '.repeat(5000),
  Array.from({ length: 20000 }, (_, i) => `${1 + (i % 28)}.${1 + (i % 12)}.${2000 + (i % 25)} forte`).join('\n'),
  `2025\n${'(['.repeat(20000)}\n3.3 forte`, '\ud83e\udd15'.repeat(20000), `31.4 ${'x'.repeat(30000)}`,
];
let total = 0;
let fail = 0;
const run = (text, label) => {
  total += 1;
  const errs = check(text, total);
  if (!errs.length) return;
  fail += 1;
  console.log(`FAIL ${label}`);
  errs.slice(0, 6).forEach((e) => console.log(`     ${e}`));
  if (fail <= 3) console.log(`     testo (primi 600 caratteri): ${JSON.stringify(text.slice(0, 600))}`);
};
fixed.forEach((t, i) => run(t, `fisso #${i}`));
for (let i = 0; i < COUNT; i += 1) run(noteText(), `nota #${i} (seme ${SEED})`);
console.log(`${total - fail}/${total} note superate (seme ${SEED})`);
if (STATS) console.log(JSON.stringify(stat));
process.exit(fail ? 1 : 0);
