export const APP_NAME = 'Diario Emicrania';
export const APP_VERSION = '2.0.0';

export const EPISODE_TYPES = [
  { id: 'senza_aura', label: 'Emicrania senza aura' },
  { id: 'con_aura', label: 'Emicrania con aura' },
  { id: 'tensiva', label: 'Cefalea tensiva' },
  { id: 'grappolo', label: 'Cefalea a grappolo' },
  { id: 'altro', label: 'Non so / altro' },
];

export const SIDES = [
  { id: 'sx', label: 'Sinistra' },
  { id: 'dx', label: 'Destra' },
  { id: 'bil', label: 'Entrambi i lati' },
  { id: 'alt', label: 'Alternante' },
];

export const PAIN_AREAS = [
  'Fronte', 'Tempie', 'Dietro un occhio', 'Occhi', 'Nuca', 'Sommità',
  'Tutta la testa', 'Mandibola / viso', 'Collo',
];

export const PAIN_QUALITY = ['Pulsante', 'Pressante / a cerchio', 'Trafittivo', 'Sordo', 'Bruciante'];

export const AURA_TYPES = [
  'Visiva (luci, zig-zag, macchie)', 'Sensitiva (formicolii)', 'Del linguaggio', 'Motoria',
];

export const DEFAULT_SYMPTOMS = [
  'Nausea', 'Vomito', 'Sensibilità alla luce', 'Sensibilità ai rumori', 'Sensibilità agli odori',
  'Vertigini', 'Stanchezza', 'Difficoltà di concentrazione', 'Irritabilità', 'Rigidità del collo',
  'Occhio rosso o lacrimante', 'Naso chiuso o gocciolante', 'Sbadigli frequenti', 'Fame / voglie',
  'Sete', 'Sudorazione', 'Vista offuscata', 'Brividi',
];

export const DEFAULT_TRIGGERS = [
  'Stress', 'Ansia', 'Poco sonno', 'Troppo sonno', 'Pasto saltato', 'Disidratazione', 'Alcol',
  'Caffeina', 'Astinenza da caffeina', 'Cioccolato', 'Formaggi stagionati', 'Cibi molto elaborati',
  'Cambio del tempo', 'Caldo', 'Freddo', 'Luci intense / schermi', 'Rumori forti', 'Odori forti',
  'Sforzo fisico', 'Viaggio', 'Cambio di routine', 'Tensione al collo / postura', 'Fumo',
];

export const CYCLE_TRIGGERS = ['Ciclo mestruale'];

export const MED_CLASSES = [
  { id: 'triptan', label: 'Triptano', group: 'specific' },
  { id: 'ergot', label: 'Ergotamina', group: 'specific' },
  { id: 'opioid', label: 'Oppioide', group: 'specific' },
  { id: 'combo', label: 'Associazione di analgesici', group: 'specific' },
  { id: 'nsaid', label: 'Antinfiammatorio (FANS)', group: 'simple' },
  { id: 'paracetamol', label: 'Paracetamolo', group: 'simple' },
  { id: 'antiemetic', label: 'Antiemetico', group: null },
  { id: 'other', label: 'Altro', group: null },
];

export const DEFAULT_MEDS = [
  { name: 'Paracetamolo', cls: 'paracetamol', hint: 'es. Tachipirina' },
  { name: 'Ibuprofene', cls: 'nsaid', hint: 'es. Brufen, Nurofen' },
  { name: 'Naprossene', cls: 'nsaid', hint: 'es. Synflex, Naprosyn' },
  { name: 'Ketoprofene', cls: 'nsaid', hint: 'es. Oki' },
  { name: 'Diclofenac', cls: 'nsaid', hint: 'es. Voltaren' },
  { name: 'Nimesulide', cls: 'nsaid', hint: 'es. Aulin' },
  { name: 'Acido acetilsalicilico', cls: 'nsaid', hint: 'es. Aspirina' },
  { name: 'Sumatriptan', cls: 'triptan', hint: 'es. Imigran' },
  { name: 'Rizatriptan', cls: 'triptan', hint: 'es. Maxalt' },
  { name: 'Zolmitriptan', cls: 'triptan', hint: 'es. Zomig' },
  { name: 'Eletriptan', cls: 'triptan', hint: 'es. Relpax' },
  { name: 'Almotriptan', cls: 'triptan', hint: 'es. Almogran' },
  { name: 'Naratriptan', cls: 'triptan', hint: 'es. Naramig' },
  { name: 'Frovatriptan', cls: 'triptan', hint: '' },
  { name: 'Paracetamolo + codeina', cls: 'opioid', hint: 'es. Tachidol, Co-Efferalgan' },
  { name: 'Ergotamina + caffeina', cls: 'ergot', hint: '' },
  { name: 'Metoclopramide', cls: 'antiemetic', hint: 'es. Plasil' },
  { name: 'Domperidone', cls: 'antiemetic', hint: 'es. Peridon' },
];

export const MED_EFFECTS = [
  { v: 0, label: 'Nessuno' },
  { v: 1, label: 'Parziale' },
  { v: 2, label: 'Buono' },
  { v: 3, label: 'Risolutivo' },
];

export const IMPACT_LEVELS = [
  { v: 0, label: 'Nessuno', desc: 'Attività normali' },
  { v: 1, label: 'Lieve', desc: 'Faccio le cose con fatica' },
  { v: 2, label: 'Forte', desc: 'Ho ridotto o interrotto le attività' },
  { v: 3, label: 'Totale', desc: 'A letto, non riesco a fare nulla' },
];

export const WORK_LEVELS = [
  { v: 0, label: 'Nessun problema' },
  { v: 1, label: 'Rendimento ridotto' },
  { v: 2, label: 'Giornata persa' },
];

export const INTENSITY_LABELS = [
  'Appena percepibile', 'Lieve', 'Fastidioso', 'Moderato', 'Disturba le attività',
  'Doloroso', 'Forte', 'Molto forte', 'Insopportabile', 'Il peggiore mai provato',
];

export const INTENSITY_COLORS = [
  '#7ed6a6', '#a7db8b', '#d4de7a', '#f2d25e', '#f5b84f',
  '#f29a45', '#ee7a3e', '#e5573f', '#cf3a4c', '#a8245f',
];

export const intensityColor = (i) => INTENSITY_COLORS[Math.min(10, Math.max(1, Math.round(i))) - 1];
export const intensityBand = (i) => (i <= 3 ? 'Lieve' : i <= 6 ? 'Moderata' : i <= 8 ? 'Forte' : 'Molto forte');

export const MOOD_FACES = ['😞', '😕', '😐', '🙂', '😄'];
export const SLEEP_QUALITY_LABELS = ['Pessimo', 'Scarso', 'Discreto', 'Buono', 'Ottimo'];
export const STRESS_LABELS = ['Nullo', 'Basso', 'Medio', 'Alto', 'Altissimo'];
export const MOOD_LABELS = ['Pessimo', 'Basso', 'Così così', 'Buono', 'Ottimo'];

export const LIST_KINDS = {
  triggers: { title: 'Fattori scatenanti', singular: 'fattore', defaults: () => DEFAULT_TRIGGERS },
  symptoms: { title: 'Sintomi associati', singular: 'sintomo', defaults: () => DEFAULT_SYMPTOMS },
  meds: { title: 'Farmaci', singular: 'farmaco', defaults: () => DEFAULT_MEDS },
};

export const medClassLabel = (id) => (MED_CLASSES.find((c) => c.id === id) || MED_CLASSES[MED_CLASSES.length - 1]).label;
export const medClassGroup = (id) => (MED_CLASSES.find((c) => c.id === id) || {}).group || null;
export const isAcuteClass = (id) => medClassGroup(id) !== null;

export const typeLabel = (id) => (EPISODE_TYPES.find((t) => t.id === id) || {}).label || '';
export const sideLabel = (id) => (SIDES.find((s) => s.id === id) || {}).label || '';
export const effectLabel = (v) => (MED_EFFECTS.find((e) => e.v === v) || {}).label || 'Da valutare';

/* ---------- v2: orario non ricordato, terapie, cartella clinica ---------- */

export const APPROX_DURATIONS = [
  { id: 'lt4', label: 'Meno di 4 ore' },
  { id: '4to12', label: '4–12 ore' },
  { id: '12to24', label: '12–24 ore' },
  { id: 'days', label: 'Più giorni' },
];
export const approxDurLabel = (id) => (APPROX_DURATIONS.find((d) => d.id === id) || {}).label || '';

export const TX_VS = [
  { id: 'better', label: 'Più leggero' },
  { id: 'same', label: 'Come prima' },
  { id: 'worse', label: 'Più forte' },
];

export const THERAPY_CLASSES = [
  { id: 'mab', label: 'Anticorpo monoclonale anti-CGRP', short: 'Anti-CGRP', inject: true, every: 28, color: '#5856d6' },
  { id: 'botox', label: 'Tossina botulinica', short: 'Tossina botulinica', inject: true, every: 84, color: '#30b0c7' },
  { id: 'gepant', label: 'Gepante', short: 'Gepante', color: '#af52de' },
  { id: 'tca', label: 'Antidepressivo triciclico', short: 'Antidepressivo', color: '#ff9500' },
  { id: 'snri', label: 'Antidepressivo SNRI', short: 'Antidepressivo', color: '#ff9f0a' },
  { id: 'betablocker', label: 'Beta-bloccante', short: 'Beta-bloccante', color: '#ff2d55' },
  { id: 'antiepileptic', label: 'Antiepilettico', short: 'Antiepilettico', color: '#34c759' },
  { id: 'ccb', label: 'Calcio-antagonista', short: 'Calcio-antagonista', color: '#a2845e' },
  { id: 'arb', label: 'Sartano o ACE-inibitore', short: 'Sartano', color: '#007aff' },
  { id: 'supplement', label: 'Integratore', short: 'Integratore', color: '#00c7be' },
  { id: 'other', label: 'Altro', short: 'Altro', color: '#8e8e93' },
];
export const therapyClass = (id) => THERAPY_CLASSES.find((c) => c.id === id) || THERAPY_CLASSES[THERAPY_CLASSES.length - 1];

export const THERAPY_PRESETS = [
  { name: 'Erenumab', hint: 'Aimovig', cls: 'mab', every: 28 },
  { name: 'Fremanezumab', hint: 'Ajovy', cls: 'mab', every: 28 },
  { name: 'Galcanezumab', hint: 'Emgality', cls: 'mab', every: 28 },
  { name: 'Eptinezumab', hint: 'Vyepti, in vena', cls: 'mab', every: 84 },
  { name: 'Tossina botulinica', hint: 'Botox, protocollo PREEMPT', cls: 'botox', every: 84 },
  { name: 'Amitriptilina', hint: 'Laroxyl', cls: 'tca' },
  { name: 'Nortriptilina', hint: 'Noritren', cls: 'tca' },
  { name: 'Venlafaxina', hint: 'Efexor', cls: 'snri' },
  { name: 'Duloxetina', hint: 'Cymbalta, Xeristar', cls: 'snri' },
  { name: 'Atogepant', hint: 'Aquipta', cls: 'gepant' },
  { name: 'Rimegepant', hint: 'Vydura', cls: 'gepant' },
  { name: 'Propranololo', hint: 'Inderal', cls: 'betablocker' },
  { name: 'Metoprololo', hint: 'Lopresor, Seloken', cls: 'betablocker' },
  { name: 'Topiramato', hint: 'Topamax', cls: 'antiepileptic' },
  { name: 'Acido valproico', hint: 'Depakin', cls: 'antiepileptic' },
  { name: 'Flunarizina', hint: 'Sibelium', cls: 'ccb' },
  { name: 'Candesartan', hint: 'Ratacand', cls: 'arb' },
  { name: 'Lisinopril', hint: 'Zestril', cls: 'arb' },
  { name: 'Magnesio', hint: '', cls: 'supplement' },
  { name: 'Riboflavina (B2)', hint: '', cls: 'supplement' },
  { name: 'Coenzima Q10', hint: '', cls: 'supplement' },
  { name: 'Melatonina', hint: '', cls: 'supplement' },
];

export const STOP_REASONS = [
  { id: 'inefficace', label: 'Non funzionava' },
  { id: 'effetti', label: 'Effetti collaterali' },
  { id: 'completata', label: 'Ciclo concluso o pausa' },
  { id: 'migliorato', label: 'Sto meglio' },
  { id: 'altro', label: 'Altro motivo' },
];
export const stopReasonLabel = (id) => (STOP_REASONS.find((r) => r.id === id) || {}).label || '';

export const SIDE_EFFECTS = [
  'Sonnolenza', 'Stanchezza', 'Aumento di peso', 'Perdita di peso', 'Formicolii', 'Memoria o concentrazione',
  'Stipsi', 'Nausea', 'Bocca secca', 'Vertigini', 'Pressione bassa', 'Umore giù', 'Insonnia',
  'Reazione nel punto di iniezione', 'Dolore a collo o spalle', 'Palpebra cadente', 'Perdita di capelli',
];

export const THERAPY_RATINGS = [
  { v: 0, label: 'Nessun beneficio' },
  { v: 1, label: 'Poco' },
  { v: 2, label: 'Buono' },
  { v: 3, label: 'Ottimo' },
];

export const DIAGNOSES = [
  'Emicrania senza aura', 'Emicrania con aura', 'Emicrania cronica', 'Emicrania mestruale',
  'Cefalea da uso eccessivo di farmaci', 'Cefalea di tipo tensivo', 'Cefalea a grappolo', 'Emicrania vestibolare',
];

export const SEXES = [
  { id: 'f', label: 'Donna' },
  { id: 'm', label: 'Uomo' },
  { id: 'x', label: 'Preferisco non dirlo' },
];

export const YES_NO_UNKNOWN = [
  { id: 'yes', label: 'Sì' },
  { id: 'no', label: 'No' },
  { id: 'unknown', label: 'Non so' },
];

export const FAMILY_MEMBERS = ['Madre', 'Padre', 'Sorella o fratello', 'Nonni', 'Figli', 'Altri parenti'];

export const TYPICAL_DURATIONS = [
  { id: 'lt4', label: 'Meno di 4 ore' },
  { id: '4to24', label: '4–24 ore' },
  { id: '24to72', label: '1–3 giorni' },
  { id: 'gt72', label: 'Più di 3 giorni' },
];

export const AURA_FREQ = [
  { id: 'never', label: 'Mai' },
  { id: 'sometimes', label: 'A volte' },
  { id: 'always', label: 'Quasi sempre' },
];

export const CYCLE_LINK = [
  { id: 'yes', label: 'Sì, spesso' },
  { id: 'sometimes', label: 'A volte' },
  { id: 'no', label: 'No' },
  { id: 'na', label: 'Non applicabile' },
];

export const CONDITIONS = [
  'Ansia', 'Depressione', 'Insonnia', 'Ipertensione', 'Pressione bassa', 'Allergie', 'Asma', 'Gastrite o reflusso',
  'Colon irritabile', 'Tiroide', 'Fibromialgia', 'Bruxismo o mandibola', 'Cervicalgia', 'Sovrappeso',
  'Problemi cardiovascolari', 'Endometriosi',
];

export const CONTACT_ROLES = [
  { id: 'center', label: 'Centro cefalee', icon: 'hospital' },
  { id: 'neuro', label: 'Neurologo', icon: 'stethoscope' },
  { id: 'gp', label: 'Medico di base', icon: 'user' },
  { id: 'hospital', label: 'Ospedale o reparto', icon: 'hospital' },
  { id: 'pharmacy', label: 'Farmacia', icon: 'pill' },
  { id: 'other', label: 'Altro', icon: 'user' },
];
export const contactRole = (id) => CONTACT_ROLES.find((r) => r.id === id) || CONTACT_ROLES[CONTACT_ROLES.length - 1];

export const VISIT_KINDS = [
  { id: 'visit', label: 'Visita neurologica' },
  { id: 'followup', label: 'Controllo' },
  { id: 'botox', label: 'Seduta di tossina botulinica' },
  { id: 'infusion', label: 'Infusione o iniezione' },
  { id: 'exam', label: 'Esame (RM, TAC, EEG…)' },
  { id: 'lab', label: 'Esami del sangue' },
  { id: 'pickup', label: 'Ritiro del farmaco' },
  { id: 'other', label: 'Altro' },
];
export const visitKindLabel = (id) => (VISIT_KINDS.find((k) => k.id === id) || VISIT_KINDS[VISIT_KINDS.length - 1]).label;

export const DOC_CATEGORIES = [
  { id: 'visit', label: 'Visite e referti', icon: 'stethoscope', tone: 'blue' },
  { id: 'imaging', label: 'Risonanze e TAC', icon: 'scan', tone: 'indigo' },
  { id: 'exam', label: 'Altri esami', icon: 'activity', tone: 'teal' },
  { id: 'lab', label: 'Esami del sangue', icon: 'drop', tone: 'red' },
  { id: 'therapy', label: 'Piani terapeutici e ricette', icon: 'pill', tone: 'green' },
  { id: 'discharge', label: 'Dimissioni e pronto soccorso', icon: 'hospital', tone: 'orange' },
  { id: 'cert', label: 'Certificati', icon: 'shield', tone: 'purple' },
  { id: 'other', label: 'Altro', icon: 'folder', tone: 'gray' },
];
export const docCategory = (id) => DOC_CATEGORIES.find((c) => c.id === id) || DOC_CATEGORIES[DOC_CATEGORIES.length - 1];

export const MIDAS_QUESTIONS = [
  'In quanti giorni non sei andato al lavoro o a scuola per il mal di testa?',
  'In quanti giorni il tuo rendimento al lavoro o a scuola si è almeno dimezzato? (senza contare i giorni della domanda 1)',
  'In quanti giorni non hai fatto i lavori di casa?',
  'In quanti giorni il rendimento nei lavori di casa si è almeno dimezzato? (senza contare i giorni della domanda 3)',
  'In quanti giorni hai rinunciato ad attività familiari, sociali o di svago?',
];
export const MIDAS_GRADES = [
  { min: 0, max: 5, grade: 'I', label: 'Disabilità minima o assente', tone: 'green' },
  { min: 6, max: 10, grade: 'II', label: 'Disabilità lieve', tone: 'teal' },
  { min: 11, max: 20, grade: 'III', label: 'Disabilità moderata', tone: 'orange' },
  { min: 21, max: 9999, grade: 'IV', label: 'Disabilità grave', tone: 'red' },
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
