import { t, localeIntl } from '../core/i18n.js';
import { intercettaClic } from '../core/cattura-clic.js';
import { EVENTO_STATO_CONDIVISO } from '../core/condividi-stato.js';
import { badgeMagnitudo } from '../core/badge-magnitudo.js';
import { evidenziaEventi } from '../core/evidenza-eventi.js';
import { EVENTO_TABELLA } from '../core/tabella-dati.js';
import { registraTooltipStrati } from '../core/tooltip.js';
import { annoDi, avvisoCompletezza, etichettaPeriodo, ANNO_RETE_COMPLETA } from './scheda-archivio.js';
import { RAMPA_COLORI } from './scheda-mappe.js';
import { grigliaEsagoni, coloreClasse, proiettaPoligoni, celleInArea, eventiInCella, COLORE_VUOTO, stileClasse, anniCiviliPeriodo, durataAnni, LATI_KM, LATO_PREDEFINITO_KM, DURATA_MINIMA_GIORNI, classiAnimazione, periodoUltimiAnni, periodoTuttoArchivio } from './esagoni.js';
import { scelta } from './terremoti-archivio.js';
import { eventiPeriodo, pannelloPeriodo, elencoEventi, legendaMappa, el, numero } from './terremoti-periodo.js';

// Densità dei terremoti: esagoni equivalenti (lato 5, 10 o 20 km) colorati per classi di numero di eventi, adattive al periodo,
// o per magnitudo massima, su un periodo dell'archivio di almeno un anno. Serve quando i cerchi sono troppi e si sovrappongono. Spento all'avvio; non si aggiorna da solo.
const SRC = 'terremoti-densita';
const CELLE = 'terremoti-densita-celle';
const SEMPRE = 'terremoti-densita-sempre'; // contorno degli esagoni con eventi in tutti gli anni del periodo
const NESSUNO = ['==', ['get', 'sempre'], 2];
const METRICHE = ['conteggio', 'magMax', 'tasso'];
const COLORE_SEMPRE = '#0ea5e9';
const VUOTO = { type: 'FeatureCollection', features: [] };

let mappa = null;
let acceso = false;
let primaVolta = true;
let pannello = null;
let righe = [];
let eventiMostrati = [];
let elenco = null;
let massimo = 0;
let metricaMostrata = 'conteggio';
let richiesta = 0;
let legenda = null; // la legenda in mappa
let legende = []; // la legenda del pannello e quella in mappa: stesso contenuto, riscritto a ogni calcolo
let ultimo = { classi: [], esagoniPerClasse: [], esagoniVuoti: 0, esagoniSempre: 0, anniCivili: 0, titolo: '', periodo: '' };
let esporta = null; // controlli dell'esportazione
let sempre = null; // casella «eventi in tutti gli anni»
let latoMostrato = LATO_PREDEFINITO_KM;
let area = null; // area di studio proiettata (Italia + 30 km di mare), null finché non è caricata o se il file manca
let areaCaricata = null;
const celleVuote = new Map(); // lato km → celle dell'area di studio
let popup = null;
let carico = null; // ultimo calcolo: { eventi, periodo, mag, m, km, perAnno, classi }

// Il contorno «tutti gli anni» si vede solo con la casella accesa
const applicaSempre = () => mappa?.setFilter(SEMPRE, sempre?.checked ? ['==', ['get', 'sempre'], 1] : NESSUNO);
const frazione = x => x.toLocaleString(localeIntl(), { maximumFractionDigits: 2 });
// Intervallo di una classe: conteggi interi («1–5», «oltre 100») o tassi annui («≤ 0,2», «0,2–1», «> 5»)
function etichettaClasse(c) {
  if (c.tasso) {
    const u = t('terremoti.den.alAnno');
    if (c.a == null) return `> ${frazione(c.da)} ${u}`;
    return c.da === 0 ? `≤ ${frazione(c.a)} ${u}` : `${frazione(c.da)}–${frazione(c.a)} ${u}`;
  }
  const intervallo = c.a == null ? t('terremoti.den.oltre', { n: numero(c.da - 1) }) : c.da === c.a ? numero(c.da) : `${numero(c.da)}–${numero(c.a)}`;
  return `${intervallo} ${t('terremoti.den.eventi')}`;
}

// Legenda: classi con campione, intervallo di eventi e numero di esagoni; per la magnitudo massima la rampa continua
function legendaEsagoni() {
  const nodo = el('div', 'terremoti-legenda-esagoni');
  legende.push(nodo);
  scriviLegenda(nodo);
  return nodo;
}
function scriviLegenda(nodo) {
  nodo.replaceChildren();
  if (ultimo.titolo) nodo.append(el('small', 'terremoti-periodo-nota', ultimo.titolo));
  if (metricaMostrata === 'magMax') {
    const barra = el('i', 'terremoti-rampa-barra');
    barra.style.background = `linear-gradient(to right, ${RAMPA_COLORI.join(', ')})`;
    const rampa = el('div', 'terremoti-rampa');
    rampa.append(barra, el('span', 'terremoti-rampa-estremi', massimo > 0 ? `0 – ${numero(massimo, 1)}` : ''));
    nodo.append(rampa);
  } else {
    if (ultimo.esagoniVuoti > 0) {
      const riga = el('div');
      const chip = el('i', 'incendi-campione');
      chip.style.background = COLORE_VUOTO;
      chip.style.opacity = '.5';
      riga.append(chip, `0 ${t('terremoti.den.eventi')} · ${t('terremoti.den.nEsagoni', { n: numero(ultimo.esagoniVuoti) })}`);
      nodo.append(riga);
    }
    ultimo.classi.forEach((c, i) => {
      const riga = el('div');
      const chip = el('i', 'incendi-campione');
      chip.style.background = coloreClasse(i, ultimo.classi.length);
      riga.append(chip, `${etichettaClasse(c)} · ${t('terremoti.den.nEsagoni', { n: numero(ultimo.esagoniPerClasse[i]) })}`);
      nodo.append(riga);
    });
  }
  if (sempre?.checked && ultimo.anniCivili > 1) {
    const riga = el('div');
    const chip = el('i', 'incendi-campione');
    chip.style.cssText = `background:transparent;border-color:${COLORE_SEMPRE};border-width:2px`;
    riga.append(chip, t('terremoti.den.sempreLegenda', { anni: ultimo.anniCivili, n: numero(ultimo.esagoniSempre) }));
    nodo.append(riga);
  }
  nodo.append(el('small', 'uffici-nota', t('terremoti.den.avvertenza')));
}
const scriviLegende = () => legende.forEach(scriviLegenda);

let metrica = null;
let lato = null;

// L'area di studio si legge una volta; se il file manca si disegnano solo gli esagoni con eventi
function caricaArea() {
  areaCaricata ??= fetch('dati/area-studio.json').then(r => (r.ok ? r.json() : null)).then(d => { area = d?.poligoni?.length ? proiettaPoligoni(d.poligoni) : null; }).catch(() => {});
  return areaCaricata;
}
const vuoteDelLato = km => {
  if (!area) return [];
  if (!celleVuote.has(km)) celleVuote.set(km, celleInArea(area, km));
  return celleVuote.get(km);
};
const testoRete = (p, mag) => (avvisoCompletezza(annoDi(p), annoDi(p), mag) ? t('terremoti.den.rete', { anno: ANNO_RETE_COMPLETA }) : '');
// Disegna gli esagoni di `eventi`; `classi` fisse = animazione (i colori non cambiano da una finestra all'altra)
function disegna({ eventi, periodo, mag, m, km, classi = null }) {
  const anniCivili = anniCiviliPeriodo(periodo);
  const g = grigliaEsagoni(eventi, km, m, vuoteDelLato(km), { durataAnni: durataAnni(periodo), anniCivili, classi: m === 'conteggio' ? classi : null });
  latoMostrato = km;
  popup?.remove();
  righe = g.righe;
  eventiMostrati = eventi;
  massimo = g.massimo;
  metricaMostrata = m;
  const testoMag = `M ≥ ${numero(mag, mag % 1 ? 1 : 0)}`;
  ultimo = { classi: g.classi, esagoniPerClasse: g.esagoniPerClasse, esagoniVuoti: g.esagoniVuoti, esagoniSempre: g.esagoniSempre, anniCivili, rete: testoRete(periodo, mag), nEventi: eventi.length, mag, km, metrica: m, massimo: g.massimo, periodo: `${etichettaPeriodo(periodo)} · ${testoMag}`, titolo: `${etichettaPeriodo(periodo)} · ${testoMag} · ${km} km` };
  mappa?.getSource(SRC)?.setData(g.geojson);
  scriviLegende();
  elenco?.aggiorna();
  document.dispatchEvent(new Event(EVENTO_TABELLA));
  document.dispatchEvent(new Event(EVENTO_STATO_CONDIVISO));
  return g;
}

async function carica({ periodo, mag }) {
  const mia = ++richiesta;
  const [{ eventi, troncato }] = await Promise.all([eventiPeriodo(periodo, mag), caricaArea()]);
  if (mia !== richiesta) return null;
  fermaAnimazione();
  const m = METRICHE[metrica.valore()] ?? 'conteggio';
  const km = lato.valore();
  carico = { eventi, periodo, mag, m, km, perAnno: null, classi: null };
  const g = disegna({ eventi, periodo, mag, m, km });
  scriviStatoAnimazione();
  return { n: eventi.length, troncato, testo: t('terremoti.den.nota', { celle: numero(g.righe.length), lato: km }) };
}

// — Animazione: finestra scorrevole di 1, 5 o 10 anni che avanza di un anno per passo, sugli eventi già caricati —
const FINESTRE = [1, 5, 10];
const VELOCITA = [1, 2, 4];
const PASSO_MS = 1200;
const annoUtc = ts => new Date(ts).getUTCFullYear();
const anim = { finestra: 5, velocita: 1, k: null, timer: 0 }; // k = indice della finestra mostrata (null = tutto il periodo)
let statoAnim = null;
let bottonePlay = null;

const anniDelCarico = () => (carico ? [annoUtc(carico.periodo.da), annoUtc(carico.periodo.a)] : null);
const numeroFinestre = () => { const a = anniDelCarico(); return a ? a[1] - a[0] + 1 - anim.finestra + 1 : 0; };
function scriviStatoAnimazione(testo = '') {
  if (!statoAnim) return;
  statoAnim.textContent = testo || (carico && numeroFinestre() < 1 ? t('terremoti.den.anim.corto', { n: anim.finestra }) : '');
}
function eventiDellAnno(anno) {
  if (!carico.perAnno) {
    carico.perAnno = new Map();
    for (const e of carico.eventi) { const a = annoUtc(e.ts); (carico.perAnno.get(a) ?? carico.perAnno.set(a, []).get(a)).push(e); }
  }
  return carico.perAnno.get(anno) ?? [];
}
function mostraFinestra(k) {
  const [primo] = anniDelCarico();
  const da = primo + k, a = da + anim.finestra - 1;
  const eventi = [];
  for (let y = da; y <= a; y++) eventi.push(...eventiDellAnno(y));
  if (carico.m === 'conteggio' && !carico.classi?.[anim.finestra]) (carico.classi ??= {})[anim.finestra] = classiAnimazione(carico.eventi, carico.km, anim.finestra);
  disegna({ eventi, periodo: { da: Date.UTC(da, 0, 1), a: Date.UTC(a + 1, 0, 1) - 1 }, mag: carico.mag, m: carico.m, km: carico.km, classi: carico.classi?.[anim.finestra] ?? null });
  anim.k = k;
  scriviStatoAnimazione(t('terremoti.den.anim.finestra', { da, a, k: k + 1, n: numeroFinestre() }));
}
function fermaAnimazione() {
  clearInterval(anim.timer);
  anim.timer = 0;
  anim.k = null;
  if (bottonePlay) bottonePlay.textContent = '▶';
}
function passoAnimazione(delta = 1) {
  if (!carico || numeroFinestre() < 1) { scriviStatoAnimazione(); return false; }
  const prossimo = anim.k == null ? (delta > 0 ? 0 : numeroFinestre() - 1) : anim.k + delta;
  if (prossimo < 0 || prossimo >= numeroFinestre()) return false;
  mostraFinestra(prossimo);
  return true;
}
function pausa() {
  clearInterval(anim.timer);
  anim.timer = 0;
  if (bottonePlay) bottonePlay.textContent = '▶';
}
function avviaAnimazione() {
  if (!carico) { scriviStatoAnimazione(t('terremoti.den.anim.prima')); return; }
  if (anim.k == null || anim.k >= numeroFinestre() - 1) { if (!passoAnimazione(0) && numeroFinestre() < 1) return; mostraFinestra(0); }
  bottonePlay.textContent = '⏸';
  anim.timer = setInterval(() => { if (!passoAnimazione(1)) pausa(); }, PASSO_MS / anim.velocita);
}
function resetAnimazione() {
  pausa();
  if (!carico) return;
  anim.k = null;
  disegna({ eventi: carico.eventi, periodo: carico.periodo, mag: carico.mag, m: carico.m, km: carico.km });
  scriviStatoAnimazione();
}

function creaAnimazione() {
  const sel = (etichetta, valori, predefinito, testo, alCambio) => {
    const lab = el('label', 'terremoti-filtro');
    const s = el('select');
    for (const v of valori) { const o = el('option', null, testo(v)); o.value = String(v); s.append(o); }
    s.value = String(predefinito);
    s.addEventListener('change', () => alCambio(Number(s.value)));
    lab.append(el('span', null, etichetta), s);
    return lab;
  };
  const filtri = el('div', 'terremoti-filtri');
  filtri.append(
    sel(t('terremoti.den.anim.finestraEtichetta'), FINESTRE, anim.finestra, n => t('terremoti.den.anim.anni', { n }), n => { const attiva = anim.k != null; pausa(); anim.finestra = n; anim.k = null; scriviStatoAnimazione(); if (attiva && carico) resetAnimazione(); }),
    sel(t('terremoti.den.anim.velocitaEtichetta'), VELOCITA, anim.velocita, n => `${n}×`, n => { anim.velocita = n; if (anim.timer) { pausa(); avviaAnimazione(); } }),
  );
  const comandi = el('div', 'terremoti-anim-comandi');
  const bottone = (testo, titolo, azione) => {
    const b = el('button', 'terremoti-archivio-btn secondario', testo);
    b.type = 'button'; b.title = titolo; b.setAttribute('aria-label', titolo);
    b.addEventListener('click', azione);
    return b;
  };
  bottonePlay = bottone('▶', t('terremoti.den.anim.avvia'), () => { if (anim.timer) pausa(); else avviaAnimazione(); });
  comandi.append(
    bottone('⏮', t('terremoti.den.anim.reset'), resetAnimazione),
    bottone('◀', t('terremoti.den.anim.indietro'), () => { pausa(); if (carico) passoAnimazione(-1); else scriviStatoAnimazione(t('terremoti.den.anim.prima')); }),
    bottonePlay,
    bottone('▶|', t('terremoti.den.anim.avanti'), () => { pausa(); if (carico) passoAnimazione(1); else scriviStatoAnimazione(t('terremoti.den.anim.prima')); }),
  );
  statoAnim = el('p', 'uffici-nota');
  statoAnim.setAttribute('role', 'status');
  const nodo = el('div', 'terremoti-esporta');
  nodo.append(el('strong', null, t('terremoti.den.anim.titolo')), filtri, comandi, statoAnim);
  return nodo;
}

// Voci di legenda per la stampa: stesso contenuto della legenda in mappa
function datiStampa() {
  const u = ultimo;
  const voci = [];
  if (u.metrica !== 'magMax') {
    if (u.esagoniVuoti > 0) voci.push({ colore: COLORE_VUOTO, opacita: 0.5, testo: `0 ${t('terremoti.den.eventi')} · ${t('terremoti.den.nEsagoni', { n: numero(u.esagoniVuoti) })}` });
    u.classi.forEach((c, i) => voci.push({ ...stileClasse(i, u.classi.length), testo: `${etichettaClasse(c)} · ${t('terremoti.den.nEsagoni', { n: numero(u.esagoniPerClasse[i]) })}` }));
  }
  if (sempre?.checked && u.anniCivili > 1) voci.push({ bordo: COLORE_SEMPRE, testo: t('terremoti.den.sempreLegenda', { anni: u.anniCivili, n: numero(u.esagoniSempre) }) });
  return {
    titolo: t('terremoti.den.stampa.titolo'),
    sottotitolo: t('terremoti.den.stampa.sottotitolo', { n: numero(u.nEventi), periodo: u.periodo, lato: u.km }),
    legendaTitolo: t('terremoti.den.titolo'),
    voci,
    rampa: u.metrica === 'magMax' ? { colori: RAMPA_COLORI, testo: u.massimo > 0 ? `0 – ${numero(u.massimo, 1)}` : '' } : null,
    comeLeggerlaTitolo: t('terremoti.den.stampa.comeLeggerlaTitolo'),
    comeLeggerla: t('terremoti.den.stampa.comeLeggerla', { lato: u.km }),
    creditiTitolo: t('terremoti.den.stampa.creditiTitolo'),
    crediti: t('terremoti.den.stampa.crediti') + (u.rete ? ` ${u.rete}` : ''),
  };
}

// Controlli dell'esportazione: formato di pagina, orientamento, tipo di file e pulsante
function creaEsportazione() {
  const sel = (etichetta, opzioni, predefinito) => {
    const lab = el('label', 'terremoti-filtro');
    const s = el('select');
    for (const [v, testo] of opzioni) { const o = el('option', null, testo); o.value = v; s.append(o); }
    s.value = predefinito;
    lab.append(el('span', null, etichetta), s);
    return { nodo: lab, valore: () => s.value };
  };
  const formato = sel(t('terremoti.den.stampa.formato'), ['A4', 'A3', 'A2', 'A1', 'A0'].map(f => [f, f]), 'A3');
  const direzione = sel(t('terremoti.den.stampa.orientamento'), [['portrait', t('terremoti.den.stampa.verticale')], ['landscape', t('terremoti.den.stampa.orizzontale')]], 'portrait');
  const uscita = sel(t('terremoti.den.stampa.file'), [['png', 'PNG'], ['pdf', 'PDF']], 'png');
  const nodo = el('div', 'terremoti-esporta');
  const filtri = el('div', 'terremoti-filtri');
  filtri.append(formato.nodo, direzione.nodo, uscita.nodo);
  const bottone = el('button', 'terremoti-archivio-btn secondario', t('terremoti.den.stampa.esporta'));
  bottone.type = 'button';
  const messaggio = el('p', 'uffici-nota');
  bottone.addEventListener('click', async () => {
    if (!mappa || !ultimo.periodo) { messaggio.textContent = t('terremoti.den.stampa.prima'); return; }
    bottone.disabled = true;
    messaggio.textContent = t('terremoti.den.stampa.inCorso');
    const { esportaEsagoni } = await import('../core/stampa-esagoni.js');
    const ok = await esportaEsagoni(mappa, { uscita: uscita.valore(), formato: formato.valore(), direzione: direzione.valore(), dati: datiStampa() });
    messaggio.textContent = ok ? t('terremoti.den.stampa.fatto') : t('terremoti.den.stampa.errore');
    bottone.disabled = false;
  });
  nodo.append(el('strong', null, t('terremoti.den.stampa.titoloBlocco')), filtri, bottone, messaggio);
  return nodo;
}

// MapLibre rende i null delle proprietà come testo «null»
const valore = v => (v == null || v === 'null' || v === '' ? null : Number(v));
const data = ts => new Date(ts).toLocaleDateString(localeIntl(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Rome' });
const EVENTI_SCHEDA = 5;

// Contenuto del popup di un esagono: conteggio, periodo, i cinque eventi più forti e «Mostra i punti di questa cella»
function schedaCella(p) {
  const eventi = eventiInCella(eventiMostrati, p.id, latoMostrato).sort((a, b) => b.mag - a.mag || b.ts - a.ts);
  const nodo = el('div', 'esagono-scheda');
  nodo.append(el('strong', null, t('terremoti.den.tooltipN', { n: numero(Number(p.n)) })), el('small', 'terremoti-periodo-nota', ultimo.periodo));
  const elenco = el('ol', 'esagono-eventi');
  for (const e of eventi.slice(0, EVENTI_SCHEDA)) {
    const riga = el('li');
    riga.append(badgeMagnitudo(e.mag, `M ${numero(e.mag, 1)}`), el('span', null, `${e.luogo || t('terremoti.zonaSconosciuta')} · ${data(e.ts)}`));
    elenco.append(riga);
  }
  nodo.append(elenco);
  if (eventi.length > EVENTI_SCHEDA) nodo.append(el('small', 'uffici-nota', t('terremoti.den.altri', { n: numero(eventi.length - EVENTI_SCHEDA) })));
  const bottone = el('button', 'terremoti-archivio-btn', t('terremoti.den.mostraPunti'));
  bottone.type = 'button';
  bottone.addEventListener('click', () => { popup?.remove(); evidenziaEventi(mappa, eventi); });
  nodo.append(bottone);
  return nodo;
}

function creaPannello() {
  metrica = scelta(t('terremoti.den.misura'), [0, 2, 1], 0, v => t(['terremoti.den.conteggio', 'terremoti.den.magMax', 'terremoti.den.tasso'][v]));
  const casella = el('label', 'terremoti-filtro terremoti-casella');
  sempre = el('input');
  sempre.type = 'checkbox';
  sempre.addEventListener('change', () => { applicaSempre(); ultimo.titolo && scriviLegende(); });
  casella.append(sempre, el('span', null, t('terremoti.den.sempre')));
  lato = scelta(t('terremoti.den.lato'), LATI_KM, LATO_PREDEFINITO_KM, v => `${v} km`);
  elenco = elencoEventi(() => eventiMostrati, () => mappa);
  legenda = legendaMappa('terremoti-densita', t('terremoti.den.titolo'), [legendaEsagoni()]);
  const preset = [
    { id: 'ultimo', etichetta: t('terremoti.den.preset.ultimo'), periodo: ora => periodoUltimiAnni(1, ora) },
    ...[5, 10, 20].map(n => ({ id: String(n), etichetta: t('terremoti.den.preset.anni', { n }), periodo: ora => periodoUltimiAnni(n, ora) })),
    { id: 'tutto', etichetta: t('terremoti.den.preset.tutto'), periodo: ora => periodoTuttoArchivio(ora) },
  ];
  pannello = pannelloPeriodo({ titolo: t('terremoti.den.titolo'), extra: [metrica, lato, { nodo: casella }], alMostra: carica, ancora: [legendaEsagoni(), creaAnimazione(), creaEsportazione(), elenco.nodo], minGiorni: DURATA_MINIMA_GIORNI, preset, avviso: testoRete, magPredefinita: 2 });
}

export const nodoMappa = () => pannello?.nodo ?? null;

// Stato per il link condiviso (periodo, magnitudo, lato, misura) e ripristino da link
const statoCondiviso = () => {
  if (!acceso || primaVolta || !pannello) return null;
  const { periodo, mag } = pannello.stato();
  return { periodo, mag, lato: lato.valore(), metrica: metrica.valore() };
};
async function impostaCondiviso(s) {
  if (!pannello) return;
  primaVolta = false;
  metrica.imposta(s.metrica);
  lato.imposta(s.lato);
  pannello.imposta({ periodo: s.periodo, mag: s.mag });
  pannello.mostra();
}

export default {
  id: 'terremoti-densita',
  titolo: 'Densità terremoti',
  gruppo: 'terremoti-gruppo',
  senzaIntestazione: true,
  sezione: 'Densità terremoti',
  sezioniFisse: true,
  argomento: { titolo: 'Densità terremoti', descrizione: 'I terremoti di un anno o di un periodo dell\'archivio INGV raccolti in celle esagonali, colorate per numero di eventi o per magnitudo massima: utile dove i cerchi si sovrappongono.' },
  aggiungiSorgenti(map) {
    map.addSource(SRC, { type: 'geojson', data: VUOTO, attribution: '<a href="https://terremoti.ingv.it/" target="_blank" rel="noopener">INGV</a>' });
  },
  aggiungiLayer(map) {
    mappa = map;
    map.addLayer({ id: CELLE, type: 'fill', source: SRC, layout: { visibility: 'none' }, paint: { 'fill-color': ['get', 'colore'], 'fill-opacity': ['get', 'opacita'], 'fill-outline-color': 'rgba(15, 23, 42, .25)' } });
    map.addLayer({ id: SEMPRE, type: 'line', source: SRC, filter: NESSUNO, layout: { visibility: 'none', 'line-join': 'round' }, paint: { 'line-color': COLORE_SEMPRE, 'line-width': 2.2 } });
    registraTooltipStrati(map, [{
      layers: [CELLE], icona: 'terremoto', sezione: 'Densità terremoti', colore: p => p.colore,
      modello: p => {
        const n = Number(p.n), mag = valore(p.magMax), prof = valore(p.profMedia), ultima = valore(p.tsUltimo), forte = valore(p.tsForte);
        if (!n) return { titolo: t('terremoti.den.tooltipZero'), elenco: [{ testo: ultimo.periodo }] };
        return {
          titolo: t('terremoti.den.tooltipN', { n: numero(n) }),
          elenco: [
            { testo: ultimo.periodo },
            ...(mag != null ? [{ testo: t('terremoti.den.tooltipMag', { mag: numero(mag, 1) }) + (forte != null ? ` · ${data(forte)}` : '') }] : []),
            ...(ultima != null ? [{ testo: t('terremoti.den.tooltipUltimo', { data: data(ultima) }) }] : []),
            ...(prof != null ? [{ testo: t('terremoti.den.tooltipProf', { prof: numero(prof) }) }] : []),
            ...(ultimo.anniCivili > 1 && valore(p.anniAttivi) != null ? [{ testo: t('terremoti.den.tooltipAnni', { k: numero(valore(p.anniAttivi)), anni: ultimo.anniCivili }) }] : []),
          ],
        };
      },
    }]);
    // Clic su un esagono: gli eventi principali e il pulsante che li mette in evidenza sulla mappa
    map.on('click', CELLE, ev => {
      const p = ev.features?.[0]?.properties;
      if (!p || !Number(p.n)) return;
      popup?.remove();
      popup = new maplibregl.Popup({ maxWidth: '320px', className: 'esagono-popup' }).setLngLat(ev.lngLat).setDOMContent(schedaCella(p)).addTo(map);
    });
    // il clic su un esagono con eventi è del popup: la scheda del luogo non si apre sopra
    intercettaClic(e => acceso && map.queryRenderedFeatures(e.point, { layers: [CELLE] }).some(f => Number(f.properties.n) > 0));
    map.on('mouseenter', CELLE, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', CELLE, () => { map.getCanvas().style.cursor = ''; });
  },
  strati: [{
    id: 'terremoti-densita', etichetta: 'Densità terremoti (esagoni)', layers: [CELLE, SEMPRE], attivo: false, legendaPannello: '.lg-terremoti-densita',
    suCambio(attivo) {
      acceso = attivo;
      if (!attivo) pausa();
      if (legenda) legenda.hidden = !attivo;
      if (attivo && primaVolta && pannello) { primaVolta = false; pannello.mostra(); }
      document.dispatchEvent(new Event(EVENTO_TABELLA));
    },
  }],
  tabella: {
    id: 'terremoti-densita',
    etichetta: t('tabella.layer.terremotiDensita'),
    fonte: t('tabella.fonte.ingvAggregato'),
    licenza: 'CC BY 4.0',
    colonne: () => [
      { id: 'cella', etichetta: t('tabella.col.cella'), valore: p => p.id, testo: p => p.id, visibile: false },
      { id: 'n', etichetta: t('tabella.col.eventi'), valore: p => p.n, testo: p => numero(p.n), visibile: true, numerica: true },
      { id: 'magMax', etichetta: t('tabella.col.magMax'), valore: p => p.magMax, testo: p => numero(p.magMax, 1), visibile: true, numerica: true },
      { id: 'profMedia', etichetta: t('tabella.col.profMedia'), valore: p => p.profMedia, testo: p => (p.profMedia == null ? '—' : numero(p.profMedia, 1)), visibile: true, numerica: true },
      { id: 'lat', etichetta: t('tabella.col.lat'), valore: p => p.lat, testo: p => numero(p.lat, 4), visibile: true, numerica: true },
      { id: 'lon', etichetta: t('tabella.col.lon'), valore: p => p.lon, testo: p => numero(p.lon, 4), visibile: true, numerica: true },
    ],
    righe: () => righe,
    attivo: () => acceso,
    apri: p => mappa?.flyTo({ center: [p.lon, p.lat], zoom: Math.max(mappa.getZoom(), 8) }),
  },
  statoCondiviso,
  impostaCondiviso,
  pannello: creaPannello,
};
