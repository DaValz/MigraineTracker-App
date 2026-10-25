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
import { num, pct } from '../format.js';
import { t, tv } from '../i18n.js';
import { openEpisodeEditor } from './episode.js';
import { longTermCard, openTherapies } from './therapies.js';

const state = { period: '90' };
const PERIODS = [
  { value: '30', label: t('{d} g', { d: 30 }), days: 30 },
  { value: '90', label: t('{d} g', { d: 90 }), days: 90 },
  { value: '180', label: t('{n, plural, one {# mese} other {# mesi}}', { n: 6 }), days: 180 },
  { value: '365', label: t('{n, plural, one {# mese} other {# mesi}}', { n: 12 }), days: 365 },
  { value: 'all', label: t('Tutto'), days: null },
];

const kv = (label, value) => h('div', { class: 'kv' }, h('span', {}, label), h('b', {}, value));

function trendChart(idx, db, from, today, days) {
  if (days != null && days <= 30) {
    const bs = buckets(idx, db, from, today, 'day');
    return {
      title: t('Intensità giorno per giorno'),
      node: barChart({
        data: bs.map((b) => ({
          label: b.label,
          value: b.maxIntensity,
          color: b.maxIntensity ? intensityColor(b.maxIntensity) : null,
          title: b.maxIntensity ? t('{data}: intensità {intensita}', { data: fmtDayMonth(b.from), intensita: b.maxIntensity }) : t('{data}: nessun attacco', { data: fmtDayMonth(b.from) }),
        })),
        yMax: 10,
        labelEvery: bs.length > 20 ? 5 : 2,
        ariaLabel: t('Intensità massima giorno per giorno'),
      }),
    };
  }
  if (days != null && days <= 90) {
    const bs = buckets(idx, db, from, today, 'week');
    return {
      title: t('Giorni con emicrania per settimana'),
      node: barChart({
        data: bs.map((b) => ({
          label: b.label.replace(' ', '\u00a0'),
          value: b.migraineDays,
          title: t('{n, plural, one {Settimana dal {data}: # giorno} other {Settimana dal {data}: # giorni}}', { n: b.migraineDays, data: fmtDayMonth(b.from) }),
        })),
        yMax: 7,
        labelEvery: 2,
        showValues: true,
        ariaLabel: t('Giorni con emicrania per settimana'),
      }),
    };
  }
  const bs = buckets(idx, db, from, today, 'month');
  return {
    title: t('Giorni con emicrania per mese'),
    node: barChart({
      data: bs.map((b) => ({
        label: b.label,
        value: b.migraineDays,
        title: `${b.label}: ${t('{n, plural, one {# giorno} other {# giorni}}', { n: b.migraineDays })}, ${t('{n, plural, one {# attacco} other {# attacchi}}', { n: b.attacks })}`,
      })),
      labelEvery: Math.max(1, Math.ceil(bs.length / 12)),
      showValues: bs.length <= 14,
      ariaLabel: t('Giorni con emicrania per mese'),
    }),
  };
}

function effectDots(avg) {
  if (avg == null) return h('span', { class: 'muted' }, '—');
  const filled = Math.round(avg);
  return h('span', { class: 'effect-dots', title: t('Efficacia media {valore}/3', { valore: num(avg) }), 'aria-label': t('Efficacia media {valore} su 3', { valore: num(avg) }) }, [1, 2, 3].map((i) => h('i', { class: i <= filled ? 'on' : '' })));
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
    ariaLabel: t('Periodo'),
    onChange: (v) => { state.period = v; rerender(); },
  });
  const header = { title: t('Analisi'), sub: `${fmtDayMonth(from)} – ${fmtDayMonth(today)}` };

  if (!idx.episodes.length) {
    const longTerm = longTermCard(idx, db, today, { title: t('Andamento nel tempo e terapie') });
    return {
      ...header,
      sub: '',
      node: h('div', {}, longTerm, emptyState({
        icon: 'chart',
        title: t('Ancora nessun dato'),
        text: t('Registra qualche attacco e, nel tempo, qui vedrai frequenza, intensità, fattori ricorrenti e come rispondi ai farmaci.'),
        action: button({ label: t('Registra un attacco'), icon: 'plus', onClick: () => openEpisodeEditor({}) }),
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
    statTile({ label: t('Giorni con emicrania'), value: String(stats.migraineDays), sub: stats.trackedDays ? t('{percentuale} dei giorni', { percentuale: pct(stats.migraineDays / stats.trackedDays) }) : '', tone: 'primary' }),
    statTile({ label: t('Attacchi'), value: String(stats.attacks), sub: stats.trackedDays >= 14 ? t('{valore} al mese', { valore: num(stats.attacks / months) }) : '' }),
    statTile({ label: t('Intensità media'), value: stats.avgIntensity == null ? '—' : `${num(stats.avgIntensity)}/10`, sub: stats.peakIntensity ? t('picco {valore}/10', { valore: stats.peakIntensity }) : '' }),
    statTile({ label: t('Durata media'), value: formatDuration(stats.avgMinutes), sub: stats.longestMinutes != null ? t('più lungo: {durata}', { durata: formatDuration(stats.longestMinutes) }) : '' }),
    statTile({ label: t('Giorni con farmaci'), value: String(stats.acuteMedDays), sub: t('analgesici, triptani…') }),
    statTile({ label: t('Giorni senza emicrania'), value: String(stats.freeDays), tone: 'good', sub: stats.unknownDays ? t('{n, plural, one {# non registrato} other {# non registrati}}', { n: stats.unknownDays }) : '' }),
  ));

  const insights = buildInsights(idx, db, today);
  if (insights.length) {
    nodes.push(card(
      cardTitle(t('Cosa emerge')),
      ...insights.map((i) => h('div', { class: 'insight' }, h('span', { class: `row-icon ${i.tone === 'good' ? 'green' : i.tone === 'warn' ? 'orange' : 'blue'}` }, icon(i.icon, 16)), h('p', {}, i.text))),
    ));
  }

  const longTerm = longTermCard(idx, db, today, { title: t('Andamento nel tempo e terapie'), action: h('button', { type: 'button', class: 'link', onclick: () => openTherapies() }, t('Terapie')) });
  if (longTerm && (db.preventives.length || db.history.periods.length)) nodes.push(longTerm);

  const trend = trendChart(idx, db, from, today, period.days);
  nodes.push(card(cardTitle(trend.title), trend.node));

  nodes.push(card(
    cardTitle(t('Ultimi 12 mesi')),
    yearPixels(yearGrid(idx, db, monthOf(today), 12)),
    h('div', { class: 'legend' }, [
      ['var(--ok)', t('Senza emicrania (confermato)')], [INTENSITY_COLORS[2], t('Lieve')], [INTENSITY_COLORS[5], t('Moderata')], [INTENSITY_COLORS[8], t('Forte')],
    ].map(([c, l]) => h('span', { class: 'legend-item' }, h('span', { class: 'swatch', style: { background: c, borderColor: 'transparent' } }), l))),
  ));

  if (eps.length) {
    const hist = intensityHistogram(eps);
    nodes.push(card(
      cardTitle(t('Intensità degli attacchi')),
      barChart({
        data: hist.map((v, i) => ({ label: String(i + 1), value: v, color: INTENSITY_COLORS[i], title: t('Intensità {livello}: {n, plural, one {# attacco} other {# attacchi}}', { livello: i + 1, n: v }) })),
        height: 130,
        showValues: true,
        ariaLabel: t('Numero di attacchi per livello di intensità'),
      }),
    ));

    const wd = weekdayCounts(eps);
    const pd = partOfDayCounts(eps);
    const knownTime = pd.reduce((a, b) => a + b, 0);
    const unknownTime = eps.length - knownTime;
    nodes.push(card(
      cardTitle(t('Quando iniziano')),
      h('div', { class: 'field-label' }, t('Giorno della settimana')),
      barChart({
        data: wd.map((v, i) => ({ label: WEEKDAYS_LETTER[i], value: v, title: t('{n, plural, one {# attacco} other {# attacchi}}', { n: v }) })), height: 120, showValues: true, ariaLabel: t('Attacchi per giorno della settimana'),
      }),
      h('div', { class: 'field-label', style: { marginTop: '14px' } }, t('Momento della giornata')),
      hbars(PARTS_OF_DAY.map((p, i) => ({ label: `${p.label} (${p.range})`, value: pd[i], text: knownTime ? `${pd[i]} · ${pct(pd[i] / knownTime)}` : '0' })), { max: Math.max(...pd, 1) }),
      unknownTime ? h('p', { class: 'field-hint', style: { marginTop: '8px' } }, t('{n, plural, one {# attacco senza orario non è incluso.} other {# attacchi senza orario non sono inclusi.}}', { n: unknownTime })) : null,
    ));

    const trig = countLabels(eps, 'triggers').slice(0, 8);
    const sym = countLabels(eps, 'symptoms').slice(0, 8);
    if (trig.length) {
      nodes.push(card(
        cardTitle(t('Fattori scatenanti più frequenti')),
        hbars(trig.map((x) => ({ label: x.label, value: x.count, text: `${x.count} · ${pct(x.pct)}` })), { max: eps.length }),
        h('p', { class: 'field-hint', style: { marginTop: '10px' } }, t('{n, plural, one {Percentuale sull’attacco del periodo.} other {Percentuale sugli # attacchi del periodo.}}', { n: eps.length })),
      ));
    }
    if (sym.length) {
      nodes.push(card(
        cardTitle(t('Sintomi associati')),
        hbars(sym.map((x) => ({ label: x.label, value: x.count, text: `${x.count} · ${pct(x.pct)}` })), { max: eps.length }),
      ));
    }

    const types = countField(eps, 'type', typeLabel);
    const sides = countField(eps, 'side', sideLabel);
    const areas = countLabels(eps, 'areas').slice(0, 5);
    if (types.length || sides.length || areas.length) {
      nodes.push(card(
        cardTitle(t('Che tipo di mal di testa')),
        types.length ? hbars(types.map((x) => ({ label: x.label, value: x.count, text: `${x.count} · ${pct(x.pct)}` })), { max: eps.length }) : null,
        sides.length ? h('div', { class: 'field-label', style: { margin: '14px 0 8px' } }, t('Lato')) : null, // i18n-ignore
        sides.length ? hbars(sides.map((x) => ({ label: x.label, value: x.count, text: String(x.count) })), { max: eps.length }) : null,
        areas.length ? h('div', { class: 'field-label', style: { margin: '14px 0 8px' } }, t('Zone')) : null, // i18n-ignore
        areas.length ? hbars(areas.map((x) => ({ label: x.label, value: x.count, text: String(x.count) })), { max: eps.length }) : null,
      ));
    }

    const meds = medStats(eps);
    if (meds.length) {
      const medMonths = monthlyMedDays(idx, from, today);
      const moh = mohStatus(idx, today);
      nodes.push(card(
        cardTitle(t('Farmaci')),
        h(
          'table',
          { class: 'table' },
          h('thead', {}, h('tr', {}, h('th', {}, t('Farmaco')), h('th', {}, t('Volte')), h('th', {}, t('Efficacia')))),
          h('tbody', {}, meds.map((m) => h('tr', {}, h('td', {}, h('div', {}, tv(m.name)), h('div', { class: 'muted small' }, medClassLabel(m.cls))), h('td', {}, String(m.uses)), h('td', {}, effectDots(m.avgEffect))))),
        ),
        h('p', { class: 'field-hint', style: { marginTop: '10px' } }, t('Efficacia: ● nulla … ●●● risolutiva, in base a come hai valutato ogni assunzione.')),
        h('div', { class: 'field-label', style: { margin: '16px 0 4px' } }, t('Giorni con farmaci per mese')), // i18n-ignore
        barChart({
          data: medMonths.map((m) => ({
            label: m.label,
            value: m.any,
            color: m.specific >= 10 || m.simple >= 15 ? 'var(--danger)' : (m.any >= 8 ? 'var(--warn)' : null),
            title: t('{mese}: {n, plural, one {# giorno con farmaci} other {# giorni con farmaci}}', { mese: m.label, n: m.any }),
          })),
          yMax: axisMax(Math.max(...medMonths.map((m) => m.any), 10), 10),
          labelEvery: Math.max(1, Math.ceil(medMonths.length / 12)),
          showValues: medMonths.length <= 14,
          ariaLabel: t('Giorni con farmaci per mese'),
        }),
        h('p', { class: 'field-hint', style: { marginTop: '6px' } }, t('Per evitare il mal di testa da uso eccessivo di farmaci, i medici consigliano di restare sotto i 10 giorni al mese con triptani, oppioidi o associazioni, e sotto i 15 con antidolorifici semplici.')),
        moh.level !== 'ok' ? h('div', { style: { marginTop: '12px' } }, alertBox({
          tone: moh.level === 'warn' ? 'warn' : 'info',
          icon: 'pill',
          text: moh.specific
            ? t('{n, plural, one {Ultimi 30 giorni: # giorno con farmaci, di cui {specifici} con triptani o simili.} other {Ultimi 30 giorni: # giorni con farmaci, di cui {specifici} con triptani o simili.}}', { n: moh.any, specifici: moh.specific })
            : t('{n, plural, one {Ultimi 30 giorni: # giorno con farmaci.} other {Ultimi 30 giorni: # giorni con farmaci.}}', { n: moh.any }),
        })) : null,
      ));
    }

    if (stats.lostDays || stats.reducedDays || stats.bedAttacks) {
      nodes.push(card(
        cardTitle(t('Impatto sulla vita quotidiana')),
        kv(t('Giornate di lavoro/scuola perse'), String(stats.lostDays)),
        kv(t('Giornate con rendimento ridotto'), String(stats.reducedDays)),
        kv(t('Attacchi che ti hanno costretto a letto'), String(stats.bedAttacks)),
      ));
    }
  }

  const sleep = compareByStatus(idx, db, from, today, sleepGetter(db));
  const stress = compareByStatus(idx, db, from, today, stressGetter(db));
  const dp = compareByStatus(idx, db, from, today, pressureChangeGetter(db));
  const pl = compareByStatus(idx, db, from, today, pressureLevelGetter(db));
  const rows = [];
  const cmp = (c, label, show) => {
    if (c.mig.n >= 3 && c.non.n >= 3) {
      rows.push(
        kv(label, t('{emicrania} vs {altri}', { emicrania: show(c.mig.avg), altri: show(c.non.avg) })),
        h('p', { class: 'field-hint', style: { margin: '-4px 0 6px' } }, t('giorni con emicrania ({n}) vs altri giorni ({m})', { n: c.mig.n, m: c.non.n })), // i18n-ignore
      );
    }
  };
  cmp(sleep, t('Ore di sonno'), (v) => t('{h} h', { h: num(v) }));
  cmp(stress, t('Stress (1-5)'), (v) => num(v));
  cmp(dp, t('Variazione di pressione'), (v) => `${num(v)} hPa`); // i18n-ignore
  cmp(pl, t('Pressione media'), (v) => `${num(v, 0)} hPa`); // i18n-ignore
  const mens = db.settings.cycle ? menstrualLink(idx, db, from, today) : null;
  if (mens && mens.attacks) rows.push(kv(t('Attacchi entro 2 giorni dalle mestruazioni'), t('{n} su {tot} ({percentuale})', { n: mens.near, tot: mens.attacks, percentuale: pct(mens.pct) })));
  if (rows.length) {
    nodes.push(card(
      cardTitle(t('Possibili collegamenti')),
      ...rows,
      h('p', { class: 'field-hint', style: { marginTop: '8px' } }, t('Sono medie dei tuoi dati e indicano associazioni, non cause certe. Più giorni registri (anche senza emicrania), più i confronti diventano affidabili.')),
    ));
  } else {
    nodes.push(card(
      cardTitle(t('Possibili collegamenti')),
      h('p', { class: 'muted' }, t('Compila ogni tanto i «Dettagli della giornata» (sonno, stress…) anche nei giorni senza emicrania: servono almeno 3 giorni per tipo per confrontare, e meglio ancora tanti di più.')),
    ));
  }

  nodes.push(h('p', { class: 'footnote' }, t('Questa app non sostituisce il parere del medico. Porta le statistiche e il report PDF alla prossima visita.')));
  return { ...header, node: h('div', {}, ...nodes) };
}
