import { h, clear, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { INTENSITY_COLORS, INTENSITY_LABELS, intensityBand } from './data.js';
import { t, tv } from './i18n.js';
import { capitalize, fmt } from './dates.js';

let appEl = null;
let overlayEl = null;
let toastEl = null;
const stack = [];

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initUi({ app, overlays, toasts }) {
  appEl = app;
  overlayEl = overlays;
  toastEl = toasts;
}

export const overlayCount = () => stack.length;

function syncInert() {
  if (appEl) appEl.inert = stack.length > 0;
  stack.forEach((e, i) => {
    e.el.inert = i < stack.length - 1;
  });
}

function mount(entry) {
  entry.prevFocus = document.activeElement;
  stack.push(entry);
  entry.el.style.zIndex = String(100 + stack.length * 10);
  overlayEl.appendChild(entry.el);
  syncInert();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!entry.closed) entry.el.classList.add('open');
  }));
  entry.el.setAttribute('tabindex', '-1');
  try {
    entry.el.focus({ preventScroll: true });
  } catch (e) { /* ignorato */ }
}

function unmount(entry) {
  if (entry.closed) return;
  entry.closed = true;
  const i = stack.indexOf(entry);
  if (i >= 0) stack.splice(i, 1);
  syncInert();
  entry.el.classList.remove('open');
  entry.el.classList.add('closing');
  const remove = () => entry.el.remove();
  if (reducedMotion()) remove();
  else setTimeout(remove, 280);
  const pf = entry.prevFocus;
  if (pf && pf.isConnected && typeof pf.focus === 'function') {
    try {
      pf.focus({ preventScroll: true });
    } catch (e) { /* ignorato */ }
  }
  (entry.closedFns || []).forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  });
}

export function closeAllOverlays() {
  [...stack].reverse().forEach(unmount);
}

export function openFullscreen({ className = '', label = '' } = {}) {
  const el = h('div', { class: `relief ${className}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-label': label });
  const entry = { el, type: 'full' };
  const api = {
    el,
    close() {
      unmount(entry);
    },
    isClosed: () => !!entry.closed,
    onClosed(fn) {
      (entry.closedFns || (entry.closedFns = [])).push(fn);
    },
  };
  mount(entry);
  return api;
}

export function openPage({ title = '', right = null, backLabel = null, onBack = null, className = '' } = {}) {
  const titleEl = h('h1', { class: 'bar-title' }, title);
  const iconOnly = !backLabel;
  const backBtn = h('button', { type: 'button', class: `bar-btn${iconOnly ? ' icon-only' : ''}`, 'aria-label': backLabel || t('Indietro') }, iconOnly ? icon('chevron-left', 22) : h('span', {}, backLabel));
  const rightEl = h('div', { class: 'bar-right' }, right);
  const header = h('header', { class: 'bar' }, h('div', { class: 'bar-inner' }, backBtn, titleEl, rightEl));
  const body = h('div', { class: 'page-body' });
  const el = h('div', { class: `page ${className}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, header, body);
  body.addEventListener('scroll', () => el.classList.toggle('scrolled', body.scrollTop > 8), { passive: true });
  const entry = { el, type: 'page' };
  const api = {
    el,
    body,
    header,
    setTitle(text) {
      titleEl.textContent = text;
      el.setAttribute('aria-label', text);
    },
    setRight(...nodes) {
      replaceChildren(rightEl, ...nodes);
    },
    close() {
      unmount(entry);
    },
    isClosed: () => !!entry.closed,
    onClosed(fn) {
      (entry.closedFns || (entry.closedFns = [])).push(fn);
    },
  };
  backBtn.addEventListener('click', () => (onBack ? onBack(api) : api.close()));
  mount(entry);
  return api;
}

export function openSheet({ title = '', onDismiss = null, className = '', tall = false } = {}) {
  const body = h('div', { class: 'sheet-body' });
  const titleEl = h('h2', { class: 'sheet-title' }, title);
  const closeBtn = h('button', { class: 'sheet-close', type: 'button', 'aria-label': t('Chiudi') }, icon('x', 20));
  const panel = h(
    'div',
    { class: `sheet${tall ? ' tall' : ''} ${className}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-grab' }),
    h('div', { class: 'sheet-head' }, titleEl, closeBtn),
    body,
  );
  const backdrop = h('div', { class: 'backdrop' });
  const el = h('div', { class: 'sheet-wrap' }, backdrop, panel);
  const entry = { el, type: 'sheet' };
  const api = {
    el,
    body,
    setTitle(text) {
      titleEl.textContent = text;
    },
    close() {
      unmount(entry);
    },
    isClosed: () => !!entry.closed,
    onClosed(fn) {
      (entry.closedFns || (entry.closedFns = [])).push(fn);
    },
  };
  const dismiss = () => (onDismiss ? onDismiss(api) : api.close());
  backdrop.addEventListener('click', dismiss);
  closeBtn.addEventListener('click', dismiss);
  mount(entry);
  return api;
}

export function openDialog({ title, message = '', content = null, buttons, dismissValue = null, stack = false }) {
  return new Promise((resolve) => {
    const entry = { type: 'dialog' };
    const done = (v) => {
      unmount(entry);
      resolve(v);
    };
    const btns = buttons.map((b) => h('button', {
      type: 'button',
      class: `dlg-btn ${b.kind || ''}`.trim(),
      onclick: () => (b.onClick ? b.onClick(done) : done(b.value)),
    }, b.label));
    const box = h(
      'div',
      { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
      h('h2', { class: 'dlg-title' }, title),
      message ? h('p', { class: 'dlg-msg' }, message) : null,
      content,
      h('div', { class: `dlg-actions${stack || buttons.length > 2 ? ' stack' : ''}` }, btns),
    );
    entry.el = h('div', { class: 'dialog-wrap' }, h('div', { class: 'backdrop', onclick: () => done(dismissValue) }), box);
    mount(entry);
  });
}

export function confirmDialog({ title, message = '', confirmLabel = t('Conferma'), cancelLabel = t('Annulla'), danger = false }) {
  return openDialog({
    title,
    message,
    dismissValue: false,
    buttons: [
      { label: cancelLabel, value: false },
      { label: confirmLabel, value: true, kind: danger ? 'danger' : 'primary' },
    ],
  });
}

export function alertDialog({ title, message = '', okLabel = t('OK') }) {
  return openDialog({ title, message, dismissValue: true, buttons: [{ label: okLabel, value: true, kind: 'primary' }] });
}

export function promptDialog({
  title, message = '', value = '', placeholder = '', confirmLabel = t('Salva'), maxLength = 80, inputMode = 'text', type = 'text', extra = null,
}) {
  const input = h('input', {
    class: 'input', type, value, placeholder, maxlength: maxLength, inputmode: inputMode, autocomplete: 'off', autocapitalize: 'sentences', 'aria-label': title,
  });
  const content = h('div', { class: 'dlg-content' }, input, extra);
  const p = openDialog({
    title,
    message,
    content,
    dismissValue: null,
    buttons: [
      { label: t('Annulla'), value: null },
      { label: confirmLabel, kind: 'primary', onClick: (done) => done(input.value.trim()) },
    ],
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { // i18n-ignore
      e.preventDefault();
      const ok = content.parentElement && content.parentElement.querySelector('.dlg-btn.primary');
      if (ok) ok.click();
    }
  });
  setTimeout(() => input.focus(), 120);
  return p;
}

let toastTimer = null;
export function toast(message, { action = null, duration = 4200, tone = '' } = {}) {
  if (!toastEl) return;
  clearTimeout(toastTimer);
  clear(toastEl);
  const el = h('div', { class: `toast ${tone}`.trim(), role: 'status' }, h('span', { class: 'toast-msg' }, message));
  const dismiss = () => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 260);
  };
  if (action) {
    el.appendChild(h('button', {
      type: 'button',
      class: 'toast-act',
      onclick: () => {
        dismiss();
        action.onClick();
      },
    }, action.label));
  }
  toastEl.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  toastTimer = setTimeout(dismiss, duration);
}

export function button({ label, onClick, kind = 'primary', icon: ic = null, block = false, size = '', disabled = false, type = 'button', ariaLabel = null }) {
  const cls = ['btn', kind, size, block ? 'block' : ''].filter(Boolean).join(' ');
  return h('button', {
    type, class: cls, disabled, onclick: onClick, 'aria-label': ariaLabel,
  }, ic ? icon(ic, size === 'lg' ? 22 : 18) : null, label ? h('span', {}, label) : null);
}

export function chipGroup({ options, value, multi = false, onChange, allowClear = true, cls = '' }) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: tv(o) } : o));
  let current = multi ? new Set(value || []) : (value == null || value === '' ? null : value);
  const root = h('div', { class: `chips ${cls}`.trim(), role: multi ? 'group' : 'radiogroup' });
  const btns = opts.map((o) => h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false' }, o.label));
  const paint = () => btns.forEach((b, i) => {
    const on = multi ? current.has(opts[i].value) : current === opts[i].value;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  const emit = () => {
    if (!onChange) return;
    onChange(multi ? opts.filter((o) => current.has(o.value)).map((o) => o.value) : current);
  };
  btns.forEach((b, i) => b.addEventListener('click', () => {
    const v = opts[i].value;
    if (multi) {
      if (current.has(v)) current.delete(v);
      else current.add(v);
    } else if (current === v) {
      if (!allowClear) return;
      current = null;
    } else {
      current = v;
    }
    paint();
    emit();
  }));
  paint();
  btns.forEach((b) => root.appendChild(b));
  return root;
}

export function segmented({ options, value, onChange, ariaLabel = '', cls = '' }) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: tv(o) } : o));
  let current = value;
  const root = h('div', { class: `seg ${cls}`.trim(), role: 'radiogroup', 'aria-label': ariaLabel });
  const btns = opts.map((o) => h('button', { type: 'button', class: 'seg-btn', role: 'radio', 'aria-checked': 'false' }, o.label));
  const paint = () => btns.forEach((b, i) => {
    const on = opts[i].value === current;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
  });
  btns.forEach((b, i) => b.addEventListener('click', () => {
    if (current === opts[i].value) return;
    current = opts[i].value;
    paint();
    if (onChange) onChange(current);
  }));
  paint();
  btns.forEach((b) => root.appendChild(b));
  return root;
}

export function switchControl({ checked, onChange, label }) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked: !!checked, 'aria-label': label });
  input.addEventListener('change', () => onChange && onChange(input.checked));
  return h('span', { class: 'switch' }, input, h('span', { class: 'knob' }));
}

export function toggleRow({ title, subtitle, checked, onChange, icon: ic, tone }) {
  const sw = switchControl({ checked, onChange, label: title });
  return h(
    'label',
    { class: 'row' },
    ic ? h('span', { class: `row-icon ${tone || ''}`.trim() }, icon(ic, 18)) : null,
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), subtitle ? h('span', { class: 'row-sub' }, subtitle) : null),
    sw,
  );
}

export function row({
  icon: ic, tone = '', title, subtitle = null, right = null, onClick = null, chevron = false, danger = false, disabled = false, href = null, thumb = null, target = null,
}) {
  const content = [
    thumb || null,
    !thumb && ic ? h('span', { class: `row-icon ${tone}`.trim() }, icon(ic, 18)) : null,
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), subtitle ? h('span', { class: 'row-sub' }, subtitle) : null),
    right != null ? h('span', { class: 'row-right' }, right) : null,
    chevron ? icon('chevron-right', 18, 'chev') : null,
  ];
  if (href) return h('a', { class: `row${danger ? ' danger' : ''}`, href, target, rel: target ? 'noopener noreferrer' : null }, ...content);
  if (onClick) return h('button', { type: 'button', class: `row${danger ? ' danger' : ''}`, onclick: onClick, disabled }, ...content);
  return h('div', { class: `row${danger ? ' danger' : ''}` }, ...content);
}

export const group = (...children) => h('div', { class: 'group' }, ...children);

export function section(title, ...children) {
  return h('section', { class: 'section' }, title ? h('h2', { class: 'section-title' }, title) : null, ...children);
}

/** Titolo di sezione grande (stile app Salute), con un eventuale link a destra. */
export function headline(text, action = null) {
  return h('div', { class: 'headline' }, h('h2', {}, text), action ? h('button', { type: 'button', class: 'link', onclick: action.onClick }, action.label) : null);
}

export const pill = (text, tone = '') => h('span', { class: `pill ${tone}`.trim() }, text);

export const footnote = (text) => h('p', { class: 'footnote' }, text);

export function card(...children) {
  return h('div', { class: 'card' }, ...children);
}

export function cardTitle(text, right = null) {
  return h('div', { class: 'card-title' }, h('h3', {}, text), right);
}

export const linkButton = (label, onClick) => h('button', { type: 'button', class: 'link', onclick: onClick }, label);

export function field({ label, hint = null, control, cls = '' }) {
  return h('div', { class: `field ${cls}`.trim() }, label ? h('div', { class: 'field-label' }, label) : null, control, hint ? h('p', { class: 'field-hint' }, hint) : null);
}

export function stepper({ value, min = 0, max = 99, step = 1, start = null, onChange, format = (v) => String(v), unit = '', label = '' }) {
  let cur = value == null ? null : value;
  const base = start != null ? start : min;
  const out = h('output', { class: 'stepper-val', 'aria-live': 'polite' });
  const dec = h('button', { type: 'button', class: 'stepper-btn', 'aria-label': t('Diminuisci {label}', { label }).trim() }, icon('minus', 18));
  const inc = h('button', { type: 'button', class: 'stepper-btn', 'aria-label': t('Aumenta {label}', { label }).trim() }, icon('plus', 18));
  const paint = () => {
    out.textContent = cur == null ? '—' : `${format(cur)}${unit ? ` ${unit}` : ''}`;
    out.classList.toggle('empty', cur == null);
    dec.disabled = cur == null || cur <= min;
    inc.disabled = cur != null && cur >= max;
  };
  const set = (v) => {
    cur = Math.round(Math.min(max, Math.max(min, v)) * 1000) / 1000;
    paint();
    if (onChange) onChange(cur);
  };
  dec.addEventListener('click', () => set(cur == null ? base : cur - step));
  inc.addEventListener('click', () => set(cur == null ? base : cur + step));
  paint();
  return h('div', { class: 'stepper' }, dec, out, inc);
}

export function alertBox({ tone = 'info', icon: ic = 'info', title = '', text = '', action = null }) {
  return h(
    'div',
    { class: `alert ${tone}`, role: tone === 'warn' || tone === 'danger' ? 'alert' : null },
    h('span', { class: 'alert-icon' }, icon(ic, 17)),
    h('div', { class: 'alert-body' }, title ? h('strong', {}, title) : null, text ? h('p', {}, text) : null, action),
  );
}

export function emptyState({ icon: ic = 'calendar', title, text = '', action = null }) {
  return h('div', { class: 'empty' }, h('span', { class: 'empty-icon' }, icon(ic, 30)), h('h3', {}, title), text ? h('p', {}, text) : null, action);
}

export function statTile({ label, value, sub = '', tone = '', onClick = null, icon: ic = null }) {
  const tag = onClick ? 'button' : 'div';
  return h(
    tag,
    { class: `stat ${tone}`.trim(), type: onClick ? 'button' : null, onclick: onClick },
    h('span', { class: 'stat-label' }, ic ? icon(ic, 14) : null, label),
    h('span', { class: 'stat-value' }, value),
    sub ? h('span', { class: 'stat-sub' }, sub) : null,
  );
}

export function dateTimeInput({ value, onChange, min, max, label }) {
  const input = h('input', { class: 'input dt', type: 'datetime-local', value, min, max, 'aria-label': label });
  input.addEventListener('change', () => onChange && onChange(input.value));
  return input;
}

export function dateInput({ value, onChange, min, max, label }) {
  const input = h('input', { class: 'input dt', type: 'date', value, min, max, 'aria-label': label });
  input.addEventListener('change', () => onChange && onChange(input.value));
  return input;
}

export function timeInput({ value, onChange, label }) {
  const input = h('input', { class: 'input dt', type: 'time', value, 'aria-label': label });
  input.addEventListener('change', () => onChange && onChange(input.value));
  return input;
}

export function textArea({ value = '', placeholder = '', onInput, rows = 3, maxLength = 4000, label, tall = false }) {
  const ta = h('textarea', { class: `input textarea${tall ? ' tall' : ''}`, rows, placeholder, maxlength: maxLength, 'aria-label': label });
  ta.value = value;
  ta.addEventListener('input', () => onInput && onInput(ta.value));
  return ta;
}

export function textInput({ value = '', placeholder = '', onInput, maxLength = 120, label, type = 'text', inputMode = null, autocomplete = 'off' }) {
  const input = h('input', {
    class: 'input', type, value, placeholder, maxlength: maxLength, 'aria-label': label, autocomplete, inputmode: inputMode, autocapitalize: type === 'email' ? 'off' : 'sentences',
  });
  input.addEventListener('input', () => onInput && onInput(input.value));
  return input;
}

/** Selettore mese/anno (YYYY-MM) basato su due menu: funziona ovunque, anche dove manca <input type=month>. */
export function monthInput({ value = '', onChange, label = '', allowEmpty = false, minYear = 1950, maxYear = new Date().getFullYear() }) {
  const MONTHS = Array.from({ length: 12 }, (_, i) => capitalize(fmt(new Date(2000, i, 1), { month: 'long' })));
  const [y0, m0] = value ? value.split('-') : ['', ''];
  const month = h('select', { class: 'input select', 'aria-label': t('{label} – mese', { label }) }, allowEmpty ? h('option', { value: '' }, '—') : null, MONTHS.map((m, i) => h('option', { value: String(i + 1).padStart(2, '0') }, m)));
  const years = [];
  for (let y = maxYear; y >= minYear; y -= 1) years.push(String(y));
  const year = h('select', { class: 'input select', 'aria-label': t('{label} – anno', { label }) }, allowEmpty ? h('option', { value: '' }, '—') : null, years.map((y) => h('option', { value: y }, y)));
  month.value = m0 || (allowEmpty ? '' : '01');
  year.value = y0 || (allowEmpty ? '' : String(maxYear));
  const emit = () => {
    if (!onChange) return;
    if (!month.value || !year.value) onChange(null);
    else onChange(`${year.value}-${month.value}`);
  };
  month.addEventListener('change', emit);
  year.addEventListener('change', emit);
  return h('div', { class: 'two-col' }, month, year);
}

export function hbars(items, { color = 'var(--primary)', format = (v) => String(v), max = null, empty = t('Nessun dato') } = {}) {
  if (!items.length) return h('p', { class: 'muted small' }, empty);
  const top = max != null ? max : Math.max(...items.map((i) => i.value), 1);
  return h('div', { class: 'hbars' }, items.map((i) => h(
    'div',
    { class: 'hbar' },
    h('span', { class: 'hbar-label' }, typeof i.label === 'string' ? tv(i.label) : i.label),
    h('span', { class: 'hbar-track' }, h('span', { class: 'hbar-fill', style: { width: `${Math.max(2, (i.value / top) * 100)}%`, background: i.color || color } })),
    h('span', { class: 'hbar-val' }, i.text != null ? i.text : format(i.value)),
  )));
}

export function intensityPicker({ value = null, onChange }) {
  let cur = value;
  const desc = h('div', { class: 'int-desc', 'aria-live': 'polite' });
  const btns = INTENSITY_COLORS.map((c, i) => h('button', {
    type: 'button',
    class: `int-btn${i >= 6 ? ' hi' : ''}`,
    style: { '--c': c },
    'aria-label': t('Intensità {n}: {etichetta}', { n: i + 1, etichetta: INTENSITY_LABELS[i] }),
    'aria-pressed': 'false',
  }, String(i + 1)));
  const paint = () => {
    btns.forEach((b, i) => {
      b.classList.toggle('on', cur === i + 1);
      b.setAttribute('aria-pressed', String(cur === i + 1));
    });
    replaceChildren(desc, cur ? [`${cur} · ${INTENSITY_LABELS[cur - 1]} `, intensityBand(cur).toLowerCase() !== INTENSITY_LABELS[cur - 1].toLowerCase() ? h('small', {}, `(${intensityBand(cur).toLowerCase()})`) : null] : h('small', {}, t('Tocca un numero: 1 = appena percepibile, 10 = il peggiore mai provato')));
  };
  btns.forEach((b, i) => b.addEventListener('click', () => {
    cur = i + 1;
    paint();
    if (onChange) onChange(cur);
  }));
  paint();
  return h('div', { class: 'int-wrap' }, h('div', { class: 'intensity', role: 'group', 'aria-label': t('Intensità del dolore da 1 a 10') }, btns), desc);
}

export function accordion({ title, count = 0, open = false, children = [] }) {
  const badge = h('span', { class: 'acc-badge' });
  const setCount = (n) => {
    badge.textContent = n ? String(n) : '';
    badge.hidden = !n;
  };
  setCount(count);
  const el = h(
    'details',
    { class: 'acc', open },
    h('summary', { class: 'acc-sum' }, h('span', { class: 'acc-title' }, title), badge, icon('chevron-down', 18, 'acc-chev')),
    h('div', { class: 'acc-body' }, ...children),
  );
  el.setCount = setCount;
  return el;
}
