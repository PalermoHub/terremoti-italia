// Un modulo che aspetta il prossimo clic sulla mappa (es. i due punti della sezione verticale) lo prenota qui:
// finché la prenotazione c'è, il clic va a lui e la scheda del luogo non si apre.
let ricevente = null;

// `fn(e)` riceve l'evento di clic di MapLibre; `null` libera la prenotazione
export const catturaClic = fn => { ricevente = fn; };
export const clicCatturato = e => {
  if (!ricevente) return false;
  ricevente(e);
  return true;
};
