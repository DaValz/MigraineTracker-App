import { h, replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import { t, tv } from '../i18n.js';
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
    }, t('+ Altro')));
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
  const sheet = openSheet({ title: t('Aggiungi farmaco'), tall: true });
  const search = h('input', {
    class: 'input', type: 'search', placeholder: t('Cerca un farmaco…'), 'aria-label': t('Cerca un farmaco'), autocomplete: 'off', autocapitalize: 'off',
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
    const matches = (m) => [m.name, tv(m.name), m.hint].some((x) => (x || '').toLowerCase().includes(q));
    const filtered = all.filter((m) => !q || matches(m));
    const nodes = [];
    if (!q && recent.length) {
      nodes.push(h('div', { class: 'field-label' }, t('Usati di recente')));
      nodes.push(h('div', { class: 'chips mb' }, recent.map((m) => h('button', { type: 'button', class: 'chip', onclick: () => pick(m) }, tv(m.name)))));
    }
    nodes.push(group(...filtered.map((m) => row({
      icon: 'pill',
      tone: 'green',
      title: tv(m.name),
      subtitle: [medClassLabel(m.cls), m.hint].filter(Boolean).join(' · '),
      onClick: () => pick(m),
    }))));
    if (!filtered.length) nodes.push(h('p', { class: 'muted center small mb' }, t('Nessun risultato.')));
    nodes.push(button({
      label: t('Nuovo farmaco…'),
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
    title: t('Attacco precedente all’inizio del diario'),
    message: t('Finora il diario parte dal {inizio}. Hai registrato tutti gli attacchi anche dal {nuovoInizio}? Se sì, i giorni senza attacchi di quel periodo conteranno come giorni senza emicrania.', { inizio: fmtDateShort(prevStart), nuovoInizio: fmtDateShort(dateStr) }),
    dismissValue: 'isolated',
    stack: true,
    buttons: [
      { label: t('Sì, il diario è completo da qui'), value: 'extend', kind: 'primary' },
      { label: t('No, è un attacco isolato'), value: 'isolated' },
    ],
  });
  if (choice === 'extend') {
    if (s.diaryStart) store.updateSettings({ diaryStart: dateStr });
    toast(t('Diario completo dal {data}', { data: fmtDateShort(dateStr) }));
  } else {
    store.updateSettings({ diaryStart: prevStart });
    toast(t('L’attacco è salvato, ma non cambia le statistiche del periodo precedente'));
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
      nodes.push(h('p', { class: 'muted small', style: { marginBottom: '12px' } }, t('Nessuna terapia di prevenzione registrata per il {data}. Se ne segui una (per esempio anticorpi monoclonali, tossina botulinica o antidepressivi prescritti dal neurologo), aggiungila: potrai vedere se gli attacchi diventano meno frequenti e meno forti.', { data: fmtDateShort(date) })));
      nodes.push(button({
        label: t('Aggiungi la terapia che segui'),
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
      const sub = [t('dal {data}', { data: fmtDateShort(p.start) })];
      if (cd) sub.push(cd.day === 0 ? t('giorno della somministrazione') : t('{n, plural, one {# giorno dall’ultima somministrazione} other {# giorni dall’ultima somministrazione}}', { n: cd.day }));
      nodes.push(h(
        'div',
        { class: 'flex', style: { padding: '2px 0 12px', alignItems: 'flex-start' } }, // i18n-ignore
        h('span', { class: 'row-icon', style: { background: therapyClass(p.cls).color } }, icon(isInjectable(p) ? 'syringe' : 'pill', 17)),
        h('div', { style: { minWidth: '0' } }, h('div', { style: { fontWeight: '600' } }, `${tv(p.name)}${p.dose ? ` · ${p.dose}` : ''}`), h('div', { class: 'muted small' }, sub.join(' · '))),
      ));
    });
    nodes.push(field({
      label: t('Rispetto a prima della terapia, questo attacco è stato…'),
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
      label: t('Nei giorni prima hai saltato o ritardato una dose?'),
      control: chipGroup({
        options: [{ value: false, label: t('No') }, { value: true, label: t('Sì') }],
        value: draft.tx.missed,
        onChange: (v) => {
          draft.tx.missed = v == null ? null : v;
          onChange();
        },
      }),
      hint: t('Facoltativo. Queste risposte servono a capire se la terapia sta funzionando.'),
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

  const saveBtn = h('button', { type: 'button', class: 'bar-btn solid' }, t('Salva'));
  const page = openPage({
    title: existing ? t('Modifica attacco') : t('Nuovo attacco'),
    backLabel: t('Annulla'),
    right: saveBtn,
    onBack: async (p) => {
      if (!isDirty()) {
        p.close();
        return;
      }
      const ok = await confirmDialog({
        title: t('Scartare le modifiche?'), message: t('Le modifiche non salvate andranno perse.'), confirmLabel: t('Scarta'), cancelLabel: t('Continua§edit'), danger: true,
      });
      if (ok) p.close();
    },
  });

  const refreshSave = () => {
    saveBtn.disabled = !draft.intensity;
  };

  // --- intensità
  const intensityCard = card(
    cardTitle(t('Quanto fa male?')),
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
    label: t('Inizio'),
    onChange: (v) => {
      if (!v) return;
      draft.start = v;
      refreshWhen();
    },
  });
  const dayInput = dateInput({
    value: dateOf(draft.start),
    max: todayStr(),
    label: t('Giorno dell’attacco'),
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
    label: t('Fine'),
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
    label: t('Ultimo giorno dell’attacco'),
    onChange: (v) => {
      if (!v) return;
      draft.end = `${v}T12:00`;
      refreshWhen();
    },
  });
  const durationEl = h('p', { class: 'muted small', style: { marginTop: '10px' } });
  const endField = field({ label: t('Fine'), control: endInput });
  const endChips = h('div', { class: 'chips', style: { marginTop: '10px' } }, [1, 2, 4, 8, 12, 24].map((hrs) => h('button', {
    type: 'button',
    class: 'chip',
    onclick: () => {
      const target = addMinutes(draft.start, hrs * 60);
      const limit = nowStr();
      draft.end = target > limit ? (limit >= draft.start ? limit : draft.start) : target;
      endInput.value = draft.end;
      refreshWhen();
    },
  }, t('{h} h', { h: hrs }))));
  const startChips = h('div', { class: 'chips', style: { marginTop: '10px' } }, [
    [0, t('Adesso')], [30, t('{m} min fa', { m: 30 })], [60, t('{h} h fa', { h: 1 })], [120, t('{h} h fa', { h: 2 })], [240, t('{h} h fa', { h: 4 })],
  ].map(([mins, label]) => h('button', {
    type: 'button',
    class: 'chip',
    onclick: () => {
      draft.start = addMinutes(nowStr(), -mins);
      startInput.value = draft.start;
      refreshWhen();
    },
  }, label)));
  const switchRow = (title, sub, control) => {
    const el = h('label', { class: 'row check-row', style: { padding: '12px 0' } }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), sub ? h('span', { class: 'row-sub' }, sub) : null)); // i18n-ignore
    el.appendChild(control);
    return el;
  };
  const ongoingRow = switchRow(t('Attacco ancora in corso'), t('Potrai terminarlo dopo dalla schermata Oggi'), switchControl({
    checked: draft.end == null,
    label: t('Attacco ancora in corso'),
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
  const unknownRow = switchRow(t('Non ricordo l’orario'), t('Per gli attacchi passati: indica solo il giorno'), switchControl({
    checked: draft.timeUnknown,
    label: t('Non ricordo l’orario'),
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
  const durField = field({ label: t('Quanto è durato, più o meno?'), control: durBox, hint: t('Se non lo ricordi, lascia vuoto.') });
  const lastDayField = field({ label: t('Ultimo giorno'), control: lastDayInput });
  const knownStart = h('div', {}, field({ label: t('Inizio'), control: startInput }), existing ? null : startChips);
  const knownEnd = h('div', {}, ongoingRow, endField, endChips);
  const unknownBox = h('div', {}, field({ label: t('Giorno'), control: dayInput }), durField, lastDayField);
  const whenCard = card(cardTitle(t('Quando')), knownStart, unknownBox, unknownRow, knownEnd, durationEl);
  const refreshWhen = () => {
    const tu = draft.timeUnknown;
    knownStart.hidden = tu;
    knownEnd.hidden = tu;
    unknownBox.hidden = !tu;
    lastDayField.hidden = !(tu && draft.approxDur === 'days');
    if (tu) {
      const days = draft.end ? diffDays(dateOf(draft.start), dateOf(draft.end)) + 1 : 1;
      durationEl.textContent = draft.approxDur === 'days' ? t('Durata: {durata}', { durata: t('{n, plural, one {# giorno} other {# giorni}}', { n: days }) }) : '';
      durationEl.hidden = draft.approxDur !== 'days';
    } else {
      durationEl.hidden = false;
      const ongoing = draft.end == null;
      endField.hidden = ongoing;
      endChips.hidden = ongoing;
      if (ongoing) durationEl.textContent = t('In corso');
      else if (draft.end < draft.start) durationEl.textContent = t('La fine è precedente all’inizio.');
      else durationEl.textContent = t('Durata: {durata}', { durata: formatDuration(minutesBetween(draft.start, draft.end)) });
    }
    if (txBox) txBox.refresh();
  };

  // --- farmaci
  const medsBox = h('div');
  const renderMeds = () => {
    const cards = draft.meds.map((m, i) => {
      const medName = tv(m.name);
      const dose = h('input', {
        class: 'input', type: 'text', placeholder: t('Dose (es. 400 mg)'), maxlength: 40, value: m.dose || '', 'aria-label': t('Dose di {farmaco}', { farmaco: medName }), autocomplete: 'off',
      });
      dose.addEventListener('input', () => {
        m.dose = dose.value;
      });
      const when = draft.timeUnknown
        ? dateInput({
          value: dateOf(m.at || draft.start), min: dateOf(draft.start), max: todayStr(), label: t('Giorno di {farmaco}', { farmaco: medName }), onChange: (v) => { if (v) m.at = `${v}T12:00`; },
        })
        : dateTimeInput({ value: m.at || draft.start, label: t('Orario di {farmaco}', { farmaco: medName }), onChange: (v) => { if (v) m.at = v; } });
      return h(
        'div',
        { class: 'med-card' },
        h('div', { class: 'med-head' },
          h('div', {}, h('div', { class: 'med-name' }, medName), h('div', { class: 'med-sub' }, medClassLabel(m.cls))),
          h('button', {
            type: 'button',
            class: 'icon-btn flat',
            'aria-label': t('Rimuovi {farmaco}', { farmaco: medName }),
            onclick: () => {
              draft.meds.splice(i, 1);
              renderMeds();
            },
          }, icon('x', 20))),
        field({ label: draft.timeUnknown ? t('Giorno in cui l’hai preso') : t('Quando l’hai preso'), control: when }),
        field({ label: t('Dose'), control: dose }),
        field({
          label: t('Ha funzionato?'),
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
        label: t('Aggiungi farmaco'),
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
  const medsCard = card(cardTitle(t('Farmaci per l’attacco')), medsBox);

  // --- terapia di prevenzione
  const txBox = therapySection(draft, () => {});
  const txCard = card(cardTitle(t('Terapia di prevenzione')), txBox);

  // --- dettagli opzionali
  const hasContent = (arr) => arr && arr.length > 0;
  const whereCount = () => (draft.type ? 1 : 0) + (draft.side ? 1 : 0) + draft.areas.length + draft.quality.length + draft.aura.length;
  const accWhere = accordion({
    title: t('Dove e come fa male'),
    count: whereCount(),
    open: !!existing && whereCount() > 0,
    children: [
      field({
        label: t('Tipo di mal di testa'),
        control: chipGroup({ options: EPISODE_TYPES.map((e) => ({ value: e.id, label: e.label })), value: draft.type, onChange: (v) => { draft.type = v || ''; accWhere.setCount(whereCount()); } }),
      }),
      field({
        label: t('Lato'),
        control: chipGroup({ options: SIDES.map((s) => ({ value: s.id, label: s.label })), value: draft.side, onChange: (v) => { draft.side = v || ''; accWhere.setCount(whereCount()); } }),
      }),
      field({ label: t('Zona'), control: chipGroup({ options: PAIN_AREAS, value: draft.areas, multi: true, onChange: (v) => { draft.areas = v; accWhere.setCount(whereCount()); } }) }),
      field({ label: t('Che tipo di dolore'), control: chipGroup({ options: PAIN_QUALITY, value: draft.quality, multi: true, onChange: (v) => { draft.quality = v; accWhere.setCount(whereCount()); } }) }),
      field({
        label: t('Aura (disturbi prima o durante il dolore)'),
        control: chipGroup({ options: AURA_TYPES, value: draft.aura, multi: true, onChange: (v) => { draft.aura = v; accWhere.setCount(whereCount()); } }),
        hint: t('Disturbi improvvisi del linguaggio o della forza muscolare, mai provati prima? Chiama il 112.'),
      }),
    ],
  });
  const accSymptoms = accordion({
    title: t('Sintomi associati'),
    count: draft.symptoms.length,
    open: !!existing && hasContent(draft.symptoms),
    children: [listPicker({ kind: 'symptoms', selected: draft.symptoms, onChange: (v) => { draft.symptoms = v; accSymptoms.setCount(v.length); } })],
  });
  const accTriggers = accordion({
    title: t('Fattori scatenanti'),
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
    title: t('Impatto sulla giornata'),
    count: impactCount(),
    open: !!existing && impactCount() > 0,
    children: [
      field({
        label: t('Quanto ha limitato le tue attività?'),
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
        label: t('Lavoro, scuola o impegni'),
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
    title: t('Note'),
    count: draft.note ? 1 : 0,
    open: !!existing && !!draft.note,
    children: [textArea({
      value: draft.note,
      placeholder: t('Cosa stavi facendo, cosa hai notato, cosa ha aiutato…'),
      label: t('Note'),
      onInput: (v) => {
        draft.note = v;
        accNote.setCount(v.trim() ? 1 : 0);
      },
    })],
  });

  const parts = [intensityCard, whenCard, medsCard, txCard, accWhere, accSymptoms, accTriggers, accImpact, accNote];
  if (existing) {
    parts.push(h('div', { class: 'mt' }, button({
      label: t('Elimina attacco'),
      kind: 'danger',
      icon: 'trash',
      block: true,
      onClick: async () => {
        const ok = await confirmDialog({
          title: t('Eliminare questo attacco?'), message: t('Potrai annullare subito dopo.'), confirmLabel: t('Elimina'), danger: true,
        });
        if (!ok) return;
        const removed = store.removeEpisode(existing.id);
        page.close();
        toast(t('Attacco eliminato'), { action: { label: t('Annulla§undo'), onClick: () => store.restoreEpisode(removed) } });
      },
    })));
  }
  replaceChildren(page.body, ...parts);
  refreshWhen();
  refreshSave();

  const validate = () => {
    const n = addMinutes(nowStr(), 5);
    if (!draft.intensity) return t('Scegli l’intensità del dolore.');
    if (!draft.start) return t('Indica quando è iniziato.');
    if (draft.timeUnknown) {
      if (dateOf(draft.start) > todayStr()) return t('Il giorno non può essere nel futuro.');
      if (draft.approxDur === 'days' && draft.end) {
        if (dateOf(draft.end) < dateOf(draft.start)) return t('L’ultimo giorno non può essere prima del primo.');
        if (dateOf(draft.end) > todayStr()) return t('L’ultimo giorno non può essere nel futuro.');
        if (diffDays(dateOf(draft.start), dateOf(draft.end)) > 30) return t('La durata supera i 30 giorni: controlla le date.');
      }
      return null;
    }
    if (draft.start > n) return t('L’inizio non può essere nel futuro.');
    if (draft.end) {
      if (draft.end < draft.start) return t('La fine non può essere prima dell’inizio.');
      if (draft.end > n) return t('La fine non può essere nel futuro.');
      if (minutesBetween(draft.start, draft.end) > 30 * 24 * 60) return t('La durata supera i 30 giorni: controlla le date.');
    }
    const late = draft.meds.find((m) => m.at && m.at > n);
    if (late) return t('L’orario di {farmaco} è nel futuro.', { farmaco: tv(late.name) });
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
      toast(t('Impossibile salvare: controlla i dati inseriti.'), { tone: 'error' });
      return;
    }
    page.close();
    if (!existing && saved.end == null) toast(t('Attacco registrato. Quando passa, toccalo in «Oggi» per terminarlo.'));
    else toast(t('Attacco salvato'));
    maybeSyncWeather();
    const day = dateOf(saved.start);
    if (!existing || dateOf(existing.start) !== day) await askDiaryStart(day, prevTrackingStart);
    if (onSaved) onSaved(saved);
  });
  return page;
}

export function openEndEpisodeSheet(ep) {
  const sheet = openSheet({ title: t('Termina attacco'), tall: true });
  let end = nowStr();
  if (end < ep.start) end = ep.start;
  let intensity = ep.intensity;
  const meds = ep.meds.map((m) => ({ ...m }));
  const durationEl = h('p', { class: 'muted small', style: { marginTop: '2px' } });
  const paintDuration = () => {
    durationEl.textContent = end >= ep.start ? t('Durata: {durata}', { durata: formatDuration(minutesBetween(ep.start, end)) }) : t('La fine è precedente all’inizio.');
  };
  const endInput = dateTimeInput({
    value: end, min: ep.start, label: t('Fine dell’attacco'), onChange: (v) => { if (v) { end = v; paintDuration(); } },
  });
  const medFields = meds.map((m) => field({
    label: t('{farmaco}: ha funzionato?', { farmaco: tv(m.name) }),
    control: chipGroup({
      options: MED_EFFECTS.map((e) => ({ value: e.v, label: e.label })),
      value: m.effect,
      onChange: (v) => { m.effect = v; },
    }),
  }));
  const finish = (andEdit) => {
    if (end < ep.start) {
      toast(t('La fine non può essere prima dell’inizio.'), { tone: 'error' });
      return;
    }
    if (end > addMinutes(nowStr(), 5)) {
      toast(t('La fine non può essere nel futuro.'), { tone: 'error' });
      return;
    }
    const saved = store.upsertEpisode({
      ...ep, end, intensity, meds,
    });
    sheet.close();
    toast(t('Attacco concluso · durata {durata}', { durata: formatDuration(minutesBetween(saved.start, saved.end)) }));
    if (andEdit) openEpisodeEditor({ id: saved.id });
  };
  replaceChildren(
    sheet.body,
    card(
      field({ label: t('Quando è finito?'), control: endInput }),
      h('p', { class: 'muted small', style: { marginTop: '10px' } }, t('Iniziato {quando}', { quando: fmtDateTime(ep.start) })),
      durationEl,
    ),
    card(cardTitle(t('Intensità massima raggiunta')), intensityPicker({ value: intensity, onChange: (v) => { intensity = v; } })),
    meds.length ? card(cardTitle(t('Farmaci')), ...medFields) : null,
    h('div', { class: 'btn-row' },
      button({ label: t('Altri dettagli'), kind: 'secondary', onClick: () => finish(true) }),
      button({ label: t('Termina'), kind: 'primary', icon: 'check', onClick: () => finish(false) })),
  );
  paintDuration();
  return sheet;
}
