// Cerchio del raggio dei punti vicini (vedi raggio-vicini.js): area colorata e bordo in evidenza attorno al punto cliccato,
// con (a scheda chiusa) il numero di eventi trovati scritto al centro.
const SORGENTE = 'cerchio-raggio';
const STRATI = ['cerchio-raggio-area', 'cerchio-raggio-alone', 'cerchio-raggio-linea'];
const COLORE = '#c2410c'; // arancio scuro dell'accento: si legge sulla base chiara e su quella scura
const M_PER_GRADO = 111320;
const PASSI = 96;

// Anello chiuso (LineString) a `raggio` metri da `lngLat`, sul piano locale come distanzaApprossimataM.
export function cerchioRaggio({ lng, lat }, raggio, passi = PASSI, tipo = 'LineString') {
  const k = Math.cos(lat * Math.PI / 180);
  const coordinate = Array.from({ length: passi + 1 }, (_, i) => {
    const a = (i % passi) / passi * 2 * Math.PI;
    return [lng + Math.cos(a) * raggio / (M_PER_GRADO * k), lat + Math.sin(a) * raggio / M_PER_GRADO];
  });
  return { type: 'Feature', properties: {}, geometry: tipo === 'Polygon' ? { type: 'Polygon', coordinates: [coordinate] } : { type: 'LineString', coordinates: coordinate } };
}

const vuoto = { type: 'FeatureCollection', features: [] };

function assicura(map) {
  if (map.getSource(SORGENTE)) return;
  map.addSource(SORGENTE, { type: 'geojson', data: vuoto });
  // area velata, alone chiaro e bordo pieno: si leggono su qualsiasi sfondo
  map.addLayer({ id: STRATI[0], type: 'fill', source: SORGENTE, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': COLORE, 'fill-opacity': 0.12 } });
  map.addLayer({ id: STRATI[1], type: 'line', source: SORGENTE, filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#fff', 'line-width': 6, 'line-opacity': 0.8 } });
  map.addLayer({ id: STRATI[2], type: 'line', source: SORGENTE, filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': COLORE, 'line-width': 3 } });
}

export function mostraCerchio(map, lngLat, raggio) {
  assicura(map);
  map.getSource(SORGENTE).setData({ type: 'FeatureCollection', features: [cerchioRaggio(lngLat, raggio, PASSI, 'Polygon'), cerchioRaggio(lngLat, raggio)] });
  for (const id of STRATI) map.moveLayer(id);
}

export function nascondiCerchio(map) {
  nascondiEtichetta();
  map.getSource(SORGENTE)?.setData(vuoto);
}

// Numero di eventi trovati, al centro del cerchio: serve a scheda chiusa, quando la lista non si vede.
let etichetta = null;

export function mostraEtichetta(map, lngLat, testo) {
  if (!etichetta) {
    const nodo = document.createElement('div');
    nodo.className = 'cerchio-etichetta';
    etichetta = new maplibregl.Marker({ element: nodo });
  }
  etichetta.getElement().textContent = testo;
  etichetta.setLngLat(lngLat).addTo(map);
}

export function nascondiEtichetta() {
  etichetta?.remove();
}
