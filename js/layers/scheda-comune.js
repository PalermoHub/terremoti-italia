// Modello del comune cliccato in mappa: quanti terremoti ci sono stati di recente e quanti anno per anno dal 1985.
// Gli eventi arrivano dal nostro archivio (GET /terremoti) ristretto al riquadro del comune e si contano solo se l'epicentro
// cade dentro il confine comunale (puntoInGeometrie): il riquadro serve a scaricare meno eventi, non a contare.
import { t, tl, localeIntl } from '../core/i18n.js';
import { puntoInGeometrie } from '../core/aree.js';
import { iconaAttesa, righe } from '../core/scheda-util.js';
import { badgeMagnitudo } from '../core/badge-magnitudo.js';
import { disegnaAccordion } from '../core/scheda-disegno.js';
import { ANNO_INIZIO } from './scheda-archivio.js';
import { FONTE, LINK, LINK_SHAKEMAP, accordionTerremoti, haShakeMap, eventiDaTesto, oraEvento, rispostaDaArchivio, scaricaEventi } from './scheda-terremoti.js';

export const PESO_COMUNE = 9; // dopo la scheda dell'evento (peso 8), nello stesso tab «Luogo»
export const MAG_RECENTE = 1; // ultimi 30 giorni: la stessa soglia dello strato in tempo reale
export const MAG_STORICO = 2; // anni: la stessa soglia dell'archivio storico
const GIORNI_RECENTI = 30;
const GIORNO_MS = 86400000;
const ATTESE = 6; // richieste in parallelo: una per anno
const PASSO_ELENCO = 10; // eventi mostrati nell'elenco, e quanti se ne aggiungono a ogni «Mostra altri»

const el = (tag, classe, testo) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
};

const numero = n => n.toLocaleString(localeIntl());
const magnitudo = m => m.toLocaleString(localeIntl(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dataBreve = ts => new Date(ts).toLocaleDateString(localeIntl(), { day: 'numeric', month: 'short', year: 'numeric' });

// Riquadro [ovest, sud, est, nord] che contiene le geometrie (Polygon/MultiPolygon) del comune
export function riquadroDa(geometrie) {
  let o = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const visita = c => {
    if (typeof c[0] === 'number') { o = Math.min(o, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); }
    else c.forEach(visita);
  };
  for (const g of geometrie) visita((g?.coordinates ?? []));
  return [o, s, e, n];
}

// Feature dell'archivio → evento da contare; null se mancano coordinate, ora o magnitudo
export function eventoDaFeature(f) {
  const [lon, lat] = f?.geometry?.coordinates ?? [];
  const p = f?.properties ?? {};
  const ts = oraEvento(p.time);
  const mag = Number(p.mag);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(ts) || !Number.isFinite(mag)) return null;
  return { id: String(p.eventId), ts, mag, lon, lat, luogo: p.place ?? '' };
}

const dentroComune = (geometrie, e) => puntoInGeometrie(e.lon, e.lat, geometrie);

// Totale degli eventi del comune dal 1985 (M ≥ 2), per il tooltip: una sola richiesta in formato testo ristretta al riquadro,
// poi si contano gli epicentri dentro il confine (gli stessi della scheda). Senza server (la pagina pubblicata, o l'app aperta
// da un qualsiasi servizio di file) gli stessi eventi arrivano dai file per anno dell'archivio statico, come per la scheda:
// così il totale del tooltip e quello della scheda sono sempre lo stesso numero. null se non risponde né il server né l'archivio.
export async function totaleComune({ geometrie, riquadro }, { fetchFn = fetch, adesso = Date.now() } = {}) {
  const [o, s, e, n] = riquadro ?? riquadroDa(geometrie);
  const da = Date.UTC(ANNO_INIZIO, 0, 1);
  const q = new URLSearchParams({ formato: 'testo', da: String(da), a: String(adesso), magmin: String(MAG_STORICO), bbox: [o, s, e, n].join(','), limite: '200000' });
  const r = await fetchFn(`/terremoti?${q}`).catch(() => null);
  if (r?.ok) {
    return eventiDaTesto(await r.text())
      .filter(ev => Number.isFinite(ev.lon) && Number.isFinite(ev.lat) && puntoInGeometrie(ev.lon, ev.lat, geometrie)).length;
  }
  // niente server: gli stessi eventi dai file per anno, senza tetto (una sequenza dentro un comune supera i 5000 della mappa)
  try {
    const { eventi } = await rispostaDaArchivio({ da, a: adesso, magMin: MAG_STORICO }, fetchFn, Infinity);
    return eventi.map(eventoDaFeature).filter(Boolean).filter(ev => dentroComune(geometrie, ev)).length;
  } catch { return null; }
}

// Conteggi del comune: `recente` (M ≥ 1, ultimi 30 giorni), `anni` (M ≥ 2, uno per anno dal 1985), il più forte e i totali.
// Un anno che non risponde resta senza numero (`n: null`) e la scheda avvisa che i conteggi sono incompleti.
export async function contaComune({ geometrie, riquadro }, { fetchFn = fetch, adesso = Date.now() } = {}) {
  const [o, s, e, n] = riquadro ?? riquadroDa(geometrie);
  const area = { minlon: o, minlat: s, maxlon: e, maxlat: n };
  const scarica = async (da, a, magMin) => {
    const r = await scaricaEventi({ da, a, magMin, area, fetchFn, adesso });
    return { eventi: (r.eventi ?? []).map(eventoDaFeature).filter(Boolean).filter(ev => dentroComune(geometrie, ev)), troncato: Boolean(r.troncato) };
  };
  const recenti = await scarica(adesso - GIORNI_RECENTI * GIORNO_MS, adesso, MAG_RECENTE);
  const dopo = giorni => adesso - giorni * GIORNO_MS;
  const recente = {
    giorni1: recenti.eventi.filter(ev => ev.ts >= dopo(1)).length,
    giorni7: recenti.eventi.filter(ev => ev.ts >= dopo(7)).length,
    giorni30: recenti.eventi.length,
  };
  const annoCorrente = new Date(adesso).getUTCFullYear();
  const anniElenco = [];
  for (let anno = ANNO_INIZIO; anno <= annoCorrente; anno++) anniElenco.push(anno);
  const esiti = new Array(anniElenco.length).fill(null);
  let prossimo = 0;
  const operaio = async () => {
    while (prossimo < anniElenco.length) {
      const i = prossimo++;
      const anno = anniElenco[i];
      try { esiti[i] = await scarica(Date.UTC(anno, 0, 1), Date.UTC(anno + 1, 0, 1) - 1, MAG_STORICO); } catch { esiti[i] = null; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(ATTESE, anniElenco.length) }, operaio));
  const anni = anniElenco.map((anno, i) => {
    const r = esiti[i];
    if (!r) return { anno, n: null, magMax: null };
    return { anno, n: r.eventi.length, magMax: r.eventi.reduce((m, ev) => (m == null || ev.mag > m ? ev.mag : m), null) };
  });
  const tutti = esiti.filter(Boolean).flatMap(r => r.eventi);
  const forte = [...tutti, ...recenti.eventi].reduce((a, b) => (!a || b.mag > a.mag ? b : a), null);
  const conNumero = anni.filter(a => a.n != null);
  // elenco dal più recente: gli ultimi 30 giorni (M ≥ 1) e l'archivio (M ≥ 2) si sovrappongono, un evento conta una volta sola
  const visti = new Set();
  const elenco = [...recenti.eventi, ...tutti].filter(ev => !visti.has(ev.id) && visti.add(ev.id)).sort((a, b) => b.ts - a.ts);
  const parziale = anniElenco.some((_, i) => esiti[i] === null) || Boolean(recenti.troncato);
  return {
    anni,
    recente,
    forte,
    elenco,
    parziale,
    totale: conNumero.reduce((somma, a) => somma + a.n, 0),
    questAnno: anni.at(-1).n,
    annoTop: conNumero.reduce((a, b) => (b.n > a.n ? b : a), conNumero[0] ?? null),
  };
}

// Riga «etichetta · valore» della card
function riga(etichetta, valore) {
  const p = el('p', 'comune-sismico-riga');
  const v = el('strong');
  v.append(...[].concat(valore));
  p.append(el('span', 'comune-sismico-etichetta', etichetta), v);
  return p;
}

// Serie anno per anno: una barra per anno, alta quanto il numero di eventi rispetto all'anno più sismico
function serie(anni, annoCorrente) {
  const massimo = Math.max(1, ...anni.map(a => a.n ?? 0));
  const barre = el('div', 'comune-sismico-serie');
  for (const a of anni) {
    const barra = el('i');
    barra.style.height = `${a.n ? Math.max(3, a.n / massimo * 100) : 0}%`;
    barra.title = a.n == null ? `${a.anno}: ${t('comune.sismico.nonDisponibile')}` : t('comune.sismico.barra', { anno: a.anno, n: numero(a.n) });
    if (a.anno === annoCorrente) barra.classList.add('oggi');
    barre.append(barra);
  }
  const etichette = el('div', 'comune-sismico-anni');
  const primo = anni[0]?.anno ?? '';
  const ultimo = anni.at(-1)?.anno ?? '';
  const mezzo = Math.round((Number(primo) + Number(ultimo)) / 2);
  etichette.append(el('span', null, String(primo)), el('span', null, String(mezzo)), el('span', null, String(ultimo)));
  return [el('p', 'comune-sismico-titolo', t('comune.sismico.perAnno')), barre, etichette];
}

const linkShakeMap = id => Object.assign(el('a', 'comune-sismico-link', t('comune.sismico.shakemap')), { href: LINK_SHAKEMAP + id, target: '_blank', rel: 'noopener' });

// Elenco degli eventi dal più recente: una riga per evento (data, magnitudo, luogo, link INGV), a blocchi con «Mostra altri»
function elencoEventi(eventi) {
  const altri = el('button', 'comune-sismico-altri');
  altri.type = 'button';
  const titolo = () => t('comune.sismico.elenco', { n: numero(eventi.length) });
  // tutti gli eventi stanno in un accordion, come negli altri elenchi dell'app (disegnaAccordion): ogni evento è una card espandibile
  const blocco = disegnaAccordion({ ...accordionTerremoti({ n: eventi.length, mostrati: eventi.slice(0, PASSO_ELENCO) }), aperto: true, riassunto: titolo() });
  let mostrati = Math.min(eventi.length, PASSO_ELENCO);
  const aggiorna = () => {
    altri.hidden = mostrati >= eventi.length;
    altri.textContent = t('comune.sismico.altri', { n: numero(eventi.length - mostrati) });
  };
  altri.addEventListener('click', () => {
    const prossimi = disegnaAccordion(accordionTerremoti({ n: eventi.length, mostrati: eventi.slice(mostrati, mostrati + PASSO_ELENCO) }));
    blocco.append(...prossimi.querySelectorAll(':scope > .scheda-tipo'));
    mostrati = Math.min(eventi.length, mostrati + PASSO_ELENCO);
    aggiorna();
  });
  aggiorna();
  return [blocco, altri];
}

// Contenuto della card: numeri, serie per anno, evento più forte e nota sulla fonte
export function quadroComune(d) {
  const annoCorrente = d.anni.at(-1)?.anno ?? new Date().getUTCFullYear();
  const nodi = [
    riga(t('comune.sismico.recente'), numero(d.recente.giorni30)),
    riga(t('comune.sismico.questAnno'), d.questAnno == null ? t('comune.sismico.nonDisponibile') : numero(d.questAnno)),
    riga(t('comune.sismico.totale', { anno: ANNO_INIZIO }), numero(d.totale)),
  ];
  if (d.annoTop?.n) nodi.push(riga(t('comune.sismico.annoTop'), `${d.annoTop.anno} · ${numero(d.annoTop.n)}`));
  if (d.forte) {
    nodi.push(riga(t('comune.sismico.forte'), [badgeMagnitudo(d.forte.mag, `M ${magnitudo(d.forte.mag)}`), ` · ${dataBreve(d.forte.ts)}`]));
    const dove = el('p', 'uffici-nota comune-sismico-dove');
    if (d.forte.luogo) dove.append(`${d.forte.luogo} · `);
    const link = el('a', 'comune-sismico-link', t('comune.sismico.schedaIngv'));
    link.href = LINK + d.forte.id;
    link.target = '_blank';
    link.rel = 'noopener';
    dove.append(link);
    if (haShakeMap(d.forte)) dove.append(' · ', linkShakeMap(d.forte.id));
    nodi.push(dove);
  }
  if (!d.totale && !d.recente.giorni30) nodi.push(el('p', 'uffici-nota', t('comune.sismico.nessuno')));
  else nodi.push(...serie(d.anni, annoCorrente));
  if (d.elenco?.length) nodi.push(...elencoEventi(d.elenco));
  if (d.parziale) nodi.push(el('p', 'uffici-nota', t('comune.sismico.parziale')));
  nodi.push(el('p', 'uffici-nota', t('comune.sismico.nota')));
  return nodi;
}

// Disegna la card e fa partire il conteggio: il resto della scheda è già visibile, i numeri arrivano quando ci sono
function disegna(carica) {
  const nodo = el('div', 'comune-sismico');
  const attesa = el('p', 'uffici-nota', t('comune.sismico.calcolo'));
  attesa.append(iconaAttesa()); // l'iconcina che gira al posto dei puntini
  nodo.append(attesa);
  carica().then(d => nodo.replaceChildren(...quadroComune(d))).catch(() => nodo.replaceChildren(el('p', 'uffici-nota', t('comune.sismico.errore'))));
  return nodo;
}

// Voce della scheda per il comune cliccato: nome, contesto e codice ISTAT subito, conteggi quando l'archivio risponde (una richiesta sola per scheda)
// Zona sismica e fascia di ag sono le stesse del tooltip «Territorio»: `zona` = sigla della classificazione (es. «2B»),
// `ag` = fascia di pericolosità sul punto cliccato (testo e zona dedotta, vedi fasciaAlPunto in layers/pericolosita.js)
export function voceComune({ cod, nome, geometrie }, { provincia = '', regione = '', zona = '', ag = null } = {}) {
  let calcolo = null;
  const carica = () => calcolo ??= contaComune({ geometrie });
  return {
    chiave: `comune-${cod}`, tipo: 'comune', peso: PESO_COMUNE, titolo: t('comune.sismico.titolo'), icona: 'terremoto', sempre: true,
    gruppi: [{ righe: righe([[t('comune.sismico.comune'), nome], [t('comune.sismico.provincia'), provincia], [t('comune.sismico.regione'), regione], [t('comune.sismico.codice'), cod],
      [t('comune.sismico.zona'), zona], [t('comune.sismico.ag'), ag ? `${ag.intervallo} g` : ''],
      // la zona dedotta dalla fascia sta fuori se c'è la zona vera della classificazione
      [t('comune.sismico.zonaDedotta'), ag && !zona ? ag.zona : '']]) }],
    dinamico: () => disegna(carica),
    fonte: t('layer.fonte', { fonte: tl(FONTE) }),
  };
}
