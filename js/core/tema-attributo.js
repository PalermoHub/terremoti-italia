// Tematizzazione per attributo: parte pura (rilevamento dei campi, classi, tavolozze, espressione MapLibre, validazione).
// Il pannello che la usa sta in pannello-attributo.js; l'applicazione alla mappa in tema.js.
import { RAMPE_CRAMERI, RAMPE_DIVERGENTI } from './rampe-crameri.js';
import { t } from './i18n.js';
import { nomeCampo, unitaCampo, vociCategorie } from './etichette-campi.js';

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const MAX_CATEGORIE = 200;
const MAX_CLASSI = 9;
const MAX_VALORI = 500; // oltre non è un campo da categorie (identificatori, nomi propri...)
export const COLORE_MANCANTE = '#cccccc';

// Rampe sequenziali a 9 colori (ColorBrewer), dal chiaro allo scuro; l'ultima è divergente.
export const RAMPE = {
  Blu: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
  Verde: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#006d2c', '#00441b'],
  Arancio: ['#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#a63603', '#7f2704'],
  Viola: ['#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#54278f', '#3f007d'],
  'Rosso-Verde': ['#a50026', '#d73027', '#f46d43', '#fdae61', '#ffffbf', '#a6d96a', '#66bd63', '#1a9850', '#006837'],
  ...RAMPE_CRAMERI,
};

// Gruppi per il selettore: ColorBrewer, Crameri sequenziali (uniformi per percezione, adatte al daltonismo), Crameri divergenti.
export const GRUPPI_RAMPE = [
  ['ColorBrewer', Object.keys(RAMPE).filter(n => !(n in RAMPE_CRAMERI))],
  [t('rampe.gruppo.sequenziali'), Object.keys(RAMPE_CRAMERI).filter(n => !RAMPE_DIVERGENTI.includes(n))],
  [t('rampe.gruppo.divergenti'), RAMPE_DIVERGENTI],
];

// Colori distinguibili per le categorie (Tableau 10 + 2), riusati in giro.
export const TAVOLOZZA = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac', '#1f77b4', '#8c564b'];

// `n` colori della rampa, equidistanti.
// Con `inverti` la rampa si legge dal fondo (il valore più alto prende il colore più chiaro).
export function coloriRampa(nome, n, inverti = false) {
  const r = inverti ? [...(RAMPE[nome] ?? RAMPE.Blu)].reverse() : RAMPE[nome] ?? RAMPE.Blu;
  if (n <= 1) return [r[r.length - 1]];
  return Array.from({ length: n }, (_, i) => r[Math.round(i * (r.length - 1) / (n - 1))]);
}

// Campi leggibili dalle feature: Map campo → { valori: Set (testuali), numeri: [number], numerico: bool }.
// «numerico» solo se tutti i valori presenti sono numeri; valori nulli o oggetti sono ignorati.
export function rilevaAttributi(features) {
  const campi = new Map();
  for (const f of features ?? []) {
    for (const [k, v] of Object.entries(f?.properties ?? {})) {
      if (v == null || v === '' || typeof v === 'object') continue;
      let c = campi.get(k);
      if (!c) campi.set(k, c = { valori: new Set(), numeri: [], numerico: true });
      if (c.valori.size <= MAX_VALORI) c.valori.add(String(v));
      if (typeof v === 'number' && Number.isFinite(v)) c.numeri.push(v); else c.numerico = false;
    }
  }
  return campi;
}

// Soglie crescenti per `classi` classi: «quantili» (stesso numero di elementi) o «intervalli» uguali.
// Possono risultare meno di classi-1 soglie se i valori sono pochi o ripetuti.
export function calcolaSoglie(numeri, classi, metodo = 'quantili') {
  const v = numeri.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length < 2 || classi < 2) return [];
  const n = Math.min(classi, MAX_CLASSI);
  const min = v[0];
  const max = v[v.length - 1];
  const grezze = Array.from({ length: n - 1 }, (_, i) => metodo === 'intervalli'
    ? min + (max - min) * (i + 1) / n
    : v[Math.min(v.length - 1, Math.floor(v.length * (i + 1) / n))]);
  const arrotonda = x => Number(x.toPrecision(4));
  const soglie = [];
  for (const s of grezze.map(arrotonda)) if (s > min && s <= max && (!soglie.length || s > soglie.at(-1))) soglie.push(s);
  return soglie;
}

// Etichette delle classi: «< a», «a – b», «≥ z»; con `unita` (es. « m») dopo l'ultimo numero di ogni etichetta.
export function etichetteClassi(soglie, unita = '') {
  const f = x => String(x);
  if (!soglie.length) return [];
  return [`< ${f(soglie[0])}${unita}`, ...soglie.slice(1).map((s, i) => `${f(soglie[i])} – ${f(s)}${unita}`), `≥ ${f(soglie.at(-1))}${unita}`];
}

// Espressione del colore, o null se l'attributo non è valido.
export function espressioneAttributo(a) {
  const att = validaAttributo(a);
  if (!att) return null;
  const valore = ['get', att.campo];
  if (att.tipo === 'categorie') {
    const voci = Object.entries(att.colori).flat();
    return ['match', ['to-string', valore], ...voci, COLORE_MANCANTE];
  }
  const colori = coloriRampa(att.rampa, att.soglie.length + 1, att.inverti);
  const step = ['step', valore, colori[0], ...att.soglie.flatMap((s, i) => [s, colori[i + 1]])];
  return ['case', ['==', ['typeof', valore], 'number'], step, COLORE_MANCANTE];
}

// Attributo ripulito oppure null.
// { campo, tipo: 'categorie', colori: { valore: #rrggbb } } | { campo, tipo: 'graduata', rampa, inverti?: true, soglie: [numeri crescenti] }
export function validaAttributo(a) {
  if (!a || typeof a !== 'object' || typeof a.campo !== 'string' || !a.campo || a.campo.length > 100) return null;
  if (a.tipo === 'categorie') {
    if (!a.colori || typeof a.colori !== 'object') return null;
    const colori = Object.fromEntries(Object.entries(a.colori).slice(0, MAX_CATEGORIE)
      .filter(([k, v]) => k.length <= 100 && typeof v === 'string' && HEX.test(v)));
    return Object.keys(colori).length ? { campo: a.campo, tipo: 'categorie', colori } : null;
  }
  if (a.tipo === 'graduata') {
    const s = a.soglie;
    if (!Array.isArray(s) || !s.length || s.length >= MAX_CLASSI) return null;
    if (!s.every((x, i) => typeof x === 'number' && Number.isFinite(x) && (i === 0 || x > s[i - 1]))) return null;
    return { campo: a.campo, tipo: 'graduata', rampa: a.rampa in RAMPE ? a.rampa : 'Blu', ...(a.inverti === true && { inverti: true }), soglie: [...s] };
  }
  return null;
}

// Voci di legenda di un attributo valido: { titolo, voci: [{ colore, testo }] }, oppure null.
// Per le categorie più di `max` voci si accorciano con «… altre N» (il pannello colore le elenca tutte).
export function legendaAttributo(a, max = 12) {
  const att = validaAttributo(a);
  if (!att) return null;
  if (att.tipo === 'categorie') {
    const tutte = vociCategorie(att.campo, att.colori);
    const voci = tutte.slice(0, max);
    if (tutte.length > max) voci.push({ colore: null, testo: `… altre ${tutte.length - max}` });
    return { titolo: nomeCampo(att.campo), voci };
  }
  const colori = coloriRampa(att.rampa, att.soglie.length + 1, att.inverti);
  return { titolo: nomeCampo(att.campo), voci: etichetteClassi(att.soglie, unitaCampo(att.campo)).map((testo, i) => ({ colore: colori[i], testo })) };
}
