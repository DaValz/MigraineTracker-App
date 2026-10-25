import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import * as store from './store.js';
import { initUi, toast, button } from './ui.js';
import { applyTheme, watchSystemTheme } from './theme.js';
import { todayStr } from './dates.js';
import { homeView, tickTimers } from './views/home.js';
import { calendarView, showCalendarMonth } from './views/calendar.js';
import { statsView } from './views/stats.js';
import { recordView } from './views/record.js';
import { openEpisodeEditor } from './views/episode.js';
import { openSettings } from './views/settings.js';
import { openWelcome } from './views/help.js';
import { initLock } from './lock.js';
import { maybeSyncWeather } from './weather.js';
import { clearFiles } from './files.js';

const TABS = [
  { id: 'home', label: t('Oggi'), icon: 'home' },
  { id: 'calendar', label: t('Diario'), icon: 'calendar' },
  { id: 'stats', label: t('Analisi'), icon: 'chart' },
  { id: 'record', label: t('Cartella'), icon: 'folder' },
];
const BUILDERS = {
  home: homeView, calendar: calendarView, stats: statsView, record: recordView,
};

const state = { tab: 'home', lastTab: null, scroll: {}, day: todayStr() };
let topbar;
let topTitle;
let topActions;
let viewEl;
const tabButtons = {};
let renderQueued = false;

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function profileButton() {
  const ini = initials(store.getSettings().name);
  return h('button', {
    type: 'button',
    class: `nav-btn round${ini ? ' avatar' : ''}`,
    'aria-label': t('Impostazioni'),
    onclick: () => openSettings(),
  }, ini || icon('person', 20));
}

function buildShell(app) {
  topTitle = h('div', { class: 'topbar-title', 'aria-hidden': 'true' });
  topActions = h('div', { class: 'topbar-actions' });
  topbar = h('header', { class: 'topbar' }, h('div', { class: 'topbar-inner' }, topTitle, topActions));
  viewEl = h('main', { class: 'view', id: 'view', tabindex: '-1' });
  viewEl.addEventListener('scroll', () => topbar.classList.toggle('scrolled', viewEl.scrollTop > 34), { passive: true });
  const nav = h('nav', { class: 'tabbar', 'aria-label': t('Navigazione principale') });
  TABS.forEach((t) => {
    const b = h('button', { type: 'button', class: 'tab', onclick: () => goTab(t.id) }, icon(t.icon, 23), h('span', {}, t.label));
    tabButtons[t.id] = b;
    nav.appendChild(b);
  });
  const fab = h('button', {
    type: 'button', class: 'tab-fab', 'aria-label': t('Registra un attacco'), onclick: () => openEpisodeEditor({}),
  }, icon('plus', 30));
  app.append(viewEl, topbar, nav, fab);
}

export function goTab(id) {
  if (state.tab !== id) state.scroll[state.tab] = viewEl.scrollTop;
  state.tab = id;
  render();
}

function render() {
  renderQueued = false;
  state.day = todayStr();
  let out;
  try {
    out = BUILDERS[state.tab]({ goTab, rerender: scheduleRender });
  } catch (e) {
    console.error(e);
    out = {
      title: t('Ops'),
      sub: '',
      node: h('div', { class: 'card' }, h('p', { class: 'mb' }, t('Si è verificato un errore nel mostrare questa schermata.')), button({ label: t('Ricarica'), kind: 'primary', onClick: () => location.reload() })),
    };
  }
  topTitle.textContent = out.title;
  replaceChildren(topActions, ...(out.right || []), profileButton());
  const head = h('div', { class: 'large-head' }, h('div', { class: 'eyebrow' }, out.sub || ''), h('h1', { class: 'bar-title' }, out.title));
  const keep = state.lastTab === state.tab ? viewEl.scrollTop : (state.scroll[state.tab] || 0);
  replaceChildren(viewEl, head, out.node);
  viewEl.scrollTop = keep;
  topbar.classList.toggle('scrolled', viewEl.scrollTop > 34);
  state.lastTab = state.tab;
  Object.entries(tabButtons).forEach(([id, b]) => {
    b.classList.toggle('active', id === state.tab);
    if (id === state.tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(render);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  let userRequested = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (userRequested) location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const announce = (worker) => toast(t('È disponibile una nuova versione dell’app.'), {
      duration: 20000,
      action: {
        label: t('Aggiorna'),
        onClick: () => {
          userRequested = true;
          worker.postMessage({ type: 'SKIP_WAITING' });
        },
      },
    });
    if (reg.waiting && hadController) announce(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && hadController) announce(worker);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch((e) => console.warn('Service worker non registrato', e));
}

function main() {
  store.load();
  applyTheme();
  watchSystemTheme();
  initUi({ app: document.getElementById('app'), overlays: document.getElementById('overlays'), toasts: document.getElementById('toasts') });
  buildShell(document.getElementById('app'));
  render();

  store.subscribe(scheduleRender);
  store.onSaveError(() => toast(t('Impossibile salvare: spazio esaurito o archivio non disponibile.'), { tone: 'error', duration: 9000 }));
  store.onWipe(() => { clearFiles().catch(() => {}); });

  initLock();
  if (!store.getSettings().welcomeDone) openWelcome();
  document.addEventListener('emicrania:goto', (e) => { // i18n-ignore
    const d = (e && e.detail) || {};
    if (d.month) showCalendarMonth(d.month);
    if (BUILDERS[d.tab]) goTab(d.tab);
  });

  setInterval(() => {
    if (todayStr() !== state.day) scheduleRender();
    else tickTimers(viewEl);
  }, 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      store.flush();
    } else {
      if (todayStr() !== state.day) scheduleRender();
      else tickTimers(viewEl);
      maybeSyncWeather();
    }
  });
  window.addEventListener('pagehide', () => store.flush());
  window.addEventListener('error', (e) => console.error(e.error || e.message));

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  maybeSyncWeather();
  registerServiceWorker();
}

main();
