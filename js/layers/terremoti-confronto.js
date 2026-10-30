import { tl, t } from '../core/i18n.js';
import { AREA_EVENTI } from '../core/config.js';
import { scaricaEventiTutti, eventoDaIngv, modelloPopupTerremoto, voceTerremoto, voceSerie, voceAltri, filtro, colonneTabellaTerremoti, espressioneMagnitudo, passaMagnitudo } from './scheda-terremoti.js';
import { EVENTO_FILTRO, barraEventi, graficoSerie, elencoAltri } from './scheda-terremoti-dom.js';
import { pannelloConfronto } from './terremoti-archivio.js';
import { etichettaPeriodo } from './scheda-archivio.js';
import { creaPopupTerremoti, righeTooltip } from './terremoti-popup.js';
import { EVENTO_TABELLA } from '../core/tabella-dati.js';
import { creaEvidenzaMappa } from '../core/evidenza-eventi.js';
import { registraTooltipStrati } from '../core/tooltip.js';
import { clicSu } from '../core/scheda-navigazione.js';
import { creaFiltroTerritorio } from '../core/filtro-territorio.js';
import { espressioneClassiMagnitudo } from '../core/magnitudo.js';
import { espressioneClassiProfondita, passaFasce } from '../core/profondita.js';
import { aggiornaLegendaInMappa, espressioneColoreTema, EVENTO_TEMA_MAGNITUDO, temaAttivo, titoloTema } from '../core/tema-magnitudo.js';
import { legendaMagnitudo } from './legenda-magnitudo.js';

// Confronto tra due anni: gli eventi dei due anni insieme in mappa, a parte dai terremoti storici. Spento all'avvio; si accende dal pannello Strati.
// Anno A azzurro, anno B arancio: il colore dice a quale anno appartiene il cerchio, la grandezza la magnitudo. Non si aggiorna da solo.
const SRC = 'terremoti-confronto';
const PUNTI = 'terremoti-confronto-punti';
const ANNI = 'terremoti-confronto-anni'; // l'anno scritto accanto al cerchio
const HIT = 'terremoti-confronto-hit'; // cerchi trasparenti per il clic, sempre presenti
const GRIGLIA = 'terremoti-confronto-griglia'; // celle esagonali della differenza di densità tra i due anni
const GRIGLIA_FILL = 'terremoti-confronto-griglia-fill';
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
const popup = creaPopupTerremoti({ apriScheda: p => vaiAEvento(p) });
let titolo = null; // intestazione della legenda: cambia col tema magnitudo
let notaAnno = null; // con il tema il colore è la magnitudo: l'anno resta il bordo
let grigliaDati = null; // celle della differenza di densità, mostrate solo a strato acceso

const annoRoma = ts => Number(new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome', year: 'numeric' }));
const proprieta = f => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });

// Le frecce della scheda scelgono l'evento da aprire: dove i cerchi si sovrappongono il clic simulato non deve ripiegare sul più forte
const evento = trovati => {
  const attuale = scelto && Date.now() < scelto.fino ? trovati.find(f => f.properties.id === scelto.id) : null;
  return attuale ?? [...trovati].sort((a, b) => b.properties.mag - a.properties.mag)[0];
};
const vaiAEvento = p => clicSu(mappa, [p.lon, p.lat], () => { scelto = { id: p.id, fino: Date.now() + FINESTRA_SCELTA_MS }; });

const MASSIMO_MAPPA = 5000; // eventi disegnati; i conteggi del territorio usano anche quelli oltre il tetto

async function scaricaLato(lato, periodo, magMin, area, profondita = null) {
  // Gli eventi si leggono tutti (formato testo, senza il tetto della mappa): servono anche alla griglia di densità e ai conteggi
  // di un territorio. Il tetto di 5000 resta solo per i cerchi, così la mappa non si appesantisce.
  const riquadro = area ? { minlon: area.riquadro[0], minlat: area.riquadro[1], maxlon: area.riquadro[2], maxlat: area.riquadro[3] } : AREA;
  const scarico = await scaricaEventiTutti({ da: periodo.da, a: periodo.a, magMin, profMin: profondita?.min, profMax: profondita?.max, area: riquadro });
  const colore = lato === 'a' ? COLORE_A : COLORE_B;
  const nelTerritorio = scarico.eventi.map(f => eventoDaIngv(f, Infinity)).filter(Boolean).filter(f => !area || area.dentro({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
  const features = nelTerritorio.slice(0, MASSIMO_MAPPA).map(f => ({ ...f, properties: { ...f.properties, colore, lato, fascia: 'Confronto', anno: annoRoma(f.properties.ts) } }));
  return {
    features,
    troncato: scarico.troncato || nelTerritorio.length > features.length,
    incompleto: Boolean(scarico.troncato), // gli eventi stessi sono tagliati (non solo i cerchi in mappa)
    eventi: nelTerritorio.map(f => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] })),
  };
}

function aggiornaVisibilitaGriglia() {
  if (!mappa?.getLayer(GRIGLIA_FILL)) return;
  mappa.setLayoutProperty(GRIGLIA_FILL, 'visibility', acceso && grigliaDati?.features?.length ? 'visible' : 'none');
}

// Celle della differenza di densità (o null per toglierle): la visibilità segue lo strato e il suo interruttore
function mostraGriglia(dati) {
  grigliaDati = dati;
  mappa?.getSource(GRIGLIA)?.setData(dati ?? VUOTO);
  aggiornaVisibilitaGriglia();
}

// Mostra in mappa gli eventi dei due periodi con magnitudo ≥ magMin e profondità nell'intervallo scelto (dentro `area`, se c'è:
// lo stesso filtro per entrambi); risponde { a, b } con { n, troncato, eventi }, o null se nel frattempo è partita un'altra richiesta
async function carica(periodoA, periodoB, magMin, area = null, profondita = null) {
  const mia = ++richiesta;
  const [a, b] = await Promise.all([scaricaLato('a', periodoA, magMin, area, profondita), scaricaLato('b', periodoB, magMin, area, profondita)]);
  if (mia !== richiesta) return null;
  const features = [...a.features, ...b.features];
  eventi = features.map(proprieta);
  periodoMostrato = { da: Math.min(periodoA.da, periodoB.da), a: Math.max(periodoA.a, periodoB.a) };
  mappa?.getSource(SRC)?.setData({ type: 'FeatureCollection', features });
  document.dispatchEvent(new Event(EVENTO_TABELLA));
  popup.chiudi();
  chiave?.update(periodoA, periodoB);
  return { a: { n: a.features.length, troncato: a.troncato, incompleto: a.incompleto, eventi: a.eventi }, b: { n: b.features.length, troncato: b.troncato, incompleto: b.incompleto, eventi: b.eventi } };
}

// Chiave dei colori: quale anno è azzurro e quale arancio, e quanti eventi ha ciascuno
function creaChiave() {
  const nodo = document.createElement('div');
  nodo.className = 'terremoti-confronto-chiave';
  nodo.hidden = true;
  const pallini = [];
  const riga = (colore) => {
    const r = document.createElement('span');
    const pallino = document.createElement('i');
    pallino.style.background = colore;
    pallini.push({ pallino, colore });
    const testo = document.createElement('span');
    r.append(pallino, testo);
    nodo.append(r);
    return testo;
  };
  const testoA = riga(COLORE_A);
  const testoB = riga(COLORE_B);
  return {
    nodo,
    update(pa, pb) {
      const conta = lato => eventi.filter(e => e.lato === lato).length;
      testoA.textContent = `${etichettaPeriodo(pa)} · ${conta('a')}`;
      testoB.textContent = `${etichettaPeriodo(pb)} · ${conta('b')}`;
      nodo.hidden = false;
    },
    // Con il tema magnitudo il colore del cerchio è la magnitudo e l'anno resta il bordo: la chiave mostra anelli.
    stileTema(tema) {
      for (const { pallino, colore } of pallini) {
        pallino.style.background = tema ? 'transparent' : colore;
        pallino.style.border = tema ? `2px solid ${colore}` : '0';
        pallino.style.boxSizing = 'border-box';
      }
    },
  };
}

// Magnitudo minima e massima dello slider (più le classi del tema magnitudo) filtrano cerchi ed etichette dei due anni
// senza ripassare dal server: cambia quello che si vede, non gli eventi già scaricati.
function applicaFiltroMappa() {
  const espr = ['all', espressioneMagnitudo(), ...[espressioneClassiMagnitudo(filtro.classi), espressioneClassiProfondita(filtro.fasce)].filter(Boolean)];
  for (const id of [PUNTI, ANNI, HIT]) if (mappa?.getLayer(id)) mappa.setFilter(id, espr);
  document.dispatchEvent(new Event(EVENTO_TABELLA));
}

// Tema magnitudo: il colore del cerchio diventa la classe di magnitudo e l'anno resta il bordo (più spesso, per
// leggersi); le classi del blocco condiviso filtrano la mappa e la chiave degli anni diventa di anelli.
function applicaTema() {
  const tema = temaAttivo();
  if (mappa?.getLayer(PUNTI)) {
    mappa.setPaintProperty(PUNTI, 'circle-color', espressioneColoreTema() ?? ['get', 'colore']);
    mappa.setPaintProperty(PUNTI, 'circle-stroke-color', ['get', 'colore']);
    mappa.setPaintProperty(PUNTI, 'circle-stroke-width', tema ? 2.5 : 1.5);
  }
  applicaFiltroMappa();
  if (legenda) {
    titolo.textContent = titoloTema(t('terremoti.arc.titoloConfronto'));
    notaAnno.hidden = !tema;
    chiave?.stileTema(tema);
  }
  aggiornaLegendaInMappa();
}

function creaLegenda() {
  legendaMagnitudo(); // slider e classi della magnitudo: un blocco solo per tutti gli strati dei terremoti
  legenda = document.createElement('div');
  legenda.className = 'legenda legenda-monumenti lg-terremoti-confronto';
  legenda.hidden = !acceso;
  titolo = document.createElement('strong');
  titolo.textContent = t('terremoti.arc.titoloConfronto');
  pannello = pannelloConfronto({ carica, territorio: creaFiltroTerritorio(mappa), griglia: mostraGriglia, ...creaEvidenzaMappa(mappa) });
  chiave = creaChiave();
  notaAnno = document.createElement('p');
  notaAnno.className = 'legenda-magnitudo-nota';
  notaAnno.textContent = t('tema.magnitudo.bordoAnno');
  const credito = document.createElement('p');
  credito.className = 'uffici-nota';
  const link = Object.assign(document.createElement('a'), { textContent: 'INGV', href: 'https://terremoti.ingv.it/', target: '_blank', rel: 'noopener' });
  credito.append(`${t('terremoti.dati')} `, link);
  legenda.append(titolo, chiave.nodo, notaAnno, credito);
  document.getElementById('legende').append(legenda);
  applicaTema();
}

// Il modulo del pannello «Confronto» nel rail di destra: la scheda con i filtri e la tabella (creata con la legenda)
export const nodoConfronto = () => pannello?.nodo ?? null;

export default {
  id: 'terremoti-confronto',
  titolo: 'Confronto terremoti',
  gruppo: 'terremoti-gruppo',
  senzaIntestazione: true,
  sezione: 'Confronto terremoti',
  sezioniFisse: true,
  argomento: { titolo: 'Confronto terremoti', descrizione: 'I terremoti di due periodi a confronto, dall\'archivio locale dei dati INGV: gli eventi del periodo A e del periodo B insieme in mappa, in colori diversi, con la tabella delle differenze.' },
  aggiungiSorgenti(map) {
    map.addSource(SRC, { type: 'geojson', data: VUOTO, attribution: '<a href="https://terremoti.ingv.it/" target="_blank" rel="noopener">INGV</a>' });
    map.addSource(GRIGLIA, { type: 'geojson', data: VUOTO });
  },
  aggiungiLayer(map) {
    mappa = map;
    // Differenza di densità: sotto i cerchi, spenta finché il pannello non la chiede
    map.addLayer({
      id: GRIGLIA_FILL, type: 'fill', source: GRIGLIA, layout: { visibility: 'none' },
      paint: { 'fill-color': ['get', 'colore'], 'fill-opacity': ['get', 'opacita'], 'fill-outline-color': 'rgba(15, 23, 42, .18)' },
    });
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
        return { titolo: m.titolo, sottotitolo: tl(m.sottotitolo), badge: m.badge, elenco: righeTooltip(m, p) };
      },
    }]);
    map.on('mouseenter', PUNTI, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', PUNTI, () => { map.getCanvas().style.cursor = ''; });
    document.addEventListener(EVENTO_FILTRO, applicaFiltroMappa);
    document.addEventListener(EVENTO_TEMA_MAGNITUDO, applicaTema);
    applicaTema(); // il tema può essere già acceso da una sessione precedente
  },
  scheda: {
    layers: [HIT],
    voci(trovati) {
      const primo = evento(trovati.filter(f => f.layer.id === HIT));
      if (!primo) return [];
      const grafici = graficoSerie(AREA, p => { const trovato = eventi.find(v => v.id === String(p.id)); if (trovato) vaiAEvento(trovato); }, { sorgente: () => eventi, adesso: () => periodoMostrato?.a ?? Date.now(), periodo: () => periodoMostrato, ...creaEvidenzaMappa(mappa) });
      return [
        { ...voceTerremoto(proprieta(primo), Date.now(), () => barraEventi(primo.properties.id, () => eventi, vaiAEvento)), chiave: `terremoto-confronto-${primo.properties.id}` }, // nella scheda principale, con le altre sezioni del luogo: non nel pannello Storico
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
  statoCondiviso: () => (acceso ? pannello?.stato() ?? null : null),
  // Dal link condiviso: accende lo strato senza il confronto predefinito, poi carica quello scelto
  async impostaCondiviso(s) {
    const casella = document.querySelector('#strato-terremoti-confronto');
    if (casella && !casella.checked) { primaVolta = false; casella.checked = true; casella.dispatchEvent(new Event('change', { bubbles: true })); }
    await pannello?.imposta(s);
  },
  strati: [{
    id: 'terremoti-confronto', etichetta: 'Confronto terremoti (due periodi)', layers: [PUNTI, ANNI], attivo: false, legendaPannello: '.lg-terremoti-confronto',
    suCambio(attivo) {
      acceso = attivo;
      if (legenda) legenda.hidden = !attivo;
      if (!attivo) { popup.chiudi(); }
      else if (primaVolta && pannello) { primaVolta = false; pannello.confronta(); } // la prima volta si vede subito il confronto tra gli ultimi due anni
      aggiornaVisibilitaGriglia();
      aggiornaLegendaInMappa(); // con il tema acceso la legenda in mappa è una sola: può essere questa
      document.dispatchEvent(new Event(EVENTO_TABELLA));
    },
  }],
  tabella: {
    id: 'terremoti-confronto',
    etichetta: t('tabella.layer.terremotiConfronto'),
    fonte: t('tabella.fonte.ingvLocale'),
    licenza: 'CC BY 4.0',
    colonne: () => colonneTabellaTerremoti({ anno: true }),
    righe: () => eventi.filter(p => passaMagnitudo(p) && (!filtro.classi || filtro.classi.has(p.classeMag)) && passaFasce(p.prof, filtro.fasce)),
    attivo: () => acceso,
    apri: p => vaiAEvento(p),
  },
  pannello: creaLegenda,
};
