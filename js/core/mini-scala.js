// Mini-scala nella pillola «Legenda» chiusa: una barra a segmenti con i colori del modo «Tematizza per» in corso (età,
// magnitudo o profondità), così il colore dei cerchi si legge anche a legenda chiusa. Il valore di ogni classe è scritto
// dentro il segmento (età: limite della fascia, es. «<1 h»; magnitudo e profondità: soglia di partenza), così la barra è alta e il tocco comodo.
// Si riallinea al cambio di modo. I segmenti sono filtri come le voci della legenda aperta (stesso `dopoClic`: un tocco isola la
// classe, un secondo tocco sull'unica accesa le riaccende tutte) e ne seguono lo stato.
import { t, tl } from './i18n.js';
import { dopoClic } from './legenda.js';
import { CLASSI_MAGNITUDO } from './magnitudo.js';
import { CLASSI_PROFONDITA, etichettaClasseProfondita } from './profondita.js';
import { EVENTO_TEMA_MAGNITUDO, modoTema } from './tema-magnitudo.js';

const ORA_MS = 3600000;

// Limite scritto sotto una fascia d'età: «<1 h», «<24 h», «<72 h», «≥72 h» (l'ultima non ha limite: parte dal precedente)
const limiteEta = (fasce, i) => (Number.isFinite(fasce[i].finoA) ? `<${fasce[i].finoA / ORA_MS} h` : `≥${fasce[i - 1].finoA / ORA_MS} h`);

// Colori, nomi (tooltip dei segmenti) e testi della scala nel modo corrente. `fasce` = fasce d'età dal più recente (nome, colore, finoA in ms):
// stanno nel layer dei terremoti, arrivano da fuori.
export function scala(modo, fasce) {
  if (modo === 'magnitudo') {
    return { colori: CLASSI_MAGNITUDO.map(c => c.colore), nomi: CLASSI_MAGNITUDO.map(c => t(`terremoti.ev.mag.${c.chiave}`)), da: `M ${CLASSI_MAGNITUDO[0].da}`, a: `M ${CLASSI_MAGNITUDO.at(-1).da}+` };
  }
  if (modo === 'profondita') {
    const ultima = CLASSI_PROFONDITA.length - 1;
    return { colori: CLASSI_PROFONDITA.map(c => c.colore), nomi: CLASSI_PROFONDITA.map((_, i) => `${etichettaClasseProfondita(i)} km`), da: `${etichettaClasseProfondita(0)} km`, a: `${etichettaClasseProfondita(ultima)} km` };
  }
  return { colori: fasce.map(f => f.colore), nomi: fasce.map((f, i) => `${tl(f.nome)} (${limiteEta(fasce, i)})`), limiti: fasce.map((_, i) => limiteEta(fasce, i)) };
}

// Testo scritto dentro ogni segmento: corto, perché con 10 classi di profondità ognuno è largo ~30 px (il nome del modo sta già sopra)
function etichetteSegmenti(modo, s) {
  if (s.limiti) return s.limiti;
  if (modo === 'magnitudo') return CLASSI_MAGNITUDO.map((c, i) => (i === CLASSI_MAGNITUDO.length - 1 ? `${c.da}+` : String(c.da)));
  const ultima = CLASSI_PROFONDITA.length - 1;
  return CLASSI_PROFONDITA.map((c, i) => (i === 0 ? `<${c.fino}` : i === ultima ? `≥${CLASSI_PROFONDITA[i - 1].fino}` : String(CLASSI_PROFONDITA[i - 1].fino)));
}

// Testo chiaro o scuro, a seconda della luminanza del colore del segmento (#rrggbb)
const testoSu = colore => {
  const [r, g, b] = [1, 3, 5].map(k => parseInt(colore.slice(k, k + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1a1a1a' : '#fff';
};

// Restituisce i nodi da mettere nella pillola: il nome di ciò che i colori rappresentano e la scala.
// `filtri` = per modo (eta, magnitudo, profondita) `{ accese(): Set d'indici | null (tutte), imposta(Set | null) }`; `evento` = quello che
// il layer lancia a ogni cambio di filtro (la scala si ridisegna).
export function creaMiniScala(fasce, filtri = {}, evento = null) {
  const modoNome = document.createElement('span');
  modoNome.className = 'mini-scala-modo';
  const nodo = document.createElement('span');
  nodo.className = 'mini-scala';
  const da = document.createElement('span');
  const barra = document.createElement('span');
  barra.className = 'mini-scala-barra';
  barra.setAttribute('aria-hidden', 'true');
  const corpo = document.createElement('span');
  corpo.className = 'mini-scala-corpo';
  corpo.append(barra);
  const a = document.createElement('span');
  nodo.append(da, corpo, a);
  const aggiorna = () => {
    const modo = modoTema();
    const s = scala(modo, fasce);
    const nome = t(`tema.mini.modo.${modo}`);
    modoNome.textContent = nome;
    nodo.dataset.modo = modo; // il CSS dà a ogni segmento la larghezza adatta al numero di classi
    nodo.classList.toggle('mini-scala-eta', Boolean(s.limiti));
    da.hidden = a.hidden = true; // gli estremi ora sono scritti dentro i segmenti
    const testi = etichetteSegmenti(modo, s);
    barra.replaceChildren(...s.colori.map((colore, i) => {
      const segmento = document.createElement('i');
      segmento.style.background = colore;
      segmento.style.color = testoSu(colore);
      segmento.textContent = testi[i];
      const filtro = filtri[modo];
      if (filtro) {
        const accese = filtro.accese();
        segmento.classList.toggle('spento', Boolean(accese) && !accese.has(i));
        segmento.tabIndex = 0;
        segmento.setAttribute('role', 'button');
        segmento.setAttribute('aria-pressed', String(!accese || accese.has(i)));
        segmento.setAttribute('aria-label', `${nome}: ${s.nomi[i]}`);
        const attiva = e => {
          e.stopPropagation(); // la pillola è un pulsante che apre la legenda: il tocco sul segmento filtra soltanto
          const prima = s.colori.map((_, j) => !filtro.accese() || filtro.accese().has(j));
          const indici = dopoClic(prima, i).flatMap((acceso, j) => (acceso ? [j] : []));
          filtro.imposta(indici.length === s.colori.length ? null : new Set(indici));
        };
        segmento.addEventListener('click', attiva);
        segmento.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); attiva(e); } });
      }
      segmento.title = `${nome}: ${s.nomi[i]}`; // il valore della classe al passaggio del mouse
      return segmento;
    }));
  };
  document.addEventListener(EVENTO_TEMA_MAGNITUDO, aggiorna);
  if (evento) document.addEventListener(evento, aggiorna);
  aggiorna();
  return [modoNome, nodo];
}
