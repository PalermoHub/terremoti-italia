# Terremoti Italia

Webapp locale: terremoti INGV (con archivio proprio dal 1985) e allerte meteo-idro della Protezione Civile su tutta l'Italia.
Stesso stile e stesso motore di Digital Twin Palermo, copiati (non modificati) da `GitHub-Clone/coseerobe/DigitalTwin`.

    node server.js   # http://127.0.0.1:8766/  (solo 127.0.0.1)
    npm run test:js  # test della webapp e del server
    node scripts/chiusura.mjs js/app.js   # elenca i file raggiunti dall'app; esce 1 se manca un import

Cosa c'è: strato terremoti (filtri, scheda con i grafici degli eventi, popup grande, minimappa), strato allerte DPC (187 zone, Oggi/Domani),
strumenti in mappa (vista Italia, posizione, schermo intero, stampa, tema, zoom), italiano e inglese.

**Grafici interattivi**: nelle schede degli eventi ogni grafico è dinamico. Passando il mouse (o portando il focus con Tab)
su un evento, su una barra o su una sequenza, l'evento o il gruppo di eventi si accende in mappa con un alone; se c'è un
popup aperto, si chiude da solo per non coprire il punto. I grafici molto fitti (unità «anno», migliaia di eventi) usano
un unico rilevatore del puntatore invece di un nodo per evento, così restano reattivi. Il codice sta in
`js/core/evidenza-eventi.js` e in `js/layers/scheda-terremoti-dom.js`.

Nel pannello Strati, sezione **Territorio**, lo strato **Confini comunali** (spento all'avvio) disegna i bordi dei comuni:
passando il mouse su un comune si leggono nome, provincia, regione, codice ISTAT e il totale dei terremoti dal 1985, il confine
si evidenzia, e un clic apre la scheda dei suoi terremoti. Le stesse cose (tooltip ed evidenza) valgono sull'area scelta nella
ricerca per regione, provincia o comune, anche con lo strato spento.

**Cerca eventi attorno a un punto**: in fondo alla legenda in mappa l'interruttore accende la ricerca e mostra il cursore del
raggio (200 m – 50 km, 10 km all'avvio) con l'interruttore «Mostra il cerchio in mappa». Da acceso, un clic sulla mappa disegna
il cerchio e apre la scheda con i terremoti entro il raggio, dal più vicino, prendendoli dagli strati accesi (tempo reale e
archivio storico) e rispettandone i filtri; le righe sono cliccabili e aprono la scheda dell'evento. La lista si ferma ai 50
eventi più vicini (il totale è nel badge), il cerchio si inquadra per intero e lo stato resta nel browser. Spento, il clic
torna ad aprire la scheda del punto come prima.

**Minimappa**: in basso a destra, sopra il logo con le coordinate, una panoramica dell'Italia su base OSM standard con il
riquadro della vista corrente; un clic o un trascinamento sposta la mappa principale allo zoom in uso. La freccia la riduce a
una barra «Minimappa» (non sparisce) e la barra la riapre. Compare su
desktop (su telefono il posto è della scheda); il logo con le coordinate sta sopra la scala, così non la copre. Logo e
minimappa hanno la stessa larghezza e lo zoom è su una riga sotto le coordinate.

Come aggiungere un layer: un modulo in `js/layers/` con `id, titolo, gruppo, aggiungiSorgenti, aggiungiLayer, strati, scheda`
(vedi `js/layers/allerte.js`), poi aggiungerlo a `MODULI` in `js/app.js`; i testi nuovi vanno in `js/locales/it.json` e `en.json`
(`npm run test:js` dice cosa manca). Un layer acceso di default deve avere `visibility: 'visible'` esplicita.

Il server locale risponde 200 vuoto agli intervalli di glifi mancanti (`/fonts/glyphs/...`): un 404 farebbe fallire interi tile a zoom basso.

## Archivio dei terremoti

I terremoti stanno in `dati/terremoti.sqlite` (fuori da git). Il server lo aggiorna ogni 2 minuti con gli ultimi 30 giorni (magnitudo ≥ 1); la mappa legge `GET /terremoti?da=<ms>&a=<ms>&magmin=<n>&limite=<n>`. Il pulsante «Aggiorna ora» in legenda chiama `GET /aggiorna` (o `POST`): il server rilegge subito l'INGV e risponde `{ cambiati, aggiornato }`, poi la mappa ricarica i terremoti.

Senza il server (GitHub Pages, un semplice server statico come Live Server) la finestra viva — ultimi 30 giorni — la chiede il browser direttamente all'INGV (`webservices.ingv.it`, CORS aperto, pagine di 1000). L'archivio per anno e lo snapshot restano per i periodi storici e come ripiego se l'INGV non risponde: senza questo, l'ultima ora e le ultime 24 ore possono restare vuote perché quei file sono aggiornati di rado.

`GET /terremoti/riepilogo?da=<ms>&a=<ms>&magmin=<n>` restituisce solo conteggi: `totale`, `perMagnitudo` (classi da 0,1) e `perMese` (mesi UTC, con la magnitudo massima). Lo usano la serie «per anno» (dal 1985) e il confronto tra anni.

Nell'app lo strato **Terremoti storici (archivio)** (pannello Strati, spento all'avvio, indipendente dal tempo reale e visibile insieme a esso) mostra in mappa un anno qualsiasi dal 1985 (magnitudo minima 2, 2,5, 3, 4 o 5; a M ≥ 2 gli anni più attivi superano i 5000 eventi della mappa e compare l'avviso) e, nella sua legenda, confronta due anni. Il confronto dichiara sopra la tabella le condizioni (tutta l'Italia o lo stesso territorio, la stessa profondità, la stessa magnitudo minima) e mostra eventi, eventi al giorno, magnitudo massima ed equivalente, energia (somma dei momenti sismici, in N·m), mese più attivo con la sua quota e istogramma per classe. Il codice sta in `js/layers/terremoti-storico.js` e `js/layers/terremoti-archivio.js`.

### Confrontare due anni

Un confronto anno su anno ha senso solo a parità di dati e di rete di rilevamento:

- **Completezza.** L'archivio parte dal 1985 a M ≥ 2, ma prima del 2005 la rete registrava molti meno eventi piccoli: a M ≥ 2 gli anni recenti sembrano più sismici solo perché il catalogo è migliorato. Per i confronti che includono anni prima del 2005 usare M ≥ 3 (soglia indicativa): il pannello lo ricorda da solo.
- **Metriche.** Il conteggio da solo inganna: il confronto affianca eventi al giorno (per l'anno in corso, parziale), magnitudo massima, magnitudo equivalente, energia cumulata (dominata dagli eventi forti) e distribuzione per classi di magnitudo.
- **Sequenze.** Un anno con una scossa forte e centinaia di repliche ha un conteggio gonfiato: la riga «Mese più attivo» mostra quanto pesa un solo mese. Il confronto non elimina le repliche (declustering): serve a leggere la differenza, non a stimare il rischio.
- **Grafici.** Sotto la tabella: barre degli eventi per anno dal 1985 (scala logaritmica) con la linea della magnitudo massima dell'anno, e la cumulata mese per mese dei due anni sulla stessa scala (per l'anno in corso la linea si ferma a oggi). La casella **Densità** colora in mappa celle esagonali con la differenza tra i due anni — blu se ci sono più eventi in A, arancio se in B — e usa tutti gli eventi, non solo i 5000 cerchi disegnati.
- **Lettura.** Più eventi non significano più terremoti né più rischio: la sismicità di fondo va letta su periodi lunghi e con la stessa soglia. La nota sotto la tabella lo dice anche a chi usa l'app.

Il tab **Storico** del rail apre il pannello degli eventi dell'archivio: senza un evento scelto spiega come attivare lo strato «Terremoti storici (archivio)»; con un evento mostra la sua scheda e la serie degli ultimi anni. Senza server (sito statico o GitHub Pages) la serie degli ultimi 5 anni si ricostruisce dai file per anno dell'archivio, come fa il confronto.

**Terremoti del comune**: un clic su un comune in mappa (senza un cerchio di terremoto sotto il dito) apre la scheda «Terremoti nel comune»: eventi degli ultimi 30 giorni (M ≥ 1), conteggio dell'anno in corso e totale dal 1985 (M ≥ 2), anno più sismico, evento più forte con il link alla scheda INGV e la serie anno per anno. Si contano solo gli epicentri dentro il confine comunale: `GET /terremoti` (e `/riepilogo`) accettano anche `bbox=<ovest>,<sud>,<est>,<nord>` per scaricare solo l'area del comune. Il codice sta in `js/layers/scheda-comune.js` e nella `scheda` di `js/layers/terremoti.js`; lo strato trasparente che rende cliccabili i comuni (`aree-hit`) lo aggiunge `js/core/ricerca.js`.

Storico dall'INGV (dal 1985, magnitudo ≥ 2, riprendibile):

    node --no-warnings scripts/carica-storico.mjs --da 1985 --magmin 2

Provato il 2026-10-26: 108.892 eventi (1985-2026) in 62 s, 26 MB. Controlli a campione: Norcia Mw 6,5 (2016-10-30), L'Aquila Mw 6,1 (2009-04-06), Accumoli Mw 6,0 (2016-08-24). L'area comprende anche eventi vicino al confine (es. Croazia).
