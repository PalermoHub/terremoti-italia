// Mini-scala nella pillola «Legenda» chiusa: una barra a segmenti con i colori del modo «Colora per» in corso (età,
// magnitudo o profondità), così il colore dei cerchi si legge anche a legenda chiusa. Si riallinea al cambio di modo.
import { CLASSI_MAGNITUDO } from './magnitudo.js';
import { CLASSI_PROFONDITA } from './profondita.js';
import { EVENTO_TEMA_MAGNITUDO, modoTema } from './tema-magnitudo.js';

// `coloriEta` = colori delle fasce d'età dal più recente (stanno nel layer dei terremoti: arrivano da fuori)
export function creaMiniScala(coloriEta) {
  const nodo = document.createElement('span');
  nodo.className = 'mini-scala';
  nodo.setAttribute('aria-hidden', 'true');
  const aggiorna = () => {
    const modo = modoTema();
    const colori = modo === 'magnitudo' ? CLASSI_MAGNITUDO.map(c => c.colore) : modo === 'profondita' ? CLASSI_PROFONDITA.map(c => c.colore) : coloriEta;
    nodo.replaceChildren(...colori.map(colore => {
      const segmento = document.createElement('i');
      segmento.style.background = colore;
      return segmento;
    }));
  };
  document.addEventListener(EVENTO_TEMA_MAGNITUDO, aggiorna);
  aggiorna();
  return nodo;
}
