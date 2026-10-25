import { h, replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import {
  openPage, openDialog, confirmDialog, toast, row, group, footnote, field, button, dateInput, switchControl, emptyState, card, cardTitle,
  chipGroup, stepper, textArea, textInput, alertBox, hbars, pill, section, segmented,
} from '../ui.js';
import {
  THERAPY_CLASSES, THERAPY_PRESETS, STOP_REASONS, SIDE_EFFECTS, THERAPY_RATINGS, therapyClass, stopReasonLabel,
} from '../data.js';
import {
  fmtDateShort, todayStr, addDays, fmtDateMedium, capitalize,
} from '../dates.js';
import { getIndex } from '../analysis.js';
import {
  therapyOutcome, outcomeLine, therapyPeriodText, nextDose, doseAnchors, isInjectable, longTermSeries, RESPONSES,
} from '../clinical.js';
import { longTermChart, therapyChart, cycleChart } from '../charts.js';
import { num, pct, plural } from '../format.js';
import { exportEventIcs } from '../exporter.js';

export function periodLabel(p) {
  return p.end ? `dal ${fmtDateShort(p.start)} al ${fmtDateShort(p.end)}` : `dal ${fmtDateShort(p.start)} · in corso`;
}

const isActive = (p, today) => p.start <= today && (!p.end || p.end >= today);

function classIcon(p, size = 17) {
  return h('span', { class: 'row-icon', style: { background: therapyClass(p.cls).color } }, icon(isInjectable(p) ? 'syringe' : 'pill', size));
}

export function therapyRow(p, { onClick, today = todayStr(), outcome = null } = {}) {
  const parts = [therapyPeriodText(p, today)];
  const line = outcome ? outcomeLine(outcome) : '';
  if (line) parts.push(line);
  else if (p.end && p.stop) parts.push(`Interrotta: ${stopReasonLabel(p.stop).toLowerCase()}`);
  const nd = isActive(p, today) ? nextDose(p, today) : null;
  let tag = null;
  if (nd && nd.status === 'overdue') tag = pill(`Somministrazione da fare (prevista il ${fmtDateShort(nd.next)})`, 'red');
  else if (nd && nd.status === 'due') tag = pill(nd.daysLeft === 0 ? 'Somministrazione prevista oggi' : `Prossima somministrazione tra ${plural(nd.daysLeft, 'giorno', 'giorni')}`, 'orange');
  else if (outcome && outcome.response) tag = pill(RESPONSES[outcome.response].label, RESPONSES[outcome.response].tone);
  return h(
    'button',
    { type: 'button', class: 'row', onclick: onClick },
    classIcon(p),
    h(
      'span',
      { class: 'row-main' },
      h('span', { class: 'row-title' }, `${p.name}${p.dose ? ` · ${p.dose}` : ''}`),
      h('span', { class: 'row-sub' }, parts.join('\n')),
      tag ? h('span', { style: { marginTop: '5px' } }, tag) : null,
    ),
    icon('chevron-right', 18, 'chev'),
  );
}

export function seriesForChart(series) {
  return {
    ...series,
    therapies: series.therapies.map((p) => ({
      name: p.name, start: p.start, end: p.end, color: therapyClass(p.cls).color,
    })),
  };
}

const SPANS = [{ value: 24, label: '2 anni' }, { value: 60, label: '5 anni' }, { value: 0, label: 'Tutto' }];
let chosenSpan = null;

export function longTermCard(idx, db, today, { title = 'Andamento nel tempo', action = null } = {}) {
  const full = longTermSeries(idx, db, today);
  if (full.points.filter((p) => p.value != null).length < 2) return null;
  const box = h('div');
  const legend = h('div');
  const paint = () => {
    const span = chosenSpan == null ? (full.totalMonths > 60 ? 60 : 0) : chosenSpan;
    const series = span ? longTermSeries(idx, db, today, { spanMonths: span }) : full;
    const chartSeries = seriesForChart(series);
    replaceChildren(box, longTermChart(chartSeries));
    replaceChildren(
      legend,
      h('div', { class: 'legend' },
        series.hasDiary ? h('span', { class: 'legend-item' }, h('span', { class: 'swatch', style: { background: 'var(--accent)' } }), 'Dal diario') : null,
        series.hasHistory ? h('span', { class: 'legend-item' }, h('span', { class: 'swatch est' }), 'Stima dalla tua storia') : null,
        h('span', { class: 'legend-item' }, h('span', { class: 'swatch', style: { background: 'var(--orange)', height: '3px' } }), 'Intensità media (scala a destra)')),
      chartSeries.therapies.length ? h('div', { class: 'legend' }, chartSeries.therapies.map((t) => h('span', { class: 'legend-item' }, h('span', { class: 'swatch', style: { background: t.color } }), `${t.name} · ${t.end ? `${fmtDateShort(t.start).slice(3)}–${fmtDateShort(t.end).slice(3)}` : `dal ${fmtDateShort(t.start).slice(3)}`}`))) : null,
      h('p', { class: 'field-hint', style: { marginTop: '8px' } }, `Giorni con mal di testa al mese${series.unit !== 'month' ? (series.unit === 'year' ? ', media per anno' : ', media per trimestre') : ''}. Sotto il grafico, i periodi delle terapie di prevenzione.`),
    );
  };
  const spanCtl = full.totalMonths > 24 ? segmented({
    options: SPANS.filter((s) => !s.value || s.value < full.totalMonths),
    value: chosenSpan == null ? (full.totalMonths > 60 ? 60 : 0) : chosenSpan,
    ariaLabel: 'Periodo del grafico',
    onChange: (v) => {
      chosenSpan = v;
      paint();
    },
    cls: 'mb',
  }) : null;
  paint();
  return card(cardTitle(title, action), spanCtl, box, legend);
}

/* ---------- editor ---------- */

export function openTherapyEditor(existing = null, { onDone = null, past = false } = {}) {
  const today = todayStr();
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : {
    name: '', cls: 'other', dose: '', start: past ? addDays(today, -365) : today, end: past ? addDays(today, -60) : null, every: 0, doses: [], stop: '', sides: [], rating: null, doctor: '', baseDays: null, baseInt: null, note: '',
  };
  const initial = JSON.stringify(draft);
  const saveBtn = h('button', { type: 'button', class: 'bar-btn solid' }, 'Salva');
  const page = openPage({
    title: existing ? 'Modifica terapia' : (past ? 'Terapia del passato' : 'Nuova terapia'),
    backLabel: 'Annulla',
    right: saveBtn,
    onBack: async (p) => {
      if (JSON.stringify(draft) === initial) {
        p.close();
        return;
      }
      if (await confirmDialog({ title: 'Scartare le modifiche?', confirmLabel: 'Scarta', cancelLabel: 'Continua', danger: true })) p.close();
    },
  });

  const nameInput = textInput({
    value: draft.name,
    placeholder: 'Nome del farmaco o della terapia',
    maxLength: 80,
    label: 'Nome della terapia',
    onInput: (v) => {
      draft.name = v;
      if (draft.cls !== 'other') return;
      const guess = store.guessTherapyClass(v);
      if (guess === 'other') return;
      draft.cls = guess;
      clsSelect.value = guess;
      if (therapyClass(guess).inject && !draft.every) draft.every = therapyClass(guess).every;
      renderInject();
    },
  });
  const clsSelect = h('select', { class: 'input select', 'aria-label': 'Tipo di terapia' }, THERAPY_CLASSES.map((c) => h('option', { value: c.id }, c.label)));
  clsSelect.value = draft.cls;
  const doseInput = textInput({
    value: draft.dose, placeholder: 'es. 140 mg ogni 4 settimane', maxLength: 60, label: 'Dose', onInput: (v) => { draft.dose = v; },
  });
  const doctorInput = textInput({
    value: draft.doctor, placeholder: 'es. Dr.ssa Bianchi, Centro cefalee', maxLength: 80, label: 'Prescritta da', onInput: (v) => { draft.doctor = v; },
  });

  const injectBox = h('div');
  const renderInject = () => {
    const inj = draft.every >= 14 || therapyClass(draft.cls).inject;
    if (!inj) {
      replaceChildren(injectBox);
      return;
    }
    const doseList = [...draft.doses].sort().reverse();
    const addInput = dateInput({ value: today, max: today, label: 'Data della somministrazione' });
    replaceChildren(
      injectBox,
      card(
        cardTitle('Somministrazioni'),
        field({
          label: 'Ogni quanti giorni',
          control: chipGroup({
            options: [{ value: 28, label: '4 settimane' }, { value: 30, label: '1 mese' }, { value: 56, label: '8 settimane' }, { value: 84, label: '12 settimane' }, { value: 90, label: '3 mesi' }],
            value: draft.every || null,
            onChange: (v) => {
              draft.every = v || 0;
              renderInject();
            },
          }),
          hint: 'Serve a calcolare la prossima somministrazione e l’andamento dentro ogni ciclo.',
        }),
        field({
          label: draft.cls === 'botox' ? 'Date delle sedute' : 'Date delle iniezioni o infusioni',
          control: h(
            'div',
            {},
            doseList.length ? h('div', { class: 'chips', style: { marginBottom: '10px' } }, doseList.map((d) => h('button', {
              type: 'button',
              class: 'chip',
              'aria-label': `Rimuovi la somministrazione del ${fmtDateShort(d)}`,
              onclick: () => {
                draft.doses = draft.doses.filter((x) => x !== d);
                renderInject();
              },
            }, `${fmtDateShort(d)}  ×`))) : h('p', { class: 'muted small', style: { marginBottom: '10px' } }, 'Nessuna data registrata: verrà usato il calendario teorico a partire dall’inizio.'),
            h('div', { class: 'two-col' }, addInput, button({
              label: 'Aggiungi',
              kind: 'secondary',
              icon: 'plus',
              onClick: () => {
                const v = addInput.value;
                if (!v) return;
                if (v > today) {
                  toast('La data non può essere nel futuro.', { tone: 'error' });
                  return;
                }
                if (!draft.doses.includes(v)) draft.doses.push(v);
                if (v < draft.start) {
                  draft.start = v;
                  startInput.value = v;
                  toast('Inizio della terapia spostato a questa data');
                }
                renderInject();
              },
            })),
          ),
        }),
        draft.every > 0 ? button({
          label: 'Compila le date dal calendario previsto',
          kind: 'ghost',
          icon: 'calendar-check',
          block: true,
          onClick: () => {
            const last = draft.end && draft.end < today ? draft.end : today;
            const list = [];
            for (let d = draft.start; d <= last && list.length < 300; d = addDays(d, draft.every)) list.push(d);
            draft.doses = [...new Set([...draft.doses, ...list])].sort();
            renderInject();
            toast(`${plural(list.length, 'data aggiunta', 'date aggiunte')}: correggi quelle diverse`);
          },
        }) : null,
      ),
    );
  };
  clsSelect.addEventListener('change', () => {
    draft.cls = clsSelect.value;
    if (therapyClass(draft.cls).inject && !draft.every) draft.every = therapyClass(draft.cls).every;
    renderInject();
  });

  const presetChips = h('div', { class: 'chips', style: { margin: '-6px 0 18px' } }, THERAPY_PRESETS.slice(0, 14).map((p) => h('button', {
    type: 'button',
    class: 'chip',
    title: p.hint,
    onclick: () => {
      draft.name = p.name;
      nameInput.value = p.name;
      draft.cls = p.cls;
      clsSelect.value = p.cls;
      draft.every = p.every || 0;
      renderInject();
    },
  }, p.name)));

  const startInput = dateInput({ value: draft.start, max: today, label: 'Data di inizio', onChange: (v) => { if (v) draft.start = v; } });
  const endInput = dateInput({ value: draft.end || today, max: today, label: 'Data di fine', onChange: (v) => { if (v) draft.end = v; } });
  const stopChips = chipGroup({ options: STOP_REASONS.map((r) => ({ value: r.id, label: r.label })), value: draft.stop, onChange: (v) => { draft.stop = v || ''; } });
  const endBox = h('div', {}, field({ label: 'Fine', control: endInput }), field({ label: 'Perché è stata interrotta?', control: stopChips }));
  endBox.hidden = draft.end == null;
  const ongoing = h('label', { class: 'row check-row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'Terapia ancora in corso')));
  ongoing.appendChild(switchControl({
    checked: draft.end == null,
    label: 'Terapia ancora in corso',
    onChange: (on) => {
      draft.end = on ? null : (endInput.value || today);
      if (on) draft.stop = '';
      endBox.hidden = on;
    },
  }));

  const sidesBox = h('div');
  const renderSides = () => {
    const opts = [...SIDE_EFFECTS, ...draft.sides.filter((s) => !SIDE_EFFECTS.includes(s))];
    const chips = chipGroup({ options: opts, value: draft.sides, multi: true, onChange: (v) => { draft.sides = v; } });
    chips.appendChild(h('button', {
      type: 'button',
      class: 'chip add',
      onclick: async () => {
        const input = h('input', { class: 'input', maxlength: 60, placeholder: 'es. Sudorazione', 'aria-label': 'Effetto collaterale' });
        const v = await openDialog({
          title: 'Altro effetto collaterale', content: h('div', { class: 'dlg-content' }, input), dismissValue: null, buttons: [{ label: 'Annulla', value: null }, { label: 'Aggiungi', kind: 'primary', onClick: (done) => done(input.value.trim()) }],
        });
        if (v && !draft.sides.includes(v)) draft.sides.push(v);
        renderSides();
      },
    }, '+ Altro'));
    replaceChildren(sidesBox, chips);
  };
  renderSides();

  const nodes = [
    card(
      field({ label: 'Terapia', control: nameInput }),
      existing ? null : presetChips,
      field({ label: 'Tipo', control: clsSelect }),
      field({ label: 'Dose e modalità', control: doseInput }),
      field({ label: 'Prescritta da', control: doctorInput }),
    ),
    card(
      cardTitle('Periodo'),
      field({ label: 'Inizio', control: startInput, hint: 'Puoi indicare anche una data lontana: le terapie del passato servono a ricostruire la tua storia.' }),
      ongoing,
      endBox,
    ),
    injectBox,
    card(
      cardTitle('Prima di iniziare'),
      h('p', { class: 'muted small', style: { marginBottom: '12px' } }, 'Facoltativo. Serve come punto di partenza se il diario non copre i 3 mesi precedenti l’inizio: lo trovi spesso nel piano terapeutico o nella lettera del neurologo.'),
      field({
        label: 'Giorni di emicrania al mese',
        control: stepper({
          value: draft.baseDays, min: 0, max: 31, step: 1, start: 8, label: 'giorni di emicrania al mese prima della terapia', onChange: (v) => { draft.baseDays = v; },
        }),
      }),
      field({
        label: 'Intensità abituale (1–10)',
        control: stepper({
          value: draft.baseInt, min: 1, max: 10, step: 1, start: 7, label: 'intensità abituale prima della terapia', onChange: (v) => { draft.baseInt = v; },
        }),
      }),
    ),
    card(
      cardTitle('Come è andata'),
      field({
        label: 'Beneficio percepito',
        control: chipGroup({ options: THERAPY_RATINGS.map((r) => ({ value: r.v, label: r.label })), value: draft.rating, onChange: (v) => { draft.rating = v; } }),
      }),
      field({ label: 'Effetti collaterali', control: sidesBox }),
      field({
        label: 'Note',
        control: textArea({
          value: draft.note, placeholder: 'Indicazioni del medico, dosaggi cambiati, sensazioni…', label: 'Note sulla terapia', maxLength: 1000, onInput: (v) => { draft.note = v; },
        }),
      }),
    ),
  ];
  if (existing) {
    nodes.push(button({
      label: 'Elimina terapia',
      kind: 'danger',
      icon: 'trash',
      block: true,
      onClick: async () => {
        const ok = await confirmDialog({
          title: 'Eliminare questa terapia?', message: 'Potrai annullare subito dopo.', confirmLabel: 'Elimina', danger: true,
        });
        if (!ok) return;
        const removed = store.removePreventive(existing.id);
        page.close();
        toast('Terapia eliminata', { action: { label: 'Annulla', onClick: () => store.upsertPreventive(removed) } });
        if (onDone) onDone(null);
      },
    }));
  }
  replaceChildren(page.body, ...nodes);
  renderInject();

  saveBtn.addEventListener('click', () => {
    if (!draft.name.trim()) {
      toast('Scrivi il nome della terapia.', { tone: 'error' });
      return;
    }
    if (!draft.start) {
      toast('Indica quando è iniziata.', { tone: 'error' });
      return;
    }
    if (draft.end && draft.end < draft.start) {
      toast('La fine non può essere prima dell’inizio.', { tone: 'error' });
      return;
    }
    const outside = draft.doses.filter((d) => d < draft.start || (draft.end && d > draft.end));
    if (outside.length) {
      toast(`${plural(outside.length, 'somministrazione è', 'somministrazioni sono')} fuori dal periodo della terapia.`, { tone: 'error' });
      return;
    }
    const saved = store.upsertPreventive({ ...draft, id: existing ? existing.id : undefined });
    page.close();
    toast('Terapia salvata');
    if (onDone) onDone(saved);
  });
  return page;
}

/* ---------- dettaglio ---------- */

function compareBlock(o) {
  const b = o.baseline;
  const d = o.during;
  const delta = o.change && o.change.daysPct != null ? o.change.daysPct : null;
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'compare' },
      h('div', { class: 'compare-box' }, h('small', {}, 'Prima'), h('b', {}, b ? num(b.days) : '—'), h('span', {}, 'giorni al mese')),
      h('span', { class: 'compare-arrow' }, icon('chevron-right', 22)),
      h('div', { class: 'compare-box' }, h('small', {}, 'Con la terapia'), h('b', {}, d ? num(d.days) : '—'), h('span', {}, delta == null ? 'giorni al mese' : h('span', { class: `delta ${delta <= 0 ? 'good' : 'bad'}` }, `${delta > 0 ? '+' : '−'}${pct(Math.abs(delta))}`))),
    ),
    h(
      'div',
      { class: 'kpis' },
      h('div', { class: 'kpi' }, h('small', {}, 'Intensità media'), h('b', {}, `${b && b.intensity != null ? num(b.intensity) : '—'} → ${d && d.intensity != null ? num(d.intensity) : '—'}`)),
      h('div', { class: 'kpi' }, h('small', {}, 'Giorni con farmaci'), h('b', {}, `${b && b.acute != null ? num(b.acute) : '—'} → ${d && d.acute != null ? num(d.acute) : '—'}`)),
      h('div', { class: 'kpi' }, h('small', {}, 'Attacchi al mese'), h('b', {}, `${b && b.attacks != null ? num(b.attacks) : '—'} → ${d && d.attacks != null ? num(d.attacks) : '—'}`)),
    ),
  );
}

export function openTherapyDetail(id) {
  const page = openPage({ title: 'Terapia' });
  const render = () => {
    const db = store.getDb();
    const p = db.preventives.find((x) => x.id === id);
    if (!p) {
      page.close();
      return;
    }
    const today = todayStr();
    const idx = getIndex(db, store.getRev(), today);
    const o = therapyOutcome(idx, db, p, today);
    const cls = therapyClass(p.cls);
    page.setTitle(p.name);
    page.setRight(h('button', { type: 'button', class: 'bar-btn', onclick: () => openTherapyEditor(p, { onDone: () => render() }) }, 'Modifica'));
    const nodes = [];
    const status = isActive(p, today) ? pill('In corso', 'green') : (p.start > today ? pill('Programmata', 'gray') : pill(p.stop ? `Interrotta · ${stopReasonLabel(p.stop).toLowerCase()}` : 'Conclusa', 'gray'));
    nodes.push(card(
      h('div', { class: 'flex', style: { alignItems: 'flex-start', marginBottom: '10px' } },
        classIcon(p, 19),
        h('div', { style: { minWidth: '0', flex: '1' } },
          h('div', { style: { fontSize: '1.25rem', fontWeight: '700' } }, p.name),
          h('div', { class: 'muted small' }, [cls.label, p.dose].filter(Boolean).join(' · ')))),
      h('div', { class: 'tag-row', style: { marginBottom: '8px' } }, status),
      h('p', { class: 'muted small' }, capitalize(therapyPeriodText(p, today))),
      p.doctor ? h('p', { class: 'muted small' }, `Prescritta da ${p.doctor}`) : null,
    ));

    if (isInjectable(p)) {
      const nd = isActive(p, today) ? nextDose(p, today) : null;
      const anchors = doseAnchors(p, today);
      const recent = [...anchors].reverse().slice(0, 6);
      const markToday = () => {
        store.addTherapyDose(p.id, today);
        toast('Somministrazione di oggi registrata');
      };
      nodes.push(card(
        cardTitle(p.cls === 'botox' ? 'Sedute' : 'Somministrazioni'),
        nd ? alertBox({
          tone: nd.status === 'overdue' ? 'warn' : nd.status === 'due' ? 'warn' : 'info',
          icon: 'calendar',
          title: nd.status === 'overdue' ? `Prevista il ${fmtDateShort(nd.next)}` : `Prossima: ${capitalize(fmtDateMedium(nd.next))}`,
          text: nd.status === 'overdue' ? `In ritardo di ${plural(-nd.daysLeft, 'giorno', 'giorni')}: se l’hai già fatta, registrala.` : (nd.daysLeft === 0 ? 'È oggi.' : `Tra ${plural(nd.daysLeft, 'giorno', 'giorni')}${nd.fromSchedule ? ' (calcolata dal calendario previsto)' : ''}.`),
        }) : null,
        recent.length ? h('div', { class: 'kv' }, h('span', {}, p.doses.length ? 'Ultime registrate' : 'Calendario previsto'), h('b', {}, recent.map((d) => fmtDateShort(d)).slice(0, 3).join(', '))) : null,
        h('div', { class: 'kv' }, h('span', {}, 'Totale'), h('b', {}, plural(anchors.length, p.cls === 'botox' ? 'seduta' : 'somministrazione', p.cls === 'botox' ? 'sedute' : 'somministrazioni'))),
        isActive(p, today) ? h('div', { class: 'btn-row mt' },
          button({ label: 'Fatta oggi', kind: 'primary', icon: 'check', onClick: markToday, disabled: p.doses.includes(today) }),
          nd ? button({
            label: 'Calendario',
            kind: 'secondary',
            icon: 'calendar-plus',
            onClick: () => exportEventIcs({
              uid: `dose-${p.id}-${nd.next}`, title: `${p.name}: ${p.cls === 'botox' ? 'seduta' : 'somministrazione'}`, date: nd.next < today ? today : nd.next, allDay: true, description: 'Promemoria dal Diario Emicrania',
            }),
          }) : null) : null,
      ));
    }

    const eff = [];
    if (o.baseline || o.during) {
      eff.push(compareBlock(o));
      if (o.response) {
        const r = RESPONSES[o.response];
        eff.push(h('div', { class: `response ${r.tone}` }, icon(o.response === 'worse' ? 'trend-up' : 'trend-down', 20), h('div', {}, r.label, h('small', {}, `${capitalize(r.desc)} dei giorni di emicrania rispetto a prima.`))));
      }
      const notes = [];
      if (o.baseline) notes.push(`Prima: ${o.baseline.label}.`);
      if (o.during) notes.push(`Con la terapia: ${o.during.label}.`);
      if (o.early) notes.push('Valutazione preliminare: l’effetto delle terapie di prevenzione si giudica di solito dopo almeno 3 mesi.');
      eff.push(h('p', { class: 'field-hint', style: { marginTop: '10px' } }, notes.join(' ')));
    }
    if (!o.baseline) {
      eff.push(alertBox({
        tone: 'info',
        icon: 'info',
        title: 'Manca il punto di partenza',
        text: 'Per misurare l’efficacia indica quanti giorni di emicrania avevi prima di iniziare (in Modifica › Prima di iniziare), oppure racconta quel periodo nella tua storia.',
      }));
    }
    if (!o.during && p.start <= today) {
      eff.push(h('p', { class: 'muted small' }, 'Il diario non copre ancora abbastanza giorni di questa terapia (ne servono almeno 28).'));
    }
    nodes.push(card(cardTitle('Efficacia'), ...eff));

    if (o.monthly.filter((m) => m.value != null).length >= 2) {
      nodes.push(card(
        cardTitle('Mese per mese'),
        therapyChart({ monthly: o.monthly, baseline: o.baseline ? o.baseline.days : null, startMonth: p.start.slice(0, 7), color: cls.color }),
        h('p', { class: 'field-hint', style: { marginTop: '8px' } }, 'Barre grigie: prima della terapia. Barre chiare: mese non completo (stima su 30 giorni).'),
      ));
    }

    if (o.vs.rated) {
      nodes.push(card(
        cardTitle('Come hai giudicato gli attacchi'),
        hbars([
          { label: 'Più leggeri di prima', value: o.vs.better, color: 'var(--green)' },
          { label: 'Come prima', value: o.vs.same, color: 'var(--gray)' },
          { label: 'Più forti di prima', value: o.vs.worse, color: 'var(--red)' },
        ].map((x) => ({ ...x, text: `${x.value} · ${pct(x.value / o.vs.rated)}` })), { max: o.vs.rated }),
        h('p', { class: 'field-hint', style: { marginTop: '10px' } }, `${plural(o.vs.rated, 'attacco valutato', 'attacchi valutati')} su ${o.vs.total} durante la terapia${o.vs.missed ? `; in ${o.vs.missed} avevi saltato o ritardato una dose` : ''}.`),
      ));
    }

    if (o.cycle && o.cycle.enough) {
      nodes.push(card(
        cardTitle('Dentro ogni ciclo'),
        cycleChart(o.cycle.weeks),
        h('p', { class: 'field-hint', style: { marginTop: '8px' } }, o.cycle.wearingOff
          ? `Gli attacchi aumentano nell’ultima settimana prima della nuova ${p.cls === 'botox' ? 'seduta' : 'somministrazione'}: è il cosiddetto effetto di fine dose. Parlane con il neurologo.`
          : `Giorni di emicrania ogni 7 giorni, per settimana dall’ultima ${p.cls === 'botox' ? 'seduta' : 'somministrazione'} (${plural(o.cycle.complete, 'ciclo completo', 'cicli completi')}).`),
      ));
    }

    const extra = [];
    if (p.rating != null) extra.push(h('div', { class: 'kv' }, h('span', {}, 'Beneficio percepito'), h('b', {}, THERAPY_RATINGS.find((r) => r.v === p.rating).label)));
    if (p.sides.length) extra.push(h('div', { class: 'kv' }, h('span', {}, 'Effetti collaterali'), h('b', {}, p.sides.join(', '))));
    if (p.note) extra.push(h('p', { class: 'muted pre', style: { marginTop: '8px' } }, p.note));
    if (extra.length) nodes.push(card(cardTitle('Note ed effetti'), ...extra));
    nodes.push(footnote('Il confronto usa i 3 mesi prima dell’inizio e gli ultimi 3 mesi di terapia (o il periodo disponibile). Una riduzione di almeno il 50% dei giorni di emicrania è considerata una buona risposta; valuta sempre i risultati con il neurologo.'));
    replaceChildren(page.body, ...nodes);
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}

/* ---------- elenco ---------- */

export function openTherapies() {
  const page = openPage({ title: 'Terapie di prevenzione' });
  const render = () => {
    const top = page.body.scrollTop;
    const db = store.getDb();
    const today = todayStr();
    const idx = getIndex(db, store.getRev(), today);
    const sorted = [...db.preventives].sort((a, b) => (a.start < b.start ? 1 : -1));
    const active = sorted.filter((p) => isActive(p, today) || p.start > today);
    const past = sorted.filter((p) => !active.includes(p));
    const rowsOf = (list) => list.map((p) => therapyRow(p, { today, outcome: therapyOutcome(idx, db, p, today), onClick: () => openTherapyDetail(p.id) }));
    const nodes = [h('p', { class: 'page-intro' }, 'Le terapie prescritte dal neurologo per ridurre gli attacchi: anticorpi monoclonali, tossina botulinica, antidepressivi, beta-bloccanti e altre. Puoi inserire anche quelle del passato.')];
    const chart = longTermCard(idx, db, today);
    if (chart) nodes.push(chart);
    if (active.length) nodes.push(section('In corso', group(...rowsOf(active))));
    if (past.length) nodes.push(section('Concluse', group(...rowsOf(past))));
    if (!sorted.length) nodes.push(emptyState({ icon: 'shield', title: 'Nessuna terapia', text: 'Aggiungi la terapia che segui ora e quelle provate in passato: vedrai come cambiano frequenza e intensità degli attacchi.' }));
    nodes.push(group(
      row({ icon: 'plus', tone: 'green', title: 'Aggiungi la terapia attuale', onClick: () => openTherapyEditor(null, { onDone: render }) }),
      row({ icon: 'history', tone: 'gray', title: 'Aggiungi una terapia del passato', onClick: () => openTherapyEditor(null, { onDone: render, past: true }) }),
    ));
    if (sorted.length) nodes.push(footnote('L’efficacia confronta i giorni di emicrania prima e durante la terapia, usando il diario o le stime della tua storia. È un aiuto per il dialogo con il medico, non una valutazione clinica.'));
    replaceChildren(page.body, ...nodes);
    page.body.scrollTop = top;
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}

export const openPreventives = openTherapies;
