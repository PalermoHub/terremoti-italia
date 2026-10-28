import { t, tl } from '../core/i18n.js';
import { registraTooltipStrati } from '../core/tooltip.js';
import { contenutoPopupTraffico, ancoraPopupTraffico, rifinisciPopupTraffico, centraPopupTraffico } from './popup-traffico.js';
import { urlSicuro } from '../core/url-sicuro.js';

// Faglie capaci del catalogo ITHACA (ISPRA): le linee si scaricano dal WFS di ISPRA alla prima accensione. Spento all'avvio.
const SRC = 'faglie';
const LINEE = 'faglie-linee';
const HIT = 'faglie-hit';
const URL_WFS = 'https://sgi2.isprambiente.it/geoserver/ge-core1/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=ge-core1:ITHACA&outputFormat=application/json&srsName=EPSG:4326&propertyName=faultname,regionname,kinematics,rank,url,geom';
const VUOTO = { type: 'FeatureCollection', features: [] };

// cinematica → famiglia (colore della linea); «ND» e valori mancanti: non determinata
const FAMIGLIE = [
  { chiave: 'normale', colore: '#dc2626', prova: k => k.startsWith('Normal') || k.startsWith('Oblique Normal') },
  { chiave: 'inversa', colore: '#2563eb', prova: k => k.startsWith('Reverse') || k.startsWith('Oblique Reverse') },
  { chiave: 'trascorrente', colore: '#16a34a', prova: k => k.startsWith('Strike') },
];
const COLORE_ND = '#6b7280';
const famiglia = k => FAMIGLIE.find(f => f.prova(k ?? '')) ?? { chiave: 'nd', colore: COLORE_ND };

let mappa = null;
let legenda = null;
let acceso = false;
let caricato = false;
let popup = null;
let errore = false;

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

const modello = p => ({
  titolo: p.faultname || t('faglie.senzaNome'),
  sottotitolo: p.regionname,
  righe: [
    { etichetta: t('faglie.cinematica'), valore: p.kinematics && p.kinematics !== 'ND' ? p.kinematics : t('faglie.nd') },
    { etichetta: t('faglie.rango'), valore: t(`faglie.rango.${p.rank === 'Primary' || p.rank === 'Secondary' ? p.rank : 'ND'}`) },
  ],
});

function apriPopup(e, p) {
  popup?.remove();
  const chiudi = () => { popup?.remove(); popup = null; };
  const coordinate = [e.lngLat.lng, e.lngLat.lat];
  const { anchor, offset } = ancoraPopupTraffico(e.point, mappa.getContainer());
  const colore = famiglia(p.kinematics).colore;
  const corpo = [];
  const url = urlSicuro(p.url);
  if (url) corpo.push(Object.assign(el('a', 'traffico-link', t('faglie.scheda')), { href: url, target: '_blank', rel: 'noopener' }));
  popup = new maplibregl.Popup({ maxWidth: '300px', className: 'traffico-popup-box', anchor, offset, closeButton: false })
    .setLngLat(coordinate)
    .setDOMContent(contenutoPopupTraffico({ sezione: t('faglie.titolo'), icona: 'terremoto', colore, modello: modello(p), corpo, coordinate, chiudi }))
    .addTo(mappa);
  rifinisciPopupTraffico(popup, anchor, colore);
  centraPopupTraffico(mappa, popup, anchor, coordinate);
}

async function carica() {
  if (caricato) return;
  caricato = true;
  try {
    const r = await fetch(URL_WFS);
    if (!r.ok) throw new Error(String(r.status));
    const dati = await r.json();
    for (const f of dati.features) f.properties = { ...f.properties, colore: famiglia(f.properties.kinematics).colore, primaria: f.properties.rank === 'Primary' ? 1 : 0 };
    mappa?.getSource(SRC)?.setData(dati);
    errore = false;
  } catch {
    caricato = false; // si riprova alla prossima accensione
    errore = true;
  }
  scriviLegenda();
}

function scriviLegenda() {
  if (!legenda) return;
  legenda.replaceChildren(el('strong', null, t('faglie.titolo')));
  for (const f of [...FAMIGLIE, { chiave: 'nd', colore: COLORE_ND }]) {
    const riga = el('p', 'allerta-riga');
    const chip = el('i', 'incendi-campione');
    chip.style.background = f.colore;
    riga.append(chip, ` ${t(`faglie.famiglia.${f.chiave}`)}`);
    legenda.append(riga);
  }
  legenda.append(el('p', 'uffici-nota', t('faglie.spessore')));
  if (errore) legenda.append(el('p', 'uffici-nota', t('faglie.nonDisponibile')));
  const credito = el('p', 'uffici-nota', `${t('faglie.dati')} `);
  credito.append(Object.assign(el('a', null, 'ISPRA ITHACA'), { href: 'https://sgi2.isprambiente.it/ithacaweb/', target: '_blank', rel: 'noopener' }));
  legenda.append(credito);
}

function creaLegenda() {
  legenda = el('div', 'legenda legenda-monumenti lg-faglie');
  legenda.hidden = !acceso;
  document.getElementById('legende').append(legenda);
  scriviLegenda();
}

export default {
  id: 'faglie',
  titolo: 'Faglie capaci (ITHACA)',
  gruppo: 'faglie-gruppo',
  senzaIntestazione: true,
  sezione: 'Faglie capaci',
  sezioniFisse: true,
  argomento: { titolo: 'Faglie capaci', descrizione: 'Le faglie capaci d\'Italia del catalogo ITHACA di ISPRA, colorate per cinematica.' },
  aggiungiSorgenti(map) {
    map.addSource(SRC, { type: 'geojson', data: VUOTO, attribution: '<a href="https://sgi2.isprambiente.it/ithacaweb/" target="_blank" rel="noopener">ISPRA ITHACA</a>' });
  },
  aggiungiLayer(map) {
    mappa = map;
    map.addLayer({
      id: LINEE, type: 'line', source: SRC, layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'colore'], 'line-width': ['interpolate', ['linear'], ['zoom'], 5, ['+', 0.8, ['*', ['get', 'primaria'], 0.7]], 12, ['+', 2, ['*', ['get', 'primaria'], 1.5]]], 'line-opacity': ['case', ['==', ['get', 'primaria'], 1], 0.95, 0.65] },
    });
    // linea larga e trasparente per il clic e il tooltip
    map.addLayer({ id: HIT, type: 'line', source: SRC, layout: { visibility: 'none' }, paint: { 'line-width': 12, 'line-opacity': 0 } });
    map.on('click', e => {
      if (!acceso) return;
      const f = map.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers: [LINEE] })[0];
      if (f) apriPopup(e, f.properties);
    });
    registraTooltipStrati(map, [{
      layers: [LINEE], icona: 'terremoto', sezione: 'Faglie capaci', colore: p => famiglia(p.kinematics).colore,
      modello: p => { const m = modello(p); return { titolo: m.titolo, sottotitolo: m.sottotitolo, elenco: m.righe.map(r => ({ testo: `${r.etichetta}: ${r.valore}` })) }; },
    }]);
    map.on('mouseenter', LINEE, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', LINEE, () => { map.getCanvas().style.cursor = ''; });
  },
  legendaPannello: '.lg-faglie',
  strati: [{
    id: 'faglie', etichetta: 'Faglie capaci (ITHACA)', layers: [LINEE, HIT], attivo: false, legendaPannello: '.lg-faglie',
    suCambio(attivo) {
      acceso = attivo;
      if (legenda) legenda.hidden = !attivo;
      if (!attivo) { popup?.remove(); popup = null; return; }
      carica();
    },
  }],
  pannello: creaLegenda,
};
