import { h, replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import { t, collate } from '../i18n.js';
import * as store from '../store.js';
import {
  openPage, confirmDialog, toast, row, group, section, footnote, field, button, card, chipGroup, textArea, textInput, dateTimeInput, toggleRow, emptyState, pill,
} from '../ui.js';
import { CONTACT_ROLES, VISIT_KINDS, contactRole, visitKindLabel } from '../data.js';
import {
  nowStr, todayStr, fmtDateMedium, fmtTime, capitalize,
} from '../dates.js';
import { exportEventIcs } from '../exporter.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const ROLE_TONES = {
  center: 'red', neuro: 'indigo', gp: 'blue', hospital: 'orange', pharmacy: 'green', other: 'gray',
};

export const contactName = (db, id) => {
  const c = db.contacts.find((x) => x.id === id);
  return c ? c.name : '';
};

export function upcomingVisits(db, now = nowStr()) {
  return db.visits.filter((v) => v.at >= now.slice(0, 10)).sort((a, b) => (a.at < b.at ? -1 : 1));
}

export function visitWhen(v) {
  return t('{data}, ore {ora}', { data: capitalize(fmtDateMedium(v.at)), ora: fmtTime(v.at) });
}

function telHref(phone) {
  const n = String(phone || '').replace(/[^\d+]/g, '');
  return n ? `tel:${n}` : null; // i18n-ignore
}

function contactSubtitle(c) {
  return [contactRole(c.role).label, c.org, c.dept].filter(Boolean).join(' · ');
}

function editorPage({ title, draft, build, onSave, onDelete = null }) {
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
  const nodes = build(draft);
  if (onDelete) {
    nodes.push(button({
      label: t('Elimina'),
      kind: 'danger',
      icon: 'trash',
      block: true,
      onClick: async () => {
        if (!(await confirmDialog({ title: t('Eliminare?'), message: t('Potrai annullare subito dopo.'), confirmLabel: t('Elimina'), danger: true }))) return;
        page.close();
        onDelete();
      },
    }));
  }
  replaceChildren(page.body, ...nodes);
  saveBtn.addEventListener('click', () => {
    let res;
    try {
      res = onSave(draft);
    } catch (e) {
      toast(e.message || t('Controlla i dati inseriti.'), { tone: 'error' });
      return;
    }
    if (res === false) return;
    page.close();
  });
  return page;
}

/* ---------- contatti ---------- */

export function openContactEditor(existing = null, { onDone = null } = {}) {
  const draft = existing ? clone(existing) : {
    name: '', role: 'center', org: '', dept: '', address: '', phone: '', phone2: '', email: '', hours: '', note: '', main: !store.getDb().contacts.length,
  };
  const textField = (key, label, placeholder, opts = {}) => field({
    label,
    control: textInput({
      value: draft[key], placeholder, label, maxLength: opts.max || 120, type: opts.type || 'text', inputMode: opts.inputMode || null, onInput: (v) => { draft[key] = v; },
    }),
  });
  return editorPage({
    title: existing ? t('Modifica contatto') : t('Nuovo contatto'),
    draft,
    build: (d) => [
      card(
        field({ label: t('Tipo'), control: chipGroup({ options: CONTACT_ROLES.map((r) => ({ value: r.id, label: r.label })), value: d.role, allowClear: false, onChange: (v) => { d.role = v || 'other'; } }) }),
        textField('name', t('Nome'), t('es. Centro Cefalee – Neurologia oppure Dr.ssa Rossi')),
        textField('org', t('Ospedale o struttura'), t('es. Ospedale San Raffaele')),
        textField('dept', t('Reparto o ambulatorio'), t('es. Ambulatorio cefalee, piano 2')),
      ),
      card(
        textField('phone', t('Telefono'), t('es. 02 1234 5678'), { type: 'tel', inputMode: 'tel', max: 40 }),
        textField('phone2', t('Altro telefono (CUP, segreteria…)'), '', { type: 'tel', inputMode: 'tel', max: 40 }),
        textField('email', t('Email'), t('es. cefalee@ospedale.it'), { type: 'email', inputMode: 'email' }),
        textField('address', t('Indirizzo'), t('Via, numero, città'), { max: 200 }),
        textField('hours', t('Orari'), t('es. Lun–Ven 9–13'), { max: 160 }),
        field({
          label: t('Note'), control: textArea({ value: d.note, rows: 3, maxLength: 1000, label: t('Note sul contatto'), placeholder: t('Come prenotare, nome dell’infermiera di riferimento…'), onInput: (v) => { d.note = v; } }),
        }),
      ),
      group(toggleRow({ icon: 'hospital', tone: 'red', title: t('Centro di riferimento principale'), subtitle: t('Mostrato per primo e nel report'), checked: d.main, onChange: (v) => { d.main = v; } })),
    ],
    onSave: (d) => {
      if (!d.name.trim()) throw new Error(t('Scrivi il nome.'));
      if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) throw new Error(t('L’indirizzo email non è valido.'));
      if (d.main) store.getDb().contacts.filter((c) => c.main && (!existing || c.id !== existing.id)).forEach((c) => store.upsertRecord('contacts', { ...c, main: false }));
      const saved = store.upsertRecord('contacts', { ...d, id: existing ? existing.id : undefined });
      toast(t('Contatto salvato'));
      if (onDone) onDone(saved);
      return true;
    },
    onDelete: existing ? () => {
      const removed = store.removeRecord('contacts', existing.id);
      toast(t('Contatto eliminato'), { action: { label: t('Annulla§undo'), onClick: () => store.upsertRecord('contacts', removed) } });
      if (onDone) onDone(null);
    } : null,
  });
}

export function openContactDetail(id) {
  const page = openPage({ title: t('Contatto') });
  const render = () => {
    const db = store.getDb();
    const c = db.contacts.find((x) => x.id === id);
    if (!c) {
      page.close();
      return;
    }
    page.setTitle(c.name);
    page.setRight(h('button', { type: 'button', class: 'bar-btn', onclick: () => openContactEditor(c) }, t('Modifica')));
    const actions = [];
    if (c.phone) actions.push(row({ icon: 'phone', tone: 'green', title: t('Chiama'), subtitle: c.phone, href: telHref(c.phone) }));
    if (c.phone2) actions.push(row({ icon: 'phone', tone: 'green', title: t('Chiama (altro numero)'), subtitle: c.phone2, href: telHref(c.phone2) }));
    if (c.email) actions.push(row({ icon: 'mail', tone: 'blue', title: t('Scrivi un’email'), subtitle: c.email, href: `mailto:${c.email}` }));
    if (c.address) actions.push(row({ icon: 'pin', tone: 'red', title: t('Apri in Mappe'), subtitle: c.address, href: `https://maps.apple.com/?q=${encodeURIComponent([c.org, c.address].filter(Boolean).join(', '))}`, target: '_blank' }));
    const docs = db.docs.filter((d) => d.contactId === c.id).length;
    const visits = db.visits.filter((v) => v.contactId === c.id);
    replaceChildren(
      page.body,
      card(
        h('div', { class: 'flex', style: { alignItems: 'flex-start' } },
          h('span', { class: `row-icon ${ROLE_TONES[c.role] || 'gray'}` }, icon(contactRole(c.role).icon, 18)),
          h('div', { style: { minWidth: '0' } },
            h('div', { style: { fontSize: '1.2rem', fontWeight: '700' } }, c.name),
            h('div', { class: 'muted small' }, contactSubtitle(c)),
            c.main ? h('div', { style: { marginTop: '6px' } }, pill(t('Centro principale'), 'red')) : null)),
        c.hours ? h('div', { class: 'kv', style: { marginTop: '8px' } }, h('span', {}, t('Orari')), h('b', {}, c.hours)) : null,
        c.note ? h('p', { class: 'muted pre', style: { marginTop: '8px' } }, c.note) : null,
      ),
      actions.length ? group(...actions) : null,
      group(
        row({ icon: 'calendar', tone: 'indigo', title: t('Visite'), right: String(visits.length), chevron: true, onClick: () => openCare() }),
        row({
          icon: 'folder', tone: 'blue', title: t('Documenti'), right: String(docs), chevron: true,
          onClick: async () => {
            const { openDocuments } = await import('./documents.js');
            openDocuments({ contactId: c.id });
          },
        }),
      ),
    );
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}

/* ---------- visite ---------- */

export function contactSelect({ value, onChange, label = t('Centro o medico') }) {
  const db = store.getDb();
  const sel = h('select', { class: 'input select', 'aria-label': label }, h('option', { value: '' }, t('Nessuno')), db.contacts.map((c) => h('option', { value: c.id }, c.name)));
  sel.value = value || '';
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

export function openVisitEditor(existing = null, { onDone = null, preset = {} } = {}) {
  const db = store.getDb();
  const main = db.contacts.find((c) => c.main) || db.contacts[0];
  const base = `${todayStr()}T09:00`;
  const draft = existing ? clone(existing) : {
    at: base, kind: 'visit', contactId: main ? main.id : '', place: '', note: '', questions: '', outcome: '', ...preset,
  };
  return editorPage({
    title: existing ? t('Modifica visita') : t('Nuova visita'),
    draft,
    build: (d) => [
      card(
        field({ label: t('Quando'), control: dateTimeInput({ value: d.at, label: t('Data e ora della visita'), onChange: (v) => { if (v) d.at = v; } }) }),
        field({ label: t('Tipo'), control: chipGroup({ options: VISIT_KINDS.map((k) => ({ value: k.id, label: k.label })), value: d.kind, allowClear: false, onChange: (v) => { d.kind = v || 'other'; } }) }),
        field({ label: t('Centro o medico'), control: contactSelect({ value: d.contactId, onChange: (v) => { d.contactId = v; } }), hint: db.contacts.length ? null : t('Aggiungi il tuo centro cefalee in «Centri e medici» per collegarlo alle visite.') }),
        field({ label: t('Luogo'), control: textInput({ value: d.place, placeholder: t('es. Padiglione B, ambulatorio 3'), maxLength: 160, label: t('Luogo della visita'), onInput: (v) => { d.place = v; } }) }),
      ),
      card(
        field({
          label: t('Domande da fare al medico'),
          control: textArea({ value: d.questions, rows: 4, maxLength: 2000, label: t('Domande da fare'), placeholder: t('Annota qui le domande man mano che ti vengono in mente…'), onInput: (v) => { d.questions = v; } }),
        }),
        field({
          label: t('Esito della visita'),
          control: textArea({ value: d.outcome, rows: 4, maxLength: 3000, label: t('Esito della visita'), placeholder: t('Cosa ha detto il medico, cambi di terapia, prossimo controllo…'), onInput: (v) => { d.outcome = v; } }),
        }),
        field({ label: t('Note'), control: textArea({ value: d.note, rows: 2, maxLength: 1000, label: t('Note sulla visita'), onInput: (v) => { d.note = v; } }) }),
      ),
    ],
    onSave: (d) => {
      const saved = store.upsertRecord('visits', { ...d, id: existing ? existing.id : undefined });
      const future = saved.at >= nowStr();
      toast(t('Visita salvata'), future ? { action: { label: t('Al Calendario'), onClick: () => visitToCalendar(saved) } } : {});
      if (onDone) onDone(saved);
      return true;
    },
    onDelete: existing ? () => {
      const removed = store.removeRecord('visits', existing.id);
      toast(t('Visita eliminata'), { action: { label: t('Annulla§undo'), onClick: () => store.upsertRecord('visits', removed) } });
    } : null,
  });
}

export function visitToCalendar(v) {
  const db = store.getDb();
  const c = db.contacts.find((x) => x.id === v.contactId);
  const location = [v.place, c && c.org, c && c.address].filter(Boolean).join(', ');
  const contactLine = c ? (c.phone ? t('{nome} – tel. {telefono}', { nome: c.name, telefono: c.phone }) : c.name) : '';
  const description = [contactLine, v.questions ? `${t('Domande:')}\n${v.questions}` : ''].filter(Boolean).join('\n\n');
  return exportEventIcs({
    uid: `visit-${v.id}`, title: `${visitKindLabel(v.kind)}${c ? ` – ${c.name}` : ''}`, at: v.at, durationMin: 60, location, description, // i18n-ignore
  });
}

function visitRow(v, db, onClick) {
  const c = db.contacts.find((x) => x.id === v.contactId);
  return row({
    icon: v.kind === 'botox' || v.kind === 'infusion' ? 'syringe' : (v.kind === 'exam' ? 'scan' : 'stethoscope'),
    tone: v.at >= nowStr() ? 'indigo' : 'gray',
    title: visitKindLabel(v.kind),
    subtitle: [visitWhen(v), c ? c.name : '', v.outcome ? t('esito registrato') : ''].filter(Boolean).join('\n'),
    chevron: true,
    onClick,
  });
}

export function openCare() {
  const page = openPage({ title: t('Centro curante e visite') });
  let showAll = false;
  const render = () => {
    const top = page.body.scrollTop;
    const db = store.getDb();
    const now = nowStr();
    const contacts = [...db.contacts].sort((a, b) => (b.main - a.main) || collate(a.name, b.name));
    const upcoming = db.visits.filter((v) => v.at >= now).sort((a, b) => (a.at < b.at ? -1 : 1));
    const past = db.visits.filter((v) => v.at < now).sort((a, b) => (a.at < b.at ? 1 : -1));
    const shownPast = showAll ? past : past.slice(0, 6);
    replaceChildren(
      page.body,
      h('p', { class: 'page-intro' }, t('I riferimenti del centro che ti segue e le visite, con le domande da fare e l’esito di ognuna.')),
      section(t('Centri e medici'), contacts.length ? group(...contacts.map((c) => row({
        icon: contactRole(c.role).icon,
        tone: ROLE_TONES[c.role] || 'gray',
        title: c.name,
        subtitle: [contactSubtitle(c), c.phone].filter(Boolean).join('\n'),
        right: c.main ? pill(t('Principale'), 'red') : null,
        chevron: true,
        onClick: () => openContactDetail(c.id),
      }))) : null, group(row({ icon: 'plus', tone: 'green', title: t('Aggiungi centro o medico'), onClick: () => openContactEditor(null) }))),
      section(t('Prossime visite'), upcoming.length ? group(...upcoming.map((v) => visitRow(v, db, () => openVisitEditor(v)))) : card(h('p', { class: 'muted' }, t('Nessuna visita in programma.'))), group(row({ icon: 'calendar-plus', tone: 'indigo', title: t('Aggiungi una visita'), onClick: () => openVisitEditor(null) }))),
      past.length ? section(t('Visite passate'), group(...shownPast.map((v) => visitRow(v, db, () => openVisitEditor(v)))), past.length > shownPast.length ? button({ label: t('Mostra tutte ({n})', { n: past.length }), kind: 'ghost', block: true, onClick: () => { showAll = true; render(); } }) : null) : null,
      !contacts.length && !db.visits.length ? emptyState({ icon: 'hospital', title: t('Il tuo centro curante'), text: t('Salva qui telefono, email e indirizzo del centro cefalee o del neurologo: li avrai a portata di mano e compariranno nel report.') }) : null,
      footnote(t('Dopo aver salvato una visita futura puoi aggiungerla al Calendario dell’iPhone per ricevere un promemoria.')),
    );
    page.body.scrollTop = top;
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}
