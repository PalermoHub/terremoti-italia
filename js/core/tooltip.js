// Un solo tooltip sulla mappa. Confini, trasporto e sicurezza stradale registrano un «fornitore»: a ogni movimento del
// mouse ognuno dice cosa c'è sotto il cursore e il contenuto di tutti finisce in un unico riquadro, una sezione sotto
// l'altra, così i tooltip non si sovrappongono mai.
import { svgIcona } from './icone.js';
import { tl } from './i18n.js';
import { ancoraPopupTraffico, rifinisciPopupTraffico } from '../layers/popup-traffico.js';

const fornitori = [];
let collegato = false;
let popup = null;
let abilitato = true; // interruttore nel pannello Layer: spento, sulla mappa non compare nessun tooltip
let mioCursore = false; // il cursore lo tocchiamo solo se l'abbiamo messo noi: monumenti e scuole hanno il loro «mano»

// fornitore(e) → { contenuto: Node, cursore?: boolean, esclusivo?: boolean } oppure null se sotto il cursore non c'è nulla.
// Le sezioni seguono `priorita` crescente (a parità, l'ordine di registrazione). Una sezione `esclusivo` (un oggetto 3D
// sopra la mappa, es. l'edificio per piani) nasconde le altre: quello che sta sotto il cursore è l'oggetto, non la mappa.
export function registraTooltip(map, fornitore, priorita = 0) {
  fornitori.push({ fornitore, priorita });
  fornitori.sort((a, b) => a.priorita - b.priorita);
  if (!collegato) { collegato = true; collega(map); }
}

export const tooltipAttivi = () => abilitato;
export function impostaTooltipAttivi(valore) {
  abilitato = !!valore;
  if (!abilitato) { popup?.remove(); popup = null; }
}

// Un popup aperto con un clic resta dov'è: lo chiudono solo la X, Esc, un clic sulla mappa vuota o un altro clic su un oggetto,
// mai il passaggio del mouse (la mappa può spostarsi sotto il cursore). Finché è aperto i tooltip al passaggio sono sospesi,
// così i due riquadri non si sovrappongono. La selezione in mappa e la scheda non si toccano.
const aperti = new Set();
function seguiPopupAperti(map) { // i popup che non sono il tooltip: li si ricorda finché restano aperti
  if (typeof maplibregl === 'undefined') return; // nei test non c'è
  const addToOriginale = maplibregl.Popup.prototype.addTo;
  maplibregl.Popup.prototype.addTo = function (m) {
    const risultato = addToOriginale.call(this, m);
    if (!this.options.className?.includes('mappa-tooltip') && !aperti.has(this)) {
      aperti.add(this);
      this.once('close', () => aperti.delete(this));
      nascondi(map); // il tooltip del passaggio sparisce appena si apre il popup
    }
    return risultato;
  };
}

function nascondi(map) {
  popup?.remove();
  popup = null;
  if (mioCursore) { map.getCanvas().style.cursor = ''; mioCursore = false; }
}

// Il contenuto del tooltip per un punto della mappa ({ point, lngLat }, come un evento del mouse): lo usa anche la vista
// «Strati in 3D», che lo mostra sopra la pila. null se sotto il punto non c'è nulla.
export function contenutoTooltip(e) {
  let sezioni = fornitori.map(({ fornitore }) => fornitore(e)).filter(Boolean);
  if (!sezioni.length) return null;
  if (sezioni.some(s => s.esclusivo)) sezioni = sezioni.filter(s => s.esclusivo);
  const corpo = document.createElement('div');
  corpo.className = 'mappa-tooltip-corpo';
  for (const s of sezioni) {
    const sezione = document.createElement('div');
    sezione.className = 'mappa-tooltip-sezione';
    sezione.append(s.contenuto);
    corpo.append(sezione);
  }
  return { corpo, cursore: sezioni.some(s => s.cursore), colore: sezioni.find(s => s.colore)?.colore };
}

function collega(map) {
  seguiPopupAperti(map);
  map.on('mousemove', e => {
    if (!abilitato) return;
    if (aperti.size) return; // popup aperto con un clic: niente tooltip al passaggio
    const tip = contenutoTooltip(e);
    if (!tip) return nascondi(map);
    if (tip.cursore) { map.getCanvas().style.cursor = 'pointer'; mioCursore = true; }
    else if (mioCursore) { map.getCanvas().style.cursor = ''; mioCursore = false; }
    const { corpo } = tip;
    if (tip.colore) { // voce con intestazione: come il popup, con la linea di richiamo verticale e orizzontale
      const { anchor, offset } = ancoraPopupTraffico(e.point, map.getContainer());
      if (popup?.ancora !== anchor) { popup?.remove(); popup = null; }
      popup ??= new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '300px', className: 'mappa-tooltip traffico-popup-box', anchor, offset });
      popup.ancora = anchor;
      popup.setLngLat(e.lngLat).setDOMContent(corpo).addTo(map);
      rifinisciPopupTraffico(popup, anchor, tip.colore);
      return;
    }
    if (popup?.ancora) { popup.remove(); popup = null; }
    popup ??= new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'mappa-tooltip', anchor: 'top', offset: 14 });
    popup.setLngLat(e.lngLat).setDOMContent(corpo).addTo(map);
  });
  map.on('mouseout', () => nascondi(map));
}

const MAX_VOCI = 3;

// Una voce del tooltip: titolo in grassetto (con il pallino colorato se il modello ne ha uno), badge, poi il sottotitolo.
export function disegnaVoceTooltip(m) {
  const voce = document.createElement('div');
  if (m.sezione && m.icona && svgIcona(m.icona)) { // intestazione come nel popup: marchio colorato con l'icona e nome della sezione
    const testa = document.createElement('div');
    testa.className = 'tooltip-testa';
    const marchio = document.createElement('span');
    marchio.className = 'tooltip-marchio';
    marchio.style.background = m.colore ?? 'var(--text-muted)';
    marchio.innerHTML = svgIcona(m.icona, 14);
    const sezione = document.createElement('span');
    sezione.className = 'tooltip-sezione';
    sezione.textContent = tl(m.sezione);
    testa.append(marchio, sezione);
    voce.append(testa);
  }
  const titolo = document.createElement('strong');
  if (m.pallino) {
    const pallino = document.createElement('span');
    pallino.className = 'tooltip-pallino';
    pallino.style.background = m.pallino;
    titolo.append(pallino);
  }
  if (m.icona && !m.sezione && svgIcona(m.icona)) { // iconcina davanti al titolo, come nella scheda
    const i = document.createElement('span');
    i.className = 'tooltip-icona';
    i.innerHTML = svgIcona(m.icona, 14);
    titolo.append(i);
  }
  const conSottotitolo = m.sottotitolo && m.sottotitolo !== m.titolo;
  if (m.campione && !conSottotitolo) titolo.append(m.campione); // senza sottotitolo il simbolo di legenda sta davanti al titolo
  titolo.append(m.titolo);
  voce.append(titolo);
  if (m.badge?.testo) {
    const badge = document.createElement('span');
    badge.className = 'tooltip-badge';
    badge.textContent = m.badge.testo;
    badge.style.setProperty('--colore', m.badge.colore);
    voce.append(badge);
  }
  if (conSottotitolo) {
    const dettaglio = document.createElement('div');
    if (m.campione) dettaglio.append(m.campione); // il simbolo della legenda, accanto all'attributo
    dettaglio.append(m.sottotitolo);
    voce.append(dettaglio);
  }
  if (m.elenco?.length) { // righe di testo sotto il sottotitolo (es. i primi progetti di un marker aggregato)
    const elenco = document.createElement('div');
    elenco.className = 'tooltip-elenco';
    for (const riga of m.elenco) { // una stringa, o { testo, pallino, nodo } con il colore della legenda o un simbolo
      const r = document.createElement('div');
      if (riga.pallino) {
        const pallino = document.createElement('span');
        pallino.className = 'tooltip-pallino';
        pallino.style.background = riga.pallino;
        r.append(pallino);
      }
      if (riga.nodo) r.append(riga.nodo); // un simbolo già pronto davanti al testo (es. il cerchio della magnitudo)
      r.append(typeof riga === 'string' ? riga : riga.testo);
      elenco.append(r);
    }
    voce.append(elenco);
  }
  if (m.dom) voce.append(m.dom); // un elemento già pronto (es. il grafico del trend)
  if (m.suggerimento) { // invito a cliccare per saperne di più
    const s = document.createElement('div');
    s.className = 'tooltip-suggerimento';
    s.textContent = m.suggerimento;
    voce.append(s);
  }
  return voce;
}

// Il simbolo di legenda di un attributo, per il tooltip: lo stesso elemento `<i>` della legenda (stessa classe, stessa forma),
// dentro un involucro `.legenda <legenda>` perché gli stili della legenda sono limitati a quel contesto.
// `i` è l'elemento già pronto (quello che costruisce la legenda del layer) oppure [classe, stile] per crearlo qui.
export function campioneTooltip(legenda, i) {
  const involucro = document.createElement('span');
  involucro.className = `legenda ${legenda} tooltip-campione`;
  if (Array.isArray(i)) {
    const [classe, stile = {}] = i;
    i = document.createElement('i');
    if (classe) i.className = classe;
    Object.assign(i.style, stile);
  }
  involucro.append(i);
  return involucro;
}

// Tooltip per i layer con un modello di popup {titolo, sottotitolo, pallino?, campione?, badge?: {testo, colore}}: `gruppi` = [{ layers, modello(props), campione?(props, idLayer) }].
// `campione` dà il simbolo dell'attributo mostrato (come in legenda, vedi campioneTooltip) e compare accanto al sottotitolo. Si cerca solo
// negli strati accesi (a strato spento sulla mappa non c'è nulla da indicare); nel riquadro di ±4 px cadono anche i punti piccoli.
// i modelli di tooltip registrati, per layer: la vista «Strati in 3D» li riusa per descrivere ogni strato della pila
const modelli = [];
export const modelloTooltipDi = id => modelli.find(g => g.layers.includes(id))?.modello ?? null;
// il gruppo intero ({ modello, campione?, colore?, … }): la vista 3D ne ricava anche il simbolo di legenda e il colore dello strato
export const gruppoTooltipDi = id => modelli.find(g => g.layers.includes(id)) ?? null;

export function registraTooltipStrati(map, gruppi, priorita = 2) {
  modelli.push(...gruppi);
  const acceso = id => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') === 'visible';
  registraTooltip(map, e => {
    const riquadro = [[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]];
    const voci = new Map();
    for (const { layers, modello, icona, campione, sezione, colore } of gruppi) {
      const attivi = layers.filter(acceso);
      if (!attivi.length) continue;
      for (const f of map.queryRenderedFeatures(riquadro, { layers: attivi })) {
        const m = modello(f.properties);
        if (m && !m.icona && icona) m.icona = icona;
        if (m && sezione && !m.sezione) { m.sezione = sezione; m.colore = colore?.(f.properties) ?? m.colore; }
        if (m && !m.campione && campione) m.campione = campione(f.properties, f.layer.id) ?? undefined;
        if (m?.titolo) voci.set(`${m.titolo}\n${m.sottotitolo ?? ''}`, m);
      }
    }
    if (!voci.size) return null;
    const corpo = document.createElement('div');
    corpo.className = 'strati-tooltip-corpo';
    const mostrate = [...voci.values()];
    for (const m of mostrate.slice(0, MAX_VOCI)) corpo.append(disegnaVoceTooltip(m));
    if (mostrate.length > MAX_VOCI) {
      const altre = document.createElement('div');
      altre.className = 'strati-tooltip-altre';
      altre.textContent = `+ altri ${mostrate.length - MAX_VOCI}`;
      corpo.append(altre);
    }
    return { contenuto: corpo, colore: mostrate[0].sezione ? mostrate[0].colore : undefined };
  }, priorita);
}
