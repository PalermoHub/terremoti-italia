import { t } from '../core/i18n.js';
import { urlDati } from '../core/config.js';
import { SRC_COMUNI, STRATO_COMUNI, sorgenteComuni } from '../core/config.js';
import { registraSezioneTerritorio, segnaStratoTerritorio, suStatoTerritorio, territorioAttivo } from '../core/tooltip-territorio.js';

// Classificazione sismica dei comuni (zone 1–4) del Dipartimento della Protezione Civile, aggiornata a maggio 2025.
// Ogni comune prende il colore della sua zona: i poligoni sono quelli dei confini comunali, la zona viene da
// dati/classificazione-sismica.json (scripts/classificazione-sismica.mjs). Spento all'avvio.
const FILL = 'classificazione-zone';
const HIT = 'classificazione-hit'; // riempimento trasparente: la zona si legge nel tooltip anche a strato spento, se un altro strato del gruppo è acceso
const FALLBACK = '#cccccc';
// zona 1 = più pericolosa; i colori seguono la scala semaforica usata dalla Protezione Civile
const COLORI = { 1: '#d7191c', 2: '#fd8d3c', 3: '#ffe066', 4: '#a6d96a' };

let zone = null; // codice ISTAT → zona come la scrive la Regione («2B», «3S», «2A-3A-3B»…)
let legenda = null;

// Zona principale di una sigla: la cifra più alta in pericolosità, cioè la più bassa («2A-3A-3B» → 2, «3S» → 3)
const principale = sigla => Math.min(...[...String(sigla)].filter(c => c >= '1' && c <= '4').map(Number));

// Sezione «Classificazione sismica» del tooltip «Territorio»: la zona del comune, col colore della zona in legenda. Il nome del
// comune sta nella sezione dei confini, non si ripete.
export function sezioneClassificazione(p, tabella) {
  const sigla = tabella?.[p.pro_com];
  if (!sigla || !p.comune) return null;
  return {
    sezione: 'Classificazione sismica', icona: 'terremoto', colore: COLORI[principale(sigla)] ?? '#6b7280',
    titolo: t('classificazione.tooltip', { zona: sigla }),
  };
}

// Sigla della zona sismica del comune per la scheda («2B»); stringa vuota se la tabella non è arrivata o il comune non c'è
export const zonaComune = proCom => zone?.[proCom] ?? '';

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

function scriviLegenda() {
  if (!legenda) return;
  legenda.replaceChildren(el('strong', null, t('classificazione.titolo')), el('p', 'uffici-nota', t('classificazione.unita')));
  for (const n of [1, 2, 3, 4]) {
    const riga = el('p', 'allerta-riga');
    const chip = el('i', 'incendi-campione');
    chip.style.background = COLORI[n];
    riga.append(chip, ` ${t(`classificazione.zona${n}`)}`);
    legenda.append(riga);
  }
  legenda.append(el('p', 'uffici-nota', t('classificazione.nota')));
  const credito = el('p', 'uffici-nota', `${t('classificazione.dati')} `);
  credito.append(Object.assign(el('a', null, 'Protezione Civile'), { href: 'https://rischi.protezionecivile.gov.it/it/sismico/attivita/classificazione-sismica/', target: '_blank', rel: 'noopener' }));
  legenda.append(credito);
}

function creaLegenda() {
  legenda = el('div', 'legenda legenda-monumenti lg-classificazione');
  legenda.hidden = true;
  document.getElementById('legende').append(legenda);
  scriviLegenda();
}

// Colora i comuni quando la tabella delle zone è arrivata: i codici di ogni zona vanno in una sola espressione «match»
function colora(map) {
  const perZona = new Map();
  for (const [codice, sigla] of Object.entries(zone)) {
    const n = principale(sigla);
    if (!perZona.has(n)) perZona.set(n, []);
    perZona.get(n).push(Number(codice));
  }
  const casi = [...perZona].flatMap(([n, codici]) => [codici, COLORI[n]]);
  if (map.getLayer(FILL)) map.setPaintProperty(FILL, 'fill-color', ['match', ['get', 'pro_com'], ...casi, FALLBACK]);
}

export default {
  id: 'classificazione',
  titolo: 'Classificazione sismica',
  gruppo: 'territorio',
  senzaIntestazione: true,
  sezione: 'Classificazione sismica',
  sezioniFisse: true,
  argomento: { titolo: 'Classificazione sismica', descrizione: 'La zona sismica (da 1, la più pericolosa, a 4) in cui ricade ogni comune italiano, secondo l\'elenco della Protezione Civile.' },
  aggiungiSorgenti(map) {
    if (!map.getSource(SRC_COMUNI)) map.addSource(SRC_COMUNI, sorgenteComuni());
  },
  aggiungiLayer(map) {
    map.addLayer({
      id: FILL, type: 'fill', source: SRC_COMUNI, 'source-layer': STRATO_COMUNI, layout: { visibility: 'none' },
      paint: { 'fill-color': FALLBACK, 'fill-opacity': 0.7, 'fill-antialias': false },
    });
    fetch(urlDati('classificazione-sismica.json'))
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(dati => { zone = dati; colora(map); })
      .catch(() => { zone = null; });
    // sezione del tooltip «Territorio»: la zona del comune sotto il cursore (con almeno uno strato del gruppo acceso e la tabella caricata)
    map.addLayer({ id: HIT, type: 'fill', source: SRC_COMUNI, 'source-layer': STRATO_COMUNI, layout: { visibility: 'none' }, paint: { 'fill-opacity': 0 } });
    suStatoTerritorio(attivo => map.setLayoutProperty(HIT, 'visibility', attivo ? 'visible' : 'none'));
    registraSezioneTerritorio(map, 2, e => {
      if (!territorioAttivo()) return null;
      const f = map.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers: [HIT] })[0];
      return f ? sezioneClassificazione(f.properties, zone) : null;
    });
  },
  legendaPannello: '.lg-classificazione',
  strati: [{
    id: 'classificazione', etichetta: 'Classificazione sismica', layers: [FILL], attivo: false, legendaPannello: '.lg-classificazione',
    suCambio(attivo) { segnaStratoTerritorio('classificazione', attivo); if (legenda) legenda.hidden = !attivo; },
  }],
  pannello: creaLegenda,
};
