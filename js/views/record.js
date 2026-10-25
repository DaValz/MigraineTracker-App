import { h } from '../dom.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import {
  card, cardTitle, button, group, row, footnote, headline, pill, toast,
} from '../ui.js';
import { visitKindLabel } from '../data.js';
import {
  todayStr, nowStr, fmtTime, fmtMonthShort, diffDays, fmtDateShort,
} from '../dates.js';
import { getIndex } from '../analysis.js';
import {
  clinicalSummary, historyCompleteness, nextDose, midasSeries, activeTherapies, isInjectable,
} from '../clinical.js';
import { plural } from '../format.js';
import { openHistory, openClinicalSummary } from './history.js';
import { openTherapies, openTherapyDetail } from './therapies.js';
import { openDocuments } from './documents.js';
import { openCare, openVisitEditor, contactName } from './care.js';
import { openMidas } from './midas.js';
import { openReport } from './report.js';

/** Somministrazioni in scadenza e visite dei prossimi giorni. */
export function agendaItems(db, today = todayStr(), { visitDays = 30, doseDays = 7 } = {}) {
  const items = [];
  activeTherapies(db, today).filter(isInjectable).forEach((p) => {
    const nd = nextDose(p, today);
    if (!nd || nd.daysLeft > doseDays) return;
    const what = p.cls === 'botox' ? 'seduta' : 'somministrazione';
    items.push({
      key: `d${p.id}`,
      date: nd.next < today ? today : nd.next,
      sortKey: `${nd.next}T00:00`,
      title: `${p.name}: ${what}`,
      sub: nd.status === 'overdue' ? `Prevista il ${fmtDateShort(nd.next)}, in ritardo` : (nd.daysLeft === 0 ? 'Prevista oggi' : `Tra ${plural(nd.daysLeft, 'giorno', 'giorni')}`),
      tone: nd.status === 'ok' ? '' : 'warn',
      therapy: p,
      due: nd.daysLeft <= 0,
    });
  });
  const now = nowStr();
  db.visits.filter((v) => v.at >= now.slice(0, 10) && diffDays(today, v.at.slice(0, 10)) <= visitDays).forEach((v) => {
    const who = contactName(db, v.contactId);
    items.push({
      key: `v${v.id}`,
      date: v.at.slice(0, 10),
      sortKey: v.at,
      title: visitKindLabel(v.kind),
      sub: [`ore ${fmtTime(v.at)}`, who].filter(Boolean).join(' · '),
      visit: v,
    });
  });
  return items.sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
}

export function agendaCard(items, { title = 'In programma' } = {}) {
  if (!items.length) return null;
  return card(
    cardTitle(title),
    ...items.map((it) => h(
      'div',
      { class: 'agenda-item' },
      h('div', { class: 'agenda-date' }, h('small', {}, fmtMonthShort(it.date.slice(0, 7))), h('b', {}, String(Number(it.date.slice(8, 10))))),
      h('button', {
        type: 'button',
        class: 'agenda-main',
        style: { background: 'none', border: '0', padding: '0', textAlign: 'left', color: 'inherit' },
        onclick: () => (it.therapy ? openTherapyDetail(it.therapy.id) : openVisitEditor(it.visit)),
      }, h('strong', {}, it.title), h('span', { style: it.tone === 'warn' ? { color: 'var(--orange-text)' } : null }, it.sub)),
      it.due ? button({
        label: 'Fatta',
        kind: 'secondary',
        size: 'sm',
        icon: 'check',
        onClick: () => {
          store.addTherapyDose(it.therapy.id, todayStr());
          toast('Somministrazione registrata');
        },
      }) : null,
    )),
  );
}

export function recordView() {
  const today = todayStr();
  const db = store.getDb();
  const idx = getIndex(db, store.getRev(), today);
  const comp = historyCompleteness(db);
  const nodes = [];

  if (comp.done === 0 && !idx.episodes.length) {
    nodes.push(card(
      h('div', { class: 'flex', style: { alignItems: 'flex-start', marginBottom: '12px' } },
        h('span', { class: 'row-icon indigo' }, icon('book', 18)),
        h('div', {}, h('h3', { style: { fontSize: '1.1rem', fontWeight: '700' } }, 'Racconta la tua storia'), h('p', { class: 'muted small' }, 'Non serve compilare il diario del passato: descrivi la tua situazione come alla prima visita dal neurologo. L’app ne terrà conto nelle analisi e nel report.'))),
      button({ label: 'Inizia', kind: 'primary', block: true, onClick: () => openHistory() }),
    ));
  } else {
    const sum = clinicalSummary(idx, db, today);
    const obs = sum.observations.slice(0, 3);
    nodes.push(card(
      cardTitle('Sintesi clinica', h('button', { type: 'button', class: 'link', onclick: () => openClinicalSummary() }, 'Apri')),
      ...(obs.length ? obs.map((o) => h('div', { class: 'insight' }, h('span', { class: `row-icon ${o.tone === 'good' ? 'green' : o.tone === 'warn' ? 'orange' : 'blue'}` }, icon(o.icon, 16)), h('p', { class: 'clamp' }, o.text))) : [h('p', { class: 'muted' }, 'Compila la tua storia e registra gli attacchi: qui comparirà un riassunto in stile anamnesi.')]),
      button({ label: 'Leggi la sintesi completa', kind: 'ghost', block: true, onClick: () => openClinicalSummary() }),
    ));
  }

  const agenda = agendaCard(agendaItems(db, today));
  if (agenda) nodes.push(agenda);

  const active = activeTherapies(db, today);
  const dueCount = active.filter((p) => {
    const nd = isInjectable(p) ? nextDose(p, today) : null;
    return nd && nd.status !== 'ok';
  }).length;
  const visitsNext = db.visits.filter((v) => v.at >= nowStr()).sort((a, b) => (a.at < b.at ? -1 : 1))[0];
  const main = db.contacts.find((c) => c.main) || db.contacts[0];
  const midas = midasSeries(db);
  const lastMidas = midas[midas.length - 1];
  const lastDoc = [...db.docs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];

  nodes.push(headline('La mia cartella'));
  nodes.push(group(
    row({
      icon: 'book', tone: 'indigo', title: 'La mia storia', subtitle: `${plural(comp.done, 'sezione compilata', 'sezioni compilate')} su ${comp.total}`, right: h('span', { class: 'progress-ring', style: { '--p': String(Math.round((comp.done / comp.total) * 100)) }, 'data-label': `${comp.done}/${comp.total}` }), chevron: true, onClick: () => openHistory(),
    }),
    row({
      icon: 'shield',
      tone: 'green',
      title: 'Terapie di prevenzione',
      subtitle: active.length ? active.map((p) => p.name).join(', ') : (db.preventives.length ? 'Nessuna in corso' : 'Anticorpi monoclonali, tossina botulinica, antidepressivi…'),
      right: dueCount ? pill('Da fare', 'orange') : (db.preventives.length ? String(db.preventives.length) : null),
      chevron: true,
      onClick: () => openTherapies(),
    }),
    row({
      icon: 'folder', tone: 'blue', title: 'Documenti', subtitle: db.docs.length ? `Ultimo: ${lastDoc.title}` : 'Referti, risonanze, piani terapeutici', right: db.docs.length ? String(db.docs.length) : null, chevron: true, onClick: () => openDocuments(),
    }),
    row({
      icon: 'hospital', tone: 'red', title: 'Centro curante e visite', subtitle: visitsNext ? `Prossima: ${fmtDateShort(visitsNext.at.slice(0, 10))} alle ${fmtTime(visitsNext.at)}` : (main ? main.name : 'Contatti dell’ospedale, visite, domande'), chevron: true, onClick: () => openCare(),
    }),
    row({
      icon: 'clipboard', tone: 'orange', title: 'Questionario MIDAS', subtitle: lastMidas ? `Ultimo: ${lastMidas.score} (grado ${lastMidas.grade.grade}) il ${fmtDateShort(lastMidas.date)}` : 'Quanto il mal di testa limita la tua vita', chevron: true, onClick: () => openMidas(),
    }),
  ));
  nodes.push(group(row({
    icon: 'file', tone: 'gray', title: 'Report per il medico', subtitle: 'PDF con sintesi, terapie, andamento e attacchi', chevron: true, onClick: () => openReport(),
  })));
  nodes.push(footnote('La cartella resta solo su questo telefono. Fai ogni tanto un backup completo da Impostazioni › Dati e backup.'));
  return { title: 'Cartella', sub: db.settings.name || '', node: h('div', {}, ...nodes) };
}
