/* i18n-ignore-file */
/* Utilita' del lettore di note: nessuna dipendenza dal DOM (gira anche in Node, per i test).
 *
 * Il testo da analizzare viene "piegato" (fold): minuscolo e senza accenti, ma con la STESSA lunghezza dell'originale, cosi' le
 * posizioni trovate nel testo piegato valgono anche per quello originale. I dizionari (js/notes/lex/*.js) sono scritti gia' piegati,
 * in un piccolo linguaggio di "termini":
 *   spazio  = uno o piu' spazi        pulsa*  = pulsa + qualsiasi lettera (pulsante, pulsazioni...)
 *   '       = apostrofo facoltativo   -       = trattino o spazio facoltativi (zig-zag, zig zag, zigzag)
 */

const SPECIAL = new Map(Object.entries({
  'ß': 's', 'æ': 'a', 'œ': 'o', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 't', 'ı': 'i',
  '’': "'", '‘': "'", '`': "'", '´': "'", 'ʼ': "'", '′': "'",
  '“': '"', '”': '"', '«': '"', '»': '"', '„': '"',
  '–': '-', '—': '-', '‒': '-', '―': '-', '−': '-', '‐': '-', '‑': '-',
  '\u00a0': ' ', '\u2007': ' ', '\u202f': ' ', '\u2009': ' ', '\u2002': ' ', '\u2003': ' ',
}));
const cache = new Map();

function foldChar(c) {
  let r = cache.get(c);
  if (r !== undefined) return r;
  const lower = c.toLowerCase();
  r = SPECIAL.get(lower);
  if (r === undefined) {
    r = lower.length === 1 ? lower.normalize('NFD')[0] : lower[0];
    if (r >= '\u0300' && r <= '\u036f') r = ' ';
  }
  cache.set(c, r);
  return r;
}

/** Minuscolo, senza accenti, stessa lunghezza dell'input (che deve essere gia' in forma NFC). */
export function fold(s) {
  let out = '';
  for (let i = 0; i < s.length; i += 1) out += foldChar(s[i]);
  return out;
}

/** "a, b, c" -> ['a', 'b', 'c']: per scrivere i dizionari senza tante virgolette. */
export const w = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

export function termSource(term) {
  let out = '';
  for (let i = 0; i < term.length; i += 1) {
    const c = term[i];
    if (c === ' ') out += '\\s+';
    else if (c === '*') out += '[a-z]*';
    else if (c === "'") out += "'?\\s?";
    else if (c === '-') out += '[-\\s]?';
    else if (/[a-z0-9]/.test(c)) out += c;
    else out += `\\${c}`;
  }
  return out;
}

const NEVER = /(?!)/g;

/** Espressione che trova uno qualsiasi dei termini come parola intera (le cifre contano come confine: "2oki"). */
export function termsRe(terms, flags = 'g') {
  const list = [...new Set((terms || []).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!list.length) return new RegExp(NEVER.source, flags);
  return new RegExp(`(^|[^a-z])(${list.map(termSource).join('|')})(?![a-z])`, flags);
}

/** Alternativa grezza (senza confini), per costruire espressioni composte. */
export const alt = (terms) => {
  const list = [...new Set((terms || []).filter(Boolean))].sort((a, b) => b.length - a.length);
  return list.length ? `(?:${list.map(termSource).join('|')})` : '(?!)';
};

/** Tutte le occorrenze: [{ start, end, text }] sul testo piegato. */
export function findAll(re, f) {
  const out = [];
  re.lastIndex = 0;
  let m = re.exec(f);
  while (m) {
    const start = m.index + m[1].length;
    out.push({ start, end: start + m[2].length, text: m[2] });
    if (m.index === re.lastIndex) re.lastIndex += 1;
    m = re.exec(f);
  }
  return out;
}

export const hasMatch = (re, f) => {
  re.lastIndex = 0;
  const r = re.test(f);
  re.lastIndex = 0;
  return r;
};

/** Tiene le occorrenze piu' lunghe e scarta quelle che le sovrappongono (a parita' vince la prima). */
export function resolveOverlaps(matches) {
  const order = [...matches].sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const kept = [];
  for (const m of order) {
    if (!kept.some((k) => m.start < k.end && k.start < m.end)) kept.push(m);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/** Distanza di Damerau-Levenshtein limitata: restituisce max+1 se supera il massimo. */
export function editDistance(a, b, max) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = [];
  let prev = [];
  for (let j = 0; j <= b.length; j += 1) prev.push(j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

const PAD = (n) => String(n).padStart(2, '0');
export const pad2 = PAD;
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const validYMD = (y, m, d) => Number.isInteger(y) && y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
export const isoDate = (y, m, d) => `${y}-${PAD(m)}-${PAD(d)}`;
