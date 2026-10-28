import { tl, t, localeIntl } from '../core/i18n.js';
import { AREA_EVENTI, HIT_COMUNI, SRC_COMUNI, STRATO_COMUNI } from '../core/config.js';
import { filtroInsieme, voceFiltro } from '../core/legenda.js';
import { primo } from '../core/scheda-util.js';
import { FASCE, GIORNI_MAX, scaricaEventi, filtro, FILTRO_INIZIALE, profonditaDaFiltro, passaFiltro, espressioneFiltro, eventoDaIngv, modelloPopupTerremoto, voceTerremoto, voceSerie, voceAltri, riassuntoTerremoti, proprietaStorico, colonneTabellaTerremoti } from './scheda-terremoti.js';
import { voceComune } from './scheda-comune.js';
import { EVENTO_FILTRO, menuFiltro, menuMagnitudo, menuProfondita, elencoAltri, graficoSerie, testoGiorni, barraEventi } from './scheda-terremoti-dom.js';
import { pannelloFiltro } from './terremoti-pannello.js';
import { registraTooltipStrati } from '../core/tooltip.js';
import { clicSu } from '../core/scheda-navigazione.js';
import { coloreMagnitudo, espressioneColoreMagnitudo } from '../core/magnitudo.js';
import { aggiornaLegendaInMappa, creaClassiFiltro, EVENTO_TEMA_MAGNITUDO, temaMagnitudoAttivo } from '../core/tema-magnitudo.js';
import { creaPopupTerremoti, simboliRighe } from './terremoti-popup.js';
import { EVENTO_TABELLA } from '../core/tabella-dati.js';

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
let titolo = null; // intestazione della legenda: cambia col tema magnitudo
let bloccoFasce = null; // filtri per età (colore del cerchio): con il tema magnitudo non descrivono più la mappa
let classiFiltro = null; // classi di magnitudo della legenda, quando il tema è acceso
let inAreaScelta = null; // (proprietà) => bool, dalla ricerca per area; null = nessuna area che restringa
const inArea = p => !inAreaScelta || inAreaScelta(p);

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = tl(testo);
  return e;
}

function scriviNota(ok) {
  if (!nota) return;
  const r = riassuntoTerremoti(eventi.filter(p => passaFiltro(p) && inArea(p)));
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
  const dentro = inAreaScelta ? [['in', ['get', 'id'], ['literal', eventi.filter(inAreaScelta).map(p => p.id)]]] : [];
  const espr = ['all', espressioneFiltro(), ...(fasce ? [fasce] : []), ...dentro];
  for (const id of [PUNTI, HIT]) mappa?.getLayer(id) && mappa.setFilter(id, espr);
  classiFiltro?.sincronizza(); // le caselle seguono il filtro anche quando cambia da fuori (istogramma, «Azzera», ricerca)
  scriviNota(true);
  document.dispatchEvent(new Event(EVENTO_TABELLA));
}

const emetti = () => document.dispatchEvent(new Event(EVENTO_FILTRO));

// Tema magnitudo (overlay informativo): cerchi colorati per classe di magnitudo invece che per età e legenda con le
// classi al posto delle fasce. La legenda passa in mappa, al posto di quella dell'età, e resta il filtro delle classi;
// con il tema spento tornano i colori dell'età e la legenda se ne va dove la mette «Legende sulla mappa».
function applicaTema() {
  const tema = temaMagnitudoAttivo();
  if (mappa?.getLayer(PUNTI)) {
    const colore = tema ? espressioneColoreMagnitudo() : ['get', 'colore'];
    mappa.setPaintProperty(PUNTI, 'circle-color', colore);
    mappa.setPaintProperty(PUNTI, 'circle-stroke-color', colore);
  }
  if (!legenda) return;
  titolo.textContent = tema ? t('tema.magnitudo.titoloStrato', { nome: tl('Terremoti in tempo reale') }) : tl('Terremoti in tempo reale');
  bloccoFasce.hidden = tema;
  classiFiltro.nodo.hidden = !tema;
  if (tema) accendiTutteLeFasce(); // senza il comando in vista un filtro per età resterebbe invisibile
  classiFiltro.sincronizza();
  aggiornaLegendaInMappa();
}

// Con il tema magnitudo le fasce d'età non hanno più un comando in vista: tornano tutte accese.
function accendiTutteLeFasce() {
  if (fasceAccese.size >= FASCE.length) return;
  fasceAccese.clear();
  for (const f of FASCE) fasceAccese.add(f.colore);
  for (const casella of bloccoFasce.querySelectorAll('input[type=checkbox]')) casella.checked = true;
  applicaFiltro();
}

function creaLegenda() {
  legenda = el('div', 'legenda legenda-monumenti lg-terremoti');
  legenda.hidden = !acceso;
  titolo = el('strong', null, 'Terremoti in tempo reale');
  bloccoFasce = el('div', 'legenda-fasce');
  for (const f of FASCE) {
    const chip = el('i', 'incendi-campione');
    chip.style.background = f.colore;
    bloccoFasce.append(voceFiltro(chip, f.nome, acceso => {
      acceso ? fasceAccese.add(f.colore) : fasceAccese.delete(f.colore);
      applicaFiltro();
    }));
  }
  // tema magnitudo: al posto delle fasce d'età le classi di magnitudo, che filtrano la mappa come l'istogramma
  classiFiltro = creaClassiFiltro({ accese: () => filtro.classi, suCambio: insieme => { filtro.classi = insieme; emetti(); } });
  classiFiltro.nodo.append(el('p', 'legenda-magnitudo-nota', t('tema.magnitudo.filtro')));
  pannelloPf = pannelloFiltro(() => eventi);
  legenda.append(titolo, bloccoFasce, classiFiltro.nodo, pannelloPf.nodo, menuFiltro(), el('p', 'uffici-nota', t('terremoti.clicca')));
  nota = el('p', 'uffici-nota');
  const credito = el('p', 'uffici-nota');
  const link = el('a', null, 'INGV');
  link.href = 'https://terremoti.ingv.it/';
  link.target = '_blank';
  link.rel = 'noopener';
  credito.append(`${t('terremoti.dati')} `, link);
  legenda.append(nota, credito);
  document.getElementById('legende').append(legenda);
  applicaTema();
}

// Eventi che si vedono in mappa: filtri di periodo e magnitudo, più le fasce d'età accese in legenda
const visibili = () => eventi.filter(p => passaFiltro(p) && fasceAccese.has(p.colore) && inArea(p));

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

// Confini del comune nei tile già caricati (una parte per tile): servono a contare solo gli epicentri dentro il comune.
// Vuoto se la mappa non ha ancora i tile del comune: in quel caso la card non si apre.
function geometrieComune(proCom) {
  if (!mappa) return [];
  return mappa.querySourceFeatures(SRC_COMUNI, { sourceLayer: STRATO_COMUNI, filter: ['==', ['get', 'pro_com'], proCom] })
    .map(f => f?.geometry).filter(g => g?.coordinates);
}

// Card dei terremoti del comune cliccato (dalla ricerca non serve: la scheda si apre anche solo toccando il confine)
function voceDelComune(comune) {
  const p = comune.properties ?? {};
  const geometrie = geometrieComune(p.pro_com);
  if (!geometrie.length) return null;
  return voceComune({ cod: p.pro_com, nome: p.comune, geometrie }, { provincia: p.den_uts ?? '', regione: p.den_reg ?? '' });
}

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
      layers: [PUNTI], icona: 'terremoto', sezione: 'Terremoti', colore: p => (temaMagnitudoAttivo() ? coloreMagnitudo(p.mag) : p.colore),
      modello: p => {
        const m = modelloPopupTerremoto(p);
        const simbolo = simboliRighe(p);
        return { titolo: m.titolo, sottotitolo: tl(m.sottotitolo), elenco: m.righe.map(r => ({ testo: `${tl(r.etichetta)}: ${r.valore}`, ...simbolo[r.etichetta]?.() })) };
      },
    }]);
    map.on('mouseenter', PUNTI, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', PUNTI, () => { map.getCanvas().style.cursor = ''; });
    document.addEventListener(EVENTO_FILTRO, applicaFiltro);
    document.addEventListener(EVENTO_TEMA_MAGNITUDO, applicaTema);
    document.addEventListener('visibilitychange', () => {
      if (acceso && !document.hidden && Date.now() - ultimo > INTERVALLO_MS) aggiorna();
      pianifica();
    });
  },
  scheda: {
    // HIT: i cerchi degli eventi; HIT_COMUNI: il confine comunale sotto il clic (lo aggiunge js/core/ricerca.js)
    layers: [HIT, HIT_COMUNI],
    // prima l'evento cliccato (il più forte sotto il cerchio, in evidenza), poi tutti gli altri che passano il filtro, anche quelli sovrapposti;
    // senza un evento sotto il dito, la card dei terremoti del comune (se il clic è caduto su un comune)
    voci(trovati) {
      const voci = [];
      const primoEvento = evento(trovati.filter(f => f.layer.id === HIT));
      if (primoEvento) {
        voci.push(voceTerremoto(proprieta(primoEvento), Date.now(), () => barraEventi(primoEvento.properties.id, visibili, vaiAEvento)), voceSerie(() => graficoSerie(AREA, apriDaGrafico)), voceAltri(() => elencoAltri(() => eventi, new Set([primoEvento.properties.id]))));
        return voci;
      }
      const comune = primo(trovati, HIT_COMUNI);
      if (comune) {
        const voce = voceDelComune(comune);
        if (voce) voci.push(voce);
      }
      return voci;
    },
    // gli eventi stanno in mare e fuori dal Comune: il clic su un cerchio apre la scheda (solo a strato acceso: i dati si scaricano all'accensione)
    apertoFuoriComune(map, e) {
      return map.getLayoutProperty(PUNTI, 'visibility') !== 'none' && map.queryRenderedFeatures(e.point, { layers: [HIT] }).length > 0;
    },
  },
  legendaPannello: '.lg-terremoti',
  // Restringe gli eventi a un'area (funzione sulle proprietà dell'evento) o toglie la restrizione (null); restituisce gli eventi che restano in mappa
  impostaArea(fn) {
    inAreaScelta = fn;
    applicaFiltro();
    return visibili();
  },
  menuMagnitudo,
  menuProfondita,
  // Profondità scelta nel filtro condiviso, per i menu che la passano allo strato storico
  profonditaScelta: () => profonditaDaFiltro(filtro),
  // Riporta ai valori iniziali i filtri condivisi (pulsante «Azzera» accanto alla ricerca): periodo, magnitudo,
  // profondità, finestra e classi, più le fasce d'età della legenda; ferma anche la riproduzione della finestra.
  ripristinaFiltro() {
    Object.assign(filtro, FILTRO_INIZIALE);
    pannelloPf?.ferma();
    fasceAccese.clear();
    for (const f of FASCE) fasceAccese.add(f.colore);
    for (const casella of bloccoFasce?.querySelectorAll('input[type=checkbox]') ?? []) casella.checked = true;
    document.dispatchEvent(new CustomEvent(EVENTO_FILTRO));
  },
  avvia() { aggiorna(); pianifica(); },
  strati: [{
    id: 'terremoti', etichetta: 'Terremoti in tempo reale', layers: [PUNTI], attivo: true, legendaPannello: '.lg-terremoti',
    suCambio(attivo) {
      acceso = attivo;
      if (legenda) legenda.hidden = !attivo;
      if (attivo && Date.now() - ultimo > INTERVALLO_MS) aggiorna();
      if (!attivo) { popup.chiudi(); pannelloPf?.ferma(); }
      pianifica();
      aggiornaLegendaInMappa(); // con il tema acceso la legenda in mappa è una sola: può essere un'altra
      document.dispatchEvent(new Event(EVENTO_TABELLA));
    },
  }],
  tabella: {
    id: 'terremoti',
    etichetta: t('tabella.layer.terremoti'),
    fonte: t('tabella.fonte.ingvLocale'),
    licenza: 'CC BY 4.0',
    colonne: () => colonneTabellaTerremoti(),
    righe: () => visibili(),
    attivo: () => acceso,
    apri: p => vaiAEvento(p),
  },
  pannello: creaLegenda,
};
