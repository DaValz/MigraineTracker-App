import { nowStr, todayStr, parseDate, toDateStr } from './dates.js';
import {
  defaultSettings, LIST_KINDS, DEFAULT_MEDS, CYCLE_TRIGGERS, MED_CLASSES, EPISODE_TYPES, SIDES, APPROX_DURATIONS, TX_VS,
  THERAPY_CLASSES, THERAPY_PRESETS, STOP_REASONS, SEXES, YES_NO_UNKNOWN, TYPICAL_DURATIONS, AURA_FREQ, CYCLE_LINK,
  CONTACT_ROLES, VISIT_KINDS, DOC_CATEGORIES,
} from './data.js';
import { episodeDates } from './analysis.js';

export const STORAGE_KEY = 'emicrania.db.v1';
export const BACKUP_KEY = 'emicrania.db.bak';
export const BACKUP_DATE_KEY = 'emicrania.db.bak.date';
export const THEME_KEY = 'emicrania.theme';
export const SCHEMA_VERSION = 2;

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const RE_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const RE_YEAR = /^\d{4}$/;
const RE_MIME = /^[\w.+-]+\/[\w.+-]+$/;
const RE_EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const idPattern = (prefix) => new RegExp(`^${prefix}[a-z0-9]{6,30}$`);
const RE_ID = idPattern('e');
const RE_CID = idPattern('c');
const RE_FID = idPattern('f');
const setOf = (list, key = 'id') => new Set(list.map((x) => x[key]));
const TYPE_IDS = setOf(EPISODE_TYPES);
const SIDE_IDS = setOf(SIDES);
const CLASS_IDS = setOf(MED_CLASSES);
const APPROX_IDS = setOf(APPROX_DURATIONS);
const VS_IDS = setOf(TX_VS);
const THERAPY_IDS = setOf(THERAPY_CLASSES);
const STOP_IDS = setOf(STOP_REASONS);
const SEX_IDS = setOf(SEXES);
const YNU_IDS = setOf(YES_NO_UNKNOWN);
const TYPDUR_IDS = setOf(TYPICAL_DURATIONS);
const AURA_IDS = setOf(AURA_FREQ);
const CYCLE_IDS = setOf(CYCLE_LINK);
const ROLE_IDS = setOf(CONTACT_ROLES);
const VISIT_IDS = setOf(VISIT_KINDS);
const DOC_IDS = setOf(DOC_CATEGORIES);

export const isDate = (s) => typeof s === 'string' && RE_DATE.test(s) && toDateStr(parseDate(s)) === s;
export const isDateTime = (s) => typeof s === 'string' && RE_DT.test(s) && isDate(s.slice(0, 10))
  && Number(s.slice(11, 13)) < 24 && Number(s.slice(14, 16)) < 60;
export const isMonth = (s) => typeof s === 'string' && RE_MONTH.test(s);

export const makeId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const newId = () => makeId('e');
export const newPreventiveId = () => makeId('p');

// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
// eslint-disable-next-line no-control-regex
const CTRL_LINE = /[\u0000-\u001f]/g;

function cleanStr(v, max = 200) {
  return typeof v === 'string' ? v.replace(CTRL_LINE, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function cleanText(v, max = 4000) {
  return typeof v === 'string' ? v.replace(CTRL, '').replace(/\r\n?/g, '\n').slice(0, max).trim() : '';
}

const cleanNote = (v) => cleanText(v, 4000);

function cleanList(v, maxItems = 60, maxLen = 80) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const x of v) {
    const s = cleanStr(x, maxLen);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function cleanNum(v, min, max, { int = false, fallback = null, step = 0 } = {}) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN);
  if (!Number.isFinite(n)) return fallback;
  let c = Math.min(max, Math.max(min, n));
  if (int) c = Math.round(c);
  else if (step) c = Math.round(c / step) * step;
  return c;
}

const pick = (v, ids, fallback = '') => (ids.has(v) ? v : fallback);
const bool = (v) => v === true;

function uniqueId(raw, prefix, taken) {
  let id = typeof raw === 'string' && idPattern(prefix).test(raw) ? raw : makeId(prefix);
  while (taken && taken.has(id)) id = makeId(prefix);
  return id;
}

/* ---------- attacchi ---------- */

function sanitizeMedEntry(raw, fallbackAt) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanStr(raw.name, 80);
  if (!name) return null;
  return {
    name,
    cls: CLASS_IDS.has(raw.cls) ? raw.cls : 'other',
    dose: cleanStr(raw.dose, 40),
    at: isDateTime(raw.at) ? raw.at : fallbackAt,
    effect: cleanNum(raw.effect, 0, 3, { int: true, fallback: null }),
  };
}

export function sanitizeTx(raw) {
  const t = raw && typeof raw === 'object' ? raw : {};
  return { vs: pick(t.vs, VS_IDS), missed: typeof t.missed === 'boolean' ? t.missed : null };
}

export function sanitizeEpisode(raw) {
  if (!raw || typeof raw !== 'object' || !isDateTime(raw.start)) return null;
  const timeUnknown = raw.timeUnknown === true;
  const start = timeUnknown ? `${raw.start.slice(0, 10)}T12:00` : raw.start;
  let end = isDateTime(raw.end) ? raw.end : null;
  let approxDur = '';
  if (timeUnknown) {
    approxDur = pick(raw.approxDur, APPROX_IDS);
    end = approxDur === 'days' && end ? `${end.slice(0, 10)}T12:00` : start;
  }
  if (end && end < start) end = start;
  const now = nowStr();
  const meds = (Array.isArray(raw.meds) ? raw.meds : []).slice(0, 20).map((m) => sanitizeMedEntry(m, start)).filter(Boolean);
  if (timeUnknown) meds.forEach((m) => { m.at = `${m.at.slice(0, 10)}T12:00`; });
  return {
    id: RE_ID.test(raw.id) ? raw.id : newId(),
    start,
    end,
    timeUnknown,
    approxDur,
    intensity: cleanNum(raw.intensity, 1, 10, { int: true, fallback: 5 }),
    type: TYPE_IDS.has(raw.type) ? raw.type : '',
    side: SIDE_IDS.has(raw.side) ? raw.side : '',
    areas: cleanList(raw.areas),
    quality: cleanList(raw.quality),
    aura: cleanList(raw.aura),
    symptoms: cleanList(raw.symptoms),
    triggers: cleanList(raw.triggers),
    meds,
    impact: cleanNum(raw.impact, 0, 3, { int: true, fallback: 0 }),
    work: cleanNum(raw.work, 0, 2, { int: true, fallback: 0 }),
    tx: sanitizeTx(raw.tx),
    note: cleanNote(raw.note),
    createdAt: isDateTime(raw.createdAt) ? raw.createdAt : now,
    updatedAt: isDateTime(raw.updatedAt) ? raw.updatedAt : now,
  };
}

export function sanitizeDay(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  if (raw.free) out.free = true;
  if (raw.checkin) out.checkin = true;
  const sleepH = cleanNum(raw.sleepH, 0, 24);
  if (sleepH != null) out.sleepH = Math.round(sleepH * 4) / 4;
  [['sleepQ', 1, 5], ['stress', 1, 5], ['mood', 1, 5]].forEach(([k, lo, hi]) => {
    const v = cleanNum(raw[k], lo, hi, { int: true });
    if (v != null) out[k] = v;
  });
  [['water', 30], ['caffeine', 30], ['alcohol', 30]].forEach(([k, hi]) => {
    const v = cleanNum(raw[k], 0, hi, { int: true });
    if (v != null) out[k] = v;
  });
  if (raw.skippedMeal) out.skippedMeal = true;
  if (raw.exercise) out.exercise = true;
  if (raw.menses) out.menses = true;
  const note = cleanNote(raw.note);
  if (note) out.note = note;
  return out;
}

export const isEmptyDay = (d) => !d || Object.keys(d).length === 0;

/* ---------- terapie di prevenzione ---------- */

export function guessTherapyClass(name) {
  const n = String(name || '').toLowerCase();
  const hit = THERAPY_PRESETS.find((p) => n.startsWith(p.name.toLowerCase()) || (p.hint && p.hint.toLowerCase().split(/[ ,]+/).some((h) => h.length > 3 && n.includes(h))));
  return hit ? hit.cls : 'other';
}

export const defaultEvery = (cls) => (THERAPY_CLASSES.find((c) => c.id === cls) || {}).every || 0;

export function sanitizePreventive(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanStr(raw.name, 80);
  if (!name || !isDate(raw.start)) return null;
  let end = isDate(raw.end) ? raw.end : null;
  if (end && end < raw.start) end = raw.start;
  const cls = THERAPY_IDS.has(raw.cls) ? raw.cls : guessTherapyClass(name);
  const doses = Array.isArray(raw.doses)
    ? [...new Set(raw.doses.filter((d) => isDate(d) && d >= raw.start && (!end || d <= end)))].sort().slice(-300)
    : [];
  return {
    id: uniqueId(raw.id, 'p'),
    name,
    cls,
    dose: cleanStr(raw.dose, 60),
    start: raw.start,
    end,
    every: cleanNum(raw.every, 0, 400, { int: true, fallback: defaultEvery(cls) }),
    doses,
    stop: end ? pick(raw.stop, STOP_IDS) : '',
    sides: cleanList(raw.sides, 20, 60),
    rating: cleanNum(raw.rating, 0, 3, { int: true, fallback: null }),
    doctor: cleanStr(raw.doctor, 80),
    baseDays: cleanNum(raw.baseDays, 0, 31, { step: 0.5 }),
    baseInt: cleanNum(raw.baseInt, 1, 10, { step: 0.5 }),
    note: cleanText(raw.note, 1000),
  };
}

/* ---------- storia clinica (anamnesi) ---------- */

export function emptyHistory() {
  return {
    birthYear: null,
    sex: '',
    onsetAge: null,
    diagnoses: [],
    diagYear: null,
    diagBy: '',
    famKnown: '',
    family: [],
    typical: {
      side: '', quality: [], areas: [], intensity: null, duration: '', aura: '', auraTypes: [], symptoms: [], triggers: [], activity: '',
    },
    periods: [],
    events: [],
    acute: [],
    conditions: [],
    conditionsNote: '',
    allergies: '',
    otherMeds: '',
    cycleLink: '',
    contraception: '',
    narrative: '',
    updatedAt: null,
  };
}

export function sanitizePeriod(raw) {
  if (!raw || typeof raw !== 'object' || !isMonth(raw.from)) return null;
  const days = cleanNum(raw.days, 0, 31, { step: 0.5 });
  if (days == null) return null;
  let to = isMonth(raw.to) ? raw.to : null;
  if (to && to < raw.from) to = raw.from;
  return {
    id: uniqueId(raw.id, 'h'),
    from: raw.from,
    to,
    days,
    intensity: cleanNum(raw.intensity, 1, 10, { step: 0.5 }),
    acute: cleanNum(raw.acute, 0, 31, { step: 0.5 }),
    note: cleanText(raw.note, 500),
  };
}

export const isFuzzyDate = (s) => isDate(s) || isMonth(s) || (typeof s === 'string' && RE_YEAR.test(s) && Number(s) > 1900);

export function sanitizeEvent(raw) {
  if (!raw || typeof raw !== 'object' || !isFuzzyDate(raw.date)) return null;
  const title = cleanStr(raw.title, 120);
  const text = cleanText(raw.text, 3000);
  if (!title && !text) return null;
  return {
    id: uniqueId(raw.id, 'x'),
    date: raw.date,
    title: title || text.split('\n')[0].slice(0, 60),
    text,
    intensity: cleanNum(raw.intensity, 1, 10, { int: true }),
    er: bool(raw.er),
    hosp: bool(raw.hosp),
  };
}

export function sanitizeAcute(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanStr(raw.name, 80);
  if (!name) return null;
  return {
    id: uniqueId(raw.id, 'a'),
    name,
    cls: CLASS_IDS.has(raw.cls) ? raw.cls : 'other',
    effect: cleanNum(raw.effect, 0, 3, { int: true }),
    note: cleanStr(raw.note, 200),
  };
}

function sanitizeSubList(list, fn, max) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const ids = new Set();
  for (const r of list.slice(0, max)) {
    const x = fn(r);
    if (!x) continue;
    while (ids.has(x.id)) x.id = makeId(x.id[0]);
    ids.add(x.id);
    out.push(x);
  }
  return out;
}

export function sanitizeHistory(raw) {
  const out = emptyHistory();
  if (!raw || typeof raw !== 'object') return out;
  const year = new Date().getFullYear();
  out.birthYear = cleanNum(raw.birthYear, 1900, year, { int: true });
  out.sex = pick(raw.sex, SEX_IDS);
  out.onsetAge = cleanNum(raw.onsetAge, 0, 110, { int: true });
  out.diagnoses = cleanList(raw.diagnoses, 20, 80);
  out.diagYear = cleanNum(raw.diagYear, 1900, year, { int: true });
  out.diagBy = cleanStr(raw.diagBy, 120);
  out.famKnown = pick(raw.famKnown, YNU_IDS);
  out.family = out.famKnown === 'yes' ? cleanList(raw.family, 10, 40) : [];
  const t = raw.typical && typeof raw.typical === 'object' ? raw.typical : {};
  out.typical = {
    side: pick(t.side, SIDE_IDS),
    quality: cleanList(t.quality),
    areas: cleanList(t.areas),
    intensity: cleanNum(t.intensity, 1, 10, { int: true }),
    duration: pick(t.duration, TYPDUR_IDS),
    aura: pick(t.aura, AURA_IDS),
    auraTypes: cleanList(t.auraTypes),
    symptoms: cleanList(t.symptoms),
    triggers: cleanList(t.triggers),
    activity: pick(t.activity, YNU_IDS),
  };
  out.periods = sanitizeSubList(raw.periods, sanitizePeriod, 100).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  out.events = sanitizeSubList(raw.events, sanitizeEvent, 200);
  out.acute = sanitizeSubList(raw.acute, sanitizeAcute, 60);
  out.conditions = cleanList(raw.conditions, 40, 60);
  out.conditionsNote = cleanText(raw.conditionsNote, 1000);
  out.allergies = cleanText(raw.allergies, 600);
  out.otherMeds = cleanText(raw.otherMeds, 600);
  out.cycleLink = pick(raw.cycleLink, CYCLE_IDS);
  out.contraception = cleanStr(raw.contraception, 120);
  out.narrative = cleanText(raw.narrative, 12000);
  out.updatedAt = isDateTime(raw.updatedAt) ? raw.updatedAt : null;
  return out;
}

/* ---------- centro curante, visite, documenti, questionari ---------- */

export function sanitizeContact(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanStr(raw.name, 120);
  if (!name) return null;
  const email = cleanStr(raw.email, 120);
  return {
    id: uniqueId(raw.id, 'c'),
    name,
    role: pick(raw.role, ROLE_IDS, 'other'),
    org: cleanStr(raw.org, 120),
    dept: cleanStr(raw.dept, 120),
    address: cleanStr(raw.address, 200),
    phone: cleanStr(raw.phone, 40).replace(/[^0-9+()\-\s./]/g, '').trim(),
    phone2: cleanStr(raw.phone2, 40).replace(/[^0-9+()\-\s./]/g, '').trim(),
    email: RE_EMAIL.test(email) ? email : '',
    hours: cleanStr(raw.hours, 160),
    note: cleanText(raw.note, 1000),
    main: bool(raw.main),
  };
}

export function sanitizeVisit(raw) {
  if (!raw || typeof raw !== 'object' || !isDateTime(raw.at)) return null;
  return {
    id: uniqueId(raw.id, 'v'),
    at: raw.at,
    kind: pick(raw.kind, VISIT_IDS, 'other'),
    contactId: RE_CID.test(raw.contactId) ? raw.contactId : '',
    place: cleanStr(raw.place, 160),
    note: cleanText(raw.note, 1000),
    questions: cleanText(raw.questions, 2000),
    outcome: cleanText(raw.outcome, 3000),
  };
}

function sanitizeFileRef(raw) {
  if (!raw || typeof raw !== 'object' || !RE_FID.test(raw.fid)) return null;
  const type = typeof raw.type === 'string' && RE_MIME.test(raw.type) ? raw.type.toLowerCase().slice(0, 100) : 'application/octet-stream';
  return {
    fid: raw.fid,
    name: cleanStr(raw.name, 120) || 'documento',
    type,
    size: cleanNum(raw.size, 0, 2 ** 40, { int: true, fallback: 0 }),
    thumb: bool(raw.thumb),
  };
}

export function sanitizeDoc(raw) {
  if (!raw || typeof raw !== 'object' || !isDate(raw.date)) return null;
  const files = [];
  if (Array.isArray(raw.files)) {
    for (const f of raw.files.slice(0, 40)) {
      const ref = sanitizeFileRef(f);
      if (ref && !files.some((x) => x.fid === ref.fid)) files.push(ref);
    }
  }
  return {
    id: uniqueId(raw.id, 'd'),
    title: cleanStr(raw.title, 120) || 'Documento',
    date: raw.date,
    cat: pick(raw.cat, DOC_IDS, 'other'),
    contactId: RE_CID.test(raw.contactId) ? raw.contactId : '',
    note: cleanText(raw.note, 2000),
    files,
    createdAt: isDateTime(raw.createdAt) ? raw.createdAt : nowStr(),
  };
}

export function sanitizeAssessment(raw) {
  if (!raw || typeof raw !== 'object' || !isDate(raw.date)) return null;
  const q = Array.isArray(raw.q) ? raw.q : [];
  return {
    id: uniqueId(raw.id, 'm'),
    date: raw.date,
    kind: 'midas',
    q: [0, 1, 2, 3, 4].map((i) => cleanNum(q[i], 0, 92, { int: true, fallback: 0 })),
    a: cleanNum(raw.a, 0, 92, { int: true }),
    b: cleanNum(raw.b, 0, 10, { int: true }),
  };
}

export const COLLECTIONS = {
  preventives: { sanitize: sanitizePreventive, max: 200 },
  contacts: { sanitize: sanitizeContact, max: 200 },
  visits: { sanitize: sanitizeVisit, max: 2000 },
  docs: { sanitize: sanitizeDoc, max: 3000 },
  assessments: { sanitize: sanitizeAssessment, max: 500 },
};

function sanitizeCollection(list, coll) {
  const spec = COLLECTIONS[coll];
  return sanitizeSubList(list, spec.sanitize, spec.max);
}

/* ---------- meteo e impostazioni ---------- */

function sanitizeWeatherEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const p = cleanNum(raw.p, 800, 1100);
  if (p == null) return null;
  const out = { p: Math.round(p * 10) / 10 };
  [['pMin', 800, 1100], ['pMax', 800, 1100], ['t', -60, 60], ['tMin', -60, 60], ['tMax', -60, 60], ['h', 0, 100]].forEach(([k, lo, hi]) => {
    const v = cleanNum(raw[k], lo, hi);
    if (v != null) out[k] = Math.round(v * 10) / 10;
  });
  return out;
}

function sanitizeCustomMeds(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const m of v.slice(0, 100)) {
    const name = cleanStr(m && m.name, 80);
    if (name && !out.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
      out.push({ name, cls: CLASS_IDS.has(m.cls) ? m.cls : 'other', hint: '' });
    }
  }
  return out;
}

export function sanitizeSettings(raw) {
  const s = defaultSettings();
  if (!raw || typeof raw !== 'object') return s;
  if (['auto', 'light', 'dark'].includes(raw.theme)) s.theme = raw.theme;
  s.name = cleanStr(raw.name, 60);
  s.cycle = !!raw.cycle;
  s.diaryStart = isDate(raw.diaryStart) ? raw.diaryStart : null;
  s.weatherOn = !!raw.weatherOn;
  if (raw.weatherLoc && typeof raw.weatherLoc === 'object') {
    const lat = cleanNum(raw.weatherLoc.lat, -90, 90);
    const lon = cleanNum(raw.weatherLoc.lon, -180, 180);
    if (lat != null && lon != null) {
      s.weatherLoc = { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, name: cleanStr(raw.weatherLoc.name, 80) };
    }
  }
  s.assumeFree = raw.assumeFree !== false;
  if (raw.pin && typeof raw.pin === 'object' && typeof raw.pin.hash === 'string' && typeof raw.pin.salt === 'string'
    && Number.isInteger(raw.pin.iter) && raw.pin.hash.length < 200 && raw.pin.salt.length < 100) {
    s.pin = {
      hash: raw.pin.hash, salt: raw.pin.salt, iter: raw.pin.iter, len: raw.pin.len === 6 ? 6 : 4,
    };
  }
  s.lockAfter = [0, 60, 300, 900].includes(raw.lockAfter) ? raw.lockAfter : 0;
  const src = raw.hidden || {};
  const cus = raw.custom || {};
  s.hidden = { triggers: cleanList(src.triggers, 200), symptoms: cleanList(src.symptoms, 200), meds: cleanList(src.meds, 200) };
  s.custom = { triggers: cleanList(cus.triggers, 100), symptoms: cleanList(cus.symptoms, 100), meds: sanitizeCustomMeds(cus.meds) };
  s.lastBackupAt = isDateTime(raw.lastBackupAt) ? raw.lastBackupAt : null;
  s.backupRemindDays = [0, 14, 30, 60, 90].includes(raw.backupRemindDays) ? raw.backupRemindDays : 30;
  s.welcomeDone = !!raw.welcomeDone;
  s.installHintDismissed = !!raw.installHintDismissed;
  s.reminderTime = typeof raw.reminderTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.reminderTime) ? raw.reminderTime : '21:00';
  return s;
}

export function emptyDb() {
  return {
    schema: SCHEMA_VERSION,
    createdAt: nowStr(),
    settings: defaultSettings(),
    episodes: {},
    days: {},
    weather: {},
    preventives: [],
    history: emptyHistory(),
    contacts: [],
    visits: [],
    docs: [],
    assessments: [],
  };
}

export function sanitizeDb(raw) {
  const db = emptyDb();
  if (!raw || typeof raw !== 'object') return db;
  if (isDateTime(raw.createdAt)) db.createdAt = raw.createdAt;
  db.settings = sanitizeSettings(raw.settings);
  const list = Array.isArray(raw.episodes) ? raw.episodes : (raw.episodes && typeof raw.episodes === 'object' ? Object.values(raw.episodes) : []);
  for (const r of list.slice(0, 20000)) {
    const e = sanitizeEpisode(r);
    if (!e) continue;
    while (db.episodes[e.id]) e.id = newId();
    db.episodes[e.id] = e;
  }
  Object.keys(COLLECTIONS).forEach((coll) => {
    db[coll] = sanitizeCollection(raw[coll], coll);
  });
  db.history = sanitizeHistory(raw.history);
  if (raw.days && typeof raw.days === 'object') {
    for (const [date, rec] of Object.entries(raw.days).slice(0, 40000)) {
      if (!isDate(date)) continue;
      const day = sanitizeDay(rec);
      if (!isEmptyDay(day)) db.days[date] = day;
    }
  }
  if (raw.weather && typeof raw.weather === 'object') {
    for (const [date, rec] of Object.entries(raw.weather).slice(0, 40000)) {
      if (!isDate(date)) continue;
      const w = sanitizeWeatherEntry(rec);
      if (w) db.weather[date] = w;
    }
  }
  return db;
}

/* ---------- stato e persistenza ---------- */

let db = emptyDb();
let rev = 0;
let loadStatus = 'new';
let saveError = null;
let saveTimer = null;
const listeners = new Set();
const errorListeners = new Set();
const wipeListeners = new Set();

const storage = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (e) {
    return null;
  }
};

export const getDb = () => db;
export const getRev = () => rev;
export const getSettings = () => db.settings;
export const getLoadStatus = () => loadStatus;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function onSaveError(fn) {
  errorListeners.add(fn);
  return () => errorListeners.delete(fn);
}

/** Chiamato quando l'utente cancella tutti i dati (es. per svuotare l'archivio dei documenti). */
export function onWipe(fn) {
  wipeListeners.add(fn);
  return () => wipeListeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  });
}

function changed() {
  rev += 1;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 150);
  notify();
}

export function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const ls = storage();
  if (!ls) return false;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(db));
    saveError = null;
    return true;
  } catch (e) {
    saveError = e;
    errorListeners.forEach((fn) => fn(e));
    return false;
  }
}

export function load() {
  const ls = storage();
  let raw = null;
  if (ls) {
    try {
      raw = ls.getItem(STORAGE_KEY);
    } catch (e) {
      raw = null;
    }
  }
  if (!raw) {
    db = emptyDb();
    loadStatus = ls ? 'new' : 'nostorage';
    rev += 1;
    return db;
  }
  try {
    db = sanitizeDb(JSON.parse(raw));
    loadStatus = 'ok';
  } catch (e) {
    try {
      ls.setItem(`${STORAGE_KEY}.corrupt.${Date.now()}`, raw);
    } catch (e2) { /* spazio esaurito */ }
    db = emptyDb();
    loadStatus = 'corrupt';
  }
  if (loadStatus === 'ok') {
    try {
      const today = todayStr();
      if (ls.getItem(BACKUP_DATE_KEY) !== today) {
        ls.setItem(BACKUP_KEY, raw);
        ls.setItem(BACKUP_DATE_KEY, today);
      }
    } catch (e) { /* ignorato */ }
  }
  rev += 1;
  return db;
}

export function getAutoBackupInfo() {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(BACKUP_KEY);
    if (!raw) return null;
    const parsed = sanitizeDb(JSON.parse(raw));
    return { date: ls.getItem(BACKUP_DATE_KEY), episodes: Object.keys(parsed.episodes).length, db: parsed };
  } catch (e) {
    return null;
  }
}

/* ---------- attacchi e giornate ---------- */

export function upsertEpisode(input) {
  const prev = input.id ? db.episodes[input.id] : null;
  const ep = sanitizeEpisode({ ...input, createdAt: prev ? prev.createdAt : nowStr(), updatedAt: nowStr() });
  if (!ep) throw new Error('Attacco non valido');
  db.episodes[ep.id] = ep;
  for (const d of episodeDates(ep, todayStr())) {
    if (db.days[d] && db.days[d].free) {
      delete db.days[d].free;
      if (isEmptyDay(db.days[d])) delete db.days[d];
    }
  }
  changed();
  return ep;
}

export function removeEpisode(id) {
  const ep = db.episodes[id];
  if (!ep) return null;
  delete db.episodes[id];
  changed();
  return ep;
}

export function restoreEpisode(ep) {
  if (!ep) return;
  db.episodes[ep.id] = ep;
  changed();
}

export function patchDay(date, patch) {
  if (!isDate(date)) return;
  const merged = sanitizeDay({ ...(db.days[date] || {}), ...patch });
  if (isEmptyDay(merged)) delete db.days[date];
  else db.days[date] = merged;
  changed();
}

export function replaceDay(date, rec) {
  if (!isDate(date)) return;
  const clean = sanitizeDay(rec);
  if (isEmptyDay(clean)) delete db.days[date];
  else db.days[date] = clean;
  changed();
}

export function setFree(date, flag) {
  patchDay(date, { free: !!flag });
}

/* ---------- raccolte (terapie, contatti, visite, documenti, questionari) ---------- */

export function upsertRecord(coll, input) {
  const spec = COLLECTIONS[coll];
  if (!spec) throw new Error(`Raccolta sconosciuta: ${coll}`);
  const rec = spec.sanitize(input);
  if (!rec) throw new Error('Dati non validi');
  const list = db[coll];
  const i = list.findIndex((x) => x.id === rec.id);
  if (i >= 0) list[i] = rec;
  else if (list.length >= spec.max) throw new Error('Hai raggiunto il numero massimo di elementi.');
  else list.push(rec);
  changed();
  return rec;
}

export function removeRecord(coll, id) {
  const list = db[coll];
  const i = list ? list.findIndex((x) => x.id === id) : -1;
  if (i < 0) return null;
  const [removed] = list.splice(i, 1);
  changed();
  return removed;
}

export const getRecord = (coll, id) => (db[coll] || []).find((x) => x.id === id) || null;

export function upsertPreventive(input) {
  try {
    return upsertRecord('preventives', input);
  } catch (e) {
    throw new Error('Terapia non valida');
  }
}

export const removePreventive = (id) => removeRecord('preventives', id);

export function addTherapyDose(id, date) {
  const p = getRecord('preventives', id);
  if (!p || !isDate(date)) return null;
  const start = date < p.start ? date : p.start;
  return upsertRecord('preventives', { ...p, start, doses: [...p.doses, date] });
}

export function removeTherapyDose(id, date) {
  const p = getRecord('preventives', id);
  if (!p) return null;
  return upsertRecord('preventives', { ...p, doses: p.doses.filter((d) => d !== date) });
}

/* ---------- storia clinica ---------- */

export function updateHistory(patch) {
  db.history = sanitizeHistory({ ...db.history, ...patch, updatedAt: nowStr() });
  changed();
  return db.history;
}

const HISTORY_LISTS = { periods: sanitizePeriod, events: sanitizeEvent, acute: sanitizeAcute };

export function upsertHistoryItem(kind, item) {
  const fn = HISTORY_LISTS[kind];
  const rec = fn ? fn(item) : null;
  if (!rec) throw new Error('Dati non validi');
  const list = [...db.history[kind]];
  const i = list.findIndex((x) => x.id === rec.id);
  if (i >= 0) list[i] = rec;
  else list.push(rec);
  updateHistory({ [kind]: list });
  return rec;
}

export function removeHistoryItem(kind, id) {
  const list = db.history[kind] || [];
  const removed = list.find((x) => x.id === id);
  if (!removed) return null;
  updateHistory({ [kind]: list.filter((x) => x.id !== id) });
  return removed;
}

/* ---------- impostazioni ed elenchi ---------- */

export function setWeather(entries) {
  let any = false;
  for (const [date, rec] of Object.entries(entries)) {
    const w = isDate(date) ? sanitizeWeatherEntry(rec) : null;
    if (w) {
      db.weather[date] = w;
      any = true;
    }
  }
  if (any) changed();
}

export function updateSettings(patch) {
  db.settings = sanitizeSettings({ ...db.settings, ...patch });
  const ls = storage();
  if (ls) {
    try {
      ls.setItem(THEME_KEY, db.settings.theme);
    } catch (e) { /* ignorato */ }
  }
  changed();
  return db.settings;
}

export function listOptions(kind) {
  const s = db.settings;
  const hidden = new Set(s.hidden[kind]);
  if (kind === 'meds') {
    return [...DEFAULT_MEDS, ...s.custom.meds].filter((m) => !hidden.has(m.name));
  }
  const defaults = LIST_KINDS[kind].defaults();
  const extra = kind === 'triggers' && s.cycle ? CYCLE_TRIGGERS : [];
  return [...defaults, ...extra, ...s.custom[kind]].filter((x) => !hidden.has(x));
}

export function manageItems(kind) {
  const s = db.settings;
  const hidden = new Set(s.hidden[kind]);
  if (kind === 'meds') {
    return [
      ...DEFAULT_MEDS.map((m) => ({ key: m.name, label: m.name, cls: m.cls, hint: m.hint, custom: false, hidden: hidden.has(m.name) })),
      ...s.custom.meds.map((m) => ({ key: m.name, label: m.name, cls: m.cls, hint: '', custom: true, hidden: hidden.has(m.name) })),
    ];
  }
  const extra = kind === 'triggers' && s.cycle ? CYCLE_TRIGGERS : [];
  return [
    ...[...LIST_KINDS[kind].defaults(), ...extra].map((x) => ({ key: x, label: x, custom: false, hidden: hidden.has(x) })),
    ...s.custom[kind].map((x) => ({ key: x, label: x, custom: true, hidden: hidden.has(x) })),
  ];
}

export function addCustomItem(kind, item) {
  const s = db.settings;
  const label = cleanStr(kind === 'meds' ? item.name : item, 80);
  if (!label) return { ok: false, reason: 'empty' };
  const existing = manageItems(kind).find((i) => i.label.toLowerCase() === label.toLowerCase());
  const hidden = s.hidden[kind].filter((x) => x !== (existing ? existing.key : label));
  if (existing) {
    if (existing.hidden) {
      updateSettings({ hidden: { ...s.hidden, [kind]: hidden } });
      return { ok: true, label: existing.label, unhidden: true };
    }
    return { ok: false, reason: 'duplicate', label: existing.label };
  }
  const entry = kind === 'meds' ? { name: label, cls: CLASS_IDS.has(item.cls) ? item.cls : 'other', hint: '' } : label;
  updateSettings({ custom: { ...s.custom, [kind]: [...s.custom[kind], entry] } });
  return { ok: true, label };
}

export function removeCustomItem(kind, key) {
  const s = db.settings;
  const next = kind === 'meds' ? s.custom.meds.filter((m) => m.name !== key) : s.custom[kind].filter((x) => x !== key);
  updateSettings({
    custom: { ...s.custom, [kind]: next },
    hidden: { ...s.hidden, [kind]: s.hidden[kind].filter((x) => x !== key) },
  });
}

export function setItemHidden(kind, key, flag) {
  const s = db.settings;
  const rest = s.hidden[kind].filter((x) => x !== key);
  updateSettings({ hidden: { ...s.hidden, [kind]: flag ? [...rest, key] : rest } });
}

/* ---------- backup ---------- */

export const referencedFids = (source = db) => new Set(source.docs.flatMap((d) => d.files.map((f) => f.fid)));

/**
 * Serializza i dati. Senza `withDocs` la cartella dei documenti non viene inclusa
 * (i file binari vivono in IndexedDB e viaggiano solo nel backup ZIP).
 */
export function exportJson({ withDocs = false, filePaths = null } = {}) {
  const settings = { ...db.settings, pin: null };
  const data = { ...db, settings };
  if (!withDocs) delete data.docs;
  else if (filePaths) data.docs = db.docs.map((d) => ({ ...d, files: d.files.map((f) => ({ ...f, path: filePaths.get(f.fid) || null })) }));
  return JSON.stringify({
    app: 'diario-emicrania',
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    docsIncluded: !!withDocs,
    data,
  }, null, 1);
}

function payloadOf(parsed) {
  return parsed && parsed.app === 'diario-emicrania' && parsed.data ? parsed.data : parsed;
}

export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('Il file non è un backup valido (JSON non leggibile).');
  }
  const payload = payloadOf(parsed);
  if (!payload || typeof payload !== 'object' || (!payload.episodes && !payload.days)) {
    throw new Error('Il file non sembra un backup del Diario Emicrania.');
  }
  return sanitizeDb(payload);
}

/** Percorsi dei file dentro un backup ZIP: Map fid → percorso. */
export function backupFilePaths(text) {
  const out = new Map();
  try {
    const payload = payloadOf(JSON.parse(text));
    (Array.isArray(payload && payload.docs) ? payload.docs : []).forEach((d) => {
      (Array.isArray(d && d.files) ? d.files : []).forEach((f) => {
        if (f && RE_FID.test(f.fid) && typeof f.path === 'string' && f.path.length < 400) out.set(f.fid, f.path);
      });
    });
  } catch (e) { /* nessun percorso */ }
  return out;
}

/** Vero solo se il backup contiene davvero la cartella dei documenti (backup completo). */
export function backupIncludesDocs(text) {
  try {
    const parsed = JSON.parse(text);
    const payload = payloadOf(parsed);
    if (parsed && parsed.app === 'diario-emicrania' && 'docsIncluded' in parsed) return parsed.docsIncluded === true;
    return !!payload && Array.isArray(payload.docs);
  } catch (e) {
    return false;
  }
}

function tryPersist(candidate) {
  const ls = storage();
  if (!ls) return false;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(candidate));
    saveError = null;
    return true;
  } catch (e) {
    saveError = e;
    return false;
  }
}

const NO_SPACE = 'Impossibile salvare: spazio esaurito o archivio non disponibile. I dati attuali sono rimasti intatti.';

export function importReplace(incoming, { withDocs = false } = {}) {
  const settings = sanitizeSettings({ ...incoming.settings, pin: db.settings.pin, welcomeDone: true });
  const candidate = { ...incoming, settings, docs: withDocs ? incoming.docs : db.docs };
  if (!tryPersist(candidate)) throw new Error(NO_SPACE);
  db = candidate;
  changed();
}

function mergeById(target, incoming) {
  let added = 0;
  incoming.forEach((x) => {
    if (!target.some((y) => y.id === x.id)) {
      target.push(x);
      added += 1;
    }
  });
  return added;
}

function mergeHistory(cur, inc) {
  const curEmpty = !cur.updatedAt;
  const incNewer = inc.updatedAt && (!cur.updatedAt || inc.updatedAt > cur.updatedAt);
  const base = curEmpty || incNewer ? inc : cur;
  const other = base === inc ? cur : inc;
  const out = JSON.parse(JSON.stringify(base));
  ['periods', 'events', 'acute'].forEach((k) => mergeById(out[k], other[k]));
  return sanitizeHistory(out);
}

export function importMerge(incoming, { withDocs = false } = {}) {
  const next = JSON.parse(JSON.stringify(db));
  let added = 0;
  let updated = 0;
  for (const ep of Object.values(incoming.episodes)) {
    const cur = next.episodes[ep.id];
    if (!cur) {
      next.episodes[ep.id] = ep;
      added += 1;
    } else if (ep.updatedAt > cur.updatedAt) {
      next.episodes[ep.id] = ep;
      updated += 1;
    }
  }
  for (const [date, rec] of Object.entries(incoming.days)) {
    next.days[date] = sanitizeDay({ ...rec, ...(next.days[date] || {}) });
  }
  for (const [date, w] of Object.entries(incoming.weather)) {
    if (!next.weather[date]) next.weather[date] = w;
  }
  ['preventives', 'contacts', 'visits', 'assessments'].forEach((k) => mergeById(next[k], incoming[k] || []));
  const docsAdded = withDocs ? mergeById(next.docs, incoming.docs || []) : 0;
  next.history = mergeHistory(next.history, incoming.history || emptyHistory());
  if (incoming.createdAt < next.createdAt) next.createdAt = incoming.createdAt;
  if (!tryPersist(next)) throw new Error(NO_SPACE);
  db = next;
  changed();
  return { added, updated, docsAdded };
}

export function markBackupDone() {
  db.settings = sanitizeSettings({ ...db.settings, lastBackupAt: nowStr() });
  changed();
}

export function wipeAll() {
  const ls = storage();
  if (ls) {
    try {
      Object.keys(ls).filter((k) => k.startsWith('emicrania.')).forEach((k) => ls.removeItem(k));
    } catch (e) { /* ignorato */ }
  }
  clearTimeout(saveTimer);
  db = emptyDb();
  loadStatus = 'new';
  wipeListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  });
  changed();
}

export const lastSaveError = () => saveError;
