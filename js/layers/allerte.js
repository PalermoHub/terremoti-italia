import { tutti } from '../core/scheda-util.js';
import { LIVELLI, coloreLivello, voceAllerta, modelloAllerte } from './scheda-allerte.js';
import { tl, t } from '../core/i18n.js';

// Allerta meteo-idro della Protezione Civile per le 187 zone di allerta d'Italia: il bollettino lo serve il server locale (GET /allerte, dal repository del DPC,
// rinnovato ogni 15 minuti); i poligoni delle zone ci sono anche a strato spento per la scheda.
const SRC_ALLERTE = 'allerte';
const FILL = 'allerte-fill';
const BORDO = 'allerte-bordo';
const HIT = 'allerte-hit';
const RIFRESCO_MS = 15 * 60 * 1000;
const VUOTO = { type: 'FeatureCollection', features: [] };

let mappa = null;
let legenda = null;
let acceso = false; // lo strato parte spento: l'utente lo accende dal pannello (i dati si caricano comunque, per la scheda)
let timer = null;
let zone = []; // proprietà delle zone di allerta (dal server), con `aggiornato`
let giornoAllerta = 'oggi'; // quale giorno colora la mappa

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = tl(testo);
  return e;
}

const coloreZona = (p, giorno) => coloreLivello(p[giorno]?.livello ?? 0);

function colora() {
  for (const id of [FILL, BORDO]) mappa?.getLayer(id) && mappa.setPaintProperty(id, id === FILL ? 'fill-color' : 'line-color', ['get', giornoAllerta === 'oggi' ? 'colore_oggi' : 'colore_domani']);
}

function scriviLegenda() {
  if (!legenda) return;
  legenda.replaceChildren(el('strong', null, 'Allerta meteo-idro in Italia'));
  if (!zone.length) { legenda.append(el('p', 'uffici-nota', t('allerte.nonDisponibile'))); return; }
  const giorni = el('div', 'allerta-giorni');
  for (const g of ['oggi', 'domani']) {
    const b = el('button', 'allerta-giorno');
    b.type = 'button';
    b.textContent = t(`allerte.${g}`);
    b.setAttribute('aria-pressed', String(g === giornoAllerta));
    b.addEventListener('click', () => { giornoAllerta = g; colora(); scriviLegenda(); });
    giorni.append(b);
  }
  legenda.append(giorni);
  for (const r of modelloAllerte(zone, giornoAllerta).righe) {
    const riga = el('p', 'allerta-riga');
    const chip = el('i', 'incendi-campione');
    chip.style.background = coloreLivello(r.livello);
    riga.append(chip, ` ${r.testo}`);
    legenda.append(riga);
  }
  const chiave = el('p', 'uffici-nota allerta-chiave');
  for (const l of LIVELLI) { const c = el('i', 'incendi-campione'); c.style.background = l.colore; c.title = tl(l.nome); chiave.append(c, ' '); }
  legenda.append(chiave, el('p', 'uffici-nota', t('allerte.cliccaZona')), el('p', 'uffici-nota', zone[0].bollettino));
}

function creaLegenda() {
  legenda = el('div', 'legenda legenda-monumenti lg-allerte');
  legenda.hidden = !acceso;
  document.getElementById('legende').append(legenda);
  scriviLegenda();
}

async function caricaAllerte() {
  try {
    const r = await fetch('/allerte');
    if (!r.ok) throw new Error(String(r.status));
    const dati = await r.json();
    if (!dati.features?.length) throw new Error('no zones');
    zone = dati.features.map(f => ({ ...f.properties, aggiornato: dati.aggiornato }));
    mappa?.getSource(SRC_ALLERTE)?.setData({
      type: 'FeatureCollection',
      features: dati.features.map(f => ({ ...f, properties: { ...f.properties, colore_oggi: coloreZona(f.properties, 'oggi'), colore_domani: coloreZona(f.properties, 'domani') } })),
    });
  } catch { /* senza bollettino la scheda non mostra la card e la legenda dice «non disponibile»: restano le zone di prima */ }
  scriviLegenda();
}

function pianifica() {
  clearInterval(timer);
  timer = null;
  if (acceso && !document.hidden) timer = setInterval(caricaAllerte, RIFRESCO_MS);
}

export default {
  id: 'allerte',
  titolo: 'Allerte meteo-idro',
  gruppo: 'eventi',
  sezioniFisse: true, // ogni layer di Eventi resta una sezione a sé: il riordino non attraversa le intestazioni
  argomento: { titolo: 'Allerte meteo-idro', descrizione: 'L\'allerta meteo-idro della Protezione Civile per oggi e domani nelle zone di allerta d\'Italia.' },
  aggiungiSorgenti(map) {
    map.addSource(SRC_ALLERTE, { type: 'geojson', data: VUOTO, attribution: '<a href="https://mappe.protezionecivile.gov.it/it/mappe-rischi/bollettino-di-criticita/" target="_blank" rel="noopener">Protezione Civile (CC BY 4.0)</a>' });
  },
  aggiungiLayer(map) {
    mappa = map;
    const visibile = { visibility: 'none' }; // spento di default: i moduli del nucleo leggono la visibilità esplicita
    map.addLayer({ id: FILL, type: 'fill', source: SRC_ALLERTE, layout: visibile, paint: { 'fill-color': ['get', 'colore_oggi'], 'fill-opacity': 0.3 } });
    map.addLayer({ id: BORDO, type: 'line', source: SRC_ALLERTE, layout: visibile, paint: { 'line-color': ['get', 'colore_oggi'], 'line-width': 2, 'line-opacity': 0.9 } });
    // poligono trasparente sempre presente: la scheda mostra l'allerta anche a strato spento
    map.addLayer({ id: HIT, type: 'fill', source: SRC_ALLERTE, paint: { 'fill-opacity': 0 } });
    document.addEventListener('visibilitychange', () => {
      if (acceso && !document.hidden) caricaAllerte();
      pianifica();
    });
  },
  async avvia() { await caricaAllerte(); pianifica(); },
  scheda: {
    layers: [HIT],
    voci(trovati) {
      const visti = new Set();
      return tutti(trovati, HIT).flatMap(f => {
        const p = zone.find(z => z.zona === f.properties.zona);
        if (!p || visti.has(p.zona)) return [];
        visti.add(p.zona);
        return [voceAllerta(p)];
      });
    },
    // il clic su una zona apre la scheda solo a strato acceso
    apertoFuoriComune(map, e) {
      return map.getLayoutProperty(FILL, 'visibility') !== 'none' && map.queryRenderedFeatures(e.point, { layers: [HIT] }).length > 0;
    },
  },
  legendaPannello: '.lg-allerte',
  strati: [{
    id: 'allerte', etichetta: 'Allerta meteo-idro in Italia', layers: [FILL, BORDO], attivo: false, legendaPannello: '.lg-allerte',
    suCambio(attivo) { acceso = attivo; if (legenda) legenda.hidden = !attivo; if (attivo) caricaAllerte(); pianifica(); },
  }],
  pannello: creaLegenda,
};
