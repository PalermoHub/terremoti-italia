// Tema dei colori dei terremoti: i cerchi in mappa si colorano per età (modo di partenza), per classe di magnitudo o per
// fascia di profondità, e la legenda dello strato diventa la scala scelta, con una riga per classe che accende e spegne
// la classe sulla mappa. In tutti i modi il cerchio è grande quanto la magnitudo.
// Il filtro per magnitudo è lo stesso dell'istogramma «Eventi per magnitudo» (`filtro.classi`), quello per profondità è
// `filtro.fasce`: mappa, grafici e conteggi restano d'accordo, e la legenda prende il posto di quella dell'età (che non
// descriverebbe più i colori).
// Si sceglie dal gruppo «Overlay informativi» del tab Layer; il valore sta in localStorage (età se mai scelto).
// Il browser arriva come parametro.
import { t } from './i18n.js';
import { dopoClic } from './legenda.js';
import { EVENTO_LEGENDE, forzaLegendaSuMappa } from './legenda-pannello.js';
import { CLASSI_MAGNITUDO, espressioneColoreMagnitudo } from './magnitudo.js';
import { CLASSI_PROFONDITA, espressioneColoreProfondita, etichettaClasseProfondita } from './profondita.js';

export const CHIAVE_TEMA_MAGNITUDO = 'dt-tema-magnitudo'; // nome storico: '1' = magnitudo, '0' = età, 'profondita'
export const EVENTO_TEMA_MAGNITUDO = 'dt:tema-magnitudo'; // sul document a ogni cambio di modo: mappa, legenda e menu si allineano
export const MODI_TEMA = ['eta', 'magnitudo', 'profondita'];

let modo = 'eta';
export const modoTema = () => modo;
export const temaAttivo = () => modo !== 'eta'; // i colori d'età o d'anno non descrivono più la mappa
export const temaMagnitudoAttivo = () => modo === 'magnitudo';
export const temaProfonditaAttivo = () => modo === 'profondita';

// Colore dei cerchi nel modo corrente, o null se vale quello d'età
export const espressioneColoreTema = () => (modo === 'magnitudo' ? espressioneColoreMagnitudo() : modo === 'profondita' ? espressioneColoreProfondita() : null);

// Titolo dello strato nel modo corrente: «Terremoti in tempo reale · magnitudo (M)», «… · profondità (km)»
export const titoloTema = nome => (temaAttivo() ? t(`tema.${modo}.titoloStrato`, { nome }) : nome);
// Bordo dei cerchi: del colore del riempimento, ma bianco per profondità (le fasce estreme sono quasi nere su mappa scura)
export const BORDO_PROFONDITA = 'rgba(255,255,255,0.85)';
export const bordoTema = colore => (modo === 'profondita' ? BORDO_PROFONDITA : colore);

export function caricaTema(storage) {
  let v = null;
  try { v = storage?.getItem(CHIAVE_TEMA_MAGNITUDO); } catch { /* storage bloccato */ }
  modo = v === '1' ? 'magnitudo' : MODI_TEMA.includes(v) ? v : 'eta';
  return modo;
}
export const caricaTemaMagnitudo = storage => { caricaTema(storage); return temaMagnitudoAttivo(); };

export function impostaTema(nuovo, storage = null) {
  modo = MODI_TEMA.includes(nuovo) ? nuovo : 'eta';
  try { storage?.setItem(CHIAVE_TEMA_MAGNITUDO, modo === 'magnitudo' ? '1' : modo === 'eta' ? '0' : modo); } catch { /* storage bloccato: vale la sessione */ }
  document.dispatchEvent(new Event(EVENTO_TEMA_MAGNITUDO));
  return modo;
}
export const impostaTemaMagnitudo = (v, storage = null) => impostaTema(v ? 'magnitudo' : 'eta', storage) === 'magnitudo';

// Voci di legenda per modo: testo, colore e diametro del cerchio in pixel. La magnitudo ha anche la sua scala dei raggi.
const vociMagnitudo = () => CLASSI_MAGNITUDO.map(c => ({ testo: t(`terremoti.ev.mag.${c.chiave}`), colore: c.colore, diametro: c.raggio * 2 }));
const vociProfondita = () => CLASSI_PROFONDITA.map((c, i) => ({ testo: `${etichettaClasseProfondita(i)} km`, colore: c.colore, diametro: 12, pieno: true }));
export const VOCI_TEMA = { magnitudo: vociMagnitudo, profondita: vociProfondita };

// Righe della legenda, una per classe: il clic isola la classe (come le fasce d'età che sostituiscono), il secondo clic
// rimostra tutte. `accese()` = Set degli indici accesi, null per tutte; `suCambio(insieme)` riceve il nuovo Set o null.
// `voci` = voci di legenda (di partenza quelle della magnitudo).
export function creaClassiFiltro({ accese, suCambio, voci = vociMagnitudo(), titolo = t('tema.magnitudo.scala') }) {
  const nodo = document.createElement('div');
  nodo.className = 'legenda-magnitudo-classi';
  nodo.title = titolo;
  const righe = voci.map((classe, i) => {
    const riga = document.createElement('label');
    riga.className = 'legenda-magnitudo-riga';
    const casella = document.createElement('input');
    casella.type = 'checkbox';
    const simbolo = document.createElement('span');
    simbolo.className = 'legenda-magnitudo-casella';
    const cerchio = document.createElement('i');
    cerchio.className = classe.pieno ? 'legenda-magnitudo-cerchio legenda-magnitudo-cerchio-pieno' : 'legenda-magnitudo-cerchio';
    cerchio.style.width = cerchio.style.height = `${classe.diametro}px`;
    cerchio.style.color = classe.colore;
    simbolo.append(cerchio);
    const testo = document.createElement('span');
    testo.textContent = classe.testo;
    riga.append(casella, simbolo, testo);
    casella.addEventListener('change', () => {
      const prima = voci.map((_, j) => (j === i ? !casella.checked : (accese()?.has(j) ?? true)));
      const dopo = dopoClic(prima, i);
      const indici = dopo.flatMap((acceso, j) => (acceso ? [j] : []));
      suCambio(indici.length === voci.length ? null : new Set(indici));
      sincronizza();
    });
    nodo.append(riga);
    return casella;
  });
  const sincronizza = () => {
    const a = accese();
    righe.forEach((casella, i) => { casella.checked = !a || a.has(i); });
  };
  sincronizza();
  return { nodo, sincronizza };
}

// Strati dei terremoti: cerchi grandi quanto la magnitudo e colorati dal tema. Con il tema acceso la legenda in mappa è
// una sola, quella del primo strato acceso; le altre restano nel pannello sotto il loro strato, con i comandi che portano
// (anno dell'archivio, confronto tra due anni, filtri del tempo).
export const STRATI_TERREMOTI = ['terremoti', 'terremoti-storico', 'terremoti-confronto'];

export function aggiornaLegendaInMappa() {
  const primo = temaAttivo() ? STRATI_TERREMOTI.find(id => document.getElementById(`strato-${id}`)?.checked) ?? null : null;
  let cambiato = false;
  for (const id of STRATI_TERREMOTI) if (forzaLegendaSuMappa(id, id === primo)) cambiato = true;
  if (cambiato) document.dispatchEvent(new Event(EVENTO_LEGENDE));
  return primo;
}

// Riga «Tematizza per» del pannello Colori (la tavolozza accanto all'opacità) dei tre strati dei terremoti: stessa forma delle
// altre righe del pannello. Il modo è uno solo per tutti gli strati, quindi le righe si allineano tra loro.
export function creaRigaColore(storage = null) {
  const riga = document.createElement('label');
  riga.className = 'tema-riga tema-colora-per';
  riga.title = t('tema.colore.descrizione');
  const testo = document.createElement('span');
  testo.textContent = t('tema.colore.etichetta');
  const menu = document.createElement('select');
  menu.dataset.filtro = 'tema-colore';
  for (const m of MODI_TEMA) {
    const voce = document.createElement('option');
    voce.value = m;
    voce.textContent = t(`tema.colore.${m}`);
    menu.append(voce);
  }
  menu.value = modo;
  menu.addEventListener('change', () => impostaTema(menu.value, storage));
  document.addEventListener(EVENTO_TEMA_MAGNITUDO, () => { menu.value = modo; });
  riga.append(testo, menu);
  return riga;
}
