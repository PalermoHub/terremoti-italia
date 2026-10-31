// Mini-scala nella pillola «Legenda» chiusa: una barra a segmenti con i colori del modo «Colora per» in corso (età,
// magnitudo o profondità) e i due estremi scritti, così il colore dei cerchi si legge anche a legenda chiusa.
// Si riallinea al cambio di modo.
import { t } from './i18n.js';
import { CLASSI_MAGNITUDO } from './magnitudo.js';
import { CLASSI_PROFONDITA, etichettaClasseProfondita } from './profondita.js';
import { EVENTO_TEMA_MAGNITUDO, modoTema } from './tema-magnitudo.js';

// Colori e estremi della scala nel modo corrente. `coloriEta` = colori delle fasce d'età dal più recente
// (stanno nel layer dei terremoti: arrivano da fuori).
function scala(modo, coloriEta) {
  if (modo === 'magnitudo') {
    return { colori: CLASSI_MAGNITUDO.map(c => c.colore), da: `M ${CLASSI_MAGNITUDO[0].da}`, a: `M ${CLASSI_MAGNITUDO.at(-1).da}+` };
  }
  if (modo === 'profondita') {
    const ultima = CLASSI_PROFONDITA.length - 1;
    return { colori: CLASSI_PROFONDITA.map(c => c.colore), da: `${etichettaClasseProfondita(0)} km`, a: `${etichettaClasseProfondita(ultima)} km` };
  }
  return { colori: coloriEta, da: t('tema.mini.etaDa'), a: t('tema.mini.etaA') };
}

export function creaMiniScala(coloriEta) {
  const nodo = document.createElement('span');
  nodo.className = 'mini-scala';
  const da = document.createElement('span');
  const barra = document.createElement('span');
  barra.className = 'mini-scala-barra';
  barra.setAttribute('aria-hidden', 'true');
  const a = document.createElement('span');
  nodo.append(da, barra, a);
  const aggiorna = () => {
    const s = scala(modoTema(), coloriEta);
    da.textContent = s.da;
    a.textContent = s.a;
    barra.replaceChildren(...s.colori.map(colore => {
      const segmento = document.createElement('i');
      segmento.style.background = colore;
      return segmento;
    }));
  };
  document.addEventListener(EVENTO_TEMA_MAGNITUDO, aggiorna);
  aggiorna();
  return nodo;
}
