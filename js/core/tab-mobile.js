// Barra a quattro tab per telefono (fino a 720 px): Mappa, Strati, Aggiungi, Menu.
// Un solo foglio aperto alla volta: «Strati» (basi, layer, filtri), «Aggiungi» (i miei layer, catalogo RNDT, Geoimage)
// e «Menu» (guide e pagine sul progetto). «Mappa» chiude tutto. Su schermi più larghi la barra non si vede
// (CSS) e l'interfaccia resta quella a barre laterali.
import { svgIcona } from './icone.js';
import { t as tr } from './i18n.js';

export const TAB = [
  { id: 'mappa', etichetta: tr('tab.mappa'), icona: 'mappa' },
  { id: 'strati', etichetta: tr('tab.strati'), icona: 'base' },
  { id: 'aggiungi', etichetta: tr('tab.aggiungi'), icona: 'miei' },
  { id: 'info', etichetta: tr('tab.menu'), icona: 'menu' },
];

// Titolo del foglio «barra degli strati» in base al tab; quali riquadri compaiono lo decide il CSS con body[data-foglio].
export const TITOLO_FOGLIO = { strati: tr('tab.strati'), aggiungi: tr('tab.aggiungi') };

export function collegaTabMobile(doc, { barraTitolo, suCambio = () => {}, suMappa = () => {} } = {}) {
  const barra = doc.createElement('nav');
  barra.id = 'barra-tab';
  barra.setAttribute('aria-label', tr('tab.sezioni'));
  const bottoni = new Map();
  let corrente = null; // 'strati' | 'aggiungi' | 'info' | null (mappa)

  const imposta = foglio => {
    corrente = foglio;
    const corpo = doc.body;
    corpo.classList.toggle('strati-aperti', foglio === 'strati' || foglio === 'aggiungi');
    corpo.classList.toggle('info-aperto', foglio === 'info');
    if (foglio) corpo.dataset.foglio = foglio; else delete corpo.dataset.foglio;
    if (barraTitolo && TITOLO_FOGLIO[foglio]) barraTitolo.textContent = TITOLO_FOGLIO[foglio];
    for (const [id, b] of bottoni) b.setAttribute('aria-pressed', String(id === (foglio ?? 'mappa')));
    suCambio(foglio);
  };

  for (const t of TAB) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.dataset.tab = t.id;
    b.innerHTML = `${svgIcona(t.icona, 22)}<span>${t.etichetta}</span>`;
    if (t.id === 'strati') {
      const conta = doc.createElement('i');
      conta.className = 'conta-strati';
      conta.setAttribute('aria-hidden', 'true');
      conta.textContent = '0';
      b.append(conta);
    }
    b.addEventListener('click', () => {
      imposta(t.id === 'mappa' || t.id === corrente ? null : t.id);
      if (t.id === 'mappa') suMappa(); // chiude anche i pannelli che coprono la mappa
    });
    bottoni.set(t.id, b);
    barra.append(b);
  }
  // il menù a comparsa si chiude toccando fuori (la mappa) o con Esc
  const fuori = e => { if (!e.target.closest?.('#menu-info, #barra-tab')) imposta(null); };
  doc.addEventListener('pointerdown', e => { if (corrente === 'info') fuori(e); });
  doc.addEventListener('keydown', e => { if (e.key === 'Escape' && corrente === 'info') imposta(null); });
  imposta(null);
  // se la finestra si allarga oltre i 720 px (rotazione, ridimensionamento) il foglio si chiude e il titolo torna quello della barra laterale
  const stretto = doc.defaultView?.matchMedia?.('(max-width: 720px)');
  stretto?.addEventListener('change', e => {
    if (e.matches) return;
    imposta(null);
    if (barraTitolo) barraTitolo.textContent = TITOLO_FOGLIO.strati;
  });
  return { barra, imposta, corrente: () => corrente };
}
