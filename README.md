# Diario Emicrania

App per tenere il diario dell'emicrania, pensata per **iPhone** (funziona anche su altri telefoni e sul computer).
È una *Progressive Web App*: si apre da Safari, si aggiunge alla schermata Home e poi funziona a schermo intero e **senza connessione**, come una normale app.

Tutto è in italiano e **i dati restano solo sul telefono**, documenti compresi: nessun account, nessun server.

## Cosa sa fare

**Registrare**
- Attacchi in pochi tocchi: basta l'intensità (1–10). Facoltativi: tipo, lato, zona, carattere del dolore, aura, sintomi, fattori scatenanti, impatto su lavoro/attività, note.
- Attacco **in corso** con timer in Oggi, da terminare con un tocco; pulsante rapido «Ho preso un farmaco».
- **«Non ricordo l'orario»** per gli attacchi passati: basta il giorno e, se la ricordi, una durata indicativa (meno di 4 ore, 4–12, 12–24, più giorni). Questi attacchi non falsano le statistiche su orari e durate.
- Se registri un attacco molto più vecchio dell'inizio del diario, l'app chiede se il diario è completo da quella data o se è un attacco isolato, così i giorni senza registrazioni non vengono contati per errore.
- Farmaci con orario, dose ed **efficacia** (nessuna / parziale / buona / risolutiva). Elenco precompilato (paracetamolo, FANS, triptani…) e personalizzabile.
- «Dettagli della giornata»: sonno, stress, umore, acqua, caffè, alcol, pasti saltati, attività fisica, ciclo (facoltativo).

**Terapie di prevenzione** (Cartella › Terapie)
- Terapie prescritte dal neurologo, attuali e **passate**: anticorpi monoclonali anti-CGRP (erenumab, fremanezumab, galcanezumab, eptinezumab), tossina botulinica, antidepressivi (amitriptilina, venlafaxina…), beta-bloccanti, antiepilettici, gepanti, integratori e altre. Il tipo viene riconosciuto dal nome.
- Per iniezioni, infusioni e sedute: date delle somministrazioni (anche compilate dal calendario previsto), **prossima somministrazione** in Oggi con «Fatta» e promemoria nel Calendario.
- **Efficacia**: giorni di emicrania al mese, intensità, giorni con farmaci e attacchi al mese prima e durante la terapia, con percentuale di riduzione e tipo di risposta (≥50% buona, 30–49% parziale). Il punto di partenza viene dal diario dei 3 mesi precedenti, dal valore indicato nella terapia (es. dal piano terapeutico) o dalle stime della propria storia.
- Grafico mese per mese, andamento **dentro ogni ciclo** (più attacchi a fine ciclo), giudizio sugli attacchi durante la terapia.
- Nell'attacco: sezione «Terapia di prevenzione» con la terapia in corso, i giorni dall'ultima somministrazione e due domande (attacco più leggero/uguale/più forte rispetto a prima, dose saltata).

**La mia storia e sintesi clinica** (Cartella › La mia storia)
- Anamnesi guidata, come alla prima visita dal neurologo: esordio, diagnosi, familiarità, attacco tipico, **frequenza negli anni** (periodi stimati, per non ricompilare il diario del passato), episodi significativi (pronto soccorso, ricoveri), farmaci già provati, altre condizioni, allergie, ormoni, racconto libero.
- Le stime entrano nel grafico pluriennale e fanno da punto di partenza per valutare le terapie.
- **Sintesi clinica** in stile anamnesi che unisce storia e diario, con osservazioni automatiche prudenti (frequenza compatibile con emicrania cronica, uso eccessivo di farmaci, risposta alle terapie, classi di terapie già fallite, MIDAS, emicrania con aura e contraccezione ormonale…). Condivisibile come testo e inclusa nel report.

**Cartella clinica** (Cartella › Documenti, Centro curante e visite)
- Documenti dell'ospedale in **PDF o foto** (anche scattate al momento, più pagine per documento), con categoria, data, centro e note; ricerca e filtri. Le foto vengono ridotte per occupare meno spazio.
- Visualizzatore interno: immagini con zoom e **PDF con tutte le pagine** (PDF.js), anche senza connessione; condivisione o salvataggio in File.
- Centro cefalee, neurologo e medico di base con telefono, email, indirizzo (chiamata, email e Mappe con un tocco); visite con domande da fare ed esito, promemoria nel Calendario.
- Questionario **MIDAS** sulla disabilità, con andamento nel tempo.

**Capire**
- Diario mensile colorato per intensità, elenco con ricerca e filtri.
- Analisi per 30 giorni / 90 giorni / 6 mesi / 12 mesi / tutto: frequenza, intensità, durata, giorni della settimana e momento della giornata, fattori e sintomi più frequenti, panoramica degli ultimi 12 mesi, **andamento pluriennale con le fasce delle terapie** (2 anni, 5 anni, tutto).
- Efficacia dei farmaci e **avviso sull'uso eccessivo di farmaci** (soglie 10/15 giorni al mese).
- Suggerimenti automatici (tendenza, sonno, stress, pressione atmosferica, ciclo…) con soglie minime per evitare conclusioni affrettate.
- Meteo e **pressione atmosferica** automatici (facoltativo, da Open-Meteo, solo posizione approssimata).

**Condividere e proteggere**
- **Report PDF per il medico**: riepilogo, sintesi clinica, andamento pluriennale con le terapie, terapie con la risposta, MIDAS, farmaci, centro curante, elenco dei documenti e degli attacchi (sezioni a scelta).
- **Backup completo in ZIP** con dati e documenti (apribile anche dal computer: i file sono divisi per categoria) oppure solo dati in JSON; ripristino «unisci» o «sostituisci». Esportazione CSV per Excel/Numbers.
- Blocco con **PIN**, tema scuro (più delicato con la fotofobia), **Modalità sollievo** (schermo nero con respirazione guidata).
- Promemoria giornaliero tramite evento ripetuto nel Calendario di iOS.

**Design**
- Stile delle app Apple (iOS 26): titoli grandi che si compattano scorrendo, barra delle schede fluttuante in vetro con il pulsante + sempre a portata di pollice, elenchi raggruppati, pulsanti a capsula, numeri arrotondati, tema chiaro e scuro automatici.

> L'app è uno strumento di registrazione personale: non fa diagnosi e non sostituisce il medico.

## Metterla sull'iPhone

Le app web su iPhone devono essere servite da un indirizzo **https**. Pubblica la cartella una volta sola con uno di questi servizi gratuiti e poi installala da Safari.

### Opzione A · GitHub Pages
1. Crea un repository **pubblico** (con il piano gratuito GitHub Pages non funziona sui repository privati; nell'app non ci sono dati personali) e carica **tutto il contenuto di questa cartella**.
2. In *Settings › Pages* scegli *Deploy from a branch*, branch `main`, cartella `/ (root)`.
3. Dopo un minuto l'app è su `https://<tuo-utente>.github.io/<nome-repository>/`.

### Opzione B · Netlify (trascina e rilascia)
Apri <https://app.netlify.com/drop>, trascina questa cartella e ottieni un indirizzo https. Crea un account gratuito per tenerlo permanente.

### Poi, sull'iPhone
1. Apri l'indirizzo con **Safari**.
2. Tocca **Condividi** (il quadrato con la freccia in su; se non lo vedi, apri il menu ⋯ o «aA» accanto all'indirizzo) › **Aggiungi alla schermata Home**.
3. Lascia attivo «Apri come app web» e tocca **Aggiungi**.
4. Apri il diario **sempre dall'icona**: i dati dell'icona sono separati da quelli di Safari, quindi inizia a registrare solo dopo averla installata.

### Aggiornare l'app
Dopo ogni modifica ai file esegui `python tools/build_sw.py` (aggiorna l'elenco dei file offline e la versione) e ripubblica la cartella. Sull'iPhone comparirà «È disponibile una nuova versione»: tocca *Aggiorna*. I dati restano: l'aggiornamento cambia solo l'app.

## I tuoi dati
- Sono nella memoria dell'app sul telefono (diario in `localStorage`, documenti in IndexedDB). Se cancelli l'icona o i dati di Safari, vanno persi: fai ogni tanto un **backup completo** (*Impostazioni*, pulsante tondo in alto a destra › *Dati e backup › Esporta*) e salvalo in File/iCloud Drive. L'app te lo ricorda.
- Il PIN impedisce l'accesso casuale, ma non cifra i dati.
- Unica connessione in uscita, solo se attivi il meteo: Open-Meteo (posizione arrotondata a circa 1 km e date).

## Sviluppo e test
Nessuna dipendenza da installare e nessuna build: sono file statici. PDF.js (Mozilla, licenza Apache-2.0) è incluso in `vendor/pdfjs` (vedi `VERSION.txt`).

```powershell
python -m http.server 8765          # avvia un server locale su http://127.0.0.1:8765
python tools/make_icons.py          # rigenera icone e splash (Pillow, numpy)
python tools/build_sw.py            # aggiorna sw.js
node --test tests/unit.test.mjs     # test della logica (store, statistiche, terapie, sintesi, ZIP)
python tests/e2e.py webkit          # test end-to-end con Playwright (anche: chromium)
python tests/shots.py webkit dark   # screenshot di tutte le schermate (light/dark)
```

```
index.html, manifest.webmanifest, sw.js
css/app.css
js/            store, analysis, clinical (terapie, storia, sintesi), files (IndexedDB), zip, backup,
               pdfview, ui, charts, weather, lock, exporter…
js/views/      home, calendar, stats, record (Cartella), episode, therapies, history, documents,
               care, midas, report, settings, day, help…
vendor/pdfjs/  PDF.js per mostrare tutte le pagine dei PDF dentro l'app
icons/         icone e splash screen per iPhone
tools/         generatori di icone e dell'elenco offline
tests/         test unitari ed end-to-end
```

## Limiti noti
- Le app web su iPhone non possono inviare notifiche senza un server: per questo promemoria, visite e somministrazioni usano il Calendario.
- Non c'è sincronizzazione tra dispositivi: usa il backup per spostare i dati.
- La sintesi clinica usa regole esplicite sui dati inseriti (nessuna intelligenza artificiale, nessun invio di dati): non interpreta il racconto libero, che viene riportato così com'è.
- Le soglie sui farmaci, le risposte alle terapie e i suggerimenti sono indicazioni generali, da discutere con il medico.
