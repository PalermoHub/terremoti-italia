// Punti con l'icona del tema in mappa, in due modi (i glifi sono quelli di `icone.js`):
// - badge (la pompa dei distributori, la spina delle colonnine): un disco del colore della categoria con il glifo dentro. Le immagini si
//   disegnano su canvas, una per ogni colore (sono poche: bandiere, stati), e il layer `symbol` sceglie quella giusta con un'espressione;
//   il colore è nell'immagine, quindi il pannello dei colori non lo cambia;
// - glifo SDF (i monumenti): la sola sagoma dell'icona, colorata da stile (`icon-color`) come le forme di forme.js, quindi segue il pannello dei colori.
import { ICONE } from './icone.js';

const PR = 2; // pixelRatio: l'immagine misura il doppio dei punti a schermo
const LATO = 56; // px dell'immagine
const GLIFO = 1.2; // scala del glifo (viewBox 24) dentro il disco

export const idBadge = (icona, colore) => `badge-${icona}-${colore}`;

// Glifo scuro su sfondo chiaro, bianco su sfondo scuro.
export function coloreGlifo(colore) {
  const m = /^#([0-9a-f]{6})$/i.exec(colore) ?? /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(colore);
  if (!m) return '#fff';
  const h = m.length === 2 ? m[1] : m.slice(1).map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? '#222' : '#fff';
}

// Immagine per `map.addImage` (solo nel browser: usa un canvas).
export function immagineBadge(icona, colore) {
  const c = document.createElement('canvas');
  c.width = c.height = LATO;
  const g = c.getContext('2d');
  g.beginPath();
  g.arc(LATO / 2, LATO / 2, LATO / 2 - 3, 0, 2 * Math.PI);
  g.fillStyle = colore;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = '#fff';
  g.stroke();
  const lato = 24 * GLIFO;
  g.translate((LATO - lato) / 2, (LATO - lato) / 2);
  g.scale(GLIFO, GLIFO);
  g.fillStyle = coloreGlifo(colore);
  g.fill(new Path2D(ICONE[icona]));
  return g.getImageData(0, 0, LATO, LATO);
}

// Le immagini si disegnano solo quando la mappa le chiede (`styleimagemissing`: un layer `symbol` visibile le usa), non quando il layer
// viene aggiunto: all'avvio i layer sono tutti spenti e disegnare ogni sagoma SDF costava mezzo secondo.
const IMMAGINI = new WeakMap(); // mappa → Map(id → () => [immagine, opzioni])
function richiediImmagine(map, id, crea) {
  let voci = IMMAGINI.get(map);
  if (!voci) {
    voci = new Map();
    IMMAGINI.set(map, voci);
    map.on('styleimagemissing', e => {
      const voce = voci.get(e.id);
      if (voce && !map.hasImage(e.id)) map.addImage(e.id, ...voce());
    });
  }
  voci.set(id, crea);
}

// Registra l'immagine di ogni colore (quelle già presenti restano).
export function registraBadge(map, icona, colori) {
  for (const colore of new Set(colori)) richiediImmagine(map, idBadge(icona, colore), () => [immagineBadge(icona, colore), { pixelRatio: PR }]);
}

// Espressione `icon-image`: l'immagine del colore della categoria (`voci` = [[valore, colore], …]), `altro` se nessuna.
export const espressioneBadge = (icona, campo, voci, altro) =>
  ['match', ['get', campo], ...voci.flatMap(([valore, colore]) => [valore, idBadge(icona, colore)]), idBadge(icona, altro)];

// Il layer `symbol` che mostra i badge. `icon-size` a 1 = 28 punti; qui da 17 (zoom 11) a 25 (zoom 17).
export function layerBadge({ id, source, immagine, layout = {}, paint = {} }) {
  return {
    id, type: 'symbol', source,
    layout: {
      'icon-image': immagine,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 17, 0.9],
      'icon-allow-overlap': true, 'icon-ignore-placement': true,
      ...layout,
    },
    paint,
  };
}

// Simbolo di legenda e di tooltip: un <i class="monumenti-pallino"> col disco colorato e il glifo come sfondo.
export function stileBadge(icona, colore) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${coloreGlifo(colore)}" d="${ICONE[icona]}"/></svg>`;
  return {
    background: `${colore} url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 78% no-repeat`,
    width: '16px', height: '16px',
  };
}

export function simboloBadge(icona, colore) {
  const i = document.createElement('i');
  i.className = 'monumenti-pallino';
  Object.assign(i.style, stileBadge(icona, colore));
  return i;
}

// ---- Glifo SDF: la sagoma dell'icona come campo di distanza, da colorare con `icon-color`.
export const idGlifo = icona => `glifo-${icona}`;
const LATO_GLIFO = 48; // px dell'immagine
const MARGINE_GLIFO = 6; // px di sfumatura attorno alla sagoma (larghezza massima dell'alone)
const DIMENSIONE_GLIFO = 32; // px del glifo dentro l'immagine

// Da una maschera (alfa > 127 = dentro) al campo di distanza nel formato SDF di MapLibre (alfa 191 sul bordo). Funzione pura, ricerca
// entro `margine` px: la maschera è piccola, la forza bruta basta.
export function sdfDaMaschera(alfa, lato, margine) {
  const dentro = (x, y) => alfa[y * lato + x] > 127;
  const out = new Uint8ClampedArray(lato * lato * 4);
  for (let y = 0; y < lato; y++) {
    for (let x = 0; x < lato; x++) {
      const stato = dentro(x, y);
      let d = margine; // distanza dal pixel di stato opposto più vicino
      for (let dy = -margine; dy <= margine; dy++) {
        for (let dx = -margine; dx <= margine; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= lato || ny >= lato || dentro(nx, ny) === stato) continue;
          d = Math.min(d, Math.hypot(dx, dy));
        }
      }
      const firmata = stato ? -d : d;
      const k = (y * lato + x) * 4;
      out[k] = out[k + 1] = out[k + 2] = 255;
      out[k + 3] = Math.round(255 * Math.max(0, Math.min(1, 0.75 - firmata / margine)));
    }
  }
  return { width: lato, height: lato, data: out };
}

// Immagine SDF del glifo (solo nel browser: lo disegna su un canvas per leggerne la maschera).
export function immagineGlifo(icona) {
  const c = document.createElement('canvas');
  c.width = c.height = LATO_GLIFO;
  const g = c.getContext('2d');
  const k = DIMENSIONE_GLIFO / 24;
  g.translate((LATO_GLIFO - DIMENSIONE_GLIFO) / 2, (LATO_GLIFO - DIMENSIONE_GLIFO) / 2);
  g.scale(k, k);
  g.fill(new Path2D(ICONE[icona]));
  const px = g.getImageData(0, 0, LATO_GLIFO, LATO_GLIFO).data;
  const alfa = new Uint8Array(LATO_GLIFO * LATO_GLIFO);
  for (let i = 0; i < alfa.length; i++) alfa[i] = px[i * 4 + 3];
  return sdfDaMaschera(alfa, LATO_GLIFO, MARGINE_GLIFO);
}

export function registraGlifo(map, icona) {
  richiediImmagine(map, idGlifo(icona), () => [immagineGlifo(icona), { sdf: true, pixelRatio: PR }]);
}

// Espressione `icon-image`: il glifo della categoria (`voci` = [[valore, icona], …]), `altra` se nessuna.
export const espressioneGlifo = (campo, voci, altra) =>
  ['match', ['get', campo], ...voci.flatMap(([valore, icona]) => [valore, idGlifo(icona)]), idGlifo(altra)];

// Il layer `symbol` con il glifo SDF: `metadata.forme` lo fa riconoscere al tema dei colori (come per forme.js).
// `icona` = nome del glifo; per più glifi in un layer si passa `immagine` (vedi espressioneGlifo).
export function layerGlifo({ id, source, icona, immagine, colore, layout = {}, paint = {} }) {
  return {
    id, type: 'symbol', source, metadata: { forme: true },
    layout: {
      'icon-image': immagine ?? idGlifo(icona),
      'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 17, 1.4],
      'icon-allow-overlap': true, 'icon-ignore-placement': true,
      ...layout,
    },
    paint: { 'icon-color': colore, 'icon-halo-color': '#fff', 'icon-halo-width': 1, ...paint },
  };
}

// Simbolo di legenda e di tooltip: il glifo come maschera di un <i> colorato. Il colore è lo `background`, che il pannello dei colori
// riscrive senza toccare la maschera.
export function stileGlifo(icona, colore) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${ICONE[icona]}"/></svg>`;
  const maschera = `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / contain no-repeat`;
  return { background: colore, mask: maschera, webkitMask: maschera, borderRadius: '0', width: '14px', height: '14px' };
}

export function simboloGlifo(icona, colore) {
  const i = document.createElement('i');
  i.className = 'monumenti-pallino';
  Object.assign(i.style, stileGlifo(icona, colore));
  return i;
}
