import { h, replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import {
  openPage, openSheet, openDialog, toast, confirmDialog, promptDialog, row, group, section, footnote, toggleRow, segmented, card, cardTitle,
  button, timeInput, dateInput, switchControl,
} from '../ui.js';
import { APP_NAME, APP_VERSION } from '../data.js';
import {
  fmtDateTime, fmtDateShort, todayStr, diffDays,
} from '../dates.js';
import { plural, bytes } from '../format.js';
import { applyTheme } from '../theme.js';
import { getIndex } from '../analysis.js';
import { openListManager } from './lists.js';
import { openLocationSheet, describeLocation, maybeSyncWeather } from '../weather.js';
import { setupPin, removePin, pinSupported } from '../lock.js';
import { exportCsv, exportReminder } from '../exporter.js';
import {
  exportBackup, exportJsonBackup, exportZipBackup, readBackupFile, applyBackup, docsSize,
} from '../backup.js';
import { storageInfo, filesSupported } from '../files.js';
import { openHelp } from './help.js';
import { openRelief } from './relief.js';

const LOCK_OPTIONS = [
  { v: 0, label: 'Subito' }, { v: 60, label: 'Dopo 1 minuto' }, { v: 300, label: 'Dopo 5 minuti' }, { v: 900, label: 'Dopo 15 minuti' },
];
const BACKUP_OPTIONS = [
  { v: 0, label: 'Mai' }, { v: 14, label: 'Ogni 2 settimane' }, { v: 30, label: 'Ogni mese' }, { v: 60, label: 'Ogni 2 mesi' }, { v: 90, label: 'Ogni 3 mesi' },
];

export function backupLabel(s) {
  if (!s.lastBackupAt) return 'Mai';
  const d = diffDays(s.lastBackupAt.slice(0, 10), todayStr());
  if (d === 0) return 'Oggi';
  if (d === 1) return 'Ieri';
  return `${d} giorni fa`;
}

function selectRow({ icon: ic, tone, title, value, options, onChange }) {
  const select = h('select', { class: 'input select', 'aria-label': title }, options.map((o) => h('option', { value: String(o.v) }, o.label)));
  select.value = String(value);
  select.addEventListener('change', () => onChange(Number(select.value)));
  return h(
    'label',
    { class: 'row' },
    ic ? h('span', { class: `row-icon ${tone || ''}`.trim() }, icon(ic, 18)) : null,
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title)),
    select,
  );
}

async function wipeEverything() {
  const first = await confirmDialog({
    title: 'Cancellare tutti i dati?',
    message: 'Verranno eliminati da questo telefono attacchi, giornate, terapie, storia clinica, documenti e impostazioni. Se non hai un backup non potrai recuperarli.',
    confirmLabel: 'Continua',
    danger: true,
  });
  if (!first) return false;
  const second = await confirmDialog({
    title: 'Ultima conferma', message: 'Questa azione non si può annullare. Vuoi davvero cancellare tutto?', confirmLabel: 'Cancella tutto', danger: true,
  });
  if (!second) return false;
  store.wipeAll();
  applyTheme();
  toast('Tutti i dati sono stati cancellati');
  return true;
}

function openDiaryStartSheet() {
  const sheet = openSheet({ title: 'Inizio del diario' });
  const db = store.getDb();
  const idx = getIndex(db, store.getRev(), todayStr());
  let auto = !db.settings.diaryStart;
  let value = db.settings.diaryStart || idx.autoStart;
  const dateBox = h('div');
  const paint = () => replaceChildren(dateBox, auto ? null : dateInput({ value, max: todayStr(), label: 'Inizio del diario completo', onChange: (v) => { if (v) value = v; } }));
  paint();
  const sw = h('label', { class: 'row check-row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'Automatico'), h('span', { class: 'row-sub' }, `Dal primo dato registrato (${fmtDateShort(idx.autoStart)})`)));
  sw.appendChild(switchControl({ checked: auto, label: 'Inizio automatico', onChange: (v) => { auto = v; paint(); } }));
  replaceChildren(
    sheet.body,
    h('p', { class: 'muted mb' }, 'Dalla data in cui il diario è completo, i giorni senza attacchi registrati contano come giorni senza emicrania. Gli attacchi più vecchi restano visibili nel calendario ma non entrano nelle statistiche.'),
    card(sw, dateBox),
    button({
      label: 'Salva',
      kind: 'primary',
      block: true,
      onClick: () => {
        store.updateSettings({ diaryStart: auto ? null : value });
        sheet.close();
        toast('Inizio del diario aggiornato');
      },
    }),
  );
}

export function openDataPage() {
  const page = openPage({ title: 'Dati e backup' });
  const fileInput = h('input', {
    type: 'file', accept: '.json,.zip,application/json,application/zip', hidden: true, 'aria-hidden': 'true',
  });
  const render = () => {
    const db = store.getDb();
    const s = db.settings;
    const auto = store.getAutoBackupInfo();
    const nodes = [];
    const hasDocs = db.docs.length > 0;
    nodes.push(card(
      cardTitle('Backup'),
      h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'I dati vivono solo su questo telefono. Salva ogni tanto un backup in File o iCloud Drive: se cancelli l’app o cambi telefono, potrai ripristinarlo.'),
      h('p', { class: 'small', style: { marginBottom: '14px', fontWeight: '600' } }, s.lastBackupAt ? `Ultimo backup: ${fmtDateTime(s.lastBackupAt)}` : 'Non hai ancora fatto un backup.'),
      h('div', { class: 'btn-row' },
        button({ label: 'Esporta', kind: 'primary', icon: 'download', onClick: async () => { await exportBackup(); render(); } }),
        button({ label: 'Ripristina', kind: 'secondary', icon: 'upload', onClick: () => fileInput.click() })),
      hasDocs ? h('p', { class: 'field-hint', style: { marginTop: '10px' } }, `Il backup completo (ZIP) include anche i ${plural(db.docs.length, 'documento', 'documenti')} della cartella clinica (${bytes(docsSize(db))}).`) : null,
    ));
    if (hasDocs) {
      nodes.push(group(
        row({ icon: 'folder', tone: 'blue', title: 'Backup completo con documenti (ZIP)', chevron: true, onClick: async () => { await exportZipBackup(); render(); } }),
        row({ icon: 'file', tone: 'gray', title: 'Solo dati del diario (JSON)', chevron: true, onClick: async () => { await exportJsonBackup(); render(); } }),
      ));
    }
    nodes.push(card(
      cardTitle('Esporta per il computer'),
      h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'File CSV apribili con Excel o Numbers.'),
      h('div', { class: 'btn-row' },
        button({ label: 'Attacchi', kind: 'secondary', icon: 'file', onClick: () => exportCsv('episodes') }),
        button({ label: 'Giornate', kind: 'secondary', icon: 'calendar', onClick: () => exportCsv('days') })),
    ));
    if (auto) {
      nodes.push(group(row({
        icon: 'refresh',
        tone: 'orange',
        title: 'Copia automatica',
        subtitle: `${fmtDateShort(auto.date)} · ${plural(auto.episodes, 'attacco', 'attacchi')}. Ripristina se hai perso dati di recente.`,
        chevron: true,
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Ripristinare la copia automatica?', message: `Sostituirà i dati attuali con quelli salvati il ${fmtDateShort(auto.date)}. I documenti non vengono toccati.`, confirmLabel: 'Ripristina', danger: true,
          });
          if (!ok) return;
          try {
            store.importReplace(auto.db, { withDocs: false });
            applyTheme();
            toast('Copia automatica ripristinata');
            render();
          } catch (e) {
            toast(e.message, { tone: 'error' });
          }
        },
      })));
    }
    const persistRow = h('p', { class: 'footnote' }, '');
    nodes.push(persistRow);
    Promise.all([
      navigator.storage && navigator.storage.persisted ? navigator.storage.persisted().catch(() => null) : Promise.resolve(null),
      storageInfo(),
    ]).then(([persisted, info]) => {
      const parts = [];
      if (info) parts.push(`Spazio usato dall’app: ${bytes(info.usage)}${info.quota ? ` su ${bytes(info.quota)} disponibili` : ''}.`);
      if (persisted === true) parts.push('Il sistema protegge i dati dalla cancellazione automatica.');
      else if (persisted === false) parts.push('Il sistema potrebbe cancellare i dati se lo spazio scarseggia: fai un backup ogni tanto.');
      persistRow.textContent = parts.join(' ');
      if (persisted === false && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    });
    replaceChildren(page.body, ...nodes, fileInput);
  };

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const parsed = await readBackupFile(file);
      const inc = parsed.incoming;
      const nEp = Object.keys(inc.episodes).length;
      const nDays = Object.keys(inc.days).length;
      const extra = [];
      if (inc.preventives.length) extra.push(plural(inc.preventives.length, 'terapia', 'terapie'));
      if (parsed.withDocs && inc.docs.length) extra.push(plural(inc.docs.length, 'documento', 'documenti'));
      const choice = await openDialog({
        title: 'Ripristinare il backup?',
        message: `Il file contiene ${plural(nEp, 'attacco', 'attacchi')} e ${plural(nDays, 'giornata registrata', 'giornate registrate')}${extra.length ? `, ${extra.join(', ')}` : ''}.${!parsed.withDocs && store.getDb().docs.length ? ' I documenti attuali restano invariati.' : ''}`,
        dismissValue: null,
        buttons: [
          { label: 'Unisci ai dati attuali', value: 'merge', kind: 'primary' },
          { label: 'Sostituisci tutto', value: 'replace', kind: 'danger' },
          { label: 'Annulla', value: null },
        ],
      });
      if (!choice) return;
      toast('Ripristino in corso…', { duration: 15000 });
      const res = await applyBackup(parsed, choice);
      applyTheme();
      if (choice === 'merge') toast(`Aggiunti ${plural(res.added || 0, 'attacco', 'attacchi')}${res.docsAdded ? ` e ${plural(res.docsAdded, 'documento', 'documenti')}` : ''}`);
      else toast('Backup ripristinato');
      render();
    } catch (e) {
      toast(e.message || 'Impossibile leggere il file', { tone: 'error' });
    }
  });
  render();
  return page;
}

export function openSettings() {
  const page = openPage({ title: 'Impostazioni' });
  let pinLen = 4;

  const render = () => {
    const top = page.body.scrollTop;
    const db = store.getDb();
    const s = db.settings;
    const idx = getIndex(db, store.getRev(), todayStr());
    const nodes = [];

    nodes.push(group(row({
      icon: 'person',
      tone: 'gray',
      title: s.name || 'Il tuo nome',
      subtitle: 'Appare nel report e nella sintesi per il medico',
      chevron: true,
      onClick: async () => {
        const name = await promptDialog({
          title: 'Il tuo nome', value: s.name, placeholder: 'Nome e cognome', maxLength: 60, inputMode: 'text',
        });
        if (name !== null) {
          store.updateSettings({ name });
          render();
        }
      },
    })));

    nodes.push(section(
      'Aspetto',
      card(
        segmented({
          options: [{ value: 'auto', label: 'Automatico' }, { value: 'light', label: 'Chiaro' }, { value: 'dark', label: 'Scuro' }],
          value: s.theme,
          ariaLabel: 'Tema',
          onChange: (v) => {
            store.updateSettings({ theme: v });
            applyTheme();
          },
        }),
        h('p', { class: 'field-hint', style: { marginTop: '8px' } }, 'Il tema scuro è più delicato con la sensibilità alla luce.'),
      ),
    ));

    const weatherRows = [
      toggleRow({
        icon: 'cloud',
        tone: 'blue',
        title: 'Meteo e pressione',
        subtitle: 'Salva pressione e temperatura di ogni giorno per cercare collegamenti con l’emicrania',
        checked: s.weatherOn && !!s.weatherLoc,
        onChange: (on) => {
          if (!on) {
            store.updateSettings({ weatherOn: false });
            render();
          } else if (s.weatherLoc) {
            store.updateSettings({ weatherOn: true });
            maybeSyncWeather(true);
            render();
          } else {
            render();
            openLocationSheet({ onDone: render });
          }
        },
      }),
    ];
    if (s.weatherOn && s.weatherLoc) {
      weatherRows.push(row({
        icon: 'pin', tone: 'blue', title: 'Posizione', right: describeLocation(s.weatherLoc), chevron: true, onClick: () => openLocationSheet({ onDone: render }),
      }));
    }
    nodes.push(section(
      'Diario',
      group(
        row({
          icon: 'calendar', tone: 'indigo', title: 'Inizio del diario', right: `${fmtDateShort(idx.trackingStart)}${s.diaryStart ? '' : ' (auto)'}`, chevron: true, onClick: () => openDiaryStartSheet(),
        }),
        toggleRow({
          icon: 'calendar-check',
          tone: 'green',
          title: 'Giorni senza registrazioni = senza emicrania',
          subtitle: 'Se disattivato, contano solo i giorni che confermi',
          checked: s.assumeFree,
          onChange: (v) => store.updateSettings({ assumeFree: v }),
        }),
        toggleRow({
          icon: 'drop',
          tone: 'red',
          title: 'Tracciamento del ciclo mestruale',
          subtitle: 'Aggiunge il campo nei dettagli della giornata e un’analisi dedicata',
          checked: s.cycle,
          onChange: (v) => store.updateSettings({ cycle: v }),
        }),
      ),
      group(...weatherRows),
    ));

    nodes.push(section(
      'Elenchi',
      group(
        row({ icon: 'bolt', tone: 'orange', title: 'Fattori scatenanti', chevron: true, onClick: () => openListManager('triggers') }),
        row({ icon: 'activity', tone: 'blue', title: 'Sintomi associati', chevron: true, onClick: () => openListManager('symptoms') }),
        row({ icon: 'pill', tone: 'green', title: 'Farmaci per l’attacco', chevron: true, onClick: () => openListManager('meds') }),
      ),
    ));

    const lockNodes = [];
    if (s.pin) {
      lockNodes.push(group(
        row({
          icon: 'lock',
          tone: 'green',
          title: 'Blocco con PIN attivo',
          subtitle: `PIN a ${s.pin.len || 4} cifre`,
          right: 'Disattiva',
          onClick: async () => {
            if (await removePin()) {
              toast('Blocco disattivato');
              render();
            }
          },
        }),
        row({
          icon: 'refresh',
          tone: 'blue',
          title: 'Cambia PIN',
          chevron: true,
          onClick: async () => {
            if (await removePin()) {
              if (await setupPin(s.pin.len || 4)) toast('PIN aggiornato');
              render();
            }
          },
        }),
        selectRow({
          icon: 'clock', tone: 'orange', title: 'Blocca l’app', value: s.lockAfter, options: LOCK_OPTIONS, onChange: (v) => store.updateSettings({ lockAfter: v }),
        }),
      ));
    } else {
      lockNodes.push(card(
        cardTitle('Blocco con PIN'),
        h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'Chiede un PIN quando riapri l’app, così nessun altro può sfogliare il tuo diario e la tua cartella clinica.'),
        segmented({
          options: [{ value: 4, label: '4 cifre' }, { value: 6, label: '6 cifre' }],
          value: pinLen,
          ariaLabel: 'Lunghezza del PIN',
          onChange: (v) => { pinLen = v; },
          cls: 'mb',
        }),
        button({
          label: 'Attiva il blocco',
          kind: 'secondary',
          icon: 'lock',
          block: true,
          disabled: !pinSupported(),
          onClick: async () => {
            if (await setupPin(pinLen)) {
              toast('Blocco con PIN attivato');
              render();
            }
          },
        }),
      ));
    }
    nodes.push(section('Sicurezza', ...lockNodes, footnote('Il PIN impedisce l’accesso casuale all’app ma non cifra i dati. Se lo dimentichi dovrai cancellare i dati dell’app: tieni un backup aggiornato.')));

    const timeIn = timeInput({
      value: s.reminderTime,
      label: 'Orario del promemoria',
      onChange: (v) => { if (v) store.updateSettings({ reminderTime: v }); },
    });
    nodes.push(section(
      'Promemoria giornaliero',
      card(
        h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'Le app web su iPhone non possono inviare notifiche da sole. Aggiungi un evento ripetuto al Calendario: ti ricorderà ogni giorno di registrare come stai.'),
        h('div', { class: 'two-col' }, h('div', {}, h('div', { class: 'field-label' }, 'Orario'), timeIn), h('div', { style: { alignSelf: 'end' } }, button({ label: 'Aggiungi', kind: 'secondary', icon: 'bell', block: true, onClick: async () => { const r = await exportReminder(store.getSettings().reminderTime); if (r === 'shared') toast('Scegli «Calendario» per aggiungerlo'); } }))),
        h('p', { class: 'field-hint', style: { marginTop: '10px' } }, 'Se il Calendario non si apre, crea a mano un promemoria ripetuto ogni giorno nell’app Promemoria.'),
      ),
    ));

    nodes.push(section(
      'Dati',
      group(
        row({
          icon: 'download', tone: 'green', title: 'Dati e backup', subtitle: `Ultimo backup: ${backupLabel(s)}`, chevron: true, onClick: () => openDataPage(),
        }),
        selectRow({
          icon: 'shield', tone: 'green', title: 'Ricordami il backup', value: s.backupRemindDays, options: BACKUP_OPTIONS, onChange: (v) => store.updateSettings({ backupRemindDays: v }),
        }),
      ),
      !filesSupported() ? footnote('Questo browser non permette di salvare i documenti della cartella clinica.') : null,
    ));

    nodes.push(section(
      'Altro',
      group(
        row({ icon: 'wind', tone: 'teal', title: 'Modalità sollievo', chevron: true, onClick: () => openRelief() }),
        row({ icon: 'book', tone: 'blue', title: 'Guida, consigli e privacy', chevron: true, onClick: () => openHelp() }),
      ),
    ));

    nodes.push(group(row({
      icon: 'trash',
      tone: 'red',
      title: 'Cancella tutti i dati',
      danger: true,
      onClick: async () => {
        if (await wipeEverything()) page.close();
      },
    })));
    nodes.push(footnote(`${APP_NAME} · versione ${APP_VERSION}. I tuoi dati restano su questo telefono. Non sostituisce il parere del medico.`));

    replaceChildren(page.body, ...nodes);
    page.body.scrollTop = top;
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}
