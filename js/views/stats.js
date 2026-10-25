import { h } from '../dom.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import {
  getIndex, rangeStats, buckets, countLabels, countField, weekdayCounts, partOfDayCounts, intensityHistogram, medStats, mohStatus,
  monthlyMedDays, compareByStatus, sleepGetter, stressGetter, pressureChangeGetter, pressureLevelGetter, menstrualLink, yearGrid,
  buildInsights, PARTS_OF_DAY,
} from '../analysis.js';
import {
  segmented, card, cardTitle, statTile, hbars, emptyState, alertBox, button,
} from '../ui.js';
import { barChart, yearPixels, axisMax } from '../charts.js';
import {
  INTENSITY_COLORS, intensityColor, typeLabel, sideLabel, medClassLabel,
} from '../data.js';
import {
  todayStr, addDays, monthOf, formatDuration, fmtDayMonth, WEEKDAYS_LETTER,
} from '../dates.js';
import { plural, num, pct } from '../format.js';
import { openEpisodeEditor } from './episode.js';
import { longTermCard, openTherapies } from './therapies.js';

const state = { period: '90' };
const PERIODS = [
  { value: '30', label: '30 g', days: 30 },
  { value: '90', label: '90 g', days: 90 },
  { value: '180', label: '6 mesi', days: 180 },
  { value: '365', label: '12 mesi', days: 365 },
  { value: 'all', label: 'Tutto', days: null },
];

const kv = (label, value) => h('div', { class: 'kv' }, h('span', {}, label), h('b', {}, value));

function trendChart(idx, db, from, today, days) {
  if (days != null && days <= 30) {
    const bs = buckets(idx, db, from, today, 'day');
    return {
      title: 'Intensità giorno per giorno',
      node: barChart({
        data: bs.map((b) => ({
          label: b.label, value: b.maxIntensity, color: b.maxIntensity ? intensityColor(b.maxIntensity) : null, title: `${fmtDayMonth(b.from)}: ${b.maxIntensity ? `intensità ${b.maxIntensity}` : 'nessun attacco'}`,
        })),
        yMax: 10,
        labelEvery: bs.length > 20 ? 5 : 2,
        ariaLabel: 'Intensità massima giorno per giorno',
      }),
    };
  }
  if (days != null && days <= 90) {
    const bs = buckets(idx, db, from, today, 'week');
    return {
      title: 'Giorni con emicrania per settimana',
      node: barChart({
        data: bs.map((b) => ({ label: b.label.replace(' ', '\u00a0'), value: b.migraineDays, title: `Settimana dal ${fmtDayMonth(b.from)}: ${b.migraineDays} giorni` })),
        yMax: 7,
        labelEvery: 2,
        showValues: true,
        ariaLabel: 'Giorni con emicrania per settimana',
      }),
    };
  }
  const bs = buckets(idx, db, from, today, 'month');
  return {
    title: 'Giorni con emicrania per mese',
    node: barChart({
      data: bs.map((b) => ({ label: b.label, value: b.migraineDays, title: `${b.label}: ${b.migraineDays} giorni, ${plural(b.attacks, 'attacco', 'attacchi')}` })),
      labelEvery: Math.max(1, Math.ceil(bs.length / 12)),
      showValues: bs.length <= 14,
      ariaLabel: 'Giorni con emicrania per mese',
    }),
  };
}

function effectDots(avg) {
  if (avg == null) return h('span', { class: 'muted' }, '—');
  const filled = Math.round(avg);
  return h('span', { class: 'effect-dots', title: `Efficacia media ${num(avg)}/3`, 'aria-label': `Efficacia media ${num(avg)} su 3` }, [1, 2, 3].map((i) => h('i', { class: i <= filled ? 'on' : '' })));
}

export function statsView({ rerender }) {
  const today = todayStr();
  const db = store.getDb();
  const idx = getIndex(db, store.getRev(), today);
  const period = PERIODS.find((p) => p.value === state.period) || PERIODS[1];
  const rawFrom = period.days ? addDays(today, -(period.days - 1)) : idx.trackingStart;
  const from = rawFrom < idx.trackingStart ? idx.trackingStart : rawFrom;
  const seg = segmented({
    options: PERIODS.map((p) => ({ value: p.value, label: p.label })),
    value: period.value,
    ariaLabel: 'Periodo',
    onChange: (v) => { state.period = v; rerender(); },
  });
  const header = { title: 'Analisi', sub: `${fmtDayMonth(from)} – ${fmtDayMonth(today)}` };

  if (!idx.episodes.length) {
    const longTerm = longTermCard(idx, db, today, { title: 'Andamento nel tempo e terapie' });
    return {
      ...header,
      sub: '',
      node: h('div', {}, longTerm, emptyState({
        icon: 'chart',
        title: 'Ancora nessun dato',
        text: 'Registra qualche attacco e, nel tempo, qui vedrai frequenza, intensità, fattori ricorrenti e come rispondi ai farmaci.',
        action: button({ label: 'Registra un attacco', icon: 'plus', onClick: () => openEpisodeEditor({}) }),
      })),
    };
  }

  const stats = rangeStats(idx, db, from, today);
  const eps = stats.episodes;
  const nodes = [h('div', { class: 'mb' }, seg)];

  const months = Math.max(stats.trackedDays / 30.4, 0.1);
  nodes.push(h(
    'div',
    { class: 'stat-grid' },
    statTile({ label: 'Giorni con emicrania', value: String(stats.migraineDays), sub: stats.trackedDays ? `${pct(stats.migraineDays / stats.trackedDays)} dei giorni` : '', tone: 'primary' }),
    statTile({ label: 'Attacchi', value: String(stats.attacks), sub: stats.trackedDays >= 14 ? `${num(stats.attacks / months)} al mese` : '' }),
    statTile({ label: 'Intensità media', value: stats.avgIntensity == null ? '—' : `${num(stats.avgIntensity)}/10`, sub: stats.peakIntensity ? `picco ${stats.peakIntensity}/10` : '' }),
    statTile({ label: 'Durata media', value: formatDuration(stats.avgMinutes), sub: stats.longestMinutes != null ? `più lungo: ${formatDuration(stats.longestMinutes)}` : '' }),
    statTile({ label: 'Giorni con farmaci', value: String(stats.acuteMedDays), sub: 'analgesici, triptani…' }),
    statTile({ label: 'Giorni senza emicrania', value: String(stats.freeDays), tone: 'good', sub: stats.unknownDays ? `${stats.unknownDays} non registrati` : '' }),
  ));

  const insights = buildInsights(idx, db, today);
  if (insights.length) {
    nodes.push(card(
      cardTitle('Cosa emerge'),
      ...insights.map((i) => h('div', { class: 'insight' }, h('span', { class: `row-icon ${i.tone === 'good' ? 'green' : i.tone === 'warn' ? 'orange' : 'blue'}` }, icon(i.icon, 16)), h('p', {}, i.text))),
    ));
  }

  const longTerm = longTermCard(idx, db, today, { title: 'Andamento nel tempo e terapie', action: h('button', { type: 'button', class: 'link', onclick: () => openTherapies() }, 'Terapie') });
  if (longTerm && (db.preventives.length || db.history.periods.length)) nodes.push(longTerm);

  const trend = trendChart(idx, db, from, today, period.days);
  nodes.push(card(cardTitle(trend.title), trend.node));

  nodes.push(card(
    cardTitle('Ultimi 12 mesi'),
    yearPixels(yearGrid(idx, db, monthOf(today), 12)),
    h('div', { class: 'legend' }, [
      ['var(--ok)', 'Senza emicrania (confermato)'], [INTENSITY_COLORS[2], 'Lieve'], [INTENSITY_COLORS[5], 'Moderata'], [INTENSITY_COLORS[8], 'Forte'],
    ].map(([c, l]) => h('span', { class: 'legend-item' }, h('span', { class: 'swatch', style: { background: c, borderColor: 'transparent' } }), l))),
  ));

  if (eps.length) {
    const hist = intensityHistogram(eps);
    nodes.push(card(
      cardTitle('Intensità degli attacchi'),
      barChart({
        data: hist.map((v, i) => ({ label: String(i + 1), value: v, color: INTENSITY_COLORS[i], title: `Intensità ${i + 1}: ${plural(v, 'attacco', 'attacchi')}` })),
        height: 130,
        showValues: true,
        ariaLabel: 'Numero di attacchi per livello di intensità',
      }),
    ));

    const wd = weekdayCounts(eps);
    const pd = partOfDayCounts(eps);
    const knownTime = pd.reduce((a, b) => a + b, 0);
    const unknownTime = eps.length - knownTime;
    nodes.push(card(
      cardTitle('Quando iniziano'),
      h('div', { class: 'field-label' }, 'Giorno della settimana'),
      barChart({
        data: wd.map((v, i) => ({ label: WEEKDAYS_LETTER[i], value: v, title: `${plural(v, 'attacco', 'attacchi')}` })), height: 120, showValues: true, ariaLabel: 'Attacchi per giorno della settimana',
      }),
      h('div', { class: 'field-label', style: { marginTop: '14px' } }, 'Momento della giornata'),
      hbars(PARTS_OF_DAY.map((p, i) => ({ label: `${p.label} (${p.range})`, value: pd[i], text: knownTime ? `${pd[i]} · ${pct(pd[i] / knownTime)}` : '0' })), { max: Math.max(...pd, 1) }),
      unknownTime ? h('p', { class: 'field-hint', style: { marginTop: '8px' } }, `${plural(unknownTime, 'attacco', 'attacchi')} senza orario non ${unknownTime === 1 ? 'è incluso' : 'sono inclusi'}.`) : null,
    ));

    const trig = countLabels(eps, 'triggers').slice(0, 8);
    const sym = countLabels(eps, 'symptoms').slice(0, 8);
    if (trig.length) {
      nodes.push(card(
        cardTitle('Fattori scatenanti più frequenti'),
        hbars(trig.map((t) => ({ label: t.label, value: t.count, text: `${t.count} · ${pct(t.pct)}` })), { max: eps.length }),
        h('p', { class: 'field-hint', style: { marginTop: '10px' } }, `Percentuale sugli ${eps.length} attacchi del periodo.`),
      ));
    }
    if (sym.length) {
      nodes.push(card(
        cardTitle('Sintomi associati'),
        hbars(sym.map((t) => ({ label: t.label, value: t.count, text: `${t.count} · ${pct(t.pct)}` })), { max: eps.length }),
      ));
    }

    const types = countField(eps, 'type', typeLabel);
    const sides = countField(eps, 'side', sideLabel);
    const areas = countLabels(eps, 'areas').slice(0, 5);
    if (types.length || sides.length || areas.length) {
      nodes.push(card(
        cardTitle('Che tipo di mal di testa'),
        types.length ? hbars(types.map((t) => ({ label: t.label, value: t.count, text: `${t.count} · ${pct(t.pct)}` })), { max: eps.length }) : null,
        sides.length ? h('div', { class: 'field-label', style: { margin: '14px 0 8px' } }, 'Lato') : null,
        sides.length ? hbars(sides.map((t) => ({ label: t.label, value: t.count, text: String(t.count) })), { max: eps.length }) : null,
        areas.length ? h('div', { class: 'field-label', style: { margin: '14px 0 8px' } }, 'Zone') : null,
        areas.length ? hbars(areas.map((t) => ({ label: t.label, value: t.count, text: String(t.count) })), { max: eps.length }) : null,
      ));
    }

    const meds = medStats(eps);
    if (meds.length) {
      const medMonths = monthlyMedDays(idx, from, today);
      const moh = mohStatus(idx, today);
      nodes.push(card(
        cardTitle('Farmaci'),
        h(
          'table',
          { class: 'table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Farmaco'), h('th', {}, 'Volte'), h('th', {}, 'Efficacia'))),
          h('tbody', {}, meds.map((m) => h('tr', {}, h('td', {}, h('div', {}, m.name), h('div', { class: 'muted small' }, medClassLabel(m.cls))), h('td', {}, String(m.uses)), h('td', {}, effectDots(m.avgEffect))))),
        ),
        h('p', { class: 'field-hint', style: { marginTop: '10px' } }, 'Efficacia: ● nulla … ●●● risolutiva, in base a come hai valutato ogni assunzione.'),
        h('div', { class: 'field-label', style: { margin: '16px 0 4px' } }, 'Giorni con farmaci per mese'),
        barChart({
          data: medMonths.map((m) => ({
            label: m.label,
            value: m.any,
            color: m.specific >= 10 || m.simple >= 15 ? 'var(--danger)' : (m.any >= 8 ? 'var(--warn)' : null),
            title: `${m.label}: ${plural(m.any, 'giorno', 'giorni')} con farmaci`,
          })),
          yMax: axisMax(Math.max(...medMonths.map((m) => m.any), 10), 10),
          labelEvery: Math.max(1, Math.ceil(medMonths.length / 12)),
          showValues: medMonths.length <= 14,
          ariaLabel: 'Giorni con farmaci per mese',
        }),
        h('p', { class: 'field-hint', style: { marginTop: '6px' } }, 'Per evitare il mal di testa da uso eccessivo di farmaci, i medici consigliano di restare sotto i 10 giorni al mese con triptani, oppioidi o associazioni, e sotto i 15 con antidolorifici semplici.'),
        moh.level !== 'ok' ? h('div', { style: { marginTop: '12px' } }, alertBox({ tone: moh.level === 'warn' ? 'warn' : 'info', icon: 'pill', text: `Ultimi 30 giorni: ${plural(moh.any, 'giorno', 'giorni')} con farmaci${moh.specific ? `, di cui ${moh.specific} con triptani o simili` : ''}.` })) : null,
      ));
    }

    if (stats.lostDays || stats.reducedDays || stats.bedAttacks) {
      nodes.push(card(
        cardTitle('Impatto sulla vita quotidiana'),
        kv('Giornate di lavoro/scuola perse', String(stats.lostDays)),
        kv('Giornate con rendimento ridotto', String(stats.reducedDays)),
        kv('Attacchi che ti hanno costretto a letto', String(stats.bedAttacks)),
      ));
    }
  }

  const sleep = compareByStatus(idx, db, from, today, sleepGetter(db));
  const stress = compareByStatus(idx, db, from, today, stressGetter(db));
  const dp = compareByStatus(idx, db, from, today, pressureChangeGetter(db));
  const pl = compareByStatus(idx, db, from, today, pressureLevelGetter(db));
  const rows = [];
  const cmp = (c, label, fmt, unit) => {
    if (c.mig.n >= 3 && c.non.n >= 3) rows.push(kv(label, `${fmt(c.mig.avg)}${unit} vs ${fmt(c.non.avg)}${unit}`), h('p', { class: 'field-hint', style: { margin: '-4px 0 6px' } }, `giorni con emicrania (${c.mig.n}) vs altri giorni (${c.non.n})`));
  };
  cmp(sleep, 'Ore di sonno', (v) => num(v), ' h');
  cmp(stress, 'Stress (1-5)', (v) => num(v), '');
  cmp(dp, 'Variazione di pressione', (v) => num(v), ' hPa');
  cmp(pl, 'Pressione media', (v) => num(v, 0), ' hPa');
  const mens = db.settings.cycle ? menstrualLink(idx, db, from, today) : null;
  if (mens && mens.attacks) rows.push(kv('Attacchi entro 2 giorni dalle mestruazioni', `${mens.near} su ${mens.attacks} (${pct(mens.pct)})`));
  if (rows.length) {
    nodes.push(card(
      cardTitle('Possibili collegamenti'),
      ...rows,
      h('p', { class: 'field-hint', style: { marginTop: '8px' } }, 'Sono medie dei tuoi dati e indicano associazioni, non cause certe. Più giorni registri (anche senza emicrania), più i confronti diventano affidabili.'),
    ));
  } else {
    nodes.push(card(
      cardTitle('Possibili collegamenti'),
      h('p', { class: 'muted' }, 'Compila ogni tanto i «Dettagli della giornata» (sonno, stress…) anche nei giorni senza emicrania: servono almeno 3 giorni per tipo per confrontare, e meglio ancora tanti di più.'),
    ));
  }

  nodes.push(h('p', { class: 'footnote' }, 'Questa app non sostituisce il parere del medico. Porta le statistiche e il report PDF alla prossima visita.'));
  return { ...header, node: h('div', {}, ...nodes) };
}
