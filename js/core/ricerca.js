// Barra di ricerca in basso al centro e filtri Regione → Provincia → Comune, a cascata.
// I nomi vengono da dati/indice-comuni.json (letto alla prima interazione), i confini da comuni.pmtiles: la scelta zooma sull'area
// e ne evidenzia il confine; con l'interruttore «solo eventi in quest'area» restringe anche i terremoti in tempo reale
// e, a Live Zoom acceso, inquadra quelli rimasti.
import { HIT_COMUNI, SRC_COMUNI, STRATO_COMUNI as STRATO, VISTA_ITALIA, urlDati, sorgenteComuni } from './config.js';
import { t } from './i18n.js';
import { segnala } from './pannello.js';
import { liveZoomAttivo, riquadroDa } from './live-zoom.js';
import { LIVELLI, MIN_LETTERE, SCELTA_VUOTA, cambia, cerca, contesto, creaIndice, filtroArea, haScelta, opzioni, puntoInGeometrie, sceltaDaVoce, voceScelta } from './aree.js';

export const SRC = SRC_COMUNI;
const RIEMPIMENTO = 'aree-riempimento';
const CONTORNO = 'aree-contorno';
export const STRATO_COMUNI = STRATO;
const ZOOM_MAX_AREA = 12;
const DOPO = 'terremoti-punti'; // l'evidenziazione sta sotto i cerchi dei terremoti

const el = (tag, classe, testo) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
};

export function collegaRicerca(map, { terremoti = null, storico = null, comuni = null } = {}) {
  const campo = document.getElementById('cerca-testo');
  const elenco = document.getElementById('cerca-risultati');
  const bottoneFiltri = document.getElementById('cerca-filtri');
  const pannello = document.getElementById('cerca-pannello');
  const azzera = document.getElementById('cerca-ripristina');
  if (!campo || !elenco || !bottoneFiltri || !pannello || !azzera) return;

  let indice = null;
  let caricamento = null;
  let scelta = { ...SCELTA_VUOTA };
  let soloEventi = false;
  let giro = 0; // ogni scelta annulla le attese di quella prima

  // ---- mappa: confini dei comuni (invisibili finché non c'è una scelta) ----
  if (!map.getSource(SRC)) map.addSource(SRC, sorgenteComuni());
  const prima = map.getLayer(DOPO) ? DOPO : undefined;
  const nessuno = ['==', ['get', 'pro_com'], -1];
  map.addLayer({ id: RIEMPIMENTO, type: 'fill', source: SRC, 'source-layer': STRATO_COMUNI, filter: nessuno, paint: { 'fill-color': '#f5a623', 'fill-opacity': 0.14 } }, prima);
  map.addLayer({ id: CONTORNO, type: 'line', source: SRC, 'source-layer': STRATO_COMUNI, filter: nessuno, paint: { 'line-color': '#c27c0e', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 10, 2.5] } }, prima);

  // riempimento senza colore su tutti i comuni: rende il confine cliccabile per la card dei terremoti del comune
  map.addLayer({ id: HIT_COMUNI, type: 'fill', source: SRC, 'source-layer': STRATO_COMUNI, paint: { 'fill-opacity': 0 } }, prima);
  const margini = () => {
    const p = map.getPadding();
    return { top: p.top + 70, bottom: p.bottom + 120, left: p.left + 40, right: p.right + 40 };
  };
  const inquadra = (riquadro, opz = {}) => map.fitBounds(riquadro, { padding: margini(), maxZoom: ZOOM_MAX_AREA, duration: 700, ...opz });

  // ---- indice dei nomi ----
  const caricaIndice = () => caricamento ??= fetch(urlDati('indice-comuni.json'))
    .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(j => { indice = creaIndice(j); disegnaMenu(); return indice; })
    .catch(() => { caricamento = null; segnala(t('ricerca.errore')); return null; });

  // ---- suggerimenti ----
  let suggeriti = [];
  let attivo = -1;
  const chiudiElenco = () => { elenco.hidden = true; elenco.replaceChildren(); suggeriti = []; attivo = -1; campo.setAttribute('aria-expanded', 'false'); campo.removeAttribute('aria-activedescendant'); };
  const evidenzia = i => {
    attivo = i;
    [...elenco.children].forEach((li, k) => li.firstElementChild?.setAttribute('aria-selected', String(k === i)));
    const b = elenco.children[i]?.firstElementChild;
    if (b) { campo.setAttribute('aria-activedescendant', b.id); b.scrollIntoView({ block: 'nearest' }); } else campo.removeAttribute('aria-activedescendant');
  };
  function mostraSuggerimenti() {
    const q = campo.value;
    if (q.trim().length < MIN_LETTERE || !indice) return chiudiElenco();
    suggeriti = cerca(indice, q);
    elenco.replaceChildren();
    if (!suggeriti.length) {
      elenco.append(el('li', 'cerca-vuoto', t('ricerca.nessuno', { q: q.trim() })));
    } else {
      suggeriti.forEach((v, i) => {
        const li = el('li');
        li.setAttribute('role', 'presentation');
        const b = el('button');
        b.type = 'button';
        b.id = `cerca-voce-${i}`;
        b.setAttribute('role', 'option');
        b.append(el('strong', null, v.nome), el('span', 'cerca-tipo', [t(`ricerca.tipo.${v.tipo}`), contesto(indice, v)].filter(Boolean).join(' · ')));
        b.addEventListener('click', () => scegliVoce(v));
        li.append(b);
        elenco.append(li);
      });
    }
    elenco.hidden = false;
    campo.setAttribute('aria-expanded', 'true');
    evidenzia(-1);
  }

  function scegliVoce(v) {
    campo.value = v.nome;
    chiudiElenco();
    applica(sceltaDaVoce(v));
  }

  campo.addEventListener('focus', caricaIndice);
  campo.addEventListener('input', async () => { await caricaIndice(); mostraSuggerimenti(); });
  campo.addEventListener('keydown', e => {
    if (e.key === 'Escape') { chiudiElenco(); return; }
    if (elenco.hidden || !suggeriti.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      evidenzia((attivo + (e.key === 'ArrowDown' ? 1 : -1) + suggeriti.length) % suggeriti.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      scegliVoce(suggeriti[attivo >= 0 ? attivo : 0]);
    }
  });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#cerca')) chiudiElenco(); });

  // ---- filtri a cascata ----
  const selezioni = {};
  const casellaEventi = Object.assign(el('input'), { type: 'checkbox', id: 'cerca-solo-eventi' });
  const nodoEventi = el('label', 'cerca-solo-eventi');
  nodoEventi.append(casellaEventi, ' ', t('filtri.soloEventi'));
  pannello.append(el('h2', null, t('filtri.titolo')));
  for (const livello of LIVELLI) {
    const id = `filtro-${livello}`;
    const etichetta = el('label', null, t(`filtri.${livello}`));
    etichetta.htmlFor = id;
    const sel = el('select');
    sel.id = id;
    sel.addEventListener('change', () => {
      const cod = sel.value === '' ? null : Number(sel.value);
      campo.value = '';
      applica(cambia(indice, scelta, livello, cod));
    });
    selezioni[livello] = sel;
    pannello.append(etichetta, sel);
  }
  pannello.append(nodoEventi);
  if (terremoti?.menuMagnitudo) pannello.append(terremoti.menuMagnitudo());
  if (terremoti?.menuProfondita) pannello.append(terremoti.menuProfondita());
  if (storico?.mostraAnno) {
    const selAnno = el('select');
    selAnno.id = 'filtro-anno';
    selAnno.append(Object.assign(el('option', null, t('filtri.annoRealTime')), { value: '' }), ...storico.anni().map(a => Object.assign(el('option', null, String(a)), { value: String(a) })));
    selAnno.addEventListener('change', () => storico.mostraAnno(selAnno.value === '' ? null : Number(selAnno.value), undefined, terremoti?.profonditaScelta?.() ?? null));
    const etAnno = el('label', null, t('filtri.anno'));
    etAnno.htmlFor = 'filtro-anno';
    pannello.append(etAnno, selAnno);
  }
  casellaEventi.addEventListener('change', () => { soloEventi = casellaEventi.checked; applicaEventi(); });

  function disegnaMenu() {
    if (!indice) return;
    const o = opzioni(indice, scelta);
    const valore = { regione: scelta.reg, provincia: scelta.prov, comune: scelta.com };
    for (const livello of LIVELLI) {
      const sel = selezioni[livello];
      const voci = o[livello];
      sel.replaceChildren(Object.assign(el('option', null, t(`filtri.tutti.${livello}`)), { value: '' }), ...voci.map(v => Object.assign(el('option', null, v.nome), { value: String(v.cod) })));
      sel.value = valore[livello] == null ? '' : String(valore[livello]);
    }
    const n = [scelta.reg, scelta.prov, scelta.com].filter(x => x != null).length;
    bottoneFiltri.dataset.attivo = String(n > 0);
    bottoneFiltri.dataset.n = String(n);
    casellaEventi.disabled = !haScelta(scelta) || !(terremoti || storico);
    nodoEventi.hidden = !(terremoti || storico);
  }

  bottoneFiltri.addEventListener('click', async () => {
    await caricaIndice();
    const apri = pannello.hidden;
    pannello.hidden = !apri;
    bottoneFiltri.setAttribute('aria-expanded', String(apri));
    if (apri) chiudiElenco();
  });
  azzera.addEventListener('click', () => {
    campo.value = '';
    chiudiElenco();
    casellaEventi.checked = false;
    soloEventi = false;
    const anno = document.getElementById('filtro-anno');
    if (anno) anno.value = '';
    storico?.mostraAnno?.(null); // spegne l'archivio storico e torna al tempo reale
    terremoti?.ripristinaFiltro?.(); // periodo, magnitudo e classi iniziali
    applica({ ...SCELTA_VUOTA }, { casa: true });
  });

  // ---- applica la scelta ----
  function applica(nuova, { casa = false } = {}) {
    giro++;
    scelta = nuova;
    disegnaMenu();
    const filtro = filtroArea(scelta);
    for (const id of [RIEMPIMENTO, CONTORNO]) map.setFilter(id, filtro ?? nessuno);
    // tooltip ed evidenza dei comuni anche a strato spento, ma solo dentro l'area scelta
    comuni?.impostaRicerca(filtro);
    // il contorno disegna i confini di ogni comune dell'area: utile per un comune, rumoroso per una provincia o una regione (basta il riempimento)
    map.setPaintProperty(CONTORNO, 'line-opacity', scelta.com != null ? 1 : 0);
    map.setPaintProperty(RIEMPIMENTO, 'fill-opacity', scelta.com != null ? 0.14 : 0.2);
    const voce = indice ? voceScelta(indice, scelta) : null;
    if (voce) inquadra(voce.riquadro);
    else if (casa) map.fitBounds(VISTA_ITALIA, { padding: 24, bearing: 0, pitch: 0 });
    applicaEventi();
  }

  // Restringe i terremoti all'area: serve la geometria dei comuni scelti, che si legge dai tile caricati a fine movimento.
  function applicaEventi() {
    if (!terremoti && !storico) return;
    const mio = giro;
    if (!soloEventi || !haScelta(scelta)) { terremoti?.impostaArea(null); storico?.impostaArea(null, null); return; }
    const filtro = filtroArea(scelta);
    const calcola = () => {
      if (mio !== giro) return;
      const geometrie = map.querySourceFeatures(SRC, { sourceLayer: STRATO_COMUNI, filter: filtro }).map(f => f.geometry);
      const [o, s, e, n] = voceScelta(indice, scelta).riquadro;
      const dentro = geometrie.length
        ? p => p.lon >= o && p.lon <= e && p.lat >= s && p.lat <= n && puntoInGeometrie(p.lon, p.lat, geometrie)
        : p => p.lon >= o && p.lon <= e && p.lat >= s && p.lat <= n; // tile non ancora pronti: vale il riquadro
      storico?.impostaArea(dentro, [o, s, e, n]);
      const rimasti = terremoti?.impostaArea(dentro) ?? [];
      if (liveZoomAttivo() && rimasti.length) {
        const r = riquadroDa(rimasti.map(p => ({ geometry: { coordinates: [p.lon, p.lat] } })));
        if (r) inquadra(r, { maxZoom: 11 });
      }
    };
    map.once('idle', calcola);
    map.triggerRepaint();
  }

  disegnaMenu();
}
