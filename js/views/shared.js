import { h } from '../dom.js';
import { icon } from '../icons.js';
import { typeLabel, intensityColor, approxDurLabel } from '../data.js';
import {
  fmtDateTime, formatDuration, fmtDayMonth, fmtDateMedium, capitalize,
} from '../dates.js';
import { episodeMinutes, isOngoing } from '../analysis.js';
import { t, tv } from '../i18n.js';
import { num } from '../format.js';

export function episodeWhen(ep) {
  if (ep.timeUnknown) {
    const day = capitalize(fmtDateMedium(ep.start.slice(0, 10)));
    const multi = ep.end && ep.end.slice(0, 10) !== ep.start.slice(0, 10) ? ` → ${fmtDayMonth(ep.end.slice(0, 10))}` : '';
    const dur = ep.approxDur && ep.approxDur !== 'days' ? approxDurLabel(ep.approxDur).toLowerCase() : '';
    return [`${day}${multi}`, t('orario non ricordato'), dur].filter(Boolean).join(' · ');
  }
  return `${fmtDateTime(ep.start)} · ${isOngoing(ep) ? t('in corso') : formatDuration(episodeMinutes(ep))}`;
}

export function episodeCard(ep, { onClick } = {}) {
  const ongoing = isOngoing(ep);
  const extras = [];
  if (ep.meds.length) extras.push(ep.meds.map((m) => tv(m.name)).join(', '));
  if (ep.triggers.length) extras.push(ep.triggers.slice(0, 3).map((x) => tv(x)).join(', '));
  const meta2 = extras.join(' · ');
  return h(
    'button',
    { type: 'button', class: 'ep-card', onclick: onClick },
    h('span', { class: `ep-badge${ep.intensity >= 7 ? ' hi' : ''}`, style: { '--c': intensityColor(ep.intensity) }, 'aria-label': t('Intensità {n} su 10', { n: ep.intensity }) }, String(ep.intensity)),
    h(
      'span',
      { class: 'ep-info' },
      h('span', { class: 'ep-title' }, typeLabel(ep.type) || t('Mal di testa'), ongoing ? [' ', h('span', { class: 'pill live' }, t('In corso'))] : null),
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
  if (rec.sleepH != null) {
    const ore = num(rec.sleepH, 2);
    out.push(rec.sleepQ ? t('Sonno {ore} h ({qualita})', { ore, qualita: sleepLabels[rec.sleepQ - 1].toLowerCase() }) : t('Sonno {ore} h', { ore }));
  } else if (rec.sleepQ) out.push(t('Sonno {qualita}', { qualita: sleepLabels[rec.sleepQ - 1].toLowerCase() }));
  if (rec.stress) out.push(t('Stress {livello}', { livello: stressLabels[rec.stress - 1].toLowerCase() }));
  if (rec.mood) out.push(t('Umore {faccia} {livello}', { faccia: faces[rec.mood - 1], livello: moodLabels[rec.mood - 1].toLowerCase() }));
  if (rec.water != null) out.push(t('{n, plural, one {Acqua: # bicchiere} other {Acqua: # bicchieri}}', { n: rec.water }));
  if (rec.caffeine != null) out.push(t('Caffè: {n}', { n: rec.caffeine }));
  if (rec.alcohol != null) out.push(t('Alcol: {n}', { n: rec.alcohol }));
  if (rec.skippedMeal) out.push(t('Pasto saltato'));
  if (rec.exercise) out.push(t('Attività fisica'));
  if (rec.menses) out.push(t('Mestruazioni'));
  return out;
}

export const shortDate = (d) => fmtDayMonth(d);
