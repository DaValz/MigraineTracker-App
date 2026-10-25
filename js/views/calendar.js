import { h, replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import { getIndex, dayStatus, rangeStats } from '../analysis.js';
import {
  segmented, button, emptyState, chipGroup, statTile, card,
} from '../ui.js';
import { intensityColor, typeLabel } from '../data.js';
import {
  todayStr, monthOf, addMonths, fmtMonthYear, weekdayMon, daysInMonth, monthStart, monthEnd, WEEKDAYS_SHORT, fmtDateLong, pad,
} from '../dates.js';
import { plural } from '../format.js';
import { intensityLegend } from '../charts.js';
import { episodeCard, monthHeader } from './shared.js';
import { openDaySheet } from './day.js';
import { openEpisodeEditor } from './episode.js';

const state = {
  month: null, mode: 'month', query: '', filter: 'all',
};

const FILTERS = {
  all: () => true,
  strong: (e) => e.intensity >= 7,
  meds: (e) => e.meds.length > 0,
  aura: (e) => e.type === 'con_aura' || e.aura.length > 0,
};

function haystack(e) {
  return [e.note, typeLabel(e.type), ...e.areas, ...e.symptoms, ...e.triggers, ...e.meds.map((m) => m.name)].join(' ').toLowerCase();
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
    const label = `${fmtDateLong(date)}: ${st === 'migraine' ? `emicrania, intensità ${inten}` : st === 'free' ? 'nessuna emicrania (confermato)' : st === 'future' ? 'giorno futuro' : 'nessun attacco'}`;
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
  let sx = 0;
  let sy = 0;
  wrap.addEventListener('touchstart', (e) => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  wrap.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 45) {
      state.month = addMonths(state.month, dx < 0 ? 1 : -1);
      rerender();
    }
  }, { passive: true });
  return wrap;
}

function monthView(idx, db, today, rerender) {
  const month = state.month;
  const stats = rangeStats(idx, db, monthStart(month), monthEnd(month));
  const nav = h(
    'div',
    { class: 'cal-head' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Mese precedente', onclick: () => { state.month = addMonths(month, -1); rerender(); } }, icon('chevron-left', 20)),
    h('button', { type: 'button', class: 'cal-title', style: { background: 'none', border: 0 }, onclick: () => { state.month = monthOf(today); rerender(); }, 'aria-label': `${fmtMonthYear(month)}, torna a oggi` }, fmtMonthYear(month)),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Mese successivo', onclick: () => { state.month = addMonths(month, 1); rerender(); } }, icon('chevron-right', 20)),
  );
  const dow = h('div', { class: 'cal-dow' }, WEEKDAYS_SHORT.map((d) => h('span', {}, d.slice(0, 3))));
  const legend = h('div', { class: 'legend' }, [
    h('span', { class: 'legend-item' }, h('span', { class: 'swatch free' }), 'Senza emicrania'),
    h('span', { class: 'legend-item' }, h('i', { class: 'cal-mark', style: { display: 'inline-block', color: 'var(--text-2)' } }), 'Farmaco assunto'),
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
      statTile({ label: 'Giorni con emicrania', value: String(stats.migraineDays), tone: 'primary' }),
      statTile({ label: 'Attacchi', value: String(stats.attacks) }),
      statTile({ label: 'Giorni con farmaci', value: String(stats.acuteMedDays) }),
    ),
  );
}

function listView(idx) {
  const search = h('input', {
    class: 'input', type: 'search', placeholder: 'Cerca nelle note, sintomi, farmaci…', 'aria-label': 'Cerca negli attacchi', value: state.query, autocomplete: 'off',
  });
  const filters = chipGroup({
    options: [
      { value: 'all', label: 'Tutti' }, { value: 'strong', label: 'Forti (7+)' }, { value: 'meds', label: 'Con farmaci' }, { value: 'aura', label: 'Con aura' },
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
        title: idx.episodes.length ? 'Nessun risultato' : 'Nessun attacco registrato',
        text: idx.episodes.length ? 'Prova a cambiare filtro o ricerca.' : 'Quando registrerai un attacco comparirà qui.',
        action: idx.episodes.length ? null : button({ label: 'Registra un attacco', icon: 'plus', onClick: () => openEpisodeEditor({}) }),
      }));
      return;
    }
    const nodes = [];
    let current = '';
    let bucket = [];
    const flush = () => {
      if (!bucket.length) return;
      nodes.push(monthHeader(fmtMonthYear(current), plural(bucket.length, 'attacco', 'attacchi')));
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
    options: [{ value: 'month', label: 'Mese' }, { value: 'list', label: 'Elenco' }],
    value: state.mode,
    ariaLabel: 'Modalità di visualizzazione',
    onChange: (v) => { state.mode = v; rerender(); },
  });
  const body = state.mode === 'month' ? monthView(idx, db, today, rerender) : listView(idx);
  return {
    title: 'Diario',
    sub: '',
    node: h('div', {}, h('div', { class: 'mb' }, modeSeg), body),
  };
}
