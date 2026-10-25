/* i18n-ignore-file */
/* Dizionario italiano del lettore di note. Formato dei termini: vedi js/notes/util.js (sempre minuscoli e senza accenti).
 * Le chiavi di `area`, `quality`, `aura`, `symptom`, `trigger` e `meds` sono i valori salvati nei dati dell'app (italiano, con gli accenti).
 * Le liste sono UNITE a quelle delle altre lingue: una nota puo' mescolare le lingue, e la lingua dell'app e' solo un suggerimento. */
import { w } from '../util.js';

export default {
  code: 'it',

  /* ----- date ----- */
  months: [
    w('gennaio, gen, genn'), w('febbraio, feb, febb'), w('marzo, mar'), w('aprile, apr'), w('maggio, mag'), w('giugno, giu'),
    w('luglio, lug'), w('agosto, ago'), w('settembre, set, sett'), w('ottobre, ott'), w('novembre, nov'), w('dicembre, dic'),
  ],
  weekdays: [w('lunedi, lun'), w('martedi, mar'), w('mercoledi, mer'), w('giovedi, gio'), w('venerdi, ven'), w('sabato, sab'), w('domenica, dom')],
  glue: w("di, del, de, d'"),
  rangeTo: w('al, a, fino al, fino a'),
  rangeFrom: w('dal, da'),
  datePrefix: w('il, in data, del, nel giorno, giorno'),
  monthPrefix: w('primi, prima, inizio, meta, fine, ultimi, ultima, seconda, resto'),
  yearWord: w('anno'),

  /* ----- struttura ----- */
  ditto: w('idem, id, come sopra, c s, cs, ditto, uguale, uguale a prima, stesso, stessa, come ieri, come prima, come il giorno prima, come oggi'),

  /* ----- quadro clinico ----- */
  side: {
    sx: w('sinistra, sinistro, sinistre, sinistri, sx, lato sx, a sx'),
    dx: w('destra, destro, destre, destri, dx, lato dx, a dx'),
    bil: w('entrambi i lati, entrambe le parti, ambo i lati, da entrambe le parti, da entrambi i lati, bilaterale, bilateralmente, entrambe le tempie, entrambi gli occhi, ambedue i lati, due lati, tutti e due i lati, tutte e due le tempie, da ambo le parti'),
  },
  sideNot: [],
  area: {
    'Fronte': w("fronte, frontale, frontali, sopracciglio, sopracciglia, sopraorbitale, sopra l'occhio, sopra gli occhi"),
    'Tempie': w('tempia, tempie'),
    'Dietro un occhio': w("dietro l'occhio, dietro gli occhi, dietro un occhio, dietro all'occhio, dietro agli occhi, dietro occhio, retrobulbare, retro-orbitale, retroorbitale, dietro i bulbi"),
    'Occhi': w('occhio, occhi, oculare, oculari, periorbitale, periorbitali, orbita, orbite, bulbo, bulbi'),
    'Nuca': w("nuca, occipite, occipitale, occipitali, dietro la testa, dietro il capo, parte posteriore, dietro l'orecchio, dietro le orecchie, dietro orecchio, mastoide"),
    'Sommità': w('sommita, cima della testa, vertice, sopra la testa, in cima alla testa, calotta'),
    'Tutta la testa': w('tutta la testa, tutto il capo, tutto il cranio, testa intera, diffuso, diffusa, generalizzat*'),
    'Mandibola / viso': w('mandibola, mascella, viso, faccia, guancia, guance, zigomo, zigomi, ganascia'),
    'Collo': w('collo, cervicale, cervicali, cervicalgia, trapezio, trapezi'),
  },
  quality: {
    'Pulsante': w('pulsa*, martella*, a martello, battito, battiti, batte, palpita*'),
    'Pressante / a cerchio': w('pressante, pressanti, stretta, cerchio, a cerchio, morsa, casco, a casco, compressione, oppressione, oppressiva, schiacciante, senso di pressione, sensazione di pressione, come una pressione, forte pressione, pressione forte, pressione in tutta la testa, pressione alla testa, pressione sulla testa, pressione sulla fronte, pressione alla fronte, pressione dietro, tensione forte, tensione alla testa, pesantezza, testa pesante, fascia, a fascia'),
    'Trafittivo': w('trafittiv*, pungente, pungenti, punzecchiante, lancinante, lancinanti, fitta, fitte, coltello, coltellata, chiodo, cacciavite, pugnalata, pugnale, spillo, scossa, scosse, stilettata, trapano, perforante, penetrante'),
    'Sordo': w('sordo, sorda, sordi, dolore sordo, ottuso'),
    'Bruciante': w('bruciante, bruciore, brucia, bruciano, ardente, ardore, arsura'),
  },
  aura: {
    any: w('aura, aure'),
    visual: w('aura visiva, aure visive, aura visual*, disturbi visivi, disturbo visivo, disturbi della vista, disturbo della vista, scotoma, scotomi, zig-zag, lampi, lampeggi, flash, luci lampeggianti, macchie, macchia, vista doppia, visione doppia, non vedo piu, non vedevo, vedo a meta, campo visivo, puntini luminosi'),
    sensory: w('aura sensitiva, intorpidimento, intorpidit*, formicolio, formicoli, formicolii, formicolante, torpore, addormentat*, parestesi*, insensibilita, perdita di sensibilita'),
    speech: w('aura afasica, difficolta a parlare, difficolta di parola, difficolta nel parlare, afasia, non riuscivo a parlare, non riesco a parlare, parlavo male, parole confuse, balbett*, disartria, linguaggio confuso, difficolta di linguaggio, difficolta con le parole'),
    motor: w('aura motoria, debolezza muscolare, debolezza al braccio, debolezza alla gamba, braccio debole, gamba debole, paralisi, emiparesi, perdita di forza, non riuscivo a muovere, non riesco a muovere'),
  },
  type: {
    tension: w('cefalea tensiva, cefalea muscolo-tensiva, cefalea da tensione'),
    cluster: w('cefalea a grappolo, a grappolo, grappolo'),
    withAura: w('emicrania con aura'),
    noAura: w('emicrania senza aura, senza aura'),
  },
  symptom: {
    'Nausea': w('nausea, nauseata, nauseato, nauseante, nausee, mi veniva da vomitare, voglia di vomitare, conati, conato'),
    'Vomito': w('vomito, vomit*, rimesso'),
    'Sensibilità alla luce': w('fotofobia, fotosensibilita, fotosensibile, sensibilita alla luce, sensibile alla luce, fastidio alla luce, luce mi da fastidio, la luce da fastidio, intolleranza alla luce, non sopporto la luce, non sopportavo la luce'),
    'Sensibilità ai rumori': w('fonofobia, fonosensibilita, sensibilita ai rumori, sensibilita ai suoni, sensibile ai rumori, fastidio ai rumori, fastidio dai rumori, rumori mi danno fastidio, intolleranza ai rumori, non sopporto i rumori, non sopportavo i rumori, e ai rumori, e ai suoni, e dai rumori, e ai rumori forti'),
    'Sensibilità agli odori': w('osmofobia, sensibilita agli odori, sensibile agli odori, fastidio agli odori, odori mi danno fastidio, intolleranza agli odori, non sopporto gli odori'),
    'Vertigini': w('vertigine, vertigini, capogiro, capogiri, giramento di testa, giramenti di testa, mi girava la testa, testa che gira, instabilita, sbandament*'),
    'Stanchezza': w('stanchezza, stanca, stanco, affaticamento, affaticat*, spossatezza, spossat*, esaust*, sfinit*'),
    'Difficoltà di concentrazione': w('difficolta di concentrazione, difficolta a concentrarmi, difficolta nel concentrarmi, non riesco a concentrarmi, non riuscivo a concentrarmi, scarsa concentrazione, nebbia mentale, brain fog'),
    'Irritabilità': w('irritabilita, irritabile, nervosa, nervoso, nervosismo, scontrosa, intrattabile'),
    'Rigidità del collo': w('rigidita del collo, rigidita cervicale, collo rigido, collo bloccato, torcicollo, rigidita al collo, rigidita nucale, cervicale rigida, cervicale bloccata, cervicale contratta'),
    'Occhio rosso o lacrimante': w('lacrimazione, lacrimazioni, occhio rosso, occhio che lacrima, occhi che lacrimano, occhio lacrimante, occhi lacrimanti'),
    'Naso chiuso o gocciolante': w('naso chiuso, naso che cola, naso gocciolante, gocciolamento nasale, congestione nasale, naso tappato, naso otturato, rinorrea'),
    'Sbadigli frequenti': w('sbadigli, sbadigliare, sbadiglio, sbadigliavo'),
    'Fame / voglie': w('fame, voglie, voglia di dolci, voglia di cibo, fame improvvisa, fame nervosa'),
    'Sete': w('sete, molta sete, tanta sete'),
    'Sudorazione': w('sudorazione, sudorazioni, sudata, sudato, sudore, sudori, sudare, sudavo, sudo freddo, sudori freddi'),
    'Vista offuscata': w('vista offuscata, visione offuscata, vista annebbiata, visione annebbiata, vista sfocata, visione sfocata, blurrat*, sfocat*, offuscat*, vista appannata, vedo sfocato, vedo male, vedevo male'),
    'Brividi': w('brividi, brivido, brividi di freddo, tremori, tremore'),
  },
  trigger: {
    'Stress': w('stress, stressat*, stressante, stressanti, agitazione, preoccupazion*, tensione emotiva, tensione nervosa, sotto pressione, periodo stressante'),
    'Ansia': w('ansia, ansiosa, ansioso, attacco di panico, attacchi di panico, panico'),
    'Poco sonno': w('poco sonno, dormito poco, dormito male, dormo poco, non ho dormito, notte insonne, notte in bianco, insonnia, sonno scarso, sonno disturbato, sonno agitato, dormito pochissimo, ho dormito male, poche ore di sonno, riposato male'),
    'Troppo sonno': w('troppo sonno, dormito troppo, dormito tanto, dormito molto, sonno eccessivo, ipersonnia, dormito piu del solito'),
    'Pasto saltato': w('pasto saltato, pasti saltati, saltato il pranzo, saltato la colazione, saltato la cena, saltato pranzo, saltato colazione, saltato cena, saltato un pasto, saltato i pasti, digiuno, a digiuno, senza mangiare, non ho mangiato, non avevo mangiato, mangiato poco, pranzo tardi'),
    'Disidratazione': w('disidratazione, disidratata, disidratato, poca acqua, bevuto poco, non ho bevuto, bevo poco, poca idratazione'),
    'Alcol': w('alcol, alcolici, alcolico, vino, birra, aperitivo, aperitivi, spritz, prosecco, cocktail, superalcolici, brindisi, sbornia, bevuto troppo, ubriaca, ubriaco'),
    'Caffeina': w('caffeina, caffe, troppo caffe, tanto caffe, molti caffe, energy drink, red bull, redbull, coca cola'),
    'Astinenza da caffeina': w('astinenza da caffeina, astinenza da caffe, senza caffe, niente caffe, nessun caffe, non ho preso il caffe, non ho bevuto il caffe, saltato il caffe, saltato caffe, mancanza di caffe, caffe saltato, senza caffeina, no caffe, no caffeina'),
    'Cioccolato': w('cioccolato, cioccolata, cioccolatini, cioccolatino, cacao, nutella'),
    'Formaggi stagionati': w('formaggio, formaggi, stagionato, stagionati, parmigiano, grana, gorgonzola, pecorino, taleggio, provolone, brie, camembert, emmental'),
    'Cibi molto elaborati': w('cibo spazzatura, junk food, fast food, cibi elaborati, cibo elaborato, cibi industriali, cibo industriale, insaccati, salumi, salame, wurstel, glutammato, merendine, fritto, fritti, cibo confezionato, cibo processato'),
    'Cambio del tempo': w('cambio del tempo, cambio di tempo, cambiamento del tempo, cambio meteo, meteo, maltempo, tempo variabile, brutto tempo, temporale, temporali, pioggia, piovoso, scirocco, favonio, pressione atmosferica, pressione barometrica, sbalzi di pressione atmosferica, sbalzo di pressione atmosferica, sbalzi di temperatura, sbalzo di temperatura, umidita, nebbia, neve, vento'),
    'Caldo': w('caldo, caldissimo, afa, calore, sole, insolazione, colpo di sole, colpo di calore, ondata di caldo, troppo sole, sole forte'),
    'Freddo': w("freddo, freddissimo, gelo, aria condizionata, condizionatore, climatizzatore, colpo d'aria, corrente d'aria, correnti d'aria, preso freddo, aria fredda, vento freddo"),
    'Luci intense / schermi': w('luci forti, luce forte, luci intense, luce intensa, luci abbaglianti, schermo, schermi, troppo schermo, computer, videogiochi, videogioco, televisione, neon, luce al neon, luci lampeggianti, luce fastidiosa, sole negli occhi, riverbero, abbagliamento'),
    'Rumori forti': w('rumori forti, rumore forte, musica alta, musica forte, concerto, discoteca, locale rumoroso, ambiente rumoroso, rumoroso, rumorosa, troppo rumore, tanto rumore'),
    'Odori forti': w('odori forti, odore forte, odore, odori, profumo, profumi, profumo forte, puzza, puzze, cattivo odore, vernice, solventi, solvente, candeggina, detersivo, detersivi, deodorante, incenso, benzina, smog'),
    'Sforzo fisico': w('sforzo fisico, sforzo, sforzi, allenamento, allenamenti, allenata, allenato, palestra, corsa, correre, running, sport, attivita fisica, esercizio fisico, camminata, nuoto, nuotato, bici, bicicletta, pesi, crossfit, pilates, fatica fisica'),
    'Viaggio': w("viaggio, viaggi, viaggiato, viaggiare, volo, voli, aereo, aeroplano, treno, in macchina, in auto, in pullman, in autobus, lungo viaggio, jet lag, fuso orario, trasferta, gita"),
    'Cambio di routine': w("cambio di routine, cambio routine, routine diversa, orari diversi, cambio orario, cambio d'orario, vacanza, vacanze, ferie, trasloco, cambio turno, turni, notte di lavoro, festa, feste, fuori orario, ritmo diverso"),
    'Tensione al collo / postura': w('tensione al collo, tensione cervicale, tensione muscolare, tensione alle spalle, contrattura, contratture, postura, posizione scorretta, scrivania, ore alla scrivania, muscoli tesi, spalle tese'),
    'Fumo': w('fumo, fumato, fumare, sigaretta, sigarette, sigaro, tabacco, fumo passivo, fumo di sigaretta, troppe sigarette'),
    'Ciclo mestruale': w('ciclo, mestruazioni, mestruazione, mestruale, mestruali, mestruo, mestruata, flusso mestruale, sindrome premestruale, premestruale, pms, ovulazione, periodo mestruale'),
  },
  /* Ciclo mestruale: giorni di flusso (non "domani ciclo", "pre ciclo"...). */
  menses: w('ciclo, mestruazioni, mestruazione, mestruale, mestruo, mestruata, flusso mestruale'),
  mensesNot: w('ciclo di cura, ciclo di terapia, ciclo di botox, ciclo di tossina, ciclo di infusioni, ciclo di iniezioni, ciclo del sonno, ciclo sonno-veglia, cicli di, corsa a casa, corsa in ospedale, corsa al pronto soccorso, corsa in pronto soccorso, corsa al ps, corsa dal medico, corsa dal dottore, corsa in farmacia, corsa in bagno, corsa a letto, corsa in clinica'),
  mensesBefore: w('pre, prima del, prima di, in arrivo, domani, dopodomani, fra, tra, manca, mancano, a breve, imminente, sta per, settimana al, settimane al, giorni al, giorno al, prossimo, prossima, dopo il, dopo, finito, finita, fine del'),

  /* ----- intensita ----- */
  severity: {
    1: w('leggerissim*, appena percettibil*, impercettibil*, tenue'),
    2: w('lieve, lievi, leggero, leggera, leggeri, leggere, debole'),
    3: w('fastidio, fastidios*, un po, un pochino'),
    4: w('sopportabile, sopportabili, gestibile, gestibili, tollerabile, moderato, moderata, discreto, cosi cosi, non troppo forte, non molto forte, non tanto forte, non cosi forte, non particolarmente forte, non troppo intens*, non molto intens*, non tanto intens*'),
    5: w('disturba le attivita, disturbante'),
    6: w('abbastanza forte, piuttosto forte, doloroso, dolorosa, pesante, pesanti'),
    7: w('forte, forti, intenso, intensa, intensi, intense, acuto, acuta, severo, severa'),
    8: w('molto forte, molto forti, molto intenso, molto intensa, tanto forte, davvero forte, veramente forte, forte forte'),
    9: w('fortissim*, estrem*, insopportabil*, atroc*, lancinant*, violent*, terribil*, devastant*, da impazzire, impazzire, da morire, spaventos*, tremend*, micidial*'),
    10: w('il peggior*, peggior dolore, mai provato, mai avuto, dolore piu forte, volevo morire, vorrei morire, da svenire'),
  },
  intensityKeyword: w('intensita, livello, grado, voto, punteggio, scala, dolore, nrs, vas'),
  outOf: w('su, su un massimo di, su una scala di'),
  worse: w('peggiorat*, peggiora, peggiorando, aumentat*, aumenta, aumentando, piu forte di prima, sempre piu forte, sempre piu, man mano piu, via via piu, aggravat*, esploso, esplosa'),
  negator: w('senza, no, non, nessun, nessuna, nessuno, niente, nulla, assenza di, assente, assenti, mai'),

  /* ----- farmaci ----- */
  effect: {
    none: w('non ha fatto effetto, non fa effetto, non ha effetto, non ha avuto effetto, non funziona, non funzionato, non ha funzionato, non funzionano, non passa, non e passato, non e passata, non mi e passato, zero effetto, nessun effetto, senza effetto, inefficace, non e servito, non serve, non ha aiutato, non aiuta, non e cambiato nulla, non cambia nulla, non effetto, non fa niente, non ha fatto niente, non ha dato sollievo, nessun sollievo, nessun beneficio, non ha fatto nulla, non ha fatto passare'),
    partial: w("effetto parziale, in parte, solo in parte, un po meglio, migliorato solo, ha aiutato un po, sollievo parziale, parzialmente, poco effetto, effetto minimo, ha alleviato un po"),
    good: w('ha funzionato, funziona, ha fatto effetto, ha aiutato, mi ha aiutato, e passato dopo, e passata dopo, ha dato sollievo, ha alleviato, mi ha tolto, mi ha fatto passare, ha fatto passare, funzionato bene, efficace, e passato, e passata, ha tolto'),
    resolved: w('risolutivo, ha risolto, risolto, sparito, sparita, scomparso, scomparsa, passato del tutto, passata del tutto, completamente passat*'),
  },
  took: w('preso, presa, presi, prese, ho preso, assunto, assunta, assunti, assunte, ho assunto, mi sono presa, mi sono preso, prendo, ho bevuto, bevuto, ingerito, ingerita'),
  notMeds: w('freddo, caldo, sole, aria, pioggia, acqua, botta, colpo, spavento, paura, tempo, fiato, sonno, pausa, riposo, qualcosa, niente, nulla, altro, altra, dopo, prima, poi, ancora, subito, stamattina, stasera, stanotte, questa, questo, mattina, sera, notte, troppo, poco, pochi, ore, ora, dose, dosi, pastiglia, pastiglie, compressa, compresse, pillola, pillole, farmaco, farmaci, medicina, medicine, antidolorifico, antidolorifici, analgesico, analgesici, bustina, bustine, goccia, gocce, supposta, supposte, iniezione, puntura, fiala, fiale, solo, anche, quindi, ieri, oggi, domani, pomeriggio, mezza, mezzo, meta'),
  numWord: { 1: w('un, uno, una'), 2: w('due, doppia, doppio'), 3: w('tre'), 4: w('quattro') },
  meds: {
    'Ibuprofene': w('moment 200, moment 400, moment act'),
  },

  /* ----- esiti, durata, contesto ----- */
  er: w('pronto soccorso, pronto-soccorso, guardia medica, 118, ambulanza, andata al ps, andato al ps, accesso al ps, corsa in ospedale'),
  hosp: w('ricovero, ricoverata, ricoverato, ospedalizzat*, degenza, ricoverarmi'),
  other: w('visita, visite, appuntamento, appuntamenti, controllo, esame, esami, risonanza, rmn, tac, eeg, prelievo, analisi, ricetta, farmacia, compleanno, festa, prenotare, prenotato, neurologo, dottore, dottoressa, ecografia, vaccino, richiamo'),
  noPain: w('nessun dolore, niente dolore, nessuna emicrania, niente emicrania, nessun mal di testa, niente mal di testa, senza dolore, senza mal di testa, senza emicrania, stata bene, sto bene, tutto ok, tutto bene, giornata libera, libera da, libero da, no emicrania, no mal di testa, no dolore, nessun attacco'),
  pain: w('mal di testa, emicrania, emicranie, cefalea, cefalee, dolore, dolori, doloroso, dolorosa, fa male, faceva male, male alla testa, mal di capo, nevralgia, testa, capo'),
  allDay: w('tutto il giorno, tutta la giornata, per tutta la giornata, giornata intera, 24 ore, dalla mattina alla sera, dalla mattina fino a sera, da stamattina a stasera'),
  fewHours: w("qualche ora, poche ore, un paio d'ore, un paio di ore, un'ora, un ora, mezz'ora, mezz ora, pochi minuti, qualche minuto, un'oretta, un oretta"),
  durationCue: w('per, durato, durata, durata di, durante, circa, ca, per circa, almeno, fino a'),
  hoursWord: w('ore, ora, h, hr, hrs'),
  daysWord: w('giorni, giorno, gg, giornate'),
};
