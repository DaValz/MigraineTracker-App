import { t, tr } from './i18n.js';

export const APP_NAME = 'Diario Emicrania'; // i18n-ignore
export const APP_VERSION = '2.2.0';

/* I testi delle liste di stringhe (zone, sintomi, farmaci...) sono valori salvati nei dati: restano in italiano e si traducono
 * solo in visualizzazione con tv(); qui si segnano con tr() per l'estrazione. Le etichette degli oggetti con id/v usano t(). */

export const EPISODE_TYPES = [
  { id: 'senza_aura', label: t('Emicrania senza aura') },
  { id: 'con_aura', label: t('Emicrania con aura') },
  { id: 'tensiva', label: t('Cefalea tensiva') },
  { id: 'grappolo', label: t('Cefalea a grappolo') },
  { id: 'altro', label: t('Non so / altro') },
];

export const SIDES = [
  { id: 'sx', label: t('Sinistra') },
  { id: 'dx', label: t('Destra') },
  { id: 'bil', label: t('Entrambi i lati') },
  { id: 'alt', label: t('Alternante') },
];

export const PAIN_AREAS = [
  tr('Fronte'), tr('Tempie'), tr('Dietro un occhio'), tr('Occhi'), tr('Nuca'), tr('Sommità'),
  tr('Tutta la testa'), tr('Mandibola / viso'), tr('Collo'),
];

export const PAIN_QUALITY = [tr('Pulsante'), tr('Pressante / a cerchio'), tr('Trafittivo'), tr('Sordo'), tr('Bruciante')];

export const AURA_TYPES = [
  tr('Visiva (luci, zig-zag, macchie)'), tr('Sensitiva (formicolii)'), tr('Del linguaggio'), tr('Motoria'),
];

export const DEFAULT_SYMPTOMS = [
  tr('Nausea'), tr('Vomito'), tr('Sensibilità alla luce'), tr('Sensibilità ai rumori'), tr('Sensibilità agli odori'),
  tr('Vertigini'), tr('Stanchezza'), tr('Difficoltà di concentrazione'), tr('Irritabilità'), tr('Rigidità del collo'),
  tr('Occhio rosso o lacrimante'), tr('Naso chiuso o gocciolante'), tr('Sbadigli frequenti'), tr('Fame / voglie'),
  tr('Sete'), tr('Sudorazione'), tr('Vista offuscata'), tr('Brividi'),
];

export const DEFAULT_TRIGGERS = [
  tr('Stress'), tr('Ansia'), tr('Poco sonno'), tr('Troppo sonno'), tr('Pasto saltato'), tr('Disidratazione'), tr('Alcol'),
  tr('Caffeina'), tr('Astinenza da caffeina'), tr('Cioccolato'), tr('Formaggi stagionati'), tr('Cibi molto elaborati'),
  tr('Cambio del tempo'), tr('Caldo'), tr('Freddo'), tr('Luci intense / schermi'), tr('Rumori forti'), tr('Odori forti'),
  tr('Sforzo fisico'), tr('Viaggio'), tr('Cambio di routine'), tr('Tensione al collo / postura'), tr('Fumo'),
];

export const CYCLE_TRIGGERS = [tr('Ciclo mestruale')];

export const MED_CLASSES = [
  { id: 'triptan', label: t('Triptano'), group: 'specific' },
  { id: 'ergot', label: t('Ergotamina'), group: 'specific' },
  { id: 'opioid', label: t('Oppioide'), group: 'specific' },
  { id: 'combo', label: t('Associazione di analgesici'), group: 'specific' },
  { id: 'nsaid', label: t('Antinfiammatorio (FANS)'), group: 'simple' },
  { id: 'paracetamol', label: t('Paracetamolo'), group: 'simple' },
  { id: 'antiemetic', label: t('Antiemetico'), group: null },
  { id: 'other', label: t('Altro'), group: null },
];

/** Suggerimento con i nomi commerciali di un farmaco: i nomi non si traducono. */
const eg = (marche) => t('es. {marche}', { marche });

export const DEFAULT_MEDS = [
  { name: tr('Paracetamolo'), cls: 'paracetamol', hint: eg('Tachipirina') }, // i18n-ignore
  { name: tr('Ibuprofene'), cls: 'nsaid', hint: eg('Brufen, Nurofen') }, // i18n-ignore
  { name: tr('Naprossene'), cls: 'nsaid', hint: eg('Synflex, Naprosyn') }, // i18n-ignore
  { name: tr('Ketoprofene'), cls: 'nsaid', hint: eg('Oki') }, // i18n-ignore
  { name: tr('Diclofenac'), cls: 'nsaid', hint: eg('Voltaren') }, // i18n-ignore
  { name: tr('Nimesulide'), cls: 'nsaid', hint: eg('Aulin') }, // i18n-ignore
  { name: tr('Acido acetilsalicilico'), cls: 'nsaid', hint: eg('Aspirina') }, // i18n-ignore
  { name: tr('Sumatriptan'), cls: 'triptan', hint: eg('Imigran') }, // i18n-ignore
  { name: tr('Rizatriptan'), cls: 'triptan', hint: eg('Maxalt') }, // i18n-ignore
  { name: tr('Zolmitriptan'), cls: 'triptan', hint: eg('Zomig') }, // i18n-ignore
  { name: tr('Eletriptan'), cls: 'triptan', hint: eg('Relpax') }, // i18n-ignore
  { name: tr('Almotriptan'), cls: 'triptan', hint: eg('Almogran') }, // i18n-ignore
  { name: tr('Naratriptan'), cls: 'triptan', hint: eg('Naramig') }, // i18n-ignore
  { name: tr('Frovatriptan'), cls: 'triptan', hint: '' },
  { name: tr('Paracetamolo + codeina'), cls: 'opioid', hint: eg('Tachidol, Co-Efferalgan') }, // i18n-ignore
  { name: tr('Ergotamina + caffeina'), cls: 'ergot', hint: '' },
  { name: tr('Metoclopramide'), cls: 'antiemetic', hint: eg('Plasil') }, // i18n-ignore
  { name: tr('Domperidone'), cls: 'antiemetic', hint: eg('Peridon') }, // i18n-ignore
];

export const MED_EFFECTS = [
  { v: 0, label: t('Nessuno') },
  { v: 1, label: t('Parziale') },
  { v: 2, label: t('Buono') },
  { v: 3, label: t('Risolutivo') },
];

export const IMPACT_LEVELS = [
  { v: 0, label: t('Nessuno'), desc: t('Attività normali') },
  { v: 1, label: t('Lieve'), desc: t('Faccio le cose con fatica') },
  { v: 2, label: t('Forte'), desc: t('Ho ridotto o interrotto le attività') },
  { v: 3, label: t('Totale'), desc: t('A letto, non riesco a fare nulla') },
];

export const WORK_LEVELS = [
  { v: 0, label: t('Nessun problema') },
  { v: 1, label: t('Rendimento ridotto') },
  { v: 2, label: t('Giornata persa') },
];

export const INTENSITY_LABELS = [
  t('Appena percepibile'), t('Lieve'), t('Fastidioso'), t('Moderato'), t('Disturba le attività'),
  t('Doloroso'), t('Forte'), t('Molto forte'), t('Insopportabile'), t('Il peggiore mai provato'),
];

export const INTENSITY_COLORS = [
  '#7ed6a6', '#a7db8b', '#d4de7a', '#f2d25e', '#f5b84f',
  '#f29a45', '#ee7a3e', '#e5573f', '#cf3a4c', '#a8245f',
];

export const intensityColor = (i) => INTENSITY_COLORS[Math.min(10, Math.max(1, Math.round(i))) - 1];
export const intensityBand = (i) => (i <= 3 ? t('Lieve') : i <= 6 ? t('Moderata') : i <= 8 ? t('Forte') : t('Molto forte'));

export const MOOD_FACES = ['😞', '😕', '😐', '🙂', '😄'];
export const SLEEP_QUALITY_LABELS = [t('Pessimo'), t('Scarso'), t('Discreto'), t('Buono'), t('Ottimo')];
export const STRESS_LABELS = [t('Nullo'), t('Basso'), t('Medio'), t('Alto'), t('Altissimo')];
export const MOOD_LABELS = [t('Pessimo'), t('Basso'), t('Così così'), t('Buono'), t('Ottimo')];

export const LIST_KINDS = {
  triggers: {
    title: t('Fattori scatenanti'), singular: t('fattore'), newTitle: t('Nuovo fattore'), addTitle: t('Aggiungi fattore'), defaults: () => DEFAULT_TRIGGERS,
  },
  symptoms: {
    title: t('Sintomi associati'), singular: t('sintomo'), newTitle: t('Nuovo sintomo'), addTitle: t('Aggiungi sintomo'), defaults: () => DEFAULT_SYMPTOMS,
  },
  meds: {
    title: t('Farmaci'), singular: t('farmaco'), newTitle: t('Nuovo farmaco'), addTitle: t('Aggiungi farmaco'), defaults: () => DEFAULT_MEDS,
  },
};

export const medClassLabel = (id) => (MED_CLASSES.find((c) => c.id === id) || MED_CLASSES[MED_CLASSES.length - 1]).label;
export const medClassGroup = (id) => (MED_CLASSES.find((c) => c.id === id) || {}).group || null;
export const isAcuteClass = (id) => medClassGroup(id) !== null;

export const typeLabel = (id) => (EPISODE_TYPES.find((x) => x.id === id) || {}).label || '';
export const sideLabel = (id) => (SIDES.find((x) => x.id === id) || {}).label || '';
export const effectLabel = (v) => (MED_EFFECTS.find((e) => e.v === v) || {}).label || t('Da valutare');

/* ---------- v2: orario non ricordato, terapie, cartella clinica ---------- */

export const APPROX_DURATIONS = [
  { id: 'lt4', label: t('Meno di 4 ore') },
  { id: '4to12', label: t('4–12 ore') },
  { id: '12to24', label: t('12–24 ore') },
  { id: 'days', label: t('Più giorni') },
];
export const approxDurLabel = (id) => (APPROX_DURATIONS.find((d) => d.id === id) || {}).label || '';

export const TX_VS = [
  { id: 'better', label: t('Più leggero') },
  { id: 'same', label: t('Come prima') },
  { id: 'worse', label: t('Più forte') },
];

export const THERAPY_CLASSES = [
  { id: 'mab', label: t('Anticorpo monoclonale anti-CGRP'), short: t('Anti-CGRP'), inject: true, every: 28, color: '#5856d6' },
  { id: 'botox', label: t('Tossina botulinica'), short: t('Tossina botulinica'), inject: true, every: 84, color: '#30b0c7' },
  { id: 'gepant', label: t('Gepante'), short: t('Gepante'), color: '#af52de' },
  { id: 'tca', label: t('Antidepressivo triciclico'), short: t('Antidepressivo'), color: '#ff9500' },
  { id: 'snri', label: t('Antidepressivo SNRI'), short: t('Antidepressivo'), color: '#ff9f0a' },
  { id: 'betablocker', label: t('Beta-bloccante'), short: t('Beta-bloccante'), color: '#ff2d55' },
  { id: 'antiepileptic', label: t('Antiepilettico'), short: t('Antiepilettico'), color: '#34c759' },
  { id: 'ccb', label: t('Calcio-antagonista'), short: t('Calcio-antagonista'), color: '#a2845e' },
  { id: 'arb', label: t('Sartano o ACE-inibitore'), short: t('Sartano'), color: '#007aff' },
  { id: 'supplement', label: t('Integratore'), short: t('Integratore'), color: '#00c7be' },
  { id: 'other', label: t('Altro'), short: t('Altro'), color: '#8e8e93' },
];
export const therapyClass = (id) => THERAPY_CLASSES.find((c) => c.id === id) || THERAPY_CLASSES[THERAPY_CLASSES.length - 1];

/* `brands` (facoltativo): l'`hint` in italiano, usato da guessTherapyClass al posto di `hint` (che e' tradotto) per riconoscere la classe. */
export const THERAPY_PRESETS = [
  { name: tr('Erenumab'), hint: 'Aimovig', cls: 'mab', every: 28 }, // i18n-ignore
  { name: tr('Fremanezumab'), hint: 'Ajovy', cls: 'mab', every: 28 }, // i18n-ignore
  { name: tr('Galcanezumab'), hint: 'Emgality', cls: 'mab', every: 28 }, // i18n-ignore
  { name: tr('Eptinezumab'), hint: t('Vyepti, in vena'), brands: 'Vyepti, in vena', cls: 'mab', every: 84 }, // i18n-ignore
  { name: tr('Tossina botulinica'), hint: t('Botox, protocollo PREEMPT'), brands: 'Botox, protocollo PREEMPT', cls: 'botox', every: 84 }, // i18n-ignore
  { name: tr('Amitriptilina'), hint: 'Laroxyl', cls: 'tca' }, // i18n-ignore
  { name: tr('Nortriptilina'), hint: 'Noritren', cls: 'tca' }, // i18n-ignore
  { name: tr('Venlafaxina'), hint: 'Efexor', cls: 'snri' }, // i18n-ignore
  { name: tr('Duloxetina'), hint: 'Cymbalta, Xeristar', cls: 'snri' }, // i18n-ignore
  { name: tr('Atogepant'), hint: 'Aquipta', cls: 'gepant' }, // i18n-ignore
  { name: tr('Rimegepant'), hint: 'Vydura', cls: 'gepant' }, // i18n-ignore
  { name: tr('Propranololo'), hint: 'Inderal', cls: 'betablocker' }, // i18n-ignore
  { name: tr('Metoprololo'), hint: 'Lopresor, Seloken', cls: 'betablocker' }, // i18n-ignore
  { name: tr('Topiramato'), hint: 'Topamax', cls: 'antiepileptic' }, // i18n-ignore
  { name: tr('Acido valproico'), hint: 'Depakin', cls: 'antiepileptic' }, // i18n-ignore
  { name: tr('Flunarizina'), hint: 'Sibelium', cls: 'ccb' }, // i18n-ignore
  { name: tr('Candesartan'), hint: 'Ratacand', cls: 'arb' }, // i18n-ignore
  { name: tr('Lisinopril'), hint: 'Zestril', cls: 'arb' }, // i18n-ignore
  { name: tr('Magnesio'), hint: '', cls: 'supplement' },
  { name: tr('Riboflavina (B2)'), hint: '', cls: 'supplement' },
  { name: tr('Coenzima Q10'), hint: '', cls: 'supplement' },
  { name: tr('Melatonina'), hint: '', cls: 'supplement' },
];

export const STOP_REASONS = [
  { id: 'inefficace', label: t('Non funzionava') },
  { id: 'effetti', label: t('Effetti collaterali') },
  { id: 'completata', label: t('Ciclo concluso o pausa') },
  { id: 'migliorato', label: t('Sto meglio') },
  { id: 'altro', label: t('Altro motivo') },
];
export const stopReasonLabel = (id) => (STOP_REASONS.find((r) => r.id === id) || {}).label || '';

export const SIDE_EFFECTS = [
  tr('Sonnolenza'), tr('Stanchezza'), tr('Aumento di peso'), tr('Perdita di peso'), tr('Formicolii'), tr('Memoria o concentrazione'),
  tr('Stipsi'), tr('Nausea'), tr('Bocca secca'), tr('Vertigini'), tr('Pressione bassa'), tr('Umore giù'), tr('Insonnia'),
  tr('Reazione nel punto di iniezione'), tr('Dolore a collo o spalle'), tr('Palpebra cadente'), tr('Perdita di capelli'),
];

export const THERAPY_RATINGS = [
  { v: 0, label: t('Nessun beneficio') },
  { v: 1, label: t('Poco') },
  { v: 2, label: t('Buono') },
  { v: 3, label: t('Ottimo') },
];

export const DIAGNOSES = [
  tr('Emicrania senza aura'), tr('Emicrania con aura'), tr('Emicrania cronica'), tr('Emicrania mestruale'),
  tr('Cefalea da uso eccessivo di farmaci'), tr('Cefalea di tipo tensivo'), tr('Cefalea a grappolo'), tr('Emicrania vestibolare'),
];

export const SEXES = [
  { id: 'f', label: t('Donna') },
  { id: 'm', label: t('Uomo') },
  { id: 'x', label: t('Preferisco non dirlo') },
];

export const YES_NO_UNKNOWN = [
  { id: 'yes', label: t('Sì') },
  { id: 'no', label: t('No') },
  { id: 'unknown', label: t('Non so') },
];

export const FAMILY_MEMBERS = [tr('Madre'), tr('Padre'), tr('Sorella o fratello'), tr('Nonni'), tr('Figli'), tr('Altri parenti')];

export const TYPICAL_DURATIONS = [
  { id: 'lt4', label: t('Meno di 4 ore') },
  { id: '4to24', label: t('4–24 ore') },
  { id: '24to72', label: t('1–3 giorni') },
  { id: 'gt72', label: t('Più di 3 giorni') },
];

export const AURA_FREQ = [
  { id: 'never', label: t('Mai') },
  { id: 'sometimes', label: t('A volte') },
  { id: 'always', label: t('Quasi sempre') },
];

export const CYCLE_LINK = [
  { id: 'yes', label: t('Sì, spesso') },
  { id: 'sometimes', label: t('A volte') },
  { id: 'no', label: t('No') },
  { id: 'na', label: t('Non applicabile') },
];

export const CONDITIONS = [
  tr('Ansia'), tr('Depressione'), tr('Insonnia'), tr('Ipertensione'), tr('Pressione bassa'), tr('Allergie'), tr('Asma'), tr('Gastrite o reflusso'),
  tr('Colon irritabile'), tr('Tiroide'), tr('Fibromialgia'), tr('Bruxismo o mandibola'), tr('Cervicalgia'), tr('Sovrappeso'),
  tr('Problemi cardiovascolari'), tr('Endometriosi'),
];

export const CONTACT_ROLES = [
  { id: 'center', label: t('Centro cefalee'), icon: 'hospital' },
  { id: 'neuro', label: t('Neurologo'), icon: 'stethoscope' },
  { id: 'gp', label: t('Medico di base'), icon: 'user' },
  { id: 'hospital', label: t('Ospedale o reparto'), icon: 'hospital' },
  { id: 'pharmacy', label: t('Farmacia'), icon: 'pill' },
  { id: 'other', label: t('Altro'), icon: 'user' },
];
export const contactRole = (id) => CONTACT_ROLES.find((r) => r.id === id) || CONTACT_ROLES[CONTACT_ROLES.length - 1];

export const VISIT_KINDS = [
  { id: 'visit', label: t('Visita neurologica') },
  { id: 'followup', label: t('Controllo') },
  { id: 'botox', label: t('Seduta di tossina botulinica') },
  { id: 'infusion', label: t('Infusione o iniezione') },
  { id: 'exam', label: t('Esame (RM, TAC, EEG…)') },
  { id: 'lab', label: t('Esami del sangue') },
  { id: 'pickup', label: t('Ritiro del farmaco') },
  { id: 'other', label: t('Altro') },
];
export const visitKindLabel = (id) => (VISIT_KINDS.find((k) => k.id === id) || VISIT_KINDS[VISIT_KINDS.length - 1]).label;

export const DOC_CATEGORIES = [
  { id: 'visit', label: t('Visite e referti'), icon: 'stethoscope', tone: 'blue' },
  { id: 'imaging', label: t('Risonanze e TAC'), icon: 'scan', tone: 'indigo' },
  { id: 'exam', label: t('Altri esami'), icon: 'activity', tone: 'teal' },
  { id: 'lab', label: t('Esami del sangue'), icon: 'drop', tone: 'red' },
  { id: 'therapy', label: t('Piani terapeutici e ricette'), icon: 'pill', tone: 'green' },
  { id: 'discharge', label: t('Dimissioni e pronto soccorso'), icon: 'hospital', tone: 'orange' },
  { id: 'cert', label: t('Certificati'), icon: 'shield', tone: 'purple' },
  { id: 'other', label: t('Altro'), icon: 'folder', tone: 'gray' },
];
export const docCategory = (id) => DOC_CATEGORIES.find((c) => c.id === id) || DOC_CATEGORIES[DOC_CATEGORIES.length - 1];

export const MIDAS_QUESTIONS = [
  t('In quanti giorni non sei andato al lavoro o a scuola per il mal di testa?'),
  t('In quanti giorni il tuo rendimento al lavoro o a scuola si è almeno dimezzato? (senza contare i giorni della domanda 1)'),
  t('In quanti giorni non hai fatto i lavori di casa?'),
  t('In quanti giorni il rendimento nei lavori di casa si è almeno dimezzato? (senza contare i giorni della domanda 3)'),
  t('In quanti giorni hai rinunciato ad attività familiari, sociali o di svago?'),
];
export const MIDAS_GRADES = [
  { min: 0, max: 5, grade: 'I', label: t('Disabilità minima o assente'), tone: 'green' },
  { min: 6, max: 10, grade: 'II', label: t('Disabilità lieve'), tone: 'teal' },
  { min: 11, max: 20, grade: 'III', label: t('Disabilità moderata'), tone: 'orange' },
  { min: 21, max: 9999, grade: 'IV', label: t('Disabilità grave'), tone: 'red' },
];
export const midasGrade = (score) => MIDAS_GRADES.find((g) => score >= g.min && score <= g.max) || MIDAS_GRADES[0];

export function defaultSettings() {
  return {
    theme: 'auto',
    name: '',
    cycle: false,
    diaryStart: null,
    weatherOn: false,
    weatherLoc: null,
    assumeFree: true,
    pin: null,
    lockAfter: 0,
    hidden: { triggers: [], symptoms: [], meds: [] },
    custom: { triggers: [], symptoms: [], meds: [] },
    lastBackupAt: null,
    backupRemindDays: 30,
    welcomeDone: false,
    installHintDismissed: false,
    reminderTime: '21:00',
  };
}
