import { t } from '../core/i18n.js';
import { urlDati } from '../core/config.js';
import { registraTooltipStrati } from '../core/tooltip.js';

// Margini di placca (modello PB2002 di Peter Bird) nell'area dell'app: dorsali e rift (divergenti), subduzioni e collisioni
// (convergenti), faglie trasformi. Le linee vengono da dati/placche-margini.json (scripts/placche-margini.mjs). Spento all'avvio.
const SRC = 'placche-margini';
const LINEE = 'placche-margini-linee';
const HIT = 'placche-margini-hit';
const VUOTO = { type: 'FeatureCollection', features: [] };

const TIPI = [
  { chiave: 'divergente', colore: '#dc2626' },
  { chiave: 'convergente', colore: '#2563eb' },
  { chiave: 'trasforme', colore: '#16a34a' },
];
const coloreDi = tipo => TIPI.find(x => x.chiave === tipo)?.colore ?? '#6b7280';
// codici di placca di Bird presenti nell'area; il separatore («-», «/», «\») indica da che parte immerge la placca, qui non serve
const PLACCHE = { AF: 'Africa', EU: 'Eurasia', AS: 'Egeo', AT: 'Anatolia' };
const coppia = c => String(c ?? '').split(/[-/\\]/).map(x => PLACCHE[x] ?? x).join(' – ');

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
    const r = await fetch(urlDati('placche-margini.json'));
    if (!r.ok) throw new Error(String(r.status));
    const dati = await r.json();
    for (const f of dati.features) f.properties = { ...f.properties, colore: coloreDi(f.properties.tipo) };
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
  legenda.replaceChildren(el('strong', null, t('placche.titolo')));
  for (const x of TIPI) {
    const riga = el('p', 'allerta-riga');
    const chip = el('i', 'incendi-campione');
    chip.style.background = x.colore;
    riga.append(chip, ` ${t(`placche.tipo.${x.chiave}`)}`);
    legenda.append(riga);
  }
  if (errore) legenda.append(el('p', 'uffici-nota', t('placche.nonDisponibile')));
  const credito = el('p', 'uffici-nota', `${t('placche.dati')} `);
  credito.append(Object.assign(el('a', null, 'Bird, PB2002'), { href: 'http://peterbird.name/publications/2003_PB2002/2003_PB2002.htm', target: '_blank', rel: 'noopener' }));
  legenda.append(credito);
}

function creaLegenda() {
  legenda = el('div', 'legenda legenda-monumenti lg-placche-margini');
  legenda.hidden = !acceso;
  document.getElementById('legende').append(legenda);
  scriviLegenda();
}

export default {
  id: 'placche-margini',
  titolo: 'Margini di placca',
  gruppo: 'placche-gruppo',
  senzaIntestazione: true,
  sezione: 'Margini di placca',
  sezioniFisse: true,
  argomento: { titolo: 'Margini di placca', descrizione: 'I margini tra le placche tettoniche nell\'area dell\'app: dorsali, subduzioni e collisioni, faglie trasformi.' },
  aggiungiSorgenti(map) {
    map.addSource(SRC, { type: 'geojson', data: VUOTO, attribution: '<a href="http://peterbird.name/publications/2003_PB2002/2003_PB2002.htm" target="_blank" rel="noopener">Bird (2003), PB2002</a>' });
  },
  aggiungiLayer(map) {
    mappa = map;
    map.addLayer({
      id: LINEE, type: 'line', source: SRC, layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'colore'], 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2, 8, 4, 12, 6], 'line-opacity': 0.85 },
    });
    // linea larga e trasparente per il tooltip
    map.addLayer({ id: HIT, type: 'line', source: SRC, layout: { visibility: 'none' }, paint: { 'line-width': 14, 'line-opacity': 0 } });
    registraTooltipStrati(map, [{
      layers: [LINEE], icona: 'terremoto', sezione: 'Margini di placca', colore: p => coloreDi(p.tipo),
      modello: p => ({ titolo: t(`placche.tipo.${p.tipo}`), sottotitolo: coppia(p.placche), elenco: [] }),
    }]);
    map.on('mouseenter', LINEE, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', LINEE, () => { map.getCanvas().style.cursor = ''; });
  },
  legendaPannello: '.lg-placche-margini',
  strati: [{
    id: 'placche-margini', etichetta: 'Margini di placca', layers: [LINEE, HIT], attivo: false, legendaPannello: '.lg-placche-margini',
    suCambio(attivo) {
      acceso = attivo;
      if (legenda) legenda.hidden = !attivo;
      if (attivo) carica();
    },
  }],
  pannello: creaLegenda,
};
