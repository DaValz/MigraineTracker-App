import { h, replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import { getIndex, dayStatus, rangeStats } from '../analysis.js';
import {
  segmented, button, emptyState, chipGroup, statTile, card,
} from '../ui.js';
import { intensityColor, typeLabel } from '../data.js';
import {
  todayStr, monthOf, addMonths, fmtMonthYear, weekdayMon, daysInMonth, monthStart, monthEnd, WEEKDAYS_SHORT, WEEKDAYS_LETTER, fmtDateLong, pad,
  fmt, capitalize, monthsBetween,
} from '../dates.js';
import { t, tv } from '../i18n.js';
import { intensityLegend } from '../charts.js';
import { episodeCard, monthHeader } from './shared.js';
import { openDaySheet } from './day.js';
import { openEpisodeEditor } from './episode.js';
import { openNotesImport } from './notes-import.js';

// Preferenze di sola visualizzazione: restano sul dispositivo, fuori dal diario e dai backup.
const VIEW_KEY = 'emicrania.diario.vista';
const SPAN_KEY = 'emicrania.diario.mesi';
const MODES = ['month', 'months', 'list'];
const SPANS = [6, 12];

function readPref(key) {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function savePref(key, value) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, String(value));
  } catch (e) { /* memoria non disponibile: la scelta vale fino alla chiusura */ }
}

const state = {
  month: null,
  mode: MODES.includes(readPref(VIEW_KEY)) ? readPref(VIEW_KEY) : 'month',
  span: SPANS.includes(Number(readPref(SPAN_KEY))) ? Number(readPref(SPAN_KEY)) : 6,
  rangeEnd: null,
  query: '',
  filter: 'all',
};

/** Porta il diario sul mese indicato (usato dopo un'importazione). */
export function showCalendarMonth(month) {
  if (month) state.month = month;
  state.mode = 'month';
}

function setMode(mode) {
  state.mode = mode;
  savePref(VIEW_KEY, mode);
}

function onSwipe(el, fn) {
  let sx = 0;
  let sy = 0;
  el.addEventListener('touchstart', (e) => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - sx;
    const dy = touch.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 45) fn(dx < 0 ? 1 : -1);
  }, { passive: true });
}

const FILTERS = {
  all: () => true,
  strong: (e) => e.intensity >= 7,
  meds: (e) => e.meds.length > 0,
  aura: (e) => e.type === 'con_aura' || e.aura.length > 0,
};

// Si cerca sia nei valori salvati (italiano) sia nel testo mostrato nella lingua corrente.
function haystack(e) {
  const stored = [...e.areas, ...e.symptoms, ...e.triggers, ...e.meds.map((m) => m.name)];
  return `${[e.note, typeLabel(e.type), ...stored].join(' ')}\n${stored.map((v) => tv(v)).join(' ')}`.toLowerCase();
}

function dayLabel(st, date, inten) {
  const data = fmtDateLong(date);
  return st === 'migraine' ? t('{data}: emicrania, intensità {intensita}', { data, intensita: inten })
    : st === 'free' ? t('{data}: nessuna emicrania (confermato)', { data })
      : st === 'future' ? t('{data}: giorno futuro', { data })
        : t('{data}: nessun attacco', { data });
}

function monthGrid(idx, db, month, today, rerender) {
  const lead = weekdayMon(monthStart(month));
  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push(h('span', { class: 'cal-cell blank', 'aria-hidden': 'true' }));
  const n = daysInMonth(month);
  for (let d = 1; d <= n; d += 1) {
    const date = `${month}-${pad(d)}`;
    const st = dayStatus(idx, db, date);
    const inten = idx.intensityByDay.get(date) || 0;
    const hasMeds = idx.medDays.has(date);
    const label = dayLabel(st, date, inten);
    cells.push(h(
      'button',
      {
        type: 'button',
        class: `cal-cell s-${st}${inten >= 7 ? ' hi' : ''}${date === today ? ' today' : ''}`,
        style: st === 'migraine' ? { '--c': intensityColor(inten) } : null,
        'aria-label': label,
        onclick: () => openDaySheet(date),
      },
      st === 'free' ? h('span', { class: 'cal-check' }, icon('check', 11)) : null,
      String(d),
      hasMeds ? h('span', { class: 'cal-marks' }, h('i', { class: 'cal-mark' })) : null,
    ));
  }
  const wrap = h('div', { class: 'cal-grid' }, ...cells);
  onSwipe(wrap, (dir) => {
    state.month = addMonths(state.month, dir);
    rerender();
  });
  return wrap;
}

function importHint(idx) {
  return idx.episodes.length ? null : h(
    'div',
    { class: 'card', style: { marginTop: '14px' } },
    h('p', { class: 'muted', style: { marginBottom: '12px' } }, t('Hai già un diario nelle Note? Importalo e il calendario si compila da solo.')),
    button({ label: t('Importa dalle note'), kind: 'secondary', icon: 'calendar-plus', block: true, onClick: () => openNotesImport() }),
  );
}

/* ---------- mesi affiancati ---------- */

const monthShortYear = (m) => capitalize(fmt(monthStart(m), { month: 'short', year: 'numeric' }));
const monthLong = (m) => capitalize(fmt(monthStart(m), { month: 'long' }));

function miniMonth(idx, db, month, today, rerender, showYear) {
  const lead = weekdayMon(monthStart(month));
  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push(h('span', { class: 'mm-cell blank', 'aria-hidden': 'true' }));
  let count = 0;
  const n = daysInMonth(month);
  for (let d = 1; d <= n; d += 1) {
    const date = `${month}-${pad(d)}`;
    const st = dayStatus(idx, db, date);
    const inten = idx.intensityByDay.get(date) || 0;
    if (st === 'migraine') count += 1;
    const cls = `mm-cell s-${st}${inten >= 7 ? ' hi' : ''}${date === today ? ' today' : ''}${idx.medDays.has(date) ? ' med' : ''}`; // i18n-ignore
    const style = st === 'migraine' ? { '--c': intensityColor(inten) } : null;
    // I giorni futuri non hanno nulla da mostrare: niente pulsante, cosi' VoiceOver non li scorre uno per uno.
    cells.push(st === 'future'
      ? h('span', { class: cls, 'aria-hidden': 'true' }, String(d))
      : h('button', {
        type: 'button', class: cls, style, 'aria-label': dayLabel(st, date, inten), onclick: () => openDaySheet(date),
      }, String(d)));
  }
  const name = showYear ? monthShortYear(month) : monthLong(month);
  const head = h(
    'button',
    {
      type: 'button',
      class: 'mm-head',
      'aria-label': t('{mese}: {n, plural, one {# giorno} other {# giorni}} con emicrania, apri il mese', { mese: fmtMonthYear(month), n: count }),
      onclick: () => {
        state.month = month;
        setMode('month');
        rerender();
      },
    },
    h('span', { class: 'mm-name' }, name),
    h('span', { class: `mm-count${count ? ' on' : ''}`, 'aria-hidden': 'true' }, String(count)),
  );
  return h(
    'section',
    { class: `mm${month === monthOf(today) ? ' current' : ''}` },
    head,
    h('div', { class: 'mm-dow', 'aria-hidden': 'true' }, WEEKDAYS_LETTER.map((l) => h('span', {}, l))),
    h('div', { class: 'mm-grid' }, ...cells),
  );
}

/** Fine del periodo che contiene il mese indicato: di solito il mese corrente, altrimenti il mese stesso. */
function rangeEndFor(month, today) {
  const cur = monthOf(today);
  if (!month || (month <= cur && month > addMonths(cur, -state.span))) return cur;
  return month;
}

function monthsView(idx, db, today, rerender) {
  if (!state.rangeEnd) state.rangeEnd = rangeEndFor(state.month, today);
  const end = state.rangeEnd;
  const start = addMonths(end, -(state.span - 1));
  const months = monthsBetween(start, end);
  const showYear = start.slice(0, 4) !== end.slice(0, 4);
  const stats = rangeStats(idx, db, monthStart(start), monthEnd(end));
  const shift = (dir) => {
    state.rangeEnd = addMonths(end, dir * state.span);
    rerender();
  };
  const range = showYear ? `${monthShortYear(start)} – ${monthShortYear(end)}`
    : `${capitalize(fmt(monthStart(start), { month: 'short' }))} – ${monthShortYear(end)}`;
  const nav = h(
    'div',
    { class: 'cal-head' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Periodo precedente'), onclick: () => shift(-1) }, icon('chevron-left', 20)),
    h('button', {
      type: 'button', class: 'cal-title mm-range', style: { background: 'none', border: 0 }, onclick: () => { state.rangeEnd = monthOf(today); rerender(); }, 'aria-label': t('{mese}, torna a oggi', { mese: range }),
    }, range),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Periodo successivo'), onclick: () => shift(1) }, icon('chevron-right', 20)),
  );
  const spanSeg = segmented({
    options: SPANS.map((n) => ({ value: n, label: n === 6 ? t('6 mesi') : t('12 mesi') })),
    value: state.span,
    ariaLabel: t('Mesi da mostrare'),
    onChange: (v) => {
      state.span = v;
      savePref(SPAN_KEY, v);
      rerender();
    },
  });
  const grid = h('div', { class: 'mm-wrap' }, ...months.map((m) => miniMonth(idx, db, m, today, rerender, showYear)));
  onSwipe(grid, shift);
  const legend = h('div', { class: 'legend' }, [
    h('span', { class: 'legend-item' }, h('span', { class: 'swatch free' }), t('Senza emicrania')),
    h('span', { class: 'legend-item' }, h('i', { class: 'cal-mark', style: { display: 'inline-block', color: 'var(--text-2)' } }), t('Farmaco assunto')),
  ]);
  return h(
    'div',
    {},
    card(nav, spanSeg),
    h(
      'div',
      { class: 'month-sum mm-sum' },
      statTile({ label: t('Giorni con emicrania'), value: String(stats.migraineDays), tone: 'primary' }),
      statTile({ label: t('Attacchi'), value: String(stats.attacks) }),
      statTile({ label: t('Giorni con farmaci'), value: String(stats.acuteMedDays) }),
    ),
    grid,
    h('div', { class: 'card mm-legend' }, intensityLegend(), legend, h('p', { class: 'footnote' }, t('Tocca un giorno per i dettagli o il nome del mese per aprirlo.'))),
    importHint(idx),
  );
}

function monthView(idx, db, today, rerender) {
  const month = state.month;
  const stats = rangeStats(idx, db, monthStart(month), monthEnd(month));
  const nav = h(
    'div',
    { class: 'cal-head' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Mese precedente'), onclick: () => { state.month = addMonths(month, -1); rerender(); } }, icon('chevron-left', 20)),
    h('button', { type: 'button', class: 'cal-title', style: { background: 'none', border: 0 }, onclick: () => { state.month = monthOf(today); rerender(); }, 'aria-label': t('{mese}, torna a oggi', { mese: fmtMonthYear(month) }) }, fmtMonthYear(month)),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Mese successivo'), onclick: () => { state.month = addMonths(month, 1); rerender(); } }, icon('chevron-right', 20)),
  );
  const dow = h('div', { class: 'cal-dow' }, WEEKDAYS_SHORT.map((d) => h('span', {}, d.slice(0, 3))));
  const legend = h('div', { class: 'legend' }, [
    h('span', { class: 'legend-item' }, h('span', { class: 'swatch free' }), t('Senza emicrania')),
    h('span', { class: 'legend-item' }, h('i', { class: 'cal-mark', style: { display: 'inline-block', color: 'var(--text-2)' } }), t('Farmaco assunto')),
  ]);
  return h(
    'div',
    {},
    card(
      nav,
      dow,
      monthGrid(idx, db, month, today, rerender),
      intensityLegend(),
      legend,
    ),
    h(
      'div',
      { class: 'month-sum' },
      statTile({ label: t('Giorni con emicrania'), value: String(stats.migraineDays), tone: 'primary' }),
      statTile({ label: t('Attacchi'), value: String(stats.attacks) }),
      statTile({ label: t('Giorni con farmaci'), value: String(stats.acuteMedDays) }),
    ),
    importHint(idx),
  );
}

function listView(idx) {
  const search = h('input', {
    class: 'input', type: 'search', placeholder: t('Cerca nelle note, sintomi, farmaci…'), 'aria-label': t('Cerca negli attacchi'), value: state.query, autocomplete: 'off',
  });
  const filters = chipGroup({
    options: [
      { value: 'all', label: t('Tutti') }, { value: 'strong', label: t('Forti (7+)') }, { value: 'meds', label: t('Con farmaci') }, { value: 'aura', label: t('Con aura') },
    ],
    value: state.filter,
    allowClear: false,
    onChange: (v) => { state.filter = v || 'all'; paint(); },
  });
  const box = h('div');
  const paint = () => {
    const q = state.query.trim().toLowerCase();
    const eps = [...idx.episodes].reverse().filter((e) => FILTERS[state.filter](e) && (!q || haystack(e).includes(q)));
    if (!eps.length) {
      replaceChildren(box, emptyState({
        icon: 'search',
        title: idx.episodes.length ? t('Nessun risultato') : t('Nessun attacco registrato'),
        text: idx.episodes.length ? t('Prova a cambiare filtro o ricerca.') : t('Quando registrerai un attacco comparirà qui.'),
        action: idx.episodes.length ? null : h('div', { class: 'stack' },
          button({ label: t('Registra un attacco'), icon: 'plus', onClick: () => openEpisodeEditor({}) }),
          button({ label: t('Importa dalle note'), kind: 'secondary', icon: 'calendar-plus', onClick: () => openNotesImport() })),
      }));
      return;
    }
    const nodes = [];
    let current = '';
    let bucket = [];
    const flush = () => {
      if (!bucket.length) return;
      nodes.push(monthHeader(fmtMonthYear(current), t('{n, plural, one {# attacco} other {# attacchi}}', { n: bucket.length })));
      bucket.forEach((e) => nodes.push(episodeCard(e, { onClick: () => openEpisodeEditor({ id: e.id }) })));
      bucket = [];
    };
    eps.forEach((e) => {
      const m = monthOf(e.start);
      if (m !== current) {
        flush();
        current = m;
      }
      bucket.push(e);
    });
    flush();
    replaceChildren(box, ...nodes);
  };
  search.addEventListener('input', () => { state.query = search.value; paint(); });
  paint();
  return h('div', {}, h('div', { class: 'mb' }, search), h('div', { class: 'mb' }, filters), box);
}

export function calendarView({ rerender }) {
  const today = todayStr();
  const db = store.getDb();
  const idx = getIndex(db, store.getRev(), today);
  if (!state.month) state.month = monthOf(today);
  const modeSeg = segmented({
    options: [{ value: 'month', label: t('Mese') }, { value: 'months', label: t('Mesi') }, { value: 'list', label: t('Elenco') }],
    value: state.mode,
    ariaLabel: t('Modalità di visualizzazione'),
    onChange: (v) => {
      if (v === 'months') state.rangeEnd = rangeEndFor(state.month, today);
      setMode(v);
      rerender();
    },
  });
  const body = state.mode === 'month' ? monthView(idx, db, today, rerender)
    : state.mode === 'months' ? monthsView(idx, db, today, rerender)
      : listView(idx);
  return {
    title: t('Diario'),
    sub: '',
    node: h('div', {}, h('div', { class: 'mb' }, modeSeg), body),
  };
}
