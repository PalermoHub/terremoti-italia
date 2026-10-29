import { t, localeIntl } from '../core/i18n.js';
import { AREA_EVENTI } from '../core/config.js';
import { scaricaEventiTutti, eventoDaIngv, colonneTabellaTerremoti } from './scheda-terremoti.js';
import { EVENTO_TABELLA } from '../core/tabella-dati.js';
import { ANNO_INIZIO, periodoAnno, periodoValido } from './scheda-archivio.js';
import { scelta, sceltaPeriodo, stato } from './terremoti-archivio.js';
import { CLASSI_PROFONDITA, SEMILARGHEZZE_KM, SEZIONI_PREDEFINITE, coloreProfondita, fascia, riquadroFascia, lunghezzaKm, proiettaEventi } from './scheda-sezione.js';
import { graficoSezione } from './grafico-sezione.js';
import { creaInterazione } from './scheda-terremoti-dom.js';
import { creaEvidenzaMappa } from '../core/evidenza-eventi.js';
import { creditoIngv, elencoEventi, legendaProfondita, legendaMappa } from './terremoti-periodo.js';
import { catturaClic } from '../core/cattura-clic.js';
import { registraTooltipStrati } from '../core/tooltip.js';

// Sezione verticale: i terremoti dell'archivio dentro una fascia attorno a una linea A–B, disegnati come profondità contro
// distanza lungo la linea. Mostra i piani di subduzione e le faglie (come nell'arco calabro). Spento all'avvio.
// Colore = profondità, grandezza = magnitudo, in mappa e nel grafico. La linea si traccia con due clic o si prende da una sezione pronta.
const SRC = 'terremoti-sezione';
const SRC_EVENTI = 'terremoti-sezione-eventi';
const FASCIA = 'terremoti-sezione-fascia';
const LINEA = 'terremoti-sezione-linea';
const ESTREMI = 'terremoti-sezione-estremi';
const PUNTI = 'terremoti-sezione-punti';
const VUOTO = { type: 'FeatureCollection', features: [] };
const MAGNITUDO = [2, 2.5, 3, 4, 5];
const MAG_PREDEFINITA = 3;
const MASSIMO_GRAFICO = 4000; // cerchi nel grafico: oltre, restano i più forti

let mappa = null;
let acceso = false;
let primaVolta = true;
let richiesta = 0; // una risposta in ritardo di una richiesta precedente si scarta
let sezione = null; // { a, b } della linea corrente
let eventiTabella = []; // eventi dentro la fascia, con distanza e scostamento dalla linea
let punti = []; // punti scelti con i clic, prima che la linea sia completa
let tracciando = false;
let controlli = null;
let legenda = null;
let interazione = null; // evidenza in mappa dell'evento sotto il mouse nel grafico
let elenco = null;

const el = (tag, classe, testo) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
};
const numero = (n, d = 0) => n.toLocaleString(localeIntl(), { minimumFractionDigits: d, maximumFractionDigits: d });
const raggio = mag => Math.max(1.2, 1.4 + (mag - 2) * 1.5);

const coloreMappa = ['step', ['get', 'prof'], CLASSI_PROFONDITA[0].colore, ...CLASSI_PROFONDITA.slice(0, -1).flatMap((c, i) => [c.fino, CLASSI_PROFONDITA[i + 1].colore])];

// Linea, fascia ed estremi A e B in mappa (o niente, se la linea non c'è)
function disegnaLinea(a, b, semilarghezza) {
  const f = [];
  if (a && b) {
    const anello = fascia(a, b, semilarghezza);
    if (anello) f.push({ type: 'Feature', properties: { tipo: 'fascia' }, geometry: { type: 'Polygon', coordinates: [anello] } });
    f.push({ type: 'Feature', properties: { tipo: 'linea' }, geometry: { type: 'LineString', coordinates: [a, b] } });
  }
  [['A', a], ['B', b]].forEach(([nome, p]) => { if (p) f.push({ type: 'Feature', properties: { tipo: 'estremo', nome }, geometry: { type: 'Point', coordinates: p } }); });
  mappa?.getSource(SRC)?.setData({ type: 'FeatureCollection', features: f });
}

const aggiornaEventiMappa = eventi => mappa?.getSource(SRC_EVENTI)?.setData({
  type: 'FeatureCollection',
  features: eventi.map(e => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lon, e.lat] }, properties: { id: e.id, mag: e.mag, prof: e.prof, luogo: e.luogo, ora: e.ora, raggio: raggio(e.mag) } })),
});

function costruisciPannello() {
  const nodo = el('div', 'terremoti-pannello terremoti-sezione');
  const { messaggio, esegui } = stato();
  const anni = Array.from({ length: new Date().getUTCFullYear() - ANNO_INIZIO + 1 }, (_, i) => new Date().getUTCFullYear() - i);
  const periodo = sceltaPeriodo(t('terremoti.arc.anno'), anni, new Date().getUTCFullYear() - 1);
  periodo.imposta({ da: periodoAnno(ANNO_INIZIO).da, a: Date.now() }); // tutta la storia: i piani profondi hanno pochi eventi l'anno
  const mag = scelta(t('terremoti.arc.magMin'), MAGNITUDO, MAG_PREDEFINITA, m => `≥ ${numero(m, m % 1 ? 1 : 0)}`);
  const larghezza = scelta(t('terremoti.sez.larghezza'), SEMILARGHEZZE_KM, SEZIONI_PREDEFINITE[0].semilarghezza, k => t('terremoti.sez.larghezzaValore', { km: k }));
  const filtri = el('div', 'terremoti-filtri');
  filtri.append(periodo.nodo, mag.nodo, larghezza.nodo);

  const traccia = el('button', 'terremoti-archivio-btn', t('terremoti.sez.traccia'));
  const preset = el('button', 'terremoti-archivio-btn secondario', t('terremoti.sez.predefinita.arco'));
  const aggiorna = el('button', 'terremoti-archivio-btn', t('terremoti.sez.aggiorna'));
  const cancella = el('button', 'terremoti-archivio-btn secondario', t('terremoti.sez.cancella'));
  for (const b of [traccia, preset, aggiorna, cancella]) b.type = 'button';
  traccia.title = t('terremoti.sez.traccia.tip');
  aggiorna.title = t('terremoti.sez.aggiorna.tip');
  cancella.title = t('terremoti.sez.cancella.tip');
  preset.title = t('terremoti.sez.predefinita.arco.tip');
  const azioni = el('div', 'terremoti-sezione-azioni');
  azioni.append(traccia, aggiorna, cancella, preset); // la demo in fondo
  const nota = el('p', 'uffici-nota');
  const grafico = el('div', 'terremoti-sezione-grafico-box');
  elenco = elencoEventi(() => eventiTabella, () => mappa);

  const ricarica = () => {
    if (!sezione) return;
    const errore = periodoValido(periodo.valore());
    if (errore) { messaggio.textContent = t(errore); return; }
    esegui(nodo, () => carica(periodo.valore(), mag.valore(), larghezza.valore(), nota, grafico), ricarica);
  };
  const impostaLinea = (a, b) => { sezione = { a, b }; ricarica(); };
  const finisciTracciamento = () => {
    tracciando = false;
    punti = [];
    catturaClic(null);
    traccia.textContent = t('terremoti.sez.traccia');
    traccia.title = t('terremoti.sez.traccia.tip');
  };
  const inizia = () => {
    if (tracciando) { finisciTracciamento(); disegnaLinea(sezione?.a, sezione?.b, larghezza.valore()); return; }
    tracciando = true;
    punti = [];
    traccia.textContent = t('terremoti.sez.annulla');
    traccia.title = t('terremoti.sez.annulla.tip');
    nota.textContent = t('terremoti.sez.clicA');
    catturaClic(e => {
      punti.push([Number(e.lngLat.lng.toFixed(4)), Number(e.lngLat.lat.toFixed(4))]);
      if (punti.length === 1) { disegnaLinea(punti[0], null, larghezza.valore()); nota.textContent = t('terremoti.sez.clicB'); return; }
      const [a, b] = punti;
      finisciTracciamento();
      impostaLinea(a, b);
    });
  };
  traccia.addEventListener('click', inizia);
  preset.addEventListener('click', () => { finisciTracciamento(); const p = SEZIONI_PREDEFINITE[0]; larghezza.imposta(p.semilarghezza); impostaLinea(p.a, p.b); });
  cancella.addEventListener('click', () => { finisciTracciamento(); sezione = null; richiesta++; eventiTabella = []; elenco?.aggiorna(); document.dispatchEvent(new Event(EVENTO_TABELLA)); disegnaLinea(null, null, 0); aggiornaEventiMappa([]); grafico.replaceChildren(); nota.textContent = ''; });
  aggiorna.addEventListener('click', ricarica); // il periodo si applica qui: quello personalizzato non scatta da solo
  for (const c of [mag, larghezza]) c.nodo.addEventListener('change', ricarica);

  nodo.append(el('strong', null, t('terremoti.sez.titolo')), el('p', 'uffici-nota', t('terremoti.sez.intro')), filtri, azioni, nota, messaggio, grafico, elenco.nodo, el('p', 'uffici-nota', t('terremoti.arc.utc')), creditoIngv());
  return { nodo, predefinita: () => preset.click(), annulla: finisciTracciamento };
}

// Scarica gli eventi del riquadro della fascia, li proietta sulla linea e aggiorna mappa, nota e grafico
async function carica(periodo, magMin, semilarghezza, nota, grafico) {
  const mia = ++richiesta;
  const { a, b } = sezione;
  disegnaLinea(a, b, semilarghezza);
  const area = riquadroFascia(a, b, semilarghezza);
  if (!area) { nota.textContent = t('terremoti.sez.lineaNulla'); return; }
  const scarico = await scaricaEventiTutti({ da: periodo.da, a: periodo.a, magMin, area: { ...AREA_EVENTI, ...area } });
  if (mia !== richiesta) return;
  const tutti = scarico.eventi.map(f => eventoDaIngv(f, Infinity)).filter(Boolean).map(f => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
  const dentro = proiettaEventi(tutti, a, b, semilarghezza);
  eventiTabella = dentro;
  elenco?.aggiorna();
  document.dispatchEvent(new Event(EVENTO_TABELLA));
  const disegnati = dentro.length > MASSIMO_GRAFICO ? [...dentro].sort((p, q) => q.mag - p.mag).slice(0, MASSIMO_GRAFICO) : dentro;
  aggiornaEventiMappa(disegnati);
  const lunghezza = lunghezzaKm(a, b);
  if (!dentro.length) {
    grafico.replaceChildren();
    nota.textContent = t('terremoti.sez.nessunEvento');
    return;
  }
  grafico.replaceChildren(graficoSezione(disegnati, lunghezza, { interazione, semilarghezza }));
  nota.textContent = [
    t('terremoti.sez.nota', { n: numero(dentro.length), km: numero(lunghezza), semi: numero(semilarghezza), mag: numero(magMin, magMin % 1 ? 1 : 0) }),
    dentro.length > disegnati.length ? t('terremoti.sez.troncato', { n: numero(disegnati.length) }) : '',
    scarico.troncato ? t('terremoti.sez.scaricoTroncato') : '',
  ].filter(Boolean).join(' ');
}

function creaPannello() {
  legenda = legendaMappa('terremoti-sezione', t('terremoti.sez.titolo'), [legendaProfondita()]);
  controlli = costruisciPannello();
}

export const nodoMappa = () => controlli?.nodo ?? null;

export default {
  id: 'terremoti-sezione',
  titolo: 'Sezione verticale terremoti',
  gruppo: 'terremoti-gruppo',
  senzaIntestazione: true,
  sezione: 'Sezione verticale terremoti',
  sezioniFisse: true,
  argomento: { titolo: 'Sezione verticale terremoti', descrizione: 'I terremoti dell\'archivio INGV lungo una linea A–B, disegnati come profondità contro distanza: mostra i piani di subduzione e le faglie, come nell\'arco calabro.' },
  aggiungiSorgenti(map) {
    map.addSource(SRC, { type: 'geojson', data: VUOTO });
    map.addSource(SRC_EVENTI, { type: 'geojson', data: VUOTO, attribution: '<a href="https://terremoti.ingv.it/" target="_blank" rel="noopener">INGV</a>' });
  },
  aggiungiLayer(map) {
    mappa = map;
    interazione = creaInterazione(creaEvidenzaMappa(map));
    map.addLayer({ id: FASCIA, type: 'fill', source: SRC, filter: ['==', ['get', 'tipo'], 'fascia'], layout: { visibility: 'none' }, paint: { 'fill-color': '#0ea5e9', 'fill-opacity': 0.12, 'fill-outline-color': '#0369a1' } });
    map.addLayer({ id: LINEA, type: 'line', source: SRC, filter: ['==', ['get', 'tipo'], 'linea'], layout: { visibility: 'none', 'line-cap': 'round' }, paint: { 'line-color': '#0369a1', 'line-width': 2.5, 'line-dasharray': [2, 1.5] } });
    map.addLayer({
      id: PUNTI, type: 'circle', source: SRC_EVENTI, layout: { visibility: 'none', 'circle-sort-key': ['get', 'mag'] },
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, ['*', ['get', 'raggio'], 0.7], 10, ['*', ['get', 'raggio'], 1.6]], 'circle-color': coloreMappa, 'circle-opacity': 0.75, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 0.5 },
    });
    map.addLayer({
      id: ESTREMI, type: 'symbol', source: SRC, filter: ['==', ['get', 'tipo'], 'estremo'],
      layout: { visibility: 'none', 'text-field': ['get', 'nome'], 'text-font': ['Noto Sans Bold'], 'text-size': 14, 'text-allow-overlap': true },
      paint: { 'text-color': '#0369a1', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
    });
    registraTooltipStrati(map, [{
      layers: [PUNTI], icona: 'terremoto', sezione: 'Sezione verticale terremoti', colore: p => coloreProfondita(p.prof),
      modello: p => ({ titolo: `M ${numero(p.mag, 1)} · ${numero(p.prof)} km`, sottotitolo: p.luogo, elenco: [{ testo: p.ora }] }),
    }]);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && tracciando) controlli?.annulla(); });
  },
  strati: [{
    id: 'terremoti-sezione', etichetta: 'Sezione verticale (profondità)', layers: [FASCIA, LINEA, PUNTI, ESTREMI], attivo: false, legendaPannello: '.lg-terremoti-sezione',
    suCambio(attivo) {
      acceso = attivo;
      if (legenda) legenda.hidden = !attivo;
      document.dispatchEvent(new Event(EVENTO_TABELLA));
      if (!attivo) controlli?.annulla();
      else if (primaVolta && controlli) { primaVolta = false; controlli.predefinita(); } // la prima volta si vede subito la sezione dell'arco calabro
    },
  }],
  tabella: {
    id: 'terremoti-sezione',
    etichetta: t('tabella.layer.terremotiSezione'),
    fonte: t('tabella.fonte.ingvLocale'),
    licenza: 'CC BY 4.0',
    colonne: () => [
      ...colonneTabellaTerremoti({ anno: true }),
      { id: 'distanza', etichetta: t('tabella.col.distanza'), valore: p => p.x, testo: p => numero(p.x, 1), visibile: true, numerica: true },
      { id: 'trasversale', etichetta: t('tabella.col.trasversale'), valore: p => p.trasversale, testo: p => numero(p.trasversale, 1), visibile: false, numerica: true },
    ],
    righe: () => eventiTabella,
    attivo: () => acceso,
    apri: p => mappa?.flyTo({ center: [p.lon, p.lat], zoom: Math.max(mappa.getZoom(), 9) }),
  },
  pannello: creaPannello,
};
