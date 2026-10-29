import { t } from '../core/i18n.js';
import { registraTooltipStrati } from '../core/tooltip.js';

// Elementi strutturali della Carta Geologica d'Italia 1:1.000.000 (ISPRA): sovrascorrimenti e contatti tettonici, cioè i
// fronti che disegnano la catena appenninica. Le linee si scaricano dal WFS di ISPRA alla prima accensione. Spento all'avvio.
const SRC = 'placche-strutture';
const LINEE = 'placche-strutture-linee';
const HIT = 'placche-strutture-hit';
const URL_WFS = 'https://sgi2.isprambiente.it/geoserver/ge-core7/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=ge-core7:Elementi_Strutturali_1M&outputFormat=application/json&srsName=EPSG:4326&propertyName=DESCRIZIONE,geom';
const VUOTO = { type: 'FeatureCollection', features: [] };

const TIPI = [
  { chiave: 'sovrascorrimento', colore: '#9333ea', prova: d => d.startsWith('Sovrascorrimento') },
  { chiave: 'contatto', colore: '#78716c', prova: d => d.startsWith('Contatto') },
];
const COLORE_ND = '#6b7280';
const tipoDi = d => TIPI.find(x => x.prova(d ?? ''))?.chiave ?? 'nd';
const coloreDi = tipo => TIPI.find(x => x.chiave === tipo)?.colore ?? COLORE_ND;

let mappa = null;
let legenda = null;
let acceso = false;
let caricato = false;
let errore = false;

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

async function carica() {
  if (caricato) return;
  caricato = true;
  try {
    const r = await fetch(URL_WFS);
    if (!r.ok) throw new Error(String(r.status));
    const dati = await r.json();
    for (const f of dati.features) {
      const d = f.properties.DESCRIZIONE;
      const tipo = tipoDi(d);
      f.properties = { tipo, colore: coloreDi(tipo), presunto: /presunto/i.test(d ?? '') ? 1 : 0 };
    }
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
  legenda.replaceChildren(el('strong', null, t('placcheStrutture.titolo')));
  for (const x of TIPI) {
    const riga = el('p', 'allerta-riga');
    const chip = el('i', 'incendi-campione');
    chip.style.background = x.colore;
    riga.append(chip, ` ${t(`placcheStrutture.tipo.${x.chiave}`)}`);
    legenda.append(riga);
  }
  legenda.append(el('p', 'uffici-nota', t('placcheStrutture.presunto')));
  if (errore) legenda.append(el('p', 'uffici-nota', t('placcheStrutture.nonDisponibile')));
  const credito = el('p', 'uffici-nota', `${t('placcheStrutture.dati')} `);
  credito.append(Object.assign(el('a', null, 'ISPRA, Carta Geologica 1:1.000.000'), { href: 'https://inspire-geoportal.ec.europa.eu/srv/api/records/ispra_rm:Meta_Geo_SV000001_SVD', target: '_blank', rel: 'noopener' }));
  legenda.append(credito);
}

function creaLegenda() {
  legenda = el('div', 'legenda legenda-monumenti lg-placche-strutture');
  legenda.hidden = !acceso;
  document.getElementById('legende').append(legenda);
  scriviLegenda();
}

export default {
  id: 'placche-strutture',
  titolo: 'Fronti dell\'Appennino (ISPRA)',
  gruppo: 'placche-gruppo',
  senzaIntestazione: true,
  sezione: 'Fronti dell\'Appennino',
  sezioniFisse: true,
  argomento: { titolo: 'Fronti dell\'Appennino', descrizione: 'Sovrascorrimenti e contatti tettonici della Carta Geologica d\'Italia 1:1.000.000 di ISPRA: le strutture che hanno costruito la catena appenninica.' },
  aggiungiSorgenti(map) {
    map.addSource(SRC, { type: 'geojson', data: VUOTO, attribution: '<a href="https://inspire-geoportal.ec.europa.eu/srv/api/records/ispra_rm:Meta_Geo_SV000001_SVD" target="_blank" rel="noopener">ISPRA</a>' });
  },
  aggiungiLayer(map) {
    mappa = map;
    map.addLayer({
      id: LINEE, type: 'line', source: SRC, layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'colore'], 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 8, 2, 12, 3.5], 'line-opacity': ['case', ['==', ['get', 'presunto'], 1], 0.5, 0.9] },
    });
    // linea larga e trasparente per il tooltip
    map.addLayer({ id: HIT, type: 'line', source: SRC, layout: { visibility: 'none' }, paint: { 'line-width': 12, 'line-opacity': 0 } });
    registraTooltipStrati(map, [{
      layers: [LINEE], icona: 'terremoto', sezione: 'Fronti dell\'Appennino', colore: p => coloreDi(p.tipo),
      modello: p => ({ titolo: t(`placcheStrutture.tipo.${p.tipo}`), sottotitolo: p.presunto ? t('placcheStrutture.statoPresunto') : t('placcheStrutture.statoCerto'), elenco: [] }),
    }]);
    map.on('mouseenter', LINEE, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', LINEE, () => { map.getCanvas().style.cursor = ''; });
  },
  legendaPannello: '.lg-placche-strutture',
  strati: [{
    id: 'placche-strutture', etichetta: 'Fronti dell\'Appennino (ISPRA)', layers: [LINEE, HIT], attivo: false, legendaPannello: '.lg-placche-strutture',
    suCambio(attivo) {
      acceso = attivo;
      if (legenda) legenda.hidden = !attivo;
      if (attivo) carica();
    },
  }],
  pannello: creaLegenda,
};
