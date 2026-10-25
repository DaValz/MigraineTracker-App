/* i18n-ignore-file */
/* Dalle voci lette (parse.js) agli attacchi dell'app: valori predefiniti, doppioni, unione dei giorni consecutivi.
 * Logica pura, senza DOM: l'anteprima la usa per mostrare il risultato e la importazione per crearlo. */

const dayMs = 86400000;
export const addDaysIso = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};
export const diffDaysIso = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / dayMs);

const uniq = (list) => [...new Set(list)];

/** Giorni coperti da una voce (un attacco su piu' giorni ne copre diversi). */
export function daysOf(date, endDate) {
  if (!date) return [];
  const out = [date];
  if (endDate && endDate > date) {
    for (let d = addDaysIso(date, 1); d <= endDate && out.length < 31; d = addDaysIso(d, 1)) out.push(d);
  }
  return out;
}

/**
 * Prepara le righe dell'anteprima: aggiunge a ogni voce lo stato (incluso o no), i problemi da controllare e i valori effettivi.
 * overrides: Map chiave -> { include, date, endDate, intensity, note, removedMeds: Set }
 */
export function annotate(entries, {
  existingDays = new Set(), today, skipExisting = true, overrides = new Map(), excludedMeds = new Set(),
} = {}) {
  return entries.map((e) => {
    const ov = overrides.get(e.key) || {};
    const kind = ov.asAttack ? 'attack' : e.kind;
    const date = 'date' in ov ? ov.date : e.date;
    const endDate = 'endDate' in ov ? ov.endDate : (ov.date ? null : e.endDate);
    const meds = e.meds.filter((m) => !excludedMeds.has(m.name) && !(ov.removedMeds && ov.removedMeds.has(m.name)));
    const days = daysOf(date, endDate);
    const existing = days.some((d) => existingDays.has(d));
    const issues = [];
    if (!date) issues.push(e.problem === 'badRange' ? 'badRange' : 'invalidDate');
    if (date && today && date > today) issues.push('future');
    if (existing && kind !== 'menses') issues.push('existing');
    if (kind === 'free') issues.push('free');
    if (kind === 'other') issues.push('other');
    if (kind === 'menses') issues.push('mensesOnly');
    if (e.flags.dupDate && !('date' in ov)) issues.push('dupDate');
    if (e.flags.rangeLong) issues.push('rangeLong');
    if (meds.some((m) => m.unknown)) issues.push('unknownMed');
    if (e.flags.noDetails && kind === 'attack') issues.push('noDetails');
    const dayOnly = kind === 'free' || kind === 'menses';
    const skipped = kind !== 'menses' && skipExisting && existing;
    const autoInclude = (kind === 'attack' || dayOnly) && !!date && !(today && date > today) && !skipped;
    return {
      ...e,
      kind,
      kindRaw: e.kind,
      meds,
      date,
      endDate,
      existing,
      issues,
      review: issues.some((i) => ['invalidDate', 'badRange', 'future', 'rangeLong', 'dupDate', 'unknownMed', 'other'].includes(i)),
      include: 'include' in ov ? !!ov.include && !!date : autoInclude,
      intensityEff: ov.intensity != null ? ov.intensity : e.intensity,
      textEff: 'note' in ov ? ov.note : e.text,
      edited: Object.keys(ov).length > 0,
    };
  });
}

/** Elenco dei farmaci trovati con quante volte e con quali parole: serve a escluderli o controllarli in blocco. */
export function medSummary(entries) {
  const map = new Map();
  entries.forEach((e) => e.meds.forEach((m) => {
    const cur = map.get(m.name) || {
      name: m.name, cls: m.cls, count: 0, terms: new Set(), unknown: !!m.unknown,
    };
    cur.count += 1;
    if (m.term) cur.terms.add(m.term.toLowerCase());
    map.set(m.name, cur);
  }));
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).map((m) => ({ ...m, terms: [...m.terms].slice(0, 4) }));
}

function expandMeds(meds, date) {
  const at = `${date}T12:00`;
  const out = [];
  meds.forEach((m) => {
    for (let i = 0; i < Math.max(1, m.count || 1); i += 1) {
      out.push({
        name: m.name, cls: m.cls || 'other', dose: m.dose || '', at, effect: m.effect == null ? null : m.effect,
      });
    }
  });
  return out.slice(0, 20);
}

const maxDate = (a, b) => (a > b ? a : b);

function mergeGroup(group, { defaultIntensity, fmtDay }) {
  if (group.length === 1) return group[0];
  const first = group[0];
  let end = first.endDate || first.date;
  group.forEach((g) => { end = maxDate(end, g.endDate || g.date); });
  const sides = uniq(group.map((g) => g.side).filter(Boolean));
  const medsByName = new Map();
  group.forEach((g) => g.meds.forEach((m) => {
    const cur = medsByName.get(m.name);
    if (!cur) medsByName.set(m.name, { ...m });
    else {
      cur.count = Math.min(4, Math.max(cur.count, m.count));
      if (!cur.dose && m.dose) cur.dose = m.dose;
      if (cur.effect == null && m.effect != null) cur.effect = m.effect;
    }
  }));
  const text = group.map((g) => (g.textEff ? `${fmtDay ? fmtDay(g.date) : g.date}: ${g.textEff}` : '')).filter(Boolean).join('\n');
  return {
    ...first,
    date: first.date,
    endDate: end > first.date ? end : null,
    intensityEff: Math.max(...group.map((g) => (g.intensityEff != null ? g.intensityEff : defaultIntensity))),
    side: sides.length > 1 ? 'alt' : (sides[0] || ''),
    areas: uniq(group.flatMap((g) => g.areas)),
    quality: uniq(group.flatMap((g) => g.quality)),
    aura: uniq(group.flatMap((g) => g.aura)),
    symptoms: uniq(group.flatMap((g) => g.symptoms)),
    triggers: uniq(group.flatMap((g) => g.triggers)),
    type: group.some((g) => g.type === 'con_aura') ? 'con_aura' : (group.map((g) => g.type).find(Boolean) || ''),
    meds: [...medsByName.values()],
    textEff: text,
    approxDur: '',
    menses: group.some((g) => g.menses),
    mensesToday: group.some((g) => g.mensesToday),
    er: group.some((g) => g.er),
    hosp: group.some((g) => g.hosp),
    merged: group.length,
  };
}

/** Gruppi di voci su giorni consecutivi (o sovrapposti) da unire in un solo attacco. */
export function groupConsecutive(rows) {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const groups = [];
  sorted.forEach((r) => {
    const last = groups[groups.length - 1];
    if (last) {
      const lastEnd = last.reduce((mx, x) => maxDate(mx, x.endDate || x.date), last[0].date);
      if (diffDaysIso(lastEnd, r.date) <= 1) {
        last.push(r);
        return;
      }
    }
    groups.push([r]);
  });
  return groups;
}

export function hasConsecutive(rows) {
  return groupConsecutive(rows.filter((r) => r.include && r.date && r.kind !== 'free' && r.kind !== 'menses')).some((g) => g.length > 1);
}

/**
 * Costruisce cio' che va salvato.
 * opts: { imp, defaultIntensity, mergeConsecutive, fmtDay, knownMeds: Set(nomi minuscoli), titles: { er, hosp }, existingErDates: Set, addEvents }
 */
export function buildImport(rows, opts = {}) {
  const {
    imp = '', defaultIntensity = 5, mergeConsecutive = false, fmtDay = null, knownMeds = new Set(), titles = {}, existingErDates = new Set(), addEvents = true,
  } = opts;
  const all = rows.filter((r) => r.include && r.date);
  const dayOnly = (r) => r.kind === 'free' || r.kind === 'menses';
  const chosen = all.filter((r) => !dayOnly(r));
  const units = mergeConsecutive ? groupConsecutive(chosen).map((g) => mergeGroup(g, { defaultIntensity, fmtDay })) : chosen;
  const episodes = units.map((r) => {
    const end = r.endDate && r.endDate > r.date ? r.endDate : null;
    return {
      start: `${r.date}T12:00`,
      end: `${end || r.date}T12:00`,
      timeUnknown: true,
      approxDur: end ? 'days' : (r.approxDur || ''),
      intensity: r.intensityEff != null ? r.intensityEff : defaultIntensity,
      type: r.type || '',
      side: r.side || '',
      areas: r.areas,
      quality: r.quality,
      aura: r.aura,
      symptoms: r.symptoms,
      triggers: r.triggers,
      meds: expandMeds(r.meds, r.date),
      note: r.textEff || '',
      imp,
    };
  });

  const days = {};
  chosen.forEach((r) => { if (r.mensesToday) days[r.date] = { menses: true }; });
  const attackDays = new Set(chosen.flatMap((r) => daysOf(r.date, r.endDate)));
  all.filter((r) => r.kind === 'menses').forEach((r) => daysOf(r.date, r.endDate).forEach((d) => { days[d] = { ...(days[d] || {}), menses: true }; }));
  all.filter((r) => r.kind === 'free').forEach((r) => daysOf(r.date, r.endDate).forEach((d) => { if (!attackDays.has(d)) days[d] = { ...(days[d] || {}), free: true }; }));

  const events = [];
  if (addEvents) {
    chosen.filter((r) => (r.er || r.hosp) && !existingErDates.has(r.date)).forEach((r) => {
      events.push({
        date: r.date,
        title: r.hosp && !r.er ? (titles.hosp || '') : (titles.er || ''),
        text: (r.textEff || '').slice(0, 3000),
        intensity: r.intensityEff != null ? r.intensityEff : null,
        er: !!r.er,
        hosp: !!r.hosp,
      });
    });
  }

  const newMeds = new Map();
  chosen.forEach((r) => r.meds.forEach((m) => {
    const key = m.name.toLowerCase();
    if (!knownMeds.has(key) && !newMeds.has(key)) newMeds.set(key, { name: m.name, cls: m.cls || 'other' });
  }));

  const dates = all.map((r) => r.date).sort();
  const dayList = Object.values(days);
  return {
    episodes,
    days,
    events,
    customMeds: [...newMeds.values()],
    first: dates[0] || null,
    last: dates[dates.length - 1] || null,
    menses: dayList.filter((d) => d.menses).length,
    freeDays: dayList.filter((d) => d.free).length,
    merged: mergeConsecutive ? chosen.length - units.length : 0,
  };
}
