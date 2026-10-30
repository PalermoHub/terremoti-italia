// Calcoli puri della timeline («timetile» del filtro sulla mappa): titolo-intervallo, durata, finestra in millisecondi,
// istogramma impilato per classe di magnitudo e date di mezzanotte dell'asse. Niente DOM: li usa terremoti-pannello.js.
import { GIORNI_MAX, CLASSI_MAG, intervallo } from './scheda-terremoti.js';
import { classeMagnitudo } from '../core/magnitudo.js';

export const ORA_MS = 3600000;
export const GIORNO_MS = 24 * ORA_MS;
export const MIN_FINESTRA_MS = 6 * ORA_MS; // durata minima della finestra
export const PASSO_MS = 6 * ORA_MS; // «⏮ 6 h» / «6 h ⏭» e frecce da tastiera
export const BARRE = 120; // barre dell'istogramma: 6 ore ciascuna sui 30 giorni
export const VELOCITA_MS = [ORA_MS, 6 * ORA_MS, GIORNO_MS]; // «1 s = 1 h», «1 s = 6 h», «1 s = 1 giorno»
export const VELOCITA_INIZIALE = 1;
export const PRESET = [
  { chiave: 'live', ms: 6 * ORA_MS },
  { chiave: 'h24', ms: GIORNO_MS },
  { chiave: 'g7', ms: 7 * GIORNO_MS },
  { chiave: 'g30', ms: GIORNI_MAX * GIORNO_MS },
];

// Serie di tempo coperta dal grafico: gli ultimi GIORNI_MAX giorni o, con un periodo scelto, il periodo (fino a adesso)
export function serieTempo(f, adesso = Date.now()) {
  const p = f.periodo;
  return p ? { da: p.da, a: Math.max(p.da + ORA_MS, Math.min(p.a, adesso)) } : { da: adesso - GIORNI_MAX * GIORNO_MS, a: adesso };
}

// Finestra attuale del filtro in millisecondi, tagliata alla serie (il limite finale aperto vale «adesso»)
export function finestraMs(f, adesso = Date.now()) {
  const s = serieTempo(f, adesso);
  const [da, a] = intervallo(f, adesso);
  return { da: Math.max(s.da, da), a: Math.min(s.a, a) };
}

// Finestra in millisecondi → `filtro.finestra` (unità di 1/GIORNI_MAX della serie). Una finestra che arriva in fondo alla serie ha il limite aperto.
export function finestraDaMs(da, a, s) {
  const u = ms => (ms - s.da) / (s.a - s.da) * GIORNI_MAX;
  return [da - s.da <= 1000 ? 0 : Math.max(0, u(da)), s.a - a <= 1000 ? GIORNI_MAX : Math.min(GIORNI_MAX, u(a))]; // entro un secondo dal bordo conta il bordo (il limite aperto tiene gli eventi nuovi)
}

// Sposta (`da`, `a`) di `delta` ms tenendo l'ampiezza e restando dentro la serie
export function spostaFinestra({ da, a }, delta, s) {
  const largo = a - da;
  const nuovoDa = Math.min(s.a - largo, Math.max(s.da, da + delta));
  return { da: nuovoDa, a: nuovoDa + largo };
}

// Porta un bordo (`da` o `a`) a `ms` senza scendere sotto la durata minima né uscire dalla serie
export function ridimensionaFinestra({ da, a }, bordo, ms, s) {
  if (bordo === 'da') return { da: Math.min(a - MIN_FINESTRA_MS, Math.max(s.da, ms)), a };
  return { da, a: Math.max(da + MIN_FINESTRA_MS, Math.min(s.a, ms)) };
}

// Il preset (indice di PRESET) che coincide con la finestra: fine in fondo alla serie e stessa durata, con la tolleranza di un'ora
export function presetAttivo({ da, a }, s, f) {
  if (f.periodo || s.a - a > ORA_MS) return -1;
  return PRESET.findIndex(p => Math.abs((a - da) - p.ms) <= ORA_MS);
}

const giornoMese = (ms, loc) => new Date(ms).toLocaleDateString(loc, { day: 'numeric', month: 'short' });
const stessoGiorno = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const stessoMese = (a, b) => { const x = new Date(a), y = new Date(b); return x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear(); };

// Titolo in grande: «24–27 ott», «28 ott – 2 nov» o la sola data se la finestra sta in un giorno
export function titoloIntervallo(da, a, loc) {
  const fine = a - 1; // la mezzanotte esatta appartiene al giorno dopo
  if (stessoGiorno(da, fine)) return giornoMese(da, loc);
  if (stessoMese(da, fine)) return `${new Date(da).getDate()}–${giornoMese(fine, loc)}`;
  return `${giornoMese(da, loc)} – ${giornoMese(fine, loc)}`;
}

// Durata come numero e unità: sotto le 24 ore in ore, poi in giorni
export function durataFinestra(da, a) {
  const ore = Math.max(1, Math.round((a - da) / ORA_MS));
  return ore < 24 ? { n: ore, unita: 'ore' } : { n: Math.round(ore / 24), unita: 'giorni' };
}

// Istogramma impilato: per ogni barra (BARRE intervalli uguali della serie) gli eventi per classe di magnitudo.
// Conta solo gli eventi che passano `ammesso` (filtri tranne finestra e classi, scelti da chi chiama).
export function istogramma(eventi, s, ammesso) {
  const barre = Array.from({ length: BARRE }, () => Array(CLASSI_MAG.length).fill(0));
  const largo = (s.a - s.da) / BARRE;
  for (const e of eventi) {
    if (e.ts < s.da || e.ts > s.a || !ammesso(e)) continue;
    barre[Math.min(BARRE - 1, Math.floor((e.ts - s.da) / largo))][classeMagnitudo(e.mag)]++;
  }
  return barre;
}

// Date di mezzanotte (ora locale) dentro la serie, diradate a non più di `max` etichette; `pct` = posizione sull'asse
export function mezzanotti(s, max = 7) {
  const tutte = [];
  for (let d = new Date(s.da), m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); m.getTime() < s.a; m = new Date(m.getFullYear(), m.getMonth(), m.getDate() + 1)) {
    tutte.push({ ms: m.getTime(), pct: (m.getTime() - s.da) / (s.a - s.da) * 100 });
  }
  const passo = Math.max(1, Math.ceil(tutte.length / max));
  return tutte.filter((_, i) => i % passo === 0).filter(m => m.pct > 4 && m.pct < 94); // né attaccate al bordo sinistro né a quello destro (manca lo spazio per il nome)
}
