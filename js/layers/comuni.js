import { SRC_COMUNI, STRATO_COMUNI, sorgenteComuni } from '../core/config.js';
import { disegnaVoceTooltip, registraTooltip } from '../core/tooltip.js';
import { localeIntl, t } from '../core/i18n.js';
import { iconaAttesa } from '../core/scheda-util.js';
import { ANNO_INIZIO } from './scheda-archivio.js';
import { totaleComune } from './scheda-comune.js';

// Confini comunali d'Italia come linee: strato spento all'avvio, si accende dal pannello Strati (sezione «Territorio»).
// Con lo strato acceso il passaggio del mouse evidenzia il comune sotto il cursore, dice nome, provincia, regione, codice ISTAT
// e quanti terremoti ha avuto dal 1985; un clic apre la scheda dei terremoti del comune (js/layers/scheda-comune.js).
// Le stesse cose valgono sull'area scelta nella ricerca (regione, provincia o comune), anche a strato spento.
const BORDO = 'comuni-bordo';
const HIT = 'comuni-hit'; // riempimento trasparente su tutti i comuni: tooltip ed evidenza a strato acceso
const HIT_RICERCA = 'comuni-hit-ricerca'; // stesso riempimento, ristretto all'area scelta nella ricerca (lo accende js/core/ricerca.js)
const STRATI_HIT = [HIT, HIT_RICERCA];
const VELATURA = 'comuni-evidenza-velatura';
const EVIDENZA = 'comuni-evidenza';
const COLORE = '#c27c0e';
const NESSUNO = ['==', ['get', 'pro_com'], -1]; // nessun comune: l'evidenza è vuota
const MAX_CACHE = 300; // totali tenuti in memoria: più dei comuni che si guardano in una sessione

let mappa = null;
let evidenziato = null;
const totali = new Map(); // pro_com → eventi dal 1985 (solo i comuni che hanno risposto)
const tentativi = new Map(); // pro_com → { ora, esito } dell'ultimo giro andato a vuoto (vedi RIPROVA_MS)
const inCorso = new Set();
let ultimoProCom = null; // per aggiornare la casella già a video quando il conteggio arriva
let ultimoNodo = null;

// Evidenzia il comune `proCom` (null = nessuno). Il filtro si cambia solo quando il comune sotto il cursore cambia davvero.
function evidenzia(proCom) {
  const nuovo = proCom ?? null;
  if (!mappa || nuovo === evidenziato) return;
  evidenziato = nuovo;
  const filtro = nuovo == null ? NESSUNO : ['==', ['get', 'pro_com'], nuovo];
  for (const id of [VELATURA, EVIDENZA]) if (mappa.getLayer(id)) mappa.setFilter(id, filtro);
}

// Riga del tooltip con il totale degli eventi: «Eventi dal 1985: 1.537»; finché il conteggio non arriva resta la sola
// etichetta con l'iconcina che gira; «non disponibili» se l'archivio non risponde.
export function testoEventi(totale) {
  if (totale === undefined) return t('comuni.tooltip.eventiAttesa', { anno: ANNO_INIZIO });
  if (totale === null) return t('comuni.tooltip.eventiErrore', { anno: ANNO_INIZIO });
  return t('comuni.tooltip.eventi', { anno: ANNO_INIZIO, n: totale.toLocaleString(localeIntl()) });
}

// Iconcina che gira mentre si contano gli eventi: sempre lo stesso elemento, perché il tooltip viene ridisegnato a ogni
// movimento del mouse e un elemento nuovo farebbe ripartire l'animazione da capo (sembrerebbe ferma).
let gira = null;
const iconaCaricamento = () => (gira ??= iconaAttesa('comuni-gira'));

// Modello del tooltip del comune: nome, «provincia · regione», eventi dal 1985, codice ISTAT e l'invito al clic
export function modelloComune(p, totale) {
  if (!p?.comune) return null;
  return {
    sezione: 'Comuni', icona: 'confini', colore: COLORE,
    titolo: p.comune,
    sottotitolo: [p.den_uts, p.den_reg].filter(Boolean).join(' · '),
    elenco: [{ testo: testoEventi(totale) }, ...(p.pro_com ? [{ testo: t('comuni.tooltip.codice', { codice: p.pro_com }) }] : [])],
    suggerimento: t('comuni.tooltip.clicca'),
  };
}

// Confini del comune nei tile già caricati (una parte per tile)
function geometrieDi(proCom) {
  if (!mappa) return [];
  return mappa.querySourceFeatures(SRC_COMUNI, { sourceLayer: STRATO_COMUNI, filter: ['==', ['get', 'pro_com'], proCom] })
    .map(f => f?.geometry).filter(g => g?.coordinates);
}

// Quanto aspettare prima di riprovare un conteggio andato a vuoto: poco se le geometrie non erano ancora nei tile (capita
// appena la mappa si muove), molto se non risponde l'archivio — senza server la prima richiesta scarica i file per anno e
// non va ripetuta a ogni passaggio del mouse. Così un errore passeggero non lascia «non disponibili» per tutta la sessione.
const RIPROVA_MS = { vuoto: 800, errore: 60000 };

function inAttesa(proCom) {
  const t = tentativi.get(proCom);
  return t != null && Date.now() - t.ora < RIPROVA_MS[t.esito];
}

function segnaTentativo(proCom, esito) {
  tentativi.delete(proCom); // in fondo resta l'ultimo tentativo
  tentativi.set(proCom, { ora: Date.now(), esito });
  if (tentativi.size > MAX_CACHE) tentativi.delete(tentativi.keys().next().value);
}

// Conteggio in secondo piano (una richiesta per comune, poi in memoria); appena arriva si aggiorna la casella già a video
function caricaTotale(proCom) {
  if (inCorso.has(proCom) || inAttesa(proCom)) return;
  const geometrie = geometrieDi(proCom);
  if (!geometrie.length) { segnaTentativo(proCom, 'vuoto'); return; } // tile non ancora caricati: si riprova tra poco
  inCorso.add(proCom);
  totaleComune({ geometrie })
    .catch(() => null)
    .then(n => {
      inCorso.delete(proCom);
      if (n == null) segnaTentativo(proCom, 'errore');
      else {
        totali.set(proCom, n);
        tentativi.delete(proCom);
        if (totali.size > MAX_CACHE) totali.delete(totali.keys().next().value);
      }
      const riga = ultimoProCom === proCom && ultimoNodo?.isConnected ? ultimoNodo.querySelector('[data-eventi]') : null;
      if (riga) riga.textContent = testoEventi(n);
    });
}

const visibile = id => Boolean(mappa?.getLayer(id)) && mappa.getLayoutProperty(id, 'visibility') === 'visible';

// Contenuto del tooltip: il comune sotto il cursore, dai riempimenti accesi (strato o area della ricerca)
function fornitore(e) {
  if (!mappa) return null;
  const attivi = STRATI_HIT.filter(visibile);
  if (!attivi.length) return null;
  const riquadro = [[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]];
  const f = mappa.queryRenderedFeatures(riquadro, { layers: attivi })[0];
  if (!f) return null;
  const p = f.properties ?? {};
  const proCom = p.pro_com;
  const noto = totali.has(proCom);
  if (!noto) caricaTotale(proCom);
  // mentre si conta gira l'iconcina; se il giro è andato a vuoto «non disponibili», e si riprova dopo RIPROVA_MS
  const fallito = !noto && tentativi.get(proCom)?.esito === 'errore' && inAttesa(proCom);
  const m = modelloComune(p, noto ? totali.get(proCom) : fallito ? null : undefined);
  if (!m) return null;
  ultimoProCom = proCom;
  ultimoNodo = disegnaVoceTooltip(m);
  const riga = ultimoNodo.querySelector('.tooltip-elenco > div'); // la riga da aggiornare quando il conteggio arriva
  if (riga) {
    riga.setAttribute('data-eventi', '');
    if (!noto && !fallito) riga.append(iconaCaricamento()); // conteggio in corso: l'iconcina gira al posto dei puntini
  }
  return { contenuto: ultimoNodo, colore: COLORE };
}

export default {
  id: 'comuni',
  titolo: 'Territorio',
  sezioneAperta: true, // nel pannello Strati la sezione si apre da sola la prima volta: lo strato si vede subito
  argomento: { titolo: 'Confini comunali', descrizione: 'I confini dei comuni d\'Italia sopra la base cartografica: passando il mouse su un comune se ne leggono nome, provincia e regione, e un clic apre la scheda dei suoi terremoti.' },
  aggiungiSorgenti(map) {
    // la sorgente serve anche alla ricerca per area: la crea il modulo che passa per primo
    if (!map.getSource(SRC_COMUNI)) map.addSource(SRC_COMUNI, sorgenteComuni());
  },
  aggiungiLayer(map) {
    mappa = map;
    map.addLayer({
      id: BORDO, type: 'line', source: SRC_COMUNI, 'source-layer': STRATO_COMUNI,
      layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': COLORE,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.25, 7, 0.6, 10, 1.2, 14, 2.2],
        // a scala nazionale i comuni sono migliaia: i confini restano una trama leggera e si fanno netti avvicinandosi
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.16, 7, 0.34, 10, 0.55, 13, 0.7],
      },
    });
    map.addLayer({ id: HIT, type: 'fill', source: SRC_COMUNI, 'source-layer': STRATO_COMUNI, layout: { visibility: 'none' }, paint: { 'fill-opacity': 0 } });
    // la ricerca lo accende con il filtro dell'area scelta: tooltip ed evidenza anche a strato spento
    map.addLayer({ id: HIT_RICERCA, type: 'fill', source: SRC_COMUNI, 'source-layer': STRATO_COMUNI, filter: NESSUNO, layout: { visibility: 'none' }, paint: { 'fill-opacity': 0 } });
    // il comune sotto il cursore: prima la velatura, poi il bordo marcato sopra a tutto
    map.addLayer({ id: VELATURA, type: 'fill', source: SRC_COMUNI, 'source-layer': STRATO_COMUNI, filter: NESSUNO, paint: { 'fill-color': '#f5a623', 'fill-opacity': 0.14 } });
    map.addLayer({ id: EVIDENZA, type: 'line', source: SRC_COMUNI, 'source-layer': STRATO_COMUNI, filter: NESSUNO, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': COLORE, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.4, 8, 2.4, 14, 3.4], 'line-opacity': 1 } });

    registraTooltip(map, fornitore, 3);
    for (const id of STRATI_HIT) {
      map.on('mousemove', id, e => { if (e.features?.length) evidenzia(e.features[0].properties.pro_com); });
      map.on('mouseleave', id, () => evidenzia(null));
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    }
    map.on('movestart', () => evidenzia(null)); // la mappa scorre sotto il cursore: il comune evidenziato non vale più
  },
  // Dalla ricerca: il riempimento invisibile si restringe all'area scelta (`filtro` = espressione MapLibre, null = nessuna area).
  // Così tooltip ed evidenza funzionano anche con lo strato spento, ma solo dentro l'area cercata.
  impostaRicerca(filtro) {
    if (!mappa?.getLayer(HIT_RICERCA)) return;
    mappa.setFilter(HIT_RICERCA, filtro ?? NESSUNO);
    mappa.setLayoutProperty(HIT_RICERCA, 'visibility', filtro ? 'visible' : 'none');
    evidenzia(null);
  },
  strati: [{
    id: 'comuni', etichetta: 'Confini comunali', layers: [BORDO], attivo: false,
    // il riempimento e l'evidenza seguono il bordo: a strato spento non c'è nessun comune da indicare
    suCambio(attivo, map) {
      if (map.getLayer(HIT)) map.setLayoutProperty(HIT, 'visibility', attivo ? 'visible' : 'none');
      if (!attivo) { evidenzia(null); ultimoProCom = null; ultimoNodo = null; }
    },
  }],
};
