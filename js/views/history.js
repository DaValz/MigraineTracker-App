import { h, replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import {
  openPage, openSheet, openDialog, confirmDialog, toast, row, group, section, footnote, field, button, card, cardTitle, chipGroup, stepper, textArea,
  textInput, monthInput, dateInput, toggleRow, intensityPicker, emptyState,
} from '../ui.js';
import {
  SEXES, DIAGNOSES, YES_NO_UNKNOWN, FAMILY_MEMBERS, TYPICAL_DURATIONS, AURA_FREQ, CYCLE_LINK, CONDITIONS, SIDES, PAIN_QUALITY, PAIN_AREAS,
  AURA_TYPES, MED_CLASSES, MED_EFFECTS, DEFAULT_MEDS, medClassLabel, effectLabel,
} from '../data.js';
import { todayStr, monthOf } from '../dates.js';
import { getIndex } from '../analysis.js';
import {
  clinicalSummary, summaryPlainText, historySections, historyCompleteness, fmtMonthRange, fmtFuzzyDate,
} from '../clinical.js';
import { num, plural } from '../format.js';
import { shareText } from '../exporter.js';
import { openTherapies } from './therapies.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const YEAR = () => new Date().getFullYear();

/** Pagina di modifica con Salva/Annulla e conferma se ci sono modifiche. */
function editPage({ title, draft, build, onSave }) {
  const initial = JSON.stringify(draft);
  const saveBtn = h('button', { type: 'button', class: 'bar-btn solid' }, 'Salva');
  const page = openPage({
    title,
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
  replaceChildren(page.body, ...build(draft));
  saveBtn.addEventListener('click', () => {
    try {
      if (onSave(draft) === false) return;
    } catch (e) {
      toast(e.message || 'Impossibile salvare', { tone: 'error' });
      return;
    }
    page.close();
    toast('Salvato');
  });
  return page;
}

function yearSelect({ value, onChange, label, from = 1930, to = YEAR(), empty = 'Non indicato' }) {
  const sel = h('select', { class: 'input select', 'aria-label': label }, h('option', { value: '' }, empty));
  for (let y = to; y >= from; y -= 1) sel.appendChild(h('option', { value: String(y) }, String(y)));
  sel.value = value ? String(value) : '';
  sel.addEventListener('change', () => onChange(sel.value ? Number(sel.value) : null));
  return sel;
}

function multiWithCustom({ base, selected, onChange, addLabel = '+ Altro', placeholder = '' }) {
  const box = h('div');
  let sel = [...selected];
  const render = () => {
    const opts = [...base, ...sel.filter((x) => !base.includes(x))];
    const chips = chipGroup({ options: opts, value: sel, multi: true, onChange: (v) => { sel = v; onChange(v); } });
    const input = h('input', { class: 'input', maxlength: 60, placeholder, 'aria-label': 'Aggiungi voce' });
    const add = h('button', { type: 'button', class: 'chip add' }, addLabel);
    add.addEventListener('click', async () => {
      const v = await openDialog({
        title: 'Aggiungi', content: h('div', { class: 'dlg-content' }, input), dismissValue: null, buttons: [{ label: 'Annulla', value: null }, { label: 'Aggiungi', kind: 'primary', onClick: (done) => done(input.value.trim()) }],
      });
      if (v && !sel.includes(v)) {
        sel = [...sel, v];
        onChange(sel);
      }
      render();
    });
    chips.appendChild(add);
    replaceChildren(box, chips);
  };
  render();
  return box;
}

/* ---------- sezioni ---------- */

function openProfileEditor() {
  const hst = store.getDb().history;
  const draft = {
    birthYear: hst.birthYear, sex: hst.sex, onsetAge: hst.onsetAge, diagnoses: [...hst.diagnoses], diagYear: hst.diagYear, diagBy: hst.diagBy,
  };
  return editPage({
    title: 'Chi sono',
    draft,
    build: (d) => [
      card(
        field({ label: 'Anno di nascita', control: yearSelect({ value: d.birthYear, label: 'Anno di nascita', onChange: (v) => { d.birthYear = v; } }) }),
        field({ label: 'Sesso', control: chipGroup({ options: SEXES.map((s) => ({ value: s.id, label: s.label })), value: d.sex, onChange: (v) => { d.sex = v || ''; } }) }),
        field({
          label: 'A che età è iniziato il mal di testa?',
          control: stepper({
            value: d.onsetAge, min: 0, max: 100, start: 15, unit: 'anni', label: 'età di esordio', onChange: (v) => { d.onsetAge = v; },
          }),
        }),
      ),
      card(
        cardTitle('Diagnosi ricevute'),
        field({
          label: 'Cosa ti hanno diagnosticato?',
          control: multiWithCustom({ base: DIAGNOSES, selected: d.diagnoses, onChange: (v) => { d.diagnoses = v; }, placeholder: 'es. Nevralgia occipitale' }),
          hint: 'Scegli solo le diagnosi fatte da un medico. Se non hai una diagnosi, lascia vuoto.',
        }),
        field({ label: 'Anno della diagnosi', control: yearSelect({ value: d.diagYear, label: 'Anno della diagnosi', onChange: (v) => { d.diagYear = v; } }) }),
        field({
          label: 'Fatta da',
          control: textInput({
            value: d.diagBy, placeholder: 'es. Centro cefalee, Ospedale…', label: 'Diagnosi fatta da', onInput: (v) => { d.diagBy = v; },
          }),
        }),
      ),
    ],
    onSave: (d) => store.updateHistory(d),
  });
}

function openTypicalEditor() {
  const t = clone(store.getDb().history.typical);
  const draft = { ...t };
  const auraTypesField = () => field({ label: 'Che tipo di aura', control: chipGroup({ options: AURA_TYPES, value: draft.auraTypes, multi: true, onChange: (v) => { draft.auraTypes = v; } }) });
  const auraBox = h('div');
  const paintAura = () => replaceChildren(auraBox, draft.aura && draft.aura !== 'never' ? auraTypesField() : null);
  paintAura();
  return editPage({
    title: 'Il mio mal di testa',
    draft,
    build: (d) => [
      h('p', { class: 'page-intro' }, 'Descrivi l’attacco tipico, quello che ti capita più spesso.'),
      card(cardTitle('Intensità abituale'), intensityPicker({ value: d.intensity, onChange: (v) => { d.intensity = v; } })),
      card(
        field({ label: 'Quanto dura di solito (senza farmaci o se non funzionano)', control: chipGroup({ options: TYPICAL_DURATIONS.map((x) => ({ value: x.id, label: x.label })), value: d.duration, onChange: (v) => { d.duration = v || ''; } }) }),
        field({ label: 'Lato', control: chipGroup({ options: SIDES.map((s) => ({ value: s.id, label: s.label })), value: d.side, onChange: (v) => { d.side = v || ''; } }) }),
        field({ label: 'Zona', control: chipGroup({ options: PAIN_AREAS, value: d.areas, multi: true, onChange: (v) => { d.areas = v; } }) }),
        field({ label: 'Che tipo di dolore', control: chipGroup({ options: PAIN_QUALITY, value: d.quality, multi: true, onChange: (v) => { d.quality = v; } }) }),
        field({ label: 'Peggiora con il movimento (scale, piegarsi, camminare)?', control: chipGroup({ options: YES_NO_UNKNOWN.map((x) => ({ value: x.id, label: x.label })), value: d.activity, onChange: (v) => { d.activity = v || ''; } }) }),
      ),
      card(
        field({
          label: 'Aura (disturbi visivi o sensitivi prima del dolore)',
          control: chipGroup({
            options: AURA_FREQ.map((x) => ({ value: x.id, label: x.label })),
            value: d.aura,
            onChange: (v) => {
              d.aura = v || '';
              paintAura();
            },
          }),
        }),
        auraBox,
      ),
      card(
        field({ label: 'Sintomi che lo accompagnano', control: multiWithCustom({ base: store.listOptions('symptoms'), selected: d.symptoms, onChange: (v) => { d.symptoms = v; } }) }),
        field({ label: 'Cosa lo scatena, secondo te', control: multiWithCustom({ base: store.listOptions('triggers'), selected: d.triggers, onChange: (v) => { d.triggers = v; } }) }),
      ),
    ],
    onSave: (d) => store.updateHistory({ typical: d }),
  });
}

function openHealthEditor() {
  const hs = store.getDb().history;
  const draft = {
    conditions: [...hs.conditions], conditionsNote: hs.conditionsNote, allergies: hs.allergies, otherMeds: hs.otherMeds, famKnown: hs.famKnown, family: [...hs.family], cycleLink: hs.cycleLink, contraception: hs.contraception,
  };
  const famBox = h('div');
  const paintFam = () => replaceChildren(famBox, draft.famKnown === 'yes' ? field({ label: 'Chi?', control: chipGroup({ options: FAMILY_MEMBERS, value: draft.family, multi: true, onChange: (v) => { draft.family = v; } }) }) : null);
  paintFam();
  const showCycle = hs.sex !== 'm';
  return editPage({
    title: 'Salute generale',
    draft,
    build: (d) => [
      card(
        cardTitle('In famiglia'),
        field({
          label: 'Qualcuno in famiglia soffre di emicrania o mal di testa?',
          control: chipGroup({
            options: YES_NO_UNKNOWN.map((x) => ({ value: x.id, label: x.label })),
            value: d.famKnown,
            onChange: (v) => {
              d.famKnown = v || '';
              if (d.famKnown !== 'yes') d.family = [];
              paintFam();
            },
          }),
        }),
        famBox,
      ),
      card(
        cardTitle('Altre condizioni'),
        field({ label: 'Hai anche…', control: multiWithCustom({ base: CONDITIONS, selected: d.conditions, onChange: (v) => { d.conditions = v; } }) }),
        field({
          label: 'Dettagli',
          control: textArea({
            value: d.conditionsNote, placeholder: 'Interventi, problemi di salute importanti…', label: 'Dettagli sulle altre condizioni', maxLength: 1000, onInput: (v) => { d.conditionsNote = v; },
          }),
        }),
      ),
      card(
        field({
          label: 'Allergie o intolleranze a farmaci',
          control: textArea({
            value: d.allergies, rows: 2, placeholder: 'es. Allergia all’acido acetilsalicilico', label: 'Allergie', maxLength: 600, onInput: (v) => { d.allergies = v; },
          }),
        }),
        field({
          label: 'Altri farmaci che prendi regolarmente',
          control: textArea({
            value: d.otherMeds, rows: 2, placeholder: 'es. Levotiroxina 50 mcg', label: 'Altri farmaci', maxLength: 600, onInput: (v) => { d.otherMeds = v; },
          }),
        }),
      ),
      showCycle ? card(
        cardTitle('Ciclo e ormoni'),
        field({ label: 'Gli attacchi sono legati al ciclo mestruale?', control: chipGroup({ options: CYCLE_LINK.map((x) => ({ value: x.id, label: x.label })), value: d.cycleLink, onChange: (v) => { d.cycleLink = v || ''; } }) }),
        field({
          label: 'Contraccezione o terapia ormonale',
          control: textInput({
            value: d.contraception, placeholder: 'es. Pillola estroprogestinica (lascia vuoto se nessuna)', label: 'Contraccezione ormonale', onInput: (v) => { d.contraception = v; },
          }),
        }),
      ) : null,
    ],
    onSave: (d) => store.updateHistory(d),
  });
}

const PROMPTS = [
  'Quando è iniziato e com’era all’inizio',
  'Come sono cambiati gli attacchi negli anni (gravidanze, lavoro, periodi di stress…)',
  'Gli attacchi più forti che ricordi',
  'Cosa hai provato e cosa ha funzionato',
  'Quanto incide sulla tua vita e cosa ti preoccupa',
  'Cosa vorresti chiedere al medico',
];

function openNarrativeEditor() {
  const draft = { narrative: store.getDb().history.narrative };
  const count = h('p', { class: 'field-hint', style: { textAlign: 'right' } });
  const paint = () => {
    const words = draft.narrative.trim() ? draft.narrative.trim().split(/\s+/).length : 0;
    count.textContent = `${plural(words, 'parola', 'parole')}`;
  };
  paint();
  return editPage({
    title: 'Il mio racconto',
    draft,
    build: (d) => [
      h('p', { class: 'page-intro' }, 'Racconta con parole tue la tua storia con il mal di testa, come faresti con il neurologo. Il testo viene riportato nella sintesi clinica e nel report.'),
      card(
        cardTitle('Puoi parlare di'),
        h('ul', { class: 'bullets', style: { marginBottom: '0' } }, PROMPTS.map((t) => h('li', {}, t))),
      ),
      card(
        textArea({
          value: d.narrative, rows: 12, tall: true, maxLength: 12000, label: 'Il mio racconto', placeholder: 'Ho cominciato ad avere mal di testa a…', onInput: (v) => { d.narrative = v; paint(); },
        }),
        count,
      ),
    ],
    onSave: (d) => store.updateHistory(d),
  });
}

/* ---------- periodi di frequenza ---------- */

function openPeriodSheet(existing = null, onDone = null) {
  const sheet = openSheet({ title: existing ? 'Modifica periodo' : 'Nuovo periodo', tall: true });
  const cur = monthOf(todayStr());
  const d = existing ? clone(existing) : {
    from: `${YEAR() - 3}-01`, to: null, days: null, intensity: null, acute: null, note: '',
  };
  const toBox = h('div');
  const ongoing = toggleRow({
    title: 'Fino a oggi',
    subtitle: 'Il periodo continua ancora',
    checked: !d.to,
    onChange: (on) => {
      d.to = on ? null : (d.to || cur);
      paintTo();
    },
  });
  const paintTo = () => replaceChildren(toBox, d.to ? field({ label: 'Fino a', control: monthInput({ value: d.to, label: 'Fine del periodo', onChange: (v) => { d.to = v || d.to; } }) }) : null);
  paintTo();
  replaceChildren(
    sheet.body,
    h('p', { class: 'muted small mb' }, 'Una stima va benissimo: ad esempio «dal 2016 al 2019 circa 4 giorni al mese».'),
    card(
      field({ label: 'Dal', control: monthInput({ value: d.from, label: 'Inizio del periodo', onChange: (v) => { if (v) d.from = v; } }) }),
      group(ongoing),
      toBox,
    ),
    card(
      field({
        label: 'Giorni con mal di testa al mese (circa)',
        control: stepper({
          value: d.days, min: 0, max: 31, step: 1, start: 4, label: 'giorni con mal di testa al mese', onChange: (v) => { d.days = v; },
        }),
      }),
      field({
        label: 'Intensità media (facoltativa)',
        control: stepper({
          value: d.intensity, min: 1, max: 10, step: 1, start: 6, label: 'intensità media', onChange: (v) => { d.intensity = v; },
        }),
      }),
      field({
        label: 'Giorni al mese con antidolorifici (facoltativo)',
        control: stepper({
          value: d.acute, min: 0, max: 31, step: 1, start: 2, label: 'giorni al mese con antidolorifici', onChange: (v) => { d.acute = v; },
        }),
      }),
      field({
        label: 'Note',
        control: textInput({
          value: d.note, placeholder: 'es. Periodo dell’università, molto stress', maxLength: 300, label: 'Note sul periodo', onInput: (v) => { d.note = v; },
        }),
      }),
    ),
    h('div', { class: 'today-actions' },
      button({
        label: 'Salva periodo',
        kind: 'primary',
        block: true,
        onClick: () => {
          if (d.days == null) {
            toast('Indica quanti giorni al mese, anche a stima.', { tone: 'error' });
            return;
          }
          if (d.to && d.to < d.from) {
            toast('La fine non può essere prima dell’inizio.', { tone: 'error' });
            return;
          }
          if (d.from > cur) {
            toast('Il periodo non può iniziare nel futuro.', { tone: 'error' });
            return;
          }
          store.upsertHistoryItem('periods', d);
          sheet.close();
          toast('Periodo salvato');
          if (onDone) onDone();
        },
      }),
      existing ? button({
        label: 'Elimina periodo',
        kind: 'danger',
        block: true,
        onClick: () => {
          const removed = store.removeHistoryItem('periods', existing.id);
          sheet.close();
          toast('Periodo eliminato', { action: { label: 'Annulla', onClick: () => store.upsertHistoryItem('periods', removed) } });
          if (onDone) onDone();
        },
      }) : null),
  );
  return sheet;
}

function openPeriods() {
  const page = openPage({ title: 'Frequenza negli anni' });
  const render = () => {
    const hs = store.getDb().history;
    const rows = [...hs.periods].reverse().map((p) => row({
      icon: 'chart-line',
      tone: 'indigo',
      title: fmtMonthRange(p.from, p.to),
      subtitle: [`circa ${num(p.days)} giorni al mese`, p.intensity != null ? `intensità ${num(p.intensity)}/10` : '', p.acute != null ? `antidolorifici ${num(p.acute)} gg/mese` : '', p.note].filter(Boolean).join(' · '),
      chevron: true,
      onClick: () => openPeriodSheet(p, render),
    }));
    replaceChildren(
      page.body,
      h('p', { class: 'page-intro' }, 'Dividi la tua storia in periodi e indica, per ognuno, quanti giorni al mese avevi mal di testa. Così non devi ricompilare il diario del passato: queste stime vengono usate nel grafico dell’andamento e come punto di partenza per valutare le terapie.'),
      rows.length ? group(...rows) : emptyState({ icon: 'chart-line', title: 'Nessun periodo', text: 'Inizia dal periodo più lontano che ricordi.' }),
      group(row({ icon: 'plus', tone: 'green', title: 'Aggiungi un periodo', onClick: () => openPeriodSheet(null, render) })),
    );
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}

/* ---------- episodi significativi ---------- */

function openEventSheet(existing = null, onDone = null) {
  const sheet = openSheet({ title: existing ? 'Modifica episodio' : 'Episodio significativo', tall: true });
  const d = existing ? clone(existing) : {
    date: monthOf(todayStr()), title: '', text: '', intensity: null, er: false, hosp: false,
  };
  let precision = d.date.length === 10 ? 'day' : d.date.length === 7 ? 'month' : 'year';
  const dateBox = h('div');
  const paintDate = () => {
    let ctl;
    if (precision === 'day') {
      ctl = dateInput({ value: d.date.length === 10 ? d.date : `${d.date.slice(0, 7).padEnd(7, '-01').slice(0, 7)}-01`, max: todayStr(), label: 'Data', onChange: (v) => { if (v) d.date = v; } });
      if (d.date.length !== 10) d.date = ctl.value || todayStr();
    } else if (precision === 'month') {
      if (d.date.length !== 7) d.date = d.date.length === 10 ? d.date.slice(0, 7) : `${d.date.slice(0, 4)}-01`;
      ctl = monthInput({ value: d.date, label: 'Mese', onChange: (v) => { if (v) d.date = v; } });
    } else {
      d.date = d.date.slice(0, 4);
      ctl = yearSelect({ value: Number(d.date), label: 'Anno', empty: 'Anno', onChange: (v) => { if (v) d.date = String(v); } });
    }
    replaceChildren(dateBox, ctl);
  };
  paintDate();
  replaceChildren(
    sheet.body,
    card(
      field({
        label: 'Quando',
        control: h('div', {}, chipGroup({
          options: [{ value: 'day', label: 'Giorno preciso' }, { value: 'month', label: 'Mese' }, { value: 'year', label: 'Solo l’anno' }],
          value: precision,
          allowClear: false,
          onChange: (v) => {
            precision = v;
            paintDate();
          },
        }), h('div', { style: { marginTop: '10px' } }, dateBox)),
      }),
      field({
        label: 'Titolo',
        control: textInput({
          value: d.title, placeholder: 'es. Attacco di 4 giorni, pronto soccorso', maxLength: 120, label: 'Titolo dell’episodio', onInput: (v) => { d.title = v; },
        }),
      }),
      field({
        label: 'Cosa è successo',
        control: textArea({
          value: d.text, rows: 5, maxLength: 3000, label: 'Descrizione dell’episodio', placeholder: 'Sintomi, durata, cure ricevute, cosa ha detto il medico…', onInput: (v) => { d.text = v; },
        }),
      }),
      field({
        label: 'Intensità (facoltativa)',
        control: stepper({
          value: d.intensity, min: 1, max: 10, start: 8, label: 'intensità', onChange: (v) => { d.intensity = v; },
        }),
      }),
    ),
    group(
      toggleRow({ icon: 'hospital', tone: 'red', title: 'Sono andato al pronto soccorso', checked: d.er, onChange: (v) => { d.er = v; } }),
      toggleRow({ icon: 'hospital', tone: 'orange', title: 'Sono stato ricoverato', checked: d.hosp, onChange: (v) => { d.hosp = v; } }),
    ),
    h('div', { class: 'today-actions' },
      button({
        label: 'Salva episodio',
        kind: 'primary',
        block: true,
        onClick: () => {
          if (!d.title.trim() && !d.text.trim()) {
            toast('Scrivi almeno un titolo.', { tone: 'error' });
            return;
          }
          store.upsertHistoryItem('events', d);
          sheet.close();
          toast('Episodio salvato');
          if (onDone) onDone();
        },
      }),
      existing ? button({
        label: 'Elimina episodio',
        kind: 'danger',
        block: true,
        onClick: () => {
          const removed = store.removeHistoryItem('events', existing.id);
          sheet.close();
          toast('Episodio eliminato', { action: { label: 'Annulla', onClick: () => store.upsertHistoryItem('events', removed) } });
          if (onDone) onDone();
        },
      }) : null),
  );
  return sheet;
}

function openEvents() {
  const page = openPage({ title: 'Episodi significativi' });
  const render = () => {
    const list = [...store.getDb().history.events].sort((a, b) => (a.date < b.date ? 1 : -1));
    replaceChildren(
      page.body,
      h('p', { class: 'page-intro' }, 'Gli attacchi più importanti del passato: quelli più lunghi o più forti, gli accessi in pronto soccorso, i ricoveri, gli episodi diversi dal solito. Restano nella tua storia senza alterare le statistiche del diario.'),
      list.length ? group(...list.map((e) => row({
        icon: e.er || e.hosp ? 'hospital' : 'flag',
        tone: e.er || e.hosp ? 'red' : 'orange',
        title: e.title,
        subtitle: [fmtFuzzyDate(e.date), e.intensity ? `intensità ${e.intensity}/10` : '', e.er ? 'pronto soccorso' : '', e.hosp ? 'ricovero' : ''].filter(Boolean).join(' · '),
        chevron: true,
        onClick: () => openEventSheet(e, render),
      }))) : emptyState({ icon: 'flag', title: 'Nessun episodio', text: 'Aggiungi gli attacchi che ricordi meglio, anche solo con l’anno.' }),
      group(row({ icon: 'plus', tone: 'green', title: 'Aggiungi un episodio', onClick: () => openEventSheet(null, render) })),
    );
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}

/* ---------- farmaci per l'attacco già provati ---------- */

function openAcuteSheet(existing = null, onDone = null) {
  const sheet = openSheet({ title: existing ? 'Modifica farmaco' : 'Farmaco provato', tall: true });
  const d = existing ? clone(existing) : {
    name: '', cls: 'other', effect: null, note: '',
  };
  const nameInput = textInput({
    value: d.name, placeholder: 'Nome del farmaco', maxLength: 80, label: 'Nome del farmaco', onInput: (v) => { d.name = v; },
  });
  const clsSel = h('select', { class: 'input select', 'aria-label': 'Tipo di farmaco' }, MED_CLASSES.map((c) => h('option', { value: c.id }, c.label)));
  clsSel.value = d.cls;
  clsSel.addEventListener('change', () => { d.cls = clsSel.value; });
  replaceChildren(
    sheet.body,
    card(
      field({ label: 'Farmaco', control: nameInput }),
      existing ? null : h('div', { class: 'chips', style: { margin: '-6px 0 16px' } }, DEFAULT_MEDS.slice(0, 14).map((m) => h('button', {
        type: 'button',
        class: 'chip',
        onclick: () => {
          d.name = m.name;
          nameInput.value = m.name;
          d.cls = m.cls;
          clsSel.value = m.cls;
        },
      }, m.name))),
      field({ label: 'Tipo', control: clsSel }),
      field({ label: 'Come funzionava', control: chipGroup({ options: MED_EFFECTS.map((e) => ({ value: e.v, label: e.label })), value: d.effect, onChange: (v) => { d.effect = v; } }) }),
      field({
        label: 'Note',
        control: textInput({
          value: d.note, placeholder: 'es. Effetti collaterali, dose', maxLength: 200, label: 'Note sul farmaco', onInput: (v) => { d.note = v; },
        }),
      }),
    ),
    h('div', { class: 'today-actions' },
      button({
        label: 'Salva',
        kind: 'primary',
        block: true,
        onClick: () => {
          if (!d.name.trim()) {
            toast('Scrivi il nome del farmaco.', { tone: 'error' });
            return;
          }
          store.upsertHistoryItem('acute', d);
          sheet.close();
          if (onDone) onDone();
        },
      }),
      existing ? button({
        label: 'Elimina',
        kind: 'danger',
        block: true,
        onClick: () => {
          store.removeHistoryItem('acute', existing.id);
          sheet.close();
          if (onDone) onDone();
        },
      }) : null),
  );
}

function openAcute() {
  const page = openPage({ title: 'Farmaci per l’attacco' });
  const render = () => {
    const list = store.getDb().history.acute;
    replaceChildren(
      page.body,
      h('p', { class: 'page-intro' }, 'Antidolorifici, triptani e altri farmaci per l’attacco che hai provato in passato, con il risultato. Quelli che usi oggi li registri direttamente negli attacchi.'),
      list.length ? group(...list.map((a) => row({
        icon: 'pill',
        tone: 'green',
        title: a.name,
        subtitle: [medClassLabel(a.cls), a.effect != null ? `effetto: ${effectLabel(a.effect).toLowerCase()}` : '', a.note].filter(Boolean).join(' · '),
        chevron: true,
        onClick: () => openAcuteSheet(a, render),
      }))) : emptyState({ icon: 'pill', title: 'Nessun farmaco', text: 'Aggiungi i farmaci che hai già provato.' }),
      group(row({ icon: 'plus', tone: 'green', title: 'Aggiungi un farmaco', onClick: () => openAcuteSheet(null, render) })),
    );
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}

/* ---------- sintesi clinica ---------- */

export function openClinicalSummary() {
  const page = openPage({ title: 'Sintesi clinica' });
  const render = () => {
    const db = store.getDb();
    const today = todayStr();
    const idx = getIndex(db, store.getRev(), today);
    const sum = clinicalSummary(idx, db, today);
    const nodes = [];
    nodes.push(h('p', { class: 'page-intro' }, 'Un riassunto in stile anamnesi costruito con la tua storia e con il diario, da leggere o mostrare al neurologo.'));
    if (sum.observations.length) {
      nodes.push(card(
        cardTitle('Cosa emerge'),
        ...sum.observations.map((o) => h('div', { class: 'insight' }, h('span', { class: `row-icon ${o.tone === 'good' ? 'green' : o.tone === 'warn' ? 'orange' : 'blue'}` }, icon(o.icon, 16)), h('p', {}, o.text))),
      ));
    }
    if (sum.blocks.length) {
      nodes.push(card(...sum.blocks.map((b) => h('div', { class: 'summary-block' }, h('h4', {}, b.title), h('p', {}, b.text)))));
    } else {
      nodes.push(emptyState({
        icon: 'book', title: 'Ancora nessun dato', text: 'Compila «La mia storia» o registra qualche attacco: la sintesi si costruisce da sola.', action: button({ label: 'Compila la mia storia', onClick: () => { page.close(); openHistory(); } }),
      }));
    }
    nodes.push(h('div', { class: 'today-actions mb' },
      button({
        label: 'Condividi il testo',
        kind: 'secondary',
        icon: 'share',
        block: true,
        onClick: async () => {
          const r = await shareText({ text: summaryPlainText(sum, { name: db.settings.name, today }), title: 'Sintesi clinica' });
          if (r === 'copied') toast('Sintesi copiata negli appunti');
        },
      }),
      button({
        label: 'Crea il PDF per il medico',
        kind: 'primary',
        icon: 'file',
        block: true,
        onClick: async () => {
          const { openReport } = await import('./report.js');
          openReport();
        },
      })));
    nodes.push(footnote('La sintesi è generata automaticamente con regole prudenti, solo con i dati che hai inserito. Non è una diagnosi e non sostituisce la visita.'));
    replaceChildren(page.body, ...nodes);
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}

/* ---------- pagina principale ---------- */

function summaryOf(id, db) {
  const hs = db.history;
  const t = hs.typical;
  switch (id) {
    case 'profile': {
      const bits = [];
      if (hs.onsetAge != null) bits.push(`esordio a ${hs.onsetAge} anni`);
      if (hs.diagnoses.length) bits.push(hs.diagnoses.join(', '));
      return bits.join(' · ') || 'Età, esordio, diagnosi ricevute';
    }
    case 'typical': {
      const bits = [];
      if (t.intensity) bits.push(`intensità ${t.intensity}/10`);
      if (t.quality.length) bits.push(t.quality.join(', ').toLowerCase());
      if (t.symptoms.length) bits.push(plural(t.symptoms.length, 'sintomo', 'sintomi'));
      return bits.join(' · ') || 'Come è di solito un attacco';
    }
    case 'periods': return hs.periods.length ? `${plural(hs.periods.length, 'periodo', 'periodi')} · ${fmtMonthRange(hs.periods[0].from, hs.periods[hs.periods.length - 1].to)}` : 'Quanti giorni al mese, negli anni';
    case 'therapies': return db.preventives.length ? plural(db.preventives.length, 'terapia', 'terapie') : 'Terapie di prevenzione attuali e passate';
    case 'acute': return hs.acute.length ? plural(hs.acute.length, 'farmaco', 'farmaci') : 'Antidolorifici e triptani già provati';
    case 'events': return hs.events.length ? plural(hs.events.length, 'episodio', 'episodi') : 'Attacchi importanti, pronto soccorso';
    case 'health': return [hs.famKnown === 'yes' ? 'familiarità' : '', hs.conditions.length ? plural(hs.conditions.length, 'condizione', 'condizioni') : '', hs.allergies ? 'allergie' : ''].filter(Boolean).join(' · ') || 'Familiarità, altre malattie, allergie, ormoni';
    case 'narrative': return hs.narrative ? `${hs.narrative.slice(0, 60)}${hs.narrative.length > 60 ? '…' : ''}` : 'Con parole tue, come dal neurologo';
    default: return '';
  }
}

export function openHistory() {
  const page = openPage({ title: 'La mia storia' });
  const render = () => {
    const top = page.body.scrollTop;
    const db = store.getDb();
    const done = new Map(historySections(db).map((s) => [s.id, s.done]));
    const comp = historyCompleteness(db);
    const item = (id, ic, tone, title, onClick) => row({
      icon: ic, tone, title, subtitle: summaryOf(id, db), right: done.get(id) ? h('span', { style: { color: 'var(--green)' }, 'aria-label': 'compilata' }, icon('check-circle', 20)) : null, chevron: true, onClick,
    });
    replaceChildren(
      page.body,
      h('p', { class: 'page-intro' }, 'Racconta la tua situazione fino a oggi, come alla prima visita dal neurologo. Non serve ricompilare il diario del passato: queste informazioni entrano nelle analisi, nella sintesi clinica e nel report.'),
      card(
        h('div', { class: 'flex' },
          h('span', { class: 'progress-ring', style: { '--p': String(Math.round((comp.done / comp.total) * 100)) }, 'data-label': `${comp.done}/${comp.total}` }),
          h('div', {}, h('div', { style: { fontWeight: '600' } }, comp.done === comp.total ? 'Storia completa' : 'Completa la tua storia'), h('div', { class: 'muted small' }, `${plural(comp.done, 'sezione compilata', 'sezioni compilate')} su ${comp.total}. Puoi compilarle in qualsiasi ordine.`))),
      ),
      section('Il mio mal di testa', group(
        item('profile', 'person', 'blue', 'Chi sono e diagnosi', openProfileEditor),
        item('typical', 'activity', 'indigo', 'Com’è un attacco tipico', openTypicalEditor),
        item('periods', 'chart-line', 'purple', 'Frequenza negli anni', () => openPeriods()),
        item('events', 'flag', 'orange', 'Episodi significativi', () => openEvents()),
      )),
      section('Cure', group(
        item('therapies', 'shield', 'green', 'Terapie di prevenzione', () => openTherapies()),
        row({
          icon: 'pill', tone: 'teal', title: 'Farmaci per l’attacco già provati', subtitle: summaryOf('acute', db), chevron: true, onClick: () => openAcute(),
        }),
      )),
      section('Il resto', group(
        item('health', 'heart', 'pink', 'Salute generale', openHealthEditor),
        item('narrative', 'edit', 'gray', 'Il mio racconto', openNarrativeEditor),
      )),
      button({ label: 'Leggi la sintesi clinica', kind: 'primary', icon: 'sparkles', block: true, onClick: () => openClinicalSummary() }),
      h('div', { class: 'mt' }, footnote('Tutto resta su questo telefono. Nel report per il medico puoi scegliere se includere la storia.')),
    );
    page.body.scrollTop = top;
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}
