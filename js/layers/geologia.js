import { t } from '../core/i18n.js';
import { sopraLeBasi } from './base.js';
import { registraTooltip, disegnaVoceTooltip } from '../core/tooltip.js';
import { intercettaClic } from '../core/cattura-clic.js';
import { contenutoPopupTraffico, ancoraPopupTraffico, rifinisciPopupTraffico, centraPopupTraffico } from './popup-traffico.js';

// Carta geologica d'Italia (ISPRA, Servizio Geologico d'Italia) come immagini dal servizio ArcGIS: sotto lo zoom 10 la carta
// 1:500.000, da lì in su le unità geologiche 1:100.000. Fermando il mouse sulla mappa il tooltip interroga lo stesso servizio
// (identify) e mostra formazione, età e la voce di legenda dell'unità, con il suo colore. Senza mouse il clic apre un popup con un
// collegamento alla scheda del luogo, che ha una sezione «Geologia» con le stesse informazioni. Spento all'avvio.
// Il mosaico raster dei fogli (sgi2.isprambiente.it/…/geo_100k_italia) non si usa: risponde con due intestazioni
// Access-Control-Allow-Origin e il browser rifiuta le tile.
const REST = 'https://sinacloud.isprambiente.it/arcgisgeo/rest/services/geo/SGI_ISPRA_geologia100K/MapServer';
const SRC_500K = 'geologia-500k';
const SRC_100K = 'geologia-100k';
const L_500K = 'geologia-500k-img';
const L_100K = 'geologia-100k-img';
const ZOOM_CAMBIO = 10;
const UNITA_100K = 14; // CGI100K_unita'_geologiche: visibile solo sotto 1:250.000
const UNITA_500K = 15; // CG500k_unita_geology500k: senza limiti di scala
// A zoom 10 una tile da 512 px è 1:288.000 a 96 dpi, fuori dalla scala del layer 14: con 72 dpi il servizio lo disegna
const DPI = 72;
const OPACITA = 0.8;
const SCADENZA_MS = 10000;
const ATTESA_MS = 250; // il mouse deve restare fermo prima di interrogare il servizio
const COLORE = '#b45309';
const MAX_LEGENDA = 240;
const PESO_SCHEDA = 10; // dopo la scheda del comune (peso 9), nello stesso tab «Luogo»
const FONTE = 'ISPRA, Carta Geologica d\'Italia';

const tile = (layer, dpi) => `${REST}/export?f=image&format=png32&transparent=true&bboxSR=3857&imageSR=3857&size=512,512&layers=show:${layer}${dpi ? `&dpi=${dpi}` : ''}&bbox={bbox-epsg-3857}`;
const CREDITO = '<a href="https://www.isprambiente.gov.it/it/attivita/suolo-e-territorio/cartografia/carta-geologica-e-geotematica" target="_blank" rel="noopener">ISPRA, Carta Geologica d\'Italia</a>';

let mappa = null;
let legenda = null;
let acceso = false;
let errore = false;
let richiesta = 0; // interrogazioni del tooltip
let richiestaPopup = 0; // interrogazioni del popup al clic: contatori separati, o l'una scarterebbe l'altra
let timer = null;
let popup = null;
let ultimoEvento = null; // ultima posizione del mouse sulla mappa: se il servizio risponde dopo, il tooltip si ridisegna lì
let ultimo = null; // { lngLat, zoom, risultati } dell'ultima interrogazione
let simboli = null; // voce di legenda → immagine (data URL) del colore, per layer
let promessaSimboli = null;

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

function scriviLegenda() {
  if (!legenda) return;
  legenda.replaceChildren(el('strong', null, t('geologia.titolo')));
  legenda.append(el('p', 'uffici-nota', t('geologia.scale')));
  legenda.append(el('p', 'uffici-nota', t('geologia.clic')));
  if (errore) legenda.append(el('p', 'uffici-nota', t('geologia.nonDisponibile')));
  const credito = el('p', 'uffici-nota', `${t('geologia.dati')} `);
  credito.append(Object.assign(el('a', null, 'ISPRA, Carta Geologica d\'Italia'), { href: 'https://www.isprambiente.gov.it/it/attivita/suolo-e-territorio/cartografia/carta-geologica-e-geotematica', target: '_blank', rel: 'noopener' }));
  legenda.append(credito);
}

function creaLegenda() {
  legenda = el('div', 'legenda legenda-monumenti lg-geologia');
  legenda.hidden = !acceso;
  document.getElementById('legende').append(legenda);
  scriviLegenda();
}

// attributi dell'unità geologica nei due layer: 1:100.000 (dettaglio) e 1:500.000
function modello(r) {
  const a = r.attributes;
  if (r.layerId === UNITA_100K) {
    const eta = [a.ETA_INFERIORE, a.ETA_SUPERIORE].filter(Boolean);
    return {
      titolo: a.NOME_FORMAZIONE,
      sottotitolo: t('geologia.scala100k'),
      righe: [
        { etichetta: t('geologia.eta'), valore: a.ETA_FORMAZIONE || [...new Set(eta)].join(' – ') || t('geologia.nd') },
        { etichetta: t('geologia.legenda'), valore: a.LEGENDA || t('geologia.nd') },
      ],
    };
  }
  const eta = [...new Set([a.ETAINF, a.ETASUP].filter(Boolean))].join(' – ');
  return {
    titolo: a.FORMAZIONE,
    sottotitolo: t('geologia.scala500k'),
    righe: [
      { etichetta: t('geologia.eta'), valore: eta || t('geologia.nd') },
      { etichetta: t('geologia.tipo'), valore: a.TIPO_MAT || a.LITHOUNIT || t('geologia.nd') },
    ],
  };
}

async function interroga(e) {
  const layer = mappa.getZoom() >= ZOOM_CAMBIO ? UNITA_100K : UNITA_500K;
  const w = mappa.getContainer().clientWidth;
  const h = mappa.getContainer().clientHeight;
  const m = mappa.getBounds();
  const [x0, y0] = proietta(m.getWest(), m.getSouth());
  const [x1, y1] = proietta(m.getEast(), m.getNorth());
  const [x, y] = proietta(e.lngLat.lng, e.lngLat.lat);
  const q = new URLSearchParams({
    f: 'json', geometryType: 'esriGeometryPoint', geometry: `${x},${y}`, sr: '3857', layers: `all:${layer}`, tolerance: '2',
    mapExtent: `${x0},${y0},${x1},${y1}`, imageDisplay: `${w},${h},${DPI}`, returnGeometry: 'false',
  });
  const r = await fetch(`${REST}/identify?${q}`, { signal: AbortSignal.timeout(SCADENZA_MS) });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()).results ?? [];
}

// longitudine/latitudine → metri Web Mercator
function proietta(lng, lat) {
  const R = 6378137;
  return [R * lng * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + Math.min(85.05, Math.max(-85.05, lat)) * Math.PI / 360))];
}

// chiave del colore nella legenda: 1:100.000 colorata per età, 1:500.000 per formazione
const chiaveSimbolo = r => (r.layerId === UNITA_100K ? r.attributes.ETA_FORMAZIONE : r.attributes.FORMAZIONE);

// colori della legenda ufficiale (servizio ArcGIS, una sola richiesta): layer → { voce in minuscolo → data URL del simbolo }
function caricaSimboli() {
  return promessaSimboli ??= (async () => {
    try {
      const r = await fetch(`${REST}/legend?f=json`, { signal: AbortSignal.timeout(SCADENZA_MS) });
      if (!r.ok) throw new Error(String(r.status));
      const legenda = {};
      for (const l of (await r.json()).layers) {
        if (![UNITA_100K, UNITA_500K].includes(l.layerId)) continue;
        const m = legenda[l.layerId] = new Map();
        for (const v of l.legend) for (const chiave of v.values ?? [v.label]) m.set(String(chiave).toLowerCase(), `data:${v.contentType};base64,${v.imageData}`);
      }
      simboli = legenda;
    } catch {
      promessaSimboli = null; // si riprova alla prossima richiesta; senza la legenda manca solo il colore
    }
  })();
}

const tronca = testo => (testo.length > MAX_LEGENDA ? `${testo.slice(0, MAX_LEGENDA - 1).trimEnd()}…` : testo);

function campione(r, voce) {
  const src = simboli?.[r.layerId]?.get(String(voce ?? '').toLowerCase());
  if (!src) return undefined;
  const img = Object.assign(el('img'), { src, alt: '', width: 14, height: 14 });
  img.style.cssText = 'vertical-align:-2px;margin-right:6px;border:1px solid rgba(0,0,0,.3);border-radius:3px';
  return img;
}

function contenuto(risultati) {
  const [r, ...altre] = risultati;
  const a = r.attributes;
  const eta = r.layerId === UNITA_100K ? a.ETA_FORMAZIONE : [...new Set([a.ETAINF, a.ETASUP].filter(Boolean))].join(' – ');
  const m = modello(r);
  const elenco = m.righe.map(x => ({ testo: `${x.etichetta}: ${tronca(x.valore)}` }));
  elenco[0].nodo = campione(r, chiaveSimbolo(r)); // 1:100.000 colorata per età, 1:500.000 per formazione: il simbolo sta davanti alla prima riga
  const nomi = [...new Set(altre.map(x => modello(x).titolo))].filter(n => n && n !== m.titolo);
  if (nomi.length) elenco.push({ testo: t('geologia.altre', { elenco: nomi.join('; ') }) });
  const corpo = el('div', 'strati-tooltip-corpo');
  corpo.append(disegnaVoceTooltip({ sezione: t('geologia.titolo'), icona: 'terremoto', colore: COLORE, titolo: m.titolo, sottotitolo: m.sottotitolo, elenco }));
  return { contenuto: corpo, colore: COLORE };
}

// La scheda del luogo si apre con un clic simulato (senza `originalEvent`), che l'intercettore lascia passare
const apriScheda = lngLat => mappa.fire('click', { point: mappa.project(lngLat), lngLat });

// Sui dispositivi senza mouse (nessun passaggio, quindi nessun tooltip) il clic apre un popup con le stesse informazioni e un
// collegamento alla scheda; se la carta non risponde o non c'è nulla, il clic apre subito la scheda come negli altri strati.
async function apriPopup(e) {
  const mia = ++richiestaPopup;
  let risultati;
  try {
    risultati = await interroga(e);
  } catch {
    if (mia === richiestaPopup && !errore) { errore = true; scriviLegenda(); }
    if (mia === richiestaPopup) apriScheda(e.lngLat);
    return;
  }
  if (mia !== richiestaPopup || !acceso) return;
  if (!risultati.length) return apriScheda(e.lngLat);
  popup?.remove();
  const chiudi = () => { popup?.remove(); popup = null; };
  const coordinate = [e.lngLat.lng, e.lngLat.lat];
  const { anchor, offset } = ancoraPopupTraffico(e.point, mappa.getContainer());
  const [r, ...altre] = risultati;
  const m = modello(r);
  const [eta, ...righe] = m.righe; // l'età sta nel corpo, dietro al colore della legenda
  const rigaEta = el('p', 'traffico-stato');
  const simbolo = campione(r, chiaveSimbolo(r));
  if (simbolo) rigaEta.append(simbolo);
  rigaEta.append(`${eta.etichetta}: ${eta.valore}`);
  const corpo = [rigaEta];
  const apri = Object.assign(el('a', 'traffico-link', t('geologia.apriScheda')), { href: '#' });
  apri.addEventListener('click', ev => { ev.preventDefault(); apriScheda(e.lngLat); });
  const nomi = [...new Set(altre.map(x => modello(x).titolo))].filter(n => n && n !== m.titolo);
  if (nomi.length) corpo.push(el('p', 'traffico-stato', t('geologia.altre', { elenco: nomi.join('; ') })));
  corpo.push(apri);
  popup = new maplibregl.Popup({ maxWidth: '300px', className: 'traffico-popup-box geologia-popup', anchor, offset, closeButton: false })
    .setLngLat(coordinate)
    .setDOMContent(contenutoPopupTraffico({ sezione: t('geologia.titolo'), icona: 'terremoto', colore: COLORE, modello: { titolo: m.titolo, sottotitolo: m.sottotitolo, righe }, corpo, coordinate, chiudi }))
    .addTo(mappa);
  rifinisciPopupTraffico(popup, anchor, COLORE);
  centraPopupTraffico(mappa, popup, anchor, coordinate);
}

async function risolvi(e) {
  const mia = ++richiesta;
  let risultati;
  try {
    risultati = await interroga(e);
  } catch {
    if (mia === richiesta && !errore) { errore = true; scriviLegenda(); }
    return;
  }
  if (mia !== richiesta || !acceso) return;
  ultimo = { lngLat: e.lngLat, zoom: mappa.getZoom(), risultati };
  if (ultimoEvento) mappa.fire('mousemove', { ...ultimoEvento }); // ridisegna il tooltip con la risposta
}

// Fornitore del tooltip: mostra la risposta dell'ultima interrogazione se il mouse è ancora lì; altrimenti ne programma una
// quando il mouse si ferma (un'interrogazione a ogni movimento sovraccaricherebbe il servizio).
function fornitore(e) {
  if (!acceso) return null;
  ultimoEvento = e;
  const v = ultimo;
  if (v && Math.abs(v.zoom - mappa.getZoom()) < 0.01) {
    const p = mappa.project(v.lngLat);
    if (Math.hypot(p.x - e.point.x, p.y - e.point.y) <= 3) return v.risultati.length ? contenuto(v.risultati) : null;
  }
  clearTimeout(timer);
  timer = setTimeout(() => risolvi(e), ATTESA_MS);
  return null;
}

// Sezione «Geologia» della scheda del luogo (a strato acceso): la risposta della carta arriva dopo, il resto della scheda è già visibile
function corpoScheda(risultati) {
  const [r, ...altre] = risultati;
  const m = modello(r);
  const titolo = el('p');
  titolo.append(el('strong', null, m.titolo));
  const [eta, ...righe] = m.righe;
  const rigaEta = el('p');
  const simbolo = campione(r, chiaveSimbolo(r));
  if (simbolo) rigaEta.append(simbolo);
  rigaEta.append(`${eta.etichetta}: ${eta.valore}`);
  const nodi = [titolo, el('p', 'uffici-nota', m.sottotitolo), rigaEta, ...righe.map(x => el('p', null, `${x.etichetta}: ${x.valore}`))];
  const nomi = [...new Set(altre.map(x => modello(x).titolo))].filter(n => n && n !== m.titolo);
  if (nomi.length) nodi.push(el('p', 'uffici-nota', t('geologia.altre', { elenco: nomi.join('; ') })));
  return nodi;
}

function voceScheda(lngLat) {
  return {
    chiave: 'geologia', tipo: 'geologia', peso: PESO_SCHEDA, titolo: t('geologia.titolo'), icona: 'terremoto', sempre: true,
    dinamico: () => {
      const nodo = el('div', 'geologia-scheda');
      nodo.append(el('p', 'uffici-nota', t('geologia.lettura')));
      Promise.all([interroga({ lngLat }), caricaSimboli()])
        .then(([risultati]) => nodo.replaceChildren(...(risultati.length ? corpoScheda(risultati) : [el('p', 'uffici-nota', t('geologia.nessuna'))])))
        .catch(() => nodo.replaceChildren(el('p', 'uffici-nota', t('geologia.nonDisponibile'))));
      return nodo;
    },
    fonte: t('layer.fonte', { fonte: FONTE }),
  };
}

export default {
  id: 'geologia',
  titolo: 'Carta geologica (ISPRA)',
  gruppo: 'geologia-gruppo',
  senzaIntestazione: true,
  sezione: 'Carta geologica',
  sezioniFisse: true,
  argomento: { titolo: 'Carta geologica', descrizione: 'La Carta Geologica d\'Italia di ISPRA: le unità di roccia e di depositi che affiorano in superficie. Passa il mouse sulla mappa per l\'unità, l\'età e la legenda.' },
  aggiungiSorgenti(map) {
    map.addSource(SRC_500K, { type: 'raster', tiles: [tile(UNITA_500K)], tileSize: 512, maxzoom: ZOOM_CAMBIO, attribution: CREDITO });
    map.addSource(SRC_100K, { type: 'raster', tiles: [tile(UNITA_100K, DPI)], tileSize: 512, minzoom: ZOOM_CAMBIO, maxzoom: 15, attribution: CREDITO });
  },
  aggiungiLayer(map) {
    mappa = map;
    const sotto = sopraLeBasi(map); // sopra le basi, sotto a ogni dato
    map.addLayer({ id: L_500K, type: 'raster', source: SRC_500K, maxzoom: ZOOM_CAMBIO, layout: { visibility: 'none' }, paint: { 'raster-opacity': OPACITA } }, sotto);
    map.addLayer({ id: L_100K, type: 'raster', source: SRC_100K, minzoom: ZOOM_CAMBIO, layout: { visibility: 'none' }, paint: { 'raster-opacity': OPACITA } }, sotto);
    registraTooltip(map, fornitore, 2);
    intercettaClic(e => {
      if (!acceso || !matchMedia('(hover: none)').matches) return false;
      apriPopup(e);
      return true;
    });
    map.on('mouseout', () => { ultimoEvento = null; clearTimeout(timer); });
    map.on('error', e => {
      if (!acceso || ![SRC_500K, SRC_100K].includes(e.sourceId) || errore) return;
      errore = true;
      scriviLegenda();
    });
  },
  scheda: {
    layers: [L_500K, L_100K],
    voci: (_trovati, lngLat) => (acceso ? [voceScheda(lngLat)] : []),
  },
  legendaPannello: '.lg-geologia',
  strati: [{
    id: 'geologia', etichetta: 'Carta geologica (ISPRA)', layers: [L_500K, L_100K], attivo: false, legendaPannello: '.lg-geologia',
    suCambio(attivo) {
      acceso = attivo;
      if (legenda) legenda.hidden = !attivo;
      if (attivo) { errore = false; caricaSimboli(); scriviLegenda(); return; }
      richiesta++;
      richiestaPopup++;
      clearTimeout(timer);
      ultimo = null;
      popup?.remove();
      popup = null;
    },
  }],
  pannello: creaLegenda,
};
