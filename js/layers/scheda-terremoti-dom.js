// Parti disegnate dei terremoti: i due menu del filtro (legenda e scheda) e l'elenco «Gli altri terremoti» della scheda.
import { disegnaAccordion, disegnaSezione } from '../core/scheda-disegno.js';
import { t, tn, localeIntl } from '../core/i18n.js';
import { titoloConInfo, apriGrande } from '../core/info-grafico.js';
import { zoomGrafico } from '../core/zoom-grafico.js';
import { barraNavigazione } from '../core/scheda-navigazione.js';
import { ANNO_INIZIO, periodoAnno, serieAnnuale, scaricaRiepilogo } from './scheda-archivio.js';
import { iconaAttesa } from '../core/scheda-util.js';
import { SCELTE_GIORNI, SCELTE_MAGNITUDO, PROFONDITA, UNITA, MAG_STORICO, ANNI_STORICO, filtro, chiaveProfondita, altriTerremoti, accordionTerremoti, posizioneEvento, urlStorico, rispostaDaArchivio, scaricaEventiTutti, eventiDaTesto, eventiDaFeatures, serieEventi, puntiMagnitudo, curvaCumulativa, omori, rilascioCumulativo, tempiTraEventi, spazioTempo, finestraTempo, proprietaStorico, voceTerremoto, inquadra, proiettaMiniatura, miniatura, etichettaBarra, periodoSequenza, statisticheEvento } from './scheda-terremoti.js';

export const EVENTO_FILTRO = 'terremoti:filtro';

const GIORNO_MS = 86400000;
const emetti = () => document.dispatchEvent(new CustomEvent(EVENTO_FILTRO));

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

function menu(etichetta, scelte, valore, testoScelta, suCambio) {
  const lab = el('label', 'terremoti-filtro');
  const sel = el('select');
  for (const v of scelte) {
    const o = el('option', null, testoScelta(v));
    o.value = String(v);
    sel.append(o);
  }
  sel.addEventListener('change', () => suCambio(typeof scelte[0] === 'number' ? Number(sel.value) : sel.value));
  // altri menu uguali (legenda e scheda) seguono la scelta; lo slider della magnitudo può scegliere un valore fuori
  // elenco (per esempio 2,5): il menu mostra quel valore con una voce in più, aggiornata invece che accumulata
  const allinea = () => {
    const v = String(valore());
    let fuori = sel.querySelector('option[data-fuori-elenco]');
    if ([...sel.options].some(o => o !== fuori && o.value === v)) { fuori?.remove(); fuori = null; }
    else {
      if (!fuori) { fuori = el('option'); fuori.dataset.fuoriElenco = '1'; sel.append(fuori); }
      fuori.value = v;
      fuori.textContent = testoScelta(valore());
    }
    sel.value = v;
  };
  const segui = () => (lab.isConnected ? allinea() : document.removeEventListener(EVENTO_FILTRO, segui));
  document.addEventListener(EVENTO_FILTRO, segui);
  allinea();
  lab.append(el('span', null, etichetta), sel);
  return lab;
}

const cambia = campo => v => {
  filtro[campo] = v;
  if (campo === 'giorni') { filtro.finestra = null; filtro.periodo = null; } // il menu «Periodo» sostituisce l'intervallo dello slider
  emetti();
};

export const testoGiorni = g => (g === 1 ? t('terremoti.ultime24') : t('terremoti.ultimiGiorni', { n: g }));

// ---------- periodo: giorni predefiniti oppure un giorno o un intervallo scelto dal calendario ----------
const dataPeriodo = ts => new Date(ts).toLocaleDateString(localeIntl(), { day: 'numeric', month: 'short', year: 'numeric' });
const stessoGiorno = (a, b) => {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
};
// Testo compatto del periodo: «il 24 ago 2016» oppure «dal 24 ago 2016 al 30 ago 2016»
export const testoPeriodoBreve = p => (stessoGiorno(p.da, p.a)
  ? t('terremoti.periodoGiorno', { data: dataPeriodo(p.da) })
  : t('terremoti.periodoNota', { da: dataPeriodo(p.da), a: dataPeriodo(p.a) }));
// Frase del periodo per la nota della legenda: «Ultimi 7 giorni» o il periodo scelto
export const testoPeriodo = (f = filtro) => (f.periodo ? testoPeriodoBreve(f.periodo) : testoGiorni(f.giorni));

// data «YYYY-MM-DD» nei campi del calendario, e ritorno ai millisecondi locali
const valoreData = ts => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const inizioGiorno = valore => {
  const [anno, mese, giorno] = valore.split('-').map(Number);
  return new Date(anno, mese - 1, giorno).getTime();
};
const fineGiorno = ts => {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};
const oggiInput = () => valoreData(Date.now());

// Un solo dialogo per volta: si apre dal menu e restituisce il periodo scelto (o nulla se si annulla)
let dialogoPeriodo = null;
function apriDialogoPeriodo({ da = null, a = null, alApplica, alChiudi = null, limiteGiorni = null }) {
  if (dialogoPeriodo) dialogoPeriodo.close();
  const dlg = el('dialog', 'terremoti-periodo-dialog');
  dlg.setAttribute('aria-label', t('terremoti.periodoDialogTitolo'));
  const form = el('form');
  form.noValidate = true;
  const titolo = el('h2', null, t('terremoti.periodoDialogTitolo'));
  const nota = el('p', 'uffici-nota', t('terremoti.periodoDialogNota'));
  const campi = el('div', 'terremoti-periodo-campi');
  const campoData = (etichetta, valore) => {
    const lab = el('label');
    const input = el('input');
    Object.assign(input, { type: 'date', min: `${ANNO_INIZIO}-01-01`, max: oggiInput(), value: valore ? valoreData(valore) : '' });
    input.setAttribute('aria-label', etichetta);
    lab.append(el('span', null, etichetta), input);
    return { lab, input };
  };
  const predefinito = Date.now() - Math.max(0, filtro.giorni - 1) * GIORNO_MS;
  const dal = campoData(t('terremoti.periodoDa'), da ?? predefinito);
  const al = campoData(t('terremoti.periodoA'), a ?? Date.now());
  campi.append(dal.lab, al.lab);
  const errore = el('p', 'terremoti-periodo-errore');
  errore.setAttribute('role', 'alert');
  errore.hidden = true;
  const azioni = el('div', 'terremoti-periodo-azioni');
  const annulla = el('button', 'secondario', t('terremoti.periodoAnnulla'));
  annulla.type = 'button';
  const applica = el('button', 'primario', t('terremoti.periodoApplica'));
  applica.type = 'submit';
  azioni.append(annulla, applica);
  form.append(titolo, nota, campi, errore, azioni);
  dlg.append(form);
  const sbaglia = chiave => { errore.textContent = t(chiave); errore.hidden = false; };
  annulla.addEventListener('click', () => dlg.close());
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const daTs = dal.input.value ? inizioGiorno(dal.input.value) : null;
    const aTs = al.input.value ? inizioGiorno(al.input.value) : null;
    if (daTs == null && aTs == null) { sbaglia('terremoti.periodoErrore'); return; }
    const inizio = daTs ?? aTs;
    const fine = fineGiorno(aTs ?? daTs);
    if (inizio > fine) { sbaglia('terremoti.arc.errInvertito'); return; }
    if (new Date(inizio).getFullYear() < ANNO_INIZIO) { sbaglia('terremoti.arc.errPrima'); return; }
    if (inizio > Date.now()) { sbaglia('terremoti.arc.errFuturo'); return; }
    if (limiteGiorni && (fine - inizio) / GIORNO_MS > limiteGiorni) { sbaglia('terremoti.periodoErroreLungo'); return; }
    alApplica({ da: inizio, a: fine });
    dlg.close();
  });
  dlg.addEventListener('close', () => {
    if (dialogoPeriodo === dlg) dialogoPeriodo = null;
    dlg.remove();
    alChiudi?.();
  });
  dlg.addEventListener('click', ev => { if (ev.target === dlg) dlg.close(); }); // clic sullo sfondo
  document.body.append(dlg);
  dialogoPeriodo = dlg;
  dlg.showModal();
}

// Menu «Periodo»: le scorciatoie di sempre più «Personalizzato…», che apre un giorno o un intervallo sul calendario.
function menuPeriodo() {
  const lab = el('label', 'terremoti-filtro terremoti-filtro-periodo');
  const sel = el('select');
  for (const g of SCELTE_GIORNI) {
    const o = el('option', null, testoGiorni(g));
    o.value = String(g);
    sel.append(o);
  }
  const personalizzato = el('option', null, t('terremoti.periodoPersonalizzato'));
  personalizzato.value = 'personalizzato';
  sel.append(personalizzato);
  const nota = el('small', 'terremoti-periodo-nota');
  const allinea = () => {
    const p = filtro.periodo;
    sel.value = p ? 'personalizzato' : String(filtro.giorni);
    nota.hidden = !p;
    nota.textContent = p ? testoPeriodoBreve(p) : '';
  };
  sel.addEventListener('change', () => {
    if (sel.value === 'personalizzato') {
      apriDialogoPeriodo({
        da: filtro.periodo?.da ?? null,
        a: filtro.periodo?.a ?? null,
        alApplica: p => { filtro.periodo = p; filtro.finestra = null; emetti(); },
        alChiudi: allinea,
      });
      return;
    }
    filtro.giorni = Number(sel.value);
    filtro.finestra = null;
    filtro.periodo = null;
    emetti();
  });
  const segui = () => (lab.isConnected ? allinea() : document.removeEventListener(EVENTO_FILTRO, segui));
  document.addEventListener(EVENTO_FILTRO, segui);
  allinea();
  lab.append(el('span', null, t('terremoti.periodo')), sel, nota);
  return lab;
}

// Magnitudo minima scritta nei menu come la legge lo slider: «≥ 2,5», con la virgola decimale italiana
const magnitudoMinima = m => `≥ ${m.toLocaleString(localeIntl(), { maximumFractionDigits: 1 })}`;

// Solo la magnitudo minima (ricerca): stesso filtro dei menu della legenda, che seguono la scelta
export const menuMagnitudo = () => menu(t('terremoti.magMin'), SCELTE_MAGNITUDO, () => filtro.magMin, magnitudoMinima, cambia('magMin'));

// Profondità: un solo menu per la ricerca e per la legenda, come la magnitudo; scrive profMin/profMax nel filtro condiviso
export function menuProfondita() {
  const lab = el('label', 'terremoti-filtro');
  const sel = el('select');
  for (const p of PROFONDITA) {
    const o = el('option', null, t(`terremoti.arc.prof.${p.chiave}`));
    o.value = p.chiave;
    sel.append(o);
  }
  sel.value = chiaveProfondita(filtro);
  sel.addEventListener('change', () => {
    const p = PROFONDITA.find(x => x.chiave === sel.value) ?? PROFONDITA[0];
    filtro.profMin = p.min;
    filtro.profMax = p.max;
    document.dispatchEvent(new CustomEvent(EVENTO_FILTRO));
  });
  const segui = () => (lab.isConnected ? sel.value = chiaveProfondita(filtro) : document.removeEventListener(EVENTO_FILTRO, segui));
  document.addEventListener(EVENTO_FILTRO, segui);
  lab.append(el('span', null, t('terremoti.arc.prof')), sel);
  return lab;
}

// Periodo, magnitudo minima e profondità: valgono per la mappa e per l'elenco. Nella legenda dei terremoti la magnitudo
// ha lo slider a due maniglie (minima e massima), quindi il menu si può lasciar fuori (`magnitudo: false`); la scheda lo tiene.
export function menuFiltro({ magnitudo = true } = {}) {
  const riga = el('div', 'terremoti-filtri');
  riga.append(menuPeriodo());
  if (magnitudo) riga.append(menu(t('terremoti.magMin'), SCELTE_MAGNITUDO, () => filtro.magMin, magnitudoMinima, cambia('magMin')));
  riga.append(menuProfondita());
  return riga;
}

// Contenuto della sezione «Gli altri terremoti»: filtro e fisarmonica che si ridisegna a ogni cambio; `eventi()` = eventi in mappa
export function elencoAltri(eventi, esclusi) {
  const radice = el('div', 'terremoti-elenco');
  const corpo = el('div');
  const disegna = () => {
    const elenco = altriTerremoti(eventi(), esclusi);
    corpo.replaceChildren(elenco.n ? disegnaAccordion(accordionTerremoti(elenco)) : el('p', 'scheda-nota', t('terremoti.nessunAltro')));
  };
  radice.append(menuFiltro(), corpo);
  const aggiorna = () => (radice.isConnected ? disegna() : document.removeEventListener(EVENTO_FILTRO, aggiorna)); // la scheda chiusa non ascolta più
  disegna();
  document.addEventListener(EVENTO_FILTRO, aggiorna);
  return radice;
}

// Frecce sotto all'evento scelto: passano all'evento più recente (‹) o meno recente (›) tra quelli in mappa; `visibili()` = eventi che passano filtri e legenda
export const barraEventi = (id, visibili, vai) => barraNavigazione({
  posizione: () => posizioneEvento(visibili(), id), vai, evento: EVENTO_FILTRO,
  etichette: { gruppo: t('terremoti.nav.gruppo'), prec: t('terremoti.nav.recente'), succ: t('terremoti.nav.vecchio') },
});

// ---------- serie temporale a barre (sezione «Terremoti nel tempo») ----------
// Lo storico (5 anni, M ≥ 2) si scarica una volta sola, alla prima apertura della sezione, e si tiene per un'ora.
const VALIDITA_STORICO_MS = 3600 * 1000;
let storico = null; // { promessa, quando }
function caricaStorico(area) {
  if (!storico || Date.now() - storico.quando > VALIDITA_STORICO_MS) {
    const a = Date.now(), da = a - ANNI_STORICO * 366 * 86400000;
    const promessa = fetch(urlStorico(area)).then(r => {
      if (!r.ok && r.status !== 204) throw new Error(String(r.status));
      return r.status === 204 ? [] : r.text().then(eventiDaTesto);
    }).catch(async () => {
      // Senza server (sito statico, GitHub Pages, file locali) lo storico si ricostruisce dai file per anno dell'archivio:
      // è la stessa fonte del confronto, quindi la serie resta disponibile anche fuori da `node server.js`.
      const { eventi } = await rispostaDaArchivio({ da, a, magMin: MAG_STORICO }, fetch, Infinity);
      return eventiDaFeatures(eventi);
    });
    storico = { promessa, quando: Date.now() };
    promessa.catch(() => { storico = null; }); // un errore non si ricorda: si riprova alla prossima apertura
  }
  return storico.promessa;
}

// Eventi di un intervallo scelto nel grafico «Terremoti nel tempo»: formato testo, senza il tetto della mappa, con lo
// stesso ripiego sull'archivio statico di `scaricaEventiTutti`. Si tiene per la sessione: riaprire lo stesso periodo è immediato.
const cacheIntervalli = new Map();
const MAX_CACHE_INTERVALLI = 6;
function caricaIntervallo(area, da, a) {
  const chiave = `${da}-${a}`;
  if (cacheIntervalli.has(chiave)) return cacheIntervalli.get(chiave);
  const promessa = scaricaEventiTutti({ da, a, magMin: MAG_STORICO, area }).then(r => eventiDaFeatures(r.eventi));
  cacheIntervalli.set(chiave, promessa);
  promessa.catch(() => cacheIntervalli.delete(chiave));
  if (cacheIntervalli.size > MAX_CACHE_INTERVALLI) cacheIntervalli.delete(cacheIntervalli.keys().next().value);
  return promessa;
}

// Riepilogo di tutto l'archivio (per la serie «per anno»), uno per magnitudo minima: se manca o fallisce, la serie resta quella degli ultimi anni
const riepiloghi = new Map();
function riepilogoArchivio(magMin, alPronto) {
  let c = riepiloghi.get(magMin);
  if (!c) {
    c = { dati: null };
    c.promessa = scaricaRiepilogo({ da: periodoAnno(ANNO_INIZIO).da, a: Date.now() }, magMin).then(d => { c.dati = d; }, () => riepiloghi.delete(magMin));
    riepiloghi.set(magMin, c);
  }
  if (!c.dati) c.promessa.then(() => c.dati && alPronto());
  return c.dati;
}

const testoUnita = u => t(`terremoti.unita.${u}`);
const num = n => n.toLocaleString(localeIntl());
let unita = 'giorno';

// Magnitudo-tempo: uno stelo per evento, alto quanto la magnitudo; la mainshock è in rosso con l'etichetta.
const SVG = 'http://www.w3.org/2000/svg';
// viewBox e margini (sinistro, destro, alto, basso): piccolo nella scheda, grande nel popup (solo desktop)
const DIM = { L: 320, A: 150, MS: 28, MD: 8, MA: 8, MB: 18 };
const DIM_GRANDE = { L: 900, A: 420, MS: 58, MD: 18, MA: 18, MB: 48 };
const ALTEZZA_RIQUADRI = 460; // grafico, minimappa e scheda dell'evento: sempre alti uguali, qualunque sia il monitor
const CON_MAPPA = new Set(['mt', 'cum', 'energia', 'spaziotempo']); // grafici con minimappa e scheda a fianco
// Il viewBox del popup segue lo spazio vero della colonna del grafico (schermo meno minimappa e scheda), così i testi restano leggibili
function adattaDimensioni(id) {
  const conMappa = CON_MAPPA.has(id);
  const popup = conMappa ? Math.min(1760, window.innerWidth - 24) : Math.min(1000, window.innerWidth - 48);
  const colonna = conMappa ? Math.max(520, popup - 28 - 300 - 320 - 28 - 14) : popup - 70;
  DIM_GRANDE.L = Math.round(colonna);
  DIM_GRANDE.A = conMappa ? ALTEZZA_RIQUADRI : Math.min(520, Math.max(360, Math.round(colonna * 0.45)));
}
const dimensioni = grande => (grande ? DIM_GRANDE : DIM);
const dataBreve = ts => new Date(ts).toLocaleDateString(localeIntl(), { day: 'numeric', month: 'short', year: '2-digit' });
const mag1 = m => m.toLocaleString(localeIntl(), { minimumFractionDigits: 1 });

// Intestazione del grafico: titolo, «i» e (solo nella scheda) il pulsante che lo apre in grande. `rifai(chiudi)` ridisegna il grafico in grande.
function intestazione(testo, id, grande, rifai) {
  return titoloConInfo('h4', 'terremoti-titolo', testo, id, grande ? null : () => apriGrande(testo, chiudi => { selezionato = null; adattaDimensioni(id); return rifai(chiudi); }));
}

// Asse delle date: due estremi nella scheda, sei tacche con griglia verticale nel popup; più il titolo dell'asse
function asseDate(svg, g, grande) {
  const { L, A, MS, MD, MA, MB } = dimensioni(grande);
  const passi = grande ? 5 : 1;
  for (let i = 0; i <= passi; i++) {
    const f = i / passi, x = MS + f * (L - MS - MD);
    const e = nodoSvg('text', { x, y: grande ? A - 26 : A - 4, 'text-anchor': i === 0 ? 'start' : i === passi ? 'end' : 'middle', class: 'et' });
    e.textContent = g.a - g.da < 3 * 86400000 ? dataEvento(g.da + f * (g.a - g.da)) : dataBreve(g.da + f * (g.a - g.da));
    svg.append(e);
    if (grande && i > 0 && i < passi) svg.append(nodoSvg('line', { x1: x, x2: x, y1: MA, y2: A - MB, class: 'asse fine' }));
  }
  if (grande) titoliAssi(svg, grande, 'terremoti.asse.tempo');
}
// Titoli degli assi, solo nel popup: orizzontale in basso e verticale a sinistra
function titoliAssi(svg, grande, chiaveX, chiaveY) {
  if (!grande) return;
  const { L, A, MS, MD, MA, MB } = DIM_GRANDE;
  if (chiaveX) {
    const e = nodoSvg('text', { x: MS + (L - MS - MD) / 2, y: A - 6, 'text-anchor': 'middle', class: 'et asse-titolo' });
    e.textContent = t(chiaveX);
    svg.append(e);
  }
  if (chiaveY) {
    const e = nodoSvg('text', { transform: `translate(13 ${MA + (A - MA - MB) / 2}) rotate(-90)`, 'text-anchor': 'middle', class: 'et asse-titolo' });
    e.textContent = t(chiaveY);
    svg.append(e);
  }
}
// Evento scelto con il clic nel popup: resta evidenziato in grafico e in minimappa anche dopo zoom e pan
let selezionato = null;
const idEvento = p => String(p.id ?? p.ts);

// Collega grafico e minimappa del popup: il passaggio del mouse evidenzia l'evento in entrambi, il clic lo fissa (secondo clic: lo toglie)
function creaSync(apri) {
  const gruppi = new Map(), punti = new Map();
  let sopra = null;
  const ascoltatori = [];
  const aggiorna = () => {
    for (const elenco of [gruppi, punti]) {
      for (const [id, e] of elenco) {
        e.classList.toggle('sel', id === (sopra && idEvento(sopra)) || id === (selezionato && idEvento(selezionato)));
        e.classList.toggle('fissato', id === (selezionato && idEvento(selezionato)));
      }
    }
    for (const f of ascoltatori) f(sopra ?? selezionato);
  };
  return {
    apri, gruppi, punti,
    passa(p) { sopra = p; aggiorna(); },
    seleziona(p) { selezionato = selezionato && idEvento(selezionato) === idEvento(p) ? null : p; aggiorna(); },
    mostra(f) { ascoltatori.push(f); aggiorna(); },
  };
}

// Rende un elemento del grafico sensibile: nella scheda il clic apre l'evento in mappa; nel popup (con `sync`) lo evidenzia anche nella minimappa
function rendiApribile(gruppo, p, apri, sync) {
  if (!Number.isFinite(p.lon) || !(apri || sync)) return false;
  gruppo.classList.add('apribile');
  gruppo.setAttribute('tabindex', '0');
  gruppo.setAttribute('role', 'button');
  const azione = sync ? () => sync.seleziona(p) : () => apri(p);
  gruppo.addEventListener('click', azione);
  gruppo.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); azione(); } });
  if (sync) {
    sync.gruppi.set(idEvento(p), gruppo);
    gruppo.addEventListener('pointerenter', () => sync.passa(p));
    gruppo.addEventListener('pointerleave', () => sync.passa(null));
    gruppo.addEventListener('focus', () => sync.passa(p));
    gruppo.addEventListener('blur', () => sync.passa(null));
  }
  return true;
}

// Minimappa accanto al grafico: tessere OpenStreetMap standard inquadrate su tutti gli eventi del grafico, un cerchio per evento
const MAPPA_L = 300; // larghezza della mappa
// Durata breve («45 min», «3,2 h», «5 g»)
function durataBreve(ms) {
  const min = Math.abs(ms) / 60000;
  if (min < 60) return t('terremoti.seq.min', { n: num(Math.max(1, Math.round(min))) });
  if (min < 2880) return t('terremoti.seq.ore', { n: (min / 60).toLocaleString(localeIntl(), { maximumFractionDigits: 1 }) });
  return t('terremoti.seq.giorni', { n: num(Math.round(min / 1440)) });
}
// Striscia delle profondità di tutta la sequenza, con un segno sull'evento scelto
function strisciaProfondita(prof, valore) {
  const max = Math.max(1, prof[prof.length - 1]);
  const L = 280, x = v => 6 + (v / max) * (L - 12);
  const svg = nodoSvg('svg', { viewBox: `0 0 ${L} 26`, class: 'seq-profondita', role: 'img', 'aria-label': t('terremoti.seq.profondita') });
  svg.append(nodoSvg('line', { x1: 6, x2: L - 6, y1: 13, y2: 13, class: 'asse' }));
  for (const v of prof) svg.append(nodoSvg('circle', { cx: x(v), cy: 13, r: 3, class: 'altro' }));
  if (Number.isFinite(valore)) svg.append(nodoSvg('circle', { cx: x(valore), cy: 13, r: 6, class: 'scelto' }));
  return svg;
}
// Blocco «Nella sequenza» sotto i dati dell'evento scelto, nella scheda del popup
function disegnaSequenza(s, sync, profEvento) {
  const blocco = el('div', 'seq-blocco');
  blocco.append(el('h4', 'seq-titolo', t('terremoti.seq.titolo')));
  const riga = (etichetta, valore) => {
    const r = el('div', 'seq-riga');
    r.append(el('span', null, t(etichetta)), el('strong', null, valore));
    blocco.append(r);
  };
  const pct = s.quota * 100;
  riga('terremoti.seq.posizione', t('terremoti.seq.di', { n: num(s.posizione), tot: num(s.totale) }));
  riga('terremoti.seq.dalForte', s.primo ? t('terremoti.seq.eLaForte') : t(s.scartoMs > 0 ? 'terremoti.seq.dopo' : 'terremoti.seq.prima', { d: durataBreve(s.scartoMs) }));
  riga('terremoti.seq.rango', t('terremoti.seq.nDi', { n: num(s.rango), tot: num(s.totale) }));
  riga('terremoti.seq.energia', pct < 0.1 ? t('terremoti.seq.pocaEnergia') : t('terremoti.seq.quota', { q: pct.toLocaleString(localeIntl(), { maximumFractionDigits: pct < 10 ? 1 : 0 }) }));
  if (s.precedenteMs !== null || s.successivoMs !== null) riga('terremoti.seq.attese', t('terremoti.seq.attesePrimaDopo', { a: s.precedenteMs === null ? '–' : durataBreve(s.precedenteMs), b: s.successivoMs === null ? '–' : durataBreve(s.successivoMs) }));
  if (s.entro50km !== null) riga('terremoti.seq.repliche', t('terremoti.seq.replicheValore', { a: num(s.entro24h), b: num(s.entro50km) }));
  if (s.profondita.length > 1) {
    const f = v => v.toLocaleString(localeIntl(), { maximumFractionDigits: 1 });
    const striscia = strisciaProfondita(s.profondita, profEvento);
    striscia.append(nodoSvg('title', {}, t('terremoti.seq.profNota', { min: f(s.profondita[0]), max: f(s.profondita[s.profondita.length - 1]), med: f(s.mediana) })));
    blocco.append(el('p', 'seq-sottotitolo', t('terremoti.seq.profondita')), striscia);
  }
  if (s.vicini.length) {
    blocco.append(el('p', 'seq-sottotitolo', t('terremoti.seq.vicini')));
    for (const { e, km } of s.vicini) {
      const b = el('button', 'seq-vicino', `M ${mag1(e.mag)} · ${num(Math.round(km))} km · ${dataEvento(e.ts)}`);
      b.type = 'button';
      b.addEventListener('click', () => sync.seleziona(e));
      blocco.append(b);
    }
  }
  return blocco;
}
// Ultimo inquadramento della minimappa: il grafico ridisegna il blocco a ogni zoom, e la mappa parte da qui per zoomare a vista
let inquadraturaPrecedente = null;
function creaMinimappa(punti, sync, forteId) {
  const geo = punti.filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat));
  if (!geo.length) return null;
  const MAPPA_A = DIM_GRANDE.A; // grafico, mappa e scheda sono alti uguali; i testi stanno sopra e sotto i riquadri
  const { zoom, centro } = inquadra(geo, MAPPA_L, MAPPA_A);
  const mini = miniatura(centro, zoom, MAPPA_L, MAPPA_A);
  const aiuto = el('p', 'scheda-nota minimappa-aiuto', t('terremoti.minimappa.aiuto', { n: num(geo.length) }));
  const quadro = el('div', 'minimappa-quadro');
  quadro.style.height = `${MAPPA_A}px`;
  const vista = el('div', 'minimappa-vista'); // tessere e punti si muovono insieme
  for (const tessera of mini.tessere) {
    const img = el('img');
    img.src = tessera.url;
    img.alt = '';
    img.draggable = false;
    img.style.cssText = `left:${tessera.x}px;top:${tessera.y}px`;
    vista.append(img);
  }
  const proietta = proiettaMiniatura(centro, zoom, MAPPA_L, MAPPA_A);
  const svg = nodoSvg('svg', { viewBox: `0 0 ${MAPPA_L} ${MAPPA_A}`, class: 'minimappa-punti', role: 'img', 'aria-label': t('terremoti.minimappa.titolo') });
  for (const p of [...geo].sort((a, b) => a.mag - b.mag)) { // i forti sopra
    const { x, y } = proietta(p);
    const forte = idEvento(p) === forteId;
    const gruppo = nodoSvg('g', { class: forte ? 'forte' : 'evento' }, `M ${mag1(p.mag)} · ${p.luogo ? `${p.luogo} · ` : ''}${dataEvento(p.ts)}`);
    gruppo.append(nodoSvg('circle', { cx: x, cy: y, r: Math.max(3, (p.mag - 1) * 2) }));
    gruppo.addEventListener('click', () => sync.seleziona(p));
    gruppo.addEventListener('pointerenter', () => sync.passa(p));
    gruppo.addEventListener('pointerleave', () => sync.passa(null));
    sync.punti.set(idEvento(p), gruppo);
    svg.append(gruppo);
  }
  vista.append(svg);
  quadro.append(vista, el('span', 'minimappa-attr', mini.attribuzione));
  // Zoom sincronizzato: la vista riparte dal vecchio inquadramento e scivola sul nuovo (nessun movimento se è un popup nuovo: il quadro precedente non è più in pagina)
  const prima = inquadraturaPrecedente;
  inquadraturaPrecedente = { zoom, centro, quadro };
  if (prima?.quadro.isConnected && (prima.zoom !== zoom || prima.centro.lon !== centro.lon || prima.centro.lat !== centro.lat) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const { x, y } = proietta(prima.centro);
    const inizio = `translate(${MAPPA_L / 2 - x}px, ${MAPPA_A / 2 - y}px) scale(${2 ** (prima.zoom - zoom)})`;
    vista.style.transformOrigin = `${x}px ${y}px`;
    vista.style.transform = inizio;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      vista.style.transition = 'transform .45s ease-in-out';
      vista.style.transform = 'none';
    }));
  }
  const scheda = el('div', 'minimappa-scheda');
  sync.mostra(p => {
    scheda.replaceChildren();
    if (!p) return;
    scheda.append(el('strong', null, `M ${mag1(p.mag)}${p.luogo ? ` · ${p.luogo}` : ''}`), el('span', null, dataEvento(p.ts)));
  });
  // scheda completa dell'evento fissato (la stessa della mappa principale), sotto la minimappa; si ridisegna solo quando cambia l'evento
  const dettaglio = el('div', 'minimappa-dettaglio');
  const apri = el('div', 'minimappa-apri'); // riga sopra la scheda
  let mostrato = false; // diverso da null: il primo giro scrive anche il testo «nessun evento scelto»
  sync.mostra(() => {
    const id = selezionato && idEvento(selezionato);
    if (id === mostrato) return;
    mostrato = id;
    dettaglio.replaceChildren();
    apri.replaceChildren();
    const prop = selezionato && proprietaStorico(selezionato);
    if (!prop) { dettaglio.append(el('p', 'scheda-nota', t('terremoti.minimappa.vuota'))); return; }
    if (sync.apri) {
      const b = el('button', 'scheda-filtro', t('terremoti.minimappa.apri'));
      b.type = 'button';
      b.addEventListener('click', () => sync.apri(selezionato));
      apri.append(b);
    }
    const sezione = disegnaSezione({ ...voceTerremoto(prop), miniatura: null, strato: null, sempre: false }, 0);
    const stat = statisticheEvento(punti, selezionato);
    if (stat) sezione.querySelector('.scheda-fonte')?.before(disegnaSequenza(stat, sync, prop.prof));
    dettaglio.append(sezione);
  });
  return { aiuto, quadro, scheda, apri, dettaglio };
}
function aggiungiMappa(blocco, sync, punti, forte) {
  const mappa = creaMinimappa(punti, sync, forte && idEvento(forte));
  if (!mappa) return;
  blocco.classList.add('con-mappa');
  blocco.style.setProperty('--alt-grafico', `${DIM_GRANDE.A}px`);
  blocco.append(mappa.aiuto, mappa.quadro, mappa.scheda, mappa.apri, mappa.dettaglio); // grafico | minimappa | scheda dell'evento, ognuno con una riga sopra e una sotto
}

// Un marcatore per evento sulla curva (solo nel popup), come gli steli di magnitudo-tempo: tooltip al passaggio, clic = apre l'evento in mappa.
// `testo(i)` = riga in più del tooltip, `quota(i)` = ordinata del marcatore nel grafico.
function marcatori(svg, g, apri, sync, px, py, quota, testo) {
  g.punti.forEach((p, i) => {
    const forte = p === g.mainshock;
    const gruppo = nodoSvg('g', { class: forte ? 'forte' : 'evento' }, `M ${mag1(p.mag)} · ${dataEvento(p.ts)} · ${testo(i)}`);
    gruppo.append(nodoSvg('circle', { cx: px(p.x), cy: py(quota(i)), r: forte ? 5 : 3 }));
    rendiApribile(gruppo, p, apri, sync);
    svg.append(gruppo);
  });
}
// Zoom nel popup: si trascina sul grafico per scegliere un tratto di tempo, che viene ridisegnato; «Reimposta» (o doppio clic) torna a tutto.
// `g` = dati mostrati, `origine` = dati interi, `ridisegna(g)` = grafico nuovo per quei dati.
function zoomGrande(blocco, svg, g, origine, ridisegna) {
  zoomGrafico({
    blocco, svg,
    dominio: { da: g.da, a: g.a },
    origine: { da: origine.da, a: origine.a },
    geometria: DIM_GRANDE,
    minDurata: 60000,
    formatta: (da, a) => t('terremoti.zoom.tratto', { da: dataEvento(da), a: dataEvento(a) }),
    ridisegna: d => ridisegna(finestraTempo(origine, d.da, d.a)),
  });
}
// Linea verticale tratteggiata sulla scossa più forte (solo nel popup)
function lineaForte(svg, g, grande, px) {
  if (!grande || !g.mainshock) return;
  const { A, MA, MB } = DIM_GRANDE;
  const x = px(g.mainshock.x);
  svg.append(nodoSvg('line', { x1: x, x2: x, y1: MA, y2: A - MB, class: 'marca-forte' }));
}
function nodoSvg(tag, attributi, titolo) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attributi)) n.setAttribute(k, v);
  if (titolo) n.append(Object.assign(document.createElementNS(SVG, 'title'), { textContent: titolo }));
  return n;
}
const dataEvento = ts => new Date(ts).toLocaleString(localeIntl(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function disegnaMagnitudoTempo(g, apri, grande = false, origine = g) {
  const { L, A, MS, MD, MA, MB } = dimensioni(grande);
  const sync = grande ? creaSync(apri) : null;
  const blocco = el('div', 'terremoti-serie');
  blocco.append(intestazione(t('terremoti.mt.titolo'), 'mt', grande, chiudi => disegnaMagnitudoTempo(g, apri && (p => { chiudi(); apri(p); }), true)));
  if (!g.punti.length) {
    blocco.append(el('p', 'scheda-nota', t('terremoti.serie.vuota')));
    return blocco;
  }
  const px = x => MS + x * (L - MS - MD), py = y => A - MB - y * (A - MB - MA);
  const svg = nodoSvg('svg', { viewBox: `0 0 ${L} ${A}`, class: `terremoti-mt${grande ? ' grande' : ''}`, role: 'img', 'aria-label': t('terremoti.mt.titolo') });
  for (const m of g.livelli) {
    svg.append(nodoSvg('line', { x1: MS, x2: L - MD, y1: py((m - g.base) / (g.cima - g.base)), y2: py((m - g.base) / (g.cima - g.base)), class: 'asse' }));
    const e = nodoSvg('text', { x: MS - 4, y: py((m - g.base) / (g.cima - g.base)) + 3, 'text-anchor': 'end', class: 'et' });
    e.textContent = `M${m}`;
    svg.append(e);
  }
  asseDate(svg, g, grande);
  titoliAssi(svg, grande, null, 'terremoti.asse.mag');
  for (const p of g.punti) {
    const forte = p === g.mainshock;
    const x = px(p.x), y = py(p.y);
    const gruppo = nodoSvg('g', { class: forte ? 'forte' : 'evento' }, `M ${p.mag.toLocaleString(localeIntl(), { minimumFractionDigits: 1 })} · ${dataEvento(p.ts)}`);
    gruppo.append(nodoSvg('line', { x1: x, x2: x, y1: py(0), y2: y }), nodoSvg('circle', { cx: x, cy: y, r: (forte ? 4 : 2) * (grande ? 1.5 : 1) }));
    // clic su uno stelo: l'evento si apre in mappa, o nel popup si evidenzia in minimappa (la zona sensibile è larga 8 px)
    if (rendiApribile(gruppo, p, apri, sync)) gruppo.append(nodoSvg('line', { x1: x, x2: x, y1: py(0), y2: y - 3, class: 'zona' }));
    svg.append(gruppo);
  }
  const m = g.mainshock;
  const dx = px(m.x);
  const et = nodoSvg('text', { x: dx > L / 2 ? dx - 7 : dx + 7, y: py(m.y) + 3, 'text-anchor': dx > L / 2 ? 'end' : 'start', class: 'et forte' });
  et.textContent = grande ? `M ${mag1(m.mag)} · ${dataEvento(m.ts)}` : `M ${mag1(m.mag)}`;
  svg.append(et);
  blocco.append(svg, el('p', 'scheda-nota', t('terremoti.mt.nota', { n: num(g.punti.length), mag: g.base, forte: m.mag.toLocaleString(localeIntl(), { minimumFractionDigits: 1 }), data: dataEvento(m.ts), repliche: num(g.repliche) })));
  if (grande) aggiungiMappa(blocco, sync, g.punti, g.mainshock);
  if (grande) zoomGrande(blocco, svg, g, origine, gw => disegnaMagnitudoTempo(gw, apri, true, origine));
  return blocco;
}

// Curva cumulativa: scala degli eventi accumulati; l'asse verticale va da 0 al totale
function disegnaCurva(g, apri, grande = false, origine = g) {
  const c = curvaCumulativa(g);
  if (!c.totale) return el('div'); // senza eventi la nota del grafico precedente basta
  const { L, A, MS, MD, MA, MB } = dimensioni(grande);
  const sync = grande ? creaSync(apri) : null;
  const blocco = el('div', 'terremoti-serie');
  blocco.append(intestazione(t('terremoti.cum.titolo'), 'cum', grande, chiudi => disegnaCurva(g, apri && (p => { chiudi(); apri(p); }), true)));
  const px = x => MS + x * (L - MS - MD), py = n => A - MB - n / c.totale * (A - MB - MA);
  const svg = nodoSvg('svg', { viewBox: `0 0 ${L} ${A}`, class: `terremoti-mt terremoti-cum${grande ? ' grande' : ''}`, role: 'img', 'aria-label': t('terremoti.cum.titolo') });
  for (const n of grande ? [0, 1, 2, 3, 4].map(k => Math.round(c.totale * k / 4)).concat(c.totale).filter((v, i, a) => a.indexOf(v) === i) : [0, c.totale]) {
    svg.append(nodoSvg('line', { x1: MS, x2: L - MD, y1: py(n), y2: py(n), class: 'asse' }));
    const e = nodoSvg('text', { x: MS - 4, y: py(n) + 3, 'text-anchor': 'end', class: 'et' });
    e.textContent = num(n);
    svg.append(e);
  }
  asseDate(svg, g, grande);
  titoliAssi(svg, grande, null, 'terremoti.asse.eventi');
  lineaForte(svg, g, grande, px);
  const vertici = c.passi.map(p => `${px(p.x).toFixed(1)},${py(p.n).toFixed(1)}`);
  svg.append(
    nodoSvg('polygon', { points: `${px(0)},${py(0)} ${vertici.join(' ')} ${px(1)},${py(0)}`, class: 'area' }),
    nodoSvg('polyline', { points: vertici.join(' '), class: 'curva' }),
  );
  if (grande) marcatori(svg, g, apri, sync, px, py, i => i + 1, i => tn('terremoti.nEventi', i + 1, { n: num(i + 1) }));
  blocco.append(svg, el('p', 'scheda-nota', t('terremoti.cum.nota', { n: num(c.totale), mag: g.base })));
  if (grande) aggiungiMappa(blocco, sync, g.punti, g.mainshock);
  if (grande) zoomGrande(blocco, svg, g, origine, gw => disegnaCurva(gw, apri, true, origine));
  return blocco;
}

// Legge di Omori: repliche per giorno dopo la mainshock, assi logaritmici (decadimento ≈ retta)
function disegnaOmori(g, grande = false) {
  const o = omori(g);
  const v = o.giorni.filter(d => d.n > 0);
  if (!o.mainshock || !v.length) return el('div');
  const { L, A, MS, MD, MA, MB } = dimensioni(grande);
  const blocco = el('div', 'terremoti-serie');
  blocco.append(intestazione(t('terremoti.omori.titolo'), 'omori', grande, () => disegnaOmori(g, true)));
  const tMax = Math.max(10, o.giorni.length + 0.5), nMax = Math.max(10, ...v.map(d => d.n));
  const decT = Math.ceil(Math.log10(tMax)), decN = Math.ceil(Math.log10(nMax));
  const x0 = Math.log10(0.5), px = tt => MS + (Math.log10(tt) - x0) / (decT - x0) * (L - MS - MD);
  const py = n => A - MB - Math.log10(n) / decN * (A - MB - MA);
  const svg = nodoSvg('svg', { viewBox: `0 0 ${L} ${A}`, class: `terremoti-mt terremoti-omori${grande ? ' grande' : ''}`, role: 'img', 'aria-label': t('terremoti.omori.titolo') });
  if (grande) { // nel popup anche le righe intermedie di ogni decade (2…9), più tenui
    for (let k = 0; k < decN; k++) for (let m = 2; m < 10; m++) svg.append(nodoSvg('line', { x1: MS, x2: L - MD, y1: py(m * 10 ** k), y2: py(m * 10 ** k), class: 'asse fine' }));
    for (let k = 0; k < decT; k++) for (let m = 1; m < 10; m++) {
      const tt = m * 10 ** k;
      if (tt > 0.5 && tt < 10 ** decT) svg.append(nodoSvg('line', { x1: px(tt), x2: px(tt), y1: MA, y2: A - MB, class: 'asse fine' }));
    }
    titoliAssi(svg, grande, 'terremoti.asse.giorni', 'terremoti.asse.repliche');
  }
  for (let k = 0; k <= decN; k++) {
    svg.append(nodoSvg('line', { x1: MS, x2: L - MD, y1: py(10 ** k), y2: py(10 ** k), class: 'asse' }));
    const e = nodoSvg('text', { x: MS - 4, y: py(10 ** k) + 3, 'text-anchor': 'end', class: 'et' });
    e.textContent = num(10 ** k);
    svg.append(e);
  }
  for (let k = 0; k <= decT; k++) {
    const e = nodoSvg('text', { x: px(10 ** k), y: grande ? A - 26 : A - 4, 'text-anchor': 'middle', class: 'et' });
    e.textContent = t('terremoti.omori.giorno', { n: num(10 ** k) });
    svg.append(e);
  }
  if (o.fit) {
    const f = tt => py(10 ** (o.fit.logK - o.fit.p * Math.log10(tt)));
    const [a, b] = [0.5, tMax];
    svg.append(nodoSvg('line', { x1: px(a), x2: px(b), y1: Math.max(f(a), MA), y2: Math.min(f(b), A - MB), class: 'fit' }));
    if (grande) {
      const e = nodoSvg('text', { x: L - MD - 8, y: MA + 16, 'text-anchor': 'end', class: 'et forte' });
      e.textContent = t('terremoti.omori.fit', { p: o.fit.p.toLocaleString(localeIntl(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
      svg.append(e);
    }
  }
  for (const d of v) svg.append(nodoSvg('circle', { cx: px(d.t), cy: py(d.n), r: grande ? 4 : 2.5, class: 'punto' }, `${t('terremoti.omori.giorno', { n: Math.ceil(d.t) })}: ${tn('terremoti.nEventi', d.n, { n: num(d.n) })}`));
  blocco.append(svg, el('p', 'scheda-nota', t(o.fit ? 'terremoti.omori.nota' : 'terremoti.omori.notaPoca', { forte: o.mainshock.mag.toLocaleString(localeIntl(), { minimumFractionDigits: 1 }), data: dataEvento(o.mainshock.ts), p: o.fit ? o.fit.p.toLocaleString(localeIntl(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '' })));
  return blocco;
}

// Rilascio cumulativo di energia (momento sismico): quota del totale, dominata dagli eventi grandi
function disegnaRilascio(g, apri, grande = false, origine = g) {
  const r = rilascioCumulativo(g);
  if (!r.totale) return el('div');
  const { L, A, MS, MD, MA, MB } = dimensioni(grande);
  const sync = grande ? creaSync(apri) : null;
  const blocco = el('div', 'terremoti-serie');
  blocco.append(intestazione(t('terremoti.energia.titolo'), 'energia', grande, chiudi => disegnaRilascio(g, apri && (p => { chiudi(); apri(p); }), true)));
  const px = x => MS + x * (L - MS - MD), py = f => A - MB - f * (A - MB - MA);
  const svg = nodoSvg('svg', { viewBox: `0 0 ${L} ${A}`, class: `terremoti-mt terremoti-cum terremoti-energia${grande ? ' grande' : ''}`, role: 'img', 'aria-label': t('terremoti.energia.titolo') });
  for (const f of grande ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1]) {
    svg.append(nodoSvg('line', { x1: MS, x2: L - MD, y1: py(f), y2: py(f), class: 'asse' }));
    const e = nodoSvg('text', { x: MS - 4, y: py(f) + 3, 'text-anchor': 'end', class: 'et' });
    e.textContent = `${f * 100}%`;
    svg.append(e);
  }
  asseDate(svg, g, grande);
  titoliAssi(svg, grande, null, 'terremoti.asse.energia');
  lineaForte(svg, g, grande, px);
  const vertici = r.passi.map(p => `${px(p.x).toFixed(1)},${py(p.f).toFixed(1)}`);
  svg.append(nodoSvg('polygon', { points: `${px(0)},${py(0)} ${vertici.join(' ')} ${px(1)},${py(0)}`, class: 'area' }), nodoSvg('polyline', { points: vertici.join(' '), class: 'curva' }));
  if (grande) marcatori(svg, g, apri, sync, px, py, i => r.passi[2 * i + 2].f, i => `${(r.passi[2 * i + 2].f * 100).toLocaleString(localeIntl(), { maximumFractionDigits: 1 })}%`);
  blocco.append(svg, el('p', 'scheda-nota', t('terremoti.energia.nota', { mag: r.magEquiv.toLocaleString(localeIntl(), { maximumFractionDigits: 1 }), forte: g.mainshock.mag.toLocaleString(localeIntl(), { minimumFractionDigits: 1 }), quota: Math.round(r.quotaMax * 100), n: num(g.punti.length) })));
  if (grande) aggiungiMappa(blocco, sync, g.punti, g.mainshock);
  if (grande) zoomGrande(blocco, svg, g, origine, gw => disegnaRilascio(gw, apri, true, origine));
  return blocco;
}

// Tempi tra eventi successivi: istogramma delle attese, da brevissime (sciame) a lunghe (attività di fondo)
const nomeAttesa = min => (min < 60 ? `${min}${t('terremoti.attesa.min')}` : min < 1440 ? `${min / 60}${t('terremoti.attesa.ore')}` : min < 525600 ? `${min / 1440}${t('terremoti.attesa.giorni')}` : `1${t('terremoti.attesa.anni')}`);
const intervalloAttesa = c => (c.a === Infinity ? `> ${nomeAttesa(c.da)}` : c.da ? `${nomeAttesa(c.da)} – ${nomeAttesa(c.a)}` : `< ${nomeAttesa(c.a)}`);
function disegnaAttese(g, grande = false) {
  const a = tempiTraEventi(g);
  if (!a) return el('div');
  const blocco = el('div', 'terremoti-serie');
  blocco.append(intestazione(t('terremoti.attese.titolo'), 'attese', grande, () => disegnaAttese(g, true)));
  const barre = el('div', `terremoti-barre${grande ? ' grande' : ''}`);
  for (const c of a.classi) {
    const colonna = el('div', 'terremoti-barra');
    colonna.title = `${intervalloAttesa(c)}: ${num(c.n)}`;
    const asta = el('i', c.da < 1440 && c.n ? 'sciame' : null); // attese sotto un giorno = eventi ravvicinati
    asta.style.height = `${c.n ? Math.max(c.n / a.max * 100, 3) : 0}%`;
    if (grande) colonna.append(el('b', null, num(c.n))); // numero di attese sopra ogni barra
    colonna.append(asta, el('span', null, c.da ? nomeAttesa(c.da) : `<${nomeAttesa(c.a)}`));
    barre.append(colonna);
  }
  const med = a.mediana < 60 ? `${num(Math.round(a.mediana))} ${t('terremoti.attesa.min')}` : a.mediana < 1440 ? `${num(Math.round(a.mediana / 60))} ${t('terremoti.attesa.ore')}` : `${num(Math.round(a.mediana / 1440))} ${t('terremoti.attesa.giorni')}`;
  blocco.append(barre, el('p', 'scheda-nota', t('terremoti.attese.nota', { n: num(a.n), mediana: med, cv: a.cv.toLocaleString(localeIntl(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })));
  return blocco;
}

// Diagramma spazio-tempo: latitudine contro tempo, un cerchio per evento
function disegnaSpazioTempo(g, apri, grande = false, origine = g) {
  const st = spazioTempo(g);
  if (!st) return el('div');
  const { L, A, MS, MD, MA, MB } = dimensioni(grande);
  const sync = grande ? creaSync(apri) : null;
  const blocco = el('div', 'terremoti-serie');
  blocco.append(intestazione(t('terremoti.st.titolo'), 'spaziotempo', grande, chiudi => disegnaSpazioTempo(g, apri && (p => { chiudi(); apri(p); }), true)));
  const px = x => MS + x * (L - MS - MD), py = y => A - MB - y * (A - MB - MA);
  const svg = nodoSvg('svg', { viewBox: `0 0 ${L} ${A}`, class: `terremoti-mt terremoti-st${grande ? ' grande' : ''}`, role: 'img', 'aria-label': t('terremoti.st.titolo') });
  for (const y of grande ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1]) {
    svg.append(nodoSvg('line', { x1: MS, x2: L - MD, y1: py(y), y2: py(y), class: 'asse' }));
    const e = nodoSvg('text', { x: MS - 4, y: py(y) + 3, 'text-anchor': 'end', class: 'et' });
    e.textContent = `${(st.latMin + y * (st.latMax - st.latMin)).toLocaleString(localeIntl(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`;
    svg.append(e);
  }
  asseDate(svg, g, grande);
  titoliAssi(svg, grande, null, 'terremoti.asse.lat');
  lineaForte(svg, g, grande, px);
  for (const p of st.punti) {
    const forte = p === st.mainshock;
    const gruppo = nodoSvg('g', { class: forte ? 'forte' : 'evento' }, `M ${p.mag.toLocaleString(localeIntl(), { minimumFractionDigits: 1 })} · ${dataEvento(p.ts)}`);
    gruppo.append(nodoSvg('circle', { cx: px(p.x), cy: py(p.y), r: Math.max(1.5, (p.mag - 1) * 1.6) * (grande ? 1.8 : 1), class: 'pt' }));
    rendiApribile(gruppo, p, apri, sync);
    svg.append(gruppo);
  }
  blocco.append(svg, el('p', 'scheda-nota', t('terremoti.st.nota', { n: num(st.punti.length) })));
  if (grande) aggiungiMappa(blocco, sync, st.punti, st.mainshock);
  if (grande) zoomGrande(blocco, svg, g, origine, gw => disegnaSpazioTempo(gw, apri, true, origine));
  return blocco;
}

function disegnaSerie(serie, grande = false) {
  const blocco = el('div', 'terremoti-serie');
  blocco.append(intestazione(t('terremoti.barre.titolo'), 'barre', grande, () => disegnaSerie(serie, true)));
  const barre = el('div', `terremoti-barre${grande ? ' grande' : ''}`);
  const ogni = grande ? (serie.unita === 'giorno' ? 2 : 1) : serie.unita === 'giorno' ? 5 : serie.unita === 'mese' ? 3 : 1; // etichette sotto una barra ogni tanto: nella scheda lo spazio è poco
  serie.barre.forEach((b, i) => {
    const { breve, lunga } = etichettaBarra(b, serie.unita);
    const colonna = el('div', 'terremoti-barra');
    colonna.title = `${lunga}: ${tn('terremoti.nEventi', b.n, { n: num(b.n) })}${b.magMax == null ? '' : ` · ${t('terremoti.magMax', { mag: b.magMax.toLocaleString(localeIntl(), { minimumFractionDigits: 1 }) })}`}`;
    const asta = el('i', b.sciame ? 'sciame' : null);
    asta.style.height = `${b.n ? Math.max(b.quota, 3) : 0}%`;
    if (grande) colonna.append(el('b', null, b.n ? num(b.n) : '')); // numero di eventi sopra ogni barra
    colonna.append(asta, el('span', null, (serie.barre.length - 1 - i) % ogni === 0 ? breve : ''));
    barre.append(colonna);
  });
  blocco.append(barre);
  const nota = serie.totale
    ? serie.barre.length === 1
      ? t('terremoti.serie.totaleUna', { n: num(serie.totale), mag: Math.max(filtro.magMin, MAG_STORICO) })
      : t('terremoti.serie.totale', { n: num(serie.totale), mag: Math.max(filtro.magMin, MAG_STORICO), soglia: serie.soglia, unita: testoUnita(serie.unita) })
    : t('terremoti.serie.vuota');
  blocco.append(el('p', 'scheda-nota', nota));
  if (serie.sequenze.length) {
    const elenco = el('div', 'terremoti-sequenze');
    elenco.append(el('h4', null, t('terremoti.sequenze')));
    for (const s of serie.sequenze.slice(0, grande ? 15 : 5)) {
      const riga = el('div', 'terremoti-sequenza');
      riga.append(
        el('strong', null, periodoSequenza(s, serie.unita)),
        el('span', null, `${s.barre > 1 ? t('terremoti.sequenza') : t('terremoti.sciame')} · ${tn('terremoti.nEventi', s.n, { n: num(s.n) })} · ${t('terremoti.magMax', { mag: s.magMax.toLocaleString(localeIntl(), { minimumFractionDigits: 1 }) })}`),
      );
      elenco.append(riga);
    }
    blocco.append(elenco);
  } else if (serie.totale && serie.barre.length > 1) blocco.append(el('p', 'scheda-nota', t('terremoti.nessunaSequenza')));
  return blocco;
}

// Contenuto della sezione: menu giorno/mese/anno (o periodo personalizzato) e barre; si ridisegna al cambio di unità,
// di periodo e di magnitudo minima. `area` = riquadro per il servizio INGV.
// Per lo storico: `sorgente()` dà gli eventi già in mappa e `adesso()` la fine del periodo mostrato, a cui ancorare le finestre dei grafici.
export function graficoSerie(area, apri, { sorgente = null, adesso = null } = {}) {
  const radice = el('div', 'terremoti-elenco');
  const corpo = el('div');
  let eventi = null; // serie di base: ultimi 5 anni, oppure gli eventi dello storico
  let eventiCustom = null; // eventi del periodo scelto nel menu «Eventi per»
  let periodoCustom = null;
  let unitaCustom = null;
  let baseInCorso = false;
  let periodoInCorso = null;
  let propria = sorgente ? 'mese' : null; // lo storico ha la sua unità: un periodo passato non si legge a giorni
  const unitaCorrente = () => (periodoCustom ? unitaCustom : propria ?? unita);
  const fineCorrente = () => (periodoCustom ? periodoCustom.a : adesso ? Math.min(adesso(), Date.now()) : Date.now());
  // Un intervallo lungo si legge per mese o per anno: il grafico resta leggibile senza chiedere una seconda scelta.
  const unitaDaPeriodo = p => {
    const giorni = (p.a - p.da) / GIORNO_MS;
    if (giorni <= 62) return 'giorno';
    const da = new Date(p.da), a = new Date(p.a);
    const mesi = (a.getFullYear() - da.getFullYear()) * 12 + (a.getMonth() - da.getMonth()) + 1;
    return mesi <= 24 ? 'mese' : 'anno';
  };
  const attesa = () => {
    const p = el('p', 'scheda-nota', t('terremoti.serie.carico'));
    p.append(iconaAttesa());
    return p;
  };
  const mostraErrore = riprova => {
    const b = el('button', 'scheda-filtro', t('terremoti.serie.riprova'));
    b.type = 'button';
    b.addEventListener('click', riprova);
    corpo.replaceChildren(el('p', 'scheda-nota', t('terremoti.serie.errore')), b);
  };
  const disegna = () => {
    const dati = periodoCustom ? eventiCustom : eventi;
    if (!dati) return;
    const u = unitaCorrente();
    const fine = fineCorrente();
    const g = puntiMagnitudo(dati, u, filtro.magMin, fine, periodoCustom);
    const archivio = !sorgente && !periodoCustom && u === 'anno' ? riepilogoArchivio(Math.max(filtro.magMin, MAG_STORICO), disegna) : null;
    const serie = archivio ? serieAnnuale(archivio.perMese) : serieEventi(dati, u, filtro.magMin, fine, periodoCustom);
    corpo.replaceChildren(disegnaSerie(serie), ...(archivio ? [el('p', 'scheda-nota', t('terremoti.serie.altriCinqueAnni'))] : []), disegnaMagnitudoTempo(g, apri), disegnaCurva(g, apri), disegnaRilascio(g, apri), disegnaOmori(g), disegnaAttese(g), disegnaSpazioTempo(g, apri));
  };
  const caricaBase = () => {
    if (baseInCorso) return;
    baseInCorso = true;
    corpo.replaceChildren(attesa());
    Promise.resolve().then(() => (sorgente ? sorgente() : caricaStorico(area))).then(e => {
      eventi = e;
      if (!periodoCustom) disegna(); // durante un periodo personalizzato comanda la sua richiesta
    }, () => { if (!periodoCustom) mostraErrore(caricaBase); }).finally(() => { baseInCorso = false; });
  };
  const caricaPeriodo = () => {
    const p = periodoCustom;
    if (!p || periodoInCorso === p) return;
    periodoInCorso = p;
    corpo.replaceChildren(attesa());
    caricaIntervallo(area, p.da, p.a).then(e => {
      if (periodoCustom !== p) return; // nel frattempo si è tornati a un'unità predefinita
      eventiCustom = e;
      disegna();
    }, () => { if (periodoCustom === p) mostraErrore(caricaPeriodo); }).finally(() => { if (periodoInCorso === p) periodoInCorso = null; });
  };
  const scelta = el('div', 'terremoti-filtri');
  const lab = el('label', 'terremoti-filtro terremoti-filtro-unita');
  const sel = el('select');
  for (const u of UNITA) {
    const o = el('option', null, testoUnita(u));
    o.value = u;
    sel.append(o);
  }
  const personalizzato = el('option', null, t('terremoti.periodoPersonalizzato'));
  personalizzato.value = 'personalizzato';
  sel.append(personalizzato);
  const nota = el('small', 'terremoti-periodo-nota');
  const allinea = () => {
    sel.value = periodoCustom ? 'personalizzato' : unitaCorrente();
    nota.hidden = !periodoCustom;
    nota.textContent = periodoCustom ? t('terremoti.perUnitaPersonalizzato', { periodo: testoPeriodoBreve(periodoCustom), unita: testoUnita(unitaCorrente()) }) : '';
  };
  sel.addEventListener('change', () => {
    if (sel.value === 'personalizzato') {
      apriDialogoPeriodo({
        da: periodoCustom?.da ?? null,
        a: periodoCustom?.a ?? null,
        alApplica: p => {
          periodoCustom = p;
          unitaCustom = unitaDaPeriodo(p);
          eventiCustom = null;
          allinea();
          caricaPeriodo();
        },
        limiteGiorni: 1832, // il grafico parte dagli ultimi 5 anni: oltre, l'archivio si legge per anno
        alChiudi: allinea,
      });
      return;
    }
    periodoCustom = null;
    unitaCustom = null;
    eventiCustom = null;
    if (propria) propria = sel.value; else unita = sel.value;
    allinea();
    if (eventi) disegna(); else caricaBase();
  });
  lab.append(el('span', null, t('terremoti.perUnita')), sel, nota);
  scelta.append(lab);
  radice.append(scelta, corpo);
  const segui = () => (radice.isConnected ? disegna() : document.removeEventListener(EVENTO_FILTRO, segui));
  document.addEventListener(EVENTO_FILTRO, segui);
  allinea();
  caricaBase();
  return radice;
}
