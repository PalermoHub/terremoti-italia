import { t } from '../core/i18n.js';
import { EVENTO_TABELLA } from '../core/tabella-dati.js';
import { registraTooltipStrati } from '../core/tooltip.js';
import { RAGGIO_GRIGLIA } from './scheda-archivio.js';
import { grigliaConteggi, RAMPA_COLORI } from './scheda-mappe.js';
import { scelta } from './terremoti-archivio.js';
import { eventiPeriodo, pannelloPeriodo, elencoEventi, legendaMappa, el, numero } from './terremoti-periodo.js';

// Densità dei terremoti: celle esagonali (circa 17 km) colorate per numero di eventi o per magnitudo massima, su un anno
// o un periodo dell'archivio. Serve quando i cerchi sono troppi e si sovrappongono. Spento all'avvio; non si aggiorna da solo.
const SRC = 'terremoti-densita';
const CELLE = 'terremoti-densita-celle';
const VUOTO = { type: 'FeatureCollection', features: [] };

let mappa = null;
let acceso = false;
let primaVolta = true;
let pannello = null;
let righe = [];
let eventiMostrati = [];
let elenco = null;
let massimo = 0;
let metricaMostrata = 'conteggio';
let richiesta = 0;
let estremi = []; // una scritta per ogni rampa: quella del pannello e quella in mappa
let legenda = null;

// Barra della rampa di colori, con il valore massimo a destra
function legendaRampa() {
  const nodo = el('div', 'terremoti-rampa');
  const barra = el('i', 'terremoti-rampa-barra');
  barra.style.background = `linear-gradient(to right, ${RAMPA_COLORI.join(', ')})`;
  const scritta = el('span', 'terremoti-rampa-estremi');
  estremi.push(scritta);
  nodo.append(barra, scritta);
  return nodo;
}
const scriviEstremi = () => {
  const mag = metricaMostrata === 'magMax';
  const testo = massimo > 0 ? `0 – ${numero(massimo, mag ? 1 : 0)}${mag ? '' : ` ${t('terremoti.den.eventi')}`}` : '';
  estremi.forEach(e => { e.textContent = testo; });
};

let metrica = null;
async function carica({ periodo, mag }) {
  const mia = ++richiesta;
  const { eventi, troncato } = await eventiPeriodo(periodo, mag);
  if (mia !== richiesta) return null;
  const m = metrica.valore() === 1 ? 'magMax' : 'conteggio';
  const g = grigliaConteggi(eventi, m, RAGGIO_GRIGLIA);
  righe = g.righe;
  eventiMostrati = eventi;
  massimo = g.massimo;
  metricaMostrata = m;
  mappa?.getSource(SRC)?.setData(g.geojson);
  scriviEstremi();
  elenco?.aggiorna();
  document.dispatchEvent(new Event(EVENTO_TABELLA));
  return { n: eventi.length, troncato, testo: t('terremoti.den.nota', { celle: numero(righe.length) }) };
}

function creaPannello() {
  metrica = scelta(t('terremoti.den.misura'), [0, 1], 0, v => t(v ? 'terremoti.den.magMax' : 'terremoti.den.conteggio'));
  elenco = elencoEventi(() => eventiMostrati, () => mappa);
  legenda = legendaMappa('terremoti-densita', t('terremoti.den.titolo'), [legendaRampa()]);
  pannello = pannelloPeriodo({ titolo: t('terremoti.den.titolo'), extra: [metrica], alMostra: carica, ancora: [legendaRampa(), elenco.nodo] });
}

export const nodoMappa = () => pannello?.nodo ?? null;

export default {
  id: 'terremoti-densita',
  titolo: 'Densità terremoti',
  gruppo: 'terremoti-gruppo',
  senzaIntestazione: true,
  sezione: 'Densità terremoti',
  sezioniFisse: true,
  argomento: { titolo: 'Densità terremoti', descrizione: 'I terremoti di un anno o di un periodo dell\'archivio INGV raccolti in celle esagonali, colorate per numero di eventi o per magnitudo massima: utile dove i cerchi si sovrappongono.' },
  aggiungiSorgenti(map) {
    map.addSource(SRC, { type: 'geojson', data: VUOTO, attribution: '<a href="https://terremoti.ingv.it/" target="_blank" rel="noopener">INGV</a>' });
  },
  aggiungiLayer(map) {
    mappa = map;
    map.addLayer({ id: CELLE, type: 'fill', source: SRC, layout: { visibility: 'none' }, paint: { 'fill-color': ['get', 'colore'], 'fill-opacity': ['get', 'opacita'], 'fill-outline-color': 'rgba(15, 23, 42, .25)' } });
    registraTooltipStrati(map, [{
      layers: [CELLE], icona: 'terremoto', sezione: 'Densità terremoti', colore: p => p.colore,
      modello: p => ({
        titolo: t('terremoti.den.tooltipN', { n: numero(p.n) }),
        elenco: [{ testo: t('terremoti.den.tooltipMag', { mag: numero(p.magMax, 1) }) }, ...(p.profMedia != null && p.profMedia !== 'null' ? [{ testo: t('terremoti.den.tooltipProf', { prof: numero(Number(p.profMedia)) }) }] : [])],
      }),
    }]);
  },
  strati: [{
    id: 'terremoti-densita', etichetta: 'Densità terremoti (esagoni)', layers: [CELLE], attivo: false, legendaPannello: '.lg-terremoti-densita',
    suCambio(attivo) {
      acceso = attivo;
      if (legenda) legenda.hidden = !attivo;
      if (attivo && primaVolta && pannello) { primaVolta = false; pannello.mostra(); }
      document.dispatchEvent(new Event(EVENTO_TABELLA));
    },
  }],
  tabella: {
    id: 'terremoti-densita',
    etichetta: t('tabella.layer.terremotiDensita'),
    fonte: t('tabella.fonte.ingvAggregato'),
    licenza: 'CC BY 4.0',
    colonne: () => [
      { id: 'cella', etichetta: t('tabella.col.cella'), valore: p => p.id, testo: p => p.id, visibile: false },
      { id: 'n', etichetta: t('tabella.col.eventi'), valore: p => p.n, testo: p => numero(p.n), visibile: true, numerica: true },
      { id: 'magMax', etichetta: t('tabella.col.magMax'), valore: p => p.magMax, testo: p => numero(p.magMax, 1), visibile: true, numerica: true },
      { id: 'profMedia', etichetta: t('tabella.col.profMedia'), valore: p => p.profMedia, testo: p => (p.profMedia == null ? '—' : numero(p.profMedia, 1)), visibile: true, numerica: true },
      { id: 'lat', etichetta: t('tabella.col.lat'), valore: p => p.lat, testo: p => numero(p.lat, 4), visibile: true, numerica: true },
      { id: 'lon', etichetta: t('tabella.col.lon'), valore: p => p.lon, testo: p => numero(p.lon, 4), visibile: true, numerica: true },
    ],
    righe: () => righe,
    attivo: () => acceso,
    apri: p => mappa?.flyTo({ center: [p.lon, p.lat], zoom: Math.max(mappa.getZoom(), 8) }),
  },
  pannello: creaPannello,
};
