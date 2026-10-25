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
import { t, tv } from '../i18n.js';
import { intensityLegend } from '../charts.js';
import { episodeCard, monthHeader } from './shared.js';
import { openDaySheet } from './day.js';
import { openEpisodeEditor } from './episode.js';
import { openNotesImport } from './notes-import.js';

const state = {
  month: null, mode: 'month', query: '', filter: 'all',
};

/** Porta il diario sul mese indicato (usato dopo un'importazione). */
export function showCalendarMonth(month) {
  if (month) state.month = month;
  state.mode = 'month';
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
    const data = fmtDateLong(date);
    const label = st === 'migraine' ? t('{data}: emicrania, intensità {intensita}', { data, intensita: inten })
      : st === 'free' ? t('{data}: nessuna emicrania (confermato)', { data })
        : st === 'future' ? t('{data}: giorno futuro', { data })
          : t('{data}: nessun attacco', { data });
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
    const touch = e.changedTouches[0];
    const dx = touch.clientX - sx;
    const dy = touch.clientY - sy;
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
    idx.episodes.length ? null : h(
      'div',
      { class: 'card', style: { marginTop: '14px' } },
      h('p', { class: 'muted', style: { marginBottom: '12px' } }, t('Hai già un diario nelle Note? Importalo e il calendario si compila da solo.')),
      button({ label: t('Importa dalle note'), kind: 'secondary', icon: 'calendar-plus', block: true, onClick: () => openNotesImport() }),
    ),
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
    options: [{ value: 'month', label: t('Mese') }, { value: 'list', label: t('Elenco') }],
    value: state.mode,
    ariaLabel: t('Modalità di visualizzazione'),
    onChange: (v) => { state.mode = v; rerender(); },
  });
  const body = state.mode === 'month' ? monthView(idx, db, today, rerender) : listView(idx);
  return {
    title: t('Diario'),
    sub: '',
    node: h('div', {}, h('div', { class: 'mb' }, modeSeg), body),
  };
}
