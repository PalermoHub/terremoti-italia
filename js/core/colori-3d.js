import { EDIFICATO_NEUTRAL } from './palette.js';

// Colora i volumi 3D esistenti (layer edifici-3d) invece di disegnarne altri sopra: un layer con poligoni di edifici
// registra {fid → colore}. fid è l'id del tile edificato (stesso valore di edificato.gpkg), si legge con ['id'].
const LAYER = 'edifici-3d';
const registro = new Map(); // chiave del layer -> Map(fid -> colore); l'ultimo registrato vince sui fid in comune
let base = EDIFICATO_NEUTRAL; // colore degli edifici non colorati dai layer: il neutro, o il tema per attributo del pannello Colori

export function espressioneColori(reg, sotto = EDIFICATO_NEUTRAL) {
  const finale = new Map();
  for (const perFid of reg.values()) for (const [fid, colore] of perFid) finale.set(fid, colore);
  const perColore = new Map();
  for (const [fid, colore] of finale) {
    if (!perColore.has(colore)) perColore.set(colore, []);
    perColore.get(colore).push(fid);
  }
  if (!perColore.size) return sotto;
  return ['match', ['id'], ...[...perColore].flatMap(([colore, fids]) => [fids, colore]), sotto];
}

// perFid vuoto o nullo: il layer non colora più nulla (spento, categorie tutte spente).
export function coloraEdifici3d(map, chiave, perFid) {
  if (perFid?.size) registro.set(chiave, perFid);
  else registro.delete(chiave);
  ridisegna(map);
}

const ridisegna = map => { if (map.getLayer(LAYER)) map.setPaintProperty(LAYER, 'fill-extrusion-color', espressioneColori(registro, base)); };

// Colore di fondo degli edifici (tema per attributo): sta sotto i layer, che lo coprono sui propri edifici. Nullo = neutro.
export function impostaBaseEdifici3d(map, espressione) {
  base = espressione ?? EDIFICATO_NEUTRAL;
  ridisegna(map);
}

export const volumi3dAcceso = map => Boolean(map.getLayer(LAYER)) && map.getLayoutProperty(LAYER, 'visibility') === 'visible';

// Con i volumi 3D accesi i poligoni piatti col fid si nascondono: l'edificio è già colorato nel volume.
export const senzaVolume = filtro => (filtro ? ['all', filtro, ['!', ['has', 'fid']]] : ['!', ['has', 'fid']]);

// {fid dell'edificio → colore}: fidPerBene {id: [fid]}; si colorano solo le categorie accese e non gli id esclusi.
export function coloriPerFid(fidPerBene, categoriaDi, coloreDi, categorieAccese, esclusi = []) {
  const fuori = new Set(esclusi);
  const accese = new Set(categorieAccese);
  const perFid = new Map();
  for (const [id, fids] of Object.entries(fidPerBene)) {
    const cat = categoriaDi(id);
    if (fuori.has(id) || !accese.has(cat) || !coloreDi[cat]) continue;
    for (const fid of fids) perFid.set(fid, coloreDi[cat]);
  }
  return perFid;
}
