/* i18n-ignore-file */
/* Dal file scelto dall'utente al testo grezzo da leggere con parse.js.
 * PDF (anche stampati dall'app Note dell'iPhone), testo, Markdown, RTF, HTML, Word (.docx), OpenDocument (.odt) e CSV.
 * Le funzioni "pure" (nessun DOM) si provano anche in Node; i PDF si leggono con PDF.js, caricato solo quando serve.
 * Gli errori hanno un `code` (tooBig, image, unsupported, pdfEmpty, pdfPassword, empty, unreadable): l'interfaccia li traduce. */
import { readZip, readZipText } from '../zip.js';

export const ACCEPT = [
  '.pdf', '.txt', '.text', '.md', '.markdown', '.rtf', '.html', '.htm', '.docx', '.odt', '.csv', '.tsv',
  'application/pdf', 'text/plain', 'text/markdown', 'text/rtf', 'application/rtf', 'text/html', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text',
].join(',');

const MAX_BYTES = { pdf: 80 * 1024 * 1024, other: 8 * 1024 * 1024 };
const MAX_PAGES = 400;
const MAX_CHARS = 3000000;

const coded = (code, extra) => Object.assign(new Error(code), { code }, extra || {});

export function kindOf(file) {
  const name = String((file && file.name) || '').toLowerCase();
  const type = String((file && file.type) || '').toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx') || type.includes('wordprocessingml')) return 'docx';
  if (name.endsWith('.odt') || type.includes('opendocument.text')) return 'odt';
  if (name.endsWith('.rtf') || type.includes('rtf')) return 'rtf';
  if (/\.html?$/.test(name) || type === 'text/html') return 'html';
  if (/\.(csv|tsv)$/.test(name) || type === 'text/csv' || type === 'text/tab-separated-values') return 'csv';
  if (type.startsWith('image/') || /\.(png|jpe?g|heic|heif|gif|webp|tiff?|bmp)$/.test(name)) return 'image';
  if (/\.(pages|numbers|key|doc|xls|xlsx|ppt|pptx|epub|zip|rar|7z)$/.test(name)) return 'unsupported';
  return 'text';
}

/* ---------------------------------------------------------------- testo semplice */

/** Decodifica i byte di un file di testo: UTF-8 (anche con BOM), UTF-16, altrimenti Windows-1252. */
export function decodeText(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b.subarray(3));
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch (e) {
    return new TextDecoder('windows-1252').decode(b);
  }
}

const looksBinary = (bytes) => {
  const n = Math.min(bytes.length, 4096);
  let nul = 0;
  for (let i = 0; i < n; i += 1) if (bytes[i] === 0) nul += 1;
  return nul > 2 && !(bytes[0] === 0xff && bytes[1] === 0xfe) && !(bytes[0] === 0xfe && bytes[1] === 0xff);
};

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', deg: '°',
};

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
    }
    return NAMED[e.toLowerCase()] !== undefined ? NAMED[e.toLowerCase()] : m;
  });
}

/* ---------------------------------------------------------------- HTML, Word, OpenDocument, RTF */

export function htmlToText(html) {
  const s = String(html)
    .replace(/<(script|style|head|svg|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|table|ul|ol|blockquote|pre|dd|dt)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, '  ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(s).replace(/[ \t]+\n/g, '\n');
}

const paragraphs = (xml, re, tagFix) => {
  const out = [];
  for (const m of xml.matchAll(re)) out.push(decodeEntities(tagFix(m[0]).replace(/<[^>]+>/g, '')));
  return out.join('\n');
};

/** word/document.xml di un .docx. */
export function docxToText(xml) {
  return paragraphs(String(xml), /<w:p[ >][\s\S]*?<\/w:p>/g, (p) => p
    .replace(/<w:tab\s*\/>/g, '\t')
    .replace(/<w:(?:br|cr)\b[^>]*\/>/g, '\n')
    .replace(/<w:instrText[\s\S]*?<\/w:instrText>/g, ''));
}

/** content.xml di un .odt. */
export function odtToText(xml) {
  return paragraphs(String(xml), /<text:(p|h)[ >][\s\S]*?<\/text:\1>/g, (p) => p
    .replace(/<text:tab\s*\/>/g, '\t')
    .replace(/<text:line-break\s*\/>/g, '\n')
    .replace(/<text:s(?: [^>]*)?\/>/g, ' '));
}

const RTF_SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'generator', 'listtable', 'listoverridetable', 'rsidtbl', 'themedata', 'latentstyles', 'datastore', 'xmlnstbl', 'revtbl', 'private', 'object', 'fldinst', 'bkmkstart', 'bkmkend']);
const RTF_CHARS = {
  emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', bullet: '•', emspace: ' ', enspace: ' ', tab: '\t',
};
const win1252 = typeof TextDecoder !== 'undefined' ? new TextDecoder('windows-1252') : null;

export function rtfToText(rtf) {
  const s = String(rtf);
  let out = '';
  const stack = [];
  let skip = false;
  let uc = 1;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '{') {
      stack.push({ skip, uc });
      i += 1;
    } else if (c === '}') {
      const top = stack.pop();
      if (top) {
        skip = top.skip;
        uc = top.uc;
      }
      i += 1;
    } else if (c === '\\') {
      const nx = s[i + 1];
      if (nx === '\\' || nx === '{' || nx === '}') {
        if (!skip) out += nx;
        i += 2;
      } else if (nx === '*') {
        skip = true;
        i += 2;
      } else if (nx === "'") {
        const code = parseInt(s.slice(i + 2, i + 4), 16);
        if (!skip && Number.isFinite(code)) out += win1252 ? win1252.decode(Uint8Array.of(code)) : String.fromCharCode(code);
        i += 4;
      } else if (nx === '~') {
        if (!skip) out += ' ';
        i += 2;
      } else {
        const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(s.slice(i, i + 48));
        if (!m) {
          i += 1;
        } else {
          i += m[0].length;
          const word = m[1];
          if (RTF_SKIP.has(word)) skip = true;
          else if (!skip) {
            if (word === 'par' || word === 'line' || word === 'sect' || word === 'page') out += '\n';
            else if (word === 'u' && m[2] != null) {
              let code = Number(m[2]);
              if (code < 0) code += 65536;
              out += String.fromCharCode(code);
              i += uc;
            } else if (RTF_CHARS[word] !== undefined) out += RTF_CHARS[word];
          }
          if (word === 'uc' && m[2] != null) uc = Number(m[2]);
        }
      }
    } else {
      if (c !== '\r' && c !== '\n' && !skip) out += c;
      i += 1;
    }
  }
  return out;
}

/* ---------------------------------------------------------------- CSV */

function splitDelimited(text, delim) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const CELL_DATE = /^\s*(?:\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{2,4})/;
const CELL_DATE_ONLY = /^\s*(?:\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{2,4})(?:[T ,]\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?)?\s*$/i;

/** Un CSV (anche esportato da altre app) diventa una riga per attacco: "data  intestazione: valore, ...". */
export function csvToText(text) {
  const head = text.split(/\r?\n/).slice(0, 8).join('\n');
  const delim = [';', '\t', ',', '|'].map((d) => [d, head.split(d).length - 1]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = splitDelimited(text, delim);
  if (!rows.length) return '';
  const hasDate = (r) => r.some((c) => CELL_DATE.test(c));
  const header = !hasDate(rows[0]) ? rows[0].map((h) => h.trim()) : null;
  const data = header ? rows.slice(1) : rows;
  const out = [];
  data.forEach((r) => {
    const di = r.findIndex((c) => CELL_DATE_ONLY.test(c) || CELL_DATE.test(c));
    if (di < 0) return;
    const dateCell = r[di].trim().replace(/[T ,]\s*\d{1,2}:\d{2}.*$/i, '').trim();
    const rest = r.map((c, i) => (i === di || !c.trim() ? null : (header && header[i] ? `${header[i]}: ${c.trim()}` : c.trim()))).filter(Boolean);
    out.push(`${dateCell} ${rest.join(header ? ', ' : ' | ')}`.trim());
  });
  return out.join('\n');
}

/* ---------------------------------------------------------------- PDF */

const PAGE_NUMBER = /^\W*(?:p(?:ag(?:ina|\.)?|age|\.)?\s*)?\d{1,4}\s*(?:\/|di|of|de|von|sur)?\s*\d{0,4}\W*$/i;
const PRINT_HEADER = /^(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4},?\s+\d{1,2}[:.]\d{2}|https?:\/\/|file:\/\/|about:blank)/i;

/** Raggruppa le parole di una pagina PDF in righe di testo (dall'alto in basso), con righe vuote dove c'e' uno stacco. */
export function linesFromItems(items, pageHeight = 0) {
  const its = (items || [])
    .filter((it) => it && typeof it.str === 'string' && it.str !== '' && Array.isArray(it.transform) && Math.abs(it.transform[1]) <= Math.abs(it.transform[0]) * 0.5 + 0.01)
    .map((it) => ({
      s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, h: it.height || Math.abs(it.transform[3]) || 10,
    }));
  if (!its.length) return [];
  const hs = its.map((i) => i.h).sort((a, b) => a - b);
  const fh = hs[Math.floor(hs.length / 2)] || 10;
  its.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  its.forEach((it) => {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - it.y) <= fh * 0.5) last.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  });
  const lines = rows.map((r) => {
    r.items.sort((a, b) => a.x - b.x);
    let s = '';
    let prevEnd = null;
    r.items.forEach((it) => {
      if (prevEnd != null && !/\s$/.test(s) && !/^\s/.test(it.s) && it.x - prevEnd > fh * 0.18) s += ' ';
      s += it.s;
      prevEnd = it.x + it.w;
    });
    return { text: s.replace(/\s+/g, ' ').trim(), y: r.y };
  }).filter((l) => l.text);
  if (!lines.length) return [];
  const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y).sort((a, b) => a - b);
  const pitch = gaps.length ? gaps[Math.floor(gaps.length / 2)] : fh * 1.2;
  const out = [];
  lines.forEach((l, i) => {
    const inBand = pageHeight > 0 && (l.y > pageHeight * 0.935 || l.y < pageHeight * 0.065);
    if (inBand && (PAGE_NUMBER.test(l.text) || PRINT_HEADER.test(l.text))) return;
    if (i > 0 && pitch > 0 && lines[i - 1].y - l.y > pitch * 1.7) out.push('');
    out.push(l.text);
  });
  return out;
}

export function textFromPages(pages) {
  return pages.map((p) => linesFromItems(p.items, p.height).join('\n')).join('\n');
}

async function pdfToText(file, onProgress) {
  const { openPdf, closePdf } = await import('../pdfview.js');
  let doc;
  try {
    doc = await openPdf(file);
  } catch (e) {
    if (e && e.name === 'PasswordException') throw coded('pdfPassword');
    throw coded('unreadable', { cause: e });
  }
  try {
    const n = Math.min(doc.numPages, MAX_PAGES);
    const pages = [];
    let chars = 0;
    for (let i = 1; i <= n; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const vp = page.getViewport({ scale: 1 });
      pages.push({ items: content.items, height: vp.height });
      chars += content.items.reduce((s, it) => s + (it.str ? it.str.length : 0), 0);
      page.cleanup();
      if (onProgress) onProgress(i, n);
      if (chars > MAX_CHARS) break;
    }
    return { text: textFromPages(pages), pages: doc.numPages };
  } finally {
    closePdf(doc);
  }
}

/* ---------------------------------------------------------------- ingresso */

async function zipXml(file, name) {
  const entries = await readZip(file);
  const entry = entries.find((e) => e.name === name);
  if (!entry || entry.size > 40 * 1024 * 1024) throw coded('unreadable');
  return readZipText(file, entry);
}

/** Legge un file e ne restituisce il testo: { text, kind, name, pages? }. */
export async function readNoteFile(file, { onProgress = null } = {}) {
  const kind = kindOf(file);
  if (kind === 'image') throw coded('image');
  if (kind === 'unsupported') throw coded('unsupported');
  if (file.size > (kind === 'pdf' ? MAX_BYTES.pdf : MAX_BYTES.other)) throw coded('tooBig');
  let text = '';
  let pages = null;
  try {
    if (kind === 'pdf') {
      ({ text, pages } = await pdfToText(file, onProgress));
    } else if (kind === 'docx') {
      text = docxToText(await zipXml(file, 'word/document.xml'));
    } else if (kind === 'odt') {
      text = odtToText(await zipXml(file, 'content.xml'));
    } else {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (looksBinary(bytes)) throw coded('unsupported');
      text = decodeText(bytes);
      if (kind === 'rtf' || /^\s*\{\\rtf/.test(text)) text = rtfToText(text);
      else if (kind === 'html' || /^\s*<(?:!doctype html|html)/i.test(text)) text = htmlToText(text);
      else if (kind === 'csv') text = csvToText(text);
    }
  } catch (e) {
    if (e && e.code) throw e;
    throw coded('unreadable', { cause: e });
  }
  text = text.slice(0, MAX_CHARS);
  if (!text.trim()) throw coded(kind === 'pdf' ? 'pdfEmpty' : 'empty');
  return {
    text, kind, name: file.name || '', pages,
  };
}

/** Testo incollato: toglie solo i caratteri di controllo. */
export const cleanPasted = (s) => String(s || '').replace(/\r\n?/g, '\n').slice(0, MAX_CHARS);
