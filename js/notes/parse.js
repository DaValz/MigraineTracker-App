/* i18n-ignore-file */
/* Lettore di note: trasforma il testo libero di un diario (Note di iPhone, PDF, Word, appunti...) in una lista di attacchi.
 *
 * Funziona a regole, tutto sul dispositivo e senza rete: nessuna intelligenza artificiale e nessun invio di dati.
 * Il risultato e' sempre una proposta: l'utente la controlla nell'anteprima prima di importare.
 *
 *   parseNotes(testo, { today, order, baseYear }) -> { entries, meta }
 *
 * Fasi:
 *  1. righe -> voci: ogni riga che inizia con una data apre una voce; le righe successive senza data la completano; titoli di anno
 *     ("2025") e di mese ("Giugno", "Primi di ottobre") danno il contesto alle date che non lo indicano.
 *  2. date -> giorni reali: ordine giorno/mese o mese/giorno dedotto dai dati, anno dedotto da titoli, date esplicite e dall'ordine.
 *  3. testo -> dettagli: intensita', lato, zone, sintomi, fattori, farmaci (con effetto e dose)...
 */
import { LEX } from './lexicon.js';
import {
  fold, findAll, hasMatch, resolveOverlaps, editDistance, validYMD, isoDate, daysInMonth,
} from './util.js';

/* ---------------------------------------------------------------- 1. righe */

const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff\u00ad]/g;
const PICTO = /[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/gu;
// Oltre questa lunghezza il testo di una singola voce non viene analizzato (resta intero nella nota).
const MAX_ENTRY_CHARS = 6000;

/** Pulisce il testo e lo divide in righe: { n, orig, f } (f = versione "piegata", stessa lunghezza di orig). */
export function prepareLines(text) {
  const raw = String(text == null ? '' : text)
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029\f\v]/g, '\n');
  return raw.split('\n').map((line, i) => {
    const orig = line
      .replace(ZERO_WIDTH, '')
      .replace(PICTO, ' ')
      .replace(/(\d)\s*[\u2026\u2025]\s*(?=\d)/g, '$1.')
      .replace(/[ ]*\t[ ]*/g, ' | ')
      .replace(/[\u00a0\u2007\u202f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { n: i + 1, orig, f: fold(orig) };
  });
}

/** Toglie punti elenco, simboli e decorazioni all'inizio della riga (ma non le parentesi, che possono aprire una data). */
function stripLead(orig, f) {
  const m = /^[^\p{L}\p{N}([]+/u.exec(orig);
  const k = m ? m[0].length : 0;
  return { orig: orig.slice(k), f: f.slice(k), lead: k };
}

const AND_SRC = '(?:e|ed|y|et|und|en|si|and|i)';
const OPEN = '[(\\[]?';
const WD_OPT = `(?:(?:${LEX.weekdaySrc})\\.?,?\\s*)?`;
const FROM_OPT = `(?:(?:${LEX.rangeFromSrc}|${LEX.datePrefixSrc})\\s+)?`;
const ORD = '(?:ste|st|nd|rd|th|er|de|e|\\u00b0|\\u00ba|\\u00aa)?';
// "t/m" (olandese: "tot en met") non puo' stare in un termine del dizionario perche' contiene "/".
const RANGE_TO = `(?:t\\/m|t\\.m\\.?|${LEX.rangeToSrc})`;
const MON = `(${LEX.monthSrc})\\.?(?![a-z])`;
const GL_OPT = `(?:(?:${LEX.glueSrc})\\s*)?`;

const R_ISO = new RegExp(`^${OPEN}${WD_OPT}(\\d{4})\\s*[-./]\\s*(\\d{1,2})\\s*[-./]\\s*(\\d{1,2})(?!\\d)`);
const R_SHARED = new RegExp(`^${OPEN}${WD_OPT}${FROM_OPT}(\\d{1,2})(\\s*(?:\\.?\\s*-|&|,|/)\\s*|\\s+${AND_SRC}\\s+|\\s+${RANGE_TO}\\s+)(\\d{1,2})([./-])(\\d{1,2})(?:[./-]{1,2}(\\d{4}|\\d{2})(?!\\d|:\\d|\\.\\d))?(?![\\d])`);
const R_NUM = new RegExp(`^${OPEN}${WD_OPT}${FROM_OPT}(\\d{1,2})([./-]{1,2})(\\d{1,2})(?:[./-]{1,2}(\\d{4}|\\d{2})(?!\\d|:\\d|\\.\\d))?(?![\\d])`);
const R_TEXT1 = new RegExp(`^${OPEN}${WD_OPT}${FROM_OPT}(\\d{1,2})\\.?${ORD}(?:\\s*(?:-|${RANGE_TO})\\s*(\\d{1,2})\\.?${ORD})?(?:\\s*[-/]\\s*|\\s*)${GL_OPT}${MON}(?:[,\\s-]+${GL_OPT}(\\d{4})(?!\\d))?`);
const R_TEXT2 = new RegExp(`^${OPEN}${WD_OPT}${MON}\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*(?:-|${RANGE_TO})\\s*(\\d{1,2})(?:st|nd|rd|th)?)?(?:,?\\s*(\\d{4}))?(?!\\d|:\\d|\\.\\d)`);
const R_DAYONLY = new RegExp(`^${OPEN}${WD_OPT}(\\d{1,2})${ORD}(?:\\s*[:.)\\-]\\s*|\\s+)(?=\\S)`);
const R_TAIL = new RegExp(`^(\\.?\\s*(?:-|${RANGE_TO})\\s*|\\.?\\s*(?:,|&|\\+)\\s*|\\.?\\s+${AND_SRC}\\s+)(\\d{1,2})([./-]{1,2})(\\d{1,2})(?:[./-]{1,2}(\\d{4}|\\d{2})(?!\\d|:\\d|\\.\\d))?(?![\\d])`);
// "ore 14:30" e' un orario, non una durata: solo "ore" senza numero dopo e' un'unita' di misura.
const R_UNIT_AFTER_DAY = /^\s*(?:mg|mcg|ml|g\b|(?:ore|ora|h|uhr|uur|uren|heures?|horas?|hours?)\b(?!\s*\d)|hrs?\b|giorn|volte|x\b|min|compress|cpr|gocc|%)/;

const fullYear = (s) => {
  if (s == null) return null;
  const n = Number(s);
  if (s.length === 2) return n <= 40 ? 2000 + n : 1900 + n;
  return n;
};
/* "2.5 mg", "1/2 compressa", "10.30 h": numeri a inizio riga che non sono date. */
const R_UNIT_AFTER_NUM = /^\s*(?:mg|mcg|ml|gr?\b|kg|gocc|gtt|compress|cpr|volte|(?:ore|ora|h)\b(?!\s*\d)|hr|%|\u00b0|bpm|mmhg|euro|\u20ac|\$)/;
const startsWithMed = (text) => LEX.meds.some((med) => findAll(med.re, text.slice(0, 24)).some((x) => x.start === 0));
const mapMonth = (t) => LEX.monthMap.get(t.replace(/\.$/, ''));
const plausibleDM = (a, b) => (a >= 1 && a <= 31 && b >= 1 && b <= 12) || (a >= 1 && a <= 12 && b >= 1 && b <= 31);

/**
 * Cerca una data all'inizio della riga (gia' "piegata").
 * Restituisce { type: 'single'|'range'|'list', toks, len, dayOnly } oppure null.
 * Un token e' { kind: 'dm', a, b, y } (numerico: giorno e mese ancora da distinguere) oppure { kind: 'dmy', d, m, y }.
 */
export function matchDate(f, { monthCtx = false } = {}) {
  let m = R_ISO.exec(f);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31) {
    return { type: 'single', toks: [{ kind: 'dmy', d: Number(m[3]), m: Number(m[2]), y: Number(m[1]) }], len: m[0].length };
  }
  m = R_SHARED.exec(f);
  if (m) {
    const d1 = Number(m[1]);
    const d2 = Number(m[3]);
    const mo = Number(m[5]);
    const s1 = m[2].trim();
    const sameSep = s1 === m[4];
    if (!sameSep && d1 < d2 && d2 <= 31 && d2 - d1 <= 20 && mo >= 1 && mo <= 12) {
      const y = fullYear(m[6]);
      return { type: 'range', toks: [{ kind: 'dmy', d: d1, m: mo, y }, { kind: 'dmy', d: d2, m: mo, y }], len: m[0].length };
    }
  }
  m = R_NUM.exec(f);
  if (m && !R_UNIT_AFTER_NUM.test(f.slice(m[0].length))) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    if (plausibleDM(a, b)) {
      const first = { kind: 'dm', a, b, y: fullYear(m[4]) };
      let len = m[0].length;
      const toks = [first];
      let type = 'single';
      for (let guard = 0; guard < 6; guard += 1) {
        const t = R_TAIL.exec(f.slice(len));
        if (!t) break;
        const a2 = Number(t[2]);
        const b2 = Number(t[4]);
        if (!plausibleDM(a2, b2)) break;
        const sep = t[1].trim().replace(/^\./, '').trim();
        const isRange = sep === '-' || new RegExp(`^${RANGE_TO}$`).test(sep);
        if (isRange && type === 'list') break;
        if (isRange && toks.length > 1) break;
        toks.push({ kind: 'dm', a: a2, b: b2, y: fullYear(t[5]) });
        type = isRange ? 'range' : 'list';
        len += t[0].length;
        if (isRange) break;
      }
      return { type, toks, len };
    }
  }
  m = R_TEXT1.exec(f);
  if (m) {
    const d1 = Number(m[1]);
    const d2 = m[2] != null ? Number(m[2]) : null;
    const mo = mapMonth(m[3]);
    if (mo && d1 >= 1 && d1 <= 31 && (d2 == null || (d2 > d1 && d2 <= 31))) {
      const y = m[4] != null ? Number(m[4]) : null;
      const toks = [{ kind: 'dmy', d: d1, m: mo, y }];
      if (d2 != null) toks.push({ kind: 'dmy', d: d2, m: mo, y });
      return { type: d2 != null ? 'range' : 'single', toks, len: m[0].length };
    }
  }
  m = R_TEXT2.exec(f);
  if (m && !R_UNIT_AFTER_DAY.test(f.slice(m[0].length))) {
    const mo = mapMonth(m[1]);
    const d1 = Number(m[2]);
    const d2 = m[3] != null ? Number(m[3]) : null;
    if (mo && d1 >= 1 && d1 <= 31 && (d2 == null || (d2 > d1 && d2 <= 31))) {
      const y = m[4] != null ? Number(m[4]) : null;
      const toks = [{ kind: 'dmy', d: d1, m: mo, y }];
      if (d2 != null) toks.push({ kind: 'dmy', d: d2, m: mo, y });
      return { type: d2 != null ? 'range' : 'single', toks, len: m[0].length };
    }
  }
  if (monthCtx) {
    m = R_DAYONLY.exec(f);
    if (m && !R_UNIT_AFTER_DAY.test(f.slice(m[0].length)) && !startsWithMed(f.slice(m[0].length))) {
      const d = Number(m[1]);
      if (d >= 1 && d <= 31) return { type: 'single', toks: [{ kind: 'dmy', d, m: null, y: null }], len: m[0].length, dayOnly: true };
    }
  }
  return null;
}

const R_YEAR_HDR = new RegExp(`^(?:${LEX.yearWordSrc}\\s*[:.]?\\s*)?((?:19|20)\\d{2})\\s*[:.\\-]*\\s*(?:\\([^)]*\\))?\\s*$`);
const R_MONTH_HDR = new RegExp(`^(?:(?:${LEX.monthPrefixSrc})\\s*(?:(?:${LEX.glueSrc})\\s*)?)*${MON}(?:\\s*(?:(?:${LEX.glueSrc})\\s*)?((?:19|20)\\d{2}))?\\s*(?:[:.\\-]+\\s*)?(?:\\([^)]*\\))?\\s*$`);
const R_FOOTER = /^(?:(?:pag(?:ina|\.)?|page|seite|pagina|strana)\s*\d+(?:\s*(?:\/|di|of|de|von|din|van|sur)\s*\d+)?|-\s*\d+\s*-|(?:esportat|stampat|printed|exported|generated|generat|creat[oa]\s+il|sent from|inviato da)\b.*)$/;
const R_SPLIT = /(?:;|\s{2,}|\.\s+)(?=\s*(?:\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?(?!\d|:\d)|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]{3,}\b))/;

function inlineSplit(orig, f) {
  const out = [];
  let from = 0;
  const re = new RegExp(R_SPLIT.source, 'g');
  let m = re.exec(f);
  while (m) {
    let cut = m.index + m[0].length;
    while (cut < f.length && f[cut] === ' ') cut += 1;
    if (cut > from && cut < f.length) {
      const piece = matchDate(f.slice(cut));
      if (piece) {
        out.push([from, m.index]);
        from = cut;
      }
    }
    if (m.index === re.lastIndex) re.lastIndex += 1;
    m = re.exec(f);
  }
  out.push([from, f.length]);
  return out.map(([a, b]) => ({ orig: orig.slice(a, b).trim(), f: f.slice(a, b).trim() }));
}

// Si taglia in base alla versione "piegata" (dove i trattini lunghi diventano '-') e si applica lo stesso taglio all'originale.
function cleanRestPair(orig, f) {
  const m = /^[\s:;,.\-)\]*_>=|]+/.exec(f);
  const k = m ? m[0].length : 0;
  return { orig: orig.slice(k).replace(/\s+$/, ''), f: f.slice(k).replace(/\s+$/, '') };
}

/** Prima fase: righe -> sequenza di eventi (anno, mese, voce). */
const RATIO_TEN = /^[(\[]?(\d{1,2})\/10(?![\d/.-]\d)/;

function dominantSeparator(lines) {
  const count = { '.': 0, '/': 0, '-': 0 };
  lines.forEach((ln) => {
    if (!ln.orig) return;
    const { f } = stripLead(ln.orig, ln.f);
    if (RATIO_TEN.test(f)) return;
    const m = R_NUM.exec(f);
    if (m && plausibleDM(Number(m[1]), Number(m[3])) && count[m[2][0]] != null) count[m[2][0]] += 1;
  });
  const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : null;
}

function segment(lines) {
  const items = [];
  const preamble = [];
  const domSep = dominantSeparator(lines);
  let cur = null;
  let blankSince = true;
  let monthCtx = null;
  let lastDay = 0;
  let ctxId = 0;
  let yearCtx = null;

  const pushEntry = (e) => {
    e.t = 'entry';
    cur = e;
    items.push(e);
  };

  const handle = (line) => {
    let { orig, f } = line;
    if (!orig) {
      blankSince = true;
      return;
    }
    const lead = stripLead(orig, f);
    const hasBody = /[\p{L}\p{N}]/u.test(lead.orig);
    if (!hasBody) return;
    orig = lead.orig;
    f = lead.f;
    if (R_FOOTER.test(f)) {
      blankSince = false;
      return;
    }
    const yh = R_YEAR_HDR.exec(f);
    if (yh) {
      yearCtx = Number(yh[1]);
      items.push({ t: 'year', y: yearCtx, line: line.n });
      monthCtx = null;
      lastDay = 0;
      ctxId += 1;
      cur = null;
      blankSince = false;
      return;
    }
    const mh = R_MONTH_HDR.exec(f);
    if (mh) {
      monthCtx = mapMonth(mh[1]);
      lastDay = 0;
      if (mh[2]) {
        yearCtx = Number(mh[2]);
        items.push({ t: 'year', y: yearCtx, line: line.n });
        ctxId += 1;
      }
      items.push({ t: 'month', m: monthCtx, line: line.n });
      cur = null;
      blankSince = false;
      return;
    }
    let dm = matchDate(f, { monthCtx: monthCtx != null });
    let off = 0;
    if (!dm) {
      const lm = /^\d{1,3}[.)]\s+/.exec(f);
      if (lm) {
        dm = matchDate(f.slice(lm[0].length), { monthCtx: monthCtx != null });
        off = lm[0].length;
      }
    }
    if (dm && dm.dayOnly) {
      const d = dm.toks[0].d;
      if (d < lastDay) dm = null;
    }
    // "9/10" a capo riga e' una valutazione ("9 su 10"), non il 9 ottobre, quando le altre date del diario usano un altro separatore.
    if (dm && off === 0) {
      const rt = RATIO_TEN.exec(f);
      if (rt && Number(rt[1]) <= 10 && domSep && domSep !== '/') dm = null;
    }
    if (dm) {
      const len = off + dm.len;
      if (dm.dayOnly) lastDay = dm.toks[0].d;
      const cleaned = cleanRestPair(orig.slice(len), f.slice(len));
      const parts = inlineSplit(cleaned.orig, cleaned.f);
      const first = parts[0];
      pushEntry({
        line: line.n, type: dm.type, toks: dm.toks, dayOnly: !!dm.dayOnly, monthCtx, yearCtx, ctxId, text: first.orig,
      });
      blankSince = false;
      for (let i = 1; i < parts.length; i += 1) {
        const sub = parts[i];
        const d2 = matchDate(sub.f, { monthCtx: monthCtx != null });
        if (d2) {
          pushEntry({
            line: line.n, type: d2.type, toks: d2.toks, dayOnly: !!d2.dayOnly, monthCtx, yearCtx, ctxId, text: cleanRestPair(sub.orig.slice(d2.len), sub.f.slice(d2.len)).orig,
          });
        }
      }
      return;
    }
    if (cur && (!blankSince || !cur.text)) {
      // "visita dal neurologo il 15.03": una riga di appuntamenti, non il seguito del mal di testa precedente.
      if (hasMatch(LEX.other, f) && analyzeText(orig).kind === 'other') {
        preamble.push({ line: line.n, text: orig });
        blankSince = false;
        return;
      }
      cur.text = cur.text ? `${cur.text} ${orig}` : orig;
      blankSince = false;
      return;
    }
    preamble.push({ line: line.n, text: orig });
    blankSince = false;
  };

  lines.forEach(handle);
  return { items, preamble };
}

/* ---------------------------------------------------------------- 2. date */

const KEY = (m, d) => m * 31 + d;
const WRAP = 93;

function detectOrder(entries, opts) {
  let evD = 0;
  let evM = 0;
  let ambiguous = 0;
  entries.forEach((e) => e.toks.forEach((t) => {
    if (t.kind !== 'dm') return;
    if (t.a > 12 && t.b <= 12) evD += 1;
    else if (t.b > 12 && t.a <= 12) evM += 1;
    else if (t.a <= 12 && t.b <= 12 && t.a !== t.b) ambiguous += 1;
  }));
  if (opts.order === 'dmy' || opts.order === 'mdy') return { order: opts.order, certain: true, ambiguous, forced: true };
  if (evD > 0 && evM === 0) return { order: 'dmy', certain: true, ambiguous };
  if (evM > 0 && evD === 0) return { order: 'mdy', certain: true, ambiguous };
  if (evD > 0 && evM > 0) return { order: evD >= evM ? 'dmy' : 'mdy', certain: false, ambiguous, mixed: true };
  return { order: opts.hintOrder === 'mdy' ? 'mdy' : 'dmy', certain: ambiguous === 0, ambiguous };
}

const mostRecentPast = (m, d, today) => {
  const [ty, tm, td] = today.split('-').map(Number);
  let y = KEY(m, d) > KEY(tm, td) ? ty - 1 : ty;
  for (let i = 0; i < 8 && !validYMD(y, m, d); i += 1) y -= 1;
  return y;
};

function assignYears(list, { today, baseYear }) {
  if (!list.length) return { dir: 'asc', inferred: false };
  let inc = 0;
  let dec = 0;
  for (let i = 1; i < list.length; i += 1) {
    const a = list[i - 1];
    const b = list[i];
    if (a.ctxId !== b.ctxId) continue;
    const dk = KEY(b.m, b.d) - KEY(a.m, a.d);
    if (Math.abs(dk) > WRAP) continue;
    if (dk > 0) inc += 1;
    else if (dk < 0) dec += 1;
  }
  const dir = dec > inc ? 'desc' : 'asc';

  let y = null;
  let prev = null;
  let lastHdr = null;
  list.forEach((e) => {
    const hdrChanged = e.yHdr != null && e.yHdr !== lastHdr;
    if (e.yHdr != null) lastHdr = e.yHdr;
    if (hdrChanged) y = e.yHdr;
    if (e.yExp != null) {
      e.year = e.yExp;
      e.src = 'explicit';
      if (e.yHdr == null) y = e.yExp;
      prev = e;
      return;
    }
    if (e.yHdr != null && (hdrChanged || y == null)) {
      y = e.yHdr;
      e.year = y;
      e.src = 'header';
      prev = e;
      return;
    }
    if (y != null) {
      if (prev) {
        const dk = KEY(e.m, e.d) - KEY(prev.m, prev.d);
        if (dir === 'asc' && dk < -WRAP && (e.yHdr == null || (prev.m >= 10 && e.m <= 3))) y += 1;
        else if (dir === 'desc' && dk > WRAP && (e.yHdr == null || (prev.m <= 3 && e.m >= 10))) y -= 1;
      }
      e.year = y;
      e.src = e.yHdr != null ? 'header' : 'carried';
      prev = e;
    }
  });

  const firstKnown = list.findIndex((e) => e.year != null);
  const pending = list.filter((e) => e.year == null);
  if (!pending.length) return { dir, inferred: false };

  if (firstKnown > 0) {
    for (let j = firstKnown - 1; j >= 0; j -= 1) {
      const e = list[j];
      const nx = list[j + 1];
      let yy = nx.year;
      const dk = KEY(e.m, e.d) - KEY(nx.m, nx.d);
      if (dir === 'asc' && dk > WRAP) yy -= 1;
      else if (dir === 'desc' && dk < -WRAP) yy += 1;
      e.year = yy;
      e.src = 'inferred';
    }
    return { dir, inferred: true };
  }

  const rel = new Array(list.length).fill(0);
  if (dir === 'asc') {
    for (let j = list.length - 2; j >= 0; j -= 1) {
      rel[j] = rel[j + 1] + (KEY(list[j].m, list[j].d) - KEY(list[j + 1].m, list[j + 1].d) > WRAP ? 1 : 0);
    }
  } else {
    for (let j = 1; j < list.length; j += 1) {
      rel[j] = rel[j - 1] + (KEY(list[j].m, list[j].d) - KEY(list[j - 1].m, list[j - 1].d) < -WRAP ? 1 : 0);
    }
  }
  const maxRel = Math.max(...rel);
  const latest = dir === 'asc' ? list[list.length - 1] : list[0];
  const yLatest = baseYear != null ? baseYear + maxRel : mostRecentPast(latest.m, latest.d, today);
  list.forEach((e, i) => {
    e.year = yLatest - rel[i];
    e.src = 'inferred';
  });
  return { dir, inferred: true };
}

/** Voci "grezze" (con date da risolvere) -> voci con giorno reale. */
function resolveDates(items, opts) {
  const raws = items.filter((i) => i.t === 'entry');
  const det = detectOrder(raws, opts);
  const order = det.order;

  const events = [];
  let hdrYear = null;
  items.forEach((it) => {
    if (it.t === 'year') hdrYear = it.y;
    else if (it.t === 'entry') events.push({ raw: it, yHdr: hdrYear });
  });

  const list = [];
  events.forEach(({ raw, yHdr }) => {
    const toDM = (t) => {
      if (t.kind === 'dmy') return { d: t.d, m: t.m != null ? t.m : raw.monthCtx, y: t.y };
      return order === 'dmy' ? { d: t.a, m: t.b, y: t.y } : { d: t.b, m: t.a, y: t.y };
    };
    const t0 = toDM(raw.toks[0]);
    const base = {
      raw, text: raw.text, line: raw.line, ctxId: raw.ctxId, d: t0.d, m: t0.m, yExp: t0.y, yHdr,
    };
    if (raw.type === 'list') {
      raw.toks.forEach((t, i) => {
        const x = toDM(t);
        list.push({
          ...base, d: x.d, m: x.m, yExp: x.y, multi: true, end: null, listIndex: i,
        });
      });
    } else if (raw.type === 'range') {
      const t1 = toDM(raw.toks[1]);
      list.push({ ...base, end: { d: t1.d, m: t1.m, y: t1.y } });
    } else {
      list.push({ ...base, end: null });
    }
  });

  const valid = list.filter((e) => e.m >= 1 && e.m <= 12 && e.d >= 1 && e.d <= 31);
  const dirInfo = assignYears(valid, opts);
  const out = list.map((e) => {
    const ok = e.year != null && validYMD(e.year, e.m, e.d);
    let endDate = null;
    let problem = null;
    if (!ok) problem = 'invalidDate';
    if (ok && e.end && e.end.m >= 1 && e.end.m <= 12) {
      let y2 = e.end.y != null ? e.end.y : e.year;
      if (e.end.y == null && KEY(e.end.m, e.end.d) < KEY(e.m, e.d)) y2 = e.year + 1;
      if (validYMD(y2, e.end.m, e.end.d)) {
        const cand = isoDate(y2, e.end.m, e.end.d);
        const start = isoDate(e.year, e.m, e.d);
        if (cand > start) endDate = cand;
        else if (cand < start) problem = 'badRange';
      } else problem = 'badRange';
    } else if (ok && e.end) problem = 'badRange';
    return {
      ...e,
      date: ok ? isoDate(e.year, e.m, e.d) : null,
      endDate,
      yearSrc: ok ? e.src || 'inferred' : null,
      problem,
    };
  });
  return {
    entries: out, order, orderCertain: det.certain, ambiguous: det.ambiguous, mixed: !!det.mixed, dir: dirInfo.dir, inferred: !!dirInfo.inferred,
  };
}

/* ---------------------------------------------------------------- 3. dettagli */

const LIMB = /(?:^|[^a-z])(?:braccio|braccia|mano|mani|gamba|gambe|dito|dita|piede|piedi|arm|arms|hand|hands|leg|legs|finger|fingers|foot|feet|brazo|pierna|dedo|pie|bras|main|jambe|doigt|pied|bein|beine|fuss|finger|braco|perna|mao|picior|brat|mana|deget|been|vinger|voet)(?![a-z])/;
const CLAUSE_WORD_SRC = '(?:^|[^a-z])(?:poi|ma|pero|quindi|then|but|luego|entonces|puis|mais|alors|dann|aber|depois|mas|entao|apoi|dar|dan|maar|dus)(?![a-z])';
const CLAUSE_BREAK = new RegExp(`[(),;:!?]|\\.(?!\\d)|\\s-\\s|${CLAUSE_WORD_SRC}`, 'g');
const CLAUSE_WORDS = new RegExp(CLAUSE_WORD_SRC);
const UNIT_WORDS = '(?:compress\\w*|cpr|dosi|dose|doses|dosis|dosen|pastigli\\w*|pastill\\w*|pastilh\\w*|pill\\w*|pil|pilul\\w*|pildor\\w*|tablet\\w*|tab|tabs|comprim\\w*|bustin\\w*|capsul\\w*|gelul\\w*|cachet\\w*|gragea\\w*|drage\\w*|kapsel\\w*|tabletten|tablette|pilule\\w*|comprimat\\w*|pastila|pastile|tablete|pillen|pille|zetpil\\w*|zakje\\w*|druppel\\w*|ampul\\w*)';
const CONN = '(?:(?:di|de|of|van|von|din)\\s+|d\'\\s*|dell\'\\s*)';
const NUMWORD_RES = [1, 2, 3, 4].map((v) => {
  const n = LEX.numWord.find((x) => x.v === v);
  return { v, re: new RegExp(`(?:^|[^a-z])${n.src}\\s*(?:${UNIT_WORDS}\\s*${CONN}?)?$`) };
});
const COUNT_BEFORE = new RegExp(`(?:^|[^\\d.,/:])(\\d)\\s*(?:x\\s*)?(?:${UNIT_WORDS}\\s*${CONN}?)?$`);

function clausesOf(f) {
  const out = [];
  let s = 0;
  const re = new RegExp(CLAUSE_BREAK.source, 'g');
  let m = re.exec(f);
  while (m) {
    if (m.index > s) out.push([s, m.index]);
    s = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex += 1;
    m = re.exec(f);
  }
  if (s < f.length) out.push([s, f.length]);
  return out.length ? out : [[0, f.length]];
}

const inClause = (clauses, pos) => clauses.find(([a, b]) => pos >= a && pos <= b) || [0, 0];

function sentencesOf(f) {
  const out = [];
  let s = 0;
  const re = /;|\.(?!\d)/g;
  let m = re.exec(f);
  while (m) {
    if (m.index > s) out.push([s, m.index]);
    s = m.index + 1;
    m = re.exec(f);
  }
  if (s < f.length) out.push([s, f.length]);
  return out.length ? out : [[0, f.length]];
}

function negatedAt(f, start, clauseStart) {
  const before = f.slice(Math.max(clauseStart, start - 28), start);
  if (!before) return false;
  const ms = findAll(LEX.negator, before);
  if (!ms.length) return false;
  const last = ms[ms.length - 1];
  const between = before.slice(last.end).trim();
  return between === '' || between.split(/\s+/).length <= 2;
}

const round1 = (s) => Number(String(s).replace(',', '.'));

const NUM = '(\\d{1,2}(?:[.,]\\d)?)';
const NOT_UNIT = '(?!\\s*(?:ore\\b|ora\\b|h\\b|hrs?\\b|hours?\\b|giorn|days?\\b|volte|x\\b|mg|ml|min|compress|cpr|gocc|settiman|mes[ei]\\b|anni|ans\\b|jours|stunden|tage|dias|horas|heures|uren|dagen|zile|ori\\b|vezes|veces|fois|keer|maal|mal\\b|semana|semaine|wochen|weken|saptam|meses|mois|monate|maanden|luni\\b|anos|jahre|jaar|ani\\b|pastill|pastilh|comprim|cachet|pill|tablet|capsul|gragea|sachet|kapsel|gotas|gouttes|tropfen|druppel|picaturi))(?![\\d:./])';
const RE_INT_A = new RegExp(`(?:^|[^\\d.,/:])${NUM}\\s*(?:/|${LEX.outOfSrc})\\s*10(?!\\d)`, 'g');
const RE_INT_B = new RegExp(`(?:^|[^a-z])${LEX.intensityKeywordSrc}\\s*(?:(?:di|of|de|von|van|din)\\s+)?[:=]?\\s*(?:(?:a|at|auf|op|la)\\s+)?${NUM}(?:\\s*[-/]\\s*${NUM})?${NOT_UNIT}`, 'g');
const RE_INT_C = new RegExp(`(?:^|[^\\d.,/:])${NUM}\\s+(?:di|of|de|von|din|van)\\s+${LEX.intensityKeywordSrc}`, 'g');
const RE_INT_D = new RegExp(`${LEX.intensityKeywordSrc}[^()]{0,60}\\(\\s*${NUM}(?:\\s*[-/]\\s*${NUM})?\\s*\\)`, 'g');
/* "il 3/10", "dal 5/10": una data a meta' frase, non un voto. */
const DATE_PREP = /(?:^|[^a-z])(?:il|del|dal|al|on|the|am|le|el|em|op|vom|bis|until|from|since|giorno|day|den|der)\s*$/;

const RE_INT_COL = /^\s*(10|[1-9])\s*(?:\||$)/;
// Dopo la data, una riga fatta solo di queste parole dice che quel giorno non c'e' stato nulla.
const FREE_ONLY = /^(?:niente|nulla|nessuno|nessun problema|ok|okay|va bene|tutto a posto|a posto|nothing|none|fine|all good|nada|sin novedad|rien|rien a signaler|nichts|nimic|niets|geen|nenhum|sem problemas|sin problemas|pas de probleme|kein problem|fara probleme|geen probleem)$/;

function findIntensity(f) {
  const found = [];
  const push = (a, b) => {
    const x = round1(a);
    const y = b != null ? round1(b) : x;
    const v = Math.round((x + y) / 2);
    if (x >= 1 && x <= 10 && y >= 1 && y <= 10) found.push(Math.min(10, Math.max(1, v)));
  };
  const run = (re, fn) => {
    re.lastIndex = 0;
    let m = re.exec(f);
    while (m) {
      fn(m);
      if (m.index === re.lastIndex) re.lastIndex += 1;
      m = re.exec(f);
    }
  };
  // Colonne di un foglio di calcolo ("12/03  8  sinistra  oki"): un numero da solo e' il voto.
  const col = RE_INT_COL.exec(f);
  if (col) push(col[1], null);
  run(RE_INT_A, (m) => {
    const numAt = m.index + m[0].indexOf(m[1]);
    if (!DATE_PREP.test(f.slice(Math.max(0, numAt - 14), numAt))) push(m[1], null);
  });
  run(RE_INT_B, (m) => push(m[1], m[2] === '10' && /\/\s*10(?!\d)/.test(m[0]) ? null : m[2]));
  run(RE_INT_C, (m) => push(m[1], null));
  run(RE_INT_D, (m) => push(m[1], m[2] === '10' && /\/\s*10(?!\d)/.test(m[0]) ? null : m[2]));
  return found.length ? Math.max(...found) : null;
}

/* Le espressioni di intensita' si risolvono cosi': se una e' contenuta in un'altra vince la piu' lunga ("non troppo forte" batte "forte");
 * se si sovrappongono solo in parte vince quella che inizia prima ("sehr starke Schmerzen": "sehr starke" = 8 batte "starke Schmerzen" = 7). */
function resolveSeverityOverlaps(list) {
  const len = (a) => a.end - a.start;
  const inside = (a, b) => a.start >= b.start && a.end <= b.end;
  const base = list.filter((a, i) => !list.some((b, j) => j !== i && inside(a, b) && (len(b) > len(a) || (len(b) === len(a) && j < i))));
  base.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  base.forEach((m) => {
    if (!out.length || m.start >= out[out.length - 1].end) out.push(m);
  });
  return out;
}

function verbalIntensity(f, clauses) {
  const matches = [];
  LEX.severity.forEach(({ v, re }) => findAll(re, f).forEach((x) => matches.push({ ...x, v })));
  const kept = resolveSeverityOverlaps(matches).filter((x) => !negatedAt(f, x.start, inClause(clauses, x.start)[0]));
  if (!kept.length) return null;
  let v = Math.max(...kept.map((x) => x.v));
  if (hasMatch(LEX.worse, f) && v <= 4) v += 2;
  return v;
}

const DOSE_AFTER = /^\s*\)?\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(mg|mcg|ug|g|ml|gocce|gtt|cpr|compresse|bustine|%)?(?![\d/.,]\d)(?![a-z])/;
const COUNT_AFTER = /^\s*\)?\s*[x\u00d7]\s*(\d)(?!\d)/;
// Dose e orari ("paracetamolo 1000 preso, dopo 2 ore passato") non contano come parole di distanza.
const wordCount = (s) => s.trim().split(/\s+/).filter((w) => /[a-z]/.test(w)).length;

function numWordCount(before) {
  for (const { v, re } of NUMWORD_RES) {
    if (re.test(before)) return v;
  }
  return 0;
}

/* Un'indicazione come "non ha fatto effetto" riguarda il farmaco citato subito prima (o, se manca, subito dopo): stessa frase,
 * poche parole di distanza, nessun punto in mezzo. Parentesi e virgole non interrompono ("targin (non passa)"). */
function bindEffects(f, meds) {
  const cues = [];
  [['none', 0], ['partial', 1], ['good', 2], ['resolved', 3]].forEach(([k, v]) => findAll(LEX.effect[k], f).forEach((x) => cues.push({ ...x, v })));
  const near = (gap, maxWords) => !/[.;!?]/.test(gap) && wordCount(gap) <= maxWords && !CLAUSE_WORDS.test(gap);
  resolveOverlaps(cues).forEach((cue) => {
    const prevMed = [...meds].reverse().find((m) => m.end <= cue.start);
    if (prevMed && prevMed.effect == null && near(f.slice(prevMed.end, cue.start).replace(/[(),:]/g, ' '), 4)) {
      prevMed.effect = cue.v;
      return;
    }
    const nextMed = meds.find((m) => m.start >= cue.end);
    if (nextMed && nextMed.effect == null && near(f.slice(cue.end, nextMed.start).replace(/[,:]/g, ' '), 3)) nextMed.effect = cue.v;
  });
}

function findMeds(f, orig) {
  const hits = [];
  LEX.meds.forEach((med, mi) => findAll(med.re, f).forEach((x) => hits.push({ ...x, mi })));
  const wre = /[a-z]{7,}/g;
  let wm = wre.exec(f);
  while (wm) {
    const wd = { w: wm[0], start: wm.index, end: wm.index + wm[0].length };
    wm = wre.exec(f);
    if (hits.some((h) => wd.start < h.end && h.start < wd.end)) continue;
    const max = wd.w.length >= 10 ? 2 : 1;
    let best = null;
    for (const [term, mi] of LEX.fuzzyMeds) {
      if (term[0] !== wd.w[0] || Math.abs(term.length - wd.w.length) > max) continue;
      const d = editDistance(wd.w, term, max);
      if (d <= max && (!best || d < best.d)) best = { d, mi };
    }
    if (best) hits.push({ start: wd.start, end: wd.end, mi: best.mi });
  }
  const meds = resolveOverlaps(hits).map((h) => {
    const med = LEX.meds[h.mi];
    const before = f.slice(Math.max(0, h.start - 24), h.start);
    const after = f.slice(h.end, h.end + 24);
    let count = 1;
    const mb = COUNT_BEFORE.exec(before);
    if (mb) count = Number(mb[1]);
    else {
      const nw = numWordCount(before);
      if (nw) count = nw;
    }
    const ma = COUNT_AFTER.exec(after);
    if (ma) count = Number(ma[1]);
    let dose = '';
    const md = DOSE_AFTER.exec(after);
    if (md && !ma) {
      const unit = md[2];
      if (unit) dose = `${md[1]} ${unit}`;
      else if (/^\d{2,4}$/.test(md[1]) && Number(md[1]) >= 5) dose = `${md[1]} mg`;
    }
    return {
      name: med.name, cls: med.cls, generic: med.generic, count: Math.min(4, Math.max(1, count)), dose, effect: null, start: h.start, end: h.end, term: orig.slice(h.start, h.end), unknown: false,
    };
  });
  // "triptano (rizatriptan)": il nome generico e quello preciso indicano lo stesso farmaco.
  for (let i = meds.length - 1; i >= 0; i -= 1) {
    if (meds[i].generic && meds.some((o) => !o.generic && o.cls === meds[i].cls)) meds.splice(i, 1);
  }
  bindEffects(f, meds);

  // Farmaci non in catalogo: solo dopo un verbo come "preso" e solo se sembrano un nome di farmaco (maiuscola, suffisso tipico o dose).
  const re = new RegExp(`((?:^|[^a-z])${LEX.tookSrc}\\s+(?:\\d\\s+)?(${DET_SRC})?)([a-z][a-z0-9-]{3,})(?:\\s+(\\d{2,4})\\s*(mg|mcg|g|ml)?)?`, 'g');
  let m = re.exec(f);
  while (m) {
    const word = m[3];
    const ws = m.index + m[1].length;
    const we = ws + word.length;
    const covered = meds.some((x) => ws < x.end && x.start < we);
    const cap = /^[A-ZÀ-Ý]/.test(orig[ws] || '');
    const suffix = /(?:ina|ine|ene|olo|ol|one|ide|ato|fen|xib|tan|ane|pam|lam|zole|pril|sartan|statin|mab|gepant)$/.test(word);
    // dopo un articolo ("du Zalexil") il suffisso da solo non basta: troppe parole comuni lo hanno.
    if (!covered && !LEX.notMeds.has(word) && (cap || m[4] || (suffix && !m[2]))) {
      const name = orig.slice(ws, we);
      meds.push({
        name: name[0].toUpperCase() + name.slice(1).toLowerCase(), cls: 'other', generic: false, count: 1, dose: m[4] ? `${m[4]} ${m[5] || 'mg'}` : '', effect: null, start: ws, end: we, term: name, unknown: true,
      });
    }
    if (m.index === re.lastIndex) re.lastIndex += 1;
    m = re.exec(f);
  }
  return mergeSameMeds(f, meds.sort((a, b) => a.start - b.start));
}

const ANOTHER = /(?:^|[^a-z])(?:altro|altra|another|again|ancora|nuovamente|di nuovo|otro|otra|otra vez|autre|encore|noch ein|noch eine|erneut|outro|outra|mais um|mais uma|din nou|inca un|inca o|nog een|opnieuw)\s*$/;

/* Articolo tra il verbo e il nome di un farmaco non in catalogo: "preso del Zalexil", "j'ai pris du Zalexil", "took a Zalexil". */
const DET_SRC = "(?:(?:(?:un|una|uno|une|ein|eine|einen|einem|een|um|uma|o|el|il|lo|la|le|du|de|del|des|dei|delle|della|dello|das|die|den|der|dem|het|mon|ma|mi|mijn|mein|meine|my|a|an|the|some|one|niste)\\s+){1,2}|(?:l|d|dell|all|dall)'\\s*)";

/* "(oki) ... ritorna dopo ore dall'oki": lo stesso farmaco citato piu' volte e' una sola assunzione, a meno che sia "un altro". */
function mergeSameMeds(f, meds) {
  const out = [];
  meds.forEach((m) => {
    const same = out.find((o) => o.name === m.name && !o.unknown === !m.unknown);
    if (!same) {
      out.push(m);
      return;
    }
    const another = ANOTHER.test(f.slice(Math.max(0, m.start - 16), m.start));
    same.count = Math.min(4, another ? Math.max(same.count, m.count) + 1 : Math.max(same.count, m.count));
    if (!same.dose && m.dose) same.dose = m.dose;
    if (same.effect == null && m.effect != null) same.effect = m.effect;
  });
  return out;
}

function findSide(f, isAura) {
  const all = [];
  ['sx', 'dx', 'bil', 'not'].forEach((k) => findAll(LEX.side[k], f).forEach((x) => all.push({ ...x, k })));
  const kept = resolveOverlaps(all).filter((x) => x.k !== 'not' && !isAura(x.start));
  const has = (k) => kept.some((x) => x.k === k);
  if (has('bil')) return 'bil';
  if (has('sx') && has('dx')) return 'alt';
  if (has('sx')) return 'sx';
  if (has('dx')) return 'dx';
  return '';
}

/* Lato e zone si riferiscono al dolore, non all'aura ("aura visiva a destra, dolore a sinistra") ne' a braccia e mani.
 * Una posizione e' "di aura" se, nella stessa frase, la parola di aura che la precede e' piu' vicina di quella di dolore, oppure se
 * nella stessa proposizione c'e' una parola di aura dopo e nessuna di dolore prima ("lato sinistro della faccia intorpidito"). */
function auraScope(f, clauses) {
  const auraSpans = [];
  ['any', 'visual', 'sensory', 'speech', 'motor'].forEach((k) => findAll(LEX.aura[k], f).forEach((x) => auraSpans.push(x)));
  const aura = auraSpans.filter((s) => !negatedAt(f, s.start, inClause(clauses, s.start)[0]));
  const painSpans = findAll(LEX.pain, f);
  const sentences = sentencesOf(f);
  const lastEnd = (list, from, pos) => list.reduce((mx, s) => (s.start >= from && s.end <= pos ? Math.max(mx, s.end) : mx), -1);
  return (pos) => {
    const [ca, cb] = inClause(clauses, pos);
    if (LIMB.test(f.slice(ca, cb))) return true;
    const [sa] = sentences.find(([x, y]) => pos >= x && pos <= y) || [0, f.length];
    const lastAura = lastEnd(aura, sa, pos);
    if (lastAura >= 0 && pos - lastAura <= 120 && lastAura > lastEnd(painSpans, sa, pos)) return true;
    const auraLater = aura.some((s) => s.start >= pos && s.end <= cb);
    const painBefore = painSpans.some((s) => s.start >= ca && s.end <= pos);
    return auraLater && !painBefore;
  };
}

function findGroup(groups, f, isSkipped, { negatable = false, clauses = null } = {}) {
  const all = [];
  groups.forEach(({ name, re }) => findAll(re, f).forEach((x) => all.push({ ...x, name })));
  return resolveOverlaps(all).filter((x) => {
    if (isSkipped && isSkipped(x.start)) return false;
    if (negatable && negatedAt(f, x.start, inClause(clauses, x.start)[0])) return false;
    return true;
  });
}

// "dopo qualche ora", "after a few hours": un ritardo, non la durata dell'attacco.
const DELAY_BEFORE = /(?:^|[^a-z])(?:dopo|fra|tra|entro|after|within|in|despues|tras|apres|dans|nach|binnen|depois|dupa|peste|na)\s+(?:di\s+|de\s+|von\s+)?$/;

function approxDuration(f) {
  if (hasMatch(LEX.allDay, f)) return { approx: '12to24', days: 0 };
  const cue = LEX.durationCueSrc;
  const hours = new RegExp(`(?:^|[^a-z])${cue}\\s*(\\d{1,2})\\s*${LEX.hoursWordSrc}(?![a-z])`).exec(f);
  if (hours) {
    const h = Number(hours[1]);
    return { approx: h < 4 ? 'lt4' : h < 12 ? '4to12' : h < 24 ? '12to24' : 'days', days: 0 };
  }
  const days = new RegExp(`(?:^|[^a-z])${cue}\\s*(\\d{1,2})\\s*${LEX.daysWordSrc}(?![a-z])`).exec(f);
  if (days && Number(days[1]) >= 2 && Number(days[1]) <= 14) return { approx: 'days', days: Number(days[1]) };
  if (findAll(LEX.fewHours, f).some((x) => !DELAY_BEFORE.test(f.slice(Math.max(0, x.start - 16), x.start)))) return { approx: 'lt4', days: 0 };
  return { approx: '', days: 0 };
}

function findMenses(f) {
  const blockers = findAll(LEX.mensesNot, f);
  const hits = findAll(LEX.menses, f).filter((x) => !blockers.some((b) => x.start < b.end && b.start < x.end));
  if (!hits.length) return { any: false, today: false };
  const today = hits.some((x) => {
    const before = f.slice(Math.max(0, x.start - 22), x.start);
    return !hasMatch(LEX.mensesBefore, before) && !/-\s*\d/.test(before);
  });
  return { any: true, today };
}

/** Analizza il testo di una voce. */
export function analyzeText(full) {
  const orig = full.length > MAX_ENTRY_CHARS ? full.slice(0, MAX_ENTRY_CHARS) : full;
  const f = fold(orig);
  const clauses = clausesOf(f);
  const empty = f.replace(/[^a-z0-9]/g, '') === '';

  const numeric = findIntensity(f);
  const verbal = numeric == null ? verbalIntensity(f, clauses) : null;
  let intensity = numeric != null ? numeric : verbal;

  const meds = findMeds(f, orig);
  const isAura = auraScope(f, clauses);
  const areas = [...new Set(findGroup(LEX.area, f, isAura).map((x) => x.name))];
  const quality = [...new Set(findGroup(LEX.quality, f, null).map((x) => x.name))];
  const side = findSide(f, isAura);

  const hit = (re) => findAll(re, f).filter((x) => !negatedAt(f, x.start, inClause(clauses, x.start)[0])).length > 0;
  const auraVisual = hit(LEX.aura.visual);
  const auraSensory = hit(LEX.aura.sensory);
  const auraSpeech = hit(LEX.aura.speech);
  const auraMotor = hit(LEX.aura.motor);
  const auraAny = hit(LEX.aura.any);
  const aura = [];
  if (auraVisual) aura.push('Visiva (luci, zig-zag, macchie)');
  if (auraSensory) aura.push('Sensitiva (formicolii)');
  if (auraSpeech) aura.push('Del linguaggio');
  if (auraMotor) aura.push('Motoria');
  const noAura = hasMatch(LEX.type.noAura, f) || findAll(LEX.aura.any, f).some((x) => negatedAt(f, x.start, inClause(clauses, x.start)[0]));
  let type = '';
  if (hasMatch(LEX.type.cluster, f)) type = 'grappolo';
  else if (hasMatch(LEX.type.tension, f)) type = 'tensiva';
  else if (aura.length || auraAny || hasMatch(LEX.type.withAura, f)) type = 'con_aura';
  else if (noAura) type = 'senza_aura';

  const blockers = findAll(LEX.mensesNot, f).map((x) => ({ ...x, name: '__not' }));
  const stTr = [];
  LEX.symptom.forEach(({ name, re }) => findAll(re, f).forEach((x) => stTr.push({ ...x, name, kind: 'symptom' })));
  LEX.trigger.forEach(({ name, re }) => findAll(re, f).forEach((x) => stTr.push({ ...x, name, kind: 'trigger' })));
  const chosen = resolveOverlaps([...stTr, ...blockers.map((x) => ({ ...x, kind: 'block' }))]).filter((x) => x.kind !== 'block' && !negatedAt(f, x.start, inClause(clauses, x.start)[0]));
  const symptoms = [...new Set(chosen.filter((x) => x.kind === 'symptom').map((x) => x.name))];
  const triggers = [...new Set(chosen.filter((x) => x.kind === 'trigger').map((x) => x.name))];

  const menses = findMenses(f);
  const dur = approxDuration(f);
  const er = hasMatch(LEX.er, f);
  const hosp = hasMatch(LEX.hosp, f);

  const painWord = findAll(LEX.pain, f).some((x) => !negatedAt(f, x.start, inClause(clauses, x.start)[0]));
  // "senza dolore ma con aura": un episodio di aura senza mal di testa non ha un'intensita' di dolore.
  const firstNoPain = findAll(LEX.noPain, f)[0];
  if (numeric == null && firstNoPain && firstNoPain.start < 24 && (aura.length > 0 || auraAny)) intensity = 1;
  const evidence = intensity != null || areas.length > 0 || quality.length > 0 || !!side || aura.length > 0 || auraAny || symptoms.length > 0 || meds.length > 0 || painWord;
  let kind = 'attack';
  if (!empty && !evidence) {
    if (hasMatch(LEX.noPain, f) || FREE_ONLY.test(f.replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim())) kind = 'free';
    else if (hasMatch(LEX.other, f)) kind = 'other';
    else if (menses.any) kind = menses.today ? 'menses' : 'other';
  } else if (!empty && !areas.length && !meds.length && !aura.length && intensity == null && hasMatch(LEX.noPain, f) && !painWord) kind = 'free';

  return {
    empty, intensity, side, areas, quality, aura, type, symptoms, triggers, meds,
    menses: menses.any, mensesToday: menses.today, er, hosp, approxDur: dur.approx, durDays: dur.days, kind, evidence,
  };
}

/* ---------------------------------------------------------------- API */

const isDitto = (text) => {
  const f = fold(text).replace(/[\s.,:;!)]+$/g, '').replace(/^[\s.,:;(]+/g, '');
  if (!f) return false;
  if (/^[\^"'\u2033\u3003=~-]+$/.test(f)) return true;
  return LEX.dittoRe.test(f);
};

const addDaysIso = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
};

/* "emicrania forte (12/03/2025)", "leggera - 13/03": se nessuna riga inizia con una data si prova con la data in fondo alla riga. */
const R_TRAIL = /^(.*?[\p{L}\p{N}])[\s,;:\-([]*((?:19|20)\d{2}\s*-\s*\d{1,2}\s*-\s*\d{1,2}|\d{1,2}\s*[./-]\s*\d{1,2}(?:\s*[./-]\s*\d{2,4})?)\s*[)\]]?[\s.]*$/u;

function moveTrailingDates(lines) {
  let hits = 0;
  const out = lines.map((ln) => {
    if (!ln.orig) return ln;
    const m = R_TRAIL.exec(ln.orig);
    if (!m) return ln;
    const date = m[2].replace(/\s+/g, '');
    const dm = matchDate(date);
    if (!dm || dm.len !== date.length) return ln;
    hits += 1;
    const orig = `${date} ${m[1]}`;
    return { n: ln.n, orig, f: fold(orig) };
  });
  const filled = lines.filter((l) => l.orig).length;
  return hits >= 2 || (hits === 1 && filled <= 3) ? out : null;
}

export function parseNotes(text, opts = {}) {
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const lines = prepareLines(text);
  let res = parseLines(lines, today, opts);
  if (!res.entries.length) {
    const moved = moveTrailingDates(lines);
    const alt = moved ? parseLines(moved, today, opts) : null;
    if (alt && alt.entries.length) {
      alt.meta.dateLast = true;
      res = alt;
    }
  }
  return res;
}

function parseLines(lines, today, opts) {
  const { items, preamble } = segment(lines);
  const res = resolveDates(items, {
    today, baseYear: opts.baseYear != null ? opts.baseYear : null, order: opts.order || 'auto', hintOrder: opts.hintOrder || 'dmy',
  });

  const seen = new Map();
  let prevAttack = null;
  const entries = res.entries.map((e, i) => {
    const ditto = isDitto(e.text);
    const a = analyzeText(ditto ? '' : e.text);
    const out = {
      key: `${e.line}.${i}`,
      line: e.line,
      date: e.date,
      endDate: e.endDate,
      year: e.year,
      yearSrc: e.yearSrc,
      problem: e.problem,
      text: ditto ? '' : e.text,
      intensity: a.intensity,
      side: a.side,
      areas: a.areas,
      quality: a.quality,
      aura: a.aura,
      type: a.type,
      symptoms: a.symptoms,
      triggers: a.triggers,
      meds: a.meds.map(({ name, cls, count, dose, effect, term, unknown }) => ({
        name, cls, count, dose, effect, term, unknown,
      })),
      menses: a.menses,
      mensesToday: a.mensesToday,
      er: a.er,
      hosp: a.hosp,
      approxDur: a.approxDur,
      kind: a.kind,
      flags: { ditto, noDetails: a.empty && !ditto, multi: !!e.multi, future: false, rangeLong: false, dupDate: false },
    };
    if (ditto && prevAttack) {
      ['intensity', 'side', 'areas', 'quality', 'aura', 'type', 'symptoms', 'triggers', 'approxDur'].forEach((k) => {
        out[k] = Array.isArray(prevAttack[k]) ? [...prevAttack[k]] : prevAttack[k];
      });
      out.meds = prevAttack.meds.map((m) => ({ ...m }));
    }
    if (!out.endDate && a.durDays >= 2 && out.date) out.endDate = addDaysIso(out.date, a.durDays - 1);
    if (out.date) {
      if (out.date > today) out.flags.future = true;
      if (seen.has(out.date)) out.flags.dupDate = true;
      seen.set(out.date, true);
      if (out.endDate) {
        const span = Math.round((Date.parse(out.endDate) - Date.parse(out.date)) / 86400000);
        if (span > 14) out.flags.rangeLong = true;
      }
    }
    if (out.kind === 'attack') prevAttack = out;
    return out;
  });

  const dates = entries.filter((e) => e.date).map((e) => e.date).sort();
  const years = new Set(dates.map((d) => d.slice(0, 4)));
  return {
    entries,
    meta: {
      order: res.order,
      orderCertain: res.orderCertain,
      mixedOrder: res.mixed,
      ambiguous: res.ambiguous,
      direction: res.dir,
      yearInferred: res.inferred,
      firstDate: dates[0] || null,
      lastDate: dates[dates.length - 1] || null,
      years: [...years],
      lines: lines.length,
      preamble,
      explicitYears: res.entries.some((e) => e.yearSrc === 'explicit' || e.yearSrc === 'header'),
    },
  };
}
