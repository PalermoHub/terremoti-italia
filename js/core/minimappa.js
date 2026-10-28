// Minimappa di orientamento in basso a destra, sopra il logo con le coordinate: l'Italia intera, il riquadro della
// vista attuale e il trascinamento per spostare la mappa principale. È una mappa MapLibre separata e non interattiva:
// i gesti li gestiamo qui, così i clic sul riquadro non arrivano alla mappa grande. Non si chiude: si riduce a una
// barra «Minimappa» e si riapre da lì.
import { t } from './i18n.js';
import { svgIcona } from './icone.js';

const ID = 'minimappa-panoramica';
const SORGENTE = 'minimappa-panoramica-vista';
const STRATI = ['minimappa-panoramica-bordo', 'minimappa-panoramica-centro'];
const VISTA_MINIMAPPA = [[3, 33], [22, 49]]; // l'Italia con un margine: anche la vista iniziale resta dentro il riquadro
const VUOTO = { type: 'FeatureCollection', features: [] };
const FRECCIA_GIU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const FRECCIA_SU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
// OSM standard (raster): la stessa base delle miniature della scheda, indipendente dallo stile vettoriale della mappa.
const STILE_OSM = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

// Riquadro della vista (poligono) e centro (punto) come GeoJSON; null se i limiti non sono numerici.
export function riquadroVista({ ovest, sud, est, nord, lng, lat }) {
  if (![ovest, sud, est, nord, lng, lat].every(Number.isFinite)) return null;
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[ovest, sud], [est, sud], [est, nord], [ovest, nord], [ovest, sud]]] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lng, lat] } },
    ],
  };
}

export function collegaMinimappa(map) {
  if (!map || typeof document === 'undefined' || !globalThis.maplibregl) return null;
  if (!globalThis.matchMedia?.('(min-width: 721px)').matches) return null; // su telefono il posto è della scheda
  if (document.getElementById(ID)) return null;

  let ridotta = false;
  const box = document.createElement('div');
  box.id = ID;
  box.className = 'minimappa-panoramica';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', t('minimappa.aria'));
  box.title = t('minimappa.suggerimento');

  const tela = document.createElement('div');
  tela.className = 'minimappa-panoramica-tela';
  tela.setAttribute('aria-hidden', 'true');

  const crediti = document.createElement('p');
  crediti.className = 'minimappa-panoramica-attr';
  const osm = Object.assign(document.createElement('a'), { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener', textContent: '© OpenStreetMap' });
  crediti.append(osm);

  // Quando è ridotta resta questa barra: icona, nome e freccia per tornare alla mappa.
  const barra = document.createElement('div');
  barra.className = 'minimappa-panoramica-barra';
  const iconaBarra = document.createElement('span');
  iconaBarra.className = 'minimappa-panoramica-barra-icona';
  iconaBarra.innerHTML = svgIcona('mappa', 16);
  const nomeBarra = document.createElement('span');
  nomeBarra.className = 'minimappa-panoramica-barra-nome';
  nomeBarra.textContent = t('minimappa.titolo');
  const espandi = document.createElement('button');
  espandi.type = 'button';
  espandi.className = 'minimappa-panoramica-espandi';
  espandi.title = espandi.ariaLabel = t('minimappa.espandi');
  espandi.innerHTML = FRECCIA_SU;
  barra.append(iconaBarra, nomeBarra, espandi);

  const riduci = document.createElement('button');
  riduci.type = 'button';
  riduci.className = 'minimappa-panoramica-riduci';
  riduci.title = riduci.ariaLabel = t('minimappa.riduci');
  riduci.innerHTML = FRECCIA_GIU;

  box.append(tela, crediti, barra, riduci);
  document.getElementById('corpo')?.append(box);

  const mini = new maplibregl.Map({
    container: tela,
    style: STILE_OSM,
    bounds: VISTA_MINIMAPPA,
    fitBoundsOptions: { padding: 6 },
    interactive: false,
    attributionControl: false,
    renderWorldCopies: false,
  });

  const disegna = () => {
    if (ridotta || !mini.getSource(SORGENTE)) return;
    try {
      const b = map.getBounds();
      const c = map.getCenter();
      const m = mini.getBounds();
      // se la vista grande è più ampia della panoramica, il riquadro si ferma ai bordi di questa (niente lati fuori)
      const ovest = Math.max(b.getWest(), m.getWest()), est = Math.min(b.getEast(), m.getEast());
      const sud = Math.max(b.getSouth(), m.getSouth()), nord = Math.min(b.getNorth(), m.getNorth());
      if (ovest >= est || sud >= nord) return;
      const dati = riquadroVista({ ovest, sud, est, nord, lng: c.lng, lat: c.lat });
      if (dati) mini.getSource(SORGENTE).setData(dati);
    } catch { /* mappa grande non ancora pronta: si ridisegna al prossimo movimento */ }
  };

  const STRATI_DEF = [
    { id: STRATI[0], type: 'line', source: SORGENTE, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': '#c27c0e', 'line-width': 1.6 } },
    { id: STRATI[1], type: 'circle', source: SORGENTE, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': '#c27c0e', 'circle-radius': 3.2, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.4 } },
  ];
  function assicura() {
    if (!mini.isStyleLoaded()) return false;
    let aggiunto = false;
    if (!mini.getSource(SORGENTE)) { mini.addSource(SORGENTE, { type: 'geojson', data: VUOTO }); aggiunto = true; }
    for (const strato of STRATI_DEF) if (!mini.getLayer(strato.id)) { mini.addLayer(strato); aggiunto = true; }
    return aggiunto;
  }

  function impostaRidotta(v) {
    ridotta = Boolean(v);
    box.classList.toggle('ridotta', ridotta);
    box.title = ridotta ? t('minimappa.espandi') : t('minimappa.suggerimento');
    if (!ridotta) requestAnimationFrame(() => { mini.resize(); disegna(); });
  }
  riduci.addEventListener('click', () => impostaRidotta(true));
  espandi.addEventListener('click', () => impostaRidotta(false));
  barra.addEventListener('click', e => { if (!e.target.closest?.('button')) impostaRidotta(false); }); // anche la barra intera riapre

  mini.on('style.load', () => { assicura(); disegna(); });
  mini.on('idle', () => { if (assicura()) disegna(); });

  let atteso = false;
  const pianifica = () => {
    if (atteso) return;
    atteso = true;
    requestAnimationFrame(() => { atteso = false; disegna(); });
  };
  map.on('move', pianifica);
  map.on('resize', pianifica);

  // Clic o trascinamento dentro la panoramica: il punto diventa il centro della mappa grande, allo zoom attuale.
  let trascina = false;
  const sposta = e => {
    const r = tela.getBoundingClientRect();
    const punto = mini.unproject([e.clientX - r.left, e.clientY - r.top]);
    if (!Number.isFinite(punto.lng) || !Number.isFinite(punto.lat)) return;
    map.easeTo({ center: [punto.lng, punto.lat], duration: trascina ? 0 : 300 });
  };
  box.addEventListener('pointerdown', e => {
    if (ridotta || e.button !== 0 || e.target.closest?.('a, button')) return; // la barra ridotta, i crediti e i pulsanti non spostano la mappa
    trascina = true;
    box.classList.add('trascinando');
    try { box.setPointerCapture(e.pointerId); } catch { /* niente cattura: il trascinamento resta finché il puntatore è sopra */ }
    sposta(e);
    e.preventDefault();
  });
  const fine = e => {
    if (!trascina) return;
    trascina = false;
    box.classList.remove('trascinando');
    try { box.releasePointerCapture(e.pointerId); } catch { /* idem */ }
  };
  box.addEventListener('pointermove', e => {
    if (!trascina) return;
    if (e.buttons === 0) { fine(e); return; } // il puntatore è stato rilasciato fuori dal riquadro
    sposta(e);
    e.preventDefault();
  });
  box.addEventListener('pointerup', fine);
  box.addEventListener('pointercancel', fine);

  const telefono = globalThis.matchMedia?.('(max-width: 720px)');
  telefono?.addEventListener?.('change', () => { if (!telefono.matches && !ridotta) mini.resize(); });

  return { nodo: box, mappa: mini };
}
