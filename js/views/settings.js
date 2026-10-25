import { h, replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import * as store from '../store.js';
import {
  openPage, openSheet, openDialog, toast, confirmDialog, promptDialog, row, group, section, footnote, toggleRow, segmented, card, cardTitle,
  button, timeInput, dateInput, switchControl,
} from '../ui.js';
import { APP_NAME, APP_VERSION } from '../data.js';
import {
  fmtDateTime, fmtDateShort, todayStr, diffDays,
} from '../dates.js';
import { bytes } from '../format.js';
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
import { languageRow } from './language.js';
import { openNotesImport } from './notes-import.js';

const LOCK_OPTIONS = [
  { v: 0, label: t('Subito') }, { v: 60, label: t('Dopo 1 minuto') }, { v: 300, label: t('Dopo 5 minuti') }, { v: 900, label: t('Dopo 15 minuti') },
];
const BACKUP_OPTIONS = [
  { v: 0, label: t('Mai') }, { v: 14, label: t('Ogni 2 settimane') }, { v: 30, label: t('Ogni mese') }, { v: 60, label: t('Ogni 2 mesi') }, { v: 90, label: t('Ogni 3 mesi') },
];

export function backupLabel(s) {
  if (!s.lastBackupAt) return t('Mai');
  const d = diffDays(s.lastBackupAt.slice(0, 10), todayStr());
  if (d === 0) return t('Oggi');
  if (d === 1) return t('Ieri');
  return t('{n, plural, one {# giorno fa} other {# giorni fa}}', { n: d });
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
    title: t('Cancellare tutti i dati?'),
    message: t('Verranno eliminati da questo telefono attacchi, giornate, terapie, storia clinica, documenti e impostazioni. Se non hai un backup non potrai recuperarli.'),
    confirmLabel: t('Continua'),
    danger: true,
  });
  if (!first) return false;
  const second = await confirmDialog({
    title: t('Ultima conferma'), message: t('Questa azione non si può annullare. Vuoi davvero cancellare tutto?'), confirmLabel: t('Cancella tutto'), danger: true,
  });
  if (!second) return false;
  store.wipeAll();
  applyTheme();
  toast(t('Tutti i dati sono stati cancellati'));
  return true;
}

function openDiaryStartSheet() {
  const sheet = openSheet({ title: t('Inizio del diario') });
  const db = store.getDb();
  const idx = getIndex(db, store.getRev(), todayStr());
  let auto = !db.settings.diaryStart;
  let value = db.settings.diaryStart || idx.autoStart;
  const dateBox = h('div');
  const paint = () => replaceChildren(dateBox, auto ? null : dateInput({ value, max: todayStr(), label: t('Inizio del diario completo'), onChange: (v) => { if (v) value = v; } }));
  paint();
  const sw = h('label', { class: 'row check-row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, t('Automatico')), h('span', { class: 'row-sub' }, t('Dal primo dato registrato ({data})', { data: fmtDateShort(idx.autoStart) }))));
  sw.appendChild(switchControl({ checked: auto, label: t('Inizio automatico'), onChange: (v) => { auto = v; paint(); } }));
  replaceChildren(
    sheet.body,
    h('p', { class: 'muted mb' }, t('Dalla data in cui il diario è completo, i giorni senza attacchi registrati contano come giorni senza emicrania. Gli attacchi più vecchi restano visibili nel calendario ma non entrano nelle statistiche.')),
    card(sw, dateBox),
    button({
      label: t('Salva'),
      kind: 'primary',
      block: true,
      onClick: () => {
        store.updateSettings({ diaryStart: auto ? null : value });
        sheet.close();
        toast(t('Inizio del diario aggiornato'));
      },
    }),
  );
}

export function openDataPage() {
  const page = openPage({ title: t('Dati e backup') });
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
      cardTitle(t('Backup')),
      h('p', { class: 'muted', style: { marginBottom: '12px' } }, t('I dati vivono solo su questo telefono. Salva ogni tanto un backup in File o iCloud Drive: se cancelli l’app o cambi telefono, potrai ripristinarlo.')),
      h('p', { class: 'small', style: { marginBottom: '14px', fontWeight: '600' } }, s.lastBackupAt ? t('Ultimo backup: {quando}', { quando: fmtDateTime(s.lastBackupAt) }) : t('Non hai ancora fatto un backup.')),
      h('div', { class: 'btn-row' },
        button({ label: t('Esporta'), kind: 'primary', icon: 'download', onClick: async () => { await exportBackup(); render(); } }),
        button({ label: t('Ripristina'), kind: 'secondary', icon: 'upload', onClick: () => fileInput.click() })),
      hasDocs ? h('p', { class: 'field-hint', style: { marginTop: '10px' } }, t('{n, plural, one {Il backup completo (ZIP) include anche # documento della cartella clinica ({dimensione}).} other {Il backup completo (ZIP) include anche i # documenti della cartella clinica ({dimensione}).}}', { n: db.docs.length, dimensione: bytes(docsSize(db)) })) : null,
    ));
    if (hasDocs) {
      nodes.push(group(
        row({ icon: 'folder', tone: 'blue', title: t('Backup completo con documenti (ZIP)'), chevron: true, onClick: async () => { await exportZipBackup(); render(); } }),
        row({ icon: 'file', tone: 'gray', title: t('Solo dati del diario (JSON)'), chevron: true, onClick: async () => { await exportJsonBackup(); render(); } }),
      ));
    }
    nodes.push(group(row({
      icon: 'calendar-plus', tone: 'indigo', title: t('Importa dalle note o da un PDF'), subtitle: t('Compila il calendario con il diario che tenevi nelle Note'), chevron: true, onClick: () => { openNotesImport(); },
    })));
    nodes.push(card(
      cardTitle(t('Esporta per il computer')),
      h('p', { class: 'muted', style: { marginBottom: '12px' } }, t('File CSV apribili con Excel o Numbers.')),
      h('div', { class: 'btn-row' },
        button({ label: t('Attacchi'), kind: 'secondary', icon: 'file', onClick: () => exportCsv('episodes') }),
        button({ label: t('Giornate'), kind: 'secondary', icon: 'calendar', onClick: () => exportCsv('days') })),
    ));
    if (auto) {
      nodes.push(group(row({
        icon: 'refresh',
        tone: 'orange',
        title: t('Copia automatica'),
        subtitle: t('{data} · {attacchi}. Ripristina se hai perso dati di recente.', {
          data: fmtDateShort(auto.date),
          attacchi: t('{n, plural, one {# attacco} other {# attacchi}}', { n: auto.episodes }),
        }),
        chevron: true,
        onClick: async () => {
          const ok = await confirmDialog({
            title: t('Ripristinare la copia automatica?'),
            message: t('Sostituirà i dati attuali con quelli salvati il {data}. I documenti non vengono toccati.', { data: fmtDateShort(auto.date) }),
            confirmLabel: t('Ripristina'),
            danger: true,
          });
          if (!ok) return;
          try {
            store.importReplace(auto.db, { withDocs: false });
            applyTheme();
            toast(t('Copia automatica ripristinata'));
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
      if (info) parts.push(info.quota ? t('Spazio usato dall’app: {usato} su {totale} disponibili.', { usato: bytes(info.usage), totale: bytes(info.quota) }) : t('Spazio usato dall’app: {usato}.', { usato: bytes(info.usage) }));
      if (persisted === true) parts.push(t('Il sistema protegge i dati dalla cancellazione automatica.'));
      else if (persisted === false) parts.push(t('Il sistema potrebbe cancellare i dati se lo spazio scarseggia: fai un backup ogni tanto.'));
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
      if (inc.preventives.length) extra.push(t('{n, plural, one {# terapia} other {# terapie}}', { n: inc.preventives.length }));
      if (parsed.withDocs && inc.docs.length) extra.push(t('{n, plural, one {# documento} other {# documenti}}', { n: inc.docs.length }));
      const counts = {
        attacchi: t('{n, plural, one {# attacco} other {# attacchi}}', { n: nEp }),
        giornate: t('{n, plural, one {# giornata registrata} other {# giornate registrate}}', { n: nDays }),
      };
      const contents = extra.length
        ? t('Il file contiene {attacchi} e {giornate}, {altro}.', { ...counts, altro: extra.join(', ') })
        : t('Il file contiene {attacchi} e {giornate}.', counts);
      const keepDocs = !parsed.withDocs && store.getDb().docs.length ? ` ${t('I documenti attuali restano invariati.')}` : '';
      const choice = await openDialog({
        title: t('Ripristinare il backup?'),
        message: `${contents}${keepDocs}`,
        dismissValue: null,
        buttons: [
          { label: t('Unisci ai dati attuali'), value: 'merge', kind: 'primary' },
          { label: t('Sostituisci tutto'), value: 'replace', kind: 'danger' },
          { label: t('Annulla'), value: null },
        ],
      });
      if (!choice) return;
      toast(t('Ripristino in corso…'), { duration: 15000 });
      const res = await applyBackup(parsed, choice);
      applyTheme();
      if (choice === 'merge') {
        const added = t('{n, plural, one {# attacco} other {# attacchi}}', { n: res.added || 0 });
        if (res.docsAdded) toast(t('Aggiunti {attacchi} e {documenti}', { attacchi: added, documenti: t('{n, plural, one {# documento} other {# documenti}}', { n: res.docsAdded }) }));
        else toast(t('Aggiunti {attacchi}', { attacchi: added }));
      } else {
        toast(t('Backup ripristinato'));
      }
      render();
    } catch (e) {
      toast(e.message || t('Impossibile leggere il file'), { tone: 'error' });
    }
  });
  render();
  return page;
}

export function openSettings() {
  const page = openPage({ title: t('Impostazioni') });
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
      title: s.name || t('Il tuo nome'),
      subtitle: t('Appare nel report e nella sintesi per il medico'),
      chevron: true,
      onClick: async () => {
        const name = await promptDialog({
          title: t('Il tuo nome'), value: s.name, placeholder: t('Nome e cognome'), maxLength: 60, inputMode: 'text',
        });
        if (name !== null) {
          store.updateSettings({ name });
          render();
        }
      },
    })));

    nodes.push(section(
      t('Aspetto'),
      card(
        segmented({
          options: [{ value: 'auto', label: t('Automatico') }, { value: 'light', label: t('Chiaro') }, { value: 'dark', label: t('Scuro') }],
          value: s.theme,
          ariaLabel: t('Tema'),
          onChange: (v) => {
            store.updateSettings({ theme: v });
            applyTheme();
          },
        }),
        h('p', { class: 'field-hint', style: { marginTop: '8px' } }, t('Il tema scuro è più delicato con la sensibilità alla luce.')),
      ),
    ));

    nodes.push(group(languageRow()));

    const weatherRows = [
      toggleRow({
        icon: 'cloud',
        tone: 'blue',
        title: t('Meteo e pressione'),
        subtitle: t('Salva pressione e temperatura di ogni giorno per cercare collegamenti con l’emicrania'),
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
        icon: 'pin', tone: 'blue', title: t('Posizione'), right: describeLocation(s.weatherLoc), chevron: true, onClick: () => openLocationSheet({ onDone: render }),
      }));
    }
    nodes.push(section(
      t('Diario'),
      group(
        row({
          icon: 'calendar', tone: 'indigo', title: t('Inizio del diario'), right: s.diaryStart ? fmtDateShort(idx.trackingStart) : t('{data} (auto)', { data: fmtDateShort(idx.trackingStart) }), chevron: true, onClick: () => openDiaryStartSheet(),
        }),
        toggleRow({
          icon: 'calendar-check',
          tone: 'green',
          title: t('Giorni senza registrazioni = senza emicrania'),
          subtitle: t('Se disattivato, contano solo i giorni che confermi'),
          checked: s.assumeFree,
          onChange: (v) => store.updateSettings({ assumeFree: v }),
        }),
        toggleRow({
          icon: 'drop',
          tone: 'red',
          title: t('Tracciamento del ciclo mestruale'),
          subtitle: t('Aggiunge il campo nei dettagli della giornata e un’analisi dedicata'),
          checked: s.cycle,
          onChange: (v) => store.updateSettings({ cycle: v }),
        }),
      ),
      group(...weatherRows),
    ));

    nodes.push(section(
      t('Elenchi'),
      group(
        row({ icon: 'bolt', tone: 'orange', title: t('Fattori scatenanti'), chevron: true, onClick: () => openListManager('triggers') }),
        row({ icon: 'activity', tone: 'blue', title: t('Sintomi associati'), chevron: true, onClick: () => openListManager('symptoms') }),
        row({ icon: 'pill', tone: 'green', title: t('Farmaci per l’attacco'), chevron: true, onClick: () => openListManager('meds') }),
      ),
    ));

    const lockNodes = [];
    if (s.pin) {
      lockNodes.push(group(
        row({
          icon: 'lock',
          tone: 'green',
          title: t('Blocco con PIN attivo'),
          subtitle: t('PIN a {cifre} cifre', { cifre: s.pin.len || 4 }),
          right: t('Disattiva'),
          onClick: async () => {
            if (await removePin()) {
              toast(t('Blocco disattivato'));
              render();
            }
          },
        }),
        row({
          icon: 'refresh',
          tone: 'blue',
          title: t('Cambia PIN'),
          chevron: true,
          onClick: async () => {
            if (await removePin()) {
              if (await setupPin(s.pin.len || 4)) toast(t('PIN aggiornato'));
              render();
            }
          },
        }),
        selectRow({
          icon: 'clock', tone: 'orange', title: t('Blocca l’app'), value: s.lockAfter, options: LOCK_OPTIONS, onChange: (v) => store.updateSettings({ lockAfter: v }),
        }),
      ));
    } else {
      lockNodes.push(card(
        cardTitle(t('Blocco con PIN')),
        h('p', { class: 'muted', style: { marginBottom: '12px' } }, t('Chiede un PIN quando riapri l’app, così nessun altro può sfogliare il tuo diario e la tua cartella clinica.')),
        segmented({
          options: [{ value: 4, label: t('{cifre} cifre', { cifre: 4 }) }, { value: 6, label: t('{cifre} cifre', { cifre: 6 }) }],
          value: pinLen,
          ariaLabel: t('Lunghezza del PIN'),
          onChange: (v) => { pinLen = v; },
          cls: 'mb',
        }),
        button({
          label: t('Attiva il blocco'),
          kind: 'secondary',
          icon: 'lock',
          block: true,
          disabled: !pinSupported(),
          onClick: async () => {
            if (await setupPin(pinLen)) {
              toast(t('Blocco con PIN attivato'));
              render();
            }
          },
        }),
      ));
    }
    nodes.push(section(t('Sicurezza'), ...lockNodes, footnote(t('Il PIN impedisce l’accesso casuale all’app ma non cifra i dati. Se lo dimentichi dovrai cancellare i dati dell’app: tieni un backup aggiornato.'))));

    const timeIn = timeInput({
      value: s.reminderTime,
      label: t('Orario del promemoria'),
      onChange: (v) => { if (v) store.updateSettings({ reminderTime: v }); },
    });
    nodes.push(section(
      t('Promemoria giornaliero'),
      card(
        h('p', { class: 'muted', style: { marginBottom: '12px' } }, t('Le app web su iPhone non possono inviare notifiche da sole. Aggiungi un evento ripetuto al Calendario: ti ricorderà ogni giorno di registrare come stai.')),
        h('div', { class: 'two-col' }, h('div', {}, h('div', { class: 'field-label' }, t('Orario')), timeIn), h('div', { style: { alignSelf: 'end' } }, button({ label: t('Aggiungi'), kind: 'secondary', icon: 'bell', block: true, onClick: async () => { const r = await exportReminder(store.getSettings().reminderTime); if (r === 'shared') toast(t('Scegli «Calendario» per aggiungerlo')); } }))),
        h('p', { class: 'field-hint', style: { marginTop: '10px' } }, t('Se il Calendario non si apre, crea a mano un promemoria ripetuto ogni giorno nell’app Promemoria.')),
      ),
    ));

    nodes.push(section(
      t('Dati'),
      group(
        row({
          icon: 'download', tone: 'green', title: t('Dati e backup'), subtitle: t('Ultimo backup: {quando}', { quando: backupLabel(s) }), chevron: true, onClick: () => openDataPage(),
        }),
        selectRow({
          icon: 'shield', tone: 'green', title: t('Ricordami il backup'), value: s.backupRemindDays, options: BACKUP_OPTIONS, onChange: (v) => store.updateSettings({ backupRemindDays: v }),
        }),
      ),
      !filesSupported() ? footnote(t('Questo browser non permette di salvare i documenti della cartella clinica.')) : null,
    ));

    nodes.push(section(
      t('Altro'),
      group(
        row({ icon: 'wind', tone: 'teal', title: t('Modalità sollievo'), chevron: true, onClick: () => openRelief() }),
        row({ icon: 'book', tone: 'blue', title: t('Guida, consigli e privacy'), chevron: true, onClick: () => openHelp() }),
      ),
    ));

    nodes.push(group(row({
      icon: 'trash',
      tone: 'red',
      title: t('Cancella tutti i dati'),
      danger: true,
      onClick: async () => {
        if (await wipeEverything()) page.close();
      },
    })));
    nodes.push(footnote(`${t('{app} · versione {versione}.', { app: APP_NAME, versione: APP_VERSION })} ${t('I tuoi dati restano su questo telefono.')} ${t('Non sostituisce il parere del medico.')}`));

    replaceChildren(page.body, ...nodes);
    page.body.scrollTop = top;
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}
