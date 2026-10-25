import { h, replaceChildren } from '../dom.js';
import { openFullscreen, segmented, button } from '../ui.js';

const PATTERNS = [
  {
    id: 'calm',
    label: 'Calma 4-6',
    phases: [
      { label: 'Inspira', dur: 4, scale: 1 },
      { label: 'Espira', dur: 6, scale: 0.55 },
    ],
  },
  {
    id: 'box',
    label: 'Quadrato',
    phases: [
      { label: 'Inspira', dur: 4, scale: 1 },
      { label: 'Trattieni', dur: 4, scale: 1 },
      { label: 'Espira', dur: 4, scale: 0.55 },
      { label: 'Trattieni', dur: 4, scale: 0.55 },
    ],
  },
  {
    id: '478',
    label: '4-7-8',
    phases: [
      { label: 'Inspira', dur: 4, scale: 1 },
      { label: 'Trattieni', dur: 7, scale: 1 },
      { label: 'Espira', dur: 8, scale: 0.55 },
    ],
  },
];

export function openRelief() {
  const full = openFullscreen({ label: 'Modalità sollievo' });
  const orb = h('div', { class: 'relief-orb' });
  const text = h('div', { class: 'relief-text', 'aria-live': 'polite' }, 'Respira con calma');
  const sub = h('div', { class: 'relief-sub' }, 'Luce bassa, silenzio. Se puoi, bevi un po’ d’acqua.');
  let pattern = PATTERNS[0];
  let running = false;
  let phaseTimer = null;
  let clockTimer = null;
  let startedAt = 0;
  let wake = null;
  let wakeToken = 0;

  const releaseWake = () => {
    wakeToken += 1;
    if (wake && wake.release) wake.release().catch(() => {});
    wake = null;
  };

  const runPhase = (i) => {
    if (!running) return;
    const p = pattern.phases[i % pattern.phases.length];
    text.textContent = p.label;
    orb.style.transition = `transform ${p.dur}s ease-in-out`;
    orb.style.transform = `scale(${p.scale})`;
    phaseTimer = setTimeout(() => runPhase(i + 1), p.dur * 1000);
  };

  const stop = () => {
    running = false;
    clearTimeout(phaseTimer);
    clearInterval(clockTimer);
    orb.style.transition = 'transform 1.2s ease-in-out';
    orb.style.transform = 'scale(.55)';
    text.textContent = 'Respira con calma';
    sub.textContent = 'Luce bassa, silenzio. Se puoi, bevi un po’ d’acqua.';
    releaseWake();
    paintButton();
  };

  const start = async () => {
    running = true;
    startedAt = Date.now();
    runPhase(0);
    clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      sub.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }, 1000);
    const token = wakeToken;
    try {
      if (navigator.wakeLock) {
        const sentinel = await navigator.wakeLock.request('screen');
        if (token === wakeToken && running) wake = sentinel;
        else sentinel.release().catch(() => {});
      }
    } catch (e) { /* non supportato */ }
    paintButton();
  };

  const toggleBtn = button({ label: 'Avvia', kind: 'secondary', size: 'lg', onClick: () => (running ? stop() : start()) });
  const paintButton = () => {
    replaceChildren(toggleBtn, h('span', {}, running ? 'Pausa' : 'Avvia'));
  };

  const picker = segmented({
    options: PATTERNS.map((p) => ({ value: p.id, label: p.label })),
    value: pattern.id,
    ariaLabel: 'Schema di respirazione',
    onChange: (v) => {
      pattern = PATTERNS.find((p) => p.id === v);
      if (running) {
        clearTimeout(phaseTimer);
        runPhase(0);
      }
    },
  });
  picker.style.width = 'min(100%, 340px)';

  replaceChildren(
    full.el,
    orb,
    text,
    sub,
    picker,
    h('div', { class: 'btn-row', style: { width: 'min(100%, 340px)' } }, toggleBtn, button({ label: 'Chiudi', kind: 'secondary', size: 'lg', onClick: () => full.close() })),
  );
  full.onClosed(() => {
    running = false;
    clearTimeout(phaseTimer);
    clearInterval(clockTimer);
    releaseWake();
  });
  return full;
}
