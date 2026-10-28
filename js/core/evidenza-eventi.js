// Evidenza in mappa degli eventi toccati nei grafici: un alone e un punto sopra a tutto, senza cambiare
// la selezione della scheda e senza aggiungere una legenda. Chiude anche i popup aperti, che coprirebbero
// il punto da mostrare. La usano i grafici dei terremoti (scheda-terremoti-dom.js) tramite creaEvidenzaMappa.
import { chiudiPopupAperti } from './tooltip.js';

const SRC = 'grafico-evidenza';
const ALONE = 'grafico-evidenza-alone';
const PUNTI = 'grafico-evidenza-punti';
const COLORE = '#d6246e'; // magenta del marchio: non è un colore usato dagli eventi in mappa
const VUOTO = { type: 'FeatureCollection', features: [] };

// Coordinate di un evento del grafico: le proprietà piatte (lon/lat) o una feature GeoJSON
function coordinate(p) {
  const c = p?.geometry?.coordinates;
  const lon = Number.isFinite(p?.lon) ? p.lon : c?.[0];
  const lat = Number.isFinite(p?.lat) ? p.lat : c?.[1];
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
}

// Gli strati si aggiungono alla prima evidenza e poi restano (vuoti) nella mappa: riaggiungerli a ogni
// passaggio del mouse farebbe lampeggiare il disegno.
function assicuraStrati(map) {
  if (map.getSource(SRC)) return true;
  try {
    map.addSource(SRC, { type: 'geojson', data: VUOTO });
    map.addLayer({
      id: ALONE, type: 'circle', source: SRC,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, ['*', ['get', 'raggio'], 1.25], 10, ['*', ['get', 'raggio'], 1.8]],
        'circle-color': COLORE, 'circle-opacity': 0.16, 'circle-blur': 0.15,
        'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5, 'circle-stroke-opacity': 0.95,
      },
    });
    map.addLayer({
      id: PUNTI, type: 'circle', source: SRC,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 10, 5],
        'circle-color': '#ffffff', 'circle-opacity': 1,
        'circle-stroke-color': COLORE, 'circle-stroke-width': 2,
      },
    });
    return true;
  } catch {
    return false; // stile non ancora pronto: nessuna evidenza, il grafico resta usabile
  }
}

// Se nessuno degli eventi è nella vista, la mappa ci va senza cambiare lo zoom (o inquadra il gruppo):
// il popup chiuso non basta a mostrare un punto che sta fuori dallo schermo.
function portaInVista(map, lista) {
  if (typeof maplibregl === 'undefined' || typeof map.getBounds !== 'function') return;
  let vista;
  try { vista = map.getBounds(); } catch { return; }
  if (lista.some(([lon, lat]) => vista.contains([lon, lat]))) return;
  const durata = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350;
  if (lista.length === 1) {
    map.easeTo({ center: lista[0], duration: durata });
    return;
  }
  const angoli = new maplibregl.LngLatBounds();
  for (const c of lista) angoli.extend(c);
  map.fitBounds(angoli, { padding: 70, maxZoom: map.getZoom(), duration: durata });
}

// Disegna l'evidenza degli eventi `eventi` (proprietà degli eventi o feature GeoJSON). Un elenco vuoto
// toglie l'evidenza; un gruppo numeroso usa aloni più piccoli, così la mappa resta leggibile.
export function evidenziaEventi(map, eventi, { inquadra = true } = {}) {
  if (!map || typeof map.getSource !== 'function') return;
  const visti = new Set();
  const punti = [];
  for (const p of eventi ?? []) {
    const c = coordinate(p);
    if (!c) continue;
    const chiave = p.id != null ? `id:${p.id}` : `${c[0]},${c[1]}`;
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    punti.push({ coordinate: c, evento: p });
  }
  if (!punti.length) { nascondiEvidenzaEventi(map); return; }
  chiudiPopupAperti(); // la scheda del popup coprirebbe gli eventi appena evidenziati
  if (!assicuraStrati(map)) return;
  const scala = punti.length > 400 ? 0.55 : punti.length > 80 ? 0.75 : 1;
  const features = punti.map(({ coordinate: [lon, lat], evento }) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: { raggio: Math.max(6, (Number.isFinite(evento.raggio) ? evento.raggio : 7) * scala) },
  }));
  map.getSource(SRC)?.setData({ type: 'FeatureCollection', features });
  // sempre sopra agli strati dei dati e a quelli dell'evidenza della scheda
  for (const id of [ALONE, PUNTI]) if (map.getLayer(id)) map.moveLayer(id);
  if (inquadra) portaInVista(map, punti.map(p => p.coordinate));
}

export function nascondiEvidenzaEventi(map) {
  map?.getSource?.(SRC)?.setData(VUOTO);
}

// Callback per i grafici: `evidenzia(eventi)` e `nascondi()`, legati alla mappa dello strato.
export function creaEvidenzaMappa(map) {
  return {
    evidenzia: eventi => evidenziaEventi(map, eventi),
    nascondi: () => nascondiEvidenzaEventi(map),
  };
}