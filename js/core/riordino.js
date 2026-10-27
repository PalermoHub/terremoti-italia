// Riordino degli strati nel pannello: in alto nell'elenco = sopra sulla mappa. Qui la parte pura (testabile);
// il collegamento al DOM sta in pannello.js.
export const CHIAVE = 'dt-ordine-strati';

// Copia di `a` con l'elemento in `da` portato in `a_` (limitato ai bordi).
export function sposta(a, da, a_) {
  const r = [...a];
  const [x] = r.splice(da, 1);
  r.splice(Math.max(0, Math.min(r.length, a_)), 0, x);
  return r;
}

// `ids` nell'ordine salvato; quelli non salvati (strati nuovi) vanno in coda nell'ordine originale.
export function ordina(ids, salvato) {
  if (!Array.isArray(salvato)) return [...ids];
  const posto = id => { const i = salvato.indexOf(id); return i < 0 ? Infinity : i; };
  return ids.map((id, i) => ({ id, i })).sort((a, b) => posto(a.id) - posto(b.id) || a.i - b.i).map(x => x.id);
}

// Mosse `[id, prima]` (come map.moveLayer) per far disegnare gli strati nell'ordine dell'elenco.
// `stack` = id dei layer della mappa dal basso; `strati` = layer di ogni strato, dal primo dell'elenco (sopra) in giù.
// I layer del gruppo si compattano nella posizione del più alto; dentro uno strato resta l'ordine che hanno già.
export function mosseMappa(stack, strati) {
  const indice = new Map(stack.map((id, i) => [id, i]));
  return mosseSequenza(stack, [...strati].reverse().flatMap(ids => ids.filter(id => indice.has(id)).sort((a, b) => indice.get(a) - indice.get(b))));
}

// Le stesse mosse per una sequenza di layer data dal basso verso l'alto (usata anche per tornare all'ordine iniziale).
export function mosseSequenza(stack, bersaglio) {
  const indice = new Map(stack.map((id, i) => [id, i]));
  bersaglio = bersaglio.filter(id => indice.has(id));
  if (!bersaglio.length) return [];
  const insieme = new Set(bersaglio);
  const cima = Math.max(...bersaglio.map(id => indice.get(id)));
  const rif = stack[cima + 1]; // sopra al più alto non c'è nessun layer del gruppo
  const resto = stack.filter(id => !insieme.has(id));
  const dopo = [...resto.slice(0, rif === undefined ? resto.length : resto.indexOf(rif)), ...bersaglio, ...(rif === undefined ? [] : resto.slice(resto.indexOf(rif)))];
  if (dopo.every((id, i) => id === stack[i])) return [];
  return bersaglio.map((id, k) => [id, k === bersaglio.length - 1 ? rif : bersaglio[k + 1]]).reverse();
}

export function applicaMosse(map, mosse) {
  for (const [id, prima] of mosse) map.moveLayer(id, prima);
}

// Ordine salvato per gruppo: { gruppo: [idStrato, ...] }. Lo storage può mancare o rifiutare la scrittura.
export function leggiOrdine(storage) {
  try { return JSON.parse(storage?.getItem(CHIAVE)) ?? {}; } catch { return {}; }
}
export function salvaOrdine(storage, gruppo, ids) {
  try { storage.setItem(CHIAVE, JSON.stringify({ ...leggiOrdine(storage), [gruppo]: ids })); } catch { /* ordine solo per la sessione */ }
}
export function azzeraOrdine(storage, gruppo) {
  try {
    const { [gruppo]: _, ...resto } = leggiOrdine(storage);
    storage.setItem(CHIAVE, JSON.stringify(resto));
  } catch { /* niente da azzerare */ }
}

// --- Ordine di disegno globale: tutti gli strati, di qualsiasi gruppo, in un unico elenco (in alto = sopra sulla mappa) ---

// Simula `map.moveLayer` su una lista di id (senza `prima` in cima).
function simulaMosse(stack, mosse) {
  const s = [...stack];
  for (const [id, prima] of mosse) { s.splice(s.indexOf(id), 1); s.splice(prima === undefined ? s.length : s.indexOf(prima), 0, id); }
  return s;
}

// Id degli strati dall'alto in basso, secondo il loro layer più alto nello stack; senza layer in mappa restano fuori.
// `strati` = [{ id, layers }].
export function ordineStrati(stack, strati) {
  const indice = new Map(stack.map((id, i) => [id, i]));
  const cima = s => Math.max(-1, ...s.layers.filter(id => indice.has(id)).map(id => indice.get(id)));
  return strati.map((s, i) => ({ id: s.id, c: cima(s), i })).filter(x => x.c >= 0).sort((a, b) => b.c - a.c || a.i - b.i).map(x => x.id);
}

// Mosse per mettere i layer `spostati` (di uno strato) subito sopra (o sotto) quelli di `riferimento`, senza toccare gli altri.
export function mosseVicino(stack, spostati, riferimento, sopra) {
  const indice = new Map(stack.map((id, i) => [id, i]));
  const mossi = new Set(spostati.filter(id => indice.has(id)));
  const rif = riferimento.filter(id => indice.has(id) && !mossi.has(id));
  if (!mossi.size || !rif.length) return [];
  const posti = rif.map(id => indice.get(id));
  const prima = sopra ? stack.slice(Math.max(...posti) + 1).find(id => !mossi.has(id)) : stack[Math.min(...posti)];
  const mosse = stack.filter(id => mossi.has(id)).map(id => [id, prima]);
  const dopo = simulaMosse(stack, mosse);
  return dopo.every((id, i) => id === stack[i]) ? [] : mosse;
}

// Mosse per portare gli strati nell'ordine `ordine` (id dall'alto in basso); gli id sconosciuti si ignorano.
export function mosseOrdine(stack, strati, ordine) {
  const per = new Map(strati.map(s => [s.id, s.layers]));
  const ids = ordine.filter(id => per.has(id));
  const tutte = [];
  let corrente = stack;
  for (let i = ids.length - 2; i >= 0; i--) { // dal fondo: ogni strato subito sopra quello che lo segue
    const m = mosseVicino(corrente, per.get(ids[i]), per.get(ids[i + 1]), true);
    tutte.push(...m);
    corrente = simulaMosse(corrente, m);
  }
  return tutte;
}

// Ordine di disegno salvato: [idStrato, ...] dall'alto; null se manca o lo storage non risponde.
export const CHIAVE_DISEGNO = 'dt-ordine-disegno';
export function leggiOrdineDisegno(storage) {
  try { const v = JSON.parse(storage?.getItem(CHIAVE_DISEGNO)); return Array.isArray(v) ? v : null; } catch { return null; }
}
export function salvaOrdineDisegno(storage, ids) {
  try { storage.setItem(CHIAVE_DISEGNO, JSON.stringify(ids)); } catch { /* ordine solo per la sessione */ }
}
export function azzeraOrdineDisegno(storage) {
  try { storage.removeItem(CHIAVE_DISEGNO); } catch { /* niente da azzerare */ }
}

// Il blocco visibile più vicino a `i` nella direzione `verso` (-1 su, +1 giù), saltando quelli nascosti (sottogruppo chiuso); null se non c'è.
export function vicinoVisibile(blocchi, i, verso, visibile) {
  for (let j = i + verso; j >= 0 && j < blocchi.length; j += verso) if (visibile(blocchi[j])) return blocchi[j];
  return null;
}
