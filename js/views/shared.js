import { h } from '../dom.js';
import { icon } from '../icons.js';
import { typeLabel, intensityColor, approxDurLabel } from '../data.js';
import {
  fmtDateTime, formatDuration, fmtDayMonth, fmtDateMedium, capitalize,
} from '../dates.js';
import { episodeMinutes, isOngoing } from '../analysis.js';

export function episodeWhen(ep) {
  if (ep.timeUnknown) {
    const day = capitalize(fmtDateMedium(ep.start.slice(0, 10)));
    const multi = ep.end && ep.end.slice(0, 10) !== ep.start.slice(0, 10) ? ` → ${fmtDayMonth(ep.end.slice(0, 10))}` : '';
    const dur = ep.approxDur && ep.approxDur !== 'days' ? approxDurLabel(ep.approxDur).toLowerCase() : '';
    return [`${day}${multi}`, 'orario non ricordato', dur].filter(Boolean).join(' · ');
  }
  return `${fmtDateTime(ep.start)} · ${isOngoing(ep) ? 'in corso' : formatDuration(episodeMinutes(ep))}`;
}

export function episodeCard(ep, { onClick } = {}) {
  const ongoing = isOngoing(ep);
  const extras = [];
  if (ep.meds.length) extras.push(ep.meds.map((m) => m.name).join(', '));
  if (ep.triggers.length) extras.push(ep.triggers.slice(0, 3).join(', '));
  const meta2 = extras.join(' · ');
  return h(
    'button',
    { type: 'button', class: 'ep-card', onclick: onClick },
    h('span', { class: `ep-badge${ep.intensity >= 7 ? ' hi' : ''}`, style: { '--c': intensityColor(ep.intensity) }, 'aria-label': `Intensità ${ep.intensity} su 10` }, String(ep.intensity)),
    h(
      'span',
      { class: 'ep-info' },
      h('span', { class: 'ep-title' }, typeLabel(ep.type) || 'Mal di testa', ongoing ? [' ', h('span', { class: 'pill live' }, 'In corso')] : null),
      h('span', { class: 'ep-meta', style: { display: 'block' } }, episodeWhen(ep)),
      meta2 ? h('span', { class: 'ep-meta', style: { display: 'block' } }, meta2) : null,
    ),
    icon('chevron-right', 18, 'chev'),
  );
}

export const monthHeader = (label, right = '') => h('div', { class: 'month-head' }, h('span', {}, label), h('span', {}, right));

export function describeCheckin(rec, { stressLabels, sleepLabels, moodLabels, faces }) {
  const out = [];
  if (!rec) return out;
  if (rec.sleepH != null) out.push(`Sonno ${String(rec.sleepH).replace('.', ',')} h${rec.sleepQ ? ` (${sleepLabels[rec.sleepQ - 1].toLowerCase()})` : ''}`);
  else if (rec.sleepQ) out.push(`Sonno ${sleepLabels[rec.sleepQ - 1].toLowerCase()}`);
  if (rec.stress) out.push(`Stress ${stressLabels[rec.stress - 1].toLowerCase()}`);
  if (rec.mood) out.push(`Umore ${faces[rec.mood - 1]} ${moodLabels[rec.mood - 1].toLowerCase()}`);
  if (rec.water != null) out.push(`Acqua: ${rec.water} bicchieri`);
  if (rec.caffeine != null) out.push(`Caffè: ${rec.caffeine}`);
  if (rec.alcohol != null) out.push(`Alcol: ${rec.alcohol}`);
  if (rec.skippedMeal) out.push('Pasto saltato');
  if (rec.exercise) out.push('Attività fisica');
  if (rec.menses) out.push('Mestruazioni');
  return out;
}

export const shortDate = (d) => fmtDayMonth(d);
