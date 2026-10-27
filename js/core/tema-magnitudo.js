// Tema «magnitudo» dei terremoti: i cerchi in mappa si colorano per classe di magnitudo invece che per età, e la legenda
// dello strato diventa la scala delle magnitudo, con una riga per classe che accende e spegne la classe sulla mappa.
// Il filtro è lo stesso dell'istogramma «Eventi per magnitudo» (`filtro.classi`): mappa, grafici e conteggi restano
// d'accordo, e la legenda prende il posto di quella dell'età (che non descriverebbe più i colori).
// Si accende dal gruppo «Overlay informativi» del tab Layer; il valore sta in localStorage (spento se mai scelto).
// Il browser arriva come parametro.
import { t } from './i18n.js';
import { dopoClic } from './legenda.js';
import { EVENTO_LEGENDE, forzaLegendaSuMappa } from './legenda-pannello.js';
import { CLASSI_MAGNITUDO } from './magnitudo.js';

export const CHIAVE_TEMA_MAGNITUDO = 'dt-tema-magnitudo';
export const EVENTO_TEMA_MAGNITUDO = 'dt:tema-magnitudo'; // sul document a ogni cambio di stato: mappa, legenda e interruttore si allineano

let attivo = false;
export const temaMagnitudoAttivo = () => attivo;

export function caricaTemaMagnitudo(storage) {
  try { attivo = storage?.getItem(CHIAVE_TEMA_MAGNITUDO) === '1'; } catch { attivo = false; }
  return attivo;
}

export function impostaTemaMagnitudo(v, storage = null) {
  attivo = Boolean(v);
  try { storage?.setItem(CHIAVE_TEMA_MAGNITUDO, attivo ? '1' : '0'); } catch { /* storage bloccato: vale la sessione */ }
  document.dispatchEvent(new Event(EVENTO_TEMA_MAGNITUDO));
  return attivo;
}

// Righe della legenda, una per classe: il clic isola la classe (come le fasce d'età che sostituiscono), il secondo clic
// rimostra tutte. `accese()` = Set degli indici accesi, null per tutte; `suCambio(insieme)` riceve il nuovo Set o null.
export function creaClassiFiltro({ accese, suCambio }) {
  const nodo = document.createElement('div');
  nodo.className = 'legenda-magnitudo-classi';
  nodo.title = t('tema.magnitudo.scala');
  const righe = CLASSI_MAGNITUDO.map((classe, i) => {
    const riga = document.createElement('label');
    riga.className = 'legenda-magnitudo-riga';
    const casella = document.createElement('input');
    casella.type = 'checkbox';
    const simbolo = document.createElement('span');
    simbolo.className = 'legenda-magnitudo-casella';
    const cerchio = document.createElement('i');
    cerchio.className = 'legenda-magnitudo-cerchio';
    cerchio.style.width = cerchio.style.height = `${classe.raggio * 2}px`;
    cerchio.style.color = classe.colore;
    simbolo.append(cerchio);
    const testo = document.createElement('span');
    testo.textContent = t(`terremoti.ev.mag.${classe.chiave}`);
    riga.append(casella, simbolo, testo);
    casella.addEventListener('change', () => {
      const prima = CLASSI_MAGNITUDO.map((_, j) => (j === i ? !casella.checked : (accese()?.has(j) ?? true)));
      const dopo = dopoClic(prima, i);
      const indici = dopo.flatMap((acceso, j) => (acceso ? [j] : []));
      suCambio(indici.length === CLASSI_MAGNITUDO.length ? null : new Set(indici));
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
  const primo = temaMagnitudoAttivo() ? STRATI_TERREMOTI.find(id => document.getElementById(`strato-${id}`)?.checked) ?? null : null;
  let cambiato = false;
  for (const id of STRATI_TERREMOTI) if (forzaLegendaSuMappa(id, id === primo)) cambiato = true;
  if (cambiato) document.dispatchEvent(new Event(EVENTO_LEGENDE));
  return primo;
}

// Interruttore del gruppo «Overlay informativi» (tab Layer): stessa forma di «Tooltip sulla mappa»; `occhio` è l'icona
// degli altri interruttori. È un tema, non uno strato: non entra nei conteggi degli strati accesi.
export function creaInterruttorePannello(occhio, storage = null) {
  const etichetta = document.createElement('label');
  etichetta.classList.add('strato', 'interruttore-tip');
  etichetta.title = t('tema.magnitudo.descrizione');
  const casella = document.createElement('input');
  casella.type = 'checkbox';
  casella.id = 'interruttore-tema-magnitudo';
  casella.dataset.filtro = 'tema-magnitudo';
  casella.checked = attivo;
  casella.addEventListener('change', () => impostaTemaMagnitudo(casella.checked, storage));
  document.addEventListener(EVENTO_TEMA_MAGNITUDO, () => { casella.checked = attivo; });
  etichetta.append(casella, occhio(), ' ', t('tema.magnitudo.interruttore'));
  return etichetta;
}