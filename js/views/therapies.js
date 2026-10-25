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
import { num, pct, lcFirst } from '../format.js';
import { t, tv } from '../i18n.js';
import { exportEventIcs } from '../exporter.js';

export function periodLabel(p) {
  const inizio = fmtDateShort(p.start);
  return p.end ? t('dal {inizio} al {fine}', { inizio, fine: fmtDateShort(p.end) }) : t('dal {inizio} · in corso', { inizio });
}

const isActive = (p, today) => p.start <= today && (!p.end || p.end >= today);

// Una frase per motivo: il minuscolo dell'etichetta non e' corretto in tutte le lingue (es. i sostantivi tedeschi).
const STOP_PHRASES = new Map([
  ['inefficace', t('non funzionava')],
  ['effetti', t('effetti collaterali')],
  ['completata', t('ciclo concluso o pausa')],
  ['migliorato', t('sto meglio')],
  ['altro', t('altro motivo')],
]);
const stopPhrase = (id) => STOP_PHRASES.get(id) || lcFirst(stopReasonLabel(id));

const RESPONSE_TEXT = {
  good: t('Riduzione di almeno il 50% dei giorni di emicrania rispetto a prima.'),
  partial: t('Riduzione tra il 30 e il 49% dei giorni di emicrania rispetto a prima.'),
  low: t('Variazione sotto il 30% dei giorni di emicrania rispetto a prima.'),
  worse: t('Più giorni di prima dei giorni di emicrania rispetto a prima.'),
};

function classIcon(p, size = 17) {
  return h('span', { class: 'row-icon', style: { background: therapyClass(p.cls).color } }, icon(isInjectable(p) ? 'syringe' : 'pill', size));
}

export function therapyRow(p, { onClick, today = todayStr(), outcome = null } = {}) {
  const parts = [therapyPeriodText(p, today)];
  const line = outcome ? outcomeLine(outcome) : '';
  if (line) parts.push(line);
  else if (p.end && p.stop) parts.push(t('Interrotta: {motivo}', { motivo: stopPhrase(p.stop) }));
  const nd = isActive(p, today) ? nextDose(p, today) : null;
  let tag = null;
  if (nd && nd.status === 'overdue') tag = pill(t('Somministrazione da fare (prevista il {data})', { data: fmtDateShort(nd.next) }), 'red');
  else if (nd && nd.status === 'due') tag = pill(nd.daysLeft === 0 ? t('Somministrazione prevista oggi') : t('{n, plural, one {Prossima somministrazione tra # giorno} other {Prossima somministrazione tra # giorni}}', { n: nd.daysLeft }), 'orange');
  else if (outcome && outcome.response) tag = pill(RESPONSES[outcome.response].label, RESPONSES[outcome.response].tone);
  return h(
    'button',
    { type: 'button', class: 'row', onclick: onClick },
    classIcon(p),
    h(
      'span',
      { class: 'row-main' },
      h('span', { class: 'row-title' }, `${tv(p.name)}${p.dose ? ` · ${p.dose}` : ''}`),
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
      name: tv(p.name), start: p.start, end: p.end, color: therapyClass(p.cls).color,
    })),
  };
}

const SPANS = [{ value: 24, label: t('2 anni') }, { value: 60, label: t('5 anni') }, { value: 0, label: t('Tutto') }];
let chosenSpan = null;

const therapySpan = (th) => (th.end
  ? `${fmtDateShort(th.start).slice(3)}–${fmtDateShort(th.end).slice(3)}`
  : t('dal {inizio}', { inizio: fmtDateShort(th.start).slice(3) }));

export function longTermCard(idx, db, today, { title = t('Andamento nel tempo'), action = null } = {}) {
  const full = longTermSeries(idx, db, today);
  if (full.points.filter((p) => p.value != null).length < 2) return null;
  const box = h('div');
  const legend = h('div');
  const paint = () => {
    const span = chosenSpan == null ? (full.totalMonths > 60 ? 60 : 0) : chosenSpan;
    const series = span ? longTermSeries(idx, db, today, { spanMonths: span }) : full;
    const chartSeries = seriesForChart(series);
    const caption = series.unit === 'month'
      ? t('Giorni con mal di testa al mese. Sotto il grafico, i periodi delle terapie di prevenzione.')
      : series.unit === 'year'
        ? t('Giorni con mal di testa al mese, media per anno. Sotto il grafico, i periodi delle terapie di prevenzione.')
        : t('Giorni con mal di testa al mese, media per trimestre. Sotto il grafico, i periodi delle terapie di prevenzione.');
    replaceChildren(box, longTermChart(chartSeries));
    replaceChildren(
      legend,
      h('div', { class: 'legend' },
        series.hasDiary ? h('span', { class: 'legend-item' }, h('span', { class: 'swatch', style: { background: 'var(--accent)' } }), t('Dal diario')) : null,
        series.hasHistory ? h('span', { class: 'legend-item' }, h('span', { class: 'swatch est' }), t('Stima dalla tua storia')) : null,
        h('span', { class: 'legend-item' }, h('span', { class: 'swatch', style: { background: 'var(--orange)', height: '3px' } }), t('Intensità media (scala a destra)'))),
      chartSeries.therapies.length ? h('div', { class: 'legend' }, chartSeries.therapies.map((th) => h('span', { class: 'legend-item' }, h('span', { class: 'swatch', style: { background: th.color } }), `${th.name} · ${therapySpan(th)}`))) : null,
      h('p', { class: 'field-hint', style: { marginTop: '8px' } }, caption),
    );
  };
  const spanCtl = full.totalMonths > 24 ? segmented({
    options: SPANS.filter((s) => !s.value || s.value < full.totalMonths),
    value: chosenSpan == null ? (full.totalMonths > 60 ? 60 : 0) : chosenSpan,
    ariaLabel: t('Periodo del grafico'),
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
  const saveBtn = h('button', { type: 'button', class: 'bar-btn solid' }, t('Salva'));
  const page = openPage({
    title: existing ? t('Modifica terapia') : (past ? t('Terapia del passato') : t('Nuova terapia')),
    backLabel: t('Annulla'),
    right: saveBtn,
    onBack: async (p) => {
      if (JSON.stringify(draft) === initial) {
        p.close();
        return;
      }
      if (await confirmDialog({ title: t('Scartare le modifiche?'), confirmLabel: t('Scarta'), cancelLabel: t('Continua§edit'), danger: true })) p.close();
    },
  });

  const nameInput = textInput({
    value: draft.name ? tv(draft.name) : '',
    placeholder: t('Nome del farmaco o della terapia'),
    maxLength: 80,
    label: t('Nome della terapia'),
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
  const clsSelect = h('select', { class: 'input select', 'aria-label': t('Tipo di terapia') }, THERAPY_CLASSES.map((c) => h('option', { value: c.id }, c.label)));
  clsSelect.value = draft.cls;
  const doseInput = textInput({
    value: draft.dose, placeholder: t('es. 140 mg ogni 4 settimane'), maxLength: 60, label: t('Dose'), onInput: (v) => { draft.dose = v; },
  });
  const doctorInput = textInput({
    value: draft.doctor, placeholder: t('es. Dr.ssa Bianchi, Centro cefalee'), maxLength: 80, label: t('Prescritta da'), onInput: (v) => { draft.doctor = v; },
  });

  const injectBox = h('div');
  const renderInject = () => {
    const inj = draft.every >= 14 || therapyClass(draft.cls).inject;
    if (!inj) {
      replaceChildren(injectBox);
      return;
    }
    const doseList = [...draft.doses].sort().reverse();
    const addInput = dateInput({ value: today, max: today, label: t('Data della somministrazione') });
    replaceChildren(
      injectBox,
      card(
        cardTitle(t('Somministrazioni')),
        field({
          label: t('Ogni quanti giorni'),
          control: chipGroup({
            options: [{ value: 28, label: t('4 settimane') }, { value: 30, label: t('1 mese') }, { value: 56, label: t('8 settimane') }, { value: 84, label: t('12 settimane') }, { value: 90, label: t('3 mesi') }],
            value: draft.every || null,
            onChange: (v) => {
              draft.every = v || 0;
              renderInject();
            },
          }),
          hint: t('Serve a calcolare la prossima somministrazione e l’andamento dentro ogni ciclo.'),
        }),
        field({
          label: draft.cls === 'botox' ? t('Date delle sedute') : t('Date delle iniezioni o infusioni'),
          control: h(
            'div',
            {},
            doseList.length ? h('div', { class: 'chips', style: { marginBottom: '10px' } }, doseList.map((d) => h('button', {
              type: 'button',
              class: 'chip',
              'aria-label': t('Rimuovi la somministrazione del {data}', { data: fmtDateShort(d) }),
              onclick: () => {
                draft.doses = draft.doses.filter((x) => x !== d);
                renderInject();
              },
            }, `${fmtDateShort(d)}  ×`))) : h('p', { class: 'muted small', style: { marginBottom: '10px' } }, t('Nessuna data registrata: verrà usato il calendario teorico a partire dall’inizio.')),
            h('div', { class: 'two-col' }, addInput, button({
              label: t('Aggiungi'),
              kind: 'secondary',
              icon: 'plus',
              onClick: () => {
                const v = addInput.value;
                if (!v) return;
                if (v > today) {
                  toast(t('La data non può essere nel futuro.'), { tone: 'error' });
                  return;
                }
                if (!draft.doses.includes(v)) draft.doses.push(v);
                if (v < draft.start) {
                  draft.start = v;
                  startInput.value = v;
                  toast(t('Inizio della terapia spostato a questa data'));
                }
                renderInject();
              },
            })),
          ),
        }),
        draft.every > 0 ? button({
          label: t('Compila le date dal calendario previsto'),
          kind: 'ghost',
          icon: 'calendar-check',
          block: true,
          onClick: () => {
            const last = draft.end && draft.end < today ? draft.end : today;
            const list = [];
            for (let d = draft.start; d <= last && list.length < 300; d = addDays(d, draft.every)) list.push(d);
            draft.doses = [...new Set([...draft.doses, ...list])].sort();
            renderInject();
            toast(t('{n, plural, one {# data aggiunta: correggi quelle diverse} other {# date aggiunte: correggi quelle diverse}}', { n: list.length }));
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

  const presetChips = h('div', {
    class: 'chips',
    style: { margin: '-6px 0 18px' }, // i18n-ignore
  }, THERAPY_PRESETS.slice(0, 14).map((p) => h('button', {
    type: 'button',
    class: 'chip',
    title: p.hint ? tv(p.hint) : p.hint,
    onclick: () => {
      draft.name = p.name;
      nameInput.value = tv(p.name);
      draft.cls = p.cls;
      clsSelect.value = p.cls;
      draft.every = p.every || 0;
      renderInject();
    },
  }, tv(p.name))));

  const startInput = dateInput({ value: draft.start, max: today, label: t('Data di inizio'), onChange: (v) => { if (v) draft.start = v; } });
  const endInput = dateInput({ value: draft.end || today, max: today, label: t('Data di fine'), onChange: (v) => { if (v) draft.end = v; } });
  const stopChips = chipGroup({ options: STOP_REASONS.map((r) => ({ value: r.id, label: r.label })), value: draft.stop, onChange: (v) => { draft.stop = v || ''; } });
  const endBox = h('div', {}, field({ label: t('Fine'), control: endInput }), field({ label: t('Perché è stata interrotta?'), control: stopChips }));
  endBox.hidden = draft.end == null;
  const ongoing = h('label', { class: 'row check-row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, t('Terapia ancora in corso'))));
  ongoing.appendChild(switchControl({
    checked: draft.end == null,
    label: t('Terapia ancora in corso'),
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
        const input = h('input', { class: 'input', maxlength: 60, placeholder: t('es. Sudorazione'), 'aria-label': t('Effetto collaterale') });
        const v = await openDialog({
          title: t('Altro effetto collaterale'), content: h('div', { class: 'dlg-content' }, input), dismissValue: null, buttons: [{ label: t('Annulla'), value: null }, { label: t('Aggiungi'), kind: 'primary', onClick: (done) => done(input.value.trim()) }],
        });
        if (v && !draft.sides.includes(v)) draft.sides.push(v);
        renderSides();
      },
    }, t('+ Altro')));
    replaceChildren(sidesBox, chips);
  };
  renderSides();

  const nodes = [
    card(
      field({ label: t('Terapia'), control: nameInput }),
      existing ? null : presetChips,
      field({ label: t('Tipo'), control: clsSelect }),
      field({ label: t('Dose e modalità'), control: doseInput }),
      field({ label: t('Prescritta da'), control: doctorInput }),
    ),
    card(
      cardTitle(t('Periodo')),
      field({ label: t('Inizio'), control: startInput, hint: t('Puoi indicare anche una data lontana: le terapie del passato servono a ricostruire la tua storia.') }),
      ongoing,
      endBox,
    ),
    injectBox,
    card(
      cardTitle(t('Prima di iniziare')),
      h('p', { class: 'muted small', style: { marginBottom: '12px' } }, t('Facoltativo. Serve come punto di partenza se il diario non copre i 3 mesi precedenti l’inizio: lo trovi spesso nel piano terapeutico o nella lettera del neurologo.')),
      field({
        label: t('Giorni di emicrania al mese'),
        control: stepper({
          value: draft.baseDays, min: 0, max: 31, step: 1, start: 8, label: t('giorni di emicrania al mese prima della terapia'), onChange: (v) => { draft.baseDays = v; },
        }),
      }),
      field({
        label: t('Intensità abituale (1–10)'),
        control: stepper({
          value: draft.baseInt, min: 1, max: 10, step: 1, start: 7, label: t('intensità abituale prima della terapia'), onChange: (v) => { draft.baseInt = v; },
        }),
      }),
    ),
    card(
      cardTitle(t('Come è andata')),
      field({
        label: t('Beneficio percepito'),
        control: chipGroup({ options: THERAPY_RATINGS.map((r) => ({ value: r.v, label: r.label })), value: draft.rating, onChange: (v) => { draft.rating = v; } }),
      }),
      field({ label: t('Effetti collaterali'), control: sidesBox }),
      field({
        label: t('Note'),
        control: textArea({
          value: draft.note, placeholder: t('Indicazioni del medico, dosaggi cambiati, sensazioni…'), label: t('Note sulla terapia'), maxLength: 1000, onInput: (v) => { draft.note = v; },
        }),
      }),
    ),
  ];
  if (existing) {
    nodes.push(button({
      label: t('Elimina terapia'),
      kind: 'danger',
      icon: 'trash',
      block: true,
      onClick: async () => {
        const ok = await confirmDialog({
          title: t('Eliminare questa terapia?'), message: t('Potrai annullare subito dopo.'), confirmLabel: t('Elimina'), danger: true,
        });
        if (!ok) return;
        const removed = store.removePreventive(existing.id);
        page.close();
        toast(t('Terapia eliminata'), { action: { label: t('Annulla§undo'), onClick: () => store.upsertPreventive(removed) } });
        if (onDone) onDone(null);
      },
    }));
  }
  replaceChildren(page.body, ...nodes);
  renderInject();

  saveBtn.addEventListener('click', () => {
    if (!draft.name.trim()) {
      toast(t('Scrivi il nome della terapia.'), { tone: 'error' });
      return;
    }
    if (!draft.start) {
      toast(t('Indica quando è iniziata.'), { tone: 'error' });
      return;
    }
    if (draft.end && draft.end < draft.start) {
      toast(t('La fine non può essere prima dell’inizio.'), { tone: 'error' });
      return;
    }
    const outside = draft.doses.filter((d) => d < draft.start || (draft.end && d > draft.end));
    if (outside.length) {
      toast(t('{n, plural, one {# somministrazione è fuori dal periodo della terapia.} other {# somministrazioni sono fuori dal periodo della terapia.}}', { n: outside.length }), { tone: 'error' });
      return;
    }
    const saved = store.upsertPreventive({ ...draft, id: existing ? existing.id : undefined });
    page.close();
    toast(t('Terapia salvata'));
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
      h('div', { class: 'compare-box' }, h('small', {}, t('Prima')), h('b', {}, b ? num(b.days) : '—'), h('span', {}, t('giorni al mese'))),
      h('span', { class: 'compare-arrow' }, icon('chevron-right', 22)),
      h('div', { class: 'compare-box' }, h('small', {}, t('Con la terapia')), h('b', {}, d ? num(d.days) : '—'), h('span', {}, delta == null ? t('giorni al mese') : h('span', { class: `delta ${delta <= 0 ? 'good' : 'bad'}` }, `${delta > 0 ? '+' : '−'}${pct(Math.abs(delta))}`))),
    ),
    h(
      'div',
      { class: 'kpis' },
      h('div', { class: 'kpi' }, h('small', {}, t('Intensità media')), h('b', {}, `${b && b.intensity != null ? num(b.intensity) : '—'} → ${d && d.intensity != null ? num(d.intensity) : '—'}`)),
      h('div', { class: 'kpi' }, h('small', {}, t('Giorni con farmaci')), h('b', {}, `${b && b.acute != null ? num(b.acute) : '—'} → ${d && d.acute != null ? num(d.acute) : '—'}`)),
      h('div', { class: 'kpi' }, h('small', {}, t('Attacchi al mese')), h('b', {}, `${b && b.attacks != null ? num(b.attacks) : '—'} → ${d && d.attacks != null ? num(d.attacks) : '—'}`)),
    ),
  );
}

export function openTherapyDetail(id) {
  const page = openPage({ title: t('Terapia') });
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
    const botox = p.cls === 'botox';
    page.setTitle(tv(p.name));
    page.setRight(h('button', { type: 'button', class: 'bar-btn', onclick: () => openTherapyEditor(p, { onDone: () => render() }) }, t('Modifica')));
    const nodes = [];
    const status = isActive(p, today) ? pill(t('In corso'), 'green') : (p.start > today ? pill(t('Programmata'), 'gray') : pill(p.stop ? t('Interrotta · {motivo}', { motivo: stopPhrase(p.stop) }) : t('Conclusa'), 'gray'));
    nodes.push(card(
      h('div', { class: 'flex', style: { alignItems: 'flex-start', marginBottom: '10px' } },
        classIcon(p, 19),
        h('div', { style: { minWidth: '0', flex: '1' } },
          h('div', { style: { fontSize: '1.25rem', fontWeight: '700' } }, tv(p.name)),
          h('div', { class: 'muted small' }, [cls.label, p.dose].filter(Boolean).join(' · ')))),
      h('div', { class: 'tag-row', style: { marginBottom: '8px' } }, status),
      h('p', { class: 'muted small' }, capitalize(therapyPeriodText(p, today))),
      p.doctor ? h('p', { class: 'muted small' }, t('Prescritta da {medico}', { medico: p.doctor })) : null,
    ));

    if (isInjectable(p)) {
      const nd = isActive(p, today) ? nextDose(p, today) : null;
      const anchors = doseAnchors(p, today);
      const recent = [...anchors].reverse().slice(0, 6);
      const markToday = () => {
        store.addTherapyDose(p.id, today);
        toast(t('Somministrazione di oggi registrata'));
      };
      let ndText = '';
      if (nd && nd.status === 'overdue') ndText = t('{n, plural, one {In ritardo di # giorno: se l’hai già fatta, registrala.} other {In ritardo di # giorni: se l’hai già fatta, registrala.}}', { n: -nd.daysLeft });
      else if (nd && nd.daysLeft === 0) ndText = t('È oggi.');
      else if (nd && nd.fromSchedule) ndText = t('{n, plural, one {Tra # giorno (calcolata dal calendario previsto).} other {Tra # giorni (calcolata dal calendario previsto).}}', { n: nd.daysLeft });
      else if (nd) ndText = t('{n, plural, one {Tra # giorno.} other {Tra # giorni.}}', { n: nd.daysLeft });
      nodes.push(card(
        cardTitle(botox ? t('Sedute') : t('Somministrazioni')),
        nd ? alertBox({
          tone: nd.status === 'overdue' ? 'warn' : nd.status === 'due' ? 'warn' : 'info',
          icon: 'calendar',
          title: nd.status === 'overdue' ? t('Prevista il {data}', { data: fmtDateShort(nd.next) }) : t('Prossima: {data}', { data: capitalize(fmtDateMedium(nd.next)) }),
          text: ndText,
        }) : null,
        recent.length ? h('div', { class: 'kv' }, h('span', {}, p.doses.length ? t('Ultime registrate') : t('Calendario previsto')), h('b', {}, recent.map((d) => fmtDateShort(d)).slice(0, 3).join(', '))) : null,
        h('div', { class: 'kv' }, h('span', {}, t('Totale')), h('b', {}, botox ? t('{n, plural, one {# seduta} other {# sedute}}', { n: anchors.length }) : t('{n, plural, one {# somministrazione} other {# somministrazioni}}', { n: anchors.length }))),
        isActive(p, today) ? h('div', { class: 'btn-row mt' },
          button({ label: t('Fatta oggi'), kind: 'primary', icon: 'check', onClick: markToday, disabled: p.doses.includes(today) }),
          nd ? button({
            label: t('Calendario'),
            kind: 'secondary',
            icon: 'calendar-plus',
            onClick: () => exportEventIcs({
              uid: `dose-${p.id}-${nd.next}`, // i18n-ignore
              title: botox ? t('{terapia}: seduta', { terapia: tv(p.name) }) : t('{terapia}: somministrazione', { terapia: tv(p.name) }),
              date: nd.next < today ? today : nd.next,
              allDay: true,
              description: t('Promemoria dal Diario Emicrania'),
            }),
          }) : null) : null,
      ));
    }

    const eff = [];
    if (o.baseline || o.during) {
      eff.push(compareBlock(o));
      if (o.response) {
        const r = RESPONSES[o.response];
        eff.push(h('div', { class: `response ${r.tone}` }, icon(o.response === 'worse' ? 'trend-up' : 'trend-down', 20), h('div', {}, r.label, h('small', {}, RESPONSE_TEXT[o.response]))));
      }
      const notes = [];
      if (o.baseline) notes.push(t('Prima: {origine}.', { origine: o.baseline.label }));
      if (o.during) notes.push(t('Con la terapia: {origine}.', { origine: o.during.label }));
      if (o.early) notes.push(t('Valutazione preliminare: l’effetto delle terapie di prevenzione si giudica di solito dopo almeno 3 mesi.'));
      eff.push(h('p', { class: 'field-hint', style: { marginTop: '10px' } }, notes.join(' ')));
    }
    if (!o.baseline) {
      eff.push(alertBox({
        tone: 'info',
        icon: 'info',
        title: t('Manca il punto di partenza'),
        text: t('Per misurare l’efficacia indica quanti giorni di emicrania avevi prima di iniziare (in {percorso}), oppure racconta quel periodo nella tua storia.', { percorso: `${t('Modifica')} › ${t('Prima di iniziare')}` }),
      }));
    }
    if (!o.during && p.start <= today) {
      eff.push(h('p', { class: 'muted small' }, t('Il diario non copre ancora abbastanza giorni di questa terapia (ne servono almeno 28).')));
    }
    nodes.push(card(cardTitle(t('Efficacia')), ...eff));

    if (o.monthly.filter((m) => m.value != null).length >= 2) {
      nodes.push(card(
        cardTitle(t('Mese per mese')),
        therapyChart({ monthly: o.monthly, baseline: o.baseline ? o.baseline.days : null, startMonth: p.start.slice(0, 7), color: cls.color }),
        h('p', { class: 'field-hint', style: { marginTop: '8px' } }, t('Barre grigie: prima della terapia. Barre chiare: mese non completo (stima su 30 giorni).')),
      ));
    }

    if (o.vs.rated) {
      const vsNote = o.vs.missed
        ? t('{rated, plural, one {# attacco valutato} other {# attacchi valutati}} su {total} durante la terapia; in {missed} avevi saltato o ritardato una dose.', { rated: o.vs.rated, total: o.vs.total, missed: o.vs.missed })
        : t('{rated, plural, one {# attacco valutato} other {# attacchi valutati}} su {total} durante la terapia.', { rated: o.vs.rated, total: o.vs.total });
      nodes.push(card(
        cardTitle(t('Come hai giudicato gli attacchi')),
        hbars([
          { label: t('Più leggeri di prima'), value: o.vs.better, color: 'var(--green)' },
          { label: t('Come prima'), value: o.vs.same, color: 'var(--gray)' },
          { label: t('Più forti di prima'), value: o.vs.worse, color: 'var(--red)' },
        ].map((x) => ({ ...x, text: `${x.value} · ${pct(x.value / o.vs.rated)}` })), { max: o.vs.rated }),
        h('p', { class: 'field-hint', style: { marginTop: '10px' } }, vsNote),
      ));
    }

    if (o.cycle && o.cycle.enough) {
      let cycleNote;
      if (o.cycle.wearingOff) {
        cycleNote = botox
          ? t('Gli attacchi aumentano nell’ultima settimana prima della nuova seduta: è il cosiddetto effetto di fine dose. Parlane con il neurologo.')
          : t('Gli attacchi aumentano nell’ultima settimana prima della nuova somministrazione: è il cosiddetto effetto di fine dose. Parlane con il neurologo.');
      } else {
        cycleNote = botox
          ? t('Giorni di emicrania ogni 7 giorni, per settimana dall’ultima seduta ({n, plural, one {# ciclo completo} other {# cicli completi}}).', { n: o.cycle.complete })
          : t('Giorni di emicrania ogni 7 giorni, per settimana dall’ultima somministrazione ({n, plural, one {# ciclo completo} other {# cicli completi}}).', { n: o.cycle.complete });
      }
      nodes.push(card(
        cardTitle(t('Dentro ogni ciclo')),
        cycleChart(o.cycle.weeks),
        h('p', { class: 'field-hint', style: { marginTop: '8px' } }, cycleNote),
      ));
    }

    const extra = [];
    if (p.rating != null) extra.push(h('div', { class: 'kv' }, h('span', {}, t('Beneficio percepito')), h('b', {}, THERAPY_RATINGS.find((r) => r.v === p.rating).label)));
    if (p.sides.length) extra.push(h('div', { class: 'kv' }, h('span', {}, t('Effetti collaterali')), h('b', {}, p.sides.map((s) => tv(s)).join(', '))));
    if (p.note) extra.push(h('p', { class: 'muted pre', style: { marginTop: '8px' } }, p.note));
    if (extra.length) nodes.push(card(cardTitle(t('Note ed effetti')), ...extra));
    nodes.push(footnote(t('Il confronto usa i 3 mesi prima dell’inizio e gli ultimi 3 mesi di terapia (o il periodo disponibile). Una riduzione di almeno il 50% dei giorni di emicrania è considerata una buona risposta; valuta sempre i risultati con il neurologo.')));
    replaceChildren(page.body, ...nodes);
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}

/* ---------- elenco ---------- */

export function openTherapies() {
  const page = openPage({ title: t('Terapie di prevenzione') });
  const render = () => {
    const top = page.body.scrollTop;
    const db = store.getDb();
    const today = todayStr();
    const idx = getIndex(db, store.getRev(), today);
    const sorted = [...db.preventives].sort((a, b) => (a.start < b.start ? 1 : -1));
    const active = sorted.filter((p) => isActive(p, today) || p.start > today);
    const past = sorted.filter((p) => !active.includes(p));
    const rowsOf = (list) => list.map((p) => therapyRow(p, { today, outcome: therapyOutcome(idx, db, p, today), onClick: () => openTherapyDetail(p.id) }));
    const nodes = [h('p', { class: 'page-intro' }, t('Le terapie prescritte dal neurologo per ridurre gli attacchi: anticorpi monoclonali, tossina botulinica, antidepressivi, beta-bloccanti e altre. Puoi inserire anche quelle del passato.'))];
    const chart = longTermCard(idx, db, today);
    if (chart) nodes.push(chart);
    if (active.length) nodes.push(section(t('In corso'), group(...rowsOf(active))));
    if (past.length) nodes.push(section(t('Concluse'), group(...rowsOf(past))));
    if (!sorted.length) nodes.push(emptyState({ icon: 'shield', title: t('Nessuna terapia'), text: t('Aggiungi la terapia che segui ora e quelle provate in passato: vedrai come cambiano frequenza e intensità degli attacchi.') }));
    nodes.push(group(
      row({ icon: 'plus', tone: 'green', title: t('Aggiungi la terapia attuale'), onClick: () => openTherapyEditor(null, { onDone: render }) }),
      row({ icon: 'history', tone: 'gray', title: t('Aggiungi una terapia del passato'), onClick: () => openTherapyEditor(null, { onDone: render, past: true }) }),
    ));
    if (sorted.length) nodes.push(footnote(t('L’efficacia confronta i giorni di emicrania prima e durante la terapia, usando il diario o le stime della tua storia. È un aiuto per il dialogo con il medico, non una valutazione clinica.')));
    replaceChildren(page.body, ...nodes);
    page.body.scrollTop = top;
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}

export const openPreventives = openTherapies;
