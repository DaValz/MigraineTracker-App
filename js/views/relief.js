import { h, replaceChildren } from '../dom.js';
import { openFullscreen, segmented, button } from '../ui.js';
import { t } from '../i18n.js';

const PATTERNS = [
  {
    id: 'calm',
    label: t('Calma 4-6'),
    phases: [
      { label: t('Inspira'), dur: 4, scale: 1 },
      { label: t('Espira'), dur: 6, scale: 0.55 },
    ],
  },
  {
    id: 'box',
    label: t('Quadrato'),
    phases: [
      { label: t('Inspira'), dur: 4, scale: 1 },
      { label: t('Trattieni'), dur: 4, scale: 1 },
      { label: t('Espira'), dur: 4, scale: 0.55 },
      { label: t('Trattieni'), dur: 4, scale: 0.55 },
    ],
  },
  {
    id: '478',
    label: '4-7-8',
    phases: [
      { label: t('Inspira'), dur: 4, scale: 1 },
      { label: t('Trattieni'), dur: 7, scale: 1 },
      { label: t('Espira'), dur: 8, scale: 0.55 },
    ],
  },
];

export function openRelief() {
  const full = openFullscreen({ label: t('Modalità sollievo') });
  const idleText = t('Respira con calma');
  const idleHint = t('Luce bassa, silenzio. Se puoi, bevi un po’ d’acqua.');
  const orb = h('div', { class: 'relief-orb' });
  const text = h('div', { class: 'relief-text', 'aria-live': 'polite' }, idleText);
  const sub = h('div', { class: 'relief-sub' }, idleHint);
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
    orb.style.transition = `transform ${p.dur}s ease-in-out`; // i18n-ignore
    orb.style.transform = `scale(${p.scale})`; // i18n-ignore
    phaseTimer = setTimeout(() => runPhase(i + 1), p.dur * 1000);
  };

  const stop = () => {
    running = false;
    clearTimeout(phaseTimer);
    clearInterval(clockTimer);
    orb.style.transition = 'transform 1.2s ease-in-out'; // i18n-ignore
    orb.style.transform = 'scale(.55)';
    text.textContent = idleText;
    sub.textContent = idleHint;
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

  const toggleBtn = button({ label: t('Avvia'), kind: 'secondary', size: 'lg', onClick: () => (running ? stop() : start()) });
  const paintButton = () => {
    replaceChildren(toggleBtn, h('span', {}, running ? t('Pausa') : t('Avvia')));
  };

  const picker = segmented({
    options: PATTERNS.map((p) => ({ value: p.id, label: p.label })),
    value: pattern.id,
    ariaLabel: t('Schema di respirazione'),
    onChange: (v) => {
      pattern = PATTERNS.find((p) => p.id === v);
      if (running) {
        clearTimeout(phaseTimer);
        runPhase(0);
      }
    },
  });
  picker.style.width = 'min(100%, 340px)'; // i18n-ignore

  replaceChildren(
    full.el,
    orb,
    text,
    sub,
    picker,
    h('div', { class: 'btn-row', style: { width: 'min(100%, 340px)' } }, toggleBtn, button({ label: t('Chiudi'), kind: 'secondary', size: 'lg', onClick: () => full.close() })), // i18n-ignore
  );
  full.onClosed(() => {
    running = false;
    clearTimeout(phaseTimer);
    clearInterval(clockTimer);
    releaseWake();
  });
  return full;
}
