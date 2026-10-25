import { h, replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import {
  openPage, openFullscreen, confirmDialog, toast, row, group, footnote, field, button, card, cardTitle, chipGroup, textArea, textInput,
  dateInput, toggleRow, emptyState, alertBox,
} from '../ui.js';
import { DOC_CATEGORIES, docCategory } from '../data.js';
import { todayStr, fmtDateShort } from '../dates.js';
import { bytes, plural } from '../format.js';
import {
  saveFile, loadFile, loadThumb, saveThumb, prepareImage, drawScaled, loadImage, deleteFiles, filesSupported, storageInfo, protectedFids,
} from '../files.js';
import { shareFile } from '../exporter.js';
import { contactSelect, openContactEditor, contactName } from './care.js';
import {
  openPdf, renderPdfPage, pageRatios, closePdf, pdfThumb,
} from '../pdfview.js';

const MAX_FILE = 80 * 1024 * 1024;
const isPdf = (type, name = '') => type === 'application/pdf' || /\.pdf$/i.test(name);
const isImage = (type) => /^image\//.test(type || '');
const CAT_TONES = Object.fromEntries(DOC_CATEGORIES.map((c) => [c.id, c.tone]));

function urlBag() {
  const urls = [];
  return {
    add(blob) {
      const u = URL.createObjectURL(blob);
      urls.push(u);
      return u;
    },
    revokeAll() {
      urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    },
  };
}

async function makeThumb(f) {
  const blob = await loadFile(f.fid);
  if (!blob) return null;
  let thumb = null;
  if (isImage(f.type)) {
    const { img, url, width, height } = await loadImage(blob);
    try {
      thumb = await drawScaled(img, width, height, 360, 0.72);
    } finally {
      URL.revokeObjectURL(url);
    }
  } else if (isPdf(f.type, f.name)) {
    thumb = (await pdfThumb(blob)).thumb;
  }
  if (thumb) await saveThumb(f.fid, thumb).catch(() => {});
  return thumb;
}

const thumbFailed = new Set();
let thumbQueue = Promise.resolve();

/** Le miniature mancanti si creano una alla volta (ogni PDF avvia un worker). */
function queueThumb(f) {
  const job = thumbQueue.then(() => makeThumb(f));
  thumbQueue = job.catch(() => {});
  return job;
}

/** Riempie `el` con la miniatura del file (creandola se manca). */
async function fillThumb(el, f, bag) {
  try {
    let t = await loadThumb(f.fid);
    if (!t && !thumbFailed.has(f.fid)) {
      try {
        t = await queueThumb(f);
      } catch (e) {
        t = null;
      }
      if (!t) thumbFailed.add(f.fid);
    }
    if (t && el.isConnected !== false) replaceChildren(el, h('img', { src: bag.add(t), alt: '', draggable: 'false' }));
  } catch (e) { /* resta l'icona */ }
}

const fileIcon = (f) => icon(isPdf(f.type, f.name) ? 'file' : 'image', 22);

/* ---------- visualizzatore ---------- */

export function openViewer(doc, start = 0) {
  const full = openFullscreen({ className: 'viewer', label: doc.title });
  const bag = urlBag();
  let index = start;
  let zoom = 1;
  let pdfDoc = null;
  let observer = null;
  let token = 0;
  const title = h('div', { class: 'title' });
  const body = h('div', { class: 'viewer-body' });
  const prevBtn = h('button', { type: 'button', class: 'nav-btn round', 'aria-label': 'File precedente', onclick: () => go(index - 1) }, icon('chevron-left', 20));
  const nextBtn = h('button', { type: 'button', class: 'nav-btn round', 'aria-label': 'File successivo', onclick: () => go(index + 1) }, icon('chevron-right', 20));
  const zoomBtn = h('button', { type: 'button', class: 'nav-btn round', 'aria-label': 'Ingrandisci' }, icon('zoom-in', 20));
  const shareBtn = h('button', { type: 'button', class: 'nav-btn round', 'aria-label': 'Condividi o salva il file' }, icon('share', 19));
  const closeBtn = h('button', { type: 'button', class: 'nav-btn', onclick: () => full.close() }, 'Chiudi');
  const bar = h('div', { class: 'viewer-bar' }, closeBtn, doc.files.length > 1 ? prevBtn : null, title, doc.files.length > 1 ? nextBtn : null, zoomBtn, shareBtn);
  replaceChildren(full.el, bar, body);

  const cleanup = () => {
    token += 1;
    if (observer) observer.disconnect();
    observer = null;
    if (pdfDoc) closePdf(pdfDoc.doc);
    pdfDoc = null;
    bag.revokeAll();
  };

  const status = (text) => replaceChildren(body, h('p', { class: 'viewer-status' }, text));

  async function showPdf(blob, my) {
    status('Apertura del PDF…');
    const pdf = await openPdf(blob);
    if (my !== token) {
      closePdf(pdf);
      return;
    }
    pdfDoc = { doc: pdf };
    const ratios = await pageRatios(pdf);
    if (my !== token) return;
    const width = Math.min(body.clientWidth - 16, 900) * zoom;
    const holders = ratios.map((r, i) => {
      const el = h('div', { class: 'pdf-page', style: { width: `${width}px`, height: `${width * r}px` }, 'data-page': String(i + 1), 'aria-label': `Pagina ${i + 1}` });
      return el;
    });
    replaceChildren(body, ...holders, h('p', { class: 'viewer-status' }, plural(pdf.numPages, 'pagina', 'pagine')));
    const rendered = new Set();
    const queue = [];
    let busy = false;
    const pump = async () => {
      if (busy) return;
      busy = true;
      while (queue.length && my === token) {
        const n = queue.shift();
        if (rendered.has(n)) continue;
        rendered.add(n);
        try {
          const { blob: jpg } = await renderPdfPage(pdf, n, width, { dpr: Math.min(3, window.devicePixelRatio || 2) });
          if (my !== token) break;
          replaceChildren(holders[n - 1], h('img', { src: bag.add(jpg), alt: `Pagina ${n}`, draggable: 'false' }));
        } catch (e) {
          replaceChildren(holders[n - 1], h('p', { class: 'viewer-status', style: { color: '#555' } }, `Pagina ${n} non leggibile`));
        }
      }
      busy = false;
    };
    observer = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) queue.push(Number(en.target.dataset.page));
      });
      queue.sort((a, b) => a - b);
      pump();
    }, { root: body, rootMargin: '600px 0px' });
    holders.forEach((el) => observer.observe(el));
  }

  async function show() {
    cleanup();
    const my = token;
    const f = doc.files[index];
    title.textContent = doc.files.length > 1 ? `${index + 1}/${doc.files.length} · ${f.name}` : f.name;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index >= doc.files.length - 1;
    zoomBtn.replaceChildren(icon(zoom >= 3 ? 'zoom-out' : 'zoom-in', 20));
    status('Caricamento…');
    let blob;
    try {
      blob = await loadFile(f.fid);
    } catch (e) {
      blob = null;
    }
    if (my !== token) return;
    if (!blob) {
      status('File non trovato in questo dispositivo. Se hai un backup completo (ZIP), ripristinalo.');
      return;
    }
    shareBtn.onclick = () => shareFile({ blob, filename: f.name, title: doc.title });
    if (isImage(f.type)) {
      const width = Math.min(body.clientWidth, 1200) * zoom;
      replaceChildren(body, h('img', {
        class: 'vimg', src: bag.add(blob), alt: f.name, style: { width: `${width}px` }, draggable: 'false',
      }));
    } else if (isPdf(f.type, f.name)) {
      try {
        await showPdf(blob, my);
      } catch (e) {
        if (my === token) {
          replaceChildren(body, h('div', { class: 'viewer-status' }, h('p', {}, 'Non riesco a mostrare questo PDF qui (potrebbe essere protetto da password).'), h('div', { style: { marginTop: '14px' } }, button({ label: 'Apri con un’altra app', kind: 'secondary', icon: 'share', onClick: () => shareFile({ blob, filename: f.name, title: doc.title }) }))));
        }
      }
    } else {
      status('Anteprima non disponibile per questo tipo di file: usa il pulsante Condividi per aprirlo.');
    }
  }

  function go(i) {
    if (i < 0 || i >= doc.files.length) return;
    index = i;
    zoom = 1;
    show();
  }

  zoomBtn.addEventListener('click', () => {
    zoom = zoom >= 3 ? 1 : zoom + 1;
    show();
  });
  full.onClosed(cleanup);
  requestAnimationFrame(() => show());
  return full;
}

/* ---------- elaborazione dei file scelti ---------- */

async function prepareIncoming(fileList, { compress = true } = {}) {
  const out = [];
  for (const file of fileList) {
    if (file.size > MAX_FILE) {
      toast(`«${file.name}» è troppo grande (massimo ${bytes(MAX_FILE)}).`, { tone: 'error' });
      continue;
    }
    const type = (file.type || '').toLowerCase();
    try {
      if (isImage(type)) {
        const r = await prepareImage(file, { compress });
        const base = (file.name || 'foto').replace(/\.[^.]+$/, '');
        const name = r.type === 'image/jpeg' && !/\.jpe?g$/i.test(file.name || '') ? `${base}.jpg` : (file.name || 'foto.jpg');
        out.push({
          name, type: r.type, blob: r.blob, thumb: r.thumb, size: r.blob.size,
        });
      } else if (isPdf(type, file.name)) {
        let thumb = null;
        try {
          thumb = (await pdfThumb(file)).thumb;
        } catch (e) { /* PDF protetto o non leggibile: niente miniatura */ }
        out.push({
          name: file.name || 'documento.pdf', type: 'application/pdf', blob: file, thumb, size: file.size,
        });
      } else {
        toast(`«${file.name}»: formato non supportato. Usa PDF o foto.`, { tone: 'error' });
      }
    } catch (e) {
      toast(`«${file.name}» non è leggibile.`, { tone: 'error' });
    }
  }
  return out;
}

function hiddenPicker({ accept, capture = null, multiple = true, onFiles }) {
  const input = h('input', {
    type: 'file', accept, capture, multiple, hidden: true, 'aria-hidden': 'true', tabindex: '-1',
  });
  input.addEventListener('change', () => {
    const files = Array.from(input.files || []);
    input.value = '';
    if (files.length) onFiles(files);
  });
  return input;
}

/* ---------- editor ---------- */

export function openDocEditor(existing = null, { incoming = [], onDone = null, preset = {} } = {}) {
  if (!filesSupported()) {
    toast('Questo browser non permette di salvare documenti.', { tone: 'error' });
    return null;
  }
  const bag = urlBag();
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : {
    title: '', date: todayStr(), cat: 'visit', contactId: '', note: '', files: [], ...preset,
  };
  const pending = [];
  let compress = true;
  let busy = false;
  const initial = JSON.stringify(draft);
  const saveBtn = h('button', { type: 'button', class: 'bar-btn solid' }, 'Salva');
  const page = openPage({
    title: existing ? 'Modifica documento' : 'Nuovo documento',
    backLabel: 'Annulla',
    right: saveBtn,
    onBack: async (p) => {
      if (busy) return;
      if (JSON.stringify(draft) === initial && !pending.length) {
        p.close();
        return;
      }
      if (await confirmDialog({ title: 'Scartare il documento?', message: 'Le modifiche e i file appena aggiunti non verranno salvati.', confirmLabel: 'Scarta', cancelLabel: 'Continua', danger: true })) p.close();
    },
  });
  page.onClosed(() => bag.revokeAll());

  const titleInput = textInput({
    value: draft.title, placeholder: 'es. Visita neurologica di controllo', maxLength: 120, label: 'Titolo del documento', onInput: (v) => { draft.title = v; },
  });
  const grid = h('div', { class: 'doc-grid' });
  const status = h('p', { class: 'field-hint' });

  const addFiles = async (files) => {
    busy = true;
    status.textContent = `Preparazione di ${plural(files.length, 'file', 'file')}…`;
    const prepared = await prepareIncoming(files, { compress });
    busy = false;
    status.textContent = '';
    if (!prepared.length) return;
    pending.push(...prepared);
    if (!draft.title.trim() && pending.length && !draft.files.length) {
      draft.title = pending[0].name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120);
      titleInput.value = draft.title;
    }
    renderGrid();
  };
  const pickFiles = hiddenPicker({ accept: 'application/pdf,image/*', onFiles: addFiles });
  const pickCamera = hiddenPicker({ accept: 'image/*', capture: 'environment', multiple: false, onFiles: addFiles });

  function renderGrid() {
    const tiles = [];
    draft.files.forEach((f, i) => {
      const th = h('span', { style: { display: 'contents' } }, fileIcon(f));
      fillThumb(th, f, bag);
      tiles.push(h(
        'div',
        { class: 'doc-tile' },
        th,
        isPdf(f.type, f.name) ? h('span', { class: 'badge' }, 'PDF') : null,
        h('button', {
          type: 'button',
          class: 'remove',
          'aria-label': `Rimuovi ${f.name}`,
          onclick: () => {
            draft.files.splice(i, 1);
            renderGrid();
          },
        }, icon('x', 16)),
      ));
    });
    pending.forEach((p, i) => {
      tiles.push(h(
        'div',
        { class: 'doc-tile' },
        p.thumb ? h('img', { src: bag.add(p.thumb), alt: p.name }) : fileIcon(p),
        isPdf(p.type, p.name) ? h('span', { class: 'badge' }, 'PDF') : h('span', { class: 'badge' }, bytes(p.size)),
        h('button', {
          type: 'button',
          class: 'remove',
          'aria-label': `Rimuovi ${p.name}`,
          onclick: () => {
            pending.splice(i, 1);
            renderGrid();
          },
        }, icon('x', 16)),
      ));
    });
    tiles.push(h('button', { type: 'button', class: 'doc-tile add', onclick: () => pickCamera.click() }, icon('camera', 24), 'Fotografa'));
    tiles.push(h('button', { type: 'button', class: 'doc-tile add', onclick: () => pickFiles.click() }, icon('paperclip', 24), 'PDF o foto'));
    replaceChildren(grid, ...tiles);
  }

  const contactBox = h('div');
  const renderContact = () => replaceChildren(contactBox, h('div', { class: 'two-col' }, contactSelect({ value: draft.contactId, onChange: (v) => { draft.contactId = v; } }), button({ label: 'Nuovo', kind: 'secondary', icon: 'plus', onClick: () => openContactEditor(null, { onDone: (c) => { if (c) draft.contactId = c.id; renderContact(); } }) })));
  renderContact();

  const nodes = [
    card(
      cardTitle('File'),
      grid,
      status,
      h('div', { style: { marginTop: '6px' } }, group(toggleRow({
        icon: 'image', tone: 'blue', title: 'Riduci le dimensioni delle foto', subtitle: 'Consigliato: occupano molto meno spazio e restano leggibili', checked: compress, onChange: (v) => { compress = v; },
      }))),
    ),
    card(
      field({ label: 'Titolo', control: titleInput }),
      field({ label: 'Data del documento', control: dateInput({ value: draft.date, max: todayStr(), label: 'Data del documento', onChange: (v) => { if (v) draft.date = v; } }) }),
      field({ label: 'Categoria', control: chipGroup({ options: DOC_CATEGORIES.map((c) => ({ value: c.id, label: c.label })), value: draft.cat, allowClear: false, onChange: (v) => { draft.cat = v || 'other'; } }) }),
      field({ label: 'Ospedale, centro o medico', control: contactBox }),
      field({ label: 'Note', control: textArea({ value: draft.note, rows: 3, maxLength: 2000, label: 'Note sul documento', placeholder: 'es. Esito in breve, cosa ricordare…', onInput: (v) => { draft.note = v; } }) }),
    ),
    pickFiles,
    pickCamera,
  ];
  if (existing) {
    nodes.push(button({
      label: 'Elimina documento',
      kind: 'danger',
      icon: 'trash',
      block: true,
      onClick: async () => {
        if (!(await confirmDialog({ title: 'Eliminare il documento?', message: 'Verranno eliminati anche i file allegati da questo telefono.', confirmLabel: 'Elimina', danger: true }))) return;
        page.close();
        removeDocWithUndo(existing.id);
        if (onDone) onDone(null);
      },
    }));
  }
  replaceChildren(page.body, ...nodes);
  renderGrid();
  if (incoming.length) addFiles(incoming);

  saveBtn.addEventListener('click', async () => {
    if (busy) return;
    if (!draft.title.trim()) {
      toast('Dai un titolo al documento.', { tone: 'error' });
      return;
    }
    if (!draft.files.length && !pending.length && !draft.note.trim()) {
      toast('Aggiungi almeno un file o una nota.', { tone: 'error' });
      return;
    }
    busy = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvo…';
    const written = [];
    try {
      const refs = [];
      for (const p of pending) {
        const fid = store.makeId('f');
        protectedFids.add(fid);
        written.push(fid);
        await saveFile(fid, p.blob, { name: p.name, type: p.type }, p.thumb);
        refs.push({
          fid, name: p.name, type: p.type, size: p.size, thumb: !!p.thumb,
        });
      }
      const before = existing ? existing.files.map((f) => f.fid) : [];
      const saved = store.upsertRecord('docs', { ...draft, files: [...draft.files, ...refs], id: existing ? existing.id : undefined });
      written.forEach((fid) => protectedFids.delete(fid));
      pending.splice(0);
      const dropped = before.filter((fid) => !saved.files.some((f) => f.fid === fid));
      if (dropped.length) {
        setTimeout(() => {
          const keep = store.referencedFids();
          deleteFiles(dropped.filter((fid) => !keep.has(fid) && !protectedFids.has(fid))).catch(() => {});
        }, 1500);
      }
      busy = false;
      page.close();
      toast('Documento salvato');
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      if (onDone) onDone(saved);
    } catch (e) {
      written.forEach((fid) => protectedFids.delete(fid));
      if (written.length) deleteFiles(written).catch(() => {});
      busy = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Salva';
      toast(`Impossibile salvare: ${e && e.message ? e.message : 'spazio esaurito?'}`, { tone: 'error', duration: 8000 });
    }
  });
  return page;
}

export function removeDocWithUndo(id) {
  const removed = store.removeRecord('docs', id);
  if (!removed) return;
  const fids = removed.files.map((f) => f.fid);
  fids.forEach((fid) => protectedFids.add(fid));
  let settled = false;
  const release = () => fids.forEach((fid) => protectedFids.delete(fid));
  toast('Documento eliminato', {
    duration: 6000,
    action: {
      label: 'Annulla',
      onClick: () => {
        if (settled) return;
        settled = true;
        release();
        store.upsertRecord('docs', removed);
      },
    },
  });
  setTimeout(() => {
    if (settled) return;
    settled = true;
    release();
    const keep = store.referencedFids();
    deleteFiles(fids.filter((fid) => !keep.has(fid))).catch(() => {});
  }, 7000);
}

/* ---------- dettaglio ---------- */

export function openDocDetail(id) {
  const page = openPage({ title: 'Documento' });
  const bag = urlBag();
  page.onClosed(() => bag.revokeAll());
  const render = () => {
    bag.revokeAll();
    const db = store.getDb();
    const doc = db.docs.find((d) => d.id === id);
    if (!doc) {
      page.close();
      return;
    }
    const cat = docCategory(doc.cat);
    page.setTitle(doc.title);
    page.setRight(h('button', { type: 'button', class: 'bar-btn', onclick: () => openDocEditor(doc) }, 'Modifica'));
    const tiles = doc.files.map((f, i) => {
      const th = h('span', { style: { display: 'contents' } }, fileIcon(f));
      fillThumb(th, f, bag);
      return h('button', { type: 'button', class: 'doc-tile', 'aria-label': `Apri ${f.name}`, onclick: () => openViewer(doc, i) }, th, h('span', { class: 'badge' }, isPdf(f.type, f.name) ? 'PDF' : 'FOTO'));
    });
    const who = contactName(db, doc.contactId);
    replaceChildren(
      page.body,
      card(
        h('div', { class: 'flex', style: { alignItems: 'flex-start' } },
          h('span', { class: `row-icon ${cat.tone}` }, icon(cat.icon, 18)),
          h('div', { style: { minWidth: '0' } },
            h('div', { style: { fontSize: '1.2rem', fontWeight: '700' } }, doc.title),
            h('div', { class: 'muted small' }, [fmtDateShort(doc.date), cat.label, who].filter(Boolean).join(' · ')))),
        doc.note ? h('p', { class: 'pre', style: { marginTop: '12px' } }, doc.note) : null,
      ),
      doc.files.length ? card(cardTitle(plural(doc.files.length, 'file', 'file')), h('div', { class: 'doc-grid' }, ...tiles)) : null,
      doc.files.length ? h('div', { class: 'today-actions mb' },
        button({ label: 'Apri', kind: 'primary', icon: 'external', block: true, onClick: () => openViewer(doc, 0) }),
        button({
          label: 'Condividi o salva in File',
          kind: 'secondary',
          icon: 'share',
          block: true,
          onClick: async () => {
            const blobs = [];
            for (const f of doc.files) {
              const b = await loadFile(f.fid).catch(() => null);
              if (b) blobs.push(new File([b], f.name, { type: f.type }));
            }
            if (!blobs.length) {
              toast('File non trovati su questo dispositivo.', { tone: 'error' });
              return;
            }
            if (blobs.length > 1 && navigator.canShare && navigator.canShare({ files: blobs })) {
              try {
                await navigator.share({ files: blobs, title: doc.title });
              } catch (e) { /* annullato */ }
              return;
            }
            await shareFile({ blob: blobs[0], filename: blobs[0].name, title: doc.title });
          },
        })) : null,
      footnote(`Aggiunto il ${fmtDateShort(doc.createdAt.slice(0, 10))}. I file sono salvati solo su questo telefono: includili nel backup completo (ZIP).`),
    );
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}

/* ---------- elenco ---------- */

export function openDocuments({ contactId = null } = {}) {
  const page = openPage({ title: 'Documenti' });
  const bag = urlBag();
  page.onClosed(() => bag.revokeAll());
  const state = { q: '', cat: 'all' };
  const listBox = h('div');
  const usage = h('p', { class: 'footnote' });
  const startNew = (files) => openDocEditor(null, { incoming: files, preset: contactId ? { contactId } : {} });
  const pickFiles = hiddenPicker({ accept: 'application/pdf,image/*', onFiles: startNew });
  const pickCamera = hiddenPicker({ accept: 'image/*', capture: 'environment', multiple: false, onFiles: startNew });
  const search = h('input', {
    class: 'input', type: 'search', placeholder: 'Cerca nei documenti', 'aria-label': 'Cerca nei documenti', autocomplete: 'off',
  });
  search.addEventListener('input', () => {
    state.q = search.value;
    renderList();
  });
  const filterBox = h('div', { class: 'mb' });

  function renderList() {
    bag.revokeAll();
    const db = store.getDb();
    const q = state.q.trim().toLowerCase();
    const all = db.docs.filter((d) => !contactId || d.contactId === contactId);
    const cats = DOC_CATEGORIES.filter((c) => all.some((d) => d.cat === c.id));
    replaceChildren(filterBox, cats.length > 1 ? chipGroup({
      options: [{ value: 'all', label: 'Tutti' }, ...cats.map((c) => ({ value: c.id, label: c.label }))],
      value: state.cat,
      allowClear: false,
      onChange: (v) => {
        state.cat = v || 'all';
        renderList();
      },
    }) : null);
    const list = all
      .filter((d) => state.cat === 'all' || d.cat === state.cat)
      .filter((d) => !q || [d.title, d.note, docCategory(d.cat).label, contactName(db, d.contactId), ...d.files.map((f) => f.name)].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));
    if (!all.length) {
      replaceChildren(listBox, emptyState({
        icon: 'folder',
        title: 'La tua cartella clinica',
        text: 'Carica referti, risonanze, piani terapeutici e lettere di dimissione: PDF scaricati dal Fascicolo sanitario o foto dei documenti di carta.',
      }));
      return;
    }
    if (!list.length) {
      replaceChildren(listBox, emptyState({ icon: 'search', title: 'Nessun risultato', text: 'Prova a cambiare la ricerca o il filtro.' }));
      return;
    }
    const groups = new Map();
    list.forEach((d) => {
      const y = d.date.slice(0, 4);
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y).push(d);
    });
    const nodes = [];
    groups.forEach((docs, y) => {
      nodes.push(h('h2', { class: 'section-title' }, y));
      nodes.push(group(...docs.map((d) => {
        const cat = docCategory(d.cat);
        const thumb = h('span', { class: 'row-thumb' }, icon(cat.icon, 20));
        if (d.files[0]) fillThumb(thumb, d.files[0], bag);
        return row({
          thumb,
          title: d.title,
          subtitle: [fmtDateShort(d.date), cat.label, contactName(db, d.contactId)].filter(Boolean).join(' · '),
          right: d.files.length > 1 ? `${d.files.length}` : null,
          chevron: true,
          onClick: () => openDocDetail(d.id),
        });
      })));
    });
    replaceChildren(listBox, ...nodes);
  }

  const render = () => {
    const top = page.body.scrollTop;
    const db = store.getDb();
    const who = contactId ? contactName(db, contactId) : '';
    replaceChildren(
      page.body,
      who ? h('p', { class: 'page-intro' }, `Documenti di ${who}`) : null,
      !filesSupported() ? alertBox({ tone: 'warn', icon: 'alert', text: 'Questo browser non permette di salvare documenti. Apri l’app dall’icona sulla schermata Home.' }) : null,
      h('div', { class: 'btn-row mb' },
        button({ label: 'Fotografa', kind: 'secondary', icon: 'camera', onClick: () => pickCamera.click() }),
        button({ label: 'Carica PDF o foto', kind: 'primary', icon: 'doc-plus', onClick: () => pickFiles.click() })),
      db.docs.length > 3 ? h('div', { class: 'mb' }, search) : null,
      filterBox,
      listBox,
      usage,
      pickFiles,
      pickCamera,
    );
    renderList();
    page.body.scrollTop = top;
    storageInfo().then((s) => {
      const size = db.docs.reduce((a, d) => a + d.files.reduce((b, f) => b + (f.size || 0), 0), 0);
      usage.textContent = `${plural(db.docs.length, 'documento', 'documenti')} · ${bytes(size)}${s && s.quota ? ` · spazio disponibile per l’app: ${bytes(Math.max(0, s.quota - s.usage))}` : ''}. Ricorda il backup completo (ZIP) da Impostazioni › Dati e backup.`;
    });
  };
  render();
  const unsub = store.subscribe(() => { if (!page.isClosed()) render(); });
  page.onClosed(unsub);
  return page;
}
