// Pannello «Confronto»: ospita la scheda del confronto tra due anni (filtri, tabella, istogramma) creata dallo strato.
// Si apre dal bottone nel rail, che accende anche lo strato; si chiude con la X.
import { t } from './i18n.js';
import { el } from './scheda-disegno.js';

const ICONA_X = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const CASELLA_STRATO = '#strato-terremoti-confronto';

export function collegaConfronto(pannello, nodo) {
  const x = el('button', 'scheda-x');
  x.type = 'button';
  x.title = t('scheda.chiudi');
  x.setAttribute('aria-label', t('scheda.chiudi'));
  x.innerHTML = ICONA_X;
  const riga = el('div', 'scheda-testata');
  riga.append(el('h2', null, t('rail.confronto')), x);
  const testata = el('header', 'scheda-intestazione');
  testata.append(riga);
  const corpo = el('div', 'scheda-corpo');
  if (nodo) corpo.append(nodo);
  pannello.replaceChildren(testata, corpo);
  x.addEventListener('click', () => { pannello.hidden = true; });
}

// Mostra il pannello e accende lo strato se è spento (la prima volta parte anche il confronto tra gli ultimi due anni)
export function apriConfronto(pannello) {
  pannello.hidden = false;
  const casella = document.querySelector(CASELLA_STRATO);
  if (casella && !casella.checked) { casella.checked = true; casella.dispatchEvent(new Event('change', { bubbles: true })); }
}
