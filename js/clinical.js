/**
 * Analisi "cliniche": stime dalla storia raccontata, efficacia delle terapie di prevenzione,
 * andamento a lungo termine, questionario MIDAS e sintesi clinica in stile anamnesi.
 * Tutto è calcolato sul telefono, con regole esplicite e prudenti: non è una diagnosi.
 */
import {
  addDays, diffDays, eachDay, monthOf, monthStart, monthEnd, monthsBetween, addMonths, daysInMonth, fmtMonthShort,
  fmtDateShort, fmt, capitalize, formatDuration,
} from './dates.js';
import {
  rangeStats, episodesInRange, dateOf, buckets, medStats, countLabels, countField, mohStatus, mean, median, episodeMinutes,
  dayStatus,
} from './analysis.js';
import {
  therapyClass, stopReasonLabel, midasGrade, sideLabel, typeLabel, effectLabel, SEXES, TYPICAL_DURATIONS, AURA_FREQ,
  CYCLE_LINK, THERAPY_RATINGS,
} from './data.js';
import { num, pct, plural } from './format.js';

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const lc = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const joinList = (items) => {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;
};

export const fmtMonth = (m) => fmt(`${m}-01`, { month: 'short', year: 'numeric' }).replace('.', '');

export function fmtFuzzyDate(s) {
  if (!s) return '';
  if (s.length === 4) return s;
  if (s.length === 7) return fmtMonth(s);
  return fmt(s, { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
}

export function fmtMonthRange(from, to, { current = null } = {}) {
  if (!to) return `da ${fmtMonth(from)}${current === false ? '' : ' a oggi'}`;
  if (from === to) return fmtMonth(from);
  return `${fmtMonth(from)} – ${fmtMonth(to)}`;
}

/* ---------- stime e tassi ---------- */

/** Frequenza dal diario normalizzata su 30 giorni; null se i giorni registrati sono troppo pochi. */
export function diaryRate(idx, db, from, to, minTracked = 28) {
  if (!from || !to || to < from) return null;
  const s = rangeStats(idx, db, from, to);
  if (s.trackedDays < minTracked) return null;
  const k = 30 / s.trackedDays;
  const lo = from < idx.trackingStart ? idx.trackingStart : from;
  return {
    source: 'diary',
    from: lo,
    to: to > idx.today ? idx.today : to,
    days: s.migraineDays * k,
    attacks: s.attacks * k,
    acute: s.acuteMedDays * k,
    intensity: s.avgIntensity,
    tracked: s.trackedDays,
  };
}

/** Media pesata dei periodi raccontati nella storia che si sovrappongono all'intervallo. */
export function historyEstimate(history, fromDate, toDate, today) {
  if (!history || !history.periods || !history.periods.length) return null;
  const fm = monthOf(fromDate);
  const tm = monthOf(toDate);
  const cur = monthOf(today);
  const hits = [];
  history.periods.forEach((p) => {
    const pTo = p.to || cur;
    const lo = p.from > fm ? p.from : fm;
    const hi = pTo < tm ? pTo : tm;
    if (lo <= hi) hits.push({ p, w: monthsBetween(lo, hi).length });
  });
  if (!hits.length) return null;
  const wavg = (key) => {
    const xs = hits.filter((x) => x.p[key] != null);
    const ws = sum(xs.map((x) => x.w));
    return ws ? sum(xs.map((x) => x.p[key] * x.w)) / ws : null;
  };
  return {
    source: 'history', days: wavg('days'), intensity: wavg('intensity'), acute: wavg('acute'), attacks: null, periods: hits.map((x) => x.p),
  };
}

/* ---------- terapie ---------- */

export const isInjectable = (p) => (p.every || 0) >= 14 || !!therapyClass(p.cls).inject;

export function activeTherapies(db, date) {
  return db.preventives.filter((p) => p.start <= date && (!p.end || p.end >= date));
}

/** Date delle somministrazioni: quelle registrate o, in mancanza, il calendario teorico. */
export function doseAnchors(p, today) {
  const last = p.end && p.end < today ? p.end : today;
  if (p.doses && p.doses.length) return p.doses.filter((d) => d <= last);
  if (!(p.every > 0) || p.start > last) return [];
  const out = [];
  for (let d = p.start; d <= last && out.length < 400; d = addDays(d, p.every)) out.push(d);
  return out;
}

export function nextDose(p, today) {
  if (!(p.every > 0) || (p.end && p.end < today)) return null;
  const fromSchedule = !(p.doses && p.doses.length);
  // Con il solo calendario previsto, la data di oggi non è ancora «fatta».
  const anchors = doseAnchors(p, fromSchedule ? addDays(today, -1) : today);
  const last = anchors.length ? anchors[anchors.length - 1] : null;
  const next = last ? addDays(last, p.every) : p.start;
  const daysLeft = diffDays(today, next);
  return {
    last, next, daysLeft, fromSchedule, status: daysLeft < 0 ? 'overdue' : daysLeft <= 3 ? 'due' : 'ok',
  };
}

export function cycleDay(p, date) {
  const anchors = doseAnchors(p, date);
  if (!anchors.length) return null;
  const last = anchors[anchors.length - 1];
  return { last, day: diffDays(last, date), number: anchors.length };
}

function therapyMonthly(idx, db, p, today) {
  const end = p.end && p.end < today ? p.end : today;
  let fromM = monthOf(addDays(p.start, -90));
  const toM = monthOf(end);
  if (monthsBetween(fromM, toM).length > 30) fromM = addMonths(toM, -29);
  const lo = monthStart(fromM) < idx.trackingStart ? idx.trackingStart : monthStart(fromM);
  if (lo > end) return [];
  const bs = buckets(idx, db, lo, end, 'month');
  return bs.map((b) => {
    if (b.tracked < 10) return { month: b.month, label: b.label, value: null };
    const partial = b.tracked < daysInMonth(b.month) - 2;
    const eps = episodesInRange(idx, b.from, b.to).filter((e) => dateOf(e.start) >= idx.trackingStart);
    return {
      month: b.month,
      label: b.label,
      value: partial ? (b.migraineDays / b.tracked) * 30 : b.migraineDays,
      partial,
      intensity: mean(eps.map((e) => e.intensity)),
      during: monthEnd(b.month) >= p.start && monthStart(b.month) <= end,
    };
  });
}

/** Andamento dentro il ciclo di un farmaco iniettivo (effetto "fine ciclo"). */
export function cycleAnalysis(idx, db, p, today) {
  if (!(p.every >= 14)) return null;
  const anchors = doseAnchors(p, today);
  if (anchors.length < 2) return null;
  const end = p.end && p.end < today ? p.end : today;
  const W = Math.max(2, Math.round(p.every / 7));
  const tracked = new Array(W + 1).fill(0);
  const mig = new Array(W + 1).fill(0);
  let complete = 0;
  anchors.forEach((a, i) => {
    const segEnd = i + 1 < anchors.length ? addDays(anchors[i + 1], -1) : end;
    if (i + 1 < anchors.length) complete += 1;
    if (segEnd < a) return;
    for (const d of eachDay(a, segEnd)) {
      if (d < idx.trackingStart || d > idx.today) continue;
      const st = dayStatus(idx, db, d);
      if (st !== 'migraine' && st !== 'free' && st !== 'assumed') continue;
      const k = Math.min(W, Math.floor(diffDays(a, d) / 7));
      tracked[k] += 1;
      if (st === 'migraine') mig[k] += 1;
    }
  });
  const weeks = tracked.map((t, k) => ({
    week: k + 1, label: k < W ? `${k + 1}ª` : 'Oltre', tracked: t, days: mig[k], rate: t >= 5 ? (mig[k] / t) * 7 : null,
  })).filter((w, k) => k < W || w.tracked > 0);
  const valid = weeks.slice(0, W).filter((w) => w.rate != null);
  if (complete < 2 || valid.length < Math.min(W, 3)) return { weeks, complete, wearingOff: false, enough: false };
  const half = Math.max(1, Math.floor(W / 2));
  const firstRates = weeks.slice(0, half).map((w) => w.rate).filter((r) => r != null);
  const lastW = weeks[W - 1];
  const first = mean(firstRates);
  const lastRate = lastW ? lastW.rate : null;
  const wearingOff = first != null && lastRate != null && lastRate >= first * 1.5 && lastRate - first >= 0.5;
  return {
    weeks, complete, enough: true, wearingOff, firstRate: first, lastRate,
  };
}

export const RESPONSES = {
  good: { label: 'Risposta buona', desc: 'riduzione di almeno il 50%', tone: 'green' },
  partial: { label: 'Risposta parziale', desc: 'riduzione tra il 30 e il 49%', tone: 'teal' },
  low: { label: 'Poca differenza', desc: 'variazione sotto il 30%', tone: 'orange' },
  worse: { label: 'Peggioramento', desc: 'più giorni di prima', tone: 'red' },
};

export function therapyOutcome(idx, db, p, today) {
  const end = p.end && p.end < today ? p.end : today;
  const started = p.start <= today;
  const bFrom = addDays(p.start, -90);
  const bTo = addDays(p.start, -1);
  let baseline = diaryRate(idx, db, bFrom, bTo);
  if (baseline) baseline.label = 'dal diario dei 3 mesi prima';
  if (!baseline && p.baseDays != null) {
    baseline = {
      source: 'manual', days: p.baseDays, intensity: p.baseInt, acute: null, attacks: null, label: 'valore indicato da te',
    };
  }
  if (!baseline) {
    const est = historyEstimate(db.history, bFrom, bTo, today);
    if (est && est.days != null) baseline = { ...est, label: 'stima dalla tua storia' };
  }
  if (baseline && baseline.intensity == null && p.baseInt != null) baseline.intensity = p.baseInt;

  let during = null;
  let overall = null;
  if (started && end >= p.start) {
    const recentFrom = addDays(end, -89) > p.start ? addDays(end, -89) : p.start;
    during = diaryRate(idx, db, recentFrom, end);
    overall = diaryRate(idx, db, p.start, end);
    if (during) {
      during.label = recentFrom === p.start ? 'dall’inizio della terapia' : 'ultimi 3 mesi di terapia';
    } else {
      const est = historyEstimate(db.history, p.start, end, today);
      if (est && est.days != null) during = { ...est, label: 'stima dalla tua storia' };
    }
  }

  let change = null;
  let response = null;
  if (baseline && during && baseline.days != null && during.days != null) {
    const daysPct = baseline.days > 0 ? (during.days - baseline.days) / baseline.days : null;
    change = {
      days: during.days - baseline.days,
      daysPct,
      intensity: baseline.intensity != null && during.intensity != null ? during.intensity - baseline.intensity : null,
      acutePct: baseline.acute && during.acute != null ? (during.acute - baseline.acute) / baseline.acute : null,
    };
    if (daysPct != null) response = daysPct <= -0.5 ? 'good' : daysPct <= -0.3 ? 'partial' : daysPct <= 0.1 ? 'low' : 'worse';
  }

  const eps = started ? idx.episodes.filter((e) => dateOf(e.start) >= p.start && dateOf(e.start) <= end) : [];
  const vs = {
    better: 0, same: 0, worse: 0, rated: 0, missed: 0, total: eps.length,
  };
  eps.forEach((e) => {
    if (e.tx && e.tx.vs) {
      vs[e.tx.vs] += 1;
      vs.rated += 1;
    }
    if (e.tx && e.tx.missed) vs.missed += 1;
  });

  return {
    baseline,
    during,
    overall,
    change,
    response,
    early: started && diffDays(p.start, end) < 84,
    vs,
    monthly: started ? therapyMonthly(idx, db, p, today) : [],
    cycle: started ? cycleAnalysis(idx, db, p, today) : null,
    ongoing: !p.end || p.end >= today,
    end,
    weeks: started ? Math.max(0, Math.floor(diffDays(p.start, end) / 7)) : 0,
  };
}

export function outcomeLine(o) {
  if (!o || !o.baseline || !o.during || o.change == null || o.change.daysPct == null) return '';
  return `${num(o.baseline.days)} → ${num(o.during.days)} giorni/mese (${o.change.daysPct > 0 ? '+' : '−'}${pct(Math.abs(o.change.daysPct))})`;
}

export function therapyPeriodText(p, today) {
  const dur = diffDays(p.start, p.end && p.end < today ? p.end : today);
  const months = Math.round(dur / 30.4);
  const span = months >= 2 ? `${months} mesi` : plural(Math.max(1, Math.round(dur / 7)), 'settimana', 'settimane');
  if (p.start > today) return `inizia il ${fmtDateShort(p.start)}`;
  if (!p.end || p.end >= today) return `dal ${fmtDateShort(p.start)} · in corso da ${span}`;
  return `dal ${fmtDateShort(p.start)} al ${fmtDateShort(p.end)} · ${span}`;
}

/* ---------- andamento a lungo termine ---------- */

function aggregate(points, unit) {
  const groups = new Map();
  points.forEach((pt) => {
    const y = pt.month.slice(0, 4);
    const q = Math.floor((Number(pt.month.slice(5)) - 1) / 3) + 1;
    const key = unit === 'year' ? y : `${y}-Q${q}`;
    if (!groups.has(key)) groups.set(key, { key, label: unit === 'year' || q === 1 ? y : '', title: unit === 'year' ? y : `${q}° trimestre ${y}`, from: pt.month, to: pt.month, items: [] });
    const g = groups.get(key);
    g.to = pt.month;
    g.items.push(pt);
  });
  return [...groups.values()].map((g) => {
    const vals = g.items.filter((x) => x.value != null);
    const diary = vals.filter((x) => x.source === 'diary');
    const use = diary.length ? diary : vals;
    return {
      month: g.from,
      to: g.to,
      label: g.label,
      title: g.title,
      value: use.length ? mean(use.map((x) => x.value)) : null,
      intensity: mean(use.map((x) => x.intensity).filter((x) => x != null)),
      source: diary.length ? 'diary' : (vals.length ? 'history' : null),
    };
  });
}

export function longTermSeries(idx, db, today, { spanMonths = null } = {}) {
  const cur = monthOf(today);
  let first = monthOf(idx.trackingStart);
  db.history.periods.forEach((p) => { if (p.from < first) first = p.from; });
  db.preventives.forEach((p) => {
    const m = monthOf(p.start);
    if (m < first) first = m;
  });
  const floor = addMonths(cur, -(spanMonths ? spanMonths - 1 : 239));
  const fullFrom = first;
  if (first < floor) first = floor;
  const months = monthsBetween(first, cur);
  const lo = monthStart(first) < idx.trackingStart ? idx.trackingStart : monthStart(first);
  const byMonth = new Map(lo <= today ? buckets(idx, db, lo, today, 'month').map((b) => [b.month, b]) : []);
  let points = months.map((m) => {
    const b = byMonth.get(m);
    if (b && b.tracked >= 10) {
      const partial = b.tracked < daysInMonth(m) - 2;
      const eps = episodesInRange(idx, b.from, b.to).filter((e) => dateOf(e.start) >= idx.trackingStart);
      return {
        month: m, label: fmtMonthShort(m), value: partial ? (b.migraineDays / b.tracked) * 30 : b.migraineDays, partial, intensity: mean(eps.map((e) => e.intensity)), source: 'diary',
      };
    }
    const est = historyEstimate(db.history, monthStart(m), monthEnd(m), today);
    if (est && est.days != null) {
      return {
        month: m, label: fmtMonthShort(m), value: est.days, intensity: est.intensity, source: 'history',
      };
    }
    return {
      month: m, label: fmtMonthShort(m), value: null, intensity: null, source: null,
    };
  });
  while (points.length > 1 && points[0].value == null) points.shift();
  let unit = 'month';
  if (points.length > 66) {
    unit = points.length > 180 ? 'year' : 'quarter';
    points = aggregate(points, unit);
  }
  const startM = points.length ? points[0].month : cur;
  const therapies = db.preventives
    .filter((p) => monthOf(p.start) <= cur && (!p.end || monthOf(p.end) >= startM))
    .sort((a, b) => (a.start < b.start ? -1 : 1));
  return {
    unit,
    points,
    therapies,
    from: startM,
    to: cur,
    totalMonths: monthsBetween(fullFrom, cur).length,
    hasDiary: points.some((p) => p.source === 'diary'),
    hasHistory: points.some((p) => p.source === 'history'),
  };
}

/* ---------- MIDAS ---------- */

export const midasScore = (a) => sum(a.q || []);

export function midasSeries(db) {
  return [...db.assessments].sort((a, b) => (a.date < b.date ? -1 : 1)).map((a) => {
    const score = midasScore(a);
    return { ...a, score, grade: midasGrade(score) };
  });
}

/* ---------- completezza della storia ---------- */

export function historySections(db) {
  const h = db.history;
  const t = h.typical;
  return [
    { id: 'profile', done: h.onsetAge != null || h.birthYear != null || h.diagnoses.length > 0 || !!h.sex },
    { id: 'typical', done: t.intensity != null || t.quality.length > 0 || !!t.duration || t.symptoms.length > 0 },
    { id: 'periods', done: h.periods.length > 0 },
    { id: 'therapies', done: db.preventives.length > 0 },
    { id: 'events', done: h.events.length > 0 },
    { id: 'health', done: h.conditions.length > 0 || !!h.allergies || !!h.otherMeds || !!h.famKnown || !!h.cycleLink },
    { id: 'narrative', done: h.narrative.length > 20 },
  ];
}

export function historyCompleteness(db) {
  const s = historySections(db);
  return { done: s.filter((x) => x.done).length, total: s.length };
}

/* ---------- sintesi clinica ---------- */

const sexLabel = (id) => (SEXES.find((s) => s.id === id) || {}).label || '';
const labelOf = (list, id) => (list.find((x) => x.id === id) || {}).label || '';

function profileBlock(db, today) {
  const h = db.history;
  const year = Number(today.slice(0, 4));
  const age = h.birthYear ? year - h.birthYear : null;
  const parts = [];
  const who = [h.sex && h.sex !== 'x' ? sexLabel(h.sex) : '', age != null ? `${age} anni` : ''].filter(Boolean).join(', ');
  if (who) parts.push(`${who}.`);
  if (h.onsetAge != null) {
    const years = age != null && age >= h.onsetAge ? age - h.onsetAge : null;
    parts.push(`Mal di testa dall’età di ${h.onsetAge} anni${years != null ? ` (circa ${plural(years, 'anno', 'anni')} di storia)` : ''}.`);
  }
  if (h.diagnoses.length) {
    const extra = [h.diagYear ? String(h.diagYear) : '', h.diagBy].filter(Boolean).join(', ');
    parts.push(`Diagnosi riferite: ${h.diagnoses.map(lc).join(', ')}${extra ? ` (${extra})` : ''}.`);
  }
  if (h.famKnown === 'yes') parts.push(`Familiarità per cefalea${h.family.length ? `: ${h.family.map(lc).join(', ')}` : ''}.`);
  else if (h.famKnown === 'no') parts.push('Nessuna familiarità nota per cefalea.');
  return parts.join(' ');
}

function typicalBlock(db, idx, today) {
  const t = db.history.typical;
  const parts = [];
  const pain = [];
  if (t.quality.length) pain.push(`dolore ${t.quality.map(lc).join(' o ')}`);
  if (t.side) pain.push(`${t.side === 'bil' ? 'su entrambi i lati' : t.side === 'alt' ? 'a lato alternante' : `prevalentemente a ${lc(sideLabel(t.side))}`}`);
  if (t.areas.length) pain.push(`(${t.areas.map(lc).join(', ')})`);
  if (pain.length) parts.push(`${capitalize(pain.join(' '))}.`);
  const facts = [];
  if (t.intensity != null) facts.push(`intensità abituale ${t.intensity}/10`);
  if (t.duration) facts.push(`durata ${lc(labelOf(TYPICAL_DURATIONS, t.duration))}`);
  if (facts.length) parts.push(`${capitalize(facts.join(', '))}.`);
  if (t.symptoms.length) parts.push(`Sintomi associati: ${t.symptoms.map(lc).join(', ')}.`);
  if (t.activity === 'yes') parts.push('Peggiora con l’attività fisica.');
  if (t.aura) parts.push(`Aura: ${lc(labelOf(AURA_FREQ, t.aura))}${t.auraTypes.length && t.aura !== 'never' ? ` (${t.auraTypes.map(lc).join(', ')})` : ''}.`);
  if (t.triggers.length) parts.push(`Fattori scatenanti riferiti: ${t.triggers.map(lc).join(', ')}.`);
  const eps = idx.episodes.filter((e) => dateOf(e.start) >= addDays(today, -364));
  if (eps.length >= 5) {
    const mins = eps.map(episodeMinutes).filter((m) => m != null);
    const sym = countLabels(eps, 'symptoms').slice(0, 3).map((s) => lc(s.label));
    const trig = countLabels(eps, 'triggers').filter((x) => x.count >= 2).slice(0, 3).map((s) => lc(s.label));
    const types = countField(eps, 'type', typeLabel).slice(0, 1).map((x) => lc(x.label));
    const d = [`intensità media ${num(mean(eps.map((e) => e.intensity)))}/10`];
    if (mins.length) d.push(`durata mediana ${formatDuration(median(mins))}`);
    if (types.length) d.push(`tipo più frequente: ${types[0]}`);
    if (sym.length) d.push(`sintomi più frequenti: ${sym.join(', ')}`);
    if (trig.length) d.push(`fattori più segnalati: ${trig.join(', ')}`);
    parts.push(`Dal diario (ultimi 12 mesi, ${plural(eps.length, 'attacco', 'attacchi')}): ${d.join('; ')}.`);
  }
  return parts.join(' ');
}

function frequencyBlock(db, idx, today) {
  const parts = [];
  const periods = db.history.periods;
  if (periods.length) {
    parts.push(`Andamento riferito: ${periods.map((p) => `${fmtMonthRange(p.from, p.to)} circa ${num(p.days)} giorni al mese${p.intensity != null ? ` (intensità ${num(p.intensity)}/10)` : ''}${p.acute != null ? `, antidolorifici ${num(p.acute)} giorni al mese` : ''}`).join('; ')}.`);
  }
  const r = diaryRate(idx, db, addDays(today, -89), today, 28);
  if (r) {
    parts.push(`Diario, ultimi ${r.tracked < 85 ? `${r.tracked} giorni registrati` : '3 mesi'}: ${num(r.days)} giorni con mal di testa ogni 30 giorni, ${num(r.attacks)} attacchi${r.intensity != null ? `, intensità media ${num(r.intensity)}/10` : ''}, farmaci sintomatici in ${num(r.acute)} giorni.`);
  }
  return parts.join(' ');
}

function therapyBlock(db, idx, today) {
  const list = [...db.preventives].sort((a, b) => (a.start < b.start ? -1 : 1));
  if (!list.length) return '';
  const lines = list.map((p) => {
    const cls = therapyClass(p.cls);
    const o = therapyOutcome(idx, db, p, today);
    const when = p.end && p.end < today ? `${fmtMonth(monthOf(p.start))} – ${fmtMonth(monthOf(p.end))}` : `da ${fmtMonth(monthOf(p.start))}, in corso`;
    const bits = [`${p.name}${p.dose ? ` ${p.dose}` : ''} (${lc(cls.short)}), ${when}`];
    const ol = outcomeLine(o);
    if (ol) bits.push(ol);
    if (p.cls === 'botox' || p.cls === 'mab') {
      const n = doseAnchors(p, today).length;
      if (n) bits.push(`${plural(n, p.cls === 'botox' ? 'seduta' : 'somministrazione', p.cls === 'botox' ? 'sedute' : 'somministrazioni')}`);
    }
    if (p.rating != null) bits.push(`beneficio riferito: ${lc(labelOf(THERAPY_RATINGS.map((r) => ({ id: r.v, label: r.label })), p.rating))}`);
    if (p.stop) bits.push(`sospeso: ${lc(stopReasonLabel(p.stop))}`);
    if (p.sides.length) bits.push(`effetti collaterali: ${p.sides.map(lc).join(', ')}`);
    return `${bits.join('; ')}.`;
  });
  return lines.join(' ');
}

function acuteBlock(db, idx, today) {
  const parts = [];
  const eps = episodesInRange(idx, addDays(today, -89), today);
  const ms = medStats(eps).slice(0, 4);
  const r = rangeStats(idx, db, addDays(today, -89), today);
  if (ms.length) {
    parts.push(`Ultimi 3 mesi: farmaci sintomatici in ${plural(r.acuteMedDays, 'giorno', 'giorni')}; più usati: ${ms.map((m) => `${m.name} (${m.uses}${m.avgEffect != null ? `, efficacia ${num(m.avgEffect)}/3` : ''})`).join(', ')}.`);
  }
  if (db.history.acute.length) {
    parts.push(`Provati in passato: ${db.history.acute.map((a) => `${a.name}${a.effect != null ? ` (${lc(effectLabel(a.effect))})` : ''}${a.note ? ` – ${a.note}` : ''}`).join(', ')}.`);
  }
  return parts.join(' ');
}

function eventsBlock(db) {
  const evs = [...db.history.events].sort((a, b) => (a.date < b.date ? -1 : 1));
  return evs.map((e) => {
    const tags = [e.er ? 'pronto soccorso' : '', e.hosp ? 'ricovero' : '', e.intensity ? `intensità ${e.intensity}/10` : ''].filter(Boolean).join(', ');
    return `${fmtFuzzyDate(e.date)}: ${e.title}${tags ? ` (${tags})` : ''}.`;
  }).join(' ');
}

function healthBlock(db) {
  const h = db.history;
  const parts = [];
  if (h.conditions.length) parts.push(`Altre condizioni: ${h.conditions.map(lc).join(', ')}${h.conditionsNote ? ` (${h.conditionsNote})` : ''}.`);
  else if (h.conditionsNote) parts.push(`Altre condizioni: ${h.conditionsNote}.`);
  if (h.allergies) parts.push(`Allergie o intolleranze: ${h.allergies}.`);
  if (h.otherMeds) parts.push(`Altri farmaci assunti: ${h.otherMeds}.`);
  if (h.cycleLink && h.cycleLink !== 'na') parts.push(`Legame con il ciclo mestruale: ${lc(labelOf(CYCLE_LINK, h.cycleLink))}.`);
  if (h.contraception) parts.push(`Contraccezione ormonale: ${h.contraception}.`);
  return parts.join(' ');
}

function midasBlock(db) {
  const s = midasSeries(db);
  if (!s.length) return '';
  const last = s[s.length - 1];
  const prev = s.length > 1 ? s[s.length - 2] : null;
  return `MIDAS ${last.score} (grado ${last.grade.grade}, ${lc(last.grade.label)}) il ${fmtDateShort(last.date)}${prev ? `; in precedenza ${prev.score} il ${fmtDateShort(prev.date)}` : ''}.`;
}

function observations(db, idx, today) {
  const out = [];
  const add = (tone, icon, text) => out.push({ tone, icon, text });
  const r = diaryRate(idx, db, addDays(today, -89), today, 60);
  const active = activeTherapies(db, today);
  let freq = r ? r.days : null;
  let freqSource = 'diario degli ultimi 3 mesi';
  if (freq == null && db.history.periods.length) {
    const lastP = db.history.periods[db.history.periods.length - 1];
    if (!lastP.to || lastP.to >= monthOf(addDays(today, -365))) {
      freq = lastP.days;
      freqSource = 'la tua stima più recente';
    }
  }
  if (freq != null) {
    if (freq >= 15) {
      add('warn', 'activity', `Frequenza di circa ${num(freq)} giorni di mal di testa al mese (${freqSource}). Se 15 o più giorni al mese durano da oltre 3 mesi, si parla di emicrania cronica: è un dato importante da discutere con il neurologo.`);
    } else if (freq >= 4 && !active.length) {
      add('info', 'shield', `Frequenza di circa ${num(freq)} giorni al mese (${freqSource}). Con 4 o più giorni di emicrania al mese spesso si valuta una terapia di prevenzione: chiedi al tuo medico se è indicata per te.`);
    } else {
      add(freq < 4 ? 'good' : 'info', 'activity', `Frequenza attuale: circa ${num(freq)} giorni di mal di testa al mese (${freqSource}).`);
    }
  }
  if (r && db.history.periods.length) {
    const before = db.history.periods.filter((p) => (p.to || monthOf(today)) < monthOf(idx.trackingStart));
    const ref = before.length ? before[before.length - 1] : null;
    if (ref && Math.abs(ref.days - r.days) >= 2) {
      add(r.days < ref.days ? 'good' : 'warn', r.days < ref.days ? 'trend-down' : 'trend-up', `Rispetto alla tua stima per ${fmtMonthRange(ref.from, ref.to)} (${num(ref.days)} giorni al mese), il diario degli ultimi 3 mesi registra ${num(r.days)} giorni al mese.`);
    }
  }
  const moh = mohStatus(idx, today);
  if (moh.level !== 'ok') {
    add('warn', 'pill', `Farmaci sintomatici in ${plural(moh.any, 'giorno', 'giorni')} negli ultimi 30${moh.specific ? ` (${moh.specific} con triptani o associazioni)` : ''}: un uso così frequente può mantenere o peggiorare il mal di testa.`);
  }
  db.preventives.forEach((p) => {
    const o = therapyOutcome(idx, db, p, today);
    const isActive = !p.end || p.end >= today;
    if (!o.change || o.change.daysPct == null) {
      if (isActive && p.start <= today && !o.baseline) add('info', 'info', `${p.name}: per misurare l’efficacia serve il dato di partenza. Indica nella terapia quanti giorni di emicrania avevi prima, oppure racconta quel periodo nella tua storia.`);
      return;
    }
    if (!isActive && p.end < addDays(today, -730)) return;
    const resp = RESPONSES[o.response];
    const tone = o.response === 'good' ? 'good' : o.response === 'worse' ? 'warn' : 'info';
    const early = o.early ? ' Valutazione preliminare: in genere l’effetto si giudica dopo almeno 3 mesi.' : '';
    add(tone, o.response === 'worse' ? 'trend-up' : 'trend-down', `${p.name}${isActive ? '' : ' (conclusa)'}: ${outcomeLine(o)}, ${lc(resp.label)} (${resp.desc}). Basale ${o.baseline.label}.${early}`);
    if (o.cycle && o.cycle.wearingOff && isActive) {
      add('info', 'clock', `${p.name}: gli attacchi aumentano nell’ultima settimana prima della nuova somministrazione (${num(o.cycle.lastRate)} giorni a settimana contro ${num(o.cycle.firstRate)} nelle prime). Segnalalo al neurologo.`);
    }
  });
  const failedCls = new Set(db.preventives.filter((p) => p.stop === 'inefficace' || p.stop === 'effetti').map((p) => therapyClass(p.cls).short));
  if (failedCls.size >= 2) {
    add('info', 'list', `Hai interrotto terapie di ${failedCls.size} classi diverse per inefficacia o effetti collaterali (${[...failedCls].map(lc).join(', ')}): è un’informazione utile al neurologo per scegliere le terapie successive.`);
  }
  const ms = midasSeries(db);
  if (ms.length >= 2) {
    const a = ms[ms.length - 2];
    const b = ms[ms.length - 1];
    if (a.score > 0 && Math.abs(b.score - a.score) >= 3) {
      add(b.score < a.score ? 'good' : 'warn', b.score < a.score ? 'trend-down' : 'trend-up', `Punteggio MIDAS da ${a.score} a ${b.score} (${b.score < a.score ? '−' : '+'}${pct(Math.abs(b.score - a.score) / a.score)}): ${b.score < a.score ? 'la disabilità è diminuita' : 'la disabilità è aumentata'}.`);
    }
  }
  const h = db.history;
  const withAura = h.typical.aura === 'sometimes' || h.typical.aura === 'always' || h.diagnoses.includes('Emicrania con aura');
  if (withAura && h.contraception) {
    add('warn', 'alert', 'Hai indicato emicrania con aura e una contraccezione ormonale: segnalalo sempre al medico e al ginecologo, perché influisce sulla scelta del contraccettivo.');
  }
  if (h.onsetAge != null && h.onsetAge >= 50) {
    add('info', 'alert', 'Un mal di testa comparso dopo i 50 anni va sempre valutato dal medico, se non è già stato fatto.');
  }
  const covered = diffDays(idx.trackingStart, today) + 1;
  if (idx.episodes.length && covered < 60) {
    add('info', 'calendar', `Il diario copre ${plural(covered, 'giorno', 'giorni')}: le valutazioni diventano più affidabili con almeno 3 mesi di registrazioni.`);
  }
  return out;
}

export function clinicalSummary(idx, db, today) {
  const blocks = [
    { id: 'profile', title: 'Profilo', text: profileBlock(db, today) },
    { id: 'typical', title: 'Caratteristiche degli attacchi', text: typicalBlock(db, idx, today) },
    { id: 'frequency', title: 'Frequenza nel tempo', text: frequencyBlock(db, idx, today) },
    { id: 'therapies', title: 'Terapie di prevenzione', text: therapyBlock(db, idx, today) },
    { id: 'acute', title: 'Farmaci per l’attacco', text: acuteBlock(db, idx, today) },
    { id: 'events', title: 'Episodi significativi', text: eventsBlock(db) },
    { id: 'health', title: 'Altre condizioni di salute', text: healthBlock(db) },
    { id: 'midas', title: 'Disabilità (MIDAS)', text: midasBlock(db) },
    { id: 'narrative', title: 'Racconto personale', text: db.history.narrative },
  ].filter((b) => b.text);
  return { blocks, observations: observations(db, idx, today) };
}

export function summaryPlainText(summary, { name = '', today = '' } = {}) {
  const lines = [`Sintesi clinica${name ? ` di ${name}` : ''}${today ? ` – ${fmtDateShort(today)}` : ''}`, ''];
  summary.blocks.forEach((b) => {
    lines.push(b.title.toUpperCase(), b.text, '');
  });
  if (summary.observations.length) {
    lines.push('OSSERVAZIONI AUTOMATICHE');
    summary.observations.forEach((o) => lines.push(`• ${o.text}`));
    lines.push('');
  }
  lines.push('Generata dal Diario Emicrania con i dati inseriti dal paziente: non è una diagnosi.');
  return lines.join('\n');
}
