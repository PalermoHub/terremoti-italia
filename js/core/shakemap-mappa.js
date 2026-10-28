// Contorni della ShakeMap INGV di un evento, disegnati sopra la mappa quando l'utente li sceglie dalla scheda dell'evento.
// La scheda manda `scheda:shakemap` con detail { id, prodotto } (prodotto null = toglili); i file stanno nel ramo `shakemap`
// (copiati da scripts/shakemap.mjs, perché shakemap.ingv.it non ha CORS). Linee e valori hanno i colori dell'INGV.
import { t } from './i18n.js';

export const URL_CONTORNI = 'https://raw.githubusercontent.com/PalermoHub/terremoti-italia/shakemap/';
export const EVENTO_SHAKEMAP = 'scheda:shakemap';

const SRC = 'shakemap-contorni';
const BORDO = 'shakemap-contorni-bordo';
const LINEE = 'shakemap-contorni-linee';
const VALORI = 'shakemap-contorni-valori';
const VUOTO = { type: 'FeatureCollection', features: [] };

function assicuraStrati(map) {
  if (map.getSource(SRC)) return;
  map.addSource(SRC, { type: 'geojson', data: VUOTO, attribution: '<a href="https://shakemap.ingv.it/" target="_blank" rel="noopener">ShakeMap INGV</a>' });
  // bordo scuro sotto la linea colorata: le intensità basse sono quasi bianche e sparirebbero sulla base chiara
  map.addLayer({ id: BORDO, type: 'line', source: SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1f2a44', 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['get', 'weight'], 1, 3.5, 6, 6.5] } });
  map.addLayer({ id: LINEE, type: 'line', source: SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['get', 'weight'], 1, 1.5, 6, 4], 'line-opacity': 0.9 } });
  map.addLayer({
    id: VALORI, type: 'symbol', source: SRC, minzoom: 6,
    layout: { 'symbol-placement': 'line', 'text-field': ['to-string', ['get', 'value']], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'symbol-spacing': 250 },
    paint: { 'text-color': '#222', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
  });
}

function inquadra(map, geojson) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  const scorri = c => { if (typeof c[0] === 'number') { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } else c.forEach(scorri); };
  geojson.features.forEach(f => scorri(f.geometry.coordinates));
  if (x1 >= x0) map.fitBounds([[x0, y0], [x1, y1]], { padding: 60, maxZoom: 9, duration: 600 });
}

let attivo = null; // { id, prodotto } dei contorni in mappa: la scheda ridisegnata dopo un clic lo rilegge per rimettere la scelta
export const contorniAttivi = () => attivo;

// Chip tra quelli degli strati accesi: i contorni restano in mappa anche a scheda chiusa (un clic su un punto vuoto la chiude),
// e la × è l'unico comando per spegnerli quando la scheda non c'è
function scriviChip() {
  const barra = document.getElementById('strati-chip');
  if (!barra) return;
  barra.querySelector('.shakemap-chip')?.remove();
  if (!attivo) return;
  const chip = Object.assign(document.createElement('button'), { type: 'button', className: 'strato-chip shakemap-chip', title: t('terremoti.ev.contorniSpegni') });
  const testo = document.createElement('span');
  testo.textContent = `ShakeMap · ${t(`terremoti.ev.cont.${attivo.prodotto}`)}`;
  const x = Object.assign(document.createElement('i'), { textContent: '×' });
  chip.append(testo, x);
  chip.addEventListener('click', () => document.dispatchEvent(new CustomEvent(EVENTO_SHAKEMAP, { detail: { prodotto: null } })));
  barra.append(chip);
}

export function collegaShakeMap(map) {
  let richiesta = 0;
  document.addEventListener(EVENTO_SHAKEMAP, async e => {
    const { id, prodotto } = e.detail ?? {};
    const mia = ++richiesta;
    attivo = prodotto ? { id, prodotto } : null;
    scriviChip();
    if (!prodotto) { map.getSource(SRC)?.setData(VUOTO); return; }
    try {
      const r = await fetch(`${URL_CONTORNI}${id}/${prodotto}.json`);
      if (!r.ok) throw new Error(String(r.status));
      const dati = await r.json();
      if (mia !== richiesta) return; // nel frattempo è stato scelto un altro prodotto
      assicuraStrati(map);
      map.getSource(SRC).setData(dati);
      inquadra(map, dati);
    } catch { if (mia === richiesta) map.getSource(SRC)?.setData(VUOTO); }
  });
}
