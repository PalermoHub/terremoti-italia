// «Live Zoom»: a ogni modifica di un filtro (caselle delle legende e dei pannelli) la mappa si adatta ai risultati rimasti.
// Un solo stato per tutta l'app, con due interruttori che lo mostrano (gruppo Overlay del tab Layer e riquadro legenda).
// Il valore sta in localStorage (acceso se non è mai stato scelto); il browser arriva come parametro.
import { t } from './i18n.js';

export const CHIAVE_LIVE_ZOOM = 'dt-live-zoom';
export const EVENTO_LIVE_ZOOM = 'dt:live-zoom'; // sul document a ogni cambio di stato: gli interruttori si allineano

let attivo = true;
export const liveZoomAttivo = () => attivo;

export function caricaLiveZoom(storage) {
  try { attivo = storage?.getItem(CHIAVE_LIVE_ZOOM) !== '0'; } catch { attivo = true; }
  return attivo;
}

export function impostaLiveZoom(v, storage = null) {
  attivo = Boolean(v);
  try { storage?.setItem(CHIAVE_LIVE_ZOOM, attivo ? '1' : '0'); } catch { /* storage bloccato: vale la sessione */ }
  document.dispatchEvent(new Event(EVENTO_LIVE_ZOOM));
  return attivo;
}

// Riquadro [[ovest, sud], [est, nord]] che contiene le geometrie date; null se non c'è nessuna coordinata.
export function riquadroDa(features) {
  let o = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const visita = c => {
    if (typeof c[0] === 'number') {
      if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) return;
      if (c[0] < o) o = c[0]; if (c[0] > e) e = c[0];
      if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1];
    } else for (const x of c) visita(x);
  };
  for (const f of features) if (f?.geometry?.coordinates) visita(f.geometry.coordinates);
  return o <= e ? [[o, s], [e, n]] : null;
}

// Interruttore del riquadro legenda: stessa forma di «Mostra il cerchio in mappa».
export function creaInterruttoreLegenda(storage = null) {
  const etichetta = document.createElement('label');
  etichetta.className = 'legende-raggio-cerchio live-zoom-legenda';
  const casella = Object.assign(document.createElement('input'), { type: 'checkbox', checked: attivo, role: 'switch' });
  casella.dataset.liveZoom = '';
  casella.addEventListener('change', () => impostaLiveZoom(casella.checked, storage));
  document.addEventListener(EVENTO_LIVE_ZOOM, () => { casella.checked = attivo; });
  etichetta.append(t('livezoom.interruttore'), casella);
  etichetta.title = t('livezoom.descrizione');
  return etichetta;
}

// Interruttore del gruppo Overlay (tab Layer): stessa forma di «Tooltip sulla mappa»; `occhio` è l'icona degli altri interruttori.
export function creaInterruttorePannello(occhio, storage = null) {
  const etichetta = document.createElement('label');
  etichetta.classList.add('strato', 'interruttore-tip');
  etichetta.title = t('livezoom.descrizione');
  const casella = document.createElement('input');
  casella.type = 'checkbox';
  casella.id = 'interruttore-live-zoom';
  casella.dataset.filtro = 'live-zoom'; // non è uno strato: non va nei conteggi degli strati accesi
  casella.dataset.liveZoom = '';
  casella.checked = attivo;
  casella.addEventListener('change', () => impostaLiveZoom(casella.checked, storage));
  document.addEventListener(EVENTO_LIVE_ZOOM, () => { casella.checked = attivo; });
  etichetta.append(casella, occhio(), ' ', t('livezoom.interruttore'));
  return etichetta;
}

// Collega la mappa: i filtri applicati (`setFilter`) nello stesso istante in cui l'utente cambia una casella o un cursore
// dei pannelli vengono ricordati; subito dopo la mappa si adatta ai dati che quei filtri lasciano.
// Con i tile vettoriali si vedono solo i tile già caricati: il riquadro è quello dei risultati caricati.
export function collegaLiveZoom(map, { contenitori = ['#legende-box', '#pannello'] } = {}) {
  const setFilter = map.setFilter.bind(map);
  let raccolti = null;
  map.setFilter = (id, ...resto) => { raccolti?.add(id); return setFilter(id, ...resto); };

  const adatta = ids => {
    const tutte = [];
    for (const id of ids) {
      const strato = map.getLayer(id);
      if (!strato || strato.visibility === 'none' || map.getLayoutProperty(id, 'visibility') === 'none' || !strato.source) continue;
      try {
        const opzioni = { filter: map.getFilter(id) ?? undefined };
        if (strato.sourceLayer) opzioni.sourceLayer = strato.sourceLayer;
        tutte.push(...map.querySourceFeatures(strato.source, opzioni));
      } catch { /* filtro non valutabile fuori da una vista: lo strato si salta */ }
    }
    const riquadro = riquadroDa(tutte);
    if (riquadro) map.fitBounds(riquadro, { padding: 60, maxZoom: 17, duration: 600 });
  };

  document.addEventListener('change', e => {
    const el = e.target;
    if (!attivo || raccolti || !el?.matches?.('input, select') || el.dataset.liveZoom !== undefined) return;
    if (el.matches('input[id^="strato-"]') || !contenitori.some(c => el.closest(c))) return;
    raccolti = new Set();
    // i filtri si applicano nei gestori della casella, che girano dopo questo (fase di cattura): si legge a gestori finiti
    setTimeout(() => { const ids = raccolti; raccolti = null; if (ids.size) adatta(ids); }, 0);
  }, true);
}
