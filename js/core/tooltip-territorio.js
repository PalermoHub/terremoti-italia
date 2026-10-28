import { disegnaVoceTooltip, registraTooltip } from './tooltip.js';

// Il tooltip del gruppo «Territorio» ha una sezione per strato (confini comunali, pericolosità sismica, classificazione sismica),
// ognuna con la sua intestazione: icona colorata col colore di legenda e nome dello strato, come tutti gli altri popup.
// Le sezioni sono complete se almeno uno dei tre strati è acceso: quelli spenti non si vedono, ma i loro dati si leggono lo stesso
// da riempimenti trasparenti che ogni strato accende insieme al gruppo (vedi `suStatoTerritorio`).
// Niente ripetizioni: il nome del comune sta solo nella sezione dei confini, e la zona sismica solo in quella della classificazione.
const accesi = new Set();
const ascoltatori = [];
export const territorioAttivo = () => accesi.size > 0;
export function segnaStratoTerritorio(id, attivo) {
  if (attivo) accesi.add(id); else accesi.delete(id);
  for (const f of ascoltatori) f(territorioAttivo());
}
export const suStatoTerritorio = f => ascoltatori.push(f); // f(gruppoAttivo)

// Registra la sezione di uno strato. `ordine` 0, 1, 2 = confini → pericolosità → classificazione (una sotto l'altra nel riquadro).
// `modello(e)` dà il modello della voce (sezione, icona, colore, titolo, sottotitolo, elenco…, e `dopoDisegno?(nodo)`) o null.
export function registraSezioneTerritorio(map, ordine, modello) {
  registraTooltip(map, e => {
    const m = modello(e);
    if (!m) return null;
    const nodo = disegnaVoceTooltip(m);
    m.dopoDisegno?.(nodo);
    return { contenuto: nodo, colore: m.colore };
  }, 3 + ordine / 10);
}
