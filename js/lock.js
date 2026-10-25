import { h } from './dom.js';
import { icon } from './icons.js';
import * as store from './store.js';
import { toast, overlayCount } from './ui.js';

const enc = new TextEncoder();
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const ITERATIONS = 150000;

export const pinSupported = () => !!(window.crypto && window.crypto.subtle);

async function derive(pin, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
}

export async function makePinRecord(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(pin, salt, ITERATIONS);
  return {
    salt: toB64(salt), hash: toB64(bits), iter: ITERATIONS, len: pin.length,
  };
}

export async function checkPin(pin, rec) {
  const bits = new Uint8Array(await derive(pin, fromB64(rec.salt), rec.iter));
  const expected = fromB64(rec.hash);
  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i += 1) diff |= bits[i] ^ expected[i];
  return diff === 0;
}

let inertDepth = 0;
function setInert(on) {
  inertDepth += on ? 1 : -1;
  const app = document.getElementById('app');
  const ov = document.getElementById('overlays');
  const locked = inertDepth > 0;
  if (app) app.inert = locked || overlayCount() > 0;
  if (ov) ov.inert = locked;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

/** Conferma mostrata dentro lo schermo di blocco (il resto dell'app ? inerte e coperto). */
function confirmInLock(host, { title, message, confirmLabel }) {
  return new Promise((resolve) => {
    const done = (v) => {
      wrap.remove();
      resolve(v);
    };
    const wrap = h(
      'div',
      { class: 'dialog-wrap open' },
      h('div', { class: 'backdrop', onclick: () => done(false) }),
      h(
        'div',
        { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', { class: 'dlg-title' }, title),
        h('p', { class: 'dlg-msg' }, message),
        h('div', { class: 'dlg-actions' },
          h('button', { type: 'button', class: 'dlg-btn', onclick: () => done(false) }, 'Annulla'),
          h('button', { type: 'button', class: 'dlg-btn danger', onclick: () => done(true) }, confirmLabel)),
      ),
    );
    host.appendChild(wrap);
  });
}

export function askPin({
  title, subtitle = '', len = 4, verify = null, cancelable = true, forgot = null,
}) {
  return new Promise((resolve) => {
    let value = '';
    let busy = false;
    let fails = 0;
    let blockedUntil = 0;
    let countdown = null;
    let finished = false;
    const dots = h('div', { class: 'pin-dots', 'aria-hidden': 'true' }, Array.from({ length: len }, () => h('i')));
    const msg = h('div', { class: 'sub', 'aria-live': 'polite' }, subtitle);
    const paint = () => Array.from(dots.children).forEach((d, i) => d.classList.toggle('on', i < value.length));

    const finish = (result) => {
      if (finished) return;
      finished = true;
      document.removeEventListener('keydown', onKey);
      clearInterval(countdown);
      el.remove();
      setInert(false);
      resolve(result);
    };

    const submit = async () => {
      busy = true;
      const pin = value;
      let ok = true;
      if (verify) {
        try {
          ok = await verify(pin);
        } catch (e) {
          ok = false;
        }
      }
      busy = false;
      if (finished) return;
      if (ok) {
        finish(pin);
        return;
      }
      fails += 1;
      value = '';
      dots.classList.remove('shake');
      void dots.offsetWidth;
      dots.classList.add('shake');
      paint();
      if (fails % 5 === 0) {
        blockedUntil = Date.now() + 30000 * (fails / 5);
        const tick = () => {
          const left = Math.ceil((blockedUntil - Date.now()) / 1000);
          if (left <= 0) {
            clearInterval(countdown);
            msg.textContent = subtitle;
          } else {
            msg.textContent = `Troppi tentativi. Riprova tra ${left} s`;
          }
        };
        tick();
        countdown = setInterval(tick, 500);
      } else {
        msg.textContent = 'PIN errato, riprova';
      }
    };

    const press = (k) => {
      if (busy || Date.now() < blockedUntil) return;
      if (k === 'del') {
        value = value.slice(0, -1);
      } else if (/^\d$/.test(k) && value.length < len) {
        value += k;
      }
      paint();
      if (value.length === len) submit();
    };

    function onKey(e) {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Escape' && cancelable) finish(null);
    }

    const pad = h('div', { class: 'pin-pad' }, KEYS.map((k) => {
      if (k === '') return h('span', { class: 'pin-key blank' });
      return h('button', {
        type: 'button', class: 'pin-key', 'aria-label': k === 'del' ? 'Cancella' : k, onclick: () => press(k),
      }, k === 'del' ? icon('backspace', 26) : k);
    }));
    const links = [];
    if (cancelable) links.push(h('button', { type: 'button', class: 'pin-link', onclick: () => finish(null) }, 'Annulla'));
    if (forgot) {
      links.push(h('button', {
        type: 'button',
        class: 'pin-link',
        onclick: async () => {
          if (await forgot(el)) finish(null);
        },
      }, 'PIN dimenticato?'));
    }
    const el = h('div', { class: 'lock', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, icon('lock', 34), h('h1', {}, title), msg, dots, pad, h('div', { class: 'flex', style: { gap: '24px' } }, links));
    document.body.appendChild(el);
    setInert(true);
    document.addEventListener('keydown', onKey);
  });
}

let locked = false;
let hiddenAt = 0;
let cover = null;

export async function lockNow() {
  const rec = store.getSettings().pin;
  if (!rec || locked) return;
  locked = true;
  await askPin({
    title: 'Diario Emicrania',
    subtitle: 'Inserisci il PIN',
    len: rec.len || 4,
    cancelable: false,
    verify: (p) => checkPin(p, rec),
    forgot: async (host) => {
      const ok = await confirmInLock(host, {
        title: 'Cancellare tutti i dati?',
        message: 'Per reimpostare il PIN l’app deve cancellare tutti i dati salvati su questo telefono. Potrai ripristinarli solo da un backup.',
        confirmLabel: 'Cancella tutto',
      });
      if (!ok) return false;
      store.wipeAll();
      toast('Dati cancellati. L’app è di nuovo vuota.');
      return true;
    },
  });
  locked = false;
}

function showCover() {
  if (cover) return;
  cover = h('div', { class: 'lock', 'aria-hidden': 'true', style: { zIndex: '900' } }, icon('lock', 40));
  document.body.appendChild(cover);
}

function hideCover() {
  if (cover) cover.remove();
  cover = null;
}

export function initLock() {
  if (store.getSettings().pin) lockNow();
  document.addEventListener('visibilitychange', () => {
    const rec = store.getSettings().pin;
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      if (rec) showCover();
      return;
    }
    hideCover();
    if (rec && !locked && (Date.now() - hiddenAt) / 1000 >= (store.getSettings().lockAfter || 0)) lockNow();
  });
}

export async function setupPin(len = 4) {
  if (!pinSupported()) {
    toast('Questo browser non supporta il blocco con PIN.', { tone: 'error' });
    return false;
  }
  const first = await askPin({ title: 'Scegli un PIN', subtitle: `${len} cifre`, len });
  if (!first) return false;
  const second = await askPin({ title: 'Conferma il PIN', subtitle: 'Reinseriscilo', len });
  if (!second) return false;
  if (first !== second) {
    toast('I due PIN non coincidono. Riprova.', { tone: 'error' });
    return false;
  }
  store.updateSettings({ pin: await makePinRecord(first) });
  return true;
}

export async function removePin() {
  const rec = store.getSettings().pin;
  if (!rec) return true;
  const entered = await askPin({
    title: 'Disattiva il blocco', subtitle: 'Inserisci il PIN attuale', len: rec.len || 4, verify: (p) => checkPin(p, rec),
  });
  if (!entered) return false;
  store.updateSettings({ pin: null });
  return true;
}
