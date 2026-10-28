// Slider della magnitudo delle legende dei terremoti: due maniglie sullo stesso binario (minima e massima), i numeri
// scritti accanto e le tacche con i cerchi della scala. Scrive `magMin`/`magMax` nel filtro condiviso e avvisa con
// EVENTO_FILTRO: vale per tutti gli strati dei terremoti (tempo reale, storico, confronto). Sta nel blocco unico
// (legenda-magnitudo.js), che si allinea da solo perché legge lo stesso filtro.
import { t } from '../core/i18n.js';
import { SLIDER_MAGNITUDO, filtroMagnitudo, maniglieMagnitudo, raggioMagnitudo } from '../core/magnitudo.js';
import { filtro } from './scheda-terremoti.js';
import { EVENTO_FILTRO } from './scheda-terremoti-dom.js';

const OGNI = 2; // una tacca ogni due punti di magnitudo, fino al massimo della scala
const TACCHE = Array.from({ length: SLIDER_MAGNITUDO.max / OGNI + 1 }, (_, i) => i * OGNI);
const LATO_MANIGLIA = 16; // px: la corsa delle maniglie è lunga quanto il binario meno mezzo pollice per lato
const RAGGIO_TACCA = 1.5; // i cerchi delle tacche sono più piccoli di quelli in mappa, che a zoom 7,5 hanno il raggio pieno
const percento = v => (v - SLIDER_MAGNITUDO.min) / (SLIDER_MAGNITUDO.max - SLIDER_MAGNITUDO.min) * 100;
// Posizione lungo la corsa: la tacca (e la tratta accesa) sta sotto la sua magnitudo, con lo stesso margine del pollice
const corsa = v => `calc(${LATO_MANIGLIA / 2}px + (100% - ${LATO_MANIGLIA}px) * ${percento(v) / 100})`;

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

// Restituisce { nodo, sincronizza }: il nodo va nella legenda, `sincronizza` rilegge il filtro (lo chiama EVENTO_FILTRO).
export function creaSliderMagnitudo() {
  const nodo = el('div', 'slider-mag');
  nodo.setAttribute('role', 'group');
  nodo.setAttribute('aria-label', t('terremoti.slider.gruppo'));

  const testa = el('div', 'slider-mag-testa');
  testa.append(el('strong', 'slider-mag-titolo', t('terremoti.magMin')));
  const numeri = el('span', 'slider-mag-numeri');
  const campo = etichetta => {
    const i = el('input', 'slider-mag-numero');
    Object.assign(i, { type: 'number', min: String(SLIDER_MAGNITUDO.min), max: String(SLIDER_MAGNITUDO.max), step: String(SLIDER_MAGNITUDO.passo), inputMode: 'decimal' });
    i.setAttribute('aria-label', t(etichetta));
    return i;
  };
  const campoDa = campo('terremoti.slider.magMin');
  const campoA = campo('terremoti.slider.magMax');
  numeri.append(campoDa, el('span', 'slider-mag-trattino', '–'), campoA);
  testa.append(numeri);

  const pista = el('div', 'slider-mag-pista');
  const tratta = el('span', 'slider-mag-tratta');
  const maniglia = etichetta => {
    const i = el('input', 'slider-mag-maniglia');
    Object.assign(i, { type: 'range', min: String(SLIDER_MAGNITUDO.min), max: String(SLIDER_MAGNITUDO.max), step: String(SLIDER_MAGNITUDO.passo) });
    i.setAttribute('aria-label', t(etichetta));
    return i;
  };
  const inputDa = maniglia('terremoti.slider.magMin');
  const inputA = maniglia('terremoti.slider.magMax');
  pista.append(tratta, inputDa, inputA);

  const tacche = el('div', 'slider-mag-tacche');
  for (const v of TACCHE) {
    const tacca = el('span', 'slider-mag-tacca');
    const cerchio = el('span', 'slider-mag-cerchio');
    const d = Math.max(4, Math.round(raggioMagnitudo(v) * RAGGIO_TACCA));
    cerchio.style.width = cerchio.style.height = `${d}px`;
    tacca.style.left = corsa(v);
    tacca.append(cerchio, el('span', 'slider-mag-valore', String(v)));
    tacche.append(tacca);
  }
  nodo.append(testa, pista, tacche, el('p', 'slider-mag-nota', t('terremoti.slider.nota')));

  // Il filtro è uno solo per tutti gli strati: si scrivono le due estremità e si avvisa (mappa, elenco e tabella seguono)
  const scrivi = (da, a) => {
    Object.assign(filtro, filtroMagnitudo(da, a));
    document.dispatchEvent(new CustomEvent(EVENTO_FILTRO));
  };

  function sincronizza() {
    const { da, a } = maniglieMagnitudo(filtro.magMin, filtro.magMax);
    inputDa.value = String(da);
    inputA.value = String(a);
    campoDa.value = String(da);
    campoA.value = String(a);
    tratta.style.left = corsa(da);
    tratta.style.width = `calc((100% - ${LATO_MANIGLIA}px) * ${(percento(a) - percento(da)) / 100})`;
    nodo.dataset.attivo = String(da > SLIDER_MAGNITUDO.min || a < SLIDER_MAGNITUDO.max);
  }

  const dalleManiglie = () => {
    scrivi(Number(inputDa.value), Number(inputA.value));
    sincronizza();
  };
  inputDa.addEventListener('input', dalleManiglie);
  inputA.addEventListener('input', dalleManiglie);
  // i numeri scritti a mano si applicano a fine modifica (Invio o uscita dal campo): mentre si scrive la mappa non salta
  const dalCampo = (quale, valore) => {
    const v = Number(valore);
    if (valore === '' || !Number.isFinite(v)) { sincronizza(); return; }
    const { da, a } = maniglieMagnitudo(filtro.magMin, filtro.magMax);
    scrivi(quale === 'min' ? v : da, quale === 'max' ? v : a);
    sincronizza();
  };
  campoDa.addEventListener('change', () => dalCampo('min', campoDa.value));
  campoA.addEventListener('change', () => dalCampo('max', campoA.value));

  // il blocco condiviso segue la stessa fonte: se il nodo esce dal documento si stacca
  const segui = () => (nodo.isConnected ? sincronizza() : document.removeEventListener(EVENTO_FILTRO, segui));
  document.addEventListener(EVENTO_FILTRO, segui);
  sincronizza();
  return { nodo, sincronizza };
}
