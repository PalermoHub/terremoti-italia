// Sezione verticale (profondità contro distanza): funzioni pure che proiettano gli eventi su una linea A–B.
// Il piano è quello locale (equirettangolare attorno alla linea): per fasce di qualche centinaio di km l'errore è trascurabile.
const KM_LAT = 110.574; // km per grado di latitudine
const KM_LON = 111.320; // km per grado di longitudine all'equatore

// Classi di profondità, colore e filtro per fascia: una sola scala in core/profondita.js (qui ri-esportata per sezione e grafici)
export { CLASSI_PROFONDITA, coloreProfondita } from '../core/profondita.js';

export const SEMILARGHEZZE_KM = [10, 25, 50, 100];

// Sezioni pronte: la linea attraversa l'arco calabro in direzione perpendicolare alla fossa, dallo Ionio verso nord-ovest
// (il piano di subduzione immerge verso nord-ovest)
export const SEZIONI_PREDEFINITE = [
  { chiave: 'arco', a: [16.5, 37.6], b: [13.5, 40.4], semilarghezza: 100 },
];

// Vettore A→B in km su un piano locale, con la latitudine media della linea
function piano(a, b) {
  const fattore = Math.cos((a[1] + b[1]) / 2 * Math.PI / 180);
  const dx = (b[0] - a[0]) * KM_LON * fattore;
  const dy = (b[1] - a[1]) * KM_LAT;
  return { fattore, dx, dy, lunghezza: Math.hypot(dx, dy) };
}

export const lunghezzaKm = (a, b) => piano(a, b).lunghezza;

// Versore perpendicolare alla linea (a sinistra di A→B) in km; null se A e B coincidono
function perpendicolare(a, b) {
  const { dx, dy, lunghezza } = piano(a, b);
  return lunghezza ? [-dy / lunghezza, dx / lunghezza] : null;
}

const spostaKm = ([lon, lat], fattore, [ex, ey], km) => [lon + ex * km / (KM_LON * fattore), lat + ey * km / KM_LAT];

// Anello del rettangolo della fascia (poligono GeoJSON chiuso), o null se A e B coincidono
export function fascia(a, b, semilarghezzaKm) {
  const perp = perpendicolare(a, b);
  if (!perp) return null;
  const { fattore } = piano(a, b);
  const angoli = [spostaKm(a, fattore, perp, semilarghezzaKm), spostaKm(b, fattore, perp, semilarghezzaKm), spostaKm(b, fattore, perp, -semilarghezzaKm), spostaKm(a, fattore, perp, -semilarghezzaKm)];
  return [...angoli, angoli[0]];
}

// Riquadro { minlon, minlat, maxlon, maxlat } che contiene la fascia: serve a scaricare solo gli eventi vicini
export function riquadroFascia(a, b, semilarghezzaKm) {
  const anello = fascia(a, b, semilarghezzaKm);
  if (!anello) return null;
  const lon = anello.map(p => p[0]);
  const lat = anello.map(p => p[1]);
  return { minlon: Math.min(...lon), minlat: Math.min(...lat), maxlon: Math.max(...lon), maxlat: Math.max(...lat) };
}

// Eventi dentro la fascia: `x` = distanza da A lungo la linea (km), `trasversale` = scostamento dalla linea (km, + a sinistra).
// Servono lon, lat e prof (km); chi non ha la profondità non si può disegnare e si scarta.
export function proiettaEventi(eventi, a, b, semilarghezzaKm) {
  const { fattore, dx, dy, lunghezza } = piano(a, b);
  if (!lunghezza) return [];
  const dentro = [];
  for (const e of eventi) {
    if (!Number.isFinite(e.prof)) continue;
    const ex = (e.lon - a[0]) * KM_LON * fattore;
    const ey = (e.lat - a[1]) * KM_LAT;
    const x = (ex * dx + ey * dy) / lunghezza;
    const trasversale = (dx * ey - dy * ex) / lunghezza;
    if (x < 0 || x > lunghezza || Math.abs(trasversale) > semilarghezzaKm) continue;
    dentro.push({ ...e, x, trasversale });
  }
  return dentro;
}

// Estremo «gradevole» di un asse: 10, 20, 50, 100, 200, 500… (multipli di 1, 2, 5 per potenze di dieci)
export function estremoAsse(valore) {
  if (!(valore > 0)) return 10;
  const base = 10 ** Math.floor(Math.log10(valore));
  const m = valore / base;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * base;
}

// Tacche dell'asse da 0 a `estremo`, circa `quante`
export function tacche(estremo, quante = 5) {
  const passo = estremoAsse(estremo / quante);
  const out = [];
  for (let v = 0; v <= estremo + 1e-9; v += passo) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}
