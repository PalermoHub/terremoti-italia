// Zoom allo strato: riquadro che contiene le sorgenti dei layer MapLibre dello strato (bounds di tile, o coordinate di un GeoJSON).

function estendi(b, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return b;
  if (!b) return [x, y, x, y];
  return [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
}

function dentroCoordinate(b, c) {
  if (typeof c[0] === 'number') return estendi(b, c[0], c[1]);
  for (const f of c) b = dentroCoordinate(b, f);
  return b;
}

// Riquadro [ovest, sud, est, nord] di un oggetto GeoJSON (Feature, FeatureCollection o geometria); null se vuoto.
export function bboxGeoJSON(g, b = null) {
  if (!g) return null;
  if (g.type === 'FeatureCollection') { for (const f of g.features ?? []) b = bboxGeoJSON(f, b); return b; }
  if (g.type === 'Feature') return bboxGeoJSON(g.geometry, b);
  if (g.type === 'GeometryCollection') { for (const x of g.geometries ?? []) b = bboxGeoJSON(x, b); return b; }
  return g.coordinates ? dentroCoordinate(b, g.coordinates) : b;
}

const unisci = (a, b) => (!a ? b : !b ? a : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);

async function bboxSorgente(map, idSorgente) {
  const s = map.getSource(idSorgente);
  if (!s) return null;
  if (Array.isArray(s.bounds) && s.bounds.length === 4) return s.bounds;
  if (s.type !== 'geojson') return null;
  let dati = s.serialize?.().data;
  if (typeof dati === 'string') {
    try { dati = await (await fetch(dati)).json(); } catch { return null; }
  }
  return bboxGeoJSON(dati);
}

// Riquadro dei dati dello strato; `limiti` (opzionale) lo restringe all'area di lavoro. null se non si ricava.
export async function limitiStrato(map, ids, limiti) {
  const sorgenti = new Set();
  for (const id of ids) {
    const sorgente = map.getLayer(id)?.source;
    if (sorgente) sorgenti.add(sorgente);
  }
  let b = null;
  for (const s of sorgenti) b = unisci(b, await bboxSorgente(map, s));
  if (b && limiti) {
    b = [Math.max(b[0], limiti[0]), Math.max(b[1], limiti[1]), Math.min(b[2], limiti[2]), Math.min(b[3], limiti[3])];
    if (b[0] >= b[2] || b[1] >= b[3]) return null;
  }
  return b;
}

// Zoom minimo da cui lo strato si vede: il più basso `minzoom` dei suoi layer (0 se almeno uno è sempre visibile).
export function zoomMinimoStrato(map, ids) {
  let z = Infinity;
  for (const id of ids) {
    const l = map.getLayer(id);
    if (l) z = Math.min(z, Number.isFinite(l.minzoom) ? l.minzoom : 0);
  }
  return Number.isFinite(z) ? z : 0;
}
