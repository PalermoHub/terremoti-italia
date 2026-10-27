import { tl, t } from '../core/i18n.js';
import { AREA_EVENTI } from '../core/config.js';
import { scaricaEventi, eventoDaIngv, modelloPopupTerremoto, voceTerremoto, voceSerie, voceAltri } from './scheda-terremoti.js';
import { barraEventi, graficoSerie, elencoAltri } from './scheda-terremoti-dom.js';
import { pannelloConfronto } from './terremoti-archivio.js';
import { creaPopupTerremoti, simboliRighe } from './terremoti-popup.js';
import { registraTooltipStrati } from '../core/tooltip.js';
import { clicSu } from '../core/scheda-navigazione.js';

// Confronto tra due anni: gli eventi dei due anni insieme in mappa, a parte dai terremoti storici. Spento all'avvio; si accende dal pannello Strati.
// Anno A azzurro, anno B arancio: il colore dice a quale anno appartiene il cerchio, la grandezza la magnitudo. Non si aggiorna da solo.
const SRC = 'terremoti-confronto';
const PUNTI = 'terremoti-confronto-punti';
const ANNI = 'terremoti-confronto-anni'; // l'anno scritto accanto al cerchio
const HIT = 'terremoti-confronto-hit'; // cerchi trasparenti per il clic, sempre presenti
export const COLORE_A = '#0ea5e9';
export const COLORE_B = '#f97316';
const TESTO_A = '#075985';
const TESTO_B = '#9a3412';
const AREA = AREA_EVENTI;
const VUOTO = { type: 'FeatureCollection', features: [] };
const FINESTRA_SCELTA_MS = 1500;

let mappa = null;
let legenda = null;
let chiave = null;
let acceso = false;
let periodoMostrato = null;
let eventi = []; // proprietà degli eventi in mappa
let primaVolta = true;
let pannello = null;
let scelto = null; // evento scelto con le frecce della scheda
let richiesta = 0; // una risposta in ritardo di una richiesta precedente si scarta
const popup = creaPopupTerremoti();

const annoRoma = ts => Number(new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome', year: 'numeric' }));
const proprieta = f => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });

// Le frecce della scheda scelgono l'evento da aprire: dove i cerchi si sovrappongono il clic simulato non deve ripiegare sul più forte
const evento = trovati => {
  const attuale = scelto && Date.now() < scelto.fino ? trovati.find(f => f.properties.id === scelto.id) : null;
  return attuale ?? [...trovati].sort((a, b) => b.properties.mag - a.properties.mag)[0];
};
const vaiAEvento = p => clicSu(mappa, [p.lon, p.lat], () => { scelto = { id: p.id, fino: Date.now() + FINESTRA_SCELTA_MS }; });

async function scaricaLato(lato, periodo, magMin) {
  const scarico = await scaricaEventi({ da: periodo.da, a: periodo.a, magMin, area: AREA });
  const colore = lato === 'a' ? COLORE_A : COLORE_B;
  const features = scarico.eventi.map(f => eventoDaIngv(f, Infinity)).filter(Boolean).map(f => ({ ...f, properties: { ...f.properties, colore, lato, fascia: 'Confronto', anno: annoRoma(f.properties.ts) } }));
  return { features, troncato: scarico.troncato };
}

// Mostra in mappa gli eventi dei due periodi con magnitudo ≥ magMin; risponde { a, b } con { n, troncato }, o null se nel frattempo è partita un'altra richiesta
async function carica(periodoA, periodoB, magMin) {
  const mia = ++richiesta;
  const [a, b] = await Promise.all([scaricaLato('a', periodoA, magMin), scaricaLato('b', periodoB, magMin)]);
  if (mia !== richiesta) return null;
  const features = [...a.features, ...b.features];
  eventi = features.map(proprieta);
  periodoMostrato = { da: Math.min(periodoA.da, periodoB.da), a: Math.max(periodoA.a, periodoB.a) };
  mappa?.getSource(SRC)?.setData({ type: 'FeatureCollection', features });
  popup.chiudi();
  chiave?.update(periodoA, periodoB);
  return { a: { n: a.features.length, troncato: a.troncato }, b: { n: b.features.length, troncato: b.troncato } };
}

// Chiave dei colori: quale anno è azzurro e quale arancio, e quanti eventi ha ciascuno
function creaChiave() {
  const nodo = document.createElement('div');
  nodo.className = 'terremoti-confronto-chiave';
  nodo.hidden = true;
  const riga = (colore) => {
    const r = document.createElement('span');
    const pallino = document.createElement('i');
    pallino.style.background = colore;
    const testo = document.createElement('span');
    r.append(pallino, testo);
    nodo.append(r);
    return testo;
  };
  const testoA = riga(COLORE_A);
  const testoB = riga(COLORE_B);
  const anno = p => new Date(p.da).getUTCFullYear();
  return {
    nodo,
    update(pa, pb) {
      const conta = lato => eventi.filter(e => e.lato === lato).length;
      testoA.textContent = `${anno(pa)} · ${conta('a')}`;
      testoB.textContent = `${anno(pb)} · ${conta('b')}`;
      nodo.hidden = false;
    },
  };
}

function creaLegenda() {
  legenda = document.createElement('div');
  legenda.className = 'legenda legenda-monumenti lg-terremoti-confronto';
  legenda.hidden = !acceso;
  const titolo = document.createElement('strong');
  titolo.textContent = t('terremoti.arc.titoloConfronto');
  pannello = pannelloConfronto({ carica });
  chiave = creaChiave();
  const credito = document.createElement('p');
  credito.className = 'uffici-nota';
  const link = Object.assign(document.createElement('a'), { textContent: 'INGV', href: 'https://terremoti.ingv.it/', target: '_blank', rel: 'noopener' });
  credito.append(`${t('terremoti.dati')} `, link);
  legenda.append(titolo, chiave.nodo, credito);
  document.getElementById('legende').append(legenda);
}

// Il modulo del pannello «Confronto» nel rail di destra: la scheda con i filtri e la tabella (creata con la legenda)
export const nodoConfronto = () => pannello?.nodo ?? null;

export default {
  id: 'terremoti-confronto',
  titolo: 'Confronto terremoti',
  gruppo: 'eventi',
  sezione: 'Confronto terremoti',
  sezioniFisse: true,
  argomento: { titolo: 'Confronto terremoti', descrizione: 'I terremoti di due anni a confronto, dall\'archivio locale dei dati INGV: gli eventi dell\'anno A e dell\'anno B insieme in mappa, in colori diversi, con la tabella delle differenze.' },
  aggiungiSorgenti(map) {
    map.addSource(SRC, { type: 'geojson', data: VUOTO, attribution: '<a href="https://terremoti.ingv.it/" target="_blank" rel="noopener">INGV</a>' });
  },
  aggiungiLayer(map) {
    mappa = map;
    // i più forti sopra gli altri; spento all'avvio (visibilità esplicita: i moduli del nucleo la leggono)
    map.addLayer({
      id: PUNTI, type: 'circle', source: SRC, layout: { visibility: 'none', 'circle-sort-key': ['get', 'mag'] },
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['*', ['get', 'raggio'], 0.8], 12, ['*', ['get', 'raggio'], 1.6]], 'circle-color': ['get', 'colore'], 'circle-opacity': 0.45, 'circle-stroke-color': ['get', 'colore'], 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.95 },
    });
    map.addLayer({
      id: ANNI, type: 'symbol', source: SRC, minzoom: 7, layout: { visibility: 'none', 'text-field': ['to-string', ['get', 'anno']], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.9], 'text-allow-overlap': false, 'symbol-sort-key': ['-', 0, ['get', 'mag']] },
      paint: { 'text-color': ['match', ['get', 'lato'], 'a', TESTO_A, TESTO_B], 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    });
    map.addLayer({ id: HIT, type: 'circle', source: SRC, paint: { 'circle-radius': ['max', 10, ['get', 'raggio']], 'circle-opacity': 0 } });
    map.on('click', e => {
      if (map.getLayoutProperty(PUNTI, 'visibility') === 'none') return;
      const f = evento(map.queryRenderedFeatures(e.point, { layers: [PUNTI] }));
      if (f) popup.apri(map, proprieta(f), e.point);
    });
    registraTooltipStrati(map, [{
      layers: [PUNTI], icona: 'terremoto', sezione: 'Confronto terremoti', colore: p => p.colore,
      modello: p => {
        const m = modelloPopupTerremoto(p);
        const simbolo = simboliRighe(p);
        return { titolo: m.titolo, sottotitolo: tl(m.sottotitolo), badge: m.badge, elenco: m.righe.map(r => ({ testo: `${tl(r.etichetta)}: ${r.valore}`, ...simbolo[r.etichetta]?.() })) };
      },
    }]);
    map.on('mouseenter', PUNTI, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', PUNTI, () => { map.getCanvas().style.cursor = ''; });
  },
  scheda: {
    layers: [HIT],
    voci(trovati) {
      const primo = evento(trovati.filter(f => f.layer.id === HIT));
      if (!primo) return [];
      const grafici = graficoSerie(AREA, p => { const trovato = eventi.find(v => v.id === String(p.id)); if (trovato) vaiAEvento(trovato); }, { sorgente: () => eventi, adesso: () => periodoMostrato?.a ?? Date.now() });
      return [
        voceTerremoto(proprieta(primo), Date.now(), () => barraEventi(primo.properties.id, () => eventi, vaiAEvento), true),
        { ...voceSerie(() => grafici), chiave: 'terremoto-confronto-serie' },
        { ...voceAltri(() => elencoAltri(() => eventi, new Set([primo.properties.id]))), chiave: 'terremoto-confronto-altri' },
      ];
    },
    // il clic su un cerchio apre la scheda solo a strato acceso
    apertoFuoriComune(map, e) {
      return map.getLayoutProperty(PUNTI, 'visibility') !== 'none' && map.queryRenderedFeatures(e.point, { layers: [HIT] }).length > 0;
    },
  },
  legendaPannello: '.lg-terremoti-confronto',
  strati: [{
    id: 'terremoti-confronto', etichetta: 'Confronto terremoti (due anni)', layers: [PUNTI, ANNI], attivo: false, legendaPannello: '.lg-terremoti-confronto',
    suCambio(attivo) {
      acceso = attivo;
      if (legenda) legenda.hidden = !attivo;
      if (!attivo) { popup.chiudi(); return; }
      if (primaVolta && pannello) { primaVolta = false; pannello.confronta(); } // la prima volta si vede subito il confronto tra gli ultimi due anni
    },
  }],
  pannello: creaLegenda,
};
