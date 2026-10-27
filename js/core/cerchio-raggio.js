// Cerchio del raggio dei punti vicini (vedi raggio-vicini.js): linea sottile tratteggiata attorno al punto cliccato.
const SORGENTE = 'cerchio-raggio';
const STRATI = ['cerchio-raggio-alone', 'cerchio-raggio-linea'];
const M_PER_GRADO = 111320;
const PASSI = 96;

// Anello chiuso (LineString) a `raggio` metri da `lngLat`, sul piano locale come distanzaApprossimataM.
export function cerchioRaggio({ lng, lat }, raggio, passi = PASSI) {
  const k = Math.cos(lat * Math.PI / 180);
  const coordinate = Array.from({ length: passi + 1 }, (_, i) => {
    const a = (i % passi) / passi * 2 * Math.PI;
    return [lng + Math.cos(a) * raggio / (M_PER_GRADO * k), lat + Math.sin(a) * raggio / M_PER_GRADO];
  });
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coordinate } };
}

const vuoto = { type: 'FeatureCollection', features: [] };

function assicura(map) {
  if (map.getSource(SORGENTE)) return;
  map.addSource(SORGENTE, { type: 'geojson', data: vuoto });
  // un alone chiaro sotto la linea scura: si legge su qualsiasi sfondo
  map.addLayer({ id: STRATI[0], type: 'line', source: SORGENTE, paint: { 'line-color': '#fff', 'line-width': 3, 'line-opacity': 0.55 } });
  map.addLayer({ id: STRATI[1], type: 'line', source: SORGENTE, paint: { 'line-color': '#222', 'line-width': 1.2, 'line-dasharray': [3, 2] } });
}

export function mostraCerchio(map, lngLat, raggio) {
  assicura(map);
  map.getSource(SORGENTE).setData({ type: 'FeatureCollection', features: [cerchioRaggio(lngLat, raggio)] });
  for (const id of STRATI) map.moveLayer(id);
}

export function nascondiCerchio(map) {
  map.getSource(SORGENTE)?.setData(vuoto);
}
