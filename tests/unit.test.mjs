import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mem = new Map();
globalThis.localStorage = new Proxy({
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
}, {
  ownKeys: () => [...mem.keys()],
  getOwnPropertyDescriptor: (t, k) => (mem.has(k) ? { enumerable: true, configurable: true, value: mem.get(k) } : Object.getOwnPropertyDescriptor(t, k)),
  has: (t, k) => mem.has(k) || k in t,
});

const dates = await import('../js/dates.js');
const store = await import('../js/store.js');
const A = await import('../js/analysis.js');

const reset = () => { mem.clear(); store.wipeAll(); mem.clear(); store.load(); };

const ep = (over = {}) => {
  const start = over.start || '2026-10-20T10:00';
  const end = 'end' in over ? over.end : dates.addMinutes(start, 240);
  return { intensity: 6, type: 'senza_aura', meds: [], ...over, start, end };
};

test('dates: calcoli e formattazione', () => {
  assert.equal(dates.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(dates.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(dates.diffDays('2026-10-24', '2026-10-26'), 2);
  assert.equal(dates.diffDays('2026-03-28', '2026-03-30'), 2);
  assert.equal(dates.weekdayMon('2026-10-24'), 5);
  assert.equal(dates.startOfWeek('2026-10-24'), '2026-10-19');
  assert.equal(dates.addMonths('2026-12', 1), '2027-01');
  assert.equal(dates.addMonths('2026-01', -1), '2025-12');
  assert.equal(dates.monthEnd('2024-02'), '2024-02-29');
  assert.equal(dates.minutesBetween('2026-10-20T10:00', '2026-10-20T12:30'), 150);
  assert.equal(dates.formatDuration(150), '2 h 30 min');
  assert.equal(dates.formatDuration(45), '45 min');
  assert.equal(dates.formatDuration(1500), '1 g 1 h');
  assert.equal(dates.formatDuration(null), '—');
  assert.equal(dates.fmtMonthYear('2026-10'), 'Ottobre 2026');
  assert.equal(dates.fmtTime('2026-10-20T09:05'), '09:05');
});

test('sanitizeEpisode: validazione e normalizzazione', () => {
  assert.equal(store.sanitizeEpisode({ start: 'ieri' }), null);
  assert.equal(store.sanitizeEpisode(null), null);
  const e = store.sanitizeEpisode({
    start: '2026-10-20T10:00', end: '2026-10-20T09:00', intensity: 99, type: 'boh',
    triggers: ['Stress', 'Stress', '  ', 5, 'Alcol'], meds: [{ name: 'Ibuprofene', cls: 'nsaid', effect: 7 }, { name: '' }, 'x'],
  });
  assert.equal(e.intensity, 10);
  assert.equal(e.end, e.start);
  assert.equal(e.type, '');
  assert.deepEqual(e.triggers, ['Stress', 'Alcol']);
  assert.equal(e.meds.length, 1);
  assert.equal(e.meds[0].effect, 3);
  assert.equal(e.meds[0].at, e.start);
  assert.match(e.id, /^e[a-z0-9]+$/);
  const ongoing = store.sanitizeEpisode({ start: '2026-10-20T10:00', end: null, intensity: 3 });
  assert.equal(ongoing.end, null);
  assert.equal(store.sanitizeEpisode({ start: '2026-02-30T10:00' }), null);
  assert.equal(store.sanitizeEpisode({ start: '2026-10-20T25:00' }), null);
});

test('sanitizeDb: resiste a input ostili', () => {
  const evil = JSON.parse('{"episodes":{"__proto__":{"start":"2026-10-20T10:00","intensity":5},"x":{"start":"2026-10-20T10:00"}},"days":{"__proto__":{"free":true},"2026-10-20":{"sleepH":"7.5","free":1,"zzz":1}},"settings":{"theme":"<script>","name":"<img src=x onerror=alert(1)>"}}');
  const db = store.sanitizeDb(evil);
  assert.equal(Object.keys(db.episodes).length, 2);
  assert.ok(Object.keys(db.episodes).every((k) => /^e[a-z0-9]+$/.test(k)));
  assert.deepEqual(Object.keys(db.days), ['2026-10-20']);
  assert.deepEqual(db.days['2026-10-20'], { free: true, sleepH: 7.5 });
  assert.equal(db.settings.theme, 'auto');
  assert.equal(({}).free, undefined);
  assert.equal(store.sanitizeDb('stringa').settings.theme, 'auto');
  assert.equal(store.sanitizeDb(null).settings.assumeFree, true);
});

test('store: CRUD, giorni liberi, impostazioni, liste', () => {
  reset();
  const saved = store.upsertEpisode(ep());
  assert.equal(Object.keys(store.getDb().episodes).length, 1);
  store.setFree('2026-10-21', true);
  assert.equal(store.getDb().days['2026-10-21'].free, true);
  store.upsertEpisode(ep({ start: '2026-10-21T08:00', end: '2026-10-21T09:00' }));
  assert.equal(store.getDb().days['2026-10-21'], undefined, 'il flag libero viene tolto quando c\'è un attacco');
  store.patchDay('2026-10-22', { sleepH: 6.5, stress: 4 });
  store.patchDay('2026-10-22', { sleepH: null, stress: null });
  assert.equal(store.getDb().days['2026-10-22'], undefined, 'giorno vuoto rimosso');
  const removed = store.removeEpisode(saved.id);
  assert.equal(removed.id, saved.id);
  store.restoreEpisode(removed);
  assert.ok(store.getDb().episodes[saved.id]);

  assert.ok(store.listOptions('triggers').includes('Stress'));
  assert.ok(!store.listOptions('triggers').includes('Ciclo mestruale'));
  store.updateSettings({ cycle: true });
  assert.ok(store.listOptions('triggers').includes('Ciclo mestruale'));
  assert.equal(store.addCustomItem('triggers', 'Profumo').ok, true);
  assert.equal(store.addCustomItem('triggers', 'profumo').reason, 'duplicate');
  assert.equal(store.addCustomItem('triggers', '   ').reason, 'empty');
  assert.ok(store.listOptions('triggers').includes('Profumo'));
  store.setItemHidden('triggers', 'Stress', true);
  assert.ok(!store.listOptions('triggers').includes('Stress'));
  assert.equal(store.addCustomItem('triggers', 'stress').unhidden, true);
  assert.ok(store.listOptions('triggers').includes('Stress'));
  assert.equal(store.addCustomItem('meds', { name: 'Cefaly', cls: 'other' }).ok, true);
  assert.ok(store.listOptions('meds').some((m) => m.name === 'Cefaly'));
  store.removeCustomItem('meds', 'Cefaly');
  assert.ok(!store.listOptions('meds').some((m) => m.name === 'Cefaly'));
});

test('store: persistenza, backup automatico e dati corrotti', async () => {
  reset();
  store.upsertEpisode(ep());
  store.flush();
  const raw = mem.get(store.STORAGE_KEY);
  assert.ok(raw && raw.includes('senza_aura'));
  store.load();
  assert.equal(Object.keys(store.getDb().episodes).length, 1);
  assert.ok(mem.get(store.BACKUP_KEY));
  mem.set(store.STORAGE_KEY, '{non è json');
  store.load();
  assert.equal(store.getLoadStatus(), 'corrupt');
  assert.ok([...mem.keys()].some((k) => k.startsWith(`${store.STORAGE_KEY}.corrupt.`)), 'copia di salvataggio dei dati corrotti');
});

test('backup: esportazione/importazione (sostituisci e unisci)', () => {
  reset();
  store.updateSettings({ name: 'Mario', pin: { hash: 'aa', salt: 'bb', iter: 1000 } });
  const a = store.upsertEpisode(ep());
  store.patchDay('2026-10-18', { sleepH: 5 });
  const json = store.exportJson();
  assert.ok(!json.includes('"hash"') || json.includes('"pin": null'), 'il PIN non viene esportato');
  const parsed = store.parseBackup(json);
  assert.equal(Object.keys(parsed.episodes).length, 1);
  assert.throws(() => store.parseBackup('non json'), /non è un backup valido/);
  assert.throws(() => store.parseBackup('{"ciao": 1}'), /non sembra un backup/);

  reset();
  store.updateSettings({ pin: { hash: 'cc', salt: 'dd', iter: 1000 } });
  store.upsertEpisode(ep({ start: '2026-10-01T10:00', end: '2026-10-01T11:00' }));
  const res = store.importMerge(parsed);
  assert.equal(res.added, 1);
  assert.equal(Object.keys(store.getDb().episodes).length, 2);
  assert.equal(store.importMerge(parsed).added, 0, 'unione idempotente');
  store.importReplace(parsed);
  assert.equal(Object.keys(store.getDb().episodes).length, 1);
  assert.ok(store.getDb().episodes[a.id]);
  assert.equal(store.getDb().settings.pin.hash, 'cc', 'il PIN corrente viene mantenuto');
  assert.equal(store.getDb().settings.name, 'Mario');
});

const build = (episodes, today = '2026-10-24', extra = {}) => {
  const db = store.emptyDb();
  db.createdAt = extra.createdAt || '2026-09-01T10:00';
  episodes.forEach((e, i) => {
    const clean = store.sanitizeEpisode({ id: `etest${i}abc`, ...e });
    db.episodes[clean.id] = clean;
  });
  Object.assign(db.days, extra.days || {});
  Object.assign(db.weather, extra.weather || {});
  Object.assign(db.settings, extra.settings || {});
  return { db, idx: A.makeIndex(db, today), today };
};

test('analisi: copertura giorni, stato dei giorni e statistiche di periodo', () => {
  const { db, idx, today } = build([
    ep({ start: '2026-10-20T22:00', end: '2026-10-22T08:00', intensity: 8, work: 2, impact: 3, meds: [{ name: 'Sumatriptan', cls: 'triptan', effect: 3, at: '2026-10-21T09:00' }] }),
    ep({ start: '2026-10-10T08:00', end: '2026-10-10T10:00', intensity: 4, work: 1 }),
    ep({ start: '2026-10-23T08:00', end: null, intensity: 5 }),
  ]);
  assert.deepEqual([...idx.migraineDays].sort(), ['2026-10-10', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']);
  assert.equal(idx.trackingStart, '2026-09-01');
  assert.equal(A.dayStatus(idx, db, '2026-10-21'), 'migraine');
  assert.equal(A.dayStatus(idx, db, '2026-10-15'), 'assumed');
  assert.equal(A.dayStatus(idx, db, '2026-08-15'), 'none');
  assert.equal(A.dayStatus(idx, db, '2026-10-25'), 'future');
  db.days['2026-10-15'] = { free: true };
  assert.equal(A.dayStatus(idx, db, '2026-10-15'), 'free');
  db.settings.assumeFree = false;
  const idx2 = A.makeIndex(db, today);
  assert.equal(A.dayStatus(idx2, db, '2026-10-16'), 'unknown');

  const s = A.rangeStats(idx, db, '2026-10-01', '2026-10-24');
  assert.equal(s.attacks, 3);
  assert.equal(s.migraineDays, 6);
  assert.equal(s.trackedDays, 24);
  assert.equal(s.freeDays, 18);
  assert.equal(s.peakIntensity, 8);
  assert.equal(Math.round(s.avgIntensity * 100) / 100, 5.67);
  assert.equal(s.lostDays, 1);
  assert.equal(s.reducedDays, 1);
  assert.equal(s.bedAttacks, 1);
  assert.equal(s.acuteMedDays, 1);
  assert.equal(s.ongoing, true);
  assert.equal(s.longestMinutes, 34 * 60);
  const before = A.rangeStats(idx, db, '2026-08-01', '2026-08-31');
  assert.equal(before.trackedDays, 0);
});

test('analisi: raggruppamenti per grafici', () => {
  const { db, idx } = build([
    ep({ start: '2026-10-05T07:00', intensity: 7 }),
    ep({ start: '2026-10-12T07:30', intensity: 3 }),
    ep({ start: '2026-10-19T16:00', intensity: 9 }),
    ep({ start: '2026-09-15T23:00', intensity: 5 }),
  ]);
  const months = A.buckets(idx, db, '2026-09-01', '2026-10-24', 'month');
  assert.deepEqual(months.map((b) => b.migraineDays), [2, 3], 'l\'attacco delle 23:00 si estende al giorno dopo');
  const weeks = A.buckets(idx, db, '2026-10-01', '2026-10-24', 'week');
  assert.equal(weeks[0].from, '2026-09-28');
  assert.equal(weeks.reduce((a, b) => a + b.attacks, 0), 3);
  const days = A.buckets(idx, db, '2026-10-01', '2026-10-31', 'day');
  assert.equal(days.length, 31);
  assert.equal(days[18].maxIntensity, 9);
  assert.deepEqual(A.weekdayCounts(idx.episodes), [3, 1, 0, 0, 0, 0, 0]);
  assert.deepEqual(A.partOfDayCounts(idx.episodes), [0, 2, 1, 1]);
  const hist = A.intensityHistogram(idx.episodes);
  assert.equal(hist[8], 1);
  assert.equal(hist.reduce((a, b) => a + b, 0), 4);
  const grid = A.yearGrid(idx, db, '2026-10', 3);
  assert.equal(grid.length, 3);
  assert.equal(grid[2].cells[4].status, 'migraine');
  assert.equal(grid[2].cells[24].status, 'future');
  assert.equal(grid[1].cells[30], null, 'settembre ha 30 giorni');
});

test('analisi: farmaci, soglia di uso eccessivo e serie', () => {
  const eps = [];
  for (let i = 0; i < 12; i += 1) {
    const d = dates.addDays('2026-10-01', i);
    eps.push(ep({ start: `${d}T09:00`, end: `${d}T12:00`, meds: [{ name: 'Rizatriptan', cls: 'triptan', effect: i % 2 ? 2 : 3 }] }));
  }
  const { db, idx, today } = build(eps);
  const moh = A.mohStatus(idx, today);
  assert.equal(moh.specific, 12);
  assert.equal(moh.level, 'warn');
  const ms = A.medStats(idx.episodes);
  assert.equal(ms[0].name, 'Rizatriptan');
  assert.equal(ms[0].uses, 12);
  assert.equal(ms[0].avgEffect, 2.5);
  const mm = A.monthlyMedDays(idx, '2026-09-01', '2026-10-24');
  assert.equal(mm[1].specific, 12);

  const few = build([ep({ meds: [{ name: 'Ibuprofene', cls: 'nsaid' }] })]);
  assert.equal(A.mohStatus(few.idx, few.today).level, 'ok');
  const simple = [];
  for (let i = 0; i < 16; i += 1) simple.push(ep({ start: `${dates.addDays('2026-10-01', i)}T09:00`, meds: [{ name: 'Ibuprofene', cls: 'nsaid' }] }));
  const sb = build(simple);
  assert.equal(A.mohStatus(sb.idx, sb.today).level, 'warn');
  const anti = build([ep({ meds: [{ name: 'Plasil', cls: 'antiemetic' }] })]);
  assert.equal(A.mohStatus(anti.idx, anti.today).any, 0);
  assert.equal(anti.idx.medDays.get('2026-10-20').has('antiemetic'), true);
});

test('analisi: serie, confronti e suggerimenti', () => {
  const eps = [
    ep({ start: '2026-08-10T08:00', triggers: ['Stress'] }),
    ep({ start: '2026-09-05T08:00', triggers: ['Stress', 'Alcol'] }),
    ep({ start: '2026-09-20T08:00', triggers: ['Stress'] }),
    ep({ start: '2026-10-02T08:00', triggers: ['Stress'] }),
  ];
  const days = {};
  const weather = {};
  const probe = build(eps).idx;
  for (let i = 0; i < 80; i += 1) {
    const d = dates.addDays('2026-08-01', i);
    const mig = probe.migraineDays.has(d);
    days[d] = { sleepH: mig ? 5 : 7.5, stress: mig ? 4 : 2 };
    weather[d] = { p: 1013 + (mig ? 6 : 0) * (i % 2 ? 1 : -1) + (i % 3) };
  }
  const { db, idx, today } = build(eps, '2026-10-24', { createdAt: '2026-08-01T10:00', days, weather });
  const st = A.streakInfo(idx, today);
  assert.equal(st.lastMigraine, '2026-10-02');
  assert.equal(st.daysSince, 22);
  assert.equal(st.longestFree, 25);
  const cmp = A.compareByStatus(idx, db, '2026-08-01', today, A.sleepGetter(db));
  assert.equal(cmp.mig.n, 4);
  assert.equal(cmp.mig.avg, 5);
  assert.equal(cmp.non.avg, 7.5);
  const labels = A.countLabels(idx.episodes, 'triggers');
  assert.deepEqual(labels[0], { label: 'Stress', count: 4, pct: 1 });
  const insights = A.buildInsights(idx, db, today);
  const ids = insights.map((i) => i.id);
  assert.ok(ids.includes('trigger'));
  assert.ok(ids.includes('streak'));
  assert.ok(ids.includes('trend'));
  assert.equal(A.buildInsights(A.makeIndex(store.emptyDb(), today), store.emptyDb(), today).length, 0);
  assert.ok(insights.every((i) => typeof i.text === 'string' && i.text.length > 10));
});

test('analisi: ciclo mestruale', () => {
  const { db, idx, today } = build(
    [ep({ start: '2026-10-10T08:00' }), ep({ start: '2026-10-02T08:00' })],
    '2026-10-24',
    { days: { '2026-10-11': { menses: true } } },
  );
  const link = A.menstrualLink(idx, db, '2026-01-01', today);
  assert.equal(link.attacks, 2);
  assert.equal(link.near, 1);
  const none = build([ep()]);
  assert.equal(A.menstrualLink(none.idx, none.db, '2026-01-01', none.today), null);
});

test('terapie preventive: sanitizzazione, CRUD, backup ed effetto', () => {
  assert.equal(store.sanitizePreventive({ name: '', start: '2026-01-01' }), null);
  assert.equal(store.sanitizePreventive({ name: 'X', start: 'boh' }), null);
  const clamped = store.sanitizePreventive({ name: 'Topiramato', dose: '50 mg', start: '2026-08-01', end: '2026-07-01' });
  assert.equal(clamped.end, '2026-08-01');
  assert.equal(store.sanitizePreventive({ id: '__proto__', name: 'A', start: '2026-08-01' }).id.startsWith('p'), true);

  reset();
  const saved = store.upsertPreventive({ name: 'Propranololo', start: '2026-08-20' });
  assert.match(saved.id, /^p[a-z0-9]+$/);
  store.upsertPreventive({ ...saved, dose: '40 mg' });
  assert.equal(store.getDb().preventives.length, 1);
  assert.equal(store.getDb().preventives[0].dose, '40 mg');
  const parsed = store.parseBackup(store.exportJson());
  assert.equal(parsed.preventives.length, 1);
  const removed = store.removePreventive(saved.id);
  assert.equal(store.getDb().preventives.length, 0);
  store.importMerge(parsed);
  assert.equal(store.getDb().preventives.length, 1);
  store.upsertPreventive(removed);
  assert.equal(store.getDb().preventives.length, 1, 'ripristino idempotente');

  const eps = [];
  for (let i = 0; i < 12; i += 1) eps.push(ep({ start: `${dates.addDays('2026-06-22', i * 5)}T10:00` }));
  for (let i = 0; i < 3; i += 1) eps.push(ep({ start: `${dates.addDays('2026-08-25', i * 15)}T10:00` }));
  const { db, idx, today } = build(eps, '2026-10-24', { createdAt: '2026-06-01T10:00' });
  const eff = A.preventiveEffect(idx, db, { start: '2026-08-20', end: null }, today);
  assert.equal(eff.before.days, 6);
  assert.equal(eff.after.days, 1.5);
  assert.equal(A.preventiveEffect(idx, db, { start: '2026-10-20', end: null }, today), null, 'troppo pochi giorni dopo');
  assert.equal(A.preventiveEffect(idx, db, { start: '2026-06-10', end: null }, today), null, 'troppo pochi giorni prima');
});

test('analisi: i raggruppamenti rispettano i limiti del periodo richiesto', () => {
  const { db, idx } = build([
    ep({ start: '2026-10-05T07:00', meds: [{ name: 'X', cls: 'triptan' }] }),
    ep({ start: '2026-10-12T07:30', meds: [{ name: 'X', cls: 'triptan' }] }),
    ep({ start: '2026-10-19T16:00' }),
  ]);
  const weeks = A.buckets(idx, db, '2026-10-10', '2026-10-24', 'week');
  assert.equal(weeks[0].from, '2026-10-05');
  assert.equal(weeks[0].migraineDays, 0, 'il 5 ottobre e fuori periodo');
  assert.equal(weeks[0].attacks, 0);
  assert.equal(weeks.reduce((a, b) => a + b.migraineDays, 0), 2);
  const months = A.buckets(idx, db, '2026-10-06', '2026-10-15', 'month');
  assert.equal(months.length, 1);
  assert.equal(months[0].migraineDays, 1);
  assert.equal(months[0].attacks, 1);
  assert.equal(A.monthlyMedDays(idx, '2026-10-06', '2026-10-15')[0].any, 1);
  assert.equal(A.monthlyMedDays(idx, '2026-10-01', '2026-10-31')[0].any, 2);
});

test('backup: se la scrittura fallisce il ripristino non cambia lo stato', () => {
  reset();
  store.upsertEpisode(ep());
  store.flush();
  const incoming = store.sanitizeDb({ episodes: [ep({ start: '2026-09-01T10:00' }), ep({ start: '2026-09-02T10:00' })] });
  const original = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  try {
    assert.throws(() => store.importReplace(incoming), /spazio esaurito/i);
    assert.throws(() => store.importMerge(incoming), /spazio esaurito/i);
    assert.equal(Object.keys(store.getDb().episodes).length, 1, 'i dati in memoria non sono cambiati');
  } finally {
    globalThis.localStorage.setItem = original;
  }
  const res = store.importMerge(incoming);
  assert.equal(res.added, 2);
  assert.equal(Object.keys(store.getDb().episodes).length, 3);
});

const C = await import('../js/clinical.js');
const Z = await import('../js/zip.js');

test('v2: attacchi con orario non ricordato', () => {
  const e = store.sanitizeEpisode({
    start: '2026-10-10T08:30', end: '2026-10-12T09:00', timeUnknown: true, approxDur: 'days', intensity: 6, meds: [{ name: 'Ibuprofene', cls: 'nsaid', at: '2026-10-11T07:00' }],
  });
  assert.equal(e.start, '2026-10-10T12:00');
  assert.equal(e.end, '2026-10-12T12:00');
  assert.equal(e.meds[0].at, '2026-10-11T12:00');
  const e2 = store.sanitizeEpisode({ start: '2026-10-10T08:30', end: null, timeUnknown: true, approxDur: '4to12' });
  assert.equal(e2.end, e2.start, 'senza orario non può essere in corso');
  assert.equal(A.episodeMinutes(e2), null);
  const e3 = store.sanitizeEpisode({ start: '2026-10-10T08:30', end: '2026-10-10T10:00', approxDur: 'lt4' });
  assert.equal(e3.approxDur, '');
  assert.equal(e3.timeUnknown, false);
  assert.deepEqual(store.sanitizeEpisode({ start: '2026-10-10T08:30', tx: { vs: 'better', missed: 'x' } }).tx, { vs: 'better', missed: null });
  assert.deepEqual(store.sanitizeEpisode({ start: '2026-10-10T08:30', tx: { vs: 'boh', missed: true } }).tx, { vs: '', missed: true });
  const { idx } = build([{ ...e2 }, ep({ start: '2026-10-11T08:00' })]);
  assert.deepEqual(A.partOfDayCounts(idx.episodes), [0, 1, 0, 0], 'gli attacchi senza orario non entrano nelle fasce orarie');
  assert.equal(A.dayStatus(idx, store.emptyDb(), '2026-10-10'), 'migraine');
});

test('v2: inizio del diario impostato a mano', () => {
  const { db } = build([ep({ start: '2025-01-10T10:00' }), ep({ start: '2026-10-20T10:00' })], '2026-10-24', { createdAt: '2026-09-01T10:00' });
  let idx = A.makeIndex(db, '2026-10-24');
  assert.equal(idx.trackingStart, '2025-01-10');
  db.settings.diaryStart = '2026-09-01';
  idx = A.makeIndex(db, '2026-10-24');
  assert.equal(idx.trackingStart, '2026-09-01');
  assert.equal(idx.autoStart, '2025-01-10');
  const s = A.rangeStats(idx, db, '2024-01-01', '2026-10-24');
  assert.equal(s.attacks, 1, 'l’attacco isolato del 2025 non entra nelle statistiche');
  assert.equal(s.trackedDays, 54);
  assert.equal(A.dayStatus(idx, db, '2025-01-10'), 'migraine', 'ma resta visibile nel calendario');
  assert.equal(A.streakInfo(idx, '2026-10-24').longestFree, 49);
  const months = A.buckets(idx, db, '2025-01-01', '2026-10-24', 'month');
  assert.equal(months[0].migraineDays, 0);
  assert.equal(store.sanitizeSettings({ diaryStart: '2026-02-30' }).diaryStart, null);
});

test('v2: terapie, somministrazioni e prossima dose', () => {
  const p = store.sanitizePreventive({ name: 'Erenumab', start: '2026-06-01', doses: ['2026-05-01', '2026-06-01', 'x', '2026-06-29', '2026-06-29'] });
  assert.equal(p.cls, 'mab');
  assert.equal(p.every, 28);
  assert.deepEqual(p.doses, ['2026-06-01', '2026-06-29'], 'date valide, uniche e dentro il periodo');
  const nd = C.nextDose(p, '2026-07-20');
  assert.equal(nd.next, '2026-07-27');
  assert.equal(nd.daysLeft, 7);
  assert.equal(nd.status, 'ok');
  assert.equal(C.nextDose(p, '2026-07-26').status, 'due');
  assert.equal(C.nextDose(p, '2026-07-30').status, 'overdue');
  assert.equal(C.cycleDay(p, '2026-07-10').day, 11);
  const botox = store.sanitizePreventive({ name: 'Tossina botulinica', start: '2026-01-10' });
  assert.equal(botox.cls, 'botox');
  assert.equal(botox.every, 84);
  assert.deepEqual(C.doseAnchors(botox, '2026-07-01'), ['2026-01-10', '2026-04-04', '2026-06-27']);
  assert.equal(store.sanitizePreventive({ name: 'Venlafaxina 75', start: '2026-01-01' }).cls, 'snri');
  assert.equal(store.sanitizePreventive({ name: 'Aimovig', start: '2026-01-01' }).cls, 'mab', 'riconosce anche il nome commerciale');
  assert.equal(store.sanitizePreventive({ name: 'Topiramato', start: '2026-01-01', end: '2026-03-01', stop: 'effetti' }).stop, 'effetti');
  assert.equal(store.sanitizePreventive({ name: 'X', start: '2026-01-01', stop: 'effetti' }).stop, '', 'senza fine nessun motivo di interruzione');
  assert.equal(C.nextDose(store.sanitizePreventive({ name: 'Amitriptilina', start: '2026-01-01' }), '2026-02-01'), null, 'le terapie orali non hanno somministrazioni');
  reset();
  const saved = store.upsertPreventive(p);
  store.addTherapyDose(saved.id, '2026-05-20');
  const after = store.getDb().preventives[0];
  assert.equal(after.start, '2026-05-20', 'una somministrazione precedente sposta l’inizio');
  assert.deepEqual(after.doses, ['2026-05-20', '2026-06-01', '2026-06-29']);
  store.removeTherapyDose(saved.id, '2026-06-01');
  assert.deepEqual(store.getDb().preventives[0].doses, ['2026-05-20', '2026-06-29']);
});

test('v2: efficacia delle terapie rispetto al punto di partenza', () => {
  const eps = [];
  for (let i = 0; i < 12; i += 1) eps.push(ep({ start: `${dates.addDays('2026-04-05', i * 7)}T10:00` }));
  for (let i = 0; i < 3; i += 1) eps.push(ep({ start: `${dates.addDays('2026-08-01', i * 25)}T10:00`, tx: { vs: i ? 'better' : 'same', missed: i === 2 } }));
  const { db, idx, today } = build(eps, '2026-10-24', { createdAt: '2026-04-01T10:00' });
  const p = store.sanitizePreventive({ name: 'Erenumab', start: '2026-07-01', doses: ['2026-07-01', '2026-07-29', '2026-08-26', '2026-09-23', '2026-10-21'] });
  db.preventives.push(p);
  const o = C.therapyOutcome(idx, db, p, today);
  assert.equal(o.baseline.source, 'diary');
  assert.equal(Math.round(o.baseline.days * 10) / 10, 4);
  assert.equal(o.during.source, 'diary');
  assert.equal(Math.round(o.during.days * 10) / 10, 1);
  assert.equal(o.response, 'good');
  assert.equal(Math.round(o.change.daysPct * 100), -75);
  assert.deepEqual([o.vs.better, o.vs.same, o.vs.worse, o.vs.missed, o.vs.rated], [2, 1, 0, 1, 3]);
  assert.ok(o.monthly.length >= 6);
  assert.ok(o.cycle && o.cycle.complete >= 3);
  assert.match(C.outcomeLine(o), /4 → 1 giorni\/mese \(−75%\)/);

  const manual = store.sanitizePreventive({ name: 'Amitriptilina', start: '2026-03-01', baseDays: 10, baseInt: 7 });
  const om = C.therapyOutcome(idx, db, manual, today);
  assert.equal(om.baseline.source, 'manual');
  assert.equal(om.baseline.days, 10);

  db.history = store.sanitizeHistory({ periods: [{ from: '2024-01', to: '2024-12', days: 9, intensity: 8 }] });
  const old = store.sanitizePreventive({ name: 'Propranololo', start: '2025-01-01', end: '2025-06-30', stop: 'inefficace' });
  const oh = C.therapyOutcome(idx, db, old, today);
  assert.equal(oh.baseline.source, 'history');
  assert.equal(oh.baseline.days, 9);
  assert.equal(oh.during, null, 'nessun dato durante la terapia');
  assert.equal(oh.response, null);
});

test('v2: stime dalla storia e andamento a lungo termine', () => {
  const hist = store.sanitizeHistory({ periods: [{ from: '2020-01', to: '2021-12', days: 6, intensity: 7 }, { from: '2022-01', days: 12 }] });
  assert.equal(hist.periods.length, 2);
  const est = C.historyEstimate(hist, '2021-07-01', '2022-06-30', '2026-10-24');
  assert.equal(est.days, 9, 'media pesata su 6 mesi a 6 giorni e 6 mesi a 12');
  assert.equal(C.historyEstimate(hist, '2010-01-01', '2010-12-31', '2026-10-24'), null);
  const { db, idx, today } = build([ep({ start: '2026-10-10T10:00' }), ep({ start: '2026-09-15T10:00' })], '2026-10-24', { createdAt: '2026-09-01T10:00' });
  db.history = hist;
  const series = C.longTermSeries(idx, db, today);
  assert.equal(series.unit, 'quarter');
  assert.equal(series.points[0].source, 'history');
  assert.equal(series.points[0].value, 6);
  assert.equal(series.points[series.points.length - 1].source, 'diary');
  assert.ok(series.hasDiary && series.hasHistory);
  const short = build([ep({ start: '2026-10-10T10:00' })], '2026-10-24', { createdAt: '2026-06-01T10:00' });
  const s2 = C.longTermSeries(short.idx, short.db, '2026-10-24');
  assert.equal(s2.unit, 'month');
  assert.equal(s2.points.length, 5);
});

test('v2: MIDAS, sintesi clinica e osservazioni', () => {
  assert.equal(C.midasScore({ q: [3, 2, 1, 0, 4] }), 10);
  const eps = [];
  for (let i = 0; i < 80; i += 1) {
    const d = dates.addDays('2026-07-27', i);
    if (i % 5 < 3) eps.push(ep({ start: `${d}T09:00`, end: `${d}T15:00`, meds: [{ name: 'Rizatriptan', cls: 'triptan', at: `${d}T10:00`, effect: 2 }] }));
  }
  const { db, idx, today } = build(eps, '2026-10-24', { createdAt: '2026-07-20T10:00' });
  db.history = store.sanitizeHistory({
    birthYear: 1990,
    sex: 'f',
    onsetAge: 14,
    diagnoses: ['Emicrania con aura'],
    famKnown: 'yes',
    family: ['Madre'],
    contraception: 'Pillola estroprogestinica',
    typical: { intensity: 8, quality: ['Pulsante'], aura: 'sometimes', auraTypes: ['Visiva (luci, zig-zag, macchie)'] },
    periods: [{ from: '2015-01', to: '2019-12', days: 4 }],
    events: [{ date: '2021-10', title: 'Pronto soccorso per attacco di 4 giorni', er: true }],
    narrative: 'Racconto di prova.',
    updatedAt: '2026-10-01T10:00',
  });
  db.assessments = [store.sanitizeAssessment({ date: '2026-06-01', q: [10, 10, 5, 5, 2] }), store.sanitizeAssessment({ date: '2026-10-01', q: [2, 2, 1, 1, 0] })];
  db.preventives = [store.sanitizePreventive({ name: 'Topiramato', start: '2024-01-01', end: '2024-05-01', stop: 'effetti' }), store.sanitizePreventive({ name: 'Propranololo', start: '2023-01-01', end: '2023-06-01', stop: 'inefficace' })];
  const sum = C.clinicalSummary(idx, db, today);
  const text = sum.blocks.map((b) => b.text).join(' ');
  assert.match(text, /Donna, 36 anni\./);
  assert.match(text, /Mal di testa dall’età di 14 anni \(circa 22 anni di storia\)/);
  assert.match(text, /Familiarità per cefalea: madre/);
  assert.match(text, /Pronto soccorso/);
  assert.match(text, /MIDAS 6 \(grado II/);
  const ids = sum.observations.map((o) => o.text).join(' | ');
  assert.match(ids, /emicrania cronica/, 'frequenza ≥15 giorni al mese');
  assert.match(ids, /contraccezione ormonale/);
  assert.match(ids, /2 classi diverse/);
  assert.match(ids, /Punteggio MIDAS da 32 a 6/);
  assert.match(ids, /Farmaci sintomatici in/);
  assert.match(C.summaryPlainText(sum, { name: 'Giulia', today }), /^Sintesi clinica di Giulia/);
  const comp = C.historyCompleteness(db);
  assert.equal(comp.total, 7);
  assert.ok(comp.done >= 5);
  const empty = C.clinicalSummary(A.makeIndex(store.emptyDb(), today), store.emptyDb(), today);
  assert.equal(empty.blocks.length, 0);
});

test('v2: sanitizzazione di storia, contatti, visite, documenti e questionari', () => {
  const hs = store.sanitizeHistory({
    sex: 'zz', onsetAge: 300, famKnown: 'no', family: ['Madre'], periods: [{ from: '2020-05', to: '2019-01', days: 40 }, { from: 'boh', days: 3 }, { from: '2021-01' }],
    events: [{ date: '2019', title: 'Ricovero' }, { date: '2019-13', title: 'x' }, { date: '2020-02-30', title: 'y' }], acute: [{ name: '' }, { name: 'Ketoprofene', effect: 9 }],
    typical: { side: 'su', intensity: 0 }, narrative: 'a\u0000b',
  });
  assert.equal(hs.sex, '');
  assert.equal(hs.onsetAge, 110);
  assert.deepEqual(hs.family, [], 'familiari solo se la familiarità è «sì»');
  assert.equal(hs.periods.length, 1);
  assert.equal(hs.periods[0].to, '2020-05');
  assert.equal(hs.periods[0].days, 31);
  assert.equal(hs.events.length, 1);
  assert.equal(hs.acute.length, 1);
  assert.equal(hs.acute[0].effect, 3);
  assert.equal(hs.typical.side, '');
  assert.equal(hs.typical.intensity, 1);
  assert.equal(hs.narrative, 'ab');
  const c = store.sanitizeContact({ name: ' Centro  Cefalee ', email: 'non valida', phone: '02 <script>123', role: 'x' });
  assert.equal(c.name, 'Centro Cefalee');
  assert.equal(c.email, '');
  assert.equal(c.phone, '02 123');
  assert.equal(c.role, 'other');
  assert.equal(store.sanitizeVisit({ at: '2026-13-01T10:00' }), null);
  assert.equal(store.sanitizeVisit({ at: '2026-11-01T10:00', contactId: 'zzz' }).contactId, '');
  const d = store.sanitizeDoc({
    date: '2026-10-01', cat: 'boh', files: [{ fid: 'fabcdefgh', name: 'a.pdf', type: 'application/pdf', size: 10 }, { fid: '../x', name: 'b' }, { fid: 'fabcdefgh' }],
  });
  assert.equal(d.cat, 'other');
  assert.equal(d.title, 'Documento');
  assert.equal(d.files.length, 1);
  const m = store.sanitizeAssessment({ date: '2026-10-01', q: [1, 'x', 200] });
  assert.deepEqual(m.q, [1, 0, 92, 0, 0]);
  const db = store.sanitizeDb({ episodes: {}, docs: [d, d], contacts: [c], history: { narrative: 'x' } });
  assert.equal(db.docs.length, 2);
  assert.notEqual(db.docs[0].id, db.docs[1].id, 'id duplicati rigenerati');
  assert.equal(db.schema, 2);
});

test('v2: backup con e senza documenti, unione della storia', () => {
  reset();
  store.upsertEpisode(ep());
  const doc = store.upsertRecord('docs', { title: 'Referto', date: '2026-10-01', cat: 'visit', files: [{ fid: 'f12345678', name: 'r.pdf', type: 'application/pdf', size: 3 }] });
  store.updateHistory({ narrative: 'Storia A', periods: [{ id: 'haaaaaaaa', from: '2020-01', days: 5 }] });
  const plain = JSON.parse(store.exportJson());
  assert.equal(plain.docsIncluded, false);
  assert.equal(plain.data.docs, undefined);
  const full = store.exportJson({ withDocs: true, filePaths: new Map([['f12345678', 'documenti/Visite/2026-10-01 Referto/r.pdf']]) });
  assert.equal(JSON.parse(full).docsIncluded, true);
  assert.equal(store.backupFilePaths(full).get('f12345678'), 'documenti/Visite/2026-10-01 Referto/r.pdf');
  const incomingPlain = store.parseBackup(JSON.stringify(plain));
  const incomingFull = store.parseBackup(full);
  store.removeRecord('docs', doc.id);
  store.importReplace(incomingPlain);
  assert.equal(store.getDb().docs.length, 0, 'il backup senza documenti non tocca la cartella');
  store.importReplace(incomingFull, { withDocs: true });
  assert.equal(store.getDb().docs.length, 1);
  assert.deepEqual([...store.referencedFids()], ['f12345678']);
  store.updateHistory({ narrative: 'Storia B (più recente)', periods: [{ id: 'hbbbbbbbb', from: '2023-01', days: 8 }] });
  const res = store.importMerge(incomingFull, { withDocs: true });
  assert.equal(res.docsAdded, 0);
  const hs = store.getDb().history;
  assert.equal(hs.narrative, 'Storia B (più recente)', 'vince la storia aggiornata più di recente');
  assert.deepEqual(hs.periods.map((p) => p.id).sort(), ['haaaaaaaa', 'hbbbbbbbb'], 'i periodi vengono uniti');
  let wiped = 0;
  const off = store.onWipe(() => { wiped += 1; });
  store.wipeAll();
  off();
  assert.equal(wiped, 1);
});

test('zip: scrittura, lettura, CRC e deflate', async () => {
  assert.equal(Z.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const bin = new Uint8Array(3000).map((_, i) => (i * 7) % 256);
  const blob = await Z.createZip([
    { path: 'diario-emicrania.json', data: '{"ok":true}' },
    { path: 'documenti/Visite e referti/2026-10-01 Città/referto è.bin', data: new Blob([bin]) },
  ]);
  assert.equal(blob.type, 'application/zip');
  const entries = await Z.readZip(blob);
  assert.deepEqual(entries.map((e) => e.name), ['diario-emicrania.json', 'documenti/Visite e referti/2026-10-01 Città/referto è.bin']);
  assert.equal(await Z.readZipText(blob, entries[0]), '{"ok":true}');
  const back = new Uint8Array(await (await Z.readZipEntry(blob, entries[1], 'application/octet-stream')).arrayBuffer());
  assert.deepEqual([...back.slice(0, 10)], [...bin.slice(0, 10)]);
  assert.equal(back.length, 3000);
  const corrupted = new Uint8Array(await blob.arrayBuffer());
  corrupted[200] ^= 0xff;
  const bad = await Z.readZip(new Blob([corrupted]));
  await assert.rejects(Z.readZipEntry(new Blob([corrupted]), bad[1]), /danneggiato/);
  await assert.rejects(Z.readZip(new Blob(['non è uno zip, è un testo abbastanza lungo'])), /non è un archivio ZIP/);

  const zlib = await import('node:zlib');
  const text = 'testo compresso '.repeat(50);
  const raw = new TextEncoder().encode(text);
  const comp = zlib.deflateRawSync(raw);
  const name = new TextEncoder().encode('x.txt');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(Z.crc32(raw), 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(Z.crc32(raw), 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(raw.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(0, 42);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + name.length, 12); end.writeUInt32LE(30 + name.length + comp.length, 16);
  const zipBlob = new Blob([local, name, comp, cd, name, end]);
  const de = await Z.readZip(zipBlob);
  assert.equal(de[0].method, 8);
  assert.equal(await Z.readZipText(zipBlob, de[0]), text);
});

test('correzioni dalla revisione: dose prevista oggi, backup solo dati, mese in corso', () => {
  const p = store.sanitizePreventive({ name: 'Erenumab', start: '2026-09-27' });
  assert.equal(C.nextDose(p, '2026-10-24').daysLeft, 1);
  const due = C.nextDose(p, '2026-10-25');
  assert.equal(due.next, '2026-10-25', 'nel giorno previsto la dose non è ancora data per fatta');
  assert.equal(due.daysLeft, 0);
  assert.equal(due.status, 'due');
  assert.equal(C.nextDose(p, '2026-10-26').next, '2026-11-22');
  const first = store.sanitizePreventive({ name: 'Galcanezumab', start: '2026-10-25' });
  assert.equal(C.nextDose(first, '2026-10-25').daysLeft, 0);

  reset();
  store.upsertEpisode(ep());
  assert.equal(store.backupIncludesDocs(store.exportJson()), false);
  assert.equal(store.backupIncludesDocs(store.exportJson({ withDocs: true })), true);
  assert.equal(store.backupIncludesDocs(JSON.stringify({ episodes: {}, docs: [] })), true);
  assert.equal(store.backupIncludesDocs(JSON.stringify({ episodes: {} })), false);
  assert.equal(store.backupIncludesDocs('non json'), false);

  const eps = [];
  for (let i = 0; i < 30; i += 1) if (i % 4 === 0) eps.push(ep({ start: `${dates.addDays('2026-09-01', i)}T10:00` }));
  eps.push(ep({ start: '2026-10-02T10:00' }));
  const { db, idx } = build(eps, '2026-10-12', { createdAt: '2026-06-01T10:00' });
  const ther = store.sanitizePreventive({ name: 'Amitriptilina', start: '2026-08-01' });
  const o = C.therapyOutcome(idx, db, ther, '2026-10-12');
  const oct = o.monthly[o.monthly.length - 1];
  assert.equal(oct.month, '2026-10');
  assert.equal(oct.partial, true, 'il mese in corso è segnato come parziale');
  assert.equal(Math.round(oct.value * 10) / 10, 2.5, '1 giorno su 12 registrati = 2,5 ogni 30 giorni');
  const early = C.therapyOutcome(idx, db, ther, '2026-10-05');
  assert.equal(early.monthly[early.monthly.length - 1].value, null, 'con meno di 10 giorni registrati il mese non viene disegnato');
});

/* ---------- i18n ---------- */

const I18N = await import('../js/i18n.js');

test('i18n: segnaposto e plurali nelle lingue supportate', () => {
  const f = I18N.formatMessage;
  assert.equal(f('Ciao {nome}', { nome: 'Anna' }, 'it'), 'Ciao Anna');
  assert.equal(f('Ciao {nome}', {}, 'it'), 'Ciao {nome}', 'un parametro mancante resta visibile');
  const days = '{n, plural, one {# giorno} other {# giorni}}';
  assert.deepEqual([0, 1, 2, 5].map((n) => f(days, { n }, 'it')), ['0 giorni', '1 giorno', '2 giorni', '5 giorni']);
  assert.equal(f('{n, plural, =0 {nessun attacco} one {# attacco} other {# attacchi}}', { n: 0 }, 'it'), 'nessun attacco');
  assert.equal(f('{n, plural, one {{nome} ha # attacco} other {{nome} ha # attacchi}}', { n: 3, nome: 'Anna' }, 'it'), 'Anna ha 3 attacchi');
  assert.equal(f('Voto #1', {}, 'it'), 'Voto #1', '# fuori dai plurali non cambia');
  const ro = '{n, plural, one {# zi} few {# zile} other {# de zile}}';
  assert.deepEqual([1, 2, 5, 19, 20, 21, 101].map((n) => f(ro, { n }, 'ro')), ['1 zi', '2 zile', '5 zile', '19 zile', '20 de zile', '21 de zile', '101 zile']);
  assert.equal(f('{n, plural, one {# jour} other {# jours}}', { n: 0 }, 'fr'), '0 jour', 'in francese 0 e 1 sono singolari');
  assert.equal(f('{n, plural, one {# Tag} other {# Tage}}', { n: 1.5 }, 'de'), '1,5 Tage');
});

test('i18n: scelta della lingua dal telefono', () => {
  assert.equal(I18N.detectLang(['pt-BR', 'en']), 'pt');
  assert.equal(I18N.detectLang(['ja-JP', 'de-AT']), 'de');
  assert.equal(I18N.detectLang(['it-IT']), 'it');
  assert.equal(I18N.detectLang(['ja']), 'en');
  assert.equal(I18N.detectLang([]), 'en');
  assert.deepEqual(I18N.LANGS.map((l) => l.code), ['it', 'en', 'es', 'fr', 'de', 'pt', 'ro', 'nl']);
});

test('i18n: in italiano t(), tv(), tx() e le liste restituiscono il testo originale', () => {
  assert.equal(I18N.lang, 'it');
  assert.equal(I18N.t('Salva'), 'Salva');
  assert.equal(I18N.t('{n, plural, one {# attacco} other {# attacchi}}', { n: 2 }), '2 attacchi');
  assert.equal(I18N.tv('Stress'), 'Stress');
  assert.equal(I18N.tv(null), '');
  const node = { nodeType: 1 };
  assert.deepEqual(I18N.tx('Leggi {guida} ora', { guida: node }), ['Leggi ', node, ' ora']);
  assert.equal(I18N.listAnd(['a', 'b', 'c']), 'a, b e c');
  assert.equal(I18N.listOr(['a', 'b']), 'a o b');
  assert.equal(I18N.setLang('xx-non-esiste'), false);
  assert.equal(dates.relativeDay('2026-10-25', '2026-10-25'), 'Oggi');
  assert.deepEqual(dates.WEEKDAYS_SHORT, ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']);
  assert.deepEqual(dates.WEEKDAYS_LETTER, ['L', 'M', 'M', 'G', 'V', 'S', 'D']);
  assert.equal(dates.WEEKDAYS_LONG[0], 'lunedì');
});

test('i18n: ogni traduzione si formatta con tutte le forme di plurale senza lasciare graffe', async () => {
  const dir = new URL('../js/i18n/', import.meta.url);
  for (const { code } of I18N.LANGS) {
    if (code === 'it') continue;
    const { default: dict } = await import(new URL(`${code}.js`, dir));
    const entries = Object.entries(dict);
    assert.ok(entries.length > 100, `${code}: dizionario vuoto`);
    for (const [key, value] of entries) {
      assert.equal(typeof value, 'string', `${code}: ${key}`);
      for (const n of [0, 1, 2, 5, 21, 101, 1.5]) {
        const out = I18N.formatMessage(value, new Proxy({}, { get: () => n }), code);
        assert.ok(out.trim() && !/[{}]/.test(out), `${code}: «${key}» → «${out}» (n=${n})`);
      }
    }
  }
});

/* ---------- importazione dalle note ---------- */

const NP = await import('../js/notes/parse.js');
const NB = await import('../js/notes/build.js');
const NX = await import('../js/notes/extract.js');

const NOTE = ['2025', '12.03 emicrania forte 8/10, lato sinistro, nausea, 2 oki', '13.03 ^^', 'Primi di aprile', '2.04 leggero', '5.04 ciclo', '6.04 nessun dolore'].join('\n');
const TODAY = '2026-10-25';

function readNote(text, { annotate = {}, build: buildOpts = {} } = {}) {
  const { entries, meta } = NP.parseNotes(text, { today: TODAY });
  const rows = NB.annotate(entries, { today: TODAY, ...annotate });
  return { entries, meta, rows, built: NB.buildImport(rows, { defaultIntensity: 5, ...buildOpts }) };
}

test('note: date, anni, dettagli e tipo di riga', () => {
  const { entries, meta, built } = readNote(NOTE);
  assert.equal(entries.length, 5);
  assert.equal(meta.order, 'dmy');
  assert.deepEqual(entries.map((e) => e.date), ['2025-03-12', '2025-03-13', '2025-04-02', '2025-04-05', '2025-04-06']);
  assert.deepEqual(entries.map((e) => e.kind), ['attack', 'attack', 'attack', 'menses', 'free']);
  assert.equal(entries[0].intensity, 8);
  assert.equal(entries[0].side, 'sx');
  assert.ok(entries[0].symptoms.includes('Nausea'));
  assert.deepEqual(entries[0].meds.map((m) => [m.name, m.count]), [['Ketoprofene', 2]]);
  assert.ok(entries[1].flags.ditto && entries[1].intensity === 8, '«^^» ripete la riga precedente');
  assert.equal(entries[2].intensity, 2);
  assert.equal(built.episodes.length, 3, 'solo i tre attacchi diventano attacchi');
  const first = built.episodes[0];
  assert.equal(first.start, '2025-03-12T12:00');
  assert.equal(first.end, first.start);
  assert.equal(first.timeUnknown, true);
  assert.equal(first.meds.length, 2, 'due oki = due somministrazioni');
  assert.ok(first.note.includes('emicrania forte'));
  assert.equal(built.days['2025-04-05'].menses, true);
  assert.equal(built.days['2025-04-06'].free, true);
  assert.equal(built.menses, 1);
  assert.equal(built.freeDays, 1);
  assert.equal(built.first, '2025-03-12');
  assert.equal(built.last, '2025-04-06');
});

test('note: unione dei giorni consecutivi, doppioni e correzioni dell\'utente', () => {
  const merged = readNote(NOTE, { build: { mergeConsecutive: true } }).built;
  assert.equal(merged.episodes.length, 2);
  assert.equal(merged.episodes[0].start, '2025-03-12T12:00');
  assert.equal(merged.episodes[0].end, '2025-03-13T12:00');
  assert.equal(merged.episodes[0].approxDur, 'days');
  assert.equal(merged.episodes[0].intensity, 8);
  assert.equal(merged.merged, 1);
  const dup = readNote(NOTE, { annotate: { existingDays: new Set(['2025-03-12']) } });
  assert.equal(dup.built.episodes.length, 2, 'un giorno già nel diario si salta');
  assert.ok(dup.rows[0].issues.includes('existing') && !dup.rows[0].include);
  const keep = readNote(NOTE, { annotate: { existingDays: new Set(['2025-03-12']), skipExisting: false } });
  assert.equal(keep.built.episodes.length, 3);
  const { entries } = NP.parseNotes(NOTE, { today: TODAY });
  const overrides = new Map([
    [entries[0].key, { intensity: 3, note: 'corretta', removedMeds: new Set(['Ketoprofene']) }],
    [entries[2].key, { include: false }],
    [entries[3].key, { asAttack: true, intensity: 4 }],
  ]);
  const fixed = readNote(NOTE, { annotate: { overrides } }).built;
  assert.equal(fixed.episodes.length, 3, 'uno escluso, il «ciclo» promosso ad attacco');
  assert.equal(fixed.episodes[0].intensity, 3);
  assert.equal(fixed.episodes[0].note, 'corretta');
  assert.equal(fixed.episodes[0].meds.length, 0);
  assert.equal(fixed.episodes.find((e) => e.start.startsWith('2025-04-05')).intensity, 4);
  const future = readNote('2026\n30.12 forte', { annotate: {} });
  assert.equal(future.rows[0].issues.includes('future') && !future.rows[0].include, true, 'le date future non si importano');
});

test('note: l\'anno si deduce, i formati si leggono e i testi ostili non rompono nulla', () => {
  const noYear = NP.parseNotes(['12.10 forte', '14.10 oki', '2.11 leggero', '5.01 forte'].join('\n'), { today: TODAY });
  assert.deepEqual(noYear.entries.map((e) => e.date), ['2025-10-12', '2025-10-14', '2025-11-02', '2026-01-05']);
  assert.equal(noYear.meta.yearInferred, true);
  const us = NP.parseNotes('3/14/2025 bad migraine\n3/15/2025 took ibuprofen 400mg', { today: TODAY });
  assert.equal(us.meta.order, 'mdy');
  assert.deepEqual(us.entries.map((e) => e.date), ['2025-03-14', '2025-03-15']);
  assert.equal(us.entries[1].meds[0].name, 'Ibuprofene');
  assert.equal(NP.parseNotes('', { today: TODAY }).entries.length, 0);
  assert.equal(NP.parseNotes('   \n\n  ', { today: TODAY }).entries.length, 0);
  assert.equal(NP.parseNotes('lista della spesa\nlatte\nuova', { today: TODAY }).entries.length, 0);
  assert.equal(NP.parseNotes('31.04 forte', { today: TODAY }).entries[0].date, null, 'data impossibile: segnalata, non inventata');
  const lines = Array.from({ length: 4000 }, (_, i) => `${1 + (i % 28)}.${1 + (i % 12)}.${2000 + (i % 25)} forte ${1 + (i % 10)}/10 oki`).join('\n');
  let t0 = Date.now();
  assert.equal(NP.parseNotes(lines, { today: TODAY }).entries.length, 4000);
  assert.ok(Date.now() - t0 < 15000, 'quattromila righe in tempi ragionevoli');
  t0 = Date.now();
  NP.parseNotes(`12.03 ${'forte, oki; '.repeat(25000)}`, { today: TODAY });
  NP.parseNotes('1.1.1 '.repeat(40000), { today: TODAY });
  NP.parseNotes(`12.03 ${'(('.repeat(50000)}`, { today: TODAY });
  assert.ok(Date.now() - t0 < 15000, 'righe enormi o strane non bloccano la lettura');
});

test('note: importazione nel diario, annullamento e rimozione di un lotto', () => {
  reset();
  store.setFree('2025-03-13', true);
  const snap = store.snapshotDb();
  const { built } = readNote(NOTE);
  const res = store.addImportedEpisodes({
    episodes: built.episodes, days: built.days, customMeds: [{ name: 'Zalexil', cls: 'other' }, { name: 'Ibuprofene', cls: 'nsaid' }], settings: { cycle: true },
  });
  assert.equal(res.added, 3);
  assert.match(res.imp, /^i[a-z0-9]+$/);
  const db = store.getDb();
  const eps = Object.values(db.episodes);
  assert.equal(eps.length, 3);
  assert.ok(eps.every((e) => e.imp === res.imp && e.timeUnknown === true));
  assert.equal(db.days['2025-03-13'], undefined, 'un attacco importato toglie il «senza emicrania» di quel giorno');
  assert.equal(db.days['2025-04-05'].menses, true);
  assert.equal(db.days['2025-04-06'].free, true);
  assert.equal(db.settings.cycle, true);
  assert.deepEqual(db.settings.custom.meds.map((m) => m.name), ['Zalexil'], 'i farmaci già noti non si duplicano');
  const batches = store.importBatches();
  assert.equal(batches.length, 1);
  assert.deepEqual([batches[0].imp, batches[0].count, batches[0].from, batches[0].to], [res.imp, 3, '2025-03-12', '2025-04-02']);
  const back = store.parseBackup(store.exportJson());
  assert.ok(Object.values(back.episodes).every((e) => e.imp === res.imp), 'il lotto resta nel backup');
  store.restoreSnapshot(snap);
  assert.equal(Object.keys(store.getDb().episodes).length, 0);
  assert.equal(store.getDb().days['2025-03-13'].free, true, 'l\'annullamento ripristina tutto com\'era');
  assert.equal(store.getDb().settings.cycle, false);
  assert.equal(store.addImportedEpisodes({ episodes: built.episodes.slice(0, 1), imp: '../x' }).imp.startsWith('i'), true);
  const again = store.addImportedEpisodes({ episodes: built.episodes });
  assert.equal(store.importBatches().length, 2);
  assert.equal(store.removeImportedBatch(again.imp), 3);
  assert.equal(store.removeImportedBatch(again.imp), 0);
  assert.equal(Object.keys(store.getDb().episodes).length, 1, 'gli altri lotti non si toccano');
  const original = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  try {
    assert.throws(() => store.addImportedEpisodes({ episodes: built.episodes }), /spazio esaurito/i);
    assert.equal(Object.keys(store.getDb().episodes).length, 1, 'se non c\'è spazio non si importa nulla');
  } finally {
    globalThis.localStorage.setItem = original;
  }
});

test('note: estrazione del testo da PDF, RTF, HTML, Word, OpenDocument e CSV', async () => {
  const item = (str, x, y) => ({ str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, height: 10 });
  const rows = [['12.03', 40, 700], ['emicrania', 80, 700], ['forte', 140, 700], ['13.03', 40, 680], ['^^', 80, 680], ['15.03', 40, 660], ['leggero', 80, 660], ['20.03', 40, 580], ['oki', 80, 580]];
  const body = rows.map(([s, x, y]) => item(s, x, y));
  assert.deepEqual(NX.linesFromItems(body, 800), ['12.03 emicrania forte', '13.03 ^^', '15.03 leggero', '', '20.03 oki']);
  const withBands = [...body, item('3', 300, 20), item('24/10/2026, 18:20', 40, 790)];
  assert.deepEqual(NX.linesFromItems(withBands, 800).filter(Boolean), ['12.03 emicrania forte', '13.03 ^^', '15.03 leggero', '20.03 oki'], 'numero di pagina e intestazione di stampa scartati');
  assert.deepEqual(NX.linesFromItems([], 800), []);
  assert.equal(NX.textFromPages([{ items: body.slice(0, 3), height: 800 }, { items: body.slice(3, 5), height: 800 }]), '12.03 emicrania forte\n13.03 ^^');

  assert.equal(NX.rtfToText("{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 12.03 emicrania forte\\par 13.03 caff\\'e8\\par}"), '12.03 emicrania forte\n13.03 caffè\n');
  const clean = (s) => s.replace(/\u00a0/g, ' ').split('\n').map((x) => x.trim()).filter(Boolean);
  assert.deepEqual(clean(NX.htmlToText('<html><head><style>p{}</style></head><body><p>12.03 emicrania&nbsp;forte</p><div>13.03 caff&egrave;<br>14.03 &#232;</div></body></html>')), ['12.03 emicrania forte', '13.03 caffè', '14.03 è']);
  assert.equal(NX.docxToText('<w:document><w:body><w:p><w:pPr/><w:r><w:t>12.03 emicrania</w:t></w:r><w:r><w:t xml:space="preserve"> forte</w:t></w:r></w:p><w:p><w:r><w:t>13.03 ^^</w:t></w:r></w:p></w:body></w:document>'), '12.03 emicrania forte\n13.03 ^^');
  assert.equal(NX.odtToText('<office:text><text:p>12.03 emicrania<text:s/>forte</text:p><text:p>13.03 <text:span>ok</text:span></text:p></office:text>'), '12.03 emicrania forte\n13.03 ok');
  assert.equal(NX.csvToText('Data;Intensità;Note\n12/03/2025;8;"forte; con nausea"\n13/03/2025;3;\n'), '12/03/2025 Intensità: 8, Note: forte; con nausea\n13/03/2025 Intensità: 3');
  assert.equal(NX.decodeText(Uint8Array.of(0xef, 0xbb, 0xbf, 0x61)), 'a');
  assert.equal(NX.decodeText(Uint8Array.of(0x63, 0x61, 0x66, 0x66, 0xe8)), 'caffè', 'testo vecchio stile (Windows-1252)');
  assert.equal(NX.decodeText(Uint8Array.of(0xff, 0xfe, 0x61, 0x00)), 'a');
  assert.equal(NX.cleanPasted('a\r\nb\rc'), 'a\nb\nc');
  assert.deepEqual(['Diario.PDF', 'a.docx', 'b.odt', 'c.rtf', 'd.htm', 'e.csv', 'foto.heic', 'x.pages', 'nota.txt'].map((name) => NX.kindOf({ name })), ['pdf', 'docx', 'odt', 'rtf', 'html', 'csv', 'image', 'unsupported', 'text']);

  const txt = await NX.readNoteFile(new File(['\ufeff12.03 forte\r\n13.03 ok'], 'note.txt', { type: 'text/plain' }));
  assert.equal(txt.kind, 'text');
  assert.equal(txt.text.replace(/\r/g, ''), '12.03 forte\n13.03 ok');
  const docx = await Z.createZip([{ path: 'word/document.xml', data: '<w:document><w:p><w:r><w:t>12.03 forte</w:t></w:r></w:p></w:document>' }]);
  assert.equal((await NX.readNoteFile(new File([docx], 'diario.docx'))).text, '12.03 forte');
  const rtf = await NX.readNoteFile(new File(['{\\rtf1 12.03 forte\\par}'], 'diario.txt'));
  assert.equal(rtf.text.trim(), '12.03 forte', 'un RTF riconosciuto dal contenuto anche con estensione sbagliata');
  await assert.rejects(NX.readNoteFile(new File(['x'], 'foto.png', { type: 'image/png' })), { code: 'image' });
  await assert.rejects(NX.readNoteFile(new File(['   \n'], 'vuoto.txt')), { code: 'empty' });
  await assert.rejects(NX.readNoteFile(new File(['x'], 'diario.pages')), { code: 'unsupported' });
  await assert.rejects(NX.readNoteFile(new File([Uint8Array.of(0, 0, 0, 0, 1, 2, 3)], 'strano.bin')), { code: 'unsupported' });
  await assert.rejects(NX.readNoteFile(new File(['non è uno zip'], 'rotto.docx')), { code: 'unreadable' });
});

// Lettore di note in tutte le lingue: corpora sintetici, controllo dei dizionari, parole ambigue tra lingue, robustezza con testi a caso.
[['notes_run.mjs', 'i casi di prova in tests/notes/*.cases.json'], ['notes_lex_check.mjs', 'la struttura dei dizionari'], ['notes_collide.mjs', 'nessuna parola con significati incompatibili tra lingue'],
  ['notes_fuzz.mjs', 'testi inventati a caso non rompono nulla e danno voci importabili', ['150', '11']]].forEach(([script, what, args = []]) => {
  test(`note: ${what}`, () => {
    const r = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${script}\n${r.stdout || ''}${r.stderr || ''}`);
  });
});