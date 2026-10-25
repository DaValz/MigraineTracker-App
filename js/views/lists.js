import { h, replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import {
  openPage, promptDialog, confirmDialog, row, group, section, footnote, switchControl, toast,
} from '../ui.js';
import { MED_CLASSES, LIST_KINDS, medClassLabel } from '../data.js';

export async function promptNewMed() {
  const select = h('select', { class: 'input', 'aria-label': 'Tipo di farmaco' }, MED_CLASSES.map((c) => h('option', { value: c.id }, c.label)));
  select.value = 'other';
  const extra = h('div', {}, h('div', { class: 'field-label' }, 'Che tipo di farmaco è?'), select, h('p', { class: 'field-hint' }, 'Serve per avvisarti se usi troppo spesso farmaci sintomatici.'));
  const name = await promptDialog({
    title: 'Nuovo farmaco', placeholder: 'Nome del farmaco', confirmLabel: 'Aggiungi', extra,
  });
  if (!name) return null;
  const res = store.addCustomItem('meds', { name, cls: select.value });
  if (!res.ok && res.reason !== 'duplicate') return null;
  const found = store.manageItems('meds').find((m) => m.label.toLowerCase() === name.toLowerCase());
  if (res.reason === 'duplicate') toast('Questo farmaco è già in elenco');
  return found ? { name: found.label, cls: found.cls || select.value } : null;
}

export async function promptNewItem(kind) {
  const meta = LIST_KINDS[kind];
  const label = await promptDialog({
    title: `Nuovo ${meta.singular}`,
    placeholder: kind === 'triggers' ? 'es. Profumo forte' : 'es. Formicolio alla mano',
    confirmLabel: 'Aggiungi',
  });
  if (!label) return null;
  const res = store.addCustomItem(kind, label);
  if (res.ok) return res.label;
  if (res.reason === 'duplicate') {
    toast('Già presente in elenco');
    return res.label;
  }
  return null;
}

export function openListManager(kind) {
  const meta = LIST_KINDS[kind];
  const page = openPage({ title: meta.title });
  const render = () => {
    const top = page.body.scrollTop;
    const items = store.manageItems(kind);
    const addRow = row({
      icon: 'plus',
      tone: 'green',
      title: `Aggiungi ${meta.singular}`,
      onClick: async () => {
        if (kind === 'meds') await promptNewMed();
        else await promptNewItem(kind);
        render();
      },
    });
    const rows = items.map((it) => {
      const sw = switchControl({
        checked: !it.hidden,
        label: `Mostra ${it.label}`,
        onChange: (on) => store.setItemHidden(kind, it.key, !on),
      });
      const del = it.custom ? h('button', {
        type: 'button',
        class: 'icon-btn flat',
        'aria-label': `Elimina ${it.label}`,
        onclick: async () => {
          const ok = await confirmDialog({
            title: `Eliminare «${it.label}»?`,
            message: 'Resterà nelle registrazioni già salvate, ma non sarà più proposto.',
            confirmLabel: 'Elimina',
            danger: true,
          });
          if (ok) {
            store.removeCustomItem(kind, it.key);
            render();
          }
        },
      }, icon('trash', 18)) : null;
      const sub = kind === 'meds' ? [medClassLabel(it.cls), it.hint].filter(Boolean).join(' · ') : (it.custom ? 'Personalizzato' : '');
      return h(
        'div',
        { class: 'row' },
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, it.label), sub ? h('span', { class: 'row-sub' }, sub) : null),
        h('span', { class: 'row-right' }, del, sw),
      );
    });
    replaceChildren(
      page.body,
      group(addRow),
      section('Elenco', group(...rows)),
      footnote('Gli elementi disattivati non compaiono più quando registri un attacco, ma restano nei dati già salvati.'),
    );
    page.body.scrollTop = top;
  };
  render();
  return page;
}
