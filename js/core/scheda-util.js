// Piccole utilità per i moduli che costruiscono le voci della scheda.
// Nuovo layer: la checklist (strato hit sempre presente, `scheda.vicini`, peso → tab) è in docs/NUOVO_LAYER.md.

export const primo = (trovati, idLayer) => trovati.find(f => f.layer.id === idLayer) ?? null;

export const tutti = (trovati, idLayer) => trovati.filter(f => f.layer.id === idLayer);

// Il più vicino al punto cliccato tra i punti (geometria Point) di un layer.
export function piuVicino(trovati, idLayer, { lng, lat }) {
  const punti = tutti(trovati, idLayer);
  if (!punti.length) return null;
  const k = Math.cos(lat * Math.PI / 180);
  const d2 = f => ((f.geometry.coordinates[0] - lng) * k) ** 2 + (f.geometry.coordinates[1] - lat) ** 2;
  return punti.reduce((migliore, f) => (d2(f) < d2(migliore) ? f : migliore));
}

// Distanza in metri tra due punti [lon, lat], approssimata (piano locale): basta per poche centinaia di metri.
const M_PER_GRADO = 111320;
export function distanzaApprossimataM([lon1, lat1], [lon2, lat2]) {
  const k = Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.hypot((lon2 - lon1) * k, lat2 - lat1) * M_PER_GRADO;
}

const MAX_PIXEL_VICINI = 500; // a zoom alti 300 m sono molti pixel: la ricerca resta limitata alla parte visibile della mappa

// Punti (geometria Point) di `layers` entro `raggio` metri da `lngLat`, dal più vicino, al massimo `max`, ciascuno con `distanzaM`.
// Sono quelli disegnati sulla mappa (gli strati di interrogazione sono sempre presenti, anche a strato spento). `esclusi` = feature già trovate sotto il clic.
export function featureVicine(map, lngLat, layers, { raggio, max = 5 }, esclusi = []) {
  if (!layers.length) return [];
  const c = map.project(lngLat);
  const dLon = raggio / (M_PER_GRADO * Math.cos(lngLat.lat * Math.PI / 180));
  const r = Math.min(MAX_PIXEL_VICINI, Math.ceil(Math.abs(map.project({ lng: lngLat.lng + dLon, lat: lngLat.lat }).x - c.x)));
  const chiave = f => `${f.layer.id}|${f.properties?.id ?? f.geometry.coordinates}`;
  const visti = new Set(esclusi.map(chiave));
  const vicini = [];
  for (const f of map.queryRenderedFeatures([[c.x - r, c.y - r], [c.x + r, c.y + r]], { layers })) {
    if (f.geometry?.type !== 'Point' || visti.has(chiave(f))) continue;
    visti.add(chiave(f)); // un punto tagliato dai tile può comparire due volte
    const distanza = distanzaApprossimataM([lngLat.lng, lngLat.lat], f.geometry.coordinates);
    if (distanza <= raggio) vicini.push(Object.assign(f, { distanzaM: distanza }));
  }
  return vicini.sort((a, b) => a.distanzaM - b.distanzaM).slice(0, max);
}

export const presente = v => v != null && v !== '' && v !== 'NULL';

// righe {etichetta, valore} solo per i valori presenti
export const righe = coppie =>
  coppie.filter(([, valore]) => presente(valore)).map(([etichetta, valore]) => ({ etichetta, valore: String(valore) }));
