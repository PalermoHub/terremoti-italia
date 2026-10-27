// Pannello della legenda dello strato «Terremoti storici»: sceglie l'anno da mostrare in mappa e confronta due anni.
// Il confronto usa GET /terremoti/riepilogo (conteggi aggregati dal server), non gli eventi in mappa: resta corretto oltre il tetto di eventi della mappa.
import { t, localeIntl } from '../core/i18n.js';
import { CLASSI_MAG, PROFONDITA } from './scheda-terremoti.js';
import { ANNO_INIZIO, periodoAnno, periodoValido, avvisoCompletezza, confrontaPeriodi, giorniPeriodo, scaricaRiepilogo, riepilogoDaEventi, serieAnnuale, grigliaDensita } from './scheda-archivio.js';

const MAGNITUDO_ARCHIVIO = [2, 2.5, 3, 4, 5];
const MAG_PREDEFINITA = 3; // a M ≥ 2 anni come il 2016 superano il tetto di eventi della mappa
const nomeClasse = c => (c.a === Infinity ? `≥ ${c.da}` : `${c.da}–${c.a}`);

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

function scelta(etichetta, valori, predefinito, testoValore = String) {
  const lab = el('label', 'terremoti-filtro');
  const sel = el('select');
  for (const v of valori) {
    const o = el('option', null, testoValore(v));
    o.value = String(v);
    sel.append(o);
  }
  sel.value = String(predefinito);
  lab.append(el('span', null, etichetta), sel);
  return { nodo: lab, valore: () => Number(sel.value) };
}

// Scelta della classe di profondità: valore = { chiave, min, max } (min/max null = nessun limite)
function sceltaProfondita(etichetta, predefinito = 0) {
  const lab = el('label', 'terremoti-filtro');
  const sel = el('select');
  PROFONDITA.forEach((p, i) => {
    const o = el('option', null, t(`terremoti.arc.prof.${p.chiave}`));
    o.value = String(i);
    sel.append(o);
  });
  sel.value = String(predefinito);
  lab.append(el('span', null, etichetta), sel);
  return { nodo: lab, valore: () => PROFONDITA[Number(sel.value)] ?? PROFONDITA[0] };
}

const numero = (n, d = 0) => n.toLocaleString(localeIntl(), { minimumFractionDigits: d, maximumFractionDigits: d });
// Magnitudo nelle etichette: «2» e «2,5» in italiano, mai «2.5»
const magnitudo = m => m.toLocaleString(localeIntl(), { maximumFractionDigits: 1 });

// Stato di un pannello: bottoni occupati durante lo scarico e, se l'archivio non risponde, errore con «Riprova»
function stato() {
  const messaggio = el('p', 'uffici-nota');
  messaggio.setAttribute('role', 'status');
  const esegui = async (nodo, azione, riprova) => {
    const bottoni = nodo.querySelectorAll('button');
    bottoni.forEach(b => { b.disabled = true; });
    messaggio.textContent = '';
    try { await azione(); } catch {
      messaggio.textContent = t('terremoti.arc.errore');
      const b = el('button', 'terremoti-archivio-btn secondario', t('terremoti.arc.riprova'));
      b.type = 'button';
      b.addEventListener('click', riprova);
      messaggio.append(' ', b);
    } finally { nodo.querySelectorAll('button').forEach(x => { x.disabled = false; }); }
  };
  return { messaggio, esegui };
}

const anniArchivio = () => {
  const adesso = new Date().getUTCFullYear();
  return { adesso, anni: Array.from({ length: adesso - ANNO_INIZIO + 1 }, (_, i) => adesso - i) };
};
const giorno = ts => new Date(ts).toLocaleDateString(localeIntl(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Strato «Terremoti storici»: `carica(periodo, magMin, profondita)` mostra l'anno in mappa e risponde { n, troncato } (null se superata da una richiesta più recente)
export function pannelloArchivio({ carica, annoIniziale, magIniziale = MAG_PREDEFINITA }) {
  const nodo = el('div', 'terremoti-pannello terremoti-archivio');
  const { adesso, anni } = anniArchivio();
  const { messaggio, esegui } = stato();
  const annoMappa = scelta(t('terremoti.arc.anno'), anni, annoIniziale ?? adesso - 1);
  const magMappa = scelta(t('terremoti.arc.magMin'), MAGNITUDO_ARCHIVIO, magIniziale, m => `≥ ${magnitudo(m)}`);
  const profMappa = sceltaProfondita(t('terremoti.arc.prof'));
  const mostra = el('button', 'terremoti-archivio-btn', t('terremoti.arc.mostraBtn'));
  mostra.type = 'button';
  const nota = el('p', 'uffici-nota');
  const vaiMostra = () => {
    const p = periodoAnno(annoMappa.valore());
    const errore = periodoValido(p);
    if (errore) { messaggio.textContent = t(errore); return; }
    const mag = magMappa.valore();
    const prof = profMappa.valore();
    esegui(nodo, async () => {
      const r = await carica(p, mag, prof);
      if (!r) return;
      const base = t(prof.chiave === 'tutte' ? 'terremoti.arc.nota' : 'terremoti.arc.notaProf', { n: r.n, da: giorno(p.da), a: giorno(p.a), mag: magnitudo(mag), prof: t(`terremoti.arc.prof.${prof.chiave}`) });
      nota.textContent = r.n
        ? [base, r.troncato ? t('terremoti.troncato', { n: r.n }) : ''].filter(Boolean).join(' ')
        : t('terremoti.arc.nessunEvento');
    }, vaiMostra);
  };
  mostra.addEventListener('click', vaiMostra);
  const filtri = el('div', 'terremoti-filtri');
  filtri.append(annoMappa.nodo, magMappa.nodo, profMappa.nodo);
  nodo.append(el('strong', null, t('terremoti.arc.mostra')), filtri, mostra, nota, messaggio, el('p', 'uffici-nota', t('terremoti.arc.utc')));
  return { nodo, mostra: vaiMostra };
}

// Riepiloghi dell'intera storia per magnitudo minima: il grafico degli anni li carica una volta e li tiene per la sessione.
const riepiloghiStorici = new Map();
function riepilogoStorico(magMin) {
  if (!riepiloghiStorici.has(magMin)) {
    const promessa = scaricaRiepilogo({ da: periodoAnno(ANNO_INIZIO).da, a: Date.now() }, magMin).catch(e => {
      riepiloghiStorici.delete(magMin);
      throw e;
    });
    riepiloghiStorici.set(magMin, promessa);
  }
  return riepiloghiStorici.get(magMin);
}

// Strato «Confronto»: `carica(periodoA, periodoB, magMin, area, profondita)` mette in mappa gli eventi dei due anni e risponde { a, b } con { n, troncato, eventi } (null se superata).
// `territorio` (opzionale, da creaFiltroTerritorio) restringe entrambi gli anni allo stesso territorio; magnitudo e profondità
// possono restringerlo ancora: con un territorio o una profondità i conteggi vengono da tutti gli eventi, non dal riepilogo del server.
// `griglia` (opzionale) riceve la differenza di densità in celle esagonali da mostrare in mappa, o null per toglierla.
export function pannelloConfronto({ carica, territorio = null, griglia = null }) {
  const nodo = el('div', 'terremoti-pannello terremoti-archivio');
  const { adesso, anni } = anniArchivio();
  const ora = Date.now(); // `adesso` è l'anno per i menu; i grafici vogliono il momento
  const { messaggio, esegui } = stato();
  const annoA = scelta(t('terremoti.arc.periodoA'), anni, adesso - 2);
  const annoB = scelta(t('terremoti.arc.periodoB'), anni, adesso - 1);
  const mag = scelta(t('terremoti.arc.magMin'), MAGNITUDO_ARCHIVIO, MAG_PREDEFINITA, m => `≥ ${magnitudo(m)}`);
  const prof = sceltaProfondita(t('terremoti.arc.prof'));
  const confronta = el('button', 'terremoti-archivio-btn', t('terremoti.arc.confronta'));
  confronta.type = 'button';
  const nota = el('p', 'uffici-nota');
  const esito = el('div', 'terremoti-archivio-esito');
  // Differenza di densità in mappa: spenta all'inizio, si accende dopo il primo confronto
  const casella = el('label', 'terremoti-archivio-griglia');
  const interruttore = el('input');
  interruttore.type = 'checkbox';
  interruttore.disabled = true;
  casella.append(interruttore, el('span', null, t('terremoti.arc.griglia')));
  const notaGriglia = el('p', 'uffici-nota');
  notaGriglia.textContent = t('terremoti.arc.grigliaNota');
  notaGriglia.hidden = true;
  let ultimo = null;
  const disegnaGriglia = () => {
    if (!griglia) return;
    griglia(interruttore.checked && ultimo ? grigliaDensita(ultimo.a, ultimo.b) : null);
    notaGriglia.hidden = !(interruttore.checked && ultimo);
  };
  interruttore.addEventListener('change', disegnaGriglia);
  const vaiConfronta = () => {
    const pa = periodoAnno(annoA.valore()), pb = periodoAnno(annoB.valore());
    const m = mag.valore();
    const p = prof.valore();
    ultimo = null;
    interruttore.disabled = true;
    if (griglia) { griglia(null); notaGriglia.hidden = true; }
    esegui(nodo, async () => {
      let area = null;
      if (territorio?.attivo()) {
        try { area = await territorio.prepara(); } catch { messaggio.textContent = t('terremoti.arc.territorioErrore'); }
      }
      // con un territorio o una profondità scelta i conteggi vengono da tutti gli eventi (oltre il tetto della mappa);
      // senza, dal riepilogo del server (esatto anche oltre il tetto) e dagli eventi in mappa, insieme.
      const conEventi = Boolean(area) || p.min != null;
      const [ra, rb, mappa] = conEventi
        ? await carica(pa, pb, m, area, p).then(r => [r && riepilogoDaEventi(r.a.eventi), r && riepilogoDaEventi(r.b.eventi), r])
        : await Promise.all([scaricaRiepilogo(pa, m), scaricaRiepilogo(pb, m), carica(pa, pb, m, null, p)]);
      if (!mappa) return;
      ultimo = { a: mappa.a.eventi, b: mappa.b.eventi };
      interruttore.disabled = false;
      // Le condizioni scritte sopra la tabella: senza, un confronto copiato o fotografato non dice a quali dati si riferisce
      const condizioni = t(area ? 'terremoti.arc.condizioniTerritorio' : 'terremoti.arc.condizioni', { mag: magnitudo(m), prof: t(`terremoti.arc.prof.${p.chiave}`) });
      const avviso = avvisoCompletezza(annoA.valore(), annoB.valore(), m);
      const c = confrontaPeriodi(ra, rb, giorniPeriodo(pa), giorniPeriodo(pb));
      const grafici = el('div', 'terremoti-confronto-grafici');
      const cumulata = graficoCumulata(c, annoA.valore(), annoB.valore(), ora);
      if (cumulata) grafici.append(cumulata);
      esito.replaceChildren(...disegnaConfronto(c, annoA.valore(), annoB.valore(), adesso, condizioni, avviso, grafici));
      nota.textContent = mappa.a.troncato || mappa.b.troncato ? t('terremoti.arc.troncatoConfronto', { n: Math.max(mappa.a.n, mappa.b.n) }) : '';
      disegnaGriglia();
      // il grafico degli anni arriva dopo la tabella, così il confronto non aspetta una seconda richiesta
      riepilogoStorico(m).then(storico => {
        const grafico = graficoAnni(serieAnnuale(storico.perMese, ora), annoA.valore(), annoB.valore(), m);
        if (grafico) grafici.prepend(grafico);
      }).catch(() => { /* il grafico storico è un di più: senza, la tabella resta */ });
    }, vaiConfronta);
  };
  confronta.addEventListener('click', vaiConfronta);
  const filtri = el('div', 'terremoti-filtri');
  filtri.append(annoA.nodo, annoB.nodo, mag.nodo, prof.nodo);
  if (territorio) filtri.append(territorio.nodo);
  nodo.append(el('strong', null, t('terremoti.arc.confrontaTitolo')), filtri, confronta);
  if (griglia) nodo.append(casella, notaGriglia);
  nodo.append(nota, messaggio, esito, el('p', 'uffici-nota', t('terremoti.arc.utc')));
  return { nodo, confronta: vaiConfronta };
}

// Differenza con segno; un valore che arrotondato è zero si scrive «0», mai «-0.0»
const segno = (n, d = 0) => {
  const r = Number(n.toFixed(d));
  return `${r > 0 ? '+' : ''}${numero(r === 0 ? 0 : r, d)}`;
};

const APICI = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
// Energia come somma dei momenti sismici (N·m): cresce di ~32 volte per unità di magnitudo, quindi la dominano i terremoti forti
const energiaTesto = j => {
  if (!j) return '–';
  const esponente = Math.floor(Math.log10(j));
  return `${numero(j / 10 ** esponente, 1)} × 10${String(esponente).split('').map(c => APICI[c] ?? c).join('')}`;
};

const meseBreve = mese => new Date(`${mese}-01T00:00:00Z`).toLocaleDateString(localeIntl(), { month: 'short', timeZone: 'UTC' });
// Quanto pesa il mese più attivo: se pesa molto, il conteggio dell'anno è trascinato dalle repliche di una sequenza
const meseTesto = m => (m ? `${meseBreve(m.mese)} · ${numero(m.quota, m.quota < 10 ? 1 : 0)}%` : '–');
const titoloMese = m => (m ? `${meseBreve(m.mese)} ${m.mese.slice(0, 4)}: ${numero(m.n)}` : null);

// Tabella dei due anni e due istogrammi affiancati per classe di magnitudo (stessa scala).
// `condizioni` (magnitudo minima, profondità, territorio) e `avviso` (completezza del catalogo) sono le due righe sopra la tabella.
export function disegnaConfronto(c, annoA, annoB, annoCorrente, condizioni = null, avviso = null, grafici = null) {
  if (!c.a.n && !c.b.n) return [el('p', 'uffici-nota', t('terremoti.arc.nessunEvento'))];
  const elementi = [];
  if (condizioni) elementi.push(el('p', 'uffici-nota', condizioni));
  if (avviso) elementi.push(el('p', 'uffici-nota terremoti-archivio-avviso', t(avviso)));
  const tabella = el('table', 'terremoti-archivio-tabella');
  const nome = anno => (anno === annoCorrente ? `${anno} (${t('terremoti.arc.parziale')})` : String(anno));
  const riga = (etichetta, a, b, d, titoloA = null, titoloB = null) => {
    const tr = el('tr');
    const cellaA = el('td', null, a), cellaB = el('td', null, b);
    if (titoloA) cellaA.title = titoloA;
    if (titoloB) cellaB.title = titoloB;
    tr.append(el('th', null, etichetta), cellaA, cellaB, el('td', null, d));
    return tr;
  };
  const intestazione = el('tr');
  intestazione.append(el('th'), el('th', null, nome(annoA)), el('th', null, nome(annoB)), el('th', null, t('terremoti.arc.differenza')));
  const dif = c.differenza;
  const magTesto = m => (m == null ? '–' : numero(m, 1));
  tabella.append(
    intestazione,
    riga(t('terremoti.arc.eventi'), numero(c.a.n), numero(c.b.n), dif.nPercento == null ? segno(dif.n) : `${segno(dif.n)} (${segno(dif.nPercento)}%)`),
    riga(t('terremoti.arc.alGiorno'), numero(c.a.perGiorno, 2), numero(c.b.perGiorno, 2), dif.perGiorno == null ? '–' : segno(dif.perGiorno, 2)),
    riga(t('terremoti.arc.magMax'), magTesto(c.a.magMax), magTesto(c.b.magMax), dif.magMax == null ? '–' : segno(dif.magMax, 1)),
    riga(t('terremoti.arc.magEquivalente'), magTesto(c.a.magEquivalente), magTesto(c.b.magEquivalente), dif.magEquivalente == null ? '–' : segno(dif.magEquivalente, 1)),
    riga(t('terremoti.arc.energia'), energiaTesto(c.a.energia), energiaTesto(c.b.energia), dif.energia == null ? '–' : `×${numero(dif.energia, 1)}`),
    riga(t('terremoti.arc.meseMax'), meseTesto(c.a.meseMax), meseTesto(c.b.meseMax), '–', titoloMese(c.a.meseMax), titoloMese(c.b.meseMax)),
  );
  const max = Math.max(1, ...c.a.perClasse, ...c.b.perClasse);
  const istogramma = el('div', 'terremoti-archivio-istogramma');
  CLASSI_MAG.forEach((classe, i) => {
    const gruppo = el('div');
    const barre = el('div', 'terremoti-archivio-barre');
    for (const [lato, anno, n] of [['a', annoA, c.a.perClasse[i]], ['b', annoB, c.b.perClasse[i]]]) {
      const b = el('i', `terremoti-archivio-${lato}`);
      b.style.height = `${n ? Math.max(4, n / max * 100) : 0}%`;
      b.title = `${anno}: ${numero(n)}`;
      barre.append(b);
    }
    gruppo.append(barre, el('span', null, nomeClasse(classe)));
    istogramma.append(gruppo);
  });
  elementi.push(tabella);
  if (dif.energia != null) elementi.push(el('p', 'uffici-nota', t('terremoti.arc.rapporto')));
  elementi.push(el('p', 'uffici-nota', t('terremoti.arc.lettura')));
  if (grafici) elementi.push(grafici);
  elementi.push(el('p', 'uffici-nota', t('terremoti.arc.classi')), istogramma);
  return elementi;
}

// ---- Grafici del confronto (SVG disegnato a mano, come il resto dell'app: nessuna libreria) ----
const SVG_NS = 'http://www.w3.org/2000/svg';
const COLORE_A = '#0ea5e9';
const COLORE_B = '#f97316';

function nodoSvg(tag, attributi = {}) {
  const nodo = document.createElementNS(SVG_NS, tag);
  for (const [chiave, valore] of Object.entries(attributi)) nodo.setAttribute(chiave, valore);
  return nodo;
}
function testoSvg(x, y, testo, attributi = {}) {
  const nodo = nodoSvg('text', { x, y, ...attributi });
  nodo.textContent = testo;
  return nodo;
}
const compatto = n => (n >= 1000 ? `${n / 1000}k` : String(n));
const meseCorto = m => new Date(Date.UTC(2020, m - 1, 1)).toLocaleDateString(localeIntl(), { month: 'short', timeZone: 'UTC' });

// Barre degli eventi per anno dal 1985 (scala logaritmica) e linea della magnitudo massima; gli anni A e B sono colorati.
function graficoAnni(serie, annoA, annoB, magMin) {
  const barre = serie.barre;
  const massimo = Math.max(0, ...barre.map(b => b.n));
  if (!massimo) return null;
  const L = 400, A = 172, MS = 32, MD = 26, MA = 10, MB = 26;
  const sinistra = MS, destra = L - MD, alto = MA, basso = A - MB;
  const logMax = Math.log10(massimo);
  const yConteggio = n => (n <= 0 ? basso : basso - Math.log10(n) / logMax * (basso - alto));
  const yMagnitudo = m => basso - Math.min(5, Math.max(0, m - 2)) / 5 * (basso - alto);
  const svg = nodoSvg('svg', { viewBox: `0 0 ${L} ${A}`, role: 'img', 'aria-label': t('terremoti.arc.graficoAnni') });
  for (let k = 0; 10 ** k <= massimo; k++) {
    const y = yConteggio(10 ** k);
    svg.append(nodoSvg('line', { x1: sinistra, x2: destra, y1: y, y2: y, class: 'griglia' }));
    svg.append(testoSvg(sinistra - 3, y + 3, compatto(10 ** k), { 'text-anchor': 'end' }));
  }
  const passo = (destra - sinistra) / barre.length;
  const larghezza = Math.max(2, passo * 0.68);
  const centro = i => sinistra + passo * i + passo / 2;
  barre.forEach((b, i) => {
    const anno = new Date(b.da).getFullYear();
    const classe = anno === annoA ? 'barra-a' : anno === annoB ? 'barra-b' : 'barra-anno';
    const y = yConteggio(b.n);
    const rett = nodoSvg('rect', { x: centro(i) - larghezza / 2, y, width: larghezza, height: Math.max(0, basso - y), class: classe });
    rett.append(nodoSvg('title', {}, `${anno}: ${numero(b.n)} · ${t('terremoti.arc.magMax')} ${b.magMax == null ? '–' : numero(b.magMax, 1)}`));
    svg.append(rett);
  });
  const punti = barre.map((b, i) => (b.magMax == null ? null : [centro(i), yMagnitudo(b.magMax)])).filter(Boolean);
  if (punti.length > 1) svg.append(nodoSvg('polyline', { points: punti.map(p => p.join(',')).join(' '), class: 'linea-mag' }));
  barre.forEach((b, i) => {
    if (b.magMax == null) return;
    const punto = nodoSvg('circle', { cx: centro(i), cy: yMagnitudo(b.magMax), r: 1.7, class: 'punto-mag' });
    punto.append(nodoSvg('title', {}, `${new Date(b.da).getFullYear()}: ${t('terremoti.arc.magMax')} ${numero(b.magMax, 1)}`));
    svg.append(punto);
  });
  // Anni A e B sempre scritti; le tacche ogni 5 anni solo se non finiscono addosso a loro
  const etichette = new Set([annoA, annoB]);
  barre.forEach(b => {
    const anno = new Date(b.da).getFullYear();
    if (anno % 5 === 0 && Math.abs(anno - annoA) > 2 && Math.abs(anno - annoB) > 2) etichette.add(anno);
  });
  for (const anno of etichette) {
    const i = anno - ANNO_INIZIO;
    if (i >= 0 && i < barre.length) svg.append(testoSvg(centro(i), A - 6, String(anno)));
  }
  for (const m of [3, 5, 7]) svg.append(testoSvg(destra + 3, yMagnitudo(m) + 3, String(m), { 'text-anchor': 'start' }));
  svg.append(nodoSvg('line', { x1: sinistra, x2: destra, y1: basso, y2: basso, class: 'asse' }));
  svg.append(nodoSvg('line', { x1: destra, x2: destra, y1: alto, y2: basso, class: 'asse' }));
  const blocco = el('div', 'terremoti-confronto-grafico');
  blocco.append(el('h4', null, t('terremoti.arc.graficoAnni')), svg, el('p', 'scheda-nota', t('terremoti.arc.graficoAnniNota', { mag: magnitudo(magMin) })));
  return blocco;
}

// Cumulata mese per mese dei due anni sulla stessa scala; per l'anno in corso la linea si ferma al mese di oggi.
function graficoCumulata(c, annoA, annoB, adesso) {
  if (!c.a.n && !c.b.n) return null;
  const annoCorrente = new Date(adesso).getUTCFullYear();
  const fino = anno => (anno === annoCorrente ? new Date(adesso).getUTCMonth() + 1 : 12);
  const a = c.a.cumulata.slice(0, fino(annoA));
  const b = c.b.cumulata.slice(0, fino(annoB));
  const massimo = Math.max(1, a.at(-1)?.cumulati ?? 0, b.at(-1)?.cumulati ?? 0);
  const potenza = 10 ** Math.floor(Math.log10(massimo));
  const n = massimo / potenza;
  const cima = ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(s => s >= n) ?? 10) * potenza;
  const L = 400, A = 150, MS = 36, MD = 10, MA = 10, MB = 24;
  const sinistra = MS, destra = L - MD, alto = MA, basso = A - MB;
  const x = mese => sinistra + (mese - 1) / 11 * (destra - sinistra);
  const y = v => basso - v / cima * (basso - alto);
  const svg = nodoSvg('svg', { viewBox: `0 0 ${L} ${A}`, role: 'img', 'aria-label': t('terremoti.arc.graficoCumulata') });
  for (const v of (cima >= 4 ? [0, cima / 2, cima] : [0, cima])) {
    svg.append(nodoSvg('line', { x1: sinistra, x2: destra, y1: y(v), y2: y(v), class: v ? 'griglia' : 'asse' }));
    svg.append(testoSvg(sinistra - 3, y(v) + 3, numero(Math.round(v)), { 'text-anchor': 'end' }));
  }
  for (const m of [1, 3, 5, 7, 9, 11]) svg.append(testoSvg(x(m), A - 6, meseCorto(m)));
  const linea = (serie, classe, colore) => {
    if (!serie.length) return;
    if (serie.length > 1) svg.append(nodoSvg('polyline', { points: serie.map(p => `${x(p.mese)},${y(p.cumulati)}`).join(' '), class: classe }));
    const fine = nodoSvg('circle', { cx: x(serie.at(-1).mese), cy: y(serie.at(-1).cumulati), r: 2.2, fill: colore });
    fine.append(nodoSvg('title', {}, `${serie.at(-1).cumulati} ${t('terremoti.arc.eventi').toLocaleLowerCase(localeIntl())}`));
    svg.append(fine);
  };
  linea(a, 'linea-a', COLORE_A);
  linea(b, 'linea-b', COLORE_B);
  const chiave = el('div', 'terremoti-confronto-chiave');
  for (const [anno, colore] of [[annoA, COLORE_A], [annoB, COLORE_B]]) {
    const voce = el('span');
    const pallino = el('i');
    pallino.style.background = colore;
    voce.append(pallino, el('span', null, String(anno)));
    chiave.append(voce);
  }
  const blocco = el('div', 'terremoti-confronto-grafico');
  blocco.append(el('h4', null, t('terremoti.arc.graficoCumulata')), chiave, svg, el('p', 'scheda-nota', t('terremoti.arc.graficoCumulataNota')));
  return blocco;
}