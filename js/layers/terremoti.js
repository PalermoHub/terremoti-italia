import { tl, t, localeIntl } from '../core/i18n.js';
import { AREA_EVENTI } from '../core/config.js';
import { filtroInsieme, voceFiltro } from '../core/legenda.js';
import { FASCE, GIORNI_MAX, scaricaEventi, filtro, passaFiltro, espressioneFiltro, eventoDaIngv, modelloPopupTerremoto, voceTerremoto, voceSerie, voceAltri, riassuntoTerremoti, proprietaStorico } from './scheda-terremoti.js';
import { EVENTO_FILTRO, menuFiltro, elencoAltri, graficoSerie, testoGiorni, barraEventi } from './scheda-terremoti-dom.js';
import { pannelloFiltro } from './terremoti-pannello.js';
import { registraTooltipStrati } from '../core/tooltip.js';
import { clicSu } from '../core/scheda-navigazione.js';
import { creaPopupTerremoti, simboliRighe } from './terremoti-popup.js';

// Terremoti in tempo reale in Italia: gli eventi degli ultimi 30 giorni dal nostro archivio (GET /terremoti), che il server tiene allineato al servizio FDSN dell'INGV.
// Cerchio = un evento: più grande è la magnitudo, più grande il cerchio; il colore dice da quanto è successo. Si rinnova ogni 2 minuti finché lo strato è acceso.
const SRC = 'terremoti';
const PUNTI = 'terremoti-punti';
const HIT = 'terremoti-hit'; // cerchi trasparenti, sempre presenti: la scheda mostra l'evento sotto il clic
const MAGNITUDO_MIN = 1;
const AREA = AREA_EVENTI; // l'area che la mappa permette di vedere: l'Italia e i mari vicini
const INTERVALLO_MS = 2 * 60 * 1000;
const VUOTO = { type: 'FeatureCollection', features: [] };

let mappa = null;
let legenda = null;
let nota = null;
let timer = null;
let ultimo = 0;
let troncato = false; // l'archivio ha più eventi di quanti ne arrivino in mappa
let fallito = false; // l'ultimo aggiornamento non è riuscito: restano gli eventi di prima
let acceso = true; // lo strato parte acceso: il pannello lo spunta, ma non chiama suCambio al primo disegno
const popup = creaPopupTerremoti();
const fasceAccese = new Set(FASCE.map(f => f.colore)); // fasce d'età della legenda ancora in mappa
let eventi = []; // proprietà degli eventi in mappa
let pannelloPf = null;

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = tl(testo);
  return e;
}

function scriviNota(ok) {
  if (!nota) return;
  const r = riassuntoTerremoti(eventi.filter(p => passaFiltro(p)));
  if (!ok && !ultimo) { nota.textContent = t('terremoti.nonDisponibile'); return; }
  const ora = new Date(ultimo).toLocaleTimeString(localeIntl(), { hour: '2-digit', minute: '2-digit' });
  const base = r ? t('terremoti.riassunto', { giorni: testoGiorni(filtro.giorni), n: r.n, ora, mag: r.forte.mag.toLocaleString(localeIntl(), { minimumFractionDigits: 1 }), luogo: r.forte.luogo }) : t('terremoti.nessuno', { ora, giorni: testoGiorni(filtro.giorni) });
  nota.textContent = [base, fallito ? t('terremoti.aggiornamentoFallito', { ora }) : '', troncato ? t('terremoti.troncato', { n: eventi.length }) : ''].filter(Boolean).join(' ');
}

async function aggiorna() {
  try {
    const adesso = Date.now();
    const scarico = await scaricaEventi({ da: adesso - GIORNI_MAX * 86400000, a: adesso, magMin: MAGNITUDO_MIN, area: AREA });
    const features = scarico.eventi.map(f => eventoDaIngv(f, adesso)).filter(Boolean);
    eventi = features.map(f => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
    mappa?.getSource(SRC)?.setData({ type: 'FeatureCollection', features });
    ultimo = adesso;
    troncato = scarico.troncato;
    fallito = false;
    applicaFiltro(); // il periodo scorre con l'ora
    pannelloPf?.aggiorna();
    scriviNota(true);
  } catch { fallito = true; scriviNota(false); } // senza risposta restano gli eventi di prima
}

// Il ciclo gira solo con lo strato acceso e la scheda del browser in primo piano
function pianifica() {
  clearInterval(timer);
  timer = null;
  if (acceso && !document.hidden) timer = setInterval(aggiorna, INTERVALLO_MS);
}

// le voci della legenda sono filtri: il colore del cerchio è la fascia d'età
function applicaFiltro() {
  const fasce = filtroInsieme(['get', 'colore'], fasceAccese, FASCE.length);
  const espr = ['all', espressioneFiltro(), ...(fasce ? [fasce] : [])];
  for (const id of [PUNTI, HIT]) mappa?.getLayer(id) && mappa.setFilter(id, espr);
  scriviNota(true);
}

function creaLegenda() {
  legenda = el('div', 'legenda legenda-monumenti lg-terremoti');
  legenda.hidden = !acceso;
  legenda.append(el('strong', null, 'Terremoti in tempo reale'));
  for (const f of FASCE) {
    const chip = el('i', 'incendi-campione');
    chip.style.background = f.colore;
    legenda.append(voceFiltro(chip, f.nome, acceso => {
      acceso ? fasceAccese.add(f.colore) : fasceAccese.delete(f.colore);
      applicaFiltro();
    }));
  }
  pannelloPf = pannelloFiltro(() => eventi);
  legenda.append(pannelloPf.nodo, menuFiltro(), el('p', 'uffici-nota', t('terremoti.clicca')));
  nota = el('p', 'uffici-nota');
  const credito = el('p', 'uffici-nota');
  const link = el('a', null, 'INGV');
  link.href = 'https://terremoti.ingv.it/';
  link.target = '_blank';
  link.rel = 'noopener';
  credito.append(`${t('terremoti.dati')} `, link);
  legenda.append(nota, credito);
  document.getElementById('legende').append(legenda);
}

// Eventi che si vedono in mappa: filtri di periodo e magnitudo, più le fasce d'età accese in legenda
const visibili = () => eventi.filter(p => passaFiltro(p) && fasceAccese.has(p.colore));

// Le frecce della scheda scelgono l'evento da aprire: il clic simulato sul suo cerchio, dove ce ne sono di sovrapposti, non deve ripiegare sul più forte
const FINESTRA_SCELTA_MS = 1500;
let scelto = null;
const evento = trovati => {
  const attuale = scelto && Date.now() < scelto.fino ? trovati.find(f => f.properties.id === scelto.id) : null;
  return attuale ?? [...trovati].sort((a, b) => b.properties.mag - a.properties.mag)[0];
};
function vaiAEvento(p) {
  clicSu(mappa, [p.lon, p.lat], () => { scelto = { id: p.id, fino: Date.now() + FINESTRA_SCELTA_MS }; });
}

// Clic su uno stelo del grafico magnitudo-tempo: se l'evento è in mappa si apre la sua scheda, altrimenti (più vecchio del periodo scelto, o fuori dai filtri) la mappa va al punto e mostra un popup
function apriDaGrafico(e) {
  const p = proprietaStorico(e);
  if (!p || !mappa) return;
  const inMappa = acceso && visibili().find(v => v.id === p.id);
  if (inMappa) { vaiAEvento(inMappa); return; }
  popup.chiudi();
  mappa.once('moveend', () => popup.apri(mappa, p, mappa.project([p.lon, p.lat])));
  mappa.flyTo({ center: [p.lon, p.lat], zoom: Math.max(mappa.getZoom(), 9), duration: 700 });
}

const proprieta = f => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });

export default {
  id: 'terremoti',
  titolo: 'Terremoti in tempo reale',
  gruppo: 'eventi',
  sezione: 'Terremoti',
  sezioniFisse: true,
  argomento: { titolo: 'Terremoti in tempo reale', descrizione: 'I terremoti degli ultimi 30 giorni in Italia e nei mari vicini, dal servizio dell\'INGV: magnitudo, profondità e zona, aggiornati ogni 2 minuti.' },
  aggiungiSorgenti(map) {
    map.addSource(SRC, { type: 'geojson', data: VUOTO, attribution: '<a href="https://terremoti.ingv.it/" target="_blank" rel="noopener">INGV</a>' });
  },
  aggiungiLayer(map) {
    mappa = map;
    // i più recenti e i più forti sopra gli altri
    map.addLayer({
      id: PUNTI, type: 'circle', source: SRC, layout: { visibility: 'visible', 'circle-sort-key': ['+', ['*', ['get', 'mag'], 1000], ['/', ['get', 'ts'], 1e13]] },
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['*', ['get', 'raggio'], 0.8], 12, ['*', ['get', 'raggio'], 1.6]], 'circle-color': ['get', 'colore'], 'circle-opacity': 0.55, 'circle-stroke-color': ['get', 'colore'], 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.95 },
    });
    map.addLayer({ id: HIT, type: 'circle', source: SRC, paint: { 'circle-radius': ['max', 10, ['get', 'raggio']], 'circle-opacity': 0 } });
    map.on('click', e => {
      if (map.getLayoutProperty(PUNTI, 'visibility') === 'none') return;
      popup.chiudi();
      const f = evento(map.queryRenderedFeatures(e.point, { layers: [PUNTI] }));
      if (!f) return;
      popup.apri(map, proprieta(f), e.point);
    });
    registraTooltipStrati(map, [{
      layers: [PUNTI], icona: 'terremoto', sezione: 'Terremoti', colore: p => p.colore,
      modello: p => {
        const m = modelloPopupTerremoto(p);
        const simbolo = simboliRighe(p);
        return { titolo: m.titolo, sottotitolo: tl(m.sottotitolo), elenco: m.righe.map(r => ({ testo: `${tl(r.etichetta)}: ${r.valore}`, ...simbolo[r.etichetta]?.() })) };
      },
    }]);
    map.on('mouseenter', PUNTI, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', PUNTI, () => { map.getCanvas().style.cursor = ''; });
    document.addEventListener(EVENTO_FILTRO, applicaFiltro);
    document.addEventListener('visibilitychange', () => {
      if (acceso && !document.hidden && Date.now() - ultimo > INTERVALLO_MS) aggiorna();
      pianifica();
    });
  },
  scheda: {
    layers: [HIT],
    // prima l'evento cliccato (il più forte sotto il cerchio, in evidenza), poi tutti gli altri che passano il filtro, anche quelli sovrapposti
    voci(trovati) {
      const primo = evento(trovati.filter(f => f.layer.id === HIT));
      if (!primo) return [];
      return [voceTerremoto(proprieta(primo), Date.now(), () => barraEventi(primo.properties.id, visibili, vaiAEvento)), voceSerie(() => graficoSerie(AREA, apriDaGrafico)), voceAltri(() => elencoAltri(() => eventi, new Set([primo.properties.id])))];
    },
    // gli eventi stanno in mare e fuori dal Comune: il clic su un cerchio apre la scheda (solo a strato acceso: i dati si scaricano all'accensione)
    apertoFuoriComune(map, e) {
      return map.getLayoutProperty(PUNTI, 'visibility') !== 'none' && map.queryRenderedFeatures(e.point, { layers: [HIT] }).length > 0;
    },
  },
  legendaPannello: '.lg-terremoti',
  avvia() { aggiorna(); pianifica(); },
  strati: [{
    id: 'terremoti', etichetta: 'Terremoti in tempo reale', layers: [PUNTI], attivo: true, legendaPannello: '.lg-terremoti',
    suCambio(attivo) {
      acceso = attivo;
      if (legenda) legenda.hidden = !attivo;
      if (attivo && Date.now() - ultimo > INTERVALLO_MS) aggiorna();
      if (!attivo) { popup.chiudi(); pannelloPf?.ferma(); }
      pianifica();
    },
  }],
  pannello: creaLegenda,
};
