import { h, replaceChildren } from '../dom.js';
import * as store from '../store.js';
import {
  openPage, openSheet, accordion, card, cardTitle, button, alertBox,
} from '../ui.js';
import { APP_VERSION } from '../data.js';
import { isIos, isStandalone } from '../env.js';

const ul = (...items) => h('ul', { class: 'bullets' }, items.map((i) => h('li', {}, i)));
const ol = (...items) => h('ol', { class: 'bullets' }, items.map((i) => h('li', {}, i)));
const p = (text) => h('p', {}, text);

export function openHelp() {
  const page = openPage({ title: 'Guida e consigli' });
  replaceChildren(
    page.body,
    alertBox({
      tone: 'danger',
      icon: 'alert',
      title: 'Quando chiamare subito il 112',
      text: 'Mal di testa improvviso e violentissimo, dopo un trauma, con febbre alta e collo rigido, oppure con debolezza o formicolio a un lato del corpo, difficoltà a parlare, vista doppia, confusione, perdita di coscienza o convulsioni.',
    }),
    accordion({
      title: 'Installare l’app su iPhone',
      open: !isStandalone(),
      children: [
        ol(
          'Apri l’indirizzo dell’app con Safari.',
          'Tocca Condividi (il quadrato con la freccia in su). Se non lo vedi, apri il menu ⋯ o «aA» accanto all’indirizzo e scegli Condividi.',
          'Scorri e scegli «Aggiungi alla schermata Home».',
          'Lascia attivo «Apri come app web» e tocca Aggiungi.',
          'Da ora apri sempre il diario dall’icona sulla schermata Home.',
        ),
        p('Importante: i dati dell’icona sulla Home sono separati da quelli di Safari. Inizia a registrare solo dopo aver installato l’app, e non cancellare l’icona senza aver fatto un backup.'),
      ],
    }),
    accordion({
      title: 'Come si usa',
      children: [
        ul(
          'Tocca il pulsante + in basso a destra per registrare un attacco: basta scegliere l’intensità, il resto è facoltativo.',
          'Se l’attacco è ancora in corso, lascialo «in corso»: in Oggi compare un timer e potrai terminarlo con un tocco.',
          'Per un attacco passato di cui non ricordi l’ora, attiva «Non ricordo l’orario»: basta il giorno e, se la ricordi, una durata indicativa.',
          'Nei giorni senza mal di testa tocca «Nessuna emicrania oggi»: rende le statistiche più precise.',
          'Nel Diario tocca un giorno per vedere o modificare quello che hai registrato.',
          '«Dettagli della giornata» raccoglie sonno, stress, caffè, acqua: servono per scoprire i tuoi fattori scatenanti.',
          'Le impostazioni, il backup e questa guida si aprono dal pulsante tondo in alto a destra.',
        ),
      ],
    }),
    accordion({
      title: 'Terapie di prevenzione',
      children: [
        ul(
          'In Cartella › Terapie di prevenzione inserisci la terapia prescritta dal neurologo: anticorpi monoclonali anti-CGRP, tossina botulinica, antidepressivi, beta-bloccanti e altre. Puoi inserire anche quelle del passato, con le date di inizio e fine.',
          'Per iniezioni e infusioni registra le date delle somministrazioni (o compilale dal calendario previsto): l’app ti ricorda la prossima e mostra se gli attacchi aumentano verso la fine del ciclo.',
          'L’efficacia confronta i giorni di emicrania al mese dei 3 mesi prima con gli ultimi 3 mesi di terapia. Se il diario non copre il periodo precedente, indica il valore di partenza nella terapia o racconta quel periodo nella tua storia.',
          'Quando registri un attacco durante una terapia, puoi indicare se è stato più leggero o più forte di prima e se avevi saltato una dose.',
        ),
      ],
    }),
    accordion({
      title: 'La mia storia e la sintesi clinica',
      children: [
        p('In Cartella › La mia storia racconti la tua situazione fino a oggi, come alla prima visita dal neurologo: esordio, diagnosi, com’è un attacco tipico, quanti giorni al mese avevi mal di testa nei diversi periodi della vita, gli episodi più importanti, le cure già provate, le altre condizioni di salute e un racconto libero.'),
        p('Non serve ricompilare il diario del passato: le stime dei periodi entrano nel grafico dell’andamento e fanno da punto di partenza per valutare le terapie. La sintesi clinica mette insieme storia e diario in un testo in stile anamnesi, con alcune osservazioni automatiche prudenti. Non è una diagnosi.'),
      ],
    }),
    accordion({
      title: 'Documenti e centro curante',
      children: [
        ul(
          'In Cartella › Documenti carichi i PDF dell’ospedale (per esempio scaricati dal Fascicolo sanitario o ricevuti per email) oppure fotografi i referti di carta. Puoi aggiungere più pagine allo stesso documento.',
          'I documenti si aprono dentro l’app, anche senza connessione, e si possono condividere o salvare in File.',
          'In Centro curante e visite salvi telefono, email e indirizzo del centro cefalee e del neurologo, le visite con le domande da fare e l’esito. Le visite future si possono aggiungere al Calendario.',
          'I documenti occupano spazio: usa il backup completo (ZIP) per conservarne una copia.',
        ),
      ],
    }),
    accordion({
      title: 'I tuoi dati e la privacy',
      children: [
        ul(
          'Tutto resta nella memoria di questo telefono, documenti compresi. Non c’è nessun account e nessun server dell’app.',
          'Unica eccezione, solo se la attivi: il meteo viene scaricato da Open-Meteo inviando la posizione approssimata e le date, mai i tuoi dati sulla salute.',
          'Per non perdere i dati cambiando telefono o cancellando l’app, esporta un backup (Impostazioni › Dati e backup) e salvalo in File o iCloud Drive. Il backup completo in formato ZIP contiene anche i documenti.',
          'Il blocco con PIN protegge dagli sguardi indiscreti, ma non cifra i dati.',
        ),
      ],
    }),
    accordion({
      title: 'Quando parlarne con il medico',
      children: [
        ul(
          'Gli attacchi diventano più frequenti, più forti o diversi dal solito.',
          'Prendi farmaci per il mal di testa più di 2-3 giorni a settimana.',
          'I farmaci non funzionano più come prima.',
          'Il mal di testa ti costringe a saltare lavoro, scuola o impegni.',
          'Hai un mal di testa nuovo dopo i 50 anni o che peggiora di giorno in giorno.',
        ),
      ],
    }),
    accordion({
      title: 'Uso eccessivo di farmaci',
      children: [
        p('Assumere farmaci sintomatici troppo spesso può peggiorare le cefalee (cefalea da uso eccessivo di farmaci). In genere si indica di restare sotto i 10 giorni al mese con triptani, oppioidi e associazioni di analgesici, e sotto i 15 giorni al mese con paracetamolo e antinfiammatori.'),
        p('L’app conta i giorni con farmaci negli ultimi 30 giorni e ti avvisa quando ti avvicini alla soglia. Non sostituisce il parere del medico.'),
      ],
    }),
    accordion({
      title: 'Piccoli consigli durante un attacco',
      children: [
        ul(
          'Cerca un ambiente buio e silenzioso e usa la Modalità sollievo per respirare con calma.',
          'Bevi acqua a piccoli sorsi e non restare a digiuno.',
          'Un impacco freddo sulla fronte o sulla nuca aiuta molte persone.',
          'Annota l’orario del farmaco: aiuta il medico a capire quanto funziona.',
        ),
      ],
    }),
    card(
      cardTitle('Informazioni'),
      p(`Diario Emicrania · versione ${APP_VERSION}`),
      h('p', { class: 'muted small', style: { marginTop: '6px' } }, 'Questa app è uno strumento di registrazione personale: non fornisce diagnosi né consigli medici e non sostituisce il parere del medico.'),
    ),
  );
  return page;
}

export function openWelcome() {
  const sheet = openSheet({
    title: 'Benvenuto',
    tall: false,
    onDismiss: (s) => {
      store.updateSettings({ welcomeDone: true });
      s.close();
    },
  });
  const done = () => {
    store.updateSettings({ welcomeDone: true });
    sheet.close();
  };
  replaceChildren(
    sheet.body,
    h('p', { class: 'mb', style: { fontSize: '1.05rem' } }, 'Il tuo diario dell’emicrania: registra gli attacchi in pochi tocchi, segui l’efficacia delle terapie, tieni in ordine i documenti dell’ospedale e porta al medico un report chiaro.'),
    ul(
      'I dati restano solo su questo iPhone: niente account, niente server.',
      'Tocca + per registrare un attacco, anche mentre sta ancora succedendo.',
      'In Cartella racconta la tua storia, inserisci le terapie e carica i documenti.',
      'Ogni tanto salva un backup dalle Impostazioni (pulsante in alto a destra).',
    ),
    isIos() && !isStandalone() ? alertBox({ tone: 'info', icon: 'download', title: 'Prima di iniziare', text: 'Installa l’app: Condividi › «Aggiungi alla schermata Home», poi apri il diario dall’icona. I dati di Safari e quelli dell’icona sono separati.' }) : null,
    h('div', { class: 'mt' }, button({ label: 'Inizia', kind: 'primary', size: 'lg', block: true, onClick: done })),
    h('p', { class: 'muted small center', style: { marginTop: '12px' } }, 'Non sostituisce il parere del medico.'),
  );
  return sheet;
}
