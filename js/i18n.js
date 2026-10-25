/* Traduzioni dell'interfaccia.
 *
 * Nel codice il testo italiano e' la chiave: t('Salva'). Le altre lingue sono dizionari (js/i18n/<lingua>.js) caricati qui con un
 * top-level await: quando un modulo che importa questo file viene eseguito, la lingua e' gia' pronta. Per cambiare lingua si salva
 * la scelta e si ricarica la pagina.
 *
 * Messaggi: {nome} per i parametri, {n, plural, one {# giorno} other {# giorni}} per i plurali (# = numero formattato).
 *   t('Salva')                                  testo fisso
 *   t('Ultimo backup: {quando}', { quando })    parametri
 *   tv(valore)                                  valore salvato nei dati (es. un fattore scatenante): si traduce solo se noto
 *   tr('Stress')                                marca un testo per l'estrazione senza tradurlo (valori salvati, tradotti poi con tv())
 *   tx('Leggi {link}', { link: nodo })          come t(), ma i parametri possono essere nodi DOM: restituisce un array per h()
 * Si controllano le traduzioni con: python tools/i18n_check.py check
 */

export const LANGS = [
  { code: 'it', name: 'Italiano', locale: 'it-IT' },
  { code: 'en', name: 'English', locale: 'en-GB' },
  { code: 'es', name: 'Español', locale: 'es-ES' },
  { code: 'fr', name: 'Français', locale: 'fr-FR' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE' },
  { code: 'pt', name: 'Português', locale: 'pt-BR' },
  { code: 'ro', name: 'Română', locale: 'ro-RO' },
  { code: 'nl', name: 'Nederlands', locale: 'nl-NL' },
];
export const LANG_KEY = 'emicrania.lang';
const DB_KEY = 'emicrania.db.v1';
/** Lingua di prova (tests/walk.py): ogni testo passato da t()/tv() compare tra ⟦ ⟧, cosi' si vedono quelli dimenticati. */
export const PSEUDO = 'xx';

const CODES = new Set(LANGS.map((l) => l.code));
const inBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

function storage(fn) {
  try {
    return typeof localStorage === 'undefined' ? undefined : fn(localStorage);
  } catch (e) {
    return undefined;
  }
}

/** Prima lingua supportata tra quelle preferite dal dispositivo (es. ['pt-BR', 'en']); inglese se nessuna. */
export function detectLang(tags) {
  for (const tag of tags || []) {
    const base = String(tag).toLowerCase().split(/[-_]/)[0];
    if (CODES.has(base)) return base;
  }
  return 'en';
}

function resolveLang() {
  if (!inBrowser) return 'it';
  const saved = storage((ls) => ls.getItem(LANG_KEY));
  if (saved === PSEUDO || CODES.has(saved)) return saved;
  // Prima apertura con questa versione: chi ha gia' dei dati usava l'app in italiano; chi inizia ora segue la lingua del telefono.
  const hasData = storage((ls) => !!ls.getItem(DB_KEY));
  const tags = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  const code = hasData ? 'it' : detectLang(tags);
  storage((ls) => ls.setItem(LANG_KEY, code));
  return code;
}

let code = resolveLang();
let dict = null;
if (code !== 'it' && code !== PSEUDO) {
  try {
    dict = (await import(`./i18n/${code}.js`)).default;
  } catch (e) {
    console.warn('Traduzione non disponibile, uso l’italiano', code, e);
    code = 'it';
  }
}

export const lang = code;
export const isPseudo = code === PSEUDO;
export const locale = LANGS.find((l) => l.code === (isPseudo ? 'it' : code)).locale;
if (inBrowser) document.documentElement.lang = isPseudo ? 'it' : code;

/** Chiavi usate senza traduzione (solo quando la lingua non e' l'italiano): serve ai test. */
export const missing = new Set();

export function setLang(next) {
  if (!CODES.has(next)) return false;
  return storage((ls) => {
    ls.setItem(LANG_KEY, next);
    return true;
  }) === true;
}

/* ---------- messaggi ---------- */

function matchBrace(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j += 1) {
    if (s[j] === '{') depth += 1;
    else if (s[j] === '}') {
      depth -= 1;
      if (depth === 0) return j;
    }
  }
  return -1;
}

function parseCases(body) {
  const cases = {};
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i += 1;
    const m = /^(=\d+|[a-z]+)\s*/.exec(body.slice(i));
    if (!m) break;
    i += m[0].length;
    if (body[i] !== '{') break;
    const end = matchBrace(body, i);
    if (end < 0) break;
    cases[m[1]] = parseNodes(body.slice(i + 1, end));
    i = end + 1;
  }
  return cases;
}

function parseNodes(msg) {
  const nodes = [];
  let text = '';
  let i = 0;
  while (i < msg.length) {
    if (msg[i] !== '{') {
      text += msg[i];
      i += 1;
      continue;
    }
    const end = matchBrace(msg, i);
    if (end < 0) {
      text += msg.slice(i);
      break;
    }
    const m = /^\s*(\w+)\s*(?:,\s*plural\s*,([\s\S]*))?$/.exec(msg.slice(i + 1, end));
    if (!m) {
      text += msg.slice(i, end + 1);
    } else {
      if (text) nodes.push(text);
      text = '';
      nodes.push(m[2] === undefined ? { name: m[1] } : { name: m[1], cases: parseCases(m[2]) });
    }
    i = end + 1;
  }
  if (text) nodes.push(text);
  return nodes;
}

const parsed = new Map();
const parse = (msg) => {
  let nodes = parsed.get(msg);
  if (!nodes) {
    nodes = parseNodes(msg);
    parsed.set(msg, nodes);
  }
  return nodes;
};

const rulesFor = new Map();
function pluralRules(loc) {
  if (!rulesFor.has(loc)) rulesFor.set(loc, new Intl.PluralRules(loc));
  return rulesFor.get(loc);
}

const countFmt = new Map();
function fmtCount(n, loc) {
  if (!countFmt.has(loc)) countFmt.set(loc, new Intl.NumberFormat(loc, { useGrouping: false, maximumFractionDigits: 2 }));
  return countFmt.get(loc).format(n);
}

function render(nodes, params, loc, count, out) {
  for (const n of nodes) {
    if (typeof n === 'string') {
      out.push(count === undefined ? n : n.replace(/#/g, fmtCount(count, loc)));
    } else if (n.cases) {
      const num = Number(params[n.name]);
      const pick = n.cases[`=${num}`] || n.cases[pluralRules(loc).select(num)] || n.cases.other || [];
      render(pick, params, loc, Number.isFinite(num) ? num : undefined, out);
    } else {
      const v = params[n.name];
      out.push(v == null ? `{${n.name}}` : v);
    }
  }
  return out;
}

/** Formatta un messaggio per una lingua precisa (usata dai test e dagli strumenti). */
export function formatMessage(msg, params, code2 = code) {
  const loc = (LANGS.find((l) => l.code === code2) || LANGS[0]).locale;
  return render(parse(msg), params || {}, loc, undefined, []).map(String).join('');
}

const wrapPseudo = (s) => (isPseudo ? `⟦${s}⟧` : s);

/** Una chiave puo' finire con §contesto (es. 'Annulla§undo') per distinguere significati diversi dello stesso testo: in italiano si vede solo il testo prima del §. */
const withoutContext = (msg) => {
  const i = msg.indexOf('§');
  return i < 0 ? msg : msg.slice(0, i);
};

export function t(msg, params) {
  if (typeof msg !== 'string') return msg;
  let s = dict ? dict[msg] : undefined;
  if (typeof s !== 'string' || s === '') {
    s = withoutContext(msg);
    if (dict) missing.add(msg);
  }
  if (params && s.includes('{')) s = render(parse(s), params, locale, undefined, []).map(String).join('');
  return wrapPseudo(s);
}

/** Traduce un valore salvato nei dati (es. 'Stress'): se non e' una voce nota (testo scritto dall'utente) resta com'e'. */
export function tv(value) {
  if (value == null) return '';
  const s = String(value);
  const found = dict ? dict[s] : undefined;
  return wrapPseudo(typeof found === 'string' && found !== '' ? found : s);
}

export const tr = (s) => s;

/** Come t(), ma i parametri possono essere nodi DOM: restituisce un array di stringhe e nodi, adatto a h(). */
export function tx(msg, params = {}) {
  let s = dict ? dict[msg] : undefined;
  if (typeof s !== 'string' || s === '') {
    s = withoutContext(msg);
    if (dict) missing.add(msg);
  }
  const parts = render(parse(s), params, locale, undefined, []);
  const out = [];
  parts.forEach((p) => {
    const last = out.length - 1;
    if (typeof p === 'object' && p !== null) out.push(p);
    else if (last >= 0 && typeof out[last] === 'string') out[last] += String(p);
    else out.push(String(p));
  });
  if (isPseudo && out.length) {
    if (typeof out[0] === 'string') out[0] = `⟦${out[0]}`;
    else out.unshift('⟦');
    if (typeof out[out.length - 1] === 'string') out[out.length - 1] += '⟧';
    else out.push('⟧');
  }
  return out;
}

/* ---------- utilita' legate alla lingua ---------- */

const listFormats = {};
function listFormat(type) {
  if (!listFormats[type]) listFormats[type] = new Intl.ListFormat(locale, { style: 'long', type });
  return listFormats[type];
}
/** "A, B e C" (nella lingua corrente). */
export const listAnd = (items) => listFormat('conjunction').format(items.map(String));
/** "A, B o C" (nella lingua corrente). */
export const listOr = (items) => listFormat('disjunction').format(items.map(String));

/** Confronto alfabetico secondo la lingua corrente (per sort). */
export const collate = (a, b) => String(a).localeCompare(String(b), locale);
