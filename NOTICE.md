# Crediti e licenze

**Terremoti Italia** riusa l'interfaccia e il motore di una webapp dello stesso autore (stile, scheda, legenda, pannello strati, grafici dei terremoti).

## Dati
- **Terremoti**: INGV, Istituto Nazionale di Geofisica e Vulcanologia, servizio web FDSN event (https://terremoti.ingv.it/). Gli eventi si scaricano dal servizio pubblico e si conservano nell'archivio locale `dati/terremoti.sqlite` (non incluso nel repository). Verificare le condizioni d'uso dell'INGV prima di ripubblicare i dati.
- **ShakeMaps**: INGV, mappe dello scuotimento del suolo per terremoti M ≥ 3.0 (https://data.ingv.it/dataset/58#additional-metadata), DOI 10.13127/shakemaps, licenza CC BY 4.0.
- **Allerte meteo-idro**: Dipartimento della Protezione Civile, bollettino di criticità nazionale, repository `pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica`, licenza CC BY 4.0.
- **Basi cartografiche**: © OpenStreetMap contributors, OpenFreeMap / OpenMapTiles; altre basi come indicate nel selettore (Esri, Google, EOX Sentinel-2, NASA GIBS, OpenTopoMap).

## Librerie
- MapLibre GL JS (BSD-3-Clause), PMTiles (BSD-3-Clause), copiate in `js/vendor/`.
- Font Montserrat e Atkinson in `css/fonts/`; font delle etichette Noto Sans in `fonts/glyphs/` (copiati da OpenFreeMap).
