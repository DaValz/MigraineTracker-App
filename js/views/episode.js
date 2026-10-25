import { h, replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import {
  openPage, openSheet, openDialog, confirmDialog, toast, chipGroup, switchControl, field, card, cardTitle, button, row, group, dateTimeInput,
  dateInput, textArea, intensityPicker, accordion,
} from '../ui.js';
import {
  EPISODE_TYPES, SIDES, PAIN_AREAS, PAIN_QUALITY, AURA_TYPES, MED_EFFECTS, IMPACT_LEVELS, WORK_LEVELS, APPROX_DURATIONS, TX_VS,
  medClassLabel, therapyClass,
} from '../data.js';
import {
  nowStr, todayStr, addMinutes, minutesBetween, formatDuration, fmtDateTime, fmtDateShort, addDays, diffDays,
} from '../dates.js';
import { medStats, getIndex } from '../analysis.js';
import { activeTherapies, cycleDay, isInjectable } from '../clinical.js';
import { plural } from '../format.js';
import { promptNewMed, promptNewItem } from './lists.js';
import { maybeSyncWeather } from '../weather.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const dateOf = (dt) => dt.slice(0, 10);

function listPicker({ kind, selected, onChange }) {
  const wrap = h('div');
  let sel = [...selected];
  const render = () => {
    const base = store.listOptions(kind);
    const options = [...base, ...sel.filter((x) => !base.includes(x))];
    const chips = chipGroup({
      options,
      value: sel,
      multi: true,
      onChange: (v) => {
        sel = v;
        onChange(v);
      },
    });
    chips.appendChild(h('button', {
      type: 'button',
      class: 'chip add',
      onclick: async () => {
        const label = await promptNewItem(kind);
        if (!label) return;
        if (!sel.includes(label)) sel = [...sel, label];
        onChange(sel);
        render();
      },
    }, '+ Altro'));
    replaceChildren(wrap, chips);
  };
  render();
  return wrap;
}

function defaultMedTime(draft) {
  if (draft.timeUnknown) return draft.start;
  const n = nowStr();
  return draft.start <= n && (!draft.end || draft.end >= n) ? n : draft.start;
}

export function openMedPicker(draft, onPick) {
  const sheet = openSheet({ title: 'Aggiungi farmaco', tall: true });
  const search = h('input', {
    class: 'input', type: 'search', placeholder: 'Cerca un farmaco…', 'aria-label': 'Cerca un farmaco', autocomplete: 'off', autocapitalize: 'off',
  });
  const listEl = h('div');
  const pick = (m) => {
    onPick({
      name: m.name, cls: m.cls, dose: '', at: defaultMedTime(draft), effect: null,
    });
    sheet.close();
  };
  const render = () => {
    const q = search.value.trim().toLowerCase();
    const db = store.getDb();
    const idx = getIndex(db, store.getRev(), todayStr());
    const all = store.listOptions('meds');
    const recent = medStats(idx.episodes).slice(0, 5).map((s) => all.find((m) => m.name === s.name)).filter(Boolean);
    const filtered = all.filter((m) => !q || m.name.toLowerCase().includes(q) || (m.hint || '').toLowerCase().includes(q));
    const nodes = [];
    if (!q && recent.length) {
      nodes.push(h('div', { class: 'field-label' }, 'Usati di recente'));
      nodes.push(h('div', { class: 'chips mb' }, recent.map((m) => h('button', { type: 'button', class: 'chip', onclick: () => pick(m) }, m.name))));
    }
    nodes.push(group(...filtered.map((m) => row({
      icon: 'pill',
      tone: 'green',
      title: m.name,
      subtitle: [medClassLabel(m.cls), m.hint].filter(Boolean).join(' · '),
      onClick: () => pick(m),
    }))));
    if (!filtered.length) nodes.push(h('p', { class: 'muted center small mb' }, 'Nessun risultato.'));
    nodes.push(button({
      label: 'Nuovo farmaco…',
      kind: 'secondary',
      icon: 'plus',
      block: true,
      onClick: async () => {
        const m = await promptNewMed();
        if (m) pick(m);
      },
    }));
    replaceChildren(listEl, ...nodes);
  };
  search.addEventListener('input', render);
  replaceChildren(sheet.body, h('div', { class: 'mb' }, search), listEl);
  render();
}

/** Se l'attacco è precedente all'inizio del diario, chiede se il diario va esteso. */
async function askDiaryStart(dateStr, prevStart) {
  const s = store.getSettings();
  if (!s.assumeFree || dateStr >= prevStart) return;
  const choice = await openDialog({
    title: 'Attacco precedente all’inizio del diario',
    message: `Finora il diario parte dal ${fmtDateShort(prevStart)}. Hai registrato tutti gli attacchi anche dal ${fmtDateShort(dateStr)}? Se sì, i giorni senza attacchi di quel periodo conteranno come giorni senza emicrania.`,
    dismissValue: 'isolated',
    stack: true,
    buttons: [
      { label: 'Sì, il diario è completo da qui', value: 'extend', kind: 'primary' },
      { label: 'No, è un attacco isolato', value: 'isolated' },
    ],
  });
  if (choice === 'extend') {
    if (s.diaryStart) store.updateSettings({ diaryStart: dateStr });
    toast(`Diario completo dal ${fmtDateShort(dateStr)}`);
  } else {
    store.updateSettings({ diaryStart: prevStart });
    toast('L’attacco è salvato, ma non cambia le statistiche del periodo precedente');
  }
}

function therapySection(draft, onChange) {
  const box = h('div');
  const render = () => {
    const db = store.getDb();
    const date = dateOf(draft.start);
    const list = activeTherapies(db, date);
    const nodes = [];
    if (!list.length) {
      nodes.push(h('p', { class: 'muted small', style: { marginBottom: '12px' } }, `Nessuna terapia di prevenzione registrata per il ${fmtDateShort(date)}. Se ne segui una (per esempio anticorpi monoclonali, tossina botulinica o antidepressivi prescritti dal neurologo), aggiungila: potrai vedere se gli attacchi diventano meno frequenti e meno forti.`));
      nodes.push(button({
        label: 'Aggiungi la terapia che segui',
        kind: 'secondary',
        icon: 'plus',
        block: true,
        onClick: async () => {
          const { openTherapyEditor } = await import('./therapies.js');
          openTherapyEditor(null, { onDone: render });
        },
      }));
      replaceChildren(box, ...nodes);
      return;
    }
    list.forEach((p) => {
      const cd = isInjectable(p) ? cycleDay(p, date) : null;
      const sub = [`dal ${fmtDateShort(p.start)}`];
      if (cd) sub.push(cd.day === 0 ? 'giorno della somministrazione' : `${plural(cd.day, 'giorno', 'giorni')} dall’ultima somministrazione`);
      nodes.push(h(
        'div',
        { class: 'flex', style: { padding: '2px 0 12px', alignItems: 'flex-start' } },
        h('span', { class: 'row-icon', style: { background: therapyClass(p.cls).color } }, icon(isInjectable(p) ? 'syringe' : 'pill', 17)),
        h('div', { style: { minWidth: '0' } }, h('div', { style: { fontWeight: '600' } }, `${p.name}${p.dose ? ` · ${p.dose}` : ''}`), h('div', { class: 'muted small' }, sub.join(' · '))),
      ));
    });
    nodes.push(field({
      label: 'Rispetto a prima della terapia, questo attacco è stato…',
      control: chipGroup({
        options: TX_VS.map((v) => ({ value: v.id, label: v.label })),
        value: draft.tx.vs,
        onChange: (v) => {
          draft.tx.vs = v || '';
          onChange();
        },
      }),
    }));
    nodes.push(field({
      label: 'Nei giorni prima hai saltato o ritardato una dose?',
      control: chipGroup({
        options: [{ value: false, label: 'No' }, { value: true, label: 'Sì' }],
        value: draft.tx.missed,
        onChange: (v) => {
          draft.tx.missed = v == null ? null : v;
          onChange();
        },
      }),
      hint: 'Facoltativo. Queste risposte servono a capire se la terapia sta funzionando.',
    }));
    replaceChildren(box, ...nodes);
  };
  render();
  box.refresh = render;
  return box;
}

export function openEpisodeEditor({ id = null, date = null, onSaved = null } = {}) {
  const existing = id ? store.getDb().episodes[id] : null;
  const now = nowStr();
  const isToday = !date || date === todayStr();
  let draft;
  if (existing) {
    draft = clone(existing);
    if (!draft.tx) draft.tx = { vs: '', missed: null };
  } else {
    const start = isToday ? now : `${date}T12:00`;
    draft = {
      start,
      end: isToday ? null : addMinutes(start, 120),
      timeUnknown: false,
      approxDur: '',
      intensity: null,
      type: '',
      side: '',
      areas: [],
      quality: [],
      aura: [],
      symptoms: [],
      triggers: [],
      meds: [],
      impact: 0,
      work: 0,
      tx: { vs: '', missed: null },
      note: '',
    };
  }
  const initial = JSON.stringify(draft);
  const isDirty = () => JSON.stringify(draft) !== initial;
  const prevTrackingStart = getIndex(store.getDb(), store.getRev(), todayStr()).trackingStart;

  const saveBtn = h('button', { type: 'button', class: 'bar-btn solid' }, 'Salva');
  const page = openPage({
    title: existing ? 'Modifica attacco' : 'Nuovo attacco',
    backLabel: 'Annulla',
    right: saveBtn,
    onBack: async (p) => {
      if (!isDirty()) {
        p.close();
        return;
      }
      const ok = await confirmDialog({
        title: 'Scartare le modifiche?', message: 'Le modifiche non salvate andranno perse.', confirmLabel: 'Scarta', cancelLabel: 'Continua', danger: true,
      });
      if (ok) p.close();
    },
  });

  const refreshSave = () => {
    saveBtn.disabled = !draft.intensity;
  };

  // --- intensità
  const intensityCard = card(
    cardTitle('Quanto fa male?'),
    intensityPicker({
      value: draft.intensity,
      onChange: (v) => {
        draft.intensity = v;
        refreshSave();
      },
    }),
  );

  // --- quando
  const startInput = dateTimeInput({
    value: draft.start,
    label: 'Inizio',
    onChange: (v) => {
      if (!v) return;
      draft.start = v;
      refreshWhen();
    },
  });
  const dayInput = dateInput({
    value: dateOf(draft.start),
    max: todayStr(),
    label: 'Giorno dell’attacco',
    onChange: (v) => {
      if (!v) return;
      draft.start = `${v}T12:00`;
      if (draft.approxDur !== 'days' || !draft.end || dateOf(draft.end) < v) draft.end = draft.start;
      lastDayInput.value = dateOf(draft.end || draft.start);
      lastDayInput.min = v;
      draft.meds.forEach((m) => { if (dateOf(m.at) < v) m.at = draft.start; });
      refreshWhen();
      renderMeds();
    },
  });
  const endInput = dateTimeInput({
    value: draft.end || addMinutes(draft.start, 120),
    label: 'Fine',
    onChange: (v) => {
      if (!v) return;
      draft.end = v;
      refreshWhen();
    },
  });
  const lastDayInput = dateInput({
    value: dateOf(draft.end || draft.start),
    min: dateOf(draft.start),
    max: todayStr(),
    label: 'Ultimo giorno dell’attacco',
    onChange: (v) => {
      if (!v) return;
      draft.end = `${v}T12:00`;
      refreshWhen();
    },
  });
  const durationEl = h('p', { class: 'muted small', style: { marginTop: '10px' } });
  const endField = field({ label: 'Fine', control: endInput });
  const endChips = h('div', { class: 'chips', style: { marginTop: '10px' } }, [[1, '1 h'], [2, '2 h'], [4, '4 h'], [8, '8 h'], [12, '12 h'], [24, '24 h']].map(([hrs, label]) => h('button', {
    type: 'button',
    class: 'chip',
    onclick: () => {
      const target = addMinutes(draft.start, hrs * 60);
      const limit = nowStr();
      draft.end = target > limit ? (limit >= draft.start ? limit : draft.start) : target;
      endInput.value = draft.end;
      refreshWhen();
    },
  }, label)));
  const startChips = h('div', { class: 'chips', style: { marginTop: '10px' } }, [[0, 'Adesso'], [30, '30 min fa'], [60, '1 h fa'], [120, '2 h fa'], [240, '4 h fa']].map(([mins, label]) => h('button', {
    type: 'button',
    class: 'chip',
    onclick: () => {
      draft.start = addMinutes(nowStr(), -mins);
      startInput.value = draft.start;
      refreshWhen();
    },
  }, label)));
  const switchRow = (title, sub, control) => {
    const el = h('label', { class: 'row check-row', style: { padding: '12px 0' } }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), sub ? h('span', { class: 'row-sub' }, sub) : null));
    el.appendChild(control);
    return el;
  };
  const ongoingRow = switchRow('Attacco ancora in corso', 'Potrai terminarlo dopo dalla schermata Oggi', switchControl({
    checked: draft.end == null,
    label: 'Attacco ancora in corso',
    onChange: (on) => {
      if (on) {
        draft.end = null;
      } else {
        const n = nowStr();
        draft.end = draft.start <= n ? n : draft.start;
        endInput.value = draft.end;
      }
      refreshWhen();
    },
  }));
  const unknownRow = switchRow('Non ricordo l’orario', 'Per gli attacchi passati: indica solo il giorno', switchControl({
    checked: draft.timeUnknown,
    label: 'Non ricordo l’orario',
    onChange: (on) => {
      draft.timeUnknown = on;
      if (on) {
        const day = dateOf(draft.start) > todayStr() ? todayStr() : dateOf(draft.start);
        draft.start = `${day}T12:00`;
        draft.end = draft.start;
        draft.approxDur = '';
        dayInput.value = day;
        lastDayInput.value = day;
        lastDayInput.min = day;
        draft.meds.forEach((m) => { m.at = `${dateOf(m.at || draft.start)}T12:00`; });
        durChips.reset();
      } else {
        draft.approxDur = '';
        const n = nowStr();
        const end = addMinutes(draft.start, 120);
        draft.end = end > n ? (draft.start <= n ? n : draft.start) : end;
        startInput.value = draft.start;
        endInput.value = draft.end;
      }
      refreshWhen();
      renderMeds();
    },
  }));
  const makeDurChips = () => chipGroup({
    options: APPROX_DURATIONS.map((d) => ({ value: d.id, label: d.label })),
    value: draft.approxDur,
    onChange: (v) => {
      draft.approxDur = v || '';
      if (draft.approxDur !== 'days') draft.end = draft.start;
      else if (!draft.end || draft.end <= draft.start) {
        const next = addDays(dateOf(draft.start), 1);
        draft.end = `${next > todayStr() ? dateOf(draft.start) : next}T12:00`;
        lastDayInput.value = dateOf(draft.end);
      }
      refreshWhen();
    },
  });
  const durBox = h('div');
  const durChips = {
    reset: () => replaceChildren(durBox, makeDurChips()),
  };
  durChips.reset();
  const durField = field({ label: 'Quanto è durato, più o meno?', control: durBox, hint: 'Se non lo ricordi, lascia vuoto.' });
  const lastDayField = field({ label: 'Ultimo giorno', control: lastDayInput });
  const knownStart = h('div', {}, field({ label: 'Inizio', control: startInput }), existing ? null : startChips);
  const knownEnd = h('div', {}, ongoingRow, endField, endChips);
  const unknownBox = h('div', {}, field({ label: 'Giorno', control: dayInput }), durField, lastDayField);
  const whenCard = card(cardTitle('Quando'), knownStart, unknownBox, unknownRow, knownEnd, durationEl);
  const refreshWhen = () => {
    const tu = draft.timeUnknown;
    knownStart.hidden = tu;
    knownEnd.hidden = tu;
    unknownBox.hidden = !tu;
    lastDayField.hidden = !(tu && draft.approxDur === 'days');
    if (tu) {
      const days = draft.end ? diffDays(dateOf(draft.start), dateOf(draft.end)) + 1 : 1;
      durationEl.textContent = draft.approxDur === 'days' ? `Durata: ${plural(days, 'giorno', 'giorni')}` : '';
      durationEl.hidden = draft.approxDur !== 'days';
    } else {
      durationEl.hidden = false;
      const ongoing = draft.end == null;
      endField.hidden = ongoing;
      endChips.hidden = ongoing;
      if (ongoing) durationEl.textContent = 'In corso';
      else if (draft.end < draft.start) durationEl.textContent = 'La fine è precedente all’inizio.';
      else durationEl.textContent = `Durata: ${formatDuration(minutesBetween(draft.start, draft.end))}`;
    }
    if (txBox) txBox.refresh();
  };

  // --- farmaci
  const medsBox = h('div');
  const renderMeds = () => {
    const cards = draft.meds.map((m, i) => {
      const dose = h('input', {
        class: 'input', type: 'text', placeholder: 'Dose (es. 400 mg)', maxlength: 40, value: m.dose || '', 'aria-label': `Dose di ${m.name}`, autocomplete: 'off',
      });
      dose.addEventListener('input', () => {
        m.dose = dose.value;
      });
      const when = draft.timeUnknown
        ? dateInput({
          value: dateOf(m.at || draft.start), min: dateOf(draft.start), max: todayStr(), label: `Giorno di ${m.name}`, onChange: (v) => { if (v) m.at = `${v}T12:00`; },
        })
        : dateTimeInput({ value: m.at || draft.start, label: `Orario di ${m.name}`, onChange: (v) => { if (v) m.at = v; } });
      return h(
        'div',
        { class: 'med-card' },
        h('div', { class: 'med-head' },
          h('div', {}, h('div', { class: 'med-name' }, m.name), h('div', { class: 'med-sub' }, medClassLabel(m.cls))),
          h('button', {
            type: 'button',
            class: 'icon-btn flat',
            'aria-label': `Rimuovi ${m.name}`,
            onclick: () => {
              draft.meds.splice(i, 1);
              renderMeds();
            },
          }, icon('x', 20))),
        field({ label: draft.timeUnknown ? 'Giorno in cui l’hai preso' : 'Quando l’hai preso', control: when }),
        field({ label: 'Dose', control: dose }),
        field({
          label: 'Ha funzionato?',
          control: chipGroup({
            options: MED_EFFECTS.map((e) => ({ value: e.v, label: e.label })),
            value: m.effect,
            onChange: (v) => {
              m.effect = v;
            },
          }),
        }),
      );
    });
    replaceChildren(
      medsBox,
      ...cards,
      button({
        label: 'Aggiungi farmaco',
        kind: 'secondary',
        icon: 'plus',
        block: true,
        onClick: () => openMedPicker(draft, (m) => {
          draft.meds.push(m);
          renderMeds();
        }),
      }),
    );
  };
  renderMeds();
  const medsCard = card(cardTitle('Farmaci per l’attacco'), medsBox);

  // --- terapia di prevenzione
  const txBox = therapySection(draft, () => {});
  const txCard = card(cardTitle('Terapia di prevenzione'), txBox);

  // --- dettagli opzionali
  const hasContent = (arr) => arr && arr.length > 0;
  const whereCount = () => (draft.type ? 1 : 0) + (draft.side ? 1 : 0) + draft.areas.length + draft.quality.length + draft.aura.length;
  const accWhere = accordion({
    title: 'Dove e come fa male',
    count: whereCount(),
    open: !!existing && whereCount() > 0,
    children: [
      field({
        label: 'Tipo di mal di testa',
        control: chipGroup({ options: EPISODE_TYPES.map((t) => ({ value: t.id, label: t.label })), value: draft.type, onChange: (v) => { draft.type = v || ''; accWhere.setCount(whereCount()); } }),
      }),
      field({
        label: 'Lato',
        control: chipGroup({ options: SIDES.map((s) => ({ value: s.id, label: s.label })), value: draft.side, onChange: (v) => { draft.side = v || ''; accWhere.setCount(whereCount()); } }),
      }),
      field({ label: 'Zona', control: chipGroup({ options: PAIN_AREAS, value: draft.areas, multi: true, onChange: (v) => { draft.areas = v; accWhere.setCount(whereCount()); } }) }),
      field({ label: 'Che tipo di dolore', control: chipGroup({ options: PAIN_QUALITY, value: draft.quality, multi: true, onChange: (v) => { draft.quality = v; accWhere.setCount(whereCount()); } }) }),
      field({
        label: 'Aura (disturbi prima o durante il dolore)',
        control: chipGroup({ options: AURA_TYPES, value: draft.aura, multi: true, onChange: (v) => { draft.aura = v; accWhere.setCount(whereCount()); } }),
        hint: 'Disturbi improvvisi del linguaggio o della forza muscolare, mai provati prima? Chiama il 112.',
      }),
    ],
  });
  const accSymptoms = accordion({
    title: 'Sintomi associati',
    count: draft.symptoms.length,
    open: !!existing && hasContent(draft.symptoms),
    children: [listPicker({ kind: 'symptoms', selected: draft.symptoms, onChange: (v) => { draft.symptoms = v; accSymptoms.setCount(v.length); } })],
  });
  const accTriggers = accordion({
    title: 'Fattori scatenanti',
    count: draft.triggers.length,
    open: !!existing && hasContent(draft.triggers),
    children: [listPicker({ kind: 'triggers', selected: draft.triggers, onChange: (v) => { draft.triggers = v; accTriggers.setCount(v.length); } })],
  });
  const impactDesc = h('p', { class: 'field-hint' });
  const paintImpact = () => {
    impactDesc.textContent = (IMPACT_LEVELS.find((l) => l.v === draft.impact) || {}).desc || '';
  };
  const impactCount = () => (draft.impact ? 1 : 0) + (draft.work ? 1 : 0);
  const accImpact = accordion({
    title: 'Impatto sulla giornata',
    count: impactCount(),
    open: !!existing && impactCount() > 0,
    children: [
      field({
        label: 'Quanto ha limitato le tue attività?',
        control: chipGroup({
          options: IMPACT_LEVELS.map((l) => ({ value: l.v, label: l.label })),
          value: draft.impact,
          allowClear: false,
          onChange: (v) => {
            draft.impact = v == null ? 0 : v;
            paintImpact();
            accImpact.setCount(impactCount());
          },
        }),
      }),
      impactDesc,
      field({
        label: 'Lavoro, scuola o impegni',
        cls: 'mt',
        control: chipGroup({
          options: WORK_LEVELS.map((l) => ({ value: l.v, label: l.label })),
          value: draft.work,
          allowClear: false,
          onChange: (v) => {
            draft.work = v == null ? 0 : v;
            accImpact.setCount(impactCount());
          },
        }),
      }),
    ],
  });
  paintImpact();
  const accNote = accordion({
    title: 'Note',
    count: draft.note ? 1 : 0,
    open: !!existing && !!draft.note,
    children: [textArea({
      value: draft.note,
      placeholder: 'Cosa stavi facendo, cosa hai notato, cosa ha aiutato…',
      label: 'Note',
      onInput: (v) => {
        draft.note = v;
        accNote.setCount(v.trim() ? 1 : 0);
      },
    })],
  });

  const parts = [intensityCard, whenCard, medsCard, txCard, accWhere, accSymptoms, accTriggers, accImpact, accNote];
  if (existing) {
    parts.push(h('div', { class: 'mt' }, button({
      label: 'Elimina attacco',
      kind: 'danger',
      icon: 'trash',
      block: true,
      onClick: async () => {
        const ok = await confirmDialog({
          title: 'Eliminare questo attacco?', message: 'Potrai annullare subito dopo.', confirmLabel: 'Elimina', danger: true,
        });
        if (!ok) return;
        const removed = store.removeEpisode(existing.id);
        page.close();
        toast('Attacco eliminato', { action: { label: 'Annulla', onClick: () => store.restoreEpisode(removed) } });
      },
    })));
  }
  replaceChildren(page.body, ...parts);
  refreshWhen();
  refreshSave();

  const validate = () => {
    const n = addMinutes(nowStr(), 5);
    if (!draft.intensity) return 'Scegli l’intensità del dolore.';
    if (!draft.start) return 'Indica quando è iniziato.';
    if (draft.timeUnknown) {
      if (dateOf(draft.start) > todayStr()) return 'Il giorno non può essere nel futuro.';
      if (draft.approxDur === 'days' && draft.end) {
        if (dateOf(draft.end) < dateOf(draft.start)) return 'L’ultimo giorno non può essere prima del primo.';
        if (dateOf(draft.end) > todayStr()) return 'L’ultimo giorno non può essere nel futuro.';
        if (diffDays(dateOf(draft.start), dateOf(draft.end)) > 30) return 'La durata supera i 30 giorni: controlla le date.';
      }
      return null;
    }
    if (draft.start > n) return 'L’inizio non può essere nel futuro.';
    if (draft.end) {
      if (draft.end < draft.start) return 'La fine non può essere prima dell’inizio.';
      if (draft.end > n) return 'La fine non può essere nel futuro.';
      if (minutesBetween(draft.start, draft.end) > 30 * 24 * 60) return 'La durata supera i 30 giorni: controlla le date.';
    }
    const late = draft.meds.find((m) => m.at && m.at > n);
    if (late) return `L’orario di ${late.name} è nel futuro.`;
    return null;
  };

  saveBtn.addEventListener('click', async () => {
    const problem = validate();
    if (problem) {
      toast(problem, { tone: 'error' });
      return;
    }
    const payload = { ...draft, id: existing ? existing.id : undefined };
    if (!activeTherapies(store.getDb(), dateOf(draft.start)).length) payload.tx = { vs: '', missed: null };
    payload.meds = draft.meds.map((m) => ({ ...m, at: m.at || draft.start }));
    let saved;
    try {
      saved = store.upsertEpisode(payload);
    } catch (e) {
      toast('Impossibile salvare: controlla i dati inseriti.', { tone: 'error' });
      return;
    }
    page.close();
    if (!existing && saved.end == null) toast('Attacco registrato. Quando passa, toccalo in «Oggi» per terminarlo.');
    else toast('Attacco salvato');
    maybeSyncWeather();
    const day = dateOf(saved.start);
    if (!existing || dateOf(existing.start) !== day) await askDiaryStart(day, prevTrackingStart);
    if (onSaved) onSaved(saved);
  });
  return page;
}

export function openEndEpisodeSheet(ep) {
  const sheet = openSheet({ title: 'Termina attacco', tall: true });
  let end = nowStr();
  if (end < ep.start) end = ep.start;
  let intensity = ep.intensity;
  const meds = ep.meds.map((m) => ({ ...m }));
  const durationEl = h('p', { class: 'muted small', style: { marginTop: '2px' } });
  const paintDuration = () => {
    durationEl.textContent = end >= ep.start ? `Durata: ${formatDuration(minutesBetween(ep.start, end))}` : 'La fine è precedente all’inizio.';
  };
  const endInput = dateTimeInput({
    value: end, min: ep.start, label: 'Fine dell’attacco', onChange: (v) => { if (v) { end = v; paintDuration(); } },
  });
  const medFields = meds.map((m) => field({
    label: `${m.name}: ha funzionato?`,
    control: chipGroup({
      options: MED_EFFECTS.map((e) => ({ value: e.v, label: e.label })),
      value: m.effect,
      onChange: (v) => { m.effect = v; },
    }),
  }));
  const finish = (andEdit) => {
    if (end < ep.start) {
      toast('La fine non può essere prima dell’inizio.', { tone: 'error' });
      return;
    }
    if (end > addMinutes(nowStr(), 5)) {
      toast('La fine non può essere nel futuro.', { tone: 'error' });
      return;
    }
    const saved = store.upsertEpisode({
      ...ep, end, intensity, meds,
    });
    sheet.close();
    toast(`Attacco concluso · durata ${formatDuration(minutesBetween(saved.start, saved.end))}`);
    if (andEdit) openEpisodeEditor({ id: saved.id });
  };
  replaceChildren(
    sheet.body,
    card(
      field({ label: 'Quando è finito?', control: endInput }),
      h('p', { class: 'muted small', style: { marginTop: '10px' } }, `Iniziato ${fmtDateTime(ep.start).toLowerCase()}`),
      durationEl,
    ),
    card(cardTitle('Intensità massima raggiunta'), intensityPicker({ value: intensity, onChange: (v) => { intensity = v; } })),
    meds.length ? card(cardTitle('Farmaci'), ...medFields) : null,
    h('div', { class: 'btn-row' },
      button({ label: 'Altri dettagli', kind: 'secondary', onClick: () => finish(true) }),
      button({ label: 'Termina', kind: 'primary', icon: 'check', onClick: () => finish(false) })),
  );
  paintDuration();
  return sheet;
}
