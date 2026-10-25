import {
  addDays, diffDays, eachDay, minutesBetween, monthOf, monthStart, monthEnd, monthsBetween,
  startOfWeek, weekdayMon, fmtMonthShort, fmtDayMonth, addMonths, daysInMonth, WEEKDAYS_LONG,
} from './dates.js';
import { medClassGroup, isAcuteClass, MED_CLASSES } from './data.js';

const MAX_COVER_DAYS = 30;
export const dateOf = (dt) => dt.slice(0, 10);
export const isOngoing = (ep) => ep.end == null;

export function episodeDates(ep, today) {
  const s = dateOf(ep.start);
  let e = ep.end ? dateOf(ep.end) : today;
  if (e < s) e = s;
  const cap = addDays(s, MAX_COVER_DAYS);
  if (e > cap) e = cap;
  return eachDay(s, e);
}

export function episodeMinutes(ep) {
  if (!ep.end || ep.timeUnknown) return null;
  const m = minutesBetween(ep.start, ep.end);
  return m >= 0 ? m : null;
}

const RE_ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function makeIndex(db, today) {
  const episodes = Object.values(db.episodes).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const byDay = new Map();
  const intensityByDay = new Map();
  const medDays = new Map();
  const migraineDays = new Set();
  let first = db.createdAt ? dateOf(db.createdAt) : today;
  for (const ep of episodes) {
    for (const d of episodeDates(ep, today)) {
      migraineDays.add(d);
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(ep);
      intensityByDay.set(d, Math.max(intensityByDay.get(d) || 0, ep.intensity));
    }
    for (const m of ep.meds) {
      const d = dateOf(m.at || ep.start);
      if (!medDays.has(d)) medDays.set(d, new Set());
      medDays.get(d).add(m.cls);
    }
    if (dateOf(ep.start) < first) first = dateOf(ep.start);
  }
  for (const d of Object.keys(db.days)) if (d < first) first = d;
  if (first > today) first = today;
  const pinned = db.settings.diaryStart;
  let trackingStart = typeof pinned === 'string' && RE_ISO_DATE.test(pinned) ? pinned : first;
  if (trackingStart > today) trackingStart = today;
  return {
    episodes, byDay, intensityByDay, medDays, migraineDays, today,
    trackingStart,
    autoStart: first,
    assumeFree: db.settings.assumeFree !== false,
  };
}

let memo = { rev: -1, today: '', db: null, idx: null };
export function getIndex(db, rev, today) {
  if (memo.idx && memo.rev === rev && memo.today === today && memo.db === db) return memo.idx;
  const idx = makeIndex(db, today);
  memo = { rev, today, db, idx };
  return idx;
}

export function dayStatus(idx, db, date) {
  if (idx.migraineDays.has(date)) return 'migraine';
  if (date > idx.today) return 'future';
  if (db.days[date] && db.days[date].free) return 'free';
  if (date < idx.trackingStart) return 'none';
  return idx.assumeFree ? 'assumed' : 'unknown';
}

const hasAcute = (set) => !!set && [...set].some(isAcuteClass);
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function episodesInRange(idx, from, to) {
  return idx.episodes.filter((e) => dateOf(e.start) >= from && dateOf(e.start) <= to);
}

export function rangeStats(idx, db, from, to) {
  const start = from < idx.trackingStart ? idx.trackingStart : from;
  const end = to > idx.today ? idx.today : to;
  const out = {
    from, to, trackedDays: 0, migraineDays: 0, freeDays: 0, unknownDays: 0, acuteMedDays: 0,
    attacks: 0, avgIntensity: null, peakIntensity: null, avgMinutes: null, medianMinutes: null, longestMinutes: null,
    lostDays: 0, reducedDays: 0, bedAttacks: 0, ongoing: false, episodes: [],
  };
  if (start <= end) {
    for (const d of eachDay(start, end)) {
      const st = dayStatus(idx, db, d);
      if (st === 'migraine') {
        out.migraineDays += 1;
        out.trackedDays += 1;
      } else if (st === 'free' || st === 'assumed') {
        out.freeDays += 1;
        out.trackedDays += 1;
      } else if (st === 'unknown') {
        out.unknownDays += 1;
      }
    }
  }
  if (start <= end) {
    for (const d of eachDay(start, end)) {
      if (hasAcute(idx.medDays.get(d))) out.acuteMedDays += 1;
    }
  }
  const eps = episodesInRange(idx, start, to);
  out.episodes = eps;
  out.attacks = eps.length;
  out.avgIntensity = mean(eps.map((e) => e.intensity));
  out.peakIntensity = eps.length ? Math.max(...eps.map((e) => e.intensity)) : null;
  const mins = eps.map(episodeMinutes).filter((m) => m != null);
  out.avgMinutes = mean(mins);
  out.medianMinutes = median(mins);
  out.longestMinutes = mins.length ? Math.max(...mins) : null;
  out.lostDays = new Set(eps.filter((e) => e.work === 2).map((e) => dateOf(e.start))).size;
  out.reducedDays = new Set(eps.filter((e) => e.work === 1).map((e) => dateOf(e.start))).size;
  out.bedAttacks = eps.filter((e) => e.impact === 3).length;
  out.ongoing = eps.some(isOngoing);
  return out;
}

export function buckets(idx, db, from, to, unit) {
  const raw = [];
  if (unit === 'day') {
    eachDay(from, to).forEach((d) => raw.push({ from: d, to: d, label: String(Number(d.slice(8))) }));
  } else if (unit === 'week') {
    for (let s = startOfWeek(from); s <= to; s = addDays(s, 7)) raw.push({ from: s, to: addDays(s, 6), label: fmtDayMonth(s) });
  } else {
    monthsBetween(monthOf(from), monthOf(to)).forEach((m) => raw.push({
      from: monthStart(m), to: monthEnd(m), label: fmtMonthShort(m), month: m,
    }));
  }
  return raw.map((b) => {
    let migraineDays = 0;
    let tracked = 0;
    let maxIntensity = 0;
    const lo0 = b.from < from ? from : b.from;
    const lo = lo0 < idx.trackingStart ? idx.trackingStart : lo0;
    const hiRange = b.to > to ? to : b.to;
    const hi = hiRange > idx.today ? idx.today : hiRange;
    if (lo <= hi) {
      for (const d of eachDay(lo, hi)) {
        if (idx.migraineDays.has(d)) {
          migraineDays += 1;
          maxIntensity = Math.max(maxIntensity, idx.intensityByDay.get(d) || 0);
        }
        const st = dayStatus(idx, db, d);
        if (st === 'migraine' || st === 'free' || st === 'assumed') tracked += 1;
      }
    }
    const attacks = lo <= hiRange ? episodesInRange(idx, lo, hiRange).length : 0;
    return { ...b, migraineDays, attacks, maxIntensity, tracked };
  });
}

export function monthlyMedDays(idx, from, to) {
  return monthsBetween(monthOf(from), monthOf(to)).map((m) => {
    let specific = 0;
    let simple = 0;
    let any = 0;
    const lo0 = monthStart(m) < from ? from : monthStart(m);
    const lo = lo0 < idx.trackingStart ? idx.trackingStart : lo0;
    const hiRange = monthEnd(m) > to ? to : monthEnd(m);
    const hi = hiRange > idx.today ? idx.today : hiRange;
    for (const d of lo <= hi ? eachDay(lo, hi) : []) {
      const set = idx.medDays.get(d);
      if (!set) continue;
      const groups = [...set].map(medClassGroup);
      const sp = groups.includes('specific');
      const si = groups.includes('simple');
      if (sp) specific += 1;
      if (si) simple += 1;
      if (sp || si) any += 1;
    }
    return { month: m, label: fmtMonthShort(m), specific, simple, any };
  });
}

export function countLabels(episodes, field) {
  const map = new Map();
  for (const e of episodes) for (const l of e[field]) map.set(l, (map.get(l) || 0) + 1);
  return [...map].map(([label, count]) => ({ label, count, pct: episodes.length ? count / episodes.length : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'it'));
}

export function countField(episodes, field, labelOf) {
  const map = new Map();
  for (const e of episodes) {
    const v = e[field];
    if (!v) continue;
    map.set(v, (map.get(v) || 0) + 1);
  }
  return [...map].map(([id, count]) => ({ id, label: labelOf ? labelOf(id) : id, count, pct: episodes.length ? count / episodes.length : 0 }))
    .sort((a, b) => b.count - a.count);
}

export function weekdayCounts(episodes) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  episodes.forEach((e) => { c[weekdayMon(dateOf(e.start))] += 1; });
  return c;
}

export const PARTS_OF_DAY = [
  { id: 'night', label: 'Notte', range: '00–06', from: 0, to: 6 },
  { id: 'morning', label: 'Mattina', range: '06–12', from: 6, to: 12 },
  { id: 'afternoon', label: 'Pomeriggio', range: '12–18', from: 12, to: 18 },
  { id: 'evening', label: 'Sera', range: '18–24', from: 18, to: 24 },
];

export function partOfDayCounts(episodes) {
  const c = PARTS_OF_DAY.map(() => 0);
  episodes.forEach((e) => {
    if (e.timeUnknown) return;
    const hour = Number(e.start.slice(11, 13));
    c[PARTS_OF_DAY.findIndex((p) => hour >= p.from && hour < p.to)] += 1;
  });
  return c;
}

export function intensityHistogram(episodes) {
  const c = new Array(10).fill(0);
  episodes.forEach((e) => { c[e.intensity - 1] += 1; });
  return c;
}

export function medStats(episodes) {
  const map = new Map();
  for (const e of episodes) {
    for (const m of e.meds) {
      const rec = map.get(m.name) || { name: m.name, cls: m.cls, uses: 0, rated: 0, effectSum: 0, effects: [0, 0, 0, 0], days: new Set() };
      rec.uses += 1;
      rec.days.add(dateOf(m.at || e.start));
      if (m.effect != null) {
        rec.rated += 1;
        rec.effectSum += m.effect;
        rec.effects[m.effect] += 1;
      }
      map.set(m.name, rec);
    }
  }
  return [...map.values()]
    .map((r) => ({ ...r, days: r.days.size, avgEffect: r.rated ? r.effectSum / r.rated : null }))
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name, 'it'));
}

export function mohStatus(idx, today) {
  const from = addDays(today, -29);
  let specific = 0;
  let simple = 0;
  let any = 0;
  const classes = new Set();
  for (const d of eachDay(from, today)) {
    const set = idx.medDays.get(d);
    if (!set) continue;
    let sp = false;
    let si = false;
    for (const cls of set) {
      const g = medClassGroup(cls);
      if (g === 'specific') sp = true;
      else if (g === 'simple') si = true;
      if (g) classes.add(cls);
    }
    if (sp) specific += 1;
    if (si) simple += 1;
    if (sp || si) any += 1;
  }
  const warn = specific >= 10 || simple >= 15 || (any >= 10 && classes.size >= 2);
  const watch = !warn && (specific >= 8 || simple >= 12 || any >= 8);
  return { from, to: today, specific, simple, any, level: warn ? 'warn' : watch ? 'watch' : 'ok' };
}

export function streakInfo(idx, today) {
  const days = [...idx.migraineDays].filter((d) => d <= today && d >= idx.trackingStart).sort();
  const last = days.length ? days[days.length - 1] : null;
  let longest = 0;
  if (days.length) {
    longest = Math.max(diffDays(idx.trackingStart, days[0]), diffDays(last, today));
    for (let i = 1; i < days.length; i += 1) longest = Math.max(longest, diffDays(days[i - 1], days[i]) - 1);
  } else {
    longest = diffDays(idx.trackingStart, today) + 1;
  }
  return {
    lastMigraine: last,
    daysSince: last ? diffDays(last, today) : null,
    longestFree: Math.max(0, longest),
    ongoing: idx.episodes.some(isOngoing),
  };
}

const stat = (arr) => ({ n: arr.length, avg: mean(arr) });

export function compareByStatus(idx, db, from, to, getter) {
  const mig = [];
  const non = [];
  const start = from < idx.trackingStart ? idx.trackingStart : from;
  const end = to > idx.today ? idx.today : to;
  if (start > end) return { mig: stat(mig), non: stat(non) };
  for (const d of eachDay(start, end)) {
    const st = dayStatus(idx, db, d);
    if (st !== 'migraine' && st !== 'free' && st !== 'assumed') continue;
    const v = getter(d);
    if (v == null || !Number.isFinite(v)) continue;
    (st === 'migraine' ? mig : non).push(v);
  }
  return { mig: stat(mig), non: stat(non) };
}

export const sleepGetter = (db) => (d) => (db.days[d] && db.days[d].sleepH != null ? db.days[d].sleepH : null);
export const stressGetter = (db) => (d) => (db.days[d] && db.days[d].stress != null ? db.days[d].stress : null);
export const pressureLevelGetter = (db) => (d) => (db.weather[d] ? db.weather[d].p : null);
export const pressureChangeGetter = (db) => (d) => {
  const w = db.weather[d];
  const prev = db.weather[addDays(d, -1)];
  return w && prev ? Math.abs(w.p - prev.p) : null;
};

export function preventiveEffect(idx, db, p, today, windowDays = 60) {
  const beforeFrom = addDays(p.start, -windowDays);
  const beforeTo = addDays(p.start, -1);
  const afterRaw = addDays(p.start, windowDays - 1);
  const capped = p.end && p.end < afterRaw ? p.end : afterRaw;
  const afterTo = capped > today ? today : capped;
  if (afterTo < p.start) return null;
  const before = rangeStats(idx, db, beforeFrom, beforeTo);
  const after = rangeStats(idx, db, p.start, afterTo);
  if (before.trackedDays < 30 || after.trackedDays < 30) return null;
  const per30 = (s) => (s.migraineDays / s.trackedDays) * 30;
  const att30 = (s) => (s.attacks / s.trackedDays) * 30;
  return {
    before: { days: per30(before), attacks: att30(before), tracked: before.trackedDays },
    after: { days: per30(after), attacks: att30(after), tracked: after.trackedDays },
  };
}

export function menstrualLink(idx, db, from, to) {
  const hasData = Object.values(db.days).some((d) => d.menses);
  if (!hasData) return null;
  const eps = episodesInRange(idx, from, to);
  let near = 0;
  for (const e of eps) {
    const d = dateOf(e.start);
    if ([-2, -1, 0, 1, 2].some((o) => db.days[addDays(d, o)] && db.days[addDays(d, o)].menses)) near += 1;
  }
  return { attacks: eps.length, near, pct: eps.length ? near / eps.length : 0 };
}

export function yearGrid(idx, db, endMonth, months = 12) {
  const rows = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const m = addMonths(endMonth, -i);
    const n = daysInMonth(m);
    const cells = [];
    for (let day = 1; day <= 31; day += 1) {
      if (day > n) {
        cells.push(null);
        continue;
      }
      const date = `${m}-${String(day).padStart(2, '0')}`;
      cells.push({ date, status: dayStatus(idx, db, date), intensity: idx.intensityByDay.get(date) || 0 });
    }
    rows.push({ month: m, label: fmtMonthShort(m), cells });
  }
  return rows;
}

const f1 = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');
const pctText = (p) => `${Math.round(p * 100)}%`;

export function buildInsights(idx, db, today) {
  const out = [];
  if (!idx.episodes.length) return out;

  const cur = rangeStats(idx, db, addDays(today, -29), today);
  const prev = rangeStats(idx, db, addDays(today, -59), addDays(today, -30));
  if (idx.trackingStart <= addDays(today, -59)) {
    const diff = cur.migraineDays - prev.migraineDays;
    if (diff <= -3) {
      out.push({ id: 'trend', tone: 'good', icon: 'trend-down', text: `Buone notizie: negli ultimi 30 giorni hai avuto ${cur.migraineDays} giorni di emicrania, contro i ${prev.migraineDays} dei 30 giorni precedenti.` });
    } else if (diff >= 3) {
      out.push({ id: 'trend', tone: 'warn', icon: 'trend-up', text: `Negli ultimi 30 giorni hai avuto ${cur.migraineDays} giorni di emicrania, in aumento rispetto ai ${prev.migraineDays} dei 30 precedenti. Se la tendenza continua, parlane con il medico.` });
    } else {
      out.push({ id: 'trend', tone: 'info', icon: 'activity', text: `Frequenza stabile: ${cur.migraineDays} giorni di emicrania negli ultimi 30 giorni (${prev.migraineDays} nei 30 precedenti).` });
    }
  }

  const sinceDays = streakInfo(idx, today);
  if (sinceDays.daysSince != null && sinceDays.daysSince >= 7 && !sinceDays.ongoing) {
    out.push({ id: 'streak', tone: 'good', icon: 'sun', text: `Sono ${sinceDays.daysSince} giorni dall'ultimo giorno di emicrania${sinceDays.longestFree > sinceDays.daysSince ? ` (il tuo record è ${sinceDays.longestFree})` : ': è il tuo record finora'}.` });
  }

  const eps = idx.episodes;
  const trig = countLabels(eps, 'triggers');
  if (eps.length >= 4 && trig.length && trig[0].count >= 3 && trig[0].pct >= 0.3) {
    out.push({ id: 'trigger', tone: 'info', icon: 'bolt', text: `Il fattore più segnalato è «${trig[0].label}»: presente in ${trig[0].count} attacchi su ${eps.length} (${pctText(trig[0].pct)}).` });
  }

  if (eps.length >= 8) {
    const wd = weekdayCounts(eps);
    const max = Math.max(...wd);
    if (max / eps.length >= 0.32) {
      out.push({ id: 'weekday', tone: 'info', icon: 'calendar', text: `Gli attacchi iniziano più spesso di ${WEEKDAYS_LONG[wd.indexOf(max)]} (${max} su ${eps.length}).` });
    }
    const pd = partOfDayCounts(eps);
    const pmax = Math.max(...pd);
    const known = pd.reduce((a, b) => a + b, 0);
    if (known >= 8 && pmax / known >= 0.5) {
      const part = PARTS_OF_DAY[pd.indexOf(pmax)];
      out.push({ id: 'partofday', tone: 'info', icon: 'clock', text: `Più della metà degli attacchi inizia ${part.id === 'night' ? 'di notte' : part.id === 'morning' ? 'al mattino' : part.id === 'afternoon' ? 'nel pomeriggio' : 'la sera'} (${part.range}).` });
    }
  }

  const start = addDays(today, -179);
  const sleep = compareByStatus(idx, db, start, today, sleepGetter(db));
  if (sleep.mig.n >= 5 && sleep.non.n >= 5 && Math.abs(sleep.mig.avg - sleep.non.avg) >= 0.75) {
    out.push({ id: 'sleep', tone: 'info', icon: 'moon', text: `Sonno: nei giorni di emicrania hai registrato in media ${f1(sleep.mig.avg)} ore, negli altri giorni ${f1(sleep.non.avg)} ore.` });
  }
  const stress = compareByStatus(idx, db, start, today, stressGetter(db));
  if (stress.mig.n >= 5 && stress.non.n >= 5 && stress.mig.avg - stress.non.avg >= 0.6) {
    out.push({ id: 'stress', tone: 'info', icon: 'bolt', text: `Stress: livello medio ${f1(stress.mig.avg)}/5 nei giorni di emicrania contro ${f1(stress.non.avg)}/5 negli altri giorni.` });
  }
  const dp = compareByStatus(idx, db, start, today, pressureChangeGetter(db));
  if (dp.mig.n >= 8 && dp.non.n >= 8 && Math.abs(dp.mig.avg - dp.non.avg) >= 1.5) {
    out.push({ id: 'pressure', tone: 'info', icon: 'cloud', text: `Meteo: nei giorni di emicrania la pressione è cambiata in media di ${f1(dp.mig.avg)} hPa rispetto al giorno prima, contro ${f1(dp.non.avg)} hPa negli altri giorni.` });
  }

  const meds = medStats(eps).filter((m) => m.rated >= 3 && isAcuteClass(m.cls));
  if (meds.length) {
    const best = [...meds].sort((a, b) => b.avgEffect - a.avgEffect)[0];
    if (best.avgEffect >= 1.5) {
      out.push({ id: 'med', tone: 'good', icon: 'pill', text: `Il farmaco con il miglior risultato registrato è «${best.name}»: efficacia media ${f1(best.avgEffect)}/3 su ${best.rated} valutazioni.` });
    }
  }

  const moh = mohStatus(idx, today);
  if (moh.level !== 'ok') {
    out.push({ id: 'moh', tone: 'warn', icon: 'alert', text: `Hai assunto farmaci per il mal di testa in ${moh.any} degli ultimi 30 giorni. Un uso troppo frequente può peggiorare le cefalee: parlane con il medico.` });
  }

  const mens = db.settings.cycle ? menstrualLink(idx, db, addDays(today, -364), today) : null;
  if (mens && mens.attacks >= 5) {
    out.push({ id: 'cycle', tone: 'info', icon: 'drop', text: `${pctText(mens.pct)} degli attacchi (${mens.near} su ${mens.attacks}) è avvenuto entro 2 giorni dalle mestruazioni.` });
  }
  return out;
}

export const classLabelMap = Object.fromEntries(MED_CLASSES.map((c) => [c.id, c.label]));
export { mean, median };
