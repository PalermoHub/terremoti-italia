import { allineaLayerAlPiano } from './allinea-piano.js';
import { VISTA_ITALIA, LIMITI, STILE_AVVIO, paddingVistaItalia } from './config.js';

const STILE_VUOTO = {
  version: 8,
  sources: {},
  layers: [{ id: 'sfondo', type: 'background', paint: { 'background-color': '#f2f2f2' } }],
};

// `suRipiego` viene chiamata se lo stile della base non si carica: la mappa passa a uno sfondo
// vuoto e gli strati dei dati restano utilizzabili.
// 2D: niente rotazione né beccheggio con mouse e tocco. Il 3D li abilita.
function abilitaInclinazione(map, abilita) {
  const f = abilita ? 'enable' : 'disable';
  map.dragRotate[f]();
  map.touchZoomRotate[f + 'Rotation']();
  map.touchPitch[f]();
}

// La vista è 3D se è acceso uno strato 3D (edifici o rilievo); altrimenti torna 2D, a nord e senza inclinazione.
export function aggiorna3D(map) {
  const attivo = ['strato-edifici3d', 'strato-rilievo3d', 'strato-crociferi3d'].some(id => document.getElementById(id)?.checked);
  abilitaInclinazione(map, attivo);
  map.easeTo(attivo ? { pitch: 55, duration: 300 } : { pitch: 0, bearing: 0, duration: 300 });
  document.dispatchEvent(new CustomEvent('vista3d', { detail: attivo }));
}

export function creaMappa(idContenitore, suRipiego = () => {}) {
  const protocollo = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocollo.tile);
  const map = new maplibregl.Map({
    container: idContenitore, bounds: VISTA_ITALIA, fitBoundsOptions: { padding: paddingVistaItalia() }, maxZoom: 19, maxBounds: LIMITI, style: STILE_AVVIO, hash: true,
    pitch: 0, bearing: 0,
  });
  abilitaInclinazione(map, false);
  allineaLayerAlPiano(map);
  let stileCaricato = false;
  let ripiegato = false;
  map.on('style.load', () => { stileCaricato = true; });
  map.on('error', () => {
    if (stileCaricato || ripiegato) return;
    ripiegato = true;
    map.setStyle(STILE_VUOTO);
    suRipiego();
  });
  return map;
}
