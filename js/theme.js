import * as store from './store.js';

const query = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null);

export function applyTheme() {
  const pref = store.getSettings().theme;
  const mq = query();
  const dark = pref === 'dark' || (pref === 'auto' && !!mq && mq.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#000000' : '#f2f2f7');
  try {
    localStorage.setItem(store.THEME_KEY, pref);
  } catch (e) { /* ignorato */ }
}

export function watchSystemTheme() {
  const mq = query();
  if (mq && mq.addEventListener) {
    mq.addEventListener('change', () => {
      if (store.getSettings().theme === 'auto') applyTheme();
    });
  }
}
