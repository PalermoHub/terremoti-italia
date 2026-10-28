// Legende sotto lo strato, nel pannello Layer (come nei software GIS); a scelta si tengono tutte sulla mappa.
// Ogni modulo dichiara `legendaPannello` (selettore della propria legenda, anche per singolo strato): la legenda resta il nodo
// creato dal modulo (con i suoi filtri) e qui si sposta sotto il primo strato acceso del modulo. Con `legendaPerStrato` la legenda
// è un blocco unico di parti, ognuna con `data-legenda-strato="<id strato>"`: ogni parte va sotto il proprio strato.
// Le legende non dichiarate (tema per attributo, selezione, servizi esterni) restano sulla mappa.
import { t } from './i18n.js';

export const CHIAVE_SU_MAPPA = 'dt-legende-mappa';
export const SOGLIA_VOCI = 6; // oltre questo numero di voci la legenda parte ripiegata
export const EVENTO_LEGENDE = 'dt:legende'; // sul document: qualcuno ha cambiato dove sta una legenda, si riposiziona subito

// Strati con la legenda in mappa anche con «Legende sulla mappa» spento: la legenda che non si può tenere nel pannello
// (es. il tema magnitudo dei terremoti, che prende il posto di quella dell'età). Restituisce true se lo stato è cambiato.
const forzate = new Set();
export function forzaLegendaSuMappa(idStrato, forza) {
  const aveva = forzate.has(idStrato);
  if (forza) forzate.add(idStrato); else forzate.delete(idStrato);
  return aveva !== Boolean(forza);
}

// Legende dichiarate dai moduli: [{ selettore, strati: [id…] }]. Lo strato può avere la sua legenda, altrimenti vale quella del modulo.
export function raccogliLegende(moduli) {
  const per = new Map();
  for (const m of moduli) for (const s of m.strati ?? []) {
    const selettore = s.legendaPannello ?? (m.legendaPerStrato ? `[data-legenda-strato="${s.id}"]` : m.legendaPannello);
    if (selettore) per.set(selettore, [...(per.get(selettore) ?? []), s.id]);
  }
  return [...per].map(([selettore, strati]) => ({ selettore, strati }));
}

// Primo strato del modulo che è acceso: sotto di lui sta la legenda (null se nessuno).
export const stratoDellaLegenda = (strati, acceso) => strati.find(acceso) ?? null;

// Strato acceso dal Chat bot: la sua legenda sta sulla mappa (marcatore sulla casella, tolto quando lo strato si spegne).
export const stratoSuMappa = id => Boolean(id && globalThis.document?.getElementById(`strato-${id}`)?.dataset.legendaMappa);

export const legendaAperta = voci => voci <= SOGLIA_VOCI;

const contaVoci = nodo => nodo.querySelectorAll('label, li, tr, .legenda-esterna-classe, .sicurezza-sezione > *').length;

function involucro(nodo, aperti, casa) {
  let d = aperti.get(nodo);
  if (d) return d;
  d = document.createElement('details');
  d.className = 'legenda-in-pannello';
  d.open = legendaAperta(contaVoci(nodo));
  const titolo = document.createElement('summary');
  // una parte può darsi il proprio titolo (es. «Magnitudo»): sotto lo stesso strato due «Legenda» sarebbero indistinguibili
  titolo.textContent = nodo.dataset.legendaTitolo || t('legenda.pannello.titolo');
  d.append(titolo);
  // una parte di legenda porta con sé le classi della legenda d'origine (gli stili sono scritti con quei discendenti)
  const parte = !nodo.classList.contains('legenda');
  d._guscio = parte ? Object.assign(document.createElement('div'), { className: `legenda ${[...casa.classList].filter(c => c !== 'legenda' && !c.startsWith('lg-')).join(' ')}` }) : null;
  if (parte) d.append(d._guscio);
  aperti.set(nodo, d);
  return d;
}

// Un contenitore senza più parti da vedere (spostate sotto gli strati o nascoste; restano solo titolo e note) non va mostrato sulla mappa.
const vuota = casa => ![...casa.children].some(n => !n.hidden && !n.matches('strong, p, small'));

// `contenitore` = #legende sulla mappa; `occhio` = l'icona a occhio degli interruttori del pannello. Restituisce l'interruttore da inserire.
export function collegaLegendePannello({ legende, contenitore, layer, occhio, storage = null }) {
  let suMappa = false;
  try { suMappa = storage?.getItem(CHIAVE_SU_MAPPA) === '1'; } catch { /* storage bloccato: vale la sessione */ }
  const aperti = new WeakMap();
  const noti = new Map(); // nodo -> voce: anche quelli staccati dal documento (il gruppo RNDT ridisegna le sue righe e porta via gli involucri)
  const case_ = new WeakMap(); // nodo -> contenitore d'origine, dove torna con le legende sulla mappa
  const acceso = id => Boolean(document.getElementById(`strato-${id}`)?.checked);

  function riposa(nodo, voce) {
    if (!case_.has(nodo)) case_.set(nodo, nodo.parentElement ?? contenitore);
    const casa = case_.get(nodo);
    const d = aperti.get(nodo);
    const primo = stratoDellaLegenda(voce.strati, acceso);
    const strato = suMappa || stratoSuMappa(primo) || forzate.has(primo) ? null : primo;
    const etichetta = strato && document.getElementById(`strato-${strato}`)?.closest('label');
    const riga = (etichetta?.parentElement?.classList.contains('rndt-gruppo-riga') ? etichetta.parentElement : etichetta)?.nextElementSibling; // nel gruppo RNDT la riga è un contenitore con il pulsante «Rimuovi»
    if (!riga) { // sulla mappa: il nodo torna dov'era, fuori dall'involucro
      if (nodo.parentElement !== casa) casa.append(nodo);
      d?.remove();
    } else {
      const dove = involucro(nodo, aperti, casa);
      const posto = dove._guscio ?? dove;
      if (nodo.parentElement !== posto) posto.append(nodo);
      if (dove.previousElementSibling !== riga) riga.after(dove);
    }
    casa.classList.toggle('legenda-vuota', casa !== contenitore && vuota(casa));
  }

  // Le parti marcate `data-legenda-strato` (anche quelle create dopo, come le legende dei layer di servizi esterni) hanno lo strato
  // nel marcatore; quelle dichiarate dai moduli lo hanno nell'elenco.
  function aggiorna() {
    for (const c of document.querySelectorAll('input[data-legenda-mappa]')) if (!c.checked) delete c.dataset.legendaMappa; // spento dal pannello
    const fatti = new Set();
    const vai = (nodo, voce) => { if (!fatti.has(nodo)) { fatti.add(nodo); noti.set(nodo, voce); riposa(nodo, voce); } };
    for (const voce of legende) {
      const nodo = document.querySelector(voce.selettore);
      if (nodo) vai(nodo, voce);
    }
    for (const nodo of document.querySelectorAll('[data-legenda-strato]')) vai(nodo, { strati: [nodo.dataset.legendaStrato] });
    for (const [nodo, voce] of noti) {
      if (!nodo.isConnected && !nodo.parentElement) noti.delete(nodo); // legenda rimossa con il suo layer
      else vai(nodo, voce);
    }
    // involucri rimasti senza legenda (layer rimosso): via
    for (const d of document.querySelectorAll('.legenda-in-pannello')) if (d.children.length === 1 || (d._guscio && !d._guscio.firstChild)) d.remove();
  }

  // interruttore «Legende sulla mappa»: stessa forma di «Tooltip sulla mappa» (la mette il pannello sotto «Cerca strato»)
  const interruttore = document.createElement('label');
  interruttore.classList.add('strato', 'interruttore-tip');
  const casella = document.createElement('input');
  casella.type = 'checkbox';
  casella.dataset.filtro = 'legende-mappa'; // non è uno strato: non va nei conteggi degli strati accesi
  casella.checked = suMappa;
  casella.addEventListener('change', () => {
    suMappa = casella.checked;
    try { storage?.setItem(CHIAVE_SU_MAPPA, suMappa ? '1' : '0'); } catch { /* si perde solo la preferenza */ }
    aggiorna();
  });
  interruttore.append(casella, occhio(), ' ', t('legenda.pannello.suMappa'));

  // le legende nascono e si accendono con gli strati: si segue la loro comparsa e lo stato `hidden`
  let atteso = false;
  const rinvia = () => { if (atteso) return; atteso = true; queueMicrotask(() => { atteso = false; aggiorna(); }); };
  document.addEventListener('change', rinvia);
  document.addEventListener(EVENTO_LEGENDE, rinvia);
  const osservatore = new MutationObserver(rinvia);
  osservatore.observe(contenitore, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  osservatore.observe(layer ?? document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  aggiorna();
  return { aggiorna, interruttore };
}
