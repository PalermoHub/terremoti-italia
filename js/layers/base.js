import { svgIcona } from '../core/icone.js';
import { t, tl } from '../core/i18n.js';
import { STILE_BASE } from '../core/config.js';

// Basi cartografiche alternative: Positron (stile di partenza), basi raster classiche (OSM, Esri, Google,
// OpenTopoMap), carte tecniche comunali e regionali e sfondi neutri. Una sola è visibile alla volta.

// Basi raster (tile XYZ): una sorgente e un layer 'base-<id>' per ciascuna, generati da questa tabella.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
// Tile Mapbox da 512 px (un quarto delle richieste di quelle da 256), a doppia densità sugli schermi retina.
const RETINA = (globalThis.devicePixelRatio ?? 1) >= 2 ? '@2x' : '';
const RASTER = {
  osm: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, attr: '© OpenStreetMap contributors' },
  'osm-fr': { url: 'https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', max: 20, attr: '© OpenStreetMap contributors, tiles OSM France' },
  'esri-scura': { url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, max: 16, attr: '© Esri' },
  'osm-hot': { url: 'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', max: 19, attr: '© OpenStreetMap contributors, Humanitarian OpenStreetMap Team' },
  'esri-strade': { url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`, max: 19, attr: '© Esri' },
  grigio: { url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, max: 16, attr: '© Esri' },
  'google-strade': { url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', max: 20, attr: '© Google' },
  satellite: { url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', max: 20, attr: '© Google' },
  'esri-satellite': { url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, max: 19, attr: '© Esri, Maxar, Earthstar Geographics' },
  // Immagini satellitari libere: Sentinel-2 senza nuvole (EOX, gratuito per usi non commerciali, CC BY-NC-SA 4.0) e NASA GIBS (VIIRS a colori naturali di ieri, UTC: quello di oggi arriva nel pomeriggio)
  sentinel2: { url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg', max: 17, attr: 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)' }, // i18n-ok: credito richiesto da EOX
  'nasa-ieri': { url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${new Date(Date.now() - 864e5).toISOString().slice(0, 10)}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, max: 9, attr: 'NASA EOSDIS GIBS, Suomi NPP VIIRS' }, // i18n-ok: credito della fonte
  ibrido: { url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', max: 20, attr: '© Google' },
  'google-terreno': { url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', max: 20, attr: '© Google' },
  opentopo: { url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png', max: 17, attr: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)' },
  'esri-topo': { url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`, max: 19, attr: '© Esri' },
};
// Basi vettoriali OpenFreeMap (Positron, scura, luminosa): condividono sprite, font e sorgenti, che arrivano con lo stile della prima scelta.
const VETTORIALI = {
  positron: STILE_BASE,
  'ofm-dark': 'https://tiles.openfreemap.org/styles/dark',
  'ofm-bright': 'https://tiles.openfreemap.org/styles/bright',
  antico: 'https://kanahiro.github.io/maplibre-style-server/styles/antique.json', // stile «antique» di Kanahiro (dati OpenFreeMap): sorgenti e sprite propri
};
// Raggruppate come nel selettore dell'atlante: mappe stradali, immagini aeree, topografiche, sfondi neutri.
const GRUPPI = [
  { titolo: 'Mappe stradali', basi: [
    { id: 'positron', etichetta: 'Mappa chiara', titolo: 'Mappa chiara (OpenFreeMap)' },
    { id: 'ofm-dark', etichetta: 'Scura', titolo: 'Mappa scura (OpenFreeMap)' },
    { id: 'ofm-bright', etichetta: 'Luminosa', titolo: 'Mappa luminosa (OpenFreeMap Bright)' },
    { id: 'antico', etichetta: 'Antica', titolo: 'Mappa in stile antico (Kanahiro, dati OpenFreeMap)' },
    { id: 'osm', etichetta: 'OpenStreetMap', titolo: 'OpenStreetMap standard' },
    { id: 'osm-fr', etichetta: 'OSM Francia', titolo: 'OpenStreetMap Francia' },
    { id: 'osm-hot', etichetta: 'OSM Umanitaria', titolo: 'OpenStreetMap Humanitarian' },
    { id: 'esri-strade', etichetta: 'Esri Strade', titolo: 'Esri World Street Map' },
    { id: 'google-strade', etichetta: 'Google', titolo: 'Google Mappe (strade)' },
    { id: 'esri-scura', etichetta: 'Esri Scura', titolo: 'Esri Dark Gray Canvas' },
  ] },
  { titolo: 'Immagini aeree', basi: [
    { id: 'satellite', etichetta: 'Satellite', titolo: 'Google Satellite' },
    { id: 'esri-satellite', etichetta: 'Esri', titolo: 'Esri World Imagery' },
    { id: 'sentinel2', etichetta: 'Sentinel-2', titolo: 'Sentinel-2 senza nuvole 2024 (EOX, uso non commerciale)' },
    { id: 'nasa-ieri', etichetta: 'NASA ieri', titolo: 'NASA GIBS: colori naturali di ieri (VIIRS, risoluzione 250 m)' },
    { id: 'ibrido', etichetta: 'Ibrido', titolo: 'Google Satellite con strade e nomi' },
  ] },
  { titolo: 'Topografiche', basi: [
    { id: 'google-terreno', etichetta: 'Terreno', titolo: 'Google Terreno (rilievo)' },
    { id: 'opentopo', etichetta: 'OpenTopo', titolo: 'OpenTopoMap (curve di livello)' },
    { id: 'esri-topo', etichetta: 'Esri Topo', titolo: 'Esri World Topographic Map' },
  ] },
  { titolo: 'Sfondo neutro', basi: [
    { id: 'grigio', etichetta: 'Grigio', titolo: 'Esri Light Gray Canvas' },
    { id: 'bianco', etichetta: 'Bianco', titolo: 'Sfondo bianco' },
  ] },
];
const miniatura = id => new URL(`img/basi/${id}.jpg`, document.baseURI).href; // assoluto: la variabile CSS si risolve rispetto a css/

// Base di partenza: OpenFreeMap chiara o scura, secondo il tema all'avvio (lo stile di avvio ha solo i font delle etichette).
const INIZIALE = document.documentElement.dataset.tema === 'scuro' ? 'ofm-dark' : 'positron';
let baseCorrente = INIZIALE;
const stiliVettoriali = {}; // id -> promessa del JSON dello stile, scaricato una volta sola

const vettorialiRichieste = new Set(); // basi vettoriali di cui si è già chiesto lo stile
let basiPronte = false; // le basi raster esistono: da qui in poi una base vettoriale si può caricare
let sottoBasi; // primo layer delle basi: ogni base vettoriale si inserisce sotto a tutto
let spriteImpostato = false; // lo sprite OpenFreeMap si imposta con la prima base vettoriale

// Le basi vettoriali OpenFreeMap (Positron, scura, luminosa: circa 220 layer in tutto) si aggiungono alla prima scelta, non all'avvio:
// la base di partenza è Mapbox e ogni layer in più rallenta lo stile a ogni addLayer e getStyle.
// Con lo stile arrivano anche le sorgenti vettoriali e lo sprite (uguali per tutte e tre).
function caricaVettoriale(map, id) {
  if (vettorialiRichieste.has(id)) return;
  vettorialiRichieste.add(id);
  stiliVettoriali[id] ??= fetch(VETTORIALI[id]).then(r => r.json());
  stiliVettoriali[id].then(stile => {
    for (const [nome, sorgente] of Object.entries(stile.sources ?? {})) if (!map.getSource(nome)) map.addSource(nome, sorgente);
    if (Array.isArray(stile.sprite)) for (const sp of stile.sprite) map.addSprite(sp.id, sp.url); // più sprite con prefisso (es. `antique:city`)
    else if (stile.sprite && !spriteImpostato) { map.setSprite(stile.sprite); spriteImpostato = true; }
    for (const l of stile.layers) {
      if (!map.getSource(l.source) && l.type !== 'background') continue;
      map.addLayer({ ...l, id: `base-${id}-${l.id}`, layout: { ...l.layout, visibility: 'none' } }, sottoBasi);
    }
    scegli(map, baseCorrente);
  }).catch(() => { delete stiliVettoriali[id]; vettorialiRichieste.delete(id); }); // senza rete resta disponibile il resto delle basi; alla scelta successiva si riprova
}

function scegli(map, base) {
  baseCorrente = base;
  if (VETTORIALI[base] && basiPronte) caricaVettoriale(map, base);
  for (const l of map.getStyle().layers) {
    const v = Object.keys(VETTORIALI).find(id => l.id.startsWith(`base-${id}-`));
    if (v) map.setLayoutProperty(l.id, 'visibility', base === v ? 'visible' : 'none');
  }
  map.setLayoutProperty('base-bianco', 'visibility', base === 'bianco' ? 'visible' : 'none');
  for (const id of Object.keys(RASTER)) map.setLayoutProperty(`base-${id}`, 'visibility', base === id ? 'visible' : 'none');
}

// Layer della base cartografica (raster, bianca e vettoriali): la vista «Strati in 3D» li mette nel piano più basso.
export const eBase = id => id.startsWith('base-');

// Primo layer sopra le basi (le raster, la bianca e le vettoriali): lì stanno le ortofoto, sotto ogni dato.
// `undefined` se non c'è altro: il layer va in cima.
export function sopraLeBasi(map) {
  const strati = map.getStyle().layers;
  let ultimo = -1;
  strati.forEach((l, i) => { if (l.id.startsWith('base-')) ultimo = i; });
  return strati[ultimo + 1]?.id;
}

export default {
  id: 'base',
  titolo: 'Base cartografica',
  strati: [],
  aggiungiSorgenti(map) {
    for (const [id, r] of Object.entries(RASTER)) {
      map.addSource(`${id}-r`, {
        type: 'raster', tiles: [r.url], tileSize: r.tile ?? 256, minzoom: r.min ?? 0, maxzoom: r.max, attribution: r.attr,
      });
    }
  },
  aggiungiLayer(map) {
    const sotto = map.getStyle().layers[0]?.id; // le basi stanno sotto a tutto (lo stile di avvio è vuoto: di norma `undefined`)
    const nascosto = { visibility: 'none' };
    map.addLayer({ id: 'base-bianco', type: 'background', layout: nascosto, paint: { 'background-color': '#ffffff' } }, sotto);
    for (const id of Object.keys(RASTER)) map.addLayer({ id: `base-${id}`, type: 'raster', source: `${id}-r`, layout: nascosto }, sotto);
    sottoBasi = 'base-bianco';
    basiPronte = true;
    scegli(map, baseCorrente); // mostra la base di partenza (una base vettoriale scelta prima si carica qui)
  },
  pannello(el, map) {
    const bottone = document.getElementById('btn-gruppo-base');
    const icona = bottone?.querySelector('svg');
    const suggerimento = document.createElement('p');
    suggerimento.className = 'base-suggerimento';
    suggerimento.textContent = t('base.suggerimento');
    el.append(suggerimento);
    for (const g of GRUPPI) {
      const h = document.createElement('h3');
      h.textContent = tl(g.titolo);
      const riga = document.createElement('div');
      riga.className = 'base-griglia';
      for (const b of g.basi) {
        const label = document.createElement('label');
        label.className = 'base-scelta';
        label.title = tl(b.titolo);
        const r = document.createElement('input');
        r.type = 'radio';
        r.name = 'base';
        r.id = `base-${b.id}`;
        r.checked = b.id === INIZIALE;
        r.setAttribute('aria-label', tl(b.titolo));
        const cerchio = document.createElement('span');
        cerchio.className = 'base-cerchio';
        cerchio.style.backgroundImage = `url(${miniatura(b.id)})`;
        const et = document.createElement('span');
        et.className = 'base-et';
        et.textContent = tl(b.etichetta);
        r.addEventListener('change', () => {
          if (!r.checked) return;
          scegli(map, b.id);
          if (bottone) bottone.style.setProperty('--miniatura', `url(${miniatura(b.id)})`);
        });
        if (b.precisione) {
          const p = document.createElement('span');
          p.className = `base-precisione base-precisione-${b.precisione}`;
          label.append(p);
        }
        label.append(r, cerchio, et);
        riga.append(label);
      }
      el.append(h);
      el.append(riga);
    }
    // l'icona della barra mostra la base in uso, come nell'atlante
    if (icona) icona.replaceWith(Object.assign(document.createElement('span'), { className: 'base-mini' }));
    bottone?.style.setProperty('--miniatura', `url(${miniatura(INIZIALE)})`);
    // il tema scuro porta con sé la mappa scura, quello chiaro la mappa chiara; una base scelta a mano (satellite, storiche…) non si tocca
    const COPPIE = { grigio: 'esri-scura', 'esri-scura': 'grigio', positron: 'ofm-dark', 'ofm-dark': 'positron' };
    const perTema = scuro => {
      if (!COPPIE[baseCorrente]) return;
      const eScura = ['esri-scura', 'ofm-dark'].includes(baseCorrente);
      const voluta = eScura === scuro ? baseCorrente : COPPIE[baseCorrente];
      const radio = document.getElementById(`base-${voluta}`);
      if (!radio || radio.checked) return;
      radio.checked = true;
      if (map.getLayer('base-bianco')) radio.dispatchEvent(new Event('change'));
      else { baseCorrente = voluta; bottone?.style.setProperty('--miniatura', `url(${miniatura(baseCorrente)})`); }
    };
    document.addEventListener('tema', e => perTema(e.detail));
    if (document.documentElement.dataset.tema === 'scuro') perTema(true);
  },
};
