import { replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import { LANGS, lang, setLang, t } from '../i18n.js';
import * as store from '../store.js';
import {
  openPage, group, row, footnote,
} from '../ui.js';

export const languageName = (code = lang) => (LANGS.find((l) => l.code === code) || LANGS[0]).name;

/** Salva la lingua e ricarica l'app (i dati non vengono toccati). */
export function changeLanguage(code) {
  if (code === lang || !setLang(code)) return false;
  store.flush();
  location.reload();
  return true;
}

export function openLanguagePage() {
  const page = openPage({ title: t('Lingua'), className: 'lang-page' });
  replaceChildren(
    page.body,
    group(...LANGS.map((l) => {
      const r = row({ title: l.name, right: l.code === lang ? icon('check', 20) : null, onClick: () => changeLanguage(l.code) });
      if (l.code === lang) r.setAttribute('aria-current', 'true');
      return r;
    })),
    footnote(t('L’app si riavvia per cambiare lingua. I tuoi dati non vengono toccati.')),
  );
  return page;
}

/** Riga "Lingua" per Impostazioni e schermata di benvenuto. */
export const languageRow = () => row({
  icon: 'globe', tone: 'blue', title: t('Lingua'), right: languageName(), chevron: true, onClick: () => openLanguagePage(),
});
