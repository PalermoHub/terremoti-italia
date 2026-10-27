import { tl } from './i18n.js';
// Voci di legenda che fanno da filtro: una casella accanto al simbolo, sempre accesa all'inizio.
// Le legende stanno in #legende e compaiono solo a strato acceso; stile e struttura sono quelli di monumenti.
// Stato delle caselle di un gruppo dopo il clic sulla voce `k`: la voce diventa l'unica accesa; se era già l'unica accesa
// si torna a tutte accese. (Il clic non spegne una voce: per vederne due o più si usa «solo questa» e poi le altre.)
export function dopoClic(stati, k) {
  const soloQuesta = stati[k] && stati.every((acceso, i) => i === k || !acceso);
  return stati.map((_, i) => (soloQuesta ? true : i === k));
}

// Indici delle voci il cui stato è cambiato tra `prima` e `dopo`: sono quelle di cui il layer va avvisato. Si confronta con lo stato di prima,
// non con la casella: quella cliccata il browser l'ha già invertita, e il layer non ne sa nulla.
export const vociCambiate = (prima, dopo) => prima.flatMap((p, i) => (p !== dopo[i] ? [i] : []));

// Filtro a selezione multipla (per le legende con tante voci, come le zone OMI): con tutto acceso il clic su `voci` (una voce, o le voci
// di una fascia) lascia accese solo quelle; poi ogni clic le aggiunge se erano spente o le toglie se erano accese. Se non resta nulla
// si torna a tutto acceso: il secondo clic sull'unica voce selezionata rimostra tutto. Restituisce il nuovo insieme di voci accese.
export function dopoClicMultiplo(accese, tutte, voci) {
  if (accese.size >= tutte.length) return new Set(voci);
  const prossime = new Set(accese);
  if (voci.some(v => accese.has(v))) voci.forEach(v => prossime.delete(v));
  else voci.forEach(v => prossime.add(v));
  return prossime.size ? prossime : new Set(tutte);
}

// Righe di filtro dello stesso gruppo (stesso contenitore) della riga data.
const gruppoDi = riga => [...(riga.parentElement?.children ?? [])].filter(r => r._filtro?.esclusivo);

// `esclusivo` = la voce fa parte di un gruppo di categorie in cui il clic seleziona solo quella; con false (o da sola nel
// gruppo) la casella accende e spegne la voce.
export function voceFiltro(simbolo, testo, suCambio, attiva = true, esclusivo = true) {
  const riga = document.createElement('label');
  riga.className = 'monumenti-cat';
  const casella = document.createElement('input');
  casella.type = 'checkbox';
  casella.checked = attiva;
  riga._filtro = { casella, suCambio, esclusivo };
  casella.addEventListener('change', () => {
    const gruppo = gruppoDi(riga);
    if (!esclusivo || gruppo.length < 2) return suCambio(casella.checked);
    const k = gruppo.indexOf(riga);
    const prima = gruppo.map((r, i) => (i === k ? !casella.checked : r._filtro.casella.checked));
    const dopo = dopoClic(prima, k);
    gruppo.forEach((r, i) => { r._filtro.casella.checked = dopo[i]; });
    for (const i of vociCambiate(prima, dopo)) gruppo[i]._filtro.suCambio(dopo[i]);
  });
  riga.append(casella, simbolo, tl(testo));
  return riga;
}

// Voce che coincide con un intero strato: la casella accende e spegne lo strato del pannello (e ne segue lo stato).
export function voceStrato(simbolo, testo, idStrato) {
  const strato = () => document.getElementById(`strato-${idStrato}`);
  const riga = voceFiltro(simbolo, testo, acceso => {
    const s = strato();
    if (s && s.checked !== acceso) { s.checked = acceso; s.dispatchEvent(new Event('change', { bubbles: true })); }
  }, Boolean(strato()?.checked), false);
  const casella = riga.querySelector('input');
  strato()?.addEventListener('change', e => { casella.checked = e.target.checked; });
  return riga;
}

// Filtro MapLibre «valore tra quelli attivi»; null se sono tutti attivi (nessun filtro).
export function filtroInsieme(espressione, attivi, totale) {
  return attivi.size >= totale ? null : ['in', espressione, ['literal', [...attivi]]];
}
