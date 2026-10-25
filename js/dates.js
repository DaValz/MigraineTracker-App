import { locale as LOCALE, t } from './i18n.js';

export const pad = (n) => String(n).padStart(2, '0');

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toDateTimeStr(d) {
  return `${toDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDate(s) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function parseDateTime(s) {
  const [dp, tp = '00:00'] = s.split('T');
  const [y, m, d] = dp.split('-').map(Number);
  const [hh, mm] = tp.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export const todayStr = () => toDateStr(new Date());
export const nowStr = () => toDateTimeStr(new Date());

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function minutesBetween(a, b) {
  return Math.round((parseDateTime(b) - parseDateTime(a)) / 60000);
}

export function addMinutes(dt, n) {
  const d = parseDateTime(dt);
  d.setMinutes(d.getMinutes() + n);
  return toDateTimeStr(d);
}

export function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Lunedì = 0 … domenica = 6 */
export function weekdayMon(s) {
  return (parseDate(s).getDay() + 6) % 7;
}

export function startOfWeek(s) {
  return addDays(s, -weekdayMon(s));
}

export const monthOf = (s) => s.slice(0, 7);
export const monthStart = (m) => `${m}-01`;

export function addMonths(m, n) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthEnd(m) {
  const [y, mo] = m.split('-').map(Number);
  return toDateStr(new Date(y, mo, 0));
}

export function daysInMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).getDate();
}

export function monthsBetween(fromMonth, toMonth) {
  const out = [];
  for (let m = fromMonth; m <= toMonth; m = addMonths(m, 1)) out.push(m);
  return out;
}

const fmtCache = new Map();
function formatter(opts) {
  const key = JSON.stringify(opts);
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.DateTimeFormat(LOCALE, opts));
  return fmtCache.get(key);
}

export const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const asDate = (v) => (v instanceof Date ? v : v.length > 10 ? parseDateTime(v) : parseDate(v));

export function fmt(v, opts) {
  return formatter(opts).format(asDate(v));
}

export const fmtDateLong = (v) => capitalize(fmt(v, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
export const fmtDateMedium = (v) => fmt(v, { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtDateShort = (v) => fmt(v, { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtDayMonth = (v) => fmt(v, { day: 'numeric', month: 'short' });
export const fmtMonthYear = (m) => capitalize(fmt(`${m}-01`, { month: 'long', year: 'numeric' }));
export const fmtMonthShort = (m) => fmt(`${m}-01`, { month: 'short' }).replace('.', '');
export const fmtTime = (v) => `${pad(asDate(v).getHours())}:${pad(asDate(v).getMinutes())}`;
export const fmtDateTime = (v) => `${fmtDateMedium(v)}, ${fmtTime(v)}`;

const weekdayNames = (style) => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(LOCALE, { weekday: style }).format(new Date(2024, 0, 1 + i)));
// 1 gennaio 2024 e' un lunedi': le liste partono da lunedi'.
export const WEEKDAYS_SHORT = weekdayNames('short').map((s) => capitalize(s.replace('.', '')));
export const WEEKDAYS_LETTER = weekdayNames('narrow').map((s) => s.toUpperCase());
export const WEEKDAYS_LONG = weekdayNames('long');

export function formatDuration(min) {
  if (min == null || !Number.isFinite(min)) return '—';
  const total = Math.max(0, Math.round(min));
  const d = Math.floor(total / 1440);
  const hh = Math.floor((total % 1440) / 60);
  const mm = total % 60;
  if (d) return hh ? t('{d} g {h} h', { d, h: hh }) : t('{d} g', { d });
  if (hh) return mm ? t('{h} h {m} min', { h: hh, m: mm }) : t('{h} h', { h: hh });
  return t('{m} min', { m: mm });
}

export function relativeDay(date, today = todayStr()) {
  const diff = diffDays(today, date);
  if (diff === 0) return t('Oggi');
  if (diff === -1) return t('Ieri');
  if (diff === 1) return t('Domani');
  return capitalize(fmtDateMedium(date));
}

export function fmtNumber(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }).format(n);
}
