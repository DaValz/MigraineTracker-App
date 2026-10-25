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
  APP_NAME, therapyClass, stopReasonLabel, midasGrade, typeLabel, effectLabel, SEXES, TYPICAL_DURATIONS, AURA_FREQ,
  CYCLE_LINK, THERAPY_RATINGS,
} from './data.js';
import { num, pct } from './format.js';
import {
  t, tv, lang, listOr,
} from './i18n.js';

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
// Nelle frasi i valori salvati (sintomi, fattori...) vanno in minuscolo; in tedesco i sostantivi tengono la maiuscola.
const lc = (s) => (s && lang !== 'de' ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const lv = (value) => lc(tv(value));
// Con i valori decimali la forma singolare vale solo per esattamente 1 ("1 giorno al mese"); altrimenti plurale ("1,5 giorni").
const perMonth = (x) => t('{n, plural, one {{giorni} giorno al mese} other {{giorni} giorni al mese}}', { n: x, giorni: num(x) });
const perWeek = (x) => t('{n, plural, one {{giorni} giorno a settimana} other {{giorni} giorni a settimana}}', { n: x, giorni: num(x) });

export const fmtMonth = (m) => fmt(`${m}-01`, { month: 'short', year: 'numeric' }).replace('.', '');

export function fmtFuzzyDate(s) {
  if (!s) return '';
  if (s.length === 4) return s;
  if (s.length === 7) return fmtMonth(s);
  return fmt(s, { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
}

export function fmtMonthRange(from, to, { current = null } = {}) {
  if (!to) return current === false ? t('da {mese}', { mese: fmtMonth(from) }) : t('da {mese} a oggi', { mese: fmtMonth(from) });
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
  const weeks = tracked.map((n, k) => ({
    week: k + 1, label: k < W ? t('{n}ª', { n: k + 1 }) : t('Oltre'), over: k >= W, tracked: n, days: mig[k], rate: n >= 5 ? (mig[k] / n) * 7 : null,
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
  good: { label: t('Risposta buona'), desc: t('riduzione di almeno il 50%'), tone: 'green' },
  partial: { label: t('Risposta parziale'), desc: t('riduzione tra il 30 e il 49%'), tone: 'teal' },
  low: { label: t('Poca differenza'), desc: t('variazione sotto il 30%'), tone: 'orange' },
  worse: { label: t('Peggioramento'), desc: t('più giorni di prima'), tone: 'red' },
};

export function therapyOutcome(idx, db, p, today) {
  const end = p.end && p.end < today ? p.end : today;
  const started = p.start <= today;
  const bFrom = addDays(p.start, -90);
  const bTo = addDays(p.start, -1);
  let baseline = diaryRate(idx, db, bFrom, bTo);
  if (baseline) baseline.label = t('dal diario dei 3 mesi prima');
  if (!baseline && p.baseDays != null) {
    baseline = {
      source: 'manual', days: p.baseDays, intensity: p.baseInt, acute: null, attacks: null, label: t('valore indicato da te'),
    };
  }
  if (!baseline) {
    const est = historyEstimate(db.history, bFrom, bTo, today);
    if (est && est.days != null) baseline = { ...est, label: t('stima dalla tua storia') };
  }
  if (baseline && baseline.intensity == null && p.baseInt != null) baseline.intensity = p.baseInt;

  let during = null;
  let overall = null;
  if (started && end >= p.start) {
    const recentFrom = addDays(end, -89) > p.start ? addDays(end, -89) : p.start;
    during = diaryRate(idx, db, recentFrom, end);
    overall = diaryRate(idx, db, p.start, end);
    if (during) {
      during.label = recentFrom === p.start ? t('dall’inizio della terapia') : t('ultimi 3 mesi di terapia');
    } else {
      const est = historyEstimate(db.history, p.start, end, today);
      if (est && est.days != null) during = { ...est, label: t('stima dalla tua storia') };
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
  const variazione = `${o.change.daysPct > 0 ? '+' : '−'}${pct(Math.abs(o.change.daysPct))}`;
  return t('{prima} → {dopo} giorni/mese ({variazione})', { prima: num(o.baseline.days), dopo: num(o.during.days), variazione });
}

export function therapyPeriodText(p, today) {
  const dur = diffDays(p.start, p.end && p.end < today ? p.end : today);
  const months = Math.round(dur / 30.4);
  const weeks = Math.max(1, Math.round(dur / 7));
  if (p.start > today) return t('inizia il {data}', { data: fmtDateShort(p.start) });
  if (!p.end || p.end >= today) {
    const ongoing = months >= 2
      ? t('{n, plural, one {in corso da # mese} other {in corso da # mesi}}', { n: months })
      : t('{n, plural, one {in corso da # settimana} other {in corso da # settimane}}', { n: weeks });
    return `${t('dal {data}', { data: fmtDateShort(p.start) })} · ${ongoing}`;
  }
  const span = months >= 2 ? t('{n, plural, one {# mese} other {# mesi}}', { n: months }) : t('{n, plural, one {# settimana} other {# settimane}}', { n: weeks });
  return `${t('dal {da} al {a}', { da: fmtDateShort(p.start), a: fmtDateShort(p.end) })} · ${span}`;
}

/* ---------- andamento a lungo termine ---------- */

function aggregate(points, unit) {
  const groups = new Map();
  points.forEach((pt) => {
    const y = pt.month.slice(0, 4);
    const q = Math.floor((Number(pt.month.slice(5)) - 1) / 3) + 1;
    const key = unit === 'year' ? y : `${y}-Q${q}`;
    if (!groups.has(key)) groups.set(key, { key, label: unit === 'year' || q === 1 ? y : '', title: unit === 'year' ? y : t('{q}° trimestre {anno}', { q, anno: y }), from: pt.month, to: pt.month, items: [] });
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
  const ty = h.typical;
  return [
    { id: 'profile', done: h.onsetAge != null || h.birthYear != null || h.diagnoses.length > 0 || !!h.sex },
    { id: 'typical', done: ty.intensity != null || ty.quality.length > 0 || !!ty.duration || ty.symptoms.length > 0 },
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
  const who = [h.sex && h.sex !== 'x' ? sexLabel(h.sex) : '', age != null ? t('{n, plural, one {# anno} other {# anni}}', { n: age }) : ''].filter(Boolean).join(', ');
  if (who) parts.push(`${who}.`);
  if (h.onsetAge != null) {
    const years = age != null && age >= h.onsetAge ? age - h.onsetAge : null;
    const onset = t('{n, plural, one {Mal di testa dall’età di # anno} other {Mal di testa dall’età di # anni}}', { n: h.onsetAge });
    const lasting = years != null ? ` (${t('{n, plural, one {circa # anno di storia} other {circa # anni di storia}}', { n: years })})` : '';
    parts.push(`${onset}${lasting}.`);
  }
  if (h.diagnoses.length) {
    const extra = [h.diagYear ? String(h.diagYear) : '', h.diagBy].filter(Boolean).join(', ');
    parts.push(t('Diagnosi riferite: {diagnosi}.', { diagnosi: `${h.diagnoses.map(lv).join(', ')}${extra ? ` (${extra})` : ''}` }));
  }
  if (h.famKnown === 'yes') parts.push(h.family.length ? t('Familiarità per cefalea: {familiari}.', { familiari: h.family.map(lv).join(', ') }) : t('Familiarità per cefalea.'));
  else if (h.famKnown === 'no') parts.push(t('Nessuna familiarità nota per cefalea.'));
  return parts.join(' ');
}

function typicalBlock(db, idx, today) {
  const ty = db.history.typical;
  const parts = [];
  const pain = [];
  if (ty.quality.length) pain.push(t('dolore {qualita}', { qualita: listOr(ty.quality.map(lv)) }));
  const side = ty.side === 'bil' ? t('su entrambi i lati')
    : ty.side === 'alt' ? t('a lato alternante')
      : ty.side === 'sx' ? t('prevalentemente a sinistra')
        : ty.side === 'dx' ? t('prevalentemente a destra') : '';
  if (side) pain.push(side);
  if (ty.areas.length) pain.push(`(${ty.areas.map(lv).join(', ')})`);
  if (pain.length) parts.push(`${capitalize(pain.join(' '))}.`);
  const facts = [];
  if (ty.intensity != null) facts.push(t('intensità abituale {intensita}/10', { intensita: ty.intensity }));
  if (ty.duration) facts.push(t('durata {durata}', { durata: lc(labelOf(TYPICAL_DURATIONS, ty.duration)) }));
  if (facts.length) parts.push(`${capitalize(facts.join(', '))}.`);
  if (ty.symptoms.length) parts.push(t('Sintomi associati: {sintomi}.', { sintomi: ty.symptoms.map(lv).join(', ') }));
  if (ty.activity === 'yes') parts.push(t('Peggiora con l’attività fisica.'));
  if (ty.aura) {
    const frequenza = lc(labelOf(AURA_FREQ, ty.aura));
    parts.push(ty.auraTypes.length && ty.aura !== 'never'
      ? t('Aura: {frequenza} ({tipi}).', { frequenza, tipi: ty.auraTypes.map(lv).join(', ') })
      : t('Aura: {frequenza}.', { frequenza }));
  }
  if (ty.triggers.length) parts.push(t('Fattori scatenanti riferiti: {fattori}.', { fattori: ty.triggers.map(lv).join(', ') }));
  const eps = idx.episodes.filter((e) => dateOf(e.start) >= addDays(today, -364));
  if (eps.length >= 5) {
    const mins = eps.map(episodeMinutes).filter((m) => m != null);
    const sym = countLabels(eps, 'symptoms').slice(0, 3).map((s) => lv(s.label));
    const trig = countLabels(eps, 'triggers').filter((x) => x.count >= 2).slice(0, 3).map((s) => lv(s.label));
    const types = countField(eps, 'type', typeLabel).slice(0, 1).map((x) => lc(x.label));
    const d = [t('intensità media {valore}/10', { valore: num(mean(eps.map((e) => e.intensity))) })];
    if (mins.length) d.push(t('durata mediana {durata}', { durata: formatDuration(median(mins)) }));
    if (types.length) d.push(t('tipo più frequente: {tipo}', { tipo: types[0] }));
    if (sym.length) d.push(t('sintomi più frequenti: {sintomi}', { sintomi: sym.join(', ') }));
    if (trig.length) d.push(t('fattori più segnalati: {fattori}', { fattori: trig.join(', ') }));
    parts.push(t('{n, plural, one {Dal diario (ultimi 12 mesi, # attacco): {dettagli}.} other {Dal diario (ultimi 12 mesi, # attacchi): {dettagli}.}}', { n: eps.length, dettagli: d.join('; ') }));
  }
  return parts.join(' ');
}

function frequencyBlock(db, idx, today) {
  const parts = [];
  const periods = db.history.periods;
  if (periods.length) {
    const items = periods.map((p) => {
      const base = t('{periodo} circa {frequenza}', { periodo: fmtMonthRange(p.from, p.to), frequenza: perMonth(p.days) });
      const intensity = p.intensity != null ? ` (${t('intensità {intensita}/10', { intensita: num(p.intensity) })})` : '';
      const acute = p.acute != null ? `, ${t('antidolorifici {frequenza}', { frequenza: perMonth(p.acute) })}` : '';
      return `${base}${intensity}${acute}`;
    });
    parts.push(t('Andamento riferito: {periodi}.', { periodi: items.join('; ') }));
  }
  const r = diaryRate(idx, db, addDays(today, -89), today, 28);
  if (r) {
    const head = r.tracked < 85
      ? t('{n, plural, one {Diario, ultimi # giorno registrato:} other {Diario, ultimi # giorni registrati:}}', { n: r.tracked })
      : t('Diario, ultimi 3 mesi:');
    const bits = [
      t('{n, plural, one {{giorni} giorno con mal di testa ogni 30 giorni} other {{giorni} giorni con mal di testa ogni 30 giorni}}', { n: r.days, giorni: num(r.days) }),
      t('{n, plural, one {{attacchi} attacco} other {{attacchi} attacchi}}', { n: r.attacks, attacchi: num(r.attacks) }),
    ];
    if (r.intensity != null) bits.push(t('intensità media {valore}/10', { valore: num(r.intensity) }));
    bits.push(t('{n, plural, one {farmaci sintomatici in {giorni} giorno} other {farmaci sintomatici in {giorni} giorni}}', { n: r.acute, giorni: num(r.acute) }));
    parts.push(`${head} ${bits.join(', ')}.`);
  }
  return parts.join(' ');
}

function therapyBlock(db, idx, today) {
  const list = [...db.preventives].sort((a, b) => (a.start < b.start ? -1 : 1));
  if (!list.length) return '';
  const lines = list.map((p) => {
    const cls = therapyClass(p.cls);
    const o = therapyOutcome(idx, db, p, today);
    const when = p.end && p.end < today ? `${fmtMonth(monthOf(p.start))} – ${fmtMonth(monthOf(p.end))}` : t('da {mese}, in corso', { mese: fmtMonth(monthOf(p.start)) });
    const bits = [`${tv(p.name)}${p.dose ? ` ${p.dose}` : ''} (${lc(cls.short)}), ${when}`];
    const ol = outcomeLine(o);
    if (ol) bits.push(ol);
    if (p.cls === 'botox' || p.cls === 'mab') {
      const n = doseAnchors(p, today).length;
      if (n) bits.push(p.cls === 'botox' ? t('{n, plural, one {# seduta} other {# sedute}}', { n }) : t('{n, plural, one {# somministrazione} other {# somministrazioni}}', { n }));
    }
    if (p.rating != null) bits.push(t('beneficio riferito: {beneficio}', { beneficio: lc(labelOf(THERAPY_RATINGS.map((r) => ({ id: r.v, label: r.label })), p.rating)) }));
    if (p.stop) bits.push(t('sospeso: {motivo}', { motivo: lc(stopReasonLabel(p.stop)) }));
    if (p.sides.length) bits.push(t('effetti collaterali: {effetti}', { effetti: p.sides.map(lv).join(', ') }));
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
    const used = ms.map((m) => `${tv(m.name)} (${m.uses}${m.avgEffect != null ? `, ${t('efficacia {valore}/3', { valore: num(m.avgEffect) })}` : ''})`).join(', ');
    parts.push(t('{n, plural, one {Ultimi 3 mesi: farmaci sintomatici in # giorno; più usati: {farmaci}.} other {Ultimi 3 mesi: farmaci sintomatici in # giorni; più usati: {farmaci}.}}', { n: r.acuteMedDays, farmaci: used }));
  }
  if (db.history.acute.length) {
    const tried = db.history.acute.map((a) => `${tv(a.name)}${a.effect != null ? ` (${lc(effectLabel(a.effect))})` : ''}${a.note ? ` – ${a.note}` : ''}`).join(', ');
    parts.push(t('Provati in passato: {farmaci}.', { farmaci: tried }));
  }
  return parts.join(' ');
}

function eventsBlock(db) {
  const evs = [...db.history.events].sort((a, b) => (a.date < b.date ? -1 : 1));
  return evs.map((e) => {
    const tags = [e.er ? t('pronto soccorso') : '', e.hosp ? t('ricovero') : '', e.intensity ? t('intensità {intensita}/10', { intensita: e.intensity }) : ''].filter(Boolean).join(', ');
    return `${fmtFuzzyDate(e.date)}: ${e.title}${tags ? ` (${tags})` : ''}.`;
  }).join(' ');
}

function healthBlock(db) {
  const h = db.history;
  const parts = [];
  if (h.conditions.length) parts.push(t('Altre condizioni: {condizioni}.', { condizioni: `${h.conditions.map(lv).join(', ')}${h.conditionsNote ? ` (${h.conditionsNote})` : ''}` }));
  else if (h.conditionsNote) parts.push(t('Altre condizioni: {condizioni}.', { condizioni: h.conditionsNote }));
  if (h.allergies) parts.push(t('Allergie o intolleranze: {allergie}.', { allergie: h.allergies }));
  if (h.otherMeds) parts.push(t('Altri farmaci assunti: {farmaci}.', { farmaci: h.otherMeds }));
  if (h.cycleLink && h.cycleLink !== 'na') parts.push(t('Legame con il ciclo mestruale: {legame}.', { legame: lc(labelOf(CYCLE_LINK, h.cycleLink)) }));
  if (h.contraception) parts.push(t('Contraccezione ormonale: {contraccezione}.', { contraccezione: h.contraception }));
  return parts.join(' ');
}

function midasBlock(db) {
  const s = midasSeries(db);
  if (!s.length) return '';
  const last = s[s.length - 1];
  const prev = s.length > 1 ? s[s.length - 2] : null;
  const now = t('MIDAS {punteggio} (grado {grado}, {giudizio}) il {data}', {
    punteggio: last.score, grado: last.grade.grade, giudizio: lc(last.grade.label), data: fmtDateShort(last.date),
  });
  const before = prev ? `; ${t('in precedenza {punteggio} il {data}', { punteggio: prev.score, data: fmtDateShort(prev.date) })}` : '';
  return `${now}${before}.`;
}

function observations(db, idx, today) {
  const out = [];
  const add = (tone, icon, text) => out.push({ tone, icon, text });
  const r = diaryRate(idx, db, addDays(today, -89), today, 60);
  const active = activeTherapies(db, today);
  let freq = r ? r.days : null;
  let freqSource = t('diario degli ultimi 3 mesi');
  if (freq == null && db.history.periods.length) {
    const lastP = db.history.periods[db.history.periods.length - 1];
    if (!lastP.to || lastP.to >= monthOf(addDays(today, -365))) {
      freq = lastP.days;
      freqSource = t('la tua stima più recente');
    }
  }
  if (freq != null) {
    const freqArgs = { n: freq, giorni: num(freq), fonte: freqSource };
    if (freq >= 15) {
      add('warn', 'activity', `${t('{n, plural, one {Frequenza di circa {giorni} giorno di mal di testa al mese ({fonte}).} other {Frequenza di circa {giorni} giorni di mal di testa al mese ({fonte}).}}', freqArgs)} ${t('Se 15 o più giorni al mese durano da oltre 3 mesi, si parla di emicrania cronica: è un dato importante da discutere con il neurologo.')}`);
    } else if (freq >= 4 && !active.length) {
      add('info', 'shield', `${t('{n, plural, one {Frequenza di circa {giorni} giorno al mese ({fonte}).} other {Frequenza di circa {giorni} giorni al mese ({fonte}).}}', freqArgs)} ${t('Con 4 o più giorni di emicrania al mese spesso si valuta una terapia di prevenzione: chiedi al tuo medico se è indicata per te.')}`);
    } else {
      add(freq < 4 ? 'good' : 'info', 'activity', t('{n, plural, one {Frequenza attuale: circa {giorni} giorno di mal di testa al mese ({fonte}).} other {Frequenza attuale: circa {giorni} giorni di mal di testa al mese ({fonte}).}}', freqArgs));
    }
  }
  if (r && db.history.periods.length) {
    const before = db.history.periods.filter((p) => (p.to || monthOf(today)) < monthOf(idx.trackingStart));
    const ref = before.length ? before[before.length - 1] : null;
    if (ref && Math.abs(ref.days - r.days) >= 2) {
      add(r.days < ref.days ? 'good' : 'warn', r.days < ref.days ? 'trend-down' : 'trend-up', t('Rispetto alla tua stima per {periodo} ({prima}), il diario degli ultimi 3 mesi registra {ora}.', { periodo: fmtMonthRange(ref.from, ref.to), prima: perMonth(ref.days), ora: perMonth(r.days) }));
    }
  }
  const moh = mohStatus(idx, today);
  if (moh.level !== 'ok') {
    add('warn', 'pill', moh.specific
      ? t('{n, plural, one {Farmaci sintomatici in # giorno negli ultimi 30 ({specifici} con triptani o associazioni): un uso così frequente può mantenere o peggiorare il mal di testa.} other {Farmaci sintomatici in # giorni negli ultimi 30 ({specifici} con triptani o associazioni): un uso così frequente può mantenere o peggiorare il mal di testa.}}', { n: moh.any, specifici: moh.specific })
      : t('{n, plural, one {Farmaci sintomatici in # giorno negli ultimi 30: un uso così frequente può mantenere o peggiorare il mal di testa.} other {Farmaci sintomatici in # giorni negli ultimi 30: un uso così frequente può mantenere o peggiorare il mal di testa.}}', { n: moh.any }));
  }
  db.preventives.forEach((p) => {
    const o = therapyOutcome(idx, db, p, today);
    const isActive = !p.end || p.end >= today;
    if (!o.change || o.change.daysPct == null) {
      if (isActive && p.start <= today && !o.baseline) add('info', 'info', t('{terapia}: per misurare l’efficacia serve il dato di partenza. Indica nella terapia quanti giorni di emicrania avevi prima, oppure racconta quel periodo nella tua storia.', { terapia: tv(p.name) }));
      return;
    }
    if (!isActive && p.end < addDays(today, -730)) return;
    const resp = RESPONSES[o.response];
    const tone = o.response === 'good' ? 'good' : o.response === 'worse' ? 'warn' : 'info';
    const name = isActive ? tv(p.name) : t('{terapia} (conclusa)', { terapia: tv(p.name) });
    const result = t('{terapia}: {esito}, {risposta} ({descrizione}). Basale {origine}.', {
      terapia: name, esito: outcomeLine(o), risposta: lc(resp.label), descrizione: resp.desc, origine: o.baseline.label,
    });
    const early = o.early ? ` ${t('Valutazione preliminare: in genere l’effetto si giudica dopo almeno 3 mesi.')}` : '';
    add(tone, o.response === 'worse' ? 'trend-up' : 'trend-down', `${result}${early}`);
    if (o.cycle && o.cycle.wearingOff && isActive) {
      add('info', 'clock', t('{terapia}: gli attacchi aumentano nell’ultima settimana prima della nuova somministrazione ({ultime} contro {prime} nelle prime). Segnalalo al neurologo.', { terapia: tv(p.name), ultime: perWeek(o.cycle.lastRate), prime: num(o.cycle.firstRate) }));
    }
  });
  const failedCls = new Set(db.preventives.filter((p) => p.stop === 'inefficace' || p.stop === 'effetti').map((p) => therapyClass(p.cls).short));
  if (failedCls.size >= 2) {
    add('info', 'list', t('{n, plural, one {Hai interrotto terapie di # classe diversa per inefficacia o effetti collaterali ({classi}): è un’informazione utile al neurologo per scegliere le terapie successive.} other {Hai interrotto terapie di # classi diverse per inefficacia o effetti collaterali ({classi}): è un’informazione utile al neurologo per scegliere le terapie successive.}}', { n: failedCls.size, classi: [...failedCls].map(lc).join(', ') }));
  }
  const ms = midasSeries(db);
  if (ms.length >= 2) {
    const a = ms[ms.length - 2];
    const b = ms[ms.length - 1];
    if (a.score > 0 && Math.abs(b.score - a.score) >= 3) {
      const lower = b.score < a.score;
      const args = { prima: a.score, dopo: b.score, variazione: `${lower ? '−' : '+'}${pct(Math.abs(b.score - a.score) / a.score)}` };
      add(lower ? 'good' : 'warn', lower ? 'trend-down' : 'trend-up', lower
        ? t('Punteggio MIDAS da {prima} a {dopo} ({variazione}): la disabilità è diminuita.', args)
        : t('Punteggio MIDAS da {prima} a {dopo} ({variazione}): la disabilità è aumentata.', args));
    }
  }
  const h = db.history;
  const withAura = h.typical.aura === 'sometimes' || h.typical.aura === 'always' || h.diagnoses.includes('Emicrania con aura');
  if (withAura && h.contraception) {
    add('warn', 'alert', t('Hai indicato emicrania con aura e una contraccezione ormonale: segnalalo sempre al medico e al ginecologo, perché influisce sulla scelta del contraccettivo.'));
  }
  if (h.onsetAge != null && h.onsetAge >= 50) {
    add('info', 'alert', t('Un mal di testa comparso dopo i 50 anni va sempre valutato dal medico, se non è già stato fatto.'));
  }
  const covered = diffDays(idx.trackingStart, today) + 1;
  if (idx.episodes.length && covered < 60) {
    add('info', 'calendar', t('{n, plural, one {Il diario copre # giorno: le valutazioni diventano più affidabili con almeno 3 mesi di registrazioni.} other {Il diario copre # giorni: le valutazioni diventano più affidabili con almeno 3 mesi di registrazioni.}}', { n: covered }));
  }
  return out;
}

export function clinicalSummary(idx, db, today) {
  const blocks = [
    { id: 'profile', title: t('Profilo'), text: profileBlock(db, today) },
    { id: 'typical', title: t('Caratteristiche degli attacchi'), text: typicalBlock(db, idx, today) },
    { id: 'frequency', title: t('Frequenza nel tempo'), text: frequencyBlock(db, idx, today) },
    { id: 'therapies', title: t('Terapie di prevenzione'), text: therapyBlock(db, idx, today) },
    { id: 'acute', title: t('Farmaci per l’attacco'), text: acuteBlock(db, idx, today) },
    { id: 'events', title: t('Episodi significativi'), text: eventsBlock(db) },
    { id: 'health', title: t('Altre condizioni di salute'), text: healthBlock(db) },
    { id: 'midas', title: t('Disabilità (MIDAS)'), text: midasBlock(db) },
    { id: 'narrative', title: t('Racconto personale'), text: db.history.narrative },
  ].filter((b) => b.text);
  return { blocks, observations: observations(db, idx, today) };
}

export function summaryPlainText(summary, { name = '', today = '' } = {}) {
  const title = name ? t('Sintesi clinica di {nome}', { nome: name }) : t('Sintesi clinica');
  const lines = [`${title}${today ? ` – ${fmtDateShort(today)}` : ''}`, ''];
  summary.blocks.forEach((b) => {
    lines.push(b.title.toUpperCase(), b.text, '');
  });
  if (summary.observations.length) {
    lines.push(t('Osservazioni automatiche').toUpperCase());
    summary.observations.forEach((o) => lines.push(`• ${o.text}`));
    lines.push('');
  }
  lines.push(t('Generata dal {app} con i dati inseriti dal paziente: non è una diagnosi.', { app: APP_NAME }));
  return lines.join('\n');
}
