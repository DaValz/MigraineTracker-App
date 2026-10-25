import { h } from '../dom.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import {
  getIndex, dayStatus, rangeStats, streakInfo, mohStatus, buildInsights, isOngoing,
} from '../analysis.js';
import {
  button, alertBox, statTile, card, cardTitle, toast, group, row, headline,
} from '../ui.js';
import { intensityColor } from '../data.js';
import {
  todayStr, addDays, fmtDateLong, fmtTime, nowStr, minutesBetween, formatDuration, WEEKDAYS_LETTER, weekdayMon, monthStart, monthOf, diffDays, relativeDay,
} from '../dates.js';
import { plural, num } from '../format.js';
import { isIos, isStandalone } from '../env.js';
import { episodeCard } from './shared.js';
import { openEpisodeEditor, openEndEpisodeSheet, openMedPicker } from './episode.js';
import { openDaySheet, openCheckin } from './day.js';
import { openRelief } from './relief.js';
import { exportBackup } from '../backup.js';
import { agendaItems, agendaCard } from './record.js';

export const elapsedText = (start) => formatDuration(Math.max(0, minutesBetween(start, nowStr())));

export function tickTimers(root = document) {
  root.querySelectorAll('[data-since]').forEach((el) => {
    el.textContent = elapsedText(el.dataset.since);
  });
}

function ongoingCard(ep) {
  const mins = minutesBetween(ep.start, nowStr());
  let note = null;
  if (mins > 7 * 24 * 60) note = 'Risulta in corso da più di una settimana: se è finito, tocca «Termina» per tenere corrette le statistiche.';
  else if (mins > 72 * 60) note = 'È in corso da oltre 72 ore: se il dolore non passa, contatta il medico.';
  return h(
    'div',
    { class: 'ongoing' },
    h('h2', {}, h('span', { class: 'pulse' }), 'Attacco in corso'),
    h('div', { class: 'timer', 'data-since': ep.start }, elapsedText(ep.start)),
    h('div', { class: 'meta' }, `Iniziato ${relativeDay(ep.start.slice(0, 10)).toLowerCase()} alle ${fmtTime(ep.start)} · intensità ${ep.intensity}/10`),
    note ? h('p', { class: 'meta' }, note) : null,
    h(
      'div',
      { class: 'btn-row', style: { marginBottom: '10px' } },
      button({
        label: 'Ho preso un farmaco',
        kind: 'secondary',
        icon: 'pill',
        block: true,
        onClick: () => openMedPicker(ep, (m) => {
          const cur = store.getDb().episodes[ep.id] || ep;
          store.upsertEpisode({ ...cur, meds: [...cur.meds, m] });
          toast(`${m.name} registrato alle ${fmtTime(m.at)}`);
        }),
      }),
    ),
    h(
      'div',
      { class: 'btn-row' },
      button({ label: 'Dettagli', kind: 'secondary', onClick: () => openEpisodeEditor({ id: ep.id }) }),
      button({ label: 'Termina', kind: 'primary', icon: 'check', onClick: () => openEndEpisodeSheet(ep) }),
    ),
  );
}

function todayCard(idx, db, today) {
  const status = dayStatus(idx, db, today);
  const eps = (idx.byDay.get(today) || []).filter((e) => !isOngoing(e));
  if (status === 'migraine') {
    if (!eps.length) return null;
    return h(
      'div',
      { class: 'today-card' },
      h('h2', {}, 'Oggi hai avuto mal di testa'),
      h('p', { class: 'sub' }, 'Tocca un attacco per modificarlo o aggiungere dettagli.'),
      ...eps.map((ep) => episodeCard(ep, { onClick: () => openEpisodeEditor({ id: ep.id }) })),
      button({ label: 'Registra un altro attacco', kind: 'secondary', icon: 'plus', block: true, onClick: () => openEpisodeEditor({}) }),
    );
  }
  if (status === 'free') {
    return h(
      'div',
      { class: 'today-card' },
      h('h2', {}, 'Nessuna emicrania oggi'),
      h('p', { class: 'sub' }, 'Giornata registrata. Se più tardi cambia qualcosa, puoi aggiungere un attacco.'),
      h(
        'div',
        { class: 'today-actions' },
        button({ label: 'Registra un attacco', kind: 'primary', icon: 'plus', block: true, onClick: () => openEpisodeEditor({}) }),
        button({ label: 'Dettagli della giornata', kind: 'secondary', icon: 'edit', block: true, onClick: () => openCheckin(today) }),
      ),
    );
  }
  return h(
    'div',
    { class: 'today-card' },
    h('h2', {}, 'Come stai oggi?'),
    h('p', { class: 'sub' }, 'Registrare la giornata richiede pochi secondi.'),
    h(
      'div',
      { class: 'today-actions' },
      button({ label: 'Ho mal di testa', kind: 'primary', size: 'lg', icon: 'bolt', block: true, onClick: () => openEpisodeEditor({}) }),
      button({
        label: 'Nessuna emicrania oggi',
        kind: 'success',
        size: 'lg',
        icon: 'sun',
        block: true,
        onClick: () => {
          store.setFree(today, true);
          toast('Giornata registrata', { action: { label: 'Aggiungi dettagli', onClick: () => openCheckin(today) } });
        },
      }),
    ),
  );
}

function strip(idx, db, today) {
  const days = [];
  for (let i = 13; i >= 0; i -= 1) days.push(addDays(today, -i));
  return h('div', { class: 'strip' }, days.map((d) => {
    const st = dayStatus(idx, db, d);
    const inten = idx.intensityByDay.get(d) || 0;
    const dot = h(
      'span',
      { class: `strip-dot s-${st}${inten >= 7 ? ' hi' : ''}`, style: st === 'migraine' ? { background: intensityColor(inten) } : null },
      st === 'migraine' ? String(inten) : (st === 'free' ? icon('check', 13) : ''),
    );
    return h(
      'button',
      {
        type: 'button',
        class: `strip-day${d === today ? ' today' : ''}`,
        'aria-label': `${fmtDateLong(d)}: ${st === 'migraine' ? `emicrania, intensità ${inten}` : st === 'free' ? 'nessuna emicrania' : 'nessun attacco'}`,
        onclick: () => openDaySheet(d),
      },
      dot,
      h('span', {}, WEEKDAYS_LETTER[weekdayMon(d)]),
    );
  }));
}

function backupDue(db, today) {
  const s = db.settings;
  if (!s.backupRemindDays || !Object.keys(db.episodes).length) return null;
  const ref = s.lastBackupAt ? s.lastBackupAt.slice(0, 10) : db.createdAt.slice(0, 10);
  const age = diffDays(ref, today);
  return age >= s.backupRemindDays ? { age, never: !s.lastBackupAt } : null;
}

export function homeView({ goTab }) {
  const today = todayStr();
  const db = store.getDb();
  const idx = getIndex(db, store.getRev(), today);
  const nodes = [];

  const status = store.getLoadStatus();
  if (status === 'corrupt') {
    nodes.push(alertBox({ tone: 'danger', icon: 'alert', title: 'Dati non leggibili', text: 'I dati salvati erano danneggiati: ne è stata conservata una copia, ma l’app è ripartita vuota. Se hai un backup, puoi ripristinarlo da Impostazioni › Dati e backup.' }));
  } else if (status === 'nostorage') {
    nodes.push(alertBox({ tone: 'warn', icon: 'alert', title: 'Salvataggio non disponibile', text: 'Il browser non permette di salvare i dati (navigazione privata?). Apri l’app da Safari normale o dall’icona sulla schermata Home.' }));
  }
  if (isIos() && !isStandalone() && !db.settings.installHintDismissed) {
    nodes.push(alertBox({
      tone: 'info',
      icon: 'download',
      title: 'Installa l’app',
      text: 'Tocca Condividi (il quadrato con la freccia) e scegli «Aggiungi alla schermata Home». Poi apri sempre il diario dall’icona.',
      action: button({ label: 'Ho capito', kind: 'secondary', size: 'sm', onClick: () => store.updateSettings({ installHintDismissed: true }) }),
    }));
  }
  const due = backupDue(db, today);
  if (due) {
    nodes.push(alertBox({
      tone: 'info',
      icon: 'shield',
      title: 'Fai un backup dei tuoi dati',
      text: due.never ? 'I tuoi dati sono solo su questo telefono. Salva un backup in File o iCloud Drive per non perderli.' : `L’ultimo backup risale a ${plural(due.age, 'giorno', 'giorni')} fa.`,
      action: button({ label: 'Esporta backup', kind: 'secondary', size: 'sm', icon: 'download', onClick: () => exportBackup() }),
    }));
  }

  idx.episodes.filter(isOngoing).forEach((ep) => nodes.push(ongoingCard(ep)));
  const tc = todayCard(idx, db, today);
  if (tc) nodes.push(tc);

  const agenda = agendaCard(agendaItems(db, today, { visitDays: 14, doseDays: 3 }));
  if (agenda) nodes.push(agenda);

  const moh = mohStatus(idx, today);
  if (moh.level !== 'ok') {
    nodes.push(alertBox({
      tone: moh.level === 'warn' ? 'warn' : 'info',
      icon: 'pill',
      title: moh.level === 'warn' ? 'Attenzione ai farmaci' : 'Farmaci: ti stai avvicinando alla soglia',
      text: `Negli ultimi 30 giorni hai assunto farmaci per il mal di testa in ${plural(moh.any, 'giorno', 'giorni')}. Usarli molto spesso (10 o più giorni al mese per triptani e associazioni, 15 per antidolorifici semplici) può peggiorare le cefalee. Parlane con il tuo medico.`,
    }));
  }

  const last30 = rangeStats(idx, db, addDays(today, -29), today);
  const month = rangeStats(idx, db, monthStart(monthOf(today)), today);
  const streak = streakInfo(idx, today);
  nodes.push(headline('Riepilogo', { label: 'Analisi', onClick: () => goTab('stats') }));
  nodes.push(h(
    'div',
    { class: 'stat-grid' },
    statTile({
      icon: 'sun',
      label: 'Dall’ultimo attacco',
      value: streak.daysSince == null ? '—' : (streak.daysSince === 0 ? 'Oggi' : plural(streak.daysSince, 'giorno', 'giorni')),
      sub: streak.daysSince == null ? 'Nessun attacco registrato' : `Record: ${plural(streak.longestFree, 'giorno', 'giorni')}`,
      tone: streak.daysSince ? 'good' : '',
    }),
    statTile({
      icon: 'calendar', label: 'Giorni con emicrania', value: String(month.migraineDays), sub: `questo mese, su ${month.trackedDays} registrati`, tone: 'primary', onClick: () => goTab('calendar'),
    }),
    statTile({
      icon: 'activity', label: 'Attacchi in 30 giorni', value: String(last30.attacks), sub: last30.avgIntensity == null ? 'Nessuna intensità' : `intensità media ${num(last30.avgIntensity)}/10`, tone: 'primary', onClick: () => goTab('stats'),
    }),
    statTile({
      icon: 'pill', label: 'Giorni con farmaci', value: String(last30.acuteMedDays), sub: 'negli ultimi 30 giorni', tone: moh.level === 'warn' ? 'bad' : moh.level === 'watch' ? 'warn' : 'primary',
    }),
  ));

  nodes.push(card(cardTitle('Ultimi 14 giorni'), strip(idx, db, today)));

  const insights = buildInsights(idx, db, today).slice(0, 3);
  if (insights.length) {
    nodes.push(headline('In evidenza'));
    nodes.push(card(
      ...insights.map((i) => h(
        'div',
        { class: 'insight' },
        h('span', { class: `row-icon ${i.tone === 'good' ? 'green' : i.tone === 'warn' ? 'orange' : 'blue'}` }, icon(i.icon, 16)),
        h('p', {}, i.text),
      )),
      button({ label: 'Tutte le analisi', kind: 'ghost', block: true, onClick: () => goTab('stats') }),
    ));
  } else if (!idx.episodes.length) {
    nodes.push(card(
      cardTitle('Benvenuto nel tuo diario'),
      h('p', { class: 'muted' }, 'Registra il tuo primo attacco o segna oggi come giornata senza emicrania. Nella scheda Cartella puoi raccontare la tua storia, inserire le terapie e caricare i documenti dell’ospedale.'),
    ));
  } else {
    nodes.push(card(cardTitle('In evidenza'), h('p', { class: 'muted' }, 'Continua a registrare: con qualche settimana di dati compariranno qui tendenze e suggerimenti.')));
  }

  nodes.push(group(row({
    icon: 'wind', tone: 'teal', title: 'Modalità sollievo', subtitle: 'Schermo scuro e respirazione guidata', chevron: true, onClick: () => openRelief(),
  })));

  return {
    title: 'Oggi',
    sub: fmtDateLong(today),
    node: h('div', {}, ...nodes),
  };
}
