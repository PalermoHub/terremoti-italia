// Colore uniforme di poligoni, punti e linee per strato: parte pura (validazione, applicazione alla mappa, salvataggio e file JSON).
// Il pannello che lo usa sta in pannello-tema.js.
import { validaAttributo, espressioneAttributo } from './tema-attributo.js';
import { impostaBaseEdifici3d } from './colori-3d.js';
import { t as tr } from './i18n.js';

export const CHIAVE = 'dt-temi-strati';
const VERSIONE = 1;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const MAX_SPESSORE = 10;
const MAX_CATEGORIE = 200;

// Colore nel formato #rrggbb richiesto da <input type=color>; `ripiego` se il valore non è un colore semplice
// (espressione MapLibre, nome, assente).
export function comeEsadecimale(valore, ripiego = '#888888') {
  if (typeof valore !== 'string') return ripiego;
  const v = valore.trim();
  if (HEX.test(v)) return (v.length === 4 ? '#' + [...v.slice(1)].map(c => c + c).join('') : v).toLowerCase();
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(v);
  if (m) return '#' + m.slice(1, 4).map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('');
  return ripiego;
}

// Tema ripulito: solo campi validi; null se non resta nulla. { riempimento?, bordo?, spessore?, categorie?, attributo? }
export function validaTema(t) {
  if (!t || typeof t !== 'object') return null;
  const r = {};
  if (typeof t.riempimento === 'string' && HEX.test(t.riempimento)) r.riempimento = comeEsadecimale(t.riempimento);
  if (typeof t.bordo === 'string' && HEX.test(t.bordo)) r.bordo = comeEsadecimale(t.bordo);
  if (typeof t.spessore === 'number' && Number.isFinite(t.spessore) && t.spessore >= 0 && t.spessore <= MAX_SPESSORE) r.spessore = t.spessore;
  if (t.categorie && typeof t.categorie === 'object') {
    const c = Object.fromEntries(Object.entries(t.categorie).slice(0, MAX_CATEGORIE)
      .filter(([k, v]) => k.length <= 100 && typeof v === 'string' && HEX.test(v)).map(([k, v]) => [k, comeEsadecimale(v)]));
    if (Object.keys(c).length) r.categorie = c;
  }
  const attributo = validaAttributo(t.attributo);
  if (attributo) r.attributo = attributo;
  return Object.keys(r).length ? r : null;
}

// Colori per categoria: espressione `['match', ['get', campo], valore, colore, ..., ripiego]` con valori testuali e colori semplici.
// Restituisce { campo, voci: [[valore, colore]], ripiego } oppure null se il colore non è di questo tipo.
export function leggiMatch(espressione) {
  if (!Array.isArray(espressione) || espressione[0] !== 'match') return null;
  const [, input, ...resto] = espressione;
  if (!Array.isArray(input) || input[0] !== 'get' || typeof input[1] !== 'string' || resto.length % 2 !== 1) return null;
  const voci = [];
  for (let i = 0; i < resto.length - 1; i += 2) {
    if (typeof resto[i] === 'string' && typeof resto[i + 1] === 'string') voci.push([resto[i], resto[i + 1]]);
  }
  return voci.length ? { campo: input[1], voci, ripiego: resto.at(-1) } : null;
}

// La stessa espressione con i colori sostituiti da `sostituti` ({ valore: #rrggbb }).
export function riscriviMatch(espressione, sostituti) {
  const copia = [...espressione];
  for (let i = 2; i < copia.length - 1; i += 2) {
    if (typeof copia[i] === 'string' && sostituti[copia[i]]) copia[i + 1] = sostituti[copia[i]];
  }
  return copia;
}

// «forme» = punti a forma (layer symbol con icone SDF, metadata.forme: vedi forme.js): colore e bordo (alone) sono quelli dell'icona.
// Gli altri layer symbol (etichette, icone a colori) non fanno parte del tema.
const PROPRIETA_COLORE = { fill: 'fill-color', circle: 'circle-color', line: 'line-color', forme: 'icon-color' };
const PROPRIETA_OPACITA = { fill: 'fill-opacity', circle: 'circle-opacity', line: 'line-opacity', forme: 'icon-opacity' };
const tipoLayer = l => (l?.type === 'symbol' ? (l.metadata?.forme ? 'forme' : null) : l?.type);

// Proprietà del bordo di un layer di punti: il contorno del cerchio o l'alone dell'icona.
export const proprietaBordoPunto = (map, id) => (map.getLayer(id)?.type === 'symbol' ? 'icon-halo-color' : 'circle-stroke-color');

// Proprietà del colore principale di un layer di riempimento o di punti (null per gli altri tipi).
export function proprietaColore(map, id) {
  const tipo = tipoLayer(map.getLayer(id));
  return tipo === 'fill' || tipo === 'circle' || tipo === 'forme' ? PROPRIETA_COLORE[tipo] : null;
}

// Layer dello strato che il tema colora (esclusi quelli trasparenti di sola selezione):
// - riempimenti: poligoni, per il bordo (fill-outline-color);
// - punti: cerchi, per il bordo (circle-stroke-color);
// - uniformi: riempimenti e punti con un colore semplice, su cui vale «Riempimento»; gli altri (per categoria o dato)
//   non si sovrascrivono con un colore solo, per non perdere la tematizzazione;
// - categorie: layer con colore per categoria, ciascuno col suo `match`, per colorare ogni categoria;
// - linee: tutte le linee, per lo spessore;
// - lineeColore: le linee con un colore semplice, su cui vale «Bordo» (colore della linea);
// - volumi: volumi 3D (fill-extrusion), colorati solo per attributo (il loro colore lo condividono coi layer: vedi colori-3d.js).
export function partiStrato(map, ids) {
  const p = { riempimenti: [], punti: [], uniformi: [], categorie: [], linee: [], lineeColore: [], volumi: [] };
  for (const id of ids) {
    const l = map.getLayer(id);
    const tipo = tipoLayer(l);
    if (tipo === 'fill-extrusion') { p.volumi.push(id); continue; }
    const prop = tipo && PROPRIETA_COLORE[tipo];
    if (!prop) continue;
    if (map.getPaintProperty(id, PROPRIETA_OPACITA[tipo]) === 0) continue;
    const colore = map.getPaintProperty(id, prop);
    const m = leggiMatch(colore);
    const semplice = colore == null || typeof colore === 'string';
    if (m) p.categorie.push({ id, prop, ...m });
    if (tipo === 'line') {
      p.linee.push(id);
      if (!m && semplice) p.lineeColore.push(id);
    } else {
      if (!m && semplice) p.uniformi.push(id);
      (tipo === 'fill' ? p.riempimenti : p.punti).push(id);
    }
  }
  return p;
}

// Applica il tema; un campo assente ripristina il valore originale (ricordato in `originali` alla prima modifica).
export function applicaTema(map, parti, tema, originali) {
  const imposta = (id, prop, valore) => {
    const k = `${id}|${prop}`;
    if (valore === undefined && !originali.has(k)) return;
    if (!originali.has(k)) originali.set(k, map.getPaintProperty(id, prop) ?? null);
    map.setPaintProperty(id, prop, valore === undefined ? originali.get(k) : valore);
  };
  // Il colore per attributo prevale su riempimento e categorie: colora poligoni e punti, le linee solo se lo strato ne ha di sole.
  const espr = espressioneAttributo(tema?.attributo);
  const sole = !parti.riempimenti.length && !parti.punti.length;
  const perAttributo = [
    ...parti.riempimenti.map(id => [id, 'fill-color']),
    ...parti.punti.map(id => [id, proprietaColore(map, id)]),
    ...(sole ? parti.linee.map(id => [id, 'line-color']) : []),
  ];
  for (const [id, prop] of perAttributo) imposta(id, prop, espr ?? undefined);
  if (parti.volumi?.length) impostaBaseEdifici3d(map, espr);
  const inAttributo = new Set(espr ? perAttributo.map(([id, prop]) => `${id}|${prop}`) : []);
  for (const id of parti.uniformi) if (!inAttributo.has(`${id}|${proprietaColore(map, id)}`)) imposta(id, proprietaColore(map, id), tema?.riempimento);
  for (const id of parti.riempimenti) imposta(id, 'fill-outline-color', tema?.bordo);
  for (const id of parti.punti) imposta(id, proprietaBordoPunto(map, id), tema?.bordo);
  for (const id of parti.lineeColore) if (!inAttributo.has(`${id}|line-color`)) imposta(id, 'line-color', tema?.bordo);
  for (const id of parti.linee) imposta(id, 'line-width', tema?.spessore);
  for (const { id, prop } of parti.categorie) {
    const k = `${id}|${prop}`;
    if (inAttributo.has(k)) continue;
    if (!tema?.categorie && !originali.has(k)) continue;
    if (!originali.has(k)) originali.set(k, map.getPaintProperty(id, prop));
    const base = originali.get(k);
    map.setPaintProperty(id, prop, tema?.categorie ? riscriviMatch(base, tema.categorie) : base);
  }
}

// Temi salvati: { idStrato: tema }. Lo storage può mancare o rifiutare la scrittura.
export function leggiTemi(storage) {
  try {
    const grezzo = JSON.parse(storage?.getItem(CHIAVE)) ?? {};
    return Object.fromEntries(Object.entries(grezzo).map(([id, t]) => [id, validaTema(t)]).filter(([, t]) => t));
  } catch { return {}; }
}
export function salvaTemi(storage, temi) {
  try { storage.setItem(CHIAVE, JSON.stringify(temi)); } catch { /* il tema vale per la sessione */ }
}

// File JSON: { versione, strati: { idStrato: tema } }
export function esportaTemi(temi) {
  return JSON.stringify({ versione: VERSIONE, strati: temi }, null, 2);
}
export function importaTemi(testo) {
  let o;
  try { o = JSON.parse(testo); } catch { throw new Error(tr('tema.fileNonJson')); }
  if (o?.versione !== VERSIONE || !o.strati || typeof o.strati !== 'object') throw new Error(tr('tema.fileNonTema'));
  const temi = Object.fromEntries(Object.entries(o.strati).map(([id, t]) => [id, validaTema(t)]).filter(([, t]) => t));
  if (!Object.keys(temi).length) throw new Error(tr('tema.fileVuoto'));
  return temi;
}
