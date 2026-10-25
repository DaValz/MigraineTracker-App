import { locale, lang } from './i18n.js';

/** Prima lettera minuscola per inserire un'etichetta in una frase (in tedesco i sostantivi restano maiuscoli; le sigle restano intatte). */
export const lcFirst = (s) => (s && lang !== 'de' ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** Percentuale (p = 0.45 → "45%"), con il formato della lingua corrente. */
export const pct = (p, digits = 0) => new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number((p * 100).toFixed(digits)) / 100);

export function num(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n);
}

export function bytes(n) {
  if (n < 1024) return `${n} B`; // i18n-ignore
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`; // i18n-ignore
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n / 1048576)} MB`; // i18n-ignore
}

export function safeFileName(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'file';
}
