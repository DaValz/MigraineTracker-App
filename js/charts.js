import { h } from './dom.js';
import { INTENSITY_COLORS } from './data.js';

export function axisMax(maxValue, floor = 4) {
  const m = Math.max(floor, Math.ceil(maxValue / 2) * 2);
  return m;
}

/**
 * Grafico a barre SVG con scala adattiva. data: [{ label, value, color?, title? }]
 */
export function barChart({
  data, height = 150, width = 340, yMax = null, color = null, labelEvery = 1, ariaLabel = '', showValues = false, valueFormat = (v) => String(v),
}) {
  const padL = 26;
  const padR = 4;
  const padT = 14;
  const padB = 22;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = yMax || axisMax(Math.max(0, ...data.map((d) => d.value)));
  const slot = innerW / Math.max(1, data.length);
  const bw = Math.min(26, Math.max(2, slot * 0.7));
  const ticks = max % 2 === 0 ? [0, max / 2, max] : [0, max];
  const kids = [];
  ticks.forEach((t) => {
    const y = padT + innerH * (1 - t / max);
    kids.push(h('line', { class: 'grid', x1: padL, x2: width - padR, y1: y, y2: y }));
    kids.push(h('text', { class: 'ax', x: padL - 5, y: y + 3.5, 'text-anchor': 'end' }, Number.isInteger(t) ? String(t) : t.toFixed(1)));
  });
  data.forEach((d, i) => {
    const bh = Math.max(0, (innerH * Math.min(d.value, max)) / max);
    const x = padL + i * slot + (slot - bw) / 2;
    if (d.value > 0) {
      const rect = h('rect', {
        class: 'bar', x, y: padT + innerH - bh, width: bw, height: bh, rx: Math.min(4, bw / 2), style: d.color || color ? { fill: d.color || color } : null,
      }, h('title', {}, d.title || `${d.label}: ${d.value}`));
      kids.push(rect);
      if (showValues) kids.push(h('text', { class: 'ax val', x: x + bw / 2, y: padT + innerH - bh - 3, 'text-anchor': 'middle' }, valueFormat(d.value)));
    } else {
      kids.push(h('rect', { class: 'bar zero', x, y: padT + innerH - 1.5, width: bw, height: 1.5, rx: 0.75 }));
    }
    if (i % labelEvery === 0) {
      kids.push(h('text', { class: 'ax', x: x + bw / 2, y: height - 6, 'text-anchor': 'middle' }, d.label));
    }
  });
  return h('svg', {
    class: 'chart', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel, preserveAspectRatio: 'xMidYMid meet',
  }, ...kids);
}

/** Griglia "anno in pixel": una riga per mese, una colonna per giorno. */
export function yearPixels(rows, { ariaLabel = 'Panoramica degli ultimi 12 mesi' } = {}) {
  const cell = 9.6;
  const gap = 1.8;
  const labelW = 28;
  const headH = 13;
  const step = cell + gap;
  const width = labelW + 31 * step;
  const height = headH + rows.length * step;
  const kids = [];
  [1, 5, 10, 15, 20, 25, 30].forEach((d) => kids.push(h('text', { class: 'ax', x: labelW + (d - 1) * step + cell / 2, y: 9, 'text-anchor': 'middle' }, String(d))));
  rows.forEach((r, ri) => {
    const y = headH + ri * step;
    kids.push(h('text', { class: 'ax', x: 0, y: y + cell - 1.5 }, r.label));
    r.cells.forEach((c, ci) => {
      if (!c) return;
      const attrs = { x: labelW + ci * step, y, width: cell, height: cell, rx: 2.4, class: `px px-${c.status}` };
      if (c.status === 'migraine') attrs.style = { fill: INTENSITY_COLORS[Math.max(0, Math.min(9, c.intensity - 1))] };
      kids.push(h('rect', attrs));
    });
  });
  return h('svg', {
    class: 'chart', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel, preserveAspectRatio: 'xMidYMid meet',
  }, ...kids);
}

export function intensityLegend() {
  return h('div', { class: 'legend' }, [
    ['Lieve', INTENSITY_COLORS[1]],
    ['Moderata', INTENSITY_COLORS[4]],
    ['Forte', INTENSITY_COLORS[7]],
    ['Molto forte', INTENSITY_COLORS[9]],
  ].map(([label, color]) => h('span', { class: 'legend-item' }, h('span', { class: 'swatch', style: { background: color } }), label)));
}

let patternSeq = 0;
const monthDiff = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
const fmtNum = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');

function hatchDefs() {
  patternSeq += 1;
  const id = `hatch-${patternSeq}`;
  return {
    id,
    node: h('defs', {}, h('pattern', {
      id, patternUnits: 'userSpaceOnUse', width: 4, height: 4, patternTransform: 'rotate(45)',
    }, h('rect', { class: 'hatch-fill', width: 1.8, height: 4, style: { fill: 'var(--accent)' } }))),
  };
}

/** Assegna le terapie a righe diverse quando si sovrappongono nel tempo. */
function lanes(items) {
  const ends = [];
  return items.map((it) => {
    let lane = ends.findIndex((e) => e < it.x0 - 2);
    if (lane < 0) {
      lane = ends.length;
      ends.push(it.x1);
    } else {
      ends[lane] = it.x1;
    }
    return { ...it, lane };
  });
}

/**
 * Andamento a lungo termine: barre (giorni/mese) dal diario o stimate dalla storia (tratteggiate),
 * linea dell'intensità e, sotto, le fasce delle terapie.
 */
export function longTermChart(series, { width = 340, ariaLabel = 'Andamento a lungo termine' } = {}) {
  const { points, therapies, unit } = series;
  const padL = 24;
  const padR = 22;
  const padT = 12;
  const plotH = 118;
  const n = Math.max(1, points.length);
  const innerW = width - padL - padR;
  const slot = innerW / n;
  const bw = Math.max(1.2, Math.min(18, slot * 0.72));
  const perBucket = unit === 'year' ? 12 : unit === 'quarter' ? 3 : 1;
  const first = points.length ? points[0].month : '2000-01';
  const today = new Date();
  const xOfDate = (d) => {
    const m = d.slice(0, 7);
    const day = Number(d.slice(8, 10)) || 1;
    const months = monthDiff(first, m) + (day - 1) / 31;
    return padL + Math.max(0, Math.min(innerW, (months / perBucket) * slot));
  };
  const max = Math.max(8, ...points.map((p) => p.value || 0));
  const top = Math.ceil(max / 4) * 4;
  const y = (v) => padT + plotH * (1 - v / top);
  const hatch = hatchDefs();
  const kids = [hatch.node];
  [0, top / 2, top].forEach((t) => {
    kids.push(h('line', { class: 'grid', x1: padL, x2: width - padR, y1: y(t), y2: y(t) }));
    kids.push(h('text', { class: 'ax', x: padL - 5, y: y(t) + 3.5, 'text-anchor': 'end' }, String(t)));
  });
  [0, 5, 10].forEach((t) => kids.push(h('text', {
    class: 'ax', x: width - padR + 4, y: padT + plotH * (1 - t / 10) + 3.5, style: { fill: 'var(--orange)' },
  }, String(t))));
  const dots = [];
  points.forEach((p, i) => {
    const x = padL + i * slot + (slot - bw) / 2;
    if (p.value != null) {
      const bh = Math.max(1, plotH * Math.min(p.value, top) / top);
      kids.push(h('rect', {
        class: `bar${p.source === 'history' ? ' est' : ''}`,
        x,
        y: padT + plotH - bh,
        width: bw,
        height: bh,
        rx: Math.min(3, bw / 2),
        style: p.source === 'history' ? { fill: `url(#${hatch.id})` } : (p.partial ? { opacity: 0.55 } : null),
      }, h('title', {}, `${p.title || p.label}: ${fmtNum(p.value)} giorni${p.source === 'history' ? ' (stima)' : ''}${p.intensity != null ? `, intensità ${fmtNum(p.intensity)}` : ''}`)));
    }
    if (p.intensity != null) dots.push({ x: x + bw / 2, y: padT + plotH * (1 - p.intensity / 10), i });
  });
  let seg = [];
  const flushSeg = () => {
    if (seg.length > 1) kids.push(h('polyline', { class: 'int-line', points: seg.map((d) => `${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(' ') }));
    seg = [];
  };
  dots.forEach((d, k) => {
    if (k && d.i !== dots[k - 1].i + 1) flushSeg();
    seg.push(d);
  });
  flushSeg();
  if (dots.length <= 40) dots.forEach((d) => kids.push(h('circle', { class: 'int-dot', cx: d.x, cy: d.y, r: 2 })));

  const labels = [];
  if (unit === 'month' && n > 14) {
    points.forEach((p, i) => { if (p.month.endsWith('-01')) labels.push({ i, text: p.month.slice(0, 4) }); });
    if (!labels.length || labels[0].i > 5) labels.unshift({ i: 0, text: points[0].month.slice(0, 4) });
  } else {
    points.forEach((p, i) => { if (p.label) labels.push({ i, text: p.label }); });
  }
  const thin = Math.max(1, Math.ceil(labels.length / 8));
  labels.filter((_, k) => k % thin === 0).forEach(({ i, text }) => {
    const anchor = unit !== 'month' || n > 14 ? 'start' : 'middle';
    const x = anchor === 'start' ? padL + i * slot : padL + i * slot + slot / 2;
    kids.push(h('text', { class: 'ax', x, y: padT + plotH + 12, 'text-anchor': anchor }, text));
  });

  const nowIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const bands = lanes(therapies.map((t) => {
    const x0 = xOfDate(t.start < `${first}-01` ? `${first}-01` : t.start);
    const x1 = Math.max(x0 + 3, xOfDate(t.end && t.end < nowIso ? t.end : nowIso));
    return { t, x0, x1 };
  }));
  const laneTop = padT + plotH + 20;
  const laneH = 13;
  bands.forEach(({ t, x0, x1, lane }) => {
    const yy = laneTop + lane * (laneH + 3);
    const color = t.color || 'var(--accent)';
    kids.push(h('rect', { x: x0, y: yy, width: x1 - x0, height: laneH, rx: 4, style: { fill: color } }, h('title', {}, t.name)));
    const label = t.name.length > 22 ? `${t.name.slice(0, 21)}…` : t.name;
    if (x1 - x0 > label.length * 5.2 + 8) kids.push(h('text', { class: 'band-label', x: x0 + 5, y: yy + 9.5 }, label));
  });
  const lanesCount = bands.length ? Math.max(...bands.map((b) => b.lane)) + 1 : 0;
  const height = laneTop + lanesCount * (laneH + 3) + 4;
  return h('svg', {
    class: 'chart', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel, preserveAspectRatio: 'xMidYMid meet',
  }, ...kids);
}

/** Giorni di emicrania al mese prima e durante una terapia, con la linea del valore di partenza. */
export function therapyChart({ monthly, baseline = null, startMonth, color = 'var(--accent)', width = 340 }) {
  const padL = 24;
  const padR = 6;
  const padT = 14;
  const plotH = 120;
  const n = Math.max(1, monthly.length);
  const slot = (width - padL - padR) / n;
  const bw = Math.min(22, Math.max(3, slot * 0.66));
  const max = Math.max(6, baseline || 0, ...monthly.map((m) => m.value || 0));
  const top = Math.ceil(max / 4) * 4;
  const y = (v) => padT + plotH * (1 - v / top);
  const kids = [];
  [0, top / 2, top].forEach((t) => {
    kids.push(h('line', { class: 'grid', x1: padL, x2: width - padR, y1: y(t), y2: y(t) }));
    kids.push(h('text', { class: 'ax', x: padL - 5, y: y(t) + 3.5, 'text-anchor': 'end' }, String(t)));
  });
  const startIdx = monthly.findIndex((m) => m.month >= startMonth);
  if (startIdx > 0) {
    const xs = padL + startIdx * slot;
    kids.push(h('line', {
      class: 'grid dash', x1: xs, x2: xs, y1: padT - 6, y2: padT + plotH,
    }));
    kids.push(h('text', { class: 'ax', x: xs + 3, y: padT - 4 }, 'inizio'));
  }
  monthly.forEach((m, i) => {
    const x = padL + i * slot + (slot - bw) / 2;
    if (m.value == null) {
      kids.push(h('text', { class: 'ax', x: x + bw / 2, y: padT + plotH - 3, 'text-anchor': 'middle', style: { fontSize: '7px' } }, '–'));
    } else {
      const bh = Math.max(1.5, plotH * Math.min(m.value, top) / top);
      const before = m.month < startMonth;
      kids.push(h('rect', {
        x, y: padT + plotH - bh, width: bw, height: bh, rx: Math.min(4, bw / 2), style: { fill: before ? 'var(--gray)' : color, opacity: m.partial ? 0.5 : (before ? 0.55 : 1) },
      }, h('title', {}, `${m.label}: ${fmtNum(m.value)} giorni${m.partial ? ' (mese incompleto, stima su 30 giorni)' : ''}`)));
      if (n <= 14) kids.push(h('text', { class: 'ax val', x: x + bw / 2, y: padT + plotH - bh - 3, 'text-anchor': 'middle' }, fmtNum(m.value)));
    }
    const every = Math.max(1, Math.ceil(n / 9));
    if (i % every === 0) kids.push(h('text', { class: 'ax', x: x + bw / 2, y: padT + plotH + 12, 'text-anchor': 'middle' }, m.label));
  });
  if (baseline != null) {
    kids.push(h('line', {
      class: 'base-line', x1: padL, x2: width - padR, y1: y(baseline), y2: y(baseline),
    }));
    kids.push(h('text', { class: 'ax', x: width - padR, y: y(baseline) - 4, 'text-anchor': 'end', style: { fill: 'var(--orange)' } }, `prima: ${fmtNum(baseline)}`));
  }
  return h('svg', {
    class: 'chart', viewBox: `0 0 ${width} ${padT + plotH + 18}`, role: 'img', 'aria-label': 'Giorni di emicrania al mese prima e durante la terapia', preserveAspectRatio: 'xMidYMid meet',
  }, ...kids);
}

/** Giorni di emicrania per settimana dall'ultima somministrazione. */
export function cycleChart(weeks) {
  return barChart({
    data: weeks.map((w) => ({
      label: w.label,
      value: w.rate == null ? 0 : Math.round(w.rate * 10) / 10,
      color: w.label === 'Oltre' ? 'var(--orange)' : null,
      title: w.rate == null ? `${w.label} settimana: dati insufficienti` : `${w.label} settimana: ${fmtNum(w.rate)} giorni di emicrania su 7`,
    })),
    yMax: 7,
    height: 130,
    showValues: true,
    valueFormat: fmtNum,
    ariaLabel: 'Giorni di emicrania per settimana dall’ultima somministrazione',
  });
}
