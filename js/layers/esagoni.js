// Esagoni equivalenti per la mappa «Densità terremoti»: la griglia sta in proiezione Lambert azimutale equivalente
// (la stessa di EPSG:3035, ma sulla sfera di raggio autalico: lo scarto di area dall'ellissoide GRS80 è sotto lo 0,5%),
// quindi tutte le celle hanno la stessa area, a nord come a sud. Funzioni pure, senza librerie.
import { coloreRampa, RAMPA_COLORI } from './scheda-mappe.js';
import { ANNO_INIZIO } from './scheda-archivio.js';

const R = 6371007.181; // raggio della sfera di uguale area dell'ellissoide GRS80, in metri
const LON0 = 10 * Math.PI / 180, LAT0 = 52 * Math.PI / 180; // centro di EPSG:3035
const RAD = Math.PI / 180;
const RADICE3 = Math.sqrt(3);
export const COLORE_VUOTO = '#64748b'; // celle dell'area di studio senza eventi
export const OPACITA_VUOTO = 0.12;
export const LATI_KM = [5, 10, 20];
export const LATO_PREDEFINITO_KM = 10;
export const NUMERO_CLASSI = RAMPA_COLORI.length; // una classe per colore della rampa

// lon/lat in gradi → [x, y] in metri
export function proiettaLaea(lon, lat) {
  const l = lon * RAD - LON0, f = lat * RAD;
  const k = Math.sqrt(2 / (1 + Math.sin(LAT0) * Math.sin(f) + Math.cos(LAT0) * Math.cos(f) * Math.cos(l)));
  return [R * k * Math.cos(f) * Math.sin(l), R * k * (Math.cos(LAT0) * Math.sin(f) - Math.sin(LAT0) * Math.cos(f) * Math.cos(l))];
}

// [x, y] in metri → [lon, lat] in gradi
export function deproiettaLaea(x, y) {
  const rho = Math.hypot(x, y);
  if (rho === 0) return [LON0 / RAD, LAT0 / RAD];
  const c = 2 * Math.asin(Math.min(1, rho / (2 * R)));
  const f = Math.asin(Math.cos(c) * Math.sin(LAT0) + y * Math.sin(c) * Math.cos(LAT0) / rho);
  const l = LON0 + Math.atan2(x * Math.sin(c), rho * Math.cos(LAT0) * Math.cos(c) - y * Math.sin(LAT0) * Math.sin(c));
  return [l / RAD, f / RAD];
}

// Cella esagonale («pointy-top», lato `lato` in metri) che contiene il punto proiettato: coordinate assiali, arrotondate in cubo
export function cellaDaMetri(x, y, lato) {
  const qf = (RADICE3 / 3 * x - y / 3) / lato, rf = (2 / 3 * y) / lato;
  let rx = Math.round(qf), rz = Math.round(rf);
  const ry = Math.round(-qf - rf);
  const dx = Math.abs(rx - qf), dy = Math.abs(ry - (-qf - rf)), dz = Math.abs(rz - rf);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy <= dz) rz = -rx - ry;
  return { q: rx, r: rz };
}

// Anello chiuso del poligono (7 punti lon/lat) di una cella: i vertici sono calcolati in metri e riportati in gradi
export function anelloCella(q, r, lato) {
  const cx = lato * RADICE3 * (q + r / 2), cy = lato * 1.5 * r;
  const anello = Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 3 * i + Math.PI / 6;
    return deproiettaLaea(cx + lato * Math.cos(a), cy + lato * Math.sin(a));
  });
  anello.push(anello[0]);
  return anello;
}

// Area di studio: poligoni in lon/lat (dati/area-studio.json) → anelli in metri; `dentroArea` dice se un punto in metri ci sta
export const proiettaPoligoni = poligoni => poligoni.map(anello => {
  const pts = anello.map(([lon, lat]) => proiettaLaea(lon, lat));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { pts, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
});
function dentroAnello(x, y, pts) {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
export const dentroArea = (x, y, area) => area.some(a => x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1 && dentroAnello(x, y, a.pts));

// Celle della griglia (lato in km) il cui centro sta nell'area di studio: [{ q, r }]
export function celleInArea(area, latoKm = LATO_PREDEFINITO_KM) {
  if (!area?.length) return [];
  const lato = latoKm * 1000, larg = lato * RADICE3;
  const x0 = Math.min(...area.map(a => a.x0)), x1 = Math.max(...area.map(a => a.x1));
  const y0 = Math.min(...area.map(a => a.y0)), y1 = Math.max(...area.map(a => a.y1));
  const celle = [];
  for (let r = Math.floor(y0 / (1.5 * lato)) - 1; r <= Math.ceil(y1 / (1.5 * lato)) + 1; r++) {
    for (let q = Math.ceil(x0 / larg - r / 2); q <= Math.floor(x1 / larg - r / 2); q++) {
      if (dentroArea(larg * (q + r / 2), 1.5 * lato * r, area)) celle.push({ q, r });
    }
  }
  return celle;
}

// Valore tondo (1, 2 o 5 per una potenza di 10) più vicino in scala logaritmica
export function valoreTondo(x) {
  const e = Math.floor(Math.log10(x));
  const m = x / 10 ** e;
  const scelto = [1, 2, 5, 10].reduce((a, b) => (Math.abs(Math.log(b / m)) < Math.abs(Math.log(a / m)) ? b : a));
  return scelto * 10 ** e;
}

// Classi logaritmiche sul massimo del periodo, con estremi tondi: [{ da, a }], l'ultima con a = null (nessun limite).
// Con massimi piccoli le classi sono meno di NUMERO_CLASSI: gli estremi uguali si fondono.
export function classiAdattive(massimo, numero = NUMERO_CLASSI) {
  if (!(massimo >= 1)) return [];
  const estremi = [];
  for (let k = 1; k < numero; k++) {
    const b = valoreTondo(massimo ** (k / numero));
    if (b > (estremi.at(-1) ?? 0) && b < massimo) estremi.push(b);
  }
  const classi = [];
  let da = 1;
  for (const a of estremi) { classi.push({ da, a }); da = a + 1; }
  classi.push({ da, a: null });
  return classi;
}

// Classi per un tasso (eventi/anno, anche sotto 1): logaritmiche tra il valore minimo e il massimo, con estremi tondi.
// `da` è l'estremo inferiore escluso della classe (0 per la prima): [{ da, a, tasso: true }], l'ultima con a = null.
export function classiTasso(minimo, massimo, numero = NUMERO_CLASSI) {
  if (!(massimo > 0) || !(minimo > 0)) return [];
  const estremi = [];
  for (let k = 1; k < numero; k++) {
    const b = valoreTondo(minimo * (massimo / minimo) ** (k / numero));
    if (b > (estremi.at(-1) ?? 0) && b < massimo) estremi.push(b);
  }
  const classi = [];
  let da = 0;
  for (const a of estremi) { classi.push({ da, a, tasso: true }); da = a; }
  classi.push({ da, a: null, tasso: true });
  return classi;
}

// Indice della classe di un conteggio (≥ 1) o di un tasso
export const classeDi = (n, classi) => classi.findIndex(c => c.a == null || n <= c.a);

// Colore di una classe: le classi sono 1–5, la rampa ha 5 colori; con meno classi si usano i colori da quello iniziale a quello finale
export const coloreClasse = (i, totale) => RAMPA_COLORI[totale <= 1 ? RAMPA_COLORI.length - 1 : Math.round(i * (RAMPA_COLORI.length - 1) / (totale - 1))];

// Colore e opacità di riempimento di una classe (in mappa e nella stampa)
export const stileClasse = (i, totale) => ({ colore: coloreClasse(i, totale), opacita: 0.55 + 0.35 * (totale > 1 ? i / (totale - 1) : 1) });

// Eventi → celle: conteggio, magnitudo massima, profondità media, classe; `geojson` per la mappa e `righe` per la tabella.
// `metrica` 'conteggio' colora per classe (le classi sono calcolate sul periodo), 'magMax' sulla rampa continua.
// `celleVuote` = celle dell'area di studio (celleInArea): quelle senza eventi si disegnano comunque, in un colore tenue, e si contano.
// `metrica` 'tasso' = eventi per anno (conteggio ÷ `durataAnni`). `classi` fisse (animazione) sostituiscono quelle adattive.
// `anniCivili` = numero di anni solari toccati dal periodo: una cella con eventi in tutti ha `sempre` = 1.
export function grigliaEsagoni(eventi, latoKm = LATO_PREDEFINITO_KM, metrica = 'conteggio', celleVuote = [], { classi: classiFisse = null, durataAnni = 1, anniCivili = 0 } = {}) {
  const lato = latoKm * 1000;
  const celle = new Map();
  for (const e of eventi) {
    if (!Number.isFinite(e?.lon) || !Number.isFinite(e?.lat)) continue;
    const [x, y] = proiettaLaea(e.lon, e.lat);
    const { q, r } = cellaDaMetri(x, y, lato);
    const k = `${q},${r}`;
    const c = celle.get(k) ?? { id: k, q, r, n: 0, magMax: -Infinity, sommaProf: 0, nProf: 0, tsUltimo: null, tsForte: null, anni: new Set() };
    c.n += 1;
    if (e.mag > c.magMax) { c.magMax = e.mag; c.tsForte = Number.isFinite(e.ts) ? e.ts : null; }
    if (Number.isFinite(e.ts)) {
      if (c.tsUltimo == null || e.ts > c.tsUltimo) c.tsUltimo = e.ts;
      c.anni.add(new Date(e.ts).getUTCFullYear());
    }
    if (Number.isFinite(e.prof)) { c.sommaProf += e.prof; c.nProf += 1; }
    celle.set(k, c);
  }
  const lista = [...celle.values()];
  const perMag = metrica === 'magMax';
  const valoreDi = c => (perMag ? c.magMax : metrica === 'tasso' ? c.n / durataAnni : c.n);
  const massimo = Math.max(0, ...lista.map(valoreDi));
  const minimo = lista.length ? Math.min(...lista.map(valoreDi)) : 0;
  const classi = perMag ? [] : classiFisse ?? (metrica === 'tasso' ? classiTasso(minimo, massimo) : classiAdattive(massimo));
  const esagoniPerClasse = classi.map(() => 0);
  const righe = lista.map(c => {
    const anello = anelloCella(c.q, c.r, lato);
    const centro = deproiettaLaea(lato * RADICE3 * (c.q + c.r / 2), lato * 1.5 * c.r);
    const classe = perMag ? -1 : classeDi(valoreDi(c), classi);
    if (classe >= 0) esagoniPerClasse[classe] += 1;
    const norma = perMag ? (massimo > 0 ? Math.sqrt(c.magMax / massimo) : 0) : 0;
    const anniAttivi = c.anni.size;
    return { id: c.id, n: c.n, valore: valoreDi(c), anniAttivi, sempre: anniCivili > 0 && anniAttivi >= anniCivili ? 1 : 0, magMax: c.magMax, profMedia: c.nProf ? c.sommaProf / c.nProf : null, tsUltimo: c.tsUltimo, tsForte: c.tsForte, lon: centro[0], lat: centro[1], anello, classe, norma };
  });
  const colore = r => (perMag ? coloreRampa(r.norma) : coloreClasse(r.classe, classi.length));
  const opacita = r => (perMag ? 0.25 + 0.6 * r.norma : stileClasse(r.classe, classi.length).opacita);
  const vuote = celleVuote.filter(c => !celle.has(`${c.q},${c.r}`)).map(c => ({
    type: 'Feature', geometry: { type: 'Polygon', coordinates: [anelloCella(c.q, c.r, lato)] },
    properties: { id: `${c.q},${c.r}`, n: 0, magMax: null, profMedia: null, tsUltimo: null, tsForte: null, anniAttivi: 0, sempre: 0, colore: COLORE_VUOTO, opacita: OPACITA_VUOTO },
  }));
  return {
    righe, massimo, classi, esagoniPerClasse, esagoniVuoti: vuote.length, esagoniSempre: righe.filter(r => r.sempre).length,
    geojson: {
      type: 'FeatureCollection',
      features: [...vuote, ...righe.map(r => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [r.anello] }, properties: { id: r.id, n: r.n, magMax: r.magMax, profMedia: r.profMedia, tsUltimo: r.tsUltimo, tsForte: r.tsForte, anniAttivi: r.anniAttivi, sempre: r.sempre, colore: colore(r), opacita: opacita(r) } }))],
    },
  };
}

// Periodi pronti per il menu: gli ultimi N anni (di 365 giorni, fino a adesso) e tutto l'archivio. Mai sotto l'anno, come chiedono gli esagoni.
const GIORNO_MS = 86400000;
export const periodoUltimiAnni = (anni, adesso) => ({ da: adesso - anni * 365 * GIORNO_MS + 1, a: adesso });
export const periodoTuttoArchivio = adesso => ({ da: Date.UTC(ANNO_INIZIO, 0, 1), a: adesso });
export const DURATA_MINIMA_GIORNI = 365;

// Eventi che cadono nella cella `id` («q,r») della griglia di lato `latoKm`
export function eventiInCella(eventi, id, latoKm = LATO_PREDEFINITO_KM) {
  const lato = latoKm * 1000;
  return eventi.filter(e => {
    if (!Number.isFinite(e?.lon) || !Number.isFinite(e?.lat)) return false;
    const [x, y] = proiettaLaea(e.lon, e.lat);
    const c = cellaDaMetri(x, y, lato);
    return `${c.q},${c.r}` === id;
  });
}

// Anni solari (UTC) toccati da un periodo
export const anniCiviliPeriodo = ({ da, a }) => new Date(a).getUTCFullYear() - new Date(da).getUTCFullYear() + 1;
// Durata di un periodo in anni (365,25 giorni): il denominatore dei tassi
export const durataAnni = ({ da, a }) => (a - da + 1) / (365.25 * GIORNO_MS);

// Classi fisse per l'animazione: il massimo conteggio di una cella su qualunque finestra di `finestra` anni solari.
// Un solo passaggio: gli eventi si contano per cella e anno, poi si sommano gli anni di ogni finestra.
export function classiAnimazione(eventi, latoKm, finestra) {
  const lato = latoKm * 1000;
  const celle = new Map();
  for (const e of eventi) {
    if (!Number.isFinite(e?.lon) || !Number.isFinite(e?.lat) || !Number.isFinite(e.ts)) continue;
    const [x, y] = proiettaLaea(e.lon, e.lat);
    const { q, r } = cellaDaMetri(x, y, lato);
    const k = `${q},${r}`;
    const anno = new Date(e.ts).getUTCFullYear();
    const perAnno = celle.get(k) ?? new Map();
    perAnno.set(anno, (perAnno.get(anno) ?? 0) + 1);
    celle.set(k, perAnno);
  }
  let massimo = 0;
  for (const perAnno of celle.values()) {
    const anni = [...perAnno.keys()];
    for (const inizio of anni) {
      let somma = 0;
      for (let a = inizio; a < inizio + finestra; a++) somma += perAnno.get(a) ?? 0;
      if (somma > massimo) massimo = somma;
    }
  }
  return classiAdattive(massimo);
}
