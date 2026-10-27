// Filtri Regione → Provincia → Comune per una scheda (il confronto tra due anni): stessa cascata della ricerca, ma con scelta propria.
// `prepara` inquadra l'area scelta, attende i tile dei comuni e risponde con la funzione che dice se un evento ci sta dentro.
import { urlDati } from './config.js';
import { t } from './i18n.js';
import { LIVELLI, SCELTA_VUOTA, cambia, creaIndice, haScelta, opzioni, puntoInGeometrie, voceScelta, filtroArea } from './aree.js';
import { SRC, STRATO_COMUNI } from './ricerca.js';

let caricamento = null;
const caricaIndice = () => caricamento ??= fetch(urlDati('indice-comuni.json'))
  .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
  .then(creaIndice)
  .catch(e => { caricamento = null; throw e; });

const el = (tag, classe, testo) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
};

export function creaFiltroTerritorio(map) {
  const nodo = el('div', 'terremoti-archivio-larga terremoti-territorio');
  nodo.append(el('strong', null, t('terremoti.arc.territorio')));
  let indice = null;
  let scelta = { ...SCELTA_VUOTA };
  const selezioni = {};
  const disegna = () => {
    if (!indice) return;
    const o = opzioni(indice, scelta);
    const valore = { regione: scelta.reg, provincia: scelta.prov, comune: scelta.com };
    for (const livello of LIVELLI) {
      const sel = selezioni[livello];
      sel.replaceChildren(Object.assign(el('option', null, t(`filtri.tutti.${livello}`)), { value: '' }), ...o[livello].map(v => Object.assign(el('option', null, v.nome), { value: String(v.cod) })));
      sel.value = valore[livello] == null ? '' : String(valore[livello]);
    }
  };
  for (const livello of LIVELLI) {
    const lab = el('label', 'terremoti-filtro');
    const sel = el('select');
    sel.addEventListener('change', () => { scelta = cambia(indice, scelta, livello, sel.value === '' ? null : Number(sel.value)); disegna(); });
    selezioni[livello] = sel;
    lab.append(el('span', null, t(`filtri.${livello}`)), sel);
    nodo.append(lab);
  }
  // le tre select si riempiono alla prima apertura, senza scaricare l'indice se il confronto non si usa
  const pronto = () => indice ? Promise.resolve(indice) : caricaIndice().then(i => { indice = i; disegna(); return i; });
  nodo.addEventListener('focusin', () => { pronto().catch(() => {}); }, { once: true });
  nodo.addEventListener('pointerenter', () => { pronto().catch(() => {}); }, { once: true });

  return {
    nodo,
    attivo: () => haScelta(scelta),
    // null = tutta Italia; altrimenti { dentro(p), riquadro } con p = {lon, lat}
    async prepara() {
      if (!haScelta(scelta)) return null;
      await pronto();
      const filtro = filtroArea(scelta);
      const [o, s, e, n] = voceScelta(indice, scelta).riquadro;
      const p = map.getPadding();
      map.fitBounds([o, s, e, n], { padding: { top: p.top + 70, bottom: p.bottom + 120, left: p.left + 40, right: p.right + 40 }, maxZoom: 12, duration: 0 });
      await new Promise(ok => { map.once('idle', ok); map.triggerRepaint(); });
      const geometrie = map.querySourceFeatures(SRC, { sourceLayer: STRATO_COMUNI, filter: filtro }).map(f => f.geometry);
      const nelRiquadro = p => p.lon >= o && p.lon <= e && p.lat >= s && p.lat <= n;
      return { riquadro: [o, s, e, n], dentro: geometrie.length ? p => nelRiquadro(p) && puntoInGeometrie(p.lon, p.lat, geometrie) : nelRiquadro };
    },
  };
}
