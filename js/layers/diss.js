import { t } from '../core/i18n.js';
import { registraTooltipStrati } from '../core/tooltip.js';
import { apriPopupScheda } from './popup-traffico.js';
import { collegamento } from '../core/url-sicuro.js';

// Sorgenti sismogenetiche del catalogo DISS 3.3.1 (INGV): individuali, composte e dibattute. Il WFS pubblica un tipo
// per categoria, quindi sono tre richieste unite in un'unica sorgente; si scaricano alla prima accensione. Spento all'avvio.
const SRC = 'diss';
const AREE = 'diss-aree';
const BORDI = 'diss-bordi';
const BORDI_DIBATTUTE = 'diss-bordi-dibattute';
const OWS = 'https://services.seismofaults.eu/DISS331/ows?' + new URLSearchParams({
  service: 'WFS', version: '2.0.0', request: 'GetFeature', outputFormat: 'application/json', srsName: 'EPSG:4326',
});
// colori del catalogo: gli stessi del mapper DISS (individuali giallo ambra, composte arancione, dibattute viola)
const TIPI = [
  { tipo: 'individuale', nome: 'DISS331:iss331', colore: '#fabe0a' },
  { tipo: 'composta', nome: 'DISS331:csspln331', colore: '#ff8c00' },
  { tipo: 'dibattuta', nome: 'DISS331:dss331', colore: '#7b68fa' },
];
const VUOTO = { type: 'FeatureCollection', features: [] };

// rake (angolo di scorrimento) → cinematica, con la convenzione di Aki & Richards:
// 90° inversa, −90° normale, 0°/180° trascorrente, valori intermedi oblique
const angolo = r => ((r % 360) + 540) % 360 - 180;
const CINEMATICHE = [
  { chiave: 'inversa', prova: r => Math.abs(angolo(r) - 90) <= 30 },
  { chiave: 'normale', prova: r => Math.abs(angolo(r) + 90) <= 30 },
  { chiave: 'trascorrente', prova: r => Math.abs(angolo(r)) <= 30 || Math.abs(angolo(r)) >= 150 },
  { chiave: 'obliqua', prova: () => true },
];
// le individuali hanno un rake solo, le composte un intervallo (media), le dibattute nessuno
const rake = p => (p.rake ?? (p.rakemin != null && p.rakemax != null ? (p.rakemin + p.rakemax) / 2 : p.rakemin ?? p.rakemax ?? null));
const cinematica = p => (rake(p) == null ? 'nd' : CINEMATICHE.find(c => c.prova(rake(p))).chiave);
const coloreDi = tipo => TIPI.find(x => x.tipo === tipo)?.colore ?? '#6b7280';

let mappa = null;
let legenda = null;
let acceso = false;
let caricato = false;
let popup = null;
let errore = false;
let parziale = false;

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

const numero = v => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 10) / 10) : String(v));
const intervallo = (min, max) => {
  if (min == null && max == null) return null;
  if (min == null || max == null || min === max) return numero(min ?? max);
  return `${numero(min)}–${numero(max)}`;
};

const modello = p => ({
  titolo: p.sourcename || t('diss.senzaNome'),
  sottotitolo: p.idsource ? `${t(`diss.tipo.${p.tipo}`)} · ${p.idsource}` : t(`diss.tipo.${p.tipo}`),
  righe: [
    { etichetta: t('diss.cinematica'), valore: t(`diss.famiglia.${p.cinematica}`) },
    p.maxmag != null && { etichetta: t('diss.magnitudo'), valore: `M ${numero(p.maxmag)}` },
    intervallo(p.mindepth, p.maxdepth) && { etichetta: t('diss.profondita'), valore: `${intervallo(p.mindepth, p.maxdepth)} km` },
    (p.strike != null || p.strikemin != null) && { etichetta: t('diss.direzione'), valore: `${p.strike != null ? numero(p.strike) : intervallo(p.strikemin, p.strikemax)}°` },
    (p.dip != null || p.dipmin != null) && { etichetta: t('diss.inclinazione'), valore: `${p.dip != null ? numero(p.dip) : intervallo(p.dipmin, p.dipmax)}°` },
    p.length != null && p.width != null && { etichetta: t('diss.dimensioni'), valore: `${numero(p.length)} × ${numero(p.width)} km` },
    (p.srmin != null || p.srmax != null) && { etichetta: t('diss.slipRate'), valore: `${intervallo(p.srmin, p.srmax)} mm/a` },
    p.latesteq && { etichetta: t('diss.ultimoTerremoto'), valore: p.latesteq },
  ].filter(Boolean),
});

function apriPopup(e, p) {
  const corpo = [];
  const scheda = collegamento(el('a', 'traffico-link', t('diss.scheda')), p.linktoinfo);
  if (scheda.href) corpo.push(scheda);
  popup = apriPopupScheda(mappa, {
    precedente: popup, sezione: t('diss.titolo'), icona: 'terremoto', colore: p.colore ?? '#6b7280', modello: modello(p), corpo,
    punto: e.point, lngLat: e.lngLat,
  });
}

async function scarica({ tipo, nome }) {
  const r = await fetch(`${OWS}&typeName=${encodeURIComponent(nome)}`);
  if (!r.ok) throw new Error(String(r.status));
  const dati = await r.json();
  for (const f of dati.features) {
    f.properties = { ...f.properties, tipo, cinematica: cinematica(f.properties), colore: coloreDi(tipo) };
  }
  return dati.features;
}

async function carica() {
  if (caricato) return;
  caricato = true;
  const esiti = await Promise.allSettled(TIPI.map(scarica));
  const features = esiti.flatMap(e => (e.status === 'fulfilled' ? e.value : []));
  const mancanti = esiti.filter(e => e.status === 'rejected').length;
  if (features.length) mappa?.getSource(SRC)?.setData({ type: 'FeatureCollection', features });
  else caricato = false; // si riprova alla prossima accensione
  errore = !features.length;
  parziale = !errore && mancanti > 0;
  scriviLegenda();
}

function scriviLegenda() {
  if (!legenda) return;
  legenda.replaceChildren(el('strong', null, t('diss.titolo')));
  for (const x of TIPI) {
    const riga = el('p', 'allerta-riga');
    const chip = el('i', 'incendi-campione');
    chip.style.background = x.colore;
    riga.append(chip, ` ${t(`diss.tipo.${x.tipo}`)}`);
    legenda.append(riga);
  }
  legenda.append(el('p', 'uffici-nota', t('diss.dibattute')));
  if (errore) legenda.append(el('p', 'uffici-nota', t('diss.nonDisponibile')));
  else if (parziale) legenda.append(el('p', 'uffici-nota', t('diss.parziale')));
  const credito = el('p', 'uffici-nota', `${t('diss.dati')} `);
  credito.append(Object.assign(el('a', null, 'INGV DISS 3.3.1'), { href: 'https://diss.ingv.it/', target: '_blank', rel: 'noopener' }));
  legenda.append(credito);
}

function creaLegenda() {
  legenda = el('div', 'legenda legenda-monumenti lg-diss');
  legenda.hidden = !acceso;
  document.getElementById('legende').append(legenda);
  scriviLegenda();
}

export default {
  id: 'diss',
  titolo: 'Sorgenti sismogenetiche (INGV DISS)',
  gruppo: 'eventi',
  sezione: 'Sorgenti sismogenetiche',
  sezioniFisse: true,
  argomento: { titolo: 'Sorgenti sismogenetiche', descrizione: 'Le sorgenti sismogenetiche del catalogo DISS 3.3.1 dell\'INGV, colorate come nella mappa DISS.' },
  aggiungiSorgenti(map) {
    map.addSource(SRC, { type: 'geojson', data: VUOTO, attribution: '<a href="https://diss.ingv.it/" target="_blank" rel="noopener">INGV DISS</a>' });
  },
  aggiungiLayer(map) {
    mappa = map;
    // aree: le composte più piene, le individuali appena velate, le dibattute leggere
    map.addLayer({
      id: AREE, type: 'fill', source: SRC, layout: { visibility: 'none' },
      paint: { 'fill-color': ['get', 'colore'], 'fill-opacity': ['match', ['get', 'tipo'], 'individuale', 0.12, 'composta', 0.35, 0.3] },
    });
    map.addLayer({
      id: BORDI, type: 'line', source: SRC, filter: ['!=', ['get', 'tipo'], 'dibattuta'], layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'colore'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, ['match', ['get', 'tipo'], 'individuale', 1.4, 1], 12, ['match', ['get', 'tipo'], 'individuale', 2.6, 1.8]],
        'line-opacity': 0.95,
      },
    });
    // contorno tratteggiato: le sorgenti dibattute
    map.addLayer({
      id: BORDI_DIBATTUTE, type: 'line', source: SRC, filter: ['==', ['get', 'tipo'], 'dibattuta'], layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'colore'], 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 12, 1.8], 'line-opacity': 0.85, 'line-dasharray': [2, 1.5] },
    });
    const TUTTI = [AREE, BORDI, BORDI_DIBATTUTE];
    map.on('click', e => {
      if (!acceso) return;
      const f = map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: TUTTI })[0];
      if (f) apriPopup(e, f.properties);
    });
    registraTooltipStrati(map, [{
      layers: TUTTI, icona: 'terremoto', sezione: 'Sorgenti sismogenetiche', colore: p => p.colore ?? '#6b7280',
      modello: p => { const m = modello(p); return { titolo: m.titolo, sottotitolo: m.sottotitolo, elenco: m.righe.map(r => ({ testo: `${r.etichetta}: ${r.valore}` })) }; },
    }]);
    map.on('mouseenter', AREE, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', AREE, () => { map.getCanvas().style.cursor = ''; });
  },
  legendaPannello: '.lg-diss',
  strati: [{
    id: 'diss', etichetta: 'Sorgenti sismogenetiche (DISS)', layers: [AREE, BORDI, BORDI_DIBATTUTE], attivo: false, legendaPannello: '.lg-diss',
    suCambio(attivo) {
      acceso = attivo;
      if (legenda) legenda.hidden = !attivo;
      if (!attivo) { popup?.remove(); popup = null; return; }
      carica();
    },
  }],
  pannello: creaLegenda,
};