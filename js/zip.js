/**
 * ZIP minimale senza dipendenze: scrive archivi "store" (i PDF e le foto sono già compressi)
 * e legge archivi store o deflate (con DecompressionStream, se disponibile).
 */
import { t } from './i18n.js';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes, seed = 0) {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const enc = new TextEncoder();
const LIMIT = 0xffffffff;

async function bytesOf(data) {
  if (typeof data === 'string') return enc.encode(data);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * entries: [{ path, data: Blob | Uint8Array | string, date?: Date }]
 * Restituisce un Blob application/zip.
 */
export async function createZip(entries, { onProgress = null } = {}) {
  if (entries.length > 65000) throw new Error(t('Troppi file per un singolo archivio.'));
  const parts = [];
  const central = [];
  let offset = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    const name = enc.encode(e.path);
    const bytes = await bytesOf(e.data);
    const crc = crc32(bytes);
    const size = bytes.length;
    if (offset + size + 30 + name.length > LIMIT) throw new Error(t('L’archivio supera i 4 GB.'));
    const { time, date } = dosTime(e.date || new Date());
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true);
    h.setUint16(8, 0, true);
    h.setUint16(10, time, true);
    h.setUint16(12, date, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, size, true);
    h.setUint32(22, size, true);
    h.setUint16(26, name.length, true);
    h.setUint16(28, 0, true);
    parts.push(h, name, typeof Blob !== 'undefined' && e.data instanceof Blob ? e.data : bytes);
    central.push({
      name, crc, size, time, date, offset,
    });
    offset += 30 + name.length + size;
    if (onProgress) onProgress(i + 1, entries.length);
  }
  let cdSize = 0;
  central.forEach((c) => {
    const h = new DataView(new ArrayBuffer(46));
    h.setUint32(0, 0x02014b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 20, true);
    h.setUint16(8, 0x0800, true);
    h.setUint16(10, 0, true);
    h.setUint16(12, c.time, true);
    h.setUint16(14, c.date, true);
    h.setUint32(16, c.crc, true);
    h.setUint32(20, c.size, true);
    h.setUint32(24, c.size, true);
    h.setUint16(28, c.name.length, true);
    h.setUint32(42, c.offset, true);
    parts.push(h, c.name);
    cdSize += 46 + c.name.length;
  });
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, central.length, true);
  end.setUint16(10, central.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  parts.push(end);
  return new Blob(parts, { type: 'application/zip' });
}

const dec = new TextDecoder();

async function sliceBytes(blob, start, end) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

/** Legge l'indice di un archivio ZIP senza caricarlo tutto in memoria. */
export async function readZip(blob) {
  if (!blob || blob.size < 22) throw new Error(t('Il file non è un archivio ZIP valido.'));
  const tailLen = Math.min(blob.size, 65557);
  const tail = await sliceBytes(blob, blob.size - tailLen, blob.size);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      at = i;
      break;
    }
  }
  if (at < 0) throw new Error(t('Il file non è un archivio ZIP valido.'));
  const ev = new DataView(tail.buffer, tail.byteOffset + at, 22);
  const count = ev.getUint16(10, true);
  const cdSize = ev.getUint32(12, true);
  const cdOffset = ev.getUint32(16, true);
  if (cdOffset + cdSize > blob.size) throw new Error(t('Archivio ZIP danneggiato.'));
  const cd = await sliceBytes(blob, cdOffset, cdOffset + cdSize);
  const entries = [];
  let p = 0;
  for (let i = 0; i < count; i += 1) {
    if (p + 46 > cd.length) throw new Error(t('Archivio ZIP danneggiato.'));
    const v = new DataView(cd.buffer, cd.byteOffset + p, 46);
    if (v.getUint32(0, true) !== 0x02014b50) throw new Error(t('Archivio ZIP danneggiato.'));
    const nlen = v.getUint16(28, true);
    const elen = v.getUint16(30, true);
    const clen = v.getUint16(32, true);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nlen));
    entries.push({
      name,
      method: v.getUint16(10, true),
      crc: v.getUint32(16, true),
      csize: v.getUint32(20, true),
      size: v.getUint32(24, true),
      offset: v.getUint32(42, true),
      dir: name.endsWith('/'),
    });
    p += 46 + nlen + elen + clen;
  }
  return entries;
}

/** Estrae un file dall'archivio come Blob (verifica il CRC). */
export async function readZipEntry(blob, entry, type = '') {
  const head = await sliceBytes(blob, entry.offset, entry.offset + 30);
  const v = new DataView(head.buffer, head.byteOffset, 30);
  if (v.getUint32(0, true) !== 0x04034b50) throw new Error(t('Archivio ZIP danneggiato.'));
  const start = entry.offset + 30 + v.getUint16(26, true) + v.getUint16(28, true);
  const raw = blob.slice(start, start + entry.csize);
  let out;
  if (entry.method === 0) {
    out = raw;
  } else if (entry.method === 8) {
    if (typeof DecompressionStream === 'undefined') throw new Error(t('Questo archivio è compresso in un formato non supportato da questo browser.'));
    out = await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
  } else {
    throw new Error(t('Metodo di compressione ZIP non supportato.'));
  }
  const bytes = new Uint8Array(await out.arrayBuffer());
  if (bytes.length !== entry.size || crc32(bytes) !== entry.crc) throw new Error(t('Il file «{nome}» nell’archivio è danneggiato.', { nome: entry.name }));
  return new Blob([bytes], { type });
}

export async function readZipText(blob, entry) {
  return (await readZipEntry(blob, entry)).text();
}
