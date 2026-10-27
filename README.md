# Terremoti Italia

Webapp locale: terremoti INGV (con archivio proprio dal 1985) e allerte meteo-idro della Protezione Civile su tutta l'Italia.
Stesso stile e stesso motore di Digital Twin Palermo, copiati (non modificati) da `GitHub-Clone/coseerobe/DigitalTwin`.

    node server.js   # http://127.0.0.1:8766/  (solo 127.0.0.1)
    npm run test:js  # test della webapp e del server
    node scripts/chiusura.mjs js/app.js   # elenca i file raggiunti dall'app; esce 1 se manca un import

Cosa c'è: strato terremoti (filtri, scheda con 4 grafici, popup grande, minimappa), strato allerte DPC (187 zone, Oggi/Domani),
strumenti in mappa (vista Italia, posizione, schermo intero, stampa, tema, zoom), italiano e inglese.

Come aggiungere un layer: un modulo in `js/layers/` con `id, titolo, gruppo, aggiungiSorgenti, aggiungiLayer, strati, scheda`
(vedi `js/layers/allerte.js`), poi aggiungerlo a `MODULI` in `js/app.js`; i testi nuovi vanno in `js/locales/it.json` e `en.json`
(`npm run test:js` dice cosa manca). Un layer acceso di default deve avere `visibility: 'visible'` esplicita.

Il server locale risponde 200 vuoto agli intervalli di glifi mancanti (`/fonts/glyphs/...`): un 404 farebbe fallire interi tile a zoom basso.

## Archivio dei terremoti

I terremoti stanno in `dati/terremoti.sqlite` (fuori da git). Il server lo aggiorna ogni 2 minuti con gli ultimi 30 giorni (magnitudo ≥ 1); la mappa legge `GET /terremoti?da=<ms>&a=<ms>&magmin=<n>&limite=<n>`.

`GET /terremoti/riepilogo?da=<ms>&a=<ms>&magmin=<n>` restituisce solo conteggi: `totale`, `perMagnitudo` (classi da 0,1) e `perMese` (mesi UTC, con la magnitudo massima). Lo usano la serie «per anno» (dal 1985) e il confronto tra anni.

Nell'app lo strato **Terremoti storici (archivio)** (pannello Strati, spento all'avvio, indipendente dal tempo reale e visibile insieme a esso) mostra in mappa un anno qualsiasi dal 1985 (magnitudo minima 2-5; a M ≥ 2 gli anni più attivi superano i 5000 eventi della mappa e compare l'avviso) e, nella sua legenda, confronta due anni (eventi, eventi al giorno, magnitudo massima ed equivalente, istogramma per classe). Il codice sta in `js/layers/terremoti-storico.js` e `js/layers/terremoti-archivio.js`.

Storico dall'INGV (dal 1985, magnitudo ≥ 2, riprendibile):

    node --no-warnings scripts/carica-storico.mjs --da 1985 --magmin 2

Provato il 2026-10-26: 108.892 eventi (1985-2026) in 62 s, 26 MB. Controlli a campione: Norcia Mw 6,5 (2016-10-30), L'Aquila Mw 6,1 (2009-04-06), Accumoli Mw 6,0 (2016-08-24). L'area comprende anche eventi vicino al confine (es. Croazia).
