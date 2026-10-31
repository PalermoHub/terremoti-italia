// Foglio del tab «Menu» (telefono): le voci rimandano ai pulsanti della barra degli strumenti, che su schermo stretto
// restano nascosti (CSS). Il clic passa al pulsante originale, così menu, modale e lingua si comportano come su desktop.
import { svgIcona } from './icone.js';
import { t as tr } from './i18n.js';

const VOCI = [
  { id: 'btn-info', icona: 'info', etichetta: 'html.btn.info' },
  { id: 'btn-condividi', icona: 'condividi', etichetta: 'html.btn.condividi' },
  { id: 'btn-stampa', icona: 'stampa', etichetta: 'html.btn.stampa' },
  { id: 'btn-tema', icona: 'luna', etichetta: 'html.tema' },
  { id: 'switch-lingua', icona: 'globo', etichetta: 'lingua.passa' }, // creato da i18n.js dopo l'avvio: si cerca al clic
];

export function creaMenuMobile(doc, { chiudi = () => {} } = {}) {
  const menu = doc.createElement('nav');
  menu.id = 'menu-info';
  menu.setAttribute('aria-label', tr('tab.menu'));
  for (const v of VOCI) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="menu-icona">${svgIcona(v.icona, 20)}</span><span>${tr(v.etichetta)}</span>`;
    b.addEventListener('click', () => { chiudi(); doc.getElementById(v.id)?.click(); });
    menu.append(b);
  }
  return menu;
}
