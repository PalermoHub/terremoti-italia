import { svgIcona } from '../core/icone.js';
import { t, tl } from '../core/i18n.js';

// Popup di aerei e navi: scheda scura con intestazione (icona e sezione), titolo, righe etichetta/valore e coordinate.
// Il modello (titolo, sottotitolo, righe) viene da scheda-voli.js / scheda-navi.js, lo stesso della scheda di destra.

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

const gradi = (v, pos, neg) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`;

// opzioni: { sezione, icona, colore, modello: { titolo, sottotitolo, righe? }, corpo?: nodi in più (foto, descrizione, elenchi), azione?: badge cliccabile a destra del sottotitolo, sottotitoloBadge?: il sottotitolo come badge del colore della sezione, coordinate: [lon, lat], chiudi }
export function contenutoPopupTraffico({ sezione, icona, colore, modello, corpo = [], azione, sottotitoloBadge, coordinate, chiudi }) {
  const radice = el('div', 'traffico-popup');
  radice.style.setProperty('--traffico-colore', colore);

  const testa = el('div', 'traffico-testa');
  const marchio = el('span', 'traffico-marchio');
  marchio.innerHTML = svgIcona(icona, 14);
  const chiusura = el('button', 'traffico-chiudi', '×');
  chiusura.type = 'button';
  chiusura.setAttribute('aria-label', t('comune.chiudi'));
  chiusura.addEventListener('click', chiudi);
  testa.append(marchio, el('span', 'traffico-sezione', tl(sezione)), chiusura);

  radice.append(testa, el('h3', 'traffico-titolo', tl(modello.titolo)));
  if (modello.badge?.testo) {
    const badge = el('span', 'tooltip-badge', modello.badge.testo);
    badge.style.setProperty('--colore', modello.badge.colore);
    radice.append(badge);
  }
  if (modello.sottotitolo || azione) {
    const riga = el('div', 'traffico-riga-stato');
    if (sottotitoloBadge && modello.sottotitolo) {
      const badge = el('span', 'tooltip-badge', tl(modello.sottotitolo));
      badge.style.setProperty('--colore', colore);
      riga.append(badge);
    } else riga.append(el('p', 'traffico-stato', modello.sottotitolo ? tl(modello.sottotitolo) : ''));
    if (azione) riga.append(azione);
    radice.append(riga);
  }

  if (corpo.length) {
    const blocco = el('div', 'traffico-corpo');
    blocco.append(...corpo);
    radice.append(blocco);
  }

  if (modello.righe?.length) {
    const lista = el('dl', 'traffico-righe');
    for (const r of modello.righe) {
      const dt = el('dt');
      if (r.nodo) dt.append(r.nodo); // simbolo davanti all'etichetta (es. il cerchio della magnitudo)
      dt.append(tl(r.etichetta));
      const dd = el('dd', null, r.valoreNodo ? '' : tl(String(r.valore)));
      if (r.valoreNodo) dd.append(r.valoreNodo);
      lista.append(dt, dd);
    }
    radice.append(lista);
  }

  if (coordinate) {
    const [lon, lat] = coordinate;
    radice.append(el('p', 'traffico-coordinate', `${gradi(lat, 'N', 'S')} · ${gradi(lon, 'E', 'O')}`));
  }
  return radice;
}

// Dove mettere la scheda rispetto al mezzo: dal lato (destra o sinistra) con più spazio libero e, se c'è posto, sopra.
// La scheda sta di lato alla linea di richiamo: il tratto verticale sale dal mezzo, quello orizzontale (ORIZZ px) entra nel bordo della scheda.
const ORIZZ = 28;
const BASSO = 27; // distanza tra il mezzo e il bordo vicino della scheda
const LARGHEZZA = 300;
const ALTEZZA = 320; // stima, finché la scheda non è misurata

const spostamento = (anchor, altezza) => [anchor.endsWith('left') ? ORIZZ : -ORIZZ, anchor.startsWith('top') ? -(altezza + BASSO) : altezza + BASSO];

// «top-…»: la scheda sta sopra il mezzo (ancorata col bordo alto), «bottom-…»: sotto. «…-left»: si apre a destra del mezzo.
export function ancoraPopupTraffico(punto, contenitore) {
  const destra = contenitore.clientWidth - punto.x;
  const sotto = contenitore.clientHeight - punto.y;
  const lato = destra >= LARGHEZZA + ORIZZ || destra >= punto.x ? 'left' : 'right';
  const sopra = punto.y >= ALTEZZA + BASSO || punto.y >= sotto;
  const anchor = `${sopra ? 'top' : 'bottom'}-${lato}`;
  return { anchor, offset: spostamento(anchor, ALTEZZA) };
}

// Dopo addTo: misura la scheda, allunga la linea e porta la scheda a BASSO px dal mezzo.
export function rifinisciPopupTraffico(popup, anchor, colore) {
  const radice = popup.getElement();
  const altezza = radice.querySelector('.maplibregl-popup-content').offsetHeight;
  radice.style.setProperty('--traffico-colore', colore);
  radice.style.setProperty('--traffico-h', `${altezza}px`);
  popup.setOffset(spostamento(anchor, altezza));
}

// Porta l'oggetto cliccato e la sua scheda al centro dell'area visibile della mappa (che già esclude la scheda del luogo aperta di lato).
// Il blocco oggetto + scheda è largo ORIZZ + LARGHEZZA e alto altezza + BASSO: il suo mezzo cade al centro. Parte dopo la scheda del luogo,
// che al clic centra a sua volta l'oggetto, e attende la fine del suo spostamento.
export function centraPopupTraffico(map, popup, anchor, lngLat) {
  const vai = () => {
    if (!popup.isOpen()) return;
    const altezza = popup.getElement().querySelector('.maplibregl-popup-content').offsetHeight;
    const x = (ORIZZ + LARGHEZZA) / 2 * (anchor.endsWith('left') ? -1 : 1);
    const y = (altezza + BASSO) / 2 * (anchor.startsWith('top') ? 1 : -1);
    map.easeTo({ center: lngLat, offset: [x, y], duration: 500 });
  };
  setTimeout(() => (map.isEasing() ? map.once('moveend', vai) : vai()), 0);
}

// Apre il popup di un elemento (punto o area) di uno strato, nello stile unico: scheda scura con linea di richiamo, ancorata dal lato con più spazio
// e centrata nella parte visibile della mappa. `punto` è la posizione sullo schermo del clic, `lngLat` quella sulla mappa ([lon, lat] o {lng, lat}).
// Chiude `precedente` e restituisce il nuovo popup.
export function apriPopupScheda(map, { precedente, sezione, icona, colore, modello, corpo, punto, lngLat }) {
  precedente?.remove();
  const coordinate = Array.isArray(lngLat) ? lngLat : [lngLat.lng, lngLat.lat];
  const { anchor, offset } = ancoraPopupTraffico(punto, map.getContainer());
  const popup = new maplibregl.Popup({ maxWidth: '300px', className: 'traffico-popup-box', anchor, offset, closeButton: false })
    .setLngLat(coordinate)
    .setDOMContent(contenutoPopupTraffico({ sezione, icona, colore, modello, corpo, coordinate, chiudi: () => popup.remove() }))
    .addTo(map);
  rifinisciPopupTraffico(popup, anchor, colore);
  centraPopupTraffico(map, popup, anchor, coordinate);
  return popup;
}
