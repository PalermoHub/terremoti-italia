export const DATI = 'dati/';
// Confini dei comuni italiani (vettoriali, un solo strato «comuni»): servono alla ricerca per area; il sito ospite consente le richieste a intervalli (Range).
export const URL_COMUNI = 'https://gbvitrano.it/anncus/data/comuni.pmtiles';
// Sorgente e strato dei confini comunali; HIT_COMUNI è il riempimento trasparente su tutti i comuni, che rende il comune
// cliccabile anche senza una scelta nella ricerca (card dei terremoti del comune). Lo aggiunge js/core/ricerca.js.
// La sorgente vettoriale dei comuni si crea una volta sola, dal primo modulo che la usa (js/layers/comuni.js).
export const SRC_COMUNI = 'aree-comuni';
export const STRATO_COMUNI = 'comuni';
export const HIT_COMUNI = 'aree-hit';
export const sorgenteComuni = () => ({ type: 'vector', url: URL_COMUNI.startsWith('pmtiles://') ? URL_COMUNI : `pmtiles://${URL_COMUNI}` });
// Vista iniziale: l'Italia intera, con Sardegna, Sicilia e le isole minori (Lampedusa, Pantelleria, Ustica).
export const VISTA_ITALIA = [[6.4, 35.3], [18.9, 47.3]];
// Margine con cui l'Italia entra in vista. Sul telefono l'Italia sta tra la barra di ricerca in alto e la scheda «Ultimo evento» con la barra a tab in basso:
// margini laterali stretti (la larghezza decide lo zoom) e più spazio sopra e sotto, dove stanno i comandi.
export const paddingVistaItalia = () => (window.matchMedia('(max-width: 720px)').matches ? { top: 72, right: 8, bottom: 180, left: 8 } : 24);
export const CENTRO = [12.5, 41.3];
export const ZOOM = window.matchMedia('(max-width: 768px)').matches ? 4.6 : 5.4; // di riserva: la mappa parte da VISTA_ITALIA
// Limiti di spostamento: l'Italia con un largo margine: il margine fissa anche quanto ci si può allontanare (a mappa larga 1440 px serve circa 32° di longitudine).
export const LIMITI = [[-6.0, 30.0], [30.0, 52.0]];
// Riquadro degli eventi (terremoti): l'Italia e i mari vicini; deve coincidere con AREA di server/terremoti.js (lo verifica un test).
export const AREA_EVENTI = { minlon: 5.5, minlat: 35.0, maxlon: 19.5, maxlat: 47.6 };
export const ZOOM_SLIDER = [4, 16];
// Al clic sulla mappa (scheda dell'evento) la vista si avvicina almeno a questo zoom, senza mai allontanarsi (livello regionale: i terremoti sono spesso in mare).
export const ZOOM_SCHEDA = 8;

// Stile della base cartografica delle app originali (porta con sé i font dei numeri civici).
export const STILE_BASE = 'https://tiles.openfreemap.org/styles/positron'; // Positron: la base «Mappa chiara» scelta dall'utente e la mini-mappa della scheda
// Stile con cui parte la mappa: senza sorgenti né layer, perché la base di partenza è raster (Mapbox). Servono solo i font delle etichette;
// gli stili OpenFreeMap (con sprite e sorgenti vettoriali) arrivano soltanto se l'utente sceglie una base OpenFreeMap (vedi layers/base.js).
// I font stanno in fonts/glyphs/ (Noto Sans copiato da OpenFreeMap, IM FELL English per la base «Antica»; solo gli intervalli latino, greco, cirillico e arabo di base):
// l'indirizzo dev'essere assoluto, perché lo legge un worker. Fuori dal browser (test) resta quello di OpenFreeMap.
const FONT = typeof document === 'undefined' ? 'https://tiles.openfreemap.org/fonts/' : new URL('fonts/glyphs/', document.baseURI).href;
export const STILE_AVVIO = { version: 8, glyphs: `${FONT}{fontstack}/{range}.pbf`, sources: {}, layers: [] };

// Percorso in dati/ -> link pubblicato (dal catalogo). Chi non ha un link si legge da dati/.
const remoti = new Map();
// Tileset pubblicati (cartelle z/x/y, non copiabili): id -> modello di URL, sempre dal catalogo.
const tileset = new Map();

export function impostaCatalogo(voci) {
  remoti.clear();
  tileset.clear();
  for (const v of voci) {
    if (v.tipo === 'tileset') tileset.set(v.id, v.url);
    else if (v.url) remoti.set(v.percorso, v.url);
  }
}

export function urlTileset(id) {
  return tileset.get(id) ?? null;
}

export function urlDati(rel) {
  return remoti.get(rel) || new URL(DATI + rel, document.baseURI).href;
}

export function pmt(rel) {
  return 'pmtiles://' + urlDati(rel);
}
