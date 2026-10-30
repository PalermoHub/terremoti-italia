// «Cerca eventi attorno a un punto»: un raggio regolabile dalla legenda. Acceso, il clic sulla mappa disegna
// il cerchio e apre la scheda con i terremoti entro quel raggio (in tempo reale e archivio, secondo gli strati accesi).
// Il raggio è uno solo per tutta l'app; stato e valore stanno in localStorage.
import { t, localeIntl } from './i18n.js';
import { badgeMagnitudo } from './badge-magnitudo.js';

export const CHIAVE_RAGGIO = 'dt-raggio-vicini';
export const CHIAVE_CERCHIO = 'dt-raggio-cerchio';
export const CHIAVE_ATTIVO = 'dt-raggio-attivo';
export const RAGGIO_MIN = 200; // metri
export const RAGGIO_MAX = 50000;
export const RAGGIO_PASSO = 50;
export const RAGGIO_INIZIALE = 30000; // metri: per i terremoti un raggio urbano non troverebbe quasi mai nulla, e con 10 km e pochi giorni quasi ovunque la lista è vuota
export const EVENTO_RAGGIO = 'dt:raggio'; // sul document a ogni modifica (raggio, cerchio o interruttore): la scheda aperta si rifà
export const MASSIMO_VICINI = 50; // righe in scheda: oltre non si leggono, e con uno sciame sarebbero migliaia

// Valore valido più vicino: numero tra min e max, a passi interi; il resto torna al valore iniziale.
export function normalizzaRaggio(v) {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return RAGGIO_INIZIALE;
  return Math.min(RAGGIO_MAX, Math.max(RAGGIO_MIN, Math.round(n / RAGGIO_PASSO) * RAGGIO_PASSO));
}

// Metri → «10 km» / «200 m» (unità e separatori della lingua corrente)
export function formattaDistanza(m) {
  const km = Number(m) >= 1000;
  const numero = new Intl.NumberFormat(localeIntl(), {
    style: 'unit',
    unit: km ? 'kilometer' : 'meter',
    maximumFractionDigits: km ? 1 : 0,
  });
  return numero.format(km ? Number(m) / 1000 : Number(m));
}

export const formattaRaggio = formattaDistanza;

let corrente = RAGGIO_INIZIALE;
let attivo = false; // la ricerca parte spenta: un clic continua ad aprire la scheda del punto cliccato
let cerchio = true; // il cerchio in mappa, quando la ricerca è accesa
export const raggioVicini = () => corrente;
export const raggioAttivo = () => attivo;
// Con la ricerca accesa il puntatore sulla mappa diventa un crocicchio (classe sul body, vedi css/app.css)
const segnaAttivo = () => document.body?.classList.toggle('raggio-attivo', attivo);
export const cerchioVisibile = () => cerchio;

export function caricaRaggio(storage) {
  try {
    corrente = normalizzaRaggio(storage?.getItem(CHIAVE_RAGGIO));
    attivo = storage?.getItem(CHIAVE_ATTIVO) === '1';
    cerchio = storage?.getItem(CHIAVE_CERCHIO) !== '0';
  } catch {
    corrente = RAGGIO_INIZIALE;
    attivo = false;
    cerchio = true;
  }
  segnaAttivo();
  return corrente;
}

export function caricaCerchio(storage) {
  try { cerchio = storage?.getItem(CHIAVE_CERCHIO) !== '0'; } catch { cerchio = true; }
  return cerchio;
}

export function impostaCerchio(v, storage = null) {
  cerchio = Boolean(v);
  try { storage?.setItem(CHIAVE_CERCHIO, cerchio ? '1' : '0'); } catch { /* storage bloccato: vale la sessione */ }
  return cerchio;
}

export function impostaRaggio(v, storage = null) {
  corrente = normalizzaRaggio(v);
  try { storage?.setItem(CHIAVE_RAGGIO, String(corrente)); } catch { /* storage bloccato: vale la sessione */ }
  return corrente;
}

export function impostaAttivo(v, storage = null) {
  attivo = Boolean(v);
  segnaAttivo();
  try { storage?.setItem(CHIAVE_ATTIVO, attivo ? '1' : '0'); } catch { /* storage bloccato: vale la sessione */ }
  return attivo;
}

// Interruttore + cursore + interruttore del cerchio da mettere nel riquadro della legenda; restituisce il nodo.
// Con la ricerca spenta restano visibili solo l'interruttore e la sua spiegazione; accesa, mostra anche i filtri
// (`filtri()` restituisce il nodo con periodo, magnitudo e profondità: sono quelli condivisi con la mappa).
export function creaRegolatoreRaggio(storage = null, { filtri = null } = {}) {
  caricaRaggio(storage);
  const box = document.createElement('div');
  box.className = 'legende-raggio';

  const testa = document.createElement('label');
  testa.className = 'legende-raggio-cerchio legende-raggio-attivo';
  testa.title = t('raggio.descrizione');
  const casellaAttivo = Object.assign(document.createElement('input'), { type: 'checkbox', checked: attivo });
  casellaAttivo.setAttribute('role', 'switch');
  casellaAttivo.dataset.raggio = 'attivo';

  const opzioni = document.createElement('div');
  opzioni.className = 'legende-raggio-opzioni';

  const testo = document.createElement('span');
  testo.className = 'legende-raggio-testo';
  testo.id = 'raggio-etichetta';
  const cursore = Object.assign(document.createElement('input'), {
    type: 'range', min: RAGGIO_MIN, max: RAGGIO_MAX, step: RAGGIO_PASSO, value: corrente, id: 'raggio-cursore',
  });
  cursore.setAttribute('aria-labelledby', testo.id);
  const mostra = () => { testo.textContent = t('legenda.raggio.etichetta', { r: formattaRaggio(corrente) }); };
  cursore.addEventListener('input', () => {
    impostaRaggio(cursore.value, storage);
    mostra();
    document.dispatchEvent(new Event(EVENTO_RAGGIO));
  });

  const interruttore = document.createElement('label');
  interruttore.className = 'legende-raggio-cerchio';
  const casella = Object.assign(document.createElement('input'), { type: 'checkbox', checked: cerchio });
  casella.setAttribute('role', 'switch');
  casella.addEventListener('change', () => { impostaCerchio(casella.checked, storage); document.dispatchEvent(new Event(EVENTO_RAGGIO)); });
  interruttore.append(t('legenda.raggio.cerchio'), casella);

  casellaAttivo.addEventListener('change', () => {
    impostaAttivo(casellaAttivo.checked, storage);
    aggiorna();
    document.dispatchEvent(new Event(EVENTO_RAGGIO));
  });

  function aggiorna() {
    opzioni.hidden = !attivo;
    if (attivo && filtri && !nodoFiltri) { nodoFiltri = filtri(); nodoFiltri.classList.add('legende-raggio-filtri'); opzioni.append(nodoFiltri); }
    casellaAttivo.checked = attivo;
    casella.checked = cerchio;
    cursore.value = corrente;
    mostra();
  }

  testa.append(t('raggio.attivo'), casellaAttivo);
  opzioni.append(testo, cursore, interruttore);
  let nodoFiltri = null; // creato alla prima accensione: i menu seguono già il filtro condiviso, non serve prima
  box.append(testa, opzioni);
  aggiorna();
  return box;
}

// Eventi dei moduli entro `raggioM` dal punto: i moduli espongono `scheda.eventiVicini(lngLat, raggioM)` e
// restituiscono { id, mag, luogo, colore, quando, distanzaM, apri }. Un evento presente in due strati conta una volta.
export function eventiVicini(moduli, lngLat, raggioM) {
  const visti = new Set();
  const tutti = [];
  for (const m of moduli) {
    for (const e of m.scheda?.eventiVicini?.(lngLat, raggioM) ?? []) {
      if (!(e.distanzaM <= raggioM)) continue;
      const chiave = String(e.id ?? `${e.lon},${e.lat},${e.ts}`);
      if (visti.has(chiave)) continue;
      visti.add(chiave);
      tutti.push(e);
    }
  }
  tutti.sort((a, b) => a.distanzaM - b.distanzaM);
  return { eventi: tutti.slice(0, MASSIMO_VICINI), totale: tutti.length };
}

// Voce della scheda con la lista degli eventi nel raggio (vedi scheda-disegno.js): `dinamico` perché ogni riga è un pulsante.
export function voceEventiVicini({ eventi, totale }, raggioM) {
  return {
    chiave: 'raggio:eventi', tipo: 'terremoto', peso: 8, titolo: t('raggio.titolo', { r: formattaRaggio(raggioM) }), icona: 'terremoto', sempre: true,
    ...(totale ? { badge: String(totale) } : {}),
    gruppi: [], dinamico: () => elencoVicini(eventi, totale, raggioM),
  };
}

const numero = n => Number(n).toLocaleString(localeIntl(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function nota(testo) {
  const p = document.createElement('p');
  p.className = 'scheda-nota raggio-nota';
  p.textContent = testo;
  return p;
}

function elencoVicini(eventi, totale, raggioM) {
  const box = document.createElement('div');
  box.className = 'raggio-elenco';
  if (!eventi.length) {
    box.append(nota(t('raggio.vuoto', { r: formattaRaggio(raggioM) })));
    return box;
  }
  const lista = document.createElement('ul');
  lista.className = 'raggio-lista';
  for (const e of eventi) {
    const voce = document.createElement('li');
    const bottone = document.createElement('button');
    bottone.type = 'button';
    bottone.className = 'raggio-evento';
    const punto = document.createElement('i');
    punto.className = 'raggio-punto';
    punto.style.background = e.colore ?? 'currentColor';
    const magnitudo = badgeMagnitudo(e.mag, t('raggio.mag', { m: numero(e.mag) }));
    magnitudo.className += ' raggio-mag';
    const distanza = document.createElement('span');
    distanza.className = 'raggio-distanza';
    distanza.textContent = formattaDistanza(e.distanzaM);
    const luogo = document.createElement('span');
    luogo.className = 'raggio-luogo';
    luogo.textContent = e.luogo || t('terremoti.zonaSconosciuta');
    const quando = document.createElement('span');
    quando.className = 'raggio-quando';
    quando.textContent = e.quando ?? '';
    bottone.title = t('raggio.apri', { luogo: luogo.textContent });
    bottone.append(punto, magnitudo, distanza, luogo, quando);
    bottone.addEventListener('click', () => e.apri?.());
    voce.append(bottone);
    lista.append(voce);
  }
  box.append(lista);
  if (totale > eventi.length) box.append(nota(t('raggio.troncato', { mostrati: eventi.length, tot: totale })));
  box.append(nota(t('raggio.nota')));
  return box;
}
