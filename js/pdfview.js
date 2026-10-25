/**
 * Visualizzazione dei PDF con PDF.js (caricato solo quando serve).
 * Le pagine vengono disegnate su canvas e convertite in JPEG, così la memoria resta contenuta.
 */
import { t } from './i18n.js';

const BASE = new URL('../vendor/pdfjs/', import.meta.url);
let libPromise = null;

export function loadPdfJs() {
  if (!libPromise) {
    libPromise = import('../vendor/pdfjs/pdf.min.js').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.js', BASE).href;
      return lib;
    });
    libPromise.catch(() => { libPromise = null; });
  }
  return libPromise;
}

export async function openPdf(blob) {
  const lib = await loadPdfJs();
  const data = new Uint8Array(await blob.arrayBuffer());
  const task = lib.getDocument({
    data,
    isEvalSupported: false,
    enableXfa: false,
    useSystemFonts: true,
    wasmUrl: new URL('wasm/', BASE).href,
    verbosity: 0,
  });
  const doc = await task.promise.catch((e) => {
    try {
      task.destroy();
    } catch (e2) { /* già chiuso */ }
    throw e;
  });
  tasks.set(doc, task);
  return doc;
}

const tasks = new WeakMap();

/** Libera le risorse del documento (PDF.js 6: si chiude dal task di caricamento). */
export function closePdf(doc) {
  if (!doc) return Promise.resolve();
  try {
    const task = tasks.get(doc) || doc.loadingTask;
    if (task && typeof task.destroy === 'function') return Promise.resolve(task.destroy()).catch(() => {});
    if (typeof doc.destroy === 'function') return Promise.resolve(doc.destroy()).catch(() => {});
  } catch (e) { /* già chiuso */ }
  return Promise.resolve();
}

const toJpeg = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(t('Pagina non convertibile')))), 'image/jpeg', quality);
});

/** Disegna la pagina `n` (da 1) alla larghezza indicata in pixel e la restituisce come JPEG. */
export async function renderPdfPage(doc, n, cssWidth, { dpr = 2, quality = 0.86, maxPixels = 9e6 } = {}) {
  const page = await doc.getPage(n);
  try {
    const base = page.getViewport({ scale: 1 });
    let scale = (cssWidth * dpr) / base.width;
    if (base.width * base.height * scale * scale > maxPixels) scale = Math.sqrt(maxPixels / (base.width * base.height));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(vp.width));
    canvas.height = Math.max(1, Math.floor(vp.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    try {
      await page.render({ canvasContext: ctx, canvas, viewport: vp }).promise;
      const blob = await toJpeg(canvas, quality);
      return { blob, ratio: base.height / base.width };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    page.cleanup();
  }
}

export async function pageRatios(doc) {
  const out = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const p = await doc.getPage(i);
    const v = p.getViewport({ scale: 1 });
    out.push(v.height / v.width);
    if (i >= 400) break;
  }
  return out;
}

/** Miniatura della prima pagina (per l'elenco dei documenti). */
export async function pdfThumb(blob) {
  const doc = await openPdf(blob);
  try {
    const { blob: thumb } = await renderPdfPage(doc, 1, 180, { dpr: 2, quality: 0.7 });
    return { thumb, pages: doc.numPages };
  } finally {
    closePdf(doc);
  }
}
