// Pannello «Storico»: ospita le sezioni dei terremoti dell'archivio, che la scheda gli passa con l'evento `scheda:storico`.
// Si apre dal clic su un evento storico (o dal suo bottone nel rail); si chiude con la X o quando la scheda si chiude.
import { t } from './i18n.js';
import { el } from './scheda-disegno.js';

const ICONA_X = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

export function collegaStorico(pannello) {
  const titolo = el('h2', null, t('scheda.tab.storico'));
  const x = el('button', 'scheda-x');
  x.type = 'button';
  x.title = t('scheda.chiudi');
  x.setAttribute('aria-label', t('scheda.chiudi'));
  x.innerHTML = ICONA_X;
  const riga = el('div', 'scheda-testata');
  riga.append(titolo, x);
  const testata = el('header', 'scheda-intestazione');
  testata.append(riga);
  const corpo = el('div', 'scheda-corpo');
  pannello.replaceChildren(testata, corpo);

  const chiudi = () => { pannello.hidden = true; };
  x.addEventListener('click', chiudi);
  document.addEventListener('scheda:chiusa', chiudi);
  document.addEventListener('scheda:storico', e => {
    const sezioni = e.detail.sezioni;
    for (const sz of sezioni) sz.hidden = false;
    corpo.replaceChildren(...sezioni);
    corpo.scrollTop = 0;
    pannello.hidden = !sezioni.length;
  });
}
