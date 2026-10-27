import { tl, t } from '../core/i18n.js';
import { AREA_EVENTI } from '../core/config.js';
import { scaricaEventi, scaricaEventiTutti, eventoDaIngv, modelloPopupTerremoto, voceTerremoto, voceSerie, voceAltri, filtro, profonditaDaFiltro, colonneTabellaTerremoti } from './scheda-terremoti.js';
import { EVENTO_FILTRO, barraEventi, graficoSerie, elencoAltri } from './scheda-terremoti-dom.js';
import { ANNO_INIZIO, periodoAnno } from './scheda-archivio.js';
import { pannelloArchivio } from './terremoti-archivio.js';
import { creaPopupTerremoti, simboliRighe } from './terremoti-popup.js';
import { EVENTO_TABELLA } from '../core/tabella-dati.js';
import { registraTooltipStrati } from '../core/tooltip.js';
import { clicSu } from '../core/scheda-navigazione.js';
import { espressioneClassiMagnitudo, espressioneColoreMagnitudo } from '../core/magnitudo.js';
import { aggiornaLegendaInMappa, creaClassiFiltro, EVENTO_TEMA_MAGNITUDO, temaMagnitudoAttivo } from '../core/tema-magnitudo.js';

// Terremoti storici: gli eventi di un anno qualsiasi dell'archivio (dal 1985), a parte dal tempo reale. Spento all'avvio; si accende dal pannello Strati.
// Cerchio = un evento, grande quanto la magnitudo; un solo colore (viola), perché l'età non dice niente su un anno intero. Non si aggiorna da solo.
const SRC = 'terremoti-storico';
const PUNTI = 'terremoti-storico-punti';
const ANNI = 'terremoti-storico-anni'; // l'anno scritto accanto al cerchio
const HIT = 'terremoti-storico-hit'; // cerchi trasparenti per il clic, sempre presenti
const COLORE = '#8b5cf6';
const AREA = AREA_EVENTI;
const VUOTO = { type: 'FeatureCollection', features: [] };
const FINESTRA_SCELTA_MS = 1500;

let mappa = null;
let legenda = null;
let acceso = false;
let periodoMostrato = null;
let eventi = []; // proprietà degli eventi in mappa
let primaVolta = true;
let pannello = null;
let inAreaScelta = null; // restrizione all'area scelta nella ricerca (funzione sulle proprietà), null = nessuna
let riquadroScelto = null; // riquadro [ovest, sud, est, nord] dell'area scelta, null = tutta Italia
let features = []; // tutti gli eventi dell'anno, prima della restrizione
let magMostrata = 2; // magnitudo minima dell'ultimo caricamento: serve a ricaricare quando cambia l'area
let profMostrata = null; // classe di profondità dell'ultimo caricamento: come la magnitudo
let annoRicerca = null; // anno scelto dalla ricerca: segue la magnitudo minima del filtro
let scelto = null; // evento scelto con le frecce della scheda
let richiesta = 0; // una risposta in ritardo di una richiesta precedente si scarta
const popup = creaPopupTerremoti();
let titolo = null; // intestazione della legenda: cambia col tema magnitudo
let classiFiltro = null; // classi di magnitudo della legenda, quando il tema è acceso

const annoRoma = ts => Number(new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome', year: 'numeric' }));
const proprieta = f => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });

// Le frecce della scheda scelgono l'evento da aprire: dove i cerchi si sovrappongono il clic simulato non deve ripiegare sul più forte
const evento = trovati => {
  const attuale = scelto && Date.now() < scelto.fino ? trovati.find(f => f.properties.id === scelto.id) : null;
  return attuale ?? [...trovati].sort((a, b) => b.properties.mag - a.properties.mag)[0];
};
const vaiAEvento = p => clicSu(mappa, [p.lon, p.lat], () => { scelto = { id: p.id, fino: Date.now() + FINESTRA_SCELTA_MS }; });

// Scrive in mappa gli eventi dell'anno, ristretti all'area scelta se c'è
function mostraEventi() {
  const visibili = inAreaScelta ? features.filter(f => inAreaScelta(proprieta(f))) : features;
  eventi = visibili.map(proprieta);
  mappa?.getSource(SRC)?.setData({ type: 'FeatureCollection', features: visibili });
  document.dispatchEvent(new Event(EVENTO_TABELLA));
}

// Mostra in mappa gli eventi del periodo con magnitudo ≥ magMin; risponde { n, troncato }, o null se nel frattempo è partita un'altra richiesta
async function carica(periodo, magMin, profondita = null) {
  const mia = ++richiesta;
  // Con un'area o una profondità scelta si chiedono tutti gli eventi del riquadro (formato testo, senza il tetto della mappa):
  // magnitudo e profondità valgono così allo stesso modo per tutta Italia e per una singola regione, provincia o comune.
  const area = riquadroScelto ? { minlon: riquadroScelto[0], minlat: riquadroScelto[1], maxlon: riquadroScelto[2], maxlat: riquadroScelto[3] } : AREA;
  const conTutti = Boolean(riquadroScelto) || profondita?.min != null;
  const scarico = conTutti
    ? await scaricaEventiTutti({ da: periodo.da, a: periodo.a, magMin, profMin: profondita?.min, profMax: profondita?.max, area })
    : await scaricaEventi({ da: periodo.da, a: periodo.a, magMin, area });
  if (mia !== richiesta) return null;
  features = scarico.eventi.map(f => eventoDaIngv(f, Infinity)).filter(Boolean).map(f => ({ ...f, properties: { ...f.properties, colore: COLORE, fascia: 'Archivio storico', anno: annoRoma(f.properties.ts) } }));
  periodoMostrato = periodo;
  magMostrata = magMin;
  profMostrata = profondita;
  mostraEventi();
  popup.chiudi();
  return { n: eventi.length, troncato: scarico.troncato };
}

// Le classi di magnitudo (tema magnitudo) filtrano cerchi ed etichette dell'anno senza ripassare dal server.
function applicaFiltroClassi() {
  const espr = espressioneClassiMagnitudo(filtro.classi);
  for (const id of [PUNTI, ANNI, HIT]) if (mappa?.getLayer(id)) mappa.setFilter(id, espr);
  document.dispatchEvent(new Event(EVENTO_TABELLA));
}

// Tema magnitudo: i cerchi prendono il colore della classe (invece del viola dell'archivio) e la legenda mostra le
// classi, che filtrano la mappa. Con il tema acceso la legenda sta in mappa se questo è il primo strato dei terremoti.
function applicaTema() {
  const tema = temaMagnitudoAttivo();
  if (mappa?.getLayer(PUNTI)) {
    const colore = tema ? espressioneColoreMagnitudo() : COLORE;
    mappa.setPaintProperty(PUNTI, 'circle-color', colore);
    mappa.setPaintProperty(PUNTI, 'circle-stroke-color', colore);
  }
  applicaFiltroClassi();
  if (legenda) {
    titolo.textContent = tema ? t('tema.magnitudo.titoloStrato', { nome: t('terremoti.arc.titoloStrato') }) : t('terremoti.arc.titoloStrato');
    classiFiltro.nodo.hidden = !tema;
    classiFiltro.sincronizza();
  }
  aggiornaLegendaInMappa();
}

function creaLegenda() {
  legenda = document.createElement('div');
  legenda.className = 'legenda legenda-monumenti lg-terremoti-storico';
  legenda.hidden = !acceso;
  titolo = document.createElement('strong');
  titolo.textContent = t('terremoti.arc.titoloStrato');
  classiFiltro = creaClassiFiltro({ accese: () => filtro.classi, suCambio: insieme => { filtro.classi = insieme; document.dispatchEvent(new Event(EVENTO_FILTRO)); } });
  const nota = document.createElement('p');
  nota.className = 'legenda-magnitudo-nota';
  nota.textContent = t('tema.magnitudo.filtro');
  classiFiltro.nodo.append(nota);
  pannello = pannelloArchivio({ carica });
  const credito = document.createElement('p');
  credito.className = 'uffici-nota';
  const link = Object.assign(document.createElement('a'), { textContent: 'INGV', href: 'https://terremoti.ingv.it/', target: '_blank', rel: 'noopener' });
  credito.append(`${t('terremoti.dati')} `, link);
  legenda.append(titolo, classiFiltro.nodo, pannello.nodo, credito);
  document.getElementById('legende').append(legenda);
  applicaTema();
}

export default {
  id: 'terremoti-storico',
  titolo: 'Terremoti storici',
  gruppo: 'eventi',
  sezione: 'Terremoti storici',
  sezioniFisse: true,
  argomento: { titolo: 'Terremoti storici', descrizione: 'I terremoti di un anno qualsiasi dal 1985, dall\'archivio locale dei dati INGV: scegli l\'anno e la magnitudo minima, oppure confronta due anni.' },
  aggiungiSorgenti(map) {
    map.addSource(SRC, { type: 'geojson', data: VUOTO, attribution: '<a href="https://terremoti.ingv.it/" target="_blank" rel="noopener">INGV</a>' });
  },
  aggiungiLayer(map) {
    mappa = map;
    // Il filtro condiviso cambia anche per le classi di magnitudo, che si applicano in mappa senza ricaricare: si torna
    // al server solo se cambiano la magnitudo minima o la profondità.
    document.addEventListener(EVENTO_FILTRO, () => {
      if (annoRicerca == null || !acceso) return;
      const mag = Math.max(filtro.magMin, 2), prof = profonditaDaFiltro();
      if (mag === magMostrata && JSON.stringify(prof) === JSON.stringify(profMostrata)) return;
      carica(periodoAnno(annoRicerca), mag, prof);
    });
    document.addEventListener(EVENTO_FILTRO, applicaFiltroClassi);
    document.addEventListener(EVENTO_TEMA_MAGNITUDO, applicaTema);
    // i più forti sopra gli altri; spento all'avvio (visibilità esplicita: i moduli del nucleo la leggono)
    map.addLayer({
      id: PUNTI, type: 'circle', source: SRC, layout: { visibility: 'none', 'circle-sort-key': ['get', 'mag'] },
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['*', ['get', 'raggio'], 0.8], 12, ['*', ['get', 'raggio'], 1.6]], 'circle-color': COLORE, 'circle-opacity': 0.5, 'circle-stroke-color': COLORE, 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.95 },
    });
    map.addLayer({
      id: ANNI, type: 'symbol', source: SRC, minzoom: 7, layout: { visibility: 'none', 'text-field': ['to-string', ['get', 'anno']], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.9], 'text-allow-overlap': false, 'symbol-sort-key': ['-', 0, ['get', 'mag']] },
      paint: { 'text-color': '#5b21b6', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    });
    map.addLayer({ id: HIT, type: 'circle', source: SRC, paint: { 'circle-radius': ['max', 10, ['get', 'raggio']], 'circle-opacity': 0 } });
    map.on('click', e => {
      if (map.getLayoutProperty(PUNTI, 'visibility') === 'none') return;
      const f = evento(map.queryRenderedFeatures(e.point, { layers: [PUNTI] }));
      if (f) popup.apri(map, proprieta(f), e.point);
    });
    registraTooltipStrati(map, [{
      layers: [PUNTI], icona: 'terremoto', sezione: 'Terremoti storici', colore: p => p.colore,
      modello: p => {
        const m = modelloPopupTerremoto(p);
        const simbolo = simboliRighe(p);
        return { titolo: m.titolo, sottotitolo: tl(m.sottotitolo), badge: m.badge, elenco: m.righe.map(r => ({ testo: `${tl(r.etichetta)}: ${r.valore}`, ...simbolo[r.etichetta]?.() })) };
      },
    }]);
    map.on('mouseenter', PUNTI, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', PUNTI, () => { map.getCanvas().style.cursor = ''; });
    applicaTema(); // il tema può essere già acceso da una sessione precedente
  },
  scheda: {
    layers: [HIT],
    voci(trovati) {
      const primo = evento(trovati.filter(f => f.layer.id === HIT));
      if (!primo) return [];
      const grafici = graficoSerie(AREA, p => { const trovato = eventi.find(v => v.id === String(p.id)); if (trovato) vaiAEvento(trovato); }, { sorgente: () => eventi, adesso: () => periodoMostrato?.a ?? Date.now() });
      return [
        voceTerremoto(proprieta(primo), Date.now(), () => barraEventi(primo.properties.id, () => eventi, vaiAEvento), true),
        { ...voceSerie(() => grafici), chiave: 'terremoto-storico-serie' },
        { ...voceAltri(() => elencoAltri(() => eventi, new Set([primo.properties.id]))), chiave: 'terremoto-storico-altri' },
      ];
    },
    // il clic su un cerchio apre la scheda solo a strato acceso
    apertoFuoriComune(map, e) {
      return map.getLayoutProperty(PUNTI, 'visibility') !== 'none' && map.queryRenderedFeatures(e.point, { layers: [HIT] }).length > 0;
    },
  },
  legendaPannello: '.lg-terremoti-storico',
  // Dalla ricerca: accende lo strato (se spento) e mostra l'anno scelto con magnitudo ≥ magMin; anno null spegne lo strato
  // Restringe gli eventi dell'anno a un'area (funzione sulle proprietà dell'evento) o toglie la restrizione (null)
  impostaArea(fn, riquadro = null) {
    const cambiata = Boolean(riquadro) !== Boolean(riquadroScelto) || (riquadro && riquadroScelto && riquadro.join() !== riquadroScelto.join());
    inAreaScelta = fn;
    riquadroScelto = riquadro;
    // l'area nuova va caricata dal server: i dati di prima erano ristretti a tutta Italia (o a un'altra area)
    if (cambiata && periodoMostrato) { carica(periodoMostrato, magMostrata, profMostrata).catch(() => {}); return; }
    mostraEventi();
  },
  anni: () => Array.from({ length: new Date().getUTCFullYear() - ANNO_INIZIO + 1 }, (_, i) => new Date().getUTCFullYear() - i),
  async mostraAnno(anno, magMin = filtro.magMin, profondita = null) {
    annoRicerca = anno;
    const casella = document.querySelector('#strato-terremoti-storico');
    if (casella && casella.checked !== (anno != null)) { primaVolta = false; casella.checked = anno != null; casella.dispatchEvent(new Event('change', { bubbles: true })); }
    if (anno == null) {
      // torna al tempo reale: svuota lo strato, così riaccendendolo non mostra l'anno lasciato prima
      richiesta++;
      features = [];
      eventi = [];
      periodoMostrato = null;
      popup.chiudi();
      mappa?.getSource(SRC)?.setData(VUOTO);
      document.dispatchEvent(new Event(EVENTO_TABELLA));
      return null;
    }
    return carica(periodoAnno(anno), Math.max(magMin, 2), profondita);
  },
  strati: [{
    id: 'terremoti-storico', etichetta: 'Terremoti storici (archivio)', layers: [PUNTI, ANNI], attivo: false, legendaPannello: '.lg-terremoti-storico',
    suCambio(attivo) {
      acceso = attivo;
      if (legenda) legenda.hidden = !attivo;
      if (!attivo) { popup.chiudi(); }
      else if (primaVolta && pannello) { primaVolta = false; pannello.mostra(); } // la prima volta si vede subito l'anno scorso
      aggiornaLegendaInMappa(); // con il tema acceso la legenda in mappa è una sola: può essere questa
      document.dispatchEvent(new Event(EVENTO_TABELLA));
    },
  }],
  tabella: {
    id: 'terremoti-storico',
    etichetta: t('tabella.layer.terremotiStorico'),
    fonte: t('tabella.fonte.ingvLocale'),
    licenza: 'CC BY 4.0',
    colonne: () => colonneTabellaTerremoti({ anno: true }),
    righe: () => eventi.filter(p => !filtro.classi || filtro.classi.has(p.classeMag)),
    attivo: () => acceso,
    apri: p => vaiAEvento(p),
  },
  pannello: creaLegenda,
};
