import { h, replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import { t, tv, listAnd } from '../i18n.js';
import * as store from '../store.js';
import {
  openPage, openSheet, confirmDialog, toast, chipGroup, segmented, toggleRow, stepper, card, cardTitle, button, row, group, alertBox, accordion,
  footnote, field, dateInput, textArea, intensityPicker, pill, closeAllOverlays,
} from '../ui.js';
import {
  fmt, capitalize, fmtDateShort, fmtMonthYear, fmtDayMonth, monthOf, todayStr,
} from '../dates.js';
import { getIndex } from '../analysis.js';
import { intensityColor, sideLabel } from '../data.js';
import { annotate, buildImport, medSummary, hasConsecutive } from '../notes/build.js';
import { readNoteFile, ACCEPT, cleanPasted } from '../notes/extract.js';
import { monthHeader } from './shared.js';

const ul = (...items) => h('ul', { class: 'bullets' }, items.map((i) => h('li', {}, i)));
const ol = (...items) => h('ol', { class: 'bullets' }, items.map((i) => h('li', {}, i)));
const CHUNK = 60;

const hintOrder = () => (/^en-US/i.test((typeof navigator !== 'undefined' && navigator.language) || '') ? 'mdy' : 'dmy');
const num = (n) => String(n);

const dayLong = (d) => capitalize(fmt(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }));

function errorMessage(e) {
  switch (e && e.code) {
    case 'tooBig': return t('Il file è troppo grande per essere letto.');
    case 'image': return t('Questa è un’immagine e l’app non può leggerla. Su iPhone tocca il testo nella foto per copiarlo e incollalo qui.');
    case 'unsupported': return t('Formato non supportato. Esporta la nota come PDF o testo, oppure incolla il testo qui.');
    case 'pdfEmpty': return t('Nel PDF non c’è testo selezionabile: forse è una scansione o una foto. Su iPhone tocca il testo per copiarlo e incollalo qui.');
    case 'pdfPassword': return t('Il PDF è protetto da una password.');
    case 'empty': return t('Il file è vuoto.');
    default: return t('Non riesco a leggere questo file.');
  }
}

/* ---------------------------------------------------------------- avvio */

export function openNotesImport() {
  const page = openPage({ title: t('Importa dalle note') });
  const fileInput = h('input', {
    type: 'file', accept: ACCEPT, hidden: true, 'aria-hidden': 'true', tabindex: '-1',
  });
  let busy = null;

  const handleText = async (text, source) => {
    const { parseNotes } = await import('../notes/parse.js');
    const parsed = parseNotes(text, { today: todayStr(), hintOrder: hintOrder() });
    if (!parsed.entries.length) {
      openNothingFound(text, () => openPasteSheet(handleText));
      return;
    }
    openReview({ text, source, parseNotes, parsed, parent: page });
  };

  const handleFile = async (file) => {
    busy = t('Lettura di «{nome}»…', { nome: file.name });
    render();
    try {
      const res = await readNoteFile(file, { onProgress: (i, n) => { busy = t('Lettura di «{nome}»: pagina {i} di {n}…', { nome: file.name, i, n }); render(); } });
      busy = null;
      render();
      await handleText(res.text, file.name);
    } catch (e) {
      busy = null;
      render();
      toast(errorMessage(e), { tone: 'error', duration: 9000 });
    }
  };

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (file) handleFile(file);
  });

  const batchesCard = () => {
    const batches = store.importBatches();
    if (!batches.length) return null;
    return group(...batches.map((b) => row({
      icon: 'history',
      tone: 'gray',
      title: t('{data} · {n, plural, one {# attacco} other {# attacchi}}', { data: fmtDateShort(b.at.slice(0, 10)), n: b.count }),
      subtitle: t('dal {da} al {a}', { da: fmtDateShort(b.from), a: fmtDateShort(b.to) }),
      right: h('span', { class: 'pill red' }, t('Elimina')),
      onClick: async () => {
        const ok = await confirmDialog({
          title: t('Eliminare gli attacchi importati?'),
          message: t('Verranno eliminati {n, plural, one {# attacco importato} other {# attacchi importati}} il {data}. Gli altri dati non cambiano.', { n: b.count, data: fmtDateShort(b.at.slice(0, 10)) }),
          confirmLabel: t('Elimina'),
          danger: true,
        });
        if (!ok) return;
        store.removeImportedBatch(b.imp);
        toast(t('Attacchi eliminati'));
        render();
      },
    })));
  };

  const render = () => {
    const nodes = [];
    nodes.push(card(
      h('div', { class: 'imp-hero' }, h('span', { class: 'imp-hero-icon' }, icon('calendar-plus', 28))),
      cardTitle(t('Compila il calendario dalle tue note')),
      h('p', { class: 'muted', style: { marginBottom: '14px' } }, t('Se tenevi il diario nell’app Note, in un PDF o in un documento, l’app lo legge e crea gli attacchi al posto tuo: date, intensità, zone, sintomi, farmaci e fattori scatenanti. Prima di salvare potrai controllare e correggere tutto.')),
      busy
        ? h('p', { class: 'imp-busy', role: 'status' }, icon('refresh', 18), h('span', {}, busy))
        : h('div', { class: 'stack' },
          button({ label: t('Scegli un file'), kind: 'primary', size: 'lg', icon: 'upload', block: true, onClick: () => fileInput.click() }),
          button({ label: t('Incolla il testo'), kind: 'secondary', icon: 'clipboard', block: true, onClick: () => openPasteSheet(handleText) })),
    ));
    nodes.push(footnote(t('Tutto avviene su questo telefono: il file e il testo non vengono inviati a nessuno.')));
    nodes.push(accordion({
      title: t('Come portare qui le tue note'),
      open: true,
      children: [
        ol(
          t('Il modo più semplice: apri la nota, seleziona tutto il testo (tocca e tieni premuto, poi «Seleziona tutto»), tocca Copia e usa «Incolla il testo».'),
          t('Oppure salva la nota come PDF: Condividi › Stampa, pizzica l’anteprima per ingrandirla, poi Condividi › Salva su File. Quindi usa «Scegli un file».'),
          t('Controlla l’anteprima, correggi quello che serve e tocca Importa.'),
        ),
        h('p', { class: 'muted small' }, t('Formati letti: PDF, testo (.txt, .md), RTF, HTML, Word (.docx), OpenDocument (.odt) e CSV. Le immagini e le scansioni non si possono leggere: su iPhone tocca il testo nella foto per copiarlo.')),
      ],
    }));
    nodes.push(accordion({
      title: t('Cosa riesce a capire'),
      children: [
        ul(
          t('Date scritte in tanti modi: «26.06», «26/06/2024», «26 giugno», «June 26», «2024-06-26», anche intervalli come «19/20.07» o «dal 3 al 5 settembre».'),
          t('Titoli di anno e di mese («2025», «Giugno», «Primi di ottobre»). Se l’anno manca, lo deduce dall’ordine delle date.'),
          t('Intensità a numeri («7/10», «livello 8») e a parole («leggero», «molto forte», «insopportabile»).'),
          t('Lato e zona del dolore, aura, nausea, sensibilità alla luce e fattori scatenanti come ciclo, poco sonno o stress.'),
          t('Farmaci con il nome commerciale, la dose, la quantità e l’effetto: «2 oki», «imigran 50 non ha fatto effetto».'),
          t('«Come sopra» o «^^» ripete la riga precedente.'),
          t('Note in italiano, inglese, spagnolo, francese, tedesco, portoghese, rumeno e olandese, anche mescolate.'),
        ),
        h('p', { class: 'muted small' }, t('Se una riga non è chiara, resta nell’anteprima e puoi correggerla. Il testo originale viene sempre salvato nella nota dell’attacco.')),
      ],
    }));
    const b = batchesCard();
    if (b) {
      nodes.push(h('h2', { class: 'section-title' }, t('Importazioni fatte')));
      nodes.push(b);
      nodes.push(footnote(t('Se hai importato per errore, puoi eliminare tutti gli attacchi di un’importazione.')));
    }
    replaceChildren(page.body, ...nodes, fileInput);
  };
  render();
  return page;
}

function openPasteSheet(onText) {
  const sheet = openSheet({ title: t('Incolla il testo'), tall: true });
  let value = '';
  const readBtn = button({ label: t('Leggi il testo'), kind: 'primary', size: 'lg', block: true, disabled: true, icon: 'sparkles', onClick: async () => {
    sheet.close();
    await onText(cleanPasted(value), '');
  } });
  const ta = textArea({
    value: '', rows: 10, maxLength: 3000000, tall: true, label: t('Testo delle note'), placeholder: t('Incolla qui il testo del tuo diario…'),
    onInput: (v) => { value = v; readBtn.disabled = !v.trim(); },
  });
  replaceChildren(
    sheet.body,
    h('p', { class: 'muted mb' }, t('Nell’app Note apri la nota, tocca e tieni premuto sul testo, scegli «Seleziona tutto» e poi Copia. Poi torna qui e incolla.')),
    h('div', { class: 'mb' }, ta),
    readBtn,
  );
  setTimeout(() => { try { ta.focus(); } catch (e) { /* ignorato */ } }, 250);
  return sheet;
}

function openNothingFound(text, onPaste) {
  const sheet = openSheet({ title: t('Non ho trovato date'), tall: true });
  const preview = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 8).map((l) => (l.length > 90 ? `${l.slice(0, 90)}…` : l));
  replaceChildren(
    sheet.body,
    h('p', { class: 'mb' }, t('Ho letto il testo ma non ho trovato righe che iniziano con una data, per esempio «12.03 emicrania a sinistra». Controlla che ogni giorno stia su una riga e inizi con la data.')),
    preview.length ? h('div', { class: 'mb' }, h('div', { class: 'field-label' }, t('Ecco le prime righe che ho letto')), h('pre', { class: 'imp-pre' }, preview.join('\n'))) : null,
    h('div', { class: 'stack' },
      button({ label: t('Incolla un altro testo'), kind: 'primary', block: true, icon: 'clipboard', onClick: () => { sheet.close(); onPaste(); } }),
      button({ label: t('Chiudi'), kind: 'secondary', block: true, onClick: () => sheet.close() })),
  );
}

/* ---------------------------------------------------------------- anteprima */

const ISSUE_PILLS = {
  existing: ['gray', () => t('Già nel diario')],
  future: ['orange', () => t('Data futura')],
  invalidDate: ['red', () => t('Data non valida')],
  badRange: ['red', () => t('Intervallo non valido')],
  free: ['green', () => t('Giorno senza dolore')],
  mensesOnly: ['red', () => t('Solo ciclo')],
  other: ['orange', () => t('Non sembra un attacco')],
  dupDate: ['orange', () => t('Data ripetuta')],
  rangeLong: ['orange', () => t('Periodo lungo')],
  unknownMed: ['orange', () => t('Farmaco da controllare')],
};

const isDayOnly = (r) => r.kind === 'free' || r.kind === 'menses';

function medLabel(m) {
  return `${tv(m.name)}${m.count > 1 ? ` ×${m.count}` : ''}${m.dose ? ` ${m.dose}` : ''}`;
}

function openReview({
  text, source, parseNotes, parsed: first, parent,
}) {
  const today = todayStr();
  const st = {
    order: 'auto', baseYear: null, defaultIntensity: 5, merge: false, skipExisting: true, extendStart: true, enableCycle: true, addEvents: true,
    overrides: new Map(), excludedMeds: new Set(), filter: 'all', shown: CHUNK, touched: false,
  };
  let parsed = first;
  const db0 = store.getDb();
  const idx = getIndex(db0, store.getRev(), today);
  const existingDays = idx.migraineDays;
  const existingErDates = new Set(db0.history.events.filter((e) => e.er).map((e) => e.date));
  const knownMeds = new Set(store.listOptions('meds').map((m) => m.name.toLowerCase()));

  const importBtn = h('button', { type: 'button', class: 'btn primary lg block' });
  const foot = h('div', { class: 'imp-foot' }, importBtn);
  const page = openPage({
    title: t('Anteprima'),
    className: 'imp-page',
    onBack: async (p) => {
      if (!st.touched) { p.close(); return; }
      const ok = await confirmDialog({
        title: t('Uscire dall’anteprima?'), message: t('Le modifiche fatte qui non verranno salvate.'), confirmLabel: t('Esci'), cancelLabel: t('Continua§edit'), danger: true,
      });
      if (ok) p.close();
    },
  });
  page.el.appendChild(foot);

  const summaryBox = h('div');
  const warnBox = h('div');
  const optBody = h('div');
  const optAcc = accordion({ title: t('Opzioni'), children: [optBody] });
  const medBody = h('div');
  const medAcc = accordion({ title: t('Farmaci trovati'), children: [medBody] });
  const filterBox = h('div', { class: 'mb' });
  const listBox = h('div');

  let rows = [];
  let built = null;

  const compute = () => {
    rows = annotate(parsed.entries, {
      existingDays, today, skipExisting: st.skipExisting, overrides: st.overrides, excludedMeds: st.excludedMeds,
    });
    built = buildImport(rows, {
      imp: '', defaultIntensity: st.defaultIntensity, mergeConsecutive: st.merge, fmtDay: (d) => fmtDayMonth(d), knownMeds, existingErDates, addEvents: st.addEvents,
    });
  };

  const touch = () => { st.touched = true; };

  /* ----- elenco ----- */
  const rowNode = (r) => {
    const inten = r.intensityEff != null ? r.intensityEff : st.defaultIntensity;
    const guess = r.intensityEff == null;
    const dayOnly = isDayOnly(r) && !!r.date;
    const badge = dayOnly
      ? h('span', { class: `ep-badge mark ${r.kind}`, 'aria-label': r.kind === 'free' ? t('Giorno senza dolore') : t('Ciclo mestruale') }, icon(r.kind === 'free' ? 'check' : 'drop', 22))
      : h('span', {
        class: `ep-badge${inten >= 7 ? ' hi' : ''}${guess ? ' guess' : ''}${r.date ? '' : ' bad'}`,
        style: { '--c': r.date ? intensityColor(inten) : 'var(--fill)' },
        'aria-label': r.date ? (guess ? t('Intensità {n} su 10 (non indicata nelle note)', { n: inten }) : t('Intensità {n} su 10', { n: inten })) : t('Data non valida'),
      }, r.date ? num(inten) : '!');
    const title = r.date ? (r.endDate ? `${dayLong(r.date)} → ${fmtDayMonth(r.endDate)}` : dayLong(r.date)) : t('Riga {n}', { n: r.line });
    const details = [];
    if (dayOnly) details.push(r.kind === 'free' ? t('Senza emicrania') : tv('Ciclo mestruale'));
    if (r.side) details.push(sideLabel(r.side));
    if (r.areas.length) details.push(r.areas.slice(0, 3).map((a) => tv(a)).join(', '));
    if (r.meds.length) details.push(r.meds.map(medLabel).join(', '));
    if (!details.length && r.symptoms.length) details.push(r.symptoms.slice(0, 2).map((a) => tv(a)).join(', '));
    const textLine = r.textEff ? r.textEff : (r.flags.ditto ? t('Come sopra') : t('Nessun dettaglio nella nota'));
    const pills = r.issues.filter((i) => ISSUE_PILLS[i] && !(i === 'existing' && r.include) && !(dayOnly && (i === 'free' || i === 'mensesOnly'))).slice(0, 3).map((i) => pill(ISSUE_PILLS[i][1](), ISSUE_PILLS[i][0]));
    if (r.edited) pills.push(pill(t('Modificato'), 'teal'));
    const check = h('button', {
      type: 'button', class: `imp-check${r.include ? ' on' : ''}`, role: 'checkbox', 'aria-checked': String(r.include), 'aria-label': t('Importa questo attacco'), disabled: !r.date,
    }, r.include ? icon('check', 16) : null);
    check.addEventListener('click', () => {
      touch();
      const ov = st.overrides.get(r.key) || {};
      st.overrides.set(r.key, { ...ov, include: !r.include });
      refresh({ list: false });
      const fresh = rows.find((x) => x.key === r.key);
      const node = listBox.querySelector(`[data-key="${CSS.escape(r.key)}"]`);
      if (node && fresh) node.replaceWith(rowNode(fresh));
    });
    const card2 = h(
      'button',
      { type: 'button', class: 'ep-card', onclick: () => openRowEditor(r.key) },
      badge,
      h('span', { class: 'ep-info' },
        h('span', { class: 'ep-title' }, title),
        details.length ? h('span', { class: 'ep-meta', style: { display: 'block' } }, details.join(' · ')) : null,
        h('span', { class: 'ep-meta', style: { display: 'block' } }, textLine),
        pills.length ? h('span', { class: 'imp-pills' }, pills) : null),
      icon('chevron-right', 18, 'chev'),
    );
    return h('div', { class: `imp-row${r.include ? '' : ' off'}`, dataset: { key: r.key } }, check, card2);
  };

  const paintList = () => {
    const visible = rows.filter((r) => (st.filter === 'all' ? true : st.filter === 'review' ? r.review : !r.include));
    const nodes = [];
    if (!visible.length) {
      nodes.push(h('p', { class: 'muted center small', style: { margin: '18px 0' } }, st.filter === 'review' ? t('Niente da controllare: ottimo.') : t('Nessuna voce in questo elenco.'))); // i18n-ignore
    } else {
      const actions = h('div', { class: 'imp-actions' },
        h('button', { type: 'button', class: 'link', onclick: () => { touch(); visible.forEach((r) => { if (r.date) st.overrides.set(r.key, { ...(st.overrides.get(r.key) || {}), include: true }); }); refresh(); } }, t('Seleziona tutto')),
        h('button', { type: 'button', class: 'link', onclick: () => { touch(); visible.forEach((r) => st.overrides.set(r.key, { ...(st.overrides.get(r.key) || {}), include: false })); refresh(); } }, t('Deseleziona tutto')));
      nodes.push(actions);
      let month = '';
      visible.slice(0, st.shown).forEach((r) => {
        const m = r.date ? monthOf(r.date) : '';
        if (m !== month) {
          month = m;
          const inMonth = visible.filter((x) => (x.date ? monthOf(x.date) : '') === m).length;
          nodes.push(monthHeader(m ? fmtMonthYear(m) : t('Senza data valida'), t('{n, plural, one {# voce} other {# voci}}', { n: inMonth })));
        }
        nodes.push(rowNode(r));
      });
      if (visible.length > st.shown) {
        nodes.push(button({
          label: t('Mostra altre {n}', { n: Math.min(CHUNK, visible.length - st.shown) }), kind: 'secondary', block: true, onClick: () => { st.shown += CHUNK; paintList(); },
        }));
      }
    }
    replaceChildren(listBox, ...nodes);
  };

  /* ----- riepilogo e avvisi ----- */
  const inc = () => rows.filter((r) => r.include);

  const paintSummary = () => {
    const sel = inc();
    const atk = sel.filter((r) => !isDayOnly(r));
    const nDays = Object.keys(built.days).length;
    const dates = sel.map((r) => r.date).sort();
    const withInt = atk.filter((r) => r.intensityEff != null).length;
    const withMeds = atk.filter((r) => r.meds.length).length;
    const withAura = atk.filter((r) => r.aura.length || r.type === 'con_aura').length;
    const pills = [pill(t('Con intensità: {n}', { n: withInt }), 'gray'), pill(t('Con farmaci: {n}', { n: withMeds }), 'gray')];
    if (withAura) pills.push(pill(t('Con aura: {n}', { n: withAura }), 'gray'));
    if (built.menses) pills.push(pill(t('Giorni di ciclo: {n}', { n: built.menses }), 'gray'));
    if (built.freeDays) pills.push(pill(t('Giorni senza dolore: {n}', { n: built.freeDays }), 'gray'));
    replaceChildren(
      summaryBox,
      card(
        h('div', { class: 'imp-sum' },
          h('span', { class: 'imp-sum-n' }, num(built.episodes.length)),
          h('span', { class: 'imp-sum-l' }, t('{n, plural, one {attacco da importare} other {attacchi da importare}}', { n: built.episodes.length }))),
        dates.length ? h('p', { class: 'muted center', style: { margin: '4px 0 10px' } }, t('dal {da} al {a}', { da: fmtDateShort(dates[0]), a: fmtDateShort(dates[dates.length - 1]) })) : null, // i18n-ignore
        h('div', { class: 'imp-pills center-row' }, pills),
        h('p', { class: 'muted small center', style: { marginTop: '10px' } }, source ? t('Letto da «{nome}»', { nome: source }) : t('Testo incollato')),
      ),
    );
    importBtn.disabled = !built.episodes.length && !nDays;
    replaceChildren(importBtn, icon('check', 22), h('span', {}, built.episodes.length
      ? t('Importa {n, plural, one {# attacco} other {# attacchi}}', { n: built.episodes.length })
      : (nDays ? t('Importa i giorni segnati') : t('Niente da importare'))));
  };

  const goReview = () => { st.filter = 'review'; st.shown = CHUNK; paintFilter(); paintList(); listBox.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  const paintWarnings = () => {
    const out = [];
    const meta = parsed.meta;
    const count = (code) => rows.filter((r) => r.issues.includes(code)).length;
    if (meta.yearInferred) {
      const ys = meta.years;
      out.push(alertBox({
        tone: 'warn', icon: 'calendar', title: t('Nelle note manca l’anno'),
        text: t('Ho dedotto gli anni dall’ordine delle date: {anni}. Se non è giusto, correggilo nelle opzioni.', { anni: ys.length > 1 ? `${ys[0]}–${ys[ys.length - 1]}` : ys[0] || '' }),
      }));
    }
    if (!meta.orderCertain) {
      out.push(alertBox({
        tone: 'warn', icon: 'calendar', title: t('Le date sono ambigue'),
        text: t('Ho letto le date come {formato}. Se non è così, cambia il formato nelle opzioni.', { formato: meta.order === 'mdy' ? t('mese/giorno') : t('giorno/mese') }),
      }));
    }
    const nInvalid = count('invalidDate') + count('badRange');
    if (nInvalid) {
      out.push(alertBox({
        tone: 'warn', icon: 'alert', title: t('{n, plural, one {# riga con una data impossibile} other {# righe con una data impossibile}}', { n: nInvalid }),
        text: t('Per esempio il 31 aprile. Non vengono importate finché non correggi la data.'),
        action: button({ label: t('Mostra'), kind: 'secondary', size: 'sm', onClick: goReview }),
      }));
    }
    const nFuture = count('future');
    if (nFuture) out.push(alertBox({ tone: 'warn', icon: 'alert', title: t('{n, plural, one {# data nel futuro} other {# date nel futuro}}', { n: nFuture }), text: t('Le date future non vengono importate.') }));
    const nExisting = rows.filter((r) => r.existing && !r.include).length;
    if (nExisting) out.push(alertBox({ tone: 'info', icon: 'info', title: t('{n, plural, one {# giorno è già nel diario} other {# giorni sono già nel diario}}', { n: nExisting }), text: t('Li ho saltati per non crearli due volte. Puoi cambiarlo nelle opzioni.') }));
    const nOther = count('other');
    if (nOther) out.push(alertBox({ tone: 'info', icon: 'info', title: t('{n, plural, one {# riga non sembra un attacco} other {# righe non sembrano attacchi}}', { n: nOther }), text: t('Per esempio appuntamenti o visite: non vengono importate, ma puoi includerle.'), action: button({ label: t('Mostra'), kind: 'secondary', size: 'sm', onClick: goReview }) }));
    const sel = inc().map((r) => r.date).sort();
    if (sel.length && store.getSettings().assumeFree !== false) {
      const s = store.getSettings();
      const eff = s.diaryStart ? (st.extendStart && sel[0] < s.diaryStart ? sel[0] : s.diaryStart) : (sel[0] < idx.autoStart ? sel[0] : idx.autoStart);
      out.push(alertBox({
        tone: 'info', icon: 'calendar-check', title: t('Giorni senza emicrania'),
        text: t('Dal {data} le giornate senza attacchi contano come giorni senza emicrania. Puoi cambiarlo in Impostazioni › Inizio del diario.', { data: fmtDateShort(eff) }),
      }));
    }
    replaceChildren(warnBox, ...out);
  };

  /* ----- opzioni e farmaci ----- */
  const reparse = () => {
    parsed = parseNotes(text, {
      today, hintOrder: hintOrder(), order: st.order, baseYear: st.baseYear,
    });
  };

  const paintOptions = () => {
    const nodes = [];
    const meta = parsed.meta;
    if (!meta.orderCertain || st.order !== 'auto') {
      nodes.push(field({
        label: t('Come sono scritte le date'),
        control: segmented({
          ariaLabel: t('Formato delle date'),
          options: [{ value: 'dmy', label: t('Giorno/mese') }, { value: 'mdy', label: t('Mese/giorno') }],
          value: st.order === 'auto' ? meta.order : st.order,
          onChange: (v) => { st.order = v; touch(); reparse(); refresh(); },
        }),
        hint: t('Per esempio 03/04 è il 3 aprile se scritto giorno/mese, il 4 marzo se scritto mese/giorno.'),
      }));
    }
    if (meta.yearInferred) {
      const oldest = meta.years.length ? Number(meta.years[0]) : new Date().getFullYear();
      nodes.push(field({
        label: t('Anno della data più vecchia'),
        control: stepper({
          value: st.baseYear != null ? st.baseYear : oldest, min: 1990, max: new Date().getFullYear(), label: t('anno'), format: (v) => String(v),
          onChange: (v) => { st.baseYear = v; touch(); reparse(); refresh({ options: false }); },
        }),
        hint: t('Le note non indicano l’anno: gli altri anni seguono l’ordine delle date.'),
      }));
    }
    nodes.push(field({
      label: t('Intensità se non è indicata'),
      control: stepper({
        value: st.defaultIntensity, min: 1, max: 10, label: t('intensità'), format: (v) => String(v),
        onChange: (v) => { st.defaultIntensity = v; touch(); refresh({ options: false }); },
      }),
      hint: t('Vale per le righe senza un voto né parole come «forte» o «leggero»: le riconosci dal numero in trasparenza.'),
    }));
    const toggles = [];
    if (hasConsecutive(rows)) {
      toggles.push(toggleRow({
        icon: 'calendar', tone: 'indigo', title: t('Unisci i giorni consecutivi'), subtitle: t('Più giorni di seguito diventano un solo attacco'), checked: st.merge,
        onChange: (v) => { st.merge = v; touch(); refresh({ options: false }); },
      }));
    }
    if (rows.some((r) => r.existing)) {
      toggles.push(toggleRow({
        icon: 'check-circle', tone: 'green', title: t('Salta i giorni già nel diario'), subtitle: t('Evita doppioni se importi più volte la stessa nota'), checked: st.skipExisting,
        onChange: (v) => { st.skipExisting = v; touch(); refresh({ options: false }); },
      }));
    }
    const s = store.getSettings();
    const sel = inc().map((r) => r.date).sort();
    if (s.diaryStart && sel.length && sel[0] < s.diaryStart) {
      toggles.push(toggleRow({
        icon: 'calendar-check', tone: 'blue', title: t('Estendi l’inizio del diario'), subtitle: t('Il diario parte dal {data}: così gli attacchi importati contano nelle statistiche', { data: fmtDateShort(sel[0]) }), checked: st.extendStart,
        onChange: (v) => { st.extendStart = v; touch(); refresh({ options: false }); },
      }));
    }
    if (built.menses && !s.cycle) {
      toggles.push(toggleRow({
        icon: 'drop', tone: 'red', title: t('Attiva il ciclo mestruale'), subtitle: t('{n, plural, one {Ho trovato # giorno di mestruazioni nelle note} other {Ho trovato # giorni di mestruazioni nelle note}}', { n: built.menses }), checked: st.enableCycle,
        onChange: (v) => { st.enableCycle = v; touch(); },
      }));
    }
    if (built.events.length || rows.some((r) => r.include && (r.er || r.hosp))) {
      toggles.push(toggleRow({
        icon: 'hospital', tone: 'orange', title: t('Pronto soccorso nella storia'), subtitle: t('Aggiungi alla storia clinica le visite al pronto soccorso e i ricoveri'), checked: st.addEvents,
        onChange: (v) => { st.addEvents = v; touch(); refresh({ options: false }); },
      }));
    }
    if (toggles.length) nodes.push(group(...toggles));
    replaceChildren(optBody, ...nodes);
  };

  const paintMeds = () => {
    const list = medSummary(parsed.entries);
    medAcc.hidden = !list.length;
    medAcc.setCount(list.length);
    if (!list.length) return;
    const newOnes = list.filter((m) => !knownMeds.has(m.name.toLowerCase()));
    replaceChildren(
      medBody,
      h('p', { class: 'muted small mb' }, t('Questi sono i farmaci che ho riconosciuto. Spegni quelli che non vuoi importare.')),
      group(...list.map((m) => toggleRow({
        icon: 'pill', tone: m.unknown ? 'orange' : 'green', title: tv(m.name),
        subtitle: [t('{n, plural, one {in # attacco} other {in # attacchi}}', { n: m.count }), m.terms.length ? t('scritto: {nomi}', { nomi: listAnd(m.terms.map((x) => `«${x}»`)) }) : '', m.unknown ? t('da controllare') : ''].filter(Boolean).join(' · '),
        checked: !st.excludedMeds.has(m.name),
        onChange: (v) => { if (v) st.excludedMeds.delete(m.name); else st.excludedMeds.add(m.name); touch(); refresh({ meds: false, options: false }); },
      }))),
      newOnes.length ? footnote(t('{n, plural, one {Il farmaco nuovo verrà aggiunto all’elenco dei tuoi farmaci.} other {I farmaci nuovi verranno aggiunti all’elenco dei tuoi farmaci.}}', { n: newOnes.length })) : null,
    );
  };

  const paintFilter = () => {
    const counts = { all: rows.length, review: rows.filter((r) => r.review).length, skipped: rows.filter((r) => !r.include).length };
    replaceChildren(filterBox, chipGroup({
      options: [
        { value: 'all', label: t('Tutte ({n})', { n: counts.all }) },
        { value: 'review', label: t('Da controllare ({n})', { n: counts.review }) },
        { value: 'skipped', label: t('Escluse ({n})', { n: counts.skipped }) },
      ],
      value: st.filter,
      allowClear: false,
      onChange: (v) => { st.filter = v || 'all'; st.shown = CHUNK; paintList(); },
    }));
  };

  function refresh({ list = true, options = true, meds = true } = {}) {
    compute();
    paintSummary();
    paintWarnings();
    paintFilter();
    if (options) paintOptions();
    if (meds) paintMeds();
    if (list) paintList();
  }

  /* ----- modifica di una voce ----- */
  function openRowEditor(key) {
    const r = rows.find((x) => x.key === key);
    const raw = parsed.entries.find((e) => e.key === key);
    if (!r || !raw) return;
    const ov0 = st.overrides.get(key) || {};
    const dayKind = raw.kind === 'free' || raw.kind === 'menses';
    const draft = {
      date: r.date || '', endDate: r.endDate || '', intensity: r.intensityEff, note: r.textEff || '', include: r.include, removed: new Set(ov0.removedMeds || []), includeTouched: 'include' in ov0, asAttack: !!ov0.asAttack,
    };
    const sheet = openSheet({ title: t('Modifica la voce'), tall: true });
    const body = h('div');
    const baseline = () => annotate([raw], {
      existingDays, today, skipExisting: st.skipExisting, excludedMeds: st.excludedMeds,
    })[0].include;
    const paint = () => {
      const asDay = dayKind && !draft.asAttack;
      const meds = raw.meds.filter((m) => !st.excludedMeds.has(m.name));
      replaceChildren(
        body,
        raw.text ? h('div', { class: 'imp-orig mb' }, h('div', { class: 'field-label' }, t('Nella nota c’è scritto')), h('p', {}, raw.text)) : null,
        field({ label: t('Data'), control: dateInput({ value: draft.date, max: today, label: t('Data dell’attacco'), onChange: (v) => { draft.date = v; if (v && !draft.includeTouched) draft.include = true; } }) }),
        field({
          label: t('Ultimo giorno (se è durato più giorni)'),
          control: dateInput({ value: draft.endDate, max: today, label: t('Ultimo giorno dell’attacco'), onChange: (v) => { draft.endDate = v; } }),
        }),
        asDay ? null : field({ label: t('Intensità'), control: intensityPicker({ value: draft.intensity, onChange: (v) => { draft.intensity = v; } }) }),
        !asDay && meds.length ? field({
          label: t('Farmaci'),
          control: chipGroup({
            options: meds.map((m) => ({ value: m.name, label: medLabel(m) })),
            value: meds.filter((m) => !draft.removed.has(m.name)).map((m) => m.name),
            multi: true,
            onChange: (vals) => { draft.removed = new Set(meds.filter((m) => !vals.includes(m.name)).map((m) => m.name)); },
          }),
          hint: t('Togli la spunta a un farmaco per non importarlo.'),
        }) : null,
        asDay ? null : field({ label: t('Nota'), control: textArea({ value: draft.note, rows: 3, label: t('Nota'), onInput: (v) => { draft.note = v; } }) }),
        h('div', { class: 'mb' }, group(
          toggleRow({
            icon: 'check-circle',
            tone: 'green',
            title: asDay ? (raw.kind === 'free' ? t('Segna il giorno senza emicrania') : t('Segna il giorno del ciclo')) : t('Importa questo attacco'),
            checked: draft.include,
            onChange: (v) => { draft.include = v; draft.includeTouched = true; },
          }),
          dayKind ? toggleRow({
            icon: 'alert', tone: 'orange', title: t('È un attacco di emicrania'), subtitle: t('Importalo come attacco, con intensità e farmaci'), checked: draft.asAttack,
            onChange: (v) => { draft.asAttack = v; paint(); },
          }) : null,
        )),
        h('div', { class: 'stack' },
          button({
            label: t('Fatto'), kind: 'primary', block: true, icon: 'check', onClick: () => {
              const ov = {};
              const want = draft.include && !!draft.date;
              if (want !== baseline() || (dayKind && draft.asAttack) || !draft.date) ov.include = want;
              if (dayKind && draft.asAttack) ov.asAttack = true;
              if (draft.date !== (raw.date || '')) ov.date = draft.date || null;
              if ((draft.endDate || null) !== (raw.endDate || null) || 'date' in ov) ov.endDate = draft.endDate && draft.date && draft.endDate > draft.date ? draft.endDate : null;
              if (draft.intensity != null && draft.intensity !== raw.intensity) ov.intensity = draft.intensity;
              if (draft.note !== raw.text) ov.note = draft.note;
              if (draft.removed.size) ov.removedMeds = draft.removed;
              if (Object.keys(ov).length || st.overrides.has(key)) touch();
              if (Object.keys(ov).length) st.overrides.set(key, ov);
              else st.overrides.delete(key);
              sheet.close();
              refresh();
            },
          }),
          button({
            label: t('Ripristina la lettura originale'), kind: 'secondary', block: true, onClick: () => { st.overrides.delete(key); sheet.close(); refresh(); },
          })),
      );
    };
    paint();
    replaceChildren(sheet.body, body);
  }

  /* ----- importazione ----- */
  importBtn.addEventListener('click', async () => {
    if (!built.episodes.length && !Object.keys(built.days).length) return;
    const snapshot = store.snapshotDb();
    const s = store.getSettings();
    const sel = inc().map((r) => r.date).sort();
    const patch = {};
    if (s.diaryStart && st.extendStart && sel[0] < s.diaryStart) patch.diaryStart = sel[0];
    if (built.menses && !s.cycle && st.enableCycle) patch.cycle = true;
    const full = buildImport(rows, {
      imp: '', defaultIntensity: st.defaultIntensity, mergeConsecutive: st.merge, fmtDay: (d) => fmtDayMonth(d), knownMeds, existingErDates, addEvents: st.addEvents,
      titles: { er: t('Pronto soccorso'), hosp: t('Ricovero') },
    });
    importBtn.disabled = true;
    let res;
    try {
      res = store.addImportedEpisodes({
        episodes: full.episodes, days: full.days, events: full.events, customMeds: full.customMeds, settings: Object.keys(patch).length ? patch : null,
      });
    } catch (e) {
      importBtn.disabled = false;
      toast(e.message, { tone: 'error', duration: 9000 });
      return;
    }
    page.close();
    if (parent) parent.close();
    openResult({ res, full, snapshot });
  });

  refresh();
  replaceChildren(page.body, summaryBox, warnBox, optAcc, medAcc, filterBox, listBox);
  return page;
}

/* ---------------------------------------------------------------- risultato */

function openResult({ res, full, snapshot }) {
  const sheet = openSheet({ title: t('Importazione completata') });
  const lines = [];
  if (full.menses) lines.push(t('{n, plural, one {# giorno segnato come mestruazioni} other {# giorni segnati come mestruazioni}}', { n: full.menses }));
  if (full.freeDays) lines.push(t('{n, plural, one {# giorno segnato come senza emicrania} other {# giorni segnati come senza emicrania}}', { n: full.freeDays }));
  if (full.events.length) lines.push(t('{n, plural, one {# accesso al pronto soccorso aggiunto alla storia clinica} other {# accessi al pronto soccorso aggiunti alla storia clinica}}', { n: full.events.length }));
  if (full.customMeds.length) lines.push(t('{n, plural, one {# farmaco nuovo aggiunto all’elenco} other {# farmaci nuovi aggiunti all’elenco}}', { n: full.customMeds.length }));
  if (full.merged) lines.push(t('{n, plural, one {# voce unita a un’altra} other {# voci unite ad altre}}', { n: full.merged }));
  const headline = res.added
    ? t('{n, plural, one {Aggiunto # attacco} other {Aggiunti # attacchi}} al diario', { n: res.added })
    : t('{n, plural, one {Segnato # giorno} other {Segnati # giorni}} nel diario', { n: Object.keys(full.days).length });
  replaceChildren(
    sheet.body,
    h('div', { class: 'imp-done' }, h('span', { class: 'imp-done-icon' }, icon('check', 34))),
    h('p', { class: 'center', style: { fontSize: '1.05rem', fontWeight: '600', marginBottom: '6px' } }, headline),
    full.first ? h('p', { class: 'muted center', style: { marginBottom: '14px' } }, t('dal {da} al {a}', { da: fmtDateShort(full.first), a: fmtDateShort(full.last) })) : null,
    lines.length ? ul(...lines) : null,
    h('p', { class: 'muted small mb' }, t('Il testo originale di ogni riga è nella nota dell’attacco. Puoi modificare o eliminare ogni attacco come al solito.')),
    h('div', { class: 'stack' },
      button({
        label: t('Vai al diario'), kind: 'primary', size: 'lg', block: true, icon: 'calendar', onClick: () => {
          sheet.close();
          closeAllOverlays();
          document.dispatchEvent(new CustomEvent('emicrania:goto', { detail: { tab: 'calendar', month: full.first ? monthOf(full.first) : null } })); // i18n-ignore
        },
      }),
      button({
        label: t('Annulla importazione'), kind: 'danger', block: true, onClick: async () => {
          const ok = await confirmDialog({
            title: t('Annullare l’importazione?'), message: t('Gli attacchi importati e le impostazioni cambiate dall’importazione verranno tolti: i dati tornano come prima.'), confirmLabel: t('Annulla importazione'), cancelLabel: t('Indietro'), danger: true,
          });
          if (!ok) return;
          try {
            store.restoreSnapshot(snapshot);
            sheet.close();
            toast(t('Importazione annullata'));
          } catch (e) {
            toast(e.message, { tone: 'error' });
          }
        },
      })),
  );
}
