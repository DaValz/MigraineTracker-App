export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const pct = (p, digits = 0) => `${(p * 100).toFixed(digits).replace('.', ',')}%`;

export function num(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: digits }).format(n);
}

export function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export function safeFileName(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'file';
}
