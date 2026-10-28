import { t } from '../core/i18n.js';
import { pmt } from '../core/config.js';
import { registraSezioneTerritorio, segnaStratoTerritorio, suStatoTerritorio, territorioAttivo } from '../core/tooltip-territorio.js';

// Mappa di pericolosità sismica MPS04 dell'INGV: l'accelerazione massima del suolo (ag) con il 10% di probabilità di essere superata in 50 anni,
// su roccia. I poligoni sono le fasce di ag ricavate dalla griglia ufficiale (scripts/genera-pericolosita.py) e stanno in un PMTiles. Spento all'avvio.
const SRC = 'pericolosita';
const FASCE = 'pericolosita-fasce';
const HIT = 'pericolosita-hit'; // riempimento trasparente: la fascia si legge nel tooltip anche a strato spento, se un altro strato del gruppo è acceso
const STRATO = 'pericolosita'; // nome dello strato dentro il PMTiles

// classe 0–11: la classe n parte da n × 0,025 g (la 0 sta sotto 0,025 g, l'ultima va da 0,275 a 0,3 g)
const PASSO = 0.025;
// i colori sono quelli della legenda della mappa INGV (OPCM 3519, 2004): grigi, azzurri, verdi, dal giallo al rosso, poi magenta e viola
const COLORI = ['#e5e5e5', '#c3c3c3', '#ccffff', '#68fcfc', '#a6ffa5', '#1afe00', '#fff9a5', '#ffcc00', '#ff7f00', '#ff0000', '#d900ff', '#6a5acd'];
const ULTIMA = COLORI.length - 1;

const numero = x => x.toFixed(3).replace('.', ',').replace(/0+$/, '').replace(/,$/, '');
const intervallo = c => c === 0 ? `< ${numero(PASSO)}` : `${numero(c * PASSO)} – ${numero((c + 1) * PASSO)}`;
// zona sismica della normativa (OPCM 3274/2003) che corrisponde alla fascia: zona 1 sopra 0,25 g, 2 fino a 0,25, 3 fino a 0,15, 4 fino a 0,05
const zona = c => c >= 10 ? 1 : c >= 6 ? 2 : c >= 2 ? 3 : 4;

// Sezione «Pericolosità sismica» del tooltip «Territorio»: la fascia di ag, col colore della fascia in legenda. La zona sismica
// non si ripete qui: la dice la sezione della classificazione.
export function sezionePericolosita(classe) {
  return {
    sezione: 'Pericolosità sismica', icona: 'terremoto', colore: COLORI[classe] ?? '#6b7280',
    titolo: `ag ${intervallo(classe)} g`,
    sottotitolo: t('pericolosita.unitaBreve'),
  };
}

// La fascia di ag sul punto cliccato { intervallo, zona } per la scheda del comune; null se lo strato non ha dati in vista
// (serve almeno uno strato del gruppo «Territorio» acceso, come per il tooltip)
export function fasciaAlPunto(map, lngLat) {
  if (!territorioAttivo() || !map.getLayer(HIT)) return null;
  const { x, y } = map.project(lngLat);
  const f = map.queryRenderedFeatures([[x - 4, y - 4], [x + 4, y + 4]], { layers: [HIT] })[0];
  return f ? { intervallo: intervallo(f.properties.classe), zona: zona(f.properties.classe) } : null;
}

let legenda = null;

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

function scriviLegenda() {
  if (!legenda) return;
  legenda.replaceChildren(el('strong', null, t('pericolosita.titolo')), el('p', 'uffici-nota', t('pericolosita.unita')));
  // dall'alto la fascia più forte, come nella scala della mappa INGV
  for (let c = ULTIMA; c >= 0; c--) {
    const riga = el('p', 'allerta-riga');
    const chip = el('i', 'incendi-campione');
    chip.style.background = COLORI[c];
    riga.append(chip, ` ${intervallo(c)}`);
    legenda.append(riga);
  }
  legenda.append(el('p', 'uffici-nota', t('pericolosita.nota')));
  const credito = el('p', 'uffici-nota', `${t('pericolosita.dati')} `);
  credito.append(Object.assign(el('a', null, 'INGV MPS04'), { href: 'https://zonesismiche.mi.ingv.it/', target: '_blank', rel: 'noopener' }));
  legenda.append(credito);
}

function creaLegenda() {
  legenda = el('div', 'legenda legenda-monumenti lg-pericolosita');
  legenda.hidden = true;
  document.getElementById('legende').append(legenda);
  scriviLegenda();
}

export default {
  id: 'pericolosita',
  titolo: 'Pericolosità sismica',
  gruppo: 'territorio',
  senzaIntestazione: true,
  sezione: 'Pericolosità sismica',
  sezioniFisse: true,
  argomento: { titolo: 'Pericolosità sismica', descrizione: 'La mappa di pericolosità sismica MPS04 dell\'INGV: l\'accelerazione del suolo attesa, a fasce di colore.' },
  aggiungiSorgenti(map) {
    map.addSource(SRC, { type: 'vector', url: pmt('pericolosita-mps04.pmtiles'), attribution: '<a href="https://zonesismiche.mi.ingv.it/" target="_blank" rel="noopener">INGV MPS04</a>' });
  },
  aggiungiLayer(map) {
    map.addLayer({
      id: FASCE, type: 'fill', source: SRC, 'source-layer': STRATO, layout: { visibility: 'none' },
      paint: { 'fill-color': ['match', ['get', 'classe'], ...COLORI.flatMap((c, i) => [i, c]), '#cccccc'], 'fill-opacity': 0.75, 'fill-antialias': false },
    });
    // sezione del tooltip «Territorio»: la fascia di ag sotto il cursore (con almeno uno strato del gruppo acceso)
    map.addLayer({ id: HIT, type: 'fill', source: SRC, 'source-layer': STRATO, layout: { visibility: 'none' }, paint: { 'fill-opacity': 0, 'fill-antialias': false } });
    suStatoTerritorio(attivo => map.setLayoutProperty(HIT, 'visibility', attivo ? 'visible' : 'none'));
    registraSezioneTerritorio(map, 1, e => {
      if (!territorioAttivo()) return null;
      const f = map.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers: [HIT] })[0];
      return f ? sezionePericolosita(f.properties.classe) : null;
    });
  },
  legendaPannello: '.lg-pericolosita',
  strati: [{
    id: 'pericolosita', etichetta: 'Pericolosità sismica', layers: [FASCE], attivo: false, legendaPannello: '.lg-pericolosita',
    suCambio(attivo) { segnaStratoTerritorio('pericolosita', attivo); if (legenda) legenda.hidden = !attivo; },
  }],
  pannello: creaLegenda,
};
