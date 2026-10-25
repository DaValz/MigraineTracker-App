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
  todayStr, addDays, fmtDateLong, fmtDateMedium, fmtTime, nowStr, minutesBetween, formatDuration, WEEKDAYS_LETTER, weekdayMon, monthStart, monthOf, diffDays,
} from '../dates.js';
import { num } from '../format.js';
import { t, tv } from '../i18n.js';
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

function startedText(ep) {
  const day = ep.start.slice(0, 10);
  const diff = diffDays(todayStr(), day);
  const args = { ora: fmtTime(ep.start), intensita: ep.intensity };
  if (diff === 0) return t('Iniziato oggi alle {ora} · intensità {intensita}/10', args);
  if (diff === -1) return t('Iniziato ieri alle {ora} · intensità {intensita}/10', args);
  if (diff === 1) return t('Iniziato domani alle {ora} · intensità {intensita}/10', args);
  return t('Iniziato {data} alle {ora} · intensità {intensita}/10', { ...args, data: fmtDateMedium(day) });
}

function ongoingCard(ep) {
  const mins = minutesBetween(ep.start, nowStr());
  let note = null;
  if (mins > 7 * 24 * 60) note = t('Risulta in corso da più di una settimana: se è finito, tocca «Termina» per tenere corrette le statistiche.');
  else if (mins > 72 * 60) note = t('È in corso da oltre 72 ore: se il dolore non passa, contatta il medico.');
  return h(
    'div',
    { class: 'ongoing' },
    h('h2', {}, h('span', { class: 'pulse' }), t('Attacco in corso')),
    h('div', { class: 'timer', 'data-since': ep.start }, elapsedText(ep.start)),
    h('div', { class: 'meta' }, startedText(ep)),
    note ? h('p', { class: 'meta' }, note) : null,
    h(
      'div',
      { class: 'btn-row', style: { marginBottom: '10px' } },
      button({
        label: t('Ho preso un farmaco'),
        kind: 'secondary',
        icon: 'pill',
        block: true,
        onClick: () => openMedPicker(ep, (m) => {
          const cur = store.getDb().episodes[ep.id] || ep;
          store.upsertEpisode({ ...cur, meds: [...cur.meds, m] });
          toast(t('{farmaco} registrato alle {ora}', { farmaco: tv(m.name), ora: fmtTime(m.at) }));
        }),
      }),
    ),
    h(
      'div',
      { class: 'btn-row' },
      button({ label: t('Dettagli'), kind: 'secondary', onClick: () => openEpisodeEditor({ id: ep.id }) }),
      button({ label: t('Termina'), kind: 'primary', icon: 'check', onClick: () => openEndEpisodeSheet(ep) }),
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
      h('h2', {}, t('Oggi hai avuto mal di testa')),
      h('p', { class: 'sub' }, t('Tocca un attacco per modificarlo o aggiungere dettagli.')),
      ...eps.map((ep) => episodeCard(ep, { onClick: () => openEpisodeEditor({ id: ep.id }) })),
      button({ label: t('Registra un altro attacco'), kind: 'secondary', icon: 'plus', block: true, onClick: () => openEpisodeEditor({}) }),
    );
  }
  if (status === 'free') {
    return h(
      'div',
      { class: 'today-card' },
      h('h2', {}, t('Nessuna emicrania oggi')),
      h('p', { class: 'sub' }, t('Giornata registrata. Se più tardi cambia qualcosa, puoi aggiungere un attacco.')),
      h(
        'div',
        { class: 'today-actions' },
        button({ label: t('Registra un attacco'), kind: 'primary', icon: 'plus', block: true, onClick: () => openEpisodeEditor({}) }),
        button({ label: t('Dettagli della giornata'), kind: 'secondary', icon: 'edit', block: true, onClick: () => openCheckin(today) }),
      ),
    );
  }
  return h(
    'div',
    { class: 'today-card' },
    h('h2', {}, t('Come stai oggi?')),
    h('p', { class: 'sub' }, t('Registrare la giornata richiede pochi secondi.')),
    h(
      'div',
      { class: 'today-actions' },
      button({ label: t('Ho mal di testa'), kind: 'primary', size: 'lg', icon: 'bolt', block: true, onClick: () => openEpisodeEditor({}) }),
      button({
        label: t('Nessuna emicrania oggi'),
        kind: 'success',
        size: 'lg',
        icon: 'sun',
        block: true,
        onClick: () => {
          store.setFree(today, true);
          toast(t('Giornata registrata'), { action: { label: t('Aggiungi dettagli'), onClick: () => openCheckin(today) } });
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
    const label = st === 'migraine'
      ? t('{data}: emicrania, intensità {intensita}', { data: fmtDateLong(d), intensita: inten })
      : st === 'free' ? t('{data}: nessuna emicrania', { data: fmtDateLong(d) }) : t('{data}: nessun attacco', { data: fmtDateLong(d) });
    return h(
      'button',
      {
        type: 'button',
        class: `strip-day${d === today ? ' today' : ''}`,
        'aria-label': label,
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
    nodes.push(alertBox({ tone: 'danger', icon: 'alert', title: t('Dati non leggibili'), text: t('I dati salvati erano danneggiati: ne è stata conservata una copia, ma l’app è ripartita vuota. Se hai un backup, puoi ripristinarlo da Impostazioni › Dati e backup.') }));
  } else if (status === 'nostorage') {
    nodes.push(alertBox({ tone: 'warn', icon: 'alert', title: t('Salvataggio non disponibile'), text: t('Il browser non permette di salvare i dati (navigazione privata?). Apri l’app da Safari normale o dall’icona sulla schermata Home.') }));
  }
  if (isIos() && !isStandalone() && !db.settings.installHintDismissed) {
    nodes.push(alertBox({
      tone: 'info',
      icon: 'download',
      title: t('Installa l’app'),
      text: t('Tocca Condividi (il quadrato con la freccia) e scegli «Aggiungi alla schermata Home». Poi apri sempre il diario dall’icona.'),
      action: button({ label: t('Ho capito'), kind: 'secondary', size: 'sm', onClick: () => store.updateSettings({ installHintDismissed: true }) }),
    }));
  }
  const due = backupDue(db, today);
  if (due) {
    nodes.push(alertBox({
      tone: 'info',
      icon: 'shield',
      title: t('Fai un backup dei tuoi dati'),
      text: due.never ? t('I tuoi dati sono solo su questo telefono. Salva un backup in File o iCloud Drive per non perderli.') : t('{n, plural, one {L’ultimo backup risale a # giorno fa.} other {L’ultimo backup risale a # giorni fa.}}', { n: due.age }),
      action: button({ label: t('Esporta backup'), kind: 'secondary', size: 'sm', icon: 'download', onClick: () => exportBackup() }),
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
      title: moh.level === 'warn' ? t('Attenzione ai farmaci') : t('Farmaci: ti stai avvicinando alla soglia'),
      text: t('{n, plural, one {Negli ultimi 30 giorni hai assunto farmaci per il mal di testa in # giorno. Usarli molto spesso (10 o più giorni al mese per triptani e associazioni, 15 per antidolorifici semplici) può peggiorare le cefalee. Parlane con il tuo medico.} other {Negli ultimi 30 giorni hai assunto farmaci per il mal di testa in # giorni. Usarli molto spesso (10 o più giorni al mese per triptani e associazioni, 15 per antidolorifici semplici) può peggiorare le cefalee. Parlane con il tuo medico.}}', { n: moh.any }),
    }));
  }

  const last30 = rangeStats(idx, db, addDays(today, -29), today);
  const month = rangeStats(idx, db, monthStart(monthOf(today)), today);
  const streak = streakInfo(idx, today);
  nodes.push(headline(t('Riepilogo'), { label: t('Analisi'), onClick: () => goTab('stats') }));
  nodes.push(h(
    'div',
    { class: 'stat-grid' },
    statTile({
      icon: 'sun',
      label: t('Dall’ultimo attacco'),
      value: streak.daysSince == null ? '—' : (streak.daysSince === 0 ? t('Oggi') : t('{n, plural, one {# giorno} other {# giorni}}', { n: streak.daysSince })),
      sub: streak.daysSince == null ? t('Nessun attacco registrato') : t('{n, plural, one {Record: # giorno} other {Record: # giorni}}', { n: streak.longestFree }),
      tone: streak.daysSince ? 'good' : '',
    }),
    statTile({
      icon: 'calendar',
      label: t('Giorni con emicrania'),
      value: String(month.migraineDays),
      sub: t('{n, plural, one {questo mese, su # registrato} other {questo mese, su # registrati}}', { n: month.trackedDays }),
      tone: 'primary',
      onClick: () => goTab('calendar'),
    }),
    statTile({
      icon: 'activity',
      label: t('Attacchi in 30 giorni'),
      value: String(last30.attacks),
      sub: last30.avgIntensity == null ? t('Nessuna intensità') : t('intensità media {valore}/10', { valore: num(last30.avgIntensity) }),
      tone: 'primary',
      onClick: () => goTab('stats'),
    }),
    statTile({
      icon: 'pill', label: t('Giorni con farmaci'), value: String(last30.acuteMedDays), sub: t('negli ultimi 30 giorni'), tone: moh.level === 'warn' ? 'bad' : moh.level === 'watch' ? 'warn' : 'primary',
    }),
  ));

  nodes.push(card(cardTitle(t('Ultimi 14 giorni')), strip(idx, db, today)));

  const insights = buildInsights(idx, db, today).slice(0, 3);
  if (insights.length) {
    nodes.push(headline(t('In evidenza')));
    nodes.push(card(
      ...insights.map((i) => h(
        'div',
        { class: 'insight' },
        h('span', { class: `row-icon ${i.tone === 'good' ? 'green' : i.tone === 'warn' ? 'orange' : 'blue'}` }, icon(i.icon, 16)),
        h('p', {}, i.text),
      )),
      button({ label: t('Tutte le analisi'), kind: 'ghost', block: true, onClick: () => goTab('stats') }),
    ));
  } else if (!idx.episodes.length) {
    nodes.push(card(
      cardTitle(t('Benvenuto nel tuo diario')),
      h('p', { class: 'muted' }, t('Registra il tuo primo attacco o segna oggi come giornata senza emicrania. Nella scheda Cartella puoi raccontare la tua storia, inserire le terapie e caricare i documenti dell’ospedale.')),
    ));
  } else {
    nodes.push(card(cardTitle(t('In evidenza')), h('p', { class: 'muted' }, t('Continua a registrare: con qualche settimana di dati compariranno qui tendenze e suggerimenti.'))));
  }

  nodes.push(group(row({
    icon: 'wind', tone: 'teal', title: t('Modalità sollievo'), subtitle: t('Schermo scuro e respirazione guidata'), chevron: true, onClick: () => openRelief(),
  })));

  return {
    title: t('Oggi'),
    sub: fmtDateLong(today),
    node: h('div', {}, ...nodes),
  };
}
