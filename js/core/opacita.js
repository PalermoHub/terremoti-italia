// Opacità per strato: lo slider del pannello moltiplica l'opacità originale di ogni layer MapLibre dello strato.

// Proprietà paint di opacità per tipo di layer.
export const PROPRIETA = {
  fill: ['fill-opacity'],
  line: ['line-opacity'],
  circle: ['circle-opacity', 'circle-stroke-opacity'],
  raster: ['raster-opacity'],
  'fill-extrusion': ['fill-extrusion-opacity'],
  heatmap: ['heatmap-opacity'],
  symbol: ['icon-opacity', 'text-opacity'],
};
const PREDEFINITO = { 'icon-opacity': 1, 'text-opacity': 1, 'circle-opacity': 1, 'circle-stroke-opacity': 1, 'raster-opacity': 1 };

// Valore di opacità moltiplicato per `f` (0..1). Numeri e curve per zoom (interpolate/step) si scalano punto per punto,
// perché lo zoom può stare solo in un interpolate/step di primo livello; ogni altra espressione viene avvolta in un prodotto.
export function scala(valore, f) {
  if (typeof valore === 'number') return valore * f;
  if (Array.isArray(valore)) {
    const [op] = valore;
    if (op === 'interpolate' || op === 'interpolate-hcl' || op === 'interpolate-lab') {
      return valore.map((v, i) => (i >= 4 && i % 2 === 0 ? scala(v, f) : v));
    }
    if (op === 'step') return valore.map((v, i) => (i === 2 || (i > 2 && i % 2 === 0) ? scala(v, f) : v));
  }
  return ['*', valore, f];
}

// Applica `f` alle opacità dei layer dati; la prima volta ricorda i valori originali (in `originali`), con f=1 li ripristina.
export function applicaOpacita(map, ids, f, originali) {
  for (const id of ids) {
    const l = map.getLayer(id);
    if (!l) continue;
    for (const prop of PROPRIETA[l.type] ?? []) {
      const chiave = `${id}|${prop}`;
      if (!originali.has(chiave)) originali.set(chiave, map.getPaintProperty(id, prop) ?? PREDEFINITO[prop] ?? 1);
      const base = originali.get(chiave);
      map.setPaintProperty(id, prop, f >= 1 ? base : scala(base, f));
    }
  }
}
