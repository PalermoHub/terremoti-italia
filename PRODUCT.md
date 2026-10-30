# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pubblico misto che arriva con scopi diversi:
- **Cittadini curiosi**: vogliono sapere cosa è successo di recente vicino a loro.
- **Appassionati di dati aperti** (community Open Data Sicilia): esplorano, confrontano periodi, condividono viste.
- **Tecnici e ricercatori**: lavorano sull'archivio 1985–oggi, faglie e pericolosità.
- **Giornalisti e divulgatori**: cercano una vista o un grafico da citare e condividere.

## Product Purpose

Mappa web dei terremoti in Italia: tempo reale INGV (ultimi 30 giorni), archivio proprio dal 1985 (109.612 eventi M≥2) e allerte meteo-idro della Protezione Civile. Successo = capire in pochi secondi cosa è successo e dove, e poter risalire a dati, fonti e confronti senza account.

## Positioning

Non è un secondo terremoti.ingv.it: l'archivio storico, il confronto fra due periodi, le serie annuali e gli strati di faglie (ITHACA, EGDI, DISS), pericolosità MPS04 e classificazione sismica stanno nella stessa mappa, con stato condivisibile in URL.

## Operating Context

Uso su desktop e telefono, in italiano e inglese. Le viste si condividono tramite URL, si stampano o si esportano. Server locale `node server.js` (porta 8766) per archivio e aggiornamento; in produzione sito statico (GitHub Pages) che chiede gli eventi vivi direttamente all'INGV.

## Capabilities and Constraints

- Strati in quattro gruppi: Terremoti, Faglie, Protezione Civile, Territorio.
- Scheda evento, scheda comune, ricerca per regione/provincia/comune, ricerca attorno a un punto, timeline con riproduzione, tabella dati, modale Info (metodologia, guida, crediti).
- Vincolo: l'app è solo informativa e non sostituisce le comunicazioni ufficiali (avviso sempre visibile).
- Vincolo: ogni testo nuovo in italiano e in inglese (`js/locales/it.json`, `en.json`).
- Vincolo: ogni fonte nuova va citata nel modale Info (Credits/Metodologia).
- Confronti storici: prima del 2005 la rete rilevava meno eventi piccoli, quindi M≥3 per anni precedenti.

## Brand Commitments

Nome «Terremoti Italia»; logo Open Data Sicilia in basso a destra; font Montserrat (marca) e Atkinson Hyperlegible (leggibilità dei dati); accento ambra.

Scelta di restyling (2026-10-30): resta nel sistema attuale, portato al livello migliore della categoria («categoria standard, eseguita fino in fondo»). Metro di qualità: Mapbox Studio / Felt, USGS Earthquake Map, Google Maps / Apple Maps.

## Evidence on Hand

Dati reali INGV, DPC, ShakeMap, MPS04 con licenze e DOI in `NOTICE.md`. Nessuna testimonianza, cliente o benchmark: non inventarne.

## Product Principles

1. Prima il dato e la sua fonte: ogni numero a schermo è tracciabile.
2. Informare senza allarmare: tono sobrio, mai sensazionalistico.
3. Un solo contesto alla volta: pochi pannelli, la mappa resta protagonista.
4. Condivisibile e riproducibile: lo stato sta in URL.
5. Prudenza scientifica: dichiarare le condizioni di ogni confronto.

## Accessibility & Inclusion

Italiano e inglese. Atkinson Hyperlegible per i dati; Lighthouse accessibilità 96 (mobile, 2026-10-30). Obiettivo: bersagli tocco ≥ 44px su mobile e testo UI ≥ 12px.
