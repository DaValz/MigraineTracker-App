import { h, replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import { t, tv } from '../i18n.js';
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
import { num } from '../format.js';
import { shareText } from '../exporter.js';
import { openTherapies } from './therapies.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const YEAR = () => new Date().getFullYear();

/** Pagina di modifica con Salva/Annulla e conferma se ci sono modifiche. */
function editPage({ title, draft, build, onSave }) {
  const initial = JSON.stringify(draft);
  const saveBtn = h('button', { type: 'button', class: 'bar-btn solid' }, t('Salva'));
  const page = openPage({
    title,
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
  replaceChildren(page.body, ...build(draft));
  saveBtn.addEventListener('click', () => {
    try {
      if (onSave(draft) === false) return;
    } catch (e) {
      toast(e.message || t('Impossibile salvare'), { tone: 'error' });
      return;
    }
    page.close();
    toast(t('Salvato'));
  });
  return page;
}

function yearSelect({ value, onChange, label, from = 1930, to = YEAR(), empty = t('Non indicato') }) {
  const sel = h('select', { class: 'input select', 'aria-label': label }, h('option', { value: '' }, empty));
  for (let y = to; y >= from; y -= 1) sel.appendChild(h('option', { value: String(y) }, String(y)));
  sel.value = value ? String(value) : '';
  sel.addEventListener('change', () => onChange(sel.value ? Number(sel.value) : null));
  return sel;
}

function multiWithCustom({ base, selected, onChange, addLabel = t('+ Altro'), placeholder = '' }) {
  const box = h('div');
  let sel = [...selected];
  const render = () => {
    const opts = [...base, ...sel.filter((x) => !base.includes(x))];
    const chips = chipGroup({ options: opts, value: sel, multi: true, onChange: (v) => { sel = v; onChange(v); } });
    const input = h('input', { class: 'input', maxlength: 60, placeholder, 'aria-label': t('Aggiungi voce') });
    const add = h('button', { type: 'button', class: 'chip add' }, addLabel);
    add.addEventListener('click', async () => {
      const v = await openDialog({
        title: t('Aggiungi'), content: h('div', { class: 'dlg-content' }, input), dismissValue: null, buttons: [{ label: t('Annulla'), value: null }, { label: t('Aggiungi'), kind: 'primary', onClick: (done) => done(input.value.trim()) }],
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
    title: t('Chi sono'),
    draft,
    build: (d) => [
      card(
        field({ label: t('Anno di nascita'), control: yearSelect({ value: d.birthYear, label: t('Anno di nascita'), onChange: (v) => { d.birthYear = v; } }) }),
        field({ label: t('Sesso'), control: chipGroup({ options: SEXES.map((s) => ({ value: s.id, label: s.label })), value: d.sex, onChange: (v) => { d.sex = v || ''; } }) }),
        field({
          label: t('A che età è iniziato il mal di testa?'),
          control: stepper({
            value: d.onsetAge, min: 0, max: 100, start: 15, format: (v) => t('{n, plural, one {# anno} other {# anni}}', { n: v }), label: t('età di esordio'), onChange: (v) => { d.onsetAge = v; },
          }),
        }),
      ),
      card(
        cardTitle(t('Diagnosi ricevute')),
        field({
          label: t('Cosa ti hanno diagnosticato?'),
          control: multiWithCustom({ base: DIAGNOSES, selected: d.diagnoses, onChange: (v) => { d.diagnoses = v; }, placeholder: t('es. Nevralgia occipitale') }),
          hint: t('Scegli solo le diagnosi fatte da un medico. Se non hai una diagnosi, lascia vuoto.'),
        }),
        field({ label: t('Anno della diagnosi'), control: yearSelect({ value: d.diagYear, label: t('Anno della diagnosi'), onChange: (v) => { d.diagYear = v; } }) }),
        field({
          label: t('Fatta da'),
          control: textInput({
            value: d.diagBy, placeholder: t('es. Centro cefalee, Ospedale…'), label: t('Diagnosi fatta da'), onInput: (v) => { d.diagBy = v; },
          }),
        }),
      ),
    ],
    onSave: (d) => store.updateHistory(d),
  });
}

function openTypicalEditor() {
  const typical = clone(store.getDb().history.typical);
  const draft = { ...typical };
  const auraTypesField = () => field({ label: t('Che tipo di aura'), control: chipGroup({ options: AURA_TYPES, value: draft.auraTypes, multi: true, onChange: (v) => { draft.auraTypes = v; } }) });
  const auraBox = h('div');
  const paintAura = () => replaceChildren(auraBox, draft.aura && draft.aura !== 'never' ? auraTypesField() : null);
  paintAura();
  return editPage({
    title: t('Il mio mal di testa'),
    draft,
    build: (d) => [
      h('p', { class: 'page-intro' }, t('Descrivi l’attacco tipico, quello che ti capita più spesso.')),
      card(cardTitle(t('Intensità abituale')), intensityPicker({ value: d.intensity, onChange: (v) => { d.intensity = v; } })),
      card(
        field({ label: t('Quanto dura di solito (senza farmaci o se non funzionano)'), control: chipGroup({ options: TYPICAL_DURATIONS.map((x) => ({ value: x.id, label: x.label })), value: d.duration, onChange: (v) => { d.duration = v || ''; } }) }),
        field({ label: t('Lato'), control: chipGroup({ options: SIDES.map((s) => ({ value: s.id, label: s.label })), value: d.side, onChange: (v) => { d.side = v || ''; } }) }),
        field({ label: t('Zona'), control: chipGroup({ options: PAIN_AREAS, value: d.areas, multi: true, onChange: (v) => { d.areas = v; } }) }),
        field({ label: t('Che tipo di dolore'), control: chipGroup({ options: PAIN_QUALITY, value: d.quality, multi: true, onChange: (v) => { d.quality = v; } }) }),
        field({ label: t('Peggiora con il movimento (scale, piegarsi, camminare)?'), control: chipGroup({ options: YES_NO_UNKNOWN.map((x) => ({ value: x.id, label: x.label })), value: d.activity, onChange: (v) => { d.activity = v || ''; } }) }),
      ),
      card(
        field({
          label: t('Aura (disturbi visivi o sensitivi prima del dolore)'),
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
        field({ label: t('Sintomi che lo accompagnano'), control: multiWithCustom({ base: store.listOptions('symptoms'), selected: d.symptoms, onChange: (v) => { d.symptoms = v; } }) }),
        field({ label: t('Cosa lo scatena, secondo te'), control: multiWithCustom({ base: store.listOptions('triggers'), selected: d.triggers, onChange: (v) => { d.triggers = v; } }) }),
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
  const paintFam = () => replaceChildren(famBox, draft.famKnown === 'yes' ? field({ label: t('Chi?'), control: chipGroup({ options: FAMILY_MEMBERS, value: draft.family, multi: true, onChange: (v) => { draft.family = v; } }) }) : null);
  paintFam();
  const showCycle = hs.sex !== 'm';
  return editPage({
    title: t('Salute generale'),
    draft,
    build: (d) => [
      card(
        cardTitle(t('In famiglia')),
        field({
          label: t('Qualcuno in famiglia soffre di emicrania o mal di testa?'),
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
        cardTitle(t('Altre condizioni')),
        field({ label: t('Hai anche…'), control: multiWithCustom({ base: CONDITIONS, selected: d.conditions, onChange: (v) => { d.conditions = v; } }) }),
        field({
          label: t('Dettagli'),
          control: textArea({
            value: d.conditionsNote, placeholder: t('Interventi, problemi di salute importanti…'), label: t('Dettagli sulle altre condizioni'), maxLength: 1000, onInput: (v) => { d.conditionsNote = v; },
          }),
        }),
      ),
      card(
        field({
          label: t('Allergie o intolleranze a farmaci'),
          control: textArea({
            value: d.allergies, rows: 2, placeholder: t('es. Allergia all’acido acetilsalicilico'), label: t('Allergie'), maxLength: 600, onInput: (v) => { d.allergies = v; },
          }),
        }),
        field({
          label: t('Altri farmaci che prendi regolarmente'),
          control: textArea({
            value: d.otherMeds, rows: 2, placeholder: t('es. Levotiroxina 50 mcg'), label: t('Altri farmaci'), maxLength: 600, onInput: (v) => { d.otherMeds = v; },
          }),
        }),
      ),
      showCycle ? card(
        cardTitle(t('Ciclo e ormoni')),
        field({ label: t('Gli attacchi sono legati al ciclo mestruale?'), control: chipGroup({ options: CYCLE_LINK.map((x) => ({ value: x.id, label: x.label })), value: d.cycleLink, onChange: (v) => { d.cycleLink = v || ''; } }) }),
        field({
          label: t('Contraccezione o terapia ormonale'),
          control: textInput({
            value: d.contraception, placeholder: t('es. Pillola estroprogestinica (lascia vuoto se nessuna)'), label: t('Contraccezione ormonale'), onInput: (v) => { d.contraception = v; },
          }),
        }),
      ) : null,
    ],
    onSave: (d) => store.updateHistory(d),
  });
}

const PROMPTS = [
  t('Quando è iniziato e com’era all’inizio'),
  t('Come sono cambiati gli attacchi negli anni (gravidanze, lavoro, periodi di stress…)'),
  t('Gli attacchi più forti che ricordi'),
  t('Cosa hai provato e cosa ha funzionato'),
  t('Quanto incide sulla tua vita e cosa ti preoccupa'),
  t('Cosa vorresti chiedere al medico'),
];

function openNarrativeEditor() {
  const draft = { narrative: store.getDb().history.narrative };
  const count = h('p', { class: 'field-hint', style: { textAlign: 'right' } });
  const paint = () => {
    const words = draft.narrative.trim() ? draft.narrative.trim().split(/\s+/).length : 0;
    count.textContent = t('{n, plural, one {# parola} other {# parole}}', { n: words });
  };
  paint();
  return editPage({
    title: t('Il mio racconto'),
    draft,
    build: (d) => [
      h('p', { class: 'page-intro' }, t('Racconta con parole tue la tua storia con il mal di testa, come faresti con il neurologo. Il testo viene riportato nella sintesi clinica e nel report.')),
      card(
        cardTitle(t('Puoi parlare di')),
        h('ul', { class: 'bullets', style: { marginBottom: '0' } }, PROMPTS.map((p) => h('li', {}, p))),
      ),
      card(
        textArea({
          value: d.narrative, rows: 12, tall: true, maxLength: 12000, label: t('Il mio racconto'), placeholder: t('Ho cominciato ad avere mal di testa a…'), onInput: (v) => { d.narrative = v; paint(); },
        }),
        count,
      ),
    ],
    onSave: (d) => store.updateHistory(d),
  });
}

/* ---------- periodi di frequenza ---------- */

function openPeriodSheet(existing = null, onDone = null) {
  const sheet = openSheet({ title: existing ? t('Modifica periodo') : t('Nuovo periodo'), tall: true });
  const cur = monthOf(todayStr());
  const d = existing ? clone(existing) : {
    from: `${YEAR() - 3}-01`, to: null, days: null, intensity: null, acute: null, note: '',
  };
  const toBox = h('div');
  const ongoing = toggleRow({
    title: t('Fino a oggi'),
    subtitle: t('Il periodo continua ancora'),
    checked: !d.to,
    onChange: (on) => {
      d.to = on ? null : (d.to || cur);
      paintTo();
    },
  });
  const paintTo = () => replaceChildren(toBox, d.to ? field({ label: t('Fino a'), control: monthInput({ value: d.to, label: t('Fine del periodo'), onChange: (v) => { d.to = v || d.to; } }) }) : null);
  paintTo();
  replaceChildren(
    sheet.body,
    h('p', { class: 'muted small mb' }, t('Una stima va benissimo: ad esempio «dal 2016 al 2019 circa 4 giorni al mese».')),
    card(
      field({ label: t('Dal'), control: monthInput({ value: d.from, label: t('Inizio del periodo'), onChange: (v) => { if (v) d.from = v; } }) }),
      group(ongoing),
      toBox,
    ),
    card(
      field({
        label: t('Giorni con mal di testa al mese (circa)'),
        control: stepper({
          value: d.days, min: 0, max: 31, step: 1, start: 4, label: t('giorni con mal di testa al mese'), onChange: (v) => { d.days = v; },
        }),
      }),
      field({
        label: t('Intensità media (facoltativa)'),
        control: stepper({
          value: d.intensity, min: 1, max: 10, step: 1, start: 6, label: t('intensità media'), onChange: (v) => { d.intensity = v; },
        }),
      }),
      field({
        label: t('Giorni al mese con antidolorifici (facoltativo)'),
        control: stepper({
          value: d.acute, min: 0, max: 31, step: 1, start: 2, label: t('giorni al mese con antidolorifici'), onChange: (v) => { d.acute = v; },
        }),
      }),
      field({
        label: t('Note'),
        control: textInput({
          value: d.note, placeholder: t('es. Periodo dell’università, molto stress'), maxLength: 300, label: t('Note sul periodo'), onInput: (v) => { d.note = v; },
        }),
      }),
    ),
    h('div', { class: 'today-actions' },
      button({
        label: t('Salva periodo'),
        kind: 'primary',
        block: true,
        onClick: () => {
          if (d.days == null) {
            toast(t('Indica quanti giorni al mese, anche a stima.'), { tone: 'error' });
            return;
          }
          if (d.to && d.to < d.from) {
            toast(t('La fine non può essere prima dell’inizio.'), { tone: 'error' });
            return;
          }
          if (d.from > cur) {
            toast(t('Il periodo non può iniziare nel futuro.'), { tone: 'error' });
            return;
          }
          store.upsertHistoryItem('periods', d);
          sheet.close();
          toast(t('Periodo salvato'));
          if (onDone) onDone();
        },
      }),
      existing ? button({
        label: t('Elimina periodo'),
        kind: 'danger',
        block: true,
        onClick: () => {
          const removed = store.removeHistoryItem('periods', existing.id);
          sheet.close();
          toast(t('Periodo eliminato'), { action: { label: t('Annulla§undo'), onClick: () => store.upsertHistoryItem('periods', removed) } });
          if (onDone) onDone();
        },
      }) : null),
  );
  return sheet;
}

function openPeriods() {
  const page = openPage({ title: t('Frequenza negli anni') });
  const render = () => {
    const hs = store.getDb().history;
    const rows = [...hs.periods].reverse().map((p) => row({
      icon: 'chart-line',
      tone: 'indigo',
      title: fmtMonthRange(p.from, p.to),
      subtitle: [
        t('{n, plural, one {circa # giorno al mese} other {circa # giorni al mese}}', { n: p.days }),
        p.intensity != null ? t('intensità {valore}/10', { valore: num(p.intensity) }) : '',
        p.acute != null ? t('antidolorifici {giorni} gg/mese', { giorni: num(p.acute) }) : '',
        p.note,
      ].filter(Boolean).join(' · '),
      chevron: true,
      onClick: () => openPeriodSheet(p, render),
    }));
    replaceChildren(
      page.body,
      h('p', { class: 'page-intro' }, t('Dividi la tua storia in periodi e indica, per ognuno, quanti giorni al mese avevi mal di testa. Così non devi ricompilare il diario del passato: queste stime vengono usate nel grafico dell’andamento e come punto di partenza per valutare le terapie.')),
      rows.length ? group(...rows) : emptyState({ icon: 'chart-line', title: t('Nessun periodo'), text: t('Inizia dal periodo più lontano che ricordi.') }),
      group(row({ icon: 'plus', tone: 'green', title: t('Aggiungi un periodo'), onClick: () => openPeriodSheet(null, render) })),
    );
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}

/* ---------- episodi significativi ---------- */

function openEventSheet(existing = null, onDone = null) {
  const sheet = openSheet({ title: existing ? t('Modifica episodio') : t('Episodio significativo'), tall: true });
  const d = existing ? clone(existing) : {
    date: monthOf(todayStr()), title: '', text: '', intensity: null, er: false, hosp: false,
  };
  let precision = d.date.length === 10 ? 'day' : d.date.length === 7 ? 'month' : 'year';
  const dateBox = h('div');
  const paintDate = () => {
    let ctl;
    if (precision === 'day') {
      ctl = dateInput({ value: d.date.length === 10 ? d.date : `${d.date.slice(0, 7).padEnd(7, '-01').slice(0, 7)}-01`, max: todayStr(), label: t('Data'), onChange: (v) => { if (v) d.date = v; } });
      if (d.date.length !== 10) d.date = ctl.value || todayStr();
    } else if (precision === 'month') {
      if (d.date.length !== 7) d.date = d.date.length === 10 ? d.date.slice(0, 7) : `${d.date.slice(0, 4)}-01`;
      ctl = monthInput({ value: d.date, label: t('Mese'), onChange: (v) => { if (v) d.date = v; } });
    } else {
      d.date = d.date.slice(0, 4);
      ctl = yearSelect({ value: Number(d.date), label: t('Anno'), empty: t('Anno'), onChange: (v) => { if (v) d.date = String(v); } });
    }
    replaceChildren(dateBox, ctl);
  };
  paintDate();
  replaceChildren(
    sheet.body,
    card(
      field({
        label: t('Quando'),
        control: h('div', {}, chipGroup({
          options: [{ value: 'day', label: t('Giorno preciso') }, { value: 'month', label: t('Mese') }, { value: 'year', label: t('Solo l’anno') }],
          value: precision,
          allowClear: false,
          onChange: (v) => {
            precision = v;
            paintDate();
          },
        }), h('div', { style: { marginTop: '10px' } }, dateBox)),
      }),
      field({
        label: t('Titolo'),
        control: textInput({
          value: d.title, placeholder: t('es. Attacco di 4 giorni, pronto soccorso'), maxLength: 120, label: t('Titolo dell’episodio'), onInput: (v) => { d.title = v; },
        }),
      }),
      field({
        label: t('Cosa è successo'),
        control: textArea({
          value: d.text, rows: 5, maxLength: 3000, label: t('Descrizione dell’episodio'), placeholder: t('Sintomi, durata, cure ricevute, cosa ha detto il medico…'), onInput: (v) => { d.text = v; },
        }),
      }),
      field({
        label: t('Intensità (facoltativa)'),
        control: stepper({
          value: d.intensity, min: 1, max: 10, start: 8, label: t('intensità'), onChange: (v) => { d.intensity = v; },
        }),
      }),
    ),
    group(
      toggleRow({ icon: 'hospital', tone: 'red', title: t('Sono andato al pronto soccorso'), checked: d.er, onChange: (v) => { d.er = v; } }),
      toggleRow({ icon: 'hospital', tone: 'orange', title: t('Sono stato ricoverato'), checked: d.hosp, onChange: (v) => { d.hosp = v; } }),
    ),
    h('div', { class: 'today-actions' },
      button({
        label: t('Salva episodio'),
        kind: 'primary',
        block: true,
        onClick: () => {
          if (!d.title.trim() && !d.text.trim()) {
            toast(t('Scrivi almeno un titolo.'), { tone: 'error' });
            return;
          }
          store.upsertHistoryItem('events', d);
          sheet.close();
          toast(t('Episodio salvato'));
          if (onDone) onDone();
        },
      }),
      existing ? button({
        label: t('Elimina episodio'),
        kind: 'danger',
        block: true,
        onClick: () => {
          const removed = store.removeHistoryItem('events', existing.id);
          sheet.close();
          toast(t('Episodio eliminato'), { action: { label: t('Annulla§undo'), onClick: () => store.upsertHistoryItem('events', removed) } });
          if (onDone) onDone();
        },
      }) : null),
  );
  return sheet;
}

function openEvents() {
  const page = openPage({ title: t('Episodi significativi') });
  const render = () => {
    const list = [...store.getDb().history.events].sort((a, b) => (a.date < b.date ? 1 : -1));
    replaceChildren(
      page.body,
      h('p', { class: 'page-intro' }, t('Gli attacchi più importanti del passato: quelli più lunghi o più forti, gli accessi in pronto soccorso, i ricoveri, gli episodi diversi dal solito. Restano nella tua storia senza alterare le statistiche del diario.')),
      list.length ? group(...list.map((e) => row({
        icon: e.er || e.hosp ? 'hospital' : 'flag',
        tone: e.er || e.hosp ? 'red' : 'orange',
        title: e.title,
        subtitle: [fmtFuzzyDate(e.date), e.intensity ? t('intensità {valore}/10', { valore: e.intensity }) : '', e.er ? t('pronto soccorso') : '', e.hosp ? t('ricovero') : ''].filter(Boolean).join(' · '),
        chevron: true,
        onClick: () => openEventSheet(e, render),
      }))) : emptyState({ icon: 'flag', title: t('Nessun episodio'), text: t('Aggiungi gli attacchi che ricordi meglio, anche solo con l’anno.') }),
      group(row({ icon: 'plus', tone: 'green', title: t('Aggiungi un episodio'), onClick: () => openEventSheet(null, render) })),
    );
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}

/* ---------- farmaci per l'attacco già provati ---------- */

function openAcuteSheet(existing = null, onDone = null) {
  const sheet = openSheet({ title: existing ? t('Modifica farmaco') : t('Farmaco provato'), tall: true });
  const d = existing ? clone(existing) : {
    name: '', cls: 'other', effect: null, note: '',
  };
  const nameInput = textInput({
    value: d.name ? tv(d.name) : '', placeholder: t('Nome del farmaco'), maxLength: 80, label: t('Nome del farmaco'), onInput: (v) => { d.name = v; },
  });
  const clsSel = h('select', { class: 'input select', 'aria-label': t('Tipo di farmaco') }, MED_CLASSES.map((c) => h('option', { value: c.id }, c.label)));
  clsSel.value = d.cls;
  clsSel.addEventListener('change', () => { d.cls = clsSel.value; });
  replaceChildren(
    sheet.body,
    card(
      field({ label: t('Farmaco'), control: nameInput }),
      existing ? null : h('div', { class: 'chips', style: { margin: '-6px 0 16px' } }, DEFAULT_MEDS.slice(0, 14).map((m) => h('button', { // i18n-ignore
        type: 'button',
        class: 'chip',
        onclick: () => {
          d.name = m.name;
          nameInput.value = tv(m.name);
          d.cls = m.cls;
          clsSel.value = m.cls;
        },
      }, tv(m.name)))),
      field({ label: t('Tipo'), control: clsSel }),
      field({ label: t('Come funzionava'), control: chipGroup({ options: MED_EFFECTS.map((e) => ({ value: e.v, label: e.label })), value: d.effect, onChange: (v) => { d.effect = v; } }) }),
      field({
        label: t('Note'),
        control: textInput({
          value: d.note, placeholder: t('es. Effetti collaterali, dose'), maxLength: 200, label: t('Note sul farmaco'), onInput: (v) => { d.note = v; },
        }),
      }),
    ),
    h('div', { class: 'today-actions' },
      button({
        label: t('Salva'),
        kind: 'primary',
        block: true,
        onClick: () => {
          if (!d.name.trim()) {
            toast(t('Scrivi il nome del farmaco.'), { tone: 'error' });
            return;
          }
          store.upsertHistoryItem('acute', d);
          sheet.close();
          if (onDone) onDone();
        },
      }),
      existing ? button({
        label: t('Elimina'),
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
  const page = openPage({ title: t('Farmaci per l’attacco') });
  const render = () => {
    const list = store.getDb().history.acute;
    replaceChildren(
      page.body,
      h('p', { class: 'page-intro' }, t('Antidolorifici, triptani e altri farmaci per l’attacco che hai provato in passato, con il risultato. Quelli che usi oggi li registri direttamente negli attacchi.')),
      list.length ? group(...list.map((a) => row({
        icon: 'pill',
        tone: 'green',
        title: tv(a.name),
        subtitle: [medClassLabel(a.cls), a.effect != null ? t('effetto: {effetto}', { effetto: effectLabel(a.effect).toLowerCase() }) : '', a.note].filter(Boolean).join(' · '),
        chevron: true,
        onClick: () => openAcuteSheet(a, render),
      }))) : emptyState({ icon: 'pill', title: t('Nessun farmaco'), text: t('Aggiungi i farmaci che hai già provato.') }),
      group(row({ icon: 'plus', tone: 'green', title: t('Aggiungi un farmaco'), onClick: () => openAcuteSheet(null, render) })),
    );
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}

/* ---------- sintesi clinica ---------- */

export function openClinicalSummary() {
  const page = openPage({ title: t('Sintesi clinica') });
  const render = () => {
    const db = store.getDb();
    const today = todayStr();
    const idx = getIndex(db, store.getRev(), today);
    const sum = clinicalSummary(idx, db, today);
    const nodes = [];
    nodes.push(h('p', { class: 'page-intro' }, t('Un riassunto in stile anamnesi costruito con la tua storia e con il diario, da leggere o mostrare al neurologo.')));
    if (sum.observations.length) {
      nodes.push(card(
        cardTitle(t('Cosa emerge')),
        ...sum.observations.map((o) => h('div', { class: 'insight' }, h('span', { class: `row-icon ${o.tone === 'good' ? 'green' : o.tone === 'warn' ? 'orange' : 'blue'}` }, icon(o.icon, 16)), h('p', {}, o.text))),
      ));
    }
    if (sum.blocks.length) {
      nodes.push(card(...sum.blocks.map((b) => h('div', { class: 'summary-block' }, h('h4', {}, b.title), h('p', {}, b.text)))));
    } else {
      nodes.push(emptyState({
        icon: 'book', title: t('Ancora nessun dato'), text: t('Compila «La mia storia» o registra qualche attacco: la sintesi si costruisce da sola.'), action: button({ label: t('Compila la mia storia'), onClick: () => { page.close(); openHistory(); } }),
      }));
    }
    nodes.push(h('div', { class: 'today-actions mb' },
      button({
        label: t('Condividi il testo'),
        kind: 'secondary',
        icon: 'share',
        block: true,
        onClick: async () => {
          const r = await shareText({ text: summaryPlainText(sum, { name: db.settings.name, today }), title: t('Sintesi clinica') });
          if (r === 'copied') toast(t('Sintesi copiata negli appunti'));
        },
      }),
      button({
        label: t('Crea il PDF per il medico'),
        kind: 'primary',
        icon: 'file',
        block: true,
        onClick: async () => {
          const { openReport } = await import('./report.js');
          openReport();
        },
      })));
    nodes.push(footnote(t('La sintesi è generata automaticamente con regole prudenti, solo con i dati che hai inserito. Non è una diagnosi e non sostituisce la visita.')));
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
  const typical = hs.typical;
  switch (id) {
    case 'profile': {
      const bits = [];
      if (hs.onsetAge != null) bits.push(t('{eta, plural, one {esordio a # anno} other {esordio a # anni}}', { eta: hs.onsetAge }));
      if (hs.diagnoses.length) bits.push(hs.diagnoses.map(tv).join(', '));
      return bits.join(' · ') || t('Età, esordio, diagnosi ricevute');
    }
    case 'typical': {
      const bits = [];
      if (typical.intensity) bits.push(t('intensità {valore}/10', { valore: typical.intensity }));
      if (typical.quality.length) bits.push(typical.quality.map(tv).join(', ').toLowerCase());
      if (typical.symptoms.length) bits.push(t('{n, plural, one {# sintomo} other {# sintomi}}', { n: typical.symptoms.length }));
      return bits.join(' · ') || t('Come è di solito un attacco');
    }
    case 'periods': return hs.periods.length ? `${t('{n, plural, one {# periodo} other {# periodi}}', { n: hs.periods.length })} · ${fmtMonthRange(hs.periods[0].from, hs.periods[hs.periods.length - 1].to)}` : t('Quanti giorni al mese, negli anni');
    case 'therapies': return db.preventives.length ? t('{n, plural, one {# terapia} other {# terapie}}', { n: db.preventives.length }) : t('Terapie di prevenzione attuali e passate');
    case 'acute': return hs.acute.length ? t('{n, plural, one {# farmaco} other {# farmaci}}', { n: hs.acute.length }) : t('Antidolorifici e triptani già provati');
    case 'events': return hs.events.length ? t('{n, plural, one {# episodio} other {# episodi}}', { n: hs.events.length }) : t('Attacchi importanti, pronto soccorso');
    case 'health': return [hs.famKnown === 'yes' ? t('familiarità') : '', hs.conditions.length ? t('{n, plural, one {# condizione} other {# condizioni}}', { n: hs.conditions.length }) : '', hs.allergies ? t('allergie') : ''].filter(Boolean).join(' · ') || t('Familiarità, altre malattie, allergie, ormoni');
    case 'narrative': return hs.narrative ? `${hs.narrative.slice(0, 60)}${hs.narrative.length > 60 ? '…' : ''}` : t('Con parole tue, come dal neurologo');
    default: return '';
  }
}

export function openHistory() {
  const page = openPage({ title: t('La mia storia') });
  const render = () => {
    const top = page.body.scrollTop;
    const db = store.getDb();
    const done = new Map(historySections(db).map((s) => [s.id, s.done]));
    const comp = historyCompleteness(db);
    const item = (id, ic, tone, title, onClick) => row({
      icon: ic, tone, title, subtitle: summaryOf(id, db), right: done.get(id) ? h('span', { style: { color: 'var(--green)' }, 'aria-label': t('compilata') }, icon('check-circle', 20)) : null, chevron: true, onClick,
    });
    replaceChildren(
      page.body,
      h('p', { class: 'page-intro' }, t('Racconta la tua situazione fino a oggi, come alla prima visita dal neurologo. Non serve ricompilare il diario del passato: queste informazioni entrano nelle analisi, nella sintesi clinica e nel report.')),
      card(
        h('div', { class: 'flex' },
          h('span', { class: 'progress-ring', style: { '--p': String(Math.round((comp.done / comp.total) * 100)) }, 'data-label': `${comp.done}/${comp.total}` }),
          h('div', {}, h('div', { style: { fontWeight: '600' } }, comp.done === comp.total ? t('Storia completa') : t('Completa la tua storia')), h('div', { class: 'muted small' }, t('{n, plural, one {# sezione compilata su {totale}. Puoi compilarle in qualsiasi ordine.} other {# sezioni compilate su {totale}. Puoi compilarle in qualsiasi ordine.}}', { n: comp.done, totale: comp.total })))),
      ),
      section(t('Il mio mal di testa'), group(
        item('profile', 'person', 'blue', t('Chi sono e diagnosi'), openProfileEditor),
        item('typical', 'activity', 'indigo', t('Com’è un attacco tipico'), openTypicalEditor),
        item('periods', 'chart-line', 'purple', t('Frequenza negli anni'), () => openPeriods()),
        item('events', 'flag', 'orange', t('Episodi significativi'), () => openEvents()),
      )),
      section(t('Cure'), group(
        item('therapies', 'shield', 'green', t('Terapie di prevenzione'), () => openTherapies()),
        row({
          icon: 'pill', tone: 'teal', title: t('Farmaci per l’attacco già provati'), subtitle: summaryOf('acute', db), chevron: true, onClick: () => openAcute(),
        }),
      )),
      section(t('Il resto'), group(
        item('health', 'heart', 'pink', t('Salute generale'), openHealthEditor),
        item('narrative', 'edit', 'gray', t('Il mio racconto'), openNarrativeEditor),
      )),
      button({ label: t('Leggi la sintesi clinica'), kind: 'primary', icon: 'sparkles', block: true, onClick: () => openClinicalSummary() }),
      h('div', { class: 'mt' }, footnote(t('Tutto resta su questo telefono. Nel report per il medico puoi scegliere se includere la storia.'))),
    );
    page.body.scrollTop = top;
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}
