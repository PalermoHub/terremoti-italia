import { t } from '../core/i18n.js';
import { registraTooltipStrati } from '../core/tooltip.js';
import { contenutoPopupTraffico, ancoraPopupTraffico, rifinisciPopupTraffico, centraPopupTraffico } from './popup-traffico.js';
import { urlSicuro } from '../core/url-sicuro.js';

// Faglie d'Italia del dataset HIKE (GeoERA) servito dal WFS di EGDI: le linee si scaricano alla prima accensione. Spento all'avvio.
const SRC = 'faglie-egdi';
const LINEE = 'faglie-egdi-linee';
const HIT = 'faglie-egdi-hit';
const FILTRO_IT = '<Filter><PropertyIsEqualTo><PropertyName>country_cd</PropertyName><Literal>IT</Literal></PropertyIsEqualTo></Filter>';
const URL_WFS = 'https://maps.europe-geology.eu/wfs/3034/?' + new URLSearchParams({
  service: 'WFS', version: '1.0.0', request: 'GetFeature', typename: 'hike_overview_layer', outputformat: 'geojson',
  propertyname: 'local_name,fault_type,move_sense,active,young_unit,dip_angle,dip_direct,reference,metadata',
  filter: FILTRO_IT,
});
const VUOTO = { type: 'FeatureCollection', features: [] };

// tipo di faglia → famiglia (colore della linea); «unknown» e valori mancanti: non determinata
const FAMIGLIE = [
  { chiave: 'normale', colore: '#dc2626', tipi: ['normal fault'] },
  { chiave: 'inversa', colore: '#2563eb', tipi: ['thrust fault', 'reverse fault'] },
  { chiave: 'trascorrente', colore: '#16a34a', tipi: ['strike slip fault'] },
  { chiave: 'obliqua', colore: '#d97706', tipi: ['oblique slip fault'] },
];
const COLORE_ND = '#6b7280';
const famiglia = tipo => FAMIGLIE.find(f => f.tipi.includes(tipo)) ?? { chiave: 'nd', colore: COLORE_ND };

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
  titolo: p.local_name || t('faglieEgdi.senzaNome'),
  sottotitolo: t(`faglieEgdi.famiglia.${famiglia(p.fault_type).chiave}`),
  righe: [
    p.move_sense && { etichetta: t('faglieEgdi.movimento'), valore: p.move_sense.replaceAll('_', ' ') },
    p.dip_angle && { etichetta: t('faglieEgdi.inclinazione'), valore: [p.dip_angle, p.dip_direct].filter(Boolean).join(', ') },
    p.young_unit && { etichetta: t('faglieEgdi.unitaRecente'), valore: p.young_unit },
    { etichetta: t('faglieEgdi.attiva'), valore: p.active === 'Yes' ? t('faglieEgdi.si') : t('faglieEgdi.no') },
  ].filter(Boolean),
});

function apriPopup(e, p) {
  popup?.remove();
  const chiudi = () => { popup?.remove(); popup = null; };
  const coordinate = [e.lngLat.lng, e.lngLat.lat];
  const { anchor, offset } = ancoraPopupTraffico(e.point, mappa.getContainer());
  const colore = famiglia(p.fault_type).colore;
  const corpo = [];
  const url = urlSicuro(p.metadata);
  if (url) corpo.push(Object.assign(el('a', 'traffico-link', t('faglieEgdi.scheda')), { href: url, target: '_blank', rel: 'noopener' }));
  popup = new maplibregl.Popup({ maxWidth: '300px', className: 'traffico-popup-box', anchor, offset, closeButton: false })
    .setLngLat(coordinate)
    .setDOMContent(contenutoPopupTraffico({ sezione: t('faglieEgdi.titolo'), icona: 'terremoto', colore, modello: modello(p), corpo, coordinate, chiudi }))
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
    for (const f of dati.features) f.properties = { ...f.properties, colore: famiglia(f.properties.fault_type).colore, attiva: f.properties.active === 'Yes' ? 1 : 0 };
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
  legenda.replaceChildren(el('strong', null, t('faglieEgdi.titolo')));
  for (const f of [...FAMIGLIE, { chiave: 'nd', colore: COLORE_ND }]) {
    const riga = el('p', 'allerta-riga');
    const chip = el('i', 'incendi-campione');
    chip.style.background = f.colore;
    riga.append(chip, ` ${t(`faglieEgdi.famiglia.${f.chiave}`)}`);
    legenda.append(riga);
  }
  legenda.append(el('p', 'uffici-nota', t('faglieEgdi.spessore')));
  if (errore) legenda.append(el('p', 'uffici-nota', t('faglieEgdi.nonDisponibile')));
  const credito = el('p', 'uffici-nota', `${t('faglieEgdi.dati')} `);
  credito.append(Object.assign(el('a', null, 'EGDI / GeoERA HIKE'), { href: 'https://www.europe-geology.eu/', target: '_blank', rel: 'noopener' }));
  legenda.append(credito);
}

function creaLegenda() {
  legenda = el('div', 'legenda legenda-monumenti lg-faglie-egdi');
  legenda.hidden = !acceso;
  document.getElementById('legende').append(legenda);
  scriviLegenda();
}

export default {
  id: 'faglie-egdi',
  titolo: 'Faglie (EGDI)',
  gruppo: 'faglie-gruppo',
  senzaIntestazione: true,
  sezione: 'Faglie (EGDI)',
  sezioniFisse: true,
  argomento: { titolo: 'Faglie (EGDI)', descrizione: 'Le faglie d\'Italia del dataset HIKE di GeoERA, servito da EGDI, colorate per tipo.' },
  aggiungiSorgenti(map) {
    map.addSource(SRC, { type: 'geojson', data: VUOTO, attribution: '<a href="https://www.europe-geology.eu/" target="_blank" rel="noopener">EGDI</a>' });
  },
  aggiungiLayer(map) {
    mappa = map;
    map.addLayer({
      id: LINEE, type: 'line', source: SRC, layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'colore'], 'line-width': ['interpolate', ['linear'], ['zoom'], 5, ['+', 0.6, ['*', ['get', 'attiva'], 0.8]], 12, ['+', 1.5, ['*', ['get', 'attiva'], 1.5]]], 'line-opacity': ['case', ['==', ['get', 'attiva'], 1], 0.95, 0.6] },
    });
    // linea larga e trasparente per il clic e il tooltip
    map.addLayer({ id: HIT, type: 'line', source: SRC, layout: { visibility: 'none' }, paint: { 'line-width': 12, 'line-opacity': 0 } });
    map.on('click', e => {
      if (!acceso) return;
      const f = map.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers: [LINEE] })[0];
      if (f) apriPopup(e, f.properties);
    });
    registraTooltipStrati(map, [{
      layers: [LINEE], icona: 'terremoto', sezione: 'Faglie (EGDI)', colore: p => famiglia(p.fault_type).colore,
      modello: p => { const m = modello(p); return { titolo: m.titolo, sottotitolo: m.sottotitolo, elenco: m.righe.map(r => ({ testo: `${r.etichetta}: ${r.valore}` })) }; },
    }]);
    map.on('mouseenter', LINEE, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', LINEE, () => { map.getCanvas().style.cursor = ''; });
  },
  legendaPannello: '.lg-faglie-egdi',
  strati: [{
    id: 'faglie-egdi', etichetta: 'Faglie (EGDI)', layers: [LINEE, HIT], attivo: false, legendaPannello: '.lg-faglie-egdi',
    suCambio(attivo) {
      acceso = attivo;
      if (legenda) legenda.hidden = !attivo;
      if (!attivo) { popup?.remove(); popup = null; return; }
      carica();
    },
  }],
  pannello: creaLegenda,
};
