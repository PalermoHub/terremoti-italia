// Layout della stampa «poster»: oltre a quello classico (mappa a tutta pagina con banner e riquadri sopra la mappa) ci sono tre
// impaginazioni a pannelli, in cui la mappa non è coperta da legenda ed elenco ma affiancata a una zona di pannelli dati.
// Questo file contiene solo la geometria (nessun disegno): l'area della mappa, la zona dei pannelli e il piede con fonte e avvertenza.
import { FORMATI } from './stampa.js';

export const LAYOUT = ['poster', 'report', 'bacheca', 'murale'];

// `testata` = altezza del banner in unità di corpo; `zona` = quota della larghezza riservata ai pannelli con la pagina orizzontale,
// `zonaV` = la loro altezza (in corpi) con la pagina verticale, quanto basta al contenuto; `pannelli` = in ordine di lettura.
// La legenda non è un pannello: sta sulla mappa, sopra la barra di scala
const CONFIG = {
  report: { testata: 6, zona: 0.27, zonaV: 24, pannelli: ['kpi', 'top'] },
  bacheca: { testata: 8, zona: 0.24, zonaV: 19, pannelli: ['hero', 'serie'] },
  murale: { testata: 14, zona: 0.26, zonaV: 30, pannelli: ['hero', 'serie', 'top'] },
};

export const configLayout = layout => CONFIG[layout] ?? null;
export const layoutAPannelli = layout => Boolean(CONFIG[layout]);

// Corpo del testo dei layout a pannelli: 9 pt (3,2 mm) al minimo, proporzionale alla larghezza oltre l'A4 orizzontale
export const corpoLayout = larghezzaPagina => Math.max(3.2, larghezzaPagina / 90);

// Pagina, area della mappa (mm dall'angolo in alto a sinistra), zona dei pannelli e piede. Con la pagina in orizzontale i pannelli
// stanno a destra della mappa, in verticale sotto di essa.
export function geometriaLayout(layout, formato, direzione) {
  const cfg = CONFIG[layout];
  const [corto, lungo] = FORMATI[formato];
  const [L, A] = direzione === 'landscape' ? [lungo, corto] : [corto, lungo];
  const c = corpoLayout(L);
  const b = c * 3; // margine e distanza tra i blocchi: dentro ci sta la fascia della graticola
  const testata = c * cfg.testata;
  const orizzontale = L >= A;
  const piede = { x: 0, y: A - c * (orizzontale ? 5.2 : 7), w: L, h: c * (orizzontale ? 5.2 : 7) };
  const alto = testata + b;
  const libero = piede.y - b - alto; // altezza tra la testata e il piede
  let mappa, zona;
  if (orizzontale) {
    const zw = Math.round((L - 3 * b) * cfg.zona);
    mappa = { x: b, y: alto, larghezza: L - 3 * b - zw, altezza: libero };
    zona = { x: b + mappa.larghezza + b, y: alto, w: zw, h: libero };
  } else {
    const zh = Math.min(Math.round(c * cfg.zonaV), (libero - b) * 0.5);
    mappa = { x: b, y: alto, larghezza: L - 2 * b, altezza: libero - b - zh };
    zona = { x: b, y: alto + mappa.altezza + b, w: L - 2 * b, h: zh };
  }
  return { L, A, c, b, testata, orizzontale, piede, zona, pannelli: cfg.pannelli, mappa: { ...mappa, banner: testata, bordo: b } };
}

// Fascia della mappa che nessun elemento sovrappone (mm dall'angolo in alto a sinistra della mappa): la rosa dei venti sta in alto a
// destra, legenda e scala in basso a sinistra (colonna larga 17,5 corpi), il resto della mappa è libero
export function fasciaLiberaLayout(layout, formato, direzione) {
  const g = geometriaLayout(layout, formato, direzione);
  return { x0: g.c * 20, x1: g.mappa.larghezza - g.c * 7, y0: g.c, y1: g.mappa.altezza - g.c };
}
