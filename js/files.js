/**
 * Archivio dei file della cartella clinica (PDF e foto) in IndexedDB.
 * I metadati dei documenti stanno nel database principale; qui solo i contenuti binari.
 */
import { t } from './i18n.js';

const DB_NAME = 'emicrania-files';
const DB_VERSION = 1;
const FILES = 'files';
const THUMBS = 'thumbs';

let dbPromise = null;

export const filesSupported = () => typeof indexedDB !== 'undefined';

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!filesSupported()) {
      reject(new Error(t('Archivio dei documenti non disponibile in questo browser.')));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(FILES)) d.createObjectStore(FILES);
      if (!d.objectStoreNames.contains(THUMBS)) d.createObjectStore(THUMBS);
    };
    req.onsuccess = () => {
      const d = req.result;
      d.onversionchange = () => {
        d.close();
        dbPromise = null;
      };
      resolve(d);
    };
    req.onerror = () => reject(req.error || new Error(t('Impossibile aprire l’archivio dei documenti.')));
    req.onblocked = () => reject(new Error(t('Archivio dei documenti occupato: chiudi le altre finestre dell’app.')));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function run(stores, mode, body) {
  return openDb().then((d) => new Promise((resolve, reject) => {
    let txn;
    try {
      txn = d.transaction(stores, mode);
    } catch (e) {
      reject(e);
      return;
    }
    const out = { value: undefined };
    txn.oncomplete = () => resolve(out.value);
    txn.onerror = () => reject(txn.error || new Error(t('Errore dell’archivio dei documenti.')));
    txn.onabort = () => reject(txn.error || new Error(t('Operazione sull’archivio annullata (spazio esaurito?).')));
    try {
      body(txn, out);
    } catch (e) {
      try {
        txn.abort();
      } catch (e2) { /* già chiusa */ }
      reject(e);
    }
  }));
}

const reqValue = (req, out) => {
  req.onsuccess = () => { out.value = req.result; };
};

let blobsUnsupported = false;

async function putRecord(store, key, blob, meta = {}) {
  const rec = { blob, type: blob.type || meta.type || '', name: meta.name || '', size: blob.size, savedAt: Date.now() };
  if (!blobsUnsupported) {
    try {
      await run([store], 'readwrite', (txn) => txn.objectStore(store).put(rec, key));
      return;
    } catch (e) {
      // Alcuni motori non salvano i Blob in IndexedDB: si ripiega sui byte.
      blobsUnsupported = true;
    }
  }
  const buf = await blob.arrayBuffer();
  await run([store], 'readwrite', (txn) => txn.objectStore(store).put({ ...rec, blob: null, buf }, key));
}

const toBlob = (rec) => {
  if (!rec) return null;
  if (rec.blob instanceof Blob) return rec.blob;
  if (rec.buf) return new Blob([rec.buf], { type: rec.type || 'application/octet-stream' });
  return null;
};

export async function saveFile(fid, blob, meta = {}, thumb = null) {
  await putRecord(FILES, fid, blob, meta);
  if (thumb) {
    try {
      await putRecord(THUMBS, fid, thumb, { type: 'image/jpeg' });
    } catch (e) { /* la miniatura è facoltativa */ }
  }
}

export async function saveThumb(fid, thumb) {
  await putRecord(THUMBS, fid, thumb, { type: thumb.type || 'image/jpeg' });
}

export async function loadFile(fid) {
  const rec = await run([FILES], 'readonly', (txn, out) => reqValue(txn.objectStore(FILES).get(fid), out));
  return toBlob(rec);
}

export async function loadThumb(fid) {
  const rec = await run([THUMBS], 'readonly', (txn, out) => reqValue(txn.objectStore(THUMBS).get(fid), out));
  return toBlob(rec);
}

export async function listFids() {
  return (await run([FILES], 'readonly', (txn, out) => reqValue(txn.objectStore(FILES).getAllKeys(), out))) || [];
}

export async function deleteFiles(fids) {
  const list = [...fids];
  if (!list.length) return;
  await run([FILES, THUMBS], 'readwrite', (txn) => {
    list.forEach((fid) => {
      txn.objectStore(FILES).delete(fid);
      txn.objectStore(THUMBS).delete(fid);
    });
  });
}

/** File in fase di salvataggio o di un documento appena eliminato (annullabile): la pulizia non deve toccarli. */
export const protectedFids = new Set();

/** Elimina i file non più collegati ad alcun documento. `keep` può essere un Set o una funzione che lo restituisce. */
export async function gcFiles(keep) {
  const all = await listFids();
  const keepSet = typeof keep === 'function' ? keep() : keep;
  const orphans = all.filter((fid) => !keepSet.has(fid) && !protectedFids.has(fid));
  await deleteFiles(orphans);
  return orphans.length;
}

export async function clearFiles() {
  if (!filesSupported()) return;
  await run([FILES, THUMBS], 'readwrite', (txn) => {
    txn.objectStore(FILES).clear();
    txn.objectStore(THUMBS).clear();
  });
}

export async function storageInfo() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage: usage || 0, quota: quota || 0 };
    }
  } catch (e) { /* non disponibile */ }
  return null;
}

/* ---------- immagini ---------- */

export function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve({ img, url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(t('Immagine non leggibile')));
    };
    img.src = url;
  });
}

const canvasBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(t('Conversione dell’immagine non riuscita')))), type, quality);
});

export async function drawScaled(source, w, h, maxSide, quality = 0.82) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(source, 0, 0, cw, ch);
  try {
    return await canvasBlob(canvas, 'image/jpeg', quality);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Prepara una foto per l'archivio: ridimensiona (lato lungo max `maxSide`) e crea una miniatura.
 * Con `compress` falso conserva il file originale.
 */
export async function prepareImage(file, { compress = true, maxSide = 2400, quality = 0.84 } = {}) {
  const { img, url, width, height } = await loadImage(file);
  try {
    let blob = file;
    let type = file.type || 'image/jpeg';
    const big = Math.max(width, height) > maxSide || file.size > 1.6 * 1024 * 1024;
    if (compress && (big || !/^image\/(jpeg|png|webp)$/.test(type))) {
      blob = await drawScaled(img, width, height, maxSide, quality);
      type = 'image/jpeg';
    }
    const thumb = await drawScaled(img, width, height, 360, 0.72);
    return {
      blob, type, thumb, width, height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
