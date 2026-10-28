// Aggregazioni degli eventi per le mappe di densità (esagoni) e coropletica (regioni, province): funzioni pure.
import { cellaEsagonale, anelloEsagono, RAGGIO_GRIGLIA } from './scheda-archivio.js';

export const METRICHE = ['conteggio', 'magMax'];

// Valore di una cella o di un territorio secondo la metrica scelta
export const valoreMetrica = (c, metrica) => (metrica === 'magMax' ? c.magMax : c.n);

// Rampa dal chiaro allo scuro: `norma` va da 0 a 1 (radice, perché i conteggi sono molto asimmetrici)
const RAMPA = ['#fef3c7', '#fcd34d', '#f97316', '#dc2626', '#7f1d1d'];
export function coloreRampa(norma) {
  const x = Math.min(1, Math.max(0, norma)) * (RAMPA.length - 1);
  const i = Math.min(RAMPA.length - 2, Math.floor(x));
  const f = x - i;
  const mix = (a, b) => Math.round(parseInt(a, 16) * (1 - f) + parseInt(b, 16) * f).toString(16).padStart(2, '0');
  const [p, q] = [RAMPA[i].slice(1), RAMPA[i + 1].slice(1)];
  return `#${[0, 2, 4].map(k => mix(p.slice(k, k + 2), q.slice(k, k + 2))).join('')}`;
}
export const RAMPA_COLORI = RAMPA;

const norma = (v, massimo) => (massimo > 0 ? Math.sqrt(v / massimo) : 0);

// Eventi → celle esagonali con conteggio, magnitudo massima e profondità media; `riga` è il record per la tabella
export function grigliaConteggi(eventi, metrica = 'conteggio', raggio = RAGGIO_GRIGLIA) {
  const celle = new Map();
  for (const e of eventi) {
    if (!Number.isFinite(e?.lon) || !Number.isFinite(e?.lat)) continue;
    const { q, r } = cellaEsagonale(e.lon, e.lat, raggio);
    const k = `${q},${r}`;
    const c = celle.get(k) ?? { id: k, q, r, n: 0, magMax: -Infinity, sommaProf: 0, nProf: 0 };
    c.n += 1;
    c.magMax = Math.max(c.magMax, e.mag);
    if (Number.isFinite(e.prof)) { c.sommaProf += e.prof; c.nProf += 1; }
    celle.set(k, c);
  }
  const lista = [...celle.values()];
  const massimo = Math.max(0, ...lista.map(c => valoreMetrica(c, metrica)));
  const righe = lista.map(c => {
    const anello = anelloEsagono(c.q, c.r, raggio);
    const lon = anello.slice(0, 6).reduce((s, p) => s + p[0], 0) / 6;
    const lat = anello.slice(0, 6).reduce((s, p) => s + p[1], 0) / 6;
    return { id: c.id, n: c.n, magMax: c.magMax, profMedia: c.nProf ? c.sommaProf / c.nProf : null, lon, lat, anello, norma: norma(valoreMetrica(c, metrica), massimo) };
  });
  return {
    righe, massimo,
    geojson: {
      type: 'FeatureCollection',
      features: righe.map(c => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [c.anello] }, properties: { id: c.id, n: c.n, magMax: c.magMax, profMedia: c.profMedia, colore: coloreRampa(c.norma), opacita: 0.25 + 0.6 * c.norma } })),
    },
  };
}

// Eventi → un record per regione o provincia (`livello` = 'regione' | 'provincia'); `di(evento)` dà il territorio
// ({ regione, provincia }). Gli eventi senza territorio (in mare) non entrano: se ne dà il conto in `fuori`.
export function aggregaTerritorio(eventi, livello, di, metrica = 'conteggio') {
  const gruppi = new Map();
  let fuori = 0;
  for (const e of eventi) {
    const t = di(e);
    const nome = t?.[livello];
    if (!nome) { fuori += 1; continue; }
    const g = gruppi.get(nome) ?? { id: nome, nome, regione: t.regione ?? null, n: 0, magMax: -Infinity };
    g.n += 1;
    g.magMax = Math.max(g.magMax, e.mag);
    gruppi.set(nome, g);
  }
  const lista = [...gruppi.values()];
  const massimo = Math.max(0, ...lista.map(g => valoreMetrica(g, metrica)));
  return { righe: lista.map(g => ({ ...g, norma: norma(valoreMetrica(g, metrica), massimo), colore: coloreRampa(norma(valoreMetrica(g, metrica), massimo)) })).sort((a, b) => b.n - a.n), massimo, fuori };
}
