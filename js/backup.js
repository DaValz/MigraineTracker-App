/**
 * Backup completo: dati + cartella clinica (documenti) in un unico file ZIP,
 * apribile anche dal computer. Ripristino da ZIP o dal vecchio backup JSON.
 */
import * as store from './store.js';
import { openDialog, toast } from './ui.js';
import { shareFile } from './exporter.js';
import { createZip, readZip, readZipEntry, readZipText } from './zip.js';
import {
  loadFile, saveFile, gcFiles, filesSupported, deleteFiles, protectedFids,
} from './files.js';
import { docCategory } from './data.js';
import { todayStr, parseDate } from './dates.js';
import { bytes } from './format.js';
import { t } from './i18n.js';

const BACKUP_JSON = 'diario-emicrania.json';
const DOCS_DIR = 'documenti/';

const README = [
  t('Backup del Diario Emicrania'),
  '',
  t('{file}: tutti i dati del diario (attacchi, giornate, terapie, storia clinica, contatti, visite).', { file: BACKUP_JSON }),
  t('{cartella}: i file della cartella clinica, divisi per categoria.', { cartella: DOCS_DIR }),
  '',
  t('Per ripristinare: Diario Emicrania › Impostazioni › Dati e backup › Ripristina, e scegli questo file .zip.'),
  t('Il file contiene dati sanitari: conservalo in un luogo sicuro.'),
  '',
].join('\r\n');

export function safePart(s, max = 60) {
  const clean = String(s || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .replace(/[. ]+$/, '');
  return clean || t('documento');
}

export function docsSize(db = store.getDb()) {
  return db.docs.reduce((a, d) => a + d.files.reduce((b, f) => b + (f.size || 0), 0), 0);
}

/** Crea lo ZIP con dati e documenti. */
export async function buildFullBackup({ onProgress = null } = {}) {
  const db = store.getDb();
  const entries = [];
  const paths = new Map();
  const used = new Set();
  const missing = [];
  for (const d of db.docs) {
    const folder = `${DOCS_DIR}${safePart(docCategory(d.cat).label, 40)}/${d.date} ${safePart(d.title, 50)}`;
    for (const f of d.files) {
      let blob = null;
      try {
        blob = await loadFile(f.fid);
      } catch (e) {
        blob = null;
      }
      if (!blob) {
        missing.push(f.name);
        continue;
      }
      const dot = f.name.lastIndexOf('.');
      const base = safePart(dot > 0 ? f.name.slice(0, dot) : f.name, 60);
      const ext = dot > 0 ? f.name.slice(dot).replace(/[^.\w]/g, '').slice(0, 8) : '';
      let path = `${folder}/${base}${ext}`;
      for (let n = 2; used.has(path.toLowerCase()); n += 1) path = `${folder}/${base} (${n})${ext}`;
      used.add(path.toLowerCase());
      paths.set(f.fid, path);
      entries.push({ path, data: blob, date: parseDate(d.date) });
    }
  }
  const json = store.exportJson({ withDocs: true, filePaths: paths });
  entries.unshift({ path: BACKUP_JSON, data: json }, { path: 'LEGGIMI.txt', data: README }); // i18n-ignore
  const blob = await createZip(entries, { onProgress });
  return { blob, files: paths.size, missing };
}

export async function exportJsonBackup() {
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  const filename = `diario-emicrania-backup-${todayStr()}.json`; // i18n-ignore
  const result = await shareFile({ blob, filename, title: t('Backup Diario Emicrania') });
  if (result === 'shared' || result === 'downloaded') {
    store.markBackupDone();
    toast(result === 'shared' ? t('Backup pronto: salvalo in File o iCloud Drive') : t('Backup scaricato'));
  }
  return result;
}

export async function exportZipBackup() {
  toast(t('Preparo il backup con i documenti…'), { duration: 15000 });
  let built;
  try {
    built = await buildFullBackup();
  } catch (e) {
    toast(t('Backup non riuscito: {errore}', { errore: e.message || e }), { tone: 'error', duration: 8000 });
    return 'failed';
  }
  const filename = `diario-emicrania-backup-${todayStr()}.zip`; // i18n-ignore
  const result = await shareFile({ blob: built.blob, filename, title: t('Backup Diario Emicrania') });
  if (result === 'shared' || result === 'downloaded') {
    store.markBackupDone();
    const warn = built.missing.length ? ` (${t('{n, plural, one {# file non trovato} other {# file non trovati}}', { n: built.missing.length })})` : '';
    toast(`${result === 'shared' ? t('Backup pronto: salvalo in File o iCloud Drive') : t('Backup scaricato')}${warn}`);
  } else {
    toast(t('Backup annullato'));
  }
  return result;
}

/** Esporta: se ci sono documenti chiede se includerli. */
export async function exportBackup() {
  const db = store.getDb();
  if (!db.docs.length || !filesSupported()) return exportJsonBackup();
  const size = docsSize(db);
  const choice = await openDialog({
    title: t('Esporta backup'),
    message: t('{n, plural, one {Hai # documento nella cartella clinica ({dimensione}).} other {Hai # documenti nella cartella clinica ({dimensione}).}}', { n: db.docs.length, dimensione: bytes(size) }),
    dismissValue: null,
    stack: true,
    buttons: [
      { label: t('Completo, con i documenti (ZIP)'), value: 'zip', kind: 'primary' },
      { label: t('Solo i dati del diario (JSON)'), value: 'json' },
      { label: t('Annulla'), value: null },
    ],
  });
  if (choice === 'zip') return exportZipBackup();
  if (choice === 'json') return exportJsonBackup();
  return 'cancelled';
}

const isZipFile = async (file) => {
  if (/\.zip$/i.test(file.name) || /zip/.test(file.type)) return true;
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
};

/** Legge un file di backup (JSON o ZIP) e prepara il ripristino. */
export async function readBackupFile(file) {
  if (await isZipFile(file)) {
    const entries = await readZip(file);
    const jsonEntry = entries.find((e) => e.name === BACKUP_JSON) || entries.find((e) => !e.dir && /^[^/]+\.json$/i.test(e.name));
    if (!jsonEntry) throw new Error(t('Nell’archivio non c’è un backup del Diario Emicrania.'));
    if (jsonEntry.size > 60 * 1024 * 1024) throw new Error(t('Il backup è troppo grande.'));
    const text = await readZipText(file, jsonEntry);
    const incoming = store.parseBackup(text);
    const withDocs = store.backupIncludesDocs(text);
    const paths = store.backupFilePaths(text);
    const byName = new Map(entries.map((e) => [e.name, e]));
    incoming.docs = withDocs ? incoming.docs.map((d) => ({ ...d, files: d.files.filter((f) => byName.has(paths.get(f.fid))) })) : [];
    return {
      kind: 'zip', incoming, withDocs, file, paths, byName,
    };
  }
  if (file.size > 40 * 1024 * 1024) throw new Error(t('Il file è troppo grande per essere un backup.'));
  const incoming = store.parseBackup(await file.text());
  return { kind: 'json', incoming, withDocs: false };
}

async function writeZipFiles(parsed, docs, written) {
  for (const d of docs) {
    for (const f of d.files) {
      const entry = parsed.byName.get(parsed.paths.get(f.fid));
      if (!entry) continue;
      const blob = await readZipEntry(parsed.file, entry, f.type);
      protectedFids.add(f.fid);
      written.push(f.fid);
      await saveFile(f.fid, blob, { name: f.name, type: f.type });
    }
  }
}

/** Applica il backup letto. mode: 'merge' | 'replace'. */
export async function applyBackup(parsed, mode) {
  const { incoming, withDocs } = parsed;
  const written = [];
  const before = store.referencedFids();
  try {
    if (withDocs && filesSupported()) {
      const current = new Set(store.getDb().docs.map((d) => d.id));
      const docs = mode === 'replace' ? incoming.docs : incoming.docs.filter((d) => !current.has(d.id));
      await writeZipFiles(parsed, docs, written);
    }
    const res = mode === 'replace' ? store.importReplace(incoming, { withDocs }) : store.importMerge(incoming, { withDocs });
    written.forEach((fid) => protectedFids.delete(fid));
    if (withDocs && mode === 'replace') await gcFiles(() => store.referencedFids()).catch(() => {});
    return res || {};
  } catch (e) {
    written.forEach((fid) => protectedFids.delete(fid));
    const orphans = written.filter((fid) => !before.has(fid));
    if (orphans.length) await deleteFiles(orphans).catch(() => {});
    throw e;
  }
}
