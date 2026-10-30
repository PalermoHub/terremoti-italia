import { t, tl } from '../core/i18n.js';
import { EVENTO_TABELLA } from '../core/tabella-dati.js';
import { registraTooltipStrati } from '../core/tooltip.js';
import { colonneTabellaTerremoti, modelloPopupTerremoto } from './scheda-terremoti.js';
import { coloreProfondita, espressioneColoreProfondita } from '../core/profondita.js';
import { creaPopupTerremoti, righeTooltip } from './terremoti-popup.js';
import { eventiPeriodo, pannelloPeriodo, elencoEventi, legendaProfondita, legendaMappa } from './terremoti-periodo.js';

// Terremoti per profondità: gli eventi di un anno o di un periodo dell'archivio, in tutta Italia, con il colore che dice la
// profondità dell'ipocentro e la grandezza che dice la magnitudo. Spento all'avvio; non si aggiorna da solo.
const SRC = 'terremoti-profondita';
const PUNTI = 'terremoti-profondita-punti';
const VUOTO = { type: 'FeatureCollection', features: [] };
const coloreMappa = espressioneColoreProfondita();

let mappa = null;
let acceso = false;
let primaVolta = true;
let pannello = null;
let legenda = null;
let eventi = [];
let elenco = null;
let richiesta = 0;
const popup = creaPopupTerremoti();

async function carica({ periodo, mag }) {
  const mia = ++richiesta;
  const { eventi: nuovi, troncato } = await eventiPeriodo(periodo, mag);
  if (mia !== richiesta) return null;
  eventi = nuovi;
  mappa?.getSource(SRC)?.setData({
    type: 'FeatureCollection',
    features: eventi.map(e => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lon, e.lat] }, properties: { ...e, prof: e.prof ?? 0, colore: coloreProfondita(e.prof ?? 0) } })),
  });
  popup.chiudi();
  elenco?.aggiorna();
  document.dispatchEvent(new Event(EVENTO_TABELLA));
  return { n: eventi.length, troncato };
}

function creaPannello() {
  elenco = elencoEventi(() => eventi, () => mappa);
  legenda = legendaMappa('terremoti-profondita', t('terremoti.prof.titolo'), [legendaProfondita()]);
  pannello = pannelloPeriodo({ titolo: t('terremoti.prof.titolo'), alMostra: carica, ancora: [legendaProfondita(), elenco.nodo] });
}

export const nodoMappa = () => pannello?.nodo ?? null;

export default {
  id: 'terremoti-profondita',
  titolo: 'Terremoti per profondità',
  gruppo: 'terremoti-gruppo',
  senzaIntestazione: true,
  sezione: 'Terremoti per profondità',
  sezioniFisse: true,
  argomento: { titolo: 'Terremoti per profondità', descrizione: 'I terremoti di un anno o di un periodo dell\'archivio INGV in tutta Italia: il colore dice la profondità dell\'ipocentro, la grandezza la magnitudo.' },
  aggiungiSorgenti(map) {
    map.addSource(SRC, { type: 'geojson', data: VUOTO, attribution: '<a href="https://terremoti.ingv.it/" target="_blank" rel="noopener">INGV</a>' });
  },
  aggiungiLayer(map) {
    mappa = map;
    // i più forti sopra gli altri; spento all'avvio
    map.addLayer({
      id: PUNTI, type: 'circle', source: SRC, layout: { visibility: 'none', 'circle-sort-key': ['get', 'mag'] },
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['*', ['get', 'raggio'], 0.8], 12, ['*', ['get', 'raggio'], 1.6]], 'circle-color': coloreMappa, 'circle-opacity': 0.7, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 0.6 },
    });
    map.on('click', e => {
      if (map.getLayoutProperty(PUNTI, 'visibility') === 'none') return;
      const f = [...map.queryRenderedFeatures(e.point, { layers: [PUNTI] })].sort((a, b) => b.properties.mag - a.properties.mag)[0];
      if (f) popup.apri(map, { ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }, e.point);
    });
    registraTooltipStrati(map, [{
      layers: [PUNTI], icona: 'terremoto', sezione: 'Terremoti per profondità', colore: p => p.colore,
      modello: p => {
        const m = modelloPopupTerremoto(p);
        return { titolo: m.titolo, sottotitolo: tl(m.sottotitolo), badge: m.badge, elenco: righeTooltip(m, p) };
      },
    }]);
    map.on('mouseenter', PUNTI, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', PUNTI, () => { map.getCanvas().style.cursor = ''; });
  },
  strati: [{
    id: 'terremoti-profondita', etichetta: 'Terremoti per profondità', layers: [PUNTI], attivo: false, legendaPannello: '.lg-terremoti-profondita',
    suCambio(attivo) {
      acceso = attivo;
      if (legenda) legenda.hidden = !attivo;
      if (!attivo) popup.chiudi();
      else if (primaVolta && pannello) { primaVolta = false; pannello.mostra(); } // la prima volta si vede subito l'anno scorso
      document.dispatchEvent(new Event(EVENTO_TABELLA));
    },
  }],
  tabella: {
    id: 'terremoti-profondita',
    etichetta: t('tabella.layer.terremotiProfondita'),
    fonte: t('tabella.fonte.ingvLocale'),
    licenza: 'CC BY 4.0',
    colonne: () => colonneTabellaTerremoti({ anno: true }),
    righe: () => eventi,
    attivo: () => acceso,
    apri: p => mappa?.flyTo({ center: [p.lon, p.lat], zoom: Math.max(mappa.getZoom(), 9) }),
  },
  pannello: creaPannello,
};
