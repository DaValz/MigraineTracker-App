import { h } from './dom.js';
import * as store from './store.js';
import { toast } from './ui.js';
import { todayStr, eachDay } from './dates.js';
import { getIndex, dayStatus, episodeMinutes } from './analysis.js';
import {
  typeLabel, sideLabel, effectLabel, approxDurLabel, IMPACT_LEVELS, WORK_LEVELS, SLEEP_QUALITY_LABELS, STRESS_LABELS, MOOD_LABELS,
} from './data.js';

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, rel: 'noopener' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Apre il foglio di condivisione di iOS (Salva su File, Mail, AirDrop…); altrove scarica il file. */
export async function shareFile({ blob, filename, title = '', text = '' }) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

export async function shareText({ text, title = '' }) {
  if (navigator.share) {
    try {
      await navigator.share({ text, title });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch (e) {
    return 'failed';
  }
}

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const csvLine = (cells) => cells.map(csvCell).join(';');
const csvFile = (lines) => `\ufeff${lines.join('\r\n')}\r\n`;
const fmtDec = (n) => (n == null ? '' : String(n).replace('.', ','));
const fmtDT = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11)}` : '');
const fmtD = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

export function episodesCsv(db) {
  const rows = [csvLine([
    'Inizio', 'Fine', 'Durata (min)', 'Intensità (1-10)', 'Tipo', 'Lato', 'Zone', 'Carattere del dolore', 'Aura', 'Sintomi',
    'Fattori scatenanti', 'Farmaci', 'Impatto sulle attività', 'Lavoro/scuola', 'Rispetto a prima della terapia', 'Dose della terapia saltata', 'Note',
  ])];
  const vsLabel = { better: 'Più leggero', same: 'Come prima', worse: 'Più forte' };
  Object.values(db.episodes).sort((a, b) => (a.start < b.start ? -1 : 1)).forEach((e) => {
    const tu = e.timeUnknown;
    const meds = e.meds.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ''}${tu ? ` il ${fmtD(m.at)}` : ` alle ${m.at.slice(11)}`}${m.effect != null ? ` [${effectLabel(m.effect)}]` : ''}`).join(' | ');
    const start = tu ? `${fmtD(e.start)} (orario non ricordato)` : fmtDT(e.start);
    let end = e.end ? fmtDT(e.end) : 'in corso';
    if (tu) end = e.approxDur === 'days' ? fmtD(e.end) : (approxDurLabel(e.approxDur) || '');
    const tx = e.tx || {};
    rows.push(csvLine([
      start, end, episodeMinutes(e) == null ? '' : episodeMinutes(e), e.intensity, typeLabel(e.type), sideLabel(e.side),
      e.areas.join(', '), e.quality.join(', '), e.aura.join(', '), e.symptoms.join(', '), e.triggers.join(', '), meds,
      (IMPACT_LEVELS.find((l) => l.v === e.impact) || {}).label || '', (WORK_LEVELS.find((l) => l.v === e.work) || {}).label || '',
      vsLabel[tx.vs] || '', tx.missed === true ? 'sì' : (tx.missed === false ? 'no' : ''), e.note,
    ]));
  });
  return csvFile(rows);
}

export function daysCsv(db) {
  const today = todayStr();
  const idx = getIndex(db, store.getRev(), today);
  const rows = [csvLine([
    'Data', 'Stato', 'Sonno (ore)', 'Qualità del sonno', 'Stress', 'Umore', 'Acqua (bicchieri)', 'Caffè', 'Alcolici', 'Pasto saltato', 'Attività fisica',
    'Mestruazioni', 'Pressione media (hPa)', 'Temperatura media (°C)', 'Umidità media (%)', 'Note',
  ])];
  const labels = { migraine: 'Emicrania', free: 'Senza emicrania (confermato)', assumed: 'Senza emicrania', unknown: 'Non registrato' };
  eachDay(idx.trackingStart, today).forEach((d) => {
    const rec = db.days[d] || {};
    const w = db.weather[d] || {};
    rows.push(csvLine([
      fmtD(d), labels[dayStatus(idx, db, d)] || '', fmtDec(rec.sleepH), rec.sleepQ ? SLEEP_QUALITY_LABELS[rec.sleepQ - 1] : '', rec.stress ? STRESS_LABELS[rec.stress - 1] : '',
      rec.mood ? MOOD_LABELS[rec.mood - 1] : '', rec.water ?? '', rec.caffeine ?? '', rec.alcohol ?? '', rec.skippedMeal ? 'sì' : '', rec.exercise ? 'sì' : '',
      rec.menses ? 'sì' : '', fmtDec(w.p == null ? null : Math.round(w.p * 10) / 10), fmtDec(w.t == null ? null : Math.round(w.t * 10) / 10), fmtDec(w.h == null ? null : Math.round(w.h)), rec.note || '',
    ]));
  });
  return csvFile(rows);
}

export async function exportCsv(kind) {
  const db = store.getDb();
  const text = kind === 'days' ? daysCsv(db) : episodesCsv(db);
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const name = kind === 'days' ? 'giornate' : 'attacchi';
  return shareFile({ blob, filename: `diario-emicrania-${name}-${todayStr()}.csv`, title: `Diario Emicrania - ${name}` });
}

export function buildReminderIcs(time = '21:00', now = new Date()) {
  const [hh, mm] = time.split(':');
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  const day = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Diario Emicrania//IT',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:diario-emicrania-promemoria@app',
    `DTSTAMP:${stamp}`,
    `DTSTART:${day}T${hh}${mm}00`,
    'DURATION:PT10M',
    'RRULE:FREQ=DAILY',
    'SUMMARY:Come stai oggi? Aggiorna il Diario Emicrania',
    'DESCRIPTION:Registra la giornata nel diario dell\'emicrania.',
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Diario Emicrania: come stai oggi?',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export async function exportReminder(time) {
  const blob = new Blob([buildReminderIcs(time)], { type: 'text/calendar' });
  return shareFile({ blob, filename: 'promemoria-diario-emicrania.ics', title: 'Promemoria Diario Emicrania' });
}

const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function foldIcs(line) {
  if (line.length <= 73) return line;
  const out = [];
  let rest = line;
  out.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length) {
    out.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  return out.join('\r\n');
}

/** Evento singolo per il Calendario (visite, somministrazioni). `at` = YYYY-MM-DDTHH:MM oppure `date` + allDay. */
export function buildEventIcs({
  uid, title, date = null, at = null, allDay = false, durationMin = 60, description = '', location = '', now = new Date(),
}) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Diario Emicrania//IT', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${String(uid).replace(/[^\w.-]/g, '')}@diario-emicrania`, `DTSTAMP:${stamp}`];
  if (allDay || !at) {
    const d = (date || at).slice(0, 10);
    const next = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)) + 1);
    lines.push(`DTSTART;VALUE=DATE:${d.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`);
  } else {
    lines.push(`DTSTART:${at.slice(0, 10).replace(/-/g, '')}T${at.slice(11, 13)}${at.slice(14, 16)}00`, `DURATION:PT${Math.max(5, Math.round(durationMin))}M`);
  }
  lines.push(`SUMMARY:${icsText(title)}`);
  if (description) lines.push(`DESCRIPTION:${icsText(description)}`);
  if (location) lines.push(`LOCATION:${icsText(location)}`);
  lines.push('BEGIN:VALARM', allDay || !at ? 'TRIGGER:-PT15H' : 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', '');
  return lines.map(foldIcs).join('\r\n');
}

export async function exportEventIcs(opts) {
  const blob = new Blob([buildEventIcs(opts)], { type: 'text/calendar' });
  const r = await shareFile({ blob, filename: 'evento-diario-emicrania.ics', title: opts.title });
  if (r === 'shared') toast('Scegli «Calendario» per aggiungerlo');
  return r;
}
