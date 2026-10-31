# Crediti e licenze

**Terremoti Italia** riusa l'interfaccia e il motore di una webapp dello stesso autore (stile, scheda, legenda, pannello strati, grafici dei terremoti).

## Dati
- **Terremoti**: INGV, Istituto Nazionale di Geofisica e Vulcanologia, servizio web FDSN event (https://terremoti.ingv.it/). Gli eventi si scaricano dal servizio pubblico e si conservano nell'archivio locale `dati/terremoti.sqlite` (non incluso nel repository). Verificare le condizioni d'uso dell'INGV prima di ripubblicare i dati.
- **ShakeMaps**: INGV, mappe dello scuotimento del suolo per terremoti M ≥ 3.0 (https://data.ingv.it/dataset/58#additional-metadata), DOI 10.13127/shakemaps, licenza CC BY 4.0.
- **Pericolosità sismica**: INGV, modello MPS04 (https://zonesismiche.mi.ingv.it/), griglia di ag a passo 0,02° (OPCM 3519/2006 All. 1b), DOI 10.13127/sh/mps04/ag. Citazione: Stucchi M., Meletti C., Montaldo V., Akinci A., Faccioli E., Gasperini P., Malagnini L., Valensise G. (2004). Le fasce poligonali (GeoJSON `pericolosità_simisca_0,002_aree`, 12 classi di ag da 0,025 g) sono state verificate sulla griglia INGV (coincidenza 95,2% dei punti, scarto massimo 0,012 g) e impacchettate in `dati/pericolosita-mps04.pmtiles` con `scripts/genera-pericolosita.py`. Verificare le condizioni d'uso dell'INGV prima di ripubblicare i dati.
- **ShakeMaps**: INGV, mappe dello scuotimento del suolo per terremoti M ≥ 3.0 (https://data.ingv.it/dataset/58#additional-metadata), DOI 10.13127/shakemaps, licenza CC BY 4.0.
- **Pericolosità sismica**: INGV, modello MPS04 (https://zonesismiche.mi.ingv.it/), griglia di ag a passo 0,02° (OPCM 3519/2006 All. 1b), DOI 10.13127/sh/mps04/ag. Citazione: Stucchi M., Meletti C., Montaldo V., Akinci A., Faccioli E., Gasperini P., Malagnini L., Valensise G. (2004). Le fasce poligonali (GeoJSON `pericolosità_simisca_0,002_aree`, 12 classi di ag da 0,025 g) sono state verificate sulla griglia INGV (coincidenza 95,2% dei punti, scarto massimo 0,012 g) e impacchettate in `dati/pericolosita-mps04.pmtiles` con `scripts/genera-pericolosita.py`. Verificare le condizioni d'uso dell'INGV prima di ripubblicare i dati.
- **Classificazione sismica**: Dipartimento della Protezione Civile, elenco della classificazione sismica dei comuni aggiornato a maggio 2025 (https://rischi.protezionecivile.gov.it/it/sismico/attivita/classificazione-sismica/). La tabella `dati/classificazione-sismica.json` (codice ISTAT → zona) è ricavata dal CSV ufficiale con `scripts/classificazione-sismica.mjs`; verificare le condizioni d'uso prima di ripubblicare i dati.
- **Allerte meteo-idro**: Dipartimento della Protezione Civile, bollettino di criticità nazionale, repository `pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica`, licenza CC BY 4.0.
- **Basi cartografiche**: © OpenStreetMap contributors, OpenFreeMap / OpenMapTiles; altre basi come indicate nel selettore (Esri, Google, EOX Sentinel-2, NASA GIBS, OpenTopoMap).

## Librerie
- MapLibre GL JS (BSD-3-Clause), PMTiles (BSD-3-Clause), copiate in `js/vendor/`.
- qgis_headless_wsl2 (pigreco): QGIS headless su WSL2, https://github.com/pigreco/qgis_headless_wsl2 · video https://www.youtube.com/watch?v=FQEmhktDRaQ
- Font Montserrat e Atkinson in `css/fonts/`; font delle etichette Noto Sans in `fonts/glyphs/` (copiati da OpenFreeMap).

## Stampa poster (PNG/PDF)
L'impaginazione della stampa poster (banner, legenda a riquadro, scala, rosa dei venti) è ispirata a **Layout Composer** di Defani Arman Alfitriansyah (MIT, https://github.com/Defani/Layout-Composer). Nessun codice è stato copiato; il generatore PDF e il disegno su canvas sono scritti per questa app. I dati dei terremoti sono INGV, citati nel piede della stampa insieme alle attribuzioni delle basi cartografiche attive.
