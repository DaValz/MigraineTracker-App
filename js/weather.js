import * as store from './store.js';
import { addDays, diffDays, todayStr, eachDay } from './dates.js';
import { h, replaceChildren } from './dom.js';
import {
  openSheet, row, group, button, toast,
} from './ui.js';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const HOURLY = 'surface_pressure,temperature_2m,relative_humidity_2m';

async function fetchJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

export function aggregate(hourly, today = todayStr()) {
  const out = {};
  if (!hourly || !Array.isArray(hourly.time)) return out;
  const acc = {};
  hourly.time.forEach((tm, i) => {
    const d = String(tm).slice(0, 10);
    const a = acc[d] || (acc[d] = { p: [], t: [], h: [] });
    const p = hourly.surface_pressure && hourly.surface_pressure[i];
    const t = hourly.temperature_2m && hourly.temperature_2m[i];
    const hu = hourly.relative_humidity_2m && hourly.relative_humidity_2m[i];
    if (Number.isFinite(p)) a.p.push(p);
    if (Number.isFinite(t)) a.t.push(t);
    if (Number.isFinite(hu)) a.h.push(hu);
  });
  const recent = addDays(today, -1);
  Object.entries(acc).forEach(([d, a]) => {
    if (!a.p.length) return;
    if (d < recent && a.p.length < 20) return;
    const e = { p: mean(a.p), pMin: Math.min(...a.p), pMax: Math.max(...a.p) };
    if (a.t.length) Object.assign(e, { t: mean(a.t), tMin: Math.min(...a.t), tMax: Math.max(...a.t) });
    if (a.h.length) e.h = mean(a.h);
    out[d] = e;
  });
  return out;
}

export function neededDates(db, today = todayStr()) {
  const eps = Object.values(db.episodes).map((e) => e.start.slice(0, 10));
  const first = [db.createdAt.slice(0, 10), ...eps].sort()[0];
  const floor = addDays(today, -364);
  const from = first < floor ? floor : first;
  return eachDay(from, today).filter((d) => !db.weather[d] || d >= addDays(today, -1));
}

let lastSync = 0;
let running = false;

export async function syncWeather({ force = false } = {}) {
  const s = store.getSettings();
  if (!s.weatherOn || !s.weatherLoc || running) return { skipped: true };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { skipped: true };
  if (!force && Date.now() - lastSync < 30 * 60 * 1000) return { skipped: true };
  running = true;
  try {
    const today = todayStr();
    const need = neededDates(store.getDb(), today);
    if (!need.length) return { skipped: true };
    lastSync = Date.now();
    const { lat, lon } = s.weatherLoc;
    const base = `latitude=${lat}&longitude=${lon}&hourly=${HOURLY}&timezone=auto`;
    const minNeed = need[0];
    const splitDay = addDays(today, -85);
    const entries = {};
    if (minNeed < splitDay) {
      const olderEnd = addDays(splitDay, -1);
      const data = await fetchJson(`${ARCHIVE}?${base}&start_date=${minNeed}&end_date=${olderEnd}`);
      Object.assign(entries, aggregate(data.hourly, today));
    }
    const recentFrom = minNeed < splitDay ? splitDay : minNeed;
    const past = Math.min(92, diffDays(recentFrom, today) + 1);
    const data = await fetchJson(`${FORECAST}?${base}&past_days=${past}&forecast_days=1`);
    Object.assign(entries, aggregate(data.hourly, today));
    store.setWeather(entries);
    return { ok: true, days: Object.keys(entries).length };
  } catch (e) {
    lastSync = 0;
    return { error: e };
  } finally {
    running = false;
  }
}

export function maybeSyncWeather(force = false) {
  syncWeather({ force }).catch(() => {});
}

export async function searchCity(name) {
  const data = await fetchJson(`${GEOCODE}?name=${encodeURIComponent(name)}&count=6&language=it&format=json`);
  return (data.results || []).map((r) => ({
    name: r.name, admin: r.admin1 || '', country: r.country || '', lat: r.latitude, lon: r.longitude,
  }));
}

function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalizzazione non disponibile'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 },
    );
  });
}

export function describeLocation(loc) {
  if (!loc) return 'Non impostata';
  return loc.name || `${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}`;
}

export function openLocationSheet({ onDone } = {}) {
  const sheet = openSheet({ title: 'Posizione per il meteo', tall: true });
  const input = h('input', {
    class: 'input', type: 'search', placeholder: 'Cerca una città…', 'aria-label': 'Cerca una città', autocomplete: 'off', maxlength: 60,
  });
  const results = h('div', { class: 'mt' });
  const status = h('p', { class: 'muted small mt' });
  const choose = (loc) => {
    store.updateSettings({ weatherLoc: loc, weatherOn: true });
    maybeSyncWeather(true);
    toast('Posizione salvata. Scarico i dati meteo…');
    sheet.close();
    if (onDone) onDone();
  };
  const doSearch = async () => {
    const q = input.value.trim();
    if (q.length < 2) return;
    replaceChildren(status, 'Ricerca in corso…');
    try {
      const list = await searchCity(q);
      replaceChildren(status, list.length ? '' : 'Nessuna città trovata.');
      replaceChildren(results, group(...list.map((r) => row({
        icon: 'pin',
        title: r.name,
        subtitle: [r.admin, r.country].filter(Boolean).join(', '),
        onClick: () => choose({ lat: r.lat, lon: r.lon, name: [r.name, r.admin].filter(Boolean).join(', ') }),
      }))));
    } catch (e) {
      replaceChildren(status, 'Impossibile cercare: controlla la connessione.');
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch();
    }
  });
  replaceChildren(
    sheet.body,
    h('p', { class: 'muted small mb' }, 'Il meteo viene scaricato da Open-Meteo (servizio gratuito). Viene inviata solo la posizione approssimata (circa 1 km) e le date, mai i dati sulla tua salute.'),
    button({
      label: 'Usa la mia posizione',
      kind: 'secondary',
      icon: 'pin',
      block: true,
      onClick: async () => {
        replaceChildren(status, 'Rilevo la posizione…');
        try {
          const pos = await currentPosition();
          choose({ lat: pos.lat, lon: pos.lon, name: '' });
        } catch (e) {
          replaceChildren(status, 'Non riesco a leggere la posizione. Cerca la tua città qui sotto.');
        }
      },
    }),
    h('div', { class: 'field-label mt' }, 'Oppure cerca la città'),
    input,
    button({ label: 'Cerca', kind: 'primary', block: true, onClick: doSearch }),
    status,
    results,
  );
  return sheet;
}
