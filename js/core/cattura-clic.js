// Un modulo che aspetta il prossimo clic sulla mappa (es. i due punti della sezione verticale) lo prenota qui:
// finché la prenotazione c'è, il clic va a lui e la scheda del luogo non si apre.
let ricevente = null;
// Un modulo che vuole i clic veri sulla mappa finché è acceso (es. il popup della geologia sul telefono) li intercetta qui:
// `fn(e)` risponde true se il clic è suo. Più moduli possono intercettare: basta che uno risponda true; i clic simulati (senza `originalEvent`: link condivisi,
// frecce della scheda, collegamento del popup alla scheda) passano sempre alla scheda.
const intercettori = [];
export const intercettaClic = fn => { if (fn) intercettori.push(fn); else intercettori.length = 0; }; // `null` li libera tutti

// `fn(e)` riceve l'evento di clic di MapLibre; `null` libera la prenotazione
export const catturaClic = fn => { ricevente = fn; };
export const clicCatturato = e => {
  if (ricevente) { ricevente(e); return true; }
  return !!e.originalEvent && intercettori.some(fn => fn(e) === true);
};
