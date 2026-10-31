// Mini-scala nella pillola «Legenda» chiusa: una barra a segmenti con i colori del modo «Colora per» in corso (età,
// magnitudo o profondità), così il colore dei cerchi si legge anche a legenda chiusa. Magnitudo e profondità hanno i due
// estremi scritti ai lati; l'età ha i limiti scritti sotto ogni segmento (fasce di durata molto diversa: 1 h, 23 h, 2 giorni…).
// Si riallinea al cambio di modo.
import { CLASSI_MAGNITUDO } from './magnitudo.js';
import { CLASSI_PROFONDITA, etichettaClasseProfondita } from './profondita.js';
import { EVENTO_TEMA_MAGNITUDO, modoTema } from './tema-magnitudo.js';

const ORA_MS = 3600000;

// Limite scritto sotto una fascia d'età: «<1 h», «<24 h», «<72 h», «≥72 h» (l'ultima non ha limite: parte dal precedente)
const limiteEta = (fasce, i) => (Number.isFinite(fasce[i].finoA) ? `<${fasce[i].finoA / ORA_MS} h` : `≥${fasce[i - 1].finoA / ORA_MS} h`);

// Colori e testi della scala nel modo corrente. `fasce` = fasce d'età dal più recente (colore, finoA in ms):
// stanno nel layer dei terremoti, arrivano da fuori.
function scala(modo, fasce) {
  if (modo === 'magnitudo') {
    return { colori: CLASSI_MAGNITUDO.map(c => c.colore), da: `M ${CLASSI_MAGNITUDO[0].da}`, a: `M ${CLASSI_MAGNITUDO.at(-1).da}+` };
  }
  if (modo === 'profondita') {
    const ultima = CLASSI_PROFONDITA.length - 1;
    return { colori: CLASSI_PROFONDITA.map(c => c.colore), da: `${etichettaClasseProfondita(0)} km`, a: `${etichettaClasseProfondita(ultima)} km` };
  }
  return { colori: fasce.map(f => f.colore), limiti: fasce.map((_, i) => limiteEta(fasce, i)) };
}

export function creaMiniScala(fasce) {
  const nodo = document.createElement('span');
  nodo.className = 'mini-scala';
  const da = document.createElement('span');
  const barra = document.createElement('span');
  barra.className = 'mini-scala-barra';
  barra.setAttribute('aria-hidden', 'true');
  const limiti = document.createElement('span');
  limiti.className = 'mini-scala-limiti';
  const corpo = document.createElement('span');
  corpo.className = 'mini-scala-corpo';
  corpo.append(barra, limiti);
  const a = document.createElement('span');
  nodo.append(da, corpo, a);
  const aggiorna = () => {
    const s = scala(modoTema(), fasce);
    nodo.classList.toggle('mini-scala-eta', Boolean(s.limiti));
    da.hidden = a.hidden = Boolean(s.limiti);
    da.textContent = s.da ?? '';
    a.textContent = s.a ?? '';
    barra.replaceChildren(...s.colori.map(colore => {
      const segmento = document.createElement('i');
      segmento.style.background = colore;
      return segmento;
    }));
    limiti.replaceChildren(...(s.limiti ?? []).map(testo => {
      const limite = document.createElement('span');
      limite.textContent = testo;
      return limite;
    }));
  };
  document.addEventListener(EVENTO_TEMA_MAGNITUDO, aggiorna);
  aggiorna();
  return nodo;
}
