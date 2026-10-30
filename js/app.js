import { creaMappa } from './core/mappa.js';
import { costruisciPannello, disattivaStrato, segnala } from './core/pannello.js';
import { collegaScheda } from './core/scheda.js';
import { collegaPaddingMappa } from './core/padding-mappa.js';
import { collegaTooltipScheda } from './core/tooltip-scheda.js';
import { collegaRail } from './core/rail.js';
import { collegaStorico } from './core/scheda-storico.js';
import { collegaStrumenti } from './core/strumenti.js';
import { collegaTabellaDati } from './core/tabella-dati.js';
import { collegaInfo } from './core/info.js';
import { collegaStampa } from './core/stampa.js';
import { collegaRicerca } from './core/ricerca.js';
import { creaDifferiti } from './core/differiti.js';
import { creaAvvisoAttesa } from './core/avviso-attesa.js';
import { collegaTabMobile } from './core/tab-mobile.js';
import { traduciModuli } from './core/traduci-moduli.js';
import { collegaShakeMap } from './core/shakemap-mappa.js';
import { caricaLiveZoom, collegaLiveZoom, creaInterruttoreLegenda as interruttoreLiveZoomLegenda } from './core/live-zoom.js';
import { creaRegolatoreRaggio, raggioAttivo, EVENTO_RAGGIO } from './core/raggio-vicini.js';
import { EVENTO_FILTRO, menuFiltro } from './layers/scheda-terremoti-dom.js';
import { collegaMinimappa } from './core/minimappa.js';
import { caricaTemaMagnitudo } from './core/tema-magnitudo.js';
import { t } from './core/i18n.js';
import { collegaCondividi, applicaStatoDaUrl, tieniAggiornatoIndirizzo } from './core/condividi.js';
import protezioneCivile from './layers/protezione-civile.js';
import terremotiGruppo from './layers/terremoti-gruppo.js';
import faglieGruppo from './layers/faglie-gruppo.js';
import placcheGruppo from './layers/placche-gruppo.js';
import geologiaGruppo from './layers/geologia-gruppo.js';
import territorio from './layers/territorio.js';
import comuni from './layers/comuni.js';
import allerte from './layers/allerte.js';
import terremoti from './layers/terremoti.js';
import terremotiStorico from './layers/terremoti-storico.js';
import terremotiConfronto, { nodoConfronto } from './layers/terremoti-confronto.js';
import terremotiSezione, { nodoMappa as nodoSezione } from './layers/terremoti-sezione.js';
import terremotiProfondita, { nodoMappa as nodoProfondita } from './layers/terremoti-profondita.js';
import terremotiDensita, { nodoMappa as nodoDensita } from './layers/terremoti-densita.js';
import terremotiCoropletica, { nodoMappa as nodoCoropletica } from './layers/terremoti-coropletica.js';
import { collegaMappe } from './core/pannello-mappe.js';
import faglie from './layers/faglie.js';
import faglieEgdi from './layers/faglie-egdi.js';
import diss from './layers/diss.js';
import placcheMargini from './layers/placche-margini.js';
import placcheStrutture from './layers/placche-strutture.js';
import geologia from './layers/geologia.js';
import pericolosita from './layers/pericolosita.js';
import classificazione from './layers/classificazione.js';
import { collegaConfronto, apriConfronto } from './core/scheda-confronto.js';
import base from './layers/base.js';

// telefono: barra di tab e foglio degli strati; la legenda si può ridurre
const tab = collegaTabMobile(document, { barraTitolo: document.querySelector('#barra-strati .barra-titolo') });
document.getElementById('corpo').append(tab.barra);
document.getElementById('chiudi-strati').addEventListener('click', () => tab.imposta(null));
caricaLiveZoom(localStorage);
caricaTemaMagnitudo(localStorage);
// riquadro in fondo alla legenda in mappa: Live Zoom e «Cerca eventi attorno a un punto» (si nasconde con la legenda ridotta)
// cambiando un filtro con la ricerca accesa, la scheda aperta rifà la lista sullo stesso punto
const filtriRaggio = () => {
  document.addEventListener(EVENTO_FILTRO, () => { if (raggioAttivo()) document.dispatchEvent(new Event(EVENTO_RAGGIO)); });
  return menuFiltro();
};
document.getElementById('legende-raggio').append(interruttoreLiveZoomLegenda(localStorage), creaRegolatoreRaggio(localStorage, { filtri: filtriRaggio }));
const riduciLegenda = document.getElementById('legende-riduci');
const mostraLegendaRidotta = ridotta => {
  document.getElementById('legende-box').classList.toggle('ridotta', ridotta);
  riduciLegenda.setAttribute('aria-expanded', String(!ridotta));
  riduciLegenda.textContent = ridotta ? t('app.legenda.apri') : t('html.legende.riduci');
};
riduciLegenda.addEventListener('click', () => mostraLegendaRidotta(!document.getElementById('legende-box').classList.contains('ridotta')));
// sul telefono la legenda aperta copre quasi tutta la mappa: parte ridotta, un tocco la apre
if (matchMedia('(max-width: 720px)').matches) mostraLegendaRidotta(true);

// ordine = ordine di sovrapposizione dei layer (il primo sta sotto). I quattro gruppi precedono i moduli che mettono lì i
// loro strati: Protezione Civile (allerte), Terremoti (tempo reale, archivio, confronto), Faglie (ITHACA, EGDI, DISS), Territorio (confini)
const MODULI = [base, protezioneCivile, terremotiGruppo, faglieGruppo, placcheGruppo, geologiaGruppo, territorio, pericolosita, classificazione, comuni, allerte, terremoti, terremotiStorico, terremotiConfronto, terremotiSezione, terremotiProfondita, terremotiDensita, terremotiCoropletica, faglie, faglieEgdi, diss, placcheMargini, placcheStrutture, geologia];
traduciModuli(MODULI);

const map = creaMappa('mappa', () => segnala(t('app.basemap.errore')));
collegaLiveZoom(map);
collegaShakeMap(map);
const minimappa = collegaMinimappa(map);
collegaPaddingMappa(map);
const attesaDati = creaAvvisoAttesa(document.getElementById('avvisi'), t('avviso.attesaCaricamento'));
const differiti = creaDifferiti(map, { segnala, suAttesa: p => attesaDati.durante(p) });
window.dt = { map, minimappa, moduli: Object.fromEntries(MODULI.map(m => [m.id, m])), pronto: false, differiti: () => Promise.resolve() };

// Un errore su una sorgente disattiva solo gli strati che la usano e li nomina nell'avviso
const STRATI = MODULI.flatMap(m => m.strati);
map.on('error', e => {
  if (!e.sourceId || e.error?.name === 'AbortError') return;
  const colpiti = STRATI.filter(s => s.layers.some(id => map.getLayer(id)?.source === e.sourceId));
  if (!colpiti.length) return segnala(t('avviso.stratoNonCaricato.dettaglio', { nome: e.sourceId }));
  segnala(t('avviso.stratoNonCaricato.dettaglio', { nome: colpiti.map(s => s.etichetta).join(', ') }));
  colpiti.forEach(s => disattivaStrato(map, s));
});

// Gli strati si aggiungono appena lo stile è pronto, senza aspettare i tile della base
map.once('style.load', async () => {
  for (const m of MODULI) m.aggiungiSorgenti(map);
  for (const m of MODULI) m.aggiungiLayer(map);
  costruisciPannello(map, MODULI, document.getElementById('pannello'), document.getElementById('barra-gruppi'));
  collegaTooltipScheda(map, MODULI);
  collegaScheda(map, MODULI, document.getElementById('scheda'), {});
  const storico = collegaStorico(document.getElementById('storico-pannello'));
  const confrontoPannello = document.getElementById('confronto-pannello');
  collegaConfronto(confrontoPannello, nodoConfronto());
  const mappePannello = document.getElementById('mappe-pannello');
  const mappe = collegaMappe(mappePannello, [
    { id: 'terremoti-sezione', etichetta: t('mappe.tab.sezione'), nodo: nodoSezione() },
    { id: 'terremoti-profondita', etichetta: t('mappe.tab.profondita'), nodo: nodoProfondita() },
    { id: 'terremoti-densita', etichetta: t('mappe.tab.densita'), nodo: nodoDensita() },
    { id: 'terremoti-coropletica', etichetta: t('mappe.tab.territorio'), nodo: nodoCoropletica() },
  ]);
  collegaRail(document.getElementById('rail-pannelli'), [
    { id: 'scheda', etichetta: t('app.rail.scheda'), pannello: document.getElementById('scheda') },
    { id: 'storico', etichetta: t('scheda.tab.storico'), pannello: document.getElementById('storico-pannello'), apri: () => storico.apri() },
    { id: 'confronto', etichetta: t('rail.confronto'), pannello: confrontoPannello, apri: () => apriConfronto(confrontoPannello) },
    { id: 'mappe', etichetta: t('rail.mappe'), pannello: mappePannello, apri: () => mappe.apri() },
  ]);
  document.addEventListener('scheda:mostra', () => document.getElementById('scheda').hidden = false);

  // coordinate sotto il puntatore e zoom nel piè di pagina; lo zoom sta su una riga sua, così il riquadro resta stretto
  const piedeCoord = document.getElementById('piede-coord');
  const coordTesto = document.createElement('span');
  const zoomTesto = Object.assign(document.createElement('span'), { className: 'piede-zoom' });
  piedeCoord.replaceChildren(coordTesto, zoomTesto);
  let puntatore = null;
  const aggiornaCoord = () => {
    const c = puntatore ?? map.getCenter();
    coordTesto.textContent = `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`;
    zoomTesto.textContent = `zoom ${map.getZoom().toFixed(1)}`;
  };
  map.on('mousemove', e => { puntatore = e.lngLat; aggiornaCoord(); });
  map.getCanvas().addEventListener('mouseleave', () => { puntatore = null; aggiornaCoord(); });
  map.on('move', () => { if (!puntatore) aggiornaCoord(); });
  aggiornaCoord();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 120 }), 'bottom-right');

  const esiti = await Promise.allSettled(MODULI.filter(m => m.avvia).map(m => m.avvia(map)));
  esiti.forEach(e => { if (e.status === 'rejected') segnala(t('avviso.stratoNonCaricato.dettaglio', { nome: e.reason?.message ?? e.reason })); });

  const ricerca = collegaRicerca(map, { terremoti, storico: terremotiStorico, comuni });
  collegaStrumenti(map);
  // Tabella dei dati: righe degli strati accesi, esportabili in CSV e JSON
  collegaTabellaDati({
    bottone: document.getElementById('btn-tabella'),
    fornitori: [terremoti.tabella, terremotiStorico.tabella, terremotiConfronto.tabella].filter(Boolean),
  });
  collegaInfo({ bottone: document.getElementById('btn-info') });
  collegaStampa(map, document.getElementById('btn-stampa'), document.getElementById('stampa-menu'));
  const condivisi = { storico: terremotiStorico, confronto: terremotiConfronto, ricerca, map };
  collegaCondividi(document.getElementById('btn-condividi'), { moduli: condivisi });
  await applicaStatoDaUrl(location.search, condivisi); // strati e filtri del link condiviso, a strati già avviati
  tieniAggiornatoIndirizzo(condivisi); // dopo il ripristino: prima cancellerebbe i parametri del link
  window.dt.pronto = true;
});
