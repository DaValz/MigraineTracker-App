import { h, replaceChildren } from '../dom.js';
import * as store from '../store.js';
import {
  openSheet, openPage, toast, button, card, cardTitle, field, chipGroup, stepper, toggleRow, group, textArea, alertBox,
} from '../ui.js';
import {
  MOOD_FACES, SLEEP_QUALITY_LABELS, STRESS_LABELS, MOOD_LABELS,
} from '../data.js';
import { fmtDateLong, todayStr } from '../dates.js';
import { num } from '../format.js';
import { t } from '../i18n.js';
import { getIndex, dayStatus } from '../analysis.js';
import { episodeCard, describeCheckin } from './shared.js';
import { openEpisodeEditor } from './episode.js';

const LABELS = {
  stressLabels: STRESS_LABELS, sleepLabels: SLEEP_QUALITY_LABELS, moodLabels: MOOD_LABELS, faces: MOOD_FACES,
};

export function openCheckin(date, { onSaved } = {}) {
  const db = store.getDb();
  const idx = getIndex(db, store.getRev(), todayStr());
  const rec = { ...(db.days[date] || {}) };
  const hasEpisode = idx.migraineDays.has(date);
  const draft = {
    free: !!rec.free,
    sleepH: rec.sleepH ?? null,
    sleepQ: rec.sleepQ ?? null,
    stress: rec.stress ?? null,
    mood: rec.mood ?? null,
    water: rec.water ?? null,
    caffeine: rec.caffeine ?? null,
    alcohol: rec.alcohol ?? null,
    skippedMeal: !!rec.skippedMeal,
    exercise: !!rec.exercise,
    menses: !!rec.menses,
    note: rec.note || '',
  };
  const saveBtn = h('button', { type: 'button', class: 'bar-btn solid' }, t('Salva'));
  const page = openPage({ title: t('Giornata'), backLabel: t('Annulla'), right: saveBtn });

  const numChips = (labels, key) => chipGroup({
    options: labels.map((l, i) => ({ value: i + 1, label: l })),
    value: draft[key],
    onChange: (v) => { draft[key] = v; },
  });

  const parts = [h('p', { class: 'muted mb', style: { fontWeight: '600' } }, fmtDateLong(date))];
  if (!hasEpisode) {
    parts.push(group(toggleRow({
      icon: 'sun', tone: 'green', title: t('Nessuna emicrania in questa giornata'), checked: draft.free, onChange: (v) => { draft.free = v; },
    })));
  }
  parts.push(
    card(
      cardTitle(t('Sonno')),
      field({
        label: t('Ore dormite stanotte'),
        control: stepper({
          value: draft.sleepH, min: 0, max: 14, step: 0.5, start: 7, unit: t('ore'), label: t('ore di sonno'), format: (v) => num(v, 2), onChange: (v) => { draft.sleepH = v; },
        }),
      }),
      field({ label: t('Qualità del sonno'), control: numChips(SLEEP_QUALITY_LABELS, 'sleepQ') }),
    ),
    card(
      cardTitle(t('Stress e umore')),
      field({ label: t('Livello di stress'), control: numChips(STRESS_LABELS, 'stress') }),
      field({
        label: t('Umore'),
        control: chipGroup({
          options: MOOD_FACES.map((f, i) => ({ value: i + 1, label: `${f} ${MOOD_LABELS[i]}` })),
          value: draft.mood,
          onChange: (v) => { draft.mood = v; },
        }),
      }),
    ),
    card(
      cardTitle(t('Abitudini')),
      field({ label: t('Acqua (bicchieri)'), control: stepper({ value: draft.water, min: 0, max: 20, start: 1, label: t('bicchieri d’acqua'), onChange: (v) => { draft.water = v; } }) }),
      field({ label: t('Caffè (tazzine)'), control: stepper({ value: draft.caffeine, min: 0, max: 15, start: 1, label: t('tazzine di caffè'), onChange: (v) => { draft.caffeine = v; } }) }),
      field({ label: t('Alcolici (bicchieri)'), control: stepper({ value: draft.alcohol, min: 0, max: 15, start: 1, label: t('bicchieri di alcolici'), onChange: (v) => { draft.alcohol = v; } }) }),
    ),
    group(
      toggleRow({ icon: 'clock', tone: 'orange', title: t('Ho saltato un pasto'), checked: draft.skippedMeal, onChange: (v) => { draft.skippedMeal = v; } }),
      toggleRow({ icon: 'activity', tone: 'blue', title: t('Attività fisica'), checked: draft.exercise, onChange: (v) => { draft.exercise = v; } }),
      store.getSettings().cycle ? toggleRow({ icon: 'drop', tone: 'red', title: t('Mestruazioni'), checked: draft.menses, onChange: (v) => { draft.menses = v; } }) : null,
    ),
    card(cardTitle(t('Note della giornata')), textArea({ value: draft.note, placeholder: t('Qualcosa di importante da ricordare…'), label: t('Note della giornata'), onInput: (v) => { draft.note = v; } })),
  );
  replaceChildren(page.body, ...parts);

  saveBtn.addEventListener('click', () => {
    store.patchDay(date, { ...draft, free: hasEpisode ? false : draft.free, checkin: true });
    page.close();
    toast(t('Giornata salvata'));
    if (onSaved) onSaved();
  });
  return page;
}

export function openDaySheet(date) {
  const sheet = openSheet({ title: fmtDateLong(date), tall: false });
  const render = () => {
    const db = store.getDb();
    const today = todayStr();
    const idx = getIndex(db, store.getRev(), today);
    const status = dayStatus(idx, db, date);
    const eps = idx.byDay.get(date) || [];
    const isFuture = date > today;
    const nodes = [];

    if (status === 'migraine') {
      nodes.push(...eps.map((ep) => episodeCard(ep, { onClick: () => openEpisodeEditor({ id: ep.id }) })));
    } else if (status === 'free') {
      nodes.push(alertBox({ tone: 'good', icon: 'check-circle', title: t('Nessuna emicrania'), text: t('Hai segnato questa giornata come libera da mal di testa.') }));
    } else if (isFuture) {
      nodes.push(alertBox({ tone: 'info', icon: 'calendar', text: t('Questo giorno non è ancora arrivato.') }));
    } else if (status === 'assumed') {
      nodes.push(alertBox({ tone: 'info', icon: 'info', text: t('Nessun attacco registrato: il giorno conta come senza emicrania. Puoi confermarlo con il pulsante qui sotto.') }));
    } else {
      nodes.push(alertBox({ tone: 'info', icon: 'info', text: t('Nessuna registrazione per questo giorno.') }));
    }

    const actions = [];
    if (!isFuture) {
      actions.push(button({ label: status === 'migraine' ? t('Aggiungi un altro attacco') : t('Registra un attacco'), kind: 'primary', icon: 'plus', block: true, onClick: () => openEpisodeEditor({ date }) }));
      if (status !== 'migraine') {
        actions.push(button({
          label: status === 'free' ? t('Rimuovi conferma') : t('Conferma: nessuna emicrania'),
          kind: 'secondary',
          icon: status === 'free' ? 'x' : 'check',
          block: true,
          onClick: () => {
            store.setFree(date, status !== 'free');
            toast(status === 'free' ? t('Conferma rimossa') : t('Giornata senza emicrania registrata'));
          },
        }));
      }
      actions.push(button({
        label: db.days[date] && db.days[date].checkin ? t('Modifica dettagli della giornata') : t('Dettagli della giornata (sonno, stress…)'),
        kind: 'ghost',
        icon: 'edit',
        block: true,
        onClick: () => openCheckin(date),
      }));
    }
    if (actions.length) nodes.push(h('div', { class: 'today-actions mb' }, ...actions));

    const facts = describeCheckin(db.days[date], LABELS);
    const w = db.weather[date];
    if (w) {
      const parts = [t('Pressione {valore} hPa', { valore: Math.round(w.p) })];
      if (w.t != null) parts.push(`${Math.round(w.t)} °C`);
      if (w.h != null) parts.push(t('umidità {valore}%', { valore: Math.round(w.h) }));
      facts.push(parts.join(' · '));
    }
    if (facts.length || (db.days[date] && db.days[date].note)) {
      nodes.push(card(
        cardTitle(t('La giornata')),
        facts.length ? h('div', { class: 'chips' }, facts.map((f) => h('span', { class: 'pill' }, f))) : null,
        db.days[date] && db.days[date].note ? h('p', { class: 'muted', style: { marginTop: '10px', whiteSpace: 'pre-wrap' } }, db.days[date].note) : null,
      ));
    }
    replaceChildren(sheet.body, ...nodes);
  };
  render();
  const unsub = store.subscribe(render);
  sheet.onClosed(unsub);
  return sheet;
}
