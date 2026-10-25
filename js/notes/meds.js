/* i18n-ignore-file */
/* Catalogo dei farmaci riconosciuti nelle note.
 *
 * `name` e' il valore che viene salvato nei dati (italiano, come l'elenco dei farmaci dell'app: si traduce solo a video con tv()).
 * I nomi che non sono tra quelli predefiniti dell'app vengono aggiunti all'elenco dei farmaci dell'utente all'importazione.
 * `terms`: nomi commerciali e principi attivi condivisi da tutte le lingue (termini piegati: vedi util.js).
 * Ogni lingua puo' aggiungere i suoi nomi in `meds` (js/notes/lex/<lingua>.js), indicizzati per `name`.
 */
import { tr } from '../i18n.js';
import { w } from './util.js';

export const MED_CATALOG = [
  { name: tr('Paracetamolo'), cls: 'paracetamol', terms: w('paracetamol*, acetaminophen*, tachipirina, efferalgan, dafalgan, doliprane, panadol, tylenol, gelocatil, termalgin, perfalgan, ben-u-ron, benuron') },
  { name: tr('Ibuprofene'), cls: 'nsaid', terms: w('ibuprofen*, brufen, nurofen, advil, motrin, spidifen, dalsy, neobrufen, ibuflam, dolormin, spedifen') },
  { name: tr('Naprossene'), cls: 'nsaid', terms: w('naprox*, naprosyn, synflex, momendol, aleve, anaprox, apranax') },
  { name: tr('Ketoprofene'), cls: 'nsaid', terms: w('ketoprofen*, chetoprofen*, cetoprofen*, oki, oki task, okitask, oki-task, profenid') },
  { name: tr('Dexketoprofene'), cls: 'nsaid', terms: w('dexketoprofen*, dexchetoprofen*, ketesse, enantyum, keral, sympal') },
  { name: tr('Diclofenac'), cls: 'nsaid', terms: w('diclofenac*, voltaren, voltadvance, voltarene, cataflam, dicloreum, olfen') },
  { name: tr('Nimesulide'), cls: 'nsaid', terms: w('nimesulid*, aulin, mesulid, nimed') },
  { name: tr('Acido acetilsalicilico'), cls: 'nsaid', terms: w('acido acetilsalicilico, acetilsalicilic*, acetylsalicyl*, aspirin*, aspegic, aspro') },
  { name: tr('Metamizolo'), cls: 'nsaid', terms: w('metamizol*, novalgina, novalgin, nolotil, algocalmin, dipirona, dipyrone, novaminsulfon') },
  { name: tr('Ketorolac'), cls: 'nsaid', terms: w('ketorolac*, toradol') },
  { name: tr('Indometacina'), cls: 'nsaid', terms: w('indometacin*, indomethacin*, indocid') },
  { name: tr('Sumatriptan'), cls: 'triptan', terms: w('sumatriptan*, imigran, imitrex, sumax') },
  { name: tr('Rizatriptan'), cls: 'triptan', terms: w('rizatriptan*, maxalt, rizalt') },
  { name: tr('Zolmitriptan'), cls: 'triptan', terms: w('zolmitriptan*, zomig') },
  { name: tr('Eletriptan'), cls: 'triptan', terms: w('eletriptan*, relpax') },
  { name: tr('Almotriptan'), cls: 'triptan', terms: w('almotriptan*, almogran, almotrex') },
  { name: tr('Naratriptan'), cls: 'triptan', terms: w('naratriptan*, naramig, amerge') },
  { name: tr('Frovatriptan'), cls: 'triptan', terms: w('frovatriptan*, frova, fromen') },
  { name: tr('Triptano'), cls: 'triptan', terms: w('triptan*'), generic: true },
  { name: tr('Paracetamolo + codeina'), cls: 'opioid', terms: w('tachidol, co-efferalgan, coefferalgan, co-codamol, cocodamol, codamol, solpadeine, panadeine') },
  { name: tr('Codeina'), cls: 'opioid', terms: w('codein*, kodein*') },
  { name: tr('Tramadolo'), cls: 'opioid', terms: w('tramadol*, contramal, tramal, ultram, zydol') },
  { name: tr('Ossicodone + naloxone'), cls: 'opioid', terms: w('targin, targinact') },
  { name: tr('Ossicodone'), cls: 'opioid', terms: w('oxycodon*, ossicodon*, oxicodon*, oxycontin, oxynorm') },
  { name: tr('Ergotamina + caffeina'), cls: 'ergot', terms: w('ergotamin*, cafergot, migril, gynergen, diidroergotamin*, dihydroergotamin*') },
  { name: tr('Saridon'), cls: 'combo', terms: w('saridon') },
  { name: tr('Excedrin'), cls: 'combo', terms: w('excedrin') },
  { name: tr('Thomapyrin'), cls: 'combo', terms: w('thomapyrin') },
  { name: tr('Metoclopramide'), cls: 'antiemetic', terms: w('metoclopramid*, plasil, primperan, reglan') },
  { name: tr('Domperidone'), cls: 'antiemetic', terms: w('domperidon*, peridon, motilium, gastrimut') },
  { name: tr('Ondansetron'), cls: 'antiemetic', terms: w('ondansetron*, zofran') },
  { name: tr('Cortisone'), cls: 'other', terms: w('cortison*, bentelan, deltacortene, prednison*, dexametason*, dexamethason*, medrol, urbason') },
  { name: tr('Rimegepant'), cls: 'other', terms: w('rimegepant*, nurtec, vydura') },
  { name: tr('Ubrogepant'), cls: 'other', terms: w('ubrogepant*, ubrelvy') },
  { name: tr('Lasmiditan'), cls: 'other', terms: w('lasmiditan*, reyvow') },
];

export const MED_BY_NAME = new Map(MED_CATALOG.map((m) => [m.name, m]));
