import { h, replaceChildren } from '../dom.js';
import * as store from '../store.js';
import {
  openPage, confirmDialog, toast, row, group, footnote, field, button, card, cardTitle, stepper, dateInput, emptyState, pill,
} from '../ui.js';
import { MIDAS_QUESTIONS, midasGrade, MIDAS_GRADES } from '../data.js';
import { todayStr, addDays, fmtDateShort } from '../dates.js';
import { getIndex, rangeStats } from '../analysis.js';
import { midasSeries, midasScore } from '../clinical.js';
import { barChart } from '../charts.js';
import { plural } from '../format.js';

const GRADE_COLORS = {
  green: 'var(--green)', teal: 'var(--teal)', orange: 'var(--orange)', red: 'var(--red)',
};

export function openMidasForm(existing = null) {
  const today = todayStr();
  const db = store.getDb();
  const idx = getIndex(db, store.getRev(), today);
  const s = rangeStats(idx, db, addDays(today, -89), today);
  const fromDiary = s.trackedDays >= 60;
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : {
    date: today, q: [0, 0, 0, 0, 0], a: fromDiary ? s.migraineDays : null, b: fromDiary && s.avgIntensity != null ? Math.round(s.avgIntensity) : null,
  };
  const initial = JSON.stringify(draft);
  const scoreEl = h('div', { class: 'compare-box', style: { marginBottom: '14px' } });
  const paint = () => {
    const score = midasScore(draft);
    const g = midasGrade(score);
    replaceChildren(scoreEl, h('small', {}, 'Punteggio'), h('b', { style: { color: GRADE_COLORS[g.tone] } }, String(score)), h('span', {}, `Grado ${g.grade} · ${g.label}`));
  };
  paint();
  const saveBtn = h('button', { type: 'button', class: 'bar-btn solid' }, 'Salva');
  const page = openPage({
    title: 'Questionario MIDAS',
    backLabel: 'Annulla',
    right: saveBtn,
    onBack: async (p) => {
      if (JSON.stringify(draft) === initial) {
        p.close();
        return;
      }
      if (await confirmDialog({ title: 'Scartare le risposte?', confirmLabel: 'Scarta', cancelLabel: 'Continua', danger: true })) p.close();
    },
  });
  const qs = MIDAS_QUESTIONS.map((q, i) => field({
    label: `${i + 1}. ${q}`,
    control: stepper({
      value: draft.q[i], min: 0, max: 90, label: `risposta alla domanda ${i + 1}`, unit: 'giorni', onChange: (v) => { draft.q[i] = v == null ? 0 : v; paint(); },
    }),
  }));
  replaceChildren(
    page.body,
    h('p', { class: 'page-intro' }, 'Misura quanto il mal di testa limita la tua vita. Rispondi pensando agli ultimi 3 mesi: il neurologo lo usa per scegliere e controllare le terapie. Compilalo ad esempio prima di ogni visita.'),
    scoreEl,
    card(field({ label: 'Data', control: dateInput({ value: draft.date, max: today, label: 'Data del questionario', onChange: (v) => { if (v) draft.date = v; } }) })),
    card(cardTitle('Negli ultimi 3 mesi'), ...qs),
    card(
      cardTitle('Informazioni aggiuntive'),
      field({
        label: 'A. In quanti giorni hai avuto mal di testa?',
        control: stepper({
          value: draft.a, min: 0, max: 92, start: 10, unit: 'giorni', label: 'giorni con mal di testa', onChange: (v) => { draft.a = v; },
        }),
        hint: fromDiary && !existing ? 'Precompilato dal diario degli ultimi 90 giorni.' : null,
      }),
      field({
        label: 'B. Quanto era forte il dolore, in media (0–10)?',
        control: stepper({
          value: draft.b, min: 0, max: 10, start: 6, label: 'intensità media', onChange: (v) => { draft.b = v; },
        }),
      }),
    ),
    existing ? button({
      label: 'Elimina questionario',
      kind: 'danger',
      icon: 'trash',
      block: true,
      onClick: async () => {
        if (!(await confirmDialog({ title: 'Eliminare il questionario?', confirmLabel: 'Elimina', danger: true }))) return;
        const removed = store.removeRecord('assessments', existing.id);
        page.close();
        toast('Questionario eliminato', { action: { label: 'Annulla', onClick: () => store.upsertRecord('assessments', removed) } });
      },
    }) : null,
    footnote('Domande ispirate al questionario MIDAS (Migraine Disability Assessment). Il punteggio è la somma delle prime 5 risposte: I 0–5, II 6–10, III 11–20, IV 21 o più.'),
  );
  saveBtn.addEventListener('click', () => {
    store.upsertRecord('assessments', { ...draft, id: existing ? existing.id : undefined });
    page.close();
    const score = midasScore(draft);
    toast(`Questionario salvato: punteggio ${score} (grado ${midasGrade(score).grade})`);
  });
  return page;
}

export function openMidas() {
  const page = openPage({ title: 'Disabilità (MIDAS)' });
  const render = () => {
    const series = midasSeries(store.getDb());
    const nodes = [h('p', { class: 'page-intro' }, 'Il questionario MIDAS misura i giorni persi o limitati dal mal di testa negli ultimi 3 mesi. Ripeterlo nel tempo mostra se le terapie stanno migliorando la tua vita quotidiana.')];
    if (series.length) {
      const last = series[series.length - 1];
      nodes.push(card(
        cardTitle('Ultimo risultato', pill(`Grado ${last.grade.grade}`, last.grade.tone === 'teal' ? 'teal' : last.grade.tone)),
        h('div', { class: 'flex' }, h('span', { class: 'stat-value', style: { color: GRADE_COLORS[last.grade.tone] } }, String(last.score)), h('div', {}, h('div', { style: { fontWeight: '600' } }, last.grade.label), h('div', { class: 'muted small' }, fmtDateShort(last.date)))),
        series.length >= 2 ? h('div', { style: { marginTop: '14px' } }, barChart({
          data: series.slice(-10).map((s) => ({ label: fmtDateShort(s.date).slice(0, 5), value: s.score, color: GRADE_COLORS[s.grade.tone], title: `${fmtDateShort(s.date)}: ${s.score}` })),
          height: 140,
          showValues: true,
          ariaLabel: 'Punteggi MIDAS nel tempo',
        })) : null,
      ));
      nodes.push(group(...[...series].reverse().map((s) => row({
        icon: 'clipboard',
        tone: s.grade.tone === 'teal' ? 'teal' : s.grade.tone,
        title: `Punteggio ${s.score} · grado ${s.grade.grade}`,
        subtitle: [fmtDateShort(s.date), s.a != null ? `${plural(s.a, 'giorno', 'giorni')} con mal di testa` : '', s.b != null ? `dolore medio ${s.b}/10` : ''].filter(Boolean).join(' · '),
        chevron: true,
        onClick: () => openMidasForm(s),
      }))));
    } else {
      nodes.push(emptyState({ icon: 'clipboard', title: 'Nessun questionario', text: 'Bastano due minuti. Ti consigliamo di compilarlo ora e poi ogni 3 mesi.' }));
    }
    nodes.push(button({ label: 'Compila il questionario', kind: 'primary', icon: 'edit', block: true, onClick: () => openMidasForm() }));
    nodes.push(h('div', { class: 'mt' }, card(
      cardTitle('Come si legge'),
      ...MIDAS_GRADES.map((g) => h('div', { class: 'kv' }, h('span', {}, `Grado ${g.grade} · ${g.max > 100 ? `${g.min}+` : `${g.min}–${g.max}`}`), h('b', {}, g.label))),
    )));
    replaceChildren(page.body, ...nodes);
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}
