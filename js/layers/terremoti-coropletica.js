import { t } from '../core/i18n.js';
import { SRC_COMUNI, STRATO_COMUNI, sorgenteComuni } from '../core/config.js';
import { EVENTO_TABELLA } from '../core/tabella-dati.js';
import { registraTooltipStrati } from '../core/tooltip.js';
import { caricaTerritorio } from '../core/territorio-eventi.js';
import { amministrazioneDi } from '../core/territorio.js';
import { aggregaTerritorio, RAMPA_COLORI } from './scheda-mappe.js';
import { scelta } from './terremoti-archivio.js';
import { eventiPeriodo, pannelloPeriodo, elencoEventi, legendaMappa, el, numero } from './terremoti-periodo.js';

// Mappa coropletica dei terremoti: le province (o le regioni) colorate per numero di eventi o per magnitudo massima, su un anno o
// un periodo dell'archivio. Il territorio di ogni evento viene dall'indice dei comuni (core/territorio.js): gli eventi in mare non contano.
// I poligoni sono i comuni dei tile, colorati per nome di provincia o regione. Spento all'avvio; non si aggiorna da solo.
const FILL = 'terremoti-coropletica-fill';
const CAMPO = { provincia: 'den_uts', regione: 'den_reg' }; // nome del territorio nei tile dei comuni
const SENZA_COLORE = 'rgba(0, 0, 0, 0)';

let mappa = null;
let acceso = false;
let primaVolta = true;
let pannello = null;
let livello = null;
let righe = [];
let eventiMostrati = [];
let elenco = null;
let massimo = 0;
let livelloMostrato = 'provincia';
let richiesta = 0;
let estremi = []; // una scritta per ogni rampa: quella del pannello e quella in mappa
let legenda = null;

const chiave = nome => String(nome ?? '').trim().toLowerCase();

// Colore dei poligoni: i comuni prendono il colore del loro territorio (nome in minuscolo, come nei tile)
function applicaColori() {
  if (!mappa?.getLayer(FILL)) return;
  const coppie = righe.flatMap(r => [chiave(r.nome), r.colore]);
  mappa.setPaintProperty(FILL, 'fill-color', coppie.length ? ['match', ['downcase', ['to-string', ['coalesce', ['get', CAMPO[livelloMostrato]], '']]], ...coppie, SENZA_COLORE] : SENZA_COLORE);
}

function legendaRampa() {
  const nodo = el('div', 'terremoti-rampa');
  const barra = el('i', 'terremoti-rampa-barra');
  barra.style.background = `linear-gradient(to right, ${RAMPA_COLORI.join(', ')})`;
  const scritta = el('span', 'terremoti-rampa-estremi');
  estremi.push(scritta);
  nodo.append(barra, scritta);
  return nodo;
}

let metrica = null;
async function carica({ periodo, mag }) {
  const mia = ++richiesta;
  const [{ eventi, troncato }] = await Promise.all([eventiPeriodo(periodo, mag), caricaTerritorio()]);
  if (mia !== richiesta) return null;
  const m = metrica.valore() === 1 ? 'magMax' : 'conteggio';
  const l = livello.valore() === 1 ? 'regione' : 'provincia';
  const a = aggregaTerritorio(eventi, l, amministrazioneDi, m);
  righe = a.righe;
  eventiMostrati = eventi;
  massimo = a.massimo;
  livelloMostrato = l;
  applicaColori();
  elenco?.aggiorna();
  const testo = massimo > 0 ? `0 – ${numero(massimo, m === 'magMax' ? 1 : 0)}${m === 'magMax' ? '' : ` ${t('terremoti.den.eventi')}`}` : '';
  estremi.forEach(e => { e.textContent = testo; });
  document.dispatchEvent(new Event(EVENTO_TABELLA));
  return { n: eventi.length, troncato, testo: t('terremoti.coro.nota', { n: numero(righe.length), fuori: numero(a.fuori) }) };
}

function creaPannello() {
  livello = scelta(t('terremoti.coro.livello'), [0, 1], 0, v => t(v ? 'terremoti.coro.regioni' : 'terremoti.coro.province'));
  metrica = scelta(t('terremoti.den.misura'), [0, 1], 0, v => t(v ? 'terremoti.den.magMax' : 'terremoti.den.conteggio'));
  elenco = elencoEventi(() => eventiMostrati, () => mappa);
  legenda = legendaMappa('terremoti-coropletica', t('terremoti.coro.titolo'), [legendaRampa()]);
  pannello = pannelloPeriodo({ titolo: t('terremoti.coro.titolo'), extra: [livello, metrica], alMostra: carica, ancora: [legendaRampa(), elenco.nodo] });
}

const riga = p => righe.find(r => chiave(r.nome) === chiave(p[CAMPO[livelloMostrato]]));

export const nodoMappa = () => pannello?.nodo ?? null;

export default {
  id: 'terremoti-coropletica',
  titolo: 'Terremoti per territorio',
  gruppo: 'terremoti-gruppo',
  senzaIntestazione: true,
  sezione: 'Terremoti per territorio',
  sezioniFisse: true,
  argomento: { titolo: 'Terremoti per territorio', descrizione: 'Le province o le regioni colorate per numero di terremoti o per magnitudo massima, su un anno o un periodo dell\'archivio INGV.' },
  aggiungiSorgenti(map) {
    // la sorgente dei comuni la crea il modulo che passa per primo
    if (!map.getSource(SRC_COMUNI)) map.addSource(SRC_COMUNI, sorgenteComuni());
  },
  aggiungiLayer(map) {
    mappa = map;
    map.addLayer({ id: FILL, type: 'fill', source: SRC_COMUNI, 'source-layer': STRATO_COMUNI, layout: { visibility: 'none' }, paint: { 'fill-color': SENZA_COLORE, 'fill-opacity': 0.7, 'fill-antialias': false } });
    registraTooltipStrati(map, [{
      layers: [FILL], icona: 'terremoto', sezione: 'Terremoti per territorio',
      colore: p => riga(p)?.colore ?? '#9ca3af',
      modello: p => {
        const r = riga(p);
        const nome = p[CAMPO[livelloMostrato]];
        if (!r) return { titolo: nome, sottotitolo: livelloMostrato === 'provincia' ? p.den_reg : '', elenco: [{ testo: t('terremoti.coro.nessuno') }] };
        return { titolo: r.nome, sottotitolo: livelloMostrato === 'provincia' ? r.regione : '', elenco: [{ testo: t('terremoti.den.tooltipN', { n: numero(r.n) }) }, { testo: t('terremoti.den.tooltipMag', { mag: numero(r.magMax, 1) }) }] };
      },
    }]);
  },
  strati: [{
    id: 'terremoti-coropletica', etichetta: 'Terremoti per territorio (province)', layers: [FILL], attivo: false, legendaPannello: '.lg-terremoti-coropletica',
    suCambio(attivo) {
      acceso = attivo;
      if (legenda) legenda.hidden = !attivo;
      if (attivo && primaVolta && pannello) { primaVolta = false; pannello.mostra(); }
      document.dispatchEvent(new Event(EVENTO_TABELLA));
    },
  }],
  tabella: {
    id: 'terremoti-coropletica',
    etichetta: t('tabella.layer.terremotiCoropletica'),
    fonte: t('tabella.fonte.ingvAggregato'),
    licenza: 'CC BY 4.0',
    colonne: () => [
      { id: 'nome', etichetta: t('tabella.col.territorio'), valore: r => r.nome, testo: r => r.nome, visibile: true },
      { id: 'regione', etichetta: t('tabella.col.regione'), valore: r => r.regione ?? '', testo: r => r.regione ?? '—', visibile: true },
      { id: 'n', etichetta: t('tabella.col.eventi'), valore: r => r.n, testo: r => numero(r.n), visibile: true, numerica: true },
      { id: 'magMax', etichetta: t('tabella.col.magMax'), valore: r => r.magMax, testo: r => numero(r.magMax, 1), visibile: true, numerica: true },
    ],
    righe: () => righe,
    attivo: () => acceso,
  },
  pannello: creaPannello,
};
