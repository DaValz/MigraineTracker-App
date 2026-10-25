import { h, replaceChildren } from '../dom.js';
import * as store from '../store.js';
import {
  getIndex, rangeStats, buckets, countLabels, medStats, mohStatus, episodeMinutes, isOngoing,
} from '../analysis.js';
import {
  openPage, segmented, button, dateInput, toast, alertBox, group, toggleRow,
} from '../ui.js';
import {
  typeLabel, sideLabel, effectLabel, medClassLabel, IMPACT_LEVELS, WORK_LEVELS, therapyClass, stopReasonLabel, docCategory, contactRole,
  visitKindLabel,
} from '../data.js';
import {
  todayStr, addDays, fmtDateShort, formatDuration, fmtTime, fmtMonthShort, nowStr,
} from '../dates.js';
import { plural, num, pct, safeFileName } from '../format.js';
import { shareFile, shareText } from '../exporter.js';
import { periodLabel } from './therapies.js';
import {
  clinicalSummary, therapyOutcome, outcomeLine, RESPONSES, longTermSeries, midasSeries, doseAnchors, isInjectable,
} from '../clinical.js';

const PW = 595.28;
const PH = 841.89;
const M = 40;
const SCALE = 2;
const MAX_PAGES = 18;
const MAX_CELL_LINES = 9;
const MAX_MEDS = 25;
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const COLORS = {
  ink: '#1c1c1e', sub: '#6b6b74', line: '#dedde6', brand: '#3e3cb8', soft: '#efeffb', bar: '#5856d6', danger: '#d70015', warn: '#b25000', est: '#b9b8ee', orange: '#ff9500',
};

const shortDT = (dt) => `${dt.slice(8, 10)}/${dt.slice(5, 7)}/${dt.slice(2, 4)} ${dt.slice(11)}`;
const shortD = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;

export function buildModel(db, from, to, today = todayStr(), opts = {}) {
  const idx = getIndex(db, store.getRev(), today);
  const f = from < idx.trackingStart ? idx.trackingStart : from;
  const stats = rangeStats(idx, db, f, to);
  const eps = stats.episodes;
  const therapies = [...db.preventives]
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .map((p) => ({ ...p, outcome: therapyOutcome(idx, db, p, today) }));
  return {
    name: db.settings.name,
    from: f,
    to,
    today,
    stats,
    months: buckets(idx, db, f, to, 'month'),
    meds: medStats(eps),
    triggers: countLabels(eps, 'triggers').slice(0, 6),
    symptoms: countLabels(eps, 'symptoms').slice(0, 6),
    moh: mohStatus(idx, today),
    preventives: therapies.filter((p) => p.start <= to && (!p.end || p.end >= f)),
    therapies,
    summary: opts.history === false ? null : clinicalSummary(idx, db, today),
    longTerm: longTermSeries(idx, db, today),
    midas: midasSeries(db),
    contacts: [...db.contacts].sort((a, b) => (b.main - a.main)),
    visits: db.visits.filter((v) => v.at >= nowStr()).sort((a, b) => (a.at < b.at ? -1 : 1)).slice(0, 3),
    docs: opts.docs === false ? [] : [...db.docs].sort((a, b) => (a.date < b.date ? 1 : -1)),
    showEpisodes: opts.episodes !== false,
    episodes: eps,
  };
}

export function summaryTextOf(model) {
  const s = model.stats;
  const months = Math.max(s.trackedDays / 30.4, 0.1);
  const lines = [
    `Diario emicrania${model.name ? ` di ${model.name}` : ''}`,
    `Periodo: dal ${fmtDateShort(model.from)} al ${fmtDateShort(model.to)}`,
    `Giorni con emicrania: ${s.migraineDays} su ${s.trackedDays}${s.trackedDays ? ` (${pct(s.migraineDays / s.trackedDays)})` : ''}`,
    `Attacchi: ${s.attacks}${s.trackedDays >= 14 ? ` (circa ${num(s.attacks / months)} al mese)` : ''}`,
  ];
  if (s.avgIntensity != null) lines.push(`Intensità media: ${num(s.avgIntensity)}/10 (massima ${s.peakIntensity})`);
  if (s.avgMinutes != null) lines.push(`Durata media: ${formatDuration(s.avgMinutes)}`);
  lines.push(`Giorni con farmaci: ${s.acuteMedDays}`);
  if (s.lostDays) lines.push(`Giornate di lavoro/scuola perse: ${s.lostDays}`);
  if (model.triggers.length) lines.push(`Fattori più frequenti: ${model.triggers.slice(0, 4).map((t) => `${t.label} (${t.count})`).join(', ')}`);
  if (model.meds.length) lines.push(`Farmaci: ${model.meds.slice(0, 4).map((m) => `${m.name} (${m.uses})`).join(', ')}`);
  if (model.therapies.length) {
    lines.push(`Terapie preventive: ${model.therapies.map((p) => {
      const ol = outcomeLine(p.outcome);
      return `${p.name}${p.dose ? ` ${p.dose}` : ''} (${periodLabel(p)}${ol ? `; ${ol}` : ''})`;
    }).join('; ')}`);
  }
  if (model.midas.length) {
    const m = model.midas[model.midas.length - 1];
    lines.push(`MIDAS: ${m.score} (grado ${m.grade.grade}) il ${fmtDateShort(m.date)}`);
  }
  return lines.join('\n');
}

class Doc {
  constructor() {
    this.pages = [];
    this.truncated = false;
    this.newPage();
  }

  newPage() {
    if (this.pages.length >= MAX_PAGES) {
      this.truncated = true;
      return false;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(PW * SCALE);
    canvas.height = Math.round(PH * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, PW, PH);
    ctx.textBaseline = 'alphabetic';
    this.pages.push({ canvas, ctx });
    this.ctx = ctx;
    this.y = M;
    return true;
  }

  font(size, weight = 400) {
    this.ctx.font = `${weight} ${size}px ${FONT}`;
  }

  width(text, size, weight = 400) {
    this.font(size, weight);
    return this.ctx.measureText(text).width;
  }

  wrap(text, maxW, size, weight = 400) {
    const out = [];
    String(text).split('\n').forEach((para) => {
      const words = para.split(/\s+/).filter(Boolean);
      let line = '';
      words.forEach((w) => {
        let word = w;
        while (this.width(word, size, weight) > maxW) {
          let cut = word.length - 1;
          while (cut > 1 && this.width(word.slice(0, cut), size, weight) > maxW) cut -= 1;
          if (line) {
            out.push(line);
            line = '';
          }
          out.push(word.slice(0, cut));
          word = word.slice(cut);
        }
        const test = line ? `${line} ${word}` : word;
        if (this.width(test, size, weight) <= maxW) {
          line = test;
        } else {
          if (line) out.push(line);
          line = word;
        }
      });
      out.push(line);
    });
    return out;
  }

  text(str, x, y, { size = 9, weight = 400, color = COLORS.ink, align = 'left' } = {}) {
    this.font(size, weight);
    this.ctx.fillStyle = color;
    this.ctx.textAlign = align;
    this.ctx.fillText(str, x, y);
    this.ctx.textAlign = 'left';
  }

  rect(x, y, w, hgt, fill, radius = 0) {
    const { ctx } = this;
    ctx.fillStyle = fill;
    if (radius && ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, hgt, radius);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, w, hgt);
    }
  }

  line(x1, y1, x2, y2, color = COLORS.line, w = 0.6) {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ensure(need, onNewPage) {
    if (this.truncated) return false;
    if (this.y + need > PH - M - 22) {
      if (!this.newPage()) return false;
      if (onNewPage) onNewPage();
    }
    return true;
  }

  heading(label) {
    if (!this.ensure(46)) return;
    this.y += 20;
    this.text(label, M, this.y, { size: 11.5, weight: 700, color: COLORS.brand });
    this.y += 5;
    this.line(M, this.y, PW - M, this.y, COLORS.brand, 0.8);
    this.y += 12;
  }

  paragraph(str, {
    size = 8.8, weight = 400, color = COLORS.ink, indent = 0, lh = 11.6, gap = 4, maxLines = 400,
  } = {}) {
    if (!str) return;
    const lines = this.wrap(str, PW - 2 * M - indent, size, weight).slice(0, maxLines);
    for (const l of lines) {
      if (!this.ensure(lh + 2)) return;
      this.text(l, M + indent, this.y + 8, { size, weight, color });
      this.y += lh;
    }
    this.y += gap;
  }
}

function drawHeader(d, model) {
  d.rect(0, 0, PW, 86, COLORS.brand);
  d.text('Diario dell’emicrania', M, 42, { size: 22, weight: 700, color: '#fff' });
  d.text('Report per il medico', M, 62, { size: 11, color: '#d9d2ff' });
  d.text(`Periodo: ${fmtDateShort(model.from)} – ${fmtDateShort(model.to)}`, PW - M, 42, { size: 10.5, weight: 600, color: '#fff', align: 'right' });
  if (model.name) d.text(model.name, PW - M, 62, { size: 10.5, color: '#d9d2ff', align: 'right' });
  d.y = 108;
}

function drawSummary(d, model) {
  const s = model.stats;
  const months = Math.max(s.trackedDays / 30.4, 0.1);
  const cells = [
    ['Giorni con emicrania', `${s.migraineDays}`, s.trackedDays ? `su ${s.trackedDays} giorni (${pct(s.migraineDays / s.trackedDays)})` : ''],
    ['Attacchi', `${s.attacks}`, s.trackedDays >= 14 ? `circa ${num(s.attacks / months)} al mese` : ''],
    ['Intensità media', s.avgIntensity == null ? '—' : `${num(s.avgIntensity)}/10`, s.peakIntensity ? `massima ${s.peakIntensity}/10` : ''],
    ['Durata media', formatDuration(s.avgMinutes), s.longestMinutes != null ? `massima ${formatDuration(s.longestMinutes)}` : ''],
    ['Giorni con farmaci', `${s.acuteMedDays}`, `ultimi 30 giorni: ${model.moh.any}`],
    ['Lavoro/scuola', `${s.lostDays}`, `giornate perse (${s.reducedDays} a rendimento ridotto)`],
  ];
  const cw = (PW - 2 * M - 2 * 8) / 3;
  const ch = 54;
  cells.forEach((c, i) => {
    const x = M + (i % 3) * (cw + 8);
    const y = d.y + Math.floor(i / 3) * (ch + 8);
    d.rect(x, y, cw, ch, COLORS.soft, 6);
    d.text(c[0], x + 10, y + 15, { size: 8, weight: 600, color: COLORS.sub });
    d.text(c[1], x + 10, y + 36, { size: 19, weight: 700, color: COLORS.ink });
    d.text(c[2], x + 10, y + 48, { size: 7.5, color: COLORS.sub });
  });
  d.y += 2 * (ch + 8) + 2;
  if (model.moh.level === 'warn') {
    d.ensure(34);
    d.rect(M, d.y, PW - 2 * M, 28, '#fff0d9', 6);
    const lines = d.wrap(`Attenzione: negli ultimi 30 giorni sono stati assunti farmaci sintomatici in ${model.moh.any} giorni. L’uso molto frequente può favorire la cefalea da uso eccessivo di farmaci.`, PW - 2 * M - 20, 8.5, 600);
    lines.slice(0, 2).forEach((l, i) => d.text(l, M + 10, d.y + 12 + i * 10.5, { size: 8.5, weight: 600, color: '#7a4a05' }));
    d.y += 36;
  }
}

function drawMonthlyChart(d, model) {
  if (model.months.length < 2) return;
  d.heading('Giorni con emicrania per mese');
  const h0 = 100;
  d.ensure(h0 + 24);
  const x0 = M + 22;
  const w = PW - 2 * M - 22;
  const maxV = Math.max(4, ...model.months.map((m) => m.migraineDays));
  const top = Math.ceil(maxV / 2) * 2;
  [0, top / 2, top].forEach((t) => {
    const y = d.y + h0 - (t / top) * h0;
    d.line(x0, y, x0 + w, y);
    d.text(String(t), x0 - 6, y + 3, { size: 7.5, color: COLORS.sub, align: 'right' });
  });
  const slot = w / model.months.length;
  const bw = Math.min(30, slot * 0.62);
  model.months.forEach((m, i) => {
    const bh = (m.migraineDays / top) * h0;
    const x = x0 + i * slot + (slot - bw) / 2;
    if (bh > 0) d.rect(x, d.y + h0 - bh, bw, bh, COLORS.bar, 2);
    d.text(String(m.migraineDays), x + bw / 2, d.y + h0 - bh - 3, { size: 7.5, weight: 600, color: COLORS.ink, align: 'center' });
    d.text(fmtMonthShort(m.month), x + bw / 2, d.y + h0 + 11, { size: 7.5, color: COLORS.sub, align: 'center' });
  });
  d.y += h0 + 18;
}

function drawLists(d, model) {
  if (!model.triggers.length && !model.symptoms.length) return;
  d.heading('Fattori e sintomi più frequenti');
  const colW = (PW - 2 * M - 20) / 2;
  const total = model.stats.attacks || 1;
  const draw = (title, items, x) => {
    d.text(title, x, d.y, { size: 9, weight: 700, color: COLORS.sub });
    items.forEach((it, i) => {
      const y = d.y + 14 + i * 14;
      d.text(it.label, x, y, { size: 9 });
      d.rect(x + 118, y - 7, colW - 118 - 52, 7, '#ebe9f5', 3.5);
      d.rect(x + 118, y - 7, Math.max(3, (colW - 118 - 52) * (it.count / total)), 7, COLORS.bar, 3.5);
      d.text(`${it.count} · ${pct(it.count / total)}`, x + colW, y, { size: 8, color: COLORS.sub, align: 'right' });
    });
  };
  d.ensure(14 + Math.max(model.triggers.length, model.symptoms.length) * 14 + 10);
  draw('Fattori scatenanti', model.triggers, M);
  draw('Sintomi associati', model.symptoms, M + colW + 20);
  d.y += 14 + Math.max(model.triggers.length, model.symptoms.length) * 14 + 4;
}

function drawTable(d, { columns, rows, size = 8, lh = 10.5 }) {
  const totalW = columns.reduce((a, c) => a + c.w, 0);
  const header = () => {
    d.rect(M, d.y, totalW, 16, COLORS.soft);
    let x = M;
    columns.forEach((c) => {
      d.text(c.label, c.align === 'right' ? x + c.w - 4 : x + 4, d.y + 11, { size: 7.5, weight: 700, color: COLORS.brand, align: c.align || 'left' });
      x += c.w;
    });
    d.y += 16;
  };
  if (!d.ensure(40)) return;
  header();
  for (const row of rows) {
    const wrapped = row.map((cell, i) => {
      const ls = d.wrap(cell, columns[i].w - 8, size, i === 0 ? 600 : 400);
      return ls.length > MAX_CELL_LINES ? [...ls.slice(0, MAX_CELL_LINES - 1), `${ls[MAX_CELL_LINES - 1]}…`] : ls;
    });
    const lines = Math.max(...wrapped.map((w) => w.length));
    const rowH = Math.max(1, lines) * lh + 7;
    if (!d.ensure(rowH, header)) return;
    let x = M;
    wrapped.forEach((ls, i) => {
      ls.forEach((l, li) => d.text(l, columns[i].align === 'right' ? x + columns[i].w - 4 : x + 4, d.y + 11 + li * lh, { size, weight: i === 0 ? 600 : 400, color: COLORS.ink, align: columns[i].align || 'left' }));
      x += columns[i].w;
    });
    d.y += rowH;
    d.line(M, d.y, M + totalW, d.y);
  }
}

function drawMeds(d, model) {
  if (!model.meds.length) return;
  d.heading('Farmaci utilizzati');
  const eff = (m) => (m.avgEffect == null ? 'non valutata' : `${effectLabel(Math.round(m.avgEffect)).toLowerCase()} (${num(m.avgEffect)}/3)`);
  drawTable(d, {
    columns: [{ label: 'Farmaco', w: 190 }, { label: 'Categoria', w: 140 }, { label: 'Volte', w: 50, align: 'right' }, { label: 'Efficacia media', w: 135, align: 'right' }],
    rows: model.meds.slice(0, MAX_MEDS).map((m) => [m.name, medClassLabel(m.cls), String(m.uses), eff(m)]),
  });
}

function drawPreventives(d, model) {
  if (!model.therapies.length) return;
  d.heading('Terapie di prevenzione e risposta');
  drawTable(d, {
    columns: [{ label: 'Terapia', w: 132 }, { label: 'Periodo', w: 112 }, { label: 'Giorni di emicrania al mese', w: 150 }, { label: 'Note', w: 121 }],
    rows: model.therapies.map((p) => {
      const o = p.outcome;
      const cls = therapyClass(p.cls);
      let eff = 'dati insufficienti';
      if (o.baseline && o.during && o.change && o.change.daysPct != null) {
        eff = `${num(o.baseline.days)} prima → ${num(o.during.days)} (${o.change.daysPct > 0 ? '+' : '−'}${pct(Math.abs(o.change.daysPct))})\n${RESPONSES[o.response].label}${o.early ? ' (preliminare)' : ''}\nBasale: ${o.baseline.label}`;
      } else if (o.baseline) {
        eff = `prima: ${num(o.baseline.days)} (${o.baseline.label})`;
      }
      const notes = [];
      if (isInjectable(p)) notes.push(`${plural(doseAnchors(p, model.today).length, p.cls === 'botox' ? 'seduta' : 'somministrazione', p.cls === 'botox' ? 'sedute' : 'somministrazioni')}${p.every ? ` ogni ${p.every} gg` : ''}`);
      if (p.stop) notes.push(`Interrotta: ${stopReasonLabel(p.stop).toLowerCase()}`);
      if (p.sides.length) notes.push(`Effetti: ${p.sides.join(', ')}`);
      if (p.rating != null) notes.push(`Beneficio riferito: ${['nessuno', 'poco', 'buono', 'ottimo'][p.rating]}`);
      if (o.cycle && o.cycle.wearingOff) notes.push('Più attacchi a fine ciclo');
      if (p.doctor) notes.push(`Prescritta da ${p.doctor}`);
      return [`${p.name}${p.dose ? `\n${p.dose}` : ''}\n${cls.short}`, periodLabel(p), eff, notes.join('\n') || '—'];
    }),
  });
}

function drawClinical(d, model) {
  const sum = model.summary;
  if (!sum || (!sum.blocks.length && !sum.observations.length)) return;
  d.heading('Sintesi clinica');
  sum.blocks.forEach((b) => {
    if (!d.ensure(30)) return;
    d.text(b.title.toUpperCase(), M, d.y + 8, { size: 7.5, weight: 700, color: COLORS.sub });
    d.y += 12;
    d.paragraph(b.id === 'narrative' && b.text.length > 3500 ? `${b.text.slice(0, 3500)}…` : b.text, { gap: 7 });
  });
  if (sum.observations.length) {
    if (!d.ensure(30)) return;
    d.text('OSSERVAZIONI AUTOMATICHE (DA VALUTARE CON IL MEDICO)', M, d.y + 8, { size: 7.5, weight: 700, color: COLORS.sub });
    d.y += 12;
    sum.observations.forEach((o) => d.paragraph(`• ${o.text}`, { indent: 0, gap: 3, color: o.tone === 'warn' ? COLORS.warn : COLORS.ink }));
  }
}

function drawLongTerm(d, model) {
  const s = model.longTerm;
  const pts = s.points;
  if (pts.filter((p) => p.value != null).length < 3 || (!s.therapies.length && !s.hasHistory)) return;
  d.heading('Andamento nel tempo e terapie');
  const plotH = 92;
  const laneH = 11;
  const lanesList = [];
  const x0 = M + 22;
  const w = PW - 2 * M - 22;
  const slot = w / pts.length;
  const per = s.unit === 'year' ? 12 : s.unit === 'quarter' ? 3 : 1;
  const first = pts[0].month;
  const monthsFrom = (dt) => (Number(dt.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + (Number(dt.slice(5, 7)) - Number(first.slice(5, 7))) + ((Number(dt.slice(8, 10)) || 1) - 1) / 31;
  const xOf = (dt) => x0 + Math.max(0, Math.min(w, (monthsFrom(dt) / per) * slot));
  const bands = s.therapies.map((t) => {
    const a = xOf(t.start < `${first}-01` ? `${first}-01` : t.start);
    const b = Math.max(a + 3, xOf(t.end && t.end < model.today ? t.end : model.today));
    let lane = lanesList.findIndex((e) => e < a - 2);
    if (lane < 0) {
      lane = lanesList.length;
      lanesList.push(b);
    } else lanesList[lane] = b;
    return {
      t, a, b, lane,
    };
  });
  const need = plotH + 26 + lanesList.length * (laneH + 3) + 12;
  if (!d.ensure(need)) return;
  const top = Math.max(8, Math.ceil(Math.max(...pts.map((p) => p.value || 0)) / 4) * 4);
  [0, top / 2, top].forEach((t) => {
    const y = d.y + plotH - (t / top) * plotH;
    d.line(x0, y, x0 + w, y);
    d.text(String(t), x0 - 6, y + 3, { size: 7.5, color: COLORS.sub, align: 'right' });
  });
  const bw = Math.max(1, Math.min(16, slot * 0.7));
  pts.forEach((p, i) => {
    if (p.value == null) return;
    const bh = Math.max(1, (Math.min(p.value, top) / top) * plotH);
    d.rect(x0 + i * slot + (slot - bw) / 2, d.y + plotH - bh, bw, bh, p.source === 'history' ? COLORS.est : COLORS.bar, Math.min(2, bw / 2));
  });
  const labelled = pts.map((p, i) => ({ p, i })).filter(({ p }) => (s.unit === 'month' ? true : !!p.label));
  const step = Math.max(1, Math.ceil(labelled.length / 10));
  labelled.forEach(({ p, i }, k) => {
    if (k % step) return;
    const label = s.unit === 'month' ? (pts.length > 14 ? `${fmtMonthShort(p.month)} ${p.month.slice(2, 4)}` : fmtMonthShort(p.month)) : p.label;
    d.text(label, x0 + i * slot + slot / 2, d.y + plotH + 10, { size: 6.8, color: COLORS.sub, align: 'center' });
  });
  const laneTop = d.y + plotH + 18;
  bands.forEach(({
    t, a, b, lane,
  }) => {
    const y = laneTop + lane * (laneH + 3);
    d.rect(a, y, b - a, laneH, therapyClass(t.cls).color, 3);
    const label = t.name.length > 26 ? `${t.name.slice(0, 25)}…` : t.name;
    const fits = d.width(label, 7, 700) + 8 < b - a;
    d.text(label, fits ? a + 4 : Math.min(b + 4, PW - M - d.width(label, 7, 700)), y + 8, { size: 7, weight: 700, color: fits ? '#ffffff' : COLORS.sub });
  });
  d.y = laneTop + lanesList.length * (laneH + 3) + 4;
  d.text(`Giorni con mal di testa al mese${s.unit === 'month' ? '' : (s.unit === 'year' ? ' (media annua)' : ' (media trimestrale)')}. Barre chiare: stime riferite dal paziente; barre scure: diario.`, M, d.y + 6, { size: 7.2, color: COLORS.sub });
  d.y += 14;
}

function drawMidas(d, model) {
  if (!model.midas.length) return;
  d.heading('Disabilità (MIDAS)');
  drawTable(d, {
    columns: [{ label: 'Data', w: 90 }, { label: 'Punteggio', w: 80, align: 'right' }, { label: 'Grado', w: 180 }, { label: 'Giorni con mal di testa / dolore medio', w: 165 }],
    rows: [...model.midas].reverse().slice(0, 12).map((m) => [fmtDateShort(m.date), String(m.score), `${m.grade.grade} · ${m.grade.label}`, `${m.a != null ? `${m.a} giorni` : '—'} / ${m.b != null ? `${m.b}/10` : '—'}`]),
  });
}

function drawCare(d, model) {
  if (!model.contacts.length && !model.visits.length) return;
  d.heading('Centro curante');
  if (model.contacts.length) {
    drawTable(d, {
      columns: [{ label: 'Nome', w: 170 }, { label: 'Struttura', w: 175 }, { label: 'Contatti', w: 170 }],
      rows: model.contacts.slice(0, 8).map((c) => [`${c.name}\n${contactRole(c.role).label}${c.main ? ' (principale)' : ''}`, [c.org, c.dept, c.address].filter(Boolean).join('\n') || '—', [c.phone, c.phone2, c.email].filter(Boolean).join('\n') || '—']),
    });
  }
  if (model.visits.length) {
    d.y += 6;
    d.paragraph(`Prossime visite: ${model.visits.map((v) => `${shortD(v.at)} alle ${v.at.slice(11)} (${visitKindLabel(v.kind).toLowerCase()})`).join('; ')}.`, { size: 8.4 });
  }
}

function drawDocs(d, model) {
  if (!model.docs.length) return;
  d.heading(`Documenti in archivio (${model.docs.length})`);
  drawTable(d, {
    columns: [{ label: 'Data', w: 62 }, { label: 'Categoria', w: 130 }, { label: 'Documento', w: 253 }, { label: 'File', w: 70, align: 'right' }],
    rows: model.docs.slice(0, 80).map((doc) => [shortD(doc.date), docCategory(doc.cat).label, `${doc.title}${doc.note ? `\n${doc.note.length > 120 ? `${doc.note.slice(0, 120)}…` : doc.note}` : ''}`, String(doc.files.length)]),
    size: 7.6,
    lh: 9.6,
  });
}

function episodeRow(e) {
  let dur = isOngoing(e) ? 'in corso' : formatDuration(episodeMinutes(e));
  if (e.timeUnknown) dur = e.approxDur === 'days' ? `fino al ${shortD(e.end)}` : ({ lt4: '< 4 h', '4to12': '4–12 h', '12to24': '12–24 h' }[e.approxDur] || 'n.d.');
  const kind = [typeLabel(e.type), sideLabel(e.side), e.areas.join(', '), e.quality.join(', '), e.aura.length ? `Aura: ${e.aura.join(', ')}` : ''].filter(Boolean).join(' · ');
  const meds = e.meds.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ''}${e.timeUnknown ? '' : ` ${fmtTime(m.at)}`}${m.effect != null ? ` (${effectLabel(m.effect).toLowerCase()})` : ''}`).join('\n');
  const impact = [];
  if (e.impact >= 2) impact.push(`Attività: ${(IMPACT_LEVELS.find((l) => l.v === e.impact) || {}).label}`);
  if (e.work) impact.push((WORK_LEVELS.find((l) => l.v === e.work) || {}).label);
  const tx = e.tx && e.tx.vs ? `Rispetto a prima della terapia: ${{ better: 'più leggero', same: 'come prima', worse: 'più forte' }[e.tx.vs]}${e.tx.missed ? ' (dose saltata)' : ''}` : '';
  const extra = [e.symptoms.length ? `Sintomi: ${e.symptoms.join(', ')}` : '', e.triggers.length ? `Fattori: ${e.triggers.join(', ')}` : '', impact.join(', '), tx, e.note ? `Note: ${e.note.length > 160 ? `${e.note.slice(0, 160)}…` : e.note}` : ''].filter(Boolean).join('\n');
  return [e.timeUnknown ? `${shortD(e.start)}\nora n.d.` : shortDT(e.start), dur, String(e.intensity), kind || '—', meds || '—', extra || '—'];
}

const MAX_LIST = 200;

function drawEpisodes(d, model) {
  if (!model.showEpisodes) return;
  const total = model.episodes.length;
  d.heading(`Elenco degli attacchi (${total})`);
  if (!total) {
    d.text('Nessun attacco registrato nel periodo.', M, d.y + 4, { size: 9, color: COLORS.sub });
    d.y += 20;
    return;
  }
  drawTable(d, {
    columns: [
      { label: 'Inizio', w: 62 }, { label: 'Durata', w: 46 }, { label: 'Int.', w: 24, align: 'right' }, { label: 'Tipo e sede', w: 105 }, { label: 'Farmaci (efficacia)', w: 112 }, { label: 'Sintomi, fattori, note', w: 166 },
    ],
    rows: [...model.episodes].reverse().slice(0, MAX_LIST).map(episodeRow),
    size: 7.5,
    lh: 9.6,
  });
  if (total > MAX_LIST || d.truncated) {
    const shown = d.truncated ? 'Report troncato per dimensione' : `Elenco limitato ai ${MAX_LIST} attacchi più recenti su ${total}`;
    d.ctx = d.pages[d.pages.length - 1].ctx;
    d.text(`${shown}. Per l’elenco completo esporta il CSV da Impostazioni › Dati e backup.`, M, Math.min(d.y + 14, PH - 46), { size: 8, color: COLORS.sub });
  }
}

function drawFooters(d, model) {
  const total = d.pages.length;
  d.pages.forEach((p, i) => {
    d.ctx = p.ctx;
    d.line(M, PH - 34, PW - M, PH - 34);
    d.text(`Generato con Diario Emicrania il ${fmtDateShort(model.today)}. Strumento di registrazione personale: non è un documento medico.`, M, PH - 22, { size: 7, color: COLORS.sub });
    d.text(`Pagina ${i + 1} di ${total}`, PW - M, PH - 22, { size: 7, color: COLORS.sub, align: 'right' });
  });
}

export function renderPages(model) {
  const d = new Doc();
  drawHeader(d, model);
  drawSummary(d, model);
  drawClinical(d, model);
  drawLongTerm(d, model);
  drawMonthlyChart(d, model);
  drawPreventives(d, model);
  drawMidas(d, model);
  drawLists(d, model);
  drawMeds(d, model);
  drawCare(d, model);
  drawDocs(d, model);
  drawEpisodes(d, model);
  drawFooters(d, model);
  return d.pages.map((p) => p.canvas);
}

const canvasToBlob = (canvas, quality = 0.92) => new Promise((resolve, reject) => {
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Impossibile creare l’immagine'))), 'image/jpeg', quality);
});

export async function pagesToPdf(canvases) {
  const enc = new TextEncoder();
  const parts = [];
  let pos = 0;
  const offsets = [];
  const push = (data) => {
    const u = typeof data === 'string' ? enc.encode(data) : data;
    parts.push(u);
    pos += u.length;
  };
  const jpegs = [];
  const jpegBlobs = [];
  const dims = canvases.map((c) => [c.width, c.height]);
  for (const c of canvases) {
    const b = await canvasToBlob(c);
    c.width = 0;
    c.height = 0;
    jpegBlobs.push(b);
    jpegs.push(new Uint8Array(await b.arrayBuffer()));
  }
  const n = canvases.length;
  const first = (i) => 4 + i * 3;
  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const obj = (num, body) => {
    offsets[num] = pos;
    push(`${num} 0 obj\n${body}\nendobj\n`);
  };
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${canvases.map((_, i) => `${first(i)} 0 R`).join(' ')}] /Count ${n} >>`);
  obj(3, '<< /Title (Diario Emicrania - Report) /Producer (Diario Emicrania) >>');
  canvases.forEach((_, i) => {
    const page = first(i);
    const content = page + 1;
    const img = page + 2;
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im${i} ${img} 0 R >> >> /Contents ${content} 0 R >>`);
    const stream = `q ${PW} 0 0 ${PH} 0 0 cm /Im${i} Do Q`;
    obj(content, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    offsets[img] = pos;
    push(`${img} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${dims[i][0]} /Height ${dims[i][1]} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegs[i].length} >>\nstream\n`);
    push(jpegs[i]);
    push('\nendstream\nendobj\n');
  });
  const total = 3 + n * 3;
  const xrefPos = pos;
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= total; i += 1) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
  return { blob: new Blob(parts, { type: 'application/pdf' }), jpegBlobs };
}

export function openReport() {
  const page = openPage({ title: 'Report per il medico' });
  const state = {
    period: '90', from: addDays(todayStr(), -89), to: todayStr(), blob: null, model: null, token: 0, urls: [], opts: { history: true, episodes: true, docs: true },
  };
  const previewBox = h('div', { class: 'report-pages' });
  const status = h('p', { class: 'muted small center' }, '');
  const shareBtn = button({ label: 'Condividi PDF', kind: 'primary', icon: 'share', block: true, disabled: true });
  const textBtn = button({ label: 'Condividi riepilogo testuale', kind: 'secondary', icon: 'file', block: true });
  const customBox = h('div', { class: 'two-col mt', hidden: true });
  const releaseUrls = () => {
    state.urls.forEach((u) => URL.revokeObjectURL(u));
    state.urls = [];
  };
  page.onClosed(() => {
    state.token += 1;
    releaseUrls();
  });

  const dates = () => {
    const today = todayStr();
    if (state.period === 'custom') return { from: state.from, to: state.to };
    if (state.period === 'all') return { from: '1970-01-01', to: today };
    return { from: addDays(today, -(Number(state.period) - 1)), to: today };
  };

  const build = async () => {
    state.token += 1;
    const my = state.token;
    state.blob = null;
    shareBtn.disabled = true;
    releaseUrls();
    const { from, to } = dates();
    replaceChildren(previewBox);
    if (from > to) {
      status.textContent = 'La data iniziale è dopo quella finale.';
      return;
    }
    status.textContent = 'Preparazione del report…';
    await new Promise((r) => setTimeout(r, 30));
    if (my !== state.token) return;
    const model = buildModel(store.getDb(), from, to, todayStr(), state.opts);
    state.model = model;
    let canvases = [];
    try {
      canvases = renderPages(model);
      const { blob, jpegBlobs } = await pagesToPdf(canvases);
      if (my !== state.token) return;
      state.blob = blob;
      state.urls = jpegBlobs.map((b) => URL.createObjectURL(b));
      replaceChildren(previewBox, ...state.urls.map((url, i) => h('img', {
        class: 'report-page', src: url, alt: `Anteprima della pagina ${i + 1} del report`, draggable: 'false',
      })));
      shareBtn.disabled = false;
      status.textContent = `${plural(canvases.length, 'pagina', 'pagine')} · ${plural(model.stats.attacks, 'attacco', 'attacchi')} nel periodo`;
    } catch (e) {
      console.error(e);
      status.textContent = 'Non sono riuscito a creare il report: prova con un periodo più breve.';
    } finally {
      canvases.forEach((c) => {
        c.width = 0;
        c.height = 0;
      });
    }
  };

  shareBtn.addEventListener('click', async () => {
    if (!state.blob || !state.model) return;
    const name = `report-emicrania-${safeFileName(state.model.name || 'diario')}-${todayStr()}.pdf`;
    const r = await shareFile({ blob: state.blob, filename: name, title: 'Report emicrania' });
    if (r === 'downloaded') toast('PDF scaricato');
  });
  textBtn.addEventListener('click', async () => {
    if (!state.model) return;
    const r = await shareText({ text: summaryTextOf(state.model), title: 'Riepilogo emicrania' });
    if (r === 'copied') toast('Riepilogo copiato negli appunti');
    else if (r === 'failed') toast('Non è stato possibile condividere il testo', { tone: 'error' });
  });

  const seg = segmented({
    options: [{ value: '90', label: '3 mesi' }, { value: '180', label: '6 mesi' }, { value: '365', label: '12 mesi' }, { value: 'all', label: 'Tutto' }, { value: 'custom', label: 'Altro' }],
    value: state.period,
    ariaLabel: 'Periodo del report',
    onChange: (v) => {
      state.period = v;
      customBox.hidden = v !== 'custom';
      build();
    },
  });
  replaceChildren(
    customBox,
    h('div', {}, h('div', { class: 'field-label' }, 'Dal'), dateInput({ value: state.from, max: todayStr(), label: 'Data iniziale', onChange: (v) => { if (v) { state.from = v; build(); } } })),
    h('div', {}, h('div', { class: 'field-label' }, 'Al'), dateInput({ value: state.to, max: todayStr(), label: 'Data finale', onChange: (v) => { if (v) { state.to = v; build(); } } })),
  );

  const db0 = store.getDb();
  const options = group(
    toggleRow({
      icon: 'book', tone: 'indigo', title: 'Sintesi clinica e storia', subtitle: 'Anamnesi, terapie passate e osservazioni', checked: state.opts.history, onChange: (v) => { state.opts.history = v; build(); },
    }),
    toggleRow({
      icon: 'list', tone: 'blue', title: 'Elenco degli attacchi', checked: state.opts.episodes, onChange: (v) => { state.opts.episodes = v; build(); },
    }),
    db0.docs.length ? toggleRow({
      icon: 'folder', tone: 'teal', title: 'Elenco dei documenti', subtitle: 'Solo titoli e date, non i file', checked: state.opts.docs, onChange: (v) => { state.opts.docs = v; build(); },
    }) : null,
  );

  replaceChildren(
    page.body,
    h('p', { class: 'page-intro' }, 'Un PDF chiaro da mostrare al medico: sintesi clinica, andamento, terapie con la loro efficacia, farmaci ed elenco degli attacchi.'),
    seg,
    customBox,
    h('div', { class: 'mt' }, options),
    h('div', { class: 'today-actions' }, shareBtn, textBtn),
    h('div', { class: 'mt mb' }, status),
    previewBox,
    h('div', { class: 'mt' }, alertBox({ tone: 'info', icon: 'info', text: 'Il report contiene dati sulla tua salute: condividilo solo con persone di cui ti fidi.' })),
  );
  build();
  return page;
}
