// Vista 3D: cerchi, icone ed etichette restano dritti e «galleggiano» sulla verticale del punto 2D,
// come i segnaposto di un videogioco. Il sollevamento cresce con
// l'inclinazione (0 in 2D) ed è una traslazione dello schermo, quindi segue la mappa a ogni fotogramma.
// Le proprietà scritte dallo strato hanno la precedenza (anche `icon-offset`, che dà un'altezza per edificio).
export const QUOTA_M = 18; // altezza del galleggiamento in metri reali (circa un edificio medio)
export const QUOTA_MAX_PX = 90;
const TRASLAZIONI = { circle: ['circle-translate'], symbol: ['icon-translate', 'text-translate'] };

// pixel per metro a quella latitudine e zoom (tile da 512 px di MapLibre)
export function pixelPerMetro(zoom, lat = 38.1) {
  return 512 * 2 ** zoom / (40075016.686 * Math.cos(lat * Math.PI / 180));
}

// Lo spostamento verticale reale di QUOTA_M metri si proietta sullo schermo con sin(inclinazione):
// così il segnaposto resta sul tetto a ogni zoom, e la rotazione non lo sposta (ancora 'viewport').
export function sollevamento(pitch, zoom = 17.5, lat = 38.1) {
  const px = QUOTA_M * pixelPerMetro(zoom, lat) * Math.sin(Math.min(Math.max(pitch, 0), 85) * Math.PI / 180);
  return -Math.min(px, QUOTA_MAX_PX);
}

export function allineaLayerAlPiano(map) {
  const aggiungi = map.addLayer.bind(map);
  const layers = new Map();
  const solleva = (id, tipo) => {
    const y = sollevamento(map.getPitch(), map.getZoom(), map.getCenter?.().lat);
    try { for (const p of TRASLAZIONI[tipo]) map.setPaintProperty(id, p, [0, y]); } catch { /* strato non pronto: il prossimo beccheggio lo sistema */ }
  };
  map.addLayer = (layer, prima) => {
    const r = aggiungi(layer, prima);
    const props = TRASLAZIONI[layer?.type];
    if (props && layer.id && !layer.layout?.['icon-offset'] && !props.some(p => layer.paint?.[p])) { // con icon-offset per punto (core/quota-icone.js) l'altezza è già per edificio
      layers.set(layer.id, layer.type);
      // senza questo la traslazione ruoterebbe con la mappa e il segnaposto scivolerebbe di lato
      for (const p of props) try { map.setPaintProperty(layer.id, p + '-anchor', 'viewport'); } catch { /* ignora */ }
      if (map.getPitch() > 0) solleva(layer.id, layer.type);
    }
    return r;
  };
  const aggiorna = () => { for (const [id, tipo] of layers) if (map.getLayer(id)) solleva(id, tipo); };
  map.on('pitch', aggiorna);
  map.on('zoom', aggiorna);
  return map;
}
