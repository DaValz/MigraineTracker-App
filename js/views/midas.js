import { h, replaceChildren } from '../dom.js';
import { t } from '../i18n.js';
import * as store from '../store.js';
import {
  openPage, confirmDialog, toast, row, group, footnote, field, button, card, cardTitle, stepper, dateInput, emptyState, pill,
} from '../ui.js';
import { MIDAS_QUESTIONS, midasGrade, MIDAS_GRADES } from '../data.js';
import { todayStr, addDays, fmtDateShort } from '../dates.js';
import { getIndex, rangeStats } from '../analysis.js';
import { midasSeries, midasScore } from '../clinical.js';
import { barChart } from '../charts.js';

const GRADE_COLORS = {
  green: 'var(--green)', teal: 'var(--teal)', orange: 'var(--orange)', red: 'var(--red)',
};

const daysLabel = (n) => t('{n, plural, one {# giorno} other {# giorni}}', { n });

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
    replaceChildren(scoreEl, h('small', {}, t('Punteggio')), h('b', { style: { color: GRADE_COLORS[g.tone] } }, String(score)), h('span', {}, t('Grado {grado} · {etichetta}', { grado: g.grade, etichetta: g.label })));
  };
  paint();
  const saveBtn = h('button', { type: 'button', class: 'bar-btn solid' }, t('Salva'));
  const page = openPage({
    title: t('Questionario MIDAS'),
    backLabel: t('Annulla'),
    right: saveBtn,
    onBack: async (p) => {
      if (JSON.stringify(draft) === initial) {
        p.close();
        return;
      }
      if (await confirmDialog({ title: t('Scartare le risposte?'), confirmLabel: t('Scarta'), cancelLabel: t('Continua§edit'), danger: true })) p.close();
    },
  });
  const qs = MIDAS_QUESTIONS.map((q, i) => field({
    label: `${i + 1}. ${q}`,
    control: stepper({
      value: draft.q[i], min: 0, max: 90, label: t('risposta alla domanda {n}', { n: i + 1 }), format: daysLabel, onChange: (v) => { draft.q[i] = v == null ? 0 : v; paint(); },
    }),
  }));
  replaceChildren(
    page.body,
    h('p', { class: 'page-intro' }, t('Misura quanto il mal di testa limita la tua vita. Rispondi pensando agli ultimi 3 mesi: il neurologo lo usa per scegliere e controllare le terapie. Compilalo ad esempio prima di ogni visita.')),
    scoreEl,
    card(field({ label: t('Data'), control: dateInput({ value: draft.date, max: today, label: t('Data del questionario'), onChange: (v) => { if (v) draft.date = v; } }) })),
    card(cardTitle(t('Negli ultimi 3 mesi')), ...qs),
    card(
      cardTitle(t('Informazioni aggiuntive')),
      field({
        label: t('A. In quanti giorni hai avuto mal di testa?'),
        control: stepper({
          value: draft.a, min: 0, max: 92, start: 10, format: daysLabel, label: t('giorni con mal di testa'), onChange: (v) => { draft.a = v; },
        }),
        hint: fromDiary && !existing ? t('Precompilato dal diario degli ultimi 90 giorni.') : null,
      }),
      field({
        label: t('B. Quanto era forte il dolore, in media (0–10)?'),
        control: stepper({
          value: draft.b, min: 0, max: 10, start: 6, label: t('intensità media'), onChange: (v) => { draft.b = v; },
        }),
      }),
    ),
    existing ? button({
      label: t('Elimina questionario'),
      kind: 'danger',
      icon: 'trash',
      block: true,
      onClick: async () => {
        if (!(await confirmDialog({ title: t('Eliminare il questionario?'), confirmLabel: t('Elimina'), danger: true }))) return;
        const removed = store.removeRecord('assessments', existing.id);
        page.close();
        toast(t('Questionario eliminato'), { action: { label: t('Annulla§undo'), onClick: () => store.upsertRecord('assessments', removed) } });
      },
    }) : null,
    footnote(t('Domande ispirate al questionario MIDAS (Migraine Disability Assessment). Il punteggio è la somma delle prime 5 risposte: I 0–5, II 6–10, III 11–20, IV 21 o più.')),
  );
  saveBtn.addEventListener('click', () => {
    store.upsertRecord('assessments', { ...draft, id: existing ? existing.id : undefined });
    page.close();
    const score = midasScore(draft);
    toast(t('Questionario salvato: punteggio {punteggio} (grado {grado})', { punteggio: score, grado: midasGrade(score).grade }));
  });
  return page;
}

export function openMidas() {
  const page = openPage({ title: t('Disabilità (MIDAS)') });
  const render = () => {
    const series = midasSeries(store.getDb());
    const nodes = [h('p', { class: 'page-intro' }, t('Il questionario MIDAS misura i giorni persi o limitati dal mal di testa negli ultimi 3 mesi. Ripeterlo nel tempo mostra se le terapie stanno migliorando la tua vita quotidiana.'))];
    if (series.length) {
      const last = series[series.length - 1];
      nodes.push(card(
        cardTitle(t('Ultimo risultato'), pill(t('Grado {grado}', { grado: last.grade.grade }), last.grade.tone === 'teal' ? 'teal' : last.grade.tone)),
        h('div', { class: 'flex' }, h('span', { class: 'stat-value', style: { color: GRADE_COLORS[last.grade.tone] } }, String(last.score)), h('div', {}, h('div', { style: { fontWeight: '600' } }, last.grade.label), h('div', { class: 'muted small' }, fmtDateShort(last.date)))),
        series.length >= 2 ? h('div', { style: { marginTop: '14px' } }, barChart({
          data: series.slice(-10).map((s) => ({ label: fmtDateShort(s.date).slice(0, 5), value: s.score, color: GRADE_COLORS[s.grade.tone], title: `${fmtDateShort(s.date)}: ${s.score}` })),
          height: 140,
          showValues: true,
          ariaLabel: t('Punteggi MIDAS nel tempo'),
        })) : null,
      ));
      nodes.push(group(...[...series].reverse().map((s) => row({
        icon: 'clipboard',
        tone: s.grade.tone === 'teal' ? 'teal' : s.grade.tone,
        title: t('Punteggio {punteggio} · grado {grado}', { punteggio: s.score, grado: s.grade.grade }),
        subtitle: [fmtDateShort(s.date), s.a != null ? t('{n, plural, one {# giorno con mal di testa} other {# giorni con mal di testa}}', { n: s.a }) : '', s.b != null ? t('dolore medio {valore}/10', { valore: s.b }) : ''].filter(Boolean).join(' · '),
        chevron: true,
        onClick: () => openMidasForm(s),
      }))));
    } else {
      nodes.push(emptyState({ icon: 'clipboard', title: t('Nessun questionario'), text: t('Bastano due minuti. Ti consigliamo di compilarlo ora e poi ogni 3 mesi.') }));
    }
    nodes.push(button({ label: t('Compila il questionario'), kind: 'primary', icon: 'edit', block: true, onClick: () => openMidasForm() }));
    nodes.push(h('div', { class: 'mt' }, card(
      cardTitle(t('Come si legge')),
      ...MIDAS_GRADES.map((g) => {
        const range = g.max > 100 ? `${g.min}+` : `${g.min}–${g.max}`;
        return h('div', { class: 'kv' }, h('span', {}, t('Grado {grado} · {punteggi}', { grado: g.grade, punteggi: range })), h('b', {}, g.label));
      }),
    )));
    replaceChildren(page.body, ...nodes);
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}
