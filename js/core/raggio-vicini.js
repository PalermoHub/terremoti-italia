// Raggio dei punti «nei dintorni del clic» (`scheda.vicini`): uno solo per tutti i layer, regolabile dalla legenda.
// Il valore sta in localStorage (per chi lo apre ancora); il browser arriva come parametro.
import { t } from './i18n.js';

export const CHIAVE_RAGGIO = 'dt-raggio-vicini';
export const CHIAVE_CERCHIO = 'dt-raggio-cerchio';
export const RAGGIO_MIN = 100;
export const RAGGIO_MAX = 500;
export const RAGGIO_PASSO = 50;
export const RAGGIO_INIZIALE = 300; // metri
export const EVENTO_RAGGIO = 'dt:raggio'; // sul document a ogni modifica (raggio o cerchio): la scheda aperta si rifà

// Valore valido più vicino: numero tra min e max, a passi interi; il resto torna al valore iniziale.
export function normalizzaRaggio(v) {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return RAGGIO_INIZIALE;
  return Math.min(RAGGIO_MAX, Math.max(RAGGIO_MIN, Math.round(n / RAGGIO_PASSO) * RAGGIO_PASSO));
}

let corrente = RAGGIO_INIZIALE;
export const raggioVicini = () => corrente;

export function caricaRaggio(storage) {
  try { corrente = normalizzaRaggio(storage?.getItem(CHIAVE_RAGGIO)); } catch { corrente = RAGGIO_INIZIALE; }
  return corrente;
}

// Cerchio del raggio in mappa: acceso all'inizio.
let cerchio = true;
export const cerchioVisibile = () => cerchio;

export function caricaCerchio(storage) {
  try { cerchio = storage?.getItem(CHIAVE_CERCHIO) !== '0'; } catch { cerchio = true; }
  return cerchio;
}

export function impostaCerchio(v, storage = null) {
  cerchio = Boolean(v);
  try { storage?.setItem(CHIAVE_CERCHIO, cerchio ? '1' : '0'); } catch { /* storage bloccato: vale la sessione */ }
  return cerchio;
}

export function impostaRaggio(v, storage = null) {
  corrente = normalizzaRaggio(v);
  try { storage?.setItem(CHIAVE_RAGGIO, String(corrente)); } catch { /* storage bloccato: vale la sessione */ }
  return corrente;
}

// Riga con cursore e interruttore del cerchio da mettere nel riquadro della legenda; restituisce il nodo.
export function creaRegolatoreRaggio(storage = null) {
  caricaRaggio(storage);
  caricaCerchio(storage);
  const riga = document.createElement('div');
  riga.id = 'legende-raggio';
  const testo = document.createElement('span');
  const cursore = Object.assign(document.createElement('input'), { type: 'range', min: RAGGIO_MIN, max: RAGGIO_MAX, step: RAGGIO_PASSO, value: corrente });
  const mostra = () => { testo.textContent = t('legenda.raggio.etichetta', { m: corrente }); };
  cursore.addEventListener('input', () => { impostaRaggio(cursore.value, storage); mostra(); document.dispatchEvent(new Event(EVENTO_RAGGIO)); });
  mostra();
  const interruttore = document.createElement('label');
  interruttore.className = 'legende-raggio-cerchio';
  const casella = Object.assign(document.createElement('input'), { type: 'checkbox', checked: cerchio, role: 'switch' });
  casella.addEventListener('change', () => { impostaCerchio(casella.checked, storage); document.dispatchEvent(new Event(EVENTO_RAGGIO)); });
  interruttore.append(t('legenda.raggio.cerchio'), casella);
  riga.append(testo, cursore, interruttore);
  return riga;
}
