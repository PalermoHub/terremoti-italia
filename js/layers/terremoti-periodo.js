import { t, localeIntl } from '../core/i18n.js';
import { AREA_EVENTI } from '../core/config.js';
import { scaricaEventiTutti, eventoDaIngv, accordionTerremoti, MAX_ELENCO } from './scheda-terremoti.js';
import { disegnaAccordion } from '../core/scheda-disegno.js';
import { ANNO_INIZIO, periodoValido } from './scheda-archivio.js';
import { CLASSI_PROFONDITA } from './scheda-sezione.js';
import { scelta, sceltaPeriodo, stato } from './terremoti-archivio.js';
import { creaInterazione } from './scheda-terremoti-dom.js';
import { evidenziaEventi, nascondiEvidenzaEventi } from '../core/evidenza-eventi.js';

// Parti comuni degli strati che mostrano un anno (o un periodo) dell'archivio in un modo diverso dai cerchi:
// scarico degli eventi di tutta Italia e pannello con periodo, magnitudo minima e «Mostra».
const MAGNITUDO = [2, 2.5, 3, 4, 5];
const MAG_PREDEFINITA = 3;

export const numero = (n, d = 0) => n.toLocaleString(localeIntl(), { minimumFractionDigits: d, maximumFractionDigits: d });
export const el = (tag, classe, testo) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
};
const annoRoma = ts => Number(new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome', year: 'numeric' }));
const giorno = ts => new Date(ts).toLocaleDateString(localeIntl(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Eventi del periodo con magnitudo ≥ magMin in tutta Italia, come proprietà piatte con lon, lat e anno
export async function eventiPeriodo(periodo, magMin, area = AREA_EVENTI) {
  const scarico = await scaricaEventiTutti({ da: periodo.da, a: periodo.a, magMin, area });
  const eventi = scarico.eventi.map(f => eventoDaIngv(f, Infinity)).filter(Boolean)
    .map(f => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], anno: annoRoma(f.properties.ts), fascia: 'Archivio storico' }));
  return { eventi, troncato: scarico.troncato };
}

// Pannello della legenda: `alMostra({ periodo, mag })` scarica e disegna, e risponde { n, troncato } (null se superata da una richiesta più recente).
// `extra` = altre scelte (come `scelta`: { nodo, valore }) che stanno accanto a periodo e magnitudo.
export function pannelloPeriodo({ titolo, extra = [], alMostra, ancora = [] }) {
  const nodo = el('div', 'terremoti-pannello terremoti-archivio');
  const { messaggio, esegui } = stato();
  const adesso = new Date().getUTCFullYear();
  const anni = Array.from({ length: adesso - ANNO_INIZIO + 1 }, (_, i) => adesso - i);
  const periodo = sceltaPeriodo(t('terremoti.arc.anno'), anni, adesso - 1);
  const mag = scelta(t('terremoti.arc.magMin'), MAGNITUDO, MAG_PREDEFINITA, m => `≥ ${numero(m, m % 1 ? 1 : 0)}`);
  const filtri = el('div', 'terremoti-filtri');
  filtri.append(periodo.nodo, mag.nodo, ...extra.map(e => e.nodo));
  const bottone = el('button', 'terremoti-archivio-btn', t('terremoti.arc.mostraBtn'));
  bottone.type = 'button';
  const nota = el('p', 'uffici-nota');
  const mostra = () => {
    const p = periodo.valore();
    const errore = periodoValido(p);
    if (errore) { messaggio.textContent = t(errore); return; }
    esegui(nodo, async () => {
      const r = await alMostra({ periodo: p, mag: mag.valore() });
      if (!r) return;
      nota.textContent = r.n
        ? [t('terremoti.per.nota', { n: numero(r.n), da: giorno(p.da), a: giorno(p.a), mag: numero(mag.valore(), mag.valore() % 1 ? 1 : 0) }), r.troncato ? t('terremoti.per.troncato') : '', r.testo ?? ''].filter(Boolean).join(' ')
        : t('terremoti.arc.nessunEvento');
    }, mostra);
  };
  bottone.addEventListener('click', mostra);
  nodo.append(el('strong', null, titolo), filtri, bottone, nota, messaggio, ...ancora, el('p', 'uffici-nota', t('terremoti.arc.utc')), creditoIngv());
  return { nodo, mostra };
}

// Righe di legenda dei colori per profondità: una riga per classe, con il campione e l'intervallo in km
export function legendaProfondita() {
  const blocco = el('div', 'terremoti-sezione-prof');
  CLASSI_PROFONDITA.forEach((c, i) => {
    const riga = el('div');
    const chip = el('i', 'incendi-campione');
    chip.style.background = c.colore;
    const da = i ? CLASSI_PROFONDITA[i - 1].fino : 0;
    riga.append(chip, c.fino === Infinity ? `≥ ${da} km` : i ? `${da}–${c.fino} km` : `< ${c.fino} km`);
    blocco.append(riga);
  });
  return blocco;
}

// Legenda in mappa di uno strato (in #legende, nascosta finché lo strato è spento): si sposta sotto lo strato con «Legende sulla mappa» spento.
// Il suo selettore è `.lg-<id>`, da dichiarare come `legendaPannello` dello strato.
export function legendaMappa(id, titolo, corpo) {
  const nodo = el('div', `legenda legenda-monumenti lg-${id}`);
  nodo.hidden = true;
  nodo.append(el('strong', null, titolo), ...corpo);
  document.getElementById('legende')?.append(nodo);
  return nodo;
}

// Credito INGV in fondo alla legenda
export function creditoIngv() {
  const credito = el('p', 'uffici-nota');
  credito.append(`${t('terremoti.dati')} `, Object.assign(el('a', null, 'INGV'), { href: 'https://terremoti.ingv.it/', target: '_blank', rel: 'noopener' }));
  return credito;
}

// Elenco degli eventi di una mappa, nelle stesse card dell'elenco «Gli altri terremoti» della scheda.
// `eventi()` = eventi mostrati; `mappa()` = la mappa dello strato (può non esserci ancora): il passaggio del mouse su una card accende l'evento in mappa, senza muoverla; si ordina per magnitudo, più recenti o profondità (al massimo MAX_ELENCO card). `aggiorna()` lo ridisegna.
const ORDINI = {
  magnitudo: (a, b) => b.mag - a.mag || b.ts - a.ts,
  recenti: (a, b) => b.ts - a.ts,
  profondita: (a, b) => (b.prof ?? -1) - (a.prof ?? -1),
};
export function elencoEventi(eventi, mappa = () => null) {
  const interazione = creaInterazione({ evidenzia: ev => evidenziaEventi(mappa(), ev, { inquadra: false }), nascondi: () => nascondiEvidenzaEventi(mappa()) });
  const suRiga = (e, riga) => {
    riga.addEventListener('pointerenter', () => interazione.mostra([e.evento], riga));
    riga.addEventListener('pointerleave', () => interazione.pulisci(riga));
    riga.addEventListener('focusin', () => interazione.mostra([e.evento], riga));
    riga.addEventListener('focusout', () => interazione.pulisci(riga));
  };
  const nodo = el('div', 'terremoti-elenco');
  const lab = el('label', 'terremoti-filtro');
  const sel = el('select');
  for (const chiave of Object.keys(ORDINI)) {
    const o = el('option', null, t(`terremoti.elenco.ordine.${chiave}`));
    o.value = chiave;
    sel.append(o);
  }
  lab.append(el('span', null, t('terremoti.elenco.ordina')), sel);
  const corpo = el('div');
  const aggiorna = () => {
    const tutti = [...eventi()].sort(ORDINI[sel.value]);
    const elenco = { n: tutti.length, mostrati: tutti.slice(0, MAX_ELENCO) };
    interazione.ferma();
    corpo.replaceChildren(elenco.n
      ? disegnaAccordion({ ...accordionTerremoti(elenco), aperto: true, riassunto: elenco.n > MAX_ELENCO ? t('terremoti.elenco.parziale', { mostrati: numero(MAX_ELENCO), n: numero(elenco.n) }) : t('terremoti.elenco.tutti', { n: numero(elenco.n) }) }, suRiga)
      : el('p', 'scheda-nota', t('terremoti.elenco.vuoto')));
  };
  sel.addEventListener('change', aggiorna);
  nodo.append(el('strong', null, t('terremoti.elenco.titolo')), lab, corpo);
  aggiorna();
  return { nodo, aggiorna };
}
