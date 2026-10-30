// «Cerca eventi attorno a un punto», forma poligono: con la ricerca accesa e la forma «poligono» i clic sulla mappa
// aggiungono vertici (il clic non apre la scheda del luogo); si chiude con doppio clic o toccando il primo vertice.
// Chiuso, l'anello diventa l'area della ricerca e la Lista Terremoti mostra solo gli eventi dentro. Vale per la sessione.
import { EVENTO_RAGGIO, EVENTO_POLIGONO_ANNULLA, poligonoAttivo, cerchioVisibile, impostaAreaPoligono, centroERaggioPoligono } from './raggio-vicini.js';
import { catturaClic } from './cattura-clic.js';
import { EVENTO_TABELLA } from './tabella-dati.js';

const SORGENTE = 'poligono-ricerca';
const STRATI = ['poligono-ricerca-area', 'poligono-ricerca-alone', 'poligono-ricerca-linea', 'poligono-ricerca-vertici'];
const COLORE = '#c2410c'; // lo stesso arancio del cerchio
const VERTICI_MIN = 3;
const SOGLIA_DOPPIO_PX = 6; // i due clic di un doppio clic cadono quasi sullo stesso punto: il secondo è un vertice di troppo
const SOGLIA_CHIUSURA_PX = 12; // un clic entro questa distanza dal primo vertice chiude l'area

const vuoto = { type: 'FeatureCollection', features: [] };

// Stato dal disegno: vertici fissati e, se chiuso, anello. Pura, per i test.
export function chiudiAnello(vertici) {
  return vertici.length >= VERTICI_MIN ? [...vertici, vertici[0]] : null;
}

// GeoJSON del disegno: area (se chiuso), linea (aperta o chiusa) e un punto per vertice
export function disegnoPoligono(vertici, chiuso) {
  const features = vertici.map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } }));
  if (vertici.length >= 2) {
    const linea = chiuso ? [...vertici, vertici[0]] : vertici;
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: linea } });
  }
  if (chiuso && vertici.length >= VERTICI_MIN) features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...vertici, vertici[0]]] } });
  return { type: 'FeatureCollection', features };
}

function assicura(map) {
  if (map.getSource(SORGENTE)) return;
  map.addSource(SORGENTE, { type: 'geojson', data: vuoto });
  map.addLayer({ id: STRATI[0], type: 'fill', source: SORGENTE, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': COLORE, 'fill-opacity': 0.12 } });
  map.addLayer({ id: STRATI[1], type: 'line', source: SORGENTE, filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#fff', 'line-width': 6, 'line-opacity': 0.8 } });
  map.addLayer({ id: STRATI[2], type: 'line', source: SORGENTE, filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': COLORE, 'line-width': 3 } });
  map.addLayer({ id: STRATI[3], type: 'circle', source: SORGENTE, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': COLORE, 'circle-stroke-width': 2.5 } });
}

export function collegaPoligono(map) {
  let vertici = [];
  let chiuso = false;
  let ultimoSync = false; // il disegno era attivo all'ultimo controllo

  const disegna = () => {
    assicura(map);
    map.getSource(SORGENTE).setData(disegnoPoligono(vertici, chiuso));
    for (const id of STRATI) map.moveLayer(id);
    mostraNascondi();
  };
  // l'interruttore «Mostra il poligono in mappa» della legenda
  const mostraNascondi = () => {
    for (const id of STRATI) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', cerchioVisibile() ? 'visible' : 'none');
  };
  const azzera = () => {
    vertici = [];
    chiuso = false;
    impostaAreaPoligono(null);
    map.getSource(SORGENTE)?.setData(vuoto);
  };
  const chiudi = () => {
    if (vertici.length < VERTICI_MIN) return;
    chiuso = true;
    const anello = chiudiAnello(vertici);
    impostaAreaPoligono(anello);
    disegna();
    document.dispatchEvent(new Event(EVENTO_TABELLA));
    const { centro } = centroERaggioPoligono(anello);
    // la scheda dell'area si apre a destra, con l'elenco degli eventi; dopo il gesto, o il doppio clic di MapLibre ferma lo spostamento della vista
    setTimeout(() => map.fire('click', { point: map.project(centro), lngLat: centro, poligono: anello }), 0);
  };

  const clic = e => {
    if (chiuso) { azzera(); document.dispatchEvent(new Event(EVENTO_TABELLA)); } // un nuovo clic dopo la chiusura ricomincia da capo
    const primo = vertici[0] && map.project(vertici[0]);
    if (primo && vertici.length >= VERTICI_MIN && Math.hypot(primo.x - e.point.x, primo.y - e.point.y) <= SOGLIA_CHIUSURA_PX) {
      chiudi();
      return;
    }
    vertici.push([e.lngLat.lng, e.lngLat.lat]);
    disegna();
  };

  // doppio clic: chiude (MapLibre ha già mandato i due clic, il secondo ha aggiunto un vertice doppio)
  map.on('dblclick', e => {
    if (!poligonoAttivo() || chiuso) return;
    e.preventDefault(); // niente zoom del doppio clic
    if (vertici.length > 1) {
      const a = map.project(vertici.at(-1));
      const b = map.project(vertici.at(-2));
      if (Math.hypot(a.x - b.x, a.y - b.y) <= SOGLIA_DOPPIO_PX) vertici.pop();
    }
    chiudi();
  });

  const sincronizza = () => {
    mostraNascondi();
    const attivo = poligonoAttivo();
    if (attivo) catturaClic(clic);
    else if (ultimoSync) catturaClic(null);
    if (!attivo && (vertici.length || chiuso)) azzera();
    if (attivo !== ultimoSync) document.dispatchEvent(new Event(EVENTO_TABELLA)); // cambiata la forma: l'area vecchia non vale, la lista si rifà
    ultimoSync = attivo;
  };
  document.addEventListener(EVENTO_RAGGIO, sincronizza);
  document.addEventListener(EVENTO_POLIGONO_ANNULLA, () => {
    azzera();
    document.dispatchEvent(new Event(EVENTO_TABELLA));
  });
  sincronizza();
}
